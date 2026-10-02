import { identifierTermGroups, identifierTermVariants, identifierWords } from "../domain/identifier-search.js";
import { matchCallableSource, type SourceLexicalMatch } from "../domain/source-lexical.js";
import type { GraphEdge, SymbolNode } from "../domain/types.js";
import { classifySourceRole, sourceRoleClassificationFor } from "../domain/source-roles.js";
import { generatedClassificationFor } from "../domain/generated-files.js";
import type { UnresolvedCallEvidence } from "./types.js";
import type { ExploreQueryGraph, ExploreQueryPlan } from "./explore-query.js";
import { inheritedSourceLookup, type InheritedSourceWitness } from "./explore-inherited-source.js";

export const CALL_SOURCE_CONTEXT_LIMITS = {
  maximumSymbols: 4096, maximumEdges: 16384, maximumCallsPerSource: 8,
  maximumCandidates: 16, maximumNestedSources: 8, maximumHops: 2,
  maximumAdditionalFiles: 4, maximumTerms: 16, minimumSourceConcepts: 2,
  maximumDeclarationLines: 64, maximumDeclarationCharacters: 8192,
  maximumSourceCharacters: 65536, maximumWindows: 3, maximumReservedCharacters: 6000
} as const;

export interface InheritedCallSourceStep {
  readonly caller: SymbolNode;
  readonly declaration: SymbolNode;
  readonly call: GraphEdge;
  readonly inheritedSource: InheritedSourceWitness;
}

/** A source route, never a resolved self call or a runtime inheritance chain. */
export interface CallSourceContextCandidate {
  readonly reason: "inherited-call-source" | "exact-caller-source";
  readonly focusRank: number;
  readonly root: SymbolNode;
  readonly declaration: SymbolNode;
  readonly steps: readonly InheritedCallSourceStep[];
  readonly callerEdge?: GraphEdge;
}

export interface CallSourceContextPlan {
  readonly queryTerms: readonly string[];
  readonly termsTruncated: boolean;
  readonly graphTruncated: boolean;
  readonly callsTruncated: boolean;
  readonly candidatesTruncated: boolean;
  readonly generationMismatch: boolean;
  readonly unavailableSourceIds: readonly string[];
  readonly pendingSourceIds: readonly string[];
  readonly candidates: readonly CallSourceContextCandidate[];
}

export interface CallSourceContextSearch extends Omit<CallSourceContextPlan, "candidates" | "pendingSourceIds"> {
  readonly policy: "written-python-call-source-context-v1";
  readonly scope: "inspected-bounded-graph";
  readonly limits: typeof CALL_SOURCE_CONTEXT_LIMITS;
  readonly candidateCount: number;
  readonly matchedCount: number;
  readonly selectedCount: number;
  readonly sourceCharacters: number;
  readonly unavailableFiles: readonly string[];
  readonly sourceTruncated: boolean;
  readonly truncated: boolean;
}

const position = (a: GraphEdge["range"]["start"], b: GraphEdge["range"]["start"]) =>
  a.line - b.line || a.column - b.column;
const inside = (edge: GraphEdge, symbol: SymbolNode) => edge.filePath === symbol.filePath &&
  position(edge.range.start, symbol.range.start) >= 0 && position(edge.range.end, symbol.range.end) <= 0 &&
  position(edge.range.end, edge.range.start) > 0;

