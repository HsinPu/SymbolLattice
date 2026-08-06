import { describe, expect, it } from "vitest";

import {
  CONTEXT_SOURCE_ALLOCATION_POLICY,
  CONTEXT_SOURCE_MINIMUM_PER_REFERENCE,
  allocateContextSource
} from "../../src/application/context-source-allocation.js";

describe("context source allocation", () => {
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
