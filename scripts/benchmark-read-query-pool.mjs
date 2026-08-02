#!/usr/bin/env node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { SymbolLatticeService } = await import("../dist/application/index.js");
const { summarizeReadQueryExecutions } = await import(
  "../dist/benchmark/read-query-metrics.js"
);
const { FileSystemSourceCatalog } = await import("../dist/infrastructure/filesystem/index.js");
const { SqliteGraphStore } = await import("../dist/infrastructure/sqlite/index.js");
const { McpReadQueryPool } = await import("../dist/mcp/read-query-pool.js");

const FIXTURE_FILE_COUNT = 48;
const WORKER_READY_TIMEOUT_MS = 10_000;
const EVENT_LOOP_PROBE_INTERVAL_MS = 5;

function positiveIntegerFromEnvironment(name, fallback, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(name + " must be a positive integer.");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    throw new Error(name + " must not exceed " + maximum + ".");
  }
  return value;
}

function elapsedMilliseconds(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function roundMilliseconds(value) {
  return Math.round(value * 1_000) / 1_000;
}

function createFixtureProject() {
  const projectPath = mkdtempSync(join(tmpdir(), "symbol-lattice-read-pool-benchmark-"));
  const sourceDirectory = join(projectPath, "src");
  mkdirSync(sourceDirectory, { recursive: true });

  let sourceLines = 0;
  for (let index = 0; index < FIXTURE_FILE_COUNT; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const previousSuffix = String(Math.max(0, index - 1)).padStart(2, "0");
    const previousImport =
      index === 0
        ? ""
        : "import { handleFeature" +
          previousSuffix +
          " } from './feature-" +
          previousSuffix +
          ".js';\n\n";
    const previousValue =
      index === 0 ? "input" : "handleFeature" + previousSuffix + "(input)";
    const source =
      previousImport +
      "export function handleFeature" +
      suffix +
      "(input: string): string {\n" +
      "  return " +
      previousValue +
      " + '|feature-" +
      suffix +
      "';\n" +
      "}\n";
    sourceLines += source.split("\n").length - 1;
    writeFileSync(join(sourceDirectory, "feature-" + suffix + ".ts"), source, "utf8");
  }

  return { projectPath, sourceLines };
}

async function waitForReady(pool) {
  const deadline = Date.now() + WORKER_READY_TIMEOUT_MS;
  while (!pool.ready && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (!pool.ready) {
    throw new Error("Read-query worker did not become ready within the benchmark timeout.");
  }
}

async function waitForPoolSettled(pool) {
  const deadline = Date.now() + WORKER_READY_TIMEOUT_MS;
  while (pool.queryPoolStatus().workers.pending > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (pool.queryPoolStatus().workers.pending > 0) {
    throw new Error("Read-query worker expansion did not settle within the benchmark timeout.");
  }
}

function startEventLoopProbe() {
  let ticks = 0;
  let maximumDelayMs = 0;
  let stopped = false;
  let previousTick = process.hrtime.bigint();
  const timer = setInterval(() => {
    const now = process.hrtime.bigint();
    const delay = Math.max(0, elapsedMilliseconds(previousTick) - EVENT_LOOP_PROBE_INTERVAL_MS);
    maximumDelayMs = Math.max(maximumDelayMs, delay);
    previousTick = now;
    ticks += 1;
  }, EVENT_LOOP_PROBE_INTERVAL_MS);

  return {
    async begin() {
      await new Promise((resolve) => setTimeout(resolve, EVENT_LOOP_PROBE_INTERVAL_MS * 2));
    },
    stop() {
      if (!stopped) {
        clearInterval(timer);
        stopped = true;
      }
      return {
        intervalMs: EVENT_LOOP_PROBE_INTERVAL_MS,
        ticks,
        maximumDelayMs: roundMilliseconds(maximumDelayMs)
      };
    }
  };
}

async function executeBatch(pool, operations, requestCount, concurrency) {
  const samples = [];
  let nextRequest = 0;

  async function executeWorker() {
    while (true) {
      const requestIndex = nextRequest;
      nextRequest += 1;
      if (requestIndex >= requestCount) {
        return;
      }

      const operation = operations[requestIndex % operations.length];
      let usedFallback = false;
      const startedAt = process.hrtime.bigint();
      const response = await pool.execute(operation.toolName, operation.arguments, async () => {
        usedFallback = true;
        return {
          content: [{ type: "text", text: "benchmark-local-fallback" }],
          isError: true
        };
      });
      samples.push({
        latencyMs: elapsedMilliseconds(startedAt),
        usedFallback,
        isError: response.isError === true
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, requestCount) }, () => executeWorker())
  );
  return samples;
}

function roundedSummary(summary) {
  return {
    ...summary,
    latency: {
      ...summary.latency,
      minimumMs: roundMilliseconds(summary.latency.minimumMs),
      meanMs: roundMilliseconds(summary.latency.meanMs),
      p50Ms: roundMilliseconds(summary.latency.p50Ms),
      p95Ms: roundMilliseconds(summary.latency.p95Ms),
      maximumMs: roundMilliseconds(summary.latency.maximumMs)
    }
  };
}

const configuration = {
  poolSize: positiveIntegerFromEnvironment("SYMBOL_LATTICE_BENCHMARK_POOL_SIZE", 2, 8),
  concurrency: positiveIntegerFromEnvironment("SYMBOL_LATTICE_BENCHMARK_CONCURRENCY", 4, 16),
  requestCount: positiveIntegerFromEnvironment("SYMBOL_LATTICE_BENCHMARK_REQUESTS", 24, 512),
  warmupRequests: positiveIntegerFromEnvironment("SYMBOL_LATTICE_BENCHMARK_WARMUP", 4, 64)
};
let fixture;
let pool;
let eventLoopProbe;

try {
  fixture = createFixtureProject();
  const service = new SymbolLatticeService(
    new SqliteGraphStore(),
    new FileSystemSourceCatalog()
  );
  await service.init({ projectPath: fixture.projectPath });

  pool = new McpReadQueryPool({
    defaultProjectPath: fixture.projectPath,
    size: configuration.poolSize
  });
  await waitForReady(pool);

  const operations = [
    { toolName: "explore", arguments: { query: "handleFeature00" } },
    {
      toolName: "investigate",
      arguments: { query: "handleFeature", searchLimit: 8, symbolLimit: 4 }
    }
  ];
  const warmup = await executeBatch(pool, operations, configuration.warmupRequests, 1);
  const before = pool.queryPoolStatus();
  const sequential = await executeBatch(
    pool,
    operations,
    Math.min(8, configuration.requestCount),
    1
  );
  eventLoopProbe = startEventLoopProbe();
  await eventLoopProbe.begin();
  const concurrent = await executeBatch(
    pool,
    operations,
    configuration.requestCount,
    configuration.concurrency
  );
  const eventLoop = eventLoopProbe.stop();
  await waitForPoolSettled(pool);
  const after = pool.queryPoolStatus();
  const allSamples = [...warmup, ...sequential, ...concurrent];
  const assertions = {
    workerReady: pool.ready,
    allRequestsAvoidedFallback: allSamples.every((sample) => !sample.usedFallback),
    allRequestsSucceeded: allSamples.every((sample) => !sample.isError)
  };

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        benchmark: "symbol-lattice-read-query-pool",
        fixture: {
          language: "typescript",
          sourceFiles: FIXTURE_FILE_COUNT,
          sourceLines: fixture.sourceLines,
          lifecycle: "temporary-and-removed"
        },
        configuration,
        runs: {
          warmup: roundedSummary(summarizeReadQueryExecutions(warmup)),
          sequential: roundedSummary(summarizeReadQueryExecutions(sequential)),
          concurrent: roundedSummary(summarizeReadQueryExecutions(concurrent))
        },
        eventLoop,
        queryPool: {
          before,
          after
        },
        assertions
      },
      null,
      2
    )
  );
  if (!Object.values(assertions).every(Boolean)) {
    process.exitCode = 1;
  }
} finally {
  eventLoopProbe?.stop();
  try {
    await pool?.close();
  } finally {
    if (fixture !== undefined) {
      rmSync(fixture.projectPath, { recursive: true, force: true });
    }
  }
}
