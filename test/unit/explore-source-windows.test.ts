import { describe, expect, it } from "vitest";

import {
  allocateExploreSourceWindowCharacters,
  type ExploreSourceWindowAllocationCandidate,
  EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS,
  EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY,
  EXPLORE_SOURCE_WINDOW_LIMITS,
  EXPLORE_SOURCE_WINDOW_POLICY,
  planExploreSourceWindows
} from "../../src/application/explore-source-windows.js";
import type { ExploreConnection, ExploreFocus } from "../../src/application/types.js";
import type { ExplorePathSpinePlan } from "../../src/application/explore-path-spines.js";
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

  it("keeps raw explore relevance so generated source worth is applied exactly once", () => {
    const source = symbol("source", "src/source.generated.ts", 1);
    const target = symbol("target", "src/target.ts", 1);
    const generatedFocus: ExploreFocus = {
      ...focus(1, source, 1, 5),
      score: 510,
      baseScore: 510,
      generated: {
        classifierVersion: "generated-evidence-v1",
        generated: true,
        evidence: [{ kind: "path", ruleId: "test.generated", range: null }]
      },
      sourceWorth: 0.3,
      rankingScore: 153,
      rankingDecision: "generated-source-worth"
    };
    const plan = planExploreSourceWindows(
      [generatedFocus],
      [edge("source-target", source, target, 100)]
    );

    expect(plan.windows[0]).toMatchObject({ relevanceWeight: 510 });
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [{
        index: 0,
        filePath: source.filePath,
        requestedCharacters: 1_000,
        fullFileCharacters: 1_000,
        relevanceWeight: plan.windows[0]!.relevanceWeight,
        wholeFileEligible: false,
        generated: true,
        generatedClassifierVersion: "generated-evidence-v1",
        generatedEvidenceRuleIds: ["test.generated"]
      }]
    });

    expect(allocation.windows[0]).toMatchObject({
      relevanceWeight: 510,
      sourceWorth: 0.3,
      effectiveWeight: 153
    });
  });

  it("adds a bounded bridge declaration window from an exact path spine", () => {
    const entry = symbol("entry", "src/entry.ts", 1);
    const bridge = symbol("bridge", "src/bridge.ts", 1);
    const target = symbol("target", "src/target.ts", 20);
    const first = edge("entry-bridge", entry, bridge, 5);
    const second = edge("bridge-target", bridge, target, 12);
    const spinePlan: ExplorePathSpinePlan = {
      policy: "explore-path-spines-v2",
      limits: {
        maximumPairAttempts: 16,
        maximumHops: 4,
        maximumVisitedSymbolsPerPair: 500,
        maximumSpines: 4,
        maximumBridgeSymbols: 8
      },
      summary: {
        pairCandidateCount: 1,
        attemptedPairCount: 1,
        discoveredSpineCount: 1,
        selectedSpineCount: 1,
        bridgeSymbolCount: 1,
        pairAttemptsTruncated: false,
        spinesTruncated: false,
        traversalTruncated: false
      },
      spines: [{
        index: 0,
        fromFocusRank: 1,
        toFocusRank: 2,
        score: 80,
        bridgeSymbols: [bridge],
        edgeIds: [first.edge.id, second.edge.id],
        path: {
          symbols: [entry, bridge, target],
          edges: [first.edge, second.edge],
          steps: [
            { from: entry, to: bridge, edge: first.edge },
            { from: bridge, to: target, edge: second.edge }
          ]
        }
      }]
    };

    const plan = planExploreSourceWindows(
      [focus(1, entry, 1, 5), focus(2, target, 20, 24)],
      [],
      spinePlan
    );

    expect(plan.windows).toEqual([
      expect.objectContaining({
        index: 0,
        focusRank: 1,
        filePath: "src/bridge.ts",
        startLine: 1,
        endLine: 6,
        connectionEdgeIds: ["entry-bridge", "bridge-target"],
        relatedSymbolIds: ["bridge"],
        pathSpineIndexes: [0],
        relevanceWeight: 100,
        reason: "exact-path-spine"
      })
    ]);
  });

  it("reserves only the source budget left after primary focus excerpts", () => {
    expect(
      allocateExploreSourceWindowCharacters({
        totalCharacterBudget: 24_000,
        primaryEmittedCharacters: 23_000,
        candidates: [
          {
            index: 1,
            filePath: "src/second.ts",
            requestedCharacters: 1_000,
            fullFileCharacters: 1_000,
            relevanceWeight: 1,
            wholeFileEligible: false
          },
          {
            index: 0,
            filePath: "src/first.ts",
            requestedCharacters: 1_000,
            fullFileCharacters: 1_000,
            relevanceWeight: 3,
            wholeFileEligible: false
          }
        ]
      })
    ).toEqual({
      policy: EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY,
      budget: {
        totalCharacterBudget: 24_000,
        primaryEmittedCharacters: 23_000,
        availableCharacters: 1_000,
        minimumPerWindow: EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.minimumPerWindow,
        maximumShareFraction: EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.maximumShareFraction,
        generatedSourceWorth: 0.3,
        relativeCliffFraction: 0.15,
        relativeCliffMaximumWeight: 10,
        relativeCliffThreshold: 0.45,
        wholeFileGraceFraction: 0.15,
        wholeFileGraceMaximumCharacters: 800,
        wholeFileBuyMinimumCoverageFraction: 0.6,
        wholeFileBuyOvershootFraction: 0.15,
        wholeFileBuyOvershootBudget: 3_600,
        wholeFileBuyOvershootSpentCharacters: 0
      },
      summary: {
        candidateCount: 2,
        generatedCandidates: 0,
        cliffedWindows: 0,
        wholeFileEligibleCandidates: 0,
        wholeFilePromotedWindows: 0,
        requestedCharacters: 2_000,
        baseAllocatedCharacters: 1_000,
        allocatedCharacters: 1_000,
        unusedCharacters: 0,
        truncated: true
      },
      windows: [
        {
          index: 0,
          filePath: "src/first.ts",
          windowRequestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          requestedCharacters: 1_000,
          relevanceWeight: 3,
          generated: false,
          generatedClassifierVersion: "unclassified-allocation-input",
          generatedEvidenceRuleIds: [],
          sourceWorth: 1,
          effectiveWeight: 3,
          cliffExempt: false,
          allocationDecision: "admitted",
          maximumShareCharacters: 700,
          baseAllocatedCharacters: 622,
          allocatedCharacters: 622,
          wholeFileEligible: false,
          wholeFileCoverageFraction: 0.622,
          wholeFileGraceCharacters: 93,
          wholeFileOvershootCharacters: 0,
          wholeFileBuySpentCharacters: 0,
          renderMode: "window",
          wholeFileDecision: "not-eligible",
          truncated: true,
          reason: "score-spine-and-source-worth"
        },
        {
          index: 1,
          filePath: "src/second.ts",
          windowRequestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          requestedCharacters: 1_000,
          relevanceWeight: 1,
          generated: false,
          generatedClassifierVersion: "unclassified-allocation-input",
          generatedEvidenceRuleIds: [],
          sourceWorth: 1,
          effectiveWeight: 1,
          cliffExempt: false,
          allocationDecision: "admitted",
          maximumShareCharacters: 700,
          baseAllocatedCharacters: 378,
          allocatedCharacters: 378,
          wholeFileEligible: false,
          wholeFileCoverageFraction: 0.378,
          wholeFileGraceCharacters: 56,
          wholeFileOvershootCharacters: 0,
          wholeFileBuySpentCharacters: 0,
          renderMode: "window",
          wholeFileDecision: "not-eligible",
          truncated: true,
          reason: "score-spine-and-source-worth"
        }
      ]
    });
  });

  it("promotes one bridge window to a whole file inside the grace allowance", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [{
        index: 0,
        filePath: "src/bridge.ts",
        requestedCharacters: 600,
        fullFileCharacters: 650,
        relevanceWeight: 10,
        wholeFileEligible: true
      }]
    });

    expect(allocation).toMatchObject({
      policy: "explore-source-window-allocation-v4",
      budget: {
        wholeFileGraceFraction: 0.15,
        wholeFileGraceMaximumCharacters: 800,
        wholeFileBuyMinimumCoverageFraction: 0.6,
        wholeFileBuyOvershootFraction: 0.15,
        wholeFileBuyOvershootBudget: 150,
        wholeFileBuyOvershootSpentCharacters: 0
      },
      summary: {
        wholeFileEligibleCandidates: 1,
        wholeFilePromotedWindows: 1,
        baseAllocatedCharacters: 600,
        allocatedCharacters: 650,
        unusedCharacters: 350,
        truncated: false
      },
      windows: [{
        index: 0,
        filePath: "src/bridge.ts",
        windowRequestedCharacters: 600,
        fullFileCharacters: 650,
        requestedCharacters: 650,
        baseAllocatedCharacters: 600,
        allocatedCharacters: 650,
        wholeFileEligible: true,
        wholeFileCoverageFraction: 600 / 650,
        wholeFileGraceCharacters: 90,
        wholeFileOvershootCharacters: 50,
        wholeFileBuySpentCharacters: 0,
        renderMode: "whole-file",
        wholeFileDecision: "grace",
        truncated: false
      }]
    });
  });

  it("spends one shared whole-file buy pool in stable window order", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 2_000,
      primaryEmittedCharacters: 0,
      candidates: [
        {
          index: 0,
          filePath: "src/first.ts",
          requestedCharacters: 600,
          fullFileCharacters: 850,
          relevanceWeight: 2,
          wholeFileEligible: true
        },
        {
          index: 1,
          filePath: "src/second.ts",
          requestedCharacters: 600,
          fullFileCharacters: 850,
          relevanceWeight: 1,
          wholeFileEligible: true
        }
      ]
    });

    expect(allocation.budget).toMatchObject({
      wholeFileBuyOvershootBudget: 300,
      wholeFileBuyOvershootSpentCharacters: 250
    });
    expect(allocation.summary).toMatchObject({
      wholeFileEligibleCandidates: 2,
      wholeFilePromotedWindows: 1,
      baseAllocatedCharacters: 1_200,
      allocatedCharacters: 1_450,
      unusedCharacters: 550,
      truncated: false
    });
    expect(allocation.windows).toEqual([
      expect.objectContaining({
        index: 0,
        renderMode: "whole-file",
        wholeFileDecision: "buy",
        wholeFileOvershootCharacters: 250,
        wholeFileBuySpentCharacters: 250,
        allocatedCharacters: 850
      }),
      expect.objectContaining({
        index: 1,
        renderMode: "window",
        wholeFileDecision: "window-only",
        wholeFileOvershootCharacters: 0,
        wholeFileBuySpentCharacters: 0,
        allocatedCharacters: 600
      })
    ]);
    expect(
      allocation.summary.allocatedCharacters + allocation.budget.primaryEmittedCharacters
    ).toBeLessThanOrEqual(allocation.budget.totalCharacterBudget);
  });

  it("assigns whole-file ownership to only the strongest window for one file", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [
        {
          index: 0,
          filePath: "src/shared.ts",
          requestedCharacters: 400,
          fullFileCharacters: 450,
          relevanceWeight: 1,
          wholeFileEligible: true
        },
        {
          index: 1,
          filePath: "src/shared.ts",
          requestedCharacters: 400,
          fullFileCharacters: 450,
          relevanceWeight: 2,
          wholeFileEligible: true
        }
      ]
    });

    expect(allocation.windows).toEqual([
      expect.objectContaining({
        index: 0,
        renderMode: "window",
        wholeFileDecision: "duplicate-file"
      }),
      expect.objectContaining({
        index: 1,
        renderMode: "whole-file",
        wholeFileDecision: "grace"
      })
    ]);
  });

  it("fails closed when a whole-file candidate omits its persisted file identity", () => {
    expect(() => allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [{
        index: 0,
        requestedCharacters: 400,
        fullFileCharacters: 450,
        relevanceWeight: 1,
        wholeFileEligible: true
      } as ExploreSourceWindowAllocationCandidate]
    })).toThrowError(RangeError);
  });

  it("rejects a whole-file size smaller than its planned source window", () => {
    expect(() => allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [{
        index: 0,
        filePath: "src/bridge.ts",
        requestedCharacters: 451,
        fullFileCharacters: 450,
        relevanceWeight: 1,
        wholeFileEligible: true
      }]
    })).toThrowError(RangeError);
  });

  it("never spends grace or buy characters beyond the remaining total envelope", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 600,
      candidates: [{
        index: 0,
        filePath: "src/bridge.ts",
        requestedCharacters: 300,
        fullFileCharacters: 450,
        relevanceWeight: 1,
        wholeFileEligible: true
      }]
    });

    expect(allocation.windows[0]).toMatchObject({
      allocatedCharacters: 300,
      renderMode: "window",
      wholeFileDecision: "window-only"
    });
    expect(
      allocation.summary.allocatedCharacters + allocation.budget.primaryEmittedCharacters
    ).toBeLessThanOrEqual(allocation.budget.totalCharacterBudget);
  });

  it("cliffs low-worth generated source without displacing a relevant handwritten window", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_200,
      primaryEmittedCharacters: 0,
      candidates: [
        {
          index: 0,
          filePath: "src/primary.ts",
          requestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          relevanceWeight: 100,
          wholeFileEligible: false,
          generated: false,
          generatedClassifierVersion: "generated-evidence-v1",
          generatedEvidenceRuleIds: [],
          cliffExempt: false
        },
        {
          index: 1,
          filePath: "src/contracts.generated.ts",
          requestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          relevanceWeight: 20,
          wholeFileEligible: false,
          generated: true,
          generatedClassifierVersion: "generated-evidence-v1",
          generatedEvidenceRuleIds: [
            "generated.path.javascript.generated-suffix",
            "generated.path.javascript.generated-suffix"
          ],
          cliffExempt: false
        },
        {
          index: 2,
          filePath: "src/handwritten-bridge.ts",
          requestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          relevanceWeight: 15,
          wholeFileEligible: false,
          generated: false,
          generatedClassifierVersion: "generated-evidence-v1",
          generatedEvidenceRuleIds: [],
          cliffExempt: false
        }
      ] as readonly ExploreSourceWindowAllocationCandidate[]
    });

    expect(allocation).toMatchObject({
      policy: "explore-source-window-allocation-v4",
      budget: {
        generatedSourceWorth: 0.3,
        relativeCliffFraction: 0.15,
        relativeCliffMaximumWeight: 10,
        relativeCliffThreshold: 10
      },
      summary: {
        generatedCandidates: 1,
        cliffedWindows: 1
      },
      windows: [
        expect.objectContaining({
          index: 0,
          sourceWorth: 1,
          effectiveWeight: 100,
          allocationDecision: "admitted"
        }),
        expect.objectContaining({
          index: 1,
          sourceWorth: 0.3,
          effectiveWeight: 6,
          generatedEvidenceRuleIds: ["generated.path.javascript.generated-suffix"],
          allocatedCharacters: 0,
          allocationDecision: "relative-cliff",
          reason: "score-spine-and-source-worth"
        }),
        expect.objectContaining({
          index: 2,
          sourceWorth: 1,
          effectiveWeight: 15,
          allocationDecision: "admitted"
        })
      ]
    });
    expect(allocation.windows[2]!.allocatedCharacters).toBeGreaterThan(0);
  });

  it("keeps an exact path-spine window even when generated source worth is below the cliff", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [
        {
          index: 0,
          filePath: "src/entry.ts",
          requestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          relevanceWeight: 100,
          wholeFileEligible: false,
          generated: false,
          generatedClassifierVersion: "generated-evidence-v1",
          generatedEvidenceRuleIds: [],
          cliffExempt: false
        },
        {
          index: 1,
          filePath: "src/flow.generated.ts",
          requestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          relevanceWeight: 1,
          wholeFileEligible: true,
          generated: true,
          generatedClassifierVersion: "generated-evidence-v1",
          generatedEvidenceRuleIds: ["generated.path.javascript.generated-suffix"],
          cliffExempt: true
        }
      ]
    });

    expect(allocation.windows[1]).toMatchObject({
      generated: true,
      sourceWorth: 0.3,
      effectiveWeight: 0.3,
      cliffExempt: true,
      allocationDecision: "admitted"
    });
    expect(allocation.windows[1]!.allocatedCharacters).toBeGreaterThanOrEqual(
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.minimumPerWindow
    );
  });
});
