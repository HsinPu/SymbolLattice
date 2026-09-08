import { compareStableText, createEdgeId, type GraphEdge, type SymbolNode, type EdgeEvidence } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import type { SourceDocument } from "../../ports/source-catalog.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

function nestGraphqlResolverSchemaRuleId(
  suffix: "unique-object-type" | "unresolved-object-type" | "ambiguous-object-type"
): string {
  return `framework.nestjs.graphql.resolver-schema.${suffix}`;
}

/**
 * A direct `@Resolver(() => User)` proves the NestJS decorator and the source
 * identifier, but not that the TypeScript runtime value and a GraphQL schema
 * declaration are semantically the same type. Project the relation only when
 * exactly one indexed GraphQL object type shares that name, and retain it as a
 * bounded heuristic rather than overstating cross-language proof.
 */
export function projectNestGraphqlResolverSchemaReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly sourceDocuments: readonly SourceDocument[];
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}, referenceEvidence: ReferenceEvidenceFactory, candidateSymbolIds: (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[]): readonly GraphEdge[] {
  const languageByFile = new Map(
    input.sourceDocuments.map((document) => [document.relativePath, document.language] as const)
  );
  const schemaObjectTypes: SymbolNode[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    if (languageByFile.get(filePath) !== "graphql") {
      continue;
    }
    const qualifiedNamePrefix = `${filePath}#type:`;
    for (const symbol of facts.symbols) {
      if (
        symbol.kind === "class" &&
        symbol.qualifiedName === qualifiedNamePrefix + symbol.name
      ) {
        schemaObjectTypes.push(symbol);
      }
    }
  }

  const edges: GraphEdge[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.nestGraphqlFacts?.resolverReferences ?? [])].sort((left, right) => {
      const byResolver = compareStableText(left.resolverId, right.resolverId);
      if (byResolver !== 0) {
        return byResolver;
      }
      const byLine = left.range.start.line - right.range.start.line;
      return byLine !== 0 ? byLine : left.range.start.column - right.range.start.column;
    });
    for (const reference of references) {
      const source = input.symbolsById.get(reference.resolverId);
      if (source?.kind !== "class") {
        continue;
      }
      const candidates = schemaObjectTypes
        .filter((symbol) => symbol.name === reference.schemaTypeName)
        .sort((left, right) => compareStableText(left.id, right.id));
      const target = candidates.length === 1 ? candidates[0] : undefined;
      const suffix =
        target !== undefined
          ? "unique-object-type"
          : candidates.length === 0
            ? "unresolved-object-type"
            : "ambiguous-object-type";
      edges.push({
        id: createEdgeId({
          sourceId: source.id,
          targetId: target?.id ?? null,
          kind: "references",
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.schemaTypeName
        }),
        sourceId: source.id,
        targetId: target?.id ?? null,
        kind: "references",
        filePath,
        range: reference.range,
        resolution: target === undefined ? "unresolved" : "heuristic",
        confidence: target === undefined ? 0 : 0.85,
        referenceName: reference.schemaTypeName,
        evidence: referenceEvidence(
          nestGraphqlResolverSchemaRuleId(suffix),
          target === undefined ? "unresolved" : "heuristic",
          candidateSymbolIds(candidates)
        )
      });
    }
  }
  return edges;
}
