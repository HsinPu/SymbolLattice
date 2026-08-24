import { describe, expect, it } from "vitest";

import { runLuauNegativeMatrix } from "../../../benchmarks/luau/negative-matrix.mjs";

describe("Luau negative matrix", () => {
  it("passes all 150 fail-closed cases", () => {
    const report = runLuauNegativeMatrix();
    expect(report.caseCount).toBe(150);
    expect(report.failed).toBe(0);
    expect(report.status).toBe("pass");
  });
});
