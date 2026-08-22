import { describe, expect, it } from "vitest";

import { runJuliaNegativeMatrix } from "../../../scripts/julia-negative-matrix.mjs";

describe("Julia negative matrix", () => {
  it("passes all 150 fail-closed cases", () => {
    const report = runJuliaNegativeMatrix();
    expect(report.caseCount).toBe(150);
    expect(report.failed).toBe(0);
    expect(report.status).toBe("pass");
  });
});
