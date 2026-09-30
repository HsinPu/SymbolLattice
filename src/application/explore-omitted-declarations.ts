import { identifierTermGroups, identifierTermVariants, identifierWords } from "../domain/identifier-search.js";
import type { GraphEdge } from "../domain/types.js";
import type { UnresolvedCallEvidence } from "./types.js";
import { EXPLORE_QUERY_LIMITS, EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT, exploreQueryOmittedTerms, planExploreQuery,
  type ExploreQueryGraph, type ExploreQueryPlan } from "./explore-query.js";

export const EXPLORE_OMITTED_DECLARATION_LIMITS = {
  maximumTerms: 8, minimumMatchedConcepts: 2, maximumCallsPerFocus: 8,
  maximumCandidateSymbols: 4096, maximumAdditionalSymbols: EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT
} as const;

export interface ExploreOmittedDeclarationLead {
  readonly state: "unresolved-name-candidate";
  readonly scope: "inspected-bounded-graph";
  readonly call: GraphEdge;
  readonly matchedOmittedTerms: readonly string[];
  /** Only within the inspected graph, never global uniqueness or dispatch. */
  readonly matchingDeclarationCount: number;
}

export interface ExploreOmittedDeclarationSearch {
  readonly policy: "omitted-query-call-declarations-v1";
  readonly state: "searched" | "unavailable" | "generation-mismatch";
  readonly limits: typeof EXPLORE_OMITTED_DECLARATION_LIMITS;
  readonly omittedTerms: readonly string[];
  readonly termsTruncated: boolean;
  readonly callsTruncated: boolean;
  readonly candidatesTruncated: boolean;
  readonly candidateCount: number;
  readonly emittedCount: number;
}

/** Supplement source in selected files without changing primary rank or call certainty. */
export function supplementOmittedCallDeclarations(graph: ExploreQueryGraph, plan: ExploreQueryPlan,
  callsBySource: ReadonlyMap<string, UnresolvedCallEvidence>): ExploreQueryPlan {
  if (plan.input.identifierTermsTruncated !== true || plan.fileHints.length > 0) return plan;
  const omitted = exploreQueryOmittedTerms(plan.query);
  const groups = identifierTermGroups(omitted.terms);
  const limits = EXPLORE_OMITTED_DECLARATION_LIMITS;
  if (groups.length < limits.minimumMatchedConcepts) return plan;
  const original = plan.selection.filter(item => item.nameFollowup === undefined && item.importedCallDeclaration === undefined);
  const inputs = original.map(item => callsBySource.get(item.symbol.id));
  const state = inputs.some(input => input?.state === "generation-mismatch") ? "generation-mismatch"
    : inputs.some(input => input?.state !== "available") ? "unavailable" : "searched";
  const receipt: ExploreOmittedDeclarationSearch = {
    policy: "omitted-query-call-declarations-v1", state, limits, omittedTerms: omitted.terms,
    termsTruncated: omitted.truncated,
    callsTruncated: inputs.some(input => input?.truncated || (input?.items.length ?? 0) > limits.maximumCallsPerFocus),
    candidatesTruncated: graph.symbols.length > limits.maximumCandidateSymbols, candidateCount: 0, emittedCount: 0
  };
  if (state !== "searched") return { ...plan, omittedDeclarationSearch: receipt };
  const selectedIds = new Set(plan.selection.map(item => item.symbol.id));
  const selectedFiles = new Set(plan.selection.map(item => item.symbol.filePath));
  const inspected = graph.symbols.slice(0, limits.maximumCandidateSymbols);
  const byName = new Map<string, typeof inspected>();
  for (const symbol of inspected) {
    if (!["function", "method", "entrypoint"].includes(symbol.kind)) continue;
    const named = byName.get(symbol.name) ?? [];
    named.push(symbol);
    byName.set(symbol.name, named);
  }
  const position = (a: GraphEdge["range"]["start"], b: GraphEdge["range"]["start"]) => a.line - b.line || a.column - b.column;
  const candidates = new Map<string, ExploreQueryPlan["selection"][number]>();
  for (const owner of original) {
    if (owner.sourceRole.role !== "production" || owner.generated.generated) continue;
    for (const call of (callsBySource.get(owner.symbol.id)?.items ?? []).slice(0, limits.maximumCallsPerFocus)) {
      if (call.sourceId !== owner.symbol.id || call.filePath !== owner.symbol.filePath || call.kind !== "calls" ||
          call.resolution !== "unresolved" || call.targetId !== null || call.confidence !== 0 ||
          position(call.range.start, owner.symbol.range.start) < 0 || position(call.range.end, owner.symbol.range.end) > 0 ||
          position(call.range.end, call.range.start) <= 0) continue;
      const declarations = byName.get(call.referenceName?.split(".").at(-1) ?? "") ?? [];
      if (declarations.length !== 1) continue;
      const declaration = declarations[0]!;
      if (candidates.has(declaration.id) || selectedIds.has(declaration.id) || !selectedFiles.has(declaration.filePath) ||
          plan.selection.filter(item => item.symbol.filePath === declaration.filePath).length >=
            EXPLORE_QUERY_LIMITS.maximumSymbolsPerFile + EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT) continue;
      const words = new Set(identifierWords(declaration.name).flatMap(identifierTermVariants));
      const matched = groups.filter(group => group.some(term => words.has(term))).map(group => group[0]!);
      if (matched.length < limits.minimumMatchedConcepts) continue;
      const item = planExploreQuery({ ...graph, symbols: [declaration], edges: [] }, declaration.name).selection[0];
      if (item === undefined || item.generated.generated || item.sourceRole.role !== "production") continue;
      candidates.set(declaration.id, { ...item, score: 0, baseScore: 0, rankingScore: 0,
        connectionScore: 0, sourceScore: 0, matchedTerms: [], sourceMatches: [], reasons: ["omitted-query-call-declaration"],
        graphDiffusion: { ...item.graphDiffusion, state: "no-mass", seed: false, seedWeight: 0,
          nodeMass: 0, fileMass: 0, normalizedFileMass: 0, score: 0, rankingContribution: 0 },
        omittedQueryDeclaration: { state: "unresolved-name-candidate", scope: "inspected-bounded-graph", call,
          matchedOmittedTerms: matched, matchingDeclarationCount: declarations.length } });
    }
  }
  const additions = [...candidates.values()].slice(0, Math.min(limits.maximumAdditionalSymbols,
    Math.max(0, EXPLORE_QUERY_LIMITS.maximumSymbols + EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT - plan.selection.length)))
    .map((item, index) => ({ ...item, rank: plan.selection.length + index + 1 }));
  const selection = [...plan.selection, ...additions];
  return { ...plan, selection,
    limits: { ...plan.limits,
      maximumSymbols: Math.max(plan.limits.maximumSymbols, EXPLORE_QUERY_LIMITS.maximumSymbols + additions.length),
      maximumSymbolsPerFile: Math.max(plan.limits.maximumSymbolsPerFile,
        EXPLORE_QUERY_LIMITS.maximumSymbolsPerFile + additions.length) },
    omittedDeclarationSearch: { ...receipt, candidateCount: candidates.size, emittedCount: additions.length,
      candidatesTruncated: receipt.candidatesTruncated || candidates.size > additions.length },
    summary: { ...plan.summary, candidateCount: plan.summary.candidateCount + candidates.size,
      selectedCount: selection.length, selectedFileCount: new Set(selection.map(item => item.symbol.filePath)).size,
      truncated: plan.summary.truncated || candidates.size > additions.length } };
}
