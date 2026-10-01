import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { productFingerprint } from "./task-retrieval.mjs";

const option = name => process.argv[process.argv.indexOf(name) + 1];
for (const name of ["--inputs", "--baseline-root", "--candidate-root", "--output"])
  assert.ok(process.argv.includes(name) && option(name), `Missing ${name}`);
const pairs = process.argv.includes("--pairs") ? Number(option("--pairs")) : 30;
assert.ok(Number.isSafeInteger(pairs) && pairs > 0 && pairs <= 1000);
const inputText = readFileSync(resolve(option("--inputs")), "utf8"), fixtures = JSON.parse(inputText);
assert.ok(Array.isArray(fixtures) && fixtures.length > 0);
for (const fixture of fixtures) {
  assert.equal(typeof fixture.name, "string");
  assert.ok(Array.isArray(fixture.inputs) && fixture.inputs.length > 0);
  for (const args of fixture.inputs) {
    assert.ok(Array.isArray(args) && args.length >= 2 && args.length <= 4);
    assert.ok(Array.isArray(args[0].symbols) && Array.isArray(args[0].edges) && Array.isArray(args[1].selection));
  }
}
const roots = Object.fromEntries(["baseline", "candidate"].map(label => [label, resolve(option(`--${label}-root`))]));
const before = Object.fromEntries(Object.entries(roots).map(([label, root]) => [label, {
  version: JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version, build: productFingerprint(root)
}]));
const products = {};
for (const [label, root] of Object.entries(roots)) products[label] =
  (await import(pathToFileURL(resolve(root, "dist/application/explore-incoming-callers.js")))).supplementIncomingCallers;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const reports = fixtures.map(fixture => {
  const run = label => fixture.inputs.map(args => products[label](...args));
  assert.deepEqual(run("candidate"), run("baseline"), `Complete plan differs: ${fixture.name}`);
  for (let warmup = 0; warmup < 3; warmup++) { run("baseline"); run("candidate"); }
  const samples = { baseline: [], candidate: [] };
  for (let pair = 0; pair < pairs; pair++) {
    const outputs = {};
    for (const label of pair % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
      const start = performance.now(); outputs[label] = run(label); samples[label].push(performance.now() - start);
    }
    assert.deepEqual(outputs.candidate, outputs.baseline, `Complete plan differs: ${fixture.name}, pair ${pair}`);
  }
  return { task: fixture.name, passes: fixture.inputs.length, completeResultsEqual: true,
    rows: fixture.inputs.map(args => ({ symbols: args[0].symbols.length, edges: args[0].edges.length })),
    medians: { baseline: median(samples.baseline), candidate: median(samples.candidate) }, samples };
});
for (const [label, root] of Object.entries(roots)) assert.deepEqual(productFingerprint(root), before[label].build);
const report = { complete: true, products: before, inputSha256: createHash("sha256").update(inputText).digest("hex"),
  conditions: { warmups: 3, pairs, order: "alternating", statistic: "upper median",
    scope: "Captured helper inputs only; excludes SQL, source reads, delivery and whole-query latency" }, reports };
writeFileSync(resolve(option("--output")), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(reports.map(({ task, medians }) => ({ task, medians }))));
