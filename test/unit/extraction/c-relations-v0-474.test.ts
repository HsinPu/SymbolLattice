import { describe, expect, it } from "vitest";

import { extractCFileFacts } from "../../../src/extraction/c.js";

describe("C v0.474 bounded relation facts", () => {
  it("extracts literal includes, tagged types, callable signatures, and direct call facts", () => {
    const facts = extractCFileFacts({
      filePath: "src/app.c",
      language: "c",
      sourceText: [
        '#include "api.h"',
        "struct Local { int value; };",
        "int helper(struct Local *value) { return value != 0; }",
        "int caller(struct Local *value) { return helper(value); }"
      ].join("\n")
    });

    expect(facts.cFacts?.parserRejected).toBe(false);
    expect(facts.cFacts?.imports).toEqual([
      expect.objectContaining({ importedPath: "api.h" })
    ]);
    expect(facts.cFacts?.types).toEqual([
      expect.objectContaining({ name: "Local", declarationKind: "struct" })
    ]);
    expect(facts.cFacts?.callables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "helper",
          parameterCount: 1,
          parameterTypeNames: ["Local"]
        }),
        expect.objectContaining({
          name: "caller",
          parameterCount: 1,
          parameterTypeNames: ["Local"]
        })
      ])
    );
    expect(facts.cFacts?.calls).toEqual([
      expect.objectContaining({
        sourceId: expect.stringContaining("%23caller"),
        referenceName: "helper",
        argumentCount: 1
      })
    ]);
  });

  it("keeps malformed sources parser-rejected", () => {
    const facts = extractCFileFacts({
      filePath: "src/bad.c",
      language: "c",
      sourceText: "int caller( { return 0; }"
    });
    expect(facts.cFacts?.parserRejected).toBe(true);
    expect(facts.cFacts?.imports).toEqual([]);
    expect(facts.cFacts?.calls).toEqual([]);
  });
});
