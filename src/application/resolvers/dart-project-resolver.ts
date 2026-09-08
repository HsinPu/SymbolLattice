import {
  compareStableText,
  createEdgeId,
  type GraphEdge,
  type DartCallFact,
  type DartCallableFact,
  type DartHeritageFact,
  type DartImportFact,
  type DartInstantiationFact,
  type DartOverrideFact,
  type DartTypeFact,
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

interface ResolvedDartType {
  readonly fact: DartTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedDartCallable {
  readonly fact: DartCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects only literal, project-local Dart facts; package solving and analyzer semantics remain out. */
export function projectDartRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedDartType[] = [];
  const callables: ResolvedDartCallable[] = [];
  const imports: DartImportFact[] = [];
  const calls: DartCallFact[] = [];
  const instantiations: DartInstantiationFact[] = [];
  const heritage: DartHeritageFact[] = [];
  const overrides: DartOverrideFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const dartFacts = facts.dartFacts;
    if (dartFacts === undefined) continue;
    for (const fact of dartFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of dartFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...dartFacts.imports);
    calls.push(...dartFacts.calls);
    instantiations.push(...dartFacts.instantiations);
    heritage.push(...dartFacts.heritage ?? []);
    overrides.push(...dartFacts.overrides ?? []);
  }
  const typesByName = new Map<string, ResolvedDartType[]>();
  const callablesByName = new Map<string, ResolvedDartCallable[]>();
  for (const entry of types) {
    const values = typesByName.get(entry.fact.name) ?? [];
    values.push(entry);
    typesByName.set(entry.fact.name, values);
  }
  for (const entry of callables) {
    const values = callablesByName.get(entry.fact.name) ?? [];
    values.push(entry);
    callablesByName.set(entry.fact.name, values);
  }
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };
  const normalizedDartPath = (fromFilePath: string, importedPath: string): string | null => {
    const rawPath = importedPath.startsWith("package:")
      ? importedPath.slice(importedPath.indexOf(":") + 1)
      : !importedPath.startsWith("/") && !importedPath.includes(":")
        ? `${fromFilePath.slice(0, Math.max(0, fromFilePath.lastIndexOf("/")) + 1)}${importedPath}`
        : null;
    if (rawPath === null) return null;
    const parts: string[] = [];
    for (const part of rawPath.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        if (parts.length === 0) return null;
        parts.pop();
      } else parts.push(part);
    }
    const candidate = parts.join("/");
    const candidates = importedPath.startsWith("package:") && !candidate.startsWith("lib/")
      ? [candidate, `lib/${candidate}`]
      : [candidate];
    const matches = candidates.filter((value) => input.knownFilePaths.has(value));
    return matches.length === 1 ? matches[0]! : null;
  };
  const importTargetsByFile = new Map<string, string[]>();
  for (const imported of imports) {
    if (imported.isAliased || imported.hasShowHide) continue;
    const target = normalizedDartPath(imported.filePath, imported.importedPath);
    if (target === null) continue;
    const values = importTargetsByFile.get(imported.filePath) ?? [];
    if (!values.includes(target)) values.push(target);
    importTargetsByFile.set(imported.filePath, values);
    const source = fileSymbols.get(imported.filePath);
    const targetFile = fileSymbols.get(target);
    if (source === undefined || targetFile === undefined) continue;
    const kind = imported.relationKind;
    push({
      id: createEdgeId({ sourceId: source.id, targetId: targetFile.id, kind, line: imported.range.start.line, column: imported.range.start.column, referenceName: imported.importedPath }),
      sourceId: source.id,
      targetId: targetFile.id,
      kind,
      filePath: imported.filePath,
      range: imported.range,
      resolution: "exact",
      confidence: 1,
      referenceName: imported.importedPath,
      evidence: referenceEvidence(
        `module.dart.explicit-${kind === "imports" ? "import" : "export"}.unique-file`,
        "module",
        [targetFile.id],
        [],
        [imported.filePath, target]
      )
    });
  }
  const resolveType = (filePath: string, name: string): readonly ResolvedDartType[] => {
    const local = (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath);
    const importedFiles = importTargetsByFile.get(filePath) ?? [];
    const imported = (typesByName.get(name) ?? []).filter((candidate) => importedFiles.includes(candidate.symbol.filePath) && candidate.fact.isExported);
    const merged = [...local, ...imported];
    return [...new Map(merged.map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const visibleFrom = (filePath: string, candidate: { readonly fact: { readonly isExported: boolean }; readonly symbol: SymbolNode }): boolean => candidate.symbol.filePath === filePath || candidate.fact.isExported;
  const exactArity = (fact: DartCallableFact, argumentCount: number): boolean => fact.parameterCount === argumentCount && fact.requiredParameterCount === argumentCount;
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
  for (const callable of callables) {
    const names = callable.fact.parameterTypeNames ?? [];
    if (names.length === callable.fact.parameterCount) {
      for (const name of [...new Set(names)]) {
        const candidates = resolveType(callable.symbol.filePath, name).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
        if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: name, range: callable.fact.range, ruleId: "syntax.dart.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
      }
    }
    const returnName = callable.fact.returnTypeName;
    if (returnName !== undefined) {
      const candidates = resolveType(callable.symbol.filePath, returnName).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: returnName, range: callable.fact.range, ruleId: "syntax.dart.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
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
      const importedFiles = importTargetsByFile.get(call.filePath) ?? [];
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "function" && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate) && (candidate.symbol.filePath === call.filePath || importedFiles.includes(candidate.symbol.filePath)));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.dart.unique-direct-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.receiverTypeName === undefined) continue;
    const receiverCandidates = resolveType(call.filePath, call.receiverTypeName);
    if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) continue;
    const receiver = receiverCandidates[0];
    if (!visibleFrom(call.filePath, receiver) || receiver.fact.isAbstract === true || receiver.fact.declarationKind === "mixin" || receiver.fact.declarationKind === "enum" || receiver.fact.declarationKind === "typedef" || receiver.fact.declarationKind === "extension") continue;
    const members = callables.filter((candidate) => candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate) && ((candidate.fact.callableKind === "method" && candidate.fact.ownerTypeId === receiver.symbol.id) || (candidate.fact.callableKind === "extension" && candidate.fact.receiverTypeName === receiver.fact.name)));
    if (members.length === 1 && members[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: members[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: members[0].fact.callableKind === "extension" ? "syntax.dart.unique-extension-member-call" : "syntax.dart.unique-member-call", targetFilePath: members[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = resolveType(instantiation.filePath, instantiation.typeName).filter((candidate) => candidate.fact.declarationKind === "class" && visibleFrom(instantiation.filePath, candidate));
    if (candidates.length !== 1 || candidates[0] === undefined) continue;
    const initializers = callables.filter((candidate) => candidate.fact.callableKind === "constructor" && candidate.fact.ownerTypeId === candidates[0]!.symbol.id && exactArity(candidate.fact, instantiation.argumentCount) && visibleFrom(instantiation.filePath, candidate));
    if (initializers.length !== 1) continue;
    push(edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.dart.unique-constructor-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  const heritageEdges: GraphEdge[] = [];
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) continue;
    const candidates = resolveType(reference.filePath, reference.referenceName);
    if (candidates.length !== 1 || candidates[0] === undefined || !visibleFrom(reference.filePath, candidates[0])) continue;
    const target = candidates[0];
    const kind: GraphEdge["kind"] = reference.relationKind === "extends" ? "extends" : "implements";
    const edge = edgeFor({ sourceId: source.id, targetId: target.symbol.id, kind, filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: reference.relationKind === "with" ? "syntax.dart.unique-mixin-target" : reference.relationKind === "implements" ? "syntax.dart.unique-interface-target" : "syntax.dart.unique-extends-target", targetFilePath: target.symbol.filePath });
    heritageEdges.push(edge);
    push(edge);
  }
  for (const override of overrides) {
    const source = input.symbolsById.get(override.sourceId);
    if (source?.filePath !== override.filePath) continue;
    const owner = types.find((candidate) => candidate.symbol.filePath === override.filePath && candidate.fact.name === override.ownerTypeName);
    const sourceCallableFact = callables.find((candidate) => candidate.symbol.id === source.id);
    if (owner === undefined || sourceCallableFact === undefined) continue;
    const parents = heritageEdges.filter((edge) => edge.sourceId === owner.symbol.id && edge.targetId !== null);
    const parentMethods = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.name === override.methodName && exactArity(candidate.fact, sourceCallableFact.fact.parameterCount) && parents.some((parent) => parent.targetId === candidate.fact.ownerTypeId));
    if (parentMethods.length !== 1 || parentMethods[0] === undefined) continue;
    push(edgeFor({ sourceId: source.id, targetId: parentMethods[0].symbol.id, kind: "overrides", filePath: override.filePath, referenceName: override.methodName, range: override.range, ruleId: "syntax.dart.explicit-direct-base-method", targetFilePath: parentMethods[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
