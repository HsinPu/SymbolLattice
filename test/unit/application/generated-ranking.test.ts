import { describe, expect, it } from "vitest";

import {
  GENERATED_SOFT_RANK_POLICY,
  rankGeneratedValues
} from "../../../src/application/index.js";
import {
  GENERATED_FILE_CLASSIFIER_VERSION,
  type IndexedFile
} from "../../../src/domain/index.js";

function indexedFile(path: string, generated: boolean): IndexedFile {
  return {
    path,
    contentHash: `hash:${path}`,
    language: "typescript",
    indexedAt: "2026-08-05T00:00:00.000Z",
    generated: {
      classifierVersion: GENERATED_FILE_CLASSIFIER_VERSION,
      generated,
      evidence: generated
        ? [{ kind: "path", ruleId: "test.generated", range: null }]
        : []
    }
  };
}

describe("generated soft ranking", () => {
  it("moves generated candidates after handwritten candidates and preserves each partition", () => {
    const ranked = rankGeneratedValues({
      values: ["gen-a", "hand-a", "gen-b", "hand-b"],
      files: [
        indexedFile("gen-a.ts", true),
        indexedFile("hand-a.ts", false),
        indexedFile("gen-b.ts", true),
        indexedFile("hand-b.ts", false)
      ],
      filePath: (value) => `${value}.ts`,
      itemId: (value) => value
    });

    expect(ranked.values.map((item) => item.value)).toEqual([
      "hand-a",
      "hand-b",
      "gen-a",
      "gen-b"
    ]);
    expect(ranked.diagnostics).toMatchObject({
      policy: GENERATED_SOFT_RANK_POLICY,
      classifierVersion: GENERATED_FILE_CLASSIFIER_VERSION,
      candidateCount: 4,
      returnedCount: 4,
      truncated: false
    });
    expect(ranked.diagnostics.items.map((item) => [
      item.itemId,
      item.baseRank,
      item.finalRank,
      item.generatedPenalty,
      item.reason
    ])).toEqual([
      ["hand-a", 2, 1, 0, "handwritten-preferred"],
      ["hand-b", 4, 2, 0, "handwritten-preferred"],
      ["gen-a", 1, 3, 1, "generated-file-soft-penalty"],
      ["gen-b", 3, 4, 1, "generated-file-soft-penalty"]
    ]);
  });

  it("keeps an all-generated pool intact and reports explicit truncation", () => {
    const ranked = rankGeneratedValues({
      values: ["a", "b", "c"],
      files: [
        indexedFile("a.ts", true),
        indexedFile("b.ts", true),
        indexedFile("c.ts", true)
      ],
      filePath: (value) => `${value}.ts`,
      itemId: (value) => value,
      limit: 2
    });

    expect(ranked.values.map((item) => item.value)).toEqual(["a", "b"]);
    expect(ranked.diagnostics).toMatchObject({
      candidateCount: 3,
      returnedCount: 2,
      truncated: true
    });
  });
});
