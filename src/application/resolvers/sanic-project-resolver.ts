import {
  compareStableText,
  createEdgeId,
  createSymbolId,
  type EdgeEvidence,
  type GraphEdge,
  type SanicBlueprintDeclarationFact,
  type SanicBlueprintGroupDeclarationFact,
  type SanicBlueprintGroupMemberFact,
  type SanicBlueprintRouteFact,
  type SanicImportedBlueprintRegistrationFact,
  type SymbolNode
} from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import {
  compactPythonModuleResolutionPath,
  mountedPythonRoutePathParts,
  resolvePythonRelativeModule
} from "./python-route-projector-helpers.js";

type ReferenceEvidenceFactory = (
  ruleId: EdgeEvidence["ruleId"],
  stage: EdgeEvidence["stage"],
  candidateIds: readonly string[],
  configurationPaths?: readonly string[],
  resolutionPath?: readonly string[]
) => EdgeEvidence;

interface ProjectedSanicImportedBlueprintRoute {
  readonly registrationFilePath: string;
  readonly blueprintFilePath: string;
  readonly registration: SanicImportedBlueprintRegistrationFact;
  readonly blueprintName: string;
  readonly route: SanicBlueprintRouteFact;
  readonly handler: SymbolNode;
  readonly path: string;
  /** Zero means a directly imported Blueprint rather than a Blueprint group. */
  readonly groupDepth: number;
  /** Applies only to the outer imported group and enables distinct repeated mounts. */
  readonly groupNamePrefix: string | null;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
}

function compareProjectedSanicImportedBlueprintRoute(
  left: ProjectedSanicImportedBlueprintRoute,
  right: ProjectedSanicImportedBlueprintRoute
): number {
  return (
    compareStableText(left.registrationFilePath, right.registrationFilePath) ||
    left.registration.range.start.line - right.registration.range.start.line ||
    left.registration.range.start.column - right.registration.range.start.column ||
    compareStableText(left.blueprintFilePath, right.blueprintFilePath) ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.route.method, right.route.method) ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.handler.id, right.handler.id)
  );
}

type ResolvedSanicBlueprintTarget =
  | {
      readonly kind: "blueprint";
      readonly filePath: string;
      readonly blueprint: SanicBlueprintDeclarationFact;
      readonly resolutionPath: readonly string[];
      readonly reExported: boolean;
    }
  | {
      readonly kind: "group";
      readonly filePath: string;
      readonly group: SanicBlueprintGroupDeclarationFact;
      readonly resolutionPath: readonly string[];
      readonly reExported: boolean;
    };

interface ResolvedSanicBlueprintGroupMember {
  readonly blueprintFilePath: string;
  readonly blueprint: SanicBlueprintDeclarationFact;
  readonly prefixes: readonly string[];
  readonly groupDepth: number;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
}

function directSanicBlueprintTargets(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly filePath: string;
  readonly name: string;
}): readonly ResolvedSanicBlueprintTarget[] {
  const facts = input.factsByFile.get(input.filePath)?.sanicBlueprintFacts;
  if (facts === undefined) {
    return [];
  }
  const blueprints = facts.blueprints.filter((blueprint) => blueprint.name === input.name);
  const groups = (facts.groups ?? []).filter((group) => group.name === input.name);
  return [
    ...blueprints.map((blueprint) => ({
      kind: "blueprint" as const,
      filePath: input.filePath,
      blueprint,
      resolutionPath: [input.filePath],
      reExported: false
    })),
    ...groups.map((group) => ({
      kind: "group" as const,
      filePath: input.filePath,
      group,
      resolutionPath: [input.filePath],
      reExported: false
    }))
  ];
}

/**
 * Resolves a direct Sanic target or one final `__init__.py` re-export chain.
 * Every hop is a persisted single-name relative import, and a cycle or any
 * competing local/exported binding remains unresolved.
 */
