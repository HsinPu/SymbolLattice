import { compareStableText, createEdgeId, type GraphEdge, type PhpCallFact, type PhpCallableFact, type PhpHeritageFact, type PhpImportFact, type PhpInstantiationFact, type PhpTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedPhpType {
  readonly fact: PhpTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedPhpCallable {
  readonly fact: PhpCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects PHP use imports, unique class/function relations, and signatures. */
export function projectPhpRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedPhpType[] = [];
  const callables: ResolvedPhpCallable[] = [];
  const imports: PhpImportFact[] = [];
  const calls: PhpCallFact[] = [];
  const instantiations: PhpInstantiationFact[] = [];
  const heritage: PhpHeritageFact[] = [];
  const namespaceByFile = new Map<string, string>();
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const phpFacts = facts.phpFacts;
    if (phpFacts === undefined || phpFacts.parserRejected === true) continue;
    const namespaceName = phpFacts.namespaceName ?? "";
    namespaceByFile.set(filePath, namespaceName);
    for (const fact of phpFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of phpFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...phpFacts.imports);
    calls.push(...phpFacts.calls);
    instantiations.push(...phpFacts.instantiations);
    heritage.push(...phpFacts.heritage);
  }
  const importsByFile = new Map<string, PhpImportFact[]>();
  for (const imported of imports) importsByFile.set(imported.filePath, [...(importsByFile.get(imported.filePath) ?? []), imported]);
  const fileSymbols = new Map(
    [...input.symbolsById.values()]
      .filter((symbol) => symbol.kind === "file")
      .map((symbol) => [symbol.filePath, symbol])
  );
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
      evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : [])
    };
  };
  const normalizeName = (name: string): string => name.replace(/^\\+/u, "");
  const fullName = (namespaceName: string, name: string): string => namespaceName === "" ? name : `${namespaceName}\\${name}`;
  const typesByFullName = new Map<string, ResolvedPhpType[]>();
  for (const candidate of types) typesByFullName.set(fullName(candidate.fact.namespaceName, candidate.fact.name), [...(typesByFullName.get(fullName(candidate.fact.namespaceName, candidate.fact.name)) ?? []), candidate]);
  const callablesByFullName = new Map<string, ResolvedPhpCallable[]>();
  for (const candidate of callables.filter((entry) => entry.fact.ownerTypeName === undefined)) {
    callablesByFullName.set(fullName(candidate.fact.namespaceName, candidate.fact.name), [...(callablesByFullName.get(fullName(candidate.fact.namespaceName, candidate.fact.name)) ?? []), candidate]);
  }
  const importMatches = (filePath: string, localName: string, importKind: PhpImportFact["importKind"]): readonly PhpImportFact[] =>
    (importsByFile.get(filePath) ?? []).filter((imported) => imported.localName === localName && imported.importKind === importKind);
  const resolveType = (filePath: string, name: string): readonly ResolvedPhpType[] => {
    const normalized = normalizeName(name);
    const imported = importMatches(filePath, normalized, "class");
    if (imported.length > 0) {
      const exact = [...new Set(imported.map((item) => normalizeName(item.importedName)))].flatMap((item) => typesByFullName.get(item) ?? []);
      return [...new Map(exact.map((candidate) => [candidate.symbol.id, candidate])).values()];
    }
    const namespaceName = namespaceByFile.get(filePath) ?? "";
    const qualified = normalized.includes("\\") ? normalized : fullName(namespaceName, normalized);
    const exact = typesByFullName.get(qualified) ?? [];
    return [...new Map(exact.filter((candidate) => candidate.fact.isExported || candidate.symbol.filePath === filePath).map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const resolveFunction = (filePath: string, name: string): readonly ResolvedPhpCallable[] => {
    const normalized = normalizeName(name);
    const imported = importMatches(filePath, normalized, "function");
    if (imported.length > 0) {
      const exact = [...new Set(imported.map((item) => normalizeName(item.importedName)))].flatMap((item) => callablesByFullName.get(item) ?? []);
      return [...new Map(exact.map((candidate) => [candidate.symbol.id, candidate])).values()];
    }
    const namespaceName = namespaceByFile.get(filePath) ?? "";
    const qualified = normalized.includes("\\") ? normalized : fullName(namespaceName, normalized);
    const exact = callablesByFullName.get(qualified) ?? [];
    return [...new Map(exact.filter((candidate) => candidate.fact.isExported || candidate.symbol.filePath === filePath).map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    const candidates = imported.importKind === "class"
      ? typesByFullName.get(normalizeName(imported.importedName)) ?? []
      : imported.importKind === "function"
        ? callablesByFullName.get(normalizeName(imported.importedName)) ?? []
        : [];
    const targetPaths = [...new Set(candidates.map((candidate) => candidate.symbol.filePath))];
    if (source !== undefined && targetPaths.length === 1 && targetPaths[0] !== undefined && targetPaths[0] !== source.filePath) {
      const target = fileSymbols.get(targetPaths[0]);
      if (target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: imported.filePath, referenceName: imported.importedName, range: imported.range, ruleId: "module.php.explicit-use.unique-file", targetFilePath: target.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedPhpCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const callable of callables) {
    const sourceFacts = input.factsByFile.get(callable.symbol.filePath)?.phpFacts;
    if (sourceFacts?.parserRejected === true) continue;
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = resolveType(callable.symbol.filePath, typeName);
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.php.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = resolveType(callable.symbol.filePath, callable.fact.returnTypeName);
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.php.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  for (const relation of heritage) {
    const source = input.symbolsById.get(relation.sourceId);
    if (source === undefined) continue;
    const candidates = resolveType(relation.filePath, relation.targetTypeName);
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: "extends", filePath: relation.filePath, referenceName: relation.targetTypeName, range: relation.range, ruleId: "syntax.php.unique-extends", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    let candidates: readonly ResolvedPhpCallable[] = [];
    if (call.callKind === "direct") {
      candidates = resolveFunction(call.filePath, call.referenceName).filter((candidate) => candidate.fact.parameterCount === call.argumentCount && candidate.fact.variadic !== true);
    } else if (call.receiverTypeName !== undefined) {
      const owners = resolveType(call.filePath, call.receiverTypeName);
      const ownerFileNames = new Set(owners.map((owner) => `${owner.fact.namespaceName}\u0000${owner.fact.name}`));
      candidates = callables.filter((candidate) => candidate.fact.ownerTypeName !== undefined && ownerFileNames.has(`${candidate.fact.namespaceName}\u0000${candidate.fact.ownerTypeName}`) && candidate.fact.name === call.referenceName && candidate.fact.isStatic === true && candidate.fact.parameterCount === call.argumentCount && candidate.fact.variadic !== true);
    }
    if (candidates.length === 1 && candidates[0] !== undefined) {
      const target = candidates[0];
      push(edgeFor({ sourceId: source.symbol.id, targetId: target.symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.receiverTypeName === undefined ? call.referenceName : `${call.receiverTypeName}::${call.referenceName}`, range: call.range, ruleId: call.callKind === "static" ? "syntax.php.unique-static-call" : "syntax.php.unique-direct-function-call", targetFilePath: target.symbol.filePath }));
    }
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = resolveType(instantiation.filePath, instantiation.typeName).filter((candidate) => candidate.fact.declarationKind === "class");
    const compatible = candidates.filter((candidate) => {
      const constructors = callables.filter((entry) => entry.fact.ownerTypeName === candidate.fact.name && entry.fact.namespaceName === candidate.fact.namespaceName && entry.fact.name === "__construct");
      return constructors.length === 0 ? instantiation.argumentCount === 0 : constructors.length === 1 && constructors[0]?.fact.variadic !== true && constructors[0]?.fact.parameterCount === instantiation.argumentCount;
    });
    if (compatible.length === 1 && compatible[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: compatible[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.php.unique-class-instantiation", targetFilePath: compatible[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
