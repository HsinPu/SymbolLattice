import type { GraphEdge } from "../domain/types.js";
import type { UnresolvedCallEvidence } from "./types.js";

/** Keep the query response bounded while inspecting later call sites in large functions. */
export const EXPLORE_UNRESOLVED_CALL_CANDIDATE_LIMIT = 64;

function terminalNameTerms(edge: GraphEdge): ReadonlySet<string> {
  const terminal = edge.referenceName?.split(".").at(-1) ?? "";
  return new Set(terminal.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

/** Select query-relevant written calls without changing their resolution or source order. */
export function selectQueryUnresolvedCalls(
  evidence: UnresolvedCallEvidence,
  identifierTerms: readonly string[],
  limit: number,
  requiredCallIds: ReadonlySet<string> = new Set()
): UnresolvedCallEvidence {
  if (evidence.state !== "available" || evidence.items.length <= limit) return evidence;
  const terms = new Set(identifierTerms.map((term) => term.toLowerCase()));
  const selected = evidence.items.map((edge, index) => ({
    edge, index,
    score: [...terminalNameTerms(edge)].filter((term) => terms.has(term)).length
  })).sort((left, right) =>
    Number(requiredCallIds.has(right.edge.id)) - Number(requiredCallIds.has(left.edge.id)) ||
    right.score - left.score || left.index - right.index)
    .slice(0, limit).sort((left, right) => left.index - right.index)
    .map(({ edge }) => edge);
  return { ...evidence, items: selected, truncated: evidence.truncated || evidence.items.length > limit };
}
