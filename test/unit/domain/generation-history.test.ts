import { describe, expect, it } from "vitest";

import {
  diffGenerationSnapshots,
  GenerationSnapshotComparisonError
} from "../../../src/domain/generation-history.js";
import type {
  GraphEdge,
  GraphSnapshot,
  IndexedFile,
  PendingReference,
  SymbolNode
} from "../../../src/domain/types.js";

function file(path: string, contentHash: string, language: IndexedFile["language"] = "typescript"): IndexedFile {
  return { path, contentHash, language, indexedAt: "2026-07-30T00:00:00.000Z" };
}

function symbol(id: string, overrides: Partial<SymbolNode> = {}): SymbolNode {
  return {
    id,
    name: id,
    qualifiedName: `src/example.ts#${id}`,
    kind: "function",
    filePath: "src/example.ts",
    range: {
      start: { line: 1, column: 0 },
      end: { line: 1, column: 10 }
    },
    isExported: false,
    declarationOrdinal: 0,
    ...overrides
  };
}

function edge(id: string, overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id,
    sourceId: "symbol:source",
    targetId: "symbol:target",
    kind: "calls",
    filePath: "src/example.ts",
    range: {
      start: { line: 1, column: 0 },
      end: { line: 1, column: 10 }
    },
    resolution: "exact",
    confidence: 1,
    referenceName: "target",
    ...overrides
  };
}

function pendingReference(
  id: string,
  overrides: Partial<PendingReference> = {}
): PendingReference {
  return {
    id,
    sourceId: "symbol:source",
    filePath: "src/example.ts",
    referenceName: "target",
    relationKind: "calls",
    range: {
      start: { line: 1, column: 0 },
      end: { line: 1, column: 10 }
    },
    ...overrides
  };
}

function snapshot(overrides: Partial<GraphSnapshot> = {}): GraphSnapshot {
  return { files: [], symbols: [], edges: [], pendingReferences: [], ...overrides };
}

