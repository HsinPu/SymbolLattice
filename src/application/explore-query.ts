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
  type SourceRole,
  type SourceRoleClassification,
  type SymbolNode
} from "../domain/index.js";

export const EXPLORE_QUERY_PLAN_POLICY = "explore-query-plan-v8" as const;
export const EXPLORE_QUERY_SOURCE_WORTH_POLICY = "explore-query-source-worth-v1" as const;
export const EXPLORE_QUERY_GRAPH_MASS_POLICY = "explore-query-graph-mass-v1" as const;
export const EXPLORE_QUERY_GRAPH_DIFFUSION_POLICY =
  "explore-query-graph-diffusion-v1" as const;
export const EXPLORE_QUERY_LOW_VALUE_FILTER_POLICY =
  "explore-query-low-value-filter-v2" as const;
export const EXPLORE_GENERATED_SOURCE_WORTH = 0.3 as const;
export const EXPLORE_TEST_SOURCE_WORTH = 0.5 as const;
export const EXPLORE_ICON_SOURCE_WORTH = 0.5 as const;
export const EXPLORE_LOCALIZATION_SOURCE_WORTH = 0.5 as const;
export const EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS = {
  minimumProductionFileCount: 2,
  maximumExcludedFileReceipts: 16
} as const;
export const EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_POLICY =
  "explore-query-relative-file-score-floor-v1" as const;
export const EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS = {
  absoluteFloor: 80,
  fractionOfTop: 0.2,
  maximumFloor: 120,
  backfillTargetFileCount: 3,
  maximumFileReceipts: 16
} as const;
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
export const EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS = {
  restartProbability: 0.25,
  maximumHops: 4,
  maximumSeedFiles: 64,
  maximumSeedSymbols: 256,
  maximumSeedSymbolsPerFile: 4,
  maximumNodes: 4_096,
  maximumRelationships: 16_384,
  maximumIterations: 96,
  convergenceTolerance: 0.000_000_001,
  maximumScore: 120
} as const;
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
  | "graph-mass"
  | "graph-diffusion";

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

export interface ExploreQueryGraphDiffusion {
  readonly policy: typeof EXPLORE_QUERY_GRAPH_DIFFUSION_POLICY;
  readonly state: "seed" | "reached" | "outside-subgraph" | "no-mass";
  readonly seed: boolean;
  readonly seedWeight: number;
  readonly nodeMass: number;
  readonly fileMass: number;
  readonly normalizedFileMass: number;
  readonly score: number;
  readonly rankingContribution: number;
}

export interface ExploreQueryGraphDiffusionReceipt {
  readonly policy: typeof EXPLORE_QUERY_GRAPH_DIFFUSION_POLICY;
  readonly reason: "no-candidates" | "no-seeds" | "no-reachable-relationships" | "completed";
  readonly applied: boolean;
  readonly seedMode: "none" | "strong-lexical" | "partial-lexical" | "all-candidates-fallback";
  readonly seedFileWeighting: "uniform-per-file";
  readonly restartProbability: typeof EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.restartProbability;
  readonly maximumHops: typeof EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumHops;
  readonly maximumSeedFiles: typeof EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedFiles;
  readonly maximumSeedSymbols: typeof EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedSymbols;
  readonly maximumSeedSymbolsPerFile:
    typeof EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedSymbolsPerFile;
  readonly maximumNodes: typeof EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumNodes;
  readonly maximumRelationships:
    typeof EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumRelationships;
  readonly maximumIterations: typeof EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumIterations;
  readonly convergenceTolerance:
    typeof EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.convergenceTolerance;
  readonly maximumScore: typeof EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumScore;
  readonly relationWeights: typeof EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS;
  readonly seedFileCount: number;
  readonly seedSymbolCount: number;
  readonly normalizedSeedWeight: number;
  readonly seedFileLimitReached: boolean;
  readonly seedSymbolLimitReached: boolean;
  readonly subgraphNodeCount: number;
  readonly subgraphRelationshipCount: number;
  readonly hopLimitReached: boolean;
  readonly nodeLimitReached: boolean;
  readonly relationshipLimitReached: boolean;
  readonly iterations: number;
  readonly converged: boolean;
  readonly residual: number;
  readonly candidateWithMassCount: number;
  readonly topCandidateFileMass: number;
}

export interface ExploreQuerySelection {
  readonly rank: number;
  readonly symbol: SymbolNode;
  readonly score: number;
  readonly baseScore: number;
  readonly connectionScore: number;
  readonly graphMass: ExploreQueryGraphMass;
  readonly graphDiffusion: ExploreQueryGraphDiffusion;
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
    | "explicit-test-file-exempt"
    | "icon-source-worth"
    | "icon-intent-exempt"
    | "explicit-icon-file-exempt"
    | "localization-source-worth"
    | "localization-intent-exempt"
    | "explicit-localization-file-exempt";
  readonly matchedTerms: readonly string[];
  readonly reasons: readonly ExploreQuerySelectionReason[];
}

export interface ExploreQueryExcludedFile {
  readonly filePath: string;
  readonly candidateCount: number;
  readonly reason:
    | "test-source-filtered"
    | "icon-source-filtered"
    | "localization-source-filtered";
  readonly sourceRole: SourceRoleClassification;
}

