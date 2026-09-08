import { compareStableText, createEdgeId, type GraphEdge, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import { type SourceDocument } from "../../ports/source-catalog.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

export function isRustDirectExternalModuleName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value);
}

export function rustRangeText(sourceText: string, range: SourceRange): string | null {
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
export function projectRustProjectFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly knownFilePaths: ReadonlySet<string>;
  readonly sourceDocumentsByPath: ReadonlyMap<string, SourceDocument>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
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
export function projectRustLocalFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
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
