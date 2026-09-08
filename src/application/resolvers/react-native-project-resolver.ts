import {
  compareStableText,
  createEdgeId,
  type EdgeEvidence,
  type GraphEdge,
  type ReactNativeNativeMethodFact,
  type ReactNativeTurboModuleDefaultImportCallFact,
  type SourceRange,
  type SwiftObjectiveCExtensionMethodFact,
  type SwiftObjectiveCMethodFact,
  type SwiftObjectiveCTypeFact,
  type SymbolNode
} from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";
import type { XcodeTargetMembership } from "../../ports/source-catalog.js";

type ReferenceEvidenceFactory = (
  ruleId: EdgeEvidence["ruleId"],
  stage: EdgeEvidence["stage"],
  candidateIds: readonly string[],
  configurationPaths?: readonly string[],
  resolutionPath?: readonly string[]
) => EdgeEvidence;

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
export function projectReactNativeBridgeReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly sourceFacts: (facts: ExtractedFileFacts) => readonly ReactNativeBridgeReference[];
  readonly ruleId: ReactNativeBridgeRuleId;
  readonly codegenRuleId: ReactNativeBridgeRuleId;
  readonly referenceEvidence: ReferenceEvidenceFactory;
}): readonly GraphEdge[] {
  const { referenceEvidence } = input;
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

export function projectReactNativeNativeModuleCalls(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly referenceEvidence: ReferenceEvidenceFactory;
}): readonly GraphEdge[] {
  return projectReactNativeBridgeReferences({
    ...input,
    referenceEvidence: input.referenceEvidence,
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
export function projectReactNativeSwiftExternalBridgeReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly xcodeTargetMemberships?: readonly XcodeTargetMembership[];
  readonly referenceEvidence: ReferenceEvidenceFactory;
}): readonly GraphEdge[] {
  const { referenceEvidence } = input;
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

export function projectReactNativeTurboModuleCalls(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly referenceEvidence: ReferenceEvidenceFactory;
}): readonly GraphEdge[] {
  return projectReactNativeBridgeReferences({
    ...input,
    referenceEvidence: input.referenceEvidence,
    sourceFacts: (facts) => facts.reactNativeFacts?.turboModuleCalls ?? [],
    ruleId: (platform, suffix) => reactNativeTurboModuleRuleId("direct-registry", platform, suffix),
    codegenRuleId: (platform, suffix) =>
      reactNativeCodegenRuleId("turbo-direct-registry", platform, suffix)
  });
}

export function projectReactNativeTurboModuleSpecMethods(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly referenceEvidence: ReferenceEvidenceFactory;
}): readonly GraphEdge[] {
  return projectReactNativeBridgeReferences({
    ...input,
    referenceEvidence: input.referenceEvidence,
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
export function projectReactNativeTurboModuleDefaultImportCalls(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
  readonly exportSurfaces: ReadonlyMap<string, ExportSurface>;
  readonly moduleKey: (filePath: string, moduleSpecifier: string) => string;
  readonly referenceEvidence: ReferenceEvidenceFactory;
}): readonly GraphEdge[] {
  const { moduleKey, referenceEvidence } = input;
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
        ),
      referenceEvidence
    })
  );
}
