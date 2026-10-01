import { identifierTermGroups } from "../domain/identifier-search.js";
import type { SourceLexicalRetrieval } from "../domain/source-lexical.js";
import type { GraphEdge, SourceRange, SymbolNode } from "../domain/types.js";
import type { UnresolvedCallEvidence } from "./types.js";
import { EXPLORE_QUERY_LIMITS, EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT, planExploreQuery,
  type ExploreQueryGraph, type ExploreQueryPlan, type ExploreQuerySelection } from "./explore-query.js";

export const SOURCE_OPERATION_LIMITS = {
  maximumSymbols: 4096, maximumCandidates: 32, maximumCallsPerCandidate: 8, maximumWitnesses: 2
} as const;

export interface SourceOperationLead {
  readonly policy: "written-object-operation-v1";
  readonly scope: "selected-files-bounded-candidates";
  readonly state: "written-callee-source-lead";
  /** Written syntax only; the Object receiver and call targets remain unknown. */
  readonly calls: readonly GraphEdge[];
  readonly candidateCount: number;
  readonly candidatesTruncated: boolean;
  readonly callsTruncated: boolean;
}

export interface SourceOperationCandidates {
  readonly symbols: readonly SymbolNode[];
  readonly truncated: boolean;
}

const comparePosition = (a: SourceRange["start"], b: SourceRange["start"]) => a.line - b.line || a.column - b.column;
const validPosition = (point: SourceRange["start"]) => Number.isInteger(point.line) && point.line >= 1 &&
  Number.isInteger(point.column) && point.column >= 1;
const inside = (range: SourceRange, owner: SymbolNode) => validPosition(range.start) && validPosition(range.end) &&
  comparePosition(range.start, owner.range.start) >= 0 &&
  comparePosition(range.end, owner.range.end) <= 0 && comparePosition(range.end, range.start) > 0;
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Inspect unselected, independent callables in already selected files, only for bounded object/prototype questions. */
export function sourceOperationCandidates(graph: ExploreQueryGraph, plan: ExploreQueryPlan,
  sourceLexical?: SourceLexicalRetrieval, traversalTruncated = false): SourceOperationCandidates | undefined {
  const query = plan.query.slice(0, EXPLORE_QUERY_LIMITS.maximumQueryCharacters);
  const objectIntent = /\bprototypes?\b/iu.test(query) || /\bobjects?\b/iu.test(query) &&
    /\b(?:link(?:ed|s|ing)?|connect(?:ed|s|ing)?|circular|reciprocal|inheritance)\b/iu.test(query);
  if (!objectIntent || plan.selection.length === 0 || plan.fileHints.length > 0 || plan.identifierTerms.length < 2 ||
      sourceLexical?.state !== "searched" ||
      plan.selection.length >= EXPLORE_QUERY_LIMITS.maximumSymbols + EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT) return undefined;
  const selectedIds = new Set(plan.selection.map(item => item.symbol.id));
  const selectedFiles = new Set(plan.selection.filter(item => item.sourceRole.role === "production" && !item.generated.generated)
    .map(item => item.symbol.filePath));
  const sourceById = new Map(sourceLexical.candidates.map(candidate => [candidate.symbolId, candidate]));
  const seenIds = new Set<string>();
  const relevant = graph.symbols.slice(0, SOURCE_OPERATION_LIMITS.maximumSymbols).filter(symbol => {
    if (seenIds.has(symbol.id)) return false;
    seenIds.add(symbol.id);
    if (selectedIds.has(symbol.id) || !selectedFiles.has(symbol.filePath) ||
        !/\.(?:[cm]?js|jsx)$/iu.test(symbol.filePath) || !["function", "method"].includes(symbol.kind) ||
        plan.selection.some(item => item.symbol.filePath === symbol.filePath &&
          ["function", "method"].includes(item.symbol.kind) && inside(symbol.range, item.symbol))) return false;
    const terms = (sourceById.get(symbol.id)?.nonCommentMatches ?? []).filter(match =>
      match.lineContext !== "comment-prefixed" && match.filePath === symbol.filePath && inside(match.range, symbol) &&
      plan.identifierTerms.includes(match.term)).map(match => match.term);
    return identifierTermGroups(terms).length >= 2;
  }).sort((a, b) => compareText(a.filePath, b.filePath) || comparePosition(a.range.start, b.range.start) || compareText(a.id, b.id));
  if (relevant.length === 0) return undefined;
  return { symbols: relevant.slice(0, SOURCE_OPERATION_LIMITS.maximumCandidates),
    truncated: traversalTruncated || graph.symbols.length > SOURCE_OPERATION_LIMITS.maximumSymbols ||
      relevant.length > SOURCE_OPERATION_LIMITS.maximumCandidates };
}

