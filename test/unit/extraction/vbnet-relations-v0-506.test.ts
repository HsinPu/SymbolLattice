import { describe, expect, it } from "vitest";

import { extractVbnetFileFacts } from "../../../src/extraction/vbnet.js";

function calls(sourceText: string) {
  return extractVbnetFileFacts({ filePath: "src/Worker.vb", language: "vbnet", sourceText })
    .edges.filter((edge) => edge.kind === "calls");
}

describe("VB.NET relations v0.506", () => {
  it("links every fixed-arity bare call to one private method in the same class", () => {
    const edges = calls(`Imports System
Public Class Worker
    Public Function Run(value As Integer) As Integer
        Record(value, "first")
        Return Record(Nested(value, 1), "second")
    End Function
    Private Function Record(value As Integer, label As String) As Integer
        Return value
    End Function
End Class`);
    expect(edges).toHaveLength(2);
    expect(edges).toEqual(edges.map((edge) => expect.objectContaining({
      referenceName: "Record",
      resolution: "exact",
      confidence: 1,
      evidence: expect.objectContaining({
        ruleId: "syntax.vbnet.same-container.unique-private-fixed-arity-method-call",
        candidateSymbolIds: expect.any(Array)
      })
    })));
    expect(edges.every((edge) => edge.evidence.candidateSymbolIds.length === 1)).toBe(true);
  });

  it("supports a private self-recursive module method", () => {
    expect(calls(`Module Worker
    Private Function Count(value As Integer) As Integer
        If value = 0 Then Return 0
        Return Count(value - 1)
    End Function
End Module`)).toEqual([
      expect.objectContaining({ referenceName: "Count", resolution: "exact", confidence: 1 })
    ]);
  });

  it("keeps ambiguous and dynamic VB.NET call surfaces unresolved", () => {
    const sources = [
      `Class C\n Function Entry(x As Integer) As Integer\n Return Helper(x)\n End Function\n Friend Function Helper(x As Integer) As Integer\n Return x\n End Function\nEnd Class`,
      `Class C\n Function Entry(x As Integer) As Integer\n Return Helper(x)\n End Function\n Private Function Helper(x As Integer) As Integer\n Return x\n End Function\n Private Function Helper(x As String) As Integer\n Return 0\n End Function\nEnd Class`,
      `Class C\n Function Entry(Helper As Func(Of Integer, Integer)) As Integer\n Return Helper(1)\n End Function\n Private Function Helper(x As Integer) As Integer\n Return x\n End Function\nEnd Class`,
      `Class C\n Function Entry(other As C) As Integer\n Return other.Helper(1)\n End Function\n Private Function Helper(x As Integer) As Integer\n Return x\n End Function\nEnd Class`,
      `Class C\n Shared Function Entry() As Integer\n Return Helper()\n End Function\n Private Function Helper() As Integer\n Return 1\n End Function\nEnd Class`,
      `Partial Class C\n Function Entry() As Integer\n Return Helper()\n End Function\n Private Function Helper() As Integer\n Return 1\n End Function\nEnd Class`,
      `Class C\n Function Entry() As Integer\n Dim value = Function() Helper()\n Return 0\n End Function\n Private Function Helper() As Integer\n Return 1\n End Function\nEnd Class`,
      `Class C\n Function Entry() As Integer\n Return Helper(1, 2)\n End Function\n Private Function Helper(x As Integer) As Integer\n Return x\n End Function\nEnd Class`,
      `Class C\n Function Entry() As Integer\n Return Helper()\n End Function\n Private Function Helper() As Integer`
    ];
    for (const sourceText of sources) expect(calls(sourceText), sourceText).toEqual([]);
  });
});
