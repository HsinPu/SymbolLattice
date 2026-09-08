import {
  compareStableText,
  createEdgeId,
  JAVA_EXHAUSTIVE_ASSIGNMENT_JOIN_MAXIMUM_BRANCHES,
  JAVA_EXHAUSTIVE_SWITCH_JOIN_MAXIMUM_ARMS,
  type CallArityEvidence,
  type CallDispatchAccessEvidence,
  type CallDispatchEvidence,
  type CallFieldAccessEvidence,
  type CallReceiverBindingEvidence,
  type CallTypeConversionEvidence,
  type CallTypeEvidence,
  type CallTypeHierarchySegmentEvidence,
  type CallTypeValueEvidence,
  type GraphEdge,
  type JavaCallTypeReferenceFact,
  type JavaCallableDeclarationFact,
  type JavaChainedCallReferenceFact,
  type JavaFieldDeclarationFact,
  type JavaInstantiationReferenceFact,
  type JavaMemberCallReferenceFact,
  type JvmCallableSignatureReferenceFact,
  type JvmDependencyInjectionReferenceFact,
  type SourceRange,
  type SymbolNode
} from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import {
  declaredJvmProjectDependencyEvidence,
  jvmModuleMembershipsByFile,
  jvmTypePath,
  samePackageJvmModuleEvidence,
  type JvmResolvedType,
  type JvmResolverDependencies
} from "./jvm-project-resolver.js";
import type {
  JvmModuleDependency,
  JvmModuleMembership,
  JvmProjectModuleEvidence
} from "../../ports/source-catalog.js";

function sourcePositionLessOrEqual(
  left: SourceRange["start"],
  right: SourceRange["start"]
): boolean {
  return left.line < right.line ||
    (left.line === right.line && left.column <= right.column);
}

function sourceRangeContains(outer: SourceRange, inner: SourceRange): boolean {
  return sourcePositionLessOrEqual(outer.start, inner.start) &&
    sourcePositionLessOrEqual(inner.end, outer.end);
}

/**
 * Projects Java callable parameter and return types only when source syntax
 * identifies one indexed top-level project type. Wildcard imports, missing
 * imports, duplicate type identities, nested types, and compiler-classpath
 * semantics remain unresolved in the retained artifact facts.
 */
export function projectJvmCallableSignatureReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}, dependencies: JvmResolverDependencies): readonly GraphEdge[] {
  const resolverDependencies = dependencies;
  const typesBySymbolId = new Map<string, JvmResolvedType[]>();
  const references: JvmCallableSignatureReferenceFact[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    for (const fact of facts.jvmFacts?.types ?? []) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.kind !== "class" && symbol?.kind !== "interface") {
        continue;
      }
      const entries = typesBySymbolId.get(symbol.id) ?? [];
      entries.push({ fact, symbol });
      typesBySymbolId.set(symbol.id, entries);
    }
    references.push(...(facts.jvmFacts?.callableSignatureReferences ?? []));
  }
  const types = [...typesBySymbolId.values()]
    .filter((entries) => entries.length === 1 && entries[0] !== undefined)
    .map((entries) => entries[0] as JvmResolvedType)
    .sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
  const membershipsByFile = jvmModuleMembershipsByFile(input.jvmProjectModuleEvidence);
  const edges: GraphEdge[] = [];

  for (const reference of [...references].sort((left, right) =>
    compareStableText(
      `${left.sourceId}\u0000${left.relationKind}\u0000${left.range.start.line}\u0000${left.range.start.column}`,
      `${right.sourceId}\u0000${right.relationKind}\u0000${right.range.start.line}\u0000${right.range.start.column}`
    )
  )) {
    const source = input.symbolsById.get(reference.sourceId);
    const declaringTypeEntries = typesBySymbolId.get(reference.declaringTypeId) ?? [];
    if (
      source?.kind !== "method" ||
      declaringTypeEntries.length !== 1 ||
      declaringTypeEntries[0] === undefined
    ) {
      continue;
    }
    const declaringType = declaringTypeEntries[0];
    const targetTypePath = reference.qualifiedTypePath ?? reference.importedTypePath;
    const resolutionProof =
      reference.qualifiedTypePath !== undefined
        ? "qualified-type"
        : reference.importedTypePath !== undefined
          ? "explicit-import"
          : "same-package";
    const candidates = types.filter((candidate) =>
      targetTypePath === undefined
        ? candidate.fact.packageName === declaringType.fact.packageName &&
          candidate.symbol.name === reference.referenceName
        : jvmTypePath(candidate) === targetTypePath
    );
    if (candidates.length !== 1 || candidates[0] === undefined) {
      continue;
    }
    const target = candidates[0].symbol;
    const samePackageConfigurationPaths =
      resolutionProof !== "same-package" || source.filePath === target.filePath
        ? []
        : samePackageJvmModuleEvidence({
            projectEvidence: input.jvmProjectModuleEvidence,
            membershipsByFile,
            sourceFilePath: source.filePath,
            targetFilePath: target.filePath
          }, resolverDependencies.uniqueConfigurationPaths);
    if (samePackageConfigurationPaths === null) {
      continue;
    }
    const declaredProjectDependency =
      resolutionProof === "same-package"
        ? null
        : declaredJvmProjectDependencyEvidence({
            projectEvidence: input.jvmProjectModuleEvidence,
            membershipsByFile,
            sourceFilePath: source.filePath,
            targetFilePath: target.filePath
          }, resolverDependencies.uniqueConfigurationPaths);
    const configurationPaths =
      resolutionProof === "same-package"
        ? samePackageConfigurationPaths
        : declaredProjectDependency?.configurationPaths ?? [];
    const proof =
      declaredProjectDependency === null
        ? resolutionProof
        : `${resolutionProof}.declared-${declaredProjectDependency.kind}`;
    edges.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: target.id,
        kind: reference.relationKind,
        line: reference.range.start.line,
        column: reference.range.start.column,
        referenceName: reference.referenceName
      }),
      sourceId: source.id,
      targetId: target.id,
      kind: reference.relationKind,
      filePath: reference.filePath,
      range: reference.range,
      resolution: "exact",
      confidence: 1,
      referenceName: reference.referenceName,
      evidence: resolverDependencies.referenceEvidence(
        `signature.java.${proof}.${reference.relationKind}`,
        "module",
        resolverDependencies.candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
        configurationPaths,
        [reference.filePath, target.filePath]
      )
    });
  }
  return edges;
}

/** Projects direct Java `new Type(...)` syntax to one proven indexed top-level class. */
export function projectJavaInstantiationReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}, dependencies: JvmResolverDependencies): readonly GraphEdge[] {
  const resolverDependencies = dependencies;
  const typesBySymbolId = new Map<string, JvmResolvedType[]>();
  const references: JavaInstantiationReferenceFact[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    for (const fact of facts.jvmFacts?.types ?? []) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.kind !== "class" && symbol?.kind !== "interface") {
        continue;
      }
      const entries = typesBySymbolId.get(symbol.id) ?? [];
      entries.push({ fact, symbol });
      typesBySymbolId.set(symbol.id, entries);
    }
    references.push(...(facts.jvmFacts?.javaInstantiationReferences ?? []));
  }
  const types = [...typesBySymbolId.values()]
    .filter((entries) => entries.length === 1 && entries[0] !== undefined)
    .map((entries) => entries[0] as JvmResolvedType)
    .sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
  const membershipsByFile = jvmModuleMembershipsByFile(input.jvmProjectModuleEvidence);
  const edges: GraphEdge[] = [];

  for (const reference of [...references].sort((left, right) =>
    compareStableText(
      `${left.sourceId}\u0000${left.range.start.line}\u0000${left.range.start.column}`,
      `${right.sourceId}\u0000${right.range.start.line}\u0000${right.range.start.column}`
    )
  )) {
    const source = input.symbolsById.get(reference.sourceId);
    const declaringTypeEntries = typesBySymbolId.get(reference.declaringTypeId) ?? [];
    if (
      source?.kind !== "method" ||
      declaringTypeEntries.length !== 1 ||
      declaringTypeEntries[0] === undefined
    ) {
      continue;
    }
    const declaringType = declaringTypeEntries[0];
    const targetTypePath = reference.qualifiedTypePath ?? reference.importedTypePath;
    const resolutionProof =
      reference.qualifiedTypePath !== undefined
        ? "qualified-type"
        : reference.importedTypePath !== undefined
          ? "explicit-import"
          : "same-package";
    const candidates = types.filter((candidate) =>
      candidate.symbol.kind === "class" &&
      (targetTypePath === undefined
        ? candidate.fact.packageName === declaringType.fact.packageName &&
          candidate.symbol.name === reference.referenceName
        : jvmTypePath(candidate) === targetTypePath)
    );
    if (candidates.length !== 1 || candidates[0] === undefined) {
      continue;
    }
    const target = candidates[0].symbol;
    const samePackageConfigurationPaths =
      resolutionProof !== "same-package" || source.filePath === target.filePath
        ? []
        : samePackageJvmModuleEvidence({
            projectEvidence: input.jvmProjectModuleEvidence,
            membershipsByFile,
            sourceFilePath: source.filePath,
            targetFilePath: target.filePath
          }, resolverDependencies.uniqueConfigurationPaths);
    if (samePackageConfigurationPaths === null) {
      continue;
    }
    const declaredProjectDependency =
      resolutionProof === "same-package"
        ? null
        : declaredJvmProjectDependencyEvidence({
            projectEvidence: input.jvmProjectModuleEvidence,
            membershipsByFile,
            sourceFilePath: source.filePath,
            targetFilePath: target.filePath
          }, resolverDependencies.uniqueConfigurationPaths);
    const configurationPaths =
      resolutionProof === "same-package"
        ? samePackageConfigurationPaths
        : declaredProjectDependency?.configurationPaths ?? [];
    const proof =
      declaredProjectDependency === null
        ? resolutionProof
        : `${resolutionProof}.declared-${declaredProjectDependency.kind}`;
    edges.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: target.id,
        kind: "instantiates",
        line: reference.range.start.line,
        column: reference.range.start.column,
        referenceName: reference.referenceName
      }),
      sourceId: source.id,
      targetId: target.id,
      kind: "instantiates",
      filePath: reference.filePath,
      range: reference.range,
      resolution: "exact",
      confidence: 1,
      referenceName: reference.referenceName,
      evidence: resolverDependencies.referenceEvidence(
        `syntax.java.object-creation.${proof}`,
        "module",
        resolverDependencies.candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
        configurationPaths,
        [reference.filePath, target.filePath]
      )
    });
  }
  return edges;
}


































































/**
 * Resolves a direct Java `Factory.create().method()` chain only when every hop
 * is source-proven: one project-local receiver type, one static factory method,
 * one exact outer declared return type, and one directly owned target method.
 * Overloads resolve only when one declaration is applicable by syntax-proven
 * fixed/varargs arity. Same-arity ambiguity, inherited targets, wildcard or
 * shadowed receivers, nested return wrappers, and compiler-classpath guesses
 * deliberately produce no call edge.
 */
interface ResolvedJavaCallType {
  readonly evidence: CallTypeValueEvidence;
  readonly configurationPaths: readonly string[];
  readonly sourcePaths: readonly string[];
}

interface JavaCallPlan {
  readonly selected: JavaCallableDeclarationFact;
  readonly arityEvidence: CallArityEvidence;
  readonly typeEvidence: CallTypeEvidence;
  readonly selection: "arity" | "arity-type" | "arity-conversion";
  readonly configurationPaths: readonly string[];
  readonly sourcePaths: readonly string[];
}

interface JavaCallConversion {
  readonly evidence: CallTypeConversionEvidence;
  readonly cost: number | null;
  readonly hierarchyEdges: readonly GraphEdge[];
  readonly sourceSymbolId: string | null;
  readonly targetSymbolId: string | null;
}

const JAVA_REFERENCE_HIERARCHY_LIMITS = {
  maximumDepth: 16,
  maximumVisitedTypes: 256
} as const;

const JAVA_PRIMITIVE_WIDENING_PATHS: Readonly<Record<string, readonly string[]>> = {
  byte: ["byte", "short", "int", "long", "float", "double"],
  short: ["short", "int", "long", "float", "double"],
  char: ["char", "int", "long", "float", "double"],
  int: ["int", "long", "float", "double"],
  long: ["long", "float", "double"],
  float: ["float", "double"],
  double: ["double"],
  boolean: ["boolean"]
};

function javaPrimitiveWideningDistance(sourceType: string, targetType: string): number | null {
  if (!sourceType.startsWith("primitive:") || !targetType.startsWith("primitive:")) {
    return null;
  }
  const source = sourceType.slice("primitive:".length);
  const target = targetType.slice("primitive:".length);
  const path = JAVA_PRIMITIVE_WIDENING_PATHS[source];
  const distance = path?.indexOf(target) ?? -1;
  return distance > 0 ? distance : null;
}

function javaHeritageEdgesBySourceId(
  edges: readonly GraphEdge[],
  typesBySymbolId: ReadonlyMap<string, readonly JvmResolvedType[]>
): ReadonlyMap<string, readonly GraphEdge[]> {
  const bySourceId = new Map<string, Map<string, GraphEdge>>();
  for (const edge of edges) {
    if (
      (edge.kind !== "extends" && edge.kind !== "implements") ||
      edge.resolution !== "exact" ||
      edge.targetId === null ||
      edge.evidence === undefined ||
      (typesBySymbolId.get(edge.sourceId)?.length ?? 0) !== 1 ||
      (typesBySymbolId.get(edge.targetId)?.length ?? 0) !== 1
    ) {
      continue;
    }
    const candidates = bySourceId.get(edge.sourceId) ?? new Map<string, GraphEdge>();
    candidates.set(edge.id, edge);
    bySourceId.set(edge.sourceId, candidates);
  }
  return new Map(
    [...bySourceId.entries()].map(([sourceId, candidates]) => [
      sourceId,
      [...candidates.values()].sort((left, right) => compareStableText(left.id, right.id))
    ])
  );
}

interface JavaReferenceWideningPath {
  readonly state: "matched" | "not-assignable" | "bounded";
  readonly edges: readonly GraphEdge[];
}

function javaReferenceWideningPath(input: {
  readonly sourceSymbolId: string;
  readonly targetSymbolId: string;
  readonly heritageEdgesBySourceId: ReadonlyMap<string, readonly GraphEdge[]>;
}): JavaReferenceWideningPath {
  if (input.sourceSymbolId === input.targetSymbolId) {
    return { state: "matched", edges: [] };
  }
  const queue: Array<{ readonly symbolId: string; readonly edges: readonly GraphEdge[] }> = [
    { symbolId: input.sourceSymbolId, edges: [] }
  ];
  const visited = new Set<string>([input.sourceSymbolId]);
  let bounded = false;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const outgoing = input.heritageEdgesBySourceId.get(current.symbolId) ?? [];
    if (current.edges.length >= JAVA_REFERENCE_HIERARCHY_LIMITS.maximumDepth) {
      if (outgoing.some((edge) => edge.targetId !== null && !visited.has(edge.targetId))) {
        bounded = true;
      }
      continue;
    }
    for (const edge of outgoing) {
      const targetId = edge.targetId;
      if (targetId === null) {
        continue;
      }
      if (visited.has(targetId)) {
        continue;
      }
      if (visited.size >= JAVA_REFERENCE_HIERARCHY_LIMITS.maximumVisitedTypes) {
        bounded = true;
        continue;
      }
      const path = [...current.edges, edge];
      if (targetId === input.targetSymbolId) {
        return { state: "matched", edges: path };
      }
      visited.add(targetId);
      queue.push({ symbolId: targetId, edges: path });
    }
  }
  return { state: bounded ? "bounded" : "not-assignable", edges: [] };
}

function javaHierarchySegmentEvidence(edge: GraphEdge): CallTypeHierarchySegmentEvidence {
  return {
    edgeId: edge.id,
    sourceSymbolId: edge.sourceId,
    targetSymbolId: edge.targetId!,
    relationKind: edge.kind as "extends" | "implements",
    filePath: edge.filePath,
    range: edge.range,
    ruleId: edge.evidence!.ruleId
  };
}

interface JavaMethodSetEntry {
  readonly declaration: JavaCallableDeclarationFact;
  readonly evidence: CallDispatchEvidence;
  readonly hierarchyEdges: readonly GraphEdge[];
  readonly inherited: boolean;
}

interface JavaMethodSetPlan {
  readonly declarations: readonly JavaCallableDeclarationFact[];
  readonly entriesBySymbolId: ReadonlyMap<string, JavaMethodSetEntry>;
}

interface JavaMethodSignaturePlan {
  readonly key: string;
  readonly evidence: CallDispatchEvidence["selectedSignature"];
}

interface JavaMethodAccessPlan {
  readonly evidence: CallDispatchAccessEvidence;
  readonly hierarchyEdges: readonly GraphEdge[];
}

function uniqueJvmResolvedType(
  symbolId: string,
  typesBySymbolId: ReadonlyMap<string, readonly JvmResolvedType[]>
): JvmResolvedType | null {
  const candidates = typesBySymbolId.get(symbolId) ?? [];
  return candidates.length === 1 && candidates[0] !== undefined ? candidates[0] : null;
}

