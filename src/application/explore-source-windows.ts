import type { ExploreConnection, ExploreFocus } from "./types.js";
import type { ExplorePathSpinePlan } from "./explore-path-spines.js";

export const EXPLORE_SOURCE_WINDOW_POLICY = "explore-source-windows-v1" as const;
export const EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY =
  "explore-source-window-allocation-v2" as const;
export const EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS = {
  minimumPerWindow: 256,
  maximumShareFraction: 0.7,
  spineBoost: 1.25
} as const;
export const EXPLORE_SOURCE_WINDOW_LIMITS = {
  contextPaddingLines: 3,
  mergeGapLines: 3,
  maximumWindows: 8,
  maximumWindowsPerFocus: 2
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
  readonly reason: "exact-connection-site" | "exact-path-spine";
}

export interface ExploreSourceWindowPlan {
  readonly policy: typeof EXPLORE_SOURCE_WINDOW_POLICY;
  readonly limits: typeof EXPLORE_SOURCE_WINDOW_LIMITS;
  readonly summary: {
    readonly candidateCount: number;
    readonly selectedCount: number;
    readonly selectedFocusCount: number;
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
  };
  readonly summary: {
    readonly candidateCount: number;
    readonly requestedCharacters: number;
    readonly allocatedCharacters: number;
    readonly unusedCharacters: number;
    readonly truncated: boolean;
  };
  readonly windows: readonly {
    readonly index: number;
    readonly requestedCharacters: number;
    readonly relevanceWeight: number;
    readonly maximumShareCharacters: number;
    readonly allocatedCharacters: number;
    readonly truncated: boolean;
    readonly reason: "score-and-spine-weight";
  }[];
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
}

interface WindowSite {
  readonly focus: ExploreFocus;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly connectionEdgeIds: readonly string[];
  readonly relatedSymbolIds: readonly string[];
  readonly pathSpineIndexes: readonly number[];
  readonly relevanceWeight: number;
  readonly reason: ExploreSourceWindowPlanItem["reason"];
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

/** Reserves the remainder of one total source envelope in stable window order. */
export function allocateExploreSourceWindowCharacters(input: {
  readonly totalCharacterBudget: number;
  readonly primaryEmittedCharacters: number;
  readonly candidates: readonly {
    readonly index: number;
    readonly requestedCharacters: number;
    readonly relevanceWeight: number;
  }[];
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
      !Number.isSafeInteger(candidate.requestedCharacters) ||
      candidate.requestedCharacters <= 0 ||
      !Number.isFinite(candidate.relevanceWeight) ||
      candidate.relevanceWeight <= 0
    ) {
      throw new RangeError("Explore source window candidates require unique indexes and positive sizes.");
    }
    indexes.add(candidate.index);
  }

  const availableCharacters = input.totalCharacterBudget - input.primaryEmittedCharacters;
  const maximumShareCharacters = candidates.length <= 1
    ? availableCharacters
    : Math.max(
        EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.minimumPerWindow,
        Math.floor(
          availableCharacters * EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.maximumShareFraction
        )
      );
  const mutable = candidates.map((candidate) => ({
    candidate,
    maximumShareCharacters,
    allocatedCharacters: 0
  }));
  const guaranteed = mutable.map((allocation) =>
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
        allocation.allocatedCharacters < allocation.candidate.requestedCharacters &&
        allocation.allocatedCharacters < allocation.maximumShareCharacters
    );
    if (active.length === 0) break;
    const totalWeight = active.reduce(
      (total, allocation) => total + allocation.candidate.relevanceWeight,
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
          roundCapacity * allocation.candidate.relevanceWeight / totalWeight
        )
      );
      const addition = Math.min(capacity, weightedShare, remaining);
      allocation.allocatedCharacters += addition;
      remaining -= addition;
      distributed += addition;
    }
    if (distributed === 0) break;
  }
  const windows = mutable.map((allocation) => ({
    ...allocation.candidate,
    maximumShareCharacters: allocation.maximumShareCharacters,
    allocatedCharacters: allocation.allocatedCharacters,
    truncated: allocation.allocatedCharacters < allocation.candidate.requestedCharacters,
    reason: "score-and-spine-weight" as const
  }));
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
      maximumShareFraction: EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.maximumShareFraction
    },
    summary: {
      candidateCount: candidates.length,
      requestedCharacters,
      allocatedCharacters,
      unusedCharacters: availableCharacters - allocatedCharacters,
      truncated: windows.some((window) => window.truncated)
    },
    windows
  };
}

function overlapsPrimarySource(window: MutableWindow, focus: ExploreFocus): boolean {
  return (
    focus.source !== null &&
    window.filePath === focus.source.filePath &&
    window.startLine <= focus.source.endLine &&
    window.endLine >= focus.source.startLine
  );
}

/**
 * Plans bounded additional source windows from exact, selected-to-selected
 * connections. It never synthesizes a call site or follows heuristic edges.
 */
export function planExploreSourceWindows(
  focuses: readonly ExploreFocus[],
  connections: readonly ExploreConnection[],
  pathSpinePlan?: ExplorePathSpinePlan
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
      connectionEdgeIds: spine.edgeIds,
      relatedSymbolIds: [bridge.id],
      pathSpineIndexes: [spine.index],
      relevanceWeight: spine.score * EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.spineBoost,
      reason: "exact-path-spine"
    }));
  });
  const sites = [...connectionSites, ...spineSites]
    .sort(
      (left, right) =>
        left.focus.rank - right.focus.rank ||
        left.startLine - right.startLine ||
        left.endLine - right.endLine ||
        compareText(left.filePath, right.filePath) ||
        compareText(left.connectionEdgeIds.join("\u0000"), right.connectionEdgeIds.join("\u0000"))
    );

  const merged: MutableWindow[] = [];
  for (const site of sites) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      previous.focusRank === site.focus.rank &&
      previous.filePath === site.filePath &&
      site.startLine <= previous.endLine + EXPLORE_SOURCE_WINDOW_LIMITS.mergeGapLines
    ) {
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

  const candidates = merged.filter((window) => {
    const focus = focuses.find((item) => item.rank === window.focusRank);
    return focus !== undefined && !overlapsPrimarySource(window, focus);
  });
  const selectedPerFocus = new Map<number, number>();
  const selected: MutableWindow[] = [];
  for (const candidate of candidates) {
    if (selected.length >= EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindows) {
      break;
    }
    const focusCount = selectedPerFocus.get(candidate.focusRank) ?? 0;
    if (focusCount >= EXPLORE_SOURCE_WINDOW_LIMITS.maximumWindowsPerFocus) {
      continue;
    }
    selected.push(candidate);
    selectedPerFocus.set(candidate.focusRank, focusCount + 1);
  }

  return {
    policy: EXPLORE_SOURCE_WINDOW_POLICY,
    limits: EXPLORE_SOURCE_WINDOW_LIMITS,
    summary: {
      candidateCount: candidates.length,
      selectedCount: selected.length,
      selectedFocusCount: selectedPerFocus.size,
      truncated: selected.length < candidates.length
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
      reason: window.reason
    }))
  };
}
