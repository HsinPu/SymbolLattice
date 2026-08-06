import { describe, expect, it } from "vitest";

import {
  allocateExploreSourceWindowCharacters,
  EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY,
  EXPLORE_SOURCE_WINDOW_LIMITS,
  EXPLORE_SOURCE_WINDOW_POLICY,
  planExploreSourceWindows
} from "../../src/application/explore-source-windows.js";
import type { ExploreConnection, ExploreFocus } from "../../src/application/types.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";

function symbol(id: string, filePath: string, line: number): SymbolNode {
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
  line: number,
  resolution: GraphEdge["resolution"] = "exact"
): ExploreConnection {
  return {
    source,
    target,
    edge: {
      id,
      sourceId: source.id,
      targetId: target.id,
      kind: "calls",
      filePath: source.filePath,
      range: {
        start: { line, column: 3 },
        end: { line, column: 15 }
      },
      resolution,
      confidence: resolution === "exact" ? 1 : 0.5,
      referenceName: target.name,
      evidence: { ruleId: "test.call", stage: "lexical" }
    }
  };
}

function focus(rank: number, node: SymbolNode, primaryStart: number, primaryEnd: number): ExploreFocus {
  return {
    rank,
    symbol: node,
    score: 100,
    baseScore: 100,
    connectionScore: 0,
    matchedTerms: [node.name.toLowerCase()],
    reasons: ["exact-symbol-term"],
    reference: node.qualifiedName,
    match: { status: "exact", reference: node.qualifiedName, symbol: node, candidates: [node] },
    matchCandidatesTruncated: false,
    sourceAvailability: "active-generation",
    source: {
      filePath: node.filePath,
      startLine: primaryStart,
      endLine: primaryEnd,
      lines: [],
      range: {
        start: { line: primaryStart, column: 1 },
        end: { line: primaryEnd + 1, column: 1 }
      },
      text: "primary",
      sourceIdentity: {
        policy: "source-delivery-v2",
        id: `source:${"0".repeat(64)}`,
        canonicalization: "line-endings-lf",
        filePath: node.filePath,
        fullFileCharacterOffsets: { start: 0, end: 7 },
        contentSha256: "0".repeat(64),
        offsetMap: {
          policy: "source-delivery-offset-map-v1",
          deliveredTextLength: 7,
          sourceTextLength: 7,
          spans: [],
          mapSha256: "0".repeat(64)
        }
      },
      requestedCharacters: 7,
      emittedCharacters: 7,
      truncated: false,
      truncationReason: null
    },
    callers: { items: [], truncated: false },
    callees: { items: [], truncated: false },
    impact: { paths: [], truncated: false }
  };
}

describe("explore source window planning", () => {
  it("merges nearby exact call sites, excludes the primary excerpt, and enforces bounds", () => {
    const entry = symbol("entry", "src/entry.ts", 1);
    const target = symbol("target", "src/target.ts", 1);
    const secondary = symbol("secondary", "src/secondary.ts", 1);
    const connections = [
      edge("overlaps-primary", entry, target, 3),
      edge("near-a", entry, target, 100),
      edge("near-b", entry, secondary, 104),
      edge("far-a", entry, target, 200),
      edge("far-b", entry, target, 300),
      edge("heuristic", entry, target, 400, "heuristic"),
      edge("second-focus", secondary, target, 50)
    ];

    const plan = planExploreSourceWindows(
      [focus(1, entry, 1, 5), focus(2, secondary, 1, 5)],
      connections
    );

    expect(plan).toMatchObject({
      policy: EXPLORE_SOURCE_WINDOW_POLICY,
      limits: EXPLORE_SOURCE_WINDOW_LIMITS,
      summary: {
        candidateCount: 4,
        selectedCount: 3,
        selectedFocusCount: 2,
        truncated: true
      }
    });
    expect(plan.windows).toEqual([
      expect.objectContaining({
        index: 0,
        focusRank: 1,
        filePath: "src/entry.ts",
        startLine: 97,
        endLine: 107,
        connectionEdgeIds: ["near-a", "near-b"],
        relatedSymbolIds: ["target", "secondary"],
        reason: "exact-connection-site"
      }),
      expect.objectContaining({
        index: 1,
        focusRank: 1,
        startLine: 197,
        endLine: 203,
        connectionEdgeIds: ["far-a"]
      }),
      expect.objectContaining({
        index: 2,
        focusRank: 2,
        filePath: "src/secondary.ts",
        startLine: 47,
        endLine: 53,
        connectionEdgeIds: ["second-focus"]
      })
    ]);
  });

  it("is independent of connection input order", () => {
    const source = symbol("source", "src/source.ts", 1);
    const target = symbol("target", "src/target.ts", 1);
    const connections = [edge("b", source, target, 80), edge("a", source, target, 40)];

    expect(
      planExploreSourceWindows([focus(1, source, 1, 5)], [...connections].reverse())
    ).toEqual(planExploreSourceWindows([focus(1, source, 1, 5)], connections));
  });

  it("reserves only the source budget left after primary focus excerpts", () => {
    expect(
      allocateExploreSourceWindowCharacters({
        totalCharacterBudget: 24_000,
        primaryEmittedCharacters: 23_500,
        candidates: [
          { index: 0, requestedCharacters: 300 },
          { index: 1, requestedCharacters: 300 }
        ]
      })
    ).toEqual({
      policy: EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY,
      budget: {
        totalCharacterBudget: 24_000,
        primaryEmittedCharacters: 23_500,
        availableCharacters: 500
      },
      summary: {
        candidateCount: 2,
        requestedCharacters: 600,
        allocatedCharacters: 500,
        unusedCharacters: 0,
        truncated: true
      },
      windows: [
        {
          index: 0,
          requestedCharacters: 300,
          allocatedCharacters: 300,
          truncated: false,
          reason: "focus-rank-window-order"
        },
        {
          index: 1,
          requestedCharacters: 300,
          allocatedCharacters: 200,
          truncated: true,
          reason: "focus-rank-window-order"
        }
      ]
    });
  });
});
