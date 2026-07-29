import {
  compareStableText,
  createEdgeId,
  createSymbolId,
  type BindingSpace,
  type EdgeEvidence,
  type GraphEdge,
  type GraphSnapshot,
  type NestSymbolReference,
  type PendingReference,
  type ResolutionKind,
  type SymbolNode
} from "../domain/index.js";
import type { ExtractedFileFacts } from "../extraction/index.js";
import type {
  ProjectModuleResolver,
  ResolvedModule,
  SourceDocument
} from "../ports/source-catalog.js";

function normalizedParts(fromFilePath: string, moduleSpecifier: string): string[] | null {
  if (!moduleSpecifier.startsWith(".")) {
    return null;
  }

  const parts = fromFilePath.split("/").slice(0, -1);
  for (const part of moduleSpecifier.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length === 0) {
        return null;
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts;
}

function modulePathCandidates(fromFilePath: string, moduleSpecifier: string): readonly string[] {
  const parts = normalizedParts(fromFilePath, moduleSpecifier);
  if (parts === null) {
    return [];
  }

  const rawPath = parts.join("/");
  const extensionMatch = /\.(?:[cm]?[jt]sx?)$/i.exec(rawPath);
  const withoutExtension = extensionMatch === null ? rawPath : rawPath.slice(0, -extensionMatch[0].length);
  const candidates = new Set<string>([rawPath]);

  for (const extension of [".ts", ".tsx", ".js", ".jsx"]) {
    candidates.add(`${withoutExtension}${extension}`);
    candidates.add(`${rawPath}/index${extension}`);
  }

  return [...candidates].sort(compareStableText);
}

function referenceEdge(
  reference: PendingReference,
  targetId: string | null,
  resolution: ResolutionKind,
  confidence: number,
  evidence: EdgeEvidence
): GraphEdge {
  return {
    id: createEdgeId({
      sourceId: reference.sourceId,
      targetId,
      kind: reference.relationKind,
      line: reference.range.start.line,
      column: reference.range.start.column,
      referenceName: reference.referenceName
    }),
    sourceId: reference.sourceId,
    targetId,
    kind: reference.relationKind,
    filePath: reference.filePath,
    range: reference.range,
    resolution,
    confidence,
    referenceName: reference.referenceName,
    evidence
  };
}

function candidateSymbolIds(...candidateSets: readonly (readonly SymbolNode[])[]): readonly string[] {
  return [...new Set(candidateSets.flatMap((candidates) => candidates.map((candidate) => candidate.id)))].sort(
    compareStableText
  );
}

function referenceEvidence(
  ruleId: EdgeEvidence["ruleId"],
  stage: EdgeEvidence["stage"],
  candidateIds: readonly string[],
  configurationPaths: readonly string[] = [],
  resolutionPath: readonly string[] = []
): EdgeEvidence {
  const evidence: EdgeEvidence = {
    ruleId,
    stage,
    candidateSymbolIds: [...new Set(candidateIds)].sort(compareStableText)
  };
  const canonicalConfigurationPaths = uniqueConfigurationPaths([configurationPaths]);
  const canonicalResolutionPath = [...new Set(resolutionPath)];

  return {
    ...evidence,
    ...(canonicalConfigurationPaths.length === 0 ? {} : { configurationPaths: canonicalConfigurationPaths }),
    ...(canonicalResolutionPath.length === 0 ? {} : { resolutionPath: canonicalResolutionPath })
  };
}

function fallbackModuleResolution(
  knownFilePaths: ReadonlySet<string>,
  fromFilePath: string,
  moduleSpecifier: string
): ResolvedModule {
  const matchingPaths = modulePathCandidates(fromFilePath, moduleSpecifier).filter((path) =>
    knownFilePaths.has(path)
  );
  if (matchingPaths.length !== 1 || matchingPaths[0] === undefined) {
    return {
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: []
    };
  }

  return {
    targetFilePath: matchingPaths[0],
    strategy: "relative",
    configurationPaths: []
  };
}

function moduleRuleId(strategy: ResolvedModule["strategy"]): string {
  switch (strategy) {
    case "relative":
      return "module.relative-specifier";
    case "tsconfig-paths":
      return "module.tsconfig-paths";
    case "tsconfig-base-url":
      return "module.tsconfig-base-url";
    case "workspace-package":
      return "module.workspace-package";
    case "unresolved":
      return "module.unresolved-specifier";
  }

  return "module.unresolved-specifier";
}

function uniqueConfigurationPaths(configurationPaths: readonly (readonly string[])[]): readonly string[] {
  const paths: string[] = [];
  for (const candidatePaths of configurationPaths) {
    for (const path of candidatePaths) {
      if (!paths.includes(path)) {
        paths.push(path);
      }
    }
  }
  return paths;
}

function buildFiles(
  sourceDocuments: readonly SourceDocument[],
  indexedAt: string
): GraphSnapshot["files"] {
  return sourceDocuments
    .map((document) => ({
      path: document.relativePath,
      contentHash: document.contentHash,
      language: document.language,
      indexedAt
    }))
    .sort((left, right) => compareStableText(left.path, right.path));
}

function uniqueSymbolCandidates(
  symbols: readonly SymbolNode[],
  predicate: (symbol: SymbolNode) => boolean
): readonly SymbolNode[] {
  return symbols.filter(predicate).sort((left, right) => compareStableText(left.id, right.id));
}

function bindingKey(filePath: string, name: string): string {
  return `${filePath}\u0000${name}`;
}

function moduleKey(filePath: string, moduleSpecifier: string): string {
  return `${filePath}\u0000${moduleSpecifier}`;
}

function topLevelLocalCandidates(
  symbols: readonly SymbolNode[],
  filePath: string,
  localName: string
): readonly SymbolNode[] {
  return uniqueSymbolCandidates(
    symbols,
    (symbol) =>
      symbol.kind !== "file" &&
      symbol.filePath === filePath &&
      symbol.name === localName &&
      symbol.qualifiedName === `${filePath}#${localName}`
  );
}

interface ScopedBindingResolution {
  readonly hasBinding: boolean;
  readonly candidates: readonly SymbolNode[];
}

function resolveScopedBinding(
  referenceName: string,
  scopeIds: readonly string[],
  localBindings: ExtractedFileFacts["localBindings"],
  symbolsById: ReadonlyMap<string, SymbolNode>,
  expectedSpace: BindingSpace = "value"
): ScopedBindingResolution {
  for (const scopeId of scopeIds) {
    const bindings = localBindings.filter(
      (binding) =>
        binding.scopeId === scopeId &&
        binding.name === referenceName &&
        (binding.space ?? "value") === expectedSpace
    );
    if (bindings.length === 0) {
      continue;
    }

    const candidates = [...new Map(
      bindings
        .map((binding) => (binding.symbolId === null ? undefined : symbolsById.get(binding.symbolId)))
        .filter((symbol): symbol is SymbolNode => symbol !== undefined)
        .map((symbol) => [symbol.id, symbol])
    ).values()].sort((left, right) => compareStableText(left.id, right.id));
    return { hasBinding: true, candidates };
  }

  return { hasBinding: false, candidates: [] };
}

interface ExportCandidate {
  readonly symbol: SymbolNode;
  /** Exporter-to-declaration route, excluding the eventual importing file. */
  readonly path: readonly string[];
  readonly configurationPaths: readonly string[];
  /** True when one or more export hops makes the declaration type-only. */
  readonly isTypeOnly: boolean;
}

interface ExportSurfaceEntry {
  readonly candidates: readonly ExportCandidate[];
  readonly explicit: boolean;
  readonly ambiguous: boolean;
}

type ExportSurface = ReadonlyMap<string, ExportSurfaceEntry>;

function compareExportCandidates(left: ExportCandidate, right: ExportCandidate): number {
  const bySymbol = compareStableText(left.symbol.id, right.symbol.id);
  if (bySymbol !== 0) {
    return bySymbol;
  }

  if (left.isTypeOnly !== right.isTypeOnly) {
    return left.isTypeOnly ? 1 : -1;
  }

  const byPath = compareStableText(left.path.join("\u0001"), right.path.join("\u0001"));
  return byPath === 0
    ? compareStableText(
        left.configurationPaths.join("\u0001"),
        right.configurationPaths.join("\u0001")
      )
    : byPath;
}

function canonicalExportCandidates(candidates: readonly ExportCandidate[]): readonly ExportCandidate[] {
  const bySymbolId = new Map<string, ExportCandidate>();
  for (const candidate of [...candidates].sort(compareExportCandidates)) {
    const existing = bySymbolId.get(candidate.symbol.id);
    if (existing === undefined || (existing.isTypeOnly && !candidate.isTypeOnly)) {
      bySymbolId.set(candidate.symbol.id, candidate);
    }
  }
  return [...bySymbolId.values()].sort(compareExportCandidates);
}

function exportSurfaceEntry(
  candidates: readonly ExportCandidate[],
  explicit: boolean,
  ambiguous = false
): ExportSurfaceEntry {
  const canonicalCandidates = canonicalExportCandidates(candidates);
  return {
    candidates: canonicalCandidates,
    explicit,
    ambiguous: ambiguous || canonicalCandidates.length > 1
  };
}

function mergeExplicitEntry(
  existing: ExportSurfaceEntry | undefined,
  candidates: readonly ExportCandidate[],
  ambiguous = false
): ExportSurfaceEntry {
  return exportSurfaceEntry(
    [...(existing?.candidates ?? []), ...candidates],
    true,
    (existing?.ambiguous ?? false) || ambiguous
  );
}

function directExportSurface(facts: ExtractedFileFacts, filePath: string): ExportSurface {
  const surface = new Map<string, ExportSurfaceEntry>();
  const defaultExportLocalNames = new Set(
    facts.exportBindings
      .filter((binding) => binding.exportedName === "default")
      .map((binding) => binding.localName)
  );
  const addLocal = (exportedName: string, localName: string, isTypeOnly = false): boolean => {
    const candidates = topLevelLocalCandidates(facts.symbols, filePath, localName).map((symbol) => ({
      symbol,
      path: [filePath],
      configurationPaths: [],
      isTypeOnly
    }));
    if (candidates.length === 0) {
      return false;
    }
    surface.set(exportedName, mergeExplicitEntry(surface.get(exportedName), candidates));
    return true;
  };

  for (const symbol of facts.symbols) {
    if (
      symbol.kind !== "file" &&
      symbol.isExported &&
      !defaultExportLocalNames.has(symbol.name) &&
      symbol.qualifiedName === `${filePath}#${symbol.name}`
    ) {
      addLocal(symbol.name, symbol.name);
    }
  }
  for (const binding of facts.exportBindings) {
    addLocal(binding.exportedName, binding.localName, binding.isTypeOnly ?? false);
  }

  return surface;
}

function reExportCandidate(
  sourceFilePath: string,
  resolution: ResolvedModule,
  candidate: ExportCandidate,
  isTypeOnly = false
): ExportCandidate {
  return {
    symbol: candidate.symbol,
    path: [sourceFilePath, ...candidate.path],
    configurationPaths: uniqueConfigurationPaths([
      resolution.configurationPaths,
      candidate.configurationPaths
    ]),
    isTypeOnly: isTypeOnly || candidate.isTypeOnly
  };
}

function surfaceSignature(surface: ExportSurface): string {
  return [...surface.entries()]
    .sort(([left], [right]) => compareStableText(left, right))
    .map(([name, entry]) =>
      `${name}\u0002${entry.explicit ? "1" : "0"}\u0002${entry.ambiguous ? "1" : "0"}\u0002${entry.candidates
        .map(
          (candidate) =>
            `${candidate.symbol.id}\u0003${candidate.isTypeOnly ? "1" : "0"}\u0003${candidate.path.join("\u0003")}\u0003${candidate.configurationPaths.join("\u0003")}`
        )
        .join("\u0004")}`
    )
    .join("\u0005");
}

function surfacesEqual(
  left: ReadonlyMap<string, ExportSurface>,
  right: ReadonlyMap<string, ExportSurface>
): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const [filePath, surface] of left) {
    const other = right.get(filePath);
    if (other === undefined || surfaceSignature(surface) !== surfaceSignature(other)) {
      return false;
    }
  }
  return true;
}

