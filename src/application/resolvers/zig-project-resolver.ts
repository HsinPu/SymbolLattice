import { compareStableText, createEdgeId, type GraphEdge, type ZigCallFact, type ZigCallableFact, type ZigImportFact, type ZigInstantiationFact, type ZigTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedZigType {
  readonly fact: ZigTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedZigCallable {
  readonly fact: ZigCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Zig literal imports, fixed-arity calls, constructions, and signatures. */
export function projectZigRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly knownFilePaths: ReadonlySet<string>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedZigType[] = [];
  const callables: ResolvedZigCallable[] = [];
  const imports: ZigImportFact[] = [];
  const calls: ZigCallFact[] = [];
  const instantiations: ZigInstantiationFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const zigFacts = facts.zigFacts;
    if (zigFacts === undefined || zigFacts.parserRejected === true) continue;
    for (const fact of zigFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of zigFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...zigFacts.imports);
    calls.push(...zigFacts.calls);
    instantiations.push(...zigFacts.instantiations);
  }
  const typesByName = new Map<string, ResolvedZigType[]>();
  for (const entry of types) typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
  const importsByFile = new Map<string, ZigImportFact[]>();
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
  const importTarget = (imported: ZigImportFact): string | undefined => {
    const normalized = normalizeRelativePath(imported.filePath, imported.importedPath);
    if (normalized === undefined) return undefined;
    const candidates = new Set<string>();
    if (normalized.endsWith(".zig")) {
      if (input.knownFilePaths.has(normalized)) candidates.add(normalized);
    } else {
      for (const candidate of [`${normalized}.zig`, `${normalized}/index.zig`]) {
        if (input.knownFilePaths.has(candidate)) candidates.add(candidate);
      }
    }
    return candidates.size === 1 ? [...candidates][0] : undefined;
  };
  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    const targetPath = importTarget(imported);
    const target = targetPath === undefined ? undefined : fileSymbols.get(targetPath);
    if (source !== undefined && target !== undefined) {
      push(
        edgeFor({
          sourceId: source.id,
          targetId: target.id,
          kind: "imports",
          filePath: imported.filePath,
          referenceName: imported.importedPath,
          range: imported.range,
          ruleId: "module.zig.literal-import.unique-file",
          targetFilePath: target.filePath
        })
      );
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedZigCallable | undefined =>
    callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  const uniqueVisibleTypes = (filePath: string, name: string): readonly ResolvedZigType[] => {
    return [
      ...new Map(
        (typesByName.get(name) ?? [])
          .filter((candidate) => candidate.symbol.filePath === filePath || candidate.fact.isExported)
          .map((candidate) => [candidate.symbol.id, candidate])
      ).values()
    ];
  };
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = uniqueVisibleTypes(callable.symbol.filePath, typeName);
      if (candidates.length === 1 && candidates[0] !== undefined) {
        push(
          edgeFor({
            sourceId: callable.symbol.id,
            targetId: candidates[0].symbol.id,
            kind: "accepts",
            filePath: callable.symbol.filePath,
            referenceName: typeName,
            range: callable.fact.range,
            ruleId: "syntax.zig.unique-parameter-type",
            targetFilePath: candidates[0].symbol.filePath
          })
        );
      }
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = uniqueVisibleTypes(callable.symbol.filePath, callable.fact.returnTypeName);
      if (candidates.length === 1 && candidates[0] !== undefined) {
        push(
          edgeFor({
            sourceId: callable.symbol.id,
            targetId: candidates[0].symbol.id,
            kind: "returns",
            filePath: callable.symbol.filePath,
            referenceName: callable.fact.returnTypeName,
            range: callable.fact.range,
            ruleId: "syntax.zig.unique-return-type",
            targetFilePath: candidates[0].symbol.filePath
          })
        );
      }
    }
  }
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    let candidates: ResolvedZigCallable[] = [];
    if (call.callKind === "direct") {
      const sameName = callables.filter(
        (candidate) =>
          candidate.fact.moduleName === source.fact.moduleName && candidate.fact.name === call.referenceName
      );
      candidates =
        sameName.length === 1 && sameName[0]?.fact.parameterCount === call.argumentCount
          ? sameName
          : [];
    } else if (call.receiverModuleName !== undefined) {
      const matchingImports = (importsByFile.get(call.filePath) ?? []).filter(
        (imported) => imported.localName === call.receiverModuleName
      );
      const targetPath = matchingImports.length === 1 ? importTarget(matchingImports[0]!) : undefined;
      if (targetPath !== undefined) {
        const sameName = callables.filter(
          (candidate) => candidate.symbol.filePath === targetPath && candidate.fact.name === call.referenceName
        );
        candidates =
          sameName.length === 1 &&
          sameName[0]?.fact.isExported === true &&
          sameName[0]?.fact.parameterCount === call.argumentCount
            ? sameName
            : [];
      }
    }
    if (candidates.length === 1 && candidates[0] !== undefined) {
      push(
        edgeFor({
          sourceId: source.symbol.id,
          targetId: candidates[0].symbol.id,
          kind: "calls",
          filePath: call.filePath,
          referenceName:
            call.callKind === "module" && call.receiverModuleName !== undefined
              ? `${call.receiverModuleName}.${call.referenceName}`
              : call.referenceName,
          range: call.range,
          ruleId:
            call.callKind === "module"
              ? "module.zig.unique-qualified-call"
              : "syntax.zig.unique-direct-call",
          targetFilePath: candidates[0].symbol.filePath
        })
      );
    }
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    let candidates: ResolvedZigType[] = [];
    if (instantiation.receiverModuleName !== undefined) {
      const matchingImports = (importsByFile.get(instantiation.filePath) ?? []).filter(
        (imported) => imported.localName === instantiation.receiverModuleName
      );
      const targetPath = matchingImports.length === 1 ? importTarget(matchingImports[0]!) : undefined;
      if (targetPath !== undefined) {
        candidates = (typesByName.get(instantiation.typeName) ?? []).filter(
          (candidate) => candidate.fact.isExported && candidate.symbol.filePath === targetPath
        );
      }
    } else {
      candidates = uniqueVisibleTypes(instantiation.filePath, instantiation.typeName).filter(
        (candidate) => candidate.symbol.filePath === instantiation.filePath
      );
    }
    if (candidates.length === 1 && candidates[0] !== undefined) {
      push(
        edgeFor({
          sourceId: source.symbol.id,
          targetId: candidates[0].symbol.id,
          kind: "instantiates",
          filePath: instantiation.filePath,
          referenceName:
            instantiation.receiverModuleName === undefined
              ? instantiation.typeName
              : `${instantiation.receiverModuleName}.${instantiation.typeName}`,
          range: instantiation.range,
          ruleId:
            instantiation.receiverModuleName === undefined
              ? "syntax.zig.unique-struct-construction"
              : "module.zig.unique-imported-struct-construction",
          targetFilePath: candidates[0].symbol.filePath
        })
      );
    }
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
