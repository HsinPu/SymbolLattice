import { describe, expect, it } from "vitest";

import { extractCsharpFileFacts } from "../../../src/extraction/csharp.js";
import { extractKotlinFileFacts } from "../../../src/extraction/kotlin.js";
import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";

function symbolByName(facts: ArtifactFacts, kind: SymbolNode["kind"], name: string): SymbolNode {
  const matches = facts.symbols.filter((symbol) => symbol.kind === kind && symbol.name === name);
  expect(matches).toHaveLength(1);
  const symbol = matches[0];
  if (symbol === undefined) {
    throw new Error(`Missing ${kind} ${name}.`);
  }
  return symbol;
}

function calls(facts: ArtifactFacts) {
  return facts.edges.filter((edge) => edge.kind === "calls");
}

describe("C# and Kotlin bounded same-file direct calls", () => {
  it("emits one exact C# same-static-class method call with unique target evidence", () => {
    const facts = extractCsharpFileFacts({
      filePath: "src/Smoke.cs",
      language: "csharp",
      sourceText: `public static class Smoke
{
    public static int CsharpEntry() => CsharpHelper();
    private static int CsharpHelper() => 1;
}`
    });
    const caller = symbolByName(facts, "method", "CsharpEntry");
    const callee = symbolByName(facts, "method", "CsharpHelper");

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "CsharpHelper",
        evidence: {
          ruleId: "syntax.csharp.same-file.unique-static-class-method-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("fails closed for ambiguous C# direct-call forms", () => {
    const sources = [
      ["parameter", `public static class Smoke { public static int Entry(System.Func<int> CsharpHelper) => CsharpHelper(); public static int CsharpHelper() => 1; }`],
      ["local", `public static class Smoke { public static int Entry() { System.Func<int> CsharpHelper = () => 1; return CsharpHelper(); } public static int CsharpHelper() => 1; }`],
      ["tuple deconstruction", `public static class Smoke { public static int Entry() { var (CsharpHelper, other) = (1, 2); return CsharpHelper(); } public static int CsharpHelper() => 1; }`],
      ["pattern", `public static class Smoke { public static int Entry(object value) { if (value is int CsharpHelper) return CsharpHelper(); return 0; } public static int CsharpHelper() => 1; }`],
      ["local function", `public static class Smoke { public static int Entry() { int CsharpHelper() => 1; return CsharpHelper(); } public static int CsharpHelper() => 1; }`],
      ["lambda", `public static class Smoke { public static int Entry() { System.Func<int> callback = () => CsharpHelper(); return callback(); } public static int CsharpHelper() => 1; }`],
      ["using static", `using static Foreign; public static class Smoke { public static int Entry() => CsharpHelper(); public static int CsharpHelper() => 1; }`],
      ["using alias", `using Alias = Foreign; public static class Smoke { public static int Entry() => CsharpHelper(); public static int CsharpHelper() => 1; }`],
      ["member", `public static class Smoke { public static int Entry() => Other.CsharpHelper(); public static int CsharpHelper() => 1; }`],
      ["qualified", `public static class Smoke { public static int Entry() => global::Smoke.CsharpHelper(); public static int CsharpHelper() => 1; }`],
      ["generic", `public static class Smoke { public static int Entry() => CsharpHelper<int>(); public static int CsharpHelper() => 1; }`],
      ["dynamic", `public static class Smoke { public static int Entry() { dynamic CsharpHelper = () => 1; return CsharpHelper(); } public static int CsharpHelper() => 1; }`],
      ["overload", `public static class Smoke { public static int Entry() => CsharpHelper(); public static int CsharpHelper() => 1; public static int CsharpHelper(int value) => value; }`],
      ["partial static class", `public static partial class Smoke { public static int Entry() => CsharpHelper(); public static int CsharpHelper() => 1; } public static partial class Smoke { public static int CsharpHelper(int value) => value; }`],
      ["partial static class may extend across files", `public static partial class Smoke { public static int Entry() => CsharpHelper(); public static int CsharpHelper() => 1; }`],
      ["other class", `public static class Smoke { public static int Entry() => CsharpHelper(); } public static class Other { public static int CsharpHelper() => 1; }`],
      ["missing argument", `public static class Smoke { public static int Entry() => CsharpHelper(); public static int CsharpHelper(int value) => value; }`],
      ["extra argument", `public static class Smoke { public static int Entry() => CsharpHelper(1); public static int CsharpHelper() => 1; }`],
      ["conditional call", `public static class Smoke { public static int CsharpHelper() => 1; public static int Entry() {\n#if FEATURE\nreturn CsharpHelper();\n#else\nreturn 0;\n#endif\n} }`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractCsharpFileFacts({ filePath: "src/Smoke.cs", language: "csharp", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("retains exact C# calls when bounded argument counts match", () => {
    const facts = extractCsharpFileFacts({
      filePath: "src/Smoke.cs",
      language: "csharp",
      sourceText: `public static class Smoke { public static int Entry() => CsharpHelper(1); public static int CsharpHelper(int value) => value; }`
    });

    expect(calls(facts)).toHaveLength(1);
  });

  it("emits one exact Kotlin zero-argument top-level function call with unique target evidence", () => {
    const facts = extractKotlinFileFacts({
      filePath: "src/Smoke.kt",
      language: "kotlin",
      sourceText: `fun kotlinEntry(): Int = kotlinHelper()

fun kotlinHelper(): Int = 1`
    });
    const caller = symbolByName(facts, "function", "kotlinEntry");
    const callee = symbolByName(facts, "function", "kotlinHelper");

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "kotlinHelper",
        evidence: {
          ruleId: "syntax.kotlin.same-file.unique-top-level-function-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("fails closed for ambiguous Kotlin direct-call forms", () => {
    const sources = [
      ["parameter", `fun kotlinEntry(kotlinHelper: () -> Int): Int = kotlinHelper()\nfun kotlinHelper(): Int = 1`],
      ["local", `fun kotlinEntry(): Int { val kotlinHelper = { 1 }; return kotlinHelper() }\nfun kotlinHelper(): Int = 1`],
      ["destructuring", `fun kotlinEntry(): Int { val (kotlinHelper, other) = Pair({ 1 }, 2); return kotlinHelper() }\nfun kotlinHelper(): Int = 1`],
      ["loop", `fun kotlinEntry(values: List<() -> Int>): Int { for (kotlinHelper in values) return kotlinHelper(); return 0 }\nfun kotlinHelper(): Int = 1`],
      ["catch", `fun kotlinEntry(): Int { try { error(\"x\") } catch (kotlinHelper: Exception) { return kotlinHelper() } }\nfun kotlinHelper(): Int = 1`],
      ["local function", `fun kotlinEntry(): Int { fun kotlinHelper(): Int = 1; return kotlinHelper() }\nfun kotlinHelper(): Int = 1`],
      ["lambda", `fun kotlinEntry(): Int { val callback = { kotlinHelper() }; return callback() }\nfun kotlinHelper(): Int = 1`],
      ["direct import", `import foreign.kotlinHelper\nfun kotlinEntry(): Int = kotlinHelper()\nfun kotlinHelper(): Int = 1`],
      ["import alias", `import foreign.kotlinHelper as externalHelper\nfun kotlinEntry(): Int = kotlinHelper()\nfun kotlinHelper(): Int = 1`],
      ["star import", `import foreign.*\nfun kotlinEntry(): Int = kotlinHelper()\nfun kotlinHelper(): Int = 1`],
      ["package", `package smoke\nfun kotlinEntry(): Int = kotlinHelper()\nfun kotlinHelper(): Int = 1`],
      ["member", `fun kotlinEntry(holder: Holder): Int = holder.kotlinHelper()\nfun kotlinHelper(): Int = 1`],
      ["safe call", `fun kotlinEntry(holder: Holder?): Int? = holder?.kotlinHelper()\nfun kotlinHelper(): Int = 1`],
      ["callable reference", `fun kotlinEntry(): () -> Int = ::kotlinHelper\nfun kotlinHelper(): Int = 1`],
      ["default-package cross-file-compatible overload", `fun kotlinEntry(): Int = kotlinHelper()\nfun kotlinHelper(value: Int): Int = value`],
      ["nonzero argument", `fun kotlinEntry(): Int = kotlinHelper(1)\nfun kotlinHelper(value: Int): Int = value`],
      ["default target", `fun kotlinEntry(): Int = kotlinHelper()\nfun kotlinHelper(value: Int = 0): Int = value`],
      ["overload default", `fun kotlinEntry(): Int = kotlinHelper()\nfun kotlinHelper(): Int = 1\nfun kotlinHelper(value: Int = 0): Int = value`],
      ["extension", `fun kotlinEntry(): Int = kotlinHelper()\nfun kotlinHelper(): Int = 1\nfun String.kotlinHelper(): Int = length`],
      ["type constructor", `class kotlinHelper(val value: Int)\nfun kotlinHelper(value: Int): Int = kotlinHelper(1)`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractKotlinFileFacts({ filePath: "src/Smoke.kt", language: "kotlin", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });
});