function javaMethodAccessPlan(input: {
  readonly declaration: JavaCallableDeclarationFact;
  readonly callerType: JvmResolvedType;
  readonly receiverTypeSymbolId: string;
  readonly ownerHierarchyPath: readonly GraphEdge[];
  readonly heritageEdgesBySourceId: ReadonlyMap<string, readonly GraphEdge[]>;
  readonly typesBySymbolId: ReadonlyMap<string, readonly JvmResolvedType[]>;
}): JavaMethodAccessPlan | null {
  const visibility = input.declaration.visibility;
  const receiverType = uniqueJvmResolvedType(input.receiverTypeSymbolId, input.typesBySymbolId);
  const ownerType = uniqueJvmResolvedType(input.declaration.declaringTypeId, input.typesBySymbolId);
  if (
    visibility === undefined ||
    receiverType === null ||
    ownerType === null
  ) {
    return null;
  }

  const evidence = (
    decision: CallDispatchAccessEvidence["decision"],
    callerToOwnerPath: readonly GraphEdge[] = [],
    receiverToCallerPath: readonly GraphEdge[] = []
  ): JavaMethodAccessPlan => ({
    evidence: {
      policy: "java-source-access-v1",
      visibility,
      decision,
      callerTypeSymbolId: input.callerType.symbol.id,
      callerPackageName: input.callerType.fact.packageName,
      receiverTypeSymbolId: receiverType.symbol.id,
      receiverPackageName: receiverType.fact.packageName,
      ownerTypeSymbolId: ownerType.symbol.id,
      ownerPackageName: ownerType.fact.packageName,
      callerToOwnerPath: callerToOwnerPath.map(javaHierarchySegmentEvidence),
      receiverToCallerPath: receiverToCallerPath.map(javaHierarchySegmentEvidence)
    },
    hierarchyEdges: [...callerToOwnerPath, ...receiverToCallerPath]
  });

  if (visibility === "private") {
    return input.callerType.symbol.id === ownerType.symbol.id &&
      receiverType.symbol.id === ownerType.symbol.id
      ? evidence("declaring-class")
      : null;
  }

  if (visibility === "public") {
    return evidence("public");
  }

  if (input.callerType.fact.packageName === ownerType.fact.packageName) {
    if (visibility === "package") {
      const inheritedWithinPackage = input.ownerHierarchyPath.every((edge) => {
        const sourceType = uniqueJvmResolvedType(edge.sourceId, input.typesBySymbolId);
        const targetType =
          edge.targetId === null ? null : uniqueJvmResolvedType(edge.targetId, input.typesBySymbolId);
        return (
          sourceType?.fact.packageName === ownerType.fact.packageName &&
          targetType?.fact.packageName === ownerType.fact.packageName
        );
      });
      if (!inheritedWithinPackage) {
        return null;
      }
    }
    return evidence("same-package");
  }

  if (visibility !== "protected") {
    return null;
  }
  const callerToOwner = javaReferenceWideningPath({
    sourceSymbolId: input.callerType.symbol.id,
    targetSymbolId: ownerType.symbol.id,
    heritageEdgesBySourceId: input.heritageEdgesBySourceId
  });
  if (callerToOwner.state !== "matched") {
    return null;
  }
  if (input.declaration.isStatic) {
    return evidence("protected-subclass-static", callerToOwner.edges);
  }
  const receiverToCaller =
    receiverType.symbol.id === input.callerType.symbol.id
      ? { state: "matched" as const, edges: [] }
      : javaReferenceWideningPath({
          sourceSymbolId: receiverType.symbol.id,
          targetSymbolId: input.callerType.symbol.id,
          heritageEdgesBySourceId: input.heritageEdgesBySourceId
        });
  if (receiverToCaller.state !== "matched") {
    return null;
  }
  return evidence(
    "protected-subclass-receiver",
    callerToOwner.edges,
    receiverToCaller.edges
  );
}

function javaMethodSignaturePlan(
  declaration: JavaCallableDeclarationFact,
  typesBySymbolId: ReadonlyMap<string, readonly JvmResolvedType[]>
): JavaMethodSignaturePlan {
  const declaringTypes = typesBySymbolId.get(declaration.declaringTypeId) ?? [];
  const declaringType = declaringTypes.length === 1 ? declaringTypes[0] : undefined;
  const expectedParameterCount =
    declaration.maximumArgumentCount === null
      ? declaration.minimumArgumentCount === undefined
        ? -1
        : declaration.minimumArgumentCount + 1
      : declaration.maximumArgumentCount ?? -1;
  const parameterFacts = declaration.parameterTypes;
  const parameterTypes =
    declaringType !== undefined &&
    expectedParameterCount >= 0 &&
    parameterFacts !== undefined &&
    parameterFacts.length === expectedParameterCount
      ? parameterFacts.map((parameter): string | null => {
          if (parameter === null) {
            return null;
          }
          if (parameter.kind === "primitive") {
            return `primitive:${parameter.referenceName}`;
          }
          const explicitPath = parameter.qualifiedTypePath ?? parameter.importedTypePath;
          if (explicitPath !== undefined) {
            return `reference:${explicitPath}`;
          }
          if (parameter.referenceName === "String") {
            return "reference:java.lang.String";
          }
          const localPath =
            declaringType.fact.packageName.length === 0
              ? parameter.referenceName
              : `${declaringType.fact.packageName}.${parameter.referenceName}`;
          return `reference:${localPath}`;
        })
      : Array.from({ length: Math.max(0, expectedParameterCount) }, () => null);
  const evidence: CallDispatchEvidence["selectedSignature"] = {
    invocationMode: declaration.maximumArgumentCount === null ? "varargs" : "fixed",
    parameterTypes,
    complete:
      expectedParameterCount >= 0 &&
      parameterTypes.length === expectedParameterCount &&
      parameterTypes.every((parameter) => parameter !== null)
  };
  return {
    key: evidence.complete
      ? JSON.stringify([evidence.invocationMode, evidence.parameterTypes])
      : `unproven:${declaration.symbolId}`,
    evidence
  };
}

