import {
  compareStableText,
  classifyGeneratedFile,
  classifySourceRole,
  createEdgeId,
  createSymbolId,
  isCustomRouteFramework,
  JAVA_EXHAUSTIVE_ASSIGNMENT_JOIN_MAXIMUM_BRANCHES,
  JAVA_EXHAUSTIVE_SWITCH_JOIN_MAXIMUM_ARMS,
  type BindingSpace,
  type CallArityEvidence,
  type CallDispatchAccessEvidence,
  type CallDispatchEvidence,
  type CallFieldAccessEvidence,
  type CallReceiverBindingEvidence,
  type CallTypeConversionEvidence,
  type CallTypeHierarchySegmentEvidence,
  type CallTypeEvidence,
  type CallTypeValueEvidence,
  type DjangoImportedUrlconfInclusionFact,
  type DjangoNinjaImportedRouterInclusionFact,
  type DjangoNinjaRouterDeclarationFact,
  type DjangoNinjaRouterReExportFact,
  type DjangoNinjaRouterRouteFact,
  type DjangoLiteralUrlconfInclusionFact,
  type DjangoUrlconfInclusionFactory,
  type DjangoUrlPatternHandlerKind,
  type DjangoUrlPatternRouteFact,
  type EdgeEvidence,
  type FastApiImportedRouterInclusionFact,
  type FastApiRouterDeclarationFact,
  type FastApiRouterRouteFact,
  type FlaskBlueprintDeclarationFact,
  type FlaskBlueprintRouteFact,
  type FlaskImportedBlueprintRegistrationFact,
  type SanicBlueprintDeclarationFact,
  type SanicBlueprintGroupDeclarationFact,
  type SanicBlueprintGroupMemberFact,
  type SanicBlueprintRouteFact,
  type SanicImportedBlueprintRegistrationFact,
  type FastifyPluginRouteFact,
  type FastifyPluginSymbolReference,
  type FrameworkRoutePluginFacts,
  type GoFrameStandardRouterBindingFact,
  type GoFrameStandardRouterControllerMethodFact,
  type GoFrameStandardRouterRequestFact,
  type GraphEdge,
  type GraphSnapshot,
  type JvmAnnotationReferenceFact,
  type JvmCallableSignatureReferenceFact,
  type JvmDependencyInjectionReferenceFact,
  type JvmHeritageReferenceFact,
  type JvmHeritageSyntax,
  type JvmImportReferenceFact,
  type JvmTypeFact,
  type JavaCallTypeReferenceFact,
  type JavaCallableDeclarationFact,
  type JavaChainedCallReferenceFact,
  type JavaFieldDeclarationFact,
  type JavaInstantiationReferenceFact,
  type JavaMemberCallReferenceFact,
  type KotlinCallableFact,
  type KotlinCallFact,
  type KotlinImportFact,
  type KotlinInstantiationFact,
  type KotlinTypeFact,
  type SwiftCallableFact,
  type SwiftCallFact,
  type SwiftFacts,
  type SwiftHeritageFact,
  type SwiftImportFact,
  type SwiftInstantiationFact,
  type SwiftOverrideFact,
  type SwiftTypeFact,
  type DartCallFact,
  type DartCallableFact,
  type DartFacts,
  type DartHeritageFact,
  type DartImportFact,
  type DartInstantiationFact,
  type DartOverrideFact,
  type DartTypeFact,
  type CsharpCallFact,
  type CsharpCallableFact,
  type CsharpHeritageFact,
  type CsharpInstantiationFact,
  type CsharpOverrideFact,
  type CsharpTypeFact,
  type CsharpUsingFact,
  type FsharpCallFact,
  type FsharpCallableFact,
  type FsharpFacts,
  type FsharpHeritageFact,
  type FsharpInstantiationFact,
  type FsharpOpenFact,
  type FsharpOverrideFact,
  type FsharpTypeFact,
  type OcamlCallFact,
  type OcamlCallableFact,
  type OcamlHeritageFact,
  type OcamlInstantiationFact,
  type OcamlOpenFact,
  type OcamlOverrideFact,
  type OcamlTypeFact,
  type HaskellCallFact,
  type HaskellCallableFact,
  type HaskellHeritageFact,
  type HaskellImportFact,
  type HaskellInstantiationFact,
  type HaskellTypeFact,
  type ElixirAliasFact,
  type ElixirCallFact,
  type ElixirCallableFact,
  type ElixirHeritageFact,
  type ElixirImportFact,
  type ElixirInstantiationFact,
  type ElixirTypeFact,
  type ErlangCallFact,
  type ErlangCallableFact,
  type ErlangHeritageFact,
  type ErlangImportFact,
  type ErlangInstantiationFact,
  type ErlangTypeFact,
  type ClojureCallFact,
  type ClojureCallableFact,
  type ClojureHeritageFact,
  type ClojureImportFact,
  type ClojureInstantiationFact,
  type ClojureTypeFact,
  type NixAttributeFact,
  type NixCallFact,
  type NixImportFact,
  type NimCallFact,
  type NimCallableFact,
  type NimHeritageFact,
  type NimImportFact,
  type NimInstantiationFact,
  type NimTypeFact,
  type ScalaRelationCallFact,
  type ScalaRelationCallableFact,
  type ScalaRelationHeritageFact,
  type ScalaRelationImportFact,
  type ScalaRelationInstantiationFact,
  type ScalaRelationOverrideFact,
  type ScalaRelationTypeFact,
  type NestSymbolReference,
  type PendingReference,
  type ResolutionKind,
  type RoutePrefixSegment,
  type ReactNativeTurboModuleDefaultImportCallFact,
  type RustActixImportedServiceConfigMountFact,
  type RustActixServiceConfigDeclarationFact,
  type RustActixServiceConfigRouteFact,
  type ReactNativeNativeMethodFact,
  type SourceRange,
  type SwiftObjectiveCExtensionMethodFact,
  type SwiftObjectiveCMethodFact,
  type SwiftObjectiveCTypeFact,
  type SymbolNode
} from "../domain/index.js";
import type { ExtractedFileFacts } from "../extraction/index.js";
import {
  FrameworkProjectPluginOutputError,
  projectFrameworkPluginOutputs,
  type FrameworkProjectPluginRegistry,
  type ValidatedFrameworkProjectRouteProjection
} from "./framework-project-plugins.js";
import {
  REFERENCE_RESOLVER_PLUGIN_RULE_NAME_PATTERN,
  requireReferenceResolverPluginRegistry,
  type ReferenceResolverPluginCandidate,
  type ReferenceResolverPluginRegistry,
  type ReferenceResolverPluginResult
} from "./reference-resolver-plugins.js";
import type {
  ProjectModuleResolver,
  ResolvedModule,
  SourceDocument,
  JvmModuleDependency,
  JvmModuleMembership,
  JvmProjectModuleEvidence,
  XcodeTargetMembership
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

/**
 * Resolves the deliberately narrow Python B2 surface: one named import from a
 * sibling module in a regular package.  Python's broader import machinery is
 * intentionally outside this resolver; every missing, duplicate, decorated,
 * rebound, namespace-package, or non-single-name shape simply emits no edge.
 */
function projectPythonRegularPackageRelativeNamedImports(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly knownFilePaths: ReadonlySet<string>;
}): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const pythonFacts = facts.pythonFacts;
    if (pythonFacts === undefined) {
      continue;
    }
    for (const imported of pythonFacts.relativeNamedImports) {
      if (imported.filePath !== filePath) {
        continue;
      }
      const packageDirectory = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
      const packageInit = packageDirectory === "" ? "__init__.py" : `${packageDirectory}/__init__.py`;
      const targetFilePath = packageDirectory === ""
        ? `${imported.moduleName}.py`
        : `${packageDirectory}/${imported.moduleName}.py`;
      const packageTargetFilePath = packageDirectory === ""
        ? `${imported.moduleName}/__init__.py`
        : `${packageDirectory}/${imported.moduleName}/__init__.py`;
      if (
        !input.knownFilePaths.has(packageInit) ||
        !input.knownFilePaths.has(targetFilePath) ||
        input.knownFilePaths.has(packageTargetFilePath)
      ) {
        continue;
      }
      const sourceFile = input.fileSymbols.get(filePath);
      const targetFile = input.fileSymbols.get(targetFilePath);
      const targetFacts = input.factsByFile.get(targetFilePath)?.pythonFacts;
      if (sourceFile?.id !== imported.sourceId || targetFile === undefined || targetFacts === undefined) {
        continue;
      }
      const sourceBindings = pythonFacts.relativeNamedImports.filter(
        (candidate) => candidate.localName === imported.localName
      );
      const targetDeclarations = targetFacts.topLevelDeclarations.filter(
        (candidate) => candidate.name === imported.importedName
      );
      if (sourceBindings.length !== 1 || targetDeclarations.length !== 1) {
        continue;
      }
      const targetDeclaration = targetDeclarations[0];
      if (targetDeclaration === undefined) {
        continue;
      }
      const declarationCandidateIds = [targetDeclaration.symbolId];
      const targetCallTainted =
        targetFacts.dynamicGlobalHazard === true ||
        (targetFacts.artifactGlobalTaintedNames?.includes(targetDeclaration.name) ?? false);
      const fileImportCandidateIds = [targetFile.id];
      edges.push({
        id: createEdgeId({
          sourceId: sourceFile.id,
          targetId: targetFile.id,
          kind: "imports",
          line: imported.range.start.line,
          column: imported.range.start.column,
          referenceName: `.${imported.moduleName}`
        }),
        sourceId: sourceFile.id,
        targetId: targetFile.id,
        kind: "imports",
        filePath,
        range: imported.range,
        resolution: "exact",
        confidence: 1,
        referenceName: `.${imported.moduleName}`,
        evidence: referenceEvidence(
          "module.python.regular-package.relative-named-import",
          "module",
          fileImportCandidateIds,
          [],
          [filePath, targetFilePath]
        )
      });
      if (
        targetDeclaration.kind === "function" &&
        targetDeclaration.runtimeCallEligible === true &&
        !targetCallTainted
      ) {
        for (const call of pythonFacts.importedFunctionCalls) {
          if (call.filePath !== filePath || call.localName !== imported.localName) {
            continue;
          }
          edges.push({
            id: createEdgeId({
              sourceId: call.sourceId,
              targetId: targetDeclaration.symbolId,
              kind: "calls",
              line: call.range.start.line,
              column: call.range.start.column,
              referenceName: call.localName
            }),
            sourceId: call.sourceId,
            targetId: targetDeclaration.symbolId,
            kind: "calls",
            filePath,
            range: call.range,
            resolution: "exact",
            confidence: 1,
            referenceName: call.localName,
            evidence: referenceEvidence(
              "module.python.regular-package.relative-named-import.unique-top-level-function-call",
              "module",
              declarationCandidateIds,
              [],
              [filePath, targetFilePath]
            )
          });
        }
      }
      if (targetDeclaration.kind === "class") {
        if (targetDeclaration.instantiationEligible === true && !targetCallTainted) {
          for (const instantiation of pythonFacts.importedClassInstantiations ?? []) {
            if (
              instantiation.filePath !== filePath ||
              instantiation.localName !== imported.localName
            ) {
              continue;
            }
            edges.push({
              id: createEdgeId({
                sourceId: instantiation.sourceId,
                targetId: targetDeclaration.symbolId,
                kind: "instantiates",
                line: instantiation.range.start.line,
                column: instantiation.range.start.column,
                referenceName: instantiation.localName
              }),
              sourceId: instantiation.sourceId,
              targetId: targetDeclaration.symbolId,
              kind: "instantiates",
              filePath,
              range: instantiation.range,
              resolution: "exact",
              confidence: 1,
              referenceName: instantiation.localName,
              evidence: referenceEvidence(
                "module.python.regular-package.relative-named-import.unique-top-level-class-instantiation",
                "module",
                declarationCandidateIds,
                [],
                [filePath, targetFilePath]
              )
            });
          }
        }
        for (const inheritance of pythonFacts.importedClassInheritances) {
          if (inheritance.filePath !== filePath || inheritance.localName !== imported.localName) {
            continue;
          }
          edges.push({
            id: createEdgeId({
              sourceId: inheritance.sourceId,
              targetId: targetDeclaration.symbolId,
              kind: "extends",
              line: inheritance.range.start.line,
              column: inheritance.range.start.column,
              referenceName: inheritance.localName
            }),
            sourceId: inheritance.sourceId,
            targetId: targetDeclaration.symbolId,
            kind: "extends",
            filePath,
            range: inheritance.range,
            resolution: "exact",
            confidence: 1,
            referenceName: inheritance.localName,
            evidence: referenceEvidence(
              "module.python.regular-package.relative-named-import.unique-top-level-class-inheritance",
              "module",
              declarationCandidateIds,
              [],
              [filePath, targetFilePath]
            )
          });
        }
      }
    }
  }
  return edges;
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

function reactNativeBridgeKey(moduleName: string, methodName: string): string {
  return `${moduleName}\u0000${methodName}`;
}

function reactNativeBridgeReferenceName(moduleName: string, methodName: string): string {
  return `${moduleName}.${methodName}`;
}

function reactNativeSwiftExternalBridgeKey(objcClassName: string, selector: string): string {
  return `${objcClassName}\u0000${selector}`;
}

function reactNativeSwiftExternalBridgeReferenceName(objcClassName: string, selector: string): string {
  return `${objcClassName}.${selector}`;
}

type ReactNativeBridgeRuleId = (
  platform: "android" | "ios" | "any",
  suffix: "exact-target" | "unresolved-target" | "ambiguous-platform-target"
) => string;

type ReactNativeCodegenBridgeSurface =
  | "native-modules"
  | "turbo-direct-registry"
  | "turbo-spec-contract"
  | "turbo-default-import"
  | "turbo-default-re-export";

interface ReactNativeBridgeReference {
  readonly sourceId: string;
  readonly filePath: string;
  readonly moduleName: string;
  readonly methodName: string;
  readonly range: SourceRange;
  /** Static local-export hops that proved a cross-file bridge identity. */
  readonly resolutionPath?: readonly string[];
}

function reactNativeNativeModulesRuleId(
  platform: "android" | "ios" | "any",
  suffix: "exact-target" | "unresolved-target" | "ambiguous-platform-target"
): string {
  return `framework.react-native.native-modules.direct-module-and-method.${platform}.${suffix}`;
}

function reactNativeTurboModuleRuleId(
  surface: "default-import" | "default-re-export" | "direct-registry" | "spec-contract",
  platform: "android" | "ios" | "any",
  suffix: "exact-target" | "unresolved-target" | "ambiguous-platform-target"
): string {
  return `framework.react-native.turbo-modules.${surface}.literal-module-and-method.${platform}.${suffix}`;
}

function reactNativeCodegenRuleId(
  surface: ReactNativeCodegenBridgeSurface,
  platform: "android" | "ios" | "any",
  suffix: "exact-target" | "unresolved-target" | "ambiguous-platform-target"
): string {
  return (
    "framework.react-native.codegen-spec." +
    surface +
    ".direct-spec-superclass-and-unique-typescript-contract." +
    platform +
    "." +
    suffix
  );
}

/**
 * Projects one syntax-proven React Native bridge surface to every independently
 * unique platform implementation. Android and iOS targets are both retained;
 * collisions within a platform remain explicit unresolved edges.
 */
function projectReactNativeBridgeReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly sourceFacts: (facts: ExtractedFileFacts) => readonly ReactNativeBridgeReference[];
  readonly ruleId: ReactNativeBridgeRuleId;
  readonly codegenRuleId: ReactNativeBridgeRuleId;
}): readonly GraphEdge[] {
  const methodsByBridgeKey = new Map<string, ReactNativeNativeMethodFact[]>();
  const codegenContractCounts = new Map<string, number>();
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    for (const method of facts.reactNativeFacts?.nativeMethods ?? []) {
      const key = reactNativeBridgeKey(method.moduleName, method.methodName);
      const candidates = methodsByBridgeKey.get(key) ?? [];
      candidates.push(method);
      methodsByBridgeKey.set(key, candidates);
    }
    for (const contract of facts.reactNativeFacts?.turboModuleSpecMethods ?? []) {
      const key = reactNativeBridgeKey(contract.moduleName, contract.methodName);
      codegenContractCounts.set(key, (codegenContractCounts.get(key) ?? 0) + 1);
    }
  }

  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...input.sourceFacts(facts)].sort((left, right) =>
      compareStableText(
        `${left.sourceId}\u0000${left.moduleName}\u0000${left.methodName}\u0000${left.range.start.line}\u0000${left.range.start.column}`,
        `${right.sourceId}\u0000${right.moduleName}\u0000${right.methodName}\u0000${right.range.start.line}\u0000${right.range.start.column}`
      )
    );
    for (const reference of references) {
      const rawCandidates = [
        ...(methodsByBridgeKey.get(reactNativeBridgeKey(reference.moduleName, reference.methodName)) ?? [])
      ].sort((left, right) => compareStableText(left.methodId, right.methodId));
      const candidates = rawCandidates.filter(
        (method) =>
          method.implementationKind !== "codegen-spec-override" ||
          codegenContractCounts.get(reactNativeBridgeKey(method.moduleName, method.methodName)) === 1
      );
      const candidatesByPlatform = new Map<"android" | "ios", ReactNativeNativeMethodFact[]>();
      for (const candidate of candidates) {
        const platformCandidates = candidatesByPlatform.get(candidate.platform) ?? [];
        platformCandidates.push(candidate);
        candidatesByPlatform.set(candidate.platform, platformCandidates);
      }
      const ambiguousCandidates: ReactNativeNativeMethodFact[] = [];
      for (const platform of ["android", "ios"] as const) {
        const platformCandidates = candidatesByPlatform.get(platform) ?? [];
        if (platformCandidates.length === 1 && platformCandidates[0] !== undefined) {
          const target = platformCandidates[0];
          const targetRuleId =
            target.implementationKind === "codegen-spec-override"
              ? input.codegenRuleId
              : input.ruleId;
          edges.push({
            id: createEdgeId({
              sourceId: reference.sourceId,
              targetId: target.methodId,
              kind: "calls",
              line: reference.range.start.line,
              column: reference.range.start.column,
              referenceName: reactNativeBridgeReferenceName(reference.moduleName, reference.methodName)
            }),
            sourceId: reference.sourceId,
            targetId: target.methodId,
            kind: "calls",
            filePath: reference.filePath,
            range: reference.range,
            resolution: "exact",
            confidence: 1,
            referenceName: reactNativeBridgeReferenceName(reference.moduleName, reference.methodName),
            evidence: referenceEvidence(
              targetRuleId(platform, "exact-target"),
              "module",
              [target.methodId],
              [],
              reference.resolutionPath ?? []
            )
          });
        } else if (platformCandidates.length > 1) {
          ambiguousCandidates.push(...platformCandidates);
        }
      }
      if (candidates.length === 0 || ambiguousCandidates.length > 0) {
        const unresolvedRuleId =
          rawCandidates.length > 0 &&
          rawCandidates.every((candidate) => candidate.implementationKind === "codegen-spec-override")
            ? input.codegenRuleId
            : input.ruleId;
        const candidateIds = ambiguousCandidates.map((candidate) => candidate.methodId);
        edges.push({
          id: createEdgeId({
            sourceId: reference.sourceId,
            targetId: null,
            kind: "calls",
            line: reference.range.start.line,
            column: reference.range.start.column,
            referenceName: reactNativeBridgeReferenceName(reference.moduleName, reference.methodName)
          }),
          sourceId: reference.sourceId,
          targetId: null,
          kind: "calls",
          filePath: reference.filePath,
            range: reference.range,
            resolution: "unresolved",
            confidence: 0,
            referenceName: reactNativeBridgeReferenceName(reference.moduleName, reference.methodName),
            evidence: referenceEvidence(
              unresolvedRuleId(
                "any",
                candidates.length === 0 ? "unresolved-target" : "ambiguous-platform-target"
              ),
              "module",
              candidateIds,
              [],
              reference.resolutionPath ?? []
            )
          });
      }
    }
  }
  return edges;
}

function projectReactNativeNativeModuleCalls(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
}): readonly GraphEdge[] {
  return projectReactNativeBridgeReferences({
    ...input,
    sourceFacts: (facts) => facts.reactNativeFacts?.nativeModuleCalls ?? [],
    ruleId: reactNativeNativeModulesRuleId,
    codegenRuleId: (platform, suffix) =>
      reactNativeCodegenRuleId("native-modules", platform, suffix)
  });
}

type ReactNativeSwiftExternalBridgeRuleSuffix =
  | "exact-target"
  | "unresolved-target"
  | "ambiguous-target";

function reactNativeSwiftExternalBridgeRuleId(
  suffix: ReactNativeSwiftExternalBridgeRuleSuffix
): string {
  return `framework.react-native.swift-extern.direct-objc-class-and-selector.${suffix}`;
}

function reactNativeSwiftXcodeExternalBridgeRuleId(
  suffix: ReactNativeSwiftExternalBridgeRuleSuffix
): string {
  return `framework.react-native.swift-extern.xcode-target.explicit-objc-class-and-selector.${suffix}`;
}

interface SwiftExternalBridgeCandidate {
  readonly candidateKey: string;
  readonly methodId: string;
  readonly source: "direct" | "same-file-extension" | "xcode-target-extension";
  readonly configurationPaths: readonly string[];
}

interface UnprovenSwiftExternalBridgeCandidate {
  readonly candidateKey: string;
  readonly methodId: string;
  readonly reason: "unresolved" | "ambiguous";
  readonly configurationPaths: readonly string[];
}

function swiftTypeCandidateKey(type: SwiftObjectiveCTypeFact): string {
  return [
    type.filePath,
    type.range.start.line,
    type.range.start.column,
    type.range.end.line,
    type.range.end.column
  ].join("\u0000");
}

function uniqueSwiftExternalBridgeCandidates(
  candidates: readonly SwiftExternalBridgeCandidate[]
): readonly SwiftExternalBridgeCandidate[] {
  const byKey = new Map<string, SwiftExternalBridgeCandidate>();
  for (const candidate of candidates) {
    if (!byKey.has(candidate.candidateKey)) {
      byKey.set(candidate.candidateKey, candidate);
    }
  }
  return [...byKey.values()].sort((left, right) =>
    compareStableText(left.candidateKey, right.candidateKey)
  );
}

function uniqueUnprovenSwiftExternalBridgeCandidates(
  candidates: readonly UnprovenSwiftExternalBridgeCandidate[]
): readonly UnprovenSwiftExternalBridgeCandidate[] {
  const byKey = new Map<string, UnprovenSwiftExternalBridgeCandidate>();
  for (const candidate of candidates) {
    if (!byKey.has(candidate.candidateKey)) {
      byKey.set(candidate.candidateKey, candidate);
    }
  }
  return [...byKey.values()].sort((left, right) =>
    compareStableText(left.candidateKey, right.candidateKey)
  );
}

function xcodeTargetMembershipsByFile(
  memberships: readonly XcodeTargetMembership[] | undefined
): ReadonlyMap<string, readonly XcodeTargetMembership[]> {
  const membershipsByFile = new Map<string, Map<string, XcodeTargetMembership>>();
  for (const membership of memberships ?? []) {
    const byTarget = membershipsByFile.get(membership.filePath) ?? new Map<string, XcodeTargetMembership>();
    const key = `${membership.targetId}\u0000${membership.configurationPath}`;
    if (!byTarget.has(key)) {
      byTarget.set(key, membership);
    }
    membershipsByFile.set(membership.filePath, byTarget);
  }
  return new Map(
    [...membershipsByFile.entries()].map(([filePath, byTarget]) => [
      filePath,
      [...byTarget.values()].sort((left, right) =>
        compareStableText(
          `${left.targetId}\u0000${left.configurationPath}`,
          `${right.targetId}\u0000${right.configurationPath}`
        )
      )
    ])
  );
}

/**
 * A target name is not sufficient evidence by itself: the bridge declaration,
 * Swift type, and extension implementation must all share exactly one native
 * target record from the same `.pbxproj` revision.
 */
function sharedXcodeTargetMemberships(input: {
  readonly bridgeFilePath: string;
  readonly typeFilePath: string;
  readonly extensionFilePath: string;
  readonly membershipsByFile: ReadonlyMap<string, readonly XcodeTargetMembership[]>;
}): readonly XcodeTargetMembership[] {
  const bridgeMemberships = input.membershipsByFile.get(input.bridgeFilePath) ?? [];
  const typeMemberships = input.membershipsByFile.get(input.typeFilePath) ?? [];
  const extensionMemberships = input.membershipsByFile.get(input.extensionFilePath) ?? [];
  const shared: XcodeTargetMembership[] = [];
  for (const bridgeMembership of bridgeMemberships) {
    const matchingTypeMemberships = typeMemberships.filter(
      (membership) => membership.targetId === bridgeMembership.targetId
    );
    const matchingExtensionMemberships = extensionMemberships.filter(
      (membership) => membership.targetId === bridgeMembership.targetId
    );
    if (matchingTypeMemberships.length !== 1 || matchingExtensionMemberships.length !== 1) {
      continue;
    }
    const typeMembership = matchingTypeMemberships[0];
    const extensionMembership = matchingExtensionMemberships[0];
    if (
      typeMembership === undefined ||
      extensionMembership === undefined ||
      typeMembership.configurationPath !== bridgeMembership.configurationPath ||
      extensionMembership.configurationPath !== bridgeMembership.configurationPath
    ) {
      continue;
    }
    shared.push(bridgeMembership);
  }
  return shared.sort((left, right) => compareStableText(left.targetId, right.targetId));
}

/**
 * Links an external Objective-C React Native bridge declaration to Swift source
 * only when both an explicit `@objc(Class)` and `@objc(selector)` match one
 * unique implementation. A same-file extension is lexically direct; a
 * cross-file extension also requires one shared Xcode native target. The
 * JavaScript call remains linked to the bridge declaration, preserving the
 * distinct runtime boundary.
 */
function projectReactNativeSwiftExternalBridgeReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly xcodeTargetMemberships?: readonly XcodeTargetMembership[];
}): readonly GraphEdge[] {
  const swiftMethodsByIdentity = new Map<string, SwiftObjectiveCMethodFact[]>();
  const swiftTypesByName = new Map<string, SwiftObjectiveCTypeFact[]>();
  const swiftExtensionMethodsBySelector = new Map<string, SwiftObjectiveCExtensionMethodFact[]>();
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    for (const method of facts.swiftObjectiveCFacts?.methods ?? []) {
      const key = reactNativeSwiftExternalBridgeKey(method.objcClassName, method.selector);
      const candidates = swiftMethodsByIdentity.get(key) ?? [];
      candidates.push(method);
      swiftMethodsByIdentity.set(key, candidates);
    }
    for (const type of facts.swiftObjectiveCFacts?.types ?? []) {
      const candidates = swiftTypesByName.get(type.swiftTypeName) ?? [];
      candidates.push(type);
      swiftTypesByName.set(type.swiftTypeName, candidates);
    }
    for (const method of facts.swiftObjectiveCFacts?.extensionMethods ?? []) {
      const candidates = swiftExtensionMethodsBySelector.get(method.selector) ?? [];
      candidates.push(method);
      swiftExtensionMethodsBySelector.set(method.selector, candidates);
    }
  }

  const membershipsByFile = xcodeTargetMembershipsByFile(input.xcodeTargetMemberships);
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const bridges = [...(facts.reactNativeFacts?.swiftExternalBridgeMethods ?? [])].sort(
      (left, right) =>
        compareStableText(
          `${left.methodId}\u0000${left.objcClassName}\u0000${left.selector}\u0000${left.range.start.line}\u0000${left.range.start.column}`,
          `${right.methodId}\u0000${right.objcClassName}\u0000${right.selector}\u0000${right.range.start.line}\u0000${right.range.start.column}`
        )
    );
    for (const bridge of bridges) {
      const exactCandidates: SwiftExternalBridgeCandidate[] = [
        ...(swiftMethodsByIdentity.get(
          reactNativeSwiftExternalBridgeKey(bridge.objcClassName, bridge.selector)
        ) ?? []).map((method) => ({
          candidateKey: `direct\u0000${method.methodId}`,
          methodId: method.methodId,
          source: "direct" as const,
          configurationPaths: []
        }))
      ];
      const unprovenCandidates: UnprovenSwiftExternalBridgeCandidate[] = [];
      const extensionMethods = [
        ...(swiftExtensionMethodsBySelector.get(bridge.selector) ?? [])
      ].sort((left, right) => compareStableText(left.methodId, right.methodId));
      for (const extensionMethod of extensionMethods) {
        const typeCandidates = [
          ...(swiftTypesByName.get(extensionMethod.extendedTypeName) ?? [])
        ].sort((left, right) => compareStableText(swiftTypeCandidateKey(left), swiftTypeCandidateKey(right)));
        const sameFileTypes = typeCandidates.filter(
          (type) => type.filePath === extensionMethod.filePath
        );
        if (sameFileTypes.length === 1 && sameFileTypes[0] !== undefined) {
          const sameFileType = sameFileTypes[0];
          if (sameFileType.objcClassName === bridge.objcClassName) {
            exactCandidates.push({
              candidateKey: `same-file-extension\u0000${extensionMethod.methodId}\u0000${swiftTypeCandidateKey(sameFileType)}`,
              methodId: extensionMethod.methodId,
              source: "same-file-extension",
              configurationPaths: []
            });
          }
          continue;
        }
        if (sameFileTypes.length > 1) {
          if (sameFileTypes.some((type) => type.objcClassName === bridge.objcClassName)) {
            unprovenCandidates.push({
              candidateKey: `same-file-extension\u0000${extensionMethod.methodId}`,
              methodId: extensionMethod.methodId,
              reason: "ambiguous",
              configurationPaths: []
            });
          }
          continue;
        }

        for (const type of typeCandidates) {
          if (type.objcClassName !== bridge.objcClassName) {
            continue;
          }
          const sharedMemberships = sharedXcodeTargetMemberships({
            bridgeFilePath: bridge.filePath,
            typeFilePath: type.filePath,
            extensionFilePath: extensionMethod.filePath,
            membershipsByFile
          });
          const candidateKey = `xcode-target-extension\u0000${extensionMethod.methodId}\u0000${swiftTypeCandidateKey(type)}`;
          if (sharedMemberships.length === 1 && sharedMemberships[0] !== undefined) {
            exactCandidates.push({
              candidateKey,
              methodId: extensionMethod.methodId,
              source: "xcode-target-extension",
              configurationPaths: [sharedMemberships[0].configurationPath]
            });
            continue;
          }
          unprovenCandidates.push({
            candidateKey,
            methodId: extensionMethod.methodId,
            reason: sharedMemberships.length > 1 ? "ambiguous" : "unresolved",
            configurationPaths: sharedMemberships.map(
              (membership) => membership.configurationPath
            )
          });
        }
      }

      const candidates = uniqueSwiftExternalBridgeCandidates(exactCandidates);
      const unproven = uniqueUnprovenSwiftExternalBridgeCandidates(unprovenCandidates);
      const referenceName = reactNativeSwiftExternalBridgeReferenceName(
        bridge.objcClassName,
        bridge.selector
      );
      if (candidates.length === 1 && candidates[0] !== undefined) {
        const target = candidates[0];
        const ruleId =
          target.source === "xcode-target-extension"
            ? reactNativeSwiftXcodeExternalBridgeRuleId("exact-target")
            : reactNativeSwiftExternalBridgeRuleId("exact-target");
        edges.push({
          id: createEdgeId({
            sourceId: bridge.methodId,
            targetId: target.methodId,
            kind: "references",
            line: bridge.range.start.line,
            column: bridge.range.start.column,
            referenceName
          }),
          sourceId: bridge.methodId,
          targetId: target.methodId,
          kind: "references",
          filePath: bridge.filePath,
          range: bridge.range,
          resolution: "exact",
          confidence: 1,
          referenceName,
          evidence: referenceEvidence(
            ruleId,
            "module",
            [target.methodId],
            target.configurationPaths
          )
        });
        continue;
      }

      if (candidates.length > 1 || unproven.length > 0) {
        const hasXcodeCandidate =
          unproven.length > 0 || candidates.some((candidate) => candidate.source === "xcode-target-extension");
        const xcodeAmbiguous =
          unproven.some((candidate) => candidate.reason === "ambiguous") || candidates.length > 1;
        const unresolvedCandidates = candidates.length > 0 ? candidates : unproven;
        const configurationPaths = unresolvedCandidates.flatMap(
          (candidate) => candidate.configurationPaths
        );
        edges.push({
          id: createEdgeId({
            sourceId: bridge.methodId,
            targetId: null,
            kind: "references",
            line: bridge.range.start.line,
            column: bridge.range.start.column,
            referenceName
          }),
          sourceId: bridge.methodId,
          targetId: null,
          kind: "references",
          filePath: bridge.filePath,
          range: bridge.range,
          resolution: "unresolved",
          confidence: 0,
          referenceName,
          evidence: referenceEvidence(
            hasXcodeCandidate
              ? reactNativeSwiftXcodeExternalBridgeRuleId(
                  xcodeAmbiguous ? "ambiguous-target" : "unresolved-target"
                )
              : reactNativeSwiftExternalBridgeRuleId("ambiguous-target"),
            "unresolved",
            unresolvedCandidates.map((candidate) => candidate.methodId),
            configurationPaths
          )
        });
        continue;
      }

      edges.push({
        id: createEdgeId({
          sourceId: bridge.methodId,
          targetId: null,
          kind: "references",
          line: bridge.range.start.line,
          column: bridge.range.start.column,
          referenceName
        }),
        sourceId: bridge.methodId,
        targetId: null,
        kind: "references",
        filePath: bridge.filePath,
        range: bridge.range,
        resolution: "unresolved",
        confidence: 0,
        referenceName,
        evidence: referenceEvidence(
          reactNativeSwiftExternalBridgeRuleId("unresolved-target"),
          "unresolved",
          []
        )
      });
    }
  }
  return edges;
}

function projectReactNativeTurboModuleCalls(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
}): readonly GraphEdge[] {
  return projectReactNativeBridgeReferences({
    ...input,
    sourceFacts: (facts) => facts.reactNativeFacts?.turboModuleCalls ?? [],
    ruleId: (platform, suffix) => reactNativeTurboModuleRuleId("direct-registry", platform, suffix),
    codegenRuleId: (platform, suffix) =>
      reactNativeCodegenRuleId("turbo-direct-registry", platform, suffix)
  });
}

function projectReactNativeTurboModuleSpecMethods(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
}): readonly GraphEdge[] {
  return projectReactNativeBridgeReferences({
    ...input,
    sourceFacts: (facts) => facts.reactNativeFacts?.turboModuleSpecMethods ?? [],
    ruleId: (platform, suffix) => reactNativeTurboModuleRuleId("spec-contract", platform, suffix),
    codegenRuleId: (platform, suffix) =>
      reactNativeCodegenRuleId("turbo-spec-contract", platform, suffix)
  });
}

/**
 * Resolves a consumer's immutable default import only after its local target
 * proves that its default export is a literal TurboModule registry result. The
 * candidate call alone never creates a framework edge.
 */
