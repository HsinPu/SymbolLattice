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
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-go-rust-calls-"));
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

  it("retains concrete receiver method-call facts while rejecting interface and escaped receivers", () => {
    const facts = extractGoFileFacts({
      filePath: "receiver.go",
      language: "go",
      sourceText: `package receiver
type Service struct{}
type Runner interface { Run() }
func (s *Service) Run() {}
func caller(service *Service) { service.Run(); }
func unsafeCaller(service *Service, runner Runner) { runner.Run(); consume(service); }
func reassignedCaller(service *Service) { alias := service; _ = alias; service.Run(); }
func consume(value *Service) {}
`
    });

    const method = methodByName(facts, "Run");
    expect(facts.goProjectFacts?.methods).toEqual([
      expect.objectContaining({
        receiverTypeName: "Service",
        name: "Run",
        symbolId: method.id,
        filePath: "receiver.go",
        unconditionallyAvailable: true
      })
    ]);
    expect(facts.goProjectFacts?.methodCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          callerId: expect.any(String),
          receiverName: "service",
          receiverTypeName: "Service",
          methodName: "Run",
          range: expect.any(Object)
        }),
        expect.objectContaining({
          callerId: expect.any(String),
          receiverName: "runner",
          receiverTypeName: "Runner",
          methodName: "Run",
          range: expect.any(Object)
        })
      ])
    );
    expect(
      facts.goProjectFacts?.methodCalls?.some((call) => call.receiverName === "service" && call.callerId.includes("unsafeCaller"))
    ).not.toBe(true);
    expect(
      facts.goProjectFacts?.methodCalls?.some((call) => call.callerId.includes("reassignedCaller"))
    ).not.toBe(true);
  });

  it("retains struct identities and direct construction facts", () => {
    const facts = extractGoFileFacts({
      filePath: "construct.go",
      language: "go",
      sourceText: `package construct
type Service struct{}
func caller() { _ = new(Service); _ = &Service{}; _ = Service{} }
`
    });

    const typeSymbol = facts.symbols.find(
      (symbol) => symbol.kind === "type" && symbol.qualifiedName === "construct.go#Service"
    );
    expect(typeSymbol).toBeDefined();
    expect(facts.goProjectFacts?.structs).toEqual([
      expect.objectContaining({ name: "Service", symbolId: typeSymbol?.id, filePath: "construct.go" })
    ]);
    expect(facts.goProjectFacts?.instantiations).toHaveLength(3);
    expect(facts.goProjectFacts?.instantiations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callerId: expect.any(String), typeName: "Service", range: expect.any(Object) })
      ])
    );
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

  it("retains calls whose boolean result is negated by Go unary syntax", () => {
    const facts = extractGoFileFacts({
      filePath: "negated.go",
      language: "go",
      sourceText: `package sample
type Service struct{}
func (s *Service) Ready() bool { return true }
func callee() bool { return true }
func caller(service *Service) {
  if !callee() { return }
  if !service.Ready() { return }
}
`
    });
    const caller = functionByName(facts, "caller");
    const callee = functionByName(facts, "callee");
    expect(facts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: caller.id, targetId: callee.id, referenceName: "callee" })
      ])
    );
    expect(facts.goProjectFacts?.methodCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          callerId: caller.id,
          receiverName: "service",
          receiverTypeName: "Service",
          methodName: "Ready"
        })
      ])
    );
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

  it("retains strict Rust crate-root module, module import, and target declaration facts", () => {
    const rootFacts = extractRustFileFacts({
      filePath: "src/lib.rs",
      language: "rust",
      sourceText: `mod map;
mod value;`
    });
    const mapFacts = extractRustFileFacts({
      filePath: "src/map.rs",
      language: "rust",
      sourceText: `use crate::value::Value;`
    });
    const valueFacts = extractRustFileFacts({
      filePath: "src/value.rs",
      language: "rust",
      sourceText: `/// Represents any valid JSON value.
#[derive(Clone, Eq, PartialEq, Hash)]
pub enum Value { Unit }`
    });
    const deFacts = extractRustFileFacts({
      filePath: "src/de.rs",
      language: "rust",
      sourceText: `pub fn from_str<'a, T>(input: &'a str) -> T
where
    T: Default,
{
    T::default()
}`
    });

    expect(rootFacts.rustProjectFacts?.modules).toEqual([
      expect.objectContaining({ name: "map", filePath: "src/lib.rs", unconditionallyAvailable: true }),
      expect.objectContaining({ name: "value", filePath: "src/lib.rs", unconditionallyAvailable: true })
    ]);
    expect(mapFacts.rustProjectFacts?.imports).toEqual([
      expect.objectContaining({ modulePath: ["value"], importedName: "Value" })
    ]);
    const value = valueFacts.symbols.find((symbol) => symbol.kind === "type" && symbol.name === "Value");
    expect(value).toMatchObject({ qualifiedName: "src/value.rs#Value", isExported: true });
    expect(valueFacts.rustProjectFacts?.declarations).toEqual([
      expect.objectContaining({ name: "Value", symbolId: value?.id, filePath: "src/value.rs", kind: "type" })
    ]);
    expect(functionByName(deFacts, "from_str")).toMatchObject({
      qualifiedName: "src/de.rs#from_str",
      isExported: true
    });
    expect(deFacts.rustProjectFacts?.declarations).toEqual([
      expect.objectContaining({ name: "from_str", kind: "function", unconditionallyAvailable: true })
    ]);
  });

  it("retains serde-json's parse-clean top-level generic from_str through unrelated recovery", () => {
    const facts = extractRustFileFacts({
      filePath: "src/de.rs",
      language: "rust",
      sourceText: `macro_rules! overflow {
    ($a:ident * 10 + $b:ident, $c:expr) => {
        match $c {
            c => $a >= c / 10 && ($a > c / 10 || $b > c % 10),
        }
    };
}

pub fn from_str<'a, T>(s: &'a str) -> Result<T>
where
    T: de::Deserialize<'a>,
{
    from_trait(read::StrRead::new(s))
}`
    });

    const fromStr = functionByName(facts, "from_str");
    expect(fromStr).toMatchObject({
      qualifiedName: "src/de.rs#from_str",
      kind: "function",
      isExported: true
    });
    expect(facts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: expect.any(String), targetId: fromStr.id, kind: "contains" })
      ])
    );
    expect(facts.rustProjectFacts?.declarations).toEqual([
      expect.objectContaining({ name: "from_str", symbolId: fromStr.id, unconditionallyAvailable: true })
    ]);
  });

  it("keeps cfg-decorated function symbols while excluding unconditional project declarations", () => {
    const facts = extractRustFileFacts({
      filePath: "src/de.rs",
      language: "rust",
      sourceText: `#[cfg(feature = "arbitrary_precision")]
pub fn from_str() { helper(); }
fn helper() {}`
    });

    const fromStr = functionByName(facts, "from_str");
    const helper = functionByName(facts, "helper");
    expect(facts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: fromStr.id, kind: "contains", resolution: "exact" }),
        expect.objectContaining({
          sourceId: fromStr.id,
          targetId: helper.id,
          kind: "calls",
          resolution: "exact"
        })
      ])
    );
    expect(facts.rustProjectFacts?.declarations).toEqual([]);
  });

  it("does not let a well-formed conditional declaration poison an unrelated unconditional target", () => {
    const facts = extractRustFileFacts({
      filePath: "src/de.rs",
      language: "rust",
      sourceText: `#[cfg(feature = "std")]
#[cfg_attr(docsrs, doc(cfg(feature = "std")))]
pub fn from_reader() {}

pub fn from_str() {}`
    });

    expect(facts.rustProjectFacts?.declarations).toEqual([
      expect.objectContaining({ name: "from_str", kind: "function" })
    ]);
  });

  it("does not let well-formed conditional or inline modules poison physical root modules", () => {
    const facts = extractRustFileFacts({
      filePath: "src/lib.rs",
      language: "rust",
      sourceText: `mod map;
mod value;
#[cfg(feature = "optional")]
mod optional;
pub mod inline {}`
    });
    const collidingFacts = extractRustFileFacts({
      filePath: "src/lib.rs",
      language: "rust",
      sourceText: `mod map;
#[cfg(feature = "optional")]
mod map;`
    });

    expect(facts.rustProjectFacts?.modules).toEqual([
      expect.objectContaining({ name: "map" }),
      expect.objectContaining({ name: "value" })
    ]);
    expect(collidingFacts.rustProjectFacts?.modules ?? []).toEqual([]);
  });

  it("round-trips Rust project facts through SQLite artifact persistence", async () => {
    const projectPath = await createPersistedProject("src/lib.rs", `mod map;
mod value;`);
    await writeFile(resolve(projectPath, "src", "map.rs"), "use crate::value::Value;\n", "utf8");
    await writeFile(resolve(projectPath, "src", "value.rs"), "pub enum Value { Unit }\n", "utf8");
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const persistedByPath = new Map(
      store.getArtifactFacts(projectPath).map((facts) => [facts.filePath, facts])
    );
    expect(persistedByPath.get("src/lib.rs")).toMatchObject({
      rustProjectFacts: { modules: expect.arrayContaining([expect.objectContaining({ name: "map" })]) }
    });
    expect(persistedByPath.get("src/map.rs")).toMatchObject({
      rustProjectFacts: {
        imports: [expect.objectContaining({ modulePath: ["value"], importedName: "Value" })]
      }
    });
    expect(persistedByPath.get("src/value.rs")).toMatchObject({
      rustProjectFacts: { declarations: [expect.objectContaining({ name: "Value", kind: "type" })] }
    });
  });

  it("fails closed for conditional, unsafe, or ambiguous Rust project facts", () => {
    for (const [description, filePath, sourceText] of [
      ["cfg module", "src/lib.rs", `#[cfg(feature = "x")]\nmod value;`],
      ["path module", "src/lib.rs", `#[path = "other.rs"]\nmod value;`],
      ["cfg enum", "src/value.rs", `#[cfg(feature = "x")]\npub enum Value { Unit }`],
      ["parse error", "src/value.rs", `pub enum Value {`],
      ["test context", "tests/map.rs", `use crate::value::Value;`],
      ["generated context", "generated/map.rs", `use crate::value::Value;`]
    ] as const) {
      const facts = extractRustFileFacts({ filePath, language: "rust", sourceText });
      expect(facts.rustProjectFacts, description).toBeUndefined();
      expect(facts.symbols.filter((symbol) => symbol.kind !== "file"), description).toEqual([]);
    }

    for (const [description, sourceText] of [
      ["alias import", `use crate::value::Value as LocalValue;`],
      ["group import", `use crate::value::{Value, Other};`],
      ["glob import", `use crate::value::*;`],
      ["super import", `use super::value::Value;`],
      ["external import", `use external::value::Value;`]
    ] as const) {
      const facts = extractRustFileFacts({ filePath: "src/map.rs", language: "rust", sourceText });
      expect(facts.rustProjectFacts?.imports, description).toEqual([]);
    }

    for (const [description, sourceText] of [
      ["trait declaration", `pub trait Value {}`],
      ["impl declaration", `pub struct Value;\nimpl Value {}`],
      ["macro declaration", `make_value!();`],
      ["duplicate declaration", `pub enum Value { Unit }\npub enum Value { Other }`]
    ] as const) {
      const facts = extractRustFileFacts({ filePath: "src/value.rs", language: "rust", sourceText });
      if (description === "trait declaration") {
        expect(facts.rustProjectFacts?.declarations, description).toEqual([
          expect.objectContaining({ name: "Value", kind: "type", typeKind: "trait" })
        ]);
        expect(facts.symbols.filter((symbol) => symbol.kind === "type"), description).toHaveLength(1);
      } else if (description === "impl declaration") {
        expect(facts.rustProjectFacts?.declarations, description).toEqual([
          expect.objectContaining({ name: "Value", kind: "type", typeKind: "struct" })
        ]);
        expect(facts.symbols.filter((symbol) => symbol.kind === "type"), description).toHaveLength(1);
      } else {
        expect(facts.rustProjectFacts?.declarations, description).toEqual([]);
        expect(facts.symbols.filter((symbol) => symbol.kind === "type"), description).toEqual([]);
      }
    }
  });

  it("suppresses accepted Rust project facts that collide with malformed direct siblings", () => {
    for (const [description, filePath, sourceText, fact] of [
      [
        "enum",
        "src/value.rs",
        `pub enum Value { Unit }\npub enum Value {`,
        "declarations"
      ],
      [
        "function",
        "src/de.rs",
        `pub fn from_str() {}\npub fn from_str(`,
        "declarations"
      ],
      ["module", "src/lib.rs", `mod map;\nmod value;\nmod value`, "modules"],
      [
        "import",
        "src/map.rs",
        `use crate::value::Value;\nuse crate::value::Value`,
        "imports"
      ],
      [
        "attributed enum",
        "src/value.rs",
        `pub enum Value { Unit }\n#[derive(Clone)]\npub enum Value {`,
        "declarations"
      ],
      [
        "attributed module",
        "src/lib.rs",
        `mod value;\n#[derive(Clone)]\nmod value`,
        "modules"
      ],
      [
        "attributed import",
        "src/map.rs",
        `use crate::value::Value;\n#[derive(Clone)]\nuse crate::value::Value`,
        "imports"
      ]
    ] as const) {
      const facts = extractRustFileFacts({ filePath, language: "rust", sourceText });
      expect(facts.rustProjectFacts?.[fact] ?? [], description).toEqual([]);
      if (fact === "declarations") {
        expect(facts.symbols.filter((symbol) => symbol.kind === "type"), description).toEqual([]);
      }
      if (description === "function") {
        expect(facts.symbols.filter((symbol) => symbol.name === "from_str"), description).toHaveLength(1);
      }
    }
  });

  it("suppresses a Rust project fact category when a different-name sibling is malformed", () => {
    const enumFacts = extractRustFileFacts({
      filePath: "src/value.rs",
      language: "rust",
      sourceText: `pub enum Value { Unit }\npub enum Broken {`
    });
    const moduleFacts = extractRustFileFacts({
      filePath: "src/lib.rs",
      language: "rust",
      sourceText: `mod map;\nmod broken`
    });
    const importFacts = extractRustFileFacts({
      filePath: "src/map.rs",
      language: "rust",
      sourceText: `use crate::value::Value;\nuse crate::broken::Other`
    });

    expect(enumFacts.rustProjectFacts?.declarations ?? []).toEqual([]);
    expect(moduleFacts.rustProjectFacts?.modules ?? []).toEqual([]);
    expect(importFacts.rustProjectFacts?.imports ?? []).toEqual([]);
  });

  it("suppresses all Rust crate imports when any direct use candidate is unsafe", () => {
    for (const [description, unsafeUse] of [
      ["malformed group", `use crate::value::{Value`],
      ["incomplete alias", `use crate::value::Value as`],
      ["attributed alias", `#[allow(unused_imports)]\nuse crate::value::Value as Alias;`],
      ["unknown direct use", `use crate::value;`]
    ] as const) {
      const facts = extractRustFileFacts({
        filePath: "src/map.rs",
        language: "rust",
        sourceText: `use crate::value::Value;\n${unsafeUse}`
      });
      expect(facts.rustProjectFacts?.imports ?? [], description).toEqual(
        description === "attributed alias"
          ? [expect.objectContaining({ modulePath: ["value"], importedName: "Value" })]
          : []
      );
    }
  });

  it("keeps Rust project facts through unrelated direct macro recovery", () => {
    const recoveryPrefix = `macro_rules! overflow {
    ($value:expr) => { $value % 10 };
}`;
    const rootFacts = extractRustFileFacts({
      filePath: "src/lib.rs",
      language: "rust",
      sourceText: `${recoveryPrefix}\nmod map;`
    });
    const importFacts = extractRustFileFacts({
      filePath: "src/map.rs",
      language: "rust",
      sourceText: `${recoveryPrefix}\nuse crate::value::Value;`
    });
    const enumFacts = extractRustFileFacts({
      filePath: "src/value.rs",
      language: "rust",
      sourceText: `${recoveryPrefix}\npub enum Value { Unit }`
    });

    expect(rootFacts.rustProjectFacts?.modules).toEqual([
      expect.objectContaining({ name: "map" })
    ]);
    expect(importFacts.rustProjectFacts?.imports).toEqual([
      expect.objectContaining({ modulePath: ["value"], importedName: "Value" })
    ]);
    expect(enumFacts.rustProjectFacts?.declarations).toEqual([
      expect.objectContaining({ name: "Value", kind: "type" })
    ]);
  });

  it("fails closed for Rust project facts under direct conditional inner attributes", () => {
    for (const [attribute, filePath, declaration] of [
      [`#![cfg(test)]`, "src/lib.rs", `mod map;`],
      [`#![cfg_attr(test, allow(dead_code))]`, "src/lib.rs", `mod map;`],
      [`#![cfg(test)]`, "src/map.rs", `use crate::value::Value;`],
      [
        `#![cfg_attr(test, allow(dead_code))]`,
        "src/map.rs",
        `use crate::value::Value;`
      ],
      [`#![cfg(test)]`, "src/de.rs", `pub fn from_str() { helper(); }\nfn helper() {}`],
      [
        `#![cfg_attr(test, allow(dead_code))]`,
        "src/de.rs",
        `pub fn from_str() { helper(); }\nfn helper() {}`
      ]
    ] as const) {
      const facts = extractRustFileFacts({
        filePath,
        language: "rust",
        sourceText: `${attribute}\n${declaration}`
      });

      expect(facts.rustProjectFacts, `${attribute} ${filePath}`).toBeUndefined();
      if (filePath === "src/de.rs") {
        const fromStr = functionByName(facts, "from_str");
        const helper = functionByName(facts, "helper");
        expect(fromStr).toMatchObject({
          qualifiedName: "src/de.rs#from_str",
          kind: "function"
        });
        expect(facts.edges).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sourceId: fromStr.id,
              targetId: helper.id,
              kind: "calls",
              resolution: "exact"
            })
          ])
        );
      }
    }
  });

  it("does not resolve a Rust project import when another direct use is malformed", async () => {
    const projectPath = await createPersistedProject("src/lib.rs", `mod map;\nmod value;`);
    await writeFile(
      resolve(projectPath, "src", "map.rs"),
      `use crate::value::Value;\nuse crate::value::{Value`,
      "utf8"
    );
    await writeFile(resolve(projectPath, "src", "value.rs"), "pub enum Value { Unit }\n", "utf8");
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    expect(
      store
        .getSnapshot(projectPath)
        .edges.filter((edge) => edge.filePath === "src/map.rs" && edge.kind === "imports")
    ).toEqual([]);
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