export interface ExploreQueryLowValueFilter {
  readonly policy: typeof EXPLORE_QUERY_LOW_VALUE_FILTER_POLICY;
  readonly reason:
    | "no-low-value-candidates"
    | "all-low-value-candidates-exempt"
    | "insufficient-production-evidence"
    | "sufficient-production-evidence";
  readonly applied: boolean;
  readonly minimumProductionFileCount:
    typeof EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS.minimumProductionFileCount;
  readonly maximumExcludedFileReceipts:
    typeof EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS.maximumExcludedFileReceipts;
  readonly candidateFileCount: number;
  readonly productionCandidateFileCount: number;
  readonly lowValueCandidateFileCount: number;
  readonly testCandidateFileCount: number;
  readonly iconCandidateFileCount: number;
  readonly localizationCandidateFileCount: number;
  readonly retainedCandidateCount: number;
  readonly retainedFileCount: number;
  readonly excludedLowValueCandidateCount: number;
  readonly excludedLowValueFileCount: number;
  readonly excludedTestCandidateCount: number;
  readonly excludedTestFileCount: number;
  readonly excludedIconCandidateCount: number;
  readonly excludedIconFileCount: number;
  readonly excludedLocalizationCandidateCount: number;
  readonly excludedLocalizationFileCount: number;
  readonly excludedFilesTruncated: boolean;
  readonly excludedFiles: readonly ExploreQueryExcludedFile[];
}

export interface ExploreQueryScoreFloorFileReceipt {
  readonly filePath: string;
  readonly candidateCount: number;
  readonly fileScore: number;
  readonly bestCandidateId: string;
  readonly bestCandidateScore: number;
  readonly reason: "minimum-retained-files" | "below-relative-floor";
}

