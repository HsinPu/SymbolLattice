import { describe, expect, it } from "vitest";

import { createEdgeId, createSymbolId } from "../../src/domain/index.js";

describe("stable graph identifiers", () => {
  it("creates stable symbol identifiers from the declaration identity", () => {
    const input = {
      filePath: "src/math.ts",
      qualifiedName: "math.add",
      kind: "function" as const,
      declarationOrdinal: 0
    };

    expect(createSymbolId(input)).toBe(createSymbolId(input));
    expect(createSymbolId(input)).toContain("src%2Fmath.ts");
  });

  it("keeps call-edge identifiers distinct by source location", () => {
    const base = {
      sourceId: "symbol:caller",
      targetId: "symbol:callee",
      kind: "calls" as const,
      column: 4,
      referenceName: "callee"
    };

    expect(createEdgeId({ ...base, line: 4 })).not.toBe(
      createEdgeId({ ...base, line: 5 })
    );
  });
});
