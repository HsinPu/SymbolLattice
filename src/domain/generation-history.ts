import { compareStableText } from "./order.js";
import type {
  ExtractionPluginProvenance,
  GraphEdge,
  GraphSnapshot,
  IndexedFile,
  PendingReference,
  SymbolNode
} from "./types.js";

/** Raised when an allegedly immutable snapshot cannot be compared safely. */
export class GenerationSnapshotComparisonError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GenerationSnapshotComparisonError";
  }
}

/** One bounded, deterministically ordered structural change category. */
export interface BoundedGenerationChanges<T> {
  readonly items: readonly T[];
  /** Count before the response bound was applied. */
  readonly total: number;
  readonly truncated: boolean;
}

export interface ModifiedGenerationFile {
  readonly path: string;
  readonly before: IndexedFile;
  readonly after: IndexedFile;
}

export interface ModifiedGenerationSymbol {
  readonly id: string;
  readonly before: SymbolNode;
  readonly after: SymbolNode;
}

export interface ModifiedGenerationEdge {
  readonly id: string;
  readonly before: GraphEdge;
  readonly after: GraphEdge;
}

export interface ModifiedGenerationPendingReference {
  readonly id: string;
  readonly before: PendingReference;
  readonly after: PendingReference;
}

/**
 * A structural comparison of two persisted graph snapshots. File changes use
 * project path plus content hash and language; all graph facts use their stable
 * IDs. A stable ID with changed persisted fields is an explicit modification,
 * not a claim that the underlying code moved or maps to a Git hunk.
 */
export interface GenerationSnapshotDiff {
  readonly files: {
    readonly added: BoundedGenerationChanges<IndexedFile>;
    readonly removed: BoundedGenerationChanges<IndexedFile>;
    readonly modified: BoundedGenerationChanges<ModifiedGenerationFile>;
  };
  readonly symbols: {
    readonly added: BoundedGenerationChanges<SymbolNode>;
    readonly removed: BoundedGenerationChanges<SymbolNode>;
    readonly modified: BoundedGenerationChanges<ModifiedGenerationSymbol>;
  };
  readonly edges: {
    readonly added: BoundedGenerationChanges<GraphEdge>;
    readonly removed: BoundedGenerationChanges<GraphEdge>;
    readonly modified: BoundedGenerationChanges<ModifiedGenerationEdge>;
  };
  readonly pendingReferences: {
    readonly added: BoundedGenerationChanges<PendingReference>;
    readonly removed: BoundedGenerationChanges<PendingReference>;
    readonly modified: BoundedGenerationChanges<ModifiedGenerationPendingReference>;
  };
}

export interface GenerationSnapshotDiffOptions {
  /** Applied independently to every added, removed, and modified category. */
  readonly limit: number;
}

type KeyedRecord = {
  readonly id: string;
};

function requirePositiveLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("Generation diff limit must be a positive whole number.");
  }
}

function indexRecords<T>(
  records: readonly T[],
  keyFor: (record: T) => string,
  category: string
): ReadonlyMap<string, T> {
  const indexed = new Map<string, T>();
  for (const record of records) {
    const key = keyFor(record);
    if (indexed.has(key)) {
      throw new GenerationSnapshotComparisonError(
        `Cannot compare a snapshot with duplicate ${category} identity: ${key}.`
      );
    }
    indexed.set(key, record);
  }
  return indexed;
}

function compareByKey<T>(keyFor: (record: T) => string): (left: T, right: T) => number {
  return (left, right) => compareStableText(keyFor(left), keyFor(right));
}

function boundedChanges<T>(
  items: readonly T[],
  limit: number,
  compare: (left: T, right: T) => number
): BoundedGenerationChanges<T> {
  const ordered = [...items].sort(compare);
  return {
    items: ordered.slice(0, limit),
    total: ordered.length,
    truncated: ordered.length > limit
  };
}

function sameFile(left: IndexedFile, right: IndexedFile): boolean {
  // `indexedAt` identifies a generation's publication time, not file content.
  return (
    left.path === right.path &&
    left.contentHash === right.contentHash &&
    left.language === right.language
  );
}

function samePosition(
  left: SymbolNode["range"]["start"],
  right: SymbolNode["range"]["start"]
): boolean {
  return left.line === right.line && left.column === right.column;
}

function sameSymbol(left: SymbolNode, right: SymbolNode): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.qualifiedName === right.qualifiedName &&
    left.kind === right.kind &&
    left.filePath === right.filePath &&
    samePosition(left.range.start, right.range.start) &&
    samePosition(left.range.end, right.range.end) &&
    left.isExported === right.isExported &&
    left.declarationOrdinal === right.declarationOrdinal
  );
}

function sameStringArray(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.length === right.length &&
      left.every((value, index) => value === right[index]))
  );
}

function sameExtractionPlugin(
  left: ExtractionPluginProvenance | undefined,
  right: ExtractionPluginProvenance | undefined
): boolean {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.pluginId === right.pluginId &&
      left.pluginVersion === right.pluginVersion)
  );
}

function sameEdge(left: GraphEdge, right: GraphEdge): boolean {
  const leftEvidence = left.evidence;
  const rightEvidence = right.evidence;
  const sameEvidence =
    leftEvidence === rightEvidence ||
    (leftEvidence !== undefined &&
      rightEvidence !== undefined &&
      leftEvidence.ruleId === rightEvidence.ruleId &&
      leftEvidence.stage === rightEvidence.stage &&
      sameExtractionPlugin(leftEvidence.extractionPlugin, rightEvidence.extractionPlugin) &&
      sameStringArray(leftEvidence.candidateSymbolIds, rightEvidence.candidateSymbolIds) &&
      sameStringArray(leftEvidence.configurationPaths, rightEvidence.configurationPaths) &&
      sameStringArray(leftEvidence.resolutionPath, rightEvidence.resolutionPath));

  return (
    left.id === right.id &&
    left.sourceId === right.sourceId &&
    left.targetId === right.targetId &&
    left.kind === right.kind &&
    left.filePath === right.filePath &&
    samePosition(left.range.start, right.range.start) &&
    samePosition(left.range.end, right.range.end) &&
    left.resolution === right.resolution &&
    left.confidence === right.confidence &&
    left.referenceName === right.referenceName &&
    sameEvidence
  );
}

