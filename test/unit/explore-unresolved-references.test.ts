import { describe, expect, it } from "vitest";
import { withMemberReferenceDeclarationLeads } from "../../src/application/explore-unresolved-references.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";

describe("non-call declaration candidates", () => {
  const owner: SymbolNode = { id: "owner", name: "run", qualifiedName: "a.py#Box.run", kind: "method",
    filePath: "a.py", range: { start: { line: 2, column: 5 }, end: { line: 3, column: 25 } },
    isExported: false, declarationOrdinal: 0 };
  const declaration: SymbolNode = { ...owner, id: "value", name: "value", qualifiedName: "a.py#Box.value" };
  const reference: GraphEdge = { id: "ref", sourceId: "owner", targetId: null, kind: "references",
    filePath: "a.py", range: { start: { line: 3, column: 12 }, end: { line: 3, column: 22 } },
    referenceName: "self.value", resolution: "unresolved", confidence: 0,
    evidence: { ruleId: "syntax.python.member-reference.unknown-receiver", stage: "syntax", candidateSymbolIds: [] } };
  const evidence = { state: "available" as const, items: [reference], truncated: false };
  const map = new Map([[declaration.qualifiedName, [declaration]]]);

  it("rejects ambiguity, other receivers, calls and mismatched declaration source", () => {
    expect(withMemberReferenceDeclarationLeads(evidence, owner,
      new Map([[declaration.qualifiedName, [declaration, { ...declaration, id: "duplicate" }]]]), () => "def value(self):"))
      .toEqual(evidence);
    expect(withMemberReferenceDeclarationLeads(evidence, owner, map, () => "def another(self):")).toEqual(evidence);
    for (const edge of [{ ...reference, referenceName: "obj.value" }, { ...reference, kind: "calls" as const },
      { ...reference, targetId: "value" }, { ...reference, sourceId: "other" }]) {
      const input = { ...evidence, items: [edge] };
      expect(withMemberReferenceDeclarationLeads(input, owner, map, () => "def value(self):")).toEqual(input);
    }
  });

  it("retains the unresolved edge and bounds declaration source without changing the evidence object", () => {
    const text = "def value(self): #" + "x".repeat(300);
    const actual = withMemberReferenceDeclarationLeads(evidence, owner, map, () => text);
    expect(actual.items).toBe(evidence.items);
    expect(actual.sameClassDeclarationLeads?.items[0]?.declarationLine).toEqual({
      line: 2, text: text.slice(0, 256), truncated: true
    });
    expect(evidence).not.toHaveProperty("sameClassDeclarationLeads");
    expect(actual.items[0]?.targetId).toBeNull();
  });
});
