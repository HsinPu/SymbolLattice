import { compareStableText, createEdgeId, type GraphEdge, type CppCallFact, type CppCallableFact, type CppImportFact, type CppInstantiationFact, type CppTypeFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedCppType {
  readonly fact: CppTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedCppCallable {
  readonly fact: CppCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects C++ literal local includes, declarations, fixed-arity calls, and construction. */
export function projectCppRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly knownFilePaths: ReadonlySet<string>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedCppType[] = [];
  const callables: ResolvedCppCallable[] = [];
  const imports: CppImportFact[] = [];
  const calls: CppCallFact[] = [];
  const instantiations: CppInstantiationFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const cppFacts = facts.cppFacts;
    if (cppFacts === undefined || cppFacts.parserRejected === true) continue;
    for (const fact of cppFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of cppFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...cppFacts.imports);
    calls.push(...cppFacts.calls);
    instantiations.push(...cppFacts.instantiations);
  }
  const importsByFile = new Map<string, CppImportFact[]>();
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
  const importTarget = (imported: CppImportFact): string | undefined => {
    const normalized = normalizeRelativePath(imported.filePath, imported.importedPath);
    if (normalized === undefined || !input.knownFilePaths.has(normalized)) return undefined;
    return normalized;
  };
  const importedTargets = (filePath: string): readonly string[] => {
    return [
      ...new Set(
        (importsByFile.get(filePath) ?? [])
          .map((imported) => importTarget(imported))
          .filter((target): target is string => target !== undefined)
      )
    ];
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
          ruleId: "module.cpp.literal-include.unique-file",
          targetFilePath: target.filePath
        })
      );
    }
  }
  const typesByName = new Map<string, ResolvedCppType[]>();
  for (const entry of types) typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
  const sourceCallable = (sourceId: string, filePath: string): ResolvedCppCallable | undefined =>
    callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  const uniqueTypes = (filePath: string, name: string, visibleFiles: readonly string[] = []): readonly ResolvedCppType[] => {
    const visible = new Set([filePath, ...visibleFiles]);
    return [
      ...new Map(
        (typesByName.get(name) ?? [])
          .filter((candidate) => visible.has(candidate.symbol.filePath) || candidate.fact.isExported)
          .map((candidate) => [candidate.symbol.id, candidate])
      ).values()
    ];
  };
  for (const callable of callables) {
    const visibleFiles = importedTargets(callable.symbol.filePath);
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = uniqueTypes(callable.symbol.filePath, typeName, visibleFiles);
      if (candidates.length === 1 && candidates[0] !== undefined) {
        push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.cpp.unique-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
      }
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = uniqueTypes(callable.symbol.filePath, callable.fact.returnTypeName, visibleFiles);
      if (candidates.length === 1 && candidates[0] !== undefined) {
        push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.cpp.unique-return-type", targetFilePath: candidates[0].symbol.filePath }));
      }
    }
  }
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    let candidates: ResolvedCppCallable[] = [];
    if (call.callKind === "member" && call.receiverTypeName !== undefined) {
      const sameName = callables.filter((candidate) => candidate.fact.ownerTypeName === call.receiverTypeName && candidate.fact.name === call.referenceName && candidate.symbol.filePath === source.symbol.filePath);
      candidates = sameName.length === 1 && sameName[0]?.fact.parameterCount === call.argumentCount ? sameName : [];
    } else if (call.callKind === "direct") {
      const visibleFiles = new Set([call.filePath, ...importedTargets(call.filePath)]);
      const sameName = callables.filter((candidate) => candidate.fact.ownerTypeName === undefined && candidate.fact.name === call.referenceName && visibleFiles.has(candidate.symbol.filePath));
      candidates = sameName.length === 1 && sameName[0]?.fact.parameterCount === call.argumentCount ? sameName : [];
    }
    if (candidates.length === 1 && candidates[0] !== undefined) {
      push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: call.callKind === "member" ? "syntax.cpp.unique-this-member-call" : "syntax.cpp.unique-direct-call", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = uniqueTypes(instantiation.filePath, instantiation.typeName, importedTargets(instantiation.filePath));
    if (candidates.length === 1 && candidates[0] !== undefined) {
      push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.cpp.unique-new-construction", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