function javaMethodSetPlan(input: {
  readonly receiverTypeSymbolId: string;
  readonly accessReceiverTypeSymbolId?: string;
  readonly receiverSelectionPath?: readonly GraphEdge[];
  readonly receiverBinding?: CallReceiverBindingEvidence;
  readonly callerType: JvmResolvedType;
  readonly methodName: string;
  readonly invocationKind:
    | "expression"
    | "type-name-static"
    | "implicit-static"
    | "implicit-instance"
    | "this"
    | "super"
    | "parameter"
    | "local"
    | "enhanced-for"
    | "catch"
    | "lambda"
    | "instanceof-pattern"
    | "instanceof-and-pattern"
    | "instanceof-and-chain-pattern"
    | "instanceof-grouped-and-pattern"
    | "instanceof-negated-early-exit-pattern"
    | "instanceof-negated-target-exit-pattern"
    | "instanceof-negated-else-pattern"
    | "try-resource"
    | "field"
    | "this-field"
    | "super-field"
    | "type-field";
  readonly callableDeclarations: readonly JavaCallableDeclarationFact[];
  readonly heritageEdgesBySourceId: ReadonlyMap<string, readonly GraphEdge[]>;
  readonly typesBySymbolId: ReadonlyMap<string, readonly JvmResolvedType[]>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): JavaMethodSetPlan | null {
  const declarationsByOwnerId = new Map<string, JavaCallableDeclarationFact[]>();
  for (const declaration of input.callableDeclarations) {
    if (declaration.callableKind !== "method" || declaration.name !== input.methodName) {
      continue;
    }
    const declarations = declarationsByOwnerId.get(declaration.declaringTypeId) ?? [];
    declarations.push(declaration);
    declarationsByOwnerId.set(declaration.declaringTypeId, declarations);
  }
  for (const declarations of declarationsByOwnerId.values()) {
    declarations.sort((left, right) => compareStableText(left.symbolId, right.symbolId));
  }

  const queue: Array<{ readonly symbolId: string; readonly edges: readonly GraphEdge[] }> = [
    { symbolId: input.receiverTypeSymbolId, edges: [] }
  ];
  const visited = new Set<string>([input.receiverTypeSymbolId]);
  const pathsByOwnerId = new Map<string, readonly GraphEdge[]>([
    [input.receiverTypeSymbolId, []]
  ]);
  let bounded = false;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const outgoing = input.heritageEdgesBySourceId.get(current.symbolId) ?? [];
    if (current.edges.length >= JAVA_REFERENCE_HIERARCHY_LIMITS.maximumDepth) {
      if (outgoing.some((edge) => edge.targetId !== null && !visited.has(edge.targetId))) {
        bounded = true;
      }
      continue;
    }
    for (const edge of outgoing) {
      const targetId = edge.targetId;
      if (targetId === null || visited.has(targetId)) {
        continue;
      }
      if (visited.size >= JAVA_REFERENCE_HIERARCHY_LIMITS.maximumVisitedTypes) {
        bounded = true;
        continue;
      }
      const path = [...current.edges, edge];
      visited.add(targetId);
      queue.push({ symbolId: targetId, edges: path });
      pathsByOwnerId.set(targetId, path);
    }
  }
  if (bounded) {
    return null;
  }

  const declarationsBySignature = new Map<
    string,
    Array<{
      readonly declaration: JavaCallableDeclarationFact;
      readonly signature: JavaMethodSignaturePlan;
      readonly ownerTypeKind: "class" | "interface";
      readonly accessPlan: JavaMethodAccessPlan;
    }>
  >();
  for (const ownerTypeSymbolId of [...pathsByOwnerId.keys()].sort(compareStableText)) {
    const owner = input.symbolsById.get(ownerTypeSymbolId);
    if (owner?.kind !== "class" && owner?.kind !== "interface") {
      continue;
    }
    for (const declaration of declarationsByOwnerId.get(ownerTypeSymbolId) ?? []) {
      if (
        input.invocationKind === "implicit-instance" &&
        (owner.kind !== "class" ||
          input.callerType.symbol.id !== input.receiverTypeSymbolId ||
          (!declaration.isStatic &&
            declaration.visibility !== "private" &&
            declaration.isFinal !== true))
      ) {
        continue;
      }
      if (
        (input.invocationKind === "type-name-static" ||
          input.invocationKind === "implicit-static") &&
        !declaration.isStatic
      ) {
        continue;
      }
      // Java interface static methods belong to the declaring interface and are
      // never inherited or invocable through an instance-valued expression.
      if (
        owner.kind === "interface" &&
        declaration.isStatic &&
        ((input.invocationKind !== "type-name-static" &&
          input.invocationKind !== "implicit-static") ||
          ownerTypeSymbolId !== input.receiverTypeSymbolId)
      ) {
        continue;
      }
      const accessPlan = javaMethodAccessPlan({
        declaration,
        callerType: input.callerType,
        receiverTypeSymbolId:
          input.accessReceiverTypeSymbolId ?? input.receiverTypeSymbolId,
        ownerHierarchyPath: pathsByOwnerId.get(ownerTypeSymbolId) ?? [],
        heritageEdgesBySourceId: input.heritageEdgesBySourceId,
        typesBySymbolId: input.typesBySymbolId
      });
      if (accessPlan === null) {
        continue;
      }
      const signature = javaMethodSignaturePlan(declaration, input.typesBySymbolId);
      const entries = declarationsBySignature.get(signature.key) ?? [];
      entries.push({ declaration, signature, ownerTypeKind: owner.kind, accessPlan });
      declarationsBySignature.set(signature.key, entries);
    }
  }

  const selectedEntries: JavaMethodSetEntry[] = [];
  let comparisonBounded = false;
  for (const [, signatureEntries] of [...declarationsBySignature.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    signatureEntries.sort((left, right) =>
      compareStableText(left.declaration.symbolId, right.declaration.symbolId)
    );
    const ownerIds = [...new Set(signatureEntries.map((entry) => entry.declaration.declaringTypeId))]
      .sort(compareStableText);
    const directOwnerIds = ownerIds.filter((ownerId) => ownerId === input.receiverTypeSymbolId);
    const classOwnerIds = ownerIds.filter(
      (ownerId) => input.symbolsById.get(ownerId)?.kind === "class"
    );
    const precedenceOwnerIds =
      directOwnerIds.length > 0
        ? directOwnerIds
        : classOwnerIds.length > 0
          ? classOwnerIds
          : ownerIds;
    const mostSpecificOwnerIds = precedenceOwnerIds.filter((ownerId) =>
      !precedenceOwnerIds.some((otherOwnerId) => {
        if (otherOwnerId === ownerId) {
          return false;
        }
        const relation = javaReferenceWideningPath({
          sourceSymbolId: otherOwnerId,
          targetSymbolId: ownerId,
          heritageEdgesBySourceId: input.heritageEdgesBySourceId
        });
        if (relation.state === "bounded") {
          comparisonBounded = true;
        }
        return relation.state === "matched";
      })
    );
    const selectedOwnerTypeSymbolId = mostSpecificOwnerIds[0];
    if (mostSpecificOwnerIds.length !== 1 || selectedOwnerTypeSymbolId === undefined) {
      continue;
    }
    const selectedDeclarations = signatureEntries.filter(
      (entry) => entry.declaration.declaringTypeId === selectedOwnerTypeSymbolId
    );
    const selected = selectedDeclarations[0];
    if (selectedDeclarations.length !== 1 || selected === undefined) {
      continue;
    }
    const selectedPath = pathsByOwnerId.get(selectedOwnerTypeSymbolId) ?? [];
    const selectionReason: CallDispatchEvidence["selectionReason"] =
      selectedOwnerTypeSymbolId === input.receiverTypeSymbolId
        ? "declared-owner"
        : classOwnerIds.length > 0 && classOwnerIds.length < ownerIds.length
          ? "class-precedence"
          : precedenceOwnerIds.length === 1
            ? "unique-inherited-owner"
            : "owner-specificity";
    selectedEntries.push({
      declaration: selected.declaration,
      evidence: {
        selectionPolicy: "java-source-method-set-v4",
        invocationKind: input.invocationKind,
        ...(input.receiverSelectionPath === undefined
          ? {}
          : {
              receiverSelectionPath: input.receiverSelectionPath.map(
                javaHierarchySegmentEvidence
              )
            }),
        ...(input.receiverBinding === undefined
          ? {}
          : { receiverBinding: input.receiverBinding }),
        selectionReason,
        receiverTypeSymbolId: input.receiverTypeSymbolId,
        selectedOwnerTypeSymbolId,
        selectedSignature: selected.signature.evidence,
        access: selected.accessPlan.evidence,
        hierarchyBounds: JAVA_REFERENCE_HIERARCHY_LIMITS,
        candidates: ownerIds.map((ownerTypeSymbolId) => {
          const path = pathsByOwnerId.get(ownerTypeSymbolId) ?? [];
          const owner = input.symbolsById.get(ownerTypeSymbolId)!;
          return {
            ownerTypeSymbolId,
            ownerTypeKind: owner.kind as "class" | "interface",
            declarationSymbolIds: signatureEntries
              .filter((entry) => entry.declaration.declaringTypeId === ownerTypeSymbolId)
              .map((entry) => entry.declaration.symbolId),
            distance: path.length,
            hierarchyPath: path.map(javaHierarchySegmentEvidence)
          };
        })
      },
      hierarchyEdges: [
        ...new Map(
          [
            ...(input.receiverSelectionPath ?? []),
            ...selectedPath,
            ...selected.accessPlan.hierarchyEdges
          ].map((edge) => [edge.id, edge])
        ).values()
      ],
      inherited: selectedOwnerTypeSymbolId !== input.receiverTypeSymbolId
    });
  }
  if (comparisonBounded || selectedEntries.length === 0) {
    return null;
  }
  selectedEntries.sort((left, right) =>
    compareStableText(left.declaration.symbolId, right.declaration.symbolId)
  );
  return {
    declarations: selectedEntries.map((entry) => entry.declaration),
    entriesBySymbolId: new Map(
      selectedEntries.map((entry) => [entry.declaration.symbolId, entry] as const)
    )
  };
}

function javaCallConversion(input: {
  readonly argumentIndex: number;
  readonly parameterIndex: number;
  readonly argument: ResolvedJavaCallType | null;
  readonly parameter: ResolvedJavaCallType | null;
  readonly heritageEdgesBySourceId: ReadonlyMap<string, readonly GraphEdge[]>;
}): JavaCallConversion {
  const sourceType = input.argument?.evidence.canonicalType ?? null;
  const targetType = input.parameter?.evidence.canonicalType ?? null;
  if (sourceType === null || targetType === null) {
    return {
      evidence: {
        argumentIndex: input.argumentIndex,
        parameterIndex: input.parameterIndex,
        kind: "unknown",
        sourceType,
        targetType,
        distance: null,
        reason: "unresolved-type"
      },
      cost: null,
      hierarchyEdges: [],
      sourceSymbolId: input.argument?.evidence.targetSymbolId ?? null,
      targetSymbolId: input.parameter?.evidence.targetSymbolId ?? null
    };
  }
  if (sourceType === targetType) {
    return {
      evidence: {
        argumentIndex: input.argumentIndex,
        parameterIndex: input.parameterIndex,
        kind: "exact",
        sourceType,
        targetType,
        distance: 0
      },
      cost: 0,
      hierarchyEdges: [],
      sourceSymbolId: input.argument?.evidence.targetSymbolId ?? null,
      targetSymbolId: input.parameter?.evidence.targetSymbolId ?? null
    };
  }
  const wideningDistance = javaPrimitiveWideningDistance(sourceType, targetType);
  if (wideningDistance !== null) {
    return {
      evidence: {
        argumentIndex: input.argumentIndex,
        parameterIndex: input.parameterIndex,
        kind: "primitive-widening",
        sourceType,
        targetType,
        distance: wideningDistance
      },
      cost: wideningDistance,
      hierarchyEdges: [],
      sourceSymbolId: null,
      targetSymbolId: null
    };
  }
  const sourceSymbolId = input.argument?.evidence.targetSymbolId;
  const targetSymbolId = input.parameter?.evidence.targetSymbolId;
  if (
    sourceType.startsWith("reference:") &&
    targetType.startsWith("reference:") &&
    sourceSymbolId !== undefined &&
    targetSymbolId !== undefined
  ) {
    const hierarchy = javaReferenceWideningPath({
      sourceSymbolId,
      targetSymbolId,
      heritageEdgesBySourceId: input.heritageEdgesBySourceId
    });
    if (hierarchy.state === "matched") {
      return {
        evidence: {
          argumentIndex: input.argumentIndex,
          parameterIndex: input.parameterIndex,
          kind: "reference-widening",
          sourceType,
          targetType,
          distance: hierarchy.edges.length,
          hierarchyPath: hierarchy.edges.map(javaHierarchySegmentEvidence)
        },
        cost: hierarchy.edges.length,
        hierarchyEdges: hierarchy.edges,
        sourceSymbolId,
        targetSymbolId
      };
    }
    if (hierarchy.state === "bounded") {
      return {
        evidence: {
          argumentIndex: input.argumentIndex,
          parameterIndex: input.parameterIndex,
          kind: "unknown",
          sourceType,
          targetType,
          distance: null,
          reason: "hierarchy-limit"
        },
        cost: null,
        hierarchyEdges: [],
        sourceSymbolId,
        targetSymbolId
      };
    }
  }
  return {
    evidence: {
      argumentIndex: input.argumentIndex,
      parameterIndex: input.parameterIndex,
      kind: "incompatible",
      sourceType,
      targetType,
      distance: null
    },
    cost: null,
    hierarchyEdges: [],
    sourceSymbolId: sourceSymbolId ?? null,
    targetSymbolId: targetSymbolId ?? null
  };
}

function javaConversionsDominate(
  left: readonly JavaCallConversion[],
  right: readonly JavaCallConversion[],
  heritageEdgesBySourceId: ReadonlyMap<string, readonly GraphEdge[]>
): { readonly dominates: boolean; readonly usedParameterSpecificity: boolean } {
  if (left.length !== right.length) {
    return { dominates: false, usedParameterSpecificity: false };
  }
  let strictlyBetter = false;
  let usedParameterSpecificity = false;
  for (let index = 0; index < left.length; index += 1) {
    const leftConversion = left[index];
    const rightConversion = right[index];
    if (
      leftConversion === undefined ||
      rightConversion === undefined ||
      leftConversion.cost === null ||
      rightConversion.cost === null
    ) {
      return { dominates: false, usedParameterSpecificity: false };
    }
    if (
      leftConversion.evidence.targetType?.startsWith("reference:") === true &&
      rightConversion.evidence.targetType?.startsWith("reference:") === true &&
      leftConversion.targetSymbolId !== null &&
      rightConversion.targetSymbolId !== null
    ) {
      if (leftConversion.targetSymbolId === rightConversion.targetSymbolId) {
        continue;
      }
      const leftToRight = javaReferenceWideningPath({
        sourceSymbolId: leftConversion.targetSymbolId,
        targetSymbolId: rightConversion.targetSymbolId,
        heritageEdgesBySourceId
      });
      if (leftToRight.state === "matched") {
        strictlyBetter = true;
        usedParameterSpecificity = true;
        continue;
      }
      const rightToLeft = javaReferenceWideningPath({
        sourceSymbolId: rightConversion.targetSymbolId,
        targetSymbolId: leftConversion.targetSymbolId,
        heritageEdgesBySourceId
      });
      if (rightToLeft.state === "matched") {
        return { dominates: false, usedParameterSpecificity: false };
      }
      return { dominates: false, usedParameterSpecificity: false };
    }
    if (leftConversion.cost > rightConversion.cost) {
      return { dominates: false, usedParameterSpecificity: false };
    }
    if (leftConversion.cost < rightConversion.cost) {
      strictlyBetter = true;
    }
  }
  return { dominates: strictlyBetter, usedParameterSpecificity };
}

function resolveJavaCallType(input: {
  readonly reference: JavaCallTypeReferenceFact | null;
  readonly declaringType: JvmResolvedType;
  readonly sourceFilePath: string;
  readonly types: readonly JvmResolvedType[];
  readonly membershipsByFile: ReadonlyMap<string, readonly JvmModuleMembership[]>;
  readonly projectEvidence: JvmProjectModuleEvidence | undefined;
  readonly dependencies: JvmResolverDependencies;
}): ResolvedJavaCallType | null {
  const resolverDependencies = input.dependencies;
  const { reference } = input;
  if (reference === null) {
    return null;
  }
  if (reference.kind === "primitive") {
    return {
      evidence: {
        canonicalType: `primitive:${reference.referenceName}`,
        proof:
          reference.syntax === "primitive-literal"
            ? "primitive-literal"
            : reference.syntax === "primitive-cast"
              ? "primitive-cast"
              : "primitive-declaration",
        range: reference.range
      },
      configurationPaths: [],
      sourcePaths: [input.sourceFilePath]
    };
  }

  const targetTypePath = reference.qualifiedTypePath ?? reference.importedTypePath;
  if (targetTypePath === "java.lang.String") {
    return {
      evidence: {
        canonicalType: "reference:java.lang.String",
        proof:
          reference.syntax === "string-literal"
            ? "string-literal"
            : reference.qualifiedTypePath !== undefined
              ? "qualified-type"
              : "explicit-import",
        range: reference.range
      },
      configurationPaths: [],
      sourcePaths: [input.sourceFilePath]
    };
  }
  const resolutionProof =
    reference.qualifiedTypePath !== undefined
      ? "qualified-type"
      : reference.importedTypePath !== undefined
        ? "explicit-import"
        : "same-package";
  const candidates = input.types.filter((candidate) =>
    targetTypePath === undefined
      ? candidate.fact.packageName === input.declaringType.fact.packageName &&
        candidate.symbol.name === reference.referenceName
      : jvmTypePath(candidate) === targetTypePath
  );
  if (candidates.length === 0 && targetTypePath === undefined && reference.referenceName === "String") {
    return {
      evidence: {
        canonicalType: "reference:java.lang.String",
        proof: "java-lang-default",
        range: reference.range
      },
      configurationPaths: [],
      sourcePaths: [input.sourceFilePath]
    };
  }
  if (candidates.length !== 1 || candidates[0] === undefined) {
    return null;
  }
  const target = candidates[0];
  const samePackageConfigurationPaths =
    resolutionProof !== "same-package" || input.sourceFilePath === target.symbol.filePath
      ? []
      : samePackageJvmModuleEvidence({
          projectEvidence: input.projectEvidence,
          membershipsByFile: input.membershipsByFile,
          sourceFilePath: input.sourceFilePath,
          targetFilePath: target.symbol.filePath
        }, resolverDependencies.uniqueConfigurationPaths);
  if (samePackageConfigurationPaths === null) {
    return null;
  }
  const declaredProjectDependency =
    resolutionProof === "same-package"
      ? null
      : declaredJvmProjectDependencyEvidence({
          projectEvidence: input.projectEvidence,
          membershipsByFile: input.membershipsByFile,
          sourceFilePath: input.sourceFilePath,
          targetFilePath: target.symbol.filePath
        }, resolverDependencies.uniqueConfigurationPaths);
  return {
    evidence: {
      canonicalType: `reference:${jvmTypePath(target)}`,
      proof: resolutionProof,
      range: reference.range,
      targetSymbolId: target.symbol.id
    },
    configurationPaths:
      resolutionProof === "same-package"
        ? samePackageConfigurationPaths
        : declaredProjectDependency?.configurationPaths ?? [],
    sourcePaths: [input.sourceFilePath, target.symbol.filePath]
  };
}

function javaCallPlan(input: {
  readonly declarations: readonly JavaCallableDeclarationFact[];
  readonly actualArgumentCount: number | undefined;
  readonly argumentTypes: readonly (JavaCallTypeReferenceFact | null)[] | undefined;
  readonly callerType: JvmResolvedType;
  readonly typesBySymbolId: ReadonlyMap<string, readonly JvmResolvedType[]>;
  readonly types: readonly JvmResolvedType[];
  readonly heritageEdgesBySourceId: ReadonlyMap<string, readonly GraphEdge[]>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly membershipsByFile: ReadonlyMap<string, readonly JvmModuleMembership[]>;
  readonly projectEvidence: JvmProjectModuleEvidence | undefined;
  readonly dependencies: JvmResolverDependencies;
}): JavaCallPlan | null {
  const resolverDependencies = input.dependencies;
  const { actualArgumentCount } = input;
  if (!Number.isSafeInteger(actualArgumentCount) || actualArgumentCount === undefined || actualArgumentCount < 0) {
    return null;
  }
  const ordered = [...input.declarations].sort((left, right) =>
    compareStableText(left.symbolId, right.symbolId)
  );
  if (
    ordered.some(
      (declaration) =>
        declaration.minimumArgumentCount === undefined ||
        !Number.isSafeInteger(declaration.minimumArgumentCount) ||
        declaration.minimumArgumentCount < 0 ||
        declaration.maximumArgumentCount === undefined ||
        (declaration.maximumArgumentCount !== null &&
          (!Number.isSafeInteger(declaration.maximumArgumentCount) ||
            declaration.maximumArgumentCount < declaration.minimumArgumentCount))
    )
  ) {
    return null;
  }
  const candidates = ordered.map((declaration) => ({
    symbolId: declaration.symbolId,
    minimumArgumentCount: declaration.minimumArgumentCount!,
    maximumArgumentCount: declaration.maximumArgumentCount!,
    applicable:
      actualArgumentCount >= declaration.minimumArgumentCount! &&
      (declaration.maximumArgumentCount === null ||
        actualArgumentCount <= declaration.maximumArgumentCount!)
  }));
  const applicableIds = new Set(
    candidates.filter((candidate) => candidate.applicable).map((candidate) => candidate.symbolId)
  );
  if (applicableIds.size === 0) {
    return null;
  }

  const argumentFacts =
    input.argumentTypes !== undefined && input.argumentTypes.length === actualArgumentCount
      ? input.argumentTypes
      : Array.from({ length: actualArgumentCount }, () => null);
  const resolvedArguments = argumentFacts.map((reference) =>
    resolveJavaCallType({
      dependencies: resolverDependencies,
      reference,
      declaringType: input.callerType,
      sourceFilePath: input.callerType.symbol.filePath,
      types: input.types,
      membershipsByFile: input.membershipsByFile,
      projectEvidence: input.projectEvidence
    })
  );
  const candidateResolutions = new Map<
    string,
    {
      readonly declaration: JavaCallableDeclarationFact;
      readonly parameters: readonly (ResolvedJavaCallType | null)[];
      readonly invocationMode: "fixed" | "varargs";
      readonly conversions: readonly JavaCallConversion[];
      readonly compatibility: "compatible" | "incompatible" | "unknown" | "not-applicable";
    }
  >();

  for (const declaration of ordered) {
    const declaringTypeEntries = input.typesBySymbolId.get(declaration.declaringTypeId) ?? [];
    const declaringType =
      declaringTypeEntries.length === 1 ? declaringTypeEntries[0] : undefined;
    const declarationSymbol = input.symbolsById.get(declaration.symbolId);
    const parameterFacts = declaration.parameterTypes;
    const expectedParameterCount =
      declaration.maximumArgumentCount === null
        ? (declaration.minimumArgumentCount ?? -1) + 1
        : declaration.maximumArgumentCount;
    const parameters =
      declaringType !== undefined &&
      declarationSymbol !== undefined &&
      parameterFacts !== undefined &&
      parameterFacts.length === expectedParameterCount
        ? parameterFacts.map((reference) =>
            resolveJavaCallType({
              dependencies: resolverDependencies,
              reference,
              declaringType,
              sourceFilePath: declarationSymbol.filePath,
              types: input.types,
              membershipsByFile: input.membershipsByFile,
              projectEvidence: input.projectEvidence
            })
          )
        : Array.from({ length: Math.max(0, expectedParameterCount ?? 0) }, () => null);
    const invocationMode = declaration.maximumArgumentCount === null ? "varargs" : "fixed";
    const conversions: JavaCallConversion[] = [];
    let compatibility: "compatible" | "incompatible" | "unknown" | "not-applicable" =
      applicableIds.has(declaration.symbolId) ? "compatible" : "not-applicable";
    if (compatibility !== "not-applicable") {
      let unknown = false;
      const fixedParameterCount =
        declaration.maximumArgumentCount === null ? Math.max(0, parameters.length - 1) : parameters.length;
      for (let argumentIndex = 0; argumentIndex < actualArgumentCount; argumentIndex += 1) {
        const parameterIndex =
          declaration.maximumArgumentCount === null && argumentIndex >= fixedParameterCount
            ? parameters.length - 1
            : argumentIndex;
        const argument = resolvedArguments[argumentIndex] ?? null;
        const parameter = parameters[parameterIndex] ?? null;
        const conversion = javaCallConversion({
          argumentIndex,
          parameterIndex,
          argument,
          parameter,
          heritageEdgesBySourceId: input.heritageEdgesBySourceId
        });
        conversions.push(conversion);
        if (conversion.evidence.kind === "unknown") {
          unknown = true;
          continue;
        }
        if (conversion.evidence.kind === "incompatible") {
          compatibility = "incompatible";
          continue;
        }
      }
      if (compatibility === "compatible" && unknown) {
        compatibility = "unknown";
      }
    }
    candidateResolutions.set(declaration.symbolId, {
      declaration,
      parameters,
      invocationMode,
      conversions,
      compatibility
    });
  }

  const applicable = [...candidateResolutions.values()].filter(
    (candidate) => candidate.compatibility !== "not-applicable"
  );
  let selectedResolution:
    | (typeof applicable)[number]
    | undefined;
  let selection: JavaCallPlan["selection"] = "arity";
  let selectionReason: NonNullable<CallTypeEvidence["selectionReason"]> = "unique-applicable";
  if (applicable.length === 1) {
    const only = applicable[0];
    const hierarchyBounded = only?.conversions.some(
      (conversion) => conversion.evidence.reason === "hierarchy-limit"
    );
    selectedResolution =
      only?.compatibility === "incompatible" || hierarchyBounded ? undefined : only;
  } else {
    const compatible = applicable.filter((candidate) => candidate.compatibility === "compatible");
    const unknown = applicable.some((candidate) => candidate.compatibility === "unknown");
    if (!unknown) {
      const fixed = compatible.filter((candidate) => candidate.invocationMode === "fixed");
      const phase = fixed.length > 0 ? fixed : compatible;
      const nonDominated = phase.filter(
        (candidate) =>
          !phase.some(
            (other) =>
              other.declaration.symbolId !== candidate.declaration.symbolId &&
              javaConversionsDominate(
                other.conversions,
                candidate.conversions,
                input.heritageEdgesBySourceId
              ).dominates
          )
      );
      if (nonDominated.length === 1) {
        selectedResolution = nonDominated[0];
        selectionReason =
          compatible.length === 1
            ? "unique-compatible"
            : phase.some(
                (other) =>
                  other.declaration.symbolId !== selectedResolution?.declaration.symbolId &&
                  javaConversionsDominate(
                    selectedResolution!.conversions,
                    other.conversions,
                    input.heritageEdgesBySourceId
                  ).usedParameterSpecificity
              )
              ? "parameter-specificity"
              : "conversion-cost";
        selection = selectedResolution?.conversions.some(
          (conversion) =>
            conversion.evidence.kind === "primitive-widening" ||
            conversion.evidence.kind === "reference-widening"
        )
          ? "arity-conversion"
          : "arity-type";
      }
    }
  }
  if (selectedResolution === undefined) {
    return null;
  }
  if (
    selection === "arity" &&
    selectedResolution.conversions.some(
      (conversion) =>
        conversion.evidence.kind === "primitive-widening" ||
        conversion.evidence.kind === "reference-widening"
    )
  ) {
    selection = "arity-conversion";
  }

  const selectedTypes = [
    ...resolvedArguments,
    ...selectedResolution.parameters
  ].filter((candidate): candidate is ResolvedJavaCallType => candidate !== null);
  const selectedHierarchyEdges = selectedResolution.conversions.flatMap(
    (conversion) => conversion.hierarchyEdges
  );
  return {
    selected: selectedResolution.declaration,
    arityEvidence: {
      actualArgumentCount,
      candidates
    },
    typeEvidence: {
      arguments: resolvedArguments.map((candidate) => candidate?.evidence ?? null),
      candidates: ordered.map((declaration) => {
        const candidate = candidateResolutions.get(declaration.symbolId)!;
        return {
          symbolId: declaration.symbolId,
          parameterTypes: candidate.parameters.map((parameter) => parameter?.evidence ?? null),
          compatibility: candidate.compatibility,
          invocationMode: candidate.invocationMode,
          conversions: candidate.conversions.map((conversion) => conversion.evidence)
        };
      }),
      selectionPolicy: "java-source-widening-v2",
      selectedSymbolId: selectedResolution.declaration.symbolId,
      selectionReason,
      hierarchyBounds: JAVA_REFERENCE_HIERARCHY_LIMITS
    },
    selection,
    configurationPaths: resolverDependencies.uniqueConfigurationPaths(
      [
        ...selectedTypes.map((candidate) => candidate.configurationPaths),
        ...selectedHierarchyEdges.map((edge) => edge.evidence?.configurationPaths ?? [])
      ]
    ),
    sourcePaths: [
      ...new Set([
        ...selectedTypes.flatMap((candidate) => candidate.sourcePaths),
        ...selectedHierarchyEdges.flatMap((edge) => [
          edge.filePath,
          ...(edge.evidence?.resolutionPath ?? [])
        ])
      ])
    ].sort(compareStableText)
  };
}

interface JavaFieldSelectionPlan {
  readonly field: JavaFieldDeclarationFact;
  readonly ownerType: JvmResolvedType;
  readonly ownerSelectionPath: readonly GraphEdge[];
  readonly selectionReason:
    | "declared-owner"
    | "nearest-inherited-owner"
    | "unique-interface-owner";
  readonly access: CallFieldAccessEvidence;
}

interface JavaHeritageReferenceCounts {
  readonly classSuperclass: number;
  readonly classInterfaces: number;
  readonly interfaceSuperinterfaces: number;
}

function javaHierarchyFieldNameState(input: {
  readonly callerType: JvmResolvedType;
  readonly fieldName: string;
  readonly fieldsByOwnerId: ReadonlyMap<string, readonly JavaFieldDeclarationFact[]>;
  readonly heritageEdgesBySourceId: ReadonlyMap<string, readonly GraphEdge[]>;
  readonly heritageReferenceCountsBySourceId: ReadonlyMap<string, JavaHeritageReferenceCounts>;
  readonly typesBySymbolId: ReadonlyMap<string, readonly JvmResolvedType[]>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): "present" | "absent" | "unknown" {
  const queue: Array<{ readonly type: JvmResolvedType; readonly depth: number }> = [
    { type: input.callerType, depth: 0 }
  ];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index]!;
    if (visited.has(entry.type.symbol.id)) {
      continue;
    }
    if (visited.size >= JAVA_REFERENCE_HIERARCHY_LIMITS.maximumVisitedTypes) {
      return "unknown";
    }
    visited.add(entry.type.symbol.id);
    if (
      (input.fieldsByOwnerId.get(entry.type.symbol.id) ?? []).some(
        (field) => field.name === input.fieldName
      )
    ) {
      return "present";
    }

    const counts = input.heritageReferenceCountsBySourceId.get(entry.type.symbol.id) ?? {
      classSuperclass: 0,
      classInterfaces: 0,
      interfaceSuperinterfaces: 0
    };
    const expectedCount =
      entry.type.symbol.kind === "class"
        ? counts.classSuperclass + counts.classInterfaces
        : counts.interfaceSuperinterfaces;
    const outgoing = (input.heritageEdgesBySourceId.get(entry.type.symbol.id) ?? []).filter(
      (edge) => {
        const targetKind =
          edge.targetId === null ? undefined : input.symbolsById.get(edge.targetId)?.kind;
        return entry.type.symbol.kind === "class"
          ? (edge.kind === "extends" && targetKind === "class") ||
              (edge.kind === "implements" && targetKind === "interface")
          : edge.kind === "extends" && targetKind === "interface";
      }
    );
    if (outgoing.length !== expectedCount) {
      return "unknown";
    }
    if (
      entry.depth >= JAVA_REFERENCE_HIERARCHY_LIMITS.maximumDepth &&
      outgoing.some((edge) => edge.targetId !== null && !visited.has(edge.targetId))
    ) {
      return "unknown";
    }
    for (const edge of outgoing) {
      const targetEntries = edge.targetId === null ? [] : (input.typesBySymbolId.get(edge.targetId) ?? []);
      if (targetEntries.length !== 1 || targetEntries[0] === undefined) {
        return "unknown";
      }
      queue.push({ type: targetEntries[0], depth: entry.depth + 1 });
    }
  }
  return "absent";
}