function projectReactNativeTurboModuleDefaultImportCalls(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
  readonly exportSurfaces: ReadonlyMap<string, ExportSurface>;
}): readonly GraphEdge[] {
  const defaultExportByFilePath = new Map<string, { readonly moduleName: string }>();
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const exports = [...(facts.reactNativeFacts?.turboModuleDefaultExports ?? [])].sort((left, right) =>
      compareStableText(
        `${left.moduleName}\u0000${left.range.start.line}\u0000${left.range.start.column}`,
        `${right.moduleName}\u0000${right.range.start.line}\u0000${right.range.start.column}`
      )
    );
    if (exports.length === 1 && exports[0] !== undefined) {
      defaultExportByFilePath.set(filePath, { moduleName: exports[0].moduleName });
    }
  }

  type DefaultImportSurface = "default-import" | "default-re-export";
  interface DefaultImportReference extends ReactNativeBridgeReference {
    readonly surface: DefaultImportSurface;
  }

  const referenceForCall = (
    call: ReactNativeTurboModuleDefaultImportCallFact
  ): DefaultImportReference | null => {
    const targetPath = input.moduleTargetPathByKey.get(moduleKey(call.filePath, call.moduleSpecifier));
    if (targetPath === undefined) {
      return null;
    }

    const directExport = defaultExportByFilePath.get(targetPath);
    if (directExport !== undefined) {
      return {
        sourceId: call.sourceId,
        filePath: call.filePath,
        moduleName: directExport.moduleName,
        methodName: call.methodName,
        range: call.range,
        surface: "default-import"
      };
    }

    const defaultSurface = input.exportSurfaces.get(targetPath)?.get("default");
    if (
      defaultSurface === undefined ||
      !defaultSurface.explicit ||
      defaultSurface.ambiguous ||
      defaultSurface.candidates.length !== 1
    ) {
      return null;
    }

    const candidate = defaultSurface.candidates[0];
    if (candidate === undefined || candidate.isTypeOnly || candidate.path.length < 2) {
      return null;
    }

    const declarationFilePath = candidate.path.at(-1);
    const declarationExport =
      declarationFilePath === undefined
        ? undefined
        : defaultExportByFilePath.get(declarationFilePath);
    if (declarationExport === undefined) {
      return null;
    }

    return {
      sourceId: call.sourceId,
      filePath: call.filePath,
      moduleName: declarationExport.moduleName,
      methodName: call.methodName,
      range: call.range,
      resolutionPath: candidate.path,
      surface: "default-re-export"
    };
  };

  return (["default-import", "default-re-export"] as const).flatMap((surface) =>
    projectReactNativeBridgeReferences({
      factsByFile: input.factsByFile,
      sourceFacts: (facts) =>
        (facts.reactNativeFacts?.turboModuleDefaultImportCalls ?? []).flatMap((call) => {
          const reference = referenceForCall(call);
          return reference?.surface === surface ? [reference] : [];
      }),
      ruleId: (platform, suffix) => reactNativeTurboModuleRuleId(surface, platform, suffix),
      codegenRuleId: (platform, suffix) =>
        reactNativeCodegenRuleId(
          surface === "default-import" ? "turbo-default-import" : "turbo-default-re-export",
          platform,
          suffix
        )
    })
  );
}

const CICS_TRANSACTION_REFERENCE = /^cics-transid:([A-Za-z0-9$#@]{1,4})$/iu;

interface CobolCicsTransactionResolution {
  readonly candidates: readonly SymbolNode[];
  readonly target: SymbolNode | null;
}

/**
 * CICS transaction-to-program definitions reside in an external CSD. A unique
 * source-proven TRAN-named COBOL owner is therefore a bounded convention, not
 * an exact runtime guarantee. Ambiguity deliberately remains unresolved.
 */
function resolveCobolCicsTransactionTarget(input: {
  readonly reference: PendingReference;
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): CobolCicsTransactionResolution | null {
  const match = CICS_TRANSACTION_REFERENCE.exec(input.reference.referenceName);
  const transactionId = match?.[1]?.toUpperCase();
  if (transactionId === undefined) {
    return null;
  }

  const candidatesById = new Map<string, SymbolNode>();
  for (const facts of input.factsByFile.values()) {
    for (const owner of facts.cobolCicsFacts?.transactionOwners ?? []) {
      if (owner.transactionId.toUpperCase() !== transactionId) {
        continue;
      }
      const target = input.symbolsById.get(owner.programId);
      if (target !== undefined) {
        candidatesById.set(target.id, target);
      }
    }
  }
  const candidates = [...candidatesById.values()].sort((left, right) => compareStableText(left.id, right.id));
  return {
    candidates,
    target: candidates.length === 1 ? candidates[0] ?? null : null
  };
}

function liquidTemplateReferenceRuleId(
  kind: "render" | "include" | "section",
  suffix: "exact-target" | "unresolved-target"
): string {
  return "framework.shopify-liquid." + kind + ".literal-project-file." + suffix;
}

function projectLiquidTemplateReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
}): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.liquidFacts?.templateReferences ?? [])].sort((left, right) => {
      const bySource = compareStableText(left.sourceId, right.sourceId);
      if (bySource !== 0) {
        return bySource;
      }
      const byRange = left.range.start.line - right.range.start.line;
      if (byRange !== 0) {
        return byRange;
      }
      return left.range.start.column - right.range.start.column;
    });
    for (const reference of references) {
      const target = input.fileSymbols.get(reference.targetFilePath);
      const targetId = target?.id ?? null;
      edges.push({
        id: createEdgeId({
          sourceId: reference.sourceId,
          targetId,
          kind: "calls",
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.referenceName
        }),
        sourceId: reference.sourceId,
        targetId,
        kind: "calls",
        filePath: reference.filePath,
        range: reference.range,
        resolution: target === undefined ? "unresolved" : "exact",
        confidence: target === undefined ? 0 : 1,
        referenceName: reference.referenceName,
        evidence: referenceEvidence(
          liquidTemplateReferenceRuleId(
            reference.kind,
            target === undefined ? "unresolved-target" : "exact-target"
          ),
          "module",
          candidateSymbolIds(target === undefined ? [] : [target])
        )
      });
    }
  }
  return edges;
}

function twigTemplateReferenceRuleId(
  kind: "extends" | "include" | "embed" | "import" | "from",
  suffix: "exact-target" | "unresolved-target"
): string {
  return "framework.twig." + kind + ".literal-templates-root." + suffix;
}

/**
 * Twig logical template names are only projected through the conventional
 * project-local `templates/` root. This intentionally excludes namespace,
 * loader, bundle, and runtime-configured template resolution.
 */
function projectTwigTemplateReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
}): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.twigFacts?.templateReferences ?? [])].sort((left, right) => {
      const bySource = compareStableText(left.sourceId, right.sourceId);
      if (bySource !== 0) {
        return bySource;
      }
      const byRange = left.range.start.line - right.range.start.line;
      if (byRange !== 0) {
        return byRange;
      }
      return left.range.start.column - right.range.start.column;
    });
    for (const reference of references) {
      const target = input.fileSymbols.get(reference.targetFilePath);
      const targetId = target?.id ?? null;
      edges.push({
        id: createEdgeId({
          sourceId: reference.sourceId,
          targetId,
          kind: "calls",
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.referenceName
        }),
        sourceId: reference.sourceId,
        targetId,
        kind: "calls",
        filePath: reference.filePath,
        range: reference.range,
        resolution: target === undefined ? "unresolved" : "exact",
        confidence: target === undefined ? 0 : 1,
        referenceName: reference.referenceName,
        evidence: referenceEvidence(
          twigTemplateReferenceRuleId(
            reference.kind,
            target === undefined ? "unresolved-target" : "exact-target"
          ),
          "module",
          candidateSymbolIds(target === undefined ? [] : [target])
        )
      });
    }
  }
  return edges;
}

function jspTemplateReferenceRuleId(
  kind: "include-directive" | "include-action" | "forward-action" | "tag-file",
  suffix: "exact-target" | "unresolved-target"
): string {
  return `syntax.jsp.${kind}.literal-project-file.${suffix}`;
}

function markdownLinkRuleId(suffix: "exact-target" | "unresolved-target"): string {
  return `syntax.markdown.inline-link.literal-project-file.${suffix}`;
}

/** Resolves only one exact indexed project-relative path retained by the Markdown syntax pass. */
function projectMarkdownFileReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
}): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const links = [...(facts.markdownFacts?.links ?? [])].sort((left, right) => {
      const byLine = left.range.start.line - right.range.start.line;
      if (byLine !== 0) return byLine;
      const byColumn = left.range.start.column - right.range.start.column;
      return byColumn !== 0 ? byColumn : compareStableText(left.sourceId, right.sourceId);
    });
    for (const link of links) {
      const candidate = input.fileSymbols.get(link.targetFilePath);
      const candidates = candidate === undefined ? [] : [candidate];
      const targetId = candidate?.id ?? null;
      edges.push({
        id: createEdgeId({
          sourceId: link.sourceId,
          targetId,
          kind: "references",
          line: link.range.start.line,
          column: link.range.start.column,
          referenceName: link.referenceName
        }),
        sourceId: link.sourceId,
        targetId,
        kind: "references",
        filePath: link.filePath,
        range: link.range,
        resolution: candidate === undefined ? "unresolved" : "exact",
        confidence: candidate === undefined ? 0 : 1,
        referenceName: link.referenceName,
        evidence: referenceEvidence(
          markdownLinkRuleId(candidate === undefined ? "unresolved-target" : "exact-target"),
          "module",
          candidateSymbolIds(candidates)
        )
      });
    }
  }
  return edges;
}

/** Resolves only exact indexed paths retained by the bounded JSP syntax pass. */
function projectJspTemplateReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
}): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.jspFacts?.templateReferences ?? [])].sort((left, right) => {
      const byRange = left.range.start.line - right.range.start.line;
      if (byRange !== 0) {
        return byRange;
      }
      const byColumn = left.range.start.column - right.range.start.column;
      return byColumn !== 0 ? byColumn : compareStableText(left.sourceId, right.sourceId);
    });
    for (const reference of references) {
      const candidatesById = new Map<string, SymbolNode>();
      for (const targetFilePath of reference.targetFilePaths) {
        const candidate = input.fileSymbols.get(targetFilePath);
        if (candidate !== undefined) {
          candidatesById.set(candidate.id, candidate);
        }
      }
      const candidates = [...candidatesById.values()].sort((left, right) =>
        compareStableText(left.id, right.id)
      );
      const target = candidates.length === 1 ? candidates[0] : undefined;
      const targetId = target?.id ?? null;
      edges.push({
        id: createEdgeId({
          sourceId: reference.sourceId,
          targetId,
          kind: "references",
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.referenceName
        }),
        sourceId: reference.sourceId,
        targetId,
        kind: "references",
        filePath: reference.filePath,
        range: reference.range,
        resolution: target === undefined ? "unresolved" : "exact",
        confidence: target === undefined ? 0 : 1,
        referenceName: reference.referenceName,
        evidence: referenceEvidence(
          jspTemplateReferenceRuleId(
            reference.kind,
            target === undefined ? "unresolved-target" : "exact-target"
          ),
          "module",
          candidateSymbolIds(candidates)
        )
      });
    }
  }
  return edges;
}

function bladeTemplateReferenceRuleId(
  kind: "extends" | "include" | "component" | "each",
  suffix: "exact-target" | "unresolved-target" | "unproven-project-root"
): string {
  return "framework.laravel-blade." + kind + ".literal-resources-views." + suffix;
}

/**
 * A conventional Blade root is exact only in a fixture-shaped project whose
 * entire indexed source surface is Blade files under `resources/views/`. Any PHP,
 * config/provider source, alternative view root, or other source file may
 * customize Laravel's finder, so it leaves literal references unresolved.
 */
function hasProvenConventionalBladeFixtureRoot(
  factsByFile: ReadonlyMap<string, ExtractedFileFacts>
): boolean {
  const filePaths = [...factsByFile.keys()];
  return (
    filePaths.length > 0 &&
    filePaths.every(
      (filePath) =>
        filePath.startsWith("resources/views/") && filePath.endsWith(".blade.php")
    )
  );
}

function projectBladeTemplateReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
}): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  const hasProvenRoot = hasProvenConventionalBladeFixtureRoot(input.factsByFile);
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.bladeFacts?.templateReferences ?? [])].sort((left, right) => {
      const bySource = compareStableText(left.sourceId, right.sourceId);
      if (bySource !== 0) {
        return bySource;
      }
      const byRange = left.range.start.line - right.range.start.line;
      if (byRange !== 0) {
        return byRange;
      }
      return left.range.start.column - right.range.start.column;
    });
    for (const reference of references) {
      const target = hasProvenRoot ? input.fileSymbols.get(reference.targetFilePath) : undefined;
      const targetId = target?.id ?? null;
      const ruleSuffix =
        target === undefined
          ? hasProvenRoot
            ? "unresolved-target"
            : "unproven-project-root"
          : "exact-target";
      edges.push({
        id: createEdgeId({
          sourceId: reference.sourceId,
          targetId,
          kind: "calls",
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.referenceName
        }),
        sourceId: reference.sourceId,
        targetId,
        kind: "calls",
        filePath: reference.filePath,
        range: reference.range,
        resolution: target === undefined ? "unresolved" : "exact",
        confidence: target === undefined ? 0 : 1,
        referenceName: reference.referenceName,
        evidence: referenceEvidence(
          bladeTemplateReferenceRuleId(reference.kind, ruleSuffix),
          "module",
          candidateSymbolIds(target === undefined ? [] : [target])
        )
      });
    }
  }
  return edges;
}

/**
 * Resolves Razor Pages only through the one canonical same-path code-behind.
 * The retained Razor facts intentionally never enter generic name resolution:
 * a missing, partial, nested, or overloaded C# shape simply yields no edge.
 */
function projectRazorPagesReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly sourceDocumentsByPath: ReadonlyMap<string, SourceDocument>;
  readonly structuralEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [pagePath, pageFacts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const razorFacts = pageFacts.razorFacts;
    if (razorFacts === undefined || razorFacts.model === undefined) {
      continue;
    }
    const pageFile = input.symbolsById.get(razorFacts.fileSymbolId);
    const pageDefault = input.symbolsById.get(razorFacts.defaultSymbolId);
    if (
      pageFile?.kind !== "file" ||
      pageFile.filePath !== pagePath ||
      pageDefault === undefined ||
      pageDefault.filePath !== pagePath ||
      razorFacts.model.sourceId !== pageDefault.id
    ) {
      continue;
    }
    const companionPath = `${pagePath}.cs`;
    const companionFacts = input.factsByFile.get(companionPath);
    const companionDocument = input.sourceDocumentsByPath.get(companionPath);
    if (companionFacts === undefined || companionDocument?.language !== "csharp") {
      continue;
    }
    const companionFile = companionFacts.symbols.find((symbol) => symbol.kind === "file");
    if (companionFile === undefined || companionFile.filePath !== companionPath) {
      continue;
    }
    const directlyContains = (parentId: string, childId: string): boolean =>
      input.structuralEdges.some(
        (edge) => edge.kind === "contains" && edge.sourceId === parentId && edge.targetId === childId
      );
    const directClassFacts = companionFacts.csharpDirectClassFacts ?? [];
    const directClassFact = (classId: string) => {
      const matchingFacts = directClassFacts.filter((candidate) => candidate.classId === classId);
      return matchingFacts.length === 1 && matchingFacts[0]?.isPartial === false
        ? matchingFacts[0]
        : undefined;
    };
    const modelCandidates = companionFacts.symbols.filter(
      (symbol) =>
        symbol.kind === "class" &&
        symbol.name === razorFacts.model?.modelName &&
        symbol.filePath === companionPath &&
        directlyContains(companionFile.id, symbol.id) &&
        directClassFact(symbol.id) !== undefined
    );
    if (modelCandidates.length !== 1 || modelCandidates[0] === undefined) {
      continue;
    }
    const model = modelCandidates[0];
    edges.push({
      id: createEdgeId({
        sourceId: razorFacts.model.sourceId,
        targetId: model.id,
        kind: "references",
        line: razorFacts.model.range.start.line,
        column: razorFacts.model.range.start.column,
        referenceName: razorFacts.model.modelName
      }),
      sourceId: razorFacts.model.sourceId,
      targetId: model.id,
      kind: "references",
      filePath: pagePath,
      range: razorFacts.model.range,
      resolution: "exact",
      confidence: 1,
      referenceName: razorFacts.model.modelName,
      evidence: referenceEvidence(
        "framework.razor-pages.direct-model.conventional-companion",
        "module",
        [model.id],
        [],
        [pagePath, companionPath]
      )
    });
    const modelFact = directClassFact(model.id);
    const hasIndexedPageModelShadow = [...input.symbolsById.values()].some(
      (symbol) => symbol.kind === "class" && symbol.name === "PageModel"
    );
    if (modelFact?.isRazorPageModel !== true || hasIndexedPageModelShadow) {
      continue;
    }
    for (const handler of razorFacts.postHandlers ?? []) {
      if (handler.sourceId !== pageDefault.id) {
        continue;
      }
      const handlerCandidates = (modelFact.razorPageHandlerMethods ?? [])
        .filter((candidate) => candidate.handlerName === handler.handlerName)
        .map((candidate) => input.symbolsById.get(candidate.methodId))
        .filter(
          (candidate): candidate is SymbolNode =>
            candidate?.kind === "method" &&
            candidate.filePath === companionPath &&
            directlyContains(model.id, candidate.id)
        );
      if (handlerCandidates.length !== 1 || handlerCandidates[0] === undefined) {
        continue;
      }
      const target = handlerCandidates[0];
      edges.push({
        id: createEdgeId({
          sourceId: pageDefault.id,
          targetId: target.id,
          kind: "handles",
          line: handler.range.start.line,
          column: handler.range.start.column,
          referenceName: handler.handlerName
        }),
        sourceId: pageDefault.id,
        targetId: target.id,
        kind: "handles",
        filePath: pagePath,
        range: handler.range,
        resolution: "exact",
        confidence: 1,
        referenceName: handler.handlerName,
        evidence: referenceEvidence(
          "framework.razor-pages.literal-post-handler.conventional-companion-method",
          "module",
          [target.id],
          [],
          [pagePath, companionPath]
        )
      });
    }
  }
  return edges;
}

function isSpringBootPropertiesFile(filePath: string): boolean {
  const fileName = filePath.split(/[\\/]/u).at(-1) ?? filePath;
  return /^(application|bootstrap)(?:-[A-Za-z0-9_.-]+)?\.properties$/iu.test(fileName);
}

function isSpringBootYamlFile(filePath: string): boolean {
  const fileName = filePath.split(/[\\/]/u).at(-1) ?? filePath;
  return /^(application|bootstrap)(?:-[A-Za-z0-9_.-]+)?\.ya?ml$/iu.test(fileName);
}

type SpringBootConfigKeySource = "properties" | "yaml";

interface SpringBootConfigKeyCandidate {
  readonly source: SpringBootConfigKeySource;
  readonly symbol: SymbolNode;
}

function springBootConfigKeyCandidates(
  factsByFile: ReadonlyMap<string, ExtractedFileFacts>
): readonly SpringBootConfigKeyCandidate[] {
  const configKeySymbols: SpringBootConfigKeyCandidate[] = [];
  for (const [filePath, facts] of [...factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    if (isSpringBootPropertiesFile(filePath)) {
      const qualifiedNamePrefix = `${filePath}#properties-key:`;
      for (const symbol of facts.symbols) {
        if (symbol.kind === "variable" && symbol.qualifiedName.startsWith(qualifiedNamePrefix)) {
          configKeySymbols.push({ source: "properties", symbol });
        }
      }
    }
    if (isSpringBootYamlFile(filePath)) {
      const qualifiedNamePrefix = `${filePath}#spring-boot-yaml-key:`;
      for (const symbol of facts.symbols) {
        if (symbol.kind === "variable" && symbol.qualifiedName.startsWith(qualifiedNamePrefix)) {
          configKeySymbols.push({ source: "yaml", symbol });
        }
      }
    }
  }
  return configKeySymbols;
}

function springBootConfigRuleId(
  source: SpringBootConfigKeySource | "config",
  suffix: "exact-key" | "unresolved-key" | "ambiguous-key"
): string {
  return `framework.spring-boot.${source}.direct-value.literal-key.${suffix}`;
}

/**
 * Conservative Spring relaxed-key identity. Dots remain segment boundaries;
 * only case, hyphens, and underscores normalize within those segments.
 */
function canonicalSpringBootConfigKey(key: string): string {
  return key.toLowerCase().replaceAll("-", "").replaceAll("_", "");
}

function springBootRelaxedConfigRuleId(
  source: SpringBootConfigKeySource | "config",
  suffix: "unique-key" | "ambiguous-key"
): string {
  return `framework.spring-boot.${source}.direct-value.relaxed-key.${suffix}`;
}

/**
 * Projects a direct Java/Kotlin `@Value("${literal.key}")` fact through one
 * parser-proven conventional application/bootstrap properties or YAML key.
 * A lone literal spelling stays exact; relaxed case/dash/underscore matching
 * is a lower-confidence fallback. Profile precedence, format precedence, and
 * every duplicate canonical identity remain explicit unresolved references.
 */
function projectSpringBootPropertiesReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): readonly GraphEdge[] {
  const configKeySymbols = springBootConfigKeyCandidates(input.factsByFile);

  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.springBootPropertiesFacts?.valueReferences ?? [])].sort(
      (left, right) => {
        const bySource = compareStableText(left.sourceId, right.sourceId);
        if (bySource !== 0) {
          return bySource;
        }
        const byLine = left.range.start.line - right.range.start.line;
        return byLine !== 0 ? byLine : left.range.start.column - right.range.start.column;
      }
    );
    for (const reference of references) {
      const sourceSymbol = input.symbolsById.get(reference.sourceId);
      if (sourceSymbol === undefined) {
        continue;
      }
      const canonicalReferenceKey = canonicalSpringBootConfigKey(reference.key);
      const candidates = configKeySymbols
        .filter(
          (candidate) => canonicalSpringBootConfigKey(candidate.symbol.name) === canonicalReferenceKey
        )
        .sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
      const target = candidates.length === 1 ? candidates[0]?.symbol : undefined;
      const isLiteralGroup =
        candidates.length > 0 && candidates.every((candidate) => candidate.symbol.name === reference.key);
      const isRelaxedGroup = candidates.length > 0 && !isLiteralGroup;
      const candidateSources = new Set(candidates.map((candidate) => candidate.source));
      const ruleSource =
        candidateSources.size > 1
          ? "config"
          : (candidates[0]?.source ?? "config");
      edges.push({
        id: createEdgeId({
          sourceId: sourceSymbol.id,
          targetId: target?.id ?? null,
          kind: "references",
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.key
        }),
        sourceId: sourceSymbol.id,
        targetId: target?.id ?? null,
        kind: "references",
        filePath: reference.filePath,
        range: reference.range,
        resolution: target === undefined ? "unresolved" : isRelaxedGroup ? "heuristic" : "exact",
        confidence: target === undefined ? 0 : isRelaxedGroup ? 0.75 : 1,
        referenceName: reference.key,
        evidence: isRelaxedGroup
          ? referenceEvidence(
              springBootRelaxedConfigRuleId(
                ruleSource,
                target === undefined ? "ambiguous-key" : "unique-key"
              ),
              target === undefined ? "unresolved" : "heuristic",
              candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
              candidates.map((candidate) => candidate.symbol.filePath)
            )
          : referenceEvidence(
              springBootConfigRuleId(
                ruleSource,
                target !== undefined
                  ? "exact-key"
                  : candidates.length === 0
                    ? "unresolved-key"
                    : "ambiguous-key"
              ),
              target === undefined ? "unresolved" : "module",
              candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
              candidates.map((candidate) => candidate.symbol.filePath)
            )
      });
    }
  }
  return edges;
}

function springBootConfigurationPropertiesRuleId(
  suffix: "unique-leaf" | "ambiguous-leaf" | "unresolved-prefix"
): string {
  return `framework.spring-boot.configuration-properties.literal-prefix.${suffix}`;
}

function springBootConfigurationPropertiesRelaxedRuleId(
  suffix: "unique-leaf" | "ambiguous-leaf"
): string {
  return `framework.spring-boot.configuration-properties.relaxed-prefix.${suffix}`;
}

/**
 * A Java/Kotlin `@ConfigurationProperties(prefix = "app.cache")` class proves
 * the static prefix but not Spring's active-profile or source-precedence
 * outcome. Project each unique canonical descendant leaf, retaining literal
 * spelling at 0.85 and relaxed matching at 0.75; collisions and missing
 * prefixes remain unresolved.
 */
function projectSpringBootConfigurationPropertiesPrefixes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): readonly GraphEdge[] {
  const configKeySymbols = springBootConfigKeyCandidates(input.factsByFile);
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.springBootPropertiesFacts?.configurationPropertiesPrefixes ?? [])].sort(
      (left, right) => {
        const bySource = compareStableText(left.sourceId, right.sourceId);
        if (bySource !== 0) {
          return bySource;
        }
        const byLine = left.range.start.line - right.range.start.line;
        return byLine !== 0 ? byLine : left.range.start.column - right.range.start.column;
      }
    );
    for (const reference of references) {
      const sourceSymbol = input.symbolsById.get(reference.sourceId);
      if (sourceSymbol === undefined) {
        continue;
      }
      const candidatesByCanonicalKey = new Map<string, SpringBootConfigKeyCandidate[]>();
      const literalDescendantPrefix = `${reference.prefix}.`;
      const canonicalDescendantPrefix = `${canonicalSpringBootConfigKey(reference.prefix)}.`;
      for (const candidate of configKeySymbols) {
        const canonicalCandidateKey = canonicalSpringBootConfigKey(candidate.symbol.name);
        if (!canonicalCandidateKey.startsWith(canonicalDescendantPrefix)) {
          continue;
        }
        const candidates = candidatesByCanonicalKey.get(canonicalCandidateKey) ?? [];
        candidates.push(candidate);
        candidatesByCanonicalKey.set(canonicalCandidateKey, candidates);
      }
      const leaves = [...candidatesByCanonicalKey.entries()].sort(([left], [right]) =>
        compareStableText(left, right)
      );
      if (leaves.length === 0) {
        edges.push({
          id: createEdgeId({
            sourceId: sourceSymbol.id,
            targetId: null,
            kind: "references",
            line: reference.range.start.line,
            column: reference.range.start.column,
            referenceName: reference.prefix
          }),
          sourceId: sourceSymbol.id,
          targetId: null,
          kind: "references",
          filePath: reference.filePath,
          range: reference.range,
          resolution: "unresolved",
          confidence: 0,
          referenceName: reference.prefix,
          evidence: referenceEvidence(
            springBootConfigurationPropertiesRuleId("unresolved-prefix"),
            "unresolved",
            []
          )
        });
        continue;
      }
      for (const [canonicalKey, candidates] of leaves) {
        const orderedCandidates = [...candidates].sort((left, right) =>
          compareStableText(left.symbol.id, right.symbol.id)
        );
        const target = orderedCandidates.length === 1 ? orderedCandidates[0]?.symbol : undefined;
        const literalCandidateNames = new Set(
          orderedCandidates
            .filter((candidate) => candidate.symbol.name.startsWith(literalDescendantPrefix))
            .map((candidate) => candidate.symbol.name)
        );
        const literalKey = [...literalCandidateNames][0];
        const isLiteralGroup =
          literalKey !== undefined &&
          literalCandidateNames.size === 1 &&
          orderedCandidates.every((candidate) => candidate.symbol.name === literalKey);
        const referenceName = isLiteralGroup
          ? `${reference.prefix}:${literalKey}`
          : `${reference.prefix}:relaxed:${canonicalKey}`;
        edges.push({
          id: createEdgeId({
            sourceId: sourceSymbol.id,
            targetId: target?.id ?? null,
            kind: "references",
            line: reference.range.start.line,
            column: reference.range.start.column,
            referenceName
          }),
          sourceId: sourceSymbol.id,
          targetId: target?.id ?? null,
          kind: "references",
          filePath: reference.filePath,
          range: reference.range,
          resolution: target === undefined ? "unresolved" : "heuristic",
          confidence: target === undefined ? 0 : isLiteralGroup ? 0.85 : 0.75,
          referenceName,
          evidence: referenceEvidence(
            isLiteralGroup
              ? springBootConfigurationPropertiesRuleId(
                  target === undefined ? "ambiguous-leaf" : "unique-leaf"
                )
              : springBootConfigurationPropertiesRelaxedRuleId(
                  target === undefined ? "ambiguous-leaf" : "unique-leaf"
                ),
            target === undefined ? "unresolved" : "heuristic",
            candidateSymbolIds(orderedCandidates.map((candidate) => candidate.symbol)),
            orderedCandidates.map((candidate) => candidate.symbol.filePath)
          )
        });
      }
    }
  }
  return edges;
}

function nestGraphqlResolverSchemaRuleId(
  suffix: "unique-object-type" | "unresolved-object-type" | "ambiguous-object-type"
): string {
  return `framework.nestjs.graphql.resolver-schema.${suffix}`;
}

/**
 * A direct `@Resolver(() => User)` proves the NestJS decorator and the source
 * identifier, but not that the TypeScript runtime value and a GraphQL schema
 * declaration are semantically the same type. Project the relation only when
 * exactly one indexed GraphQL object type shares that name, and retain it as a
 * bounded heuristic rather than overstating cross-language proof.
 */
function projectNestGraphqlResolverSchemaReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly sourceDocuments: readonly SourceDocument[];
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): readonly GraphEdge[] {
  const languageByFile = new Map(
    input.sourceDocuments.map((document) => [document.relativePath, document.language] as const)
  );
  const schemaObjectTypes: SymbolNode[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    if (languageByFile.get(filePath) !== "graphql") {
      continue;
    }
    const qualifiedNamePrefix = `${filePath}#type:`;
    for (const symbol of facts.symbols) {
      if (
        symbol.kind === "class" &&
        symbol.qualifiedName === qualifiedNamePrefix + symbol.name
      ) {
        schemaObjectTypes.push(symbol);
      }
    }
  }

  const edges: GraphEdge[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.nestGraphqlFacts?.resolverReferences ?? [])].sort((left, right) => {
      const byResolver = compareStableText(left.resolverId, right.resolverId);
      if (byResolver !== 0) {
        return byResolver;
      }
      const byLine = left.range.start.line - right.range.start.line;
      return byLine !== 0 ? byLine : left.range.start.column - right.range.start.column;
    });
    for (const reference of references) {
      const source = input.symbolsById.get(reference.resolverId);
      if (source?.kind !== "class") {
        continue;
      }
      const candidates = schemaObjectTypes
        .filter((symbol) => symbol.name === reference.schemaTypeName)
        .sort((left, right) => compareStableText(left.id, right.id));
      const target = candidates.length === 1 ? candidates[0] : undefined;
      const suffix =
        target !== undefined
          ? "unique-object-type"
          : candidates.length === 0
            ? "unresolved-object-type"
            : "ambiguous-object-type";
      edges.push({
        id: createEdgeId({
          sourceId: source.id,
          targetId: target?.id ?? null,
          kind: "references",
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.schemaTypeName
        }),
        sourceId: source.id,
        targetId: target?.id ?? null,
        kind: "references",
        filePath,
        range: reference.range,
        resolution: target === undefined ? "unresolved" : "heuristic",
        confidence: target === undefined ? 0 : 0.85,
        referenceName: reference.schemaTypeName,
        evidence: referenceEvidence(
          nestGraphqlResolverSchemaRuleId(suffix),
          target === undefined ? "unresolved" : "heuristic",
          candidateSymbolIds(candidates)
        )
      });
    }
  }
  return edges;
}

function solidityInheritanceRuleId(
  source: SymbolNode,
  relationKind: "extends" | "implements"
): string {
  return "language.solidity.same-file." + source.kind + "." + relationKind;
}

/**
 * A Solidity `is` clause can mean class inheritance or interface implementation.
 * Resolve it only when one declaration in the same complete source file proves
 * the target kind; imports and constructor-argument clauses remain unprojected.
 */
function projectSolidityInheritance(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
}): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    const declarationsByName = new Map<string, SymbolNode[]>();
    for (const symbol of facts.symbols) {
      if (symbol.kind !== "class" && symbol.kind !== "interface") {
        continue;
      }
      const declarations = declarationsByName.get(symbol.name) ?? [];
      declarations.push(symbol);
      declarationsByName.set(symbol.name, declarations);
    }
    const references = [...(facts.solidityFacts?.inheritanceReferences ?? [])].sort((left, right) => {
      const bySource = compareStableText(left.sourceId, right.sourceId);
      if (bySource !== 0) {
        return bySource;
      }
      const byRange = left.range.start.line - right.range.start.line;
      if (byRange !== 0) {
        return byRange;
      }
      return left.range.start.column - right.range.start.column;
    });
    for (const reference of references) {
      const source = symbolsById.get(reference.sourceId);
      if (source === undefined || (source.kind !== "class" && source.kind !== "interface")) {
        continue;
      }
      const candidates = (declarationsByName.get(reference.baseName) ?? []).filter(
        (candidate) => candidate.id !== source.id
      );
      if (candidates.length !== 1) {
        continue;
      }
      const target = candidates[0];
      if (target === undefined) {
        continue;
      }
      const relationKind =
        source.kind === "class" && target.kind === "interface"
          ? "implements"
          : source.kind === "class" && target.kind === "class"
            ? "extends"
            : source.kind === "interface" && target.kind === "interface"
              ? "extends"
              : null;
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
          referenceName: reference.baseName
        }),
        sourceId: source.id,
        targetId: target.id,
        kind: relationKind,
        filePath: reference.filePath,
        range: reference.range,
        resolution: "exact",
        confidence: 1,
        referenceName: reference.baseName,
        evidence: referenceEvidence(
          solidityInheritanceRuleId(source, relationKind),
          "module",
          candidateSymbolIds([target])
        )
      });
    }
  }
  return edges;
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

interface PlayRouteHandlerResolution {
  readonly classCandidates: readonly SymbolNode[];
  readonly methodCandidates: readonly SymbolNode[];
  readonly target: SymbolNode | null;
}

interface RailsRouteHandlerResolution {
  readonly classCandidates: readonly SymbolNode[];
  readonly methodCandidates: readonly SymbolNode[];
  readonly target: SymbolNode | null;
}

function parseRailsControllerAction(reference: PendingReference): {
  readonly controller: string;
  readonly controllerName: string;
  readonly actionName: string;
} | null {
  if (reference.routeFramework !== "rails") {
    return null;
  }
  const match = /^([a-z_][a-z0-9_]*)#([a-z_][a-zA-Z0-9_]*)$/u.exec(reference.referenceName);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  return {
    controller: match[1],
    controllerName:
      match[1]
        .split("_")
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join("") + "Controller",
    actionName: match[2]
  };
}

/**
 * Rails routes name a controller action but do not lexically import it. A route
 * is exact only when the conventional controller file, its class, and its
 * action method each provide one independent syntax-proven candidate.
 */
