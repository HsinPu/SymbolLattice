import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const WARMUP_REQUESTS = 3;
const MEASURED_REQUESTS = 30;
const PRIORITY_READ_LIMIT = 25;
const SCENARIOS = [
  "semanticEdit",
  "commentEdit",
  "delete",
  "spuriousEvent",
  "pollingNoOp"
];

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

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number.`);
  }
  return value;
}

function optionalCount(value, label) {
  if (value === undefined || value === null) {
    return 0;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

function phaseDurations(value, scenario) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .filter((phase) => phase !== null && typeof phase === "object")
        .map((phase) => {
          const name = phase.name;
          if (typeof name !== "string" || name.length === 0) {
            throw new TypeError(`Scenario ${scenario} returned a phase without a name.`);
          }
          return [name, finiteNumber(phase.durationMs ?? phase.elapsedMs, `phase ${name}`)];
        })
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, duration]) => {
        const numericDuration =
          duration !== null && typeof duration === "object"
            ? duration.durationMs ?? duration.elapsedMs
            : duration;
        return [name, finiteNumber(numericDuration, `phase ${name}`)];
      })
    );
  }
  throw new TypeError(`Scenario ${scenario} must return a phases object or array.`);
}

function readCountValues(value, scenario) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Scenario ${scenario} must return a readCounts object.`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([name, count]) => [name, optionalCount(count, `read count ${name}`)])
  );
}

function normalizeSample(raw, scenario) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError(`Scenario ${scenario} must return an observation object.`);
  }
  const phases = phaseDurations(raw.phases ?? raw.phaseDurations, scenario);
  const readCounts = readCountValues(raw.readCounts, scenario);
  const priorityReadCount = optionalCount(
    raw.priorityReadCount ?? readCounts.priority ?? readCounts.priorityPaths,
    `${scenario} priorityReadCount`
  );
  return {
    elapsedMs: rounded(finiteNumber(raw.elapsedMs, `${scenario} elapsedMs`)),
    phases,
    readCounts,
    observedStale: raw.observedStale === true,
    freshnessPreflightCount: optionalCount(
      raw.freshnessPreflightCount,
      `${scenario} freshnessPreflightCount`
    ),
    fullScanCount: optionalCount(raw.fullScanCount, `${scenario} fullScanCount`),
    priorityReadCount,
    priorityPathsExact: raw.priorityPathsExact === true
  };
}

function summarize(values) {
  if (values.length === 0) {
    return { count: 0, p50: 0, p95: 0, mean: 0, max: 0 };
  }
  return {
    count: values.length,
    p50: rounded(percentile(values, 0.5)),
    p95: rounded(percentile(values, 0.95)),
    mean: rounded(values.reduce((sum, value) => sum + value, 0) / values.length),
    max: rounded(Math.max(...values))
  };
}

function summarizeNamedValues(samples, field) {
  const names = new Set();
  for (const sample of samples) {
    for (const name of Object.keys(sample[field])) {
      names.add(name);
    }
  }
  return Object.fromEntries(
    [...names].sort().map((name) => [
      name,
      summarize(samples.map((sample) => sample[field][name] ?? 0))
    ])
  );
}

