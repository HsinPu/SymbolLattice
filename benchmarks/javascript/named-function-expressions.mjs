import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "espree";

const point = (value) => ({ line: value.line, column: value.column + 1 });
const range = (node) => ({ start: point(node.loc.start), end: point(node.loc.end) });

/** Independent ESTree declarations. A variable/property owner is an acceptable source identity. */
export function namedExpressionTruth(sourceText, filePath) {
  const options = { ecmaVersion: "latest", loc: true, range: true,
    ecmaFeatures: { jsx: filePath.endsWith(".jsx") } };
  let ast;
  try { ast = parse(sourceText, { ...options, sourceType: "module" }); }
  catch { ast = parse(sourceText, { ...options, sourceType: "script" }); }
  const truth = [];
  const visit = (node, parent) => {
    if (!node || typeof node !== "object" || typeof node.type !== "string") return;
    if (node.type === "FunctionExpression" && node.id) {
      const alternatives = [{ name: node.id.name, kind: "function", range: range(node) }];
      if (parent?.type === "VariableDeclarator" && parent.init === node && parent.id.type === "Identifier") {
        alternatives.push({ name: parent.id.name, kind: "variable", range: range(parent) });
      } else if (parent?.type === "PropertyDefinition" && parent.value === node && !parent.computed && parent.key.type === "Identifier") {
        alternatives.push({ name: parent.key.name, kind: "variable", range: range(parent) });
      }
      truth.push({ filePath, expressionName: node.id.name, expressionRange: range(node), alternatives });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "range") continue;
      if (Array.isArray(value)) value.forEach((child) => visit(child, node));
      else visit(value, node);
    }
  };
  visit(ast);
  return truth;
}

export function scoreNamedExpressions(truth, symbols) {
  const results = truth.map((item) => {
    const matches = symbols.filter((symbol) => symbol.filePath === item.filePath && item.alternatives.some((candidate) =>
      candidate.name === symbol.name && candidate.kind === symbol.kind &&
      JSON.stringify(candidate.range) === JSON.stringify(symbol.range)));
    return { ...item, matchedIds: matches.map((symbol) => symbol.id) };
  });
  const tp = results.filter((item) => item.matchedIds.length === 1).length;
  const fn = results.filter((item) => item.matchedIds.length === 0).length;
  const duplicates = results.filter((item) => item.matchedIds.length > 1).length;
  return { tp, fn, duplicates, recall: results.length ? tp / results.length : null, results };
}

function git(project, args) {
  const child = spawnSync("git", ["-C", project, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(child.status, 0, child.error?.message ?? child.stderr);
  return child.stdout.trim();
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const project = option("--project");
  const output = option("--output");
  const commit = option("--commit");
  assert.ok(project && output && /^[a-f0-9]{40}$/.test(commit ?? ""), "Required: --project --commit <40-hex> --output");
  assert.equal(git(project, ["rev-parse", "HEAD"]), commit);
  assert.equal(git(project, ["status", "--porcelain", "--untracked-files=no"]), "");
  const files = git(project, ["ls-files", "-z"]).split("\0").filter((file) => /\.(js|mjs|cjs|jsx)$/.test(file));
  const truth = [];
  const rejected = [];
  const sourceHash = createHash("sha256");
  for (const file of files) {
    const source = readFileSync(resolve(project, file), "utf8");
    sourceHash.update(`${file}\0${source.length}\0`).update(source);
    try { truth.push(...namedExpressionTruth(source, file)); }
    catch (error) { rejected.push({ file, reason: error.message }); }
  }
  // Generate and hash source truth before loading any product results.
  const truthSha256 = createHash("sha256").update(JSON.stringify(truth)).digest("hex");
  const { SqliteGraphStore } = await import("../../dist/infrastructure/sqlite/index.js");
  const { SYMBOL_LATTICE_VERSION } = await import("../../dist/version.js");
  const { ARTIFACT_FACTS_EXTRACTOR_VERSION } = await import("../../dist/domain/index.js");
  const store = new SqliteGraphStore();
  try {
    const snapshot = store.getSnapshot(resolve(project));
    const scored = scoreNamedExpressions(truth, snapshot.symbols);
    const report = { schemaVersion: 1, repository: git(project, ["remote", "get-url", "origin"]), commit,
      productVersion: SYMBOL_LATTICE_VERSION, extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      oracle: "Espree 11.2.0 / ESTree", files: files.length, rejected, sourceSha256: sourceHash.digest("hex"), truthSha256,
      scope: "All named function expressions in tracked, parseable JavaScript. Exact declaration ranges and names; variable/property source owners accepted. No graph precision, export resolution or runtime-dispatch claim.",
      precision: "not-measured", ...scored };
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, results: undefined }));
    if (scored.fn || scored.duplicates || rejected.length || !truth.length) process.exitCode = 1;
  } finally { store.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
