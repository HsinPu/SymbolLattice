import { describe, expect, it } from "vitest";
import { planExploreQuery } from "../../src/application/explore-query.js";
import { supplementIncomingCallers } from "../../src/application/explore-incoming-callers.js";
import { SOURCE_LEXICAL_LIMITS, type SourceLexicalRetrieval } from "../../src/domain/source-lexical.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";

const symbol = (id: string, name: string, filePath = `${id}.js`): SymbolNode => ({
  id, name, qualifiedName: `${filePath}#${name}`, filePath, kind: "function", isExported: false,
  range: { start: { line: 1, column: 1 }, end: { line: 10, column: 1 } }
});
function fixture() {
  const anchor = symbol("anchor", "getResponseSerializer"), caller = symbol("caller", "serialize");
  const lexical: SourceLexicalRetrieval = { policy: "callable-source-lexical-v1", limits: SOURCE_LEXICAL_LIMITS,
    state: "searched", scannedFiles: 2, scannedSymbols: 2, scannedCharacters: 80, truncated: false,
    candidates: [anchor, caller].map(item => ({ symbolId: item.id, matches: ["response", "serializer"].map(term => ({
      term, token: term, filePath: item.filePath, range: { start: { line: 2, column: 1 }, end: { line: 2, column: 12 } }
    })) })) };
  const edge: GraphEdge = { id: "call", sourceId: caller.id, targetId: anchor.id, filePath: caller.filePath,
    kind: "calls", resolution: "exact", confidence: 1,
    range: { start: { line: 3, column: 1 }, end: { line: 3, column: 20 } },
    evidence: { ruleId: "module.commonjs-object-call", stage: "module", candidateSymbolIds: [anchor.id],
      resolutionPath: [caller.filePath, anchor.filePath] } };
  const graph = { symbols: [anchor, caller], edges: [edge] };
  const plan = planExploreQuery({ symbols: [anchor], edges: [] }, "response serializer", lexical);
  return { anchor, caller, lexical, edge, graph, plan };
}

describe("bounded exact module caller supplementation", () => {
  it("preserves primary focuses and supplies the original static call witness", () => {
    const { graph, plan, lexical, caller, edge } = fixture();
    const result = supplementIncomingCallers(graph, plan, lexical);
    expect(result.selection.slice(0, plan.selection.length)).toEqual(plan.selection);
    expect(result.selection.at(-1)).toMatchObject({ symbol: caller, incomingCallWitness: {
      policy: "exact-module-call-caller-v1", scope: "returned-bounded-graph", edges: [edge], candidateCount: 1
    } });
    expect(graph.edges).toEqual([edge]);
    expect(result.summary.selectedFileCount).toBe(2);
  });

  it("rejects unresolved, heuristic, lexical, ambiguous and malformed source evidence", () => {
    const { graph, plan, lexical, edge } = fixture();
    const changes: Partial<GraphEdge>[] = [{ resolution: "unresolved", targetId: null },
      { resolution: "heuristic" }, { confidence: 0.9 }, { kind: "references" }, { filePath: "wrong.js" },
      { evidence: { ...edge.evidence!, stage: "lexical" } },
      { evidence: { ...edge.evidence!, candidateSymbolIds: ["anchor", "other"] } },
      { evidence: { ...edge.evidence!, resolutionPath: ["wrong.js", "anchor.js"] } },
      { range: { start: { line: 11, column: 1 }, end: { line: 11, column: 20 } } },
      { range: { start: { line: 3, column: 20 }, end: { line: 3, column: 1 } } }];
    for (const change of changes) expect(supplementIncomingCallers({ ...graph, edges: [{ ...edge, ...change }] }, plan, lexical).selection).toEqual(plan.selection);
  });

  it("requires query relevance, callable targets, and cross-file ownership", () => {
    const { graph, plan, lexical } = fixture();
    expect(supplementIncomingCallers(graph, plan).selection).toEqual(plan.selection);
    expect(supplementIncomingCallers({ ...graph, symbols: graph.symbols.slice(0, 1) }, plan, lexical).selection).toEqual(plan.selection);
    expect(supplementIncomingCallers({ ...graph, symbols: graph.symbols.map(item => ({ ...item, kind: "variable" })) }, plan, lexical).selection).toEqual(plan.selection);
    expect(supplementIncomingCallers({ ...graph, symbols: graph.symbols.map(item => ({ ...item, filePath: "same.js" })) }, plan, lexical).selection).toEqual(plan.selection);
  });

  it("respects explicit files and the shared supplementary focus ceiling", () => {
    const { graph, plan, lexical } = fixture();
    expect(supplementIncomingCallers(graph, { ...plan, fileHints: ["caller.js"] }, lexical).selection).toEqual(plan.selection);
    const full = { ...plan, selection: Array.from({ length: 9 }, () => plan.selection[0]!) };
    expect(supplementIncomingCallers(graph, full, lexical)).toBe(full);
  });

  it("discloses bounded alternatives, traversal omissions and witness truncation", () => {
    const { graph, plan, lexical, caller, edge } = fixture();
    const other = symbol("other", caller.name);
    const multiple = { ...graph, symbols: [...graph.symbols, other], edges: [...graph.edges,
      { ...edge, id: "othercall", sourceId: other.id, filePath: other.filePath,
        evidence: { ...edge.evidence!, resolutionPath: [other.filePath, "anchor.js"] } }] };
    const evidence = supplementIncomingCallers(multiple, plan, { ...lexical, candidates: [...lexical.candidates,
      { ...lexical.candidates[1]!, symbolId: other.id }] }).selection.at(-1)?.incomingCallWitness;
    expect(evidence).toMatchObject({ candidateCount: 2, candidatesTruncated: true });
    expect(supplementIncomingCallers(graph, plan, lexical, true).selection.at(-1)?.incomingCallWitness?.candidatesTruncated).toBe(true);
    const many = supplementIncomingCallers({ ...graph, edges: Array.from({ length: 10 }, (_, i) => ({ ...edge, id: `call${i}` })) }, plan, lexical);
    expect(many.selection.at(-1)?.incomingCallWitness?.edges).toHaveLength(8);
    expect(many.selection.at(-1)?.incomingCallWitness?.witnessesTruncated).toBe(true);
  });
});