function resolveExportSurfaces(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly moduleResolutionByKey: ReadonlyMap<string, ResolvedModule>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
}): ReadonlyMap<string, ExportSurface> {
  const orderedFilePaths = [...input.factsByFile.keys()].sort(compareStableText);
  let surfaces = new Map<string, ExportSurface>();
  for (const filePath of orderedFilePaths) {
    const facts = input.factsByFile.get(filePath);
    if (facts !== undefined) {
      surfaces.set(filePath, directExportSurface(facts, filePath));
    }
  }

  const maximumIterations = Math.max(
    1,
    orderedFilePaths.length +
      [...input.factsByFile.values()].reduce(
        (count, facts) => count + facts.reExportBindings.length,
        0
      ) +
      1
  );

  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    const next = new Map<string, ExportSurface>();

    for (const filePath of orderedFilePaths) {
      const facts = input.factsByFile.get(filePath);
      if (facts === undefined) {
        continue;
      }

      const surface = new Map(directExportSurface(facts, filePath));
      const wildcardBindings = facts.reExportBindings.filter((binding) => binding.kind === "wildcard");

      // `import { add } from "./math"; export { add as sum };` has no local
      // declaration in this file. It is nevertheless an explicit re-export
      // through an imported binding, so follow the module surface rather than
      // leaving `sum` as an empty local export.
      for (const binding of facts.exportBindings) {
        if (surface.has(binding.exportedName)) {
          continue;
        }
        const importedBindings = facts.importBindings.filter(
          (candidate) => candidate.localName === binding.localName
        );
        if (importedBindings.length === 0) {
          surface.set(binding.exportedName, exportSurfaceEntry([], true));
          continue;
        }

        const candidates: ExportCandidate[] = [];
        let ambiguous = false;
        for (const importedBinding of importedBindings) {
          const key = moduleKey(filePath, importedBinding.moduleSpecifier);
          const targetPath = input.moduleTargetPathByKey.get(key);
          const resolution = input.moduleResolutionByKey.get(key);
          const targetEntry = targetPath === undefined
            ? undefined
            : surfaces.get(targetPath)?.get(importedBinding.importedName);
          if (targetEntry !== undefined && resolution !== undefined) {
            candidates.push(
              ...targetEntry.candidates.map((candidate) =>
                reExportCandidate(
                  filePath,
                  resolution,
                  candidate,
                  (binding.isTypeOnly ?? false) || (importedBinding.isTypeOnly ?? false)
                )
              )
            );
            ambiguous ||= targetEntry.ambiguous;
          }
        }
        surface.set(binding.exportedName, exportSurfaceEntry(candidates, true, ambiguous));
      }

      for (const binding of facts.reExportBindings) {
        if (binding.kind === "wildcard") {
          continue;
        }
        if (surface.has(binding.exportedName)) {
          continue;
        }

        if (binding.kind === "namespace") {
          // A namespace is a module object, not a declaration. Keep it explicit
          // so a wildcard cannot incorrectly manufacture a callable target.
          surface.set(binding.exportedName, exportSurfaceEntry([], true));
          continue;
        }

        const key = moduleKey(filePath, binding.moduleSpecifier);
        const targetPath = input.moduleTargetPathByKey.get(key);
        const resolution = input.moduleResolutionByKey.get(key);
        const targetEntry = targetPath === undefined
          ? undefined
          : surfaces.get(targetPath)?.get(binding.importedName);
        const candidates =
          targetEntry === undefined || resolution === undefined
            ? []
            : targetEntry.candidates.map((candidate) =>
                reExportCandidate(filePath, resolution, candidate, binding.isTypeOnly ?? false)
              );
        surface.set(
          binding.exportedName,
          exportSurfaceEntry(candidates, true, targetEntry?.ambiguous ?? false)
        );
      }

      const wildcardCandidatesByName = new Map<
        string,
        { readonly candidates: ExportCandidate[]; readonly ambiguous: boolean }
      >();
      for (const binding of wildcardBindings) {
        const key = moduleKey(filePath, binding.moduleSpecifier);
        const targetPath = input.moduleTargetPathByKey.get(key);
        const resolution = input.moduleResolutionByKey.get(key);
        if (targetPath === undefined || resolution === undefined) {
          continue;
        }

        for (const [exportedName, targetEntry] of surfaces.get(targetPath) ?? []) {
          if (exportedName === "default" || surface.has(exportedName)) {
            continue;
          }
          const existing = wildcardCandidatesByName.get(exportedName);
          wildcardCandidatesByName.set(exportedName, {
            candidates: [
              ...(existing?.candidates ?? []),
              ...targetEntry.candidates.map((candidate) =>
                reExportCandidate(filePath, resolution, candidate, binding.isTypeOnly ?? false)
              )
            ],
            ambiguous: (existing?.ambiguous ?? false) || targetEntry.ambiguous
          });
        }
      }

      for (const [exportedName, wildcard] of [...wildcardCandidatesByName.entries()].sort(
        ([left], [right]) => compareStableText(left, right)
      )) {
        surface.set(exportedName, exportSurfaceEntry(wildcard.candidates, false, wildcard.ambiguous));
      }
      next.set(filePath, surface);
    }

    if (surfacesEqual(surfaces, next)) {
      return next;
    }
    surfaces = next;
  }

  return surfaces;
}

