import {
  compareStableText,
  createEdgeId,
  type EdgeEvidence,
  type HaskellCallFact,
  type HaskellCallableFact,
  type HaskellHeritageFact,
  type HaskellImportFact,
  type HaskellInstantiationFact,
  type HaskellTypeFact,
  type GraphEdge,
  type SourceRange,
  type SymbolNode
} from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";

type ReferenceEvidenceFactory = (
  ruleId: EdgeEvidence["ruleId"],
  stage: EdgeEvidence["stage"],
  candidateIds: readonly string[],
  configurationPaths?: readonly string[],
  resolutionPath?: readonly string[]
) => EdgeEvidence;

interface ResolvedHaskellType {
  readonly fact: HaskellTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedHaskellCallable {
  readonly fact: HaskellCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Haskell facts through explicit imports and simple signatures without compiler inference. */
export function projectHaskellRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedHaskellType[] = [];
  const callables: ResolvedHaskellCallable[] = [];
  const imports: HaskellImportFact[] = [];
  const calls: HaskellCallFact[] = [];
  const instantiations: HaskellInstantiationFact[] = [];
  const heritage: HaskellHeritageFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const haskellFacts = facts.haskellFacts;
    if (haskellFacts === undefined) continue;
    for (const fact of haskellFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of haskellFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...haskellFacts.imports);
    calls.push(...haskellFacts.calls);
    instantiations.push(...haskellFacts.instantiations);
    heritage.push(...haskellFacts.heritage ?? []);
  }
  const typesByName = new Map<string, ResolvedHaskellType[]>();
  const typesByPath = new Map<string, ResolvedHaskellType[]>();
  for (const entry of types) {
    const byName = typesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    typesByName.set(entry.fact.name, byName);
    const byPath = typesByPath.get(entry.fact.qualifiedTypePath) ?? [];
    byPath.push(entry);
    typesByPath.set(entry.fact.qualifiedTypePath, byPath);
  }
  const callablesByName = new Map<string, ResolvedHaskellCallable[]>();
  for (const entry of callables) {
    const byName = callablesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    callablesByName.set(entry.fact.name, byName);
  }
  const importsByFile = new Map<string, HaskellImportFact[]>();
  for (const importFact of imports) {
    const values = importsByFile.get(importFact.filePath) ?? [];
    values.push(importFact);
    importsByFile.set(importFact.filePath, values);
  }
  const modulesByName = new Map<string, ResolvedHaskellType[]>();
  for (const entry of types.filter((candidate) => candidate.fact.declarationKind === "module")) {
    const values = modulesByName.get(entry.fact.qualifiedTypePath) ?? [];
    values.push(entry);
    modulesByName.set(entry.fact.qualifiedTypePath, values);
  }
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const exactArity = (fact: HaskellCallableFact, count: number): boolean => fact.parameterCount === count && fact.requiredParameterCount === count;
  const importMatches = (filePath: string, moduleName: string, name: string, options: { readonly qualified?: boolean; readonly unqualified?: boolean } = {}): boolean => (importsByFile.get(filePath) ?? []).some((importFact) => importFact.importedModule === moduleName && (options.qualified === undefined || importFact.isQualified === options.qualified) && (options.unqualified === undefined || importFact.isQualified !== options.unqualified) && (importFact.importedNames === undefined || importFact.importedNames.includes(name)));
  const visibleFrom = (filePath: string, candidate: { readonly fact: { readonly isExported: boolean; readonly moduleName: string; readonly name: string }; readonly symbol: SymbolNode }, mode: "value" | "type" = "value"): boolean => candidate.symbol.filePath === filePath || (candidate.fact.isExported && importMatches(filePath, candidate.fact.moduleName, candidate.fact.name, mode === "value" ? { unqualified: true } : { unqualified: true }));
  const resolveType = (filePath: string, name: string, moduleName = ""): readonly ResolvedHaskellType[] => {
    const direct = typesByPath.get(name) ?? [];
    const local = (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath || (moduleName !== "" && candidate.fact.moduleName === moduleName));
    const imported = (typesByName.get(name) ?? []).filter((candidate) => importMatches(filePath, candidate.fact.moduleName, candidate.fact.name, { unqualified: true }));
    return [...new Map([...direct, ...local, ...imported].map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  for (const importFact of imports) {
    const source = fileSymbols.get(importFact.filePath);
    const targets = modulesByName.get(importFact.importedModule) ?? [];
    const targetFiles = [...new Set(targets.filter((candidate) => candidate.symbol.filePath !== importFact.filePath && candidate.fact.isExported).map((candidate) => candidate.symbol.filePath))];
    const target = targetFiles.length === 1 ? fileSymbols.get(targetFiles[0]!) : undefined;
    if (source !== undefined && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: importFact.filePath, referenceName: importFact.importedModule, range: importFact.range, ruleId: "module.haskell.explicit-import.unique-module", targetFilePath: target.filePath }));
  }
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = resolveType(callable.symbol.filePath, typeName, callable.fact.moduleName).filter((candidate) => candidate.fact.declarationKind !== "module" && visibleFrom(callable.symbol.filePath, candidate, "type"));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.haskell.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = resolveType(callable.symbol.filePath, callable.fact.returnTypeName, callable.fact.moduleName).filter((candidate) => candidate.fact.declarationKind !== "module" && visibleFrom(callable.symbol.filePath, candidate, "type"));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.haskell.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedHaskellCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    if (call.callKind === "direct") {
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "function" && exactArity(candidate.fact, call.argumentCount) && (candidate.symbol.filePath === call.filePath || candidate.fact.moduleName === source.fact.moduleName || importMatches(call.filePath, candidate.fact.moduleName, candidate.fact.name, { unqualified: true })));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.haskell.unique-direct-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    const moduleName = call.receiverModuleName ?? call.receiverAlias ?? "";
    const qualifiedImports = (importsByFile.get(call.filePath) ?? []).filter((importFact) => importFact.isQualified && (importFact.alias ?? importFact.importedModule.split(".").at(-1)) === moduleName);
    const moduleTargets = [...new Set(qualifiedImports.map((importFact) => importFact.importedModule))].flatMap((name) => modulesByName.get(name) ?? []);
    const candidates = callables.filter((candidate) => candidate.fact.callableKind === "function" && candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && moduleTargets.some((module) => module.fact.qualifiedTypePath === candidate.fact.moduleName) && (candidate.fact.isExported && (qualifiedImports.some((importFact) => importFact.importedModule === candidate.fact.moduleName && (importFact.importedNames === undefined || importFact.importedNames.includes(candidate.fact.name))))));
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "module.haskell.unique-qualified-function-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = types.filter((candidate) => candidate.fact.constructorNames?.includes(instantiation.constructorName) === true && candidate.fact.constructorArities?.[instantiation.constructorName] === instantiation.argumentCount && (candidate.symbol.filePath === instantiation.filePath || importMatches(instantiation.filePath, candidate.fact.moduleName, instantiation.constructorName, { unqualified: true })));
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.constructorName, range: instantiation.range, ruleId: "syntax.haskell.unique-constructor-creation", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) continue;
    const sourceType = types.find((candidate) => candidate.symbol.id === source.id);
    const candidates = resolveType(reference.filePath, reference.referenceName, sourceType?.fact.moduleName ?? "").filter((candidate) => candidate.fact.declarationKind === "class");
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: "implements", filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: "syntax.haskell.unique-typeclass-instance", targetFilePath: candidates[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