/** Add one literal source lead, without changing existing focus order, scores or call resolution. */
export function supplementSourceOperations(graph: ExploreQueryGraph, plan: ExploreQueryPlan,
  sourceLexical: SourceLexicalRetrieval | undefined, inspected: SourceOperationCandidates,
  callsBySource: ReadonlyMap<string, UnresolvedCallEvidence>): ExploreQueryPlan {
  // Recheck scope at the boundary; callers cannot bypass limits or provide unrelated symbols.
  const eligible = sourceOperationCandidates(graph, plan, sourceLexical, inspected.truncated);
  if (eligible === undefined) return plan;
  const ids = new Set(inspected.symbols.slice(0, SOURCE_OPERATION_LIMITS.maximumCandidates).map(symbol => symbol.id));
  const symbols = eligible.symbols.filter(symbol => ids.has(symbol.id));
  const witnesses = new Map<string, GraphEdge[]>();
  let callsTruncated = false;
  for (const symbol of symbols) {
    const input = callsBySource.get(symbol.id);
    if (input?.state !== "available") continue;
    callsTruncated ||= input.truncated || input.items.length > SOURCE_OPERATION_LIMITS.maximumCallsPerCandidate;
    const seen = new Set<string>();
    const calls: GraphEdge[] = [];
    for (const edge of input.items.slice(0, SOURCE_OPERATION_LIMITS.maximumCallsPerCandidate)) {
      if (edge.sourceId !== symbol.id || edge.filePath !== symbol.filePath || edge.kind !== "calls" ||
          edge.resolution !== "unresolved" || edge.targetId !== null || edge.confidence !== 0 ||
          edge.referenceName !== "Object.setPrototypeOf" || edge.evidence?.stage !== "syntax" ||
          edge.evidence.ruleId !== "syntax.javascript.member-call.unknown-receiver" ||
          edge.evidence.candidateSymbolIds?.length !== 0 || !inside(edge.range, symbol) || seen.has(edge.id)) continue;
      seen.add(edge.id);
      calls.push(edge);
    }
    if (calls.length > 0) witnesses.set(symbol.id, calls);
  }
  if (witnesses.size === 0) return plan;
  const secondary = planExploreQuery({ ...graph, symbols: symbols.filter(symbol => witnesses.has(symbol.id)), edges: [] },
    plan.query, sourceLexical);
  const choices = secondary.selection.filter(item => item.sourceRole.role === "production" && !item.generated.generated);
  const item = choices[0];
  if (item === undefined) return plan;
  const calls = witnesses.get(item.symbol.id)!;
  const candidatesTruncated = eligible.truncated || inspected.symbols.length > SOURCE_OPERATION_LIMITS.maximumCandidates ||
    secondary.summary.truncated || choices.length > 1 ||
    symbols.some(symbol => callsBySource.get(symbol.id)?.state !== "available");
  const addition: ExploreQuerySelection = { ...item, rank: plan.selection.length + 1,
    reasons: [...item.reasons, "source-object-operation"], sourceOperationLead: {
      policy: "written-object-operation-v1", scope: "selected-files-bounded-candidates", state: "written-callee-source-lead",
      calls: calls.slice(0, SOURCE_OPERATION_LIMITS.maximumWitnesses), candidateCount: choices.length, candidatesTruncated,
      callsTruncated: callsTruncated || calls.length > SOURCE_OPERATION_LIMITS.maximumWitnesses
    } };
  const selection = [...plan.selection, addition];
  return { ...plan, selection, limits: { ...plan.limits,
    maximumSymbols: Math.max(plan.limits.maximumSymbols, selection.length),
    maximumSymbolsPerFile: Math.max(plan.limits.maximumSymbolsPerFile,
      selection.filter(entry => entry.symbol.filePath === item.symbol.filePath).length)
  }, summary: { ...plan.summary, selectedCount: selection.length,
    truncated: plan.summary.truncated || candidatesTruncated || callsTruncated } };
}
