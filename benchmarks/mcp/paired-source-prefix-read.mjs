import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join, relative, isAbsolute } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const option = name => process.argv[process.argv.indexOf(name) + 1];
for (const name of ["--project", "--manifest", "--baseline-root", "--candidate-root", "--output"])
  assert.ok(process.argv.includes(name) && option(name), `Missing ${name}`);
const pairs = process.argv.includes("--pairs") ? Number(option("--pairs")) : 100;
assert.ok(Number.isSafeInteger(pairs) && pairs > 0 && pairs <= 1000);
const project = resolve(option("--project"));
const manifestText = readFileSync(resolve(option("--manifest")), "utf8"), manifest = JSON.parse(manifestText);
const query = manifest.tasks[0].query;
const roots = { baseline: resolve(option("--baseline-root")), candidate: resolve(option("--candidate-root")) };
const output = resolve(option("--output"));
for (const root of [project, ...Object.values(roots), resolve(".")]) {
  const distance = relative(root, output);
  const inside = distance === "" || (!isAbsolute(distance) && distance !== ".." &&
    !distance.startsWith("../") && !distance.startsWith("..\\"));
  assert.ok(!inside, "Report output must be outside the corpus and product workspaces");
}
const sha256 = value => createHash("sha256").update(value).digest("hex");
const fingerprint = root => ({ version: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
  graphStoreSha256: sha256(readFileSync(join(root, "dist/infrastructure/sqlite/graph-store.js"))) });
const products = Object.fromEntries(Object.entries(roots).map(([name, root]) => [name, fingerprint(root)]));
const captures = {};
let expectedBundle;
for (const [name, root] of Object.entries(roots)) {
  const load = path => import(pathToFileURL(join(root, "dist", path)).href);
  const { SqliteGraphStore } = await load("infrastructure/sqlite/index.js");
  const { exploreQuerySeedTerms, EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS: limits } = await load("application/explore-query.js");
  const store = new SqliteGraphStore({ readOnly: true, persistentReadProjectPath: project });
  const calls = [];
  const originalPrepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function (sql) {
    const statement = originalPrepare.call(this, sql);
    if (!sql.includes("substr(source_text, 1, ?)") || !sql.includes("FROM source_documents")) return statement;
    return new Proxy(statement, { get(target, property) {
      if (property === "get") return (...args) => { calls.push({ sql, args }); return target.get(...args); };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  };
  try {
    const bundle = store.getActiveBoundedGraphBundle(project, { query, ...exploreQuerySeedTerms(query),
      maxSeedFiles: limits.maximumSeedFiles, maxSeedSymbols: limits.maximumSeedSymbols,
      maxSymbolsPerFile: limits.maximumSeedSymbolsPerFile, maxNodes: limits.maximumNodes,
      maxRelationships: limits.maximumRelationships, maxHops: limits.maximumHops });
    if (expectedBundle === undefined) expectedBundle = bundle;
    else assert.deepEqual(bundle, expectedBundle, "Complete bounded bundle changed");
    captures[name] = calls;
  } finally { DatabaseSync.prototype.prepare = originalPrepare; store.close(); }
}
assert.ok(captures.baseline.length > 0, "Source-prefix SQL was not used; this query is outside the probe's scope");
assert.deepEqual(captures.candidate.map(call => call.args), captures.baseline.map(call => call.args));
const database = new DatabaseSync(join(project, ".SymbolLattice/index.sqlite"), { readOnly: true });
const samples = { baseline: [], candidate: [] };
let population;
try {
  database.exec("BEGIN");
  const statements = Object.fromEntries(Object.entries(captures).map(([name, calls]) => {
    assert.ok(calls.every(call => call.sql === calls[0].sql));
    return [name, database.prepare(calls[0].sql)];
  }));
  const run = name => captures[name].map(call => statements[name].get(...call.args));
  const verify = (baseline, candidate) => {
    for (let index = 0; index < baseline.length; index++) {
      const before = baseline[index], after = candidate[index], limit = captures.baseline[index].args[0] - 1;
      assert.equal(after?.source_text, before?.source_text);
      if (before !== undefined) assert.equal(after.source_text.length > limit,
        before.characters > limit || before.source_text.length > limit, "Truncation changed");
    }
  };
  const initial = run("baseline"); verify(initial, run("candidate"));
  population = { sourceReads: initial.length, returnedCodeUnits: initial.reduce((sum, row) => sum + (row?.source_text.length ?? 0), 0),
    originalSQLiteCharacters: initial.reduce((sum, row) => sum + (row?.characters ?? 0), 0) };
  for (let warmup = 0; warmup < 4; warmup++) { run("baseline"); run("candidate"); }
  for (let pair = 0; pair < pairs; pair++) {
    const results = {};
    for (const name of pair % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
      const started = performance.now(); results[name] = run(name); samples[name].push(performance.now() - started);
    }
    verify(results.baseline, results.candidate);
  }
} finally { database.close(); }
for (const [name, root] of Object.entries(roots)) assert.deepEqual(fingerprint(root), products[name]);
const medians = Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, [...values].sort((a, b) => a - b)[Math.floor(pairs / 2)]]));
const report = { schemaVersion: 1, products, project, repository: manifest.repository, commit: manifest.commit,
  manifestSha256: sha256(manifestText), query, generationId: expectedBundle.status.generationId,
  conditions: { pairs, warmups: 4, order: "alternating", node: process.version, platform: process.platform,
    scope: "Captured source-prefix SQL on one read-only transaction; excludes scanner, graph traversal, freshness, planning and assertions" },
  completeBundlesEqual: true, prefixesAndTruncationEqual: true, population, medians, samples };
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ medians, population, completeBundlesEqual: true, prefixesAndTruncationEqual: true }));
