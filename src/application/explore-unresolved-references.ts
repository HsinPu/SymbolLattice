import type { SymbolNode } from "../domain/types.js";
import type { UnresolvedReferenceEvidence } from "./types.js";
import { selectQueryUnresolvedCalls } from "./explore-unresolved-calls.js";

export const EXPLORE_UNRESOLVED_REFERENCE_CANDIDATE_LIMIT = 64;
export const EXPLORE_UNRESOLVED_REFERENCE_LIMIT = 8;
const DECLARATION_LIMIT = 2;
const DECLARATION_LINE_LIMIT = 256;

/** Select written names, without adding name-based targets or access-mode claims. */
export function selectQueryUnresolvedReferences(
  evidence: UnresolvedReferenceEvidence, terms: readonly string[], limit: number
): UnresolvedReferenceEvidence {
  const selected = selectQueryUnresolvedCalls({ state: evidence.state, items: evidence.items,
    truncated: evidence.truncated }, terms, limit);
  return { ...evidence, state: selected.state, items: selected.items, truncated: selected.truncated };
}

/** Source-cited declaration leads from the returned graph, never descriptor/receiver resolution. */
export function withMemberReferenceDeclarationLeads(
  evidence: UnresolvedReferenceEvidence, owner: SymbolNode,
  declarationsByQualifiedName: ReadonlyMap<string, readonly SymbolNode[]>,
  sourceLineFor: (declaration: SymbolNode) => string | null
): UnresolvedReferenceEvidence {
  if (evidence.state !== "available" || owner.kind !== "method" ||
      !owner.filePath.toLowerCase().endsWith(".py")) return evidence;
  const separator = owner.qualifiedName.lastIndexOf(".");
  if (separator < 0) return evidence;
  const className = owner.qualifiedName.slice(0, separator);
  const leads: NonNullable<UnresolvedReferenceEvidence["sameClassDeclarationLeads"]>["items"][number][] = [];
  for (const edge of evidence.items) {
    if (edge.kind !== "references" || edge.resolution !== "unresolved" || edge.targetId !== null ||
        edge.confidence !== 0 || edge.sourceId !== owner.id || edge.filePath !== owner.filePath ||
        edge.evidence?.ruleId !== "syntax.python.member-reference.unknown-receiver" ||
        !/^self\.[\p{L}_][\p{L}\p{N}_]*$/u.test(edge.referenceName ?? "")) continue;
    const name = edge.referenceName!.slice(5);
    const declarations = (declarationsByQualifiedName.get(`${className}.${name}`) ?? [])
      .filter((declaration) => declaration.kind === "method" && declaration.filePath === owner.filePath);
    if (declarations.length !== 1) continue;
    const declaration = declarations[0]!;
    const line = sourceLineFor(declaration);
    if (line === null || !line.includes(declaration.name)) continue;
    leads.push({ edgeId: edge.id, declaration,
      declarationLine: { line: declaration.range.start.line,
        text: line.slice(0, DECLARATION_LINE_LIMIT), truncated: line.length > DECLARATION_LINE_LIMIT } });
  }
  if (leads.length === 0) return evidence;
  return { ...evidence, sameClassDeclarationLeads: {
    policy: "bounded-python-member-reference-declarations-v1", scope: "returned-bounded-graph",
    items: leads.slice(0, DECLARATION_LIMIT), omittedCount: Math.max(0, leads.length - DECLARATION_LIMIT)
  } };
}
