import type { ExploreConnection, ExploreFocus } from "./types.js";
import { identifierTermGroups, identifierTermVariants, identifierWords } from "../domain/identifier-search.js";
import type { ExplorePathSpinePlan } from "./explore-path-spines.js";
import { EXPLORE_GENERATED_SOURCE_WORTH } from "./explore-query.js";
import { EXPLORE_CALLEE_SOURCE_LIMITS, matchExploreCalleeSource, type ExploreCalleeSourceSearch } from "./explore-callee-source.js";
import type { SourceLexicalMatch } from "../domain/source-lexical.js";
import type { SymbolNode } from "../domain/types.js";

export const EXPLORE_SOURCE_WINDOW_POLICY = "explore-source-windows-v10" as const;
export const EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY =
  "explore-source-window-allocation-v5" as const;
export const EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS = {
  minimumPerWindow: 256,
  maximumShareFraction: 0.7,
  spineBoost: 1.25,
  generatedSourceWorth: EXPLORE_GENERATED_SOURCE_WORTH,
  relativeCliffFraction: 0.15,
  relativeCliffMaximumWeight: 10,
  wholeFileGraceFraction: 0.15,
  wholeFileGraceMaximumCharacters: 800,
  wholeFileBuyMinimumCoverageFraction: 0.6,
  wholeFileBuyOvershootFraction: 0.15
} as const;
export const EXPLORE_SOURCE_WINDOW_LIMITS = {
  contextPaddingLines: 3,
  mergeGapLines: 3,
  maximumWindows: 8,
  maximumWindowsPerFocus: 2,
  maximumImpactHops: 2,
  maximumImpactWindows: 2,
  maximumImpactCallerLines: 20,
  maximumFlowCalleeWindows: 2,
  pathSpineWindowsExemptPerFocus: true
} as const;

export interface ExploreSourceWindowPlanItem {
  readonly index: number;
  readonly focusRank: number;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly connectionEdgeIds: readonly string[];
  readonly relatedSymbolIds: readonly string[];
  readonly pathSpineIndexes: readonly number[];
  readonly relevanceWeight: number;
  readonly reason: "exact-connection-site" | "exact-focus-call" | "exact-focus-callee" | "exact-path-spine" | "exact-impact-call" | "exact-callee-source" | "exact-flow-callee";
  readonly sourceMatches?: readonly SourceLexicalMatch[];
}

export interface ExploreSourceWindowPlan {
  readonly policy: typeof EXPLORE_SOURCE_WINDOW_POLICY;
  readonly limits: typeof EXPLORE_SOURCE_WINDOW_LIMITS;
  readonly calleeSourceSearch?: ExploreCalleeSourceSearch;
  readonly summary: {
    readonly candidateCount: number;
    readonly selectedCount: number;
    readonly selectedFocusCount: number;
    readonly unavailableFileSiteCount: number;
    readonly replacedLowerRankedCallWindowCount?: number;
    readonly truncated: boolean;
  };
  readonly windows: readonly ExploreSourceWindowPlanItem[];
}

export interface ExploreSourceWindowCharacterAllocation {
  readonly policy: typeof EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY;
  readonly budget: {
    readonly totalCharacterBudget: number;
    readonly primaryEmittedCharacters: number;
    readonly availableCharacters: number;
    readonly minimumPerWindow: typeof EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.minimumPerWindow;
    readonly maximumShareFraction: typeof EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.maximumShareFraction;
    readonly generatedSourceWorth: typeof EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.generatedSourceWorth;
    readonly relativeCliffFraction: typeof EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.relativeCliffFraction;
    readonly relativeCliffMaximumWeight: typeof EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.relativeCliffMaximumWeight;
    readonly relativeCliffThreshold: number;
    readonly wholeFileGraceFraction: typeof EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileGraceFraction;
    readonly wholeFileGraceMaximumCharacters: typeof EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileGraceMaximumCharacters;
    readonly wholeFileBuyMinimumCoverageFraction: typeof EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileBuyMinimumCoverageFraction;
    readonly wholeFileBuyOvershootFraction: typeof EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileBuyOvershootFraction;
    readonly wholeFileBuyOvershootBudget: number;
    readonly wholeFileBuyOvershootSpentCharacters: number;
    readonly remainingPhase?: {
      readonly availableCharacters: number;
      readonly relativeCliffThreshold: number;
    };
  };
  readonly summary: {
    readonly candidateCount: number;
    readonly generatedCandidates: number;
    readonly cliffedWindows: number;
    readonly wholeFileEligibleCandidates: number;
    readonly wholeFilePromotedWindows: number;
    readonly requestedCharacters: number;
    readonly baseAllocatedCharacters: number;
    readonly allocatedCharacters: number;
    readonly unusedCharacters: number;
    readonly truncated: boolean;
  };
  readonly windows: readonly {
    readonly index: number;
    readonly filePath: string;
    readonly windowRequestedCharacters: number;
    readonly fullFileCharacters: number;
    readonly requestedCharacters: number;
    readonly relevanceWeight: number;
    readonly generated: boolean;
    readonly generatedClassifierVersion: string;
    readonly generatedEvidenceRuleIds: readonly string[];
    readonly sourceWorth: number;
    readonly effectiveWeight: number;
    readonly cliffExempt: boolean;
    readonly allocationDecision: "admitted" | "relative-cliff";
    readonly maximumShareCharacters: number;
    readonly baseAllocatedCharacters: number;
    readonly allocatedCharacters: number;
    readonly wholeFileEligible: boolean;
    readonly wholeFileCoverageFraction: number;
    readonly wholeFileGraceCharacters: number;
    readonly wholeFileOvershootCharacters: number;
    readonly wholeFileBuySpentCharacters: number;
    readonly renderMode: "window" | "whole-file";
    readonly wholeFileDecision:
      | "not-eligible"
      | "duplicate-file"
      | "window-only"
      | "exact-fit"
      | "grace"
      | "buy";
    readonly truncated: boolean;
    readonly reason: "score-spine-and-source-worth";
    readonly allocationPhase?: "remaining-budget";
  }[];
}

