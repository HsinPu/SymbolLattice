import type { EvidencePath } from "../domain/graph.js";
import type { GraphEdge, SymbolNode } from "../domain/types.js";

export const EXPLORE_FLOW_FOCUS_LIMITS = { maximumHops: 4, maximumVisitedSymbols: 128, maximumExaminedEdges: 512 } as const;
export interface ExploreFlowFocus {
  readonly policy: "same-file-downstream-focus-v1";
  readonly limits: typeof EXPLORE_FLOW_FOCUS_LIMITS;
  readonly visitedSymbols: number;
  readonly examinedEdges: number;
  readonly truncated: boolean;
  readonly replacedCaller: SymbolNode;
  readonly replacedCall: GraphEdge;
  readonly path: EvidencePath;
}

/** Find proven later steps after an anchor whose current companion is its direct caller. */
export function downstreamFocusPaths(
  graph: { readonly symbols: readonly SymbolNode[]; readonly edges: readonly GraphEdge[] },
  anchor: SymbolNode,
  previous: SymbolNode
): ReadonlyMap<string, ExploreFlowFocus> {
  const symbols = new Map(graph.symbols.filter((symbol) => symbol.filePath === anchor.filePath).map((symbol) => [symbol.id, symbol]));
  const edges = graph.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact" &&
    edge.sourceId !== null && edge.targetId !== null && symbols.has(edge.sourceId) && symbols.has(edge.targetId) &&
    edge.filePath === symbols.get(edge.sourceId)!.filePath && edge.sourceId !== edge.targetId)
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  const replacedCall = edges.find((edge) => edge.sourceId === previous.id && edge.targetId === anchor.id);
  if (replacedCall === undefined) return new Map();
  const byCaller = new Map<string, GraphEdge[]>();
  for (const edge of edges) byCaller.set(edge.sourceId!, [...(byCaller.get(edge.sourceId!) ?? []), edge]);
  const visited = new Set([anchor.id, previous.id]);
  const queue: EvidencePath[] = [{ symbols: [anchor], edges: [], steps: [] }];
  const paths = new Map<string, EvidencePath>();
  let examinedEdges = 0, truncated = false;
  for (let index = 0; index < queue.length; index += 1) {
    const path = queue[index]!;
    const from = path.symbols.at(-1)!;
    for (const edge of byCaller.get(from.id) ?? []) {
      if (examinedEdges >= EXPLORE_FLOW_FOCUS_LIMITS.maximumExaminedEdges) { truncated = true; break; }
      examinedEdges += 1;
      if (visited.has(edge.targetId!)) continue;
      if (path.edges.length >= EXPLORE_FLOW_FOCUS_LIMITS.maximumHops || visited.size >= EXPLORE_FLOW_FOCUS_LIMITS.maximumVisitedSymbols) {
        truncated = true;
        continue;
      }
      const to = symbols.get(edge.targetId!)!;
      visited.add(to.id);
      const next = { symbols: [...path.symbols, to], edges: [...path.edges, edge], steps: [...path.steps, { from, to, edge }] };
      queue.push(next);
      if (next.edges.length >= 2) paths.set(to.id, next);
    }
    if (examinedEdges >= EXPLORE_FLOW_FOCUS_LIMITS.maximumExaminedEdges) {
      truncated ||= queue.slice(index + 1).some((pending) => (byCaller.get(pending.symbols.at(-1)!.id)?.length ?? 0) > 0);
      break;
    }
  }
  return new Map([...paths].map(([id, path]) => [id, { policy: "same-file-downstream-focus-v1",
    limits: EXPLORE_FLOW_FOCUS_LIMITS, visitedSymbols: visited.size, examinedEdges, truncated,
    replacedCaller: previous, replacedCall, path }]));
}
