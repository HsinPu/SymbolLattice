import { describe, expect, it } from "vitest";
import { planExploreQuery } from "../../src/application/explore-query.js";
import { supplementExploreNameFollowups } from "../../src/application/explore-name-followups.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";
import type { UnresolvedCallEvidence } from "../../src/application/types.js";

const symbol = (id: string, name: string, filePath = `${id}.py`): SymbolNode => ({
  id, name, qualifiedName: `${filePath}#${name}`, filePath, kind: "function", isExported: false,
  range: { start: { line: 1, column: 1 }, end: { line: 10, column: 1 } }
});
function fixture() {
  const owners = [symbol("first", "error_handler_first"), symbol("second", "error_handler_second")];
  const target = symbol("target", "resolve_error_handler");
  const plan = planExploreQuery({ symbols: owners, edges: [] }, "error handler");
  const edges: GraphEdge[] = owners.map(owner => ({
    id: `call:${owner.id}`, sourceId: owner.id, targetId: null, kind: "calls", filePath: owner.filePath,
    referenceName: "resolver.resolve_error_handler", resolution: "unresolved", confidence: 0,
    range: { start: { line: 3, column: 1 }, end: { line: 3, column: 31 } }
  }));
  const calls = new Map<string, UnresolvedCallEvidence>(owners.map((owner, index) => [owner.id, {
    state: "available", items: [edges[index]!], truncated: false
  }]));
  return { graph: { symbols: [...owners, target], edges: [] }, plan, calls, edges, target };
}

describe("unresolved name follow-up evidence", () => {
  it("adds a bounded lexical lead with both source receipts, without creating an edge", () => {
    const { graph, plan, calls, edges, target } = fixture();
    const next = supplementExploreNameFollowups(graph, plan, calls);
    expect(next.selection.slice(0, 2)).toEqual(plan.selection);
    expect(next.selection[2]).toMatchObject({ symbol: target, rank: 3, nameFollowup: {
      state: "unresolved-name-match", scope: "bounded-candidates", matchingDeclarationCount: 1, calls: edges
    }, connectionScore: 0, graphExpansion: { state: "lexical" } });
    expect(graph.edges).toEqual([]);
    expect(next.selection[2]!.nameFollowup!.calls.every(edge => edge.targetId === null)).toBe(true);
    expect(next.summary.selectedFileCount).toBe(3);
    expect(next.nameFollowupSearch).toMatchObject({ state: "searched", emittedCount: 1 });
  });

  it("does not turn repeated calls from one file into independent corroboration", () => {
    const { graph, plan, calls, edges } = fixture();
    calls.set("second", { state: "available", items: [edges[0]!, edges[0]!], truncated: false });
    expect(supplementExploreNameFollowups(graph, plan, calls).selection).toEqual(plan.selection);
  });

  it.each(["unavailable", "generation-mismatch"] as const)("does not use %s evidence", state => {
    const { graph, plan, calls, edges } = fixture();
    calls.set("second", { state, items: [edges[1]!], truncated: false });
    const result = supplementExploreNameFollowups(graph, plan, calls);
    expect(result.selection).toEqual(plan.selection);
    expect(result.nameFollowupSearch?.state).toBe(state);
  });

  it("rejects invalid ownership, resolved targets, wrong kinds and out-of-owner ranges", () => {
    for (const change of [{ targetId: "target" }, { resolution: "exact" as const },
      { kind: "instantiates" as const }, { filePath: "different.py" },
      { range: { start: { line: 11, column: 1 }, end: { line: 11, column: 31 } } }]) {
      const { graph, plan, calls, edges } = fixture();
      calls.set("second", { state: "available", items: [{ ...edges[1]!, ...change }], truncated: false });
      expect(supplementExploreNameFollowups(graph, plan, calls).selection).toEqual(plan.selection);
    }
  });

  it("discloses same-name alternatives and never matches a partial declaration name", () => {
    const { graph, plan, calls } = fixture();
    graph.symbols.push(symbol("other", "resolve_error_handler"), symbol("partial", "resolve_error_handler_async"));
    const result = supplementExploreNameFollowups(graph, plan, calls);
    expect(result.selection).toHaveLength(3);
    expect(result.selection[2]!.nameFollowup?.matchingDeclarationCount).toBe(2);
    expect(result.nameFollowupSearch).toMatchObject({ candidateCount: 2, candidatesTruncated: true });
  });

  it("respects the call budget and discloses omitted call sites", () => {
    const { graph, plan, calls, edges } = fixture();
    calls.set("second", { state: "available", items: [
      ...Array.from({ length: 8 }, (_, i) => ({ ...edges[1]!, id: `irrelevant:${i}`, referenceName: "other.name" })), edges[1]!
    ], truncated: false });
    const result = supplementExploreNameFollowups(graph, plan, calls);
    expect(result.selection).toEqual(plan.selection);
    expect(result.nameFollowupSearch?.callsTruncated).toBe(true);
  });

  it("bounds declaration inspection even for a legacy full graph", () => {
    const { graph, plan, calls, target } = fixture();
    graph.symbols = [...graph.symbols.slice(0, 2),
      ...Array.from({ length: 4094 }, (_, i) => symbol(`filler${i}`, "unrelated")), target];
    const result = supplementExploreNameFollowups(graph, plan, calls);
    expect(result.selection).toEqual(plan.selection);
    expect(result.nameFollowupSearch?.candidatesTruncated).toBe(true);
  });
});
