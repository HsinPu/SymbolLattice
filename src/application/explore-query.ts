import {
  EDGE_KINDS,
  GENERATED_FILE_CLASSIFIER_VERSION,
  SOURCE_ROLE_CLASSIFIER_VERSION,
  generatedClassificationFor,
  sourceRoleClassificationFor,
  type EdgeKind,
  type GeneratedFileClassification,
  type GraphEdge,
  type IndexedFile,
  type SourceRoleClassification,
  type SymbolNode
} from "../domain/index.js";

export const EXPLORE_QUERY_PLAN_POLICY = "explore-query-plan-v4" as const;
export const EXPLORE_QUERY_SOURCE_WORTH_POLICY = "explore-query-source-worth-v1" as const;
export const EXPLORE_QUERY_GRAPH_MASS_POLICY = "explore-query-graph-mass-v1" as const;
export const EXPLORE_GENERATED_SOURCE_WORTH = 0.3 as const;
export const EXPLORE_TEST_SOURCE_WORTH = 0.5 as const;
export const EXPLORE_QUERY_GRAPH_MASS_LIMITS = {
  maximumRelationships: 32,
  maximumScore: 120
} as const;
export const EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS = {
  contains: 0,
  imports: 3,
  exports: 3,
  references: 4,
  calls: 12,
  instantiates: 10,
  overrides: 10,
  routes: 12,
  handles: 12,
  extends: 8,
  implements: 8
} as const satisfies Readonly<Record<EdgeKind, number>>;
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
  | "graph-connected"
  | "graph-mass";

export interface ExploreQueryGraphMass {
  readonly policy: typeof EXPLORE_QUERY_GRAPH_MASS_POLICY;
  readonly eligibleRelationshipCount: number;
  readonly exactRelationshipCount: number;
  readonly omittedRelationshipCount: number;
  readonly distinctNeighborCount: number;
  readonly uncappedScore: number;
  readonly score: number;
  readonly rankingContribution: number;
  readonly truncated: boolean;
  readonly relationCounts: Readonly<Partial<Record<EdgeKind, number>>>;
}

export interface ExploreQuerySelection {
  readonly rank: number;
  readonly symbol: SymbolNode;
  readonly score: number;
  readonly baseScore: number;
  readonly connectionScore: number;
  readonly graphMass: ExploreQueryGraphMass;
  readonly generated: GeneratedFileClassification;
  readonly sourceWorth: number;
  readonly sourceRole: SourceRoleClassification;
  readonly sourceRoleWorth: number;
  readonly rankingScore: number;
  readonly rankingDecision:
    | "explicit-file-exempt"
    | "handwritten-source-worth"
    | "generated-source-worth";
  readonly sourceRoleDecision:
    | "production-source"
    | "test-source-worth"
    | "test-intent-exempt"
    | "explicit-test-file-exempt";
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
  readonly queryIntent: {
    readonly tests: boolean;
    readonly matchedTerms: readonly string[];
  };
  readonly ranking: {
    readonly policy: typeof EXPLORE_QUERY_SOURCE_WORTH_POLICY;
    readonly generatedSourceWorth: typeof EXPLORE_GENERATED_SOURCE_WORTH;
    readonly explicitFileExempt: true;
    readonly classifierVersion: string;
    readonly testSourceWorth: typeof EXPLORE_TEST_SOURCE_WORTH;
    readonly testIntentExempt: true;
    readonly sourceRoleClassifierVersion: string;
    readonly graphMass: {
      readonly policy: typeof EXPLORE_QUERY_GRAPH_MASS_POLICY;
      readonly maximumRelationships: typeof EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumRelationships;
      readonly maximumScore: typeof EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumScore;
      readonly relationWeights: typeof EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS;
    };
  };
  readonly limits: typeof EXPLORE_QUERY_LIMITS;
  readonly summary: {
    readonly candidateCount: number;
    readonly generatedCandidateCount: number;
    readonly testCandidateCount: number;
    readonly testPenaltyCandidateCount: number;
    readonly graphMassCandidateCount: number;
    readonly graphMassTruncatedCandidateCount: number;
    readonly selectedCount: number;
    readonly selectedGeneratedCount: number;
    readonly selectedTestCount: number;
    readonly selectedFileCount: number;
    readonly truncated: boolean;
  };
  readonly selection: readonly ExploreQuerySelection[];
}

