import { compareStableText, createEdgeId, createSymbolId, type GoFrameStandardRouterBindingFact, type GoFrameStandardRouterControllerMethodFact, type GoFrameStandardRouterRequestFact, type GraphEdge, type SymbolNode } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import type { ProjectModuleResolver } from "../../ports/source-catalog.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

function goFrameStandardRouterPath(prefix: string, path: string): string | null {
  if (
    !path.startsWith("/") ||
    path.includes("//") ||
    (prefix !== "" && (!prefix.startsWith("/") || prefix.endsWith("/") || prefix.includes("//")))
  ) {
    return null;
  }
  const combined = `${prefix}${path}`;
  return combined === "" || combined.includes("//") ? null : combined;
}

interface GoFrameStandardRouterPackageFile {
  readonly filePath: string;
  readonly facts: NonNullable<ExtractedFileFacts["goFrameStandardRouterFacts"]>;
}

interface ProjectedGoFrameStandardRouterRoute {
  readonly requestFilePath: string;
  readonly controllerFilePath: string;
  /** Factory declaration evidence when Bind receives a statically proven factory call. */
  readonly factoryFilePath?: string;
  readonly bindingFilePath: string;
  readonly request: GoFrameStandardRouterRequestFact;
  readonly controllerMethod: GoFrameStandardRouterControllerMethodFact;
  readonly binding: GoFrameStandardRouterBindingFact;
  readonly handler: SymbolNode;
  readonly path: string;
  readonly domain: string | null;
  readonly ruleId: string;
  readonly configurationPaths: readonly string[];
}

/**
 * A bounded GoFrame route candidate: the request metadata and one controller
 * signature agree, but no static `Bind` registration proves runtime mounting.
 */
interface ProjectedGoFrameStandardRouterHeuristicRoute {
  readonly requestFilePath: string;
  readonly controllerFilePath: string;
  readonly request: GoFrameStandardRouterRequestFact;
  readonly controllerMethod: GoFrameStandardRouterControllerMethodFact;
  readonly handler: SymbolNode;
  readonly configurationPaths: readonly string[];
}

interface ResolvedGoFrameStandardRouterControllerSignature {
  readonly controllerFilePath: string;
  readonly method: GoFrameStandardRouterControllerMethodFact;
  readonly requestPackage: ResolvedGoFrameStandardRouterPackage;
  /** A static Bind names this controller, so it cannot become a prefix-free candidate. */
  readonly isBound: boolean;
}

function compareProjectedGoFrameStandardRouterRoute(
  left: ProjectedGoFrameStandardRouterRoute,
  right: ProjectedGoFrameStandardRouterRoute
): number {
  return (
    compareStableText(left.bindingFilePath, right.bindingFilePath) ||
    left.binding.range.start.line - right.binding.range.start.line ||
    left.binding.range.start.column - right.binding.range.start.column ||
    compareStableText(left.requestFilePath, right.requestFilePath) ||
    left.request.range.start.line - right.request.range.start.line ||
    left.request.range.start.column - right.request.range.start.column ||
    compareStableText(left.controllerFilePath, right.controllerFilePath) ||
    compareStableText(left.controllerMethod.handlerId, right.controllerMethod.handlerId) ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.domain ?? "", right.domain ?? "")
  );
}

function compareProjectedGoFrameStandardRouterHeuristicRoute(
  left: ProjectedGoFrameStandardRouterHeuristicRoute,
  right: ProjectedGoFrameStandardRouterHeuristicRoute
): number {
  return (
    compareStableText(left.requestFilePath, right.requestFilePath) ||
    left.request.range.start.line - right.request.range.start.line ||
    left.request.range.start.column - right.request.range.start.column ||
    compareStableText(left.controllerFilePath, right.controllerFilePath) ||
    compareStableText(left.controllerMethod.handlerId, right.controllerMethod.handlerId)
  );
}

interface GoFrameStandardRouterRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
}

interface ResolvedGoFrameStandardRouterPackage {
  readonly packageKey: string;
  readonly packageFiles: readonly GoFrameStandardRouterPackageFile[];
  readonly configurationPaths: readonly string[];
}

/** A direct Bind or a factory Bind reduced to one exact controller identity. */
interface EffectiveGoFrameStandardRouterBinding {
  readonly binding: GoFrameStandardRouterBindingFact;
  readonly factoryFilePath?: string;
  readonly isFactoryBinding: boolean;
}

