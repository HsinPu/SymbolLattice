import { identifierTermGroups, identifierTermVariants, identifierWords } from "../domain/identifier-search.js";
import type { GraphEdge } from "../domain/types.js";
import type { UnresolvedCallEvidence } from "./types.js";
import type { ActiveNamedDeclarationsProjection } from "../ports/graph-store.js";
import { inheritedSourceLookup, type InheritedSourceWitness } from "./explore-inherited-source.js";
import { EXPLORE_QUERY_LIMITS, EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT, exploreQueryOmittedTerms, planExploreQuery,
  type ExploreQueryGraph, type ExploreQueryPlan } from "./explore-query.js";

export const EXPLORE_OMITTED_DECLARATION_LIMITS = {
  maximumTerms: 8, minimumMatchedConcepts: 2, maximumCallsPerFocus: 8,
  maximumCandidateSymbols: 4096, maximumAdditionalSymbols: 2, maximumAmbiguousDeclarations: 2
} as const;

export const EXPLORE_SELECTED_DECLARATION_LIMITS = { maximumNames: 8, maximumFiles: 8, maximumDeclarations: 16 } as const;
export interface SelectedDeclarationLookup {
  readonly names: readonly string[];
  readonly namesTruncated?: boolean;
  readonly projection?: ActiveNamedDeclarationsProjection;
}

/** Exact names corroborated by omitted concepts; used only if graph supplementation found no focus. */
export function omittedDeclarationLookupNames(plan: ExploreQueryPlan,
  callsBySource: ReadonlyMap<string, UnresolvedCallEvidence>): readonly string[] {
  if (plan.omittedDeclarationSearch?.state !== "searched" || plan.omittedDeclarationSearch.emittedCount !== 0 ||
      plan.selection.length >= EXPLORE_QUERY_LIMITS.maximumSymbols + EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT) return [];
  const groups = identifierTermGroups(plan.omittedDeclarationSearch.omittedTerms);
  const names = new Set<string>();
  for (const owner of plan.selection) {
    if (owner.nameFollowup !== undefined || owner.importedCallDeclaration !== undefined ||
        owner.sourceRole.role !== "production" || owner.generated.generated) continue;
    for (const call of (callsBySource.get(owner.symbol.id)?.items ?? []).slice(0, EXPLORE_OMITTED_DECLARATION_LIMITS.maximumCallsPerFocus)) {
      const name = call.referenceName?.split(".").at(-1);
      if (!name || call.sourceId !== owner.symbol.id || call.filePath !== owner.symbol.filePath ||
          call.kind !== "calls" || call.targetId !== null || call.resolution !== "unresolved" || call.confidence !== 0) continue;
      const words = new Set(identifierWords(name).flatMap(identifierTermVariants));
      if (groups.filter(group => group.some(term => words.has(term))).length >= EXPLORE_OMITTED_DECLARATION_LIMITS.minimumMatchedConcepts) names.add(name);
    }
  }
  return [...names];
}

export interface ExploreOmittedDeclarationLead {
  readonly state: "unresolved-name-candidate";
  readonly scope: "inspected-bounded-graph" | "selected-files-index" | "inspected-inherited-source";
  readonly inheritedSource?: InheritedSourceWitness;
  readonly call: GraphEdge;
  readonly matchedOmittedTerms: readonly string[];
  /** Only within the stated search scope, never global uniqueness or dispatch. */
  readonly matchingDeclarationCount: number;
  /** Complete selected-file ambiguity group, emitted together; not possible runtime targets. */
  readonly matchingDeclarationIds?: readonly string[];
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
  readonly selectedFileLookup?: {
    readonly state: "available" | "unavailable" | "generation-mismatch" | "truncated";
    readonly names: readonly string[];
    readonly namesTruncated: boolean;
    readonly filePaths: readonly string[];
    readonly limits: typeof EXPLORE_SELECTED_DECLARATION_LIMITS;
  };
}

