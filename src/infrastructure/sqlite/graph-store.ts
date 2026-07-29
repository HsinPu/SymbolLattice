import { existsSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";

import type {
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
const SCHEMA_VERSION_META_KEY = "schema_version";
const SCHEMA_VERSION = "1";

const SCHEMA = `
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

export class SqliteGraphStore implements GraphStore {
  public isInitialized(projectPath: string): boolean {
    return existsSync(databasePathFor(projectPath));
  }

  public initialize(projectPath: string): void {
    const databasePath = databasePathFor(projectPath);
    mkdirSync(resolve(databasePath, ".."), { recursive: true });
    const database = new DatabaseSync(databasePath);

    try {
      database.exec(SCHEMA);
      setMeta(database, SCHEMA_VERSION_META_KEY, SCHEMA_VERSION);
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
        projectPath: normalizedProjectPath,
        indexedAt: null,
        counts: defaultCounts()
      };
    }

    const database = new DatabaseSync(databasePathFor(normalizedProjectPath), { readOnly: true });
    try {
      return {
        initialized: true,
        stale: false,
        projectPath: normalizedProjectPath,
        indexedAt: getMeta(database, INDEXED_AT_META_KEY),
        counts: readCounts(database)
      };
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
      const edges = database
        .prepare(
          `SELECT id, source_id, target_id, kind, file_path,
            start_line, start_column, end_line, end_column,
            resolution, confidence, reference_name
           FROM edges
           ORDER BY file_path, start_line, start_column, kind, id`
        )
        .all() as unknown as EdgeRow[];
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
        edges: edges.map((edge) => ({
          id: edge.id,
          sourceId: edge.source_id,
          targetId: edge.target_id,
          kind: edge.kind,
          filePath: edge.file_path,
          range: toRange(edge),
          resolution: edge.resolution,
          confidence: edge.confidence,
          referenceName: edge.reference_name
        })),
        pendingReferences: pendingReferences.map((reference) => ({
          id: reference.id,
          sourceId: reference.source_id,
          filePath: reference.file_path,
          referenceName: reference.reference_name,
          relationKind: reference.relation_kind,
          range: toRange(reference)
        }))
      };
    } finally {
      database.close();
    }
  }

  public replaceProjectFacts(input: ReplaceProjectFactsInput): void {
    const normalizedProjectPath = resolve(input.projectPath);
    this.initialize(normalizedProjectPath);
    const database = new DatabaseSync(databasePathFor(normalizedProjectPath));

    try {
      database.exec("BEGIN IMMEDIATE");
      try {
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
