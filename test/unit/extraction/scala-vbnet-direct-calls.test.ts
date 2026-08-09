import { describe, expect, it } from "vitest";

import { extractScalaFileFacts } from "../../../src/extraction/scala.js";
import { extractVbnetFileFacts } from "../../../src/extraction/vbnet.js";
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

describe("Scala and VB.NET canonical same-owner direct calls", () => {
  it("emits one exact Scala object-member zero-argument call with unique target evidence", () => {
    const facts = extractScalaFileFacts({
      filePath: "src/Smoke.scala",
      language: "scala",
      sourceText: `object Smoke {
  def ScalaEntry(): Int = ScalaHelper()
  def ScalaHelper(): Int = 1
}`
    });
    const caller = symbolByName(facts, "method", "ScalaEntry");
    const callee = symbolByName(facts, "method", "ScalaHelper");

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "ScalaHelper",
        evidence: {
          ruleId: "syntax.scala.canonical-object.unique-zero-argument-member-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("fails closed for Scala direct-call forms outside the canonical object shape", () => {
    const sources = [
      ["overload", `object Smoke {\n  def ScalaEntry(): Int = ScalaHelper()\n  def ScalaHelper(): Int = 1\n  def ScalaHelper(value: Int): Int = value\n}`],
      ["default", `object Smoke {\n  def ScalaEntry(): Int = ScalaHelper()\n  def ScalaHelper(value: Int = 1): Int = value\n}`],
      ["implicit", `object Smoke {\n  implicit def ScalaHelper(): Int = 1\n  def ScalaEntry(): Int = ScalaHelper()\n}`],
      ["extension", `object Smoke {\n  extension (value: Int) def ScalaHelper(): Int = value\n  def ScalaEntry(): Int = ScalaHelper()\n}`],
      ["import", `object Smoke {\n  import foreign.ScalaHelper\n  def ScalaEntry(): Int = ScalaHelper()\n  def ScalaHelper(): Int = 1\n}`],
      ["inheritance", `object Smoke extends Base {\n  def ScalaEntry(): Int = ScalaHelper()\n  def ScalaHelper(): Int = 1\n}`],
      ["shadow", `object Smoke {\n  def ScalaEntry(): Int = { val ScalaHelper = () => 1; ScalaHelper() }\n  def ScalaHelper(): Int = 1\n}`],
      ["member", `object Smoke {\n  def ScalaEntry(): Int = holder.ScalaHelper()\n  def ScalaHelper(): Int = 1\n}`],
      ["qualified", `object Smoke {\n  def ScalaEntry(): Int = Smoke.ScalaHelper()\n  def ScalaHelper(): Int = 1\n}`],
      ["nested", `object Smoke {\n  def ScalaEntry(): Int = { def ScalaHelper(): Int = 1; ScalaHelper() }\n  def ScalaHelper(): Int = 1\n}`],
      ["cross-file-compatible", `object Smoke {\n  def ScalaEntry(): Int = ScalaHelper()\n}`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractScalaFileFacts({ filePath: "src/Smoke.scala", language: "scala", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("emits one exact VB.NET module-method zero-argument call with unique target evidence", () => {
    const facts = extractVbnetFileFacts({
      filePath: "src/Smoke.vb",
      language: "vbnet",
      sourceText: `Module Smoke
    Function VbEntry() As Integer
        Return VbHelper()
    End Function

    Function VbHelper() As Integer
        Return 1
    End Function
End Module`
    });
    const caller = symbolByName(facts, "method", "VbEntry");
    const callee = symbolByName(facts, "method", "VbHelper");

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "VbHelper",
        range: {
          start: { line: 3, column: 16 },
          end: { line: 3, column: 26 }
        },
        evidence: {
          ruleId: "syntax.vbnet.canonical-module.unique-zero-argument-method-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("fails closed for VB.NET direct-call forms outside the canonical module shape", () => {
    const sources = [
      ["overload", `Module Smoke\n    Function VbEntry() As Integer\n        Return VbHelper()\n    End Function\n    Function VbHelper() As Integer\n        Return 1\n    End Function\n    Function VbHelper(value As Integer) As Integer\n        Return value\n    End Function\nEnd Module`],
      ["default", `Module Smoke\n    Function VbEntry() As Integer\n        Return VbHelper()\n    End Function\n    Function VbHelper(Optional value As Integer = 1) As Integer\n        Return value\n    End Function\nEnd Module`],
      ["import", `Imports Foreign\nModule Smoke\n    Function VbEntry() As Integer\n        Return VbHelper()\n    End Function\n    Function VbHelper() As Integer\n        Return 1\n    End Function\nEnd Module`],
      ["shadow", `Module Smoke\n    Function VbEntry() As Integer\n        Dim VbHelper As Func(Of Integer) = Function() 1\n        Return VbHelper()\n    End Function\n    Function VbHelper() As Integer\n        Return 1\n    End Function\nEnd Module`],
      ["member", `Module Smoke\n    Function VbEntry() As Integer\n        Return holder.VbHelper()\n    End Function\n    Function VbHelper() As Integer\n        Return 1\n    End Function\nEnd Module`],
      ["qualified", `Module Smoke\n    Function VbEntry() As Integer\n        Return Smoke.VbHelper()\n    End Function\n    Function VbHelper() As Integer\n        Return 1\n    End Function\nEnd Module`],
      ["nested", `Module Smoke\n    Function VbEntry() As Integer\n        Function VbHelper() As Integer\n            Return 1\n        End Function\n        Return VbHelper()\n    End Function\n    Function VbHelper() As Integer\n        Return 1\n    End Function\nEnd Module`],
      ["partial", `Partial Module Smoke\n    Function VbEntry() As Integer\n        Return VbHelper()\n    End Function\n    Function VbHelper() As Integer\n        Return 1\n    End Function\nEnd Module`],
      ["cross-file-compatible", `Module Smoke\n    Function VbEntry() As Integer\n        Return VbHelper()\n    End Function\nEnd Module`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractVbnetFileFacts({ filePath: "src/Smoke.vb", language: "vbnet", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });
});
