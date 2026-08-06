import type { GraphEdge, SymbolNode } from "../domain/types.js";

export const EXPLORE_QUERY_PLAN_POLICY = "explore-query-plan-v1" as const;
export const EXPLORE_QUERY_LIMITS = {
  maximumQueryCharacters: 512,
  maximumFileHints: 4,
  maximumIdentifierTerms: 8,
  maximumFiles: 4,
  maximumSymbols: 8,
  maximumSymbolsPerFile: 2,
  maximumConnections: 16
} as const;

export type ExploreQuerySelectionReason =
  | "explicit-file"
  | "exact-symbol-term"
  | "qualified-symbol-term"
  | "partial-symbol-term"
  | "file-name-term"
  | "graph-connected";

export interface ExploreQuerySelection {
  readonly rank: number;
  readonly symbol: SymbolNode;
  readonly score: number;
  readonly baseScore: number;
  readonly connectionScore: number;
  readonly matchedTerms: readonly string[];
  readonly reasons: readonly ExploreQuerySelectionReason[];
}

export interface ExploreQueryPlan {
  readonly policy: typeof EXPLORE_QUERY_PLAN_POLICY;
  readonly query: string;
  readonly normalizedQuery: string;
  readonly input: {
    readonly characters: number;
    readonly usedCharacters: number;
    readonly truncated: boolean;
  };
  readonly fileHints: readonly string[];
  readonly identifierTerms: readonly string[];
  readonly limits: typeof EXPLORE_QUERY_LIMITS;
  readonly summary: {
    readonly candidateCount: number;
    readonly selectedCount: number;
    readonly selectedFileCount: number;
    readonly truncated: boolean;
  };
  readonly selection: readonly ExploreQuerySelection[];
}

interface ExploreQueryGraph {
  readonly symbols: readonly SymbolNode[];
  readonly edges: readonly GraphEdge[];
}

interface Candidate {
  readonly symbol: SymbolNode;
  readonly explicitFile: boolean;
  readonly matchedTerms: readonly string[];
  readonly baseReasons: readonly ExploreQuerySelectionReason[];
  readonly baseScore: number;
  connectionScore: number;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "call",
  "calls",
  "code",
  "does",
  "flow",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "show",
  "the",
  "through",
  "to",
  "trace",
  "what",
  "where",
  "which",
  "with"
]);

// Match unsafe path-looking tokens too so rejected traversal/absolute hints do
// not leak back into identifier ranking as misleading `secret.ts` terms.
const FILE_HINT_EXPRESSION = /(?:[^\s`"'<>]+[\\/])+[^\s`"'<>]+\.[\p{L}\p{N}]+(?::[1-9]\d*(?::\d+)?)?/gu;
const IDENTIFIER_EXPRESSION = /[\p{L}_$][\p{L}\p{N}_$.-]*/gu;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedIdentifier(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}_$]/gu, "");
}

function canonicalFileHint(value: string): string | null {
  const withoutLocation = value.replace(/:[1-9]\d*(?::\d+)?$/u, "");
  const normalized = withoutLocation.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/u.test(normalized)
  ) {
    return null;
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }
  return segments.join("/");
}

function parseQuery(query: string): {
  readonly boundedQuery: string;
  readonly normalizedQuery: string;
  readonly input: ExploreQueryPlan["input"];
  readonly fileHints: readonly string[];
  readonly identifierTerms: readonly string[];
} {
  const trimmed = query.trim();
  const bounded = trimmed.slice(0, EXPLORE_QUERY_LIMITS.maximumQueryCharacters);
  const fileHints: string[] = [];
  const seenFiles = new Set<string>();
  const withoutFiles = bounded.replace(FILE_HINT_EXPRESSION, (raw) => {
    const hint = canonicalFileHint(raw);
    if (
      hint !== null &&
      !seenFiles.has(hint) &&
      fileHints.length < EXPLORE_QUERY_LIMITS.maximumFileHints
    ) {
      seenFiles.add(hint);
      fileHints.push(hint);
    }
    return " ";
  });
  const identifierTerms: string[] = [];
  const seenTerms = new Set<string>();
  for (const match of withoutFiles.matchAll(IDENTIFIER_EXPRESSION)) {
    const term = normalizedIdentifier(match[0]);
    if (
      term.length < 3 ||
      STOP_WORDS.has(term) ||
      seenTerms.has(term) ||
      identifierTerms.length >= EXPLORE_QUERY_LIMITS.maximumIdentifierTerms
    ) {
      continue;
    }
    seenTerms.add(term);
    identifierTerms.push(term);
  }
  return {
    boundedQuery: bounded,
    normalizedQuery: bounded
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .slice(0, EXPLORE_QUERY_LIMITS.maximumQueryCharacters),
    input: {
      characters: query.length,
      usedCharacters: bounded.length,
      truncated: trimmed.length > bounded.length
    },
    fileHints,
    identifierTerms
  };
}

function fileName(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf("/") + 1);
}

