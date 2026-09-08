import { posix } from "node:path";
import { compareStableText, createEdgeId, type GraphEdge, type ProtoImportFact, type ProtoRpcFact, type ProtoTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedProtoType {
  readonly fact: ProtoTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedProtoRpc {
  readonly fact: ProtoRpcFact;
  readonly symbol: SymbolNode;
}

/** Projects literal local proto imports and imported RPC message references. */
export function projectProtoRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly knownFilePaths: ReadonlySet<string>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedProtoType[] = [];
  const imports: ProtoImportFact[] = [];
  const rpcs: ResolvedProtoRpc[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const protoFacts = facts.protoFacts;
    if (protoFacts === undefined || protoFacts.parserRejected === true) continue;
    for (const fact of protoFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    imports.push(...protoFacts.imports);
    for (const fact of protoFacts.rpcs) {
      const symbol = input.symbolsById.get(fact.sourceId);
      if (symbol?.filePath === filePath && symbol.kind === "method" && symbol.name === fact.name) rpcs.push({ fact, symbol });
    }
  }
  const fileSymbols = new Map(
    [...input.symbolsById.values()]
      .filter((symbol) => symbol.kind === "file")
      .map((symbol) => [symbol.filePath, symbol])
  );
  const normalizeImportPath = (filePath: string, importPath: string): string | null => {
    if (importPath.length === 0 || importPath.startsWith("/") || importPath.includes("\\")) return null;
    const candidates = new Set<string>();
    for (const candidate of [posix.normalize(posix.join(posix.dirname(filePath), importPath)), posix.normalize(importPath)]) {
      if (candidate === ".." || candidate.startsWith("../") || candidate.length === 0) continue;
      if (input.knownFilePaths.has(candidate)) candidates.add(candidate);
    }
    return candidates.size === 1 ? [...candidates][0] ?? null : null;
  };
  const resolvedImports = imports.flatMap((fact) => {
    const targetPath = normalizeImportPath(fact.filePath, fact.importPath);
    const source = fileSymbols.get(fact.filePath);
    const target = targetPath === null ? undefined : fileSymbols.get(targetPath);
    return source !== undefined && target !== undefined && source.filePath !== target.filePath
      ? [{ fact, source, target, targetPath: target.filePath }]
      : [];
  });
  const importTargetsByFile = new Map<string, string[]>();
  for (const entry of resolvedImports) {
    if (entry.fact.importKind !== "plain") continue;
    const existing = importTargetsByFile.get(entry.fact.filePath) ?? [];
    if (!existing.includes(entry.targetPath)) existing.push(entry.targetPath);
    importTargetsByFile.set(entry.fact.filePath, existing);
  }
  const messageByFileAndName = new Map<string, ResolvedProtoType[]>();
  for (const type of types) {
    if (type.fact.declarationKind !== "message") continue;
    const key = `${type.symbol.filePath}\u0000${type.fact.name}`;
    messageByFileAndName.set(key, [...(messageByFileAndName.get(key) ?? []), type]);
  }
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => ({
    id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }),
    sourceId: value.sourceId,
    targetId: value.targetId,
    kind: value.kind,
    filePath: value.filePath,
    range: value.range,
    resolution: "exact",
    confidence: 1,
    referenceName: value.referenceName,
    evidence: referenceEvidence(value.ruleId, value.filePath === value.targetFilePath ? "syntax" : "module", [value.targetId], [], value.filePath === value.targetFilePath ? [] : [value.filePath, value.targetFilePath])
  });
  for (const entry of resolvedImports) {
    push(edgeFor({ sourceId: entry.source.id, targetId: entry.target.id, kind: "imports", filePath: entry.fact.filePath, referenceName: entry.fact.importPath, range: entry.fact.range, ruleId: "syntax.proto.literal-import.unique-file", targetFilePath: entry.target.filePath }));
  }
  for (const rpc of rpcs) {
    const importedTargets = importTargetsByFile.get(rpc.fact.filePath) ?? [];
    if (importedTargets.length === 0) continue;
    const localMessageNames = new Set(types.filter((type) => type.symbol.filePath === rpc.fact.filePath && type.fact.declarationKind === "message").map((type) => type.fact.name));
    for (const relation of [
      { name: rpc.fact.requestName, qualified: rpc.fact.requestQualified, range: rpc.fact.requestRange, suffix: "request" },
      { name: rpc.fact.responseName, qualified: rpc.fact.responseQualified, range: rpc.fact.responseRange, suffix: "response" }
    ] as const) {
      if (relation.qualified || localMessageNames.has(relation.name)) continue;
      const candidates = [...new Map(importedTargets.flatMap((targetPath) => messageByFileAndName.get(`${targetPath}\u0000${relation.name}`) ?? []).map((candidate) => [candidate.symbol.id, candidate])).values()];
      if (candidates.length !== 1 || candidates[0] === undefined) continue;
      push(edgeFor({ sourceId: rpc.symbol.id, targetId: candidates[0].symbol.id, kind: "references", filePath: rpc.fact.filePath, referenceName: relation.name, range: relation.range, ruleId: `module.proto.unique-imported-rpc-${relation.suffix}-message-reference`, targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
