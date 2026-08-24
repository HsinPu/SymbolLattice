import { describe, expect, it } from "vitest";

import { runPerlNegativeMatrix } from "../../../benchmarks/perl/negative-matrix.mjs";

describe("Perl negative matrix", () => {
  it("rejects 150 quoted, malformed, dynamic, nested, and lookalike cases", () => {
    const report = runPerlNegativeMatrix();
    expect(report.caseCount).toBe(150);
    expect(report.status).toBe("pass");
    expect(report.failed).toBe(0);
  });
});
