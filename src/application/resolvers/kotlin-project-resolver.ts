import { compareStableText, createEdgeId, type EdgeEvidence, type GraphEdge, type SymbolNode, type KotlinTypeFact, type KotlinCallableFact, type KotlinImportFact } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";

type ReferenceEvidenceFactory = (
  ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[],
  configurationPaths?: readonly string[], resolutionPath?: readonly string[]
) => EdgeEvidence;

interface ResolvedKotlinType {
  readonly fact: KotlinTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedKotlinCallable {
  readonly fact: KotlinCallableFact;
  readonly symbol: SymbolNode;
}

/**
 * Projects the v0.459 Kotlin relation slice without invoking kotlinc or a JVM
 * classpath. Every target is selected by one explicit import, one same-package
 * type path, or one same-file declaration; overloads, aliases, wildcards,
 * defaults, and dynamic receiver shapes remain unresolved.
 */
export function projectKotlinRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedKotlinType[] = [];
  const callables: ResolvedKotlinCallable[] = [];
  const imports: KotlinImportFact[] = [];
  const packageByFile = new Map<string, string>();
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const kotlinFacts = facts.kotlinFacts;
    if (kotlinFacts === undefined) {
      continue;
    }
    packageByFile.set(filePath, kotlinFacts.packageName);
    for (const fact of kotlinFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (
        symbol !== undefined &&
        symbol.filePath === filePath &&
        (symbol.kind === "class" || symbol.kind === "interface" || symbol.kind === "type") &&
        symbol.name === fact.name
      ) {
        types.push({ fact, symbol });
      }
    }
    for (const fact of kotlinFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (
        symbol !== undefined &&
        symbol.filePath === filePath &&
        (symbol.kind === "function" || symbol.kind === "method") &&
        symbol.name === fact.name
      ) {
        callables.push({ fact, symbol });
      }
    }
    imports.push(...kotlinFacts.imports);
  }

  const typesByPath = new Map<string, ResolvedKotlinType[]>();
  const callablesByTopPath = new Map<string, ResolvedKotlinCallable[]>();
  for (const type of types) {
    const entries = typesByPath.get(type.fact.qualifiedTypePath) ?? [];
    entries.push(type);
    typesByPath.set(type.fact.qualifiedTypePath, entries);
  }
  for (const callable of callables) {
    if (callable.fact.callableKind !== "function" && callable.fact.callableKind !== "extension") {
      continue;
    }
    const path = callable.fact.packageName === ""
      ? callable.fact.name
      : `${callable.fact.packageName}.${callable.fact.name}`;
    const entries = callablesByTopPath.get(path) ?? [];
    entries.push(callable);
    callablesByTopPath.set(path, entries);
  }
  for (const entries of typesByPath.values()) {
    entries.sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
  }
  for (const entries of callablesByTopPath.values()) {
    entries.sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
  }

  const importsByFileAndLocalName = new Map<string, KotlinImportFact[]>();
  for (const fact of imports) {
    const key = `${fact.filePath}\u0000${fact.localName}`;
    const entries = importsByFileAndLocalName.get(key) ?? [];
    entries.push(fact);
    importsByFileAndLocalName.set(key, entries);
  }
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };
  const importPathFor = (filePath: string, localName: string): string | null => {
    const entries = (importsByFileAndLocalName.get(`${filePath}\u0000${localName}`) ?? [])
      .filter((fact) => !fact.isWildcard && !fact.isAliased);
    return entries.length === 1 ? entries[0]?.importedPath ?? null : null;
  };
  const typeCandidates = (filePath: string, typeName: string, explicitPath?: string): readonly ResolvedKotlinType[] => {
    if (explicitPath !== undefined) {
      return typesByPath.get(explicitPath) ?? [];
    }
    const importedPath = importPathFor(filePath, typeName);
    if (importedPath !== null) {
      return typesByPath.get(importedPath) ?? [];
    }
    const packageName = packageByFile.get(filePath) ?? "";
    return typesByPath.get(packageName === "" ? typeName : `${packageName}.${typeName}`) ?? [];
  };
  const callableArityIsExact = (fact: KotlinCallableFact, argumentCount: number): boolean =>
    fact.parameterCount === argumentCount && fact.requiredParameterCount === argumentCount;
  const typeVisibleFrom = (filePath: string, target: ResolvedKotlinType): boolean =>
    target.symbol.filePath === filePath || target.fact.isExported;
  const callableVisibleFrom = (filePath: string, target: ResolvedKotlinCallable): boolean =>
    target.symbol.filePath === filePath || target.fact.isExported;

  for (const imported of [...imports].sort((left, right) =>
    compareStableText(
      `${left.filePath}\u0000${left.range.start.line}\u0000${left.range.start.column}`,
      `${right.filePath}\u0000${right.range.start.line}\u0000${right.range.start.column}`
    )
  )) {
    if (imported.isWildcard || imported.isAliased) {
      continue;
    }
    const candidates = [
      ...(typesByPath.get(imported.importedPath) ?? []),
      ...(callablesByTopPath.get(imported.importedPath) ?? [])
    ].filter((candidate) => candidate.symbol.filePath !== imported.filePath && candidate.fact.isExported);
    if (candidates.length !== 1 || candidates[0] === undefined) {
      continue;
    }
    const source = input.symbolsById.get(imported.sourceId);
    const target = candidates[0].symbol;
    if (source?.kind !== "file") {
      continue;
    }
    push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: target.id,
        kind: "imports",
        line: imported.range.start.line,
        column: imported.range.start.column,
        referenceName: imported.importedName
      }),
      sourceId: source.id,
      targetId: target.id,
      kind: "imports",
      filePath: imported.filePath,
      range: imported.range,
      resolution: "exact",
      confidence: 1,
      referenceName: imported.importedName,
      evidence: referenceEvidence(
        "module.kotlin.explicit-import.unique-target",
        "module",
        [target.id],
        [],
        [imported.filePath, target.filePath]
      )
    });
  }

  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const kotlinFacts = facts.kotlinFacts;
    if (kotlinFacts === undefined) {
      continue;
    }
    for (const call of kotlinFacts.calls) {
      const source = input.symbolsById.get(call.sourceId);
      if (
        source === undefined ||
        source.filePath !== filePath ||
        (source.kind !== "function" && source.kind !== "method")
      ) {
        continue;
      }
      if (call.callKind === "direct") {
        const typeTargetCandidates = typeCandidates(filePath, call.referenceName);
        if (typeTargetCandidates.length > 0 && /^[A-Z]/u.test(call.referenceName)) {
          continue;
        }
        const importedPath = importPathFor(filePath, call.referenceName);
        const packageName = packageByFile.get(filePath) ?? "";
        const path = importedPath ?? (packageName === "" ? call.referenceName : `${packageName}.${call.referenceName}`);
        const candidates = (callablesByTopPath.get(path) ?? []).filter(
          (candidate) => candidate.fact.callableKind === "function" &&
            callableArityIsExact(candidate.fact, call.argumentCount) &&
            callableVisibleFrom(filePath, candidate)
        );
        if (candidates.length !== 1 || candidates[0] === undefined) {
          continue;
        }
        const target = candidates[0].symbol;
        push({
          id: createEdgeId({
            sourceId: source.id,
            targetId: target.id,
            kind: "calls",
            line: call.range.start.line,
            column: call.range.start.column,
            referenceName: call.referenceName
          }),
          sourceId: source.id,
          targetId: target.id,
          kind: "calls",
          filePath,
          range: call.range,
          resolution: "exact",
          confidence: 1,
          referenceName: call.referenceName,
          evidence: referenceEvidence(
            "syntax.kotlin.unique-direct-function-call",
            target.filePath === filePath ? "syntax" : "module",
            [target.id],
            [],
            target.filePath === filePath ? [] : [filePath, target.filePath]
          )
        });
        continue;
      }
      if (call.receiverTypeName === undefined) {
        continue;
      }
      const receiverCandidates = typeCandidates(filePath, call.receiverTypeName, call.receiverTypePath);
      if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) {
        continue;
      }
      const receiver = receiverCandidates[0];
      if (
        !typeVisibleFrom(filePath, receiver) ||
        receiver.fact.declarationKind === "interface" ||
        receiver.fact.declarationKind === "enum" ||
        receiver.fact.declarationKind === "typealias"
      ) {
        continue;
      }
      const importedMemberPath = importPathFor(filePath, call.referenceName);
      const memberCandidates = callables.filter((candidate) => {
        if (!callableArityIsExact(candidate.fact, call.argumentCount) || !callableVisibleFrom(filePath, candidate)) {
          return false;
        }
        if (candidate.fact.callableKind === "method") {
          return candidate.fact.ownerTypeId === receiver.symbol.id && candidate.fact.name === call.referenceName;
        }
        return candidate.fact.callableKind === "extension" &&
          candidate.fact.receiverTypeName === receiver.fact.name &&
          candidate.fact.name === call.referenceName &&
          (importedMemberPath === null
            ? candidate.fact.packageName === receiver.fact.packageName
            : `${candidate.fact.packageName === "" ? "" : candidate.fact.packageName + "."}${candidate.fact.name}` === importedMemberPath);
      });
      if (memberCandidates.length !== 1 || memberCandidates[0] === undefined) {
        continue;
      }
      const target = memberCandidates[0].symbol;
      push({
        id: createEdgeId({
          sourceId: source.id,
          targetId: target.id,
          kind: "calls",
          line: call.range.start.line,
          column: call.range.start.column,
          referenceName: call.referenceName
        }),
        sourceId: source.id,
        targetId: target.id,
        kind: "calls",
        filePath,
        range: call.range,
        resolution: "exact",
        confidence: 1,
        referenceName: call.referenceName,
        evidence: referenceEvidence(
          memberCandidates[0].fact.callableKind === "extension"
            ? "syntax.kotlin.unique-extension-function-call"
            : "syntax.kotlin.unique-member-call",
          target.filePath === filePath ? "syntax" : "module",
          [target.id],
          [],
          target.filePath === filePath ? [] : [filePath, target.filePath]
        )
      });
    }
    for (const instantiation of kotlinFacts.instantiations) {
      const source = input.symbolsById.get(instantiation.sourceId);
      if (
        source === undefined ||
        source.filePath !== filePath ||
        (source.kind !== "function" && source.kind !== "method")
      ) {
        continue;
      }
      const candidates = typeCandidates(filePath, instantiation.typeName, instantiation.typePath).filter(
        (candidate) => candidate.fact.declarationKind === "class" &&
          candidate.fact.constructorParameterCount !== undefined &&
          candidate.fact.constructorRequiredParameterCount === instantiation.argumentCount &&
          candidate.fact.constructorParameterCount === instantiation.argumentCount &&
          typeVisibleFrom(filePath, candidate)
      );
      if (candidates.length !== 1 || candidates[0] === undefined) {
        continue;
      }
      const target = candidates[0].symbol;
      push({
        id: createEdgeId({
          sourceId: source.id,
          targetId: target.id,
          kind: "instantiates",
          line: instantiation.range.start.line,
          column: instantiation.range.start.column,
          referenceName: instantiation.typeName
        }),
        sourceId: source.id,
        targetId: target.id,
        kind: "instantiates",
        filePath,
        range: instantiation.range,
        resolution: "exact",
        confidence: 1,
        referenceName: instantiation.typeName,
        evidence: referenceEvidence(
          "syntax.kotlin.unique-constructor-call",
          target.filePath === filePath ? "syntax" : "module",
          [target.id],
          [],
          target.filePath === filePath ? [] : [filePath, target.filePath]
        )
      });
    }
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