function resolveExactSanicBlueprintTarget(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly filePath: string;
  readonly name: string;
  readonly visited?: ReadonlySet<string>;
}): ResolvedSanicBlueprintTarget | null {
  const targetKey = `${input.filePath}\u0000${input.name}`;
  const visited = input.visited ?? new Set<string>();
  if (visited.has(targetKey)) {
    return null;
  }
  const facts = input.factsByFile.get(input.filePath)?.sanicBlueprintFacts;
  if (facts === undefined) {
    return null;
  }
  const directTargets = directSanicBlueprintTargets(input);
  const reExports = (facts.reExports ?? []).filter((reExport) => reExport.exportedName === input.name);
  if (directTargets.length + reExports.length !== 1) {
    return null;
  }
  if (directTargets[0] !== undefined) {
    return directTargets[0];
  }
  const reExport = reExports[0];
  if (reExport === undefined) {
    return null;
  }
  const targetFilePath = resolvePythonRelativeModule(
    input.knownFilePaths,
    input.filePath,
    reExport.moduleSpecifier
  );
  if (targetFilePath === null) {
    return null;
  }
  const nestedVisited = new Set(visited);
  nestedVisited.add(targetKey);
  const target = resolveExactSanicBlueprintTarget({
    factsByFile: input.factsByFile,
    knownFilePaths: input.knownFilePaths,
    filePath: targetFilePath,
    name: reExport.importedName,
    visited: nestedVisited
  });
  return target === null
    ? null
    : {
        ...target,
        resolutionPath: compactPythonModuleResolutionPath([input.filePath, ...target.resolutionPath]),
        reExported: true
      };
}

function resolveSanicBlueprintGroupMemberTarget(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly groupFilePath: string;
  readonly member: SanicBlueprintGroupMemberFact;
}): ResolvedSanicBlueprintTarget | null {
  if (input.member.kind === "blueprint" || input.member.kind === "group") {
    const targets = directSanicBlueprintTargets({
      factsByFile: input.factsByFile,
      filePath: input.groupFilePath,
      name: input.member.name
    });
    const target = targets.length === 1 ? targets[0] : undefined;
    return target === undefined || target.kind !== input.member.kind ? null : target;
  }

  const importedFilePath = resolvePythonRelativeModule(
    input.knownFilePaths,
    input.groupFilePath,
    input.member.moduleSpecifier
  );
  if (importedFilePath === null) {
    return null;
  }
  return resolveExactSanicBlueprintTarget({
    factsByFile: input.factsByFile,
    knownFilePaths: input.knownFilePaths,
    filePath: importedFilePath,
    name: input.member.importedName
  });
}

/**
 * Resolves all direct and imported members of one Blueprint group. Cyclic
 * groups and repeated Blueprint leaves are rejected rather than projected as
 * speculative runtime routes.
 */
function resolveSanicBlueprintGroupMembers(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly groupFilePath: string;
  readonly group: SanicBlueprintGroupDeclarationFact;
  readonly visited?: ReadonlySet<string>;
}): readonly ResolvedSanicBlueprintGroupMember[] | null {
  const groupKey = `${input.groupFilePath}\u0000${input.group.name}`;
  const visited = input.visited ?? new Set<string>();
  if (visited.has(groupKey)) {
    return null;
  }
  const nestedVisited = new Set(visited);
  nestedVisited.add(groupKey);
  const members: ResolvedSanicBlueprintGroupMember[] = [];

  for (const member of input.group.members) {
    const target = resolveSanicBlueprintGroupMemberTarget({
      factsByFile: input.factsByFile,
      knownFilePaths: input.knownFilePaths,
      groupFilePath: input.groupFilePath,
      member
    });
    if (target === null) {
      return null;
    }
    if (target.kind === "blueprint") {
      members.push({
        blueprintFilePath: target.filePath,
        blueprint: target.blueprint,
        prefixes: [input.group.prefix, target.blueprint.prefix],
        groupDepth: 1,
        resolutionPath: compactPythonModuleResolutionPath([
          input.groupFilePath,
          ...target.resolutionPath
        ]),
        reExported: target.reExported
      });
      continue;
    }

    const childMembers = resolveSanicBlueprintGroupMembers({
      factsByFile: input.factsByFile,
      knownFilePaths: input.knownFilePaths,
      groupFilePath: target.filePath,
      group: target.group,
      visited: nestedVisited
    });
    if (childMembers === null) {
      return null;
    }
    for (const child of childMembers) {
      members.push({
        blueprintFilePath: child.blueprintFilePath,
        blueprint: child.blueprint,
        prefixes: [input.group.prefix, ...child.prefixes],
        groupDepth: child.groupDepth + 1,
        resolutionPath: compactPythonModuleResolutionPath([
          input.groupFilePath,
          ...child.resolutionPath
        ]),
        reExported: target.reExported || child.reExported
      });
    }
  }

  const blueprintKeys = new Set<string>();
  for (const member of members) {
    const blueprintKey = `${member.blueprintFilePath}\u0000${member.blueprint.name}`;
    if (blueprintKeys.has(blueprintKey)) {
      return null;
    }
    blueprintKeys.add(blueprintKey);
  }
  return members;
}

