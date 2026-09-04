import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

type DirectCallLanguage = "groovy" | "cfml";

function factsFor(language: DirectCallLanguage, sourceText: string, filePath?: string) {
  return extractFileFacts({
    filePath: filePath ?? (language === "groovy" ? "src/direct.groovy" : "src/direct.cfm"),
    language,
    sourceText
  });
}

function callsFor(language: DirectCallLanguage, sourceText: string, filePath?: string) {
  return factsFor(language, sourceText, filePath).edges.filter((edge) => edge.kind === "calls");
}

function functionId(language: DirectCallLanguage, sourceText: string, name: string): string {
  const symbol = factsFor(language, sourceText).symbols.find(
    (candidate) =>
      candidate.name === name &&
      (candidate.kind === "function" || candidate.kind === "method")
  );
  if (symbol === undefined) {
    throw new Error(`Expected ${language} callable ${name} to be extracted.`);
  }
  return symbol.id;
}

describe("Groovy and CFML direct-call soundness boundaries", () => {
  it("links unique top-level Groovy self-recursion with matching arity", () => {
    const sourceText = "def fib(n) { n < 2 ? n : fib(n - 1) + fib(n - 2) }";
    const targetId = functionId("groovy", sourceText, "fib");

    expect(callsFor("groovy", sourceText)).toEqual([
      expect.objectContaining({
        sourceId: targetId,
        targetId,
        referenceName: "fib",
        range: { start: { line: 1, column: 26 }, end: { line: 1, column: 29 } },
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: "syntax.groovy.same-file.unique-direct-self-call.arity",
          stage: "syntax",
          candidateSymbolIds: [targetId]
        }
      }),
      expect.objectContaining({
        sourceId: targetId,
        targetId,
        referenceName: "fib",
        range: { start: { line: 1, column: 39 }, end: { line: 1, column: 42 } }
      })
    ]);
  });

  it("keeps Groovy top-level def symbols without claiming a direct call", () => {
    const sourceText = [
      "def groovyHelper() { 1 }",
      "def groovyEntry() { return groovyHelper() }"
    ].join("\n");
    expect(functionId("groovy", sourceText, "groovyHelper")).toBeDefined();
    expect(functionId("groovy", sourceText, "groovyEntry")).toBeDefined();
    expect(callsFor("groovy", sourceText)).toEqual([]);
  });

  it("accepts a self-recursive call separated from a return keyword by whitespace", () => {
    const sourceText = "def recurse(value) { return recurse(value) }";
    expect(callsFor("groovy", sourceText)).toEqual([
      expect.objectContaining({
        referenceName: "recurse",
        range: { start: { line: 1, column: 29 }, end: { line: 1, column: 36 } }
      })
    ]);
  });

  it("keeps CFScript function symbols without claiming a direct call", () => {
    const sourceText = [
      "function cfmlHelper() { return 1; }",
      "function cfmlEntry() { return cfmlHelper(); }"
    ].join("\n");
    expect(functionId("cfml", sourceText, "cfmlHelper")).toBeDefined();
    expect(functionId("cfml", sourceText, "cfmlEntry")).toBeDefined();
    expect(callsFor("cfml", sourceText)).toEqual([]);
  });

  it("fails closed for Groovy closures, metaclass changes, local or parameter shadows, member calls, and duplicate targets", () => {
    const cases = [
      [
        "def groovyHelper() { 1 }",
        "def groovyEntry() { def callback = { groovyHelper() }; callback() }"
      ].join("\n"),
      [
        "def groovyHelper() { 1 }",
        "def groovyEntry() { groovyHelper = { 2 }; groovyHelper() }"
      ].join("\n"),
      [
        "def groovyHelper() { 1 }",
        "def groovyEntry(groovyHelper) { groovyHelper() }"
      ].join("\n"),
      [
        "def groovyHelper() { 1 }",
        "def groovyEntry() { service.groovyHelper() }"
      ].join("\n"),
      [
        "def groovyHelper() { 1 }",
        "def groovyHelper() { 2 }",
        "def groovyEntry() { groovyHelper() }"
      ].join("\n"),
      [
        "def groovyHelper() { 1 }",
        "def groovyEntry() { groovyHelper() }",
        "GroovyObject.metaClass.groovyHelper = { -> 2 }"
      ].join("\n"),
      [
        "import static vendor.Helpers.groovyHelper as groovyHelper",
        "def groovyHelper() { 1 }",
        "def groovyEntry() { groovyHelper() }"
      ].join("\n"),
      [
        "def groovyHelper(value) { value }",
        "def groovyEntry() { groovyHelper() }"
      ].join("\n"),
      [
        "def groovyHelper() { 1 }",
        "def groovyEntry() { Closure groovyHelper = null; groovyHelper() }"
      ].join("\n"),
      [
        "def groovyHelper() { 1 }",
        "def groovyEntry() { groovyHelper() }",
        "External.metaClass.groovyHelper = { -> 2 }"
      ].join("\n"),
      "def recurse(recurse) { recurse() }",
      "def recurse() { def recurse = { 1 }; recurse() }",
      "def recurse() { this.recurse() }",
      "def recurse() { this.&recurse() }",
      "def recurse() { this.@recurse() }",
      "def recurse(value) { recurse() }",
      [
        "def recurse(value) { recurse(value) }",
        "def recurse(other) { recurse(other) }"
      ].join("\n"),
      "def recurse(value) { [value].each { recurse(it) } }"
    ];

    for (const sourceText of cases) {
      expect(callsFor("groovy", sourceText)).toEqual([]);
    }
  });

  it("fails closed for CFML closures, tag-script ambiguity, local or parameter shadows, member calls, and duplicate targets", () => {
    const cases = [
      [
        "function cfmlHelper() { return 1; }",
        "function cfmlEntry() { var callback = function() { return cfmlHelper(); }; return callback(); }"
      ].join("\n"),
      [
        "<cfcomponent>",
        "<cffunction name=\"cfmlHelper\"></cffunction>",
        "<cfscript>function cfmlEntry() { return cfmlHelper(); }</cfscript>",
        "</cfcomponent>"
      ].join("\n"),
      [
        "function cfmlHelper() { return 1; }",
        "function cfmlEntry(cfmlHelper) { return cfmlHelper(); }"
      ].join("\n"),
      [
        "function cfmlHelper() { return 1; }",
        "function cfmlEntry() { var cfmlHelper = 2; return cfmlHelper(); }"
      ].join("\n"),
      [
        "function cfmlHelper() { return 1; }",
        "function cfmlEntry() { return service.cfmlHelper(); }"
      ].join("\n"),
      [
        "function cfmlHelper() { return 1; }",
        "function cfmlHelper() { return 2; }",
        "function cfmlEntry() { return cfmlHelper(); }"
      ].join("\n"),
      [
        "function cfmlHelper() { return 1; }",
        "function cfmlEntry() { return cfmlHelper(); }",
        "function onMissingMethod() { return 2; }"
      ].join("\n"),
      [
        "function cfmlHelper() { return 1; }",
        "function cfmlEntry() { local[\"cfmlHelper\"] = 2; return cfmlHelper(); }"
      ].join("\n"),
      [
        "function cfmlHelper() { return 1; }",
        "function cfmlEntry() { arguments[\"cfmlHelper\"] = 2; return cfmlHelper(); }"
      ].join("\n"),
      [
        "function cfmlHelper(value) { return value; }",
        "function cfmlEntry() { return cfmlHelper(); }"
      ].join("\n"),
      [
        "component {",
        "  function cfmlHelper() { return 1; }",
        "  function cfmlEntry() { return cfmlHelper(); }",
        "}"
      ].join("\n"),
      [
        "<cfset mode = 1>",
        "<cfinclude template=\"other.cfm\">",
        "<cfscript>function cfmlHelper() { return 1; } function cfmlEntry() { return cfmlHelper(); }</cfscript>"
      ].join("\n")
    ];

    for (const sourceText of cases) {
      expect(callsFor("cfml", sourceText)).toEqual([]);
    }

    const overridableCfc = [
      "component extends=\"BaseComponent\" {",
      "  function cfmlHelper() { return 1; }",
      "  function cfmlEntry() { return cfmlHelper(); }",
      "}"
    ].join("\n");
    expect(factsFor("cfml", overridableCfc, "src/direct.cfc").symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "method", name: "cfmlHelper" }),
        expect.objectContaining({ kind: "method", name: "cfmlEntry" })
      ])
    );
    expect(callsFor("cfml", overridableCfc, "src/direct.cfc")).toEqual([]);
  });
});
