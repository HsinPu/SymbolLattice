import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GraphSnapshot, SymbolNode } from "../../../src/domain/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function temporaryProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-store-"));
  temporaryDirectories.push(projectPath);
  return projectPath;
}

function symbol(id: string, name: string): SymbolNode {
  return {
    id,
    name,
    qualifiedName: `src/example.ts#${name}`,
    kind: "function",
    filePath: "src/example.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 2, column: 1 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
}

function snapshot(symbols: readonly SymbolNode[]): GraphSnapshot {
  return {
    files: [
      {
        path: "src/example.ts",
        contentHash: "hash-one",
        language: "typescript",
        indexedAt: "2026-07-29T00:00:00.000Z"
      }
    ],
    symbols,
    edges:
      symbols.length > 1
        ? [
            {
              id: "edge:caller-callee",
              sourceId: symbols[0]?.id ?? "missing",
              targetId: symbols[1]?.id ?? "missing",
              kind: "calls",
              filePath: "src/example.ts",
              range: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 4 }
              },
              resolution: "exact",
              confidence: 1,
              referenceName: "callee"
            }
          ]
        : [],
    pendingReferences: []
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directoryPath) =>
      rm(directoryPath, { recursive: true, force: true })
    )
  );
});

describe("SqliteGraphStore", () => {
  it("keeps an uninitialized project read-only until initialization", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();

    expect(store.getStatus(projectPath)).toMatchObject({ initialized: false, counts: { files: 0 } });
    expect(store.getSnapshot(projectPath)).toEqual({
      files: [],
      symbols: [],
      edges: [],
      pendingReferences: []
    });
  });

  it("persists complete snapshots and atomically replaces stale graph facts", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const firstSnapshot = snapshot([symbol("caller", "caller"), symbol("callee", "callee")]);

    store.replaceProjectFacts({
      projectPath,
      snapshot: firstSnapshot,
      indexedAt: "2026-07-29T01:00:00.000Z"
    });

    expect(store.getStatus(projectPath)).toMatchObject({
      initialized: true,
      indexedAt: "2026-07-29T01:00:00.000Z",
      counts: { files: 1, symbols: 2, edges: 1, pendingReferences: 0 }
    });
    expect(store.getSnapshot(projectPath).edges[0]).toMatchObject({
      sourceId: "caller",
      targetId: "callee"
    });

    const secondSnapshot = snapshot([symbol("only", "only")]);
    store.replaceProjectFacts({
      projectPath,
      snapshot: secondSnapshot,
      indexedAt: "2026-07-29T02:00:00.000Z"
    });

    expect(store.getSnapshot(projectPath)).toMatchObject({
      symbols: [{ id: "only" }],
      edges: []
    });
    expect(store.getStatus(projectPath).counts).toEqual({
      files: 1,
      symbols: 1,
      edges: 0,
      pendingReferences: 0
    });
  });
});
