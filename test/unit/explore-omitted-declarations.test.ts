import { describe, expect, it } from "vitest";
import { planExploreQuery } from "../../src/application/explore-query.js";
import { supplementOmittedCallDeclarations } from "../../src/application/explore-omitted-declarations.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";
import type { UnresolvedCallEvidence } from "../../src/application/types.js";
import { classifySourceRole } from "../../src/domain/source-roles.js";

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
  it("emits a complete selected-file ambiguity group without choosing a call target", () => {
    const f = fixture();
    const sibling = { ...f.declaration, id: "wrapper", kind: "function" as const, filePath: f.owner.filePath };
    const graph = { ...f.graph, symbols: [f.owner, f.context] };
    const lookup = { names: [f.declaration.name], projection: { generationMatched: true,
      declarations: [f.declaration, sibling], truncated: false } };
    const next = supplementOmittedCallDeclarations(graph, f.plan, f.calls, true, lookup);
    expect(next.selection.slice(0, f.plan.selection.length)).toEqual(f.plan.selection);
    const additions = next.selection.slice(f.plan.selection.length);
    expect(additions.map(item => item.symbol.id)).toEqual([f.declaration.id, sibling.id]);
    for (const item of additions) {
      expect(item.omittedQueryDeclaration).toMatchObject({ scope: "selected-files-index",
        matchingDeclarationCount: 2, matchingDeclarationIds: [f.declaration.id, sibling.id], call: f.call });
      expect(item.score).toBe(0);
      expect(item.graphDiffusion.rankingContribution).toBe(0);
    }
    expect(f.call).toMatchObject({ targetId: null, resolution: "unresolved", confidence: 0 });
    expect(next.omittedDeclarationSearch).toMatchObject({ candidateCount: 2, emittedCount: 2 });
    expect(next.limits.maximumSymbols).toBe(10);
    for (const projection of [
      { ...lookup.projection, truncated: true }, { ...lookup.projection, generationMatched: false },
      { ...lookup.projection, declarations: [f.declaration, { ...sibling, id: f.declaration.id }] },
      { ...lookup.projection, declarations: [f.declaration, sibling, { ...sibling, id: "third" }] }
    ]) {
      expect(supplementOmittedCallDeclarations(graph, f.plan, f.calls, true, { ...lookup, projection }).selection).toEqual(f.plan.selection);
    }
  });

  it("does not partially emit an ambiguous group when a sibling is ineligible or capacity is occupied", () => {
    const f = fixture();
    const sibling = { ...f.declaration, id: "second" };
    const graph = { ...f.graph, symbols: [f.owner, f.context] };
    const lookup = { names: [f.declaration.name], projection: { generationMatched: true,
      declarations: [f.declaration, sibling], truncated: false } };
    const selected = { ...f.plan, selection: [...f.plan.selection, { ...f.plan.selection[0]!, symbol: sibling }] };
    const selectedCalls = new Map(f.calls); selectedCalls.set(sibling.id, { state: "available", items: [], truncated: false });
    expect(supplementOmittedCallDeclarations(graph, selected, selectedCalls, true, lookup).selection).toEqual(selected.selection);
    const testFile = "tests/base.py";
    const withTestFile = { ...f.plan, selection: f.plan.selection.map(item => item.symbol.id === f.context.id ?
      { ...item, symbol: { ...item.symbol, filePath: testFile } } : item) };
    const ineligible = { ...lookup, projection: { ...lookup.projection, declarations: [
      { ...f.declaration, filePath: f.owner.filePath }, { ...sibling, filePath: testFile }
    ] } };
    expect(supplementOmittedCallDeclarations({ ...graph, files: [{ path: testFile, sourceRole: classifySourceRole(testFile) }] },
      withTestFile, f.calls, true, ineligible).selection).toEqual(withTestFile.selection);
    const full = { ...f.plan, selection: [...f.plan.selection,
      ...Array.from({ length: 7 }, (_, i) => ({ ...f.plan.selection[0]!, symbol: node(`slot:${i}`, "other", "src/slots.py") }))] };
    const calls = new Map(full.selection.map(item => [item.symbol.id,
      { state: "available" as const, items: item.symbol.id === f.owner.id ? [f.call] : [], truncated: false }]));
    const exhausted = supplementOmittedCallDeclarations(graph, full, calls, true, lookup);
    expect(exhausted.selection).toEqual(full.selection);
    expect(exhausted.omittedDeclarationSearch).toMatchObject({ candidateCount: 2, emittedCount: 0, candidatesTruncated: true });
  });

  it("fits a complete pair at ten total focuses and four in one file", () => {
    const f = fixture();
    const sibling = { ...f.declaration, id: "second" };
    const full = { ...f.plan, selection: [...f.plan.selection,
      ...Array.from({ length: 6 }, (_, i) => ({ ...f.plan.selection[0]!,
        symbol: node(`slot:${i}`, "other", i === 0 ? f.context.filePath : `src/slot${i}.py`) }))] };
    const calls = new Map(full.selection.map(item => [item.symbol.id,
      { state: "available" as const, items: item.symbol.id === f.owner.id ? [f.call] : [], truncated: false }]));
    const next = supplementOmittedCallDeclarations({ ...f.graph, symbols: [f.owner, f.context] }, full, calls, true,
      { names: [f.declaration.name], projection: { generationMatched: true, truncated: false, declarations: [f.declaration, sibling] } });
    expect(next.selection).toHaveLength(10);
    expect(next.selection.filter(item => item.symbol.filePath === f.context.filePath)).toHaveLength(4);
    expect(next.selection.slice(0, 8)).toEqual(full.selection);
  });

  it("supplements a missing graph declaration only from a complete matching-generation selected-file projection", () => {
    const f = fixture();
    const graph = { ...f.graph, symbols: [f.owner, f.context] };
    const names = [f.declaration.name];
    const projection = { generationMatched: true, declarations: [f.declaration], truncated: false };
    const next = supplementOmittedCallDeclarations(graph, f.plan, f.calls, true, { names, projection });
    expect(next.selection.at(-1)?.omittedQueryDeclaration?.scope).toBe("selected-files-index");
    expect(next.selection.at(-1)?.symbol).toEqual(f.declaration);
    expect(supplementOmittedCallDeclarations({ ...graph, symbols: [] }, f.plan, f.calls, true,
      { names, projection }).selection).toEqual(next.selection);
    expect(next.omittedDeclarationSearch?.selectedFileLookup).toMatchObject({ state: "available", names,
      filePaths: expect.arrayContaining([f.owner.filePath, f.context.filePath]) });
    expect(next.omittedDeclarationSearch?.selectedFileLookup?.filePaths).toHaveLength(2);
    for (const changed of [{ ...projection, generationMatched: false }, { ...projection, truncated: true },
      { ...projection, declarations: [{ ...f.declaration, filePath: "src/outside.py" }] }]) {
      expect(supplementOmittedCallDeclarations(graph, f.plan, f.calls, true,
        { names, projection: changed }).selection).toEqual(f.plan.selection);
    }
    expect(supplementOmittedCallDeclarations(graph, f.plan, f.calls, true, { names }).selection).toEqual(f.plan.selection);
  });

  it("preserves upstream graph truncation even below the local declaration limit and with no candidate", () => {
    const f = fixture();
    const incomplete = { ...f.graph, symbols: [f.owner, f.context] };
    const next = supplementOmittedCallDeclarations(incomplete, f.plan, f.calls, true);
    expect(next.selection).toEqual(f.plan.selection);
    expect(next.omittedDeclarationSearch).toMatchObject({ state: "searched", candidateCount: 0,
      emittedCount: 0, candidatesTruncated: true });
    expect(supplementOmittedCallDeclarations(incomplete, f.plan, f.calls).omittedDeclarationSearch?.candidatesTruncated).toBe(false);
    const available = supplementOmittedCallDeclarations(f.graph, f.plan, f.calls, true);
    expect(available.selection).toEqual(supplementOmittedCallDeclarations(f.graph, f.plan, f.calls).selection);
    expect(available.omittedDeclarationSearch?.candidatesTruncated).toBe(true);
  });

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
