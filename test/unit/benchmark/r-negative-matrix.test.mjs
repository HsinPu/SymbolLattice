import { describe, expect, it } from "vitest";

import { runRNegativeMatrix } from "../../../scripts/r-negative-matrix.mjs";

describe("R negative matrix", () => {
  it("rejects 150 quoted, malformed, dynamic, nested, and lookalike cases", () => {
    const report = runRNegativeMatrix();
    expect(report.caseCount).toBe(150);
    expect(report.status).toBe("pass");
    expect(report.failed).toBe(0);
  });
});
