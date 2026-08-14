#!/usr/bin/env node

import { access, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, relative, resolve, sep } from "node:path";

const DISPOSABLE_MARKER = ".symbol-lattice-disposable-project";
const INDEX_DIRECTORY = ".symbol-lattice";
const PROBE_PREFIX = "symbolLatticeStage5Incremental";

export function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]; const value = argv[++index];
    if (key === "--project") result.projectPath = value && resolve(value);
    else if (key === "--truth-manifest") result.truthManifestPath = value && resolve(value);
    else if (key === "--output") result.outputPath = value && resolve(value);
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!result.projectPath || !result.truthManifestPath || !result.outputPath) throw new Error("Required arguments: --project <disposable-project> --truth-manifest <stage5-truth.json> --output <result.json>");
  return result;
}
export function isProjectRelativePath(path) { return typeof path === "string" && path !== "" && !path.includes("\\") && !path.startsWith("/") && !path.split("/").some((part) => part === "" || part === "." || part === ".."); }
export function createSemanticProbeText() {
  const targetName = `${PROBE_PREFIX}Target`;
  const callerName = `${PROBE_PREFIX}Caller`;
  return { targetName, callerName, text: `\nexport function ${targetName}(): string { return "stage5"; }\nexport function ${callerName}(): string { return ${targetName}(); }\n` };
}
export function validateTruthManifest(manifest) {
  const probe = manifest?.semanticProbe;
  if (!Array.isArray(manifest?.selectedFiles) || manifest.selectedFiles.length === 0) throw new Error("Stage5 truth manifest must contain selectedFiles.");
  const selectedFiles = [...new Set(manifest.selectedFiles.map((item) => item?.filePath))].sort();
  if (!selectedFiles.every(isProjectRelativePath)) throw new Error("Truth manifest selectedFiles must contain safe project-relative paths.");
  if (!probe || !isProjectRelativePath(probe.filePath) || !selectedFiles.includes(probe.filePath) || typeof probe.reopenCaller !== "string" || typeof probe.reopenTarget !== "string") throw new Error("Stage5 truth manifest requires semanticProbe.filePath, reopenCaller, and reopenTarget.");
  return { selectedFiles, semanticProbe: { filePath: probe.filePath, reopenCaller: probe.reopenCaller, reopenTarget: probe.reopenTarget } };
}
export function assertDisposableProject({ hasMarker, hasGitDirectory, hasIndexDirectory }) {
  if (!hasMarker) throw new Error(`Refusing to modify project without ${DISPOSABLE_MARKER}; use a disposable copy only.`);
  if (hasIndexDirectory) throw new Error(`Refusing non-fresh project: remove ${INDEX_DIRECTORY} from the disposable copy before running.`);
  return { marker: DISPOSABLE_MARKER, gitCheckout: hasGitDirectory, freshIndexRequired: true };
}
export function renamedTypeScriptPath(filePath) {
  if (!/\.(?:ts|tsx|mts|cts)$/u.test(filePath)) throw new Error("Rename target must originate from a TypeScript source file.");
  const extension = filePath.slice(filePath.lastIndexOf("."));
  return `${filePath.slice(0, -extension.length)}.symbol-lattice-stage5-rename${extension}`;
}
export function scopeMatches(work, expected) {
  return work?.mode === "incremental" && ["addedFiles", "modifiedFiles", "removedFiles", "reExtractedFiles"].every((key) => JSON.stringify(work[key] ?? []) === JSON.stringify(expected[key] ?? []));
}
export function hardCorrectnessGates({ operations, baselineTruth }) {
  const fresh = operations.fresh.status, noop = operations.noop.map((x) => x.status);
  const sameBaseline = (entry) => entry.status.stale === false && JSON.stringify(entry.status.counts) === JSON.stringify(fresh.counts) && entry.truth === baselineTruth;
  const staleActive = (entry, generation) => entry.preSync.stale === true && entry.preSync.generationId === generation;
  const assertions = {
    fresh: fresh.stale === false,
    noop: noop.every((status) => status.generationId === fresh.generationId && JSON.stringify(status.counts) === JSON.stringify(fresh.counts)),
    comment: staleActive(operations.commentOnly, fresh.generationId) && sameBaseline(operations.commentOnly) && operations.commentOnly.scope,
    semantic: staleActive(operations.semanticRelationChange, operations.commentOnly.generationId) && operations.semanticRelationChange.probe.exactSingleton && operations.semanticRelationChange.symbolDelta === 2 && operations.semanticRelationChange.scope,
    rename: staleActive(operations.rename, operations.semanticRelationChange.generationId) && operations.rename.scope && operations.rename.newPathQueryable && operations.rename.oldPathAbsent,
    delete: staleActive(operations.delete, operations.rename.generationId) && operations.delete.scope && operations.delete.selectedFileAbsent,
    restore: staleActive(operations.restore, operations.delete.generationId) && sameBaseline(operations.restore) && operations.restore.scope,
    reopen: operations.reopen.persistedRelation && operations.reopen.noopSameGeneration,
    invalidConfig: operations.invalidConfig.syncRejected && operations.invalidConfig.status.stale && operations.invalidConfig.status.generationId === operations.invalidConfig.generationBefore && operations.invalidConfig.snapshotUnchanged && operations.invalidConfig.bytesRestored
  };
  return { policy: "correctness-only-v2", passed: Object.values(assertions).every(Boolean), assertions };
}
export function incrementalExitCode(result) { return result?.correctness?.passed === true ? 0 : 2; }

