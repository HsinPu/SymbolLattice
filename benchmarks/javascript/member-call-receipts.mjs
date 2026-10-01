import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";

// Independent ESTree audit of every new receipt, not a full JavaScript recall oracle.
const option = name => process.argv[process.argv.indexOf(name) + 1];
for (const name of ["--project", "--database", "--baseline-root", "--output"]) {
  assert(process.argv.includes(name), `Required ${name}`);
}
const project = resolve(option("--project")), baselineRoot = resolve(option("--baseline-root"));
const { parse } = createRequire(new URL("../../package.json", import.meta.url))("espree");
const { extractFileFacts } = await import(pathToFileURL(resolve(baselineRoot, "dist/extraction/index.js")));
const rule = "syntax.javascript.member-call.unknown-receiver";
const commit = execFileSync("git", ["-C", project, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(execFileSync("git", ["-C", project, "status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim(), "");
const db = new DatabaseSync(resolve(option("--database")), { readOnly: true });
const generation = db.prepare("SELECT value FROM meta WHERE key='active_generation_id'").get().value;
const rows = db.prepare("SELECT file_path, facts_json FROM artifact_facts WHERE generation_id=?").all(generation);
const staticName = node => node?.type === "Identifier" ? node.name : node?.type === "ThisExpression" ? "this" :
  node?.type === "MemberExpression" && !node.computed && !node.optional && node.property.type === "Identifier" &&
  node.range[0] === node.object.range[0] && staticName(node.object) ? `${staticName(node.object)}.${node.property.name}` : null;
const position = loc => ({ line: loc.line, column: loc.column + 1 });
const range = node => ({ start: position(node.loc.start), end: position(node.loc.end) });
const callable = node => /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type);
let files = 0, receipts = 0, baselineFactsEqual = 0;
const examples = [];
try {
  for (const row of rows) {
    if (!/\.(js|jsx|cjs|mjs)$/iu.test(row.file_path)) continue;
    files++;
    const facts = JSON.parse(row.facts_json);
    const sourceText = new TextDecoder("utf-8").decode(readFileSync(resolve(project, row.file_path)));
    const before = extractFileFacts({ filePath: row.file_path, language: "javascript", sourceText });
    assert.deepEqual({ ...facts, edges: facts.edges.filter(edge => edge.evidence?.ruleId !== rule) }, before,
      `Other extracted facts changed: ${row.file_path}`);
    baselineFactsEqual++;
    let ast;
    const options = { ecmaVersion: "latest", sourceType: "script", ecmaFeatures: { jsx: true }, loc: true, range: true };
    try { ast = parse(sourceText, { ...options, sourceType: row.file_path.endsWith(".mjs") ? "module" : "script" }); }
    catch { ast = parse(sourceText, { ...options, sourceType: "module" }); }
    const sites = [];
    const walk = (node, ancestors = []) => {
      if (!node?.type) return;
      if (node.type === "CallExpression" && !node.optional && node.callee.type === "MemberExpression" &&
          node.range[0] === node.callee.range[0]) {
        const name = staticName(node.callee);
        const nearest = [...ancestors].reverse().find(parent => callable(parent) || /^(ClassDeclaration|ClassExpression)$/.test(parent.type));
        if (name && nearest && callable(nearest) && node.range[0] >= nearest.body.range[0] && node.range[1] <= nearest.body.range[1]) {
          const parent = ancestors[ancestors.indexOf(nearest) - 1];
          const spans = [nearest];
          if (parent && ((parent.type === "VariableDeclarator" && parent.init === nearest) ||
            (parent.type === "AssignmentExpression" && parent.right === nearest) ||
            ((parent.type === "MethodDefinition" || parent.type === "Property") && parent.value === nearest))) spans.push(parent);
          sites.push({ name, range: range(node.callee), ownerRanges: spans.map(range) });
        }
      }
      const next = [...ancestors, node];
      for (const [key, value] of Object.entries(node)) {
        if (key === "loc" || key === "range") continue;
        if (Array.isArray(value)) value.forEach(child => walk(child, next));
        else if (value && typeof value === "object") walk(value, next);
      }
    };
    walk(ast);
    for (const edge of facts.edges.filter(edge => edge.evidence?.ruleId === rule)) {
      assert.equal(edge.kind, "calls"); assert.equal(edge.targetId, null); assert.equal(edge.resolution, "unresolved");
      assert.equal(edge.confidence, 0); assert.equal(edge.filePath, row.file_path);
      assert.deepEqual(edge.evidence, { ruleId: rule, stage: "syntax", candidateSymbolIds: [] });
      const site = sites.find(site => site.name === edge.referenceName && JSON.stringify(site.range) === JSON.stringify(edge.range));
      assert(site, `Callee is not independently verified: ${row.file_path}:${edge.range.start.line}`);
      const owner = facts.symbols.find(symbol => symbol.id === edge.sourceId);
      assert(owner && site.ownerRanges.some(span => JSON.stringify(span) === JSON.stringify(owner.range)),
        `Nearest callable ownership not verified: ${row.file_path}:${edge.range.start.line}`);
      receipts++;
      if (row.file_path === "lib/pluginOverride.js") examples.push({ name: edge.referenceName, range: edge.range, owner: owner.qualifiedName });
    }
  }
  assert.equal(db.prepare("SELECT count(*) n FROM edge_evidence WHERE generation_id=? AND json_extract(evidence_json,'$.ruleId')=?").get(generation, rule).n, 0);
  const report = { commit, generation, files, verifiedReceipts: receipts, falsePositiveReceipts: 0,
    baselineFactsEqual, examples, scope: "Every emitted receipt independently checked with Espree for canonical callee, UTF-16 source span and nearest callable declaration range. Other raw facts equal the frozen baseline. This is precision over emitted syntax receipts; all-language recall, receiver dispatch, full relation precision and Agent completion time are not measured." };
  const output = resolve(option("--output")); mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { db.close(); }
