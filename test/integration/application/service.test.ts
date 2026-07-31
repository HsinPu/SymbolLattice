import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_GIT_HUNK_LIMIT,
  DEFAULT_HIERARCHY_LIMIT,
  DEFAULT_ENTRYPOINT_LIMIT,
  DEFAULT_ROUTE_LIMIT,
  MAX_GIT_HUNK_DECLARATION_ANCHORS,
  MAX_GIT_HUNK_LIMIT,
  MAX_GIT_HUNK_SOURCE_FILES,
  MAX_HIERARCHY_LIMIT,
  MAX_ENTRYPOINT_LIMIT,
  MAX_ROUTE_LIMIT,
  MAX_GENERATION_DIFF_LIMIT,
  MAX_GENERATION_HISTORY_LIMIT,
  NODE_MATCH_CANDIDATE_LIMIT,
  NODE_RELATION_LIMIT,
  NODE_SOURCE_CHARACTER_LIMIT,
  NODE_SOURCE_LINE_LIMIT,
  SymbolLatticeError,
  SymbolLatticeService
} from "../../../src/application/index.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  PROJECT_RESOLVER_VERSION,
  SOURCE_SEARCH_INDEX_VERSION,
  type GraphSnapshot,
  type IndexedSourceDocument,
  type IndexStatus
} from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";
import type {
  ActiveGraphBundle,
  ActiveGenerationBundle,
  ActiveSourceDocumentsBundle,
  GenerationComparisonBundle,
  GenerationHistoryEntry,
  GitChangeSet,
  GitChangeSetProvider,
  GitRevisionHunkProvider,
  GitRevisionHunkSet,
  GraphStore,
  ReplaceProjectFactsInput
} from "../../../src/ports/index.js";
import { GitChangeSetError } from "../../../src/ports/index.js";

const temporaryDirectories: string[] = [];
const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "basic-project"
);
const configuredFixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "configured-project"
);
const INDEX_DIRECTORY_NAME = ".symbol-lattice";
const DATABASE_FILE_NAME = "index.sqlite";

async function createFixtureProject(sourcePath = fixturePath): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-service-"));
  temporaryDirectories.push(projectPath);
  await cp(sourcePath, projectPath, { recursive: true });
  return projectPath;
}

async function createInlineProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-service-inline-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, sourceText]) => {
      const absolutePath = resolve(projectPath, ...relativePath.split("/"));
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, sourceText, "utf8");
    })
  );
  return projectPath;
}

function createService(): SymbolLatticeService {
  return new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
}

function gitChangeSet(
  sourcePaths: readonly string[],
  changes: GitChangeSet["changes"] = sourcePaths.map((filePath) => ({
    kind: "modified",
    previousPath: filePath,
    currentPath: filePath,
    score: null
  }))
): GitChangeSet {
  return {
    requestedBaseRef: null,
    mergeBaseCommit: null,
    headCommit: "a".repeat(40),
    includesUntracked: true,
    changes,
    sourcePaths
  };
}

function gitRevisionHunkSet(
  files: GitRevisionHunkSet["files"],
  sourcePaths = [...new Set(files.flatMap((file) => [file.previous.filePath, file.current.filePath]))]
    .filter((filePath): filePath is string => filePath !== null)
    .sort()
): GitRevisionHunkSet {
  return {
    changeSet: {
      requestedBaseRef: "origin/main",
      mergeBaseCommit: "b".repeat(40),
      headCommit: "h".repeat(40),
      includesUntracked: false,
      changes: files.map((file) => file.change),
      sourcePaths
    },
    files
  };
}

/**
 * Deliberately exposes only the v0.3 adapter surface. It proves that the
 * additive v0.4 graph/search bundle optimization does not break existing
 * storage adapters at runtime.
 */
type V03GraphStore = Omit<
  GraphStore,
  | "getActiveGraphBundle"
  | "getActiveSourceSearchBundle"
  | "getActiveSourceDocumentsBundle"
  | "getActiveGenerationBundle"
  | "replaceProjectFacts"
> & {
  readonly getActiveGenerationBundle: (
    projectPath: string
  ) => Omit<ActiveGenerationBundle, "sourceSearchVersion">;
  readonly replaceProjectFacts: (
    input: Omit<ReplaceProjectFactsInput, "sourceDocuments" | "sourceSearchVersion">
  ) => void;
};

function createV03GraphStore(backingStore: SqliteGraphStore): V03GraphStore {
  const adapter: V03GraphStore = {
    isInitialized: (projectPath) => backingStore.isInitialized(projectPath),
    initialize: (projectPath) => backingStore.initialize(projectPath),
    getStatus: (projectPath) => backingStore.getStatus(projectPath),
    getSnapshot: (projectPath) => backingStore.getSnapshot(projectPath),
    getArtifactFacts: (projectPath) => backingStore.getArtifactFacts(projectPath),
    getIndexInputs: (projectPath) => backingStore.getIndexInputs(projectPath),
    getActiveGenerationBundle: (projectPath) => {
      const { sourceSearchVersion: _sourceSearchVersion, ...legacyBundle } =
        backingStore.getActiveGenerationBundle(projectPath);
      return legacyBundle;
    },
    replaceProjectFacts: (input) => backingStore.replaceProjectFacts(input)
  };
  return adapter;
}

/** Simulates a partial persisted source projection without changing graph facts. */
function createMissingSourceDocumentGraphStore(backingStore: SqliteGraphStore): GraphStore {
  return {
    isInitialized: (projectPath) => backingStore.isInitialized(projectPath),
    initialize: (projectPath) => backingStore.initialize(projectPath),
    getStatus: (projectPath) => backingStore.getStatus(projectPath),
    getSnapshot: (projectPath) => backingStore.getSnapshot(projectPath),
    getArtifactFacts: (projectPath) => backingStore.getArtifactFacts(projectPath),
    getIndexInputs: (projectPath) => backingStore.getIndexInputs(projectPath),
    getActiveGraphBundle: (projectPath) => backingStore.getActiveGraphBundle(projectPath),
    getActiveGenerationBundle: (projectPath) => backingStore.getActiveGenerationBundle(projectPath),
    getActiveSourceSearchBundle: (projectPath, request) =>
      backingStore.getActiveSourceSearchBundle(projectPath, request),
    getActiveSourceDocumentsBundle: (projectPath, filePaths) => ({
      ...backingStore.getActiveSourceDocumentsBundle(projectPath, filePaths),
      documents: []
    }),
    replaceProjectFacts: (input) => backingStore.replaceProjectFacts(input)
  };
}

function raceSnapshot(filePath: string): GraphSnapshot {
  return {
    files: [
      {
        path: filePath,
        contentHash: `hash:${filePath}`,
        language: "typescript",
        indexedAt: "2026-07-29T00:00:00.000Z"
      }
    ],
    symbols: [
      {
        id: "symbol:race-target",
        name: "raceTarget",
        qualifiedName: `${filePath}#raceTarget`,
        kind: "function",
        filePath,
        range: {
          start: { line: 1, column: 1 },
          end: { line: 3, column: 2 }
        },
        isExported: true,
        declarationOrdinal: 0
      }
    ],
    edges: [],
    pendingReferences: []
  };
}

function raceStatus(generationId: string): IndexStatus {
  return {
    initialized: true,
    stale: false,
    staleReasons: [],
    projectPath: "C:/symbol-lattice-race-project",
    indexedAt: "2026-07-29T00:00:00.000Z",
    generationId,
    counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 }
  };
}

function raceSourceDocument(filePath: string, sourceText: string): IndexedSourceDocument {
  return { filePath, language: "typescript", sourceText };
}

function raceSourceDocumentsBundle(
  generationId: string,
  filePath: string,
  sourceText: string,
  documents: readonly IndexedSourceDocument[] = [raceSourceDocument(filePath, sourceText)]
): ActiveSourceDocumentsBundle {
  return {
    status: raceStatus(generationId),
    snapshot: raceSnapshot(filePath),
    indexInputs: null,
    extractorVersion: null,
    resolverVersion: null,
    sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
    documents
  };
}

function raceGenerationHistoryEntry(generationId: string): GenerationHistoryEntry {
  return {
    generationId,
    indexedAt: "2026-07-29T00:00:00.000Z",
    snapshotVersion: 1,
    counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 },
    indexWork: null,
    extractorVersion: "race-extractor",
    resolverVersion: "race-resolver"
  };
}

function raceGenerationComparisonBundle(
  fromGenerationId: string,
  toGenerationId: string
): GenerationComparisonBundle {
  const from = raceGenerationHistoryEntry(fromGenerationId);
  const to = raceGenerationHistoryEntry(toGenerationId);
  const activeGraph: ActiveGraphBundle = {
    status: raceStatus(toGenerationId),
    snapshot: raceSnapshot("src/to.ts"),
    indexInputs: null,
    extractorVersion: null,
    resolverVersion: null,
    sourceSearchVersion: null
  };
  return {
    history: {
      status: activeGraph.status,
      activeGraph,
      retentionLimit: 5,
      generations: [to, from]
    },
    from: {
      status: activeGraph.status,
      generation: from,
      snapshot: raceSnapshot("src/from.ts")
    },
    to: {
      status: activeGraph.status,
      generation: to,
      snapshot: raceSnapshot("src/to.ts")
    }
  };
}

function createAtomicComparisonOnlyGraphStore(
  comparison: GenerationComparisonBundle
): {
  readonly graphStore: GraphStore;
  readonly comparisonRequests: readonly {
    readonly projectPath: string;
    readonly fromGenerationId: string;
    readonly toGenerationId: string | undefined;
  }[];
} {
  const comparisonRequests: {
    projectPath: string;
    fromGenerationId: string;
    toGenerationId: string | undefined;
  }[] = [];
  const separateRead = (name: string): never => {
    throw new Error(`Diff must not perform a separate ${name} read.`);
  };
  const graphStore: GraphStore = {
    isInitialized: () => separateRead("initialization"),
    initialize: () => {},
    getStatus: () => separateRead("status"),
    getSnapshot: () => separateRead("snapshot"),
    getArtifactFacts: () => [],
    getIndexInputs: () => null,
    getActiveGraphBundle: () => separateRead("active graph"),
    getActiveGenerationBundle: () => separateRead("active generation"),
    getGenerationHistoryBundle: () => separateRead("retained history"),
    getGenerationSnapshotBundle: () => separateRead("retained snapshot"),
    getGenerationComparisonBundle: (projectPath, fromGenerationId, toGenerationId) => {
      comparisonRequests.push({ projectPath, fromGenerationId, toGenerationId });
      if (comparisonRequests.length > 1) {
        throw new Error("A second atomic comparison read would observe a changed generation.");
      }
      return comparison;
    },
    replaceProjectFacts: () => {}
  };
  return { graphStore, comparisonRequests };
}

function createSequencedSourceDocumentGraphStore(
  initialBundle: ActiveGraphBundle,
  sourceBundles: readonly ActiveSourceDocumentsBundle[]
): {
  readonly graphStore: GraphStore;
  readonly sourceDocumentRequests: readonly (readonly string[])[];
} {
  const sourceDocumentRequests: (readonly string[])[] = [];
  let sourceBundleIndex = 0;
  const graphStore: GraphStore = {
    isInitialized: () => true,
    initialize: () => {},
    getStatus: () => initialBundle.status,
    getSnapshot: () => initialBundle.snapshot,
    getArtifactFacts: () => [],
    getIndexInputs: () => initialBundle.indexInputs,
    getActiveGraphBundle: () => initialBundle,
    getActiveGenerationBundle: () => ({ ...initialBundle, artifactFacts: [] }),
    getActiveSourceDocumentsBundle: (_projectPath, filePaths) => {
      sourceDocumentRequests.push([...filePaths]);
      const bundle = sourceBundles[sourceBundleIndex];
      sourceBundleIndex += 1;
      if (bundle === undefined) {
        throw new Error("Unexpected source-document bundle read.");
      }
      return bundle;
    },
    replaceProjectFacts: () => {}
  };
  return { graphStore, sourceDocumentRequests };
}

/** Simulates a migrated v0.3 graph whose source-search projection was not yet present. */
function removeSourceSearchProjection(projectPath: string): void {
  const database = new DatabaseSync(join(projectPath, INDEX_DIRECTORY_NAME, DATABASE_FILE_NAME));
  try {
    database.exec("PRAGMA foreign_keys = OFF;");
    database.exec("DROP TABLE source_search;");
    database.exec("DROP TABLE source_documents;");
    database.exec("DROP TABLE generation_source_search;");
    database
      .prepare("UPDATE meta SET value = ? WHERE key = ?")
      .run("4", "schema_version");
  } finally {
    database.close();
  }
}

function setSchemaVersion(projectPath: string, version: string): void {
  const database = new DatabaseSync(join(projectPath, INDEX_DIRECTORY_NAME, DATABASE_FILE_NAME));
  try {
    database.prepare("UPDATE meta SET value = ? WHERE key = ?").run(version, "schema_version");
  } finally {
    database.close();
  }
}

function readSchemaVersion(projectPath: string): string {
  const database = new DatabaseSync(join(projectPath, INDEX_DIRECTORY_NAME, DATABASE_FILE_NAME), {
    readOnly: true
  });
  try {
    const row = database
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get("schema_version") as { readonly value: string } | undefined;
    if (row === undefined) {
      throw new Error("Expected schema version metadata.");
    }
    return row.value;
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

describe("v0.15 direct hierarchy service", () => {
  it("reads bounded direct parents and children from the active generation without mutation", async () => {
    const projectPath = await createInlineProject({
      "src/base.ts": "export class Base {}\n",
      "src/contracts.ts": [
        "export interface Contract {}",
        "export type Alias = { value: string };",
        ""
      ].join("\n"),
      "src/children.ts": [
        'import { Base } from "./base";',
        'import type { Contract, Alias } from "./contracts";',
        "export class ChildOne extends Base implements Contract, Alias {}",
        "export class ChildTwo extends Base {}",
        "export class ChildThree extends Base {}",
        "export interface Nested extends Contract {}",
        "export class Missing extends Unresolved {}",
        ""
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const initialGenerationId = (await service.getStatus(projectPath)).generationId;
    const persistedChildrenFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/children.ts");
    expect(persistedChildrenFacts?.pendingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationKind: "extends", referenceName: "Base" }),
        expect.objectContaining({ relationKind: "implements", referenceName: "Contract" })
      ])
    );
    expect(persistedChildrenFacts?.importBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ localName: "Contract", isTypeOnly: true })
      ])
    );

    const base = await service.hierarchy(projectPath, "src/base.ts#Base", { limit: 2 });
    const childOne = await service.hierarchy(projectPath, "src/children.ts#ChildOne", { limit: 2 });
    const nested = await service.hierarchy(projectPath, "src/children.ts#Nested");
    const missing = await service.hierarchy(projectPath, "src/children.ts#Missing");

    expect(base).toMatchObject({
      status: { generationId: initialGenerationId, stale: false },
      bounds: { limit: 2, maximumLimit: MAX_HIERARCHY_LIMIT },
      parents: [],
      childrenTruncated: true,
      parentsTruncated: false
    });
    expect(base.children.map((relation) => relation.child.name)).toEqual(["ChildOne", "ChildTwo"]);
    expect(base.children.every((relation) => relation.relation === "extends")).toBe(true);
    expect(childOne).toMatchObject({
      bounds: { limit: 2, maximumLimit: MAX_HIERARCHY_LIMIT },
      parentsTruncated: true,
      childrenTruncated: false
    });
    expect(childOne.parents.map((relation) => [relation.relation, relation.parent?.name ?? null])).toEqual([
      ["extends", "Base"],
      ["implements", "Contract"]
    ]);
    expect(nested.parents).toMatchObject([
      { relation: "extends", parent: { name: "Contract", kind: "interface" } }
    ]);
    expect(missing.parents).toMatchObject([
      {
        relation: "extends",
        parent: null,
        edge: { resolution: "unresolved", evidence: { ruleId: "heritage.extends.unresolved-target" } }
      }
    ]);

    const defaultBound = await service.hierarchy(projectPath, "src/base.ts#Base");
    expect(defaultBound.bounds).toEqual({
      limit: DEFAULT_HIERARCHY_LIMIT,
      maximumLimit: MAX_HIERARCHY_LIMIT
    });
    expect(defaultBound.children.map((relation) => relation.child.name)).toEqual([
      "ChildOne",
      "ChildTwo",
      "ChildThree"
    ]);

    await writeFile(
      join(projectPath, "src", "children.ts"),
      'import { Base } from "./base"; export class LiveOnly extends Base {}\n',
      "utf8"
    );
    const stale = await service.hierarchy(projectPath, "src/base.ts#Base");
    expect(stale).toMatchObject({
      status: { generationId: initialGenerationId, stale: true, staleReasons: ["source-files-changed"] }
    });
    expect(stale.children.map((relation) => relation.child.name)).toEqual([
      "ChildOne",
      "ChildTwo",
      "ChildThree"
    ]);
    expect(stale.children.map((relation) => relation.child.name)).not.toContain("LiveOnly");
    expect((await service.getStatus(projectPath)).generationId).toBe(initialGenerationId);

    await expect(service.hierarchy(projectPath, "src/base.ts#Base", { limit: 0 })).rejects.toMatchObject({
      code: "INVALID_HIERARCHY_LIMIT"
    });
    await expect(
      service.hierarchy(projectPath, "src/base.ts#Base", { limit: MAX_HIERARCHY_LIMIT + 1 })
    ).rejects.toMatchObject({ code: "INVALID_HIERARCHY_LIMIT" });
  });
});

