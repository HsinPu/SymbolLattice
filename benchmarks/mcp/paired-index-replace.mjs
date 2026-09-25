import assert from "node:assert/strict";
import { statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

const sourceProject = argument("--source-project");
const baselineProject = argument("--baseline-project");
const candidateProject = argument("--candidate-project");
const baselineRoot = argument("--baseline-root");
const candidateRoot = argument("--candidate-root");
const output = argument("--output");
const pairs = Number(argument("--pairs") ?? 4);
if ([sourceProject, baselineProject, candidateProject, baselineRoot, candidateRoot, output]
  .some((value) => value === null) || !Number.isSafeInteger(pairs) || pairs < 1) {
  throw new Error("Usage: --source-project <indexed-checkout> --baseline-project <disposable-index-copy> --candidate-project <disposable-index-copy> --baseline-root <built-product> --candidate-root <built-product> --output <external-report.json> [--pairs <positive-integer>]");
}

const projects = {
  source: resolve(sourceProject),
  baseline: resolve(baselineProject),
  candidate: resolve(candidateProject)
};
assert.equal(new Set(Object.values(projects)).size, 3,
  "Source and disposable project directories must be different.");
const roots = { baseline: resolve(baselineRoot), candidate: resolve(candidateRoot) };
const load = async (root) => {
  const url = pathToFileURL(resolve(root, "dist/infrastructure/sqlite/index.js"));
  return (await import(url.href)).SqliteGraphStore;
};

const SourceStore = await load(roots.candidate);
const sourceStore = new SourceStore({ readOnly: true });
let bundle;
try {
  bundle = sourceStore.getActiveGenerationBundle(projects.source);
} finally {
  sourceStore.close();
}
assert.ok(bundle.status.generationId && bundle.indexInputs && bundle.resolverVersion &&
  bundle.sourceSearchVersion, "Source project needs a complete active index generation.");
const sourceDb = new DatabaseSync(join(projects.source, ".SymbolLattice", "index.sqlite"),
  { readOnly: true });
let sourceDocuments;
try {
  sourceDocuments = sourceDb.prepare("SELECT file_path, language, source_text FROM source_documents WHERE generation_id = ? ORDER BY file_path")
    .all(bundle.status.generationId)
    .map((row) => ({ filePath: row.file_path, language: row.language,
      sourceText: row.source_text }));
} finally {
  sourceDb.close();
}
const input = {
  snapshot: bundle.snapshot,
  artifactFacts: bundle.artifactFacts,
  indexInputs: bundle.indexInputs,
  resolverVersion: bundle.resolverVersion,
  indexedAt: bundle.status.indexedAt,
  sourceDocuments,
  sourceSearchVersion: bundle.sourceSearchVersion,
  ...(bundle.status.lastIndexWork ? { indexWork: bundle.status.lastIndexWork } : {})
};

const cases = {};
for (const [name, root] of Object.entries(roots)) {
  const Store = await load(root);
  const store = new Store();
  assert.deepEqual(store.getStatus(projects[name]).counts, bundle.status.counts,
    `${name} disposable index does not match the source counts.`);
  cases[name] = { store, samples: [] };
}

const originalExec = DatabaseSync.prototype.exec;
const foldedOperations = [];
let activeName = null;
DatabaseSync.prototype.exec = function(sql) {
  const started = performance.now();
  const value = originalExec.call(this, sql);
  if (activeName === "candidate" &&
    (sql.startsWith("DELETE FROM symbol_casefolds") ||
      sql.startsWith("INSERT INTO symbol_casefolds"))) {
    foldedOperations.push({ pair: currentPair,
      operation: sql.startsWith("DELETE") ? "delete" : "insert",
      elapsedMs: performance.now() - started });
  }
  return value;
};
let currentPair = -1;
try {
  for (let pair = 0; pair < pairs; pair += 1) {
    currentPair = pair;
    for (const name of pair % 2 === 0 ? ["baseline", "candidate"] :
      ["candidate", "baseline"]) {
      const entry = cases[name];
      const project = projects[name];
      const before = entry.store.getStatus(project);
      const indexPath = join(project, ".SymbolLattice", "index.sqlite");
      const sizeBefore = statSync(indexPath).size;
      activeName = name;
      const started = performance.now();
      entry.store.replaceProjectFacts({ ...input, projectPath: project });
      const elapsedMs = performance.now() - started;
      activeName = null;
      const after = entry.store.getStatus(project);
      assert.notEqual(after.generationId, before.generationId);
      assert.deepEqual(after.counts, bundle.status.counts);
      entry.samples.push({ pair, elapsedMs,
        fileSizeDeltaMiB: (statSync(indexPath).size - sizeBefore) / 1048576 });
    }
  }
} finally {
  activeName = null;
  DatabaseSync.prototype.exec = originalExec;
  for (const entry of Object.values(cases)) entry.store.close();
}

const upperMedian = (values) => [...values].sort((left, right) => left - right)
  [Math.floor(values.length / 2)];
const medians = Object.fromEntries(Object.entries(cases).map(([name, entry]) =>
  [name, upperMedian(entry.samples.map((sample) => sample.elapsedMs))]));
const report = {
  schemaVersion: 1,
  projects,
  roots,
  conditions: {
    pairs,
    order: "alternating",
    statistic: "upper median",
    input: { ...bundle.status.counts, sourceDocuments: sourceDocuments.length,
      artifactFacts: input.artifactFacts.length },
    completeReplacement: true,
    filesystemScan: false,
    parserAndResolver: false
  },
  medians,
  samples: Object.fromEntries(Object.entries(cases).map(([name, entry]) =>
    [name, entry.samples])),
  foldedOperations
};
writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: resolve(output), medians, foldedOperations }));
