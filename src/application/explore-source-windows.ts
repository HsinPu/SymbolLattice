import type { ExploreConnection, ExploreFocus } from "./types.js";

export const EXPLORE_SOURCE_WINDOW_POLICY = "explore-source-windows-v1" as const;
export const EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY =
  "explore-source-window-allocation-v1" as const;
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
  readonly reason: "exact-connection-site";
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
    readonly allocatedCharacters: number;
    readonly truncated: boolean;
    readonly reason: "focus-rank-window-order";
  }[];
}

interface MutableWindow {
  readonly focusRank: number;
  readonly filePath: string;
  startLine: number;
  endLine: number;
  readonly connectionEdgeIds: string[];
  readonly relatedSymbolIds: string[];
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
      candidate.requestedCharacters <= 0
    ) {
      throw new RangeError("Explore source window candidates require unique indexes and positive sizes.");
    }
    indexes.add(candidate.index);
  }

  const availableCharacters = input.totalCharacterBudget - input.primaryEmittedCharacters;
  let remaining = availableCharacters;
  const windows = candidates.map((candidate) => {
    const allocatedCharacters = Math.min(candidate.requestedCharacters, remaining);
    remaining -= allocatedCharacters;
    return {
      ...candidate,
      allocatedCharacters,
      truncated: allocatedCharacters < candidate.requestedCharacters,
      reason: "focus-rank-window-order" as const
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
      availableCharacters
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
  connections: readonly ExploreConnection[]
): ExploreSourceWindowPlan {
  const focusBySymbolId = new Map(
    [...focuses]
      .sort((left, right) => left.rank - right.rank || compareText(left.symbol.id, right.symbol.id))
      .map((focus) => [focus.symbol.id, focus] as const)
  );
  const sites = connections
    .filter(
      (connection) =>
        connection.edge.resolution === "exact" &&
        connection.edge.sourceId === connection.source.id &&
        connection.edge.targetId === connection.target.id &&
        focusBySymbolId.get(connection.source.id)?.symbol.filePath === connection.edge.filePath
    )
    .map((connection) => ({
      focus: focusBySymbolId.get(connection.source.id)!,
      connection,
      startLine: Math.max(
        1,
        connection.edge.range.start.line - EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines
      ),
      endLine:
        connection.edge.range.end.line + EXPLORE_SOURCE_WINDOW_LIMITS.contextPaddingLines
    }))
    .sort(
      (left, right) =>
        left.focus.rank - right.focus.rank ||
        left.startLine - right.startLine ||
        left.endLine - right.endLine ||
        compareText(left.connection.edge.id, right.connection.edge.id)
    );

  const merged: MutableWindow[] = [];
  for (const site of sites) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      previous.focusRank === site.focus.rank &&
      previous.filePath === site.connection.edge.filePath &&
      site.startLine <= previous.endLine + EXPLORE_SOURCE_WINDOW_LIMITS.mergeGapLines
    ) {
      previous.endLine = Math.max(previous.endLine, site.endLine);
      if (!previous.connectionEdgeIds.includes(site.connection.edge.id)) {
        previous.connectionEdgeIds.push(site.connection.edge.id);
      }
      if (!previous.relatedSymbolIds.includes(site.connection.target.id)) {
        previous.relatedSymbolIds.push(site.connection.target.id);
      }
      continue;
    }
    merged.push({
      focusRank: site.focus.rank,
      filePath: site.connection.edge.filePath,
      startLine: site.startLine,
      endLine: site.endLine,
      connectionEdgeIds: [site.connection.edge.id],
      relatedSymbolIds: [site.connection.target.id]
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
      reason: "exact-connection-site"
    }))
  };
}
