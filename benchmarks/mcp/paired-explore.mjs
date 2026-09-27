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
const baselineRoot = argument("--baseline-root");
const candidateRoot = argument("--candidate-root");
const query = argument("--query");
const output = argument("--output");
const pairs = Number(argument("--pairs") ?? 8);
const comparison = argument("--comparison") ?? "complete";
if ([project, baselineRoot, candidateRoot, query, output].some((value) => value === null) ||
  !Number.isSafeInteger(pairs) || pairs < 1 || !["complete", "query-unresolved-calls"].includes(comparison)) {
  throw new Error("Usage: --project <indexed-checkout> --baseline-root <built-product> --candidate-root <built-product> --query <text> --output <json> [--pairs <positive-integer>] [--comparison complete|query-unresolved-calls]");
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
const cases = {};
for (const [name, root] of Object.entries(roots)) {
  const load = async (path) => import(pathToFileURL(resolve(root, "dist", path)).href);
  const { SymbolLatticeService } = await load("application/service.js");
  const { RecordingQueryTimingSink } = await load("application/query-timing.js");
  const { FileSystemSourceCatalog } = await load("infrastructure/filesystem/index.js");
  const { SqliteGraphStore } = await load("infrastructure/sqlite/index.js");
  const sink = new RecordingQueryTimingSink();
  const store = new SqliteGraphStore({ readOnly: true });
  const service = new SymbolLatticeService(store, new FileSystemSourceCatalog(),
    { queryTimingSink: sink });
  cases[name] = { service, store, sink, samples: [] };
}

const projectPath = resolve(project);
try {
  for (const entry of Object.values(cases)) await entry.service.explore(projectPath, query);
  for (let pair = 0; pair < pairs; pair += 1) {
    for (const name of pair % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"]) {
      const entry = cases[name];
      entry.sink.clear();
      const started = performance.now();
      await entry.service.explore(projectPath, query);
      const elapsedMs = performance.now() - started;
      const stages = Object.fromEntries(entry.sink.events().map((event) =>
        [event.stage, event.durationMs]));
      entry.samples.push({ pair, elapsedMs, stages });
    }
  }
  const baselineResult = await cases.baseline.service.explore(projectPath, query);
  const candidateResult = await cases.candidate.service.explore(projectPath, query);
  const completeExploreResultsEqual = isDeepStrictEqual(candidateResult, baselineResult);
  if (comparison === "complete") {
    assert.ok(completeExploreResultsEqual, "Candidate changed the complete explore result.");
  } else {
    assert.deepEqual(withoutQueryUnresolvedCallItems(candidateResult),
      withoutQueryUnresolvedCallItems(baselineResult),
      "Candidate changed output beyond query-focus unresolved-call items.");
  }
  const changedCallSelections = (candidateResult.focuses ?? []).flatMap((focus, index) => {
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
    conditions: { roots, pairs, warmupQueriesPerProduct: 1, order: "alternating",
      statistic: "upper median", comparison, completeExploreResultsEqual,
      comparisonScopeEqual: true,
      firstIndexing: "not measured", incrementalSync: "not measured" },
    medians, changedCallSelections, samples: Object.fromEntries(Object.entries(cases).map(([name, entry]) =>
      [name, entry.samples])) };
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: resolve(output), medians,
    completeExploreResultsEqual, changedCallSelectionCount: changedCallSelections.length }));
} finally {
  for (const entry of Object.values(cases)) entry.store.close();
}