export interface ExploreSourceWindowAllocationCandidate {
  readonly index: number;
  readonly filePath: string;
  readonly requestedCharacters: number;
  readonly fullFileCharacters: number;
  readonly relevanceWeight: number;
  readonly wholeFileEligible: boolean;
  readonly generated?: boolean;
  readonly generatedClassifierVersion?: string;
  readonly generatedEvidenceRuleIds?: readonly string[];
  readonly cliffExempt?: boolean;
  readonly spareOnly?: boolean;
}

interface MutableWindow {
  readonly focusRank: number;
  readonly filePath: string;
  startLine: number;
  endLine: number;
  readonly connectionEdgeIds: string[];
  readonly relatedSymbolIds: string[];
  readonly pathSpineIndexes: number[];
  relevanceWeight: number;
  reason: ExploreSourceWindowPlanItem["reason"];
  readonly sourceMatches?: readonly SourceLexicalMatch[];
}

interface WindowSite {
  readonly focus: ExploreFocus;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly evidenceStartLine: number;
  readonly evidenceEndLine: number;
  readonly connectionEdgeIds: readonly string[];
  readonly relatedSymbolIds: readonly string[];
  readonly pathSpineIndexes: readonly number[];
  readonly relevanceWeight: number;
  readonly reason: ExploreSourceWindowPlanItem["reason"];
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function roundedWeight(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Reserves the remainder of one total source envelope in stable window order. */
export function allocateExploreSourceWindowCharacters(input: {
  readonly totalCharacterBudget: number;
  readonly primaryEmittedCharacters: number;
  readonly candidates: readonly ExploreSourceWindowAllocationCandidate[];
}): ExploreSourceWindowCharacterAllocation {
  if (
    !Number.isSafeInteger(input.totalCharacterBudget) ||
    input.totalCharacterBudget < 0 ||
    !Number.isSafeInteger(input.primaryEmittedCharacters) ||
    input.primaryEmittedCharacters < 0 ||
    input.primaryEmittedCharacters > input.totalCharacterBudget
  ) {
    throw new RangeError("Explore source window budget must contain valid whole-number totals.");
  }
  const candidates = [...input.candidates].sort((left, right) => left.index - right.index);
  if (candidates.length > EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows) {
    throw new RangeError("Explore source window candidates exceed the fixed maximum.");
  }
  const indexes = new Set<number>();
  for (const candidate of candidates) {
    if (
      !Number.isSafeInteger(candidate.index) ||
      candidate.index < 0 ||
      indexes.has(candidate.index) ||
      typeof candidate.filePath !== "string" ||
      candidate.filePath.length === 0 ||
      !Number.isSafeInteger(candidate.requestedCharacters) ||
      candidate.requestedCharacters <= 0 ||
      !Number.isSafeInteger(candidate.fullFileCharacters) ||
      candidate.fullFileCharacters < candidate.requestedCharacters ||
      !Number.isFinite(candidate.relevanceWeight) ||
      candidate.relevanceWeight <= 0 ||
      typeof candidate.wholeFileEligible !== "boolean" ||
      (candidate.generated !== undefined && typeof candidate.generated !== "boolean") ||
      (candidate.generatedClassifierVersion !== undefined &&
        (typeof candidate.generatedClassifierVersion !== "string" ||
          candidate.generatedClassifierVersion.length === 0)) ||
      (candidate.generatedEvidenceRuleIds !== undefined &&
        (!Array.isArray(candidate.generatedEvidenceRuleIds) ||
          candidate.generatedEvidenceRuleIds.some(
            (ruleId) => typeof ruleId !== "string" || ruleId.length === 0
          ))) ||
      (candidate.cliffExempt !== undefined && typeof candidate.cliffExempt !== "boolean") ||
      (candidate.spareOnly !== undefined && typeof candidate.spareOnly !== "boolean") ||
      (candidate.spareOnly === true && candidate.wholeFileEligible)
    ) {
      throw new RangeError("Explore source window candidates require unique indexes and positive sizes.");
    }
    indexes.add(candidate.index);
  }

  // Preserve every existing reservation, including whole-file promotions.
  // Structural flow supplements may use only what that complete plan leaves.
  if (candidates.some(candidate => candidate.spareOnly === true)) {
    const primary = allocateExploreSourceWindowCharacters({ ...input,
      candidates: candidates.filter(candidate => candidate.spareOnly !== true) });
    const remaining = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: input.totalCharacterBudget,
      primaryEmittedCharacters: input.primaryEmittedCharacters + primary.summary.allocatedCharacters,
      candidates: candidates.filter(candidate => candidate.spareOnly === true)
        .map(candidate => ({ ...candidate, spareOnly: false }))
    });
    return {
      ...primary,
      budget: { ...primary.budget, remainingPhase: {
        availableCharacters: remaining.budget.availableCharacters,
        relativeCliffThreshold: remaining.budget.relativeCliffThreshold
      } },
      summary: {
        candidateCount: candidates.length,
        generatedCandidates: primary.summary.generatedCandidates + remaining.summary.generatedCandidates,
        cliffedWindows: primary.summary.cliffedWindows + remaining.summary.cliffedWindows,
        wholeFileEligibleCandidates: primary.summary.wholeFileEligibleCandidates,
        wholeFilePromotedWindows: primary.summary.wholeFilePromotedWindows,
        requestedCharacters: primary.summary.requestedCharacters + remaining.summary.requestedCharacters,
        baseAllocatedCharacters: primary.summary.baseAllocatedCharacters + remaining.summary.baseAllocatedCharacters,
        allocatedCharacters: primary.summary.allocatedCharacters + remaining.summary.allocatedCharacters,
        unusedCharacters: remaining.summary.unusedCharacters,
        truncated: primary.summary.truncated || remaining.summary.truncated
      },
      windows: [...primary.windows, ...remaining.windows.map(window => ({ ...window,
        allocationPhase: "remaining-budget" as const }))].sort((left, right) => left.index - right.index)
    };
  }

