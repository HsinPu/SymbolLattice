import type { GraphEdge, SymbolNode } from "../domain/types.js";
import type { UnresolvedCallEvidence } from "./types.js";

/** Keep the query response bounded while inspecting later call sites in large functions. */
export const EXPLORE_UNRESOLVED_CALL_CANDIDATE_LIMIT = 64;
export const EXPLORE_SAME_CLASS_DECLARATION_LEAD_LIMIT = 2;
const DECLARATION_LINE_CHARACTER_LIMIT = 256;

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

/** Cite declarations already present in the bounded graph, without turning name equality into a call edge. */
export function withSameClassDeclarationLeads(
  evidence: UnresolvedCallEvidence,
  owner: SymbolNode,
  declarationsByQualifiedName: ReadonlyMap<string, readonly SymbolNode[]>,
  sourceLineFor: (declaration: SymbolNode) => string | null,
  identifierTerms: readonly string[]
): UnresolvedCallEvidence {
  if (evidence.state !== "available" || owner.kind !== "method" ||
      owner.filePath.split(".").at(-1)?.toLowerCase() !== "py") return evidence;
  const separator = owner.qualifiedName.lastIndexOf(".");
  if (separator < 0) return evidence;
  const className = owner.qualifiedName.slice(0, separator);
  const leads: NonNullable<UnresolvedCallEvidence["sameClassDeclarationLeads"]>["items"][number][] = [];
  const terms = new Set(identifierTerms.map((term) => term.toLowerCase()));
  for (const edge of evidence.items) {
    if (edge.kind !== "calls" || edge.resolution !== "unresolved" || edge.targetId !== null ||
        edge.sourceId !== owner.id || edge.filePath !== owner.filePath ||
        edge.evidence?.ruleId !== "syntax.python.member-call.unknown-receiver" ||
        !/^self\.[\p{L}_][\p{L}\p{N}_]*$/u.test(edge.referenceName ?? "")) continue;
    const name = edge.referenceName!.slice(5);
    const declarations = (declarationsByQualifiedName.get(`${className}.${name}`) ?? [])
      .filter((declaration) => declaration.kind === "method" && declaration.filePath === owner.filePath);
    // The bounded graph is not a repository-wide uniqueness claim. Multiple
    // declarations need a separate ambiguity receipt; do not pick one here.
    if (declarations.length !== 1) continue;
    const declaration = declarations[0]!;
    const line = sourceLineFor(declaration);
    if (line === null || !line.includes(declaration.name)) continue;
    leads.push({ edgeId: edge.id, declaration,
      declarationLine: { line: declaration.range.start.line,
        text: line.slice(0, DECLARATION_LINE_CHARACTER_LIMIT),
        truncated: line.length > DECLARATION_LINE_CHARACTER_LIMIT } });
  }
  if (leads.length === 0) return evidence;
  const edgeById = new Map(evidence.items.map((edge) => [edge.id, edge]));
  leads.sort((left, right) => {
    const overlap = (edgeId: string) => [...terminalNameTerms(edgeById.get(edgeId)!)].filter(
      (term) => terms.has(term)).length;
    return overlap(right.edgeId) - overlap(left.edgeId) ||
      edgeById.get(left.edgeId)!.range.start.line - edgeById.get(right.edgeId)!.range.start.line ||
      edgeById.get(left.edgeId)!.range.start.column - edgeById.get(right.edgeId)!.range.start.column;
  });
  return { ...evidence, sameClassDeclarationLeads: {
    policy: "bounded-python-same-class-declarations-v1",
    scope: "returned-bounded-graph",
    items: leads.slice(0, EXPLORE_SAME_CLASS_DECLARATION_LEAD_LIMIT),
    omittedCount: leads.length - EXPLORE_SAME_CLASS_DECLARATION_LEAD_LIMIT > 0
      ? leads.length - EXPLORE_SAME_CLASS_DECLARATION_LEAD_LIMIT : 0
  } };
}