interface ExploreQueryGraph {
  readonly files?: readonly IndexedFile[];
  readonly symbols: readonly SymbolNode[];
  readonly edges: readonly GraphEdge[];
}

interface Candidate {
  readonly symbol: SymbolNode;
  readonly explicitFile: boolean;
  readonly matchedTerms: readonly string[];
  readonly baseReasons: readonly ExploreQuerySelectionReason[];
  readonly baseScore: number;
  readonly generated: GeneratedFileClassification;
  readonly sourceWorth: number;
  readonly sourceRole: SourceRoleClassification;
  readonly sourceRoleWorth: number;
  connectionScore: number;
  graphMass: CandidateGraphMass;
}

interface CandidateGraphMass {
  readonly eligibleRelationshipCount: number;
  readonly exactRelationshipCount: number;
  readonly omittedRelationshipCount: number;
  readonly distinctNeighborCount: number;
  readonly uncappedScore: number;
  readonly score: number;
  readonly truncated: boolean;
  readonly relationCounts: Readonly<Partial<Record<EdgeKind, number>>>;
}

interface GraphMassRelationship {
  readonly edge: GraphEdge;
  readonly neighborId: string;
  readonly weight: number;
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

const TEST_INTENT_TERMS = new Set([
  "spec",
  "specs",
  "test",
  "tests",
  "testing",
  "verification",
  "verify",
  "verifies"
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
  readonly testIntentTerms: readonly string[];
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
  const testIntentTerms: string[] = [];
  const seenTerms = new Set<string>();
  for (const match of withoutFiles.matchAll(IDENTIFIER_EXPRESSION)) {
    const term = normalizedIdentifier(match[0]);
    if (TEST_INTENT_TERMS.has(term)) {
      if (!testIntentTerms.includes(term)) testIntentTerms.push(term);
      continue;
    }
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
    identifierTerms,
    testIntentTerms
  };
}

function fileName(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf("/") + 1);
}

function emptyGraphMass(): CandidateGraphMass {
  return {
    eligibleRelationshipCount: 0,
    exactRelationshipCount: 0,
    omittedRelationshipCount: 0,
    distinctNeighborCount: 0,
    uncappedScore: 0,
    score: 0,
    truncated: false,
    relationCounts: {}
  };
}

function candidateFor(
  symbol: SymbolNode,
  fileHints: readonly string[],
  identifierTerms: readonly string[],
  testIntent: boolean,
  filesByPath: ReadonlyMap<string, IndexedFile>
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
  const generated = generatedClassificationFor(filesByPath.get(symbol.filePath) ?? {});
  const sourceRole = sourceRoleClassificationFor(filesByPath.get(symbol.filePath) ?? {});
  const sourceRoleWorth =
    sourceRole.role !== "test" || explicitFile || testIntent ? 1 : EXPLORE_TEST_SOURCE_WORTH;
  return {
    symbol,
    explicitFile,
    matchedTerms: [...new Set(matchedTerms)],
    baseReasons,
    baseScore,
    generated,
    sourceWorth: generated.generated ? EXPLORE_GENERATED_SOURCE_WORTH : 1,
    sourceRole,
    sourceRoleWorth,
    connectionScore: 0,
    graphMass: emptyGraphMass()
  };
}

function rawScore(candidate: Candidate): number {
  return candidate.baseScore + candidate.connectionScore + candidate.graphMass.score;
}

function rankingScore(candidate: Candidate): number {
  const score = rawScore(candidate);
  return candidate.explicitFile
    ? score
    : Math.round(score * candidate.sourceWorth * candidate.sourceRoleWorth * 1_000_000) / 1_000_000;
}

function graphMassFor(
  relationships: ReadonlyMap<string, GraphMassRelationship>
): CandidateGraphMass {
  const eligible = [...relationships.values()].sort(
    (left, right) =>
      right.weight - left.weight ||
      compareText(left.edge.kind, right.edge.kind) ||
      compareText(left.neighborId, right.neighborId) ||
      compareText(left.edge.id, right.edge.id)
  );
  const selected = eligible.slice(0, EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumRelationships);
  const uncappedScore = selected.reduce((total, relationship) => total + relationship.weight, 0);
  const relationCounts: Partial<Record<EdgeKind, number>> = {};
  for (const kind of EDGE_KINDS) {
    const count = selected.filter((relationship) => relationship.edge.kind === kind).length;
    if (count > 0) relationCounts[kind] = count;
  }
  return {
    eligibleRelationshipCount: eligible.length,
    exactRelationshipCount: selected.length,
    omittedRelationshipCount: eligible.length - selected.length,
    distinctNeighborCount: new Set(selected.map((relationship) => relationship.neighborId)).size,
    uncappedScore,
    score: Math.min(uncappedScore, EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumScore),
    truncated:
      eligible.length > EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumRelationships ||
      uncappedScore > EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumScore,
    relationCounts
  };
}

function compareCandidates(left: Candidate, right: Candidate): number {
  if (left.explicitFile !== right.explicitFile) return left.explicitFile ? -1 : 1;
  const scoreDifference = rankingScore(right) - rankingScore(left);
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
  const filesByPath = new Map((graph.files ?? []).map((file) => [file.path, file]));
  const candidates = graph.symbols
    .map((symbol) => candidateFor(
      symbol,
      parsed.fileHints,
      parsed.identifierTerms,
      parsed.testIntentTerms.length > 0,
      filesByPath
    ))
    .filter((candidate): candidate is Candidate => candidate !== null);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.symbol.id, candidate]));
  const symbolsById = new Map(graph.symbols.map((symbol) => [symbol.id, symbol]));
  const graphMassRelationshipsByCandidate = new Map<
    string,
    Map<string, GraphMassRelationship>
  >();
  const addGraphMassRelationship = (
    candidate: Candidate,
    edge: GraphEdge,
    neighborId: string
  ): void => {
    if (!symbolsById.has(neighborId) || neighborId === candidate.symbol.id) return;
    const weight = EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS[edge.kind];
    if (weight <= 0) return;
    const relationships = graphMassRelationshipsByCandidate.get(candidate.symbol.id) ?? new Map();
    const key = `${edge.kind}:${neighborId}`;
    const current = relationships.get(key);
    if (current === undefined || compareText(edge.id, current.edge.id) < 0) {
      relationships.set(key, { edge, neighborId, weight });
    }
    graphMassRelationshipsByCandidate.set(candidate.symbol.id, relationships);
  };
  for (const edge of graph.edges) {
    if (edge.resolution !== "exact" || edge.sourceId === null || edge.targetId === null) continue;
    const source = candidatesById.get(edge.sourceId);
    const target = candidatesById.get(edge.targetId);
    if (source !== undefined) addGraphMassRelationship(source, edge, edge.targetId);
    if (target !== undefined) addGraphMassRelationship(target, edge, edge.sourceId);
    if (source !== undefined && target !== undefined && source !== target) {
      source.connectionScore += 60;
      target.connectionScore += 60;
    }
  }
  for (const candidate of candidates) {
    candidate.graphMass = graphMassFor(
      graphMassRelationshipsByCandidate.get(candidate.symbol.id) ?? new Map()
    );
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

  const selection: ExploreQuerySelection[] = selected.map((candidate, index) => {
    const score = rawScore(candidate);
    return {
      rank: index + 1,
      symbol: candidate.symbol,
      score,
      baseScore: candidate.baseScore,
      connectionScore: candidate.connectionScore,
      graphMass: {
        policy: EXPLORE_QUERY_GRAPH_MASS_POLICY,
        ...candidate.graphMass,
        rankingContribution: candidate.explicitFile
          ? candidate.graphMass.score
          : Math.round(
              candidate.graphMass.score * candidate.sourceWorth * candidate.sourceRoleWorth * 1_000_000
            ) / 1_000_000
      },
      generated: candidate.generated,
      sourceWorth: candidate.sourceWorth,
      sourceRole: candidate.sourceRole,
      sourceRoleWorth: candidate.sourceRoleWorth,
      rankingScore: rankingScore(candidate),
      rankingDecision: candidate.explicitFile
        ? "explicit-file-exempt"
        : candidate.generated.generated
          ? "generated-source-worth"
          : "handwritten-source-worth",
      sourceRoleDecision: candidate.sourceRole.role !== "test"
        ? "production-source"
        : candidate.explicitFile
          ? "explicit-test-file-exempt"
          : parsed.testIntentTerms.length > 0
            ? "test-intent-exempt"
            : "test-source-worth",
      matchedTerms: candidate.matchedTerms,
      reasons: [
        ...candidate.baseReasons,
        ...(candidate.connectionScore > 0 ? ["graph-connected" as const] : []),
        ...(candidate.graphMass.score > 0 ? ["graph-mass" as const] : [])
      ]
    };
  });
  const classifierVersions = [...new Set(
    candidates.map((candidate) => candidate.generated.classifierVersion)
  )].sort(compareText);
  const sourceRoleClassifierVersions = [...new Set(
    candidates.map((candidate) => candidate.sourceRole.classifierVersion)
  )].sort(compareText);
  return {
    policy: EXPLORE_QUERY_PLAN_POLICY,
    query: parsed.boundedQuery,
    normalizedQuery: parsed.normalizedQuery,
    input: parsed.input,
    fileHints: parsed.fileHints,
    identifierTerms: parsed.identifierTerms,
    queryIntent: {
      tests: parsed.testIntentTerms.length > 0,
      matchedTerms: parsed.testIntentTerms
    },
    ranking: {
      policy: EXPLORE_QUERY_SOURCE_WORTH_POLICY,
      generatedSourceWorth: EXPLORE_GENERATED_SOURCE_WORTH,
      explicitFileExempt: true,
      classifierVersion:
        classifierVersions.length === 1
          ? classifierVersions[0]!
          : classifierVersions.length === 0
            ? GENERATED_FILE_CLASSIFIER_VERSION
          : `mixed:${classifierVersions.join(",")}`,
      testSourceWorth: EXPLORE_TEST_SOURCE_WORTH,
      testIntentExempt: true,
      sourceRoleClassifierVersion:
        sourceRoleClassifierVersions.length === 1
          ? sourceRoleClassifierVersions[0]!
          : sourceRoleClassifierVersions.length === 0
            ? SOURCE_ROLE_CLASSIFIER_VERSION
            : `mixed:${sourceRoleClassifierVersions.join(",")}`,
      graphMass: {
        policy: EXPLORE_QUERY_GRAPH_MASS_POLICY,
        maximumRelationships: EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumRelationships,
        maximumScore: EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumScore,
        relationWeights: EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS
      }
    },
    limits: EXPLORE_QUERY_LIMITS,
    summary: {
      candidateCount: candidates.length,
      generatedCandidateCount: candidates.filter((candidate) => candidate.generated.generated).length,
      testCandidateCount: candidates.filter((candidate) => candidate.sourceRole.role === "test").length,
      testPenaltyCandidateCount: candidates.filter(
        (candidate) => candidate.sourceRole.role === "test" && candidate.sourceRoleWorth < 1
      ).length,
      graphMassCandidateCount: candidates.filter((candidate) => candidate.graphMass.score > 0).length,
      graphMassTruncatedCandidateCount: candidates.filter((candidate) => candidate.graphMass.truncated).length,
      selectedCount: selection.length,
      selectedGeneratedCount: selection.filter((candidate) => candidate.generated.generated).length,
      selectedTestCount: selection.filter((candidate) => candidate.sourceRole.role === "test").length,
      selectedFileCount: selectedFiles.size,
      truncated: selection.length < candidates.length
    },
    selection
  };
}
