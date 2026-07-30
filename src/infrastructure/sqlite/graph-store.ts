import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
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
  ActiveGenerationBundle,
  ActiveSourceDocumentsBundle,
  ActiveSourceSearchBundle,
  GenerationComparisonBundle,
  GenerationHistoryBundle,
  GenerationHistoryEntry,
  GenerationSnapshotBundle,
  GraphStore,
  ReplaceProjectFactsInput
} from "../../ports/graph-store.js";

const INDEX_DIRECTORY_NAME = ".symbol-lattice";
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
const GENERATION_SNAPSHOT_VERSION = 1;
const MAX_RETAINED_GENERATIONS = 5;

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
    indexed_at TEXT NOT NULL
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
    end_column INTEGER NOT NULL
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
    cleanOrphanedSourceSearchRows(database);
    backfillActiveGenerationSnapshot(database);
    pruneRetainedGenerations(database, getActiveGenerationId(database));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
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
    ...(facts.nestRouteFacts === undefined ? {} : { nestRouteFacts: facts.nestRouteFacts }),
    ...(facts.fastifyPluginFacts === undefined
      ? {}
      : { fastifyPluginFacts: facts.fastifyPluginFacts }),
    ...(facts.fastApiRouterFacts === undefined
      ? {}
      : { fastApiRouterFacts: facts.fastApiRouterFacts }),
    ...(facts.scalaFacts === undefined ? {} : { scalaFacts: facts.scalaFacts }),
    ...(facts.javaFacts === undefined ? {} : { javaFacts: facts.javaFacts }),
    ...(facts.liquidFacts === undefined ? {} : { liquidFacts: facts.liquidFacts }),
    ...(facts.solidityFacts === undefined ? {} : { solidityFacts: facts.solidityFacts }),
    ...(facts.twigFacts === undefined ? {} : { twigFacts: facts.twigFacts })
  };
}

function insertFile(database: DatabaseSync, file: IndexedFile): void {
  database
    .prepare(
      "INSERT INTO files(path, content_hash, language, indexed_at) VALUES (?, ?, ?, ?)"
    )
    .run(file.path, file.contentHash, file.language, file.indexedAt);
}