function javaFieldSelectionPlan(input: {
  readonly callerType: JvmResolvedType;
  readonly receiverKind: "field" | "this-field" | "super-field" | "type-field";
  readonly lookupType?: JvmResolvedType;
  readonly fieldName: string;
  readonly callerIsStatic: boolean;
  readonly fieldsByOwnerId: ReadonlyMap<string, readonly JavaFieldDeclarationFact[]>;
  readonly heritageEdgesBySourceId: ReadonlyMap<string, readonly GraphEdge[]>;
  readonly heritageReferenceCountsBySourceId: ReadonlyMap<string, JavaHeritageReferenceCounts>;
  readonly typesBySymbolId: ReadonlyMap<string, readonly JvmResolvedType[]>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): JavaFieldSelectionPlan | null {
  if (
    input.callerIsStatic &&
    (input.receiverKind === "this-field" || input.receiverKind === "super-field")
  ) {
    return null;
  }
  if (
    input.receiverKind === "type-field" &&
    input.lookupType === undefined
  ) {
    return null;
  }
  const lookupType = input.lookupType ?? input.callerType;

  type DeclaredFieldSelection =
    | { readonly state: "absent" }
    | { readonly state: "invalid" }
    | { readonly state: "selected"; readonly plan: JavaFieldSelectionPlan };

  const referenceCounts = (symbolId: string): JavaHeritageReferenceCounts =>
    input.heritageReferenceCountsBySourceId.get(symbolId) ?? {
      classSuperclass: 0,
      classInterfaces: 0,
      interfaceSuperinterfaces: 0
    };
  const exactEdges = (
    sourceId: string,
    relationKind: "extends" | "implements",
    targetKind: "class" | "interface"
  ): readonly GraphEdge[] =>
    (input.heritageEdgesBySourceId.get(sourceId) ?? []).filter(
      (edge) =>
        edge.kind === relationKind &&
        edge.targetId !== null &&
        input.symbolsById.get(edge.targetId)?.kind === targetKind
    );
  const resolvedType = (symbolId: string, kind: "class" | "interface"): JvmResolvedType | null => {
    const entries = input.typesBySymbolId.get(symbolId) ?? [];
    const entry = entries[0];
    return entries.length === 1 && entry?.symbol.kind === kind ? entry : null;
  };
  const selectDeclaredField = (
    ownerType: JvmResolvedType,
    ownerSelectionPath: readonly GraphEdge[],
    selectionReason: JavaFieldSelectionPlan["selectionReason"]
  ): DeclaredFieldSelection => {
    const namedFields = (input.fieldsByOwnerId.get(ownerType.symbol.id) ?? []).filter(
      (candidate) => candidate.name === input.fieldName
    );
    if (namedFields.length === 0) {
      return { state: "absent" };
    }
    const field = namedFields[0];
    if (
      namedFields.length !== 1 ||
      field === undefined ||
      field.type === null ||
      ((input.callerIsStatic || input.receiverKind === "type-field") && !field.isStatic)
    ) {
      return { state: "invalid" };
    }
    const callerPackageName = input.callerType.fact.packageName;
    const ownerPackageName = ownerType.fact.packageName;
    let decision: CallFieldAccessEvidence["decision"] | null = null;
    if (
      ownerType.symbol.id === input.callerType.symbol.id &&
      lookupType.symbol.id === ownerType.symbol.id &&
      ownerSelectionPath.length === 0
    ) {
      decision = "declaring-class";
    } else if (field.visibility === "public") {
      decision = "public";
    } else if (field.visibility !== "private" && callerPackageName === ownerPackageName) {
      const packagePathIsContinuous = [
        lookupType.symbol.id,
        ...ownerSelectionPath.map((edge) => edge.targetId!)
      ].every((symbolId) => {
        const entries = input.typesBySymbolId.get(symbolId) ?? [];
        return entries.length === 1 && entries[0]?.fact.packageName === ownerPackageName;
      });
      if (field.visibility !== "package" || packagePathIsContinuous) {
        decision = "same-package";
      }
    } else if (
      input.receiverKind !== "type-field" &&
      field.visibility === "protected" &&
      ownerSelectionPath.length > 0
    ) {
      decision = "protected-subclass";
    }
    if (decision === null) {
      return { state: "invalid" };
    }
    return {
      state: "selected",
      plan: {
        field,
        ownerType,
        ownerSelectionPath,
        selectionReason,
        access: {
          policy: "java-source-field-access-v1",
          visibility: field.visibility,
          decision,
          callerTypeSymbolId: input.callerType.symbol.id,
          callerPackageName,
          ownerTypeSymbolId: ownerType.symbol.id,
          ownerPackageName
        }
      }
    };
  };

  const visitedClassIds = new Set<string>();
  const interfaceSeeds: Array<{
    readonly type: JvmResolvedType;
    readonly path: readonly GraphEdge[];
  }> = [];
  let current = lookupType;
  let classPath: readonly GraphEdge[] = [];

  if (input.receiverKind === "super-field") {
    if (current.symbol.kind !== "class" || referenceCounts(current.symbol.id).classSuperclass !== 1) {
      return null;
    }
    const edges = exactEdges(current.symbol.id, "extends", "class");
    const edge = edges[0];
    const target = edge?.targetId === null || edge === undefined ? null : resolvedType(edge.targetId, "class");
    if (edges.length !== 1 || edge === undefined || target === null) {
      return null;
    }
    classPath = [edge];
    current = target;
  }

  if (current.symbol.kind === "interface") {
    const own = selectDeclaredField(current, classPath, "declared-owner");
    if (own.state === "selected") {
      return own.plan;
    }
    if (own.state === "invalid" || input.receiverKind === "super-field") {
      return null;
    }
    const parentEdges = exactEdges(current.symbol.id, "extends", "interface");
    if (parentEdges.length !== referenceCounts(current.symbol.id).interfaceSuperinterfaces) {
      return null;
    }
    for (const edge of parentEdges) {
      const target = edge.targetId === null ? null : resolvedType(edge.targetId, "interface");
      if (target === null) {
        return null;
      }
      interfaceSeeds.push({ type: target, path: [...classPath, edge] });
    }
  } else {
    while (true) {
      if (
        visitedClassIds.has(current.symbol.id) ||
        visitedClassIds.size >= JAVA_REFERENCE_HIERARCHY_LIMITS.maximumVisitedTypes ||
        classPath.length > JAVA_REFERENCE_HIERARCHY_LIMITS.maximumDepth
      ) {
        return null;
      }
      visitedClassIds.add(current.symbol.id);
      const declared = selectDeclaredField(
        current,
        classPath,
        classPath.length === 0 ? "declared-owner" : "nearest-inherited-owner"
      );
      if (declared.state === "selected") {
        return declared.plan;
      }
      if (declared.state === "invalid") {
        return null;
      }
      if (input.receiverKind !== "super-field") {
        const implementedEdges = exactEdges(current.symbol.id, "implements", "interface");
        if (implementedEdges.length !== referenceCounts(current.symbol.id).classInterfaces) {
          return null;
        }
        for (const edge of implementedEdges) {
          const target = edge.targetId === null ? null : resolvedType(edge.targetId, "interface");
          if (target === null) {
            return null;
          }
          interfaceSeeds.push({ type: target, path: [...classPath, edge] });
        }
      }
      const expectedSuperclassCount = referenceCounts(current.symbol.id).classSuperclass;
      if (expectedSuperclassCount === 0) {
        break;
      }
      const superEdges = exactEdges(current.symbol.id, "extends", "class");
      const superEdge = superEdges[0];
      const superType =
        superEdge?.targetId === null || superEdge === undefined
          ? null
          : resolvedType(superEdge.targetId, "class");
      if (
        expectedSuperclassCount !== 1 ||
        superEdges.length !== 1 ||
        superEdge === undefined ||
        superType === null ||
        classPath.length >= JAVA_REFERENCE_HIERARCHY_LIMITS.maximumDepth
      ) {
        return null;
      }
      classPath = [...classPath, superEdge];
      current = superType;
    }
    if (input.receiverKind === "super-field") {
      return null;
    }
  }

  interface InterfaceFieldCandidate {
    readonly ownerType: JvmResolvedType;
    readonly path: readonly GraphEdge[];
    readonly selection: DeclaredFieldSelection;
  }
  const candidatesByOwnerId = new Map<string, InterfaceFieldCandidate>();
  const interfacePaths = new Map<string, readonly GraphEdge[]>();
  const queue = [...interfaceSeeds].sort((left, right) =>
    compareStableText(
      left.path.map((edge) => edge.id).join("\u0000"),
      right.path.map((edge) => edge.id).join("\u0000")
    )
  );
  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index]!;
    if (interfacePaths.has(entry.type.symbol.id)) {
      continue;
    }
    if (
      interfacePaths.size + visitedClassIds.size >=
        JAVA_REFERENCE_HIERARCHY_LIMITS.maximumVisitedTypes ||
      entry.path.length > JAVA_REFERENCE_HIERARCHY_LIMITS.maximumDepth
    ) {
      return null;
    }
    interfacePaths.set(entry.type.symbol.id, entry.path);
    const declared = selectDeclaredField(entry.type, entry.path, "unique-interface-owner");
    if (declared.state !== "absent") {
      candidatesByOwnerId.set(entry.type.symbol.id, {
        ownerType: entry.type,
        path: entry.path,
        selection: declared
      });
      continue;
    }
    const parentEdges = exactEdges(entry.type.symbol.id, "extends", "interface");
    if (parentEdges.length !== referenceCounts(entry.type.symbol.id).interfaceSuperinterfaces) {
      return null;
    }
    for (const edge of parentEdges) {
      const target = edge.targetId === null ? null : resolvedType(edge.targetId, "interface");
      if (target === null) {
        return null;
      }
      queue.push({ type: target, path: [...entry.path, edge] });
    }
  }

  const interfaceReaches = (sourceId: string, targetId: string): boolean | null => {
    const seen = new Set<string>([sourceId]);
    const pending: Array<{ readonly symbolId: string; readonly depth: number }> = [
      { symbolId: sourceId, depth: 0 }
    ];
    for (let index = 0; index < pending.length; index += 1) {
      const entry = pending[index]!;
      const parentEdges = exactEdges(entry.symbolId, "extends", "interface");
      if (parentEdges.length !== referenceCounts(entry.symbolId).interfaceSuperinterfaces) {
        return null;
      }
      for (const edge of parentEdges) {
        const parentId = edge.targetId;
        if (parentId === null || resolvedType(parentId, "interface") === null) {
          return null;
        }
        if (parentId === targetId) {
          return true;
        }
        if (seen.has(parentId)) {
          continue;
        }
        if (
          entry.depth >= JAVA_REFERENCE_HIERARCHY_LIMITS.maximumDepth ||
          seen.size >= JAVA_REFERENCE_HIERARCHY_LIMITS.maximumVisitedTypes ||
          pending.length >= JAVA_REFERENCE_HIERARCHY_LIMITS.maximumVisitedTypes
        ) {
          return null;
        }
        seen.add(parentId);
        pending.push({ symbolId: parentId, depth: entry.depth + 1 });
      }
    }
    return false;
  };
  const candidates = [...candidatesByOwnerId.values()];
  const nonDominated: InterfaceFieldCandidate[] = [];
  for (const candidate of candidates) {
    let dominated = false;
    for (const other of candidates) {
      if (other.ownerType.symbol.id === candidate.ownerType.symbol.id) {
        continue;
      }
      const reaches = interfaceReaches(other.ownerType.symbol.id, candidate.ownerType.symbol.id);
      if (reaches === null) {
        return null;
      }
      if (reaches) {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      nonDominated.push(candidate);
    }
  }
  const selected = nonDominated[0];
  return nonDominated.length === 1 && selected?.selection.state === "selected"
    ? selected.selection.plan
    : null;
}

