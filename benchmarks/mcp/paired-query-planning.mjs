import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function isWithin(path, directory) {
  const remainder = relative(directory, path);
  return remainder === "" || (!isAbsolute(remainder) && remainder !== ".." &&
    !remainder.startsWith("../") && !remainder.startsWith("..\\"));
}

// Run separately from timing: count work performed by the existing seed
// comparator without changing its result or leaving the native sort replaced.
function measureSeedSortWork(run) {
  const originalSort = Array.prototype.sort;
  const work = { calls: 0, comparisons: 0, inputElements: 0 };
  try {
    Array.prototype.sort = function (compare) {
      if (compare?.name !== "compareLexicalSeedCandidates") return originalSort.call(this, compare);
      work.calls += 1;
      work.inputElements += this.length;
      return originalSort.call(this, (left, right) => {
        work.comparisons += 1;
        return compare(left, right);
      });
    };
    return { work, result: run() };
  } finally {
    Array.prototype.sort = originalSort;
  }
}

const project = option("--project");
const baselineRoot = option("--baseline-root");
const candidateRoot = option("--candidate-root");
const query = option("--query");
const output = option("--output");
const pairs = Number(option("--pairs") ?? 30);
if ([project, baselineRoot, candidateRoot, query, output].some((value) => value === null) ||
  !Number.isSafeInteger(pairs) || pairs < 1) {
  throw new Error("Usage: --project <indexed-checkout> --baseline-root <built-product> --candidate-root <built-product> --query <text> --output <external-report.json> [--pairs <positive-integer>]");
}
const roots = { baseline: resolve(baselineRoot), candidate: resolve(candidateRoot) };
const projectPath = resolve(project);
const outputPath = resolve(output);
if ([resolve("."), projectPath, ...Object.values(roots)].some((root) => isWithin(outputPath, root))) {
  throw new Error("Planning report must be outside the source, product, and indexed project directories");
}

const cases = {};
for (const [name, root] of Object.entries(roots)) {
  const modulePath = resolve(root, "dist/application/explore-query.js");
  const queryModule = await import(pathToFileURL(modulePath).href);
  cases[name] = {
    plan: queryModule.planExploreQuery,
    version: JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version,
    moduleSha256: createHash("sha256").update(readFileSync(modulePath)).digest("hex"),
    samples: []
  };
}

const { exploreQuerySeedTerms, EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS: limits } =
  await import(pathToFileURL(resolve(roots.candidate, "dist/application/explore-query.js")).href);
const { SqliteGraphStore } =
  await import(pathToFileURL(resolve(roots.candidate, "dist/infrastructure/sqlite/index.js")).href);
const store = new SqliteGraphStore({ readOnly: true });
try {
  const bundle = store.getActiveBoundedGraphBundle(projectPath, {
    query, ...exploreQuerySeedTerms(query),
    maxSeedFiles: limits.maximumSeedFiles,
    maxSeedSymbols: limits.maximumSeedSymbols,
    maxSymbolsPerFile: limits.maximumSeedSymbolsPerFile,
    maxNodes: limits.maximumNodes,
    maxRelationships: limits.maximumRelationships,
    maxHops: limits.maximumHops
  });
  assert.ok(bundle.status.initialized && !bundle.fallbackRequired);
  assert.ok(bundle.diagnostics.generationMatched);
  const warmupPairs = 4;
  let expected;
  for (let pair = -warmupPairs; pair < pairs; pair++) {
    for (const name of pair % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"]) {
      const started = performance.now();
      const result = cases[name].plan(bundle.snapshot, query, bundle.sourceLexical);
      const elapsedMs = performance.now() - started;
      if (expected === undefined) expected = result;
      else assert.deepEqual(result, expected, `${name} changed the complete query plan`);
      if (pair >= 0) cases[name].samples.push(elapsedMs);
    }
  }
  const upperMedian = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const candidateFasterPairs = cases.candidate.samples.filter((value, index) =>
    value < cases.baseline.samples[index]).length;
  const seedSortWork = {};
  for (const [name, entry] of Object.entries(cases)) {
    const measured = measureSeedSortWork(() => entry.plan(bundle.snapshot, query, bundle.sourceLexical));
    assert.deepEqual(measured.result, expected, `${name} work counting changed the complete query plan`);
    seedSortWork[name] = measured.work;
  }
  const report = {
    schemaVersion: 1,
    project: projectPath,
    generationId: bundle.status.generationId,
    query,
    graph: { symbols: bundle.snapshot.symbols.length, edges: bundle.snapshot.edges.length },
    conditions: { roots, pairs, warmupPairs, order: "alternating", statistic: "upper median",
      sameBoundedGraphBundle: true, completeQueryPlansEqual: true,
      scope: "synchronous focus planning only; excludes graph read, freshness, source rendering, and transport",
      node: process.version, platform: process.platform },
    products: Object.fromEntries(Object.entries(cases).map(([name, entry]) =>
      [name, { version: entry.version, moduleSha256: entry.moduleSha256 }])),
    mediansMs: Object.fromEntries(Object.entries(cases).map(([name, entry]) =>
      [name, upperMedian(entry.samples)])),
    candidateFasterPairs,
    seedSortWork,
    samples: Object.fromEntries(Object.entries(cases).map(([name, entry]) =>
      [name, entry.samples]))
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: outputPath, graph: report.graph,
    mediansMs: report.mediansMs, candidateFasterPairs, pairs, seedSortWork, completeQueryPlansEqual: true }));
} finally {
  store.close();
}
