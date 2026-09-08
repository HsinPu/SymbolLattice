import { compareStableText, createEdgeId, type GraphEdge, type ElixirAliasFact, type ElixirCallFact, type ElixirCallableFact, type ElixirHeritageFact, type ElixirImportFact, type ElixirInstantiationFact, type ElixirTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedElixirType {
  readonly fact: ElixirTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedElixirCallable {
  readonly fact: ElixirCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Elixir facts through explicit aliases/imports and simple specs without BEAM inference. */
export function projectElixirRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedElixirType[] = [];
  const callables: ResolvedElixirCallable[] = [];
  const aliases: ElixirAliasFact[] = [];
  const imports: ElixirImportFact[] = [];
  const calls: ElixirCallFact[] = [];
  const instantiations: ElixirInstantiationFact[] = [];
  const heritage: ElixirHeritageFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const elixirFacts = facts.elixirFacts;
    if (elixirFacts === undefined) continue;
    for (const fact of elixirFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of elixirFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    aliases.push(...elixirFacts.aliases);
    imports.push(...elixirFacts.imports);
    calls.push(...elixirFacts.calls);
    instantiations.push(...elixirFacts.instantiations);
    heritage.push(...elixirFacts.heritage ?? []);
  }
  const typesByName = new Map<string, ResolvedElixirType[]>();
  const typesByPath = new Map<string, ResolvedElixirType[]>();
  const callablesByName = new Map<string, ResolvedElixirCallable[]>();
  for (const entry of types) {
    typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
    typesByPath.set(entry.fact.qualifiedTypePath, [...(typesByPath.get(entry.fact.qualifiedTypePath) ?? []), entry]);
  }
  for (const entry of callables) callablesByName.set(entry.fact.name, [...(callablesByName.get(entry.fact.name) ?? []), entry]);
  const aliasesByFile = new Map<string, ElixirAliasFact[]>();
  for (const alias of aliases) aliasesByFile.set(alias.filePath, [...(aliasesByFile.get(alias.filePath) ?? []), alias]);
  const aliasTargets = (filePath: string, localName: string): readonly string[] => [...new Set((aliasesByFile.get(filePath) ?? []).filter((alias) => alias.localName === localName).map((alias) => alias.importedModule))];
  const moduleAlias = (filePath: string, localName: string): string | undefined => {
    const targets = aliasTargets(filePath, localName);
    return targets.length === 1 ? targets[0] : undefined;
  };
  const ambiguousAlias = (filePath: string, localName: string): boolean => aliasTargets(filePath, localName).length > 1;
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const exactArity = (fact: ElixirCallableFact, count: number): boolean => fact.parameterCount === count && fact.requiredParameterCount === count;
  const moduleCandidates = (moduleName: string): readonly ResolvedElixirType[] => [...new Map((typesByName.get(moduleName) ?? []).filter((candidate) => candidate.fact.declarationKind === "module" || candidate.fact.declarationKind === "protocol").map((candidate) => [candidate.symbol.id, candidate])).values()];
  const typeCandidates = (filePath: string, name: string): readonly ResolvedElixirType[] => {
    if (ambiguousAlias(filePath, name)) return [];
    const aliasTarget = moduleAlias(filePath, name);
    const direct = typesByPath.get(name) ?? [];
    const aliased = aliasTarget === undefined ? [] : typesByPath.get(aliasTarget) ?? moduleCandidates(aliasTarget);
    const local = (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath || candidate.fact.moduleName === name);
    return [...new Map([...direct, ...aliased, ...local].map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const visibleType = (filePath: string, candidate: ResolvedElixirType): boolean => candidate.symbol.filePath === filePath || candidate.fact.isExported;
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  for (const alias of aliases) {
    if (ambiguousAlias(alias.filePath, alias.localName)) continue;
    const source = fileSymbols.get(alias.filePath);
    const targets = moduleCandidates(alias.importedModule);
    const targetFiles = [...new Set(targets.filter((candidate) => candidate.symbol.filePath !== alias.filePath).map((candidate) => candidate.symbol.filePath))];
    const target = targetFiles.length === 1 ? fileSymbols.get(targetFiles[0]!) : undefined;
    if (source !== undefined && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: alias.filePath, referenceName: alias.importedModule, range: alias.range, ruleId: "module.elixir.explicit-alias.unique-module", targetFilePath: target.filePath }));
  }
  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    const targets = moduleCandidates(imported.importedModule);
    const targetFiles = [...new Set(targets.filter((candidate) => candidate.symbol.filePath !== imported.filePath).map((candidate) => candidate.symbol.filePath))];
    const target = targetFiles.length === 1 ? fileSymbols.get(targetFiles[0]!) : undefined;
    if (source !== undefined && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: imported.filePath, referenceName: imported.importedModule, range: imported.range, ruleId: "module.elixir.explicit-import.unique-module", targetFilePath: target.filePath }));
  }
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = typeCandidates(callable.symbol.filePath, typeName).filter((candidate) => candidate.fact.declarationKind !== "module" && candidate.fact.declarationKind !== "protocol" && visibleType(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.elixir.unique-spec-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = typeCandidates(callable.symbol.filePath, callable.fact.returnTypeName).filter((candidate) => candidate.fact.declarationKind !== "module" && candidate.fact.declarationKind !== "protocol" && visibleType(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.elixir.unique-spec-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedElixirCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    if (call.callKind === "direct") {
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "function" && candidate.fact.moduleName === source.fact.moduleName && exactArity(candidate.fact, call.argumentCount));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.elixir.unique-same-module-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    const receiver = call.receiverModuleName ?? "";
    if (ambiguousAlias(call.filePath, receiver)) continue;
    const targetModuleName = moduleAlias(call.filePath, receiver) ?? receiver;
    const moduleTargets = moduleCandidates(targetModuleName);
    const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "function" && candidate.fact.moduleName === targetModuleName && exactArity(candidate.fact, call.argumentCount) && candidate.fact.isExported && moduleTargets.some((module) => module.symbol.filePath === candidate.symbol.filePath));
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "module.elixir.unique-qualified-function-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = typeCandidates(instantiation.filePath, instantiation.typeName).filter((candidate) => candidate.fact.declarationKind === "struct" && visibleType(instantiation.filePath, candidate));
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.elixir.unique-struct-creation", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const reference of heritage) {
    const rawSource = input.symbolsById.get(reference.sourceId);
    const rawFileCandidates = rawSource?.kind === "file" ? (typesByName.get(reference.sourceTypeName) ?? []) : [];
    // A defimpl source is deliberately recorded against the file because the
    // implementation module is not necessarily declared in the same lexical
    // module frame. Prefer one explicit struct declaration when present; a
    // module declaration alone remains a valid bounded fallback. Never guess
    // when both a module and a struct are equally plausible.
    const structCandidates = rawFileCandidates.filter((candidate) => candidate.fact.declarationKind === "struct");
    const moduleCandidatesForFile = rawFileCandidates.filter((candidate) => candidate.fact.declarationKind === "module");
    const sourceCandidates = rawSource?.kind === "file"
      ? structCandidates.length === 1
        ? structCandidates
        : moduleCandidatesForFile.length === 1
          ? moduleCandidatesForFile
          : []
      : rawSource === undefined
        ? []
        : types.filter((candidate) => candidate.symbol.id === rawSource.id);
    const targetCandidates = typesByName.get(reference.referenceName) ?? [];
    const sources = [...new Map(sourceCandidates.filter((candidate) => candidate.fact.declarationKind === "module" || candidate.fact.declarationKind === "struct").map((candidate) => [candidate.symbol.id, candidate])).values()];
    const targets = [...new Map(targetCandidates.filter((candidate) => candidate.fact.declarationKind === "protocol" || candidate.fact.declarationKind === "behaviour").map((candidate) => [candidate.symbol.id, candidate])).values()];
    if (sources.length === 1 && targets.length === 1 && sources[0] !== undefined && targets[0] !== undefined) push(edgeFor({ sourceId: sources[0].symbol.id, targetId: targets[0].symbol.id, kind: "implements", filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: "syntax.elixir.unique-behaviour-or-protocol-implementation", targetFilePath: targets[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
