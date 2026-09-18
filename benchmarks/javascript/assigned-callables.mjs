import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "espree";
import { scoreNamedExpressions } from "./named-function-expressions.mjs";
import { productFingerprint } from "../mcp/task-retrieval.mjs";

const range = (node) => ({ start: { line: node.loc.start.line, column: node.loc.start.column + 1 },
  end: { line: node.loc.end.line, column: node.loc.end.column + 1 } });
function walk(node, visit) {
  if (!node || typeof node !== "object" || !node.type || visit(node) === false) return;
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "range"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else walk(value, visit);
  }
}

/** Independent ESTree assignment/declaration and direct-call ownership truth. */
export function assignedCallableTruth(text, filePath) {
  const options = { ecmaVersion: "latest", loc: true, range: true, ecmaFeatures: { jsx: filePath.endsWith(".jsx") } };
  let ast;
  try { ast = parse(text, { ...options, sourceType: "module" }); }
  catch { ast = parse(text, { ...options, sourceType: "script" }); }
  const member = (node, depth = 0) => {
    if (depth > 32) return null;
    if (node.type === "Identifier") return node.name;
    if (node.type === "ThisExpression") return "this";
    if (node.type !== "MemberExpression" || node.optional) return null;
    const parent = member(node.object, depth + 1);
    if (parent === null) return null;
    let suffix;
    if (!node.computed && node.property.type === "Identifier") suffix = `.${node.property.name}`;
    else if (node.computed && node.property.type === "Literal" && ["string", "number"].includes(typeof node.property.value)) suffix = `[${JSON.stringify(node.property.value)}]`;
    else if (node.computed && node.property.type === "TemplateLiteral" && node.property.expressions.length === 0) suffix = `[${JSON.stringify(node.property.quasis[0].value.cooked)}]`;
    else return null;
    return parent.length + suffix.length <= 512 ? parent + suffix : null;
  };
  const truth = [];
  walk(ast, (node) => {
    if (node.type !== "AssignmentExpression" || node.operator !== "=" || node.left.type !== "MemberExpression" ||
      !["FunctionExpression", "ArrowFunctionExpression"].includes(node.right.type) || node.right.id) return;
    const name = member(node.left);
    if (name === null) return;
    const calls = [];
    walk(node.right.body, (child) => {
      if (/^(?:Function|ArrowFunction|Class)/u.test(child.type)) return false;
      if (child.type === "CallExpression" && child.callee.type === "Identifier") calls.push({ name: child.callee.name, range: range(child.callee) });
    });
    truth.push({ filePath, assignmentName: name, alternatives: [{ name, kind: "function", range: range(node) }], calls });
  });
  return truth;
}

export function scoreAssignedCallables(truth, snapshot) {
  const declarations = scoreNamedExpressions(truth, snapshot.symbols);
  const key = (file, range) => `${file}:${range.start.line}:${range.start.column}:${range.end.line}:${range.end.column}`;
  const callsBySite = new Map();
  for (const edge of snapshot.edges) {
    if (edge.kind !== "calls" || !edge.range) continue;
    const site = key(edge.filePath, edge.range);
    callsBySite.set(site, [...(callsBySite.get(site) ?? []), edge]);
  }
  const ownership = declarations.results.flatMap((item) => item.calls.map((call) => {
    const matches = (callsBySite.get(key(item.filePath, call.range)) ?? []).filter((edge) => edge.referenceName === call.name);
    return { filePath: item.filePath, assignmentName: item.assignmentName, ...call,
      found: item.matchedIds.length === 1 && matches.length === 1 && matches[0].sourceId === item.matchedIds[0],
      actualSourceIds: matches.map((edge) => edge.sourceId) };
  }));
  const ownerTp = ownership.filter((item) => item.found).length;
  return { ...declarations, ownership: { tp: ownerTp, fn: ownership.length - ownerTp,
    recall: ownership.length ? ownerTp / ownership.length : null, results: ownership } };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const project = option("--project"), output = option("--output"), commit = option("--commit");
  assert.ok(project && output && /^[a-f0-9]{40}$/u.test(commit ?? ""), "Required: --project --commit <40-hex> --output");
  const git = (...args) => { const p = spawnSync("git", ["-C", project, ...args], { encoding: "utf8", windowsHide: true });
    assert.equal(p.status, 0, p.error?.message ?? p.stderr); return p.stdout.trim(); };
  assert.equal(git("rev-parse", "HEAD"), commit);
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
  const files = git("ls-files", "-z").split("\0").filter((file) => /\.(?:js|cjs|mjs|jsx)$/u.test(file));
  const truth = [], rejected = [];
  for (const file of files) {
    try { truth.push(...assignedCallableTruth(readFileSync(resolve(project, file), "utf8"), file)); }
    catch (error) { rejected.push({ file, reason: error.message }); }
  }
  const truthSha256 = createHash("sha256").update(JSON.stringify(truth)).digest("hex");
  const { SqliteGraphStore } = await import("../../dist/infrastructure/sqlite/index.js");
  const { SYMBOL_LATTICE_VERSION } = await import("../../dist/version.js");
  const root = fileURLToPath(new URL("../../", import.meta.url)), build = productFingerprint(root);
  const store = new SqliteGraphStore();
  try {
    const { status, snapshot } = store.getActiveGraphBundle(resolve(project));
    assert.ok(status.initialized && !status.stale);
    const score = scoreAssignedCallables(truth, snapshot);
    assert.deepEqual(productFingerprint(root), build);
    const report = { schemaVersion: 1, productVersion: SYMBOL_LATTICE_VERSION, productBuild: build,
      repository: git("remote", "get-url", "origin"), commit, generationId: status.generationId, files: files.length,
      oracle: "Espree 11.2.0 / ESTree", truthSha256, rejected, precision: "not-measured",
      scope: "Anonymous functions/arrows directly assigned to static member paths, at most 32 member hops and 512 label characters. Source identity/range and direct identifier-call ownership outside nested callable/class bodies; no property-target, export, dispatch, callee-correctness or overall precision claim.", ...score };
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, results: undefined, ownership: { ...score.ownership, results: undefined } }));
    if (!truth.length || score.fn || score.duplicates || score.ownership.fn || rejected.length) process.exitCode = 1;
  } finally { store.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
