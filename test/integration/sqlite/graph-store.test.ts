import { mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import type {
  GraphSnapshot,
  IndexedSourceDocument,
  IndexWork,
  PersistedArtifactFacts,
  ProjectIndexInputs,
  SymbolNode
} from "../../../src/domain/index.js";
import {
  PROJECT_INDEX_INPUTS_FORMAT_VERSION,
  SOURCE_SEARCH_INDEX_VERSION,
  sourceSearchTerms
} from "../../../src/domain/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];
const INDEX_DIRECTORY_NAME = ".symbol-lattice";
const DATABASE_FILE_NAME = "index.sqlite";

async function temporaryProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-store-"));
  temporaryDirectories.push(projectPath);
  return projectPath;
}

function databasePathFor(projectPath: string): string {
  return join(projectPath, INDEX_DIRECTORY_NAME, DATABASE_FILE_NAME);
}

function symbol(id: string, name: string): SymbolNode {
  return {
    id,
    name,
    qualifiedName: `src/example.ts#${name}`,
    kind: "function",
    filePath: "src/example.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 2, column: 1 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
}

function snapshot(symbols: readonly SymbolNode[]): GraphSnapshot {
  return {
    files: [
      {
        path: "src/example.ts",
        contentHash: "hash-one",
        language: "typescript",
        indexedAt: "2026-07-29T00:00:00.000Z"
      }
    ],
    symbols,
    edges:
      symbols.length > 1
        ? [
            {
              id: "edge:caller-callee",
              sourceId: symbols[0]?.id ?? "missing",
              targetId: symbols[1]?.id ?? "missing",
              kind: "calls",
              filePath: "src/example.ts",
              range: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 4 }
              },
              resolution: "exact",
              confidence: 1,
              referenceName: "callee",
              evidence: {
                ruleId: "test.calls",
                stage: "module",
                candidateSymbolIds: [symbols[1]?.id ?? "missing"]
              }
            }
          ]
        : [],
    pendingReferences: []
  };
}

function persistedFacts(graphSnapshot: GraphSnapshot): readonly PersistedArtifactFacts[] {
  return graphSnapshot.files.map((file) => ({
    filePath: file.path,
    contentHash: file.contentHash,
    language: file.language,
    extractorVersion: "test-extractor-v1",
    symbols: graphSnapshot.symbols.filter((node) => node.filePath === file.path),
    edges: graphSnapshot.edges.filter((edge) => edge.filePath === file.path),
    pendingReferences: graphSnapshot.pendingReferences.filter(
      (reference) => reference.filePath === file.path
    ),
    localBindings: [],
    referenceScopes: [],
    importBindings: [
      {
        moduleSpecifier: "./dependency",
        localName: "callee",
        importedName: "callee",
        range: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 7 }
        }
      }
    ],
    exportBindings: [],
    reExportBindings: [
      {
        kind: "named",
        moduleSpecifier: "./re-exported",
        importedName: "callee",
        exportedName: "callee",
        range: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 7 }
        }
      }
    ]
  }));
}

function sourceDocuments(
  graphSnapshot: GraphSnapshot,
  sourceText = "export const searchableValue = 'needle';"
): readonly IndexedSourceDocument[] {
  return graphSnapshot.files.map((file) => ({
    filePath: file.path,
    language: file.language,
    sourceText
  }));
}

function sourceSearchRequest(
  query: string,
  options: {
    readonly limit?: number;
    readonly language?: IndexedSourceDocument["language"];
    readonly pathPrefix?: string;
  } = {}
) {
  return {
    query,
    terms: sourceSearchTerms(query),
    limit: options.limit ?? 20,
    ...(options.language === undefined ? {} : { language: options.language }),
    ...(options.pathPrefix === undefined ? {} : { pathPrefix: options.pathPrefix })
  };
}

function indexWork(mode: IndexWork["mode"], marker: string): IndexWork {
  return {
    mode,
    resolutionScope: "project",
    addedFiles: mode === "full" ? ["src/example.ts"] : [],
    modifiedFiles: mode === "incremental" ? ["src/example.ts"] : [],
    removedFiles: [],
    reExtractedFiles: ["src/example.ts"],
    reusedArtifactFiles: [],
    dependencyInvalidatedFiles: [`src/${marker}.ts`],
    reuseInvalidationReasons: []
  };
}

