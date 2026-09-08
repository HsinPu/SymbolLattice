import { compareStableText, createEdgeId, type GraphEdge, type ErlangCallFact, type ErlangCallableFact, type ErlangHeritageFact, type ErlangImportFact, type ErlangInstantiationFact, type ErlangTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedErlangType {
  readonly fact: ErlangTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedErlangCallable {
  readonly fact: ErlangCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Erlang facts through explicit imports and simple BEAM-neutral syntax proof. */
export function projectErlangRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedErlangType[] = [];
  const callables: ResolvedErlangCallable[] = [];
  const imports: ErlangImportFact[] = [];
  const calls: ErlangCallFact[] = [];
  const instantiations: ErlangInstantiationFact[] = [];
  const heritage: ErlangHeritageFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const erlangFacts = facts.erlangFacts;
    if (erlangFacts === undefined) continue;
    for (const fact of erlangFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of erlangFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === `${fact.name}/${fact.arity}`) callables.push({ fact, symbol });
    }
    imports.push(...erlangFacts.imports);
    calls.push(...erlangFacts.calls);
    instantiations.push(...erlangFacts.instantiations);
    heritage.push(...erlangFacts.heritage ?? []);
  }
  const typesByName = new Map<string, ResolvedErlangType[]>();
  const callablesByKey = new Map<string, ResolvedErlangCallable[]>();
  for (const entry of types) typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
  for (const entry of callables) {
    const key = `${entry.fact.moduleName}\u0000${entry.fact.name}\u0000${entry.fact.arity}`;
    callablesByKey.set(key, [...(callablesByKey.get(key) ?? []), entry]);
  }
  const importsByFile = new Map<string, ErlangImportFact[]>();
  for (const imported of imports) importsByFile.set(imported.filePath, [...(importsByFile.get(imported.filePath) ?? []), imported]);
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const moduleCandidates = (name: string): readonly ResolvedErlangType[] => [...new Map((typesByName.get(name) ?? []).filter((candidate) => candidate.fact.declarationKind === "module").map((candidate) => [candidate.symbol.id, candidate])).values()];
  const typeCandidates = (filePath: string, name: string): readonly ResolvedErlangType[] => [...new Map((typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath || candidate.fact.isExported).map((candidate) => [candidate.symbol.id, candidate])).values()];
  const specTypeCandidates = (filePath: string, name: string): readonly ResolvedErlangType[] => {
    const candidates = typeCandidates(filePath, name).filter((candidate) => candidate.fact.declarationKind !== "module" && candidate.fact.declarationKind !== "behaviour");
    return candidates.filter((candidate) => candidate.fact.declarationKind === "type" || candidate.fact.declarationKind === "opaque");
  };
  const sourceCallable = (sourceId: string, filePath: string): ResolvedErlangCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    if (source === undefined) continue;
    if (imported.importKind === "module") {
      const targets = moduleCandidates(imported.importedModule);
      const targetFiles = [...new Set(targets.filter((candidate) => candidate.symbol.filePath !== imported.filePath).map((candidate) => candidate.symbol.filePath))];
      const target = targetFiles.length === 1 ? fileSymbols.get(targetFiles[0]!) : undefined;
      if (target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: imported.filePath, referenceName: imported.importedModule, range: imported.range, ruleId: "module.erlang.explicit-import.unique-module", targetFilePath: target.filePath }));
    } else if (imported.includePath !== undefined) {
      const normalized = imported.includePath.replaceAll("\\", "/").replace(/^\.\//u, "");
      const sourceDirectory = imported.filePath.includes("/") ? imported.filePath.slice(0, imported.filePath.lastIndexOf("/") + 1) : "";
      const target = fileSymbols.get(`${sourceDirectory}${normalized}`.replace(/\/\.\//gu, "/"));
      if (target !== undefined && target.filePath !== imported.filePath) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: imported.filePath, referenceName: imported.includePath, range: imported.range, ruleId: "module.erlang.explicit-include.unique-file", targetFilePath: target.filePath }));
    }
  }
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = specTypeCandidates(callable.symbol.filePath, typeName);
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.erlang.unique-spec-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = specTypeCandidates(callable.symbol.filePath, callable.fact.returnTypeName);
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.erlang.unique-spec-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const importedModulesFor = (filePath: string, referenceName: string): readonly string[] => [...new Set((importsByFile.get(filePath) ?? []).filter((imported) => imported.importKind === "module" && (imported.importedNames ?? []).includes(referenceName)).map((imported) => imported.importedModule))];
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    const parts = call.referenceName.split("/");
    const targetName = parts[0] ?? call.referenceName;
    const moduleNames = call.callKind === "module" ? (call.receiverModuleName === undefined ? [] : [call.receiverModuleName]) : [source.fact.moduleName, ...importedModulesFor(call.filePath, call.referenceName)];
    const candidates: ResolvedErlangCallable[] = [];
    for (const moduleName of moduleNames) {
      const moduleTargets = moduleCandidates(moduleName);
      const functions = callablesByKey.get(`${moduleName}\u0000${targetName}\u0000${call.argumentCount}`) ?? [];
      for (const candidate of functions) {
        if (candidate.fact.callableKind !== "function" || candidate.fact.arity !== call.argumentCount) continue;
        if (call.callKind === "module" && (!candidate.fact.isExported || moduleTargets.length !== 1 || moduleTargets[0]?.symbol.filePath !== candidate.symbol.filePath)) continue;
        if (!candidates.some((existing) => existing.symbol.id === candidate.symbol.id)) candidates.push(candidate);
      }
    }
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: call.callKind === "module" ? "module.erlang.unique-qualified-function-call" : "syntax.erlang.unique-local-or-imported-function-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = typeCandidates(instantiation.filePath, instantiation.typeName).filter((candidate) => candidate.fact.declarationKind === "record");
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.erlang.unique-record-creation", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const reference of heritage) {
    const sources = [...new Map((typesByName.get(reference.sourceTypeName) ?? []).filter((candidate) => candidate.fact.declarationKind === "module").map((candidate) => [candidate.symbol.id, candidate])).values()];
    const targets = [...new Map((typesByName.get(reference.referenceName) ?? []).filter((candidate) => candidate.fact.declarationKind === "module" || candidate.fact.declarationKind === "behaviour").map((candidate) => [candidate.symbol.id, candidate])).values()];
    if (sources.length === 1 && targets.length === 1 && sources[0] !== undefined && targets[0] !== undefined) push(edgeFor({ sourceId: sources[0].symbol.id, targetId: targets[0].symbol.id, kind: "implements", filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: "syntax.erlang.unique-behaviour-implementation", targetFilePath: targets[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
