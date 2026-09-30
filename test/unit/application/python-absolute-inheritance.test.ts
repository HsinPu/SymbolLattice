import { describe, expect, it } from "vitest";
import { projectPythonRegularPackageRelativeNamedImports } from "../../../src/application/resolvers/python-project-resolver.js";
import { extractFileFacts } from "../../../src/extraction/index.js";

const rule = "module.python.regular-package.absolute-named-import.unique-top-level-class-inheritance";
function resolve(files: Readonly<Record<string, string>>) {
  const factsByFile = new Map(Object.entries(files).map(([filePath, sourceText]) =>
    [filePath, extractFileFacts({ filePath, sourceText, language: "python" })]));
  const fileSymbols = new Map([...factsByFile].map(([path, facts]) =>
    [path, facts.symbols.find(symbol => symbol.kind === "file")!]));
  const edges = projectPythonRegularPackageRelativeNamedImports({ factsByFile, fileSymbols,
    knownFilePaths: new Set(Object.keys(files)) }, (ruleId, stage, candidateSymbolIds, configurationPaths, resolutionPath) =>
    ({ ruleId, stage, candidateSymbolIds, configurationPaths, resolutionPath }));
  return { edges, factsByFile };
}
const base = { "pkg/__init__.py": "", "pkg/base.py": "class Base:\n    def acquire(self):\n        return 1\n" };
const child = (importText: string, name = "Base") => `${importText}\nclass Child(${name}):\n    def run(self):\n        return self.acquire()\n`;

describe("Python written absolute imported bases", () => {
  it("shares one file-import witness for multiple bases in one statement", () => {
    const { edges } = resolve({ "pkg/__init__.py": "", "pkg/base.py": "class First:\n    pass\nclass Second:\n    pass\n",
      "child.py": "from pkg.base import First, Second\nclass One(First):\n    pass\nclass Two(Second):\n    pass\n" });
    expect(edges.filter(edge => edge.kind === "imports")).toHaveLength(1);
    expect(edges.filter(edge => edge.kind === "extends")).toHaveLength(2);
  });
  it.each([
    ["from pkg.base import Base", "Base"],
    ["from pkg.base import Other, Base", "Base"],
    ["from pkg.base import Base as Parent, Other", "Parent"],
    ["from pkg.base import (Other,\n    Base as Parent,\n)", "Parent"]
  ])("preserves source paths, package witnesses and unresolved member calls: %s", (statement, name) => {
    const { edges, factsByFile } = resolve({ ...base, "pkg/child.py": child(statement, name) });
    const heritage = edges.filter(edge => edge.evidence?.ruleId === rule);
    expect(heritage).toHaveLength(1);
    const target = factsByFile.get("pkg/base.py")!.symbols.find(symbol => symbol.name === "Base")!;
    expect(heritage[0]).toMatchObject({ kind: "extends", referenceName: name, targetId: target.id,
      resolution: "exact", confidence: 1, evidence: { candidateSymbolIds: [target.id],
        configurationPaths: ["pkg/__init__.py"], resolutionPath: ["pkg/child.py", "pkg/base.py"] } });
    expect(edges.filter(edge => edge.kind === "calls" || edge.kind === "instantiates")).toEqual([]);
    expect(factsByFile.get("pkg/child.py")!.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "calls", referenceName: "self.acquire", targetId: null,
        resolution: "unresolved", confidence: 0 })
    ]));
    expect(edges.filter(edge => edge.kind === "imports")).toHaveLength(1);
  });

  it.each([
    ["rebound", child("from pkg.base import Base") + "Base = object\n"],
    ["duplicate binding", child("from pkg.base import Base, Base")],
    ["conditional import", "if flag:\n    from pkg.base import Base\nclass Child(Base):\n    pass\n"],
    ["wildcard", child("from pkg.base import Base\nfrom other import *")],
    ["decorated child", "from pkg.base import Base\n@decorate\nclass Child(Base):\n    pass\n"],
    ["multiple bases", "from pkg.base import Base\nclass Child(Base, Other):\n    pass\n"],
    ["qualified base", "from pkg.base import Base\nclass Child(Base.Nested):\n    pass\n"],
    ["computed base", "from pkg.base import Base\nclass Child(factory(Base)):\n    pass\n"],
    ["dynamic globals", child("from pkg.base import Base") + "exec(code)\n"],
    ["external target", child("from external.base import Base")],
    ["module alias", "import pkg.base as module\nclass Child(module.Base):\n    pass\n"]
  ])("does not invent a base relationship for %s", (_, source) => {
    expect(resolve({ ...base, "pkg/child.py": source }).edges.filter(edge => edge.evidence?.ruleId === rule)).toEqual([]);
  });

  it.each([
    ["namespace package", { "pkg/base.py": base["pkg/base.py"] }],
    ["file/package ambiguity", { ...base, "pkg/base/__init__.py": "class Base:\n    pass\n" }],
    ["rebound target", { ...base, "pkg/base.py": base["pkg/base.py"] + "Base = object\n" }],
    ["decorated target", { ...base, "pkg/base.py": "@decorate\nclass Base:\n    pass\n" }],
    ["dynamic target", { ...base, "pkg/base.py": base["pkg/base.py"] + "exec(code)\n" }],
    ["function target", { ...base, "pkg/base.py": "def Base():\n    pass\n" }]
  ])("rejects unsupported target identity: %s", (_, files) => {
    expect(resolve({ ...files, "pkg/child.py": child("from pkg.base import Base") }).edges).toEqual([]);
  });

  it("requires all nested package markers and accepts a direct package declaration", () => {
    const files = { "pkg/__init__.py": "", "pkg/nested/__init__.py": "class Base:\n    pass\n",
      "child.py": child("from pkg.nested import Base") };
    expect(resolve(files).edges.filter(edge => edge.evidence?.ruleId === rule)).toHaveLength(1);
    expect(resolve({ "pkg/nested/__init__.py": files["pkg/nested/__init__.py"], "child.py": files["child.py"] }).edges).toEqual([]);
  });
  it("does not reinterpret compiler future directives as project class imports", () => {
    expect(resolve({ "__future__.py": "class annotations:\n    pass\n",
      "child.py": "from __future__ import annotations\nclass Child(annotations):\n    pass\n" }).edges).toEqual([]);
  });
});
