import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "espree";
import { productFingerprint } from "../mcp/task-retrieval.mjs";

export function parseCommonJsSource(text) {
  const ast = parse(text, { ecmaVersion: "latest", sourceType: "script", loc: true, range: true });
  const nodes = [];
  const parents = new Map();
  const visit = (node, parent) => {
    if (!node || typeof node !== "object" || !node.type) return;
    nodes.push(node); parents.set(node, parent);
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "range"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach((child) => visit(child, node));
      else visit(value, node);
    }
  };
  visit(ast);
  return { nodes, parents };
}
const sameRange = (node, range) => node.loc.start.line === range.start.line && node.loc.start.column + 1 === range.start.column &&
  node.loc.end.line === range.end.line && node.loc.end.column + 1 === range.end.column;

/** Independently verify literal AST/source receipts, not whole-program binding precision. */
export function verifyCommonJsReceipt(edge, target, sourceFor) {
  const receipt = edge.evidence.commonJsBinding;
  assert.equal(receipt.policy, "javascript-commonjs-object-call-v1");
  const importer = sourceFor(edge.filePath);
  const provider = sourceFor(target.filePath);
  assert.equal(receipt.importSite.filePath, edge.filePath);
  assert.equal(receipt.exportSite.filePath, target.filePath);
  assert.ok(receipt.moduleSpecifier.startsWith("./") || receipt.moduleSpecifier.startsWith("../"));
  const modulePath = posix.normalize(posix.join(posix.dirname(edge.filePath), receipt.moduleSpecifier));
  assert.ok(!modulePath.startsWith("../") && !posix.isAbsolute(modulePath));
  assert.equal(target.filePath, /\.(js|cjs)$/u.test(modulePath) ? modulePath : `${modulePath}.js`);
  assert.equal(edge.kind, "calls");
  assert.equal(edge.resolution, "exact");
  assert.equal(edge.targetId, target.id);
  assert.equal(edge.referenceName, receipt.localName);
  assert.deepEqual(edge.evidence.resolutionPath, [edge.filePath, target.filePath]);
  assert.deepEqual(edge.evidence.candidateSymbolIds, [target.id]);
  const imported = importer.nodes.find((node) => node.type === "VariableDeclarator" && sameRange(node, receipt.importSite.range));
  assert.equal(imported?.id.type, "ObjectPattern");
  assert.equal(importer.parents.get(imported)?.kind, "const");
  assert.equal(imported?.init.type, "CallExpression");
  assert.equal(imported.init.callee.name, "require");
  assert.equal(imported.init.arguments.length, 1);
  assert.equal(imported.init.arguments[0].value, receipt.moduleSpecifier);
  assert.ok(imported.id.properties.some((property) => !property.computed && property.type === "Property" &&
    (property.key.name ?? property.key.value) === receipt.importedName && property.value.type === "Identifier" && property.value.name === receipt.localName));
  assert.ok(importer.nodes.some((node) => node.type === "CallExpression" && node.callee.type === "Identifier" &&
    node.callee.name === receipt.localName && sameRange(node.callee, edge.range)));
  const exported = provider.nodes.find((node) => node.type === "Property" && sameRange(node, receipt.exportSite.range));
  assert.ok(exported && !exported.computed && exported.kind === "init" && !exported.method);
  assert.equal(exported.key.name ?? exported.key.value, receipt.importedName);
  assert.equal(exported.value.type, "Identifier");
  assert.equal(exported.value.name, target.name);
  const object = provider.parents.get(exported);
  const assignment = provider.parents.get(object);
  assert.equal(object?.type, "ObjectExpression");
  assert.equal(assignment?.type, "AssignmentExpression");
  assert.equal(assignment.operator, "=");
  assert.equal(assignment.left.type, "MemberExpression");
  assert.equal(assignment.left.computed, false);
  assert.equal(assignment.left.object.name, "module");
  assert.equal(assignment.left.property.name, "exports");
  assert.equal(provider.parents.get(provider.parents.get(assignment))?.type, "Program");
  assert.ok(provider.nodes.some((node) => (node.type === "FunctionDeclaration" || node.type === "VariableDeclarator") &&
    node.id?.name === target.name && sameRange(node, target.range)));
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (key) => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
  const project = option("--project"), output = option("--output"), manifestPath = option("--manifest");
  assert.ok(project && output && manifestPath, "Required: --project --manifest --output");
  const git = (...parameters) => {
    const result = spawnSync("git", ["-C", project, ...parameters], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const manifestText = readFileSync(manifestPath, "utf8"), manifest = JSON.parse(manifestText);
  assert.equal(git("rev-parse", "HEAD"), manifest.commit);
  assert.equal(git("remote", "get-url", "origin").replace(/\.git$/, ""), manifest.repository);
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
  for (const item of manifest.calls) {
    assert.ok(readFileSync(resolve(project, item.file), "utf8").split(/\r?\n/)[item.line - 1].includes(item.text));
  }
  const { SqliteGraphStore } = await import("../../dist/infrastructure/sqlite/index.js");
  const { SYMBOL_LATTICE_VERSION } = await import("../../dist/version.js");
  const { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } = await import("../../dist/domain/index.js");
  const productRoot = fileURLToPath(new URL("../../", import.meta.url));
  const productBuild = productFingerprint(productRoot);
  const store = new SqliteGraphStore();
  try {
    const { snapshot, status } = store.getActiveGraphBundle(resolve(project));
    assert.ok(status.initialized && !status.stale, "An initialized, current index is required");
    const byId = new Map(snapshot.symbols.map((symbol) => [symbol.id, symbol]));
    const parsed = new Map();
    const sourceFor = (file) => {
      if (!parsed.has(file)) parsed.set(file, parseCommonJsSource(readFileSync(resolve(project, file), "utf8")));
      return parsed.get(file);
    };
    const edges = snapshot.edges.filter((edge) => edge.evidence?.ruleId === "module.commonjs-object-call");
    for (const edge of edges) verifyCommonJsReceipt(edge, byId.get(edge.targetId), sourceFor);
    const results = manifest.calls.map((item) => ({ ...item, found: edges.some((edge) =>
      edge.filePath === item.file && edge.range.start.line === item.line && edge.range.start.column === item.column &&
      byId.get(edge.sourceId)?.name === item.caller && byId.get(edge.targetId)?.filePath === item.targetFile &&
      byId.get(edge.targetId)?.name === item.targetName && byId.get(edge.targetId)?.range.start.line === item.targetLine &&
      edge.evidence.commonJsBinding.importSite.range.start.line === item.importLine && edge.evidence.commonJsBinding.exportSite.range.start.line === item.exportLine) }));
    const tp = results.filter((item) => item.found).length;
    assert.deepEqual(productFingerprint(productRoot), productBuild, "Built product changed during verification");
    const report = { schemaVersion: 1, productVersion: SYMBOL_LATTICE_VERSION, productBuild,
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION, resolverVersion: PROJECT_RESOLVER_VERSION,
      generationId: status.generationId, repository: manifest.repository, commit: manifest.commit,
      truthSha256: createHash("sha256").update(manifestText).digest("hex"), oracle: "Espree 11.2.0 AST/source receipts plus separately fixed manual call truth",
      tp, fn: results.length - tp, recall: results.length ? tp / results.length : null,
      precision: "not-measured", verifiedReceipts: edges.length, receiptFiles: parsed.size,
      scope: "Two manually defined development call occurrences. All emitted CommonJS call receipts checked for literal import/export/call/declaration AST ranges. Corpus-wide scope binding and mutation correctness are not independently measured by the receipt check.", results };
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
    if (report.fn) process.exitCode = 1;
  } finally { store.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
