import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function argumentsByName(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error("Expected --project, --baseline-product-root, --candidate-product-root, --output, and optional --repetitions");
    }
    values.set(name, value);
  }
  return values;
}

function isWithin(path, directory) {
  const remainder = relative(directory, path);
  return remainder === "" || (!isAbsolute(remainder) && remainder !== ".." &&
    !remainder.startsWith("../") && !remainder.startsWith("..\\"));
}

async function product(root) {
  const modulePath = resolve(root, "dist/infrastructure/filesystem/index.js");
  const { FileSystemSourceCatalog } = await import(pathToFileURL(modulePath).href);
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  return { root, version: packageJson.version, fingerprint: fingerprint(root), catalog: new FileSystemSourceCatalog() };
}

function fingerprint(root) {
  return Object.fromEntries(["source-catalog.js", "discovery.js", "scoped-walker.js", "project-filesystem.js", "native-prefix-read.js"]
    .map(name => { const path = resolve(root, "dist/infrastructure/filesystem", name);
      return [name, existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null]; }));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

const args = argumentsByName(process.argv.slice(2));
const projectPath = resolve(args.get("--project") ?? "");
const baselineRoot = resolve(args.get("--baseline-product-root") ?? "");
const candidateRoot = resolve(args.get("--candidate-product-root") ?? "");
const outputPath = resolve(args.get("--output") ?? "");
const repetitions = Number(args.get("--repetitions") ?? 6);
if (["--project", "--baseline-product-root", "--candidate-product-root", "--output"].some(name => !args.has(name)) ||
  !Number.isInteger(repetitions) || repetitions < 1) {
  throw new Error("Pass both product roots, an indexed project, an external output path, and a positive repetition count");
}
if ([projectPath, baselineRoot, candidateRoot, resolve(".")].some(root => isWithin(outputPath, root))) {
  throw new Error("Benchmark output must be outside the source, product, and indexed project directories");
}

const baseline = await product(baselineRoot);
const candidate = await product(candidateRoot);
const { SqliteGraphStore } = await import(pathToFileURL(resolve(candidateRoot, "dist/infrastructure/sqlite/index.js")).href);
const store = new SqliteGraphStore({ readOnly: true });
const bundle = (() => { try { return store.getActiveStatusBundle(projectPath); } finally { store.close(); } })();
assert.ok(bundle.indexInputs, "The project must have an active index");
const input = { files: bundle.files, indexInputs: bundle.indexInputs };
const products = { baseline, candidate };
const samples = { baseline: [], candidate: [] };
const warmupPairs = 2;
let expectedReceipt;
for (let pair = 0; pair < warmupPairs + repetitions; pair++) {
  const order = pair % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
  for (const name of order) {
    const startedAt = performance.now();
    const result = await products[name].catalog.verifyFreshness(projectPath, input);
    const elapsedMs = performance.now() - startedAt;
    assert.equal(result.outcome, "proven-unchanged", `${name} found a stale index`);
    assert.equal(result.complete, true);
    assert.equal(result.filesChecked, bundle.files.length);
    const { performance: _performance, ...receipt } = result;
    if (expectedReceipt === undefined) expectedReceipt = receipt;
    else assert.deepEqual(receipt, expectedReceipt, "Freshness evidence changed");
    if (pair >= warmupPairs) {
      samples[name].push({
        elapsedMs,
        phases: Object.fromEntries(result.performance.phases.map(phase => [phase.name, phase.durationMs]))
      });
    }
  }
}
for (const value of Object.values(products)) assert.deepEqual(fingerprint(value.root), value.fingerprint, "Product changed during measurement");
const git = (...args) => execFileSync("git", args, { cwd: projectPath, encoding: "utf8" }).trim();
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "", "Corpus tracked sources changed");

const report = {
  schemaVersion: 1,
  benchmark: "paired-full-content-freshness-v1",
  projectPath,
  generationId: bundle.status.generationId,
  indexedFiles: bundle.files.length,
  repository: git("remote", "get-url", "origin"),
  commit: git("rev-parse", "HEAD"),
  runtime: { node: process.version, platform: process.platform },
  completeFreshnessReceiptsEqual: true,
  receipt: expectedReceipt,
  repetitions,
  warmupPairs,
  order: "baseline, candidate, candidate, baseline, repeated",
  products: {
    baseline: { root: baseline.root, version: baseline.version, fingerprint: baseline.fingerprint },
    candidate: { root: candidate.root, version: candidate.version, fingerprint: candidate.fingerprint }
  },
  mediansMs: Object.fromEntries(Object.entries(samples).map(([name, rows]) => [name, {
    total: median(rows.map(row => row.elapsedMs)),
    discovery: median(rows.map(row => row.phases["freshness-discovery"]))
  }])),
  samples
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, mediansMs: report.mediansMs, indexedFiles: report.indexedFiles })}\n`);
