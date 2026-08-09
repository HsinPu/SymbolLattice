import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createInlineProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-python-b2-"));
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
        [providers?.id, helper?.id].sort(),
        [base?.id, providers?.id].sort()
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
});
