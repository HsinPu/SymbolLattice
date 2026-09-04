import { describe, expect, it } from "vitest";

import { extractFortranFileFacts } from "../../../src/extraction/fortran.js";

describe("Fortran relations v0.507", () => {
  it("admits fixed-form LAPACK declarations with dollar and plus continuations", () => {
    const sourceText = [
      "      SUBROUTINE ENTRY(A, B, C, D,",
      "     $                 E, F)",
      "      CALL HELPER(A, B, C, D,",
      "     +            E, F)",
      "      END SUBROUTINE ENTRY",
      "      SUBROUTINE HELPER(A, B, C, D,",
      "     $                  E, F)",
      "      END SUBROUTINE HELPER"
    ].join("\n");
    const facts = extractFortranFileFacts({ filePath: "src/probe.f", language: "fortran", sourceText });
    expect(facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.name)).toEqual([
      "ENTRY", "HELPER"
    ]);
  });

  it("fails closed for an orphan fixed-form continuation", () => {
    const facts = extractFortranFileFacts({
      filePath: "src/broken.f",
      language: "fortran",
      sourceText: "     $ ORPHAN\n      END"
    });
    expect(facts.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
    expect(facts.edges).toEqual([]);
  });

  it("accepts the standard generic END for complete direct program units", () => {
    const facts = extractFortranFileFacts({
      filePath: "src/generic-end.f",
      language: "fortran",
      sourceText: [
        "      SUBROUTINE ENTRY()",
        "      CALL HELPER()",
        "      END",
        "      SUBROUTINE HELPER()",
        "      END"
      ].join("\n")
    });
    expect(facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.name)).toEqual([
      "ENTRY", "HELPER"
    ]);
  });
});
