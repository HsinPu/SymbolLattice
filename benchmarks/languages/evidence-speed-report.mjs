import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ARTIFACT_LANGUAGES } from "../../dist/domain/types.js";
import { getSourceLanguage } from "../../dist/infrastructure/filesystem/discovery.js";
import { NONEMPTY_EXPECTATIONS } from "./nonempty-depth-scorer.mjs";
import { scoreTask, verifySourceExcerpts } from "../mcp/task-retrieval.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const count = (values, key) => values.reduce((sum, value) => sum + value[key], 0);
const coverage = (found, total) => total > 0 ? `${found}/${total}` : "未測量";
const versionParts = (version) => {
  assert.match(version, /^\d+\.\d+\.\d+$/u);
  return version.split(".").map(Number);
};
const notNewer = (measured, current) => {
  const left = versionParts(measured), right = versionParts(current);
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return true;
};

/** Summarize saved evidence; this tool executes no product query or index write. */
export function buildEvidenceSpeedReport({ depthPath, qualityPath, timingPath, identityPath, baselineIdentityPath, auditDocument, outputPath, updatedOn }) {
  assert.match(updatedOn, /^\d{4}-\d{2}-\d{2}$/u);
  const depth = readJson(depthPath), quality = readJson(qualityPath);
  const timing = readJson(timingPath), identity = readJson(identityPath), baselineIdentity = readJson(baselineIdentityPath);
  const currentVersion = readJson(join(ROOT, "package.json")).version;
  const measuredVersion = quality.version;
  assert.ok(notNewer(measuredVersion, currentVersion), "Measurements are newer than the documented product");
  assert.equal(depth.passed, true, "Depth gate did not pass");
  assert.equal(depth.contentGate.strictPassed, true, "Minimum content gate did not pass");
  assert.equal(quality.complete, true, "Retrieval validation is incomplete");
  assert.equal(timing.complete, true, "Timing run is incomplete");
  for (const version of [depth.productVersion, depth.product.version, timing.version, identity.version]) {
    assert.equal(version, measuredVersion, "Input product versions differ");
  }
  assert.equal(timing.baseline, identity.baselineVersion);
  assert.equal(baselineIdentity.version, identity.baselineVersion);
  assert.equal(resolve(baselineIdentity.candidate), resolve(identity.baseline));
  assert.equal(readJson(join(identity.baseline, "package.json")).version, identity.baselineVersion);
  assert.equal(readJson(join(identity.candidate, "package.json")).version, measuredVersion);
  for (const build of [baselineIdentity, identity]) {
    assert.ok(build.files.length > 0, "Frozen build has no file identities");
    for (const file of build.files) {
      const path = resolve(build.candidate, file.file);
      assert.ok(!relative(build.candidate, path).startsWith(".."), "Build file escaped frozen root");
      assert.equal(hash(readFileSync(path)), file.candidateSha256, "Frozen build changed");
    }
  }
  for (const corpus of identity.corpora) {
    const git = (...args) => execFileSync("git", ["-c", `safe.directory=${corpus.project.replaceAll("\\", "/")}`, ...args],
      { cwd: corpus.project, encoding: "utf8" }).trim();
    assert.equal(git("rev-parse", "HEAD"), corpus.commit, "Pinned corpus commit changed");
    assert.equal(git("status", "--porcelain", "--untracked-files=no"), "", "Pinned corpus tracked source changed");
  }
  assert.match(readFileSync(resolve(ROOT, auditDocument), "utf8").split(/\r?\n/u)[0],
    new RegExp(`v${measuredVersion.replaceAll(".", "\\.")}\\b`, "u"), "Audit describes a different measured product");
  assert.deepEqual(depth.matrix.map((row) => row.language), ARTIFACT_LANGUAGES);
  assert.deepEqual(depth.contentGate.rows.map((row) => row.language), ARTIFACT_LANGUAGES);
  assert.ok(depth.contentGate.rows.every((row) => row.accepted && row.errors.length === 0));
  assert.equal(depth.runtimeSmoke.fileIdentityPassed, ARTIFACT_LANGUAGES.length);
  assert.equal(depth.runtimeSmoke.scannedDocuments, ARTIFACT_LANGUAGES.length);
  assert.equal(depth.runtimeSmoke.failures.length, 0);
  assert.equal(depth.contentGate.expectationSha256, hash(JSON.stringify(NONEMPTY_EXPECTATIONS)), "Minimum truth changed");
  assert.equal(quality.tasks, quality.reports.length);
  assert.equal(new Set(quality.reports.map((row) => `${row.name}:${row.id}`)).size, quality.tasks);
  assert.equal(new Set(quality.reports.map((row) => row.name)).size, quality.manifests);

  const manifests = new Map(), reports = new Map();
  const sources = new Map(), byLanguage = new Map(), taskLanguages = new Map();
  const corpusFor = (row) => {
    const corpus = identity.corpora.find((item) => item.name === row.repo);
    assert.ok(corpus, `Missing pinned corpus: ${row.repo}`);
    return corpus;
  };
  const source = (corpus, file) => {
    const path = resolve(corpus.project, file);
    const inside = relative(corpus.project, path);
    assert.ok(inside && !inside.startsWith("..") && !inside.includes(":"), "Source escaped the pinned checkout");
    if (!sources.has(path)) sources.set(path, readFileSync(path, "utf8"));
    return sources.get(path);
  };
  for (const row of quality.reports) {
    assert.equal(row.name, row.name.split(/[\\/]/u).at(-1), "Manifest path must be a filename");
    if (!manifests.has(row.name)) {
      const text = readFileSync(join(ROOT, "benchmarks/mcp", row.name), "utf8");
      manifests.set(row.name, { data: JSON.parse(text), sha256: hash(text) });
      reports.set(row.name, readJson(join(dirname(qualityPath), row.name)));
    }
    const { data: manifest, sha256 } = manifests.get(row.name);
    const report = reports.get(row.name), corpus = corpusFor(row);
    assert.equal(report.productVersion, measuredVersion);
    assert.equal(report.manifestSha256, sha256, "Truth manifest changed after validation");
    assert.equal(report.commit, corpus.commit);
    assert.equal(report.repository, manifest.repository);
    assert.equal(manifest.commit, corpus.commit);
    const task = manifest.tasks.find((item) => item.id === row.id);
    const result = report.results.find((item) => item.id === row.id);
    assert.ok(task && result, "Summary task is missing its truth or raw result");
    assert.ok(task.requiredFiles.length > 0, "Task language needs a predefined required source file");
    verifySourceExcerpts(result.result, (file) => source(corpus, file));
    for (const fact of task.evidence) {
      assert.ok(source(corpus, fact.file).split(/\r\n|\r|\n/u)[fact.line - 1]?.includes(fact.text),
        "Pinned source no longer matches independent task truth");
    }
    const score = scoreTask(task, result.result);
    assert.deepEqual({ requiredFiles: task.requiredFiles.length, tp: score.truePositives.length,
      fp: score.falsePositives.length, fn: score.falseNegatives.length,
      unjudged: score.unjudged.length, facts: score.evidence.filter((item) => item.found).length,
      totalFacts: task.evidence.length },
    Object.fromEntries(["requiredFiles", "tp", "fp", "fn", "unjudged", "facts", "totalFacts"].map((key) => [key, row[key]])),
    "Saved summary disagrees with unchanged task scoring");
    const file = task.requiredFiles[0];
    const language = getSourceLanguage(file, source(corpus, file));
    assert.ok(ARTIFACT_LANGUAGES.includes(language), "Task language is not classified");
    const group = byLanguage.get(language) ?? [];
    group.push(row); byLanguage.set(language, group);
    taskLanguages.set(`${row.repo}:${row.id}`, { language, query: task.query });
  }

  const speedRows = [];
  assert.ok(timing.reports.length > 0, "No timing samples supplied");
  assert.equal(new Set(timing.reports.map((row) => `${row.repo}:${row.id}`)).size, timing.reports.length,
    "Timing query is repeated in the summary");
  for (const row of timing.reports) {
    const task = taskLanguages.get(`${row.repo}:${row.id}`);
    assert.ok(task, "Timing task lacks separate retrieval validation");
    const raw = readJson(row.rawReport), corpus = corpusFor(row);
    assert.equal(raw.query, task.query);
    assert.equal(resolve(raw.project), resolve(corpus.project));
    assert.equal(resolve(raw.conditions.roots.baseline), resolve(identity.baseline));
    assert.equal(resolve(raw.conditions.roots.candidate), resolve(identity.candidate));
    assert.equal(raw.conditions.order, "alternating");
    assert.equal(raw.conditions.statistic, "upper median");
    assert.equal(raw.conditions.warmupQueriesPerProduct, 1);
    assert.equal(raw.conditions.persistentReader, true);
    assert.ok(Number.isSafeInteger(raw.conditions.pairs) && raw.conditions.pairs > 0);
    for (const name of ["baseline", "candidate"]) {
      assert.equal(raw.samples[name].length, raw.conditions.pairs);
      assert.ok(raw.samples[name].every((sample) => Number.isFinite(sample.elapsedMs) && sample.elapsedMs > 0));
      assert.equal(median(raw.samples[name].map((sample) => sample.elapsedMs)), raw.medians[name].elapsedMs);
      assert.equal(row[name === "baseline" ? "baselineMs" : "candidateMs"], raw.medians[name].elapsedMs,
        "Timing summary differs from raw sample median");
    }
    speedRows.push({ ...row, language: task.language, pairs: raw.conditions.pairs,
      warmup: raw.conditions.warmupQueriesPerProduct, persistent: raw.conditions.persistentReader });
  }
  const measuredLanguages = [...new Set(speedRows.map((row) => row.language))];
  const link = (file) => relative(dirname(resolve(outputPath)), join(ROOT, file)).replaceAll("\\", "/");
  const powershellPath = (path) => {
    const local = relative(tmpdir(), resolve(path));
    return !local.startsWith("..") && !local.includes(":")
      ? `(Join-Path $env:TEMP '${local.replaceAll("'", "''")}')`
      : `'${resolve(path).replaceAll("'", "''")}'`;
  };
  const scope = { project: "部分跨檔", "same-file": "同檔", framework: "框架引用", structural: "結構" };
  const tier = { "external-tier-a": "外部 A 級範圍", "external-partial": "外部部分", "bounded-relation": "有界關係", "large-project-structural": "大型結構", targeted: "特定案例" };
  const languageRows = depth.matrix.map((row) => {
    const expected = NONEMPTY_EXPECTATIONS[row.language];
    const minimum = expected.relationFact ? "原始模板引用" : expected.relation ? "宣告、確定呼叫" : "宣告／資源";
    const tasks = byLanguage.get(row.language) ?? [];
    const fresh = tasks.length ? `${tasks.length} 題；檔案 ${coverage(count(tasks, "requiredFiles") - count(tasks, "fn"), count(tasks, "requiredFiles"))}；來源 ${coverage(count(tasks, "facts"), count(tasks, "totalFacts"))}` : "本輪未測量";
    const speeds = speedRows.filter((item) => item.language === row.language);
    const speed = speeds.length ? `${speeds.length} 題；${Math.min(...speeds.map((item) => item.candidateMs)).toFixed(2)}–${Math.max(...speeds.map((item) => item.candidateMs)).toFixed(2)} ms` : "本輪未測量";
    assert.ok(tier[row.evidenceTier] && scope[row.relationDepth], "Unknown depth classification");
    return `| \`${row.language}\` | ${minimum}：通過 | ${tier[row.evidenceTier]}／${scope[row.relationDepth]}；${row.evidenceVersion ?? "未標版"}；大型${row.largeProjectValidated ? "已登記" : "未登記"}<br>\`${row.truthKind}\` | ${fresh} | ${speed} |`;
  });
  const qualityRows = [...byLanguage].map(([language, tasks]) => {
    const judged = count(tasks, "tp") + count(tasks, "fp");
    return `| \`${language}\` | ${tasks.length} | ${coverage(count(tasks, "requiredFiles") - count(tasks, "fn"), count(tasks, "requiredFiles"))} | ${coverage(count(tasks, "facts"), count(tasks, "totalFacts"))} | ${count(tasks, "tp")} / ${count(tasks, "fp")} / ${count(tasks, "fn")} / ${count(tasks, "unjudged")} | ${judged ? `${count(tasks, "tp")}/${judged}` : "不適用"} |`;
  });
  const timingRows = speedRows.map((row) => `| \`${row.language}\` | ${row.repo}／\`${row.id}\` | ${row.baselineMs.toFixed(2)} | ${row.candidateMs.toFixed(2)} | ${(100 * (row.candidateMs / row.baselineMs - 1)).toFixed(2)}% | ${row.pairs} |`);
  const provenance = [depthPath, qualityPath, timingPath, identityPath, baselineIdentityPath].map((path) =>
    `| \`${relative(tmpdir(), path).replaceAll("\\", "/")}\` | \`${hash(readFileSync(path))}\` |`);
  const incompleteTasks = quality.reports.filter((row) => row.fn > 0 || row.facts < row.totalFacts);
  const gaps = incompleteTasks.length ? incompleteTasks.map((row) =>
    `- \`${row.id}\`：主要必要檔案 ${row.requiredFiles - row.fn}/${row.requiredFiles}，指定來源事實 ${row.facts}/${row.totalFacts}；保留原真值與失敗結果。`).join("\n") : "本批固定必要檔案及來源真值沒有遺漏；未判定結果仍保留。";
  const text = `# 語言驗證程度與搜尋速度報告

文件跟隨版本：\`v${currentVersion}\`。更新日期：${updatedOn}。本次實際量測產品：\`v${measuredVersion}\`（\`${depth.product.commit}\`）。

本報告集中列出全部 ${ARTIFACT_LANGUAGES.length} 種語言／格式的驗證範圍、查找結果與速度，後續優化更新同一份文件。所有數值均保留測量版本；純文件升版不把舊數據改稱新版本實測。

## 如何閱讀

「本輪最小驗證」來自 [58 種語言內容檢查](${link("benchmarks/languages/depth-matrix.mjs")}) 與獨立手寫的 [最小真值](${link("benchmarks/languages/nonempty-depth-scorer.mjs")})。${depth.contentGate.declarationLanguages} 種檢查宣告／資源，${depth.contentGate.exactCallLanguages} 種另檢查一個確定呼叫，${depth.contentGate.rawTemplateReferenceLanguages} 種檢查原始模板引用；全 ${ARTIFACT_LANGUAGES.length} 種另通過發現、掃描與檔案身分檢查。模板原始引用未經跨檔解析，小型案例不提供整個語言的 precision、recall 或速度。

「歷史證據」照錄 [能力與限制來源](${link("src/domain/language-depth.ts")}) 的版本、證據類型與最高已登記範圍。本輪沒有重新執行每個歷史外部 oracle；\`project\` 代表其中有部分跨檔能力。完整型別、動態行為、框架及語法覆蓋須逐項閱讀該來源的 \`knownLimitations\` 與 [驗證紀錄](${link("benchmarks/README.md")})。表內分類不代表完整跨檔解析或各語言達到相同深度。

「目前固定任務」依真值預先指定的第一個必要檔案語言歸類。查詢仍在整個真實專案執行；跨語言專案及只用數個題目的速度，不能用來比較語言本身的快慢。本輪有 ${measuredLanguages.length}/${ARTIFACT_LANGUAGES.length} 種語言的實際任務速度；其餘 ${ARTIFACT_LANGUAGES.length - measuredLanguages.length} 種未測量，後續仍需補驗。

## 每個語言的範圍與目前結果

| 語言／格式 | 本輪最小驗證 | 歷史證據／關係範圍／證據版本 | 目前固定任務（v${measuredVersion}） | 查詢上中位數（v${measuredVersion}） |
| --- | --- | --- | --- | --- |
${languageRows.join("\n")}

## 真實專案查找品質

本批 ${quality.manifests} 份固定真值包含 ${quality.tasks} 題；使用 [task-retrieval](${link("benchmarks/mcp/task-retrieval.mjs")}) 的既有計分方式。必要檔案按主要 focuses／match 計分；來源事實另包含補充 source windows，兩個分母分開呈現。TP 包含預先定義的補充脈絡，FN 只計必要檔案。未判定檔案不當作 FP。最後一欄只涵蓋已判定輸出，整體 precision 仍未測量。

| 語言 | 題數 | 必要檔案召回 | 指定來源涵蓋 | TP / FP / FN / 待核對 | 已判定 precision |
| --- | ---: | --- | --- | --- | --- |
${qualityRows.join("\n")}

${gaps}

本批資料的來源、獨立核對、輸出成本及首次保留結果見 [v${measuredVersion} 稽核](${link(auditDocument)})。全套測試通過與小型語言檢查通過，不會消除此處的查找缺口。

## 查詢速度

基準 \`v${identity.baselineVersion}\` 與量測產品 \`v${measuredVersion}\` 使用同樣的固定原始碼與已有索引。每題一次暖機、持續存在的唯讀 reader、交替順序；統計為上中位數。範圍是完整 service \`explore\` 呼叫，包含 status 檢查，排除 CLI 啟動、序列化／傳輸及 Agent 思考。初次索引、增量同步、冷查詢與峰值記憶體本輪未比較。

| 語言 | 固定查詢 | 基準 ms | 量測產品 ms | 變化 | 配對數 |
| --- | --- | ---: | ---: | ---: | ---: |
${timingRows.join("\n")}

正值代表較慢，負值代表較快。保留所有快慢樣本；小差異可能是噪音，本批不宣稱全面加速、統計顯著或 SLO。上述 service 時間不等於 Agent 完成任務的總時間。完整任務的補查序列、查詢次數及 service 時間依 [對應稽核文件](${link(auditDocument)}) 的實際範圍閱讀；後續仍須補上其他語言的完整任務效率。

## 固定專案與可追溯資料

| 專案 | 固定 commit |
| --- | --- |
${identity.corpora.map((corpus) => {
    const repo = quality.reports.find((row) => row.repo === corpus.name);
    const manifest = repo && manifests.get(repo.name)?.data;
    return `| ${manifest ? `[${corpus.name}](${manifest.repository})` : corpus.name} | \`${corpus.commit}\` |`;
  }).join("\n")}

