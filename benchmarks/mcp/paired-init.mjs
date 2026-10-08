import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { productFingerprint } from "./task-retrieval.mjs";

const argument = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const execute = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
};

// Run in a separate process so loading/checking an index cannot warm the next init.
async function inspect(root, project) {
  const { SqliteGraphStore } = await import(pathToFileURL(join(root,
    "dist/infrastructure/sqlite/index.js")).href);
  const store = new SqliteGraphStore({ readOnly: true });
  let bundle;
  try { bundle = store.getActiveGenerationBundle(project); }
  finally { store.close(); }
  assert.ok(bundle.status.initialized && bundle.indexInputs);
  const snapshot = { ...bundle.snapshot,
    files: bundle.snapshot.files.map(({ indexedAt: _time, ...file }) => file) };
  const db = new DatabaseSync(join(project, ".SymbolLattice/index.sqlite"), { readOnly: true });
  try {
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    const documents = db.prepare(`SELECT file_path, language, source_text FROM source_documents
      WHERE generation_id = ? ORDER BY file_path`).all(bundle.status.generationId);
    // Read the pinned checkout independently, rather than treating product text as truth.
    for (const document of documents) {
      assert.equal(document.source_text, new TextDecoder("utf-8").decode(
        readFileSync(join(project, document.file_path))));
    }
    return {
      counts: bundle.status.counts,
      snapshot: digest(snapshot),
      artifactFacts: digest(bundle.artifactFacts),
      indexInputs: digest(bundle.indexInputs),
      versions: { extractor: bundle.extractorVersion, resolver: bundle.resolverVersion,
        sourceSearch: bundle.sourceSearchVersion },
      sourceDocuments: digest(documents),
      sourceSearch: digest(db.prepare(`SELECT file_path, language, corpus FROM source_search
        WHERE generation_id = ? ORDER BY file_path`).all(bundle.status.generationId)),
      activeSourceSearch: digest(db.prepare(`SELECT file_path, language, corpus
        FROM active_source_search ORDER BY file_path`).all()),
      independentlyVerifiedSourceDocuments: documents.length,
      integrity: "ok"
    };
  } finally { db.close(); }
}

if (argument("--inspect-root")) {
  writeFileSync(argument("--inspect-output"), JSON.stringify(await inspect(
    resolve(argument("--inspect-root")), resolve(argument("--inspect-project"))
  ), null, 2));
} else {
  const names = ["source-project", "baseline-root", "candidate-root", "workspace", "output"];
  assert.ok(names.every(name => argument(`--${name}`)),
    "Usage: --source-project <pinned-checkout> --baseline-root <built-product> --candidate-root <built-product> --workspace <new-external-directory> --output <report.json> [--pairs 4]");
  const source = resolve(argument("--source-project"));
  const roots = { baseline: resolve(argument("--baseline-root")),
    candidate: resolve(argument("--candidate-root")) };
  const workspace = resolve(argument("--workspace"));
  const output = resolve(argument("--output"));
  const pairs = Number(argument("--pairs") ?? 4);
  assert.ok(Number.isSafeInteger(pairs) && pairs > 0);
  const within = (parent, child) => {
    const path = relative(parent, child);
    return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith("..\\") && !path.startsWith("../"));
  };
  for (const protectedRoot of [source, ...Object.values(roots), resolve(".")]) {
    assert.ok(!within(protectedRoot, workspace) && !within(workspace, protectedRoot),
      "Use an independent external workspace, outside source and product roots.");
    assert.ok(!within(protectedRoot, output), "Evidence output must be external.");
  }
  // Refuse reuse; every timing sample starts with an absent index. No directories are deleted.
  mkdirSync(workspace);
  const identity = {
    repository: execute("git", ["remote", "get-url", "origin"], source),
    commit: execute("git", ["rev-parse", "HEAD"], source)
  };
  assert.equal(execute("git", ["status", "--porcelain", "--untracked-files=no"], source), "");
  const builds = Object.fromEntries(Object.entries(roots).map(([name, root]) => [name, {
    root, version: execute(process.execPath, [join(root, "dist/cli/main.js"), "--version"], root),
    fingerprint: productFingerprint(root)
  }]));
  const samples = { baseline: [], candidate: [] };
  let expected;
  for (let pair = 0; pair < pairs; pair += 1) {
    const order = pair % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
    for (const name of order) {
      const project = join(workspace, `${pair}-${name}`);
      execute("git", ["clone", "--quiet", "--no-hardlinks", "--", source, project]);
      execute("git", ["remote", "set-url", "origin", identity.repository], project);
      assert.equal(execute("git", ["rev-parse", "HEAD"], project), identity.commit);
      const started = performance.now();
      const raw = execute(process.execPath, [join(roots[name], "dist/cli/main.js"),
        "init", project, "--json"], roots[name]);
      const processMilliseconds = performance.now() - started;
      const status = JSON.parse(raw);
      assert.equal(status.initialized, true);
      assert.equal(status.stale, false);
      const statusPath = join(workspace, `${pair}-${name}-init.json`);
      const inspectionPath = join(workspace, `${pair}-${name}-inspection.json`);
      writeFileSync(statusPath, `${raw}\n`);
      execute(process.execPath, [resolve(process.argv[1]), "--inspect-root", roots[name],
        "--inspect-project", project, "--inspect-output", inspectionPath]);
      const inspection = JSON.parse(readFileSync(inspectionPath, "utf8"));
      expected ??= inspection;
      assert.deepEqual(inspection, expected, "Complete indexed facts, graph or source projection changed");
      const sample = { pair, order, project, processMilliseconds,
        operationPerformance: status.operationPerformance, statusPath, inspectionPath, inspection };
      samples[name].push(sample);
      console.log(JSON.stringify({ pair, name, processMilliseconds,
        indexMilliseconds: status.operationPerformance.totalDurationMs, parity: true }));
    }
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const medians = Object.fromEntries(Object.entries(samples).map(([name, rows]) => [name, {
    processMilliseconds: median(rows.map(row => row.processMilliseconds)),
    indexMilliseconds: median(rows.map(row => row.operationPerformance.totalDurationMs)),
    phases: Object.fromEntries(rows[0].operationPerformance.phases.map(phase => [phase.name,
      median(rows.map(row => row.operationPerformance.phases.find(item => item.name === phase.name).durationMs))]))
  }]));
  for (const [name, root] of Object.entries(roots)) {
    assert.deepEqual(productFingerprint(root), builds[name].fingerprint, "Product build changed");
  }
  writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, identity, builds,
    conditions: { node: process.version, platform: process.platform, arch: process.arch,
      pairs, statistic: "upper median", order: "alternating", initialIndex: true,
      filesystemCache: "OS cache not cleared; fresh project and absent index per sample",
      cloneAndVerificationExcluded: true, concurrentWork: "run without other benchmarks or tests",
      processIncludes: "CLI startup, first indexing, status, diagnostics and process shutdown",
      sourceOracle: "each indexed source document equals independently read pinned source",
      qualityComparison: "complete raw facts, graph, index inputs and source/search projections; excludes timestamps and generation IDs",
      incrementalSync: false, queryLatency: false, fullAgentTaskCost: false },
    parity: expected, medians, samples }, null, 2)}\n`);
}
