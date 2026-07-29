import {
  createEdgeId,
  type GraphEdge,
  type GraphSnapshot,
  type PendingReference,
  type ResolutionKind,
  type SymbolNode
} from "../domain/index.js";
import type { ExtractedFileFacts } from "../extraction/index.js";
import type { SourceDocument } from "../ports/source-catalog.js";

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

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

  return [...candidates].sort(compareText);
}

function referenceEdge(
  reference: PendingReference,
  targetId: string | null,
  resolution: ResolutionKind,
  confidence: number
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
    referenceName: reference.referenceName
  };
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
    .sort((left, right) => compareText(left.path, right.path));
}

function uniqueSymbolCandidates(
  symbols: readonly SymbolNode[],
  predicate: (symbol: SymbolNode) => boolean
): readonly SymbolNode[] {
  return symbols.filter(predicate).sort((left, right) => compareText(left.id, right.id));
}

function bindingKey(filePath: string, name: string): string {
  return `${filePath}\u0000${name}`;
}

function addCandidate(
  candidatesByKey: Map<string, SymbolNode[]>,
  key: string,
  candidate: SymbolNode
): void {
  const candidates = candidatesByKey.get(key) ?? [];
  if (!candidates.some((existing) => existing.id === candidate.id)) {
    candidates.push(candidate);
    candidatesByKey.set(key, candidates);
  }
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
  symbolsById: ReadonlyMap<string, SymbolNode>
): ScopedBindingResolution {
  for (const scopeId of scopeIds) {
    const bindings = localBindings.filter(
      (binding) => binding.scopeId === scopeId && binding.name === referenceName
    );
    if (bindings.length === 0) {
      continue;
    }

    const candidates = [...new Map(
      bindings
        .map((binding) => (binding.symbolId === null ? undefined : symbolsById.get(binding.symbolId)))
        .filter((symbol): symbol is SymbolNode => symbol !== undefined)
        .map((symbol) => [symbol.id, symbol])
    ).values()].sort((left, right) => compareText(left.id, right.id));
    return { hasBinding: true, candidates };
  }

  return { hasBinding: false, candidates: [] };
}

/**
 * Resolves local declarations and explicit named import/export bindings exactly. Any
 * remaining unique-name inference stays heuristic so the graph never overstates proof.
 */
