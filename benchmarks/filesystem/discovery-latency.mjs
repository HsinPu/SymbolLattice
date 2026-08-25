import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { discoverFreshnessProjectPaths } from "../../dist/infrastructure/filesystem/discovery.js";
import { isConfigurationCandidateFileName } from "../../dist/infrastructure/filesystem/configuration-discovery.js";

const WARMUP_REQUESTS = 3;
const MEASURED_REQUESTS = 30;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function rounded(value) {
  return Number(value.toFixed(3));
}

async function measure(projectPath) {
  const startedAt = performance.now();
  const paths = await discoverFreshnessProjectPaths(projectPath, {
    scopeRoots: ["."],
    isConfigurationCandidateFileName
  });
  return {
    elapsedMs: performance.now() - startedAt,
    sourcePaths: paths.sourcePaths.length,
    configurationPaths: paths.configurationPaths.length
  };
}

export async function runDiscoveryLatencyBenchmark(projectPath) {
  for (let index = 0; index < WARMUP_REQUESTS; index += 1) {
    await measure(projectPath);
  }

  const samples = [];
  let sourcePaths = 0;
  let configurationPaths = 0;
  for (let index = 0; index < MEASURED_REQUESTS; index += 1) {
    const result = await measure(projectPath);
    samples.push(result.elapsedMs);
    sourcePaths = result.sourcePaths;
    configurationPaths = result.configurationPaths;
  }

  return {
    schemaVersion: 1,
    benchmark: "filesystem-discovery-latency-v1",
    configuration: {
      persistentProcess: true,
      warmupRequests: WARMUP_REQUESTS,
      measuredRequests: MEASURED_REQUESTS
    },
    sourcePaths,
    configurationPaths,
    latencyMs: {
      p50: rounded(percentile(samples, 0.5)),
      p95: rounded(percentile(samples, 0.95)),
      mean: rounded(samples.reduce((sum, value) => sum + value, 0) / samples.length),
      max: rounded(Math.max(...samples))
    },
    samplesMs: samples.map(rounded),
    assertions: {
      minimumWarmups: WARMUP_REQUESTS >= 3,
      minimumMeasuredRequests: MEASURED_REQUESTS >= 30,
      allRequestsCompleted: samples.length === MEASURED_REQUESTS
    }
  };
}

const projectPath = argument("--project");
const output = argument("--output");
if (projectPath === null || output === null) {
  throw new Error("Usage: --project <indexed-project> --output <json>");
}

const report = await runDiscoveryLatencyBenchmark(resolve(projectPath));
writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
