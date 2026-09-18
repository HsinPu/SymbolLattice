import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

/** File judgments are deliberately incomplete; unknown output is never a false positive. */
export function scoreTask(task, result) {
  const selected = [...new Set([
    ...(result.focuses ?? []).map((focus) => focus.symbol?.filePath),
    result.match?.symbol?.filePath
  ].filter(Boolean))];
  const required = new Set(task.requiredFiles);
  const relevant = new Set([...required, ...task.supportingFiles]);
  const irrelevant = new Set(task.irrelevantFiles);
  const truePositives = selected.filter((file) => relevant.has(file));
  const falsePositives = selected.filter((file) => irrelevant.has(file));
  const falseNegatives = [...required].filter((file) => !selected.includes(file));
  const unjudged = selected.filter((file) => !relevant.has(file) && !irrelevant.has(file));
  const sources = [result.source, ...(result.focuses ?? []).map((focus) => focus.source),
    ...(result.sourceWindows ?? []).map((window) => window.source)].filter(Boolean);
  const evidence = task.evidence.map((item) => ({ ...item, found: sources.some((source) =>
    source.filePath === item.file && (source.lines ?? []).some((line) =>
      line.line === item.line && typeof line.text === "string" && line.text.includes(item.text))) }));
  const judged = truePositives.length + falsePositives.length;
  return {
    selected, truePositives, falsePositives, falseNegatives, unjudged,
    requiredFileRecall: required.size === 0 ? null : (required.size - falseNegatives.length) / required.size,
    judgedPrecision: judged === 0 ? null : truePositives.length / judged,
    judgedFraction: selected.length === 0 ? null : judged / selected.length,
    evidence, evidenceRecall: evidence.length === 0 ? null : evidence.filter((item) => item.found).length / evidence.length
  };
}

export function verifyLexicalMatches(result, readSource) {
  let verifiedMatches = 0;
  const verify = (match, symbol) => {
    assert.equal(match.filePath, symbol.filePath);
    assert.equal(match.range.start.line, match.range.end.line);
    const compare = (left, right) => left.line - right.line || left.column - right.column;
    assert.ok(compare(match.range.start, symbol.range.start) >= 0 && compare(match.range.end, symbol.range.end) <= 0,
      "Lexical evidence lies outside its declaration");
    const line = readSource(match.filePath).split(/\r\n|\r|\n|\u2028|\u2029/u)[match.range.start.line - 1];
    assert.ok(line !== undefined && match.range.start.column >= 1 &&
      match.range.end.column > match.range.start.column && match.range.end.column <= line.length + 1,
      "Lexical evidence has invalid line coordinates");
    assert.equal(line.slice(match.range.start.column - 1, match.range.end.column - 1), match.token,
      `Lexical source mismatch: ${match.filePath}:${match.range.start.line}`);
    verifiedMatches += 1;
  };
  for (const focus of result.focuses ?? []) {
    for (const match of focus.sourceMatches ?? []) verify(match, focus.symbol);
  }
  for (const window of result.sourceWindows ?? []) {
    if (!window.sourceMatches?.length) continue;
    const owners = (result.focuses ?? []).flatMap((focus) => (focus.callees?.items ?? []).filter(({ symbol, edge }) =>
      window.connectionEdgeIds.includes(edge.id) && window.relatedSymbolIds.includes(symbol.id) &&
      edge.kind === "calls" && edge.resolution === "exact" && edge.sourceId === focus.symbol.id &&
      edge.targetId === symbol.id && edge.filePath === focus.symbol.filePath && symbol.filePath === window.filePath
    ).map(({ symbol }) => symbol));
    assert.equal(new Set(owners.map((symbol) => symbol.id)).size, 1, "Callee lexical evidence requires an exact target receipt");
    for (const match of window.sourceMatches) {
      verify(match, owners[0]);
    }
  }
  return { verifiedMatches };
}

function execute(command, args, cwd) {
  const run = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000, windowsHide: true });
  if (run.error || run.status !== 0) throw new Error(`${command} failed: ${run.error?.message ?? run.stderr}`);
  return run.stdout.trim();
}

/** Verify emitted bytes and line coordinates against the pinned checkout, independently of extraction. */
export function verifySourceExcerpts(result, readSource) {
  const sources = [result.source, ...(result.focuses ?? []).map((focus) => focus.source),
    ...(result.sourceWindows ?? []).map((window) => window.source)].filter(Boolean);
  let characters = 0;
  let lines = 0;
  for (const source of sources) {
    const original = readSource(source.filePath);
    const { start, end } = source.sourceIdentity.fullFileCharacterOffsets;
    assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start && end <= original.length);
    const expected = original.slice(start, end).replace(/\r\n|\r|\u2028|\u2029/gu, "\n");
    assert.equal(source.text, expected, `Source text mismatch: ${source.filePath}`);
    assert.equal(source.emittedCharacters, expected.length);
    assert.equal(source.sourceIdentity.contentSha256, createHash("sha256").update(expected).digest("hex"));
    const position = (offset) => {
      const endings = [...original.slice(0, offset).matchAll(/\r\n|\r|\n|\u2028|\u2029/gu)];
      const last = endings.at(-1);
      return { line: endings.length + 1, column: offset - (last ? last.index + last[0].length : 0) + 1 };
    };
    assert.deepEqual(source.range, { start: position(start), end: position(end) });
    const texts = expected.split("\n");
    if (expected.endsWith("\n")) texts.pop();
    assert.deepEqual(source.lines, texts.map((text, index) => ({ line: source.range.start.line + index, text })));
    characters += expected.length;
    lines += source.lines.length;
  }
  return { verifiedExcerpts: sources.length, emittedCharacters: characters, emittedLines: lines };
}

