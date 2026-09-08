import { compareStableText, createEdgeId, type GraphEdge, type SqlRelationFact, type SqlTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedSqlType {
  readonly fact: SqlTypeFact;
  readonly symbol: SymbolNode;
}

/** Projects unique PostgreSQL table foreign-key and INHERITS relations from parsed DDL facts. */
export function projectSqlRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedSqlType[] = [];
  const relations: SqlRelationFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const sqlFacts = facts.sqlFacts;
    if (sqlFacts === undefined || sqlFacts.parserRejected === true) continue;
    for (const fact of sqlFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.kind === "resource" && symbol.name === fact.name) {
        types.push({ fact, symbol });
      }
    }
    relations.push(...sqlFacts.relations);
  }
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };
  const edgeFor = (value: {
    readonly sourceId: string;
    readonly targetId: string;
    readonly kind: GraphEdge["kind"];
    readonly filePath: string;
    readonly referenceName: string;
    readonly range: SourceRange;
    readonly ruleId: string;
    readonly targetFilePath: string;
  }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return {
      id: createEdgeId({
        sourceId: value.sourceId,
        targetId: value.targetId,
        kind: value.kind,
        line: value.range.start.line,
        column: value.range.start.column,
        referenceName: value.referenceName
      }),
      sourceId: value.sourceId,
      targetId: value.targetId,
      kind: value.kind,
      filePath: value.filePath,
      range: value.range,
      resolution: "exact",
      confidence: 1,
      referenceName: value.referenceName,
      evidence: referenceEvidence(
        value.ruleId,
        crossFile ? "module" : "syntax",
        [value.targetId],
        [],
        crossFile ? [value.filePath, value.targetFilePath] : []
      )
    };
  };
  const tables = types.filter((entry) => entry.fact.declarationKind === "table");
  const tablesByName = new Map<string, ResolvedSqlType[]>();
  const tablesByLeaf = new Map<string, ResolvedSqlType[]>();
  for (const table of tables) {
    tablesByName.set(table.fact.name, [...(tablesByName.get(table.fact.name) ?? []), table]);
    const leaf = table.fact.name.split(".").at(-1);
    if (leaf !== undefined) tablesByLeaf.set(leaf, [...(tablesByLeaf.get(leaf) ?? []), table]);
  }
  const resolveTable = (name: string): readonly ResolvedSqlType[] => {
    const exact = tablesByName.get(name) ?? [];
    if (exact.length > 0) return [...new Map(exact.map((candidate) => [candidate.symbol.id, candidate])).values()];
    if (name.includes(".")) return [];
    return [...new Map((tablesByLeaf.get(name) ?? []).map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  for (const relation of relations) {
    const source = input.symbolsById.get(relation.sourceId);
    if (source === undefined) continue;
    const sourceCandidates = tablesByName.get(relation.sourceTableName) ?? [];
    const targetCandidates = resolveTable(relation.targetTableName);
    if (sourceCandidates.length !== 1 || targetCandidates.length !== 1 || targetCandidates[0] === undefined) continue;
    const target = targetCandidates[0];
    const sourceTable = sourceCandidates[0];
    if (sourceTable === undefined || sourceTable.symbol.id !== source.id || target.symbol.id === source.id && relation.relationKind === "extends") continue;
    push(edgeFor({
      sourceId: source.id,
      targetId: target.symbol.id,
      kind: relation.relationKind,
      filePath: relation.filePath,
      referenceName: relation.targetTableName,
      range: relation.range,
      ruleId: relation.relationKind === "references"
        ? "syntax.sql.unique-foreign-key-table"
        : "syntax.sql.unique-table-inheritance",
      targetFilePath: target.symbol.filePath
    }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
