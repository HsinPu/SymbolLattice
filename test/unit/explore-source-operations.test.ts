import { describe, expect, it } from "vitest";
import { planExploreQuery } from "../../src/application/explore-query.js";
import { sourceOperationCandidates, supplementSourceOperations, SOURCE_OPERATION_LIMITS } from "../../src/application/explore-source-operations.js";
import { SOURCE_LEXICAL_LIMITS, type SourceLexicalRetrieval } from "../../src/domain/source-lexical.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";
import type { UnresolvedCallEvidence } from "../../src/application/types.js";

const symbol = (id: string, line: number, filePath = "lib/app.js"): SymbolNode => ({
  id, name: id, qualifiedName: `${filePath}#${id}`, filePath, kind: "function", isExported: false,
  range: { start: { line, column: 1 }, end: { line: line + 9, column: 2 } }
});
function fixture() {
  const anchor = symbol("request_response_objects", 1), owner = symbol("handle", 20);
  const lexical: SourceLexicalRetrieval = { policy: "callable-source-lexical-v1", limits: SOURCE_LEXICAL_LIMITS,
    state: "searched", scannedFiles: 1, scannedSymbols: 2, scannedCharacters: 100, truncated: false,
    candidates: [anchor, owner].map(item => {
      const matches = ["request", "response"].map(term => ({ term, token: term, filePath: item.filePath,
        range: { start: { line: item.range.start.line + 1, column: 3 }, end: { line: item.range.start.line + 1, column: 11 } } }));
      return { symbolId: item.id, matches, nonCommentMatches: matches };
    }) };
  const graph = { symbols: [anchor, owner], edges: [] };
  const plan = planExploreQuery({ symbols: [anchor], edges: [] }, "request response objects linked", lexical);
  const edge: GraphEdge = { id: "call", sourceId: owner.id, targetId: null, filePath: owner.filePath,
    kind: "calls", resolution: "unresolved", confidence: 0, referenceName: "Object.setPrototypeOf",
    range: { start: { line: 22, column: 3 }, end: { line: 22, column: 24 } },
    evidence: { stage: "syntax", ruleId: "syntax.javascript.member-call.unknown-receiver", candidateSymbolIds: [] } };
  const calls = new Map<string, UnresolvedCallEvidence>([[owner.id, { state: "available", items: [edge], truncated: false }]]);
  const inspected = sourceOperationCandidates(graph, plan, lexical)!;
  return { anchor, owner, graph, plan, lexical, edge, calls, inspected };
}

