import { describe, expect, it } from "vitest";

import { extractRFileFacts } from "../../../src/extraction/r.js";

function rFacts(sourceText: string) {
  return extractRFileFacts({ filePath: "R/relations.R", language: "r", sourceText }).rFacts;
}

describe("R relation depth v0.481", () => {
  it("records a unique same-file direct call with an exact occurrence range", () => {
    const facts = rFacts([
      "helper <- function(value) { value }",
      "entry <- function(value) { helper(value) }",
      ""
    ].join("\n"));

    expect(facts?.parserRejected).toBe(false);
    expect(facts?.functions.map(({ name }) => name)).toEqual(["helper", "entry"]);
    expect(facts?.calls).toHaveLength(1);
    expect(facts?.calls[0]).toMatchObject({
      referenceName: "helper",
      argumentCount: 1,
      range: { start: { line: 2, column: 28 } }
    });
  });

  it("keeps dynamic, rebinding, nested, namespace and dispatch forms unresolved", () => {
    const sources = [
      "entry <- function(rHelper) { rHelper() }\nrHelper <- function() { 1 }",
      "entry <- function() { rHelper <- function() { 2 }; rHelper() }\nrHelper <- function() { 1 }",
      "entry <- function() { rHelper <<- function() { 2 }; rHelper() }\nrHelper <- function() { 1 }",
      "entry <- function() { get(\"rHelper\")() }\nrHelper <- function() { 1 }",
      "entry <- function() { foreign::rHelper() }\nrHelper <- function() { 1 }",
      "entry <- function() { holder$rHelper() }\nrHelper <- function() { 1 }",
      "entry <- function() { callback <- function() { rHelper() }; callback() }\nrHelper <- function() { 1 }",
      "entry <- function() { source(\"foreign.R\"); rHelper() }\nrHelper <- function() { 1 }",
      "entry <- function() { rHelper() }\nrHelper <- function() { UseMethod(\"rHelper\") }"
    ];

    for (const sourceText of sources) {
      expect(rFacts(sourceText)?.calls).toEqual([]);
    }
  });

  it("fails closed for malformed R source", () => {
    const facts = rFacts("entry <- function(value) { helper(value)\n");
    expect(facts).toMatchObject({ parserRejected: true, functions: [], calls: [] });
  });
});
