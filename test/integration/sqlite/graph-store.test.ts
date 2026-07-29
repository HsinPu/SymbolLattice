import { mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import type {
  GraphSnapshot,
  PersistedArtifactFacts,
  ProjectIndexInputs,
  SymbolNode
} from "../../../src/domain/index.js";
import { PROJECT_INDEX_INPUTS_FORMAT_VERSION } from "../../../src/domain/index.js";
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
    exportBindings: []
  }));
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

function downgradeCurrentIndexToV2(projectPath: string): void {
  const database = new DatabaseSync(databasePathFor(projectPath));
  try {
    database.exec("PRAGMA foreign_keys = OFF;");
    database.exec("DROP TABLE generation_index_inputs;");
    database.prepare("UPDATE meta SET value = ? WHERE key = ?").run("2", "schema_version");
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
  });

  it("persists active-generation artifact facts and edge evidence, then clears stale facts", async () => {
    const projectPath = await temporaryProject();
    const store = new SqliteGraphStore();
    const firstSnapshot = snapshot([symbol("caller", "caller"), symbol("callee", "callee")]);
    const firstFacts = persistedFacts(firstSnapshot);
    const firstInputs = indexInputs("first");

    store.replaceProjectFacts({
      projectPath,
      snapshot: firstSnapshot,
      indexedAt: "2026-07-29T01:00:00.000Z",
      artifactFacts: firstFacts,
      indexInputs: firstInputs
    });

    expect(store.getStatus(projectPath)).toMatchObject({
      initialized: true,
      indexedAt: "2026-07-29T01:00:00.000Z",
      generationId: expect.any(String),
      staleReasons: [],
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
    const firstGenerationId = store.getStatus(projectPath).generationId;

    const secondSnapshot = snapshot([symbol("only", "only")]);
    const secondFacts = persistedFacts(secondSnapshot);
    const secondInputs = indexInputs("second");
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
        indexInputs: secondInputs
      })
    ).toThrow();
    expect(store.getStatus(projectPath).generationId).toBe(firstGenerationId);
    expect(store.getSnapshot(projectPath).edges[0]).toMatchObject({ targetId: "callee" });
    expect(store.getArtifactFacts(projectPath)).toEqual(firstFacts);
    expect(store.getIndexInputs(projectPath)).toEqual(firstInputs);

    store.replaceProjectFacts({
      projectPath,
      snapshot: secondSnapshot,
      indexedAt: "2026-07-29T02:00:00.000Z",
      artifactFacts: secondFacts,
      indexInputs: secondInputs
    });

    expect(store.getSnapshot(projectPath)).toMatchObject({
      symbols: [{ id: "only" }],
      edges: []
    });
    expect(store.getArtifactFacts(projectPath)).toEqual(secondFacts);
    expect(store.getIndexInputs(projectPath)).toEqual(secondInputs);
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
  });

  it("keeps a v1 snapshot readable through additive migration until the next v2 sync", async () => {
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

    store.initialize(projectPath);

    expect(store.getStatus(projectPath)).toMatchObject({
      generationId: null,
      stale: false,
      staleReasons: []
    });
    expect(store.getSnapshot(projectPath)).toEqual(beforeMigrationSnapshot);
    expect(store.getArtifactFacts(projectPath)).toEqual([]);
    expect(store.getIndexInputs(projectPath)).toBeNull();
    expect(readSchemaVersion(projectPath)).toBe("3");
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
      indexInputs: indexInputs("v3-before-downgrade")
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

    expect(readSchemaVersion(projectPath)).toBe("3");
    expect(store.getSnapshot(projectPath)).toEqual(beforeMigrationSnapshot);
    expect(store.getArtifactFacts(projectPath)).toEqual(v2Facts);
    expect(store.getIndexInputs(projectPath)).toBeNull();
    expect(readTableCount(projectPath, "generation_index_inputs")).toBe(0);
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