export interface ExploreQueryRelativeScoreFloor {
  readonly policy: typeof EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_POLICY;
  readonly reason:
    | "no-candidate-files"
    | "all-files-past-floor"
    | "minimum-backfill-applied"
    | "relative-floor-applied";
  readonly applied: boolean;
  readonly absoluteFloor: typeof EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.absoluteFloor;
  readonly fractionOfTop: typeof EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.fractionOfTop;
  readonly maximumFloor: typeof EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFloor;
  readonly backfillTargetFileCount:
    typeof EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.backfillTargetFileCount;
  readonly maximumFileReceipts:
    typeof EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFileReceipts;
  readonly fileScoreAggregation: "maximum-candidate-score";
  readonly backfillEvidenceFloor: number;
  readonly topFileScore: number;
  readonly computedFloor: number;
  readonly candidateFileCount: number;
  readonly filesPastFloorCount: number;
  readonly retainedFileCount: number;
  readonly backfilledFileCount: number;
  readonly excludedFileCount: number;
  readonly backfilledFilesTruncated: boolean;
  readonly backfilledFiles: readonly ExploreQueryScoreFloorFileReceipt[];
  readonly excludedFilesTruncated: boolean;
  readonly excludedFiles: readonly ExploreQueryScoreFloorFileReceipt[];
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
    readonly icons: boolean;
    readonly localization: boolean;
    readonly matchedTerms: readonly string[];
  };
  readonly filtering: ExploreQueryLowValueFilter;
  readonly scoreFloor: ExploreQueryRelativeScoreFloor;
  readonly ranking: {
    readonly policy: typeof EXPLORE_QUERY_SOURCE_WORTH_POLICY;
    readonly generatedSourceWorth: typeof EXPLORE_GENERATED_SOURCE_WORTH;
    readonly explicitFileExempt: true;
    readonly classifierVersion: string;
    readonly testSourceWorth: typeof EXPLORE_TEST_SOURCE_WORTH;
    readonly testIntentExempt: true;
    readonly iconSourceWorth: typeof EXPLORE_ICON_SOURCE_WORTH;
    readonly iconIntentExempt: true;
    readonly localizationSourceWorth: typeof EXPLORE_LOCALIZATION_SOURCE_WORTH;
    readonly localizationIntentExempt: true;
    readonly sourceRoleClassifierVersion: string;
    readonly graphMass: {
      readonly policy: typeof EXPLORE_QUERY_GRAPH_MASS_POLICY;
      readonly maximumRelationships: typeof EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumRelationships;
      readonly maximumScore: typeof EXPLORE_QUERY_GRAPH_MASS_LIMITS.maximumScore;
      readonly relationWeights: typeof EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS;
    };
    readonly graphDiffusion: ExploreQueryGraphDiffusionReceipt;
  };
  readonly limits: typeof EXPLORE_QUERY_LIMITS;
  readonly summary: {
    readonly candidateCount: number;
    readonly generatedCandidateCount: number;
    readonly lowValueCandidateCount: number;
    readonly lowValuePenaltyCandidateCount: number;
    readonly testCandidateCount: number;
    readonly testPenaltyCandidateCount: number;
    readonly iconCandidateCount: number;
    readonly localizationCandidateCount: number;
    readonly filteredCandidateCount: number;
    readonly scoreFloorFilteredCandidateCount: number;
    readonly scoreFloorFilteredFileCount: number;
    readonly graphMassCandidateCount: number;
    readonly graphMassTruncatedCandidateCount: number;
    readonly graphDiffusionCandidateCount: number;
    readonly graphDiffusionReachedCandidateCount: number;
    readonly selectedCount: number;
    readonly selectedGeneratedCount: number;
    readonly selectedLowValueCount: number;
    readonly selectedTestCount: number;
    readonly selectedIconCount: number;
    readonly selectedLocalizationCount: number;
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
  graphDiffusion: CandidateGraphDiffusion;
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

interface CandidateGraphDiffusion {
  readonly state: ExploreQueryGraphDiffusion["state"];
  readonly seed: boolean;
  readonly seedWeight: number;
  readonly nodeMass: number;
  readonly fileMass: number;
  readonly normalizedFileMass: number;
  readonly score: number;
}

interface GraphDiffusionRelationship {
  readonly key: string;
  readonly edge: GraphEdge;
  readonly sourceId: string;
  readonly targetId: string;
  readonly weight: number;
}

interface GraphDiffusionResult {
  readonly receipt: ExploreQueryGraphDiffusionReceipt;
  readonly byCandidateId: ReadonlyMap<string, CandidateGraphDiffusion>;
}

interface CandidateFilterResult {
  readonly receipt: ExploreQueryLowValueFilter;
  readonly retained: readonly Candidate[];
}

interface CandidateScoreFloorResult {
  readonly receipt: ExploreQueryRelativeScoreFloor;
  readonly retained: readonly Candidate[];
}

interface CandidateFileScore {
  readonly filePath: string;
  readonly candidates: readonly Candidate[];
  readonly bestCandidate: Candidate;
  readonly fileScore: number;
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

const ICON_INTENT_TERMS = new Set(["icon", "icons"]);
const LOCALIZATION_INTENT_TERMS = new Set([
  "i18n",
  "locale",
  "locales",
  "localization",
  "localize",
  "translation",
  "translations"
]);

interface ExploreQueryRoleIntent {
  readonly tests: boolean;
  readonly icons: boolean;
  readonly localization: boolean;
}

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
  readonly iconIntentTerms: readonly string[];
  readonly localizationIntentTerms: readonly string[];
  readonly matchedIntentTerms: readonly string[];
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
  const iconIntentTerms: string[] = [];
  const localizationIntentTerms: string[] = [];
  const matchedIntentTerms: string[] = [];
  const recordIntentTerm = (terms: string[], term: string): void => {
    if (!terms.includes(term)) terms.push(term);
    if (
      !matchedIntentTerms.includes(term) &&
      matchedIntentTerms.length < EXPLORE_QUERY_LIMITS.maximumIdentifierTerms
    ) {
      matchedIntentTerms.push(term);
    }
  };
  const seenTerms = new Set<string>();
  for (const match of withoutFiles.matchAll(IDENTIFIER_EXPRESSION)) {
    const term = normalizedIdentifier(match[0]);
    if (TEST_INTENT_TERMS.has(term)) {
      recordIntentTerm(testIntentTerms, term);
      continue;
    }
    if (ICON_INTENT_TERMS.has(term)) {
      recordIntentTerm(iconIntentTerms, term);
      continue;
    }
    if (LOCALIZATION_INTENT_TERMS.has(term)) {
      recordIntentTerm(localizationIntentTerms, term);
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
    testIntentTerms,
    iconIntentTerms,
    localizationIntentTerms,
    matchedIntentTerms
  };
}

function sourceRoleIntentExempt(role: SourceRole, intent: ExploreQueryRoleIntent): boolean {
  return role === "test"
    ? intent.tests
    : role === "icon"
      ? intent.icons
      : role === "localization"
        ? intent.localization
        : false;
}

function sourceRoleWorthFor(
  role: SourceRole,
  explicitFile: boolean,
  intent: ExploreQueryRoleIntent
): number {
  if (role === "production" || explicitFile || sourceRoleIntentExempt(role, intent)) return 1;
  return role === "test"
    ? EXPLORE_TEST_SOURCE_WORTH
    : role === "icon"
      ? EXPLORE_ICON_SOURCE_WORTH
      : EXPLORE_LOCALIZATION_SOURCE_WORTH;
}

function sourceRoleDecisionFor(
  role: SourceRole,
  explicitFile: boolean,
  intent: ExploreQueryRoleIntent
): ExploreQuerySelection["sourceRoleDecision"] {
  if (role === "production") return "production-source";
  if (role === "test") {
    return explicitFile
      ? "explicit-test-file-exempt"
      : intent.tests
        ? "test-intent-exempt"
        : "test-source-worth";
  }
  if (role === "icon") {
    return explicitFile
      ? "explicit-icon-file-exempt"
      : intent.icons
        ? "icon-intent-exempt"
        : "icon-source-worth";
  }
  return explicitFile
    ? "explicit-localization-file-exempt"
    : intent.localization
      ? "localization-intent-exempt"
      : "localization-source-worth";
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

function emptyGraphDiffusion(): CandidateGraphDiffusion {
  return {
    state: "outside-subgraph",
    seed: false,
    seedWeight: 0,
    nodeMass: 0,
    fileMass: 0,
    normalizedFileMass: 0,
    score: 0
  };
}

function candidateFor(
  symbol: SymbolNode,
  fileHints: readonly string[],
  identifierTerms: readonly string[],
  roleIntent: ExploreQueryRoleIntent,
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
  const sourceRoleWorth = sourceRoleWorthFor(sourceRole.role, explicitFile, roleIntent);
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
    graphMass: emptyGraphMass(),
    graphDiffusion: emptyGraphDiffusion()
  };
}

function rawScore(candidate: Candidate): number {
  return (
    candidate.baseScore +
    candidate.connectionScore +
    candidate.graphMass.score +
    candidate.graphDiffusion.score
  );
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

function graphDiffusionFor(
  graph: ExploreQueryGraph,
  candidates: readonly Candidate[]
): GraphDiffusionResult {
  const baseReceipt = {
    policy: EXPLORE_QUERY_GRAPH_DIFFUSION_POLICY,
    seedFileWeighting: "uniform-per-file" as const,
    restartProbability: EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.restartProbability,
    maximumHops: EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumHops,
    maximumSeedFiles: EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedFiles,
    maximumSeedSymbols: EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedSymbols,
    maximumSeedSymbolsPerFile:
      EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedSymbolsPerFile,
    maximumNodes: EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumNodes,
    maximumRelationships: EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumRelationships,
    maximumIterations: EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumIterations,
    convergenceTolerance: EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.convergenceTolerance,
    maximumScore: EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumScore,
    relationWeights: EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS
  };
  if (candidates.length === 0) {
    return {
      byCandidateId: new Map(),
      receipt: {
        ...baseReceipt,
        reason: "no-candidates",
        applied: false,
        seedMode: "none",
        seedFileCount: 0,
        seedSymbolCount: 0,
        normalizedSeedWeight: 0,
        seedFileLimitReached: false,
        seedSymbolLimitReached: false,
        subgraphNodeCount: 0,
        subgraphRelationshipCount: 0,
        hopLimitReached: false,
        nodeLimitReached: false,
        relationshipLimitReached: false,
        iterations: 0,
        converged: false,
        residual: 0,
        candidateWithMassCount: 0,
        topCandidateFileMass: 0
      }
    };
  }

  const strongSeeds = candidates.filter(
    (candidate) =>
      candidate.explicitFile ||
      candidate.baseReasons.includes("exact-symbol-term") ||
      candidate.baseReasons.includes("qualified-symbol-term")
  );
  const partialSeeds = candidates.filter((candidate) =>
    candidate.baseReasons.includes("partial-symbol-term")
  );
  const seedMode: ExploreQueryGraphDiffusionReceipt["seedMode"] =
    strongSeeds.length > 0
      ? "strong-lexical"
      : partialSeeds.length > 0
        ? "partial-lexical"
        : "all-candidates-fallback";
  const eligibleSeeds =
    seedMode === "strong-lexical"
      ? strongSeeds
      : seedMode === "partial-lexical"
        ? partialSeeds
        : [...candidates];
  const seedGroups = new Map<string, Candidate[]>();
  for (const candidate of eligibleSeeds) {
    const group = seedGroups.get(candidate.symbol.filePath) ?? [];
    group.push(candidate);
    seedGroups.set(candidate.symbol.filePath, group);
  }
  const rankedSeedFiles = [...seedGroups.entries()].sort((left, right) => {
    const leftBest = [...left[1]].sort(compareLexicalSeedCandidates)[0];
    const rightBest = [...right[1]].sort(compareLexicalSeedCandidates)[0];
    if (leftBest !== undefined && rightBest !== undefined) {
      const byCandidate = compareLexicalSeedCandidates(leftBest, rightBest);
      if (byCandidate !== 0) return byCandidate;
    }
    return compareText(left[0], right[0]);
  });
  const selectedSeedFiles = rankedSeedFiles.slice(
    0,
    EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedFiles
  );
  const seedFileLimitReached = rankedSeedFiles.length > selectedSeedFiles.length;
  const selectedSeeds: Candidate[] = [];
  let seedSymbolLimitReached = false;
  for (const [, fileCandidates] of selectedSeedFiles) {
    const selectedForFile = [...fileCandidates]
      .sort(compareLexicalSeedCandidates)
      .slice(0, EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedSymbolsPerFile);
    if (selectedForFile.length < fileCandidates.length) seedSymbolLimitReached = true;
    for (const candidate of selectedForFile) {
      if (selectedSeeds.length >= EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedSymbols) {
        seedSymbolLimitReached = true;
        break;
      }
      selectedSeeds.push(candidate);
    }
    if (selectedSeeds.length >= EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumSeedSymbols) break;
  }
  if (selectedSeeds.length === 0 || selectedSeedFiles.length === 0) {
    return {
      byCandidateId: new Map(),
      receipt: {
        ...baseReceipt,
        reason: "no-seeds",
        applied: false,
        seedMode: "none",
        seedFileCount: 0,
        seedSymbolCount: 0,
        normalizedSeedWeight: 0,
        seedFileLimitReached,
        seedSymbolLimitReached,
        subgraphNodeCount: 0,
        subgraphRelationshipCount: 0,
        hopLimitReached: false,
        nodeLimitReached: false,
        relationshipLimitReached: false,
        iterations: 0,
        converged: false,
        residual: 0,
        candidateWithMassCount: 0,
        topCandidateFileMass: 0
      }
    };
  }

  const seedsByFile = new Map<string, Candidate[]>();
  for (const seed of selectedSeeds) {
    const group = seedsByFile.get(seed.symbol.filePath) ?? [];
    group.push(seed);
    seedsByFile.set(seed.symbol.filePath, group);
  }
  const seedWeights = new Map<string, number>();
  const fileWeight = 1 / seedsByFile.size;
  for (const fileSeeds of seedsByFile.values()) {
    const symbolWeight = fileWeight / fileSeeds.length;
    for (const seed of fileSeeds) seedWeights.set(seed.symbol.id, symbolWeight);
  }

  const symbolsById = new Map(graph.symbols.map((symbol) => [symbol.id, symbol]));
  const relationships = new Map<string, GraphDiffusionRelationship>();
  for (const edge of graph.edges) {
    if (
      edge.resolution !== "exact" ||
      edge.sourceId === null ||
      edge.targetId === null ||
      edge.sourceId === edge.targetId ||
      !symbolsById.has(edge.sourceId) ||
      !symbolsById.has(edge.targetId)
    ) {
      continue;
    }
    const weight = EXPLORE_QUERY_GRAPH_MASS_RELATION_WEIGHTS[edge.kind];
    if (weight <= 0) continue;
    const [sourceId, targetId] = [edge.sourceId, edge.targetId].sort(compareText);
    const key = `${sourceId}\u0000${targetId}\u0000${edge.kind}`;
    const current = relationships.get(key);
    if (current === undefined || compareText(edge.id, current.edge.id) < 0) {
      relationships.set(key, { key, edge, sourceId: sourceId!, targetId: targetId!, weight });
    }
  }
  const adjacency = new Map<string, GraphDiffusionRelationship[]>();
  for (const relationship of relationships.values()) {
    for (const nodeId of [relationship.sourceId, relationship.targetId]) {
      const list = adjacency.get(nodeId) ?? [];
      list.push(relationship);
      adjacency.set(nodeId, list);
    }
  }
  for (const list of adjacency.values()) {
    list.sort(
      (left, right) =>
        right.weight - left.weight ||
        compareText(left.edge.kind, right.edge.kind) ||
        compareText(left.key, right.key)
    );
  }

  const selectedNodeIds = new Set(selectedSeeds.map((candidate) => candidate.symbol.id));
  const depths = new Map<string, number>([...selectedNodeIds].map((id) => [id, 0]));
  const queue = [...selectedNodeIds].sort(compareText);
  const selectedRelationships = new Map<string, GraphDiffusionRelationship>();
  let nodeLimitReached = false;
  let relationshipLimitReached = false;
  let hopLimitReached = false;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const nodeId = queue[cursor]!;
    const depth = depths.get(nodeId) ?? 0;
    if (depth >= EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumHops) {
      if (
        (adjacency.get(nodeId) ?? []).some(
          (relationship) => !selectedRelationships.has(relationship.key)
        )
      ) {
        hopLimitReached = true;
      }
      continue;
    }
    for (const relationship of adjacency.get(nodeId) ?? []) {
      const neighborId =
        relationship.sourceId === nodeId ? relationship.targetId : relationship.sourceId;
      const newRelationship = !selectedRelationships.has(relationship.key);
      if (
        newRelationship &&
        selectedRelationships.size >= EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumRelationships
      ) {
        relationshipLimitReached = true;
        continue;
      }
      if (!selectedNodeIds.has(neighborId)) {
        if (selectedNodeIds.size >= EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumNodes) {
          nodeLimitReached = true;
          continue;
        }
        selectedNodeIds.add(neighborId);
        depths.set(neighborId, depth + 1);
        queue.push(neighborId);
      }
      if (newRelationship) {
        selectedRelationships.set(relationship.key, relationship);
      }
    }
  }

  const emptyCandidateDiffusion = new Map(
    candidates.map((candidate) => [
      candidate.symbol.id,
      {
        ...emptyGraphDiffusion(),
        state: seedWeights.has(candidate.symbol.id) ? "seed" as const : "outside-subgraph" as const,
        seed: seedWeights.has(candidate.symbol.id),
        seedWeight: roundedScore(seedWeights.get(candidate.symbol.id) ?? 0)
      }
    ])
  );
  if (selectedRelationships.size === 0) {
    return {
      byCandidateId: emptyCandidateDiffusion,
      receipt: {
        ...baseReceipt,
        reason: "no-reachable-relationships",
        applied: false,
        seedMode,
        seedFileCount: seedsByFile.size,
        seedSymbolCount: selectedSeeds.length,
        normalizedSeedWeight: roundedScore([...seedWeights.values()].reduce((sum, value) => sum + value, 0)),
        seedFileLimitReached,
        seedSymbolLimitReached,
        subgraphNodeCount: selectedNodeIds.size,
        subgraphRelationshipCount: 0,
        hopLimitReached,
        nodeLimitReached,
        relationshipLimitReached,
        iterations: 0,
        converged: false,
        residual: 0,
        candidateWithMassCount: 0,
        topCandidateFileMass: 0
      }
    };
  }

  const nodeIds = [...selectedNodeIds].sort(compareText);
  const nodeIndex = new Map(nodeIds.map((id, index) => [id, index]));
  const weightedAdjacency = Array.from(
    { length: nodeIds.length },
    () => new Map<number, number>()
  );
  for (const relationship of selectedRelationships.values()) {
    const sourceIndex = nodeIndex.get(relationship.sourceId);
    const targetIndex = nodeIndex.get(relationship.targetId);
    if (sourceIndex === undefined || targetIndex === undefined) continue;
    weightedAdjacency[sourceIndex]!.set(
      targetIndex,
      (weightedAdjacency[sourceIndex]!.get(targetIndex) ?? 0) + relationship.weight
    );
    weightedAdjacency[targetIndex]!.set(
      sourceIndex,
      (weightedAdjacency[targetIndex]!.get(sourceIndex) ?? 0) + relationship.weight
    );
  }
  const restart = new Array<number>(nodeIds.length).fill(0);
  for (const [seedId, weight] of seedWeights) {
    const index = nodeIndex.get(seedId);
    if (index !== undefined) restart[index] = weight;
  }
  const alpha = EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.restartProbability;
  let mass = restart.slice();
  let residual = 0;
  let iterations = 0;
  let converged = false;
  for (let iteration = 1; iteration <= EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumIterations; iteration += 1) {
    const next = restart.map((value) => alpha * value);
    let danglingMass = 0;
    for (let index = 0; index < mass.length; index += 1) {
      const neighbors = weightedAdjacency[index]!;
      const totalWeight = [...neighbors.values()].reduce((sum, weight) => sum + weight, 0);
      if (totalWeight === 0) {
        danglingMass += mass[index]!;
        continue;
      }
      for (const [neighborIndex, weight] of neighbors) {
        next[neighborIndex]! += (1 - alpha) * mass[index]! * (weight / totalWeight);
      }
    }
    if (danglingMass > 0) {
      for (let index = 0; index < next.length; index += 1) {
        next[index]! += (1 - alpha) * danglingMass * restart[index]!;
      }
    }
    residual = next.reduce((sum, value, index) => sum + Math.abs(value - mass[index]!), 0);
    mass = next;
    iterations = iteration;
    if (residual <= EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.convergenceTolerance) {
      converged = true;
      break;
    }
  }

  const nodeMass = new Map(nodeIds.map((id, index) => [id, mass[index] ?? 0]));
  const fileMass = new Map<string, number>();
  for (const [nodeId, value] of nodeMass) {
    const symbol = symbolsById.get(nodeId);
    if (symbol === undefined) continue;
    fileMass.set(symbol.filePath, (fileMass.get(symbol.filePath) ?? 0) + value);
  }
  const candidateFileMasses = candidates.map(
    (candidate) => fileMass.get(candidate.symbol.filePath) ?? 0
  );
  const topCandidateFileMass = Math.max(0, ...candidateFileMasses);
  const byCandidateId = new Map<string, CandidateGraphDiffusion>();
  for (const candidate of candidates) {
    const seedWeight = seedWeights.get(candidate.symbol.id) ?? 0;
    const candidateNodeMass = nodeMass.get(candidate.symbol.id) ?? 0;
    const candidateFileMass = fileMass.get(candidate.symbol.filePath) ?? 0;
    const normalizedFileMass =
      topCandidateFileMass > 0 ? candidateFileMass / topCandidateFileMass : 0;
    byCandidateId.set(candidate.symbol.id, {
      state: seedWeight > 0
        ? "seed"
        : candidateFileMass > 0
          ? "reached"
          : selectedNodeIds.has(candidate.symbol.id)
            ? "no-mass"
            : "outside-subgraph",
      seed: seedWeight > 0,
      seedWeight: roundedScore(seedWeight),
      nodeMass: roundedScore(candidateNodeMass),
      fileMass: roundedScore(candidateFileMass),
      normalizedFileMass: roundedScore(normalizedFileMass),
      score: roundedScore(
        normalizedFileMass * EXPLORE_QUERY_GRAPH_DIFFUSION_LIMITS.maximumScore
      )
    });
  }
  return {
    byCandidateId,
    receipt: {
      ...baseReceipt,
      reason: "completed",
      applied: true,
      seedMode,
      seedFileCount: seedsByFile.size,
      seedSymbolCount: selectedSeeds.length,
      normalizedSeedWeight: roundedScore([...seedWeights.values()].reduce((sum, value) => sum + value, 0)),
      seedFileLimitReached,
      seedSymbolLimitReached,
      subgraphNodeCount: selectedNodeIds.size,
      subgraphRelationshipCount: selectedRelationships.size,
      hopLimitReached,
      nodeLimitReached,
      relationshipLimitReached,
      iterations,
      converged,
      residual: Math.round(residual * 1_000_000_000_000) / 1_000_000_000_000,
      candidateWithMassCount: [...byCandidateId.values()].filter((value) => value.fileMass > 0).length,
      topCandidateFileMass: roundedScore(topCandidateFileMass)
    }
  };
}

function compareLexicalSeedCandidates(left: Candidate, right: Candidate): number {
  if (left.explicitFile !== right.explicitFile) return left.explicitFile ? -1 : 1;
  const scoreDifference = right.baseScore - left.baseScore;
  if (scoreDifference !== 0) return scoreDifference;
  return (
    compareText(left.symbol.filePath, right.symbol.filePath) ||
    left.symbol.range.start.line - right.symbol.range.start.line ||
    left.symbol.range.start.column - right.symbol.range.start.column ||
    compareText(left.symbol.qualifiedName, right.symbol.qualifiedName) ||
    compareText(left.symbol.id, right.symbol.id)
  );
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

function filterLowValueCandidates(
  candidates: readonly Candidate[],
  roleIntent: ExploreQueryRoleIntent
): CandidateFilterResult {
  const candidateFiles = new Set(candidates.map((candidate) => candidate.symbol.filePath));
  const productionFiles = new Set(
    candidates
      .filter(
        (candidate) =>
          candidate.sourceRole.role === "production" &&
          candidate.sourceRole.classifierVersion === SOURCE_ROLE_CLASSIFIER_VERSION
      )
      .map((candidate) => candidate.symbol.filePath)
  );
  const testFiles = new Set(
    candidates
      .filter((candidate) => candidate.sourceRole.role === "test")
      .map((candidate) => candidate.symbol.filePath)
  );
  const iconFiles = new Set(
    candidates
      .filter((candidate) => candidate.sourceRole.role === "icon")
      .map((candidate) => candidate.symbol.filePath)
  );
  const localizationFiles = new Set(
    candidates
      .filter((candidate) => candidate.sourceRole.role === "localization")
      .map((candidate) => candidate.symbol.filePath)
  );
  const lowValueCandidates = candidates.filter(
    (candidate) => candidate.sourceRole.role !== "production"
  );
  const unrequestedLowValue = lowValueCandidates.filter(
    (candidate) =>
      !candidate.explicitFile &&
      !sourceRoleIntentExempt(candidate.sourceRole.role, roleIntent)
  );
  const reason: ExploreQueryLowValueFilter["reason"] =
    lowValueCandidates.length === 0
      ? "no-low-value-candidates"
      : unrequestedLowValue.length === 0
        ? "all-low-value-candidates-exempt"
        : productionFiles.size < EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS.minimumProductionFileCount
          ? "insufficient-production-evidence"
          : "sufficient-production-evidence";
  const applied = reason === "sufficient-production-evidence";
  const excluded = applied ? unrequestedLowValue : [];
  const excludedCandidates = new Set(excluded);
  const retained = candidates.filter((candidate) => !excludedCandidates.has(candidate));
  const excludedByFile = new Map<string, Candidate[]>();
  for (const candidate of excluded) {
    const current = excludedByFile.get(candidate.symbol.filePath) ?? [];
    current.push(candidate);
    excludedByFile.set(candidate.symbol.filePath, current);
  }
  const allExcludedFiles = [...excludedByFile.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([filePath, fileCandidates]) => ({
      filePath,
      candidateCount: fileCandidates.length,
      reason: fileCandidates[0]!.sourceRole.role === "test"
        ? "test-source-filtered" as const
        : fileCandidates[0]!.sourceRole.role === "icon"
          ? "icon-source-filtered" as const
          : "localization-source-filtered" as const,
      sourceRole: fileCandidates[0]!.sourceRole
    }));
  const excludedFilesForRole = (role: Exclude<SourceRole, "production">): number =>
    allExcludedFiles.filter((file) => file.sourceRole.role === role).length;
  return {
    retained,
    receipt: {
      policy: EXPLORE_QUERY_LOW_VALUE_FILTER_POLICY,
      reason,
      applied,
      minimumProductionFileCount:
        EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS.minimumProductionFileCount,
      maximumExcludedFileReceipts:
        EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS.maximumExcludedFileReceipts,
      candidateFileCount: candidateFiles.size,
      productionCandidateFileCount: productionFiles.size,
      lowValueCandidateFileCount: new Set([
        ...testFiles,
        ...iconFiles,
        ...localizationFiles
      ]).size,
      testCandidateFileCount: testFiles.size,
      iconCandidateFileCount: iconFiles.size,
      localizationCandidateFileCount: localizationFiles.size,
      retainedCandidateCount: retained.length,
      retainedFileCount: new Set(retained.map((candidate) => candidate.symbol.filePath)).size,
      excludedLowValueCandidateCount: excluded.length,
      excludedLowValueFileCount: allExcludedFiles.length,
      excludedTestCandidateCount: excluded.filter((candidate) => candidate.sourceRole.role === "test").length,
      excludedTestFileCount: excludedFilesForRole("test"),
      excludedIconCandidateCount: excluded.filter((candidate) => candidate.sourceRole.role === "icon").length,
      excludedIconFileCount: excludedFilesForRole("icon"),
      excludedLocalizationCandidateCount: excluded.filter(
        (candidate) => candidate.sourceRole.role === "localization"
      ).length,
      excludedLocalizationFileCount: excludedFilesForRole("localization"),
      excludedFilesTruncated:
        allExcludedFiles.length >
        EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS.maximumExcludedFileReceipts,
      excludedFiles: allExcludedFiles.slice(
        0,
        EXPLORE_QUERY_LOW_VALUE_FILTER_LIMITS.maximumExcludedFileReceipts
      )
    }
  };
}

function roundedScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function applyRelativeFileScoreFloor(
  candidates: readonly Candidate[]
): CandidateScoreFloorResult {
  const candidatesByFile = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const current = candidatesByFile.get(candidate.symbol.filePath) ?? [];
    current.push(candidate);
    candidatesByFile.set(candidate.symbol.filePath, current);
  }
  const files: CandidateFileScore[] = [...candidatesByFile.entries()]
    .map(([filePath, fileCandidates]) => {
      const rankedCandidates = [...fileCandidates].sort(compareCandidates);
      const bestCandidate = rankedCandidates[0]!;
      return {
        filePath,
        candidates: fileCandidates,
        bestCandidate,
        fileScore: rankingScore(bestCandidate)
      };
    })
    .sort(
      (left, right) =>
        right.fileScore - left.fileScore || compareText(left.filePath, right.filePath)
    );
  const topFileScore = files[0]?.fileScore ?? 0;
  const computedFloor = files.length === 0
    ? 0
    : roundedScore(Math.max(
        EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.absoluteFloor,
        Math.min(
          EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFloor,
          topFileScore * EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.fractionOfTop
        )
      ));
  const filesPastFloor = files.filter((file) => file.fileScore >= computedFloor);
  const filesBelowFloor = files.filter((file) => file.fileScore < computedFloor);
  const backfillTargetFileCount = Math.min(
    EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.backfillTargetFileCount,
    files.length
  );
  const backfillEvidenceFloor = filesPastFloor.length === 0
    ? 0
    : EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.absoluteFloor;
  const backfilledFiles = filesBelowFloor
    .filter((file) => backfillEvidenceFloor === 0
      ? file.fileScore > 0
      : file.fileScore >= backfillEvidenceFloor)
    .slice(0, Math.max(0, backfillTargetFileCount - filesPastFloor.length));
  const retainedPaths = new Set([
    ...filesPastFloor.map((file) => file.filePath),
    ...backfilledFiles.map((file) => file.filePath)
  ]);
  const excludedFiles = filesBelowFloor.filter((file) => !retainedPaths.has(file.filePath));
  const retained = candidates.filter((candidate) => retainedPaths.has(candidate.symbol.filePath));
  const receiptFor = (
    file: CandidateFileScore,
    reason: ExploreQueryScoreFloorFileReceipt["reason"]
  ): ExploreQueryScoreFloorFileReceipt => ({
    filePath: file.filePath,
    candidateCount: file.candidates.length,
    fileScore: file.fileScore,
    bestCandidateId: file.bestCandidate.symbol.id,
    bestCandidateScore: rankingScore(file.bestCandidate),
    reason
  });
  const reason: ExploreQueryRelativeScoreFloor["reason"] = files.length === 0
    ? "no-candidate-files"
    : excludedFiles.length === 0 && backfilledFiles.length === 0
      ? "all-files-past-floor"
      : backfilledFiles.length > 0
        ? "minimum-backfill-applied"
        : "relative-floor-applied";
  return {
    retained,
    receipt: {
      policy: EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_POLICY,
      reason,
      applied: excludedFiles.length > 0,
      absoluteFloor: EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.absoluteFloor,
      fractionOfTop: EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.fractionOfTop,
      maximumFloor: EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFloor,
      backfillTargetFileCount:
        EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.backfillTargetFileCount,
      maximumFileReceipts: EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFileReceipts,
      fileScoreAggregation: "maximum-candidate-score",
      backfillEvidenceFloor,
      topFileScore,
      computedFloor,
      candidateFileCount: files.length,
      filesPastFloorCount: filesPastFloor.length,
      retainedFileCount: retainedPaths.size,
      backfilledFileCount: backfilledFiles.length,
      excludedFileCount: excludedFiles.length,
      backfilledFilesTruncated:
        backfilledFiles.length > EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFileReceipts,
      backfilledFiles: backfilledFiles
        .slice(0, EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFileReceipts)
        .map((file) => receiptFor(file, "minimum-retained-files")),
      excludedFilesTruncated:
        excludedFiles.length > EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFileReceipts,
      excludedFiles: excludedFiles
        .slice(0, EXPLORE_QUERY_RELATIVE_SCORE_FLOOR_LIMITS.maximumFileReceipts)
        .sort((left, right) => compareText(left.filePath, right.filePath))
        .map((file) => receiptFor(file, "below-relative-floor"))
    }
  };
}

/** Builds a deterministic, bounded graph focus plan without reading live source. */
export function planExploreQuery(graph: ExploreQueryGraph, query: string): ExploreQueryPlan {
  const parsed = parseQuery(query);
  const roleIntent: ExploreQueryRoleIntent = {
    tests: parsed.testIntentTerms.length > 0,
    icons: parsed.iconIntentTerms.length > 0,
    localization: parsed.localizationIntentTerms.length > 0
  };
  const filesByPath = new Map((graph.files ?? []).map((file) => [file.path, file]));
  const candidates = graph.symbols
    .map((symbol) => candidateFor(
      symbol,
      parsed.fileHints,
      parsed.identifierTerms,
      roleIntent,
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
  const filtering = filterLowValueCandidates(candidates, roleIntent);
  const graphDiffusion = graphDiffusionFor(graph, filtering.retained);
  for (const candidate of candidates) {
    candidate.graphDiffusion =
      graphDiffusion.byCandidateId.get(candidate.symbol.id) ?? emptyGraphDiffusion();
  }

  const scoreFloor = applyRelativeFileScoreFloor(filtering.retained);
  const ranked = [...scoreFloor.retained].sort(compareCandidates);
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
      graphDiffusion: {
        policy: EXPLORE_QUERY_GRAPH_DIFFUSION_POLICY,
        ...candidate.graphDiffusion,
        rankingContribution: candidate.explicitFile
          ? candidate.graphDiffusion.score
          : Math.round(
              candidate.graphDiffusion.score *
              candidate.sourceWorth *
              candidate.sourceRoleWorth *
              1_000_000
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
      sourceRoleDecision: sourceRoleDecisionFor(
        candidate.sourceRole.role,
        candidate.explicitFile,
        roleIntent
      ),
      matchedTerms: candidate.matchedTerms,
      reasons: [
        ...candidate.baseReasons,
        ...(candidate.connectionScore > 0 ? ["graph-connected" as const] : []),
        ...(candidate.graphMass.score > 0 ? ["graph-mass" as const] : []),
        ...(candidate.graphDiffusion.score > 0 ? ["graph-diffusion" as const] : [])
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
      ...roleIntent,
      matchedTerms: parsed.matchedIntentTerms
    },
    filtering: filtering.receipt,
    scoreFloor: scoreFloor.receipt,
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
      iconSourceWorth: EXPLORE_ICON_SOURCE_WORTH,
      iconIntentExempt: true,
      localizationSourceWorth: EXPLORE_LOCALIZATION_SOURCE_WORTH,
      localizationIntentExempt: true,
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
      },
      graphDiffusion: graphDiffusion.receipt
    },
    limits: EXPLORE_QUERY_LIMITS,
    summary: {
      candidateCount: candidates.length,
      generatedCandidateCount: candidates.filter((candidate) => candidate.generated.generated).length,
      lowValueCandidateCount: candidates.filter(
        (candidate) => candidate.sourceRole.role !== "production"
      ).length,
      lowValuePenaltyCandidateCount: candidates.filter(
        (candidate) => candidate.sourceRole.role !== "production" && candidate.sourceRoleWorth < 1
      ).length,
      testCandidateCount: candidates.filter((candidate) => candidate.sourceRole.role === "test").length,
      testPenaltyCandidateCount: candidates.filter(
        (candidate) => candidate.sourceRole.role === "test" && candidate.sourceRoleWorth < 1
      ).length,
      iconCandidateCount: candidates.filter((candidate) => candidate.sourceRole.role === "icon").length,
      localizationCandidateCount: candidates.filter(
        (candidate) => candidate.sourceRole.role === "localization"
      ).length,
      filteredCandidateCount: filtering.receipt.excludedLowValueCandidateCount,
      scoreFloorFilteredCandidateCount:
        filtering.retained.length - scoreFloor.retained.length,
      scoreFloorFilteredFileCount: scoreFloor.receipt.excludedFileCount,
      graphMassCandidateCount: candidates.filter((candidate) => candidate.graphMass.score > 0).length,
      graphMassTruncatedCandidateCount: candidates.filter((candidate) => candidate.graphMass.truncated).length,
      graphDiffusionCandidateCount: candidates.filter(
        (candidate) => candidate.graphDiffusion.fileMass > 0
      ).length,
      graphDiffusionReachedCandidateCount: candidates.filter(
        (candidate) => candidate.graphDiffusion.state === "reached"
      ).length,
      selectedCount: selection.length,
      selectedGeneratedCount: selection.filter((candidate) => candidate.generated.generated).length,
      selectedLowValueCount: selection.filter(
        (candidate) => candidate.sourceRole.role !== "production"
      ).length,
      selectedTestCount: selection.filter((candidate) => candidate.sourceRole.role === "test").length,
      selectedIconCount: selection.filter((candidate) => candidate.sourceRole.role === "icon").length,
      selectedLocalizationCount: selection.filter(
        (candidate) => candidate.sourceRole.role === "localization"
      ).length,
      selectedFileCount: selectedFiles.size,
      truncated: selection.length < candidates.length
    },
    selection
  };
}
