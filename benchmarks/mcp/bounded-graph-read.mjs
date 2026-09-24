import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { productFingerprint } from "./task-retrieval.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const project = option("--project");
const query = option("--query");
const output = option("--output");
assert.ok(project && query && output,
  "Required: --project <indexed checkout> --query <text> --output <report.json> [--product-root <built checkout>] [--repetitions <n>]");
const projectPath = resolve(project);
const productRoot = resolve(option("--product-root") ?? ".");
const repetitions = Number(option("--repetitions") ?? 6);
assert.ok(Number.isSafeInteger(repetitions) && repetitions > 0 && repetitions <= 100);
const git = (...parameters) => execFileSync("git", parameters, { cwd: projectPath, encoding: "utf8" }).trim();
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "", "Corpus tracked source changed");
const productBuild = productFingerprint(productRoot);
const { exploreQuerySeedTerms, EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS: limits } =
  await import(pathToFileURL(join(productRoot, "dist/application/explore-query.js")).href);
const { SqliteGraphStore } =
  await import(pathToFileURL(join(productRoot, "dist/infrastructure/sqlite/index.js")).href);
const request = {
  query, ...exploreQuerySeedTerms(query),
  maxSeedFiles: limits.maximumSeedFiles,
  maxSeedSymbols: limits.maximumSeedSymbols,
  maxSymbolsPerFile: limits.maximumSeedSymbolsPerFile,
  maxNodes: limits.maximumNodes,
  maxRelationships: limits.maximumRelationships,
  maxHops: limits.maximumHops
};
const store = new SqliteGraphStore({ persistentReadProjectPath: projectPath, readOnly: true });
let report;
try {
  const elapsedMilliseconds = [];
  let responseSha256;
  let counts;
  for (let index = 0; index < repetitions; index++) {
    const started = performance.now();
    const bundle = store.getActiveBoundedGraphBundle(projectPath, request);
    elapsedMilliseconds.push(Number((performance.now() - started).toFixed(3)));
    const digest = createHash("sha256").update(JSON.stringify(bundle)).digest("hex");
    if (responseSha256 === undefined) responseSha256 = digest;
    else assert.equal(digest, responseSha256, "Bounded graph response changed between reads");
    counts = {
      indexedSymbols: bundle.status.counts.symbols,
      returnedSymbols: bundle.snapshot.symbols.length,
      returnedEdges: bundle.snapshot.edges.length
    };
  }
  global.gc?.();
  const sorted = [...elapsedMilliseconds].sort((left, right) => left - right);
  report = {
    schemaVersion: 1,
    benchmark: "bounded-graph-read-v1",
    repository: git("remote", "get-url", "origin"),
    commit: git("rev-parse", "HEAD"),
    productVersion: JSON.parse(readFileSync(join(productRoot, "package.json"), "utf8")).version,
    productBuild,
    conditions: { projectPath, query, repetitions, node: process.version, platform: process.platform,
      persistentReadConnection: true, existingIndex: true,
      timing: "Synchronous bounded graph store read only; excludes startup, freshness checks, MCP transport, and serialization." },
    responseSha256,
    counts,
    elapsedMilliseconds,
    medianMilliseconds: sorted[Math.floor(sorted.length / 2)],
    memoryAfterGc: global.gc ? process.memoryUsage() : null
  };
} finally {
  store.close();
}
assert.deepEqual(productFingerprint(productRoot), productBuild, "Product build changed during evaluation");
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
