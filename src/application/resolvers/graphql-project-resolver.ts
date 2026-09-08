import { compareStableText, createEdgeId, type GraphEdge, type GraphqlHeritageFact, type GraphqlTypeFact, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedGraphqlType {
  readonly fact: GraphqlTypeFact;
  readonly symbol: SymbolNode;
}

/** Projects unique cross-file GraphQL interface implementations without schema stitching/runtime claims. */
export function projectGraphqlRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedGraphqlType[] = [];
  const heritage: GraphqlHeritageFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const graphqlFacts = facts.graphqlFacts;
    if (graphqlFacts === undefined || graphqlFacts.parserRejected === true) continue;
    for (const fact of graphqlFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    heritage.push(...graphqlFacts.heritage);
  }
  const typesByName = new Map<string, ResolvedGraphqlType[]>();
  const interfacesByName = new Map<string, ResolvedGraphqlType[]>();
  for (const type of types) {
    typesByName.set(type.fact.name, [...(typesByName.get(type.fact.name) ?? []), type]);
    if (type.fact.declarationKind === "interface") interfacesByName.set(type.fact.name, [...(interfacesByName.get(type.fact.name) ?? []), type]);
  }
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };
  for (const relation of heritage) {
    const source = input.symbolsById.get(relation.sourceId);
    if (source?.filePath !== relation.filePath) continue;
    const sourceFact = types.find((candidate) => candidate.symbol.id === source.id && candidate.fact.name === relation.sourceName);
    if (sourceFact === undefined) continue;
    const sourceCandidates = typesByName.get(relation.sourceName) ?? [];
    const targetCandidates = interfacesByName.get(relation.targetName) ?? [];
    if (sourceCandidates.length !== 1 || targetCandidates.length !== 1 || targetCandidates[0] === undefined) continue;
    const target = targetCandidates[0];
    if (source.filePath === target.symbol.filePath || source.id === target.symbol.id) continue;
    push({
      id: createEdgeId({ sourceId: source.id, targetId: target.symbol.id, kind: "extends", line: relation.range.start.line, column: relation.range.start.column, referenceName: relation.targetName }),
      sourceId: source.id,
      targetId: target.symbol.id,
      kind: "extends",
      filePath: relation.filePath,
      range: relation.range,
      resolution: "exact",
      confidence: 1,
      referenceName: relation.targetName,
      evidence: referenceEvidence("module.graphql.unique-direct-interface-implementation", "module", [target.symbol.id], [], [relation.filePath, target.symbol.filePath])
    });
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