const exists = async (path) => { try { await access(path, fsConstants.F_OK); return true; } catch { return false; } };
const now = () => process.hrtime.bigint();
const millis = (start) => Math.round(Number(process.hrtime.bigint() - start) / 1000) / 1000;
const relativePath = (root, path) => relative(root, path).split(sep).join("/");
const status = (value) => ({ generationId: value.generationId, counts: value.counts, stale: value.stale, staleReasons: value.staleReasons });
async function observe(action) { const started = now(); const value = await action(); return { ...status(value), lastIndexWork: value.lastIndexWork ?? null, operationPerformance: value.operationPerformance ?? null, wallTimeMs: millis(started), processRssBytes: process.memoryUsage().rss, status: status(value) }; }
async function publicService() { const [{ SymbolLatticeService }, { FileSystemSourceCatalog }, { SqliteGraphStore }] = await Promise.all([import("../dist/application/index.js"), import("../dist/infrastructure/filesystem/index.js"), import("../dist/infrastructure/sqlite/index.js")]); return { create: () => new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog()), store: () => new SqliteGraphStore() }; }
async function filePresent(service, projectPath, filePath) { try { await service.fileView(projectPath, filePath, { symbolsOnly: true }); return true; } catch { return false; } }
async function truthFingerprint(service, projectPath, filePath) { const view = await service.fileView(projectPath, filePath, { symbolsOnly: true }); return JSON.stringify({ symbols: view.symbols.map((x) => x.qualifiedName) }); }
async function symbolCount(service, projectPath, filePath) { return (await service.fileView(projectPath, filePath, { symbolsOnly: true })).symbols.length; }
async function staleBefore(service, projectPath) { const started = now(); const value = await service.getStatus(projectPath); return { ...status(value), wallTimeMs: millis(started), processRssBytes: process.memoryUsage().rss }; }
async function assertCall(service, projectPath, callerReference, targetReference) {
  const caller = await service.node(projectPath, callerReference);
  const target = await service.node(projectPath, targetReference);
  const matching = caller.callees.items.filter((item) => item.edge.kind === "calls" && item.edge.resolution === "exact" && item.edge.confidence === 1 && item.symbol.qualifiedName === targetReference);
  return { callerExact: caller.match.status === "exact", targetExact: target.match.status === "exact", exactSingleton: matching.length === 1, edge: matching[0]?.edge ?? null };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = validateTruthManifest(JSON.parse(await readFile(options.truthManifestPath, "utf8")));
  assertDisposableProject({ hasMarker: await exists(resolve(options.projectPath, DISPOSABLE_MARKER)), hasGitDirectory: await exists(resolve(options.projectPath, ".git")), hasIndexDirectory: await exists(resolve(options.projectPath, INDEX_DIRECTORY)) });
  const sourcePath = resolve(options.projectPath, manifest.semanticProbe.filePath), configPath = resolve(options.projectPath, "tsconfig.json");
  if (!await exists(sourcePath) || !await exists(configPath)) throw new Error("Disposable project needs the semanticProbe source and tsconfig.json.");
  const original = await readFile(sourcePath), originalConfig = await readFile(configPath), renamedRelative = renamedTypeScriptPath(manifest.semanticProbe.filePath), renamedPath = resolve(options.projectPath, renamedRelative), probe = createSemanticProbeText(), api = await publicService(), operations = { noop: [] };
  let configMutated = false;
  try {
    let service = api.create();
    operations.fresh = await observe(() => service.init({ projectPath: options.projectPath }));
    const baselineTruth = await truthFingerprint(service, options.projectPath, manifest.semanticProbe.filePath), baselineSymbolCount = await symbolCount(service, options.projectPath, manifest.semanticProbe.filePath);
    for (let i = 0; i < 5; i += 1) operations.noop.push(await observe(() => service.sync({ projectPath: options.projectPath })));
    await writeFile(sourcePath, Buffer.concat([original, Buffer.from("\n// SymbolLattice Stage5 comment-only probe\n")]));
    operations.commentOnly = { preSync: await staleBefore(service, options.projectPath), ...(await observe(() => service.sync({ projectPath: options.projectPath }))) };
    operations.commentOnly.truth = await truthFingerprint(service, options.projectPath, manifest.semanticProbe.filePath); operations.commentOnly.scope = scopeMatches(operations.commentOnly.lastIndexWork, { modifiedFiles: [manifest.semanticProbe.filePath], reExtractedFiles: [manifest.semanticProbe.filePath] });
    await writeFile(sourcePath, Buffer.concat([original, Buffer.from(probe.text)]));
    operations.semanticRelationChange = { preSync: await staleBefore(service, options.projectPath), ...(await observe(() => service.sync({ projectPath: options.projectPath }))) };
    operations.semanticRelationChange.probe = await assertCall(service, options.projectPath, `${manifest.semanticProbe.filePath}#${probe.callerName}`, `${manifest.semanticProbe.filePath}#${probe.targetName}`); operations.semanticRelationChange.symbolDelta = (await symbolCount(service, options.projectPath, manifest.semanticProbe.filePath)) - baselineSymbolCount; operations.semanticRelationChange.scope = scopeMatches(operations.semanticRelationChange.lastIndexWork, { modifiedFiles: [manifest.semanticProbe.filePath], reExtractedFiles: [manifest.semanticProbe.filePath] });
    await writeFile(sourcePath, original); await rename(sourcePath, renamedPath);
    operations.rename = { preSync: await staleBefore(service, options.projectPath), ...(await observe(() => service.sync({ projectPath: options.projectPath }))) };
    operations.rename.scope = scopeMatches(operations.rename.lastIndexWork, { addedFiles: [renamedRelative], removedFiles: [manifest.semanticProbe.filePath], reExtractedFiles: [renamedRelative] }); operations.rename.newPathQueryable = await filePresent(service, options.projectPath, renamedRelative); operations.rename.oldPathAbsent = !await filePresent(service, options.projectPath, manifest.semanticProbe.filePath);
    await rename(renamedPath, sourcePath); await unlink(sourcePath);
    operations.delete = { preSync: await staleBefore(service, options.projectPath), ...(await observe(() => service.sync({ projectPath: options.projectPath }))) };
    operations.delete.scope = scopeMatches(operations.delete.lastIndexWork, { removedFiles: [renamedRelative] }); operations.delete.selectedFileAbsent = !await filePresent(service, options.projectPath, manifest.semanticProbe.filePath);
    await writeFile(sourcePath, original);
    operations.restore = { preSync: await staleBefore(service, options.projectPath), ...(await observe(() => service.sync({ projectPath: options.projectPath }))) };
    operations.restore.truth = await truthFingerprint(service, options.projectPath, manifest.semanticProbe.filePath); operations.restore.scope = scopeMatches(operations.restore.lastIndexWork, { addedFiles: [manifest.semanticProbe.filePath], reExtractedFiles: [manifest.semanticProbe.filePath] });
    service = api.create(); operations.reopen = await observe(() => service.getStatus(options.projectPath)); operations.reopen.persistedRelation = (await assertCall(service, options.projectPath, manifest.semanticProbe.reopenCaller, manifest.semanticProbe.reopenTarget)).exactSingleton; const reopenedGeneration = operations.reopen.generationId; const reopenNoop = await observe(() => service.sync({ projectPath: options.projectPath })); operations.reopen.noopSameGeneration = reopenNoop.generationId === reopenedGeneration;
    const generationBefore = (await service.getStatus(options.projectPath)).generationId; const snapshotBefore = JSON.stringify(api.store().getSnapshot(options.projectPath)); await writeFile(configPath, "{ invalid stage5 config"); configMutated = true; let syncRejected = false; const invalidStarted = now(); try { await service.sync({ projectPath: options.projectPath }); } catch { syncRejected = true; } const invalidStatus = await service.getStatus(options.projectPath); const snapshotUnchanged = JSON.stringify(api.store().getSnapshot(options.projectPath)) === snapshotBefore; await writeFile(configPath, originalConfig); configMutated = false;
    operations.invalidConfig = { generationBefore, syncRejected, ...status(invalidStatus), status: status(invalidStatus), wallTimeMs: millis(invalidStarted), processRssBytes: process.memoryUsage().rss, snapshotUnchanged, bytesRestored: (await readFile(configPath)).equals(originalConfig) };
    const result = { schemaVersion: 1, benchmarkVersion: "typescript-large-project-incremental-performance-v2", generatedAt: new Date().toISOString(), stage5TruthManifest: { required: ["selectedFiles", "semanticProbe.filePath", "semanticProbe.reopenCaller", "semanticProbe.reopenTarget"], value: manifest }, disposableGuard: { marker: DISPOSABLE_MARKER, indexDirectoryMustBeAbsent: true }, operations, performance: { policy: "observational-machine-specific-v1", hardLatencyGate: false } };
    result.correctness = hardCorrectnessGates({ operations, baselineTruth }); await writeFile(options.outputPath, `${JSON.stringify(result, null, 2)}\n`); process.stdout.write(`${JSON.stringify({ output: options.outputPath, correctness: result.correctness }, null, 2)}\n`); process.exitCode = incrementalExitCode(result);
  } finally { if (await exists(renamedPath) && !await exists(sourcePath)) await rename(renamedPath, sourcePath); await writeFile(sourcePath, original); if (configMutated || !(await readFile(configPath)).equals(originalConfig)) await writeFile(configPath, originalConfig); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
