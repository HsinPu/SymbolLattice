import { projectFrameworkRoutePluginImportedMounts, projectNestRouterRoutes, projectEdgesThroughRoutes, projectPendingReferencesThroughRoutes, resolveExactFastifyPluginReference, isFastifyPluginSymbol } from "./resolvers/framework-route-project-resolver.js";
import { projectSanicImportedBlueprintRoutes } from "./resolvers/sanic-project-resolver.js";
import { projectDjangoUrlconfRoutes } from "./resolvers/django-urlconf-project-resolver.js";
import { resolveExactRailsRouteHandler, railsRouteHandlerRuleId } from "./resolvers/rails-project-resolver.js";
import { projectDjangoNinjaImportedRouterRoutes } from "./resolvers/django-ninja-project-resolver.js";
import { projectFlaskImportedBlueprintRoutes } from "./resolvers/flask-project-resolver.js";
import { projectFastifyImportedPluginRoutes } from "./resolvers/fastify-project-resolver.js";
import { projectFastApiImportedRouterRoutes } from "./resolvers/fastapi-project-resolver.js";
import { projectRustActixImportedServiceConfigRoutes } from "./resolvers/rust-actix-project-resolver.js";
import { projectGoFrameStandardRouterRoutes } from "./resolvers/goframe-project-resolver.js";
import { projectReactNativeNativeModuleCalls, projectReactNativeSwiftExternalBridgeReferences, projectReactNativeTurboModuleCalls, projectReactNativeTurboModuleSpecMethods, projectReactNativeTurboModuleDefaultImportCalls } from "./resolvers/react-native-project-resolver.js";
import { projectJvmCallableSignatureReferences, projectJavaInstantiationReferences, projectJavaCallReferences, projectJvmDependencyInjectionReferences } from "./resolvers/java-call-project-resolver.js";
import { projectNestGraphqlResolverSchemaReferences } from "./resolvers/nest-graphql-project-resolver.js";
import { projectSpringBootPropertiesReferences, projectSpringBootConfigurationPropertiesPrefixes } from "./resolvers/spring-config-project-resolver.js";
import { resolveCobolCicsTransactionTarget } from "./resolvers/cobol-project-resolver.js";
import { resolveExactPlayRouteHandler, projectPlayRouterMountEdges } from "./resolvers/play-project-resolver.js";
import { projectMarkdownFileReferences } from "./resolvers/markdown-project-resolver.js";
import { projectLiquidTemplateReferences } from "./resolvers/liquid-project-resolver.js";
import { projectTwigTemplateReferences } from "./resolvers/twig-project-resolver.js";
import { projectJspTemplateReferences } from "./resolvers/jsp-project-resolver.js";
import { projectBladeTemplateReferences } from "./resolvers/blade-project-resolver.js";
import { projectRazorPagesReferences } from "./resolvers/razor-project-resolver.js";
import { projectSolidityInheritance } from "./resolvers/solidity-project-resolver.js";
import { projectAdaProjectFacts, projectAdaCallReferences } from "./resolvers/ada-project-resolver.js";
import { projectRustProjectFacts, projectRustLocalFacts } from "./resolvers/rust-project-resolver.js";
import { projectNixRelationFacts } from "./resolvers/nix-project-resolver.js";
import { projectCRelationFacts } from "./resolvers/c-project-resolver.js";
import { projectPhpRelationFacts } from "./resolvers/php-project-resolver.js";
import { projectCppRelationFacts } from "./resolvers/cpp-project-resolver.js";
import { projectPascalCallReferences } from "./resolvers/pascal-project-resolver.js";
import { projectSqlRelationFacts } from "./resolvers/sql-project-resolver.js";
import { projectRRelationFacts } from "./resolvers/r-project-resolver.js";
import { projectProtoRelationFacts } from "./resolvers/proto-project-resolver.js";
import { projectGraphqlRelationFacts } from "./resolvers/graphql-project-resolver.js";
import { projectZigRelationFacts } from "./resolvers/zig-project-resolver.js";
import { projectObjectiveCRelationFacts } from "./resolvers/objectivec-project-resolver.js";
import { projectRubyRelationFacts } from "./resolvers/ruby-project-resolver.js";
import { projectElixirRelationFacts } from "./resolvers/elixir-project-resolver.js";
import { projectErlangRelationFacts } from "./resolvers/erlang-project-resolver.js";
import { projectClojureRelationFacts } from "./resolvers/clojure-project-resolver.js";
import { projectNimRelationFacts } from "./resolvers/nim-project-resolver.js";
import { projectFsharpRelationFacts } from "./resolvers/fsharp-project-resolver.js";
import { projectOcamlRelationFacts } from "./resolvers/ocaml-project-resolver.js";
import { projectHaskellRelationFacts } from "./resolvers/haskell-project-resolver.js";
import { projectScalaRelationFacts } from "./resolvers/scala-project-resolver.js";
import { projectKotlinRelationFacts } from "./resolvers/kotlin-project-resolver.js";
import { projectSwiftRelationFacts } from "./resolvers/swift-project-resolver.js";
import { projectDartRelationFacts } from "./resolvers/dart-project-resolver.js";
import { projectCsharpRelationFacts } from "./resolvers/csharp-project-resolver.js";
import { projectFortranCallReferences } from "./resolvers/fortran-project-resolver.js";
import { projectGoProjectFacts } from "./resolvers/go-project-resolver.js";
import { projectPythonRegularPackageRelativeNamedImports } from "./resolvers/python-project-resolver.js";
import { projectJavaAnnotationReferences, projectJavaImportReferences, projectJvmHeritageReferences, type JvmResolverDependencies } from "./resolvers/jvm-project-resolver.js";

