import { describe, expect, it } from "vitest";

import {
  findSymbols,
  getCallees,
  getCallers,
  getImpactPaths,
  matchSymbol,
  type GraphEdge,
  type SymbolNode
} from "../../../src/domain/index.js";

function symbol(input: {
  readonly id: string;
  readonly name: string;
  readonly filePath?: string;
  readonly startLine?: number;
}): SymbolNode {
  const filePath = input.filePath ?? "src/example.ts";
  const startLine = input.startLine ?? 1;
  return {
    id: input.id,
    name: input.name,
    qualifiedName: `${filePath}#${input.name}`,
    kind: "function",
    filePath,
    range: {
      start: { line: startLine, column: 1 },
      end: { line: startLine + 1, column: 20 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
}

function edge(input: {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string | null;
  readonly kind?: GraphEdge["kind"];
  readonly resolution?: GraphEdge["resolution"];
}): GraphEdge {
  return {
    id: input.id,
    sourceId: input.sourceId,
    targetId: input.targetId,
    kind: input.kind ?? "calls",
    filePath: "src/example.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 4 }
    },
    resolution: input.resolution ?? "exact",
    confidence: input.resolution === "heuristic" ? 0.7 : 1,
    referenceName: null
  };
}

describe("pure graph traversal", () => {
  const changed = symbol({ id: "changed", name: "changed", startLine: 10 });
  const directCaller = symbol({ id: "direct", name: "callerDirect", startLine: 20 });
  const transitiveCaller = symbol({ id: "transitive", name: "callerTransitive", startLine: 30 });
  const duplicateOne = symbol({ id: "duplicate-one", name: "duplicate", filePath: "src/a.ts" });
  const duplicateTwo = symbol({ id: "duplicate-two", name: "duplicate", filePath: "src/b.ts" });
  const graph = {
    symbols: [transitiveCaller, duplicateTwo, changed, directCaller, duplicateOne],
    edges: [
      edge({ id: "direct-calls-changed", sourceId: "direct", targetId: "changed" }),
      edge({ id: "transitive-calls-direct", sourceId: "transitive", targetId: "direct" }),
      edge({ id: "cycle", sourceId: "changed", targetId: "transitive" }),
      edge({ id: "heuristic", sourceId: "direct", targetId: "changed", resolution: "heuristic" }),
      edge({ id: "unresolved", sourceId: "direct", targetId: null, resolution: "unresolved" }),
      edge({ id: "contains", sourceId: "duplicate-one", targetId: "changed", kind: "contains" })
    ]
  };

  it("matches qualified names, source locations, and ambiguity deterministically", () => {
    expect(matchSymbol(graph, changed.qualifiedName)).toMatchObject({
      status: "exact",
      symbol: { id: "changed" }
    });
    expect(matchSymbol(graph, "src/example.ts:10")).toMatchObject({
      status: "exact",
      symbol: { id: "changed" }
    });
    expect(matchSymbol(graph, "duplicate")).toMatchObject({
      status: "ambiguous",
      candidates: [{ id: "duplicate-one" }, { id: "duplicate-two" }]
    });
  });

  it("finds symbols with deterministic filtering", () => {
    expect(findSymbols(graph, "caller").map((item) => item.id)).toEqual([
      "direct",
      "transitive"
    ]);
    expect(findSymbols(graph, "", { limit: 1 })).toEqual([]);
  });

  it("returns resolved caller and callee evidence while skipping unresolved edges", () => {
    expect(getCallers(graph, "changed").map((relation) => relation.edge.id)).toEqual([
      "direct-calls-changed",
      "heuristic"
    ]);
    expect(getCallees(graph, "direct").map((relation) => relation.symbol.id)).toEqual([
      "changed",
      "changed"
    ]);
  });

  it("walks reverse call dependencies without cycles and honors depth", () => {
    expect(getImpactPaths(graph, "changed", 1).map((path) => path.symbols.at(-1)?.id)).toEqual([
      "direct"
    ]);
    expect(getImpactPaths(graph, "changed", 2).map((path) => path.symbols.at(-1)?.id)).toEqual([
      "direct",
      "transitive"
    ]);
    expect(() => getImpactPaths(graph, "changed", 0)).toThrow("positive integer");
  });
});
