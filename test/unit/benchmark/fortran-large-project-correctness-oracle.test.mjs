import { describe, expect, it } from "vitest";
import { parseFortranOracleLine, scoreFortranNegativeMatrix } from "../../../benchmarks/fortran/correctness-oracle.mjs";

describe("Fortran large-project correctness oracle", () => {
  it("parses project source, target, arity, and occurrence identity", () => {
    expect(parseFortranOracleLine("CANDIDATE\tSRC/a.f\tSRC/b.f\tSubroutine_Subprogram\tENTRY\tHELPER\t2\t1\t7\t1\t7\t2\t12")).toMatchObject({
      sourceFile: "SRC/a.f", targetFile: "SRC/b.f", caller: "ENTRY", target: "HELPER", arity: 2,
      callerPosition: { line: 1, column: 7 }, targetPosition: { line: 1, column: 7 }, occurrence: { line: 2, column: 12 }
    });
  });
  it("keeps all 150 negative project cases exact-edge free", () => {
    expect(scoreFortranNegativeMatrix()).toEqual({ total: 150, tn: 150, falsePositives: [] });
  });
});
