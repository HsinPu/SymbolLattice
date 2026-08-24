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
const persistentReadStores: SqliteGraphStore[] = [];
const INDEX_DIRECTORY_NAME = ".SymbolLattice";
const DATABASE_FILE_NAME = "index.sqlite";

async function temporaryProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-store-"));
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

function readJournalMode(projectPath: string): string {
  const database = new DatabaseSync(databasePathFor(projectPath), { readOnly: true });
  try {
    const row = database.prepare("PRAGMA journal_mode").get() as unknown as {
      readonly journal_mode: string;
    };
    return row.journal_mode;
  } finally {
    database.close();
  }
}

function readActiveGenerationId(database: DatabaseSync): string | null {
  const row = database
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get("active_generation_id") as unknown as { readonly value: string } | undefined;
  return row?.value ?? null;
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

function readSourceSearchGenerationIds(projectPath: string): readonly string[] {
  const database = new DatabaseSync(databasePathFor(projectPath), { readOnly: true });
  try {
    return (
      database
        .prepare("SELECT DISTINCT generation_id FROM source_search ORDER BY generation_id")
        .all() as readonly { readonly generation_id: string }[]
    ).map((row) => row.generation_id);
  } finally {
    database.close();
  }
}

function deleteGenerationSnapshot(projectPath: string, generationId: string): void {
  const database = new DatabaseSync(databasePathFor(projectPath));
  try {
    database
      .prepare("DELETE FROM generation_snapshots WHERE generation_id = ?")
      .run(generationId);
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
    database.exec("DROP TABLE generation_snapshots;");
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
    database.exec("DROP TABLE generation_snapshots;");
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
    database.exec("DROP TABLE generation_snapshots;");
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
  for (const store of persistentReadStores.splice(0)) {
    store.close();
  }
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
    expect(store.getActiveSourceDocumentsBundle(projectPath, ["src/example.ts"])).toMatchObject({
      sourceSearchVersion: null,
      documents: []
    });
    expect(store.getGenerationHistoryBundle(projectPath)).toBeNull();
    expect(store.getGenerationSnapshotBundle(projectPath, "generation:missing")).toBeNull();
    expect(store.getGenerationComparisonBundle(projectPath, "generation:missing")).toBeNull();
  });

  it("chunks retained snapshots before one JSON string can exceed the persistence bound", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const largeSymbols = Array.from({ length: 1_500 }, (_, index) => ({
      ...symbol(`large-${index}`, `large${index}`),
      qualifiedName: `src/example.ts#large${index}-${"x".repeat(1_024)}`,
      declarationOrdinal: index
    }));
    const graphSnapshot = snapshot(largeSymbols);

    store.replaceProjectFacts({
      projectPath,
      snapshot: graphSnapshot,
      indexedAt: "2026-08-24T00:00:00.000Z",
      artifactFacts: persistedFacts(graphSnapshot),
      indexInputs: indexInputs("chunked-snapshot"),
      resolverVersion: "test-resolver-chunked-snapshot"
    });

    const generationId = store.getStatus(projectPath).generationId!;
    const database = new DatabaseSync(databasePathFor(projectPath), { readOnly: true });
    const symbolParts = database
      .prepare(
        "SELECT COUNT(*) AS count FROM generation_snapshot_parts WHERE generation_id = ? AND section = 'symbols'"
      )
      .get(generationId) as unknown as { readonly count: number };
    database.close();

    expect(symbolParts.count).toBeGreaterThan(1);
    expect(store.getGenerationSnapshotBundle(projectPath, generationId)?.snapshot).toEqual(
      graphSnapshot
    );
  });

  it("round-trips generation-bound source-role evidence through active and retained snapshots", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const graphSnapshot: GraphSnapshot = {
      ...snapshot([symbol("test-source", "orderService")]),
      files: [
        {
          ...snapshot([]).files[0]!,
          path: "test/order-service.test.ts",
          sourceRole: {
            classifierVersion: "source-role-evidence-v2",
            role: "test",
            evidence: [{ kind: "path", ruleId: "source-role.path.javascript-test-suffix" }]
          }
        },
        {
          ...snapshot([]).files[0]!,
          path: "src/icons/order-icon.ts",
          sourceRole: {
            classifierVersion: "source-role-evidence-v2",
            role: "icon",
            evidence: [{ kind: "path", ruleId: "source-role.path.icon-token" }]
          }
        },
        {
          ...snapshot([]).files[0]!,
          path: "src/i18n/orders.ts",
          sourceRole: {
            classifierVersion: "source-role-evidence-v2",
            role: "localization",
            evidence: [{ kind: "path", ruleId: "source-role.path.i18n-token" }]
          }
        }
      ]
    };

    store.replaceProjectFacts({
      projectPath,
      snapshot: graphSnapshot,
      indexedAt: "2026-08-06T00:00:00.000Z",
      artifactFacts: persistedFacts(graphSnapshot),
      indexInputs: indexInputs("source-role-round-trip"),
      resolverVersion: "test-resolver-source-role"
    });

    const sourceRolesByPath = (files: GraphSnapshot["files"]) =>
      Object.fromEntries(files.map((file) => [file.path, file.sourceRole]));
    const expectedSourceRoles = sourceRolesByPath(graphSnapshot.files);
    expect(sourceRolesByPath(store.getSnapshot(projectPath).files)).toEqual(expectedSourceRoles);
    const generationId = store.getStatus(projectPath).generationId!;
    expect(sourceRolesByPath(
      store.getGenerationSnapshotBundle(projectPath, generationId)?.snapshot.files ?? []
    )).toEqual(expectedSourceRoles);
  });

  it("refuses every write when configured as a read-only worker store", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore({ persistentReadProjectPath: projectPath, readOnly: true });
    persistentReadStores.push(store);
    const graphSnapshot = snapshot([symbol("readonly", "readonly")]);

    expect(() => store.initialize(projectPath)).toThrow("configured read-only");
    expect(() =>
      store.replaceProjectFacts({
        projectPath,
        snapshot: graphSnapshot,
        indexedAt: "2026-08-02T00:00:00.000Z",
        artifactFacts: persistedFacts(graphSnapshot),
        indexInputs: indexInputs("read-only"),
        resolverVersion: "test-resolver-read-only"
      })
    ).toThrow("configured read-only");
    expect(store.isInitialized(projectPath)).toBe(false);
  });

  it("round-trips extraction and project plugin provenance for active pending references", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const source = symbol("extension-source", "extensionSource");
    const graphSnapshot: GraphSnapshot = {
      ...snapshot([source]),
      pendingReferences: [
        {
          id: "edge:extension-pending",
          sourceId: source.id,
          filePath: source.filePath,
          referenceName: "targetHandler",
          relationKind: "handles",
          range: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 8 }
          },
          extractionPlugin: {
            pluginId: "acme/framework-facts",
            pluginVersion: "1.0.0"
          }
        },
        {
          id: "edge:project-pending",
          sourceId: source.id,
          filePath: source.filePath,
          referenceName: "crossFileTarget",
          relationKind: "references",
          range: {
            start: { line: 1, column: 2 },
            end: { line: 1, column: 9 }
          },
          projectPlugin: {
            pluginId: "acme/project-composition",
            pluginVersion: "2.0.0"
          }
        }
      ]
    };

    store.replaceProjectFacts({
      projectPath,
      snapshot: graphSnapshot,
      indexedAt: "2026-08-04T00:00:00.000Z",
      artifactFacts: persistedFacts(graphSnapshot),
      indexInputs: indexInputs("extension-provenance"),
      resolverVersion: "test-resolver-extension-provenance"
    });

    expect(store.getSnapshot(projectPath).pendingReferences).toEqual(
      graphSnapshot.pendingReferences
    );
    expect(store.getArtifactFacts(projectPath)[0]?.pendingReferences).toEqual(
      graphSnapshot.pendingReferences
    );

    const legacyConnection = new DatabaseSync(databasePathFor(projectPath));
    legacyConnection
      .prepare("UPDATE pending_refs SET extension_json = ? WHERE id = ?")
      .run(
        JSON.stringify({ pluginId: "acme/framework-facts", pluginVersion: "1.0.0" }),
        "edge:extension-pending"
      );
    legacyConnection.close();
    expect(store.getSnapshot(projectPath).pendingReferences).toEqual(
      graphSnapshot.pendingReferences
    );
  });

  it("round-trips optional Go package facts across a fresh store", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const graphSnapshot = snapshot([symbol("go-options", "getOptions")]);
    const facts = persistedFacts(graphSnapshot).map((artifactFacts) => ({
      ...artifactFacts,
      language: "go" as const,
      goProjectFacts: {
        packageName: "fsnotify",
        functions: [
          {
            name: "getOptions",
            symbolId: "go-options",
            filePath: "src/example.ts",
            unconditionallyAvailable: false
          }
        ],
        imports: [
          {
            moduleSpecifier: "golang.org/x/sys/windows",
            range: {
              start: { line: 1, column: 8 },
              end: { line: 1, column: 35 }
            },
            localName: "windows"
          }
        ],
        bareCalls: [
          {
            callerId: "go-options",
            targetName: "getOptions",
            range: {
              start: { line: 2, column: 3 },
              end: { line: 2, column: 13 }
            }
          }
        ]
      }
    }));

    store.replaceProjectFacts({
      projectPath,
      snapshot: graphSnapshot,
      indexedAt: "2026-08-11T00:00:00.000Z",
      artifactFacts: facts,
      indexInputs: indexInputs("go-project-facts"),
      resolverVersion: "test-resolver-go-project-facts"
    });

    expect(new SqliteGraphStore().getArtifactFacts(projectPath)[0]?.goProjectFacts).toEqual(
      facts[0]?.goProjectFacts
    );
  });

  it("round-trips optional Ada package facts while preserving legacy absence", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const packageSymbol: SymbolNode = {
      ...symbol("ada-package", "Result"),
      kind: "module",
      range: {
        start: { line: 1, column: 1 },
        end: { line: 2, column: 12 }
      }
    };
    const graphSnapshot = snapshot([packageSymbol]);
    const facts: readonly PersistedArtifactFacts[] = persistedFacts(graphSnapshot).map(
      (artifactFacts) => ({
        ...artifactFacts,
        language: "ada" as const,
        adaProjectFacts: {
          packageUnits: [
            {
              role: "spec" as const,
              normalizedFullName: "result",
              symbolId: packageSymbol.id,
              filePath: packageSymbol.filePath,
              unitRange: packageSymbol.range,
              headerRange: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 18 }
              },
              nameRange: {
                start: { line: 1, column: 9 },
                end: { line: 1, column: 15 }
              },
              endRange: {
                start: { line: 2, column: 5 },
                end: { line: 2, column: 11 }
              }
            }
          ]
        }
      })
    );

    store.replaceProjectFacts({
      projectPath,
      snapshot: graphSnapshot,
      indexedAt: "2026-08-12T00:00:00.000Z",
      artifactFacts: facts,
      indexInputs: indexInputs("ada-project-facts"),
      resolverVersion: "test-resolver-ada-project-facts"
    });

    expect(new SqliteGraphStore().getArtifactFacts(projectPath)[0]?.adaProjectFacts).toEqual(
      facts[0]?.adaProjectFacts
    );

    const legacyProjectPath = await temporaryProject();
    const legacyStore = new SqliteGraphStore();
    legacyStore.replaceProjectFacts({
      projectPath: legacyProjectPath,
      snapshot: graphSnapshot,
      indexedAt: "2026-08-12T00:01:00.000Z",
      artifactFacts: persistedFacts(graphSnapshot),
      indexInputs: indexInputs("legacy-without-ada-project-facts"),
      resolverVersion: "test-resolver-legacy-without-ada-project-facts"
    });
    const legacyFacts = new SqliteGraphStore().getArtifactFacts(legacyProjectPath)[0];
    expect(legacyFacts?.adaProjectFacts).toBeUndefined();
    expect(legacyFacts === undefined ? true : Object.hasOwn(legacyFacts, "adaProjectFacts")).toBe(
      false
    );
  });

  it("keeps a default-project reader open across committed generations and reopens it after close", async () => {
    const projectPath = await temporaryProject();
    const writer = new SqliteGraphStore();
    const persistentReader = new SqliteGraphStore({ persistentReadProjectPath: projectPath });
    persistentReadStores.push(persistentReader);
    const firstSnapshot = snapshot([symbol("first", "first")]);
    expect(persistentReader.persistentReadConnectionOpen).toBe(false);

    writer.replaceProjectFacts({
      projectPath,
      snapshot: firstSnapshot,
      indexedAt: "2026-08-02T00:00:00.000Z",
      artifactFacts: persistedFacts(firstSnapshot),
      indexInputs: indexInputs("persistent-first"),
      resolverVersion: "test-resolver-persistent-first",
      sourceDocuments: sourceDocuments(firstSnapshot, "export const firstNeedle = 'firstNeedle';"),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    });

    const firstGenerationId = persistentReader.getStatus(projectPath).generationId;
    expect(persistentReader.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("firstNeedle"))).toMatchObject({
      status: { generationId: firstGenerationId },
      hits: [{ sourceText: "export const firstNeedle = 'firstNeedle';" }]
    });
    expect(persistentReader.persistentReadConnectionOpen).toBe(true);

    const secondSnapshot = snapshot([symbol("second", "second")]);
    writer.replaceProjectFacts({
      projectPath,
      snapshot: secondSnapshot,
      indexedAt: "2026-08-02T00:01:00.000Z",
      artifactFacts: persistedFacts(secondSnapshot),
      indexInputs: indexInputs("persistent-second"),
      resolverVersion: "test-resolver-persistent-second",
      sourceDocuments: sourceDocuments(secondSnapshot, "export const secondNeedle = 'secondNeedle';"),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    });

    const secondBundle = persistentReader.getActiveSourceSearchBundle(
      projectPath,
      sourceSearchRequest("secondNeedle")
    );
    expect(secondBundle).toMatchObject({
      status: { indexedAt: "2026-08-02T00:01:00.000Z" },
      hits: [{ sourceText: "export const secondNeedle = 'secondNeedle';" }]
    });
    expect(secondBundle.status.generationId).not.toBe(firstGenerationId);

    persistentReader.close();
    persistentReader.close();
    expect(persistentReader.persistentReadConnectionOpen).toBe(false);

    const thirdSnapshot = snapshot([symbol("third", "third")]);
    writer.replaceProjectFacts({
      projectPath,
      snapshot: thirdSnapshot,
      indexedAt: "2026-08-02T00:02:00.000Z",
      artifactFacts: persistedFacts(thirdSnapshot),
      indexInputs: indexInputs("persistent-third"),
      resolverVersion: "test-resolver-persistent-third",
      sourceDocuments: sourceDocuments(thirdSnapshot, "export const thirdNeedle = 'thirdNeedle';"),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    });

    expect(persistentReader.getActiveSourceSearchBundle(projectPath, sourceSearchRequest("thirdNeedle"))).toMatchObject({
      status: { indexedAt: "2026-08-02T00:02:00.000Z" },
      hits: [{ sourceText: "export const thirdNeedle = 'thirdNeedle';" }]
    });
    expect(persistentReader.persistentReadConnectionOpen).toBe(true);
  });

  it("uses WAL so an active reader keeps its snapshot while a new generation commits", async () => {
    const projectPath = await temporaryProject();
    const writer = new SqliteGraphStore();
    const firstSnapshot = snapshot([symbol("wal-first", "wal-first")]);
    writer.replaceProjectFacts({
      projectPath,
      snapshot: firstSnapshot,
      indexedAt: "2026-08-02T00:00:00.000Z",
      artifactFacts: persistedFacts(firstSnapshot),
      indexInputs: indexInputs("wal-first"),
      resolverVersion: "test-resolver-wal-first",
      sourceDocuments: sourceDocuments(firstSnapshot, "export const walFirst = true;"),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    });
    expect(readJournalMode(projectPath)).toBe("wal");

    const reader = new DatabaseSync(databasePathFor(projectPath), { readOnly: true });
    let readerTransactionOpen = false;
    try {
      reader.exec("BEGIN");
      readerTransactionOpen = true;
      const firstGenerationId = readActiveGenerationId(reader);
      expect(firstGenerationId).not.toBeNull();

      const secondSnapshot = snapshot([symbol("wal-second", "wal-second")]);
      expect(() =>
        writer.replaceProjectFacts({
          projectPath,
          snapshot: secondSnapshot,
          indexedAt: "2026-08-02T00:01:00.000Z",
          artifactFacts: persistedFacts(secondSnapshot),
          indexInputs: indexInputs("wal-second"),
          resolverVersion: "test-resolver-wal-second",
          sourceDocuments: sourceDocuments(secondSnapshot, "export const walSecond = true;"),
          sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
        })
      ).not.toThrow();

      expect(readActiveGenerationId(reader)).toBe(firstGenerationId);
      reader.exec("COMMIT");
      readerTransactionOpen = false;
      expect(readActiveGenerationId(reader)).not.toBe(firstGenerationId);
    } finally {
      if (readerTransactionOpen) {
        try {
          reader.exec("ROLLBACK");
        } catch {
          // Preserve the test failure while releasing the temporary reader.
        }
      }
      reader.close();
    }
  });

  it("converts an existing graph back to WAL without replacing its active generation", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const graphSnapshot = snapshot([symbol("wal-upgrade", "wal-upgrade")]);
    store.replaceProjectFacts({
      projectPath,
      snapshot: graphSnapshot,
      indexedAt: "2026-08-02T00:00:00.000Z",
      artifactFacts: persistedFacts(graphSnapshot),
      indexInputs: indexInputs("wal-upgrade"),
      resolverVersion: "test-resolver-wal-upgrade",
      sourceDocuments: sourceDocuments(graphSnapshot, "export const walUpgrade = true;"),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    });
    const generationId = store.getStatus(projectPath).generationId;

    const legacyConnection = new DatabaseSync(databasePathFor(projectPath));
    try {
      legacyConnection.prepare("PRAGMA journal_mode = DELETE").get();
    } finally {
      legacyConnection.close();
    }
    expect(readJournalMode(projectPath)).toBe("delete");

    store.initialize(projectPath);

    expect(readJournalMode(projectPath)).toBe("wal");
    expect(store.getStatus(projectPath).generationId).toBe(generationId);
    expect(store.getSnapshot(projectPath)).toEqual(graphSnapshot);
  });

  it("persists active-generation artifact facts and edge evidence, then clears stale facts", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const firstSnapshot = snapshot([symbol("caller", "caller"), symbol("callee", "callee")]);
    const firstFacts = persistedFacts(firstSnapshot).map((facts) => ({
      ...facts,
      typescriptFacts: {
        decoratorTaintedTypeSymbolIds: ["caller"],
        decoratorTaintedMemberSymbolIds: ["callee"],
        staticMemberSymbolIds: [],
        instanceMemberSymbolIds: ["callee"],
        callableMemberSymbolIds: ["callee"],
        runtimeTaintedMemberSurfaces: [
          { typeSymbolId: "caller", memberName: "run", memberKind: "instance" }
        ]
      },
      jspFacts: {
        taglibs: [
          {
            sourceId: "caller",
            filePath: "sample.ts",
            prefix: "ui",
            tagDir: "/WEB-INF/tags",
            range: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 10 }
            }
          }
        ],
        templateReferences: [
          {
            sourceId: "caller",
            filePath: "sample.ts",
            kind: "tag-file" as const,
            targetFilePaths: ["WEB-INF/tags/card.tag"],
            referenceName: "tag-file WEB-INF/tags/card.tag",
            range: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 10 }
            }
          }
        ]
      }
    }));
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
    expect(store.getActiveSourceDocumentsBundle(projectPath, ["src/example.ts"])).toMatchObject({
      status: { indexedAt: "2026-07-29T01:00:00.000Z" },
      snapshot: firstBundle.snapshot,
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      documents: [
        {
          filePath: "src/example.ts",
          language: "typescript",
          sourceText: "export const searchableValue = 'needle';"
        }
      ]
    });
    const firstGenerationId = store.getStatus(projectPath).generationId;
    expect(firstGenerationId).not.toBeNull();
    if (firstGenerationId === null) {
      throw new Error("Expected the first replacement to publish a generation.");
    }

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
    expect(store.getActiveSourceDocumentsBundle(projectPath, ["src/example.ts"])).toMatchObject({
      status: { generationId: firstGenerationId },
      snapshot: firstBundle.snapshot,
      documents: [
        {
          filePath: "src/example.ts",
          sourceText: "export const searchableValue = 'needle';"
        }
      ]
    });
    expect(store.getGenerationHistoryBundle(projectPath)?.generations).toMatchObject([
      {
        generationId: firstGenerationId,
        indexedAt: "2026-07-29T01:00:00.000Z",
        snapshotVersion: 2,
        counts: { files: 1, symbols: 2, edges: 1, pendingReferences: 0 },
        indexWork: firstWork,
        extractorVersion: "test-extractor-v1",
        resolverVersion: "test-resolver-v2"
      }
    ]);

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
    expect(store.getActiveSourceDocumentsBundle(projectPath, ["src/example.ts"])).toMatchObject({
      status: { indexedAt: "2026-07-29T02:00:00.000Z" },
      snapshot: {
        symbols: [{ id: "only" }]
      },
      documents: [
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
    const history = store.getGenerationHistoryBundle(projectPath);
    expect(history).not.toBeNull();
    if (history === null) {
      throw new Error("Expected retained generation history.");
    }
    expect(history).toMatchObject({
      retentionLimit: 5,
      status: { generationId: store.getStatus(projectPath).generationId },
      generations: [
        {
          indexedAt: "2026-07-29T02:00:00.000Z",
          counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 },
          indexWork: secondWork,
          resolverVersion: "test-resolver-v3"
        },
        {
          generationId: firstGenerationId,
          indexedAt: "2026-07-29T01:00:00.000Z",
          counts: { files: 1, symbols: 2, edges: 1, pendingReferences: 0 },
          indexWork: firstWork,
          resolverVersion: "test-resolver-v2"
        }
      ]
    });
    expect(store.getGenerationSnapshotBundle(projectPath, firstGenerationId)).toMatchObject({
      generation: { generationId: firstGenerationId },
      snapshot: firstSnapshot
    });
    expect(readTableCount(projectPath, "generations")).toBe(2);
    expect(readTableCount(projectPath, "generation_snapshots")).toBe(2);
    expect(readTableCount(projectPath, "artifact_facts")).toBe(2);
    expect(readTableCount(projectPath, "edge_evidence")).toBe(1);
    expect(readTableCount(projectPath, "generation_index_inputs")).toBe(2);
    expect(readTableCount(projectPath, "generation_index_work")).toBe(2);
    expect(readTableCount(projectPath, "generation_source_search")).toBe(2);
    expect(readTableCount(projectPath, "source_documents")).toBe(2);
    expect(readTableCount(projectPath, "source_search")).toBe(2);
  });

  it("round-trips route symbols, route edges, and unresolved route references", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const handler = symbol("handler", "healthHandler");
    const route: SymbolNode = {
      id: "route:health",
      name: "GET /health",
      qualifiedName: "src/example.ts#route:GET /health",
      kind: "route",
      filePath: "src/example.ts",
      range: {
        start: { line: 5, column: 1 },
        end: { line: 5, column: 33 }
      },
      isExported: false,
      declarationOrdinal: 0
    };
    const unresolvedRoute: SymbolNode = {
      id: "route:missing",
      name: "POST /missing",
      qualifiedName: "src/example.ts#route:POST /missing",
      kind: "route",
      filePath: "src/example.ts",
      range: {
        start: { line: 6, column: 1 },
        end: { line: 6, column: 34 }
      },
      isExported: false,
      declarationOrdinal: 0
    };
    const routeSnapshot: GraphSnapshot = {
      files: [
        {
          path: "src/example.ts",
          contentHash: "route-hash",
          language: "typescript",
          indexedAt: "2026-07-30T00:00:00.000Z"
        }
      ],
      symbols: [route, unresolvedRoute, handler],
      edges: [
        {
          id: "edge:route-health",
          sourceId: route.id,
          targetId: handler.id,
          kind: "routes",
          filePath: route.filePath,
          range: {
            start: { line: 5, column: 20 },
            end: { line: 5, column: 33 }
          },
          resolution: "exact",
          confidence: 1,
          referenceName: handler.name,
          evidence: {
            ruleId: "framework.express.literal-route.local-handler",
            stage: "lexical",
            candidateSymbolIds: [handler.id]
          }
        },
        {
          id: "edge:route-missing",
          sourceId: unresolvedRoute.id,
          targetId: null,
          kind: "routes",
          filePath: unresolvedRoute.filePath,
          range: {
            start: { line: 6, column: 23 },
            end: { line: 6, column: 37 }
          },
          resolution: "unresolved",
          confidence: 0,
          referenceName: "missingHandler",
          evidence: {
            ruleId: "framework.express.literal-route.unresolved-handler",
            stage: "unresolved",
            candidateSymbolIds: []
          }
        }
      ],
      pendingReferences: [
        {
          id: "edge:route-missing",
          sourceId: unresolvedRoute.id,
          filePath: unresolvedRoute.filePath,
          referenceName: "missingHandler",
          relationKind: "routes",
          range: {
            start: { line: 6, column: 23 },
            end: { line: 6, column: 37 }
          }
        }
      ]
    };
    const facts = persistedFacts(routeSnapshot);

    store.replaceProjectFacts({
      projectPath,
      snapshot: routeSnapshot,
      indexedAt: "2026-07-30T00:00:00.000Z",
      artifactFacts: facts,
      indexInputs: indexInputs("routes"),
      resolverVersion: "test-resolver-routes",
      sourceDocuments: sourceDocuments(routeSnapshot, 'const app = express(); app.get("/health", healthHandler);'),
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork: indexWork("full", "routes")
    });

    expect(store.getSnapshot(projectPath)).toEqual({
      ...routeSnapshot,
      // SQLite's canonical projection is source-range ordered, independently
      // of the caller-provided snapshot insertion order.
      symbols: [handler, route, unresolvedRoute]
    });
    expect(store.getArtifactFacts(projectPath)).toEqual(facts);
    expect(store.getGenerationHistoryBundle(projectPath)?.generations).toMatchObject([
      {
        counts: { files: 1, symbols: 3, edges: 2, pendingReferences: 1 },
        resolverVersion: "test-resolver-routes"
      }
    ]);
  });

  it("reads comparison selections and the active projection from one retained state", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const firstSnapshot = snapshot([symbol("before", "before")]);
    const secondSnapshot = snapshot([symbol("after", "after")]);

    store.replaceProjectFacts({
      projectPath,
      snapshot: firstSnapshot,
      indexedAt: "2026-07-29T02:10:00.000Z",
      artifactFacts: persistedFacts(firstSnapshot),
      indexInputs: indexInputs("comparison-before"),
      resolverVersion: "test-resolver-comparison-before",
      indexWork: indexWork("full", "comparison-before")
    });
    const firstGenerationId = store.getStatus(projectPath).generationId;
    expect(firstGenerationId).not.toBeNull();
    if (firstGenerationId === null) {
      throw new Error("Expected the first retained generation.");
    }

    store.replaceProjectFacts({
      projectPath,
      snapshot: secondSnapshot,
      indexedAt: "2026-07-29T02:20:00.000Z",
      artifactFacts: persistedFacts(secondSnapshot),
      indexInputs: indexInputs("comparison-after"),
      resolverVersion: "test-resolver-comparison-after",
      indexWork: indexWork("incremental", "comparison-after")
    });
    const activeGenerationId = store.getStatus(projectPath).generationId;
    expect(activeGenerationId).not.toBeNull();
    if (activeGenerationId === null) {
      throw new Error("Expected the active retained generation.");
    }

    // Omitting `toGenerationId` resolves it from the same active status and
    // projection read that supplies the retained-history listing.
    const comparison = store.getGenerationComparisonBundle(projectPath, firstGenerationId);
    expect(comparison).not.toBeNull();
    if (comparison === null) {
      throw new Error("Expected an atomic retained-generation comparison.");
    }
    expect(comparison.history).toMatchObject({
      status: { generationId: activeGenerationId },
      activeGraph: {
        status: { generationId: activeGenerationId },
        snapshot: secondSnapshot,
        resolverVersion: "test-resolver-comparison-after"
      },
      generations: [
        { generationId: activeGenerationId },
        { generationId: firstGenerationId }
      ]
    });
    expect(comparison.history.status).toEqual(comparison.history.activeGraph.status);
    expect(comparison.from).toMatchObject({
      status: { generationId: activeGenerationId },
      generation: { generationId: firstGenerationId },
      snapshot: firstSnapshot
    });
    expect(comparison.to).toMatchObject({
      status: { generationId: activeGenerationId },
      generation: { generationId: activeGenerationId },
      snapshot: secondSnapshot
    });
    expect(comparison.to?.snapshot).toEqual(comparison.history.activeGraph.snapshot);

    // Missing selections are explicit without invalidating the coherent
    // history and separately selected retained snapshot.
    const unavailableFrom = store.getGenerationComparisonBundle(
      projectPath,
      "generation:not-retained",
      firstGenerationId
    );
    expect(unavailableFrom).toMatchObject({
      history: {
        status: { generationId: activeGenerationId },
        activeGraph: { status: { generationId: activeGenerationId } }
      },
      from: null,
      to: {
        generation: { generationId: firstGenerationId },
        snapshot: firstSnapshot
      }
    });
    expect(
      store.getGenerationComparisonBundle(
        projectPath,
        firstGenerationId,
        "generation:not-retained"
      )
    ).toMatchObject({
      from: {
        generation: { generationId: firstGenerationId },
        snapshot: firstSnapshot
      },
      to: null
    });
  });

  it("retains five immutable snapshots, prunes older FTS rows, and hides stale history", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const generationIds: string[] = [];

    for (let sequence = 1; sequence <= 6; sequence += 1) {
      const graphSnapshot = snapshot([symbol(`history-${sequence}`, `history${sequence}`)]);
      store.replaceProjectFacts({
        projectPath,
        snapshot: graphSnapshot,
        // The active generation must be retained even when a caller supplies
        // an older timestamp than the previous successful replacements.
        indexedAt:
          sequence === 6
            ? "2026-07-28T00:00:00.000Z"
            : `2026-07-29T0${sequence}:00:00.000Z`,
        artifactFacts: persistedFacts(graphSnapshot),
        indexInputs: indexInputs(`history-${sequence}`),
        resolverVersion: `test-resolver-history-${sequence}`,
        sourceDocuments: sourceDocuments(graphSnapshot, `export const retained${sequence} = true;`),
        sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
        indexWork: indexWork(sequence === 1 ? "full" : "incremental", `history-${sequence}`)
      });
      const generationId = store.getStatus(projectPath).generationId;
      expect(generationId).not.toBeNull();
      if (generationId === null) {
        throw new Error("Expected a generation after replacement.");
      }
      generationIds.push(generationId);
    }

    const history = store.getGenerationHistoryBundle(projectPath);
    expect(history).not.toBeNull();
    if (history === null) {
      throw new Error("Expected retained generation history.");
    }
    const retainedGenerationIds = generationIds.slice(1);
    expect(history.generations.map((generation) => generation.generationId)).toEqual(
      [generationIds[4], generationIds[3], generationIds[2], generationIds[1], generationIds[5]]
    );
    expect(history.generations).toHaveLength(5);
    expect(history.generations.find((generation) => generation.generationId === generationIds[5])).toMatchObject({
      counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 },
      indexWork: indexWork("incremental", "history-6"),
      resolverVersion: "test-resolver-history-6"
    });
    expect(store.getGenerationSnapshotBundle(projectPath, generationIds[0] as string)).toBeNull();
    expect(readTableCount(projectPath, "generations")).toBe(5);
    expect(readTableCount(projectPath, "generation_snapshots")).toBe(5);
    expect(readTableCount(projectPath, "source_search")).toBe(5);
    expect(readSourceSearchGenerationIds(projectPath)).toEqual([...retainedGenerationIds].sort());

    const activeGenerationId = store.getStatus(projectPath).generationId;
    expect(activeGenerationId).not.toBeNull();
    if (activeGenerationId === null) {
      throw new Error("Expected an active retained generation.");
    }
    deleteGenerationSnapshot(projectPath, activeGenerationId);
    expect(store.getGenerationHistoryBundle(projectPath)).toBeNull();
    expect(store.getGenerationSnapshotBundle(projectPath, retainedGenerationIds[0] as string)).toBeNull();
    expect(
      store.getGenerationComparisonBundle(projectPath, retainedGenerationIds[0] as string)
    ).toBeNull();
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

  it("returns selected active-generation documents in deterministic request order", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const documents: readonly IndexedSourceDocument[] = [
      { filePath: "src/a.ts", language: "typescript", sourceText: "export const a = 1;" },
      { filePath: "src/z.ts", language: "typescript", sourceText: "export const z = 1;" },
      { filePath: "src/worker.js", language: "javascript", sourceText: "export const worker = 1;" },
      { filePath: "tests/example.ts", language: "typescript", sourceText: "export const test = 1;" }
    ];
    const graphSnapshot: GraphSnapshot = {
      files: documents.map((document, index) => ({
        path: document.filePath,
        contentHash: `hash-${index}`,
        language: document.language,
        indexedAt: "2026-07-29T03:00:00.000Z"
      })),
      symbols: [],
      edges: [],
      pendingReferences: []
    };

    store.replaceProjectFacts({
      projectPath,
      snapshot: graphSnapshot,
      indexedAt: "2026-07-29T03:00:00.000Z",
      artifactFacts: persistedFacts(graphSnapshot),
      indexInputs: indexInputs("source-documents-ordering"),
      resolverVersion: "test-resolver-v041",
      sourceDocuments: documents,
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      indexWork: indexWork("full", "source-documents-ordering")
    });

    const bundle = store.getActiveSourceDocumentsBundle(projectPath, [
      "tests/example.ts",
      "missing.ts",
      "src/a.ts",
      "tests/example.ts",
      "src/worker.js"
    ]);

    expect(bundle).toMatchObject({
      status: {
        indexedAt: "2026-07-29T03:00:00.000Z",
        generationId: expect.any(String)
      },
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    });
    expect(bundle.snapshot.files.map((file) => file.path)).toEqual([
      "src/a.ts",
      "src/worker.js",
      "src/z.ts",
      "tests/example.ts"
    ]);
    expect(bundle.documents).toEqual([documents[3], documents[0], documents[2]]);
    expect(store.getActiveSourceDocumentsBundle(projectPath, []).documents).toEqual([]);
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
    expect(store.getActiveSourceDocumentsBundle(projectPath, ["src/example.ts"])).toMatchObject({
      sourceSearchVersion: null,
      documents: []
    });
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
    expect(store.getActiveSourceDocumentsBundle(projectPath, ["src/example.ts"])).toMatchObject({
      sourceSearchVersion: null,
      documents: []
    });

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
    expect(store.getActiveSourceDocumentsBundle(projectPath, ["src/example.ts"])).toMatchObject({
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      documents: [
        {
          filePath: "src/example.ts",
          sourceText: "export const currentNeedle = true;"
        }
      ]
    });
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
    expect(store.getActiveSourceDocumentsBundle(projectPath, ["src/example.ts"])).toMatchObject({
      sourceSearchVersion: null,
      documents: []
    });
    expect(store.getGenerationHistoryBundle(projectPath)).toBeNull();
    expect(readTableCount(projectPath, "generation_snapshots")).toBe(0);
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
    expect(store.getGenerationHistoryBundle(projectPath)).toBeNull();

    store.initialize(projectPath);

    expect(readSchemaVersion(projectPath)).toBe("4");
    expect(store.getSnapshot(projectPath)).toEqual(beforeMigrationSnapshot);
    expect(store.getArtifactFacts(projectPath)).toEqual(v2Facts);
    expect(store.getIndexInputs(projectPath)).toBeNull();
    expect(readTableCount(projectPath, "generation_index_inputs")).toBe(0);
    expect(readTableCount(projectPath, "generation_index_work")).toBe(0);
    expect(store.getGenerationHistoryBundle(projectPath)).toMatchObject({
      generations: [
        {
          indexedAt: "2026-07-29T03:00:00.000Z",
          snapshotVersion: 2,
          counts: { files: 1, symbols: 2, edges: 1, pendingReferences: 0 },
          indexWork: null,
          resolverVersion: "test-resolver-v2"
        }
      ]
    });
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
    expect(store.getGenerationHistoryBundle(projectPath)).toBeNull();

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
    expect(store.getGenerationHistoryBundle(projectPath)).toMatchObject({
      generations: [
        {
          indexedAt: "2026-07-29T04:00:00.000Z",
          snapshotVersion: 2,
          counts: { files: 1, symbols: 2, edges: 1, pendingReferences: 0 },
          indexWork: null,
          resolverVersion: "test-resolver-v3"
        }
      ]
    });
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
    expect(store.getGenerationHistoryBundle(projectPath)).toBeNull();

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
    const history = store.getGenerationHistoryBundle(projectPath);
    expect(history).toMatchObject({
      retentionLimit: 5,
      generations: [
        {
          indexedAt: "2026-07-29T05:00:00.000Z",
          snapshotVersion: 2,
          counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 },
          indexWork: indexWork("full", "v4-before-downgrade"),
          resolverVersion: "test-resolver-v4"
        }
      ]
    });
    const generationId = history?.generations[0]?.generationId;
    expect(generationId).toBe(beforeMigration.status.generationId);
    if (generationId === undefined) {
      throw new Error("Expected the v4 migration to backfill its active snapshot.");
    }
    expect(store.getGenerationSnapshotBundle(projectPath, generationId)).toMatchObject({
      generation: { generationId, snapshotVersion: 2 },
      snapshot: beforeMigration.snapshot
    });
    store.initialize(projectPath);
    expect(readTableCount(projectPath, "generation_snapshots")).toBe(1);
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
    expect(readJournalMode(projectPath)).toBe("delete");
    expect(() => store.getStatus(projectPath)).toThrow(/schema version \"99\" is unsupported/i);
  });
});