describe("retained generation snapshot diff", () => {
  it("reports sorted structural additions, removals, and stable-identity modifications", () => {
    const before = snapshot({
      files: [file("src/removed.ts", "removed"), file("src/changed.ts", "before")],
      symbols: [symbol("symbol:removed"), symbol("symbol:changed")],
      edges: [edge("edge:removed"), edge("edge:changed")],
      pendingReferences: [pendingReference("pending:removed"), pendingReference("pending:changed")]
    });
    const after = snapshot({
      files: [
        file("src/added.ts", "added"),
        file("src/changed.ts", "after", "javascript")
      ],
      symbols: [
        symbol("symbol:added"),
        symbol("symbol:changed", { isExported: true })
      ],
      edges: [edge("edge:added"), edge("edge:changed", { confidence: 0.25 })],
      pendingReferences: [
        pendingReference("pending:added"),
        pendingReference("pending:changed", { referenceName: "renamed" })
      ]
    });

    const result = diffGenerationSnapshots(before, after, { limit: 10 });

    expect(result.files.added.items.map((item) => item.path)).toEqual(["src/added.ts"]);
    expect(result.files.removed.items.map((item) => item.path)).toEqual(["src/removed.ts"]);
    expect(result.files.modified.items).toEqual([
      expect.objectContaining({
        path: "src/changed.ts",
        before: expect.objectContaining({ contentHash: "before", language: "typescript" }),
        after: expect.objectContaining({ contentHash: "after", language: "javascript" })
      })
    ]);
    expect(result.symbols.added.items.map((item) => item.id)).toEqual(["symbol:added"]);
    expect(result.symbols.removed.items.map((item) => item.id)).toEqual(["symbol:removed"]);
    expect(result.symbols.modified.items).toEqual([
      expect.objectContaining({ id: "symbol:changed", after: expect.objectContaining({ isExported: true }) })
    ]);
    expect(result.edges.added.items.map((item) => item.id)).toEqual(["edge:added"]);
    expect(result.edges.removed.items.map((item) => item.id)).toEqual(["edge:removed"]);
    expect(result.edges.modified.items).toEqual([
      expect.objectContaining({ id: "edge:changed", after: expect.objectContaining({ confidence: 0.25 }) })
    ]);
    expect(result.pendingReferences.added.items.map((item) => item.id)).toEqual(["pending:added"]);
    expect(result.pendingReferences.removed.items.map((item) => item.id)).toEqual([
      "pending:removed"
    ]);
    expect(result.pendingReferences.modified.items).toEqual([
      expect.objectContaining({
        id: "pending:changed",
        after: expect.objectContaining({ referenceName: "renamed" })
      })
    ]);
  });

  it("sorts every category before applying independent deterministic bounds", () => {
    const result = diffGenerationSnapshots(
      snapshot(),
      snapshot({
        files: [file("src/z.ts", "z"), file("src/a.ts", "a")],
        symbols: [symbol("symbol:z"), symbol("symbol:a")],
        edges: [edge("edge:z"), edge("edge:a")],
        pendingReferences: [pendingReference("pending:z"), pendingReference("pending:a")]
      }),
      { limit: 1 }
    );

    expect(result.files.added).toMatchObject({
      items: [expect.objectContaining({ path: "src/a.ts" })],
      total: 2,
      truncated: true
    });
    expect(result.symbols.added).toMatchObject({
      items: [expect.objectContaining({ id: "symbol:a" })],
      total: 2,
      truncated: true
    });
    expect(result.edges.added).toMatchObject({
      items: [expect.objectContaining({ id: "edge:a" })],
      total: 2,
      truncated: true
    });
    expect(result.pendingReferences.added).toMatchObject({
      items: [expect.objectContaining({ id: "pending:a" })],
      total: 2,
      truncated: true
    });
  });

  it("rejects snapshots with duplicate comparison identities", () => {
    expect(() =>
      diffGenerationSnapshots(
        snapshot({ files: [file("src/duplicate.ts", "one"), file("src/duplicate.ts", "two")] }),
        snapshot(),
        { limit: 1 }
      )
    ).toThrow(GenerationSnapshotComparisonError);
  });

  it("compares edge evidence by values rather than object property insertion order", () => {
    const before = snapshot({
      edges: [
        edge("edge:evidence", {
          evidence: {
            ruleId: "module-exact",
            stage: "module",
            candidateSymbolIds: ["symbol:a", "symbol:b"],
            configurationPaths: ["tsconfig.json"],
            resolutionPath: ["src/index.ts", "src/target.ts"]
          }
        })
      ]
    });
    const after = snapshot({
      edges: [
        edge("edge:evidence", {
          evidence: {
            resolutionPath: ["src/index.ts", "src/target.ts"],
            configurationPaths: ["tsconfig.json"],
            candidateSymbolIds: ["symbol:a", "symbol:b"],
            stage: "module",
            ruleId: "module-exact"
          }
        })
      ]
    });

    expect(diffGenerationSnapshots(before, after, { limit: 1 }).edges.modified).toEqual({
      items: [],
      total: 0,
      truncated: false
    });
  });

  it("reports extraction plugin provenance changes on edges and pending references", () => {
    const before = snapshot({
      edges: [
        edge("edge:extension", {
          evidence: {
            ruleId: "extension.reference",
            stage: "module",
            candidateSymbolIds: ["symbol:target"],
            extractionPlugin: {
              pluginId: "acme/framework-facts",
              pluginVersion: "1.0.0"
            }
          }
        })
      ],
      pendingReferences: [
        pendingReference("pending:extension", {
          extractionPlugin: {
            pluginId: "acme/framework-facts",
            pluginVersion: "1.0.0"
          }
        })
      ]
    });
    const after = snapshot({
      edges: [
        edge("edge:extension", {
          evidence: {
            ruleId: "extension.reference",
            stage: "module",
            candidateSymbolIds: ["symbol:target"],
            extractionPlugin: {
              pluginId: "acme/framework-facts",
              pluginVersion: "1.0.1"
            }
          }
        })
      ],
      pendingReferences: [
        pendingReference("pending:extension", {
          extractionPlugin: {
            pluginId: "acme/framework-facts",
            pluginVersion: "1.0.1"
          }
        })
      ]
    });

    const result = diffGenerationSnapshots(before, after, { limit: 2 });
    expect(result.edges.modified.items).toHaveLength(1);
    expect(result.pendingReferences.modified.items).toHaveLength(1);
  });
});
