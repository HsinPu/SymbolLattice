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

export const EXPLORE_QUERY_PLAN_POLICY = "explore-query-plan-v7" as const;
export const EXPLORE_QUERY_SOURCE_WORTH_POLICY = "explore-query-source-worth-v1" as const;
export const EXPLORE_QUERY_GRAPH_MASS_POLICY = "explore-query-graph-mass-v1" as const;
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
      }
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
