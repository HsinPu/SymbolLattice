import { describe, expect, it } from "vitest";

import { extractCppFileFacts } from "../../../src/extraction/cpp.js";

describe("C++ v0.473 bounded relation facts", () => {
  it("extracts local includes, class/method identity, member calls, construction, and signatures", () => {
    const facts = extractCppFileFacts({
      filePath: "src/app.cpp",
      language: "cpp",
      sourceText: [
        '#include "api.hpp"',
        "struct Local {};",
        "inline Local helper(Local value) { return value; }",
        "class Box {",
        "public:",
        "  int memberHelper(int value) { return value; }",
        "  int member(int value) { this->memberHelper(value); return value; }",
        "};",
        "inline Local make(Local value) { return *new Local(); }"
      ].join("\n")
    });

    expect(facts.cppFacts?.parserRejected).toBe(false);
    expect(facts.cppFacts?.imports).toEqual([
      expect.objectContaining({ importedPath: "api.hpp", range: { start: { line: 1, column: 11 }, end: { line: 1, column: 18 } } })
    ]);
    expect(facts.cppFacts?.types).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Local", declarationKind: "struct" }),
        expect.objectContaining({ name: "Box", declarationKind: "class" })
      ])
    );
    expect(facts.cppFacts?.callables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "helper", parameterCount: 1, parameterTypeNames: ["Local"], returnTypeName: "Local" }),
        expect.objectContaining({ name: "member", ownerTypeName: "Box", parameterCount: 1 }),
        expect.objectContaining({ name: "make", parameterCount: 1, parameterTypeNames: ["Local"], returnTypeName: "Local" })
      ])
    );
    expect(facts.cppFacts?.calls).toEqual([
      expect.objectContaining({ callKind: "member", receiverTypeName: "Box", referenceName: "memberHelper", argumentCount: 1 })
    ]);
    expect(facts.cppFacts?.instantiations).toEqual([
      expect.objectContaining({ typeName: "Local", argumentCount: 0 })
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "calls")).toEqual([]);
  });

  it.each([
    ["template", "template<typename T> T helper(T value) { return value; }\nint caller() { return helper(1); }"],
    ["macro", "#define helper() 0\nint helper() { return 1; }\nint caller() { return helper(); }"],
    ["conditional", "#ifdef FEATURE\nint helper() { return 1; }\n#endif\nint caller() { return helper(); }"],
    ["lambda escape", "int helper() { return 1; }\nint caller() { auto callback = []() { helper(); }; return 0; }"],
    ["malformed", "int caller( { return 0; }"]
  ])("fails closed for %s", (_description, sourceText) => {
    const facts = extractCppFileFacts({ filePath: "src/probe.cpp", language: "cpp", sourceText });
    expect(facts.edges.filter((edge) => ["imports", "calls", "instantiates", "accepts", "returns"].includes(edge.kind))).toEqual([]);
  });
});
