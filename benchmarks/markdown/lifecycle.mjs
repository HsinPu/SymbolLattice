import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { SqliteGraphStore } from "../../dist/infrastructure/sqlite/index.js";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

export function validateDisposableMarkdownProject(projectPath, probePath) {
  const project = resolve(projectPath);
  const probe = resolve(project, probePath);
  const relativeProbe = relative(project, probe);
  if (
    !basename(project).startsWith("markdown-v0449-") ||
    !existsSync(join(project, ".SymbolLattice")) ||
    isAbsolute(relativeProbe) ||
    relativeProbe.startsWith("..") ||
    !/\.(?:md|markdown)$/iu.test(probe)
  ) {
    throw new Error("Lifecycle mutations require an indexed markdown-v0449-* disposable project and an in-project Markdown probe.");
  }
  return { project, probe };
}

function runCliResult(command, project) {
  const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/main.js");
  return spawnSync(process.execPath, [cli, command, project, "--json"], {
    cwd: dirname(cli),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
}

function runCli(command, project) {
  const result = runCliResult(command, project);
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function sameCounts(left, right) {
  return ["files", "symbols", "edges", "pendingReferences"].every((key) => left[key] === right[key]);
}

function referenceState(project, probePath) {
  const store = new SqliteGraphStore({ readOnly: true });
  try {
    const graph = store.getSnapshot(project);
    const references = graph.edges.filter((edge) => edge.kind === "references" && edge.filePath === probePath);
    return {
      total: references.length,
      exact: references.filter((edge) => edge.resolution === "exact" && edge.targetId !== null).length,
      unresolved: references.filter((edge) => edge.resolution === "unresolved" && edge.targetId === null).length
    };
  } finally {
    store.close();
  }
}

export function runMarkdownLifecycle({ projectPath, probePath }) {
  const { project, probe } = validateDisposableMarkdownProject(projectPath, probePath);
  const original = readFileSync(probe);
  const originalHash = sha256(original);
  const target = join(dirname(probe), "target.md");
  if (!existsSync(target)) throw new Error("Markdown lifecycle requires an indexed sibling target.md.");
  const targetOriginal = readFileSync(target);
  const targetOriginalHash = sha256(targetOriginal);
  const renamed = join(dirname(probe), `${basename(probe, ".md")}.renamed.md`);
  const deleted = join(dirname(project), `${basename(project)}-deleted-probe.md`);
  const deletedTarget = join(dirname(project), `${basename(project)}-deleted-target.md`);
  const invalidConfig = join(project, "tsconfig.json");
  if (existsSync(renamed) || existsSync(deleted) || existsSync(deletedTarget)) {
    throw new Error("Lifecycle scratch path already exists.");
  }
  let activePath = probe;
  let activeTargetPath = target;
  const evidence = {};
  try {
    const baseline = runCli("sync", project);
    const baselineReferences = referenceState(project, probePath);
    if (baselineReferences.exact < 1 || baselineReferences.unresolved !== 0) {
      throw new Error("Lifecycle baseline must contain at least one exact Markdown reference.");
    }
    const noop = runCli("sync", project);
    if (noop.generationId !== baseline.generationId || !sameCounts(noop.counts, baseline.counts)) throw new Error("No-op sync changed the active generation or counts.");
    evidence.baseline = { generationId: baseline.generationId, counts: baseline.counts, references: baselineReferences };
    evidence.noop = { generationId: noop.generationId, counts: noop.counts };

    writeFileSync(probe, Buffer.concat([original, Buffer.from("\n<!-- SymbolLattice lifecycle comment -->\n", "utf8")]));
    const comment = runCli("sync", project);
    if (!sameCounts(comment.counts, baseline.counts)) throw new Error("Comment-only Markdown mutation changed graph counts.");
    evidence.comment = { generationId: comment.generationId, counts: comment.counts, work: comment.lastIndexWork };

    writeFileSync(probe, Buffer.concat([original, Buffer.from("\n\n## Added lifecycle heading\n\n[Target](target.md)\n", "utf8")]));
    const semantic = runCli("sync", project);
    const semanticReferences = referenceState(project, probePath);
    if (
      semantic.counts.symbols !== baseline.counts.symbols + 1 ||
      semantic.counts.edges !== baseline.counts.edges + 2 ||
      semanticReferences.exact !== baselineReferences.exact + 1 ||
      semanticReferences.unresolved !== 0
    ) throw new Error("Semantic Markdown mutation did not add exactly one heading, containment edge, and exact reference.");
    evidence.semantic = { generationId: semantic.generationId, counts: semantic.counts, references: semanticReferences, work: semantic.lastIndexWork };

    renameSync(target, deletedTarget);
    activeTargetPath = deletedTarget;
    const targetDelete = runCli("sync", project);
    if (
      targetDelete.counts.files !== semantic.counts.files - 1 ||
      targetDelete.counts.symbols !== semantic.counts.symbols - 2 ||
      targetDelete.counts.edges !== semantic.counts.edges - 1
    ) {
      throw new Error("Target delete did not retain the Markdown link as one unresolved reference.");
    }
    const targetDeleteReferences = referenceState(project, probePath);
    if (
      targetDeleteReferences.total !== semanticReferences.total ||
      targetDeleteReferences.exact !== 0 ||
      targetDeleteReferences.unresolved !== semanticReferences.total
    ) throw new Error("Target delete did not convert every exact Markdown reference to unresolved.");
    evidence.targetDelete = {
      generationId: targetDelete.generationId,
      counts: targetDelete.counts,
      references: targetDeleteReferences,
      work: targetDelete.lastIndexWork
    };

    renameSync(deletedTarget, target);
    activeTargetPath = target;
    const targetRestore = runCli("sync", project);
    const targetRestoreReferences = referenceState(project, probePath);
    if (!sameCounts(targetRestore.counts, semantic.counts) || targetRestoreReferences.exact !== semanticReferences.exact) {
      throw new Error("Target restore did not recover the exact Markdown reference counts.");
    }
    evidence.targetRestore = {
      generationId: targetRestore.generationId,
      counts: targetRestore.counts,
      references: targetRestoreReferences,
      work: targetRestore.lastIndexWork
    };

    writeFileSync(probe, original);
    const baselineRestore = runCli("sync", project);
    if (!sameCounts(baselineRestore.counts, baseline.counts)) throw new Error("Probe restore did not recover baseline graph counts.");

    renameSync(probe, renamed);
    activePath = renamed;
    const rename = runCli("sync", project);
    if (!sameCounts(rename.counts, baseline.counts)) throw new Error("Rename did not preserve graph counts.");
    evidence.rename = { generationId: rename.generationId, counts: rename.counts, work: rename.lastIndexWork };

    renameSync(renamed, probe);
    activePath = probe;
    runCli("sync", project);
    renameSync(probe, deleted);
    activePath = deleted;
    const removal = runCli("sync", project);
    if (removal.counts.files !== baseline.counts.files - 1) throw new Error("Delete did not remove exactly one indexed Markdown file.");
    evidence.delete = { generationId: removal.generationId, counts: removal.counts, work: removal.lastIndexWork };

    renameSync(deleted, probe);
    activePath = probe;
    const restore = runCli("sync", project);
    const reopen = runCli("status", project);
    if (!sameCounts(restore.counts, baseline.counts) || reopen.generationId !== restore.generationId || !sameCounts(reopen.counts, baseline.counts)) throw new Error("Restore or fresh-process reopen did not retain baseline Markdown graph.");
    if (sha256(readFileSync(probe)) !== originalHash) throw new Error("Markdown probe bytes were not restored exactly.");
    evidence.restore = { generationId: restore.generationId, counts: restore.counts, work: restore.lastIndexWork };
    evidence.reopen = { generationId: reopen.generationId, counts: reopen.counts };

    if (existsSync(invalidConfig)) throw new Error("Lifecycle invalid-config probe requires no pre-existing tsconfig.json.");
    writeFileSync(invalidConfig, "{ invalid json", "utf8");
    const invalidStatus = runCli("status", project);
    const invalidSync = runCliResult("sync", project);
    const afterInvalid = runCli("status", project);
    if (
      invalidStatus.stale !== true ||
      !invalidStatus.staleReasons.includes("configuration-invalid") ||
      invalidSync.status === 0 ||
      afterInvalid.generationId !== reopen.generationId ||
      !sameCounts(afterInvalid.counts, baseline.counts)
    ) throw new Error("Invalid configuration did not fail closed while preserving the active Markdown generation.");
    unlinkSync(invalidConfig);
    const configRestore = runCli("sync", project);
    if (!sameCounts(configRestore.counts, baseline.counts)) throw new Error("Invalid-config restore did not recover baseline graph counts.");
    evidence.invalidConfig = {
      staleReasons: invalidStatus.staleReasons,
      syncExitCode: invalidSync.status,
      generationPreserved: afterInvalid.generationId === reopen.generationId,
      recoveredGenerationId: configRestore.generationId
    };
    return {
      schemaVersion: 1,
      benchmark: "symbollattice-markdown-large-project-lifecycle-v1",
      project,
      probePath,
      originalSha256: originalHash,
      targetSha256: targetOriginalHash,
      evidence,
      acceptance: { status: "pass" }
    };
  } finally {
    if (activePath !== probe && existsSync(activePath) && !existsSync(probe)) renameSync(activePath, probe);
    if (activeTargetPath !== target && existsSync(activeTargetPath) && !existsSync(target)) {
      renameSync(activeTargetPath, target);
    }
    if (existsSync(invalidConfig)) unlinkSync(invalidConfig);
    writeFileSync(probe, original);
    writeFileSync(target, targetOriginal);
    runCli("sync", project);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectPath = argument("--project");
  const probePath = argument("--probe");
  const output = argument("--output");
  if ([projectPath, probePath, output].some((value) => value === null)) throw new Error("Usage: --project <disposable project> --probe <relative.md> --output <json>");
  const report = runMarkdownLifecycle({ projectPath, probePath });
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
}
