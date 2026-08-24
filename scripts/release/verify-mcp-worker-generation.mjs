import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SymbolLatticeService } from "../../dist/application/index.js";
import { FileSystemSourceCatalog } from "../../dist/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../dist/infrastructure/sqlite/index.js";
import { McpReadQueryPool } from "../../dist/mcp/read-query-pool.js";

const WORKER_READY_TIMEOUT_MS = 5_000;

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForReadyWorker(pool) {
  const deadline = Date.now() + WORKER_READY_TIMEOUT_MS;
  while (!pool.ready && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  requireCondition(
    pool.ready,
    "MCP worker did not become ready: " + JSON.stringify(pool.queryPoolStatus())
  );
}

function successfulResponseText(response) {
  requireCondition(response.isError !== true, "MCP worker returned an error response.");
  return response.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-mcp-worker-generation-"));
let pool = null;

try {
  await mkdir(join(projectPath, "src"), { recursive: true });
  await writeFile(
    join(projectPath, "src", "entry.ts"),
    "export const firstWorkerGenerationNeedle = true;\n",
    "utf8"
  );

  const service = new SymbolLatticeService(
    new SqliteGraphStore(),
    new FileSystemSourceCatalog()
  );
  const firstStatus = await service.init({ projectPath });
  pool = new McpReadQueryPool({ defaultProjectPath: projectPath, size: 1 });
  await waitForReadyWorker(pool);

  const unexpectedFallback = async () => {
    throw new Error("The ready MCP worker unexpectedly used the in-process fallback.");
  };
  const firstResponse = await pool.execute(
    "search",
    { query: "firstWorkerGenerationNeedle" },
    unexpectedFallback
  );
  requireCondition(
    successfulResponseText(firstResponse).includes("firstWorkerGenerationNeedle"),
    "The worker did not return evidence from the first generation."
  );
  const topologyResponse = await pool.execute(
    "investigate",
    { query: "firstWorkerGenerationNeedle", ranking: "topology" },
    unexpectedFallback
  );
  const topologyResponseText = successfulResponseText(topologyResponse);
  requireCondition(
    topologyResponseText.includes('"ranking": "topology"') &&
      topologyResponseText.includes('"topologySignals"'),
    "The worker did not return topology-ranked investigation evidence."
  );
  const impactResponse = await pool.execute(
    "impact",
    { reference: "src/entry.ts#firstWorkerGenerationNeedle" },
    unexpectedFallback
  );
  requireCondition(
    successfulResponseText(impactResponse).includes('"returnedPathCount"'),
    "The worker did not return a bounded reverse-impact summary."
  );

  await writeFile(
    join(projectPath, "src", "entry.ts"),
    "export const secondWorkerGenerationNeedle = true;\n",
    "utf8"
  );
  const secondStatus = await service.sync({ projectPath });
  requireCondition(
    secondStatus.generationId !== firstStatus.generationId,
    "Sync did not publish a distinct active generation."
  );

  const secondResponse = await pool.execute(
    "search",
    { query: "secondWorkerGenerationNeedle" },
    unexpectedFallback
  );
  requireCondition(
    successfulResponseText(secondResponse).includes("secondWorkerGenerationNeedle"),
    "The same worker did not observe the generation published by sync."
  );

  const status = pool.queryPoolStatus();
  requireCondition(status.fallbacks.total === 0, "The verification used an unexpected fallback.");
  requireCondition(status.workers.crashes === 0, "The verification worker crashed.");

  process.stdout.write(
    JSON.stringify(
      {
        schemaVersion: 1,
        verification: "SymbolLattice-mcp-worker-generation",
        fixture: { sourceFiles: 1, lifecycle: "temporary-and-removed" },
        generations: {
          firstPublished: firstStatus.generationId,
          secondPublished: secondStatus.generationId,
          changed: true
        },
        pool: status,
        assertions: {
          workerReady: true,
          firstGenerationReturned: true,
          topologyDispatchedThroughWorker: true,
          impactDispatchedThroughWorker: true,
          sameWorkerObservedSyncedGeneration: true,
          avoidedFallback: true,
          avoidedWorkerCrash: true
        }
      },
      null,
      2
    ) + "\n"
  );
} finally {
  try {
    await pool?.close();
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}
