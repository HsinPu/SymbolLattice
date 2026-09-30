import { describe, expect, it } from "vitest";

import {
  CONTEXT_SOURCE_ALLOCATION_POLICY,
  CONTEXT_SOURCE_MINIMUM_PER_REFERENCE,
  allocateContextSource
} from "../../src/application/context-source-allocation.js";

describe("context source allocation", () => {
  it("fits eight primary references and one supplement within the minimum envelope", () => {
    const result = allocateContextSource({
      characterBudget: 2_048,
      referenceCount: 9,
      candidates: Array.from({ length: 9 }, (_, referenceIndex) => ({
        referenceIndex, reference: `src/${referenceIndex}.ts#method`,
        filePath: `src/${referenceIndex}.ts`, requestedCharacters: 2_000
      }))
    });
    expect(result.contexts).toHaveLength(9);
    expect(result.budget.minimumPerReference).toBe(227);
    expect(result.summary.allocatedCharacters).toBe(2_048);
    expect(result.contexts.every(item => item.allocatedCharacters >= 227)).toBe(true);
    expect(() => allocateContextSource({ characterBudget: 2_048,
      referenceCount: 11, candidates: [] })).toThrow(/reference count/u);
  });

  it("fits eight primary references and a complete two-candidate group within one strict budget", () => {
    const result = allocateContextSource({ characterBudget: 2_048, referenceCount: 10,
      candidates: Array.from({ length: 10 }, (_, referenceIndex) => ({ referenceIndex,
        reference: `src/${referenceIndex}.ts#method`, filePath: `src/${referenceIndex}.ts`, requestedCharacters: 2_000 })) });
    expect(result.contexts).toHaveLength(10);
    expect(result.summary.allocatedCharacters).toBe(2_048);
    expect(result.contexts.every(item => item.allocatedCharacters >= 204)).toBe(true);
  });

  it("shares one strict budget by explicit reference order", () => {
    const result = allocateContextSource({
      characterBudget: 2_048,
      referenceCount: 3,
      candidates: [
        { referenceIndex: 0, reference: "src/a.ts#a", filePath: "src/a.ts", requestedCharacters: 2_000 },
        { referenceIndex: 1, reference: "src/b.ts#b", filePath: "src/b.ts", requestedCharacters: 2_000 },
        { referenceIndex: 2, reference: "src/c.ts#c", filePath: "src/c.ts", requestedCharacters: 2_000 }
      ]
    });

    expect(result.policy).toBe(CONTEXT_SOURCE_ALLOCATION_POLICY);
    expect(result.summary).toMatchObject({
      candidateCount: 3,
      requestedCharacters: 6_000,
      allocatedCharacters: 2_048,
      unusedCharacters: 0,
      truncated: true
    });
    expect(result.contexts.map((context) => context.referenceIndex)).toEqual([0, 1, 2]);
    expect(result.contexts[0]!.allocatedCharacters).toBeGreaterThan(
      result.contexts[1]!.allocatedCharacters
    );
    expect(result.contexts[1]!.allocatedCharacters).toBeGreaterThan(
      result.contexts[2]!.allocatedCharacters
    );
    expect(result.contexts.every(
      (context) => context.allocatedCharacters >= CONTEXT_SOURCE_MINIMUM_PER_REFERENCE
    )).toBe(true);
  });

  it("redistributes capacity that a short earlier reference cannot spend", () => {
    const result = allocateContextSource({
      characterBudget: 2_048,
      referenceCount: 2,
      candidates: [
        { referenceIndex: 0, reference: "src/a.ts#a", filePath: "src/a.ts", requestedCharacters: 100 },
        { referenceIndex: 1, reference: "src/b.ts#b", filePath: "src/b.ts", requestedCharacters: 4_000 }
      ]
    });

    expect(result.contexts).toEqual([
      expect.objectContaining({ referenceIndex: 0, allocatedCharacters: 100, truncated: false }),
      expect.objectContaining({ referenceIndex: 1, allocatedCharacters: 1_948, truncated: true })
    ]);
    expect(result.summary.unusedCharacters).toBe(0);
  });

  it("rejects duplicate reference indexes before publishing a receipt", () => {
    expect(() => allocateContextSource({
      characterBudget: 2_048,
      referenceCount: 2,
      candidates: [
        { referenceIndex: 0, reference: "src/a.ts#a", filePath: "src/a.ts", requestedCharacters: 10 },
        { referenceIndex: 0, reference: "src/b.ts#b", filePath: "src/b.ts", requestedCharacters: 10 }
      ]
    })).toThrow(/duplicate reference index/u);
  });

  it("represents an empty internal selection without spending the envelope", () => {
    expect(allocateContextSource({
      characterBudget: 2_048,
      referenceCount: 0,
      candidates: []
    })).toMatchObject({
      summary: {
        candidateCount: 0,
        requestedCharacters: 0,
        allocatedCharacters: 0,
        unusedCharacters: 2_048,
        truncated: false
      },
      contexts: []
    });
  });
});