function resolveExactRailsRouteHandler(input: {
  readonly reference: PendingReference;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): RailsRouteHandlerResolution | null {
  const action = parseRailsControllerAction(input.reference);
  if (action === null) {
    return null;
  }
  const controllerPath = `app/controllers/${action.controller}_controller.rb`;
  const classCandidates = [...input.symbolsById.values()]
    .filter(
      (symbol) =>
        symbol.kind === "class" &&
        symbol.filePath === controllerPath &&
        symbol.name === action.controllerName
    )
    .sort((left, right) => compareStableText(left.id, right.id));
  const controller = classCandidates.length === 1 ? classCandidates[0] : undefined;
  const methodCandidates =
    controller === undefined
      ? []
      : [...input.symbolsById.values()]
          .filter(
            (symbol) =>
              symbol.kind === "method" &&
              symbol.qualifiedName === controller.qualifiedName + "." + action.actionName
          )
          .sort((left, right) => compareStableText(left.id, right.id));
  return {
    classCandidates,
    methodCandidates,
    target:
      classCandidates.length === 1 && methodCandidates.length === 1
        ? methodCandidates[0] ?? null
        : null
  };
}

function railsRouteHandlerRuleId(
  reference: PendingReference,
  suffix: "conventional-file-class-method" | "unresolved-controller-method"
): string {
  if (reference.routeRegistration === "rails-resources") {
    return `framework.rails.resources.direct-routes-draw.literal-resource.${suffix}`;
  }
  if (reference.routeRegistration === "rails-resource") {
    return `framework.rails.resource.direct-routes-draw.literal-resource.${suffix}`;
  }
  return `framework.rails.direct-routes-draw.literal-controller-action.${suffix}`;
}

function parsePlayControllerAction(reference: PendingReference): {
  readonly packageName: string;
  readonly controllerName: string;
  readonly actionName: string;
} | null {
  if (reference.routeFramework !== "play") {
    return null;
  }
  const parts = reference.referenceName.split(".");
  if (
    parts.length < 2 ||
    !parts.every((part) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(part))
  ) {
    return null;
  }
  const actionName = parts.at(-1);
  const controllerName = parts.at(-2);
  if (actionName === undefined || controllerName === undefined) {
    return null;
  }
  return {
    packageName: parts.slice(0, -2).join("."),
    controllerName,
    actionName
  };
}

function playClassCandidates(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly packageName: string;
  readonly className: string;
}): readonly SymbolNode[] {
  const candidatesById = new Map<string, SymbolNode>();
  for (const facts of input.factsByFile.values()) {
    const classFacts = [
      ...(facts.scalaFacts?.classes ?? []),
      ...(facts.javaFacts?.classes ?? [])
    ];
    for (const fact of classFacts) {
      if (fact.packageName !== input.packageName) {
        continue;
      }
      const symbol = input.symbolsById.get(fact.symbolId);
      if (
        symbol?.kind === "class" &&
        symbol.name === input.className
      ) {
        candidatesById.set(symbol.id, symbol);
      }
    }
  }
  return [...candidatesById.values()].sort((left, right) => compareStableText(left.id, right.id));
}

/**
 * Play's conf/routes references name controller actions rather than lexical
 * bindings. A route is exact only when its package, Scala-or-Java class, and
 * direct method each have one syntax-proven candidate in the indexed project.
 */
function resolveExactPlayRouteHandler(input: {
  readonly reference: PendingReference;
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): PlayRouteHandlerResolution | null {
  const action = parsePlayControllerAction(input.reference);
  if (action === null) {
    return null;
  }
  const classCandidates = playClassCandidates({
    factsByFile: input.factsByFile,
    symbolsById: input.symbolsById,
    packageName: action.packageName,
    className: action.controllerName
  });
  const controller = classCandidates.length === 1 ? classCandidates[0] : undefined;
  const methodCandidates =
    controller === undefined
      ? []
      : [...input.symbolsById.values()]
          .filter(
            (symbol) =>
              symbol.kind === "method" &&
              symbol.qualifiedName === controller.qualifiedName + "." + action.actionName
          )
          .sort((left, right) => compareStableText(left.id, right.id));

  return {
    classCandidates,
    methodCandidates,
    target:
      classCandidates.length === 1 && methodCandidates.length === 1
        ? methodCandidates[0] ?? null
        : null
  };
}

interface PlayRouterMountResolution {
  readonly classCandidates: readonly SymbolNode[];
  readonly target: SymbolNode | null;
}

function parsePlayRouterName(routerName: string): {
  readonly packageName: string;
  readonly className: string;
} | null {
  const parts = routerName.split(".");
  if (
    parts.length < 2 ||
    !parts.every((part) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(part))
  ) {
    return null;
  }
  const className = parts.at(-1);
  if (className === undefined) {
    return null;
  }
  return {
    packageName: parts.slice(0, -1).join("."),
    className
  };
}

function resolveExactPlayRouterMount(input: {
  readonly routerName: string;
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): PlayRouterMountResolution {
  const router = parsePlayRouterName(input.routerName);
  if (router === null) {
    return { classCandidates: [], target: null };
  }
  const classCandidates = playClassCandidates({
    factsByFile: input.factsByFile,
    symbolsById: input.symbolsById,
    packageName: router.packageName,
    className: router.className
  });
  return {
    classCandidates,
    target: classCandidates.length === 1 ? classCandidates[0] ?? null : null
  };
}

/**
 * A Play `->` line mounts a Router class under a prefix; it is not itself a
 * concrete HTTP handler route. Keep it as a dedicated route-kind node with a
 * `handles` edge so `routes` remains an inventory of only concrete HTTP
 * routes while impact and node inspection retain the mounting relationship.
 */
function projectPlayRouterMountEdges(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const mounts = facts.scalaFacts?.routerMounts ?? [];
    for (const mount of mounts) {
      const source = input.symbolsById.get(mount.symbolId);
      if (source?.kind !== "route" || source.filePath !== filePath) {
        continue;
      }
      const resolution = resolveExactPlayRouterMount({
        routerName: mount.routerName,
        factsByFile: input.factsByFile,
        symbolsById: input.symbolsById
      });
      const candidateIds = candidateSymbolIds(resolution.classCandidates);
      const target = resolution.target;
      edges.push({
        id: createEdgeId({
          sourceId: source.id,
          targetId: target?.id ?? null,
          kind: "handles",
          line: mount.range.start.line,
          column: mount.range.start.column,
          referenceName: mount.routerName
        }),
        sourceId: source.id,
        targetId: target?.id ?? null,
        kind: "handles",
        filePath,
        range: mount.range,
        resolution: target === null ? "unresolved" : "exact",
        confidence: target === null ? 0 : 1,
        referenceName: mount.routerName,
        evidence: referenceEvidence(
          target === null
            ? "framework.play.conf-routes.literal-router-mount.unresolved-router"
            : "framework.play.conf-routes.literal-router-mount.package-class",
          target === null ? "unresolved" : "module",
          candidateIds
        )
      });
    }
  }
  return edges;
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
    case "cargo-workspace-crate":
      return "module.cargo-workspace-crate";
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

function isFastifyPluginSymbol(symbol: SymbolNode): boolean {
  return symbol.kind === "function" || symbol.kind === "variable";
}

/**
 * Resolves a static Fastify plugin callback through the same exact
 * local/import/re-export proof as other runtime references. It deliberately
 * accepts only function or variable symbols because a plugin callback cannot
 * be represented by a class, type, or module object.
 */
function resolveExactFastifyPluginReference(input: {
  readonly filePath: string;
  readonly reference: FastifyPluginSymbolReference;
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
  const localPlugins = local.candidates.filter(isFastifyPluginSymbol);
  if (local.hasBinding) {
    return localPlugins.length === 1 ? localPlugins[0] ?? null : null;
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
  if (
    targetPath === undefined ||
    input.exportSurfaces.get(targetPath)?.get(binding.importedName)?.ambiguous === true
  ) {
    return null;
  }

  const candidates = canonicalExportCandidates(
    candidatesForExport(input.exportSurfaces, targetPath, binding.importedName).filter(
      (candidate) => !candidate.isTypeOnly && isFastifyPluginSymbol(candidate.symbol)
    )
  );
  return candidates.length === 1 ? candidates[0]?.symbol ?? null : null;
}

interface ResolvedFrameworkRoutePluginReceiver {
  readonly symbol: SymbolNode;
  readonly resolutionPath: readonly string[];
  readonly configurationPaths: readonly string[];
}

function resolveExactFrameworkRoutePluginReceiver(input: {
  readonly filePath: string;
  readonly reference: FastifyPluginSymbolReference;
  readonly frameworkId: string;
  readonly facts: ExtractedFileFacts;
  readonly receiverFrameworkById: ReadonlyMap<string, string>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
  readonly exportSurfaces: ReadonlyMap<string, ExportSurface>;
}): ResolvedFrameworkRoutePluginReceiver | null {
  const imports = input.facts.importBindings.filter(
    (binding) => binding.localName === input.reference.name && binding.isTypeOnly !== true
  );
  if (imports.length !== 1 || imports[0] === undefined) {
    return null;
  }
  const binding = imports[0];
  const targetPath = input.moduleTargetPathByKey.get(
    moduleKey(input.filePath, binding.moduleSpecifier)
  );
  if (
    targetPath === undefined ||
    input.exportSurfaces.get(targetPath)?.get(binding.importedName)?.ambiguous === true
  ) {
    return null;
  }
  const candidates = canonicalExportCandidates(
    candidatesForExport(input.exportSurfaces, targetPath, binding.importedName).filter(
      (candidate) =>
        !candidate.isTypeOnly &&
        input.receiverFrameworkById.get(candidate.symbol.id) === input.frameworkId
    )
  );
  const candidate = candidates.length === 1 ? candidates[0] : undefined;
  return candidate === undefined
    ? null
    : {
        symbol: candidate.symbol,
        resolutionPath: [input.filePath, ...candidate.path],
        configurationPaths: candidate.configurationPaths
      };
}

interface FrameworkRoutePluginMountObservation {
  readonly fact: FrameworkRoutePluginFacts["importedMounts"][number];
  readonly resolutionPath: readonly string[];
  readonly configurationPaths: readonly string[];
}

interface FrameworkRoutePluginProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
  readonly references: readonly PendingReference[];
  readonly referenceScopes: ReadonlyMap<string, readonly string[]>;
  readonly suppressedRawRouteIds: readonly string[];
  readonly suppressedRawReferenceIds: readonly string[];
}

function projectFrameworkRoutePluginImportedMounts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly referencesById: ReadonlyMap<string, PendingReference>;
  readonly referenceScopeIdsByReferenceId: ReadonlyMap<string, readonly string[]>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
  readonly exportSurfaces: ReadonlyMap<string, ExportSurface>;
}): FrameworkRoutePluginProjection {
  const receiverFrameworkById = new Map<string, string>();
  for (const facts of input.factsByFile.values()) {
    for (const receiver of facts.frameworkRoutePluginFacts?.receivers ?? []) {
      receiverFrameworkById.set(receiver.receiverId, receiver.frameworkId);
    }
  }

  const mountsByChildReceiverId = new Map<string, FrameworkRoutePluginMountObservation[]>();
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    for (const mount of facts.frameworkRoutePluginFacts?.importedMounts ?? []) {
      const target = resolveExactFrameworkRoutePluginReceiver({
        filePath,
        reference: mount.child,
        frameworkId: mount.frameworkId,
        facts,
        receiverFrameworkById,
        moduleTargetPathByKey: input.moduleTargetPathByKey,
        exportSurfaces: input.exportSurfaces
      });
      if (target === null) {
        continue;
      }
      const observations = mountsByChildReceiverId.get(target.symbol.id) ?? [];
      observations.push({
        fact: mount,
        resolutionPath: target.resolutionPath,
        configurationPaths: target.configurationPaths
      });
      mountsByChildReceiverId.set(target.symbol.id, observations);
    }
  }

  interface ResolvedMountChain {
    readonly segments: readonly RoutePrefixSegment[];
    readonly resolutionPath: readonly string[];
  }
  const chainByReceiverId = new Map<string, ResolvedMountChain | null>();
  const resolveChain = (receiverId: string, seen = new Set<string>()): ResolvedMountChain | null => {
    if (chainByReceiverId.has(receiverId)) {
      return chainByReceiverId.get(receiverId) ?? null;
    }
    if (seen.has(receiverId)) {
      chainByReceiverId.set(receiverId, null);
      return null;
    }
    const observations = mountsByChildReceiverId.get(receiverId);
    if (observations === undefined) {
      return { segments: [], resolutionPath: [] };
    }
    const observation = observations.length === 1 ? observations[0] : undefined;
    if (observation === undefined || observation.fact.segment === null) {
      chainByReceiverId.set(receiverId, null);
      return null;
    }
    // An imported mount's local parent is a root for this project-level chain.
    // A receiver may itself be mounted elsewhere; that outer proof is followed first.
    const outer =
      receiverFrameworkById.get(observation.fact.parentReceiverId) !== observation.fact.frameworkId
        ? null
        : resolveChain(observation.fact.parentReceiverId, new Set([...seen, receiverId]));
    if (outer === null || outer.segments.length >= 16) {
      chainByReceiverId.set(receiverId, null);
      return null;
    }
    const resolved = {
      segments: [...outer.segments, observation.fact.segment],
      resolutionPath: [...outer.resolutionPath, ...observation.resolutionPath]
    };
    chainByReceiverId.set(receiverId, resolved);
    return resolved;
  };

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const references: PendingReference[] = [];
  const referenceScopes = new Map<string, readonly string[]>();
  const suppressedRawRouteIds = new Set<string>();
  const suppressedRawReferenceIds = new Set<string>();

  for (const facts of input.factsByFile.values()) {
    for (const route of facts.frameworkRoutePluginFacts?.routes ?? []) {
      if (!mountsByChildReceiverId.has(route.receiverId)) {
        continue;
      }
      suppressedRawRouteIds.add(route.routeId);
      suppressedRawReferenceIds.add(route.referenceId);
      const chain = resolveChain(route.receiverId);
      if (
        chain === null ||
        chain.segments.length + route.routePrefixChain.length > 16 ||
        route.path === "/"
      ) {
        continue;
      }
      const rawRoute = input.symbolsById.get(route.routeId);
      const rawReference = input.referencesById.get(route.referenceId);
      const file = rawRoute === undefined ? undefined : input.fileSymbols.get(rawRoute.filePath);
      if (rawRoute === undefined || rawReference === undefined || file === undefined) {
        continue;
      }
      const segments = [...chain.segments, ...route.routePrefixChain];
      const path = `${chain.segments.map((segment) => segment.prefix).join("")}${route.path}`;
      const name = `${route.method} ${path}`;
      const qualifiedName = `${rawRoute.filePath}#route:${name}`;
      const projected: SymbolNode = {
        ...rawRoute,
        id: createSymbolId({
          filePath: rawRoute.filePath,
          qualifiedName,
          kind: "route",
          declarationOrdinal: rawRoute.declarationOrdinal
        }),
        name,
        qualifiedName
      };
      symbols.push(projected);
      structuralEdges.push({
        id: createEdgeId({
          sourceId: file.id,
          targetId: projected.id,
          kind: "contains",
          line: projected.range.start.line,
          column: projected.range.start.column,
          referenceName: projected.name
        }),
        sourceId: file.id,
        targetId: projected.id,
        kind: "contains",
        filePath: projected.filePath,
        range: projected.range,
        resolution: "exact",
        confidence: 1,
        referenceName: projected.name,
        evidence: { ruleId: "syntax.containment", stage: "syntax", candidateSymbolIds: [projected.id] }
      });
      const reference: PendingReference = {
        ...rawReference,
        id: createEdgeId({
          sourceId: projected.id,
          targetId: null,
          kind: rawReference.relationKind,
          line: rawReference.range.start.line,
          column: rawReference.range.start.column,
          referenceName: rawReference.referenceName
        }),
        sourceId: projected.id,
        routeRegistration:
          segments.length === 1
            ? "plugin-imported-literal-prefix-mount"
            : "plugin-imported-literal-prefix-chain",
        routePrefixChain: segments,
        routeResolutionPath: chain.resolutionPath
      };
      references.push(reference);
      referenceScopes.set(
        reference.id,
        input.referenceScopeIdsByReferenceId.get(rawReference.id) ?? []
      );
    }
  }

  return {
    symbols,
    structuralEdges,
    references,
    referenceScopes,
    suppressedRawRouteIds: [...suppressedRawRouteIds],
    suppressedRawReferenceIds: [...suppressedRawReferenceIds]
  };
}

function fastifyImportedPluginPath(prefix: string, routePath: string): string | null {
  if (
    !prefix.startsWith("/") ||
    prefix.length <= 1 ||
    prefix.endsWith("/") ||
    !routePath.startsWith("/") ||
    routePath === "/"
  ) {
    return null;
  }
  return `${prefix}${routePath}`;
}

interface ResolvedFastifyPluginRegistration {
  readonly filePath: string;
  readonly pluginId: string;
  readonly prefix: string;
  readonly range: SourceRange;
}

interface ProjectedFastifyPluginRoute {
  readonly filePath: string;
  readonly pluginId: string;
  readonly route: FastifyPluginRouteFact;
  readonly path: string;
}

function compareFastifyPluginRegistration(
  left: ResolvedFastifyPluginRegistration,
  right: ResolvedFastifyPluginRegistration
): number {
  return (
    compareStableText(left.filePath, right.filePath) ||
    left.range.start.line - right.range.start.line ||
    left.range.start.column - right.range.start.column ||
    compareStableText(left.pluginId, right.pluginId) ||
    compareStableText(left.prefix, right.prefix)
  );
}

function compareProjectedFastifyPluginRoute(
  left: ProjectedFastifyPluginRoute,
  right: ProjectedFastifyPluginRoute
): number {
  return (
    compareStableText(left.filePath, right.filePath) ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.route.method, right.route.method) ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.route.handler.name, right.route.handler.name) ||
    compareStableText(left.pluginId, right.pluginId)
  );
}

interface FastifyImportedPluginRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
  readonly references: readonly PendingReference[];
  readonly referenceScopes: ReadonlyMap<string, readonly string[]>;
}

/**
 * Projects literal routes declared in another Fastify plugin module through
 * direct root and nested static registrations. Each plugin identifier and
 * handler is resolved through lexical/module facts; a recursive plugin edge
 * is simply not expanded again, so a cyclic source graph cannot manufacture
 * an unbounded set of synthetic routes.
 */
function projectFastifyImportedPluginRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly localBindingsByFile: ReadonlyMap<string, ExtractedFileFacts["localBindings"]>;
  readonly importBindingsByFile: ReadonlyMap<string, ExtractedFileFacts["importBindings"]>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
  readonly exportSurfaces: ReadonlyMap<string, ExportSurface>;
}): FastifyImportedPluginRouteProjection {
  const routesByPluginId = new Map<string, { readonly filePath: string; readonly route: FastifyPluginRouteFact }[]>();
  const childrenByPluginId = new Map<string, ResolvedFastifyPluginRegistration[]>();
  const rootRegistrations: ResolvedFastifyPluginRegistration[] = [];
  const pluginReference = (
    filePath: string,
    reference: FastifyPluginSymbolReference
  ): SymbolNode | null =>
    resolveExactFastifyPluginReference({
      filePath,
      reference,
      localBindings: input.localBindingsByFile.get(filePath) ?? [],
      importBindings: input.importBindingsByFile.get(filePath) ?? [],
      symbolsById: input.symbolsById,
      moduleTargetPathByKey: input.moduleTargetPathByKey,
      exportSurfaces: input.exportSurfaces
    });

  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const pluginFacts = facts.fastifyPluginFacts;
    if (pluginFacts === undefined) {
      continue;
    }

    for (const route of pluginFacts.routes) {
      const plugin = input.symbolsById.get(route.pluginId);
      if (plugin === undefined || !isFastifyPluginSymbol(plugin)) {
        continue;
      }
      const routes = routesByPluginId.get(plugin.id) ?? [];
      routes.push({ filePath, route });
      routesByPluginId.set(plugin.id, routes);
    }

    for (const registration of pluginFacts.childRegistrations) {
      const child = pluginReference(filePath, registration.plugin);
      const parent = input.symbolsById.get(registration.parentPluginId);
      if (child === null || parent === undefined || !isFastifyPluginSymbol(parent)) {
        continue;
      }
      const children = childrenByPluginId.get(parent.id) ?? [];
      children.push({
        filePath,
        pluginId: child.id,
        prefix: registration.prefix,
        range: registration.plugin.range
      });
      childrenByPluginId.set(parent.id, children);
    }

    for (const registration of pluginFacts.rootRegistrations) {
      const plugin = pluginReference(filePath, registration.plugin);
      if (plugin === null) {
        continue;
      }
      rootRegistrations.push({
        filePath,
        pluginId: plugin.id,
        prefix: registration.prefix,
        range: registration.plugin.range
      });
    }
  }

  const candidates: ProjectedFastifyPluginRoute[] = [];
  const visitPlugin = (pluginId: string, prefix: string, ancestry: ReadonlySet<string>): void => {
    if (ancestry.has(pluginId)) {
      return;
    }
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(pluginId);

    for (const entry of routesByPluginId.get(pluginId) ?? []) {
      const path = fastifyImportedPluginPath(prefix, entry.route.path);
      if (path !== null) {
        candidates.push({ filePath: entry.filePath, pluginId, route: entry.route, path });
      }
    }

    for (const child of [...(childrenByPluginId.get(pluginId) ?? [])].sort(compareFastifyPluginRegistration)) {
      const childPrefix = `${prefix}${child.prefix}`;
      visitPlugin(child.pluginId, childPrefix, nextAncestry);
    }
  };

  for (const registration of [...rootRegistrations].sort(compareFastifyPluginRegistration)) {
    visitPlugin(registration.pluginId, registration.prefix, new Set());
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const references: PendingReference[] = [];
  const referenceScopes = new Map<string, readonly string[]>();
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedFastifyPluginRoute)) {
    const dedupeKey = [
      candidate.pluginId,
      candidate.filePath,
      candidate.route.range.start.line,
      candidate.route.range.start.column,
      candidate.route.method,
      candidate.path,
      candidate.route.handler.name
    ].join("\u0000");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const file = input.fileSymbols.get(candidate.filePath);
    if (file === undefined) {
      continue;
    }
    const name = `${candidate.route.method} ${candidate.path}`;
    const qualifiedName = `${candidate.filePath}#route:${name}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.filePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.filePath,
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
      filePath: candidate.filePath,
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

    const reference: PendingReference = {
      id: createEdgeId({
        sourceId: route.id,
        targetId: null,
        kind: "routes",
        line: candidate.route.handler.range.start.line,
        column: candidate.route.handler.range.start.column,
        referenceName: candidate.route.handler.name
      }),
      sourceId: route.id,
      filePath: candidate.filePath,
      referenceName: candidate.route.handler.name,
      relationKind: "routes",
      routeFramework: "fastify",
      routeRegistration: "fastify-imported-plugin-prefix",
      range: candidate.route.handler.range
    };
    references.push(reference);
    referenceScopes.set(reference.id, candidate.route.handler.scopeIds);
  }

  return { symbols, structuralEdges, references, referenceScopes };
}

function isStaticPythonRoutePrefix(value: string): boolean {
  return value === "" || (value.startsWith("/") && !value.endsWith("/"));
}

function mountedPythonRoutePath(
  registrationPrefix: string,
  receiverPrefix: string,
  routePath: string
): string | null {
  if (
    !isStaticPythonRoutePrefix(registrationPrefix) ||
    !isStaticPythonRoutePrefix(receiverPrefix) ||
    !routePath.startsWith("/")
  ) {
    return null;
  }
  return `${registrationPrefix}${receiverPrefix}${routePath}`;
}

function mountedPythonRoutePathParts(parts: readonly string[]): string | null {
  if (parts.length < 2) {
    return null;
  }
  const routePath = parts.at(-1);
  const prefixes = parts.slice(0, -1);
  if (
    routePath === undefined ||
    !routePath.startsWith("/") ||
    !prefixes.every((prefix) => isStaticPythonRoutePrefix(prefix))
  ) {
    return null;
  }
  return [...prefixes, routePath].join("");
}

/**
 * Resolves the intentionally narrow Python framework import surface. A direct
 * `from .module import binding` is accepted only when both files live in one
 * regular package whose traversed directories contain `__init__.py` markers.
 * This primitive excludes namespace packages, parent-relative imports, and
 * circular self-imports. A higher-level resolver may compose it only through
 * persisted, final `__init__.py` re-export facts with dedicated safeguards.
 */
function resolvePythonRelativeModule(
  knownFilePaths: ReadonlySet<string>,
  fromFilePath: string,
  moduleSpecifier: string
): string | null {
  const normalizedFromPath = fromFilePath.replace(/\\/gu, "/");
  const match = /^\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/u.exec(
    moduleSpecifier
  );
  if (match?.[1] === undefined) {
    return null;
  }

  const packageParts = normalizedFromPath.split("/").slice(0, -1);
  if (packageParts.length === 0) {
    return null;
  }
  const moduleParts = match[1].split(".");
  const moduleBase = [...packageParts, ...moduleParts].join("/");
  const targetCandidates = [`${moduleBase}.py`, `${moduleBase}/__init__.py`].filter((candidate) =>
    knownFilePaths.has(candidate)
  );
  if (targetCandidates.length !== 1 || targetCandidates[0] === undefined) {
    return null;
  }
  const targetFilePath = targetCandidates[0];
  if (targetFilePath === normalizedFromPath) {
    return null;
  }

  const targetDirectoryParts = targetFilePath.split("/").slice(0, -1);
  if (
    targetDirectoryParts.length < packageParts.length ||
    packageParts.some((part, index) => targetDirectoryParts[index] !== part)
  ) {
    return null;
  }
  for (let length = packageParts.length; length <= targetDirectoryParts.length; length += 1) {
    const marker = `${targetDirectoryParts.slice(0, length).join("/")}/__init__.py`;
    if (!knownFilePaths.has(marker)) {
      return null;
    }
  }

  return targetFilePath;
}

/**
 * Resolves one static, absolute dotted Python module name against the project
 * source root. Every dotted package segment must have an `__init__.py` marker;
 * this intentionally excludes namespace packages, external imports, source-root
 * inference, ambiguous file/package targets, and recursive self-includes.
 */
function resolvePythonAbsoluteModule(
  knownFilePaths: ReadonlySet<string>,
  fromFilePath: string,
  moduleSpecifier: string
): string | null {
  const normalizedFromPath = fromFilePath.replace(/\\/gu, "/");
  const match = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/u.exec(moduleSpecifier);
  if (match?.[1] === undefined) {
    return null;
  }

  const moduleParts = match[1].split(".");
  const moduleBase = moduleParts.join("/");
  const targetCandidates = [`${moduleBase}.py`, `${moduleBase}/__init__.py`].filter((candidate) =>
    knownFilePaths.has(candidate)
  );
  if (targetCandidates.length !== 1 || targetCandidates[0] === undefined) {
    return null;
  }
  const targetFilePath = targetCandidates[0];
  if (targetFilePath === normalizedFromPath) {
    return null;
  }

  const expectedDirectoryParts = targetFilePath.endsWith("/__init__.py")
    ? moduleParts
    : moduleParts.slice(0, -1);
  const targetDirectoryParts = targetFilePath.split("/").slice(0, -1);
  if (
    targetDirectoryParts.length !== expectedDirectoryParts.length ||
    targetDirectoryParts.some((part, index) => part !== expectedDirectoryParts[index])
  ) {
    return null;
  }
  for (let length = 1; length <= expectedDirectoryParts.length; length += 1) {
    const marker = `${expectedDirectoryParts.slice(0, length).join("/")}/__init__.py`;
    if (!knownFilePaths.has(marker)) {
      return null;
    }
  }

  return targetFilePath;
}

function isStaticActixServiceConfigPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.includes("//") &&
    !value.includes("\\") &&
    (value === "/" || !value.endsWith("/"))
  );
}

function mountedActixServiceConfigRoutePath(prefix: string, routePath: string): string | null {
  if (!isStaticActixServiceConfigPath(prefix) || !isStaticActixServiceConfigPath(routePath)) {
    return null;
  }
  return prefix === "/" ? routePath : `${prefix}${routePath}`;
}

function isRustCrateRootFile(filePath: string): boolean {
  const fileName = filePath.split("/").at(-1);
  return fileName === "main.rs" || fileName === "lib.rs";
}

function isRustDirectExternalModuleName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value);
}

/** Returns the directory where one external child module of `filePath` lives. */
function rustExternalModuleChildDirectory(filePath: string): string | null {
  const normalizedFilePath = filePath.replace(/\\/gu, "/");
  const parts = normalizedFilePath.split("/");
  const fileName = parts.at(-1);
  if (fileName === undefined) {
    return null;
  }
  const directory = parts.slice(0, -1).join("/");
  if (isRustCrateRootFile(normalizedFilePath) || fileName === "mod.rs") {
    return directory;
  }
  if (!fileName.endsWith(".rs")) {
    return null;
  }
  const moduleName = fileName.slice(0, -".rs".length);
  if (!isRustDirectExternalModuleName(moduleName)) {
    return null;
  }
  return directory === "" ? moduleName : `${directory}/${moduleName}`;
}

/** Resolves one syntax-proven Rust external module from its declaring file. */
function resolveRustDirectExternalModule(
  knownFilePaths: ReadonlySet<string>,
  declaringFilePath: string,
  moduleName: string
): string | null {
  if (!isRustDirectExternalModuleName(moduleName)) {
    return null;
  }
  const normalizedDeclaringPath = declaringFilePath.replace(/\\/gu, "/");
  const directory = rustExternalModuleChildDirectory(normalizedDeclaringPath);
  if (directory === null) {
    return null;
  }
  const moduleBase = directory === "" ? moduleName : `${directory}/${moduleName}`;
  const candidates = [`${moduleBase}.rs`, `${moduleBase}/mod.rs`].filter((candidate) =>
    knownFilePaths.has(candidate)
  );
  if (
    candidates.length !== 1 ||
    candidates[0] === undefined ||
    candidates[0] === normalizedDeclaringPath
  ) {
    return null;
  }
  return candidates[0];
}

/**
 * Normalizes persisted v0.118 direct-module facts and accepts v0.119's one
 * nested direct module path. Any malformed persisted shape remains unresolved.
 */
function rustActixImportedServiceConfigModulePath(
  mount: RustActixImportedServiceConfigMountFact
): readonly string[] | null {
  const modulePath = mount.modulePath ?? [mount.moduleName];
  if (
    !Array.isArray(modulePath) ||
    (modulePath.length !== 1 && modulePath.length !== 2) ||
    modulePath[0] !== mount.moduleName ||
    modulePath.some((moduleName) => !isRustDirectExternalModuleName(moduleName))
  ) {
    return null;
  }
  return [...modulePath];
}

/**
 * Resolves every segment of a one- or two-module Actix configuration import.
 * Each hop needs both a direct `mod name;` fact and one physical Rust module
 * candidate, so re-exports and implicit filesystem matches cannot project a
 * route.
 */
function resolveRustDirectExternalModulePath(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly rootFilePath: string;
  readonly modulePath: readonly string[];
}): readonly string[] | null {
  const rootFilePath = input.rootFilePath.replace(/\\/gu, "/");
  if (!isRustCrateRootFile(rootFilePath)) {
    return null;
  }
  const resolutionPath = [rootFilePath];
  let declaringFilePath = rootFilePath;
  for (const moduleName of input.modulePath) {
    const declaringFacts = input.factsByFile.get(declaringFilePath)?.rustActixServiceConfigFacts;
    const directModuleFacts = declaringFacts?.externalModules.filter((module) => module.name === moduleName) ?? [];
    if (directModuleFacts.length !== 1) {
      return null;
    }
    const resolvedFilePath = resolveRustDirectExternalModule(
      input.knownFilePaths,
      declaringFilePath,
      moduleName
    );
    if (resolvedFilePath === null || resolutionPath.includes(resolvedFilePath)) {
      return null;
    }
    resolutionPath.push(resolvedFilePath);
    declaringFilePath = resolvedFilePath;
  }
  return resolutionPath;
}

interface ProjectedRustActixImportedServiceConfigRoute {
  readonly mountFilePath: string;
  readonly configurationFilePath: string;
  readonly mount: RustActixImportedServiceConfigMountFact;
  readonly modulePath: readonly string[];
  readonly importResolutionKind: "local-module" | "cargo-workspace-module";
  readonly configurationPaths: readonly string[];
  readonly resolutionPath: readonly string[];
  readonly configuration: RustActixServiceConfigDeclarationFact;
  readonly route: RustActixServiceConfigRouteFact;
  readonly callback: SymbolNode;
  readonly handler: SymbolNode;
  readonly path: string;
}

function compareProjectedRustActixImportedServiceConfigRoute(
  left: ProjectedRustActixImportedServiceConfigRoute,
  right: ProjectedRustActixImportedServiceConfigRoute
): number {
  return (
    compareStableText(left.mountFilePath, right.mountFilePath) ||
    left.mount.range.start.line - right.mount.range.start.line ||
    left.mount.range.start.column - right.mount.range.start.column ||
    compareStableText(left.configurationFilePath, right.configurationFilePath) ||
    left.configuration.range.start.line - right.configuration.range.start.line ||
    left.configuration.range.start.column - right.configuration.range.start.column ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.route.method, right.route.method) ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.handler.id, right.handler.id)
  );
}

function rustActixImportedServiceConfigRoot(input: {
  readonly mount: RustActixImportedServiceConfigMountFact;
  readonly mountFilePath: string;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly moduleResolver: ProjectModuleResolver | undefined;
}): {
  readonly rootFilePath: string;
  readonly configurationPaths: readonly string[];
  readonly importResolutionKind: "local-module" | "cargo-workspace-module";
} | null {
  if (
    input.mount.importRoot === undefined ||
    input.mount.importRoot === "crate" ||
    input.mount.importRoot === "self"
  ) {
    return input.mount.workspaceCrateName === undefined
      ? {
          rootFilePath: input.mountFilePath,
          configurationPaths: [],
          importResolutionKind: "local-module"
        }
      : null;
  }
  if (
    input.mount.importRoot !== "workspace" ||
    input.mount.workspaceCrateName === undefined ||
    !isRustDirectExternalModuleName(input.mount.workspaceCrateName) ||
    input.moduleResolver === undefined
  ) {
    return null;
  }
  const resolution = input.moduleResolver.resolve(input.mountFilePath, input.mount.workspaceCrateName);
  if (
    resolution.strategy !== "cargo-workspace-crate" ||
    resolution.targetFilePath === null ||
    !input.knownFilePaths.has(resolution.targetFilePath) ||
    !(
      resolution.targetFilePath === "src/lib.rs" ||
      resolution.targetFilePath.endsWith("/src/lib.rs")
    )
  ) {
    return null;
  }
  return {
    rootFilePath: resolution.targetFilePath,
    configurationPaths: resolution.configurationPaths,
    importResolutionKind: "cargo-workspace-module"
  };
}

function rustActixImportedServiceConfigRouteRuleId(
  kind: RustActixImportedServiceConfigMountFact["kind"],
  modulePath: readonly string[],
  importResolutionKind: "local-module" | "cargo-workspace-module"
): string {
  const moduleRule =
    importResolutionKind === "cargo-workspace-module"
      ? "cargo-workspace-module"
      : modulePath.length === 1
        ? "direct-module"
        : "direct-module-path";
  return kind === "app"
    ? `framework.actix-web.imported-service-config.app.configure.${moduleRule}.local-function`
    : `framework.actix-web.imported-service-config.web-scope.configure.${moduleRule}.local-function`;
}

interface RustActixImportedServiceConfigRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
  /** Raw attribute route symbols replaced by one proven ServiceConfig projection. */
  readonly suppressedRawRouteIds: readonly string[];
}

/**
 * Projects literal routes through an imported Actix Web `ServiceConfig` only
 * when every module hop is directly declared from a Rust crate root. Workspace
 * imports additionally require one Cargo workspace direct-path-dependency
 * proof. Callback and handler must resolve uniquely in the final module.
 */
function projectRustActixImportedServiceConfigRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly structuralEdges: readonly GraphEdge[];
  readonly moduleResolver: ProjectModuleResolver | undefined;
}): RustActixImportedServiceConfigRouteProjection {
  const candidates: ProjectedRustActixImportedServiceConfigRoute[] = [];

  for (const [mountFilePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const mountFacts = facts.rustActixServiceConfigFacts;
    if (mountFacts === undefined || !isRustCrateRootFile(mountFilePath)) {
      continue;
    }
    for (const mount of [...mountFacts.importedMounts].sort((left, right) => {
      return (
        left.range.start.line - right.range.start.line ||
        left.range.start.column - right.range.start.column ||
        compareStableText(left.moduleName, right.moduleName) ||
        compareStableText(left.configurationName, right.configurationName) ||
        compareStableText(left.prefix, right.prefix) ||
        compareStableText(left.kind, right.kind)
      );
    })) {
      const modulePath = rustActixImportedServiceConfigModulePath(mount);
      if (modulePath === null) {
        continue;
      }
      const importRoot = rustActixImportedServiceConfigRoot({
        mount,
        mountFilePath,
        knownFilePaths: input.knownFilePaths,
        moduleResolver: input.moduleResolver
      });
      if (importRoot === null) {
        continue;
      }
      const moduleResolutionPath = resolveRustDirectExternalModulePath({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        rootFilePath: importRoot.rootFilePath,
        modulePath
      });
      if (moduleResolutionPath === null) {
        continue;
      }
      const resolutionPath =
        importRoot.importResolutionKind === "cargo-workspace-module"
          ? [mountFilePath, ...moduleResolutionPath]
          : moduleResolutionPath;
      const configurationFilePath = resolutionPath.at(-1);
      if (configurationFilePath === undefined) {
        continue;
      }
      const configurationFileFacts = input.factsByFile.get(configurationFilePath);
      const configurationFacts = configurationFileFacts?.rustActixServiceConfigFacts;
      if (configurationFileFacts === undefined || configurationFacts === undefined) {
        continue;
      }
      const matchingConfigurations = configurationFacts.configurations.filter(
        (configuration) => configuration.name === mount.configurationName
      );
      if (matchingConfigurations.length !== 1 || matchingConfigurations[0] === undefined) {
        continue;
      }
      const configuration = matchingConfigurations[0];
      const callbacks = configurationFileFacts.symbols.filter(
        (symbol) =>
          symbol.kind === "function" &&
          symbol.filePath === configurationFilePath &&
          symbol.name === configuration.name &&
          symbol.isExported
      );
      if (callbacks.length !== 1 || callbacks[0] === undefined) {
        continue;
      }
      const callback = callbacks[0];
      if (
        callback.range.start.line !== configuration.range.start.line ||
        callback.range.start.column !== configuration.range.start.column ||
        callback.range.end.line !== configuration.range.end.line ||
        callback.range.end.column !== configuration.range.end.column
      ) {
        continue;
      }

      for (const route of configuration.routes) {
        const handlers = configurationFileFacts.symbols.filter(
          (symbol) =>
            symbol.kind === "function" &&
            symbol.filePath === configurationFilePath &&
            symbol.name === route.handlerName
        );
        if (handlers.length !== 1 || handlers[0] === undefined) {
          continue;
        }
        const path = mountedActixServiceConfigRoutePath(mount.prefix, route.path);
        if (path === null) {
          continue;
        }
        candidates.push({
          mountFilePath,
          configurationFilePath,
          mount,
          modulePath,
          importResolutionKind: importRoot.importResolutionKind,
          configurationPaths: importRoot.configurationPaths,
          resolutionPath,
          configuration,
          route,
          callback,
          handler: handlers[0],
          path
        });
      }
    }
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const suppressedRawRouteIds = new Set<string>();
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedRustActixImportedServiceConfigRoute)) {
    const dedupeKey = [
      candidate.mountFilePath,
      candidate.mount.range.start.line,
      candidate.mount.range.start.column,
      candidate.configurationFilePath,
      candidate.configuration.range.start.line,
      candidate.configuration.range.start.column,
      candidate.route.method,
      candidate.route.path,
      candidate.path,
      candidate.handler.id
    ].join("\u0000");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const file = input.fileSymbols.get(candidate.configurationFilePath);
    if (file === undefined) {
      continue;
    }
    const name = `${candidate.route.method} ${candidate.path}`;
    const qualifiedName = `${candidate.configurationFilePath}#route:${name}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.configurationFilePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.configurationFilePath,
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
      filePath: candidate.configurationFilePath,
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
      filePath: candidate.configurationFilePath,
      range: candidate.route.range,
      resolution: "exact",
      confidence: 1,
      referenceName: candidate.handler.name,
      evidence: referenceEvidence(
        rustActixImportedServiceConfigRouteRuleId(
          candidate.mount.kind,
          candidate.modulePath,
          candidate.importResolutionKind
        ),
        "module",
        [candidate.handler.id, candidate.callback.id],
        candidate.configurationPaths,
        candidate.resolutionPath
      )
    });

    if (!candidate.configuration.mountedAttributeHandlers.includes(candidate.route.handlerName)) {
      continue;
    }
    const rawRouteName = `${candidate.route.method} ${candidate.route.path}`;
    for (const edge of input.structuralEdges) {
      if (
        edge.kind !== "routes" ||
        edge.targetId !== candidate.handler.id ||
        edge.filePath !== candidate.configurationFilePath ||
        edge.evidence?.ruleId !== "framework.actix-web.attribute-route.literal-path.local-function"
      ) {
        continue;
      }
      const rawRoute = input.symbolsById.get(edge.sourceId);
      if (
        rawRoute?.kind === "route" &&
        rawRoute.filePath === candidate.configurationFilePath &&
        rawRoute.name === rawRouteName
      ) {
        suppressedRawRouteIds.add(rawRoute.id);
      }
    }
  }

  return {
    symbols,
    structuralEdges,
    suppressedRawRouteIds: [...suppressedRawRouteIds].sort(compareStableText)
  };
}

