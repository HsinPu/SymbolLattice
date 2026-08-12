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
      "extern int target(void);",
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

  it("requires C calls to satisfy the normalized definition and prototype arity", () => {
    const cases = [
      [
        "zero argument call to one argument target",
        [
          "int target(int value) { return value; }",
          "int caller(void) { return target(); }"
        ].join("\n"),
        0
      ],
      [
        "one argument call to one argument target",
        [
          "int target(int value) { return value; }",
          "int caller(void) { return target(1); }"
        ].join("\n"),
        1
      ],
      [
        "one argument call to two argument target",
        [
          "int target(int left, int right) { return left + right; }",
          "int caller(void) { return target(1); }"
        ].join("\n"),
        0
      ],
      [
        "two argument call to two argument target",
        [
          "int target(int left, int right) { return left + right; }",
          "int caller(void) { return target(1, 2); }"
        ].join("\n"),
        1
      ],
      [
        "void parameter list accepts no arguments",
        [
          "void target(void) {}",
          "int caller(void) { target(); return 0; }"
        ].join("\n"),
        1
      ],
      [
        "old-style empty parameter list is unspecified",
        [
          "int target() { return 0; }",
          "int caller(void) { return target(); }"
        ].join("\n"),
        0
      ],
      [
        "variadic target accepts its known minimum",
        [
          "int target(int first, ...) { return first; }",
          "int caller(void) { return target(1, 2); }"
        ].join("\n"),
        1
      ],
      [
        "variadic target rejects calls below its known minimum",
        [
          "int target(int first, ...) { return first; }",
          "int caller(void) { return target(); }"
        ].join("\n"),
        0
      ]
    ] as const;

    for (const [description, sourceText, count] of cases) {
      expect(callsFor("c", sourceText), description).toHaveLength(count);
    }
  });

  it("fails closed for C conditional target, caller, and callsite code without suppressing unrelated balanced conditionals", () => {
    const unsafeSources = [
      ["disabled target", "#if 0\nint target(void) { return 0; }\n#endif\nint caller(void) { return target(); }"],
      ["conditional target", "#ifdef FEATURE\nint target(void) { return 0; }\n#endif\nint caller(void) { return target(); }"],
      ["disabled caller", "int target(void) { return 0; }\n#if 0\nint caller(void) { return target(); }\n#endif"],
      ["conditional callsite", "int target(void) { return 0; }\nint caller(void) {\n#ifdef FEATURE\n  return target();\n#endif\n  return 0;\n}"],
      ["conditional prototype", "#ifdef FEATURE\nint target(void);\n#endif\nint target(void) { return 0; }\nint caller(void) { return target(); }"],
      ["conditional target macro", "#ifdef FEATURE\n#define target() 0\n#endif\nint target(void) { return 0; }\nint caller(void) { return target(); }"],
      ["included translation unit", "#include \"foreign.h\"\nint target(void) { return 0; }\nint caller(void) { return target(); }"],
      ["unbalanced conditional", "#if 1\nint target(void) { return 0; }\nint caller(void) { return target(); }"]
    ] as const;

    for (const [description, sourceText] of unsafeSources) {
      expect(callsFor("c", sourceText), description).toEqual([]);
    }

    const unrelatedConditional = [
      "#if 0",
      "int unrelated(void) { return 0; }",
      "#endif",
      "int target(void) { return 0; }",
      "int caller(void) { return target(); }"
    ].join("\n");
    expect(callsFor("c", unrelatedConditional)).toHaveLength(1);
  });

  it("keeps C static functions non-exported", () => {
    const sourceText = "static int target(void) { return 0; }";
    const facts = factsFor("c", sourceText);
    const target = facts.symbols.find((symbol) => symbol.kind === "function" && symbol.name === "target");

    expect(target).toMatchObject({ isExported: false });
  });

  it("fails closed for C ordinary-namespace enum enumerators and macro-expanded arguments", () => {
    const enumEnumerator = [
      "int target(void) { return 0; }",
      "int caller(void) { enum E { target = 1 }; return target(); }"
    ].join("\n");
    const macroArgument = [
      "#define PAIR 1,2",
      "int target(int left, int right) { return left + right; }",
      "int caller(void) { return target(PAIR); }"
    ].join("\n");

    expect(callsFor("c", enumEnumerator)).toEqual([]);
    expect(callsFor("c", macroArgument)).toEqual([]);
  });

  it("fails closed for C directives preceded by same-line block comments", () => {
    const conditional = [
      "/*a*/ #if 0",
      "int target(void) { return 0; }",
      "#endif",
      "int caller(void) { return target(); }"
    ].join("\n");
    const macro = [
      "/*lead*/ #define target() 0",
      "int target(void) { return 0; }",
      "int caller(void) { return target(); }"
    ].join("\n");

    expect(callsFor("c", conditional)).toEqual([]);
    expect(callsFor("c", macro)).toEqual([]);
  });

  it("keeps comment text from changing C linkage and inherits a prior static prototype", () => {
    const commentOnly = "/* static */ int target(void) { return 0; }";
    const inheritedStatic = [
      "static int target(void);",
      "int target(void) { return 0; }"
    ].join("\n");

    expect(factsFor("c", commentOnly).symbols.find((symbol) => symbol.name === "target"))
      .toMatchObject({ isExported: true });
    expect(factsFor("c", inheritedStatic).symbols.find((symbol) => symbol.name === "target"))
      .toMatchObject({ isExported: false });
  });

  it("rejects C++ calls contained in a lambda body", () => {
    const sourceText = [
      "int target() { return 0; }",
      "int caller() { auto callback = []() { target(); }; return 0; }"
    ].join("\n");

    expect(functionId("cpp", sourceText, "caller")).toBeDefined();
    expect(callsFor("cpp", sourceText)).toEqual([]);
  });

  it("fails closed for C++ preprocessing, enum enumerator shadows, and arity mismatches", () => {
    const unsafeSources = [
      ["disabled target", "#if 0\nint target() { return 0; }\n#endif\nint caller() { return target(); }"],
      ["conditional callsite", "int target() { return 0; }\nint caller() {\n#if FEATURE\nreturn target();\n#endif\nreturn 0;\n}"],
      ["unproven include", "#include \"foreign.h\"\nint target() { return 0; }\nint caller() { return target(); }"],
      ["macro-expanded argument", "#define PAIR 1,2\nint target(int left, int right) { return left + right; }\nint caller() { return target(PAIR); }"],
      ["enumerator shadow", "int target() { return 0; }\nint caller() { enum E { target = 1 }; return target(); }"],
      ["missing argument", "int target(int value) { return value; }\nint caller() { return target(); }"],
      ["extra argument", "int target() { return 0; }\nint caller() { return target(1); }"]
    ] as const;

    for (const [description, sourceText] of unsafeSources) {
      expect(functionId("cpp", sourceText, "caller"), description).toBeDefined();
      expect(callsFor("cpp", sourceText), description).toEqual([]);
    }
  });

  it("retains exact C++ calls when bounded argument counts match", () => {
    const sourceText = [
      "int target(int value) { return value; }",
      "int caller() { return target(1); }"
    ].join("\n");

    expect(callsFor("cpp", sourceText)).toHaveLength(1);
  });
});
