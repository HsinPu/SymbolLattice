import { compareStableText, createEdgeId, type GraphEdge, type NimCallFact, type NimCallableFact, type NimHeritageFact, type NimImportFact, type NimInstantiationFact, type NimTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedNimType {
  readonly fact: NimTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedNimCallable {
  readonly fact: NimCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Nim syntax facts through unique local/imported modules and fixed arity. */
export function projectNimRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly knownFilePaths: ReadonlySet<string>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedNimType[] = [];
  const callables: ResolvedNimCallable[] = [];
  const imports: NimImportFact[] = [];
  const calls: NimCallFact[] = [];
  const instantiations: NimInstantiationFact[] = [];
  const heritage: NimHeritageFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const nimFacts = facts.nimFacts;
    if (nimFacts === undefined || nimFacts.parserRejected === true) continue;
    for (const fact of nimFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of nimFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...nimFacts.imports);
    calls.push(...nimFacts.calls);
    instantiations.push(...nimFacts.instantiations);
    heritage.push(...nimFacts.heritage ?? []);
  }
  const typesByName = new Map<string, ResolvedNimType[]>();
  for (const entry of types) typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
  const callablesByKey = new Map<string, ResolvedNimCallable[]>();
  for (const entry of callables) {
    const key = `${entry.fact.moduleName}\u0000${entry.fact.name}\u0000${entry.fact.parameterCount}`;
    callablesByKey.set(key, [...(callablesByKey.get(key) ?? []), entry]);
  }
  const importsByFile = new Map<string, NimImportFact[]>();
  for (const imported of imports) importsByFile.set(imported.filePath, [...(importsByFile.get(imported.filePath) ?? []), imported]);
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  const importTarget = (imported: NimImportFact): string | undefined => {
    const normalized = imported.importedModule.replaceAll("\\", "/").replace(/^\.\//u, "");
    const sourceDirectory = imported.filePath.includes("/") ? imported.filePath.slice(0, imported.filePath.lastIndexOf("/") + 1) : "";
    const candidates = [...input.knownFilePaths].filter((filePath) => filePath === `${sourceDirectory}${normalized}.nim` || filePath === `${sourceDirectory}${normalized}.nims` || filePath === `${sourceDirectory}${normalized}/index.nim`);
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    const targetPath = importTarget(imported);
    const target = targetPath === undefined ? undefined : fileSymbols.get(targetPath);
    if (source !== undefined && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: imported.filePath, referenceName: imported.importedModule, range: imported.range, ruleId: "module.nim.literal-import.unique-file", targetFilePath: target.filePath }));
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedNimCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = [...new Map((typesByName.get(typeName) ?? []).filter((candidate) => candidate.fact.declarationKind !== "alias" && (candidate.symbol.filePath === callable.symbol.filePath || candidate.fact.isExported)).map((candidate) => [candidate.symbol.id, candidate])).values()];
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.nim.unique-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = [...new Map((typesByName.get(callable.fact.returnTypeName) ?? []).filter((candidate) => candidate.fact.declarationKind !== "alias" && (candidate.symbol.filePath === callable.symbol.filePath || candidate.fact.isExported)).map((candidate) => [candidate.symbol.id, candidate])).values()];
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.nim.unique-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    let moduleNames: string[] = [];
    if (call.callKind === "direct") moduleNames = [source.fact.moduleName];
    else if (call.receiverModuleName !== undefined) {
      const matchingImports = (importsByFile.get(call.filePath) ?? []).filter((imported) => (imported.localName ?? imported.importedModule.split("/").at(-1)) === call.receiverModuleName);
      if (matchingImports.length === 1) moduleNames = [matchingImports[0]!.importedModule.split("/").at(-1) ?? matchingImports[0]!.importedModule];
    }
    const candidates: ResolvedNimCallable[] = [];
    for (const moduleName of moduleNames) {
      for (const candidate of callablesByKey.get(`${moduleName}\u0000${call.referenceName}\u0000${call.argumentCount}`) ?? []) {
        if (call.callKind === "module" && !candidate.fact.isExported) continue;
        if (call.callKind === "module") {
          const matchingImports = (importsByFile.get(call.filePath) ?? []).filter((imported) => (imported.localName ?? imported.importedModule.split("/").at(-1)) === call.receiverModuleName && importTarget(imported) === candidate.symbol.filePath);
          if (matchingImports.length !== 1) continue;
        }
        if (!candidates.some((existing) => existing.symbol.id === candidate.symbol.id)) candidates.push(candidate);
      }
    }
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.callKind === "module" && call.receiverModuleName !== undefined ? `${call.receiverModuleName}.${call.referenceName}` : call.referenceName, range: call.range, ruleId: call.callKind === "module" ? "module.nim.unique-qualified-call" : "syntax.nim.unique-local-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = [...new Map((typesByName.get(instantiation.typeName) ?? []).filter((candidate) => candidate.fact.declarationKind !== "alias" && (candidate.symbol.filePath === source.symbol.filePath || candidate.fact.isExported)).map((candidate) => [candidate.symbol.id, candidate])).values()];
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.nim.unique-type-construction", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const reference of heritage) {
    const sources = (typesByName.get(reference.sourceTypeName) ?? []).filter((candidate) => candidate.fact.declarationKind === "object");
    const targets = (typesByName.get(reference.referenceName) ?? []).filter((candidate) => candidate.fact.declarationKind === "object");
    if (sources.length === 1 && targets.length === 1 && sources[0] !== undefined && targets[0] !== undefined) push(edgeFor({ sourceId: sources[0].symbol.id, targetId: targets[0].symbol.id, kind: "extends", filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: "syntax.nim.unique-object-heritage", targetFilePath: targets[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
