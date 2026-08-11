import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { extractGoFileFacts } from "../../../src/extraction/go.js";
import { extractRustFileFacts } from "../../../src/extraction/rust.js";
import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createPersistedProject(relativePath: string, sourceText: string): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-go-rust-calls-"));
  temporaryDirectories.push(projectPath);
  const filePath = resolve(projectPath, ...relativePath.split("/"));
  await mkdir(resolve(filePath, ".."), { recursive: true });
  await writeFile(filePath, sourceText, "utf8");
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

function functionByName(facts: ArtifactFacts, name: string): SymbolNode {
  const matches = facts.symbols.filter((symbol) => symbol.kind === "function" && symbol.name === name);
  expect(matches).toHaveLength(1);
  const symbol = matches[0];
  if (symbol === undefined) {
    throw new Error(`Missing function ${name}.`);
  }
  return symbol;
}

function calls(facts: ArtifactFacts) {
  return facts.edges.filter((edge) => edge.kind === "calls");
}

function methodByName(facts: ArtifactFacts, name: string): SymbolNode {
  const matches = facts.symbols.filter((symbol) => symbol.kind === "method" && symbol.name === name);
  expect(matches).toHaveLength(1);
  const symbol = matches[0];
  if (symbol === undefined) {
    throw new Error(`Missing method ${name}.`);
  }
  return symbol;
}