function indexInputs(fingerprint: string): ProjectIndexInputs {
  return {
    formatVersion: PROJECT_INDEX_INPUTS_FORMAT_VERSION,
    scopeRoots: ["."],
    configurationInputs: [
      {
        kind: "root-gitignore",
        path: ".gitignore",
        state: "absent",
        contentHash: null
      },
      {
        kind: "tsconfig",
        path: "tsconfig.json",
        state: "present",
        contentHash: `config-${fingerprint}`
      }
    ],
    fingerprint
  };
}

function readSchemaVersion(projectPath: string): string {
  const database = new DatabaseSync(databasePathFor(projectPath), { readOnly: true });
  try {
    const row = database
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get("schema_version") as { readonly value: string } | undefined;
    return row?.value ?? "";
  } finally {
    database.close();
  }
}

function setSchemaVersion(projectPath: string, schemaVersion: string): void {
  const database = new DatabaseSync(databasePathFor(projectPath));
  try {
    database.prepare("UPDATE meta SET value = ? WHERE key = ?").run(schemaVersion, "schema_version");
  } finally {
    database.close();
  }
}

function readTableCount(projectPath: string, tableName: string): number {
  const database = new DatabaseSync(databasePathFor(projectPath), { readOnly: true });
  try {
    const row = database
      .prepare(`SELECT COUNT(*) AS count FROM ${tableName}`)
      .get() as { readonly count: number };
    return row.count;
  } finally {
    database.close();
  }
}

function dropSourceSearchProjection(database: DatabaseSync): void {
  database.exec("DROP TABLE source_search;");
  database.exec("DROP TABLE source_documents;");
  database.exec("DROP TABLE generation_source_search;");
}

function downgradeCurrentIndexToV2(projectPath: string): void {
  const database = new DatabaseSync(databasePathFor(projectPath));
  try {
    database.exec("PRAGMA foreign_keys = OFF;");
    dropSourceSearchProjection(database);
    database.exec("DROP TABLE generation_index_work;");
    database.exec("DROP TABLE generation_index_inputs;");
    database.prepare("UPDATE meta SET value = ? WHERE key = ?").run("2", "schema_version");
  } finally {
    database.close();
  }
}

function downgradeCurrentIndexToV3(
  projectPath: string,
  options: { readonly omitReExportBindings?: boolean } = {}
): void {
  const database = new DatabaseSync(databasePathFor(projectPath));
  try {
    database.exec("PRAGMA foreign_keys = OFF;");
    dropSourceSearchProjection(database);
    if (options.omitReExportBindings === true) {
      const rows = database
        .prepare("SELECT generation_id, file_path, facts_json FROM artifact_facts")
        .all() as readonly {
        readonly generation_id: string;
        readonly file_path: string;
        readonly facts_json: string;
      }[];
      const update = database.prepare(
        `UPDATE artifact_facts
         SET facts_json = ?
         WHERE generation_id = ? AND file_path = ?`
      );
      for (const row of rows) {
        const facts = JSON.parse(row.facts_json) as Record<string, unknown>;
        delete facts.reExportBindings;
        update.run(JSON.stringify(facts), row.generation_id, row.file_path);
      }
    }
    database.exec("DROP TABLE generation_index_work;");
    database.prepare("UPDATE meta SET value = ? WHERE key = ?").run("3", "schema_version");
  } finally {
    database.close();
  }
}

function downgradeCurrentIndexToV4(projectPath: string): void {
  const database = new DatabaseSync(databasePathFor(projectPath));
  try {
    database.exec("PRAGMA foreign_keys = OFF;");
    dropSourceSearchProjection(database);
    database.prepare("UPDATE meta SET value = ? WHERE key = ?").run("4", "schema_version");
  } finally {
    database.close();
  }
}

