import { describe, expect, it } from "vitest";

import {
  EXPLORE_PATH_SPINE_LIMITS,
  EXPLORE_PATH_SPINE_POLICY,
  planExplorePathSpines
} from "../../src/application/explore-path-spines.js";
import type { ExploreQuerySelection } from "../../src/application/explore-query.js";
import { createGraphQueryView } from "../../src/domain/graph.js";
import type { GraphEdge, GraphSnapshot, SymbolNode } from "../../src/domain/types.js";

function symbol(id: string, filePath: string, line = 1): SymbolNode {
  return {
    id,
    name: id,
    qualifiedName: `${filePath}#${id}`,
    kind: "function",
    filePath,
    range: {
      start: { line, column: 1 },
      end: { line: line + 2, column: 2 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
}

function edge(
  id: string,
  source: SymbolNode,
  target: SymbolNode,
  resolution: GraphEdge["resolution"] = "exact"
): GraphEdge {
  return {
    id,
    sourceId: source.id,
    targetId: target.id,
    kind: "calls",
    filePath: source.filePath,
    range: {
      start: { line: source.range.start.line + 1, column: 3 },
      end: { line: source.range.start.line + 1, column: 14 }
    },
    resolution,
    confidence: resolution === "exact" ? 1 : 0.5,
    referenceName: target.name,
    evidence: { ruleId: "test.path", stage: "module" }
  };
}

function selection(rank: number, node: SymbolNode, score: number): ExploreQuerySelection {
  return {
    rank,
    symbol: node,
    score,
    baseScore: score,
    connectionScore: 0,
    matchedTerms: [node.name.toLowerCase()],
    reasons: ["exact-symbol-term"]
  };
}

function snapshot(symbols: readonly SymbolNode[], edges: readonly GraphEdge[]): GraphSnapshot {
  return {
    files: [...new Set(symbols.map((node) => node.filePath))].map((path) => ({
      path,
      language: "typescript",
      indexedAt: "2026-08-06T00:00:00.000Z",
      contentHash: `hash:${path}`
    })),
    symbols,
    edges
  };
}

describe("explore path spine planning", () => {
  it("retains a bounded exact bridge path between ranked focuses", () => {
    const entry = symbol("entry", "src/entry.ts", 1);
    const bridge = symbol("bridge", "src/bridge.ts", 10);
    const target = symbol("target", "src/target.ts", 20);
    const graph = snapshot(
      [entry, bridge, target],
      [edge("entry-bridge", entry, bridge), edge("bridge-target", bridge, target)]
    );

    const plan = planExplorePathSpines(graph, [
      selection(1, entry, 90),
      selection(2, target, 70)
    ]);
    const viewPlan = planExplorePathSpines(
      graph,
      [selection(1, entry, 90), selection(2, target, 70)],
      createGraphQueryView(graph)
    );
    expect(viewPlan).toEqual(plan);

    expect(plan).toMatchObject({
      policy: EXPLORE_PATH_SPINE_POLICY,
      limits: EXPLORE_PATH_SPINE_LIMITS,
      summary: {
        pairCandidateCount: 1,
        attemptedPairCount: 1,
        discoveredSpineCount: 1,
        selectedSpineCount: 1,
        bridgeSymbolCount: 1,
        pairAttemptsTruncated: false,
        spinesTruncated: false,
        traversalTruncated: false
      }
    });
    expect(plan.spines).toEqual([
      expect.objectContaining({
        index: 0,
        fromFocusRank: 1,
        toFocusRank: 2,
        score: 80,
        bridgeSymbols: [bridge],
        edgeIds: ["entry-bridge", "bridge-target"],
        path: expect.objectContaining({
          symbols: [entry, bridge, target],
          edges: [expect.objectContaining({ id: "entry-bridge" }), expect.objectContaining({ id: "bridge-target" })]
        })
      })
    ]);
  });

  it("does not invent a spine from heuristic edges and is input-order independent", () => {
    const entry = symbol("entry", "src/entry.ts");
    const bridge = symbol("bridge", "src/bridge.ts");
    const target = symbol("target", "src/target.ts");
    const graph = snapshot(
      [target, bridge, entry],
      [edge("bridge-target", bridge, target), edge("entry-bridge", entry, bridge, "heuristic")]
    );
    const selections = [selection(2, target, 70), selection(1, entry, 90)];

    const plan = planExplorePathSpines(graph, selections);

    expect(plan.summary).toMatchObject({
      pairCandidateCount: 1,
      attemptedPairCount: 1,
      discoveredSpineCount: 0,
      selectedSpineCount: 0
    });
    expect(plan.spines).toEqual([]);
    expect(plan).toEqual(
      planExplorePathSpines(
        snapshot([...graph.symbols].reverse(), [...graph.edges].reverse()),
        [...selections].reverse()
      )
    );
  });

  it("does not duplicate a bridge that is already a selected focus", () => {
    const entry = symbol("entry", "src/entry.ts");
    const bridge = symbol("bridge", "src/bridge.ts");
    const target = symbol("target", "src/target.ts");
    const graph = snapshot(
      [entry, bridge, target],
      [edge("entry-bridge", entry, bridge), edge("bridge-target", bridge, target)]
    );

    const plan = planExplorePathSpines(graph, [
      selection(1, entry, 90),
      selection(2, bridge, 80),
      selection(3, target, 70)
    ]);

    expect(plan.spines).toEqual([]);
    expect(plan.summary.bridgeSymbolCount).toBe(0);
  });
});
