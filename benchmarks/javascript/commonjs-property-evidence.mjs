import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCommonJsSource } from "./commonjs-call-evidence.mjs";
import { productFingerprint } from "../mcp/task-retrieval.mjs";

const sameRange = (node, range) => node.loc.start.line === range.start.line &&
  node.loc.start.column + 1 === range.start.column && node.loc.end.line === range.end.line &&
  node.loc.end.column + 1 === range.end.column;
const member = (node, object, property) => node?.type === "MemberExpression" && !node.computed &&
  node.object?.name === object && node.property?.name === property;

/** Verify emitted source receipts with Espree, independently of the product parser. */
export function verifyCommonJsPropertyReceipt(edge, target, sourceFor) {
  const receipt = edge.evidence?.commonJsBinding;
  assert.equal(receipt?.policy, "javascript-commonjs-object-property-reference-v1");
  assert.equal(edge.evidence.ruleId, "module.commonjs-object-property-reference");
  assert.equal(edge.kind, "references");
  assert.equal(edge.resolution, "exact");
  assert.equal(edge.targetId, target.id);
  assert.equal(edge.referenceName, receipt.localName);
  assert.deepEqual(edge.evidence.candidateSymbolIds, [target.id]);
  assert.deepEqual(edge.evidence.resolutionPath, [edge.filePath, target.filePath]);
  assert.equal(receipt.importSite.filePath, edge.filePath);
  assert.equal(receipt.exportSite.filePath, target.filePath);
  assert.equal(target.name, receipt.importedName);
  assert.ok(receipt.moduleSpecifier.startsWith("./") || receipt.moduleSpecifier.startsWith("../"));
  const modulePath = posix.normalize(posix.join(posix.dirname(edge.filePath), receipt.moduleSpecifier));
  assert.ok(!modulePath.startsWith("../") && !posix.isAbsolute(modulePath));
  assert.equal(target.filePath, /\.(js|cjs)$/u.test(modulePath) ? modulePath : `${modulePath}.js`);

  const importer = sourceFor(edge.filePath);
  const declaration = importer.nodes.find((node) => node.type === "VariableDeclarator" &&
    sameRange(node, receipt.importSite.range));
  assert.equal(importer.parents.get(declaration)?.kind, "const");
  assert.equal(declaration?.id.type, "ObjectPattern");
  assert.equal(declaration?.init.type, "CallExpression");
  assert.equal(declaration.init.callee.name, "require");
  assert.equal(declaration.init.arguments.length, 1);
  assert.equal(declaration.init.arguments[0].value, receipt.moduleSpecifier);
  assert.ok(declaration.id.properties.some((property) => property.type === "Property" &&
    !property.computed && (property.key.name ?? property.key.value) === receipt.importedName &&
    property.value.type === "Identifier" && property.value.name === receipt.localName));
  assert.ok(importer.nodes.some((node) => node.type === "NewExpression" &&
    node.callee.type === "Identifier" && node.callee.name === receipt.localName &&
    sameRange(node.callee, edge.range)));

  const provider = sourceFor(target.filePath);
  const property = provider.nodes.find((node) => node.type === "Property" &&
    sameRange(node, receipt.exportSite.range));
  assert.ok(property && property.kind === "init" && !property.computed && !property.method);
  assert.equal(property.key.name ?? property.key.value, receipt.importedName);
  assert.ok(sameRange(property, target.range));
  const object = provider.parents.get(property);
  assert.equal(object?.type, "ObjectExpression");
  const owner = provider.parents.get(object);
  assert.equal(owner?.type, "VariableDeclarator");
  assert.equal(owner.init, object);
  assert.equal(provider.parents.get(owner)?.kind, "const");
  assert.equal(provider.parents.get(provider.parents.get(owner))?.type, "Program");
  assert.ok(provider.nodes.some((node) => node.type === "AssignmentExpression" &&
    node.operator === "=" && member(node.left, "module", "exports") &&
    node.right.type === "Identifier" && node.right.name === owner.id.name &&
    provider.parents.get(provider.parents.get(node))?.type === "Program"));
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (key) => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
  const project = option("--project"), output = option("--output"), manifestPath = option("--manifest");
  assert.ok(project && output && manifestPath, "Required: --project --manifest --output");
  const manifestText = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const git = (...parameters) => {
    const result = spawnSync("git", ["-C", project, ...parameters], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  assert.equal(git("rev-parse", "HEAD"), manifest.commit);
  assert.equal(git("remote", "get-url", "origin").replace(/\.git$/u, ""), manifest.repository);
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
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
    const edges = snapshot.edges.filter((edge) => edge.evidence?.ruleId === "module.commonjs-object-property-reference");
    for (const edge of edges) verifyCommonJsPropertyReceipt(edge, byId.get(edge.targetId), sourceFor);
    const observations = manifest.observations.map((item) => ({ ...item, found: edges.some((edge) =>
      edge.filePath === item.file && edge.range.start.line === item.line &&
      edge.referenceName === item.localName && byId.get(edge.targetId)?.name === item.exportedName &&
      byId.get(edge.targetId)?.filePath === item.targetFile &&
      edge.evidence.commonJsBinding.importSite.range.start.line === item.importLine &&
      edge.evidence.commonJsBinding.exportSite.range.start.line === item.exportLine) }));
    const tp = observations.filter((item) => item.found).length;
    assert.deepEqual(productFingerprint(productRoot), productBuild, "Built product changed during verification");
    const report = { schemaVersion: 1, productVersion: SYMBOL_LATTICE_VERSION, productBuild,
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION, resolverVersion: PROJECT_RESOLVER_VERSION,
      generationId: status.generationId, repository: manifest.repository, commit: manifest.commit,
      truthSha256: createHash("sha256").update(manifestText).digest("hex"),
      oracle: "Espree AST/source receipts and separately fixed manual usage truth",
      tp, fn: observations.length - tp, recall: observations.length ? tp / observations.length : null,
      precision: "not-measured", verifiedReceipts: edges.length, receiptFiles: parsed.size,
      scope: "All emitted property-reference receipts checked for literal import, use, export, and declaration source ranges. Runtime constructor identity, whole-program mutation safety, and corpus-wide precision are not independently verified.",
      observations };
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, observations: undefined }));
    if (report.fn) process.exitCode = 1;
  } finally { store.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
