import { compareStableText, createEdgeId, type GraphEdge, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

function solidityInheritanceRuleId(
  source: SymbolNode,
  relationKind: "extends" | "implements"
): string {
  return "language.solidity.same-file." + source.kind + "." + relationKind;
}

/**
 * A Solidity `is` clause can mean class inheritance or interface implementation.
 * Resolve it only when one declaration in the same complete source file proves
 * the target kind; imports and constructor-argument clauses remain unprojected.
 */
export function projectSolidityInheritance(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
}, referenceEvidence: ReferenceEvidenceFactory, candidateSymbolIds: (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[]): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    const declarationsByName = new Map<string, SymbolNode[]>();
    for (const symbol of facts.symbols) {
      if (symbol.kind !== "class" && symbol.kind !== "interface") {
        continue;
      }
      const declarations = declarationsByName.get(symbol.name) ?? [];
      declarations.push(symbol);
      declarationsByName.set(symbol.name, declarations);
    }
    const references = [...(facts.solidityFacts?.inheritanceReferences ?? [])].sort((left, right) => {
      const bySource = compareStableText(left.sourceId, right.sourceId);
      if (bySource !== 0) {
        return bySource;
      }
      const byRange = left.range.start.line - right.range.start.line;
      if (byRange !== 0) {
        return byRange;
      }
      return left.range.start.column - right.range.start.column;
    });
    for (const reference of references) {
      const source = symbolsById.get(reference.sourceId);
      if (source === undefined || (source.kind !== "class" && source.kind !== "interface")) {
        continue;
      }
      const candidates = (declarationsByName.get(reference.baseName) ?? []).filter(
        (candidate) => candidate.id !== source.id
      );
      if (candidates.length !== 1) {
        continue;
      }
      const target = candidates[0];
      if (target === undefined) {
        continue;
      }
      const relationKind =
        source.kind === "class" && target.kind === "interface"
          ? "implements"
          : source.kind === "class" && target.kind === "class"
            ? "extends"
            : source.kind === "interface" && target.kind === "interface"
              ? "extends"
              : null;
      if (relationKind === null) {
        continue;
      }
      edges.push({
        id: createEdgeId({
          sourceId: source.id,
          targetId: target.id,
          kind: relationKind,
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.baseName
        }),
        sourceId: source.id,
        targetId: target.id,
        kind: relationKind,
        filePath: reference.filePath,
        range: reference.range,
        resolution: "exact",
        confidence: 1,
        referenceName: reference.baseName,
        evidence: referenceEvidence(
          solidityInheritanceRuleId(source, relationKind),
          "module",
          candidateSymbolIds([target])
        )
      });
    }
  }
  return edges;
}
