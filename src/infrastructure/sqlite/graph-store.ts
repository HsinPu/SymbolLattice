import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { join, resolve } from "node:path";

import type {
  ArtifactFacts,
  PersistedArtifactFacts
} from "../../domain/facts.js";
import type { ProjectIndexInputs } from "../../domain/index-inputs.js";
import type { IndexWork } from "../../domain/index-work.js";
import type {
  ArtifactLanguage,
  EdgeKind,
  GraphEdge,
  GraphSnapshot,
  IndexedFile,
  IndexCounts,
  IndexStatus,
  PendingReference,
  ResolutionKind,
  SourceRange,
  SymbolKind,
  SymbolNode
} from "../../domain/types.js";
import type { GeneratedFileClassification } from "../../domain/generated-files.js";
import type { SourceRoleClassification } from "../../domain/source-roles.js";
import { identifierWords, identifierTermVariants, numericIdentifierTerms } from "../../domain/identifier-search.js";
import {
  matchCallableSource, scoreCallableSource, SOURCE_LEXICAL_LIMITS, SOURCE_LEXICAL_POLICY, NUMERIC_BINDING_CONTEXT_LIMITS,
  type SourceLexicalDocument, type SourceLexicalRetrieval
} from "../../domain/source-lexical.js";
import {
  MAX_SOURCE_SEARCH_LIMIT,
  sourceSearchCorpus,
  sourceSearchTerms,
  type IndexedSourceDocument,
  type IndexedSourceSearchHit,
  type SourceSearchRequest
} from "../../domain/source-search.js";
import type {
  ActiveGraphBundle,
  ActiveStatusBundle,
  ActiveGenerationBundle,
  ActiveBoundedGraphBundle,
  ActiveFileSummaryPage,
  ActiveFileSummaryRequest,
  ActiveSourceDocumentsBundle,
  ActiveSourceDocumentsProjection,
  ActiveUnresolvedCallsProjection,
  ActiveSourceSearchBundle,
  BoundedGraphQueryRequest,
  BoundedGraphQueryDiagnostics,
  GenerationComparisonBundle,
  GenerationHistoryBundle,
  GenerationHistoryEntry,
  GenerationSnapshotBundle,
  GraphStore,
  ReplaceProjectFactsInput
} from "../../ports/graph-store.js";

const INDEX_DIRECTORY_NAME = ".SymbolLattice";
const DATABASE_FILE_NAME = "index.sqlite";
const INDEXED_AT_META_KEY = "indexed_at";
const ACTIVE_GENERATION_ID_META_KEY = "active_generation_id";
const SCHEMA_VERSION_META_KEY = "schema_version";
const INDEX_INPUTS_SCHEMA_VERSION = "3";
const INDEX_WORK_SCHEMA_VERSION = "4";
// Source retrieval is a strictly additive v0.4 capability. Keep the metadata
// marker at v4 so a v0.3 reader can still open and replace this index; v0.4
// detects its extra tables before attempting source-search reads.
const SCHEMA_VERSION = INDEX_WORK_SCHEMA_VERSION;
// The first unreleased v0.4 candidate used this marker. Accept it only long
// enough to install the additive tables and normalize metadata back to v4.
const PRE_RELEASE_SOURCE_SEARCH_SCHEMA_VERSION = "5";
const GENERATION_SCHEMA_VERSION = "2";
const LEGACY_SCHEMA_VERSION = "1";
const SOURCE_DOCUMENT_PATH_QUERY_BATCH_SIZE = 500;
const GENERATION_SNAPSHOT_VERSION = 2;
const GENERATION_SNAPSHOT_PART_MAXIMUM_JSON_LENGTH = 1024 * 1024;
const MAX_RETAINED_GENERATIONS = 5;
const MAX_BOUNDED_SEED_FILES = 64;
const MAX_BOUNDED_SEED_SYMBOLS = 256;
const MAX_BOUNDED_SYMBOLS_PER_FILE = 4;
const MAX_BOUNDED_NODES = 4096;
const MAX_BOUNDED_RELATIONSHIPS = 16384;
const MAX_BOUNDED_HOPS = 4;
const BOUNDED_QUERY_PARAMETER_BATCH_SIZE = 500;
const READ_BUSY_TIMEOUT_MS = 1_000;
const PERSISTENT_READ_CACHE_KIB = 16 * 1024;
const MEMORY_TEMP_STORE_MIN_SYMBOLS = 8_192;
const MEMORY_TEMP_STORE_MAX_SYMBOLS = 65_536;

/**
 * The v0.1 snapshot tables remain deliberately unpartitioned. They are a fast
 * read projection and keep old indexes queryable while v2 has no active raw
 * facts generation yet.
 */
const SNAPSHOT_SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    language TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    generated INTEGER NOT NULL DEFAULT 0,
    generated_evidence_json TEXT,
    source_role_json TEXT
  ) STRICT;

  CREATE TABLE IF NOT EXISTS symbols (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    qualified_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    file_path TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    end_column INTEGER NOT NULL,
    is_exported INTEGER NOT NULL,
    declaration_ordinal INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS symbols_by_name ON symbols(name);
  CREATE INDEX IF NOT EXISTS symbols_by_qualified_name ON symbols(qualified_name);
  CREATE INDEX IF NOT EXISTS symbols_by_file_path ON symbols(file_path);

  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT,
    kind TEXT NOT NULL,
    file_path TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    end_column INTEGER NOT NULL,
    resolution TEXT NOT NULL,
    confidence REAL NOT NULL,
    reference_name TEXT
  ) STRICT;

  CREATE INDEX IF NOT EXISTS edges_by_source ON edges(source_id, kind);
  CREATE INDEX IF NOT EXISTS edges_by_target ON edges(target_id, kind);

  CREATE TABLE IF NOT EXISTS pending_refs (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    reference_name TEXT NOT NULL,
    relation_kind TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    end_column INTEGER NOT NULL,
    extension_json TEXT
  ) STRICT;

  CREATE INDEX IF NOT EXISTS pending_refs_by_name ON pending_refs(reference_name);
`;

/**
 * v2 side tables are intentionally separate from the v0.1 snapshot
 * projection. This makes the migration additive: a legacy graph remains
 * readable until the next successful replacement creates an active generation.
 */
const GENERATION_SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    indexed_at TEXT NOT NULL,
    extractor_version TEXT NOT NULL,
    resolver_version TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS artifact_facts (
    generation_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    language TEXT NOT NULL,
    extractor_version TEXT NOT NULL,
    facts_json TEXT NOT NULL,
    PRIMARY KEY(generation_id, file_path),
    FOREIGN KEY(generation_id) REFERENCES generations(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS artifact_facts_by_file_path
    ON artifact_facts(file_path, generation_id);

  CREATE TABLE IF NOT EXISTS edge_evidence (
    generation_id TEXT NOT NULL,
    edge_id TEXT NOT NULL,
    evidence_json TEXT NOT NULL,
    PRIMARY KEY(generation_id, edge_id),
    FOREIGN KEY(generation_id) REFERENCES generations(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS edge_evidence_by_edge_id
    ON edge_evidence(edge_id, generation_id);
`;

/**
 * v3 binds the inputs that selected a generation to that generation itself.
 * Keeping the compact payload in one row makes the active pointer sufficient
 * to select graph projection, raw facts, edge evidence, and freshness inputs
 * from the same SQLite snapshot.
 */
const GENERATION_INDEX_INPUTS_SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS generation_index_inputs (
    generation_id TEXT PRIMARY KEY,
    inputs_json TEXT NOT NULL,
    FOREIGN KEY(generation_id) REFERENCES generations(id) ON DELETE CASCADE
  ) STRICT;
`;

/**
 * v4 records the actual indexing work next to the graph generation it
 * produced. The row is intentionally optional: generations created by v1-v3
 * stay honest about not having work telemetry.
 */
const GENERATION_INDEX_WORK_SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS generation_index_work (
    generation_id TEXT PRIMARY KEY,
    work_json TEXT NOT NULL,
    FOREIGN KEY(generation_id) REFERENCES generations(id) ON DELETE CASCADE
  ) STRICT;
`;

/**
 * Retained snapshots preserve the immutable graph output for a bounded set of
 * generations. The active v0.1 projection remains unpartitioned for ordinary
 * graph reads and v0.10 compatibility.
 */
