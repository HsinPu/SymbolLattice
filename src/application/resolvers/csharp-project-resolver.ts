import {
  compareStableText,
  createEdgeId,
  type GraphEdge,
  type CsharpCallFact,
  type CsharpCallableFact,
  type CsharpHeritageFact,
  type CsharpInstantiationFact,
  type CsharpOverrideFact,
  type CsharpTypeFact,
  type CsharpUsingFact,
  type SourceRange,
  type SymbolNode,
  type EdgeEvidence
} from "../../domain/index.js";
import {
  type ExtractedFileFacts
} from "../../extraction/index.js";

type ReferenceEvidenceFactory = (
  ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[],
  configurationPaths?: readonly string[], resolutionPath?: readonly string[]
) => EdgeEvidence;

interface ResolvedCsharpType {
  readonly fact: CsharpTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedCsharpCallable {
  readonly fact: CsharpCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects C# facts through literal using/namespace evidence without Roslyn, NuGet, or assembly loading. */
export function projectCsharpRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedCsharpType[] = [];
  const callables: ResolvedCsharpCallable[] = [];
  const usings: CsharpUsingFact[] = [];
  const calls: CsharpCallFact[] = [];
  const instantiations: CsharpInstantiationFact[] = [];
  const heritage: CsharpHeritageFact[] = [];
  const overrides: CsharpOverrideFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const csharpFacts = facts.csharpFacts;
    if (csharpFacts === undefined) continue;
    for (const fact of csharpFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of csharpFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    usings.push(...csharpFacts.usings);
    calls.push(...csharpFacts.calls);
    instantiations.push(...csharpFacts.instantiations);
    heritage.push(...csharpFacts.heritage ?? []);
    overrides.push(...csharpFacts.overrides ?? []);
  }
  const typesByName = new Map<string, ResolvedCsharpType[]>();
  const typesByPath = new Map<string, ResolvedCsharpType[]>();
  for (const entry of types) {
    const byName = typesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    typesByName.set(entry.fact.name, byName);
    const byPath = typesByPath.get(entry.fact.qualifiedTypePath) ?? [];
    byPath.push(entry);
    typesByPath.set(entry.fact.qualifiedTypePath, byPath);
  }
  const callablesByName = new Map<string, ResolvedCsharpCallable[]>();
  for (const entry of callables) {
    const byName = callablesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    callablesByName.set(entry.fact.name, byName);
  }
  const usingByFile = new Map<string, CsharpUsingFact[]>();
  for (const fact of usings) {
    const values = usingByFile.get(fact.filePath) ?? [];
    values.push(fact);
    usingByFile.set(fact.filePath, values);
  }
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); }
  };
  const visibleFrom = (filePath: string, candidate: { readonly fact: { readonly isExported: boolean }; readonly symbol: SymbolNode }): boolean => candidate.symbol.filePath === filePath || candidate.fact.isExported;
  const exactArity = (fact: CsharpCallableFact, count: number): boolean => fact.parameterCount === count && fact.requiredParameterCount === count;
  const resolveType = (filePath: string, name: string): readonly ResolvedCsharpType[] => {
    const direct = (typesByPath.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath);
    const local = (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath);
    const importedNamespaces = (usingByFile.get(filePath) ?? []).filter((fact) => !fact.isAlias && !fact.isStatic).map((fact) => fact.importedPath);
    const imported = (typesByName.get(name) ?? []).filter((candidate) => importedNamespaces.includes(candidate.fact.namespaceName) && candidate.fact.isExported);
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
  for (const imported of usings.filter((fact) => !fact.isAlias && !fact.isStatic)) {
    const source = fileSymbols.get(imported.filePath);
    const targetFiles = [...new Set(types.filter((candidate) => candidate.fact.namespaceName === imported.importedPath && candidate.symbol.filePath !== imported.filePath && candidate.fact.isExported).map((candidate) => candidate.symbol.filePath))];
    const target = targetFiles.length === 1 ? fileSymbols.get(targetFiles[0]!) : undefined;
    if (source === undefined || target === undefined) continue;
    push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: imported.filePath, referenceName: imported.importedPath, range: imported.range, ruleId: "module.csharp.explicit-using.unique-file", targetFilePath: target.filePath }));
  }
  for (const callable of callables) {
    const parameterNames = callable.fact.parameterTypeNames ?? [];
    if (parameterNames.length === callable.fact.parameterCount) {
      for (const name of [...new Set(parameterNames)]) {
        const candidates = resolveType(callable.symbol.filePath, name).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
        if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: name, range: callable.fact.range, ruleId: "syntax.csharp.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
      }
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = resolveType(callable.symbol.filePath, callable.fact.returnTypeName).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.csharp.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): SymbolNode | undefined => {
    const source = input.symbolsById.get(sourceId);
    return source?.filePath === filePath && (source.kind === "function" || source.kind === "method") ? source : undefined;
  };
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    if (call.callKind === "direct") {
      const namespaces = (usingByFile.get(call.filePath) ?? []).filter((fact) => !fact.isAlias && !fact.isStatic).map((fact) => fact.importedPath);
      const sourceOwnerName = source.qualifiedName.split("#").at(-1)?.split(".").slice(0, -1).at(-1) ?? null;
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) =>
        exactArity(candidate.fact, call.argumentCount) &&
        visibleFrom(call.filePath, candidate) &&
        (candidate.fact.callableKind === "function" && (candidate.symbol.filePath === call.filePath || namespaces.includes(candidate.fact.namespaceName)) ||
          candidate.fact.callableKind === "method" && candidate.symbol.filePath === call.filePath && candidate.fact.isStatic && candidate.fact.ownerTypeName === sourceOwnerName)
      );
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.csharp.unique-direct-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.receiverTypeName === undefined) continue;
    const receiverCandidates = resolveType(call.filePath, call.receiverTypeName);
    if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) continue;
    const receiver = receiverCandidates[0];
    if (!visibleFrom(call.filePath, receiver) || receiver.fact.declarationKind === "interface" || receiver.fact.declarationKind === "enum" || receiver.fact.declarationKind === "delegate" || receiver.fact.declarationKind === "namespace") continue;
    const members = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate) && candidate.fact.ownerTypeId === receiver.symbol.id && (call.receiverIsType === true ? candidate.fact.isStatic : !candidate.fact.isStatic));
    if (members.length === 1 && members[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: members[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.csharp.unique-member-call", targetFilePath: members[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = resolveType(instantiation.filePath, instantiation.typeName).filter((candidate) => ["class", "record", "struct"].includes(candidate.fact.declarationKind) && visibleFrom(instantiation.filePath, candidate));
    if (candidates.length !== 1 || candidates[0] === undefined) continue;
    const constructors = callables.filter((candidate) => candidate.fact.callableKind === "constructor" && candidate.fact.ownerTypeId === candidates[0]!.symbol.id && exactArity(candidate.fact, instantiation.argumentCount) && visibleFrom(instantiation.filePath, candidate));
    if (constructors.length === 1) push(edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.csharp.unique-constructor-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  const heritageEdges: GraphEdge[] = [];
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) continue;
    const candidates = resolveType(reference.filePath, reference.referenceName);
    if (candidates.length !== 1 || candidates[0] === undefined || !visibleFrom(reference.filePath, candidates[0])) continue;
    const kind: GraphEdge["kind"] = candidates[0].fact.declarationKind === "interface" ? "implements" : "extends";
    const edge = edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind, filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: kind === "implements" ? "syntax.csharp.unique-interface-target" : "syntax.csharp.unique-extends-target", targetFilePath: candidates[0].symbol.filePath });
    heritageEdges.push(edge);
    push(edge);
  }
  for (const override of overrides) {
    const source = input.symbolsById.get(override.sourceId);
    const owner = types.find((candidate) => candidate.symbol.filePath === override.filePath && candidate.fact.name === override.ownerTypeName);
    const sourceFact = callables.find((candidate) => candidate.symbol.id === override.sourceId);
    if (source?.filePath !== override.filePath || owner === undefined || sourceFact === undefined) continue;
    const parents = heritageEdges.filter((edge) => edge.sourceId === owner.symbol.id && edge.targetId !== null);
    const parentMethods = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.name === override.methodName && exactArity(candidate.fact, sourceFact.fact.parameterCount) && parents.some((parent) => parent.targetId === candidate.fact.ownerTypeId));
    if (parentMethods.length === 1 && parentMethods[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: parentMethods[0].symbol.id, kind: "overrides", filePath: override.filePath, referenceName: override.methodName, range: override.range, ruleId: "syntax.csharp.explicit-direct-base-method", targetFilePath: parentMethods[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