function goPackageDirectory(filePath: string): string {
  const separator = filePath.lastIndexOf("/");
  return separator === -1 ? "" : filePath.slice(0, separator);
}

function rustRangeText(sourceText: string, range: SourceRange): string | null {
  const lineStarts = [0];
  const lineEnds: number[] = [];
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText.charCodeAt(index);
    if (character === 13) {
      lineEnds.push(index);
      if (sourceText.charCodeAt(index + 1) === 10) {
        index += 1;
      }
      lineStarts.push(index + 1);
    } else if (character === 10) {
      lineEnds.push(index);
      lineStarts.push(index + 1);
    }
  }
  lineEnds.push(sourceText.length);
  const offsetFor = (line: number, column: number): number | null => {
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1) {
      return null;
    }
    const lineStart = lineStarts[line - 1];
    const lineEnd = lineEnds[line - 1];
    if (lineStart === undefined || lineEnd === undefined || column > lineEnd - lineStart + 1) {
      return null;
    }
    return lineStart + column - 1;
  };
  const start = offsetFor(range.start.line, range.start.column);
  const end = offsetFor(range.end.line, range.end.column);
  return start === null || end === null || end <= start ? null : sourceText.slice(start, end);
}

interface AdaSourceSlice {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface AdaRuntimePackageUnitFact {
  readonly role: "spec" | "body";
  readonly normalizedFullName: string;
  readonly symbolId: string;
  readonly filePath: string;
  readonly unitRange: SourceRange;
  readonly headerRange: SourceRange;
  readonly nameRange: SourceRange;
  readonly endRange: SourceRange;
}

const ADA_RESERVED_IDENTIFIERS = new Set([
  "abort", "abs", "abstract", "accept", "access", "aliased", "all", "and", "array", "at",
  "begin", "body", "case", "constant", "declare", "delay", "delta", "digits", "do", "else",
  "elsif", "end", "entry", "exception", "exit", "for", "function", "generic", "goto", "if", "in",
  "interface", "is", "limited", "loop", "mod", "new", "not", "null", "of", "or", "others", "out",
  "overriding", "package", "parallel", "pragma", "private", "procedure", "protected", "raise", "range",
  "record", "rem", "renames", "requeue", "return", "reverse", "select", "separate", "some", "subtype",
  "synchronized", "tagged", "task", "terminate", "then", "type", "until", "use", "when", "while",
  "with", "xor"
]);

function adaRuntimeRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function adaRuntimeSourceRange(value: unknown): value is SourceRange {
  if (!adaRuntimeRecord(value) || !adaRuntimeRecord(value.start) || !adaRuntimeRecord(value.end)) {
    return false;
  }
  return Number.isSafeInteger(value.start.line) &&
    (value.start.line as number) > 0 &&
    Number.isSafeInteger(value.start.column) &&
    (value.start.column as number) > 0 &&
    Number.isSafeInteger(value.end.line) &&
    (value.end.line as number) > 0 &&
    Number.isSafeInteger(value.end.column) &&
    (value.end.column as number) > 0;
}

function adaRuntimePackageUnitFact(value: unknown): value is AdaRuntimePackageUnitFact {
  return adaRuntimeRecord(value) &&
    (value.role === "spec" || value.role === "body") &&
    typeof value.normalizedFullName === "string" &&
    typeof value.symbolId === "string" &&
    typeof value.filePath === "string" &&
    adaRuntimeSourceRange(value.unitRange) &&
    adaRuntimeSourceRange(value.headerRange) &&
    adaRuntimeSourceRange(value.nameRange) &&
    adaRuntimeSourceRange(value.endRange);
}

function legalNormalizedAdaIdentifier(value: string): boolean {
  return /^[a-z](?:[a-z0-9]|_[a-z0-9])*$/u.test(value) && !ADA_RESERVED_IDENTIFIERS.has(value);
}

function adaSourceSlice(sourceText: string, range: SourceRange): AdaSourceSlice | null {
  const lineStarts = [0];
  const lineEnds: number[] = [];
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText.charCodeAt(index);
    if (character === 13) {
      lineEnds.push(index);
      if (sourceText.charCodeAt(index + 1) === 10) {
        index += 1;
      }
      lineStarts.push(index + 1);
    } else if (character === 10) {
      lineEnds.push(index);
      lineStarts.push(index + 1);
    }
  }
  lineEnds.push(sourceText.length);
  const offsetFor = (line: number, column: number): number | null => {
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1) {
      return null;
    }
    const lineStart = lineStarts[line - 1];
    const lineEnd = lineEnds[line - 1];
    if (lineStart === undefined || lineEnd === undefined || column > lineEnd - lineStart + 1) {
      return null;
    }
    return lineStart + column - 1;
  };
  const start = offsetFor(range.start.line, range.start.column);
  const end = offsetFor(range.end.line, range.end.column);
  return start === null || end === null || end <= start
    ? null
    : { text: sourceText.slice(start, end), start, end };
}

function sameSourceRange(left: SourceRange, right: SourceRange): boolean {
  return left.start.line === right.start.line &&
    left.start.column === right.start.column &&
    left.end.line === right.end.line &&
    left.end.column === right.end.column;
}

function projectAdaProjectFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly sourceDocumentsByPath: ReadonlyMap<string, SourceDocument>;
}): readonly GraphEdge[] {
  type ValidatedUnit = {
    readonly role: "spec" | "body";
    readonly normalizedFullName: string;
    readonly filePath: string;
    readonly symbol: SymbolNode;
    readonly nameRange: SourceRange;
  };
  const validatedUnits: ValidatedUnit[] = [];
  const seenFactSymbolIds = new Set<string>();
  const runtimeUnitsByFile = new Map<string, readonly AdaRuntimePackageUnitFact[] | undefined>();

  for (const [filePath, facts] of input.factsByFile) {
    const runtimeProjectFacts: unknown = facts.adaProjectFacts;
    if (runtimeProjectFacts === undefined) {
      runtimeUnitsByFile.set(filePath, undefined);
      continue;
    }
    if (
      !adaRuntimeRecord(runtimeProjectFacts) ||
      !Array.isArray(runtimeProjectFacts.packageUnits) ||
      !runtimeProjectFacts.packageUnits.every(adaRuntimePackageUnitFact)
    ) {
      return [];
    }
    runtimeUnitsByFile.set(filePath, runtimeProjectFacts.packageUnits);
  }

  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const document = input.sourceDocumentsByPath.get(filePath);
    const eligibleSymbols = facts.symbols.filter((symbol) =>
      symbol.kind === "module" &&
      symbol.filePath === filePath &&
      (symbol.qualifiedName === `${filePath}#package:${symbol.name}` ||
        symbol.qualifiedName === `${filePath}#package-body:${symbol.name}`)
    );
    const packageUnits = runtimeUnitsByFile.get(filePath);
    if (packageUnits === undefined) {
      if (eligibleSymbols.length > 0) {
        return [];
      }
      continue;
    }
    if (document?.language !== "ada") {
      return [];
    }

    for (const fact of packageUnits) {
      const symbol = input.symbolsById.get(fact.symbolId);
      const expectedQualifiedName = fact.role === "spec"
        ? `${filePath}#package:${symbol?.name ?? ""}`
        : `${filePath}#package-body:${symbol?.name ?? ""}`;
      const expectedExtension = fact.role === "spec" ? ".ads" : ".adb";
      const separator = filePath.lastIndexOf("/");
      const fileName = separator === -1 ? filePath : filePath.slice(separator + 1);
      const unitSlice = adaSourceSlice(document.sourceText, fact.unitRange);
      const headerSlice = adaSourceSlice(document.sourceText, fact.headerRange);
      const nameSlice = adaSourceSlice(document.sourceText, fact.nameRange);
      const endSlice = adaSourceSlice(document.sourceText, fact.endRange);
      const expectedHeader = fact.role === "spec"
        ? /^package\s+([A-Za-z][A-Za-z0-9_]*)\s+is$/iu
        : /^package\s+body\s+([A-Za-z][A-Za-z0-9_]*)\s+is$/iu;
      const headerMatch = headerSlice?.text.match(expectedHeader) ?? null;
      const headerName = headerMatch?.[1] ?? "";
      const headerNameOffset = headerSlice?.text.indexOf(headerName) ?? -1;
      const escapedEndName = fact.normalizedFullName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const unitEndMatch = unitSlice?.text.match(
        new RegExp(`end\\s+(${escapedEndName})\\s*;\\s*$`, "iu")
      ) ?? null;
      const unitEndName = unitEndMatch?.[1] ?? "";
      const unitEndOffset = unitEndMatch === null || unitSlice === null
        ? -1
        : unitSlice.text.lastIndexOf(unitEndName);
      if (
        symbol === undefined ||
        seenFactSymbolIds.has(fact.symbolId) ||
        fact.filePath !== filePath ||
        symbol.kind !== "module" ||
        typeof symbol.id !== "string" ||
        typeof symbol.name !== "string" ||
        typeof symbol.qualifiedName !== "string" ||
        typeof symbol.filePath !== "string" ||
        symbol.filePath !== filePath ||
        symbol.qualifiedName !== expectedQualifiedName ||
        symbol.declarationOrdinal !== 0 ||
        symbol.id !== createSymbolId({
          filePath,
          qualifiedName: expectedQualifiedName,
          kind: "module",
          declarationOrdinal: 0
        }) ||
        !adaRuntimeSourceRange(symbol.range) ||
        !sameSourceRange(symbol.range, fact.unitRange) ||
        fact.normalizedFullName !== fact.normalizedFullName.toLowerCase() ||
        !legalNormalizedAdaIdentifier(fact.normalizedFullName) ||
        symbol.name.toLowerCase() !== fact.normalizedFullName ||
        fileName !== `${fact.normalizedFullName}${expectedExtension}` ||
        unitSlice === null ||
        headerSlice === null ||
        nameSlice === null ||
        endSlice === null ||
        headerMatch === null ||
        (headerMatch[1] ?? "").toLowerCase() !== fact.normalizedFullName ||
        nameSlice.text.toLowerCase() !== fact.normalizedFullName ||
        endSlice.text.toLowerCase() !== fact.normalizedFullName ||
        headerNameOffset < 0 ||
        nameSlice.start !== headerSlice.start + headerNameOffset ||
        nameSlice.end !== nameSlice.start + headerName.length ||
        unitEndOffset < 0 ||
        endSlice.start !== unitSlice.start + unitEndOffset ||
        endSlice.end !== endSlice.start + unitEndName.length ||
        headerSlice.start < unitSlice.start ||
        headerSlice.end > unitSlice.end ||
        nameSlice.start < headerSlice.start ||
        nameSlice.end > headerSlice.end ||
        endSlice.start < headerSlice.end ||
        endSlice.end > unitSlice.end
      ) {
        return [];
      }
      seenFactSymbolIds.add(fact.symbolId);
      validatedUnits.push({
        role: fact.role,
        normalizedFullName: fact.normalizedFullName,
        filePath,
        symbol,
        nameRange: fact.nameRange
      });
    }

    if (
      eligibleSymbols.length !== packageUnits.length ||
      eligibleSymbols.some((symbol) => !seenFactSymbolIds.has(symbol.id))
    ) {
      return [];
    }
  }

  const edges: GraphEdge[] = [];
  const names = [...new Set(validatedUnits.map((unit) => unit.normalizedFullName))].sort(compareStableText);
  for (const normalizedFullName of names) {
    const matching = validatedUnits.filter((unit) => unit.normalizedFullName === normalizedFullName);
    const specifications = matching.filter((unit) => unit.role === "spec");
    const bodies = matching.filter((unit) => unit.role === "body");
    if (specifications.length !== 1 || bodies.length !== 1) {
      continue;
    }
    const specification = specifications[0]!;
    const body = bodies[0]!;
    const directory = (filePath: string): string => {
      const separator = filePath.lastIndexOf("/");
      return separator === -1 ? "" : filePath.slice(0, separator);
    };
    if (body.filePath === specification.filePath || directory(body.filePath) !== directory(specification.filePath)) {
      continue;
    }
    edges.push({
      id: createEdgeId({
        sourceId: body.symbol.id,
        targetId: specification.symbol.id,
        kind: "references",
        line: body.nameRange.start.line,
        column: body.nameRange.start.column,
        referenceName: body.symbol.name
      }),
      sourceId: body.symbol.id,
      targetId: specification.symbol.id,
      kind: "references",
      filePath: body.filePath,
      range: body.nameRange,
      resolution: "exact",
      confidence: 1,
      referenceName: body.symbol.name,
      evidence: referenceEvidence(
        "project.ada.root-library-package-body.unique-specification",
        "module",
        [specification.symbol.id],
        [],
        [body.filePath, specification.filePath]
      )
    });
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

function rustDirectProjectModuleText(name: string): RegExp {
  return new RegExp(`^(?:pub(?:\\([^)]*\\))?\\s+)?mod\\s+${name};$`, "u");
}

function rustProjectPhysicalModulePath(
  knownFilePaths: ReadonlySet<string>,
  moduleName: string
): string | null {
  if (!isRustDirectExternalModuleName(moduleName)) {
    return null;
  }
  const candidates = [`src/${moduleName}.rs`, `src/${moduleName}/mod.rs`].filter((path) =>
    knownFilePaths.has(path)
  );
  return candidates.length === 1 && candidates[0] !== undefined ? candidates[0] : null;
}

/**
 * Resolves a deliberately tiny Rust crate surface: one root-declared child
 * module importing one public declaration from another root-declared child.
 * Cargo metadata, nested module paths, aliases, re-exports, and binary or
 * workspace layouts remain outside this exact projection.
 */
function projectRustProjectFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly sourceDocumentsByPath: ReadonlyMap<string, SourceDocument>;
}): readonly GraphEdge[] {
  const rootCandidates = ["src/lib.rs", "src/main.rs"].filter((path) => input.knownFilePaths.has(path));
  if (rootCandidates.length !== 1 || rootCandidates[0] === undefined) {
    return [];
  }
  const rootFilePath = rootCandidates[0];
  if (
    [...input.knownFilePaths].some((path) =>
      path.startsWith("src/bin/") ||
      (path !== rootFilePath && /(?:^|\/)src\/(?:lib|main)\.rs$/u.test(path))
    )
  ) {
    return [];
  }
  const rootFacts = input.factsByFile.get(rootFilePath)?.rustProjectFacts;
  const rootDocument = input.sourceDocumentsByPath.get(rootFilePath);
  if (rootFacts === undefined || rootDocument === undefined) {
    return [];
  }
  const validRootModules = rootFacts.modules.filter((module) =>
    module.unconditionallyAvailable &&
    module.filePath === rootFilePath &&
    isRustDirectExternalModuleName(module.name) &&
    rustRangeText(rootDocument.sourceText, module.range) !== null &&
    rustDirectProjectModuleText(module.name).test(
      (rustRangeText(rootDocument.sourceText, module.range) ?? "").trim()
    )
  );
  if (validRootModules.length !== rootFacts.modules.length) {
    return [];
  }

  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();
  const crateFilePaths = new Set<string>([rootFilePath]);
  for (const module of validRootModules) {
    const moduleFilePath = rustProjectPhysicalModulePath(input.knownFilePaths, module.name);
    if (moduleFilePath !== null) {
      crateFilePaths.add(moduleFilePath);
    }
  }
  const typesByName = new Map<
    string,
    Array<{
      readonly filePath: string;
      readonly symbolId: string;
      readonly typeKind: "struct" | "enum" | "trait";
      readonly variantNames: readonly string[];
      readonly unconditionallyAvailable: boolean;
      readonly isExported: boolean;
    }>
  >();
  const inherentMethodsByTypeAndName = new Map<
    string,
    Array<{
      readonly filePath: string;
      readonly symbolId: string;
      readonly callKind: "method" | "associated-function";
      readonly unconditionallyAvailable: boolean;
      readonly isExported: boolean;
    }>
  >();
  const typeKey = (typeName: string): string => typeName;
  const methodKey = (typeName: string, methodName: string, callKind: string): string =>
    `${typeName}\u0000${methodName}\u0000${callKind}`;
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    if (!crateFilePaths.has(filePath)) {
      continue;
    }
    const rustFacts = facts.rustProjectFacts;
    if (rustFacts === undefined) {
      continue;
    }
    for (const typeFact of rustFacts.types ?? []) {
      const symbol = input.symbolsById.get(typeFact.symbolId);
      if (
        typeFact.filePath !== filePath ||
        symbol === undefined ||
        symbol.kind !== "type" ||
        symbol.filePath !== filePath ||
        symbol.name !== typeFact.name
      ) {
        continue;
      }
      const candidates = typesByName.get(typeKey(typeFact.name)) ?? [];
      candidates.push({
        filePath,
        symbolId: symbol.id,
        typeKind: typeFact.typeKind,
        variantNames: typeFact.variantNames ?? [],
        unconditionallyAvailable: typeFact.unconditionallyAvailable,
        isExported: symbol.isExported
      });
      typesByName.set(typeKey(typeFact.name), candidates);
    }
    for (const methodFact of rustFacts.methods ?? []) {
      const symbol = input.symbolsById.get(methodFact.symbolId);
      if (
        methodFact.filePath !== filePath ||
        symbol === undefined ||
        symbol.kind !== "method" ||
        symbol.filePath !== filePath ||
        symbol.name !== methodFact.name
      ) {
        continue;
      }
      if (methodFact.traitName !== undefined) {
        continue;
      }
      const candidates = inherentMethodsByTypeAndName.get(
        methodKey(methodFact.receiverTypeName, methodFact.name, methodFact.callKind)
      ) ?? [];
      candidates.push({
        filePath,
        symbolId: symbol.id,
        callKind: methodFact.callKind,
        unconditionallyAvailable: methodFact.unconditionallyAvailable,
        isExported: symbol.isExported
      });
      inherentMethodsByTypeAndName.set(
        methodKey(methodFact.receiverTypeName, methodFact.name, methodFact.callKind),
        candidates
      );
    }
  }
  for (const candidates of typesByName.values()) {
    candidates.sort((left, right) => compareStableText(left.filePath, right.filePath) || compareStableText(left.symbolId, right.symbolId));
  }
  for (const candidates of inherentMethodsByTypeAndName.values()) {
    candidates.sort((left, right) => compareStableText(left.filePath, right.filePath) || compareStableText(left.symbolId, right.symbolId));
  }

  const pushExactRustEdge = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    if (!crateFilePaths.has(filePath) || facts.rustProjectFacts === undefined) {
      continue;
    }
    for (const implementation of facts.rustProjectFacts.impls ?? []) {
      if (implementation.filePath !== filePath || implementation.traitName === undefined) {
        continue;
      }
      const selfTypes = typesByName.get(typeKey(implementation.selfTypeName)) ?? [];
      const traits = typesByName.get(typeKey(implementation.traitName)) ?? [];
      if (
        selfTypes.length !== 1 ||
        traits.length !== 1 ||
        selfTypes[0] === undefined ||
        traits[0] === undefined ||
        selfTypes[0].typeKind === "trait" ||
        traits[0].typeKind !== "trait" ||
        !selfTypes[0].unconditionallyAvailable ||
        !traits[0].unconditionallyAvailable ||
        !implementation.unconditionallyAvailable
      ) {
        continue;
      }
      const source = input.symbolsById.get(selfTypes[0].symbolId);
      const target = input.symbolsById.get(traits[0].symbolId);
      if (source === undefined || target === undefined || source.filePath === target.filePath) {
        continue;
      }
      pushExactRustEdge({
        id: createEdgeId({
          sourceId: source.id,
          targetId: target.id,
          kind: "implements",
          line: implementation.range.start.line,
          column: implementation.range.start.column,
          referenceName: implementation.traitName
        }),
        sourceId: source.id,
        targetId: target.id,
        kind: "implements",
        filePath,
        range: implementation.range,
        resolution: "exact",
        confidence: 1,
        referenceName: implementation.traitName,
        evidence: referenceEvidence(
          "project.rust.impl.unique-trait",
          "module",
          [target.id],
          [],
          [filePath, source.filePath, target.filePath]
        )
      });
    }
    for (const call of facts.rustProjectFacts.methodCalls ?? []) {
      const caller = input.symbolsById.get(call.callerId);
      const typeCandidates = typesByName.get(typeKey(call.receiverTypeName)) ?? [];
      const methodCandidates = inherentMethodsByTypeAndName.get(
        methodKey(call.receiverTypeName, call.methodName, call.callKind)
      ) ?? [];
      if (
        caller === undefined ||
        caller.filePath !== filePath ||
        (caller.kind !== "function" && caller.kind !== "method") ||
        typeCandidates.length !== 1 ||
        typeCandidates[0] === undefined ||
        typeCandidates[0].typeKind === "trait" ||
        !typeCandidates[0].unconditionallyAvailable ||
        !typeCandidates[0].isExported ||
        methodCandidates.length !== 1 ||
        methodCandidates[0] === undefined ||
        !methodCandidates[0].unconditionallyAvailable ||
        !methodCandidates[0].isExported
      ) {
        continue;
      }
      if (methodCandidates[0].filePath === filePath) {
        continue;
      }
      const target = input.symbolsById.get(methodCandidates[0].symbolId);
      if (target === undefined || target.filePath !== methodCandidates[0].filePath || target.kind !== "method") {
        continue;
      }
      pushExactRustEdge({
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
          call.callKind === "associated-function"
            ? "project.rust.impl.unique-inherent-associated-function-call"
            : "project.rust.impl.unique-inherent-method-call",
          target.filePath === filePath ? "syntax" : "module",
          [target.id],
          [],
          target.filePath === filePath ? [] : [filePath, target.filePath]
        )
      });
    }
    for (const instantiation of facts.rustProjectFacts.instantiations ?? []) {
      const caller = input.symbolsById.get(instantiation.callerId);
      const candidates = typesByName.get(typeKey(instantiation.typeName)) ?? [];
      if (
        caller === undefined ||
        caller.filePath !== filePath ||
        (caller.kind !== "function" && caller.kind !== "method") ||
        candidates.length !== 1 ||
        candidates[0] === undefined ||
        !candidates[0].unconditionallyAvailable ||
        !candidates[0].isExported ||
        (instantiation.instantiationKind === "struct" && candidates[0].typeKind !== "struct") ||
        (instantiation.instantiationKind === "enum" &&
          (candidates[0].typeKind !== "enum" ||
            instantiation.variantName === undefined ||
            !candidates[0].variantNames.includes(instantiation.variantName)))
      ) {
        continue;
      }
      if (candidates[0].filePath === filePath) {
        continue;
      }
      const target = input.symbolsById.get(candidates[0].symbolId);
      if (target === undefined || target.filePath !== candidates[0].filePath || target.kind !== "type") {
        continue;
      }
      pushExactRustEdge({
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
          "project.rust.type.unique-construction",
          target.filePath === filePath ? "syntax" : "module",
          [target.id],
          [],
          target.filePath === filePath ? [] : [filePath, target.filePath]
        )
      });
    }
  }
  for (const [sourceFilePath, sourceFacts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const sourceProjectFacts = sourceFacts.rustProjectFacts;
    const sourceFile = input.fileSymbols.get(sourceFilePath);
    const sourceDocument = input.sourceDocumentsByPath.get(sourceFilePath);
    if (sourceProjectFacts === undefined || sourceFile === undefined || sourceDocument === undefined) {
      continue;
    }
    const sourceModuleFacts = validRootModules.filter((module) =>
      rustProjectPhysicalModulePath(input.knownFilePaths, module.name) === sourceFilePath
    );
    if (sourceModuleFacts.length !== 1 || sourceModuleFacts[0] === undefined) {
      continue;
    }
    const sourceModule = sourceModuleFacts[0];
    if (validRootModules.filter((module) => module.name === sourceModule.name).length !== 1) {
      continue;
    }

    for (const imported of sourceProjectFacts.imports) {
      const matchingImports = sourceProjectFacts.imports.filter(
        (candidate) =>
          candidate.modulePath.length === imported.modulePath.length &&
          candidate.modulePath.every((segment, index) => segment === imported.modulePath[index]) &&
          candidate.importedName === imported.importedName
      );
      const importText = rustRangeText(sourceDocument.sourceText, imported.range);
      if (
        matchingImports.length !== 1 ||
        !imported.unconditionallyAvailable ||
        imported.modulePath.length !== 1 ||
        !isRustDirectExternalModuleName(imported.modulePath[0] ?? "") ||
        !isRustDirectExternalModuleName(imported.importedName) ||
        importText === null ||
        importText.trim() !== `use crate::${imported.modulePath[0]}::${imported.importedName};`
      ) {
        continue;
      }
      const targetModuleName = imported.modulePath[0];
      if (targetModuleName === undefined || targetModuleName === sourceModule.name) {
        continue;
      }
      const targetModuleFacts = validRootModules.filter((module) => module.name === targetModuleName);
      const targetFilePath = rustProjectPhysicalModulePath(input.knownFilePaths, targetModuleName);
      if (targetModuleFacts.length !== 1 || targetFilePath === null) {
        continue;
      }
      const targetFacts = input.factsByFile.get(targetFilePath)?.rustProjectFacts;
      const targetFile = input.fileSymbols.get(targetFilePath);
      const targetDocument = input.sourceDocumentsByPath.get(targetFilePath);
      if (targetFacts === undefined || targetFile === undefined || targetDocument === undefined) {
        continue;
      }
      const declarations = targetFacts.declarations.filter((declaration) => {
        const symbol = input.symbolsById.get(declaration.symbolId);
        const declarationText = rustRangeText(targetDocument.sourceText, declaration.range)?.trim();
        const expectedPrefix = declaration.kind === "function"
          ? "pub fn "
          : `pub ${declaration.typeKind ?? "enum"} `;
        return declaration.unconditionallyAvailable &&
          declaration.name === imported.importedName &&
          declaration.filePath === targetFilePath &&
          symbol !== undefined &&
          symbol.kind === declaration.kind &&
          symbol.filePath === targetFilePath &&
          symbol.name === declaration.name &&
          symbol.range.start.line === declaration.range.start.line &&
          symbol.range.start.column === declaration.range.start.column &&
          symbol.range.end.line === declaration.range.end.line &&
          symbol.range.end.column === declaration.range.end.column &&
          declarationText !== undefined &&
          declarationText.startsWith(`${expectedPrefix}${declaration.name}`);
      });
      if (declarations.length !== 1) {
        continue;
      }
      edges.push({
        id: createEdgeId({
          sourceId: sourceFile.id,
          targetId: targetFile.id,
          kind: "imports",
          line: imported.range.start.line,
          column: imported.range.start.column,
          referenceName: `crate::${targetModuleName}::${imported.importedName}`
        }),
        sourceId: sourceFile.id,
        targetId: targetFile.id,
        kind: "imports",
        filePath: sourceFilePath,
        range: imported.range,
        resolution: "exact",
        confidence: 1,
        referenceName: `crate::${targetModuleName}::${imported.importedName}`,
        evidence: referenceEvidence(
          "project.rust.crate.direct-module.named-import-file",
          "module",
          [targetFile.id],
          [],
          [sourceFilePath, rootFilePath, targetFilePath]
        )
      });
    }
  }
  return edges;
}

/**
 * Projects only same-file Rust method, associated-function, construction,
 * and trait-implementation facts. These relations do not need crate-root
 * module ownership proof because both endpoints are syntax-owned by one
 * artifact; cross-file projection remains guarded by projectRustProjectFacts.
 */
function projectRustLocalFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();
  const typesByFileAndName = new Map<
    string,
    Array<{
      readonly symbolId: string;
      readonly typeKind: "struct" | "enum" | "trait";
      readonly variantNames: readonly string[];
      readonly unconditionallyAvailable: boolean;
    }>
  >();
  const methodsByFileTypeAndName = new Map<
    string,
    Array<{
      readonly symbolId: string;
      readonly callKind: "method" | "associated-function";
      readonly unconditionallyAvailable: boolean;
    }>
  >();
  const typeKey = (filePath: string, typeName: string): string => `${filePath}\u0000${typeName}`;
  const methodKey = (filePath: string, typeName: string, name: string, callKind: string): string =>
    `${filePath}\u0000${typeName}\u0000${name}\u0000${callKind}`;
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const rustFacts = facts.rustProjectFacts;
    if (rustFacts === undefined) {
      continue;
    }
    for (const typeFact of rustFacts.types ?? []) {
      const symbol = input.symbolsById.get(typeFact.symbolId);
      if (
        typeFact.filePath !== filePath ||
        symbol === undefined ||
        symbol.kind !== "type" ||
        symbol.filePath !== filePath ||
        symbol.name !== typeFact.name
      ) {
        continue;
      }
      const candidates = typesByFileAndName.get(typeKey(filePath, typeFact.name)) ?? [];
      candidates.push({
        symbolId: symbol.id,
        typeKind: typeFact.typeKind,
        variantNames: typeFact.variantNames ?? [],
        unconditionallyAvailable: typeFact.unconditionallyAvailable
      });
      typesByFileAndName.set(typeKey(filePath, typeFact.name), candidates);
    }
    for (const methodFact of rustFacts.methods ?? []) {
      const symbol = input.symbolsById.get(methodFact.symbolId);
      if (
        methodFact.filePath !== filePath ||
        methodFact.traitName !== undefined ||
        symbol === undefined ||
        symbol.kind !== "method" ||
        symbol.filePath !== filePath ||
        symbol.name !== methodFact.name
      ) {
        continue;
      }
      const candidates = methodsByFileTypeAndName.get(
        methodKey(filePath, methodFact.receiverTypeName, methodFact.name, methodFact.callKind)
      ) ?? [];
      candidates.push({
        symbolId: symbol.id,
        callKind: methodFact.callKind,
        unconditionallyAvailable: methodFact.unconditionallyAvailable
      });
      methodsByFileTypeAndName.set(
        methodKey(filePath, methodFact.receiverTypeName, methodFact.name, methodFact.callKind),
        candidates
      );
    }
  }
  for (const candidates of typesByFileAndName.values()) {
    candidates.sort((left, right) => compareStableText(left.symbolId, right.symbolId));
  }
  for (const candidates of methodsByFileTypeAndName.values()) {
    candidates.sort((left, right) => compareStableText(left.symbolId, right.symbolId));
  }
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const rustFacts = facts.rustProjectFacts;
    if (rustFacts === undefined) {
      continue;
    }
    for (const implementation of rustFacts.impls ?? []) {
      if (implementation.filePath !== filePath || implementation.traitName === undefined) {
        continue;
      }
      const selfTypes = typesByFileAndName.get(typeKey(filePath, implementation.selfTypeName)) ?? [];
      const traits = typesByFileAndName.get(typeKey(filePath, implementation.traitName)) ?? [];
      if (
        selfTypes.length !== 1 ||
        traits.length !== 1 ||
        selfTypes[0] === undefined ||
        traits[0] === undefined ||
        selfTypes[0].typeKind === "trait" ||
        traits[0].typeKind !== "trait" ||
        !selfTypes[0].unconditionallyAvailable ||
        !traits[0].unconditionallyAvailable ||
        !implementation.unconditionallyAvailable
      ) {
        continue;
      }
      const source = input.symbolsById.get(selfTypes[0].symbolId);
      const target = input.symbolsById.get(traits[0].symbolId);
      if (source === undefined || target === undefined) {
        continue;
      }
      push({
        id: createEdgeId({
          sourceId: source.id,
          targetId: target.id,
          kind: "implements",
          line: implementation.range.start.line,
          column: implementation.range.start.column,
          referenceName: implementation.traitName
        }),
        sourceId: source.id,
        targetId: target.id,
        kind: "implements",
        filePath,
        range: implementation.range,
        resolution: "exact",
        confidence: 1,
        referenceName: implementation.traitName,
        evidence: referenceEvidence(
          "project.rust.impl.unique-trait",
          "syntax",
          [target.id],
          [],
          []
        )
      });
    }
    for (const call of rustFacts.methodCalls ?? []) {
      const caller = input.symbolsById.get(call.callerId);
      const typeCandidates = typesByFileAndName.get(typeKey(filePath, call.receiverTypeName)) ?? [];
      const methodCandidates = methodsByFileTypeAndName.get(
        methodKey(filePath, call.receiverTypeName, call.methodName, call.callKind)
      ) ?? [];
      if (
        caller === undefined ||
        caller.filePath !== filePath ||
        (caller.kind !== "function" && caller.kind !== "method") ||
        typeCandidates.length !== 1 ||
        typeCandidates[0] === undefined ||
        typeCandidates[0].typeKind === "trait" ||
        !typeCandidates[0].unconditionallyAvailable ||
        methodCandidates.length !== 1 ||
        methodCandidates[0] === undefined ||
        !methodCandidates[0].unconditionallyAvailable
      ) {
        continue;
      }
      const target = input.symbolsById.get(methodCandidates[0].symbolId);
      if (target === undefined || target.filePath !== filePath || target.kind !== "method") {
        continue;
      }
      push({
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
          call.callKind === "associated-function"
            ? "project.rust.impl.unique-inherent-associated-function-call"
            : "project.rust.impl.unique-inherent-method-call",
          "syntax",
          [target.id],
          [],
          []
        )
      });
    }
    for (const instantiation of rustFacts.instantiations ?? []) {
      const caller = input.symbolsById.get(instantiation.callerId);
      const candidates = typesByFileAndName.get(typeKey(filePath, instantiation.typeName)) ?? [];
      if (
        caller === undefined ||
        caller.filePath !== filePath ||
        (caller.kind !== "function" && caller.kind !== "method") ||
        candidates.length !== 1 ||
        candidates[0] === undefined ||
        !candidates[0].unconditionallyAvailable ||
        (instantiation.instantiationKind === "struct" && candidates[0].typeKind !== "struct") ||
        (instantiation.instantiationKind === "enum" &&
          (candidates[0].typeKind !== "enum" ||
            instantiation.variantName === undefined ||
            !candidates[0].variantNames.includes(instantiation.variantName)))
      ) {
        continue;
      }
      const target = input.symbolsById.get(candidates[0].symbolId);
      if (target === undefined || target.filePath !== filePath || target.kind !== "type") {
        continue;
      }
      push({
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
          "project.rust.type.unique-construction",
          "syntax",
          [target.id],
          [],
          []
        )
      });
    }
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

/**
 * Projects only the small Go surface already retained by goProjectFacts: a
 * bare call may cross files only within one exact package directory, and an
 * import may target only the deterministic representative returned by the
 * root go.mod resolver.  It intentionally does not infer package names from
 * paths, select between duplicate declarations, or cross build constraints.
 */
function projectGoProjectFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly moduleResolver: ProjectModuleResolver | undefined;
}): readonly GraphEdge[] {
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
        candidates[0].filePath === filePath ||
        !candidates[0].unconditionallyAvailable
      ) {
        continue;
      }
      const target = input.symbolsById.get(candidates[0].symbolId);
      if (target === undefined || target.filePath !== candidates[0].filePath) {
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
function projectGoFrameStandardRouterRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly moduleResolver: ProjectModuleResolver | undefined;
}): GoFrameStandardRouterRouteProjection {
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

interface ResolvedFastApiRouterTarget {
  readonly filePath: string;
  readonly router: FastApiRouterDeclarationFact;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function directFastApiRouterTargets(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly filePath: string;
  readonly name: string;
}): readonly ResolvedFastApiRouterTarget[] {
  const facts = input.factsByFile.get(input.filePath)?.fastApiRouterFacts;
  if (facts === undefined) {
    return [];
  }
  return facts.routers
    .filter((router) => router.name === input.name)
    .map((router) => ({
      filePath: input.filePath,
      router,
      resolutionPath: [input.filePath],
      reExported: false,
      absoluteReExported: false
    }));
}

/**
 * Resolves a direct FastAPI router or one final `__init__.py` re-export chain.
 * Every hop is a persisted single-name relative or project-absolute import,
 * and a cycle or any competing local/exported binding remains unresolved.
 */
function resolveExactFastApiRouterTarget(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly filePath: string;
  readonly name: string;
  readonly visited?: ReadonlySet<string>;
}): ResolvedFastApiRouterTarget | null {
  const targetKey = `${input.filePath}\u0000${input.name}`;
  const visited = input.visited ?? new Set<string>();
  if (visited.has(targetKey)) {
    return null;
  }
  const facts = input.factsByFile.get(input.filePath)?.fastApiRouterFacts;
  if (facts === undefined) {
    return null;
  }
  const directTargets = directFastApiRouterTargets(input);
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
  const targetFilePath = resolveFastApiRouterModule({
    knownFilePaths: input.knownFilePaths,
    fromFilePath: input.filePath,
    moduleSpecifier: reExport.moduleSpecifier,
    moduleSpecifierKind: reExport.moduleSpecifierKind
  });
  if (targetFilePath === null) {
    return null;
  }
  const nestedVisited = new Set(visited);
  nestedVisited.add(targetKey);
  const target = resolveExactFastApiRouterTarget({
    factsByFile: input.factsByFile,
    knownFilePaths: input.knownFilePaths,
    filePath: targetFilePath,
    name: reExport.importedRouterName,
    visited: nestedVisited
  });
  return target === null
    ? null
    : {
        ...target,
        resolutionPath: compactPythonModuleResolutionPath([
          input.filePath,
          ...target.resolutionPath
        ]),
        reExported: true,
        absoluteReExported:
          target.absoluteReExported || reExport.moduleSpecifierKind === "absolute"
      };
}

/**
 * Resolves the deliberately narrow FastAPI APIRouter module-reference forms.
 * Earlier persisted facts predate `moduleSpecifierKind`, and therefore retain
 * their original package-relative meaning.
 */
function resolveFastApiRouterModule(input: {
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fromFilePath: string;
  readonly moduleSpecifier: string;
  readonly moduleSpecifierKind: "relative" | "absolute" | undefined;
}): string | null {
  switch (input.moduleSpecifierKind) {
    case undefined:
    case "relative":
      return resolvePythonRelativeModule(
        input.knownFilePaths,
        input.fromFilePath,
        input.moduleSpecifier
      );
    case "absolute":
      return resolvePythonAbsoluteModule(
        input.knownFilePaths,
        input.fromFilePath,
        input.moduleSpecifier
      );
    default:
      return null;
  }
}

function fastApiImportedRouterRulePrefix(input: {
  readonly inclusion: FastApiImportedRouterInclusionFact;
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}): string {
  if (input.inclusion.moduleSpecifierKind === "absolute") {
    return input.reExported
      ? "framework.fastapi.project-absolute-reexported-router"
      : "framework.fastapi.project-absolute-router";
  }
  if (input.reExported) {
    return input.absoluteReExported
      ? "framework.fastapi.reexported-absolute-router"
      : "framework.fastapi.reexported-router";
  }
  return "framework.fastapi.imported-router";
}

interface ProjectedFastApiImportedRouterRoute {
  readonly inclusionFilePath: string;
  readonly routerFilePath: string;
  readonly inclusion: FastApiImportedRouterInclusionFact;
  readonly route: FastApiRouterRouteFact;
  readonly handler: SymbolNode;
  readonly path: string;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function compareProjectedFastApiImportedRouterRoute(
  left: ProjectedFastApiImportedRouterRoute,
  right: ProjectedFastApiImportedRouterRoute
): number {
  return (
    compareStableText(left.inclusionFilePath, right.inclusionFilePath) ||
    left.inclusion.range.start.line - right.inclusion.range.start.line ||
    left.inclusion.range.start.column - right.inclusion.range.start.column ||
    compareStableText(left.routerFilePath, right.routerFilePath) ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.route.method, right.route.method) ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.handler.id, right.handler.id)
  );
}

interface FastApiImportedRouterRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
}

/**
 * Projects literal handler routes declared on an imported FastAPI router.
 * A final package initializer re-export chain is accepted only when every hop
 * has exact persisted evidence. Stored route evidence names every resolved
 * module so a route remains auditable after indexing.
 */
function projectFastApiImportedRouterRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): FastApiImportedRouterRouteProjection {
  const candidates: ProjectedFastApiImportedRouterRoute[] = [];

  for (const [inclusionFilePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const inclusionFacts = facts.fastApiRouterFacts;
    if (inclusionFacts === undefined) {
      continue;
    }

    for (const inclusion of inclusionFacts.importedRouterInclusions) {
      const importedRouterFilePath = resolveFastApiRouterModule({
        knownFilePaths: input.knownFilePaths,
        fromFilePath: inclusionFilePath,
        moduleSpecifier: inclusion.moduleSpecifier,
        moduleSpecifierKind: inclusion.moduleSpecifierKind
      });
      if (importedRouterFilePath === null) {
        continue;
      }
      const target = resolveExactFastApiRouterTarget({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        filePath: importedRouterFilePath,
        name: inclusion.importedRouterName
      });
      if (target === null) {
        continue;
      }
      const routerFilePath = target.filePath;
      const routerFacts = input.factsByFile.get(routerFilePath)?.fastApiRouterFacts;
      if (routerFacts === undefined) {
        continue;
      }
      const router = target.router;

      for (const route of routerFacts.routes) {
        if (route.routerName !== router.name) {
          continue;
        }
        const handler = input.symbolsById.get(route.handlerId);
        if (handler?.kind !== "function" || handler.filePath !== routerFilePath) {
          continue;
        }
        const path = mountedPythonRoutePath(inclusion.prefix, router.prefix, route.path);
        if (path === null) {
          continue;
        }
        candidates.push({
          inclusionFilePath,
          routerFilePath,
          inclusion,
          route,
          handler,
          path,
          resolutionPath: target.resolutionPath,
          reExported: target.reExported,
          absoluteReExported: target.absoluteReExported
        });
      }
    }
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedFastApiImportedRouterRoute)) {
    const dedupeKey = [
      candidate.inclusionFilePath,
      candidate.inclusion.range.start.line,
      candidate.inclusion.range.start.column,
      candidate.routerFilePath,
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

    const file = input.fileSymbols.get(candidate.routerFilePath);
    if (file === undefined) {
      continue;
    }
    const name = `${candidate.route.method} ${candidate.path}`;
    const qualifiedName = `${candidate.routerFilePath}#route:${name}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.routerFilePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.routerFilePath,
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
      filePath: candidate.routerFilePath,
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
      filePath: candidate.routerFilePath,
      range: candidate.route.range,
      resolution: "exact",
      confidence: 1,
      referenceName: candidate.handler.name,
      evidence: referenceEvidence(
        `${fastApiImportedRouterRulePrefix({
          inclusion: candidate.inclusion,
          reExported: candidate.reExported,
          absoluteReExported: candidate.absoluteReExported
        })}.include-router.decorator.local-function`,
        "module",
        [candidate.handler.id],
        [],
        [candidate.inclusionFilePath, ...candidate.resolutionPath]
      )
    });
  }

  return { symbols, structuralEdges };
}

interface ResolvedDjangoNinjaRouterTarget {
  readonly filePath: string;
  readonly router: DjangoNinjaRouterDeclarationFact;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function directDjangoNinjaRouterTargets(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly filePath: string;
  readonly name: string;
}): readonly ResolvedDjangoNinjaRouterTarget[] {
  const facts = input.factsByFile.get(input.filePath)?.djangoNinjaRouterFacts;
  if (facts === undefined) {
    return [];
  }
  return facts.routers
    .filter((router) => router.name === input.name)
    .map((router) => ({
      filePath: input.filePath,
      router,
      resolutionPath: [input.filePath],
      reExported: false,
      absoluteReExported: false
    }));
}

/**
 * Resolves a direct Django Ninja Router or one final `__init__.py` re-export
 * chain. Every hop is a persisted single-name relative or project-absolute
 * import, and a cycle or competing local/exported binding remains unresolved.
 */
function resolveExactDjangoNinjaRouterTarget(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly filePath: string;
  readonly name: string;
  readonly visited?: ReadonlySet<string>;
}): ResolvedDjangoNinjaRouterTarget | null {
  const targetKey = `${input.filePath}\u0000${input.name}`;
  const visited = input.visited ?? new Set<string>();
  if (visited.has(targetKey)) {
    return null;
  }
  const facts = input.factsByFile.get(input.filePath)?.djangoNinjaRouterFacts;
  if (facts === undefined) {
    return null;
  }
  const directTargets = directDjangoNinjaRouterTargets(input);
  const reExports = (facts.reExports ?? []).filter((reExport) => reExport.exportedName === input.name);
  if (directTargets.length + reExports.length !== 1) {
    return null;
  }
  if (directTargets[0] !== undefined) {
    return directTargets[0];
  }
  const reExport: DjangoNinjaRouterReExportFact | undefined = reExports[0];
  if (reExport === undefined) {
    return null;
  }
  const targetFilePath = resolveDjangoNinjaRouterModule({
    knownFilePaths: input.knownFilePaths,
    fromFilePath: input.filePath,
    moduleSpecifier: reExport.moduleSpecifier,
    moduleSpecifierKind: reExport.moduleSpecifierKind
  });
  if (targetFilePath === null) {
    return null;
  }
  const nestedVisited = new Set(visited);
  nestedVisited.add(targetKey);
  const target = resolveExactDjangoNinjaRouterTarget({
    factsByFile: input.factsByFile,
    knownFilePaths: input.knownFilePaths,
    filePath: targetFilePath,
    name: reExport.importedRouterName,
    visited: nestedVisited
  });
  return target === null
    ? null
    : {
        ...target,
        resolutionPath: compactPythonModuleResolutionPath([
          input.filePath,
          ...target.resolutionPath
        ]),
        reExported: true,
        absoluteReExported:
          target.absoluteReExported || reExport.moduleSpecifierKind === "absolute"
      };
}

interface ProjectedDjangoNinjaImportedRouterRoute {
  readonly inclusionFilePath: string;
  readonly routerFilePath: string;
  readonly inclusion: DjangoNinjaImportedRouterInclusionFact;
  readonly route: DjangoNinjaRouterRouteFact;
  readonly handler: SymbolNode;
  readonly path: string;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function compareProjectedDjangoNinjaImportedRouterRoute(
  left: ProjectedDjangoNinjaImportedRouterRoute,
  right: ProjectedDjangoNinjaImportedRouterRoute
): number {
  return (
    compareStableText(left.inclusionFilePath, right.inclusionFilePath) ||
    left.inclusion.range.start.line - right.inclusion.range.start.line ||
    left.inclusion.range.start.column - right.inclusion.range.start.column ||
    compareStableText(left.routerFilePath, right.routerFilePath) ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.route.source, right.route.source) ||
    compareStableText(left.route.method, right.route.method) ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.handler.id, right.handler.id)
  );
}

interface DjangoNinjaImportedRouterRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
}

/**
 * Resolves the deliberately narrow Django Ninja Router module-reference forms.
 * Earlier persisted facts predate `moduleSpecifierKind`, and therefore retain
 * their original package-relative meaning.
 */
function resolveDjangoNinjaRouterModule(input: {
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fromFilePath: string;
  readonly moduleSpecifier: string;
  readonly moduleSpecifierKind: "relative" | "absolute" | undefined;
}): string | null {
  switch (input.moduleSpecifierKind) {
    case undefined:
    case "relative":
      return resolvePythonRelativeModule(
        input.knownFilePaths,
        input.fromFilePath,
        input.moduleSpecifier
      );
    case "absolute":
      return resolvePythonAbsoluteModule(
        input.knownFilePaths,
        input.fromFilePath,
        input.moduleSpecifier
      );
    default:
      return null;
  }
}

function djangoNinjaImportedRouterRulePrefix(input: {
  readonly inclusion: DjangoNinjaImportedRouterInclusionFact;
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}): string {
  if (input.inclusion.moduleSpecifierKind === "absolute") {
    return input.reExported
      ? "framework.django-ninja.project-absolute-reexported-router"
      : "framework.django-ninja.project-absolute-router";
  }
  if (input.reExported) {
    return input.absoluteReExported
      ? "framework.django-ninja.reexported-absolute-router"
      : "framework.django-ninja.reexported-router";
  }
  return "framework.django-ninja.imported-router";
}

/**
 * Projects literal handler routes declared on a statically imported Django
 * Ninja Router. The resolver accepts only a unique, final Router declaration
 * inside a regular package, so every projected path has an auditable module hop.
 */
function projectDjangoNinjaImportedRouterRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): DjangoNinjaImportedRouterRouteProjection {
  const candidates: ProjectedDjangoNinjaImportedRouterRoute[] = [];

  for (const [inclusionFilePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const inclusionFacts = facts.djangoNinjaRouterFacts;
    if (inclusionFacts === undefined) {
      continue;
    }

    for (const inclusion of inclusionFacts.importedRouterInclusions) {
      const importedRouterFilePath = resolveDjangoNinjaRouterModule({
        knownFilePaths: input.knownFilePaths,
        fromFilePath: inclusionFilePath,
        moduleSpecifier: inclusion.moduleSpecifier,
        moduleSpecifierKind: inclusion.moduleSpecifierKind
      });
      if (importedRouterFilePath === null) {
        continue;
      }
      const target = resolveExactDjangoNinjaRouterTarget({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        filePath: importedRouterFilePath,
        name: inclusion.importedRouterName
      });
      if (target === null) {
        continue;
      }
      const routerFacts = input.factsByFile.get(target.filePath)?.djangoNinjaRouterFacts;
      if (routerFacts === undefined) {
        continue;
      }

      for (const route of routerFacts.routes) {
        if (route.routerName !== target.router.name) {
          continue;
        }
        const handler = input.symbolsById.get(route.handlerId);
        if (handler?.kind !== "function" || handler.filePath !== target.filePath) {
          continue;
        }
        const path = mountedPythonRoutePathParts([inclusion.prefix, route.path]);
        if (path === null) {
          continue;
        }
        candidates.push({
          inclusionFilePath,
          routerFilePath: target.filePath,
          inclusion,
          route,
          handler,
          path,
          resolutionPath: target.resolutionPath,
          reExported: target.reExported,
          absoluteReExported: target.absoluteReExported
        });
      }
    }
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedDjangoNinjaImportedRouterRoute)) {
    const dedupeKey = [
      candidate.inclusionFilePath,
      candidate.inclusion.range.start.line,
      candidate.inclusion.range.start.column,
      candidate.routerFilePath,
      candidate.route.range.start.line,
      candidate.route.range.start.column,
      candidate.route.source,
      candidate.route.method,
      candidate.path,
      candidate.handler.id
    ].join("\u0000");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const file = input.fileSymbols.get(candidate.routerFilePath);
    if (file === undefined) {
      continue;
    }
    const name = `${candidate.route.method} ${candidate.path}`;
    const qualifiedName = `${candidate.routerFilePath}#route:${name}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.routerFilePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.routerFilePath,
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
      filePath: candidate.routerFilePath,
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
      filePath: candidate.routerFilePath,
      range: candidate.route.range,
      resolution: "exact",
      confidence: 1,
      referenceName: candidate.handler.name,
      evidence: referenceEvidence(
        `${djangoNinjaImportedRouterRulePrefix(candidate)}.add-router.${
          candidate.route.source === "api-operation" ? "api-operation" : "decorator"
        }.local-function`,
        "module",
        [candidate.handler.id],
        [],
        [candidate.inclusionFilePath, ...candidate.resolutionPath]
      )
    });
  }

  return { symbols, structuralEdges };
}

interface ResolvedFlaskBlueprintTarget {
  readonly filePath: string;
  readonly blueprint: FlaskBlueprintDeclarationFact;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function directFlaskBlueprintTargets(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly filePath: string;
  readonly name: string;
}): readonly ResolvedFlaskBlueprintTarget[] {
  const facts = input.factsByFile.get(input.filePath)?.flaskBlueprintFacts;
  if (facts === undefined) {
    return [];
  }
  return facts.blueprints
    .filter((blueprint) => blueprint.name === input.name)
    .map((blueprint) => ({
      filePath: input.filePath,
      blueprint,
      resolutionPath: [input.filePath],
      reExported: false,
      absoluteReExported: false
    }));
}

/**
 * Resolves a direct Flask Blueprint or one final `__init__.py` re-export chain.
 * Every hop is a persisted single-name relative or project-root absolute
 * import, and a cycle or any competing local/exported binding remains unresolved.
 */
function resolveExactFlaskBlueprintTarget(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly filePath: string;
  readonly name: string;
  readonly visited?: ReadonlySet<string>;
}): ResolvedFlaskBlueprintTarget | null {
  const targetKey = `${input.filePath}\u0000${input.name}`;
  const visited = input.visited ?? new Set<string>();
  if (visited.has(targetKey)) {
    return null;
  }
  const facts = input.factsByFile.get(input.filePath)?.flaskBlueprintFacts;
  if (facts === undefined) {
    return null;
  }
  const directTargets = directFlaskBlueprintTargets(input);
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
  const targetFilePath = resolveFlaskBlueprintModule({
    knownFilePaths: input.knownFilePaths,
    fromFilePath: input.filePath,
    moduleSpecifier: reExport.moduleSpecifier,
    moduleSpecifierKind: reExport.moduleSpecifierKind
  });
  if (targetFilePath === null) {
    return null;
  }
  const nestedVisited = new Set(visited);
  nestedVisited.add(targetKey);
  const target = resolveExactFlaskBlueprintTarget({
    factsByFile: input.factsByFile,
    knownFilePaths: input.knownFilePaths,
    filePath: targetFilePath,
    name: reExport.importedBlueprintName,
    visited: nestedVisited
  });
  return target === null
    ? null
    : {
        ...target,
        resolutionPath: compactPythonModuleResolutionPath([
          input.filePath,
          ...target.resolutionPath
        ]),
        reExported: true,
        absoluteReExported:
          target.absoluteReExported || reExport.moduleSpecifierKind === "absolute"
      };
}

interface ProjectedFlaskImportedBlueprintRoute {
  readonly registrationFilePath: string;
  readonly blueprintFilePath: string;
  readonly registration: FlaskImportedBlueprintRegistrationFact;
  readonly route: FlaskBlueprintRouteFact;
  readonly handler: SymbolNode;
  readonly path: string;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}

function compareProjectedFlaskImportedBlueprintRoute(
  left: ProjectedFlaskImportedBlueprintRoute,
  right: ProjectedFlaskImportedBlueprintRoute
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

interface FlaskImportedBlueprintRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
}

/**
 * Resolves the deliberately narrow Flask Blueprint module-reference forms.
 * Earlier persisted facts predate `moduleSpecifierKind`, and therefore retain
 * their original package-relative meaning.
 */
function resolveFlaskBlueprintModule(input: {
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fromFilePath: string;
  readonly moduleSpecifier: string;
  readonly moduleSpecifierKind: "relative" | "absolute" | undefined;
}): string | null {
  switch (input.moduleSpecifierKind) {
    case undefined:
    case "relative":
      return resolvePythonRelativeModule(
        input.knownFilePaths,
        input.fromFilePath,
        input.moduleSpecifier
      );
    case "absolute":
      return resolvePythonAbsoluteModule(
        input.knownFilePaths,
        input.fromFilePath,
        input.moduleSpecifier
      );
    default:
      return null;
  }
}

function flaskImportedBlueprintRulePrefix(input: {
  readonly registration: FlaskImportedBlueprintRegistrationFact;
  readonly reExported: boolean;
  readonly absoluteReExported: boolean;
}): string {
  if (input.registration.moduleSpecifierKind === "absolute") {
    return input.reExported
      ? "framework.flask.project-absolute-reexported-blueprint"
      : "framework.flask.project-absolute-blueprint";
  }
  if (input.reExported) {
    return input.absoluteReExported
      ? "framework.flask.reexported-absolute-blueprint"
      : "framework.flask.reexported-blueprint";
  }
  return "framework.flask.imported-blueprint";
}

/**
 * Projects literal handler routes declared on an imported Flask Blueprint.
 * A final package initializer re-export chain is accepted only when every hop
 * has exact persisted evidence. Stored route evidence names every resolved
 * module so a route remains auditable after indexing.
 */
function projectFlaskImportedBlueprintRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): FlaskImportedBlueprintRouteProjection {
  const candidates: ProjectedFlaskImportedBlueprintRoute[] = [];

  for (const [registrationFilePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const registrationFacts = facts.flaskBlueprintFacts;
    if (registrationFacts === undefined) {
      continue;
    }

    for (const registration of registrationFacts.importedBlueprintRegistrations) {
      const importedBlueprintFilePath = resolveFlaskBlueprintModule({
        knownFilePaths: input.knownFilePaths,
        fromFilePath: registrationFilePath,
        moduleSpecifier: registration.moduleSpecifier,
        moduleSpecifierKind: registration.moduleSpecifierKind
      });
      if (importedBlueprintFilePath === null) {
        continue;
      }
      const target = resolveExactFlaskBlueprintTarget({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        filePath: importedBlueprintFilePath,
        name: registration.importedBlueprintName
      });
      if (target === null) {
        continue;
      }
      const blueprintFilePath = target.filePath;
      const blueprintFacts = input.factsByFile.get(blueprintFilePath)?.flaskBlueprintFacts;
      if (blueprintFacts === undefined) {
        continue;
      }
      const blueprint = target.blueprint;

      for (const route of blueprintFacts.routes) {
        if (route.blueprintName !== blueprint.name) {
          continue;
        }
        const handler = input.symbolsById.get(route.handlerId);
        if (handler?.kind !== "function" || handler.filePath !== blueprintFilePath) {
          continue;
        }
        const path = mountedPythonRoutePath(registration.prefix, blueprint.prefix, route.path);
        if (path === null) {
          continue;
        }
        candidates.push({
          registrationFilePath,
          blueprintFilePath,
          registration,
          route,
          handler,
          path,
          resolutionPath: target.resolutionPath,
          reExported: target.reExported,
          absoluteReExported: target.absoluteReExported
        });
      }
    }
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedFlaskImportedBlueprintRoute)) {
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
    const name = `${candidate.route.method} ${candidate.path}`;
    const qualifiedName = `${candidate.blueprintFilePath}#route:${name}`;
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
        `${flaskImportedBlueprintRulePrefix({
          registration: candidate.registration,
          reExported: candidate.reExported,
          absoluteReExported: candidate.absoluteReExported
        })}.register-blueprint.decorator.local-function`,
        "module",
        [candidate.handler.id],
        [],
        [candidate.registrationFilePath, ...candidate.resolutionPath]
      )
    });
  }

  return { symbols, structuralEdges };
}

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

function compactPythonModuleResolutionPath(parts: readonly string[]): readonly string[] {
  const compacted: string[] = [];
  for (const part of parts) {
    if (compacted.at(-1) !== part) {
      compacted.push(part);
    }
  }
  return compacted;
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
function projectSanicImportedBlueprintRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): SanicImportedBlueprintRouteProjection {
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

function isStaticDjangoUrlPatternPath(value: string): boolean {
  return value.startsWith("/") && !value.includes("\\") && !value.includes("//");
}

interface ResolvedDjangoUrlconfTarget {
  readonly filePath: string;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
}

function directDjangoUrlconfTargets(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly filePath: string;
  readonly name: string;
}): readonly ResolvedDjangoUrlconfTarget[] {
  const facts = input.factsByFile.get(input.filePath)?.djangoUrlFacts;
  if (
    facts === undefined ||
    facts.hasUrlpatterns !== true ||
    (input.name !== "urls" && input.name !== "urlpatterns")
  ) {
    return [];
  }
  return [
    {
      filePath: input.filePath,
      resolutionPath: [input.filePath],
      reExported: false
    }
  ];
}

/**
 * Resolves a direct Django URLConf or one final `__init__.py` re-export chain.
 * Every hop is a persisted single-name relative import, and a cycle or any
 * competing direct/exported binding remains unresolved.
 */
function resolveExactDjangoUrlconfTarget(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly filePath: string;
  readonly name: string;
  readonly visited?: ReadonlySet<string>;
}): ResolvedDjangoUrlconfTarget | null {
  const targetKey = `${input.filePath}\u0000${input.name}`;
  const visited = input.visited ?? new Set<string>();
  if (visited.has(targetKey)) {
    return null;
  }
  const facts = input.factsByFile.get(input.filePath)?.djangoUrlFacts;
  if (facts === undefined) {
    return null;
  }
  const directTargets = directDjangoUrlconfTargets(input);
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
  const target = resolveExactDjangoUrlconfTarget({
    factsByFile: input.factsByFile,
    knownFilePaths: input.knownFilePaths,
    filePath: targetFilePath,
    name: reExport.importedUrlconfName,
    visited: nestedVisited
  });
  return target === null
    ? null
    : {
        ...target,
        resolutionPath: compactPythonModuleResolutionPath([
          input.filePath,
          ...target.resolutionPath
        ]),
        reExported: true
      };
}

function mountedDjangoUrlconfRoutePath(prefix: string, routePath: string): string | null {
  if (!isStaticDjangoUrlPatternPath(prefix) || !isStaticDjangoUrlPatternPath(routePath)) {
    return null;
  }
  const normalizedPrefix = prefix === "/" ? "" : prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return `${normalizedPrefix}${routePath}`;
}

type DjangoUrlconfInclusionFact =
  | DjangoImportedUrlconfInclusionFact
  | DjangoLiteralUrlconfInclusionFact;

function djangoUrlconfInclusionFactory(
  inclusion: DjangoUrlconfInclusionFact
): DjangoUrlconfInclusionFactory {
  return inclusion.factory ?? "path";
}

function djangoUrlPatternHandlerKind(
  route: DjangoUrlPatternRouteFact
): DjangoUrlPatternHandlerKind {
  return route.handlerKind ?? "function";
}

function djangoUrlconfInclusionRuleId(
  inclusion: DjangoUrlconfInclusionFact,
  reExported: boolean,
  handlerKind: DjangoUrlPatternHandlerKind
): EdgeEvidence["ruleId"] {
  const factory = djangoUrlconfInclusionFactory(inclusion);
  const factorySegment = factory === "re_path" ? "re-path" : factory;
  const handlerSegment = handlerKind === "class-as-view" ? "local-class-as-view" : "local-function";
  if ("urlconfName" in inclusion) {
    const source = reExported ? "reexported-urlconf" : "imported-urlconf";
    return `framework.django.${source}.${factorySegment}.include.${handlerSegment}`;
  }
  const source = reExported ? `reexported-${factorySegment}` : factorySegment;
  return `framework.django.literal-urlconf.${source}.include.${handlerSegment}`;
}

interface ResolvedDjangoUrlconfInclusion {
  readonly inclusion: DjangoUrlconfInclusionFact;
  readonly urlconfFilePath: string;
  readonly resolutionPath: readonly string[];
  readonly reExported: boolean;
}

interface ProjectedDjangoUrlconfRoute {
  readonly inclusionFilePath: string;
  readonly urlconfFilePath: string;
  readonly inclusion: DjangoUrlconfInclusionFact;
  readonly route: DjangoUrlPatternRouteFact;
  readonly handler: SymbolNode;
  readonly path: string;
  readonly resolutionPath: readonly string[];
  readonly ruleId: EdgeEvidence["ruleId"];
}

function compareProjectedDjangoUrlconfRoute(
  left: ProjectedDjangoUrlconfRoute,
  right: ProjectedDjangoUrlconfRoute
): number {
  return (
    compareStableText(left.inclusionFilePath, right.inclusionFilePath) ||
    left.inclusion.range.start.line - right.inclusion.range.start.line ||
    left.inclusion.range.start.column - right.inclusion.range.start.column ||
    compareStableText(left.urlconfFilePath, right.urlconfFilePath) ||
    left.route.range.start.line - right.route.range.start.line ||
    left.route.range.start.column - right.route.range.start.column ||
    compareStableText(left.path, right.path) ||
    compareStableText(left.handler.id, right.handler.id)
  );
}

interface DjangoUrlconfRouteProjection {
  readonly symbols: readonly SymbolNode[];
  readonly structuralEdges: readonly GraphEdge[];
}

/**
 * Projects literal child URL patterns through directly imported URLConfs and
 * static dotted URLConf module names. A final package initializer re-export
 * chain is accepted only when every hop has exact persisted evidence.
 */
