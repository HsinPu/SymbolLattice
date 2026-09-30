import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

const project = argument("--project");
const candidateProject = argument("--candidate-project") ?? project;
const baselineRoot = argument("--baseline-root");
const candidateRoot = argument("--candidate-root");
const query = argument("--query");
const output = argument("--output");
const pairs = Number(argument("--pairs") ?? 8);
const comparison = argument("--comparison") ?? "complete";
const persistentReader = process.argv.includes("--persistent-reader");
if ([project, baselineRoot, candidateRoot, query, output].some((value) => value === null) ||
  !Number.isSafeInteger(pairs) || pairs < 1 || !["complete", "query-unresolved-calls", "timing-only"].includes(comparison)) {
  throw new Error("Usage: --project <indexed-checkout> [--candidate-project <separate-indexed-checkout>] --baseline-root <built-product> --candidate-root <built-product> --query <text> --output <json> [--pairs <positive-integer>] [--comparison complete|query-unresolved-calls|timing-only] [--persistent-reader]");
}

function withoutQueryUnresolvedCallItems(result) {
  assert.equal(result.mode, "query", "Selective call comparison requires query mode");
  const copy = structuredClone(result);
  for (const focus of copy.focuses ?? []) {
    if (focus.unresolvedCalls !== undefined) focus.unresolvedCalls.items = [];
  }
  return copy;
}

const roots = { baseline: resolve(baselineRoot), candidate: resolve(candidateRoot) };
const projectPath = resolve(project);
const cases = {};
for (const [name, root] of Object.entries(roots)) {
  const indexedProject = name === "candidate" ? resolve(candidateProject) : projectPath;
  const load = async (path) => import(pathToFileURL(resolve(root, "dist", path)).href);
  const { SymbolLatticeService } = await load("application/service.js");
  const { RecordingQueryTimingSink } = await load("application/query-timing.js");
  const { FileSystemSourceCatalog } = await load("infrastructure/filesystem/index.js");
  const { SqliteGraphStore } = await load("infrastructure/sqlite/index.js");
  const sink = new RecordingQueryTimingSink();
  const store = new SqliteGraphStore({ readOnly: true,
    ...(persistentReader ? { persistentReadProjectPath: indexedProject } : {}) });
  const service = new SymbolLatticeService(store, new FileSystemSourceCatalog(),
    { queryTimingSink: sink });
  cases[name] = { service, store, sink, project: indexedProject, samples: [] };
}

try {
  for (const entry of Object.values(cases)) await entry.service.explore(entry.project, query);
  for (let pair = 0; pair < pairs; pair += 1) {
    for (const name of pair % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"]) {
      const entry = cases[name];
      entry.sink.clear();
      const started = performance.now();
      await entry.service.explore(entry.project, query);
      const elapsedMs = performance.now() - started;
      const stages = Object.fromEntries(entry.sink.events().map((event) =>
        [event.stage, event.durationMs]));
      entry.samples.push({ pair, elapsedMs, stages });
    }
  }
  const baselineResult = await cases.baseline.service.explore(cases.baseline.project, query);
  const candidateResult = await cases.candidate.service.explore(cases.candidate.project, query);
  const completeExploreResultsEqual = isDeepStrictEqual(candidateResult, baselineResult);
  if (comparison === "complete") {
    assert.ok(completeExploreResultsEqual, "Candidate changed the complete explore result.");
  } else if (comparison === "query-unresolved-calls") {
    assert.deepEqual(withoutQueryUnresolvedCallItems(candidateResult),
      withoutQueryUnresolvedCallItems(baselineResult),
      "Candidate changed output beyond query-focus unresolved-call items.");
  }
  const changedCallSelections = comparison === "timing-only" ? null : (candidateResult.focuses ?? []).flatMap((focus, index) => {
    const previous = baselineResult.focuses?.[index];
    const before = previous?.unresolvedCalls?.items.map((edge) => edge.id) ?? [];
    const after = focus.unresolvedCalls?.items.map((edge) => edge.id) ?? [];
    return isDeepStrictEqual(before, after) ? [] : [{ reference: focus.reference,
      before, after }];
  });

  const upperMedian = (values) => [...values].sort((left, right) => left - right)
    [Math.floor(values.length / 2)];
  const medians = Object.fromEntries(Object.entries(cases).map(([name, entry]) => [name, {
    elapsedMs: upperMedian(entry.samples.map((sample) => sample.elapsedMs)),
    seedRetrievalMs: upperMedian(entry.samples.map((sample) => sample.stages["seed-retrieval"])),
    planningMs: upperMedian(entry.samples.map((sample) => sample.stages.planning))
  }]));
  const report = { schemaVersion: 1, project: projectPath, query,
    conditions: { roots, projects: { baseline: cases.baseline.project, candidate: cases.candidate.project },
      pairs, warmupQueriesPerProduct: 1, order: "alternating",
      persistentReader,
      statistic: "upper median", comparison, completeExploreResultsEqual,
      comparisonScopeEqual: comparison === "timing-only" ? null : true,
      firstIndexing: "not measured", incrementalSync: "not measured" },
    medians, changedCallSelections, samples: Object.fromEntries(Object.entries(cases).map(([name, entry]) =>
      [name, entry.samples])) };
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: resolve(output), medians,
    completeExploreResultsEqual, changedCallSelectionCount: changedCallSelections?.length ?? null }));
} finally {
  for (const entry of Object.values(cases)) entry.store.close();
}
