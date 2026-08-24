import { execFile } from "node:child_process";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { SqliteGraphStore } from "../../dist/infrastructure/sqlite/index.js";

const execute = promisify(execFile);

function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (key === "--project") options.project = resolve(value);
    else if (key === "--source") options.source = value.replaceAll("\\", "/");
    else if (key === "--output") options.output = resolve(value);
    else throw new Error(`Unknown or incomplete argument: ${key}`);
  }
  if (!options.project || !options.source || !options.output) {
    throw new Error("Usage: --project <path> --source <relative.java> --output <json>");
  }
  if (!options.project.replaceAll("\\", "/").includes("/java-workspaces/")) {
    throw new Error("Lifecycle mutations are restricted to a java-workspaces disposable copy.");
  }
  return options;
}

async function cli(project, operation) {
  const { stdout } = await execute(
    process.execPath,
    [resolve("dist/cli/main.js"), operation, project, "--json"],
    { cwd: resolve("."), windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

function snapshotSummary(project) {
  const store = new SqliteGraphStore();
  try {
    const snapshot = store.getSnapshot(project);
    return {
      counts: {
        files: snapshot.files.length,
        symbols: snapshot.symbols.length,
        edges: snapshot.edges.length,
        pendingReferences: snapshot.pendingReferences.length
      },
      probeSymbols: snapshot.symbols
        .filter((symbol) => symbol.name.startsWith("SymbolLatticeLifecycle"))
        .map((symbol) => ({ id: symbol.id, name: symbol.name, kind: symbol.kind, filePath: symbol.filePath })),
      probeEdges: snapshot.edges
        .filter((edge) => edge.referenceName?.startsWith("SymbolLatticeLifecycle"))
        .map((edge) => ({
          kind: edge.kind,
          resolution: edge.resolution,
          confidence: edge.confidence,
          candidates: edge.evidence?.candidateSymbolIds?.length ?? 0
        }))
    };
  } finally {
    store.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const sourcePath = resolve(options.project, options.source);
  const renamedPath = sourcePath.replace(/\.java$/u, ".renamed.java");
  const original = await readFile(sourcePath);
  const steps = [];
  let baseline;
  try {
    const baselineStatus = await cli(options.project, "status");
    baseline = snapshotSummary(options.project);
    const noop = await cli(options.project, "sync");
    if (noop.generationId !== baselineStatus.generationId) throw new Error("No-op changed generation.");
    steps.push({ name: "noop", status: noop, snapshot: snapshotSummary(options.project) });

    await writeFile(sourcePath, Buffer.concat([original, Buffer.from("\n// SymbolLattice lifecycle comment\n")]));
    const comment = await cli(options.project, "sync");
    const commentSnapshot = snapshotSummary(options.project);
    if (JSON.stringify(commentSnapshot.counts) !== JSON.stringify(baseline.counts)) {
      throw new Error("Comment-only sync changed graph counts.");
    }
    steps.push({ name: "comment", status: comment, snapshot: commentSnapshot });

    const semanticText = [
      "",
      "class SymbolLatticeLifecycleProbe {",
      "  static void SymbolLatticeLifecycleTarget() {}",
      "  static void SymbolLatticeLifecycleCaller() {",
      "    SymbolLatticeLifecycleTarget();",
      "    new SymbolLatticeLifecycleProbe();",
      "  }",
      "}",
      ""
    ].join("\n");
    await writeFile(sourcePath, Buffer.concat([original, Buffer.from(semanticText)]));
    const semantic = await cli(options.project, "sync");
    const semanticSnapshot = snapshotSummary(options.project);
    if (semanticSnapshot.probeSymbols.length < 3) throw new Error("Semantic probe symbols were not indexed.");
    if (!semanticSnapshot.probeEdges.some((edge) => edge.kind === "calls" && edge.resolution === "exact" && edge.candidates === 1)) {
      throw new Error("Semantic probe exact call was not indexed.");
    }
    steps.push({ name: "semantic", status: semantic, snapshot: semanticSnapshot });

    await rename(sourcePath, renamedPath);
    const renamed = await cli(options.project, "sync");
    const renamedSnapshot = snapshotSummary(options.project);
    if (!renamedSnapshot.probeSymbols.every((symbol) => symbol.filePath.endsWith(".renamed.java"))) {
      throw new Error("Rename did not move probe symbols to the new file identity.");
    }
    steps.push({ name: "rename", status: renamed, snapshot: renamedSnapshot });

    await writeFile(sourcePath, original);
    await unlink(renamedPath);
    const deleted = await cli(options.project, "sync");
    const deletedSnapshot = snapshotSummary(options.project);
    if (deletedSnapshot.probeSymbols.length !== 0) throw new Error("Delete retained probe symbols.");
    steps.push({ name: "delete", status: deleted, snapshot: deletedSnapshot });
  } finally {
    await writeFile(sourcePath, original);
    try { await unlink(renamedPath); } catch {}
  }

  const restore = await cli(options.project, "sync");
  const restoredSnapshot = snapshotSummary(options.project);
  if (baseline === undefined) throw new Error("Baseline snapshot was not captured.");
  if (JSON.stringify(restoredSnapshot.counts) !== JSON.stringify(baseline.counts)) {
    throw new Error("Restore did not return to baseline graph counts.");
  }
  const reopenStatus = await cli(options.project, "status");
  const result = { schemaVersion: 1, benchmark: "symbollattice-java-lifecycle-v1", baseline, steps, restore, restoredSnapshot, reopenStatus };
  await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ output: options.output, steps: steps.map((step) => step.name), counts: restoredSnapshot.counts }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
