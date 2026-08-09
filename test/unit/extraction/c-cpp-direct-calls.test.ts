import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

type DirectCallLanguage = "c" | "cpp";

function factsFor(language: DirectCallLanguage, sourceText: string) {
  return extractFileFacts({
    filePath: language === "c" ? "src/direct.c" : "src/direct.cpp",
    language,
    sourceText
  });
}

function callsFor(language: DirectCallLanguage, sourceText: string) {
  return factsFor(language, sourceText).edges.filter((edge) => edge.kind === "calls");
}

function functionId(language: DirectCallLanguage, sourceText: string, name: string): string {
  const facts = factsFor(language, sourceText);
  const symbol = facts.symbols.find((candidate) => candidate.kind === "function" && candidate.name === name);
  if (symbol === undefined) {
    throw new Error(`Expected ${language} function ${name} to be extracted.`);
  }
  return symbol.id;
}

describe("C and C++ same-file direct calls", () => {
  for (const language of ["c", "cpp"] as const) {
    const ruleId = `syntax.${language}.same-file.unique-top-level-function-call`;

    it(`emits one exact unique bare-identifier ${language} call with evidence`, () => {
      const sourceText = [
        "int target(void) { return 0; }",
        "int caller(void) { target(); return 0; }"
      ].join("\n");
      const calls = callsFor(language, sourceText);

      expect(calls).toEqual([
        expect.objectContaining({
          sourceId: functionId(language, sourceText, "caller"),
          targetId: functionId(language, sourceText, "target"),
          kind: "calls",
          resolution: "exact",
          confidence: 1,
          referenceName: "target",
          evidence: {
            ruleId,
            stage: "syntax",
            candidateSymbolIds: [functionId(language, sourceText, "target")]
          }
        })
      ]);
    });

    it(`emits one exact ${language} call returned directly from a top-level function body`, () => {
      const sourceText = [
        "int c_helper(void) { return 0; }",
        "int c_entry(void) { return c_helper(); }"
      ].join("\n");

      expect(callsFor(language, sourceText)).toEqual([
        expect.objectContaining({
          sourceId: functionId(language, sourceText, "c_entry"),
          targetId: functionId(language, sourceText, "c_helper"),
          kind: "calls",
          resolution: "exact",
          confidence: 1,
          referenceName: "c_helper",
          evidence: {
            ruleId,
            stage: "syntax",
            candidateSymbolIds: [functionId(language, sourceText, "c_helper")]
          }
        })
      ]);
    });

    it(`rejects ${language} parameter and local shadows, macro calls, indirect or member calls, duplicate targets, and nested bodies`, () => {
      const sourceText = [
        "#define target() 0",
        "int target(void) { return 0; }",
        "int target(int value) { return value; }",
        "int parameter(int target) { target(); return 0; }",
        "int local(void) { void (*target)(void); target(); return 0; }",
        "int local_after(void) { target(); void (*target)(void); return 0; }",
        "int macro(void) { target(); return 0; }",
        "int indirect(void) { (*target)(); return 0; }",
        "int member(void) { object.target(); return 0; }",
        "int nested(void) { { target(); } return 0; }"
      ].join("\n");

      expect(
        factsFor(language, sourceText).symbols
          .filter((symbol) => symbol.kind === "function")
          .map((symbol) => symbol.name)
      ).toEqual(expect.arrayContaining(["target", "parameter", "local", "local_after", "macro", "indirect", "member", "nested"]));
      expect(callsFor(language, sourceText)).toEqual([]);
    });

    it(`rejects ${language} function-like macros at file and function scope`, () => {
      const fileMacro = [
        "#define target(value) 0",
        "int target(void) { return 0; }",
        "int caller(void) { return target(); }"
      ].join("\n");
      const functionMacro = [
        "int target(void) { return 0; }",
        "int caller(void) {",
        "#define target() 0",
        "  return target();",
        "}"
      ].join("\n");

      expect(functionId(language, fileMacro, "caller")).toBeDefined();
      expect(callsFor(language, fileMacro)).toEqual([]);
      expect(functionId(language, functionMacro, "caller")).toBeDefined();
      expect(callsFor(language, functionMacro)).toEqual([]);
    });

    it(`keeps whole-file macro detection fail-closed for a later ${language} macro`, () => {
      const sourceText = [
        "int target(void) { return 0; }",
        "int caller(void) { return target(); }",
        "#define target() 0",
        ""
      ].join("\n");

      expect(functionId(language, sourceText, "caller")).toBeDefined();
      expect(callsFor(language, sourceText)).toEqual([]);
    });
  }

  it("rejects C++ calls when a same-name free-function declaration could be an overload", () => {
    const sourceText = [
      "int target(int value) { return value; }",
      "double target(double);",
      "int caller() { return target(1.5); }"
    ].join("\n");

    expect(functionId("cpp", sourceText, "caller")).toBeDefined();
    expect(callsFor("cpp", sourceText)).toEqual([]);
  });

  it("rejects C++ calls when a same-name template declaration could be selected", () => {
    const sourceText = [
      "template<typename T> T target(T);",
      "int target(int value) { return value; }",
      "int caller() { return target(1.5); }"
    ].join("\n");

    expect(functionId("cpp", sourceText, "caller")).toBeDefined();
    expect(callsFor("cpp", sourceText)).toEqual([]);
  });

  it("rejects C++ calls shadowed by direct using aliases or typedefs", () => {
    const usingAlias = [
      "int target() { return 1; }",
      "int caller() { using target = int; return target(); }"
    ].join("\n");
    const typedefAlias = [
      "int target() { return 1; }",
      "int caller() { typedef int target; return target(); }"
    ].join("\n");

    expect(functionId("cpp", usingAlias, "caller")).toBeDefined();
    expect(callsFor("cpp", usingAlias)).toEqual([]);
    expect(functionId("cpp", typedefAlias, "caller")).toBeDefined();
    expect(callsFor("cpp", typedefAlias)).toEqual([]);
  });

  it("rejects C++ calls shadowed by pointer and function-pointer typedef declarators", () => {
    const pointerAlias = [
      "int target() { return 1; }",
      "int caller() { typedef int* target; return target(); }"
    ].join("\n");
    const functionPointerAlias = [
      "int target() { return 1; }",
      "int caller() { typedef int (*target)(void); return target(); }"
    ].join("\n");

    expect(functionId("cpp", pointerAlias, "caller")).toBeDefined();
    expect(callsFor("cpp", pointerAlias)).toEqual([]);
    expect(functionId("cpp", functionPointerAlias, "caller")).toBeDefined();
    expect(callsFor("cpp", functionPointerAlias)).toEqual([]);
  });

  it("rejects C++ calls shadowed by direct struct, class, or enum declarations", () => {
    const typeDeclarations = ["struct target {};", "class target {};", "enum target { value };"];
    for (const declaration of typeDeclarations) {
      const sourceText = [
        "int target() { return 1; }",
        `int caller() { ${declaration} return target(); }`
      ].join("\n");

      expect(functionId("cpp", sourceText, "caller")).toBeDefined();
      expect(callsFor("cpp", sourceText)).toEqual([]);
    }
  });

  it("accepts a matching C prototype and rejects a conflicting one", () => {
    const matchingPrototype = [
      "int target(void);",
      "int target(void) { return 0; }",
      "int caller(void) { return target(); }"
    ].join("\n");
    const conflictingPrototype = [
      "int target(int value);",
      "int target(void) { return 0; }",
      "int caller(void) { return target(); }"
    ].join("\n");
    const conflictingReturnType = [
      "double target(void);",
      "int target(void) { return 0; }",
      "int caller(void) { return target(); }"
    ].join("\n");
    const typeReferenceParameter = [
      "int target(void);",
      "int target(void) { return 0; }",
      "int caller(struct target* parameter) { return target(); }"
    ].join("\n");

    expect(callsFor("c", matchingPrototype)).toHaveLength(1);
    expect(callsFor("c", conflictingPrototype)).toEqual([]);
    expect(callsFor("c", conflictingReturnType)).toEqual([]);
    expect(callsFor("c", typeReferenceParameter)).toHaveLength(1);
  });

  it("rejects C++ calls contained in a lambda body", () => {
    const sourceText = [
      "int target() { return 0; }",
      "int caller() { auto callback = []() { target(); }; return 0; }"
    ].join("\n");

    expect(functionId("cpp", sourceText, "caller")).toBeDefined();
    expect(callsFor("cpp", sourceText)).toEqual([]);
  });
});