/** Reuse one bounded adjacency when a single generation-fenced nested call read is needed. */
export function callSourceContextPlanner(graph: ExploreQueryGraph, selection: ExploreQueryPlan["selection"],
  terms: readonly string[], graphTruncated = false):
  ((calls: ReadonlyMap<string, UnresolvedCallEvidence>) => CallSourceContextPlan) | undefined {
  const roots = selection.filter(item => item.symbol.kind === "method" && item.symbol.filePath.endsWith(".py") &&
    item.sourceRole.role === "production" && !item.generated.generated &&
    item.omittedQueryDeclaration === undefined && item.nameFollowup === undefined);
  if (roots.length === 0 || identifierTermGroups(terms).length < 2) return undefined;
  const limits = CALL_SOURCE_CONTEXT_LIMITS, uniqueTerms = [...new Set(terms)], queryTerms = uniqueTerms.slice(0, limits.maximumTerms);
  const groups = identifierTermGroups(queryTerms);
  const relevantName = (name: string) => {
    const words = new Set(identifierWords(name).flatMap(identifierTermVariants));
    return groups.some(group => group.some(term => words.has(term)));
  };
  const inspected = graph.symbols.slice(0, limits.maximumSymbols);
  const files = new Map(graph.files?.map(file => [file.path, file]));
  const production = (filePath: string) => {
    const file = files.get(filePath);
    return (file?.sourceRole === undefined ? classifySourceRole(filePath) : sourceRoleClassificationFor(file)).role === "production" &&
      !generatedClassificationFor(file ?? {}).generated;
  };
  const symbols = new Map(inspected.map(symbol => [symbol.id, symbol]));
  const byName = new Map<string, SymbolNode[]>();
  for (const symbol of inspected) if (symbol.kind === "method" && symbol.filePath.endsWith(".py")) {
    const named = byName.get(symbol.name) ?? []; named.push(symbol); byName.set(symbol.name, named);
  }
  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges.slice(0, limits.maximumEdges)) {
    if (edge.kind !== "calls" || edge.targetId === null || edge.resolution !== "exact" || edge.confidence !== 1) continue;
    const edges = incoming.get(edge.targetId) ?? []; edges.push(edge); incoming.set(edge.targetId, edges);
  }
  const inherited = inheritedSourceLookup(graph);
  const rootIds = new Set(selection.map(item => item.symbol.id));
  const selectedFiles = new Set(selection.map(item => item.symbol.filePath));
  return calls => {
    const candidates: CallSourceContextCandidate[] = [], seen = new Set<string>(), extraFiles = new Set<string>();
    const pending = new Set<string>(), unavailable = new Set<string>();
    let callsTruncated = false, candidatesTruncated = false, generationMismatch = false;
    const add = (candidate: CallSourceContextCandidate) => {
      const declaration = candidate.declaration;
      if (seen.has(declaration.id) || !production(declaration.filePath)) return;
      if (candidates.length >= limits.maximumCandidates || (!selectedFiles.has(declaration.filePath) &&
          !extraFiles.has(declaration.filePath) && extraFiles.size >= limits.maximumAdditionalFiles)) {
        candidatesTruncated = true; return;
      }
      seen.add(declaration.id); candidates.push(candidate);
      if (!selectedFiles.has(declaration.filePath)) extraFiles.add(declaration.filePath);
    };
    for (const root of roots) {
      const queue: { caller: SymbolNode; steps: readonly InheritedCallSourceStep[] }[] = [{ caller: root.symbol, steps: [] }];
      for (let index = 0; index < queue.length && index <= limits.maximumCandidates; index++) {
        const { caller, steps } = queue[index]!;
        if (steps.length >= limits.maximumHops) continue;
        const evidence = calls.get(caller.id);
        if (evidence === undefined) { if (steps.length > 0) pending.add(caller.id); continue; }
        if (evidence.state !== "available") {
          generationMismatch ||= evidence.state === "generation-mismatch"; unavailable.add(caller.id); continue;
        }
        callsTruncated ||= evidence.truncated || evidence.items.length > limits.maximumCallsPerSource;
        for (const call of evidence.items.slice(0, limits.maximumCallsPerSource)) {
          const name = call.referenceName?.split(".").at(-1);
          if (!name || !relevantName(name)) continue;
          const witnesses = (byName.get(name) ?? []).flatMap(declaration => {
            const witness = inherited(caller, call, declaration);
            return witness === undefined ? [] : [{ caller, declaration, call, inheritedSource: witness }];
          });
          // Do not choose among duplicate written declarations of the same base method.
          if (witnesses.length !== 1) continue;
          const step = witnesses[0]!;
          if ([root.symbol.id, ...steps.map(item => item.declaration.id)].includes(step.declaration.id)) continue;
          const path = [...steps, step];
          add({ reason: "inherited-call-source", focusRank: root.rank, root: root.symbol, declaration: step.declaration, steps: path });
          if (path.length < limits.maximumHops && seen.has(step.declaration.id)) queue.push({ caller: step.declaration, steps: path });
        }
      }
      for (const edge of incoming.get(root.symbol.id) ?? []) {
        const caller = symbols.get(edge.sourceId);
        if (caller?.kind !== "method" || caller.filePath !== root.symbol.filePath || rootIds.has(caller.id) ||
            !inside(edge, caller) || !relevantName(caller.name)) continue;
        add({ reason: "exact-caller-source", focusRank: root.rank, root: root.symbol, declaration: caller,
          steps: [], callerEdge: edge });
      }
    }
    candidates.sort((a, b) => a.focusRank - b.focusRank ||
      Number(a.reason === "exact-caller-source") - Number(b.reason === "exact-caller-source") ||
      a.steps.length - b.steps.length || a.declaration.filePath.localeCompare(b.declaration.filePath) ||
      a.declaration.range.start.line - b.declaration.range.start.line);
    return { queryTerms, termsTruncated: uniqueTerms.length > queryTerms.length, graphTruncated: graphTruncated ||
      graph.symbols.length > limits.maximumSymbols || graph.edges.length > limits.maximumEdges,
      callsTruncated, candidatesTruncated, generationMismatch, unavailableSourceIds: [...unavailable],
      pendingSourceIds: [...pending], candidates };
  };
}

