import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { ARTIFACT_FACTS_EXTRACTOR_VERSION } from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directoryPath) =>
      rm(directoryPath, { recursive: true, force: true })
    )
  );
});

describe("SymbolLatticeService", () => {
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
    expect((await service.sync({ projectPath })).stale).toBe(false);
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