function candidatesForExport(
  surfaces: ReadonlyMap<string, ExportSurface>,
  filePath: string,
  exportedName: string
): readonly ExportCandidate[] {
  return surfaces.get(filePath)?.get(exportedName)?.candidates ?? [];
}

function allExportCandidatesForName(
  surfaces: ReadonlyMap<string, ExportSurface>,
  exportedName: string,
  filePaths?: ReadonlySet<string>
): readonly ExportCandidate[] {
  return canonicalExportCandidates(
    [...surfaces.entries()].flatMap(([filePath, surface]) =>
      filePaths !== undefined && !filePaths.has(filePath)
        ? []
        : (surface.get(exportedName)?.candidates ?? [])
    )
  );
}

interface HeritageReferenceContext {
  readonly relationKind: "extends" | "implements";
  /** Class extends clauses are runtime values; all other supported clauses are types. */
  readonly expectedSpace: BindingSpace;
}

function isHeritageReference(
  reference: PendingReference
): reference is PendingReference & { readonly relationKind: "extends" | "implements" } {
  return reference.relationKind === "extends" || reference.relationKind === "implements";
}

function heritageReferenceContext(
  reference: PendingReference,
  symbolsById: ReadonlyMap<string, SymbolNode>
): HeritageReferenceContext | null {
  if (!isHeritageReference(reference)) {
    return null;
  }

  const source = symbolsById.get(reference.sourceId);
  if (source?.kind === "class") {
    return {
      relationKind: reference.relationKind,
      expectedSpace: reference.relationKind === "extends" ? "value" : "type"
    };
  }

  if (source?.kind === "interface" && reference.relationKind === "extends") {
    return { relationKind: "extends", expectedSpace: "type" };
  }

  return null;
}

