import {
  compareStableText,
  createEdgeId,
  type GraphEdge,
  type SwiftCallableFact,
  type SwiftCallFact,
  type SwiftHeritageFact,
  type SwiftImportFact,
  type SwiftInstantiationFact,
  type SwiftOverrideFact,
  type SwiftTypeFact,
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

interface ResolvedSwiftType {
  readonly fact: SwiftTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedSwiftCallable {
  readonly fact: SwiftCallableFact;
  readonly symbol: SymbolNode;
}

/**
 * Projects the v0.460 Swift relation slice without invoking swiftc, Xcode, or
 * an Objective-C/runtime model. Swift source has no package declaration, so
 * cross-file targets require an explicit import plus one unique exported
 * project-local declaration; same-file declarations may remain internal.
 */
export function projectSwiftRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedSwiftType[] = [];
  const callables: ResolvedSwiftCallable[] = [];
  const imports: SwiftImportFact[] = [];
  const calls: SwiftCallFact[] = [];
  const instantiations: SwiftInstantiationFact[] = [];
  const heritage: SwiftHeritageFact[] = [];
  const overrides: SwiftOverrideFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const swiftFacts = facts.swiftFacts;
    if (swiftFacts === undefined) {
      continue;
    }
    for (const fact of swiftFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) {
        types.push({ fact, symbol });
      }
    }
    for (const fact of swiftFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) {
        callables.push({ fact, symbol });
      }
    }
    imports.push(...swiftFacts.imports);
    calls.push(...swiftFacts.calls);
    instantiations.push(...swiftFacts.instantiations);
    heritage.push(...swiftFacts.heritage ?? []);
    overrides.push(...swiftFacts.overrides ?? []);
  }

  const typesByName = new Map<string, ResolvedSwiftType[]>();
  const typesByPath = new Map<string, ResolvedSwiftType[]>();
  const callablesByName = new Map<string, ResolvedSwiftCallable[]>();
  for (const entry of types) {
    const byName = typesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    typesByName.set(entry.fact.name, byName);
    const byPath = typesByPath.get(entry.fact.qualifiedTypePath) ?? [];
    byPath.push(entry);
    typesByPath.set(entry.fact.qualifiedTypePath, byPath);
  }
  for (const entry of callables) {
    const byName = callablesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    callablesByName.set(entry.fact.name, byName);
  }
  for (const entries of [...typesByName.values(), ...typesByPath.values(), ...callablesByName.values()]) {
    entries.sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
  }

  const importsByFileAndLocalName = new Map<string, SwiftImportFact[]>();
  for (const fact of imports) {
    const key = `${fact.filePath}\u0000${fact.localName}`;
    const entries = importsByFileAndLocalName.get(key) ?? [];
    entries.push(fact);
    importsByFileAndLocalName.set(key, entries);
  }
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
  const importedPathFor = (filePath: string, localName: string): string | null => {
    const entries = (importsByFileAndLocalName.get(`${filePath}\u0000${localName}`) ?? [])
      .filter((fact) => !fact.isAliased && !fact.isWildcard);
    return entries.length === 1 ? entries[0]?.importedPath ?? null : null;
  };
  const resolveType = (filePath: string, name: string): readonly ResolvedSwiftType[] => {
    const importedPath = importedPathFor(filePath, name);
    if (importedPath !== null) {
      const exactPath = typesByPath.get(importedPath) ?? [];
      if (exactPath.length > 0) {
        return exactPath;
      }
      const importedName = importedPath.split(".").at(-1) ?? name;
      return (typesByName.get(importedName) ?? []).filter((candidate) =>
        candidate.symbol.filePath === filePath || candidate.fact.isExported
      );
    }
    return (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath);
  };
  const visibleFrom = (filePath: string, candidate: { readonly fact: { readonly isExported: boolean }; readonly symbol: SymbolNode }): boolean =>
    candidate.symbol.filePath === filePath || candidate.fact.isExported;
  const exactArity = (fact: SwiftCallableFact, argumentCount: number): boolean =>
    fact.parameterCount === argumentCount && fact.requiredParameterCount === argumentCount;
  const edgeFor = (inputEdge: {
    readonly sourceId: string;
    readonly targetId: string;
    readonly kind: GraphEdge["kind"];
    readonly filePath: string;
    readonly referenceName: string;
    readonly range: SourceRange;
    readonly ruleId: string;
    readonly targetFilePath?: string;
  }): GraphEdge => {
    const crossFile = inputEdge.targetFilePath !== undefined && inputEdge.targetFilePath !== inputEdge.filePath;
    return {
      id: createEdgeId({
        sourceId: inputEdge.sourceId,
        targetId: inputEdge.targetId,
        kind: inputEdge.kind,
        line: inputEdge.range.start.line,
        column: inputEdge.range.start.column,
        referenceName: inputEdge.referenceName
      }),
      sourceId: inputEdge.sourceId,
      targetId: inputEdge.targetId,
      kind: inputEdge.kind,
      filePath: inputEdge.filePath,
      range: inputEdge.range,
      resolution: "exact",
      confidence: 1,
      referenceName: inputEdge.referenceName,
      evidence: referenceEvidence(
        inputEdge.ruleId,
        crossFile ? "module" : "syntax",
        [inputEdge.targetId],
        [],
        crossFile ? [inputEdge.filePath, inputEdge.targetFilePath!] : []
      )
    };
  };

  for (const imported of [...imports].sort((left, right) =>
    compareStableText(`${left.filePath}\u0000${left.range.start.line}\u0000${left.range.start.column}`, `${right.filePath}\u0000${right.range.start.line}\u0000${right.range.start.column}`)
  )) {
    if (imported.isAliased || imported.isWildcard) {
      continue;
    }
    const source = fileSymbols.get(imported.filePath);
    if (source?.id !== imported.sourceId) {
      continue;
    }
    const exactPath = typesByPath.get(imported.importedPath) ?? [];
    const typeCandidates = exactPath.length > 0
      ? exactPath
      : (typesByName.get(imported.importedName) ?? []);
    const callableCandidates = callablesByName.get(imported.importedName) ?? [];
    const candidates = [...typeCandidates, ...callableCandidates].filter((candidate) =>
      candidate.symbol.filePath !== imported.filePath && candidate.fact.isExported
    );
    if (candidates.length !== 1 || candidates[0] === undefined) {
      continue;
    }
    const target = candidates[0].symbol;
    push(edgeFor({
      sourceId: source.id,
      targetId: target.id,
      kind: "imports",
      filePath: imported.filePath,
      referenceName: imported.importedName,
      range: imported.range,
      ruleId: "module.swift.explicit-import.unique-target",
      targetFilePath: target.filePath
    }));
  }

  for (const callable of callables) {
    const parameterTypeNames = callable.fact.parameterTypeNames ?? [];
    if (parameterTypeNames.length === callable.fact.parameterCount) {
      for (const typeName of [...new Set(parameterTypeNames)]) {
        const candidates = resolveType(callable.symbol.filePath, typeName).filter((candidate) =>
          visibleFrom(callable.symbol.filePath, candidate)
        );
        if (candidates.length !== 1 || candidates[0] === undefined) {
          continue;
        }
        const target = candidates[0].symbol;
        push(edgeFor({
          sourceId: callable.symbol.id,
          targetId: target.id,
          kind: "accepts",
          filePath: callable.symbol.filePath,
          referenceName: typeName,
          range: callable.fact.range,
          ruleId: "syntax.swift.unique-signature-parameter-type",
          targetFilePath: target.filePath
        }));
      }
    }
    const returnTypeName = callable.fact.returnTypeName;
    if (returnTypeName !== undefined && returnTypeName !== null) {
      const candidates = resolveType(callable.symbol.filePath, returnTypeName).filter((candidate) =>
        visibleFrom(callable.symbol.filePath, candidate)
      );
      if (candidates.length === 1 && candidates[0] !== undefined) {
        const target = candidates[0].symbol;
        push(edgeFor({
          sourceId: callable.symbol.id,
          targetId: target.id,
          kind: "returns",
          filePath: callable.symbol.filePath,
          referenceName: returnTypeName,
          range: callable.fact.range,
          ruleId: "syntax.swift.unique-signature-return-type",
          targetFilePath: target.filePath
        }));
      }
    }
  }

  const sourceCallable = (sourceId: string, filePath: string): SymbolNode | undefined => {
    const source = input.symbolsById.get(sourceId);
    return source?.filePath === filePath && (source.kind === "function" || source.kind === "method")
      ? source
      : undefined;
  };
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) {
      continue;
    }
    if (call.callKind === "direct") {
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) =>
        candidate.fact.callableKind === "function" &&
        exactArity(candidate.fact, call.argumentCount) &&
        visibleFrom(call.filePath, candidate)
      );
      if (candidates.length === 1 && candidates[0] !== undefined) {
        const target = candidates[0].symbol;
        if (target.filePath !== call.filePath && importedPathFor(call.filePath, call.referenceName) === null) {
          continue;
        }
        push(edgeFor({
          sourceId: source.id,
          targetId: target.id,
          kind: "calls",
          filePath: call.filePath,
          referenceName: call.referenceName,
          range: call.range,
          ruleId: "syntax.swift.unique-direct-function-call",
          targetFilePath: target.filePath
        }));
      }
      continue;
    }
    if (call.receiverTypeName === undefined) {
      continue;
    }
    const receiverCandidates = resolveType(call.filePath, call.receiverTypeName);
    if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) {
      continue;
    }
    const receiver = receiverCandidates[0];
    if (!visibleFrom(call.filePath, receiver) || receiver.fact.isDecoratorTainted === true || receiver.fact.declarationKind === "protocol" || receiver.fact.declarationKind === "enum" || receiver.fact.declarationKind === "typealias") {
      continue;
    }
    const memberCandidates = callables.filter((candidate) => {
      if (candidate.fact.name !== call.referenceName || !exactArity(candidate.fact, call.argumentCount) || !visibleFrom(call.filePath, candidate)) {
        return false;
      }
      if (candidate.fact.callableKind === "method") {
        return candidate.fact.ownerTypeId === receiver.symbol.id;
      }
      return candidate.fact.callableKind === "extension" && candidate.fact.ownerTypeName === receiver.fact.name;
    });
    if (memberCandidates.length === 1 && memberCandidates[0] !== undefined) {
      const target = memberCandidates[0].symbol;
      push(edgeFor({
        sourceId: source.id,
        targetId: target.id,
        kind: "calls",
        filePath: call.filePath,
        referenceName: call.referenceName,
        range: call.range,
        ruleId: memberCandidates[0].fact.callableKind === "extension"
          ? "syntax.swift.unique-extension-member-call"
          : "syntax.swift.unique-member-call",
        targetFilePath: target.filePath
      }));
    }
  }

  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) {
      continue;
    }
    const candidates = resolveType(instantiation.filePath, instantiation.typeName).filter((candidate) =>
      (candidate.fact.declarationKind === "class" || candidate.fact.declarationKind === "struct" || candidate.fact.declarationKind === "actor") &&
      visibleFrom(instantiation.filePath, candidate)
    );
    if (candidates.length !== 1 || candidates[0] === undefined) {
      continue;
    }
    const target = candidates[0];
    const initializers = callables.filter((candidate) =>
      candidate.fact.callableKind === "initializer" &&
      candidate.fact.ownerTypeId === target.symbol.id &&
      exactArity(candidate.fact, instantiation.argumentCount) &&
      visibleFrom(instantiation.filePath, candidate)
    );
    if (initializers.length !== 1) {
      continue;
    }
    push(edgeFor({
      sourceId: source.id,
      targetId: target.symbol.id,
      kind: "instantiates",
      filePath: instantiation.filePath,
      referenceName: instantiation.typeName,
      range: instantiation.range,
      ruleId: "syntax.swift.unique-initializer-call",
      targetFilePath: target.symbol.filePath
    }));
  }

  const heritageEdges: GraphEdge[] = [];
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) {
      continue;
    }
    const candidates = resolveType(reference.filePath, reference.referenceName);
    if (candidates.length !== 1 || candidates[0] === undefined) {
      continue;
    }
    const target = candidates[0];
    if (!visibleFrom(reference.filePath, target) || target.symbol.id === source.id) {
      continue;
    }
    const relationKind = target.fact.declarationKind === "protocol"
      ? (reference.sourceTypeKind === "protocol" ? "extends" : "implements")
      : (reference.sourceTypeKind === "class" || reference.sourceTypeKind === "actor" ? "extends" : null);
    if (relationKind === null) {
      continue;
    }
    const edge = edgeFor({
      sourceId: source.id,
      targetId: target.symbol.id,
      kind: relationKind,
      filePath: reference.filePath,
      referenceName: reference.referenceName,
      range: reference.range,
      ruleId: relationKind === "implements"
        ? "syntax.swift.unique-conformance-target"
        : "syntax.swift.unique-heritage-target",
      targetFilePath: target.symbol.filePath
    });
    heritageEdges.push(edge);
    push(edge);
  }

  for (const override of overrides) {
    const source = input.symbolsById.get(override.sourceId);
    if (source?.filePath !== override.filePath) {
      continue;
    }
    const owner = types.find((candidate) =>
      candidate.symbol.filePath === override.filePath && candidate.fact.name === override.ownerTypeName
    );
    if (owner === undefined) {
      continue;
    }
    const parents = heritageEdges.filter((edge) =>
      edge.sourceId === owner.symbol.id && edge.resolution === "exact" && edge.targetId !== null
    );
    const parentMethods = callables.filter((candidate) =>
      candidate.symbol.id !== source.id &&
      candidate.fact.callableKind === "method" &&
      candidate.fact.name === override.methodName &&
      parents.some((parent) => parent.targetId === candidate.fact.ownerTypeId)
    );
    if (parents.length === 0 || parentMethods.length !== 1 || parentMethods[0] === undefined) {
      continue;
    }
    push(edgeFor({
      sourceId: source.id,
      targetId: parentMethods[0].symbol.id,
      kind: "overrides",
      filePath: override.filePath,
      referenceName: override.methodName,
      range: override.range,
      ruleId: "syntax.swift.explicit-direct-base-method",
      targetFilePath: parentMethods[0].symbol.filePath
    }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
