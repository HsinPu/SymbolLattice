import { compareStableText, createEdgeId, type EdgeEvidence, type GraphEdge, type SymbolNode } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import type { ProjectModuleResolver } from "../../ports/source-catalog.js";

type GoResolverDependencies = {
  readonly goPackageDirectory: (filePath: string) => string;
  readonly referenceEvidence: (
    ruleId: EdgeEvidence["ruleId"],
    stage: EdgeEvidence["stage"],
    candidateIds: readonly string[],
    configurationPaths?: readonly string[],
    resolutionPath?: readonly string[]
  ) => EdgeEvidence;
};

/**
 * Projects only the small Go surface already retained by goProjectFacts: a
 * bare call may cross files only within one exact package directory, and an
 * import may target only the deterministic representative returned by the
 * root go.mod resolver.  It intentionally does not infer package names from
 * paths, select between duplicate declarations, or cross build constraints.
 */
export function projectGoProjectFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly moduleResolver: ProjectModuleResolver | undefined;
}, dependencies: GoResolverDependencies): readonly GraphEdge[] {
  const { goPackageDirectory, referenceEvidence } = dependencies;
  const edges: GraphEdge[] = [];
  const functionsByPackageAndName = new Map<
    string,
    Array<{
      readonly filePath: string;
      readonly symbolId: string;
      readonly unconditionallyAvailable: boolean;
    }>
  >();
  const packageKey = (filePath: string, packageName: string, functionName: string): string =>
    `${goPackageDirectory(filePath)}\u0000${packageName}\u0000${functionName}`;
  const methodKey = (
    filePath: string,
    packageName: string,
    receiverTypeName: string,
    methodName: string
  ): string =>
    `${goPackageDirectory(filePath)}\u0000${packageName}\u0000${receiverTypeName}\u0000${methodName}`;
  const isOwnedFunctionFact = (
    artifactFilePath: string,
    functionFact: {
      readonly name: string;
      readonly symbolId: string;
      readonly filePath: string;
    }
  ): boolean => {
    const symbol = input.symbolsById.get(functionFact.symbolId);
    return functionFact.filePath === artifactFilePath &&
      symbol !== undefined &&
      symbol.kind === "function" &&
      symbol.filePath === artifactFilePath &&
      symbol.name === functionFact.name;
  };
  const methodsByPackageReceiverAndName = new Map<
    string,
    Array<{
      readonly filePath: string;
      readonly symbolId: string;
      readonly unconditionallyAvailable: boolean;
    }>
  >();
  const isOwnedMethodFact = (
    artifactFilePath: string,
    methodFact: {
      readonly receiverTypeName: string;
      readonly name: string;
      readonly symbolId: string;
      readonly filePath: string;
    }
  ): boolean => {
    const symbol = input.symbolsById.get(methodFact.symbolId);
    return methodFact.filePath === artifactFilePath &&
      symbol !== undefined &&
      symbol.kind === "method" &&
      symbol.filePath === artifactFilePath &&
      symbol.name === methodFact.name &&
      symbol.qualifiedName === `${artifactFilePath}#${methodFact.receiverTypeName}.${methodFact.name}`;
  };
  const structsByPackageAndName = new Map<
    string,
    Array<{
      readonly filePath: string;
      readonly symbolId: string;
      readonly unconditionallyAvailable: boolean;
    }>
  >();
  const isOwnedStructFact = (
    artifactFilePath: string,
    structFact: {
      readonly name: string;
      readonly symbolId: string;
      readonly filePath: string;
    }
  ): boolean => {
    const symbol = input.symbolsById.get(structFact.symbolId);
    return structFact.filePath === artifactFilePath &&
      symbol !== undefined &&
      symbol.kind === "type" &&
      symbol.filePath === artifactFilePath &&
      symbol.name === structFact.name &&
      symbol.qualifiedName === `${artifactFilePath}#${structFact.name}`;
  };

  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const goFacts = facts.goProjectFacts;
    if (goFacts === undefined || !goFacts.functions.every((functionFact) =>
      isOwnedFunctionFact(filePath, functionFact)
    )) {
      continue;
    }
    for (const functionFact of goFacts.functions) {
      const key = packageKey(filePath, goFacts.packageName, functionFact.name);
      const candidates = functionsByPackageAndName.get(key) ?? [];
      candidates.push({
        filePath: functionFact.filePath,
        symbolId: functionFact.symbolId,
        unconditionallyAvailable: functionFact.unconditionallyAvailable
      });
      functionsByPackageAndName.set(key, candidates);
    }
    for (const methodFact of goFacts.methods ?? []) {
      if (!isOwnedMethodFact(filePath, methodFact)) {
        continue;
      }
      const key = methodKey(filePath, goFacts.packageName, methodFact.receiverTypeName, methodFact.name);
      const candidates = methodsByPackageReceiverAndName.get(key) ?? [];
      candidates.push({
        filePath: methodFact.filePath,
        symbolId: methodFact.symbolId,
        unconditionallyAvailable: methodFact.unconditionallyAvailable
      });
      methodsByPackageReceiverAndName.set(key, candidates);
    }
    for (const structFact of goFacts.structs ?? []) {
      if (!isOwnedStructFact(filePath, structFact)) {
        continue;
      }
      const key = packageKey(filePath, goFacts.packageName, structFact.name);
      const candidates = structsByPackageAndName.get(key) ?? [];
      candidates.push({
        filePath: structFact.filePath,
        symbolId: structFact.symbolId,
        unconditionallyAvailable: structFact.unconditionallyAvailable
      });
      structsByPackageAndName.set(key, candidates);
    }
  }

  for (const candidates of functionsByPackageAndName.values()) {
    candidates.sort(
      (left, right) => compareStableText(left.filePath, right.filePath) || compareStableText(left.symbolId, right.symbolId)
    );
  }
  for (const candidates of methodsByPackageReceiverAndName.values()) {
    candidates.sort(
      (left, right) => compareStableText(left.filePath, right.filePath) || compareStableText(left.symbolId, right.symbolId)
    );
  }
  for (const candidates of structsByPackageAndName.values()) {
    candidates.sort(
      (left, right) => compareStableText(left.filePath, right.filePath) || compareStableText(left.symbolId, right.symbolId)
    );
  }

  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const goFacts = facts.goProjectFacts;
    const sourceFile = input.fileSymbols.get(filePath);
    if (goFacts === undefined || sourceFile === undefined) {
      continue;
    }

    for (const call of goFacts.bareCalls) {
      const caller = input.symbolsById.get(call.callerId);
      const candidates = functionsByPackageAndName.get(
        packageKey(filePath, goFacts.packageName, call.targetName)
      ) ?? [];
      if (
        caller === undefined ||
        caller.filePath !== filePath ||
        (caller.kind !== "function" && caller.kind !== "method") ||
        candidates.length !== 1 ||
        candidates[0] === undefined ||
        !candidates[0].unconditionallyAvailable
      ) {
        continue;
      }
      const target = input.symbolsById.get(candidates[0].symbolId);
      if (target === undefined || target.filePath !== candidates[0].filePath) {
        continue;
      }
      // Preserve the stronger existing syntax proof when that caller was
      // already handled during extraction; project resolution fills gaps only.
      if (facts.edges.some((edge) =>
        edge.kind === "calls" && edge.sourceId === caller.id && edge.targetId === target.id &&
        edge.range.start.line === call.range.start.line && edge.range.start.column === call.range.start.column
      )) {
        continue;
      }
      edges.push({
        id: createEdgeId({
          sourceId: caller.id,
          targetId: target.id,
          kind: "calls",
          line: call.range.start.line,
          column: call.range.start.column,
          referenceName: call.targetName
        }),
        sourceId: caller.id,
        targetId: target.id,
        kind: "calls",
        filePath,
        range: call.range,
        resolution: "exact",
        confidence: 1,
        referenceName: call.targetName,
        evidence: referenceEvidence(
          "project.go.same-package.unique-unconditional-package-function-call",
          "module",
          [target.id],
          [],
          [filePath, target.filePath]
        )
      });
    }

    for (const call of goFacts.methodCalls ?? []) {
      const caller = input.symbolsById.get(call.callerId);
      const candidates = methodsByPackageReceiverAndName.get(
        methodKey(filePath, goFacts.packageName, call.receiverTypeName, call.methodName)
      ) ?? [];
      if (
        caller === undefined ||
        caller.filePath !== filePath ||
        (caller.kind !== "function" && caller.kind !== "method") ||
        candidates.length !== 1 ||
        candidates[0] === undefined ||
        !candidates[0].unconditionallyAvailable
      ) {
        continue;
      }
      const target = input.symbolsById.get(candidates[0].symbolId);
      if (
        target === undefined ||
        target.filePath !== candidates[0].filePath ||
        target.kind !== "method"
      ) {
        continue;
      }
      edges.push({
        id: createEdgeId({
          sourceId: caller.id,
          targetId: target.id,
          kind: "calls",
          line: call.range.start.line,
          column: call.range.start.column,
          referenceName: call.methodName
        }),
        sourceId: caller.id,
        targetId: target.id,
        kind: "calls",
        filePath,
        range: call.range,
        resolution: "exact",
        confidence: 1,
        referenceName: call.methodName,
        evidence: referenceEvidence(
          "project.go.same-package.unique-concrete-receiver-method-call",
          target.filePath === filePath ? "syntax" : "module",
          [target.id],
          [],
          target.filePath === filePath ? [] : [filePath, target.filePath]
        )
      });
    }

    for (const instantiation of goFacts.instantiations ?? []) {
      const caller = input.symbolsById.get(instantiation.callerId);
      const candidates = structsByPackageAndName.get(
        packageKey(filePath, goFacts.packageName, instantiation.typeName)
      ) ?? [];
      if (
        caller === undefined ||
        caller.filePath !== filePath ||
        (caller.kind !== "function" && caller.kind !== "method") ||
        candidates.length !== 1 ||
        candidates[0] === undefined ||
        !candidates[0].unconditionallyAvailable
      ) {
        continue;
      }
      const target = input.symbolsById.get(candidates[0].symbolId);
      if (target === undefined || target.filePath !== candidates[0].filePath || target.kind !== "type") {
        continue;
      }
      edges.push({
        id: createEdgeId({
          sourceId: caller.id,
          targetId: target.id,
          kind: "instantiates",
          line: instantiation.range.start.line,
          column: instantiation.range.start.column,
          referenceName: instantiation.typeName
        }),
        sourceId: caller.id,
        targetId: target.id,
        kind: "instantiates",
        filePath,
        range: instantiation.range,
        resolution: "exact",
        confidence: 1,
        referenceName: instantiation.typeName,
        evidence: referenceEvidence(
          "project.go.same-package.unique-struct-instantiation",
          target.filePath === filePath ? "syntax" : "module",
          [target.id],
          [],
          target.filePath === filePath ? [] : [filePath, target.filePath]
        )
      });
    }

    if (input.moduleResolver === undefined) {
      continue;
    }
    for (const imported of goFacts.imports) {
      const resolution = input.moduleResolver.resolve(filePath, imported.moduleSpecifier);
      if (
        resolution.strategy !== "go-module-package" ||
        resolution.targetFilePath === null ||
        !input.knownFilePaths.has(resolution.targetFilePath)
      ) {
        continue;
      }
      const target = input.fileSymbols.get(resolution.targetFilePath);
      if (target === undefined) {
        continue;
      }
      edges.push({
        id: createEdgeId({
          sourceId: sourceFile.id,
          targetId: target.id,
          kind: "imports",
          line: imported.range.start.line,
          column: imported.range.start.column,
          referenceName: imported.moduleSpecifier
        }),
        sourceId: sourceFile.id,
        targetId: target.id,
        kind: "imports",
        filePath,
        range: imported.range,
        resolution: "exact",
        confidence: 1,
        referenceName: imported.moduleSpecifier,
        evidence: referenceEvidence(
          "project.go.root-module.local-package-import-representative-file",
          "module",
          [target.id],
          resolution.configurationPaths,
          [filePath, resolution.targetFilePath]
        )
      });
    }
  }
  return edges;
}