function baselineP95(baseline, scenario) {
  const baselineScenario = baseline?.scenarios?.[scenario] ?? baseline?.[scenario];
  const value =
    baselineScenario?.latencyMs?.p95 ??
    baselineScenario?.p95Ms ??
    baselineScenario?.p95;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function comparison(report, baseline, scenario) {
  const baselineMs = baselineP95(baseline, scenario);
  if (baselineMs === null) {
    return {
      available: false,
      baselineP95Ms: null,
      currentP95Ms: report.latencyMs.p95,
      improvementPercent: null,
      regressionPercent: null
    };
  }
  const deltaPercent = ((report.latencyMs.p95 - baselineMs) / baselineMs) * 100;
  return {
    available: true,
    baselineP95Ms: rounded(baselineMs),
    currentP95Ms: report.latencyMs.p95,
    improvementPercent: rounded(-deltaPercent),
    regressionPercent: rounded(deltaPercent)
  };
}

function scenarioAssertions(samples) {
  const staleSamples = samples.filter((sample) => sample.observedStale);
  const exactPrioritySamples = samples.filter((sample) => sample.priorityPathsExact);
  return {
    observedStaleSampleCount: staleSamples.length,
    observedStaleNoDuplicateFreshnessPreflight:
      staleSamples.length > 0 &&
      staleSamples.every(
        (sample) => sample.freshnessPreflightCount === 1 && sample.fullScanCount === 1
      ),
    exactPrioritySampleCount: exactPrioritySamples.length,
    exactPriorityReadsAtMost25:
      exactPrioritySamples.length > 0 &&
      exactPrioritySamples.every(
        (sample) => sample.priorityReadCount >= 1 && sample.priorityReadCount <= PRIORITY_READ_LIMIT
      )
  };
}

function getRunnerMethod(runner) {
  if (typeof runner === "function") {
    return runner;
  }
  if (runner !== null && typeof runner === "object" && typeof runner.runScenario === "function") {
    return runner.runScenario.bind(runner);
  }
  throw new TypeError("A persistent runner with runScenario() is required.");
}

/**
 * Runs all watcher reconciliation scenarios through one adapter instance.
 * The adapter is intentionally generic: it owns the project lifecycle and
 * returns elapsed time plus diagnostic phase/read-count fields for one case.
 */
export async function runWatcherReconcileBenchmark({
  projectPath,
  runner,
  baseline = null,
  warmupRequests = WARMUP_REQUESTS,
  measuredRequests = MEASURED_REQUESTS
}) {
  if (typeof projectPath !== "string" || projectPath.length === 0) {
    throw new TypeError("projectPath is required.");
  }
  if (!Number.isSafeInteger(warmupRequests) || warmupRequests < WARMUP_REQUESTS) {
    throw new RangeError(`warmupRequests must be at least ${WARMUP_REQUESTS}.`);
  }
  if (!Number.isSafeInteger(measuredRequests) || measuredRequests < MEASURED_REQUESTS) {
    throw new RangeError(`measuredRequests must be at least ${MEASURED_REQUESTS}.`);
  }

  const runScenario = getRunnerMethod(runner);
  const reports = {};
  const benchmarkStartedAt = performance.now();
  try {
    for (const scenario of SCENARIOS) {
      for (let index = 0; index < warmupRequests; index += 1) {
        normalizeSample(
          await runScenario({ projectPath, scenario, iteration: index, warmup: true }),
          scenario
        );
      }

      const samples = [];
      for (let index = 0; index < measuredRequests; index += 1) {
        const sample = normalizeSample(
          await runScenario({ projectPath, scenario, iteration: index, warmup: false }),
          scenario
        );
        samples.push(sample);
      }

      const latencyValues = samples.map((sample) => sample.elapsedMs);
      const report = {
        requestCount: samples.length,
        latencyMs: summarize(latencyValues),
        phases: summarizeNamedValues(samples, "phases"),
        readCounts: summarizeNamedValues(samples, "readCounts"),
        observations: {
          observedStaleCount: samples.filter((sample) => sample.observedStale).length,
          maximumFreshnessPreflightCount: Math.max(
            ...samples.map((sample) => sample.freshnessPreflightCount)
          ),
          maximumFullScanCount: Math.max(...samples.map((sample) => sample.fullScanCount)),
          maximumPriorityReadCount: Math.max(...samples.map((sample) => sample.priorityReadCount))
        },
        assertions: scenarioAssertions(samples)
      };
      report.comparison = comparison(report, baseline, scenario);
      reports[scenario] = report;
    }
  } finally {
    if (runner !== null && typeof runner === "object" && typeof runner.close === "function") {
      await runner.close();
    }
  }

  const comparisons = Object.fromEntries(
    SCENARIOS.map((scenario) => [scenario, reports[scenario].comparison])
  );
  const staleScenarios = SCENARIOS.filter(
    (scenario) => reports[scenario].assertions.observedStaleSampleCount > 0
  );
  const priorityScenarios = SCENARIOS.filter(
    (scenario) => reports[scenario].assertions.exactPrioritySampleCount > 0
  );
  const staleAssertion =
    staleScenarios.length > 0 &&
    staleScenarios.every(
      (scenario) => reports[scenario].assertions.observedStaleNoDuplicateFreshnessPreflight
    );
  const priorityAssertion =
    priorityScenarios.length > 0 &&
    priorityScenarios.every((scenario) => reports[scenario].assertions.exactPriorityReadsAtMost25);
  const structuralAssertions =
    SCENARIOS.every((scenario) => reports[scenario].requestCount === measuredRequests) &&
    staleScenarios.length > 0 &&
    priorityScenarios.length > 0;
  const semanticComparison = comparisons.semanticEdit;
  const commentComparison = comparisons.commentEdit;
  const spuriousComparison = comparisons.spuriousEvent;
  const pollingComparison = comparisons.pollingNoOp;
  const assertions = {
    minimumWarmups: warmupRequests >= WARMUP_REQUESTS,
    minimumMeasuredRequests: measuredRequests >= MEASURED_REQUESTS,
    allScenarioRequestsCompleted: SCENARIOS.every(
      (scenario) => reports[scenario].requestCount === measuredRequests
    ),
    semanticImprovementPercent: semanticComparison.improvementPercent,
    commentImprovementPercent: commentComparison.improvementPercent,
    spuriousEventRegressionPercent: spuriousComparison.regressionPercent,
    pollingNoOpRegressionPercent: pollingComparison.regressionPercent,
    semanticImprovementAtLeast30Percent:
      semanticComparison.available && semanticComparison.improvementPercent >= 30,
    commentImprovementAtLeast25Percent:
      commentComparison.available && commentComparison.improvementPercent >= 25,
    spuriousEventRegressionAtMost10Percent:
      spuriousComparison.available && spuriousComparison.regressionPercent <= 10,
    pollingNoOpRegressionAtMost10Percent:
      pollingComparison.available && pollingComparison.regressionPercent <= 10,
    observedStaleNoDuplicateFreshnessPreflight: staleAssertion,
    exactPriorityReadsAtMost25: priorityAssertion,
    allAssertionsPassed:
      structuralAssertions &&
      semanticComparison.available &&
      commentComparison.available &&
      spuriousComparison.available &&
      pollingComparison.available &&
      semanticComparison.improvementPercent >= 30 &&
      commentComparison.improvementPercent >= 25 &&
      spuriousComparison.regressionPercent <= 10 &&
      pollingComparison.regressionPercent <= 10 &&
      staleAssertion &&
      priorityAssertion
  };

  return {
    schemaVersion: 1,
    benchmark: "watcher-reconcile-latency-v1",
    configuration: {
      projectPath,
      persistentProcess: true,
      warmupRequests,
      measuredRequests,
      scenarios: SCENARIOS
    },
    scenarios: reports,
    comparisons,
    assertions,
    elapsedMs: rounded(performance.now() - benchmarkStartedAt)
  };
}

async function loadRunner(adapterPath, projectPath) {
  const adapter = await import(pathToFileURL(resolve(adapterPath)).href);
  const factory = adapter.createRunner ?? adapter.default;
  if (typeof factory === "function") {
    return factory({ projectPath });
  }
  if (typeof adapter.runScenario === "function") {
    return adapter;
  }
  throw new TypeError("Adapter must export createRunner() or runScenario().");
}

async function main() {
  const projectPath = argument("--project");
  const adapterPath = argument("--adapter");
  const outputPath = argument("--output");
  const baselinePath = argument("--baseline");
  if (projectPath === null || adapterPath === null || outputPath === null) {
    throw new Error(
      "Usage: --project <project> --adapter <module> --output <json> [--baseline <json>]"
    );
  }
  const resolvedProjectPath = resolve(projectPath);
  const baseline = baselinePath === null
    ? null
    : JSON.parse(await readFile(resolve(baselinePath), "utf8"));
  const runner = await loadRunner(adapterPath, resolvedProjectPath);
  const report = await runWatcherReconcileBenchmark({
    projectPath: resolvedProjectPath,
    runner,
    baseline
  });
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
  if (report.assertions.allAssertionsPassed !== true) {
    process.exitCode = 1;
  }
}

const invokedScript = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (invokedScript === import.meta.url) {
  await main();
}

export { MEASURED_REQUESTS, PRIORITY_READ_LIMIT, SCENARIOS, WARMUP_REQUESTS };
