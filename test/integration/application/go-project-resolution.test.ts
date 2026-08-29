import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createInlineProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-go-project-"));
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

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("Go project resolution", () => {
  it("resolves a unique concrete receiver method across same-package files and rejects interface dispatch", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/root\n\ngo 1.22\n",
      "service.go": [
        "package sample",
        "",
        "type Service struct{}",
        "",
        "func (s *Service) Run() {}"
      ].join("\n"),
      "caller.go": [
        "package sample",
        "",
        "type Runner interface { Run() }",
        "",
        "func caller(service *Service) { service.Run() }",
        "func interfaceCaller(r Runner) { r.Run() }"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = store.getSnapshot(projectPath);
    const method = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "service.go#Service.Run"
    );
    const caller = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "caller.go#caller"
    );
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: caller?.id,
          targetId: method?.id,
          kind: "calls",
          resolution: "exact",
          confidence: 1,
          referenceName: "Run",
          evidence: {
            ruleId: "project.go.same-package.unique-concrete-receiver-method-call",
            stage: "module",
            candidateSymbolIds: [method?.id],
            resolutionPath: ["caller.go", "service.go"]
          }
        })
      ])
    );
    expect(
      snapshot.edges.filter(
        (edge) =>
          edge.kind === "calls" &&
          edge.sourceId === snapshot.symbols.find((symbol) => symbol.qualifiedName === "caller.go#interfaceCaller")?.id &&
          edge.referenceName === "Run" &&
          edge.resolution === "exact"
      )
    ).toEqual([]);
  });

  it.each([
    [
      "duplicate methods",
      {
        "service.go": "package sample\ntype Service struct{}\nfunc (s *Service) Run() {}\n",
        "duplicate.go": "package sample\nfunc (s *Service) Run() {}\n"
      }
    ],
    [
      "conditional methods",
      {
        "service_windows.go": "//go:build windows\npackage sample\ntype Service struct{}\nfunc (s *Service) Run() {}\n"
      }
    ]
  ])("keeps Go method calls unresolved for %s", async (_description, extraFiles) => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/root\n\ngo 1.22\n",
      ...extraFiles,
      "caller.go": "package sample\nfunc caller(service *Service) { service.Run() }\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    expect(
      store.getSnapshot(projectPath).edges.filter(
        (edge) =>
          edge.kind === "calls" &&
          edge.referenceName === "Run" &&
          edge.resolution === "exact" &&
          edge.evidence?.ruleId === "project.go.same-package.unique-concrete-receiver-method-call"
      )
    ).toEqual([]);
  });

  it("resolves unique same-package struct constructions and rejects interface construction", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/root\n\ngo 1.22\n",
      "types.go": "package sample\ntype Service struct{}\n",
      "caller.go": [
        "package sample",
        "",
        "type Runner interface { Run() }",
        "",
        "func caller() { _ = new(Service); _ = &Service{}; _ = Service{}; _ = new(Runner) }"
      ].join("\n")
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = store.getSnapshot(projectPath);
    const typeSymbol = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "types.go#Service"
    );
    const caller = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "caller.go#caller"
    );
    const constructions = snapshot.edges.filter(
      (edge) =>
        edge.kind === "instantiates" &&
        edge.sourceId === caller?.id &&
        edge.resolution === "exact" &&
        edge.evidence?.ruleId === "project.go.same-package.unique-struct-instantiation"
    );
    expect(constructions).toHaveLength(3);
    expect(constructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: typeSymbol?.id,
          confidence: 1,
          evidence: expect.objectContaining({ candidateSymbolIds: [typeSymbol?.id] })
        })
      ])
    );
    expect(snapshot.edges.some(
      (edge) =>
        edge.kind === "instantiates" &&
        edge.sourceId === caller?.id &&
        edge.referenceName === "Runner" &&
        edge.resolution === "exact"
    )).toBe(false);
  });

  it("keeps fsnotify-shaped package calls and root-module imports exact across persistence and sync", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module github.com/fsnotify/fsnotify\n\ngo 1.22\n",
      "backend_windows.go": [
        "package fsnotify",
        "",
        "import \"github.com/fsnotify/fsnotify/internal\"",
        "",
        "func (w *Watcher) AddWith(path string) error {",
        "  return getOptions(path)",
        "}"
      ].join("\n"),
      "fsnotify.go": [
        "package fsnotify",
        "",
        "func getOptions(path string) error { return nil }"
      ].join("\n"),
      "internal/representative.go": "package internal\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    const snapshot = () => store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) =>
      snapshot().symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const call = () =>
      snapshot().edges.find(
        (edge) =>
          edge.kind === "calls" &&
          edge.evidence?.ruleId ===
            "project.go.same-package.unique-unconditional-package-function-call"
      );
    const imported = () =>
      snapshot().edges.find(
        (edge) =>
          edge.kind === "imports" &&
          edge.evidence?.ruleId ===
            "project.go.root-module.local-package-import-representative-file"
      );

    const initial = await service.init({ projectPath });
    const addWith = symbol("backend_windows.go#Watcher.AddWith");
    const getOptions = symbol("fsnotify.go#getOptions");
    const backend = symbol("backend_windows.go");
    const representative = symbol("internal/representative.go");
    expect(addWith).toMatchObject({
      qualifiedName: "backend_windows.go#Watcher.AddWith",
      kind: "method"
    });
    expect(call()).toMatchObject({
      sourceId: addWith?.id,
      targetId: getOptions?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "project.go.same-package.unique-unconditional-package-function-call",
        stage: "module",
        candidateSymbolIds: [getOptions?.id],
        resolutionPath: ["backend_windows.go", "fsnotify.go"]
      }
    });
    expect(imported()).toMatchObject({
      sourceId: backend?.id,
      targetId: representative?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "project.go.root-module.local-package-import-representative-file",
        stage: "module",
        candidateSymbolIds: [representative?.id],
        configurationPaths: ["go.mod"],
        resolutionPath: ["backend_windows.go", "internal/representative.go"]
      }
    });

    expect((await service.callers(projectPath, getOptions?.qualifiedName ?? "missing")).relations.map(
      (relation) => relation.symbol.id
    )).toEqual([addWith?.id]);
    expect((await service.callees(projectPath, addWith?.qualifiedName ?? "missing")).relations.map(
      (relation) => relation.symbol.id
    )).toEqual([getOptions?.id]);
    expect((await service.impact(projectPath, getOptions?.qualifiedName ?? "missing", 1)).paths).toEqual(
      expect.arrayContaining([expect.objectContaining({
        symbols: expect.arrayContaining([expect.objectContaining({ id: addWith?.id })])
      })])
    );
    expect(await service.explainEdge(projectPath, call()?.id ?? "missing")).toMatchObject({
      source: { id: addWith?.id },
      target: { id: getOptions?.id },
      edge: { evidence: { ruleId: "project.go.same-package.unique-unconditional-package-function-call" } }
    });

    expect((await service.sync({ projectPath })).generationId).toBe(initial.generationId);
    const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    expect((await reopened.callees(projectPath, addWith?.qualifiedName ?? "missing")).relations.map(
      (relation) => relation.symbol.id
    )).toEqual([getOptions?.id]);

    await writeFile(resolve(projectPath, "backend_windows.go"), [
      "package fsnotify",
      "",
      "import \"github.com/fsnotify/fsnotify/internal\"",
      "",
      "func (w *Watcher) AddWith(path string) error {",
      "  _ = path",
      "  return getOptions(\"changed\")",
      "}"
    ].join("\n"), "utf8");
    const importerSync = await service.sync({ projectPath });
    expect(importerSync.generationId).not.toBe(initial.generationId);
    expect(call()).toMatchObject({ targetId: getOptions?.id });

    await writeFile(resolve(projectPath, "fsnotify.go"), "package fsnotify\n\nfunc getOptions(path string) error { return nil }\n// changed\n", "utf8");
    const targetSync = await service.sync({ projectPath });
    expect(targetSync.generationId).not.toBe(importerSync.generationId);
    expect(call()).toMatchObject({ targetId: getOptions?.id });
    expect(imported()).toMatchObject({ targetId: representative?.id });
  });

  it("keeps alias and blank local imports as exact file edges without creating calls", async () => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/root\n\ngo 1.22\n",
      "alias.go": [
        "package sample",
        "import internalAlias \"example.test/root/internal\"",
        "func aliasImporter() {}"
      ].join("\n"),
      "blank.go": [
        "package sample",
        "import _ \"example.test/root/internal\"",
        "func blankImporter() {}"
      ].join("\n"),
      "internal/representative.go": "package internal\n",
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = store.getSnapshot(projectPath);
    const source = (filePath: string) => snapshot.symbols.find((symbol) => symbol.filePath === filePath && symbol.kind === "file");
    const target = source("internal/representative.go");
    const imports = snapshot.edges.filter(
      (edge) => edge.evidence?.ruleId === "project.go.root-module.local-package-import-representative-file"
    );
    expect(imports).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: source("alias.go")?.id, targetId: target?.id }),
      expect.objectContaining({ sourceId: source("blank.go")?.id, targetId: target?.id })
    ]));
    expect(
      snapshot.edges.filter(
        (edge) => edge.kind === "calls" && edge.evidence?.ruleId?.startsWith("project.go.")
      )
    ).toEqual([]);
  });

  it.each([
    [
      "an external import",
      { "caller.go": "package sample\nimport \"github.com/elsewhere/internal\"\nfunc caller() {}\n" }
    ],
    [
      "an absent root go.mod",
      {
        "caller.go": "package sample\nimport \"example.test/root/internal\"\nfunc caller() {}\n",
        "internal/representative.go": "package internal\n"
      }
    ],
    [
      "an isolated root replace directive",
      {
        "go.mod": "module example.test/root\n\ngo 1.22\n\nreplace example.test/root/internal => ./internal\n",
        "caller.go": "package sample\nimport \"example.test/root/internal\"\nfunc caller() {}\n",
        "internal/representative.go": "package internal\n"
      }
    ],
    [
      "a nested Go module",
      {
        "go.mod": "module example.test/root\n\ngo 1.22\n",
        "caller.go": "package sample\nimport \"example.test/root/internal\"\nfunc caller() {}\n",
        "internal/go.mod": "module example.test/root/internal\n\ngo 1.22\n",
        "internal/representative.go": "package internal\n"
      }
    ]
  ])("emits no project Go import edge for %s", async (_description, files) => {
    const projectPath = await createInlineProject(files);
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    expect(store.getSnapshot(projectPath).edges.filter(
      (edge) => edge.evidence?.ruleId === "project.go.root-module.local-package-import-representative-file"
    )).toEqual([]);
  });

  it.each([
    [
      "a duplicate target",
      {
        "caller.go": "package sample\nfunc caller() { target() }\n",
        "one.go": "package sample\nfunc target() {}\n",
        "two.go": "package sample\nfunc target() {}\n"
      }
    ],
    [
      "a conditional target",
      {
        "caller.go": "package sample\nfunc caller() { target() }\n",
        "target_windows.go": "package sample\nfunc target() {}\n"
      }
    ],
    [
      "a package mismatch",
      {
        "caller.go": "package sample\nfunc caller() { target() }\n",
        "target.go": "package other\nfunc target() {}\n"
      }
    ],
    [
      "a dot import",
      {
        "caller.go": "package sample\nimport . \"example.test/root/internal\"\nfunc caller() { target() }\n",
        "target.go": "package sample\nfunc target() {}\n"
      }
    ]
  ])("emits no project Go call edge for %s", async (_description, files) => {
    const projectPath = await createInlineProject({
      "go.mod": "module example.test/root\n\ngo 1.22\n",
      ...files,
      "sample_test.go": "package sample\nfunc testOnly() {}\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    expect(store.getArtifactFacts(projectPath).find((facts) => facts.filePath === "sample_test.go")?.goProjectFacts)
      .toBeUndefined();
    expect(store.getSnapshot(projectPath).edges.filter(
      (edge) => edge.evidence?.ruleId === "project.go.same-package.unique-unconditional-package-function-call"
    )).toEqual([]);
  });

  it("fails closed when a retained bare call has no indexed caller identity", () => {
    const callerSource = "package sample\nfunc caller() { target() }\n";
    const targetSource = "package sample\nfunc target() {}\n";
    const callerFacts = extractFileFacts({
      filePath: "caller.go",
      language: "go",
      sourceText: callerSource
    });
    const targetFacts = extractFileFacts({
      filePath: "target.go",
      language: "go",
      sourceText: targetSource
    });
    const snapshot = resolveProjectFacts({
      sourceDocuments: [
        { absolutePath: "/caller.go", relativePath: "caller.go", language: "go", sourceText: callerSource, contentHash: "caller" },
        { absolutePath: "/target.go", relativePath: "target.go", language: "go", sourceText: targetSource, contentHash: "target" }
      ],
      extractedFiles: [
        {
          ...callerFacts,
          goProjectFacts: {
            ...callerFacts.goProjectFacts!,
            bareCalls: callerFacts.goProjectFacts!.bareCalls.map((call) => ({ ...call, callerId: "missing-caller" }))
          }
        },
        targetFacts
      ],
      indexedAt: "2026-08-11T00:00:00.000Z"
    });

    expect(snapshot.edges.filter(
      (edge) => edge.evidence?.ruleId === "project.go.same-package.unique-unconditional-package-function-call"
    )).toEqual([]);
  });

  it("fails closed when a Go function fact names a different function symbol", () => {
    const callerSource = "package sample\nfunc caller() { target() }\n";
    const targetSource = "package sample\nfunc other() {}\n";
    const callerFacts = extractFileFacts({
      filePath: "caller.go",
      language: "go",
      sourceText: callerSource
    });
    const targetFacts = extractFileFacts({
      filePath: "target.go",
      language: "go",
      sourceText: targetSource
    });
    const snapshot = resolveProjectFacts({
      sourceDocuments: [
        { absolutePath: "/caller.go", relativePath: "caller.go", language: "go", sourceText: callerSource, contentHash: "caller" },
        { absolutePath: "/target.go", relativePath: "target.go", language: "go", sourceText: targetSource, contentHash: "target" }
      ],
      extractedFiles: [
        callerFacts,
        {
          ...targetFacts,
          goProjectFacts: {
            ...targetFacts.goProjectFacts!,
            functions: targetFacts.goProjectFacts!.functions.map((fact) => ({ ...fact, name: "target" }))
          }
        }
      ],
      indexedAt: "2026-08-11T00:00:00.000Z"
    });

    expect(snapshot.edges.filter(
      (edge) => edge.evidence?.ruleId === "project.go.same-package.unique-unconditional-package-function-call"
    )).toEqual([]);
  });

  it("fails closed when a Go artifact carries a foreign-package function fact", () => {
    const callerSource = "package p\nfunc caller() { target() }\n";
    const carrierSource = "package p\nfunc carrier() {}\n";
    const foreignSource = "package q\nfunc target() {}\n";
    const callerFacts = extractFileFacts({
      filePath: "caller.go",
      language: "go",
      sourceText: callerSource
    });
    const carrierFacts = extractFileFacts({
      filePath: "carrier.go",
      language: "go",
      sourceText: carrierSource
    });
    const foreignFacts = extractFileFacts({
      filePath: "foreign/target.go",
      language: "go",
      sourceText: foreignSource
    });
    const foreignTarget = foreignFacts.symbols.find((symbol) => symbol.name === "target" && symbol.kind === "function");
    const snapshot = resolveProjectFacts({
      sourceDocuments: [
        { absolutePath: "/caller.go", relativePath: "caller.go", language: "go", sourceText: callerSource, contentHash: "caller" },
        { absolutePath: "/carrier.go", relativePath: "carrier.go", language: "go", sourceText: carrierSource, contentHash: "carrier" },
        { absolutePath: "/foreign/target.go", relativePath: "foreign/target.go", language: "go", sourceText: foreignSource, contentHash: "foreign" }
      ],
      extractedFiles: [
        callerFacts,
        {
          ...carrierFacts,
          goProjectFacts: {
            ...carrierFacts.goProjectFacts!,
            functions: [{
              name: "target",
              symbolId: foreignTarget?.id ?? "missing-foreign-target",
              filePath: "foreign/target.go",
              unconditionallyAvailable: true
            }]
          }
        },
        foreignFacts
      ],
      indexedAt: "2026-08-11T00:00:00.000Z"
    });

    expect(snapshot.edges.filter(
      (edge) => edge.evidence?.ruleId === "project.go.same-package.unique-unconditional-package-function-call"
    )).toEqual([]);
  });

  it.each(["_ignored.go", ".ignored.go"])(
    "does not exact-link a caller to a target declared only in %s",
    async (ignoredFileName) => {
      const projectPath = await createInlineProject({
        "go.mod": "module example.test/root\n\ngo 1.22\n",
        "caller.go": "package sample\nfunc caller() { target() }\n",
        [ignoredFileName]: "package sample\nfunc target() {}\n",
        "control/caller.go": "package control\nfunc caller() { target() }\n",
        "control/target.go": "package control\nfunc target() {}\n"
      });
      const store = new SqliteGraphStore();
      const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

      await service.init({ projectPath });

      const snapshot = store.getSnapshot(projectPath);
      const symbol = (qualifiedName: string) =>
        snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
      const projectCalls = snapshot.edges.filter(
        (edge) =>
          edge.evidence?.ruleId ===
          "project.go.same-package.unique-unconditional-package-function-call"
      );
      expect(projectCalls.filter((edge) => edge.sourceId === symbol("caller.go#caller")?.id)).toEqual([]);
      expect(projectCalls).toEqual(expect.arrayContaining([
        expect.objectContaining({
          sourceId: symbol("control/caller.go#caller")?.id,
          targetId: symbol("control/target.go#target")?.id
        })
      ]));
    }
  );

  it.each(["_ignored.go", ".ignored.go"])(
    "does not choose %s as a root-module package representative",
    async (ignoredFileName) => {
      const projectPath = await createInlineProject({
        "go.mod": "module example.test/root\n\ngo 1.22\n",
        "cmd/caller.go": [
          "package main",
          "import \"example.test/root/internal\"",
          "func caller() {}"
        ].join("\n"),
        [`internal/${ignoredFileName}`]: "package internal\n",
        "control/caller.go": [
          "package control",
          "import \"example.test/root/valid\"",
          "func caller() {}"
        ].join("\n"),
        "valid/representative.go": "package valid\n"
      });
      const store = new SqliteGraphStore();
      const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

      await service.init({ projectPath });

      const snapshot = store.getSnapshot(projectPath);
      const fileSymbol = (filePath: string) =>
        snapshot.symbols.find((candidate) => candidate.kind === "file" && candidate.filePath === filePath);
      const projectImports = snapshot.edges.filter(
        (edge) =>
          edge.evidence?.ruleId ===
          "project.go.root-module.local-package-import-representative-file"
      );
      expect(projectImports.filter((edge) => edge.sourceId === fileSymbol("cmd/caller.go")?.id)).toEqual([]);
      expect(projectImports).toEqual(expect.arrayContaining([
        expect.objectContaining({
          sourceId: fileSymbol("control/caller.go")?.id,
          targetId: fileSymbol("valid/representative.go")?.id
        })
      ]));
    }
  );
});
