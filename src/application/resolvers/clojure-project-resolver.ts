import { compareStableText, createEdgeId, type GraphEdge, type ClojureCallFact, type ClojureCallableFact, type ClojureHeritageFact, type ClojureImportFact, type ClojureInstantiationFact, type ClojureTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedClojureType {
  readonly fact: ClojureTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedClojureCallable {
  readonly fact: ClojureCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Clojure syntax facts through unique project-local namespaces. */
export function projectClojureRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedClojureType[] = [];
  const callables: ResolvedClojureCallable[] = [];
  const imports: ClojureImportFact[] = [];
  const calls: ClojureCallFact[] = [];
  const instantiations: ClojureInstantiationFact[] = [];
  const heritage: ClojureHeritageFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const clojureFacts = facts.clojureFacts;
    if (clojureFacts === undefined || clojureFacts.parserRejected === true) continue;
    for (const fact of clojureFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of clojureFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...clojureFacts.imports);
    calls.push(...clojureFacts.calls);
    instantiations.push(...clojureFacts.instantiations);
    heritage.push(...clojureFacts.heritage ?? []);
  }

  const typesByName = new Map<string, ResolvedClojureType[]>();
  for (const entry of types) typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
  const typesByNamespace = new Map<string, ResolvedClojureType[]>();
  for (const entry of types) typesByNamespace.set(entry.fact.namespaceName, [...(typesByNamespace.get(entry.fact.namespaceName) ?? []), entry]);
  const callablesByKey = new Map<string, ResolvedClojureCallable[]>();
  for (const entry of callables) {
    const key = `${entry.fact.namespaceName}\u0000${entry.fact.name}\u0000${entry.fact.parameterCount}`;
    callablesByKey.set(key, [...(callablesByKey.get(key) ?? []), entry]);
  }
  const importsByFile = new Map<string, ClojureImportFact[]>();
  for (const imported of imports) importsByFile.set(imported.filePath, [...(importsByFile.get(imported.filePath) ?? []), imported]);
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  const uniqueNamespace = (name: string): ResolvedClojureType | undefined => {
    const candidates = (typesByNamespace.get(name) ?? []).filter((candidate) => candidate.fact.declarationKind === "namespace");
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  const visibleTypes = (filePath: string, name: string): readonly ResolvedClojureType[] => [...new Map((typesByName.get(name) ?? []).filter((candidate) => candidate.fact.declarationKind !== "namespace" && (candidate.symbol.filePath === filePath || candidate.fact.isExported)).map((candidate) => [candidate.symbol.id, candidate])).values()];
  const sourceCallable = (sourceId: string, filePath: string): ResolvedClojureCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);

  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    const target = uniqueNamespace(imported.importedNamespace);
    if (source === undefined || target === undefined || target.symbol.filePath === imported.filePath) continue;
    push(edgeFor({ sourceId: source.id, targetId: target.symbol.id, kind: "imports", filePath: imported.filePath, referenceName: imported.importedNamespace, range: imported.range, ruleId: "module.clojure.explicit-require.unique-namespace", targetFilePath: target.symbol.filePath }));
  }
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = visibleTypes(callable.symbol.filePath, typeName);
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.clojure.unique-type-hint-parameter", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = visibleTypes(callable.symbol.filePath, callable.fact.returnTypeName);
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.clojure.unique-type-hint-return", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    const candidates: ResolvedClojureCallable[] = [];
    let namespaceNames: string[] = [];
    if (call.callKind === "namespace") {
      const receiver = call.receiverNamespaceName;
      const imported = receiver === undefined ? undefined : (importsByFile.get(call.filePath) ?? []).filter((entry) => entry.alias === receiver);
      namespaceNames = imported === undefined ? [] : imported.length === 1 ? [imported[0]!.importedNamespace] : [];
      if (receiver !== undefined && imported === undefined) namespaceNames = [receiver];
    } else {
      namespaceNames = [source.fact.namespaceName];
      for (const imported of importsByFile.get(call.filePath) ?? []) {
        if ((imported.referredNames ?? []).includes(call.referenceName)) namespaceNames.push(imported.importedNamespace);
      }
    }
    for (const namespaceName of new Set(namespaceNames)) {
      for (const candidate of callablesByKey.get(`${namespaceName}\u0000${call.referenceName}\u0000${call.argumentCount}`) ?? []) {
        if (call.callKind === "namespace" && (!candidate.fact.isExported || uniqueNamespace(namespaceName)?.symbol.filePath !== candidate.symbol.filePath)) continue;
        if (!candidates.some((existing) => existing.symbol.id === candidate.symbol.id)) candidates.push(candidate);
      }
    }
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: call.callKind === "namespace" ? "module.clojure.unique-qualified-call" : "syntax.clojure.unique-local-or-referred-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const constructorName = `${instantiation.constructorKind === "map-arrow" ? "map->" : "->"}${instantiation.typeName}`;
    const referredNamespaces = (importsByFile.get(instantiation.filePath) ?? [])
      .filter((imported) => (imported.referredNames ?? []).includes(constructorName))
      .map((imported) => imported.importedNamespace);
    const candidates = visibleTypes(instantiation.filePath, instantiation.typeName).filter((candidate) => candidate.fact.declarationKind === "record" && (candidate.fact.namespaceName === source.fact.namespaceName || referredNamespaces.includes(candidate.fact.namespaceName)));
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.clojure.unique-record-constructor", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const reference of heritage) {
    const sources = (typesByName.get(reference.sourceTypeName) ?? []).filter((candidate) => candidate.fact.declarationKind === "record");
    const targets = (typesByName.get(reference.referenceName) ?? []).filter((candidate) => candidate.fact.declarationKind === "protocol" && candidate.fact.isExported);
    if (sources.length === 1 && targets.length === 1 && sources[0] !== undefined && targets[0] !== undefined) push(edgeFor({ sourceId: sources[0].symbol.id, targetId: targets[0].symbol.id, kind: "implements", filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: "syntax.clojure.unique-record-protocol", targetFilePath: targets[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