export function projectJavaCallReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly signatureEdges: readonly GraphEdge[];
  readonly heritageEdges: readonly GraphEdge[];
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}, dependencies: JvmResolverDependencies): readonly GraphEdge[] {
  const resolverDependencies = dependencies;
  const typesBySymbolId = new Map<string, JvmResolvedType[]>();
  const callableDeclarationsBySymbolId = new Map<string, JavaCallableDeclarationFact[]>();
  const signatureReferences: JvmCallableSignatureReferenceFact[] = [];
  const chainedReferences: JavaChainedCallReferenceFact[] = [];
  const memberReferences: JavaMemberCallReferenceFact[] = [];
  const instantiationReferencesBySourceId = new Map<string, JavaInstantiationReferenceFact[]>();
  const fieldsByOwnerId = new Map<string, JavaFieldDeclarationFact[]>();
  const heritageReferenceCountsBySourceId = new Map<string, JavaHeritageReferenceCounts>();

  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    for (const fact of facts.jvmFacts?.types ?? []) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.kind !== "class" && symbol?.kind !== "interface") {
        continue;
      }
      const entries = typesBySymbolId.get(symbol.id) ?? [];
      entries.push({ fact, symbol });
      typesBySymbolId.set(symbol.id, entries);
    }
    for (const declaration of facts.jvmFacts?.javaCallableDeclarations ?? []) {
      const entries = callableDeclarationsBySymbolId.get(declaration.symbolId) ?? [];
      entries.push(declaration);
      callableDeclarationsBySymbolId.set(declaration.symbolId, entries);
    }
    signatureReferences.push(...(facts.jvmFacts?.callableSignatureReferences ?? []));
    chainedReferences.push(...(facts.jvmFacts?.javaChainedCallReferences ?? []));
    memberReferences.push(...(facts.jvmFacts?.javaMemberCallReferences ?? []));
    for (const reference of facts.jvmFacts?.javaInstantiationReferences ?? []) {
      const entries = instantiationReferencesBySourceId.get(reference.sourceId) ?? [];
      entries.push(reference);
      instantiationReferencesBySourceId.set(reference.sourceId, entries);
    }
    for (const reference of facts.jvmFacts?.heritageReferences ?? []) {
      const previous = heritageReferenceCountsBySourceId.get(reference.sourceId) ?? {
        classSuperclass: 0,
        classInterfaces: 0,
        interfaceSuperinterfaces: 0
      };
      heritageReferenceCountsBySourceId.set(reference.sourceId, {
        classSuperclass:
          previous.classSuperclass + (reference.syntax === "java-class-superclass" ? 1 : 0),
        classInterfaces:
          previous.classInterfaces + (reference.syntax === "java-class-interface" ? 1 : 0),
        interfaceSuperinterfaces:
          previous.interfaceSuperinterfaces +
          (reference.syntax === "java-interface-superinterface" ? 1 : 0)
      });
    }
    for (const field of facts.jvmFacts?.javaFieldDeclarations ?? []) {
      const entries = fieldsByOwnerId.get(field.declaringTypeId) ?? [];
      entries.push(field);
      fieldsByOwnerId.set(field.declaringTypeId, entries);
    }
  }

  const types = [...typesBySymbolId.values()]
    .filter((entries) => entries.length === 1 && entries[0] !== undefined)
    .map((entries) => entries[0] as JvmResolvedType)
    .sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
  const callableDeclarations = [...callableDeclarationsBySymbolId.values()]
    .filter((entries) => entries.length === 1 && entries[0] !== undefined)
    .map((entries) => entries[0] as JavaCallableDeclarationFact)
    .sort((left, right) => compareStableText(left.symbolId, right.symbolId));
  const membershipsByFile = jvmModuleMembershipsByFile(input.jvmProjectModuleEvidence);
  const heritageEdgesBySourceId = javaHeritageEdgesBySourceId(
    input.heritageEdges,
    typesBySymbolId
  );
  const edges: GraphEdge[] = [];

  for (const reference of [...memberReferences].sort((left, right) =>
    compareStableText(
      `${left.sourceId}\u0000${left.range.start.line}\u0000${left.range.start.column}`,
      `${right.sourceId}\u0000${right.range.start.line}\u0000${right.range.start.column}`
    )
  )) {
    const source = input.symbolsById.get(reference.sourceId);
    const callerDeclarations = callableDeclarationsBySymbolId.get(reference.sourceId) ?? [];
    const declaringTypeEntries = typesBySymbolId.get(reference.declaringTypeId) ?? [];
    if (
      source?.kind !== "method" ||
      callerDeclarations.length !== 1 ||
      callerDeclarations[0]?.declaringTypeId !== reference.declaringTypeId ||
      declaringTypeEntries.length !== 1 ||
      declaringTypeEntries[0] === undefined
    ) {
      continue;
    }
    const declaringType = declaringTypeEntries[0];
    const directSuperEdges =
      reference.receiverKind === "super"
        ? (heritageEdgesBySourceId.get(declaringType.symbol.id) ?? []).filter(
            (edge) =>
              edge.kind === "extends" &&
              edge.targetId !== null &&
              input.symbolsById.get(edge.targetId)?.kind === "class"
          )
        : [];
    if (reference.receiverKind === "super" && directSuperEdges.length !== 1) {
      continue;
    }
    const directSuperEdge = directSuperEdges[0];
    if (
      reference.receiverKind === "type-field" &&
      javaHierarchyFieldNameState({
        callerType: declaringType,
        fieldName: reference.receiverQualifierRootName,
        fieldsByOwnerId,
        heritageEdgesBySourceId,
        heritageReferenceCountsBySourceId,
        typesBySymbolId,
        symbolsById: input.symbolsById
      }) !== "absent"
    ) {
      continue;
    }
    if (
      reference.receiverKind === "type-name-static" &&
      javaHierarchyFieldNameState({
        callerType: declaringType,
        fieldName: reference.receiverName,
        fieldsByOwnerId,
        heritageEdgesBySourceId,
        heritageReferenceCountsBySourceId,
        typesBySymbolId,
        symbolsById: input.symbolsById
      }) !== "absent"
    ) {
      continue;
    }
    const resolvedOwnerType =
      reference.receiverKind === "type-field"
        ? resolveJavaCallType({
            dependencies: resolverDependencies,
            reference: reference.receiverOwnerType,
            declaringType,
            sourceFilePath: reference.filePath,
            types,
            membershipsByFile,
            projectEvidence: input.jvmProjectModuleEvidence
          })
        : null;
    const ownerTypeEntries =
      resolvedOwnerType?.evidence.targetSymbolId === undefined
        ? []
        : (typesBySymbolId.get(resolvedOwnerType.evidence.targetSymbolId) ?? []);
    const explicitOwnerType =
      ownerTypeEntries.length === 1 &&
      (ownerTypeEntries[0]?.symbol.kind === "class" ||
        ownerTypeEntries[0]?.symbol.kind === "interface")
        ? ownerTypeEntries[0]
        : undefined;
    if (reference.receiverKind === "type-field" && explicitOwnerType === undefined) {
      continue;
    }
    const fieldSelection =
      reference.receiverKind === "field" ||
      reference.receiverKind === "this-field" ||
      reference.receiverKind === "super-field" ||
      reference.receiverKind === "type-field"
        ? javaFieldSelectionPlan({
            callerType: declaringType,
            receiverKind: reference.receiverKind,
            ...(explicitOwnerType === undefined ? {} : { lookupType: explicitOwnerType }),
            fieldName: reference.receiverName,
            callerIsStatic: callerDeclarations[0]!.isStatic,
            fieldsByOwnerId,
            heritageEdgesBySourceId,
            heritageReferenceCountsBySourceId,
            typesBySymbolId,
            symbolsById: input.symbolsById
          })
        : null;
    const bindingTypeReference =
      reference.receiverKind === "field" ||
      reference.receiverKind === "this-field" ||
      reference.receiverKind === "super-field" ||
      reference.receiverKind === "type-field"
        ? fieldSelection?.field.type ?? null
        : reference.receiverKind === "parameter" ||
            reference.receiverKind === "type-name-static" ||
            reference.receiverKind === "local" ||
            reference.receiverKind === "enhanced-for" ||
            reference.receiverKind === "catch" ||
            reference.receiverKind === "lambda" ||
            reference.receiverKind === "instanceof-pattern" ||
            reference.receiverKind === "instanceof-and-pattern" ||
            reference.receiverKind === "instanceof-and-chain-pattern" ||
            reference.receiverKind === "instanceof-grouped-and-pattern" ||
            reference.receiverKind === "instanceof-negated-early-exit-pattern" ||
            reference.receiverKind === "instanceof-negated-target-exit-pattern" ||
            reference.receiverKind === "instanceof-negated-else-pattern" ||
            reference.receiverKind === "try-resource"
          ? reference.receiverType
          : null;
    const bindingDeclaringType = fieldSelection?.ownerType ?? declaringType;
    const resolvedBindingType =
      bindingTypeReference !== null
        ? resolveJavaCallType({
            dependencies: resolverDependencies,
            reference: bindingTypeReference,
            declaringType: bindingDeclaringType,
            sourceFilePath: bindingDeclaringType.symbol.filePath,
            types,
            membershipsByFile,
            projectEvidence: input.jvmProjectModuleEvidence
          })
        : null;
    const localInitializerRange =
      reference.receiverKind === "local" ? reference.receiverInitializerRange : undefined;
    const localInitializerRequiresWideningProof =
      reference.receiverKind === "local" &&
      localInitializerRange !== undefined &&
      !sourceRangeContains(localInitializerRange, reference.receiverType.range);
    const localInitializerCandidates =
      localInitializerRange === undefined
        ? []
        : (instantiationReferencesBySourceId.get(reference.sourceId) ?? []).filter(
            (candidate) =>
              candidate.filePath === reference.filePath &&
              candidate.declaringTypeId === reference.declaringTypeId &&
              sourceRangeContains(localInitializerRange, candidate.range)
          );
    const localInitializerReference =
      localInitializerCandidates.length === 1 ? localInitializerCandidates[0] : undefined;
    const resolvedLocalInitializerType =
      localInitializerReference === undefined
        ? null
        : resolveJavaCallType({
            dependencies: resolverDependencies,
            reference: {
              kind: "reference",
              referenceName: localInitializerReference.referenceName,
              syntax: "object-creation",
              range: localInitializerReference.range,
              ...(localInitializerReference.importedTypePath === undefined
                ? {}
                : { importedTypePath: localInitializerReference.importedTypePath }),
              ...(localInitializerReference.qualifiedTypePath === undefined
                ? {}
                : { qualifiedTypePath: localInitializerReference.qualifiedTypePath })
            },
            declaringType,
            sourceFilePath: reference.filePath,
            types,
            membershipsByFile,
            projectEvidence: input.jvmProjectModuleEvidence
          });
    const localInitializerWidening =
      resolvedLocalInitializerType?.evidence.targetSymbolId === undefined ||
      resolvedBindingType?.evidence.targetSymbolId === undefined
        ? null
        : javaReferenceWideningPath({
            sourceSymbolId: resolvedLocalInitializerType.evidence.targetSymbolId,
            targetSymbolId: resolvedBindingType.evidence.targetSymbolId,
            heritageEdgesBySourceId
          });
    // A declared local may name a supertype, but the initializer must still be
    // one uniquely retained direct object creation.  Require an indexed
    // assignability proof here instead of treating the declared type as a
    // compiler/checker guess; the bounded slice accepts identity or one direct
    // heritage edge only.
    if (
      localInitializerRequiresWideningProof &&
      (localInitializerReference === undefined ||
        resolvedLocalInitializerType === null ||
        localInitializerWidening?.state !== "matched" ||
        localInitializerWidening.edges.length > 1)
    ) {
      continue;
    }
    const assignmentTypeReference =
      reference.receiverKind === "local" ? reference.receiverAssignmentType : undefined;
    const assignmentRange =
      reference.receiverKind === "local" ? reference.receiverAssignmentRange : undefined;
    const assignmentInitializerRange =
      reference.receiverKind === "local"
        ? reference.receiverAssignmentInitializerRange
        : undefined;
    const resolvedAssignmentType =
      assignmentTypeReference === undefined
        ? null
        : resolveJavaCallType({
            dependencies: resolverDependencies,
            reference: assignmentTypeReference,
            declaringType,
            sourceFilePath: reference.filePath,
            types,
            membershipsByFile,
            projectEvidence: input.jvmProjectModuleEvidence
          });
    const assignmentWidening =
      resolvedAssignmentType?.evidence.targetSymbolId === undefined ||
      resolvedBindingType?.evidence.targetSymbolId === undefined
        ? null
        : javaReferenceWideningPath({
            sourceSymbolId: resolvedAssignmentType.evidence.targetSymbolId,
            targetSymbolId: resolvedBindingType.evidence.targetSymbolId,
            heritageEdgesBySourceId
          });
    const assignmentJoin =
      reference.receiverKind === "local" ? reference.receiverAssignmentJoin : undefined;
    const resolvedAssignmentJoinBranches =
      assignmentJoin === undefined
        ? []
        : assignmentJoin.branches.map((branch) => {
            const resolvedType = resolveJavaCallType({
              dependencies: resolverDependencies,
              reference: branch.type,
              declaringType,
              sourceFilePath: reference.filePath,
              types,
              membershipsByFile,
              projectEvidence: input.jvmProjectModuleEvidence
            });
            const widening =
              resolvedType?.evidence.targetSymbolId === undefined ||
              resolvedBindingType?.evidence.targetSymbolId === undefined
                ? null
                : javaReferenceWideningPath({
                    sourceSymbolId: resolvedType.evidence.targetSymbolId,
                    targetSymbolId: resolvedBindingType.evidence.targetSymbolId,
                    heritageEdgesBySourceId
                  });
            return { branch, resolvedType, widening };
          });
    const assignmentChain =
      reference.receiverKind === "local" ? reference.receiverAssignmentChain : undefined;
    const resolvedAssignmentChainBranches =
      assignmentChain === undefined
        ? []
        : assignmentChain.branches.map((branch) => {
            const resolvedType = resolveJavaCallType({
              dependencies: resolverDependencies,
              reference: branch.type,
              declaringType,
              sourceFilePath: reference.filePath,
              types,
              membershipsByFile,
              projectEvidence: input.jvmProjectModuleEvidence
            });
            const widening =
              resolvedType?.evidence.targetSymbolId === undefined ||
              resolvedBindingType?.evidence.targetSymbolId === undefined
                ? null
                : javaReferenceWideningPath({
                    sourceSymbolId: resolvedType.evidence.targetSymbolId,
                    targetSymbolId: resolvedBindingType.evidence.targetSymbolId,
                    heritageEdgesBySourceId
                  });
            return { branch, resolvedType, widening };
          });
    const switchAssignmentJoin =
      reference.receiverKind === "local" ? reference.receiverSwitchAssignmentJoin : undefined;
    const resolvedSwitchAssignmentArms =
      switchAssignmentJoin === undefined
        ? []
        : switchAssignmentJoin.arms.map((arm) => {
            const resolvedType = resolveJavaCallType({
              dependencies: resolverDependencies,
              reference: arm.type,
              declaringType,
              sourceFilePath: reference.filePath,
              types,
              membershipsByFile,
              projectEvidence: input.jvmProjectModuleEvidence
            });
            const widening =
              resolvedType?.evidence.targetSymbolId === undefined ||
              resolvedBindingType?.evidence.targetSymbolId === undefined
                ? null
                : javaReferenceWideningPath({
                    sourceSymbolId: resolvedType.evidence.targetSymbolId,
                    targetSymbolId: resolvedBindingType.evidence.targetSymbolId,
                    heritageEdgesBySourceId
                  });
            return { arm, resolvedType, widening };
          });
    const assignmentProofCount = [
      assignmentTypeReference,
      assignmentJoin,
      assignmentChain,
      switchAssignmentJoin
    ].filter((candidate) => candidate !== undefined).length;
    if (assignmentProofCount > 1) {
      continue;
    }
    if (
      assignmentTypeReference !== undefined &&
      (assignmentRange === undefined ||
        assignmentInitializerRange === undefined ||
        resolvedAssignmentType === null ||
        assignmentWidening?.state !== "matched")
    ) {
      continue;
    }
    if (
      assignmentJoin !== undefined &&
      (resolvedAssignmentJoinBranches.length !== 2 ||
        resolvedAssignmentJoinBranches.some(
          (branch) => branch.resolvedType === null || branch.widening?.state !== "matched"
        ))
    ) {
      continue;
    }
    const assignmentChainHasValidShape =
      assignmentChain !== undefined &&
      assignmentChain.bounds.maximumBranches ===
        JAVA_EXHAUSTIVE_ASSIGNMENT_JOIN_MAXIMUM_BRANCHES &&
      assignmentChain.bounds.observedBranches === assignmentChain.branches.length &&
      assignmentChain.branches.length >= 3 &&
      assignmentChain.branches.length <= JAVA_EXHAUSTIVE_ASSIGNMENT_JOIN_MAXIMUM_BRANCHES &&
      assignmentChain.branches.every((branch, index, branches) => {
        const expectedBranch =
          index === 0 ? "if" : index === branches.length - 1 ? "else" : "else-if";
        return (
          branch.ordinal === index &&
          branch.branch === expectedBranch &&
          (expectedBranch === "else"
            ? branch.conditionRange === undefined
            : branch.conditionRange !== undefined)
        );
      });
    if (
      assignmentChain !== undefined &&
      (!assignmentChainHasValidShape ||
        resolvedAssignmentChainBranches.length !== assignmentChain.branches.length ||
        resolvedAssignmentChainBranches.some(
          (branch) => branch.resolvedType === null || branch.widening?.state !== "matched"
        ))
    ) {
      continue;
    }
    const switchAssignmentHasValidShape =
      switchAssignmentJoin !== undefined &&
      switchAssignmentJoin.bounds.maximumArms === JAVA_EXHAUSTIVE_SWITCH_JOIN_MAXIMUM_ARMS &&
      switchAssignmentJoin.bounds.observedArms === switchAssignmentJoin.arms.length &&
      switchAssignmentJoin.arms.length >= 2 &&
      switchAssignmentJoin.arms.length <= JAVA_EXHAUSTIVE_SWITCH_JOIN_MAXIMUM_ARMS &&
      switchAssignmentJoin.arms.every(
        (arm, index, arms) =>
          arm.ordinal === index &&
          arm.arm === (index === arms.length - 1 ? "default" : "case")
      );
    if (
      switchAssignmentJoin !== undefined &&
      (!switchAssignmentHasValidShape ||
        resolvedSwitchAssignmentArms.length !== switchAssignmentJoin.arms.length ||
        resolvedSwitchAssignmentArms.some(
          (arm) => arm.resolvedType === null || arm.widening?.state !== "matched"
        ))
    ) {
      continue;
    }
    const receiverTypeSymbolId =
      reference.receiverKind === "this" ||
      reference.receiverKind === "implicit-static" ||
      reference.receiverKind === "implicit-instance"
        ? declaringType.symbol.id
        : reference.receiverKind === "super"
          ? directSuperEdge?.targetId
          : resolvedBindingType?.evidence.targetSymbolId;
    if (receiverTypeSymbolId === null || receiverTypeSymbolId === undefined) {
      continue;
    }
    const receiverTypeEntries = typesBySymbolId.get(receiverTypeSymbolId) ?? [];
    if (receiverTypeEntries.length !== 1) {
      continue;
    }
    const receiverSelectionPath = directSuperEdge === undefined ? [] : [directSuperEdge];
    const assignmentChainEvidenceBranches = resolvedAssignmentChainBranches.flatMap(
      ({ branch, resolvedType, widening }) =>
        resolvedType === null || widening?.state !== "matched"
          ? []
          : [
              {
                ordinal: branch.ordinal,
                branch: branch.branch,
                statementRange: branch.statementRange,
                ...(branch.conditionRange === undefined
                  ? {}
                  : { conditionRange: branch.conditionRange }),
                scopeRange: branch.scopeRange,
                assignmentRange: branch.assignmentRange,
                initializerRange: branch.initializerRange,
                valueType: resolvedType.evidence,
                compatibility:
                  widening.edges.length === 0
                    ? ("identity" as const)
                    : ("reference-widening" as const),
                hierarchyPath: widening.edges.map(javaHierarchySegmentEvidence),
                hierarchyBounds: JAVA_REFERENCE_HIERARCHY_LIMITS
              }
            ]
    );
    const switchAssignmentEvidenceArms = resolvedSwitchAssignmentArms.flatMap(
      ({ arm, resolvedType, widening }) =>
        resolvedType === null || widening?.state !== "matched"
          ? []
          : [
              {
                ordinal: arm.ordinal,
                arm: arm.arm,
                labelRange: arm.labelRange,
                assignmentRange: arm.assignmentRange,
                initializerRange: arm.initializerRange,
                valueType: resolvedType.evidence,
                compatibility:
                  widening.edges.length === 0
                    ? ("identity" as const)
                    : ("reference-widening" as const),
                hierarchyPath: widening.edges.map(javaHierarchySegmentEvidence),
                hierarchyBounds: JAVA_REFERENCE_HIERARCHY_LIMITS
              }
            ]
    );
    let receiverBinding: CallReceiverBindingEvidence | undefined;
    if (resolvedBindingType !== null) {
      if (reference.receiverKind === "type-field") {
        if (
          fieldSelection === null ||
          resolvedOwnerType === null ||
          explicitOwnerType === undefined ||
          !fieldSelection.field.isStatic
        ) {
          continue;
        }
        const bindingBase = {
          kind: "type-field" as const,
          name: reference.receiverName,
          type: resolvedBindingType.evidence,
          declarationRange: fieldSelection.field.declarationRange,
          scopeRange: fieldSelection.field.scopeRange,
          declaringTypeSymbolId: fieldSelection.ownerType.symbol.id,
          isStatic: true as const,
          isFinal: fieldSelection.field.isFinal,
          visibility: fieldSelection.field.visibility,
          modifierProof: fieldSelection.field.modifierProof,
          selectionReason: fieldSelection.selectionReason,
          ownerSelectionPath: fieldSelection.ownerSelectionPath.map(javaHierarchySegmentEvidence),
          hierarchyBounds: JAVA_REFERENCE_HIERARCHY_LIMITS,
          access: fieldSelection.access,
          qualifiedOwnerType: resolvedOwnerType.evidence
        };
        receiverBinding =
          explicitOwnerType.symbol.kind === "interface"
            ? {
                ...bindingBase,
                policy: "java-source-field-binding-v4",
                declaringTypeKind: "interface"
              }
            : {
                ...bindingBase,
                policy: "java-source-field-binding-v5",
                declaringTypeKind: fieldSelection.ownerType.symbol.kind as "class" | "interface",
                qualifiedOwnerTypeKind: "class"
              };
      } else if (
        reference.receiverKind === "field" ||
        reference.receiverKind === "this-field" ||
        reference.receiverKind === "super-field"
      ) {
        if (fieldSelection === null) {
          continue;
        }
        receiverBinding = {
          policy: "java-source-field-binding-v3",
          kind: reference.receiverKind,
          name: reference.receiverName,
          type: resolvedBindingType.evidence,
          declarationRange: fieldSelection.field.declarationRange,
          scopeRange: fieldSelection.field.scopeRange,
          declaringTypeSymbolId: fieldSelection.ownerType.symbol.id,
          declaringTypeKind: fieldSelection.ownerType.symbol.kind as "class" | "interface",
          isStatic: fieldSelection.field.isStatic,
          isFinal: fieldSelection.field.isFinal,
          visibility: fieldSelection.field.visibility,
          modifierProof: fieldSelection.field.modifierProof,
          selectionReason: fieldSelection.selectionReason,
          ownerSelectionPath: fieldSelection.ownerSelectionPath.map(javaHierarchySegmentEvidence),
          hierarchyBounds: JAVA_REFERENCE_HIERARCHY_LIMITS,
          access: fieldSelection.access
        };
      } else if (reference.receiverKind === "parameter") {
        receiverBinding = {
          policy: "java-source-lexical-binding-v1",
          kind: "parameter",
          name: reference.receiverName,
          type: resolvedBindingType.evidence,
          declarationRange: reference.receiverBindingRange,
          scopeRange: reference.receiverScopeRange
        };
      } else if (reference.receiverKind === "local") {
        const thenJoinBranch = resolvedAssignmentJoinBranches[0];
        const elseJoinBranch = resolvedAssignmentJoinBranches[1];
        receiverBinding =
          switchAssignmentJoin !== undefined &&
          switchAssignmentEvidenceArms.length === switchAssignmentJoin.arms.length
            ? {
                policy: "java-source-lexical-binding-v9",
                kind: "local",
                name: reference.receiverName,
                type: resolvedBindingType.evidence,
                typeSource: "declared-type-after-exhaustive-switch-rules",
                declarationRange: reference.receiverBindingRange,
                scopeRange: reference.receiverScopeRange,
                assignmentJoin: {
                  policy: "java-source-switch-rule-assignment-join-v1",
                  statementRange: switchAssignmentJoin.statementRange,
                  selectorRange: switchAssignmentJoin.selectorRange,
                  bounds: {
                    maximumArms: JAVA_EXHAUSTIVE_SWITCH_JOIN_MAXIMUM_ARMS,
                    observedArms: switchAssignmentJoin.arms.length
                  },
                  arms: switchAssignmentEvidenceArms
                }
              }
            : assignmentChain !== undefined &&
          assignmentChainEvidenceBranches.length === assignmentChain.branches.length
            ? {
                policy: "java-source-lexical-binding-v8",
                kind: "local",
                name: reference.receiverName,
                type: resolvedBindingType.evidence,
                typeSource: "declared-type-after-exhaustive-if-else-chain",
                declarationRange: reference.receiverBindingRange,
                scopeRange: reference.receiverScopeRange,
                assignmentJoin: {
                  policy: "java-source-if-else-chain-assignment-join-v1",
                  statementRange: assignmentChain.statementRange,
                  bounds: {
                    maximumBranches: JAVA_EXHAUSTIVE_ASSIGNMENT_JOIN_MAXIMUM_BRANCHES,
                    observedBranches: assignmentChain.branches.length
                  },
                  branches: assignmentChainEvidenceBranches
                }
              }
            : assignmentJoin !== undefined &&
              thenJoinBranch?.branch.branch === "then" &&
              thenJoinBranch.resolvedType !== null &&
              thenJoinBranch.widening?.state === "matched" &&
              elseJoinBranch?.branch.branch === "else" &&
              elseJoinBranch.resolvedType !== null &&
              elseJoinBranch.widening?.state === "matched"
            ? {
                policy: "java-source-lexical-binding-v7",
                kind: "local",
                name: reference.receiverName,
                type: resolvedBindingType.evidence,
                typeSource: "declared-type-after-exhaustive-if-else",
                declarationRange: reference.receiverBindingRange,
                scopeRange: reference.receiverScopeRange,
                assignmentJoin: {
                  policy: "java-source-if-else-assignment-join-v1",
                  statementRange: assignmentJoin.statementRange,
                  conditionRange: assignmentJoin.conditionRange,
                  branches: [
                    {
                      branch: "then",
                      scopeRange: thenJoinBranch.branch.scopeRange,
                      assignmentRange: thenJoinBranch.branch.assignmentRange,
                      initializerRange: thenJoinBranch.branch.initializerRange,
                      valueType: thenJoinBranch.resolvedType.evidence,
                      compatibility:
                        thenJoinBranch.widening.edges.length === 0
                          ? "identity"
                          : "reference-widening",
                      hierarchyPath:
                        thenJoinBranch.widening.edges.map(javaHierarchySegmentEvidence),
                      hierarchyBounds: JAVA_REFERENCE_HIERARCHY_LIMITS
                    },
                    {
                      branch: "else",
                      scopeRange: elseJoinBranch.branch.scopeRange,
                      assignmentRange: elseJoinBranch.branch.assignmentRange,
                      initializerRange: elseJoinBranch.branch.initializerRange,
                      valueType: elseJoinBranch.resolvedType.evidence,
                      compatibility:
                        elseJoinBranch.widening.edges.length === 0
                          ? "identity"
                          : "reference-widening",
                      hierarchyPath:
                        elseJoinBranch.widening.edges.map(javaHierarchySegmentEvidence),
                      hierarchyBounds: JAVA_REFERENCE_HIERARCHY_LIMITS
                    }
                  ]
                }
              }
            : assignmentTypeReference !== undefined &&
          assignmentRange !== undefined &&
          assignmentInitializerRange !== undefined &&
          resolvedAssignmentType !== null &&
          assignmentWidening?.state === "matched"
            ? {
                policy: "java-source-lexical-binding-v6",
                kind: "local",
                name: reference.receiverName,
                type: resolvedBindingType.evidence,
                typeSource: "declared-type-after-direct-assignment",
                declarationRange: reference.receiverBindingRange,
                scopeRange: reference.receiverScopeRange,
                assignment: {
                  policy: "java-source-direct-assignment-v1",
                  range: assignmentRange,
                  initializerRange: assignmentInitializerRange,
                  valueType: resolvedAssignmentType.evidence,
                  compatibility:
                    assignmentWidening.edges.length === 0 ? "identity" : "reference-widening",
                  hierarchyPath: assignmentWidening.edges.map(javaHierarchySegmentEvidence),
                  hierarchyBounds: JAVA_REFERENCE_HIERARCHY_LIMITS
                }
              }
            : reference.receiverInitializerRange === undefined
              ? {
                  policy: "java-source-lexical-binding-v1",
                  kind: "local",
                  name: reference.receiverName,
                  type: resolvedBindingType.evidence,
                  declarationRange: reference.receiverBindingRange,
                  scopeRange: reference.receiverScopeRange
                }
              : {
                  policy: "java-source-lexical-binding-v2",
                  kind: "local",
                  name: reference.receiverName,
                  type: resolvedBindingType.evidence,
                  typeSource: "object-creation-initializer",
                  declarationRange: reference.receiverBindingRange,
                  initializerRange: reference.receiverInitializerRange,
                  scopeRange: reference.receiverScopeRange
                };
      } else if (
        reference.receiverKind === "enhanced-for" ||
        reference.receiverKind === "catch" ||
        reference.receiverKind === "lambda"
      ) {
        receiverBinding = {
          policy: "java-source-lexical-binding-v3",
          kind: reference.receiverKind,
          name: reference.receiverName,
          type: resolvedBindingType.evidence,
          typeSource: "declared-type",
          declarationRange: reference.receiverBindingRange,
          scopeRange: reference.receiverScopeRange
        };
      } else if (reference.receiverKind === "instanceof-pattern") {
        receiverBinding = {
          policy: "java-source-lexical-binding-v10",
          kind: "instanceof-pattern",
          name: reference.receiverName,
          type: resolvedBindingType.evidence,
          typeSource: "instanceof-pattern",
          declarationRange: reference.receiverBindingRange,
          scopeRange: reference.receiverScopeRange,
          conditionRange: reference.receiverConditionRange,
          testedValueRange: reference.receiverTestedValueRange
        };
      } else if (reference.receiverKind === "instanceof-and-pattern") {
        receiverBinding = {
          policy: "java-source-lexical-binding-v11",
          kind: "instanceof-and-pattern",
          name: reference.receiverName,
          type: resolvedBindingType.evidence,
          typeSource: "instanceof-pattern",
          declarationRange: reference.receiverBindingRange,
          scopeRange: reference.receiverScopeRange,
          conditionRange: reference.receiverConditionRange,
          testedValueRange: reference.receiverTestedValueRange,
          rightOperandRange: reference.receiverRightOperandRange,
          trueBlockRange: reference.receiverTrueBlockRange
        };
      } else if (reference.receiverKind === "instanceof-and-chain-pattern") {
        receiverBinding = {
          policy: "java-source-lexical-binding-v12",
          kind: "instanceof-and-chain-pattern",
          name: reference.receiverName,
          type: resolvedBindingType.evidence,
          typeSource: "instanceof-pattern",
          declarationRange: reference.receiverBindingRange,
          scopeRange: reference.receiverScopeRange,
          conditionRange: reference.receiverConditionRange,
          testedValueRange: reference.receiverTestedValueRange,
          logicalOperandRanges: reference.receiverLogicalOperandRanges,
          activeOperandRange: reference.receiverActiveOperandRange,
          activeOperandOrdinal: reference.receiverActiveOperandOrdinal,
          trueBlockRange: reference.receiverTrueBlockRange,
          operandCount: reference.receiverOperandCount,
          maximumOperands: reference.receiverMaximumOperands
        };
      } else if (reference.receiverKind === "instanceof-grouped-and-pattern") {
        receiverBinding = {
          policy: "java-source-lexical-binding-v13",
          kind: "instanceof-grouped-and-pattern",
          name: reference.receiverName,
          type: resolvedBindingType.evidence,
          typeSource: "instanceof-pattern",
          declarationRange: reference.receiverBindingRange,
          scopeRange: reference.receiverScopeRange,
          conditionRange: reference.receiverConditionRange,
          testedValueRange: reference.receiverTestedValueRange,
          logicalOperandRanges: reference.receiverLogicalOperandRanges,
          logicalOperandGroupingPaths: reference.receiverLogicalOperandGroupingPaths,
          groupingRanges: reference.receiverGroupingRanges,
          activeOperandRange: reference.receiverActiveOperandRange,
          activeOperandOrdinal: reference.receiverActiveOperandOrdinal,
          trueBlockRange: reference.receiverTrueBlockRange,
          operandCount: reference.receiverOperandCount,
          maximumOperands: reference.receiverMaximumOperands
        };
      } else if (reference.receiverKind === "instanceof-negated-early-exit-pattern") {
        const receiverBindingBase = {
          kind: "instanceof-negated-early-exit-pattern" as const,
          name: reference.receiverName,
          type: resolvedBindingType.evidence,
          typeSource: "instanceof-pattern" as const,
          declarationRange: reference.receiverBindingRange,
          scopeRange: reference.receiverScopeRange,
          conditionRange: reference.receiverConditionRange,
          testedValueRange: reference.receiverTestedValueRange,
          negatedPatternRange: reference.receiverNegatedPatternRange,
          negationGroupingRanges: reference.receiverNegationGroupingRanges,
          maximumGroupingDepth: reference.receiverMaximumGroupingDepth,
          guardStatementRange: reference.receiverGuardStatementRange,
          exitBodyKind: reference.receiverExitBodyKind,
          exitBodyRange: reference.receiverExitBodyRange,
          abruptCompletionKind: reference.receiverAbruptCompletionKind,
          abruptStatementRange: reference.receiverAbruptStatementRange
        };
        if (
          reference.receiverAbruptWrapperKind === "try-finally" &&
          reference.receiverAbruptWrapperRange !== null &&
          reference.receiverAbruptWrapperTryBodyRange !== null &&
          reference.receiverAbruptWrapperFinallyRange !== null &&
          reference.receiverAbruptWrapperFinallyBodyRange !== null
        ) {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v24",
            abruptTargetKind: null,
            abruptTargetRange: null,
            abruptTargetBodyRange: null,
            abruptTargetCaseGroupRange: null,
            abruptTargetCaseLabelRanges: [],
            abruptTargetRuleRange: null,
            abruptTargetRuleBodyRange: null,
            abruptTargetRuleLabelRange: null,
            abruptTargetExpressionContext: null,
            abruptTargetLabel: null,
            abruptTargetLabelRange: null,
            abruptWrapperKind: "try-finally",
            abruptWrapperPolicy: "java-source-transparent-finally-v1",
            abruptWrapperRange: reference.receiverAbruptWrapperRange,
            abruptWrapperTryBodyRange: reference.receiverAbruptWrapperTryBodyRange,
            abruptWrapperFinallyRange: reference.receiverAbruptWrapperFinallyRange,
            abruptWrapperFinallyBodyRange: reference.receiverAbruptWrapperFinallyBodyRange,
            abruptWrapperFinallyStatementRanges:
              reference.receiverAbruptWrapperFinallyStatementRanges,
            abruptWrapperBounds: {
              maximumFinallyStatements:
                reference.receiverAbruptWrapperMaximumFinallyStatements,
              observedFinallyStatements:
                reference.receiverAbruptWrapperFinallyStatementRanges.length
            }
          };
        } else {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v14"
          };
        }
      } else if (reference.receiverKind === "instanceof-negated-target-exit-pattern") {
        const receiverBindingBase = {
          kind: "instanceof-negated-target-exit-pattern",
          name: reference.receiverName,
          type: resolvedBindingType.evidence,
          typeSource: "instanceof-pattern",
          declarationRange: reference.receiverBindingRange,
          scopeRange: reference.receiverScopeRange,
          conditionRange: reference.receiverConditionRange,
          testedValueRange: reference.receiverTestedValueRange,
          negatedPatternRange: reference.receiverNegatedPatternRange,
          negationGroupingRanges: reference.receiverNegationGroupingRanges,
          maximumGroupingDepth: reference.receiverMaximumGroupingDepth,
          guardStatementRange: reference.receiverGuardStatementRange,
          exitBodyKind: reference.receiverExitBodyKind,
          exitBodyRange: reference.receiverExitBodyRange,
          abruptCompletionKind: reference.receiverAbruptCompletionKind,
          abruptStatementRange: reference.receiverAbruptStatementRange
        } as const;
        if (
          reference.receiverAbruptWrapperKind === "try-finally" &&
          reference.receiverAbruptWrapperRange !== null &&
          reference.receiverAbruptWrapperTryBodyRange !== null &&
          reference.receiverAbruptWrapperFinallyRange !== null &&
          reference.receiverAbruptWrapperFinallyBodyRange !== null
        ) {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v24",
            abruptTargetKind: reference.receiverAbruptTargetKind,
            abruptTargetRange: reference.receiverAbruptTargetRange,
            abruptTargetBodyRange: reference.receiverAbruptTargetBodyRange,
            abruptTargetCaseGroupRange: reference.receiverAbruptTargetCaseGroupRange,
            abruptTargetCaseLabelRanges: reference.receiverAbruptTargetCaseLabelRanges,
            abruptTargetRuleRange: reference.receiverAbruptTargetRuleRange,
            abruptTargetRuleBodyRange: reference.receiverAbruptTargetRuleBodyRange,
            abruptTargetRuleLabelRange: reference.receiverAbruptTargetRuleLabelRange,
            abruptTargetExpressionContext: reference.receiverAbruptTargetExpressionContext,
            abruptTargetLabel: reference.receiverAbruptTargetLabel,
            abruptTargetLabelRange: reference.receiverAbruptTargetLabelRange,
            abruptWrapperKind: "try-finally",
            abruptWrapperPolicy: "java-source-transparent-finally-v1",
            abruptWrapperRange: reference.receiverAbruptWrapperRange,
            abruptWrapperTryBodyRange: reference.receiverAbruptWrapperTryBodyRange,
            abruptWrapperFinallyRange: reference.receiverAbruptWrapperFinallyRange,
            abruptWrapperFinallyBodyRange: reference.receiverAbruptWrapperFinallyBodyRange,
            abruptWrapperFinallyStatementRanges:
              reference.receiverAbruptWrapperFinallyStatementRanges,
            abruptWrapperBounds: {
              maximumFinallyStatements:
                reference.receiverAbruptWrapperMaximumFinallyStatements,
              observedFinallyStatements:
                reference.receiverAbruptWrapperFinallyStatementRanges.length
            }
          };
        } else if (
          reference.receiverAbruptTargetKind === "switch-expression" &&
          reference.receiverAbruptCompletionKind === "yield" &&
          reference.receiverAbruptTargetRuleRange !== null &&
          reference.receiverAbruptTargetRuleBodyRange !== null &&
          reference.receiverAbruptTargetRuleLabelRange !== null &&
          reference.receiverAbruptTargetExpressionContext !== null
        ) {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v22",
            abruptCompletionKind: "yield",
            abruptTargetKind: "switch-expression",
            abruptTargetRange: reference.receiverAbruptTargetRange,
            abruptTargetBodyRange: reference.receiverAbruptTargetBodyRange,
            abruptTargetRuleRange: reference.receiverAbruptTargetRuleRange,
            abruptTargetRuleBodyRange: reference.receiverAbruptTargetRuleBodyRange,
            abruptTargetRuleLabelRange: reference.receiverAbruptTargetRuleLabelRange,
            abruptTargetExpressionContext: reference.receiverAbruptTargetExpressionContext
          };
        } else if (
          reference.receiverAbruptTargetKind === "switch" &&
          reference.receiverAbruptCompletionKind === "break" &&
          reference.receiverAbruptTargetCaseGroupRange !== null
        ) {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v20",
            abruptTargetKind: "switch",
            abruptTargetRange: reference.receiverAbruptTargetRange,
            abruptTargetBodyRange: reference.receiverAbruptTargetBodyRange,
            abruptTargetCaseGroupRange: reference.receiverAbruptTargetCaseGroupRange,
            abruptTargetCaseLabelRanges: reference.receiverAbruptTargetCaseLabelRanges,
            abruptCompletionKind: "break"
          };
        } else if (
          reference.receiverAbruptTargetKind !== "switch" &&
          reference.receiverAbruptTargetKind !== "switch-expression" &&
          (reference.receiverAbruptCompletionKind === "break" ||
            reference.receiverAbruptCompletionKind === "continue") &&
          reference.receiverAbruptTargetLabel !== null &&
          reference.receiverAbruptTargetLabelRange !== null
        ) {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v18",
            abruptTargetKind: reference.receiverAbruptTargetKind,
            abruptTargetRange: reference.receiverAbruptTargetRange,
            abruptTargetBodyRange: reference.receiverAbruptTargetBodyRange,
            abruptTargetLabel: reference.receiverAbruptTargetLabel,
            abruptTargetLabelRange: reference.receiverAbruptTargetLabelRange,
            abruptCompletionKind:
              reference.receiverAbruptCompletionKind === "break" ? "break" : "continue"
          };
        } else if (
          (reference.receiverAbruptCompletionKind === "break" ||
            reference.receiverAbruptCompletionKind === "continue") &&
          (reference.receiverAbruptTargetKind === "while" ||
            reference.receiverAbruptTargetKind === "do" ||
            reference.receiverAbruptTargetKind === "for" ||
            reference.receiverAbruptTargetKind === "enhanced-for")
        ) {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v16",
            abruptTargetKind: reference.receiverAbruptTargetKind,
            abruptTargetRange: reference.receiverAbruptTargetRange,
            abruptCompletionKind:
              reference.receiverAbruptCompletionKind === "break" ? "break" : "continue"
          };
        }
      } else if (reference.receiverKind === "instanceof-negated-else-pattern") {
        const receiverBindingBase = {
          kind: "instanceof-negated-else-pattern" as const,
          name: reference.receiverName,
          type: resolvedBindingType.evidence,
          typeSource: "instanceof-pattern" as const,
          declarationRange: reference.receiverBindingRange,
          scopeRange: reference.receiverScopeRange,
          conditionRange: reference.receiverConditionRange,
          testedValueRange: reference.receiverTestedValueRange,
          negatedPatternRange: reference.receiverNegatedPatternRange,
          negationGroupingRanges: reference.receiverNegationGroupingRanges,
          maximumGroupingDepth: reference.receiverMaximumGroupingDepth,
          guardStatementRange: reference.receiverGuardStatementRange,
          thenBodyKind: reference.receiverThenBodyKind,
          thenBodyRange: reference.receiverThenBodyRange,
          elseBodyKind: reference.receiverElseBodyKind,
          elseBodyRange: reference.receiverElseBodyRange,
          activeRegion: reference.receiverActiveRegion
        };
        if (
          reference.receiverThenAbruptCompletionKind !== null &&
          reference.receiverThenAbruptStatementRange !== null &&
          reference.receiverThenAbruptWrapperKind === "try-finally" &&
          reference.receiverThenAbruptWrapperRange !== null &&
          reference.receiverThenAbruptWrapperTryBodyRange !== null &&
          reference.receiverThenAbruptWrapperFinallyRange !== null &&
          reference.receiverThenAbruptWrapperFinallyBodyRange !== null
        ) {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v25",
            thenAbruptCompletionKind: reference.receiverThenAbruptCompletionKind,
            thenAbruptStatementRange: reference.receiverThenAbruptStatementRange,
            thenAbruptTargetKind: reference.receiverThenAbruptTargetKind,
            thenAbruptTargetRange: reference.receiverThenAbruptTargetRange,
            thenAbruptTargetBodyRange: reference.receiverThenAbruptTargetBodyRange,
            thenAbruptTargetCaseGroupRange:
              reference.receiverThenAbruptTargetCaseGroupRange,
            thenAbruptTargetCaseLabelRanges:
              reference.receiverThenAbruptTargetCaseLabelRanges,
            thenAbruptTargetRuleRange: reference.receiverThenAbruptTargetRuleRange,
            thenAbruptTargetRuleBodyRange:
              reference.receiverThenAbruptTargetRuleBodyRange,
            thenAbruptTargetRuleLabelRange:
              reference.receiverThenAbruptTargetRuleLabelRange,
            thenAbruptTargetExpressionContext:
              reference.receiverThenAbruptTargetExpressionContext,
            thenAbruptTargetLabel: reference.receiverThenAbruptTargetLabel,
            thenAbruptTargetLabelRange: reference.receiverThenAbruptTargetLabelRange,
            thenAbruptWrapperKind: "try-finally",
            thenAbruptWrapperPolicy: "java-source-transparent-finally-v1",
            thenAbruptWrapperRange: reference.receiverThenAbruptWrapperRange,
            thenAbruptWrapperTryBodyRange:
              reference.receiverThenAbruptWrapperTryBodyRange,
            thenAbruptWrapperFinallyRange:
              reference.receiverThenAbruptWrapperFinallyRange,
            thenAbruptWrapperFinallyBodyRange:
              reference.receiverThenAbruptWrapperFinallyBodyRange,
            thenAbruptWrapperFinallyStatementRanges:
              reference.receiverThenAbruptWrapperFinallyStatementRanges,
            thenAbruptWrapperBounds: {
              maximumFinallyStatements:
                reference.receiverThenAbruptWrapperMaximumFinallyStatements,
              observedFinallyStatements:
                reference.receiverThenAbruptWrapperFinallyStatementRanges.length
            }
          };
        } else if (
          reference.receiverThenAbruptCompletionKind === "yield" &&
          reference.receiverThenAbruptStatementRange !== null &&
          reference.receiverThenAbruptTargetKind === "switch-expression" &&
          reference.receiverThenAbruptTargetRange !== null &&
          reference.receiverThenAbruptTargetBodyRange !== null &&
          reference.receiverThenAbruptTargetRuleRange !== null &&
          reference.receiverThenAbruptTargetRuleBodyRange !== null &&
          reference.receiverThenAbruptTargetRuleLabelRange !== null &&
          reference.receiverThenAbruptTargetExpressionContext !== null
        ) {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v23",
            thenAbruptCompletionKind: "yield",
            thenAbruptStatementRange: reference.receiverThenAbruptStatementRange,
            thenAbruptTargetKind: "switch-expression",
            thenAbruptTargetRange: reference.receiverThenAbruptTargetRange,
            thenAbruptTargetBodyRange: reference.receiverThenAbruptTargetBodyRange,
            thenAbruptTargetRuleRange: reference.receiverThenAbruptTargetRuleRange,
            thenAbruptTargetRuleBodyRange: reference.receiverThenAbruptTargetRuleBodyRange,
            thenAbruptTargetRuleLabelRange: reference.receiverThenAbruptTargetRuleLabelRange,
            thenAbruptTargetExpressionContext:
              reference.receiverThenAbruptTargetExpressionContext
          };
        } else if (
          reference.receiverThenAbruptCompletionKind === "break" &&
          reference.receiverThenAbruptStatementRange !== null &&
          reference.receiverThenAbruptTargetKind === "switch" &&
          reference.receiverThenAbruptTargetRange !== null &&
          reference.receiverThenAbruptTargetBodyRange !== null &&
          reference.receiverThenAbruptTargetCaseGroupRange !== null
        ) {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v21",
            thenAbruptCompletionKind: "break",
            thenAbruptStatementRange: reference.receiverThenAbruptStatementRange,
            thenAbruptTargetKind: "switch",
            thenAbruptTargetRange: reference.receiverThenAbruptTargetRange,
            thenAbruptTargetBodyRange: reference.receiverThenAbruptTargetBodyRange,
            thenAbruptTargetCaseGroupRange: reference.receiverThenAbruptTargetCaseGroupRange,
            thenAbruptTargetCaseLabelRanges: reference.receiverThenAbruptTargetCaseLabelRanges
          };
        } else if (
          (reference.receiverThenAbruptCompletionKind === "break" ||
            reference.receiverThenAbruptCompletionKind === "continue") &&
          reference.receiverThenAbruptStatementRange !== null &&
          reference.receiverThenAbruptTargetKind !== null &&
          reference.receiverThenAbruptTargetKind !== "switch" &&
          reference.receiverThenAbruptTargetKind !== "switch-expression" &&
          reference.receiverThenAbruptTargetRange !== null &&
          reference.receiverThenAbruptTargetBodyRange !== null &&
          reference.receiverThenAbruptTargetLabel !== null &&
          reference.receiverThenAbruptTargetLabelRange !== null
        ) {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v19",
            thenAbruptCompletionKind: reference.receiverThenAbruptCompletionKind,
            thenAbruptStatementRange: reference.receiverThenAbruptStatementRange,
            thenAbruptTargetKind: reference.receiverThenAbruptTargetKind,
            thenAbruptTargetRange: reference.receiverThenAbruptTargetRange,
            thenAbruptTargetBodyRange: reference.receiverThenAbruptTargetBodyRange,
            thenAbruptTargetLabel: reference.receiverThenAbruptTargetLabel,
            thenAbruptTargetLabelRange: reference.receiverThenAbruptTargetLabelRange
          };
        } else if (
          (reference.receiverThenAbruptCompletionKind === "break" ||
            reference.receiverThenAbruptCompletionKind === "continue") &&
          reference.receiverThenAbruptStatementRange !== null &&
          reference.receiverThenAbruptTargetRange !== null &&
          (reference.receiverThenAbruptTargetKind === "while" ||
            reference.receiverThenAbruptTargetKind === "do" ||
            reference.receiverThenAbruptTargetKind === "for" ||
            reference.receiverThenAbruptTargetKind === "enhanced-for")
        ) {
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v17",
            thenAbruptCompletionKind: reference.receiverThenAbruptCompletionKind,
            thenAbruptStatementRange: reference.receiverThenAbruptStatementRange,
            thenAbruptTargetKind: reference.receiverThenAbruptTargetKind,
            thenAbruptTargetRange: reference.receiverThenAbruptTargetRange
          };
        } else {
          const thenAbruptCompletionKind =
            reference.receiverThenAbruptCompletionKind === "break" ||
            reference.receiverThenAbruptCompletionKind === "continue" ||
            reference.receiverThenAbruptCompletionKind === "yield"
              ? null
              : reference.receiverThenAbruptCompletionKind;
          receiverBinding = {
            ...receiverBindingBase,
            policy: "java-source-lexical-binding-v15",
            thenAbruptCompletionKind,
            thenAbruptStatementRange:
              thenAbruptCompletionKind === null
                ? null
                : reference.receiverThenAbruptStatementRange
          };
        }
      } else if (reference.receiverKind === "try-resource") {
        receiverBinding =
          reference.receiverInitializerRange === undefined
            ? {
                policy: "java-source-lexical-binding-v5",
                kind: "try-resource",
                name: reference.receiverName,
                type: resolvedBindingType.evidence,
                typeSource: "declared-type",
                resourceOrdinal: reference.receiverResourceOrdinal,
                visibility: "later-resources-and-try-body",
                tryBodyRange: reference.receiverTryBodyRange,
                declarationRange: reference.receiverBindingRange,
                scopeRange: reference.receiverScopeRange
              }
            : {
                policy: "java-source-lexical-binding-v5",
                kind: "try-resource",
                name: reference.receiverName,
                type: resolvedBindingType.evidence,
                typeSource: "object-creation-initializer",
                resourceOrdinal: reference.receiverResourceOrdinal,
                visibility: "later-resources-and-try-body",
                tryBodyRange: reference.receiverTryBodyRange,
                declarationRange: reference.receiverBindingRange,
                initializerRange: reference.receiverInitializerRange,
                scopeRange: reference.receiverScopeRange
              };
      }
    }
    const methodSetPlan = javaMethodSetPlan({
      receiverTypeSymbolId,
      ...(reference.receiverKind === "super"
        ? { accessReceiverTypeSymbolId: declaringType.symbol.id, receiverSelectionPath }
        : {}),
      ...(receiverBinding === undefined ? {} : { receiverBinding }),
      callerType: declaringType,
      methodName: reference.methodName,
      invocationKind: reference.receiverKind,
      callableDeclarations,
      heritageEdgesBySourceId,
      typesBySymbolId,
      symbolsById: input.symbolsById
    });
    if (methodSetPlan === null) {
      continue;
    }
    const methodPlan = javaCallPlan({
      dependencies: resolverDependencies,
      declarations: methodSetPlan.declarations,
      actualArgumentCount: reference.argumentCount,
      argumentTypes: reference.argumentTypes,
      callerType: declaringType,
      typesBySymbolId,
      types,
      heritageEdgesBySourceId,
      symbolsById: input.symbolsById,
      membershipsByFile,
      projectEvidence: input.jvmProjectModuleEvidence
    });
    if (methodPlan === null) {
      continue;
    }
    const method = input.symbolsById.get(methodPlan.selected.symbolId);
    const methodSetEntry = methodSetPlan.entriesBySymbolId.get(methodPlan.selected.symbolId);
    const accessEvidence = methodSetEntry?.evidence.access;
    if (method?.kind !== "method" || methodSetEntry === undefined || accessEvidence === undefined) {
      continue;
    }
    const configurationPaths = resolverDependencies.uniqueConfigurationPaths([
      resolvedOwnerType?.configurationPaths ?? [],
      resolvedBindingType?.configurationPaths ?? [],
      ...resolvedAssignmentJoinBranches.map(
        (branch) => branch.resolvedType?.configurationPaths ?? []
      ),
      ...resolvedAssignmentJoinBranches.flatMap((branch) =>
        branch.widening?.state === "matched"
          ? branch.widening.edges.map((edge) => edge.evidence?.configurationPaths ?? [])
          : []
      ),
      ...resolvedAssignmentChainBranches.map(
        (branch) => branch.resolvedType?.configurationPaths ?? []
      ),
      ...resolvedAssignmentChainBranches.flatMap((branch) =>
        branch.widening?.state === "matched"
          ? branch.widening.edges.map((edge) => edge.evidence?.configurationPaths ?? [])
          : []
      ),
      ...(fieldSelection?.ownerSelectionPath.map(
        (edge) => edge.evidence?.configurationPaths ?? []
      ) ?? []),
      methodPlan.configurationPaths,
      ...methodSetEntry.hierarchyEdges.map((edge) => edge.evidence?.configurationPaths ?? [])
    ]);
    const sourcePaths = [
      ...new Set([
        reference.filePath,
        method.filePath,
        ...(resolvedOwnerType?.sourcePaths ?? []),
        ...(resolvedBindingType?.sourcePaths ?? []),
        ...resolvedAssignmentJoinBranches.flatMap(
          (branch) => branch.resolvedType?.sourcePaths ?? []
        ),
        ...resolvedAssignmentJoinBranches.flatMap((branch) =>
          branch.widening?.state === "matched"
            ? branch.widening.edges.flatMap((edge) => [
                edge.filePath,
                ...(edge.evidence?.resolutionPath ?? [])
              ])
            : []
        ),
        ...resolvedAssignmentChainBranches.flatMap(
          (branch) => branch.resolvedType?.sourcePaths ?? []
        ),
        ...resolvedAssignmentChainBranches.flatMap((branch) =>
          branch.widening?.state === "matched"
            ? branch.widening.edges.flatMap((edge) => [
                edge.filePath,
                ...(edge.evidence?.resolutionPath ?? [])
              ])
            : []
        ),
        ...(fieldSelection?.ownerSelectionPath.flatMap((edge) => [
          edge.filePath,
          ...(edge.evidence?.resolutionPath ?? [])
        ]) ?? []),
        ...methodPlan.sourcePaths,
        ...methodSetEntry.hierarchyEdges.flatMap((edge) => [
          edge.filePath,
          ...(edge.evidence?.resolutionPath ?? [])
        ])
      ])
    ].sort(compareStableText);
    edges.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: method.id,
        kind: "calls",
        line: reference.range.start.line,
        column: reference.range.start.column,
        referenceName: reference.methodName
      }),
      sourceId: source.id,
      targetId: method.id,
      kind: "calls",
      filePath: reference.filePath,
      range: reference.range,
      resolution: "exact",
      confidence: 1,
      referenceName: reference.methodName,
      evidence: {
        ...resolverDependencies.referenceEvidence(
          `call.java.member.${reference.receiverKind}.${
            reference.receiverKind === "implicit-instance"
              ? methodPlan.selected.isStatic
                ? "static-binding."
                : methodPlan.selected.isFinal === true
                  ? "final-binding."
                  : "private-binding."
              : ""
          }${methodPlan.selection}.${
            methodSetEntry.inherited ? "inherited-dispatch" : "direct-dispatch"
          }`,
          "module",
          [methodPlan.selected.symbolId],
          configurationPaths,
          sourcePaths
        ),
        callArity: methodPlan.arityEvidence,
        callType: methodPlan.typeEvidence,
        callAccess: accessEvidence,
        callDispatch: methodSetEntry.evidence
      }
    });
  }

  for (const reference of [...chainedReferences].sort((left, right) =>
    compareStableText(
      `${left.sourceId}\u0000${left.range.start.line}\u0000${left.range.start.column}`,
      `${right.sourceId}\u0000${right.range.start.line}\u0000${right.range.start.column}`
    )
  )) {
    const source = input.symbolsById.get(reference.sourceId);
    const callerDeclarations = callableDeclarationsBySymbolId.get(reference.sourceId) ?? [];
    const declaringTypeEntries = typesBySymbolId.get(reference.declaringTypeId) ?? [];
    if (
      source?.kind !== "method" ||
      callerDeclarations.length !== 1 ||
      callerDeclarations[0]?.declaringTypeId !== reference.declaringTypeId ||
      declaringTypeEntries.length !== 1 ||
      declaringTypeEntries[0] === undefined
    ) {
      continue;
    }
    const declaringType = declaringTypeEntries[0];
    const targetTypePath = reference.qualifiedTypePath ?? reference.importedTypePath;
    const resolutionProof =
      reference.qualifiedTypePath !== undefined
        ? "qualified-type"
        : reference.importedTypePath !== undefined
          ? "explicit-import"
          : "same-package";
    const receiverCandidates = types.filter((candidate) =>
      targetTypePath === undefined
        ? candidate.fact.packageName === declaringType.fact.packageName &&
          candidate.symbol.name === reference.receiverTypeName
        : jvmTypePath(candidate) === targetTypePath
    );
    if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) {
      continue;
    }
    const receiverType = receiverCandidates[0].symbol;
    const samePackageConfigurationPaths =
      resolutionProof !== "same-package" || source.filePath === receiverType.filePath
        ? []
        : samePackageJvmModuleEvidence({
            projectEvidence: input.jvmProjectModuleEvidence,
            membershipsByFile,
            sourceFilePath: source.filePath,
            targetFilePath: receiverType.filePath
          }, resolverDependencies.uniqueConfigurationPaths);
    if (samePackageConfigurationPaths === null) {
      continue;
    }
    const declaredProjectDependency =
      resolutionProof === "same-package"
        ? null
        : declaredJvmProjectDependencyEvidence({
            projectEvidence: input.jvmProjectModuleEvidence,
            membershipsByFile,
            sourceFilePath: source.filePath,
            targetFilePath: receiverType.filePath
          }, resolverDependencies.uniqueConfigurationPaths);
    const receiverConfigurationPaths =
      resolutionProof === "same-package"
        ? samePackageConfigurationPaths
        : declaredProjectDependency?.configurationPaths ?? [];
    const proof =
      declaredProjectDependency === null
        ? resolutionProof
        : `${resolutionProof}.declared-${declaredProjectDependency.kind}`;
    const factoryMethodSetPlan = javaMethodSetPlan({
      receiverTypeSymbolId: receiverType.id,
      callerType: declaringType,
      methodName: reference.factoryMethodName,
      invocationKind: "type-name-static",
      callableDeclarations,
      heritageEdgesBySourceId,
      typesBySymbolId,
      symbolsById: input.symbolsById
    });
    if (factoryMethodSetPlan === null) {
      continue;
    }
    const factoryPlan = javaCallPlan({
      dependencies: resolverDependencies,
      declarations: factoryMethodSetPlan.declarations,
      actualArgumentCount: reference.factoryArgumentCount,
      argumentTypes: reference.factoryArgumentTypes,
      callerType: declaringType,
      typesBySymbolId,
      types,
      heritageEdgesBySourceId,
      symbolsById: input.symbolsById,
      membershipsByFile,
      projectEvidence: input.jvmProjectModuleEvidence
    });
    if (factoryPlan === null) {
      continue;
    }
    const factory = input.symbolsById.get(factoryPlan.selected.symbolId);
    const factoryMethodSetEntry = factoryMethodSetPlan.entriesBySymbolId.get(
      factoryPlan.selected.symbolId
    );
    const factoryAccessEvidence = factoryMethodSetEntry?.evidence.access;
    if (
      factory?.kind !== "method" ||
      factoryMethodSetEntry === undefined ||
      factoryAccessEvidence === undefined
    ) {
      continue;
    }
    const topLevelReturnReferences = signatureReferences.filter(
      (candidate) =>
        candidate.sourceId === factory.id &&
        candidate.relationKind === "returns" &&
        candidate.isTopLevelType === true
    );
    if (topLevelReturnReferences.length !== 1 || topLevelReturnReferences[0] === undefined) {
      continue;
    }
    const returnReference = topLevelReturnReferences[0];
    const returnEdges = input.signatureEdges.filter(
      (edge) =>
        edge.sourceId === factory.id &&
        edge.kind === "returns" &&
        edge.targetId !== null &&
        edge.referenceName === returnReference.referenceName &&
        edge.range.start.line === returnReference.range.start.line &&
        edge.range.start.column === returnReference.range.start.column &&
        edge.range.end.line === returnReference.range.end.line &&
        edge.range.end.column === returnReference.range.end.column
    );
    const returnEdge = returnEdges[0];
    const returnedTypeId = returnEdge?.targetId;
    if (returnEdges.length !== 1 || returnEdge === undefined || returnedTypeId === null || returnedTypeId === undefined) {
      continue;
    }
    const returnedTypeEntries = typesBySymbolId.get(returnedTypeId) ?? [];
    if (returnedTypeEntries.length !== 1 || returnedTypeEntries[0] === undefined) {
      continue;
    }
    const returnedType = returnedTypeEntries[0].symbol;
    const methodSetPlan = javaMethodSetPlan({
      receiverTypeSymbolId: returnedType.id,
      callerType: declaringType,
      methodName: reference.methodName,
      invocationKind: "expression",
      callableDeclarations,
      heritageEdgesBySourceId,
      typesBySymbolId,
      symbolsById: input.symbolsById
    });
    if (methodSetPlan === null) {
      continue;
    }
    const methodPlan = javaCallPlan({
      dependencies: resolverDependencies,
      declarations: methodSetPlan.declarations,
      actualArgumentCount: reference.methodArgumentCount,
      argumentTypes: reference.methodArgumentTypes,
      callerType: declaringType,
      typesBySymbolId,
      types,
      heritageEdgesBySourceId,
      symbolsById: input.symbolsById,
      membershipsByFile,
      projectEvidence: input.jvmProjectModuleEvidence
    });
    if (methodPlan === null) {
      continue;
    }
    const method = input.symbolsById.get(methodPlan.selected.symbolId);
    if (method?.kind !== "method") {
      continue;
    }
    const methodSetEntry = methodSetPlan.entriesBySymbolId.get(method.id);
    if (methodSetEntry === undefined) {
      continue;
    }
    const configurationPaths = resolverDependencies.uniqueConfigurationPaths([
      receiverConfigurationPaths,
      returnEdge.evidence?.configurationPaths ?? [],
      factoryPlan.configurationPaths,
      methodPlan.configurationPaths,
      ...factoryMethodSetEntry.hierarchyEdges.map(
        (edge) => edge.evidence?.configurationPaths ?? []
      ),
      ...methodSetEntry.hierarchyEdges.map((edge) => edge.evidence?.configurationPaths ?? [])
    ]);
    const sourcePaths = [
      ...new Set([
        reference.filePath,
        receiverType.filePath,
        returnedType.filePath,
        method.filePath,
        ...factoryPlan.sourcePaths,
        ...methodPlan.sourcePaths,
        ...factoryMethodSetEntry.hierarchyEdges.flatMap((edge) => [
          edge.filePath,
          ...(edge.evidence?.resolutionPath ?? [])
        ]),
        ...methodSetEntry.hierarchyEdges.flatMap((edge) => [
          edge.filePath,
          ...(edge.evidence?.resolutionPath ?? [])
        ])
      ])
    ].sort(compareStableText);
    edges.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: factory.id,
        kind: "calls",
        line: reference.factoryRange.start.line,
        column: reference.factoryRange.start.column,
        referenceName: reference.factoryMethodName
      }),
      sourceId: source.id,
      targetId: factory.id,
      kind: "calls",
      filePath: reference.filePath,
      range: reference.factoryRange,
      resolution: "exact",
      confidence: 1,
      referenceName: reference.factoryMethodName,
      evidence: {
        ...resolverDependencies.referenceEvidence(
          `call.java.chained-factory.${proof}.${factoryPlan.selection}.factory`,
          "module",
          [factoryPlan.selected.symbolId],
          configurationPaths,
          sourcePaths
        ),
        callArity: factoryPlan.arityEvidence,
        callType: factoryPlan.typeEvidence,
        callAccess: factoryAccessEvidence,
        callDispatch: factoryMethodSetEntry.evidence
      }
    });
    edges.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: method.id,
        kind: "calls",
        line: reference.range.start.line,
        column: reference.range.start.column,
        referenceName: reference.methodName
      }),
      sourceId: source.id,
      targetId: method.id,
      kind: "calls",
      filePath: reference.filePath,
      range: reference.range,
      resolution: "exact",
      confidence: 1,
      referenceName: reference.methodName,
      evidence: {
        ...resolverDependencies.referenceEvidence(
          `call.java.chained-factory.${proof}.${methodPlan.selection}.${
            methodSetEntry.inherited ? "inherited-return-dispatch" : "return-dispatch"
          }`,
          "module",
          [methodPlan.selected.symbolId],
          configurationPaths,
          sourcePaths
        ),
        callArity: methodPlan.arityEvidence,
        callType: methodPlan.typeEvidence,
        callDispatch: methodSetEntry.evidence
      }
    });
  }
  return edges;
}