/**
 * Projects GoFrame standard-router routes through either one literal Go
 * package directory or a root local `go.mod` import that resolves to one
 * indexed package directory. Explicit aliases are accepted directly; default
 * import qualifiers need a matching target package clause. It never uses
 * project-wide same-name matching, import-path-name inference, external
 * modules, or transitive imports. A factory Bind is exact only when a
 * no-argument factory directly returns its declared local controller pointer.
 * When no identifiable static Bind names one controller, a unique
 * request-signature match can additionally become a prefix-free heuristic
 * candidate; it never replaces or duplicates exact Bound-controller routes.
 */
export function projectGoFrameStandardRouterRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly moduleResolver: ProjectModuleResolver | undefined;
}, referenceEvidence: ReferenceEvidenceFactory, candidateSymbolIds: (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[], goPackageDirectory: (filePath: string) => string): GoFrameStandardRouterRouteProjection {
  const candidates: ProjectedGoFrameStandardRouterRoute[] = [];
  const heuristicCandidates: ProjectedGoFrameStandardRouterHeuristicRoute[] = [];
  const packageFilesByKey = new Map<string, GoFrameStandardRouterPackageFile[]>();
  const packageKey = (filePath: string, packageName: string): string =>
    `${goPackageDirectory(filePath)}\u0000${packageName}`;
  const controllerKey = (resolvedPackageKey: string, controllerName: string): string =>
    `${resolvedPackageKey}\u0000${controllerName}`;

  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const goFrameFacts = facts.goFrameStandardRouterFacts;
    if (goFrameFacts === undefined) {
      continue;
    }
    const key = packageKey(filePath, goFrameFacts.packageName);
    const packageFiles = packageFilesByKey.get(key) ?? [];
    packageFiles.push({ filePath, facts: goFrameFacts });
    packageFilesByKey.set(key, packageFiles);
  }
  for (const packageFiles of packageFilesByKey.values()) {
    packageFiles.sort((left, right) => compareStableText(left.filePath, right.filePath));
  }
  const resolveGoFrameImport = (
    sourceFilePath: string,
    sourceFacts: NonNullable<ExtractedFileFacts["goFrameStandardRouterFacts"]>,
    alias: string
  ): ResolvedGoFrameStandardRouterPackage | null => {
    if (input.moduleResolver === undefined) {
      return null;
    }
    const resolveOneImport = (
      moduleSpecifier: string
    ): ResolvedGoFrameStandardRouterPackage | null => {
      const resolution = input.moduleResolver?.resolve(sourceFilePath, moduleSpecifier);
      if (
        resolution === undefined ||
        resolution.strategy !== "go-module-package" ||
        resolution.targetFilePath === null ||
        !input.knownFilePaths.has(resolution.targetFilePath)
      ) {
        return null;
      }
      const targetPackages = [...packageFilesByKey.entries()].filter(([, packageFiles]) =>
        packageFiles.some((packageFile) => packageFile.filePath === resolution.targetFilePath)
      );
      if (targetPackages.length !== 1 || targetPackages[0] === undefined) {
        return null;
      }
      const [resolvedPackageKey, packageFiles] = targetPackages[0];
      return {
        packageKey: resolvedPackageKey,
        packageFiles,
        configurationPaths: resolution.configurationPaths
      };
    };

    const imports = sourceFacts.imports ?? sourceFacts.explicitImports ?? [];
    const explicitAliases = imports.filter((candidate) => candidate.localName === alias);
    if (explicitAliases.length > 0) {
      return explicitAliases.length === 1 && explicitAliases[0] !== undefined
        ? resolveOneImport(explicitAliases[0].moduleSpecifier)
        : null;
    }

    const defaultImportPackages = imports
      .filter((candidate) => candidate.localName === undefined)
      .flatMap((candidate) => {
        const resolved = resolveOneImport(candidate.moduleSpecifier);
        const packageName = resolved?.packageFiles[0]?.facts.packageName;
        return packageName === alias && resolved !== null ? [resolved] : [];
      });
    return defaultImportPackages.length === 1 && defaultImportPackages[0] !== undefined
      ? defaultImportPackages[0]
      : null;
  };

  /**
   * A factory call becomes an ordinary controller binding only after resolving
   * its package and finding exactly one syntax-proven factory declaration. The
   * factory's direct local pointer return keeps the controller package equal to
   * the factory package, so the existing request/controller proof stays valid.
   */
  const effectiveBindingsByFile = new Map<
    string,
    readonly EffectiveGoFrameStandardRouterBinding[]
  >();
  for (const [bindingFilePath, extracted] of [...input.factsByFile.entries()].sort(
    ([left], [right]) => compareStableText(left, right)
  )) {
    const bindingFacts = extracted.goFrameStandardRouterFacts;
    if (bindingFacts === undefined) {
      continue;
    }
    const localPackageKey = packageKey(bindingFilePath, bindingFacts.packageName);
    const localPackage: ResolvedGoFrameStandardRouterPackage = {
      packageKey: localPackageKey,
      packageFiles: packageFilesByKey.get(localPackageKey) ?? [],
      configurationPaths: []
    };
    const effectiveBindings: EffectiveGoFrameStandardRouterBinding[] = bindingFacts.controllerBindings.map(
      (binding) => ({ binding, isFactoryBinding: false })
    );
    for (const factoryBinding of bindingFacts.controllerFactoryBindings ?? []) {
      const factoryPackage =
        factoryBinding.factoryPackageAlias === undefined
          ? localPackage
          : resolveGoFrameImport(
              bindingFilePath,
              bindingFacts,
              factoryBinding.factoryPackageAlias
            );
      if (factoryPackage === null) {
        continue;
      }
      const matchingFactories = factoryPackage.packageFiles.flatMap(({ filePath, facts }) =>
        (facts.controllerFactories ?? [])
          .filter((factory) => factory.factoryName === factoryBinding.factoryName)
          .map((factory) => ({ filePath, factory }))
      );
      if (matchingFactories.length !== 1 || matchingFactories[0] === undefined) {
        continue;
      }
      const matchedFactory = matchingFactories[0];
      effectiveBindings.push({
        binding: {
          controllerName: matchedFactory.factory.controllerName,
          ...(factoryBinding.factoryPackageAlias === undefined
            ? {}
            : { controllerPackageAlias: factoryBinding.factoryPackageAlias }),
          prefix: factoryBinding.prefix,
          domains: factoryBinding.domains,
          range: factoryBinding.range
        },
        factoryFilePath: matchedFactory.filePath,
        isFactoryBinding: true
      });
    }
    effectiveBindingsByFile.set(bindingFilePath, effectiveBindings);
  }

  /**
   * Do not synthesize a prefix-free candidate when an observed static Bind can
   * already name the controller. If an aliased Bind cannot be resolved, reject
   * every same-named candidate rather than risk hiding its unknown prefix.
   */
  const boundControllerKeys = new Set<string>();
  const unresolvedBoundControllerNames = new Set<string>();
  for (const [bindingFilePath, extracted] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const bindingFacts = extracted.goFrameStandardRouterFacts;
    if (bindingFacts === undefined) {
      continue;
    }
    const localPackageKey = packageKey(bindingFilePath, bindingFacts.packageName);
    const localPackage: ResolvedGoFrameStandardRouterPackage = {
      packageKey: localPackageKey,
      packageFiles: packageFilesByKey.get(localPackageKey) ?? [],
      configurationPaths: []
    };
    for (const { binding } of effectiveBindingsByFile.get(bindingFilePath) ?? []) {
      const controllerPackage =
        binding.controllerPackageAlias === undefined
          ? localPackage
          : resolveGoFrameImport(
              bindingFilePath,
              bindingFacts,
              binding.controllerPackageAlias
            );
      if (controllerPackage === null) {
        unresolvedBoundControllerNames.add(binding.controllerName);
        continue;
      }
      boundControllerKeys.add(controllerKey(controllerPackage.packageKey, binding.controllerName));
    }
  }

  for (const [bindingFilePath, extracted] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const bindingFacts = extracted.goFrameStandardRouterFacts;
    if (bindingFacts === undefined) {
      continue;
    }
    const packageFiles = packageFilesByKey.get(packageKey(bindingFilePath, bindingFacts.packageName)) ?? [];

    for (const effectiveBinding of effectiveBindingsByFile.get(bindingFilePath) ?? []) {
      const { binding } = effectiveBinding;
      if (binding.controllerPackageAlias !== undefined) {
        continue;
      }
      const controllerMethods = packageFiles.flatMap(({ filePath, facts }) =>
        facts.controllerMethods
          .filter(
            (method) =>
              method.controllerName === binding.controllerName &&
              method.requestPackageAlias === undefined
          )
          .map((method) => ({ filePath, method }))
      );
      for (const controllerMethod of controllerMethods) {
        const equallyTypedMethods = controllerMethods.filter(
          (candidate) => candidate.method.requestType === controllerMethod.method.requestType
        );
        if (equallyTypedMethods.length !== 1) {
          continue;
        }
        const matchingRequests = packageFiles.flatMap(({ filePath, facts }) =>
          facts.requests
            .filter((request) => request.name === controllerMethod.method.requestType)
            .map((request) => ({ filePath, request }))
        );
        if (matchingRequests.length !== 1 || matchingRequests[0] === undefined) {
          continue;
        }
        const handler = input.symbolsById.get(controllerMethod.method.handlerId);
        if (handler?.kind !== "method" || handler.filePath !== controllerMethod.filePath) {
          continue;
        }
        const path = goFrameStandardRouterPath(binding.prefix, matchingRequests[0].request.path);
        if (path === null) {
          continue;
        }
        if (
          matchingRequests[0].filePath === controllerMethod.filePath &&
          matchingRequests[0].filePath === bindingFilePath
          && !effectiveBinding.isFactoryBinding
        ) {
          // The syntax extractor already owns fully same-file standard routes.
          continue;
        }
        const domains =
          binding.domains.length === 0
            ? [null]
            : [...new Set(binding.domains)].sort(compareStableText);
        for (const domain of domains) {
          candidates.push({
            requestFilePath: matchingRequests[0].filePath,
            controllerFilePath: controllerMethod.filePath,
            ...(effectiveBinding.factoryFilePath === undefined
              ? {}
              : { factoryFilePath: effectiveBinding.factoryFilePath }),
            bindingFilePath,
            request: matchingRequests[0].request,
            controllerMethod: controllerMethod.method,
            binding,
            handler,
            path,
            domain,
            ruleId: effectiveBinding.isFactoryBinding
              ? "framework.goframe.standard-router.g-meta.same-package.factory-bind"
              : "framework.goframe.standard-router.g-meta.same-package.cross-file",
            configurationPaths: []
          });
        }
      }
    }
  }

  for (const [bindingFilePath, extracted] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const bindingFacts = extracted.goFrameStandardRouterFacts;
    if (bindingFacts === undefined) {
      continue;
    }
    const localPackageKey = packageKey(bindingFilePath, bindingFacts.packageName);
    const localPackageFiles = packageFilesByKey.get(localPackageKey) ?? [];
    const localPackage: ResolvedGoFrameStandardRouterPackage = {
      packageKey: localPackageKey,
      packageFiles: localPackageFiles,
      configurationPaths: []
    };

    for (const effectiveBinding of effectiveBindingsByFile.get(bindingFilePath) ?? []) {
      const { binding } = effectiveBinding;
      const controllerPackage =
        binding.controllerPackageAlias === undefined
          ? localPackage
          : resolveGoFrameImport(
              bindingFilePath,
              bindingFacts,
              binding.controllerPackageAlias
            );
      if (controllerPackage === null) {
        continue;
      }
      const controllerMethods = controllerPackage.packageFiles.flatMap(({ filePath, facts }) =>
        facts.controllerMethods
          .filter((method) => method.controllerName === binding.controllerName)
          .map((method) => ({ filePath, facts, method }))
      );
      const resolvedControllerMethods = controllerMethods.flatMap((controllerMethod) => {
        const requestPackage =
          controllerMethod.method.requestPackageAlias === undefined
            ? controllerPackage
            : resolveGoFrameImport(
                controllerMethod.filePath,
                controllerMethod.facts,
                controllerMethod.method.requestPackageAlias
              );
        return requestPackage === null ? [] : [{ ...controllerMethod, requestPackage }];
      });

      for (const controllerMethod of resolvedControllerMethods) {
        if (
          binding.controllerPackageAlias === undefined &&
          controllerMethod.method.requestPackageAlias === undefined
        ) {
          // The same-package collector above owns fully local standard routes.
          continue;
        }
        const equallyTypedMethods = resolvedControllerMethods.filter(
          (candidate) =>
            candidate.method.requestType === controllerMethod.method.requestType &&
            candidate.requestPackage.packageKey === controllerMethod.requestPackage.packageKey
        );
        if (equallyTypedMethods.length !== 1) {
          continue;
        }
        const matchingRequests = controllerMethod.requestPackage.packageFiles.flatMap(
          ({ filePath, facts }) =>
            facts.requests
              .filter((request) => request.name === controllerMethod.method.requestType)
              .map((request) => ({ filePath, request }))
        );
        if (matchingRequests.length !== 1 || matchingRequests[0] === undefined) {
          continue;
        }
        const handler = input.symbolsById.get(controllerMethod.method.handlerId);
        if (handler?.kind !== "method" || handler.filePath !== controllerMethod.filePath) {
          continue;
        }
        const path = goFrameStandardRouterPath(binding.prefix, matchingRequests[0].request.path);
        if (path === null) {
          continue;
        }
        const domains =
          binding.domains.length === 0
            ? [null]
            : [...new Set(binding.domains)].sort(compareStableText);
        const configurationPaths = [
          ...new Set([
            ...controllerPackage.configurationPaths,
            ...controllerMethod.requestPackage.configurationPaths
          ])
        ].sort(compareStableText);
        for (const domain of domains) {
          candidates.push({
            requestFilePath: matchingRequests[0].filePath,
            controllerFilePath: controllerMethod.filePath,
            ...(effectiveBinding.factoryFilePath === undefined
              ? {}
              : { factoryFilePath: effectiveBinding.factoryFilePath }),
            bindingFilePath,
            request: matchingRequests[0].request,
            controllerMethod: controllerMethod.method,
            binding,
            handler,
            path,
            domain,
            ruleId: effectiveBinding.isFactoryBinding
              ? "framework.goframe.standard-router.g-meta.go-module.factory-bind"
              : "framework.goframe.standard-router.g-meta.go-module.cross-package",
            configurationPaths
          });
        }
      }
    }
  }

  const controllerSignatures: ResolvedGoFrameStandardRouterControllerSignature[] = [];
  for (const [controllerFilePath, extracted] of [...input.factsByFile.entries()].sort(
    ([left], [right]) => compareStableText(left, right)
  )) {
    const controllerFacts = extracted.goFrameStandardRouterFacts;
    if (controllerFacts === undefined) {
      continue;
    }
    const localPackageKey = packageKey(controllerFilePath, controllerFacts.packageName);
    const controllerPackage: ResolvedGoFrameStandardRouterPackage = {
      packageKey: localPackageKey,
      packageFiles: packageFilesByKey.get(localPackageKey) ?? [],
      configurationPaths: []
    };
    for (const method of controllerFacts.controllerMethods) {
      const isBound =
        boundControllerKeys.has(controllerKey(controllerPackage.packageKey, method.controllerName)) ||
        unresolvedBoundControllerNames.has(method.controllerName);
      const requestPackage =
        method.requestPackageAlias === undefined
          ? controllerPackage
          : resolveGoFrameImport(controllerFilePath, controllerFacts, method.requestPackageAlias);
      if (requestPackage === null) {
        continue;
      }
      controllerSignatures.push({
        controllerFilePath,
        method,
        requestPackage,
        isBound
      });
    }
  }

  const controllerSignaturesByRequest = new Map<
    string,
    ResolvedGoFrameStandardRouterControllerSignature[]
  >();
  for (const controllerSignature of controllerSignatures) {
    const requestKey = `${controllerSignature.requestPackage.packageKey}\u0000${controllerSignature.method.requestType}`;
    const sameRequestSignatures = controllerSignaturesByRequest.get(requestKey) ?? [];
    sameRequestSignatures.push(controllerSignature);
    controllerSignaturesByRequest.set(requestKey, sameRequestSignatures);
  }

  for (const controllerMethod of controllerSignatures) {
    if (controllerMethod.isBound) {
      continue;
    }
    const requestKey = `${controllerMethod.requestPackage.packageKey}\u0000${controllerMethod.method.requestType}`;
    const equallyMatchedMethods = controllerSignaturesByRequest.get(requestKey) ?? [];
    if (equallyMatchedMethods.length !== 1) {
      continue;
    }
    const matchingRequests = controllerMethod.requestPackage.packageFiles.flatMap(
      ({ filePath, facts }) =>
        facts.requests
          .filter((request) => request.name === controllerMethod.method.requestType)
          .map((request) => ({ filePath, request }))
    );
    if (matchingRequests.length !== 1 || matchingRequests[0] === undefined) {
      continue;
    }
    const handler = input.symbolsById.get(controllerMethod.method.handlerId);
    if (handler?.kind !== "method" || handler.filePath !== controllerMethod.controllerFilePath) {
      continue;
    }
    heuristicCandidates.push({
      requestFilePath: matchingRequests[0].filePath,
      controllerFilePath: controllerMethod.controllerFilePath,
      request: matchingRequests[0].request,
      controllerMethod: controllerMethod.method,
      handler,
      configurationPaths: controllerMethod.requestPackage.configurationPaths
    });
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedGoFrameStandardRouterRoute)) {
    const dedupeKey = [
      candidate.bindingFilePath,
      candidate.binding.range.start.line,
      candidate.binding.range.start.column,
      candidate.requestFilePath,
      candidate.request.range.start.line,
      candidate.request.range.start.column,
      candidate.controllerMethod.handlerId,
      candidate.path,
      candidate.domain ?? ""
    ].join("\u0000");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const file = input.fileSymbols.get(candidate.requestFilePath);
    if (file === undefined) {
      continue;
    }
    const name = `${candidate.request.method} ${candidate.path}`;
    const bindingIdentity = [
      candidate.bindingFilePath,
      candidate.binding.range.start.line,
      candidate.binding.range.start.column,
      candidate.controllerMethod.handlerId,
      candidate.domain === null ? "hostless" : `domain-${encodeURIComponent(candidate.domain)}`
    ].join(":");
    const qualifiedName = `${candidate.requestFilePath}#route:${name}:goframe-standard-router:${bindingIdentity}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.requestFilePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.requestFilePath,
      range: candidate.request.range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(route);
    const routeEvidence = referenceEvidence(
      candidate.ruleId,
      "module",
      [candidate.handler.id],
      candidate.configurationPaths,
      [
        candidate.requestFilePath,
        candidate.controllerFilePath,
        ...(candidate.factoryFilePath === undefined ? [] : [candidate.factoryFilePath]),
        candidate.bindingFilePath
      ]
    );
    structuralEdges.push({
      id: createEdgeId({
        sourceId: file.id,
        targetId: route.id,
        kind: "contains",
        line: candidate.request.range.start.line,
        column: candidate.request.range.start.column,
        referenceName: route.name
      }),
      sourceId: file.id,
      targetId: route.id,
      kind: "contains",
      filePath: candidate.requestFilePath,
      range: candidate.request.range,
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
        line: candidate.request.range.start.line,
        column: candidate.request.range.start.column,
        referenceName: candidate.handler.name
      }),
      sourceId: route.id,
      targetId: candidate.handler.id,
      kind: "routes",
      filePath: candidate.requestFilePath,
      range: candidate.request.range,
      resolution: "exact",
      confidence: 1,
      referenceName: candidate.handler.name,
      evidence:
        candidate.domain === null
          ? routeEvidence
          : { ...routeEvidence, routeDomain: candidate.domain }
    });
  }

  const heuristicSeen = new Set<string>();
  for (const candidate of [...heuristicCandidates].sort(compareProjectedGoFrameStandardRouterHeuristicRoute)) {
    const dedupeKey = [
      candidate.requestFilePath,
      candidate.request.range.start.line,
      candidate.request.range.start.column,
      candidate.controllerMethod.handlerId
    ].join("\u0000");
    if (heuristicSeen.has(dedupeKey)) {
      continue;
    }
    heuristicSeen.add(dedupeKey);

    const file = input.fileSymbols.get(candidate.requestFilePath);
    if (file === undefined) {
      continue;
    }
    const name = `${candidate.request.method} ${candidate.request.path}`;
    const qualifiedName = `${candidate.requestFilePath}#route:${name}:goframe-standard-router:heuristic-unbound:${candidate.controllerMethod.handlerId}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.requestFilePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.requestFilePath,
      range: candidate.request.range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(route);
    structuralEdges.push({
      id: createEdgeId({
        sourceId: file.id,
        targetId: route.id,
        kind: "contains",
        line: candidate.request.range.start.line,
        column: candidate.request.range.start.column,
        referenceName: route.name
      }),
      sourceId: file.id,
      targetId: route.id,
      kind: "contains",
      filePath: candidate.requestFilePath,
      range: candidate.request.range,
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
        line: candidate.request.range.start.line,
        column: candidate.request.range.start.column,
        referenceName: candidate.handler.name
      }),
      sourceId: route.id,
      targetId: candidate.handler.id,
      kind: "routes",
      filePath: candidate.requestFilePath,
      range: candidate.request.range,
      resolution: "heuristic",
      confidence: 0.7,
      referenceName: candidate.handler.name,
      evidence: referenceEvidence(
        "framework.goframe.standard-router.g-meta.unique-request-signature.unbound",
        "heuristic",
        [candidate.handler.id],
        candidate.configurationPaths,
        [candidate.requestFilePath, candidate.controllerFilePath]
      )
    });
  }

  return { symbols, structuralEdges };
}
