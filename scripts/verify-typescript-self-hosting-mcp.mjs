import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { SymbolLatticeService } from "../dist/application/index.js";
import { FileSystemSourceCatalog } from "../dist/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../dist/infrastructure/sqlite/index.js";
import { McpReadQueryPool } from "../dist/mcp/read-query-pool.js";
import { createMcpServer } from "../dist/mcp/server.js";

const REQUIRED_TOOLS = [
  "symbol_lattice_query_pool_status",
  "symbol_lattice_files",
  "symbol_lattice_file",
  "symbol_lattice_search",
  "symbol_lattice_node",
  "symbol_lattice_context",
  "symbol_lattice_impact",
  "symbol_lattice_investigate",
  "symbol_lattice_explain_edge"
];
const WORKER_READY_TIMEOUT_MS = 10_000;

export function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!Object.hasOwn(values, flag) && ["--project", "--stage3", "--output"].includes(flag) && value?.trim()) {
      values[flag] = value;
      continue;
    }
    throw new Error("Usage: node scripts/verify-typescript-self-hosting-mcp.mjs --project <indexed-project> --stage3 <stage3.json> --output <result.json>");
  }
  if (!values["--project"] || !values["--stage3"] || !values["--output"]) {
    throw new Error("Usage: node scripts/verify-typescript-self-hosting-mcp.mjs --project <indexed-project> --stage3 <stage3.json> --output <result.json>");
  }
  return { projectPath: values["--project"], stage3Path: values["--stage3"], outputPath: values["--output"] };
}

export function selectCreateSymbolIdCallTruth(stage3) {
  const calls = stage3?.positiveTruths?.callsAndInstantiates;
  if (!Array.isArray(calls)) {
    throw new Error("Stage 3 has no callsAndInstantiates ground-truth collection.");
  }
  const truth = calls.find(
    (candidate) =>
      candidate?.kind === "calls" &&
      candidate.source?.qualifiedName === "src/domain/ids.ts#createSymbolId" &&
      candidate.target?.qualifiedName === "src/domain/ids.ts#encodePart"
  );
  if (truth === undefined) {
    throw new Error("Stage 3 does not contain the createSymbolId -> encodePart calls truth.");
  }
  return truth;
}

export function statusIdentity(status) {
  const counts = status?.counts;
  if (
    typeof status?.generationId !== "string" ||
    typeof status?.indexedAt !== "string" ||
    !counts ||
    ![counts.files, counts.symbols, counts.edges, counts.pendingReferences].every(Number.isSafeInteger)
  ) {
    throw new Error("Expected an initialized status with generation, indexedAt, and integer graph counts.");
  }
  return {
    generationId: status.generationId,
    indexedAt: status.indexedAt,
    counts: {
      files: counts.files,
      symbols: counts.symbols,
      edges: counts.edges,
      pendingReferences: counts.pendingReferences
    }
  };
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function structuredResponse(result, toolName) {
  requireCondition(result?.isError !== true, `${toolName} returned an MCP error: ${JSON.stringify(result?.content)}`);
  requireCondition(Array.isArray(result?.content) && result.content.length > 0, `${toolName} returned no content.`);
  requireCondition(
    result.content.every((item) => item?.type === "text" && typeof item.text === "string"),
    `${toolName} returned invalid text content.`
  );
  requireCondition(
    typeof result?.structuredContent === "object" && result.structuredContent !== null && !Array.isArray(result.structuredContent),
    `${toolName} returned no structured content.`
  );
  return result.structuredContent;
}

function findExactCallEdge(value, sourceId, targetId, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findExactCallEdge(item, sourceId, targetId, seen);
      if (found !== null) return found;
    }
    return null;
  }
  const candidate = value;
  const edge = candidate.edge ?? candidate;
  if (
    typeof edge.id === "string" &&
    edge.kind === "calls" &&
    edge.sourceId === sourceId &&
    edge.targetId === targetId
  ) {
    return edge.id;
  }
  for (const nested of Object.values(candidate)) {
    const found = findExactCallEdge(nested, sourceId, targetId, seen);
    if (found !== null) return found;
  }
  return null;
}

