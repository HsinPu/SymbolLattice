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

export function validateDisposableCssProject(projectPath, probePath) {
  const project = resolve(projectPath);
  const probe = resolve(project, probePath);
  const relativeProbe = relative(project, probe);
  if (
    !basename(project).startsWith("css-v0426-") ||
    !existsSync(join(project, ".SymbolLattice")) ||
    isAbsolute(relativeProbe) ||
    relativeProbe.startsWith("..") ||
    !probe.toLowerCase().endsWith(".css")
  ) {
    throw new Error("Lifecycle mutations require an indexed css-v0426-* disposable project and an in-project CSS probe.");
  }
  return { project, probe };
}

function runCli(command, project) {
  const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/cli/main.js");
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

export function runLifecycle({ projectPath, probePath }) {
  const { project, probe } = validateDisposableCssProject(projectPath, probePath);
  const original = readFileSync(probe);
  const originalHash = sha256(original);
  const renamed = join(dirname(probe), `${basename(probe, ".css")}.renamed.css`);
  const deleted = join(dirname(project), `${basename(project)}-deleted-probe.css`);
  if (existsSync(renamed) || existsSync(deleted)) throw new Error("Lifecycle scratch path already exists.");
  let activePath = probe;
  const evidence = {};
  try {
    const baseline = runCli("sync", project);
    const noop = runCli("sync", project);
    if (noop.generationId !== baseline.generationId || !sameCounts(noop.counts, baseline.counts)) throw new Error("No-op sync changed the active generation or counts.");
    evidence.baseline = { generationId: baseline.generationId, counts: baseline.counts };
    evidence.noop = { generationId: noop.generationId, counts: noop.counts };

    writeFileSync(probe, Buffer.concat([original, Buffer.from("\n/* SymbolLattice lifecycle comment */\n", "utf8")]));
    const comment = runCli("sync", project);
    if (!sameCounts(comment.counts, baseline.counts)) throw new Error("Comment-only mutation changed graph counts.");
    evidence.comment = { generationId: comment.generationId, counts: comment.counts, work: comment.lastIndexWork };

    writeFileSync(probe, Buffer.concat([original, Buffer.from("\n.SymbolLattice-probe { --probe: red; display: grid; }\n", "utf8")]));
    const semantic = runCli("sync", project);
    if (semantic.counts.symbols !== baseline.counts.symbols + 5 || semantic.counts.edges !== baseline.counts.edges + 5) throw new Error("Semantic mutation did not add the expected five resources and containments.");
    evidence.semantic = { generationId: semantic.generationId, counts: semantic.counts, work: semantic.lastIndexWork };

    writeFileSync(probe, original);
    runCli("sync", project);
    renameSync(probe, renamed);
    activePath = renamed;
    const rename = runCli("sync", project);
    if (rename.counts.files !== baseline.counts.files || rename.counts.symbols !== baseline.counts.symbols || rename.counts.edges !== baseline.counts.edges) throw new Error("Rename did not preserve graph counts.");
    evidence.rename = { generationId: rename.generationId, counts: rename.counts, work: rename.lastIndexWork };

    renameSync(renamed, probe);
    activePath = probe;
    runCli("sync", project);
    renameSync(probe, deleted);
    activePath = deleted;
    const removal = runCli("sync", project);
    if (removal.counts.files !== baseline.counts.files - 1) throw new Error("Delete did not remove exactly one indexed CSS file.");
    evidence.delete = { generationId: removal.generationId, counts: removal.counts, work: removal.lastIndexWork };

    renameSync(deleted, probe);
    activePath = probe;
    const restore = runCli("sync", project);
    const reopen = runCli("status", project);
    if (!sameCounts(restore.counts, baseline.counts) || reopen.generationId !== restore.generationId || !sameCounts(reopen.counts, baseline.counts)) throw new Error("Restore or fresh-process reopen did not retain the baseline graph.");
    if (sha256(readFileSync(probe)) !== originalHash) throw new Error("Probe bytes were not restored exactly.");
    evidence.restore = { generationId: restore.generationId, counts: restore.counts, work: restore.lastIndexWork };
    evidence.reopen = { generationId: reopen.generationId, counts: reopen.counts };
    return { schemaVersion: 1, benchmark: "symbollattice-css-large-project-lifecycle-v1", project, probePath, originalSha256: originalHash, evidence, acceptance: { status: "pass" } };
  } finally {
    if (activePath !== probe && existsSync(activePath) && !existsSync(probe)) renameSync(activePath, probe);
    writeFileSync(probe, original);
    runCli("sync", project);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectPath = argument("--project");
  const probePath = argument("--probe");
  const output = argument("--output");
  if ([projectPath, probePath, output].some((value) => value === null)) throw new Error("Usage: --project <disposable project> --probe <relative.css> --output <json>");
  const report = runLifecycle({ projectPath, probePath });
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
}