function isHeritageTarget(
  symbol: SymbolNode,
  context: HeritageReferenceContext
): boolean {
  if (context.relationKind === "extends" && context.expectedSpace === "value") {
    return symbol.kind === "class";
  }

  return symbol.kind === "class" || symbol.kind === "interface" || symbol.kind === "type";
}

function importBindingSupportsSpace(
  binding: ExtractedFileFacts["importBindings"][number],
  expectedSpace: BindingSpace
): boolean {
  return expectedSpace === "type" || binding.isTypeOnly !== true;
}

function exportCandidateSupportsSpace(candidate: ExportCandidate, expectedSpace: BindingSpace): boolean {
  return expectedSpace === "type" || !candidate.isTypeOnly;
}

/**
 * Resolves a static Nest module/controller identifier through the same exact
 * local/import/re-export proof used by ordinary project references. Router
 * metadata is deliberately never allowed to fall back to project-wide names.
 */
function resolveExactNestClassReference(input: {
  readonly filePath: string;
  readonly reference: NestSymbolReference;
  readonly localBindings: ExtractedFileFacts["localBindings"];
  readonly importBindings: ExtractedFileFacts["importBindings"];
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
  readonly exportSurfaces: ReadonlyMap<string, ExportSurface>;
}): SymbolNode | null {
  const local = resolveScopedBinding(
    input.reference.name,
    input.reference.scopeIds,
    input.localBindings,
    input.symbolsById,
    "value"
  );
  const localClasses = local.candidates.filter((candidate) => candidate.kind === "class");
  if (local.hasBinding) {
    return localClasses.length === 1 ? localClasses[0] ?? null : null;
  }

  const imports = input.importBindings.filter((binding) => binding.localName === input.reference.name);
  if (imports.length !== 1) {
    return null;
  }

  const binding = imports[0];
  if (binding === undefined || binding.isTypeOnly === true) {
    return null;
  }

  const targetPath = input.moduleTargetPathByKey.get(
    moduleKey(input.filePath, binding.moduleSpecifier)
  );
  if (targetPath === undefined || input.exportSurfaces.get(targetPath)?.get(binding.importedName)?.ambiguous === true) {
    return null;
  }

  const candidates = canonicalExportCandidates(
    candidatesForExport(input.exportSurfaces, targetPath, binding.importedName).filter(
      (candidate) => !candidate.isTypeOnly && candidate.symbol.kind === "class"
    )
  );
  return candidates.length === 1 ? candidates[0]?.symbol ?? null : null;
}

function routePathFromSymbol(route: SymbolNode): string | null {
  const separator = route.name.indexOf(" ");
  if (separator <= 0) {
    return null;
  }

  const path = route.name.slice(separator + 1);
  return path.startsWith("/") ? path : null;
}

function nestPathPart(path: string): string {
  return path.replace(/^\/+|\/+$/gu, "");
}

function joinNestRouterPath(prefix: string, routePath: string): string {
  const parts = [nestPathPart(prefix), nestPathPart(routePath)].filter((part) => part.length > 0);
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

interface ProjectedNestRoute {
  readonly sourceRoute: SymbolNode;
  readonly route: SymbolNode;
  readonly controllerIds: readonly string[];
  readonly moduleIds: readonly string[];
  readonly prefixApplied: boolean;
}

interface NestRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
  readonly projectionsBySourceRouteId: ReadonlyMap<string, readonly ProjectedNestRoute[]>;
}

function projectedRouteSort(left: ProjectedNestRoute, right: ProjectedNestRoute): number {
  return (
    compareStableText(left.sourceRoute.filePath, right.sourceRoute.filePath) ||
    left.sourceRoute.range.start.line - right.sourceRoute.range.start.line ||
    left.sourceRoute.range.start.column - right.sourceRoute.range.start.column ||
    compareStableText(left.route.name, right.route.name) ||
    Number(left.prefixApplied) - Number(right.prefixApplied) ||
    compareStableText(left.sourceRoute.id, right.sourceRoute.id) ||
    compareStableText(left.moduleIds.join("\u0001"), right.moduleIds.join("\u0001"))
  );
}

function projectedRouteSymbol(route: SymbolNode, path: string, declarationOrdinal: number): SymbolNode {
  const methodSeparator = route.name.indexOf(" ");
  const method = route.name.slice(0, methodSeparator);
  const name = `${method} ${path}`;
  const qualifiedName = `${route.filePath}#route:${name}`;
  return {
    ...route,
    id: createSymbolId({
      filePath: route.filePath,
      qualifiedName,
      kind: "route",
      declarationOrdinal
    }),
    name,
    qualifiedName,
    declarationOrdinal
  };
}

