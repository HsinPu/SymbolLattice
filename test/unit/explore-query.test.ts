import { describe, expect, it } from "vitest";

import {
  EXPLORE_QUERY_LIMITS,
  EXPLORE_QUERY_PLAN_POLICY,
  planExploreQuery
} from "../../src/application/explore-query.js";
import {
  GENERATED_FILE_CLASSIFIER_VERSION,
  type GraphEdge,
  type IndexedFile,
  type SymbolNode
} from "../../src/domain/index.js";

function indexedFile(path: string, generated: boolean): IndexedFile {
  return {
    path,
    contentHash: `hash:${path}`,
    language: "typescript",
    indexedAt: "2026-08-06T00:00:00.000Z",
    generated: {
      classifierVersion: GENERATED_FILE_CLASSIFIER_VERSION,
      generated,
      evidence: generated
        ? [{ kind: "path", ruleId: "test.generated", range: null }]
        : []
    }
  };
}

function symbol(input: {
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  readonly line?: number;
  readonly kind?: SymbolNode["kind"];
}): SymbolNode {
  const line = input.line ?? 1;
  return {
    id: input.id,
    name: input.name,
    qualifiedName: `${input.filePath}#${input.name}`,
    kind: input.kind ?? "function",
    filePath: input.filePath,
    range: {
      start: { line, column: 0 },
      end: { line: line + 2, column: 1 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
}

function edge(id: string, sourceId: string, targetId: string): GraphEdge {
  return {
    id,
    sourceId,
    targetId,
    kind: "calls",
    filePath: "src/api/orders.ts",
    range: {
      start: { line: 2, column: 0 },
      end: { line: 2, column: 12 }
    },
    resolution: "exact",
    confidence: 1,
    referenceName: null,
    evidence: {
      ruleId: "test.call",
      stage: "lexical"
    }
  };
}

describe("explore query planning", () => {
  it("uses bounded exact one-hop graph mass to corroborate an otherwise tied candidate", () => {
    const connected = symbol({
      id: "connected",
      name: "orderService",
      filePath: "src/z-connected.ts"
    });
    const isolated = symbol({
      id: "isolated",
      name: "orderService",
      filePath: "src/a-isolated.ts"
    });
    const helper = symbol({
      id: "helper",
      name: "persistOrder",
      filePath: "src/persistence.ts"
    });

    const plan = planExploreQuery(
      {
        files: [
          indexedFile(connected.filePath, false),
          indexedFile(isolated.filePath, false),
          indexedFile(helper.filePath, false)
        ],
        symbols: [isolated, helper, connected],
        edges: [edge("connected-helper", connected.id, helper.id)]
      },
      "orderService"
    );

    expect(plan).toMatchObject({
      policy: "explore-query-plan-v3",
      ranking: {
        graphMass: {
          policy: "explore-query-graph-mass-v1",
          maximumRelationships: 32,
          maximumScore: 120,
          relationWeights: { calls: 12, contains: 0 }
        }
      },
      summary: {
        graphMassCandidateCount: 1,
        graphMassTruncatedCandidateCount: 0
      }
    });
    expect(plan.selection.map((item) => item.symbol.id)).toEqual(["connected", "isolated"]);
    expect(plan.selection[0]).toMatchObject({
      score: 522,
      rankingScore: 522,
      reasons: expect.arrayContaining(["graph-mass"]),
      graphMass: {
        policy: "explore-query-graph-mass-v1",
        exactRelationshipCount: 1,
        distinctNeighborCount: 1,
        uncappedScore: 12,
        score: 12,
        rankingContribution: 12,
        truncated: false,
        relationCounts: { calls: 1 }
      }
    });
    expect(plan.selection[1]).toMatchObject({
      score: 510,
      graphMass: {
        exactRelationshipCount: 0,
        score: 0,
        rankingContribution: 0,
        relationCounts: {}
      }
    });
  });

  it("caps generated graph mass and reports omitted evidence without counting weak relations", () => {
    const generated = symbol({
      id: "generated",
      name: "orderService",
      filePath: "src/order-service.generated.ts"
    });
    const helpers = Array.from({ length: 40 }, (_, index) => symbol({
      id: `helper-${index}`,
      name: `helper${index}`,
      filePath: `src/helpers/helper-${index}.ts`
    }));
    const exactCalls = helpers.map((helper, index) =>
      edge(`call-${index}`, generated.id, helper.id)
    );
    const duplicateCall = edge("call-duplicate", generated.id, helpers[0]!.id);
    const containment = {
      ...edge("contains-helper", generated.id, helpers[1]!.id),
      kind: "contains" as const
    };
    const heuristicCall = {
      ...edge("heuristic-helper", generated.id, helpers[2]!.id),
      resolution: "heuristic" as const
    };
    const unresolvedReference = {
      ...edge("unresolved-helper", generated.id, helpers[3]!.id),
      targetId: null,
      resolution: "unresolved" as const
    };

    const plan = planExploreQuery(
      {
        files: [
          indexedFile(generated.filePath, true),
          ...helpers.map((helper) => indexedFile(helper.filePath, false))
        ],
        symbols: [generated, ...helpers],
        edges: [
          ...exactCalls,
          duplicateCall,
          containment,
          heuristicCall,
          unresolvedReference
        ]
      },
      "orderService"
    );

    expect(plan.summary).toMatchObject({
      graphMassCandidateCount: 1,
      graphMassTruncatedCandidateCount: 1
    });
    expect(plan.selection[0]).toMatchObject({
      score: 630,
      rankingScore: 189,
      sourceWorth: 0.3,
      graphMass: {
        eligibleRelationshipCount: 40,
        exactRelationshipCount: 32,
        omittedRelationshipCount: 8,
        distinctNeighborCount: 32,
        uncappedScore: 384,
        score: 120,
        rankingContribution: 36,
        truncated: true,
        relationCounts: { calls: 32 }
      }
    });
  });

  it("uses numeric generated source worth without turning ranking into a hard partition", () => {
    const handwrittenExact = symbol({
      id: "hand-exact",
      name: "orderService",
      filePath: "src/order-service.ts"
    });
    const generatedExact = symbol({
      id: "generated-exact",
      name: "orderService",
      filePath: "src/order-service.generated.ts"
    });
    const handwrittenPartial = symbol({
      id: "hand-partial",
      name: "orderServiceAdapter",
      filePath: "src/order-service-adapter.ts"
    });

    const plan = planExploreQuery(
      {
        files: [
          indexedFile(handwrittenExact.filePath, false),
          indexedFile(generatedExact.filePath, true),
          indexedFile(handwrittenPartial.filePath, false)
        ],
        symbols: [generatedExact, handwrittenPartial, handwrittenExact],
        edges: []
      },
      "orderService"
    );

    expect(plan).toMatchObject({
      policy: "explore-query-plan-v3",
      ranking: {
        policy: "explore-query-source-worth-v1",
        generatedSourceWorth: 0.3,
        explicitFileExempt: true,
        classifierVersion: GENERATED_FILE_CLASSIFIER_VERSION
      },
      summary: {
        candidateCount: 3,
        generatedCandidateCount: 1,
        selectedGeneratedCount: 1
      }
    });
    expect(plan.selection.map((item) => item.symbol.id)).toEqual([
      "hand-exact",
      "generated-exact",
      "hand-partial"
    ]);
    expect(plan.selection).toEqual([
      expect.objectContaining({
        rank: 1,
        score: 510,
        rankingScore: 510,
        sourceWorth: 1,
        rankingDecision: "handwritten-source-worth",
        generated: expect.objectContaining({ generated: false })
      }),
      expect.objectContaining({
        rank: 2,
        score: 510,
        rankingScore: 153,
        sourceWorth: 0.3,
        rankingDecision: "generated-source-worth",
        generated: expect.objectContaining({
          generated: true,
          evidence: [{ kind: "path", ruleId: "test.generated", range: null }]
        })
      }),
      expect.objectContaining({
        rank: 3,
        score: 130,
        rankingScore: 130,
        sourceWorth: 1,
        rankingDecision: "handwritten-source-worth"
      })
    ]);
  });

  it("keeps an explicitly named generated file ahead without hiding its lower source worth", () => {
    const generated = symbol({
      id: "generated",
      name: "orderService",
      filePath: "src/order-service.generated.ts"
    });
    const handwritten = symbol({
      id: "handwritten",
      name: "orderService",
      filePath: "src/order-service.ts"
    });

    const plan = planExploreQuery(
      {
        files: [
          indexedFile(generated.filePath, true),
          indexedFile(handwritten.filePath, false)
        ],
        symbols: [handwritten, generated],
        edges: []
      },
      "show src/order-service.generated.ts orderService"
    );

    expect(plan.selection.map((item) => item.symbol.id)).toEqual(["generated", "handwritten"]);
    expect(plan.selection[0]).toMatchObject({
      score: 1_510,
      rankingScore: 1_510,
      sourceWorth: 0.3,
      rankingDecision: "explicit-file-exempt",
      generated: { generated: true }
    });
  });

  it("puts declarations from an explicitly named file before equally named symbols elsewhere", () => {
    const apiCreate = symbol({
      id: "api-create",
      name: "createOrder",
      filePath: "src/api/orders.ts"
    });
    const apiHelper = symbol({
      id: "api-helper",
      name: "validatePayload",
      filePath: "src/api/orders.ts",
      line: 10
    });
    const legacyCreate = symbol({
      id: "legacy-create",
      name: "createOrder",
      filePath: "src/legacy/orders.ts"
    });
    const persist = symbol({
      id: "persist",
      name: "persistOrder",
      filePath: "src/data/orders.ts"
    });

    const plan = planExploreQuery(
      {
        symbols: [legacyCreate, persist, apiHelper, apiCreate],
        edges: [edge("create-persists", "api-create", "persist")]
      },
      "Trace `src/api/orders.ts` createOrder to persistOrder"
    );

    expect(plan).toMatchObject({
      policy: EXPLORE_QUERY_PLAN_POLICY,
      fileHints: ["src/api/orders.ts"],
      identifierTerms: ["createorder", "persistorder"],
      limits: EXPLORE_QUERY_LIMITS,
      summary: {
        candidateCount: 4,
        selectedCount: 4,
        selectedFileCount: 3,
        truncated: false
      }
    });
    expect(plan.selection.map((item) => item.symbol.id)).toEqual([
      "api-create",
      "api-helper",
      "persist",
      "legacy-create"
    ]);
    expect(plan.selection[0]).toMatchObject({
      rank: 1,
      reasons: ["explicit-file", "exact-symbol-term", "graph-connected", "graph-mass"]
    });
    expect(plan.selection[1]).toMatchObject({
      rank: 2,
      reasons: ["explicit-file"]
    });
  });

  it("uses a safe project-relative path-only query to orient inside that file", () => {
    const first = symbol({ id: "first", name: "first", filePath: "src/feature.ts", line: 5 });
    const second = symbol({ id: "second", name: "second", filePath: "src/feature.ts", line: 20 });
    const other = symbol({ id: "other", name: "other", filePath: "src/other.ts" });

    const plan = planExploreQuery(
      { symbols: [other, second, first], edges: [] },
      "show src\\feature.ts"
    );

    expect(plan.fileHints).toEqual(["src/feature.ts"]);
    expect(plan.identifierTerms).toEqual([]);
    expect(plan.selection.map((item) => item.symbol.id)).toEqual(["first", "second"]);
    expect(plan.selection.every((item) => item.reasons.includes("explicit-file"))).toBe(true);
  });

  it("is input-order independent and enforces file, symbol, and per-file bounds", () => {
    const symbols = Array.from({ length: 12 }, (_, index) =>
      symbol({
        id: `worker-${index}`,
        name: `worker${index}`,
        filePath: `src/group-${Math.floor(index / 3)}.ts`,
        line: index + 1
      })
    );
    const graph = { symbols, edges: [] };

    const forward = planExploreQuery(graph, "worker");
    const reversed = planExploreQuery({ ...graph, symbols: [...symbols].reverse() }, "worker");

    expect(reversed).toEqual(forward);
    expect(forward.selection).toHaveLength(EXPLORE_QUERY_LIMITS.maximumSymbols);
    expect(new Set(forward.selection.map((item) => item.symbol.filePath)).size).toBe(
      EXPLORE_QUERY_LIMITS.maximumFiles
    );
    for (const filePath of new Set(forward.selection.map((item) => item.symbol.filePath))) {
      expect(forward.selection.filter((item) => item.symbol.filePath === filePath)).toHaveLength(
        EXPLORE_QUERY_LIMITS.maximumSymbolsPerFile
      );
    }
    expect(forward.summary).toMatchObject({
      candidateCount: 12,
      selectedCount: 8,
      selectedFileCount: 4,
      truncated: true
    });
  });

  it("does not treat traversal, absolute paths, stop words, or file symbols as focus evidence", () => {
    const declaration = symbol({ id: "flow", name: "flow", filePath: "src/flow.ts" });
    const file = symbol({
      id: "file",
      name: "src/flow.ts",
      filePath: "src/flow.ts",
      kind: "file"
    });

    const plan = planExploreQuery(
      { symbols: [declaration, file], edges: [] },
      "how does ../secret.ts C:\\secret.ts the and from"
    );

    expect(plan.fileHints).toEqual([]);
    expect(plan.identifierTerms).toEqual([]);
    expect(plan.selection).toEqual([]);
    expect(plan.summary).toEqual({
      candidateCount: 0,
      generatedCandidateCount: 0,
      graphMassCandidateCount: 0,
      graphMassTruncatedCandidateCount: 0,
      selectedCount: 0,
      selectedGeneratedCount: 0,
      selectedFileCount: 0,
      truncated: false
    });
  });

  it("bounds the retained query and discloses when input was truncated", () => {
    const oversizedQuery = `worker ${"x".repeat(EXPLORE_QUERY_LIMITS.maximumQueryCharacters)}`;
    const plan = planExploreQuery(
      {
        symbols: [symbol({ id: "worker", name: "worker", filePath: "src/worker.ts" })],
        edges: []
      },
      oversizedQuery
    );

    expect(plan.query).toHaveLength(EXPLORE_QUERY_LIMITS.maximumQueryCharacters);
    expect(plan.normalizedQuery.length).toBeLessThanOrEqual(
      EXPLORE_QUERY_LIMITS.maximumQueryCharacters
    );
    expect(plan.input).toEqual({
      characters: oversizedQuery.length,
      usedCharacters: EXPLORE_QUERY_LIMITS.maximumQueryCharacters,
      truncated: true
    });
  });
});
