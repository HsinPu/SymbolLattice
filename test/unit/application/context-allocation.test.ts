import { describe, expect, it } from "vitest";

import {
  allocateInvestigationSource,
  INVESTIGATION_SOURCE_ALLOCATION_POLICY
} from "../../../src/application/context-allocation.js";

function candidate(
  filePath: string,
  requestedCharacters: number,
  selectionRanks: readonly number[],
  generatedPenalty: 0 | 1 = 0
) {
  return { filePath, requestedCharacters, selectionRanks, generatedPenalty };
}

describe("bounded proportional investigation source allocation", () => {
  it("allocates more source to stronger rank evidence without starving selected files", () => {
    const result = allocateInvestigationSource({
      candidates: [
        candidate("src/top.ts", 10_000, [1]),
        candidate("src/middle.ts", 10_000, [2]),
        candidate("src/lower.ts", 10_000, [3])
      ],
      characterBudget: 12_000,
      selectionCount: 3
    });

    expect(result.policy).toBe(INVESTIGATION_SOURCE_ALLOCATION_POLICY);
    expect(result.files.map((file) => file.filePath)).toEqual([
      "src/top.ts",
      "src/middle.ts",
      "src/lower.ts"
    ]);
    expect(result.files[0]!.allocatedCharacters).toBeGreaterThan(
      result.files[1]!.allocatedCharacters
    );
    expect(result.files[1]!.allocatedCharacters).toBeGreaterThan(
      result.files[2]!.allocatedCharacters
    );
    expect(result.files.every((file) => file.allocatedCharacters >= 256)).toBe(true);
    expect(result.summary.allocatedCharacters).toBe(12_000);
    expect(result.summary.allocatedCharacters).toBeLessThanOrEqual(result.budget.characterBudget);
    expect(result.summary.truncated).toBe(true);
  });

  it("applies a disclosed generated-file worth multiplier without hiding the file", () => {
    const result = allocateInvestigationSource({
      candidates: [
        candidate("src/generated.ts", 8_000, [1], 1),
        candidate("src/handwritten.ts", 8_000, [2], 0)
      ],
      characterBudget: 6_000,
      selectionCount: 2
    });
    const generated = result.files.find((file) => file.filePath === "src/generated.ts")!;
    const handwritten = result.files.find((file) => file.filePath === "src/handwritten.ts")!;

    expect(generated.generatedMultiplier).toBe(0.25);
    expect(generated.reason).toBe("generated-file-worth-penalty");
    expect(generated.allocatedCharacters).toBeGreaterThan(0);
    expect(handwritten.allocatedCharacters).toBeGreaterThan(generated.allocatedCharacters);
  });

  it("redistributes capacity that a short file cannot spend", () => {
    const result = allocateInvestigationSource({
      candidates: [
        candidate("src/short.ts", 500, [1]),
        candidate("src/long.ts", 10_000, [2])
      ],
      characterBudget: 4_000,
      selectionCount: 2
    });

    expect(result.files).toEqual([
      expect.objectContaining({
        filePath: "src/short.ts",
        requestedCharacters: 500,
        allocatedCharacters: 500,
        truncated: false
      }),
      expect.objectContaining({
        filePath: "src/long.ts",
        allocatedCharacters: 3_500,
        truncated: true
      })
    ]);
    expect(result.summary.allocatedCharacters).toBe(4_000);
    expect(result.summary.unusedCharacters).toBe(0);
  });

  it("reports unused capacity when every selected source fits", () => {
    const result = allocateInvestigationSource({
      candidates: [candidate("src/a.ts", 300, [1]), candidate("src/b.ts", 200, [2])],
      characterBudget: 2_048,
      selectionCount: 2
    });

    expect(result.summary).toMatchObject({
      requestedCharacters: 500,
      allocatedCharacters: 500,
      unusedCharacters: 1_548,
      truncated: false
    });
  });

  it("preserves the strict envelope and per-file invariants across supported bounds", () => {
    for (const selectionCount of [1, 2, 4, 8]) {
      for (const characterBudget of [2_048, 4_096, 24_000, 64_000]) {
        const candidates = Array.from({ length: selectionCount }, (_value, index) =>
          candidate(
            `src/file-${index + 1}.ts`,
            index % 3 === 0 ? 100 + index : 80_000 - index,
            [index + 1],
            index % 2 === 0 ? 0 : 1
          )
        );
        const result = allocateInvestigationSource({
          candidates,
          characterBudget,
          selectionCount
        });

        expect(result.summary.allocatedCharacters).toBeLessThanOrEqual(characterBudget);
        expect(result.summary.unusedCharacters).toBe(
          characterBudget - result.summary.allocatedCharacters
        );
        expect(result.files).toHaveLength(selectionCount);
        for (const [index, file] of result.files.entries()) {
          expect(file.allocatedCharacters).toBeGreaterThanOrEqual(0);
          expect(file.allocatedCharacters).toBeLessThanOrEqual(
            candidates[index]!.requestedCharacters
          );
          expect(Number.isFinite(file.effectiveWeight)).toBe(true);
        }
      }
    }
  });

  it("combines multiple selection ranks into one file allocation", () => {
    const result = allocateInvestigationSource({
      candidates: [
        candidate("src/shared.ts", 20_000, [1, 2]),
        candidate("src/other.ts", 20_000, [3])
      ],
      characterBudget: 4_096,
      selectionCount: 3
    });
    const shared = result.files.find((file) => file.filePath === "src/shared.ts")!;

    expect(shared.selectionRanks).toEqual([1, 2]);
    expect(shared.rankWeight).toBe(5);
    expect(shared.allocatedCharacters).toBeGreaterThan(
      result.files.find((file) => file.filePath === "src/other.ts")!.allocatedCharacters
    );
    expect(result.summary.allocatedCharacters).toBe(4_096);
  });

  it("rejects duplicate files, invalid ranks, and unsafe budgets", () => {
    expect(() =>
      allocateInvestigationSource({
        candidates: [candidate("src/a.ts", 10, [1]), candidate("src/a.ts", 20, [2])],
        characterBudget: 2_048,
        selectionCount: 2
      })
    ).toThrow(/duplicate file/u);
    expect(() =>
      allocateInvestigationSource({
        candidates: [candidate("src/a.ts", 10, [0])],
        characterBudget: 2_048,
        selectionCount: 1
      })
    ).toThrow(/selection rank/u);
    expect(() =>
      allocateInvestigationSource({
        candidates: [candidate("src/a.ts", 10, [1])],
        characterBudget: 1_000,
        selectionCount: 1
      })
    ).toThrow(/character budget/u);
  });
});
