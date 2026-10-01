import type { GraphEdge, SourceRange } from "../domain/types.js";
import type { SourceLexicalRetrieval } from "../domain/source-lexical.js";
import { EXPLORE_QUERY_LIMITS, EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT, planExploreQuery,
  type ExploreQueryGraph, type ExploreQueryPlan, type ExploreQuerySelection } from "./explore-query.js";

export const INCOMING_CALLER_LIMITS = { maximumSymbols: 4096, maximumEdges: 16384, maximumWitnesses: 8 } as const;

export interface IncomingCallWitness {
  readonly policy: "exact-module-call-caller-v1";
  readonly scope: "returned-bounded-graph";
  readonly edges: readonly GraphEdge[];
  /** Ranked eligible candidates in the bounded secondary plan, not repository-wide uniqueness. */
  readonly candidateCount: number;
  readonly candidatesTruncated: boolean;
  readonly witnessesTruncated: boolean;
}

const nameReasons = new Set(["exact-symbol-term", "qualified-symbol-term", "partial-symbol-term", "lexical-symbol-variant"]);
const relevant = (item: ExploreQuerySelection) => item.sourceRole.role === "production" && !item.generated.generated &&
  ["function", "method"].includes(item.symbol.kind) && (item.sourceMatches?.length ?? 0) >= 2 &&
  item.reasons.some(reason => nameReasons.has(reason));
const compare = (a: SourceRange["start"], b: SourceRange["start"]) => a.line - b.line || a.column - b.column;

/** Supplement a query-relevant caller using existing exact static module evidence. Does not infer runtime dispatch. */
export function supplementIncomingCallers(graph: ExploreQueryGraph, plan: ExploreQueryPlan,
  sourceLexical?: SourceLexicalRetrieval, traversalTruncated = false): ExploreQueryPlan {
  if (plan.fileHints.length > 0 || plan.identifierTerms.length < 2 ||
      plan.selection.length >= EXPLORE_QUERY_LIMITS.maximumSymbols + EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT) return plan;
  const anchors = new Set(plan.selection.slice(0, 2).filter(relevant).map(item => item.symbol.id));
  if (anchors.size === 0) return plan;
  const symbols = graph.symbols.slice(0, INCOMING_CALLER_LIMITS.maximumSymbols);
  // Filter on edge-local facts before allocating a symbol lookup. Preserve the
  // original bounded edge order and validate ownership/path/ranges below.
  const eligibleEdges = graph.edges.slice(0, INCOMING_CALLER_LIMITS.maximumEdges).filter(edge =>
    edge.targetId !== null && anchors.has(edge.targetId) && edge.kind === "calls" &&
    edge.resolution === "exact" && edge.confidence === 1 && edge.evidence?.stage === "module");
  if (eligibleEdges.length === 0) return plan;
  const neededIds = new Set(eligibleEdges.flatMap(edge => [edge.sourceId, edge.targetId]));
  const byId = new Map(symbols.filter(symbol => neededIds.has(symbol.id)).map(symbol => [symbol.id, symbol]));
  const selected = new Set(plan.selection.map(item => item.symbol.id));
  const byCaller = new Map<string, GraphEdge[]>();
  const seen = new Set<string>();
  for (const edge of eligibleEdges) {
    const owner = byId.get(edge.sourceId), target = edge.targetId === null ? undefined : byId.get(edge.targetId);
    if (owner === undefined || target === undefined || selected.has(owner.id) || !anchors.has(target.id) ||
        !["function", "method"].includes(owner.kind) || owner.filePath === target.filePath ||
        edge.kind !== "calls" || edge.resolution !== "exact" || edge.confidence !== 1 ||
        edge.filePath !== owner.filePath || edge.evidence?.stage !== "module" ||
        edge.evidence.candidateSymbolIds?.length !== 1 || edge.evidence.candidateSymbolIds[0] !== target.id ||
        edge.evidence.resolutionPath?.length !== 2 || edge.evidence.resolutionPath[0] !== owner.filePath ||
        edge.evidence.resolutionPath[1] !== target.filePath || compare(edge.range.start, owner.range.start) < 0 ||
        compare(edge.range.end, owner.range.end) > 0 || compare(edge.range.end, edge.range.start) <= 0 || seen.has(edge.id)) continue;
    seen.add(edge.id);
    const edges = byCaller.get(owner.id) ?? [];
    edges.push(edge);
    byCaller.set(owner.id, edges);
  }
  if (byCaller.size === 0) return plan;
  // The planner uses the last source candidate per ID. With fewer than two
  // supplied matches no caller can satisfy relevant(), so ranking cannot add
  // a focus. Otherwise retain every candidate and the original ranking rules.
  const sourceById = new Map((sourceLexical?.candidates ?? []).map(candidate => [candidate.symbolId, candidate]));
  if (![...byCaller.keys()].some(id => (sourceById.get(id)?.matches.length ?? 0) >= 2)) return plan;
  const secondary = planExploreQuery({ ...graph, symbols: symbols.filter(symbol => byCaller.has(symbol.id)), edges: [] }, plan.query, sourceLexical);
  const choices = secondary.selection.filter(relevant);
  const item = choices[0];
  if (item === undefined) return plan;
  const edges = byCaller.get(item.symbol.id)!;
  const candidatesTruncated = traversalTruncated || graph.symbols.length > symbols.length ||
    graph.edges.length > INCOMING_CALLER_LIMITS.maximumEdges || secondary.summary.truncated || choices.length > 1;
  const addition: ExploreQuerySelection = { ...item, rank: plan.selection.length + 1,
    reasons: [...item.reasons, "exact-module-call-caller"], incomingCallWitness: {
      policy: "exact-module-call-caller-v1", scope: "returned-bounded-graph",
      edges: edges.slice(0, INCOMING_CALLER_LIMITS.maximumWitnesses), candidateCount: choices.length,
      candidatesTruncated, witnessesTruncated: edges.length > INCOMING_CALLER_LIMITS.maximumWitnesses
    } };
  const selection = [...plan.selection, addition];
  return { ...plan, selection, limits: { ...plan.limits,
    maximumSymbols: Math.max(plan.limits.maximumSymbols, selection.length),
    maximumSymbolsPerFile: Math.max(plan.limits.maximumSymbolsPerFile, selection.filter(entry => entry.symbol.filePath === item.symbol.filePath).length),
    maximumFiles: plan.limits.maximumFiles + (plan.selection.some(entry => entry.symbol.filePath === item.symbol.filePath) ? 0 : 1)
  }, summary: { ...plan.summary, selectedCount: selection.length,
    selectedFileCount: new Set(selection.map(entry => entry.symbol.filePath)).size,
    truncated: plan.summary.truncated || candidatesTruncated } };
}
