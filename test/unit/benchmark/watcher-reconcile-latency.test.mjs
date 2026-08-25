import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const benchmarkPath = join(repositoryRoot, "benchmarks", "filesystem", "watcher-reconcile-latency.mjs");

const scenarios = [
  "semanticEdit",
  "commentEdit",
  "delete",
  "spuriousEvent",
  "pollingNoOp"
];

function sample(elapsedMs, overrides = {}) {
  return {
    elapsedMs,
    phases: {
      "freshness-preflight": 1,
      scan: 3,
      extraction: 2,
      publication: 1
    },
    readCounts: {
      source: 1,
      priority: 1,
      fullScan: 1
    },
    observedStale: false,
    freshnessPreflightCount: 0,
    fullScanCount: 0,
    priorityReadCount: 0,
    priorityPathsExact: false,
    ...overrides
  };
}

async function loadBenchmark() {
  return import(pathToFileURL(benchmarkPath).href);
}

describe("watcher reconcile latency benchmark", () => {
  it("declares the generic persistent 3-warmup/30-measurement contract", () => {
    const source = readFileSync(benchmarkPath, "utf8");

    expect(source).toContain("const WARMUP_REQUESTS = 3");
    expect(source).toContain("const MEASURED_REQUESTS = 30");
    expect(source).toContain("persistentProcess: true");
    expect(source).toContain("semanticEdit");
    expect(source).toContain("commentEdit");
    expect(source).toContain("spuriousEvent");
    expect(source).toContain("pollingNoOp");
    expect(source).toContain("phases");
    expect(source).toContain("readCounts");
    expect(source).toContain("semanticImprovementAtLeast30Percent");
    expect(source).toContain("commentImprovementAtLeast25Percent");
    expect(source).toContain("spuriousEventRegressionAtMost10Percent");
    expect(source).toContain("pollingNoOpRegressionAtMost10Percent");
    expect(source).toContain("observedStaleNoDuplicateFreshnessPreflight");
    expect(source).toContain("exactPriorityReadsAtMost25");
    expect(source).not.toContain("@hsinpu/");
    expect(source).not.toContain("git-first");
  });

  it("uses one persistent runner and records every scenario's phases and read counts", async () => {
    const { runWatcherReconcileBenchmark } = await loadBenchmark();
    const calls = [];
    const baseline = {
      scenarios: Object.fromEntries(
        scenarios.map((scenario) => [scenario, { latencyMs: { p95: 100 } }])
      )
    };
    const runner = {
      async runScenario({ scenario, warmup }) {
        calls.push({ scenario, warmup });
        const elapsedMs = scenario === "semanticEdit"
          ? 60
          : scenario === "commentEdit"
            ? 70
            : scenario === "spuriousEvent"
              ? 105
              : scenario === "pollingNoOp"
                ? 108
                : 80;
        const stale = ["semanticEdit", "commentEdit", "delete"].includes(scenario);
        return sample(elapsedMs, {
          observedStale: stale,
          freshnessPreflightCount: stale ? 1 : 0,
          fullScanCount: stale ? 1 : 0,
          priorityReadCount: stale ? 1 : 0,
          priorityPathsExact: stale
        });
      },
      async close() {
        calls.push({ closed: true });
      }
    };

    const report = await runWatcherReconcileBenchmark({
      projectPath: "C:/generic-project",
      runner,
      baseline
    });

    expect(calls.filter((call) => call.scenario !== undefined)).toHaveLength(5 * (3 + 30));
    expect(calls.at(-1)).toEqual({ closed: true });
    expect(report.configuration).toMatchObject({
      persistentProcess: true,
      warmupRequests: 3,
      measuredRequests: 30,
      scenarios
    });
    expect(Object.keys(report.scenarios)).toEqual(scenarios);
    for (const scenario of scenarios) {
      expect(report.scenarios[scenario]).toMatchObject({
        requestCount: 30,
        phases: expect.any(Object),
        readCounts: expect.any(Object),
        latencyMs: expect.objectContaining({ p95: expect.any(Number) })
      });
    }
    expect(report.assertions).toMatchObject({
      allScenarioRequestsCompleted: true,
      semanticImprovementAtLeast30Percent: true,
      commentImprovementAtLeast25Percent: true,
      spuriousEventRegressionAtMost10Percent: true,
      pollingNoOpRegressionAtMost10Percent: true,
      observedStaleNoDuplicateFreshnessPreflight: true,
      exactPriorityReadsAtMost25: true,
      allAssertionsPassed: true
    });
  });

  it("fails the stale and exact-priority assertions when the adapter reports duplicate or broad reads", async () => {
    const { runWatcherReconcileBenchmark } = await loadBenchmark();
    const runner = {
      async runScenario({ scenario }) {
        const stale = scenario === "semanticEdit";
        return sample(50, {
          observedStale: stale,
          freshnessPreflightCount: stale ? 2 : 0,
          fullScanCount: stale ? 2 : 0,
          priorityReadCount: stale ? 26 : 0,
          priorityPathsExact: stale
        });
      }
    };

    const report = await runWatcherReconcileBenchmark({
      projectPath: "C:/generic-project",
      runner,
      baseline: { scenarios: Object.fromEntries(scenarios.map((scenario) => [scenario, { latencyMs: { p95: 100 } }])) }
    });

    expect(report.assertions.observedStaleNoDuplicateFreshnessPreflight).toBe(false);
    expect(report.assertions.exactPriorityReadsAtMost25).toBe(false);
    expect(report.assertions.allAssertionsPassed).toBe(false);
  });
});