const GENERATION_SNAPSHOTS_SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS generation_snapshots (
    generation_id TEXT PRIMARY KEY,
    snapshot_version INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    FOREIGN KEY(generation_id) REFERENCES generations(id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE IF NOT EXISTS generation_snapshot_parts (
    generation_id TEXT NOT NULL,
    section TEXT NOT NULL CHECK(section IN ('files', 'symbols', 'edges', 'pendingReferences')),
    part_index INTEGER NOT NULL,
    part_json TEXT NOT NULL,
    PRIMARY KEY(generation_id, section, part_index),
    FOREIGN KEY(generation_id) REFERENCES generations(id) ON DELETE CASCADE
  ) STRICT;
`;

/**
 * The v0.4 source-retrieval side tables remain additive while metadata stays
 * v4-compatible. The ordinary document table keeps raw source available to
 * callers, while FTS5 holds a derived corpus. A per-generation version row
 * makes upgraded v1-v4 generations honestly report that no source retrieval
 * projection was captured for them.
 */
const GENERATION_SOURCE_SEARCH_SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS generation_source_search (
    generation_id TEXT PRIMARY KEY,
    source_search_version TEXT NOT NULL,
    FOREIGN KEY(generation_id) REFERENCES generations(id) ON DELETE CASCADE
  ) STRICT;
`;

const SOURCE_DOCUMENTS_SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS source_documents (
    generation_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    language TEXT NOT NULL,
    source_text TEXT NOT NULL,
    PRIMARY KEY(generation_id, file_path),
    FOREIGN KEY(generation_id) REFERENCES generations(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS source_documents_by_file_path
    ON source_documents(file_path, generation_id);
`;

const SOURCE_SEARCH_SCHEMA = `
  CREATE VIRTUAL TABLE IF NOT EXISTS source_search USING fts5(
    generation_id UNINDEXED,
    file_path UNINDEXED,
    language UNINDEXED,
    corpus
  );
`;

/** Additive lookup indexes used by the bounded explore read projection. */
const BOUNDED_GRAPH_QUERY_INDEXES_SCHEMA = `
  CREATE INDEX IF NOT EXISTS symbols_by_lower_name
    ON symbols(lower(name));
  CREATE INDEX IF NOT EXISTS symbols_by_lower_qualified_name
    ON symbols(lower(qualified_name));
  CREATE INDEX IF NOT EXISTS edges_by_file_path
    ON edges(file_path);
  CREATE INDEX IF NOT EXISTS pending_refs_by_file_path
    ON pending_refs(file_path);
`;

type SupportedSchemaVersion =
  | typeof LEGACY_SCHEMA_VERSION
  | typeof GENERATION_SCHEMA_VERSION
  | typeof INDEX_INPUTS_SCHEMA_VERSION
  | typeof INDEX_WORK_SCHEMA_VERSION
  | typeof PRE_RELEASE_SOURCE_SEARCH_SCHEMA_VERSION;

interface CountRow {
  readonly count: number;
}

interface MetaRow {
  readonly value: string;
}

interface FileRow {
  readonly path: string;
  readonly content_hash: string;
  readonly language: IndexedFile["language"];
  readonly indexed_at: string;
  readonly generated: number;
  readonly generated_evidence_json: string | null;
  readonly source_role_json: string | null;
}

interface FileSummaryRow {
  readonly path: string;
  readonly declaration_count: number;
  readonly edge_count: number;
  readonly pending_reference_count: number;
}

interface SymbolRow {
  readonly id: string;
  readonly name: string;
  readonly qualified_name: string;
  readonly kind: SymbolKind;
  readonly file_path: string;
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
  readonly is_exported: number;
  readonly declaration_ordinal: number;
}

interface EdgeRow {
  readonly id: string;
  readonly source_id: string;
  readonly target_id: string | null;
  readonly kind: EdgeKind;
  readonly file_path: string;
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
  readonly resolution: ResolutionKind;
  readonly confidence: number;
  readonly reference_name: string | null;
  readonly evidence_json?: string | null;
}

interface PendingReferenceRow {
  readonly id: string;
  readonly source_id: string;
  readonly file_path: string;
  readonly reference_name: string;
  readonly relation_kind: PendingReference["relationKind"];
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
  readonly extension_json?: string | null;
}

interface ArtifactFactsRow {
  readonly file_path: string;
  readonly content_hash: string;
  readonly language: ArtifactLanguage;
  readonly extractor_version: string;
  readonly facts_json: string;
}

interface GenerationIndexInputsRow {
  readonly inputs_json: string;
}

interface GenerationIndexWorkRow {
  readonly work_json: string;
}

interface GenerationRow {
  readonly indexed_at: string;
  readonly extractor_version: string;
  readonly resolver_version: string;
}

interface GenerationSourceSearchRow {
  readonly source_search_version: string;
}

interface GenerationSnapshotRow {
  readonly snapshot_version: number;
  readonly snapshot_json: string;
}

type GenerationSnapshotSection = keyof Pick<
  GraphSnapshot,
  "files" | "symbols" | "edges" | "pendingReferences"
>;

interface GenerationSnapshotPartRow {
  readonly section: GenerationSnapshotSection;
  readonly part_index: number;
  readonly part_json: string;
}

interface GenerationHistoryRow {
  readonly id: string;
  readonly indexed_at: string;
  readonly extractor_version: string;
  readonly resolver_version: string;
  readonly snapshot_version: number;
  readonly snapshot_json: string;
  readonly work_json: string | null;
}

interface SourceSearchRow {
  readonly file_path: string;
  readonly language: ArtifactLanguage;
  readonly source_text: string;
  readonly relevance: number;
}

interface SourceSearchPathRow {
  readonly file_path: string;
  readonly relevance: number;
}

interface SourceDocumentRow {
  readonly file_path: string;
  readonly language: ArtifactLanguage;
  readonly source_text: string;
}

function databasePathFor(projectPath: string): string {
  return join(resolve(projectPath), INDEX_DIRECTORY_NAME, DATABASE_FILE_NAME);
}

function toRange(row: {
  readonly start_line: number;
  readonly start_column: number;
  readonly end_line: number;
  readonly end_column: number;
}): SourceRange {
  return {
    start: { line: row.start_line, column: row.start_column },
    end: { line: row.end_line, column: row.end_column }
  };
}

function defaultCounts(): IndexCounts {
  return { files: 0, symbols: 0, edges: 0, pendingReferences: 0 };
}

function tableExists(database: DatabaseSync, tableName: string): boolean {
  return (
    database
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) !== undefined
  );
}

function columnExists(database: DatabaseSync, tableName: string, columnName: string): boolean {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all() as unknown as readonly {
    readonly name: string;
  }[];
  return rows.some((row) => row.name === columnName);
}

function ensurePendingReferenceExtensionColumn(database: DatabaseSync): void {
  if (!columnExists(database, "pending_refs", "extension_json")) {
    database.exec("ALTER TABLE pending_refs ADD COLUMN extension_json TEXT");
  }
}

function ensureGeneratedFileColumns(database: DatabaseSync): void {
  if (!columnExists(database, "files", "generated")) {
    database.exec("ALTER TABLE files ADD COLUMN generated INTEGER NOT NULL DEFAULT 0");
  }
  if (!columnExists(database, "files", "generated_evidence_json")) {
    database.exec("ALTER TABLE files ADD COLUMN generated_evidence_json TEXT");
  }
  if (!columnExists(database, "files", "source_role_json")) {
    database.exec("ALTER TABLE files ADD COLUMN source_role_json TEXT");
  }
  database.exec(
    "CREATE INDEX IF NOT EXISTS files_generated_path ON files(path) WHERE generated = 1"
  );
}

function readCount(database: DatabaseSync, tableName: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as unknown as CountRow;
  return row.count;
}

function readCounts(database: DatabaseSync): IndexCounts {
  return {
    files: readCount(database, "files"),
    symbols: readCount(database, "symbols"),
    edges: readCount(database, "edges"),
    pendingReferences: readCount(database, "pending_refs")
  };
}

function isIndexCounts(value: unknown): value is IndexCounts {
  if (value === null || typeof value !== "object") return false;
  const counts = value as Record<string, unknown>;
  return [counts.files, counts.symbols, counts.edges, counts.pendingReferences].every(
    (count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0
  );
}

function readActiveCounts(database: DatabaseSync, generationId: string | null): IndexCounts {
  if (generationId !== null) {
    const row = readGenerationSnapshotRow(database, generationId);
    if (row?.snapshot_version === GENERATION_SNAPSHOT_VERSION) {
      try {
        const metadata = JSON.parse(row.snapshot_json) as { readonly counts?: unknown };
        if (isIndexCounts(metadata?.counts)) return metadata.counts;
      } catch {
        // A damaged receipt cannot replace exact projection counts.
      }
    }
  }
  // Legacy indexes and incomplete receipts still report the live projection.
  return readCounts(database);
}

/**
 * A projection replacement deletes the previous generation in the same write
 * transaction that installs the next one. Keep every multi-query read in one
 * SQLite snapshot so an external writer cannot switch generations between the
 * metadata lookup and a dependent projection or facts lookup.
 */
function readConsistently<T>(database: DatabaseSync, read: () => T): T {
  database.exec("BEGIN");
  try {
    const result = read();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the original read failure if SQLite has already ended the transaction.
    }
    throw error;
  }
}

function configureReadDatabase(database: DatabaseSync): DatabaseSync {
  database.exec(`PRAGMA busy_timeout = ${READ_BUSY_TIMEOUT_MS}`);
  return database;
}

function getMeta(database: DatabaseSync, key: string): string | null {
  const row = database.prepare("SELECT value FROM meta WHERE key = ?").get(key) as unknown as
    | MetaRow
    | undefined;
  return row?.value ?? null;
}

function setMeta(database: DatabaseSync, key: string, value: string): void {
  database
    .prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

function unsupportedSchemaError(version: string | null): Error {
  if (version === null) {
    return new Error(
      "SymbolLattice index is missing its schema version metadata. Remove or rebuild this index explicitly."
    );
  }

  return new Error(
    `SymbolLattice index schema version \"${version}\" is unsupported by this release (supported: ${LEGACY_SCHEMA_VERSION}, ${GENERATION_SCHEMA_VERSION}, ${INDEX_INPUTS_SCHEMA_VERSION}, ${INDEX_WORK_SCHEMA_VERSION}; legacy prerelease ${PRE_RELEASE_SOURCE_SEARCH_SCHEMA_VERSION} is normalized on initialization). Rebuild with a compatible SymbolLattice version.`
  );
}

function readSchemaVersion(database: DatabaseSync): SupportedSchemaVersion {
  if (!tableExists(database, "meta")) {
    throw unsupportedSchemaError(null);
  }

  const version = getMeta(database, SCHEMA_VERSION_META_KEY);
  if (
    version === LEGACY_SCHEMA_VERSION ||
    version === GENERATION_SCHEMA_VERSION ||
    version === INDEX_INPUTS_SCHEMA_VERSION ||
    version === INDEX_WORK_SCHEMA_VERSION ||
    version === PRE_RELEASE_SOURCE_SEARCH_SCHEMA_VERSION
  ) {
    return version;
  }

  throw unsupportedSchemaError(version);
}

function installCurrentAdditiveSchema(database: DatabaseSync): void {
  database.exec(GENERATION_SCHEMA);
  database.exec(GENERATION_INDEX_INPUTS_SCHEMA);
  database.exec(GENERATION_INDEX_WORK_SCHEMA);
  database.exec(GENERATION_SNAPSHOTS_SCHEMA);
  database.exec(GENERATION_SOURCE_SEARCH_SCHEMA);
  database.exec(SOURCE_DOCUMENTS_SCHEMA);
  database.exec(SOURCE_SEARCH_SCHEMA);
}

function cleanOrphanedSourceSearchRows(database: DatabaseSync): void {
  if (!supportsSourceSearch(database)) {
    return;
  }

  // v0.3 does not know the FTS5 table. Its generation delete cascades the
  // ordinary source rows, but SQLite virtual tables cannot carry that foreign
  // key, so an old reindex can leave behind an invisible FTS row.
  database.exec(`
    DELETE FROM source_search
    WHERE NOT EXISTS (
      SELECT 1
      FROM source_documents
      WHERE source_documents.generation_id = source_search.generation_id
        AND source_documents.file_path = source_search.file_path
    );
  `);
}

function migrateDatabaseToCurrent(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    // All historic revisions use the same v0.1 projection. The v2-v4
    // additions are independent side tables, so this is a strictly additive
    // upgrade that preserves the active graph and any raw facts already there.
    installCurrentAdditiveSchema(database);
    database.exec(BOUNDED_GRAPH_QUERY_INDEXES_SCHEMA);
    ensurePendingReferenceExtensionColumn(database);
    ensureGeneratedFileColumns(database);
    cleanOrphanedSourceSearchRows(database);
    backfillActiveGenerationSnapshot(database);
    pruneRetainedGenerations(database, getActiveGenerationId(database));
    setMeta(database, SCHEMA_VERSION_META_KEY, SCHEMA_VERSION);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function initializeNewDatabase(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(SNAPSHOT_SCHEMA);
    installCurrentAdditiveSchema(database);
    database.exec(BOUNDED_GRAPH_QUERY_INDEXES_SCHEMA);
    ensurePendingReferenceExtensionColumn(database);
    ensureGeneratedFileColumns(database);
    backfillActiveGenerationSnapshot(database);
    pruneRetainedGenerations(database, getActiveGenerationId(database));
    setMeta(database, SCHEMA_VERSION_META_KEY, SCHEMA_VERSION);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function ensureSchema(database: DatabaseSync, databaseExisted: boolean): void {
  if (!databaseExisted) {
    initializeNewDatabase(database);
    return;
  }

  const schemaVersion = readSchemaVersion(database);
  if (schemaVersion !== SCHEMA_VERSION) {
    migrateDatabaseToCurrent(database);
    return;
  }

  // A previous additive initialization might have been interrupted after the
  // main schema version was stored. Restore its tables, repair the active
  // snapshot when the generation is real, then clean old FTS rows and prune.
  database.exec("BEGIN IMMEDIATE");
  try {
    installCurrentAdditiveSchema(database);
    database.exec(BOUNDED_GRAPH_QUERY_INDEXES_SCHEMA);
    ensurePendingReferenceExtensionColumn(database);
    ensureGeneratedFileColumns(database);
    cleanOrphanedSourceSearchRows(database);
    backfillActiveGenerationSnapshot(database);
    pruneRetainedGenerations(database, getActiveGenerationId(database));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Prefer WAL only after a valid schema transaction has completed. SQLite keeps
 * the current journal mode when a target cannot use WAL, so an unsupported
 * filesystem remains usable with its existing durable mode. A writer lock still
 * surfaces as SQLite's normal error rather than being hidden. We intentionally
 * leave synchronous/checkpoint settings at SQLite defaults.
 */
function preferWriteAheadLogging(database: DatabaseSync): void {
  database.prepare("PRAGMA journal_mode = WAL").get();
}

function getActiveGenerationId(database: DatabaseSync): string | null {
  return getMeta(database, ACTIVE_GENERATION_ID_META_KEY);
}

function supportsGenerationData(schemaVersion: SupportedSchemaVersion): boolean {
  return schemaVersion !== LEGACY_SCHEMA_VERSION;
}

function supportsIndexInputs(schemaVersion: SupportedSchemaVersion): boolean {
  return (
    schemaVersion === INDEX_INPUTS_SCHEMA_VERSION ||
    schemaVersion === INDEX_WORK_SCHEMA_VERSION ||
    schemaVersion === PRE_RELEASE_SOURCE_SEARCH_SCHEMA_VERSION
  );
}

function supportsIndexWork(schemaVersion: SupportedSchemaVersion): boolean {
  return (
    schemaVersion === INDEX_WORK_SCHEMA_VERSION ||
    schemaVersion === PRE_RELEASE_SOURCE_SEARCH_SCHEMA_VERSION
  );
}

function supportsSourceSearch(database: DatabaseSync): boolean {
  return (
    tableExists(database, "generation_source_search") &&
    tableExists(database, "source_documents") &&
    tableExists(database, "source_search")
  );
}

function parseJson<T>(json: string, description: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    const reason = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`SymbolLattice index contains invalid ${description} JSON.${reason}`);
  }
}

function generatedFileClassification(row: FileRow): GeneratedFileClassification | null {
  if (row.generated_evidence_json !== null) {
    const parsed = parseJson<GeneratedFileClassification>(
      row.generated_evidence_json,
      `generated-file evidence for ${row.path}`
    );
    if (
      typeof parsed.classifierVersion === "string" &&
      parsed.classifierVersion.length > 0 &&
      typeof parsed.generated === "boolean" &&
      Array.isArray(parsed.evidence)
    ) {
      return parsed;
    }
    throw new Error(`Generated-file evidence for ${row.path} has an invalid shape.`);
  }
  return null;
}

function sourceRoleClassification(row: FileRow): SourceRoleClassification | null {
  if (row.source_role_json === null) return null;
  const parsed = parseJson<SourceRoleClassification>(
    row.source_role_json,
    `source-role evidence for ${row.path}`
  );
  if (
    typeof parsed.classifierVersion === "string" &&
    parsed.classifierVersion.length > 0 &&
    (
      parsed.role === "production" ||
      parsed.role === "test" ||
      parsed.role === "icon" ||
      parsed.role === "localization"
    ) &&
    Array.isArray(parsed.evidence)
  ) {
    return parsed;
  }
  throw new Error(`Source-role evidence for ${row.path} has an invalid shape.`);
}

function toGraphEdge(row: EdgeRow): GraphEdge {
  const edge: GraphEdge = {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    kind: row.kind,
    filePath: row.file_path,
    range: toRange(row),
    resolution: row.resolution,
    confidence: row.confidence,
    referenceName: row.reference_name
  };

  if (row.evidence_json === undefined || row.evidence_json === null) {
    return edge;
  }

  return {
    ...edge,
    evidence: parseJson<NonNullable<GraphEdge["evidence"]>>(
      row.evidence_json,
      `edge evidence for ${row.id}`
    )
  };
}

function extractorVersionFor(artifactFacts: readonly PersistedArtifactFacts[]): string {
  const versions = [...new Set(artifactFacts.map((facts) => facts.extractorVersion))].sort();
  return versions.length === 0 ? "none" : versions.join("+");
}

function artifactFactsPayload(facts: PersistedArtifactFacts): ArtifactFacts {
  return {
    symbols: facts.symbols,
    edges: facts.edges,
    pendingReferences: facts.pendingReferences,
    localBindings: facts.localBindings,
    referenceScopes: facts.referenceScopes,
    importBindings: facts.importBindings,
    exportBindings: facts.exportBindings,
    reExportBindings: facts.reExportBindings,
    ...(facts.commonJsFacts === undefined ? {} : { commonJsFacts: facts.commonJsFacts }),
    ...(facts.typescriptFacts === undefined ? {} : { typescriptFacts: facts.typescriptFacts }),
    ...(facts.nestRouteFacts === undefined ? {} : { nestRouteFacts: facts.nestRouteFacts }),
    ...(facts.nestGraphqlFacts === undefined ? {} : { nestGraphqlFacts: facts.nestGraphqlFacts }),
    ...(facts.fastifyPluginFacts === undefined
      ? {}
      : { fastifyPluginFacts: facts.fastifyPluginFacts }),
    ...(facts.frameworkRoutePluginFacts === undefined
      ? {}
      : { frameworkRoutePluginFacts: facts.frameworkRoutePluginFacts }),
    ...(facts.fastApiRouterFacts === undefined
      ? {}
      : { fastApiRouterFacts: facts.fastApiRouterFacts }),
    ...(facts.djangoNinjaRouterFacts === undefined
      ? {}
      : { djangoNinjaRouterFacts: facts.djangoNinjaRouterFacts }),
    ...(facts.flaskBlueprintFacts === undefined
      ? {}
      : { flaskBlueprintFacts: facts.flaskBlueprintFacts }),
    ...(facts.sanicBlueprintFacts === undefined
      ? {}
      : { sanicBlueprintFacts: facts.sanicBlueprintFacts }),
    ...(facts.djangoUrlFacts === undefined ? {} : { djangoUrlFacts: facts.djangoUrlFacts }),
    ...(facts.goFrameStandardRouterFacts === undefined
      ? {}
      : { goFrameStandardRouterFacts: facts.goFrameStandardRouterFacts }),
    ...(facts.goProjectFacts === undefined ? {} : { goProjectFacts: facts.goProjectFacts }),
    ...(facts.rustProjectFacts === undefined ? {} : { rustProjectFacts: facts.rustProjectFacts }),
    ...(facts.adaProjectFacts === undefined ? {} : { adaProjectFacts: facts.adaProjectFacts }),
    ...(facts.rustActixServiceConfigFacts === undefined
      ? {}
      : { rustActixServiceConfigFacts: facts.rustActixServiceConfigFacts }),
    ...(facts.scalaFacts === undefined ? {} : { scalaFacts: facts.scalaFacts }),
    ...(facts.scalaRelationFacts === undefined ? {} : { scalaRelationFacts: facts.scalaRelationFacts }),
    ...(facts.elixirFacts === undefined ? {} : { elixirFacts: facts.elixirFacts }),
    ...(facts.erlangFacts === undefined ? {} : { erlangFacts: facts.erlangFacts }),
    ...(facts.clojureFacts === undefined ? {} : { clojureFacts: facts.clojureFacts }),
    ...(facts.nixFacts === undefined ? {} : { nixFacts: facts.nixFacts }),
    ...(facts.nimFacts === undefined ? {} : { nimFacts: facts.nimFacts }),
    ...(facts.zigFacts === undefined ? {} : { zigFacts: facts.zigFacts }),
    ...(facts.cppFacts === undefined ? {} : { cppFacts: facts.cppFacts }),
    ...(facts.cFacts === undefined ? {} : { cFacts: facts.cFacts }),
    ...(facts.phpFacts === undefined ? {} : { phpFacts: facts.phpFacts }),
    ...(facts.objcFacts === undefined ? {} : { objcFacts: facts.objcFacts }),
    ...(facts.rubyFacts === undefined ? {} : { rubyFacts: facts.rubyFacts }),
    ...(facts.sqlFacts === undefined ? {} : { sqlFacts: facts.sqlFacts }),
    ...(facts.javaFacts === undefined ? {} : { javaFacts: facts.javaFacts }),
    ...(facts.jvmFacts === undefined ? {} : { jvmFacts: facts.jvmFacts }),
    ...(facts.springBootPropertiesFacts === undefined
      ? {}
      : { springBootPropertiesFacts: facts.springBootPropertiesFacts }),
    ...(facts.liquidFacts === undefined ? {} : { liquidFacts: facts.liquidFacts }),
    ...(facts.solidityFacts === undefined ? {} : { solidityFacts: facts.solidityFacts }),
    ...(facts.twigFacts === undefined ? {} : { twigFacts: facts.twigFacts }),
    ...(facts.jspFacts === undefined ? {} : { jspFacts: facts.jspFacts }),
    ...(facts.markdownFacts === undefined ? {} : { markdownFacts: facts.markdownFacts }),
    ...(facts.protoFacts === undefined ? {} : { protoFacts: facts.protoFacts }),
    ...(facts.graphqlFacts === undefined ? {} : { graphqlFacts: facts.graphqlFacts }),
    ...(facts.rFacts === undefined ? {} : { rFacts: facts.rFacts }),
    ...(facts.bladeFacts === undefined ? {} : { bladeFacts: facts.bladeFacts }),
    ...(facts.reactNativeFacts === undefined ? {} : { reactNativeFacts: facts.reactNativeFacts }),
    ...(facts.swiftObjectiveCFacts === undefined
      ? {}
      : { swiftObjectiveCFacts: facts.swiftObjectiveCFacts }),
    ...(facts.swiftFacts === undefined ? {} : { swiftFacts: facts.swiftFacts }),
    ...(facts.dartFacts === undefined ? {} : { dartFacts: facts.dartFacts }),
    ...(facts.csharpFacts === undefined ? {} : { csharpFacts: facts.csharpFacts }),
    ...(facts.fsharpFacts === undefined ? {} : { fsharpFacts: facts.fsharpFacts }),
    ...(facts.ocamlFacts === undefined ? {} : { ocamlFacts: facts.ocamlFacts }),
    ...(facts.haskellFacts === undefined ? {} : { haskellFacts: facts.haskellFacts }),
    ...(facts.razorFacts === undefined ? {} : { razorFacts: facts.razorFacts }),
    ...(facts.csharpDirectClassFacts === undefined ? {} : { csharpDirectClassFacts: facts.csharpDirectClassFacts }),
    ...(facts.pythonFacts === undefined ? {} : { pythonFacts: facts.pythonFacts })
  };
}

const INSERT_FILE_SQL = `INSERT INTO files(
  path, content_hash, language, indexed_at, generated, generated_evidence_json, source_role_json
) VALUES (?, ?, ?, ?, ?, ?, ?)`;
const INSERT_SYMBOL_SQL = `INSERT INTO symbols(
  id, name, qualified_name, kind, file_path,
  start_line, start_column, end_line, end_column,
  is_exported, declaration_ordinal
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const INSERT_EDGE_SQL = `INSERT INTO edges(
  id, source_id, target_id, kind, file_path,
  start_line, start_column, end_line, end_column,
  resolution, confidence, reference_name
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const INSERT_PENDING_REFERENCE_SQL = `INSERT INTO pending_refs(
  id, source_id, file_path, reference_name, relation_kind,
  start_line, start_column, end_line, end_column, extension_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const INSERT_ARTIFACT_FACTS_SQL = `INSERT INTO artifact_facts(
  generation_id, file_path, content_hash, language, extractor_version, facts_json
) VALUES (?, ?, ?, ?, ?, ?)`;
const INSERT_EDGE_EVIDENCE_SQL =
  "INSERT INTO edge_evidence(generation_id, edge_id, evidence_json) VALUES (?, ?, ?)";
const INSERT_SOURCE_DOCUMENT_SQL = `INSERT INTO source_documents(
  generation_id, file_path, language, source_text
) VALUES (?, ?, ?, ?)`;
const INSERT_SOURCE_SEARCH_SQL = `INSERT INTO source_search(
  generation_id, file_path, language, corpus
) VALUES (?, ?, ?, ?)`;

function insertFile(statement: StatementSync, file: IndexedFile): void {
  const generated = file.generated;
  const sourceRole = file.sourceRole;
  statement.run(
      file.path,
      file.contentHash,
      file.language,
      file.indexedAt,
      Number(generated?.generated ?? false),
      generated === undefined ? null : JSON.stringify(generated),
      sourceRole === undefined ? null : JSON.stringify(sourceRole)
  );
}

function insertSymbol(statement: StatementSync, symbol: SymbolNode): void {
  statement.run(
      symbol.id,
      symbol.name,
      symbol.qualifiedName,
      symbol.kind,
      symbol.filePath,
      symbol.range.start.line,
      symbol.range.start.column,
      symbol.range.end.line,
      symbol.range.end.column,
      Number(symbol.isExported),
      symbol.declarationOrdinal
  );
}

function insertEdge(statement: StatementSync, edge: GraphEdge): void {
  statement.run(
      edge.id,
      edge.sourceId,
      edge.targetId,
      edge.kind,
      edge.filePath,
      edge.range.start.line,
      edge.range.start.column,
      edge.range.end.line,
      edge.range.end.column,
      edge.resolution,
      edge.confidence,
      edge.referenceName
  );
}

function insertPendingReference(statement: StatementSync, reference: PendingReference): void {
  const extension = {
    ...(reference.extractionPlugin === undefined
      ? {}
      : { extractionPlugin: reference.extractionPlugin }),
    ...(reference.projectPlugin === undefined ? {} : { projectPlugin: reference.projectPlugin })
  };
  statement.run(
      reference.id,
      reference.sourceId,
      reference.filePath,
      reference.referenceName,
      reference.relationKind,
      reference.range.start.line,
      reference.range.start.column,
      reference.range.end.line,
      reference.range.end.column,
      Object.keys(extension).length === 0 ? null : JSON.stringify(extension)
  );
}

function insertArtifactFacts(
  statement: StatementSync,
  generationId: string,
  facts: PersistedArtifactFacts
): void {
  statement.run(
      generationId,
      facts.filePath,
      facts.contentHash,
      facts.language,
      facts.extractorVersion,
      JSON.stringify(artifactFactsPayload(facts))
  );
}

function insertEdgeEvidence(statement: StatementSync, generationId: string, edge: GraphEdge): void {
  if (edge.evidence === undefined) {
    return;
  }

  statement.run(generationId, edge.id, JSON.stringify(edge.evidence));
}

function insertIndexInputs(
  database: DatabaseSync,
  generationId: string,
  indexInputs: ProjectIndexInputs
): void {
  database
    .prepare(
      "INSERT INTO generation_index_inputs(generation_id, inputs_json) VALUES (?, ?)"
    )
    .run(generationId, JSON.stringify(indexInputs));
}

function insertIndexWork(database: DatabaseSync, generationId: string, indexWork: IndexWork): void {
  database
    .prepare("INSERT INTO generation_index_work(generation_id, work_json) VALUES (?, ?)")
    .run(generationId, JSON.stringify(indexWork));
}

function insertSourceSearchVersion(
  database: DatabaseSync,
  generationId: string,
  sourceSearchVersion: string
): void {
  database
    .prepare(
      "INSERT INTO generation_source_search(generation_id, source_search_version) VALUES (?, ?)"
    )
    .run(generationId, sourceSearchVersion);
}

function insertSourceDocument(
  documentStatement: StatementSync,
  searchStatement: StatementSync,
  generationId: string,
  document: IndexedSourceDocument
): void {
  documentStatement.run(generationId, document.filePath, document.language, document.sourceText);
  searchStatement.run(
      generationId,
      document.filePath,
      document.language,
      sourceSearchCorpus(document.sourceText)
  );
}

function emptySnapshot(): GraphSnapshot {
  return { files: [], symbols: [], edges: [], pendingReferences: [] };
}

function uninitializedStatus(projectPath: string): IndexStatus {
  return {
    initialized: false,
    stale: false,
    staleReasons: [],
    projectPath,
    indexedAt: null,
    generationId: null,
    counts: defaultCounts()
  };
}

function readGeneration(database: DatabaseSync, generationId: string | null): GenerationRow | null {
  if (generationId === null) {
    return null;
  }

  const row = database
    .prepare(
      `SELECT indexed_at, extractor_version, resolver_version
       FROM generations
       WHERE id = ?`
    )
    .get(generationId) as unknown as GenerationRow | undefined;
  return row ?? null;
}

function snapshotCounts(snapshot: GraphSnapshot): IndexCounts {
  return {
    files: snapshot.files.length,
    symbols: snapshot.symbols.length,
    edges: snapshot.edges.length,
    pendingReferences: snapshot.pendingReferences.length
  };
}

function insertGenerationSnapshot(
  database: DatabaseSync,
  generationId: string,
  snapshot: GraphSnapshot
): void {
  database
    .prepare("DELETE FROM generation_snapshot_parts WHERE generation_id = ?")
    .run(generationId);
  database
    .prepare(
      `INSERT INTO generation_snapshots(generation_id, snapshot_version, snapshot_json)
       VALUES (?, ?, ?)`
    )
    .run(
      generationId,
      GENERATION_SNAPSHOT_VERSION,
      JSON.stringify({ counts: snapshotCounts(snapshot) })
    );

  const insertPart = database.prepare(
    `INSERT INTO generation_snapshot_parts(generation_id, section, part_index, part_json)
     VALUES (?, ?, ?, ?)`
  );
  for (const section of ["files", "symbols", "edges", "pendingReferences"] as const) {
    let partIndex = 0;
    let entries: string[] = [];
    let jsonLength = 2;
    const flush = (): void => {
      insertPart.run(generationId, section, partIndex, `[${entries.join(",")}]`);
      partIndex += 1;
      entries = [];
      jsonLength = 2;
    };
    for (const value of snapshot[section]) {
      const json = JSON.stringify(value);
      const nextLength = jsonLength + json.length + (entries.length === 0 ? 0 : 1);
      if (entries.length > 0 && nextLength > GENERATION_SNAPSHOT_PART_MAXIMUM_JSON_LENGTH) {
        flush();
      }
      entries.push(json);
      jsonLength += json.length + (entries.length === 1 ? 0 : 1);
    }
    flush();
  }
}

function readGenerationSnapshot(
  database: DatabaseSync,
  generationId: string,
  row: GenerationSnapshotRow
): GraphSnapshot {
  if (row.snapshot_version === 1) {
    return parseJson<GraphSnapshot>(row.snapshot_json, `snapshot for generation ${generationId}`);
  }
  if (row.snapshot_version !== GENERATION_SNAPSHOT_VERSION) {
    throw new Error(
      `Snapshot for generation ${generationId} has unsupported version ${row.snapshot_version}.`
    );
  }
  const rows = database
    .prepare(
      `SELECT section, part_index, part_json
       FROM generation_snapshot_parts
       WHERE generation_id = ?
       ORDER BY section, part_index`
    )
    .all(generationId) as unknown as GenerationSnapshotPartRow[];
  const snapshot: {
    files: GraphSnapshot["files"][number][];
    symbols: GraphSnapshot["symbols"][number][];
    edges: GraphSnapshot["edges"][number][];
    pendingReferences: GraphSnapshot["pendingReferences"][number][];
  } = { files: [], symbols: [], edges: [], pendingReferences: [] };
  const seenSections = new Set<GenerationSnapshotSection>();
  for (const part of rows) {
    const values = parseJson<unknown[]>(
      part.part_json,
      `${part.section} snapshot part ${part.part_index} for generation ${generationId}`
    );
    if (!Array.isArray(values)) {
      throw new Error(
        `Snapshot part ${part.section}:${part.part_index} for generation ${generationId} is not an array.`
      );
    }
    seenSections.add(part.section);
    (snapshot[part.section] as unknown[]).push(...values);
  }
  for (const section of ["files", "symbols", "edges", "pendingReferences"] as const) {
    if (!seenSections.has(section)) {
      throw new Error(`Snapshot for generation ${generationId} is missing its ${section} parts.`);
    }
  }
  return snapshot;
}

function generationSnapshotCounts(row: GenerationHistoryRow): IndexCounts {
  if (row.snapshot_version === 1) {
    return snapshotCounts(
      parseJson<GraphSnapshot>(row.snapshot_json, `snapshot for generation ${row.id}`)
    );
  }
  const metadata = parseJson<{ readonly counts?: IndexCounts }>(
    row.snapshot_json,
    `snapshot metadata for generation ${row.id}`
  );
  if (row.snapshot_version !== GENERATION_SNAPSHOT_VERSION || metadata.counts === undefined) {
    throw new Error(`Snapshot metadata for generation ${row.id} has an unsupported shape.`);
  }
  return metadata.counts;
}

function readGenerationSnapshotRow(
  database: DatabaseSync,
  generationId: string
): GenerationSnapshotRow | null {
  if (!tableExists(database, "generation_snapshots")) {
    return null;
  }

  const row = database
    .prepare(
      `SELECT snapshot_version, snapshot_json
       FROM generation_snapshots
       WHERE generation_id = ?`
    )
    .get(generationId) as unknown as GenerationSnapshotRow | undefined;
  return row ?? null;
}

function hasGenerationSnapshot(database: DatabaseSync, generationId: string): boolean {
  return readGenerationSnapshotRow(database, generationId) !== null;
}

function backfillActiveGenerationSnapshot(database: DatabaseSync): void {
  const activeGenerationId = getActiveGenerationId(database);
  if (
    activeGenerationId === null ||
    readGeneration(database, activeGenerationId) === null ||
    hasGenerationSnapshot(database, activeGenerationId)
  ) {
    return;
  }

  insertGenerationSnapshot(
    database,
    activeGenerationId,
    readSnapshotProjection(database, activeGenerationId)
  );
}

function readRetainedGenerationHistoryEntries(
  database: DatabaseSync,
  activeGenerationId: string
): readonly GenerationHistoryEntry[] {
  if (!tableExists(database, "generation_snapshots")) {
    return [];
  }

  const rows = database
    .prepare(
      `SELECT g.id, g.indexed_at, g.extractor_version, g.resolver_version,
        s.snapshot_version, s.snapshot_json, w.work_json
       FROM generations AS g
       INNER JOIN generation_snapshots AS s ON s.generation_id = g.id
       LEFT JOIN generation_index_work AS w ON w.generation_id = g.id
       ORDER BY g.indexed_at DESC, g.id DESC
       LIMIT ?`
    )
    .all(MAX_RETAINED_GENERATIONS) as unknown as GenerationHistoryRow[];
  if (!rows.some((row) => row.id === activeGenerationId)) {
    const activeRow = database
      .prepare(
        `SELECT g.id, g.indexed_at, g.extractor_version, g.resolver_version,
          s.snapshot_version, s.snapshot_json, w.work_json
         FROM generations AS g
         INNER JOIN generation_snapshots AS s ON s.generation_id = g.id
         LEFT JOIN generation_index_work AS w ON w.generation_id = g.id
         WHERE g.id = ?`
      )
      .get(activeGenerationId) as unknown as GenerationHistoryRow | undefined;
    if (activeRow !== undefined) {
      rows.pop();
      rows.push(activeRow);
      rows.sort((left, right) => {
        if (left.indexed_at !== right.indexed_at) {
          return left.indexed_at < right.indexed_at ? 1 : -1;
        }
        if (left.id === right.id) {
          return 0;
        }
        return left.id < right.id ? 1 : -1;
      });
    }
  }

  return rows.map((row) => {
    return {
      generationId: row.id,
      indexedAt: row.indexed_at,
      snapshotVersion: row.snapshot_version,
      counts: generationSnapshotCounts(row),
      indexWork:
        row.work_json === null
          ? null
          : parseJson<IndexWork>(row.work_json, `index work for generation ${row.id}`),
      extractorVersion: row.extractor_version,
      resolverVersion: row.resolver_version
    };
  });
}

function readGenerationHistoryBundle(
  database: DatabaseSync,
  projectPath: string
): GenerationHistoryBundle | null {
  const activeGraphBundle = readActiveGraphBundle(database, projectPath);
  const activeGenerationId = activeGraphBundle.status.generationId;
  if (
    activeGenerationId === null ||
    !hasGenerationSnapshot(database, activeGenerationId)
  ) {
    return null;
  }

  const generations = readRetainedGenerationHistoryEntries(database, activeGenerationId);
  if (!generations.some((generation) => generation.generationId === activeGenerationId)) {
    return null;
  }

  return {
    status: activeGraphBundle.status,
    activeGraph: activeGraphBundle,
    retentionLimit: MAX_RETAINED_GENERATIONS,
    generations
  };
}

function readGenerationSnapshotBundleFromHistory(
  database: DatabaseSync,
  history: GenerationHistoryBundle,
  generationId: string
): GenerationSnapshotBundle | null {
  const generation = history.generations.find(
    (candidate) => candidate.generationId === generationId
  );
  const snapshotRow = generation === undefined ? null : readGenerationSnapshotRow(database, generationId);
  if (generation === undefined || snapshotRow === null) {
    return null;
  }

  return {
    status: history.status,
    generation,
    snapshot: readGenerationSnapshot(database, generationId, snapshotRow)
  };
}

function readGenerationSnapshotBundle(
  database: DatabaseSync,
  projectPath: string,
  generationId: string
): GenerationSnapshotBundle | null {
  const history = readGenerationHistoryBundle(database, projectPath);
  return history === null
    ? null
    : readGenerationSnapshotBundleFromHistory(database, history, generationId);
}

function readGenerationComparisonBundle(
  database: DatabaseSync,
  projectPath: string,
  fromGenerationId: string,
  toGenerationId: string | undefined
): GenerationComparisonBundle | null {
  const history = readGenerationHistoryBundle(database, projectPath);
  if (history === null) {
    return null;
  }

  const resolvedToGenerationId = toGenerationId ?? history.activeGraph.status.generationId;
  return {
    history,
    from: readGenerationSnapshotBundleFromHistory(database, history, fromGenerationId),
    to:
      resolvedToGenerationId === null
        ? null
        : readGenerationSnapshotBundleFromHistory(database, history, resolvedToGenerationId)
  };
}

function pruneRetainedGenerations(
  database: DatabaseSync,
  activeGenerationId: string | null
): void {
  const rows = database
    .prepare("SELECT id FROM generations ORDER BY indexed_at DESC, id DESC")
    .all() as unknown as readonly { readonly id: string }[];
  const retainedGenerationIds = new Set<string>();
  if (activeGenerationId !== null && rows.some((row) => row.id === activeGenerationId)) {
    retainedGenerationIds.add(activeGenerationId);
  }
  for (const row of rows) {
    if (retainedGenerationIds.size >= MAX_RETAINED_GENERATIONS) {
      break;
    }
    retainedGenerationIds.add(row.id);
  }

  const deleteSourceSearch = tableExists(database, "source_search")
    ? database.prepare("DELETE FROM source_search WHERE generation_id = ?")
    : null;
  const deleteGeneration = database.prepare("DELETE FROM generations WHERE id = ?");
  for (const row of rows) {
    if (retainedGenerationIds.has(row.id)) {
      continue;
    }

    deleteSourceSearch?.run(row.id);
    deleteGeneration.run(row.id);
  }
}

function readActiveFiles(database: DatabaseSync): readonly IndexedFile[] {
  const generatedSelect = columnExists(database, "files", "generated")
    ? "generated"
    : "0 AS generated";
  const generatedEvidenceSelect = columnExists(database, "files", "generated_evidence_json")
    ? "generated_evidence_json"
    : "NULL AS generated_evidence_json";
  const sourceRoleSelect = columnExists(database, "files", "source_role_json")
    ? "source_role_json"
    : "NULL AS source_role_json";
  const files = database
    .prepare(
      `SELECT path, content_hash, language, indexed_at,
        ${generatedSelect}, ${generatedEvidenceSelect}, ${sourceRoleSelect}
       FROM files ORDER BY path`
    )
    .all() as unknown as FileRow[];
  return files.map((file) => {
    const generated = generatedFileClassification(file);
    const sourceRole = sourceRoleClassification(file);
    return {
      path: file.path,
      contentHash: file.content_hash,
      language: file.language,
      indexedAt: file.indexed_at,
      ...(generated === null ? {} : { generated }),
      ...(sourceRole === null ? {} : { sourceRole })
    };
  });
}

function readActiveFileSummaryPage(
  database: DatabaseSync,
  projectPath: string,
  request: ActiveFileSummaryRequest
): ActiveFileSummaryPage {
  const active = readActiveStatusState(database, projectPath);
  const files = readActiveFiles(database);
  const generationMatched =
    request.expectedGenerationId === undefined ||
    request.expectedGenerationId === active.generationId;
  const baseConditions: string[] = [];
  const baseParameters: (string | number)[] = [];
  if (request.pathPrefix !== undefined) {
    baseConditions.push("(f.path = ? OR f.path LIKE ? ESCAPE '\\')");
    baseParameters.push(request.pathPrefix, `${escapeLike(request.pathPrefix)}/%`);
  }
  if (request.language !== undefined) {
    baseConditions.push("f.language = ?");
    baseParameters.push(request.language);
  }
  const baseWhere = baseConditions.length === 0 ? "" : `WHERE ${baseConditions.join(" AND ")}`;
  const matchedFileCount = generationMatched
    ? (database.prepare(`SELECT count(*) AS count FROM files f ${baseWhere}`)
        .get(...baseParameters) as unknown as CountRow).count
    : 0;
  const cursorMatched = request.afterFilePath === undefined || (
    generationMatched &&
    (database.prepare(
      `SELECT count(*) AS count FROM files f ${
        baseConditions.length === 0 ? "WHERE" : `${baseWhere} AND`
      } f.path = ?`
    ).get(...baseParameters, request.afterFilePath) as unknown as CountRow).count === 1
  );
  const pageConditions = [...baseConditions];
  const pageParameters = [...baseParameters];
  if (request.afterFilePath !== undefined) {
    pageConditions.push("f.path > ?");
    pageParameters.push(request.afterFilePath);
  }
  const pageWhere = pageConditions.length === 0 ? "" : `WHERE ${pageConditions.join(" AND ")}`;
  const pageMatchCount = generationMatched && cursorMatched
    ? (database.prepare(`SELECT count(*) AS count FROM files f ${pageWhere}`)
        .get(...pageParameters) as unknown as CountRow).count
    : 0;
  const rows = generationMatched && cursorMatched
    ? database.prepare(
      `SELECT f.path,
        COALESCE(s.declaration_count, 0) AS declaration_count,
        COALESCE(e.edge_count, 0) AS edge_count,
        COALESCE(p.pending_reference_count, 0) AS pending_reference_count
       FROM files f
       LEFT JOIN (
         SELECT file_path, count(*) AS declaration_count
         FROM symbols WHERE kind <> 'file' GROUP BY file_path
       ) s ON s.file_path = f.path
       LEFT JOIN (
         SELECT file_path, count(*) AS edge_count FROM edges GROUP BY file_path
       ) e ON e.file_path = f.path
       LEFT JOIN (
         SELECT file_path, count(*) AS pending_reference_count
         FROM pending_refs GROUP BY file_path
       ) p ON p.file_path = f.path
       ${pageWhere}
       ORDER BY f.path
       LIMIT ?`
    ).all(...pageParameters, request.limit) as unknown as FileSummaryRow[]
    : [];
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  return {
    status: active.status,
    files,
    indexInputs: readActiveIndexInputs(database, active.schemaVersion, active.generationId),
    extractorVersion: active.generation?.extractor_version ?? null,
    resolverVersion: active.generation?.resolver_version ?? null,
    sourceSearchVersion: readActiveSourceSearchVersion(database, active.generationId),
    generationMatched,
    cursorMatched,
    matchedFileCount,
    remainingFileCount: Math.max(0, pageMatchCount - rows.length),
    rows: rows.flatMap((row) => {
      const file = fileByPath.get(row.path);
      return file === undefined ? [] : [{
        file,
        declarationCount: row.declaration_count,
        edgeCount: row.edge_count,
        pendingReferenceCount: row.pending_reference_count
      }];
    })
  };
}

function readSnapshotProjection(
  database: DatabaseSync,
  activeGenerationId: string | null
): GraphSnapshot {
  const files = readActiveFiles(database);
  const symbols = database
    .prepare(
      `SELECT id, name, qualified_name, kind, file_path,
        start_line, start_column, end_line, end_column,
        is_exported, declaration_ordinal
       FROM symbols
       ORDER BY file_path, start_line, start_column, name, id`
    )
    .all() as unknown as SymbolRow[];
  const edges =
    activeGenerationId === null
      ? (database
          .prepare(
            `SELECT id, source_id, target_id, kind, file_path,
              start_line, start_column, end_line, end_column,
              resolution, confidence, reference_name
             FROM edges
             ORDER BY file_path, start_line, start_column, kind, id`
          )
          .all() as unknown as EdgeRow[])
      : (database
          .prepare(
            `SELECT e.id, e.source_id, e.target_id, e.kind, e.file_path,
              e.start_line, e.start_column, e.end_line, e.end_column,
              e.resolution, e.confidence, e.reference_name,
              ee.evidence_json
             FROM edges AS e
             LEFT JOIN edge_evidence AS ee
               ON ee.generation_id = ? AND ee.edge_id = e.id
             ORDER BY e.file_path, e.start_line, e.start_column, e.kind, e.id`
          )
          .all(activeGenerationId) as unknown as EdgeRow[]);
  const pendingReferenceExtensionSelect = columnExists(
    database,
    "pending_refs",
    "extension_json"
  )
    ? "extension_json"
    : "NULL AS extension_json";
  const pendingReferences = database
    .prepare(
      `SELECT id, source_id, file_path, reference_name, relation_kind,
        start_line, start_column, end_line, end_column, ${pendingReferenceExtensionSelect}
       FROM pending_refs
       ORDER BY file_path, start_line, start_column, relation_kind, id`
    )
    .all() as unknown as PendingReferenceRow[];

  return {
    files,
    symbols: symbols.map((symbol) => ({
      id: symbol.id,
      name: symbol.name,
      qualifiedName: symbol.qualified_name,
      kind: symbol.kind,
      filePath: symbol.file_path,
      range: toRange(symbol),
      isExported: symbol.is_exported === 1,
      declarationOrdinal: symbol.declaration_ordinal
    })),
    edges: edges.map(toGraphEdge),
    pendingReferences: pendingReferences.map((reference) => ({
      id: reference.id,
      sourceId: reference.source_id,
      filePath: reference.file_path,
      referenceName: reference.reference_name,
      relationKind: reference.relation_kind,
      range: toRange(reference),
      ...pendingReferenceExtension(reference.extension_json)
    }))
  };
}

function pendingReferenceExtension(
  value: string | null | undefined
): Pick<PendingReference, "extractionPlugin" | "projectPlugin"> {
  if (value === null || value === undefined) {
    return {};
  }
  const parsed = JSON.parse(value) as Record<string, unknown>;
  // v0.250 and older stored extraction provenance directly in extension_json.
  if (typeof parsed.pluginId === "string" && typeof parsed.pluginVersion === "string") {
    return {
      extractionPlugin: { pluginId: parsed.pluginId, pluginVersion: parsed.pluginVersion }
    };
  }
  return {
    ...(parsed.extractionPlugin === undefined
      ? {}
      : {
          extractionPlugin: parsed.extractionPlugin as NonNullable<
            PendingReference["extractionPlugin"]
          >
        }),
    ...(parsed.projectPlugin === undefined
      ? {}
      : {
          projectPlugin: parsed.projectPlugin as NonNullable<PendingReference["projectPlugin"]>
        })
  };
}

function readActiveArtifactFacts(
  database: DatabaseSync,
  schemaVersion: SupportedSchemaVersion,
  activeGenerationId: string | null
): readonly PersistedArtifactFacts[] {
  if (!supportsGenerationData(schemaVersion) || activeGenerationId === null) {
    return [];
  }

  const rows = database
    .prepare(
      `SELECT file_path, content_hash, language, extractor_version, facts_json
       FROM artifact_facts
       WHERE generation_id = ?
       ORDER BY file_path`
    )
    .all(activeGenerationId) as unknown as ArtifactFactsRow[];

  return rows.map((row): PersistedArtifactFacts => {
    const facts = parseJson<ArtifactFacts>(row.facts_json, `artifact facts for ${row.file_path}`);
    return {
      ...facts,
      // v1-v3 payloads predate re-export extraction. Make the missing field
      // explicit at the storage boundary so later resolution sees a stable
      // ArtifactFacts contract without claiming a re-export existed.
      reExportBindings: facts.reExportBindings ?? [],
      filePath: row.file_path,
      contentHash: row.content_hash,
      language: row.language,
      extractorVersion: row.extractor_version
    };
  });
}

function readActiveIndexInputs(
  database: DatabaseSync,
  schemaVersion: SupportedSchemaVersion,
  activeGenerationId: string | null
): ProjectIndexInputs | null {
  if (!supportsIndexInputs(schemaVersion) || activeGenerationId === null) {
    return null;
  }

  const row = database
    .prepare(
      `SELECT inputs_json
       FROM generation_index_inputs
       WHERE generation_id = ?`
    )
    .get(activeGenerationId) as unknown as GenerationIndexInputsRow | undefined;

  return row === undefined
    ? null
    : parseJson<ProjectIndexInputs>(
        row.inputs_json,
        `index inputs for generation ${activeGenerationId}`
      );
}

function readActiveIndexWork(
  database: DatabaseSync,
  schemaVersion: SupportedSchemaVersion,
  activeGenerationId: string | null
): IndexWork | null {
  if (!supportsIndexWork(schemaVersion) || activeGenerationId === null) {
    return null;
  }

  const row = database
    .prepare(
      `SELECT work_json
       FROM generation_index_work
       WHERE generation_id = ?`
    )
    .get(activeGenerationId) as unknown as GenerationIndexWorkRow | undefined;

  return row === undefined
    ? null
    : parseJson<IndexWork>(row.work_json, `index work for generation ${activeGenerationId}`);
}

function readActiveSourceSearchVersion(
  database: DatabaseSync,
  activeGenerationId: string | null
): string | null {
  if (!supportsSourceSearch(database) || activeGenerationId === null) {
    return null;
  }

  const row = database
    .prepare(
      `SELECT source_search_version
       FROM generation_source_search
       WHERE generation_id = ?`
    )
    .get(activeGenerationId) as unknown as GenerationSourceSearchRow | undefined;
  return row?.source_search_version ?? null;
}

function sourceSearchPrefixQuery(terms: readonly string[]): string | null {
  const normalizedTerms = [
    ...new Set(terms.flatMap((term) => sourceSearchTerms(term)))
  ];
  if (normalizedTerms.length === 0) {
    return null;
  }

  return normalizedTerms
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(" AND ");
}

function boundedSourceSearchLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return MAX_SOURCE_SEARCH_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 0), MAX_SOURCE_SEARCH_LIMIT);
}

function normalizedPathPrefix(pathPrefix: string | undefined): string | null {
  if (pathPrefix === undefined) {
    return null;
  }

  const normalized = pathPrefix.replace(/\/+$/u, "");
  return normalized === "" || normalized === "." ? null : normalized;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, "\\$&");
}

function readActiveSourceSearchHits(
  database: DatabaseSync,
  activeGenerationId: string | null,
  sourceSearchVersion: string | null,
  request: SourceSearchRequest
): readonly IndexedSourceSearchHit[] {
  if (
    !supportsSourceSearch(database) ||
    activeGenerationId === null ||
    sourceSearchVersion === null
  ) {
    return [];
  }

  const matchQuery = sourceSearchPrefixQuery(request.terms);
  const limit = boundedSourceSearchLimit(request.limit);
  if (matchQuery === null || limit === 0) {
    return [];
  }

  const where = ["source_search MATCH ?", "source_search.generation_id = ?"];
  const parameters: (string | number)[] = [matchQuery, activeGenerationId];
  if (request.language !== undefined) {
    where.push("source_documents.language = ?");
    parameters.push(request.language);
  }

  const pathPrefix = normalizedPathPrefix(request.pathPrefix);
  if (pathPrefix !== null) {
    where.push(
      "(source_documents.file_path = ? OR source_documents.file_path LIKE ? ESCAPE '\\')"
    );
    parameters.push(pathPrefix, `${escapeLike(pathPrefix)}/%`);
  }

  parameters.push(limit);
  const rows = database
    .prepare(
      `SELECT source_documents.file_path, source_documents.language,
        source_documents.source_text, bm25(source_search) AS relevance
       FROM source_search
       INNER JOIN source_documents
         ON source_documents.generation_id = source_search.generation_id
         AND source_documents.file_path = source_search.file_path
       WHERE ${where.join(" AND ")}
       ORDER BY relevance ASC, source_documents.file_path ASC
       LIMIT ?`
    )
    .all(...parameters) as unknown as SourceSearchRow[];

  return rows.map((row) => ({
    filePath: row.file_path,
    language: row.language,
    sourceText: row.source_text,
    relevance: row.relevance
  }));
}

/**
 * Reads only exact requested source paths. Query order is intentionally not
 * exposed: a map followed by the distinct request paths makes results stable
 * even when SQLite returns chunked `IN` queries in a different order.
 */
function readActiveSourceDocuments(
  database: DatabaseSync,
  activeGenerationId: string | null,
  sourceSearchVersion: string | null,
  filePaths: readonly string[]
): readonly IndexedSourceDocument[] {
  if (
    !supportsSourceSearch(database) ||
    activeGenerationId === null ||
    sourceSearchVersion === null ||
    filePaths.length === 0
  ) {
    return [];
  }

  const requestedPaths = [...new Set(filePaths)];
  const documentsByPath = new Map<string, IndexedSourceDocument>();
  for (
    let start = 0;
    start < requestedPaths.length;
    start += SOURCE_DOCUMENT_PATH_QUERY_BATCH_SIZE
  ) {
    const paths = requestedPaths.slice(start, start + SOURCE_DOCUMENT_PATH_QUERY_BATCH_SIZE);
    const placeholders = paths.map(() => "?").join(", ");
    const rows = database
      .prepare(
        `SELECT file_path, language, source_text
         FROM source_documents
         WHERE generation_id = ? AND file_path IN (${placeholders})
         ORDER BY file_path`
      )
      .all(activeGenerationId, ...paths) as unknown as SourceDocumentRow[];
    for (const row of rows) {
      documentsByPath.set(row.file_path, {
        filePath: row.file_path,
        language: row.language,
        sourceText: row.source_text
      });
    }
  }

  return requestedPaths.flatMap((filePath) => {
    const document = documentsByPath.get(filePath);
    return document === undefined ? [] : [document];
  });
}

function boundedQueryLimit(value: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(Math.trunc(value), 0), maximum);
}

function boundedGraphQueryBounds(request: BoundedGraphQueryRequest): {
  readonly maxSeedFiles: number;
  readonly maxSeedSymbols: number;
  readonly maxSymbolsPerFile: number;
  readonly maxNodes: number;
  readonly maxRelationships: number;
  readonly maxHops: number;
} {
  return {
    maxSeedFiles: boundedQueryLimit(request.maxSeedFiles, MAX_BOUNDED_SEED_FILES),
    maxSeedSymbols: boundedQueryLimit(request.maxSeedSymbols, MAX_BOUNDED_SEED_SYMBOLS),
    maxSymbolsPerFile: boundedQueryLimit(
      request.maxSymbolsPerFile,
      MAX_BOUNDED_SYMBOLS_PER_FILE
    ),
    maxNodes: boundedQueryLimit(request.maxNodes, MAX_BOUNDED_NODES),
    maxRelationships: boundedQueryLimit(
      request.maxRelationships,
      MAX_BOUNDED_RELATIONSHIPS
    ),
    maxHops: boundedQueryLimit(request.maxHops, MAX_BOUNDED_HOPS)
  };
}

function boundedIdentifierTerms(request: BoundedGraphQueryRequest): readonly string[] {
  const values = [
    ...request.terms,
    ...(request.query.trim().length === 0 || /\s/gu.test(request.query) ? [] : [request.query])
  ];
  return [
    ...new Set(
      values
        .map((value) => value.trim().replaceAll("\\", "/"))
        .filter((value) => value.length > 0 && !/\s/gu.test(value))
    )
  ].sort();
}

function boundedLexicalTerms(request: BoundedGraphQueryRequest): readonly string[] {
  return [
    ...new Set([
      ...request.terms.flatMap((term) => sourceSearchTerms(term)),
      ...sourceSearchTerms(request.query)
    ])
  ].sort();
}

function likelyNaturalLanguageQuery(
  request: BoundedGraphQueryRequest,
  lexicalTerms: readonly string[]
): boolean {
  const query = request.query.trim();
  void lexicalTerms;
  return /\s/gu.test(query);
}

function boundedLexicalGroups(request: BoundedGraphQueryRequest): readonly (readonly string[])[] {
  if (request.lexicalTermGroups === undefined) return boundedLexicalTerms(request).map((term) => [term]);
  return request.lexicalTermGroups.slice(0, 12)
    .map((group) => [...new Set(group.flatMap(sourceSearchTerms))].slice(0, 8))
    .filter((group) => group.length > 0);
}

function readBoundedFileSeedPaths(
  database: DatabaseSync,
  identifierTerms: readonly string[],
  maxFiles: number
): readonly string[] {
  if (maxFiles === 0 || identifierTerms.length === 0) {
    return [];
  }

  const pathTerms = identifierTerms.filter(
    (term) => /[\\/]/u.test(term) || /\.[A-Za-z0-9_-]+$/u.test(term)
  );
  if (pathTerms.length === 0) {
    return [];
  }

  const exactPlaceholders = pathTerms.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `SELECT path
       FROM files
       WHERE path IN (${exactPlaceholders})
          OR path LIKE ? ESCAPE '\\'
       ORDER BY path
       LIMIT ?`
    )
    .all(
      ...pathTerms,
      `%${escapeLike(pathTerms[0] ?? "")}%`,
      maxFiles
    ) as unknown as readonly { readonly path: string }[];
  return rows.map((row) => row.path);
}

function readBoundedSourceSeedPaths(
  database: DatabaseSync,
  activeGenerationId: string | null,
  sourceSearchVersion: string | null,
  lexicalGroups: readonly (readonly string[])[],
  maxFiles: number,
  anyConcept = false,
  sourceRoleIntent?: BoundedGraphQueryRequest["sourceRoleIntent"]
): readonly string[] {
  if (
    maxFiles === 0 ||
    activeGenerationId === null ||
    sourceSearchVersion === null ||
    !supportsSourceSearch(database)
  ) {
    return [];
  }

  const matchQuery = lexicalGroups.map((group) =>
    `(${group.map((term) => `"${term.replaceAll('"', '""')}"*`).join(" OR ")})`
  ).join(anyConcept ? " OR " : " AND ");
  if (matchQuery.length === 0) {
    return [];
  }

  const roles = ["production", ...(sourceRoleIntent?.tests ? ["test"] : []),
    ...(sourceRoleIntent?.icons ? ["icon"] : []), ...(sourceRoleIntent?.localization ? ["localization"] : [])];
  const prioritizeRoles = anyConcept && columnExists(database, "files", "source_role_json");
  const roleOrder = prioritizeRoles
    ? `CASE WHEN COALESCE(json_extract(files.source_role_json, '$.role'), 'production') IN (${roles.map(() => "?").join(",")}) THEN 0 ELSE 1 END`
    : "0 + 0";

  const rows = database
    .prepare(
      `SELECT source_search.file_path, bm25(source_search) AS relevance
       FROM source_search
       INNER JOIN source_documents
         ON source_documents.generation_id = source_search.generation_id
         AND source_documents.file_path = source_search.file_path
       INNER JOIN files ON files.path = source_search.file_path
       WHERE source_search MATCH ?
         AND source_search.generation_id = ?
       ORDER BY (${roleOrder}), relevance ASC, source_search.file_path ASC
       LIMIT ?`
    )
    .all(matchQuery, activeGenerationId, ...(prioritizeRoles ? roles : []), maxFiles) as unknown as SourceSearchPathRow[];
  return rows.map((row) => row.file_path);
}

function symbolProjectionSelect(table: "symbols" | "symbol_casefolds" = "symbols"): string {
  return `SELECT id, name, qualified_name, kind, file_path,
    start_line, start_column, end_line, end_column,
    is_exported, declaration_ordinal
    FROM ${table}`;
}

function readBoundedSymbolRows(
  database: DatabaseSync,
  identifierTerms: readonly string[],
  lexicalGroups: readonly (readonly string[])[],
  filePaths: readonly string[],
  limit: number,
  restrictToFilePaths = false,
  totalSymbolCount = 0
): readonly SymbolRow[] {
  const lexicalTerms = lexicalGroups.flat();
  if (limit === 0 || (restrictToFilePaths && filePaths.length === 0) ||
    (identifierTerms.length === 0 && lexicalTerms.length === 0 && filePaths.length === 0)) {
    return [];
  }

  // The second read only needs symbols in selected files. Avoid materializing
  // the whole symbol table when the file-path index can bound that population.
  const reuseCasefolds = lexicalGroups.length >= 2 && !restrictToFilePaths;
  const lowerName = reuseCasefolds ? "folded_name" : "lower(name)";
  const lowerQualifiedName = reuseCasefolds ? "folded_qualified_name" : "lower(qualified_name)";

  const where: string[] = [];
  const parameters: (string | number)[] = [];
  if (!restrictToFilePaths && identifierTerms.length > 0) {
    const placeholders = identifierTerms.map(() => "?").join(", ");
    const lowerTerms = identifierTerms.map((term) => term.toLowerCase());
    const lowerPlaceholders = lowerTerms.map(() => "?").join(", ");
    where.push(
      `(name IN (${placeholders}) OR qualified_name IN (${placeholders})
        OR ${lowerName} IN (${lowerPlaceholders})
        OR ${lowerQualifiedName} IN (${lowerPlaceholders}))`
    );
    parameters.push(
      ...identifierTerms,
      ...identifierTerms,
      ...lowerTerms,
      ...lowerTerms
    );
  }

  if (filePaths.length > 0) {
    where.push(`file_path IN (${filePaths.map(() => "?").join(", ")})`);
    parameters.push(...filePaths);
  }

  const partialTerms = restrictToFilePaths ? [] : lexicalTerms.filter((term) => term.length >= 2);
  if (partialTerms.length > 0) {
    const partialClauses: string[] = [];
    for (const term of partialTerms) {
      partialClauses.push(`${lowerName} LIKE ? ESCAPE '\\'`);
      parameters.push(`${escapeLike(term.toLowerCase())}%`);
      partialClauses.push(`instr(${lowerQualifiedName}, ?) > 0`);
      parameters.push(term.toLowerCase());
    }
    where.push(`(${partialClauses.join(" OR ")})`);
  }

  const exactOrderParameters: (string | number)[] = [];
  const exactOrder =
    identifierTerms.length === 0
      ? "2"
      : (() => {
          const placeholders = identifierTerms.map(() => "?").join(", ");
          const lowerTerms = identifierTerms.map((term) => term.toLowerCase());
          const lowerPlaceholders = lowerTerms.map(() => "?").join(", ");
          exactOrderParameters.push(
            ...identifierTerms,
            ...identifierTerms,
            ...lowerTerms,
            ...lowerTerms
          );
          return `CASE WHEN name IN (${placeholders})
              OR qualified_name IN (${placeholders})
              OR ${lowerName} IN (${lowerPlaceholders})
              OR ${lowerQualifiedName} IN (${lowerPlaceholders})
            THEN 0
            WHEN file_path IN (${filePaths.map(() => "?").join(", ") || "NULL"}) THEN 1
            ELSE 2 END`;
        })();
  if (identifierTerms.length > 0 && filePaths.length > 0) {
    exactOrderParameters.push(...filePaths);
  }

  // Rank concept coverage before LIMIT, rather than spend the budget on the
  // alphabetically first files containing one generic query word.
  const coverageParameters: string[] = [];
  const coverageOrder = lexicalGroups.length < 2 ? "0 + 0" : lexicalGroups.map((group) => {
    coverageParameters.push(...group);
    return `(CASE WHEN ${group.map(() => `instr(${lowerName}, ?) > 0`).join(" OR ")} THEN 1 ELSE 0 END)`;
  }).join(" + ");

  const projection = reuseCasefolds
    ? `WITH symbol_casefolds AS MATERIALIZED (
        SELECT *, lower(name) AS folded_name, lower(qualified_name) AS folded_qualified_name FROM symbols
      ) ${symbolProjectionSelect("symbol_casefolds")}`
    : symbolProjectionSelect();

  const statement = database.prepare(
    `${projection}
     WHERE ${where.join(" OR ")}
     ORDER BY (${coverageOrder}) DESC, ${exactOrder}, file_path, start_line, start_column, name, id
     LIMIT ?`
  );
  const readRows = (): readonly SymbolRow[] => statement.all(
    ...parameters, ...coverageParameters, ...exactOrderParameters, limit
  ) as unknown as SymbolRow[];

  // For medium indexes, keep this materialized ranking table in memory. Restore
  // the connection default immediately afterward so other reads and larger
  // indexes do not inherit its temporary-storage cost.
  if (!reuseCasefolds || totalSymbolCount < MEMORY_TEMP_STORE_MIN_SYMBOLS ||
    totalSymbolCount > MEMORY_TEMP_STORE_MAX_SYMBOLS) return readRows();
  database.exec("PRAGMA temp_store = MEMORY");
  try {
    return readRows();
  } finally {
    database.exec("PRAGMA temp_store = DEFAULT");
  }
}

function readBoundedSourceLexical(
  database: DatabaseSync,
  generationId: string | null,
  available: boolean,
  filePaths: readonly string[],
  groups: readonly (readonly string[])[]
): { retrieval: SourceLexicalRetrieval; rows: readonly SymbolRow[] } {
  const limits = SOURCE_LEXICAL_LIMITS;
  const numericBindingTerms = numericIdentifierTerms(groups.flat());
  const state = groups.length < 2 ? "single-concept" : !available ? "unavailable" : "searched";
  let scannedFiles = 0;
  let scannedSymbols = 0;
  let scannedCharacters = 0;
  let truncated = false;
  const documents: SourceLexicalDocument[] = [];
  const rows: SymbolRow[] = [];
  const matchingGroupsByToken = new Map<string, readonly number[]>();
  if (state === "searched") {
    truncated = filePaths.length > limits.maximumFiles;
    const readSource = database.prepare(`SELECT substr(source_text, 1, ?) AS source_text,
      length(source_text) AS characters FROM source_documents WHERE generation_id = ? AND file_path = ?`);
    const readSymbols = database.prepare(`${symbolProjectionSelect()}
      WHERE file_path = ? AND (${numericBindingTerms.length > 0
        ? "kind IN ('function', 'method', 'entrypoint', 'variable')"
        : "kind IN ('function', 'method', 'entrypoint') OR (kind = 'variable' AND is_exported = 1 AND end_line - start_line <= 12 AND file_path NOT GLOB '*.d.*ts')"})
      ORDER BY ${numericBindingTerms.length > 0 ? "" :
        "CASE WHEN kind IN ('function', 'method', 'entrypoint') THEN 0 ELSE 1 END,"}
        start_line, start_column, id LIMIT ?`);
    for (const filePath of filePaths.slice(0, limits.maximumFiles)) {
      const remaining = limits.maximumCharacters - scannedCharacters;
      const remainingSymbols = limits.maximumSymbols - scannedSymbols;
      if (remaining <= 0 || remainingSymbols <= 0) { truncated = true; break; }
      const characterLimit = Math.min(remaining, limits.maximumFileCharacters);
      const document = readSource.get(characterLimit + 1, generationId, filePath) as
        { source_text: string; characters: number } | undefined;
      if (document === undefined) continue;
      scannedFiles += 1;
      const shortened = document.characters > characterLimit || document.source_text.length > characterLimit;
      let sourceText = document.source_text.slice(0, characterLimit);
      scannedCharacters += sourceText.length;
      if (shortened) {
        truncated = true;
        // Do not treat a token cut by the file budget as a complete lexical hit.
        const lastBreak = Math.max(sourceText.lastIndexOf("\n"), sourceText.lastIndexOf("\r"),
          sourceText.lastIndexOf("\u2028"), sourceText.lastIndexOf("\u2029"));
        sourceText = sourceText.slice(0, Math.max(0, lastBreak));
      }
      const symbolLimit = Math.min(remainingSymbols, limits.maximumSymbolsPerFile);
      const fileRows = readSymbols.all(filePath, symbolLimit + 1) as unknown as SymbolRow[];
      if (fileRows.length > symbolLimit) truncated = true;
      const scanned = fileRows.slice(0, symbolLimit);
      scannedSymbols += scanned.length;
      const matched = matchCallableSource(sourceText, scanned.map(toSymbolNode), groups, matchingGroupsByToken);
      truncated ||= matched.truncated;
      documents.push(...matched.documents);
      const matchedIds = new Set(matched.candidates.map((candidate) => candidate.symbolId));
      rows.push(...scanned.filter((row) => matchedIds.has(row.id)));
    }
  }
  return { retrieval: { policy: SOURCE_LEXICAL_POLICY, limits, state,
    scannedFiles, scannedSymbols, scannedCharacters, truncated, candidates: scoreCallableSource(documents),
    ...(numericBindingTerms.length === 0 ? {} : { numericBindingTerms,
      numericBindingContext: { policy: "numeric-binding-context-v1" as const, limits: NUMERIC_BINDING_CONTEXT_LIMITS } }) }, rows };
}

function toSymbolNode(row: SymbolRow): SymbolNode {
  return {
    id: row.id,
    name: row.name,
    qualifiedName: row.qualified_name,
    kind: row.kind,
    filePath: row.file_path,
    range: toRange(row),
    isExported: row.is_exported === 1,
    declarationOrdinal: row.declaration_ordinal
  };
}

function readSymbolRowsByIds(
  database: DatabaseSync,
  ids: readonly string[]
): readonly SymbolRow[] {
  const rows: SymbolRow[] = [];
  for (
    let start = 0;
    start < ids.length;
    start += BOUNDED_QUERY_PARAMETER_BATCH_SIZE
  ) {
    const batch = ids.slice(start, start + BOUNDED_QUERY_PARAMETER_BATCH_SIZE);
    if (batch.length === 0) continue;
    rows.push(
      ...(database
        .prepare(
          `${symbolProjectionSelect()}
           WHERE id IN (${batch.map(() => "?").join(", ")})`
        )
        .all(...batch) as unknown as SymbolRow[])
    );
  }
  return rows.sort(compareSymbolRows);
}

function compareSymbolRows(left: SymbolRow, right: SymbolRow): number {
  return (
    left.file_path.localeCompare(right.file_path) ||
    left.start_line - right.start_line ||
    left.start_column - right.start_column ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
}

function compareEdgeRows(left: EdgeRow, right: EdgeRow): number {
  return (
    left.file_path.localeCompare(right.file_path) ||
    left.start_line - right.start_line ||
    left.start_column - right.start_column ||
    left.kind.localeCompare(right.kind) ||
    left.id.localeCompare(right.id)
  );
}

function readBoundedEdgesByIds(
  database: DatabaseSync,
  ids: readonly string[],
  retainedEdges: ReadonlyMap<string, EdgeRow>
): { readonly rows: readonly EdgeRow[]; readonly hadEdges: boolean } {
  const rowsById = new Map<string, EdgeRow>();
  let hadEdges = false;
  for (
    let start = 0;
    start < ids.length;
    start += BOUNDED_QUERY_PARAMETER_BATCH_SIZE
  ) {
    const batch = ids.slice(start, start + BOUNDED_QUERY_PARAMETER_BATCH_SIZE);
    if (batch.length === 0) continue;
    const placeholders = batch.map(() => "?").join(", ");
    const projection = `SELECT e.id, e.source_id, e.target_id, e.kind, e.file_path,
      e.start_line, e.start_column, e.end_line, e.end_column,
      e.resolution, e.confidence, e.reference_name
      FROM edges AS e`;
    // Frontier IDs were read from symbols or admitted through a prior joined
    // edge. Check only the opposite endpoint, while still excluding orphaned
    // edges before they can consume the node and relationship bounds.
    const outgoing = database
      .prepare(`${projection}
        INNER JOIN symbols AS target ON target.id = e.target_id
        WHERE e.resolution = 'exact' AND e.source_id IN (${placeholders})`)
      .all(...batch) as unknown as EdgeRow[];
    const incoming = database
      .prepare(`${projection}
        INNER JOIN symbols AS source ON source.id = e.source_id
        WHERE e.resolution = 'exact' AND e.target_id IN (${placeholders})`)
      .all(...batch) as unknown as EdgeRow[];
    hadEdges ||= outgoing.length > 0 || incoming.length > 0;
    for (const row of outgoing) {
      if (!retainedEdges.has(row.id)) rowsById.set(row.id, row);
    }
    for (const row of incoming) {
      if (!retainedEdges.has(row.id)) rowsById.set(row.id, row);
    }
  }
  return { rows: [...rowsById.values()].sort(compareEdgeRows), hadEdges };
}

function readBoundedEdgeEvidence(
  database: DatabaseSync,
  activeGenerationId: string | null,
  rows: readonly EdgeRow[]
): readonly GraphEdge[] {
  if (activeGenerationId === null) return rows.map(toGraphEdge);
  const evidenceByEdgeId = new Map<string, string>();
  for (let start = 0; start < rows.length; start += BOUNDED_QUERY_PARAMETER_BATCH_SIZE) {
    const batch = rows.slice(start, start + BOUNDED_QUERY_PARAMETER_BATCH_SIZE);
    const evidenceRows = database.prepare(
      `SELECT edge_id, evidence_json FROM edge_evidence
       WHERE generation_id = ? AND edge_id IN (${batch.map(() => "?").join(", ")})`
    ).all(activeGenerationId, ...batch.map((row) => row.id)) as unknown as readonly {
      readonly edge_id: string;
      readonly evidence_json: string;
    }[];
    for (const evidence of evidenceRows) evidenceByEdgeId.set(evidence.edge_id, evidence.evidence_json);
  }
  return rows.map((row) => toGraphEdge({ ...row, evidence_json: evidenceByEdgeId.get(row.id) ?? null }));
}

function readActiveBoundedGraphBundle(
  database: DatabaseSync,
  projectPath: string,
  request: BoundedGraphQueryRequest
): ActiveBoundedGraphBundle {
  const active = readActiveStatusState(database, projectPath);
  const sourceSearchVersion = readActiveSourceSearchVersion(database, active.generationId);
  const bounds = boundedGraphQueryBounds(request);
  const generationMatched =
    request.expectedGenerationId === undefined ||
    request.expectedGenerationId === active.generationId;
  const files = readActiveFiles(database);
  const identifierTerms = boundedIdentifierTerms(request);
  const lexicalGroups = boundedLexicalGroups(request);
  const lexicalTerms = lexicalGroups.flat();
  const sourceSearchAvailable =
    sourceSearchVersion !== null && supportsSourceSearch(database) && active.generationId !== null;

  if (!generationMatched || bounds.maxNodes === 0 || bounds.maxSeedFiles === 0 || bounds.maxSeedSymbols === 0) {
    const diagnostics: BoundedGraphQueryDiagnostics = {
      generationMatched,
      seedFiles: 0,
      seedSymbols: 0,
      returnedNodes: 0,
      returnedRelationships: 0,
      traversedHops: 0,
      truncated: false,
      sourceSearchAvailable,
      usedSourceSearch: false,
      fallbackRequired: false
    };
    return {
      status: active.status,
      snapshot: { files, symbols: [], edges: [], pendingReferences: [] },
      indexInputs: readActiveIndexInputs(database, active.schemaVersion, active.generationId),
      extractorVersion: active.generation?.extractor_version ?? null,
      resolverVersion: active.generation?.resolver_version ?? null,
      sourceSearchVersion,
      diagnostics,
      fallbackRequired: false
    };
  }

  const fileSeeds = readBoundedFileSeedPaths(database, identifierTerms, bounds.maxSeedFiles);
  const sourceSeedLimit = lexicalGroups.length >= 2
    ? Math.min(SOURCE_LEXICAL_LIMITS.maximumFiles, bounds.maxSeedFiles * 2) : bounds.maxSeedFiles;
  const sourceSeedHits = readBoundedSourceSeedPaths(
    database,
    active.generationId,
    sourceSearchVersion,
    lexicalGroups,
    sourceSeedLimit === 0 ? 0 : sourceSeedLimit + 1,
    lexicalGroups.length >= 2,
    request.sourceRoleIntent
  );
  const sourceSeeds = sourceSeedHits.slice(0, sourceSeedLimit);
  const directSymbolRows = readBoundedSymbolRows(
    database,
    identifierTerms,
    lexicalGroups,
    [],
    bounds.maxSeedSymbols,
    false,
    active.status.counts.symbols
  );
  const directPaths = [...new Set(directSymbolRows.map((row) => row.file_path))];
  // Interleave both retrieval channels so neither exhausts the source-reading cap alone.
  const sourcePaths = [...new Set([...fileSeeds, ...Array.from(
    { length: Math.max(directPaths.length, sourceSeeds.length) },
    (_, index) => [directPaths[index], sourceSeeds[index]].filter((path): path is string => path !== undefined)
  ).flat()])];
  const fileRoles = new Map(files.map((file) => [file.path, file.sourceRole?.role]));
  const explicitFiles = new Set(fileSeeds);
  const sourcePriority = (path: string): number => {
    if (explicitFiles.has(path)) return 0;
    const role = fileRoles.get(path) ?? "production";
    return role === "production" || (role === "test" && request.sourceRoleIntent?.tests) ||
      (role === "icon" && request.sourceRoleIntent?.icons) ||
      (role === "localization" && request.sourceRoleIntent?.localization) ? 1 : 2;
  };
  sourcePaths.sort((left, right) => sourcePriority(left) - sourcePriority(right));
  const lexical = readBoundedSourceLexical(database, active.generationId, sourceSearchAvailable, sourcePaths, lexicalGroups);
  const sourceTerms = new Map(lexical.retrieval.candidates.map((candidate) =>
    [candidate.symbolId, new Set(candidate.matches.map((match) => match.term))]));
  const coverageById = new Map<string, number>();
  const coverage = (row: SymbolRow): number => {
    const cached = coverageById.get(row.id);
    if (cached !== undefined) return cached;
    const words = new Set(identifierWords(row.name).flatMap(identifierTermVariants));
    const count = lexicalGroups.filter((group) => sourceTerms.get(row.id)?.has(group[0]!) ||
      group.some((term) => words.has(term) || row.name.toLowerCase().includes(term))).length;
    coverageById.set(row.id, count);
    return count;
  };
  const prioritizedRows = [...new Map([...directSymbolRows, ...lexical.rows].map((row) => [row.id, row])).values()]
    .sort((left, right) => lexicalGroups.length >= 2 ? coverage(right) - coverage(left) : 0);
  const selectedFilePaths = [...new Set([...fileSeeds, ...prioritizedRows.map((row) => row.file_path), ...sourceSeeds])]
    .slice(0, bounds.maxSeedFiles);
  const candidateSymbolRows = readBoundedSymbolRows(
    database,
    identifierTerms,
    lexicalGroups,
    selectedFilePaths,
    Math.min(bounds.maxSeedSymbols * Math.max(bounds.maxSymbolsPerFile, 1), MAX_BOUNDED_SEED_SYMBOLS),
    true
  );
  const seedRows: SymbolRow[] = [];
  const selectedPathSet = new Set(selectedFilePaths);
  const symbolsPerFile = new Map<string, number>();
  const seenSeedIds = new Set<string>();
  for (const row of [...prioritizedRows, ...candidateSymbolRows]) {
    if (!selectedPathSet.has(row.file_path)) continue;
    if (seenSeedIds.has(row.id)) continue;
    const count = symbolsPerFile.get(row.file_path) ?? 0;
    if (count >= bounds.maxSymbolsPerFile || seedRows.length >= bounds.maxSeedSymbols) continue;
    seenSeedIds.add(row.id);
    symbolsPerFile.set(row.file_path, count + 1);
    seedRows.push(row);
  }

  const naturalLanguage = likelyNaturalLanguageQuery(request, lexicalTerms);
  const noSeeds = seedRows.length === 0;
  const fallbackRequired = naturalLanguage && noSeeds;
  const usedSourceSearch = sourceSeeds.length > 0;
  const allSeedIds = [...new Set(seedRows.map((row) => row.id))];
  const seedIds = allSeedIds.slice(0, bounds.maxNodes);
  const knownNodeIds = new Set(seedIds);
  let truncated = seedIds.length < allSeedIds.length;
  const returnedEdgeRows = new Map<string, EdgeRow>();
  let frontier = seedIds;
  let traversedHops = 0;

  for (let hop = 1; hop <= bounds.maxHops && frontier.length > 0; hop += 1) {
    const edgeRead = readBoundedEdgesByIds(database, frontier, returnedEdgeRows);
    if (!edgeRead.hadEdges) break;
    const nextFrontier: string[] = [];
    const nextFrontierSet = new Set<string>();
    for (const row of edgeRead.rows) {
      if (returnedEdgeRows.has(row.id) || row.target_id === null) continue;
      if (returnedEdgeRows.size >= bounds.maxRelationships) {
        truncated = true;
        break;
      }
      const sourceKnown = knownNodeIds.has(row.source_id);
      const targetKnown = knownNodeIds.has(row.target_id);
      const newNodeId = sourceKnown === targetKnown ? null : sourceKnown ? row.target_id : row.source_id;
      if (newNodeId !== null && !knownNodeIds.has(newNodeId)) {
        if (knownNodeIds.size >= bounds.maxNodes) {
          truncated = true;
          continue;
        }
        knownNodeIds.add(newNodeId);
        if (!nextFrontierSet.has(newNodeId)) {
          nextFrontierSet.add(newNodeId);
          nextFrontier.push(newNodeId);
        }
      }
      returnedEdgeRows.set(row.id, row);
    }
    traversedHops = hop;
    frontier = nextFrontier.sort();
    if (returnedEdgeRows.size >= bounds.maxRelationships) break;
  }

  const symbolRows = readSymbolRowsByIds(database, [...knownNodeIds]);
  const symbolIds = new Set(symbolRows.map((row) => row.id));
  const retainedEdgeRows = [...returnedEdgeRows.values()]
    .filter((row) => row.target_id !== null && symbolIds.has(row.source_id) && symbolIds.has(row.target_id))
    .sort(compareEdgeRows);
  // Hydrate evidence only for edges that survive traversal and node bounds.
  // This read remains inside the same generation-fenced SQLite transaction.
  const edges = readBoundedEdgeEvidence(database, active.generationId, retainedEdgeRows);
  const diagnostics: BoundedGraphQueryDiagnostics = {
    generationMatched,
    seedFiles: selectedFilePaths.length,
    seedSymbols: Math.min(seedRows.length, bounds.maxNodes),
    returnedNodes: symbolRows.length,
    returnedRelationships: edges.length,
    traversedHops,
    truncated,
    sourceSearchAvailable,
    usedSourceSearch,
    fallbackRequired
  };
  return {
    status: active.status,
    snapshot: {
      files,
      symbols: symbolRows.map(toSymbolNode),
      edges,
      pendingReferences: []
    },
    indexInputs: readActiveIndexInputs(database, active.schemaVersion, active.generationId),
    extractorVersion: active.generation?.extractor_version ?? null,
    resolverVersion: active.generation?.resolver_version ?? null,
    sourceSearchVersion,
    sourceLexical: { ...lexical.retrieval,
      truncated: lexical.retrieval.truncated ||
        (lexical.retrieval.state === "searched" && sourceSeedHits.length > sourceSeedLimit),
      candidates: lexical.retrieval.candidates.filter((candidate) => symbolIds.has(candidate.symbolId)) },
    diagnostics,
    fallbackRequired
  };
}

function readActiveGraphBundle(
  database: DatabaseSync,
  projectPath: string
): ActiveGraphBundle {
  const active = readActiveStatusState(database, projectPath);
  const sourceSearchVersion = readActiveSourceSearchVersion(
    database,
    active.generationId
  );

  return {
    status: active.status,
    snapshot: readSnapshotProjection(database, active.generationId),
    indexInputs: readActiveIndexInputs(database, active.schemaVersion, active.generationId),
    extractorVersion: active.generation?.extractor_version ?? null,
    resolverVersion: active.generation?.resolver_version ?? null,
    sourceSearchVersion
  };
}

function readActiveStatusState(
  database: DatabaseSync,
  projectPath: string
): {
  readonly schemaVersion: SupportedSchemaVersion;
  readonly generationId: string | null;
  readonly generation: GenerationRow | null;
  readonly status: IndexStatus;
} {
  const schemaVersion = readSchemaVersion(database);
  const generationId =
    supportsGenerationData(schemaVersion) ? getActiveGenerationId(database) : null;
  const generation = readGeneration(database, generationId);
  const indexWork = readActiveIndexWork(database, schemaVersion, generationId);
  const statusWithoutWork: IndexStatus = {
    initialized: true,
    stale: false,
    staleReasons: [],
    projectPath,
    indexedAt: generation?.indexed_at ?? getMeta(database, INDEXED_AT_META_KEY),
    generationId,
    counts: readActiveCounts(database, generation === null ? null : generationId)
  };
  return {
    schemaVersion,
    generationId,
    generation,
    status: indexWork === null ? statusWithoutWork : { ...statusWithoutWork, lastIndexWork: indexWork }
  };
}

function readActiveStatusBundle(
  database: DatabaseSync,
  projectPath: string
): ActiveStatusBundle {
  const active = readActiveStatusState(database, projectPath);
  return {
    status: active.status,
    files: readActiveFiles(database),
    indexInputs: readActiveIndexInputs(database, active.schemaVersion, active.generationId),
    extractorVersion: active.generation?.extractor_version ?? null,
    resolverVersion: active.generation?.resolver_version ?? null,
    sourceSearchVersion: readActiveSourceSearchVersion(database, active.generationId)
  };
}

function readActiveGenerationBundle(
  database: DatabaseSync,
  projectPath: string
): ActiveGenerationBundle {
  const graphBundle = readActiveGraphBundle(database, projectPath);
  return {
    ...graphBundle,
    artifactFacts: readActiveArtifactFacts(
      database,
      readSchemaVersion(database),
      graphBundle.status.generationId
    )
  };
}

export interface SqliteGraphStoreOptions {
  /**
   * Keeps one read-only connection open for this one project. Every read still
   * begins and commits its own SQLite snapshot, so a later request observes a
   * writer's committed active-generation switch.
   */
  readonly persistentReadProjectPath?: string | undefined;
  /** Refuses every schema or projection write while retaining read capabilities. */
  readonly readOnly?: boolean | undefined;
}

export class SqliteGraphStore implements GraphStore {
  private readonly persistentReadProjectPath: string | null;
  private readonly readOnly: boolean;
  private persistentReadDatabase: DatabaseSync | null = null;

  public constructor(options: SqliteGraphStoreOptions = {}) {
    this.persistentReadProjectPath =
      options.persistentReadProjectPath === undefined
        ? null
        : resolve(options.persistentReadProjectPath);
    this.readOnly = options.readOnly ?? false;
  }

  /** Releases the optional worker-local persistent read connection. */
  public close(): void {
    const database = this.persistentReadDatabase;
    this.persistentReadDatabase = null;
    if (database !== null) {
      database.close();
    }
  }

  /** True only when this store has opened its configured persistent reader. */
  public get persistentReadConnectionOpen(): boolean {
    return this.persistentReadDatabase !== null;
  }

  public isInitialized(projectPath: string): boolean {
    return existsSync(databasePathFor(projectPath));
  }

  public initialize(projectPath: string): void {
    this.assertWritable();
    const databasePath = databasePathFor(projectPath);
    const databaseExisted = existsSync(databasePath);
    mkdirSync(resolve(databasePath, ".."), { recursive: true });
    const database = new DatabaseSync(databasePath);

    try {
      ensureSchema(database, databaseExisted);
      preferWriteAheadLogging(database);
    } finally {
      database.close();
    }
  }

  public getStatus(projectPath: string): IndexStatus {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return uninitializedStatus(normalizedProjectPath);
    }
    return this.withReadDatabase(normalizedProjectPath, (database) =>
      readActiveStatusState(database, normalizedProjectPath).status
    );
  }

  public getSnapshot(projectPath: string): GraphSnapshot {
    return this.getActiveGraphBundle(projectPath).snapshot;
  }

  public getArtifactFacts(projectPath: string): readonly PersistedArtifactFacts[] {
    return this.getActiveGenerationBundle(projectPath).artifactFacts;
  }

  public getIndexInputs(projectPath: string): ProjectIndexInputs | null {
    return this.getActiveGraphBundle(projectPath).indexInputs;
  }

  public getActiveGraphBundle(projectPath: string): ActiveGraphBundle {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return {
        status: uninitializedStatus(normalizedProjectPath),
        snapshot: emptySnapshot(),
        indexInputs: null,
        extractorVersion: null,
        resolverVersion: null,
        sourceSearchVersion: null
      };
    }

    return this.withReadDatabase(normalizedProjectPath, (database) =>
      readActiveGraphBundle(database, normalizedProjectPath)
    );
  }

  public getActiveStatusBundle(projectPath: string): ActiveStatusBundle {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return {
        status: uninitializedStatus(normalizedProjectPath),
        files: [],
        indexInputs: null,
        extractorVersion: null,
        resolverVersion: null,
        sourceSearchVersion: null
      };
    }
    return this.withReadDatabase(normalizedProjectPath, (database) =>
      readActiveStatusBundle(database, normalizedProjectPath)
    );
  }

  public getActiveGenerationBundle(projectPath: string): ActiveGenerationBundle {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return {
        status: uninitializedStatus(normalizedProjectPath),
        snapshot: emptySnapshot(),
        artifactFacts: [],
        indexInputs: null,
        extractorVersion: null,
        resolverVersion: null,
        sourceSearchVersion: null
      };
    }

    return this.withReadDatabase(normalizedProjectPath, (database) =>
      readActiveGenerationBundle(database, normalizedProjectPath)
    );
  }

  public getActiveSourceSearchBundle(
    projectPath: string,
    request: SourceSearchRequest
  ): ActiveSourceSearchBundle {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return {
        ...this.getActiveGraphBundle(normalizedProjectPath),
        hits: []
      };
    }

    return this.withReadDatabase(normalizedProjectPath, (database) => {
      const graphBundle = readActiveGraphBundle(database, normalizedProjectPath);
      return {
        ...graphBundle,
        hits: readActiveSourceSearchHits(
          database,
          graphBundle.status.generationId,
          graphBundle.sourceSearchVersion ?? null,
          request
        )
      };
    });
  }

  public getActiveSourceDocumentsBundle(
    projectPath: string,
    filePaths: readonly string[]
  ): ActiveSourceDocumentsBundle {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return {
        ...this.getActiveGraphBundle(normalizedProjectPath),
        documents: []
      };
    }

    return this.withReadDatabase(normalizedProjectPath, (database) => {
      const graphBundle = readActiveGraphBundle(database, normalizedProjectPath);
      return {
        ...graphBundle,
        documents: readActiveSourceDocuments(
          database,
          graphBundle.status.generationId,
          graphBundle.sourceSearchVersion ?? null,
          filePaths
        )
      };
    });
  }

  public getActiveSourceDocuments(
    projectPath: string,
    expectedGenerationId: string,
    filePaths: readonly string[]
  ): ActiveSourceDocumentsProjection {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return {
        status: uninitializedStatus(normalizedProjectPath),
        sourceSearchVersion: null,
        generationMatched: false,
        documents: []
      };
    }

    return this.withReadDatabase(normalizedProjectPath, (database) => {
      const active = readActiveStatusState(database, normalizedProjectPath);
      const sourceSearchVersion = readActiveSourceSearchVersion(
        database,
        active.generationId
      );
      const generationMatched = active.generationId === expectedGenerationId;
      return {
        status: active.status,
        sourceSearchVersion,
        generationMatched,
        documents: generationMatched
          ? readActiveSourceDocuments(
              database,
              active.generationId,
              sourceSearchVersion,
              filePaths
            )
          : []
      };
    });
  }

  public getActiveUnresolvedCalls(
    projectPath: string,
    expectedGenerationId: string,
    sourceIds: readonly string[],
    limitPerSymbol: number
  ): ActiveUnresolvedCallsProjection {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) return { generationMatched: false, calls: [] };
    const ids = [...new Set(sourceIds)];
    if (ids.length > 64 || !Number.isInteger(limitPerSymbol) || limitPerSymbol < 0 || limitPerSymbol > 64) {
      throw new RangeError("Unresolved-call projection allows at most 64 symbols and 0–64 calls per symbol.");
    }
    return this.withReadDatabase(normalizedProjectPath, (database) => {
      // This projection needs only generation identity, not table counts or
      // the previous indexing work log. Keep the guard inside this snapshot.
      if (getActiveGenerationId(database) !== expectedGenerationId) return { generationMatched: false, calls: [] };
      const statement = database.prepare(`SELECT e.*, ee.evidence_json FROM edges AS e
        LEFT JOIN edge_evidence AS ee ON ee.generation_id = ? AND ee.edge_id = e.id
        WHERE e.source_id = ? AND e.kind = 'calls' AND e.resolution = 'unresolved' AND e.target_id IS NULL
        ORDER BY e.file_path, e.start_line, e.start_column, e.id LIMIT ?`);
      return {
        generationMatched: true,
        calls: ids.map((sourceId) => {
          const rows = statement.all(expectedGenerationId, sourceId, limitPerSymbol + 1) as unknown as EdgeRow[];
          return { sourceId, items: rows.slice(0, limitPerSymbol).map(toGraphEdge), truncated: rows.length > limitPerSymbol };
        })
      };
    });
  }

  public getActiveBoundedGraphBundle(
    projectPath: string,
    request: BoundedGraphQueryRequest
  ): ActiveBoundedGraphBundle {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      const status = uninitializedStatus(normalizedProjectPath);
      return {
        status,
        snapshot: emptySnapshot(),
        indexInputs: null,
        extractorVersion: null,
        resolverVersion: null,
        sourceSearchVersion: null,
        diagnostics: {
          generationMatched: request.expectedGenerationId === undefined,
          seedFiles: 0,
          seedSymbols: 0,
          returnedNodes: 0,
          returnedRelationships: 0,
          traversedHops: 0,
          truncated: false,
          sourceSearchAvailable: false,
          usedSourceSearch: false,
          fallbackRequired: false
        },
        fallbackRequired: false
      };
    }

    return this.withReadDatabase(normalizedProjectPath, (database) =>
      readActiveBoundedGraphBundle(database, normalizedProjectPath, request)
    );
  }

  public getActiveFileSummaryPage(
    projectPath: string,
    request: ActiveFileSummaryRequest
  ): ActiveFileSummaryPage {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return {
        status: uninitializedStatus(normalizedProjectPath),
        files: [],
        indexInputs: null,
        extractorVersion: null,
        resolverVersion: null,
        sourceSearchVersion: null,
        generationMatched: request.expectedGenerationId === undefined,
        cursorMatched: request.afterFilePath === undefined,
        matchedFileCount: 0,
        remainingFileCount: 0,
        rows: []
      };
    }
    return this.withReadDatabase(normalizedProjectPath, (database) =>
      readActiveFileSummaryPage(database, normalizedProjectPath, request)
    );
  }

  public getGenerationHistoryBundle(projectPath: string): GenerationHistoryBundle | null {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return null;
    }

    return this.withReadDatabase(normalizedProjectPath, (database) =>
      readGenerationHistoryBundle(database, normalizedProjectPath)
    );
  }

  public getGenerationSnapshotBundle(
    projectPath: string,
    generationId: string
  ): GenerationSnapshotBundle | null {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return null;
    }

    return this.withReadDatabase(normalizedProjectPath, (database) =>
      readGenerationSnapshotBundle(database, normalizedProjectPath, generationId)
    );
  }

  public getGenerationComparisonBundle(
    projectPath: string,
    fromGenerationId: string,
    toGenerationId?: string
  ): GenerationComparisonBundle | null {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return null;
    }

    return this.withReadDatabase(normalizedProjectPath, (database) =>
      readGenerationComparisonBundle(
        database,
        normalizedProjectPath,
        fromGenerationId,
        toGenerationId
      )
    );
  }

  public replaceProjectFacts(input: ReplaceProjectFactsInput): void {
    this.assertWritable();
    const normalizedProjectPath = resolve(input.projectPath);
    this.initialize(normalizedProjectPath);
    const database = new DatabaseSync(databasePathFor(normalizedProjectPath));

    try {
      database.exec("PRAGMA foreign_keys = ON;");
      database.exec("BEGIN IMMEDIATE");
      try {
        const generationId = `generation:${randomUUID()}`;

        database
          .prepare(
            `INSERT INTO generations(id, indexed_at, extractor_version, resolver_version)
             VALUES (?, ?, ?, ?)`
          )
          .run(
            generationId,
            input.indexedAt,
            extractorVersionFor(input.artifactFacts),
            input.resolverVersion
          );

        insertGenerationSnapshot(database, generationId, input.snapshot);

        insertIndexInputs(database, generationId, input.indexInputs);
        if (input.indexWork !== undefined) {
          insertIndexWork(database, generationId, input.indexWork);
        }
        const writesSourceSearch =
          input.sourceSearchVersion !== undefined && input.sourceDocuments !== undefined;
        if (writesSourceSearch) {
          insertSourceSearchVersion(database, generationId, input.sourceSearchVersion);
        }

        const artifactFactsInsert = database.prepare(INSERT_ARTIFACT_FACTS_SQL);
        for (const facts of input.artifactFacts) {
          insertArtifactFacts(artifactFactsInsert, generationId, facts);
        }

        if (writesSourceSearch) {
          const sourceDocumentInsert = database.prepare(INSERT_SOURCE_DOCUMENT_SQL);
          const sourceSearchInsert = database.prepare(INSERT_SOURCE_SEARCH_SQL);
          for (const document of input.sourceDocuments) {
            insertSourceDocument(
              sourceDocumentInsert,
              sourceSearchInsert,
              generationId,
              document
            );
          }
        }

        const edgeEvidenceInsert = database.prepare(INSERT_EDGE_EVIDENCE_SQL);
        for (const edge of input.snapshot.edges) {
          insertEdgeEvidence(edgeEvidenceInsert, generationId, edge);
        }

        database.exec("DELETE FROM edges");
        database.exec("DELETE FROM pending_refs");
        database.exec("DELETE FROM symbols");
        database.exec("DELETE FROM files");

        const fileInsert = database.prepare(INSERT_FILE_SQL);
        for (const file of input.snapshot.files) {
          insertFile(fileInsert, file);
        }
        const symbolInsert = database.prepare(INSERT_SYMBOL_SQL);
        for (const symbol of input.snapshot.symbols) {
          insertSymbol(symbolInsert, symbol);
        }
        const edgeInsert = database.prepare(INSERT_EDGE_SQL);
        for (const edge of input.snapshot.edges) {
          insertEdge(edgeInsert, edge);
        }
        const pendingReferenceInsert = database.prepare(INSERT_PENDING_REFERENCE_SQL);
        for (const reference of input.snapshot.pendingReferences) {
          insertPendingReference(pendingReferenceInsert, reference);
        }

        setMeta(database, INDEXED_AT_META_KEY, input.indexedAt);

        // Keep a bounded deterministic history. The virtual FTS rows are
        // removed before their generation because they cannot use a foreign
        // key; all ordinary generation side tables cascade from the parent.
        pruneRetainedGenerations(database, generationId);

        // The active pointer is the last write before commit. Readers therefore
        // observe either the previous complete generation or this complete one.
        setMeta(database, ACTIVE_GENERATION_ID_META_KEY, generationId);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.close();
    }
  }

  private withReadDatabase<T>(
    normalizedProjectPath: string,
    read: (database: DatabaseSync) => T
  ): T {
    const isPersistent = normalizedProjectPath === this.persistentReadProjectPath;
    const database = isPersistent
      ? this.openPersistentReadDatabase(normalizedProjectPath)
      : configureReadDatabase(
          new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true })
        );
    try {
      return readConsistently(database, () => read(database));
    } finally {
      if (!isPersistent) {
        database.close();
      }
    }
  }

  private openPersistentReadDatabase(normalizedProjectPath: string): DatabaseSync {
    if (this.persistentReadDatabase === null) {
      const database = configureReadDatabase(
        new DatabaseSync(databasePathFor(normalizedProjectPath), {
          readOnly: true
        })
      );
      // Reuse hot graph/index pages with a 16 MiB worker-local cache target.
      // One-shot readers retain SQLite's default cache allocation.
      try {
        database.exec(`PRAGMA cache_size = -${PERSISTENT_READ_CACHE_KIB}`);
      } catch (error) {
        database.close();
        throw error;
      }
      this.persistentReadDatabase = database;
    }
    return this.persistentReadDatabase;
  }

  private assertWritable(): void {
    if (this.readOnly) {
      throw new Error("This SqliteGraphStore is configured read-only.");
    }
  }
}
