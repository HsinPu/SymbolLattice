import type { GraphEdge } from "../domain/types.js";
import type { SourceLexicalRetrieval } from "../domain/source-lexical.js";
import type { UnresolvedCallEvidence } from "./types.js";
import { EXPLORE_QUERY_LIMITS, planExploreQuery, type ExploreQueryGraph, type ExploreQueryPlan } from "./explore-query.js";

export const EXPLORE_NAME_FOLLOWUP_LIMITS = {
  maximumCallsPerFocus: 8, minimumSourceFiles: 2, maximumAdditionalFiles: 1, maximumAdditionalSymbols: 1,
  maximumCandidateSymbols: 4096
} as const;

export interface ExploreNameFollowup {
  readonly state: "unresolved-name-match";
  readonly scope: "bounded-candidates";
  /** Count within the supplied graph, never a repository-wide uniqueness claim. */
  readonly matchingDeclarationCount: number;
  readonly calls: readonly GraphEdge[];
}

export interface ExploreNameFollowupSearch {
  readonly policy: "unresolved-name-followup-v1";
  readonly scope: "bounded-candidates";
  readonly state: "searched" | "unavailable" | "generation-mismatch";
  readonly limits: typeof EXPLORE_NAME_FOLLOWUP_LIMITS;
  readonly candidateCount: number;
  readonly emittedCount: number;
  readonly callsTruncated: boolean;
  readonly candidatesTruncated: boolean;
}

/** Additional lexical leads. Never changes edges, resolution or graph scores. */
export function supplementExploreNameFollowups(
  graph: ExploreQueryGraph,
  plan: ExploreQueryPlan,
  callsBySource: ReadonlyMap<string, UnresolvedCallEvidence>,
  sourceLexical?: SourceLexicalRetrieval
): ExploreQueryPlan {
  const limits = EXPLORE_NAME_FOLLOWUP_LIMITS;
  const inputs = plan.selection.map(item => callsBySource.get(item.symbol.id));
  const state = inputs.some(input => input?.state === "generation-mismatch") ? "generation-mismatch"
    : inputs.some(input => input?.state !== "available") ? "unavailable" : "searched";
  const receipt: ExploreNameFollowupSearch = {
    policy: "unresolved-name-followup-v1", scope: "bounded-candidates", state, limits,
    candidateCount: 0, emittedCount: 0,
    callsTruncated: inputs.some(input => input?.truncated || (input?.items.length ?? 0) > limits.maximumCallsPerFocus),
    candidatesTruncated: graph.symbols.length > limits.maximumCandidateSymbols
  };
  if (state !== "searched" || plan.fileHints.length > 0 || plan.identifierTerms.length < 2) {
    return { ...plan, nameFollowupSearch: receipt };
  }
  const byName = new Map<string, GraphEdge[]>();
  const comparePosition = (a: GraphEdge["range"]["start"], b: GraphEdge["range"]["start"]) => a.line - b.line || a.column - b.column;
  const seen = new Set<string>();
  for (const { symbol } of plan.selection) {
    for (const edge of (callsBySource.get(symbol.id)?.items ?? []).slice(0, limits.maximumCallsPerFocus)) {
      if (edge.sourceId !== symbol.id || edge.filePath !== symbol.filePath || edge.kind !== "calls" ||
          edge.resolution !== "unresolved" || edge.targetId !== null || seen.has(edge.id) ||
          comparePosition(edge.range.start, symbol.range.start) < 0 ||
          comparePosition(edge.range.end, symbol.range.end) > 0 || comparePosition(edge.range.end, edge.range.start) <= 0) continue;
      const name = edge.referenceName?.split(".").at(-1);
      if (name === undefined || !/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name)) continue;
      seen.add(edge.id);
      const calls = byName.get(name) ?? [];
      calls.push(edge);
      byName.set(name, calls);
    }
  }
  const selectedFiles = new Set(plan.selection.map(item => item.symbol.filePath));
  const supportedNames = new Set([...byName].filter(([, calls]) =>
    new Set(calls.map(edge => edge.filePath)).size >= limits.minimumSourceFiles).map(([name]) => name));
  const inspectedSymbols = graph.symbols.slice(0, limits.maximumCandidateSymbols);
  const symbols = inspectedSymbols.filter(symbol => !selectedFiles.has(symbol.filePath) &&
    ["function", "method", "entrypoint"].includes(symbol.kind) && supportedNames.has(symbol.name));
  if (symbols.length === 0) return { ...plan, nameFollowupSearch: receipt };
  // Require the declaration's own query relevance; a name hit alone is insufficient.
  const secondary = planExploreQuery({ ...graph, symbols, edges: [] }, plan.query, sourceLexical);
  const candidates = secondary.selection.filter(item => item.sourceRole.role === "production");
  const additions = candidates.slice(0, Math.max(0, Math.min(limits.maximumAdditionalSymbols,
    EXPLORE_QUERY_LIMITS.maximumSymbols - plan.selection.length))).map(item => ({
      ...item, rank: plan.selection.length + 1,
      nameFollowup: {
        state: "unresolved-name-match" as const, scope: "bounded-candidates" as const,
        matchingDeclarationCount: inspectedSymbols.filter(symbol => symbol.name === item.symbol.name &&
          ["function", "method", "entrypoint"].includes(symbol.kind)).length,
        calls: byName.get(item.symbol.name)!
      }
    }));
  const selection = [...plan.selection, ...additions];
  return {
    ...plan, selection,
    limits: { ...plan.limits, maximumFiles: EXPLORE_QUERY_LIMITS.maximumFiles + additions.length },
    nameFollowupSearch: { ...receipt, candidateCount: candidates.length, emittedCount: additions.length,
      candidatesTruncated: receipt.candidatesTruncated || secondary.summary.truncated || candidates.length > additions.length },
    summary: {
      ...plan.summary,
      selectedCount: selection.length,
      selectedFileCount: new Set(selection.map(item => item.symbol.filePath)).size,
      selectedGeneratedCount: selection.filter(item => item.generated.generated).length,
      // Added leads are production declarations. Other role counts stay unchanged.
      truncated: plan.summary.truncated || candidates.length > additions.length
    }
  };
}
