import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DEFAULT_WARMUP_REQUESTS = 3;
const DEFAULT_MEASURED_REQUESTS = 30;
const DEFAULT_QUERIES = [
  "MCP response flow",
  "query pool worker dispatch",
  "SQLite graph persistence"
];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function positiveInteger(value, fallback, name) {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function number(value) {
  return Number(value.toFixed(3));
}

function requireOptions() {
  const projectPath = argument("--project");
  const output = argument("--output");
  if (projectPath === null || output === null) {
    throw new Error("Usage: --project <indexed-project> --output <json> [--cli <entry>] [--warmup <n>] [--requests <n>]");
  }
  const options = {
    projectPath: resolve(projectPath),
    output: resolve(output),
    cli: resolve(argument("--cli") ?? "dist/cli/main.js"),
    warmupRequests: positiveInteger(argument("--warmup"), DEFAULT_WARMUP_REQUESTS, "--warmup"),
    measuredRequests: positiveInteger(argument("--requests"), DEFAULT_MEASURED_REQUESTS, "--requests")
  };
  if (options.warmupRequests < DEFAULT_WARMUP_REQUESTS) {
    throw new Error(`--warmup must be at least ${DEFAULT_WARMUP_REQUESTS}.`);
  }
  if (options.measuredRequests < DEFAULT_MEASURED_REQUESTS) {
    throw new Error(`--requests must be at least ${DEFAULT_MEASURED_REQUESTS}.`);
  }
  return options;
}

async function openPersistentClient({ projectPath, cli }) {
  const environment = {
    ...process.env,
    SYMBOL_LATTICE_MCP_QUERY_POOL_SIZE: "1"
  };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, "serve", "--mcp", "--project", projectPath, "--no-auto-sync"],
    cwd: process.cwd(),
    env: environment,
    stderr: "pipe"
  });
  const client = new Client({ name: "explore-latency-benchmark", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

async function callExplore(client, projectPath, query) {
  const startedAt = performance.now();
  const response = await client.callTool({
    name: "SymbolLattice_explore",
    arguments: { projectPath, query, sourceSessionMode: "full" }
  });
  const elapsedMs = performance.now() - startedAt;
  if (response.isError === true) throw new Error(`Explore request failed: ${JSON.stringify(response)}`);
  if (!Array.isArray(response.content) || response.content.length === 0) {
    throw new Error("Explore request returned no content.");
  }
  return { elapsedMs, response };
}

async function runBenchmark(options) {
  const startupStartedAt = performance.now();
  const { client, transport } = await openPersistentClient(options);
  const startupMs = performance.now() - startupStartedAt;
  const latencies = [];
  const perQuery = new Map(DEFAULT_QUERIES.map((query) => [query, []]));
  let requestCount = 0;
  try {
    for (let index = 0; index < options.warmupRequests; index += 1) {
      await callExplore(client, options.projectPath, DEFAULT_QUERIES[index % DEFAULT_QUERIES.length]);
    }
    for (let index = 0; index < options.measuredRequests; index += 1) {
      const query = DEFAULT_QUERIES[index % DEFAULT_QUERIES.length];
      const result = await callExplore(client, options.projectPath, query);
      const elapsedMs = number(result.elapsedMs);
      latencies.push(elapsedMs);
      perQuery.get(query).push(elapsedMs);
      requestCount += 1;
    }
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }

  return {
    schemaVersion: 1,
    benchmark: "mcp-explore-latency-v1",
    configuration: {
      projectPath: options.projectPath,
      poolSize: 1,
      sourceSessionMode: "full",
      persistentSession: true,
      warmupRequests: options.warmupRequests,
      measuredRequests: options.measuredRequests,
      queries: DEFAULT_QUERIES
    },
    startupMs: number(startupMs),
    requestCount,
    latencyMs: {
      mean: number(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
      p50: number(percentile(latencies, 0.5)),
      p95: number(percentile(latencies, 0.95)),
      max: number(Math.max(...latencies))
    },
    perQueryMs: Object.fromEntries(
      [...perQuery.entries()].map(([query, values]) => [
        query,
        {
          count: values.length,
          mean: number(values.reduce((sum, value) => sum + value, 0) / values.length),
          p95: number(percentile(values, 0.95))
        }
      ])
    ),
    assertions: {
      allRequestsSuccessful: requestCount === options.measuredRequests,
      minimumMeasuredRequests: options.measuredRequests >= DEFAULT_MEASURED_REQUESTS,
      persistentPoolOne: true,
      sourceSessionDedupDisabled: true
    }
  };
}

const options = requireOptions();
const report = await runBenchmark(options);
writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));

export { runBenchmark };
