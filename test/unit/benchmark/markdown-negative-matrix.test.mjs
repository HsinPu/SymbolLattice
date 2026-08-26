import { describe, expect, it } from "vitest";

import { markdownNegativeCases, runMarkdownNegativeMatrix } from "../../../benchmarks/markdown/negative-matrix.mjs";

describe("Markdown negative matrix", () => {
  it("contains the approved 150-case family contract", () => {
    const cases = markdownNegativeCases();
    expect(cases).toHaveLength(150);
    expect(new Set(cases.map((testCase) => testCase.id)).size).toBe(150);
    expect(Object.fromEntries([...new Set(cases.map((testCase) => testCase.family))].map((family) => [family, cases.filter((testCase) => testCase.family === family).length]))).toEqual({
      "opaque-code": 30,
      "unsupported-syntax": 30,
      "path-safety": 35,
      "dynamic-or-anchor": 25,
      "malformed-or-limit": 30
    });
  });

  it("does not emit an incorrect exact relation for any negative case in an indexed decoy workspace", () => {
    const report = runMarkdownNegativeMatrix();
    expect(report.caseCount).toBe(150);
    expect(report.status).toBe("pass");
    expect(report.failed).toBe(0);
    expect(report.proof.indexedFiles).toBeGreaterThan(150);
    expect(report.proof.decoyTargetFiles).toBeGreaterThan(0);
    expect(report.proof.totalExactReferenceEdges).toBe(0);
  });
});