describe("Go and Rust bounded same-file direct calls", () => {
  it("keeps complete Go functions and simple receiver methods through unrelated recovery", () => {
    const facts = extractGoFileFacts({
      filePath: "backend_windows.go",
      language: "go",
      sourceText: `package fsnotify

import "github.com/fsnotify/fsnotify"

func broken() {
  errors <- err
}

func (w *Watcher) AddWith(path string) error {
  return getOptions(path)
}

func getOptions(path string) error { return nil }

var broken =
`
    });

    const addWith = methodByName(facts, "AddWith");
    const getOptions = functionByName(facts, "getOptions");
    expect(addWith).toMatchObject({
      qualifiedName: "backend_windows.go#Watcher.AddWith",
      kind: "method",
      range: expect.objectContaining({ start: { line: 9, column: 1 } })
    });
    expect(facts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: expect.any(String),
          targetId: addWith.id,
          kind: "contains",
          resolution: "exact"
        }),
        expect.objectContaining({
          sourceId: expect.any(String),
          targetId: getOptions.id,
          kind: "contains",
          resolution: "exact"
        })
      ])
    );
    expect(facts).toMatchObject({
      goProjectFacts: {
        packageName: "fsnotify",
        functions: expect.arrayContaining([
          expect.objectContaining({
            name: "getOptions",
            symbolId: getOptions.id,
            filePath: "backend_windows.go",
            unconditionallyAvailable: false
          })
        ]),
        imports: expect.arrayContaining([
          expect.objectContaining({ moduleSpecifier: "github.com/fsnotify/fsnotify" })
        ]),
        bareCalls: expect.arrayContaining([
          expect.objectContaining({ callerId: addWith.id, targetName: "getOptions" })
        ])
      }
    });
  });

  it("uses stable simple value and pointer receiver method identities", () => {
    const facts = extractGoFileFacts({
      filePath: "receiver.go",
      language: "go",
      sourceText: `package receiver
func (v Value) Read() {}
func (p *Pointer) Write() {}`
    });

    expect(methodByName(facts, "Read")).toMatchObject({
      qualifiedName: "receiver.go#Value.Read",
      kind: "method"
    });
    expect(methodByName(facts, "Write")).toMatchObject({
      qualifiedName: "receiver.go#Pointer.Write",
      kind: "method"
    });
  });

  it("retains a clean fsnotify package function when recovery is elsewhere in the file", () => {
    const facts = extractGoFileFacts({
      filePath: "fsnotify.go",
      language: "go",
      sourceText: `package fsnotify
func getOptions() {}
var broken =`
    });

    const getOptions = functionByName(facts, "getOptions");
    expect(facts.goProjectFacts?.functions).toEqual([
      expect.objectContaining({
        name: "getOptions",
        symbolId: getOptions.id,
        filePath: "fsnotify.go",
        unconditionallyAvailable: true
      })
    ]);
  });

  it("emits no incomplete Go declarations or project facts from unsafe headers and callers", () => {
    const cases = [
      ["malformed receiver", `package sample\nfunc (w *) AddWith() { getOptions() }\nfunc getOptions() {}`],
      ["malformed declaration", `package sample\nfunc getOptions( {}`],
      ["error in caller", `package sample\nfunc caller() { getOptions( }\nfunc getOptions() {}`],
      ["broken import", `package sample\nimport (\nfunc caller() { getOptions() }\nfunc getOptions() {}`],
      ["dot import", `package sample\nimport . "foreign"\nfunc caller() { getOptions() }\nfunc getOptions() {}`],
      ["local shadow", `package sample\nfunc caller() { getOptions := func() {}; getOptions() }\nfunc getOptions() {}`],
      ["parameter", `package sample\nfunc caller(getOptions func()) { getOptions() }\nfunc getOptions() {}`],
      ["result", `package sample\nfunc caller() (getOptions func()) { getOptions(); return }\nfunc getOptions() {}`],
      ["range", `package sample\nfunc caller(items []func()) { for _, getOptions := range items { getOptions() } }\nfunc getOptions() {}`],
      ["type", `package sample\nfunc caller() { type getOptions func(); getOptions() }\nfunc getOptions() {}`],
      ["closure", `package sample\nfunc caller() { func() { getOptions() }() }\nfunc getOptions() {}`],
      ["parenthesized", `package sample\nfunc caller() { (getOptions)() }\nfunc getOptions() {}`],
      ["selector", `package sample\nfunc caller() { pkg.getOptions() }\nfunc getOptions() {}`]
    ] as const;

    for (const [description, sourceText] of cases) {
      const facts = extractGoFileFacts({ filePath: "sample.go", language: "go", sourceText });
      if (description === "malformed receiver") {
        expect(facts.symbols.filter((symbol) => symbol.kind === "method"), description).toEqual([]);
      }
      if (description === "malformed declaration") {
        expect(facts.symbols.filter((symbol) => symbol.kind !== "file"), description).toEqual([]);
      }
      expect(facts.goProjectFacts?.bareCalls ?? [], description).toEqual([]);
    }
  });

  it("retains blank-import identity while dot imports still suppress bare calls", () => {
    const blankImportFacts = extractGoFileFacts({
      filePath: "imports.go",
      language: "go",
      sourceText: `package sample
import _ "example.com/root/internal"
func caller() { callee() }
func callee() {}`
    });
    expect(blankImportFacts.goProjectFacts?.imports).toEqual([
      expect.objectContaining({
        moduleSpecifier: "example.com/root/internal",
        localName: "_"
      })
    ]);
    expect(blankImportFacts.goProjectFacts?.bareCalls).toEqual([
      expect.objectContaining({ targetName: "callee" })
    ]);

    const dotImportFacts = extractGoFileFacts({
      filePath: "dot-import.go",
      language: "go",
      sourceText: `package sample
import . "example.com/root/internal"
func caller() { callee() }
func callee() {}`
    });
    expect(dotImportFacts.goProjectFacts?.bareCalls).toEqual([]);
  });

  it("marks conditional Go package functions and excludes test-file facts", () => {
    const conditional = extractGoFileFacts({
      filePath: "backend_windows.go",
      language: "go",
      sourceText: `package fsnotify
func getOptions() {}`
    });
    expect(conditional.goProjectFacts?.functions).toEqual([
      expect.objectContaining({ name: "getOptions", unconditionallyAvailable: false })
    ]);

    const tagged = extractGoFileFacts({
      filePath: "backend.go",
      language: "go",
      sourceText: `//go:build windows
package fsnotify
func taggedOptions() {}`
    });
    expect(tagged.goProjectFacts?.functions).toEqual([
      expect.objectContaining({ name: "taggedOptions", unconditionallyAvailable: false })
    ]);

    const testFacts = extractGoFileFacts({
      filePath: "backend_test.go",
      language: "go",
      sourceText: `package fsnotify
func getOptions() {}`
    });
    expect(testFacts.goProjectFacts).toBeUndefined();
  });

  it("excludes Go-tool-ignored basenames from project-call facts", () => {
    for (const filePath of ["_ignored.go", ".ignored.go"] as const) {
      const facts = extractGoFileFacts({
        filePath,
        language: "go",
        sourceText: `package sample
func ignoredTarget() {}`
      });

      expect(functionByName(facts, "ignoredTarget").filePath).toBe(filePath);
      expect(facts.goProjectFacts, filePath).toBeUndefined();
    }

    const normalFacts = extractGoFileFacts({
      filePath: "normal.go",
      language: "go",
      sourceText: `package sample
func normalTarget() {}`
    });
    expect(normalFacts.goProjectFacts?.functions).toEqual([
      expect.objectContaining({ name: "normalTarget", unconditionallyAvailable: true })
    ]);
  });

  it("emits exact Go package-function calls with the unique target evidence", () => {
    let traversalCount = 0;
    const facts = extractGoFileFacts({
      filePath: "src/sample.go",
      language: "go",
      directCallTraversalObserver: () => {
        traversalCount += 1;
      },
      sourceText: `package sample

func caller() {
  callee()
}

func callee() {}
`
    });
    const caller = functionByName(facts, "caller");
    const callee = functionByName(facts, "callee");

    expect(traversalCount).toBe(2);
    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        resolution: "exact",
        confidence: 1,
        referenceName: "callee",
        evidence: {
          ruleId: "syntax.go.same-file.unique-package-function-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("emits exact Rust top-level function calls with the unique target evidence", () => {
    let traversalCount = 0;
    const facts = extractRustFileFacts({
      filePath: "src/sample.rs",
      language: "rust",
      directCallTraversalObserver: () => {
        traversalCount += 1;
      },
      sourceText: `fn caller() {
    callee();
}

fn callee() {}
`
    });
    const caller = functionByName(facts, "caller");
    const callee = functionByName(facts, "callee");

    expect(traversalCount).toBe(2);
    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        resolution: "exact",
        confidence: 1,
        referenceName: "callee",
        evidence: {
          ruleId: "syntax.rust.same-file.unique-top-level-function-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("keeps persisted Go and Rust call results across a fresh service without reinitializing", async () => {
    const goProject = await createPersistedProject(
      "src/sample.go",
      `package sample

func caller() { callee() }
func callee() {}
`
    );
    const rustProject = await createPersistedProject(
      "src/sample.rs",
      `fn caller() { callee(); }
fn callee() {}
`
    );
    await createService().init({ projectPath: goProject });
    await createService().init({ projectPath: rustProject });

    const reopenedGo = createService();
    const reopenedRust = createService();
    await expect(reopenedGo.callees(goProject, "src/sample.go#caller")).resolves.toMatchObject({
      relations: [expect.objectContaining({ symbol: expect.objectContaining({ name: "callee" }) })]
    });
    await expect(reopenedRust.callees(rustProject, "src/sample.rs#caller")).resolves.toMatchObject({
      relations: [expect.objectContaining({ symbol: expect.objectContaining({ name: "callee" }) })]
    });
  });

  it("keeps persisted fail-closed local bindings after a fresh service without reinitializing", async () => {
    const goProject = await createPersistedProject(
      "src/sample.go",
      `package sample

func caller() (callee func()) { callee(); return }
func callee() {}
`
    );
    const rustProject = await createPersistedProject(
      "src/sample.rs",
      `fn caller() { fn callee() {} callee(); }
fn callee() {}
`
    );
    await createService().init({ projectPath: goProject });
    await createService().init({ projectPath: rustProject });

    const reopenedGo = createService();
    const reopenedRust = createService();
    await expect(reopenedGo.callees(goProject, "src/sample.go#caller")).resolves.toMatchObject({
      relations: []
    });
    await expect(reopenedRust.callees(rustProject, "src/sample.rs#caller")).resolves.toMatchObject({
      relations: []
    });
  });

  it("fails closed for ambiguous Go call forms", () => {
    const sources = [
      ["parameter", `package sample\nfunc caller(callee func()) { callee() }\nfunc callee() {}`],
      ["named result", `package sample\nfunc caller() (callee func()) { callee(); return }\nfunc callee() {}`],
      ["local", `package sample\nfunc caller() { callee := func() {}; callee() }\nfunc callee() {}`],
      ["later local", `package sample\nfunc caller() { callee(); var callee func(); callee() }\nfunc callee() {}`],
      ["range binder", `package sample\nfunc caller(items []func()) { for _, callee := range items { callee() } }\nfunc callee() {}`],
      ["local type", `package sample\nfunc caller() { type callee func(); callee() }\nfunc callee() {}`],
      ["local constant", `package sample\nfunc caller() { const callee = 1; callee() }\nfunc callee() {}`],
      ["nested closure", `package sample\nfunc caller() { func() { callee() }() }\nfunc callee() {}`],
      ["dot import", `package sample\nimport . "example.com/foreign"\nfunc caller() { callee() }\nfunc callee() {}`],
      ["selector", `package sample\nfunc caller() { pkg.callee() }\nfunc callee() {}`],
      ["parenthesized indirect", `package sample\nfunc caller() { (callee)() }\nfunc callee() {}`],
      ["duplicate target", `package sample\nfunc caller() { callee() }\nfunc callee() {}\nfunc callee() {}`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractGoFileFacts({ filePath: "src/sample.go", language: "go", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("fails closed for ambiguous Rust call forms", () => {
    const sources = [
      ["parameter", `fn caller(callee: fn()) { callee(); }\nfn callee() {}`],
      ["local", `fn caller() { let callee = || {}; callee(); }\nfn callee() {}`],
      ["later local", `fn caller() { callee(); let callee = || {}; callee(); }\nfn callee() {}`],
      ["loop binding", `fn caller() { for callee in callbacks { callee(); } }\nfn callee() {}`],
      ["nested local function", `fn caller() { fn callee() {} callee(); }\nfn callee() {}`],
      ["nested closure", `fn caller() { let callback = || { callee(); }; callback(); }\nfn callee() {}`],
      ["glob import", `use foreign::*;\nfn caller() { callee(); }\nfn callee() {}`],
      ["local glob import", `fn caller() { use foreign::*; callee(); }\nfn callee() {}`],
      ["import shadow", `use foreign::callee;\nfn caller() { callee(); }\nfn callee() {}`],
      ["qualified path", `fn caller() { crate::callee(); }\nfn callee() {}`],
      ["parenthesized indirect", `fn caller() { (callee)(); }\nfn callee() {}`],
      ["macro", `fn caller() { callee!(); }\nfn callee() {}`],
      ["duplicate target", `fn caller() { callee(); }\nfn callee() {}\nfn callee() {}`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractRustFileFacts({ filePath: "src/sample.rs", language: "rust", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });
});
