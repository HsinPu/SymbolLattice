import { compareStableText, createEdgeId, type GraphEdge, type CCallFact, type CCallableFact, type CImportFact, type CTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedCType {
  readonly fact: CTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedCCallable {
  readonly fact: CCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects C literal local includes, unique direct calls, and tagged signatures. */
export function projectCRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly knownFilePaths: ReadonlySet<string>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedCType[] = [];
  const callables: ResolvedCCallable[] = [];
  const imports: CImportFact[] = [];
  const calls: CCallFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const cFacts = facts.cFacts;
    if (cFacts === undefined || cFacts.parserRejected === true) continue;
    for (const fact of cFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name && symbol.kind === "type") {
        types.push({ fact, symbol });
      }
    }
    for (const fact of cFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name && symbol.kind === "function") {
        callables.push({ fact, symbol });
      }
    }
    imports.push(...cFacts.imports);
    if (cFacts.unsafePreprocessor !== true) calls.push(...cFacts.calls);
  }
  const importsByFile = new Map<string, CImportFact[]>();
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
  const importTarget = (imported: CImportFact): string | undefined => {
    const normalized = normalizeRelativePath(imported.filePath, imported.importedPath);
    return normalized !== undefined && input.knownFilePaths.has(normalized) ? normalized : undefined;
  };
  const importedTargets = (filePath: string): readonly string[] => [
    ...new Set(
      (importsByFile.get(filePath) ?? [])
        .map((imported) => importTarget(imported))
        .filter((target): target is string => target !== undefined)
    )
  ];

  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    const targetPath = importTarget(imported);
    const target = targetPath === undefined ? undefined : fileSymbols.get(targetPath);
    if (source !== undefined && target !== undefined && source.filePath !== target.filePath) {
      push(
        edgeFor({
          sourceId: source.id,
          targetId: target.id,
          kind: "imports",
          filePath: imported.filePath,
          referenceName: imported.importedPath,
          range: imported.range,
          ruleId: "module.c.literal-include.unique-file",
          targetFilePath: target.filePath
        })
      );
    }
  }

  const typesByName = new Map<string, ResolvedCType[]>();
  for (const entry of types) {
    typesByName.set(entry.fact.name, [
      ...(typesByName.get(entry.fact.name) ?? []),
      entry
    ]);
  }
  const callablesByName = new Map<string, ResolvedCCallable[]>();
  for (const entry of callables) {
    callablesByName.set(entry.fact.name, [
      ...(callablesByName.get(entry.fact.name) ?? []),
      entry
    ]);
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedCCallable | undefined =>
    callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  const uniqueVisibleTypes = (filePath: string, name: string, visibleFiles: readonly string[]): readonly ResolvedCType[] => {
    const visible = new Set([filePath, ...visibleFiles]);
    return [
      ...new Map(
        (typesByName.get(name) ?? [])
          .filter((candidate) => visible.has(candidate.symbol.filePath))
          .map((candidate) => [candidate.symbol.id, candidate])
      ).values()
    ];
  };
  for (const callable of callables) {
    const facts = input.factsByFile.get(callable.symbol.filePath)?.cFacts;
    if (facts?.unsafePreprocessor === true) continue;
    const visibleFiles = importedTargets(callable.symbol.filePath);
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = uniqueVisibleTypes(callable.symbol.filePath, typeName, visibleFiles);
      if (candidates.length === 1 && candidates[0] !== undefined) {
        push(edgeFor({
          sourceId: callable.symbol.id,
          targetId: candidates[0].symbol.id,
          kind: "accepts",
          filePath: callable.symbol.filePath,
          referenceName: typeName,
          range: callable.fact.range,
          ruleId: "syntax.c.unique-signature-parameter-type",
          targetFilePath: candidates[0].symbol.filePath
        }));
      }
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = uniqueVisibleTypes(callable.symbol.filePath, callable.fact.returnTypeName, visibleFiles);
      if (candidates.length === 1 && candidates[0] !== undefined) {
        push(edgeFor({
          sourceId: callable.symbol.id,
          targetId: candidates[0].symbol.id,
          kind: "returns",
          filePath: callable.symbol.filePath,
          referenceName: callable.fact.returnTypeName,
          range: callable.fact.range,
          ruleId: "syntax.c.unique-signature-return-type",
          targetFilePath: candidates[0].symbol.filePath
        }));
      }
    }
  }

  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    const visibleFiles = importedTargets(call.filePath);
    const visible = new Set([call.filePath, ...visibleFiles]);
    const candidates = (callablesByName.get(call.referenceName) ?? []).filter(
      (candidate) =>
        visible.has(candidate.symbol.filePath) &&
        candidate.fact.parameterCount === call.argumentCount &&
        candidate.fact.variadic !== true &&
        (candidate.symbol.filePath === call.filePath || candidate.fact.isExported) &&
        !(input.factsByFile.get(candidate.symbol.filePath)?.cFacts?.prototypes ?? []).some(
          (prototype) =>
            prototype.name === candidate.fact.name &&
            prototype.range.start.line < call.range.start.line &&
            (prototype.parameterCount !== candidate.fact.parameterCount ||
              prototype.variadic === true ||
              (prototype.returnTypeName !== undefined &&
                candidate.fact.returnTypeName !== undefined &&
                prototype.returnTypeName !== candidate.fact.returnTypeName) ||
              (prototype.parameterTypeNames !== undefined &&
                candidate.fact.parameterTypeNames !== undefined &&
                prototype.parameterTypeNames.join("\u0000") !== candidate.fact.parameterTypeNames.join("\u0000")))
        )
    );
    if (candidates.length === 1 && candidates[0] !== undefined) {
      const target = candidates[0];
      const crossFile = target.symbol.filePath !== call.filePath;
      push(edgeFor({
        sourceId: source.symbol.id,
        targetId: target.symbol.id,
        kind: "calls",
        filePath: call.filePath,
        referenceName: call.referenceName,
        range: call.range,
        ruleId: crossFile
          ? "module.c.unique-included-function-call"
          : "syntax.c.unique-direct-function-call",
        targetFilePath: target.symbol.filePath
      }));
    }
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