  const availableCharacters = input.totalCharacterBudget - input.primaryEmittedCharacters;
  const weightedCandidates = candidates.map((candidate) => {
    const generated = candidate.generated === true;
    const sourceWorth = generated
      ? EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.generatedSourceWorth
      : 1;
    return {
      candidate,
      generated,
      generatedClassifierVersion:
        candidate.generatedClassifierVersion ?? "unclassified-allocation-input",
      generatedEvidenceRuleIds: [...new Set(candidate.generatedEvidenceRuleIds ?? [])].sort(compareText),
      sourceWorth,
      effectiveWeight: roundedWeight(candidate.relevanceWeight * sourceWorth),
      cliffExempt: candidate.cliffExempt === true
    };
  });
  const topEffectiveWeight = weightedCandidates.reduce(
    (top, candidate) => Math.max(top, candidate.effectiveWeight),
    0
  );
  const relativeCliffThreshold = roundedWeight(Math.min(
    topEffectiveWeight * EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.relativeCliffFraction,
    EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.relativeCliffMaximumWeight
  ));
  const scoredCandidates = weightedCandidates.map((candidate) => ({
    ...candidate,
    cliffed: !candidate.cliffExempt && candidate.effectiveWeight < relativeCliffThreshold
  }));
  const admittedCandidates = scoredCandidates.filter((candidate) => !candidate.cliffed);
  const maximumShareCharacters = admittedCandidates.length <= 1
    ? availableCharacters
    : Math.max(
        EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.minimumPerWindow,
        Math.floor(
          availableCharacters * EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.maximumShareFraction
        )
      );
  const mutable = scoredCandidates.map((candidate) => ({
    ...candidate,
    maximumShareCharacters: candidate.cliffed ? 0 : maximumShareCharacters,
    allocatedCharacters: 0
  }));
  const guaranteed = mutable.map((allocation) =>
    allocation.cliffed
      ? 0
      :
    Math.min(
      allocation.candidate.requestedCharacters,
      allocation.maximumShareCharacters,
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.minimumPerWindow
    )
  );
  const guaranteedTotal = guaranteed.reduce((total, value) => total + value, 0);
  if (guaranteedTotal <= availableCharacters) {
    for (const [index, allocation] of mutable.entries()) {
      allocation.allocatedCharacters = guaranteed[index] ?? 0;
    }
  }
  let remaining =
    availableCharacters - mutable.reduce((total, item) => total + item.allocatedCharacters, 0);
  while (remaining > 0) {
    const active = mutable.filter(
      (allocation) =>
        !allocation.cliffed &&
        allocation.allocatedCharacters < allocation.candidate.requestedCharacters &&
        allocation.allocatedCharacters < allocation.maximumShareCharacters
    );
    if (active.length === 0) break;
    const totalWeight = active.reduce(
      (total, allocation) => total + allocation.effectiveWeight,
      0
    );
    const roundCapacity = remaining;
    let distributed = 0;
    for (const allocation of active) {
      if (remaining === 0) break;
      const capacity = Math.min(
        allocation.candidate.requestedCharacters,
        allocation.maximumShareCharacters
      ) - allocation.allocatedCharacters;
      const weightedShare = Math.max(
        1,
        Math.floor(
          roundCapacity * allocation.effectiveWeight / totalWeight
        )
      );
      const addition = Math.min(capacity, weightedShare, remaining);
      allocation.allocatedCharacters += addition;
      remaining -= addition;
      distributed += addition;
    }
    if (distributed === 0) break;
  }
  const wholeFileOwnerByPath = new Map<string, number>();
  for (const candidate of candidates) {
    const weighted = mutable.find((item) => item.candidate.index === candidate.index);
    if (weighted?.cliffed === true) continue;
    if (!candidate.wholeFileEligible) continue;
    const currentIndex = wholeFileOwnerByPath.get(candidate.filePath);
    const current = currentIndex === undefined
      ? undefined
      : candidates.find((item) => item.index === currentIndex);
    if (
      current === undefined ||
      candidate.relevanceWeight > current.relevanceWeight ||
      (candidate.relevanceWeight === current.relevanceWeight && candidate.index < current.index)
    ) {
      wholeFileOwnerByPath.set(candidate.filePath, candidate.index);
    }
  }
  const baseAllocatedCharacters = mutable.reduce(
    (total, allocation) => total + allocation.allocatedCharacters,
    0
  );
  let wholeFileRemainingCharacters = availableCharacters - baseAllocatedCharacters;
  const wholeFileBuyOvershootBudget = Math.floor(
    input.totalCharacterBudget *
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileBuyOvershootFraction
  );
  let wholeFileBuyOvershootSpentCharacters = 0;
  const windows = mutable.map((allocation) => {
    const candidate = allocation.candidate;
    const baseAllocated = allocation.allocatedCharacters;
    const coverage = candidate.fullFileCharacters === 0
      ? 0
      : baseAllocated / candidate.fullFileCharacters;
    const graceCharacters = Math.min(
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileGraceMaximumCharacters,
      Math.floor(
        baseAllocated * EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileGraceFraction
      )
    );
    const overshoot = Math.max(0, candidate.fullFileCharacters - baseAllocated);
    let decision: ExploreSourceWindowCharacterAllocation["windows"][number]["wholeFileDecision"] =
      "window-only";
    let wholeFileBuySpentCharacters = 0;
    let allocatedCharacters = baseAllocated;
    if (!candidate.wholeFileEligible) {
      decision = "not-eligible";
    } else if (wholeFileOwnerByPath.get(candidate.filePath) !== candidate.index) {
      decision = "duplicate-file";
    } else if (overshoot === 0) {
      decision = "exact-fit";
    } else if (
      overshoot <= graceCharacters &&
      overshoot <= wholeFileRemainingCharacters
    ) {
      decision = "grace";
      allocatedCharacters += overshoot;
      wholeFileRemainingCharacters -= overshoot;
    } else if (
      coverage >=
        EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileBuyMinimumCoverageFraction &&
      overshoot <= wholeFileRemainingCharacters &&
      overshoot <=
        wholeFileBuyOvershootBudget - wholeFileBuyOvershootSpentCharacters
    ) {
      decision = "buy";
      allocatedCharacters += overshoot;
      wholeFileRemainingCharacters -= overshoot;
      wholeFileBuySpentCharacters = overshoot;
      wholeFileBuyOvershootSpentCharacters += overshoot;
    }
    const renderMode = decision === "exact-fit" || decision === "grace" || decision === "buy"
      ? "whole-file" as const
      : "window" as const;
    const requestedCharacters = renderMode === "whole-file"
      ? candidate.fullFileCharacters
      : candidate.requestedCharacters;
    return {
      index: candidate.index,
      filePath: candidate.filePath,
      windowRequestedCharacters: candidate.requestedCharacters,
      fullFileCharacters: candidate.fullFileCharacters,
      requestedCharacters,
      relevanceWeight: candidate.relevanceWeight,
      generated: allocation.generated,
      generatedClassifierVersion: allocation.generatedClassifierVersion,
      generatedEvidenceRuleIds: allocation.generatedEvidenceRuleIds,
      sourceWorth: allocation.sourceWorth,
      effectiveWeight: allocation.effectiveWeight,
      cliffExempt: allocation.cliffExempt,
      allocationDecision:
        allocation.cliffed
          ? "relative-cliff" as const
          : "admitted" as const,
      maximumShareCharacters: allocation.maximumShareCharacters,
      baseAllocatedCharacters: baseAllocated,
      allocatedCharacters,
      wholeFileEligible: candidate.wholeFileEligible,
      wholeFileCoverageFraction: coverage,
      wholeFileGraceCharacters: graceCharacters,
      wholeFileOvershootCharacters: renderMode === "whole-file" ? overshoot : 0,
      wholeFileBuySpentCharacters,
      renderMode,
      wholeFileDecision: decision,
      truncated: allocatedCharacters < requestedCharacters,
      reason: "score-spine-and-source-worth" as const
    };
  });
  const requestedCharacters = windows.reduce(
    (total, window) => total + window.requestedCharacters,
    0
  );
  const allocatedCharacters = windows.reduce(
    (total, window) => total + window.allocatedCharacters,
    0
  );
  return {
    policy: EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY,
    budget: {
      totalCharacterBudget: input.totalCharacterBudget,
      primaryEmittedCharacters: input.primaryEmittedCharacters,
      availableCharacters,
      minimumPerWindow: EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.minimumPerWindow,
      maximumShareFraction: EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.maximumShareFraction,
      generatedSourceWorth: EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.generatedSourceWorth,
      relativeCliffFraction: EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.relativeCliffFraction,
      relativeCliffMaximumWeight:
        EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.relativeCliffMaximumWeight,
      relativeCliffThreshold,
      wholeFileGraceFraction: EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileGraceFraction,
      wholeFileGraceMaximumCharacters:
        EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileGraceMaximumCharacters,
      wholeFileBuyMinimumCoverageFraction:
        EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileBuyMinimumCoverageFraction,
      wholeFileBuyOvershootFraction:
        EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.wholeFileBuyOvershootFraction,
      wholeFileBuyOvershootBudget,
      wholeFileBuyOvershootSpentCharacters
    },
    summary: {
      candidateCount: candidates.length,
      generatedCandidates: windows.filter((window) => window.generated).length,
      cliffedWindows: windows.filter(
        (window) => window.allocationDecision === "relative-cliff"
      ).length,
      wholeFileEligibleCandidates: candidates.filter((candidate) => candidate.wholeFileEligible).length,
      wholeFilePromotedWindows: windows.filter((window) => window.renderMode === "whole-file").length,
      requestedCharacters,
      baseAllocatedCharacters,
      allocatedCharacters,
      unusedCharacters: availableCharacters - allocatedCharacters,
      truncated: windows.some((window) => window.truncated)
    },
    windows
  };
}

