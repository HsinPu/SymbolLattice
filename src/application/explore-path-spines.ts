import {
  createGraphQueryView,
  findEvidencePath,
  type EvidencePath,
  type GraphQueryView
} from "../domain/graph.js";
import type { GraphSnapshot, SymbolNode } from "../domain/types.js";
import type { ExploreQuerySelection } from "./explore-query.js";

export const EXPLORE_PATH_SPINE_POLICY = "explore-path-spines-v1" as const;
export const EXPLORE_PATH_SPINE_LIMITS = {
  maximumPairAttempts: 16,
  maximumHops: 4,
  maximumVisitedSymbolsPerPair: 500,
  maximumSpines: 4,
  maximumBridgeSymbols: 8
} as const;

export interface ExplorePathSpine {
  readonly index: number;
  readonly fromFocusRank: number;
  readonly toFocusRank: number;
  readonly score: number;
  readonly path: EvidencePath;
  readonly bridgeSymbols: readonly SymbolNode[];
  readonly edgeIds: readonly string[];
}

export interface ExplorePathSpinePlan {
  readonly policy: typeof EXPLORE_PATH_SPINE_POLICY;
  readonly limits: typeof EXPLORE_PATH_SPINE_LIMITS;
  readonly summary: {
    readonly pairCandidateCount: number;
    readonly attemptedPairCount: number;
    readonly discoveredSpineCount: number;
    readonly selectedSpineCount: number;
    readonly bridgeSymbolCount: number;
    readonly pairAttemptsTruncated: boolean;
    readonly spinesTruncated: boolean;
    readonly traversalTruncated: boolean;
  };
  readonly spines: readonly ExplorePathSpine[];
}

interface PairCandidate {
  readonly from: ExploreQuerySelection;
  readonly to: ExploreQuerySelection;
}

interface SpineCandidate extends Omit<ExplorePathSpine, "index"> {}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function pairCandidates(selections: readonly ExploreQuerySelection[]): readonly PairCandidate[] {
  const ordered = [...selections].sort(
    (left, right) => left.rank - right.rank || compareText(left.symbol.id, right.symbol.id)
  );
  const pairs: PairCandidate[] = [];
  for (let fromIndex = 0; fromIndex < ordered.length; fromIndex += 1) {
    const from = ordered[fromIndex];
    if (from === undefined) continue;
    for (let toIndex = fromIndex + 1; toIndex < ordered.length; toIndex += 1) {
      const to = ordered[toIndex];
      if (to !== undefined) pairs.push({ from, to });
    }
  }
  return pairs;
}

/**
 * Selects short, exact directed paths whose interior symbols explain how two
 * ranked query focuses connect. Direct edges remain connection evidence and do
 * not become redundant spines.
 */
export function planExplorePathSpines(
  graph: GraphSnapshot,
  selections: readonly ExploreQuerySelection[],
  queryView?: GraphQueryView
): ExplorePathSpinePlan {
  const view = queryView ?? createGraphQueryView(graph);
  const pairs = pairCandidates(selections);
  const selectedSymbolIds = new Set(selections.map((selection) => selection.symbol.id));
  const attemptedPairs = pairs.slice(0, EXPLORE_PATH_SPINE_LIMITS.maximumPairAttempts);
  const discovered: SpineCandidate[] = [];
  let traversalTruncated = false;

  for (const pair of attemptedPairs) {
    const result = findEvidencePath(
      graph,
      pair.from.symbol.id,
      pair.to.symbol.id,
      EXPLORE_PATH_SPINE_LIMITS.maximumHops,
      EXPLORE_PATH_SPINE_LIMITS.maximumVisitedSymbolsPerPair,
      undefined,
      view
    );
    traversalTruncated ||= result.truncated;
    const path = result.path;
    if (path === null || path.edges.length < 2) continue;
    const bridgeSymbols = path.symbols
      .slice(1, -1)
      .filter((symbol) => !selectedSymbolIds.has(symbol.id));
    if (bridgeSymbols.length === 0) continue;
    discovered.push({
      fromFocusRank: pair.from.rank,
      toFocusRank: pair.to.rank,
      score: (pair.from.score + pair.to.score) / 2,
      path,
      bridgeSymbols,
      edgeIds: path.edges.map((edge) => edge.id)
    });
  }

  discovered.sort(
    (left, right) =>
      right.score - left.score ||
      left.path.edges.length - right.path.edges.length ||
      left.fromFocusRank - right.fromFocusRank ||
      left.toFocusRank - right.toFocusRank ||
      compareText(left.edgeIds.join("\u0000"), right.edgeIds.join("\u0000"))
  );

  const selected: SpineCandidate[] = [];
  const bridgeIds = new Set<string>();
  for (const candidate of discovered) {
    if (selected.length >= EXPLORE_PATH_SPINE_LIMITS.maximumSpines) break;
    const addedBridgeIds = candidate.bridgeSymbols
      .map((symbol) => symbol.id)
      .filter((id) => !bridgeIds.has(id));
    if (
      bridgeIds.size + addedBridgeIds.length >
      EXPLORE_PATH_SPINE_LIMITS.maximumBridgeSymbols
    ) {
      continue;
    }
    selected.push(candidate);
    for (const id of addedBridgeIds) bridgeIds.add(id);
  }

  return {
    policy: EXPLORE_PATH_SPINE_POLICY,
    limits: EXPLORE_PATH_SPINE_LIMITS,
    summary: {
      pairCandidateCount: pairs.length,
      attemptedPairCount: attemptedPairs.length,
      discoveredSpineCount: discovered.length,
      selectedSpineCount: selected.length,
      bridgeSymbolCount: bridgeIds.size,
      pairAttemptsTruncated: pairs.length > attemptedPairs.length,
      spinesTruncated: discovered.length > selected.length,
      traversalTruncated
    },
    spines: selected.map((spine, index) => ({ index, ...spine }))
  };
}
