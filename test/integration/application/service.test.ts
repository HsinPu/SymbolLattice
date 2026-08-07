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
  DEFAULT_FILE_LIMIT,
  DEFAULT_ROUTE_LIMIT,
  MAX_GIT_HUNK_DECLARATION_ANCHORS,
  MAX_GIT_HUNK_LIMIT,
  MAX_GIT_HUNK_SOURCE_FILES,
  MAX_HIERARCHY_LIMIT,
  MAX_ENTRYPOINT_LIMIT,
  MAX_FILE_LIMIT,
  MAX_ROUTE_LIMIT,
  MAX_GENERATION_DIFF_LIMIT,
  MAX_GENERATION_HISTORY_LIMIT,
  NODE_MATCH_CANDIDATE_LIMIT,
  NODE_RELATION_LIMIT,
  NODE_SOURCE_CHARACTER_LIMIT,
  NODE_SOURCE_LINE_LIMIT,
  createFrameworkProjectPluginRegistry,
  createReferenceResolverPluginRegistry,
  SymbolLatticeError,
  SymbolLatticeService
} from "../../../src/application/index.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  PROJECT_RESOLVER_VERSION,
  SOURCE_ROLE_CLASSIFIER_VERSION,
  SOURCE_SEARCH_INDEX_VERSION,
  type GraphSnapshot,
  type IndexedSourceDocument,
  type IndexStatus
} from "../../../src/domain/index.js";
import {
  createFrameworkFactPluginRegistry,
  extractFileFacts
} from "../../../src/extraction/index.js";
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
    expect(exploration.source).toMatchObject({
      filePath: "src/math.ts",
      text: expect.stringContaining("function add"),
      range: expect.objectContaining({
        start: expect.objectContaining({ line: expect.any(Number), column: expect.any(Number) }),
        end: expect.objectContaining({ line: expect.any(Number), column: expect.any(Number) })
      }),
      sourceIdentity: expect.objectContaining({
        policy: "source-delivery-v2",
        id: expect.stringMatching(/^source:[0-9a-f]{64}$/u),
        offsetMap: expect.objectContaining({ policy: "source-delivery-offset-map-v1" })
      }),
      requestedCharacters: expect.any(Number),
      emittedCharacters: expect.any(Number),
      truncated: false,
      truncationReason: null
    });
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

  it("uses named-file-first graph focus for a bounded natural-language explore query", async () => {
    const projectPath = await createInlineProject({
      "src/api/orders.ts": [
        'import { persistOrder } from "../data/orders.js";',
        "",
        "export function createOrder(): string {",
        "  // prepare order metadata",
        "  // validate the request",
        "  // normalize item values",
        "  // reserve inventory",
        "  // record the audit intent",
        "",
        "  // The exact call site is intentionally outside the declaration excerpt.",
        "  // The persisted call below is the only graph connection in this function.",
        "  return persistOrder();",
        "}",
        "",
        "export function validatePayload(): boolean {",
        "  return true;",
        "}",
        ""
      ].join("\r\n"),
      "src/data/orders.ts": [
        "export function persistOrder(): string {",
        '  return "persisted generation";',
        "}",
        ""
      ].join("\n"),
      "src/legacy/orders.ts": [
        "export function createOrder(): string {",
        '  return "legacy";',
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });
    await writeFile(
      join(projectPath, "src", "api", "orders.ts"),
      'export function liveOnlyApi() { return "not indexed api"; }\n',
      "utf8"
    );
    await writeFile(
      join(projectPath, "src", "data", "orders.ts"),
      'export function liveOnly() { return "not indexed"; }\n',
      "utf8"
    );

    const result = await service.explore(
      projectPath,
      "Trace `src/api/orders.ts` createOrder to persistOrder"
    );

    expect(result).toMatchObject({
      mode: "query",
      status: { stale: true, staleReasons: ["source-files-changed"] },
      match: { status: "not_found" },
      sourceAvailability: "not-applicable",
      source: null,
      queryPlan: {
        policy: "explore-query-plan-v10",
        ranking: {
          graphDiffusion: {
            policy: "explore-query-graph-diffusion-v2",
            reason: "completed",
            applied: true,
            seedMode: "strong-lexical",
            seedFileWeighting: "uniform-per-file",
            restartProbability: 0.25,
            maximumHops: 4,
            maximumIterations: 96,
            converged: true
          }
        },
        fileHints: ["src/api/orders.ts"],
        identifierTerms: ["createorder", "persistorder"],
        summary: {
          candidateCount: 4,
          selectedCount: 4,
          selectedFileCount: 3,
          truncated: false
        }
      },
      focuses: [
        {
          rank: 1,
          symbol: { name: "createOrder", filePath: "src/api/orders.ts" },
          reasons: [
            "explicit-file",
            "exact-symbol-term",
            "graph-connected",
            "graph-mass",
            "graph-diffusion"
          ],
          sourceAvailability: "active-generation",
          source: { filePath: "src/api/orders.ts" }
        },
        {
          rank: 2,
          symbol: { name: "validatePayload", filePath: "src/api/orders.ts" },
          reasons: ["explicit-file", "graph-diffusion"],
          sourceAvailability: "active-generation"
        },
        {
          rank: 3,
          symbol: { name: "persistOrder", filePath: "src/data/orders.ts" },
          reasons: [
            "exact-symbol-term",
            "graph-connected",
            "graph-mass",
            "graph-diffusion"
          ],
          sourceAvailability: "active-generation"
        },
        {
          rank: 4,
          symbol: { name: "createOrder", filePath: "src/legacy/orders.ts" },
          reasons: ["exact-symbol-term", "graph-diffusion"],
          sourceAvailability: "active-generation"
        }
      ],
      connections: [
        {
          source: { name: "createOrder", filePath: "src/api/orders.ts" },
          target: { name: "persistOrder", filePath: "src/data/orders.ts" },
          edge: { kind: "calls", resolution: "exact" }
        }
      ],
      sourceAllocation: {
        policy: "reference-order-source-v1",
        budget: { characterBudget: 24_000 },
        summary: { candidateCount: 4 }
      },
      pathSpinePlan: {
        policy: "explore-path-spines-v1",
        summary: { selectedSpineCount: 0, bridgeSymbolCount: 0 }
      },
      sourceWindowPlan: {
        policy: "explore-source-windows-v1",
        summary: { candidateCount: 1, selectedCount: 1, truncated: false }
      },
      sourceWindows: [
        {
          index: 0,
          focusRank: 1,
          filePath: "src/api/orders.ts",
          reason: "exact-connection-site",
          source: { filePath: "src/api/orders.ts" }
        }
      ],
      sourceWindowAllocation: {
        policy: "explore-source-window-allocation-v4",
        budget: { totalCharacterBudget: 24_000 },
        summary: { candidateCount: 1, emittedWindows: 1 }
      }
    });
    expect(result.focuses?.map((focus) => focus.source?.text).join("\n")).toContain(
      "persisted generation"
    );
    expect(result.focuses?.map((focus) => focus.source?.text).join("\n")).not.toContain(
      "not indexed"
    );
    expect(result.sourceAllocation?.summary.emittedCharacters).toBeLessThanOrEqual(24_000);
    expect(result.sourceWindows?.[0]?.source.text).toContain("return persistOrder();");
    expect(result.sourceWindows?.[0]?.source.text).not.toContain("not indexed api");
    expect(
      (result.sourceAllocation?.summary.emittedCharacters ?? 0) +
        (result.sourceWindowAllocation?.summary.emittedCharacters ?? 0)
    ).toBeLessThanOrEqual(24_000);
  });

  it("ranks question-mode generated candidates by persisted numeric source worth", async () => {
    const projectPath = await createInlineProject({
      "src/order-service.ts":
        "import { persistOrder } from './persistence.js';\n" +
        "export function orderService() { return persistOrder(); }\n",
      "src/persistence.ts": "export function persistOrder() { return 'persisted'; }\n",
      "src/order-service.generated.ts":
        "// Code generated by fixture; DO NOT EDIT.\n" +
        "export function orderService() { return 'generated'; }\n",
      "src/order-service-adapter.ts":
        "export function orderServiceAdapter() { return 'adapter'; }\n"
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.explore(projectPath, "orderService");

    expect(result.queryPlan).toMatchObject({
      policy: "explore-query-plan-v10",
      ranking: {
        policy: "explore-query-source-worth-v1",
        generatedSourceWorth: 0.3,
        explicitFileExempt: true,
        classifierVersion: "generated-evidence-v1"
      },
      summary: {
        candidateCount: 4,
        generatedCandidateCount: 1,
        selectedCount: 4,
        selectedGeneratedCount: 1
      }
    });
    expect(result.queryPlan?.selection.map((selection) => selection.symbol.filePath)).toEqual([
      "src/order-service.ts",
      "src/persistence.ts",
      "src/order-service.generated.ts",
      "src/order-service-adapter.ts"
    ]);
    expect(result.queryPlan?.selection[0]).toMatchObject({
      score: 702,
      rankingScore: 702,
      graphMass: {
        policy: "explore-query-graph-mass-v2",
        eligibleRelationshipCount: 1,
        exactRelationshipCount: 1,
        omittedRelationshipCount: 0,
        distinctNeighborCount: 1,
        uncappedScore: 12,
        score: 12,
        rankingContribution: 12,
        truncated: false,
        relationCounts: { calls: 1 }
      }
    });
    expect(result.queryPlan?.selection[2]).toMatchObject({
      score: 562.5,
      rankingScore: 168.75,
      sourceWorth: 0.3,
      rankingDecision: "generated-source-worth",
      generated: {
        classifierVersion: "generated-evidence-v1",
        generated: true,
        evidence: [
          { kind: "path", ruleId: "generated.path.javascript.generated-suffix", range: null },
          expect.objectContaining({
            kind: "header",
            ruleId: "generated.header.code-generated-do-not-edit"
          })
        ]
      }
    });
  });

  it("uses persisted exact multi-hop edges to separate a connected query candidate from a dead end", async () => {
    const projectPath = await createInlineProject({
      "src/dispatch.ts":
        "import { runPipeline } from './pipeline.js';\n" +
        "export function dispatch() { return runPipeline(); }\n",
      "src/pipeline.ts":
        "import { dispatchPipeline } from './z-connected.js';\n" +
        "export function runPipeline() { return dispatchPipeline(); }\n",
      "src/z-connected.ts":
        "export function dispatchPipeline() { return 'connected'; }\n",
      "src/a-dead-end.ts":
        "import { legacyHelper } from './legacy-helper.js';\n" +
        "export function dispatchLegacy() { return legacyHelper(); }\n",
      "src/legacy-helper.ts":
        "export function legacyHelper() { return 'legacy'; }\n"
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.explore(projectPath, "dispatch behavior");

    expect(result.queryPlan).toMatchObject({
      policy: "explore-query-plan-v10",
      ranking: {
        graphExpansion: {
          policy: "explore-query-graph-expansion-v2",
          reason: "completed",
          applied: true,
          maximumHops: 2,
          seedFileCount: 1,
          seedSymbolCount: 1,
          discoveredSymbolCount: 2,
          admittedSymbolCount: 1,
          admittedFileCount: 1,
          rejectedExistingFileCount: 1
        },
        graphDiffusion: {
          policy: "explore-query-graph-diffusion-v2",
          reason: "completed",
          applied: true,
          seedMode: "strong-lexical",
          seedFileCount: 1,
          seedSymbolCount: 1,
          subgraphNodeCount: 3,
          subgraphRelationshipCount: 2,
          converged: true
        }
      },
      summary: {
        candidateCount: 4,
        lexicalCandidateCount: 3,
        expandedCandidateCount: 1,
        expandedCandidateFileCount: 1,
        graphDiffusionCandidateCount: 3,
        graphDiffusionReachedCandidateCount: 2,
        selectedCount: 4
      }
    });
    expect(result.queryPlan?.selection.map((selection) => selection.symbol.name)).toEqual([
      "dispatch",
      "runPipeline",
      "dispatchPipeline",
      "dispatchLegacy"
    ]);
    expect(result.queryPlan?.selection[1]?.graphExpansion).toMatchObject({
      policy: "explore-query-graph-expansion-v2",
      state: "expanded",
      seedSymbolId: expect.any(String),
      hops: 1,
      path: [expect.objectContaining({ kind: "calls", direction: "forward" })]
    });
    expect(result.queryPlan?.selection[2]?.graphDiffusion).toMatchObject({
      state: "reached",
      seed: false,
      seedWeight: 0
    });
    expect(result.queryPlan?.selection[2]?.graphDiffusion.fileMass).toBeGreaterThan(0);
    expect(result.queryPlan?.selection[3]?.graphDiffusion).toMatchObject({
      state: "outside-subgraph",
      fileMass: 0,
      score: 0
    });
  });

  it("rescues persisted callable input and output types from exact signature evidence", async () => {
    const projectPath = await createInlineProject({
      "src/contracts.ts": [
        "export interface RequestInput { id: string }",
        "export type Result = { ok: boolean };"
      ].join("\n"),
      "src/service.ts": [
        'import type { RequestInput, Result } from "./contracts.js";',
        "export const execute = (input: RequestInput): Promise<Result> =>",
        "  Promise.resolve({ ok: input.id.length > 0 });"
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.explore(projectPath, "execute behavior");

    expect(result.queryPlan?.selection.map((selection) => selection.symbol.name)).toEqual(
      expect.arrayContaining(["execute", "RequestInput", "Result"])
    );
    expect(
      result.queryPlan?.ranking.graphExpansion.candidates
        .filter((candidate) => candidate.admitted)
        .flatMap((candidate) => candidate.path.map((segment) => segment.kind))
        .sort()
    ).toEqual(["accepts", "returns"]);
    expect(result.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.objectContaining({ name: "execute" }),
          target: expect.objectContaining({ name: "RequestInput" }),
          edge: expect.objectContaining({
            kind: "accepts",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "signature.accepts.imported-type",
              stage: "module"
            })
          })
        }),
        expect.objectContaining({
          source: expect.objectContaining({ name: "execute" }),
          target: expect.objectContaining({ name: "Result" }),
          edge: expect.objectContaining({
            kind: "returns",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "signature.returns.imported-type",
              stage: "module"
            })
          })
        })
      ])
    );
  });

  it("keeps weak file-name collisions out of the persisted explore source envelope", async () => {
    const projectPath = await createInlineProject({
      "src/dispatch.ts":
        "export function dispatch() { return 'exact-dispatch'; }\n",
      "src/dispatch-pipeline.ts":
        "export function dispatchPipeline() { return 'partial-pipeline'; }\n",
      "src/dispatch-registry.ts":
        "export function dispatchRegistry() { return 'partial-registry'; }\n",
      "src/dispatch-noise-a.ts":
        "export function worker() { return 'weak-file-a'; }\n",
      "src/dispatch-noise-b.ts":
        "export function helper() { return 'weak-file-b'; }\n"
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.explore(projectPath, "dispatch pipeline");

    expect(result.queryPlan).toMatchObject({
      policy: "explore-query-plan-v10",
      scoreFloor: {
        policy: "explore-query-relative-file-score-floor-v1",
        reason: "relative-floor-applied",
        applied: true,
        topFileScore: 510,
        computedFloor: 102,
        candidateFileCount: 5,
        filesPastFloorCount: 3,
        retainedFileCount: 3,
        excludedFileCount: 2,
        excludedFiles: [
          { filePath: "src/dispatch-noise-a.ts", bestCandidateId: expect.any(String) },
          { filePath: "src/dispatch-noise-b.ts", bestCandidateId: expect.any(String) }
        ]
      },
      summary: {
        candidateCount: 5,
        scoreFloorFilteredCandidateCount: 2,
        scoreFloorFilteredFileCount: 2,
        selectedCount: 3,
        selectedFileCount: 3
      }
    });
    expect(result.focuses?.map((focus) => focus.symbol.filePath)).toEqual([
      "src/dispatch.ts",
      "src/dispatch-pipeline.ts",
      "src/dispatch-registry.ts"
    ]);
    expect(result.focuses?.map((focus) => focus.source?.text).join("\n"))
      .not.toMatch(/weak-file-a|weak-file-b/u);
  });

  it("keeps test source out of a general explore envelope when production evidence is sufficient", async () => {
    const projectPath = await createInlineProject({
      "src/order-service.ts":
        "export function orderService() { return 'production-service'; }\n",
      "src/order-controller.ts":
        "export function orderService() { return 'production-controller'; }\n",
      "test/order-service.test.ts":
        "export function orderService() { return 'test-service'; }\n",
      "test/order-controller.test.ts":
        "export function orderService() { return 'test-controller'; }\n"
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.explore(projectPath, "orderService");

    expect(result.queryPlan).toMatchObject({
      policy: "explore-query-plan-v10",
      filtering: {
        policy: "explore-query-low-value-filter-v2",
        reason: "sufficient-production-evidence",
        applied: true,
        productionCandidateFileCount: 2,
        testCandidateFileCount: 2,
        excludedTestCandidateCount: 2,
        excludedTestFileCount: 2,
        excludedFiles: [
          { filePath: "test/order-controller.test.ts", reason: "test-source-filtered" },
          { filePath: "test/order-service.test.ts", reason: "test-source-filtered" }
        ]
      },
      summary: {
        candidateCount: 4,
        filteredCandidateCount: 2,
        selectedCount: 2,
        selectedTestCount: 0
      }
    });
    expect(result.focuses?.map((focus) => focus.symbol.filePath)).toEqual([
      "src/order-controller.ts",
      "src/order-service.ts"
    ]);
    expect(result.focuses?.map((focus) => focus.source?.text).join("\n")).not.toContain(
      "test-service"
    );
  });

  it("persists and filters icon and localization sources while honoring role intent", async () => {
    const projectPath = await createInlineProject({
      "src/render-service.ts":
        "export function renderAsset() { return 'production-service'; }\n",
      "src/render-controller.ts":
        "export function renderAsset() { return 'production-controller'; }\n",
      "src/icons/render-asset.ts":
        "export function renderAsset() { return 'icon-source'; }\n",
      "src/i18n/render-asset.ts":
        "export function renderAsset() { return 'localization-source'; }\n"
    });
    const service = createService();
    await service.init({ projectPath });

    const general = await service.explore(projectPath, "renderAsset");
    expect(general.queryPlan).toMatchObject({
      policy: "explore-query-plan-v10",
      filtering: {
        policy: "explore-query-low-value-filter-v2",
        reason: "sufficient-production-evidence",
        excludedIconCandidateCount: 1,
        excludedLocalizationCandidateCount: 1
      },
      summary: {
        iconCandidateCount: 1,
        localizationCandidateCount: 1,
        selectedIconCount: 0,
        selectedLocalizationCount: 0
      }
    });
    expect(general.focuses?.map((focus) => focus.source?.text).join("\n"))
      .not.toMatch(/icon-source|localization-source/u);

    const iconIntent = await service.explore(projectPath, "which icons renderAsset");
    expect(iconIntent.queryPlan?.queryIntent).toMatchObject({
      icons: true,
      localization: false,
      matchedTerms: ["icons"]
    });
    expect(iconIntent.focuses?.find((focus) => focus.symbol.filePath.includes("/icons/")))
      .toMatchObject({
        sourceRole: {
          classifierVersion: "source-role-evidence-v2",
          role: "icon",
          evidence: [{ ruleId: "source-role.path.icon-token" }]
        },
        sourceRoleDecision: "icon-intent-exempt"
      });
    expect(iconIntent.focuses?.map((focus) => focus.symbol.filePath))
      .not.toContain("src/i18n/render-asset.ts");
  });

  it("loads an unselected exact path bridge from the same persisted generation", async () => {
    const projectPath = await createInlineProject({
      "src/entry.ts": [
        'import { bridgeFlow } from "./bridge.js";',
        "export function startFlow(): string { return bridgeFlow(); }",
        "export function entryHelper(): boolean { return true; }",
        ""
      ].join("\n"),
      "src/bridge.ts": [
        "// Code generated by fixture; DO NOT EDIT.",
        'import { finishFlow } from "./target.js";',
        "// setup-a",
        "// setup-b",
        "export function bridgeFlow(): string {",
        "  return finishFlow();",
        "}",
        "// context-a",
        "// context-b",
        "// context-c",
        "// z",
        ""
      ].join("\n"),
      "src/target.ts": [
        'export function finishFlow(): string { return "persisted target"; }',
        "export function targetHelper(): boolean { return true; }",
        ""
      ].join("\n"),
      "src/extra-a.ts": [
        "export function extraAlpha(): boolean { return true; }",
        "export function extraBeta(): boolean { return true; }",
        ""
      ].join("\n"),
      "src/extra-b.ts": [
        "export function extraGamma(): boolean { return true; }",
        "export function extraDelta(): boolean { return true; }",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });
    await writeFile(
      join(projectPath, "src", "bridge.ts"),
      'export function liveOnlyBridge() { return "not indexed bridge"; }\n',
      "utf8"
    );

    const result = await service.explore(
      projectPath,
      "Trace src/entry.ts startFlow through src/target.ts finishFlow with src/extra-a.ts extraAlpha and src/extra-b.ts extraGamma"
    );

    expect(result.queryPlan?.selection.some(({ symbol }) => symbol.name === "bridgeFlow")).toBe(false);
    expect(result).toMatchObject({
      mode: "query",
      status: { stale: true },
      pathSpinePlan: {
        policy: "explore-path-spines-v1",
        summary: { selectedSpineCount: 1, bridgeSymbolCount: 1 },
        spines: [{ bridgeSymbols: [{ name: "bridgeFlow", filePath: "src/bridge.ts" }] }]
      }
    });
    expect(result.sourceWindowPlan?.windows).toEqual([
      expect.objectContaining({ reason: "exact-path-spine", filePath: "src/bridge.ts" })
    ]);
    expect(result.sourceWindows).toEqual([
      expect.objectContaining({
        filePath: "src/bridge.ts",
        reason: "exact-path-spine",
        pathSpineIndexes: [0],
        source: expect.objectContaining({ filePath: "src/bridge.ts" })
      })
    ]);
    const bridgeWindow = result.sourceWindows?.find(
      (window) => window.reason === "exact-path-spine"
    );
    expect(bridgeWindow?.source.text).toContain("bridgeFlow");
    expect(bridgeWindow?.source.text).toContain("// z");
    expect(bridgeWindow?.source.text).not.toContain("not indexed bridge");
    expect(result.sourceWindowAllocation?.windows).toEqual([
      expect.objectContaining({
        filePath: "src/bridge.ts",
        renderMode: "whole-file",
        wholeFileDecision: "buy",
        wholeFileEligible: true,
        generated: true,
        generatedClassifierVersion: "generated-evidence-v1",
        generatedEvidenceRuleIds: ["generated.header.code-generated-do-not-edit"],
        sourceWorth: 0.3,
        cliffExempt: true,
        allocationDecision: "admitted"
      })
    ]);
    expect(
      (result.sourceAllocation?.summary.emittedCharacters ?? 0) +
        (result.sourceWindowAllocation?.summary.emittedCharacters ?? 0)
    ).toBeLessThanOrEqual(24_000);
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
    expect(unboundedImpact.summary.returnedPathCount).toBe(unboundedImpact.paths.length);
    expect(boundedImpact.summary).toMatchObject({
      returnedPathCount: 1,
      impactedFileCount: 1,
      entrypointCoverage: { routes: [], entrypoints: [] }
    });
    expect(
      boundedImpact.summary.files.flatMap((file) =>
        file.impactedSymbols.map((terminal) => terminal.symbol.id)
      )
    ).toEqual(boundedImpact.paths.map((path) => path.symbols.at(-1)?.id));
  });

  it("delivers context source inside one auditable character envelope", async () => {
    const alpha = [
      "// alpha prelude",
      "export function alpha(): string {",
      `  return "${"a".repeat(1_800)}";`,
      "}",
      "// alpha epilogue"
    ].join("\r\n");
    const beta = [
      "// beta prelude",
      "export function beta(): string {",
      `  return "${"b".repeat(1_800)}";`,
      "}",
      "// beta epilogue"
    ].join("\r\n");
    const projectPath = await createInlineProject({
      "src/alpha.ts": alpha,
      "src/beta.ts": beta
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.context(
      projectPath,
      ["src/alpha.ts#alpha", "src/beta.ts#beta"],
      { sourceCharacterBudget: 2_048 }
    );

    expect(result.bounds.source).toEqual({
      totalCharacterBudget: 2_048,
      minimumTotalCharacterBudget: 2_048,
      maximumTotalCharacterBudget: 64_000,
      minimumPerReference: 256,
      allocationPolicy: "reference-order-source-v1"
    });
    expect(result.sourceAllocation).toMatchObject({
      policy: "reference-order-source-v1",
      summary: {
        candidateCount: 2,
        allocatedCharacters: 2_048,
        truncated: true
      },
      contexts: [
        { referenceIndex: 0, reference: "src/alpha.ts#alpha", truncated: true },
        { referenceIndex: 1, reference: "src/beta.ts#beta", truncated: true }
      ]
    });
    const sources = result.contexts.map((context) => context.source!);
    expect(sources.every((source) => !source.text.includes("\r"))).toBe(true);
    expect(sources.reduce((total, source) => total + source.text.length, 0)).toBeLessThanOrEqual(2_048);
    expect(result.sourceAllocation.summary.emittedCharacters).toBe(
      sources.reduce((total, source) => total + source.text.length, 0)
    );
    expect(sources[0]).toMatchObject({
      range: { start: { line: 1, column: 1 } },
      sourceIdentity: {
        policy: "source-delivery-v2",
        canonicalization: "line-endings-lf",
        filePath: "src/alpha.ts",
        offsetMap: { policy: "source-delivery-offset-map-v1" }
      },
      requestedCharacters: expect.any(Number),
      emittedCharacters: expect.any(Number),
      truncated: true,
      truncationReason: "character-budget"
    });
  });

  it("investigates persisted lexical evidence into bounded active-generation graph context", async () => {
    const projectPath = await createInlineProject({
      "src/entry.ts": [
        'import { investigateTarget } from "./target.js";',
        "",
        "export function investigateEntry(): string {",
        "  return investigateTarget();",
        "}",
        ""
      ].join("\n"),
      "src/target.ts": [
        "export function investigateTarget(): string {",
        '  return "indexed target evidence";',
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.investigate(projectPath, "investigateTarget", {
      searchLimit: 4,
      symbolLimit: 2,
      relationLimit: 1,
      maxHops: 2,
      impactDepth: 2,
      impactLimit: 1
    });

    expect(result).toMatchObject({
      status: { stale: false },
      query: "investigateTarget",
      bounds: {
        searchLimit: 4,
        maximumSearchLimit: 100,
        symbolLimit: 2,
        maximumSymbolLimit: 8,
        ranking: "lexical",
        declarationSource: {
          sourceLineLimit: NODE_SOURCE_LINE_LIMIT,
          sourceCharacterLimit: NODE_SOURCE_CHARACTER_LIMIT
        },
        context: {
          relationLimit: 1,
          maxHops: 2,
          impactDepth: 2,
          impactLimit: 1
        }
      },
      search: {
        results: expect.arrayContaining([
          expect.objectContaining({
            filePath: "src/target.ts",
            symbolCandidates: [expect.objectContaining({ name: "investigateTarget" })]
          })
        ])
      },
      selection: {
        items: [
          expect.objectContaining({
            selectionRank: 1,
            sourceRank: expect.any(Number),
            candidateRank: expect.any(Number),
            structuralSignals: expect.objectContaining({
              directExactCallerCount: expect.any(Number),
              directExactCalleeCount: expect.any(Number),
              isExported: true,
              score: expect.any(Number)
            }),
            symbol: expect.objectContaining({
              qualifiedName: "src/target.ts#investigateTarget"
            })
          })
        ],
        total: 1,
        truncated: false
      },
      declarations: [
        expect.objectContaining({
          reference: "src/target.ts#investigateTarget",
          sourceAvailability: "active-generation",
          source: expect.objectContaining({
            filePath: "src/target.ts",
            text: expect.stringContaining("indexed target evidence")
          })
        })
      ],
      contexts: [
        expect.objectContaining({
          reference: "src/target.ts#investigateTarget",
          match: expect.objectContaining({ status: "exact" }),
          sourceAvailability: "active-generation",
          source: expect.objectContaining({ filePath: "src/target.ts" }),
          callers: expect.objectContaining({
            items: [expect.objectContaining({ symbol: expect.objectContaining({ name: "investigateEntry" }) })]
          })
        })
      ],
      evidencePaths: []
    });

    await writeFile(
      join(projectPath, "src", "target.ts"),
      'export function investigateTarget(): string { return "live replacement"; }\n',
      "utf8"
    );
    const stale = await service.investigate(projectPath, "investigateTarget");
    expect(stale).toMatchObject({ status: { stale: true } });
    expect(stale.contexts[0]?.source?.lines.map((line) => line.text).join("\n")).toContain(
      "indexed target evidence"
    );
    expect(stale.declarations[0]?.source?.text).toContain("indexed target evidence");

    await expect(
      service.investigate(projectPath, "investigateTarget", { symbolLimit: 9 })
    ).rejects.toMatchObject({ code: "INVALID_INVESTIGATE_SYMBOL_LIMIT" });
    await expect(
      service.investigate(projectPath, "investigateTarget", {
        ranking: "unproven" as never
      })
    ).rejects.toMatchObject({ code: "INVALID_INVESTIGATE_RANKING" });
  });

  it("optionally reorders lexical candidates with disclosed direct static structure", async () => {
    const projectPath = await createInlineProject({
      "src/a-isolated.ts": [
        "export function rankProbe(): string {",
        '  const lexicalEvidence = "rankProbe rankProbe rankProbe rankProbe rankProbe";',
        "  return lexicalEvidence;",
        "}",
        ""
      ].join("\n"),
      "src/b-connected.ts": [
        "export function rankProbe(): string {",
        '  return "connected";',
        "}",
        ""
      ].join("\n"),
      "src/caller.ts": [
        'import { rankProbe } from "./b-connected.js";',
        "",
        "function invokeConnectedProbe(): string {",
        "  return rankProbe();",
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const lexical = await service.investigate(projectPath, "rankProbe", {
      ranking: "lexical",
      searchLimit: 10,
      symbolLimit: 1
    });
    const structural = await service.investigate(projectPath, "rankProbe", {
      ranking: "structure",
      searchLimit: 10,
      symbolLimit: 1
    });
    const lexicalCandidate = lexical.selection.items[0];
    const structuralCandidate = structural.selection.items[0];
    if (lexicalCandidate === undefined || structuralCandidate === undefined) {
      throw new Error("Expected ranked investigation candidates.");
    }

    expect(lexical.bounds.ranking).toBe("lexical");
    expect(lexicalCandidate).toMatchObject({
      selectionRank: 1,
      symbol: { filePath: "src/a-isolated.ts" },
      structuralSignals: {
        directExactCallerCount: 0,
        directExactCalleeCount: 0,
        isExported: true,
        score: 1
      }
    });
    expect(structural.bounds.ranking).toBe("structure");
    expect(structuralCandidate).toMatchObject({
      selectionRank: 1,
      symbol: { filePath: "src/b-connected.ts" },
      structuralSignals: expect.objectContaining({
        directExactCallerCount: expect.any(Number),
        isExported: true
      })
    });
    expect(structuralCandidate.structuralSignals.directExactCallerCount).toBeGreaterThan(0);
    expect(structuralCandidate.structuralSignals.score).toBeGreaterThan(
      lexicalCandidate.structuralSignals.score
    );
    expect(structural.declarations[0]?.reference).toBe("src/b-connected.ts#rankProbe");
    expect(structural.contexts[0]?.reference).toBe("src/b-connected.ts#rankProbe");
  });

  it("optionally reorders lexical candidates with disclosed bounded exact multi-hop impact", async () => {
    const projectPath = await createInlineProject({
      "src/a-isolated.ts": [
        "export function rankImpact(): string {",
        '  const lexicalEvidence = "rankImpact rankImpact rankImpact rankImpact rankImpact";',
        "  return lexicalEvidence;",
        "}",
        ""
      ].join("\\n"),
      "src/b-impacted.ts": [
        "export function rankImpact(): string {",
        '  return "impacted";',
        "}",
        ""
      ].join("\\n"),
      "src/c-direct.ts": [
        'import { rankImpact } from "./b-impacted.js";',
        "",
        "export function invokeFirst(): string {",
        "  return rankImpact();",
        "}",
        "",
        "export function invokeSecond(): string {",
        "  return invokeFirst();",
        "}",
        ""
      ].join("\\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const lexical = await service.investigate(projectPath, "rankImpact", {
      ranking: "lexical",
      searchLimit: 12,
      symbolLimit: 1
    });
    const impact = await service.investigate(projectPath, "rankImpact", {
      ranking: "impact",
      searchLimit: 12,
      symbolLimit: 1
    });
    const lexicalCandidate = lexical.selection.items[0];
    const impactCandidate = impact.selection.items[0];
    if (lexicalCandidate === undefined || impactCandidate === undefined) {
      throw new Error("Expected impact-ranked investigation candidates.");
    }

    expect(lexical.bounds.ranking).toBe("lexical");
    expect(lexicalCandidate.symbol.filePath).toBe("src/a-isolated.ts");
    expect(lexicalCandidate.impactSignals).toBeNull();
    expect(impact.bounds.ranking).toBe("impact");
    expect(impactCandidate.symbol.filePath).toBe("src/b-impacted.ts");
    expect(impactCandidate.impactSignals).toMatchObject({
      maxDepth: 3,
      pathLimit: 24,
      directExactDependentCount: expect.any(Number),
      multiHopExactDependentCount: expect.any(Number),
      truncated: false
    });
    expect(impactCandidate.impactSignals?.directExactDependentCount).toBeGreaterThan(0);
    expect(impactCandidate.impactSignals?.multiHopExactDependentCount).toBeGreaterThan(0);
    expect(impactCandidate.impactSignals?.score).toBeGreaterThan(0);
    const impactSignals = impactCandidate.impactSignals;
    if (impactSignals === null) {
      throw new Error("Expected impact signals for impact ranking.");
    }
    expect(impactSignals.exactDependentCount).toBe(
      impactSignals.pathCountsByDepth.reduce((total, item) => total + item.count, 0)
    );
    expect(impactSignals.score).toBe(
      impactSignals.pathCountsByDepth.reduce(
        (total, item) => total + item.count * (impactSignals.maxDepth - item.depth + 1),
        0
      )
    );
    expect(impactCandidate.impactSignals?.pathCountsByDepth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ depth: 1, count: expect.any(Number) }),
        expect.objectContaining({ depth: 2, count: expect.any(Number) })
      ])
    );
    expect(impactCandidate.impactSignals?.finalEdgeKindCounts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "calls", count: expect.any(Number) })])
    );
  });

  it("optionally reorders lexical candidates with disclosed bounded exact topology relevance", async () => {
    const projectPath = await createInlineProject({
      "src/a-isolated.ts": [
        "export function rankTopology(): string {",
        '  const lexicalEvidence = "rankTopology rankTopology rankTopology rankTopology rankTopology";',
        "  return lexicalEvidence;",
        "}",
        ""
      ].join("\n"),
      "src/b-connected.ts": [
        "export function rankTopology(): string {",
        '  return "connected";',
        "}",
        ""
      ].join("\n"),
      "src/c-caller.ts": [
        'import { rankTopology } from "./b-connected.js";',
        "",
        "export function invokeConnectedTopology(): string {",
        "  return rankTopology();",
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const lexical = await service.investigate(projectPath, "rankTopology", {
      ranking: "lexical",
      searchLimit: 12,
      symbolLimit: 1
    });
    const topology = await service.investigate(projectPath, "rankTopology", {
      ranking: "topology",
      searchLimit: 12,
      symbolLimit: 1
    });
    const lexicalCandidate = lexical.selection.items[0];
    const topologyCandidate = topology.selection.items[0];
    if (lexicalCandidate === undefined || topologyCandidate === undefined) {
      throw new Error("Expected topology-ranked investigation candidates.");
    }

    expect(lexical.bounds.ranking).toBe("lexical");
    expect(lexicalCandidate.symbol.filePath).toBe("src/a-isolated.ts");
    expect(lexicalCandidate.topologySignals).toBeNull();
    expect(topology.bounds.ranking).toBe("topology");
    expect(topologyCandidate.symbol.filePath).toBe("src/b-connected.ts");
    expect(topologyCandidate.topologySignals).toMatchObject({
      maxHops: 3,
      maxVisitedSymbols: 500,
      seedLimit: 64,
      seedCount: expect.any(Number),
      seedTruncated: false,
      seeded: true,
      scopeSymbolCount: expect.any(Number),
      scopedExactNeighborCount: expect.any(Number),
      scopedExactIncidentEdgeKindCounts: expect.arrayContaining([
        expect.objectContaining({ kind: "calls", count: expect.any(Number) }),
        expect.objectContaining({ kind: "extends", count: 0 }),
        expect.objectContaining({ kind: "implements", count: 0 })
      ]),
      iterationCount: 20,
      restartProbability: 0.2,
      edgeKinds: ["calls", "references", "routes", "handles", "imports", "extends", "implements", "instantiates", "overrides"],
      score: expect.any(Number),
      traversalTruncated: expect.any(Boolean),
      depthLimitReached: expect.any(Boolean)
    });
    expect(topologyCandidate.topologySignals?.seedCount).toBeGreaterThan(0);
    expect(topologyCandidate.topologySignals?.scopeSymbolCount).toBeGreaterThan(1);
    expect(topologyCandidate.topologySignals?.scopedExactNeighborCount).toBeGreaterThan(0);
    expect(topologyCandidate.topologySignals?.score).toBeGreaterThan(0);
    expect(topology.declarations[0]?.reference).toBe("src/b-connected.ts#rankTopology");
    expect(topology.contexts[0]?.reference).toBe("src/b-connected.ts#rankTopology");
  });

  it("uses exact persisted hierarchy evidence in topology-ranked investigation signals", async () => {
    const projectPath = await createInlineProject({
      "src/a-isolated.ts": [
        "export function rankHierarchyTopology(): string {",
        '  const lexicalEvidence = "rankHierarchyTopology rankHierarchyTopology rankHierarchyTopology";',
        "  return lexicalEvidence;",
        "}",
        ""
      ].join("\n"),
      "src/b-contract.ts": "export interface rankHierarchyTopology { run(): string; }\n",
      "src/c-implementation.ts": [
        'import type { rankHierarchyTopology } from "./b-contract";',
        "export class ConcreteTopology implements rankHierarchyTopology {",
        '  run(): string { return "connected"; }',
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const hierarchy = await service.hierarchy(projectPath, "src/b-contract.ts#rankHierarchyTopology");
    const topology = await service.investigate(projectPath, "rankHierarchyTopology", {
      ranking: "topology",
      searchLimit: 12,
      symbolLimit: 8
    });
    const contractCandidate = topology.selection.items.find(
      ({ symbol }) => symbol.qualifiedName === "src/b-contract.ts#rankHierarchyTopology"
    );

    expect(hierarchy.children).toEqual([
      expect.objectContaining({
        relation: "implements",
        child: expect.objectContaining({ name: "ConcreteTopology" }),
        edge: expect.objectContaining({ kind: "implements", resolution: "exact" })
      })
    ]);
    expect(contractCandidate?.topologySignals).toMatchObject({
      edgeKinds: ["calls", "references", "routes", "handles", "imports", "extends", "implements", "instantiates", "overrides"],
      scopedExactNeighborCount: expect.any(Number),
      score: expect.any(Number)
    });
    expect(contractCandidate?.topologySignals?.scopedExactIncidentEdgeKindCounts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "implements", count: 1 })])
    );
    expect(contractCandidate?.topologySignals?.score).toBeGreaterThan(0);
  });

  it("uses exact persisted class instantiation evidence in topology-ranked investigation signals", async () => {
    const projectPath = await createInlineProject({
      "src/a-isolated.ts": [
        "export function rankInstantiationTopology(): string {",
        '  const lexicalEvidence = "rankInstantiationTopology rankInstantiationTopology rankInstantiationTopology";',
        "  return lexicalEvidence;",
        "}",
        ""
      ].join("\n"),
      "src/b-widget.ts": "export class rankInstantiationTopology {}\n",
      "src/c-creator.ts": [
        'import { rankInstantiationTopology } from "./b-widget";',
        "export function createRankInstantiationTopology(): rankInstantiationTopology {",
        "  return new rankInstantiationTopology();",
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const topology = await service.investigate(projectPath, "rankInstantiationTopology", {
      ranking: "topology",
      searchLimit: 12,
      symbolLimit: 8
    });
    const widgetCandidate = topology.selection.items.find(
      ({ symbol }) => symbol.qualifiedName === "src/b-widget.ts#rankInstantiationTopology"
    );

    expect(widgetCandidate?.topologySignals).toMatchObject({
      edgeKinds: ["calls", "references", "routes", "handles", "imports", "extends", "implements", "instantiates", "overrides"],
      scopedExactNeighborCount: expect.any(Number),
      score: expect.any(Number)
    });
    expect(widgetCandidate?.topologySignals?.scopedExactIncidentEdgeKindCounts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "instantiates", count: 1 })])
    );
    expect(widgetCandidate?.topologySignals?.score).toBeGreaterThan(0);
  });

  it("uses exact persisted TypeScript override evidence in topology-ranked investigation signals", async () => {
    const projectPath = await createInlineProject({
      "src/a-isolated.ts": [
        "export function rankOverrideTopology(): string {",
        '  const lexicalEvidence = "rankOverrideTopology rankOverrideTopology rankOverrideTopology";',
        "  return lexicalEvidence;",
        "}",
        ""
      ].join("\n"),
      "src/b-base.ts": [
        "export class ParentTopology {",
        '  rankOverrideTopology(): string { return "base"; }',
        "}",
        ""
      ].join("\n"),
      "src/c-child.ts": [
        'import { ParentTopology } from "./b-base";',
        "export class ChildTopology extends ParentTopology {",
        '  override rankOverrideTopology(): string { return "child"; }',
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const topology = await service.investigate(projectPath, "rankOverrideTopology", {
      ranking: "topology",
      searchLimit: 12,
      symbolLimit: 8
    });
    const childMethodCandidate = topology.selection.items.find(
      ({ symbol }) => symbol.qualifiedName === "src/c-child.ts#ChildTopology.rankOverrideTopology"
    );

    expect(childMethodCandidate?.topologySignals).toMatchObject({
      edgeKinds: ["calls", "references", "routes", "handles", "imports", "extends", "implements", "instantiates", "overrides"],
      scopedExactNeighborCount: expect.any(Number),
      score: expect.any(Number)
    });
    expect(childMethodCandidate?.topologySignals?.scopedExactIncidentEdgeKindCounts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "overrides", count: 1 })])
    );
    expect(childMethodCandidate?.topologySignals?.score).toBeGreaterThan(0);
  });

  it("persists exact same-file Java and Kotlin class and interface override evidence through init", async () => {
    const projectPath = await createInlineProject({
      "src/JavaOverrides.java": [
        "class JavaBase { void run() {} }",
        "class JavaChild extends JavaBase { @Override void run() {} }"
      ].join("\n"),
      "src/KotlinOverrides.kt": [
        "abstract class KotlinBase { abstract fun run() }",
        "class KotlinChild : KotlinBase() { override fun run() {} }"
      ].join("\n"),
      "src/JavaInterfaces.java": [
        "interface JavaContract { void run(); }",
        "class JavaInterfaceChild implements JavaContract { @Override public void run() {} }"
      ].join("\n"),
      "src/KotlinInterfaces.kt": [
        "interface KotlinContract { fun run() }",
        "class KotlinInterfaceChild : KotlinContract { override fun run() {} }"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const overrideEdge = (sourceQualifiedName: string) =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === "overrides"
      );
    const implementsEdge = (sourceQualifiedName: string, targetQualifiedName: string) =>
      snapshot.edges.find(
        (edge) =>
          edge.sourceId === symbol(sourceQualifiedName)?.id &&
          edge.targetId === symbol(targetQualifiedName)?.id &&
          edge.kind === "implements"
      );
    for (const [sourceQualifiedName, targetQualifiedName] of [
      ["src/JavaOverrides.java#JavaChild.run", "src/JavaOverrides.java#JavaBase.run"],
      ["src/KotlinOverrides.kt#KotlinChild.run", "src/KotlinOverrides.kt#KotlinBase.run"],
      ["src/JavaInterfaces.java#JavaInterfaceChild.run", "src/JavaInterfaces.java#JavaContract.run"],
      ["src/KotlinInterfaces.kt#KotlinInterfaceChild.run", "src/KotlinInterfaces.kt#KotlinContract.run"]
    ] as const) {
      expect(overrideEdge(sourceQualifiedName)).toMatchObject({
        targetId: symbol(targetQualifiedName)?.id,
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId: "syntax.override.explicit-direct-base-method", stage: "syntax" }
      });
    }
    for (const [sourceQualifiedName, targetQualifiedName, ruleId] of [
      [
        "src/JavaInterfaces.java#JavaInterfaceChild",
        "src/JavaInterfaces.java#JavaContract",
        "syntax.java.same-file.direct-implements"
      ],
      [
        "src/KotlinInterfaces.kt#KotlinInterfaceChild",
        "src/KotlinInterfaces.kt#KotlinContract",
        "syntax.kotlin.same-file.direct-implements"
      ]
    ] as const) {
      expect(implementsEdge(sourceQualifiedName, targetQualifiedName)).toMatchObject({
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId, stage: "syntax" }
      });
    }
    expect(
      graphStore
        .getArtifactFacts(projectPath)
        .flatMap((facts) => facts.pendingReferences)
        .filter((reference) => reference.relationKind === "overrides")
        .map((reference) => reference.filePath)
        .sort()
    ).toEqual([
      "src/JavaInterfaces.java",
      "src/JavaOverrides.java",
      "src/KotlinInterfaces.kt",
      "src/KotlinOverrides.kt"
    ]);
  });

  it("persists exact cross-file JVM import and qualified-type evidence through init", async () => {
    const projectPath = await createInlineProject({
      "src/java/api/JavaContract.java": [
        "package example.java.api;",
        "public interface JavaContract { void run(); }"
      ].join("\n"),
      "src/java/impl/JavaWorker.java": [
        "package example.java.impl;",
        "import example.java.api.JavaContract;",
        "public class JavaWorker implements JavaContract { @Override public void run() {} }"
      ].join("\n"),
      "src/java/impl/JavaQualifiedWorker.java": [
        "package example.java.impl;",
        "public class JavaQualifiedWorker implements example.java.api.JavaContract { @Override public void run() {} }"
      ].join("\n"),
      "src/kotlin/api/KotlinContract.kt": [
        "package example.kotlin.api",
        "interface KotlinContract { fun run() }"
      ].join("\n"),
      "src/kotlin/impl/KotlinWorker.kt": [
        "package example.kotlin.impl",
        "import example.kotlin.api.KotlinContract",
        "class KotlinWorker : KotlinContract { override fun run() {} }"
      ].join("\n"),
      "src/kotlin/impl/KotlinQualifiedWorker.kt": [
        "package example.kotlin.impl",
        "class KotlinQualifiedWorker : example.kotlin.api.KotlinContract { override fun run() {} }"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const heritageEdge = (sourceQualifiedName: string) =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === "implements"
      );
    const overrideEdge = (sourceQualifiedName: string) =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === "overrides"
      );

    for (const [sourceQualifiedName, targetQualifiedName, ruleId] of [
      [
        "src/java/impl/JavaWorker.java#JavaWorker",
        "src/java/api/JavaContract.java#JavaContract",
        "syntax.jvm.cross-file.explicit-import.direct-implements"
      ],
      [
        "src/java/impl/JavaQualifiedWorker.java#JavaQualifiedWorker",
        "src/java/api/JavaContract.java#JavaContract",
        "syntax.jvm.cross-file.qualified-type.direct-implements"
      ],
      [
        "src/kotlin/impl/KotlinWorker.kt#KotlinWorker",
        "src/kotlin/api/KotlinContract.kt#KotlinContract",
        "syntax.jvm.cross-file.explicit-import.direct-implements"
      ],
      [
        "src/kotlin/impl/KotlinQualifiedWorker.kt#KotlinQualifiedWorker",
        "src/kotlin/api/KotlinContract.kt#KotlinContract",
        "syntax.jvm.cross-file.qualified-type.direct-implements"
      ]
    ] as const) {
      expect(heritageEdge(sourceQualifiedName)).toMatchObject({
        targetId: symbol(targetQualifiedName)?.id,
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId,
          stage: "module"
        }
      });
    }
    for (const [sourceQualifiedName, targetQualifiedName] of [
      [
        "src/java/impl/JavaWorker.java#JavaWorker.run",
        "src/java/api/JavaContract.java#JavaContract.run"
      ],
      [
        "src/kotlin/impl/KotlinWorker.kt#KotlinWorker.run",
        "src/kotlin/api/KotlinContract.kt#KotlinContract.run"
      ],
      [
        "src/java/impl/JavaQualifiedWorker.java#JavaQualifiedWorker.run",
        "src/java/api/JavaContract.java#JavaContract.run"
      ],
      [
        "src/kotlin/impl/KotlinQualifiedWorker.kt#KotlinQualifiedWorker.run",
        "src/kotlin/api/KotlinContract.kt#KotlinContract.run"
      ]
    ] as const) {
      expect(overrideEdge(sourceQualifiedName)).toMatchObject({
        targetId: symbol(targetQualifiedName)?.id,
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId: "syntax.override.explicit-direct-base-method", stage: "syntax" }
      });
    }

    for (const [filePath, sourceQualifiedName, importedTypePath] of [
      [
        "src/java/impl/JavaWorker.java",
        "src/java/impl/JavaWorker.java#JavaWorker",
        "example.java.api.JavaContract"
      ],
      [
        "src/kotlin/impl/KotlinWorker.kt",
        "src/kotlin/impl/KotlinWorker.kt#KotlinWorker",
        "example.kotlin.api.KotlinContract"
      ]
    ] as const) {
      const facts = graphStore.getArtifactFacts(projectPath).find((candidate) => candidate.filePath === filePath);
      expect(facts?.jvmFacts).toMatchObject({
        types: [expect.objectContaining({ symbolId: symbol(sourceQualifiedName)?.id })],
        heritageReferences: [
          expect.objectContaining({
            sourceId: symbol(sourceQualifiedName)?.id,
            referenceName: importedTypePath.split(".").at(-1),
            importedTypePath
          })
        ]
      });
    }

    for (const [filePath, sourceQualifiedName, qualifiedTypePath] of [
      [
        "src/java/impl/JavaQualifiedWorker.java",
        "src/java/impl/JavaQualifiedWorker.java#JavaQualifiedWorker",
        "example.java.api.JavaContract"
      ],
      [
        "src/kotlin/impl/KotlinQualifiedWorker.kt",
        "src/kotlin/impl/KotlinQualifiedWorker.kt#KotlinQualifiedWorker",
        "example.kotlin.api.KotlinContract"
      ]
    ] as const) {
      const facts = graphStore.getArtifactFacts(projectPath).find((candidate) => candidate.filePath === filePath);
      expect(facts?.jvmFacts).toMatchObject({
        types: [expect.objectContaining({ symbolId: symbol(sourceQualifiedName)?.id })],
        heritageReferences: [
          expect.objectContaining({
            sourceId: symbol(sourceQualifiedName)?.id,
            referenceName: qualifiedTypePath.split(".").at(-1),
            qualifiedTypePath
          })
        ]
      });
      expect(facts?.jvmFacts?.heritageReferences[0]).not.toHaveProperty("importedTypePath");
    }
  });

  it("projects exact Java callable signatures and rejects wildcard or unimported guesses", async () => {
    const projectPath = await createInlineProject({
      "src/api/Request.java": "package api; public class Request {}\n",
      "src/api/Result.java": "package api; public interface Result {}\n",
      "src/app/Local.java": "package app; public class Local {}\n",
      "src/app/Service.java": [
        "package app;",
        "import api.Request;",
        "import api.Result;",
        "public class Service {",
        "  public Service(Request request) {}",
        "  public Result execute(Request request) { return null; }",
        "  public api.Result qualified(api.Request request) { return null; }",
        "  public Local local(Local value) { return value; }",
        "}"
      ].join("\n"),
      "src/bad/Wildcard.java": [
        "package bad;",
        "import api.*;",
        "public class Wildcard { public Result run(Request request) { return null; } }"
      ].join("\n"),
      "src/bad/Unimported.java": [
        "package bad;",
        "public class Unimported { public Result run(Request request) { return null; } }"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const signatures = snapshot.edges.filter(
      (edge) => edge.kind === "accepts" || edge.kind === "returns"
    );
    const signature = (sourceQualifiedName: string, kind: "accepts" | "returns", targetQualifiedName: string) =>
      signatures.find(
        (edge) =>
          edge.sourceId === symbol(sourceQualifiedName)?.id &&
          edge.kind === kind &&
          edge.targetId === symbol(targetQualifiedName)?.id
      );

    for (const [sourceQualifiedName, kind, targetQualifiedName, ruleId] of [
      ["src/app/Service.java#Service.Service", "accepts", "src/api/Request.java#Request", "signature.java.explicit-import.accepts"],
      ["src/app/Service.java#Service.execute", "accepts", "src/api/Request.java#Request", "signature.java.explicit-import.accepts"],
      ["src/app/Service.java#Service.execute", "returns", "src/api/Result.java#Result", "signature.java.explicit-import.returns"],
      ["src/app/Service.java#Service.qualified", "accepts", "src/api/Request.java#Request", "signature.java.qualified-type.accepts"],
      ["src/app/Service.java#Service.qualified", "returns", "src/api/Result.java#Result", "signature.java.qualified-type.returns"],
      ["src/app/Service.java#Service.local", "accepts", "src/app/Local.java#Local", "signature.java.same-package.accepts"],
      ["src/app/Service.java#Service.local", "returns", "src/app/Local.java#Local", "signature.java.same-package.returns"]
    ] as const) {
      expect(signature(sourceQualifiedName, kind, targetQualifiedName)).toMatchObject({
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId, stage: "module", candidateSymbolIds: [symbol(targetQualifiedName)?.id] }
      });
    }
    expect(
      signatures.filter((edge) =>
        ["src/bad/Wildcard.java", "src/bad/Unimported.java"].includes(edge.filePath)
      )
    ).toEqual([]);
  });

  it("resolves Java static-factory call chains through exact return types and arity", async () => {
    const projectPath = await createInlineProject({
      "src/api/Executor.java": [
        "package api;",
        "public class Executor { public void execute() {} }"
      ].join("\n"),
      "src/api/Wrapper.java": [
        "package api;",
        "public class Wrapper<T> { public void execute() {} }"
      ].join("\n"),
      "src/factory/Factory.java": [
        "package factory;",
        "import api.Executor;",
        "public class Factory { public static Executor create() { return null; } }"
      ].join("\n"),
      "src/app/Runner.java": [
        "package app;",
        "import factory.Factory;",
        "public class Runner { public void run() { Factory.create().execute(); } }"
      ].join("\n"),
      "src/factory/WrappedFactory.java": [
        "package factory;",
        "import api.Executor;",
        "import api.Wrapper;",
        "public class WrappedFactory {",
        "  public static Wrapper<Executor> create() { return null; }",
        "}"
      ].join("\n"),
      "src/app/WrappedRunner.java": [
        "package app;",
        "import factory.WrappedFactory;",
        "public class WrappedRunner { public void run() { WrappedFactory.create().execute(); } }"
      ].join("\n"),
      "src/app/QualifiedRunner.java": [
        "package app;",
        "public class QualifiedRunner { public void run() { factory.Factory.create().execute(); } }"
      ].join("\n"),
      "src/app/LocalExecutor.java": [
        "package app;",
        "public class LocalExecutor { public void execute() {} }"
      ].join("\n"),
      "src/app/LocalFactory.java": [
        "package app;",
        "public class LocalFactory { public static LocalExecutor create() { return null; } }"
      ].join("\n"),
      "src/app/LocalRunner.java": [
        "package app;",
        "public class LocalRunner { public void run() { LocalFactory.create().execute(); } }"
      ].join("\n"),
      "src/bad/WildcardRunner.java": [
        "package bad;",
        "import factory.*;",
        "public class WildcardRunner { public void run() { Factory.create().execute(); } }"
      ].join("\n"),
      "src/bad/UnimportedRunner.java": [
        "package bad;",
        "public class UnimportedRunner { public void run() { Factory.create().execute(); } }"
      ].join("\n"),
      "src/bad/InstanceFactory.java": [
        "package bad;",
        "import api.Executor;",
        "public class InstanceFactory { public Executor create() { return null; } }"
      ].join("\n"),
      "src/bad/InstanceRunner.java": [
        "package bad;",
        "public class InstanceRunner { public void run() { InstanceFactory.create().execute(); } }"
      ].join("\n"),
      "src/bad/AmbiguousFactory.java": [
        "package bad;",
        "import api.Executor;",
        "public class AmbiguousFactory {",
        "  public static Executor create() { return null; }",
        "  public static Executor create(String value) { return null; }",
        "}"
      ].join("\n"),
      "src/bad/AmbiguousRunner.java": [
        "package bad;",
        "public class AmbiguousRunner { public void run() { AmbiguousFactory.create().execute(); } }"
      ].join("\n"),
      "src/bad/ShadowRunner.java": [
        "package bad;",
        "import factory.Factory;",
        "public class ShadowRunner {",
        "  public void run(Object Factory) { Factory.create().execute(); }",
        "}"
      ].join("\n"),
      "src/bad/OverloadedExecutor.java": [
        "package bad;",
        "public class OverloadedExecutor {",
        "  public void execute() {}",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/bad/OverloadedFactory.java": [
        "package bad;",
        "public class OverloadedFactory { public static OverloadedExecutor create() { return null; } }"
      ].join("\n"),
      "src/bad/OverloadedRunner.java": [
        "package bad;",
        "public class OverloadedRunner { public void run() { OverloadedFactory.create().execute(); } }"
      ].join("\n"),
      "src/app/VarargFactory.java": [
        "package app;",
        "public class VarargFactory {",
        "  public static LocalExecutor create(String first, String... rest) { return null; }",
        "}"
      ].join("\n"),
      "src/app/VarargFactoryRunner.java": [
        "package app;",
        "public class VarargFactoryRunner {",
        "  public void run() { VarargFactory.create(\"first\", \"second\").execute(); }",
        "}"
      ].join("\n"),
      "src/app/VarargExecutor.java": [
        "package app;",
        "public class VarargExecutor { public void execute(String first, String... rest) {} }"
      ].join("\n"),
      "src/app/VarargExecutorFactory.java": [
        "package app;",
        "public class VarargExecutorFactory {",
        "  public static VarargExecutor create() { return null; }",
        "}"
      ].join("\n"),
      "src/app/VarargExecutorRunner.java": [
        "package app;",
        "public class VarargExecutorRunner {",
        "  public void run() { VarargExecutorFactory.create().execute(\"first\", \"second\"); }",
        "}"
      ].join("\n"),
      "src/bad/SameArityFactory.java": [
        "package bad;",
        "import api.Executor;",
        "public class SameArityFactory {",
        "  public static Executor create(String value) { return null; }",
        "  public static Executor create(Integer value) { return null; }",
        "}"
      ].join("\n"),
      "src/bad/SameArityFactoryRunner.java": [
        "package bad;",
        "public class SameArityFactoryRunner {",
        "  public void run() { SameArityFactory.create(\"value\").execute(); }",
        "}"
      ].join("\n"),
      "src/bad/SameArityExecutor.java": [
        "package bad;",
        "public class SameArityExecutor {",
        "  public void execute(String value) {}",
        "  public void execute(Integer value) {}",
        "}"
      ].join("\n"),
      "src/bad/SameArityExecutorFactory.java": [
        "package bad;",
        "public class SameArityExecutorFactory {",
        "  public static SameArityExecutor create() { return null; }",
        "}"
      ].join("\n"),
      "src/bad/SameArityExecutorRunner.java": [
        "package bad;",
        "public class SameArityExecutorRunner {",
        "  public void run() { SameArityExecutorFactory.create().execute(\"value\"); }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const calls = snapshot.edges.filter((edge) => edge.kind === "calls");
    const call = (sourceQualifiedName: string, targetQualifiedName: string) =>
      calls.find(
        (edge) =>
          edge.sourceId === symbol(sourceQualifiedName)?.id &&
          edge.targetId === symbol(targetQualifiedName)?.id
      );

    for (const [sourceQualifiedName, factoryQualifiedName, targetQualifiedName, proof] of [
      [
        "src/app/Runner.java#Runner.run",
        "src/factory/Factory.java#Factory.create",
        "src/api/Executor.java#Executor.execute",
        "explicit-import"
      ],
      [
        "src/app/WrappedRunner.java#WrappedRunner.run",
        "src/factory/WrappedFactory.java#WrappedFactory.create",
        "src/api/Wrapper.java#Wrapper.execute",
        "explicit-import"
      ],
      [
        "src/app/QualifiedRunner.java#QualifiedRunner.run",
        "src/factory/Factory.java#Factory.create",
        "src/api/Executor.java#Executor.execute",
        "qualified-type"
      ],
      [
        "src/app/LocalRunner.java#LocalRunner.run",
        "src/app/LocalFactory.java#LocalFactory.create",
        "src/app/LocalExecutor.java#LocalExecutor.execute",
        "same-package"
      ],
      [
        "src/app/VarargFactoryRunner.java#VarargFactoryRunner.run",
        "src/app/VarargFactory.java#VarargFactory.create",
        "src/app/LocalExecutor.java#LocalExecutor.execute",
        "same-package"
      ],
      [
        "src/app/VarargExecutorRunner.java#VarargExecutorRunner.run",
        "src/app/VarargExecutorFactory.java#VarargExecutorFactory.create",
        "src/app/VarargExecutor.java#VarargExecutor.execute",
        "same-package"
      ]
    ] as const) {
      expect(call(sourceQualifiedName, factoryQualifiedName)).toMatchObject({
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: `call.java.chained-factory.${proof}.arity.factory`,
          stage: "module",
          candidateSymbolIds: [symbol(factoryQualifiedName)?.id],
          callArity: expect.objectContaining({
            actualArgumentCount: sourceQualifiedName.includes("VarargFactoryRunner") ? 2 : 0
          })
        }
      });
      expect(call(sourceQualifiedName, targetQualifiedName)).toMatchObject({
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: `call.java.chained-factory.${proof}.arity.return-dispatch`,
          stage: "module",
          candidateSymbolIds: [symbol(targetQualifiedName)?.id],
          callArity: expect.objectContaining({
            actualArgumentCount: sourceQualifiedName.includes("VarargExecutorRunner") ? 2 : 0
          })
        }
      });
    }

    const factoryOverloadCalls = calls.filter(
      (edge) => edge.filePath === "src/bad/AmbiguousRunner.java"
    );
    expect(factoryOverloadCalls).toHaveLength(2);
    expect(
      factoryOverloadCalls.find((edge) => edge.referenceName === "create")?.evidence
        ?.candidateSymbolIds
    ).toHaveLength(2);
    expect(factoryOverloadCalls.find((edge) => edge.referenceName === "create")?.evidence).toMatchObject({
      ruleId: "call.java.chained-factory.same-package.arity.factory",
      callArity: {
        actualArgumentCount: 0,
        candidates: expect.arrayContaining([
          expect.objectContaining({ minimumArgumentCount: 0, maximumArgumentCount: 0, applicable: true }),
          expect.objectContaining({ minimumArgumentCount: 1, maximumArgumentCount: 1, applicable: false })
        ])
      }
    });

    const outerOverloadCalls = calls.filter(
      (edge) => edge.filePath === "src/bad/OverloadedRunner.java"
    );
    expect(outerOverloadCalls).toHaveLength(2);
    expect(
      outerOverloadCalls.find((edge) => edge.referenceName === "execute")?.evidence
        ?.candidateSymbolIds
    ).toHaveLength(2);
    expect(outerOverloadCalls.find((edge) => edge.referenceName === "execute")?.evidence).toMatchObject({
      ruleId: "call.java.chained-factory.same-package.arity.return-dispatch",
      callArity: {
        actualArgumentCount: 0,
        candidates: expect.arrayContaining([
          expect.objectContaining({ minimumArgumentCount: 0, maximumArgumentCount: 0, applicable: true }),
          expect.objectContaining({ minimumArgumentCount: 1, maximumArgumentCount: 1, applicable: false })
        ])
      }
    });

    expect(
      calls.filter((edge) =>
        [
          "src/bad/WildcardRunner.java",
          "src/bad/UnimportedRunner.java",
          "src/bad/InstanceRunner.java",
          "src/bad/ShadowRunner.java",
          "src/bad/SameArityFactoryRunner.java",
          "src/bad/SameArityExecutorRunner.java"
        ].includes(edge.filePath)
      )
    ).toEqual([]);

    const runnerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/app/Runner.java");
    const wrappedFactoryFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/factory/WrappedFactory.java");
    const shadowFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/bad/ShadowRunner.java");
    expect(runnerFacts?.jvmFacts?.javaChainedCallReferences).toEqual([
      expect.objectContaining({
        receiverTypeName: "Factory",
        factoryMethodName: "create",
        methodName: "execute",
        factoryArgumentCount: 0,
        methodArgumentCount: 0,
        importedTypePath: "factory.Factory",
        factoryRange: expect.any(Object),
        range: expect.any(Object)
      })
    ]);
    expect(wrappedFactoryFacts?.jvmFacts?.callableSignatureReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceName: "Wrapper",
          relationKind: "returns",
          isTopLevelType: true
        }),
        expect.objectContaining({
          referenceName: "Executor",
          relationKind: "returns",
          isTopLevelType: false
        })
      ])
    );
    expect(
      graphStore
        .getArtifactFacts(projectPath)
        .find((facts) => facts.filePath === "src/app/VarargFactory.java")
        ?.jvmFacts?.javaCallableDeclarations
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "create",
          minimumArgumentCount: 1,
          maximumArgumentCount: null
        })
      ])
    );
    expect(shadowFacts?.jvmFacts?.javaChainedCallReferences).toEqual([]);
  });

  it("enforces caller-context access for Java static-factory call chains", async () => {
    const projectPath = await createInlineProject({
      "src/access/Executor.java": [
        "package access;",
        "public class Executor { public void execute() {} }"
      ].join("\n"),
      "src/access/PackageFactory.java": [
        "package access;",
        "public class PackageFactory { static Executor create() { return null; } }"
      ].join("\n"),
      "src/access/ProtectedFactory.java": [
        "package access;",
        "public class ProtectedFactory { protected static Executor create() { return null; } }"
      ].join("\n"),
      "src/access/PrivateFactory.java": [
        "package access;",
        "public class PrivateFactory { private static Executor create() { return null; } }"
      ].join("\n"),
      "src/access/PublicFactory.java": [
        "package access;",
        "public class PublicFactory { public static Executor create() { return null; } }"
      ].join("\n"),
      "src/access/AccessRunner.java": [
        "package access;",
        "public class AccessRunner {",
        "  void run() {",
        "    PackageFactory.create().execute();",
        "    ProtectedFactory.create().execute();",
        "    PrivateFactory.create().execute();",
        "  }",
        "}"
      ].join("\n"),
      "src/outside/OutsideRunner.java": [
        "package outside;",
        "import access.PackageFactory;",
        "import access.ProtectedFactory;",
        "import access.PublicFactory;",
        "public class OutsideRunner {",
        "  void run() {",
        "    PackageFactory.create().execute();",
        "    ProtectedFactory.create().execute();",
        "    PublicFactory.create().execute();",
        "  }",
        "}"
      ].join("\n"),
      "src/outside/ProtectedFactoryChild.java": [
        "package outside;",
        "import access.ProtectedFactory;",
        "public class ProtectedFactoryChild extends ProtectedFactory {",
        "  void run() {",
        "    ProtectedFactory.create().execute();",
        "    ProtectedFactoryChild.create().execute();",
        "  }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const factoryCalls = snapshot.edges.filter(
      (edge) => edge.kind === "calls" && edge.referenceName === "create"
    );
    const factoryCallAt = (filePath: string, line: number) =>
      factoryCalls.find(
        (edge) => edge.filePath === filePath && edge.range?.start.line === line
      );

    expect(factoryCallAt("src/access/AccessRunner.java", 4)).toEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          callAccess: expect.objectContaining({
            policy: "java-source-access-v1",
            visibility: "package",
            decision: "same-package"
          })
        })
      })
    );
    expect(factoryCallAt("src/access/AccessRunner.java", 5)).toEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          callAccess: expect.objectContaining({
            policy: "java-source-access-v1",
            visibility: "protected",
            decision: "same-package"
          })
        })
      })
    );
    expect(factoryCallAt("src/access/AccessRunner.java", 6)).toBeUndefined();
    expect(factoryCallAt("src/outside/OutsideRunner.java", 7)).toBeUndefined();
    expect(factoryCallAt("src/outside/OutsideRunner.java", 8)).toBeUndefined();
    expect(factoryCallAt("src/outside/OutsideRunner.java", 9)?.evidence?.callAccess).toEqual(
      expect.objectContaining({ visibility: "public", decision: "public" })
    );
    const protectedFactoryId = symbol(
      "src/access/ProtectedFactory.java#ProtectedFactory"
    )?.id;
    const protectedFactoryChildId = symbol(
      "src/outside/ProtectedFactoryChild.java#ProtectedFactoryChild"
    )?.id;
    expect(factoryCallAt("src/outside/ProtectedFactoryChild.java", 5)?.evidence).toEqual(
      expect.objectContaining({
        callAccess: expect.objectContaining({
          visibility: "protected",
          decision: "protected-subclass-static",
          callerTypeSymbolId: protectedFactoryChildId,
          receiverTypeSymbolId: protectedFactoryId,
          ownerTypeSymbolId: protectedFactoryId,
          callerToOwnerPath: [
            expect.objectContaining({
              sourceSymbolId: protectedFactoryChildId,
              targetSymbolId: protectedFactoryId,
              relationKind: "extends"
            })
          ],
          receiverToCallerPath: []
        }),
        callDispatch: expect.objectContaining({
          invocationKind: "type-name-static",
          selectionReason: "declared-owner",
          receiverTypeSymbolId: protectedFactoryId,
          selectedOwnerTypeSymbolId: protectedFactoryId
        })
      })
    );
    expect(factoryCallAt("src/outside/ProtectedFactoryChild.java", 6)?.evidence).toEqual(
      expect.objectContaining({
        callAccess: expect.objectContaining({
          visibility: "protected",
          decision: "protected-subclass-static",
          callerTypeSymbolId: protectedFactoryChildId,
          receiverTypeSymbolId: protectedFactoryChildId,
          ownerTypeSymbolId: protectedFactoryId,
          callerToOwnerPath: [expect.objectContaining({ relationKind: "extends" })],
          receiverToCallerPath: []
        }),
        callDispatch: expect.objectContaining({
          invocationKind: "type-name-static",
          selectionReason: "unique-inherited-owner",
          receiverTypeSymbolId: protectedFactoryChildId,
          selectedOwnerTypeSymbolId: protectedFactoryId,
          candidates: [
            expect.objectContaining({
              ownerTypeSymbolId: protectedFactoryId,
              distance: 1,
              hierarchyPath: [expect.objectContaining({ relationKind: "extends" })]
            })
          ]
        })
      })
    );
  });

  it("resolves explicit this and super Java member calls with method-set evidence", async () => {
    const projectPath = await createInlineProject({
      "src/api/Base.java": [
        "package api;",
        "public class Base {",
        "  protected void inherited(int value) {}",
        "  public void hiddenByChild(String value) {}",
        "  private void privateBase() {}",
        "}"
      ].join("\n"),
      "src/app/Child.java": [
        "package app;",
        "import api.Base;",
        "public class Child extends Base {",
        "  public void local(String value) {}",
        "  public void hiddenByChild(String value) {}",
        "  public void run() {",
        "    this.local(\"x\");",
        "    this.inherited(1);",
        "    super.inherited(2);",
        "    super.hiddenByChild(\"base\");",
        "    this.privateBase();",
        "  }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const memberCallAt = (line: number) =>
      snapshot.edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.filePath === "src/app/Child.java" &&
          edge.range.start.line === line
      );
    const childId = symbol("src/app/Child.java#Child")?.id;
    const baseId = symbol("src/api/Base.java#Base")?.id;

    expect(memberCallAt(7)).toEqual(
      expect.objectContaining({
        targetId: symbol("src/app/Child.java#Child.local")?.id,
        evidence: expect.objectContaining({
          callDispatch: expect.objectContaining({
            invocationKind: "this",
            selectionReason: "declared-owner",
            receiverTypeSymbolId: childId,
            selectedOwnerTypeSymbolId: childId
          })
        })
      })
    );
    expect(memberCallAt(8)?.evidence).toEqual(
      expect.objectContaining({
        callAccess: expect.objectContaining({
          decision: "protected-subclass-receiver",
          callerTypeSymbolId: childId,
          receiverTypeSymbolId: childId,
          ownerTypeSymbolId: baseId,
          callerToOwnerPath: [expect.objectContaining({ relationKind: "extends" })],
          receiverToCallerPath: []
        }),
        callDispatch: expect.objectContaining({
          invocationKind: "this",
          selectionReason: "unique-inherited-owner",
          receiverTypeSymbolId: childId,
          selectedOwnerTypeSymbolId: baseId
        })
      })
    );
    expect(memberCallAt(9)?.evidence).toEqual(
      expect.objectContaining({
        callAccess: expect.objectContaining({
          decision: "protected-subclass-receiver",
          receiverTypeSymbolId: childId,
          ownerTypeSymbolId: baseId
        }),
        callDispatch: expect.objectContaining({
          invocationKind: "super",
          selectionReason: "declared-owner",
          receiverTypeSymbolId: baseId,
          selectedOwnerTypeSymbolId: baseId,
          receiverSelectionPath: [
            expect.objectContaining({
              sourceSymbolId: childId,
              targetSymbolId: baseId,
              relationKind: "extends"
            })
          ]
        })
      })
    );
    expect(memberCallAt(10)).toEqual(
      expect.objectContaining({
        targetId: symbol("src/api/Base.java#Base.hiddenByChild")?.id,
        evidence: expect.objectContaining({
          callDispatch: expect.objectContaining({
            invocationKind: "super",
            selectionReason: "declared-owner",
            receiverTypeSymbolId: baseId,
            selectedOwnerTypeSymbolId: baseId
          })
        })
      })
    );
    expect(memberCallAt(11)).toBeUndefined();

    const childFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/app/Child.java");
    expect(childFacts?.jvmFacts).toEqual(
      expect.objectContaining({
        javaMemberCallReferences: expect.arrayContaining([
          expect.objectContaining({ receiverKind: "this", methodName: "local" }),
          expect.objectContaining({ receiverKind: "this", methodName: "inherited" }),
          expect.objectContaining({ receiverKind: "super", methodName: "inherited" }),
          expect.objectContaining({ receiverKind: "super", methodName: "hiddenByChild" }),
          expect.objectContaining({ receiverKind: "this", methodName: "privateBase" })
        ])
      })
    );
  });

  it("resolves lexically bound Java parameter and local receiver calls", async () => {
    const projectPath = await createInlineProject({
      "src/api/Base.java": [
        "package api;",
        "public class Base {",
        "  public void inherited(int value) {}",
        "}"
      ].join("\n"),
      "src/api/Service.java": [
        "package api;",
        "public class Service extends Base {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/app/Runner.java": [
        "package app;",
        "import api.Service;",
        "public class Runner {",
        "  public void run(Service service) {",
        "    service.execute(\"parameter\");",
        "    service.inherited(1);",
        "    Service local = new Service();",
        "    local.execute(\"local\");",
        "    missing.execute(\"missing\");",
        "    before.execute(\"before\");",
        "    Service before = new Service();",
        "    {",
        "      Service scoped = new Service();",
        "      scoped.execute(\"scoped\");",
        "    }",
        "    scoped.execute(\"outside\");",
        "  }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const memberCallAt = (line: number) =>
      snapshot.edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.filePath === "src/app/Runner.java" &&
          edge.range.start.line === line
      );
    const serviceId = symbol("src/api/Service.java#Service")?.id;
    const baseId = symbol("src/api/Base.java#Base")?.id;

    expect(memberCallAt(5)).toEqual(
      expect.objectContaining({
        targetId: symbol("src/api/Service.java#Service.execute")?.id,
        evidence: expect.objectContaining({
          callDispatch: expect.objectContaining({
            invocationKind: "parameter",
            selectionReason: "declared-owner",
            receiverTypeSymbolId: serviceId,
            selectedOwnerTypeSymbolId: serviceId,
            receiverBinding: expect.objectContaining({
              policy: "java-source-lexical-binding-v1",
              kind: "parameter",
              name: "service",
              declarationRange: expect.objectContaining({
                start: expect.objectContaining({ line: 4 })
              }),
              scopeRange: expect.objectContaining({
                start: expect.objectContaining({ line: 4 })
              }),
              type: expect.objectContaining({
                canonicalType: "reference:api.Service",
                proof: "explicit-import",
                targetSymbolId: serviceId
              })
            })
          })
        })
      })
    );
    expect(memberCallAt(6)?.evidence?.callDispatch).toEqual(
      expect.objectContaining({
        invocationKind: "parameter",
        selectionReason: "unique-inherited-owner",
        receiverTypeSymbolId: serviceId,
        selectedOwnerTypeSymbolId: baseId
      })
    );
    expect(memberCallAt(8)?.evidence?.callDispatch).toEqual(
      expect.objectContaining({
        invocationKind: "local",
        receiverTypeSymbolId: serviceId,
        receiverBinding: expect.objectContaining({
          policy: "java-source-lexical-binding-v1",
          kind: "local",
          name: "local",
          declarationRange: expect.objectContaining({
            start: expect.objectContaining({ line: 7 })
          }),
          scopeRange: expect.objectContaining({
            start: expect.objectContaining({ line: 4 })
          })
        })
      })
    );
    expect(memberCallAt(14)?.evidence?.callDispatch).toEqual(
      expect.objectContaining({
        invocationKind: "local",
        receiverBinding: expect.objectContaining({
          name: "scoped",
          declarationRange: expect.objectContaining({
            start: expect.objectContaining({ line: 13 })
          }),
          scopeRange: expect.objectContaining({
            start: expect.objectContaining({ line: 12 })
          })
        })
      })
    );
    expect(memberCallAt(9)).toBeUndefined();
    expect(memberCallAt(10)).toBeUndefined();
    expect(memberCallAt(16)).toBeUndefined();

    const runnerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/app/Runner.java");
    expect(runnerFacts?.jvmFacts?.javaMemberCallReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ receiverKind: "parameter", receiverName: "service" }),
        expect.objectContaining({ receiverKind: "local", receiverName: "local" }),
        expect.objectContaining({ receiverKind: "local", receiverName: "scoped" })
      ])
    );
    expect(
      runnerFacts?.jvmFacts?.javaMemberCallReferences.filter(
        (reference) => reference.receiverKind === "parameter" || reference.receiverKind === "local"
      )
    ).toHaveLength(4);
  });

  it("infers Java var receivers only from direct object-creation initializers", async () => {
    const projectPath = await createInlineProject({
      "src/api/Service.java": [
        "package api;",
        "public class Service {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/api/Holder.java": [
        "package api;",
        "public class Holder<T> {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/app/LocalService.java": [
        "package app;",
        "public class LocalService {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/app/Runner.java": [
        "package app;",
        "import api.Service;",
        "import api.Holder;",
        "public class Runner {",
        "  public void run() {",
        "    var imported = new Service();",
        "    imported.execute(\"imported\");",
        "    var qualified = new api.Service();",
        "    qualified.execute(\"qualified\");",
        "    var samePackage = new LocalService();",
        "    samePackage.execute(\"same-package\");",
        "    var unknown = factory();",
        "    unknown.execute(\"factory\");",
        "    before.execute(\"before\");",
        "    var before = new Service();",
        "    {",
        "      var scoped = new Service();",
        "      scoped.execute(\"scoped\");",
        "    }",
        "    scoped.execute(\"outside\");",
        "    var generic = new Holder<Service>();",
        "    generic.execute(\"generic\");",
        "  }",
        "  private Service factory() { return new Service(); }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const memberCallAt = (line: number) =>
      snapshot.edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.filePath === "src/app/Runner.java" &&
          edge.range.start.line === line
      );
    const serviceId = symbol("src/api/Service.java#Service")?.id;
    const localServiceId = symbol("src/app/LocalService.java#LocalService")?.id;

    expect(memberCallAt(7)).toEqual(
      expect.objectContaining({
        targetId: symbol("src/api/Service.java#Service.execute")?.id,
        evidence: expect.objectContaining({
          callDispatch: expect.objectContaining({
            invocationKind: "local",
            receiverTypeSymbolId: serviceId,
            receiverBinding: expect.objectContaining({
              policy: "java-source-lexical-binding-v2",
              kind: "local",
              name: "imported",
              typeSource: "object-creation-initializer",
              declarationRange: expect.objectContaining({
                start: expect.objectContaining({ line: 6 })
              }),
              initializerRange: expect.objectContaining({
                start: expect.objectContaining({ line: 6 }),
                end: expect.objectContaining({ line: 6 })
              }),
              scopeRange: expect.objectContaining({
                start: expect.objectContaining({ line: 5 })
              }),
              type: expect.objectContaining({
                canonicalType: "reference:api.Service",
                proof: "explicit-import",
                targetSymbolId: serviceId
              })
            })
          })
        })
      })
    );
    expect(memberCallAt(9)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        policy: "java-source-lexical-binding-v2",
        name: "qualified",
        typeSource: "object-creation-initializer",
        type: expect.objectContaining({ proof: "qualified-type", targetSymbolId: serviceId })
      })
    );
    expect(memberCallAt(11)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        policy: "java-source-lexical-binding-v2",
        name: "samePackage",
        typeSource: "object-creation-initializer",
        type: expect.objectContaining({ proof: "same-package", targetSymbolId: localServiceId })
      })
    );
    expect(memberCallAt(18)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        policy: "java-source-lexical-binding-v2",
        name: "scoped",
        typeSource: "object-creation-initializer",
        scopeRange: expect.objectContaining({
          start: expect.objectContaining({ line: 16 })
        })
      })
    );
    expect(memberCallAt(13)).toBeUndefined();
    expect(memberCallAt(14)).toBeUndefined();
    expect(memberCallAt(20)).toBeUndefined();
    expect(memberCallAt(22)).toBeUndefined();

    const runnerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/app/Runner.java");
    expect(runnerFacts?.jvmFacts?.javaMemberCallReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          receiverKind: "local",
          receiverName: "imported",
          receiverType: expect.objectContaining({ syntax: "object-creation" }),
          receiverInitializerRange: expect.objectContaining({
            start: expect.objectContaining({ line: 6 })
          })
        }),
        expect.objectContaining({ receiverKind: "local", receiverName: "qualified" }),
        expect.objectContaining({ receiverKind: "local", receiverName: "samePackage" }),
        expect.objectContaining({ receiverKind: "local", receiverName: "scoped" })
      ])
    );
    expect(
      runnerFacts?.jvmFacts?.javaMemberCallReferences.filter(
        (reference) => reference.receiverKind === "parameter" || reference.receiverKind === "local"
      )
    ).toHaveLength(4);
  });

  it("resolves direct Java field receivers without crossing lexical or static boundaries", async () => {
    const projectPath = await createInlineProject({
      "src/api/Service.java": [
        "package api;",
        "public class Service {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/app/Other.java": [
        "package app;",
        "public class Other {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/app/Holder.java": [
        "package app;",
        "public class Holder<T> {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/app/Runner.java": [
        "package app;",
        "import api.Service;",
        "public class Runner {",
        "  private Service service;",
        "  private static Service shared;",
        "  private Holder<Service> generic;",
        "  public void bare() {",
        "    service.execute(\"bare\");",
        "  }",
        "  public void shadow(Other service) {",
        "    service.execute(\"parameter\");",
        "    this.service.execute(\"explicit-field\");",
        "    later.execute(\"declared-later\");",
        "    var later = factory();",
        "    later.execute(\"unsupported-local\");",
        "    this.later.execute(\"explicit-later\");",
        "  }",
        "  public static void staticRun() {",
        "    shared.execute(\"static-field\");",
        "    service.execute(\"instance-from-static\");",
        "    this.service.execute(\"this-from-static\");",
        "    int shared = 0;",
        "    shared.execute(\"shadowed-static\");",
        "  }",
        "  public void unsupported() {",
        "    generic.execute(\"generic\");",
        "  }",
        "  private Service factory() { return new Service(); }",
        "  private Service later;",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const memberCallAt = (line: number) =>
      snapshot.edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.filePath === "src/app/Runner.java" &&
          edge.range.start.line === line
      );
    const serviceId = symbol("src/api/Service.java#Service")?.id;
    const otherId = symbol("src/app/Other.java#Other")?.id;

    expect(memberCallAt(8)).toEqual(
      expect.objectContaining({
        targetId: symbol("src/api/Service.java#Service.execute")?.id,
        evidence: expect.objectContaining({
          callDispatch: expect.objectContaining({
            invocationKind: "field",
            receiverTypeSymbolId: serviceId,
            receiverBinding: expect.objectContaining({
              policy: "java-source-field-binding-v3",
              kind: "field",
              name: "service",
              isStatic: false,
              visibility: "private",
              declaringTypeSymbolId: symbol("src/app/Runner.java#Runner")?.id,
              selectionReason: "declared-owner",
              ownerSelectionPath: [],
              access: expect.objectContaining({
                policy: "java-source-field-access-v1",
                decision: "declaring-class"
              }),
              declarationRange: expect.objectContaining({
                start: expect.objectContaining({ line: 4 })
              }),
              scopeRange: expect.objectContaining({
                start: expect.objectContaining({ line: 3 })
              }),
              type: expect.objectContaining({
                canonicalType: "reference:api.Service",
                proof: "explicit-import",
                targetSymbolId: serviceId
              })
            })
          })
        })
      })
    );
    expect(memberCallAt(11)?.evidence?.callDispatch).toEqual(
      expect.objectContaining({ invocationKind: "parameter", receiverTypeSymbolId: otherId })
    );
    expect(memberCallAt(12)?.evidence?.callDispatch).toEqual(
      expect.objectContaining({
        invocationKind: "this-field",
        receiverTypeSymbolId: serviceId,
        receiverBinding: expect.objectContaining({
          policy: "java-source-field-binding-v3",
          kind: "this-field",
          name: "service"
        })
      })
    );
    expect(memberCallAt(13)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ kind: "field", name: "later" })
    );
    expect(memberCallAt(16)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ kind: "this-field", name: "later" })
    );
    expect(memberCallAt(19)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ kind: "field", name: "shared", isStatic: true })
    );
    expect(memberCallAt(15)).toBeUndefined();
    expect(memberCallAt(20)).toBeUndefined();
    expect(memberCallAt(21)).toBeUndefined();
    expect(memberCallAt(23)).toBeUndefined();
    expect(memberCallAt(26)).toBeUndefined();

    const runnerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/app/Runner.java");
    expect(runnerFacts?.jvmFacts?.javaFieldDeclarations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "service",
          isStatic: false,
          visibility: "private",
          type: expect.objectContaining({ referenceName: "Service", syntax: "declaration" })
        }),
        expect.objectContaining({ name: "shared", isStatic: true }),
        expect.objectContaining({ name: "generic", type: null }),
        expect.objectContaining({ name: "later", isStatic: false })
      ])
    );
    expect(runnerFacts?.jvmFacts?.javaMemberCallReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ receiverKind: "field", receiverName: "service" }),
        expect.objectContaining({ receiverKind: "this-field", receiverName: "service" }),
        expect.objectContaining({ receiverKind: "field", receiverName: "later" }),
        expect.objectContaining({ receiverKind: "this-field", receiverName: "later" }),
        expect.objectContaining({ receiverKind: "field", receiverName: "shared" })
      ])
    );
  });

  it("resolves inherited Java fields only through a unique visible class-owner path", async () => {
    const projectPath = await createInlineProject({
      "src/api/Service.java": [
        "package api;",
        "public class Service {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/base/Holder.java": [
        "package base;",
        "public class Holder<T> {}"
      ].join("\n"),
      "src/base/Base.java": [
        "package base;",
        "import api.Service;",
        "public class Base {",
        "  protected Service inherited;",
        "  public static Service shared;",
        "  private Service privateOnly;",
        "  Service packageOnly;",
        "  public Service hidden;",
        "  public Service genericBarrier;",
        "}"
      ].join("\n"),
      "src/base/Middle.java": [
        "package base;",
        "import api.Service;",
        "public class Middle extends Base {",
        "  private Service hidden;",
        "  public Holder<Service> genericBarrier;",
        "}"
      ].join("\n"),
      "src/base/SamePackageChild.java": [
        "package base;",
        "public class SamePackageChild extends Base {",
        "  public void run() {",
        "    packageOnly.execute(\"same-package\");",
        "  }",
        "}"
      ].join("\n"),
      "src/app/Child.java": [
        "package app;",
        "import base.Middle;",
        "import api.Service;",
        "public class Child extends Middle {",
        "  public void run() {",
        "    inherited.execute(\"inherited\");",
        "    this.inherited.execute(\"explicit-inherited\");",
        "    shared.execute(\"shared\");",
        "    this.shared.execute(\"explicit-shared\");",
        "    hidden.execute(\"private-hiding\");",
        "    privateOnly.execute(\"private\");",
        "    packageOnly.execute(\"package\");",
        "    genericBarrier.execute(\"generic-hiding\");",
        "    var inherited = factory();",
        "    inherited.execute(\"unsupported-local\");",
        "    this.inherited.execute(\"explicit-bypasses-local\");",
        "  }",
        "  public static void staticRun() {",
        "    shared.execute(\"static-shared\");",
        "    inherited.execute(\"instance-from-static\");",
        "    this.shared.execute(\"this-from-static\");",
        "  }",
        "  private Service factory() { return new Service(); }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const callAt = (filePath: string, line: number) =>
      snapshot.edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.filePath === filePath &&
          edge.range.start.line === line
      );
    const serviceId = symbol("src/api/Service.java#Service")?.id;
    const baseId = symbol("src/base/Base.java#Base")?.id;
    const middleId = symbol("src/base/Middle.java#Middle")?.id;
    const childId = symbol("src/app/Child.java#Child")?.id;
    const serviceExecuteId = symbol("src/api/Service.java#Service.execute")?.id;

    expect(callAt("src/app/Child.java", 6)).toEqual(
      expect.objectContaining({
        targetId: serviceExecuteId,
        evidence: expect.objectContaining({
          callDispatch: expect.objectContaining({
            invocationKind: "field",
            receiverTypeSymbolId: serviceId,
            receiverBinding: expect.objectContaining({
              policy: "java-source-field-binding-v3",
              kind: "field",
              name: "inherited",
              declaringTypeSymbolId: baseId,
              selectionReason: "nearest-inherited-owner",
              isStatic: false,
              visibility: "protected",
              ownerSelectionPath: [
                expect.objectContaining({ sourceSymbolId: childId, targetSymbolId: middleId }),
                expect.objectContaining({ sourceSymbolId: middleId, targetSymbolId: baseId })
              ],
              access: expect.objectContaining({
                policy: "java-source-field-access-v1",
                decision: "protected-subclass",
                callerTypeSymbolId: childId,
                ownerTypeSymbolId: baseId
              }),
              type: expect.objectContaining({
                canonicalType: "reference:api.Service",
                proof: "explicit-import",
                targetSymbolId: serviceId
              })
            })
          })
        })
      })
    );
    expect(callAt("src/app/Child.java", 7)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ kind: "this-field", declaringTypeSymbolId: baseId })
    );
    expect(callAt("src/app/Child.java", 8)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ name: "shared", isStatic: true, declaringTypeSymbolId: baseId })
    );
    expect(callAt("src/app/Child.java", 9)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ kind: "this-field", name: "shared" })
    );
    expect(callAt("src/app/Child.java", 16)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ kind: "this-field", name: "inherited" })
    );
    expect(callAt("src/app/Child.java", 19)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ kind: "field", name: "shared", isStatic: true })
    );
    expect(callAt("src/base/SamePackageChild.java", 4)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        name: "packageOnly",
        declaringTypeSymbolId: baseId,
        access: expect.objectContaining({ decision: "same-package" })
      })
    );

    expect(callAt("src/app/Child.java", 10)).toBeUndefined();
    expect(callAt("src/app/Child.java", 11)).toBeUndefined();
    expect(callAt("src/app/Child.java", 12)).toBeUndefined();
    expect(callAt("src/app/Child.java", 13)).toBeUndefined();
    expect(callAt("src/app/Child.java", 15)).toBeUndefined();
    expect(callAt("src/app/Child.java", 20)).toBeUndefined();
    expect(callAt("src/app/Child.java", 21)).toBeUndefined();

    const childFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/app/Child.java");
    expect(childFacts?.jvmFacts?.javaMemberCallReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ receiverKind: "field", receiverName: "inherited" }),
        expect.objectContaining({ receiverKind: "this-field", receiverName: "inherited" }),
        expect.objectContaining({ receiverKind: "field", receiverName: "shared" })
      ])
    );
  });

  it("resolves Java super field receivers from the direct superclass lookup boundary", async () => {
    const projectPath = await createInlineProject({
      "src/api/Service.java": [
        "package api;",
        "public class Service {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/base/Holder.java": [
        "package base;",
        "public class Holder<T> {}"
      ].join("\n"),
      "src/base/GrandBase.java": [
        "package base;",
        "import api.Service;",
        "public class GrandBase {",
        "  protected Service inherited;",
        "  public Service shadowed;",
        "  private Service privateOnly;",
        "  Service packageOnly;",
        "  protected static Service shared;",
        "  public Service genericBarrier;",
        "}"
      ].join("\n"),
      "src/base/Base.java": [
        "package base;",
        "import api.Service;",
        "public class Base extends GrandBase {",
        "  public Service shadowed;",
        "  public Holder<Service> genericBarrier;",
        "}"
      ].join("\n"),
      "src/base/SamePackageChild.java": [
        "package base;",
        "public class SamePackageChild extends Base {",
        "  public void run() {",
        "    super.packageOnly.execute(\"same-package\");",
        "  }",
        "}"
      ].join("\n"),
      "src/app/Child.java": [
        "package app;",
        "import base.Base;",
        "import api.Service;",
        "public class Child extends Base {",
        "  private Service inherited;",
        "  public void run() {",
        "    super.inherited.execute(\"inherited\");",
        "    super.shadowed.execute(\"nearest\");",
        "    super.shared.execute(\"static\");",
        "    super.privateOnly.execute(\"private\");",
        "    super.packageOnly.execute(\"package\");",
        "    super.genericBarrier.execute(\"generic-hiding\");",
        "  }",
        "  public static void staticRun() {",
        "    super.shadowed.execute(\"static-super\");",
        "  }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const callAt = (filePath: string, line: number) =>
      snapshot.edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.filePath === filePath &&
          edge.range.start.line === line
      );
    const serviceId = symbol("src/api/Service.java#Service")?.id;
    const grandBaseId = symbol("src/base/GrandBase.java#GrandBase")?.id;
    const baseId = symbol("src/base/Base.java#Base")?.id;
    const childId = symbol("src/app/Child.java#Child")?.id;
    const serviceExecuteId = symbol("src/api/Service.java#Service.execute")?.id;

    expect(callAt("src/app/Child.java", 7)).toEqual(
      expect.objectContaining({
        targetId: serviceExecuteId,
        evidence: expect.objectContaining({
          callDispatch: expect.objectContaining({
            invocationKind: "super-field",
            receiverTypeSymbolId: serviceId,
            receiverBinding: expect.objectContaining({
              policy: "java-source-field-binding-v3",
              kind: "super-field",
              name: "inherited",
              declaringTypeSymbolId: grandBaseId,
              selectionReason: "nearest-inherited-owner",
              ownerSelectionPath: [
                expect.objectContaining({ sourceSymbolId: childId, targetSymbolId: baseId }),
                expect.objectContaining({ sourceSymbolId: baseId, targetSymbolId: grandBaseId })
              ],
              access: expect.objectContaining({
                policy: "java-source-field-access-v1",
                decision: "protected-subclass",
                callerTypeSymbolId: childId,
                ownerTypeSymbolId: grandBaseId
              }),
              type: expect.objectContaining({
                canonicalType: "reference:api.Service",
                proof: "explicit-import",
                targetSymbolId: serviceId
              })
            })
          })
        })
      })
    );
    expect(callAt("src/app/Child.java", 8)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        kind: "super-field",
        name: "shadowed",
        declaringTypeSymbolId: baseId,
        ownerSelectionPath: [
          expect.objectContaining({ sourceSymbolId: childId, targetSymbolId: baseId })
        ]
      })
    );
    expect(callAt("src/app/Child.java", 9)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ kind: "super-field", name: "shared", isStatic: true })
    );
    expect(callAt("src/base/SamePackageChild.java", 4)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        kind: "super-field",
        name: "packageOnly",
        declaringTypeSymbolId: grandBaseId,
        access: expect.objectContaining({ decision: "same-package" })
      })
    );

    expect(callAt("src/app/Child.java", 10)).toBeUndefined();
    expect(callAt("src/app/Child.java", 11)).toBeUndefined();
    expect(callAt("src/app/Child.java", 12)).toBeUndefined();
    expect(callAt("src/app/Child.java", 15)).toBeUndefined();

    const childFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/app/Child.java");
    expect(childFacts?.jvmFacts?.javaMemberCallReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ receiverKind: "super-field", receiverName: "inherited" }),
        expect.objectContaining({ receiverKind: "super-field", receiverName: "shadowed" }),
        expect.objectContaining({ receiverKind: "super-field", receiverName: "shared" })
      ])
    );
  });

  it("resolves Java interface field receivers with class precedence and interface hiding", async () => {
    const projectPath = await createInlineProject({
      "src/api/Service.java": [
        "package api;",
        "public class Service {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/api/Holder.java": [
        "package api;",
        "public class Holder<T> {}"
      ].join("\n"),
      "src/contracts/RootContract.java": [
        "package contracts;",
        "import api.Service;",
        "public interface RootContract {",
        "  Service inherited = null;",
        "  Service shadowed = null;",
        "  Service ambiguous = null;",
        "  Service genericBarrier = null;",
        "}"
      ].join("\n"),
      "src/contracts/NearContract.java": [
        "package contracts;",
        "import api.Service;",
        "import api.Holder;",
        "public interface NearContract extends RootContract {",
        "  Service shadowed = null;",
        "  Holder<Service> genericBarrier = null;",
        "  default void interfaceRun() {",
        "    inherited.execute(\"interface-inherited\");",
        "    this.shadowed.execute(\"interface-declared\");",
        "  }",
        "  static void staticRun() {",
        "    inherited.execute(\"interface-static\");",
        "  }",
        "}"
      ].join("\n"),
      "src/contracts/OtherContract.java": [
        "package contracts;",
        "import api.Service;",
        "public interface OtherContract {",
        "  Service ambiguous = null;",
        "}"
      ].join("\n"),
      "src/base/Base.java": [
        "package base;",
        "import contracts.NearContract;",
        "public class Base implements NearContract {}"
      ].join("\n"),
      "src/app/Child.java": [
        "package app;",
        "import base.Base;",
        "public class Child extends Base {",
        "  public void run() {",
        "    inherited.execute(\"class-inherited\");",
        "    this.inherited.execute(\"class-this\");",
        "    shadowed.execute(\"nearest-interface\");",
        "    genericBarrier.execute(\"generic-hiding\");",
        "    super.inherited.execute(\"super-does-not-search-interfaces\");",
        "  }",
        "  public static void staticRun() {",
        "    inherited.execute(\"class-static\");",
        "  }",
        "}"
      ].join("\n"),
      "src/app/ClassShadow.java": [
        "package app;",
        "import api.Service;",
        "import base.Base;",
        "public class ClassShadow extends Base {",
        "  public Service shadowed;",
        "  public void run() { shadowed.execute(\"class-wins\"); }",
        "}"
      ].join("\n"),
      "src/app/Ambiguous.java": [
        "package app;",
        "import contracts.NearContract;",
        "import contracts.OtherContract;",
        "public class Ambiguous implements NearContract, OtherContract {",
        "  public void run() { ambiguous.execute(\"ambiguous\"); }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const callAt = (filePath: string, line: number) =>
      snapshot.edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.filePath === filePath &&
          edge.range.start.line === line
      );
    const serviceId = symbol("src/api/Service.java#Service")?.id;
    const executeId = symbol("src/api/Service.java#Service.execute")?.id;
    const rootId = symbol("src/contracts/RootContract.java#RootContract")?.id;
    const nearId = symbol("src/contracts/NearContract.java#NearContract")?.id;
    const baseId = symbol("src/base/Base.java#Base")?.id;
    const childId = symbol("src/app/Child.java#Child")?.id;
    const classShadowId = symbol("src/app/ClassShadow.java#ClassShadow")?.id;

    expect(callAt("src/app/Child.java", 5)).toEqual(
      expect.objectContaining({
        targetId: executeId,
        evidence: expect.objectContaining({
          callDispatch: expect.objectContaining({
            invocationKind: "field",
            receiverTypeSymbolId: serviceId,
            receiverBinding: expect.objectContaining({
              policy: "java-source-field-binding-v3",
              kind: "field",
              name: "inherited",
              declaringTypeSymbolId: rootId,
              declaringTypeKind: "interface",
              isStatic: true,
              isFinal: true,
              visibility: "public",
              modifierProof: "interface-implicit",
              selectionReason: "unique-interface-owner",
              ownerSelectionPath: [
                expect.objectContaining({ sourceSymbolId: childId, targetSymbolId: baseId }),
                expect.objectContaining({ sourceSymbolId: baseId, targetSymbolId: nearId }),
                expect.objectContaining({ sourceSymbolId: nearId, targetSymbolId: rootId })
              ],
              access: expect.objectContaining({
                policy: "java-source-field-access-v1",
                decision: "public",
                callerTypeSymbolId: childId,
                ownerTypeSymbolId: rootId
              }),
              type: expect.objectContaining({
                canonicalType: "reference:api.Service",
                proof: "explicit-import",
                targetSymbolId: serviceId
              })
            })
          })
        })
      })
    );
    expect(callAt("src/app/Child.java", 6)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ kind: "this-field", declaringTypeSymbolId: rootId })
    );
    expect(callAt("src/app/Child.java", 7)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        name: "shadowed",
        declaringTypeSymbolId: nearId,
        selectionReason: "unique-interface-owner"
      })
    );
    expect(callAt("src/app/Child.java", 12)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ name: "inherited", declaringTypeSymbolId: rootId, isStatic: true })
    );
    expect(callAt("src/contracts/NearContract.java", 8)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        name: "inherited",
        declaringTypeSymbolId: rootId,
        selectionReason: "unique-interface-owner",
        ownerSelectionPath: [
          expect.objectContaining({ sourceSymbolId: nearId, targetSymbolId: rootId })
        ]
      })
    );
    expect(callAt("src/contracts/NearContract.java", 9)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        kind: "this-field",
        name: "shadowed",
        declaringTypeSymbolId: nearId,
        selectionReason: "declared-owner"
      })
    );
    expect(callAt("src/contracts/NearContract.java", 12)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ name: "inherited", declaringTypeSymbolId: rootId, isStatic: true })
    );
    expect(callAt("src/app/ClassShadow.java", 6)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        name: "shadowed",
        declaringTypeSymbolId: classShadowId,
        declaringTypeKind: "class",
        modifierProof: "declared",
        selectionReason: "declared-owner"
      })
    );

    expect(callAt("src/app/Child.java", 8)).toBeUndefined();
    expect(callAt("src/app/Child.java", 9)).toBeUndefined();
    expect(callAt("src/app/Ambiguous.java", 5)).toBeUndefined();

    const nearFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/contracts/NearContract.java");
    expect(nearFacts?.jvmFacts?.javaFieldDeclarations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          declaringTypeId: nearId,
          name: "shadowed",
          declarationKind: "interface-constant",
          isStatic: true,
          isFinal: true,
          visibility: "public",
          modifierProof: "interface-implicit"
        }),
        expect.objectContaining({
          declaringTypeId: nearId,
          name: "genericBarrier",
          declarationKind: "interface-constant",
          type: null
        })
      ])
    );
  });

  it("resolves type-qualified Java interface constants without guessing value-qualified chains", async () => {
    const projectPath = await createInlineProject({
      "src/api/Service.java": [
        "package api;",
        "public class Service { public void execute() {} }"
      ].join("\n"),
      "src/contracts/RootContract.java": [
        "package contracts;",
        "import api.Service;",
        "public interface RootContract {",
        "  Service inherited = null;",
        "  Service ambiguous = null;",
        "  Service[] unsupported = null;",
        "}"
      ].join("\n"),
      "src/contracts/NearContract.java": [
        "package contracts;",
        "import api.Service;",
        "public interface NearContract extends RootContract {",
        "  Service shadowed = null;",
        "}"
      ].join("\n"),
      "src/contracts/OtherContract.java": [
        "package contracts;",
        "import api.Service;",
        "public interface OtherContract {",
        "  Service ambiguous = null;",
        "}"
      ].join("\n"),
      "src/contracts/CombinedContract.java": [
        "package contracts;",
        "public interface CombinedContract extends NearContract, OtherContract {}"
      ].join("\n"),
      "src/app/ClassFields.java": [
        "package app;",
        "import api.Service;",
        "public class ClassFields { public static Service shadowed; }"
      ].join("\n"),
      "src/app/ValueShadow.java": [
        "package app;",
        "import api.Service;",
        "import contracts.NearContract;",
        "public class ValueShadow {",
        "  Service NearContract;",
        "  public void run() { NearContract.shadowed.execute(); }",
        "}"
      ].join("\n"),
      "src/app/Runner.java": [
        "package app;",
        "import api.Service;",
        "import contracts.NearContract;",
        "import contracts.CombinedContract;",
        "public class Runner {",
        "  public void run() {",
        "    NearContract.shadowed.execute();",
        "    NearContract.inherited.execute();",
        "    contracts.NearContract.shadowed.execute();",
        "    NearContract.unsupported.execute();",
        "    CombinedContract.ambiguous.execute();",
        "    ClassFields.shadowed.execute();",
        "    MissingContract.shadowed.execute();",
        "    Service NearContract = null;",
        "    NearContract.shadowed.execute();",
        "  }",
        "  public static void staticRun() {",
        "    NearContract.shadowed.execute();",
        "  }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const callAt = (line: number) =>
      snapshot.edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.filePath === "src/app/Runner.java" &&
          edge.range.start.line === line
      );
    const executeId = symbol("src/api/Service.java#Service.execute")?.id;
    const serviceId = symbol("src/api/Service.java#Service")?.id;
    const runnerId = symbol("src/app/Runner.java#Runner")?.id;
    const rootId = symbol("src/contracts/RootContract.java#RootContract")?.id;
    const nearId = symbol("src/contracts/NearContract.java#NearContract")?.id;

    expect(callAt(7)).toEqual(
      expect.objectContaining({
        targetId: executeId,
        evidence: expect.objectContaining({
          callDispatch: expect.objectContaining({
            invocationKind: "type-field",
            receiverTypeSymbolId: serviceId,
            receiverBinding: expect.objectContaining({
              policy: "java-source-field-binding-v4",
              kind: "type-field",
              name: "shadowed",
              declaringTypeSymbolId: nearId,
              declaringTypeKind: "interface",
              selectionReason: "declared-owner",
              ownerSelectionPath: [],
              qualifiedOwnerType: expect.objectContaining({
                canonicalType: "reference:contracts.NearContract",
                proof: "explicit-import",
                targetSymbolId: nearId,
                range: expect.objectContaining({ start: expect.objectContaining({ line: 7 }) })
              }),
              access: expect.objectContaining({
                decision: "public",
                callerTypeSymbolId: runnerId,
                ownerTypeSymbolId: nearId
              })
            })
          })
        })
      })
    );
    expect(callAt(8)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        policy: "java-source-field-binding-v4",
        declaringTypeSymbolId: rootId,
        selectionReason: "unique-interface-owner",
        ownerSelectionPath: [
          expect.objectContaining({ sourceSymbolId: nearId, targetSymbolId: rootId })
        ]
      })
    );
    expect(callAt(9)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({
        qualifiedOwnerType: expect.objectContaining({
          canonicalType: "reference:contracts.NearContract",
          proof: "qualified-type",
          targetSymbolId: nearId
        })
      })
    );
    expect(callAt(18)?.evidence?.callDispatch?.receiverBinding).toEqual(
      expect.objectContaining({ kind: "type-field", declaringTypeSymbolId: nearId })
    );

    for (const line of [10, 11, 12, 13, 15]) {
      expect(callAt(line)).toBeUndefined();
    }
    expect(
      snapshot.edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.filePath === "src/app/ValueShadow.java" &&
          edge.range.start.line === 6
      )
    ).toBeUndefined();

    const runnerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/app/Runner.java");
    expect(runnerFacts?.jvmFacts?.javaMemberCallReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          receiverKind: "type-field",
          receiverName: "shadowed",
          receiverOwnerType: expect.objectContaining({
            syntax: "type-qualifier",
            referenceName: "NearContract",
            importedTypePath: "contracts.NearContract"
          })
        }),
        expect.objectContaining({
          receiverKind: "type-field",
          receiverName: "shadowed",
          receiverOwnerType: expect.objectContaining({
            syntax: "type-qualifier",
            referenceName: "NearContract",
            qualifiedTypePath: "contracts.NearContract"
          })
        })
      ])
    );
  });

  it("resolves Java chained overloads only from exact argument type evidence", async () => {
    const projectPath = await createInlineProject({
      "src/model/Input.java": [
        "package model;",
        "public class Input {}"
      ].join("\n"),
      "src/model/OtherInput.java": [
        "package model;",
        "public class OtherInput {}"
      ].join("\n"),
      "src/api/Executor.java": [
        "package api;",
        "public class Executor { public void execute() {} }"
      ].join("\n"),
      "src/factory/TypedFactory.java": [
        "package factory;",
        "import api.Executor;",
        "import model.Input;",
        "import model.OtherInput;",
        "public class TypedFactory {",
        "  public static Executor create(Input value) { return null; }",
        "  public static Executor create(OtherInput value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/TypedRunner.java": [
        "package app;",
        "import factory.TypedFactory;",
        "import model.Input;",
        "public class TypedRunner {",
        "  public void run() { TypedFactory.create(new Input()).execute(); }",
        "}"
      ].join("\n"),
      "src/app/QualifiedTypedRunner.java": [
        "package app;",
        "public class QualifiedTypedRunner {",
        "  public void run() { factory.TypedFactory.create(new model.Input()).execute(); }",
        "}"
      ].join("\n"),
      "src/api/TypedExecutor.java": [
        "package api;",
        "import model.Input;",
        "import model.OtherInput;",
        "public class TypedExecutor {",
        "  public void execute(Input value) {}",
        "  public void execute(OtherInput value) {}",
        "}"
      ].join("\n"),
      "src/factory/OuterFactory.java": [
        "package factory;",
        "import api.TypedExecutor;",
        "public class OuterFactory { public static TypedExecutor create() { return null; } }"
      ].join("\n"),
      "src/app/OuterRunner.java": [
        "package app;",
        "import factory.OuterFactory;",
        "import model.Input;",
        "public class OuterRunner {",
        "  public void run() { OuterFactory.create().execute(new Input()); }",
        "}"
      ].join("\n"),
      "src/factory/PrimitiveFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class PrimitiveFactory {",
        "  public static Executor create(boolean value) { return null; }",
        "  public static Executor create(int value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/PrimitiveRunner.java": [
        "package app;",
        "import factory.PrimitiveFactory;",
        "public class PrimitiveRunner {",
        "  public void run() { PrimitiveFactory.create(true).execute(); }",
        "}"
      ].join("\n"),
      "src/factory/StringFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class StringFactory {",
        "  public static Executor create(java.lang.String value) { return null; }",
        "  public static Executor create(int value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/StringRunner.java": [
        "package app;",
        "import factory.StringFactory;",
        "public class StringRunner {",
        "  public void run() { StringFactory.create(\"value\").execute(); }",
        "}"
      ].join("\n"),
      "src/factory/VarargTypeFactory.java": [
        "package factory;",
        "import api.Executor;",
        "import model.Input;",
        "import model.OtherInput;",
        "public class VarargTypeFactory {",
        "  public static Executor create(Input... values) { return null; }",
        "  public static Executor create(OtherInput... values) { return null; }",
        "}"
      ].join("\n"),
      "src/app/VarargTypeRunner.java": [
        "package app;",
        "import factory.VarargTypeFactory;",
        "import model.Input;",
        "public class VarargTypeRunner {",
        "  public void run() { VarargTypeFactory.create(new Input(), new Input()).execute(); }",
        "}"
      ].join("\n"),
      "src/bad/UnknownRunner.java": [
        "package bad;",
        "import factory.TypedFactory;",
        "public class UnknownRunner {",
        "  public void run(Object value) { TypedFactory.create(value).execute(); }",
        "}"
      ].join("\n"),
      "src/bad/NullRunner.java": [
        "package bad;",
        "import factory.TypedFactory;",
        "public class NullRunner {",
        "  public void run() { TypedFactory.create(null).execute(); }",
        "}"
      ].join("\n"),
      "src/factory/OnlyIntFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class OnlyIntFactory {",
        "  public static Executor create(int value) { return null; }",
        "}"
      ].join("\n"),
      "src/bad/IncompatibleRunner.java": [
        "package bad;",
        "import factory.OnlyIntFactory;",
        "public class IncompatibleRunner {",
        "  public void run() { OnlyIntFactory.create(true).execute(); }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string, line?: number) =>
      snapshot.symbols.find(
        (candidate) =>
          candidate.qualifiedName === qualifiedName &&
          (line === undefined || candidate.range.start.line === line)
      );
    const calls = snapshot.edges.filter((edge) => edge.kind === "calls");
    const sourceCalls = (qualifiedName: string) =>
      calls.filter((edge) => edge.sourceId === symbol(qualifiedName)?.id);

    const typedFactoryCall = sourceCalls("src/app/TypedRunner.java#TypedRunner.run").find(
      (edge) => edge.referenceName === "create"
    );
    expect(typedFactoryCall).toMatchObject({
      targetId: symbol("src/factory/TypedFactory.java#TypedFactory.create", 6)?.id,
      resolution: "exact",
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-type.factory",
        candidateSymbolIds: expect.arrayContaining([
          symbol("src/factory/TypedFactory.java#TypedFactory.create", 6)?.id,
          symbol("src/factory/TypedFactory.java#TypedFactory.create", 7)?.id
        ]),
        callType: {
          arguments: [
            expect.objectContaining({
              canonicalType: "reference:model.Input",
              proof: "explicit-import"
            })
          ],
          candidates: expect.arrayContaining([
            expect.objectContaining({
              symbolId: symbol("src/factory/TypedFactory.java#TypedFactory.create", 6)?.id,
              compatibility: "compatible"
            }),
            expect.objectContaining({
              symbolId: symbol("src/factory/TypedFactory.java#TypedFactory.create", 7)?.id,
              compatibility: "incompatible"
            })
          ])
        }
      }
    });
    expect(sourceCalls("src/app/TypedRunner.java#TypedRunner.run")).toHaveLength(2);

    const qualifiedFactoryCall = sourceCalls(
      "src/app/QualifiedTypedRunner.java#QualifiedTypedRunner.run"
    ).find((edge) => edge.referenceName === "create");
    expect(qualifiedFactoryCall).toMatchObject({
      targetId: symbol("src/factory/TypedFactory.java#TypedFactory.create", 6)?.id,
      evidence: {
        ruleId: "call.java.chained-factory.qualified-type.arity-type.factory",
        callType: {
          arguments: [expect.objectContaining({ proof: "qualified-type" })]
        }
      }
    });

    const outerCall = sourceCalls("src/app/OuterRunner.java#OuterRunner.run").find(
      (edge) => edge.referenceName === "execute"
    );
    expect(outerCall).toMatchObject({
      targetId: symbol("src/api/TypedExecutor.java#TypedExecutor.execute", 5)?.id,
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-type.return-dispatch",
        callType: {
          arguments: [expect.objectContaining({ canonicalType: "reference:model.Input" })]
        }
      }
    });

    for (const [runner, expectedType, expectedProof] of [
      ["PrimitiveRunner", "primitive:boolean", "primitive-literal"],
      ["StringRunner", "reference:java.lang.String", "string-literal"],
      ["VarargTypeRunner", "reference:model.Input", "explicit-import"]
    ] as const) {
      const edge = sourceCalls(`src/app/${runner}.java#${runner}.run`).find(
        (candidate) => candidate.referenceName === "create"
      );
      expect(edge).toMatchObject({
        resolution: "exact",
        evidence: {
          ruleId: "call.java.chained-factory.explicit-import.arity-type.factory",
          callType: {
            arguments: expect.arrayContaining([
              expect.objectContaining({ canonicalType: expectedType, proof: expectedProof })
            ])
          }
        }
      });
    }

    expect(
      calls.filter((edge) =>
        [
          "src/bad/UnknownRunner.java",
          "src/bad/NullRunner.java",
          "src/bad/IncompatibleRunner.java"
        ].includes(edge.filePath)
      )
    ).toEqual([]);

    const typedRunnerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/app/TypedRunner.java");
    expect(typedRunnerFacts?.jvmFacts?.javaChainedCallReferences).toEqual([
      expect.objectContaining({
        factoryArgumentTypes: [
          expect.objectContaining({ referenceName: "Input", importedTypePath: "model.Input" })
        ],
        methodArgumentTypes: []
      })
    ]);
    const typedFactoryFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/factory/TypedFactory.java");
    expect(typedFactoryFacts?.jvmFacts?.javaCallableDeclarations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "create",
          parameterTypes: [
            expect.objectContaining({ referenceName: "Input", importedTypePath: "model.Input" })
          ]
        }),
        expect.objectContaining({
          name: "create",
          parameterTypes: [
            expect.objectContaining({
              referenceName: "OtherInput",
              importedTypePath: "model.OtherInput"
            })
          ]
        })
      ])
    );
  });

  it("ranks proven Java primitive widening conversions without guessing ambiguous overloads", async () => {
    const projectPath = await createInlineProject({
      "src/api/Executor.java": [
        "package api;",
        "public class Executor { public void execute() {} }"
      ].join("\n"),
      "src/factory/WideningFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class WideningFactory {",
        "  public static Executor create(long value) { return null; }",
        "  public static Executor create(float value) { return null; }",
        "  public static Executor create(double value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/WideningRunner.java": [
        "package app;",
        "import factory.WideningFactory;",
        "public class WideningRunner {",
        "  public void run() { WideningFactory.create(1).execute(); }",
        "}"
      ].join("\n"),
      "src/factory/ExactPrimitiveFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class ExactPrimitiveFactory {",
        "  public static Executor create(int value) { return null; }",
        "  public static Executor create(long value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/ExactPrimitiveRunner.java": [
        "package app;",
        "import factory.ExactPrimitiveFactory;",
        "public class ExactPrimitiveRunner {",
        "  public void run() { ExactPrimitiveFactory.create(1).execute(); }",
        "}"
      ].join("\n"),
      "src/factory/CharFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class CharFactory {",
        "  public static Executor create(int value) { return null; }",
        "  public static Executor create(long value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/CharRunner.java": [
        "package app;",
        "import factory.CharFactory;",
        "public class CharRunner {",
        "  public void run() { CharFactory.create('a').execute(); }",
        "}"
      ].join("\n"),
      "src/factory/ByteFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class ByteFactory {",
        "  public static Executor create(short value) { return null; }",
        "  public static Executor create(int value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/ByteRunner.java": [
        "package app;",
        "import factory.ByteFactory;",
        "public class ByteRunner {",
        "  public void run() { ByteFactory.create((byte) 1).execute(); }",
        "}"
      ].join("\n"),
      "src/factory/ShortFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class ShortFactory {",
        "  public static Executor create(int value) { return null; }",
        "  public static Executor create(long value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/ShortRunner.java": [
        "package app;",
        "import factory.ShortFactory;",
        "public class ShortRunner {",
        "  public void run() { ShortFactory.create((short) 1).execute(); }",
        "}"
      ].join("\n"),
      "src/api/WideningExecutor.java": [
        "package api;",
        "public class WideningExecutor {",
        "  public void execute(float value) {}",
        "  public void execute(double value) {}",
        "}"
      ].join("\n"),
      "src/factory/OuterWideningFactory.java": [
        "package factory;",
        "import api.WideningExecutor;",
        "public class OuterWideningFactory {",
        "  public static WideningExecutor create() { return null; }",
        "}"
      ].join("\n"),
      "src/app/OuterWideningRunner.java": [
        "package app;",
        "import factory.OuterWideningFactory;",
        "public class OuterWideningRunner {",
        "  public void run() { OuterWideningFactory.create().execute(1L); }",
        "}"
      ].join("\n"),
      "src/factory/OnlyDoubleFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class OnlyDoubleFactory {",
        "  public static Executor create(double value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/FloatWideningRunner.java": [
        "package app;",
        "import factory.OnlyDoubleFactory;",
        "public class FloatWideningRunner {",
        "  public void run() { OnlyDoubleFactory.create(1.0f).execute(); }",
        "}"
      ].join("\n"),
      "src/factory/MixedPhaseFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class MixedPhaseFactory {",
        "  public static Executor create(long value) { return null; }",
        "  public static Executor create(int... values) { return null; }",
        "}"
      ].join("\n"),
      "src/app/MixedPhaseRunner.java": [
        "package app;",
        "import factory.MixedPhaseFactory;",
        "public class MixedPhaseRunner {",
        "  public void run() { MixedPhaseFactory.create(1).execute(); }",
        "}"
      ].join("\n"),
      "src/factory/AmbiguousPrimitiveFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class AmbiguousPrimitiveFactory {",
        "  public static Executor create(long first, float second) { return null; }",
        "  public static Executor create(float first, long second) { return null; }",
        "}"
      ].join("\n"),
      "src/bad/AmbiguousPrimitiveRunner.java": [
        "package bad;",
        "import factory.AmbiguousPrimitiveFactory;",
        "public class AmbiguousPrimitiveRunner {",
        "  public void run() { AmbiguousPrimitiveFactory.create(1, 1).execute(); }",
        "}"
      ].join("\n"),
      "src/factory/OnlyIntFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class OnlyIntFactory {",
        "  public static Executor create(int value) { return null; }",
        "}"
      ].join("\n"),
      "src/bad/NarrowingRunner.java": [
        "package bad;",
        "import factory.OnlyIntFactory;",
        "public class NarrowingRunner {",
        "  public void run() { OnlyIntFactory.create(1L).execute(); }",
        "}"
      ].join("\n"),
      "src/bad/BooleanRunner.java": [
        "package bad;",
        "import factory.WideningFactory;",
        "public class BooleanRunner {",
        "  public void run() { WideningFactory.create(true).execute(); }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string, line?: number) =>
      snapshot.symbols.find(
        (candidate) =>
          candidate.qualifiedName === qualifiedName &&
          (line === undefined || candidate.range.start.line === line)
      );
    const calls = snapshot.edges.filter((edge) => edge.kind === "calls");
    const sourceCalls = (qualifiedName: string) =>
      calls.filter((edge) => edge.sourceId === symbol(qualifiedName)?.id);
    const factoryCall = (runner: string) =>
      sourceCalls(`src/app/${runner}.java#${runner}.run`).find(
        (edge) => edge.referenceName === "create"
      );

    const wideningCall = factoryCall("WideningRunner");
    expect(wideningCall).toMatchObject({
      targetId: symbol("src/factory/WideningFactory.java#WideningFactory.create", 4)?.id,
      resolution: "exact",
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-conversion.factory",
        callType: {
          selectionPolicy: "java-source-widening-v2",
          selectionReason: "conversion-cost",
          candidates: expect.arrayContaining([
            expect.objectContaining({
              symbolId: symbol("src/factory/WideningFactory.java#WideningFactory.create", 4)?.id,
              invocationMode: "fixed",
              compatibility: "compatible",
              conversions: [
                expect.objectContaining({
                  kind: "primitive-widening",
                  sourceType: "primitive:int",
                  targetType: "primitive:long",
                  distance: 1
                })
              ]
            }),
            expect.objectContaining({
              symbolId: symbol("src/factory/WideningFactory.java#WideningFactory.create", 5)?.id,
              conversions: [expect.objectContaining({ distance: 2 })]
            }),
            expect.objectContaining({
              symbolId: symbol("src/factory/WideningFactory.java#WideningFactory.create", 6)?.id,
              conversions: [expect.objectContaining({ distance: 3 })]
            })
          ]),
          selectedSymbolId: symbol(
            "src/factory/WideningFactory.java#WideningFactory.create",
            4
          )?.id
        }
      }
    });

    const exactCall = factoryCall("ExactPrimitiveRunner");
    expect(exactCall).toMatchObject({
      targetId: symbol(
        "src/factory/ExactPrimitiveFactory.java#ExactPrimitiveFactory.create",
        4
      )?.id,
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-type.factory",
        callType: {
          candidates: expect.arrayContaining([
            expect.objectContaining({
              symbolId: symbol(
                "src/factory/ExactPrimitiveFactory.java#ExactPrimitiveFactory.create",
                4
              )?.id,
              conversions: [expect.objectContaining({ kind: "exact", distance: 0 })]
            }),
            expect.objectContaining({
              symbolId: symbol(
                "src/factory/ExactPrimitiveFactory.java#ExactPrimitiveFactory.create",
                5
              )?.id,
              conversions: [
                expect.objectContaining({ kind: "primitive-widening", distance: 1 })
              ]
            })
          ]),
          selectedSymbolId: symbol(
            "src/factory/ExactPrimitiveFactory.java#ExactPrimitiveFactory.create",
            4
          )?.id
        }
      }
    });

    expect(factoryCall("CharRunner")).toMatchObject({
      targetId: symbol("src/factory/CharFactory.java#CharFactory.create", 4)?.id,
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-conversion.factory",
        callType: {
          arguments: [expect.objectContaining({ canonicalType: "primitive:char" })],
          candidates: expect.arrayContaining([
            expect.objectContaining({
              symbolId: symbol("src/factory/CharFactory.java#CharFactory.create", 4)?.id,
              conversions: [expect.objectContaining({ distance: 1 })]
            })
          ])
        }
      }
    });

    for (const [runner, factory, sourceType, targetType] of [
      ["ByteRunner", "ByteFactory", "primitive:byte", "primitive:short"],
      ["ShortRunner", "ShortFactory", "primitive:short", "primitive:int"]
    ] as const) {
      expect(factoryCall(runner)).toMatchObject({
        targetId: symbol(`src/factory/${factory}.java#${factory}.create`, 4)?.id,
        evidence: {
          ruleId: "call.java.chained-factory.explicit-import.arity-conversion.factory",
          callType: {
            arguments: [
              expect.objectContaining({ canonicalType: sourceType, proof: "primitive-cast" })
            ],
            candidates: expect.arrayContaining([
              expect.objectContaining({
                symbolId: symbol(`src/factory/${factory}.java#${factory}.create`, 4)?.id,
                conversions: [
                  expect.objectContaining({
                    kind: "primitive-widening",
                    sourceType,
                    targetType,
                    distance: 1
                  })
                ]
              })
            ])
          }
        }
      });
    }

    const outerCall = sourceCalls(
      "src/app/OuterWideningRunner.java#OuterWideningRunner.run"
    ).find((edge) => edge.referenceName === "execute");
    expect(outerCall).toMatchObject({
      targetId: symbol("src/api/WideningExecutor.java#WideningExecutor.execute", 3)?.id,
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-conversion.return-dispatch",
        callType: {
          arguments: [expect.objectContaining({ canonicalType: "primitive:long" })],
          candidates: expect.arrayContaining([
            expect.objectContaining({
              symbolId: symbol("src/api/WideningExecutor.java#WideningExecutor.execute", 3)?.id,
              conversions: [expect.objectContaining({ distance: 1 })]
            }),
            expect.objectContaining({
              symbolId: symbol("src/api/WideningExecutor.java#WideningExecutor.execute", 4)?.id,
              conversions: [expect.objectContaining({ distance: 2 })]
            })
          ])
        }
      }
    });

    expect(factoryCall("FloatWideningRunner")).toMatchObject({
      targetId: symbol("src/factory/OnlyDoubleFactory.java#OnlyDoubleFactory.create", 4)?.id,
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-conversion.factory",
        callType: {
          candidates: [
            expect.objectContaining({
              conversions: [
                expect.objectContaining({
                  sourceType: "primitive:float",
                  targetType: "primitive:double",
                  distance: 1
                })
              ]
            })
          ]
        }
      }
    });

    expect(factoryCall("MixedPhaseRunner")).toMatchObject({
      targetId: symbol("src/factory/MixedPhaseFactory.java#MixedPhaseFactory.create", 4)?.id,
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-conversion.factory",
        callType: {
          candidates: expect.arrayContaining([
            expect.objectContaining({
              symbolId: symbol("src/factory/MixedPhaseFactory.java#MixedPhaseFactory.create", 4)?.id,
              invocationMode: "fixed",
              compatibility: "compatible"
            }),
            expect.objectContaining({
              symbolId: symbol("src/factory/MixedPhaseFactory.java#MixedPhaseFactory.create", 5)?.id,
              invocationMode: "varargs",
              compatibility: "compatible"
            })
          ])
        }
      }
    });

    expect(
      calls.filter((edge) =>
        [
          "src/bad/AmbiguousPrimitiveRunner.java",
          "src/bad/NarrowingRunner.java",
          "src/bad/BooleanRunner.java"
        ].includes(edge.filePath)
      )
    ).toEqual([]);
  });

  it("ranks project-proven Java reference widening paths without guessing hierarchy ambiguity", async () => {
    const deepHierarchy = Object.fromEntries(
      Array.from({ length: 18 }, (_, index) => [
        `src/model/deep/Type${index}.java`,
        [
          "package model.deep;",
          index === 0
            ? "public class Type0 {}"
            : `public class Type${index} extends Type${index - 1} {}`
        ].join("\n")
      ])
    );
    const projectPath = await createInlineProject({
      ...deepHierarchy,
      "src/model/Creature.java": [
        "package model;",
        "public interface Creature {}"
      ].join("\n"),
      "src/model/Mammal.java": [
        "package model;",
        "public class Mammal implements Creature {}"
      ].join("\n"),
      "src/model/Dog.java": [
        "package model;",
        "public class Dog extends Mammal implements Creature {}"
      ].join("\n"),
      "src/model/Pet.java": [
        "package model;",
        "public interface Pet {}"
      ].join("\n"),
      "src/model/Hybrid.java": [
        "package model;",
        "public class Hybrid extends Mammal implements Pet {}"
      ].join("\n"),
      "src/api/Executor.java": [
        "package api;",
        "import model.Creature;",
        "import model.Mammal;",
        "public class Executor {",
        "  public void execute(Mammal value) {}",
        "  public void execute(Creature value) {}",
        "}"
      ].join("\n"),
      "src/factory/ReferenceFactory.java": [
        "package factory;",
        "import api.Executor;",
        "import model.Creature;",
        "import model.Mammal;",
        "public class ReferenceFactory {",
        "  public static Executor create(Mammal value) { return null; }",
        "  public static Executor create(Creature value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/ReferenceRunner.java": [
        "package app;",
        "import factory.ReferenceFactory;",
        "import model.Dog;",
        "public class ReferenceRunner {",
        "  public void run() { ReferenceFactory.create(new Dog()).execute(new Dog()); }",
        "}"
      ].join("\n"),
      "src/factory/ExactReferenceFactory.java": [
        "package factory;",
        "import api.Executor;",
        "import model.Dog;",
        "import model.Mammal;",
        "public class ExactReferenceFactory {",
        "  public static Executor create(Dog value) { return null; }",
        "  public static Executor create(Mammal value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/ExactReferenceRunner.java": [
        "package app;",
        "import factory.ExactReferenceFactory;",
        "import model.Dog;",
        "public class ExactReferenceRunner {",
        "  public void run() { ExactReferenceFactory.create(new Dog()).execute(new Dog()); }",
        "}"
      ].join("\n"),
      "src/factory/OuterReferenceFactory.java": [
        "package factory;",
        "import api.Executor;",
        "public class OuterReferenceFactory {",
        "  public static Executor create() { return null; }",
        "}"
      ].join("\n"),
      "src/app/OuterReferenceRunner.java": [
        "package app;",
        "import factory.OuterReferenceFactory;",
        "import model.Dog;",
        "public class OuterReferenceRunner {",
        "  public void run() { OuterReferenceFactory.create().execute(new Dog()); }",
        "}"
      ].join("\n"),
      "src/factory/AmbiguousReferenceFactory.java": [
        "package factory;",
        "import api.Executor;",
        "import model.Mammal;",
        "import model.Pet;",
        "public class AmbiguousReferenceFactory {",
        "  public static Executor create(Mammal value) { return null; }",
        "  public static Executor create(Pet value) { return null; }",
        "}"
      ].join("\n"),
      "src/bad/AmbiguousReferenceRunner.java": [
        "package bad;",
        "import factory.AmbiguousReferenceFactory;",
        "import model.Hybrid;",
        "public class AmbiguousReferenceRunner {",
        "  public void run() { AmbiguousReferenceFactory.create(new Hybrid()).execute(new Hybrid()); }",
        "}"
      ].join("\n"),
      "src/factory/NarrowReferenceFactory.java": [
        "package factory;",
        "import api.Executor;",
        "import model.Dog;",
        "public class NarrowReferenceFactory {",
        "  public static Executor create(Dog value) { return null; }",
        "}"
      ].join("\n"),
      "src/bad/NarrowReferenceRunner.java": [
        "package bad;",
        "import factory.NarrowReferenceFactory;",
        "import model.Mammal;",
        "public class NarrowReferenceRunner {",
        "  public void run() { NarrowReferenceFactory.create(new Mammal()).execute(new Mammal()); }",
        "}"
      ].join("\n"),
      "src/factory/DeepReferenceFactory.java": [
        "package factory;",
        "import api.Executor;",
        "import model.deep.Type0;",
        "public class DeepReferenceFactory {",
        "  public static Executor create(Type0 value) { return null; }",
        "}"
      ].join("\n"),
      "src/app/BoundaryReferenceRunner.java": [
        "package app;",
        "import factory.DeepReferenceFactory;",
        "import model.Dog;",
        "import model.deep.Type16;",
        "public class BoundaryReferenceRunner {",
        "  public void run() { DeepReferenceFactory.create(new Type16()).execute(new Dog()); }",
        "}"
      ].join("\n"),
      "src/bad/DeepReferenceRunner.java": [
        "package bad;",
        "import factory.DeepReferenceFactory;",
        "import model.Dog;",
        "import model.deep.Type17;",
        "public class DeepReferenceRunner {",
        "  public void run() { DeepReferenceFactory.create(new Type17()).execute(new Dog()); }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string, line?: number) =>
      snapshot.symbols.find(
        (candidate) =>
          candidate.qualifiedName === qualifiedName &&
          (line === undefined || candidate.range.start.line === line)
      );
    const calls = snapshot.edges.filter((edge) => edge.kind === "calls");
    const sourceCalls = (qualifiedName: string) =>
      calls.filter((edge) => edge.sourceId === symbol(qualifiedName)?.id);
    const factoryCall = (runner: string) =>
      sourceCalls(`src/app/${runner}.java#${runner}.run`).find(
        (edge) => edge.referenceName === "create"
      );

    const dogId = symbol("src/model/Dog.java#Dog")?.id;
    const mammalId = symbol("src/model/Mammal.java#Mammal")?.id;
    const creatureId = symbol("src/model/Creature.java#Creature")?.id;
    expect(
      snapshot.edges.filter(
        (edge) => edge.kind === "extends" && edge.filePath.startsWith("src/model/deep/")
      )
    ).toHaveLength(17);
    const referenceCall = factoryCall("ReferenceRunner");
    expect(referenceCall).toMatchObject({
      targetId: symbol("src/factory/ReferenceFactory.java#ReferenceFactory.create", 6)?.id,
      resolution: "exact",
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-conversion.factory",
        callType: {
          selectionPolicy: "java-source-widening-v2",
          selectionReason: "parameter-specificity",
          candidates: expect.arrayContaining([
            expect.objectContaining({
              symbolId: symbol(
                "src/factory/ReferenceFactory.java#ReferenceFactory.create",
                6
              )?.id,
              conversions: [
                expect.objectContaining({
                  kind: "reference-widening",
                  sourceType: "reference:model.Dog",
                  targetType: "reference:model.Mammal",
                  distance: 1,
                  hierarchyPath: [
                    expect.objectContaining({
                      sourceSymbolId: dogId,
                      targetSymbolId: mammalId,
                      relationKind: "extends",
                      ruleId: "syntax.jvm.cross-file.same-package.direct-superclass"
                    })
                  ]
                })
              ]
            }),
            expect.objectContaining({
              symbolId: symbol(
                "src/factory/ReferenceFactory.java#ReferenceFactory.create",
                7
              )?.id,
              conversions: [
                expect.objectContaining({
                  kind: "reference-widening",
                  distance: 1,
                  hierarchyPath: [
                    expect.objectContaining({
                      sourceSymbolId: dogId,
                      targetSymbolId: creatureId,
                      relationKind: "implements"
                    })
                  ]
                })
              ]
            })
          ]),
          selectedSymbolId: symbol(
            "src/factory/ReferenceFactory.java#ReferenceFactory.create",
            6
          )?.id
        }
      }
    });

    expect(factoryCall("ExactReferenceRunner")).toMatchObject({
      targetId: symbol(
        "src/factory/ExactReferenceFactory.java#ExactReferenceFactory.create",
        6
      )?.id,
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-type.factory",
        callType: {
          candidates: expect.arrayContaining([
            expect.objectContaining({
              symbolId: symbol(
                "src/factory/ExactReferenceFactory.java#ExactReferenceFactory.create",
                6
              )?.id,
              conversions: [expect.objectContaining({ kind: "exact", distance: 0 })]
            }),
            expect.objectContaining({
              symbolId: symbol(
                "src/factory/ExactReferenceFactory.java#ExactReferenceFactory.create",
                7
              )?.id,
              conversions: [
                expect.objectContaining({ kind: "reference-widening", distance: 1 })
              ]
            })
          ])
        }
      }
    });

    const outerCall = sourceCalls(
      "src/app/OuterReferenceRunner.java#OuterReferenceRunner.run"
    ).find((edge) => edge.referenceName === "execute");
    expect(outerCall).toMatchObject({
      targetId: symbol("src/api/Executor.java#Executor.execute", 5)?.id,
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-conversion.return-dispatch",
        callType: {
          candidates: expect.arrayContaining([
            expect.objectContaining({
              symbolId: symbol("src/api/Executor.java#Executor.execute", 5)?.id,
              conversions: [expect.objectContaining({ kind: "reference-widening", distance: 1 })]
            }),
            expect.objectContaining({
              symbolId: symbol("src/api/Executor.java#Executor.execute", 6)?.id,
              conversions: [expect.objectContaining({ kind: "reference-widening", distance: 1 })]
            })
          ])
        }
      }
    });

    expect(factoryCall("BoundaryReferenceRunner")).toMatchObject({
      targetId: symbol(
        "src/factory/DeepReferenceFactory.java#DeepReferenceFactory.create",
        5
      )?.id,
      evidence: {
        callType: {
          hierarchyBounds: { maximumDepth: 16, maximumVisitedTypes: 256 },
          candidates: [
            expect.objectContaining({
              conversions: [
                expect.objectContaining({
                  kind: "reference-widening",
                  distance: 16,
                  hierarchyPath: expect.arrayContaining([
                    expect.objectContaining({
                      sourceSymbolId: symbol("src/model/deep/Type16.java#Type16")?.id,
                      targetSymbolId: symbol("src/model/deep/Type15.java#Type15")?.id
                    }),
                    expect.objectContaining({
                      sourceSymbolId: symbol("src/model/deep/Type1.java#Type1")?.id,
                      targetSymbolId: symbol("src/model/deep/Type0.java#Type0")?.id
                    })
                  ])
                })
              ]
            })
          ]
        }
      }
    });

    expect(
      calls.filter((edge) =>
        [
          "src/bad/AmbiguousReferenceRunner.java",
          "src/bad/NarrowReferenceRunner.java",
          "src/bad/DeepReferenceRunner.java"
        ].includes(edge.filePath)
      )
    ).toEqual([]);
  });

  it("dispatches a direct Java factory chain to a project-proven inherited target owner", async () => {
    const projectPath = await createInlineProject({
      "src/api/BaseExecutor.java": [
        "package api;",
        "public class BaseExecutor {",
        "  public void execute(int value) {}",
        "}"
      ].join("\n"),
      "src/api/LeafExecutor.java": [
        "package api;",
        "public class LeafExecutor extends BaseExecutor {}"
      ].join("\n"),
      "src/factory/InheritedFactory.java": [
        "package factory;",
        "import api.LeafExecutor;",
        "public class InheritedFactory {",
        "  public static LeafExecutor create() { return null; }",
        "}"
      ].join("\n"),
      "src/app/InheritedRunner.java": [
        "package app;",
        "import factory.InheritedFactory;",
        "public class InheritedRunner {",
        "  public void run() { InheritedFactory.create().execute(1); }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const runnerId = symbol("src/app/InheritedRunner.java#InheritedRunner.run")?.id;
    const baseTypeId = symbol("src/api/BaseExecutor.java#BaseExecutor")?.id;
    const leafTypeId = symbol("src/api/LeafExecutor.java#LeafExecutor")?.id;
    const inheritedMethodId = symbol("src/api/BaseExecutor.java#BaseExecutor.execute")?.id;
    const runnerCalls = snapshot.edges.filter(
      (edge) => edge.kind === "calls" && edge.sourceId === runnerId
    );

    expect(runnerCalls.find((edge) => edge.referenceName === "create")).toMatchObject({
      targetId: symbol("src/factory/InheritedFactory.java#InheritedFactory.create")?.id,
      resolution: "exact"
    });
    expect(runnerCalls.find((edge) => edge.referenceName === "execute")).toMatchObject({
      targetId: inheritedMethodId,
      resolution: "exact",
      evidence: {
        ruleId:
          "call.java.chained-factory.explicit-import.arity.inherited-return-dispatch",
        callDispatch: {
          selectionPolicy: "java-source-method-set-v4",
          selectionReason: "unique-inherited-owner",
          receiverTypeSymbolId: leafTypeId,
          selectedOwnerTypeSymbolId: baseTypeId,
          hierarchyBounds: { maximumDepth: 16, maximumVisitedTypes: 256 },
          candidates: expect.arrayContaining([
            expect.objectContaining({
              ownerTypeSymbolId: baseTypeId,
              ownerTypeKind: "class",
              declarationSymbolIds: [inheritedMethodId],
              distance: 1,
              hierarchyPath: [
                expect.objectContaining({
                  sourceSymbolId: leafTypeId,
                  targetSymbolId: baseTypeId,
                  relationKind: "extends",
                  ruleId: "syntax.jvm.cross-file.same-package.direct-superclass"
                })
              ]
            })
          ])
        }
      }
    });
  });

  it("selects a unique Java inherited method owner without guessing hierarchy ambiguity or bounds", async () => {
    const deepOwners = Object.fromEntries(
      Array.from({ length: 18 }, (_, index) => [
        `src/api/deep/Owner${index}.java`,
        [
          "package api.deep;",
          index === 0
            ? "public class Owner0 { public void execute(int value) {} }"
            : `public class Owner${index} extends Owner${index - 1} {}`
        ].join("\n")
      ])
    );
    const projectPath = await createInlineProject({
      ...deepOwners,
      "src/api/DefaultContract.java": [
        "package api;",
        "public interface DefaultContract {",
        "  default void execute(int value) {}",
        "}"
      ].join("\n"),
      "src/api/DefaultLeaf.java": [
        "package api;",
        "public class DefaultLeaf implements DefaultContract {}"
      ].join("\n"),
      "src/api/SpecificRoot.java": [
        "package api;",
        "public class SpecificRoot {",
        "  public void execute(int value) {}",
        "}"
      ].join("\n"),
      "src/api/SpecificMiddle.java": [
        "package api;",
        "public class SpecificMiddle extends SpecificRoot {",
        "  public void execute(int value) {}",
        "}"
      ].join("\n"),
      "src/api/SpecificLeaf.java": [
        "package api;",
        "public class SpecificLeaf extends SpecificMiddle {}"
      ].join("\n"),
      "src/api/TopContract.java": [
        "package api;",
        "public interface TopContract {",
        "  default void execute(int value) {}",
        "}"
      ].join("\n"),
      "src/api/LeftContract.java": [
        "package api;",
        "public interface LeftContract extends TopContract {}"
      ].join("\n"),
      "src/api/RightContract.java": [
        "package api;",
        "public interface RightContract extends TopContract {}"
      ].join("\n"),
      "src/api/DiamondLeaf.java": [
        "package api;",
        "public class DiamondLeaf implements LeftContract, RightContract {}"
      ].join("\n"),
      "src/api/DirectLeaf.java": [
        "package api;",
        "public class DirectLeaf extends SpecificRoot {",
        "  public void execute(int value) {}",
        "}"
      ].join("\n"),
      "src/api/LeftDefault.java": [
        "package api;",
        "public interface LeftDefault {",
        "  default void execute(int value) {}",
        "}"
      ].join("\n"),
      "src/api/RightDefault.java": [
        "package api;",
        "public interface RightDefault {",
        "  default void execute(int value) {}",
        "}"
      ].join("\n"),
      "src/api/AmbiguousLeaf.java": [
        "package api;",
        "public class AmbiguousLeaf implements LeftDefault, RightDefault {}"
      ].join("\n"),
      "src/api/MalformedContract.java": [
        "package api;",
        "public interface MalformedContract {",
        "  default void broken(",
        "}"
      ].join("\n"),
      "src/api/InvalidDefaultClass.java": [
        "package api;",
        "public class InvalidDefaultClass {",
        "  default void broken() {}",
        "}"
      ].join("\n"),
      "src/factory/OwnerFactory.java": [
        "package factory;",
        "import api.AmbiguousLeaf;",
        "import api.DefaultLeaf;",
        "import api.DiamondLeaf;",
        "import api.DirectLeaf;",
        "import api.SpecificLeaf;",
        "import api.deep.Owner16;",
        "import api.deep.Owner17;",
        "public class OwnerFactory {",
        "  public static DefaultLeaf createDefault() { return null; }",
        "  public static SpecificLeaf createSpecific() { return null; }",
        "  public static DiamondLeaf createDiamond() { return null; }",
        "  public static DirectLeaf createDirect() { return null; }",
        "  public static Owner16 createBoundary() { return null; }",
        "  public static Owner17 createTooDeep() { return null; }",
        "  public static AmbiguousLeaf createAmbiguous() { return null; }",
        "}"
      ].join("\n"),
      "src/app/OwnerRunner.java": [
        "package app;",
        "import factory.OwnerFactory;",
        "public class OwnerRunner {",
        "  public void run() {",
        "    OwnerFactory.createDefault().execute(1);",
        "    OwnerFactory.createSpecific().execute(1);",
        "    OwnerFactory.createDiamond().execute(1);",
        "    OwnerFactory.createDirect().execute(1);",
        "    OwnerFactory.createBoundary().execute(1);",
        "    OwnerFactory.createTooDeep().execute(1);",
        "    OwnerFactory.createAmbiguous().execute(1);",
        "  }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const runnerId = symbol("src/app/OwnerRunner.java#OwnerRunner.run")?.id;
    expect(symbol("src/api/MalformedContract.java#MalformedContract")).toBeUndefined();
    expect(symbol("src/api/InvalidDefaultClass.java#InvalidDefaultClass")).toBeUndefined();
    const calls = snapshot.edges.filter(
      (edge) => edge.kind === "calls" && edge.sourceId === runnerId
    );
    const executeAt = (line: number) =>
      calls.find((edge) => edge.referenceName === "execute" && edge.range.start.line === line);

    expect(
      graphStore
        .getArtifactFacts(projectPath)
        .find((facts) => facts.filePath === "src/api/DefaultContract.java")
        ?.jvmFacts?.javaCallableDeclarations
    ).toEqual([
      expect.objectContaining({ name: "execute", visibility: "public", isStatic: false })
    ]);

    const defaultContractId = symbol("src/api/DefaultContract.java#DefaultContract")?.id;
    expect(executeAt(5)).toMatchObject({
      targetId: symbol("src/api/DefaultContract.java#DefaultContract.execute")?.id,
      evidence: {
        callDispatch: {
          selectionReason: "unique-inherited-owner",
          selectedOwnerTypeSymbolId: defaultContractId,
          candidates: [
            expect.objectContaining({
              ownerTypeSymbolId: defaultContractId,
              distance: 1,
              hierarchyPath: [expect.objectContaining({ relationKind: "implements" })]
            })
          ]
        }
      }
    });

    const specificMiddleId = symbol("src/api/SpecificMiddle.java#SpecificMiddle")?.id;
    const specificRootId = symbol("src/api/SpecificRoot.java#SpecificRoot")?.id;
    expect(executeAt(6)).toMatchObject({
      targetId: symbol("src/api/SpecificMiddle.java#SpecificMiddle.execute")?.id,
      evidence: {
        callDispatch: {
          selectionReason: "owner-specificity",
          selectedOwnerTypeSymbolId: specificMiddleId,
          candidates: expect.arrayContaining([
            expect.objectContaining({ ownerTypeSymbolId: specificMiddleId, distance: 1 }),
            expect.objectContaining({ ownerTypeSymbolId: specificRootId, distance: 2 })
          ])
        }
      }
    });

    const topContractId = symbol("src/api/TopContract.java#TopContract")?.id;
    expect(executeAt(7)).toMatchObject({
      targetId: symbol("src/api/TopContract.java#TopContract.execute")?.id,
      evidence: {
        callDispatch: {
          selectionReason: "unique-inherited-owner",
          selectedOwnerTypeSymbolId: topContractId,
          candidates: [
            expect.objectContaining({
              ownerTypeSymbolId: topContractId,
              distance: 2,
              hierarchyPath: [
                expect.objectContaining({ relationKind: "implements" }),
                expect.objectContaining({ relationKind: "extends", targetSymbolId: topContractId })
              ]
            })
          ]
        }
      }
    });

    const directLeafId = symbol("src/api/DirectLeaf.java#DirectLeaf")?.id;
    expect(executeAt(8)).toMatchObject({
      targetId: symbol("src/api/DirectLeaf.java#DirectLeaf.execute")?.id,
      evidence: {
        callDispatch: {
          selectionReason: "declared-owner",
          receiverTypeSymbolId: directLeafId,
          selectedOwnerTypeSymbolId: directLeafId,
          candidates: expect.arrayContaining([
            expect.objectContaining({
              ownerTypeSymbolId: directLeafId,
              ownerTypeKind: "class",
              distance: 0,
              hierarchyPath: []
            })
          ])
        }
      }
    });

    expect(executeAt(9)).toMatchObject({
      targetId: symbol("src/api/deep/Owner0.java#Owner0.execute")?.id,
      evidence: {
        callDispatch: {
          hierarchyBounds: { maximumDepth: 16, maximumVisitedTypes: 256 },
          candidates: [expect.objectContaining({ distance: 16 })]
        }
      }
    });
    expect(executeAt(10)).toBeUndefined();
    expect(executeAt(11)).toBeUndefined();
  });

  it("builds a Java method set across direct and inherited overloads with class precedence", async () => {
    const projectPath = await createInlineProject({
      "src/api/ClassBase.java": [
        "package api;",
        "public class ClassBase {",
        "  public void execute(int value) {}",
        "}"
      ].join("\n"),
      "src/api/DefaultContract.java": [
        "package api;",
        "public interface DefaultContract {",
        "  default void execute(int value) {}",
        "}"
      ].join("\n"),
      "src/api/MixedLeaf.java": [
        "package api;",
        "public class MixedLeaf extends ClassBase implements DefaultContract {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/api/LeftContract.java": [
        "package api;",
        "public interface LeftContract { void execute(long value); }"
      ].join("\n"),
      "src/api/RightContract.java": [
        "package api;",
        "public interface RightContract { void execute(long value); }"
      ].join("\n"),
      "src/api/ConflictLeaf.java": [
        "package api;",
        "public abstract class ConflictLeaf implements LeftContract, RightContract {",
        "  public void execute(String value) {}",
        "}"
      ].join("\n"),
      "src/factory/MixedFactory.java": [
        "package factory;",
        "import api.ConflictLeaf;",
        "import api.MixedLeaf;",
        "public class MixedFactory {",
        "  public static MixedLeaf create() { return null; }",
        "  public static ConflictLeaf createConflict() { return null; }",
        "}"
      ].join("\n"),
      "src/app/MixedRunner.java": [
        "package app;",
        "import factory.MixedFactory;",
        "public class MixedRunner {",
        "  public void run() {",
        "    MixedFactory.create().execute(1);",
        "    MixedFactory.create().execute(\"direct\");",
        "    MixedFactory.createConflict().execute(1L);",
        "    MixedFactory.createConflict().execute(\"safe\");",
        "  }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const runnerId = symbol("src/app/MixedRunner.java#MixedRunner.run")?.id;
    const mixedLeafId = symbol("src/api/MixedLeaf.java#MixedLeaf")?.id;
    const classBaseId = symbol("src/api/ClassBase.java#ClassBase")?.id;
    const defaultContractId = symbol("src/api/DefaultContract.java#DefaultContract")?.id;
    const calls = snapshot.edges.filter(
      (edge) => edge.kind === "calls" && edge.sourceId === runnerId
    );
    const executeAt = (line: number) =>
      calls.find((edge) => edge.referenceName === "execute" && edge.range.start.line === line);

    expect(executeAt(5)).toMatchObject({
      targetId: symbol("src/api/ClassBase.java#ClassBase.execute")?.id,
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-type.inherited-return-dispatch",
        callDispatch: {
          selectionPolicy: "java-source-method-set-v4",
          selectionReason: "class-precedence",
          receiverTypeSymbolId: mixedLeafId,
          selectedOwnerTypeSymbolId: classBaseId,
          selectedSignature: {
            invocationMode: "fixed",
            parameterTypes: ["primitive:int"]
          },
          candidates: expect.arrayContaining([
            expect.objectContaining({
              ownerTypeSymbolId: classBaseId,
              ownerTypeKind: "class",
              distance: 1
            }),
            expect.objectContaining({
              ownerTypeSymbolId: defaultContractId,
              ownerTypeKind: "interface",
              distance: 1
            })
          ])
        }
      }
    });
    expect(executeAt(6)).toMatchObject({
      targetId: symbol("src/api/MixedLeaf.java#MixedLeaf.execute")?.id,
      evidence: {
        ruleId: "call.java.chained-factory.explicit-import.arity-type.return-dispatch",
        callDispatch: {
          selectionPolicy: "java-source-method-set-v4",
          selectionReason: "declared-owner",
          receiverTypeSymbolId: mixedLeafId,
          selectedOwnerTypeSymbolId: mixedLeafId,
          selectedSignature: {
            invocationMode: "fixed",
            parameterTypes: ["reference:java.lang.String"]
          },
          candidates: [
            expect.objectContaining({
              ownerTypeSymbolId: mixedLeafId,
              ownerTypeKind: "class",
              distance: 0,
              hierarchyPath: []
            })
          ]
        }
      }
    });
    expect(executeAt(7)).toBeUndefined();
    expect(executeAt(8)).toMatchObject({
      targetId: symbol("src/api/ConflictLeaf.java#ConflictLeaf.execute")?.id,
      evidence: {
        callDispatch: {
          selectionPolicy: "java-source-method-set-v4",
          selectionReason: "declared-owner",
          selectedOwnerTypeSymbolId: symbol("src/api/ConflictLeaf.java#ConflictLeaf")?.id,
          selectedSignature: {
            invocationMode: "fixed",
            parameterTypes: ["reference:java.lang.String"],
            complete: true
          }
        }
      }
    });
  });

  it("does not inherit a Java interface static method into a factory return dispatch", async () => {
    const projectPath = await createInlineProject({
      "src/api/StaticContract.java": [
        "package api;",
        "public interface StaticContract {",
        "  static void execute(int value) {}",
        "}"
      ].join("\n"),
      "src/api/StaticLeaf.java": [
        "package api;",
        "public class StaticLeaf implements StaticContract {}"
      ].join("\n"),
      "src/factory/StaticFactory.java": [
        "package factory;",
        "import api.StaticLeaf;",
        "public class StaticFactory {",
        "  public static StaticLeaf create() { return null; }",
        "}"
      ].join("\n"),
      "src/app/StaticRunner.java": [
        "package app;",
        "import factory.StaticFactory;",
        "public class StaticRunner {",
        "  public void run() { StaticFactory.create().execute(1); }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const runnerId = snapshot.symbols.find(
      (candidate) => candidate.qualifiedName === "src/app/StaticRunner.java#StaticRunner.run"
    )?.id;
    expect(
      snapshot.edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.sourceId === runnerId &&
          edge.referenceName === "execute"
      )
    ).toBeUndefined();
  });

  it("does not project inaccessible Java methods through a factory return type", async () => {
    const projectPath = await createInlineProject({
      "src/api/PrivateBase.java": [
        "package api;",
        "public class PrivateBase { private void execute(int value) {} }"
      ].join("\n"),
      "src/api/PrivateLeaf.java": [
        "package api;",
        "public class PrivateLeaf extends PrivateBase {}"
      ].join("\n"),
      "src/api/DirectPrivateLeaf.java": [
        "package api;",
        "public class DirectPrivateLeaf { private void execute(int value) {} }"
      ].join("\n"),
      "src/factory/PrivateFactory.java": [
        "package factory;",
        "import api.DirectPrivateLeaf;",
        "import api.PrivateLeaf;",
        "public class PrivateFactory {",
        "  public static PrivateLeaf createInherited() { return null; }",
        "  public static DirectPrivateLeaf createDirect() { return null; }",
        "}"
      ].join("\n"),
      "src/app/PrivateRunner.java": [
        "package app;",
        "import factory.PrivateFactory;",
        "public class PrivateRunner {",
        "  public void run() {",
        "    PrivateFactory.createInherited().execute(1);",
        "    PrivateFactory.createDirect().execute(1);",
        "  }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const runnerId = snapshot.symbols.find(
      (candidate) => candidate.qualifiedName === "src/app/PrivateRunner.java#PrivateRunner.run"
    )?.id;
    expect(
      graphStore
        .getArtifactFacts(projectPath)
        .find((facts) => facts.filePath === "src/api/PrivateBase.java")
        ?.jvmFacts?.javaCallableDeclarations
    ).toEqual([
      expect.objectContaining({ name: "execute", visibility: "private" })
    ]);
    expect(
      snapshot.edges.filter(
        (edge) =>
          edge.kind === "calls" &&
          edge.sourceId === runnerId &&
          edge.referenceName === "execute"
      )
    ).toEqual([]);
  });

  it("enforces Java package and protected caller-context access on factory return dispatch", async () => {
    const projectPath = await createInlineProject({
      "src/shared/PackageBase.java": [
        "package shared;",
        "public class PackageBase { void packageExecute(int value) {} }"
      ].join("\n"),
      "src/shared/PackageLeaf.java": [
        "package shared;",
        "public class PackageLeaf extends PackageBase {}"
      ].join("\n"),
      "src/shared/PackageFactory.java": [
        "package shared;",
        "import foreign.ForeignLeaf;",
        "public class PackageFactory {",
        "  public static PackageLeaf create() { return null; }",
        "  public static ForeignLeaf createForeign() { return null; }",
        "}"
      ].join("\n"),
      "src/shared/PackageRunner.java": [
        "package shared;",
        "public class PackageRunner {",
        "  public void run() {",
        "    PackageFactory.create().packageExecute(1);",
        "    PackageFactory.createForeign().packageExecute(1);",
        "  }",
        "}"
      ].join("\n"),
      "src/foreign/ForeignLeaf.java": [
        "package foreign;",
        "import shared.PackageBase;",
        "public class ForeignLeaf extends PackageBase {}"
      ].join("\n"),
      "src/base/ProtectedBase.java": [
        "package base;",
        "public class ProtectedBase { protected void protectedExecute(int value) {} }"
      ].join("\n"),
      "src/base/SiblingLeaf.java": [
        "package base;",
        "public class SiblingLeaf extends ProtectedBase {}"
      ].join("\n"),
      "src/base/BaseFactory.java": [
        "package base;",
        "public class BaseFactory {",
        "  public static ProtectedBase createSamePackage() { return null; }",
        "}"
      ].join("\n"),
      "src/base/BaseRunner.java": [
        "package base;",
        "public class BaseRunner {",
        "  public void run() { BaseFactory.createSamePackage().protectedExecute(1); }",
        "}"
      ].join("\n"),
      "src/factory/AccessFactory.java": [
        "package factory;",
        "import app.ProtectedChild;",
        "import app.ProtectedRunner;",
        "import base.SiblingLeaf;",
        "public class AccessFactory {",
        "  public static ProtectedRunner createAllowed() { return null; }",
        "  public static ProtectedChild createAllowedChild() { return null; }",
        "  public static SiblingLeaf createWrongReceiver() { return null; }",
        "}"
      ].join("\n"),
      "src/app/ProtectedChild.java": [
        "package app;",
        "public class ProtectedChild extends ProtectedRunner {}"
      ].join("\n"),
      "src/app/ProtectedRunner.java": [
        "package app;",
        "import base.ProtectedBase;",
        "import factory.AccessFactory;",
        "public class ProtectedRunner extends ProtectedBase {",
        "  public void run() {",
        "    AccessFactory.createAllowed().protectedExecute(1);",
        "    AccessFactory.createAllowedChild().protectedExecute(1);",
        "    AccessFactory.createWrongReceiver().protectedExecute(1);",
        "  }",
        "}"
      ].join("\n"),
      "src/app/OutsiderRunner.java": [
        "package app;",
        "import base.BaseFactory;",
        "public class OutsiderRunner {",
        "  public void run() { BaseFactory.createSamePackage().protectedExecute(1); }",
        "}"
      ].join("\n"),
      "src/app/PackageOutsider.java": [
        "package app;",
        "import shared.PackageFactory;",
        "public class PackageOutsider {",
        "  public void run() { PackageFactory.create().packageExecute(1); }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const executeCall = (sourceQualifiedName: string, line?: number) =>
      snapshot.edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.sourceId === symbol(sourceQualifiedName)?.id &&
          (line === undefined || edge.range.start.line === line) &&
          (edge.referenceName === "packageExecute" || edge.referenceName === "protectedExecute")
      );

    expect(executeCall("src/shared/PackageRunner.java#PackageRunner.run", 4)).toMatchObject({
      targetId: symbol("src/shared/PackageBase.java#PackageBase.packageExecute")?.id,
      evidence: {
        callDispatch: {
          access: {
            policy: "java-source-access-v1",
            visibility: "package",
            decision: "same-package",
            callerTypeSymbolId: symbol("src/shared/PackageRunner.java#PackageRunner")?.id,
            ownerTypeSymbolId: symbol("src/shared/PackageBase.java#PackageBase")?.id,
            callerToOwnerPath: [],
            receiverToCallerPath: []
          }
        }
      }
    });
    expect(executeCall("src/shared/PackageRunner.java#PackageRunner.run", 5)).toBeUndefined();
    expect(executeCall("src/base/BaseRunner.java#BaseRunner.run")).toMatchObject({
      targetId: symbol("src/base/ProtectedBase.java#ProtectedBase.protectedExecute")?.id,
      evidence: {
        callDispatch: {
          access: {
            policy: "java-source-access-v1",
            visibility: "protected",
            decision: "same-package"
          }
        }
      }
    });
    expect(executeCall("src/app/ProtectedRunner.java#ProtectedRunner.run", 6)).toMatchObject({
      targetId: symbol("src/base/ProtectedBase.java#ProtectedBase.protectedExecute")?.id,
      evidence: {
        callDispatch: {
          access: {
            policy: "java-source-access-v1",
            visibility: "protected",
            decision: "protected-subclass-receiver",
            callerTypeSymbolId: symbol("src/app/ProtectedRunner.java#ProtectedRunner")?.id,
            ownerTypeSymbolId: symbol("src/base/ProtectedBase.java#ProtectedBase")?.id,
            callerToOwnerPath: [expect.objectContaining({ relationKind: "extends" })],
            receiverToCallerPath: []
          }
        }
      }
    });
    expect(executeCall("src/app/ProtectedRunner.java#ProtectedRunner.run", 7)).toMatchObject({
      targetId: symbol("src/base/ProtectedBase.java#ProtectedBase.protectedExecute")?.id,
      evidence: {
        callDispatch: {
          access: {
            decision: "protected-subclass-receiver",
            receiverToCallerPath: [expect.objectContaining({ relationKind: "extends" })]
          }
        }
      }
    });
    expect(executeCall("src/app/ProtectedRunner.java#ProtectedRunner.run", 8)).toBeUndefined();
    expect(executeCall("src/app/OutsiderRunner.java#OutsiderRunner.run")).toBeUndefined();
    expect(executeCall("src/app/PackageOutsider.java#PackageOutsider.run")).toBeUndefined();
  });

  it("projects unique cross-file JVM DI types without claiming runtime provider selection", async () => {
    const projectPath = await createInlineProject({
      "src/java/app/services/PetService.java": [
        "package app.services;",
        "public class PetService {}"
      ].join("\n"),
      "src/java/app/services/LegacyService.java": [
        "package app.services;",
        "public class LegacyService {}"
      ].join("\n"),
      "src/java/app/web/PetController.java": [
        "package app.web;",
        "import org.springframework.beans.factory.annotation.Autowired;",
        "import app.services.PetService;",
        "public class PetController {",
        "  @Autowired PetController(PetService pets) {}",
        "}"
      ].join("\n"),
      "src/java/app/web/SetterController.java": [
        "package app.web;",
        "import org.springframework.beans.factory.annotation.Autowired;",
        "import app.services.LegacyService;",
        "import app.services.PetService;",
        "public class SetterController {",
        "  @Autowired void setServices(LegacyService legacy, PetService pets) {}",
        "}"
      ].join("\n"),
      "src/java/app/web/QualifiedController.java": [
        "package app.web;",
        "public class QualifiedController {",
        "  @javax.inject.Inject QualifiedController(app.services.LegacyService legacy) {}",
        "}"
      ].join("\n"),
      "src/java/app/web/ResourceController.java": [
        "package app.web;",
        "import jakarta.annotation.Resource;",
        "import app.services.PetService;",
        "import app.services.LegacyService;",
        "public class ResourceController {",
        "  @Resource PetService pets;",
        "  @Resource() void setLegacy(LegacyService legacy) {}",
        "  @Resource void update(PetService ignored) {}",
        "  @Resource(name = \"named\") PetService named;",
        "}"
      ].join("\n"),
      "src/kotlin/app/services/AuditService.kt": [
        "package app.services",
        "class AuditService"
      ].join("\n"),
      "src/kotlin/app/services/EventService.kt": [
        "package app.services",
        "class EventService"
      ].join("\n"),
      "src/kotlin/app/web/AuditController.kt": [
        "package app.web",
        "import jakarta.inject.Inject",
        "import app.services.AuditService",
        "class AuditController @Inject constructor(private val audit: AuditService)"
      ].join("\n"),
      "src/kotlin/app/web/MethodController.kt": [
        "package app.web",
        "import jakarta.inject.Inject",
        "import app.services.AuditService",
        "import app.services.EventService",
        "class MethodController {",
        "  @Inject fun setServices(audit: AuditService, events: EventService): Unit {}",
        "}"
      ].join("\n"),
      "src/kotlin/app/web/UseSiteController.kt": [
        "package app.web",
        "import org.springframework.beans.factory.annotation.Autowired",
        "import jakarta.inject.Inject",
        "import app.services.AuditService",
        "import app.services.EventService",
        "class UseSiteController {",
        "  @field:Autowired lateinit var audit: AuditService",
        "  @set:Inject lateinit var events: EventService",
        "  @get:Autowired val ignored: EventService = TODO()",
        "}"
      ].join("\n"),
      "src/kotlin/app/web/ResourceController.kt": [
        "package app.web",
        "import jakarta.annotation.Resource",
        "import app.services.AuditService",
        "import app.services.EventService",
        "class ResourceController {",
        "  @field:Resource() lateinit var audit: AuditService",
        "  @set:Resource lateinit var events: EventService",
        "  @get:Resource val ignored: EventService = TODO()",
        "  @Resource(name = \"named\") lateinit var named: AuditService",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    expect(await service.init({ projectPath })).toMatchObject({ stale: false });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const injectionEdge = (sourceQualifiedName: string) =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === "references"
      );
    const injectionEdges = (sourceQualifiedName: string) =>
      snapshot.edges.filter(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === "references"
      );

    expect(injectionEdge("src/java/app/web/PetController.java#PetController")).toMatchObject({
      targetId: symbol("src/java/app/services/PetService.java#PetService")?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.jvm-di.spring-autowired-constructor.explicit-import.local-type",
        stage: "module"
      }
    });
    expect(injectionEdge("src/java/app/web/QualifiedController.java#QualifiedController")).toMatchObject({
      targetId: symbol("src/java/app/services/LegacyService.java#LegacyService")?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.jvm-di.javax-inject-constructor.qualified-type.local-type",
        stage: "module"
      }
    });
    expect(injectionEdges("src/java/app/web/SetterController.java#SetterController")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: symbol("src/java/app/services/LegacyService.java#LegacyService")?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.jvm-di.spring-autowired-method.explicit-import.local-type",
            stage: "module"
          })
        }),
        expect.objectContaining({
          targetId: symbol("src/java/app/services/PetService.java#PetService")?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.jvm-di.spring-autowired-method.explicit-import.local-type",
            stage: "module"
          })
        })
      ])
    );
    expect(injectionEdges("src/java/app/web/SetterController.java#SetterController")).toHaveLength(2);
    expect(injectionEdge("src/kotlin/app/web/AuditController.kt#AuditController")).toMatchObject({
      targetId: symbol("src/kotlin/app/services/AuditService.kt#AuditService")?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.jvm-di.jakarta-inject-constructor.explicit-import.local-type",
        stage: "module"
      }
    });
    expect(injectionEdges("src/kotlin/app/web/MethodController.kt#MethodController")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: symbol("src/kotlin/app/services/AuditService.kt#AuditService")?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.jvm-di.jakarta-inject-method.explicit-import.local-type",
            stage: "module"
          })
        }),
        expect.objectContaining({
          targetId: symbol("src/kotlin/app/services/EventService.kt#EventService")?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.jvm-di.jakarta-inject-method.explicit-import.local-type",
            stage: "module"
          })
        })
      ])
    );
    expect(injectionEdges("src/kotlin/app/web/MethodController.kt#MethodController")).toHaveLength(2);
    expect(injectionEdges("src/kotlin/app/web/UseSiteController.kt#UseSiteController")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: symbol("src/kotlin/app/services/AuditService.kt#AuditService")?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.jvm-di.spring-autowired-field.explicit-import.local-type",
            stage: "module"
          })
        }),
        expect.objectContaining({
          targetId: symbol("src/kotlin/app/services/EventService.kt#EventService")?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.jvm-di.jakarta-inject-setter.explicit-import.local-type",
            stage: "module"
          })
        })
      ])
    );
    expect(injectionEdges("src/kotlin/app/web/UseSiteController.kt#UseSiteController")).toHaveLength(2);
    expect(injectionEdges("src/java/app/web/ResourceController.java#ResourceController")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: symbol("src/java/app/services/PetService.java#PetService")?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.jvm-di.jakarta-resource-field.explicit-import.local-type",
            stage: "module"
          })
        }),
        expect.objectContaining({
          targetId: symbol("src/java/app/services/LegacyService.java#LegacyService")?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.jvm-di.jakarta-resource-setter.explicit-import.local-type",
            stage: "module"
          })
        })
      ])
    );
    expect(injectionEdges("src/java/app/web/ResourceController.java#ResourceController")).toHaveLength(2);
    expect(injectionEdges("src/kotlin/app/web/ResourceController.kt#ResourceController")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: symbol("src/kotlin/app/services/AuditService.kt#AuditService")?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.jvm-di.jakarta-resource-field.explicit-import.local-type",
            stage: "module"
          })
        }),
        expect.objectContaining({
          targetId: symbol("src/kotlin/app/services/EventService.kt#EventService")?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.jvm-di.jakarta-resource-setter.explicit-import.local-type",
            stage: "module"
          })
        })
      ])
    );
    expect(injectionEdges("src/kotlin/app/web/ResourceController.kt#ResourceController")).toHaveLength(2);

    const javaFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/java/app/web/PetController.java");
    const kotlinFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/kotlin/app/web/AuditController.kt");
    expect(javaFacts?.jvmFacts?.dependencyInjectionReferences).toEqual([
      expect.objectContaining({
        sourceId: symbol("src/java/app/web/PetController.java#PetController")?.id,
        referenceName: "PetService",
        importedTypePath: "app.services.PetService",
        syntax: "spring-autowired-constructor"
      })
    ]);
    expect(kotlinFacts?.jvmFacts?.dependencyInjectionReferences).toEqual([
      expect.objectContaining({
        sourceId: symbol("src/kotlin/app/web/AuditController.kt#AuditController")?.id,
        referenceName: "AuditService",
        importedTypePath: "app.services.AuditService",
        syntax: "jakarta-inject-constructor"
      })
    ]);

    await writeFile(
      join(projectPath, "src", "java", "app", "web", "PetController.java"),
      [
        "package app.web;",
        "import app.services.PetService;",
        "public class PetController {",
        "  PetController(PetService pets) {}",
        "}"
      ].join("\n"),
      "utf8"
    );
    expect(await service.getStatus(projectPath)).toMatchObject({ stale: true });
    expect(await service.sync({ projectPath })).toMatchObject({ stale: false });
    const refreshed = graphStore.getSnapshot(projectPath);
    const refreshedController = refreshed.symbols.find(
      (candidate) => candidate.qualifiedName === "src/java/app/web/PetController.java#PetController"
    );
    expect(
      refreshed.edges.find(
        (edge) => edge.sourceId === refreshedController?.id && edge.kind === "references"
      )
    ).toBeUndefined();

    await writeFile(
      join(projectPath, "src", "java", "app", "web", "SetterController.java"),
      [
        "package app.web;",
        "import app.services.LegacyService;",
        "import app.services.PetService;",
        "public class SetterController {",
        "  void setServices(LegacyService legacy, PetService pets) {}",
        "}"
      ].join("\n"),
      "utf8"
    );
    expect(await service.getStatus(projectPath)).toMatchObject({ stale: true });
    expect(await service.sync({ projectPath })).toMatchObject({ stale: false });
    const refreshedSetter = graphStore
      .getSnapshot(projectPath)
      .symbols.find(
        (candidate) => candidate.qualifiedName === "src/java/app/web/SetterController.java#SetterController"
      );
    expect(
      graphStore
        .getSnapshot(projectPath)
        .edges.find((edge) => edge.sourceId === refreshedSetter?.id && edge.kind === "references")
    ).toBeUndefined();
  });

  it("uses Maven module evidence during init to block unproven same-package cross-module parents", async () => {
    const projectPath = await createInlineProject({
      "pom.xml": "<project><modules><module>api</module><module>app</module></modules></project>\n",
      "api/pom.xml": "<project />\n",
      "app/pom.xml": "<project />\n",
      "api/src/main/java/example/shared/Shared.java": [
        "package example.shared;",
        "public interface Shared { void run(); }"
      ].join("\n"),
      "api/src/test/java/example/shared/TestChild.java": [
        "package example.shared;",
        "public class TestChild implements Shared { public void run() {} }"
      ].join("\n"),
      "app/src/main/java/example/shared/CrossModuleChild.java": [
        "package example.shared;",
        "public class CrossModuleChild implements Shared { public void run() {} }"
      ].join("\n"),
      "api/src/main/java/example/api/ImportedContract.java": [
        "package example.api;",
        "public interface ImportedContract {}"
      ].join("\n"),
      "app/src/main/java/example/app/ImportedChild.java": [
        "package example.app;",
        "import example.api.ImportedContract;",
        "public class ImportedChild implements ImportedContract {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const implementsEdge = (sourceQualifiedName: string) =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === "implements"
      );

    expect(indexed).toMatchObject({ stale: false });
    expect(
      implementsEdge("app/src/main/java/example/shared/CrossModuleChild.java#CrossModuleChild")
    ).toBeUndefined();
    expect(implementsEdge("api/src/test/java/example/shared/TestChild.java#TestChild")).toMatchObject({
      targetId: symbol("api/src/main/java/example/shared/Shared.java#Shared")?.id,
      resolution: "exact",
      evidence: {
        ruleId: "syntax.jvm.cross-file.same-package.direct-implements",
        configurationPaths: ["api/pom.xml", "pom.xml"]
      }
    });
    expect(implementsEdge("app/src/main/java/example/app/ImportedChild.java#ImportedChild")).toMatchObject({
      targetId: symbol("api/src/main/java/example/api/ImportedContract.java#ImportedContract")?.id,
      resolution: "exact",
      evidence: { ruleId: "syntax.jvm.cross-file.explicit-import.direct-implements" }
    });

    await writeFile(join(projectPath, "app", "pom.xml"), "<project><name>changed-app</name></project>\n", "utf8");
    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: expect.arrayContaining(["project-inputs-changed"])
    });
  });

  it("persists direct Maven module dependency evidence for syntax-proven JVM parents", async () => {
    const projectPath = await createInlineProject({
      "pom.xml": [
        "<project>",
        "  <groupId>example</groupId>",
        "  <artifactId>root</artifactId>",
        "  <modules><module>api</module><module>app</module></modules>",
        "</project>"
      ].join("\n"),
      "api/pom.xml": [
        "<project>",
        "  <parent><groupId>example</groupId><artifactId>root</artifactId></parent>",
        "  <artifactId>api</artifactId>",
        "</project>"
      ].join("\n"),
      "app/pom.xml": [
        "<project>",
        "  <parent><groupId>example</groupId><artifactId>root</artifactId></parent>",
        "  <artifactId>app</artifactId>",
        "  <dependencies>",
        "    <dependency><groupId>example</groupId><artifactId>api</artifactId></dependency>",
        "  </dependencies>",
        "</project>"
      ].join("\n"),
      "api/src/main/java/example/api/Contract.java": [
        "package example.api;",
        "public interface Contract {}"
      ].join("\n"),
      "app/src/main/java/example/app/ImportedChild.java": [
        "package example.app;",
        "import example.api.Contract;",
        "public class ImportedChild implements Contract {}"
      ].join("\n"),
      "app/src/main/java/example/app/InjectedClient.java": [
        "package example.app;",
        "import org.springframework.beans.factory.annotation.Autowired;",
        "import example.api.Contract;",
        "public class InjectedClient {",
        "  @Autowired void setContract(Contract contract) {}",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    expect(await service.init({ projectPath })).toMatchObject({ stale: false });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const implementsEdge = snapshot.edges.find(
      (edge) =>
        edge.sourceId === symbol("app/src/main/java/example/app/ImportedChild.java#ImportedChild")?.id &&
        edge.kind === "implements"
    );
    const injectionEdge = snapshot.edges.find(
      (edge) =>
        edge.sourceId === symbol("app/src/main/java/example/app/InjectedClient.java#InjectedClient")?.id &&
        edge.kind === "references"
    );
    const configurationPaths = ["api/pom.xml", "app/pom.xml", "pom.xml"];

    expect(implementsEdge).toMatchObject({
      targetId: symbol("api/src/main/java/example/api/Contract.java#Contract")?.id,
      resolution: "exact",
      evidence: {
        ruleId: "syntax.jvm.cross-file.explicit-import.declared-maven-module.direct-implements",
        configurationPaths
      }
    });
    expect(injectionEdge).toMatchObject({
      targetId: symbol("api/src/main/java/example/api/Contract.java#Contract")?.id,
      resolution: "exact",
      evidence: {
        ruleId: "framework.jvm-di.spring-autowired-method.explicit-import.declared-maven-module.local-type",
        configurationPaths
      }
    });

    await writeFile(
      join(projectPath, "app", "pom.xml"),
      [
        "<project>",
        "  <parent><groupId>example</groupId><artifactId>root</artifactId></parent>",
        "  <artifactId>app</artifactId>",
        "  <!-- changed -->",
        "</project>"
      ].join("\n"),
      "utf8"
    );
    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: expect.arrayContaining(["project-inputs-changed"])
    });
  });

  it("persists direct Gradle project dependency evidence for syntax-proven JVM parents", async () => {
    const projectPath = await createInlineProject({
      "settings.gradle.kts": 'include(":api", ":app")\n',
      "api/build.gradle.kts": "plugins {}\n",
      "app/build.gradle.kts": [
        "plugins {}",
        "dependencies {",
        '  implementation(project(":api"))',
        "  testImplementation project(':api')",
        "}"
      ].join("\n"),
      "api/src/main/java/example/api/Contract.java": [
        "package example.api;",
        "public interface Contract {}"
      ].join("\n"),
      "app/src/main/java/example/app/ImportedChild.java": [
        "package example.app;",
        "import example.api.Contract;",
        "public class ImportedChild implements Contract {}"
      ].join("\n"),
      "app/src/main/java/example/app/InjectedClient.java": [
        "package example.app;",
        "import org.springframework.beans.factory.annotation.Autowired;",
        "import example.api.Contract;",
        "public class InjectedClient {",
        "  @Autowired void setContract(Contract contract) {}",
        "}"
      ].join("\n"),
      "app/src/test/java/example/app/QualifiedTestChild.java": [
        "package example.app;",
        "public class QualifiedTestChild implements example.api.Contract {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    expect(await service.init({ projectPath })).toMatchObject({ stale: false });
    const snapshot = graphStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const implementsEdge = (sourceQualifiedName: string) =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === "implements"
      );
    const injectionEdge = snapshot.edges.find(
      (edge) =>
        edge.sourceId === symbol("app/src/main/java/example/app/InjectedClient.java#InjectedClient")?.id &&
        edge.kind === "references"
    );
    const configurationPaths = ["api/build.gradle.kts", "app/build.gradle.kts", "settings.gradle.kts"];

    expect(implementsEdge("app/src/main/java/example/app/ImportedChild.java#ImportedChild")).toMatchObject({
      targetId: symbol("api/src/main/java/example/api/Contract.java#Contract")?.id,
      resolution: "exact",
      evidence: {
        ruleId: "syntax.jvm.cross-file.explicit-import.declared-gradle-project.direct-implements",
        configurationPaths
      }
    });
    expect(
      implementsEdge("app/src/test/java/example/app/QualifiedTestChild.java#QualifiedTestChild")
    ).toMatchObject({
      targetId: symbol("api/src/main/java/example/api/Contract.java#Contract")?.id,
      resolution: "exact",
      evidence: {
        ruleId: "syntax.jvm.cross-file.qualified-type.declared-gradle-project.direct-implements",
        configurationPaths
      }
    });
    expect(injectionEdge).toMatchObject({
      targetId: symbol("api/src/main/java/example/api/Contract.java#Contract")?.id,
      resolution: "exact",
      evidence: {
        ruleId: "framework.jvm-di.spring-autowired-method.explicit-import.declared-gradle-project.local-type",
        configurationPaths
      }
    });

    await writeFile(
      join(projectPath, "app", "build.gradle.kts"),
      ["plugins {}", "dependencies {", '  implementation(project(":api"))', "  // changed", "}"].join("\n"),
      "utf8"
    );
    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: expect.arrayContaining(["project-inputs-changed"])
    });
  });

  it("bounds selected investigation declaration source without reading live files", async () => {
    const padding = Array.from(
      { length: NODE_SOURCE_LINE_LIMIT },
      (_value, index) => `  const evidence${index} = ${index};`
    );
    const projectPath = await createInlineProject({
      "src/bounded-investigation.ts": [
        "export function boundedInvestigationTarget(): number {",
        ...padding,
        "  return 1;",
        "}",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.investigate(projectPath, "boundedInvestigationTarget");
    const source = result.declarations[0]?.source;
    if (source === null || source === undefined) {
      throw new Error("Expected bounded declaration source.");
    }

    expect(result.bounds.declarationSource).toEqual({
      sourceLineLimit: NODE_SOURCE_LINE_LIMIT,
      sourceCharacterLimit: NODE_SOURCE_CHARACTER_LIMIT,
      totalCharacterBudget: 24_000,
      minimumTotalCharacterBudget: 2_048,
      maximumTotalCharacterBudget: 64_000,
      allocationPolicy: "proportional-source-v1",
      renderPolicy: "evidence-slice-v1",
      requestedRenderMode: "adaptive"
    });
    expect(result.declarations[0]).toMatchObject({
      reference: "src/bounded-investigation.ts#boundedInvestigationTarget",
      sourceAvailability: "active-generation"
    });
    expect(source).toMatchObject({ truncated: true });
    expect(source.totalLines).toBeGreaterThan(NODE_SOURCE_LINE_LIMIT);
    expect(source.text).toContain("boundedInvestigationTarget");
    expect(source.text).not.toContain("return 1;");
  });

  it("reads a bounded persisted file view with symbols, exact dependents, and secret-safe formats", async () => {
    const projectPath = await createInlineProject({
      "src/target.ts": [
        "export function persistedTarget(): string {",
        '  return "indexed evidence";',
        "}",
        ""
      ].join("\n"),
      "src/consumer.ts": [
        'import { persistedTarget } from "./target.js";',
        "export const consumed = persistedTarget();",
        ""
      ].join("\n"),
      "config/application.yaml": "token: SUPERSECRET123\n"
    });
    const service = createService();
    await service.init({ projectPath });
    await writeFile(
      join(projectPath, "src", "target.ts"),
      'export function liveReplacement(): string { return "live only"; }\n',
      "utf8"
    );

    const result = await service.fileView(projectPath, ".\\src\\target.ts", {
      offset: 2,
      limit: 2
    });

    expect(result).toMatchObject({
      status: { stale: true, staleReasons: ["source-files-changed"] },
      selection: {
        requestedPath: ".\\src\\target.ts",
        filePath: "src/target.ts",
        source: "active-generation",
        resolution: "exact-path"
      },
      bounds: {
        offset: 2,
        limit: 2,
        totalLines: 4,
        returnedLines: 2,
        truncatedBefore: true,
        truncatedAfter: true
      },
      contentAvailability: "active-generation",
      lines: [
        { line: 2, text: '  return "indexed evidence";' },
        { line: 3, text: "}" }
      ]
    });
    expect(result.symbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "persistedTarget", kind: "function" })])
    );
    expect(result.dependents).toEqual([
      { filePath: "src/consumer.ts", edgeKinds: ["imports"], edgeCount: 1 }
    ]);
    expect(JSON.stringify(result)).not.toContain("liveReplacement");

    await expect(
      service.fileView(projectPath, "src/target.ts", { offset: 99 })
    ).rejects.toMatchObject({
      code: "FILE_VIEW_OFFSET_PAST_END",
      message: expect.stringMatching(/offset 99.*4 lines/u)
    });
    await expect(
      service.fileView(projectPath, "src/target.ts", { offset: 99, symbolsOnly: true })
    ).resolves.toMatchObject({ contentAvailability: "symbols-only", lines: [] });

    const hidden = await service.fileView(projectPath, "config/application.yaml");
    expect(hidden).toMatchObject({
      contentAvailability: "withheld-sensitive-format",
      lines: []
    });
    expect(JSON.stringify(hidden)).not.toContain("SUPERSECRET123");
    await expect(service.fileView(projectPath, "../outside.ts")).rejects.toMatchObject({
      code: "INVALID_FILE_VIEW_PATH"
    });
  });

  it("maps normalized CRLF file-view text back to exact persisted UTF-16 offsets", async () => {
    const sourceText = `${"a".repeat(200)}\r\n${"b".repeat(200)}`;
    const projectPath = await createInlineProject({ "src/crlf.ts": sourceText });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.fileView(projectPath, "src/crlf.ts", { offset: 1, limit: 2 });

    expect(result.lines).toEqual([
      { line: 1, text: "a".repeat(200) },
      { line: 2, text: "b".repeat(200) }
    ]);
    expect(result.sourceIdentity).toMatchObject({
      policy: "source-delivery-v2",
      fullFileCharacterOffsets: { start: 0, end: sourceText.length },
      offsetMap: {
        policy: "source-delivery-offset-map-v1",
        deliveredTextLength: 401,
        sourceTextLength: 402,
        spans: [
          {
            kind: "identity",
            deliveredCharacterOffsets: { start: 0, end: 200 },
            fullFileCharacterOffsets: { start: 0, end: 200 }
          },
          {
            kind: "normalized-line-ending",
            deliveredCharacterOffsets: { start: 200, end: 201 },
            fullFileCharacterOffsets: { start: 200, end: 202 }
          },
          {
            kind: "identity",
            deliveredCharacterOffsets: { start: 201, end: 401 },
            fullFileCharacterOffsets: { start: 202, end: 402 }
          }
        ]
      }
    });
  });

  it("keeps Unicode line separators aligned with canonical file-view offsets", async () => {
    const sourceText = "// a\u2028// b\u2029// c";
    const projectPath = await createInlineProject({ "src/unicode-lines.ts": sourceText });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.fileView(projectPath, "src/unicode-lines.ts", {
      offset: 1,
      limit: 3
    });

    expect(result.lines).toEqual([
      { line: 1, text: "// a" },
      { line: 2, text: "// b" },
      { line: 3, text: "// c" }
    ]);
    expect(result.sourceIdentity).toMatchObject({
      offsetMap: {
        deliveredTextLength: sourceText.length,
        sourceTextLength: sourceText.length,
        spans: [
          { kind: "identity", fullFileCharacterOffsets: { start: 0, end: 4 } },
          { kind: "normalized-line-ending", fullFileCharacterOffsets: { start: 4, end: 5 } },
          { kind: "identity", fullFileCharacterOffsets: { start: 5, end: 9 } },
          { kind: "normalized-line-ending", fullFileCharacterOffsets: { start: 9, end: 10 } },
          { kind: "identity", fullFileCharacterOffsets: { start: 10, end: 14 } }
        ]
      }
    });
  });

  it("resolves one unique indexed path suffix and rejects ambiguous basenames", async () => {
    const projectPath = await createInlineProject({
      "src/unique.ts": "export const uniqueSource = true;\n",
      "src/target.ts": "export const sourceTarget = true;\n",
      "test/target.ts": "export const testTarget = true;\n"
    });
    const service = createService();
    await service.init({ projectPath });

    const unique = await service.fileView(projectPath, "unique.ts", { symbolsOnly: true });
    expect(unique.selection).toEqual({
      requestedPath: "unique.ts",
      filePath: "src/unique.ts",
      source: "active-generation",
      resolution: "unique-suffix"
    });

    const exact = await service.fileView(projectPath, "src/target.ts", { symbolsOnly: true });
    expect(exact.selection.resolution).toBe("exact-path");

    const caseInsensitive = await service.fileView(projectPath, "SRC/TARGET.TS", {
      symbolsOnly: true
    });
    expect(caseInsensitive.selection).toEqual({
      requestedPath: "SRC/TARGET.TS",
      filePath: "src/target.ts",
      source: "active-generation",
      resolution: "case-insensitive-path"
    });

    await expect(service.fileView(projectPath, "target.ts")).rejects.toMatchObject({
      code: "FILE_VIEW_AMBIGUOUS",
      message: expect.stringMatching(/src\/target\.ts.*test\/target\.ts/u)
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
      ].join("\n"),
      "scenarios/checkout.scenario.ts": [
        'import { add } from "../src/math.js";',
        "export const checkout = add(3, 4);",
        ""
      ].join("\n"),
      "archive/scenarios/decoy.scenario.ts": [
        'import { add } from "../../src/math.js";',
        "export const decoy = add(4, 5);",
        ""
      ].join("\n")
    });
    const service = createService();
    await service.init({ projectPath });

    const result = await service.affectedTests(
      projectPath,
      [join("src", "math.ts"), "src/missing.ts", "test/changed.test.ts"],
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
      testSelection: { mode: "conventional", pattern: null },
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

    const customPattern = await service.affectedTests(projectPath, ["src/math.ts"], {
      maxDepth: 2,
      limit: 1,
      testPattern: "./scenarios/**/*.scenario.ts"
    });
    expect(customPattern).toMatchObject({
      testSelection: { mode: "glob", pattern: "scenarios/**/*.scenario.ts" },
      indexedTestFiles: 1,
      tests: {
        resultLimitTruncated: false,
        items: [
          expect.objectContaining({
            filePath: "scenarios/checkout.scenario.ts",
            classification: "custom-pattern"
          })
        ]
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
    await expect(
      service.affectedTests(projectPath, ["src/math.ts"], { testPattern: "../**/*.test.ts" })
    ).rejects.toMatchObject({ code: "INVALID_AFFECTED_TEST_PATTERN" });
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
      limit: 10,
      pathPrefix: "src/",
      testPattern: "./test/**/*.test.ts"
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
      selection: {
        pathPrefix: "src",
        totalChanges: 1,
        matchedSourceChanges: 1,
        sourcePaths: ["src/math.ts"]
      },
      testSelection: { mode: "glob", pattern: "test/**/*.test.ts" },
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
    let providerCalls = 0;
    const provider: GitChangeSetProvider = {
      async getChangeSet() {
        providerCalls += 1;
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

    await expect(
      service.affectedTestsFromGit(projectPath, { testPattern: "scenarios/**/*.scenario.ts" })
    ).resolves.toMatchObject({
      status: { stale: false },
      changeSet: { changes: [{ currentPath: "README.md" }], sourcePaths: [] },
      testSelection: { mode: "glob", pattern: "scenarios/**/*.scenario.ts" },
      affected: null
    });
    await expect(
      service.affectedTestsFromGit(projectPath, { testPattern: "../**/*.test.ts" })
    ).rejects.toMatchObject({ code: "INVALID_AFFECTED_TEST_PATTERN" });
    expect(providerCalls).toBe(1);
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
    await expect(
      service.affectedTestsFromGit(projectPath, { pathPrefix: "../outside" })
    ).rejects.toMatchObject({ code: "INVALID_GIT_AFFECTED_PATH_PREFIX" });
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

    const scopedChanges = [
      ...Array.from({ length: 51 }, (_value, index) => ({
        kind: "modified" as const,
        previousPath: `vendor/changed-${index}.ts`,
        currentPath: `vendor/changed-${index}.ts`,
        score: null
      })),
      {
        kind: "renamed" as const,
        previousPath: "src/math.ts",
        currentPath: "legacy/math.ts",
        score: 100
      }
    ];
    const scopedProvider: GitChangeSetProvider = {
      async getChangeSet() {
        return gitChangeSet(
          scopedChanges.flatMap((change) => [change.previousPath, change.currentPath]),
          scopedChanges
        );
      }
    };
    const scopedService = new SymbolLatticeService(
      new SqliteGraphStore(),
      new FileSystemSourceCatalog(),
      undefined,
      scopedProvider
    );
    await scopedService.init({ projectPath });
    await expect(
      scopedService.affectedTestsFromGit(projectPath, { pathPrefix: "src" })
    ).resolves.toMatchObject({
      selection: {
        pathPrefix: "src",
        totalChanges: 52,
        matchedSourceChanges: 1,
        sourcePaths: ["legacy/math.ts", "src/math.ts"]
      },
      affected: { inputs: { requested: ["legacy/math.ts", "src/math.ts"] } }
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

    const result = await service.gitHunks(projectPath, "origin/main", { pathPrefix: "src/" });

    expect(service.gitHunksAvailable()).toBe(true);
    expect(providerCalls).toEqual([
      {
        projectPath,
        request: {
          baseRef: "origin/main",
          maxSourceFiles: MAX_GIT_HUNK_SOURCE_FILES,
          pathPrefix: "src"
        }
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
      selection: {
        pathPrefix: "src",
        totalChanges: 1,
        matchedSourceChanges: 1
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
      service.gitHunks(projectPath, "origin/main", { pathPrefix: "../outside" })
    ).rejects.toMatchObject({ code: "INVALID_GIT_HUNK_PATH_PREFIX" });
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

  it("requires persisted source search before investigating one question", async () => {
    const projectPath = await createFixtureProject();
    const service = new SymbolLatticeService(
      createV03GraphStore(new SqliteGraphStore()),
      new FileSystemSourceCatalog()
    );
    await service.init({ projectPath });

    await expect(service.investigate(projectPath, "add")).rejects.toMatchObject({
      code: "SOURCE_SEARCH_UNAVAILABLE"
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

  it("replans a natural-language explore query once when its selected symbol moves", async () => {
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

    const exploration = await service.explore(
      "C:/symbol-lattice-race-project",
      "trace raceTarget flow"
    );

    expect(exploration).toMatchObject({
      mode: "query",
      status: { generationId: "generation:C" },
      queryPlan: {
        selection: [{ symbol: { filePath: "src/after.ts" } }]
      },
      focuses: [
        {
          sourceAvailability: "active-generation",
          source: { filePath: "src/after.ts" }
        }
      ]
    });
    expect(exploration.focuses?.[0]?.source?.lines.map((line) => line.text).join("\n")).toContain(
      "C evidence"
    );
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

  it("reprojects reused facts when a reference resolver plugin version changes", async () => {
    const projectPath = await createInlineProject({
      "src/caller.ts": "export function caller() { return execute(); }\n",
      "src/first.ts": "export function execute() { return 1; }\n",
      "src/second.ts": "export function execute() { return 2; }\n"
    });
    const graphStore = new SqliteGraphStore();
    let extractionCount = 0;
    const artifactFactsExtractor = (input: Parameters<typeof extractFileFacts>[0]) => {
      extractionCount += 1;
      return extractFileFacts(input);
    };
    const plugin = (version: string) =>
      createReferenceResolverPluginRegistry([
        {
          id: "acme/service-convention",
          version,
          languages: ["typescript"],
          relations: ["calls"],
          resolve: () => null
        }
      ]);
    const initialService = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      {
        artifactFactsExtractor,
        referenceResolverPlugins: plugin("1.0.0")
      }
    );
    await initialService.init({ projectPath });
    expect(extractionCount).toBe(3);

    const upgradedService = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      {
        artifactFactsExtractor,
        referenceResolverPlugins: plugin("1.0.1")
      }
    );
    expect(await upgradedService.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["indexer-version-changed"]
    });
    const synced = await upgradedService.sync({ projectPath });

    expect(synced).toMatchObject({ stale: false, staleReasons: [] });
    expect(extractionCount).toBe(3);
    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: [],
      reusedArtifactFiles: ["src/caller.ts", "src/first.ts", "src/second.ts"]
    });
  });

  it("reprojects reused facts when a framework project plugin version changes", async () => {
    const projectPath = await createInlineProject({
      "src/caller.ts": "export function caller() { return 1; }\n",
      "src/target.ts": "export function target() { return 2; }\n"
    });
    const graphStore = new SqliteGraphStore();
    let extractionCount = 0;
    const artifactFactsExtractor = (input: Parameters<typeof extractFileFacts>[0]) => {
      extractionCount += 1;
      return extractFileFacts(input);
    };
    const plugin = (version: string) =>
      createFrameworkProjectPluginRegistry([
        {
          id: "acme/project-composition",
          version,
          languages: ["typescript"],
          finalize: () => null
        }
      ]);
    const initialService = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      {
        artifactFactsExtractor,
        frameworkProjectPlugins: plugin("1.0.0")
      }
    );
    await initialService.init({ projectPath });
    expect(extractionCount).toBe(2);

    const upgradedService = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      {
        artifactFactsExtractor,
        frameworkProjectPlugins: plugin("1.0.1")
      }
    );
    expect(await upgradedService.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["indexer-version-changed"]
    });
    const synced = await upgradedService.sync({ projectPath });

    expect(synced).toMatchObject({ stale: false, staleReasons: [] });
    expect(extractionCount).toBe(2);
    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: [],
      reusedArtifactFiles: ["src/caller.ts", "src/target.ts"]
    });
  });

  it("re-extracts persisted facts when a framework fact plugin version changes", async () => {
    const projectPath = await createInlineProject({
      "src/extension.ts": "export const extensionMarker = true;\n"
    });
    const graphStore = new SqliteGraphStore();
    let extractionCount = 0;
    const artifactFactsExtractor = (input: Parameters<typeof extractFileFacts>[0]) => {
      extractionCount += 1;
      return extractFileFacts(input);
    };
    const plugin = (version: string) =>
      createFrameworkFactPluginRegistry([
        {
          id: "acme/framework-facts",
          version,
          languages: ["typescript"],
          extract: () => ({
            symbols: [
              {
                key: "framework-resource",
                kind: "resource",
                name: "framework-resource",
                range: {
                  start: { line: 1, column: 1 },
                  end: { line: 1, column: 7 }
                }
              }
            ]
          })
        }
      ]);
    const initialService = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      {
        artifactFactsExtractor,
        frameworkFactPlugins: plugin("1.0.0")
      }
    );
    await initialService.init({ projectPath });
    expect(extractionCount).toBe(1);
    expect(graphStore.getSnapshot(projectPath).symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "resource",
          qualifiedName: expect.stringContaining(
            "#extension:acme/framework-facts:framework-resource"
          )
        })
      ])
    );

    const upgradedService = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      {
        artifactFactsExtractor,
        frameworkFactPlugins: plugin("1.0.1")
      }
    );
    expect(await upgradedService.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["indexer-version-changed"]
    });
    const synced = await upgradedService.sync({ projectPath });

    expect(synced).toMatchObject({ stale: false, staleReasons: [] });
    expect(extractionCount).toBe(2);
    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["src/extension.ts"],
      reusedArtifactFiles: []
    });
    expect(graphStore.getArtifactFacts(projectPath)[0]?.extractorVersion).toContain(
      "framework-facts-"
    );
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

  it("assigns one exact source identity across node, investigate, and file views", async () => {
    const sourceText = "export function sharedIdentity(): number { return 1; }";
    const projectPath = await createInlineProject({
      "src/shared.ts": sourceText
    });
    const service = createService();
    await service.init({ projectPath });

    const node = await service.node(projectPath, "src/shared.ts#sharedIdentity");
    const investigate = await service.investigate(projectPath, "sharedIdentity");
    const file = await service.fileView(projectPath, "src/shared.ts", { offset: 1, limit: 1 });
    const investigateSource = investigate.declarations[0]?.source;

    expect(node.source?.text).toBe(sourceText);
    expect(investigateSource?.text).toBe(sourceText);
    expect(file.lines).toEqual([{ line: 1, text: sourceText }]);
    expect(node.source?.sourceIdentity).toEqual(investigateSource?.sourceIdentity);
    expect(node.source?.sourceIdentity).toEqual(file.sourceIdentity);
    expect(investigateSource?.renderedSegments[0]?.sourceIdentity).toEqual(file.sourceIdentity);
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
      resolverVersion: `${PROJECT_RESOLVER_VERSION}+${SOURCE_ROLE_CLASSIFIER_VERSION}`,
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
    await expect(service.routes(projectPath, { domain: " api.example.test" })).rejects.toMatchObject({
      code: "INVALID_ROUTE_DOMAIN"
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
      resolverVersion: `${PROJECT_RESOLVER_VERSION}+${SOURCE_ROLE_CLASSIFIER_VERSION}`,
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

  it("indexes direct Django Ninja decorator routes with exact local handler proof", async () => {
    const projectPath = await createInlineProject({
      "api/ninja.py": [
        "from ninja import NinjaAPI as Api",
        "api = Api(title=\"Example\")",
        "",
        "@api.get(\"/health\")",
        "def health(request):",
        "    return {\"ok\": True}",
        "",
        "@api.delete(\"/orders/{order_id}\")",
        "async def delete_order(request, order_id: int):",
        "    return {\"deleted\": order_id}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/ninja.py");

    expect(persistedFacts).toMatchObject({
      language: "python",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          route: expect.objectContaining({ name: "GET /health" }),
          handler: expect.objectContaining({ qualifiedName: "api/ninja.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.direct-app.decorator.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "DELETE",
          path: "/orders/{order_id}",
          route: expect.objectContaining({ name: "DELETE /orders/{order_id}" }),
          handler: expect.objectContaining({ qualifiedName: "api/ninja.py#delete_order" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.direct-app.decorator.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
  });

  it("indexes same-file Django Ninja Router routes through literal API prefixes", async () => {
    const projectPath = await createInlineProject({
      "api/events.py": [
        "from ninja import NinjaAPI, Router",
        "api = NinjaAPI()",
        "events = Router()",
        "",
        "@events.get(\"/health\")",
        "def health(request):",
        "    return {\"ok\": True}",
        "",
        "api.add_router(\"v1/events/\", events)"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/events.py");

    expect(persistedFacts).toMatchObject({
      language: "python",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/v1/events/health",
        route: { kind: "route", name: "GET /v1/events/health" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django-ninja.direct-router.add-router.decorator.local-function",
            stage: "syntax"
          }
        },
        handler: { qualifiedName: "api/events.py#health" }
      }
    ]);
  });

  it("indexes fixed Django Ninja api_operation methods for direct APIs and mounted Routers", async () => {
    const projectPath = await createInlineProject({
      "api/multi_method.py": [
        "from ninja import NinjaAPI, Router",
        "api = NinjaAPI()",
        "health = Router()",
        "",
        "@api.api_operation([\"POST\", \"PATCH\"], \"/orders\")",
        "def upsert_order(request):",
        "    return {\"ok\": True}",
        "",
        "@health.api_operation([\"HEAD\", \"OPTIONS\"], \"/status\")",
        "def status(request):",
        "    return None",
        "",
        "api.add_router(\"/v1\", health)"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/multi_method.py");

    expect(persistedFacts).toMatchObject({
      language: "python",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "POST",
          path: "/orders",
          handler: expect.objectContaining({ qualifiedName: "api/multi_method.py#upsert_order" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.direct-app.api-operation.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/orders",
          handler: expect.objectContaining({ qualifiedName: "api/multi_method.py#upsert_order" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.direct-app.api-operation.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "HEAD",
          path: "/v1/status",
          handler: expect.objectContaining({ qualifiedName: "api/multi_method.py#status" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.direct-router.add-router.api-operation.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "OPTIONS",
          path: "/v1/status",
          handler: expect.objectContaining({ qualifiedName: "api/multi_method.py#status" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.direct-router.add-router.api-operation.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
  });

  it("indexes package-relative Django Ninja Router modules through direct add_router prefixes", async () => {
    const projectPath = await createInlineProject({
      "api/__init__.py": "",
      "api/routers/__init__.py": "",
      "api/routers/catalog.py": [
        "from ninja import Router",
        "router = Router()",
        "",
        "@router.get(\"/health\")",
        "def health(request):",
        "    return {\"ok\": True}",
        "",
        "@router.api_operation([\"POST\", \"PATCH\"], \"/orders\")",
        "def upsert_order(request):",
        "    return {\"ok\": True}"
      ].join("\n"),
      "api/main.py": [
        "from ninja import NinjaAPI as Api",
        "from .routers.catalog import router as catalog_router",
        "api = Api()",
        "api.add_router(\"/api\", catalog_router)"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/main.py");
    const routerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/routers/catalog.py");

    expect(mainFacts).toMatchObject({ extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION });
    expect(mainFacts?.djangoNinjaRouterFacts).toMatchObject({
      importedRouterInclusions: [
        {
          moduleSpecifier: ".routers.catalog",
          importedRouterName: "router",
          routerName: "catalog_router",
          prefix: "/api"
        }
      ]
    });
    expect(routerFacts?.djangoNinjaRouterFacts).toMatchObject({
      routers: [{ name: "router" }],
      routes: [
        { routerName: "router", method: "GET", path: "/health", source: "decorator" },
        { routerName: "router", method: "POST", path: "/orders", source: "api-operation" },
        { routerName: "router", method: "PATCH", path: "/orders", source: "api-operation" }
      ]
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/api/health",
          route: expect.objectContaining({
            kind: "route",
            name: "GET /api/health",
            filePath: "api/routers/catalog.py"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.imported-router.add-router.decorator.local-function",
              stage: "module",
              resolutionPath: ["api/main.py", "api/routers/catalog.py"]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "api/routers/catalog.py#health" })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/api/orders",
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.imported-router.add-router.api-operation.local-function",
              stage: "module",
              resolutionPath: ["api/main.py", "api/routers/catalog.py"]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "api/routers/catalog.py#upsert_order" })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/api/orders",
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.imported-router.add-router.api-operation.local-function",
              stage: "module",
              resolutionPath: ["api/main.py", "api/routers/catalog.py"]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "api/routers/catalog.py#upsert_order" })
        })
      ])
    );
  });

  it("projects project-absolute Django Ninja Router imports from regular packages", async () => {
    const projectPath = await createInlineProject({
      "api/__init__.py": "",
      "api/routers/__init__.py": "",
      "api/routers/catalog.py": [
        "from ninja import Router",
        "router = Router()",
        "",
        "@router.get(\"/health\")",
        "def health(request):",
        "    return {\"ok\": True}",
        "",
        "@router.api_operation([\"POST\", \"PATCH\"], \"/orders\")",
        "def upsert_order(request):",
        "    return {\"ok\": True}"
      ].join("\n"),
      "api/main.py": [
        "from ninja import NinjaAPI",
        "from api.routers.catalog import router as catalog_router",
        "api = NinjaAPI()",
        "api.add_router(\"/v2\", catalog_router)"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/main.py");

    expect(mainFacts?.djangoNinjaRouterFacts).toMatchObject({
      importedRouterInclusions: [
        {
          moduleSpecifier: "api.routers.catalog",
          moduleSpecifierKind: "absolute"
        }
      ]
    });
    await expect(service.routes(projectPath, { pathPrefix: "/v2" })).resolves.toMatchObject({
      routes: expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v2/health",
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.project-absolute-router.add-router.decorator.local-function",
              stage: "module",
              resolutionPath: ["api/main.py", "api/routers/catalog.py"]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "api/routers/catalog.py#health" })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/v2/orders",
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.project-absolute-router.add-router.api-operation.local-function",
              stage: "module",
              resolutionPath: ["api/main.py", "api/routers/catalog.py"]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "api/routers/catalog.py#upsert_order" })
        })
      ])
    });
  });

  it("projects project-absolute Django Ninja Router re-exports through package initializers", async () => {
    const projectPath = await createInlineProject({
      "api/__init__.py": "",
      "api/routers/__init__.py": "from api.routers.catalog import router as public_router",
      "api/routers/catalog.py": [
        "from ninja import Router",
        "router = Router()",
        "",
        "@router.get(\"/health\")",
        "def health(request):",
        "    return {\"ok\": True}",
        "",
        "@router.api_operation([\"POST\", \"PATCH\"], \"/orders\")",
        "def upsert_order(request):",
        "    return {\"ok\": True}"
      ].join("\n"),
      "api/main.py": [
        "from ninja import NinjaAPI",
        "from .routers import public_router",
        "api = NinjaAPI()",
        "api.add_router(\"/v3\", public_router)"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/routers/__init__.py");

    expect(routerFacts?.djangoNinjaRouterFacts).toMatchObject({
      reExports: [
        {
          exportedName: "public_router",
          moduleSpecifier: "api.routers.catalog",
          moduleSpecifierKind: "absolute"
        }
      ]
    });
    await expect(service.routes(projectPath, { pathPrefix: "/v3" })).resolves.toMatchObject({
      routes: expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v3/health",
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.reexported-absolute-router.add-router.decorator.local-function",
              stage: "module",
              resolutionPath: [
                "api/main.py",
                "api/routers/__init__.py",
                "api/routers/catalog.py"
              ]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "api/routers/catalog.py#health" })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/v3/orders",
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.reexported-absolute-router.add-router.api-operation.local-function",
              stage: "module",
              resolutionPath: [
                "api/main.py",
                "api/routers/__init__.py",
                "api/routers/catalog.py"
              ]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "api/routers/catalog.py#upsert_order" })
        })
      ])
    });
  });

  it("projects Django Ninja Router exports through nested package initializers", async () => {
    const projectPath = await createInlineProject({
      "api/__init__.py": "",
      "api/routers/__init__.py": "from .internal import public_router",
      "api/routers/internal/__init__.py": "from .catalog import router as public_router",
      "api/routers/internal/catalog.py": [
        "from ninja import Router",
        "router = Router()",
        "",
        "@router.get(\"/health\")",
        "def health(request):",
        "    return {\"ok\": True}",
        "",
        "@router.api_operation([\"POST\", \"PATCH\"], \"/orders\")",
        "def upsert_order(request):",
        "    return {\"ok\": True}"
      ].join("\n"),
      "api/main.py": [
        "from ninja import NinjaAPI",
        "from .routers import public_router as mounted_router",
        "api = NinjaAPI()",
        "api.add_router(\"/v1\", mounted_router)"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const routersFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/routers/__init__.py");
    const internalFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/routers/internal/__init__.py");

    expect(routersFacts?.djangoNinjaRouterFacts).toMatchObject({
      reExports: [
        {
          exportedName: "public_router",
          importedRouterName: "public_router",
          moduleSpecifier: ".internal"
        }
      ]
    });
    expect(internalFacts?.djangoNinjaRouterFacts).toMatchObject({
      reExports: [
        {
          exportedName: "public_router",
          importedRouterName: "router",
          moduleSpecifier: ".catalog"
        }
      ]
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/health",
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.reexported-router.add-router.decorator.local-function",
              stage: "module",
              resolutionPath: [
                "api/main.py",
                "api/routers/__init__.py",
                "api/routers/internal/__init__.py",
                "api/routers/internal/catalog.py"
              ]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "api/routers/internal/catalog.py#health" })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/v1/orders",
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.django-ninja.reexported-router.add-router.api-operation.local-function",
              stage: "module",
              resolutionPath: [
                "api/main.py",
                "api/routers/__init__.py",
                "api/routers/internal/__init__.py",
                "api/routers/internal/catalog.py"
              ]
            })
          }),
          handler: expect.objectContaining({
            qualifiedName: "api/routers/internal/catalog.py#upsert_order"
          })
        })
      ])
    );
  });

  it("does not project Django Ninja Router targets without a regular package boundary or final re-export", async () => {
    const missingPackagePath = await createInlineProject({
      "api/routers/catalog.py": [
        "from ninja import Router",
        "router = Router()",
        "",
        "@router.get(\"/health\")",
        "def health(request):",
        "    return {\"ok\": True}"
      ].join("\n"),
      "api/main.py": [
        "from ninja import NinjaAPI",
        "from .routers.catalog import router",
        "api = NinjaAPI()",
        "api.add_router(\"/api\", router)"
      ].join("\n")
    });
    const reExportPath = await createInlineProject({
      "api/__init__.py": "",
      "api/routers/__init__.py": [
        "from .catalog import router as public_router",
        "public_router = build_router()"
      ].join("\n"),
      "api/routers/catalog.py": [
        "from ninja import Router",
        "router = Router()",
        "",
        "@router.get(\"/health\")",
        "def health(request):",
        "    return {\"ok\": True}"
      ].join("\n"),
      "api/main.py": [
        "from ninja import NinjaAPI",
        "from .routers import public_router",
        "api = NinjaAPI()",
        "api.add_router(\"/api\", public_router)"
      ].join("\n")
    });
    const absoluteMissingPackagePath = await createInlineProject({
      "api/routers/catalog.py": [
        "from ninja import Router",
        "router = Router()",
        "",
        "@router.get(\"/health\")",
        "def health(request):",
        "    return {\"ok\": True}"
      ].join("\n"),
      "api/main.py": [
        "from ninja import NinjaAPI",
        "from api.routers.catalog import router",
        "api = NinjaAPI()",
        "api.add_router(\"/absolute\", router)"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath: missingPackagePath });
    await service.init({ projectPath: reExportPath });
    await service.init({ projectPath: absoluteMissingPackagePath });

    await expect(service.routes(missingPackagePath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
    await expect(service.routes(reExportPath, { method: "GET" })).resolves.toMatchObject({ routes: [] });
    await expect(service.routes(absoluteMissingPackagePath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
  });

  it("indexes direct Starlette Route-list routes with exact local handler proof", async () => {
    const projectPath = await createInlineProject({
      "api/main.py": [
        "from starlette.applications import Starlette",
        "from starlette.routing import Route",
        "",
        "async def health(request):",
        "    return None",
        "",
        "def create_job(request):",
        "    return None",
        "",
        "routes = [",
        "    Route(\"/health\", health),",
        "    Route(\"/jobs\", endpoint=create_job, methods=[\"POST\"]),",
        "]",
        "app = Starlette(routes=routes)"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/main.py");

    expect(persistedFacts).toMatchObject({
      language: "python",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.starlette.direct-application.routes.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/jobs",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#create_job" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.starlette.direct-application.routes.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
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

  it("indexes fully anchored literal Django re_path routes with exact local handler proof", async () => {
    const projectPath = await createInlineProject({
      "config/urls.py": [
        "from django.urls import re_path as route",
        "",
        "def home(request):",
        "    return 'home'",
        "",
        "def health(request):",
        "    return 'health'",
        "",
        "urlpatterns = [",
        "    route(r'^$', home),",
        "    route('^health/$', health),",
        "]"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "ALL" })).resolves.toMatchObject({
      routes: [
        {
          method: "ALL",
          path: "/",
          route: { kind: "route", name: "ALL /" },
          edge: {
            kind: "routes",
            resolution: "exact",
            evidence: {
              ruleId: "framework.django.direct-urlpatterns.re-path.local-function",
              stage: "syntax"
            }
          },
          handler: { qualifiedName: "config/urls.py#home" }
        },
        {
          method: "ALL",
          path: "/health/",
          route: { kind: "route", name: "ALL /health/" },
          edge: {
            kind: "routes",
            resolution: "exact",
            evidence: {
              ruleId: "framework.django.direct-urlpatterns.re-path.local-function",
              stage: "syntax"
            }
          },
          handler: { qualifiedName: "config/urls.py#health" }
        }
      ]
    });
  });

  it("indexes direct aiohttp router routes with exact local handler proof", async () => {
    const projectPath = await createInlineProject({
      "api/main.py": [
        "from aiohttp import web",
        "",
        "async def health(request):",
        "    return None",
        "",
        "def create_job(request):",
        "    return None",
        "",
        "app = web.Application()",
        "app.router.add_get(\"/health\", health, allow_head=False)",
        "app.router.add_route(\"POST\", \"/jobs\", create_job)"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/main.py");

    expect(persistedFacts).toMatchObject({
      language: "python",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.aiohttp.direct-router.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/jobs",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#create_job" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.aiohttp.direct-router.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(routes.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ method: "HEAD", path: "/health" })])
    );
  });

  it("indexes literal aiohttp route tables mounted through direct add_routes", async () => {
    const projectPath = await createInlineProject({
      "api/main.py": [
        "from aiohttp import web",
        "",
        "async def health(request):",
        "    return None",
        "",
        "def create_job(request):",
        "    return None",
        "",
        "routes = [",
        "    web.get(\"/health\", health, allow_head=False),",
        "    web.post(\"/jobs\", create_job),",
        "]",
        "app = web.Application()",
        "app.router.add_routes(routes)"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.aiohttp.direct-router.add-routes.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/jobs",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#create_job" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.aiohttp.direct-router.add-routes.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(routes.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ method: "HEAD", path: "/health" })])
    );
  });

  it("indexes direct Sanic decorator routes with exact local handler proof", async () => {
    const projectPath = await createInlineProject({
      "api/main.py": [
        "from sanic import Sanic",
        "",
        "app = Sanic(\"symbol-lattice\")",
        "",
        "@app.get(\"/health\")",
        "async def health(request):",
        "    return None",
        "",
        "@app.route(\"/jobs\", methods=[\"POST\", \"PATCH\"])",
        "def create_or_update_job(request):",
        "    return None"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.direct-app.decorator.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/jobs",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#create_or_update_job" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.direct-app.decorator.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/jobs",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#create_or_update_job" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.direct-app.decorator.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
  });

  it("indexes direct Sanic Blueprint routes with exact local handler proof", async () => {
    const projectPath = await createInlineProject({
      "api/main.py": [
        "from sanic import Blueprint, Sanic",
        "",
        "app = Sanic(\"symbol-lattice\")",
        "api = Blueprint(\"api\", url_prefix=\"/api\")",
        "",
        "app.blueprint(api)",
        "",
        "@api.get(\"/health\")",
        "async def health(request):",
        "    return None",
        "",
        "@api.route(\"/jobs\", methods=[\"POST\", \"PATCH\"])",
        "def create_or_update_job(request):",
        "    return None"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/api/health",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.direct-blueprint.app-blueprint.decorator.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/api/jobs",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#create_or_update_job" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.direct-blueprint.app-blueprint.decorator.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/api/jobs",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#create_or_update_job" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.direct-blueprint.app-blueprint.decorator.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
  });

  it("indexes direct Sanic Blueprint group routes with literal composed prefixes", async () => {
    const projectPath = await createInlineProject({
      "api/main.py": [
        "from sanic import Blueprint, Sanic",
        "",
        "app = Sanic(\"symbol-lattice\")",
        "users = Blueprint(\"users\", url_prefix=\"/users\")",
        "reports = Blueprint(\"reports\", url_prefix=\"/reports\")",
        "api = Blueprint.group(users, reports, url_prefix=\"/api\")",
        "",
        "app.blueprint(api, url_prefix=\"/v1\")",
        "",
        "@users.get(\"/health\")",
        "async def health(request):",
        "    return None",
        "",
        "@reports.post(\"/summary\")",
        "async def summary(request):",
        "    return None"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/api/users/health",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.direct-blueprint-group.app-blueprint.decorator.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/v1/api/reports/summary",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#summary" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.direct-blueprint-group.app-blueprint.decorator.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
  });

  it("indexes nested direct Sanic Blueprint group routes with literal composed prefixes", async () => {
    const projectPath = await createInlineProject({
      "api/main.py": [
        "from sanic import Blueprint, Sanic",
        "",
        "app = Sanic(\"symbol-lattice\")",
        "users = Blueprint(\"users\", url_prefix=\"/users\")",
        "reports = Blueprint(\"reports\", url_prefix=\"/reports\")",
        "content = Blueprint.group(users, url_prefix=\"/content\")",
        "api = Blueprint.group(content, reports, url_prefix=\"/api\")",
        "",
        "app.blueprint(api, url_prefix=\"/v1\")",
        "",
        "@users.get(\"/health\")",
        "async def health(request):",
        "    return None",
        "",
        "@reports.post(\"/summary\")",
        "async def summary(request):",
        "    return None"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/api/content/users/health",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.sanic.direct-nested-blueprint-group.app-blueprint.decorator.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/v1/api/reports/summary",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#summary" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.sanic.direct-blueprint-group.app-blueprint.decorator.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
  });

  it("indexes named Sanic Blueprint group mounts with unique literal name prefixes", async () => {
    const projectPath = await createInlineProject({
      "api/main.py": [
        "from sanic import Blueprint, Sanic",
        "",
        "app = Sanic(\"symbol-lattice\")",
        "users = Blueprint(\"users\", url_prefix=\"/users\")",
        "public = Blueprint.group(users, url_prefix=\"/public\", name_prefix=\"public\")",
        "admin = Blueprint.group(users, url_prefix=\"/admin\", name_prefix=\"admin\")",
        "",
        "app.blueprint(public, url_prefix=\"/v1\")",
        "app.blueprint(admin, url_prefix=\"/v2\")",
        "",
        "@users.get(\"/health\")",
        "async def health(request):",
        "    return None"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/public/users/health",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.sanic.named-blueprint-group.app-blueprint.decorator.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/v2/admin/users/health",
          handler: expect.objectContaining({ qualifiedName: "api/main.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.sanic.named-blueprint-group.app-blueprint.decorator.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
  });

  it("projects package-relative Sanic Blueprint modules through literal prefixes", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "",
      "app/routes/catalog.py": [
        "from sanic import Blueprint as Router",
        "catalog = Router(\"catalog\", url_prefix=\"/catalog\")",
        "",
        "@catalog.get(\"/items\")",
        "async def items(request):",
        "    return None"
      ].join("\n"),
      "app/main.py": [
        "from sanic import Sanic as App",
        "from .routes.catalog import catalog as catalog_blueprint",
        "app = App(\"symbol-lattice\")",
        "app.blueprint(catalog_blueprint, url_prefix=\"/v1\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "app/main.py");
    const blueprintFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "app/routes/catalog.py");

    expect(mainFacts?.sanicBlueprintFacts).toMatchObject({
      importedBlueprintRegistrations: [
        {
          moduleSpecifier: ".routes.catalog",
          importedBlueprintName: "catalog",
          blueprintName: "catalog_blueprint",
          prefix: "/v1"
        }
      ]
    });
    expect(blueprintFacts?.sanicBlueprintFacts).toMatchObject({
      blueprints: [{ name: "catalog", prefix: "/catalog" }],
      routes: [{ blueprintName: "catalog", method: "GET", path: "/items" }]
    });
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/v1/catalog/items",
        route: {
          kind: "route",
          name: "GET /v1/catalog/items",
          filePath: "app/routes/catalog.py"
        },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.sanic.imported-blueprint.app-blueprint.decorator.local-function",
            stage: "module",
            resolutionPath: ["app/main.py", "app/routes/catalog.py"]
          }
        },
        handler: { qualifiedName: "app/routes/catalog.py#items" }
      }
    ]);
  });

  it("projects nested package-relative Sanic Blueprint group modules through literal prefixes", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "",
      "app/routes/catalog.py": [
        "from sanic import Blueprint as Router",
        "catalog = Router(\"catalog\", url_prefix=\"/catalog\")",
        "",
        "@catalog.get(\"/items\")",
        "async def items(request):",
        "    return None"
      ].join("\n"),
      "app/routes/users.py": [
        "from sanic import Blueprint as Router",
        "users = Router(\"users\", url_prefix=\"/users\")",
        "",
        "@users.get(\"/health\")",
        "async def health(request):",
        "    return None"
      ].join("\n"),
      "app/routes/content.py": [
        "from sanic import Blueprint as Router",
        "from .users import users as users_blueprint",
        "content = Router.group(users_blueprint, url_prefix=\"/content\")"
      ].join("\n"),
      "app/routes/api.py": [
        "from sanic import Blueprint as Router",
        "from .catalog import catalog as catalog_blueprint",
        "from .content import content as content_group",
        "reports = Router(\"reports\", url_prefix=\"/reports\")",
        "api = Router.group(catalog_blueprint, content_group, reports, url_prefix=\"/api\")",
        "",
        "@reports.get(\"/summary\")",
        "async def summary(request):",
        "    return None"
      ].join("\n"),
      "app/main.py": [
        "from sanic import Sanic as App",
        "from .routes.api import api as api_group",
        "app = App(\"symbol-lattice\")",
        "app.blueprint(api_group, url_prefix=\"/v1\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/api/catalog/items",
          route: expect.objectContaining({ filePath: "app/routes/catalog.py" }),
          handler: expect.objectContaining({ qualifiedName: "app/routes/catalog.py#items" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.imported-blueprint-group.app-blueprint.decorator.local-function",
              stage: "module",
              resolutionPath: ["app/main.py", "app/routes/api.py", "app/routes/catalog.py"]
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/v1/api/content/users/health",
          route: expect.objectContaining({ filePath: "app/routes/users.py" }),
          handler: expect.objectContaining({ qualifiedName: "app/routes/users.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.sanic.imported-nested-blueprint-group.app-blueprint.decorator.local-function",
              stage: "module",
              resolutionPath: [
                "app/main.py",
                "app/routes/api.py",
                "app/routes/content.py",
                "app/routes/users.py"
              ]
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/v1/api/reports/summary",
          route: expect.objectContaining({ filePath: "app/routes/api.py" }),
          handler: expect.objectContaining({ qualifiedName: "app/routes/api.py#summary" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.imported-blueprint-group.app-blueprint.decorator.local-function",
              stage: "module",
              resolutionPath: ["app/main.py", "app/routes/api.py"]
            })
          })
        })
      ])
    );
  });

  it("projects named package-relative Sanic Blueprint group mounts without collapsing routes", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "",
      "app/routes/users.py": [
        "from sanic import Blueprint as Router",
        "users = Router(\"users\", url_prefix=\"/users\")",
        "",
        "@users.get(\"/health\")",
        "async def health(request):",
        "    return None"
      ].join("\n"),
      "app/routes/public.py": [
        "from sanic import Blueprint as Router",
        "from .users import users as users_blueprint",
        "public = Router.group(users_blueprint, url_prefix=\"/public\", name_prefix=\"public\")"
      ].join("\n"),
      "app/routes/admin.py": [
        "from sanic import Blueprint as Router",
        "from .users import users as users_blueprint",
        "admin = Router.group(users_blueprint, url_prefix=\"/admin\", name_prefix=\"admin\")"
      ].join("\n"),
      "app/main.py": [
        "from sanic import Sanic as App",
        "from .routes.public import public as public_group",
        "from .routes.admin import admin as admin_group",
        "app = App(\"symbol-lattice\")",
        "app.blueprint(public_group, url_prefix=\"/v1\")",
        "app.blueprint(admin_group, url_prefix=\"/v2\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/v1/public/users/health",
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.imported-named-blueprint-group.app-blueprint.decorator.local-function"
            })
          })
        }),
        expect.objectContaining({
          path: "/v2/admin/users/health",
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.imported-named-blueprint-group.app-blueprint.decorator.local-function"
            })
          })
        })
      ])
    );
  });

  it("rejects repeated package-relative Sanic Blueprint group mounts without literal name prefixes", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "",
      "app/routes/users.py": [
        "from sanic import Blueprint as Router",
        "users = Router(\"users\", url_prefix=\"/users\")",
        "",
        "@users.get(\"/health\")",
        "async def health(request):",
        "    return None"
      ].join("\n"),
      "app/routes/public.py": [
        "from sanic import Blueprint as Router",
        "from .users import users as users_blueprint",
        "public = Router.group(users_blueprint, url_prefix=\"/public\")"
      ].join("\n"),
      "app/routes/admin.py": [
        "from sanic import Blueprint as Router",
        "from .users import users as users_blueprint",
        "admin = Router.group(users_blueprint, url_prefix=\"/admin\")"
      ].join("\n"),
      "app/main.py": [
        "from sanic import Sanic as App",
        "from .routes.public import public as public_group",
        "from .routes.admin import admin as admin_group",
        "app = App(\"symbol-lattice\")",
        "app.blueprint(public_group, url_prefix=\"/v1\")",
        "app.blueprint(admin_group, url_prefix=\"/v2\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual([]);
  });

  it("rejects cyclic package-relative Sanic Blueprint group members", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "",
      "app/routes/users.py": [
        "from sanic import Blueprint as Router",
        "users = Router(\"users\", url_prefix=\"/users\")",
        "",
        "@users.get(\"/health\")",
        "async def health(request):",
        "    return None"
      ].join("\n"),
      "app/routes/alpha.py": [
        "from sanic import Blueprint as Router",
        "from .users import users as users_blueprint",
        "from .beta import beta as beta_group",
        "alpha = Router.group(users_blueprint, beta_group, url_prefix=\"/alpha\")"
      ].join("\n"),
      "app/routes/beta.py": [
        "from sanic import Blueprint as Router",
        "from .alpha import alpha as alpha_group",
        "beta = Router.group(alpha_group, url_prefix=\"/beta\")"
      ].join("\n"),
      "app/main.py": [
        "from sanic import Sanic as App",
        "from .routes.alpha import alpha as alpha_group",
        "app = App(\"symbol-lattice\")",
        "app.blueprint(alpha_group, url_prefix=\"/v1\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual([]);
  });

  it("projects package-relative Sanic Blueprint and group exports through nested package initializers", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "from .exports import public_api",
      "app/routes/exports/__init__.py": "from .api import api as public_api",
      "app/routes/exports/catalog.py": [
        "from sanic import Blueprint as Router",
        "catalog = Router(\"catalog\", url_prefix=\"/catalog\")",
        "",
        "@catalog.get(\"/items\")",
        "async def items(request):",
        "    return None"
      ].join("\n"),
      "app/routes/exports/api.py": [
        "from sanic import Blueprint as Router",
        "from .catalog import catalog as catalog_blueprint",
        "api = Router.group(catalog_blueprint, url_prefix=\"/api\")"
      ].join("\n"),
      "app/health/__init__.py": "from .status import status as status_blueprint",
      "app/health/status.py": [
        "from sanic import Blueprint as Router",
        "status = Router(\"status\", url_prefix=\"/status\")",
        "",
        "@status.get(\"/health\")",
        "async def health(request):",
        "    return None"
      ].join("\n"),
      "app/main.py": [
        "from sanic import Sanic as App",
        "from .routes import public_api as api_group",
        "from .health import status_blueprint",
        "app = App(\"symbol-lattice\")",
        "app.blueprint(api_group, url_prefix=\"/v1\")",
        "app.blueprint(status_blueprint, url_prefix=\"/v2\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/v1/api/catalog/items",
          route: expect.objectContaining({ filePath: "app/routes/exports/catalog.py" }),
          handler: expect.objectContaining({ qualifiedName: "app/routes/exports/catalog.py#items" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.reexported-blueprint-group.app-blueprint.decorator.local-function",
              stage: "module",
              resolutionPath: [
                "app/main.py",
                "app/routes/__init__.py",
                "app/routes/exports/__init__.py",
                "app/routes/exports/api.py",
                "app/routes/exports/catalog.py"
              ]
            })
          })
        }),
        expect.objectContaining({
          path: "/v2/status/health",
          route: expect.objectContaining({ filePath: "app/health/status.py" }),
          handler: expect.objectContaining({ qualifiedName: "app/health/status.py#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.sanic.reexported-blueprint.app-blueprint.decorator.local-function",
              stage: "module",
              resolutionPath: [
                "app/main.py",
                "app/health/__init__.py",
                "app/health/status.py"
              ]
            })
          })
        })
      ])
    );
  });

  it("rejects unresolved package initializer Sanic Blueprint exports", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "from .missing import api as public_api",
      "app/main.py": [
        "from sanic import Sanic as App",
        "from .routes import public_api",
        "app = App(\"symbol-lattice\")",
        "app.blueprint(public_api, url_prefix=\"/v1\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual([]);
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

  it("indexes direct project-root absolute FastAPI APIRouter modules through literal prefixes", async () => {
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
        "from api.routers.catalog import router as catalog_router",
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

    expect(mainFacts?.fastApiRouterFacts).toMatchObject({
      importedRouterInclusions: [
        {
          moduleSpecifier: "api.routers.catalog",
          moduleSpecifierKind: "absolute",
          importedRouterName: "router",
          routerName: "catalog_router",
          prefix: "/api"
        }
      ]
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
            ruleId: "framework.fastapi.project-absolute-router.include-router.decorator.local-function",
            stage: "module",
            resolutionPath: ["api/main.py", "api/routers/catalog.py"]
          }
        },
        handler: { qualifiedName: "api/routers/catalog.py#health" }
      }
    ]);
  });

  it("projects FastAPI APIRouter exports through nested package initializers", async () => {
    const projectPath = await createInlineProject({
      "api/__init__.py": "",
      "api/routers/__init__.py": "from .internal import public_router",
      "api/routers/internal/__init__.py": "from .catalog import router as public_router",
      "api/routers/internal/catalog.py": [
        "from fastapi import APIRouter",
        "router = APIRouter(prefix=\"/catalog\")",
        "",
        "@router.get(\"/health\")",
        "async def health():",
        "    return {\"ok\": True}"
      ].join("\n"),
      "api/main.py": [
        "from fastapi import FastAPI",
        "from .routers import public_router as mounted_router",
        "app = FastAPI()",
        "app.include_router(mounted_router, prefix=\"/v1\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const routersFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/routers/__init__.py");
    const internalFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/routers/internal/__init__.py");

    expect(routersFacts?.fastApiRouterFacts).toMatchObject({
      reExports: [
        {
          exportedName: "public_router",
          importedRouterName: "public_router",
          moduleSpecifier: ".internal"
        }
      ]
    });
    expect(internalFacts?.fastApiRouterFacts).toMatchObject({
      reExports: [
        {
          exportedName: "public_router",
          importedRouterName: "router",
          moduleSpecifier: ".catalog"
        }
      ]
    });
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/v1/catalog/health",
        route: {
          kind: "route",
          name: "GET /v1/catalog/health",
          filePath: "api/routers/internal/catalog.py"
        },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.fastapi.reexported-router.include-router.decorator.local-function",
            stage: "module",
            resolutionPath: [
              "api/main.py",
              "api/routers/__init__.py",
              "api/routers/internal/__init__.py",
              "api/routers/internal/catalog.py"
            ]
          }
        },
        handler: { qualifiedName: "api/routers/internal/catalog.py#health" }
      }
    ]);
  });

  it("projects project-root absolute FastAPI APIRouter exports through final package initializers", async () => {
    const projectPath = await createInlineProject({
      "api/__init__.py": "",
      "api/routers/__init__.py": "from api.routers.catalog import router as public_router",
      "api/routers/catalog.py": [
        "from fastapi import APIRouter",
        "router = APIRouter(prefix=\"/catalog\")",
        "",
        "@router.get(\"/health\")",
        "async def health():",
        "    return {\"ok\": True}"
      ].join("\n"),
      "api/main.py": [
        "from fastapi import FastAPI",
        "from .routers import public_router as relative_router",
        "from api.routers import public_router as absolute_router",
        "app = FastAPI()",
        "app.include_router(relative_router, prefix=\"/relative\")",
        "app.include_router(absolute_router, prefix=\"/absolute\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const routersFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/routers/__init__.py");
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/main.py");

    expect(routersFacts?.fastApiRouterFacts).toMatchObject({
      reExports: [
        {
          exportedName: "public_router",
          importedRouterName: "router",
          moduleSpecifier: "api.routers.catalog",
          moduleSpecifierKind: "absolute"
        }
      ]
    });
    expect(mainFacts?.fastApiRouterFacts).toMatchObject({
      importedRouterInclusions: [
        {
          moduleSpecifier: ".routers",
          moduleSpecifierKind: "relative",
          importedRouterName: "public_router",
          routerName: "relative_router",
          prefix: "/relative"
        },
        {
          moduleSpecifier: "api.routers",
          moduleSpecifierKind: "absolute",
          importedRouterName: "public_router",
          routerName: "absolute_router",
          prefix: "/absolute"
        }
      ]
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/relative/catalog/health",
          route: expect.objectContaining({
            kind: "route",
            name: "GET /relative/catalog/health",
            filePath: "api/routers/catalog.py"
          }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastapi.reexported-absolute-router.include-router.decorator.local-function",
              stage: "module",
              resolutionPath: ["api/main.py", "api/routers/__init__.py", "api/routers/catalog.py"]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "api/routers/catalog.py#health" })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/absolute/catalog/health",
          route: expect.objectContaining({
            kind: "route",
            name: "GET /absolute/catalog/health",
            filePath: "api/routers/catalog.py"
          }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.fastapi.project-absolute-reexported-router.include-router.decorator.local-function",
              stage: "module",
              resolutionPath: ["api/main.py", "api/routers/__init__.py", "api/routers/catalog.py"]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "api/routers/catalog.py#health" })
        })
      ])
    );
  });

  it("rejects unresolved FastAPI APIRouter package initializer exports", async () => {
    const projectPath = await createInlineProject({
      "api/__init__.py": "",
      "api/routers/__init__.py": "from .missing import router as public_router",
      "api/main.py": [
        "from fastapi import FastAPI",
        "from .routers import public_router",
        "app = FastAPI()",
        "app.include_router(public_router, prefix=\"/v1\")"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
  });

  it("rejects unresolved project-root absolute FastAPI APIRouter package initializer exports", async () => {
    const projectPath = await createInlineProject({
      "api/__init__.py": "",
      "api/routers/__init__.py": "from api.routers.missing import router as public_router",
      "api/main.py": [
        "from fastapi import FastAPI",
        "from .routers import public_router",
        "app = FastAPI()",
        "app.include_router(public_router, prefix=\"/v1\")"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
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

  it("does not project project-root absolute FastAPI router imports without a proven package boundary", async () => {
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
        "from api.routers.catalog import router",
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

  it("indexes direct Flask-RESTful Resource methods with exact syntax evidence", async () => {
    const projectPath = await createInlineProject({
      "app/main.py": [
        "from flask import Flask as App",
        "from flask_restful import Api as RestApi, Resource as BaseResource",
        "app = App(__name__)",
        "api = RestApi(app)",
        "",
        "class CatalogResource(BaseResource):",
        "    def get(self):",
        "        return []",
        "",
        "    def post(self):",
        "        return {}",
        "",
        "api.add_resource(CatalogResource, \"/catalog\", \"/catalog/<int:item_id>\")"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/catalog",
          handler: expect.objectContaining({ qualifiedName: "app/main.py#CatalogResource.get" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.flask-restful.direct-api.add-resource.resource-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/catalog/<int:item_id>",
          handler: expect.objectContaining({ qualifiedName: "app/main.py#CatalogResource.get" })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/catalog",
          handler: expect.objectContaining({ qualifiedName: "app/main.py#CatalogResource.post" })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/catalog/<int:item_id>",
          handler: expect.objectContaining({ qualifiedName: "app/main.py#CatalogResource.post" })
        })
      ])
    );
  });

  it("projects package-relative Flask Blueprint modules through literal prefixes", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "",
      "app/routes/catalog.py": [
        "from flask import Blueprint as BP",
        "catalog = BP(\"catalog\", __name__, url_prefix=\"/catalog\")",
        "",
        "@catalog.get(\"/items\")",
        "def items():",
        "    return []"
      ].join("\n"),
      "app/main.py": [
        "from flask import Flask as App",
        "from .routes.catalog import catalog as catalog_blueprint",
        "app = App(__name__)",
        "app.register_blueprint(catalog_blueprint, url_prefix=\"/api\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "app/main.py");
    const blueprintFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "app/routes/catalog.py");

    expect(mainFacts?.flaskBlueprintFacts).toMatchObject({
      importedBlueprintRegistrations: [
        {
          moduleSpecifier: ".routes.catalog",
          importedBlueprintName: "catalog",
          blueprintName: "catalog_blueprint",
          prefix: "/api"
        }
      ]
    });
    expect(blueprintFacts?.flaskBlueprintFacts).toMatchObject({
      blueprints: [{ name: "catalog", prefix: "/catalog" }],
      routes: [{ blueprintName: "catalog", method: "GET", path: "/items" }]
    });
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/api/catalog/items",
        route: {
          kind: "route",
          name: "GET /api/catalog/items",
          filePath: "app/routes/catalog.py"
        },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.flask.imported-blueprint.register-blueprint.decorator.local-function",
            stage: "module",
            resolutionPath: ["app/main.py", "app/routes/catalog.py"]
          }
        },
        handler: { qualifiedName: "app/routes/catalog.py#items" }
      }
    ]);

    await writeFile(
      join(projectPath, "app", "main.py"),
      [
        "from flask import Flask as App",
        "from .routes.catalog import catalog as catalog_blueprint",
        "app = App(__name__)",
        "app.register_blueprint(catalog_blueprint, url_prefix=\"/v2\")"
      ].join("\n"),
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const routesAfterSync = await service.routes(projectPath, { method: "GET" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      modifiedFiles: ["app/main.py"],
      reExtractedFiles: ["app/main.py"],
      reusedArtifactFiles: expect.arrayContaining(["app/routes/catalog.py"])
    });
    expect(routesAfterSync.routes).toMatchObject([
      {
        method: "GET",
        path: "/v2/catalog/items",
        route: { name: "GET /v2/catalog/items", filePath: "app/routes/catalog.py" },
        handler: { qualifiedName: "app/routes/catalog.py#items" }
      }
    ]);
  });

  it("projects direct project-root absolute Flask Blueprint modules through literal prefixes", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "",
      "app/routes/catalog.py": [
        "from flask import Blueprint as BP",
        "catalog = BP(\"catalog\", __name__, url_prefix=\"/catalog\")",
        "",
        "@catalog.get(\"/items\")",
        "def items():",
        "    return []"
      ].join("\n"),
      "app/main.py": [
        "from flask import Flask as App",
        "from app.routes.catalog import catalog as catalog_blueprint",
        "app = App(__name__)",
        "app.register_blueprint(catalog_blueprint, url_prefix=\"/api\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "app/main.py");

    expect(mainFacts?.flaskBlueprintFacts).toMatchObject({
      importedBlueprintRegistrations: [
        {
          moduleSpecifier: "app.routes.catalog",
          moduleSpecifierKind: "absolute",
          importedBlueprintName: "catalog",
          blueprintName: "catalog_blueprint",
          prefix: "/api"
        }
      ]
    });
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/api/catalog/items",
        route: {
          kind: "route",
          name: "GET /api/catalog/items",
          filePath: "app/routes/catalog.py"
        },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.flask.project-absolute-blueprint.register-blueprint.decorator.local-function",
            stage: "module",
            resolutionPath: ["app/main.py", "app/routes/catalog.py"]
          }
        },
        handler: { qualifiedName: "app/routes/catalog.py#items" }
      }
    ]);
  });

  it("projects Flask Blueprint exports through nested package initializers", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "from .internal import public_blueprint",
      "app/routes/internal/__init__.py": "from .catalog import catalog as public_blueprint",
      "app/routes/internal/catalog.py": [
        "from flask import Blueprint",
        "catalog = Blueprint(\"catalog\", __name__, url_prefix=\"/catalog\")",
        "",
        "@catalog.get(\"/health\")",
        "def health():",
        "    return {\"ok\": True}"
      ].join("\n"),
      "app/main.py": [
        "from flask import Flask",
        "from .routes import public_blueprint as mounted_blueprint",
        "app = Flask(__name__)",
        "app.register_blueprint(mounted_blueprint, url_prefix=\"/v1\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const routesFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "app/routes/__init__.py");
    const internalFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "app/routes/internal/__init__.py");

    expect(routesFacts?.flaskBlueprintFacts).toMatchObject({
      reExports: [
        {
          exportedName: "public_blueprint",
          importedBlueprintName: "public_blueprint",
          moduleSpecifier: ".internal"
        }
      ]
    });
    expect(internalFacts?.flaskBlueprintFacts).toMatchObject({
      reExports: [
        {
          exportedName: "public_blueprint",
          importedBlueprintName: "catalog",
          moduleSpecifier: ".catalog"
        }
      ]
    });
    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/v1/catalog/health",
        route: {
          kind: "route",
          name: "GET /v1/catalog/health",
          filePath: "app/routes/internal/catalog.py"
        },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.flask.reexported-blueprint.register-blueprint.decorator.local-function",
            stage: "module",
            resolutionPath: [
              "app/main.py",
              "app/routes/__init__.py",
              "app/routes/internal/__init__.py",
              "app/routes/internal/catalog.py"
            ]
          }
        },
        handler: { qualifiedName: "app/routes/internal/catalog.py#health" }
      }
    ]);
  });

  it("projects project-root absolute Flask Blueprint exports through final package initializers", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "from app.routes.catalog import catalog as public_blueprint",
      "app/routes/catalog.py": [
        "from flask import Blueprint",
        "catalog = Blueprint(\"catalog\", __name__, url_prefix=\"/catalog\")",
        "",
        "@catalog.get(\"/health\")",
        "def health():",
        "    return {\"ok\": True}"
      ].join("\n"),
      "app/main.py": [
        "from flask import Flask",
        "from .routes import public_blueprint as relative_blueprint",
        "from app.routes import public_blueprint as absolute_blueprint",
        "app = Flask(__name__)",
        "app.register_blueprint(relative_blueprint, url_prefix=\"/relative\")",
        "app.register_blueprint(absolute_blueprint, url_prefix=\"/absolute\")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const routesFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "app/routes/__init__.py");
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "app/main.py");

    expect(routesFacts?.flaskBlueprintFacts).toMatchObject({
      reExports: [
        {
          exportedName: "public_blueprint",
          importedBlueprintName: "catalog",
          moduleSpecifier: "app.routes.catalog",
          moduleSpecifierKind: "absolute"
        }
      ]
    });
    expect(mainFacts?.flaskBlueprintFacts).toMatchObject({
      importedBlueprintRegistrations: [
        {
          moduleSpecifier: ".routes",
          moduleSpecifierKind: "relative",
          importedBlueprintName: "public_blueprint",
          blueprintName: "relative_blueprint",
          prefix: "/relative"
        },
        {
          moduleSpecifier: "app.routes",
          moduleSpecifierKind: "absolute",
          importedBlueprintName: "public_blueprint",
          blueprintName: "absolute_blueprint",
          prefix: "/absolute"
        }
      ]
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/relative/catalog/health",
          route: expect.objectContaining({
            kind: "route",
            name: "GET /relative/catalog/health",
            filePath: "app/routes/catalog.py"
          }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.flask.reexported-absolute-blueprint.register-blueprint.decorator.local-function",
              stage: "module",
              resolutionPath: ["app/main.py", "app/routes/__init__.py", "app/routes/catalog.py"]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "app/routes/catalog.py#health" })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/absolute/catalog/health",
          route: expect.objectContaining({
            kind: "route",
            name: "GET /absolute/catalog/health",
            filePath: "app/routes/catalog.py"
          }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.flask.project-absolute-reexported-blueprint.register-blueprint.decorator.local-function",
              stage: "module",
              resolutionPath: ["app/main.py", "app/routes/__init__.py", "app/routes/catalog.py"]
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "app/routes/catalog.py#health" })
        })
      ])
    );
  });

  it("rejects unresolved Flask Blueprint package initializer exports", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "from .missing import catalog as public_blueprint",
      "app/main.py": [
        "from flask import Flask",
        "from .routes import public_blueprint",
        "app = Flask(__name__)",
        "app.register_blueprint(public_blueprint, url_prefix=\"/v1\")"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
  });

  it("rejects unresolved project-root absolute Flask Blueprint package initializer exports", async () => {
    const projectPath = await createInlineProject({
      "app/__init__.py": "",
      "app/routes/__init__.py": "from app.routes.missing import catalog as public_blueprint",
      "app/main.py": [
        "from flask import Flask",
        "from .routes import public_blueprint",
        "app = Flask(__name__)",
        "app.register_blueprint(public_blueprint, url_prefix=\"/v1\")"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
  });

  it("does not project Flask Blueprint modules without a proven package boundary", async () => {
    const projectPath = await createInlineProject({
      "app/routes/catalog.py": [
        "from flask import Blueprint",
        "catalog = Blueprint(\"catalog\", __name__)",
        "",
        "@catalog.get(\"/items\")",
        "def items():",
        "    return []"
      ].join("\n"),
      "app/main.py": [
        "from flask import Flask",
        "from .routes.catalog import catalog",
        "app = Flask(__name__)",
        "app.register_blueprint(catalog, url_prefix=\"/api\")"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
  });

  it("does not project project-root absolute Flask Blueprint imports without a proven package boundary", async () => {
    const projectPath = await createInlineProject({
      "app/routes/catalog.py": [
        "from flask import Blueprint",
        "catalog = Blueprint(\"catalog\", __name__)",
        "",
        "@catalog.get(\"/items\")",
        "def items():",
        "    return []"
      ].join("\n"),
      "app/main.py": [
        "from flask import Flask",
        "from app.routes.catalog import catalog",
        "app = Flask(__name__)",
        "app.register_blueprint(catalog, url_prefix=\"/api\")"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
  });

  it("projects package-relative Django URLConf modules through literal include prefixes", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/catalog/__init__.py": "",
      "project/catalog/urls.py": [
        "from django.urls import path as url",
        "",
        "def items(request):",
        "    return None",
        "",
        "urlpatterns = [url('items/', items)]"
      ].join("\n"),
      "project/urls.py": [
        "from django.urls import include as mount, path as url",
        "from .catalog import urls as catalog_urls",
        "",
        "urlpatterns = [url('api/', mount(catalog_urls))]"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "ALL", pathPrefix: "/api/" });
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "project/urls.py");
    const childFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "project/catalog/urls.py");

    expect(mainFacts?.djangoUrlFacts).toMatchObject({
      importedUrlconfInclusions: [
        {
          urlconfName: "catalog_urls",
          importedUrlconfName: "urls",
          moduleSpecifier: ".catalog.urls",
          prefix: "/api/"
        }
      ]
    });
    expect(childFacts?.djangoUrlFacts).toMatchObject({
      routes: [{ path: "/items/" }]
    });
    expect(routes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/api/items/",
        route: {
          kind: "route",
          name: "ALL /api/items/",
          filePath: "project/catalog/urls.py"
        },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django.imported-urlconf.path.include.local-function",
            stage: "module",
            resolutionPath: ["project/urls.py", "project/catalog/urls.py"]
          }
        },
        handler: { qualifiedName: "project/catalog/urls.py#items" }
      }
    ]);

    await writeFile(
      join(projectPath, "project", "urls.py"),
      [
        "from django.urls import include as mount, path as url",
        "from .catalog import urls as catalog_urls",
        "",
        "urlpatterns = [url('v2/', mount(catalog_urls))]"
      ].join("\n"),
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const routesAfterSync = await service.routes(projectPath, { method: "ALL", pathPrefix: "/v2/" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      modifiedFiles: ["project/urls.py"],
      reExtractedFiles: ["project/urls.py"],
      reusedArtifactFiles: expect.arrayContaining(["project/catalog/urls.py"])
    });
    expect(routesAfterSync.routes).toMatchObject([
      {
        method: "ALL",
        path: "/v2/items/",
        route: { name: "ALL /v2/items/", filePath: "project/catalog/urls.py" },
        handler: { qualifiedName: "project/catalog/urls.py#items" }
      }
    ]);
  });

  it("projects static Django re_path URLConf inclusion prefixes with exact evidence", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/catalog/__init__.py": "",
      "project/catalog/urls.py": [
        "from django.urls import path",
        "",
        "def items(request):",
        "    return None",
        "",
        "urlpatterns = [path('items/', items)]"
      ].join("\n"),
      "project/urls.py": [
        "from django.urls import include, re_path",
        "from .catalog import urls as catalog_urls",
        "",
        "urlpatterns = [re_path(r'^api/', include(catalog_urls))]"
      ].join("\n"),
      "project/literal_urls.py": [
        "from django.urls import include, re_path",
        "",
        "urlpatterns = [re_path('^internal/', include('project.catalog.urls'))]"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const importedRoutes = await service.routes(projectPath, { method: "ALL", pathPrefix: "/api/" });
    const literalRoutes = await service.routes(projectPath, { method: "ALL", pathPrefix: "/internal/" });
    const importedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "project/urls.py");
    const literalFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "project/literal_urls.py");

    expect(importedFacts?.djangoUrlFacts).toMatchObject({
      importedUrlconfInclusions: [{ factory: "re_path", prefix: "/api/" }]
    });
    expect(literalFacts?.djangoUrlFacts).toMatchObject({
      literalUrlconfInclusions: [{ factory: "re_path", prefix: "/internal/" }]
    });
    expect(importedRoutes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/api/items/",
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django.imported-urlconf.re-path.include.local-function",
            stage: "module",
            resolutionPath: ["project/urls.py", "project/catalog/urls.py"]
          }
        },
        handler: { qualifiedName: "project/catalog/urls.py#items" }
      }
    ]);
    expect(literalRoutes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/internal/items/",
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django.literal-urlconf.re-path.include.local-function",
            stage: "module",
            resolutionPath: ["project/literal_urls.py", "project/catalog/urls.py"]
          }
        },
        handler: { qualifiedName: "project/catalog/urls.py#items" }
      }
    ]);
  });

  it("projects legacy Django url routes and URLConf inclusion prefixes with exact evidence", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/catalog/__init__.py": "",
      "project/catalog/urls.py": [
        "from django.conf.urls import url",
        "",
        "def items(request):",
        "    return None",
        "",
        "urlpatterns = [url(r'^items/$', items)]"
      ].join("\n"),
      "project/urls.py": [
        "from django.conf.urls import include, url",
        "from .catalog import urls as catalog_urls",
        "",
        "def health(request):",
        "    return None",
        "",
        "urlpatterns = [",
        "    url(r'^health/$', health),",
        "    url(r'^api/', include(catalog_urls)),",
        "]"
      ].join("\n"),
      "project/literal_urls.py": [
        "from django.conf.urls import include, url",
        "",
        "urlpatterns = [url(r'^internal/', include('project.catalog.urls'))]"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const directRoutes = await service.routes(projectPath, { method: "ALL", pathPrefix: "/health/" });
    const importedRoutes = await service.routes(projectPath, { method: "ALL", pathPrefix: "/api/" });
    const literalRoutes = await service.routes(projectPath, { method: "ALL", pathPrefix: "/internal/" });
    const importedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "project/urls.py");
    const literalFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "project/literal_urls.py");

    expect(importedFacts?.djangoUrlFacts).toMatchObject({
      importedUrlconfInclusions: [{ factory: "url", prefix: "/api/" }]
    });
    expect(literalFacts?.djangoUrlFacts).toMatchObject({
      literalUrlconfInclusions: [{ factory: "url", prefix: "/internal/" }]
    });
    expect(directRoutes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/health/",
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django.direct-urlpatterns.url.local-function",
            stage: "syntax"
          }
        },
        handler: { qualifiedName: "project/urls.py#health" }
      }
    ]);
    expect(importedRoutes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/api/items/",
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django.imported-urlconf.url.include.local-function",
            stage: "module",
            resolutionPath: ["project/urls.py", "project/catalog/urls.py"]
          }
        },
        handler: { qualifiedName: "project/catalog/urls.py#items" }
      }
    ]);
    expect(literalRoutes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/internal/items/",
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django.literal-urlconf.url.include.local-function",
            stage: "module",
            resolutionPath: ["project/literal_urls.py", "project/catalog/urls.py"]
          }
        },
        handler: { qualifiedName: "project/catalog/urls.py#items" }
      }
    ]);
  });

  it("projects Django Class.as_view routes through static URLConf prefixes", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/catalog/__init__.py": "",
      "project/catalog/urls.py": [
        "from django.urls import path",
        "from django.views import View",
        "",
        "class CatalogView(View):",
        "    pass",
        "",
        "urlpatterns = [path('items/', CatalogView.as_view())]"
      ].join("\n"),
      "project/urls.py": [
        "from django.urls import include, re_path",
        "from .catalog import urls as catalog_urls",
        "",
        "urlpatterns = [re_path(r'^api/', include(catalog_urls))]"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const routes = await service.routes(projectPath, { method: "ALL", pathPrefix: "/api/" });
    const childFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "project/catalog/urls.py");

    expect(childFacts?.djangoUrlFacts).toMatchObject({
      routes: [{ path: "/items/", handlerKind: "class-as-view" }]
    });
    expect(routes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/api/items/",
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django.imported-urlconf.re-path.include.local-class-as-view",
            stage: "module",
            resolutionPath: ["project/urls.py", "project/catalog/urls.py"]
          }
        },
        handler: { qualifiedName: "project/catalog/urls.py#CatalogView", kind: "class" }
      }
    ]);
  });

  it("projects re-exported Django URLConfs through static re_path inclusion prefixes", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/routes/__init__.py": "from .catalog.urls import urlpatterns as public_patterns",
      "project/routes/catalog/__init__.py": "",
      "project/routes/catalog/urls.py": [
        "from django.urls import path",
        "",
        "def health(request):",
        "    return None",
        "",
        "urlpatterns = [path('health/', health)]"
      ].join("\n"),
      "project/literal_routes/__init__.py": "from .catalog.urls import urlpatterns",
      "project/literal_routes/catalog/__init__.py": "",
      "project/literal_routes/catalog/urls.py": [
        "from django.urls import path",
        "",
        "def status(request):",
        "    return None",
        "",
        "urlpatterns = [path('status/', status)]"
      ].join("\n"),
      "project/urls.py": [
        "from django.urls import include, re_path",
        "from .routes import public_patterns",
        "",
        "urlpatterns = [re_path(r'^v1/', include(public_patterns))]"
      ].join("\n"),
      "project/literal_urls.py": [
        "from django.urls import include, re_path",
        "",
        "urlpatterns = [re_path(r'^internal/', include('project.literal_routes'))]"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "ALL", pathPrefix: "/v1/" })).resolves.toMatchObject({
      routes: [
        {
          path: "/v1/health/",
          edge: {
            evidence: {
              ruleId: "framework.django.reexported-urlconf.re-path.include.local-function",
              resolutionPath: [
                "project/urls.py",
                "project/routes/__init__.py",
                "project/routes/catalog/urls.py"
              ]
            }
          },
          handler: { qualifiedName: "project/routes/catalog/urls.py#health" }
        }
      ]
    });
    await expect(
      service.routes(projectPath, { method: "ALL", pathPrefix: "/internal/" })
    ).resolves.toMatchObject({
      routes: [
        {
          path: "/internal/status/",
          edge: {
            evidence: {
              ruleId: "framework.django.literal-urlconf.reexported-re-path.include.local-function",
              resolutionPath: [
                "project/literal_urls.py",
                "project/literal_routes/__init__.py",
                "project/literal_routes/catalog/urls.py"
              ]
            }
          },
          handler: { qualifiedName: "project/literal_routes/catalog/urls.py#status" }
        }
      ]
    });
  });

  it("projects re-exported Django URLConfs through static legacy url inclusion prefixes", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/routes/__init__.py": "from .catalog.urls import urlpatterns as public_patterns",
      "project/routes/catalog/__init__.py": "",
      "project/routes/catalog/urls.py": [
        "from django.conf.urls import url",
        "",
        "def health(request):",
        "    return None",
        "",
        "urlpatterns = [url(r'^health/$', health)]"
      ].join("\n"),
      "project/literal_routes/__init__.py": "from .catalog.urls import urlpatterns",
      "project/literal_routes/catalog/__init__.py": "",
      "project/literal_routes/catalog/urls.py": [
        "from django.conf.urls import url",
        "",
        "def status(request):",
        "    return None",
        "",
        "urlpatterns = [url(r'^status/$', status)]"
      ].join("\n"),
      "project/urls.py": [
        "from django.conf.urls import include, url",
        "from .routes import public_patterns",
        "",
        "urlpatterns = [url(r'^v1/', include(public_patterns))]"
      ].join("\n"),
      "project/literal_urls.py": [
        "from django.conf.urls import include, url",
        "",
        "urlpatterns = [url(r'^internal/', include('project.literal_routes'))]"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "ALL", pathPrefix: "/v1/" })).resolves.toMatchObject({
      routes: [
        {
          path: "/v1/health/",
          edge: {
            evidence: {
              ruleId: "framework.django.reexported-urlconf.url.include.local-function",
              resolutionPath: [
                "project/urls.py",
                "project/routes/__init__.py",
                "project/routes/catalog/urls.py"
              ]
            }
          },
          handler: { qualifiedName: "project/routes/catalog/urls.py#health" }
        }
      ]
    });
    await expect(
      service.routes(projectPath, { method: "ALL", pathPrefix: "/internal/" })
    ).resolves.toMatchObject({
      routes: [
        {
          path: "/internal/status/",
          edge: {
            evidence: {
              ruleId: "framework.django.literal-urlconf.reexported-url.include.local-function",
              resolutionPath: [
                "project/literal_urls.py",
                "project/literal_routes/__init__.py",
                "project/literal_routes/catalog/urls.py"
              ]
            }
          },
          handler: { qualifiedName: "project/literal_routes/catalog/urls.py#status" }
        }
      ]
    });
  });

  it("projects re-exported Django Class.as_view URLConfs through static legacy url prefixes", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/routes/__init__.py": "from .catalog.urls import urlpatterns as public_patterns",
      "project/routes/catalog/__init__.py": "",
      "project/routes/catalog/urls.py": [
        "from django.urls import path",
        "from django.views import View",
        "",
        "class HealthView(View):",
        "    pass",
        "",
        "urlpatterns = [path('health/', HealthView.as_view())]"
      ].join("\n"),
      "project/literal_routes/__init__.py": "from .catalog.urls import urlpatterns",
      "project/literal_routes/catalog/__init__.py": "",
      "project/literal_routes/catalog/urls.py": [
        "from django.urls import path",
        "from django.views import View",
        "",
        "class StatusView(View):",
        "    pass",
        "",
        "urlpatterns = [path('status/', StatusView.as_view())]"
      ].join("\n"),
      "project/urls.py": [
        "from django.conf.urls import include, url",
        "from .routes import public_patterns",
        "",
        "urlpatterns = [url(r'^v1/', include(public_patterns))]"
      ].join("\n"),
      "project/literal_urls.py": [
        "from django.conf.urls import include, url",
        "",
        "urlpatterns = [url(r'^internal/', include('project.literal_routes'))]"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "ALL", pathPrefix: "/v1/" })).resolves.toMatchObject({
      routes: [
        {
          path: "/v1/health/",
          edge: {
            evidence: {
              ruleId: "framework.django.reexported-urlconf.url.include.local-class-as-view",
              resolutionPath: [
                "project/urls.py",
                "project/routes/__init__.py",
                "project/routes/catalog/urls.py"
              ]
            }
          },
          handler: { qualifiedName: "project/routes/catalog/urls.py#HealthView", kind: "class" }
        }
      ]
    });
    await expect(
      service.routes(projectPath, { method: "ALL", pathPrefix: "/internal/" })
    ).resolves.toMatchObject({
      routes: [
        {
          path: "/internal/status/",
          edge: {
            evidence: {
              ruleId: "framework.django.literal-urlconf.reexported-url.include.local-class-as-view",
              resolutionPath: [
                "project/literal_urls.py",
                "project/literal_routes/__init__.py",
                "project/literal_routes/catalog/urls.py"
              ]
            }
          },
          handler: { qualifiedName: "project/literal_routes/catalog/urls.py#StatusView", kind: "class" }
        }
      ]
    });
  });

  it("projects literal Django URLConf module strings through regular packages", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/catalog/__init__.py": "",
      "project/catalog/urls.py": [
        "from django.urls import path",
        "",
        "def items(request):",
        "    return None",
        "",
        "urlpatterns = [path('items/', items)]"
      ].join("\n"),
      "project/urls.py": [
        "from django.urls import include, path",
        "",
        "urlpatterns = [path('api/', include('project.catalog.urls'))]"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "ALL", pathPrefix: "/api/" });
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "project/urls.py");

    expect(mainFacts?.djangoUrlFacts).toMatchObject({
      literalUrlconfInclusions: [
        {
          moduleSpecifier: "project.catalog.urls",
          prefix: "/api/"
        }
      ]
    });
    expect(routes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/api/items/",
        route: {
          kind: "route",
          name: "ALL /api/items/",
          filePath: "project/catalog/urls.py"
        },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django.literal-urlconf.path.include.local-function",
            stage: "module",
            resolutionPath: ["project/urls.py", "project/catalog/urls.py"]
          }
        },
        handler: { qualifiedName: "project/catalog/urls.py#items" }
      }
    ]);
  });

  it("projects literal Django URLConf module packages through final URLConf exports", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/routes/__init__.py": "from .catalog.urls import urlpatterns",
      "project/routes/catalog/__init__.py": "",
      "project/routes/catalog/urls.py": [
        "from django.urls import path",
        "",
        "def health(request):",
        "    return None",
        "",
        "urlpatterns = [path('health/', health)]"
      ].join("\n"),
      "project/urls.py": [
        "from django.urls import include, path",
        "",
        "urlpatterns = [path('v1/', include('project.routes'))]"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "ALL", pathPrefix: "/v1/" })).resolves.toMatchObject({
      routes: [
        {
          method: "ALL",
          path: "/v1/health/",
          route: {
            name: "ALL /v1/health/",
            filePath: "project/routes/catalog/urls.py"
          },
          edge: {
            kind: "routes",
            resolution: "exact",
            evidence: {
              ruleId: "framework.django.literal-urlconf.reexported-path.include.local-function",
              stage: "module",
              resolutionPath: [
                "project/urls.py",
                "project/routes/__init__.py",
                "project/routes/catalog/urls.py"
              ]
            }
          },
          handler: { qualifiedName: "project/routes/catalog/urls.py#health" }
        }
      ]
    });
  });

  it("projects Django URLConf exports through nested package initializers", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/routes/__init__.py": "from .internal import urlpatterns as public_patterns",
      "project/routes/internal/__init__.py": "from .catalog.urls import urlpatterns",
      "project/routes/internal/catalog/__init__.py": "",
      "project/routes/internal/catalog/urls.py": [
        "from django.urls import path",
        "",
        "def health(request):",
        "    return None",
        "",
        "urlpatterns = [path('health/', health)]"
      ].join("\n"),
      "project/urls.py": [
        "from django.urls import include, path",
        "from .routes import public_patterns as mounted_patterns",
        "",
        "urlpatterns = [path('v1/', include(mounted_patterns))]"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "ALL", pathPrefix: "/v1/" });
    const routesFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "project/routes/__init__.py");
    const internalFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "project/routes/internal/__init__.py");

    expect(routesFacts?.djangoUrlFacts).toMatchObject({
      reExports: [
        {
          exportedName: "public_patterns",
          importedUrlconfName: "urlpatterns",
          moduleSpecifier: ".internal"
        }
      ]
    });
    expect(internalFacts?.djangoUrlFacts).toMatchObject({
      reExports: [
        {
          exportedName: "urlpatterns",
          importedUrlconfName: "urlpatterns",
          moduleSpecifier: ".catalog.urls"
        }
      ]
    });
    expect(routes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/v1/health/",
        route: {
          kind: "route",
          name: "ALL /v1/health/",
          filePath: "project/routes/internal/catalog/urls.py"
        },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: {
            ruleId: "framework.django.reexported-urlconf.path.include.local-function",
            stage: "module",
            resolutionPath: [
              "project/urls.py",
              "project/routes/__init__.py",
              "project/routes/internal/__init__.py",
              "project/routes/internal/catalog/urls.py"
            ]
          }
        },
        handler: { qualifiedName: "project/routes/internal/catalog/urls.py#health" }
      }
    ]);
  });

  it("rejects unresolved Django URLConf package initializer exports", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/routes/__init__.py": "from .missing import urlpatterns as public_patterns",
      "project/urls.py": [
        "from django.urls import include, path",
        "from .routes import public_patterns",
        "",
        "urlpatterns = [path('v1/', include(public_patterns))]"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "ALL", pathPrefix: "/v1/" })).resolves.toMatchObject({
      routes: []
    });
  });

  it("does not project Django URLConf modules without a proven package boundary", async () => {
    const projectPath = await createInlineProject({
      "project/catalog/urls.py": [
        "from django.urls import path",
        "",
        "def items(request):",
        "    return None",
        "",
        "urlpatterns = [path('items/', items)]"
      ].join("\n"),
      "project/urls.py": [
        "from django.urls import include, path",
        "from .catalog import urls as catalog_urls",
        "",
        "urlpatterns = [path('api/', include(catalog_urls))]"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(
      service.routes(projectPath, { method: "ALL", pathPrefix: "/api/" })
    ).resolves.toMatchObject({ routes: [] });
  });

  it("does not project literal Django URLConf module strings without a proven package boundary", async () => {
    const projectPath = await createInlineProject({
      "project/catalog/urls.py": [
        "from django.urls import path",
        "",
        "def items(request):",
        "    return None",
        "",
        "urlpatterns = [path('items/', items)]"
      ].join("\n"),
      "project/urls.py": [
        "from django.urls import include, path",
        "",
        "urlpatterns = [path('api/', include('project.catalog.urls'))]"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(
      service.routes(projectPath, { method: "ALL", pathPrefix: "/api/" })
    ).resolves.toMatchObject({ routes: [] });
  });

  it("does not project ambiguous literal Django URLConf module file/package targets", async () => {
    const projectPath = await createInlineProject({
      "project/__init__.py": "",
      "project/catalog/__init__.py": "",
      "project/catalog/urls.py": [
        "from django.urls import path",
        "",
        "def items(request):",
        "    return None",
        "",
        "urlpatterns = [path('items/', items)]"
      ].join("\n"),
      "project/catalog/urls/__init__.py": "",
      "project/urls.py": [
        "from django.urls import include, path",
        "",
        "urlpatterns = [path('api/', include('project.catalog.urls'))]"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(
      service.routes(projectPath, { method: "ALL", pathPrefix: "/api/" })
    ).resolves.toMatchObject({ routes: [] });
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

  it("indexes Go Iris v12 Application, Party, and Handle routes with exact syntax evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        'import "github.com/kataras/iris/v12"',
        "",
        "func health(ctx iris.Context) {}",
        "func deleteUser(ctx iris.Context) {}",
        "",
        "func main() {",
        "  app := iris.New()",
        '  app.Get("/health", health)',
        '  api := app.Party("/api")',
        '  api.Handle("DELETE", "/users", deleteUser)',
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
              ruleId: "framework.iris.direct-app.method.local-function",
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
              ruleId: "framework.iris.direct-party.handle.local-function",
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
          evidence: { ruleId: "framework.iris.direct-party.handle.local-function", stage: "syntax" }
        }
      }
    ]);
  });

  it("indexes Go Beego v2 functional routes with exact syntax evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        'import "github.com/beego/beego/v2/server/web"',
        "",
        "func health() {}",
        "func deleteUser() {}",
        "",
        "func main() {",
        '  web.Get("/health", health)',
        '  web.Delete("/users/{id}", deleteUser)',
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
              ruleId: "framework.beego.direct-package-function.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "DELETE",
          path: "/users/{id}",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#deleteUser" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.beego.direct-package-function.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(deleteRoutes.routes).toMatchObject([
      {
        method: "DELETE",
        path: "/users/{id}",
        handler: { qualifiedName: "cmd/server/main.go#deleteUser" },
        edge: {
          resolution: "exact",
          evidence: { ruleId: "framework.beego.direct-package-function.local-function", stage: "syntax" }
        }
      }
    ]);
  });

  it("indexes Gorilla/mux literal HandleFunc Methods chains with exact syntax evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        "import (",
        '  "net/http"',
        '  "github.com/gorilla/mux"',
        ")",
        "",
        "func health(w http.ResponseWriter, r *http.Request) {}",
        "func updateUser(w http.ResponseWriter, r *http.Request) {}",
        "",
        "func main() {",
        "  router := mux.NewRouter()",
        '  router.HandleFunc("/health", health)',
        '  router.HandleFunc("/users/{id}", updateUser).Methods("PUT", "PATCH")',
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const patchRoutes = await service.routes(projectPath, { method: "PATCH" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "ALL",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.gorilla-mux.direct-router.handle-func.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "PUT",
          path: "/users/{id}",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#updateUser" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.gorilla-mux.direct-router.handle-func-methods.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/users/{id}",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#updateUser" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.gorilla-mux.direct-router.handle-func-methods.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(patchRoutes.routes).toMatchObject([
      {
        method: "PATCH",
        path: "/users/{id}",
        handler: { qualifiedName: "cmd/server/main.go#updateUser" },
        edge: {
          resolution: "exact",
          evidence: {
            ruleId: "framework.gorilla-mux.direct-router.handle-func-methods.local-function",
            stage: "syntax"
          }
        }
      }
    ]);
  });

  it("indexes httprouter direct methods with exact syntax evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        "import (",
        '  "net/http"',
        '  "github.com/julienschmidt/httprouter"',
        ")",
        "",
        "func health(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {}",
        "func updateUser(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {}",
        "",
        "func main() {",
        "  router := httprouter.New()",
        '  router.GET("/health", health)',
        '  router.PATCH("/users/:id", updateUser)',
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const patchRoutes = await service.routes(projectPath, { method: "PATCH" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.httprouter.direct-router.method.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/users/:id",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#updateUser" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.httprouter.direct-router.method.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(patchRoutes.routes).toMatchObject([
      {
        method: "PATCH",
        path: "/users/:id",
        handler: { qualifiedName: "cmd/server/main.go#updateUser" },
        edge: {
          resolution: "exact",
          evidence: { ruleId: "framework.httprouter.direct-router.method.local-function", stage: "syntax" }
        }
      }
    ]);
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

  it("indexes GoFrame direct and same-file standard-router routes with exact evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        "import (",
        '  "context"',
        '  "github.com/gogf/gf/v2/frame/g"',
        '  "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"get"`',
        "}",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) List(ctx context.Context, req *ListReq) (res *ListRes, err error) {",
        "  return",
        "}",
        "",
        "func (c *Controller) Total(r *ghttp.Request) {}",
        "",
        "func health(ctx context.Context, req *HealthReq) (res *HealthRes, err error) {",
        "  return",
        "}",
        "",
        "func groupHealth(ctx context.Context, req *GroupHealthReq) (res *GroupHealthRes, err error) {",
        "  return",
        "}",
        "",
        "func main() {",
        "  server := g.Server()",
        '  server.BindHandler("GET:/health", health)',
        "  controller := &Controller{}",
        '  server.BindHandler("GET:/total", controller.Total)',
        '  api := server.Group("/api")',
        '  api.GET("/group-health", groupHealth)',
        "  api.Bind(&Controller{})",
        '  server.Group("/callback", func(group *ghttp.RouterGroup) {',
        '    group.POST("/method", controller.Total)',
        "    group.Bind(&Controller{})",
        "  })",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-server.bind-handler.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/api/group-health",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#groupHealth" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-group.http-method.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/total",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Total" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-server.bind-handler.local-object-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/callback/method",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Total" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-group.http-method.local-object-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/api/users",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.List" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.direct-bound-controller.local-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/callback/users",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.List" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.direct-bound-controller.local-method",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(getRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/total",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Total" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-server.bind-handler.local-object-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/callback/users",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.List" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.direct-bound-controller.local-method",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(getRoutes.routes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "POST", path: "/callback/method" })
      ])
    );
    expect(
      routes.routes.filter(
        (route) =>
          route.path === "/api/users" &&
          route.handler?.qualifiedName === "cmd/server/main.go#Controller.List"
      )
    ).toHaveLength(1);
  });

  it("persists exact GoFrame routes through literal chained Domain and Group receivers", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        "import (",
        '  "context"',
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  ghttp "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) List(ctx context.Context, req *ListReq) {}",
        "func health(r *ghttp.Request) {}",
        "",
        "func main() {",
        '  g.Server().Domain("api.example.test").Group("/api").Group("/v1").GET("/health", health)',
        '  api := g.Server().Domain("api.example.test").Group("/api").Group("/v1")',
        "  api.Bind(&Controller{})",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { domain: "api.example.test" });

    expect(routes.routes).toHaveLength(2);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/api/v1/health",
          domain: "api.example.test",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-group.http-method.local-function",
              routeDomain: "api.example.test"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/api/v1/users",
          domain: "api.example.test",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.List" }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.direct-bound-controller.local-method",
              routeDomain: "api.example.test"
            })
          })
        })
      ])
    );

    await writeFile(join(projectPath, "unrelated.go"), "package main\n\nconst Ready = true\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { domain: "api.example.test" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["unrelated.go"],
      reusedArtifactFiles: ["cmd/server/main.go"]
    });
    expect(routesAfterReuse.routes).toHaveLength(2);
  });

  it("projects GoFrame standard-router routes across one proven package directory", async () => {
    const projectPath = await createInlineProject({
      "api/request.go": [
        "package api",
        "",
        "import \"github.com/gogf/gf/v2/frame/g\"",
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controller.go": [
        "package api",
        "",
        "import \"context\"",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) List(ctx context.Context, req *ListReq) (res *ListRes, err error) {",
        "  return",
        "}"
      ].join("\n"),
      "api/routes.go": [
        "package api",
        "",
        "import \"github.com/gogf/gf/v2/frame/g\"",
        "",
        "func Register() {",
        '  g.Server().Domain("api.example.test, api-alt.example.test").Group("/v1").Bind(&Controller{})',
        "}"
      ].join("\n"),
      "other/request.go": [
        "package other",
        "",
        "import \"github.com/gogf/gf/v2/frame/g\"",
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/wrong" method:"GET"`',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const requestFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/request.go");
    const controllerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/controller.go");
    const bindingFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/routes.go");

    expect(requestFacts?.goFrameStandardRouterFacts).toMatchObject({
      packageName: "api",
      requests: [{ name: "ListReq", method: "GET", path: "/users" }]
    });
    expect(controllerFacts?.goFrameStandardRouterFacts).toMatchObject({
      packageName: "api",
      controllerMethods: [
        expect.objectContaining({
          controllerName: "Controller",
          methodName: "List",
          requestType: "ListReq",
          handlerId: expect.any(String)
        })
      ]
    });
    expect(bindingFacts?.goFrameStandardRouterFacts).toMatchObject({
      packageName: "api",
      controllerBindings: [
        {
          controllerName: "Controller",
          prefix: "/v1",
          domains: ["api.example.test", "api-alt.example.test"]
        }
      ]
    });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          domain: "api.example.test",
          handler: expect.objectContaining({ qualifiedName: "api/controller.go#Controller.List" }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.same-package.cross-file",
              stage: "module",
              routeDomain: "api.example.test",
              resolutionPath: ["api/request.go", "api/controller.go", "api/routes.go"]
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          domain: "api-alt.example.test",
          handler: expect.objectContaining({ qualifiedName: "api/controller.go#Controller.List" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.same-package.cross-file",
              routeDomain: "api-alt.example.test"
            })
          })
        })
      ])
    );
    expect(routes.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/v1/wrong" })])
    );

    await writeFile(join(projectPath, "unrelated.go"), "package unrelated\n\nconst Ready = true\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { domain: "api.example.test" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["unrelated.go"],
      reusedArtifactFiles: ["api/controller.go", "api/request.go", "api/routes.go", "other/request.go"]
    });
    expect(routesAfterReuse.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          domain: "api.example.test",
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.same-package.cross-file"
            })
          })
        })
      ])
    );

  });

  it("projects a GoFrame factory-bound standard route across one proven package directory", async () => {
    const projectPath = await createInlineProject({
      "api/request.go": [
        "package api",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controller.go": [
        "package api",
        "",
        'import "context"',
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) List(ctx context.Context, req *ListReq) {}"
      ].join("\n"),
      "api/factory.go": [
        "package api",
        "",
        "func NewController() *Controller { return &Controller{} }"
      ].join("\n"),
      "api/routes.go": [
        "package api",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "func Register() {",
        '  g.Server().Domain("api.example.test").Group("/v1").Bind(NewController())',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { domain: "api.example.test" });
    const factoryFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/factory.go");
    const bindingFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/routes.go");

    expect(factoryFacts?.goFrameStandardRouterFacts).toMatchObject({
      controllerFactories: [
        expect.objectContaining({
          factoryName: "NewController",
          controllerName: "Controller"
        })
      ]
    });
    expect(bindingFacts?.goFrameStandardRouterFacts).toMatchObject({
      controllerFactoryBindings: [
        expect.objectContaining({
          factoryName: "NewController",
          prefix: "/v1",
          domains: ["api.example.test"]
        })
      ]
    });
    expect(routes.routes).toHaveLength(1);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          domain: "api.example.test",
          handler: expect.objectContaining({ qualifiedName: "api/controller.go#Controller.List" }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.same-package.factory-bind",
              stage: "module",
              routeDomain: "api.example.test",
              resolutionPath: [
                "api/request.go",
                "api/controller.go",
                "api/factory.go",
                "api/routes.go"
              ]
            })
          })
        })
      ])
    );

    await writeFile(join(projectPath, "unrelated.go"), "package api\n\nconst Ready = true\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { domain: "api.example.test" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["unrelated.go"],
      reusedArtifactFiles: ["api/controller.go", "api/factory.go", "api/request.go", "api/routes.go"]
    });
    expect(routesAfterReuse.routes).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/v1/users" })])
    );
  });

  it("projects a fully same-file GoFrame factory Bind through module evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        "import (",
        '  "context"',
        '  g "github.com/gogf/gf/v2/frame/g"',
        ")",
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}",
        "",
        "type Controller struct{}",
        "",
        "func NewController() *Controller { return new(Controller) }",
        "func (c *Controller) List(ctx context.Context, req *ListReq) {}",
        "",
        "func Register() {",
        '  g.Server().Group("/v1").Bind(NewController())',
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toHaveLength(1);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.List" }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.same-package.factory-bind",
              stage: "module",
              resolutionPath: ["cmd/server/main.go"]
            })
          })
        })
      ])
    );
  });

  it("rejects ambiguous cross-file GoFrame standard-router controller methods", async () => {
    const projectPath = await createInlineProject({
      "api/request.go": [
        "package api",
        "",
        "import \"github.com/gogf/gf/v2/frame/g\"",
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controller.go": [
        "package api",
        "",
        "import \"context\"",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) List(ctx context.Context, req *ListReq) {}",
        "func (c *Controller) Duplicate(ctx context.Context, req *ListReq) {}"
      ].join("\n"),
      "api/routes.go": [
        "package api",
        "",
        "import \"github.com/gogf/gf/v2/frame/g\"",
        "",
        "func Register() {",
        "  server := g.Server()",
        "  server.Bind(&Controller{})",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ method: "GET", path: "/users" })])
    );
  });

  it("projects a GoFrame standard-router route through exact local Go module imports", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "api/request/list.go": [
        "package request",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/request/list_external_test.go": "package request_test\n",
      "api/controller/users.go": [
        "package controller",
        "",
        "import (",
        '  "context"',
        '  request "example.test/warehouse/api/request"',
        ")",
        "",
        "type UsersController struct{}",
        "",
        "func (c *UsersController) List(ctx context.Context, req *request.ListReq) {}"
      ].join("\n"),
      "cmd/server/routes.go": [
        "package main",
        "",
        "import (",
        '  controller "example.test/warehouse/api/controller"',
        '  "github.com/gogf/gf/v2/frame/g"',
        ")",
        "",
        "func Register() {",
        "  server := g.Server()",
        '  domain := server.Domain("api.example.test")',
        '  api := domain.Group("/v1")',
        "  api.Bind(&controller.UsersController{})",
        "}"
      ].join("\n"),
      "other/request.go": [
        "package other",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/wrong" method:"GET"`',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { domain: "api.example.test" });
    const controllerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/controller/users.go");
    const bindingFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "cmd/server/routes.go");

    expect(controllerFacts?.goFrameStandardRouterFacts).toMatchObject({
      controllerMethods: [
        expect.objectContaining({
          controllerName: "UsersController",
          requestType: "ListReq",
          requestPackageAlias: "request"
        })
      ],
      imports: expect.arrayContaining([
        expect.objectContaining({
          localName: "request",
          moduleSpecifier: "example.test/warehouse/api/request"
        })
      ])
    });
    expect(bindingFacts?.goFrameStandardRouterFacts).toMatchObject({
      controllerBindings: [
        expect.objectContaining({
          controllerName: "UsersController",
          controllerPackageAlias: "controller"
        })
      ],
      imports: expect.arrayContaining([
        expect.objectContaining({
          localName: "controller",
          moduleSpecifier: "example.test/warehouse/api/controller"
        })
      ])
    });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          domain: "api.example.test",
          handler: expect.objectContaining({
            qualifiedName: "api/controller/users.go#UsersController.List"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.go-module.cross-package",
              stage: "module",
              resolutionPath: [
                "api/request/list.go",
                "api/controller/users.go",
                "cmd/server/routes.go"
              ],
              configurationPaths: ["go.mod"]
            })
          })
        })
      ])
    );
    expect(routes.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/v1/wrong" })])
    );

    await writeFile(join(projectPath, "unrelated.go"), "package main\n\nconst Ready = true\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { domain: "api.example.test" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["unrelated.go"],
      reusedArtifactFiles: [
        "api/controller/users.go",
        "api/request/list.go",
        "api/request/list_external_test.go",
        "cmd/server/routes.go",
        "other/request.go"
      ]
    });
    expect(routesAfterReuse.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.go-module.cross-package",
              configurationPaths: ["go.mod"]
            })
          })
        })
      ])
    );

    await writeFile(
      join(projectPath, "api", "request", "go.mod"),
      "module example.test/warehouse/api/request\n\ngo 1.22\n",
      "utf8"
    );
    const syncedAfterNestedModule = await service.sync({ projectPath });
    const routesAfterNestedModule = await service.routes(projectPath, {
      domain: "api.example.test"
    });

    expect(syncedAfterNestedModule.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: [],
      reusedArtifactFiles: expect.arrayContaining([
        "api/controller/users.go",
        "api/request/list.go",
        "cmd/server/routes.go"
      ])
    });
    expect(routesAfterNestedModule.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/v1/users" })])
    );
  });

  it("projects GoFrame standard-router routes through package-proven default Go imports", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "api/requests/list.go": [
        "package contracts",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/broken/list.go": [
        "package unexpected",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/wrong" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controllers/users.go": [
        "package handlers",
        "",
        "import (",
        '  "context"',
        '  "example.test/warehouse/api/requests"',
        ")",
        "",
        "type UsersController struct{}",
        "",
        "func (c *UsersController) List(ctx context.Context, req *contracts.ListReq) {}"
      ].join("\n"),
      "api/controllers/bad.go": [
        "package handlers",
        "",
        "import (",
        '  "context"',
        '  "example.test/warehouse/api/broken"',
        ")",
        "",
        "type BadController struct{}",
        "",
        "func (c *BadController) List(ctx context.Context, req *broken.ListReq) {}"
      ].join("\n"),
      "cmd/server/routes.go": [
        "package main",
        "",
        "import (",
        '  "example.test/warehouse/api/controllers"',
        '  "github.com/gogf/gf/v2/frame/g"',
        ")",
        "",
        "func Register() {",
        '  g.Server().Domain("api.example.test").Group("/v1").Bind(&handlers.UsersController{})',
        '  g.Server().Domain("api.example.test").Group("/v1").Bind(&handlers.BadController{})',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { domain: "api.example.test" });
    const controllerFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/controllers/users.go");
    const bindingFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "cmd/server/routes.go");

    expect(routes.routes).toHaveLength(1);
    expect(controllerFacts?.goFrameStandardRouterFacts).toMatchObject({
      controllerMethods: [
        expect.objectContaining({
          controllerName: "UsersController",
          requestPackageAlias: "contracts"
        })
      ],
      imports: expect.arrayContaining([
        expect.objectContaining({ moduleSpecifier: "example.test/warehouse/api/requests" })
      ])
    });
    expect(
      controllerFacts?.goFrameStandardRouterFacts?.imports?.find(
        (candidate) => candidate.moduleSpecifier === "example.test/warehouse/api/requests"
      )
    ).not.toHaveProperty("localName");
    expect(bindingFacts?.goFrameStandardRouterFacts).toMatchObject({
      controllerBindings: expect.arrayContaining([
        expect.objectContaining({
          controllerName: "UsersController",
          controllerPackageAlias: "handlers"
        })
      ]),
      imports: expect.arrayContaining([
        expect.objectContaining({ moduleSpecifier: "example.test/warehouse/api/controllers" })
      ])
    });
    expect(
      bindingFacts?.goFrameStandardRouterFacts?.imports?.find(
        (candidate) => candidate.moduleSpecifier === "example.test/warehouse/api/controllers"
      )
    ).not.toHaveProperty("localName");

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          domain: "api.example.test",
          handler: expect.objectContaining({
            qualifiedName: "api/controllers/users.go#UsersController.List"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.go-module.cross-package",
              stage: "module",
              configurationPaths: ["go.mod"],
              resolutionPath: [
                "api/requests/list.go",
                "api/controllers/users.go",
                "cmd/server/routes.go"
              ]
            })
          })
        })
      ])
    );
    expect(routes.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/v1/wrong" })])
    );

    await writeFile(join(projectPath, "unrelated.go"), "package main\n\nconst Ready = true\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath, { domain: "api.example.test" });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["unrelated.go"],
      reusedArtifactFiles: expect.arrayContaining([
        "api/requests/list.go",
        "api/controllers/users.go",
        "cmd/server/routes.go"
      ])
    });
    expect(routesAfterReuse.routes).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/v1/users" })])
    );
  });

  it("projects a GoFrame factory-bound route through a package-proven default Go import", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "api/requests/list.go": [
        "package contracts",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controllers/users.go": [
        "package handlers",
        "",
        "import (",
        '  "context"',
        '  "example.test/warehouse/api/requests"',
        ")",
        "",
        "type UsersController struct{}",
        "",
        "func NewV1() *UsersController { return &UsersController{} }",
        "func (c *UsersController) List(ctx context.Context, req *contracts.ListReq) {}"
      ].join("\n"),
      "cmd/server/routes.go": [
        "package main",
        "",
        "import (",
        '  "example.test/warehouse/api/controllers"',
        '  "github.com/gogf/gf/v2/frame/g"',
        ")",
        "",
        "func Register() {",
        '  g.Server().Domain("api.example.test").Group("/v1").Bind(handlers.NewV1())',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { domain: "api.example.test" });
    const factoryFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/controllers/users.go");
    const bindingFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "cmd/server/routes.go");

    expect(factoryFacts?.goFrameStandardRouterFacts).toMatchObject({
      packageName: "handlers",
      controllerFactories: [
        expect.objectContaining({ factoryName: "NewV1", controllerName: "UsersController" })
      ]
    });
    expect(bindingFacts?.goFrameStandardRouterFacts).toMatchObject({
      controllerFactoryBindings: [
        expect.objectContaining({
          factoryName: "NewV1",
          factoryPackageAlias: "handlers",
          prefix: "/v1",
          domains: ["api.example.test"]
        })
      ]
    });
    expect(
      bindingFacts?.goFrameStandardRouterFacts?.imports?.find(
        (candidate) => candidate.moduleSpecifier === "example.test/warehouse/api/controllers"
      )
    ).not.toHaveProperty("localName");
    expect(routes.routes).toHaveLength(1);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          domain: "api.example.test",
          handler: expect.objectContaining({
            qualifiedName: "api/controllers/users.go#UsersController.List"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.go-module.factory-bind",
              stage: "module",
              configurationPaths: ["go.mod"],
              resolutionPath: [
                "api/requests/list.go",
                "api/controllers/users.go",
                "cmd/server/routes.go"
              ]
            })
          })
        })
      ])
    );
  });

  it("projects a GoFrame route when a default-imported factory is bound through one local alias", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "api/requests/list.go": [
        "package contracts",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controllers/users.go": [
        "package handlers",
        "",
        "import (",
        '  "context"',
        '  "example.test/warehouse/api/requests"',
        ")",
        "",
        "type UsersController struct{}",
        "",
        "func NewV1() *UsersController { return &UsersController{} }",
        "func (c *UsersController) List(ctx context.Context, req *contracts.ListReq) {}"
      ].join("\n"),
      "cmd/server/routes.go": [
        "package main",
        "",
        "import (",
        '  "example.test/warehouse/api/controllers"',
        '  "github.com/gogf/gf/v2/frame/g"',
        ")",
        "",
        "func Register() {",
        "  controller := handlers.NewV1()",
        '  g.Server().Domain("api.example.test").Group("/v1").Bind(controller)',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { domain: "api.example.test" });
    const bindingFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "cmd/server/routes.go");

    expect(bindingFacts?.goFrameStandardRouterFacts).toMatchObject({
      controllerFactoryBindings: [
        expect.objectContaining({
          factoryName: "NewV1",
          factoryPackageAlias: "handlers",
          prefix: "/v1",
          domains: ["api.example.test"]
        })
      ]
    });
    expect(routes.routes).toHaveLength(1);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          domain: "api.example.test",
          handler: expect.objectContaining({
            qualifiedName: "api/controllers/users.go#UsersController.List"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.go-module.factory-bind",
              stage: "module",
              configurationPaths: ["go.mod"],
              resolutionPath: [
                "api/requests/list.go",
                "api/controllers/users.go",
                "cmd/server/routes.go"
              ]
            })
          })
        })
      ])
    );
  });

  it("projects a GoFrame route when a default-imported factory is bound through one var alias", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "api/requests/list.go": [
        "package contracts",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controllers/users.go": [
        "package handlers",
        "",
        "import (",
        '  "context"',
        '  "example.test/warehouse/api/requests"',
        ")",
        "",
        "type UsersController struct{}",
        "",
        "func NewV1() *UsersController { return &UsersController{} }",
        "func (c *UsersController) List(ctx context.Context, req *contracts.ListReq) {}"
      ].join("\n"),
      "cmd/server/routes.go": [
        "package main",
        "",
        "import (",
        '  "example.test/warehouse/api/controllers"',
        '  "github.com/gogf/gf/v2/frame/g"',
        ")",
        "",
        "func Register() {",
        "  var controller = handlers.NewV1()",
        '  g.Server().Domain("api.example.test").Group("/v1").Bind(controller)',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { domain: "api.example.test" });
    const bindingFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "cmd/server/routes.go");

    expect(bindingFacts?.goFrameStandardRouterFacts).toMatchObject({
      controllerFactoryBindings: [
        expect.objectContaining({
          factoryName: "NewV1",
          factoryPackageAlias: "handlers",
          prefix: "/v1",
          domains: ["api.example.test"]
        })
      ]
    });
    expect(routes.routes).toHaveLength(1);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          domain: "api.example.test",
          handler: expect.objectContaining({
            qualifiedName: "api/controllers/users.go#UsersController.List"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.go-module.factory-bind",
              stage: "module",
              configurationPaths: ["go.mod"],
              resolutionPath: [
                "api/requests/list.go",
                "api/controllers/users.go",
                "cmd/server/routes.go"
              ]
            })
          })
        })
      ])
    );
  });

  it("projects a GoFrame module route when a local controller pointer alias is bound", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "api/requests/list.go": [
        "package contracts",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controllers/users.go": [
        "package handlers",
        "",
        "import (",
        '  "context"',
        '  "example.test/warehouse/api/requests"',
        ")",
        "",
        "type UsersController struct{}",
        "",
        "func (c *UsersController) List(ctx context.Context, req *contracts.ListReq) {}"
      ].join("\n"),
      "cmd/server/routes.go": [
        "package main",
        "",
        "import (",
        '  "example.test/warehouse/api/controllers"',
        '  "github.com/gogf/gf/v2/frame/g"',
        ")",
        "",
        "func Register(unknown interface{}) {",
        "  controller := &handlers.UsersController{}",
        '  g.Server().Domain("api.example.test").Group("/v1").Bind(controller, unknown)',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { domain: "api.example.test" });
    const bindingFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "cmd/server/routes.go");

    expect(bindingFacts?.goFrameStandardRouterFacts?.controllerBindings).toEqual([
      expect.objectContaining({
        controllerName: "UsersController",
        controllerPackageAlias: "handlers",
        prefix: "/v1",
        domains: ["api.example.test"]
      })
    ]);
    expect(routes.routes).toHaveLength(1);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          domain: "api.example.test",
          handler: expect.objectContaining({
            qualifiedName: "api/controllers/users.go#UsersController.List"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.go-module.cross-package",
              stage: "module",
              configurationPaths: ["go.mod"],
              resolutionPath: [
                "api/requests/list.go",
                "api/controllers/users.go",
                "cmd/server/routes.go"
              ]
            })
          })
        })
      ])
    );
  });

  it("projects a GoFrame module route when a typed var controller alias is bound", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "api/requests/list.go": [
        "package contracts",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controllers/users.go": [
        "package handlers",
        "",
        "import (",
        '  "context"',
        '  "example.test/warehouse/api/requests"',
        ")",
        "",
        "type UsersController struct{}",
        "",
        "func (c *UsersController) List(ctx context.Context, req *contracts.ListReq) {}"
      ].join("\n"),
      "cmd/server/routes.go": [
        "package main",
        "",
        "import (",
        '  "example.test/warehouse/api/controllers"',
        '  "github.com/gogf/gf/v2/frame/g"',
        ")",
        "",
        "func Register() {",
        "  var controller *handlers.UsersController = &handlers.UsersController{}",
        '  g.Server().Domain("api.example.test").Group("/v1").Bind(controller)',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { domain: "api.example.test" });
    const bindingFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "cmd/server/routes.go");

    expect(bindingFacts?.goFrameStandardRouterFacts?.controllerBindings).toEqual([
      expect.objectContaining({
        controllerName: "UsersController",
        controllerPackageAlias: "handlers",
        prefix: "/v1",
        domains: ["api.example.test"]
      })
    ]);
    expect(routes.routes).toHaveLength(1);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          domain: "api.example.test",
          handler: expect.objectContaining({
            qualifiedName: "api/controllers/users.go#UsersController.List"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.go-module.cross-package",
              stage: "module",
              configurationPaths: ["go.mod"],
              resolutionPath: [
                "api/requests/list.go",
                "api/controllers/users.go",
                "cmd/server/routes.go"
              ]
            })
          })
        })
      ])
    );
  });

  it("projects every proven controller in one variadic GoFrame Bind through module evidence", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "api/requests/first.go": [
        "package contracts",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type FirstReq struct {",
        '  g.Meta `path:"/first" method:"GET"`',
        "}"
      ].join("\n"),
      "api/requests/second.go": [
        "package contracts",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type SecondReq struct {",
        '  g.Meta `path:"/second" method:"POST"`',
        "}"
      ].join("\n"),
      "api/controllers/first.go": [
        "package handlers",
        "",
        "import (",
        '  "context"',
        '  "example.test/warehouse/api/requests"',
        ")",
        "",
        "type FirstController struct{}",
        "",
        "func (c *FirstController) First(ctx context.Context, req *contracts.FirstReq) {}"
      ].join("\n"),
      "api/controllers/second.go": [
        "package handlers",
        "",
        "import (",
        '  "context"',
        '  "example.test/warehouse/api/requests"',
        ")",
        "",
        "type SecondController struct{}",
        "",
        "func NewSecondController() *SecondController { return &SecondController{} }",
        "func (c *SecondController) Second(ctx context.Context, req *contracts.SecondReq) {}"
      ].join("\n"),
      "cmd/server/routes.go": [
        "package main",
        "",
        "import (",
        '  "example.test/warehouse/api/controllers"',
        '  "github.com/gogf/gf/v2/frame/g"',
        ")",
        "",
        "func Register(unknown interface{}) {",
        '  g.Server().Domain("api.example.test").Group("/v1").Bind(&handlers.FirstController{}, handlers.NewSecondController(), unknown)',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { domain: "api.example.test" });
    const bindingFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "cmd/server/routes.go");

    expect(bindingFacts?.goFrameStandardRouterFacts?.controllerBindings).toEqual([
      expect.objectContaining({
        controllerName: "FirstController",
        controllerPackageAlias: "handlers",
        prefix: "/v1",
        domains: ["api.example.test"]
      })
    ]);
    expect(bindingFacts?.goFrameStandardRouterFacts?.controllerFactoryBindings).toEqual([
      expect.objectContaining({
        factoryName: "NewSecondController",
        factoryPackageAlias: "handlers",
        prefix: "/v1",
        domains: ["api.example.test"]
      })
    ]);
    expect(routes.routes).toHaveLength(2);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/first",
          domain: "api.example.test",
          handler: expect.objectContaining({
            qualifiedName: "api/controllers/first.go#FirstController.First"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.go-module.cross-package",
              stage: "module",
              configurationPaths: ["go.mod"],
              resolutionPath: [
                "api/requests/first.go",
                "api/controllers/first.go",
                "cmd/server/routes.go"
              ]
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/v1/second",
          domain: "api.example.test",
          handler: expect.objectContaining({
            qualifiedName: "api/controllers/second.go#SecondController.Second"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            confidence: 1,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.go-module.factory-bind",
              stage: "module",
              configurationPaths: ["go.mod"],
              resolutionPath: [
                "api/requests/second.go",
                "api/controllers/second.go",
                "cmd/server/routes.go"
              ]
            })
          })
        })
      ])
    );
  });

  it("keeps an unproven GoFrame factory Bind separate from exact route evidence", async () => {
    const projectPath = await createInlineProject({
      "api/request.go": [
        "package api",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controller.go": [
        "package api",
        "",
        'import "context"',
        "",
        "type Controller struct{}",
        "type OtherController struct{}",
        "",
        "func NewController() *Controller { return &OtherController{} }",
        "func (c *Controller) List(ctx context.Context, req *ListReq) {}"
      ].join("\n"),
      "api/routes.go": [
        "package api",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "func Register() {",
        '  g.Server().Group("/v1").Bind(NewController())',
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ method: "GET", path: "/v1/users" })])
    );
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/users",
          edge: expect.objectContaining({
            resolution: "heuristic",
            confidence: 0.7,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.unique-request-signature.unbound",
              stage: "heuristic"
            })
          })
        })
      ])
    );
  });

  it("projects an unbound GoFrame request through one unique same-package controller signature as heuristic evidence", async () => {
    const projectPath = await createInlineProject({
      "api/request.go": [
        "package api",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controller.go": [
        "package api",
        "",
        'import "context"',
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) List(ctx context.Context, req *ListReq) {}"
      ].join("\n"),
      "other/request.go": [
        "package other",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/wrong" method:"GET"`',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toHaveLength(1);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/users",
          domain: null,
          handler: expect.objectContaining({ qualifiedName: "api/controller.go#Controller.List" }),
          edge: expect.objectContaining({
            resolution: "heuristic",
            confidence: 0.7,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.unique-request-signature.unbound",
              stage: "heuristic",
              candidateSymbolIds: [expect.any(String)],
              resolutionPath: ["api/request.go", "api/controller.go"]
            })
          })
        })
      ])
    );
    expect(routes.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/wrong" })])
    );

    await writeFile(join(projectPath, "unrelated.go"), "package api\n\nconst Ready = true\n", "utf8");
    const synced = await service.sync({ projectPath });
    const routesAfterReuse = await service.routes(projectPath);

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["unrelated.go"],
      reusedArtifactFiles: ["api/controller.go", "api/request.go", "other/request.go"]
    });
    expect(routesAfterReuse.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/users",
          edge: expect.objectContaining({ resolution: "heuristic" })
        })
      ])
    );
  });

  it("projects an unbound GoFrame request through a package-proven default import only", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "api/requests/list.go": [
        "package contracts",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/broken/list.go": [
        "package unexpected",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/wrong" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controllers/users.go": [
        "package handlers",
        "",
        "import (",
        '  "context"',
        '  "example.test/warehouse/api/requests"',
        ")",
        "",
        "type UsersController struct{}",
        "",
        "func (c *UsersController) List(ctx context.Context, req *contracts.ListReq) {}"
      ].join("\n"),
      "api/controllers/bad.go": [
        "package handlers",
        "",
        "import (",
        '  "context"',
        '  "example.test/warehouse/api/broken"',
        ")",
        "",
        "type BadController struct{}",
        "",
        "func (c *BadController) List(ctx context.Context, req *broken.ListReq) {}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toHaveLength(1);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/users",
          domain: null,
          handler: expect.objectContaining({
            qualifiedName: "api/controllers/users.go#UsersController.List"
          }),
          edge: expect.objectContaining({
            resolution: "heuristic",
            confidence: 0.7,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.unique-request-signature.unbound",
              stage: "heuristic",
              configurationPaths: ["go.mod"],
              resolutionPath: ["api/requests/list.go", "api/controllers/users.go"]
            })
          })
        })
      ])
    );
    expect(routes.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/wrong" })])
    );
  });

  it("projects an unbound GoFrame request through an explicit local import alias", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "api/request/list.go": [
        "package request",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controller/users.go": [
        "package controller",
        "",
        "import (",
        '  "context"',
        '  request "example.test/warehouse/api/request"',
        ")",
        "",
        "type UsersController struct{}",
        "",
        "func (c *UsersController) List(ctx context.Context, req *request.ListReq) {}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toHaveLength(1);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/users",
          domain: null,
          handler: expect.objectContaining({
            qualifiedName: "api/controller/users.go#UsersController.List"
          }),
          edge: expect.objectContaining({
            resolution: "heuristic",
            confidence: 0.7,
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.standard-router.g-meta.unique-request-signature.unbound",
              stage: "heuristic",
              configurationPaths: ["go.mod"],
              resolutionPath: ["api/request/list.go", "api/controller/users.go"]
            })
          })
        })
      ])
    );
  });

  it("rejects an unbound GoFrame heuristic route when multiple controller methods share its request signature", async () => {
    const projectPath = await createInlineProject({
      "api/request.go": [
        "package api",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controller.go": [
        "package api",
        "",
        'import "context"',
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) List(ctx context.Context, req *ListReq) {}",
        "func (c *Controller) Duplicate(ctx context.Context, req *ListReq) {}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ method: "GET", path: "/users" })])
    );
  });

  it("does not add an unbound GoFrame candidate beside a statically bound controller sharing its request signature", async () => {
    const projectPath = await createInlineProject({
      "api/request.go": [
        "package api",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"GET"`',
        "}"
      ].join("\n"),
      "api/controllers.go": [
        "package api",
        "",
        'import "context"',
        "",
        "type BoundController struct{}",
        "type CandidateController struct{}",
        "",
        "func (c *BoundController) List(ctx context.Context, req *ListReq) {}",
        "func (c *CandidateController) List(ctx context.Context, req *ListReq) {}"
      ].join("\n"),
      "api/routes.go": [
        "package api",
        "",
        'import "github.com/gogf/gf/v2/frame/g"',
        "",
        "func Register() {",
        '  g.Server().Group("/v1").Bind(&BoundController{})',
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toHaveLength(1);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/v1/users",
          handler: expect.objectContaining({
            qualifiedName: "api/controllers.go#BoundController.List"
          }),
          edge: expect.objectContaining({ resolution: "exact" })
        })
      ])
    );
    expect(routes.routes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/users",
          handler: expect.objectContaining({
            qualifiedName: "api/controllers.go#CandidateController.List"
          })
        })
      ])
    );
  });

  it("indexes GoFrame BindObjectMethod routes with exact evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) Health(r *ghttp.Request) {}",
        "func (c Controller) Status(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := new(Controller)",
        '  server.BindObjectMethod("GET:/health", &Controller{}, "Health")',
        '  server.BindObjectMethod("/status", controller, "Status")',
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-server.bind-object-method.local-object-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "ALL",
          path: "/status",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Status" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-server.bind-object-method.local-object-method",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/health",
        handler: { qualifiedName: "cmd/server/main.go#Controller.Health" }
      }
    ]);
  });

  it("indexes selected GoFrame BindObject and BindObjectRest routes with exact evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) Index(r *ghttp.Request) {}",
        "func (c *Controller) Show(r *ghttp.Request) {}",
        "func (c *Controller) Get(r *ghttp.Request) {}",
        "func (c *Controller) Delete(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := new(Controller)",
        '  server.BindObject("/object", controller, "Index, Show")',
        '  server.BindObjectRest("/items", &Controller{})',
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
          path: "/object",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Index" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-server.bind-object.local-object-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "ALL",
          path: "/object/show",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Show" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-server.bind-object.local-object-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/items",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Get" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-server.bind-object-rest.local-object-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "DELETE",
          path: "/items",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Delete" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.direct-server.bind-object-rest.local-object-method",
              stage: "syntax"
            })
          })
        })
      ])
    );
  });

  it("indexes literal GoFrame Domain object routes and filters exact host conditions", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) Health(r *ghttp.Request) {}",
        "func (c *Controller) Get(r *ghttp.Request) {}",
        "func (c *Controller) Delete(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        '  server.BindObjectMethod("GET:/global", controller, "Health")',
        '  api := server.Domain("api.example.test, api-alt.example.test")',
        '  api.BindObjectMethod("GET:/health", controller, "Health")',
        '  api.BindObjectRest("/items", controller)',
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const apiRoutes = await service.routes(projectPath, { domain: "api.example.test" });
    const alternateRoutes = await service.routes(projectPath, { domain: "api-alt.example.test" });
    const hostlessRoutes = await service.routes(projectPath, { pathPrefix: "/global" });

    expect(apiRoutes.routes).toHaveLength(3);
    expect(apiRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          domain: "api.example.test",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Health" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.domain.bind-object-method.local-object-method",
              routeDomain: "api.example.test"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/items",
          domain: "api.example.test",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Get" })
        }),
        expect.objectContaining({
          method: "DELETE",
          path: "/items",
          domain: "api.example.test",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Delete" })
        })
      ])
    );
    expect(alternateRoutes.routes).toHaveLength(3);
    expect(alternateRoutes.routes.every((route) => route.domain === "api-alt.example.test")).toBe(true);
    expect(hostlessRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/global",
        domain: null,
        handler: { qualifiedName: "cmd/server/main.go#Controller.Health" }
      }
    ]);
  });

  it("indexes GoFrame literal Map and ALLMap batch routes with exact evidence", async () => {
    const projectPath = await createInlineProject({
      "cmd/server/main.go": [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  ghttp "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func list(r *ghttp.Request) {}",
        "func create(r *ghttp.Request) {}",
        "func (c *Controller) Update(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        '  api := server.Group("/api")',
        '  api.Map(g.Map{"GET: /users": list, "POST: /users": create, "PATCH: /users/:id": controller.Update})',
        '  api.ALLMap(g.Map{"/health": list})',
        '  server.Group("/callback", func(group *ghttp.RouterGroup) {',
        '    group.ALLMap(g.Map{"/status": controller.Update})',
        "  })",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/api/users",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#list" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.group.map.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/api/users",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#create" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.group.map.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/api/users/:id",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Update" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.group.map.local-object-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "ALL",
          path: "/api/health",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#list" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.group.all-map.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "ALL",
          path: "/callback/status",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#Controller.Update" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.goframe.group.all-map.local-object-method",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(getRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/api/users",
          handler: expect.objectContaining({ qualifiedName: "cmd/server/main.go#list" })
        })
      ])
    );
    expect(getRoutes.routes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "POST", path: "/api/users" })
      ])
    );
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

  it("indexes Rust Actix Web and Rocket attribute routes", async () => {
    const projectPath = await createInlineProject({
      "src/http.rs": [
        "use actix_web::{get, post};",
        "use rocket::{delete as rocket_delete, get as rocket_get};",
        "",
        "#[get(\"/health\")]",
        "async fn health() {}",
        "",
        "#[post(\"/users\")]",
        "async fn create_user() {}",
        "",
        "#[rocket_delete(\"/users/:id\")]",
        "fn delete_user() {}",
        "",
        "#[rocket_get(\"/ready\")]",
        "fn ready() {}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const deleteRoutes = await service.routes(projectPath, { method: "DELETE" });

    expect(getRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.actix-web.attribute-route.literal-path.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/ready",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#ready" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.rocket.attribute-route.literal-path.local-function"
            })
          })
        })
      ])
    );
    expect(deleteRoutes.routes).toMatchObject([
      {
        method: "DELETE",
        path: "/users/:id",
        handler: { qualifiedName: "src/http.rs#delete_user" },
        edge: {
          resolution: "exact",
          evidence: {
            ruleId: "framework.rocket.attribute-route.literal-path.local-function",
            stage: "syntax"
          }
        }
      }
    ]);
  });

  it("indexes Rust Actix Web App and resource builder routes", async () => {
    const projectPath = await createInlineProject({
      "src/http.rs": [
        "use actix_web::{App as HttpApp, web as http};",
        "",
        "async fn health() {}",
        "async fn list_users() {}",
        "async fn all_methods() {}",
        "",
        "fn configure() {",
        "  let app = HttpApp::new()",
        "    .route(\"/health\", http::get().to(health))",
        "    .service(http::resource(\"/users\").route(http::get().to(list_users)))",
        "    .service(http::resource(\"/all\").to(all_methods));",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const allRoutes = await service.routes(projectPath, { method: "ALL" });

    expect(getRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.actix-web.direct-app.route.literal-path.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/users",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#list_users" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.actix-web.direct-app.web-resource.literal-path.local-function"
            })
          })
        })
      ])
    );
    expect(allRoutes.routes).toMatchObject([
      {
        method: "ALL",
        path: "/all",
        handler: { qualifiedName: "src/http.rs#all_methods" },
        edge: {
          resolution: "exact",
          evidence: {
            ruleId: "framework.actix-web.direct-app.web-resource.literal-path.local-function",
            stage: "syntax"
          }
        }
      }
    ]);
  });

  it("indexes Rust Actix Web scoped builder routes", async () => {
    const projectPath = await createInlineProject({
      "src/http.rs": [
        "use actix_web::{App as HttpApp, web as http};",
        "",
        "async fn health() {}",
        "async fn list_users() {}",
        "async fn create_user() {}",
        "",
        "fn configure() {",
        "  let app = HttpApp::new().service(",
        "    http::scope(\"/api\")",
        "      .route(\"/health\", http::get().to(health))",
        "      .service(http::resource(\"/users\").route(http::get().to(list_users)))",
        "      .service(",
        "        http::scope(\"/v1\")",
        "          .service(http::resource(\"/users\").route(http::post().to(create_user))),",
        "      ),",
        "  );",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const postRoutes = await service.routes(projectPath, { method: "POST" });

    expect(getRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/api/health",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#health" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.actix-web.direct-app.web-scope.literal-path.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/api/users",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#list_users" })
        })
      ])
    );
    expect(postRoutes.routes).toMatchObject([
      {
        method: "POST",
        path: "/api/v1/users",
        handler: { qualifiedName: "src/http.rs#create_user" },
        edge: {
          resolution: "exact",
          evidence: {
            ruleId: "framework.actix-web.direct-app.web-scope.literal-path.local-function",
            stage: "syntax"
          }
        }
      }
    ]);
  });

  it("indexes Rust Actix Web mounted attribute services with effective scope paths", async () => {
    const projectPath = await createInlineProject({
      "src/http.rs": [
        "use actix_web::{get as actix_get, post, App as HttpApp, web as http};",
        "",
        "#[actix_get(\"/health\")]",
        "async fn health() {}",
        "",
        "#[post(\"/users\")]",
        "async fn list_users() {}",
        "",
        "#[post(\"/users\")]",
        "async fn create_user() {}",
        "",
        "#[actix_get(\"/orphan\")]",
        "async fn orphan() {}",
        "",
        "fn configure() {",
        "  let app = HttpApp::new()",
        "    .service(health)",
        "    .service(",
        "      http::scope(\"/api\")",
        "        .service(list_users)",
        "        .service(http::scope(\"/v1\").service(create_user)),",
        "    );",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const postRoutes = await service.routes(projectPath, { method: "POST" });

    expect(getRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#health" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.actix-web.direct-app.attribute-service.literal-path.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/orphan",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#orphan" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.actix-web.attribute-route.literal-path.local-function"
            })
          })
        })
      ])
    );
    expect(postRoutes.routes).toHaveLength(2);
    expect(postRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "POST",
          path: "/api/users",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#list_users" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.actix-web.direct-app.web-scope.attribute-service.literal-path.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/api/v1/users",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#create_user" })
        })
      ])
    );
  });

  it("indexes Rust Actix ServiceConfig routes through App and scope configure mounts", async () => {
    const projectPath = await createInlineProject({
      "src/http.rs": [
        "use actix_web::{get, App, web};",
        "",
        "async fn health() {}",
        "",
        "#[get(\"/ready\")]",
        "async fn ready() {}",
        "",
        "fn routes(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "  cfg.service(ready);",
        "}",
        "",
        "fn configure() {",
        "  let app = App::new()",
        "    .configure(routes)",
        "    .service(web::scope(\"/api\").configure(routes));",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toHaveLength(4);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#health" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.actix-web.direct-app.configure.service-config.literal-path.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          path: "/ready",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#ready" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.actix-web.direct-app.configure.service-config.literal-path.local-function"
            })
          })
        }),
        expect.objectContaining({
          path: "/api/health",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#health" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.actix-web.direct-app.web-scope.configure.service-config.literal-path.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          path: "/api/ready",
          handler: expect.objectContaining({ qualifiedName: "src/http.rs#ready" })
        })
      ])
    );
  });

  it("projects Rust Actix ServiceConfig routes across a direct Cargo workspace path dependency", async () => {
    const projectPath = await createInlineProject({
      "Cargo.toml": [
        "[workspace]",
        'members = ["apps/server", "crates/api-routes"]'
      ].join("\n"),
      "apps/server/Cargo.toml": [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api-routes = { path = "../../crates/api-routes" }'
      ].join("\n"),
      "apps/server/src/main.rs": [
        "use actix_web::{App, web};",
        "use api_routes::routes::configure as api_routes_config;",
        "",
        "fn bootstrap() {",
        "  let app = App::new()",
        "    .configure(api_routes_config)",
        "    .service(web::scope(\"/api\").configure(api_routes_config));",
        "}"
      ].join("\n"),
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;",
      "crates/api-routes/src/routes.rs": [
        "use actix_web::{get, web};",
        "",
        "async fn health() {}",
        "",
        "#[get(\"/ready\")]",
        "async fn ready() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "  cfg.service(ready);",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "apps/server/src/main.rs");

    expect(mainFacts?.rustActixServiceConfigFacts).toMatchObject({
      importedMounts: [
        {
          configurationName: "configure",
          moduleName: "routes",
          modulePath: ["routes"],
          importRoot: "workspace",
          workspaceCrateName: "api_routes",
          prefix: "/",
          kind: "app"
        },
        {
          configurationName: "configure",
          moduleName: "routes",
          modulePath: ["routes"],
          importRoot: "workspace",
          workspaceCrateName: "api_routes",
          prefix: "/api",
          kind: "scope"
        }
      ]
    });
    expect(routes.routes).toHaveLength(4);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "crates/api-routes/src/routes.rs#health" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.actix-web.imported-service-config.app.configure.cargo-workspace-module.local-function",
              stage: "module",
              configurationPaths: [
                "Cargo.toml",
                "apps/server/Cargo.toml",
                "crates/api-routes/Cargo.toml"
              ],
              resolutionPath: [
                "apps/server/src/main.rs",
                "crates/api-routes/src/lib.rs",
                "crates/api-routes/src/routes.rs"
              ]
            })
          })
        }),
        expect.objectContaining({
          path: "/ready",
          handler: expect.objectContaining({ qualifiedName: "crates/api-routes/src/routes.rs#ready" })
        }),
        expect.objectContaining({
          path: "/api/health",
          handler: expect.objectContaining({ qualifiedName: "crates/api-routes/src/routes.rs#health" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.actix-web.imported-service-config.web-scope.configure.cargo-workspace-module.local-function",
              stage: "module",
              configurationPaths: [
                "Cargo.toml",
                "apps/server/Cargo.toml",
                "crates/api-routes/Cargo.toml"
              ],
              resolutionPath: [
                "apps/server/src/main.rs",
                "crates/api-routes/src/lib.rs",
                "crates/api-routes/src/routes.rs"
              ]
            })
          })
        }),
        expect.objectContaining({
          path: "/api/ready",
          handler: expect.objectContaining({ qualifiedName: "crates/api-routes/src/routes.rs#ready" })
        })
      ])
    );

    await writeFile(
      join(projectPath, "apps", "server", "Cargo.toml"),
      [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api-routes = { path = "../../crates/api-routes" }',
        "# manifest-only change"
      ].join("\n"),
      "utf8"
    );
    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["project-inputs-changed"]
    });
  });

  it("marks a Cargo glob workspace stale when a matching member manifest appears", async () => {
    const projectPath = await createInlineProject({
      "Cargo.toml": [
        "[workspace]",
        'members = ["apps/*", "crates/*"]'
      ].join("\n"),
      "apps/server/Cargo.toml": [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api-routes = { path = "../../crates/api-routes" }'
      ].join("\n"),
      "apps/server/src/main.rs": "use api_routes::routes::configure;",
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    await mkdir(join(projectPath, "crates", "telemetry"), { recursive: true });
    await writeFile(
      join(projectPath, "crates", "telemetry", "Cargo.toml"),
      ["[package]", 'name = "telemetry"'].join("\n"),
      "utf8"
    );

    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["project-inputs-changed"]
    });
  });

  it("projects Rust Actix ServiceConfig routes through a workspace-inherited Cargo local path dependency", async () => {
    const projectPath = await createInlineProject({
      "Cargo.toml": [
        "[workspace]",
        'members = ["apps/server", "crates/api-routes"]',
        "",
        "[workspace.dependencies]",
        'api = { package = "api-routes", path = "crates/api-routes" }'
      ].join("\n"),
      "apps/server/Cargo.toml": [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api = { workspace = true, features = ["http"] }'
      ].join("\n"),
      "apps/server/src/main.rs": [
        "use actix_web::App;",
        "use api::routes::configure as api_routes_config;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().configure(api_routes_config);",
        "}"
      ].join("\n"),
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;",
      "crates/api-routes/src/routes.rs": [
        "use actix_web::web;",
        "",
        "async fn health() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: [
        {
          path: "/health",
          handler: { qualifiedName: "crates/api-routes/src/routes.rs#health" },
          edge: {
            evidence: {
              ruleId:
                "framework.actix-web.imported-service-config.app.configure.cargo-workspace-module.local-function",
              stage: "module",
              configurationPaths: [
                "Cargo.toml",
                "apps/server/Cargo.toml",
                "crates/api-routes/Cargo.toml"
              ],
              resolutionPath: [
                "apps/server/src/main.rs",
                "crates/api-routes/src/lib.rs",
                "crates/api-routes/src/routes.rs"
              ]
            }
          }
        }
      ]
    });

    await writeFile(
      join(projectPath, "Cargo.toml"),
      [
        "[workspace]",
        'members = ["apps/server", "crates/api-routes"]',
        "",
        "[workspace.dependencies]",
        'api = { package = "api-routes", path = "crates/api-routes" }',
        "# workspace dependency declaration changed"
      ].join("\n"),
      "utf8"
    );
    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["project-inputs-changed"]
    });
  });

  it("rejects a Cargo workspace Actix projection without a direct path dependency", async () => {
    const projectPath = await createInlineProject({
      "Cargo.toml": [
        "[workspace]",
        'members = ["apps/server", "crates/api-routes"]'
      ].join("\n"),
      "apps/server/Cargo.toml": [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api-routes = "1"'
      ].join("\n"),
      "apps/server/src/main.rs": [
        "use actix_web::{App, web};",
        "use api_routes::routes::configure;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().service(web::scope(\"/api\").configure(configure));",
        "}"
      ].join("\n"),
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;",
      "crates/api-routes/src/routes.rs": [
        "use actix_web::{get, web};",
        "",
        "#[get(\"/ready\")]",
        "async fn ready() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.service(ready);",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: [
        {
          path: "/ready",
          handler: { qualifiedName: "crates/api-routes/src/routes.rs#ready" },
          edge: {
            evidence: {
              ruleId: "framework.actix-web.attribute-route.literal-path.local-function",
              stage: "syntax"
            }
          }
        }
      ]
    });
  });

  it("projects Rust Actix ServiceConfig routes through a direct external module", async () => {
    const projectPath = await createInlineProject({
      "src/main.rs": [
        "mod routes;",
        "use actix_web::{App, web};",
        "use crate::routes::configure as routes_config;",
        "",
        "fn bootstrap() {",
        "  let app = App::new()",
        "    .configure(routes_config)",
        "    .service(web::scope(\"/api\").configure(routes_config));",
        "}"
      ].join("\n"),
      "src/routes.rs": [
        "use actix_web::{get, web};",
        "",
        "async fn health() {}",
        "",
        "#[get(\"/ready\")]",
        "async fn ready() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "  cfg.service(ready);",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/main.rs");
    const configFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/routes.rs");

    expect(mainFacts?.rustActixServiceConfigFacts).toMatchObject({
      externalModules: [{ name: "routes" }],
      importedMounts: [
        {
          configurationName: "configure",
          moduleName: "routes",
          modulePath: ["routes"],
          prefix: "/",
          kind: "app"
        },
        {
          configurationName: "configure",
          moduleName: "routes",
          modulePath: ["routes"],
          prefix: "/api",
          kind: "scope"
        }
      ]
    });
    expect(configFacts?.rustActixServiceConfigFacts).toMatchObject({
      configurations: [
        {
          name: "configure",
          routes: [
            { method: "GET", path: "/health", handlerName: "health" },
            { method: "GET", path: "/ready", handlerName: "ready" }
          ],
          mountedAttributeHandlers: ["ready"]
        }
      ]
    });
    expect(routes.routes).toHaveLength(4);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/routes.rs#health" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.actix-web.imported-service-config.app.configure.direct-module.local-function",
              stage: "module",
              resolutionPath: ["src/main.rs", "src/routes.rs"]
            })
          })
        }),
        expect.objectContaining({
          path: "/ready",
          handler: expect.objectContaining({ qualifiedName: "src/routes.rs#ready" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.actix-web.imported-service-config.app.configure.direct-module.local-function"
            })
          })
        }),
        expect.objectContaining({
          path: "/api/health",
          handler: expect.objectContaining({ qualifiedName: "src/routes.rs#health" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.actix-web.imported-service-config.web-scope.configure.direct-module.local-function",
              stage: "module",
              resolutionPath: ["src/main.rs", "src/routes.rs"]
            })
          })
        }),
        expect.objectContaining({
          path: "/api/ready",
          handler: expect.objectContaining({ qualifiedName: "src/routes.rs#ready" })
        })
      ])
    );
  });

  it("projects Rust Actix ServiceConfig routes through a nested direct module path", async () => {
    const projectPath = await createInlineProject({
      "src/main.rs": [
        "pub mod api;",
        "use actix_web::{App, web};",
        "use crate::api::routes::configure as api_routes;",
        "",
        "fn bootstrap() {",
        "  let app = App::new()",
        "    .configure(api_routes)",
        "    .service(web::scope(\"/api\").configure(api_routes));",
        "}"
      ].join("\n"),
      "src/api/mod.rs": ["pub mod routes;"].join("\n"),
      "src/api/routes.rs": [
        "use actix_web::{get, web};",
        "",
        "async fn health() {}",
        "",
        "#[get(\"/ready\")]",
        "async fn ready() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "  cfg.service(ready);",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const mainFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/main.rs");
    const apiFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/api/mod.rs");

    expect(mainFacts?.rustActixServiceConfigFacts).toMatchObject({
      externalModules: [{ name: "api" }],
      importedMounts: [
        {
          configurationName: "configure",
          moduleName: "api",
          modulePath: ["api", "routes"],
          prefix: "/",
          kind: "app"
        },
        {
          configurationName: "configure",
          moduleName: "api",
          modulePath: ["api", "routes"],
          prefix: "/api",
          kind: "scope"
        }
      ]
    });
    expect(apiFacts?.rustActixServiceConfigFacts).toMatchObject({
      externalModules: [{ name: "routes" }]
    });
    expect(routes.routes).toHaveLength(4);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/api/routes.rs#health" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.actix-web.imported-service-config.app.configure.direct-module-path.local-function",
              stage: "module",
              resolutionPath: ["src/main.rs", "src/api/mod.rs", "src/api/routes.rs"]
            })
          })
        }),
        expect.objectContaining({
          path: "/ready",
          handler: expect.objectContaining({ qualifiedName: "src/api/routes.rs#ready" })
        }),
        expect.objectContaining({
          path: "/api/health",
          handler: expect.objectContaining({ qualifiedName: "src/api/routes.rs#health" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.actix-web.imported-service-config.web-scope.configure.direct-module-path.local-function",
              stage: "module",
              resolutionPath: ["src/main.rs", "src/api/mod.rs", "src/api/routes.rs"]
            })
          })
        }),
        expect.objectContaining({
          path: "/api/ready",
          handler: expect.objectContaining({ qualifiedName: "src/api/routes.rs#ready" })
        })
      ])
    );
  });

  it("rejects nested Rust Actix ServiceConfig mounts without direct intermediate module proof", async () => {
    const projectPath = await createInlineProject({
      "src/main.rs": [
        "pub mod api;",
        "use actix_web::App;",
        "use crate::api::routes::configure;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().configure(configure);",
        "}"
      ].join("\n"),
      "src/api/mod.rs": ["// routes is intentionally not declared here"].join("\n"),
      "src/api/routes.rs": [
        "use actix_web::{get, web};",
        "",
        "#[get(\"/ready\")]",
        "async fn ready() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.service(ready);",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: [
        {
          path: "/ready",
          handler: { qualifiedName: "src/api/routes.rs#ready" },
          edge: {
            evidence: {
              ruleId: "framework.actix-web.attribute-route.literal-path.local-function",
              stage: "syntax"
            }
          }
        }
      ]
    });
  });

  it("reuses persisted nested Rust ServiceConfig facts when an external mount prefix changes", async () => {
    const projectPath = await createInlineProject({
      "src/main.rs": [
        "pub mod api;",
        "use actix_web::{App, web};",
        "use self::api::routes::configure;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().service(web::scope(\"/api\").configure(configure));",
        "}"
      ].join("\n"),
      "src/api.rs": ["pub mod routes;"].join("\n"),
      "src/api/routes/mod.rs": [
        "use actix_web::web;",
        "",
        "async fn health() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: [{ path: "/api/health", handler: { qualifiedName: "src/api/routes/mod.rs#health" } }]
    });

    await writeFile(
      join(projectPath, "src", "main.rs"),
      [
        "pub mod api;",
        "use actix_web::{App, web};",
        "use self::api::routes::configure;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().service(web::scope(\"/v2\").configure(configure));",
        "}"
      ].join("\n"),
      "utf8"
    );
    const synced = await service.sync({ projectPath });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      modifiedFiles: ["src/main.rs"],
      reExtractedFiles: ["src/main.rs"],
      reusedArtifactFiles: expect.arrayContaining(["src/api.rs", "src/api/routes/mod.rs"])
    });
    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: [
        {
          path: "/v2/health",
          handler: { qualifiedName: "src/api/routes/mod.rs#health" },
          edge: {
            evidence: {
              ruleId:
                "framework.actix-web.imported-service-config.web-scope.configure.direct-module-path.local-function",
              resolutionPath: ["src/main.rs", "src/api.rs", "src/api/routes/mod.rs"]
            }
          }
        }
      ]
    });
  });

  it("reuses persisted Rust ServiceConfig facts when an external mount prefix changes", async () => {
    const projectPath = await createInlineProject({
      "src/main.rs": [
        "mod routes;",
        "use actix_web::{App, web};",
        "use crate::routes::configure as routes_config;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().service(web::scope(\"/api\").configure(routes_config));",
        "}"
      ].join("\n"),
      "src/routes.rs": [
        "use actix_web::web;",
        "",
        "async fn health() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: [{ path: "/api/health", handler: { qualifiedName: "src/routes.rs#health" } }]
    });

    await writeFile(
      join(projectPath, "src", "main.rs"),
      [
        "mod routes;",
        "use actix_web::{App, web};",
        "use crate::routes::configure as routes_config;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().service(web::scope(\"/v2\").configure(routes_config));",
        "}"
      ].join("\n"),
      "utf8"
    );
    const synced = await service.sync({ projectPath });

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      modifiedFiles: ["src/main.rs"],
      reExtractedFiles: ["src/main.rs"],
      reusedArtifactFiles: expect.arrayContaining(["src/routes.rs"])
    });
    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: [
        {
          path: "/v2/health",
          handler: { qualifiedName: "src/routes.rs#health" },
          edge: {
            evidence: {
              ruleId:
                "framework.actix-web.imported-service-config.web-scope.configure.direct-module.local-function",
              resolutionPath: ["src/main.rs", "src/routes.rs"]
            }
          }
        }
      ]
    });
  });

  it("rejects Rust Actix external ServiceConfig mounts without root module proof", async () => {
    const projectPath = await createInlineProject({
      "src/main.rs": [
        "use actix_web::App;",
        "use crate::routes::configure;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().configure(configure);",
        "}"
      ].join("\n"),
      "src/routes.rs": [
        "use actix_web::web;",
        "",
        "async fn health() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
  });

  it("rejects Rust Actix external ServiceConfig mounts without an exported callback", async () => {
    const projectPath = await createInlineProject({
      "src/main.rs": [
        "mod routes;",
        "use actix_web::App;",
        "use crate::routes::configure;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().configure(configure);",
        "}"
      ].join("\n"),
      "src/routes.rs": [
        "use actix_web::web;",
        "",
        "async fn health() {}",
        "",
        "fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
  });

  it("retains a raw Actix attribute route without direct external-module proof", async () => {
    const projectPath = await createInlineProject({
      "src/main.rs": [
        "use actix_web::App;",
        "use crate::routes::configure;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().configure(configure);",
        "}"
      ].join("\n"),
      "src/routes.rs": [
        "use actix_web::{get, web};",
        "",
        "#[get(\"/ready\")]",
        "async fn ready() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.service(ready);",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });

    expect(routes.routes).toEqual([
      expect.objectContaining({
        path: "/ready",
        handler: expect.objectContaining({ qualifiedName: "src/routes.rs#ready" }),
        edge: expect.objectContaining({
          evidence: expect.objectContaining({
            ruleId: "framework.actix-web.attribute-route.literal-path.local-function",
            stage: "syntax"
          })
        })
      })
    ]);
  });

  it("projects a direct self import through a Rust routes module root", async () => {
    const projectPath = await createInlineProject({
      "src/main.rs": [
        "mod routes;",
        "use actix_web::{App, web};",
        "use self::routes::configure;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().service(web::scope(\"/api\").configure(configure));",
        "}"
      ].join("\n"),
      "src/routes/mod.rs": [
        "use actix_web::web;",
        "",
        "async fn health() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "}"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });

    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: [
        {
          path: "/api/health",
          handler: { qualifiedName: "src/routes/mod.rs#health" },
          edge: {
            evidence: {
              ruleId:
                "framework.actix-web.imported-service-config.web-scope.configure.direct-module.local-function",
              resolutionPath: ["src/main.rs", "src/routes/mod.rs"]
            }
          }
        }
      ]
    });
  });

  it("keeps distinct route identities when an unrelated attribute route shares an effective path", async () => {
    const projectPath = await createInlineProject({
      "src/main.rs": [
        "mod routes;",
        "use actix_web::{App, web};",
        "use crate::routes::configure;",
        "",
        "fn bootstrap() {",
        "  let app = App::new().service(web::scope(\"/api\").configure(configure));",
        "}"
      ].join("\n"),
      "src/routes.rs": [
        "use actix_web::{get, web};",
        "",
        "#[get(\"/api/health\")]",
        "async fn direct_health() {}",
        "",
        "async fn configured_health() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(configured_health));",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const routes = await service.routes(projectPath, { method: "GET", pathPrefix: "/api/health" });
    const routeIds = graphStore
      .getSnapshot(projectPath)
      .symbols.filter((symbol) => symbol.kind === "route")
      .map((symbol) => symbol.id);
    expect(new Set(routeIds).size).toBe(routeIds.length);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/api/health",
          handler: expect.objectContaining({ qualifiedName: "src/routes.rs#direct_health" })
        }),
        expect.objectContaining({
          path: "/api/health",
          handler: expect.objectContaining({ qualifiedName: "src/routes.rs#configured_health" })
        })
      ])
    );
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

  it("indexes Java Jakarta REST routes with persisted source evidence", async () => {
    const projectPath = await createInlineProject({
      "src/api/CatalogResource.java": [
        "import jakarta.ws.rs.Path;",
        "import jakarta.ws.rs.GET;",
        "import jakarta.ws.rs.POST;",
        "",
        '@Path("/catalog")',
        "public class CatalogResource {",
        "  @GET",
        "  public String index() { return \"[]\"; }",
        "",
        '  @POST @Path("refresh")',
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
      .find((facts) => facts.filePath === "src/api/CatalogResource.java");

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
            qualifiedName: "src/api/CatalogResource.java#CatalogResource.index"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.jakarta-rest.direct-path.literal-method-mapping.local-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/catalog/refresh",
          handler: expect.objectContaining({
            qualifiedName: "src/api/CatalogResource.java#CatalogResource.refresh"
          })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/catalog",
        handler: { qualifiedName: "src/api/CatalogResource.java#CatalogResource.index" },
        edge: {
          resolution: "exact",
          evidence: {
            ruleId: "framework.jakarta-rest.direct-path.literal-method-mapping.local-method",
            stage: "syntax"
          }
        }
      }
    ]);
    expect(search.results).toMatchObject([{ filePath: "src/api/CatalogResource.java", language: "java" }]);
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

  it("projects unique COBOL CICS transaction owners while preserving ambiguous and missing hops", async () => {
    const projectPath = await createInlineProject({
      "cobol/Caller.cbl": [
        "       IDENTIFICATION DIVISION.",
        "       PROGRAM-ID. CALLER.",
        "       PROCEDURE DIVISION.",
        "       MAIN-LOGIC.",
        "           EXEC CICS RETURN",
        "             TRANSID('NXT1')",
        "           END-EXEC.",
        "       AMBIGUOUS-LOGIC.",
        "           EXEC CICS START TRANSID('DUP1') END-EXEC.",
        "       MISSING-LOGIC.",
        "           EXEC CICS RETURN TRANSID('MISS') END-EXEC.",
        "       END PROGRAM CALLER."
      ].join("\n"),
      "cobol/Next.cbl": [
        "       IDENTIFICATION DIVISION.",
        "       PROGRAM-ID. NEXT-PROGRAM.",
        "       DATA DIVISION.",
        "       WORKING-STORAGE SECTION.",
        "       01 WS-TRANID PIC X(04) VALUE 'NXT1'.",
        "       PROCEDURE DIVISION.",
        "       MAIN-LOGIC.",
        "           GOBACK.",
        "       END PROGRAM NEXT-PROGRAM."
      ].join("\n"),
      "cobol/DuplicateLeft.cbl": [
        "       IDENTIFICATION DIVISION.",
        "       PROGRAM-ID. DUPLICATE-LEFT.",
        "       DATA DIVISION.",
        "       WORKING-STORAGE SECTION.",
        "       01 WS-TRANSACTION PIC X(04) VALUE 'DUP1'.",
        "       PROCEDURE DIVISION.",
        "       MAIN-LOGIC.",
        "           GOBACK.",
        "       END PROGRAM DUPLICATE-LEFT."
      ].join("\n"),
      "cobol/DuplicateRight.cbl": [
        "       IDENTIFICATION DIVISION.",
        "       PROGRAM-ID. DUPLICATE-RIGHT.",
        "       DATA DIVISION.",
        "       WORKING-STORAGE SECTION.",
        "       01 WS-TRANSACTION PIC X(04) VALUE 'DUP1'.",
        "       PROCEDURE DIVISION.",
        "       MAIN-LOGIC.",
        "           GOBACK.",
        "       END PROGRAM DUPLICATE-RIGHT."
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const mainLogic = snapshot.symbols.find(
      (symbol) =>
        symbol.qualifiedName === "cobol/Caller.cbl#program:CALLER#paragraph:MAIN-LOGIC"
    );
    const nextProgram = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "cobol/Next.cbl#program:NEXT-PROGRAM"
    );
    const duplicateLeft = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "cobol/DuplicateLeft.cbl#program:DUPLICATE-LEFT"
    );
    const duplicateRight = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "cobol/DuplicateRight.cbl#program:DUPLICATE-RIGHT"
    );
    const uniqueHop = snapshot.edges.find((edge) => edge.referenceName === "cics-transid:NXT1");
    const ambiguousHop = snapshot.edges.find((edge) => edge.referenceName === "cics-transid:DUP1");
    const missingHop = snapshot.edges.find((edge) => edge.referenceName === "cics-transid:MISS");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 4, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(uniqueHop).toMatchObject({
      sourceId: mainLogic?.id,
      targetId: nextProgram?.id,
      kind: "calls",
      resolution: "heuristic",
      confidence: 0.85,
      evidence: {
        ruleId: "framework.cics.literal-transid.unique-program-owner",
        stage: "heuristic",
        candidateSymbolIds: [nextProgram?.id]
      }
    });
    expect(ambiguousHop).toMatchObject({
      targetId: null,
      kind: "calls",
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.cics.literal-transid.unresolved-program-owner",
        stage: "unresolved",
        candidateSymbolIds: [duplicateLeft?.id, duplicateRight?.id].sort()
      }
    });
    expect(missingHop).toMatchObject({
      targetId: null,
      kind: "calls",
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.cics.literal-transid.unresolved-program-owner",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });
    expect(
      snapshot.pendingReferences.map((reference) => reference.referenceName).filter((name) => name.startsWith("cics-transid:"))
    ).toEqual(["cics-transid:DUP1", "cics-transid:MISS"]);
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

  it("resolves Ruby Rails direct routes through conventional controllers and retains missing action evidence", async () => {
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
          handler: expect.objectContaining({
            qualifiedName: "app/controllers/health_controller.rb#HealthController.show"
          }),
          edge: expect.objectContaining({
            referenceName: "health#show",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.rails.direct-routes-draw.literal-controller-action.conventional-file-class-method",
              stage: "module"
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
        handler: { qualifiedName: "app/controllers/health_controller.rb#HealthController.show" },
        edge: {
          resolution: "exact",
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

  it("resolves Rails direct and RESTful resource routes to unique conventional cross-file controllers", async () => {
    const projectPath = await createInlineProject({
      "config/routes.rb": [
        "Rails.application.routes.draw do",
        "  get \"/health\", to: \"health#show\"",
        "  resources :articles, only: [:index, :show, :update]",
        "  resource :profile, only: [:show]",
        "end"
      ].join("\n"),
      "app/controllers/health_controller.rb": [
        "class HealthController",
        "  def show",
        "  end",
        "end"
      ].join("\n"),
      "app/controllers/articles_controller.rb": [
        "class ArticlesController",
        "  def index",
        "  end",
        "",
        "  def show",
        "  end",
        "",
        "  def update",
        "  end",
        "end"
      ].join("\n"),
      "app/controllers/profiles_controller.rb": [
        "class ProfilesController",
        "  def show",
        "  end",
        "end"
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
          handler: expect.objectContaining({
            qualifiedName: "app/controllers/health_controller.rb#HealthController.show"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.rails.direct-routes-draw.literal-controller-action.conventional-file-class-method",
              stage: "module"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/articles",
          handler: expect.objectContaining({
            qualifiedName: "app/controllers/articles_controller.rb#ArticlesController.index"
          }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.rails.resources.direct-routes-draw.literal-resource.conventional-file-class-method",
              stage: "module"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/articles/:id",
          handler: expect.objectContaining({
            qualifiedName: "app/controllers/articles_controller.rb#ArticlesController.show"
          })
        }),
        expect.objectContaining({
          method: "PATCH",
          path: "/articles/:id",
          handler: expect.objectContaining({
            qualifiedName: "app/controllers/articles_controller.rb#ArticlesController.update"
          })
        }),
        expect.objectContaining({
          method: "PUT",
          path: "/articles/:id",
          handler: expect.objectContaining({
            qualifiedName: "app/controllers/articles_controller.rb#ArticlesController.update"
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/profile",
          handler: expect.objectContaining({
            qualifiedName: "app/controllers/profiles_controller.rb#ProfilesController.show"
          }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.rails.resource.direct-routes-draw.literal-resource.conventional-file-class-method",
              stage: "module"
            })
          })
        })
      ])
    );
    expect(routes.routes).toHaveLength(6);
  });

  it("keeps Rails conventional controller routes unresolved when the controller class is ambiguous", async () => {
    const projectPath = await createInlineProject({
      "config/routes.rb": [
        "Rails.application.routes.draw do",
        "  resources :articles, only: [:show]",
        "end"
      ].join("\n"),
      "app/controllers/articles_controller.rb": [
        "class ArticlesController",
        "  def show",
        "  end",
        "end",
        "",
        "class ArticlesController",
        "  def show",
        "  end",
        "end"
      ].join("\n")
    });
    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);

    expect(routes.routes).toMatchObject([
      {
        method: "GET",
        path: "/articles/:id",
        handler: null,
        edge: {
          resolution: "unresolved",
          referenceName: "articles#show",
          evidence: {
            ruleId:
              "framework.rails.resources.direct-routes-draw.literal-resource.unresolved-controller-method",
            stage: "unresolved",
            candidateSymbolIds: expect.any(Array)
          }
        }
      }
    ]);
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

  it("indexes Kotlin Spring Web controller routes as persisted exact method evidence", async () => {
    const projectPath = await createInlineProject({
      "src/api/StatusController.kt": [
        "import org.springframework.web.bind.annotation.RestController",
        "import org.springframework.web.bind.annotation.RequestMapping",
        "import org.springframework.web.bind.annotation.GetMapping",
        "import org.springframework.web.bind.annotation.PostMapping",
        "",
        "@RestController",
        '@RequestMapping("/system")',
        "class StatusController {",
        '  @GetMapping("/health")',
        '  fun health(): String = "ok"',
        "",
        '  @PostMapping(path = "/refresh")',
        '  fun refresh(): String = "ok"',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const getRoutes = await service.routes(projectPath, { method: "GET" });
    const search = await service.search(projectPath, "health", { language: "kotlin" });
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/api/StatusController.kt");

    expect(persistedFacts).toMatchObject({
      language: "kotlin",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/system/health",
          handler: expect.objectContaining({
            qualifiedName: "src/api/StatusController.kt#StatusController.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.spring-web.direct-kotlin-controller.literal-method-mapping.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/system/refresh",
          handler: expect.objectContaining({
            qualifiedName: "src/api/StatusController.kt#StatusController.refresh"
          })
        })
      ])
    );
    expect(getRoutes.routes).toMatchObject([
      {
        method: "GET",
        path: "/system/health",
        handler: { qualifiedName: "src/api/StatusController.kt#StatusController.health" },
        edge: {
          resolution: "exact",
          evidence: {
            ruleId: "framework.spring-web.direct-kotlin-controller.literal-method-mapping.local-function",
            stage: "syntax"
          }
        }
      }
    ]);
    expect(search.results).toMatchObject([
      { filePath: "src/api/StatusController.kt", language: "kotlin" }
    ]);
  });

  it("indexes exact Java and Kotlin Spring RequestMapping RequestMethod routes", async () => {
    const projectPath = await createInlineProject({
      "src/api/JavaRequestMappingController.java": [
        "import org.springframework.web.bind.annotation.RestController;",
        "import org.springframework.web.bind.annotation.RequestMapping;",
        "import org.springframework.web.bind.annotation.RequestMethod;",
        "",
        "@RestController",
        '@RequestMapping({ "/java", "/java-v2/" })',
        "class JavaRequestMappingController {",
        '  @RequestMapping(value = "/health", method = { RequestMethod.GET, RequestMethod.POST })',
        '  String health() { return "ok"; }',
        "}"
      ].join("\n"),
      "src/api/KotlinRequestMappingController.kt": [
        "import org.springframework.web.bind.annotation.RestController",
        "import org.springframework.web.bind.annotation.RequestMapping",
        "import org.springframework.web.bind.annotation.RequestMethod",
        "",
        "@RestController",
        '@RequestMapping(path = ["/kotlin", "/kotlin-v2/"])',
        "class KotlinRequestMappingController {",
        '  @RequestMapping(path = "/info", method = [RequestMethod.HEAD, RequestMethod.OPTIONS])',
        "  fun info() {}",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const headRoutes = await service.routes(projectPath, { method: "HEAD" });
    const postRoutes = await service.routes(projectPath, { method: "POST" });
    const optionsRoutes = await service.routes(projectPath, { method: "OPTIONS" });
    const javaFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/api/JavaRequestMappingController.java");
    const kotlinFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/api/KotlinRequestMappingController.kt");

    expect(javaFacts).toMatchObject({
      language: "java",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(kotlinFacts).toMatchObject({
      language: "kotlin",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(routes.routes).toHaveLength(8);
    expect(routes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/java/health",
          handler: expect.objectContaining({
            qualifiedName: "src/api/JavaRequestMappingController.java#JavaRequestMappingController.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.spring-web.direct-controller.literal-request-mapping.local-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "GET",
          path: "/java-v2/health",
          handler: expect.objectContaining({
            qualifiedName: "src/api/JavaRequestMappingController.java#JavaRequestMappingController.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.spring-web.direct-controller.literal-request-mapping.local-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/java/health",
          handler: expect.objectContaining({
            qualifiedName: "src/api/JavaRequestMappingController.java#JavaRequestMappingController.health"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.spring-web.direct-controller.literal-request-mapping.local-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "HEAD",
          path: "/kotlin/info",
          handler: expect.objectContaining({
            qualifiedName:
              "src/api/KotlinRequestMappingController.kt#KotlinRequestMappingController.info"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.spring-web.direct-kotlin-controller.literal-request-mapping.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "HEAD",
          path: "/kotlin-v2/info",
          handler: expect.objectContaining({
            qualifiedName:
              "src/api/KotlinRequestMappingController.kt#KotlinRequestMappingController.info"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.spring-web.direct-kotlin-controller.literal-request-mapping.local-function",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          method: "OPTIONS",
          path: "/kotlin/info",
          handler: expect.objectContaining({
            qualifiedName:
              "src/api/KotlinRequestMappingController.kt#KotlinRequestMappingController.info"
          }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.spring-web.direct-kotlin-controller.literal-request-mapping.local-function",
              stage: "syntax"
            })
          })
        })
      ])
    );
    expect(headRoutes.routes).toHaveLength(2);
    expect(headRoutes.routes.map(({ method, path }) => ({ method, path }))).toEqual(
      expect.arrayContaining([
        { method: "HEAD", path: "/kotlin/info" },
        { method: "HEAD", path: "/kotlin-v2/info" }
      ])
    );
    expect(postRoutes.routes.map(({ method, path }) => ({ method, path }))).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/java/health" },
        { method: "POST", path: "/java-v2/health" }
      ])
    );
    expect(postRoutes.routes).toHaveLength(2);
    expect(optionsRoutes.routes.map(({ method, path }) => ({ method, path }))).toEqual(
      expect.arrayContaining([
        { method: "OPTIONS", path: "/kotlin/info" },
        { method: "OPTIONS", path: "/kotlin-v2/info" }
      ])
    );
    expect(optionsRoutes.routes).toHaveLength(2);
  });

  it("persists and projects exact React Native NativeModules bridge edges across Android and iOS", async () => {
    const projectPath = await createInlineProject({
      "src/mobile/bridge.ts": [
        'import { NativeModules } from "react-native";',
        "export function schedule() {",
        "  NativeModules.CalendarModule.createEvent();",
        "  NativeModules.CalendarModule.cancelEvent();",
        "}"
      ].join("\n"),
      "android/CalendarModule.java": [
        "import com.facebook.react.bridge.ReactContextBaseJavaModule;",
        "import com.facebook.react.bridge.ReactMethod;",
        "public class CalendarModule extends ReactContextBaseJavaModule {",
        '  private static final String NAME = "CalendarModule";',
        "  public String getName() { return NAME; }",
        "  @ReactMethod public void createEvent() {}",
        "}"
      ].join("\n"),
      "android/CalendarModule.kt": [
        "import com.facebook.react.bridge.ReactContextBaseJavaModule",
        "import com.facebook.react.bridge.ReactMethod",
        "class CalendarModule(context: Any) : ReactContextBaseJavaModule(context) {",
        "  companion object {",
        '    const val NAME: String = "CalendarModule"',
        "  }",
        "  override fun getName(): String = NAME",
        "  @ReactMethod fun cancelEvent() {}",
        "}"
      ].join("\n"),
      "ios/CalendarModule.m": [
        "#import <React/RCTBridgeModule.h>",
        "@implementation CalendarModule",
        "RCT_EXPORT_MODULE(CalendarModule)",
        "RCT_EXPORT_METHOD(createEvent)",
        "@end"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const persistedFacts = graphStore.getArtifactFacts(projectPath);
    const javaMethod = await service.find(
      projectPath,
      "android/CalendarModule.java#CalendarModule.createEvent"
    );
    const kotlinMethod = await service.find(
      projectPath,
      "android/CalendarModule.kt#CalendarModule.cancelEvent"
    );
    const objectiveCMethod = await service.find(
      projectPath,
      "ios/CalendarModule.m#CalendarModule.createEvent"
    );
    const javaTarget = javaMethod.symbols[0];
    const kotlinTarget = kotlinMethod.symbols[0];
    const objectiveCTarget = objectiveCMethod.symbols[0];
    if (javaTarget === undefined || kotlinTarget === undefined || objectiveCTarget === undefined) {
      throw new Error("Expected indexed React Native native methods.");
    }

    expect(persistedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/mobile/bridge.ts",
          reactNativeFacts: expect.objectContaining({ nativeModuleCalls: expect.any(Array) })
        }),
        expect.objectContaining({
          filePath: "android/CalendarModule.java",
          reactNativeFacts: expect.objectContaining({ nativeMethods: expect.any(Array) })
        }),
        expect.objectContaining({
          filePath: "android/CalendarModule.kt",
          reactNativeFacts: expect.objectContaining({ nativeMethods: expect.any(Array) })
        }),
        expect.objectContaining({
          filePath: "ios/CalendarModule.m",
          reactNativeFacts: expect.objectContaining({ nativeMethods: expect.any(Array) })
        })
      ])
    );
    for (const target of [javaTarget, kotlinTarget, objectiveCTarget]) {
      const callers = await service.callers(projectPath, target.qualifiedName);
      expect(callers.relations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: expect.objectContaining({ name: "schedule" }),
            edge: expect.objectContaining({ resolution: "exact", confidence: 1 })
          })
        ])
      );
    }

    const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await reopened.init({ projectPath });
    const persistedCallers = await reopened.callers(projectPath, javaTarget.qualifiedName);
    expect(persistedCallers.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ name: "schedule" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.react-native.native-modules.direct-module-and-method.android.exact-target",
              stage: "module"
            })
          })
        })
      ])
    );
  });

  it("persists default-name and remapped Objective-C React Native exports", async () => {
    const projectPath = await createInlineProject({
      "src/mobile/bridge.ts": [
        'import { NativeModules } from "react-native";',
        "export function schedule() {",
        "  NativeModules.CalendarModule.removeEvent();",
        "  NativeModules.LocationModule.beginTracking();",
        "}"
      ].join("\n"),
      "ios/RCTCalendarModule.m": [
        "#import <React/RCTBridgeModule.h>",
        "@implementation RCTCalendarModule",
        "RCT_EXPORT_MODULE()",
        "RCT_REMAP_METHOD(removeEvent, deleteEvent:(NSString *)eventId)",
        "@end"
      ].join("\n"),
      "ios/RKLocationModule.m": [
        "#import <React/RCTBridgeModule.h>",
        "@implementation RKLocationModule",
        "RCT_EXPORT_MODULE()",
        "RCT_REMAP_METHOD(beginTracking, startTracking:(BOOL)enabled)",
        "@end"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const persistedFacts = graphStore.getArtifactFacts(projectPath);
    const removeEvent = await service.find(
      projectPath,
      "ios/RCTCalendarModule.m#RCTCalendarModule.removeEvent"
    );
    const beginTracking = await service.find(
      projectPath,
      "ios/RKLocationModule.m#RKLocationModule.beginTracking"
    );
    const removeEventTarget = removeEvent.symbols[0];
    const beginTrackingTarget = beginTracking.symbols[0];
    if (removeEventTarget === undefined || beginTrackingTarget === undefined) {
      throw new Error("Expected indexed remapped Objective-C React Native methods.");
    }

    expect(persistedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "ios/RCTCalendarModule.m",
          reactNativeFacts: expect.objectContaining({
            nativeMethods: [
              expect.objectContaining({
                moduleName: "CalendarModule",
                methodName: "removeEvent"
              })
            ]
          })
        }),
        expect.objectContaining({
          filePath: "ios/RKLocationModule.m",
          reactNativeFacts: expect.objectContaining({
            nativeMethods: [
              expect.objectContaining({
                moduleName: "LocationModule",
                methodName: "beginTracking"
              })
            ]
          })
        })
      ])
    );
    for (const target of [removeEventTarget, beginTrackingTarget]) {
      const callers = await service.callers(projectPath, target.qualifiedName);
      expect(callers.relations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: expect.objectContaining({ name: "schedule" }),
            edge: expect.objectContaining({
              resolution: "exact",
              confidence: 1,
              evidence: expect.objectContaining({
                ruleId: "framework.react-native.native-modules.direct-module-and-method.ios.exact-target",
                stage: "module"
              })
            })
          })
        ])
      );
    }

    const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await reopened.init({ projectPath });
    const persistedCallers = await reopened.callers(projectPath, removeEventTarget.qualifiedName);
    expect(persistedCallers.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ name: "schedule" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.react-native.native-modules.direct-module-and-method.ios.exact-target"
            })
          })
        })
      ])
    );
  });

  it("persists React Native Swift external bridge declarations, implementations, and NativeModules callers", async () => {
    const projectPath = await createInlineProject({
      "src/mobile/bridge.ts": [
        'import { NativeModules } from "react-native";',
        "export function schedule() {",
        "  NativeModules.CalendarModule.createEvent();",
        "  NativeModules.CalendarJS.removeEvent();",
        "}"
      ].join("\n"),
      "ios/CalendarModuleExport.m": [
        "#import <React/RCTBridgeModule.h>",
        "@interface RCT_EXTERN_MODULE(CalendarModule, NSObject)",
        "RCT_EXTERN_METHOD(createEvent:(NSString *)name)",
        "@end"
      ].join("\n"),
      "ios/RemappedCalendarModuleExport.m": [
        "#import <React/RCTBridgeModule.h>",
        "@interface RCT_EXTERN_REMAP_MODULE(CalendarJS, CalendarModule, NSObject)",
        "_RCT_EXTERN_REMAP_METHOD(removeEvent, deleteEvent:(NSString *)eventId, NO)",
        "@end"
      ].join("\n"),
      "ios/CalendarModule.swift": [
        "@objc(CalendarModule)",
        "final class CalendarModule: NSObject {}",
        "",
        "extension CalendarModule {",
        "  @objc(createEvent:)",
        "  func writeEvent(name: String) {}",
        "  @objc(deleteEvent:)",
        "  func removeStoredEvent(eventId: String) {}",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const persistedFacts = graphStore.getArtifactFacts(projectPath);
    const createEvent = await service.find(
      projectPath,
      "ios/CalendarModuleExport.m#extern:CalendarModule.createEvent"
    );
    const removeEvent = await service.find(
      projectPath,
      "ios/RemappedCalendarModuleExport.m#extern:CalendarModule.removeEvent"
    );
    const writeEvent = await service.find(
      projectPath,
      "ios/CalendarModule.swift#extension:CalendarModule.writeEvent"
    );
    const removeStoredEvent = await service.find(
      projectPath,
      "ios/CalendarModule.swift#extension:CalendarModule.removeStoredEvent"
    );
    const createEventTarget = createEvent.symbols[0];
    const removeEventTarget = removeEvent.symbols[0];
    const writeEventTarget = writeEvent.symbols[0];
    const removeStoredEventTarget = removeStoredEvent.symbols[0];
    if (
      createEventTarget === undefined ||
      removeEventTarget === undefined ||
      writeEventTarget === undefined ||
      removeStoredEventTarget === undefined
    ) {
      throw new Error("Expected indexed React Native Swift external bridge methods and implementations.");
    }

    expect(persistedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "ios/CalendarModuleExport.m",
          reactNativeFacts: expect.objectContaining({
            nativeMethods: [
              expect.objectContaining({
                moduleName: "CalendarModule",
                methodName: "createEvent"
              })
            ],
            swiftExternalBridgeMethods: [
              expect.objectContaining({
                objcClassName: "CalendarModule",
                selector: "createEvent:"
              })
            ]
          })
        }),
        expect.objectContaining({
          filePath: "ios/RemappedCalendarModuleExport.m",
          reactNativeFacts: expect.objectContaining({
            nativeMethods: [
              expect.objectContaining({
                moduleName: "CalendarJS",
                methodName: "removeEvent"
              })
            ],
            swiftExternalBridgeMethods: [
              expect.objectContaining({
                objcClassName: "CalendarModule",
                selector: "deleteEvent:"
              })
            ]
          })
        }),
        expect.objectContaining({
          filePath: "ios/CalendarModule.swift",
          swiftObjectiveCFacts: expect.objectContaining({
            methods: [],
            types: [
              expect.objectContaining({
                swiftTypeName: "CalendarModule",
                objcClassName: "CalendarModule",
                filePath: "ios/CalendarModule.swift"
              })
            ],
            extensionMethods: [
              expect.objectContaining({
                extendedTypeName: "CalendarModule",
                selector: "createEvent:"
              }),
              expect.objectContaining({
                extendedTypeName: "CalendarModule",
                selector: "deleteEvent:"
              })
            ]
          })
        })
      ])
    );
    for (const target of [createEventTarget, removeEventTarget]) {
      const callers = await service.callers(projectPath, target.qualifiedName);
      expect(callers.relations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: expect.objectContaining({ name: "schedule" }),
            edge: expect.objectContaining({
              resolution: "exact",
              confidence: 1,
              evidence: expect.objectContaining({
                ruleId: "framework.react-native.native-modules.direct-module-and-method.ios.exact-target",
                stage: "module"
              })
            })
          })
        ])
      );
    }

    for (const [source, target, referenceName] of [
      [createEventTarget, writeEventTarget, "CalendarModule.createEvent:"],
      [removeEventTarget, removeStoredEventTarget, "CalendarModule.deleteEvent:"]
    ] as const) {
      const callees = await service.callees(projectPath, source.qualifiedName);
      expect(callees.relations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: expect.objectContaining({ id: target.id }),
            edge: expect.objectContaining({
              kind: "references",
              referenceName,
              resolution: "exact",
              confidence: 1,
              evidence: expect.objectContaining({
                ruleId: "framework.react-native.swift-extern.direct-objc-class-and-selector.exact-target",
                stage: "module"
              })
            })
          })
        ])
      );
    }

    const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await reopened.init({ projectPath });
    const persistedCallers = await reopened.callers(projectPath, createEventTarget.qualifiedName);
    expect(persistedCallers.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ name: "schedule" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.react-native.native-modules.direct-module-and-method.ios.exact-target"
            })
          })
        })
      ])
    );
    const persistedCallees = await reopened.callees(projectPath, createEventTarget.qualifiedName);
    expect(persistedCallees.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ id: writeEventTarget.id }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.react-native.swift-extern.direct-objc-class-and-selector.exact-target"
            })
          })
        })
      ])
    );
  });

  it("reprojects cross-file Swift extensions when Xcode source-target membership changes", async () => {
    const projectFile = (includeExtension: boolean): string =>
      [
        "{",
        "  objects = {",
        "    APP = { isa = PBXNativeTarget; buildPhases = ( SOURCES, ); };",
        "    SOURCES = {",
        "      isa = PBXSourcesBuildPhase;",
        "      files = (",
        "        BUILD_EXPORT,",
        "        BUILD_MODULE,",
        ...(includeExtension ? ["        BUILD_EXTENSION,"] : []),
        "      );",
        "    };",
        "    BUILD_EXPORT = { isa = PBXBuildFile; fileRef = EXPORT; };",
        "    BUILD_MODULE = { isa = PBXBuildFile; fileRef = MODULE; };",
        "    BUILD_EXTENSION = { isa = PBXBuildFile; fileRef = EXTENSION; };",
        "    ROOT = {",
        "      isa = PBXGroup;",
        "      children = ( EXPORT, MODULE, EXTENSION, );",
        "      sourceTree = \"<group>\";",
        "    };",
        "    EXPORT = { isa = PBXFileReference; path = CalendarModuleExport.m; sourceTree = \"<group>\"; };",
        "    MODULE = { isa = PBXFileReference; path = CalendarModule.swift; sourceTree = \"<group>\"; };",
        "    EXTENSION = { isa = PBXFileReference; path = CalendarModule+Extras.swift; sourceTree = \"<group>\"; };",
        "    PROJECT = { isa = PBXProject; mainGroup = ROOT; };",
        "  };",
        "  rootObject = PROJECT;",
        "}"
      ].join("\n");
    const projectPath = await createInlineProject({
      "ios/CalendarModuleExport.m": [
        "#import <React/RCTBridgeModule.h>",
        "@interface RCT_EXTERN_MODULE(CalendarModule, NSObject)",
        "RCT_EXTERN_METHOD(createEvent:(NSString *)name)",
        "@end"
      ].join("\n"),
      "ios/CalendarModule.swift": [
        "@objc(CalendarModule)",
        "final class CalendarModule: NSObject {}"
      ].join("\n"),
      "ios/CalendarModule+Extras.swift": [
        "extension CalendarModule {",
        "  @objc(createEvent:)",
        "  func writeEvent(name: String) {}",
        "}"
      ].join("\n"),
      "ios/App.xcodeproj/project.pbxproj": projectFile(true)
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
    const bridge = (await service.find(
      projectPath,
      "ios/CalendarModuleExport.m#extern:CalendarModule.createEvent"
    )).symbols[0];
    const extensionMethod = (await service.find(
      projectPath,
      "ios/CalendarModule+Extras.swift#extension:CalendarModule.writeEvent"
    )).symbols[0];
    if (bridge === undefined || extensionMethod === undefined) {
      throw new Error("Expected the Xcode-target Swift bridge fixture to be indexed.");
    }
    expect(
      graphStore.getSnapshot(projectPath).edges.find(
        (edge) =>
          edge.sourceId === bridge.id &&
          edge.referenceName === "CalendarModule.createEvent:" &&
          edge.targetId === extensionMethod.id
      )?.evidence
    ).toMatchObject({
      ruleId:
        "framework.react-native.swift-extern.xcode-target.explicit-objc-class-and-selector.exact-target",
      configurationPaths: ["ios/App.xcodeproj/project.pbxproj"]
    });

    await writeFile(
      join(projectPath, "ios", "App.xcodeproj", "project.pbxproj"),
      projectFile(false),
      "utf8"
    );
    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["project-inputs-changed"]
    });
    const synced = await service.sync({ projectPath });

    expect(extractionCount).toBe(3);
    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: [],
      reusedArtifactFiles: [
        "ios/CalendarModule+Extras.swift",
        "ios/CalendarModule.swift",
        "ios/CalendarModuleExport.m"
      ]
    });
    expect(
      graphStore.getSnapshot(projectPath).edges.find(
        (edge) => edge.sourceId === bridge.id && edge.referenceName === "CalendarModule.createEvent:"
      )
    ).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({
        ruleId:
          "framework.react-native.swift-extern.xcode-target.explicit-objc-class-and-selector.unresolved-target",
        candidateSymbolIds: [extensionMethod.id]
      })
    });
  });

  it("persists React Native Codegen Spec bridge targets only after their TypeScript contracts are unique", async () => {
    const projectPath = await createInlineProject({
      "src/mobile/NativeCalendar.ts": [
        'import { NativeModules, TurboModuleRegistry } from "react-native";',
        'import type { TurboModule } from "react-native";',
        "export interface Spec extends TurboModule {",
        "  createCodegenEvent(): void;",
        "  cancelCodegenEvent(): void;",
        "}",
        'const Calendar = TurboModuleRegistry.getEnforcing<Spec>("CalendarModule");',
        "export function schedule() {",
        "  Calendar.createCodegenEvent();",
        "  Calendar.cancelCodegenEvent();",
        "  NativeModules.UncontractedModule.uncontracted();",
        "}"
      ].join("\n"),
      "android/NativeCalendarModule.java": [
        "import com.example.NativeCalendarSpec;",
        "public class NativeCalendarModule extends NativeCalendarSpec {",
        '  private static final String NAME = "CalendarModule";',
        "  @Override public String getName() { return NAME; }",
        "  @Override public void createCodegenEvent() {}",
        "}"
      ].join("\n"),
      "android/NativeCalendarModule.kt": [
        "import com.example.NativeCalendarSpec",
        "class NativeCalendarModule(context: Any) : NativeCalendarSpec(context) {",
        "  companion object {",
        '    const val NAME: String = "CalendarModule"',
        "  }",
        "  override fun getName(): String = NAME",
        "  override fun cancelCodegenEvent() {}",
        "}"
      ].join("\n"),
      "android/NativeUncontractedModule.java": [
        "import com.example.NativeUncontractedSpec;",
        "public class NativeUncontractedModule extends NativeUncontractedSpec {",
        '  @Override public String getName() { return "UncontractedModule"; }',
        "  @Override public void uncontracted() {}",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const persistedFacts = graphStore.getArtifactFacts(projectPath);
    const javaMethod = await service.find(
      projectPath,
      "android/NativeCalendarModule.java#NativeCalendarModule.createCodegenEvent"
    );
    const kotlinMethod = await service.find(
      projectPath,
      "android/NativeCalendarModule.kt#NativeCalendarModule.cancelCodegenEvent"
    );
    const uncontractedMethod = await service.find(
      projectPath,
      "android/NativeUncontractedModule.java#NativeUncontractedModule.uncontracted"
    );
    const javaTarget = javaMethod.symbols[0];
    const kotlinTarget = kotlinMethod.symbols[0];
    const uncontractedTarget = uncontractedMethod.symbols[0];
    if (javaTarget === undefined || kotlinTarget === undefined || uncontractedTarget === undefined) {
      throw new Error("Expected indexed React Native Codegen methods.");
    }

    expect(persistedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "android/NativeCalendarModule.java",
          reactNativeFacts: expect.objectContaining({
            nativeMethods: [
              expect.objectContaining({
                moduleName: "CalendarModule",
                methodName: "createCodegenEvent",
                implementationKind: "codegen-spec-override"
              })
            ]
          })
        }),
        expect.objectContaining({
          filePath: "android/NativeCalendarModule.kt",
          reactNativeFacts: expect.objectContaining({
            nativeMethods: [
              expect.objectContaining({
                moduleName: "CalendarModule",
                methodName: "cancelCodegenEvent",
                implementationKind: "codegen-spec-override"
              })
            ]
          })
        }),
        expect.objectContaining({
          filePath: "android/NativeUncontractedModule.java",
          reactNativeFacts: expect.objectContaining({
            nativeMethods: [
              expect.objectContaining({
                moduleName: "UncontractedModule",
                methodName: "uncontracted",
                implementationKind: "codegen-spec-override"
              })
            ]
          })
        })
      ])
    );
    for (const target of [javaTarget, kotlinTarget]) {
      const callers = await service.callers(projectPath, target.qualifiedName);
      expect(callers.relations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: expect.objectContaining({ name: "schedule" }),
            edge: expect.objectContaining({
              resolution: "exact",
              evidence: expect.objectContaining({
                ruleId:
                  "framework.react-native.codegen-spec.turbo-direct-registry.direct-spec-superclass-and-unique-typescript-contract.android.exact-target",
                stage: "module"
              })
            })
          })
        ])
      );
    }
    const uncontractedCallers = await service.callers(projectPath, uncontractedTarget.qualifiedName);
    expect(
      uncontractedCallers.relations.some((relation) => relation.symbol.name === "schedule")
    ).toBe(false);

    const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await reopened.init({ projectPath });
    const persistedCallers = await reopened.callers(projectPath, javaTarget.qualifiedName);
    expect(persistedCallers.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ name: "schedule" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.react-native.codegen-spec.turbo-direct-registry.direct-spec-superclass-and-unique-typescript-contract.android.exact-target"
            })
          })
        })
      ])
    );
  });

  it("persists React Native TurboModule specs and direct registry calls across Android and iOS", async () => {
    const projectPath = await createInlineProject({
      "src/mobile/NativeCalendar.ts": [
        'import { TurboModuleRegistry } from "react-native";',
        'import type { TurboModule } from "react-native";',
        "export interface Spec extends TurboModule {",
        "  createEvent(): void;",
        "}",
        'const Calendar = TurboModuleRegistry.getEnforcing<Spec>("CalendarModule");',
        "export function schedule() { Calendar.createEvent(); }"
      ].join("\n"),
      "android/CalendarModule.java": [
        "import com.facebook.react.bridge.ReactContextBaseJavaModule;",
        "import com.facebook.react.bridge.ReactMethod;",
        "public class CalendarModule extends ReactContextBaseJavaModule {",
        '  public String getName() { return "CalendarModule"; }',
        "  @ReactMethod public void createEvent() {}",
        "}"
      ].join("\n"),
      "ios/CalendarModule.m": [
        "#import <React/RCTBridgeModule.h>",
        "@implementation CalendarModule",
        "RCT_EXPORT_MODULE(CalendarModule)",
        "RCT_EXPORT_METHOD(createEvent)",
        "@end"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const persistedFacts = graphStore.getArtifactFacts(projectPath);
    const javaMethod = await service.find(
      projectPath,
      "android/CalendarModule.java#CalendarModule.createEvent"
    );
    const specMethod = await service.find(projectPath, "src/mobile/NativeCalendar.ts#Spec.createEvent");
    const javaTarget = javaMethod.symbols[0];
    const specTarget = specMethod.symbols[0];
    if (javaTarget === undefined || specTarget === undefined) {
      throw new Error("Expected indexed React Native TurboModule symbols.");
    }

    expect(persistedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/mobile/NativeCalendar.ts",
          reactNativeFacts: expect.objectContaining({
            turboModuleCalls: [expect.objectContaining({ moduleName: "CalendarModule" })],
            turboModuleSpecMethods: [expect.objectContaining({ methodName: "createEvent" })]
          })
        })
      ])
    );
    const callers = await service.callers(projectPath, javaTarget.qualifiedName);
    expect(callers.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ name: "schedule" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.react-native.turbo-modules.direct-registry.literal-module-and-method.android.exact-target"
            })
          })
        }),
        expect.objectContaining({
          symbol: expect.objectContaining({ id: specTarget.id }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.react-native.turbo-modules.spec-contract.literal-module-and-method.android.exact-target"
            })
          })
        })
      ])
    );

    const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await reopened.init({ projectPath });
    const persistedCallers = await reopened.callers(projectPath, javaTarget.qualifiedName);
    expect(persistedCallers.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ name: "schedule" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.react-native.turbo-modules.direct-registry.literal-module-and-method.android.exact-target",
              stage: "module"
            })
          })
        })
      ])
    );
  });

  it("persists React Native TurboModule default-import bridge calls through a static re-export chain", async () => {
    const projectPath = await createInlineProject({
      "src/mobile/NativeCalendar.ts": [
        'import { TurboModuleRegistry } from "react-native";',
        'import type { TurboModule } from "react-native";',
        "export interface Spec extends TurboModule { createEvent(): void; }",
        'const Calendar = TurboModuleRegistry.getEnforcing<Spec>("CalendarModule");',
        "export default Calendar;"
      ].join("\n"),
      "src/mobile/NativeCalendarBarrel.ts": 'export { default } from "./NativeCalendar";',
      "src/mobile/NativeCalendarApi.ts": [
        'import Calendar from "./NativeCalendarBarrel";',
        "export default Calendar;"
      ].join("\n"),
      "src/mobile/useCalendar.ts": [
        'import Calendar from "./NativeCalendarApi";',
        "export function schedule() { Calendar.createEvent(); }"
      ].join("\n"),
      "android/CalendarModule.java": [
        "import com.facebook.react.bridge.ReactContextBaseJavaModule;",
        "import com.facebook.react.bridge.ReactMethod;",
        "public class CalendarModule extends ReactContextBaseJavaModule {",
        '  private static final String NAME = "CalendarModule";',
        "  public String getName() { return NAME; }",
        "  @ReactMethod public void createEvent() {}",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const persistedFacts = graphStore.getArtifactFacts(projectPath);
    const javaMethod = await service.find(
      projectPath,
      "android/CalendarModule.java#CalendarModule.createEvent"
    );
    const javaTarget = javaMethod.symbols[0];
    if (javaTarget === undefined) {
      throw new Error("Expected indexed React Native TurboModule default-import target.");
    }

    expect(persistedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/mobile/NativeCalendar.ts",
          reactNativeFacts: expect.objectContaining({
            turboModuleDefaultExports: [expect.objectContaining({ moduleName: "CalendarModule" })]
          })
        }),
        expect.objectContaining({
          filePath: "src/mobile/useCalendar.ts",
          reactNativeFacts: expect.objectContaining({
            turboModuleDefaultImportCalls: [
              expect.objectContaining({ moduleSpecifier: "./NativeCalendarApi", methodName: "createEvent" })
            ]
          })
        }),
        expect.objectContaining({
          filePath: "android/CalendarModule.java",
          reactNativeFacts: expect.objectContaining({
            nativeMethods: [
              expect.objectContaining({
                platform: "android",
                moduleName: "CalendarModule",
                methodName: "createEvent"
              })
            ]
          })
        })
      ])
    );
    const callers = await service.callers(projectPath, javaTarget.qualifiedName);
    expect(callers.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ name: "schedule" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId:
                "framework.react-native.turbo-modules.default-re-export.literal-module-and-method.android.exact-target",
              resolutionPath: [
                "src/mobile/NativeCalendarApi.ts",
                "src/mobile/NativeCalendarBarrel.ts",
                "src/mobile/NativeCalendar.ts"
              ]
            })
          })
        })
      ])
    );

    const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await reopened.init({ projectPath });
    const persistedCallers = await reopened.callers(projectPath, javaTarget.qualifiedName);
    expect(persistedCallers.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: expect.objectContaining({ name: "schedule" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId:
                "framework.react-native.turbo-modules.default-re-export.literal-module-and-method.android.exact-target",
              stage: "module",
              resolutionPath: [
                "src/mobile/NativeCalendarApi.ts",
                "src/mobile/NativeCalendarBarrel.ts",
                "src/mobile/NativeCalendar.ts"
              ]
            })
          })
        })
      ])
    );
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

  it("indexes direct Koa router routes with exact imported handler evidence", async () => {
    const projectPath = await createInlineProject({
      "src/handlers.ts": [
        "export function listUsers() { return []; }",
        "export function removeUser() { return undefined; }"
      ].join("\n"),
      "src/routes.ts": [
        'import Router from "@koa/router";',
        'import { listUsers, removeUser } from "./handlers.js";',
        "const router = new Router();",
        'router.get("/users", listUsers);',
        'router.del("/users/:id", removeUser);'
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/routes.ts");
    const found = await service.find(projectPath, "src/handlers.ts#listUsers");
    const listUsers = found.symbols[0];
    if (listUsers === undefined) {
      throw new Error("Expected indexed Koa handler.");
    }
    const callers = await service.callers(projectPath, listUsers.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(
      persistedFacts?.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([
      ["listUsers", "koa"],
      ["removeUser", "koa"]
    ]);
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
              ruleId: "framework.koa.router.literal-route.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#listUsers" })
        }),
        expect.objectContaining({
          method: "DELETE",
          path: "/users/:id",
          route: expect.objectContaining({ kind: "route", name: "DELETE /users/:id" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.koa.router.literal-route.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.ts#removeUser" })
        })
      ])
    );
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "GET /users" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.koa.router.literal-route.imported-handler", stage: "module" }
        }
      }
    ]);
  });

  it("indexes direct Hono routes in JavaScript with exact imported handler evidence", async () => {
    const projectPath = await createInlineProject({
      "src/handlers.js": [
        "export function listUsers() { return []; }",
        "export function removeUser() { return undefined; }"
      ].join("\n"),
      "src/routes.js": [
        'import { Hono } from "hono";',
        'import { listUsers, removeUser } from "./handlers.js";',
        "const app = new Hono();",
        'app.get("/users", listUsers);',
        'app.delete("/users/:id", removeUser);'
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/routes.js");
    const found = await service.find(projectPath, "src/handlers.js#listUsers");
    const listUsers = found.symbols[0];
    if (listUsers === undefined) {
      throw new Error("Expected indexed Hono handler.");
    }
    const callers = await service.callers(projectPath, listUsers.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(
      persistedFacts?.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([
      ["listUsers", "hono"],
      ["removeUser", "hono"]
    ]);
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
              ruleId: "framework.hono.app.literal-route.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.js#listUsers" })
        }),
        expect.objectContaining({
          method: "DELETE",
          path: "/users/:id",
          route: expect.objectContaining({ kind: "route", name: "DELETE /users/:id" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.hono.app.literal-route.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.js#removeUser" })
        })
      ])
    );
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "GET /users" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.hono.app.literal-route.imported-handler", stage: "module" }
        }
      }
    ]);
  });

  it("indexes direct Elysia routes in JavaScript with exact imported handler evidence", async () => {
    const projectPath = await createInlineProject({
      "src/handlers.js": [
        "export function listUsers() { return []; }",
        "export function removeUser() { return undefined; }"
      ].join("\n"),
      "src/routes.js": [
        'import { Elysia } from "elysia";',
        'import { listUsers, removeUser } from "./handlers.js";',
        "const app = new Elysia();",
        'app.get("/users", listUsers);',
        'app.delete("/users/:id", removeUser);'
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/routes.js");
    const found = await service.find(projectPath, "src/handlers.js#listUsers");
    const listUsers = found.symbols[0];
    if (listUsers === undefined) {
      throw new Error("Expected indexed Elysia handler.");
    }
    const callers = await service.callers(projectPath, listUsers.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(
      persistedFacts?.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([
      ["listUsers", "elysia"],
      ["removeUser", "elysia"]
    ]);
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
              ruleId: "framework.elysia.app.literal-route.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.js#listUsers" })
        }),
        expect.objectContaining({
          method: "DELETE",
          path: "/users/:id",
          route: expect.objectContaining({ kind: "route", name: "DELETE /users/:id" }),
          edge: expect.objectContaining({
            kind: "routes",
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.elysia.app.literal-route.imported-handler",
              stage: "module"
            })
          }),
          handler: expect.objectContaining({ qualifiedName: "src/handlers.js#removeUser" })
        })
      ])
    );
    expect(callers.relations).toMatchObject([
      {
        symbol: { kind: "route", name: "GET /users" },
        edge: {
          kind: "routes",
          resolution: "exact",
          evidence: { ruleId: "framework.elysia.app.literal-route.imported-handler", stage: "module" }
        }
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

  it("indexes Astro default components plus static, dynamic, and rest filesystem pages", async () => {
    const projectPath = await createInlineProject({
      "src/pages/index.astro": "<main>Home</main>",
      "src/pages/catalog/index.astro": [
        "---",
        'export const title = "Catalog";',
        "---",
        "<main>{title}</main>"
      ].join("\n"),
      "src/pages/blog/[slug].astro": "<main>Dynamic</main>",
      "src/pages/docs/[...parts].astro": "<main>Docs</main>"
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
      counts: { files: 4, symbols: expect.any(Number), edges: expect.any(Number) }
    });
    expect(persistedAstroFacts).toHaveLength(4);
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
        }),
        expect.objectContaining({
          method: "NAVIGATE",
          path: "/blog/:slug",
          handler: expect.objectContaining({
            qualifiedName: "src/pages/blog/[slug].astro#default"
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
          path: "/docs/*parts",
          handler: expect.objectContaining({
            qualifiedName: "src/pages/docs/[...parts].astro#default"
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
    expect(routes.routes.map((route) => route.path)).toEqual(
      expect.arrayContaining(["/blog/:slug", "/docs/*parts"])
    );
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

  it("indexes Astro endpoints only with unique config evidence and updates them across config drift", async () => {
    const projectPath = await createInlineProject({
      "src/pages/api/[id].json.ts": [
        "export function GET() { return new Response(); }",
        "export const POST = () => new Response();"
      ].join("\n"),
      "src/pages/health.mjs": "export const HEAD = () => new Response();\n",
      "src/pages/next-like.ts": "export default function Page() { return null; }\n",
      "src/shared.ts": "export const shared = true;\n"
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
    expect(extractionCount).toBe(4);
    expect((await service.routes(projectPath, { method: "GET" })).routes).toEqual([]);
    expect((await service.routes(projectPath, { method: "NAVIGATE" })).routes).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/next-like" })])
    );

    await writeFile(join(projectPath, "astro.config.mjs"), "export default {};\n", "utf8");
    const enabled = await service.sync({ projectPath });
    const enabledRoutes = await service.routes(projectPath);

    expect(extractionCount).toBe(8);
    expect(enabled).toMatchObject({ stale: false, staleReasons: [] });
    expect(enabled.lastIndexWork).toMatchObject({
      reExtractedFiles: [
        "astro.config.mjs",
        "src/pages/api/[id].json.ts",
        "src/pages/health.mjs",
        "src/pages/next-like.ts"
      ],
      reusedArtifactFiles: ["src/shared.ts"],
      reuseInvalidationReasons: expect.arrayContaining([
        "framework-evidence-changed",
        "missing-persisted-facts"
      ])
    });
    expect(graphStore.getIndexInputs(projectPath)?.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "astro-config", path: "astro.config.mjs", state: "present" })
      ])
    );
    expect(enabledRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/api/:id.json",
          handler: expect.objectContaining({ qualifiedName: "src/pages/api/[id].json.ts#GET" }),
          edge: expect.objectContaining({
            resolution: "exact",
            evidence: expect.objectContaining({
              ruleId: "framework.astro.filesystem-endpoint.local-handler",
              stage: "lexical"
            })
          })
        }),
        expect.objectContaining({
          method: "POST",
          path: "/api/:id.json",
          handler: expect.objectContaining({ qualifiedName: "src/pages/api/[id].json.ts#POST" })
        }),
        expect.objectContaining({
          method: "HEAD",
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/pages/health.mjs#HEAD" })
        })
      ])
    );
    expect(enabledRoutes.routes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ method: "NAVIGATE", path: "/next-like" })])
    );

    await rm(join(projectPath, "astro.config.mjs"));
    const disabled = await service.sync({ projectPath });

    expect(extractionCount).toBe(11);
    expect(disabled).toMatchObject({ stale: false, staleReasons: [] });
    expect(disabled.lastIndexWork).toMatchObject({
      reExtractedFiles: [
        "src/pages/api/[id].json.ts",
        "src/pages/health.mjs",
        "src/pages/next-like.ts"
      ],
      reusedArtifactFiles: ["src/shared.ts"],
      reuseInvalidationReasons: ["framework-evidence-changed"]
    });
    expect((await service.routes(projectPath, { method: "GET" })).routes).toEqual([]);
    expect((await service.routes(projectPath, { method: "NAVIGATE" })).routes).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/next-like" })])
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
      "config/settings.yml": [
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
      .find((facts) => facts.filePath === "config/settings.yml");
    const serviceKey = await service.find(projectPath, "config/settings.yml#yaml-key:service");

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
        qualifiedName: "config/settings.yml#yaml-key:service",
        isExported: false
      }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "config/settings.yml", language: "yaml" }
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
        ruleId: "framework.spring-boot.config.direct-value.literal-key.unresolved-key",
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
        ruleId: "framework.spring-boot.config.direct-value.literal-key.unresolved-key",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });
  });

  it("projects conservative Spring Boot @Value property references across conventional YAML files", async () => {
    const projectPath = await createInlineProject({
      "config/application.yml": [
        "server:",
        "  port: 8080",
        "feature:",
        "  enabled: true",
        "shared:",
        "  mode: yaml",
        "spring:",
        "  datasource:",
        "    password: yaml-secret"
      ].join("\n"),
      "config/application-dev.yaml": ["feature:", "  enabled: false"].join("\n"),
      "config/bootstrap-prod.yml": ["app:", "  name: symbol-lattice"].join("\n"),
      "config/application.properties": "shared.mode=properties\n",
      "src/config/YamlConfig.java": [
        "import org.springframework.beans.factory.annotation.Value;",
        "",
        "class YamlConfig {",
        '  @Value("${server.port}")',
        "  private String port;",
        '  @Value("${feature.enabled:false}")',
        "  private boolean enabled;",
        '  @Value("${app.name}")',
        "  private String appName;",
        '  @Value("${shared.mode}")',
        "  private String sharedMode;",
        '  @Value("${missing.key}")',
        "  private String missing;",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const configurationClass = (
      await service.find(projectPath, "src/config/YamlConfig.java#YamlConfig")
    ).symbols[0];
    const serverPort = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:server.port")
    ).symbols[0];
    const appName = (
      await service.find(projectPath, "config/bootstrap-prod.yml#spring-boot-yaml-key:app.name")
    ).symbols[0];
    const applicationFeature = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:feature.enabled")
    ).symbols[0];
    const developmentFeature = (
      await service.find(projectPath, "config/application-dev.yaml#spring-boot-yaml-key:feature.enabled")
    ).symbols[0];
    const yamlSharedMode = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:shared.mode")
    ).symbols[0];
    const propertiesSharedMode = (
      await service.find(projectPath, "config/application.properties#properties-key:shared.mode")
    ).symbols[0];
    if (
      configurationClass === undefined ||
      serverPort === undefined ||
      appName === undefined ||
      applicationFeature === undefined ||
      developmentFeature === undefined ||
      yamlSharedMode === undefined ||
      propertiesSharedMode === undefined
    ) {
      throw new Error("Expected indexed Spring Boot YAML configuration symbols.");
    }

    const serverPortCallers = await service.callers(projectPath, serverPort.qualifiedName);
    const configurationCallees = await service.callees(projectPath, configurationClass.qualifiedName);
    const yamlFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.yml");
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
    const mixedSharedReference = snapshot.edges.find(
      (edge) =>
        edge.sourceId === configurationClass.id &&
        edge.kind === "references" &&
        edge.referenceName === "shared.mode"
    );
    const missingReference = snapshot.edges.find(
      (edge) =>
        edge.sourceId === configurationClass.id &&
        edge.kind === "references" &&
        edge.referenceName === "missing.key"
    );

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 5, symbols: 13, edges: 13 }
    });
    expect(JSON.stringify(yamlFacts)).not.toContain("yaml-secret");
    expect(serverPortCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({ id: configurationClass.id }),
        edge: expect.objectContaining({
          kind: "references",
          resolution: "exact",
          referenceName: "server.port",
          evidence: expect.objectContaining({
            ruleId: "framework.spring-boot.yaml.direct-value.literal-key.exact-key",
            stage: "module",
            candidateSymbolIds: [serverPort.id],
            configurationPaths: ["config/application.yml"]
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
      referenceName: "app.name",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.yaml.direct-value.literal-key.exact-key",
        configurationPaths: ["config/bootstrap-prod.yml"]
      })
    });
    expect(ambiguousFeatureReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      referenceName: "feature.enabled",
      evidence: {
        ruleId: "framework.spring-boot.yaml.direct-value.literal-key.ambiguous-key",
        stage: "unresolved",
        candidateSymbolIds: expect.arrayContaining([applicationFeature.id, developmentFeature.id]),
        configurationPaths: expect.arrayContaining([
          "config/application.yml",
          "config/application-dev.yaml"
        ])
      }
    });
    expect(mixedSharedReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      referenceName: "shared.mode",
      evidence: {
        ruleId: "framework.spring-boot.config.direct-value.literal-key.ambiguous-key",
        stage: "unresolved",
        candidateSymbolIds: expect.arrayContaining([yamlSharedMode.id, propertiesSharedMode.id]),
        configurationPaths: expect.arrayContaining([
          "config/application.yml",
          "config/application.properties"
        ])
      }
    });
    expect(missingReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      referenceName: "missing.key",
      evidence: {
        ruleId: "framework.spring-boot.config.direct-value.literal-key.unresolved-key",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });

    await writeFile(
      join(projectPath, "config", "application.yml"),
      ["feature:", "  enabled: true", "shared:", "  mode: yaml"].join("\n"),
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

    expect(synced.lastIndexWork?.reusedArtifactFiles).toContain("src/config/YamlConfig.java");
    expect(serverPortAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.config.direct-value.literal-key.unresolved-key",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });
  });

  it("projects conservative Kotlin Spring Boot @Value references across YAML and properties files", async () => {
    const projectPath = await createInlineProject({
      "config/application.yml": [
        "server:",
        "  port: 8080",
        "feature:",
        "  enabled: true",
        "spring:",
        "  datasource:",
        "    password: kotlin-secret"
      ].join("\n"),
      "config/application-dev.yaml": ["feature:", "  enabled: false"].join("\n"),
      "config/bootstrap.properties": "app.name=symbol-lattice\n",
      "src/config/KotlinConfig.kt": [
        "import org.springframework.beans.factory.annotation.Value",
        "",
        "class KotlinConfig {",
        '  @Value("\\${server.port}")',
        "  private val port: String = \"\"",
        '  @Value("\\${feature.enabled:false}")',
        "  private val enabled: Boolean = false",
        '  @org.springframework.beans.factory.annotation.Value("\\${app.name}")',
        "  private val appName: String = \"\"",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const configurationClass = (
      await service.find(projectPath, "src/config/KotlinConfig.kt#KotlinConfig")
    ).symbols[0];
    const serverPort = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:server.port")
    ).symbols[0];
    const appName = (
      await service.find(projectPath, "config/bootstrap.properties#properties-key:app.name")
    ).symbols[0];
    const applicationFeature = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:feature.enabled")
    ).symbols[0];
    const developmentFeature = (
      await service.find(projectPath, "config/application-dev.yaml#spring-boot-yaml-key:feature.enabled")
    ).symbols[0];
    if (
      configurationClass === undefined ||
      serverPort === undefined ||
      appName === undefined ||
      applicationFeature === undefined ||
      developmentFeature === undefined
    ) {
      throw new Error("Expected indexed Kotlin Spring Boot configuration symbols.");
    }

    const serverPortCallers = await service.callers(projectPath, serverPort.qualifiedName);
    const kotlinFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/KotlinConfig.kt");
    const yamlFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.yml");
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

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 4, symbols: 10, edges: 9 }
    });
    expect(kotlinFacts?.springBootPropertiesFacts).toMatchObject({
      valueReferences: [
        { sourceId: configurationClass.id, key: "server.port" },
        { sourceId: configurationClass.id, key: "feature.enabled" },
        { sourceId: configurationClass.id, key: "app.name" }
      ]
    });
    expect(JSON.stringify(yamlFacts)).not.toContain("kotlin-secret");
    expect(serverPortCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({ id: configurationClass.id }),
        edge: expect.objectContaining({
          kind: "references",
          resolution: "exact",
          referenceName: "server.port",
          evidence: expect.objectContaining({
            ruleId: "framework.spring-boot.yaml.direct-value.literal-key.exact-key",
            stage: "module",
            candidateSymbolIds: [serverPort.id],
            configurationPaths: ["config/application.yml"]
          })
        })
      })
    ]);
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
      referenceName: "app.name",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.properties.direct-value.literal-key.exact-key",
        configurationPaths: ["config/bootstrap.properties"]
      })
    });
    expect(ambiguousFeatureReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      referenceName: "feature.enabled",
      evidence: {
        ruleId: "framework.spring-boot.yaml.direct-value.literal-key.ambiguous-key",
        stage: "unresolved",
        candidateSymbolIds: expect.arrayContaining([applicationFeature.id, developmentFeature.id]),
        configurationPaths: expect.arrayContaining([
          "config/application.yml",
          "config/application-dev.yaml"
        ])
      }
    });

    await writeFile(
      join(projectPath, "config", "application.yml"),
      ["feature:", "  enabled: true"].join("\n"),
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

    expect(synced.lastIndexWork?.reusedArtifactFiles).toContain("src/config/KotlinConfig.kt");
    expect(serverPortAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.config.direct-value.literal-key.unresolved-key",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });
  });

  it("projects direct Java and Kotlin Spring @Value constructor parameters through conservative configuration resolution", async () => {
    const projectPath = await createInlineProject({
      "config/application.properties": [
        "constructor.java.port=java-constructor-secret",
        "constructor.kotlin-mode=kotlin-constructor-secret"
      ].join("\n"),
      "src/config/JavaConstructorConfig.java": [
        "import org.springframework.beans.factory.annotation.Value;",
        "",
        "class JavaConstructorConfig {",
        '  JavaConstructorConfig(@Value("${constructor.java.port}") String port) {}',
        "}"
      ].join("\n"),
      "src/config/KotlinConstructorConfig.kt": [
        "import org.springframework.beans.factory.annotation.Value",
        "",
        "class KotlinConstructorConfig(",
        '  @Value("\\${constructor.kotlinMode}") mode: String',
        ")"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const javaConfig = (
      await service.find(projectPath, "src/config/JavaConstructorConfig.java#JavaConstructorConfig")
    ).symbols[0];
    const kotlinConfig = (
      await service.find(projectPath, "src/config/KotlinConstructorConfig.kt#KotlinConstructorConfig")
    ).symbols[0];
    const javaPort = (
      await service.find(projectPath, "config/application.properties#properties-key:constructor.java.port")
    ).symbols[0];
    const kotlinMode = (
      await service.find(projectPath, "config/application.properties#properties-key:constructor.kotlin-mode")
    ).symbols[0];
    if (
      javaConfig === undefined ||
      kotlinConfig === undefined ||
      javaPort === undefined ||
      kotlinMode === undefined
    ) {
      throw new Error("Expected indexed Spring constructor configuration symbols.");
    }

    const javaFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/JavaConstructorConfig.java");
    const kotlinFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/KotlinConstructorConfig.kt");
    const propertiesFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.properties");
    const snapshot = graphStore.getSnapshot(projectPath);
    const javaReference = snapshot.edges.find(
      (edge) => edge.sourceId === javaConfig.id && edge.targetId === javaPort.id
    );
    const kotlinReference = snapshot.edges.find(
      (edge) => edge.sourceId === kotlinConfig.id && edge.targetId === kotlinMode.id
    );
    const javaCallers = await service.callers(projectPath, javaPort.qualifiedName);
    const kotlinCallers = await service.callers(projectPath, kotlinMode.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: 8, edges: 7 }
    });
    expect(javaFacts?.springBootPropertiesFacts?.valueReferences).toEqual([
      expect.objectContaining({ sourceId: javaConfig.id, key: "constructor.java.port" })
    ]);
    expect(kotlinFacts?.springBootPropertiesFacts?.valueReferences).toEqual([
      expect.objectContaining({ sourceId: kotlinConfig.id, key: "constructor.kotlinMode" })
    ]);
    expect(JSON.stringify(propertiesFacts)).not.toContain("constructor-secret");
    expect(javaCallers.relations.map((relation) => relation.symbol.id)).toEqual([javaConfig.id]);
    expect(kotlinCallers.relations.map((relation) => relation.symbol.id)).toEqual([kotlinConfig.id]);
    expect(javaReference).toMatchObject({
      kind: "references",
      resolution: "exact",
      confidence: 1,
      referenceName: "constructor.java.port",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.properties.direct-value.literal-key.exact-key",
        stage: "module",
        candidateSymbolIds: [javaPort.id],
        configurationPaths: ["config/application.properties"]
      })
    });
    expect(kotlinReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.75,
      referenceName: "constructor.kotlinMode",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.properties.direct-value.relaxed-key.unique-key",
        stage: "heuristic",
        candidateSymbolIds: [kotlinMode.id],
        configurationPaths: ["config/application.properties"]
      })
    });

    await writeFile(
      join(projectPath, "config", "application.properties"),
      "feature.enabled=true\n",
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const afterSync = graphStore.getSnapshot(projectPath);
    const javaAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === javaConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "constructor.java.port"
    );
    const kotlinAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === kotlinConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "constructor.kotlinMode"
    );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toEqual(
      expect.arrayContaining([
        "src/config/JavaConstructorConfig.java",
        "src/config/KotlinConstructorConfig.kt"
      ])
    );
    expect(javaAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({ stage: "unresolved", candidateSymbolIds: [] })
    });
    expect(kotlinAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({ stage: "unresolved", candidateSymbolIds: [] })
    });
  });

  it("projects direct Java and Kotlin Spring @Value method parameters through conservative configuration resolution", async () => {
    const projectPath = await createInlineProject({
      "config/application.properties": [
        "method.java.port=java-method-secret",
        "method.kotlin-mode=kotlin-method-secret"
      ].join("\n"),
      "src/config/JavaMethodConfig.java": [
        "import org.springframework.beans.factory.annotation.Value;",
        "",
        "class JavaMethodConfig {",
        '  void configure(@Value("${method.java.port}") String port) {}',
        "}"
      ].join("\n"),
      "src/config/KotlinMethodConfig.kt": [
        "import org.springframework.beans.factory.annotation.Value",
        "",
        "class KotlinMethodConfig {",
        '  fun configure(@Value("\\${method.kotlinMode}") mode: String) {}',
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const javaConfig = (
      await service.find(projectPath, "src/config/JavaMethodConfig.java#JavaMethodConfig")
    ).symbols[0];
    const kotlinConfig = (
      await service.find(projectPath, "src/config/KotlinMethodConfig.kt#KotlinMethodConfig")
    ).symbols[0];
    const javaPort = (
      await service.find(projectPath, "config/application.properties#properties-key:method.java.port")
    ).symbols[0];
    const kotlinMode = (
      await service.find(projectPath, "config/application.properties#properties-key:method.kotlin-mode")
    ).symbols[0];
    if (
      javaConfig === undefined ||
      kotlinConfig === undefined ||
      javaPort === undefined ||
      kotlinMode === undefined
    ) {
      throw new Error("Expected indexed Spring method configuration symbols.");
    }

    const javaFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/JavaMethodConfig.java");
    const kotlinFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/KotlinMethodConfig.kt");
    const propertiesFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.properties");
    const snapshot = graphStore.getSnapshot(projectPath);
    const javaReference = snapshot.edges.find(
      (edge) => edge.sourceId === javaConfig.id && edge.targetId === javaPort.id
    );
    const kotlinReference = snapshot.edges.find(
      (edge) => edge.sourceId === kotlinConfig.id && edge.targetId === kotlinMode.id
    );
    const javaCallers = await service.callers(projectPath, javaPort.qualifiedName);
    const kotlinCallers = await service.callers(projectPath, kotlinMode.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: 9, edges: 8 }
    });
    expect(javaFacts?.springBootPropertiesFacts?.valueReferences).toEqual([
      expect.objectContaining({ sourceId: javaConfig.id, key: "method.java.port" })
    ]);
    expect(kotlinFacts?.springBootPropertiesFacts?.valueReferences).toEqual([
      expect.objectContaining({ sourceId: kotlinConfig.id, key: "method.kotlinMode" })
    ]);
    expect(JSON.stringify(propertiesFacts)).not.toContain("method-secret");
    expect(javaCallers.relations.map((relation) => relation.symbol.id)).toEqual([javaConfig.id]);
    expect(kotlinCallers.relations.map((relation) => relation.symbol.id)).toEqual([kotlinConfig.id]);
    expect(javaReference).toMatchObject({
      kind: "references",
      resolution: "exact",
      confidence: 1,
      referenceName: "method.java.port",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.properties.direct-value.literal-key.exact-key",
        stage: "module",
        candidateSymbolIds: [javaPort.id],
        configurationPaths: ["config/application.properties"]
      })
    });
    expect(kotlinReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.75,
      referenceName: "method.kotlinMode",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.properties.direct-value.relaxed-key.unique-key",
        stage: "heuristic",
        candidateSymbolIds: [kotlinMode.id],
        configurationPaths: ["config/application.properties"]
      })
    });

    await writeFile(
      join(projectPath, "config", "application.properties"),
      "feature.enabled=true\n",
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const afterSync = graphStore.getSnapshot(projectPath);
    const javaAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === javaConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "method.java.port"
    );
    const kotlinAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === kotlinConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "method.kotlinMode"
    );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toEqual(
      expect.arrayContaining([
        "src/config/JavaMethodConfig.java",
        "src/config/KotlinMethodConfig.kt"
      ])
    );
    expect(javaAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({ stage: "unresolved", candidateSymbolIds: [] })
    });
    expect(kotlinAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({ stage: "unresolved", candidateSymbolIds: [] })
    });
  });

  it("projects direct Java and Kotlin Spring @Value method annotations through conservative configuration resolution", async () => {
    const projectPath = await createInlineProject({
      "config/application.properties": [
        "method.annotation.java-port=java-method-annotation-secret",
        "method.annotation.kotlin-mode=kotlin-method-annotation-secret"
      ].join("\n"),
      "src/config/JavaMethodAnnotationConfig.java": [
        "import org.springframework.beans.factory.annotation.Value;",
        "",
        "class JavaMethodAnnotationConfig {",
        '  @Value("${method.annotation.javaPort}")',
        "  void configure(String port) {}",
        "}"
      ].join("\n"),
      "src/config/KotlinMethodAnnotationConfig.kt": [
        "import org.springframework.beans.factory.annotation.Value",
        "",
        "class KotlinMethodAnnotationConfig {",
        '  @Value("\\${method.annotation.kotlinMode}")',
        "  fun configure(mode: String) {}",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const javaConfig = (
      await service.find(projectPath, "src/config/JavaMethodAnnotationConfig.java#JavaMethodAnnotationConfig")
    ).symbols[0];
    const kotlinConfig = (
      await service.find(projectPath, "src/config/KotlinMethodAnnotationConfig.kt#KotlinMethodAnnotationConfig")
    ).symbols[0];
    const javaPort = (
      await service.find(projectPath, "config/application.properties#properties-key:method.annotation.java-port")
    ).symbols[0];
    const kotlinMode = (
      await service.find(projectPath, "config/application.properties#properties-key:method.annotation.kotlin-mode")
    ).symbols[0];
    if (
      javaConfig === undefined ||
      kotlinConfig === undefined ||
      javaPort === undefined ||
      kotlinMode === undefined
    ) {
      throw new Error("Expected indexed Spring method annotation configuration symbols.");
    }

    const javaFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/JavaMethodAnnotationConfig.java");
    const kotlinFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/KotlinMethodAnnotationConfig.kt");
    const propertiesFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.properties");
    const snapshot = graphStore.getSnapshot(projectPath);
    const javaReference = snapshot.edges.find(
      (edge) => edge.sourceId === javaConfig.id && edge.targetId === javaPort.id
    );
    const kotlinReference = snapshot.edges.find(
      (edge) => edge.sourceId === kotlinConfig.id && edge.targetId === kotlinMode.id
    );
    const javaCallers = await service.callers(projectPath, javaPort.qualifiedName);
    const kotlinCallers = await service.callers(projectPath, kotlinMode.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: 9, edges: 8 }
    });
    expect(javaFacts?.springBootPropertiesFacts?.valueReferences).toEqual([
      expect.objectContaining({ sourceId: javaConfig.id, key: "method.annotation.javaPort" })
    ]);
    expect(kotlinFacts?.springBootPropertiesFacts?.valueReferences).toEqual([
      expect.objectContaining({ sourceId: kotlinConfig.id, key: "method.annotation.kotlinMode" })
    ]);
    expect(JSON.stringify(propertiesFacts)).not.toContain("method-annotation-secret");
    expect(javaCallers.relations.map((relation) => relation.symbol.id)).toEqual([javaConfig.id]);
    expect(kotlinCallers.relations.map((relation) => relation.symbol.id)).toEqual([kotlinConfig.id]);
    expect(javaReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.75,
      referenceName: "method.annotation.javaPort",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.properties.direct-value.relaxed-key.unique-key",
        stage: "heuristic",
        candidateSymbolIds: [javaPort.id],
        configurationPaths: ["config/application.properties"]
      })
    });
    expect(kotlinReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.75,
      referenceName: "method.annotation.kotlinMode",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.properties.direct-value.relaxed-key.unique-key",
        stage: "heuristic",
        candidateSymbolIds: [kotlinMode.id],
        configurationPaths: ["config/application.properties"]
      })
    });

    await writeFile(
      join(projectPath, "config", "application.properties"),
      "feature.enabled=true\n",
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const afterSync = graphStore.getSnapshot(projectPath);
    const javaAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === javaConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "method.annotation.javaPort"
    );
    const kotlinAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === kotlinConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "method.annotation.kotlinMode"
    );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toEqual(
      expect.arrayContaining([
        "src/config/JavaMethodAnnotationConfig.java",
        "src/config/KotlinMethodAnnotationConfig.kt"
      ])
    );
    expect(javaAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({ stage: "unresolved", candidateSymbolIds: [] })
    });
    expect(kotlinAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({ stage: "unresolved", candidateSymbolIds: [] })
    });
  });

  it("projects direct Kotlin object Spring @Value annotations through conservative configuration resolution", async () => {
    const projectPath = await createInlineProject({
      "config/application.properties": [
        "object.port=object-port-secret",
        "object-mode=object-mode-secret"
      ].join("\n"),
      "src/config/ObjectConfig.kt": [
        "import org.springframework.beans.factory.annotation.Value",
        "",
        "object ObjectConfig {",
        '  @Value("\\${object.port}")',
        "  lateinit var port: String",
        '  @Value("\\${objectMode}")',
        "  fun setMode(mode: String) {}",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const objectConfig = (
      await service.find(projectPath, "src/config/ObjectConfig.kt#ObjectConfig")
    ).symbols[0];
    const port = (
      await service.find(projectPath, "config/application.properties#properties-key:object.port")
    ).symbols[0];
    const mode = (
      await service.find(projectPath, "config/application.properties#properties-key:object-mode")
    ).symbols[0];
    if (objectConfig === undefined || port === undefined || mode === undefined) {
      throw new Error("Expected indexed Kotlin object configuration symbols.");
    }

    const objectFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/ObjectConfig.kt");
    const propertiesFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.properties");
    const snapshot = graphStore.getSnapshot(projectPath);
    const portReference = snapshot.edges.find(
      (edge) => edge.sourceId === objectConfig.id && edge.targetId === port.id
    );
    const modeReference = snapshot.edges.find(
      (edge) => edge.sourceId === objectConfig.id && edge.targetId === mode.id
    );
    const portCallers = await service.callers(projectPath, port.qualifiedName);
    const modeCallers = await service.callers(projectPath, mode.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: 6, edges: 6 }
    });
    expect(objectFacts?.springBootPropertiesFacts?.valueReferences).toEqual([
      expect.objectContaining({ sourceId: objectConfig.id, key: "object.port" }),
      expect.objectContaining({ sourceId: objectConfig.id, key: "objectMode" })
    ]);
    expect(JSON.stringify(propertiesFacts)).not.toContain("object-port-secret");
    expect(JSON.stringify(propertiesFacts)).not.toContain("object-mode-secret");
    expect(portCallers.relations.map((relation) => relation.symbol.id)).toEqual([objectConfig.id]);
    expect(modeCallers.relations.map((relation) => relation.symbol.id)).toEqual([objectConfig.id]);
    expect(portReference).toMatchObject({
      kind: "references",
      resolution: "exact",
      confidence: 1,
      referenceName: "object.port",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.properties.direct-value.literal-key.exact-key",
        stage: "module",
        candidateSymbolIds: [port.id],
        configurationPaths: ["config/application.properties"]
      })
    });
    expect(modeReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.75,
      referenceName: "objectMode",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.properties.direct-value.relaxed-key.unique-key",
        stage: "heuristic",
        candidateSymbolIds: [mode.id],
        configurationPaths: ["config/application.properties"]
      })
    });

    await writeFile(
      join(projectPath, "config", "application.properties"),
      "feature.enabled=true\n",
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const afterSync = graphStore.getSnapshot(projectPath);
    const portAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === objectConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "object.port"
    );
    const modeAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === objectConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "objectMode"
    );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toEqual(
      expect.arrayContaining(["src/config/ObjectConfig.kt"])
    );
    expect(portAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({ stage: "unresolved", candidateSymbolIds: [] })
    });
    expect(modeAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({ stage: "unresolved", candidateSymbolIds: [] })
    });
  });

  it("projects direct Java record component Spring @Value facts through conservative configuration resolution", async () => {
    const projectPath = await createInlineProject({
      "config/application.properties": [
        "record.port=record-port-secret",
        "record-mode=record-mode-secret"
      ].join("\n"),
      "src/config/RecordConfig.java": [
        "import org.springframework.beans.factory.annotation.Value;",
        "",
        "record RecordConfig(",
        '  @Value("${record.port}") String port,',
        '  @Value("${recordMode}") String mode',
        ") {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const recordConfig = (
      await service.find(projectPath, "src/config/RecordConfig.java#RecordConfig")
    ).symbols[0];
    const port = (
      await service.find(projectPath, "config/application.properties#properties-key:record.port")
    ).symbols[0];
    const mode = (
      await service.find(projectPath, "config/application.properties#properties-key:record-mode")
    ).symbols[0];
    if (recordConfig === undefined || port === undefined || mode === undefined) {
      throw new Error("Expected indexed Java record configuration symbols.");
    }

    const recordFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/RecordConfig.java");
    const propertiesFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.properties");
    const snapshot = graphStore.getSnapshot(projectPath);
    const portReference = snapshot.edges.find(
      (edge) => edge.sourceId === recordConfig.id && edge.targetId === port.id
    );
    const modeReference = snapshot.edges.find(
      (edge) => edge.sourceId === recordConfig.id && edge.targetId === mode.id
    );
    const portCallers = await service.callers(projectPath, port.qualifiedName);
    const modeCallers = await service.callers(projectPath, mode.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: 5, edges: 5 }
    });
    expect(recordFacts?.springBootPropertiesFacts?.valueReferences).toEqual([
      expect.objectContaining({ sourceId: recordConfig.id, key: "record.port" }),
      expect.objectContaining({ sourceId: recordConfig.id, key: "recordMode" })
    ]);
    expect(JSON.stringify(propertiesFacts)).not.toContain("record-port-secret");
    expect(JSON.stringify(propertiesFacts)).not.toContain("record-mode-secret");
    expect(portCallers.relations.map((relation) => relation.symbol.id)).toEqual([recordConfig.id]);
    expect(modeCallers.relations.map((relation) => relation.symbol.id)).toEqual([recordConfig.id]);
    expect(portReference).toMatchObject({
      kind: "references",
      resolution: "exact",
      confidence: 1,
      referenceName: "record.port",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.properties.direct-value.literal-key.exact-key",
        stage: "module",
        candidateSymbolIds: [port.id],
        configurationPaths: ["config/application.properties"]
      })
    });
    expect(modeReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.75,
      referenceName: "recordMode",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.properties.direct-value.relaxed-key.unique-key",
        stage: "heuristic",
        candidateSymbolIds: [mode.id],
        configurationPaths: ["config/application.properties"]
      })
    });

    await writeFile(
      join(projectPath, "config", "application.properties"),
      "feature.enabled=true\n",
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const afterSync = graphStore.getSnapshot(projectPath);
    const portAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === recordConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "record.port"
    );
    const modeAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === recordConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "recordMode"
    );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toEqual(
      expect.arrayContaining(["src/config/RecordConfig.java"])
    );
    expect(portAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({ stage: "unresolved", candidateSymbolIds: [] })
    });
    expect(modeAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({ stage: "unresolved", candidateSymbolIds: [] })
    });
  });

  it("projects direct Java record @ConfigurationProperties prefixes through conservative configuration resolution", async () => {
    const projectPath = await createInlineProject({
      "config/application.yml": ["app:", "  cache:", "    size: cache-secret"].join("\n"),
      "config/bootstrap.properties": "service.client.timeout=client-secret\n",
      "src/config/RecordConfigurationProperties.java": [
        "import org.springframework.boot.context.properties.ConfigurationProperties;",
        "",
        '@ConfigurationProperties(prefix = "app.cache")',
        "record CacheProperties(String size) {}",
        "",
        '@org.springframework.boot.context.properties.ConfigurationProperties("service.client")',
        "public record ClientProperties(String timeout) {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const cacheProperties = (
      await service.find(projectPath, "src/config/RecordConfigurationProperties.java#CacheProperties")
    ).symbols[0];
    const clientProperties = (
      await service.find(projectPath, "src/config/RecordConfigurationProperties.java#ClientProperties")
    ).symbols[0];
    const cacheSize = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:app.cache.size")
    ).symbols[0];
    const clientTimeout = (
      await service.find(projectPath, "config/bootstrap.properties#properties-key:service.client.timeout")
    ).symbols[0];
    if (
      cacheProperties === undefined ||
      clientProperties === undefined ||
      cacheSize === undefined ||
      clientTimeout === undefined
    ) {
      throw new Error("Expected indexed Java record ConfigurationProperties symbols.");
    }

    const recordFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/RecordConfigurationProperties.java");
    const yamlFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.yml");
    const propertiesFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/bootstrap.properties");
    const snapshot = graphStore.getSnapshot(projectPath);
    const cacheSizeReference = snapshot.edges.find(
      (edge) => edge.sourceId === cacheProperties.id && edge.targetId === cacheSize.id
    );
    const clientTimeoutReference = snapshot.edges.find(
      (edge) => edge.sourceId === clientProperties.id && edge.targetId === clientTimeout.id
    );
    const cacheSizeCallers = await service.callers(projectPath, cacheSize.qualifiedName);
    const clientTimeoutCallers = await service.callers(projectPath, clientTimeout.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: 7, edges: 6 }
    });
    expect(recordFacts?.springBootPropertiesFacts?.configurationPropertiesPrefixes).toEqual([
      expect.objectContaining({ sourceId: cacheProperties.id, prefix: "app.cache" }),
      expect.objectContaining({ sourceId: clientProperties.id, prefix: "service.client" })
    ]);
    expect(JSON.stringify(yamlFacts)).not.toContain("cache-secret");
    expect(JSON.stringify(propertiesFacts)).not.toContain("client-secret");
    expect(cacheSizeCallers.relations.map((relation) => relation.symbol.id)).toEqual([
      cacheProperties.id
    ]);
    expect(clientTimeoutCallers.relations.map((relation) => relation.symbol.id)).toEqual([
      clientProperties.id
    ]);
    expect(cacheSizeReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.85,
      referenceName: "app.cache:app.cache.size",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unique-leaf",
        stage: "heuristic",
        candidateSymbolIds: [cacheSize.id],
        configurationPaths: ["config/application.yml"]
      })
    });
    expect(clientTimeoutReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.85,
      referenceName: "service.client:service.client.timeout",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unique-leaf",
        stage: "heuristic",
        candidateSymbolIds: [clientTimeout.id],
        configurationPaths: ["config/bootstrap.properties"]
      })
    });

    await writeFile(
      join(projectPath, "config", "application.yml"),
      ["feature:", "  enabled: true"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(projectPath, "config", "bootstrap.properties"),
      "feature.enabled=false\n",
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const afterSync = graphStore.getSnapshot(projectPath);
    const cachePrefixAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === cacheProperties.id &&
        edge.kind === "references" &&
        edge.referenceName === "app.cache"
    );
    const clientPrefixAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === clientProperties.id &&
        edge.kind === "references" &&
        edge.referenceName === "service.client"
    );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toEqual(
      expect.arrayContaining(["src/config/RecordConfigurationProperties.java"])
    );
    expect(cachePrefixAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unresolved-prefix",
        stage: "unresolved",
        candidateSymbolIds: []
      })
    });
    expect(clientPrefixAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unresolved-prefix",
        stage: "unresolved",
        candidateSymbolIds: []
      })
    });
  });

  it("projects direct Java @Bean method @ConfigurationProperties prefixes through conservative configuration resolution", async () => {
    const projectPath = await createInlineProject({
      "config/application.yml": ["app:", "  cache:", "    size: cache-secret"].join("\n"),
      "config/bootstrap.properties": "service.client.timeout=client-secret\n",
      "src/config/BeanConfiguration.java": [
        "import org.springframework.boot.context.properties.ConfigurationProperties;",
        "import org.springframework.context.annotation.Bean;",
        "import org.springframework.context.annotation.Configuration;",
        "",
        "@Configuration",
        "class BeanConfiguration {",
        "  @Bean",
        '  @ConfigurationProperties(prefix = "app.cache")',
        "  CacheProperties cacheProperties() { return new CacheProperties(); }",
        "",
        "  @Bean",
        '@org.springframework.boot.context.properties.ConfigurationProperties("service.client")',
        "  ClientProperties clientProperties() { return new ClientProperties(); }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const cacheProperties = (
      await service.find(projectPath, "src/config/BeanConfiguration.java#BeanConfiguration.cacheProperties")
    ).symbols[0];
    const clientProperties = (
      await service.find(projectPath, "src/config/BeanConfiguration.java#BeanConfiguration.clientProperties")
    ).symbols[0];
    const cacheSize = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:app.cache.size")
    ).symbols[0];
    const clientTimeout = (
      await service.find(projectPath, "config/bootstrap.properties#properties-key:service.client.timeout")
    ).symbols[0];
    if (
      cacheProperties === undefined ||
      clientProperties === undefined ||
      cacheSize === undefined ||
      clientTimeout === undefined
    ) {
      throw new Error("Expected indexed Java factory ConfigurationProperties symbols.");
    }

    const factoryFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/BeanConfiguration.java");
    const yamlFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.yml");
    const propertiesFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/bootstrap.properties");
    const snapshot = graphStore.getSnapshot(projectPath);
    const cacheSizeReference = snapshot.edges.find(
      (edge) => edge.sourceId === cacheProperties.id && edge.targetId === cacheSize.id
    );
    const clientTimeoutReference = snapshot.edges.find(
      (edge) => edge.sourceId === clientProperties.id && edge.targetId === clientTimeout.id
    );
    const cacheSizeCallers = await service.callers(projectPath, cacheSize.qualifiedName);
    const clientTimeoutCallers = await service.callers(projectPath, clientTimeout.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: 8, edges: 7 }
    });
    expect(factoryFacts?.springBootPropertiesFacts?.configurationPropertiesPrefixes).toEqual([
      expect.objectContaining({ sourceId: cacheProperties.id, prefix: "app.cache" }),
      expect.objectContaining({ sourceId: clientProperties.id, prefix: "service.client" })
    ]);
    expect(JSON.stringify(yamlFacts)).not.toContain("cache-secret");
    expect(JSON.stringify(propertiesFacts)).not.toContain("client-secret");
    expect(cacheSizeCallers.relations.map((relation) => relation.symbol.id)).toEqual([
      cacheProperties.id
    ]);
    expect(clientTimeoutCallers.relations.map((relation) => relation.symbol.id)).toEqual([
      clientProperties.id
    ]);
    expect(cacheSizeReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.85,
      referenceName: "app.cache:app.cache.size",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unique-leaf",
        stage: "heuristic",
        candidateSymbolIds: [cacheSize.id],
        configurationPaths: ["config/application.yml"]
      })
    });
    expect(clientTimeoutReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.85,
      referenceName: "service.client:service.client.timeout",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unique-leaf",
        stage: "heuristic",
        candidateSymbolIds: [clientTimeout.id],
        configurationPaths: ["config/bootstrap.properties"]
      })
    });

    await writeFile(
      join(projectPath, "config", "application.yml"),
      ["feature:", "  enabled: true"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(projectPath, "config", "bootstrap.properties"),
      "feature.enabled=false\n",
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const afterSync = graphStore.getSnapshot(projectPath);
    const cachePrefixAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === cacheProperties.id &&
        edge.kind === "references" &&
        edge.referenceName === "app.cache"
    );
    const clientPrefixAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === clientProperties.id &&
        edge.kind === "references" &&
        edge.referenceName === "service.client"
    );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toEqual(
      expect.arrayContaining(["src/config/BeanConfiguration.java"])
    );
    expect(cachePrefixAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unresolved-prefix",
        stage: "unresolved",
        candidateSymbolIds: []
      })
    });
    expect(clientPrefixAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unresolved-prefix",
        stage: "unresolved",
        candidateSymbolIds: []
      })
    });
  });

  it("projects direct Kotlin @Bean method @ConfigurationProperties prefixes through conservative configuration resolution", async () => {
    const projectPath = await createInlineProject({
      "config/application.yml": ["app:", "  cache:", "    size: cache-secret"].join("\n"),
      "config/bootstrap.properties": "service.client.timeout=client-secret\n",
      "src/config/BeanConfiguration.kt": [
        "import org.springframework.boot.context.properties.ConfigurationProperties",
        "import org.springframework.context.annotation.Bean",
        "import org.springframework.context.annotation.Configuration",
        "",
        "@Configuration",
        "class BeanConfiguration {",
        "  @Bean",
        '  @ConfigurationProperties(prefix = "app.cache")',
        "  fun cacheProperties(): CacheProperties = CacheProperties()",
        "",
        "  @Bean",
        '@org.springframework.boot.context.properties.ConfigurationProperties("service.client")',
        "  fun clientProperties(): ClientProperties = ClientProperties()",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const cacheProperties = (
      await service.find(projectPath, "src/config/BeanConfiguration.kt#BeanConfiguration.cacheProperties")
    ).symbols[0];
    const clientProperties = (
      await service.find(projectPath, "src/config/BeanConfiguration.kt#BeanConfiguration.clientProperties")
    ).symbols[0];
    const cacheSize = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:app.cache.size")
    ).symbols[0];
    const clientTimeout = (
      await service.find(projectPath, "config/bootstrap.properties#properties-key:service.client.timeout")
    ).symbols[0];
    if (
      cacheProperties === undefined ||
      clientProperties === undefined ||
      cacheSize === undefined ||
      clientTimeout === undefined
    ) {
      throw new Error("Expected indexed Kotlin factory ConfigurationProperties symbols.");
    }

    const factoryFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/BeanConfiguration.kt");
    const yamlFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.yml");
    const propertiesFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/bootstrap.properties");
    const snapshot = graphStore.getSnapshot(projectPath);
    const cacheSizeReference = snapshot.edges.find(
      (edge) => edge.sourceId === cacheProperties.id && edge.targetId === cacheSize.id
    );
    const clientTimeoutReference = snapshot.edges.find(
      (edge) => edge.sourceId === clientProperties.id && edge.targetId === clientTimeout.id
    );
    const cacheSizeCallers = await service.callers(projectPath, cacheSize.qualifiedName);
    const clientTimeoutCallers = await service.callers(projectPath, clientTimeout.qualifiedName);

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: 8, edges: 7 }
    });
    expect(factoryFacts?.springBootPropertiesFacts?.configurationPropertiesPrefixes).toEqual([
      expect.objectContaining({ sourceId: cacheProperties.id, prefix: "app.cache" }),
      expect.objectContaining({ sourceId: clientProperties.id, prefix: "service.client" })
    ]);
    expect(JSON.stringify(yamlFacts)).not.toContain("cache-secret");
    expect(JSON.stringify(propertiesFacts)).not.toContain("client-secret");
    expect(cacheSizeCallers.relations.map((relation) => relation.symbol.id)).toEqual([
      cacheProperties.id
    ]);
    expect(clientTimeoutCallers.relations.map((relation) => relation.symbol.id)).toEqual([
      clientProperties.id
    ]);
    expect(cacheSizeReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.85,
      referenceName: "app.cache:app.cache.size",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unique-leaf",
        stage: "heuristic",
        candidateSymbolIds: [cacheSize.id],
        configurationPaths: ["config/application.yml"]
      })
    });
    expect(clientTimeoutReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.85,
      referenceName: "service.client:service.client.timeout",
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unique-leaf",
        stage: "heuristic",
        candidateSymbolIds: [clientTimeout.id],
        configurationPaths: ["config/bootstrap.properties"]
      })
    });

    await writeFile(
      join(projectPath, "config", "application.yml"),
      ["feature:", "  enabled: true"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(projectPath, "config", "bootstrap.properties"),
      "feature.enabled=false\n",
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const afterSync = graphStore.getSnapshot(projectPath);
    const cachePrefixAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === cacheProperties.id &&
        edge.kind === "references" &&
        edge.referenceName === "app.cache"
    );
    const clientPrefixAfterSync = afterSync.edges.find(
      (edge) =>
        edge.sourceId === clientProperties.id &&
        edge.kind === "references" &&
        edge.referenceName === "service.client"
    );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toEqual(
      expect.arrayContaining(["src/config/BeanConfiguration.kt"])
    );
    expect(cachePrefixAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unresolved-prefix",
        stage: "unresolved",
        candidateSymbolIds: []
      })
    });
    expect(clientPrefixAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unresolved-prefix",
        stage: "unresolved",
        candidateSymbolIds: []
      })
    });
  });

  it("projects conservative Java @ConfigurationProperties prefixes to unique Spring Boot configuration leaves", async () => {
    const projectPath = await createInlineProject({
      "config/application.yml": [
        "app:",
        "  cache:",
        "    size: cache-secret",
        "    ttl: 30"
      ].join("\n"),
      "config/application-dev.yaml": ["app:", "  cache:", "    ttl: 15"].join("\n"),
      "config/bootstrap.properties": "service.client.timeout=100\n",
      "src/config/ConfigurationProperties.java": [
        "import org.springframework.boot.context.properties.ConfigurationProperties;",
        "",
        '@ConfigurationProperties(prefix = "app.cache")',
        "class CacheProperties {}",
        "",
        '@ConfigurationProperties("service.client")',
        "class ClientProperties {}",
        "",
        '@ConfigurationProperties(prefix = "missing.prefix")',
        "class MissingProperties {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const cacheProperties = (
      await service.find(projectPath, "src/config/ConfigurationProperties.java#CacheProperties")
    ).symbols[0];
    const clientProperties = (
      await service.find(projectPath, "src/config/ConfigurationProperties.java#ClientProperties")
    ).symbols[0];
    const missingProperties = (
      await service.find(projectPath, "src/config/ConfigurationProperties.java#MissingProperties")
    ).symbols[0];
    const cacheSize = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:app.cache.size")
    ).symbols[0];
    const applicationTtl = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:app.cache.ttl")
    ).symbols[0];
    const developmentTtl = (
      await service.find(projectPath, "config/application-dev.yaml#spring-boot-yaml-key:app.cache.ttl")
    ).symbols[0];
    const clientTimeout = (
      await service.find(projectPath, "config/bootstrap.properties#properties-key:service.client.timeout")
    ).symbols[0];
    if (
      cacheProperties === undefined ||
      clientProperties === undefined ||
      missingProperties === undefined ||
      cacheSize === undefined ||
      applicationTtl === undefined ||
      developmentTtl === undefined ||
      clientTimeout === undefined
    ) {
      throw new Error("Expected indexed ConfigurationProperties symbols.");
    }

    const cacheSizeCallers = await service.callers(projectPath, cacheSize.qualifiedName);
    const cacheCallees = await service.callees(projectPath, cacheProperties.qualifiedName);
    const javaFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/ConfigurationProperties.java");
    const yamlFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.yml");
    const snapshot = graphStore.getSnapshot(projectPath);
    const cacheSizeReference = snapshot.edges.find(
      (edge) => edge.sourceId === cacheProperties.id && edge.targetId === cacheSize.id
    );
    const clientTimeoutReference = snapshot.edges.find(
      (edge) => edge.sourceId === clientProperties.id && edge.targetId === clientTimeout.id
    );
    const ambiguousTtlReference = snapshot.edges.find(
      (edge) =>
        edge.sourceId === cacheProperties.id &&
        edge.kind === "references" &&
        edge.referenceName === "app.cache:app.cache.ttl"
    );
    const missingPrefixReference = snapshot.edges.find(
      (edge) =>
        edge.sourceId === missingProperties.id &&
        edge.kind === "references" &&
        edge.referenceName === "missing.prefix"
    );

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 4, symbols: 11, edges: 11 }
    });
    expect(javaFacts?.springBootPropertiesFacts).toMatchObject({
      configurationPropertiesPrefixes: [
        { sourceId: cacheProperties.id, prefix: "app.cache" },
        { sourceId: clientProperties.id, prefix: "service.client" },
        { sourceId: missingProperties.id, prefix: "missing.prefix" }
      ]
    });
    expect(JSON.stringify(yamlFacts)).not.toContain("cache-secret");
    expect(cacheSizeCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({ id: cacheProperties.id }),
        edge: expect.objectContaining({
          kind: "references",
          resolution: "heuristic",
          confidence: 0.85,
          referenceName: "app.cache:app.cache.size",
          evidence: expect.objectContaining({
            ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unique-leaf",
            stage: "heuristic",
            candidateSymbolIds: [cacheSize.id],
            configurationPaths: ["config/application.yml"]
          })
        })
      })
    ]);
    expect(cacheCallees.relations.map((relation) => relation.symbol.id)).toEqual([cacheSize.id]);
    expect(cacheSizeReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.85,
      referenceName: "app.cache:app.cache.size"
    });
    expect(clientTimeoutReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.85,
      referenceName: "service.client:service.client.timeout",
      evidence: expect.objectContaining({
        configurationPaths: ["config/bootstrap.properties"]
      })
    });
    expect(ambiguousTtlReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.ambiguous-leaf",
        stage: "unresolved",
        candidateSymbolIds: expect.arrayContaining([applicationTtl.id, developmentTtl.id]),
        configurationPaths: expect.arrayContaining([
          "config/application.yml",
          "config/application-dev.yaml"
        ])
      }
    });
    expect(missingPrefixReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unresolved-prefix",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });

    await writeFile(
      join(projectPath, "config", "application.yml"),
      ["feature:", "  enabled: true"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(projectPath, "config", "application-dev.yaml"),
      ["feature:", "  enabled: false"].join("\n"),
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const cachePrefixAfterSync = graphStore
      .getSnapshot(projectPath)
      .edges.find(
        (edge) =>
          edge.sourceId === cacheProperties.id &&
          edge.kind === "references" &&
          edge.referenceName === "app.cache"
      );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toContain(
      "src/config/ConfigurationProperties.java"
    );
    expect(cachePrefixAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unresolved-prefix",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });
  });

  it("projects conservative Kotlin @ConfigurationProperties prefixes to unique Spring Boot configuration leaves", async () => {
    const projectPath = await createInlineProject({
      "config/application.yml": [
        "app:",
        "  cache:",
        "    size: kotlin-cache-secret",
        "    ttl: 30"
      ].join("\n"),
      "config/application-dev.yaml": ["app:", "  cache:", "    ttl: 15"].join("\n"),
      "config/bootstrap.properties": "service.client.timeout=100\n",
      "src/config/KotlinConfigurationProperties.kt": [
        "import org.springframework.boot.context.properties.ConfigurationProperties",
        "",
        '@ConfigurationProperties(prefix = "app.cache")',
        "class CacheProperties {}",
        "",
        '@ConfigurationProperties("service.client")',
        "class ClientProperties {}",
        "",
        '@ConfigurationProperties(prefix = "missing.prefix")',
        "class MissingProperties {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const cacheProperties = (
      await service.find(projectPath, "src/config/KotlinConfigurationProperties.kt#CacheProperties")
    ).symbols[0];
    const clientProperties = (
      await service.find(projectPath, "src/config/KotlinConfigurationProperties.kt#ClientProperties")
    ).symbols[0];
    const missingProperties = (
      await service.find(projectPath, "src/config/KotlinConfigurationProperties.kt#MissingProperties")
    ).symbols[0];
    const cacheSize = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:app.cache.size")
    ).symbols[0];
    const applicationTtl = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:app.cache.ttl")
    ).symbols[0];
    const developmentTtl = (
      await service.find(projectPath, "config/application-dev.yaml#spring-boot-yaml-key:app.cache.ttl")
    ).symbols[0];
    const clientTimeout = (
      await service.find(projectPath, "config/bootstrap.properties#properties-key:service.client.timeout")
    ).symbols[0];
    if (
      cacheProperties === undefined ||
      clientProperties === undefined ||
      missingProperties === undefined ||
      cacheSize === undefined ||
      applicationTtl === undefined ||
      developmentTtl === undefined ||
      clientTimeout === undefined
    ) {
      throw new Error("Expected indexed Kotlin ConfigurationProperties symbols.");
    }

    const cacheSizeCallers = await service.callers(projectPath, cacheSize.qualifiedName);
    const cacheCallees = await service.callees(projectPath, cacheProperties.qualifiedName);
    const kotlinFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/KotlinConfigurationProperties.kt");
    const yamlFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.yml");
    const snapshot = graphStore.getSnapshot(projectPath);
    const cacheSizeReference = snapshot.edges.find(
      (edge) => edge.sourceId === cacheProperties.id && edge.targetId === cacheSize.id
    );
    const clientTimeoutReference = snapshot.edges.find(
      (edge) => edge.sourceId === clientProperties.id && edge.targetId === clientTimeout.id
    );
    const ambiguousTtlReference = snapshot.edges.find(
      (edge) =>
        edge.sourceId === cacheProperties.id &&
        edge.kind === "references" &&
        edge.referenceName === "app.cache:app.cache.ttl"
    );
    const missingPrefixReference = snapshot.edges.find(
      (edge) =>
        edge.sourceId === missingProperties.id &&
        edge.kind === "references" &&
        edge.referenceName === "missing.prefix"
    );

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 4, symbols: 11, edges: 11 }
    });
    expect(kotlinFacts?.springBootPropertiesFacts).toMatchObject({
      configurationPropertiesPrefixes: [
        { sourceId: cacheProperties.id, prefix: "app.cache" },
        { sourceId: clientProperties.id, prefix: "service.client" },
        { sourceId: missingProperties.id, prefix: "missing.prefix" }
      ]
    });
    expect(JSON.stringify(yamlFacts)).not.toContain("kotlin-cache-secret");
    expect(cacheSizeCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({ id: cacheProperties.id }),
        edge: expect.objectContaining({
          kind: "references",
          resolution: "heuristic",
          confidence: 0.85,
          referenceName: "app.cache:app.cache.size",
          evidence: expect.objectContaining({
            ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unique-leaf",
            stage: "heuristic",
            candidateSymbolIds: [cacheSize.id],
            configurationPaths: ["config/application.yml"]
          })
        })
      })
    ]);
    expect(cacheCallees.relations.map((relation) => relation.symbol.id)).toEqual([cacheSize.id]);
    expect(cacheSizeReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.85,
      referenceName: "app.cache:app.cache.size"
    });
    expect(clientTimeoutReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.85,
      referenceName: "service.client:service.client.timeout",
      evidence: expect.objectContaining({
        configurationPaths: ["config/bootstrap.properties"]
      })
    });
    expect(ambiguousTtlReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.ambiguous-leaf",
        stage: "unresolved",
        candidateSymbolIds: expect.arrayContaining([applicationTtl.id, developmentTtl.id]),
        configurationPaths: expect.arrayContaining([
          "config/application.yml",
          "config/application-dev.yaml"
        ])
      }
    });
    expect(missingPrefixReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unresolved-prefix",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });

    await writeFile(
      join(projectPath, "config", "application.yml"),
      ["feature:", "  enabled: true"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(projectPath, "config", "application-dev.yaml"),
      ["feature:", "  enabled: false"].join("\n"),
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const cachePrefixAfterSync = graphStore
      .getSnapshot(projectPath)
      .edges.find(
        (edge) =>
          edge.sourceId === cacheProperties.id &&
          edge.kind === "references" &&
          edge.referenceName === "app.cache"
      );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toContain(
      "src/config/KotlinConfigurationProperties.kt"
    );
    expect(cachePrefixAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unresolved-prefix",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });
  });

  it("projects conservative Spring relaxed-key fallbacks without selecting canonical collisions", async () => {
    const projectPath = await createInlineProject({
      "config/application.yml": [
        "app:",
        "  cache-settings:",
        "    max-size: relaxed-secret",
        "    shared-mode: yaml"
      ].join("\n"),
      "config/application.properties": [
        "service.client-timeout=5000",
        "client.request-timeout=1000",
        "client.request_timeout=2000",
        "app.cache_settings.shared_mode=properties"
      ].join("\n"),
      "src/config/RelaxedConfig.java": [
        "import org.springframework.beans.factory.annotation.Value;",
        "import org.springframework.boot.context.properties.ConfigurationProperties;",
        "",
        "class RelaxedValueConfig {",
        '  @Value("${service.clientTimeout}")',
        "  private String timeout;",
        '  @Value("${client.requestTimeout}")',
        "  private String requestTimeout;",
        "}",
        "",
        '@ConfigurationProperties("app.cacheSettings")',
        "class RelaxedPrefixConfig {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const valueConfig = (
      await service.find(projectPath, "src/config/RelaxedConfig.java#RelaxedValueConfig")
    ).symbols[0];
    const prefixConfig = (
      await service.find(projectPath, "src/config/RelaxedConfig.java#RelaxedPrefixConfig")
    ).symbols[0];
    const clientTimeout = (
      await service.find(projectPath, "config/application.properties#properties-key:service.client-timeout")
    ).symbols[0];
    const requestTimeoutDash = (
      await service.find(projectPath, "config/application.properties#properties-key:client.request-timeout")
    ).symbols[0];
    const requestTimeoutUnderscore = (
      await service.find(projectPath, "config/application.properties#properties-key:client.request_timeout")
    ).symbols[0];
    const maxSize = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:app.cache-settings.max-size")
    ).symbols[0];
    const yamlSharedMode = (
      await service.find(projectPath, "config/application.yml#spring-boot-yaml-key:app.cache-settings.shared-mode")
    ).symbols[0];
    const propertiesSharedMode = (
      await service.find(projectPath, "config/application.properties#properties-key:app.cache_settings.shared_mode")
    ).symbols[0];
    if (
      valueConfig === undefined ||
      prefixConfig === undefined ||
      clientTimeout === undefined ||
      requestTimeoutDash === undefined ||
      requestTimeoutUnderscore === undefined ||
      maxSize === undefined ||
      yamlSharedMode === undefined ||
      propertiesSharedMode === undefined
    ) {
      throw new Error("Expected indexed relaxed Spring configuration symbols.");
    }

    const timeoutCallers = await service.callers(projectPath, clientTimeout.qualifiedName);
    const prefixCallees = await service.callees(projectPath, prefixConfig.qualifiedName);
    const javaFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/config/RelaxedConfig.java");
    const yamlFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "config/application.yml");
    const snapshot = graphStore.getSnapshot(projectPath);
    const timeoutReference = snapshot.edges.find(
      (edge) => edge.sourceId === valueConfig.id && edge.targetId === clientTimeout.id
    );
    const requestTimeoutReference = snapshot.edges.find(
      (edge) =>
        edge.sourceId === valueConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "client.requestTimeout"
    );
    const maxSizeReference = snapshot.edges.find(
      (edge) => edge.sourceId === prefixConfig.id && edge.targetId === maxSize.id
    );
    const sharedModeReference = snapshot.edges.find(
      (edge) =>
        edge.sourceId === prefixConfig.id &&
        edge.kind === "references" &&
        edge.referenceName === "app.cacheSettings:relaxed:app.cachesettings.sharedmode"
    );

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 3, symbols: 11, edges: 12 }
    });
    expect(javaFacts?.springBootPropertiesFacts).toMatchObject({
      valueReferences: [
        { sourceId: valueConfig.id, key: "service.clientTimeout" },
        { sourceId: valueConfig.id, key: "client.requestTimeout" }
      ],
      configurationPropertiesPrefixes: [{ sourceId: prefixConfig.id, prefix: "app.cacheSettings" }]
    });
    expect(JSON.stringify(yamlFacts)).not.toContain("relaxed-secret");
    expect(timeoutCallers.relations).toEqual([
      expect.objectContaining({
        symbol: expect.objectContaining({ id: valueConfig.id }),
        edge: expect.objectContaining({
          kind: "references",
          resolution: "heuristic",
          confidence: 0.75,
          referenceName: "service.clientTimeout",
          evidence: expect.objectContaining({
            ruleId: "framework.spring-boot.properties.direct-value.relaxed-key.unique-key",
            stage: "heuristic",
            candidateSymbolIds: [clientTimeout.id],
            configurationPaths: ["config/application.properties"]
          })
        })
      })
    ]);
    expect(prefixCallees.relations.map((relation) => relation.symbol.id)).toEqual([maxSize.id]);
    expect(timeoutReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.75,
      referenceName: "service.clientTimeout"
    });
    expect(requestTimeoutReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.properties.direct-value.relaxed-key.ambiguous-key",
        stage: "unresolved",
        candidateSymbolIds: expect.arrayContaining([requestTimeoutDash.id, requestTimeoutUnderscore.id]),
        configurationPaths: ["config/application.properties"]
      }
    });
    expect(maxSizeReference).toMatchObject({
      kind: "references",
      resolution: "heuristic",
      confidence: 0.75,
      referenceName: "app.cacheSettings:relaxed:app.cachesettings.maxsize",
      evidence: {
        ruleId: "framework.spring-boot.configuration-properties.relaxed-prefix.unique-leaf",
        stage: "heuristic",
        candidateSymbolIds: [maxSize.id],
        configurationPaths: ["config/application.yml"]
      }
    });
    expect(sharedModeReference).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.configuration-properties.relaxed-prefix.ambiguous-leaf",
        stage: "unresolved",
        candidateSymbolIds: expect.arrayContaining([yamlSharedMode.id, propertiesSharedMode.id]),
        configurationPaths: expect.arrayContaining([
          "config/application.yml",
          "config/application.properties"
        ])
      }
    });

    await writeFile(
      join(projectPath, "config", "application.yml"),
      ["feature:", "  enabled: true"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(projectPath, "config", "application.properties"),
      ["service.client-timeout=5000", "client.request-timeout=1000", "client.request_timeout=2000"].join(
        "\n"
      ),
      "utf8"
    );
    const synced = await service.sync({ projectPath });
    const prefixAfterSync = graphStore
      .getSnapshot(projectPath)
      .edges.find(
        (edge) =>
          edge.sourceId === prefixConfig.id &&
          edge.kind === "references" &&
          edge.referenceName === "app.cacheSettings"
      );

    expect(synced.lastIndexWork?.reusedArtifactFiles).toContain("src/config/RelaxedConfig.java");
    expect(prefixAfterSync).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.spring-boot.configuration-properties.literal-prefix.unresolved-prefix",
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

  it("indexes direct GraphQL schema declarations with persisted source search", async () => {
    const projectPath = await createInlineProject({
      "api/schema.graphql": [
        "type Query {",
        "  user: User",
        "}",
        "",
        "type User {",
        "  id: ID!",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "User", { language: "graphql" });
    const user = await service.find(projectPath, "api/schema.graphql#type:User");
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/schema.graphql");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 3, edges: 2 }
    });
    expect(persistedFacts).toMatchObject({
      language: "graphql",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(user.symbols).toMatchObject([
      {
        kind: "class",
        qualifiedName: "api/schema.graphql#type:User",
        isExported: true
      }
    ]);
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "api/schema.graphql", language: "graphql" }
    ]);
  });

  it("indexes direct Protocol Buffers declarations with persisted source search", async () => {
    const projectPath = await createInlineProject({
      "api/directory.proto": [
        'syntax = "proto3";',
        "message User { string id = 1; }",
        "service Directory {",
        "  rpc GetUser(GetUserRequest) returns (GetUserResponse);",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "Directory", { language: "proto" });
    const directory = await service.find(projectPath, "api/directory.proto#service:Directory");
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "api/directory.proto");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 4, edges: 3 }
    });
    expect(persistedFacts).toMatchObject({
      language: "proto",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(directory.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "interface",
          qualifiedName: "api/directory.proto#service:Directory",
          isExported: true
        })
      ])
    );
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "api/directory.proto", language: "proto" }
    ]);
  });

  it("indexes direct Groovy declarations with persisted source search", async () => {
    const projectPath = await createInlineProject({
      "src/catalog.groovy": [
        "class Catalog {}",
        "trait Auditable {}",
        "def greet(String name) { name }"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "Catalog", { language: "groovy" });
    const auditable = await service.find(projectPath, "src/catalog.groovy#trait:Auditable");
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/catalog.groovy");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 4, edges: 3 }
    });
    expect(persistedFacts).toMatchObject({
      language: "groovy",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(auditable.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "interface",
          qualifiedName: "src/catalog.groovy#trait:Auditable",
          isExported: true
        })
      ])
    );
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "src/catalog.groovy", language: "groovy" }
    ]);
  });

  it("indexes direct Fortran program units with persisted source search", async () => {
    const projectPath = await createInlineProject({
      "src/numeric.f90": [
        "module NumericOps",
        "contains",
        "  subroutine hidden()",
        "  end subroutine hidden",
        "end module NumericOps",
        "subroutine solve()",
        "end subroutine solve"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "NumericOps", { language: "fortran" });
    const solve = await service.find(projectPath, "src/numeric.f90#subroutine:solve");
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/numeric.f90");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 1, symbols: 3, edges: 2 }
    });
    expect(persistedFacts).toMatchObject({
      language: "fortran",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
    });
    expect(solve.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "function",
          qualifiedName: "src/numeric.f90#subroutine:solve",
          isExported: true
        })
      ])
    );
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "src/numeric.f90", language: "fortran" }
    ]);
  });

  it("indexes direct Ada library units with persisted source search", async () => {
    const projectPath = await createInlineProject({
      "src/directory.ads": [
        "package Directory is",
        "  procedure Hidden;",
        "end Directory;"
      ].join("\n"),
      "src/main.adb": [
        "procedure Main is",
        "begin",
        "  null;",
        "end Main;"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const routes = await service.routes(projectPath);
    const search = await service.search(projectPath, "Directory", { language: "ada" });
    const main = await service.find(projectPath, "src/main.adb#procedure:Main");
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .filter((facts) => facts.language === "ada");

    expect(indexed).toMatchObject({
      stale: false,
      counts: { files: 2, symbols: 4, edges: 2 }
    });
    expect(persistedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/directory.ads",
          language: "ada",
          extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
        }),
        expect.objectContaining({
          filePath: "src/main.adb",
          language: "ada",
          extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
        })
      ])
    );
    expect(main.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "function",
          qualifiedName: "src/main.adb#procedure:Main",
          isExported: true
        })
      ])
    );
    expect(routes.routes).toEqual([]);
    expect(search.results).toMatchObject([
      { filePath: "src/directory.ads", language: "ada" }
    ]);
  });

  it("projects a direct NestJS GraphQL resolver to one unique schema object type as heuristic evidence", async () => {
    const projectPath = await createInlineProject({
      "api/schema.graphql": [
        "type User {",
        "  id: ID!",
        "}"
      ].join("\n"),
      "src/users.resolver.ts": [
        'import { Resolver as GraphResolver } from "@nestjs/graphql";',
        "@GraphResolver(() => User)",
        "export class UsersResolver {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const resolver = snapshot.symbols.find(
      (symbol) =>
        symbol.filePath === "src/users.resolver.ts" &&
        symbol.kind === "class" &&
        symbol.name === "UsersResolver"
    );
    const schemaType = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "api/schema.graphql#type:User"
    );
    if (resolver === undefined || schemaType === undefined) {
      throw new Error("Expected indexed resolver and GraphQL object type.");
    }
    const edge = snapshot.edges.find(
      (candidate) => candidate.sourceId === resolver.id && candidate.kind === "references"
    );
    const persistedFacts = graphStore
      .getArtifactFacts(projectPath)
      .find((facts) => facts.filePath === "src/users.resolver.ts");

    expect(edge).toMatchObject({
      targetId: schemaType.id,
      kind: "references",
      resolution: "heuristic",
      confidence: 0.85,
      referenceName: "User",
      evidence: {
        ruleId: "framework.nestjs.graphql.resolver-schema.unique-object-type",
        stage: "heuristic",
        candidateSymbolIds: [schemaType.id]
      }
    });
    expect(persistedFacts).toMatchObject({
      language: "typescript",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      nestGraphqlFacts: {
        resolverReferences: [
          {
            resolverId: resolver.id,
            schemaTypeName: "User"
          }
        ]
      }
    });
  });

  it("keeps an ambiguous NestJS GraphQL resolver schema match explicitly unresolved", async () => {
    const projectPath = await createInlineProject({
      "api/one.graphql": "type User { id: ID! }\n",
      "api/two.graphql": "type User { email: String! }\n",
      "src/users.resolver.ts": [
        'import { Resolver } from "@nestjs/graphql";',
        "@Resolver(() => User)",
        "export class UsersResolver {}",
        "@Resolver(() => Missing)",
        "export class MissingResolver {}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const resolver = snapshot.symbols.find(
      (symbol) =>
        symbol.filePath === "src/users.resolver.ts" &&
        symbol.kind === "class" &&
        symbol.name === "UsersResolver"
    );
    const missingResolver = snapshot.symbols.find(
      (symbol) =>
        symbol.filePath === "src/users.resolver.ts" &&
        symbol.kind === "class" &&
        symbol.name === "MissingResolver"
    );
    const candidates = snapshot.symbols
      .filter((symbol) => symbol.name === "User" && symbol.filePath.startsWith("api/"))
      .map((symbol) => symbol.id)
      .sort();
    if (resolver === undefined || missingResolver === undefined) {
      throw new Error("Expected indexed NestJS resolver classes.");
    }
    const edge = snapshot.edges.find(
      (candidate) => candidate.sourceId === resolver.id && candidate.kind === "references"
    );
    const missingEdge = snapshot.edges.find(
      (candidate) => candidate.sourceId === missingResolver.id && candidate.kind === "references"
    );

    expect(edge).toMatchObject({
      targetId: null,
      kind: "references",
      resolution: "unresolved",
      confidence: 0,
      referenceName: "User",
      evidence: {
        ruleId: "framework.nestjs.graphql.resolver-schema.ambiguous-object-type",
        stage: "unresolved",
        candidateSymbolIds: candidates
      }
    });
    expect(missingEdge).toMatchObject({
      targetId: null,
      kind: "references",
      resolution: "unresolved",
      confidence: 0,
      referenceName: "Missing",
      evidence: {
        ruleId: "framework.nestjs.graphql.resolver-schema.unresolved-object-type",
        stage: "unresolved",
        candidateSymbolIds: []
      }
    });
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

  it("lists bounded persisted file inventory without admitting files added after the generation", async () => {
    const projectPath = await createInlineProject({
      "src/api.ts": [
        'import { makeToken } from "./token.js";',
        "export function getToken(): string {",
        "  return makeToken();",
        "}"
      ].join("\n"),
      "src/token.ts": 'export function makeToken(): string { return "token"; }',
      "src2/not-under-src.py": "def unrelated():\n    return 2\n",
      "scripts/task.py": "def run():\n    return 1\n"
    });
    const service = createService();
    const indexed = await service.init({ projectPath });

    const files = await service.files(projectPath, {
      pathPrefix: "src\\",
      language: "typescript"
    });

    expect(files).toMatchObject({
      status: { stale: false, generationId: indexed.generationId },
      bounds: { limit: DEFAULT_FILE_LIMIT, maximumLimit: MAX_FILE_LIMIT },
      files: [
        {
          filePath: "src/api.ts",
          language: "typescript",
          declarationCount: 1,
          edgeCount: expect.any(Number),
          pendingReferenceCount: expect.any(Number)
        },
        {
          filePath: "src/token.ts",
          language: "typescript",
          declarationCount: 1,
          edgeCount: expect.any(Number),
          pendingReferenceCount: expect.any(Number)
        }
      ],
      truncated: false
    });
    expect(files.files.map((file) => file.filePath)).toEqual(["src/api.ts", "src/token.ts"]);
    expect(files.files.every((file) => file.indexedAt === indexed.indexedAt)).toBe(true);

    const tree = await service.files(projectPath, {
      format: "tree",
      pattern: "**/*.ts",
      maxDepth: 1
    });
    expect(tree).toMatchObject({
      format: "tree",
      matchedFileCount: 2,
      tree: {
        returnedFileCount: 2,
        children: [{
          kind: "directory",
          name: "src",
          path: "src",
          returnedFileCount: 2,
          depthLimited: true,
          children: []
        }]
      },
      truncated: false
    });
    expect(tree).not.toHaveProperty("groups");

    const grouped = await service.files(projectPath, { format: "grouped" });
    expect(grouped).toMatchObject({
      format: "grouped",
      matchedFileCount: 4,
      groups: [
        { language: "python", fileCount: 2 },
        { language: "typescript", fileCount: 2 }
      ]
    });
    expect(grouped).not.toHaveProperty("tree");

    const bounded = await service.files(projectPath, { limit: 1 });
    expect(bounded).toMatchObject({
      bounds: { limit: 1, maximumLimit: MAX_FILE_LIMIT },
      truncated: true
    });
    expect(bounded.files).toHaveLength(1);

    const firstPage = await service.files(projectPath, { pathPrefix: "src", limit: 1 });
    expect(firstPage).toMatchObject({
      matchedFileCount: 2,
      files: [{ filePath: "src/api.ts" }],
      pagination: {
        returnedFileCount: 1,
        remainingFileCount: 1,
        nextCursor: expect.any(String)
      },
      truncated: true
    });
    const secondPage = await service.files(projectPath, {
      pathPrefix: "src",
      cursor: firstPage.pagination.nextCursor ?? undefined,
      limit: 2,
      format: "grouped"
    });
    expect(secondPage).toMatchObject({
      format: "grouped",
      matchedFileCount: 2,
      files: [{ filePath: "src/token.ts" }],
      pagination: {
        returnedFileCount: 1,
        remainingFileCount: 0,
        nextCursor: null
      },
      truncated: false
    });
    await expect(service.files(projectPath, {
      pathPrefix: "src",
      language: "typescript",
      cursor: firstPage.pagination.nextCursor ?? undefined
    })).rejects.toMatchObject({ code: "FILE_CURSOR_FILTER_MISMATCH" });
    await expect(service.files(projectPath, { cursor: "not+a+canonical+cursor" }))
      .rejects.toMatchObject({ code: "INVALID_FILE_CURSOR" });

    await writeFile(join(projectPath, "src", "added-after-index.ts"), "export const late = 1;\n", "utf8");
    const afterWrite = await service.files(projectPath, { pathPrefix: "src" });
    expect(afterWrite.status).toMatchObject({ stale: true, generationId: indexed.generationId });
    expect(afterWrite.files.map((file) => file.filePath)).toEqual(["src/api.ts", "src/token.ts"]);

    await expect(service.files(projectPath, { pathPrefix: "../outside" })).rejects.toMatchObject({
      code: "INVALID_FILE_PATH_PREFIX"
    });
    await expect(
      service.files(projectPath, { language: "not-a-language" as never })
    ).rejects.toMatchObject({ code: "INVALID_FILE_LANGUAGE" });
    await expect(service.files(projectPath, { limit: 0 })).rejects.toMatchObject({
      code: "INVALID_FILE_LIMIT"
    });
    await expect(service.files(projectPath, { pattern: "../**/*.ts" })).rejects.toMatchObject({
      code: "INVALID_FILE_PATTERN"
    });
    await expect(service.files(projectPath, { pattern: "./" })).rejects.toMatchObject({
      code: "INVALID_FILE_PATTERN"
    });
    await expect(service.files(projectPath, { format: "yaml" as never })).rejects.toMatchObject({
      code: "INVALID_FILE_FORMAT"
    });
    await expect(service.files(projectPath, { format: "tree", maxDepth: 0 })).rejects.toMatchObject({
      code: "INVALID_FILE_MAX_DEPTH"
    });
    await expect(service.files(projectPath, { format: "flat", maxDepth: 2 })).rejects.toMatchObject({
      code: "INVALID_FILE_MAX_DEPTH"
    });
    await service.sync({ projectPath });
    await expect(service.files(projectPath, {
      pathPrefix: "src",
      cursor: firstPage.pagination.nextCursor ?? undefined
    })).rejects.toMatchObject({ code: "FILE_CURSOR_GENERATION_MISMATCH" });
  });
});