function projectDjangoUrlconfRoutes(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): DjangoUrlconfRouteProjection {
  const candidates: ProjectedDjangoUrlconfRoute[] = [];

  for (const [inclusionFilePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const inclusionFacts = facts.djangoUrlFacts;
    if (inclusionFacts === undefined) {
      continue;
    }

    const resolvedInclusions: ResolvedDjangoUrlconfInclusion[] = [];
    for (const inclusion of inclusionFacts.importedUrlconfInclusions) {
      const importedUrlconfFilePath = resolvePythonRelativeModule(
        input.knownFilePaths,
        inclusionFilePath,
        inclusion.moduleSpecifier
      );
      if (importedUrlconfFilePath === null) {
        continue;
      }
      const target = resolveExactDjangoUrlconfTarget({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        filePath: importedUrlconfFilePath,
        name: inclusion.importedUrlconfName
      });
      if (target === null) {
        continue;
      }
      resolvedInclusions.push({
        inclusion,
        urlconfFilePath: target.filePath,
        resolutionPath: target.resolutionPath,
        reExported: target.reExported
      });
    }

    for (const inclusion of inclusionFacts.literalUrlconfInclusions ?? []) {
      const literalUrlconfFilePath = resolvePythonAbsoluteModule(
        input.knownFilePaths,
        inclusionFilePath,
        inclusion.moduleSpecifier
      );
      if (literalUrlconfFilePath === null) {
        continue;
      }
      const target = resolveExactDjangoUrlconfTarget({
        factsByFile: input.factsByFile,
        knownFilePaths: input.knownFilePaths,
        filePath: literalUrlconfFilePath,
        name: "urlpatterns"
      });
      if (target === null) {
        continue;
      }
      resolvedInclusions.push({
        inclusion,
        urlconfFilePath: target.filePath,
        resolutionPath: target.resolutionPath,
        reExported: target.reExported
      });
    }

    for (const resolvedInclusion of resolvedInclusions) {
      const urlconfFacts = input.factsByFile.get(resolvedInclusion.urlconfFilePath)?.djangoUrlFacts;
      if (urlconfFacts === undefined) {
        continue;
      }

      for (const route of urlconfFacts.routes) {
        const handlerKind = djangoUrlPatternHandlerKind(route);
        const handler = input.symbolsById.get(route.handlerId);
        if (
          handler === undefined ||
          handler.filePath !== resolvedInclusion.urlconfFilePath ||
          (handlerKind === "function" ? handler.kind !== "function" : handler.kind !== "class")
        ) {
          continue;
        }
        const path = mountedDjangoUrlconfRoutePath(resolvedInclusion.inclusion.prefix, route.path);
        if (path === null) {
          continue;
        }
        candidates.push({
          inclusionFilePath,
          urlconfFilePath: resolvedInclusion.urlconfFilePath,
          inclusion: resolvedInclusion.inclusion,
          route,
          handler,
          path,
          resolutionPath: resolvedInclusion.resolutionPath,
          ruleId: djangoUrlconfInclusionRuleId(
            resolvedInclusion.inclusion,
            resolvedInclusion.reExported,
            handlerKind
          )
        });
      }
    }
  }

  const symbols: SymbolNode[] = [];
  const structuralEdges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(compareProjectedDjangoUrlconfRoute)) {
    const dedupeKey = [
      candidate.inclusionFilePath,
      candidate.inclusion.range.start.line,
      candidate.inclusion.range.start.column,
      candidate.urlconfFilePath,
      candidate.route.range.start.line,
      candidate.route.range.start.column,
      candidate.path,
      candidate.handler.id
    ].join("\u0000");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const file = input.fileSymbols.get(candidate.urlconfFilePath);
    if (file === undefined) {
      continue;
    }
    const name = `ALL ${candidate.path}`;
    const qualifiedName = `${candidate.urlconfFilePath}#route:${name}`;
    const declarationOrdinal = declarationOrdinals.get(qualifiedName) ?? 0;
    declarationOrdinals.set(qualifiedName, declarationOrdinal + 1);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: candidate.urlconfFilePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: candidate.urlconfFilePath,
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
      filePath: candidate.urlconfFilePath,
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
      filePath: candidate.urlconfFilePath,
      range: candidate.route.range,
      resolution: "exact",
      confidence: 1,
      referenceName: candidate.handler.name,
      evidence: referenceEvidence(
        candidate.ruleId,
        "module",
        [candidate.handler.id],
        [],
        [candidate.inclusionFilePath, ...candidate.resolutionPath]
      )
    });
  }

  return { symbols, structuralEdges };
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
  readonly projectPlugin?: ValidatedFrameworkProjectRouteProjection["projectPlugin"];
  readonly routePrefixChain?: readonly RoutePrefixSegment[];
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
  const routeQualifiedNamePrefix = `${route.filePath}#route:${route.name}`;
  const routeIdentitySuffix = route.qualifiedName.startsWith(routeQualifiedNamePrefix)
    ? route.qualifiedName.slice(routeQualifiedNamePrefix.length)
    : "";
  const qualifiedName = `${route.filePath}#route:${name}${routeIdentitySuffix}`;
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
      ? edge.evidence?.ruleId ===
        "language.ruby.v1_6_1.rails.direct-routes-draw.literal-registration.containment"
        ? {
            ruleId: edge.evidence.ruleId,
            stage: edge.evidence.stage,
            candidateSymbolIds: [target.route.id]
          }
        : {
            ruleId: "syntax.containment",
            stage: "syntax" as const,
            candidateSymbolIds: [target.route.id]
          }
      : edge.kind === "routes" && source?.prefixApplied === true
      ? {
          ruleId:
            source.projectPlugin === undefined
              ? "framework.nestjs.router-module.exact-prefix"
              : `framework.project-plugin.${source.projectPlugin.pluginId}.exact-route-prefix`,
          stage: "module" as const,
          candidateSymbolIds: [
            ...(edge.targetId === null ? [] : [edge.targetId]),
            ...source.controllerIds,
            ...source.moduleIds
          ].sort(compareStableText),
          ...(edge.evidence?.routeDomain === undefined
            ? {}
            : { routeDomain: edge.evidence.routeDomain }),
          ...(source.projectPlugin === undefined ? {} : { projectPlugin: source.projectPlugin }),
          ...(source.routePrefixChain === undefined
            ? {}
            : { routePrefixChain: source.routePrefixChain })
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
  readonly frameworkRouteProjections: readonly ValidatedFrameworkProjectRouteProjection[];
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
  const frameworkProjectionsByRouteId = new Map<string, ValidatedFrameworkProjectRouteProjection[]>();
  for (const projection of input.frameworkRouteProjections) {
    const entries = frameworkProjectionsByRouteId.get(projection.sourceRouteSymbolId) ?? [];
    entries.push(projection);
    frameworkProjectionsByRouteId.set(projection.sourceRouteSymbolId, entries);
  }

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
    const frameworkProjections = frameworkProjectionsByRouteId.get(sourceRoute.id) ?? [];
    if (frameworkProjections.length > 0) {
      const hasNestProjection = controllerIds.some((controllerId) =>
        [...(controllerModuleIds.get(controllerId) ?? [])].some(
          (moduleId) => (modulePrefixes.get(moduleId)?.size ?? 0) > 0
        )
      );
      if (hasNestProjection) {
        const owner = frameworkProjections[0]?.projectPlugin;
        throw new FrameworkProjectPluginOutputError(
          `Framework project plugin ${owner?.pluginId}@${owner?.pluginVersion}: route projection conflicts with the built-in NestJS RouterModule projection for ${sourceRoute.id}.`
        );
      }
      if (localPath === null) {
        const owner = frameworkProjections[0]?.projectPlugin;
        throw new FrameworkProjectPluginOutputError(
          `Framework project plugin ${owner?.pluginId}@${owner?.pluginVersion}: route projection source ${sourceRoute.id} has no canonical route path.`
        );
      }
      const projectedPaths = new Set<string>();
      for (const frameworkProjection of frameworkProjections) {
        const path: string = frameworkProjection.prefixChain.reduceRight<string>(
          (projectedPath, segment) => joinNestRouterPath(segment.prefix, projectedPath),
          localPath
        );
        if (path === localPath || projectedPaths.has(path)) {
          throw new FrameworkProjectPluginOutputError(
            `Framework project plugin ${frameworkProjection.projectPlugin.pluginId}@${frameworkProjection.projectPlugin.pluginVersion}: route projection for ${sourceRoute.id} must produce a unique changed path.`
          );
        }
        projectedPaths.add(path);
        projections.push({
          sourceRoute,
          route: projectedRouteSymbol(sourceRoute, path, sourceRoute.declarationOrdinal),
          controllerIds: [],
          moduleIds: [],
          prefixApplied: true,
          projectPlugin: frameworkProjection.projectPlugin,
          routePrefixChain: frameworkProjection.prefixChain
        });
      }
      continue;
    }
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

type JvmHeritageRelationKind = "extends" | "implements";

interface JvmResolvedType {
  readonly fact: JvmTypeFact;
  readonly symbol: SymbolNode;
}

function jvmTypePath(type: JvmResolvedType): string {
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

function jvmModuleMembershipsByFile(
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
function samePackageJvmModuleEvidence(input: {
  readonly projectEvidence: JvmProjectModuleEvidence | undefined;
  readonly membershipsByFile: ReadonlyMap<string, readonly JvmModuleMembership[]>;
  readonly sourceFilePath: string;
  readonly targetFilePath: string;
}): readonly string[] | null {
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

interface DeclaredJvmProjectDependencyEvidence {
  readonly kind: JvmModuleDependency["kind"];
  readonly configurationPaths: readonly string[];
}

/**
 * Records a direct Gradle project dependency only as additional evidence for a
 * relationship already proven by import or qualified-type syntax. Absence of a
 * declaration does not fabricate a negative result: Maven, dynamic Gradle,
 * transitive dependencies, and compiler classpaths remain outside this pass.
 */
function declaredJvmProjectDependencyEvidence(input: {
  readonly projectEvidence: JvmProjectModuleEvidence | undefined;
  readonly membershipsByFile: ReadonlyMap<string, readonly JvmModuleMembership[]>;
  readonly sourceFilePath: string;
  readonly targetFilePath: string;
}): DeclaredJvmProjectDependencyEvidence | null {
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

function projectJavaImportReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}): readonly GraphEdge[] {
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
    });
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
      evidence: referenceEvidence(
        "module.java.explicit-import.project-type",
        "module",
        candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
        declaredProjectDependency?.configurationPaths ?? [],
        [reference.filePath, target.filePath]
      )
    });
  }
  return edges;
}

function projectJavaAnnotationReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}): readonly GraphEdge[] {
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
          });
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
        });
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
      evidence: referenceEvidence(
        `module.java.annotation-type.${resolutionProof}.project-type`,
        "module",
        candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
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
function projectJvmHeritageReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}): readonly GraphEdge[] {
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
          })
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
          });
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
      evidence: referenceEvidence(
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
        candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
        configurationPaths,
        [reference.filePath, target.filePath]
      )
    });
  }
  return edges;
}

/**
 * Projects Java callable parameter and return types only when source syntax
 * identifies one indexed top-level project type. Wildcard imports, missing
 * imports, duplicate type identities, nested types, and compiler-classpath
 * semantics remain unresolved in the retained artifact facts.
 */
function projectJvmCallableSignatureReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}): readonly GraphEdge[] {
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
          });
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
          });
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
      evidence: referenceEvidence(
        `signature.java.${proof}.${reference.relationKind}`,
        "module",
        candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
        configurationPaths,
        [reference.filePath, target.filePath]
      )
    });
  }
  return edges;
}

/** Projects direct Java `new Type(...)` syntax to one proven indexed top-level class. */
function projectJavaInstantiationReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}): readonly GraphEdge[] {
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
          });
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
          });
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
      evidence: referenceEvidence(
        `syntax.java.object-creation.${proof}`,
        "module",
        candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
        configurationPaths,
        [reference.filePath, target.filePath]
      )
    });
  }
  return edges;
}

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
function projectKotlinRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
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