function insertSymbol(database: DatabaseSync, symbol: SymbolNode): void {
  database
    .prepare(
      `INSERT INTO symbols(
        id, name, qualified_name, kind, file_path,
        start_line, start_column, end_line, end_column,
        is_exported, declaration_ordinal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
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

function insertEdge(database: DatabaseSync, edge: GraphEdge): void {
  database
    .prepare(
      `INSERT INTO edges(
        id, source_id, target_id, kind, file_path,
        start_line, start_column, end_line, end_column,
        resolution, confidence, reference_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
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

function insertPendingReference(database: DatabaseSync, reference: PendingReference): void {
  database
    .prepare(
      `INSERT INTO pending_refs(
        id, source_id, file_path, reference_name, relation_kind,
        start_line, start_column, end_line, end_column
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      reference.id,
      reference.sourceId,
      reference.filePath,
      reference.referenceName,
      reference.relationKind,
      reference.range.start.line,
      reference.range.start.column,
      reference.range.end.line,
      reference.range.end.column
    );
}

function insertArtifactFacts(
  database: DatabaseSync,
  generationId: string,
  facts: PersistedArtifactFacts
): void {
  database
    .prepare(
      `INSERT INTO artifact_facts(
        generation_id, file_path, content_hash, language, extractor_version, facts_json
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      generationId,
      facts.filePath,
      facts.contentHash,
      facts.language,
      facts.extractorVersion,
      JSON.stringify(artifactFactsPayload(facts))
    );
}

function insertEdgeEvidence(database: DatabaseSync, generationId: string, edge: GraphEdge): void {
  if (edge.evidence === undefined) {
    return;
  }

  database
    .prepare(
      "INSERT INTO edge_evidence(generation_id, edge_id, evidence_json) VALUES (?, ?, ?)"
    )
    .run(generationId, edge.id, JSON.stringify(edge.evidence));
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
  database: DatabaseSync,
  generationId: string,
  document: IndexedSourceDocument
): void {
  database
    .prepare(
      `INSERT INTO source_documents(generation_id, file_path, language, source_text)
       VALUES (?, ?, ?, ?)`
    )
    .run(generationId, document.filePath, document.language, document.sourceText);
  database
    .prepare(
      `INSERT INTO source_search(generation_id, file_path, language, corpus)
       VALUES (?, ?, ?, ?)`
    )
    .run(
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
    .prepare(
      `INSERT INTO generation_snapshots(generation_id, snapshot_version, snapshot_json)
       VALUES (?, ?, ?)`
    )
    .run(generationId, GENERATION_SNAPSHOT_VERSION, JSON.stringify(snapshot));
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
    const snapshot = parseJson<GraphSnapshot>(
      row.snapshot_json,
      `snapshot for generation ${row.id}`
    );
    return {
      generationId: row.id,
      indexedAt: row.indexed_at,
      snapshotVersion: row.snapshot_version,
      counts: snapshotCounts(snapshot),
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
    snapshot: parseJson<GraphSnapshot>(
      snapshotRow.snapshot_json,
      `snapshot for generation ${generationId}`
    )
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

function readSnapshotProjection(
  database: DatabaseSync,
  activeGenerationId: string | null
): GraphSnapshot {
  const files = database
    .prepare("SELECT path, content_hash, language, indexed_at FROM files ORDER BY path")
    .all() as unknown as FileRow[];
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
  const pendingReferences = database
    .prepare(
      `SELECT id, source_id, file_path, reference_name, relation_kind,
        start_line, start_column, end_line, end_column
       FROM pending_refs
       ORDER BY file_path, start_line, start_column, relation_kind, id`
    )
    .all() as unknown as PendingReferenceRow[];

  return {
    files: files.map((file) => ({
      path: file.path,
      contentHash: file.content_hash,
      language: file.language,
      indexedAt: file.indexed_at
    })),
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
      range: toRange(reference)
    }))
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

function readActiveGraphBundle(
  database: DatabaseSync,
  projectPath: string
): ActiveGraphBundle {
  const schemaVersion = readSchemaVersion(database);
  const generationId =
    supportsGenerationData(schemaVersion) ? getActiveGenerationId(database) : null;
  const generation = readGeneration(database, generationId);
  const indexWork = readActiveIndexWork(database, schemaVersion, generationId);
  const sourceSearchVersion = readActiveSourceSearchVersion(
    database,
    generationId
  );
  const statusWithoutWork: IndexStatus = {
    initialized: true,
    stale: false,
    staleReasons: [],
    projectPath,
    indexedAt: generation?.indexed_at ?? getMeta(database, INDEXED_AT_META_KEY),
    generationId,
    counts: readCounts(database)
  };
  const status: IndexStatus =
    indexWork === null ? statusWithoutWork : { ...statusWithoutWork, lastIndexWork: indexWork };

  return {
    status,
    snapshot: readSnapshotProjection(database, generationId),
    indexInputs: readActiveIndexInputs(database, schemaVersion, generationId),
    extractorVersion: generation?.extractor_version ?? null,
    resolverVersion: generation?.resolver_version ?? null,
    sourceSearchVersion
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

export class SqliteGraphStore implements GraphStore {
  public isInitialized(projectPath: string): boolean {
    return existsSync(databasePathFor(projectPath));
  }

  public initialize(projectPath: string): void {
    const databasePath = databasePathFor(projectPath);
    const databaseExisted = existsSync(databasePath);
    mkdirSync(resolve(databasePath, ".."), { recursive: true });
    const database = new DatabaseSync(databasePath);

    try {
      ensureSchema(database, databaseExisted);
    } finally {
      database.close();
    }
  }

  public getStatus(projectPath: string): IndexStatus {
    return this.getActiveGraphBundle(projectPath).status;
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

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return readConsistently(database, () =>
        readActiveGraphBundle(database, normalizedProjectPath)
      );
    } finally {
      database.close();
    }
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

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return readConsistently(database, () =>
        readActiveGenerationBundle(database, normalizedProjectPath)
      );
    } finally {
      database.close();
    }
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

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return readConsistently(database, () => {
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
    } finally {
      database.close();
    }
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

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return readConsistently(database, () => {
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
    } finally {
      database.close();
    }
  }

  public getGenerationHistoryBundle(projectPath: string): GenerationHistoryBundle | null {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return null;
    }

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return readConsistently(database, () =>
        readGenerationHistoryBundle(database, normalizedProjectPath)
      );
    } finally {
      database.close();
    }
  }

  public getGenerationSnapshotBundle(
    projectPath: string,
    generationId: string
  ): GenerationSnapshotBundle | null {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return null;
    }

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return readConsistently(database, () =>
        readGenerationSnapshotBundle(database, normalizedProjectPath, generationId)
      );
    } finally {
      database.close();
    }
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

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return readConsistently(database, () =>
        readGenerationComparisonBundle(
          database,
          normalizedProjectPath,
          fromGenerationId,
          toGenerationId
        )
      );
    } finally {
      database.close();
    }
  }

  public replaceProjectFacts(input: ReplaceProjectFactsInput): void {
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

        for (const facts of input.artifactFacts) {
          insertArtifactFacts(database, generationId, facts);
        }

        if (writesSourceSearch) {
          for (const document of input.sourceDocuments) {
            insertSourceDocument(database, generationId, document);
          }
        }

        for (const edge of input.snapshot.edges) {
          insertEdgeEvidence(database, generationId, edge);
        }

        database.exec("DELETE FROM edges");
        database.exec("DELETE FROM pending_refs");
        database.exec("DELETE FROM symbols");
        database.exec("DELETE FROM files");

        for (const file of input.snapshot.files) {
          insertFile(database, file);
        }
        for (const symbol of input.snapshot.symbols) {
          insertSymbol(database, symbol);
        }
        for (const edge of input.snapshot.edges) {
          insertEdge(database, edge);
        }
        for (const reference of input.snapshot.pendingReferences) {
          insertPendingReference(database, reference);
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
}
