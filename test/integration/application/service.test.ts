import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
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
  GraphStore,
  ReplaceProjectFactsInput
} from "../../../src/ports/index.js";

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
      service.search(projectPath, "needle", { language: "python" as "typescript" })
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
});
