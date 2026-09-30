import { describe, expect, it } from "vitest";
import { planExploreQuery } from "../../src/application/explore-query.js";
import { supplementOmittedCallDeclarations } from "../../src/application/explore-omitted-declarations.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";
import type { UnresolvedCallEvidence } from "../../src/application/types.js";

const node = (id: string, name: string, filePath: string): SymbolNode => ({
  id, name, filePath, qualifiedName: `${filePath}#${name}`, kind: "method", isExported: false,
  range: { start: { line: 1, column: 1 }, end: { line: 10, column: 1 } }
});
function fixture(tail = "checking constraints") {
  const owner = node("owner", "alpha", "src/restore.py"), context = node("context", "bravo", "src/base.py");
  const declaration = node("declaration", "constraint_checks_disabled", "src/base.py");
  const graph = { symbols: [owner, context, declaration], edges: [] };
  const plan = planExploreQuery({ ...graph, symbols: [owner, context] },
    `alpha bravo charlie delta echo foxtrot golf hotel ${tail}`);
  const call: GraphEdge = { id: "written", sourceId: owner.id, targetId: null, kind: "calls",
    filePath: owner.filePath, referenceName: "connection.constraint_checks_disabled",
    resolution: "unresolved", confidence: 0,
    range: { start: { line: 3, column: 1 }, end: { line: 3, column: 38 } } };
  const calls = new Map<string, UnresolvedCallEvidence>([
    [owner.id, { state: "available", items: [call], truncated: false }],
    [context.id, { state: "available", items: [], truncated: false }]
  ]);
  return { owner, context, declaration, graph, plan, call, calls };
}

