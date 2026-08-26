import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

function runCli(command, project) {
  const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/main.js");
  const result = spawnSync(process.execPath, [cli, command, project, "--json"], {
    cwd: dirname(cli),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function sameCounts(left, right) {
  return ["files", "symbols", "edges", "pendingReferences"].every((key) => left[key] === right[key]);
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
  if (existsSync(renamed) || existsSync(deleted) || existsSync(deletedTarget)) {
    throw new Error("Lifecycle scratch path already exists.");
  }
  let activePath = probe;
  let activeTargetPath = target;
  const evidence = {};
  try {
    const baseline = runCli("sync", project);
    const noop = runCli("sync", project);
    if (noop.generationId !== baseline.generationId || !sameCounts(noop.counts, baseline.counts)) throw new Error("No-op sync changed the active generation or counts.");
    evidence.baseline = { generationId: baseline.generationId, counts: baseline.counts };
    evidence.noop = { generationId: noop.generationId, counts: noop.counts };

    writeFileSync(probe, Buffer.concat([original, Buffer.from("\n<!-- SymbolLattice lifecycle comment -->\n", "utf8")]));
    const comment = runCli("sync", project);
    if (!sameCounts(comment.counts, baseline.counts)) throw new Error("Comment-only Markdown mutation changed graph counts.");
    evidence.comment = { generationId: comment.generationId, counts: comment.counts, work: comment.lastIndexWork };

    writeFileSync(probe, Buffer.concat([original, Buffer.from("\n\n## Added lifecycle heading\n\n[Target](target.md)\n", "utf8")]));
    const semantic = runCli("sync", project);
    if (semantic.counts.symbols !== baseline.counts.symbols + 1 || semantic.counts.edges < baseline.counts.edges + 2) throw new Error("Semantic Markdown mutation did not add a heading and its containment/reference evidence.");
    evidence.semantic = { generationId: semantic.generationId, counts: semantic.counts, work: semantic.lastIndexWork };

    writeFileSync(probe, original);
    runCli("sync", project);
    renameSync(target, deletedTarget);
    activeTargetPath = deletedTarget;
    const targetDelete = runCli("sync", project);
    if (
      targetDelete.counts.files !== baseline.counts.files - 1 ||
      targetDelete.counts.symbols !== baseline.counts.symbols - 2 ||
      targetDelete.counts.edges !== baseline.counts.edges - 1
    ) {
      throw new Error("Target delete did not retain the Markdown link as one unresolved reference.");
    }
    evidence.targetDelete = {
      generationId: targetDelete.generationId,
      counts: targetDelete.counts,
      work: targetDelete.lastIndexWork
    };

    renameSync(deletedTarget, target);
    activeTargetPath = target;
    const targetRestore = runCli("sync", project);
    if (!sameCounts(targetRestore.counts, baseline.counts)) {
      throw new Error("Target restore did not recover the exact Markdown reference counts.");
    }
    evidence.targetRestore = {
      generationId: targetRestore.generationId,
      counts: targetRestore.counts,
      work: targetRestore.lastIndexWork
    };

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