function projectedRouteEdge(
  edge: GraphEdge,
  source: ProjectedNestRoute | undefined,
  target: ProjectedNestRoute | undefined
): GraphEdge {
  const sourceId = source?.route.id ?? edge.sourceId;
  const targetId = target?.route.id ?? edge.targetId;
  const referenceName =
    edge.kind === "contains" && target !== undefined ? target.route.name : edge.referenceName;
  const evidence =
    edge.kind === "contains" && target !== undefined
      ? {
          ruleId: "syntax.containment",
          stage: "syntax" as const,
          candidateSymbolIds: [target.route.id]
        }
      : edge.kind === "routes" && source?.prefixApplied === true
      ? {
          ruleId: "framework.nestjs.router-module.exact-prefix",
          stage: "module" as const,
          candidateSymbolIds: [
            ...(edge.targetId === null ? [] : [edge.targetId]),
            ...source.controllerIds,
            ...source.moduleIds
          ].sort(compareStableText)
        }
      : edge.evidence;

  return {
    ...edge,
    id: createEdgeId({
      sourceId,
      targetId,
      kind: edge.kind,
      line: edge.range.start.line,
      column: edge.range.start.column,
      referenceName
    }),
    sourceId,
    targetId,
    referenceName,
    ...(evidence === undefined ? {} : { evidence })
  };
}

function projectEdgesThroughRoutes(
  edges: readonly GraphEdge[],
  projectionsBySourceRouteId: ReadonlyMap<string, readonly ProjectedNestRoute[]>
): readonly GraphEdge[] {
  return edges.flatMap((edge) => {
    const sources = projectionsBySourceRouteId.get(edge.sourceId) ?? [undefined];
    const targets =
      edge.targetId === null
        ? [undefined]
        : projectionsBySourceRouteId.get(edge.targetId) ?? [undefined];
    return sources.flatMap((source) =>
      targets.map((target) => projectedRouteEdge(edge, source, target))
    );
  });
}

function projectPendingReferencesThroughRoutes(
  references: readonly PendingReference[],
  projectionsBySourceRouteId: ReadonlyMap<string, readonly ProjectedNestRoute[]>
): readonly PendingReference[] {
  return references.flatMap((reference) => {
    const sources = projectionsBySourceRouteId.get(reference.sourceId) ?? [undefined];
    return sources.map((source) => {
      if (source === undefined) {
        return reference;
      }
      const sourceId = source.route.id;
      return {
        ...reference,
        id: createEdgeId({
          sourceId,
          targetId: null,
          kind: reference.relationKind,
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.referenceName
        }),
        sourceId
      };
    });
  });
}

function projectNestRouterRoutes(input: {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly localBindingsByFile: ReadonlyMap<string, ExtractedFileFacts["localBindings"]>;
  readonly importBindingsByFile: ReadonlyMap<string, ExtractedFileFacts["importBindings"]>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
  readonly exportSurfaces: ReadonlyMap<string, ExportSurface>;
}): NestRouteProjection {
  const routeControllerIds = new Map<string, Set<string>>();
  const controllerModuleIds = new Map<string, Set<string>>();
  const modulePrefixes = new Map<string, Set<string>>();
  const nestReference = (filePath: string, reference: NestSymbolReference): SymbolNode | null =>
    resolveExactNestClassReference({
      filePath,
      reference,
      localBindings: input.localBindingsByFile.get(filePath) ?? [],
      importBindings: input.importBindingsByFile.get(filePath) ?? [],
      symbolsById: input.symbolsById,
      moduleTargetPathByKey: input.moduleTargetPathByKey,
      exportSurfaces: input.exportSurfaces
    });

  for (const [filePath, facts] of input.factsByFile) {
    const nestFacts = facts.nestRouteFacts;
    if (nestFacts === undefined) {
      continue;
    }

    for (const binding of nestFacts.routeControllers) {
      const controller = input.symbolsById.get(binding.controllerId);
      if (controller?.kind !== "class" || !input.symbolsById.has(binding.routeId)) {
        continue;
      }
      const controllers = routeControllerIds.get(binding.routeId) ?? new Set<string>();
      controllers.add(controller.id);
      routeControllerIds.set(binding.routeId, controllers);
    }

    for (const binding of nestFacts.moduleControllers) {
      const module = input.symbolsById.get(binding.moduleId);
      const controller = nestReference(filePath, binding.controller);
      if (module?.kind !== "class" || controller?.kind !== "class") {
        continue;
      }
      const modules = controllerModuleIds.get(controller.id) ?? new Set<string>();
      modules.add(module.id);
      controllerModuleIds.set(controller.id, modules);
    }

    for (const binding of nestFacts.routerModulePrefixes) {
      const module = nestReference(filePath, binding.module);
      if (module?.kind !== "class") {
        continue;
      }
      const prefixes = modulePrefixes.get(module.id) ?? new Set<string>();
      prefixes.add(binding.prefix);
      modulePrefixes.set(module.id, prefixes);
    }
  }

  const projections: ProjectedNestRoute[] = [];
  for (const sourceRoute of input.symbols.filter((symbol) => symbol.kind === "route")) {
    const localPath = routePathFromSymbol(sourceRoute);
    const controllerIds = [...(routeControllerIds.get(sourceRoute.id) ?? [])].sort(compareStableText);
    if (localPath === null || controllerIds.length === 0) {
      projections.push({
        sourceRoute,
        route: sourceRoute,
        controllerIds: [],
        moduleIds: [],
        prefixApplied: false
      });
      continue;
    }

    const modules = [...new Set(controllerIds.flatMap((controllerId) => [...(controllerModuleIds.get(controllerId) ?? [])]))]
      .sort(compareStableText);
    const prefixedByPath = new Map<string, Set<string>>();
    let preserveLocalRoute = modules.length === 0;
    for (const moduleId of modules) {
      const prefixes = modulePrefixes.get(moduleId);
      if (prefixes === undefined || prefixes.size === 0) {
        preserveLocalRoute = true;
        continue;
      }
      for (const prefix of prefixes) {
        const path = joinNestRouterPath(prefix, localPath);
        const routeModules = prefixedByPath.get(path) ?? new Set<string>();
        routeModules.add(moduleId);
        prefixedByPath.set(path, routeModules);
      }
    }

    if (preserveLocalRoute) {
      projections.push({
        sourceRoute,
        route: sourceRoute,
        controllerIds,
        moduleIds: [],
        prefixApplied: false
      });
    }
    for (const [path, moduleIds] of [...prefixedByPath.entries()].sort(([left], [right]) =>
      compareStableText(left, right)
    )) {
      projections.push({
        sourceRoute,
        route: projectedRouteSymbol(sourceRoute, path, sourceRoute.declarationOrdinal),
        controllerIds,
        moduleIds: [...moduleIds].sort(compareStableText),
        prefixApplied: true
      });
    }
  }

  const ordinalByQualifiedName = new Map<string, number>();
  const normalizedProjections = projections
    .sort(projectedRouteSort)
    .map((projection) => {
      const ordinalKey = `${projection.route.filePath}\u0000${projection.route.qualifiedName}`;
      const declarationOrdinal = ordinalByQualifiedName.get(ordinalKey) ?? 0;
      ordinalByQualifiedName.set(ordinalKey, declarationOrdinal + 1);
      return {
        ...projection,
        route: projectedRouteSymbol(
          projection.sourceRoute,
          routePathFromSymbol(projection.route) ?? routePathFromSymbol(projection.sourceRoute) ?? "/",
          declarationOrdinal
        )
      };
    });
  const projectionsBySourceRouteId = new Map<string, ProjectedNestRoute[]>();
  for (const projection of normalizedProjections) {
    const entries = projectionsBySourceRouteId.get(projection.sourceRoute.id) ?? [];
    entries.push(projection);
    projectionsBySourceRouteId.set(projection.sourceRoute.id, entries);
  }

  const structuralEdges = projectEdgesThroughRoutes(input.structuralEdges, projectionsBySourceRouteId);
  return {
    symbols: [
      ...input.symbols.filter((symbol) => symbol.kind !== "route"),
      ...normalizedProjections.map((projection) => projection.route)
    ],
    structuralEdges,
    projectionsBySourceRouteId
  };
}

