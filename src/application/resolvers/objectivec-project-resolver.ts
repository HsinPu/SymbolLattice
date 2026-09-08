import { compareStableText, createEdgeId, type GraphEdge, type ObjcCallFact, type ObjcCallableFact, type ObjcHeritageFact, type ObjcImportFact, type ObjcInstantiationFact, type ObjcTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedObjcType {
  readonly fact: ObjcTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedObjcCallable {
  readonly fact: ObjcCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects literal local Objective-C imports, heritage, signatures, class messages, and alloc/init facts. */
export function projectObjectiveCRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly knownFilePaths: ReadonlySet<string>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedObjcType[] = [];
  const callables: ResolvedObjcCallable[] = [];
  const imports: ObjcImportFact[] = [];
  const heritage: ObjcHeritageFact[] = [];
  const calls: ObjcCallFact[] = [];
  const instantiations: ObjcInstantiationFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const objcFacts = facts.objcFacts;
    if (objcFacts === undefined || objcFacts.parserRejected === true) continue;
    for (const fact of objcFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      const expectedKind = fact.declarationKind === "protocol" ? "interface" : "class";
      if (symbol?.filePath === filePath && symbol.name === fact.name && symbol.kind === expectedKind) {
        types.push({ fact, symbol });
      }
    }
    for (const fact of objcFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name && symbol.kind === "method") {
        callables.push({ fact, symbol });
      }
    }
    imports.push(...objcFacts.imports);
    heritage.push(...objcFacts.heritage);
    calls.push(...objcFacts.calls);
    instantiations.push(...objcFacts.instantiations);
  }
  const importsByFile = new Map<string, ObjcImportFact[]>();
  for (const imported of imports) {
    importsByFile.set(imported.filePath, [
      ...(importsByFile.get(imported.filePath) ?? []),
      imported
    ]);
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
      evidence: referenceEvidence(
        value.ruleId,
        crossFile ? "module" : "syntax",
        [value.targetId],
        [],
        crossFile ? [value.filePath, value.targetFilePath] : []
      )
    };
  };
  const normalizeRelativePath = (filePath: string, importedPath: string): string | undefined => {
    const normalized = importedPath.replaceAll("\\", "/");
    if (normalized.startsWith("/")) return undefined;
    const sourceDirectory = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/") + 1) : "";
    const parts = `${sourceDirectory}${normalized}`.split("/");
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        if (resolved.length === 0) return undefined;
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }
    return resolved.join("/");
  };
  const importTarget = (imported: ObjcImportFact): string | undefined => {
    const normalized = normalizeRelativePath(imported.filePath, imported.importedPath);
    if (normalized !== undefined && input.knownFilePaths.has(normalized)) return normalized;
    const basename = imported.importedPath.replaceAll("\\", "/").split("/").at(-1);
    if (basename === undefined || basename === "") return undefined;
    const candidates = [...input.knownFilePaths].filter((candidate) =>
      candidate === basename || candidate.endsWith(`/${basename}`)
    );
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  const importedTargets = (filePath: string): readonly string[] => [
    ...new Set(
      (importsByFile.get(filePath) ?? [])
        .map((imported) => importTarget(imported))
        .filter((target): target is string => target !== undefined)
    )
  ];
  const typesByName = new Map<string, ResolvedObjcType[]>();
  for (const type of types) {
    typesByName.set(type.fact.name, [
      ...(typesByName.get(type.fact.name) ?? []),
      type
    ]);
  }
  const callablesByOwnerAndName = new Map<string, ResolvedObjcCallable[]>();
  for (const callable of callables) {
    const key = `${callable.fact.ownerTypeName}\u0000${callable.fact.name}`;
    callablesByOwnerAndName.set(key, [
      ...(callablesByOwnerAndName.get(key) ?? []),
      callable
    ]);
  }
  const visibleTypes = (filePath: string, name: string, declarationKind?: ObjcTypeFact["declarationKind"]): readonly ResolvedObjcType[] => {
    const visibleFiles = new Set([filePath, ...importedTargets(filePath)]);
    return [
      ...new Map(
        (typesByName.get(name) ?? [])
          .filter((candidate) =>
            visibleFiles.has(candidate.symbol.filePath) &&
            (declarationKind === undefined || candidate.fact.declarationKind === declarationKind)
          )
          .map((candidate) => [candidate.symbol.id, candidate])
      ).values()
    ];
  };
  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    const targetPath = importTarget(imported);
    const target = targetPath === undefined ? undefined : fileSymbols.get(targetPath);
    if (source !== undefined && target !== undefined && target.filePath !== source.filePath) {
      push(edgeFor({
        sourceId: source.id,
        targetId: target.id,
        kind: "imports",
        filePath: imported.filePath,
        referenceName: imported.importedPath,
        range: imported.range,
        ruleId: "module.objc.literal-import.unique-file",
        targetFilePath: target.filePath
      }));
    }
  }
  for (const relation of heritage) {
    const source = input.symbolsById.get(relation.sourceId);
    if (source === undefined) continue;
    const declarationKind: ObjcTypeFact["declarationKind"] =
      relation.relationKind === "implements" || source.kind === "interface" ? "protocol" : "class";
    const candidates = visibleTypes(relation.filePath, relation.targetTypeName, declarationKind);
    if (candidates.length === 1 && candidates[0] !== undefined) {
      push(edgeFor({
        sourceId: source.id,
        targetId: candidates[0].symbol.id,
        kind: relation.relationKind,
        filePath: relation.filePath,
        referenceName: relation.targetTypeName,
        range: relation.range,
        ruleId: relation.relationKind === "implements"
          ? "syntax.objc.unique-interface-protocol"
          : "syntax.objc.unique-interface-superclass",
        targetFilePath: candidates[0].symbol.filePath
      }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedObjcCallable | undefined =>
    callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = visibleTypes(callable.symbol.filePath, typeName);
      if (candidates.length === 1 && candidates[0] !== undefined) {
        push(edgeFor({
          sourceId: callable.symbol.id,
          targetId: candidates[0].symbol.id,
          kind: "accepts",
          filePath: callable.symbol.filePath,
          referenceName: typeName,
          range: callable.fact.range,
          ruleId: "syntax.objc.unique-signature-parameter-type",
          targetFilePath: candidates[0].symbol.filePath
        }));
      }
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = visibleTypes(callable.symbol.filePath, callable.fact.returnTypeName);
      if (candidates.length === 1 && candidates[0] !== undefined) {
        push(edgeFor({
          sourceId: callable.symbol.id,
          targetId: candidates[0].symbol.id,
          kind: "returns",
          filePath: callable.symbol.filePath,
          referenceName: callable.fact.returnTypeName,
          range: callable.fact.range,
          ruleId: "syntax.objc.unique-signature-return-type",
          targetFilePath: candidates[0].symbol.filePath
        }));
      }
    }
  }
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    const receiverCandidates = visibleTypes(call.filePath, call.receiverTypeName, "class");
    if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) continue;
    const receiver = receiverCandidates[0];
    const candidates = (callablesByOwnerAndName.get(`${receiver.fact.name}\u0000${call.referenceName}`) ?? []).filter(
      (candidate) =>
        candidate.fact.polarity === "+" &&
        candidate.fact.parameterCount === call.argumentCount &&
        (candidate.symbol.filePath === call.filePath || candidate.fact.isExported)
    );
    if (candidates.length === 1 && candidates[0] !== undefined) {
      push(edgeFor({
        sourceId: source.symbol.id,
        targetId: candidates[0].symbol.id,
        kind: "calls",
        filePath: call.filePath,
        referenceName: call.referenceName,
        range: call.range,
        ruleId: receiver.symbol.filePath === call.filePath
          ? "syntax.objc.unique-class-message"
          : "module.objc.unique-imported-class-message",
        targetFilePath: candidates[0].symbol.filePath
      }));
    }
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = visibleTypes(instantiation.filePath, instantiation.typeName, "class");
    if (candidates.length === 1 && candidates[0] !== undefined) {
      push(edgeFor({
        sourceId: source.symbol.id,
        targetId: candidates[0].symbol.id,
        kind: "instantiates",
        filePath: instantiation.filePath,
        referenceName: instantiation.typeName,
        range: instantiation.range,
        ruleId: candidates[0].symbol.filePath === instantiation.filePath
          ? "syntax.objc.unique-alloc-init"
          : "module.objc.unique-imported-alloc-init",
        targetFilePath: candidates[0].symbol.filePath
      }));
    }
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