export function productFingerprint(root) {
  const hash = createHash("sha256");
  let files = 0;
  let bytes = 0;
  const visit = (relative) => {
    for (const entry of readdirSync(resolve(root, "dist", relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile()) {
        const contents = readFileSync(resolve(root, "dist", name));
        hash.update(`${name}\0${contents.length}\0`).update(contents);
        files += 1;
        bytes += contents.length;
      }
    }
  };
  visit("");
  return { sha256: hash.digest("hex"), files, bytes };
}

export async function runTaskRetrieval({ project, manifestPath, output, repetitions = 3, split, productRoot }) {
  assert.ok(Number.isInteger(repetitions) && repetitions > 0 && repetitions <= 100);
  const manifestText = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  assert.equal(execute("git", ["rev-parse", "HEAD"], project), manifest.commit, "Corpus commit differs from task truth");
  assert.equal(execute("git", ["remote", "get-url", "origin"], project).replace(/\.git$/, ""), manifest.repository.replace(/\.git$/, ""));
  assert.equal(execute("git", ["status", "--porcelain", "--untracked-files=no"], project), "", "Corpus tracked source changed");
  const tasks = manifest.tasks.filter((task) => split === undefined || task.split === split);
  assert.ok(tasks.length > 0, "No tasks selected");
  // Validate all source truth before executing any product query.
  for (const task of manifest.tasks) {
    assert.equal(new Set(task.requiredFiles).size, task.requiredFiles.length);
    assert.ok(task.irrelevantFiles.every((file) => ![...task.requiredFiles, ...task.supportingFiles].includes(file)));
    for (const item of task.evidence) {
      const actual = readFileSync(resolve(project, item.file), "utf8").split(/\r?\n/)[item.line - 1];
      assert.ok(actual?.includes(item.text), `Source truth mismatch: ${task.id} ${item.file}:${item.line}`);
    }
  }
  const root = productRoot === undefined ? resolve(dirname(fileURLToPath(import.meta.url)), "../..") : resolve(productRoot);
  const productBuild = productFingerprint(root);
  const { renderExploreText } = await import(pathToFileURL(resolve(root, "dist/mcp/explore-text.js")).href);
  const productVersion = execute(process.execPath, [resolve(root, "dist/cli/main.js"), "--version"], root);
  const results = tasks.map((task) => {
    const durations = [];
    let response;
    let raw;
    for (let iteration = 0; iteration < repetitions; iteration += 1) {
      const start = performance.now();
      raw = execute(process.execPath, [resolve(root, "dist/cli/main.js"), "explore", task.query, "--project", project, "--json"], root);
      durations.push(performance.now() - start);
      const current = JSON.parse(raw);
      assert.equal(current.status?.initialized, true, "Corpus index is not initialized");
      assert.equal(current.status?.stale, false, "Corpus index is stale");
      if (response) assert.equal(current.status.generationId, response.status.generationId, "Index generation changed during evaluation");
      if (response) assert.deepEqual(scoreTask(task, current), scoreTask(task, response), "Retrieval changed across repetitions");
      response = current;
    }
    const sorted = [...durations].sort((a, b) => a - b);
    const sourceVerification = verifySourceExcerpts(response, (file) => readFileSync(resolve(project, file), "utf8"));
    return { id: task.id, split: task.split, query: task.query, ...scoreTask(task, response),
      processMilliseconds: durations, medianProcessMilliseconds: sorted[Math.floor(sorted.length / 2)],
      responseBytes: Buffer.byteLength(raw), markdownProjectionBytes: Buffer.byteLength(renderExploreText(response)),
      sourceVerification, lexicalVerification: verifyLexicalMatches(response, (file) => readFileSync(resolve(project, file), "utf8")), result: response };
  });
  const report = {
    schemaVersion: 1, productVersion, productBuild, repository: manifest.repository, commit: manifest.commit,
    manifestSha256: createHash("sha256").update(manifestText).digest("hex"),
    conditions: { project: resolve(project), repetitions, node: process.version, platform: process.platform,
      timing: "Sequential fresh CLI processes against an existing index; includes startup, freshness checking and JSON serialization. Small-sample diagnostic, not a latency SLO.",
      indexing: "Not measured; this run reuses an existing index.",
      scoring: "Distinct focus files per task; recall denominator is required files; precision denominator includes only manually judged returned files. Evidence checks cited source lines, not semantic graph correctness.",
      graphPrecision: "not-measured", agentCompletionTime: "not-measured" },
    results
  };
  assert.deepEqual(productFingerprint(root), productBuild, "Product build changed during evaluation");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const project = option("--project");
  const manifestPath = option("--manifest");
  const output = option("--output");
  assert.ok(project && manifestPath && output, "Required: --project <indexed corpus> --manifest <truth.json> --output <report.json>");
  const report = await runTaskRetrieval({ project, manifestPath, output, repetitions: Number(option("--repetitions") ?? 3), split: option("--split"), productRoot: option("--product-root") });
  console.log(JSON.stringify(report.results.map(({ result, ...summary }) => summary), null, 2));
}