export function resolveProjectFacts(input: {
  readonly sourceDocuments: readonly SourceDocument[];
  readonly extractedFiles: readonly ExtractedFileFacts[];
  readonly indexedAt: string;
}): GraphSnapshot {
  const symbols = input.extractedFiles.flatMap((facts) => facts.symbols);
  const structuralEdges = input.extractedFiles.flatMap((facts) => facts.edges);
  const references = input.extractedFiles.flatMap((facts) => facts.pendingReferences);
  const knownFilePaths = new Set(input.sourceDocuments.map((document) => document.relativePath));
  const fileSymbols = new Map(
    symbols.filter((symbol) => symbol.kind === "file").map((symbol) => [symbol.filePath, symbol])
  );
  const symbolsById = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const importTargetPathsByFile = new Map<string, Set<string>>();
  const importTargetPathBySpecifier = new Map<string, Map<string, string>>();
  const importBindingsByFile = new Map<string, ExtractedFileFacts["importBindings"]>();
  const localBindingsByFile = new Map<string, ExtractedFileFacts["localBindings"]>();
  const referenceScopeIdsByReferenceId = new Map<string, readonly string[]>();
  const exportedCandidatesByFileAndName = new Map<string, SymbolNode[]>();
  const resolvedEdges: GraphEdge[] = [];
  const unresolvedReferences: PendingReference[] = [];

  for (const facts of input.extractedFiles) {
    const sourceFile = facts.symbols.find((symbol) => symbol.kind === "file");
    if (sourceFile === undefined) {
      continue;
    }

    importBindingsByFile.set(sourceFile.filePath, facts.importBindings);
    localBindingsByFile.set(sourceFile.filePath, facts.localBindings);
    for (const referenceScope of facts.referenceScopes) {
      referenceScopeIdsByReferenceId.set(referenceScope.referenceId, referenceScope.scopeIds);
    }
    for (const symbol of facts.symbols) {
      if (symbol.kind !== "file" && symbol.isExported) {
        addCandidate(
          exportedCandidatesByFileAndName,
          bindingKey(symbol.filePath, symbol.name),
          symbol
        );
      }
    }

    for (const binding of facts.exportBindings) {
      for (const symbol of topLevelLocalCandidates(facts.symbols, sourceFile.filePath, binding.localName)) {
        addCandidate(
          exportedCandidatesByFileAndName,
          bindingKey(sourceFile.filePath, binding.exportedName),
          symbol
        );
      }
    }
  }

  for (const reference of references) {
    if (reference.relationKind !== "imports" && reference.relationKind !== "exports") {
      continue;
    }

    const matchingPaths = modulePathCandidates(reference.filePath, reference.referenceName).filter((path) =>
      knownFilePaths.has(path)
    );
    const targetPath = matchingPaths.length === 1 ? matchingPaths[0] : undefined;
    const target = targetPath === undefined ? undefined : fileSymbols.get(targetPath);
    if (target === undefined) {
      unresolvedReferences.push(reference);
      resolvedEdges.push(referenceEdge(reference, null, "unresolved", 0));
      continue;
    }

    resolvedEdges.push(referenceEdge(reference, target.id, "exact", 1));
    if (reference.relationKind === "imports") {
      const targetPaths = importTargetPathsByFile.get(reference.filePath) ?? new Set<string>();
      targetPaths.add(target.filePath);
      importTargetPathsByFile.set(reference.filePath, targetPaths);

      const pathsBySpecifier = importTargetPathBySpecifier.get(reference.filePath) ?? new Map<string, string>();
      pathsBySpecifier.set(reference.referenceName, target.filePath);
      importTargetPathBySpecifier.set(reference.filePath, pathsBySpecifier);
    }
  }

  for (const reference of references) {
    if (reference.relationKind !== "calls") {
      continue;
    }

    const scopedLocal = resolveScopedBinding(
      reference.referenceName,
      referenceScopeIdsByReferenceId.get(reference.id) ?? [],
      localBindingsByFile.get(reference.filePath) ?? [],
      symbolsById
    );
    const exactImportedCandidates = (importBindingsByFile.get(reference.filePath) ?? [])
      .filter((binding) => binding.localName === reference.referenceName)
      .flatMap((binding) => {
        const targetPath = importTargetPathBySpecifier
          .get(reference.filePath)
          ?.get(binding.moduleSpecifier);
        return targetPath === undefined
          ? []
          : (exportedCandidatesByFileAndName.get(bindingKey(targetPath, binding.importedName)) ?? []);
      })
      .filter(
        (candidate, index, candidates) =>
          candidates.findIndex((other) => other.id === candidate.id) === index
      )
      .sort((left, right) => compareText(left.id, right.id));
    const importedTargetPaths = importTargetPathsByFile.get(reference.filePath) ?? new Set<string>();
    const importedCandidates = uniqueSymbolCandidates(
      symbols,
      (symbol) =>
        importedTargetPaths.has(symbol.filePath) &&
        symbol.isExported &&
        symbol.name === reference.referenceName &&
        symbol.kind !== "file"
    );
    const exportedCandidates = uniqueSymbolCandidates(
      symbols,
      (symbol) =>
        symbol.isExported && symbol.name === reference.referenceName && symbol.kind !== "file"
    );

    if (scopedLocal.hasBinding) {
      if (scopedLocal.candidates.length === 1 && scopedLocal.candidates[0] !== undefined) {
        resolvedEdges.push(referenceEdge(reference, scopedLocal.candidates[0].id, "exact", 1));
      } else {
        unresolvedReferences.push(reference);
        resolvedEdges.push(referenceEdge(reference, null, "unresolved", 0));
      }
      continue;
    }

    if (exactImportedCandidates.length === 1 && exactImportedCandidates[0] !== undefined) {
      resolvedEdges.push(referenceEdge(reference, exactImportedCandidates[0].id, "exact", 1));
      continue;
    }

    if (importedCandidates.length === 1 && importedCandidates[0] !== undefined) {
      resolvedEdges.push(referenceEdge(reference, importedCandidates[0].id, "heuristic", 0.8));
      continue;
    }

    if (exportedCandidates.length === 1 && exportedCandidates[0] !== undefined) {
      resolvedEdges.push(referenceEdge(reference, exportedCandidates[0].id, "heuristic", 0.5));
      continue;
    }

    unresolvedReferences.push(reference);
    resolvedEdges.push(referenceEdge(reference, null, "unresolved", 0));
  }

  const edgeById = new Map<string, GraphEdge>();
  for (const edge of [...structuralEdges, ...resolvedEdges]) {
    edgeById.set(edge.id, edge);
  }

  return {
    files: buildFiles(input.sourceDocuments, input.indexedAt),
    symbols: [...symbols].sort((left, right) => compareText(left.id, right.id)),
    edges: [...edgeById.values()].sort((left, right) => compareText(left.id, right.id)),
    pendingReferences: unresolvedReferences.sort((left, right) => compareText(left.id, right.id))
  };
}