describe("declaration leads for omitted query concepts", () => {
  it("keeps primary rank and unresolved certainty while supplementing an already selected file", () => {
    const f = fixture();
    const next = supplementOmittedCallDeclarations(f.graph, f.plan, f.calls);
    expect(next.selection.slice(0, f.plan.selection.length)).toEqual(f.plan.selection);
    expect(next.selection.at(-1)).toMatchObject({ symbol: f.declaration, score: 0, baseScore: 0,
      matchedTerms: [], sourceMatches: [], omittedQueryDeclaration: {
        state: "unresolved-name-candidate", scope: "inspected-bounded-graph", matchingDeclarationCount: 1,
        matchedOmittedTerms: ["checking", "constraints"], call: f.call } });
    expect(next.selection.at(-1)?.graphDiffusion.rankingContribution).toBe(0);
    expect(next.identifierTerms).toEqual(f.plan.identifierTerms);
    expect(next.limits).toMatchObject({ maximumSymbols: 9, maximumSymbolsPerFile: 3,
      maximumFiles: f.plan.limits.maximumFiles });
    expect(f.call.targetId).toBeNull();
    expect(f.graph.edges).toEqual([]);
  });

  it("requires two distinct omitted concepts, not two inflections of the same concept", () => {
    for (const tail of ["checking checks", "checking unrelated", "unrelated words"]) {
      const f = fixture(tail);
      expect(supplementOmittedCallDeclarations(f.graph, f.plan, f.calls).selection).toEqual(f.plan.selection);
    }
  });

  it("does not treat a same name as repository-wide uniqueness or search an unselected file", () => {
    const ambiguous = fixture();
    ambiguous.graph.symbols.push({ ...ambiguous.declaration, id: "alternative", filePath: "src/other.py" });
    expect(supplementOmittedCallDeclarations(ambiguous.graph, ambiguous.plan, ambiguous.calls).selection).toEqual(ambiguous.plan.selection);
    const outside = fixture();
    outside.graph.symbols[2] = { ...outside.declaration, filePath: "src/other.py" };
    expect(supplementOmittedCallDeclarations(outside.graph, outside.plan, outside.calls).selection).toEqual(outside.plan.selection);
  });

  it.each(["unavailable", "generation-mismatch"] as const)("rejects %s evidence", state => {
    const f = fixture();
    f.calls.set(f.owner.id, { state, items: [f.call], truncated: false });
    const next = supplementOmittedCallDeclarations(f.graph, f.plan, f.calls);
    expect(next.selection).toEqual(f.plan.selection);
    expect(next.omittedDeclarationSearch?.state).toBe(state);
  });

  it("rejects fabricated ownership, certainty, names and out-of-owner ranges", () => {
    for (const change of [{ sourceId: "other" }, { filePath: "src/other.py" }, { confidence: 0.5 },
      { targetId: "declaration" }, { resolution: "exact" as const }, { kind: "imports" as const },
      { referenceName: "connection.constraint_checks_disabled_extra" },
      { range: { start: { line: 20, column: 1 }, end: { line: 20, column: 38 } } }]) {
      const f = fixture();
      f.calls.set(f.owner.id, { state: "available", items: [{ ...f.call, ...change }], truncated: false });
      expect(supplementOmittedCallDeclarations(f.graph, f.plan, f.calls).selection).toEqual(f.plan.selection);
    }
  });

  it("does not exceed the primary focus, per-file, call and declaration bounds", () => {
    const full = fixture();
    const filled = { ...full.plan, selection: [...full.plan.selection,
      ...Array.from({ length: 6 }, (_, i) => ({ ...full.plan.selection[0]!,
        symbol: node(`slot:${i}`, "unrelated", `src/slot${i}.py`) }))] };
    const calls = new Map(filled.selection.map(item => [item.symbol.id,
      { state: "available" as const, items: item.symbol.id === full.owner.id ? [full.call] : [], truncated: false }]));
    const supplemented = supplementOmittedCallDeclarations(full.graph, filled, calls);
    expect(supplemented.selection).toHaveLength(9);
    const occupied = { ...filled, selection: [...filled.selection, { ...filled.selection[0]!,
      symbol: node("reserved", "unrelated", "src/reserved.py"),
      nameFollowup: { state: "unresolved-name-match" as const, scope: "bounded-candidates" as const,
        matchingDeclarationCount: 1, calls: [] } }] };
    const exhausted = supplementOmittedCallDeclarations(full.graph, occupied, calls);
    expect(exhausted.selection).toEqual(occupied.selection);
    expect(exhausted.omittedDeclarationSearch).toMatchObject({ candidateCount: 1, emittedCount: 0, candidatesTruncated: true });
    const crowded = fixture();
    const crowdedPlan = { ...crowded.plan, selection: [...crowded.plan.selection,
      ...["another", "third"].map(id => ({ ...crowded.plan.selection.find(item => item.symbol.id === crowded.context.id)!,
        symbol: node(id, "other", crowded.context.filePath) }))] };
    crowded.calls.set("another", { state: "available", items: [], truncated: false });
    crowded.calls.set("third", { state: "available", items: [], truncated: false });
    expect(supplementOmittedCallDeclarations(crowded.graph, crowdedPlan, crowded.calls).selection).toEqual(crowdedPlan.selection);
    const late = fixture();
    late.calls.set(late.owner.id, { state: "available", items: [
      ...Array.from({ length: 8 }, (_, i) => ({ ...late.call, id: `other:${i}`, referenceName: "other" })), late.call
    ], truncated: false });
    const next = supplementOmittedCallDeclarations(late.graph, late.plan, late.calls);
    expect(next.selection).toEqual(late.plan.selection);
    expect(next.omittedDeclarationSearch?.callsTruncated).toBe(true);
    const outside = fixture();
    outside.graph.symbols = [outside.owner, outside.context,
      ...Array.from({ length: 4094 }, (_, i) => node(`filler:${i}`, "other", "src/filler.py")), outside.declaration];
    const bounded = supplementOmittedCallDeclarations(outside.graph, outside.plan, outside.calls);
    expect(bounded.selection).toEqual(outside.plan.selection);
    expect(bounded.omittedDeclarationSearch?.candidatesTruncated).toBe(true);
  });
});
