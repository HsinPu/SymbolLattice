import { compareStableText, createEdgeId, type EdgeEvidence, type GraphEdge, type SymbolNode, type JvmAnnotationReferenceFact, type JvmHeritageReferenceFact, type JvmHeritageSyntax, type JvmImportReferenceFact, type JvmTypeFact } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import type { JvmModuleDependency, JvmModuleMembership, JvmProjectModuleEvidence } from "../../ports/source-catalog.js";

type CandidateSymbolIds = (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[];
type UniqueConfigurationPaths = (configurationPaths: readonly (readonly string[])[]) => readonly string[];
type ReferenceEvidenceFactory = (
  ruleId: EdgeEvidence["ruleId"],
  stage: EdgeEvidence["stage"],
  candidateIds: readonly string[],
  configurationPaths?: readonly string[],
  resolutionPath?: readonly string[]
) => EdgeEvidence;

export type JvmResolverDependencies = {
  readonly candidateSymbolIds: CandidateSymbolIds;
  readonly referenceEvidence: ReferenceEvidenceFactory;
  readonly uniqueConfigurationPaths: UniqueConfigurationPaths;
};

type JvmHeritageRelationKind = "extends" | "implements";

export interface JvmResolvedType {
  readonly fact: JvmTypeFact;
  readonly symbol: SymbolNode;
}

export function jvmTypePath(type: JvmResolvedType): string {
  return type.fact.packageName.length === 0
    ? type.symbol.name
    : `${type.fact.packageName}.${type.symbol.name}`;
}

function jvmHeritageRelationKind(input: {
  readonly syntax: JvmHeritageSyntax;
  readonly source: SymbolNode;
  readonly target: SymbolNode;
}): JvmHeritageRelationKind | null {
  switch (input.syntax) {
    case "java-class-superclass":
      return input.source.kind === "class" && input.target.kind === "class" ? "extends" : null;
    case "java-class-interface":
      return input.source.kind === "class" && input.target.kind === "interface"
        ? "implements"
        : null;
    case "java-interface-superinterface":
      return input.source.kind === "interface" && input.target.kind === "interface"
        ? "extends"
        : null;
    case "kotlin-supertype":
      if (input.source.kind === "class" && input.target.kind === "class") {
        return "extends";
      }
      if (input.source.kind === "class" && input.target.kind === "interface") {
        return "implements";
      }
      return input.source.kind === "interface" && input.target.kind === "interface"
        ? "extends"
        : null;
  }
}

function jvmHeritageRuleId(input: {
  readonly syntax: JvmHeritageSyntax;
  readonly resolutionProof: "explicit-import" | "qualified-type" | "same-package";
  readonly declaredProjectDependency?: JvmModuleDependency["kind"];
  readonly relationKind: JvmHeritageRelationKind;
  readonly sourceKind: SymbolNode["kind"];
}): string {
  const relationship =
    input.relationKind === "implements"
      ? "direct-implements"
      : input.syntax === "java-interface-superinterface" ||
          (input.syntax === "kotlin-supertype" && input.sourceKind === "interface")
        ? "direct-interface-extends"
        : "direct-superclass";
  const proof =
    input.declaredProjectDependency === undefined
      ? input.resolutionProof
      : `${input.resolutionProof}.declared-${input.declaredProjectDependency}`;
  return `syntax.jvm.cross-file.${proof}.${relationship}`;
}

export function jvmModuleMembershipsByFile(
  projectEvidence: JvmProjectModuleEvidence | undefined
): ReadonlyMap<string, readonly JvmModuleMembership[]> {
  const membershipsByFile = new Map<string, Map<string, JvmModuleMembership>>();
  for (const membership of projectEvidence?.memberships ?? []) {
    const memberships = membershipsByFile.get(membership.filePath) ?? new Map<string, JvmModuleMembership>();
    const key = `${membership.moduleId}\u0000${membership.sourceSet}`;
    if (!memberships.has(key)) {
      memberships.set(key, membership);
    }
    membershipsByFile.set(membership.filePath, memberships);
  }
  return new Map(
    [...membershipsByFile.entries()].map(([filePath, memberships]) => [
      filePath,
      [...memberships.values()].sort((left, right) =>
        compareStableText(
          `${left.moduleId}\u0000${left.sourceSet}`,
          `${right.moduleId}\u0000${right.sourceSet}`
        )
      )
    ])
  );
}

/**
 * A same-package Java/Kotlin reference has no import-path proof. When a
 * conventional Maven or Gradle layout was detected, retain it only within one
 * unambiguous module and a source-set visibility direction. This does not
 * model build dependencies: explicit imports and qualified types keep their
 * independent syntax proof.
 */
export function samePackageJvmModuleEvidence(input: {
  readonly projectEvidence: JvmProjectModuleEvidence | undefined;
  readonly membershipsByFile: ReadonlyMap<string, readonly JvmModuleMembership[]>;
  readonly sourceFilePath: string;
  readonly targetFilePath: string;
}, uniqueConfigurationPaths: UniqueConfigurationPaths): readonly string[] | null {
  if (input.projectEvidence === undefined) {
    return [];
  }
  const sourceMemberships = input.membershipsByFile.get(input.sourceFilePath) ?? [];
  const targetMemberships = input.membershipsByFile.get(input.targetFilePath) ?? [];
  const sourceByModule = new Map(sourceMemberships.map((membership) => [membership.moduleId, membership]));
  const targetByModule = new Map(targetMemberships.map((membership) => [membership.moduleId, membership]));
  if (
    sourceMemberships.length === 0 ||
    targetMemberships.length === 0 ||
    sourceByModule.size !== sourceMemberships.length ||
    targetByModule.size !== targetMemberships.length ||
    sourceByModule.size !== targetByModule.size ||
    [...sourceByModule].some(([moduleId, sourceMembership]) => {
      const targetMembership = targetByModule.get(moduleId);
      return (
        targetMembership === undefined ||
        (sourceMembership.sourceSet === "main" && targetMembership.sourceSet !== "main")
      );
    })
  ) {
    return null;
  }
  return uniqueConfigurationPaths([
    ...sourceMemberships.map((membership) => membership.configurationPaths),
    ...targetMemberships.map((membership) => membership.configurationPaths)
  ]);
}

export interface DeclaredJvmProjectDependencyEvidence {
  readonly kind: JvmModuleDependency["kind"];
  readonly configurationPaths: readonly string[];
}

/**
 * Records a direct Gradle project dependency only as additional evidence for a
 * relationship already proven by import or qualified-type syntax. Absence of a
 * declaration does not fabricate a negative result: Maven, dynamic Gradle,
 * transitive dependencies, and compiler classpaths remain outside this pass.
 */
export function declaredJvmProjectDependencyEvidence(input: {
  readonly projectEvidence: JvmProjectModuleEvidence | undefined;
  readonly membershipsByFile: ReadonlyMap<string, readonly JvmModuleMembership[]>;
  readonly sourceFilePath: string;
  readonly targetFilePath: string;
}, uniqueConfigurationPaths: UniqueConfigurationPaths): DeclaredJvmProjectDependencyEvidence | null {
  if (input.projectEvidence === undefined) {
    return null;
  }
  const sourceMemberships = input.membershipsByFile.get(input.sourceFilePath) ?? [];
  const targetMemberships = input.membershipsByFile.get(input.targetFilePath) ?? [];
  const sourceMembership = sourceMemberships.length === 1 ? sourceMemberships[0] : undefined;
  const targetMembership = targetMemberships.length === 1 ? targetMemberships[0] : undefined;
  if (
    sourceMembership === undefined ||
    targetMembership === undefined ||
    sourceMembership.moduleId === targetMembership.moduleId ||
    targetMembership.sourceSet !== "main"
  ) {
    return null;
  }
  const matches = (input.projectEvidence.dependencies ?? []).filter(
    (dependency) =>
      dependency.sourceModuleId === sourceMembership.moduleId &&
      dependency.targetModuleId === targetMembership.moduleId &&
      (sourceMembership.sourceSet === "test" || dependency.consumerSourceSet === "main")
  );
  if (matches.length === 0) {
    return null;
  }
  const kinds = [...new Set(matches.map((dependency) => dependency.kind))];
  if (kinds.length !== 1 || kinds[0] === undefined) {
    return null;
  }
  return {
    kind: kinds[0],
    configurationPaths: uniqueConfigurationPaths(matches.map((dependency) => dependency.configurationPaths))
  };
}

export function projectJavaImportReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}, dependencies: JvmResolverDependencies): readonly GraphEdge[] {
  const typesBySymbolId = new Map<string, JvmResolvedType[]>();
  const references: JvmImportReferenceFact[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    for (const fact of facts.jvmFacts?.types ?? []) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.kind === "class" || symbol?.kind === "interface") {
        const entries = typesBySymbolId.get(symbol.id) ?? [];
        entries.push({ fact, symbol });
        typesBySymbolId.set(symbol.id, entries);
      }
    }
    references.push(...(facts.jvmFacts?.importReferences ?? []));
  }
  const typesByPath = new Map<string, JvmResolvedType[]>();
  for (const entries of typesBySymbolId.values()) {
    if (entries.length !== 1 || entries[0] === undefined) {
      continue;
    }
    const type = entries[0];
    const path = jvmTypePath(type);
    const candidates = typesByPath.get(path) ?? [];
    candidates.push(type);
    typesByPath.set(path, candidates);
  }
  const membershipsByFile = jvmModuleMembershipsByFile(input.jvmProjectModuleEvidence);
  const edges: GraphEdge[] = [];
  for (const reference of [...references].sort((left, right) =>
    compareStableText(
      `${left.sourceId}\u0000${left.range.start.line}\u0000${left.range.start.column}`,
      `${right.sourceId}\u0000${right.range.start.line}\u0000${right.range.start.column}`
    )
  )) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.kind !== "file") {
      continue;
    }
    const candidates = typesByPath.get(reference.importedTypePath) ?? [];
    if (candidates.length !== 1 || candidates[0] === undefined || candidates[0].symbol.filePath === source.filePath) {
      continue;
    }
    const target = candidates[0].symbol;
    const declaredProjectDependency = declaredJvmProjectDependencyEvidence({
      projectEvidence: input.jvmProjectModuleEvidence,
      membershipsByFile,
      sourceFilePath: source.filePath,
      targetFilePath: target.filePath
    }, dependencies.uniqueConfigurationPaths);
    edges.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: target.id,
        kind: "imports",
        line: reference.range.start.line,
        column: reference.range.start.column,
        referenceName: reference.referenceName
      }),
      sourceId: source.id,
      targetId: target.id,
      kind: "imports",
      filePath: reference.filePath,
      range: reference.range,
      resolution: "exact",
      confidence: 1,
      referenceName: reference.referenceName,
      evidence: dependencies.referenceEvidence(
        "module.java.explicit-import.project-type",
        "module",
        dependencies.candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
        declaredProjectDependency?.configurationPaths ?? [],
        [reference.filePath, target.filePath]
      )
    });
  }
  return edges;
}