原始 JSON、索引、凍結產品、全部逐次時間與失敗產物保留於專案外的驗證工作區。以下 SHA-256 對應本次生成報告實際讀取的摘要；生成器還核對每份任務真值、原始結果與每次速度樣本，不只讀取通過旗標。

| 摘要來源 | SHA-256 |
| --- | --- |
${provenance.join("\n")}

## 後續更新方式

每次優化完成前，更新本報告的文件版本、受影響語言的查找／關係驗證、速度與已知缺口。沒有執行的範圍保留版本並寫未測量；失敗結果與舊基準保留。變更真值須另附獨立核對依據，不能為符合輸出而修改答案。

先依 [benchmark 入口](${link("benchmarks/README.md")}) 執行必要驗證，將原始資料放在獨立工作區，再用以下指令生成本表。輸入需要同一量測產品版本、完整最小內容檢查、可核對的固定任務結果、速度原始樣本及凍結產品身分。若其中有缺漏或版本不一致，生成器停止，不覆寫報告。

\`\`\`powershell
node benchmarks/languages/evidence-speed-report.mjs \u0060
  --depth ${powershellPath(depthPath)} \u0060
  --quality ${powershellPath(qualityPath)} \u0060
  --timing ${powershellPath(timingPath)} \u0060
  --identity ${powershellPath(identityPath)} \u0060
  --baseline-identity ${powershellPath(baselineIdentityPath)} \u0060
  --audit '${auditDocument.replaceAll("'", "''")}' \u0060
  --updated-on ${updatedOn} --output docs/language-verification-and-speed.md
\`\`\`
`;
  return { text, summary: { currentVersion, measuredVersion, languages: ARTIFACT_LANGUAGES.length,
    measuredLanguages, unmeasuredLanguages: ARTIFACT_LANGUAGES.filter((language) => !measuredLanguages.includes(language)),
    tasks: quality.tasks, timingQueries: speedRows.length, incompleteTasks: incompleteTasks.map((row) => row.id) } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = (name) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
  const paths = ["--depth", "--quality", "--timing", "--identity", "--baseline-identity", "--output"].map(option);
  assert.ok(paths.every(Boolean) && option("--updated-on") && option("--audit"),
    "Required: --depth <json> --quality <summary.json> --timing <summary.json> --identity <json> --baseline-identity <json> --audit <repository audit.md> --updated-on <YYYY-MM-DD> --output <markdown>");
  const [depthPath, qualityPath, timingPath, identityPath, baselineIdentityPath, outputPath] = paths.map((path) => resolve(path));
  const { text, summary } = buildEvidenceSpeedReport({ depthPath, qualityPath, timingPath, identityPath, baselineIdentityPath,
    auditDocument: option("--audit"), outputPath, updatedOn: option("--updated-on") });
  writeFileSync(outputPath, text, "utf8");
  console.log(JSON.stringify(summary));
}