function heritageRuleId(
  relationKind: HeritageReferenceContext["relationKind"],
  suffix: "local-value-binding" | "local-type-binding" | "imported-target" | "reexported-target" | "unresolved-target"
): string {
  return `heritage.${relationKind}.${suffix}`;
}

/**
 * Resolves local declarations and explicit named import/export bindings exactly. Any
 * remaining unique-name inference stays heuristic so the graph never overstates proof.
 */
export function resolveProjectFacts(input: {
  readonly sourceDocuments: readonly SourceDocument[];
  readonly extractedFiles: readonly ExtractedFileFacts[];
  readonly indexedAt: string;
  /** Optional for v0.2-compatible callers; the catalog supplies it for indexed projects. */
  readonly moduleResolver?: ProjectModuleResolver;
}): GraphSnapshot {
  const symbols = input.extractedFiles.flatMap((facts) => facts.symbols);
  const structuralEdges = input.extractedFiles.flatMap((facts) => facts.edges);
  const references = input.extractedFiles.flatMap((facts) => facts.pendingReferences);
  const knownFilePaths = new Set(input.sourceDocuments.map((document) => document.relativePath));
  const fileSymbols = new Map(
    symbols.filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol])
  );
  const symbolsById = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const factsByFile = new Map<string, ExtractedFileFacts>();
  const importBindingsByFile = new Map<string, ExtractedFileFacts["importBindings"]>();
  const localBindingsByFile = new Map<string, ExtractedFileFacts["localBindings"]>();
  const referenceScopeIdsByReferenceId = new Map<string, readonly string[]>();
  const importTargetPathsByFile = new Map<string, Set<string>>();
  const moduleTargetPathByKey = new Map<string, string>();
  const moduleResolutionByKey = new Map<string, ResolvedModule>();
  const resolvedEdges: GraphEdge[] = [];
  const unresolvedReferences: PendingReference[] = [];

  for (const facts of input.extractedFiles) {
    const sourceFile = facts.symbols.find((symbol) => symbol.kind === "file");
    if (sourceFile === undefined) {
      continue;
    }
    factsByFile.set(sourceFile.filePath, facts);
    importBindingsByFile.set(sourceFile.filePath, facts.importBindings);
    localBindingsByFile.set(sourceFile.filePath, facts.localBindings);
    for (const referenceScope of facts.referenceScopes) {
      referenceScopeIdsByReferenceId.set(referenceScope.referenceId, referenceScope.scopeIds);
    }
  }

  for (const reference of [...references].sort((left, right) => compareStableText(left.id, right.id))) {
    if (reference.relationKind !== "imports" && reference.relationKind !== "exports") {
      continue;
    }

    const key = moduleKey(reference.filePath, reference.referenceName);
    const moduleResolution =
      moduleResolutionByKey.get(key) ??
      (input.moduleResolver?.resolve(reference.filePath, reference.referenceName) ??
        fallbackModuleResolution(knownFilePaths, reference.filePath, reference.referenceName));
    moduleResolutionByKey.set(key, moduleResolution);
    const targetPath =
      moduleResolution.strategy === "unresolved" ||
      moduleResolution.targetFilePath === null ||
      !knownFilePaths.has(moduleResolution.targetFilePath)
        ? undefined
        : moduleResolution.targetFilePath;
    const target = targetPath === undefined ? undefined : fileSymbols.get(targetPath);
    const moduleCandidates = (targetPath === undefined ? [] : [targetPath])
      .map((path) => fileSymbols.get(path))
      .filter((candidate): candidate is SymbolNode => candidate !== undefined)
      .sort((left, right) => compareStableText(left.id, right.id));
    if (target === undefined || targetPath === undefined) {
      unresolvedReferences.push(reference);
      resolvedEdges.push(
        referenceEdge(
          reference,
          null,
          "unresolved",
          0,
          referenceEvidence(
            "module.unresolved-specifier",
            "unresolved",
            candidateSymbolIds(moduleCandidates),
            moduleResolution.configurationPaths
          )
        )
      );
      continue;
    }

    moduleTargetPathByKey.set(key, targetPath);
    resolvedEdges.push(
      referenceEdge(
        reference,
        target.id,
        "exact",
        1,
        referenceEvidence(
          moduleRuleId(moduleResolution.strategy),
          "module",
          candidateSymbolIds(moduleCandidates),
          moduleResolution.configurationPaths
        )
      )
    );
    if (reference.relationKind === "imports") {
      const targetPaths = importTargetPathsByFile.get(reference.filePath) ?? new Set<string>();
      targetPaths.add(targetPath);
      importTargetPathsByFile.set(reference.filePath, targetPaths);
    }
  }

  const exportSurfaces = resolveExportSurfaces({
    factsByFile,
    moduleResolutionByKey,
    moduleTargetPathByKey
  });

  for (const reference of [...references].sort((left, right) => compareStableText(left.id, right.id))) {
    const isHeritage = isHeritageReference(reference);
    if (reference.relationKind !== "calls" && reference.relationKind !== "routes" && !isHeritage) {
      continue;
    }
    const isRouteHandler = reference.relationKind === "routes";
    const heritage = isHeritage ? heritageReferenceContext(reference, symbolsById) : null;
    if (isHeritage && heritage === null) {
      unresolvedReferences.push(reference);
      resolvedEdges.push(
        referenceEdge(
          reference,
          null,
          "unresolved",
          0,
          referenceEvidence(
            heritageRuleId(reference.relationKind, "unresolved-target"),
            "unresolved",
            []
          )
        )
      );
      continue;
    }
    const expectedSpace = heritage?.expectedSpace ?? "value";

    const scopedLocal = resolveScopedBinding(
      reference.referenceName,
      referenceScopeIdsByReferenceId.get(reference.id) ?? [],
      localBindingsByFile.get(reference.filePath) ?? [],
      symbolsById,
      expectedSpace
    );
    const matchingImportedBindings = (importBindingsByFile.get(reference.filePath) ?? [])
      .filter((binding) => binding.localName === reference.referenceName)
      .map((binding) => {
        const key = moduleKey(reference.filePath, binding.moduleSpecifier);
        return {
          binding,
          targetPath: moduleTargetPathByKey.get(key),
          resolution: moduleResolutionByKey.get(key)
        };
      });
    const exactImportedBindings = matchingImportedBindings.filter(({ binding }) =>
      heritage === null ? true : importBindingSupportsSpace(binding, heritage.expectedSpace)
    );
    const allExactImportedCandidates = canonicalExportCandidates(
      matchingImportedBindings.flatMap(({ binding, targetPath }) =>
        targetPath === undefined
          ? []
          : candidatesForExport(exportSurfaces, targetPath, binding.importedName)
      )
    );
    const exactImportedCandidates = canonicalExportCandidates(
      exactImportedBindings.flatMap(({ binding, targetPath }) =>
        targetPath === undefined
          ? []
          : candidatesForExport(exportSurfaces, targetPath, binding.importedName)
      ).filter((candidate) =>
        heritage === null ||
        (exportCandidateSupportsSpace(candidate, heritage.expectedSpace) &&
          isHeritageTarget(candidate.symbol, heritage))
      )
    );
    const exactImportedSymbols = exactImportedCandidates.map((candidate) => candidate.symbol);
    const allExactImportedSymbols = allExactImportedCandidates.map((candidate) => candidate.symbol);
    const exactImportedConfigurationPaths = uniqueConfigurationPaths([
      ...matchingImportedBindings.map(({ resolution }) => resolution?.configurationPaths ?? []),
      ...allExactImportedCandidates.map((candidate) => candidate.configurationPaths)
    ]);
    const importedTargetPaths = importTargetPathsByFile.get(reference.filePath) ?? new Set<string>();
    const importedCandidates = allExportCandidatesForName(
      exportSurfaces,
      reference.referenceName,
      importedTargetPaths
    );
    const exportedCandidates = allExportCandidatesForName(exportSurfaces, reference.referenceName);
    const scopedCandidates =
      heritage === null
        ? scopedLocal.candidates
        : scopedLocal.candidates.filter((candidate) => isHeritageTarget(candidate, heritage));

    if (scopedLocal.hasBinding) {
      if (scopedCandidates.length === 1 && scopedCandidates[0] !== undefined) {
        resolvedEdges.push(
          referenceEdge(
            reference,
            scopedCandidates[0].id,
            "exact",
            1,
            referenceEvidence(
              heritage !== null
                ? heritageRuleId(
                    heritage.relationKind,
                    heritage.expectedSpace === "value" ? "local-value-binding" : "local-type-binding"
                  )
                : isRouteHandler
                ? "framework.express.literal-route.local-handler"
                : "lexical.local-binding",
              "lexical",
              candidateSymbolIds(scopedLocal.candidates)
            )
          )
        );
      } else {
        unresolvedReferences.push(reference);
        resolvedEdges.push(
          referenceEdge(
            reference,
            null,
            "unresolved",
            0,
            referenceEvidence(
              heritage !== null
                ? heritageRuleId(heritage.relationKind, "unresolved-target")
                : isRouteHandler
                ? "framework.express.literal-route.unresolved-handler"
                : "reference.unresolved",
              "unresolved",
              candidateSymbolIds(scopedLocal.candidates)
            )
          )
        );
      }
      continue;
    }

    if (
      exactImportedCandidates.length === 1 &&
      exactImportedCandidates[0] !== undefined &&
      !(
        exactImportedBindings.some(({ binding, targetPath }) =>
          targetPath === undefined || exportSurfaces.get(targetPath)?.get(binding.importedName)?.ambiguous === true
        )
      )
    ) {
      const candidate = exactImportedCandidates[0];
      const resolutionPath =
        candidate.path.length > 1 ? [reference.filePath, ...candidate.path] : [];
      resolvedEdges.push(
        referenceEdge(
          reference,
          candidate.symbol.id,
          "exact",
          1,
          referenceEvidence(
            heritage !== null
              ? heritageRuleId(
                  heritage.relationKind,
                  resolutionPath.length === 0 ? "imported-target" : "reexported-target"
                )
              : isRouteHandler
              ? resolutionPath.length === 0
                ? "framework.express.literal-route.imported-handler"
                : "framework.express.literal-route.reexported-handler"
              : resolutionPath.length === 0
                ? "module.explicit-import-binding"
                : "module.reexported-import-binding",
            "module",
            candidateSymbolIds(exactImportedSymbols),
            exactImportedConfigurationPaths,
            resolutionPath
          )
        )
      );
      continue;
    }

    // An explicit import binding is stronger evidence than a project-wide
    // name match. If its requested export is absent, ambiguous, or unresolved,
    // do not let an unrelated global export turn that binding into a false call
    // edge (notably for `export * as namespace` module objects).
    if (exactImportedBindings.length > 0 || (heritage !== null && matchingImportedBindings.length > 0)) {
      unresolvedReferences.push(reference);
      resolvedEdges.push(
        referenceEdge(
          reference,
          null,
          "unresolved",
          0,
          referenceEvidence(
            heritage !== null
              ? heritageRuleId(heritage.relationKind, "unresolved-target")
              : isRouteHandler
              ? "framework.express.literal-route.unresolved-handler"
              : "reference.unresolved",
            "unresolved",
            candidateSymbolIds(heritage === null ? exactImportedSymbols : allExactImportedSymbols),
            exactImportedConfigurationPaths
          )
        )
      );
      continue;
    }

    // Heritage is deliberately stricter than ordinary calls. An identifier in
    // `extends` or `implements` needs a direct lexical, import, or re-export
    // proof in its required namespace; a project-wide name match would make a
    // type relationship look certain when it is not.
    if (heritage !== null) {
      unresolvedReferences.push(reference);
      resolvedEdges.push(
        referenceEdge(
          reference,
          null,
          "unresolved",
          0,
          referenceEvidence(
            heritageRuleId(heritage.relationKind, "unresolved-target"),
            "unresolved",
            candidateSymbolIds(allExactImportedSymbols),
            exactImportedConfigurationPaths
          )
        )
      );
      continue;
    }

    // Route handler bindings require an explicit lexical, import, or re-export
    // proof. Unlike ordinary call expressions, a unique name elsewhere in the
    // project is not sufficient evidence to bind a framework route.
    if (isRouteHandler) {
      unresolvedReferences.push(reference);
      resolvedEdges.push(
        referenceEdge(
          reference,
          null,
          "unresolved",
          0,
          referenceEvidence(
            "framework.express.literal-route.unresolved-handler",
            "unresolved",
            candidateSymbolIds(
              exactImportedSymbols,
              importedCandidates.map((candidate) => candidate.symbol),
              exportedCandidates.map((candidate) => candidate.symbol)
            ),
            exactImportedConfigurationPaths
          )
        )
      );
      continue;
    }

    if (importedCandidates.length === 1 && importedCandidates[0] !== undefined) {
      resolvedEdges.push(
        referenceEdge(
          reference,
          importedCandidates[0].symbol.id,
          "heuristic",
          0.8,
          referenceEvidence(
            "heuristic.unique-imported-export",
            "heuristic",
            candidateSymbolIds(importedCandidates.map((candidate) => candidate.symbol))
          )
        )
      );
      continue;
    }

    if (exportedCandidates.length === 1 && exportedCandidates[0] !== undefined) {
      resolvedEdges.push(
        referenceEdge(
          reference,
          exportedCandidates[0].symbol.id,
          "heuristic",
          0.5,
          referenceEvidence(
            "heuristic.unique-exported-name",
            "heuristic",
            candidateSymbolIds(exportedCandidates.map((candidate) => candidate.symbol))
          )
        )
      );
      continue;
    }

    unresolvedReferences.push(reference);
    resolvedEdges.push(
      referenceEdge(
        reference,
        null,
        "unresolved",
        0,
        referenceEvidence(
          "reference.unresolved",
          "unresolved",
          candidateSymbolIds(
            exactImportedSymbols,
            importedCandidates.map((candidate) => candidate.symbol),
            exportedCandidates.map((candidate) => candidate.symbol)
          ),
          exactImportedConfigurationPaths
        )
      )
    );
  }

  const nestRouteProjection = projectNestRouterRoutes({
    symbols,
    structuralEdges,
    factsByFile,
    localBindingsByFile,
    importBindingsByFile,
    symbolsById,
    moduleTargetPathByKey,
    exportSurfaces
  });
  const projectedResolvedEdges = projectEdgesThroughRoutes(
    resolvedEdges,
    nestRouteProjection.projectionsBySourceRouteId
  );
  const projectedUnresolvedReferences = projectPendingReferencesThroughRoutes(
    unresolvedReferences,
    nestRouteProjection.projectionsBySourceRouteId
  );
  const edgeById = new Map<string, GraphEdge>();
  for (const edge of [...nestRouteProjection.structuralEdges, ...projectedResolvedEdges]) {
    edgeById.set(edge.id, edge);
  }

  return {
    files: buildFiles(input.sourceDocuments, input.indexedAt),
    symbols: [...nestRouteProjection.symbols].sort((left, right) => compareStableText(left.id, right.id)),
    edges: [...edgeById.values()].sort((left, right) => compareStableText(left.id, right.id)),
    pendingReferences: [...projectedUnresolvedReferences].sort((left, right) =>
      compareStableText(left.id, right.id)
    )
  };
}