/** Match only bounded declaration text, preserving original UTF-16 token coordinates. */
export interface MatchedCallSourceContexts {
  readonly candidates: readonly (CallSourceContextCandidate & {
    readonly sourceMatches: readonly SourceLexicalMatch[];
    readonly maximumRequestedCharacters: number;
  })[];
  readonly receipt: CallSourceContextSearch;
}

export function matchCallSourceContexts(plan: CallSourceContextPlan,
  documents: ReadonlyMap<string, { readonly sourceText: string }>): MatchedCallSourceContexts {
  const limits = CALL_SOURCE_CONTEXT_LIMITS, groups = identifierTermGroups(plan.queryTerms);
  const byFile = new Map<string, string[]>(), unavailableFiles = new Set<string>();
  const candidates: MatchedCallSourceContexts["candidates"][number][] = [];
  let sourceCharacters = 0, sourceTruncated = false;
  for (const candidate of plan.candidates) {
    const symbol = candidate.declaration, document = documents.get(symbol.filePath);
    if (document === undefined) { unavailableFiles.add(symbol.filePath); continue; }
    let lines = byFile.get(symbol.filePath);
    if (lines === undefined) { lines = document.sourceText.split(/\r\n|\r|\n|\u2028|\u2029/u); byFile.set(symbol.filePath, lines); }
    const start = symbol.range.start.line, end = symbol.range.end.line;
    if (start < 1 || end < start || end > lines.length || end - start + 1 > limits.maximumDeclarationLines) {
      sourceTruncated = true; continue;
    }
    const text = lines.slice(start - 1, end).join("\n");
    if (text.length > limits.maximumDeclarationCharacters || sourceCharacters + text.length > limits.maximumSourceCharacters) {
      sourceTruncated = true; continue;
    }
    sourceCharacters += text.length;
    const local = { ...symbol, range: { start: { ...symbol.range.start, line: 1 },
      end: { ...symbol.range.end, line: end - start + 1 } } };
    const found = matchCallableSource(text, [local], groups);
    sourceTruncated ||= found.truncated;
    const matches = found.documents[0]?.matches ?? [];
    if (identifierTermGroups(matches.map(match => match.term)).length < limits.minimumSourceConcepts) continue;
    // Two delimiter characters per source line bound LF, CRLF and final-newline differences.
    candidates.push({ ...candidate, maximumRequestedCharacters: text.length + 2 * (end - start + 1),
      sourceMatches: matches.map(match => ({ ...match,
      range: { start: { ...match.range.start, line: match.range.start.line + start - 1 },
        end: { ...match.range.end, line: match.range.end.line + start - 1 } } })) });
  }
  const { candidates: _candidates, pendingSourceIds, ...metadata } = plan;
  return { candidates, receipt: { ...metadata, policy: "written-python-call-source-context-v1", scope: "inspected-bounded-graph",
    limits, candidateCount: plan.candidates.length, matchedCount: candidates.length, selectedCount: 0,
    sourceCharacters, unavailableFiles: [...unavailableFiles], sourceTruncated,
    callsTruncated: plan.callsTruncated || pendingSourceIds.length > 0,
    truncated: plan.termsTruncated || plan.graphTruncated || plan.callsTruncated || plan.candidatesTruncated ||
      pendingSourceIds.length > 0 || plan.generationMismatch || plan.unavailableSourceIds.length > 0 ||
      unavailableFiles.size > 0 || sourceTruncated } };
}