interface ResolvedSwiftType {
  readonly fact: SwiftTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedSwiftCallable {
  readonly fact: SwiftCallableFact;
  readonly symbol: SymbolNode;
}

/**
 * Projects the v0.460 Swift relation slice without invoking swiftc, Xcode, or
 * an Objective-C/runtime model. Swift source has no package declaration, so
 * cross-file targets require an explicit import plus one unique exported
 * project-local declaration; same-file declarations may remain internal.
 */
function projectSwiftRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const types: ResolvedSwiftType[] = [];
  const callables: ResolvedSwiftCallable[] = [];
  const imports: SwiftImportFact[] = [];
  const calls: SwiftCallFact[] = [];
  const instantiations: SwiftInstantiationFact[] = [];
  const heritage: SwiftHeritageFact[] = [];
  const overrides: SwiftOverrideFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const swiftFacts = facts.swiftFacts;
    if (swiftFacts === undefined) {
      continue;
    }
    for (const fact of swiftFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) {
        types.push({ fact, symbol });
      }
    }
    for (const fact of swiftFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) {
        callables.push({ fact, symbol });
      }
    }
    imports.push(...swiftFacts.imports);
    calls.push(...swiftFacts.calls);
    instantiations.push(...swiftFacts.instantiations);
    heritage.push(...swiftFacts.heritage ?? []);
    overrides.push(...swiftFacts.overrides ?? []);
  }

  const typesByName = new Map<string, ResolvedSwiftType[]>();
  const typesByPath = new Map<string, ResolvedSwiftType[]>();
  const callablesByName = new Map<string, ResolvedSwiftCallable[]>();
  for (const entry of types) {
    const byName = typesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    typesByName.set(entry.fact.name, byName);
    const byPath = typesByPath.get(entry.fact.qualifiedTypePath) ?? [];
    byPath.push(entry);
    typesByPath.set(entry.fact.qualifiedTypePath, byPath);
  }
  for (const entry of callables) {
    const byName = callablesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    callablesByName.set(entry.fact.name, byName);
  }
  for (const entries of [...typesByName.values(), ...typesByPath.values(), ...callablesByName.values()]) {
    entries.sort((left, right) => compareStableText(left.symbol.id, right.symbol.id));
  }

  const importsByFileAndLocalName = new Map<string, SwiftImportFact[]>();
  for (const fact of imports) {
    const key = `${fact.filePath}\u0000${fact.localName}`;
    const entries = importsByFileAndLocalName.get(key) ?? [];
    entries.push(fact);
    importsByFileAndLocalName.set(key, entries);
  }
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
  const importedPathFor = (filePath: string, localName: string): string | null => {
    const entries = (importsByFileAndLocalName.get(`${filePath}\u0000${localName}`) ?? [])
      .filter((fact) => !fact.isAliased && !fact.isWildcard);
    return entries.length === 1 ? entries[0]?.importedPath ?? null : null;
  };
  const resolveType = (filePath: string, name: string): readonly ResolvedSwiftType[] => {
    const importedPath = importedPathFor(filePath, name);
    if (importedPath !== null) {
      const exactPath = typesByPath.get(importedPath) ?? [];
      if (exactPath.length > 0) {
        return exactPath;
      }
      const importedName = importedPath.split(".").at(-1) ?? name;
      return (typesByName.get(importedName) ?? []).filter((candidate) =>
        candidate.symbol.filePath === filePath || candidate.fact.isExported
      );
    }
    return (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath);
  };
  const visibleFrom = (filePath: string, candidate: { readonly fact: { readonly isExported: boolean }; readonly symbol: SymbolNode }): boolean =>
    candidate.symbol.filePath === filePath || candidate.fact.isExported;
  const exactArity = (fact: SwiftCallableFact, argumentCount: number): boolean =>
    fact.parameterCount === argumentCount && fact.requiredParameterCount === argumentCount;
  const edgeFor = (inputEdge: {
    readonly sourceId: string;
    readonly targetId: string;
    readonly kind: GraphEdge["kind"];
    readonly filePath: string;
    readonly referenceName: string;
    readonly range: SourceRange;
    readonly ruleId: string;
    readonly targetFilePath?: string;
  }): GraphEdge => {
    const crossFile = inputEdge.targetFilePath !== undefined && inputEdge.targetFilePath !== inputEdge.filePath;
    return {
      id: createEdgeId({
        sourceId: inputEdge.sourceId,
        targetId: inputEdge.targetId,
        kind: inputEdge.kind,
        line: inputEdge.range.start.line,
        column: inputEdge.range.start.column,
        referenceName: inputEdge.referenceName
      }),
      sourceId: inputEdge.sourceId,
      targetId: inputEdge.targetId,
      kind: inputEdge.kind,
      filePath: inputEdge.filePath,
      range: inputEdge.range,
      resolution: "exact",
      confidence: 1,
      referenceName: inputEdge.referenceName,
      evidence: referenceEvidence(
        inputEdge.ruleId,
        crossFile ? "module" : "syntax",
        [inputEdge.targetId],
        [],
        crossFile ? [inputEdge.filePath, inputEdge.targetFilePath!] : []
      )
    };
  };

  for (const imported of [...imports].sort((left, right) =>
    compareStableText(`${left.filePath}\u0000${left.range.start.line}\u0000${left.range.start.column}`, `${right.filePath}\u0000${right.range.start.line}\u0000${right.range.start.column}`)
  )) {
    if (imported.isAliased || imported.isWildcard) {
      continue;
    }
    const source = fileSymbols.get(imported.filePath);
    if (source?.id !== imported.sourceId) {
      continue;
    }
    const exactPath = typesByPath.get(imported.importedPath) ?? [];
    const typeCandidates = exactPath.length > 0
      ? exactPath
      : (typesByName.get(imported.importedName) ?? []);
    const callableCandidates = callablesByName.get(imported.importedName) ?? [];
    const candidates = [...typeCandidates, ...callableCandidates].filter((candidate) =>
      candidate.symbol.filePath !== imported.filePath && candidate.fact.isExported
    );
    if (candidates.length !== 1 || candidates[0] === undefined) {
      continue;
    }
    const target = candidates[0].symbol;
    push(edgeFor({
      sourceId: source.id,
      targetId: target.id,
      kind: "imports",
      filePath: imported.filePath,
      referenceName: imported.importedName,
      range: imported.range,
      ruleId: "module.swift.explicit-import.unique-target",
      targetFilePath: target.filePath
    }));
  }

  for (const callable of callables) {
    const parameterTypeNames = callable.fact.parameterTypeNames ?? [];
    if (parameterTypeNames.length === callable.fact.parameterCount) {
      for (const typeName of [...new Set(parameterTypeNames)]) {
        const candidates = resolveType(callable.symbol.filePath, typeName).filter((candidate) =>
          visibleFrom(callable.symbol.filePath, candidate)
        );
        if (candidates.length !== 1 || candidates[0] === undefined) {
          continue;
        }
        const target = candidates[0].symbol;
        push(edgeFor({
          sourceId: callable.symbol.id,
          targetId: target.id,
          kind: "accepts",
          filePath: callable.symbol.filePath,
          referenceName: typeName,
          range: callable.fact.range,
          ruleId: "syntax.swift.unique-signature-parameter-type",
          targetFilePath: target.filePath
        }));
      }
    }
    const returnTypeName = callable.fact.returnTypeName;
    if (returnTypeName !== undefined && returnTypeName !== null) {
      const candidates = resolveType(callable.symbol.filePath, returnTypeName).filter((candidate) =>
        visibleFrom(callable.symbol.filePath, candidate)
      );
      if (candidates.length === 1 && candidates[0] !== undefined) {
        const target = candidates[0].symbol;
        push(edgeFor({
          sourceId: callable.symbol.id,
          targetId: target.id,
          kind: "returns",
          filePath: callable.symbol.filePath,
          referenceName: returnTypeName,
          range: callable.fact.range,
          ruleId: "syntax.swift.unique-signature-return-type",
          targetFilePath: target.filePath
        }));
      }
    }
  }

  const sourceCallable = (sourceId: string, filePath: string): SymbolNode | undefined => {
    const source = input.symbolsById.get(sourceId);
    return source?.filePath === filePath && (source.kind === "function" || source.kind === "method")
      ? source
      : undefined;
  };
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) {
      continue;
    }
    if (call.callKind === "direct") {
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) =>
        candidate.fact.callableKind === "function" &&
        exactArity(candidate.fact, call.argumentCount) &&
        visibleFrom(call.filePath, candidate)
      );
      if (candidates.length === 1 && candidates[0] !== undefined) {
        const target = candidates[0].symbol;
        if (target.filePath !== call.filePath && importedPathFor(call.filePath, call.referenceName) === null) {
          continue;
        }
        push(edgeFor({
          sourceId: source.id,
          targetId: target.id,
          kind: "calls",
          filePath: call.filePath,
          referenceName: call.referenceName,
          range: call.range,
          ruleId: "syntax.swift.unique-direct-function-call",
          targetFilePath: target.filePath
        }));
      }
      continue;
    }
    if (call.receiverTypeName === undefined) {
      continue;
    }
    const receiverCandidates = resolveType(call.filePath, call.receiverTypeName);
    if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) {
      continue;
    }
    const receiver = receiverCandidates[0];
    if (!visibleFrom(call.filePath, receiver) || receiver.fact.isDecoratorTainted === true || receiver.fact.declarationKind === "protocol" || receiver.fact.declarationKind === "enum" || receiver.fact.declarationKind === "typealias") {
      continue;
    }
    const memberCandidates = callables.filter((candidate) => {
      if (candidate.fact.name !== call.referenceName || !exactArity(candidate.fact, call.argumentCount) || !visibleFrom(call.filePath, candidate)) {
        return false;
      }
      if (candidate.fact.callableKind === "method") {
        return candidate.fact.ownerTypeId === receiver.symbol.id;
      }
      return candidate.fact.callableKind === "extension" && candidate.fact.ownerTypeName === receiver.fact.name;
    });
    if (memberCandidates.length === 1 && memberCandidates[0] !== undefined) {
      const target = memberCandidates[0].symbol;
      push(edgeFor({
        sourceId: source.id,
        targetId: target.id,
        kind: "calls",
        filePath: call.filePath,
        referenceName: call.referenceName,
        range: call.range,
        ruleId: memberCandidates[0].fact.callableKind === "extension"
          ? "syntax.swift.unique-extension-member-call"
          : "syntax.swift.unique-member-call",
        targetFilePath: target.filePath
      }));
    }
  }

  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) {
      continue;
    }
    const candidates = resolveType(instantiation.filePath, instantiation.typeName).filter((candidate) =>
      (candidate.fact.declarationKind === "class" || candidate.fact.declarationKind === "struct" || candidate.fact.declarationKind === "actor") &&
      visibleFrom(instantiation.filePath, candidate)
    );
    if (candidates.length !== 1 || candidates[0] === undefined) {
      continue;
    }
    const target = candidates[0];
    const initializers = callables.filter((candidate) =>
      candidate.fact.callableKind === "initializer" &&
      candidate.fact.ownerTypeId === target.symbol.id &&
      exactArity(candidate.fact, instantiation.argumentCount) &&
      visibleFrom(instantiation.filePath, candidate)
    );
    if (initializers.length !== 1) {
      continue;
    }
    push(edgeFor({
      sourceId: source.id,
      targetId: target.symbol.id,
      kind: "instantiates",
      filePath: instantiation.filePath,
      referenceName: instantiation.typeName,
      range: instantiation.range,
      ruleId: "syntax.swift.unique-initializer-call",
      targetFilePath: target.symbol.filePath
    }));
  }

  const heritageEdges: GraphEdge[] = [];
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) {
      continue;
    }
    const candidates = resolveType(reference.filePath, reference.referenceName);
    if (candidates.length !== 1 || candidates[0] === undefined) {
      continue;
    }
    const target = candidates[0];
    if (!visibleFrom(reference.filePath, target) || target.symbol.id === source.id) {
      continue;
    }
    const relationKind = target.fact.declarationKind === "protocol"
      ? (reference.sourceTypeKind === "protocol" ? "extends" : "implements")
      : (reference.sourceTypeKind === "class" || reference.sourceTypeKind === "actor" ? "extends" : null);
    if (relationKind === null) {
      continue;
    }
    const edge = edgeFor({
      sourceId: source.id,
      targetId: target.symbol.id,
      kind: relationKind,
      filePath: reference.filePath,
      referenceName: reference.referenceName,
      range: reference.range,
      ruleId: relationKind === "implements"
        ? "syntax.swift.unique-conformance-target"
        : "syntax.swift.unique-heritage-target",
      targetFilePath: target.symbol.filePath
    });
    heritageEdges.push(edge);
    push(edge);
  }

  for (const override of overrides) {
    const source = input.symbolsById.get(override.sourceId);
    if (source?.filePath !== override.filePath) {
      continue;
    }
    const owner = types.find((candidate) =>
      candidate.symbol.filePath === override.filePath && candidate.fact.name === override.ownerTypeName
    );
    if (owner === undefined) {
      continue;
    }
    const parents = heritageEdges.filter((edge) =>
      edge.sourceId === owner.symbol.id && edge.resolution === "exact" && edge.targetId !== null
    );
    const parentMethods = callables.filter((candidate) =>
      candidate.symbol.id !== source.id &&
      candidate.fact.callableKind === "method" &&
      candidate.fact.name === override.methodName &&
      parents.some((parent) => parent.targetId === candidate.fact.ownerTypeId)
    );
    if (parents.length === 0 || parentMethods.length !== 1 || parentMethods[0] === undefined) {
      continue;
    }
    push(edgeFor({
      sourceId: source.id,
      targetId: parentMethods[0].symbol.id,
      kind: "overrides",
      filePath: override.filePath,
      referenceName: override.methodName,
      range: override.range,
      ruleId: "syntax.swift.explicit-direct-base-method",
      targetFilePath: parentMethods[0].symbol.filePath
    }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

interface ResolvedDartType {
  readonly fact: DartTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedDartCallable {
  readonly fact: DartCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects only literal, project-local Dart facts; package solving and analyzer semantics remain out. */
function projectDartRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const types: ResolvedDartType[] = [];
  const callables: ResolvedDartCallable[] = [];
  const imports: DartImportFact[] = [];
  const calls: DartCallFact[] = [];
  const instantiations: DartInstantiationFact[] = [];
  const heritage: DartHeritageFact[] = [];
  const overrides: DartOverrideFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const dartFacts = facts.dartFacts;
    if (dartFacts === undefined) continue;
    for (const fact of dartFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of dartFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...dartFacts.imports);
    calls.push(...dartFacts.calls);
    instantiations.push(...dartFacts.instantiations);
    heritage.push(...dartFacts.heritage ?? []);
    overrides.push(...dartFacts.overrides ?? []);
  }
  const typesByName = new Map<string, ResolvedDartType[]>();
  const callablesByName = new Map<string, ResolvedDartCallable[]>();
  for (const entry of types) {
    const values = typesByName.get(entry.fact.name) ?? [];
    values.push(entry);
    typesByName.set(entry.fact.name, values);
  }
  for (const entry of callables) {
    const values = callablesByName.get(entry.fact.name) ?? [];
    values.push(entry);
    callablesByName.set(entry.fact.name, values);
  }
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };
  const normalizedDartPath = (fromFilePath: string, importedPath: string): string | null => {
    const rawPath = importedPath.startsWith("package:")
      ? importedPath.slice(importedPath.indexOf(":") + 1)
      : !importedPath.startsWith("/") && !importedPath.includes(":")
        ? `${fromFilePath.slice(0, Math.max(0, fromFilePath.lastIndexOf("/")) + 1)}${importedPath}`
        : null;
    if (rawPath === null) return null;
    const parts: string[] = [];
    for (const part of rawPath.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        if (parts.length === 0) return null;
        parts.pop();
      } else parts.push(part);
    }
    const candidate = parts.join("/");
    const candidates = importedPath.startsWith("package:") && !candidate.startsWith("lib/")
      ? [candidate, `lib/${candidate}`]
      : [candidate];
    const matches = candidates.filter((value) => input.knownFilePaths.has(value));
    return matches.length === 1 ? matches[0]! : null;
  };
  const importTargetsByFile = new Map<string, string[]>();
  for (const imported of imports) {
    if (imported.isAliased || imported.hasShowHide) continue;
    const target = normalizedDartPath(imported.filePath, imported.importedPath);
    if (target === null) continue;
    const values = importTargetsByFile.get(imported.filePath) ?? [];
    if (!values.includes(target)) values.push(target);
    importTargetsByFile.set(imported.filePath, values);
    const source = fileSymbols.get(imported.filePath);
    const targetFile = fileSymbols.get(target);
    if (source === undefined || targetFile === undefined) continue;
    const kind = imported.relationKind;
    push({
      id: createEdgeId({ sourceId: source.id, targetId: targetFile.id, kind, line: imported.range.start.line, column: imported.range.start.column, referenceName: imported.importedPath }),
      sourceId: source.id,
      targetId: targetFile.id,
      kind,
      filePath: imported.filePath,
      range: imported.range,
      resolution: "exact",
      confidence: 1,
      referenceName: imported.importedPath,
      evidence: referenceEvidence(
        `module.dart.explicit-${kind === "imports" ? "import" : "export"}.unique-file`,
        "module",
        [targetFile.id],
        [],
        [imported.filePath, target]
      )
    });
  }
  const resolveType = (filePath: string, name: string): readonly ResolvedDartType[] => {
    const local = (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath);
    const importedFiles = importTargetsByFile.get(filePath) ?? [];
    const imported = (typesByName.get(name) ?? []).filter((candidate) => importedFiles.includes(candidate.symbol.filePath) && candidate.fact.isExported);
    const merged = [...local, ...imported];
    return [...new Map(merged.map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const visibleFrom = (filePath: string, candidate: { readonly fact: { readonly isExported: boolean }; readonly symbol: SymbolNode }): boolean => candidate.symbol.filePath === filePath || candidate.fact.isExported;
  const exactArity = (fact: DartCallableFact, argumentCount: number): boolean => fact.parameterCount === argumentCount && fact.requiredParameterCount === argumentCount;
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return {
      id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }),
      sourceId: value.sourceId,
      targetId: value.targetId,
      kind: value.kind,
      filePath: value.filePath,
      range: value.range,
      resolution: "exact",
      confidence: 1,
      referenceName: value.referenceName,
      evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : [])
    };
  };
  for (const callable of callables) {
    const names = callable.fact.parameterTypeNames ?? [];
    if (names.length === callable.fact.parameterCount) {
      for (const name of [...new Set(names)]) {
        const candidates = resolveType(callable.symbol.filePath, name).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
        if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: name, range: callable.fact.range, ruleId: "syntax.dart.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
      }
    }
    const returnName = callable.fact.returnTypeName;
    if (returnName !== undefined) {
      const candidates = resolveType(callable.symbol.filePath, returnName).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: returnName, range: callable.fact.range, ruleId: "syntax.dart.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): SymbolNode | undefined => {
    const source = input.symbolsById.get(sourceId);
    return source?.filePath === filePath && (source.kind === "function" || source.kind === "method") ? source : undefined;
  };
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    if (call.callKind === "direct") {
      const importedFiles = importTargetsByFile.get(call.filePath) ?? [];
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "function" && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate) && (candidate.symbol.filePath === call.filePath || importedFiles.includes(candidate.symbol.filePath)));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.dart.unique-direct-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.receiverTypeName === undefined) continue;
    const receiverCandidates = resolveType(call.filePath, call.receiverTypeName);
    if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) continue;
    const receiver = receiverCandidates[0];
    if (!visibleFrom(call.filePath, receiver) || receiver.fact.isAbstract === true || receiver.fact.declarationKind === "mixin" || receiver.fact.declarationKind === "enum" || receiver.fact.declarationKind === "typedef" || receiver.fact.declarationKind === "extension") continue;
    const members = callables.filter((candidate) => candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate) && ((candidate.fact.callableKind === "method" && candidate.fact.ownerTypeId === receiver.symbol.id) || (candidate.fact.callableKind === "extension" && candidate.fact.receiverTypeName === receiver.fact.name)));
    if (members.length === 1 && members[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: members[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: members[0].fact.callableKind === "extension" ? "syntax.dart.unique-extension-member-call" : "syntax.dart.unique-member-call", targetFilePath: members[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = resolveType(instantiation.filePath, instantiation.typeName).filter((candidate) => candidate.fact.declarationKind === "class" && visibleFrom(instantiation.filePath, candidate));
    if (candidates.length !== 1 || candidates[0] === undefined) continue;
    const initializers = callables.filter((candidate) => candidate.fact.callableKind === "constructor" && candidate.fact.ownerTypeId === candidates[0]!.symbol.id && exactArity(candidate.fact, instantiation.argumentCount) && visibleFrom(instantiation.filePath, candidate));
    if (initializers.length !== 1) continue;
    push(edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.dart.unique-constructor-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  const heritageEdges: GraphEdge[] = [];
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) continue;
    const candidates = resolveType(reference.filePath, reference.referenceName);
    if (candidates.length !== 1 || candidates[0] === undefined || !visibleFrom(reference.filePath, candidates[0])) continue;
    const target = candidates[0];
    const kind: GraphEdge["kind"] = reference.relationKind === "extends" ? "extends" : "implements";
    const edge = edgeFor({ sourceId: source.id, targetId: target.symbol.id, kind, filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: reference.relationKind === "with" ? "syntax.dart.unique-mixin-target" : reference.relationKind === "implements" ? "syntax.dart.unique-interface-target" : "syntax.dart.unique-extends-target", targetFilePath: target.symbol.filePath });
    heritageEdges.push(edge);
    push(edge);
  }
  for (const override of overrides) {
    const source = input.symbolsById.get(override.sourceId);
    if (source?.filePath !== override.filePath) continue;
    const owner = types.find((candidate) => candidate.symbol.filePath === override.filePath && candidate.fact.name === override.ownerTypeName);
    const sourceCallableFact = callables.find((candidate) => candidate.symbol.id === source.id);
    if (owner === undefined || sourceCallableFact === undefined) continue;
    const parents = heritageEdges.filter((edge) => edge.sourceId === owner.symbol.id && edge.targetId !== null);
    const parentMethods = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.name === override.methodName && exactArity(candidate.fact, sourceCallableFact.fact.parameterCount) && parents.some((parent) => parent.targetId === candidate.fact.ownerTypeId));
    if (parentMethods.length !== 1 || parentMethods[0] === undefined) continue;
    push(edgeFor({ sourceId: source.id, targetId: parentMethods[0].symbol.id, kind: "overrides", filePath: override.filePath, referenceName: override.methodName, range: override.range, ruleId: "syntax.dart.explicit-direct-base-method", targetFilePath: parentMethods[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

interface ResolvedCsharpType {
  readonly fact: CsharpTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedCsharpCallable {
  readonly fact: CsharpCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects C# facts through literal using/namespace evidence without Roslyn, NuGet, or assembly loading. */
function projectCsharpRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const types: ResolvedCsharpType[] = [];
  const callables: ResolvedCsharpCallable[] = [];
  const usings: CsharpUsingFact[] = [];
  const calls: CsharpCallFact[] = [];
  const instantiations: CsharpInstantiationFact[] = [];
  const heritage: CsharpHeritageFact[] = [];
  const overrides: CsharpOverrideFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const csharpFacts = facts.csharpFacts;
    if (csharpFacts === undefined) continue;
    for (const fact of csharpFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of csharpFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    usings.push(...csharpFacts.usings);
    calls.push(...csharpFacts.calls);
    instantiations.push(...csharpFacts.instantiations);
    heritage.push(...csharpFacts.heritage ?? []);
    overrides.push(...csharpFacts.overrides ?? []);
  }
  const typesByName = new Map<string, ResolvedCsharpType[]>();
  const typesByPath = new Map<string, ResolvedCsharpType[]>();
  for (const entry of types) {
    const byName = typesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    typesByName.set(entry.fact.name, byName);
    const byPath = typesByPath.get(entry.fact.qualifiedTypePath) ?? [];
    byPath.push(entry);
    typesByPath.set(entry.fact.qualifiedTypePath, byPath);
  }
  const callablesByName = new Map<string, ResolvedCsharpCallable[]>();
  for (const entry of callables) {
    const byName = callablesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    callablesByName.set(entry.fact.name, byName);
  }
  const usingByFile = new Map<string, CsharpUsingFact[]>();
  for (const fact of usings) {
    const values = usingByFile.get(fact.filePath) ?? [];
    values.push(fact);
    usingByFile.set(fact.filePath, values);
  }
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); }
  };
  const visibleFrom = (filePath: string, candidate: { readonly fact: { readonly isExported: boolean }; readonly symbol: SymbolNode }): boolean => candidate.symbol.filePath === filePath || candidate.fact.isExported;
  const exactArity = (fact: CsharpCallableFact, count: number): boolean => fact.parameterCount === count && fact.requiredParameterCount === count;
  const resolveType = (filePath: string, name: string): readonly ResolvedCsharpType[] => {
    const direct = (typesByPath.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath);
    const local = (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath);
    const importedNamespaces = (usingByFile.get(filePath) ?? []).filter((fact) => !fact.isAlias && !fact.isStatic).map((fact) => fact.importedPath);
    const imported = (typesByName.get(name) ?? []).filter((candidate) => importedNamespaces.includes(candidate.fact.namespaceName) && candidate.fact.isExported);
    return [...new Map([...direct, ...local, ...imported].map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return {
      id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }),
      sourceId: value.sourceId,
      targetId: value.targetId,
      kind: value.kind,
      filePath: value.filePath,
      range: value.range,
      resolution: "exact",
      confidence: 1,
      referenceName: value.referenceName,
      evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : [])
    };
  };
  for (const imported of usings.filter((fact) => !fact.isAlias && !fact.isStatic)) {
    const source = fileSymbols.get(imported.filePath);
    const targetFiles = [...new Set(types.filter((candidate) => candidate.fact.namespaceName === imported.importedPath && candidate.symbol.filePath !== imported.filePath && candidate.fact.isExported).map((candidate) => candidate.symbol.filePath))];
    const target = targetFiles.length === 1 ? fileSymbols.get(targetFiles[0]!) : undefined;
    if (source === undefined || target === undefined) continue;
    push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: imported.filePath, referenceName: imported.importedPath, range: imported.range, ruleId: "module.csharp.explicit-using.unique-file", targetFilePath: target.filePath }));
  }
  for (const callable of callables) {
    const parameterNames = callable.fact.parameterTypeNames ?? [];
    if (parameterNames.length === callable.fact.parameterCount) {
      for (const name of [...new Set(parameterNames)]) {
        const candidates = resolveType(callable.symbol.filePath, name).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
        if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: name, range: callable.fact.range, ruleId: "syntax.csharp.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
      }
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = resolveType(callable.symbol.filePath, callable.fact.returnTypeName).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.csharp.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): SymbolNode | undefined => {
    const source = input.symbolsById.get(sourceId);
    return source?.filePath === filePath && (source.kind === "function" || source.kind === "method") ? source : undefined;
  };
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    if (call.callKind === "direct") {
      const namespaces = (usingByFile.get(call.filePath) ?? []).filter((fact) => !fact.isAlias && !fact.isStatic).map((fact) => fact.importedPath);
      const sourceOwnerName = source.qualifiedName.split("#").at(-1)?.split(".").slice(0, -1).at(-1) ?? null;
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) =>
        exactArity(candidate.fact, call.argumentCount) &&
        visibleFrom(call.filePath, candidate) &&
        (candidate.fact.callableKind === "function" && (candidate.symbol.filePath === call.filePath || namespaces.includes(candidate.fact.namespaceName)) ||
          candidate.fact.callableKind === "method" && candidate.symbol.filePath === call.filePath && candidate.fact.isStatic && candidate.fact.ownerTypeName === sourceOwnerName)
      );
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.csharp.unique-direct-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.receiverTypeName === undefined) continue;
    const receiverCandidates = resolveType(call.filePath, call.receiverTypeName);
    if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) continue;
    const receiver = receiverCandidates[0];
    if (!visibleFrom(call.filePath, receiver) || receiver.fact.declarationKind === "interface" || receiver.fact.declarationKind === "enum" || receiver.fact.declarationKind === "delegate" || receiver.fact.declarationKind === "namespace") continue;
    const members = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate) && candidate.fact.ownerTypeId === receiver.symbol.id && (call.receiverIsType === true ? candidate.fact.isStatic : !candidate.fact.isStatic));
    if (members.length === 1 && members[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: members[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.csharp.unique-member-call", targetFilePath: members[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = resolveType(instantiation.filePath, instantiation.typeName).filter((candidate) => ["class", "record", "struct"].includes(candidate.fact.declarationKind) && visibleFrom(instantiation.filePath, candidate));
    if (candidates.length !== 1 || candidates[0] === undefined) continue;
    const constructors = callables.filter((candidate) => candidate.fact.callableKind === "constructor" && candidate.fact.ownerTypeId === candidates[0]!.symbol.id && exactArity(candidate.fact, instantiation.argumentCount) && visibleFrom(instantiation.filePath, candidate));
    if (constructors.length === 1) push(edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.csharp.unique-constructor-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  const heritageEdges: GraphEdge[] = [];
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) continue;
    const candidates = resolveType(reference.filePath, reference.referenceName);
    if (candidates.length !== 1 || candidates[0] === undefined || !visibleFrom(reference.filePath, candidates[0])) continue;
    const kind: GraphEdge["kind"] = candidates[0].fact.declarationKind === "interface" ? "implements" : "extends";
    const edge = edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind, filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: kind === "implements" ? "syntax.csharp.unique-interface-target" : "syntax.csharp.unique-extends-target", targetFilePath: candidates[0].symbol.filePath });
    heritageEdges.push(edge);
    push(edge);
  }
  for (const override of overrides) {
    const source = input.symbolsById.get(override.sourceId);
    const owner = types.find((candidate) => candidate.symbol.filePath === override.filePath && candidate.fact.name === override.ownerTypeName);
    const sourceFact = callables.find((candidate) => candidate.symbol.id === override.sourceId);
    if (source?.filePath !== override.filePath || owner === undefined || sourceFact === undefined) continue;
    const parents = heritageEdges.filter((edge) => edge.sourceId === owner.symbol.id && edge.targetId !== null);
    const parentMethods = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.name === override.methodName && exactArity(candidate.fact, sourceFact.fact.parameterCount) && parents.some((parent) => parent.targetId === candidate.fact.ownerTypeId));
    if (parentMethods.length === 1 && parentMethods[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: parentMethods[0].symbol.id, kind: "overrides", filePath: override.filePath, referenceName: override.methodName, range: override.range, ruleId: "syntax.csharp.explicit-direct-base-method", targetFilePath: parentMethods[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

interface ResolvedFsharpType {
  readonly fact: FsharpTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedFsharpCallable {
  readonly fact: FsharpCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects F# facts through explicit open/module and type annotations without compiler inference. */
function projectFsharpRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const types: ResolvedFsharpType[] = [];
  const callables: ResolvedFsharpCallable[] = [];
  const opens: FsharpOpenFact[] = [];
  const calls: FsharpCallFact[] = [];
  const instantiations: FsharpInstantiationFact[] = [];
  const heritage: FsharpHeritageFact[] = [];
  const overrides: FsharpOverrideFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const fsharpFacts = facts.fsharpFacts;
    if (fsharpFacts === undefined) continue;
    for (const fact of fsharpFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of fsharpFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    opens.push(...fsharpFacts.opens);
    calls.push(...fsharpFacts.calls);
    instantiations.push(...fsharpFacts.instantiations);
    heritage.push(...fsharpFacts.heritage ?? []);
    overrides.push(...fsharpFacts.overrides ?? []);
  }
  const typesByName = new Map<string, ResolvedFsharpType[]>();
  const typesByPath = new Map<string, ResolvedFsharpType[]>();
  for (const entry of types) {
    const byName = typesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    typesByName.set(entry.fact.name, byName);
    const byPath = typesByPath.get(entry.fact.qualifiedTypePath) ?? [];
    byPath.push(entry);
    typesByPath.set(entry.fact.qualifiedTypePath, byPath);
  }
  const callablesByName = new Map<string, ResolvedFsharpCallable[]>();
  for (const entry of callables) {
    const byName = callablesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    callablesByName.set(entry.fact.name, byName);
  }
  const opensByFile = new Map<string, FsharpOpenFact[]>();
  for (const open of opens) {
    const values = opensByFile.get(open.filePath) ?? [];
    values.push(open);
    opensByFile.set(open.filePath, values);
  }
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); }
  };
  const visibleFrom = (filePath: string, candidate: { readonly fact: { readonly isExported: boolean }; readonly symbol: SymbolNode }): boolean => candidate.symbol.filePath === filePath || candidate.fact.isExported;
  const exactArity = (fact: FsharpCallableFact, count: number): boolean => fact.parameterCount === count && fact.requiredParameterCount === count;
  const openedModules = (filePath: string): readonly string[] => (opensByFile.get(filePath) ?? []).filter((open) => !open.isAlias).map((open) => open.importedPath);
  const resolveType = (filePath: string, name: string, moduleName = ""): readonly ResolvedFsharpType[] => {
    const direct = typesByPath.get(name) ?? [];
    const local = (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath || (moduleName !== "" && candidate.fact.moduleName === moduleName));
    const imported = (typesByName.get(name) ?? []).filter((candidate) => openedModules(filePath).includes(candidate.fact.moduleName));
    return [...new Map([...direct, ...local, ...imported].map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return {
      id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }),
      sourceId: value.sourceId,
      targetId: value.targetId,
      kind: value.kind,
      filePath: value.filePath,
      range: value.range,
      resolution: "exact",
      confidence: 1,
      referenceName: value.referenceName,
      evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : [])
    };
  };
  for (const open of opens) {
    const source = fileSymbols.get(open.filePath);
    const targets = [...new Set(types.filter((candidate) => (candidate.fact.declarationKind === "module" || candidate.fact.declarationKind === "namespace") && candidate.fact.qualifiedTypePath === open.importedPath && candidate.symbol.filePath !== open.filePath && candidate.fact.isExported).map((candidate) => candidate.symbol.filePath))];
    const target = targets.length === 1 ? fileSymbols.get(targets[0]!) : undefined;
    if (!open.isAlias && source !== undefined && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: open.filePath, referenceName: open.importedPath, range: open.range, ruleId: "module.fsharp.explicit-open.unique-module", targetFilePath: target.filePath }));
  }
  for (const callable of callables) {
    const parameterNames = callable.fact.parameterTypeNames ?? [];
    if (parameterNames.length === callable.fact.parameterCount) {
      for (const name of [...new Set(parameterNames)]) {
        const candidates = resolveType(callable.symbol.filePath, name, callable.fact.moduleName).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
        if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: name, range: callable.fact.range, ruleId: "syntax.fsharp.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
      }
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = resolveType(callable.symbol.filePath, callable.fact.returnTypeName, callable.fact.moduleName).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.fsharp.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedFsharpCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    const sourceModule = source.fact.moduleName;
    if (call.callKind === "direct" || call.callKind === "pipeline") {
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "function" && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate) && (candidate.symbol.filePath === call.filePath || candidate.fact.moduleName === sourceModule || openedModules(call.filePath).includes(candidate.fact.moduleName)));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: call.callKind === "pipeline" ? "syntax.fsharp.unique-pipeline-function-call" : "syntax.fsharp.unique-direct-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.receiverTypeName === undefined) continue;
    const receiverTypes = resolveType(call.filePath, call.receiverTypeName, sourceModule);
    if (receiverTypes.length === 1 && receiverTypes[0] !== undefined) {
      const receiver = receiverTypes[0];
      if (!visibleFrom(call.filePath, receiver) || ["interface", "enum", "delegate", "module", "namespace", "union"].includes(receiver.fact.declarationKind)) continue;
      const members = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.ownerTypeId === receiver.symbol.id && candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate) && (call.receiverIsType === true ? candidate.fact.isStatic : !candidate.fact.isStatic));
      if (members.length === 1 && members[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: members[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.fsharp.unique-member-call", targetFilePath: members[0].symbol.filePath }));
      continue;
    }
    const moduleNames = [...new Set(types.filter((candidate) => (candidate.fact.declarationKind === "module" || candidate.fact.declarationKind === "namespace") && (candidate.fact.qualifiedTypePath === call.receiverTypeName || candidate.fact.qualifiedTypePath.endsWith(`.${call.receiverTypeName}`))).map((candidate) => candidate.fact.qualifiedTypePath))].filter((name) => sourceModule === "" || name.startsWith(sourceModule) || openedModules(call.filePath).some((open) => name.startsWith(open)));
    const moduleFunctions = callables.filter((candidate) => candidate.fact.callableKind === "function" && candidate.fact.moduleName !== "" && moduleNames.includes(candidate.fact.moduleName) && candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate));
    if (moduleFunctions.length === 1 && moduleFunctions[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: moduleFunctions[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "module.fsharp.unique-module-function-call", targetFilePath: moduleFunctions[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = resolveType(instantiation.filePath, instantiation.typeName, source.fact.moduleName).filter((candidate) => candidate.fact.declarationKind === "class" && visibleFrom(instantiation.filePath, candidate));
    if (candidates.length !== 1 || candidates[0] === undefined) continue;
    const constructors = callables.filter((candidate) => candidate.fact.callableKind === "constructor" && candidate.fact.ownerTypeId === candidates[0]!.symbol.id && exactArity(candidate.fact, instantiation.argumentCount) && visibleFrom(instantiation.filePath, candidate));
    if (constructors.length === 1) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.fsharp.unique-constructor-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  const heritageEdges: GraphEdge[] = [];
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) continue;
    const sourceFact = types.find((candidate) => candidate.symbol.id === source.id);
    const candidates = resolveType(reference.filePath, reference.referenceName, sourceFact?.fact.moduleName ?? "");
    if (candidates.length !== 1 || candidates[0] === undefined || !visibleFrom(reference.filePath, candidates[0])) continue;
    const kind: GraphEdge["kind"] = candidates[0].fact.declarationKind === "interface" ? "implements" : "extends";
    const edge = edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind, filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: kind === "implements" ? "syntax.fsharp.unique-interface-target" : "syntax.fsharp.unique-extends-target", targetFilePath: candidates[0].symbol.filePath });
    heritageEdges.push(edge);
    push(edge);
  }
  for (const override of overrides) {
    const source = input.symbolsById.get(override.sourceId);
    const owner = types.find((candidate) => candidate.symbol.filePath === override.filePath && candidate.fact.name === override.ownerTypeName);
    const sourceFact = callables.find((candidate) => candidate.symbol.id === override.sourceId);
    if (source?.filePath !== override.filePath || owner === undefined || sourceFact === undefined) continue;
    const parents = heritageEdges.filter((edge) => edge.sourceId === owner.symbol.id);
    const parentMethods = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.name === override.methodName && exactArity(candidate.fact, sourceFact.fact.parameterCount) && parents.some((parent) => parent.targetId === candidate.fact.ownerTypeId));
    if (parentMethods.length === 1 && parentMethods[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: parentMethods[0].symbol.id, kind: "overrides", filePath: override.filePath, referenceName: override.methodName, range: override.range, ruleId: "syntax.fsharp.explicit-direct-base-method", targetFilePath: parentMethods[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

interface ResolvedOcamlType {
  readonly fact: OcamlTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedOcamlCallable {
  readonly fact: OcamlCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects OCaml facts through explicit open/module and annotated types without compiler inference. */
function projectOcamlRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const types: ResolvedOcamlType[] = [];
  const callables: ResolvedOcamlCallable[] = [];
  const opens: OcamlOpenFact[] = [];
  const calls: OcamlCallFact[] = [];
  const instantiations: OcamlInstantiationFact[] = [];
  const heritage: OcamlHeritageFact[] = [];
  const overrides: OcamlOverrideFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const ocamlFacts = facts.ocamlFacts;
    if (ocamlFacts === undefined) continue;
    for (const fact of ocamlFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of ocamlFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    opens.push(...ocamlFacts.opens);
    calls.push(...ocamlFacts.calls);
    instantiations.push(...ocamlFacts.instantiations);
    heritage.push(...ocamlFacts.heritage ?? []);
    overrides.push(...ocamlFacts.overrides ?? []);
  }
  const typesByName = new Map<string, ResolvedOcamlType[]>();
  const typesByPath = new Map<string, ResolvedOcamlType[]>();
  for (const entry of types) {
    const byName = typesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    typesByName.set(entry.fact.name, byName);
    const byPath = typesByPath.get(entry.fact.qualifiedTypePath) ?? [];
    byPath.push(entry);
    typesByPath.set(entry.fact.qualifiedTypePath, byPath);
  }
  const callablesByName = new Map<string, ResolvedOcamlCallable[]>();
  for (const entry of callables) {
    const byName = callablesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    callablesByName.set(entry.fact.name, byName);
  }
  const opensByFile = new Map<string, OcamlOpenFact[]>();
  for (const open of opens) {
    const values = opensByFile.get(open.filePath) ?? [];
    values.push(open);
    opensByFile.set(open.filePath, values);
  }
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const visibleFrom = (filePath: string, candidate: { readonly fact: { readonly isExported: boolean }; readonly symbol: SymbolNode }): boolean => candidate.symbol.filePath === filePath || candidate.fact.isExported;
  const exactArity = (fact: OcamlCallableFact, count: number): boolean => fact.parameterCount === count && fact.requiredParameterCount === count;
  const openedModules = (filePath: string): readonly string[] => (opensByFile.get(filePath) ?? []).filter((open) => !open.isAlias).map((open) => open.importedPath);
  const resolveType = (filePath: string, name: string, moduleName = ""): readonly ResolvedOcamlType[] => {
    const direct = typesByPath.get(name) ?? [];
    const local = (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath || (moduleName !== "" && candidate.fact.moduleName === moduleName));
    const imported = (typesByName.get(name) ?? []).filter((candidate) => openedModules(filePath).includes(candidate.fact.moduleName));
    return [...new Map([...direct, ...local, ...imported].map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  for (const open of opens) {
    const source = fileSymbols.get(open.filePath);
    const targetFiles = [...new Set(types.filter((candidate) => candidate.fact.declarationKind === "module" && candidate.fact.qualifiedTypePath === open.importedPath && candidate.symbol.filePath !== open.filePath && candidate.fact.isExported).map((candidate) => candidate.symbol.filePath))];
    const target = targetFiles.length === 1 ? fileSymbols.get(targetFiles[0]!) : undefined;
    if (!open.isAlias && source !== undefined && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: open.filePath, referenceName: open.importedPath, range: open.range, ruleId: "module.ocaml.explicit-open.unique-module", targetFilePath: target.filePath }));
  }
  for (const callable of callables) {
    const parameterNames = callable.fact.parameterTypeNames ?? [];
    if (parameterNames.length === callable.fact.parameterCount) for (const name of [...new Set(parameterNames)]) {
      const candidates = resolveType(callable.symbol.filePath, name, callable.fact.moduleName).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: name, range: callable.fact.range, ruleId: "syntax.ocaml.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = resolveType(callable.symbol.filePath, callable.fact.returnTypeName, callable.fact.moduleName).filter((candidate) => visibleFrom(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.ocaml.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedOcamlCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    if (call.callKind === "direct") {
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "function" && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate) && (candidate.symbol.filePath === call.filePath || candidate.fact.moduleName === source.fact.moduleName || openedModules(call.filePath).includes(candidate.fact.moduleName)));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.ocaml.unique-direct-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.callKind === "module") {
      const moduleName = call.receiverModuleName ?? call.receiverName ?? "";
      const moduleCandidates = types.filter((candidate) => candidate.fact.declarationKind === "module" && (candidate.fact.qualifiedTypePath === moduleName || candidate.fact.qualifiedTypePath.endsWith(`.${moduleName}`)) && (source.fact.moduleName === "" || candidate.fact.qualifiedTypePath.startsWith(source.fact.moduleName) || openedModules(call.filePath).some((open) => candidate.fact.qualifiedTypePath.startsWith(open))));
      const candidates = callables.filter((candidate) => candidate.fact.callableKind === "function" && candidate.fact.moduleName !== "" && moduleCandidates.some((module) => module.fact.qualifiedTypePath === candidate.fact.moduleName) && candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "module.ocaml.unique-module-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.receiverTypeName === undefined) continue;
    const receiverTypes = resolveType(call.filePath, call.receiverTypeName, source.fact.moduleName);
    if (receiverTypes.length !== 1 || receiverTypes[0] === undefined) continue;
    const receiver = receiverTypes[0];
    if (!visibleFrom(call.filePath, receiver) || ["module", "interface", "variant", "enum"].includes(receiver.fact.declarationKind)) continue;
    const members = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.ownerTypeId === receiver.symbol.id && candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && visibleFrom(call.filePath, candidate));
    if (members.length === 1 && members[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: members[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.ocaml.unique-member-call", targetFilePath: members[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = resolveType(instantiation.filePath, instantiation.typeName, source.fact.moduleName).filter((candidate) => candidate.fact.declarationKind === "class" && visibleFrom(instantiation.filePath, candidate));
    if (candidates.length !== 1 || candidates[0] === undefined) continue;
    const constructors = callables.filter((candidate) => candidate.fact.callableKind === "constructor" && candidate.fact.ownerTypeId === candidates[0]!.symbol.id && exactArity(candidate.fact, instantiation.argumentCount) && visibleFrom(instantiation.filePath, candidate));
    if (constructors.length === 1) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.ocaml.unique-constructor-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  const heritageEdges: GraphEdge[] = [];
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) continue;
    const sourceFact = types.find((candidate) => candidate.symbol.id === source.id);
    const candidates = resolveType(reference.filePath, reference.referenceName, sourceFact?.fact.moduleName ?? "");
    if (candidates.length !== 1 || candidates[0] === undefined || !visibleFrom(reference.filePath, candidates[0])) continue;
    const kind: GraphEdge["kind"] = candidates[0].fact.declarationKind === "interface" ? "implements" : "extends";
    const edge = edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind, filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: kind === "implements" ? "syntax.ocaml.unique-interface-target" : "syntax.ocaml.unique-extends-target", targetFilePath: candidates[0].symbol.filePath });
    heritageEdges.push(edge);
    push(edge);
  }
  for (const override of overrides) {
    const source = input.symbolsById.get(override.sourceId);
    const owner = types.find((candidate) => candidate.symbol.filePath === override.filePath && candidate.fact.name === override.ownerTypeName);
    const sourceFact = callables.find((candidate) => candidate.symbol.id === override.sourceId);
    if (source?.filePath !== override.filePath || owner === undefined || sourceFact === undefined) continue;
    const parents = heritageEdges.filter((edge) => edge.sourceId === owner.symbol.id);
    const parentMethods = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.name === override.methodName && exactArity(candidate.fact, sourceFact.fact.parameterCount) && parents.some((parent) => parent.targetId === candidate.fact.ownerTypeId));
    if (parentMethods.length === 1 && parentMethods[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: parentMethods[0].symbol.id, kind: "overrides", filePath: override.filePath, referenceName: override.methodName, range: override.range, ruleId: "syntax.ocaml.explicit-direct-base-method", targetFilePath: parentMethods[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

interface ResolvedHaskellType {
  readonly fact: HaskellTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedHaskellCallable {
  readonly fact: HaskellCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Haskell facts through explicit imports and simple signatures without compiler inference. */
function projectHaskellRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const types: ResolvedHaskellType[] = [];
  const callables: ResolvedHaskellCallable[] = [];
  const imports: HaskellImportFact[] = [];
  const calls: HaskellCallFact[] = [];
  const instantiations: HaskellInstantiationFact[] = [];
  const heritage: HaskellHeritageFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const haskellFacts = facts.haskellFacts;
    if (haskellFacts === undefined) continue;
    for (const fact of haskellFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of haskellFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...haskellFacts.imports);
    calls.push(...haskellFacts.calls);
    instantiations.push(...haskellFacts.instantiations);
    heritage.push(...haskellFacts.heritage ?? []);
  }
  const typesByName = new Map<string, ResolvedHaskellType[]>();
  const typesByPath = new Map<string, ResolvedHaskellType[]>();
  for (const entry of types) {
    const byName = typesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    typesByName.set(entry.fact.name, byName);
    const byPath = typesByPath.get(entry.fact.qualifiedTypePath) ?? [];
    byPath.push(entry);
    typesByPath.set(entry.fact.qualifiedTypePath, byPath);
  }
  const callablesByName = new Map<string, ResolvedHaskellCallable[]>();
  for (const entry of callables) {
    const byName = callablesByName.get(entry.fact.name) ?? [];
    byName.push(entry);
    callablesByName.set(entry.fact.name, byName);
  }
  const importsByFile = new Map<string, HaskellImportFact[]>();
  for (const importFact of imports) {
    const values = importsByFile.get(importFact.filePath) ?? [];
    values.push(importFact);
    importsByFile.set(importFact.filePath, values);
  }
  const modulesByName = new Map<string, ResolvedHaskellType[]>();
  for (const entry of types.filter((candidate) => candidate.fact.declarationKind === "module")) {
    const values = modulesByName.get(entry.fact.qualifiedTypePath) ?? [];
    values.push(entry);
    modulesByName.set(entry.fact.qualifiedTypePath, values);
  }
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const exactArity = (fact: HaskellCallableFact, count: number): boolean => fact.parameterCount === count && fact.requiredParameterCount === count;
  const importMatches = (filePath: string, moduleName: string, name: string, options: { readonly qualified?: boolean; readonly unqualified?: boolean } = {}): boolean => (importsByFile.get(filePath) ?? []).some((importFact) => importFact.importedModule === moduleName && (options.qualified === undefined || importFact.isQualified === options.qualified) && (options.unqualified === undefined || importFact.isQualified !== options.unqualified) && (importFact.importedNames === undefined || importFact.importedNames.includes(name)));
  const visibleFrom = (filePath: string, candidate: { readonly fact: { readonly isExported: boolean; readonly moduleName: string; readonly name: string }; readonly symbol: SymbolNode }, mode: "value" | "type" = "value"): boolean => candidate.symbol.filePath === filePath || (candidate.fact.isExported && importMatches(filePath, candidate.fact.moduleName, candidate.fact.name, mode === "value" ? { unqualified: true } : { unqualified: true }));
  const resolveType = (filePath: string, name: string, moduleName = ""): readonly ResolvedHaskellType[] => {
    const direct = typesByPath.get(name) ?? [];
    const local = (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath || (moduleName !== "" && candidate.fact.moduleName === moduleName));
    const imported = (typesByName.get(name) ?? []).filter((candidate) => importMatches(filePath, candidate.fact.moduleName, candidate.fact.name, { unqualified: true }));
    return [...new Map([...direct, ...local, ...imported].map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  for (const importFact of imports) {
    const source = fileSymbols.get(importFact.filePath);
    const targets = modulesByName.get(importFact.importedModule) ?? [];
    const targetFiles = [...new Set(targets.filter((candidate) => candidate.symbol.filePath !== importFact.filePath && candidate.fact.isExported).map((candidate) => candidate.symbol.filePath))];
    const target = targetFiles.length === 1 ? fileSymbols.get(targetFiles[0]!) : undefined;
    if (source !== undefined && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: importFact.filePath, referenceName: importFact.importedModule, range: importFact.range, ruleId: "module.haskell.explicit-import.unique-module", targetFilePath: target.filePath }));
  }
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = resolveType(callable.symbol.filePath, typeName, callable.fact.moduleName).filter((candidate) => candidate.fact.declarationKind !== "module" && visibleFrom(callable.symbol.filePath, candidate, "type"));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.haskell.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = resolveType(callable.symbol.filePath, callable.fact.returnTypeName, callable.fact.moduleName).filter((candidate) => candidate.fact.declarationKind !== "module" && visibleFrom(callable.symbol.filePath, candidate, "type"));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.haskell.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedHaskellCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    if (call.callKind === "direct") {
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "function" && exactArity(candidate.fact, call.argumentCount) && (candidate.symbol.filePath === call.filePath || candidate.fact.moduleName === source.fact.moduleName || importMatches(call.filePath, candidate.fact.moduleName, candidate.fact.name, { unqualified: true })));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.haskell.unique-direct-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    const moduleName = call.receiverModuleName ?? call.receiverAlias ?? "";
    const qualifiedImports = (importsByFile.get(call.filePath) ?? []).filter((importFact) => importFact.isQualified && (importFact.alias ?? importFact.importedModule.split(".").at(-1)) === moduleName);
    const moduleTargets = [...new Set(qualifiedImports.map((importFact) => importFact.importedModule))].flatMap((name) => modulesByName.get(name) ?? []);
    const candidates = callables.filter((candidate) => candidate.fact.callableKind === "function" && candidate.fact.name === call.referenceName && exactArity(candidate.fact, call.argumentCount) && moduleTargets.some((module) => module.fact.qualifiedTypePath === candidate.fact.moduleName) && (candidate.fact.isExported && (qualifiedImports.some((importFact) => importFact.importedModule === candidate.fact.moduleName && (importFact.importedNames === undefined || importFact.importedNames.includes(candidate.fact.name))))));
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "module.haskell.unique-qualified-function-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = types.filter((candidate) => candidate.fact.constructorNames?.includes(instantiation.constructorName) === true && candidate.fact.constructorArities?.[instantiation.constructorName] === instantiation.argumentCount && (candidate.symbol.filePath === instantiation.filePath || importMatches(instantiation.filePath, candidate.fact.moduleName, instantiation.constructorName, { unqualified: true })));
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.constructorName, range: instantiation.range, ruleId: "syntax.haskell.unique-constructor-creation", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) continue;
    const sourceType = types.find((candidate) => candidate.symbol.id === source.id);
    const candidates = resolveType(reference.filePath, reference.referenceName, sourceType?.fact.moduleName ?? "").filter((candidate) => candidate.fact.declarationKind === "class");
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: "implements", filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: "syntax.haskell.unique-typeclass-instance", targetFilePath: candidates[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

interface ResolvedScalaRelationType {
  readonly fact: ScalaRelationTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedScalaRelationCallable {
  readonly fact: ScalaRelationCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Scala facts through explicit imports and direct owner/member proof without compiler inference. */
function projectScalaRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const types: ResolvedScalaRelationType[] = [];
  const callables: ResolvedScalaRelationCallable[] = [];
  const imports: ScalaRelationImportFact[] = [];
  const calls: ScalaRelationCallFact[] = [];
  const instantiations: ScalaRelationInstantiationFact[] = [];
  const heritage: ScalaRelationHeritageFact[] = [];
  const overrides: ScalaRelationOverrideFact[] = [];
  const packageByFile = new Map<string, string>();
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const relationFacts = facts.scalaRelationFacts;
    if (relationFacts === undefined) continue;
    packageByFile.set(filePath, relationFacts.packageName);
    for (const fact of relationFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of relationFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...relationFacts.imports);
    calls.push(...relationFacts.calls);
    instantiations.push(...relationFacts.instantiations);
    heritage.push(...relationFacts.heritage ?? []);
    overrides.push(...relationFacts.overrides ?? []);
  }
  const typesByPath = new Map<string, ResolvedScalaRelationType[]>();
  const typesByName = new Map<string, ResolvedScalaRelationType[]>();
  const callablesByName = new Map<string, ResolvedScalaRelationCallable[]>();
  for (const entry of types) {
    typesByPath.set(entry.fact.qualifiedTypePath, [...(typesByPath.get(entry.fact.qualifiedTypePath) ?? []), entry]);
    typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
  }
  for (const entry of callables) callablesByName.set(entry.fact.name, [...(callablesByName.get(entry.fact.name) ?? []), entry]);
  const importsByFile = new Map<string, ScalaRelationImportFact[]>();
  for (const importFact of imports) importsByFile.set(importFact.filePath, [...(importsByFile.get(importFact.filePath) ?? []), importFact]);
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const exactArity = (fact: ScalaRelationCallableFact, count: number): boolean => fact.parameterCount === count && fact.requiredParameterCount === count;
  const importedPathFor = (filePath: string, localName: string, wildcard = false): readonly string[] => (importsByFile.get(filePath) ?? []).filter((fact) => !fact.isWildcard && (wildcard || fact.localName === localName)).map((fact) => fact.importedPath);
  const typeCandidates = (filePath: string, name: string): readonly ResolvedScalaRelationType[] => {
    const direct = typesByPath.get(name) ?? [];
    const imported = importedPathFor(filePath, name).flatMap((path) => typesByPath.get(path) ?? []);
    const packageName = packageByFile.get(filePath) ?? "";
    const samePackage = (typesByName.get(name) ?? []).filter((candidate) => candidate.fact.packageName === packageName);
    return [...new Map([...direct, ...imported, ...samePackage].map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const visibleType = (filePath: string, candidate: ResolvedScalaRelationType): boolean => candidate.symbol.filePath === filePath || (candidate.fact.isExported && (candidate.fact.packageName === (packageByFile.get(filePath) ?? "") || importedPathFor(filePath, candidate.fact.name).includes(candidate.fact.qualifiedTypePath)));
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  for (const importFact of imports) {
    if (importFact.isWildcard || importFact.isAliased) continue;
    const source = input.symbolsById.get(importFact.sourceId);
    const candidates = typesByPath.get(importFact.importedPath) ?? [];
    const targetFiles = [...new Set(candidates.filter((candidate) => candidate.symbol.filePath !== importFact.filePath && candidate.fact.isExported).map((candidate) => candidate.symbol.filePath))];
    const target = targetFiles.length === 1 ? input.symbolsById.get([...input.symbolsById.values()].find((symbol) => symbol.kind === "file" && symbol.filePath === targetFiles[0])?.id ?? "") : undefined;
    if (source?.kind === "file" && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: importFact.filePath, referenceName: importFact.importedPath, range: importFact.range, ruleId: "module.scala.explicit-import.unique-target", targetFilePath: target.filePath }));
  }
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = typeCandidates(callable.symbol.filePath, typeName).filter((candidate) => candidate.fact.declarationKind !== "object" && visibleType(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.scala.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = typeCandidates(callable.symbol.filePath, callable.fact.returnTypeName).filter((candidate) => candidate.fact.declarationKind !== "object" && visibleType(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.scala.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedScalaRelationCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    if (call.callKind === "direct") {
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind !== "constructor" && exactArity(candidate.fact, call.argumentCount) && (candidate.symbol.filePath === call.filePath && candidate.fact.ownerTypeId === source.fact.ownerTypeId || candidate.symbol.filePath === call.filePath && candidate.fact.ownerTypeId === undefined));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.scala.unique-direct-owner-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.callKind === "module") {
      const objectCandidates = typeCandidates(call.filePath, call.receiverObjectName ?? "").filter((candidate) => candidate.fact.declarationKind === "object" && visibleType(call.filePath, candidate));
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "method" && exactArity(candidate.fact, call.argumentCount) && objectCandidates.some((object) => object.symbol.id === candidate.fact.ownerTypeId));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "module.scala.unique-object-method-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.receiverTypeName === undefined) continue;
    const receiverCandidates = typeCandidates(call.filePath, call.receiverTypeName).filter((candidate) => candidate.fact.declarationKind === "class" || candidate.fact.declarationKind === "caseclass");
    if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) continue;
    const members = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.ownerTypeId === receiverCandidates[0]!.symbol.id && exactArity(candidate.fact, call.argumentCount));
    if (members.length === 1 && members[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: members[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.scala.unique-typed-member-call", targetFilePath: members[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = typeCandidates(instantiation.filePath, instantiation.typeName).filter((candidate) => (candidate.fact.declarationKind === "class" || candidate.fact.declarationKind === "caseclass") && visibleType(instantiation.filePath, candidate) && candidate.fact.constructorParameterCount === instantiation.argumentCount && candidate.fact.constructorRequiredParameterCount === instantiation.argumentCount);
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.scala.unique-constructor-creation", targetFilePath: candidates[0].symbol.filePath }));
  }
  const heritageEdges: GraphEdge[] = [];
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) continue;
    const sourceFact = types.find((candidate) => candidate.symbol.id === source.id);
    const candidates = typeCandidates(reference.filePath, reference.referenceName).filter((candidate) => candidate.symbol.id !== source.id && visibleType(reference.filePath, candidate));
    if (candidates.length !== 1 || candidates[0] === undefined) continue;
    const edge = edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: reference.relationKind, filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: reference.relationKind === "implements" ? "syntax.scala.unique-trait-target" : "syntax.scala.unique-parent-target", targetFilePath: candidates[0].symbol.filePath });
    heritageEdges.push(edge);
    push(edge);
  }
  for (const override of overrides) {
    const source = input.symbolsById.get(override.sourceId);
    const sourceFact = callables.find((candidate) => candidate.symbol.id === override.sourceId);
    const owner = types.find((candidate) => candidate.symbol.filePath === override.filePath && candidate.fact.name === override.ownerTypeName);
    if (source?.filePath !== override.filePath || sourceFact === undefined || owner === undefined) continue;
    const parents = heritageEdges.filter((edge) => edge.sourceId === owner.symbol.id && edge.kind === "extends");
    const parentMethods = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.name === override.methodName && exactArity(candidate.fact, sourceFact.fact.parameterCount) && parents.some((parent) => parent.targetId === candidate.fact.ownerTypeId));
    if (parentMethods.length === 1 && parentMethods[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: parentMethods[0].symbol.id, kind: "overrides", filePath: override.filePath, referenceName: override.methodName, range: override.range, ruleId: "syntax.scala.explicit-override.direct-parent-method", targetFilePath: parentMethods[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

interface ResolvedElixirType {
  readonly fact: ElixirTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedElixirCallable {
  readonly fact: ElixirCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Elixir facts through explicit aliases/imports and simple specs without BEAM inference. */
function projectElixirRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const types: ResolvedElixirType[] = [];
  const callables: ResolvedElixirCallable[] = [];
  const aliases: ElixirAliasFact[] = [];
  const imports: ElixirImportFact[] = [];
  const calls: ElixirCallFact[] = [];
  const instantiations: ElixirInstantiationFact[] = [];
  const heritage: ElixirHeritageFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const elixirFacts = facts.elixirFacts;
    if (elixirFacts === undefined) continue;
    for (const fact of elixirFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of elixirFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    aliases.push(...elixirFacts.aliases);
    imports.push(...elixirFacts.imports);
    calls.push(...elixirFacts.calls);
    instantiations.push(...elixirFacts.instantiations);
    heritage.push(...elixirFacts.heritage ?? []);
  }
  const typesByName = new Map<string, ResolvedElixirType[]>();
  const typesByPath = new Map<string, ResolvedElixirType[]>();
  const callablesByName = new Map<string, ResolvedElixirCallable[]>();
  for (const entry of types) {
    typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
    typesByPath.set(entry.fact.qualifiedTypePath, [...(typesByPath.get(entry.fact.qualifiedTypePath) ?? []), entry]);
  }
  for (const entry of callables) callablesByName.set(entry.fact.name, [...(callablesByName.get(entry.fact.name) ?? []), entry]);
  const aliasesByFile = new Map<string, ElixirAliasFact[]>();
  for (const alias of aliases) aliasesByFile.set(alias.filePath, [...(aliasesByFile.get(alias.filePath) ?? []), alias]);
  const aliasTargets = (filePath: string, localName: string): readonly string[] => [...new Set((aliasesByFile.get(filePath) ?? []).filter((alias) => alias.localName === localName).map((alias) => alias.importedModule))];
  const moduleAlias = (filePath: string, localName: string): string | undefined => {
    const targets = aliasTargets(filePath, localName);
    return targets.length === 1 ? targets[0] : undefined;
  };
  const ambiguousAlias = (filePath: string, localName: string): boolean => aliasTargets(filePath, localName).length > 1;
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const exactArity = (fact: ElixirCallableFact, count: number): boolean => fact.parameterCount === count && fact.requiredParameterCount === count;
  const moduleCandidates = (moduleName: string): readonly ResolvedElixirType[] => [...new Map((typesByName.get(moduleName) ?? []).filter((candidate) => candidate.fact.declarationKind === "module" || candidate.fact.declarationKind === "protocol").map((candidate) => [candidate.symbol.id, candidate])).values()];
  const typeCandidates = (filePath: string, name: string): readonly ResolvedElixirType[] => {
    if (ambiguousAlias(filePath, name)) return [];
    const aliasTarget = moduleAlias(filePath, name);
    const direct = typesByPath.get(name) ?? [];
    const aliased = aliasTarget === undefined ? [] : typesByPath.get(aliasTarget) ?? moduleCandidates(aliasTarget);
    const local = (typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath || candidate.fact.moduleName === name);
    return [...new Map([...direct, ...aliased, ...local].map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const visibleType = (filePath: string, candidate: ResolvedElixirType): boolean => candidate.symbol.filePath === filePath || candidate.fact.isExported;
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  for (const alias of aliases) {
    if (ambiguousAlias(alias.filePath, alias.localName)) continue;
    const source = fileSymbols.get(alias.filePath);
    const targets = moduleCandidates(alias.importedModule);
    const targetFiles = [...new Set(targets.filter((candidate) => candidate.symbol.filePath !== alias.filePath).map((candidate) => candidate.symbol.filePath))];
    const target = targetFiles.length === 1 ? fileSymbols.get(targetFiles[0]!) : undefined;
    if (source !== undefined && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: alias.filePath, referenceName: alias.importedModule, range: alias.range, ruleId: "module.elixir.explicit-alias.unique-module", targetFilePath: target.filePath }));
  }
  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    const targets = moduleCandidates(imported.importedModule);
    const targetFiles = [...new Set(targets.filter((candidate) => candidate.symbol.filePath !== imported.filePath).map((candidate) => candidate.symbol.filePath))];
    const target = targetFiles.length === 1 ? fileSymbols.get(targetFiles[0]!) : undefined;
    if (source !== undefined && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: imported.filePath, referenceName: imported.importedModule, range: imported.range, ruleId: "module.elixir.explicit-import.unique-module", targetFilePath: target.filePath }));
  }
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = typeCandidates(callable.symbol.filePath, typeName).filter((candidate) => candidate.fact.declarationKind !== "module" && candidate.fact.declarationKind !== "protocol" && visibleType(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.elixir.unique-spec-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = typeCandidates(callable.symbol.filePath, callable.fact.returnTypeName).filter((candidate) => candidate.fact.declarationKind !== "module" && candidate.fact.declarationKind !== "protocol" && visibleType(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.elixir.unique-spec-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedElixirCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    if (call.callKind === "direct") {
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "function" && candidate.fact.moduleName === source.fact.moduleName && exactArity(candidate.fact, call.argumentCount));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.elixir.unique-same-module-function-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    const receiver = call.receiverModuleName ?? "";
    if (ambiguousAlias(call.filePath, receiver)) continue;
    const targetModuleName = moduleAlias(call.filePath, receiver) ?? receiver;
    const moduleTargets = moduleCandidates(targetModuleName);
    const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "function" && candidate.fact.moduleName === targetModuleName && exactArity(candidate.fact, call.argumentCount) && candidate.fact.isExported && moduleTargets.some((module) => module.symbol.filePath === candidate.symbol.filePath));
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "module.elixir.unique-qualified-function-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = typeCandidates(instantiation.filePath, instantiation.typeName).filter((candidate) => candidate.fact.declarationKind === "struct" && visibleType(instantiation.filePath, candidate));
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.elixir.unique-struct-creation", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const reference of heritage) {
    const rawSource = input.symbolsById.get(reference.sourceId);
    const rawFileCandidates = rawSource?.kind === "file" ? (typesByName.get(reference.sourceTypeName) ?? []) : [];
    // A defimpl source is deliberately recorded against the file because the
    // implementation module is not necessarily declared in the same lexical
    // module frame. Prefer one explicit struct declaration when present; a
    // module declaration alone remains a valid bounded fallback. Never guess
    // when both a module and a struct are equally plausible.
    const structCandidates = rawFileCandidates.filter((candidate) => candidate.fact.declarationKind === "struct");
    const moduleCandidatesForFile = rawFileCandidates.filter((candidate) => candidate.fact.declarationKind === "module");
    const sourceCandidates = rawSource?.kind === "file"
      ? structCandidates.length === 1
        ? structCandidates
        : moduleCandidatesForFile.length === 1
          ? moduleCandidatesForFile
          : []
      : rawSource === undefined
        ? []
        : types.filter((candidate) => candidate.symbol.id === rawSource.id);
    const targetCandidates = typesByName.get(reference.referenceName) ?? [];
    const sources = [...new Map(sourceCandidates.filter((candidate) => candidate.fact.declarationKind === "module" || candidate.fact.declarationKind === "struct").map((candidate) => [candidate.symbol.id, candidate])).values()];
    const targets = [...new Map(targetCandidates.filter((candidate) => candidate.fact.declarationKind === "protocol" || candidate.fact.declarationKind === "behaviour").map((candidate) => [candidate.symbol.id, candidate])).values()];
    if (sources.length === 1 && targets.length === 1 && sources[0] !== undefined && targets[0] !== undefined) push(edgeFor({ sourceId: sources[0].symbol.id, targetId: targets[0].symbol.id, kind: "implements", filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: "syntax.elixir.unique-behaviour-or-protocol-implementation", targetFilePath: targets[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

interface ResolvedErlangType {
  readonly fact: ErlangTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedErlangCallable {
  readonly fact: ErlangCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Erlang facts through explicit imports and simple BEAM-neutral syntax proof. */
function projectErlangRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const types: ResolvedErlangType[] = [];
  const callables: ResolvedErlangCallable[] = [];
  const imports: ErlangImportFact[] = [];
  const calls: ErlangCallFact[] = [];
  const instantiations: ErlangInstantiationFact[] = [];
  const heritage: ErlangHeritageFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const erlangFacts = facts.erlangFacts;
    if (erlangFacts === undefined) continue;
    for (const fact of erlangFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of erlangFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === `${fact.name}/${fact.arity}`) callables.push({ fact, symbol });
    }
    imports.push(...erlangFacts.imports);
    calls.push(...erlangFacts.calls);
    instantiations.push(...erlangFacts.instantiations);
    heritage.push(...erlangFacts.heritage ?? []);
  }
  const typesByName = new Map<string, ResolvedErlangType[]>();
  const callablesByKey = new Map<string, ResolvedErlangCallable[]>();
  for (const entry of types) typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
  for (const entry of callables) {
    const key = `${entry.fact.moduleName}\u0000${entry.fact.name}\u0000${entry.fact.arity}`;
    callablesByKey.set(key, [...(callablesByKey.get(key) ?? []), entry]);
  }
  const importsByFile = new Map<string, ErlangImportFact[]>();
  for (const imported of imports) importsByFile.set(imported.filePath, [...(importsByFile.get(imported.filePath) ?? []), imported]);
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const moduleCandidates = (name: string): readonly ResolvedErlangType[] => [...new Map((typesByName.get(name) ?? []).filter((candidate) => candidate.fact.declarationKind === "module").map((candidate) => [candidate.symbol.id, candidate])).values()];
  const typeCandidates = (filePath: string, name: string): readonly ResolvedErlangType[] => [...new Map((typesByName.get(name) ?? []).filter((candidate) => candidate.symbol.filePath === filePath || candidate.fact.isExported).map((candidate) => [candidate.symbol.id, candidate])).values()];
  const specTypeCandidates = (filePath: string, name: string): readonly ResolvedErlangType[] => {
    const candidates = typeCandidates(filePath, name).filter((candidate) => candidate.fact.declarationKind !== "module" && candidate.fact.declarationKind !== "behaviour");
    return candidates.filter((candidate) => candidate.fact.declarationKind === "type" || candidate.fact.declarationKind === "opaque");
  };
  const sourceCallable = (sourceId: string, filePath: string): ResolvedErlangCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    if (source === undefined) continue;
    if (imported.importKind === "module") {
      const targets = moduleCandidates(imported.importedModule);
      const targetFiles = [...new Set(targets.filter((candidate) => candidate.symbol.filePath !== imported.filePath).map((candidate) => candidate.symbol.filePath))];
      const target = targetFiles.length === 1 ? fileSymbols.get(targetFiles[0]!) : undefined;
      if (target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: imported.filePath, referenceName: imported.importedModule, range: imported.range, ruleId: "module.erlang.explicit-import.unique-module", targetFilePath: target.filePath }));
    } else if (imported.includePath !== undefined) {
      const normalized = imported.includePath.replaceAll("\\", "/").replace(/^\.\//u, "");
      const sourceDirectory = imported.filePath.includes("/") ? imported.filePath.slice(0, imported.filePath.lastIndexOf("/") + 1) : "";
      const target = fileSymbols.get(`${sourceDirectory}${normalized}`.replace(/\/\.\//gu, "/"));
      if (target !== undefined && target.filePath !== imported.filePath) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: imported.filePath, referenceName: imported.includePath, range: imported.range, ruleId: "module.erlang.explicit-include.unique-file", targetFilePath: target.filePath }));
    }
  }
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = specTypeCandidates(callable.symbol.filePath, typeName);
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.erlang.unique-spec-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = specTypeCandidates(callable.symbol.filePath, callable.fact.returnTypeName);
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.erlang.unique-spec-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const importedModulesFor = (filePath: string, referenceName: string): readonly string[] => [...new Set((importsByFile.get(filePath) ?? []).filter((imported) => imported.importKind === "module" && (imported.importedNames ?? []).includes(referenceName)).map((imported) => imported.importedModule))];
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    const parts = call.referenceName.split("/");
    const targetName = parts[0] ?? call.referenceName;
    const moduleNames = call.callKind === "module" ? (call.receiverModuleName === undefined ? [] : [call.receiverModuleName]) : [source.fact.moduleName, ...importedModulesFor(call.filePath, call.referenceName)];
    const candidates: ResolvedErlangCallable[] = [];
    for (const moduleName of moduleNames) {
      const moduleTargets = moduleCandidates(moduleName);
      const functions = callablesByKey.get(`${moduleName}\u0000${targetName}\u0000${call.argumentCount}`) ?? [];
      for (const candidate of functions) {
        if (candidate.fact.callableKind !== "function" || candidate.fact.arity !== call.argumentCount) continue;
        if (call.callKind === "module" && (!candidate.fact.isExported || moduleTargets.length !== 1 || moduleTargets[0]?.symbol.filePath !== candidate.symbol.filePath)) continue;
        if (!candidates.some((existing) => existing.symbol.id === candidate.symbol.id)) candidates.push(candidate);
      }
    }
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: call.callKind === "module" ? "module.erlang.unique-qualified-function-call" : "syntax.erlang.unique-local-or-imported-function-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = typeCandidates(instantiation.filePath, instantiation.typeName).filter((candidate) => candidate.fact.declarationKind === "record");
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.erlang.unique-record-creation", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const reference of heritage) {
    const sources = [...new Map((typesByName.get(reference.sourceTypeName) ?? []).filter((candidate) => candidate.fact.declarationKind === "module").map((candidate) => [candidate.symbol.id, candidate])).values()];
    const targets = [...new Map((typesByName.get(reference.referenceName) ?? []).filter((candidate) => candidate.fact.declarationKind === "module" || candidate.fact.declarationKind === "behaviour").map((candidate) => [candidate.symbol.id, candidate])).values()];
    if (sources.length === 1 && targets.length === 1 && sources[0] !== undefined && targets[0] !== undefined) push(edgeFor({ sourceId: sources[0].symbol.id, targetId: targets[0].symbol.id, kind: "implements", filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: "syntax.erlang.unique-behaviour-implementation", targetFilePath: targets[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

interface ResolvedClojureType {
  readonly fact: ClojureTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedClojureCallable {
  readonly fact: ClojureCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Clojure syntax facts through unique project-local namespaces. */
function projectClojureRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const types: ResolvedClojureType[] = [];
  const callables: ResolvedClojureCallable[] = [];
  const imports: ClojureImportFact[] = [];
  const calls: ClojureCallFact[] = [];
  const instantiations: ClojureInstantiationFact[] = [];
  const heritage: ClojureHeritageFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const clojureFacts = facts.clojureFacts;
    if (clojureFacts === undefined || clojureFacts.parserRejected === true) continue;
    for (const fact of clojureFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of clojureFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...clojureFacts.imports);
    calls.push(...clojureFacts.calls);
    instantiations.push(...clojureFacts.instantiations);
    heritage.push(...clojureFacts.heritage ?? []);
  }

  const typesByName = new Map<string, ResolvedClojureType[]>();
  for (const entry of types) typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
  const typesByNamespace = new Map<string, ResolvedClojureType[]>();
  for (const entry of types) typesByNamespace.set(entry.fact.namespaceName, [...(typesByNamespace.get(entry.fact.namespaceName) ?? []), entry]);
  const callablesByKey = new Map<string, ResolvedClojureCallable[]>();
  for (const entry of callables) {
    const key = `${entry.fact.namespaceName}\u0000${entry.fact.name}\u0000${entry.fact.parameterCount}`;
    callablesByKey.set(key, [...(callablesByKey.get(key) ?? []), entry]);
  }
  const importsByFile = new Map<string, ClojureImportFact[]>();
  for (const imported of imports) importsByFile.set(imported.filePath, [...(importsByFile.get(imported.filePath) ?? []), imported]);
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  const uniqueNamespace = (name: string): ResolvedClojureType | undefined => {
    const candidates = (typesByNamespace.get(name) ?? []).filter((candidate) => candidate.fact.declarationKind === "namespace");
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  const visibleTypes = (filePath: string, name: string): readonly ResolvedClojureType[] => [...new Map((typesByName.get(name) ?? []).filter((candidate) => candidate.fact.declarationKind !== "namespace" && (candidate.symbol.filePath === filePath || candidate.fact.isExported)).map((candidate) => [candidate.symbol.id, candidate])).values()];
  const sourceCallable = (sourceId: string, filePath: string): ResolvedClojureCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);

  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    const target = uniqueNamespace(imported.importedNamespace);
    if (source === undefined || target === undefined || target.symbol.filePath === imported.filePath) continue;
    push(edgeFor({ sourceId: source.id, targetId: target.symbol.id, kind: "imports", filePath: imported.filePath, referenceName: imported.importedNamespace, range: imported.range, ruleId: "module.clojure.explicit-require.unique-namespace", targetFilePath: target.symbol.filePath }));
  }
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = visibleTypes(callable.symbol.filePath, typeName);
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.clojure.unique-type-hint-parameter", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = visibleTypes(callable.symbol.filePath, callable.fact.returnTypeName);
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.clojure.unique-type-hint-return", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    const candidates: ResolvedClojureCallable[] = [];
    let namespaceNames: string[] = [];
    if (call.callKind === "namespace") {
      const receiver = call.receiverNamespaceName;
      const imported = receiver === undefined ? undefined : (importsByFile.get(call.filePath) ?? []).filter((entry) => entry.alias === receiver);
      namespaceNames = imported === undefined ? [] : imported.length === 1 ? [imported[0]!.importedNamespace] : [];
      if (receiver !== undefined && imported === undefined) namespaceNames = [receiver];
    } else {
      namespaceNames = [source.fact.namespaceName];
      for (const imported of importsByFile.get(call.filePath) ?? []) {
        if ((imported.referredNames ?? []).includes(call.referenceName)) namespaceNames.push(imported.importedNamespace);
      }
    }
    for (const namespaceName of new Set(namespaceNames)) {
      for (const candidate of callablesByKey.get(`${namespaceName}\u0000${call.referenceName}\u0000${call.argumentCount}`) ?? []) {
        if (call.callKind === "namespace" && (!candidate.fact.isExported || uniqueNamespace(namespaceName)?.symbol.filePath !== candidate.symbol.filePath)) continue;
        if (!candidates.some((existing) => existing.symbol.id === candidate.symbol.id)) candidates.push(candidate);
      }
    }
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: call.callKind === "namespace" ? "module.clojure.unique-qualified-call" : "syntax.clojure.unique-local-or-referred-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const constructorName = `${instantiation.constructorKind === "map-arrow" ? "map->" : "->"}${instantiation.typeName}`;
    const referredNamespaces = (importsByFile.get(instantiation.filePath) ?? [])
      .filter((imported) => (imported.referredNames ?? []).includes(constructorName))
      .map((imported) => imported.importedNamespace);
    const candidates = visibleTypes(instantiation.filePath, instantiation.typeName).filter((candidate) => candidate.fact.declarationKind === "record" && (candidate.fact.namespaceName === source.fact.namespaceName || referredNamespaces.includes(candidate.fact.namespaceName)));
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.clojure.unique-record-constructor", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const reference of heritage) {
    const sources = (typesByName.get(reference.sourceTypeName) ?? []).filter((candidate) => candidate.fact.declarationKind === "record");
    const targets = (typesByName.get(reference.referenceName) ?? []).filter((candidate) => candidate.fact.declarationKind === "protocol" && candidate.fact.isExported);
    if (sources.length === 1 && targets.length === 1 && sources[0] !== undefined && targets[0] !== undefined) push(edgeFor({ sourceId: sources[0].symbol.id, targetId: targets[0].symbol.id, kind: "implements", filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: "syntax.clojure.unique-record-protocol", targetFilePath: targets[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

interface ResolvedNixAttribute {
  readonly fact: NixAttributeFact;
  readonly symbol: SymbolNode;
}

/** Projects Nix literal function applications without evaluating Nix expressions. */
function projectNixRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
}): readonly GraphEdge[] {
  const attributes: ResolvedNixAttribute[] = [];
  const imports: NixImportFact[] = [];
  const calls: NixCallFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const nixFacts = facts.nixFacts;
    if (nixFacts === undefined || nixFacts.parserRejected === true) continue;
    for (const fact of nixFacts.attributes) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) attributes.push({ fact, symbol });
    }
    imports.push(...nixFacts.imports);
    calls.push(...nixFacts.calls);
  }
  const attributesByFileAndName = new Map<string, ResolvedNixAttribute[]>();
  for (const attribute of attributes) {
    const key = `${attribute.symbol.filePath}\u0000${attribute.fact.name}`;
    attributesByFileAndName.set(key, [...(attributesByFileAndName.get(key) ?? []), attribute]);
  }
  const importsByFileAndBinding = new Map<string, NixImportFact[]>();
  for (const imported of imports) {
    if (imported.bindingName === undefined) continue;
    const key = `${imported.filePath}\u0000${imported.bindingName}`;
    importsByFileAndBinding.set(key, [...(importsByFileAndBinding.get(key) ?? []), imported]);
  }
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  const sourceAttribute = (sourceId: string, filePath: string): ResolvedNixAttribute | undefined => attributes.find((attribute) => attribute.symbol.id === sourceId && attribute.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceAttribute(call.sourceId, call.filePath);
    if (source === undefined) continue;
    let candidates: ResolvedNixAttribute[] = [];
    if (call.callKind === "direct") {
      candidates = (attributesByFileAndName.get(`${call.filePath}\u0000${call.referenceName}`) ?? []).filter((candidate) => candidate.fact.kind === "function" && candidate.fact.parameterCount === call.argumentCount && candidate.fact.scopeId === source.fact.scopeId);
    } else if (call.receiverName !== undefined) {
      const bindings = importsByFileAndBinding.get(`${call.filePath}\u0000${call.receiverName}`) ?? [];
      if (bindings.length === 1) {
        const imported = bindings[0]!;
        const targetPath = input.moduleTargetPathByKey.get(moduleKey(imported.filePath, imported.importedPath));
        if (targetPath !== undefined) {
          candidates = (attributesByFileAndName.get(`${targetPath}\u0000${call.referenceName}`) ?? []).filter((candidate) => candidate.fact.kind === "function" && candidate.fact.isExported && candidate.fact.parameterCount === call.argumentCount);
        }
      }
    }
    if (candidates.length === 1 && candidates[0] !== undefined) {
      push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.callKind === "attribute" && call.receiverName !== undefined ? `${call.receiverName}.${call.referenceName}` : call.referenceName, range: call.range, ruleId: call.callKind === "attribute" ? "module.nix.literal-imported-attribute-call" : "syntax.nix.unique-local-function-call", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

interface ResolvedNimType {
  readonly fact: NimTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedNimCallable {
  readonly fact: NimCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Nim syntax facts through unique local/imported modules and fixed arity. */
function projectNimRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly knownFilePaths: ReadonlySet<string>;
}): readonly GraphEdge[] {
  const types: ResolvedNimType[] = [];
  const callables: ResolvedNimCallable[] = [];
  const imports: NimImportFact[] = [];
  const calls: NimCallFact[] = [];
  const instantiations: NimInstantiationFact[] = [];
  const heritage: NimHeritageFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const nimFacts = facts.nimFacts;
    if (nimFacts === undefined || nimFacts.parserRejected === true) continue;
    for (const fact of nimFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of nimFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...nimFacts.imports);
    calls.push(...nimFacts.calls);
    instantiations.push(...nimFacts.instantiations);
    heritage.push(...nimFacts.heritage ?? []);
  }
  const typesByName = new Map<string, ResolvedNimType[]>();
  for (const entry of types) typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
  const callablesByKey = new Map<string, ResolvedNimCallable[]>();
  for (const entry of callables) {
    const key = `${entry.fact.moduleName}\u0000${entry.fact.name}\u0000${entry.fact.parameterCount}`;
    callablesByKey.set(key, [...(callablesByKey.get(key) ?? []), entry]);
  }
  const importsByFile = new Map<string, NimImportFact[]>();
  for (const imported of imports) importsByFile.set(imported.filePath, [...(importsByFile.get(imported.filePath) ?? []), imported]);
  const fileSymbols = new Map([...input.symbolsById.values()].filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol]));
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  const importTarget = (imported: NimImportFact): string | undefined => {
    const normalized = imported.importedModule.replaceAll("\\", "/").replace(/^\.\//u, "");
    const sourceDirectory = imported.filePath.includes("/") ? imported.filePath.slice(0, imported.filePath.lastIndexOf("/") + 1) : "";
    const candidates = [...input.knownFilePaths].filter((filePath) => filePath === `${sourceDirectory}${normalized}.nim` || filePath === `${sourceDirectory}${normalized}.nims` || filePath === `${sourceDirectory}${normalized}/index.nim`);
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  for (const imported of imports) {
    const source = fileSymbols.get(imported.filePath);
    const targetPath = importTarget(imported);
    const target = targetPath === undefined ? undefined : fileSymbols.get(targetPath);
    if (source !== undefined && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: imported.filePath, referenceName: imported.importedModule, range: imported.range, ruleId: "module.nim.literal-import.unique-file", targetFilePath: target.filePath }));
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedNimCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = [...new Map((typesByName.get(typeName) ?? []).filter((candidate) => candidate.fact.declarationKind !== "alias" && (candidate.symbol.filePath === callable.symbol.filePath || candidate.fact.isExported)).map((candidate) => [candidate.symbol.id, candidate])).values()];
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.nim.unique-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = [...new Map((typesByName.get(callable.fact.returnTypeName) ?? []).filter((candidate) => candidate.fact.declarationKind !== "alias" && (candidate.symbol.filePath === callable.symbol.filePath || candidate.fact.isExported)).map((candidate) => [candidate.symbol.id, candidate])).values()];
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.nim.unique-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    let moduleNames: string[] = [];
    if (call.callKind === "direct") moduleNames = [source.fact.moduleName];
    else if (call.receiverModuleName !== undefined) {
      const matchingImports = (importsByFile.get(call.filePath) ?? []).filter((imported) => (imported.localName ?? imported.importedModule.split("/").at(-1)) === call.receiverModuleName);
      if (matchingImports.length === 1) moduleNames = [matchingImports[0]!.importedModule.split("/").at(-1) ?? matchingImports[0]!.importedModule];
    }
    const candidates: ResolvedNimCallable[] = [];
    for (const moduleName of moduleNames) {
      for (const candidate of callablesByKey.get(`${moduleName}\u0000${call.referenceName}\u0000${call.argumentCount}`) ?? []) {
        if (call.callKind === "module" && !candidate.fact.isExported) continue;
        if (call.callKind === "module") {
          const matchingImports = (importsByFile.get(call.filePath) ?? []).filter((imported) => (imported.localName ?? imported.importedModule.split("/").at(-1)) === call.receiverModuleName && importTarget(imported) === candidate.symbol.filePath);
          if (matchingImports.length !== 1) continue;
        }
        if (!candidates.some((existing) => existing.symbol.id === candidate.symbol.id)) candidates.push(candidate);
      }
    }
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.callKind === "module" && call.receiverModuleName !== undefined ? `${call.receiverModuleName}.${call.referenceName}` : call.referenceName, range: call.range, ruleId: call.callKind === "module" ? "module.nim.unique-qualified-call" : "syntax.nim.unique-local-call", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = [...new Map((typesByName.get(instantiation.typeName) ?? []).filter((candidate) => candidate.fact.declarationKind !== "alias" && (candidate.symbol.filePath === source.symbol.filePath || candidate.fact.isExported)).map((candidate) => [candidate.symbol.id, candidate])).values()];
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.nim.unique-type-construction", targetFilePath: candidates[0].symbol.filePath }));
  }
  for (const reference of heritage) {
    const sources = (typesByName.get(reference.sourceTypeName) ?? []).filter((candidate) => candidate.fact.declarationKind === "object");
    const targets = (typesByName.get(reference.referenceName) ?? []).filter((candidate) => candidate.fact.declarationKind === "object");
    if (sources.length === 1 && targets.length === 1 && sources[0] !== undefined && targets[0] !== undefined) push(edgeFor({ sourceId: sources[0].symbol.id, targetId: targets[0].symbol.id, kind: "extends", filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: "syntax.nim.unique-object-heritage", targetFilePath: targets[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
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
}): ResolvedJavaCallType | null {
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
        });
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
        });
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
}): JavaCallPlan | null {
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
    configurationPaths: uniqueConfigurationPaths(
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

function projectJavaCallReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly signatureEdges: readonly GraphEdge[];
  readonly heritageEdges: readonly GraphEdge[];
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}): readonly GraphEdge[] {
  const typesBySymbolId = new Map<string, JvmResolvedType[]>();
  const callableDeclarationsBySymbolId = new Map<string, JavaCallableDeclarationFact[]>();
  const signatureReferences: JvmCallableSignatureReferenceFact[] = [];
  const chainedReferences: JavaChainedCallReferenceFact[] = [];
  const memberReferences: JavaMemberCallReferenceFact[] = [];
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
            reference: bindingTypeReference,
            declaringType: bindingDeclaringType,
            sourceFilePath: bindingDeclaringType.symbol.filePath,
            types,
            membershipsByFile,
            projectEvidence: input.jvmProjectModuleEvidence
          })
        : null;
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
    const configurationPaths = uniqueConfigurationPaths([
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
        ...referenceEvidence(
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
          });
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
          });
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
    const configurationPaths = uniqueConfigurationPaths([
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
        ...referenceEvidence(
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
        ...referenceEvidence(
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
function projectJvmDependencyInjectionReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly jvmProjectModuleEvidence?: JvmProjectModuleEvidence;
}): readonly GraphEdge[] {
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
          })
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
          });
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
      evidence: referenceEvidence(
        jvmDependencyInjectionRuleId({
          syntax: reference.syntax,
          resolutionProof,
          ...(declaredProjectDependency === null
            ? {}
            : { declaredProjectDependency: declaredProjectDependency.kind })
        }),
        "module",
        candidateSymbolIds(candidates.map((candidate) => candidate.symbol)),
        configurationPaths,
        [reference.filePath, target.filePath]
      )
    });
  }
  return edges;
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

  resolvedEdges.push(
    ...projectJavaImportReferences({
      factsByFile,
      symbolsById,
      ...(input.jvmProjectModuleEvidence === undefined
        ? {}
        : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
    }),
    ...projectJavaAnnotationReferences({
      factsByFile,
      symbolsById,
      ...(input.jvmProjectModuleEvidence === undefined
        ? {}
        : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
    })
  );

  const jvmProjectHeritageEdges = projectJvmHeritageReferences({
    factsByFile,
    symbolsById,
    ...(input.jvmProjectModuleEvidence === undefined
      ? {}
      : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
  });
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
    })
  );
  const jvmCallableSignatureEdges = projectJvmCallableSignatureReferences({
    factsByFile,
    symbolsById,
    ...(input.jvmProjectModuleEvidence === undefined
      ? {}
      : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
  });
  resolvedEdges.push(...jvmCallableSignatureEdges);
  resolvedEdges.push(
    ...projectJavaInstantiationReferences({
      factsByFile,
      symbolsById,
      ...(input.jvmProjectModuleEvidence === undefined
        ? {}
        : { jvmProjectModuleEvidence: input.jvmProjectModuleEvidence })
    })
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
    })
  );

  resolvedEdges.push(
    ...projectKotlinRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    })
  );
  resolvedEdges.push(
    ...projectSwiftRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    })
  );
  resolvedEdges.push(
    ...projectDartRelationFacts({
      factsByFile,
      symbolsById,
      knownFilePaths,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    })
  );
  resolvedEdges.push(
    ...projectCsharpRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    })
  );
  resolvedEdges.push(
    ...projectFsharpRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    })
  );
  resolvedEdges.push(
    ...projectOcamlRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    })
  );
  resolvedEdges.push(
    ...projectHaskellRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    })
  );
  resolvedEdges.push(
    ...projectScalaRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    })
  );
  resolvedEdges.push(
    ...projectElixirRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    })
  );
  resolvedEdges.push(
    ...projectErlangRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    })
  );
  resolvedEdges.push(
    ...projectClojureRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges]
    })
  );
  resolvedEdges.push(
    ...projectLiquidTemplateReferences({
      factsByFile,
      fileSymbols
    })
  );
  resolvedEdges.push(
    ...projectTwigTemplateReferences({
      factsByFile,
      fileSymbols
    })
  );
  resolvedEdges.push(
    ...projectJspTemplateReferences({
      factsByFile,
      fileSymbols
    })
  );
  resolvedEdges.push(
    ...projectMarkdownFileReferences({
      factsByFile,
      fileSymbols
    })
  );
  resolvedEdges.push(
    ...projectBladeTemplateReferences({
      factsByFile,
      fileSymbols
    })
  );
  resolvedEdges.push(
    ...projectRazorPagesReferences({
      factsByFile,
      symbolsById,
      sourceDocumentsByPath,
      structuralEdges
    })
  );
  resolvedEdges.push(
    ...projectSolidityInheritance({
      factsByFile
    })
  );
  resolvedEdges.push(
    ...projectSpringBootPropertiesReferences({
      factsByFile,
      symbolsById
    })
  );
  resolvedEdges.push(
    ...projectSpringBootConfigurationPropertiesPrefixes({
      factsByFile,
      symbolsById
    })
  );
  resolvedEdges.push(
    ...projectNestGraphqlResolverSchemaReferences({
      factsByFile,
      sourceDocuments: input.sourceDocuments,
      symbolsById
    })
  );
  resolvedEdges.push(
    ...projectReactNativeNativeModuleCalls({
      factsByFile
    })
  );
  resolvedEdges.push(
    ...projectReactNativeSwiftExternalBridgeReferences({
      factsByFile,
      ...(input.xcodeTargetMemberships === undefined
        ? {}
        : { xcodeTargetMemberships: input.xcodeTargetMemberships })
    })
  );
  resolvedEdges.push(
    ...projectReactNativeTurboModuleCalls({
      factsByFile
    })
  );
  resolvedEdges.push(
    ...projectReactNativeTurboModuleSpecMethods({
      factsByFile
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
    })
  );
  resolvedEdges.push(
    ...projectNimRelationFacts({
      factsByFile,
      symbolsById,
      existingEdges: [...structuralEdges, ...resolvedEdges],
      knownFilePaths
    })
  );

  resolvedEdges.push(
    ...projectPythonRegularPackageRelativeNamedImports({
      factsByFile,
      fileSymbols,
      knownFilePaths
    })
  );

  const frameworkRoutePluginProjection = projectFrameworkRoutePluginImportedMounts({
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
      exportSurfaces
    })
  );

  const rustActixImportedServiceConfigRouteProjection = projectRustActixImportedServiceConfigRoutes({
    factsByFile,
    knownFilePaths,
    fileSymbols,
    symbolsById,
    structuralEdges,
    moduleResolver: input.moduleResolver
  });
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
  });
  symbols.push(...goFrameStandardRouterRouteProjection.symbols);
  structuralEdges.push(...goFrameStandardRouterRouteProjection.structuralEdges);
  for (const symbol of goFrameStandardRouterRouteProjection.symbols) {
    symbolsById.set(symbol.id, symbol);
  }

  resolvedEdges.push(
    ...projectAdaProjectFacts({
      factsByFile,
      symbolsById,
      sourceDocumentsByPath
    })
  );

  resolvedEdges.push(
    ...projectRustLocalFacts({
      factsByFile,
      symbolsById
    })
  );

  resolvedEdges.push(
    ...projectRustProjectFacts({
      factsByFile,
      fileSymbols,
      symbolsById,
      knownFilePaths,
      sourceDocumentsByPath
    })
  );

  resolvedEdges.push(
    ...projectGoProjectFacts({
      factsByFile,
      fileSymbols,
      symbolsById,
      knownFilePaths,
      moduleResolver: input.moduleResolver
    })
  );

  const fastifyPluginRouteProjection = projectFastifyImportedPluginRoutes({
    factsByFile,
    localBindingsByFile,
    importBindingsByFile,
    symbolsById,
    fileSymbols,
    moduleTargetPathByKey,
    exportSurfaces
  });
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
    })
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