function samePendingReference(left: PendingReference, right: PendingReference): boolean {
  return (
    left.id === right.id &&
    left.sourceId === right.sourceId &&
    left.filePath === right.filePath &&
    left.referenceName === right.referenceName &&
    left.relationKind === right.relationKind &&
    sameExtractionPlugin(left.extractionPlugin, right.extractionPlugin) &&
    samePosition(left.range.start, right.range.start) &&
    samePosition(left.range.end, right.range.end)
  );
}

function addedAndRemoved<T>(
  before: ReadonlyMap<string, T>,
  after: ReadonlyMap<string, T>
): { readonly added: readonly T[]; readonly removed: readonly T[] } {
  const added: T[] = [];
  const removed: T[] = [];

  for (const [key, record] of after) {
    if (!before.has(key)) {
      added.push(record);
    }
  }
  for (const [key, record] of before) {
    if (!after.has(key)) {
      removed.push(record);
    }
  }

  return { added, removed };
}

function idFor(record: KeyedRecord): string {
  return record.id;
}

/**
 * Computes a bounded deterministic structural diff without reading live files,
 * Git state, or any storage adapter. A rename remains remove-plus-add unless a
 * stable ID persists. No returned change claims move attribution or Git-hunk
 * provenance.
 */
export function diffGenerationSnapshots(
  before: GraphSnapshot,
  after: GraphSnapshot,
  options: GenerationSnapshotDiffOptions
): GenerationSnapshotDiff {
  requirePositiveLimit(options.limit);

  const beforeFiles = indexRecords(before.files, (file) => file.path, "file path");
  const afterFiles = indexRecords(after.files, (file) => file.path, "file path");
  const fileChanges = addedAndRemoved(beforeFiles, afterFiles);
  const modifiedFiles: ModifiedGenerationFile[] = [];
  for (const [path, previous] of beforeFiles) {
    const current = afterFiles.get(path);
    if (current !== undefined && !sameFile(previous, current)) {
      modifiedFiles.push({ path, before: previous, after: current });
    }
  }

  const beforeSymbols = indexRecords(before.symbols, idFor, "symbol");
  const afterSymbols = indexRecords(after.symbols, idFor, "symbol");
  const symbolChanges = addedAndRemoved(beforeSymbols, afterSymbols);
  const modifiedSymbols: ModifiedGenerationSymbol[] = [];
  for (const [id, previous] of beforeSymbols) {
    const current = afterSymbols.get(id);
    if (current !== undefined && !sameSymbol(previous, current)) {
      modifiedSymbols.push({ id, before: previous, after: current });
    }
  }

  const beforeEdges = indexRecords(before.edges, idFor, "edge");
  const afterEdges = indexRecords(after.edges, idFor, "edge");
  const edgeChanges = addedAndRemoved(beforeEdges, afterEdges);
  const modifiedEdges: ModifiedGenerationEdge[] = [];
  for (const [id, previous] of beforeEdges) {
    const current = afterEdges.get(id);
    if (current !== undefined && !sameEdge(previous, current)) {
      modifiedEdges.push({ id, before: previous, after: current });
    }
  }

  const beforePendingReferences = indexRecords(
    before.pendingReferences,
    idFor,
    "pending reference"
  );
  const afterPendingReferences = indexRecords(
    after.pendingReferences,
    idFor,
    "pending reference"
  );
  const pendingReferenceChanges = addedAndRemoved(beforePendingReferences, afterPendingReferences);
  const modifiedPendingReferences: ModifiedGenerationPendingReference[] = [];
  for (const [id, previous] of beforePendingReferences) {
    const current = afterPendingReferences.get(id);
    if (current !== undefined && !samePendingReference(previous, current)) {
      modifiedPendingReferences.push({ id, before: previous, after: current });
    }
  }

  const limit = options.limit;
  return {
    files: {
      added: boundedChanges(fileChanges.added, limit, compareByKey((file) => file.path)),
      removed: boundedChanges(fileChanges.removed, limit, compareByKey((file) => file.path)),
      modified: boundedChanges(modifiedFiles, limit, compareByKey((file) => file.path))
    },
    symbols: {
      added: boundedChanges(symbolChanges.added, limit, compareByKey(idFor)),
      removed: boundedChanges(symbolChanges.removed, limit, compareByKey(idFor)),
      modified: boundedChanges(modifiedSymbols, limit, compareByKey((symbol) => symbol.id))
    },
    edges: {
      added: boundedChanges(edgeChanges.added, limit, compareByKey(idFor)),
      removed: boundedChanges(edgeChanges.removed, limit, compareByKey(idFor)),
      modified: boundedChanges(modifiedEdges, limit, compareByKey((edge) => edge.id))
    },
    pendingReferences: {
      added: boundedChanges(pendingReferenceChanges.added, limit, compareByKey(idFor)),
      removed: boundedChanges(pendingReferenceChanges.removed, limit, compareByKey(idFor)),
      modified: boundedChanges(
        modifiedPendingReferences,
        limit,
        compareByKey((reference) => reference.id)
      )
    }
  };
}