function candidateFor(
  symbol: SymbolNode,
  fileHints: readonly string[],
  identifierTerms: readonly string[]
): Candidate | null {
  if (symbol.kind === "file") return null;
  const explicitFile = fileHints.includes(symbol.filePath);
  const name = normalizedIdentifier(symbol.name);
  const qualifiedName = normalizedIdentifier(symbol.qualifiedName);
  const normalizedFileName = normalizedIdentifier(fileName(symbol.filePath));
  const matchedTerms: string[] = [];
  let exactSymbolTerm = false;
  let qualifiedSymbolTerm = false;
  let partialSymbolTerm = false;
  let fileNameTerm = false;

  for (const term of identifierTerms) {
    if (name === term) {
      exactSymbolTerm = true;
      matchedTerms.push(term);
      continue;
    }
    if (qualifiedName === term || qualifiedName.endsWith(term)) {
      qualifiedSymbolTerm = true;
      matchedTerms.push(term);
      continue;
    }
    if (name.includes(term) || term.includes(name)) {
      partialSymbolTerm = true;
      matchedTerms.push(term);
      continue;
    }
    if (normalizedFileName.includes(term) || term.includes(normalizedFileName)) {
      fileNameTerm = true;
      matchedTerms.push(term);
    }
  }

  if (!explicitFile && matchedTerms.length === 0) return null;
  const baseReasons: ExploreQuerySelectionReason[] = [];
  let baseScore = 0;
  if (explicitFile) {
    baseReasons.push("explicit-file");
    baseScore += 1_000;
  }
  if (exactSymbolTerm) {
    baseReasons.push("exact-symbol-term");
    baseScore += 500;
  }
  if (qualifiedSymbolTerm) {
    baseReasons.push("qualified-symbol-term");
    baseScore += 300;
  }
  if (partialSymbolTerm) {
    baseReasons.push("partial-symbol-term");
    baseScore += 120;
  }
  if (fileNameTerm) {
    baseReasons.push("file-name-term");
    baseScore += 80;
  }
  baseScore += new Set(matchedTerms).size * 10;
  return {
    symbol,
    explicitFile,
    matchedTerms: [...new Set(matchedTerms)],
    baseReasons,
    baseScore,
    connectionScore: 0
  };
}

function compareCandidates(left: Candidate, right: Candidate): number {
  if (left.explicitFile !== right.explicitFile) return left.explicitFile ? -1 : 1;
  const scoreDifference = right.baseScore + right.connectionScore - (left.baseScore + left.connectionScore);
  if (scoreDifference !== 0) return scoreDifference;
  return (
    compareText(left.symbol.filePath, right.symbol.filePath) ||
    left.symbol.range.start.line - right.symbol.range.start.line ||
    left.symbol.range.start.column - right.symbol.range.start.column ||
    compareText(left.symbol.qualifiedName, right.symbol.qualifiedName) ||
    compareText(left.symbol.id, right.symbol.id)
  );
}

/** Builds a deterministic, bounded graph focus plan without reading live source. */
export function planExploreQuery(graph: ExploreQueryGraph, query: string): ExploreQueryPlan {
  const parsed = parseQuery(query);
  const candidates = graph.symbols
    .map((symbol) => candidateFor(symbol, parsed.fileHints, parsed.identifierTerms))
    .filter((candidate): candidate is Candidate => candidate !== null);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.symbol.id, candidate]));
  for (const edge of graph.edges) {
    if (edge.resolution !== "exact" || edge.sourceId === null || edge.targetId === null) continue;
    const source = candidatesById.get(edge.sourceId);
    const target = candidatesById.get(edge.targetId);
    if (source === undefined || target === undefined || source === target) continue;
    source.connectionScore += 60;
    target.connectionScore += 60;
  }

  const ranked = candidates.sort(compareCandidates);
  const selected: Candidate[] = [];
  const selectedFiles = new Set<string>();
  const selectedByFile = new Map<string, number>();
  for (const candidate of ranked) {
    if (selected.length >= EXPLORE_QUERY_LIMITS.maximumSymbols) break;
    const fileCount = selectedByFile.get(candidate.symbol.filePath) ?? 0;
    if (fileCount >= EXPLORE_QUERY_LIMITS.maximumSymbolsPerFile) continue;
    if (
      fileCount === 0 &&
      selectedFiles.size >= EXPLORE_QUERY_LIMITS.maximumFiles
    ) {
      continue;
    }
    selected.push(candidate);
    selectedFiles.add(candidate.symbol.filePath);
    selectedByFile.set(candidate.symbol.filePath, fileCount + 1);
  }

  const selection: ExploreQuerySelection[] = selected.map((candidate, index) => ({
    rank: index + 1,
    symbol: candidate.symbol,
    score: candidate.baseScore + candidate.connectionScore,
    baseScore: candidate.baseScore,
    connectionScore: candidate.connectionScore,
    matchedTerms: candidate.matchedTerms,
    reasons: [
      ...candidate.baseReasons,
      ...(candidate.connectionScore > 0 ? ["graph-connected" as const] : [])
    ]
  }));
  return {
    policy: EXPLORE_QUERY_PLAN_POLICY,
    query: parsed.boundedQuery,
    normalizedQuery: parsed.normalizedQuery,
    input: parsed.input,
    fileHints: parsed.fileHints,
    identifierTerms: parsed.identifierTerms,
    limits: EXPLORE_QUERY_LIMITS,
    summary: {
      candidateCount: candidates.length,
      selectedCount: selection.length,
      selectedFileCount: selectedFiles.size,
      truncated: selection.length < candidates.length
    },
    selection
  };
}
