import type { ActiveImportedCallDeclarationsProjection, ImportedCallDeclaration } from "../ports/graph-store.js";
import { EXPLORE_QUERY_LIMITS, EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT, planExploreQuery,
  type ExploreQueryGraph, type ExploreQueryPlan } from "./explore-query.js";

export const EXPLORE_IMPORTED_DECLARATION_LIMITS = { maximumCalls: 8, maximumWitnesses: 16,
  maximumAdditionalFiles: 1, maximumAdditionalSymbols: EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT } as const;

export interface ExploreImportedDeclarationLead extends ImportedCallDeclaration {
  readonly state: "unresolved-declaration-candidate";
  readonly scope: "bounded-import-and-construction-context";
  /** Distinct declarations in this bounded read, never repository-wide uniqueness. */
  readonly matchingDeclarationCount: number;
}

export interface ExploreImportedDeclarationSearch {
  readonly policy: "imported-construction-declaration-leads-v1";
  readonly state: "searched" | "unavailable" | "generation-mismatch";
  readonly limits: typeof EXPLORE_IMPORTED_DECLARATION_LIMITS;
  readonly candidateCount: number;
  readonly emittedCount: number;
  readonly truncated: boolean;
}

/** Import and construction context corroborate a lead, not the unknown receiver or target. */
export function supplementImportedCallDeclarations(graph: ExploreQueryGraph, plan: ExploreQueryPlan,
  projection: ActiveImportedCallDeclarationsProjection | undefined, callsTruncated: boolean): ExploreQueryPlan {
  const receipt: ExploreImportedDeclarationSearch = { policy: "imported-construction-declaration-leads-v1",
    state: projection === undefined ? "unavailable" : projection.generationMatched ? "searched" : "generation-mismatch",
    limits: EXPLORE_IMPORTED_DECLARATION_LIMITS, candidateCount: 0, emittedCount: 0,
    truncated: callsTruncated || (projection?.truncated ?? false) ||
      (projection?.candidates.length ?? 0) > EXPLORE_IMPORTED_DECLARATION_LIMITS.maximumWitnesses };
  if (receipt.state !== "searched") return { ...plan, importedDeclarationSearch: receipt };
  const selectedFiles = new Set(plan.selection.map(item => item.symbol.filePath));
  const bySource = new Map(plan.selection.map(item => [item.symbol.id, item.symbol]));
  const valid = (projection?.candidates ?? []).slice(0, EXPLORE_IMPORTED_DECLARATION_LIMITS.maximumWitnesses).filter(context => {
    const { call, declaration, owner, importEdge, constructionEdge, containmentEdge, callerEdge } = context;
    const source = bySource.get(call.sourceId);
    const compare = (a: typeof call.range.start, b: typeof call.range.start) => a.line - b.line || a.column - b.column;
    return source !== undefined && call.filePath === source.filePath && call.kind === "calls" &&
      call.resolution === "unresolved" && call.targetId === null && call.confidence === 0 &&
      call.evidence?.ruleId === "syntax.typescript.optional-member-call.unknown-receiver" &&
      compare(call.range.start, source.range.start) >= 0 && compare(call.range.end, source.range.end) <= 0 &&
      compare(call.range.end, call.range.start) > 0 && call.referenceName === declaration.name &&
      declaration.kind === "method" && owner.kind === "class" && declaration.filePath === owner.filePath &&
      constructionEdge.kind === "instantiates" && constructionEdge.resolution === "exact" &&
      constructionEdge.targetId === owner.id && constructionEdge.filePath === call.filePath &&
      (callerEdge === undefined ? constructionEdge.sourceId === call.sourceId :
        callerEdge.kind === "calls" && callerEdge.resolution === "exact" && callerEdge.sourceId === call.sourceId &&
        callerEdge.targetId === constructionEdge.sourceId && callerEdge.filePath === call.filePath) &&
      containmentEdge.kind === "contains" && containmentEdge.resolution === "exact" &&
      containmentEdge.sourceId === owner.id && containmentEdge.targetId === declaration.id &&
      containmentEdge.filePath === declaration.filePath && importEdge.kind === "imports" &&
      importEdge.resolution === "exact" && importEdge.targetId !== null && importEdge.filePath === call.filePath;
  });
  const unique = [...new Map(valid.map(context => [context.declaration.id, context])).values()];
  const candidates = unique.flatMap(context => {
    if (selectedFiles.has(context.declaration.filePath)) return [];
    // Reuse classification only. A follow-up name is not a match to the user's
    // query, and must not inherit a fabricated lexical or graph ranking score.
    const item = planExploreQuery({ ...graph, symbols: [context.declaration], edges: [] }, context.declaration.name).selection[0];
    if (item === undefined || item.generated.generated || item.sourceRole.role !== "production") return [];
    return [{ ...item, score: 0, baseScore: 0, rankingScore: 0, connectionScore: 0, sourceScore: 0,
      matchedTerms: [], sourceMatches: [], reasons: ["imported-call-declaration" as const],
      graphDiffusion: { ...item.graphDiffusion, state: "no-mass" as const, seed: false, seedWeight: 0,
        nodeMass: 0, fileMass: 0, normalizedFileMass: 0, score: 0, rankingContribution: 0 },
      importedCallDeclaration: { ...context, state: "unresolved-declaration-candidate" as const,
        scope: "bounded-import-and-construction-context" as const,
        matchingDeclarationCount: unique.filter(other => other.declaration.name === context.declaration.name).length } }];
  });
  const additions = candidates.slice(0, Math.min(EXPLORE_IMPORTED_DECLARATION_LIMITS.maximumAdditionalSymbols,
    Math.max(0, EXPLORE_QUERY_LIMITS.maximumSymbols + EXPLORE_SUPPLEMENTARY_FOCUS_LIMIT - plan.selection.length)))
    .map((item, index) => ({ ...item, rank: plan.selection.length + index + 1 }));
  const selection = [...plan.selection, ...additions];
  return { ...plan, selection,
    importedDeclarationSearch: { ...receipt, candidateCount: candidates.length, emittedCount: additions.length,
      truncated: receipt.truncated || candidates.length > additions.length },
    limits: { ...plan.limits, maximumSymbols: Math.max(plan.limits.maximumSymbols, EXPLORE_QUERY_LIMITS.maximumSymbols + additions.length),
      maximumFiles: plan.limits.maximumFiles + additions.length },
    summary: { ...plan.summary, candidateCount: plan.summary.candidateCount + candidates.length, selectedCount: selection.length,
      selectedFileCount: new Set(selection.map(item => item.symbol.filePath)).size,
      truncated: plan.summary.truncated || candidates.length > additions.length } };
}
