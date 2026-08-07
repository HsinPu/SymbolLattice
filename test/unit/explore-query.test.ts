import { describe, expect, it } from "vitest";

import {
  EXPLORE_QUERY_LIMITS,
  EXPLORE_QUERY_PLAN_POLICY,
  planExploreQuery
} from "../../src/application/explore-query.js";
import {
  GENERATED_FILE_CLASSIFIER_VERSION,
  SOURCE_ROLE_CLASSIFIER_VERSION,
  type GraphEdge,
  type IndexedFile,
  type SourceRole,
  type SymbolNode
} from "../../src/domain/index.js";

function indexedFile(path: string, generated: boolean, role: SourceRole = "production"): IndexedFile {
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
    },
    sourceRole: {
      classifierVersion: SOURCE_ROLE_CLASSIFIER_VERSION,
      role,
      evidence: role === "production"
        ? []
        : role === "test"
        ? [{ kind: "path", ruleId: "test.source-role" }]
        : [{ kind: "path", ruleId: `test.source-role.${role}` }]
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
  it("softly lowers persisted test declarations for general queries and discloses both factors", () => {
    const production = symbol({ id: "production", name: "orderService", filePath: "src/order-service.ts" });
    const test = symbol({ id: "test", name: "orderService", filePath: "test/order-service.test.ts" });

    const plan = planExploreQuery(
      {
        files: [indexedFile(production.filePath, false), indexedFile(test.filePath, false, "test")],
        symbols: [test, production],
        edges: []
      },
      "orderService"
    );

    expect(plan).toMatchObject({
      policy: "explore-query-plan-v10",
      queryIntent: {
        tests: false,
        icons: false,
        localization: false,
        matchedTerms: []
      },
      ranking: {
        testSourceWorth: 0.5,
        testIntentExempt: true,
        sourceRoleClassifierVersion: SOURCE_ROLE_CLASSIFIER_VERSION
      },
      summary: { testCandidateCount: 1, selectedTestCount: 1, testPenaltyCandidateCount: 1 }
    });
    expect(plan.selection.map((item) => item.symbol.id)).toEqual(["production", "test"]);
    expect(plan.selection[1]).toMatchObject({
      score: 510,
      sourceWorth: 1,
      sourceRoleWorth: 0.5,
      rankingScore: 255,
      sourceRole: { role: "test", evidence: [{ ruleId: "test.source-role" }] },
      sourceRoleDecision: "test-source-worth"
    });
  });

  it("treats standalone test intent as intent evidence instead of a lexical symbol term", () => {
    const production = symbol({ id: "production", name: "orderService", filePath: "src/z-order-service.ts" });
    const test = symbol({ id: "test", name: "orderService", filePath: "test/a-order-service.test.ts" });
    const plan = planExploreQuery(
      {
        files: [indexedFile(production.filePath, false), indexedFile(test.filePath, false, "test")],
        symbols: [production, test],
        edges: []
      },
      "verify orderService tests"
    );

    expect(plan.queryIntent).toEqual({
      tests: true,
      icons: false,
      localization: false,
      matchedTerms: ["verify", "tests"]
    });
    expect(plan.identifierTerms).toEqual(["orderservice"]);
    expect(plan.selection.find((item) => item.symbol.id === "test")).toMatchObject({
      symbol: { id: "test" },
      sourceRoleWorth: 1,
      rankingScore: 510,
      sourceRoleDecision: "test-intent-exempt"
    });
  });

  it("exempts an explicitly named test file while preserving its persisted role evidence", () => {
    const test = symbol({ id: "test", name: "orderService", filePath: "test/order-service.test.ts" });
    const plan = planExploreQuery(
      { files: [indexedFile(test.filePath, false, "test")], symbols: [test], edges: [] },
      "show test/order-service.test.ts orderService"
    );

    expect(plan.selection[0]).toMatchObject({
      score: 1_510,
      rankingScore: 1_510,
      sourceRoleWorth: 1,
      sourceRoleDecision: "explicit-test-file-exempt"
    });
  });

  it("composes generated and test worth while test intent exempts only the test factor", () => {
    const generatedTest = symbol({
      id: "generated-test",
      name: "orderService",
      filePath: "test/order-service.generated.test.ts"
    });
    const graph = {
      files: [indexedFile(generatedTest.filePath, true, "test")],
      symbols: [generatedTest],
      edges: []
    };

    expect(planExploreQuery(graph, "orderService").selection[0]).toMatchObject({
      score: 510,
      sourceWorth: 0.3,
      sourceRoleWorth: 0.5,
      rankingScore: 76.5,
      rankingDecision: "generated-source-worth",
      sourceRoleDecision: "test-source-worth"
    });
    expect(planExploreQuery(graph, "test orderService").selection[0]).toMatchObject({
      sourceWorth: 0.3,
      sourceRoleWorth: 1,
      rankingScore: 153,
      rankingDecision: "generated-source-worth",
      sourceRoleDecision: "test-intent-exempt"
    });
  });

  it("filters unrequested test candidates only when two distinct production files are proven", () => {
    const productionA = symbol({ id: "production-a", name: "orderService", filePath: "src/a.ts" });
    const productionB = symbol({ id: "production-b", name: "orderService", filePath: "src/b.ts" });
    const testA = symbol({ id: "test-a", name: "orderService", filePath: "test/a.test.ts" });
    const testB = symbol({ id: "test-b", name: "orderService", filePath: "test/b.test.ts" });
    const graph = {
      files: [
        indexedFile(productionA.filePath, false),
        indexedFile(productionB.filePath, false),
        indexedFile(testA.filePath, false, "test"),
        indexedFile(testB.filePath, false, "test")
      ],
      symbols: [testB, productionB, testA, productionA],
      edges: []
    };

    const plan = planExploreQuery(graph, "orderService");
    const reversed = planExploreQuery({ ...graph, symbols: [...graph.symbols].reverse() }, "orderService");

    expect(reversed).toEqual(plan);
    expect(plan.selection.map((item) => item.symbol.id)).toEqual(["production-a", "production-b"]);
    expect(plan).toMatchObject({
      policy: "explore-query-plan-v10",
      filtering: {
        policy: "explore-query-low-value-filter-v2",
        reason: "sufficient-production-evidence",
        applied: true,
        minimumProductionFileCount: 2,
        maximumExcludedFileReceipts: 16,
        candidateFileCount: 4,
        productionCandidateFileCount: 2,
        testCandidateFileCount: 2,
        retainedCandidateCount: 2,
        retainedFileCount: 2,
        excludedTestCandidateCount: 2,
        excludedTestFileCount: 2,
        excludedFilesTruncated: false,
        excludedFiles: [
          {
            filePath: "test/a.test.ts",
            candidateCount: 1,
            reason: "test-source-filtered",
            sourceRole: {
              classifierVersion: SOURCE_ROLE_CLASSIFIER_VERSION,
              role: "test",
              evidence: [{ kind: "path", ruleId: "test.source-role" }]
            }
          },
          {
            filePath: "test/b.test.ts",
            candidateCount: 1,
            reason: "test-source-filtered"
          }
        ]
      },
      summary: {
        candidateCount: 4,
        filteredCandidateCount: 2,
        selectedCount: 2,
        selectedTestCount: 0,
        truncated: true
      }
    });
  });

  it("selects diffusion seeds only after low-value filtering", () => {
    const productionService = symbol({
      id: "production-service",
      name: "dispatchService",
      filePath: "src/dispatch-service.ts"
    });
    const productionRepository = symbol({
      id: "production-repository",
      name: "dispatchRepository",
      filePath: "src/dispatch-repository.ts"
    });
    const filteredTestSeed = symbol({
      id: "filtered-test-seed",
      name: "dispatch",
      filePath: "test/dispatch.test.ts"
    });

    const plan = planExploreQuery(
      {
        files: [
          indexedFile(productionService.filePath, false),
          indexedFile(productionRepository.filePath, false),
          indexedFile(filteredTestSeed.filePath, false, "test")
        ],
        symbols: [filteredTestSeed, productionRepository, productionService],
        edges: []
      },
      "dispatch"
    );

    expect(plan.filtering).toMatchObject({
      reason: "sufficient-production-evidence",
      excludedTestCandidateCount: 1
    });
    expect(plan.ranking.graphDiffusion).toMatchObject({
      reason: "no-reachable-relationships",
      seedMode: "partial-lexical",
      seedFileCount: 2,
      seedSymbolCount: 2
    });
    expect(plan.selection.map((item) => item.symbol.id)).toEqual([
      "production-repository",
      "production-service"
    ]);
  });

  it("keeps soft-ranked tests when production evidence is confined to one file", () => {
    const productionA = symbol({ id: "production-a", name: "orderService", filePath: "src/orders.ts" });
    const productionB = symbol({ id: "production-b", name: "orderServiceHelper", filePath: "src/orders.ts" });
    const test = symbol({ id: "test", name: "orderService", filePath: "test/orders.test.ts" });
    const plan = planExploreQuery(
      {
        files: [indexedFile(productionA.filePath, false), indexedFile(test.filePath, false, "test")],
        symbols: [test, productionB, productionA],
        edges: []
      },
      "orderService"
    );

    expect(plan.filtering).toMatchObject({
      reason: "insufficient-production-evidence",
      applied: false,
      productionCandidateFileCount: 1,
      excludedTestCandidateCount: 0,
      excludedFiles: []
    });
    expect(plan.selection.map((item) => item.symbol.id)).toContain("test");
  });

  it("does not treat legacy unclassified files as production evidence for filtering", () => {
    const legacyA = symbol({ id: "legacy-a", name: "orderService", filePath: "legacy/a.ts" });
    const legacyB = symbol({ id: "legacy-b", name: "orderService", filePath: "legacy/b.ts" });
    const test = symbol({ id: "test", name: "orderService", filePath: "test/orders.test.ts" });
    const plan = planExploreQuery(
      {
        files: [indexedFile(test.filePath, false, "test")],
        symbols: [test, legacyB, legacyA],
        edges: []
      },
      "orderService"
    );

    expect(plan.filtering).toMatchObject({
      reason: "insufficient-production-evidence",
      applied: false,
      productionCandidateFileCount: 0,
      excludedTestCandidateCount: 0,
      excludedFiles: []
    });
    expect(plan.selection.map((item) => item.symbol.id)).toContain("test");
  });

  it("keeps tests for explicit test intent even when production evidence is sufficient", () => {
    const productionA = symbol({ id: "production-a", name: "orderService", filePath: "src/a.ts" });
    const productionB = symbol({ id: "production-b", name: "orderService", filePath: "src/b.ts" });
    const test = symbol({ id: "test", name: "orderService", filePath: "test/orders.test.ts" });
    const plan = planExploreQuery(
      {
        files: [
          indexedFile(productionA.filePath, false),
          indexedFile(productionB.filePath, false),
          indexedFile(test.filePath, false, "test")
        ],
        symbols: [test, productionB, productionA],
        edges: []
      },
      "which tests verify orderService"
    );

    expect(plan.filtering).toMatchObject({
      reason: "all-low-value-candidates-exempt",
      applied: false,
      productionCandidateFileCount: 2,
      excludedTestCandidateCount: 0,
      excludedFiles: []
    });
    expect(plan.selection.map((item) => item.symbol.id)).toContain("test");
  });

  it("retains an explicitly named test file while filtering other test candidates", () => {
    const productionA = symbol({ id: "production-a", name: "orderService", filePath: "src/a.ts" });
    const productionB = symbol({ id: "production-b", name: "orderService", filePath: "src/b.ts" });
    const explicitTest = symbol({
      id: "explicit-test",
      name: "orderService",
      filePath: "test/explicit-order.test.ts"
    });
    const otherTest = symbol({
      id: "other-test",
      name: "orderService",
      filePath: "test/other-order.test.ts"
    });
    const plan = planExploreQuery(
      {
        files: [
          indexedFile(productionA.filePath, false),
          indexedFile(productionB.filePath, false),
          indexedFile(explicitTest.filePath, false, "test"),
          indexedFile(otherTest.filePath, false, "test")
        ],
        symbols: [otherTest, productionB, explicitTest, productionA],
        edges: []
      },
      "show test/explicit-order.test.ts orderService"
    );

    expect(plan.selection.map((item) => item.symbol.id)).toEqual([
      "explicit-test",
      "production-a",
      "production-b"
    ]);
    expect(plan.filtering).toMatchObject({
      reason: "sufficient-production-evidence",
      applied: true,
      excludedTestCandidateCount: 1,
      excludedTestFileCount: 1,
      excludedFiles: [{ filePath: "test/other-order.test.ts" }]
    });
    expect(plan.selection[0]).toMatchObject({
      sourceRoleDecision: "explicit-test-file-exempt",
      sourceRoleWorth: 1
    });
  });

  it("filters unrequested icon and localization candidates with persisted role receipts", () => {
    const productionA = symbol({ id: "production-a", name: "renderAsset", filePath: "src/a.ts" });
    const productionB = symbol({ id: "production-b", name: "renderAsset", filePath: "src/b.ts" });
    const icon = symbol({ id: "icon", name: "renderAsset", filePath: "src/icons/render-asset.ts" });
    const localization = symbol({
      id: "localization",
      name: "renderAsset",
      filePath: "src/i18n/render-asset.ts"
    });
    const plan = planExploreQuery(
      {
        files: [
          indexedFile(productionA.filePath, false),
          indexedFile(productionB.filePath, false),
          indexedFile(icon.filePath, false, "icon"),
          indexedFile(localization.filePath, false, "localization")
        ],
        symbols: [localization, productionB, icon, productionA],
        edges: []
      },
      "renderAsset"
    );

    expect(plan.selection.map((item) => item.symbol.id)).toEqual(["production-a", "production-b"]);
    expect(plan).toMatchObject({
      policy: "explore-query-plan-v10",
      filtering: {
        policy: "explore-query-low-value-filter-v2",
        reason: "sufficient-production-evidence",
        applied: true,
        productionCandidateFileCount: 2,
        lowValueCandidateFileCount: 2,
        iconCandidateFileCount: 1,
        localizationCandidateFileCount: 1,
        excludedLowValueCandidateCount: 2,
        excludedIconCandidateCount: 1,
        excludedLocalizationCandidateCount: 1,
        excludedFiles: [
          {
            filePath: "src/i18n/render-asset.ts",
            reason: "localization-source-filtered",
            sourceRole: { role: "localization" }
          },
          {
            filePath: "src/icons/render-asset.ts",
            reason: "icon-source-filtered",
            sourceRole: { role: "icon" }
          }
        ]
      },
      summary: {
        lowValueCandidateCount: 2,
        iconCandidateCount: 1,
        localizationCandidateCount: 1,
        filteredCandidateCount: 2,
        selectedLowValueCount: 0
      }
    });
  });

  it("exempts only the low-value role named by query intent", () => {
    const productionA = symbol({ id: "production-a", name: "renderAsset", filePath: "src/a.ts" });
    const productionB = symbol({ id: "production-b", name: "renderAsset", filePath: "src/b.ts" });
    const icon = symbol({ id: "icon", name: "renderAsset", filePath: "src/icons/render-asset.ts" });
    const localization = symbol({
      id: "localization",
      name: "renderAsset",
      filePath: "src/i18n/render-asset.ts"
    });
    const plan = planExploreQuery(
      {
        files: [
          indexedFile(productionA.filePath, false),
          indexedFile(productionB.filePath, false),
          indexedFile(icon.filePath, false, "icon"),
          indexedFile(localization.filePath, false, "localization")
        ],
        symbols: [localization, icon, productionB, productionA],
        edges: []
      },
      "which icons renderAsset"
    );

    expect(plan.queryIntent).toEqual({
      tests: false,
      icons: true,
      localization: false,
      matchedTerms: ["icons"]
    });
    expect(plan.selection.find((item) => item.symbol.id === "icon")).toMatchObject({
      sourceRoleWorth: 1,
      sourceRoleDecision: "icon-intent-exempt"
    });
    expect(plan.selection.map((item) => item.symbol.id)).not.toContain("localization");
    expect(plan.filtering).toMatchObject({
      reason: "sufficient-production-evidence",
      applied: true,
      excludedLowValueCandidateCount: 1,
      excludedLocalizationCandidateCount: 1,
      excludedIconCandidateCount: 0
    });
  });

  it("exempts localization intent without retaining unrelated icon candidates", () => {
    const productionA = symbol({ id: "production-a", name: "renderAsset", filePath: "src/a.ts" });
    const productionB = symbol({ id: "production-b", name: "renderAsset", filePath: "src/b.ts" });
    const icon = symbol({ id: "icon", name: "renderAsset", filePath: "src/icons/render-asset.ts" });
    const localization = symbol({
      id: "localization",
      name: "renderAsset",
      filePath: "src/i18n/render-asset.ts"
    });
    const plan = planExploreQuery(
      {
        files: [
          indexedFile(productionA.filePath, false),
          indexedFile(productionB.filePath, false),
          indexedFile(icon.filePath, false, "icon"),
          indexedFile(localization.filePath, false, "localization")
        ],
        symbols: [icon, localization, productionB, productionA],
        edges: []
      },
      "which i18n renderAsset"
    );

    expect(plan.queryIntent).toEqual({
      tests: false,
      icons: false,
      localization: true,
      matchedTerms: ["i18n"]
    });
    expect(plan.selection.find((item) => item.symbol.id === "localization")).toMatchObject({
      sourceRoleWorth: 1,
      sourceRoleDecision: "localization-intent-exempt"
    });
    expect(plan.selection.map((item) => item.symbol.id)).not.toContain("icon");
    expect(plan.filtering).toMatchObject({
      reason: "sufficient-production-evidence",
      applied: true,
      excludedLowValueCandidateCount: 1,
      excludedLocalizationCandidateCount: 0,
      excludedIconCandidateCount: 1
    });
  });

  it("retains an explicitly named localization file while filtering another auxiliary source", () => {
    const productionA = symbol({ id: "production-a", name: "renderAsset", filePath: "src/a.ts" });
    const productionB = symbol({ id: "production-b", name: "renderAsset", filePath: "src/b.ts" });
    const icon = symbol({ id: "icon", name: "renderAsset", filePath: "src/icons/render-asset.ts" });
    const localization = symbol({
      id: "localization",
      name: "renderAsset",
      filePath: "src/i18n/render-asset.ts"
    });
    const plan = planExploreQuery(
      {
        files: [
          indexedFile(productionA.filePath, false),
          indexedFile(productionB.filePath, false),
          indexedFile(icon.filePath, false, "icon"),
          indexedFile(localization.filePath, false, "localization")
        ],
        symbols: [icon, localization, productionB, productionA],
        edges: []
      },
      "show src/i18n/render-asset.ts renderAsset"
    );

    expect(plan.selection[0]).toMatchObject({
      symbol: { id: "localization" },
      sourceRoleWorth: 1,
      sourceRoleDecision: "explicit-localization-file-exempt"
    });
    expect(plan.selection.map((item) => item.symbol.id)).not.toContain("icon");
  });

  it("removes weak file-name collisions below a bounded relative file-score floor", () => {
    const exact = symbol({ id: "exact", name: "dispatch", filePath: "src/dispatch.ts" });
    const partialA = symbol({
      id: "partial-a",
      name: "dispatchPipeline",
      filePath: "src/dispatch-pipeline.ts"
    });
    const partialB = symbol({
      id: "partial-b",
      name: "dispatchRegistry",
      filePath: "src/dispatch-registry.ts"
    });
    const weakA = symbol({ id: "weak-a", name: "worker", filePath: "src/dispatch-noise-a.ts" });
    const weakB = symbol({ id: "weak-b", name: "helper", filePath: "src/dispatch-noise-b.ts" });
    const plan = planExploreQuery(
      { symbols: [weakB, partialB, exact, weakA, partialA], edges: [] },
      "dispatch"
    );

    expect(plan.selection.map((item) => item.symbol.id)).toEqual([
      "exact",
      "partial-a",
      "partial-b"
    ]);
    expect(plan.scoreFloor).toEqual({
      policy: "explore-query-relative-file-score-floor-v1",
      reason: "relative-floor-applied",
      applied: true,
      absoluteFloor: 80,
      fractionOfTop: 0.2,
      maximumFloor: 120,
      backfillTargetFileCount: 3,
      maximumFileReceipts: 16,
      fileScoreAggregation: "maximum-candidate-score",
      backfillEvidenceFloor: 80,
      topFileScore: 510,
      computedFloor: 102,
      candidateFileCount: 5,
      filesPastFloorCount: 3,
      retainedFileCount: 3,
      backfilledFileCount: 0,
      excludedFileCount: 2,
      backfilledFilesTruncated: false,
      backfilledFiles: [],
      excludedFilesTruncated: false,
      excludedFiles: [
        {
          filePath: "src/dispatch-noise-a.ts",
          candidateCount: 1,
          fileScore: 90,
          bestCandidateId: "weak-a",
          bestCandidateScore: 90,
          reason: "below-relative-floor"
        },
        {
          filePath: "src/dispatch-noise-b.ts",
          candidateCount: 1,
          fileScore: 90,
          bestCandidateId: "weak-b",
          bestCandidateScore: 90,
          reason: "below-relative-floor"
        }
      ]
    });
    expect(plan.summary).toMatchObject({
      scoreFloorFilteredCandidateCount: 2,
      scoreFloorFilteredFileCount: 2
    });
  });

  it("keeps a diffuse file-name-only result spread at the absolute floor", () => {
    const symbols = [
      symbol({ id: "a", name: "worker", filePath: "src/dispatch-a.ts" }),
      symbol({ id: "b", name: "helper", filePath: "src/dispatch-b.ts" }),
      symbol({ id: "c", name: "factory", filePath: "src/dispatch-c.ts" }),
      symbol({ id: "d", name: "adapter", filePath: "src/dispatch-d.ts" })
    ];
    const plan = planExploreQuery({ symbols: symbols.reverse(), edges: [] }, "dispatch");

    expect(plan.scoreFloor).toMatchObject({
      reason: "all-files-past-floor",
      applied: false,
      topFileScore: 90,
      computedFloor: 80,
      candidateFileCount: 4,
      retainedFileCount: 4,
      backfilledFileCount: 0,
      excludedFileCount: 0
    });
    expect(plan.selection.map((item) => item.symbol.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("backfills a thin result to three files without admitting every collision", () => {
    const plan = planExploreQuery(
      {
        symbols: [
          symbol({ id: "weak-b", name: "worker", filePath: "src/dispatch-noise-b.ts" }),
          symbol({ id: "partial", name: "dispatchPipeline", filePath: "src/dispatch-pipeline.ts" }),
          symbol({ id: "weak-a", name: "helper", filePath: "src/dispatch-noise-a.ts" }),
          symbol({ id: "exact", name: "dispatch", filePath: "src/dispatch.ts" })
        ],
        edges: []
      },
      "dispatch"
    );

    expect(plan.scoreFloor).toMatchObject({
      reason: "minimum-backfill-applied",
      applied: true,
      filesPastFloorCount: 2,
      retainedFileCount: 3,
      backfilledFileCount: 1,
      excludedFileCount: 1,
      backfilledFiles: [
        {
          filePath: "src/dispatch-noise-a.ts",
          fileScore: 90,
          bestCandidateId: "weak-a",
          reason: "minimum-retained-files"
        }
      ],
      excludedFiles: [{ filePath: "src/dispatch-noise-b.ts" }]
    });
    expect(plan.selection.map((item) => item.symbol.id)).toEqual(["exact", "partial", "weak-a"]);
  });

  it("caps the relative floor so explicit evidence cannot suppress partial symbol matches", () => {
    const plan = planExploreQuery(
      {
        symbols: [
          symbol({ id: "weak", name: "worker", filePath: "src/dispatch-noise.ts" }),
          symbol({ id: "partial-b", name: "dispatchRegistry", filePath: "src/registry.ts" }),
          symbol({ id: "god", name: "dispatch", filePath: "src/god.ts" }),
          symbol({ id: "partial-a", name: "dispatchPipeline", filePath: "src/pipeline.ts" })
        ],
        edges: []
      },
      "show src/god.ts dispatch"
    );

    expect(plan.scoreFloor).toMatchObject({
      topFileScore: 1510,
      computedFloor: 120,
      filesPastFloorCount: 3,
      retainedFileCount: 3,
      excludedFileCount: 1
    });
    expect(plan.selection.map((item) => item.symbol.id)).toEqual([
      "god",
      "partial-a",
      "partial-b"
    ]);
  });

  it("uses the strongest candidate per file instead of inflating score by symbol count", () => {
    const weak = Array.from({ length: 6 }, (_value, index) =>
      symbol({
        id: `weak-${index}`,
        name: `worker${index}`,
        filePath: "src/dispatch-noise.ts",
        line: index * 4 + 1
      })
    );
    const plan = planExploreQuery(
      {
        symbols: [
          ...weak,
          symbol({ id: "partial-b", name: "dispatchRegistry", filePath: "src/registry.ts" }),
          symbol({ id: "exact", name: "dispatch", filePath: "src/dispatch.ts" }),
          symbol({ id: "partial-a", name: "dispatchPipeline", filePath: "src/pipeline.ts" })
        ],
        edges: []
      },
      "dispatch"
    );

    expect(plan.scoreFloor.excludedFiles).toEqual([
      expect.objectContaining({
        filePath: "src/dispatch-noise.ts",
        candidateCount: 6,
        fileScore: 90,
        bestCandidateScore: 90
      })
    ]);
    expect(plan.summary).toMatchObject({
      scoreFloorFilteredCandidateCount: 6,
      scoreFloorFilteredFileCount: 1
    });
  });

  it("fail-opens to positive evidence when no generated file clears the absolute floor", () => {
    const files = ["a", "b", "c"].map((name) =>
      indexedFile(`src/dispatch-${name}.generated.ts`, true)
    );
    const symbols = files.map((file, index) =>
      symbol({ id: `weak-${index}`, name: `worker${index}`, filePath: file.path })
    );
    const plan = planExploreQuery({ files, symbols, edges: [] }, "dispatch");

    expect(plan.scoreFloor).toMatchObject({
      reason: "minimum-backfill-applied",
      applied: false,
      fileScoreAggregation: "maximum-candidate-score",
      topFileScore: 27,
      computedFloor: 80,
      filesPastFloorCount: 0,
      backfillEvidenceFloor: 0,
      retainedFileCount: 3,
      backfilledFileCount: 3,
      excludedFileCount: 0
    });
    expect(plan.selection).toHaveLength(3);
  });

  it("bounds combined role-intent receipts across test, icon, and localization terms", () => {
    const plan = planExploreQuery(
      {
        symbols: [symbol({ id: "worker", name: "worker", filePath: "src/worker.ts" })],
        edges: []
      },
      "test tests testing verification verify verifies spec specs icon icons i18n locale locales localization localize translation translations worker"
    );

    expect(plan.queryIntent).toMatchObject({
      tests: true,
      icons: true,
      localization: true
    });
    expect(plan.queryIntent.matchedTerms).toEqual([
      "test",
      "tests",
      "testing",
      "verification",
      "verify",
      "verifies",
      "spec",
      "specs"
    ]);
    expect(plan.identifierTerms).toEqual(["worker"]);
  });

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
      policy: "explore-query-plan-v10",
      ranking: {
        graphMass: {
          policy: "explore-query-graph-mass-v2",
          maximumRelationships: 32,
          maximumScore: 120,
          relationWeights: { calls: 12, contains: 0 }
        }
      },
      summary: {
        graphMassCandidateCount: 2,
        graphMassTruncatedCandidateCount: 0
      }
    });
    expect(plan.selection.map((item) => item.symbol.id)).toEqual([
      "connected",
      "isolated",
      "helper"
    ]);
    expect(plan.selection[0]).toMatchObject({
      score: 702,
      rankingScore: 702,
      reasons: expect.arrayContaining(["graph-mass"]),
      graphMass: {
        policy: "explore-query-graph-mass-v2",
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
      score: 562.5,
      graphMass: {
        exactRelationshipCount: 0,
        score: 0,
        rankingContribution: 0,
        relationCounts: {}
      }
    });
  });

  it("uses exact multi-hop diffusion to rank a seed-connected candidate above an equal dead end", () => {
    const seed = symbol({
      id: "seed",
      name: "dispatch",
      filePath: "src/dispatch.ts"
    });
    const connected = symbol({
      id: "connected",
      name: "dispatchPipeline",
      filePath: "src/z-connected.ts"
    });
    const deadEnd = symbol({
      id: "dead-end",
      name: "dispatchLegacy",
      filePath: "src/a-dead-end.ts"
    });
    const bridge = symbol({ id: "bridge", name: "runPipeline", filePath: "src/bridge.ts" });
    const deadEndNeighbor = symbol({
      id: "dead-end-neighbor",
      name: "legacyHelper",
      filePath: "src/legacy-helper.ts"
    });

    const graph = {
      files: [seed, connected, deadEnd, bridge, deadEndNeighbor].map((item) =>
        indexedFile(item.filePath, false)
      ),
      symbols: [deadEnd, deadEndNeighbor, bridge, connected, seed],
      edges: [
        edge("seed-bridge", seed.id, bridge.id),
        edge("bridge-connected", bridge.id, connected.id),
        edge("dead-end-neighbor", deadEnd.id, deadEndNeighbor.id)
      ]
    };
    const plan = planExploreQuery(graph, "dispatch");
    const reversed = planExploreQuery(
      { ...graph, symbols: [...graph.symbols].reverse(), edges: [...graph.edges].reverse() },
      "dispatch"
    );

    expect(reversed).toEqual(plan);
    expect(plan.ranking.graphDiffusion).toMatchObject({
      policy: "explore-query-graph-diffusion-v2",
      reason: "completed",
      applied: true,
      seedMode: "strong-lexical",
      seedFileWeighting: "uniform-per-file",
      restartProbability: 0.25,
      maximumHops: 4,
      maximumIterations: 96,
      seedFileCount: 1,
      seedSymbolCount: 1,
      subgraphNodeCount: 3,
      subgraphRelationshipCount: 2,
      converged: true
    });
    expect(plan.selection.map((item) => item.symbol.id)).toEqual([
      "seed",
      "bridge",
      "connected",
      "dead-end"
    ]);
    expect(plan.selection[1]).toMatchObject({
      reasons: expect.arrayContaining(["graph-diffusion"]),
      graphDiffusion: {
        policy: "explore-query-graph-diffusion-v2",
        state: "reached",
        seed: false,
        seedWeight: 0,
        score: expect.any(Number),
        rankingContribution: expect.any(Number)
      }
    });
    expect(plan.selection[1]!.graphDiffusion.fileMass).toBeGreaterThan(0);
    expect(plan.selection[1]!.graphDiffusion.score).toBeGreaterThan(0);
    expect(plan.selection[2]!.graphDiffusion).toMatchObject({
      state: "reached",
      seed: false,
      fileMass: expect.any(Number),
      score: expect.any(Number)
    });
    expect(plan.selection[3]!.graphDiffusion).toMatchObject({
      state: "outside-subgraph",
      fileMass: 0,
      score: 0,
      rankingContribution: 0
    });
  });

  it("adds a non-lexical file through bounded exact graph expansion with a verifiable path", () => {
    const seed = symbol({
      id: "dispatch",
      name: "dispatch",
      filePath: "src/dispatch.ts"
    });
    const connected = symbol({
      id: "persist-record",
      name: "persistRecord",
      filePath: "src/storage.ts"
    });

    const plan = planExploreQuery(
      {
        files: [seed, connected].map((item) => indexedFile(item.filePath, false)),
        symbols: [connected, seed],
        edges: [edge("dispatch-persists", seed.id, connected.id)]
      },
      "dispatch behavior"
    );

    expect(plan.ranking.graphExpansion).toMatchObject({
      policy: "explore-query-graph-expansion-v2",
      reason: "completed",
      applied: true,
      maximumHops: 2,
      minimumRelationWeight: 8,
      seedFileCount: 1,
      seedSymbolCount: 1,
      discoveredSymbolCount: 1,
      admittedSymbolCount: 1,
      admittedFileCount: 1
    });
    expect(plan.selection.map((item) => item.symbol.id)).toEqual([
      "dispatch",
      "persist-record"
    ]);
    expect(plan.selection[1]).toMatchObject({
      matchedTerms: [],
      reasons: expect.arrayContaining(["graph-expanded"]),
      graphExpansion: {
        policy: "explore-query-graph-expansion-v2",
        state: "expanded",
        seedSymbolId: "dispatch",
        seedFilePath: "src/dispatch.ts",
        hops: 1,
        score: expect.any(Number),
        rankingContribution: expect.any(Number),
        path: [
          {
            edgeId: "dispatch-persists",
            kind: "calls",
            sourceId: "dispatch",
            targetId: "persist-record",
            direction: "forward"
          }
        ]
      }
    });
    expect(plan.selection[1]!.graphExpansion.score).toBeGreaterThanOrEqual(80);
  });

  it("spends the expansion relationship budget on seed-reachable evidence before unrelated edges", () => {
    const seed = symbol({ id: "z-seed", name: "dispatch", filePath: "src/dispatch.ts" });
    const connected = symbol({
      id: "z-connected",
      name: "persistRecord",
      filePath: "src/storage.ts"
    });
    const unrelatedPairs = Array.from({ length: 4_096 }, (_, index) => ({
      source: symbol({
        id: `a-source-${index.toString().padStart(4, "0")}`,
        name: `source${index}`,
        filePath: `src/unrelated/source-${index}.ts`
      }),
      target: symbol({
        id: `a-target-${index.toString().padStart(4, "0")}`,
        name: `target${index}`,
        filePath: `src/unrelated/target-${index}.ts`
      })
    }));
    const plan = planExploreQuery(
      {
        files: [indexedFile(seed.filePath, false), indexedFile(connected.filePath, false)],
        symbols: [
          ...unrelatedPairs.flatMap((pair) => [pair.source, pair.target]),
          connected,
          seed
        ],
        edges: [
          ...unrelatedPairs.map((pair, index) =>
            edge(`a-unrelated-${index.toString().padStart(4, "0")}`, pair.source.id, pair.target.id)
          ),
          edge("z-seed-connected", seed.id, connected.id)
        ]
      },
      "dispatch behavior"
    );

    expect(plan.selection.some((item) => item.symbol.id === connected.id)).toBe(true);
    expect(plan.ranking.graphExpansion).toMatchObject({
      applied: true,
      visitedRelationshipCount: 1,
      relationshipLimitReached: false,
      admittedSymbolCount: 1
    });
  });

  it("requires high-value exact relationships and rejects heuristic or weak expansion evidence", () => {
    const seed = symbol({ id: "seed", name: "dispatch", filePath: "src/dispatch.ts" });
    const weak = symbol({ id: "weak", name: "weakHelper", filePath: "src/weak.ts" });
    const heuristic = symbol({
      id: "heuristic",
      name: "heuristicHelper",
      filePath: "src/heuristic.ts"
    });
    const plan = planExploreQuery(
      {
        files: [seed, weak, heuristic].map((item) => indexedFile(item.filePath, false)),
        symbols: [seed, weak, heuristic],
        edges: [
          { ...edge("weak-reference", seed.id, weak.id), kind: "references" },
          {
            ...edge("heuristic-call", seed.id, heuristic.id),
            resolution: "heuristic",
            confidence: 0.7
          }
        ]
      },
      "dispatch behavior"
    );

    expect(plan.selection.map((item) => item.symbol.id)).toEqual(["seed"]);
    expect(plan.ranking.graphExpansion).toMatchObject({
      reason: "no-reachable-candidates",
      applied: false,
      minimumRelationWeight: 8,
      visitedRelationshipCount: 0,
      discoveredSymbolCount: 0,
      admittedSymbolCount: 0
    });
  });

  it("rescues non-lexical callable signature types through exact accepts and returns evidence", () => {
    const seed = symbol({ id: "execute", name: "execute", filePath: "src/service.ts" });
    const input = symbol({
      id: "request-input",
      name: "RequestInput",
      kind: "interface",
      filePath: "src/contracts.ts"
    });
    const result = symbol({
      id: "result",
      name: "Result",
      kind: "type",
      filePath: "src/result.ts"
    });
    const plan = planExploreQuery(
      {
        files: [seed, input, result].map((item) => indexedFile(item.filePath, false)),
        symbols: [seed, input, result],
        edges: [
          { ...edge("execute-accepts-input", seed.id, input.id), kind: "accepts" },
          { ...edge("execute-returns-result", seed.id, result.id), kind: "returns" }
        ]
      },
      "execute behavior"
    );

    expect(plan.selection.map((item) => item.symbol.id)).toEqual(
      expect.arrayContaining(["execute", "request-input", "result"])
    );
    expect(
      plan.ranking.graphExpansion.candidates
        .filter((candidate) => candidate.admitted)
        .map((candidate) => candidate.path[0]?.kind)
        .sort()
    ).toEqual(["accepts", "returns"]);
  });

  it("does not use an unrequested low-value lexical match as an expansion seed", () => {
    const productionSeed = symbol({
      id: "production-seed",
      name: "dispatch",
      filePath: "src/z-dispatch.ts"
    });
    const testSeed = symbol({
      id: "test-seed",
      name: "dispatch",
      filePath: "test/a-dispatch.test.ts"
    });
    const connected = symbol({
      id: "test-connected",
      name: "fixtureOnlyHelper",
      filePath: "src/connected.ts"
    });
    const plan = planExploreQuery(
      {
        files: [
          indexedFile(productionSeed.filePath, false),
          indexedFile(testSeed.filePath, false, "test"),
          indexedFile(connected.filePath, false)
        ],
        symbols: [testSeed, productionSeed, connected],
        edges: [edge("test-only-path", testSeed.id, connected.id)]
      },
      "dispatch behavior"
    );

    expect(plan.selection.some((item) => item.symbol.id === connected.id)).toBe(false);
    expect(plan.ranking.graphExpansion).toMatchObject({
      seedFileCount: 1,
      seedSymbolCount: 1,
      reason: "no-reachable-candidates",
      applied: false
    });
  });

  it("keeps expansion paths deterministic, bounded to two hops, and reports corroboration", () => {
    const firstSeed = symbol({ id: "first-seed", name: "dispatch", filePath: "src/a.ts" });
    const secondSeed = symbol({ id: "second-seed", name: "dispatch", filePath: "src/b.ts" });
    const bridge = symbol({ id: "bridge", name: "routeRequest", filePath: "src/bridge.ts" });
    const reached = symbol({ id: "reached", name: "persistRecord", filePath: "src/storage.ts" });
    const tooFar = symbol({ id: "too-far", name: "flushDisk", filePath: "src/disk.ts" });
    const graph = {
      files: [firstSeed, secondSeed, bridge, reached, tooFar].map((item) =>
        indexedFile(item.filePath, false)
      ),
      symbols: [tooFar, reached, bridge, secondSeed, firstSeed],
      edges: [
        edge("first-bridge", firstSeed.id, bridge.id),
        edge("second-bridge", secondSeed.id, bridge.id),
        edge("bridge-reached", bridge.id, reached.id),
        edge("reached-too-far", reached.id, tooFar.id)
      ]
    };
    const plan = planExploreQuery(graph, "dispatch behavior");
    const reversed = planExploreQuery(
      { ...graph, symbols: [...graph.symbols].reverse(), edges: [...graph.edges].reverse() },
      "dispatch behavior"
    );

    expect(reversed).toEqual(plan);
    const receipt = plan.ranking.graphExpansion.candidates.find(
      (candidate) => candidate.symbolId === reached.id
    );
    expect(receipt).toMatchObject({
      admitted: true,
      hops: 2,
      corroboratingSeedFileCount: 2,
      score: 120
    });
    expect(plan.ranking.graphExpansion.candidates.some(
      (candidate) => candidate.symbolId === tooFar.id
    )).toBe(false);
  });

  it("retains admitted expansion receipts when rejected discoveries exceed the receipt cap", () => {
    const seed = symbol({ id: "seed", name: "dispatch", filePath: "src/a.ts" });
    const existing = Array.from({ length: 17 }, (_, index) =>
      symbol({
        id: `existing-${index.toString().padStart(2, "0")}`,
        name: `dispatchExisting${index}`,
        filePath: "src/a.ts",
        line: index + 10
      })
    );
    const admitted = symbol({ id: "admitted", name: "persistRecord", filePath: "src/z.ts" });
    const plan = planExploreQuery(
      {
        files: [indexedFile(seed.filePath, false), indexedFile(admitted.filePath, false)],
        symbols: [seed, ...existing, admitted],
        edges: [
          ...existing.map((item, index) => edge(`existing-edge-${index}`, seed.id, item.id)),
          edge("admitted-edge", seed.id, admitted.id)
        ]
      },
      "dispatch"
    );

    expect(plan.selection.some((item) => item.symbol.id === admitted.id)).toBe(true);
    expect(plan.ranking.graphExpansion.candidatesTruncated).toBe(true);
    expect(plan.ranking.graphExpansion.candidates).toContainEqual(
      expect.objectContaining({ symbolId: admitted.id, admitted: true, reason: "admitted" })
    );
  });

  it("caps graph-expanded files and reports every rejected overflow candidate", () => {
    const seed = symbol({ id: "seed", name: "dispatch", filePath: "src/dispatch.ts" });
    const targets = Array.from({ length: 10 }, (_, index) =>
      symbol({
        id: `target-${index}`,
        name: `helper${index}`,
        filePath: `src/helpers/${index}.ts`
      })
    );
    const plan = planExploreQuery(
      {
        files: [seed, ...targets].map((item) => indexedFile(item.filePath, false)),
        symbols: [seed, ...targets],
        edges: targets.map((item, index) => edge(`target-edge-${index}`, seed.id, item.id))
      },
      "dispatch"
    );

    expect(plan.ranking.graphExpansion).toMatchObject({
      admittedSymbolCount: 8,
      admittedFileCount: 8,
      expandedFileLimitReached: true,
      expandedSymbolLimitReached: false,
      candidatesTruncated: false
    });
    expect(plan.ranking.graphExpansion.candidates.filter((item) => item.admitted)).toHaveLength(8);
    expect(
      plan.ranking.graphExpansion.candidates.filter(
        (item) => item.reason === "expanded-file-limit"
      )
    ).toHaveLength(2);
  });

  it("balances diffusion restart mass by seed file instead of matched symbol count", () => {
    const first = symbol({ id: "first", name: "dispatch", filePath: "src/many.ts", line: 1 });
    const second = symbol({ id: "second", name: "dispatch", filePath: "src/many.ts", line: 10 });
    const single = symbol({ id: "single", name: "dispatch", filePath: "src/single.ts" });
    const firstHelper = symbol({ id: "first-helper", name: "firstHelper", filePath: "src/a.ts" });
    const secondHelper = symbol({ id: "second-helper", name: "secondHelper", filePath: "src/b.ts" });
    const singleHelper = symbol({ id: "single-helper", name: "singleHelper", filePath: "src/c.ts" });

    const plan = planExploreQuery(
      {
        files: [first, single, firstHelper, secondHelper, singleHelper].map((item) =>
          indexedFile(item.filePath, false)
        ),
        symbols: [first, second, single, firstHelper, secondHelper, singleHelper],
        edges: [
          edge("first-helper", first.id, firstHelper.id),
          edge("second-helper", second.id, secondHelper.id),
          edge("single-helper", single.id, singleHelper.id)
        ]
      },
      "dispatch"
    );

    expect(plan.ranking.graphDiffusion).toMatchObject({
      seedFileWeighting: "uniform-per-file",
      seedFileCount: 2,
      seedSymbolCount: 3,
      normalizedSeedWeight: 1
    });
    const byId = new Map(plan.selection.map((item) => [item.symbol.id, item]));
    expect(byId.get("first")?.graphDiffusion.seedWeight).toBe(0.25);
    expect(byId.get("second")?.graphDiffusion.seedWeight).toBe(0.25);
    expect(byId.get("single")?.graphDiffusion.seedWeight).toBe(0.5);
    expect(byId.get("first")?.graphDiffusion.fileMass).toBe(
      byId.get("second")?.graphDiffusion.fileMass
    );
  });

  it("bounds the diffusion subgraph and reports when the node limit is reached", () => {
    const seed = symbol({ id: "seed", name: "dispatch", filePath: "src/dispatch.ts" });
    const helpers = Array.from({ length: 4_100 }, (_, index) => symbol({
      id: `helper-${index}`,
      name: `helper${index}`,
      filePath: `src/helpers/helper-${index}.ts`
    }));

    const plan = planExploreQuery(
      {
        files: [indexedFile(seed.filePath, false)],
        symbols: [seed, ...helpers],
        edges: helpers.map((helper, index) => edge(`edge-${index}`, seed.id, helper.id))
      },
      "dispatch"
    );

    expect(plan.ranking.graphDiffusion).toMatchObject({
      reason: "completed",
      applied: true,
      maximumNodes: 4_096,
      maximumRelationships: 16_384,
      subgraphNodeCount: 4_096,
      subgraphRelationshipCount: 4_095,
      nodeLimitReached: true,
      relationshipLimitReached: false,
      candidateWithMassCount: 9
    });
    expect(plan.selection[0]?.graphDiffusion).toMatchObject({
      state: "seed",
      normalizedFileMass: 1,
      score: 120,
      rankingContribution: 120
    });
  });

  it("reports when exact graph evidence continues beyond the diffusion hop boundary", () => {
    const nodes = [
      symbol({ id: "seed", name: "dispatch", filePath: "src/seed.ts" }),
      ...Array.from({ length: 5 }, (_, index) => symbol({
        id: `hop-${index + 1}`,
        name: `hop${index + 1}`,
        filePath: `src/hop-${index + 1}.ts`
      }))
    ];
    const edges = nodes.slice(1).map((node, index) =>
      edge(`hop-edge-${index}`, nodes[index]!.id, node.id)
    );

    const plan = planExploreQuery(
      { symbols: nodes, edges },
      "dispatch"
    );

    expect(plan.ranking.graphDiffusion).toMatchObject({
      maximumHops: 4,
      subgraphNodeCount: 5,
      subgraphRelationshipCount: 4,
      hopLimitReached: true,
      nodeLimitReached: false,
      relationshipLimitReached: false
    });
  });

  it("caps dense exact diffusion relationships without admitting disconnected nodes", () => {
    const nodes = [
      symbol({ id: "seed", name: "dispatch", filePath: "src/seed.ts" }),
      ...Array.from({ length: 64 }, (_, index) => symbol({
        id: `dense-${index}`,
        name: `dense${index}`,
        filePath: `src/dense-${index}.ts`
      }))
    ];
    const kinds: readonly GraphEdge["kind"][] = [
      "imports",
      "exports",
      "references",
      "calls",
      "instantiates",
      "overrides",
      "extends",
      "implements"
    ];
    const edges: GraphEdge[] = [];
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        for (const kind of kinds) {
          edges.push({
            ...edge(`${kind}-${left}-${right}`, nodes[left]!.id, nodes[right]!.id),
            kind
          });
        }
      }
    }

    const plan = planExploreQuery({ symbols: nodes, edges }, "dispatch");

    expect(plan.ranking.graphDiffusion).toMatchObject({
      maximumRelationships: 16_384,
      subgraphNodeCount: 65,
      subgraphRelationshipCount: 16_384,
      nodeLimitReached: false,
      relationshipLimitReached: true
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
      graphMassCandidateCount: 9,
      graphMassTruncatedCandidateCount: 1
    });
    expect(plan.selection[0]).toMatchObject({
      score: 1350,
      rankingScore: 405,
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
      policy: "explore-query-plan-v10",
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
      reasons: [
        "explicit-file",
        "exact-symbol-term",
        "graph-connected",
        "graph-mass",
        "graph-diffusion"
      ]
    });
    expect(plan.selection[1]).toMatchObject({
      rank: 2,
      reasons: ["explicit-file", "graph-diffusion"]
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
      lexicalCandidateCount: 0,
      expandedCandidateCount: 0,
      expandedCandidateFileCount: 0,
      generatedCandidateCount: 0,
      lowValueCandidateCount: 0,
      lowValuePenaltyCandidateCount: 0,
      graphMassCandidateCount: 0,
      graphMassTruncatedCandidateCount: 0,
      graphDiffusionCandidateCount: 0,
      graphDiffusionReachedCandidateCount: 0,
      selectedCount: 0,
      selectedGeneratedCount: 0,
      selectedLowValueCount: 0,
      testCandidateCount: 0,
      testPenaltyCandidateCount: 0,
      iconCandidateCount: 0,
      localizationCandidateCount: 0,
      filteredCandidateCount: 0,
      scoreFloorFilteredCandidateCount: 0,
      scoreFloorFilteredFileCount: 0,
      selectedTestCount: 0,
      selectedIconCount: 0,
      selectedLocalizationCount: 0,
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
