import {
  compareStableText,
  createEdgeId,
  type EdgeEvidence,
  type FsharpCallFact,
  type FsharpCallableFact,
  type FsharpHeritageFact,
  type FsharpInstantiationFact,
  type FsharpOpenFact,
  type FsharpOverrideFact,
  type FsharpTypeFact,
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

interface ResolvedFsharpType {
  readonly fact: FsharpTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedFsharpCallable {
  readonly fact: FsharpCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects F# facts through explicit open/module and type annotations without compiler inference. */
export function projectFsharpRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedFsharpType[] = [];
  const callables: ResolvedFsharpCallable[] = [];
  const opens: FsharpOpenFact[] = [];
  const calls: FsharpCallFact[] = [];
  const instantiations: FsharpInstantiationFact[] = [];
  const heritage: FsharpHeritageFact[] = [];
  const overrides: FsharpOverrideFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const fsharpFacts = facts.fsharpFacts;
    if (fsharpFacts === undefined) continue;
    for (const fact of fsharpFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of fsharpFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    opens.push(...fsharpFacts.opens);
    calls.push(...fsharpFacts.calls);
    instantiations.push(...fsharpFacts.instantiations);
    heritage.push(...fsharpFacts.heritage ?? []);
    overrides.push(...fsharpFacts.overrides ?? []);
  }
  const typesByName = new Map<string, ResolvedFsharpType[]>();
  const typesByPath = new Map<string, ResolvedFsharpType[]>();
  for (const entry of types) {
    const byName = typesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    typesByName.set(entry.fact.name, byName);
    const byPath = typesByPath.get(entry.fact.qualifiedTypePath) ?? [];
    byPath.push(entry);
    typesByPath.set(entry.fact.qualifiedTypePath, byPath);
  }
  const callablesByName = new Map<string, ResolvedFsharpCallable[]>();
  for (const entry of callables) {
    const byName = callablesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    callablesByName.set(entry.fact.name, byName);
  }
  const opensByFile = new Map<string, FsharpOpenFact[]>();
  for (const open of opens) {
    const values = opensByFile.get(open.filePath) ?? [];
    values.push(open);
    opensByFile.set(open.filePath, values);
  }
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); }
  };
  const visibleFrom = (filePath: string, candidate: { readonly fact: { readonly isExported: boolean }; readonly symbol: SymbolNode }): boolean => candidate.symbol.filePath === filePath || candidate.fact.isExported;
  const exactArity = (fact: FsharpCallableFact, count: number): boolean => fact.parameterCount === count && fact.requiredParameterCount === count;
  const openedModules = (filePath: string): readonly string[] => (opensByFile.get(filePath) ?? []).filter((open) => !open.isAlias).map((open) => open.importedPath);
  const resolveType = (filePath: string, name: string, moduleName = ""): readonly ResolvedFsharpType[] => {
    const direct = typesByPath.get(name) ?? [];
    const local = (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath || (moduleName !== "" && candidate.fact.moduleName === moduleName));
    const imported = (typesByName.get(name) ?? []).filter((candidate) => openedModules(filePath).includes(candidate.fact.moduleName));
    return [...new Map([...direct, ...local, ...imported].map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return {
      id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }),
      sourceId: value.sourceId,
      targetId: value.targetId,
      kind: value.kind,
      filePath: value.filePath,
      range: value.range,
      resolution: "exact",
      confidence: 1,
      referenceName: value.referenceName,
      evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : [])
    };
  };
  for (const open of opens) {
    const source = fileSymbols.get(open.filePath);
    const targets = [...new Set(types.filter((candidate) => (candidate.fact.declarationKind === "module" || candidate.fact.declarationKind === "namespace") && candidate.fact.qualifiedTypePath === open.importedPath && candidate.symbol.filePath !== open.filePath && candidate.fact.isExported).map((candidate) => candidate.symbol.filePath))];
    const target = targets.length === 1 ? fileSymbols.get(targets[0]!) : undefined;
    if (!open.isAlias && source !== undefined && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: open.filePath, referenceName: open.importedPath, range: open.range, ruleId: "module.fsharp.explicit-open.unique-module", targetFilePath: target.filePath }));
  }
  for (const callable of callables) {
    const parameterNames = callable.fact.parameterTypeNames ?? [];
    if (parameterNames.length === callable.fact.parameterCount) {
      for (const name of [...new Set(parameterNames)]) {
        const candidates = resolveType(callable.symbol.filePath, name, callable.fact.moduleName).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
        if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: name, range: callable.fact.range, ruleId: "syntax.fsharp.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
      }
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = resolveType(callable.symbol.filePath, callable.fact.returnTypeName, callable.fact.moduleName).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.fsharp.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedFsharpCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    const sourceModule = source.fact.moduleName;
    if (call.callKind === "direct" || call.callKind === "pipeline") {
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "function" && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate) && (candidate.symbol.filePath === call.filePath || candidate.fact.moduleName === sourceModule || openedModules(call.filePath).includes(candidate.fact.moduleName)));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: call.callKind === "pipeline" ? "syntax.fsharp.unique-pipeline-function-call" : "syntax.fsharp.unique-direct-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.receiverTypeName === undefined) continue;
    const receiverTypes = resolveType(call.filePath, call.receiverTypeName, sourceModule);
    if (receiverTypes.length === 1 && receiverTypes[0] !== undefined) {
      const receiver = receiverTypes[0];
      if (!visibleFrom(call.filePath, receiver) || ["interface", "enum", "delegate", "module", "namespace", "union"].includes(receiver.fact.declarationKind)) continue;
      const members = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.ownerTypeId === receiver.symbol.id && candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate) && (call.receiverIsType === true ? candidate.fact.isStatic : !candidate.fact.isStatic));
      if (members.length === 1 && members[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: members[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.fsharp.unique-member-call", targetFilePath: members[0].symbol.filePath }));
      continue;
    }
    const moduleNames = [...new Set(types.filter((candidate) => (candidate.fact.declarationKind === "module" || candidate.fact.declarationKind === "namespace") && (candidate.fact.qualifiedTypePath === call.receiverTypeName || candidate.fact.qualifiedTypePath.endsWith(`.${call.receiverTypeName}`))).map((candidate) => candidate.fact.qualifiedTypePath))].filter((name) => sourceModule === "" || name.startsWith(sourceModule) || openedModules(call.filePath).some((open) => name.startsWith(open)));
    const moduleFunctions = callables.filter((candidate) => candidate.fact.callableKind === "function" && candidate.fact.moduleName !== "" && moduleNames.includes(candidate.fact.moduleName) && candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate));
    if (moduleFunctions.length === 1 && moduleFunctions[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: moduleFunctions[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "module.fsharp.unique-module-function-call", targetFilePath: moduleFunctions[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = resolveType(instantiation.filePath, instantiation.typeName, source.fact.moduleName).filter((candidate) => candidate.fact.declarationKind === "class" && visibleFrom(instantiation.filePath, candidate));
    if (candidates.length !== 1 || candidates[0] === undefined) continue;
    const constructors = callables.filter((candidate) => candidate.fact.callableKind === "constructor" && candidate.fact.ownerTypeId === candidates[0]!.symbol.id && exactArity(candidate.fact, instantiation.argumentCount) && visibleFrom(instantiation.filePath, candidate));
    if (constructors.length === 1) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.fsharp.unique-constructor-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  const heritageEdges: GraphEdge[] = [];
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) continue;
    const sourceFact = types.find((candidate) => candidate.symbol.id === source.id);
    const candidates = resolveType(reference.filePath, reference.referenceName, sourceFact?.fact.moduleName ?? "");
    if (candidates.length !== 1 || candidates[0] === undefined || !visibleFrom(reference.filePath, candidates[0])) continue;
    const kind: GraphEdge["kind"] = candidates[0].fact.declarationKind === "interface" ? "implements" : "extends";
    const edge = edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind, filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: kind === "implements" ? "syntax.fsharp.unique-interface-target" : "syntax.fsharp.unique-extends-target", targetFilePath: candidates[0].symbol.filePath });
    heritageEdges.push(edge);
    push(edge);
  }
  for (const override of overrides) {
    const source = input.symbolsById.get(override.sourceId);
    const owner = types.find((candidate) => candidate.symbol.filePath === override.filePath && candidate.fact.name === override.ownerTypeName);
    const sourceFact = callables.find((candidate) => candidate.symbol.id === override.sourceId);
    if (source?.filePath !== override.filePath || owner === undefined || sourceFact === undefined) continue;
    const parents = heritageEdges.filter((edge) => edge.sourceId === owner.symbol.id);
    const parentMethods = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.name === override.methodName && exactArity(candidate.fact, sourceFact.fact.parameterCount) && parents.some((parent) => parent.targetId === candidate.fact.ownerTypeId));
    if (parentMethods.length === 1 && parentMethods[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: parentMethods[0].symbol.id, kind: "overrides", filePath: override.filePath, referenceName: override.methodName, range: override.range, ruleId: "syntax.fsharp.explicit-direct-base-method", targetFilePath: parentMethods[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
