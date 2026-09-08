import { compareStableText, createEdgeId, type GraphEdge, type RubyCallFact, type RubyCallableFact, type RubyHeritageFact, type RubyImportFact, type RubyTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedRubyType {
  readonly fact: RubyTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedRubyCallable {
  readonly fact: RubyCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects literal `require_relative`, unique class inheritance, and explicit constant singleton calls. */
export function projectRubyRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly knownFilePaths: ReadonlySet<string>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedRubyType[] = [];
  const callables: ResolvedRubyCallable[] = [];
  const imports: RubyImportFact[] = [];
  const heritage: RubyHeritageFact[] = [];
  const calls: RubyCallFact[] = [];
  const unsafeFiles = new Set<string>();
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const rubyFacts = facts.rubyFacts;
    if (rubyFacts === undefined || rubyFacts.parserRejected === true) continue;
    if (rubyFacts.unsafeDynamicFeatures === true) unsafeFiles.add(filePath);
    for (const fact of rubyFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name && (symbol.kind === "class" || symbol.kind === "module")) {
        types.push({ fact, symbol });
      }
    }
    for (const fact of rubyFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name && (symbol.kind === "method" || symbol.kind === "function")) {
        callables.push({ fact, symbol });
      }
    }
    imports.push(...rubyFacts.imports);
    if (!unsafeFiles.has(filePath)) {
      heritage.push(...rubyFacts.heritage);
      calls.push(...rubyFacts.calls);
    }
  }
  const importsByFile = new Map<string, RubyImportFact[]>();
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
  const importTarget = (imported: RubyImportFact): string | undefined => {
    const normalized = normalizeRelativePath(imported.filePath, imported.importedPath);
    if (normalized === undefined) return undefined;
    const candidates = new Set<string>();
    if (input.knownFilePaths.has(normalized)) candidates.add(normalized);
    if (!normalized.endsWith(".rb") && input.knownFilePaths.has(`${normalized}.rb`)) candidates.add(`${normalized}.rb`);
    if (input.knownFilePaths.has(`${normalized}/init.rb`)) candidates.add(`${normalized}/init.rb`);
    return candidates.size === 1 ? [...candidates][0] : undefined;
  };
  const importedTargets = (filePath: string): readonly string[] => [
    ...new Set(
      (importsByFile.get(filePath) ?? [])
        .map((imported) => importTarget(imported))
        .filter((target): target is string => target !== undefined)
    )
  ];
  const typesByPath = new Map<string, ResolvedRubyType[]>();
  for (const type of types) {
    typesByPath.set(type.fact.constantPath, [
      ...(typesByPath.get(type.fact.constantPath) ?? []),
      type
    ]);
  }
  const callablesByOwnerAndName = new Map<string, ResolvedRubyCallable[]>();
  for (const callable of callables) {
    if (callable.fact.ownerTypePath === undefined) continue;
    const key = `${callable.fact.ownerTypePath}\u0000${callable.fact.name}`;
    callablesByOwnerAndName.set(key, [
      ...(callablesByOwnerAndName.get(key) ?? []),
      callable
    ]);
  }
  const visibleTypes = (filePath: string, typePath: string): readonly ResolvedRubyType[] => {
    const visibleFiles = new Set([filePath, ...importedTargets(filePath)]);
    return [
      ...new Map(
        (typesByPath.get(typePath) ?? [])
          .filter((candidate) => visibleFiles.has(candidate.symbol.filePath))
          .map((candidate) => [candidate.symbol.id, candidate])
      ).values()
    ];
  };
  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    const targetPath = importTarget(imported);
    const target = targetPath === undefined ? undefined : fileSymbols.get(targetPath);
    if (source !== undefined && target !== undefined && source.filePath !== target.filePath) {
      push(edgeFor({
        sourceId: source.id,
        targetId: target.id,
        kind: "imports",
        filePath: imported.filePath,
        referenceName: imported.importedPath,
        range: imported.range,
        ruleId: "module.ruby.literal-require-relative.unique-file",
        targetFilePath: target.filePath
      }));
    }
  }
  for (const relation of heritage) {
    const source = input.symbolsById.get(relation.sourceId);
    if (source === undefined) continue;
    const candidates = visibleTypes(relation.filePath, relation.targetTypePath).filter(
      (candidate) => candidate.fact.declarationKind === "class"
    );
    if (candidates.length === 1 && candidates[0] !== undefined) {
      push(edgeFor({
        sourceId: source.id,
        targetId: candidates[0].symbol.id,
        kind: "extends",
        filePath: relation.filePath,
        referenceName: relation.targetTypePath,
        range: relation.range,
        ruleId: "syntax.ruby.unique-class-superclass",
        targetFilePath: candidates[0].symbol.filePath
      }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedRubyCallable | undefined =>
    callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined || unsafeFiles.has(call.filePath)) continue;
    const receiverCandidates = visibleTypes(call.filePath, call.receiverTypePath);
    if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) continue;
    const receiver = receiverCandidates[0];
    const candidates = (callablesByOwnerAndName.get(`${receiver.fact.constantPath}\u0000${call.referenceName}`) ?? []).filter(
      (candidate) => candidate.fact.isSingleton && candidate.fact.parameterCount === call.argumentCount && (candidate.symbol.filePath === call.filePath || candidate.fact.isExported)
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
          ? "syntax.ruby.unique-constant-singleton-call"
          : "module.ruby.unique-required-constant-singleton-call",
        targetFilePath: candidates[0].symbol.filePath
      }));
    }
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