function sanicImportedBlueprintRouteRuleId(input: {
  readonly groupDepth: number;
  readonly namedGroupMount: boolean;
  readonly reExported: boolean;
}): string {
  if (input.groupDepth === 0) {
    return input.reExported
      ? "framework.sanic.reexported-blueprint.app-blueprint.decorator.local-function"
      : "framework.sanic.imported-blueprint.app-blueprint.decorator.local-function";
  }
  if (input.namedGroupMount) {
    return input.reExported
      ? "framework.sanic.reexported-named-blueprint-group.app-blueprint.decorator.local-function"
      : "framework.sanic.imported-named-blueprint-group.app-blueprint.decorator.local-function";
  }
  if (input.reExported) {
    return input.groupDepth === 1
      ? "framework.sanic.reexported-blueprint-group.app-blueprint.decorator.local-function"
      : "framework.sanic.reexported-nested-blueprint-group.app-blueprint.decorator.local-function";
  }
  return input.groupDepth === 1
    ? "framework.sanic.imported-blueprint-group.app-blueprint.decorator.local-function"
    : "framework.sanic.imported-nested-blueprint-group.app-blueprint.decorator.local-function";
}

function sanicImportedBlueprintMountKey(candidate: ProjectedSanicImportedBlueprintRoute): string {
  return [
    candidate.registrationFilePath,
    candidate.registration.range.start.line,
    candidate.registration.range.start.column,
    candidate.blueprintFilePath,
    candidate.blueprintName,
    candidate.groupDepth,
    candidate.groupNamePrefix ?? ""
  ].join("\u0000");
}

function sanicImportedBlueprintTargetKey(candidate: ProjectedSanicImportedBlueprintRoute): string {
  return [
    candidate.registrationFilePath,
    candidate.registration.applicationName,
    candidate.blueprintFilePath,
    candidate.blueprintName
  ].join("\u0000");
}

interface SanicImportedBlueprintRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
}

/**
 * Projects literal handler routes declared on directly imported Sanic
 * Blueprints and recursively composed Blueprint groups. Every import, group
 * member, prefix, and handler must have a persisted syntax proof.
 */
export function projectSanicImportedBlueprintRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly referenceEvidence: ReferenceEvidenceFactory;
}): SanicImportedBlueprintRouteProjection {
  const { referenceEvidence } = input;
  const candidates: ProjectedSanicImportedBlueprintRoute[] = [];

  for (const [registrationFilePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const registrationFacts = facts.sanicBlueprintFacts;
    if (registrationFacts === undefined) {
      continue;
    }

    for (const registration of registrationFacts.importedBlueprintRegistrations) {
      const importedFilePath = resolvePythonRelativeModule(
        input.knownFilePaths,
        registrationFilePath,
        registration.moduleSpecifier
      );
      if (importedFilePath === null) {
        continue;
      }
      const target = resolveExactSanicBlueprintTarget({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        filePath: importedFilePath,
        name: registration.importedBlueprintName
      });
      if (target === null) {
        continue;
      }

      const members: readonly ResolvedSanicBlueprintGroupMember[] =
        target.kind === "blueprint"
          ? [
              {
                blueprintFilePath: target.filePath,
                blueprint: target.blueprint,
                prefixes: [target.blueprint.prefix],
                groupDepth: 0,
                resolutionPath: target.resolutionPath,
                reExported: target.reExported
              }
            ]
          : (resolveSanicBlueprintGroupMembers({
              factsByFile: input.factsByFile,
              knownFilePaths: input.knownFilePaths,
              groupFilePath: target.filePath,
              group: target.group
            }) ?? []);
      if (members.length === 0) {
        continue;
      }

      for (const member of members) {
        const blueprintFacts = input.factsByFile.get(member.blueprintFilePath)?.sanicBlueprintFacts;
        if (blueprintFacts === undefined) {
          continue;
        }
        for (const route of blueprintFacts.routes) {
          if (route.blueprintName !== member.blueprint.name) {
            continue;
          }
          const handler = input.symbolsById.get(route.handlerId);
          if (handler?.kind !== "function" || handler.filePath !== member.blueprintFilePath) {
            continue;
          }
          const path = mountedPythonRoutePathParts([
            registration.prefix,
            ...member.prefixes,
            route.path
          ]);
          if (path === null) {
            continue;
          }
          candidates.push({
            registrationFilePath,
            blueprintFilePath: member.blueprintFilePath,
            registration,
            blueprintName: member.blueprint.name,
            route,
            handler,
            path,
            groupDepth: member.groupDepth,
            groupNamePrefix: target.kind === "group" ? target.group.namePrefix : null,
            resolutionPath: compactPythonModuleResolutionPath([
              registrationFilePath,
              ...target.resolutionPath,
              ...member.resolutionPath
            ]),
            reExported: target.reExported || member.reExported
          });
        }
      }
    }
  }

  const representativeByMountKey = new Map<string, ProjectedSanicImportedBlueprintRoute>();
  const mountKeysByTargetKey = new Map<string, string[]>();
  for (const candidate of candidates) {
    const mountKey = sanicImportedBlueprintMountKey(candidate);
    if (!representativeByMountKey.has(mountKey)) {
      representativeByMountKey.set(mountKey, candidate);
      const targetKey = sanicImportedBlueprintTargetKey(candidate);
      const mountKeys = mountKeysByTargetKey.get(targetKey) ?? [];
      mountKeys.push(mountKey);
      mountKeysByTargetKey.set(targetKey, mountKeys);
    }
  }
  const allowedMountKeys = new Set<string>();
  const namedGroupMountKeys = new Set<string>();
  for (const mountKeys of mountKeysByTargetKey.values()) {
    const mounts = mountKeys
      .map((mountKey) => representativeByMountKey.get(mountKey))
      .filter((mount): mount is ProjectedSanicImportedBlueprintRoute => mount !== undefined);
    if (mounts.every((mount) => mount.groupDepth === 0) || mounts.length === 1) {
      for (const mountKey of mountKeys) {
        allowedMountKeys.add(mountKey);
      }
      continue;
    }
    if (
      !mounts.every((mount) => mount.groupDepth === 1 && mount.groupNamePrefix !== null) ||
      new Set(mounts.map((mount) => mount.groupNamePrefix)).size !== mounts.length
    ) {
      continue;
    }
    for (const mountKey of mountKeys) {
      allowedMountKeys.add(mountKey);
      namedGroupMountKeys.add(mountKey);
    }
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedSanicImportedBlueprintRoute)) {
    const mountKey = sanicImportedBlueprintMountKey(candidate);
    if (!allowedMountKeys.has(mountKey)) {
      continue;
    }
    const dedupeKey = [
      candidate.registrationFilePath,
      candidate.registration.range.start.line,
      candidate.registration.range.start.column,
      candidate.blueprintFilePath,
      candidate.route.range.start.line,
      candidate.route.range.start.column,
      candidate.route.method,
      candidate.path,
      candidate.handler.id
    ].join("\u0000");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const file = input.fileSymbols.get(candidate.blueprintFilePath);
    if (file === undefined) {
      continue;
    }
    const name = candidate.route.method + " " + candidate.path;
    const qualifiedName = candidate.blueprintFilePath + "#route:" + name;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.blueprintFilePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.blueprintFilePath,
      range: candidate.route.range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(route);
    structuralEdges.push({
      id: createEdgeId({
        sourceId: file.id,
        targetId: route.id,
        kind: "contains",
        line: candidate.route.range.start.line,
        column: candidate.route.range.start.column,
        referenceName: route.name
      }),
      sourceId: file.id,
      targetId: route.id,
      kind: "contains",
      filePath: candidate.blueprintFilePath,
      range: candidate.route.range,
      resolution: "exact",
      confidence: 1,
      referenceName: route.name,
      evidence: {
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [route.id]
      }
    });
    structuralEdges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: candidate.handler.id,
        kind: "routes",
        line: candidate.route.range.start.line,
        column: candidate.route.range.start.column,
        referenceName: candidate.handler.name
      }),
      sourceId: route.id,
      targetId: candidate.handler.id,
      kind: "routes",
      filePath: candidate.blueprintFilePath,
      range: candidate.route.range,
      resolution: "exact",
      confidence: 1,
      referenceName: candidate.handler.name,
      evidence: referenceEvidence(
        sanicImportedBlueprintRouteRuleId({
          groupDepth: candidate.groupDepth,
          namedGroupMount: namedGroupMountKeys.has(mountKey),
          reExported: candidate.reExported
        }),
        "module",
        [candidate.handler.id],
        [],
        candidate.resolutionPath
      )
    });
  }

  return { symbols, structuralEdges };
}