describe("bounded written object operation leads", () => {
  it("appends independent source while preserving primary order, scores and unknown call targets", () => {
    const f = fixture(), result = supplementSourceOperations(f.graph, f.plan, f.lexical, f.inspected, f.calls);
    expect(result.selection.slice(0, f.plan.selection.length)).toEqual(f.plan.selection);
    expect(result.selection.at(-1)).toMatchObject({ symbol: f.owner, sourceOperationLead: {
      policy: "written-object-operation-v1", scope: "selected-files-bounded-candidates",
      state: "written-callee-source-lead", calls: [f.edge], candidateCount: 1, candidatesTruncated: false, callsTruncated: false
    } });
    expect(result.summary.selectedFileCount).toBe(f.plan.summary.selectedFileCount);
    expect(f.graph.edges).toEqual([]);
  });

  it("rejects borrowed owners, malformed sites, invented targets and non-syntax receipts", () => {
    const f = fixture();
    const changes: Partial<GraphEdge>[] = [{ sourceId: "other" }, { filePath: "other.js" }, { targetId: "guessed" },
      { confidence: 1 }, { resolution: "exact" }, { kind: "references" }, { referenceName: "Object.create" },
      { evidence: { ...f.edge.evidence!, stage: "lexical" } },
      { evidence: { ...f.edge.evidence!, ruleId: "other" } },
      { evidence: { ...f.edge.evidence!, candidateSymbolIds: ["guessed"] } },
      { range: { start: { line: 30, column: 1 }, end: { line: 30, column: 24 } } },
      { range: { start: { line: 22, column: 24 }, end: { line: 22, column: 3 } } },
      { range: { start: { line: 22, column: 0 }, end: { line: 22, column: 24 } } }];
    for (const change of changes) {
      const calls = new Map([[f.owner.id, { state: "available" as const, items: [{ ...f.edge, ...change }], truncated: false }]]);
      expect(supplementSourceOperations(f.graph, f.plan, f.lexical, f.inspected, calls)).toBe(f.plan);
    }
    for (const state of ["unavailable", "generation-mismatch"] as const)
      expect(supplementSourceOperations(f.graph, f.plan, f.lexical, f.inspected,
        new Map([[f.owner.id, { state, items: [f.edge], truncated: false }]]))).toBe(f.plan);
  });

  it("excludes nested repeats, other files and unsupported syntax without trusting supplied candidates", () => {
    const f = fixture(), nested = { ...symbol("nested", 2),
      range: { start: { line: 2, column: 1 }, end: { line: 4, column: 1 } } }, foreign = symbol("foreign", 40, "other.js");
    const graph = { ...f.graph, symbols: [nested, foreign, ...f.graph.symbols, f.owner] };
    const matches = f.lexical.candidates[1]!.matches.map(m => ({ ...m,
      range: { start: { line: 3, column: 3 }, end: { line: 3, column: 11 } } }));
    const lexical = { ...f.lexical, candidates: [...f.lexical.candidates,
      { symbolId: nested.id, matches, nonCommentMatches: matches }] };
    expect(sourceOperationCandidates(graph, f.plan, lexical)?.symbols).toEqual([f.owner]);
    expect(supplementSourceOperations(graph, f.plan, f.lexical, { symbols: [foreign], truncated: false }, f.calls)).toBe(f.plan);
    expect(sourceOperationCandidates({ ...f.graph, symbols: [{ ...f.owner, filePath: "lib/app.ts" }] }, f.plan, f.lexical)).toBeUndefined();
  });

  it("requires two own non-comment concepts and the last lexical record per symbol", () => {
    const f = fixture(), candidate = f.lexical.candidates[1]!;
    for (const matches of [[], candidate.nonCommentMatches!.slice(0, 1),
      candidate.nonCommentMatches!.map(m => ({ ...m, lineContext: "comment-prefixed" as const })),
      candidate.nonCommentMatches!.map(m => ({ ...m, filePath: "other.js" })),
      candidate.nonCommentMatches!.map(m => ({ ...m, range: f.anchor.range }))]) {
      const lexical = { ...f.lexical, candidates: [...f.lexical.candidates, { ...candidate, nonCommentMatches: matches }] };
      expect(sourceOperationCandidates(f.graph, f.plan, lexical)).toBeUndefined();
    }
    expect(sourceOperationCandidates(f.graph, f.plan, { ...f.lexical, state: "unavailable" })).toBeUndefined();
  });

  it("skips ordinary queries, explicit file queries and a full shared supplementary budget", () => {
    const f = fixture();
    for (const plan of [{ ...f.plan, query: "request response formatting" }, { ...f.plan, fileHints: ["app.js"] },
      { ...f.plan, selection: Array.from({ length: 9 }, () => f.plan.selection[0]!) }])
      expect(sourceOperationCandidates(f.graph, plan, f.lexical)).toBeUndefined();
  });

  it("bounds candidate and witness inspection and exposes omitted evidence", () => {
    const f = fixture();
    const owners = Array.from({ length: 34 }, (_, i) => symbol(`owner${i}`, 40 + i * 10));
    const lexical = { ...f.lexical, candidates: [...f.lexical.candidates, ...owners.map(owner => ({
      ...f.lexical.candidates[1]!, symbolId: owner.id, matches: f.lexical.candidates[1]!.matches.map(m => ({ ...m, range: owner.range })),
      nonCommentMatches: f.lexical.candidates[1]!.nonCommentMatches!.map(m => ({ ...m, range: owner.range }))
    }))] };
    const inspected = sourceOperationCandidates({ ...f.graph, symbols: [...f.graph.symbols, ...owners] }, f.plan, lexical)!;
    expect(inspected.symbols).toHaveLength(SOURCE_OPERATION_LIMITS.maximumCandidates);
    expect(inspected.truncated).toBe(true);
    const calls = new Map([[f.owner.id, { state: "available" as const, truncated: true,
      items: Array.from({ length: 10 }, (_, i) => ({ ...f.edge, id: `call${i}` })) }]]);
    const result = supplementSourceOperations(f.graph, f.plan, f.lexical, { ...f.inspected, truncated: true }, calls);
    expect(result.selection.at(-1)?.sourceOperationLead).toMatchObject({ callsTruncated: true, candidatesTruncated: true });
    expect(result.selection.at(-1)?.sourceOperationLead?.calls).toHaveLength(2);
    expect(result.summary.truncated).toBe(true);
    const beyond = { ...f.graph, symbols: [...Array.from({ length: 4096 }, (_, i) => symbol(`filler${i}`, 1, "other.js")), f.owner] };
    expect(sourceOperationCandidates(beyond, f.plan, f.lexical)).toBeUndefined();
  });
});
