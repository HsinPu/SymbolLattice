import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { McpReadQueryPool } from "../../dist/mcp/read-query-pool.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

async function waitForReady(pool) {
  const deadline = Date.now() + 10_000;
  while (!pool.ready && Date.now() < deadline) await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  if (!pool.ready) throw new Error(`MCP pool did not become ready: ${JSON.stringify(pool.queryPoolStatus())}`);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

export async function runConcurrency({ projectPath, poolSize, concurrency, requests = 24, warmupRequests = 4 }) {
  const pool = new McpReadQueryPool({ defaultProjectPath: resolve(projectPath), size: poolSize });
  const latencies = [];
  const fallback = async () => { throw new Error("Ready MCP worker unexpectedly used fallback."); };
  const one = async () => {
    const start = performance.now();
    const response = await pool.execute("files", { limit: 1 }, fallback);
    latencies.push(performance.now() - start);
    if (response.isError === true || response.content.length === 0) throw new Error("MCP read query returned no successful content.");
  };
  try {
    await waitForReady(pool);
    let workerStartupQueries = 0;
    while (pool.liveWorkerCount < poolSize) {
      const startupBatchSize = pool.liveWorkerCount + 1;
      await Promise.all(Array.from({ length: startupBatchSize }, () => one()));
      workerStartupQueries += startupBatchSize;
    }
    await Promise.all(Array.from({ length: poolSize }, () => one()));
    for (let index = 0; index < warmupRequests; index += 1) await one();
    latencies.length = 0;
    const wallStart = performance.now();
    for (let offset = 0; offset < requests; offset += concurrency) {
      await Promise.all(Array.from({ length: Math.min(concurrency, requests - offset) }, () => one()));
    }
    const wallMs = performance.now() - wallStart;
    const diagnostics = pool.queryPoolStatus();
    const report = {
      schemaVersion: 1,
      benchmark: "SymbolLattice-mcp-read-query-concurrency",
      productVersion: SYMBOL_LATTICE_VERSION,
      configuration: {
        poolSize,
        concurrency,
        requests,
        warmupRequests,
        workerStartupQueries,
        workerWarmupQueries: poolSize
      },
      concurrent: {
        wallMs: Number(wallMs.toFixed(3)),
        p95Ms: Number(percentile(latencies, 0.95).toFixed(3)),
        maxMs: Number(Math.max(...latencies).toFixed(3))
      },
      fallbacks: diagnostics.fallbacks.total,
      errors: 0,
      workerCrashes: diagnostics.workers.crashes,
      allAssertionsPassed: diagnostics.fallbacks.total === 0 && diagnostics.workers.crashes === 0
    };
    if (!report.allAssertionsPassed) throw new Error(`MCP concurrency assertions failed: ${JSON.stringify(report)}`);
    return report;
  } finally {
    await pool.close();
  }
}

const projectPath = argument("--project");
const output = argument("--output");
const poolSize = Number(argument("--pool"));
const concurrency = Number(argument("--concurrency"));
if (projectPath === null || output === null || !Number.isInteger(poolSize) || !Number.isInteger(concurrency)) throw new Error("Usage: --project <indexed> --pool <n> --concurrency <n> --output <json>");
const report = await runConcurrency({ projectPath, poolSize, concurrency });
writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
