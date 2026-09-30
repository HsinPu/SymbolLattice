import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const option = name => process.argv[process.argv.indexOf(name) + 1];
for (const name of ["--inputs", "--baseline-root", "--candidate-root", "--output"])
  assert.ok(process.argv.includes(name) && option(name), `Missing ${name}`);
const pairs = process.argv.includes("--pairs") ? Number(option("--pairs")) : 60;
assert.ok(Number.isSafeInteger(pairs) && pairs > 0 && pairs <= 1000);
const inputText = readFileSync(resolve(option("--inputs")), "utf8");
const fixture = JSON.parse(inputText);
assert.equal(fixture.schemaVersion, 1);
assert.ok(Array.isArray(fixture.inputs) && fixture.inputs.length > 0);
for (const input of fixture.inputs) {
  assert.equal(typeof input.sourceText, "string");
  assert.ok(Array.isArray(input.symbols) && Array.isArray(input.groups));
}
const sha256 = text => createHash("sha256").update(text).digest("hex");
const roots = { baseline: resolve(option("--baseline-root")), candidate: resolve(option("--candidate-root")) };
const fingerprint = root => ({
  version: JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version,
  sourceSha256: sha256(readFileSync(resolve(root, "dist/domain/source-lexical.js"))),
  identifierSha256: sha256(readFileSync(resolve(root, "dist/domain/identifier-search.js")))
});
const products = {};
const before = Object.fromEntries(Object.entries(roots).map(([name, root]) => [name, fingerprint(root)]));
for (const [name, root] of Object.entries(roots))
  products[name] = await import(pathToFileURL(resolve(root, "dist/domain/source-lexical.js")));
const run = name => {
  // Match production's query-local membership cache across source files.
  const cache = new Map();
  const results = fixture.inputs.map(input => products[name].matchCallableSource(
    input.sourceText, input.symbols, input.groups, cache));
  return { results, scored: products[name].scoreCallableSource(results.flatMap(result => result.documents)) };
};
for (let warmup = 0; warmup < 4; warmup++) { run("baseline"); run("candidate"); }
const samples = { baseline: [], candidate: [] };
for (let pair = 0; pair < pairs; pair++) {
  const results = {};
  for (const name of pair % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
    const started = performance.now();
    results[name] = run(name);
    samples[name].push(performance.now() - started);
  }
  assert.deepEqual(results.candidate, results.baseline, "Source tokens/frequencies/receipts/truncation/scores changed");
}
for (const [name, root] of Object.entries(roots)) assert.deepEqual(fingerprint(root), before[name], "Build changed during benchmark");
const medians = Object.fromEntries(Object.entries(samples).map(([name, values]) =>
  [name, [...values].sort((a, b) => a - b)[Math.floor(pairs / 2)]]));
const report = { schemaVersion: 1, roots, products: before, inputSha256: sha256(inputText),
  corpus: { repository: fixture.repository, commit: fixture.commit, generationId: fixture.generationId, query: fixture.query },
  conditions: { pairs, warmups: 4, order: "alternating", node: process.version, platform: process.platform,
    scope: "Supplied frozen source-scan inputs and BM25 scoring only; excludes SQL, graph planning, freshness, transport and serialization" },
  population: { files: fixture.inputs.length, characters: fixture.inputs.reduce((sum, input) => sum + input.sourceText.length, 0),
    symbols: fixture.inputs.reduce((sum, input) => sum + input.symbols.length, 0) },
  completeResultsEqual: true, medians, samples };
writeFileSync(resolve(option("--output")), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ medians, population: report.population, completeResultsEqual: true }));