function replaceActiveGenerationWithV03Writer(projectPath: string): void {
  const database = new DatabaseSync(databasePathFor(projectPath));
  try {
    const schemaVersion = database
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get("schema_version") as { readonly value: string } | undefined;
    if (schemaVersion === undefined || !["1", "2", "3", "4"].includes(schemaVersion.value)) {
      throw new Error(`v0.3 cannot read schema version ${schemaVersion?.value ?? "missing"}`);
    }

    database.exec("PRAGMA foreign_keys = ON;");
    database.exec("BEGIN IMMEDIATE");
    try {
      const previousGeneration = database
        .prepare("SELECT value FROM meta WHERE key = ?")
        .get("active_generation_id") as { readonly value: string } | undefined;
      const generationId = "generation:v03-reindex";

      database
        .prepare(
          `INSERT INTO generations(id, indexed_at, extractor_version, resolver_version)
           VALUES (?, ?, ?, ?)`
        )
        .run(generationId, "2026-07-29T06:00:00.000Z", "v03-extractor", "v03-resolver");

      // This is the v0.3 generation replacement cleanup. It knows only the
      // v2-v4 side tables; deleting generations cascades ordinary v0.4 source
      // rows but cannot cascade an FTS5 virtual-table row.
      if (previousGeneration !== undefined) {
        database.prepare("DELETE FROM edge_evidence WHERE generation_id = ?").run(previousGeneration.value);
        database.prepare("DELETE FROM artifact_facts WHERE generation_id = ?").run(previousGeneration.value);
        database
          .prepare("DELETE FROM generation_index_inputs WHERE generation_id = ?")
          .run(previousGeneration.value);
        database
          .prepare("DELETE FROM generation_index_work WHERE generation_id = ?")
          .run(previousGeneration.value);
        database.prepare("DELETE FROM generations WHERE id = ?").run(previousGeneration.value);
      }

      database
        .prepare("UPDATE meta SET value = ? WHERE key = ?")
        .run("2026-07-29T06:00:00.000Z", "indexed_at");
      database
        .prepare("UPDATE meta SET value = ? WHERE key = ?")
        .run(generationId, "active_generation_id");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

function createLegacyV1Index(projectPath: string, graphSnapshot: GraphSnapshot): void {
  mkdirSync(join(projectPath, INDEX_DIRECTORY_NAME), { recursive: true });
  const database = new DatabaseSync(databasePathFor(projectPath));

  try {
    database.exec(`
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;

      CREATE TABLE files (
        path TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        language TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE symbols (
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

      CREATE TABLE edges (
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

      CREATE TABLE pending_refs (
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
    `);
    database
      .prepare("INSERT INTO meta(key, value) VALUES (?, ?)")
      .run("schema_version", "1");
    database
      .prepare("INSERT INTO meta(key, value) VALUES (?, ?)")
      .run("indexed_at", "2026-07-29T00:00:00.000Z");

    for (const file of graphSnapshot.files) {
      database
        .prepare("INSERT INTO files(path, content_hash, language, indexed_at) VALUES (?, ?, ?, ?)")
        .run(file.path, file.contentHash, file.language, file.indexedAt);
    }
    for (const node of graphSnapshot.symbols) {
      database
        .prepare(
          `INSERT INTO symbols(
            id, name, qualified_name, kind, file_path,
            start_line, start_column, end_line, end_column,
            is_exported, declaration_ordinal
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          node.id,
          node.name,
          node.qualifiedName,
          node.kind,
          node.filePath,
          node.range.start.line,
          node.range.start.column,
          node.range.end.line,
          node.range.end.column,
          Number(node.isExported),
          node.declarationOrdinal
        );
    }
    for (const edge of graphSnapshot.edges) {
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
  } finally {
    database.close();
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directoryPath) =>
      rm(directoryPath, { recursive: true, force: true })
    )
  );
});

describe("SqliteGraphStore", () => {
  it("keeps an uninitialized project read-only until initialization", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();

    expect(store.getStatus(projectPath)).toMatchObject({
      initialized: false,
      generationId: null,
      staleReasons: [],
      counts: { files: 0 }
    });
    expect(store.getSnapshot(projectPath)).toEqual({
      files: [],
      symbols: [],
      edges: [],
      pendingReferences: []
    });
    expect(store.getArtifactFacts(projectPath)).toEqual([]);
    expect(store.getIndexInputs(projectPath)).toBeNull();
    expect(store.getActiveGenerationBundle(projectPath)).toEqual({
      status: store.getStatus(projectPath),
      snapshot: store.getSnapshot(projectPath),
      artifactFacts: [],
      indexInputs: null,
      extractorVersion: null,
      resolverVersion: null,
      sourceSearchVersion: null
    });
    expect(store.getActiveGraphBundle(projectPath)).toEqual({
      status: store.getStatus(projectPath),
      snapshot: store.getSnapshot(projectPath),
      indexInputs: null,
      extractorVersion: null,
      resolverVersion: null,
      sourceSearchVersion: null
    });
    expect(store.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("needle"))).toMatchObject({
      sourceSearchVersion: null,
      hits: []
    });
  });

  it("persists active-generation artifact facts and edge evidence, then clears stale facts", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const firstSnapshot = snapshot([symbol("caller", "caller"), symbol("callee", "callee")]);
    const firstFacts = persistedFacts(firstSnapshot);
    const firstInputs = indexInputs("first");
    const firstWork = indexWork("full", "first");

    store.replaceProjectFacts({
      projectPath,
      snapshot: firstSnapshot,
      indexedAt: "2026-07-29T01:00:00.000Z",
      artifactFacts: firstFacts,
      indexInputs: firstInputs,
      resolverVersion: "test-resolver-v2",
      sourceDocuments: sourceDocuments(firstSnapshot),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork: firstWork
    });

    expect(store.getStatus(projectPath)).toMatchObject({
      initialized: true,
      indexedAt: "2026-07-29T01:00:00.000Z",
      generationId: expect.any(String),
      staleReasons: [],
      lastIndexWork: firstWork,
      counts: { files: 1, symbols: 2, edges: 1, pendingReferences: 0 }
    });
    expect(store.getSnapshot(projectPath).edges[0]).toMatchObject({
      sourceId: "caller",
      targetId: "callee",
      evidence: {
        ruleId: "test.calls",
        stage: "module",
        candidateSymbolIds: ["callee"]
      }
    });
    expect(store.getArtifactFacts(projectPath)).toEqual(firstFacts);
    expect(store.getIndexInputs(projectPath)).toEqual(firstInputs);
    const firstBundle = store.getActiveGenerationBundle(projectPath);
    expect(firstBundle).toMatchObject({
      status: {
        lastIndexWork: firstWork
      },
      artifactFacts: firstFacts,
      indexInputs: firstInputs,
      extractorVersion: "test-extractor-v1",
      resolverVersion: "test-resolver-v2",
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    });
    expect(firstBundle.snapshot).toEqual(store.getSnapshot(projectPath));
    expect(store.getActiveGraphBundle(projectPath)).toEqual({
      status: firstBundle.status,
      snapshot: firstBundle.snapshot,
      indexInputs: firstInputs,
      extractorVersion: "test-extractor-v1",
      resolverVersion: "test-resolver-v2",
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    });
    expect(store.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("needle"))).toMatchObject({
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      hits: [
        {
          filePath: "src/example.ts",
          language: "typescript",
          sourceText: "export const searchableValue = 'needle';"
        }
      ]
    });
    const firstGenerationId = store.getStatus(projectPath).generationId;

    const secondSnapshot = snapshot([symbol("only", "only")]);
    const secondFacts = persistedFacts(secondSnapshot);
    const secondInputs = indexInputs("second");
    const secondWork = indexWork("incremental", "second");
    const invalidSecondSnapshot: GraphSnapshot = {
      ...secondSnapshot,
      symbols: [...secondSnapshot.symbols, ...secondSnapshot.symbols]
    };

    expect(() =>
      store.replaceProjectFacts({
        projectPath,
        snapshot: invalidSecondSnapshot,
        indexedAt: "2026-07-29T01:30:00.000Z",
        artifactFacts: secondFacts,
        indexInputs: secondInputs,
        resolverVersion: "test-resolver-v3",
        sourceDocuments: sourceDocuments(secondSnapshot, "export const replacement = 'other';"),
        sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
        indexWork: secondWork
      })
    ).toThrow();
    expect(store.getStatus(projectPath).generationId).toBe(firstGenerationId);
    expect(store.getSnapshot(projectPath).edges[0]).toMatchObject({ targetId: "callee" });
    expect(store.getArtifactFacts(projectPath)).toEqual(firstFacts);
    expect(store.getIndexInputs(projectPath)).toEqual(firstInputs);
    expect(store.getActiveGenerationBundle(projectPath)).toMatchObject({
      status: { lastIndexWork: firstWork },
      artifactFacts: firstFacts,
      indexInputs: firstInputs,
      resolverVersion: "test-resolver-v2",
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    });
    expect(store.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("needle")).hits).toHaveLength(
      1
    );

    store.replaceProjectFacts({
      projectPath,
      snapshot: secondSnapshot,
      indexedAt: "2026-07-29T02:00:00.000Z",
      artifactFacts: secondFacts,
      indexInputs: secondInputs,
      resolverVersion: "test-resolver-v3",
      sourceDocuments: sourceDocuments(secondSnapshot, "export const replacement = 'other';"),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork: secondWork
    });

    expect(store.getSnapshot(projectPath)).toMatchObject({
      symbols: [{ id: "only" }],
      edges: []
    });
    expect(store.getArtifactFacts(projectPath)).toEqual(secondFacts);
    expect(store.getIndexInputs(projectPath)).toEqual(secondInputs);
    expect(store.getActiveGenerationBundle(projectPath)).toMatchObject({
      status: { lastIndexWork: secondWork },
      artifactFacts: secondFacts,
      indexInputs: secondInputs,
      extractorVersion: "test-extractor-v1",
      resolverVersion: "test-resolver-v3",
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    });
    expect(store.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("needle")).hits).toEqual([]);
    expect(store.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("replacement"))).toMatchObject({
      hits: [
        {
          filePath: "src/example.ts",
          sourceText: "export const replacement = 'other';"
        }
      ]
    });
    expect(store.getStatus(projectPath).counts).toEqual({
      files: 1,
      symbols: 1,
      edges: 0,
      pendingReferences: 0
    });
    expect(readTableCount(projectPath, "generations")).toBe(1);
    expect(readTableCount(projectPath, "artifact_facts")).toBe(1);
    expect(readTableCount(projectPath, "edge_evidence")).toBe(0);
    expect(readTableCount(projectPath, "generation_index_inputs")).toBe(1);
    expect(readTableCount(projectPath, "generation_index_work")).toBe(1);
    expect(readTableCount(projectPath, "generation_source_search")).toBe(1);
    expect(readTableCount(projectPath, "source_documents")).toBe(1);
    expect(readTableCount(projectPath, "source_search")).toBe(1);
  });

  it("returns bounded active-generation FTS hits with language and path filters in stable order", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const documents: readonly IndexedSourceDocument[] = [
      { filePath: "src/a.ts", language: "typescript", sourceText: "needle" },
      { filePath: "src/z.ts", language: "typescript", sourceText: "needle" },
      { filePath: "src/worker.js", language: "javascript", sourceText: "needle" },
      { filePath: "src-other/outside.ts", language: "typescript", sourceText: "needle" },
      { filePath: "tests/needle.ts", language: "typescript", sourceText: "needle" }
    ];
    const graphSnapshot: GraphSnapshot = {
      files: documents.map((document, index) => ({
        path: document.filePath,
        contentHash: `hash-${index}`,
        language: document.language,
        indexedAt: "2026-07-29T02:30:00.000Z"
      })),
      symbols: [],
      edges: [],
      pendingReferences: []
    };

    store.replaceProjectFacts({
      projectPath,
      snapshot: graphSnapshot,
      indexedAt: "2026-07-29T02:30:00.000Z",
      artifactFacts: persistedFacts(graphSnapshot),
      indexInputs: indexInputs("source-filtering"),
      resolverVersion: "test-resolver-v4",
      sourceDocuments: documents,
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork: indexWork("full", "source-filtering")
    });

    const typescriptUnderSource = store.getActiveSourceSearchBundle(
      projectPath,
      sourceSearchRequest("needle", { language: "typescript", pathPrefix: "src", limit: 20 })
    );
    expect(typescriptUnderSource.hits.map((hit) => hit.filePath)).toEqual(["src/a.ts", "src/z.ts"]);
    expect(typescriptUnderSource.hits.map((hit) => hit.sourceText)).toEqual(["needle", "needle"]);
    expect(
      store
        .getActiveSourceSearchBundle(
          projectPath,
          sourceSearchRequest("needle", { language: "javascript", pathPrefix: "src/" })
        )
        .hits.map((hit) => hit.filePath)
    ).toEqual(["src/worker.js"]);
    expect(
      store
        .getActiveSourceSearchBundle(
          projectPath,
          sourceSearchRequest("needle", { language: "typescript", pathPrefix: "src", limit: 1 })
        )
        .hits.map((hit) => hit.filePath)
    ).toEqual(["src/a.ts"]);
  });

  it("keeps source retrieval unavailable for a v0.3-shaped replacement", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const graphSnapshot = snapshot([symbol("legacy-writer", "legacyWriter")]);

    store.replaceProjectFacts({
      projectPath,
      snapshot: graphSnapshot,
      indexedAt: "2026-07-29T05:00:00.000Z",
      artifactFacts: persistedFacts(graphSnapshot),
      indexInputs: indexInputs("v03-shaped-write"),
      resolverVersion: "test-resolver-v03",
      indexWork: indexWork("full", "v03-shaped-write")
    });

    expect(store.getActiveGraphBundle(projectPath).sourceSearchVersion).toBeNull();
    expect(store.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("needle")).hits).toEqual([]);
    expect(readTableCount(projectPath, "generation_source_search")).toBe(0);
    expect(readTableCount(projectPath, "source_documents")).toBe(0);
    expect(readTableCount(projectPath, "source_search")).toBe(0);
  });

  it("normalizes the pre-release v5 source-search marker to rollback-compatible v4", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const graphSnapshot = snapshot([symbol("pre-release-source", "source")]);

    store.replaceProjectFacts({
      projectPath,
      snapshot: graphSnapshot,
      indexedAt: "2026-07-29T05:15:00.000Z",
      artifactFacts: persistedFacts(graphSnapshot),
      indexInputs: indexInputs("pre-release-v5"),
      resolverVersion: "test-resolver-v04",
      sourceDocuments: sourceDocuments(graphSnapshot, "export const preReleaseNeedle = true;"),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork: indexWork("full", "pre-release-v5")
    });
    setSchemaVersion(projectPath, "5");

    expect(
      store
        .getActiveSourceSearchBundle(projectPath, sourceSearchRequest("preReleaseNeedle"))
        .hits.map((hit) => hit.filePath)
    ).toEqual(["src/example.ts"]);

    store.initialize(projectPath);

    expect(readSchemaVersion(projectPath)).toBe("4");
    expect(
      store
        .getActiveSourceSearchBundle(projectPath, sourceSearchRequest("preReleaseNeedle"))
        .hits.map((hit) => hit.filePath)
    ).toEqual(["src/example.ts"]);
  });

  it("keeps v0.4 source search rollback-compatible with a v0.3 reindex", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const firstSnapshot = snapshot([symbol("v04-source", "source")]);

    store.replaceProjectFacts({
      projectPath,
      snapshot: firstSnapshot,
      indexedAt: "2026-07-29T05:30:00.000Z",
      artifactFacts: persistedFacts(firstSnapshot),
      indexInputs: indexInputs("v04-before-v03-reindex"),
      resolverVersion: "test-resolver-v04",
      sourceDocuments: sourceDocuments(firstSnapshot, "export const oldNeedle = true;"),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork: indexWork("full", "v04-before-v03-reindex")
    });

    // The v0.3 reader accepts this marker and can run its normal generation
    // replacement without knowing about v0.4's additive source tables.
    expect(readSchemaVersion(projectPath)).toBe("4");
    replaceActiveGenerationWithV03Writer(projectPath);
    expect(readSchemaVersion(projectPath)).toBe("4");
    expect(readTableCount(projectPath, "generation_source_search")).toBe(0);
    expect(readTableCount(projectPath, "source_documents")).toBe(0);
    expect(readTableCount(projectPath, "source_search")).toBe(1);
    expect(store.getActiveGraphBundle(projectPath).sourceSearchVersion).toBeNull();
    expect(store.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("oldNeedle")).hits).toEqual([]);

    // Returning to v0.4 must not backfill the old generation. It prunes the
    // virtual-table orphan, then a new v0.4 generation restores FTS normally.
    store.initialize(projectPath);
    expect(readTableCount(projectPath, "source_search")).toBe(0);

    const secondSnapshot = snapshot([symbol("v04-current", "current")]);
    store.replaceProjectFacts({
      projectPath,
      snapshot: secondSnapshot,
      indexedAt: "2026-07-29T06:30:00.000Z",
      artifactFacts: persistedFacts(secondSnapshot),
      indexInputs: indexInputs("v04-after-v03-reindex"),
      resolverVersion: "test-resolver-v04",
      sourceDocuments: sourceDocuments(secondSnapshot, "export const currentNeedle = true;"),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork: indexWork("full", "v04-after-v03-reindex")
    });

    expect(readSchemaVersion(projectPath)).toBe("4");
    expect(store.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("oldNeedle")).hits).toEqual([]);
    expect(
      store
        .getActiveSourceSearchBundle(projectPath, sourceSearchRequest("currentNeedle"))
        .hits.map((hit) => hit.filePath)
    ).toEqual(["src/example.ts"]);
  });

  it("keeps a v1 snapshot readable through additive migration until the next source-search sync", async () => {
    const projectPath = await temporaryProject();
    const legacySnapshot = snapshot([symbol("legacy-caller", "caller"), symbol("legacy-callee", "callee")]);
    createLegacyV1Index(projectPath, legacySnapshot);
    const store = new SqliteGraphStore();
    const beforeMigrationSnapshot = store.getSnapshot(projectPath);

    expect(store.getStatus(projectPath)).toMatchObject({
      initialized: true,
      indexedAt: "2026-07-29T00:00:00.000Z",
      generationId: null,
      counts: { files: 1, symbols: 2, edges: 1, pendingReferences: 0 }
    });
    expect(beforeMigrationSnapshot.edges[0]).not.toHaveProperty("evidence");
    expect(beforeMigrationSnapshot.files).toMatchObject([{ path: "src/example.ts" }]);
    expect(beforeMigrationSnapshot.symbols.map((node) => node.id)).toEqual(
      expect.arrayContaining(["legacy-caller", "legacy-callee"])
    );
    expect(beforeMigrationSnapshot.edges).toMatchObject([
      { id: "edge:caller-callee", sourceId: "legacy-caller", targetId: "legacy-callee" }
    ]);
    expect(store.getArtifactFacts(projectPath)).toEqual([]);
    expect(store.getIndexInputs(projectPath)).toBeNull();
    expect(store.getActiveGenerationBundle(projectPath)).toMatchObject({
      status: { generationId: null },
      snapshot: beforeMigrationSnapshot,
      artifactFacts: [],
      indexInputs: null,
      extractorVersion: null,
      resolverVersion: null,
      sourceSearchVersion: null
    });

    store.initialize(projectPath);

    expect(store.getStatus(projectPath)).toMatchObject({
      generationId: null,
      stale: false,
      staleReasons: []
    });
    expect(store.getSnapshot(projectPath)).toEqual(beforeMigrationSnapshot);
    expect(store.getArtifactFacts(projectPath)).toEqual([]);
    expect(store.getIndexInputs(projectPath)).toBeNull();
    expect(readSchemaVersion(projectPath)).toBe("4");
    expect(store.getActiveGraphBundle(projectPath).sourceSearchVersion).toBeNull();
    expect(store.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("needle"))).toMatchObject({
      sourceSearchVersion: null,
      hits: []
    });
  });

  it("keeps a v2 active generation readable, then adds input tracking without fabricating it", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const v2Snapshot = snapshot([symbol("v2-caller", "caller"), symbol("v2-callee", "callee")]);
    const v2Facts = persistedFacts(v2Snapshot);

    store.replaceProjectFacts({
      projectPath,
      snapshot: v2Snapshot,
      indexedAt: "2026-07-29T03:00:00.000Z",
      artifactFacts: v2Facts,
      indexInputs: indexInputs("v3-before-downgrade"),
      resolverVersion: "test-resolver-v2",
      sourceDocuments: sourceDocuments(v2Snapshot),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork: indexWork("full", "v2-before-downgrade")
    });
    const beforeMigrationSnapshot = store.getSnapshot(projectPath);
    downgradeCurrentIndexToV2(projectPath);

    expect(readSchemaVersion(projectPath)).toBe("2");
    expect(store.getStatus(projectPath)).toMatchObject({
      initialized: true,
      generationId: expect.any(String),
      staleReasons: []
    });
    expect(store.getSnapshot(projectPath)).toEqual(beforeMigrationSnapshot);
    expect(store.getArtifactFacts(projectPath)).toEqual(v2Facts);
    expect(store.getIndexInputs(projectPath)).toBeNull();

    store.initialize(projectPath);

    expect(readSchemaVersion(projectPath)).toBe("4");
    expect(store.getSnapshot(projectPath)).toEqual(beforeMigrationSnapshot);
    expect(store.getArtifactFacts(projectPath)).toEqual(v2Facts);
    expect(store.getIndexInputs(projectPath)).toBeNull();
    expect(readTableCount(projectPath, "generation_index_inputs")).toBe(0);
    expect(readTableCount(projectPath, "generation_index_work")).toBe(0);
  });

  it("keeps a v3 generation's inputs and versions while leaving missing work and re-exports honest", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const v3Snapshot = snapshot([symbol("v3-caller", "caller"), symbol("v3-callee", "callee")]);
    const v3Facts = persistedFacts(v3Snapshot);
    const v3Inputs = indexInputs("v3-before-downgrade");

    store.replaceProjectFacts({
      projectPath,
      snapshot: v3Snapshot,
      indexedAt: "2026-07-29T04:00:00.000Z",
      artifactFacts: v3Facts,
      indexInputs: v3Inputs,
      resolverVersion: "test-resolver-v3",
      sourceDocuments: sourceDocuments(v3Snapshot),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork: indexWork("incremental", "v3-before-downgrade")
    });
    const beforeMigrationSnapshot = store.getSnapshot(projectPath);
    downgradeCurrentIndexToV3(projectPath, { omitReExportBindings: true });

    expect(readSchemaVersion(projectPath)).toBe("3");
    const legacyBundle = store.getActiveGenerationBundle(projectPath);
    expect(legacyBundle).toMatchObject({
      snapshot: beforeMigrationSnapshot,
      indexInputs: v3Inputs,
      extractorVersion: "test-extractor-v1",
      resolverVersion: "test-resolver-v3"
    });
    expect(legacyBundle.status).not.toHaveProperty("lastIndexWork");
    expect(legacyBundle.artifactFacts[0]?.reExportBindings).toEqual([]);

    store.initialize(projectPath);

    expect(readSchemaVersion(projectPath)).toBe("4");
    const migratedBundle = store.getActiveGenerationBundle(projectPath);
    expect(migratedBundle).toMatchObject({
      snapshot: beforeMigrationSnapshot,
      indexInputs: v3Inputs,
      extractorVersion: "test-extractor-v1",
      resolverVersion: "test-resolver-v3"
    });
    expect(migratedBundle.status).not.toHaveProperty("lastIndexWork");
    expect(migratedBundle.artifactFacts[0]?.reExportBindings).toEqual([]);
    expect(readTableCount(projectPath, "generation_index_work")).toBe(0);
  });

  it("upgrades v4 without fabricating a source search backfill", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const v4Snapshot = snapshot([symbol("v4-only", "only")]);
    const v4Facts = persistedFacts(v4Snapshot);

    store.replaceProjectFacts({
      projectPath,
      snapshot: v4Snapshot,
      indexedAt: "2026-07-29T05:00:00.000Z",
      artifactFacts: v4Facts,
      indexInputs: indexInputs("v4-before-downgrade"),
      resolverVersion: "test-resolver-v4",
      sourceDocuments: sourceDocuments(v4Snapshot),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork: indexWork("full", "v4-before-downgrade")
    });
    const beforeMigration = store.getActiveGenerationBundle(projectPath);
    downgradeCurrentIndexToV4(projectPath);

    expect(readSchemaVersion(projectPath)).toBe("4");
    expect(store.getActiveGraphBundle(projectPath)).toMatchObject({
      snapshot: beforeMigration.snapshot,
      sourceSearchVersion: null
    });
    expect(store.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("needle")).hits).toEqual([]);

    store.initialize(projectPath);

    expect(readSchemaVersion(projectPath)).toBe("4");
    expect(store.getActiveGenerationBundle(projectPath)).toMatchObject({
      snapshot: beforeMigration.snapshot,
      artifactFacts: v4Facts,
      sourceSearchVersion: null
    });
    expect(store.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("needle"))).toMatchObject({
      sourceSearchVersion: null,
      hits: []
    });
    expect(readTableCount(projectPath, "generation_source_search")).toBe(0);
    expect(readTableCount(projectPath, "source_documents")).toBe(0);
    expect(readTableCount(projectPath, "source_search")).toBe(0);
  });

  it("rejects a database written by a newer schema instead of changing it", async () => {
    const projectPath = await temporaryProject();
    mkdirSync(join(projectPath, INDEX_DIRECTORY_NAME), { recursive: true });
    const database = new DatabaseSync(databasePathFor(projectPath));
    try {
      database.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;");
      database.prepare("INSERT INTO meta(key, value) VALUES (?, ?)").run("schema_version", "99");
    } finally {
      database.close();
    }

    const store = new SqliteGraphStore();
    expect(() => store.initialize(projectPath)).toThrow(/schema version \"99\" is unsupported/i);
    expect(() => store.getStatus(projectPath)).toThrow(/schema version \"99\" is unsupported/i);
  });
});