function coveredByPrimarySource(site: WindowSite, focuses: readonly ExploreFocus[]): boolean {
  const ranges = focuses.flatMap(({ source }) => {
    if (source === null || source.filePath !== site.filePath || source.emittedCharacters === 0) return [];
    const start = source.startLine + (source.range.start.column > 1 ? 1 : 0);
    const end = source.endLine - (source.truncated && source.range.end.column > 1 ? 1 : 0);
    return end < start ? [] : [{ start, end }];
  }).sort((left, right) => left.start - right.start);
  let nextLine = site.evidenceStartLine;
  for (const range of ranges) {
    if (range.start > nextLine) break;
    nextLine = Math.max(nextLine, range.end + 1);
    if (nextLine > site.evidenceEndLine) return true;
  }
  return false;
}

/**
 * Plans bounded source for exact connections, direct calls and path bridges.
 * Direct-call source is limited to files already requested for this exploration.
 * It never synthesizes a call site or follows heuristic edges.
 */
export function planExploreSourceWindows(
  focuses: readonly ExploreFocus[],
  connections: readonly ExploreConnection[],
  pathSpinePlan?: ExplorePathSpinePlan,
  queryTerms: readonly string[] = [],
  sourceDocuments?: ReadonlyMap<string, { readonly sourceText: string }>,
  executionIntent = false
): ExploreSourceWindowPlan {
  const focusBySymbolId = new Map(
    [...focuses]
      .sort((left, right) => left.rank - right.rank || compareText(left.symbol.id, right.symbol.id))
      .map((focus) => [focus.symbol.id, focus] as const)
  );
  const connectionSites: WindowSite[] = connections
    .filter(
      (connection) =>
        connection.edge.resolution === "exact" &&
        connection.edge.sourceId === connection.source.id &&
        connection.edge.targetId === connection.target.id &&
        focusBySymbolId.get(connection.source.id)?.symbol.filePath === connection.edge.filePath
    )
    .map((connection): WindowSite => ({
      focus: focusBySymbolId.get(connection.source.id)!,
      filePath: connection.edge.filePath,
      startLine: Math.max(
        1,
        connection.edge.range.start.line - EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines
      ),
      endLine:
        connection.edge.range.end.line + EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines,
      evidenceStartLine: connection.edge.range.start.line,
      evidenceEndLine: connection.edge.range.end.line,
      connectionEdgeIds: [connection.edge.id],
      relatedSymbolIds: [connection.target.id],
      pathSpineIndexes: [],
      relevanceWeight: focusBySymbolId.get(connection.source.id)!.score,
      reason: "exact-connection-site"
    }));
  const spineSites: WindowSite[] = (pathSpinePlan?.spines ?? []).flatMap((spine) => {
    const focus = focuses.find((item) => item.rank === spine.fromFocusRank);
    if (focus === undefined) return [];
    return spine.bridgeSymbols.map((bridge): WindowSite => ({
      focus,
      filePath: bridge.filePath,
      startLine: Math.max(
        1,
        bridge.range.start.line - EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines
      ),
      endLine: bridge.range.end.line + EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines,
      evidenceStartLine: bridge.range.start.line,
      evidenceEndLine: bridge.range.end.line,
      connectionEdgeIds: spine.edgeIds,
      relatedSymbolIds: [bridge.id],
      pathSpineIndexes: [spine.index],
      relevanceWeight: spine.score * EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.spineBoost,
      reason: "exact-path-spine"
    }));
  });
  const availableFiles = new Set([
    ...focuses.map((focus) => focus.symbol.filePath),
    ...(pathSpinePlan?.spines ?? []).flatMap((spine) => spine.bridgeSymbols.map((symbol) => symbol.filePath))
  ]);
  const unavailableEdges = new Set<string>();
  const seenEdges = new Set(connectionSites.map((site) => site.connectionEdgeIds[0]));
  const callSites: WindowSite[] = [];
  const calleeSites: WindowSite[] = [];
  const seenCallees = new Set<string>();
  const sourceCallees = new Map<string, { symbol: SymbolNode; site: WindowSite }>();
  const flowCallees = new Map<string, { site: WindowSite; callLine: number; callColumn: number }>();
  for (const focus of [...focuses].sort((left, right) => left.rank - right.rank)) {
    const namedFlow = executionIntent &&
      focus.reasons.some(reason => reason === "exact-symbol-term" || reason === "qualified-symbol-term") &&
      queryTerms.some(term => focus.matchedTerms.includes(term));
    for (const [direction, relations] of [["incoming", focus.callers.items], ["outgoing", focus.callees.items]] as const) {
      for (const relation of relations) {
        const edge = relation.edge;
        const caller = direction === "incoming" ? relation.symbol : focus.symbol;
        const callee = direction === "incoming" ? focus.symbol : relation.symbol;
        if (edge.kind !== "calls" || edge.resolution !== "exact" ||
            edge.sourceId !== caller.id || edge.targetId !== callee.id || edge.filePath !== caller.filePath) continue;
        if (namedFlow && direction === "outgoing" && callee.id !== caller.id &&
            availableFiles.has(callee.filePath) && sourceDocuments?.has(callee.filePath) &&
            ["function", "method", "entrypoint"].includes(callee.kind) && !/\.d\.[cm]?ts$/iu.test(callee.filePath)) {
          const current = flowCallees.get(callee.id);
          if (current === undefined || (current.site.focus.rank === focus.rank &&
              (edge.range.start.line < current.callLine ||
               (edge.range.start.line === current.callLine && edge.range.start.column < current.callColumn) ||
               (edge.range.start.line === current.callLine && edge.range.start.column === current.callColumn &&
                compareText(edge.id, current.site.connectionEdgeIds[0]!) < 0)))) {
            flowCallees.set(callee.id, { callLine: edge.range.start.line, callColumn: edge.range.start.column,
              site: { focus, filePath: callee.filePath,
                startLine: Math.max(1, callee.range.start.line - EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines),
                endLine: callee.range.end.line + EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines,
                evidenceStartLine: callee.range.start.line, evidenceEndLine: callee.range.end.line,
                connectionEdgeIds: [edge.id], relatedSymbolIds: [callee.id], pathSpineIndexes: [],
                relevanceWeight: focus.score, reason: "exact-flow-callee" }
            });
          }
        }
        const calleeWords = new Set([callee.name.toLowerCase(), ...identifierWords(callee.name)]);
        if (direction === "outgoing" && availableFiles.has(callee.filePath) && !seenCallees.has(callee.id) &&
            ["function", "method", "entrypoint"].includes(callee.kind) &&
            queryTerms.some((term) => identifierTermVariants(term).some((variant) => calleeWords.has(variant)))) {
          seenCallees.add(callee.id);
          calleeSites.push({
            focus, filePath: callee.filePath,
            startLine: Math.max(1, callee.range.start.line - EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines),
            endLine: callee.range.end.line + EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines,
            evidenceStartLine: callee.range.start.line, evidenceEndLine: callee.range.end.line,
            connectionEdgeIds: [edge.id], relatedSymbolIds: [callee.id], pathSpineIndexes: [],
            relevanceWeight: focus.score, reason: "exact-focus-callee"
          });
        } else if (direction === "outgoing" && availableFiles.has(callee.filePath) && !seenCallees.has(callee.id) &&
            ["function", "method", "entrypoint"].includes(callee.kind) && !sourceCallees.has(callee.id)) {
          const site: WindowSite = { focus, filePath: callee.filePath,
            startLine: Math.max(1, callee.range.start.line - EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines),
            endLine: callee.range.end.line + EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines,
            evidenceStartLine: callee.range.start.line, evidenceEndLine: callee.range.end.line,
            connectionEdgeIds: [edge.id], relatedSymbolIds: [callee.id], pathSpineIndexes: [],
            relevanceWeight: focus.score, reason: "exact-callee-source" };
          if (!coveredByPrimarySource(site, focuses)) sourceCallees.set(callee.id, { symbol: callee, site });
        }
        if (seenEdges.has(edge.id)) continue;
        seenEdges.add(edge.id);
        if (!availableFiles.has(edge.filePath)) {
          unavailableEdges.add(edge.id);
          continue;
        }
        callSites.push({
          focus, filePath: edge.filePath,
          startLine: Math.max(1, edge.range.start.line - EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines),
          endLine: edge.range.end.line + EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines,
          evidenceStartLine: edge.range.start.line, evidenceEndLine: edge.range.end.line,
          connectionEdgeIds: [edge.id], relatedSymbolIds: [relation.symbol.id], pathSpineIndexes: [],
          relevanceWeight: focus.score, reason: "exact-focus-call"
        });
      }
    }
  }
  const sites = [...connectionSites, ...spineSites, ...callSites, ...calleeSites]
    .filter((site) => !coveredByPrimarySource(site, focuses))
    .sort(
      (left, right) =>
        left.focus.rank - right.focus.rank ||
        compareText(left.filePath, right.filePath) ||
        left.startLine - right.startLine ||
        left.endLine - right.endLine ||
        compareText(left.connectionEdgeIds.join("\u0000"), right.connectionEdgeIds.join("\u0000"))
    );

  const merged: MutableWindow[] = [];
  for (const site of sites) {
    const previous = merged.find((window) =>
      window.filePath === site.filePath &&
      ((window.focusRank === site.focus.rank &&
        site.startLine <= window.endLine + EXPLORE_SOURCE_WINDOW_LIMITS.mergeGapLines &&
        site.endLine >= window.startLine - EXPLORE_SOURCE_WINDOW_LIMITS.mergeGapLines) ||
       ((window.reason === "exact-path-spine" || site.reason === "exact-path-spine") &&
        site.startLine <= window.endLine && site.endLine >= window.startLine))
    );
    if (
      previous !== undefined
    ) {
      previous.startLine = Math.min(previous.startLine, site.startLine);
      previous.endLine = Math.max(previous.endLine, site.endLine);
      for (const edgeId of site.connectionEdgeIds) {
        if (!previous.connectionEdgeIds.includes(edgeId)) previous.connectionEdgeIds.push(edgeId);
      }
      for (const symbolId of site.relatedSymbolIds) {
        if (!previous.relatedSymbolIds.includes(symbolId)) previous.relatedSymbolIds.push(symbolId);
      }
      for (const spineIndex of site.pathSpineIndexes) {
        if (!previous.pathSpineIndexes.includes(spineIndex)) {
          previous.pathSpineIndexes.push(spineIndex);
        }
      }
      previous.relevanceWeight = Math.max(previous.relevanceWeight, site.relevanceWeight);
      if (site.reason === "exact-path-spine") previous.reason = "exact-path-spine";
      continue;
    }
    merged.push({
      focusRank: site.focus.rank,
      filePath: site.filePath,
      startLine: site.startLine,
      endLine: site.endLine,
      connectionEdgeIds: [...site.connectionEdgeIds],
      relatedSymbolIds: [...site.relatedSymbolIds],
      pathSpineIndexes: [...site.pathSpineIndexes],
      relevanceWeight: site.relevanceWeight,
      reason: site.reason
    });
  }

  const candidates = merged;
  const selectedPerFocus = new Map<number, number>();
  const nonSpinePerFocus = new Map<number, number>();
  const selected: MutableWindow[] = [];
  for (const candidate of candidates) {
    if (selected.length >= EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows) {
      break;
    }
    const focusCount = selectedPerFocus.get(candidate.focusRank) ?? 0;
    const nonSpineCount = nonSpinePerFocus.get(candidate.focusRank) ?? 0;
    if (candidate.reason !== "exact-path-spine" && nonSpineCount >= EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindowsPerFocus) {
      continue;
    }
    selected.push(candidate);
    selectedPerFocus.set(candidate.focusRank, focusCount + 1);
    if (candidate.reason !== "exact-path-spine") nonSpinePerFocus.set(candidate.focusRank, nonSpineCount + 1);
  }

  // Existing impact paths already contain bounded incoming-call evidence.
  // Query-relevant upstream paths may displace lower-ranked plain call sites,
  // but never connection, callee-body or spine evidence. Full receipts remain
  // in focus.impact.paths; a static assignment label does not prove dispatch.
  const impactCandidates: MutableWindow[] = [];
  const impactPriority = new Map<MutableWindow, { readonly concepts: number; readonly entryId: string; readonly targetId: string; readonly caller: SymbolNode; readonly completeCaller: boolean }>();
  const queryGroups = identifierTermGroups(queryTerms);
  const seenImpactEdges = new Set<string>();
  for (const focus of [...focuses].sort((left, right) => left.rank - right.rank)) {
    for (const path of focus.impact.paths) {
      const terminal = path.symbols.at(-1);
      if (terminal === undefined || path.symbols[0]?.id !== focus.symbol.id ||
          path.edges.length < 2 || path.edges.length > EXPLORE_SOURCE_WINDOW_LIMITS.maximumImpactHops ||
          path.symbols.length !== path.edges.length + 1 ||
          new Set(path.symbols.map((symbol) => symbol.id)).size !== path.symbols.length) continue;
      const words = new Set(path.symbols.slice(1).flatMap(symbol =>
        identifierWords(symbol.name).flatMap(identifierTermVariants)));
      if (!queryTerms.some((term) => identifierTermVariants(term).some((variant) => words.has(variant)))) continue;
      const pathWords = new Set(path.symbols.flatMap(symbol => identifierWords(symbol.name).flatMap(identifierTermVariants)));
      const concepts = queryGroups.filter(group => group.some(term => pathWords.has(term))).length;
      if (!path.edges.every((edge, index) => {
        const caller = path.symbols[index + 1]!;
        return edge.kind === "calls" && edge.resolution === "exact" &&
          edge.sourceId === caller.id && edge.targetId === path.symbols[index]!.id &&
          edge.filePath === caller.filePath;
      })) continue;
      for (const edge of path.edges) {
        if (!availableFiles.has(edge.filePath)) unavailableEdges.add(edge.id);
      }
      if (path.edges.some((edge) => !availableFiles.has(edge.filePath))) continue;
      for (const edge of path.edges) {
        if (seenImpactEdges.has(edge.id)) continue;
        seenImpactEdges.add(edge.id);
        const site: WindowSite = {
          focus, filePath: edge.filePath,
          startLine: Math.max(1, edge.range.start.line - EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines),
          endLine: edge.range.end.line + EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines,
          evidenceStartLine: edge.range.start.line, evidenceEndLine: edge.range.end.line,
          connectionEdgeIds: path.edges.map((item) => item.id),
          relatedSymbolIds: path.symbols.slice(1).map((symbol) => symbol.id),
          pathSpineIndexes: [], relevanceWeight: focus.score, reason: "exact-impact-call"
        };
        if (coveredByPrimarySource(site, focuses) || selected.some((window) =>
          window.filePath === site.filePath && window.startLine <= site.evidenceStartLine &&
          window.endLine >= site.evidenceEndLine) || impactCandidates.some((window) =>
          window.filePath === site.filePath && window.startLine <= site.evidenceStartLine &&
          window.endLine >= site.evidenceEndLine)) continue;
        const candidate: MutableWindow = { ...site, focusRank: focus.rank,
          connectionEdgeIds: [...site.connectionEdgeIds], relatedSymbolIds: [...site.relatedSymbolIds],
          pathSpineIndexes: [] };
        impactCandidates.push(candidate);
        const caller = path.symbols.find(symbol => symbol.id === edge.sourceId)!;
        const completeCaller = caller.range.end.line - caller.range.start.line + 1 <=
          EXPLORE_SOURCE_WINDOW_LIMITS.maximumImpactCallerLines &&
          edge.range.start.line >= caller.range.start.line && edge.range.end.line <= caller.range.end.line;
        impactPriority.set(candidate, { concepts, entryId: terminal.id, targetId: edge.targetId!, caller, completeCaller });
      }
    }
  }
  const protectedEdgeIds = new Set([...connectionSites, ...spineSites, ...calleeSites]
    .flatMap(site => site.connectionEdgeIds));
  let admittedImpactWindows = 0;
  let replacedLowerRankedCallWindowCount = 0;
  const pendingImpact = [...impactCandidates];
  const continuationTargets = new Set(impactCandidates.map(window => impactPriority.get(window)!.targetId));
  const upstreamEntries = new Map<string, number>();
  while (pendingImpact.length > 0 && admittedImpactWindows < EXPLORE_SOURCE_WINDOW_LIMITS.maximumImpactWindows) {
    pendingImpact.sort((left, right) => {
      const a = impactPriority.get(left)!, b = impactPriority.get(right)!;
      return Number(upstreamEntries.has(b.targetId)) - Number(upstreamEntries.has(a.targetId)) ||
        b.concepts - a.concepts || left.focusRank - right.focusRank ||
        Number(continuationTargets.has(b.entryId)) - Number(continuationTargets.has(a.entryId)) ||
        (upstreamEntries.has(a.targetId) || upstreamEntries.has(b.targetId)
          ? 0 : Number(b.completeCaller) - Number(a.completeCaller)) ||
        compareText(left.filePath, right.filePath) || left.startLine - right.startLine ||
        compareText(left.connectionEdgeIds.join("\u0000"), right.connectionEdgeIds.join("\u0000"));
    });
    const window = pendingImpact.shift()!;
    const priority = impactPriority.get(window)!;
    const upstreamRank = upstreamEntries.get(priority.targetId);
    const admissionRank = Math.min(window.focusRank, upstreamRank ?? window.focusRank);
    if (selected.length >= EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows) {
      let replacementIndex = -1;
      for (let index = 0; index < selected.length; index += 1) {
        const candidate = selected[index]!;
        if (candidate.reason !== "exact-focus-call" || candidate.focusRank <= admissionRank ||
            candidate.pathSpineIndexes.length > 0 || candidate.connectionEdgeIds.some(id => protectedEdgeIds.has(id))) continue;
        if (replacementIndex < 0 || candidate.focusRank >= selected[replacementIndex]!.focusRank) replacementIndex = index;
      }
      if (replacementIndex < 0) continue;
      const [removed] = selected.splice(replacementIndex, 1);
      const remaining = (selectedPerFocus.get(removed!.focusRank) ?? 1) - 1;
      if (remaining === 0) selectedPerFocus.delete(removed!.focusRank);
      else selectedPerFocus.set(removed!.focusRank, remaining);
      replacedLowerRankedCallWindowCount += 1;
    }
    // Preserve upstream guards. Other short callers may add trailing context
    // only: new leading padding could push the call out of a clipped excerpt.
    if (priority.completeCaller && (upstreamRank !== undefined || window.startLine <= priority.caller.range.start.line)) {
      window.startLine = Math.min(window.startLine, priority.caller.range.start.line);
      window.endLine = Math.max(window.endLine, priority.caller.range.end.line);
    }
    selected.push(window);
    selectedPerFocus.set(window.focusRank, (selectedPerFocus.get(window.focusRank) ?? 0) + 1);
    admittedImpactWindows += 1;
    upstreamEntries.set(priority.entryId, admissionRank);
  }

  const uncoveredCallees = [...sourceCallees.values()].filter(({ site }) => !selected.some((window) =>
    window.filePath === site.filePath && window.startLine <= site.evidenceStartLine && window.endLine >= site.evidenceEndLine));
  const calleeSearch = sourceDocuments === undefined || queryTerms.length === 0 ? undefined :
    matchExploreCalleeSource(uncoveredCallees.map(({ symbol }) => symbol), queryTerms, sourceDocuments);
  const sourceCandidates: MutableWindow[] = uncoveredCallees.flatMap(({ symbol, site }) => {
    const matches = calleeSearch?.matches.get(symbol.id);
    return matches === undefined ? [] : [{ focusRank: site.focus.rank, filePath: site.filePath,
      startLine: site.startLine, endLine: site.endLine, connectionEdgeIds: [...site.connectionEdgeIds],
      relatedSymbolIds: [...site.relatedSymbolIds], pathSpineIndexes: [], relevanceWeight: site.relevanceWeight,
      reason: site.reason, sourceMatches: matches }];
  });
  const calleeSlots = Math.min(EXPLORE_CALLEE_SOURCE_LIMITS.maximumWindows, EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows - selected.length);
  for (const window of sourceCandidates.slice(0, calleeSlots)) {
    selected.push(window);
    selectedPerFocus.set(window.focusRank, (selectedPerFocus.get(window.focusRank) ?? 0) + 1);
  }

  // A named flow's proven callees need not repeat the caller's identifier.
  // Append only to spare slots; allocation also protects all earlier windows.
  const flowCandidates: MutableWindow[] = [...flowCallees.values()]
    .filter(({ site }) => !coveredByPrimarySource(site, focuses) && ![...selected, ...sourceCandidates].some(window =>
      window.filePath === site.filePath && window.startLine <= site.evidenceStartLine && window.endLine >= site.evidenceEndLine))
    .sort((left, right) => left.site.focus.rank - right.site.focus.rank ||
      Number(right.site.filePath === right.site.focus.symbol.filePath) - Number(left.site.filePath === left.site.focus.symbol.filePath) ||
      left.callLine - right.callLine || left.callColumn - right.callColumn ||
      compareText(left.site.filePath, right.site.filePath) || left.site.startLine - right.site.startLine ||
      compareText(left.site.connectionEdgeIds[0]!, right.site.connectionEdgeIds[0]!))
    .map(({ site }) => ({ ...site, focusRank: site.focus.rank,
      connectionEdgeIds: [...site.connectionEdgeIds], relatedSymbolIds: [...site.relatedSymbolIds], pathSpineIndexes: [] }));
  const flowSlots = Math.min(EXPLORE_SOURCE_WINDOW_LIMITS.maximumFlowCalleeWindows,
    EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows - selected.length);
  for (const window of flowCandidates.slice(0, flowSlots)) {
    selected.push(window);
    selectedPerFocus.set(window.focusRank, (selectedPerFocus.get(window.focusRank) ?? 0) + 1);
  }

  return {
    policy: EXPLORE_SOURCE_WINDOW_POLICY,
    limits: EXPLORE_SOURCE_WINDOW_LIMITS,
    ...(calleeSearch === undefined ? {} : { calleeSourceSearch: calleeSearch.receipt }),
    summary: {
      candidateCount: candidates.length + impactCandidates.length + sourceCandidates.length + flowCandidates.length,
      selectedCount: selected.length,
      selectedFocusCount: selectedPerFocus.size,
      unavailableFileSiteCount: unavailableEdges.size,
      replacedLowerRankedCallWindowCount,
      truncated: selected.length < candidates.length + impactCandidates.length + sourceCandidates.length + flowCandidates.length || calleeSearch?.receipt.truncated === true
    },
    windows: selected.map((window, index) => ({
      index,
      focusRank: window.focusRank,
      filePath: window.filePath,
      startLine: window.startLine,
      endLine: window.endLine,
      connectionEdgeIds: [...window.connectionEdgeIds],
      relatedSymbolIds: [...window.relatedSymbolIds],
      pathSpineIndexes: [...window.pathSpineIndexes],
      relevanceWeight: window.relevanceWeight,
      reason: window.reason,
      ...(window.sourceMatches === undefined ? {} : { sourceMatches: window.sourceMatches })
    }))
  };
}
