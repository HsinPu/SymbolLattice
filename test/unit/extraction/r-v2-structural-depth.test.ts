import { describe, expect, it } from "vitest";

import { extractRFileFacts } from "../../../src/extraction/r.js";

function declarations(facts: ReturnType<typeof extractRFileFacts>) {
  return facts.symbols.filter((symbol) => symbol.kind !== "file");
}

describe("R structural depth v2", () => {
  it("extracts literal S4 setClass and setRefClass declarations with exact containment", () => {
    const facts = extractRFileFacts({
      filePath: "R/classes.R",
      language: "r",
      sourceText: `setClass("Record", slots = c(value = "character"))
setRefClass('MutableRecord', fields = list(value = "character"))

render <- function(record) {
  record@value
}
`
    });
    expect(declarations(facts)).toEqual([
      expect.objectContaining({ kind: "class", name: "Record" }),
      expect.objectContaining({ kind: "class", name: "MutableRecord" }),
      expect.objectContaining({ kind: "function", name: "render" })
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "contains")).toHaveLength(3);
    expect(facts.edges.filter((edge) => edge.kind === "contains").every((edge) => edge.resolution === "exact" && edge.confidence === 1)).toBe(true);
  });

  it("does not promote dynamic class names, quoted source, or nested calls", () => {
    const facts = extractRFileFacts({
      filePath: "R/dynamic.R",
      language: "r",
      sourceText: `name <- paste0("Dynamic", "Name")
setClass(name, slots = list())
text <- "setClass('Fake', slots = list())"
outer <- function() {
  setClass("Nested", slots = list())
}
`
    });
    expect(declarations(facts)).toEqual([
      expect.objectContaining({ kind: "function", name: "outer" })
    ]);
  });

  it("fails closed for malformed class structure", () => {
    const facts = extractRFileFacts({
      filePath: "R/broken.R",
      language: "r",
      sourceText: `setClass("Broken", slots = list(
`
    });
    expect(declarations(facts)).toEqual([]);
  });

  it("keeps valid multiline strings opaque without rejecting later declarations", () => {
    const facts = extractRFileFacts({
      filePath: "R/messages.R",
      language: "r",
      sourceText: `message <- "first line
second line"
root <- function(value) {
  value
}
`
    });
    expect(declarations(facts).map((symbol) => symbol.name)).toEqual(["root"]);
  });

  it("extracts direct expression-bodied function bindings", () => {
    const facts = extractRFileFacts({
      filePath: "R/expressions.R",
      language: "r",
      sourceText: `is_record <- function(value) inherits(value, "record")
identity_record <- function(value) value
continued <- function(value)
  value +
    1
outer <- function()
  inner <- function() 1
`
    });
    expect(declarations(facts).map((symbol) => symbol.name)).toEqual([
      "is_record",
      "identity_record",
      "continued",
      "outer"
    ]);
  });

  it("does not promote a braceless control-flow body to a root declaration", () => {
    const facts = extractRFileFacts({
      filePath: "R/control.R",
      language: "r",
      sourceText: `if (TRUE)
  hidden <- function() 1
visible <- function() 1
`
    });
    expect(declarations(facts).map((symbol) => symbol.name)).toEqual(["visible"]);
  });
});
