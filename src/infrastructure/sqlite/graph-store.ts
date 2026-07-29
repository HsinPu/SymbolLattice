import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";

import type {
  ArtifactFacts,
  PersistedArtifactFacts
} from "../../domain/facts.js";
import type { ProjectIndexInputs } from "../../domain/index-inputs.js";
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
import type { GraphStore, ReplaceProjectFactsInput } from "../../ports/graph-store.js";

const INDEX_DIRECTORY_NAME = ".symbol-lattice";
const DATABASE_FILE_NAME = "index.sqlite";
const INDEXED_AT_META_KEY = "indexed_at";
const ACTIVE_GENERATION_ID_META_KEY = "active_generation_id";
const SCHEMA_VERSION_META_KEY = "schema_version";
const SCHEMA_VERSION = "3";
const PREVIOUS_SCHEMA_VERSION = "2";
const LEGACY_SCHEMA_VERSION = "1";
const RESOLVER_VERSION = "typescript-static-v1";

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

type SupportedSchemaVersion =
  | typeof LEGACY_SCHEMA_VERSION
  | typeof PREVIOUS_SCHEMA_VERSION
  | typeof SCHEMA_VERSION;

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
    `SymbolLattice index schema version \"${version}\" is unsupported by this release (supported: ${LEGACY_SCHEMA_VERSION}, ${PREVIOUS_SCHEMA_VERSION}, ${SCHEMA_VERSION}). Rebuild with a compatible SymbolLattice version.`
  );
}

function readSchemaVersion(database: DatabaseSync): SupportedSchemaVersion {
  if (!tableExists(database, "meta")) {
    throw unsupportedSchemaError(null);
  }

  const version = getMeta(database, SCHEMA_VERSION_META_KEY);
  if (
    version === LEGACY_SCHEMA_VERSION ||
    version === PREVIOUS_SCHEMA_VERSION ||
    version === SCHEMA_VERSION
  ) {
    return version;
  }

  throw unsupportedSchemaError(version);
}

function migrateLegacyDatabase(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(GENERATION_SCHEMA);
    database.exec(GENERATION_INDEX_INPUTS_SCHEMA);
    setMeta(database, SCHEMA_VERSION_META_KEY, SCHEMA_VERSION);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function migratePreviousDatabase(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    // Re-run the v2 definitions in case an earlier initialization was
    // interrupted before every additive side table was created.
    database.exec(GENERATION_SCHEMA);
    database.exec(GENERATION_INDEX_INPUTS_SCHEMA);
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
    database.exec(GENERATION_SCHEMA);
    database.exec(GENERATION_INDEX_INPUTS_SCHEMA);
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
  if (schemaVersion === LEGACY_SCHEMA_VERSION) {
    migrateLegacyDatabase(database);
    return;
  }

  if (schemaVersion === PREVIOUS_SCHEMA_VERSION) {
    migratePreviousDatabase(database);
    return;
  }

  // A previous v3 initialization might have been interrupted after the main
  // schema version was stored. The idempotent side tables can be restored
  // without changing graph data or its active generation.
  database.exec(GENERATION_SCHEMA);
  database.exec(GENERATION_INDEX_INPUTS_SCHEMA);
}

function getActiveGenerationId(database: DatabaseSync): string | null {
  return getMeta(database, ACTIVE_GENERATION_ID_META_KEY);
}

function supportsGenerationData(schemaVersion: SupportedSchemaVersion): boolean {
  return schemaVersion !== LEGACY_SCHEMA_VERSION;
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
    exportBindings: facts.exportBindings
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
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return {
        initialized: false,
        stale: false,
        staleReasons: [],
        projectPath: normalizedProjectPath,
        indexedAt: null,
        generationId: null,
        counts: defaultCounts()
      };
    }

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return readConsistently(database, () => {
        const schemaVersion = readSchemaVersion(database);
        const generationId =
          supportsGenerationData(schemaVersion) ? getActiveGenerationId(database) : null;
        return {
          initialized: true,
          stale: false,
          staleReasons: [],
          projectPath: normalizedProjectPath,
          indexedAt: getMeta(database, INDEXED_AT_META_KEY),
          generationId,
          counts: readCounts(database)
        };
      });
    } finally {
      database.close();
    }
  }

  public getSnapshot(projectPath: string): GraphSnapshot {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return { files: [], symbols: [], edges: [], pendingReferences: [] };
    }

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return readConsistently(database, () => {
        const schemaVersion = readSchemaVersion(database);
        const activeGenerationId =
          supportsGenerationData(schemaVersion) ? getActiveGenerationId(database) : null;
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
      });
    } finally {
      database.close();
    }
  }

  public getArtifactFacts(projectPath: string): readonly PersistedArtifactFacts[] {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return [];
    }

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return readConsistently(database, () => {
        const schemaVersion = readSchemaVersion(database);
        if (schemaVersion === LEGACY_SCHEMA_VERSION) {
          return [];
        }

        const activeGenerationId = getActiveGenerationId(database);
        if (activeGenerationId === null) {
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

        return rows.map((row) => ({
          ...parseJson<ArtifactFacts>(row.facts_json, `artifact facts for ${row.file_path}`),
          filePath: row.file_path,
          contentHash: row.content_hash,
          language: row.language,
          extractorVersion: row.extractor_version
        }));
      });
    } finally {
      database.close();
    }
  }

  public getIndexInputs(projectPath: string): ProjectIndexInputs | null {
    const normalizedProjectPath = resolve(projectPath);
    if (!this.isInitialized(normalizedProjectPath)) {
      return null;
    }

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return readConsistently(database, () => {
        const schemaVersion = readSchemaVersion(database);
        // v1 and v2 have no input identity to reconstruct. Returning null is
        // intentional: the application can surface a configuration-untracked
        // status rather than inventing provenance for a legacy generation.
        if (schemaVersion !== SCHEMA_VERSION) {
          return null;
        }

        const activeGenerationId = getActiveGenerationId(database);
        if (activeGenerationId === null) {
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
      });
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
        const previousGenerationId = getActiveGenerationId(database);
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
            RESOLVER_VERSION
          );

        insertIndexInputs(database, generationId, input.indexInputs);

        for (const facts of input.artifactFacts) {
          insertArtifactFacts(database, generationId, facts);
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

        // Keep only the active facts/evidence generation. Every deletion remains
        // inside this transaction, so a failed replacement rolls back to the old
        // graph and its still-active evidence together.
        if (previousGenerationId !== null && previousGenerationId !== generationId) {
          database.prepare("DELETE FROM edge_evidence WHERE generation_id = ?").run(previousGenerationId);
          database.prepare("DELETE FROM artifact_facts WHERE generation_id = ?").run(previousGenerationId);
          database
            .prepare("DELETE FROM generation_index_inputs WHERE generation_id = ?")
            .run(previousGenerationId);
          database.prepare("DELETE FROM generations WHERE id = ?").run(previousGenerationId);
        }

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
