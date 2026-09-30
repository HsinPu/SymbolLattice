import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { SqliteGraphStore } from "../../dist/infrastructure/sqlite/index.js";

const option = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const project = option("--project"), baselineProject = option("--baseline-project"), output = option("--output");
assert.ok(project && baselineProject && output,
  "Required: --project <candidate-indexed-corpus> --baseline-project <baseline-indexed-corpus> --output <external-report.json>");
const outputPath = resolve(output);
for (const root of [project, baselineProject, "."]) {
  const path = relative(resolve(root), outputPath);
  assert.ok(isAbsolute(path) || path === ".." || path.startsWith("../") || path.startsWith("..\\"),
    "Write reports outside corpus and product roots");
}
const commit = path => execFileSync("git", ["-C", resolve(path), "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(commit(project), commit(baselineProject), "Compare the same pinned source commit");
for (const path of [project, baselineProject]) assert.equal(execFileSync("git", ["-C", resolve(path),
  "status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim(), "",
  "Pinned tracked sources must be clean");
const store = new SqliteGraphStore({ readOnly: true });
const baselineBundle = store.getActiveGraphBundle(resolve(baselineProject));
const candidateBundle = store.getActiveGraphBundle(resolve(project));
const baseline = baselineBundle.snapshot;
const candidate = candidateBundle.snapshot;
assert.deepEqual(candidate.symbols, baseline.symbols, "Optional member receipts must not invent declarations");
const candidateEdges = new Map(candidate.edges.map(edge => [edge.id, edge]));
for (const edge of baseline.edges) assert.deepEqual(candidateEdges.get(edge.id), edge,
  `Existing relation changed: ${edge.id}`);
const sites = new Map();
let sourceFiles = 0;
for (const file of candidate.files.filter(file => file.language === "typescript")) {
  const text = readFileSync(resolve(project, file.path), "utf8");
  assert.equal(text, readFileSync(resolve(baselineProject, file.path), "utf8"));
  sourceFiles++;
  const source = ts.createSourceFile(file.path, text, ts.ScriptTarget.Latest, true,
    /\.tsx$/u.test(file.path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = node => {
    if (ts.isCallChain(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.name)) {
      const method = node.expression.name;
      const position = source.getLineAndCharacterOfPosition(method.getStart(source));
      const site = { file: file.path, line: position.line + 1, column: position.character + 1,
        name: method.text, writtenCall: node.getText(source) };
      sites.set(`${site.file}:${site.line}:${site.column}:${site.name}`, site);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
const baselineEdgeIds = new Set(baseline.edges.map(edge => edge.id));
const added = candidate.edges.filter(edge => !baselineEdgeIds.has(edge.id));
const matched = new Set();
for (const edge of added) {
  assert.equal(edge.evidence?.ruleId, "syntax.typescript.optional-member-call.unknown-receiver");
  assert.equal(edge.kind, "calls");
  assert.equal(edge.targetId, null);
  assert.equal(edge.resolution, "unresolved");
  assert.equal(edge.confidence, 0);
  assert.deepEqual(edge.evidence.candidateSymbolIds, []);
  const key = `${edge.filePath}:${edge.range.start.line}:${edge.range.start.column}:${edge.referenceName}`;
  assert.ok(sites.has(key), `No compiler call-site evidence: ${key}`);
  assert.equal(edge.range.end.line, edge.range.start.line);
  assert.equal(edge.range.end.column, edge.range.start.column + edge.referenceName.length);
  assert.ok(!matched.has(key), `Duplicate receipt: ${key}`);
  matched.add(key);
}
const missing = [...sites].filter(([key]) => !matched.has(key)).map(([, site]) => site);
const report = { schemaVersion: 1, repository: execFileSync("git", ["-C", resolve(project), "remote", "get-url", "origin"], { encoding: "utf8" }).trim(),
  productVersion: JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version,
  conditions: { node: process.version, platform: process.platform, commandArguments: process.argv.slice(2),
    baselineExtractor: baselineBundle.extractorVersion, candidateExtractor: candidateBundle.extractorVersion,
    baselineResolver: baselineBundle.resolverVersion, candidateResolver: candidateBundle.resolverVersion },
  commit: commit(project), typescriptVersion: ts.version, sourceFiles, compilerSites: sites.size,
  preservedBaselineRelations: baseline.edges.length, addedReceipts: added.length,
  truePositives: matched.size, falsePositives: 0, falseNegatives: missing.length,
  precision: added.length === 0 ? null : matched.size / added.length,
  recall: sites.size === 0 ? null : matched.size / sites.size, missing,
  scope: "Static named optional member call tokens in indexed TypeScript files; not receiver typing, runtime dispatch, semantic graph precision or task-file retrieval." };
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
assert.equal(missing.length, 0, "Compiler-confirmed call sites lack source receipts");