/** Supplement source in selected files without changing primary rank or call certainty. */
export function supplementOmittedCallDeclarations(graph: ExploreQueryGraph, plan: ExploreQueryPlan,
  callsBySource: ReadonlyMap<string, UnresolvedCallEvidence>, graphTruncated = false,
  lookup?: SelectedDeclarationLookup): ExploreQueryPlan {
  if (plan.input.identifierTermsTruncated !== true || plan.fileHints.length > 0) return plan;
  const omitted = exploreQueryOmittedTerms(plan.query);
  const groups = identifierTermGroups(omitted.terms);
  const limits = EXPLORE_OMITTED_DECLARATION_LIMITS;
  if (groups.length < limits.minimumMatchedConcepts) return plan;
  const original = plan.selection.filter(item => item.nameFollowup === undefined && item.importedCallDeclaration === undefined);
  const inputs = original.map(item => callsBySource.get(item.symbol.id));
  const state = inputs.some(input => input?.state === "generation-mismatch") ? "generation-mismatch"
    : inputs.some(input => input?.state !== "available") ? "unavailable" : "searched";
  const selectedFiles = new Set(plan.selection.map(item => item.symbol.filePath));
  const lookupState = lookup === undefined ? undefined : lookup.projection === undefined ? "unavailable"
    : !lookup.projection.generationMatched ? "generation-mismatch" : lookup.projection.truncated ? "truncated" : "available";
  const receipt: ExploreOmittedDeclarationSearch = {
    policy: "omitted-query-call-declarations-v1", state, limits, omittedTerms: omitted.terms,
    termsTruncated: omitted.truncated,
    callsTruncated: inputs.some(input => input?.truncated || (input?.items.length ?? 0) > limits.maximumCallsPerFocus),
    candidatesTruncated: graphTruncated || graph.symbols.length > limits.maximumCandidateSymbols || lookup?.namesTruncated === true,
    candidateCount: 0, emittedCount: 0,
    ...(lookupState === undefined ? {} : { selectedFileLookup: { state: lookupState,
      names: lookup!.names, namesTruncated: lookup!.namesTruncated === true,
      filePaths: [...selectedFiles], limits: EXPLORE_SELECTED_DECLARATION_LIMITS } })
  };
  if (state !== "searched") return { ...plan, omittedDeclarationSearch: receipt };
  const selectedIds = new Set(plan.selection.map(item => item.symbol.id));
  const inspected = graph.symbols.slice(0, limits.maximumCandidateSymbols);
  const byName = new Map<string, typeof inspected>();
  for (const symbol of inspected) {
    if (!["function", "method", "entrypoint"].includes(symbol.kind)) continue;
    const named = byName.get(symbol.name) ?? [];
    named.push(symbol);
    byName.set(symbol.name, named);
  }
  // A capped response cannot establish even uniqueness within selected files.
  // Only complete, generation-matched exact-name projections supersede graph candidates.
  const projectedNames = new Set<string>();
  if (lookupState === "available" && lookup !== undefined &&
      lookup.names.length <= EXPLORE_SELECTED_DECLARATION_LIMITS.maximumNames &&
      selectedFiles.size <= EXPLORE_SELECTED_DECLARATION_LIMITS.maximumFiles &&
      lookup.projection!.declarations.length <= EXPLORE_SELECTED_DECLARATION_LIMITS.maximumDeclarations) {
    for (const name of lookup.names) {
      const declarations = lookup.projection!.declarations.filter(symbol => symbol.name === name &&
        selectedFiles.has(symbol.filePath) && ["function", "method", "entrypoint"].includes(symbol.kind));
      byName.set(name, declarations);
      projectedNames.add(name);
    }
  }
  const position = (a: GraphEdge["range"]["start"], b: GraphEdge["range"]["start"]) => a.line - b.line || a.column - b.column;
  const candidates = new Map<string, ExploreQueryPlan["selection"][number][]>();
  const inheritedLookup = inheritedSourceLookup(graph);
  for (const owner of original) {
    if (owner.sourceRole.role !== "production" || owner.generated.generated) continue;
    for (const call of (callsBySource.get(owner.symbol.id)?.items ?? []).slice(0, limits.maximumCallsPerFocus)) {
      if (call.sourceId !== owner.symbol.id || call.filePath !== owner.symbol.filePath || call.kind !== "calls" ||
          call.resolution !== "unresolved" || call.targetId !== null || call.confidence !== 0 ||
          position(call.range.start, owner.symbol.range.start) < 0 || position(call.range.end, owner.symbol.range.end) > 0 ||
          position(call.range.end, call.range.start) <= 0) continue;
      const declarations = byName.get(call.referenceName?.split(".").at(-1) ?? "") ?? [];
      const ambiguous = declarations.length > 1;
      if (declarations.length !== 1 && !(lookupState === "available" && projectedNames.has(declarations[0]?.name ?? "") &&
          declarations.length === limits.maximumAmbiguousDeclarations &&
          new Set(declarations.map(symbol => symbol.id)).size === declarations.length)) continue;
      const key = declarations.map(symbol => symbol.id).join("\u0000");
      if (candidates.has(key)) continue;
      const group: ExploreQueryPlan["selection"][number][] = [];
      for (const declaration of declarations) {
        const inheritedSource = selectedFiles.has(declaration.filePath) ? undefined : inheritedLookup(owner.symbol, call, declaration);
        if (selectedIds.has(declaration.id) ||
            (!selectedFiles.has(declaration.filePath) && inheritedSource === undefined) ||
            plan.selection.filter(item => item.symbol.filePath === declaration.filePath).length >=
              EXPLORE_QUERY_LIMITS.maximumSymbolsPerFile + declarations.length) continue;
        const words = new Set(identifierWords(declaration.name).flatMap(identifierTermVariants));
        const matched = groups.filter(group => group.some(term => words.has(term))).map(group => group[0]!);
        if (matched.length < limits.minimumMatchedConcepts) continue;
        const item = planExploreQuery({ ...graph, symbols: [declaration], edges: [] }, declaration.name).selection[0];
        if (item === undefined || item.generated.generated || item.sourceRole.role !== "production") continue;
        group.push({ ...item, score: 0, baseScore: 0, rankingScore: 0,
          connectionScore: 0, sourceScore: 0, matchedTerms: [], sourceMatches: [], reasons: ["omitted-query-call-declaration"],
          graphDiffusion: { ...item.graphDiffusion, state: "no-mass", seed: false, seedWeight: 0,
            nodeMass: 0, fileMass: 0, normalizedFileMass: 0, score: 0, rankingContribution: 0 },
          omittedQueryDeclaration: { state: "unresolved-name-candidate",
            scope: inheritedSource !== undefined ? "inspected-inherited-source" :
              projectedNames.has(declaration.name) ? "selected-files-index" : "inspected-bounded-graph", call,
            ...(inheritedSource === undefined ? {} : { inheritedSource }),
            matchedOmittedTerms: matched, matchingDeclarationCount: declarations.length,
            ...(ambiguous ? { matchingDeclarationIds: declarations.map(symbol => symbol.id) } : {}) } });
      }
      // Never pick an arbitrary winner when a sibling is invalid or already selected.
      if (group.length === declarations.length) candidates.set(key, group);
    }
  }
  const groupsToAdd = [...candidates.values()];
  const chosen = groupsToAdd.find(group => {
    const capacity = group.length === 2 ? EXPLORE_QUERY_LIMITS.maximumSymbols + 2 :
      EXPLORE_QUERY_LIMITS.maximumSymbols + EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT;
    if (group.length === 2 && plan.selection.length > EXPLORE_QUERY_LIMITS.maximumSymbols) return false;
    return plan.selection.length + group.length <= capacity && [...new Set(group.map(item => item.symbol.filePath))].every(filePath =>
      plan.selection.filter(item => item.symbol.filePath === filePath).length + group.filter(item => item.symbol.filePath === filePath).length <=
        EXPLORE_QUERY_LIMITS.maximumSymbolsPerFile + group.length);
  }) ?? [];
  const candidateCount = groupsToAdd.reduce((count, group) => count + group.length, 0);
  const additions = chosen.map((item, index) => ({ ...item, rank: plan.selection.length + index + 1 }));
  const selection = [...plan.selection, ...additions];
  return { ...plan, selection,
    limits: { ...plan.limits,
      maximumFiles: plan.limits.maximumFiles + additions.filter(item => !selectedFiles.has(item.symbol.filePath)).length,
      maximumSymbols: Math.max(plan.limits.maximumSymbols, EXPLORE_QUERY_LIMITS.maximumSymbols + additions.length),
      maximumSymbolsPerFile: Math.max(plan.limits.maximumSymbolsPerFile,
        EXPLORE_QUERY_LIMITS.maximumSymbolsPerFile + additions.length) },
    omittedDeclarationSearch: { ...receipt, candidateCount, emittedCount: additions.length,
      candidatesTruncated: receipt.candidatesTruncated || candidateCount > additions.length },
    summary: { ...plan.summary, candidateCount: plan.summary.candidateCount + candidateCount,
      selectedCount: selection.length, selectedFileCount: new Set(selection.map(item => item.symbol.filePath)).size,
      truncated: plan.summary.truncated || candidateCount > additions.length } };
}