async function waitForReadyWorker(pool) {
  const deadline = Date.now() + WORKER_READY_TIMEOUT_MS;
  while (!pool.ready && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  requireCondition(pool.ready, `MCP worker did not become ready: ${JSON.stringify(pool.queryPoolStatus())}`);
}

async function main() {
  const { projectPath, stage3Path, outputPath } = parseArguments(process.argv.slice(2));
  const stage3 = JSON.parse(await readFile(stage3Path, "utf8"));
  const truth = selectCreateSymbolIdCallTruth(stage3);
  const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
  const before = statusIdentity(await service.getStatus(projectPath));
  const pool = new McpReadQueryPool({ defaultProjectPath: projectPath, size: 1 });
  let client;
  let server;
  try {
    await waitForReadyWorker(pool);
    server = createMcpServer(service, projectPath, {
      readQueryExecutor: pool,
      queryPoolStatusService: pool
    });
    client = new Client({ name: "symbol-lattice-typescript-self-hosting", version: "1.0.0" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const toolNames = (await client.listTools()).tools.map((tool) => tool.name);
    for (const toolName of REQUIRED_TOOLS) requireCondition(toolNames.includes(toolName), `Public MCP schema is missing ${toolName}.`);

    const latenciesMs = {};
    const call = async (name, arguments_) => {
      const startedAt = performance.now();
      const result = await client.callTool({ name, arguments: { ...arguments_, projectPath } });
      latenciesMs[name] = Number((performance.now() - startedAt).toFixed(3));
      return structuredResponse(result, name);
    };
    const poolBefore = await call("symbol_lattice_query_pool_status", {});
    const files = await call("symbol_lattice_files", { path: "src/domain", limit: 20 });
    const file = await call("symbol_lattice_file", { filePath: truth.source.filePath, limit: 80, sourceSessionMode: "full" });
    const search = await call("symbol_lattice_search", { query: "createSymbolId", path: "src/domain", limit: 20 });
    const node = await call("symbol_lattice_node", { query: truth.source.qualifiedName, sourceSessionMode: "full" });
    const context = await call("symbol_lattice_context", { references: [truth.source.qualifiedName, truth.target.qualifiedName], sourceSessionMode: "full" });
    const impact = await call("symbol_lattice_impact", { reference: truth.source.qualifiedName, maxDepth: 3, limit: 20 });
    const investigate = await call("symbol_lattice_investigate", { query: "createSymbolId", path: "src/domain", symbolLimit: 4, sourceSessionMode: "full" });
    const edgeId = findExactCallEdge(node, truth.source.id, truth.target.id)
      ?? findExactCallEdge(context, truth.source.id, truth.target.id)
      ?? findExactCallEdge(investigate, truth.source.id, truth.target.id);
    requireCondition(edgeId !== null, "MCP queries did not expose the Stage 3 createSymbolId -> encodePart calls edge.");
    const explainedEdge = await call("symbol_lattice_explain_edge", { edgeId });
    requireCondition(explainedEdge.edge?.id === edgeId, "explain_edge did not return the dynamically captured edge.");
    requireCondition(explainedEdge.edge?.kind === "calls", "explain_edge did not preserve the calls relation kind.");
    requireCondition(explainedEdge.source?.qualifiedName === truth.source.qualifiedName, "explain_edge source differs from Stage 3 truth.");
    requireCondition(explainedEdge.target?.qualifiedName === truth.target.qualifiedName, "explain_edge target differs from Stage 3 truth.");

    const after = statusIdentity(await service.getStatus(projectPath));
    requireCondition(JSON.stringify(after) === JSON.stringify(before), "Read-only MCP verification changed generation, indexedAt, or graph counts.");
    const poolAfter = pool.queryPoolStatus();
    requireCondition(poolAfter.state === "ready", `MCP pool is not ready: ${JSON.stringify(poolAfter)}`);
    requireCondition(poolAfter.fallbacks.total === 0 && poolAfter.workers.crashes === 0 && poolAfter.requests.queued === 0 && poolAfter.requests.inflight === 0, `MCP pool counters are not clean: ${JSON.stringify(poolAfter)}`);

    await writeFile(outputPath, `${JSON.stringify({
      schemaVersion: 1,
      verification: "typescript-self-hosting-public-mcp-v1",
      projectPath,
      stage3Path,
      readOnly: { initCalled: false, syncCalled: false, before, after, unchanged: true },
      tools: { required: REQUIRED_TOOLS, observed: toolNames, calls: { files: Boolean(files), file: Boolean(file), search: Boolean(search), node: Boolean(node), context: Boolean(context), impact: Boolean(impact), investigate: Boolean(investigate) } },
      explainedEdge: { truthId: truth.id, edgeId, source: truth.source.qualifiedName, target: truth.target.qualifiedName, kind: "calls" },
      latenciesMs,
      pool: { before: poolBefore, after: poolAfter },
      assertions: { structuredContent: true, poolReady: true, noFallbacks: true, noCrashes: true, noQueuedOrInflight: true, generationCountsAndIndexedAtUnchanged: true }
    }, null, 2)}\n`, "utf8");
  } finally {
    await client?.close();
    await server?.close();
    await pool.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
