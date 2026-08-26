import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { StrictFreshReadCoordinator, SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteAutoSyncOwnerLease, SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";
import {
  createMcpServer,
  StrictFreshMcpReadExecutor,
  type McpReadQueryExecutor
} from "../../../src/mcp/index.js";

const temporaryDirectories: string[] = [];
const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "basic-project");
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(): Promise<{ projectPath: string; service: SymbolLatticeService }> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-strict-mcp-"));
  temporaryDirectories.push(projectPath);
  await cp(fixturePath, projectPath, { recursive: true });
  const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
  await service.init({ projectPath });
  return { projectPath, service };
}

async function callSearch(
  service: SymbolLatticeService,
  projectPath: string,
  coordinator: StrictFreshReadCoordinator
) {
  const delegate: McpReadQueryExecutor = {
    execute: (_tool, _arguments, fallback) => fallback()
  };
  const server = createMcpServer(service, projectPath, {
    readQueryExecutor: new StrictFreshMcpReadExecutor(delegate, coordinator, projectPath)
  });
  const client = new Client({ name: "SymbolLattice-strict-mcp-integration", version: "1.0.0" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await client.callTool({
      name: "SymbolLattice_search",
      arguments: { query: "newestStrictMcp", projectPath }
    });
  } finally {
    await client.close();
    await server.close();
  }
}

describe("strict fresh MCP reads", () => {
  it("synchronizes stale source under a writer lease before returning search evidence", async () => {
    const { projectPath, service } = await fixture();
    await writeFile(join(projectPath, "src", "math.ts"), "export const newestStrictMcp = 446;\n", "utf8");
    const coordinator = new StrictFreshReadCoordinator({
      service,
      writerEnabled: true,
      acquireWriterLease: (path) => new SqliteAutoSyncOwnerLease(path).acquire()
    });

    const response = await callSearch(service, projectPath, coordinator);
    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      status: { stale: false },
      results: [{ filePath: "src/math.ts" }]
    });
  });

  it("blocks stale search when auto-sync is disabled", async () => {
    const { projectPath, service } = await fixture();
    const generationBefore = (await service.getStatus(projectPath)).generationId;
    await writeFile(join(projectPath, "src", "math.ts"), "export const newestStrictMcp = 446;\n", "utf8");
    const coordinator = new StrictFreshReadCoordinator({ service, writerEnabled: false });

    const response = await callSearch(service, projectPath, coordinator);
    expect(response).toMatchObject({ isError: true });
    expect(response.content[0]?.text).toContain("FRESH_INDEX_REQUIRED");
    expect((await service.getStatus(projectPath)).generationId).toBe(generationBefore);
  });
});
