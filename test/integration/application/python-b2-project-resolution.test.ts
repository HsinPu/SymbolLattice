import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  PROJECT_RESOLVER_VERSION,
  SOURCE_ROLE_CLASSIFIER_VERSION
} from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createInlineProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-python-b2-"));
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

function join(...parts: readonly string[]): string {
  return parts.join("/");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("Python B2 regular-package resolution", () => {
  it("re-extracts stale Python facts after the extractor version upgrades", async () => {
    const projectPath = await createInlineProject({
      "src/requests/__init__.py": "",
      "src/requests/utils.py": [
        "def default_headers():",
        "    return {}"
      ].join("\n"),
      "src/requests/sessions.py": [
        "from .utils import default_headers",
        "",
        "class Session:",
        "    def __init__(self):",
        "        self.headers = default_headers()"
      ].join("\n")
    });
    const staleExtractor = Object.assign(
      (input: Parameters<typeof extractFileFacts>[0]) => {
        const facts = extractFileFacts(input);
        return input.language !== "python"
          ? facts
          : {
              ...facts,
              symbols: facts.symbols.filter((symbol) => symbol.kind === "file"),
              edges: [],
              pythonFacts: undefined
            };
      },
      { version: "multi-language-ast-v323" }
    );
    const initialStore = new SqliteGraphStore();
    const initialService = new SymbolLatticeService(initialStore, new FileSystemSourceCatalog(), {
      artifactFactsExtractor: staleExtractor
    });

    const initial = await initialService.init({ projectPath });
    const staleFactsByPath = new Map(
      initialStore.getArtifactFacts(projectPath).map((facts) => [facts.filePath, facts])
    );
    for (const filePath of ["src/requests/utils.py", "src/requests/sessions.py"]) {
      expect(staleFactsByPath.get(filePath)).toMatchObject({
        filePath,
        extractorVersion: "multi-language-ast-v323"
      });
      expect(staleFactsByPath.get(filePath)?.pythonFacts).toBeUndefined();
      expect(staleFactsByPath.get(filePath)?.symbols).toHaveLength(1);
    }
    expect(
      initialStore
        .getSnapshot(projectPath)
        .edges.filter(
          (edge) =>
            edge.filePath === "src/requests/sessions.py" &&
            ["imports", "calls"].includes(edge.kind) &&
            edge.evidence?.ruleId.startsWith("module.python.regular-package.")
        )
    ).toEqual([]);

    const upgradedStore = new SqliteGraphStore();
    const upgradedService = new SymbolLatticeService(upgradedStore, new FileSystemSourceCatalog());
    expect(await upgradedService.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["indexer-version-changed"]
    });

    const synced = await upgradedService.sync({ projectPath });
    expect(synced.generationId).not.toBe(initial.generationId);
    expect(synced).toMatchObject({ stale: false, staleReasons: [] });
    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: expect.arrayContaining([
        "src/requests/utils.py",
        "src/requests/sessions.py"
      ]),
      reuseInvalidationReasons: ["extractor-version-changed"]
    });
    expect(synced.lastIndexWork?.reusedArtifactFiles).not.toContain("src/requests/utils.py");
    expect(synced.lastIndexWork?.reusedArtifactFiles).not.toContain("src/requests/sessions.py");
    expect(upgradedStore.getArtifactFacts(projectPath)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/requests/utils.py",
          extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
        }),
        expect.objectContaining({
          filePath: "src/requests/sessions.py",
          extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION
        })
      ])
    );
    expect(ARTIFACT_FACTS_EXTRACTOR_VERSION).toBe("multi-language-ast-v364");
    expect(PROJECT_RESOLVER_VERSION).toBe("project-resolver-v169");
    expect(upgradedStore.getActiveGenerationBundle(projectPath)).toMatchObject({
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      resolverVersion: `${PROJECT_RESOLVER_VERSION}+${SOURCE_ROLE_CLASSIFIER_VERSION}`
    });

    const snapshot = upgradedStore.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const utils = symbol("src/requests/utils.py");
    const sessions = symbol("src/requests/sessions.py");
    const defaultHeaders = symbol("src/requests/utils.py#default_headers");
    const initialize = symbol("src/requests/sessions.py#Session.__init__");
    const exactImport = snapshot.edges.find(
      (edge) =>
        edge.kind === "imports" &&
        edge.filePath === "src/requests/sessions.py" &&
        edge.referenceName === ".utils" &&
        edge.evidence?.ruleId === "module.python.regular-package.relative-named-import"
    );
    const exactCall = snapshot.edges.find(
      (edge) =>
        edge.kind === "calls" &&
        edge.filePath === "src/requests/sessions.py" &&
        edge.referenceName === "default_headers" &&
        edge.evidence?.ruleId ===
          "module.python.regular-package.relative-named-import.unique-top-level-function-call"
    );
    expect(exactImport).toMatchObject({
      sourceId: sessions?.id,
      targetId: utils?.id,
      range: { start: { line: 1, column: 6 }, end: { line: 1, column: 12 } },
      resolution: "exact",
      confidence: 1,
      evidence: expect.objectContaining({
        candidateSymbolIds: [utils?.id],
        resolutionPath: ["src/requests/sessions.py", "src/requests/utils.py"]
      })
    });
    expect(exactCall).toMatchObject({
      sourceId: initialize?.id,
      targetId: defaultHeaders?.id,
      resolution: "exact",
      confidence: 1,
      evidence: expect.objectContaining({ candidateSymbolIds: [defaultHeaders?.id] })
    });
  });

  it("fails closed for parenthesized relative imports with module-package collisions", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/utils.py": [
        "def default_headers():",
        "    return {\"source\": \"module\"}"
      ].join("\n"),
      "pkg/utils/__init__.py": [
        "def default_headers():",
        "    return {\"source\": \"package\"}"
      ].join("\n"),
      "pkg/sessions.py": [
        "from .utils import (",
        "    default_headers,",
        ")",
        "",
        "class Session:",
        "    def __init__(self):",
        "        self.headers = default_headers()"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    expect(
      store
        .getSnapshot(projectPath)
        .edges.filter(
          (edge) =>
            edge.filePath === "pkg/sessions.py" &&
            edge.evidence?.ruleId.startsWith("module.python.regular-package.")
        )
    ).toEqual([]);
  });

  it("keeps Requests-shaped relative bindings exact across persistence and incremental sync", async () => {
    // The recoverable bare yield is function-scoped; module-level yields remain unsupported.
    const projectPath = await createInlineProject({
      "src/requests/__init__.py": "",
      "src/requests/utils.py": [
        "def helper_before_headers():",
        "    return None",
        "",
        "def recoverable_generator():",
        "    yield",
        "",
        "def default_headers() -> CaseInsensitiveDict[str]:",
        "    return CaseInsensitiveDict()",
        "",
        "def helper_after_headers():",
        "    return None"
      ].join("\n"),
      "src/requests/sessions.py": [
        "from .utils import (",
        "    default_headers,",
        "    helper_after_headers as HeaderType,  # Requests-style alias",
        ")",
        "",
        "class Session:",
        "    def __init__(self):",
        "        self.headers = default_headers()"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    const symbols = () => store.getSnapshot(projectPath).symbols;
    const symbol = (qualifiedName: string) =>
      symbols().find((candidate) => candidate.qualifiedName === qualifiedName);
    const exactImport = () =>
      store
        .getSnapshot(projectPath)
        .edges.find(
          (edge) =>
            edge.kind === "imports" &&
            edge.filePath === "src/requests/sessions.py" &&
            edge.referenceName === ".utils" &&
            edge.evidence?.ruleId === "module.python.regular-package.relative-named-import"
        );
    const exactCall = () =>
      store
        .getSnapshot(projectPath)
        .edges.find(
          (edge) =>
            edge.kind === "calls" &&
            edge.filePath === "src/requests/sessions.py" &&
            edge.referenceName === "default_headers" &&
            edge.evidence?.ruleId ===
              "module.python.regular-package.relative-named-import.unique-top-level-function-call"
        );

    const initial = await service.init({ projectPath });
    const sessions = symbol("src/requests/sessions.py");
    const utils = symbol("src/requests/utils.py");
    const session = symbol("src/requests/sessions.py#Session");
    const initialize = symbol("src/requests/sessions.py#Session.__init__");
    const defaultHeaders = symbol("src/requests/utils.py#default_headers");

    expect(session).toMatchObject({
      qualifiedName: "src/requests/sessions.py#Session",
      kind: "class"
    });
    expect(defaultHeaders).toMatchObject({
      qualifiedName: "src/requests/utils.py#default_headers",
      kind: "function"
    });
    expect(exactImport()).toMatchObject({
      sourceId: sessions?.id,
      targetId: utils?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "module.python.regular-package.relative-named-import",
        stage: "module"
      }
    });
    expect(exactImport()?.evidence?.candidateSymbolIds).toEqual([utils?.id]);
    expect(exactCall()).toMatchObject({
      sourceId: initialize?.id,
      targetId: defaultHeaders?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "module.python.regular-package.relative-named-import.unique-top-level-function-call",
        stage: "module"
      }
    });
    expect(exactCall()?.evidence?.candidateSymbolIds).toContain(defaultHeaders?.id);
    expect(
      store
        .getSnapshot(projectPath)
        .edges.filter(
          (edge) =>
            edge.kind === "calls" &&
            edge.sourceId === initialize?.id &&
            edge.targetId !== null &&
            symbols().find((candidate) => candidate.id === edge.targetId)?.filePath ===
              "src/requests/sessions.py"
        )
    ).toEqual([]);

    const callers = await service.callers(projectPath, defaultHeaders?.qualifiedName ?? "missing");
    const callees = await service.callees(projectPath, initialize?.qualifiedName ?? "missing");
    expect(callers.relations.map((relation) => relation.symbol.id)).toEqual([initialize?.id]);
    expect(callees.relations.map((relation) => relation.symbol.id)).toEqual([defaultHeaders?.id]);
    const explanation = await service.explainEdge(projectPath, exactCall()?.id ?? "missing-edge");
    expect(explanation).toMatchObject({
      source: { id: initialize?.id },
      target: { id: defaultHeaders?.id },
      edge: {
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "module.python.regular-package.relative-named-import.unique-top-level-function-call",
          stage: "module"
        })
      }
    });

    const noOp = await service.sync({ projectPath });
    expect(noOp.generationId).toBe(initial.generationId);

    const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    expect(
      (await reopened.callers(projectPath, defaultHeaders?.qualifiedName ?? "missing")).relations.map(
        (relation) => relation.symbol.id
      )
    ).toEqual([initialize?.id]);

    await writeFile(
      resolve(projectPath, "src", "requests", "sessions.py"),
      [
        "from .utils import (",
        "    default_headers,",
        "    helper_after_headers as HeaderType,  # Requests-style alias",
        ")",
        "",
        "class Session:",
        "    def __init__(self):",
        "        self.headers = default_headers()",
        "        self.header_type = HeaderType"
      ].join("\n"),
      "utf8"
    );
    const importerSync = await service.sync({ projectPath });
    expect(importerSync.generationId).not.toBe(initial.generationId);
    expect(exactCall()).toMatchObject({ sourceId: initialize?.id, targetId: defaultHeaders?.id });

    await writeFile(
      resolve(projectPath, "src", "requests", "utils.py"),
      [
        "def helper_before_headers():",
        "    return None",
        "",
        "def recoverable_generator():",
        "    yield",
        "",
        "def default_headers() -> CaseInsensitiveDict[str]:",
        "    return CaseInsensitiveDict()",
        "",
        "def helper_after_headers():",
        "    return None",
        "# target changed"
      ].join("\n"),
      "utf8"
    );
    const targetSync = await service.sync({ projectPath });
    expect(targetSync.generationId).not.toBe(importerSync.generationId);
    expect(exactImport()).toMatchObject({ sourceId: sessions?.id, targetId: utils?.id });
    expect(exactCall()).toMatchObject({ sourceId: initialize?.id, targetId: defaultHeaders?.id });
  });

  it("persists exact file imports, imported bare calls, and imported direct inheritance", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/providers.py": [
        "def helper():",
        "    return 1",
        "",
        "class Base:",
        "    pass"
      ].join("\n"),
      "pkg/consumer.py": [
        "from .providers import helper",
        "",
        "def entry():",
        "    return helper()"
      ].join("\n"),
      "pkg/child.py": [
        "from .providers import Base as Parent",
        "",
        "class Child(Parent):",
        "    pass"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const providers = symbol("pkg/providers.py");
    const helper = symbol("pkg/providers.py#helper");
    const entry = symbol("pkg/consumer.py#entry");
    const base = symbol("pkg/providers.py#Base");
    const child = symbol("pkg/child.py#Child");

    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: symbol("pkg/consumer.py")?.id,
          targetId: providers?.id,
          kind: "imports",
          resolution: "exact",
          referenceName: ".providers",
          evidence: expect.objectContaining({
            ruleId: "module.python.regular-package.relative-named-import",
            stage: "module"
          })
        }),
        expect.objectContaining({
          sourceId: entry?.id,
          targetId: helper?.id,
          kind: "calls",
          resolution: "exact",
          referenceName: "helper",
          evidence: expect.objectContaining({
            ruleId: "module.python.regular-package.relative-named-import.unique-top-level-function-call",
            stage: "module"
          })
        }),
        expect.objectContaining({
          sourceId: child?.id,
          targetId: base?.id,
          kind: "extends",
          resolution: "exact",
          referenceName: "Parent",
          evidence: expect.objectContaining({
            ruleId: "module.python.regular-package.relative-named-import.unique-top-level-class-inheritance",
            stage: "module"
          })
        })
      ])
    );
    expect(
      snapshot.edges
        .filter(
          (edge) => edge.evidence?.ruleId === "module.python.regular-package.relative-named-import"
        )
        .map((edge) => edge.evidence?.candidateSymbolIds)
    ).toEqual(
      expect.arrayContaining([
        [providers?.id],
        [providers?.id]
      ])
    );

    const callers = await service.callers(projectPath, helper?.qualifiedName ?? "missing");
    const callees = await service.callees(projectPath, entry?.qualifiedName ?? "missing");
    expect(callers.relations.map((relation) => relation.symbol.id)).toEqual([entry?.id]);
    expect(callees.relations.map((relation) => relation.symbol.id)).toEqual([helper?.id]);
    const callRelation = callers.relations[0];
    const edgeExplanation = await service.explainEdge(
      projectPath,
      callRelation?.edge.id ?? "missing-edge"
    );
    expect(edgeExplanation).toMatchObject({
      source: { id: entry?.id },
      target: { id: helper?.id },
      edge: {
        evidence: expect.objectContaining({
          ruleId: "module.python.regular-package.relative-named-import.unique-top-level-function-call"
        })
      }
    });

    const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    const reopenedCallers = await reopened.callers(projectPath, helper?.qualifiedName ?? "missing");
    expect(reopenedCallers.relations.map((relation) => relation.symbol.id)).toEqual([entry?.id]);
  });

  it("resolves one-dot imported top-level class construction with exact module evidence", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/providers.py": [
        "class Widget:",
        "    pass"
      ].join("\n"),
      "pkg/consumer.py": [
        "from .providers import Widget as LocalWidget",
        "def build():",
        "    return LocalWidget()",
        "class Factory:",
        "    def build(self):",
        "        return LocalWidget()"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const widget = symbol("pkg/providers.py#Widget");
    const build = symbol("pkg/consumer.py#build");
    const method = symbol("pkg/consumer.py#Factory.build");
    const instantiates = snapshot.edges.filter(
      (edge) =>
        edge.kind === "instantiates" &&
        edge.evidence?.ruleId ===
          "module.python.regular-package.relative-named-import.unique-top-level-class-instantiation"
    );

    expect(instantiates).toEqual([
      expect.objectContaining({
        sourceId: build?.id,
        targetId: widget?.id,
        range: { start: { line: 3, column: 12 }, end: { line: 3, column: 23 } },
        resolution: "exact",
        confidence: 1,
        referenceName: "LocalWidget",
        evidence: {
          ruleId:
            "module.python.regular-package.relative-named-import.unique-top-level-class-instantiation",
          stage: "module",
          candidateSymbolIds: [widget?.id],
          resolutionPath: ["pkg/consumer.py", "pkg/providers.py"]
        }
      }),
      expect.objectContaining({
        sourceId: method?.id,
        targetId: widget?.id,
        range: { start: { line: 6, column: 16 }, end: { line: 6, column: 27 } },
        evidence: expect.objectContaining({ candidateSymbolIds: [widget?.id] })
      })
    ]);
    expect(
      snapshot.edges.filter((edge) => edge.kind === "calls" && edge.referenceName === "LocalWidget")
    ).toEqual([]);
  });

  it("keeps an imported async function import exact without a runtime call edge", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/providers.py": "async def async_helper():\n    return 1",
      "pkg/consumer.py": [
        "from .providers import async_helper",
        "def entry():",
        "    return async_helper()"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const pythonEdges = store
      .getSnapshot(projectPath)
      .edges.filter((edge) => edge.evidence?.ruleId.startsWith("module.python.regular-package."));
    expect(pythonEdges.filter((edge) => edge.kind === "imports")).toHaveLength(1);
    expect(pythonEdges.filter((edge) => edge.kind === "calls")).toEqual([]);
  });

  it("fails closed for unsupported package/import/binding/declaration shapes", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/providers.py": [
        "def helper():",
        "    return 1",
        "",
        "def duplicate():",
        "    return 1",
        "def duplicate():",
        "    return 2",
        "",
        "def decorate(function):",
        "    return function",
        "@decorate",
        "def decorated():",
        "    return 1",
        "",
        "class Base:",
        "    pass"
      ].join("\n"),
      "pkg/star.py": [
        "from .providers import helper",
        "from .providers import *",
        "def entry():",
        "    return helper()"
      ].join("\n"),
      "pkg/list.py": "from .providers import helper, Base",
      "pkg/parent.py": "from ..providers import helper",
      "pkg/module.py": "import providers",
      "pkg/missing.py": "from .providers import missing",
      "pkg/duplicate.py": "from .providers import duplicate",
      "pkg/decorated.py": "from .providers import decorated",
      "pkg/rebound.py": [
        "from .providers import helper",
        "helper = lambda: 2",
        "def entry():",
        "    return helper()"
      ].join("\n"),
      "pkg/rebound_base.py": [
        "from .providers import Base",
        "Base = object",
        "class Child(Base):",
        "    pass"
      ].join("\n"),
      "namespace/providers.py": [
        "def helper():",
        "    return 1"
      ].join("\n"),
      "namespace/consumer.py": [
        "from .providers import helper",
        "def entry():",
        "    return helper()"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const rejectedFiles = new Set([
      "pkg/star.py",
      "pkg/list.py",
      "pkg/parent.py",
      "pkg/module.py",
      "pkg/missing.py",
      "pkg/duplicate.py",
      "pkg/decorated.py",
      "pkg/rebound.py",
      "pkg/rebound_base.py",
      "namespace/consumer.py"
    ]);
    const b2Edges = store
      .getSnapshot(projectPath)
      .edges.filter(
        (edge) =>
          rejectedFiles.has(edge.filePath) &&
          ["imports", "calls", "extends"].includes(edge.kind) &&
          edge.evidence?.ruleId.startsWith("module.python.regular-package.")
      );

    expect(b2Edges).toEqual([]);
  });

  it("fails closed for imported calls when the target artifact can globally replace the declaration", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/providers.py": [
        "def helper():",
        "    return 1",
        "class Widget:",
        "    pass",
        "def mutate_helper():",
        "    global helper, Widget",
        "    helper = lambda: 2",
        "    Widget = object"
      ].join("\n"),
      "pkg/consumer.py": [
        "from .providers import helper",
        "from .providers import Widget",
        "def entry():",
        "    helper()",
        "    return Widget()"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const pythonEdges = store
      .getSnapshot(projectPath)
      .edges.filter((edge) => edge.evidence?.ruleId.startsWith("module.python.regular-package."));
    expect(pythonEdges.filter((edge) => edge.kind === "imports")).toHaveLength(2);
    expect(pythonEdges.filter((edge) => edge.kind === "calls")).toEqual([]);
    expect(pythonEdges.filter((edge) => edge.kind === "instantiates")).toEqual([]);
  });

  it("fails closed for imported calls after an annotated global assignment in the target artifact", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/providers.py": [
        "def helper():",
        "    return 1",
        "replacement = helper",
        "def mutate_helper():",
        "    global helper",
        "    helper: object = replacement"
      ].join("\n"),
      "pkg/consumer.py": [
        "from .providers import helper",
        "def entry():",
        "    return helper()"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const pythonEdges = store
      .getSnapshot(projectPath)
      .edges.filter((edge) => edge.evidence?.ruleId.startsWith("module.python.regular-package."));
    expect(pythonEdges.filter((edge) => edge.kind === "imports")).toHaveLength(1);
    expect(pythonEdges.filter((edge) => edge.kind === "calls")).toEqual([]);
  });

  it("retains Python B2 edges across importer and target incremental syncs", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/helpers.py": [
        "def python_helper():",
        "    return 1",
        "",
        "class PythonBase:",
        "    pass"
      ].join("\n"),
      "pkg/entry.py": [
        "from .helpers import python_helper",
        "from .helpers import PythonBase",
        "",
        "def python_entry():",
        "    return python_helper()",
        "",
        "class PythonChild(PythonBase):",
        "    pass"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    const b2Edges = () =>
      store
        .getSnapshot(projectPath)
        .edges.filter((edge) => edge.evidence?.ruleId.startsWith("module.python.regular-package."));
    const exactB2EdgeKinds = () => b2Edges().map((edge) => edge.kind).sort();

    await service.init({ projectPath });
    expect(exactB2EdgeKinds()).toEqual(["calls", "extends", "imports", "imports"]);

    await writeFile(
      resolve(projectPath, "pkg", "entry.py"),
      [
        "from .helpers import python_helper",
        "from .helpers import PythonBase",
        "",
        "def python_entry():",
        "    return python_helper()",
        "",
        "class PythonChild(PythonBase):",
        "    pass",
        ""
      ].join("\n"),
      "utf8"
    );
    await service.sync({ projectPath });
    expect(exactB2EdgeKinds()).toEqual(["calls", "extends", "imports", "imports"]);

    await writeFile(
      resolve(projectPath, "pkg", "helpers.py"),
      [
        "def python_helper():",
        "    return 1",
        "",
        "class PythonBase:",
        "    pass",
        ""
      ].join("\n"),
      "utf8"
    );
    await service.sync({ projectPath });
    expect(exactB2EdgeKinds()).toEqual(["calls", "extends", "imports", "imports"]);
  });

  it("fails closed for match aliases and PEP 695 type-definition rebinding", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/providers.py": [
        "def helper():",
        "    return 1"
      ].join("\n"),
      "pkg/match_alias.py": [
        "from .providers import helper",
        "def entry(value):",
        "    match value:",
        "        case _ as helper:",
        "            return helper()"
      ].join("\n"),
      "pkg/type_alias.py": [
        "from .providers import helper",
        "type helper = int",
        "def entry():",
        "    return helper()"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    expect(
      store
        .getSnapshot(projectPath)
        .edges.filter(
          (edge) =>
            edge.kind === "calls" &&
            ["pkg/match_alias.py", "pkg/type_alias.py"].includes(edge.filePath) &&
            edge.evidence?.ruleId.startsWith("module.python.regular-package.")
        )
    ).toEqual([]);
    expect(
      store
        .getSnapshot(projectPath)
        .edges.filter(
          (edge) =>
            edge.filePath === "pkg/type_alias.py" &&
            edge.evidence?.ruleId.startsWith("module.python.regular-package.")
        )
    ).toEqual([]);
  });

  it("fails closed for PEP 695 generic function and class type-parameter shadows", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/providers.py": [
        "def helper():",
        "    return 1",
        "",
        "class Base:",
        "    pass"
      ].join("\n"),
      "pkg/generic_function.py": [
        "from .providers import helper",
        "def entry[helper]():",
        "    return helper()",
        "",
        "def entry_variadic[*helper]():",
        "    return helper()",
        "",
        "def entry_paramspec[**helper]():",
        "    return helper()"
      ].join("\n"),
      "pkg/generic_class.py": [
        "from .providers import Base",
        "class Child[Base](Base):",
        "    pass"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const b2Edges = store
      .getSnapshot(projectPath)
      .edges.filter((edge) => edge.evidence?.ruleId.startsWith("module.python.regular-package."));
    expect(
      b2Edges.filter((edge) => edge.filePath === "pkg/generic_function.py" && edge.kind === "calls")
    ).toEqual([]);
    expect(
      b2Edges.filter((edge) => edge.filePath === "pkg/generic_class.py" && edge.kind === "extends")
    ).toEqual([]);
  });

  it("uses only actual local import bindings when exposing a multi-base Python class", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/vendor.py": [
        "class DatabaseFeatures:",
        "    pass"
      ].join("\n"),
      "pkg/features.py": [
        "from .vendor import DatabaseFeatures as VendorFeatures",
        "class BaseSpatialFeatures:",
        "    pass",
        "class DatabaseFeatures(BaseSpatialFeatures, VendorFeatures):",
        "    pass"
      ].join("\n"),
      "pkg/base.py": "from .features import DatabaseFeatures"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const targetFile = snapshot.symbols.find(
      (symbol) => symbol.kind === "file" && symbol.filePath === "pkg/features.py"
    );
    expect(
      snapshot.edges.filter(
        (edge) =>
          edge.filePath === "pkg/base.py" &&
          edge.kind === "imports" &&
          edge.referenceName === ".features"
      )
    ).toEqual([
      expect.objectContaining({
        targetId: targetFile?.id,
        range: { start: { line: 1, column: 6 }, end: { line: 1, column: 15 } },
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({ candidateSymbolIds: [targetFile?.id] })
      })
    ]);
  });

  it("resolves a generic Python class with one structural bare imported base", async () => {
    const projectPath = await createInlineProject({
      "pkg/__init__.py": "",
      "pkg/providers.py": [
        "class Base:",
        "    pass"
      ].join("\n"),
      "pkg/consumer.py": [
        "from .providers import Base",
        "class Child[_DataT](Base):",
        "    pass"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const child = snapshot.symbols.find((symbol) => symbol.qualifiedName === "pkg/consumer.py#Child");
    const base = snapshot.symbols.find((symbol) => symbol.qualifiedName === "pkg/providers.py#Base");
    expect(
      snapshot.edges.filter(
        (edge) =>
          edge.filePath === "pkg/consumer.py" &&
          edge.kind === "extends" &&
          edge.referenceName === "Base"
      )
    ).toEqual([
      expect.objectContaining({
        sourceId: child?.id,
        targetId: base?.id,
        range: { start: { line: 2, column: 21 }, end: { line: 2, column: 25 } },
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({ candidateSymbolIds: [base?.id] })
      })
    ]);
  });
});