describe("SymbolLatticeService", () => {
  it("keeps graph reads compatible with a v0.3 GraphStore adapter", async () => {
    const projectPath = await createFixtureProject();
    const service = new SymbolLatticeService(
      createV03GraphStore(new SqliteGraphStore()),
      new FileSystemSourceCatalog()
    );

    const initialStatus = await service.init({ projectPath });

    await expect(service.getStatus(projectPath)).resolves.toMatchObject({
      initialized: true,
      stale: false,
      staleReasons: []
    });
    await expect(service.find(projectPath, "add")).resolves.toMatchObject({
      symbols: [expect.objectContaining({ name: "add" })]
    });
    await expect(service.search(projectPath, "add")).rejects.toMatchObject({
      code: "SOURCE_SEARCH_UNAVAILABLE"
    });
    await expect(service.affectedTests(projectPath, ["src/math.ts"])).resolves.toMatchObject({
      inputs: { indexed: ["src/math.ts"], notIndexed: [] },
      completeness: { completeForActiveGeneration: true }
    });
    await expect(service.sync({ projectPath })).resolves.toMatchObject({
      generationId: initialStatus.generationId,
      stale: false,
      staleReasons: []
    });
    await rm(join(projectPath, "src", "math.ts"));
    await expect(service.explore(projectPath, "src/math.ts#add")).resolves.toMatchObject({
      status: { stale: true, staleReasons: ["source-files-changed"] },
      match: { status: "exact" },
      source: null,
      sourceAvailability: "unavailable"
    });
  });

  it("reports retained-generation history as unavailable on a legacy GraphStore adapter", async () => {
    const projectPath = await createFixtureProject();
    const service = new SymbolLatticeService(
      createV03GraphStore(new SqliteGraphStore()),
      new FileSystemSourceCatalog()
    );
    await service.init({ projectPath });

    await expect(service.history(projectPath)).rejects.toMatchObject({
      code: "GENERATION_HISTORY_UNAVAILABLE"
    });
    await expect(service.diff(projectPath, "generation:missing")).rejects.toMatchObject({
      code: "GENERATION_HISTORY_UNAVAILABLE"
    });
  });

  it("uses exactly one atomic comparison bundle for a retained-generation diff", async () => {
    const projectPath = resolve("C:/symbol-lattice-race-project");
    const fromGenerationId = "generation:from";
    const toGenerationId = "generation:to";
    const { graphStore, comparisonRequests } = createAtomicComparisonOnlyGraphStore(
      raceGenerationComparisonBundle(fromGenerationId, toGenerationId)
    );
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const result = await service.diff(projectPath, fromGenerationId);

    expect(comparisonRequests).toEqual([
      {
        projectPath,
        fromGenerationId,
        toGenerationId: undefined
      }
    ]);
    expect(result).toMatchObject({
      activeStatus: { generationId: toGenerationId },
      from: { generationId: fromGenerationId },
      to: { generationId: toGenerationId },
      files: {
        added: { items: [expect.objectContaining({ path: "src/to.ts" })] },
        removed: { items: [expect.objectContaining({ path: "src/from.ts" })] }
      }
    });
  });

  it("lists bounded immutable history and compares explicit or active retained generations", async () => {
    const projectPath = await createInlineProject({
      "src/value.ts": "export const value = 1;\n"
    });
    const service = createService();
    const first = await service.init({ projectPath });
    const firstGenerationId = first.generationId;
    if (firstGenerationId === null) {
      throw new Error("Initial index must publish a generation.");
    }

    await writeFile(join(projectPath, "src", "value.ts"), "export const value = 2;\n", "utf8");
    const second = await service.sync({ projectPath });
    const secondGenerationId = second.generationId;
    if (secondGenerationId === null) {
      throw new Error("Synchronized index must publish a generation.");
    }

    // This live-only change must make active freshness stale without changing
    // either immutable retained generation or causing a synchronization.
    await writeFile(join(projectPath, "src", "value.ts"), "export const value = 3;\n", "utf8");

    const history = await service.history(projectPath, { limit: 1 });
    const defaultDiff = await service.diff(projectPath, firstGenerationId);
    const explicitReverseDiff = await service.diff(projectPath, secondGenerationId, {
      toGenerationId: firstGenerationId,
      limit: 1
    });
    const afterReads = await service.getStatus(projectPath);

    expect(history).toMatchObject({
      activeStatus: { generationId: secondGenerationId, stale: true },
      bounds: { limit: 1, maximumLimit: MAX_GENERATION_HISTORY_LIMIT },
      retention: { retained: 2, returned: 1, truncated: true },
      generations: [
        expect.objectContaining({
          generationId: secondGenerationId,
          counts: second.counts,
          indexWork: second.lastIndexWork ?? null,
          extractorVersion: expect.any(String),
          resolverVersion: expect.any(String)
        })
      ]
    });
    expect(history.retention.capacity).toBeGreaterThanOrEqual(2);
    expect(defaultDiff).toMatchObject({
      activeStatus: { generationId: secondGenerationId, stale: true },
      from: { generationId: firstGenerationId },
      to: { generationId: secondGenerationId },
      files: {
        modified: {
          items: [expect.objectContaining({ path: "src/value.ts" })],
          truncated: false
        }
      }
    });
    expect(explicitReverseDiff).toMatchObject({
      bounds: { limit: 1, maximumLimit: MAX_GENERATION_DIFF_LIMIT },
      from: { generationId: secondGenerationId },
      to: { generationId: firstGenerationId },
      files: {
        modified: { items: [expect.objectContaining({ path: "src/value.ts" })] }
      }
    });
    expect(afterReads).toMatchObject({ generationId: secondGenerationId, stale: true });
  });

  it("validates history and diff bounds, IDs, retained selection, and comparison direction", async () => {
    const projectPath = await createInlineProject({
      "src/value.ts": "export const value = 1;\n"
    });
    const service = createService();
    const initial = await service.init({ projectPath });
    const generationId = initial.generationId;
    if (generationId === null) {
      throw new Error("Initial index must publish a generation.");
    }

    await expect(
      service.history(projectPath, { limit: MAX_GENERATION_HISTORY_LIMIT + 1 })
    ).rejects.toMatchObject({ code: "INVALID_GENERATION_HISTORY_LIMIT" });
    await expect(
      service.diff(projectPath, generationId, { limit: MAX_GENERATION_DIFF_LIMIT + 1 })
    ).rejects.toMatchObject({ code: "INVALID_GENERATION_DIFF_LIMIT" });
    await expect(service.diff(projectPath, " ")).rejects.toMatchObject({
      code: "INVALID_GENERATION_ID"
    });
    await expect(
      service.diff(projectPath, generationId, { toGenerationId: generationId })
    ).rejects.toMatchObject({ code: "INVALID_GENERATION_COMPARISON" });
    await expect(service.diff(projectPath, "generation:not-retained")).rejects.toMatchObject({
      code: "GENERATION_NOT_RETAINED"
    });
  });

  it("indexes a TS/JS project, resolves direct graph facts, and detects staleness", async () => {
    const projectPath = await createFixtureProject();
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const initialStatus = await service.init({ projectPath });
    expect(initialStatus).toMatchObject({
      initialized: true,
      stale: false,
      staleReasons: [],
      generationId: expect.any(String),
      counts: { files: 3 }
    });
    expect(graphStore.getArtifactFacts(projectPath)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/math.ts",
          language: "typescript",
          extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
          contentHash: expect.any(String),
          symbols: expect.arrayContaining([expect.objectContaining({ name: "add" })]),
          importBindings: expect.any(Array),
          exportBindings: expect.any(Array)
        })
      ])
    );

    const add = await service.find(projectPath, "add");
    const addSymbol = add.symbols.find((symbol) => symbol.name === "add");
    expect(addSymbol).toBeDefined();

    const callers = await service.callers(projectPath, addSymbol?.qualifiedName ?? "missing");
    expect(callers.relations.map((relation) => relation.symbol.name)).toEqual(
      expect.arrayContaining(["calculate", "increment"])
    );
    expect(callers.relations.every((relation) => relation.edge.confidence > 0)).toBe(true);

    const callerRelation = callers.relations.find((relation) => relation.symbol.name === "calculate");
    expect(callerRelation).toBeDefined();
    const edgeExplanation = await service.explainEdge(
      projectPath,
      callerRelation?.edge.id ?? "missing-edge"
    );
    expect(edgeExplanation).toMatchObject({
      edge: {
        id: callerRelation?.edge.id,
        evidence: expect.objectContaining({ ruleId: expect.any(String) })
      },
      source: { name: "calculate" },
      target: { name: "add" }
    });

    const exploration = await service.explore(projectPath, addSymbol?.qualifiedName ?? "missing");
    expect(exploration.source).toMatchObject({ filePath: "src/math.ts" });
    expect(exploration.source?.lines.map((line) => line.text).join("\n")).toContain("function add");

    await writeFile(join(projectPath, "src", "math.ts"), "export const changed = true;", "utf8");
    expect((await service.getStatus(projectPath)).stale).toBe(true);
    await expect(service.affectedTests(projectPath, ["src/math.ts"])).resolves.toMatchObject({
      status: { stale: true },
      completeness: {
        completeForActiveGeneration: false,
        limitations: ["index-stale"]
      }
    });
    expect((await service.sync({ projectPath })).stale).toBe(false);
  });

  it("reports unavailable when the active generation has no matching source document", async () => {
    const projectPath = await createInlineProject({
      "src/missing-document.ts": 'export const persistedSymbol = "live source";\n'
    });
    const service = new SymbolLatticeService(
      createMissingSourceDocumentGraphStore(new SqliteGraphStore()),
      new FileSystemSourceCatalog()
    );
    await service.init({ projectPath });

    await expect(
      service.explore(projectPath, "src/missing-document.ts#persistedSymbol")
    ).resolves.toMatchObject({
      status: { stale: false },
      match: { status: "exact" },
      source: null,
      sourceAvailability: "unavailable"
    });
  });

  it("assembles bounded multi-symbol context with persisted source and directed proof paths", async () => {
    const projectPath = await createInlineProject({
      "src/entry.ts": [
        'import { middle } from "./middle.js";',
        "",
        "export function entry(): string {",
        "  return middle();",
        "}",
        ""
      ].join("\n"),
      "src/middle.ts": [
        'import { target } from "./target.js";',
        "",
        "export function middle(): string {",
        "  return target();",
        "}",
        ""
      ].join("\n"),
      "src/alternate.ts": [
        'import { target } from "./target.js";',
        "",
        "export function alternate(): string {",
        "  return target();",
        "}",
        ""
      ].join("\n"),
      "src/target.ts": ["export function target(): string {", '  return "indexed target";', "}", ""].join(
        "\n"
      )
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.context(
      projectPath,
      ["src/entry.ts#entry", "src/target.ts#target"],
      { relationLimit: 1, maxHops: 2, impactDepth: 2, impactLimit: 1 }
    );

    expect(result).toMatchObject({
      status: { stale: false },
      bounds: {
        maxReferences: 8,
        matchCandidateLimit: 25,
        relationLimit: 1,
        maxHops: 2,
        maxVisitedSymbolsPerPath: 500,
        impactDepth: 2,
        impactLimit: 1
      },
      contexts: [
        {
          reference: "src/entry.ts#entry",
          match: { status: "exact", symbol: { name: "entry" } },
          sourceAvailability: "active-generation",
          source: { filePath: "src/entry.ts" }
        },
        {
          reference: "src/target.ts#target",
          match: { status: "exact", symbol: { name: "target" } },
          sourceAvailability: "active-generation",
          source: { filePath: "src/target.ts" },
          callers: { items: [expect.any(Object)], truncated: true },
          impact: { paths: [expect.any(Object)], truncated: true }
        }
      ],
      evidencePaths: [
        {
          fromReference: "src/entry.ts#entry",
          toReference: "src/target.ts#target",
          status: "path",
          path: {
            symbols: [{ name: "entry" }, { name: "middle" }, { name: "target" }],
            edges: [
              { kind: "calls", resolution: "exact" },
              { kind: "calls", resolution: "exact" }
            ]
          }
        }
      ]
    });

    const unboundedImpact = await service.impact(projectPath, "src/target.ts#target", 2);
    const boundedImpact = await service.impact(projectPath, "src/target.ts#target", {
      maxDepth: 2,
      limit: 1
    });
    expect(unboundedImpact).not.toHaveProperty("truncated");
    expect(boundedImpact).toMatchObject({
      paths: unboundedImpact.paths.slice(0, 1),
      truncated: true
    });
  });

  it("selects affected conventionally named test files from exact active-generation file evidence", async () => {
    const projectPath = await createInlineProject({
      "src/math.ts": [
        "export function add(left: number, right: number): number {",
        "  return left + right;",
        "}",
        ""
      ].join("\n"),
      "src/index.ts": ['export { add } from "./math.js";', ""].join("\n"),
      "test/direct.test.ts": [
        'import { add } from "../src/math.js";',
        "export const direct = add(1, 2);",
        ""
      ].join("\n"),
      "tests/barrel.spec.ts": [
        'import { add } from "../src/index.js";',
        "export const barrel = add(2, 3);",
        ""
      ].join("\n"),
      "test/changed.test.ts": [
        "export const changedTest = true;",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.affectedTests(
      projectPath,
      ["src\\math.ts", "src/missing.ts", "test/changed.test.ts"],
      { maxDepth: 2, limit: 10 }
    );

    expect(result).toMatchObject({
      status: { stale: false },
      bounds: {
        maxChangedFiles: 50,
        maxDepth: 2,
        limit: 10,
        maxVisitedFilesPerInput: 500,
        edgeKinds: ["imports", "exports"],
        resolution: "exact"
      },
      indexScope: ["."],
      indexedTestFiles: 3,
      inputs: {
        requested: ["src/math.ts", "src/missing.ts", "test/changed.test.ts"],
        indexed: ["src/math.ts", "test/changed.test.ts"],
        notIndexed: ["src/missing.ts"]
      },
      tests: {
        resultLimitTruncated: false,
        traversalTruncated: false,
        depthLimitReached: false,
        items: [
          expect.objectContaining({
            triggerFilePath: "src/math.ts",
            filePath: "test/direct.test.ts",
            reason: "exact-dependent",
            classification: "test-directory",
            path: expect.objectContaining({ edges: [expect.objectContaining({ kind: "imports", resolution: "exact" })] })
          }),
          expect.objectContaining({
            triggerFilePath: "src/math.ts",
            filePath: "tests/barrel.spec.ts",
            reason: "exact-dependent",
            classification: "test-directory",
            path: expect.objectContaining({ edges: [expect.objectContaining({ kind: "exports" }), expect.objectContaining({ kind: "imports" })] })
          }),
          expect.objectContaining({
            triggerFilePath: "test/changed.test.ts",
            filePath: "test/changed.test.ts",
            reason: "changed-test",
            classification: "test-directory",
            path: expect.objectContaining({ edges: [] })
          })
        ]
      },
      completeness: {
        completeForActiveGeneration: false,
        limitations: ["input-not-indexed"]
      }
    });

    const depthBounded = await service.affectedTests(projectPath, ["src/math.ts"], {
      maxDepth: 1,
      limit: 10
    });
    expect(depthBounded).toMatchObject({
      tests: { depthLimitReached: true },
      completeness: {
        completeForActiveGeneration: false,
        limitations: ["depth-limit-reached"]
      }
    });

    await expect(
      service.affectedTests(projectPath, [join(projectPath, "src", "math.ts")])
    ).resolves.toMatchObject({
      inputs: { requested: ["src/math.ts"], indexed: ["src/math.ts"], notIndexed: [] }
    });

    await expect(service.affectedTests(projectPath, [])).rejects.toMatchObject({
      code: "INVALID_AFFECTED_FILES"
    });
    await expect(
      service.affectedTests(projectPath, ["src/math.ts"], { maxDepth: 9 })
    ).rejects.toMatchObject({ code: "INVALID_AFFECTED_DEPTH" });
    await expect(
      service.affectedTests(projectPath, ["src/math.ts"], { limit: 101 })
    ).rejects.toMatchObject({ code: "INVALID_AFFECTED_LIMIT" });
  });

  it("delegates Git change-set selection to the injected port, then retains exact affected-test evidence", async () => {
    const projectPath = await createInlineProject({
      "src/math.ts": [
        "export function add(left: number, right: number): number {",
        "  return left + right;",
        "}",
        ""
      ].join("\n"),
      "test/math.test.ts": [
        'import { add } from "../src/math.js";',
        "export const testResult = add(1, 2);",
        ""
      ].join("\n")
    });
    const calls: Array<{ projectPath: string; request: unknown }> = [];
    const provider: GitChangeSetProvider = {
      async getChangeSet(projectPath_, request) {
        calls.push({ projectPath: projectPath_, request });
        return {
          ...gitChangeSet(["src/math.ts"]),
          ...(request.mode === "base"
            ? {
                requestedBaseRef: request.baseRef,
                mergeBaseCommit: "b".repeat(40),
                includesUntracked: false
              }
            : {})
        };
      }
    };
    const service = new SymbolLatticeService(
      new SqliteGraphStore(),
      new FileSystemSourceCatalog(),
      undefined,
      provider
    );
    await service.init({ projectPath });
    const before = await service.getStatus(projectPath);

    const workingTree = await service.affectedTestsFromGit(projectPath, {
      maxDepth: 2,
      limit: 10
    });
    const fromBase = await service.affectedTestsFromGit(projectPath, { baseRef: "origin/main" });
    const after = await service.getStatus(projectPath);

    expect(service.gitAffectedTestsAvailable()).toBe(true);
    expect(calls).toEqual([
      { projectPath, request: { mode: "working-tree" } },
      { projectPath, request: { mode: "base", baseRef: "origin/main" } }
    ]);
    expect(workingTree).toMatchObject({
      status: { generationId: before.generationId, stale: false },
      changeSet: { sourcePaths: ["src/math.ts"], includesUntracked: true },
      affected: {
        inputs: { requested: ["src/math.ts"], indexed: ["src/math.ts"], notIndexed: [] },
        tests: {
          items: [
            expect.objectContaining({
              filePath: "test/math.test.ts",
              reason: "exact-dependent",
              path: expect.objectContaining({
                edges: [expect.objectContaining({ kind: "imports", resolution: "exact" })]
              })
            })
          ]
        },
        completeness: { completeForActiveGeneration: true, limitations: [] }
      }
    });
    expect(fromBase).toMatchObject({
      changeSet: {
        requestedBaseRef: "origin/main",
        mergeBaseCommit: "b".repeat(40),
        includesUntracked: false
      }
    });
    expect(after.generationId).toBe(before.generationId);
  });

  it("keeps no-source Git changes explicit without inventing an affected-test traversal", async () => {
    const projectPath = await createInlineProject({
      "src/math.ts": "export const add = (left: number, right: number) => left + right;\n"
    });
    const provider: GitChangeSetProvider = {
      async getChangeSet() {
        return gitChangeSet([], [
          { kind: "modified", previousPath: "README.md", currentPath: "README.md", score: null }
        ]);
      }
    };
    const service = new SymbolLatticeService(
      new SqliteGraphStore(),
      new FileSystemSourceCatalog(),
      undefined,
      provider
    );
    await service.init({ projectPath });

    await expect(service.affectedTestsFromGit(projectPath)).resolves.toMatchObject({
      status: { stale: false },
      changeSet: { changes: [{ currentPath: "README.md" }], sourcePaths: [] },
      affected: null
    });
  });

  it("preserves whitespace-bearing Git paths before exact graph lookup", async () => {
    const projectPath = await createInlineProject({
      " src/math.ts": "export const add = (left: number, right: number) => left + right;\n",
      "test/math.test.ts": [
        'import { add } from "../ src/math.js";',
        "export const testResult = add(1, 2);",
        ""
      ].join("\n")
    });
    const provider: GitChangeSetProvider = {
      async getChangeSet() {
        return gitChangeSet([" src/math.ts"]);
      }
    };
    const service = new SymbolLatticeService(
      new SqliteGraphStore(),
      new FileSystemSourceCatalog(),
      undefined,
      provider
    );
    await service.init({ projectPath });

    const result = await service.affectedTestsFromGit(projectPath);

    expect(result.affected).toMatchObject({
      inputs: {
        requested: [" src/math.ts"],
        indexed: [" src/math.ts"],
        notIndexed: []
      },
      tests: {
        items: [expect.objectContaining({ filePath: "test/math.test.ts", reason: "exact-dependent" })]
      }
    });
  });

  it("makes Git selection availability, base validation, port errors, and source caps actionable", async () => {
    const projectPath = await createInlineProject({
      "src/math.ts": "export const add = (left: number, right: number) => left + right;\n"
    });
    const unavailable = createService();
    expect(unavailable.gitAffectedTestsAvailable()).toBe(false);
    await expect(unavailable.affectedTestsFromGit(projectPath)).rejects.toMatchObject({
      code: "GIT_CHANGE_SET_UNAVAILABLE"
    });

    const provider: GitChangeSetProvider = {
      async getChangeSet() {
        throw new GitChangeSetError("GIT_UNAVAILABLE", "Git executable was not found.");
      }
    };
    const service = new SymbolLatticeService(
      new SqliteGraphStore(),
      new FileSystemSourceCatalog(),
      undefined,
      provider
    );
    await expect(service.affectedTestsFromGit(projectPath, { baseRef: " origin/main" })).rejects.toEqual(
      expect.objectContaining<Partial<SymbolLatticeError>>({ code: "INVALID_GIT_BASE_REF" })
    );
    await expect(service.affectedTestsFromGit(projectPath)).rejects.toEqual(
      expect.objectContaining<Partial<SymbolLatticeError>>({ code: "GIT_CHANGE_SET_UNAVAILABLE" })
    );

    const oversized: GitChangeSetProvider = {
      async getChangeSet() {
        return gitChangeSet(
          Array.from({ length: 51 }, (_value, index) => `src/changed-${index}.ts`)
        );
      }
    };
    const oversizedService = new SymbolLatticeService(
      new SqliteGraphStore(),
      new FileSystemSourceCatalog(),
      undefined,
      oversized
    );
    await expect(oversizedService.affectedTestsFromGit(projectPath)).rejects.toMatchObject({
      code: "INVALID_AFFECTED_FILES"
    });
  });

  it("attributes immutable Git base/head hunk sides without reading an active graph or live source", async () => {
    const projectPath = await createInlineProject({
      "src/calculation.ts": "export const liveOnly = true;\n"
    });
    const baseSourceText = [
      "export function calculate(value: number): number {",
      "  return value + 1;",
      "}",
      ""
    ].join("\n");
    const headSourceText = [
      "export function calculate(value: number): number {",
      "  return value + 2;",
      "}",
      ""
    ].join("\n");
    let graphStoreReads = 0;
    let sourceCatalogReads = 0;
    const graphStore = new Proxy({} as GraphStore, {
      get() {
        graphStoreReads += 1;
        throw new Error("gitHunks must not read GraphStore.");
      }
    });
    const sourceCatalog = new Proxy({} as FileSystemSourceCatalog, {
      get() {
        sourceCatalogReads += 1;
        throw new Error("gitHunks must not read SourceCatalog.");
      }
    });
    const extractorInputs: Array<{ filePath: string; sourceText: string; language: string }> = [];
    const providerCalls: Array<{ projectPath: string; request: unknown }> = [];
    const provider: GitRevisionHunkProvider = {
      async getRevisionHunks(projectPath_, request) {
        providerCalls.push({ projectPath: projectPath_, request });
        return gitRevisionHunkSet([
          {
            change: {
              kind: "modified",
              previousPath: "src/calculation.ts",
              currentPath: "src/calculation.ts",
              score: null
            },
            hunks: [{ oldRange: { start: 2, count: 1 }, newRange: { start: 2, count: 1 } }],
            previous: {
              revision: "b".repeat(40),
              filePath: "src/calculation.ts",
              language: "typescript",
              availability: "available",
              sourceText: baseSourceText
            },
            current: {
              revision: "h".repeat(40),
              filePath: "src/calculation.ts",
              language: "typescript",
              availability: "available",
              sourceText: headSourceText
            }
          }
        ]);
      }
    };
    const service = new SymbolLatticeService(
      graphStore,
      sourceCatalog,
      (input) => {
        extractorInputs.push(input);
        return extractFileFacts(input);
      },
      undefined,
      provider
    );

    const result = await service.gitHunks(projectPath, "origin/main");

    expect(service.gitHunksAvailable()).toBe(true);
    expect(providerCalls).toEqual([
      {
        projectPath,
        request: { baseRef: "origin/main", maxSourceFiles: MAX_GIT_HUNK_SOURCE_FILES }
      }
    ]);
    expect(extractorInputs).toEqual([
      { filePath: "src/calculation.ts", sourceText: baseSourceText, language: "typescript" },
      { filePath: "src/calculation.ts", sourceText: headSourceText, language: "typescript" }
    ]);
    expect(graphStoreReads).toBe(0);
    expect(sourceCatalogReads).toBe(0);
    expect(result).toMatchObject({
      changeSet: {
        requestedBaseRef: "origin/main",
        mergeBaseCommit: "b".repeat(40),
        headCommit: "h".repeat(40)
      },
      bounds: {
        maxSourceFiles: MAX_GIT_HUNK_SOURCE_FILES,
        maxDeclarationAnchorsPerSide: MAX_GIT_HUNK_DECLARATION_ANCHORS,
        limit: DEFAULT_GIT_HUNK_LIMIT,
        maximumLimit: MAX_GIT_HUNK_LIMIT
      },
      hunks: {
        total: 1,
        truncated: false,
        items: [
          {
            change: {
              kind: "modified",
              previousPath: "src/calculation.ts",
              currentPath: "src/calculation.ts"
            },
            hunk: { oldRange: { start: 2, count: 1 }, newRange: { start: 2, count: 1 } },
            old: {
              revision: "b".repeat(40),
              path: "src/calculation.ts",
              sourceAvailability: "available",
              lineRange: { start: 2, count: 1 },
              attribution: "declaration",
              declarationAnchors: {
                identityScope: "revision-local",
                total: 1,
                truncated: false,
                items: [expect.objectContaining({ name: "calculate", kind: "function" })]
              }
            },
            new: {
              revision: "h".repeat(40),
              path: "src/calculation.ts",
              sourceAvailability: "available",
              lineRange: { start: 2, count: 1 },
              attribution: "declaration",
              declarationAnchors: {
                identityScope: "revision-local",
                total: 1,
                truncated: false,
                items: [expect.objectContaining({ name: "calculate", kind: "function" })]
              }
            }
          }
        ]
      }
    });
    expect(result).not.toHaveProperty("status");
  });

  it("makes Git hunk capability, mandatory base, and output bounds explicit", async () => {
    const projectPath = await createInlineProject({ "src/math.ts": "export const current = 1;\n" });
    const unavailable = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    expect(unavailable.gitHunksAvailable()).toBe(false);
    await expect(unavailable.gitHunks(projectPath, "origin/main")).rejects.toMatchObject({
      code: "GIT_HUNKS_UNAVAILABLE"
    });

    const provider: GitRevisionHunkProvider = {
      async getRevisionHunks() {
        return gitRevisionHunkSet([]);
      }
    };
    const service = new SymbolLatticeService(
      new SqliteGraphStore(),
      new FileSystemSourceCatalog(),
      undefined,
      undefined,
      provider
    );

    await expect(service.gitHunks(projectPath, "")).rejects.toMatchObject({
      code: "INVALID_GIT_BASE_REF"
    });
    await expect(service.gitHunks(projectPath, " origin/main")).rejects.toMatchObject({
      code: "INVALID_GIT_BASE_REF"
    });
    await expect(service.gitHunks(projectPath, "origin/main", { limit: 0 })).rejects.toMatchObject({
      code: "INVALID_GIT_HUNK_LIMIT"
    });
    await expect(
      service.gitHunks(projectPath, "origin/main", { limit: MAX_GIT_HUNK_LIMIT + 1 })
    ).rejects.toMatchObject({ code: "INVALID_GIT_HUNK_LIMIT" });
  });

  it("maps immutable Git hunk port failures without falling back to the active graph", async () => {
    const projectPath = await createInlineProject({ "src/math.ts": "export const current = 1;\n" });
    const cases = [
      ["GIT_UNAVAILABLE", "GIT_HUNKS_UNAVAILABLE"],
      ["INVALID_GIT_BASE", "INVALID_GIT_BASE_REF"],
      ["MALFORMED_GIT_OUTPUT", "GIT_HUNKS_MALFORMED"],
      ["GIT_CHANGE_SET_TOO_LARGE", "INVALID_GIT_HUNK_FILES"]
    ] as const;

    for (const [portCode, applicationCode] of cases) {
      const provider: GitRevisionHunkProvider = {
        async getRevisionHunks() {
          throw new GitChangeSetError(portCode, "provider fixture failure");
        }
      };
      const service = new SymbolLatticeService(
        new SqliteGraphStore(),
        new FileSystemSourceCatalog(),
        undefined,
        undefined,
        provider
      );

      await expect(service.gitHunks(projectPath, "origin/main")).rejects.toMatchObject({
        code: applicationCode
      });
    }
  });

  it("keeps immutable addition and deletion sides explicit while globally bounding deterministic hunks", async () => {
    const projectPath = await createInlineProject({ "src/live.ts": "export const live = true;\n" });
    const added = {
      change: { kind: "added" as const, previousPath: null, currentPath: "src/alpha.ts", score: null },
      hunks: [{ oldRange: { start: 0, count: 0 }, newRange: { start: 1, count: 1 } }],
      previous: {
        revision: "b".repeat(40),
        filePath: null,
        language: null,
        availability: "absent" as const
      },
      current: {
        revision: "h".repeat(40),
        filePath: "src/alpha.ts",
        language: "typescript" as const,
        availability: "available" as const,
        sourceText: "export const alpha = 1;\n"
      }
    };
    const modified = {
      change: {
        kind: "modified" as const,
        previousPath: "src/beta.ts",
        currentPath: "src/beta.ts",
        score: null
      },
      hunks: [
        { oldRange: { start: 2, count: 1 }, newRange: { start: 2, count: 1 } },
        { oldRange: { start: 1, count: 1 }, newRange: { start: 1, count: 1 } }
      ],
      previous: {
        revision: "b".repeat(40),
        filePath: "src/beta.ts",
        language: "typescript" as const,
        availability: "available" as const,
        sourceText: ["export function beta() {", "  return 1;", "}", ""].join("\n")
      },
      current: {
        revision: "h".repeat(40),
        filePath: "src/beta.ts",
        language: "typescript" as const,
        availability: "available" as const,
        sourceText: ["export function beta() {", "  return 2;", "}", ""].join("\n")
      }
    };
    const deleted = {
      change: { kind: "deleted" as const, previousPath: "src/gamma.ts", currentPath: null, score: null },
      hunks: [{ oldRange: { start: 1, count: 1 }, newRange: { start: 0, count: 0 } }],
      previous: {
        revision: "b".repeat(40),
        filePath: "src/gamma.ts",
        language: "typescript" as const,
        availability: "available" as const,
        sourceText: "export const gamma = 1;\n"
      },
      current: {
        revision: "h".repeat(40),
        filePath: null,
        language: null,
        availability: "absent" as const
      }
    };
    let reverseOrder = false;
    const provider: GitRevisionHunkProvider = {
      async getRevisionHunks() {
        reverseOrder = !reverseOrder;
        return gitRevisionHunkSet(
          reverseOrder ? [deleted, modified, added] : [added, modified, deleted]
        );
      }
    };
    const service = new SymbolLatticeService(
      new SqliteGraphStore(),
      new FileSystemSourceCatalog(),
      undefined,
      undefined,
      provider
    );

    const complete = await service.gitHunks(projectPath, "origin/main", { limit: MAX_GIT_HUNK_LIMIT });
    const firstBounded = await service.gitHunks(projectPath, "origin/main", { limit: 2 });
    const secondBounded = await service.gitHunks(projectPath, "origin/main", { limit: 2 });
    const addition = complete.hunks.items.find((item) => item.change.kind === "added");
    const deletion = complete.hunks.items.find((item) => item.change.kind === "deleted");

    expect(complete.hunks).toMatchObject({ total: 4, truncated: false });
    expect(addition).toMatchObject({
      old: {
        revision: "b".repeat(40),
        path: null,
        sourceAvailability: "absent",
        lineRange: { start: 0, count: 0 },
        attribution: "not-applicable",
        declarationAnchors: { identityScope: "revision-local", items: [], total: 0, truncated: false }
      },
      new: {
        revision: "h".repeat(40),
        path: "src/alpha.ts",
        sourceAvailability: "available",
        attribution: "declaration"
      }
    });
    expect(deletion).toMatchObject({
      old: {
        revision: "b".repeat(40),
        path: "src/gamma.ts",
        sourceAvailability: "available",
        attribution: "declaration"
      },
      new: {
        revision: "h".repeat(40),
        path: null,
        sourceAvailability: "absent",
        lineRange: { start: 0, count: 0 },
        attribution: "not-applicable",
        declarationAnchors: { identityScope: "revision-local", items: [], total: 0, truncated: false }
      }
    });
    expect(firstBounded.hunks).toMatchObject({ total: 4, truncated: true });
    expect(firstBounded.hunks.items).toHaveLength(2);
    expect(firstBounded.hunks.items.map((item) => item.change.kind)).toEqual(["added", "modified"]);
    expect(secondBounded.hunks).toEqual(firstBounded.hunks);
  });

  it("continues through a test-directory helper before judging active-generation completeness", async () => {
    const projectPath = await createInlineProject({
      "src/math.ts": ["export const add = (left: number, right: number) => left + right;", ""].join("\n"),
      "test/helpers.ts": [
        'import { add } from "../src/math.js";',
        "export const helper = () => add(1, 2);",
        ""
      ].join("\n"),
      "test/subject.test.ts": [
        'import { helper } from "./helpers.js";',
        "export const subject = helper();",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.affectedTests(projectPath, ["src/math.ts"], {
      maxDepth: 2,
      limit: 10
    });

    expect(result).toMatchObject({
      tests: {
        items: [
          expect.objectContaining({ filePath: "test/helpers.ts" }),
          expect.objectContaining({
            filePath: "test/subject.test.ts",
            path: expect.objectContaining({
              edges: [
                expect.objectContaining({ kind: "imports", resolution: "exact" }),
                expect.objectContaining({ kind: "imports", resolution: "exact" })
              ]
            })
          })
        ],
        depthLimitReached: false,
        traversalTruncated: false,
        resultLimitTruncated: false
      },
      completeness: { completeForActiveGeneration: true, limitations: [] }
    });
  });

  it("keeps context graph-queryable when a legacy store cannot supply persisted source", async () => {
    const projectPath = await createFixtureProject();
    const service = new SymbolLatticeService(
      createV03GraphStore(new SqliteGraphStore()),
      new FileSystemSourceCatalog()
    );
    await service.init({ projectPath });

    const result = await service.context(projectPath, ["src/math.ts#add", "missing"]);

    expect(result).toMatchObject({
      contexts: [
        {
          match: { status: "exact", symbol: { name: "add" } },
          sourceAvailability: "unavailable",
          source: null
        },
        {
          match: { status: "not_found" },
          sourceAvailability: "not-applicable",
          source: null
        }
      ],
      evidencePaths: [{ status: "not-applicable", path: null }]
    });
  });

  it("caps ambiguous context candidates while keeping the ambiguity explicit", async () => {
    const projectPath = await createInlineProject(
      Object.fromEntries(
        Array.from({ length: 26 }, (_value, index) => [
          `src/duplicate-${index}.ts`,
          `export function duplicate(): number { return ${index}; }\n`
        ])
      )
    );
    const service = createService();
    await service.init({ projectPath });

    const result = await service.context(projectPath, ["duplicate"]);
    const context = result.contexts[0];

    expect(result.bounds.matchCandidateLimit).toBe(25);
    expect(context).toMatchObject({
      match: { status: "ambiguous" },
      matchCandidatesTruncated: true,
      sourceAvailability: "not-applicable"
    });
    expect(context?.match.candidates).toHaveLength(25);
  });

  it("returns a newer authoritative same-path source bundle without a redundant retry", async () => {
    const initialBundle = raceSourceDocumentsBundle(
      "generation:A",
      "src/stable.ts",
      'export function raceTarget() { return "A evidence"; }\n',
      []
    );
    const authoritativeBundle = raceSourceDocumentsBundle(
      "generation:B",
      "src/stable.ts",
      'export function raceTarget() { return "B evidence"; }\n'
    );
    const { graphStore, sourceDocumentRequests } = createSequencedSourceDocumentGraphStore(
      initialBundle,
      [authoritativeBundle]
    );
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const exploration = await service.explore("C:/symbol-lattice-race-project", "raceTarget");

    expect(exploration).toMatchObject({
      status: { generationId: "generation:B" },
      match: { status: "exact", symbol: { filePath: "src/stable.ts" } },
      sourceAvailability: "active-generation",
      source: { filePath: "src/stable.ts" }
    });
    expect(exploration.source?.lines.map((line) => line.text).join("\n")).toContain("B evidence");
    expect(sourceDocumentRequests).toEqual([["src/stable.ts"]]);
  });

  it("retries once with a moved exact symbol's authoritative path", async () => {
    const initialBundle = raceSourceDocumentsBundle(
      "generation:A",
      "src/before.ts",
      'export function raceTarget() { return "A evidence"; }\n',
      []
    );
    const movedBundleWithoutRequestedDocument = raceSourceDocumentsBundle(
      "generation:B",
      "src/after.ts",
      'export function raceTarget() { return "B evidence"; }\n',
      []
    );
    const movedBundleWithRequestedDocument = raceSourceDocumentsBundle(
      "generation:C",
      "src/after.ts",
      'export function raceTarget() { return "C evidence"; }\n'
    );
    const { graphStore, sourceDocumentRequests } = createSequencedSourceDocumentGraphStore(
      initialBundle,
      [movedBundleWithoutRequestedDocument, movedBundleWithRequestedDocument]
    );
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const exploration = await service.explore("C:/symbol-lattice-race-project", "raceTarget");

    expect(exploration).toMatchObject({
      status: { generationId: "generation:C" },
      match: { status: "exact", symbol: { filePath: "src/after.ts" } },
      sourceAvailability: "active-generation",
      source: { filePath: "src/after.ts" }
    });
    expect(exploration.source?.lines.map((line) => line.text).join("\n")).toContain("C evidence");
    expect(sourceDocumentRequests).toEqual([["src/before.ts"], ["src/after.ts"]]);
  });

  it("retries a context source bundle once when an exact symbol moves during sync", async () => {
    const initialBundle = raceSourceDocumentsBundle(
      "generation:A",
      "src/before.ts",
      'export function raceTarget() { return "A evidence"; }\n',
      []
    );
    const movedBundleWithoutRequestedDocument = raceSourceDocumentsBundle(
      "generation:B",
      "src/after.ts",
      'export function raceTarget() { return "B evidence"; }\n',
      []
    );
    const movedBundleWithRequestedDocument = raceSourceDocumentsBundle(
      "generation:C",
      "src/after.ts",
      'export function raceTarget() { return "C evidence"; }\n'
    );
    const { graphStore, sourceDocumentRequests } = createSequencedSourceDocumentGraphStore(
      initialBundle,
      [movedBundleWithoutRequestedDocument, movedBundleWithRequestedDocument]
    );
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const result = await service.context("C:/symbol-lattice-race-project", ["raceTarget"]);

    expect(result).toMatchObject({
      status: { generationId: "generation:C" },
      contexts: [
        {
          match: { status: "exact", symbol: { filePath: "src/after.ts" } },
          sourceAvailability: "active-generation",
          source: { filePath: "src/after.ts" }
        }
      ]
    });
    expect(result.contexts[0]?.source?.lines.map((line) => line.text).join("\n")).toContain(
      "C evidence"
    );
    expect(sourceDocumentRequests).toEqual([["src/before.ts"], ["src/after.ts"]]);
  });

  it("reports a stable edge lookup error for an absent edge", async () => {
    const projectPath = await createFixtureProject();
    const service = createService();
    await service.init({ projectPath });

    await expect(service.explainEdge(projectPath, "edge:missing")).rejects.toMatchObject({
      code: "EDGE_NOT_FOUND"
    });
  });

  it("does not create an index while answering status for a new project", async () => {
    const projectPath = await createFixtureProject();
    const service = createService();

    expect(await service.getStatus(projectPath)).toMatchObject({ initialized: false, stale: false });
  });

  it("persists scope and configuration identity, resolves aliases, and detects configuration-only drift", async () => {
    const projectPath = await createFixtureProject(configuredFixturePath);
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const initial = await service.init({ projectPath });
    expect(initial).toMatchObject({
      stale: false,
      staleReasons: [],
      counts: { files: 4 }
    });
    const inputs = graphStore.getIndexInputs(projectPath);
    expect(inputs).toMatchObject({
      scopeRoots: ["."],
      configurationInputs: expect.arrayContaining([
        expect.objectContaining({ kind: "root-gitignore", path: ".gitignore", state: "present" }),
        expect.objectContaining({ kind: "tsconfig", path: "tsconfig.json", state: "present" }),
        expect.objectContaining({ kind: "extends", path: "config/tsconfig.base.json", state: "present" })
      ])
    });

    const add = await service.find(projectPath, "add");
    const addSymbol = add.symbols.find((symbol) => symbol.qualifiedName === "src/lib/math.ts#add");
    expect(addSymbol).toBeDefined();
    const callers = await service.callers(projectPath, addSymbol?.qualifiedName ?? "missing");
    const calculate = callers.relations.find((relation) => relation.symbol.name === "calculate");
    expect(calculate?.edge.evidence).toMatchObject({
      ruleId: "module.explicit-import-binding",
      stage: "module"
    });
    const moduleEdge = graphStore
      .getSnapshot(projectPath)
      .edges.find((edge) => edge.kind === "imports" && edge.referenceName === "@math");
    expect(moduleEdge?.evidence).toMatchObject({
      ruleId: "module.tsconfig-paths",
      configurationPaths: expect.arrayContaining(["tsconfig.json", "config/tsconfig.base.json"])
    });

    await writeFile(
      join(projectPath, "config", "tsconfig.base.json"),
      '{ "compilerOptions": { "module": "NodeNext", "moduleResolution": "NodeNext", "target": "ES2022" } }\n',
      "utf8"
    );
    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["project-inputs-changed"]
    });
    expect(await service.sync({ projectPath })).toMatchObject({ stale: false, staleReasons: [] });

    await writeFile(join(projectPath, ".gitignore"), "generated/*\nprivate/\n# changed policy\n", "utf8");
    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["source-files-changed", "project-inputs-changed"]
    });
  });

  it("keeps a persisted scope for a sync without --scope and only tracks files inside it", async () => {
    const projectPath = await createFixtureProject(configuredFixturePath);
    const service = createService();

    expect(await service.init({ projectPath, scopeRoots: ["src/lib", "src/lib"] })).toMatchObject({
      stale: false,
      counts: { files: 2 }
    });
    await writeFile(join(projectPath, "src", "consumer.ts"), "export const outside = true;", "utf8");
    expect(await service.getStatus(projectPath)).toMatchObject({ stale: false, staleReasons: [] });
    await writeFile(join(projectPath, "src", "lib", "math.ts"), "export const inside = true;", "utf8");
    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["source-files-changed"]
    });
    expect(await service.sync({ projectPath })).toMatchObject({ stale: false, counts: { files: 2 } });
  });

  it("reports invalid configuration as stale and preserves the previous active generation when sync fails", async () => {
    const projectPath = await createFixtureProject(configuredFixturePath);
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const before = graphStore.getSnapshot(projectPath);
    const generationId = graphStore.getStatus(projectPath).generationId;

    await writeFile(join(projectPath, "tsconfig.json"), "{ invalid json", "utf8");
    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["configuration-invalid"],
      generationId
    });
    await expect(service.sync({ projectPath })).rejects.toMatchObject({
      code: "INVALID_PROJECT_CONFIGURATION"
    });
    expect(graphStore.getStatus(projectPath).generationId).toBe(generationId);
    expect(graphStore.getSnapshot(projectPath)).toEqual(before);
  });

  it("re-extracts only dirty source artifacts and persists the reverse dependency plan", async () => {
    const projectPath = await createFixtureProject();
    const graphStore = new SqliteGraphStore();
    let extractionCount = 0;
    const service = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      (input) => {
        extractionCount += 1;
        return extractFileFacts(input);
      }
    );

    await service.init({ projectPath });
    expect(extractionCount).toBe(3);
    const initialGenerationId = graphStore.getStatus(projectPath).generationId;
    await writeFile(
      join(projectPath, "src", "math.ts"),
      "export function add(left: number, right: number) { return left + right; }\nexport const changed = true;\n",
      "utf8"
    );

    const synced = await service.sync({ projectPath });
    expect(extractionCount).toBe(4);
    expect(synced.generationId).not.toBe(initialGenerationId);
    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      resolutionScope: "project",
      addedFiles: [],
      modifiedFiles: ["src/math.ts"],
      removedFiles: [],
      reExtractedFiles: ["src/math.ts"],
      reusedArtifactFiles: ["src/consumer.ts", "src/legacy.js"],
      dependencyInvalidatedFiles: ["src/consumer.ts"]
    });
    expect(graphStore.getActiveGenerationBundle(projectPath).status.lastIndexWork).toEqual(
      synced.lastIndexWork
    );
  });

  it("does not publish a new generation for a no-op sync", async () => {
    const projectPath = await createFixtureProject();
    const graphStore = new SqliteGraphStore();
    let extractionCount = 0;
    const service = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      (input) => {
        extractionCount += 1;
        return extractFileFacts(input);
      }
    );

    await service.init({ projectPath });
    const generationId = graphStore.getStatus(projectPath).generationId;
    const status = await service.sync({ projectPath });

    expect(status.generationId).toBe(generationId);
    expect(extractionCount).toBe(3);
    expect(status.lastIndexWork).toMatchObject({ mode: "full" });
  });

  it("normalizes the pre-release source-search marker during a no-op sync", async () => {
    const projectPath = await createFixtureProject();
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const generationId = graphStore.getStatus(projectPath).generationId;
    setSchemaVersion(projectPath, "5");

    const status = await service.sync({ projectPath });

    expect(readSchemaVersion(projectPath)).toBe("4");
    expect(status).toMatchObject({ generationId, stale: false, staleReasons: [] });
    expect((await service.search(projectPath, "add")).results).not.toEqual([]);
  });

  it("returns persisted source evidence while reporting live source drift as stale", async () => {
    const projectPath = await createInlineProject({
      "src/search.ts": [
        "export function indexedNeedle() {",
        '  return "indexed evidence";',
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    await writeFile(
      join(projectPath, "src", "search.ts"),
      'export function liveReplacement() { return "live only"; }\n',
      "utf8"
    );

    const search = await service.search(projectPath, "indexedNeedle");

    expect(search.status).toMatchObject({
      stale: true,
      staleReasons: ["source-files-changed"]
    });
    expect(search.results).toHaveLength(1);
    expect(search.results[0]).toMatchObject({
      rank: 1,
      filePath: "src/search.ts",
      language: "typescript",
      matchingTerms: ["indexedneedle"],
      lexicalReason: "Matched persisted lexical terms: indexedneedle.",
      symbolCandidates: [expect.objectContaining({ name: "indexedNeedle" })]
    });
    expect(search.results[0]?.excerpt.lines.map((line) => line.text).join("\n")).toContain(
      "indexedNeedle"
    );
    expect(search.results[0]?.excerpt.lines.map((line) => line.text).join("\n")).not.toContain(
      "liveReplacement"
    );
  });

  it("keeps exact exploration evidence generation-bound after live source changes or deletion", async () => {
    const projectPath = await createInlineProject({
      "src/explore.ts": [
        "export function indexedExplore() {",
        '  return "indexed evidence";',
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    await writeFile(
      join(projectPath, "src", "explore.ts"),
      'export function liveReplacement() { return "live only"; }\n',
      "utf8"
    );

    const changed = await service.explore(projectPath, "src/explore.ts#indexedExplore");
    expect(changed).toMatchObject({
      status: { stale: true, staleReasons: ["source-files-changed"] },
      match: { status: "exact" },
      sourceAvailability: "active-generation",
      source: { filePath: "src/explore.ts" }
    });
    expect(changed.source?.lines.map((line) => line.text).join("\n")).toContain("indexedExplore");
    expect(changed.source?.lines.map((line) => line.text).join("\n")).not.toContain(
      "liveReplacement"
    );

    const changedContext = await service.context(projectPath, ["src/explore.ts#indexedExplore"]);
    expect(changedContext).toMatchObject({
      status: { stale: true, staleReasons: ["source-files-changed"] },
      contexts: [
        {
          match: { status: "exact" },
          sourceAvailability: "active-generation",
          source: { filePath: "src/explore.ts" }
        }
      ]
    });
    expect(changedContext.contexts[0]?.source?.lines.map((line) => line.text).join("\n")).toContain(
      "indexed evidence"
    );

    await rm(join(projectPath, "src", "explore.ts"));

    const deleted = await service.explore(projectPath, "src/explore.ts#indexedExplore");
    expect(deleted).toMatchObject({
      status: { stale: true, staleReasons: ["source-files-changed"] },
      match: { status: "exact" },
      sourceAvailability: "active-generation",
      source: { filePath: "src/explore.ts" }
    });
    expect(deleted.source?.lines.map((line) => line.text).join("\n")).toContain(
      "indexed evidence"
    );

    const deletedContext = await service.context(projectPath, ["src/explore.ts#indexedExplore"]);
    expect(deletedContext.contexts[0]?.source?.lines.map((line) => line.text).join("\n")).toContain(
      "indexed evidence"
    );
  });

  it("reports persisted ranges in raw UTF-16 source columns after NFKC expansion", async () => {
    const projectPath = await createInlineProject({
      "src/unicode.ts": 'const ligature = "\uFB03"; export const needle = true;\n'
    });
    const service = createService();
    await service.init({ projectPath });

    const search = await service.search(projectPath, "needle");

    expect(search.results).toMatchObject([
      {
        filePath: "src/unicode.ts",
        range: {
          start: { line: 1, column: 36 },
          end: { line: 1, column: 42 }
        }
      }
    ]);
  });

  it("reconstructs diacritic-folded FTS hits as persisted source evidence", async () => {
    const projectPath = await createInlineProject({
      "src/diacritic.ts": "export const café = true;\n"
    });
    const service = createService();
    await service.init({ projectPath });

    const search = await service.search(projectPath, "cafe");

    expect(search.results).toMatchObject([
      {
        filePath: "src/diacritic.ts",
        matchingTerms: ["cafe"],
        lexicalReason: "Matched persisted lexical terms: cafe.",
        range: {
          start: { line: 1, column: 14 },
          end: { line: 1, column: 18 }
        },
        symbolCandidates: [expect.objectContaining({ name: "café" })]
      }
    ]);
  });

  it("reports source search ranges and candidates correctly for CR-only files", async () => {
    const projectPath = await createInlineProject({
      "src/cr-only.ts": "const before = 1;\rexport const crNeedle = true;\r"
    });
    const service = createService();
    await service.init({ projectPath });

    const search = await service.search(projectPath, "crNeedle");

    expect(search.results).toMatchObject([
      {
        filePath: "src/cr-only.ts",
        range: {
          start: { line: 2, column: 14 },
          end: { line: 2, column: 22 }
        },
        excerpt: {
          lines: expect.arrayContaining([expect.objectContaining({ line: 2, text: "export const crNeedle = true;" })])
        },
        symbolCandidates: [expect.objectContaining({ name: "crNeedle" })]
      }
    ]);
  });

  it("validates persisted-source search filters and associates zero or many declarations", async () => {
    const projectPath = await createInlineProject({
      "src/filter.ts": "export const filterNeedle = true;\n",
      "lib/filter.js": "export const filterNeedle = true;\n",
      "src/comment.ts": "// commentNeedle\nexport const unrelated = true;\n",
      "src/nested.ts": [
        "export function wrapper() {",
        "  const nestedNeedle = 1;",
        "  return nestedNeedle;",
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const filtered = await service.search(projectPath, "filterNeedle", {
      pathPrefix: "src/",
      language: "typescript",
      limit: 1
    });
    expect(filtered.results).toMatchObject([{ rank: 1, filePath: "src/filter.ts" }]);

    const comment = await service.search(projectPath, "commentNeedle");
    expect(comment.results[0]).toMatchObject({
      filePath: "src/comment.ts",
      symbolCandidates: []
    });

    const nested = await service.search(projectPath, "nestedNeedle");
    expect(nested.results[0]?.symbolCandidates.map((symbol) => symbol.name)).toEqual([
      "wrapper",
      "nestedNeedle"
    ]);

    await expect(service.search(projectPath, "+++" as string)).rejects.toMatchObject({
      code: "INVALID_SEARCH_QUERY"
    });
    await expect(service.search(projectPath, "needle", { limit: 0 })).rejects.toMatchObject({
      code: "INVALID_SEARCH_LIMIT"
    });
    await expect(
      service.search(projectPath, "needle", { pathPrefix: "../outside" })
    ).rejects.toMatchObject({ code: "INVALID_SEARCH_PATH_PREFIX" });
    await expect(
      service.search(projectPath, "needle", { language: "not-a-language" as "typescript" })
    ).rejects.toMatchObject({ code: "INVALID_SEARCH_LANGUAGE" });
  });

  it("backfills a missing source-search projection without re-extracting compatible facts", async () => {
    const projectPath = await createInlineProject({
      "src/search.ts": "export const backfillNeedle = true;\n"
    });
    const graphStore = new SqliteGraphStore();
    let extractionCount = 0;
    const service = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      (input) => {
        extractionCount += 1;
        return extractFileFacts(input);
      }
    );
    await service.init({ projectPath });
    const firstGenerationId = graphStore.getStatus(projectPath).generationId;
    expect(extractionCount).toBe(1);

    removeSourceSearchProjection(projectPath);

    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["indexer-version-changed"]
    });
    await expect(service.search(projectPath, "backfillNeedle")).rejects.toMatchObject({
      code: "SOURCE_SEARCH_UNAVAILABLE"
    });
    await expect(service.explore(projectPath, "src/search.ts#backfillNeedle")).resolves.toMatchObject({
      source: null,
      sourceAvailability: "unavailable"
    });

    const synced = await service.sync({ projectPath });
    expect(synced).toMatchObject({ stale: false, staleReasons: [] });
    expect(synced.generationId).not.toBe(firstGenerationId);
    expect(extractionCount).toBe(1);
    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: [],
      reusedArtifactFiles: ["src/search.ts"]
    });
    expect((await service.search(projectPath, "backfillNeedle")).results).toMatchObject([
      { filePath: "src/search.ts" }
    ]);
  });

  it("removes deleted source facts and invalidates their existing importers", async () => {
    const projectPath = await createFixtureProject();
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    await rm(join(projectPath, "src", "math.ts"));

    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["source-files-changed"]
    });
    const synced = await service.sync({ projectPath });

    expect(synced).toMatchObject({ stale: false, counts: { files: 2 } });
    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      removedFiles: ["src/math.ts"],
      reExtractedFiles: [],
      reusedArtifactFiles: ["src/consumer.ts", "src/legacy.js"],
      dependencyInvalidatedFiles: ["src/consumer.ts"]
    });
  });

  it("reuses raw artifacts when configuration drift requires a fresh project resolution", async () => {
    const projectPath = await createFixtureProject(configuredFixturePath);
    const graphStore = new SqliteGraphStore();
    let extractionCount = 0;
    const service = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      (input) => {
        extractionCount += 1;
        return extractFileFacts(input);
      }
    );

    await service.init({ projectPath });
    const tsconfigPath = join(projectPath, "tsconfig.json");
    await writeFile(tsconfigPath, `${await readFile(tsconfigPath, "utf8")}\n`, "utf8");
    const synced = await service.sync({ projectPath });

    expect(extractionCount).toBe(4);
    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: [],
      reusedArtifactFiles: [
        "generated/kept/visible.ts",
        "src/consumer.ts",
        "src/lib/format.ts",
        "src/lib/math.ts"
      ],
      dependencyInvalidatedFiles: [
        "generated/kept/visible.ts",
        "src/consumer.ts",
        "src/lib/format.ts",
        "src/lib/math.ts"
      ]
    });
  });

  it("resolves a workspace package re-export end to end with provenance", async () => {
    const projectPath = await createInlineProject({
      "package.json": JSON.stringify({ private: true, workspaces: ["packages/*"] }),
      "packages/core/package.json": JSON.stringify({
        name: "@fixture/core",
        exports: { ".": "./src/index.ts" }
      }),
      "packages/core/src/math.ts": "export function add() { return 1; }",
      "packages/core/src/index.ts": 'export { add as sum } from "./math";',
      "apps/web/src/consumer.ts":
        'import { sum } from "@fixture/core"; export function calculate() { return sum(); }'
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const calculate = (await service.find(projectPath, "calculate")).symbols.find(
      (symbol) => symbol.qualifiedName === "apps/web/src/consumer.ts#calculate"
    );
    const callers = await service.callers(projectPath, "packages/core/src/math.ts#add");
    const relation = callers.relations.find((candidate) => candidate.symbol.id === calculate?.id);

    expect(relation?.edge.evidence).toEqual({
      ruleId: "module.reexported-import-binding",
      stage: "module",
      candidateSymbolIds: [expect.any(String)],
      configurationPaths: ["package.json", "packages/core/package.json"],
      resolutionPath: [
        "apps/web/src/consumer.ts",
        "packages/core/src/index.ts",
        "packages/core/src/math.ts"
      ]
    });
  });

  it("returns an exact generation-bound declaration node with direct callers and callees", async () => {
    const projectPath = await createInlineProject({
      "src/node.ts": [
        "export function target(): number {",
        "  return 1;",
        "}",
        "",
        "export function middle(): number {",
        "  return target();",
        "}",
        "",
        "export function entry(): number {",
        "  return middle();",
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const exact = await service.node(projectPath, "src/node.ts#middle");
    if (exact.match.status !== "exact") {
      throw new Error("Expected middle to resolve exactly.");
    }

    expect(exact).toMatchObject({
      status: { stale: false },
      bounds: {
        sourceLineLimit: NODE_SOURCE_LINE_LIMIT,
        sourceCharacterLimit: NODE_SOURCE_CHARACTER_LIMIT,
        relationLimit: NODE_RELATION_LIMIT
      },
      match: { status: "exact", symbol: { qualifiedName: "src/node.ts#middle" } },
      sourceAvailability: "active-generation",
      source: {
        filePath: "src/node.ts",
        truncated: false
      },
      callers: {
        items: [expect.objectContaining({ symbol: expect.objectContaining({ name: "entry" }) })],
        truncated: false
      },
      callees: {
        items: [expect.objectContaining({ symbol: expect.objectContaining({ name: "target" }) })],
        truncated: false
      }
    });
    expect(exact.source?.text).toBe(
      ["export function middle(): number {", "  return target();", "}"].join("\n")
    );

    const byId = await service.node(projectPath, exact.match.symbol.id);
    const byQualifiedName = await service.node(projectPath, exact.match.symbol.qualifiedName);
    const byLocation = await service.node(
      projectPath,
      `${exact.match.symbol.filePath}:${exact.match.symbol.range.start.line}`
    );
    expect(byId.match).toMatchObject({ status: "exact", symbol: { id: exact.match.symbol.id } });
    expect(byQualifiedName.match).toMatchObject({
      status: "exact",
      symbol: { id: exact.match.symbol.id }
    });
    expect(byLocation.match).toMatchObject({
      status: "exact",
      symbol: { id: exact.match.symbol.id }
    });
  });

  it("keeps node declaration evidence generation-bound after live source changes and deletion", async () => {
    const projectPath = await createInlineProject({
      "src/node-evidence.ts": [
        "export function indexedNode(): string {",
        '  return "indexed declaration";',
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    await writeFile(
      join(projectPath, "src", "node-evidence.ts"),
      'export function liveReplacement(): string { return "live only"; }\n',
      "utf8"
    );
    const changed = await service.node(projectPath, "src/node-evidence.ts#indexedNode");
    expect(changed).toMatchObject({
      status: { stale: true, staleReasons: ["source-files-changed"] },
      sourceAvailability: "active-generation",
      source: { filePath: "src/node-evidence.ts" }
    });
    expect(changed.source?.text).toContain("indexed declaration");
    expect(changed.source?.text).not.toContain("liveReplacement");

    await rm(join(projectPath, "src", "node-evidence.ts"));
    const deleted = await service.node(projectPath, "src/node-evidence.ts#indexedNode");
    expect(deleted).toMatchObject({
      status: { stale: true, staleReasons: ["source-files-changed"] },
      sourceAvailability: "active-generation",
      source: { filePath: "src/node-evidence.ts" }
    });
    expect(deleted.source?.text).toContain("indexed declaration");
  });

  it("keeps nonexact node matches source- and relation-free", async () => {
    const projectPath = await createInlineProject(
      Object.fromEntries(
        Array.from({ length: NODE_MATCH_CANDIDATE_LIMIT + 1 }, (_value, index) => [
          `src/duplicate-${index}.ts`,
          `export function duplicateNode(): number { return ${index}; }\n`
        ])
      )
    );
    const service = createService();
    await service.init({ projectPath });

    const ambiguous = await service.node(projectPath, "duplicateNode");
    const missing = await service.node(projectPath, "missingNode");

    expect(ambiguous).toMatchObject({
      match: { status: "ambiguous" },
      bounds: { matchCandidateLimit: NODE_MATCH_CANDIDATE_LIMIT },
      matchCandidatesTruncated: true,
      sourceAvailability: "not-applicable",
      source: null,
      callers: { items: [], truncated: false },
      callees: { items: [], truncated: false }
    });
    expect(missing).toMatchObject({
      match: { status: "not_found" },
      matchCandidatesTruncated: false,
      sourceAvailability: "not-applicable",
      source: null,
      callers: { items: [], truncated: false },
      callees: { items: [], truncated: false }
    });
    if (ambiguous.match.status !== "ambiguous") {
      throw new Error("Expected duplicateNode to be ambiguous.");
    }
    expect(ambiguous.match.candidates).toHaveLength(NODE_MATCH_CANDIDATE_LIMIT);
  });

  it("reports an unavailable legacy source projection without losing same-generation relations", async () => {
    const projectPath = await createInlineProject({
      "src/legacy-node.ts": [
        "export function legacyTarget(): number {",
        "  return 1;",
        "}",
        "",
        "export function legacyMiddle(): number {",
        "  return legacyTarget();",
        "}",
        "",
        "export function legacyEntry(): number {",
        "  return legacyMiddle();",
        "}",
        ""
      ].join("\n")
    });
    const service = new SymbolLatticeService(
      createV03GraphStore(new SqliteGraphStore()),
      new FileSystemSourceCatalog()
    );
    await service.init({ projectPath });

    const result = await service.node(projectPath, "src/legacy-node.ts#legacyMiddle");

    expect(result).toMatchObject({
      match: { status: "exact" },
      sourceAvailability: "unavailable",
      source: null,
      callers: {
        items: [expect.objectContaining({ symbol: expect.objectContaining({ name: "legacyEntry" }) })]
      },
      callees: {
        items: [expect.objectContaining({ symbol: expect.objectContaining({ name: "legacyTarget" }) })]
      }
    });
  });

  it("caps declaration disclosure by persisted source lines and UTF-16 characters", async () => {
    const linePadding = Array.from({ length: NODE_SOURCE_LINE_LIMIT + 5 }, (_value, index) =>
      `  // line-padding-${index}`
    );
    const projectPath = await createInlineProject({
      "src/line-bound.ts": [
        "export function lineBound(): string {",
        ...linePadding,
        '  return "line-bound-end";',
        "}",
        ""
      ].join("\n"),
      "src/character-bound.ts": `export const characterBound = "${"x".repeat(
        NODE_SOURCE_CHARACTER_LIMIT + 100
      )}";\n`
    });
    const service = createService();
    await service.init({ projectPath });

    const lineBound = await service.node(projectPath, "src/line-bound.ts#lineBound");
    const characterBound = await service.node(
      projectPath,
      "src/character-bound.ts#characterBound"
    );

    expect(lineBound.source).toMatchObject({
      totalLines: expect.any(Number),
      truncated: true
    });
    expect(lineBound.source?.totalLines).toBeGreaterThan(NODE_SOURCE_LINE_LIMIT);
    expect(lineBound.source?.text).not.toContain(`line-padding-${NODE_SOURCE_LINE_LIMIT + 4}`);
    expect(lineBound.source?.text.length).toBeLessThanOrEqual(NODE_SOURCE_CHARACTER_LIMIT);

    expect(characterBound.source).toMatchObject({
      totalLines: 1,
      truncated: true
    });
    expect(characterBound.source?.totalCharacters).toBeGreaterThan(NODE_SOURCE_CHARACTER_LIMIT);
    expect(characterBound.source?.text).toHaveLength(NODE_SOURCE_CHARACTER_LIMIT);
  });

  it("counts an indented multi-line declaration's containing start line in node metadata", async () => {
    const indentedPadding = Array.from(
      { length: NODE_SOURCE_LINE_LIMIT - 2 },
      (_value, index) => `    // indented-padding-${index}`
    );
    const projectPath = await createInlineProject({
      "src/indented-node.ts": [
        "export class IndentedNode {",
        "  inspect(): number {",
        ...indentedPadding,
        "    return 1;",
        "  }",
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.node(projectPath, "src/indented-node.ts#IndentedNode.inspect");

    expect(result.source).toMatchObject({
      totalLines: NODE_SOURCE_LINE_LIMIT + 1,
      truncated: true
    });
  });

  it("rejects malformed persisted node ranges that point into a line terminator or following line", async () => {
    for (const fixture of [
      { filePath: "src/corrupt-lf.ts", sourceText: "a\nb", malformedStartColumn: 3 },
      { filePath: "src/corrupt-crlf.ts", sourceText: "a\r\nb", malformedStartColumn: 4 }
    ]) {
      const initialSnapshot = raceSnapshot(fixture.filePath);
      const initialSymbol = initialSnapshot.symbols[0];
      if (initialSymbol === undefined) {
        throw new Error("Expected a race symbol.");
      }
      const corruptedSymbol = {
        ...initialSymbol,
        id: `symbol:${fixture.filePath}:alpha`,
        name: "alpha",
        qualifiedName: `${fixture.filePath}#alpha`,
        range: {
          start: { line: 1, column: fixture.malformedStartColumn },
          end: { line: 2, column: 2 }
        }
      };
      const corruptedSnapshot: GraphSnapshot = {
        ...initialSnapshot,
        symbols: [corruptedSymbol]
      };
      const sourceBundle: ActiveSourceDocumentsBundle = {
        status: raceStatus(`generation:${fixture.filePath}`),
        snapshot: corruptedSnapshot,
        indexInputs: null,
        extractorVersion: null,
        resolverVersion: null,
        sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
        documents: [raceSourceDocument(fixture.filePath, fixture.sourceText)]
      };
      const { graphStore } = createSequencedSourceDocumentGraphStore(
        { ...sourceBundle, documents: [] },
        [sourceBundle]
      );
      const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

      const result = await service.node("C:/symbol-lattice-race-project", corruptedSymbol.qualifiedName);

      expect(result).toMatchObject({
        match: { status: "exact", symbol: { id: corruptedSymbol.id } },
        sourceAvailability: "unavailable",
        source: null
      });
    }
  });

  it("returns persisted node source across ECMAScript U+2028 and U+2029 line separators", async () => {
    const projectPath = await createInlineProject({
      "src/line-separator.ts": "export const alpha = 1;\u2028export const beta = 2;",
      "src/paragraph-separator.ts": "export const gamma = 3;\u2029export const delta = 4;"
    });
    const service = createService();
    await service.init({ projectPath });

    const beta = await service.node(projectPath, "src/line-separator.ts#beta");
    const delta = await service.node(projectPath, "src/paragraph-separator.ts#delta");

    expect(beta).toMatchObject({
      sourceAvailability: "active-generation",
      source: { text: expect.stringContaining("beta"), truncated: false }
    });
    expect(delta).toMatchObject({
      sourceAvailability: "active-generation",
      source: { text: expect.stringContaining("delta"), truncated: false }
    });
  });

  it("takes node source and direct relations from one authoritative source bundle generation", async () => {
    const sourceText = [
      "export function raceTarget() {",
      "  return raceCallee();",
      "}",
      ""
    ].join("\n");
    const target = raceSnapshot("src/race.ts").symbols[0];
    if (target === undefined) {
      throw new Error("Expected race target symbol.");
    }
    const caller = {
      ...target,
      id: "symbol:race-caller",
      name: "raceCaller",
      qualifiedName: "src/race.ts#raceCaller"
    };
    const callee = {
      ...target,
      id: "symbol:race-callee",
      name: "raceCallee",
      qualifiedName: "src/race.ts#raceCallee"
    };
    const authoritativeSnapshot: GraphSnapshot = {
      ...raceSnapshot("src/race.ts"),
      symbols: [caller, target, callee],
      edges: [
        {
          id: "edge:race-caller-target",
          sourceId: caller.id,
          targetId: target.id,
          kind: "calls",
          filePath: "src/race.ts",
          range: target.range,
          resolution: "exact",
          confidence: 1,
          referenceName: target.name
        },
        {
          id: "edge:race-target-callee",
          sourceId: target.id,
          targetId: callee.id,
          kind: "calls",
          filePath: "src/race.ts",
          range: target.range,
          resolution: "exact",
          confidence: 1,
          referenceName: callee.name
        }
      ]
    };
    const initialBundle: ActiveGraphBundle = {
      status: raceStatus("generation:A"),
      snapshot: raceSnapshot("src/race.ts"),
      indexInputs: null,
      extractorVersion: null,
      resolverVersion: null,
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    };
    const authoritativeBundle: ActiveSourceDocumentsBundle = {
      status: raceStatus("generation:B"),
      snapshot: authoritativeSnapshot,
      indexInputs: null,
      extractorVersion: null,
      resolverVersion: null,
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION,
      documents: [raceSourceDocument("src/race.ts", sourceText)]
    };
    const { graphStore, sourceDocumentRequests } = createSequencedSourceDocumentGraphStore(
      initialBundle,
      [authoritativeBundle]
    );
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const result = await service.node("C:/symbol-lattice-race-project", "raceTarget");

    expect(result).toMatchObject({
      status: { generationId: "generation:B" },
      sourceAvailability: "active-generation",
      source: { filePath: "src/race.ts", text: expect.stringContaining("raceCallee") },
      callers: {
        items: [expect.objectContaining({ symbol: expect.objectContaining({ name: "raceCaller" }) })]
      },
      callees: {
        items: [expect.objectContaining({ symbol: expect.objectContaining({ name: "raceCallee" }) })]
      }
    });
    expect(sourceDocumentRequests).toEqual([["src/race.ts"]]);
  });

  it("lists filtered persisted routes with honest bounds, unresolved handlers, and live drift status", async () => {
    const projectPath = await createInlineProject({
      "src/handlers.ts": [
        "export function listUsers(): string[] {",
        '  return ["indexed"];',
        "}",
        ""
      ].join("\n"),
      "src/routes.ts": [
        "// The active graph below is intentionally persisted independently from this live source.",
        "export const persistedRoutes = true;",
        ""
      ].join("\n")
    });
    const sourceCatalog = new FileSystemSourceCatalog();
    const scan = await sourceCatalog.scan(projectPath);
    const routeRange = {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 32 }
    };
    const handler = {
      id: "symbol:handlers:listUsers",
      name: "listUsers",
      qualifiedName: "src/handlers.ts#listUsers",
      kind: "function" as const,
      filePath: "src/handlers.ts",
      range: routeRange,
      isExported: true,
      declarationOrdinal: 0
    };
    const routePaths = [
      "/api/users",
      ...Array.from(
        { length: DEFAULT_ROUTE_LIMIT + 1 },
        (_value, index) => `/api/extra-${index}`
      )
    ];
    const exactRoutes = routePaths.map((path, index) => ({
      id: `symbol:route:get:${index}`,
      name: `GET ${path}`,
      qualifiedName: `src/routes.ts#route:GET ${path}`,
      kind: "route" as const,
      filePath: "src/routes.ts",
      range: {
        start: { line: index + 1, column: 1 },
        end: { line: index + 1, column: 32 }
      },
      isExported: false,
      declarationOrdinal: index
    }));
    const unresolvedRoute = {
      id: "symbol:route:post:missing",
      name: "POST /api/missing",
      qualifiedName: "src/routes.ts#route:POST /api/missing",
      kind: "route" as const,
      filePath: "src/routes.ts",
      range: {
        start: { line: exactRoutes.length + 1, column: 1 },
        end: { line: exactRoutes.length + 1, column: 36 }
      },
      isExported: false,
      declarationOrdinal: exactRoutes.length
    };
    const snapshot: GraphSnapshot = {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        contentHash: document.contentHash,
        language: document.language,
        indexedAt: "2026-07-30T00:00:00.000Z"
      })),
      symbols: [handler, ...exactRoutes, unresolvedRoute],
      edges: [
        ...exactRoutes.map((route) => ({
          id: `edge:${route.id}`,
          sourceId: route.id,
          targetId: handler.id,
          kind: "routes" as const,
          filePath: route.filePath,
          range: route.range,
          resolution: "exact" as const,
          confidence: 1,
          referenceName: handler.name
        })),
        {
          id: "edge:route:post:missing",
          sourceId: unresolvedRoute.id,
          targetId: null,
          kind: "routes" as const,
          filePath: unresolvedRoute.filePath,
          range: unresolvedRoute.range,
          resolution: "unresolved" as const,
          confidence: 0,
          referenceName: "missingHandler"
        }
      ],
      pendingReferences: []
    };
    const initialGenerationId = "generation:routes";
    const bundle: ActiveGraphBundle = {
      status: {
        initialized: true,
        stale: false,
        staleReasons: [],
        projectPath,
        indexedAt: "2026-07-30T00:00:00.000Z",
        generationId: initialGenerationId,
        counts: {
          files: snapshot.files.length,
          symbols: snapshot.symbols.length,
          edges: snapshot.edges.length,
          pendingReferences: 0
        }
      },
      snapshot,
      indexInputs: scan.indexInputs,
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      resolverVersion: PROJECT_RESOLVER_VERSION,
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    };
    const mutationCalls: string[] = [];
    const graphStore: GraphStore = {
      isInitialized: () => true,
      initialize: () => {
        mutationCalls.push("initialize");
      },
      getStatus: () => bundle.status,
      getSnapshot: () => bundle.snapshot,
      getArtifactFacts: () => [],
      getIndexInputs: () => bundle.indexInputs,
      getActiveGraphBundle: () => bundle,
      getActiveGenerationBundle: () => ({ ...bundle, artifactFacts: [] }),
      replaceProjectFacts: () => {
        mutationCalls.push("replaceProjectFacts");
      }
    };
    const service = new SymbolLatticeService(graphStore, sourceCatalog);

    const defaultResult = await service.routes(projectPath);
    const filtered = await service.routes(projectPath, {
      method: "GET",
      pathPrefix: "/api/users",
      limit: 1
    });
    const unresolved = await service.routes(projectPath, { method: "POST" });

    expect(defaultResult).toMatchObject({
      status: { generationId: initialGenerationId, stale: false },
      bounds: { limit: DEFAULT_ROUTE_LIMIT, maximumLimit: MAX_ROUTE_LIMIT },
      truncated: true
    });
    expect(defaultResult.routes).toHaveLength(DEFAULT_ROUTE_LIMIT);
    expect(filtered).toMatchObject({
      bounds: { limit: 1, maximumLimit: MAX_ROUTE_LIMIT },
      routes: [
        {
          method: "GET",
          path: "/api/users",
          route: { kind: "route", name: "GET /api/users" },
          edge: { kind: "routes", resolution: "exact" },
          handler: { name: "listUsers" }
        }
      ],
      truncated: false
    });
    expect(unresolved).toMatchObject({
      routes: [
        {
          method: "POST",
          path: "/api/missing",
          edge: { kind: "routes", resolution: "unresolved", targetId: null },
          handler: null
        }
      ]
    });

    await writeFile(
      join(projectPath, "src", "routes.ts"),
      [
        'import express from "express";',
        "const app = express();",
        'app.get("/live-only", () => "live");',
        ""
      ].join("\n"),
      "utf8"
    );
    const stale = await service.routes(projectPath, { method: "GET", pathPrefix: "/api/users" });

    expect(stale).toMatchObject({
      status: {
        generationId: initialGenerationId,
        stale: true,
        staleReasons: ["source-files-changed"]
      },
      routes: [{ path: "/api/users", handler: { name: "listUsers" } }]
    });
    expect(stale.routes.map((route) => route.path)).not.toContain("/live-only");
    expect((await service.getStatus(projectPath)).generationId).toBe(initialGenerationId);
    expect(mutationCalls).toEqual([]);

    await expect(
      service.routes(projectPath, { method: "get" as "GET" })
    ).rejects.toMatchObject({ code: "INVALID_ROUTE_METHOD" });
    await expect(service.routes(projectPath, { pathPrefix: "api" })).rejects.toMatchObject({
      code: "INVALID_ROUTE_PATH_PREFIX"
    });
    await expect(service.routes(projectPath, { limit: 0 })).rejects.toMatchObject({
      code: "INVALID_ROUTE_LIMIT"
    });
    await expect(service.routes(projectPath, { limit: MAX_ROUTE_LIMIT + 1 })).rejects.toMatchObject({
      code: "INVALID_ROUTE_LIMIT"
    });
  });

  it("lists filtered persisted non-HTTP entrypoints without changing the active generation", async () => {
    const projectPath = await createInlineProject({
      "src/transports.ts": "export const persistedEntrypoints = true;\n"
    });
    const sourceCatalog = new FileSystemSourceCatalog();
    const scan = await sourceCatalog.scan(projectPath);
    const range = {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 40 }
    };
    const author = {
      id: "symbol:resolver:author",
      name: "author",
      qualifiedName: "src/transports.ts#AuthorResolver.author",
      kind: "method" as const,
      filePath: "src/transports.ts",
      range,
      isExported: false,
      declarationOrdinal: 0
    };
    const sum = {
      id: "symbol:controller:sum",
      name: "sum",
      qualifiedName: "src/transports.ts#MathController.sum",
      kind: "method" as const,
      filePath: "src/transports.ts",
      range: { start: { line: 2, column: 1 }, end: { line: 2, column: 40 } },
      isExported: false,
      declarationOrdinal: 0
    };
    const created = {
      id: "symbol:gateway:created",
      name: "created",
      qualifiedName: "src/transports.ts#EventsGateway.created",
      kind: "method" as const,
      filePath: "src/transports.ts",
      range: { start: { line: 3, column: 1 }, end: { line: 3, column: 40 } },
      isExported: false,
      declarationOrdinal: 0
    };
    const entrypoints = [
      { id: "symbol:entrypoint:query", name: "graphql query author", handler: author },
      { id: "symbol:entrypoint:message", name: 'microservice message {"cmd":"sum"}', handler: sum },
      { id: "symbol:entrypoint:subscribe", name: "websocket subscribe events:created", handler: created }
    ].map((entrypoint, index) => ({
      ...entrypoint,
      qualifiedName: `src/transports.ts#entrypoint:${entrypoint.name}`,
      kind: "entrypoint" as const,
      filePath: "src/transports.ts",
      range: {
        start: { line: index + 10, column: 1 },
        end: { line: index + 10, column: 40 }
      },
      isExported: false,
      declarationOrdinal: index
    }));
    const snapshot: GraphSnapshot = {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        contentHash: document.contentHash,
        language: document.language,
        indexedAt: "2026-07-30T00:00:00.000Z"
      })),
      symbols: [author, sum, created, ...entrypoints],
      edges: entrypoints.map((entrypoint) => ({
        id: `edge:${entrypoint.id}`,
        sourceId: entrypoint.id,
        targetId: entrypoint.handler.id,
        kind: "handles" as const,
        filePath: entrypoint.filePath,
        range: entrypoint.range,
        resolution: "exact" as const,
        confidence: 1,
        referenceName: entrypoint.handler.name
      })),
      pendingReferences: []
    };
    const initialGenerationId = "generation:entrypoints";
    const bundle: ActiveGraphBundle = {
      status: {
        initialized: true,
        stale: false,
        staleReasons: [],
        projectPath,
        indexedAt: "2026-07-30T00:00:00.000Z",
        generationId: initialGenerationId,
        counts: {
          files: snapshot.files.length,
          symbols: snapshot.symbols.length,
          edges: snapshot.edges.length,
          pendingReferences: 0
        }
      },
      snapshot,
      indexInputs: scan.indexInputs,
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      resolverVersion: PROJECT_RESOLVER_VERSION,
      sourceSearchVersion: SOURCE_SEARCH_INDEX_VERSION
    };
    const mutationCalls: string[] = [];
    const graphStore: GraphStore = {
      isInitialized: () => true,
      initialize: () => {
        mutationCalls.push("initialize");
      },
      getStatus: () => bundle.status,
      getSnapshot: () => bundle.snapshot,
      getArtifactFacts: () => [],
      getIndexInputs: () => bundle.indexInputs,
      getActiveGraphBundle: () => bundle,
      getActiveGenerationBundle: () => ({ ...bundle, artifactFacts: [] }),
      replaceProjectFacts: () => {
        mutationCalls.push("replaceProjectFacts");
      }
    };
    const service = new SymbolLatticeService(graphStore, sourceCatalog);

    const defaultResult = await service.entrypoints(projectPath);
    const graphql = await service.entrypoints(projectPath, {
      transport: "graphql",
      operation: "query",
      namePrefix: "auth",
      limit: 1
    });

    expect(defaultResult).toMatchObject({
      status: { generationId: initialGenerationId, stale: false },
      bounds: { limit: DEFAULT_ENTRYPOINT_LIMIT, maximumLimit: MAX_ENTRYPOINT_LIMIT },
      truncated: false
    });
    expect(defaultResult.entrypoints.map((entrypoint) => [
      entrypoint.transport,
      entrypoint.operation,
      entrypoint.name,
      entrypoint.edge.kind
    ])).toEqual([
      ["graphql", "query", "author", "handles"],
      ["microservice", "message", '{"cmd":"sum"}', "handles"],
      ["websocket", "subscribe", "events:created", "handles"]
    ]);
    expect(graphql).toMatchObject({
      bounds: { limit: 1, maximumLimit: MAX_ENTRYPOINT_LIMIT },
      entrypoints: [
        {
          transport: "graphql",
          operation: "query",
          name: "author",
          handler: { name: "author" }
        }
      ],
      truncated: false
    });

    await writeFile(
      join(projectPath, "src", "transports.ts"),
      "export const liveOnly = true;\n",
      "utf8"
    );
    const stale = await service.entrypoints(projectPath, { transport: "websocket" });
    expect(stale).toMatchObject({
      status: { generationId: initialGenerationId, stale: true, staleReasons: ["source-files-changed"] },
      entrypoints: [{ name: "events:created", handler: { name: "created" } }]
    });
    expect((await service.getStatus(projectPath)).generationId).toBe(initialGenerationId);
    expect(mutationCalls).toEqual([]);

    await expect(
      service.entrypoints(projectPath, { transport: "http" as "graphql" })
    ).rejects.toMatchObject({ code: "INVALID_ENTRYPOINT_TRANSPORT" });
    await expect(
      service.entrypoints(projectPath, { operation: "route" as "query" })
    ).rejects.toMatchObject({ code: "INVALID_ENTRYPOINT_OPERATION" });
    await expect(service.entrypoints(projectPath, { namePrefix: "" })).rejects.toMatchObject({
      code: "INVALID_ENTRYPOINT_NAME_PREFIX"
    });
    await expect(service.entrypoints(projectPath, { limit: 0 })).rejects.toMatchObject({
      code: "INVALID_ENTRYPOINT_LIMIT"
    });
  });

  it("indexes Python FastAPI decorator routes and supports Python source search", async () => {
    const projectPath = await createInlineProject({
      "api/main.py": [
        "from fastapi import FastAPI",
        "app = FastAPI()",
        "",
        "@app.get(\"/health\")",
        "async def health():",
        "    return {\"ok\": True}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "python" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/main.py");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedFacts).toMatchObject({
      language: "python",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/health",
        route: { kind: "route", name: "GET /health" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.fastapi.direct-app.decorator.local-function",
            stage: "syntax"
          }
        },
        handler: { qualifiedName: "api/main.py#health" }
      }
    ]);
    expect(search.results).toMatchObject([
      { filePath: "api/main.py", language: "python", matchingTerms: ["health"] }
    ]);
  });

  it("indexes direct final Django urlpatterns routes with exact local handler proof", async () => {
    const projectPath = await createInlineProject({
      "config/urls.py": [
        "from django.urls import path as url",
        "",
        "def home(request):",
        "    return \"home\"",
        "",
        "def user_detail(request, user_id):",
        "    return str(user_id)",
        "",
        "urlpatterns = [",
        "    url(\"\", home, name=\"home\"),",
        "    url(\"users/<int:user_id>/\", user_detail, name=\"user-detail\"),",
        "]"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "ALL" });
    const search = await service.search(projectPath, "user_detail", { language: "python" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/urls.py");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedFacts).toMatchObject({
      language: "python",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/",
        route: { kind: "route", name: "ALL /" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django.direct-urlpatterns.path.local-function",
            stage: "syntax"
          }
        },
        handler: { qualifiedName: "config/urls.py#home" }
      },
      {
        method: "ALL",
        path: "/users/<int:user_id>/",
        route: { kind: "route", name: "ALL /users/<int:user_id>/" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django.direct-urlpatterns.path.local-function",
            stage: "syntax"
          }
        },
        handler: { qualifiedName: "config/urls.py#user_detail" }
      }
    ]);
    expect(search.results).toMatchObject([
      { filePath: "config/urls.py", language: "python", matchingTerms: ["user_detail"] }
    ]);
  });

  it("indexes Scala source plus Play conf/routes with exact package-class-method handler proof", async () => {
    const projectPath = await createInlineProject({
      "app/controllers/HealthController.scala": [
        "package controllers",
        "",
        "class HealthController(dependency: String) {",
        "  def health(request: String): String = request",
        "}"
      ].join("\n"),
      "conf/routes": "GET /health controllers.HealthController.health(request: String)\n"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "scala" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "scala");
    const controllerFacts = persistedFacts.find(
      (facts) => facts.filePath === "app/controllers/HealthController.scala"
    );

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedFacts.map((facts) => facts.filePath)).toEqual([
      "app/controllers/HealthController.scala",
      "conf/routes"
    ]);
    expect(persistedFacts.every((facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION)).toBe(true);
    expect(controllerFacts?.scalaFacts?.classes).toHaveLength(1);
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/health",
        route: { kind: "route", name: "GET /health" },
        edge: {
          kind: "routes",
          targetId: expect.any(String),
          resolution: "exact",
          evidence: {
            ruleId: "framework.play.conf-routes.literal-controller-action.package-class-method",
            stage: "module"
          }
        },
        handler: {
          qualifiedName: "app/controllers/HealthController.scala#HealthController.health"
        }
      }
    ]);
    expect(search.results).toMatchObject([
      {
        filePath: "conf/routes",
        language: "scala",
        matchingTerms: ["health"]
      },
      {
        filePath: "app/controllers/HealthController.scala",
        language: "scala",
        matchingTerms: ["health"]
      }
    ]);

    await writeFile(join(projectPath, "app", "controllers", "Unrelated.scala"), "class Unrelated {}\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { method: "GET" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["app/controllers/Unrelated.scala"],
      reusedArtifactFiles: expect.arrayContaining([
        "app/controllers/HealthController.scala",
        "conf/routes"
      ])
    });
    expect(routesAfterReuse.routes).toMatchObject([
      {
        path: "/health",
        edge: {
          resolution: "exact",
          evidence: {
            ruleId: "framework.play.conf-routes.literal-controller-action.package-class-method"
          }
        },
        handler: {
          qualifiedName: "app/controllers/HealthController.scala#HealthController.health"
        }
      }
    ]);
  });

  it("indexes Java source plus Play conf/routes with exact package-class-method handler proof", async () => {
    const projectPath = await createInlineProject({
      "app/controllers/HealthController.java": [
        "package controllers;",
        "",
        "public class HealthController {",
        "  public String health() { return \"ok\"; }",
        "}"
      ].join("\n"),
      "conf/routes": "GET /health controllers.HealthController.health\n"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const persistedFacts = graphStore.getArtifactFacts(projectPath);

    expect(
      persistedFacts.map((facts) => [facts.filePath, facts.language, facts.javaFacts?.classes.length])
    ).toEqual([
      ["app/controllers/HealthController.java", "java", 1],
      ["conf/routes", "scala", undefined]
    ]);
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/health",
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.play.conf-routes.literal-controller-action.package-class-method",
            stage: "module"
          }
        },
        handler: {
          qualifiedName: "app/controllers/HealthController.java#HealthController.health"
        }
      }
    ]);

    await writeFile(join(projectPath, "app", "Unrelated.java"), "class Unrelated {}\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { method: "GET" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["app/Unrelated.java"],
      reusedArtifactFiles: expect.arrayContaining([
        "app/controllers/HealthController.java",
        "conf/routes"
      ])
    });
    expect(routesAfterReuse.routes).toMatchObject([
      {
        path: "/health",
        edge: {
          resolution: "exact",
          evidence: {
            ruleId: "framework.play.conf-routes.literal-controller-action.package-class-method"
          }
        },
        handler: {
          qualifiedName: "app/controllers/HealthController.java#HealthController.health"
        }
      }
    ]);
  });

  it("models literal Play router mounts as exact or unresolved handles without fabricating HTTP routes", async () => {
    const projectPath = await createInlineProject({
      "app/api/Routes.scala": [
        "package api",
        "",
        "object Routes {",
        "  def routes(): String = \"mounted\"",
        "}"
      ].join("\n"),
      "conf/routes": [
        "-> /api api.Routes",
        "-> /missing missing.Routes"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const exactMount = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "MOUNT /api -> api.Routes"
    );
    const unresolvedMount = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "MOUNT /missing -> missing.Routes"
    );
    if (exactMount === undefined || unresolvedMount === undefined) {
      throw new Error("Expected indexed Play router mount symbols.");
    }
    const exactEdge = snapshot.edges.find(
      (edge) => edge.sourceId === exactMount.id && edge.kind === "handles"
    );
    const unresolvedEdge = snapshot.edges.find(
      (edge) => edge.sourceId === unresolvedMount.id && edge.kind === "handles"
    );
    const routes = await service.routes(projectPath);
    const callees = await service.callees(projectPath, exactMount.id);

    expect(exactEdge).toMatchObject({
      kind: "handles",
      resolution: "exact",
      referenceName: "api.Routes",
      evidence: {
        ruleId: "framework.play.conf-routes.literal-router-mount.package-class",
        stage: "module"
      }
    });
    expect(unresolvedEdge).toMatchObject({
      kind: "handles",
      targetId: null,
      resolution: "unresolved",
      referenceName: "missing.Routes",
      evidence: {
        ruleId: "framework.play.conf-routes.literal-router-mount.unresolved-router",
        stage: "unresolved"
      }
    });
    expect(routes.routes).toEqual([]);
    expect(callees.relations).toMatchObject([
      {
        symbol: { qualifiedName: "app/api/Routes.scala#Routes" },
        edge: {
          kind: "handles",
          resolution: "exact",
          evidence: {
            ruleId: "framework.play.conf-routes.literal-router-mount.package-class"
          }
        }
      }
    ]);
  });

  it("keeps Play routes unresolved when package-class-method proof is incomplete", async () => {
    const projectPath = await createInlineProject({
      "app/controllers/HealthController.scala": [
        "package controllers",
        "",
        "class HealthController {",
        "  def health(): String = \"ok\"",
        "}"
      ].join("\n"),
      "conf/routes": [
        "GET /missing controllers.HealthController.missing",
        "GET /wrong-package other.HealthController.health"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/missing",
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId: "framework.play.conf-routes.literal-controller-action.unresolved-handler",
              stage: "unresolved"
            })
          }),
          handler: null
        }),
        expect.objectContaining({
          path: "/wrong-package",
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId: "framework.play.conf-routes.literal-controller-action.unresolved-handler",
              stage: "unresolved"
            })
          }),
          handler: null
        })
      ])
    );
  });

  it("keeps Play routes unresolved for overloaded direct controller methods", async () => {
    const projectPath = await createInlineProject({
      "app/controllers/HealthController.scala": [
        "package controllers",
        "",
        "class HealthController {",
        "  def health(): String = \"ok\"",
        "  def health(value: String): String = value",
        "}"
      ].join("\n"),
      "conf/routes": "GET /health controllers.HealthController.health\n"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/health",
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId: "framework.play.conf-routes.literal-controller-action.unresolved-handler",
              stage: "unresolved"
            })
          }),
          handler: null
        })
      ])
    );
  });

  it("indexes same-file FastAPI APIRouter routes through literal prefixes", async () => {
    const projectPath = await createInlineProject({
      "api/catalog.py": [
        "from fastapi import APIRouter, FastAPI",
        "app = FastAPI()",
        "router = APIRouter(prefix=\"/catalog\")",
        "",
        "@router.get(\"/health\")",
        "async def health():",
        "    return {\"ok\": True}",
        "",
        "app.include_router(router, prefix=\"/api\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/catalog.py");

    expect(persistedFacts).toMatchObject({
      language: "python",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/api/catalog/health",
        route: { kind: "route", name: "GET /api/catalog/health" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.fastapi.direct-router.include-router.decorator.local-function",
            stage: "syntax"
          }
        },
        handler: { qualifiedName: "api/catalog.py#health" }
      }
    ]);
  });

  it("indexes direct package-relative FastAPI APIRouter modules through literal prefixes", async () => {
    const projectPath = await createInlineProject({
      "api/__init__.py": "",
      "api/routers/__init__.py": "",
      "api/routers/catalog.py": [
        "from fastapi import APIRouter",
        "router = APIRouter(prefix=\"/catalog\")",
        "",
        "@router.get(\"/health\")",
        "async def health():",
        "    return {\"ok\": True}"
      ].join("\n"),
      "api/main.py": [
        "from fastapi import FastAPI as Api",
        "from .routers.catalog import router as catalog_router",
        "app = Api()",
        "app.include_router(catalog_router, prefix=\"/api\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/main.py");
    const routerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/routers/catalog.py");

    expect(mainFacts?.fastApiRouterFacts).toMatchObject({
      importedRouterInclusions: [
        {
          moduleSpecifier: ".routers.catalog",
          importedRouterName: "router",
          routerName: "catalog_router",
          prefix: "/api"
        }
      ]
    });
    expect(routerFacts?.fastApiRouterFacts).toMatchObject({
      routers: [{ name: "router", prefix: "/catalog" }],
      routes: [{ routerName: "router", method: "GET", path: "/health" }]
    });
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/api/catalog/health",
        route: {
          kind: "route",
          name: "GET /api/catalog/health",
          filePath: "api/routers/catalog.py"
        },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.fastapi.imported-router.include-router.decorator.local-function",
            stage: "module",
            resolutionPath: ["api/main.py", "api/routers/catalog.py"]
          }
        },
        handler: { qualifiedName: "api/routers/catalog.py#health" }
      }
    ]);
  });

  it("does not project FastAPI router modules without a proven package boundary", async () => {
    const projectPath = await createInlineProject({
      "api/routers/catalog.py": [
        "from fastapi import APIRouter",
        "router = APIRouter()",
        "",
        "@router.get(\"/health\")",
        "async def health():",
        "    return {\"ok\": True}"
      ].join("\n"),
      "api/main.py": [
        "from fastapi import FastAPI",
        "from .routers.catalog import router",
        "app = FastAPI()",
        "app.include_router(router, prefix=\"/api\")"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
  });

  it("indexes direct Flask and same-file Blueprint routes with exact syntax evidence", async () => {
    const projectPath = await createInlineProject({
      "app/main.py": [
        "from flask import Blueprint as BP, Flask as App",
        "app = App(__name__)",
        "catalog = BP(\"catalog\", __name__, url_prefix=\"/catalog\")",
        "",
        "@app.route(\"/health\", methods=[\"GET\", \"POST\"])",
        "def health():",
        "    return {\"ok\": True}",
        "",
        "@catalog.get(\"/items\")",
        "def items():",
        "    return []",
        "",
        "app.register_blueprint(catalog, url_prefix=\"/api\")"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "app/main.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.flask.direct-app.decorator.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "app/main.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.flask.direct-app.decorator.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/api/catalog/items",
          handler: expect.objectContaining({ qualifiedName: "app/main.py#items" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.flask.direct-blueprint.register-blueprint.decorator.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
  });

  it("indexes Go Gin engine and literal group routes with exact syntax evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        'import "github.com/gin-gonic/gin"',
        "",
        "func health(c *gin.Context) {}",
        "func listUsers(c *gin.Context) {}",
        "",
        "func main() {",
        "  router := gin.Default()",
        "  router.GET(\"/health\", health)",
        "  api := router.Group(\"/api\")",
        "  api.GET(\"/users\", listUsers)",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.gin.direct-engine.method.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/api/users",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#listUsers" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.gin.direct-group.method.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
  });

  it("indexes Go Fiber v2 App and literal Group routes with exact syntax evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        'import "github.com/gofiber/fiber/v2"',
        "",
        "func health(c fiber.Ctx) error { return nil }",
        "func deleteUser(c fiber.Ctx) error { return nil }",
        "",
        "func main() {",
        "  app := fiber.New()",
        '  app.Get("/health", health)',
        '  api := app.Group("/api")',
        '  api.Delete("/users", deleteUser)',
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const deleteRoutes = await service.routes(projectPath, { method: "DELETE" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fiber.direct-app.method.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "DELETE",
          path: "/api/users",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#deleteUser" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fiber.direct-group.method.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(deleteRoutes.routes).toMatchObject([
      {
        method: "DELETE",
        path: "/api/users",
        handler: { qualifiedName: "cmd/server/main.go#deleteUser" },
        edge: {
          resolution: "exact",
          evidence: { ruleId: "framework.fiber.direct-group.method.local-function", stage: "syntax" }
        }
      }
    ]);
  });

  it("indexes Go Echo v4 App and literal Group routes with exact syntax evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        'import "github.com/labstack/echo/v4"',
        "",
        "func health(c echo.Context) error { return nil }",
        "func fallback(c echo.Context) error { return nil }",
        "",
        "func main() {",
        "  app := echo.New()",
        '  app.GET("/health", health)',
        '  api := app.Group("/api")',
        '  api.Any("/fallback", fallback)',
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const allRoutes = await service.routes(projectPath, { method: "ALL" });
    const search = await service.search(projectPath, "fallback", { language: "go" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.echo.direct-app.method.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "ALL",
          path: "/api/fallback",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#fallback" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.echo.direct-group.method.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(allRoutes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/api/fallback",
        handler: { qualifiedName: "cmd/server/main.go#fallback" }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "cmd/server/main.go", language: "go" }]);
  });

  it("indexes Go net/http default and literal ServeMux routes with exact syntax evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        'import "net/http"',
        "",
        "func health(w http.ResponseWriter, r *http.Request) {}",
        "func listUsers(w http.ResponseWriter, r *http.Request) {}",
        "",
        "func main() {",
        "  http.HandleFunc(\"/health\", health)",
        "  mux := http.NewServeMux()",
        "  mux.HandleFunc(\"GET /users\", listUsers)",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "ALL",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.net-http.default-serve-mux.handle-func.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/users",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#listUsers" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.net-http.serve-mux.handle-func.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
  });

  it("indexes Go Chi routes and filters CONNECT evidence through the persisted route query", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        "import (",
        '  "net/http"',
        '  chi "github.com/go-chi/chi/v5"',
        ")",
        "",
        "func health(w http.ResponseWriter, r *http.Request) {}",
        "func tunnel(w http.ResponseWriter, r *http.Request) {}",
        "func fallback(w http.ResponseWriter, r *http.Request) {}",
        "",
        "func main() {",
        "  router := chi.NewRouter()",
        "  router.Get(\"/health\", health)",
        "  router.Connect(\"/tunnel\", tunnel)",
        "  router.HandleFunc(\"/fallback\", fallback)",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const connectRoutes = await service.routes(projectPath, { method: "CONNECT" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.chi.direct-router.method.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "ALL",
          path: "/fallback",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#fallback" })
        })
      ])
    );
    expect(connectRoutes.routes).toMatchObject([
      {
        method: "CONNECT",
        path: "/tunnel",
        handler: { qualifiedName: "cmd/server/main.go#tunnel" },
        edge: {
          resolution: "exact",
          evidence: { ruleId: "framework.chi.direct-router.method.local-function", stage: "syntax" }
        }
      }
    ]);
  });

  it("indexes Rust Axum routes and retains Rust source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/http.rs": [
        "use axum::{Router, routing::{get, post}};",
        "",
        "async fn health() {}",
        "async fn create_user() {}",
        "",
        "fn app() {",
        "  let app = Router::new()",
        "    .route(\"/health\", get(health))",
        "    .route(\"/users\", post(create_user));",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "rust" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.axum.direct-router.route.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#create_user" })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/health",
        handler: { qualifiedName: "src/http.rs#health" },
        edge: {
          resolution: "exact",
          evidence: { ruleId: "framework.axum.direct-router.route.local-function", stage: "syntax" }
        }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "src/http.rs", language: "rust" }]);
  });

  it("indexes Java Spring Web routes and retains Java source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/api/StatusController.java": [
        "import org.springframework.web.bind.annotation.RestController;",
        "import org.springframework.web.bind.annotation.RequestMapping;",
        "import org.springframework.web.bind.annotation.GetMapping;",
        "import org.springframework.web.bind.annotation.PostMapping;",
        "",
        "@RestController",
        "@RequestMapping(\"/system\")",
        "public class StatusController {",
        "  @GetMapping(\"/health\")",
        "  public String health() { return \"ok\"; }",
        "",
        "  @PostMapping(path = \"/refresh\")",
        "  public String refresh() { return \"ok\"; }",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "java" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/system/health",
          handler: expect.objectContaining({
            qualifiedName: "src/api/StatusController.java#StatusController.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.spring-web.direct-controller.literal-method-mapping.local-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/system/refresh",
          handler: expect.objectContaining({
            qualifiedName: "src/api/StatusController.java#StatusController.refresh"
          })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/system/health",
        handler: { qualifiedName: "src/api/StatusController.java#StatusController.health" },
        edge: {
          resolution: "exact",
          evidence: {
            ruleId: "framework.spring-web.direct-controller.literal-method-mapping.local-method",
            stage: "syntax"
          }
        }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "src/api/StatusController.java", language: "java" }]);
  });

  it("indexes Java Micronaut Controller routes with persisted source evidence", async () => {
    const projectPath = await createInlineProject({
      "src/api/CatalogController.java": [
        "import io.micronaut.http.annotation.Controller;",
        "import io.micronaut.http.annotation.Get;",
        "import io.micronaut.http.annotation.Post;",
        "",
        "@Controller(\"/catalog\")",
        "public class CatalogController {",
        "  @Get",
        "  public String index() { return \"[]\"; }",
        "",
        "  @Post(uri = \"/refresh\")",
        "  public String refresh() { return \"ok\"; }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "catalog", { language: "java" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/api/CatalogController.java");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 6, edges: 7 }
    });
    expect(persistedFacts).toMatchObject({
      language: "java",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/catalog",
          handler: expect.objectContaining({
            qualifiedName: "src/api/CatalogController.java#CatalogController.index"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.micronaut.direct-controller.literal-method-mapping.local-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/catalog/refresh",
          handler: expect.objectContaining({
            qualifiedName: "src/api/CatalogController.java#CatalogController.refresh"
          })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/catalog",
        handler: { qualifiedName: "src/api/CatalogController.java#CatalogController.index" },
        edge: {
          resolution: "exact",
          evidence: {
            ruleId: "framework.micronaut.direct-controller.literal-method-mapping.local-method",
            stage: "syntax"
          }
        }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "src/api/CatalogController.java", language: "java" }]);
  });

  it("indexes PHP Laravel facade routes with explicit unresolved cross-file controller evidence", async () => {
    const projectPath = await createInlineProject({
      "routes/web.php": [
        "<?php",
        "use Illuminate\\Support\\Facades\\Route;",
        "",
        "Route::get('/catalog', [CatalogController::class, 'index']);"
      ].join("\n"),
      "app/Http/Controllers/CatalogController.php": [
        "<?php",
        "namespace App\\Http\\Controllers;",
        "",
        "class CatalogController {",
        "  public function index(): string { return 'catalog'; }",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "catalog", { language: "php" });

    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/catalog",
        handler: null,
        edge: {
          resolution: "unresolved",
          confidence: 0,
          referenceName: "CatalogController@index",
          evidence: {
            ruleId:
              "framework.laravel.direct-facade.literal-controller-action.unresolved-controller-method",
            stage: "syntax",
            candidateSymbolIds: []
          }
        }
      }
    ]);
    expect(search.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ filePath: "routes/web.php", language: "php" })])
    );
  });

  it("indexes C++ cpp-httplib routes and retains C++ source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/server.cpp": [
        "#include <httplib.h>",
        "",
        "void health(const httplib::Request &, httplib::Response &) {}",
        "void create_user(const httplib::Request &, httplib::Response &) {}",
        "",
        "int main() {",
        "  httplib::Server server;",
        "  server.Get(\"/health\", health);",
        "  server.Post(\"/users\", create_user);",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "cpp" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/server.cpp#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.cpp-httplib.direct-server.literal-route.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({ qualifiedName: "src/server.cpp#create_user" })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/health",
        handler: { qualifiedName: "src/server.cpp#health" },
        edge: {
          resolution: "exact",
          evidence: {
            ruleId: "framework.cpp-httplib.direct-server.literal-route.local-function",
            stage: "syntax"
          }
        }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "src/server.cpp", language: "cpp" }]);
  });

  it("indexes C CivetWeb routes and retains C source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/server.c": [
        "#include <civetweb.h>",
        "",
        "int health(struct mg_connection *conn, void *ignored) { return 200; }",
        "int create_user(struct mg_connection *conn, void *ignored) { return 201; }",
        "",
        "void configure(struct mg_context *ctx) {",
        '  mg_set_request_handler(ctx, "/health", health, NULL);',
        '  mg_set_request_handler(ctx, "/users", create_user, NULL);',
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const allRoutes = await service.routes(projectPath, { method: "ALL" });
    const search = await service.search(projectPath, "health", { language: "c" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "ALL",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/server.c#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.civetweb.direct-request-handler.literal-uri.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "ALL",
          path: "/users",
          handler: expect.objectContaining({ qualifiedName: "src/server.c#create_user" })
        })
      ])
    );
    expect(allRoutes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/health",
        handler: { qualifiedName: "src/server.c#health" }
      },
      {
        method: "ALL",
        path: "/users",
        handler: { qualifiedName: "src/server.c#create_user" }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "src/server.c", language: "c" }]);
  });

  it("indexes Lua Lapis routes and retains Lua source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/app.lua": [
        'local lapis = require("lapis")',
        "local app = lapis.Application()",
        "",
        "local function health(self)",
        '  return "ok"',
        "end",
        "local function create_user(self)",
        '  return "created"',
        "end",
        "",
        'app:get("/health", health)',
        'app:post("create-user", "/users", create_user)'
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "lua" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/app.lua#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.lapis.direct-application.literal-route.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({ qualifiedName: "src/app.lua#create_user" })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/health",
        handler: { qualifiedName: "src/app.lua#health" }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "src/app.lua", language: "lua" }]);
  });

  it("indexes Luau source while keeping Lua-only Lapis route inference disabled", async () => {
    const projectPath = await createInlineProject({
      "src/avatar.luau": [
        "--!strict",
        "export type Avatar = { id: number }",
        "",
        "local function greet(avatar: Avatar): string",
        '  return "hello"',
        "end",
        "",
        "export function publish(avatar: Avatar): boolean",
        "  return avatar.id > 0",
        "end",
        "",
        'local app = require("lapis").Application()',
        'app:get("/ignored", greet)'
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "publish", { language: "luau" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/avatar.luau");
    const publish = await service.find(projectPath, "src/avatar.luau#publish");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedFacts).toMatchObject({
      language: "luau",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(publish.symbols).toMatchObject([
      { kind: "function", qualifiedName: "src/avatar.luau#publish", isExported: true }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([{ filePath: "src/avatar.luau", language: "luau" }]);
  });

  it("indexes Pascal source and retains Pascal source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/health.pas": [
        "program Health;",
        "",
        "procedure Check;",
        "begin",
        "end;",
        "",
        "begin",
        "end."
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "Check", { language: "pascal" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/health.pas");
    const check = await service.find(projectPath, "src/health.pas#Check");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedFacts).toMatchObject({
      language: "pascal",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(check.symbols).toMatchObject([
      { kind: "function", qualifiedName: "src/health.pas#Check", isExported: true }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([{ filePath: "src/health.pas", language: "pascal" }]);
  });

  it("indexes a source-proven COBOL program and retains COBOL source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "cobol/Billing.cbl": [
        "       IDENTIFICATION DIVISION.",
        "       PROGRAM-ID. BILLING-REPORT.",
        "       PROCEDURE DIVISION.",
        "       MAIN-LOGIC.",
        "           DISPLAY \"ready\".",
        "       FINISH-REPORT.",
        "           GOBACK.",
        "       END PROGRAM BILLING-REPORT."
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "BILLING", { language: "cobol" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "cobol/Billing.cbl");
    const mainLogic = await service.find(
      projectPath,
      "cobol/Billing.cbl#program:BILLING-REPORT#paragraph:MAIN-LOGIC"
    );

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedFacts).toMatchObject({
      language: "cobol",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(mainLogic.symbols).toMatchObject([
      {
        kind: "function",
        qualifiedName: "cobol/Billing.cbl#program:BILLING-REPORT#paragraph:MAIN-LOGIC",
        isExported: false
      }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([{ filePath: "cobol/Billing.cbl", language: "cobol" }]);
  });

  it("indexes Objective-C++ interfaces, protocols, and implementations with Objective-C source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/HealthController.mm": [
        "@interface HealthController : NSObject",
        "- (void)declaredOnly;",
        "@end",
        "",
        "@protocol HealthChecking",
        "- (BOOL)isHealthy;",
        "@end",
        "",
        "@implementation HealthController",
        "- (void)health {",
        "}",
        "- (void)create:(NSString *)name with:(id)context {",
        "}",
        "@end"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "HealthController", { language: "objc" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/HealthController.mm");
    const health = await service.find(
      projectPath,
      "src/HealthController.mm#HealthController.health"
    );
    const healthChecking = await service.find(
      projectPath,
      "src/HealthController.mm#protocol:HealthChecking.isHealthy"
    );

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedFacts).toMatchObject({
      language: "objc",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(health.symbols).toMatchObject([
      {
        kind: "method",
        qualifiedName: "src/HealthController.mm#HealthController.health",
        isExported: true
      }
    ]);
    expect(healthChecking.symbols).toMatchObject([
      {
        kind: "method",
        qualifiedName: "src/HealthController.mm#protocol:HealthChecking.isHealthy",
        isExported: true
      }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "src/HealthController.mm", language: "objc" }
    ]);
  });

  it("indexes source-proven Objective-C headers without admitting ordinary C headers", async () => {
    const projectPath = await createInlineProject({
      "Headers/HealthController.h": [
        "#import <Foundation/Foundation.h>",
        "@interface HealthController : NSObject",
        "- (void)check;",
        "@end",
        "",
        "@protocol HealthChecking",
        "- (BOOL)isHealthy;",
        "@end"
      ].join("\n"),
      "Headers/PlainC.h": "typedef struct { int status; } HealthStatus;\n"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "HealthController", { language: "objc" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "Headers/HealthController.h");
    const health = await service.find(
      projectPath,
      "Headers/HealthController.h#HealthController.check"
    );
    const healthChecking = await service.find(
      projectPath,
      "Headers/HealthController.h#protocol:HealthChecking.isHealthy"
    );

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedFacts).toMatchObject({
      language: "objc",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(health.symbols).toMatchObject([
      {
        kind: "method",
        qualifiedName: "Headers/HealthController.h#HealthController.check",
        isExported: true
      }
    ]);
    expect(healthChecking.symbols).toMatchObject([
      {
        kind: "method",
        qualifiedName: "Headers/HealthController.h#protocol:HealthChecking.isHealthy",
        isExported: true
      }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "Headers/HealthController.h", language: "objc" }
    ]);
  });

  it("indexes proven Pascal Horse routes with their prior local handlers", async () => {
    const projectPath = await createInlineProject({
      "src/server.pas": [
        "program Server;",
        "",
        "uses Horse;",
        "",
        "procedure Health(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "procedure CreateUser(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "procedure UpdateUser(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "procedure PatchUser(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "procedure DeleteUser(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "procedure HeadHealth(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "begin",
        "  THorse.Get('/health', health);",
        "  THorse.Post('/users', CreateUser);",
        "  THorse.Put('/users', UpdateUser);",
        "  THorse.Patch('/users', PatchUser);",
        "  THorse.Delete('/users', DeleteUser);",
        "  THorse.Head('/health', HeadHealth);",
        "end."
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const putRoutes = await service.routes(projectPath, { method: "PUT" });
    const patchRoutes = await service.routes(projectPath, { method: "PATCH" });
    const deleteRoutes = await service.routes(projectPath, { method: "DELETE" });
    const headRoutes = await service.routes(projectPath, { method: "HEAD" });
    const search = await service.search(projectPath, "CreateUser", { language: "pascal" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/server.pas");

    expect(persistedFacts).toMatchObject({
      language: "pascal",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/server.pas#Health" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.horse.direct-uses.literal-route.local-routine",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({ qualifiedName: "src/server.pas#CreateUser" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.horse.direct-uses.literal-route.local-routine",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "PUT",
          path: "/users",
          handler: expect.objectContaining({ qualifiedName: "src/server.pas#UpdateUser" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.horse.direct-uses.literal-route.local-routine",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/users",
          handler: expect.objectContaining({ qualifiedName: "src/server.pas#PatchUser" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.horse.direct-uses.literal-route.local-routine",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "DELETE",
          path: "/users",
          handler: expect.objectContaining({ qualifiedName: "src/server.pas#DeleteUser" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.horse.direct-uses.literal-route.local-routine",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "HEAD",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/server.pas#HeadHealth" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.horse.direct-uses.literal-route.local-routine",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([{ method: "GET", path: "/health" }]);
    expect(putRoutes.routes).toMatchObject([{ method: "PUT", path: "/users" }]);
    expect(patchRoutes.routes).toMatchObject([{ method: "PATCH", path: "/users" }]);
    expect(deleteRoutes.routes).toMatchObject([{ method: "DELETE", path: "/users" }]);
    expect(headRoutes.routes).toMatchObject([{ method: "HEAD", path: "/health" }]);
    expect(search.results).toMatchObject([{ filePath: "src/server.pas", language: "pascal" }]);
  });

  it("indexes R Plumber annotation routes and retains R source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/plumber.R": [
        "#* @get /health",
        "function() {",
        '  list(status = "ok")',
        "}",
        "",
        "#* @post /users",
        "function(name) {",
        "  list(name = name)",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "r" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/plumber.R#handler:GET:/health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.plumber.annotation.literal-route.braced-handler",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({
            qualifiedName: "src/plumber.R#handler:POST:/users"
          })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/health",
        handler: { qualifiedName: "src/plumber.R#handler:GET:/health" }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "src/plumber.R", language: "r" }]);
  });

  it("indexes Elixir Phoenix routes and retains Elixir source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/router.ex": [
        "defmodule DemoWeb.Router do",
        "  use Phoenix.Router",
        "",
        "  scope \"/api\" do",
        "    get \"/health\", DemoWeb.HealthController, :index",
        "    post \"/users\", DemoWeb.UsersController, :create",
        "  end",
        "end",
        "",
        "defmodule DemoWeb.HealthController do",
        "  def index(conn, params) do",
        "    {conn, params}",
        "  end",
        "end"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "elixir" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/api/health",
          handler: expect.objectContaining({
            qualifiedName: "src/router.ex#DemoWeb.HealthController.index"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.phoenix.direct-router.literal-verb.full-module-controller-action.local-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/api/users",
          handler: null,
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId:
                "framework.phoenix.direct-router.literal-verb.full-module-controller-action.unresolved-controller-method"
            })
          })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/api/health",
        handler: { qualifiedName: "src/router.ex#DemoWeb.HealthController.index" }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "src/router.ex", language: "elixir" }]);
  });

  it("indexes Erlang Cowboy routes and retains Erlang source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/demo_handler.erl": [
        "-module(demo_handler).",
        "-export([start/2, init/2]).",
        "",
        "start(_Type, _Args) ->",
        "    Dispatch = cowboy_router:compile([",
        "        {'_', [",
        "            {\"/health\", demo_handler, #{}},",
        "            {\"/users\", users_handler, []}",
        "        ]}",
        "    ]),",
        "    cowboy:start_clear(demo_listener, [{port, 8080}], #{env => #{dispatch => Dispatch}}).",
        "",
        "init(Req0, State) ->",
        "    {ok, Req0, State}."
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const allRoutes = await service.routes(projectPath, { method: "ALL" });
    const search = await service.search(projectPath, "health", { language: "erlang" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "ALL",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/demo_handler.erl#demo_handler.init/2"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.cowboy.direct-router.literal-wildcard-host.local-exported-init",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "ALL",
          path: "/users",
          handler: null,
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId: "framework.cowboy.direct-router.literal-wildcard-host.unresolved-handler-init"
            })
          })
        })
      ])
    );
    expect(allRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "ALL",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/demo_handler.erl#demo_handler.init/2"
          })
        })
      ])
    );
    expect(search.results).toMatchObject([{ filePath: "src/demo_handler.erl", language: "erlang" }]);
  });

  it("indexes Clojure Compojure routes and retains Clojure source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/demo/routes.clj": [
        "(ns demo.routes",
        "  (:require [compojure.core :refer [defroutes GET POST]]))",
        "",
        "(defn health [request]",
        "  {:status 200})",
        "",
        "(defroutes app-routes",
        "  (GET \"/health\" [] health)",
        "  (POST \"/users\" [] create-user))"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "clojure" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/demo/routes.clj#demo.routes.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.compojure.direct-defroutes.literal-verb.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: null,
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId: "framework.compojure.direct-defroutes.literal-verb.unresolved-function"
            })
          })
        })
      ])
    );
    expect(getRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/demo/routes.clj#demo.routes.health"
          })
        })
      ])
    );
    expect(search.results).toMatchObject([{ filePath: "src/demo/routes.clj", language: "clojure" }]);
  });

  it("indexes Perl Dancer2 routes and retains Perl source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/Demo/App.pm": [
        "package Demo::App;",
        "use Dancer2;",
        "",
        "sub health {",
        "  return \"ok\";",
        "}",
        "",
        "get \"/health\" => \\&health;",
        "post \"/users\" => \\&create_user;"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "perl" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/Demo/App.pm#Demo::App.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.dancer2.direct-route.literal-verb.local-sub",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: null,
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId: "framework.dancer2.direct-route.literal-verb.unresolved-sub"
            })
          })
        })
      ])
    );
    expect(getRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/Demo/App.pm#Demo::App.health"
          })
        })
      ])
    );
    expect(search.results).toMatchObject([{ filePath: "src/Demo/App.pm", language: "perl" }]);
  });

  it("indexes Julia Genie routes and retains Julia source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/app.jl": [
        "using Genie, Genie.Requests",
        "",
        "health() = \"ok\"",
        "create_user() = \"created\"",
        "",
        "route(\"/health\", health)",
        "route(\"/users\", create_user, method = POST)",
        "route(\"/missing\", missing, method = PATCH)"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const postRoutes = await service.routes(projectPath, { method: "POST" });
    const search = await service.search(projectPath, "health", { language: "julia" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/app.jl.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.genie.direct-route.literal-named-function.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({
            qualifiedName: "src/app.jl.create_user"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.genie.direct-route.literal-named-function.local-function"
            })
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/missing",
          handler: null,
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId: "framework.genie.direct-route.literal-named-function.unresolved"
            })
          })
        })
      ])
    );
    expect(postRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({
            qualifiedName: "src/app.jl.create_user"
          })
        })
      ])
    );
    expect(search.results).toMatchObject([{ filePath: "src/app.jl", language: "julia" }]);
  });

  it("indexes Haskell Scotty routes and retains Haskell source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/App.hs": [
        "import Web.Scotty",
        "",
        "main = scotty 3000 $ do",
        "  get \"/health\" health",
        "  post \"/users\" $ createUser",
        "  patch \"/missing\" missing",
        "",
        "health = text \"ok\"",
        "createUser = text \"created\""
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const postRoutes = await service.routes(projectPath, { method: "POST" });
    const search = await service.search(projectPath, "health", { language: "haskell" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/App.hs.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.scotty.direct-block.literal-named-function.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({
            qualifiedName: "src/App.hs.createUser"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.scotty.direct-block.literal-named-function.local-function"
            })
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/missing",
          handler: null,
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId: "framework.scotty.direct-block.literal-named-function.unresolved"
            })
          })
        })
      ])
    );
    expect(postRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({
            qualifiedName: "src/App.hs.createUser"
          })
        })
      ])
    );
    expect(search.results).toMatchObject([{ filePath: "src/App.hs", language: "haskell" }]);
  });

  it("indexes OCaml Dream routes and retains OCaml source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/app.ml": [
        "let health _ = Dream.html \"ok\"",
        "let create_user _ = Dream.html \"created\"",
        "",
        "let () =",
        "  Dream.run",
        "  @@ Dream.router [",
        "    Dream.get \"/health\" health;",
        "    Dream.post \"/users\" @@ create_user;",
        "    Dream.any \"/missing\" missing;",
        "  ]"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const postRoutes = await service.routes(projectPath, { method: "POST" });
    const search = await service.search(projectPath, "health", { language: "ocaml" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/app.ml.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.dream.direct-router.literal-named-function.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "ALL",
          path: "/missing",
          handler: null,
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId: "framework.dream.direct-router.literal-named-function.unresolved"
            })
          })
        })
      ])
    );
    expect(postRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({
            qualifiedName: "src/app.ml.create_user"
          })
        })
      ])
    );
    expect(search.results).toMatchObject([{ filePath: "src/app.ml", language: "ocaml" }]);
  });

  it("indexes F# Giraffe routes and retains F# source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/App.fs": [
        "open Giraffe",
        "",
        "let health (next : HttpFunc) (ctx : HttpContext) =",
        "  text \"ok\" next ctx",
        "",
        "let createUser (next : HttpFunc) (ctx : HttpContext) =",
        "  text \"created\" next ctx",
        "",
        "let webApp =",
        "  choose [",
        "    GET >=> route \"/health\" >=> health",
        "    POST >=> route \"/users\" >=> createUser",
        "    route \"/all\" >=> health",
        "    PATCH >=> route \"/missing\" >=> missing",
        "  ]"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const postRoutes = await service.routes(projectPath, { method: "POST" });
    const search = await service.search(projectPath, "health", { language: "fsharp" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/App.fs.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.giraffe.direct-choose.literal-named-function.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "ALL",
          path: "/all",
          handler: expect.objectContaining({
            qualifiedName: "src/App.fs.health"
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/missing",
          handler: null,
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId: "framework.giraffe.direct-choose.literal-named-function.unresolved"
            })
          })
        })
      ])
    );
    expect(postRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({
            qualifiedName: "src/App.fs.createUser"
          })
        })
      ])
    );
    expect(search.results).toMatchObject([{ filePath: "src/App.fs", language: "fsharp" }]);
  });

  it("indexes Nim Jester routes and retains Nim source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/app.nim": [
        "import asyncdispatch, jester",
        "",
        "proc health*() =",
        "  discard",
        "",
        "proc createUser() =",
        "  discard",
        "",
        "routes:",
        "  get \"/health\":",
        "    health()",
        "  post \"/users\":",
        "    createUser()",
        "  patch \"/missing\":",
        "    missing()",
        "",
        "router admin:",
        "  delete \"/users\":",
        "    health()"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const postRoutes = await service.routes(projectPath, { method: "POST" });
    const search = await service.search(projectPath, "health", { language: "nim" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({
            qualifiedName: "src/app.nim.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.jester.direct-route-block.literal-named-proc.local-proc",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/missing",
          handler: null,
          edge: expect.objectContaining({
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId: "framework.jester.direct-route-block.literal-named-proc.unresolved"
            })
          })
        }),
        expect.objectContaining({
          method: "DELETE",
          path: "/users",
          handler: expect.objectContaining({
            qualifiedName: "src/app.nim.health"
          })
        })
      ])
    );
    expect(postRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "POST",
          path: "/users",
          handler: expect.objectContaining({
            qualifiedName: "src/app.nim.createUser"
          })
        })
      ])
    );
    expect(search.results).toMatchObject([{ filePath: "src/app.nim", language: "nim" }]);
  });

  it("indexes C# ASP.NET Core routes and retains C# source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/Program.cs": [
        "using Microsoft.AspNetCore.Mvc;",
        "",
        "var builder = WebApplication.CreateBuilder(args);",
        "var app = builder.Build();",
        "app.MapGet(\"/health\", Health);",
        "static string Health() => \"ok\";",
        "",
        "[ApiController]",
        "[Route(\"api/orders\")]",
        "public class OrdersController {",
        "  [HttpPost(\"create\")]",
        "  public void Create() {}",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "csharp" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/Program.cs#Health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.aspnet-core.direct-web-application.literal-route.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/api/orders/create",
          handler: expect.objectContaining({
            qualifiedName: "src/Program.cs#OrdersController.Create"
          }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.aspnet-core.direct-api-controller.literal-route.method"
            })
          })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/health",
        handler: { qualifiedName: "src/Program.cs#Health" }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "src/Program.cs", language: "csharp" }]);
  });

  it("indexes Ruby Rails routes and retains explicit unresolved controller evidence", async () => {
    const projectPath = await createInlineProject({
      "config/routes.rb": [
        "Rails.application.routes.draw do",
        "  get \"/health\", to: \"health#show\"",
        "  post \"/orders\", to: \"orders#create\"",
        "end"
      ].join("\n"),
      "app/controllers/health_controller.rb": [
        "class HealthController",
        "  def show",
        "  end",
        "end"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "ruby" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: null,
          edge: expect.objectContaining({
            referenceName: "health#show",
            resolution: "unresolved",
            evidence: expect.objectContaining({
              ruleId:
                "framework.rails.direct-routes-draw.literal-controller-action.unresolved-controller-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/orders",
          handler: null,
          edge: expect.objectContaining({ referenceName: "orders#create", resolution: "unresolved" })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/health",
        handler: null,
        edge: {
          resolution: "unresolved",
          referenceName: "health#show"
        }
      }
    ]);
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "config/routes.rb", language: "ruby" }),
        expect.objectContaining({ filePath: "app/controllers/health_controller.rb", language: "ruby" })
      ])
    );
  });

  it("indexes Kotlin Ktor callable-reference routes as persisted exact function evidence", async () => {
    const projectPath = await createInlineProject({
      "src/Application.kt": [
        "import io.ktor.server.application.Application",
        "import io.ktor.server.routing.routing",
        "import io.ktor.server.routing.get",
        "import io.ktor.server.routing.post",
        "",
        "fun Application.module() {",
        "  routing {",
        "    get(\"/health\", ::health)",
        "    post(\"/orders\", ::createOrder)",
        "  }",
        "}",
        "",
        "fun health() {}",
        "fun createOrder() {}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "kotlin" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/Application.kt#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.ktor.direct-application-module.routing.literal-route.callable-reference.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/orders",
          handler: expect.objectContaining({ qualifiedName: "src/Application.kt#createOrder" })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/health",
        handler: { qualifiedName: "src/Application.kt#health" }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "src/Application.kt", language: "kotlin" }]);
  });

  it("indexes NestJS decorator routes as persisted exact method evidence", async () => {
    const projectPath = await createInlineProject({
      "src/cats.controller.ts": [
        'import { Controller as ApiController, Get, Post as Create } from "@nestjs/common";',
        "@ApiController(\"api/cats\")",
        "export class CatsController {",
        "  @Get()",
        "  findAll() { return []; }",
        "",
        "  @Create(\":id\")",
        "  replaceOne() { return []; }",
        "}"
      ].join("\n")
    });
    const service = createService();

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const findAll = await service.find(projectPath, "src/cats.controller.ts#CatsController.findAll");
    const handler = findAll.symbols[0];
    if (handler === undefined) {
      throw new Error("Expected indexed NestJS method handler.");
    }
    const callers = await service.callers(projectPath, handler.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/api/cats",
        route: { kind: "route", name: "GET /api/cats" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.nestjs.decorator-route.local-method", stage: "syntax" }
        },
        handler: { qualifiedName: "src/cats.controller.ts#CatsController.findAll" }
      },
      {
        method: "POST",
        path: "/api/cats/:id",
        route: { kind: "route", name: "POST /api/cats/:id" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.nestjs.decorator-route.local-method", stage: "syntax" }
        },
        handler: { qualifiedName: "src/cats.controller.ts#CatsController.replaceOne" }
      }
    ]);
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "GET /api/cats" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.nestjs.decorator-route.local-method", stage: "syntax" }
        }
      }
    ]);
  });

  it("indexes Fastify shorthand and full-object routes with exact imported handler evidence", async () => {
    const projectPath = await createInlineProject({
      "src/handlers.ts": [
        "export function listUsers() { return []; }",
        "export function createJob() { return undefined; }"
      ].join("\n"),
      "src/routes.ts": [
        'import Fastify from "fastify";',
        'import { createJob, listUsers } from "./handlers.js";',
        "const app = Fastify();",
        'app.get("/users", listUsers);',
        'app.route({ method: ["POST", "TRACE"], url: "/jobs", handler: createJob });'
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const traceRoutes = await service.routes(projectPath, { method: "TRACE" });
    const persistedFastifyFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/routes.ts");
    const found = await service.find(projectPath, "src/handlers.ts#listUsers");
    const listUsers = found.symbols[0];
    if (listUsers === undefined) {
      throw new Error("Expected indexed Fastify handler.");
    }
    const callers = await service.callers(projectPath, listUsers.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(
      persistedFastifyFacts?.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => reference.routeFramework)
    ).toEqual(["fastify", "fastify", "fastify"]);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/users",
          route: expect.objectContaining({ kind: "route", name: "GET /users" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastify.static-route.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#listUsers" })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/jobs",
          route: expect.objectContaining({ kind: "route", name: "POST /jobs" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastify.static-route.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#createJob" })
        }),
        expect.objectContaining({
          method: "TRACE",
          path: "/jobs",
          route: expect.objectContaining({ kind: "route", name: "TRACE /jobs" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastify.static-route.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#createJob" })
        })
      ])
    );
    expect(traceRoutes.routes).toMatchObject([
      {
        method: "TRACE",
        path: "/jobs",
        handler: { qualifiedName: "src/handlers.ts#createJob" }
      }
    ]);
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "GET /users" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.fastify.static-route.imported-handler", stage: "module" }
        }
      }
    ]);

    await writeFile(join(projectPath, "src", "unrelated.ts"), "export const unrelated = true;\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { method: "TRACE" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["src/unrelated.ts"],
      reusedArtifactFiles: ["src/handlers.ts", "src/routes.ts"]
    });
    expect(routesAfterReuse.routes).toMatchObject([
      {
        method: "TRACE",
        path: "/jobs",
        edge: { evidence: { ruleId: "framework.fastify.static-route.imported-handler" } }
      }
    ]);
  });

  it("indexes React Router JSX navigation routes with exact imported page evidence", async () => {
    const projectPath = await createInlineProject({
      "src/pages.tsx": "export function SettingsPage() { return <main>Settings</main>; }\n",
      "src/app-routes.tsx": [
        'import { Route as AppRoute } from "react-router-dom";',
        'import { SettingsPage } from "./pages.js";',
        "export function AppRoutes() {",
        '  return <AppRoute path="/workspace"><AppRoute path="settings" element={<SettingsPage />} /></AppRoute>;',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const navigationRoutes = await service.routes(projectPath, { method: "NAVIGATE" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/app-routes.tsx");
    const page = (await service.find(projectPath, "src/pages.tsx#SettingsPage")).symbols[0];
    if (page === undefined) {
      throw new Error("Expected indexed React Router page component.");
    }
    const callers = await service.callers(projectPath, page.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(
      persistedFacts?.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([["SettingsPage", "react-router"]]);
    expect(navigationRoutes.routes).toMatchObject([
      {
        method: "NAVIGATE",
        path: "/workspace/settings",
        route: { kind: "route", name: "NAVIGATE /workspace/settings" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.react-router.jsx-route.imported-handler",
            stage: "module"
          }
        },
        handler: { qualifiedName: "src/pages.tsx#SettingsPage" }
      }
    ]);
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "NAVIGATE /workspace/settings" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.react-router.jsx-route.imported-handler", stage: "module" }
        }
      }
    ]);

    await writeFile(join(projectPath, "src", "unrelated.ts"), "export const unrelated = true;\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { method: "NAVIGATE" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["src/unrelated.ts"],
      reusedArtifactFiles: ["src/app-routes.tsx", "src/pages.tsx"]
    });
    expect(routesAfterReuse.routes).toMatchObject([
      {
        method: "NAVIGATE",
        path: "/workspace/settings",
        edge: { evidence: { ruleId: "framework.react-router.jsx-route.imported-handler" } }
      }
    ]);
  });

  it("indexes React Router createRoutesFromElements navigation routes with exact imported page evidence", async () => {
    const projectPath = await createInlineProject({
      "src/pages.tsx": "export function SettingsPage() { return <main>Settings</main>; }\n",
      "src/route-config.tsx": [
        'import { createRoutesFromElements as makeRoutes, Route as AppRoute } from "react-router-dom";',
        'import { SettingsPage } from "./pages.js";',
        "export const routes = makeRoutes(",
        '  <AppRoute path="/workspace">',
        '    <AppRoute path="settings" Component={SettingsPage} />',
        "  </AppRoute>",
        ");"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const navigationRoutes = await service.routes(projectPath, { method: "NAVIGATE" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/route-config.tsx");
    const page = (await service.find(projectPath, "src/pages.tsx#SettingsPage")).symbols[0];
    if (page === undefined) {
      throw new Error("Expected indexed React Router createRoutesFromElements page component.");
    }
    const callers = await service.callers(projectPath, page.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(
      persistedFacts?.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [
          reference.referenceName,
          reference.routeFramework,
          reference.routeRegistration
        ])
    ).toEqual([[
      "SettingsPage",
      "react-router",
      "react-router-create-routes-from-elements"
    ]]);
    expect(navigationRoutes.routes).toMatchObject([
      {
        method: "NAVIGATE",
        path: "/workspace/settings",
        route: { kind: "route", name: "NAVIGATE /workspace/settings" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.react-router.create-routes-from-elements.imported-handler",
            stage: "module"
          }
        },
        handler: { qualifiedName: "src/pages.tsx#SettingsPage" }
      }
    ]);
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "NAVIGATE /workspace/settings" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.react-router.create-routes-from-elements.imported-handler",
            stage: "module"
          }
        }
      }
    ]);

    await writeFile(join(projectPath, "src", "unrelated.ts"), "export const unrelated = true;\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { method: "NAVIGATE" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["src/unrelated.ts"],
      reusedArtifactFiles: ["src/pages.tsx", "src/route-config.tsx"]
    });
    expect(routesAfterReuse.routes).toMatchObject([
      {
        method: "NAVIGATE",
        path: "/workspace/settings",
        edge: {
          evidence: { ruleId: "framework.react-router.create-routes-from-elements.imported-handler" }
        }
      }
    ]);
  });

  it("indexes React Router data-router navigation routes with exact imported page evidence", async () => {
    const projectPath = await createInlineProject({
      "src/pages.tsx": "export function SettingsPage() { return <main>Settings</main>; }\n",
      "src/data-routes.tsx": [
        'import { createBrowserRouter as makeRouter } from "react-router-dom";',
        'import { SettingsPage } from "./pages.js";',
        'export const router = makeRouter([{ path: "/workspace", children: [{ path: "settings", Component: SettingsPage }] }]);'
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const navigationRoutes = await service.routes(projectPath, { method: "NAVIGATE" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/data-routes.tsx");
    const page = (await service.find(projectPath, "src/pages.tsx#SettingsPage")).symbols[0];
    if (page === undefined) {
      throw new Error("Expected indexed React Router data-router page component.");
    }
    const callers = await service.callers(projectPath, page.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(
      persistedFacts?.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [
          reference.referenceName,
          reference.routeFramework,
          reference.routeRegistration
        ])
    ).toEqual([["SettingsPage", "react-router", "react-router-data-router"]]);
    expect(navigationRoutes.routes).toMatchObject([
      {
        method: "NAVIGATE",
        path: "/workspace/settings",
        route: { kind: "route", name: "NAVIGATE /workspace/settings" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.react-router.data-router.imported-handler",
            stage: "module"
          }
        },
        handler: { qualifiedName: "src/pages.tsx#SettingsPage" }
      }
    ]);
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "NAVIGATE /workspace/settings" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.react-router.data-router.imported-handler", stage: "module" }
        }
      }
    ]);

    await writeFile(join(projectPath, "src", "unrelated.ts"), "export const unrelated = true;\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { method: "NAVIGATE" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["src/unrelated.ts"],
      reusedArtifactFiles: ["src/data-routes.tsx", "src/pages.tsx"]
    });
    expect(routesAfterReuse.routes).toMatchObject([
      {
        method: "NAVIGATE",
        path: "/workspace/settings",
        edge: { evidence: { ruleId: "framework.react-router.data-router.imported-handler" } }
      }
    ]);
  });

  it("indexes Next.js App Router navigation routes with exact imported page evidence", async () => {
    const projectPath = await createInlineProject({
      "src/components/pricing-page.tsx": "export function PricingPage() { return <main>Pricing</main>; }\n",
      "src/app/(marketing)/pricing/page.tsx": [
        'import { PricingPage } from "../../../components/pricing-page.js";',
        "export default PricingPage;"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const navigationRoutes = await service.routes(projectPath, { method: "NAVIGATE" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/app/(marketing)/pricing/page.tsx");
    const page = (await service.find(projectPath, "src/components/pricing-page.tsx#PricingPage")).symbols[0];
    if (page === undefined) {
      throw new Error("Expected indexed Next.js page component.");
    }
    const callers = await service.callers(projectPath, page.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(
      persistedFacts?.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [
          reference.referenceName,
          reference.routeFramework,
          reference.routeRegistration
        ])
    ).toEqual([["PricingPage", "nextjs", "nextjs-app-router"]]);
    expect(navigationRoutes.routes).toMatchObject([
      {
        method: "NAVIGATE",
        path: "/pricing",
        route: { kind: "route", name: "NAVIGATE /pricing" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.nextjs.app-router.imported-handler",
            stage: "module"
          }
        },
        handler: { qualifiedName: "src/components/pricing-page.tsx#PricingPage" }
      }
    ]);
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "NAVIGATE /pricing" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.nextjs.app-router.imported-handler", stage: "module" }
        }
      }
    ]);

    await writeFile(join(projectPath, "src", "unrelated.ts"), "export const unrelated = true;\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { method: "NAVIGATE" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["src/unrelated.ts"],
      reusedArtifactFiles: [
        "src/app/(marketing)/pricing/page.tsx",
        "src/components/pricing-page.tsx"
      ]
    });
    expect(routesAfterReuse.routes).toMatchObject([
      {
        method: "NAVIGATE",
        path: "/pricing",
        edge: { evidence: { ruleId: "framework.nextjs.app-router.imported-handler" } }
      }
    ]);
  });

  it("indexes direct inline Fastify plugin-prefix routes with nested static composition", async () => {
    const projectPath = await createInlineProject({
      "src/handlers.ts": [
        "export function listUsers() { return []; }",
        "export function createJob() { return undefined; }"
      ].join("\n"),
      "src/routes.ts": [
        'import Fastify from "fastify";',
        'import { createJob, listUsers } from "./handlers.js";',
        "const app = Fastify();",
        "app.register(async (api) => {",
        '  api.get("/users", listUsers);',
        "  api.register(async (v1) => {",
        '    v1.route({ method: ["POST", "TRACE"], url: "/jobs", handler: createJob });',
        '  }, { prefix: "/v1" });',
        '}, { prefix: "/api" });'
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const traceRoutes = await service.routes(projectPath, { method: "TRACE" });
    const persistedFastifyFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/routes.ts");
    const found = await service.find(projectPath, "src/handlers.ts#listUsers");
    const listUsers = found.symbols[0];
    if (listUsers === undefined) {
      throw new Error("Expected indexed Fastify plugin handler.");
    }
    const callers = await service.callers(projectPath, listUsers.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(
      persistedFastifyFacts?.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [
          reference.referenceName,
          reference.routeFramework,
          reference.routeRegistration
        ])
    ).toEqual([
      ["listUsers", "fastify", "fastify-inline-plugin-prefix"],
      ["createJob", "fastify", "fastify-inline-plugin-prefix"],
      ["createJob", "fastify", "fastify-inline-plugin-prefix"]
    ]);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/api/users",
          route: expect.objectContaining({ kind: "route", name: "GET /api/users" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastify.inline-plugin-prefix.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#listUsers" })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/api/v1/jobs",
          route: expect.objectContaining({ kind: "route", name: "POST /api/v1/jobs" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastify.inline-plugin-prefix.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#createJob" })
        }),
        expect.objectContaining({
          method: "TRACE",
          path: "/api/v1/jobs",
          route: expect.objectContaining({ kind: "route", name: "TRACE /api/v1/jobs" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastify.inline-plugin-prefix.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#createJob" })
        })
      ])
    );
    expect(traceRoutes.routes).toMatchObject([
      {
        method: "TRACE",
        path: "/api/v1/jobs",
        handler: { qualifiedName: "src/handlers.ts#createJob" }
      }
    ]);
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "GET /api/users" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.fastify.inline-plugin-prefix.imported-handler",
            stage: "module"
          }
        }
      }
    ]);

    await writeFile(join(projectPath, "src", "unrelated.ts"), "export const unrelated = true;\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { method: "TRACE" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["src/unrelated.ts"],
      reusedArtifactFiles: ["src/handlers.ts", "src/routes.ts"]
    });
    expect(routesAfterReuse.routes).toMatchObject([
      {
        method: "TRACE",
        path: "/api/v1/jobs",
        edge: { evidence: { ruleId: "framework.fastify.inline-plugin-prefix.imported-handler" } }
      }
    ]);
  });

  it("indexes named local Fastify plugin-prefix routes with nested static composition", async () => {
    const projectPath = await createInlineProject({
      "src/handlers.ts": [
        "export function listUsers() { return []; }",
        "export function createJob() { return undefined; }"
      ].join("\n"),
      "src/routes.ts": [
        'import Fastify from "fastify";',
        'import { createJob, listUsers } from "./handlers.js";',
        "async function api(server: unknown) {",
        '  server.get("/users", listUsers);',
        '  server.register(v1, { prefix: "/v1" });',
        "}",
        "const v1 = async function(instance: unknown) {",
        '  instance.route({ method: ["POST", "TRACE"], url: "/jobs", handler: createJob });',
        "};",
        "const app = Fastify();",
        'app.register(api, { prefix: "/api" });'
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const traceRoutes = await service.routes(projectPath, { method: "TRACE" });
    const persistedFastifyFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/routes.ts");
    const found = await service.find(projectPath, "src/handlers.ts#listUsers");
    const listUsers = found.symbols[0];
    if (listUsers === undefined) {
      throw new Error("Expected indexed local Fastify plugin handler.");
    }
    const callers = await service.callers(projectPath, listUsers.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(
      persistedFastifyFacts?.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [
          reference.referenceName,
          reference.routeFramework,
          reference.routeRegistration
        ])
    ).toEqual([
      ["listUsers", "fastify", "fastify-local-plugin-prefix"],
      ["createJob", "fastify", "fastify-local-plugin-prefix"],
      ["createJob", "fastify", "fastify-local-plugin-prefix"]
    ]);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/api/users",
          route: expect.objectContaining({ kind: "route", name: "GET /api/users" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastify.local-plugin-prefix.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#listUsers" })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/api/v1/jobs",
          route: expect.objectContaining({ kind: "route", name: "POST /api/v1/jobs" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastify.local-plugin-prefix.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#createJob" })
        }),
        expect.objectContaining({
          method: "TRACE",
          path: "/api/v1/jobs",
          route: expect.objectContaining({ kind: "route", name: "TRACE /api/v1/jobs" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastify.local-plugin-prefix.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#createJob" })
        })
      ])
    );
    expect(traceRoutes.routes).toMatchObject([
      {
        method: "TRACE",
        path: "/api/v1/jobs",
        handler: { qualifiedName: "src/handlers.ts#createJob" }
      }
    ]);
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "GET /api/users" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.fastify.local-plugin-prefix.imported-handler",
            stage: "module"
          }
        }
      }
    ]);

    await writeFile(join(projectPath, "src", "unrelated.ts"), "export const unrelated = true;\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { method: "TRACE" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["src/unrelated.ts"],
      reusedArtifactFiles: ["src/handlers.ts", "src/routes.ts"]
    });
    expect(routesAfterReuse.routes).toMatchObject([
      {
        method: "TRACE",
        path: "/api/v1/jobs",
        edge: { evidence: { ruleId: "framework.fastify.local-plugin-prefix.imported-handler" } }
      }
    ]);
  });

  it("indexes cross-file Fastify plugin prefixes through re-exports and reuses persisted facts", async () => {
    const projectPath = await createInlineProject({
      "src/handlers.ts": [
        "export function listUsers() { return []; }",
        "export function createJob() { return undefined; }"
      ].join("\n"),
      "src/jobs.ts": [
        'import { createJob } from "./handlers.js";',
        "export const jobsPlugin = async (server: unknown) => {",
        '  server.route({ method: ["POST", "TRACE"], url: "/jobs", handler: createJob });',
        "};"
      ].join("\n"),
      "src/jobs-barrel.ts": 'export { jobsPlugin } from "./jobs.js";\n',
      "src/api.ts": [
        'import { listUsers } from "./handlers.js";',
        'import { jobsPlugin } from "./jobs-barrel.js";',
        "export async function api(server: unknown) {",
        '  server.get("/users", listUsers);',
        '  server.register(jobsPlugin, { prefix: "/v1" });',
        "}"
      ].join("\n"),
      "src/barrel.ts": 'export { api as publicApi } from "./api.js";\n',
      "src/main.ts": [
        'import Fastify from "fastify";',
        'import { publicApi } from "./barrel.js";',
        "const app = Fastify();",
        'app.register(publicApi, { prefix: "/api" });'
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const traceRoutes = await service.routes(projectPath, { method: "TRACE" });
    const apiFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/api.ts");
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/main.ts");
    const found = await service.find(projectPath, "src/handlers.ts#listUsers");
    const listUsers = found.symbols[0];
    if (listUsers === undefined) {
      throw new Error("Expected indexed cross-file Fastify plugin handler.");
    }
    const callers = await service.callers(projectPath, listUsers.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 6, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(apiFacts?.fastifyPluginFacts).toMatchObject({
      routes: [
        {
          method: "GET",
          path: "/users",
          handler: { name: "listUsers" }
        }
      ],
      childRegistrations: [
        {
          plugin: { name: "jobsPlugin" },
          prefix: "/v1"
        }
      ]
    });
    expect(mainFacts?.fastifyPluginFacts).toMatchObject({
      rootRegistrations: [
        {
          plugin: { name: "publicApi" },
          prefix: "/api"
        }
      ]
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/api/users",
          route: expect.objectContaining({ filePath: "src/api.ts", name: "GET /api/users" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastify.imported-plugin-prefix.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#listUsers" })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/api/v1/jobs",
          route: expect.objectContaining({ filePath: "src/jobs.ts", name: "POST /api/v1/jobs" }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#createJob" })
        }),
        expect.objectContaining({
          method: "TRACE",
          path: "/api/v1/jobs",
          route: expect.objectContaining({ filePath: "src/jobs.ts", name: "TRACE /api/v1/jobs" }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#createJob" })
        })
      ])
    );
    expect(traceRoutes.routes).toMatchObject([
      {
        method: "TRACE",
        path: "/api/v1/jobs",
        edge: { evidence: { ruleId: "framework.fastify.imported-plugin-prefix.imported-handler" } }
      }
    ]);
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "GET /api/users", filePath: "src/api.ts" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.fastify.imported-plugin-prefix.imported-handler" }
        }
      }
    ]);

    await writeFile(join(projectPath, "src", "unrelated.ts"), "export const unrelated = true;\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { method: "TRACE" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["src/unrelated.ts"],
      reusedArtifactFiles: expect.arrayContaining([
        "src/api.ts",
        "src/barrel.ts",
        "src/handlers.ts",
        "src/jobs-barrel.ts",
        "src/jobs.ts",
        "src/main.ts"
      ])
    });
    expect(routesAfterReuse.routes).toMatchObject([
      {
        method: "TRACE",
        path: "/api/v1/jobs",
        edge: { evidence: { ruleId: "framework.fastify.imported-plugin-prefix.imported-handler" } }
      }
    ]);
  });

  it("indexes non-HTTP NestJS entrypoints as exact persisted handler evidence", async () => {
    const projectPath = await createInlineProject({
      "src/transports.ts": [
        'import { Controller } from "@nestjs/common";',
        'import { Query, Resolver } from "@nestjs/graphql";',
        'import { MessagePattern } from "@nestjs/microservices";',
        'import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";',
        "@Resolver()",
        "export class AuthorsResolver {",
        "  @Query()",
        "  author() { return {}; }",
        "}",
        "@Controller()",
        "export class MathController {",
        "  @MessagePattern({ cmd: \"sum\" })",
        "  sum() { return 0; }",
        "}",
        "@WebSocketGateway({ namespace: \"events\" })",
        "export class EventsGateway {",
        "  @SubscribeMessage(\"created\")",
        "  created() {}",
        "}"
      ].join("\n")
    });
    const service = createService();

    const indexed = await service.init({ projectPath });
    const entrypoints = await service.entrypoints(projectPath);
    const found = await service.find(projectPath, "src/transports.ts#AuthorsResolver.author");
    const author = found.symbols[0];
    if (author === undefined) {
      throw new Error("Expected indexed GraphQL method handler.");
    }
    const callers = await service.callers(projectPath, author.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(entrypoints.entrypoints).toMatchObject([
      {
        transport: "graphql",
        operation: "query",
        name: "author",
        entrypoint: { kind: "entrypoint", name: "graphql query author" },
        edge: {
          kind: "handles",
          resolution: "exact",
          evidence: { ruleId: "framework.nestjs.graphql.operation.local-method", stage: "syntax" }
        },
        handler: { qualifiedName: "src/transports.ts#AuthorsResolver.author" }
      },
      {
        transport: "microservice",
        operation: "message",
        name: '{"cmd":"sum"}',
        edge: {
          kind: "handles",
          resolution: "exact",
          evidence: { ruleId: "framework.nestjs.microservice.pattern.local-method", stage: "syntax" }
        },
        handler: { qualifiedName: "src/transports.ts#MathController.sum" }
      },
      {
        transport: "websocket",
        operation: "subscribe",
        name: "events:created",
        edge: {
          kind: "handles",
          resolution: "exact",
          evidence: { ruleId: "framework.nestjs.websocket.subscribe-message.local-method", stage: "syntax" }
        },
        handler: { qualifiedName: "src/transports.ts#EventsGateway.created" }
      }
    ]);
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "entrypoint", name: "graphql query author" },
        edge: {
          kind: "handles",
          resolution: "exact",
          evidence: { ruleId: "framework.nestjs.graphql.operation.local-method", stage: "syntax" }
        }
      }
    ]);
  });

  it("persists exact Nest RouterModule prefix facts across an incremental sync", async () => {
    const projectPath = await createInlineProject({
      "src/cats.controller.ts": [
        'import { Controller, Get } from "@nestjs/common";',
        '@Controller("cats")',
        "export class CatsController {",
        "  @Get(\":id\") findOne() { return []; }",
        "}"
      ].join("\n"),
      "src/cats.module.ts": [
        'import { Module } from "@nestjs/common";',
        'import { CatsController } from "./cats.controller";',
        "@Module({ controllers: [CatsController] })",
        "export class CatsModule {}"
      ].join("\n"),
      "src/app.module.ts": [
        'import { Module as NestModule } from "@nestjs/common";',
        'import { RouterModule as NestRouter } from "@nestjs/core";',
        'import { CatsModule } from "./cats.module";',
        "@NestModule({ imports: [NestRouter.register([{ path: \"admin\", module: CatsModule }])] })",
        "export class AppModule {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const initialRoutes = await service.routes(projectPath);
    const persistedFacts = graphStore.getArtifactFacts(projectPath);

    expect(initialRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/admin/cats/:id",
        route: { kind: "route", name: "GET /admin/cats/:id" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.nestjs.router-module.exact-prefix", stage: "module" }
        },
        handler: { qualifiedName: "src/cats.controller.ts#CatsController.findOne" }
      }
    ]);
    expect(
      persistedFacts.find((facts) => facts.filePath === "src/cats.controller.ts")?.nestRouteFacts
        ?.routeControllers
    ).toHaveLength(1);
    expect(
      persistedFacts.find((facts) => facts.filePath === "src/cats.module.ts")?.nestRouteFacts
        ?.moduleControllers
    ).toHaveLength(1);
    expect(
      persistedFacts.find((facts) => facts.filePath === "src/app.module.ts")?.nestRouteFacts
        ?.routerModulePrefixes
    ).toHaveLength(1);

    await writeFile(join(projectPath, "src", "unrelated.ts"), "export const unrelated = true;\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath);

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["src/unrelated.ts"],
      reusedArtifactFiles: ["src/app.module.ts", "src/cats.controller.ts", "src/cats.module.ts"]
    });
    expect(routesAfterReuse.routes).toMatchObject([
      {
        path: "/admin/cats/:id",
        edge: { evidence: { ruleId: "framework.nestjs.router-module.exact-prefix" } }
      }
    ]);
  });

  it("indexes Vue SFC default components and resolves direct Vue Router routes across .vue modules", async () => {
    const projectPath = await createInlineProject({
      "src/views/HomeView.vue": [
        "<template><main /></template>",
        "<script>",
        'export default { name: "HomeView" };',
        "</script>"
      ].join("\n"),
      "src/views/SettingsView.vue": [
        "<template><main /></template>",
        '<script lang="ts">',
        'import { defineComponent } from "vue";',
        "const SettingsView = defineComponent({});",
        "export default SettingsView;",
        "</script>"
      ].join("\n"),
      "src/router/index.ts": [
        'import { createRouter, createWebHistory } from "vue-router";',
        'import HomeView from "../views/HomeView";',
        'import SettingsView from "../views/SettingsView";',
        "",
        "const routes = [",
        '  { path: "/", component: HomeView },',
        '  { path: "/settings", component: SettingsView }',
        "];",
        "",
        "export const router = createRouter({ history: createWebHistory(), routes });"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "NAVIGATE" });
    const search = await service.search(projectPath, "View", { language: "vue" });
    const persistedVueFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "vue");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedVueFacts).toHaveLength(2);
    expect(
      persistedVueFacts.every(
        (facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION
      )
    ).toBe(true);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "NAVIGATE",
          path: "/",
          handler: expect.objectContaining({
            qualifiedName: "src/views/HomeView.vue#default"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.vue-router.create-router.routes-option.imported-handler",
              stage: "module"
            })
          })
        }),
        expect.objectContaining({
          method: "NAVIGATE",
          path: "/settings",
          handler: expect.objectContaining({
            qualifiedName: "src/views/SettingsView.vue#SettingsView"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.vue-router.create-router.routes-option.imported-handler",
              stage: "module"
            })
          })
        })
      ])
    );
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "src/views/HomeView.vue", language: "vue" }),
        expect.objectContaining({ filePath: "src/views/SettingsView.vue", language: "vue" })
      ])
    );
  });

  it("indexes Svelte SFC default components and static SvelteKit filesystem pages", async () => {
    const projectPath = await createInlineProject({
      "src/routes/+page.svelte": [
        '<script lang="ts">',
        "export let title: string;",
        "</script>",
        "<main>{title}</main>"
      ].join("\n"),
      "src/routes/catalog/+page.svelte": [
        '<script context="module" lang="ts">',
        "export const prerender = true;",
        "</script>",
        "<main>Catalog</main>"
      ].join("\n"),
      "src/routes/blog/[slug]/+page.svelte": "<main>Dynamic</main>"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "NAVIGATE" });
    const search = await service.search(projectPath, "Catalog", { language: "svelte" });
    const persistedSvelteFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "svelte");
    const page = (await service.find(projectPath, "src/routes/catalog/+page.svelte#default")).symbols[0];
    if (page === undefined) {
      throw new Error("Expected indexed Svelte default component.");
    }
    const callers = await service.callers(projectPath, page.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedSvelteFacts).toHaveLength(3);
    expect(
      persistedSvelteFacts.every(
        (facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION
      )
    ).toBe(true);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "NAVIGATE",
          path: "/",
          handler: expect.objectContaining({
            qualifiedName: "src/routes/+page.svelte#default"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sveltekit.filesystem-page.local-handler",
              stage: "lexical"
            })
          })
        }),
        expect.objectContaining({
          method: "NAVIGATE",
          path: "/catalog",
          handler: expect.objectContaining({
            qualifiedName: "src/routes/catalog/+page.svelte#default"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sveltekit.filesystem-page.local-handler",
              stage: "lexical"
            })
          })
        })
      ])
    );
    expect(routes.routes.map((route) => route.path)).not.toContain("/blog/[slug]");
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "src/routes/catalog/+page.svelte", language: "svelte" })
      ])
    );
    expect(callers.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ kind: "route", name: "NAVIGATE /catalog" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sveltekit.filesystem-page.local-handler",
              stage: "lexical"
            })
          })
        })
      ])
    );
  });

  it("indexes Astro default components and static Astro filesystem pages", async () => {
    const projectPath = await createInlineProject({
      "src/pages/index.astro": "<main>Home</main>",
      "src/pages/catalog/index.astro": [
        "---",
        'export const title = "Catalog";',
        "---",
        "<main>{title}</main>"
      ].join("\n"),
      "src/pages/blog/[slug].astro": "<main>Dynamic</main>"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "NAVIGATE" });
    const search = await service.search(projectPath, "Catalog", { language: "astro" });
    const persistedAstroFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "astro");
    const page = (await service.find(projectPath, "src/pages/catalog/index.astro#default")).symbols[0];
    if (page === undefined) {
      throw new Error("Expected indexed Astro default component.");
    }
    const callers = await service.callers(projectPath, page.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedAstroFacts).toHaveLength(3);
    expect(
      persistedAstroFacts.every(
        (facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION
      )
    ).toBe(true);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "NAVIGATE",
          path: "/",
          handler: expect.objectContaining({
            qualifiedName: "src/pages/index.astro#default"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.astro.filesystem-page.local-handler",
              stage: "lexical"
            })
          })
        }),
        expect.objectContaining({
          method: "NAVIGATE",
          path: "/catalog",
          handler: expect.objectContaining({
            qualifiedName: "src/pages/catalog/index.astro#default"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.astro.filesystem-page.local-handler",
              stage: "lexical"
            })
          })
        })
      ])
    );
    expect(routes.routes.map((route) => route.path)).not.toContain("/blog/[slug]");
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "src/pages/catalog/index.astro", language: "astro" })
      ])
    );
    expect(callers.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ kind: "route", name: "NAVIGATE /catalog" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.astro.filesystem-page.local-handler",
              stage: "lexical"
            })
          })
        })
      ])
    );
  });

  it("indexes Razor default components and literal Blazor page directives", async () => {
    const projectPath = await createInlineProject({
      "Components/Home.razor": ['@page "/"', "<h1>Home</h1>"].join("\n"),
      "Components/Catalog.razor": [
        '@page "/catalog"',
        '@page "/catalog/{id:int}"',
        "<h1>Catalog</h1>"
      ].join("\n"),
      "Components/Shared.razor": "<main>Shared</main>",
      "Views/Legacy.cshtml": '@page "/legacy"'
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "NAVIGATE" });
    const search = await service.search(projectPath, "Catalog", { language: "razor" });
    const persistedRazorFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "razor");
    const page = (await service.find(projectPath, "Components/Catalog.razor#default")).symbols[0];
    if (page === undefined) {
      throw new Error("Expected indexed Razor default component.");
    }
    const callers = await service.callers(projectPath, page.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedRazorFacts).toHaveLength(3);
    expect(
      persistedRazorFacts.every(
        (facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION
      )
    ).toBe(true);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "NAVIGATE",
          path: "/",
          handler: expect.objectContaining({
            qualifiedName: "Components/Home.razor#default"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.blazor.page-directive.local-handler",
              stage: "lexical"
            })
          })
        }),
        expect.objectContaining({
          method: "NAVIGATE",
          path: "/catalog",
          handler: expect.objectContaining({
            qualifiedName: "Components/Catalog.razor#default"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.blazor.page-directive.local-handler",
              stage: "lexical"
            })
          })
        }),
        expect.objectContaining({
          method: "NAVIGATE",
          path: "/catalog/{id:int}",
          handler: expect.objectContaining({
            qualifiedName: "Components/Catalog.razor#default"
          })
        })
      ])
    );
    expect(routes.routes.map((route) => route.path)).not.toContain("/legacy");
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "Components/Catalog.razor", language: "razor" })
      ])
    );
    expect(callers.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ kind: "route", name: "NAVIGATE /catalog" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.blazor.page-directive.local-handler",
              stage: "lexical"
            })
          })
        })
      ])
    );
  });

  it("indexes ArkTS ArkUI components and direct UI root entrypoints", async () => {
    const projectPath = await createInlineProject({
      "entry/src/main/ets/pages/Home.ets": [
        "@Entry",
        "@Component",
        "struct Home {",
        "  build() {",
        "    Column() {}",
        "  }",
        "}"
      ].join("\n"),
      "entry/src/main/ets/components/Detail.ets": [
        "@Component",
        "export struct Detail {",
        "  build() {}",
        "}"
      ].join("\n"),
      "entry/src/main/ets/pages/Invalid.ets": "@Component struct Incomplete {"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const entrypoints = await service.entrypoints(projectPath, {
      transport: "ui",
      operation: "root"
    });
    const search = await service.search(projectPath, "Home", { language: "arkts" });
    const persistedArkTsFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "arkts");
    const component = (await service.find(projectPath, "entry/src/main/ets/pages/Home.ets#Home"))
      .symbols[0];
    if (component === undefined) {
      throw new Error("Expected indexed ArkTS Home component.");
    }
    const callers = await service.callers(projectPath, component.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedArkTsFacts).toHaveLength(3);
    expect(
      persistedArkTsFacts.every(
        (facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION
      )
    ).toBe(true);
    expect(entrypoints.entrypoints).toEqual([
      expect.objectContaining({
        transport: "ui",
        operation: "root",
        name: "Home",
        handler: expect.objectContaining({
          qualifiedName: "entry/src/main/ets/pages/Home.ets#Home"
        }),
        edge: expect.objectContaining({
          kind: "handles",
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId: "framework.arkui.entry-component.local-struct",
            stage: "syntax"
          })
        })
      })
    ]);
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "entry/src/main/ets/pages/Home.ets",
          language: "arkts"
        })
      ])
    );
    expect(callers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({ kind: "entrypoint", name: "ui root Home" }),
        edge: expect.objectContaining({
          kind: "handles",
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId: "framework.arkui.entry-component.local-struct",
            stage: "syntax"
          })
        })
      })
    ]);
  });

  it("indexes Terraform and OpenTofu block declarations as persisted IaC facts", async () => {
    const projectPath = await createInlineProject({
      "infra/main.tf": [
        'resource "aws_instance" "web" {',
        '  ami = "ami-123"',
        "}",
        'data "aws_ami" "base" {}',
        'module "network" { source = "./modules/network" }',
        'variable "region" {}',
        'output "endpoint" { value = aws_instance.web.public_dns }'
      ].join("\n"),
      "infra/terraform.tfvars": 'region = "ap-northeast-1"\n',
      "infra/invalid.tofu": 'resource "aws_instance" "incomplete" {'
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const search = await service.search(projectPath, "region", { language: "terraform" });
    const resource = (await service.find(projectPath, "infra/main.tf#resource:aws_instance.web"))
      .symbols[0];
    const persistedTerraformFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "terraform");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedTerraformFacts).toHaveLength(3);
    expect(
      persistedTerraformFacts.every(
        (facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION
      )
    ).toBe(true);
    expect(resource).toMatchObject({
      kind: "resource",
      name: "resource aws_instance.web",
      qualifiedName: "infra/main.tf#resource:aws_instance.web"
    });
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "infra/main.tf",
          language: "terraform"
        }),
        expect.objectContaining({
          filePath: "infra/terraform.tfvars",
          language: "terraform"
        })
      ])
    );
  });

  it("indexes Shopify Liquid literal template calls against local snippets and sections", async () => {
    const projectPath = await createInlineProject({
      "templates/product.liquid": [
        "{% render 'product-card', product: product %}",
        "{% section 'recommendations' %}",
        "{% include 'missing' %}",
        "{% render dynamic_name %}"
      ].join("\n"),
      "snippets/product-card.liquid": "<article>{{ product.title }}</article>\n",
      "sections/recommendations.liquid": "<section>Recommendations</section>\n",
      "snippets/unused.liquid": "<aside>Unused</aside>\n"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const search = await service.search(projectPath, "product-card", { language: "liquid" });
    const snippet = (await service.find(projectPath, "snippets/product-card.liquid")).symbols[0];
    const section = (await service.find(projectPath, "sections/recommendations.liquid")).symbols[0];
    if (snippet === undefined || section === undefined) {
      throw new Error("Expected indexed Shopify Liquid target files.");
    }
    const snippetCallers = await service.callers(projectPath, snippet.qualifiedName);
    const sectionCallers = await service.callers(projectPath, section.qualifiedName);
    const persistedLiquidFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "liquid");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 4, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedLiquidFacts).toHaveLength(4);
    expect(
      persistedLiquidFacts.every(
        (facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION
      )
    ).toBe(true);
    expect(
      persistedLiquidFacts.find((facts) => facts.filePath === "templates/product.liquid")?.liquidFacts
        ?.templateReferences
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "render",
          targetFilePath: "snippets/product-card.liquid"
        })
      ])
    );
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "templates/product.liquid",
          language: "liquid"
        })
      ])
    );
    expect(snippetCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({
          kind: "file",
          qualifiedName: "templates/product.liquid"
        }),
        edge: expect.objectContaining({
          kind: "calls",
          resolution: "exact",
          referenceName: "render snippets/product-card.liquid",
          evidence: expect.objectContaining({
            ruleId: "framework.shopify-liquid.render.literal-project-file.exact-target",
            stage: "module"
          })
        })
      })
    ]);
    expect(sectionCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({
          kind: "file",
          qualifiedName: "templates/product.liquid"
        }),
        edge: expect.objectContaining({
          kind: "calls",
          resolution: "exact",
          referenceName: "section sections/recommendations.liquid",
          evidence: expect.objectContaining({
            ruleId: "framework.shopify-liquid.section.literal-project-file.exact-target",
            stage: "module"
          })
        })
      })
    ]);
  });

  it("indexes Twig literal template calls against the conventional templates root", async () => {
    const projectPath = await createInlineProject({
      "templates/pages/home.html.twig": [
        '{% extends "base.html.twig" %}',
        '{% include "partials/card.html.twig" only %}',
        '{% embed "components/dialog.html.twig" %}',
        '{% import "macros/forms.html.twig" as forms %}',
        '{% from "macros/fields.html.twig" import input %}',
        '{% include "missing.html.twig" %}'
      ].join("\n"),
      "templates/base.html.twig": "<main>{% block body %}{% endblock %}</main>\n",
      "templates/partials/card.html.twig": "<article>Card</article>\n",
      "templates/components/dialog.html.twig": "<dialog></dialog>\n",
      "templates/macros/forms.html.twig": "{% macro field() %}{% endmacro %}\n",
      "templates/macros/fields.html.twig": "{% macro input() %}{% endmacro %}\n"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const search = await service.search(projectPath, "main", { language: "twig" });
    const base = (await service.find(projectPath, "templates/base.html.twig")).symbols[0];
    const forms = (await service.find(projectPath, "templates/macros/forms.html.twig")).symbols[0];
    if (base === undefined || forms === undefined) {
      throw new Error("Expected indexed Twig target files.");
    }
    const baseCallers = await service.callers(projectPath, base.qualifiedName);
    const formsCallers = await service.callers(projectPath, forms.qualifiedName);
    const persistedTwigFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "twig");
    const missingEdge = graphStore
      .getSnapshot(projectPath)
      .edges.find((edge) => edge.referenceName === "include templates/missing.html.twig");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 6, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedTwigFacts).toHaveLength(6);
    expect(
      persistedTwigFacts.every(
        (facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION
      )
    ).toBe(true);
    expect(
      persistedTwigFacts.find((facts) => facts.filePath === "templates/pages/home.html.twig")
        ?.twigFacts?.templateReferences
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "extends",
          targetFilePath: "templates/base.html.twig"
        }),
        expect.objectContaining({
          kind: "from",
          targetFilePath: "templates/macros/fields.html.twig"
        })
      ])
    );
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "templates/base.html.twig",
          language: "twig"
        })
      ])
    );
    expect(baseCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({
          kind: "file",
          qualifiedName: "templates/pages/home.html.twig"
        }),
        edge: expect.objectContaining({
          kind: "calls",
          resolution: "exact",
          referenceName: "extends templates/base.html.twig",
          evidence: expect.objectContaining({
            ruleId: "framework.twig.extends.literal-templates-root.exact-target",
            stage: "module"
          })
        })
      })
    ]);
    expect(formsCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({
          kind: "file",
          qualifiedName: "templates/pages/home.html.twig"
        }),
        edge: expect.objectContaining({
          kind: "calls",
          resolution: "exact",
          referenceName: "import templates/macros/forms.html.twig",
          evidence: expect.objectContaining({
            ruleId: "framework.twig.import.literal-templates-root.exact-target",
            stage: "module"
          })
        })
      })
    ]);
    expect(missingEdge).toMatchObject({
      kind: "calls",
      resolution: "unresolved",
      confidence: 0,
      targetId: null,
      evidence: {
        ruleId: "framework.twig.include.literal-templates-root.unresolved-target",
        stage: "module"
      }
    });

    await writeFile(
      join(projectPath, "templates", "base.html.twig"),
      "<main>Updated base template</main>\n",
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const baseCallersAfterReuse = await service.callers(projectPath, base.qualifiedName);

    expect(synced.lastIndexWork?.reusedArtifactFiles).toContain("templates/pages/home.html.twig");
    expect(baseCallersAfterReuse.relations).toEqual([
      expect.objectContaining({
        edge: expect.objectContaining({
          resolution: "exact",
          referenceName: "extends templates/base.html.twig",
          evidence: expect.objectContaining({
            ruleId: "framework.twig.extends.literal-templates-root.exact-target"
          })
        })
      })
    ]);
  });

  it("indexes Laravel Blade literal view directives against resources/views", async () => {
    const projectPath = await createInlineProject({
      "resources/views/pages/home.blade.php": [
        "@extends('layouts.app')",
        "@include('partials.card', ['product' => $product])",
        "@component('components.alert')",
        "@each('partials.row', $rows, 'row')",
        "@include('missing.view')"
      ].join("\n"),
      "resources/views/layouts/app.blade.php": "<main>@yield('content')</main>\n",
      "resources/views/partials/card.blade.php": "<article>Card</article>\n",
      "resources/views/components/alert.blade.php": "<aside>Alert</aside>\n",
      "resources/views/partials/row.blade.php": "<li>{{ $row }}</li>\n"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const search = await service.search(projectPath, "Card", { language: "blade" });
    const layout = (await service.find(projectPath, "resources/views/layouts/app.blade.php")).symbols[0];
    const card = (await service.find(projectPath, "resources/views/partials/card.blade.php")).symbols[0];
    if (layout === undefined || card === undefined) {
      throw new Error("Expected indexed Laravel Blade target files.");
    }
    const layoutCallers = await service.callers(projectPath, layout.qualifiedName);
    const cardCallers = await service.callers(projectPath, card.qualifiedName);
    const persistedBladeFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "blade");
    const missingEdge = graphStore
      .getSnapshot(projectPath)
      .edges.find((edge) => edge.referenceName === "include resources/views/missing/view.blade.php");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 5, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedBladeFacts).toHaveLength(5);
    expect(
      persistedBladeFacts.every(
        (facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION
      )
    ).toBe(true);
    expect(
      persistedBladeFacts.find((facts) => facts.filePath === "resources/views/pages/home.blade.php")
        ?.bladeFacts?.templateReferences
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "extends",
          targetFilePath: "resources/views/layouts/app.blade.php"
        }),
        expect.objectContaining({
          kind: "each",
          targetFilePath: "resources/views/partials/row.blade.php"
        })
      ])
    );
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "resources/views/partials/card.blade.php",
          language: "blade"
        })
      ])
    );
    expect(layoutCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({
          kind: "file",
          qualifiedName: "resources/views/pages/home.blade.php"
        }),
        edge: expect.objectContaining({
          kind: "calls",
          resolution: "exact",
          referenceName: "extends resources/views/layouts/app.blade.php",
          evidence: expect.objectContaining({
            ruleId: "framework.laravel-blade.extends.literal-resources-views.exact-target",
            stage: "module"
          })
        })
      })
    ]);
    expect(cardCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({
          kind: "file",
          qualifiedName: "resources/views/pages/home.blade.php"
        }),
        edge: expect.objectContaining({
          kind: "calls",
          resolution: "exact",
          referenceName: "include resources/views/partials/card.blade.php",
          evidence: expect.objectContaining({
            ruleId: "framework.laravel-blade.include.literal-resources-views.exact-target",
            stage: "module"
          })
        })
      })
    ]);
    expect(missingEdge).toMatchObject({
      kind: "calls",
      resolution: "unresolved",
      confidence: 0,
      targetId: null,
      evidence: {
        ruleId: "framework.laravel-blade.include.literal-resources-views.unresolved-target",
        stage: "module"
      }
    });

    await writeFile(
      join(projectPath, "resources", "views", "layouts", "app.blade.php"),
      "<main>Updated layout</main>\n",
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const layoutCallersAfterReuse = await service.callers(projectPath, layout.qualifiedName);

    expect(synced.lastIndexWork?.reusedArtifactFiles).toContain(
      "resources/views/pages/home.blade.php"
    );
    expect(layoutCallersAfterReuse.relations).toEqual([
      expect.objectContaining({
        edge: expect.objectContaining({
          resolution: "exact",
          referenceName: "extends resources/views/layouts/app.blade.php",
          evidence: expect.objectContaining({
            ruleId: "framework.laravel-blade.extends.literal-resources-views.exact-target"
          })
        })
      })
    ]);
  });

  it("indexes Solidity declarations and proves same-file inheritance only when target kind is unique", async () => {
    const projectPath = await createInlineProject({
      "contracts/Token.sol": [
        "pragma solidity ^0.8.24;",
        "interface IReadable {}",
        "interface IAsset is IReadable {",
        "  function balanceOf(address account) external view returns (uint256);",
        "}",
        "contract Ownable {",
        "  function owner() public view returns (address) { return address(this); }",
        "}",
        "contract Token is Ownable, IAsset {",
        "  function balanceOf(address account) external view returns (uint256) { return 0; }",
        "}",
        "contract Dynamic is IAsset(msg.sender) {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const search = await service.search(projectPath, "Token", { language: "solidity" });
    const readable = (await service.find(projectPath, "contracts/Token.sol#interface:IReadable")).symbols[0];
    const asset = (await service.find(projectPath, "contracts/Token.sol#interface:IAsset")).symbols[0];
    const ownable = (await service.find(projectPath, "contracts/Token.sol#contract:Ownable")).symbols[0];
    if (readable === undefined || asset === undefined || ownable === undefined) {
      throw new Error("Expected indexed Solidity declarations.");
    }
    const readableHierarchy = await service.hierarchy(projectPath, readable.qualifiedName);
    const assetHierarchy = await service.hierarchy(projectPath, asset.qualifiedName);
    const ownableHierarchy = await service.hierarchy(projectPath, ownable.qualifiedName);
    const persistedSolidityFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "solidity");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedSolidityFacts).toHaveLength(1);
    expect(
      persistedSolidityFacts.every(
        (facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION
      )
    ).toBe(true);
    expect(
      persistedSolidityFacts[0]?.solidityFacts?.inheritanceReferences
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baseName: "Ownable"
        })
      ])
    );
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "contracts/Token.sol",
          language: "solidity"
        })
      ])
    );
    expect(readableHierarchy.children).toEqual([
      expect.objectContaining({
        child: expect.objectContaining({
          kind: "interface",
          qualifiedName: "contracts/Token.sol#interface:IAsset"
        }),
        relation: "extends",
        edge: expect.objectContaining({
          kind: "extends",
          resolution: "exact",
          referenceName: "IReadable",
          evidence: expect.objectContaining({
            ruleId: "language.solidity.same-file.interface.extends",
            stage: "module"
          })
        })
      })
    ]);
    expect(assetHierarchy.children).toEqual([
      expect.objectContaining({
        child: expect.objectContaining({
          kind: "class",
          qualifiedName: "contracts/Token.sol#contract:Token"
        }),
        relation: "implements",
        edge: expect.objectContaining({
          kind: "implements",
          resolution: "exact",
          referenceName: "IAsset",
          evidence: expect.objectContaining({
            ruleId: "language.solidity.same-file.class.implements",
            stage: "module"
          })
        })
      })
    ]);
    expect(ownableHierarchy.children).toEqual([
      expect.objectContaining({
        child: expect.objectContaining({
          kind: "class",
          qualifiedName: "contracts/Token.sol#contract:Token"
        }),
        relation: "extends",
        edge: expect.objectContaining({
          kind: "extends",
          resolution: "exact",
          referenceName: "Ownable",
          evidence: expect.objectContaining({
            ruleId: "language.solidity.same-file.class.extends",
            stage: "module"
          })
        })
      })
    ]);
  });

  it("indexes CFML, CFScript, and tag-based component declarations", async () => {
    const projectPath = await createInlineProject({
      "services/OrderService.cfc": [
        "component {",
        "  public string function format(required string orderId) {",
        "    return orderId;",
        "  }",
        "}"
      ].join("\n"),
      "legacy/Inventory.cfc": [
        "<cfcomponent>",
        "  <cffunction name=\"load\" access=\"public\">",
        "  </cffunction>",
        "</cfcomponent>"
      ].join("\n"),
      "scripts/helpers.cfs": "function clean() { return true; }\n"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const search = await service.search(projectPath, "format", { language: "cfml" });
    const orderService = (
      await service.find(projectPath, "services/OrderService.cfc#component:OrderService")
    ).symbols[0];
    const inventory = (
      await service.find(projectPath, "legacy/Inventory.cfc#component:Inventory")
    ).symbols[0];
    const helper = (await service.find(projectPath, "scripts/helpers.cfs#function:clean")).symbols[0];
    if (orderService === undefined || inventory === undefined || helper === undefined) {
      throw new Error("Expected indexed CFML declarations.");
    }
    const persistedCfmlFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "cfml");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedCfmlFacts).toHaveLength(3);
    expect(
      persistedCfmlFacts.every((facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION)
    ).toBe(true);
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "services/OrderService.cfc",
          language: "cfml"
        })
      ])
    );
    expect(orderService).toMatchObject({
      kind: "class",
      qualifiedName: "services/OrderService.cfc#component:OrderService"
    });
    expect(inventory).toMatchObject({
      kind: "class",
      qualifiedName: "legacy/Inventory.cfc#component:Inventory"
    });
    expect(helper).toMatchObject({
      kind: "function",
      qualifiedName: "scripts/helpers.cfs#function:clean"
    });
  });

  it("indexes Nix returned attributes and retained literal import references", async () => {
    const projectPath = await createInlineProject({
      "nix/default.nix": [
        "{ lib, ... }:",
        "let helper = value: value; in {",
        "  package = import ./package.nix;",
        "  build = args: args;",
        "  inherit lib;",
        "}"
      ].join("\n"),
      "nix/package.nix": "{ name = \"symbol-lattice\"; }\n"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const search = await service.search(projectPath, "build", { language: "nix" });
    const build = (await service.find(projectPath, "nix/default.nix#function:build")).symbols[0];
    if (build === undefined) {
      throw new Error("Expected indexed Nix declaration.");
    }
    const persistedNixFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "nix");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedNixFacts).toHaveLength(2);
    expect(
      persistedNixFacts.every((facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION)
    ).toBe(true);
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "nix/default.nix",
          language: "nix"
        })
      ])
    );
    expect(build).toMatchObject({
      kind: "function",
      qualifiedName: "nix/default.nix#function:build"
    });
    expect(
      persistedNixFacts
        .flatMap((facts) => facts.pendingReferences)
        .map((reference) => [reference.relationKind, reference.referenceName])
    ).toContainEqual(["imports", "./package.nix"]);
  });

  it("indexes complete VB.NET declarations and simple Imports syntax", async () => {
    const projectPath = await createInlineProject({
      "vb/Worker.vb": [
        "Imports System.Text",
        "Namespace Acme.Tools",
        "  Public Class Worker",
        "    Public Function Format(value As String) As String",
        "      Return value",
        "    End Function",
        "  End Class",
        "End Namespace"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const search = await service.search(projectPath, "Format", { language: "vbnet" });
    const worker = (
      await service.find(projectPath, "vb/Worker.vb#module:Acme.Tools::class:Worker")
    ).symbols[0];
    if (worker === undefined) {
      throw new Error("Expected indexed VB.NET declaration.");
    }
    const persistedVbnetFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "vbnet");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedVbnetFacts).toHaveLength(1);
    expect(
      persistedVbnetFacts.every((facts) => facts.extractorVersion === ARTIFACT_FACTS_EXTRACTOR_VERSION)
    ).toBe(true);
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "vb/Worker.vb",
          language: "vbnet"
        })
      ])
    );
    expect(worker).toMatchObject({
      kind: "class",
      qualifiedName: "vb/Worker.vb#module:Acme.Tools::class:Worker"
    });
    expect(persistedVbnetFacts[0]?.pendingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationKind: "imports",
          referenceName: "System.Text"
        })
      ])
    );
  });

  it("indexes Zig declarations and retains Zig source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "src/main.zig": [
        "pub const Api = struct {",
        "    pub fn nested() void {}",
        "};",
        "",
        "const Mode = enum { ready, stopped };",
        "pub fn main() void {}",
        "fn helper() void {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "Api", { language: "zig" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/main.zig");
    const api = await service.find(projectPath, "src/main.zig.Api");
    const main = await service.find(projectPath, "src/main.zig.main");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 5, edges: 4 }
    });
    expect(persistedFacts).toMatchObject({
      language: "zig",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(api.symbols).toMatchObject([
      { kind: "class", qualifiedName: "src/main.zig.Api", isExported: true }
    ]);
    expect(main.symbols).toMatchObject([
      { kind: "function", qualifiedName: "src/main.zig.main", isExported: true }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([{ filePath: "src/main.zig", language: "zig" }]);
  });

  it("indexes YAML top-level scalar keys and retains YAML source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "config/application.yml": [
        "service: symbol-lattice",
        "port: 3000",
        "metadata:",
        "  team: graph"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "service", { language: "yaml" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.yml");
    const serviceKey = await service.find(projectPath, "config/application.yml#yaml-key:service");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 3, edges: 2 }
    });
    expect(persistedFacts).toMatchObject({
      language: "yaml",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(serviceKey.symbols).toMatchObject([
      {
        kind: "variable",
        qualifiedName: "config/application.yml#yaml-key:service",
        isExported: false
      }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "config/application.yml", language: "yaml" }
    ]);
  });

  it("indexes Java properties keys without persisting values and retains language filtering", async () => {
    const projectPath = await createInlineProject({
      "config/application.properties": [
        "spring.datasource.password=database-secret",
        "server.port: 8080",
        "feature.enabled true"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "server.port", { language: "properties" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.properties");
    const serverPort = await service.find(
      projectPath,
      "config/application.properties#properties-key:server.port"
    );

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 4, edges: 3 }
    });
    expect(persistedFacts).toMatchObject({
      language: "properties",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(JSON.stringify(persistedFacts)).not.toContain("database-secret");
    expect(serverPort.symbols).toMatchObject([
      {
        kind: "variable",
        qualifiedName: "config/application.properties#properties-key:server.port",
        isExported: false
      }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "config/application.properties", language: "properties" }
    ]);
  });

  it("projects conservative Spring Boot @Value property references across conventional properties files", async () => {
    const projectPath = await createInlineProject({
      "config/application.properties": [
        "server.port=8080",
        "feature.enabled=true",
        "spring.datasource.password=database-secret"
      ].join("\n"),
      "config/application-dev.properties": "feature.enabled=false\n",
      "config/bootstrap-prod.properties": "app.name=symbol-lattice\n",
      "src/config/AppConfig.java": [
        "import org.springframework.beans.factory.annotation.Value;",
        "",
        "class AppConfig {",
        '  @Value("${server.port}")',
        "  private String port;",
        '  @Value("${feature.enabled:false}")',
        "  private boolean enabled;",
        '  @Value("${app.name}")',
        "  private String appName;",
        '  @Value("${missing.key}")',
        "  private String missing;",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const configurationClass = (
      await service.find(projectPath, "src/config/AppConfig.java#AppConfig")
    ).symbols[0];
    const serverPort = (
      await service.find(projectPath, "config/application.properties#properties-key:server.port")
    ).symbols[0];
    const appName = (
      await service.find(projectPath, "config/bootstrap-prod.properties#properties-key:app.name")
    ).symbols[0];
    const applicationFeature = (
      await service.find(projectPath, "config/application.properties#properties-key:feature.enabled")
    ).symbols[0];
    const developmentFeature = (
      await service.find(projectPath, "config/application-dev.properties#properties-key:feature.enabled")
    ).symbols[0];
    if (
      configurationClass === undefined ||
      serverPort === undefined ||
      appName === undefined ||
      applicationFeature === undefined ||
      developmentFeature === undefined
    ) {
      throw new Error("Expected indexed Spring Boot configuration symbols.");
    }
    const propertyCallers = await service.callers(projectPath, serverPort.qualifiedName);
    const configurationCallees = await service.callees(projectPath, configurationClass.qualifiedName);
    const javaFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/AppConfig.java");
    const snapshot = graphStore.getSnapshot(projectPath);
    const serverPortReference = snapshot.edges.find(
      (edge) => edge.sourceId === configurationClass.id && edge.targetId === serverPort.id
    );
    const appNameReference = snapshot.edges.find(
      (edge) => edge.sourceId === configurationClass.id && edge.targetId === appName.id
    );
    const ambiguousFeatureReference = snapshot.edges.find(
      (edge) =>
        edge.sourceId === configurationClass.id &&
        edge.kind === "references" &&
        edge.referenceName === "feature.enabled"
    );
    const missingReference = snapshot.edges.find(
      (edge) =>
        edge.sourceId === configurationClass.id &&
        edge.kind === "references" &&
        edge.referenceName === "missing.key"
    );

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 4, symbols: 10, edges: 10 }
    });
    expect(javaFacts?.springBootPropertiesFacts).toMatchObject({
      valueReferences: [
        { sourceId: configurationClass.id, key: "server.port" },
        { sourceId: configurationClass.id, key: "feature.enabled" },
        { sourceId: configurationClass.id, key: "app.name" },
        { sourceId: configurationClass.id, key: "missing.key" }
      ]
    });
    expect(JSON.stringify(javaFacts)).not.toContain("database-secret");
    expect(propertyCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({ id: configurationClass.id }),
        edge: expect.objectContaining({
          kind: "references",
          resolution: "exact",
          referenceName: "server.port",
          evidence: expect.objectContaining({
            ruleId: "framework.spring-boot.properties.direct-value.literal-key.exact-key",
            stage: "module",
            candidateSymbolIds: [serverPort.id],
            configurationPaths: ["config/application.properties"]
          })
        })
      })
    ]);
    expect(configurationCallees.relations.map((relation) => relation.symbol.id)).toEqual(
      expect.arrayContaining([serverPort.id, appName.id])
    );
    expect(serverPortReference).toMatchObject({
      kind: "references",
      resolution: "exact",
      confidence: 1,
      referenceName: "server.port"
    });
    expect(appNameReference).toMatchObject({
      kind: "references",
      resolution: "exact",
      confidence: 1,
      referenceName: "app.name"
    });
    expect(ambiguousFeatureReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      referenceName: "feature.enabled",
      evidence: {
        ruleId: "framework.spring-boot.properties.direct-value.literal-key.ambiguous-key",
        stage: "unresolved",
        candidateSymbolIds: expect.arrayContaining([applicationFeature.id, developmentFeature.id]),
        configurationPaths: expect.arrayContaining([
          "config/application.properties",
          "config/application-dev.properties"
        ])
      }
    });
    expect(missingReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      referenceName: "missing.key",
      evidence: {
        ruleId: "framework.spring-boot.properties.direct-value.literal-key.unresolved-key",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });

    await writeFile(
      join(projectPath, "config", "application.properties"),
      ["feature.enabled=true", "spring.datasource.password=database-secret"].join("\n"),
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const serverPortAfterSync = graphStore
      .getSnapshot(projectPath)
      .edges.find(
        (edge) =>
          edge.sourceId === configurationClass.id &&
          edge.kind === "references" &&
          edge.referenceName === "server.port"
      );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toContain("src/config/AppConfig.java");
    expect(serverPortAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.properties.direct-value.literal-key.unresolved-key",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });
  });

  it("indexes direct Shell and Bash functions with persisted source search", async () => {
    const projectPath = await createInlineProject({
      "scripts/deploy.sh": [
        "#!/usr/bin/env bash",
        "deploy() {",
        "  printf '%s\\n' \"${APP_NAME}\"",
        "}",
        "",
        "function cleanup {",
        "  rm -f \"$1\"",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "cleanup", { language: "shell" });
    const cleanup = await service.find(projectPath, "scripts/deploy.sh#cleanup");
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "scripts/deploy.sh");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 3, edges: 2 }
    });
    expect(persistedFacts).toMatchObject({
      language: "shell",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(cleanup.symbols).toMatchObject([
      {
        kind: "function",
        qualifiedName: "scripts/deploy.sh#cleanup",
        isExported: true
      }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "scripts/deploy.sh", language: "shell" }
    ]);
  });

  it("indexes direct SQL table and view declarations with persisted source search", async () => {
    const projectPath = await createInlineProject({
      "db/schema.sql": [
        "CREATE TABLE public.users (",
        "  id integer PRIMARY KEY",
        ");",
        "",
        "CREATE OR REPLACE VIEW public.active_users AS",
        "SELECT id FROM public.users;"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "active_users", { language: "sql" });
    const activeUsers = await service.find(projectPath, "db/schema.sql#sql-view:public.active_users");
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "db/schema.sql");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 3, edges: 2 }
    });
    expect(persistedFacts).toMatchObject({
      language: "sql",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(activeUsers.symbols).toMatchObject([
      {
        kind: "resource",
        qualifiedName: "db/schema.sql#sql-view:public.active_users",
        isExported: true
      }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([{ filePath: "db/schema.sql", language: "sql" }]);
  });

  it("indexes Drupal routing YAML routes with parser-backed unresolved controller evidence", async () => {
    const projectPath = await createInlineProject({
      "modules/custom/example/example.routing.yml": [
        "example.catalog:",
        "  path: '/catalog'",
        "  defaults:",
        "    _controller: '\\Drupal\\example\\Controller\\CatalogController::index'",
        "  requirements:",
        "    _method: 'GET|POST'",
        "",
        "example.status:",
        "  path: '/status'",
        "  defaults:",
        "    _controller: '\\Drupal\\example\\Controller\\StatusController::show'"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "CatalogController", { language: "yaml" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "modules/custom/example/example.routing.yml");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 4, edges: 6 }
    });
    expect(persistedFacts).toMatchObject({
      language: "yaml",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/catalog",
        handler: null,
        edge: {
          resolution: "unresolved",
          referenceName: "\\Drupal\\example\\Controller\\CatalogController::index",
          evidence: {
            ruleId: "framework.drupal.routing-yaml.literal-controller.unresolved-controller-method",
            stage: "syntax"
          }
        }
      },
      {
        method: "POST",
        path: "/catalog",
        handler: null,
        edge: {
          resolution: "unresolved",
          referenceName: "\\Drupal\\example\\Controller\\CatalogController::index"
        }
      },
      {
        method: "ALL",
        path: "/status",
        handler: null,
        edge: {
          resolution: "unresolved",
          referenceName: "\\Drupal\\example\\Controller\\StatusController::show"
        }
      }
    ]);
    expect(search.results).toMatchObject([
      { filePath: "modules/custom/example/example.routing.yml", language: "yaml" }
    ]);
  });

  it("indexes parser-proven XML element resources and retains XML source-search filtering", async () => {
    const projectPath = await createInlineProject({
      "config/catalog.xml": [
        "<catalog>",
        '  <item id="first"/>',
        "  <section>",
        "    <entry>hidden</entry>",
        "  </section>",
        "</catalog>"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "section", { language: "xml" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/catalog.xml");
    const catalog = await service.find(projectPath, "config/catalog.xml#xml-element:catalog[0]");
    const section = await service.find(projectPath, "config/catalog.xml#xml-element:catalog[0]/section[0]");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 4, edges: 3 }
    });
    expect(persistedFacts).toMatchObject({
      language: "xml",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(catalog.symbols).toContainEqual(
      expect.objectContaining({
        kind: "resource",
        qualifiedName: "config/catalog.xml#xml-element:catalog[0]",
        isExported: true
      })
    );
    expect(section.symbols).toContainEqual(
      expect.objectContaining({
        kind: "resource",
        qualifiedName: "config/catalog.xml#xml-element:catalog[0]/section[0]",
        isExported: false
      })
    );
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([{ filePath: "config/catalog.xml", language: "xml" }]);
  });

  it("indexes bounded MyBatis mapper methods and same-file SQL include evidence", async () => {
    const projectPath = await createInlineProject({
      "src/main/resources/UserMapper.xml": [
        '<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"',
        '  "http://mybatis.org/dtd/mybatis-3-mapper.dtd">',
        '<mapper namespace="com.example.UserMapper">',
        '  <sql id="baseColumns">id, email</sql>',
        '  <select id="findById">SELECT <include refid="baseColumns"/> FROM users</select>',
        "</mapper>"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "findById", { language: "xml" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/main/resources/UserMapper.xml");
    const select = await service.node(projectPath, "com.example.UserMapper::findById");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 3, edges: 3 }
    });
    expect(persistedFacts).toMatchObject({
      language: "xml",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(select).toMatchObject({
      match: {
        status: "exact",
        symbol: {
          kind: "method",
          qualifiedName: "com.example.UserMapper::findById",
          isExported: false
        }
      },
      callees: {
        items: [
          {
            edge: {
              kind: "calls",
              resolution: "exact",
              referenceName: "com.example.UserMapper::baseColumns",
              evidence: {
                ruleId: "framework.mybatis.mapper.literal-include.same-file-sql",
                stage: "syntax"
              }
            },
            symbol: {
              kind: "method",
              qualifiedName: "com.example.UserMapper::baseColumns"
            }
          }
        ],
        truncated: false
      }
    });
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "src/main/resources/UserMapper.xml", language: "xml" }
    ]);
  });
});