export function projectJavaAnnotationReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}, dependencies: JvmResolverDependencies): readonly GraphEdge[] {
  const typesBySymbolId = new Map<string, JvmResolvedType[]>();
  const references: JvmAnnotationReferenceFact[] = [];
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
    references.push(...(facts.jvmFacts?.annotationReferences ?? []));
  }
  const annotationTypes = [...typesBySymbolId.values()]
    .filter(
      (entries) =>
        entries.length === 1 &&
        entries[0] !== undefined &&
        entries[0].fact.isAnnotation === true
    )
    .map((entries) => entries[0] as JvmResolvedType)
    .sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
  const annotationTypesByPath = new Map<string, JvmResolvedType[]>();
  const annotationTypesByPackageName = new Map<string, JvmResolvedType[]>();
  for (const type of annotationTypes) {
    const path = jvmTypePath(type);
    const pathCandidates = annotationTypesByPath.get(path) ?? [];
    pathCandidates.push(type);
    annotationTypesByPath.set(path, pathCandidates);
    const packageNameKey = `${type.fact.packageName}\u0000${type.symbol.name}`;
    const packageCandidates = annotationTypesByPackageName.get(packageNameKey) ?? [];
    packageCandidates.push(type);
    annotationTypesByPackageName.set(packageNameKey, packageCandidates);
  }
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
      source === undefined ||
      (source.kind !== "class" && source.kind !== "interface" && source.kind !== "method") ||
      declaringTypeEntries.length !== 1 ||
      declaringTypeEntries[0] === undefined
    ) {
      continue;
    }
    const declaringType = declaringTypeEntries[0];
    const targetTypePath = reference.qualifiedTypePath ?? reference.importedTypePath;
    const resolutionProof = reference.qualifiedTypePath !== undefined
      ? "qualified-type"
      : reference.importedTypePath !== undefined
        ? "explicit-import"
        : "same-package";
    const candidates = targetTypePath === undefined
      ? annotationTypesByPackageName.get(
          `${declaringType.fact.packageName}\u0000${reference.referenceName}`
        ) ?? []
      : annotationTypesByPath.get(targetTypePath) ?? [];
    if (candidates.length !== 1 || candidates[0] === undefined || candidates[0].symbol.id === source.id) {
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
          }, dependencies.uniqueConfigurationPaths);
    if (samePackageConfigurationPaths === null) {
      continue;
    }
    const declaredProjectDependency = resolutionProof === "same-package"
      ? null
      : declaredJvmProjectDependencyEvidence({
          projectEvidence: input.jvmProjectModuleEvidence,
          membershipsByFile,
          sourceFilePath: source.filePath,
          targetFilePath: target.filePath
        }, dependencies.uniqueConfigurationPaths);
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
      evidence: dependencies.referenceEvidence(
        `module.java.annotation-type.${resolutionProof}.project-type`,
        "module",
        dependencies.candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
        resolutionProof === "same-package"
          ? samePackageConfigurationPaths
          : declaredProjectDependency?.configurationPaths ?? [],
        [reference.filePath, target.filePath]
      )
    });
  }
  return edges;
}