function jvmDependencyInjectionRuleId(input: {
  readonly syntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly resolutionProof: "explicit-import" | "qualified-type" | "same-package";
  readonly declaredProjectDependency?: JvmModuleDependency["kind"];
}): string {
  const proof =
    input.declaredProjectDependency === undefined
      ? input.resolutionProof
      : `${input.resolutionProof}.declared-${input.declaredProjectDependency}`;
  return `framework.jvm-di.${input.syntax}.${proof}.local-type`;
}

/**
 * Projects a direct Java/Kotlin DI point only when its extracted annotation
 * and declared type identify one project-local top-level type. This is a
 * source-level dependency edge, not a claim that a framework selected a
 * particular runtime bean, provider, qualifier, or compiler classpath entry.
 */
export function projectJvmDependencyInjectionReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}, dependencies: JvmResolverDependencies): readonly GraphEdge[] {
  const resolverDependencies = dependencies;
  const typesBySymbolId = new Map<string, JvmResolvedType[]>();
  const references: JvmDependencyInjectionReferenceFact[] = [];

  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    for (const fact of facts.jvmFacts?.types ?? []) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.kind !== "class" && symbol?.kind !== "interface") {
        continue;
      }
      const entries = typesBySymbolId.get(symbol.id) ?? [];
      entries.push({ fact, symbol });
      typesBySymbolId.set(symbol.id, entries);
    }
    references.push(...(facts.jvmFacts?.dependencyInjectionReferences ?? []));
  }

  const types = [...typesBySymbolId.values()]
    .filter((entries) => entries.length === 1 && entries[0] !== undefined)
    .map((entries) => entries[0] as JvmResolvedType)
    .sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
  const membershipsByFile = jvmModuleMembershipsByFile(input.jvmProjectModuleEvidence);
  const edges: GraphEdge[] = [];

  for (const reference of [...references].sort((left, right) =>
    compareStableText(
      `${left.sourceId}\u0000${left.syntax}\u0000${left.referenceName}\u0000${left.range.start.line}\u0000${left.range.start.column}`,
      `${right.sourceId}\u0000${right.syntax}\u0000${right.referenceName}\u0000${right.range.start.line}\u0000${right.range.start.column}`
    )
  )) {
    const sourceEntries = typesBySymbolId.get(reference.sourceId) ?? [];
    const source = input.symbolsById.get(reference.sourceId);
    if (
      sourceEntries.length !== 1 ||
      sourceEntries[0] === undefined ||
      source === undefined ||
      source.kind !== "class"
    ) {
      continue;
    }
    const sourceType = sourceEntries[0];
    const targetTypePath = reference.qualifiedTypePath ?? reference.importedTypePath;
    const resolutionProof =
      reference.qualifiedTypePath !== undefined
        ? "qualified-type"
        : reference.importedTypePath !== undefined
          ? "explicit-import"
          : "same-package";
    const candidates = types.filter((candidate) =>
      targetTypePath === undefined
        ? candidate.fact.packageName === sourceType.fact.packageName &&
          candidate.symbol.name === reference.referenceName
        : jvmTypePath(candidate) === targetTypePath
    );
    if (
      candidates.length !== 1 ||
      candidates[0] === undefined ||
      candidates[0].symbol.id === source.id ||
      candidates[0].symbol.filePath === source.filePath
    ) {
      continue;
    }
    const target = candidates[0].symbol;
    const samePackageConfigurationPaths =
      resolutionProof === "same-package"
        ? samePackageJvmModuleEvidence({
            projectEvidence: input.jvmProjectModuleEvidence,
            membershipsByFile,
            sourceFilePath: source.filePath,
            targetFilePath: target.filePath
          }, resolverDependencies.uniqueConfigurationPaths)
        : [];
    if (samePackageConfigurationPaths === null) {
      continue;
    }
    const declaredProjectDependency =
      resolutionProof === "same-package"
        ? null
        : declaredJvmProjectDependencyEvidence({
            projectEvidence: input.jvmProjectModuleEvidence,
            membershipsByFile,
            sourceFilePath: source.filePath,
            targetFilePath: target.filePath
          }, resolverDependencies.uniqueConfigurationPaths);
    const configurationPaths =
      resolutionProof === "same-package"
        ? samePackageConfigurationPaths
        : declaredProjectDependency?.configurationPaths ?? [];
    edges.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: target.id,
        kind: "references",
        line: reference.range.start.line,
        column: reference.range.start.column,
        referenceName: reference.referenceName
      }),
      sourceId: source.id,
      targetId: target.id,
      kind: "references",
      filePath: reference.filePath,
      range: reference.range,
      resolution: "exact",
      confidence: 1,
      referenceName: reference.referenceName,
      evidence: resolverDependencies.referenceEvidence(
        jvmDependencyInjectionRuleId({
          syntax: reference.syntax,
          resolutionProof,
          ...(declaredProjectDependency === null
            ? {}
            : { declaredProjectDependency: declaredProjectDependency.kind })
        }),
        "module",
        resolverDependencies.candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
        configurationPaths,
        [reference.filePath, target.filePath]
      )
    });
  }
  return edges;
}