import {
  compareStableText,
  classifyGeneratedFile,
  classifySourceRole,
  createEdgeId,
  isCustomRouteFramework,
  type BindingSpace,
  type EdgeEvidence,
  type GraphEdge,
  type GraphSnapshot,
  type PendingReference,
  type ResolutionKind,
  type RoutePrefixSegment,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import type { ExtractedFileFacts } from "../extraction/index.js";
import {
  projectFrameworkPluginOutputs,
  type FrameworkProjectPluginRegistry
} from "./framework-project-plugins.js";
import {
  REFERENCE_RESOLVER_PLUGIN_RULE_NAME_PATTERN,
  requireReferenceResolverPluginRegistry,
  type ReferenceResolverPluginCandidate,
  type ReferenceResolverPluginRegistry,
  type ReferenceResolverPluginResult
} from "./reference-resolver-plugins.js";
import type { ProjectModuleResolver, ResolvedModule, SourceDocument, JvmProjectModuleEvidence, XcodeTargetMembership } from "../ports/source-catalog.js";

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

function modulePathCandidates(fromFilePath: string, moduleSpecifier: string, knownFilePaths: ReadonlySet<string>): readonly string[] {
  const parts = normalizedParts(fromFilePath, moduleSpecifier);
  if (parts === null) {
    return [];
  }

  const rawPath = parts.join("/");
  // A literal existing JavaScript file is not ambiguous with a sibling format.
  // Preserve source substitution for TypeScript importers and missing literals.
  if (/\.(?:js|mjs|cjs)$/.test(fromFilePath) && /\.(?:js|mjs|cjs)$/.test(moduleSpecifier) && knownFilePaths.has(rawPath)) {
    return [rawPath];
  }
  const extensionMatch = /\.(?:[cm]?[jt]sx?|ets)$/i.exec(rawPath);
  const withoutExtension = extensionMatch === null ? rawPath : rawPath.slice(0, -extensionMatch[0].length);
  const candidates = new Set<string>([rawPath]);

  for (const extension of [".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".ets"]) {
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
    evidence: {
      ...evidence,
      ...(reference.extractionPlugin === undefined
        ? {}
        : { extractionPlugin: reference.extractionPlugin }),
      ...(reference.projectPlugin === undefined ? {} : { projectPlugin: reference.projectPlugin })
    }
  };
}

function candidateSymbolIds(...candidateSets: readonly (readonly SymbolNode[])[]): readonly string[] {
  return [...new Set(candidateSets.flatMap((candidates) => candidates.map((candidate) => candidate.id)))].sort(
    compareStableText
  );
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

function referenceEvidence(
  ruleId: EdgeEvidence["ruleId"],
  stage: EdgeEvidence["stage"],
  candidateIds: readonly string[],
  configurationPaths: readonly string[] = [],
  resolutionPath: readonly string[] = [],
  routePrefixChain: readonly RoutePrefixSegment[] = []
): EdgeEvidence {
  const evidence: EdgeEvidence = {
    ruleId,
    stage,
    candidateSymbolIds: [...new Set(candidateIds)].sort(compareStableText)
  };
  const canonicalConfigurationPaths = uniqueConfigurationPaths([configurationPaths]);
  const canonicalResolutionPath = [...new Set(resolutionPath)];
  const capturedRoutePrefixChain = [...routePrefixChain];

  return {
    ...evidence,
    ...(canonicalConfigurationPaths.length === 0 ? {} : { configurationPaths: canonicalConfigurationPaths }),
    ...(canonicalResolutionPath.length === 0 ? {} : { resolutionPath: canonicalResolutionPath }),
    ...(capturedRoutePrefixChain.length === 0 ? {} : { routePrefixChain: capturedRoutePrefixChain })
  };
}

const MAX_REFERENCE_RESOLVER_PROJECT_CANDIDATES = 128;

interface ReferenceResolverPluginProjection {
  readonly edge: GraphEdge;
  readonly resolved: boolean;
}

function pluginCandidate(
  symbol: SymbolNode,
  resolutionPath: readonly string[] = [],
  configurationPaths: readonly string[] = []
): ReferenceResolverPluginCandidate {
  return Object.freeze({
    symbol,
    resolutionPath: Object.freeze([...resolutionPath]),
    configurationPaths: Object.freeze([...configurationPaths])
  });
}

function validateReferenceResolverPluginResult(input: {
  readonly pluginId: string;
  readonly result: unknown;
  readonly candidatesById: ReadonlyMap<string, ReferenceResolverPluginCandidate>;
}): ReferenceResolverPluginResult {
  if (input.result === null || typeof input.result !== "object" || Array.isArray(input.result)) {
    throw new TypeError(`Reference resolver plugin ${input.pluginId} returned a non-object result.`);
  }
  const result = input.result as Record<string, unknown>;
  if (
    result.targetSymbolId !== null &&
    typeof result.targetSymbolId !== "string"
  ) {
    throw new TypeError(`Reference resolver plugin ${input.pluginId} returned an invalid targetSymbolId.`);
  }
  if (
    typeof result.ruleName !== "string" ||
    !REFERENCE_RESOLVER_PLUGIN_RULE_NAME_PATTERN.test(result.ruleName)
  ) {
    throw new TypeError(`Reference resolver plugin ${input.pluginId} returned an invalid ruleName.`);
  }
  if (
    !Array.isArray(result.candidateSymbolIds) ||
    result.candidateSymbolIds.some((candidateId) => typeof candidateId !== "string")
  ) {
    throw new TypeError(`Reference resolver plugin ${input.pluginId} returned invalid candidateSymbolIds.`);
  }
  const candidateSymbolIds = result.candidateSymbolIds as string[];
  if (new Set(candidateSymbolIds).size !== candidateSymbolIds.length) {
    throw new TypeError(`Reference resolver plugin ${input.pluginId} returned duplicate candidateSymbolIds.`);
  }
  if (candidateSymbolIds.some((candidateId) => !input.candidatesById.has(candidateId))) {
    throw new TypeError(`Reference resolver plugin ${input.pluginId} selected an unknown candidate.`);
  }
  if (
    typeof result.targetSymbolId === "string" &&
    !candidateSymbolIds.includes(result.targetSymbolId)
  ) {
    throw new TypeError(`Reference resolver plugin ${input.pluginId} omitted its target from candidateSymbolIds.`);
  }
  return {
    targetSymbolId: result.targetSymbolId as string | null,
    candidateSymbolIds: [...candidateSymbolIds].sort(compareStableText),
    ruleName: result.ruleName
  };
}

function staticRouteHandlerRuleId(
  reference: PendingReference,
  suffix: "local-handler" | "imported-handler" | "reexported-handler" | "unresolved-handler"
): string {
  if (isCustomRouteFramework(reference.routeFramework)) {
    const pluginRuleName = reference.routeFramework.slice("plugin:".length).replace("/", ".");
    const routeSurface =
      reference.routeRegistration === "plugin-imported-literal-prefix-chain"
        ? "imported-literal-prefix-chain"
        : reference.routeRegistration === "plugin-imported-literal-prefix-mount"
          ? "imported-literal-prefix-mount"
      : reference.routeRegistration === "plugin-literal-prefix-chain"
        ? "literal-prefix-chain"
        : reference.routeRegistration === "plugin-literal-prefix-mount"
          ? "literal-prefix-mount"
          : "literal-route";
    return `framework.plugin.${pluginRuleName}.${routeSurface}.${suffix}`;
  }
  if (reference.routeFramework === "fastify") {
    const registration =
      reference.routeRegistration === "fastify-inline-plugin-prefix"
        ? "inline-plugin-prefix"
        : reference.routeRegistration === "fastify-local-plugin-prefix"
          ? "local-plugin-prefix"
          : reference.routeRegistration === "fastify-imported-plugin-prefix"
            ? "imported-plugin-prefix"
          : "static-route";
    return `framework.fastify.${registration}.${suffix}`;
  }
  if (reference.routeFramework === "koa") {
    return `framework.koa.router.literal-route.${suffix}`;
  }
  if (reference.routeFramework === "hono") {
    return `framework.hono.app.literal-route.${suffix}`;
  }
  if (reference.routeFramework === "elysia") {
    return `framework.elysia.app.literal-route.${suffix}`;
  }
  if (reference.routeFramework === "react-router") {
    const registration =
      reference.routeRegistration === "react-router-data-router"
        ? "data-router"
        : reference.routeRegistration === "react-router-create-routes-from-elements"
          ? "create-routes-from-elements"
          : "jsx-route";
    return `framework.react-router.${registration}.${suffix}`;
  }
  if (reference.routeFramework === "vue-router") {
    return "framework.vue-router.create-router.routes-option." + suffix;
  }
  if (reference.routeFramework === "sveltekit") {
    return "framework.sveltekit.filesystem-page." + suffix;
  }
  if (reference.routeFramework === "astro") {
    return (
      "framework.astro." +
      (reference.routeRegistration === "astro-filesystem-endpoint"
        ? "filesystem-endpoint"
        : "filesystem-page") +
      "." +
      suffix
    );
  }
  if (reference.routeFramework === "blazor") {
    return "framework.blazor.page-directive." + suffix;
  }
  if (reference.routeFramework === "nextjs") {
    const registration =
      reference.routeRegistration === "nextjs-app-router" ? "app-router" : "pages-router";
    return `framework.nextjs.${registration}.${suffix}`;
  }
  if (reference.routeFramework === "fastapi") {
    return `framework.fastapi.direct-app.decorator.${suffix}`;
  }
  if (reference.routeFramework === "play") {
    return "framework.play.conf-routes.literal-controller-action." + suffix;
  }
  return `framework.express.literal-route.${suffix}`;
}

function fallbackModuleResolution(
  knownFilePaths: ReadonlySet<string>,
  fromFilePath: string,
  moduleSpecifier: string
): ResolvedModule {
  const matchingPaths = modulePathCandidates(fromFilePath, moduleSpecifier, knownFilePaths).filter((path) =>
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
    case "cargo-workspace-crate":
      return "module.cargo-workspace-crate";
    case "unresolved":
      return "module.unresolved-specifier";
  }

  return "module.unresolved-specifier";
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
      indexedAt,
      generated: classifyGeneratedFile(document.relativePath, document.sourceText),
      sourceRole: classifySourceRole(document.relativePath)
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

interface ExportCandidateIndex {
  readonly byName: ReadonlyMap<string, readonly ExportCandidate[]>;
  readonly byFileAndName: ReadonlyMap<string, readonly ExportCandidate[]>;
}

function buildExportCandidateIndex(surfaces: ReadonlyMap<string, ExportSurface>): ExportCandidateIndex {
  const byName = new Map<string, ExportCandidate[]>();
  const byFileAndName = new Map<string, ExportCandidate[]>();
  for (const [filePath, surface] of surfaces) {
    for (const [exportedName, entry] of surface) {
      const nameCandidates = byName.get(exportedName) ?? [];
      nameCandidates.push(...entry.candidates);
      byName.set(exportedName, nameCandidates);
      byFileAndName.set(moduleKey(filePath, exportedName), [...entry.candidates]);
    }
  }
  return {
    byName: new Map(
      [...byName.entries()].map(([name, candidates]) => [name, canonicalExportCandidates(candidates)])
    ),
    byFileAndName: new Map(
      [...byFileAndName.entries()].map(([key, candidates]) => [key, canonicalExportCandidates(candidates)])
    )
  };
}

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

function resolveExportSurfaces(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly moduleResolutionByKey: ReadonlyMap<string, ResolvedModule>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
}): ReadonlyMap<string, ExportSurface> {
  const orderedFilePaths = [...input.factsByFile.keys()].sort(compareStableText);
  const directSurfaces = new Map<string, ExportSurface>();
  for (const filePath of orderedFilePaths) {
    const facts = input.factsByFile.get(filePath);
    if (facts !== undefined) {
      directSurfaces.set(filePath, directExportSurface(facts, filePath));
    }
  }
  let surfaces = new Map(directSurfaces);
  let surfaceSignatures = new Map(
    [...surfaces.entries()].map(([filePath, surface]) => [filePath, surfaceSignature(surface)])
  );
  const dependentFilePathsByTargetPath = new Map<string, Set<string>>();
  const addSurfaceDependency = (dependentFilePath: string, targetPath: string | undefined): void => {
    if (targetPath === undefined) {
      return;
    }
    const dependents = dependentFilePathsByTargetPath.get(targetPath) ?? new Set<string>();
    dependents.add(dependentFilePath);
    dependentFilePathsByTargetPath.set(targetPath, dependents);
  };
  for (const filePath of orderedFilePaths) {
    const facts = input.factsByFile.get(filePath);
    if (facts === undefined) {
      continue;
    }
    for (const binding of facts.exportBindings) {
      for (const importedBinding of facts.importBindings) {
        if (importedBinding.localName !== binding.localName) {
          continue;
        }
        addSurfaceDependency(
          filePath,
          input.moduleTargetPathByKey.get(moduleKey(filePath, importedBinding.moduleSpecifier))
        );
      }
    }
    for (const binding of facts.reExportBindings) {
      addSurfaceDependency(
        filePath,
        input.moduleTargetPathByKey.get(moduleKey(filePath, binding.moduleSpecifier))
      );
    }
  }
  let changedFilePaths = new Set(orderedFilePaths);

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
    const next = new Map(surfaces);
    const nextSignatures = new Map(surfaceSignatures);
    const changedNext = new Set<string>();

    for (const filePath of orderedFilePaths) {
      if (!changedFilePaths.has(filePath)) {
        continue;
      }
      const facts = input.factsByFile.get(filePath);
      if (facts === undefined) {
        continue;
      }

      const surface = new Map(directSurfaces.get(filePath) ?? []);
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
      const signature = surfaceSignature(surface);
      nextSignatures.set(filePath, signature);
      if (surfaceSignatures.get(filePath) !== signature) {
        changedNext.add(filePath);
      }
    }

    if (changedNext.size === 0) {
      return next;
    }
    surfaces = next;
    surfaceSignatures = nextSignatures;
    changedFilePaths = new Set(
      [...changedNext].flatMap(
        (filePath) => [...(dependentFilePathsByTargetPath.get(filePath) ?? [])]
      )
    );
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
  filePaths?: ReadonlySet<string>,
  index?: ExportCandidateIndex
): readonly ExportCandidate[] {
  if (index !== undefined) {
    if (filePaths === undefined) {
      return index.byName.get(exportedName) ?? [];
    }
    return canonicalExportCandidates(
      [...filePaths].flatMap((filePath) => index.byFileAndName.get(moduleKey(filePath, exportedName)) ?? [])
    );
  }
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

function isSignatureReference(
  reference: PendingReference
): reference is PendingReference & { readonly relationKind: "accepts" | "returns" } {
  return reference.relationKind === "accepts" || reference.relationKind === "returns";
}

function isSignatureTarget(symbol: SymbolNode): boolean {
  return symbol.kind === "class" || symbol.kind === "interface" || symbol.kind === "type";
}

function signatureRuleId(
  relationKind: "accepts" | "returns",
  suffix: "local-type-binding" | "imported-type" | "reexported-type" | "unresolved-type"
): string {
  return `signature.${relationKind}.${suffix}`;
}

/** Direct `new Identifier()` facts resolve only to a statically declared class. */
function isInstantiationTarget(symbol: SymbolNode): boolean {
  return symbol.kind === "class";
}

function instantiationRuleId(
  suffix:
    | "local-class-binding"
    | "imported-class-target"
    | "reexported-class-target"
    | "unresolved-class-target"
): string {
  return `syntax.new-expression.${suffix}`;
}

function isOverrideReference(
  reference: PendingReference
): reference is PendingReference & { readonly relationKind: "overrides" } {
  return reference.relationKind === "overrides";
}

function overrideRuleId(
  suffix: "explicit-direct-base-method" | "unresolved-direct-base-method"
): string {
  return `syntax.override.${suffix}`;
}

interface ExactOverrideResolution {
  readonly target: SymbolNode | null;
  readonly candidates: readonly SymbolNode[];
}

/**
 * An explicit language-level override marker alone does not expose semantic
 * type-checker data. Retain an exact edge only when the persisted graph
 * independently proves exactly one same-named method across its direct parent
 * class and interface types.
 */
function resolveExactOverrideTarget(input: {
  readonly reference: PendingReference & { readonly relationKind: "overrides" };
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly resolvedEdges: readonly GraphEdge[];
  readonly containerIdsByContainedId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly containedIdsByContainerId: ReadonlyMap<string, ReadonlySet<string>>;
}): ExactOverrideResolution {
  const source = input.symbolsById.get(input.reference.sourceId);
  if (source?.kind !== "method" || source.name !== input.reference.referenceName) {
    return { target: null, candidates: [] };
  }

  const owners = [...(input.containerIdsByContainedId.get(source.id) ?? [])]
    .map((id) => input.symbolsById.get(id))
    .filter((candidate): candidate is SymbolNode => candidate?.kind === "class")
    .sort((left, right) => compareStableText(left.id, right.id));
  const owner = owners[0];
  if (owners.length !== 1 || owner === undefined) {
    return { target: null, candidates: [] };
  }

  const directParentTypes = [...new Set(
    input.resolvedEdges
      .filter(
        (edge) =>
          (edge.kind === "extends" || edge.kind === "implements") &&
          edge.sourceId === owner.id &&
          edge.resolution === "exact" &&
          edge.targetId !== null
      )
      .map((edge) => edge.targetId)
  )]
    .map((id) => (id === null ? undefined : input.symbolsById.get(id)))
    .filter(
      (candidate): candidate is SymbolNode =>
        candidate?.kind === "class" || candidate?.kind === "interface"
    )
    .sort((left, right) => compareStableText(left.id, right.id));

  const candidates = directParentTypes
    .flatMap((parent) => [...(input.containedIdsByContainerId.get(parent.id) ?? [])])
    .map((id) => input.symbolsById.get(id))
    .filter(
      (candidate): candidate is SymbolNode =>
        candidate?.kind === "method" && candidate.name === input.reference.referenceName
    )
    .sort((left, right) => compareStableText(left.id, right.id));
  return {
    target: candidates.length === 1 ? candidates[0] ?? null : null,
    candidates
  };
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

/**
 * Resolves a static Fastify plugin callback through the same exact
 * local/import/re-export proof as other runtime references. It deliberately
 * accepts only function or variable symbols because a plugin callback cannot
 * be represented by a class, type, or module object.
 */

function goPackageDirectory(filePath: string): string {
  const separator = filePath.lastIndexOf("/");
  return separator === -1 ? "" : filePath.slice(0, separator);
}

function sameSourceRange(left: SourceRange, right: SourceRange): boolean {
  return left.start.line === right.start.line &&
    left.start.column === right.start.column &&
    left.end.line === right.end.line &&
    left.end.column === right.end.column;
}

/**
 * Resolves a direct Sanic target or one final `__init__.py` re-export chain.
 * Every hop is a persisted single-name relative import, and a cycle or any
 * competing local/exported binding remains unresolved.
 */

/**
 * Resolves all direct and imported members of one Blueprint group. Cyclic
 * groups and repeated Blueprint leaves are rejected rather than projected as
 * speculative runtime routes.
 */

/**
 * Projects literal handler routes declared on directly imported Sanic
 * Blueprints and recursively composed Blueprint groups. Every import, group
 * member, prefix, and handler must have a persisted syntax proof.
 */

/**
 * Resolves a direct Django URLConf or one final `__init__.py` re-export chain.
 * Every hop is a persisted single-name relative import, and a cycle or any
 * competing direct/exported binding remains unresolved.
 */

/**
 * Projects literal child URL patterns through directly imported URLConfs and
 * static dotted URLConf module names. A final package initializer re-export
 * chain is accepted only when every hop has exact persisted evidence.
 */

function heritageRuleId(
  relationKind: HeritageReferenceContext["relationKind"],
  suffix: "local-value-binding" | "local-type-binding" | "imported-target" | "reexported-target" | "unresolved-target"
): string {
  return `heritage.${relationKind}.${suffix}`;
}

function projectUnresolvedReferenceWithPlugins(input: {
  readonly reference: PendingReference;
  readonly sourceDocumentsByPath: ReadonlyMap<string, SourceDocument>;
  readonly symbols: readonly SymbolNode[];
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly localBindingsByFile: ReadonlyMap<string, ExtractedFileFacts["localBindings"]>;
  readonly importBindingsByFile: ReadonlyMap<string, ExtractedFileFacts["importBindings"]>;
  readonly referenceScopeIdsByReferenceId: ReadonlyMap<string, readonly string[]>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
  readonly moduleResolutionByKey: ReadonlyMap<string, ResolvedModule>;
  readonly exportSurfaces: ReadonlyMap<string, ExportSurface>;
  readonly registry: ReferenceResolverPluginRegistry | undefined;
}): ReferenceResolverPluginProjection | null {
  const plugins = requireReferenceResolverPluginRegistry(input.registry);
  const sourceDocument = input.sourceDocumentsByPath.get(input.reference.filePath);
  const source = input.symbolsById.get(input.reference.sourceId);
  if (plugins.length === 0 || sourceDocument === undefined || source === undefined) {
    return null;
  }
  const eligiblePlugins = plugins.filter(
    (plugin) =>
      plugin.languages.includes(sourceDocument.language) &&
      plugin.relations.includes(input.reference.relationKind)
  );
  if (eligiblePlugins.length === 0) {
    return null;
  }

  const lexicalResolution = resolveScopedBinding(
    input.reference.referenceName,
    input.referenceScopeIdsByReferenceId.get(input.reference.id) ?? [],
    input.localBindingsByFile.get(input.reference.filePath) ?? [],
    input.symbolsById,
    isHeritageReference(input.reference)
      ? heritageReferenceContext(input.reference, input.symbolsById)?.expectedSpace ?? "value"
      : "value"
  );
  const candidateSupportsRelation = (symbol: SymbolNode): boolean => {
    if (isHeritageReference(input.reference)) {
      const heritage = heritageReferenceContext(input.reference, input.symbolsById);
      return heritage !== null && isHeritageTarget(symbol, heritage);
    }
    if (input.reference.relationKind === "instantiates") {
      return isInstantiationTarget(symbol);
    }
    if (input.reference.relationKind === "overrides") {
      return symbol.kind === "method";
    }
    return symbol.kind !== "file";
  };
  const lexicalCandidates = lexicalResolution.candidates
    .filter(candidateSupportsRelation)
    .map((symbol) => pluginCandidate(symbol));
  const moduleCandidates = canonicalExportCandidates(
    (input.importBindingsByFile.get(input.reference.filePath) ?? [])
      .filter((binding) => binding.localName === input.reference.referenceName)
      .flatMap((binding) => {
        const key = moduleKey(input.reference.filePath, binding.moduleSpecifier);
        const targetPath = input.moduleTargetPathByKey.get(key);
        return targetPath === undefined
          ? []
          : candidatesForExport(input.exportSurfaces, targetPath, binding.importedName);
      })
  )
  .filter(
    (candidate) =>
      candidateSupportsRelation(candidate.symbol) &&
      (isHeritageReference(input.reference) || candidate.isTypeOnly !== true)
  )
  .map((candidate) =>
    pluginCandidate(
      candidate.symbol,
      [input.reference.filePath, ...candidate.path],
      uniqueConfigurationPaths([
        candidate.configurationPaths,
        ...(input.importBindingsByFile.get(input.reference.filePath) ?? [])
          .filter((binding) => binding.localName === input.reference.referenceName)
          .map((binding) =>
            input.moduleResolutionByKey.get(moduleKey(input.reference.filePath, binding.moduleSpecifier))
              ?.configurationPaths ?? []
          )
      ])
    )
  );
  const allProjectCandidates = input.symbols
    .filter(
      (symbol) => symbol.name === input.reference.referenceName && candidateSupportsRelation(symbol)
    )
    .sort((left, right) => compareStableText(left.id, right.id));
  const projectCandidatesTruncated =
    allProjectCandidates.length > MAX_REFERENCE_RESOLVER_PROJECT_CANDIDATES;
  const projectCandidates = allProjectCandidates
    .slice(0, MAX_REFERENCE_RESOLVER_PROJECT_CANDIDATES)
    .map((symbol) => pluginCandidate(symbol));
  const candidatesById = new Map<string, ReferenceResolverPluginCandidate>();
  for (const candidate of [...lexicalCandidates, ...moduleCandidates, ...projectCandidates]) {
    candidatesById.set(candidate.symbol.id, candidate);
  }
  const pluginInput = Object.freeze({
    reference: input.reference,
    source,
    language: sourceDocument.language,
    lexicalCandidates: Object.freeze(lexicalCandidates),
    moduleCandidates: Object.freeze(moduleCandidates),
    projectCandidates: Object.freeze(projectCandidates),
    projectCandidatesTruncated
  });
  const claims: { readonly pluginId: string; readonly result: ReferenceResolverPluginResult }[] = [];

  for (const plugin of eligiblePlugins) {
    let rawResult: ReferenceResolverPluginResult | null;
    try {
      rawResult = plugin.resolve(pluginInput);
    } catch {
      return {
        resolved: false,
        edge: referenceEdge(
          input.reference,
          null,
          "unresolved",
          0,
          referenceEvidence(
            `plugin.reference-resolver.${plugin.id.replace("/", ".")}.runtime-error`,
            "unresolved",
            [...candidatesById.keys()]
          )
        )
      };
    }
    if (rawResult === null) {
      continue;
    }
    try {
      claims.push({
        pluginId: plugin.id,
        result: validateReferenceResolverPluginResult({
          pluginId: plugin.id,
          result: rawResult,
          candidatesById
        })
      });
    } catch {
      return {
        resolved: false,
        edge: referenceEdge(
          input.reference,
          null,
          "unresolved",
          0,
          referenceEvidence(
            `plugin.reference-resolver.${plugin.id.replace("/", ".")}.invalid-result`,
            "unresolved",
            [...candidatesById.keys()]
          )
        )
      };
    }
  }

  if (claims.length === 0) {
    return null;
  }
  if (claims.length > 1) {
    return {
      resolved: false,
      edge: referenceEdge(
        input.reference,
        null,
        "unresolved",
        0,
        referenceEvidence(
          "plugin.reference-resolver.collision",
          "unresolved",
          claims.flatMap((claim) => claim.result.candidateSymbolIds)
        )
      )
    };
  }

  const claim = claims[0];
  if (claim === undefined) {
    return null;
  }
  const rulePrefix = `plugin.reference-resolver.${claim.pluginId.replace("/", ".")}.${claim.result.ruleName}`;
  if (claim.result.targetSymbolId === null) {
    return {
      resolved: false,
      edge: referenceEdge(
        input.reference,
        null,
        "unresolved",
        0,
        referenceEvidence(`${rulePrefix}.unresolved-target`, "unresolved", claim.result.candidateSymbolIds)
      )
    };
  }
  const targetId = claim.result.targetSymbolId;
  const lexicalCandidate = lexicalCandidates.find((candidate) => candidate.symbol.id === targetId);
  const moduleCandidate = moduleCandidates.find((candidate) => candidate.symbol.id === targetId);
  const projectCandidate = projectCandidates.find((candidate) => candidate.symbol.id === targetId);
  if (lexicalCandidate !== undefined) {
    return {
      resolved: true,
      edge: referenceEdge(
        input.reference,
        targetId,
        "exact",
        1,
        referenceEvidence(`${rulePrefix}.lexical-target`, "lexical", claim.result.candidateSymbolIds)
      )
    };
  }
  if (moduleCandidate !== undefined) {
    return {
      resolved: true,
      edge: referenceEdge(
        input.reference,
        targetId,
        "exact",
        1,
        referenceEvidence(
          `${rulePrefix}.module-target`,
          "module",
          claim.result.candidateSymbolIds,
          moduleCandidate.configurationPaths,
          moduleCandidate.resolutionPath
        )
      )
    };
  }
  if (projectCandidate === undefined || projectCandidatesTruncated) {
    return {
      resolved: false,
      edge: referenceEdge(
        input.reference,
        null,
        "unresolved",
        0,
        referenceEvidence(`${rulePrefix}.unsafe-project-target`, "unresolved", claim.result.candidateSymbolIds)
      )
    };
  }
  return {
    resolved: true,
    edge: referenceEdge(
      input.reference,
      targetId,
      "heuristic",
      0.7,
      referenceEvidence(`${rulePrefix}.project-target`, "heuristic", claim.result.candidateSymbolIds)
    )
  };
}

/**
 * Resolves local declarations and explicit named import/export bindings exactly. Any
 * remaining unique-name inference stays heuristic so the graph never overstates proof.
 */
const LARGE_ROOT_UNRESOLVED_EDGE_REFERENCE_THRESHOLD = 250_000;

export function resolveProjectFacts(input: {
  readonly sourceDocuments: readonly SourceDocument[];
  readonly extractedFiles: readonly ExtractedFileFacts[];
  readonly indexedAt: string;
  /** Optional for v0.2-compatible callers; the catalog supplies it for indexed projects. */
  readonly moduleResolver?: ProjectModuleResolver;
  /** Optional for callers predating Xcode target membership evidence. */
  readonly xcodeTargetMemberships?: readonly XcodeTargetMembership[];
  /** Optional for callers predating JVM Maven/Gradle module evidence. */
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
  /** Validated, project-scoped extensions invoked only for still-unresolved references. */
  readonly referenceResolverPlugins?: ReferenceResolverPluginRegistry;
  /** Validated cross-file extensions invoked before built-in project resolution. */
  readonly frameworkProjectPlugins?: FrameworkProjectPluginRegistry;
}): GraphSnapshot {
  const symbols = input.extractedFiles.flatMap((facts) => facts.symbols);
  const structuralEdges = input.extractedFiles.flatMap((facts) => facts.edges);
  const frameworkPluginOutputs = projectFrameworkPluginOutputs({
    sourceDocuments: input.sourceDocuments,
    extractedFiles: input.extractedFiles,
    ...(input.frameworkProjectPlugins === undefined
      ? {}
      : { registry: input.frameworkProjectPlugins })
  });
  const references = [
    ...input.extractedFiles.flatMap((facts) => facts.pendingReferences),
    ...frameworkPluginOutputs.references
  ];
  // A very large root can contain hundreds of thousands of unresolved syntax
  // references. Preserve every pending reference for diagnostics, but avoid
  // materializing a duplicate unresolved GraphEdge for each one. Exact edges
  // are never filtered by this capacity guard, and smaller projects retain the
  // historical unresolved-edge projection.
  const materializeUnresolvedEdges =
    references.length <= LARGE_ROOT_UNRESOLVED_EDGE_REFERENCE_THRESHOLD;
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
  const deferredTypeScriptMemberReferences: PendingReference[] = [];
  let capacityPruneCursor = 0;
  const decoratorTaintedTypeScriptTypeSymbolIds = new Set(
    input.extractedFiles.flatMap(
      (facts) => facts.typescriptFacts?.decoratorTaintedTypeSymbolIds ?? []
    )
  );
  const decoratorTaintedTypeScriptMemberSymbolIds = new Set(
    input.extractedFiles.flatMap(
      (facts) => facts.typescriptFacts?.decoratorTaintedMemberSymbolIds ?? []
    )
  );
  const staticTypeScriptMemberSymbolIds = new Set(
    input.extractedFiles.flatMap((facts) => facts.typescriptFacts?.staticMemberSymbolIds ?? [])
  );
  const instanceTypeScriptMemberSymbolIds = new Set(
    input.extractedFiles.flatMap((facts) => facts.typescriptFacts?.instanceMemberSymbolIds ?? [])
  );
  const callableTypeScriptMemberSymbolIds = new Set(
    input.extractedFiles.flatMap((facts) => facts.typescriptFacts?.callableMemberSymbolIds ?? [])
  );
  const runtimeTaintedTypeScriptMemberSurfaceKeys = new Set(
    input.extractedFiles.flatMap((facts) =>
      (facts.typescriptFacts?.runtimeTaintedMemberSurfaces ?? []).map(
        (surface) =>
          `${surface.typeSymbolId}\u0000${surface.memberKind}\u0000${surface.memberName ?? "*"}`
      )
    )
  );
  const replacedStructuralEdgeIds = new Set<string>();
  const sourceDocumentsByPath = new Map(
    input.sourceDocuments.map((document) => [document.relativePath, document])
  );
  const pruneUnresolvedEdgesForCapacity = (): void => {
    if (materializeUnresolvedEdges) {
      return;
    }
    let writeIndex = capacityPruneCursor;
    for (let readIndex = capacityPruneCursor; readIndex < resolvedEdges.length; readIndex += 1) {
      const edge = resolvedEdges[readIndex];
      if (edge === undefined) {
        continue;
      }
      if (edge.resolution !== "unresolved") {
        resolvedEdges[writeIndex] = edge;
        writeIndex += 1;
      }
    }
    resolvedEdges.length = writeIndex;
    capacityPruneCursor = writeIndex;
  };

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

  const jvmResolverDependencies: JvmResolverDependencies = {
    candidateSymbolIds,
    referenceEvidence,
    uniqueConfigurationPaths
  };

  resolvedEdges.push(
    ...projectFortranCallReferences({
      factsByFile,
      symbolsById,
      existingEdges: structuralEdges
    })
  );

  resolvedEdges.push(
    ...projectPascalCallReferences({
      factsByFile,
      symbolsById,
      existingEdges: structuralEdges,
      sourceDocumentsByPath
    }, referenceEvidence)
  );

  resolvedEdges.push(
    ...projectJavaImportReferences({
      factsByFile,
      symbolsById,
      ...(input.jvmProjectModuleEvidence === undefined
        ? {}
        : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
    }, jvmResolverDependencies),
    ...projectJavaAnnotationReferences({
      factsByFile,
      symbolsById,
      ...(input.jvmProjectModuleEvidence === undefined
        ? {}
        : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
    }, jvmResolverDependencies)
  );

  const jvmProjectHeritageEdges = projectJvmHeritageReferences({
    factsByFile,
    symbolsById,
    ...(input.jvmProjectModuleEvidence === undefined
      ? {}
      : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
  }, jvmResolverDependencies);
  const jvmSyntaxHeritageEdges = input.extractedFiles.flatMap((facts) =>
    facts.edges.filter((edge) => edge.kind === "extends" || edge.kind === "implements")
  );
  resolvedEdges.push(...jvmProjectHeritageEdges);
  resolvedEdges.push(
    ...projectJvmDependencyInjectionReferences({
      factsByFile,
      symbolsById,
      ...(input.jvmProjectModuleEvidence === undefined
        ? {}
        : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
    }, jvmResolverDependencies)
  );
  const jvmCallableSignatureEdges = projectJvmCallableSignatureReferences({
    factsByFile,
    symbolsById,
    ...(input.jvmProjectModuleEvidence === undefined
      ? {}
      : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
  }, jvmResolverDependencies);
  resolvedEdges.push(...jvmCallableSignatureEdges);
  resolvedEdges.push(
    ...projectJavaInstantiationReferences({
      factsByFile,
      symbolsById,
      ...(input.jvmProjectModuleEvidence === undefined
        ? {}
        : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
    }, jvmResolverDependencies)
  );
  resolvedEdges.push(
    ...projectJavaCallReferences({
      factsByFile,
      symbolsById,
      signatureEdges: jvmCallableSignatureEdges,
      heritageEdges: [...jvmSyntaxHeritageEdges, ...jvmProjectHeritageEdges],
      ...(input.jvmProjectModuleEvidence === undefined
        ? {}
        : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
    }, jvmResolverDependencies)
  );

  resolvedEdges.push(
    ...projectKotlinRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectSwiftRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectDartRelationFacts({
      factsByFile,
      symbolsById,
      knownFilePaths,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectCsharpRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectFsharpRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectOcamlRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectHaskellRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectScalaRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectElixirRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectErlangRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectClojureRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectLiquidTemplateReferences({
      factsByFile,
      fileSymbols
    }, referenceEvidence, candidateSymbolIds)
  );
  resolvedEdges.push(
    ...projectTwigTemplateReferences({
      factsByFile,
      fileSymbols
    }, referenceEvidence, candidateSymbolIds)
  );
  resolvedEdges.push(
    ...projectJspTemplateReferences({
      factsByFile,
      fileSymbols
    }, referenceEvidence, candidateSymbolIds)
  );
  resolvedEdges.push(
    ...projectMarkdownFileReferences({
      factsByFile,
      fileSymbols
    }, referenceEvidence, candidateSymbolIds)
  );
  resolvedEdges.push(
    ...projectBladeTemplateReferences({
      factsByFile,
      fileSymbols
    }, referenceEvidence, candidateSymbolIds)
  );
  resolvedEdges.push(
    ...projectRazorPagesReferences({
      factsByFile,
      symbolsById,
      sourceDocumentsByPath,
      structuralEdges
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectSolidityInheritance({
      factsByFile
    }, referenceEvidence, candidateSymbolIds)
  );
  resolvedEdges.push(
    ...projectSpringBootPropertiesReferences({
      factsByFile,
      symbolsById
    }, referenceEvidence, candidateSymbolIds)
  );
  resolvedEdges.push(
    ...projectSpringBootConfigurationPropertiesPrefixes({
      factsByFile,
      symbolsById
    }, referenceEvidence, candidateSymbolIds)
  );
  resolvedEdges.push(
    ...projectNestGraphqlResolverSchemaReferences({
      factsByFile,
      sourceDocuments: input.sourceDocuments,
      symbolsById
    }, referenceEvidence, candidateSymbolIds)
  );
  resolvedEdges.push(
    ...projectReactNativeNativeModuleCalls({
      factsByFile,
      referenceEvidence
    })
  );
  resolvedEdges.push(
    ...projectReactNativeSwiftExternalBridgeReferences({
      factsByFile,
      referenceEvidence,
      ...(input.xcodeTargetMemberships === undefined
        ? {}
        : { xcodeTargetMemberships: input.xcodeTargetMemberships })
    })
  );
  resolvedEdges.push(
    ...projectReactNativeTurboModuleCalls({
      factsByFile,
      referenceEvidence
    })
  );
  resolvedEdges.push(
    ...projectReactNativeTurboModuleSpecMethods({
      factsByFile,
      referenceEvidence
    })
  );

  // Project-specific unresolved edges above are independent graph evidence,
  // not duplicate projections of `references`. Keep them even for a large
  // root, then incrementally prune only unresolved edges appended while the
  // pending-reference pipeline runs.
  if (!materializeUnresolvedEdges) {
    capacityPruneCursor = resolvedEdges.length;
  }
  pruneUnresolvedEdgesForCapacity();
  // Sort the owned working list in place; cloning every pending reference here
  // needlessly doubles the large-root resolution working set.
  references.sort((left, right) => compareStableText(left.id, right.id));
  let moduleReferenceIndex = 0;
  for (const reference of references) {
    moduleReferenceIndex += 1;
    if ((moduleReferenceIndex & 4095) === 0) {
      pruneUnresolvedEdgesForCapacity();
    }
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
  pruneUnresolvedEdgesForCapacity();

  const exportSurfaces = resolveExportSurfaces({
    factsByFile,
    moduleResolutionByKey,
    moduleTargetPathByKey
  });
  const exportCandidateIndex = buildExportCandidateIndex(exportSurfaces);

  resolvedEdges.push(
    ...projectNixRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges],
      moduleTargetPathByKey
    }, referenceEvidence, moduleKey)
  );
  resolvedEdges.push(
    ...projectNimRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges],
      knownFilePaths
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectZigRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges],
      knownFilePaths
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectCRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges],
      knownFilePaths
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectPhpRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectCppRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges],
      knownFilePaths
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectObjectiveCRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges],
      knownFilePaths
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectRubyRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges],
      knownFilePaths
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectSqlRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectRRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectProtoRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges],
      knownFilePaths
    }, referenceEvidence)
  );
  resolvedEdges.push(
    ...projectGraphqlRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    }, referenceEvidence)
  );

  resolvedEdges.push(
    ...projectPythonRegularPackageRelativeNamedImports({
      factsByFile,
      fileSymbols,
      knownFilePaths
    }, referenceEvidence)
  );

  const frameworkRoutePluginProjection = projectFrameworkRoutePluginImportedMounts({
    dependencies: { moduleKey, resolveScopedBinding, canonicalExportCandidates, candidatesForExport },
    factsByFile,
    fileSymbols,
    symbolsById,
    referencesById: new Map(references.map((reference) => [reference.id, reference])),
    referenceScopeIdsByReferenceId,
    moduleTargetPathByKey,
    exportSurfaces
  });
  if (frameworkRoutePluginProjection.suppressedRawRouteIds.length > 0) {
    const suppressedRoutes = new Set(frameworkRoutePluginProjection.suppressedRawRouteIds);
    const suppressedReferences = new Set(frameworkRoutePluginProjection.suppressedRawReferenceIds);
    symbols.splice(0, symbols.length, ...symbols.filter((symbol) => !suppressedRoutes.has(symbol.id)));
    structuralEdges.splice(
      0,
      structuralEdges.length,
      ...structuralEdges.filter(
        (edge) => !suppressedRoutes.has(edge.sourceId) && !suppressedRoutes.has(edge.targetId ?? "")
      )
    );
    references.splice(
      0,
      references.length,
      ...references.filter((reference) => !suppressedReferences.has(reference.id))
    );
    for (const routeId of suppressedRoutes) {
      symbolsById.delete(routeId);
    }
  }
  symbols.push(...frameworkRoutePluginProjection.symbols);
  structuralEdges.push(...frameworkRoutePluginProjection.structuralEdges);
  references.push(...frameworkRoutePluginProjection.references);
  for (const symbol of frameworkRoutePluginProjection.symbols) {
    symbolsById.set(symbol.id, symbol);
  }
  for (const [referenceId, scopeIds] of frameworkRoutePluginProjection.referenceScopes) {
    referenceScopeIdsByReferenceId.set(referenceId, scopeIds);
  }

  resolvedEdges.push(
    ...projectReactNativeTurboModuleDefaultImportCalls({
      factsByFile,
      moduleTargetPathByKey,
      exportSurfaces,
      moduleKey,
      referenceEvidence
    })
  );

  const rustActixImportedServiceConfigRouteProjection = projectRustActixImportedServiceConfigRoutes({
    factsByFile,
    knownFilePaths,
    fileSymbols,
    symbolsById,
    structuralEdges,
    moduleResolver: input.moduleResolver
  }, referenceEvidence, candidateSymbolIds);
  if (rustActixImportedServiceConfigRouteProjection.suppressedRawRouteIds.length > 0) {
    const suppressedRawRouteIds = new Set(
      rustActixImportedServiceConfigRouteProjection.suppressedRawRouteIds
    );
    symbols.splice(
      0,
      symbols.length,
      ...symbols.filter((symbol) => !suppressedRawRouteIds.has(symbol.id))
    );
    structuralEdges.splice(
      0,
      structuralEdges.length,
      ...structuralEdges.filter(
        (edge) => !suppressedRawRouteIds.has(edge.sourceId) && !suppressedRawRouteIds.has(edge.targetId ?? "")
      )
    );
    for (const routeId of suppressedRawRouteIds) {
      symbolsById.delete(routeId);
    }
  }
  symbols.push(...rustActixImportedServiceConfigRouteProjection.symbols);
  structuralEdges.push(...rustActixImportedServiceConfigRouteProjection.structuralEdges);
  for (const symbol of rustActixImportedServiceConfigRouteProjection.symbols) {
    symbolsById.set(symbol.id, symbol);
  }

  const goFrameStandardRouterRouteProjection = projectGoFrameStandardRouterRoutes({
    factsByFile,
    fileSymbols,
    symbolsById,
    knownFilePaths,
    moduleResolver: input.moduleResolver
  }, referenceEvidence, candidateSymbolIds, goPackageDirectory);
  symbols.push(...goFrameStandardRouterRouteProjection.symbols);
  structuralEdges.push(...goFrameStandardRouterRouteProjection.structuralEdges);
  for (const symbol of goFrameStandardRouterRouteProjection.symbols) {
    symbolsById.set(symbol.id, symbol);
  }

  resolvedEdges.push(
    ...projectAdaCallReferences({
      factsByFile,
      symbolsById,
      existingEdges: structuralEdges,
      sourceDocumentsByPath
    }, referenceEvidence)
  );

  resolvedEdges.push(
    ...projectAdaProjectFacts({
      factsByFile,
      symbolsById,
      sourceDocumentsByPath
    }, referenceEvidence, sameSourceRange)
  );

  resolvedEdges.push(
    ...projectRustLocalFacts({
      factsByFile,
      symbolsById
    }, referenceEvidence)
  );

  resolvedEdges.push(
    ...projectRustProjectFacts({
      factsByFile,
      fileSymbols,
      symbolsById,
      knownFilePaths,
      sourceDocumentsByPath
    }, referenceEvidence)
  );

  resolvedEdges.push(
    ...projectGoProjectFacts({
      factsByFile,
      fileSymbols,
      symbolsById,
      knownFilePaths,
      moduleResolver: input.moduleResolver
    }, { goPackageDirectory, referenceEvidence })
  );

  const fastifyPluginRouteProjection = projectFastifyImportedPluginRoutes({
    factsByFile,
    localBindingsByFile,
    importBindingsByFile,
    symbolsById,
    fileSymbols,
    moduleTargetPathByKey,
    exportSurfaces
  }, (referenceInput) => resolveExactFastifyPluginReference({
    ...referenceInput,
    dependencies: { moduleKey, resolveScopedBinding, canonicalExportCandidates, candidatesForExport }
  }), isFastifyPluginSymbol);
  symbols.push(...fastifyPluginRouteProjection.symbols);
  structuralEdges.push(...fastifyPluginRouteProjection.structuralEdges);
  references.push(...fastifyPluginRouteProjection.references);
  for (const symbol of fastifyPluginRouteProjection.symbols) {
    symbolsById.set(symbol.id, symbol);
  }
  for (const [referenceId, scopeIds] of fastifyPluginRouteProjection.referenceScopes) {
    referenceScopeIdsByReferenceId.set(referenceId, scopeIds);
  }

  const fastApiImportedRouterRouteProjection = projectFastApiImportedRouterRoutes({
    factsByFile,
    referenceEvidence,
    knownFilePaths,
    fileSymbols,
    symbolsById
  });
  symbols.push(...fastApiImportedRouterRouteProjection.symbols);
  structuralEdges.push(...fastApiImportedRouterRouteProjection.structuralEdges);
  for (const symbol of fastApiImportedRouterRouteProjection.symbols) {
    symbolsById.set(symbol.id, symbol);
  }

  const djangoNinjaImportedRouterRouteProjection = projectDjangoNinjaImportedRouterRoutes({
    factsByFile,
    referenceEvidence,
    knownFilePaths,
    fileSymbols,
    symbolsById
  });
  symbols.push(...djangoNinjaImportedRouterRouteProjection.symbols);
  structuralEdges.push(...djangoNinjaImportedRouterRouteProjection.structuralEdges);
  for (const symbol of djangoNinjaImportedRouterRouteProjection.symbols) {
    symbolsById.set(symbol.id, symbol);
  }

  const flaskImportedBlueprintRouteProjection = projectFlaskImportedBlueprintRoutes({
    factsByFile,
    referenceEvidence,
    knownFilePaths,
    fileSymbols,
    symbolsById
  });
  symbols.push(...flaskImportedBlueprintRouteProjection.symbols);
  structuralEdges.push(...flaskImportedBlueprintRouteProjection.structuralEdges);
  for (const symbol of flaskImportedBlueprintRouteProjection.symbols) {
    symbolsById.set(symbol.id, symbol);
  }

  const sanicImportedBlueprintRouteProjection = projectSanicImportedBlueprintRoutes({
    referenceEvidence,
    factsByFile,
    knownFilePaths,
    fileSymbols,
    symbolsById
  });
  symbols.push(...sanicImportedBlueprintRouteProjection.symbols);
  structuralEdges.push(...sanicImportedBlueprintRouteProjection.structuralEdges);
  for (const symbol of sanicImportedBlueprintRouteProjection.symbols) {
    symbolsById.set(symbol.id, symbol);
  }

  const djangoUrlconfRouteProjection = projectDjangoUrlconfRoutes({
    referenceEvidence,
    factsByFile,
    knownFilePaths,
    fileSymbols,
    symbolsById
  });
  symbols.push(...djangoUrlconfRouteProjection.symbols);
  structuralEdges.push(...djangoUrlconfRouteProjection.structuralEdges);
  for (const symbol of djangoUrlconfRouteProjection.symbols) {
    symbolsById.set(symbol.id, symbol);
  }

  structuralEdges.push(
    ...projectPlayRouterMountEdges({
      factsByFile,
      symbolsById
    }, referenceEvidence, candidateSymbolIds)
  );

  // Framework projections may append references after module resolution. Re-sort
  // the same owned list rather than allocating another full-size copy.
  references.sort((left, right) => compareStableText(left.id, right.id));
  let referenceIndex = 0;
  for (const reference of references) {
    referenceIndex += 1;
    if ((referenceIndex & 4095) === 0) {
      pruneUnresolvedEdgesForCapacity();
    }
    const isHeritage = isHeritageReference(reference);
    const isSignature = isSignatureReference(reference);
    const isInstantiation = reference.relationKind === "instantiates";
    if (
      reference.relationKind !== "calls" &&
      reference.relationKind !== "references" &&
      reference.relationKind !== "routes" &&
      reference.relationKind !== "handles" &&
      !isHeritage &&
      !isSignature &&
      !isInstantiation
    ) {
      continue;
    }
    const isRouteHandler = reference.relationKind === "routes";
    const isEntrypointHandler = reference.relationKind === "handles";
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

    if (
      reference.relationKind === "calls" &&
      reference.callSemantics === "typescript-proven-receiver-member-call" &&
      (reference.callReceiverTypeName !== undefined ||
        reference.callReceiverTargetQualifiedName !== undefined)
    ) {
      deferredTypeScriptMemberReferences.push(reference);
      continue;
    }

    const cobolCicsTransactionResolution = resolveCobolCicsTransactionTarget({
      reference,
      factsByFile,
      symbolsById
    });
    if (cobolCicsTransactionResolution !== null) {
      const candidates = candidateSymbolIds(cobolCicsTransactionResolution.candidates);
      if (cobolCicsTransactionResolution.target !== null) {
        resolvedEdges.push(
          referenceEdge(
            reference,
            cobolCicsTransactionResolution.target.id,
            "heuristic",
            0.85,
            referenceEvidence(
              "framework.cics.literal-transid.unique-program-owner",
              "heuristic",
              candidates
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
              "framework.cics.literal-transid.unresolved-program-owner",
              "unresolved",
              candidates
            )
          )
        );
      }
      continue;
    }

    const expectedSpace = heritage?.expectedSpace ?? (isSignature ? "type" : "value");
    const playRouteResolution = isRouteHandler
      ? resolveExactPlayRouteHandler({ reference, factsByFile, symbolsById })
      : null;
    if (playRouteResolution !== null) {
      const candidates = candidateSymbolIds(
        playRouteResolution.classCandidates,
        playRouteResolution.methodCandidates
      );
      if (playRouteResolution.target !== null) {
        resolvedEdges.push(
          referenceEdge(
            reference,
            playRouteResolution.target.id,
            "exact",
            1,
            referenceEvidence(
              "framework.play.conf-routes.literal-controller-action.package-class-method",
              "module",
              candidates
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
              "framework.play.conf-routes.literal-controller-action.unresolved-handler",
              "unresolved",
              candidates
            )
          )
        );
      }
      continue;
    }

    const railsRouteResolution = isRouteHandler
      ? resolveExactRailsRouteHandler({ reference, symbolsById })
      : null;
    if (railsRouteResolution !== null) {
      const candidates = candidateSymbolIds(
        railsRouteResolution.classCandidates,
        railsRouteResolution.methodCandidates
      );
      if (railsRouteResolution.target !== null) {
        replacedStructuralEdgeIds.add(reference.id);
        resolvedEdges.push(
          referenceEdge(
            reference,
            railsRouteResolution.target.id,
            "exact",
            1,
            referenceEvidence(
              railsRouteHandlerRuleId(reference, "conventional-file-class-method"),
              "module",
              candidates,
              [],
              [reference.filePath, railsRouteResolution.target.filePath]
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
              railsRouteHandlerRuleId(reference, "unresolved-controller-method"),
              "unresolved",
              candidates
            )
          )
        );
      }
      continue;
    }

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
      heritage !== null || isSignature
        ? importBindingSupportsSpace(binding, expectedSpace)
        : isRouteHandler || isEntrypointHandler || isInstantiation
          ? binding.isTypeOnly !== true
          : true
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
      ).filter((candidate) => {
        if (heritage !== null) {
          return (
            exportCandidateSupportsSpace(candidate, heritage.expectedSpace) &&
            isHeritageTarget(candidate.symbol, heritage)
          );
        }
        if (isSignature) {
          return exportCandidateSupportsSpace(candidate, "type") && isSignatureTarget(candidate.symbol);
        }
        if (isInstantiation) {
          return candidate.isTypeOnly !== true && isInstantiationTarget(candidate.symbol);
        }
        return (!isRouteHandler && !isEntrypointHandler) || !candidate.isTypeOnly;
      })
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
      importedTargetPaths,
      exportCandidateIndex
    );
    const exportedCandidates = allExportCandidatesForName(
      exportSurfaces,
      reference.referenceName,
      undefined,
      exportCandidateIndex
    );
    const scopedCandidates =
      heritage !== null
        ? scopedLocal.candidates.filter((candidate) => isHeritageTarget(candidate, heritage))
        : isSignature
          ? scopedLocal.candidates.filter((candidate) => isSignatureTarget(candidate))
        : isInstantiation
          ? scopedLocal.candidates.filter((candidate) => isInstantiationTarget(candidate))
          : scopedLocal.candidates;

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
                : isSignature
                  ? signatureRuleId(reference.relationKind, "local-type-binding")
                : isInstantiation
                  ? instantiationRuleId("local-class-binding")
                : isRouteHandler
                  ? staticRouteHandlerRuleId(reference, "local-handler")
                  : reference.callSemantics === "typescript-array-sort-comparator"
                    ? "syntax.typescript.array-sort-comparator"
                    : "lexical.local-binding",
              "lexical",
              candidateSymbolIds(scopedLocal.candidates),
              [],
              reference.routeResolutionPath ?? [],
              reference.routePrefixChain ?? []
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
                : isSignature
                  ? signatureRuleId(reference.relationKind, "unresolved-type")
                : isInstantiation
                  ? instantiationRuleId("unresolved-class-target")
                : isRouteHandler
                  ? staticRouteHandlerRuleId(reference, "unresolved-handler")
                  : "reference.unresolved",
              "unresolved",
              candidateSymbolIds(scopedLocal.candidates),
              [],
              reference.routeResolutionPath ?? [],
              reference.routePrefixChain ?? []
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
              : isSignature
                ? signatureRuleId(
                    reference.relationKind,
                    resolutionPath.length === 0 ? "imported-type" : "reexported-type"
                  )
              : isInstantiation
                ? instantiationRuleId(
                    resolutionPath.length === 0 ? "imported-class-target" : "reexported-class-target"
                  )
              : isRouteHandler
                ? resolutionPath.length === 0
                  ? staticRouteHandlerRuleId(reference, "imported-handler")
                  : staticRouteHandlerRuleId(reference, "reexported-handler")
                : reference.callSemantics === "typescript-array-sort-comparator"
                  ? "syntax.typescript.array-sort-comparator"
                  : resolutionPath.length === 0
                    ? "module.explicit-import-binding"
                    : "module.reexported-import-binding",
            "module",
            candidateSymbolIds(exactImportedSymbols),
            exactImportedConfigurationPaths,
            [...(reference.routeResolutionPath ?? []), ...resolutionPath],
            reference.routePrefixChain ?? []
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
              : isSignature
                ? signatureRuleId(reference.relationKind, "unresolved-type")
              : isInstantiation
                ? instantiationRuleId("unresolved-class-target")
              : isRouteHandler
                ? staticRouteHandlerRuleId(reference, "unresolved-handler")
                : "reference.unresolved",
            "unresolved",
            candidateSymbolIds(
              isInstantiation || heritage !== null || isSignature
                ? allExactImportedSymbols
                : exactImportedSymbols
            ),
            exactImportedConfigurationPaths,
            reference.routeResolutionPath ?? [],
            reference.routePrefixChain ?? []
          )
        )
      );
      continue;
    }

    // Heritage is deliberately stricter than ordinary calls. An identifier in
    // `extends` or `implements` needs a direct lexical, import, or re-export
    // proof in its required namespace; a project-wide name match would make a
    // type relationship look certain when it is not.
    if (heritage !== null || isSignature || isInstantiation) {
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
              : isSignature
                ? signatureRuleId(reference.relationKind, "unresolved-type")
              : instantiationRuleId("unresolved-class-target"),
            "unresolved",
            candidateSymbolIds(
              allExactImportedSymbols,
              importedCandidates.map((candidate) => candidate.symbol),
              exportedCandidates.map((candidate) => candidate.symbol)
            ),
            exactImportedConfigurationPaths
          )
        )
      );
      continue;
    }

    // Route and entrypoint handler bindings require an explicit lexical,
    // import, or re-export proof. A unique name elsewhere in the project is
    // insufficient evidence for a framework-owned dispatch edge.
    if (isRouteHandler || isEntrypointHandler) {
      unresolvedReferences.push(reference);
      resolvedEdges.push(
        referenceEdge(
          reference,
          null,
          "unresolved",
          0,
          referenceEvidence(
            isEntrypointHandler
              ? "entrypoint.unresolved-handler"
              : staticRouteHandlerRuleId(reference, "unresolved-handler"),
            "unresolved",
            candidateSymbolIds(
              exactImportedSymbols,
              importedCandidates.map((candidate) => candidate.symbol),
              exportedCandidates.map((candidate) => candidate.symbol)
            ),
            exactImportedConfigurationPaths,
            reference.routeResolutionPath ?? [],
            reference.routePrefixChain ?? []
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
  pruneUnresolvedEdgesForCapacity();

  const exactTypeScriptHeritageEdges = [...structuralEdges, ...resolvedEdges].filter(
    (edge) =>
      (edge.kind === "extends" || edge.kind === "implements") &&
      edge.resolution === "exact" &&
      edge.targetId !== null
  );
  const directTypeScriptMemberCandidates = (
    receiver: SymbolNode,
    memberName: string,
    memberKind: "static" | "instance"
  ): readonly SymbolNode[] =>
    symbols.filter(
      (symbol) =>
        (symbol.kind === "method" || symbol.kind === "variable") &&
        symbol.qualifiedName === `${receiver.qualifiedName}.${memberName}` &&
        callableTypeScriptMemberSymbolIds.has(symbol.id) &&
        (memberKind === "static"
          ? staticTypeScriptMemberSymbolIds.has(symbol.id)
          : instanceTypeScriptMemberSymbolIds.has(symbol.id))
    );
  const uniqueInheritedTypeScriptMember = (
    receiver: SymbolNode,
    memberName: string,
    memberKind: "static" | "instance"
  ): { readonly candidates: readonly SymbolNode[]; readonly path: readonly GraphEdge[] } => {
    const path: GraphEdge[] = [];
    const visited = new Set<string>([receiver.id]);
    let current = receiver;
    while (true) {
      const eligibleEdges = exactTypeScriptHeritageEdges.filter((edge) => {
        if (edge.sourceId !== current.id || edge.targetId === null) {
          return false;
        }
        const target = symbolsById.get(edge.targetId);
        if (target === undefined) {
          return false;
        }
        return current.kind === "class"
          ? edge.kind === "extends" && target.kind === "class"
          : edge.kind === "extends" && target.kind === "interface";
      });
      const edge = eligibleEdges.length === 1 ? eligibleEdges[0] : undefined;
      if (edge === undefined || edge.targetId === null) {
        return { candidates: [], path: [] };
      }
      const target = symbolsById.get(edge.targetId);
      if (target === undefined || visited.has(target.id)) {
        return { candidates: [], path: [] };
      }
      visited.add(target.id);
      path.push(edge);
      const candidates = directTypeScriptMemberCandidates(target, memberName, memberKind);
      if (candidates.length > 0) {
        return { candidates, path };
      }
      current = target;
    }
  };

  let deferredReferenceIndex = 0;
  for (const reference of deferredTypeScriptMemberReferences) {
    deferredReferenceIndex += 1;
    if ((deferredReferenceIndex & 4095) === 0) {
      pruneUnresolvedEdgesForCapacity();
    }
    const receiverTypeName = reference.callReceiverTypeName;
    const receiverBindingSpace = reference.callReceiverBindingSpace ?? "type";
    const receiverMemberKind = reference.callReceiverMemberKind;
    const scopedReceiver =
      receiverTypeName === undefined
        ? null
        : resolveScopedBinding(
            receiverTypeName,
            referenceScopeIdsByReferenceId.get(reference.id) ?? [],
            localBindingsByFile.get(reference.filePath) ?? [],
            symbolsById,
            receiverBindingSpace
          );
    const localReceiverCandidates =
      receiverTypeName === undefined
        ? []
        : scopedReceiver?.hasBinding === true
          ? scopedReceiver.candidates.filter(
              (symbol) => symbol.kind === "class" || symbol.kind === "interface"
            )
          : topLevelLocalCandidates(symbols, reference.filePath, receiverTypeName).filter(
              (symbol) => symbol.kind === "class" || symbol.kind === "interface"
            );
    const namespaceImportBindings =
      receiverTypeName === undefined || scopedReceiver?.hasBinding === true
        ? []
        : (importBindingsByFile.get(reference.filePath) ?? []).filter(
            (binding) =>
              binding.localName === receiverTypeName &&
              binding.importedName === "*" &&
              binding.isTypeOnly !== true
          );
    const namespaceImportedCandidates = canonicalExportCandidates(
      namespaceImportBindings.flatMap((binding) => {
        const key = moduleKey(reference.filePath, binding.moduleSpecifier);
        const targetPath = moduleTargetPathByKey.get(key);
        const resolution = moduleResolutionByKey.get(key);
        const targetEntry = targetPath === undefined
          ? undefined
          : exportSurfaces.get(targetPath)?.get(reference.referenceName);
        if (
          targetEntry === undefined ||
          targetEntry.ambiguous ||
          resolution === undefined
        ) {
          return [];
        }
        return targetEntry.candidates
          .filter(
            (candidate) =>
              candidate.isTypeOnly !== true &&
              (candidate.symbol.kind === "function" ||
                callableTypeScriptMemberSymbolIds.has(candidate.symbol.id))
          )
          .map((candidate) => reExportCandidate(reference.filePath, resolution, candidate));
      })
    );
    const importedReceiverCandidates = canonicalExportCandidates(
      (scopedReceiver?.hasBinding === true ? [] : importBindingsByFile.get(reference.filePath) ?? [])
        .filter(
          (binding) =>
            receiverTypeName !== undefined &&
            binding.localName === receiverTypeName &&
            (receiverBindingSpace === "type" || binding.isTypeOnly !== true)
        )
        .flatMap((binding) => {
          const targetPath = moduleTargetPathByKey.get(
            moduleKey(reference.filePath, binding.moduleSpecifier)
          );
          return targetPath === undefined
            ? []
            : candidatesForExport(exportSurfaces, targetPath, binding.importedName);
        })
        .filter(
          (candidate) =>
            (candidate.symbol.kind === "class" || candidate.symbol.kind === "interface") &&
            (receiverBindingSpace === "type" || candidate.isTypeOnly !== true)
        )
    );
    const receiverCandidates = [
      ...localReceiverCandidates,
      ...importedReceiverCandidates.map((candidate) => candidate.symbol)
    ].filter(
      (candidate, index, all) => all.findIndex((other) => other.id === candidate.id) === index
    );
    const directMemberCandidates =
      namespaceImportBindings.length > 0
        ? []
        : receiverMemberKind === undefined
        ? []
        : reference.callReceiverTargetQualifiedName !== undefined
        ? symbols.filter(
            (symbol) =>
              (symbol.kind === "method" || symbol.kind === "variable") &&
              symbol.qualifiedName === reference.callReceiverTargetQualifiedName &&
              callableTypeScriptMemberSymbolIds.has(symbol.id) &&
              (receiverMemberKind === "static"
                ? staticTypeScriptMemberSymbolIds.has(symbol.id)
                : instanceTypeScriptMemberSymbolIds.has(symbol.id))
          )
        : receiverCandidates.length === 1 && receiverCandidates[0] !== undefined
          ? directTypeScriptMemberCandidates(
              receiverCandidates[0],
              reference.referenceName,
              receiverMemberKind
            )
          : [];
    const inherited =
      directMemberCandidates.length === 0 &&
      reference.callReceiverTargetQualifiedName === undefined &&
      receiverCandidates.length === 1 &&
      receiverCandidates[0] !== undefined
        ? uniqueInheritedTypeScriptMember(
            receiverCandidates[0],
            reference.referenceName,
            receiverMemberKind ?? "instance"
          )
        : { candidates: [], path: [] };
    const memberCandidates =
      namespaceImportedCandidates.length > 0
        ? namespaceImportedCandidates.map((candidate) => candidate.symbol)
        : directMemberCandidates.length === 0
          ? inherited.candidates
          : directMemberCandidates;
    const runtimeSurfaceTainted =
      receiverMemberKind !== undefined &&
      [
        ...receiverCandidates.map((candidate) => candidate.id),
        ...inherited.path.flatMap((edge) =>
          edge.targetId === null ? [edge.sourceId] : [edge.sourceId, edge.targetId]
        )
      ].some(
        (typeSymbolId) =>
          runtimeTaintedTypeScriptMemberSurfaceKeys.has(
            `${typeSymbolId}\u0000${receiverMemberKind}\u0000${reference.referenceName}`
          ) ||
          runtimeTaintedTypeScriptMemberSurfaceKeys.has(
            `${typeSymbolId}\u0000${receiverMemberKind}\u0000*`
          )
      );
    const decoratorTainted =
      receiverCandidates.some((candidate) =>
        decoratorTaintedTypeScriptTypeSymbolIds.has(candidate.id)
      ) ||
      inherited.path.some(
        (edge) =>
          decoratorTaintedTypeScriptTypeSymbolIds.has(edge.sourceId) ||
          (edge.targetId !== null && decoratorTaintedTypeScriptTypeSymbolIds.has(edge.targetId))
      ) ||
      memberCandidates.some((candidate) =>
        decoratorTaintedTypeScriptMemberSymbolIds.has(candidate.id)
      ) ||
      runtimeSurfaceTainted;
    const target =
      !decoratorTainted && memberCandidates.length === 1 ? memberCandidates[0] : undefined;
    if (target !== undefined) {
      const namespaceCandidate = namespaceImportedCandidates.find(
        (candidate) => candidate.symbol.id === target.id
      );
      resolvedEdges.push(
        referenceEdge(
          reference,
          target.id,
          "exact",
          1,
          referenceEvidence(
            namespaceImportedCandidates.length > 0
              ? "syntax.typescript.proven-namespace-member-call"
              : "syntax.typescript.proven-receiver-member-call",
            target.filePath === reference.filePath ? "lexical" : "module",
            candidateSymbolIds(memberCandidates),
            uniqueConfigurationPaths([
              ...namespaceImportedCandidates.map((candidate) => candidate.configurationPaths),
              ...importedReceiverCandidates.map((candidate) => candidate.configurationPaths),
              ...inherited.path.map((edge) => edge.evidence?.configurationPaths ?? [])
            ]),
            namespaceCandidate?.path ??
              (target.filePath === reference.filePath ? [] : [reference.filePath, target.filePath])
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
          "syntax.typescript.proven-receiver-member-call.unresolved-target",
          "unresolved",
          candidateSymbolIds(memberCandidates)
        )
      )
    );
  }
  pruneUnresolvedEdgesForCapacity();

  const overrideReferences = references
    .filter(isOverrideReference)
    .sort((left, right) => compareStableText(left.id, right.id));
  const containerIdsByContainedId = new Map<string, Set<string>>();
  const containedIdsByContainerId = new Map<string, Set<string>>();
  if (overrideReferences.length > 0) {
    for (const edge of structuralEdges) {
      if (edge.kind !== "contains" || edge.resolution !== "exact" || edge.targetId === null) {
        continue;
      }
      const containers = containerIdsByContainedId.get(edge.targetId) ?? new Set<string>();
      containers.add(edge.sourceId);
      containerIdsByContainedId.set(edge.targetId, containers);
      const contained = containedIdsByContainerId.get(edge.sourceId) ?? new Set<string>();
      contained.add(edge.targetId);
      containedIdsByContainerId.set(edge.sourceId, contained);
    }
  }
  // TypeScript heritage arrives through pending-reference resolution, while
  // evidence-first extractors may already persist a same-file hierarchy edge.
  // Both forms must be available before projecting an exact override relation.
  const overrideHierarchyEdges = [...structuralEdges, ...resolvedEdges];
  for (const reference of overrideReferences) {
    const resolution = resolveExactOverrideTarget({
      reference,
      symbolsById,
      resolvedEdges: overrideHierarchyEdges,
      containerIdsByContainedId,
      containedIdsByContainerId
    });
    if (resolution.target !== null) {
      resolvedEdges.push(
        referenceEdge(
          reference,
          resolution.target.id,
          "exact",
          1,
          referenceEvidence(
            overrideRuleId("explicit-direct-base-method"),
            "syntax",
            candidateSymbolIds(resolution.candidates)
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
          overrideRuleId("unresolved-direct-base-method"),
          "unresolved",
          candidateSymbolIds(resolution.candidates)
        )
      )
    );
  }

  const unresolvedById = new Map(
    unresolvedReferences.map((reference) => [reference.id, reference])
  );
  for (const reference of [...unresolvedById.values()].sort((left, right) =>
    compareStableText(left.id, right.id)
  )) {
    const projection = projectUnresolvedReferenceWithPlugins({
      reference,
      sourceDocumentsByPath,
      symbols,
      symbolsById,
      localBindingsByFile,
      importBindingsByFile,
      referenceScopeIdsByReferenceId,
      moduleTargetPathByKey,
      moduleResolutionByKey,
      exportSurfaces,
      registry: input.referenceResolverPlugins
    });
    if (projection === null) {
      continue;
    }
    const existingEdgeIndex = resolvedEdges.findIndex(
      (edge) =>
        edge.sourceId === reference.sourceId &&
        edge.targetId === null &&
        edge.kind === reference.relationKind &&
        edge.filePath === reference.filePath &&
        edge.range.start.line === reference.range.start.line &&
        edge.range.start.column === reference.range.start.column &&
        edge.referenceName === reference.referenceName
    );
    if (existingEdgeIndex >= 0) {
      resolvedEdges.splice(existingEdgeIndex, 1, projection.edge);
    } else {
      resolvedEdges.push(projection.edge);
    }
    if (projection.resolved) {
      unresolvedById.delete(reference.id);
    }
  }
  unresolvedReferences.length = 0;
  for (const reference of unresolvedById.values()) {
    unresolvedReferences.push(reference);
  }

  pruneUnresolvedEdgesForCapacity();
  const nestRouteProjection = projectNestRouterRoutes({
    dependencies: { moduleKey, resolveScopedBinding, canonicalExportCandidates, candidatesForExport },
    symbols,
    structuralEdges,
    factsByFile,
    localBindingsByFile,
    importBindingsByFile,
    symbolsById,
    moduleTargetPathByKey,
    exportSurfaces,
    frameworkRouteProjections: frameworkPluginOutputs.routeProjections
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
  for (const edge of [
    ...nestRouteProjection.structuralEdges.filter((edge) => !replacedStructuralEdgeIds.has(edge.id)),
    ...projectedResolvedEdges
  ]) {
    const existing = edgeById.get(edge.id);
    if (
      existing?.evidence?.ruleId === "syntax.typescript.array-sort-comparator" &&
      edge.evidence?.ruleId !== "syntax.typescript.array-sort-comparator"
    ) {
      continue;
    }
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