/**
 * Projects a direct JVM parent type only when the raw facts identify exactly
 * one indexed top-level type through an explicit import, a direct qualified
 * spelling, or a shared package. The extractor deliberately omits aliases,
 * wildcards, generic types, nested types, and compiler-classpath semantics, so
 * this pass cannot invent a type-checker relationship.
 */
export function projectJvmHeritageReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}, dependencies: JvmResolverDependencies): readonly GraphEdge[] {
  const typesBySymbolId = new Map<string, JvmResolvedType[]>();
  const references: JvmHeritageReferenceFact[] = [];

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
    references.push(...(facts.jvmFacts?.heritageReferences ?? []));
  }

  const types = [...typesBySymbolId.values()]
    .filter((entries) => entries.length === 1 && entries[0] !== undefined)
    .map((entries) => entries[0] as JvmResolvedType)
    .sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
  const membershipsByFile = jvmModuleMembershipsByFile(input.jvmProjectModuleEvidence);
  const edges: GraphEdge[] = [];

  for (const reference of [...references].sort((left, right) =>
    compareStableText(
      `${left.sourceId}\u0000${left.referenceName}\u0000${left.range.start.line}\u0000${left.range.start.column}`,
      `${right.sourceId}\u0000${right.referenceName}\u0000${right.range.start.line}\u0000${right.range.start.column}`
    )
  )) {
    const sourceEntries = typesBySymbolId.get(reference.sourceId) ?? [];
    const source = input.symbolsById.get(reference.sourceId);
    if (sourceEntries.length !== 1 || sourceEntries[0] === undefined || source === undefined) {
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
          }, dependencies.uniqueConfigurationPaths)
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
          }, dependencies.uniqueConfigurationPaths);
    const configurationPaths =
      resolutionProof === "same-package"
        ? samePackageConfigurationPaths
        : declaredProjectDependency?.configurationPaths ?? [];
    const relationKind = jvmHeritageRelationKind({ syntax: reference.syntax, source, target });
    if (relationKind === null) {
      continue;
    }
    edges.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: target.id,
        kind: relationKind,
        line: reference.range.start.line,
        column: reference.range.start.column,
        referenceName: reference.referenceName
      }),
      sourceId: source.id,
      targetId: target.id,
      kind: relationKind,
      filePath: reference.filePath,
      range: reference.range,
      resolution: "exact",
      confidence: 1,
      referenceName: reference.referenceName,
      evidence: dependencies.referenceEvidence(
        jvmHeritageRuleId({
          syntax: reference.syntax,
          resolutionProof,
          ...(declaredProjectDependency === null
            ? {}
            : { declaredProjectDependency: declaredProjectDependency.kind }),
          relationKind,
          sourceKind: source.kind
        }),
        "module",
        dependencies.candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
        configurationPaths,
        [reference.filePath, target.filePath]
      )
    });
  }
  return edges;
}
