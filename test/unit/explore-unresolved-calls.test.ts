import { describe, expect, it } from "vitest";
import {
  selectQueryUnresolvedCalls,
  withSameClassDeclarationLeads
} from "../../src/application/explore-unresolved-calls.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";

describe("query-selected unresolved call evidence", () => {
  it("uses a written property before call/apply/bind as a lexical hint without changing targets", () => {
    const calls: GraphEdge[] = ["ns.noise0", "ns.noise1", "ns.rejectDependency.call"].map((referenceName, index) => ({
      id: `js:${index}`, sourceId: "owner", targetId: null, kind: "calls", filePath: "calls.js",
      referenceName, resolution: "unresolved", confidence: 0,
      range: { start: { line: index + 1, column: 1 }, end: { line: index + 1, column: 30 } },
      evidence: { ruleId: "syntax.javascript.member-call.unknown-receiver", stage: "syntax", candidateSymbolIds: [] }
    }));
    const actual = selectQueryUnresolvedCalls({ state: "available", items: calls, truncated: false }, ["reject"], 2);
    expect(actual.items).toEqual([calls[0], calls[2]]);
    expect(actual.items[1]?.targetId).toBeNull();
    expect(calls[2]?.referenceName).toBe("ns.rejectDependency.call");
  });
  it("keeps a name-followup origin even when later names have stronger query overlap", () => {
    const calls: GraphEdge[] = ["resolver.resolve_error_handler",
      ...Array<string>(8).fill("resolver.default_error_view")].map((referenceName, index) => ({
      id: `call:${index}`, sourceId: "owner", targetId: null, kind: "calls",
      filePath: "owner.py", referenceName, resolution: "unresolved", confidence: 0,
      range: { start: { line: index + 2, column: 5 }, end: { line: index + 2, column: 30 } }
    }));
    const selected = selectQueryUnresolvedCalls({ state: "available", items: calls, truncated: false },
      ["default", "error", "view"], 8, new Set([calls[0]!.id]));
    expect(selected.truncated).toBe(true);
    expect(selected.items).toHaveLength(8);
    expect(selected.items).toContainEqual(calls[0]);
    expect(selected.items.map((edge) => edge.range.start.line))
      .toEqual([...selected.items.map((edge) => edge.range.start.line)].sort((a, b) => a - b));
  });
});

describe("bounded Python same-class declaration leads", () => {
  const owner: SymbolNode = {
    id: "run", name: "run", qualifiedName: "pkg/service.py#Service.run",
    kind: "method", filePath: "pkg/service.py",
    range: { start: { line: 9, column: 5 }, end: { line: 13, column: 24 } },
    isExported: false, declarationOrdinal: 0
  };
  const declaration: SymbolNode = {
    ...owner, id: "helper", name: "helper", qualifiedName: "pkg/service.py#Service.helper",
    range: { start: { line: 3, column: 5 }, end: { line: 5, column: 16 } }
  };
  const call = (id: string, referenceName = "self.helper"): GraphEdge => ({
    id, sourceId: owner.id, targetId: null, kind: "calls", filePath: owner.filePath,
    range: { start: { line: 10, column: 16 }, end: { line: 10, column: 27 } },
    referenceName, resolution: "unresolved", confidence: 0,
    evidence: { ruleId: "syntax.python.member-call.unknown-receiver", stage: "syntax",
      candidateSymbolIds: [] }
  });

  it("cites a persisted declaration without resolving the written call", () => {
    const evidence = { state: "available" as const,
      items: [call("first"), call("second"), call("third")], truncated: false };
    const actual = withSameClassDeclarationLeads(evidence, owner,
      new Map([[declaration.qualifiedName, [declaration]]]), () => "    def helper(self):", ["helper"]);
    expect(actual.items).toEqual(evidence.items);
    expect(actual.sameClassDeclarationLeads).toEqual({
      policy: "bounded-python-same-class-declarations-v1",
      scope: "returned-bounded-graph",
      items: ["first", "second"].map((edgeId) => ({
        edgeId, declaration,
        declarationLine: { line: 3, text: "    def helper(self):", truncated: false }
      })),
      omittedCount: 1
    });
  });

  it("keeps the query-matching declaration when the lead bound is reached", () => {
    const names = ["_savepoint_allowed", "validate_thread_sharing", "_savepoint_rollback"];
    const declarations = names.map((name, index): SymbolNode => ({
      ...declaration, id: name, name, qualifiedName: `pkg/service.py#Service.${name}`,
      range: { start: { line: index + 3, column: 5 }, end: { line: index + 3, column: 20 } }
    }));
    const indexed = new Map(declarations.map((item) => [item.qualifiedName, [item]]));
    const evidence = { state: "available" as const,
      items: names.map((name, index) => call(`call-${index}`, `self.${name}`)), truncated: false };
    const actual = withSameClassDeclarationLeads(evidence, owner, indexed,
      (item) => `    def ${item.name}(self):`, ["savepoint", "rollback"]);
    expect(actual.sameClassDeclarationLeads?.items.map((item) => item.declaration.name))
      .toEqual(["_savepoint_rollback", "_savepoint_allowed"]);
    expect(actual.sameClassDeclarationLeads?.omittedCount).toBe(1);
  });

  it("does not invent leads for another receiver, ambiguity, unavailable evidence, or mismatched source", () => {
    const available = { state: "available" as const,
      items: [call("other", "obj.helper")], truncated: false };
    const indexed = new Map([[declaration.qualifiedName, [declaration]]]);
    expect(withSameClassDeclarationLeads(available, owner, indexed, () => "    def helper(self):", ["helper"]))
      .toEqual(available);
    const selfCall = { ...available, items: [call("self")] };
    expect(withSameClassDeclarationLeads(selfCall, owner,
      new Map([[declaration.qualifiedName, [declaration, { ...declaration, id: "other" }]]]),
      () => "    def helper(self):", ["helper"])).toEqual(selfCall);
    expect(withSameClassDeclarationLeads(selfCall, owner, indexed,
      () => "    def another(self):", ["helper"])).toEqual(selfCall);
    const unavailable = { ...selfCall, state: "generation-mismatch" as const };
    expect(withSameClassDeclarationLeads(unavailable, owner, indexed,
      () => "    def helper(self):", ["helper"])).toEqual(unavailable);
  });
});
