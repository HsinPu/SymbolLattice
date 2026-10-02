import { describe, expect, it } from "vitest";
import { projectPythonRegularPackageRelativeNamedImports } from "../../../src/application/resolvers/python-project-resolver.js";
import { extractFileFacts } from "../../../src/extraction/index.js";

function project(files: Readonly<Record<string, string>>) {
  const factsByFile = new Map(Object.entries(files).map(([filePath, sourceText]) =>
    [filePath, extractFileFacts({ filePath, sourceText, language: "python" })]));
  const fileSymbols = new Map([...factsByFile].map(([path, facts]) =>
    [path, facts.symbols.find(symbol => symbol.kind === "file")!]));
  const edges = projectPythonRegularPackageRelativeNamedImports({ factsByFile, fileSymbols,
    knownFilePaths: new Set(Object.keys(files)) }, (ruleId, stage, candidateSymbolIds, configurationPaths, resolutionPath) =>
    ({ ruleId, stage, candidateSymbolIds, configurationPaths, resolutionPath }));
  return { edges, factsByFile };
}
const target = "class Base:\n    def handle_error(self):\n        return 1\n";
const child = (statement: string, name = "Base") => `${statement}\nclass Child(${name}):\n    def run(self):\n        return self.handle_error()\n`;
const files = { "src/pkg/__init__.py": "", "src/pkg/deep/__init__.py": "", "src/pkg/deep/base.py": target };

describe("one-dot Python imports through regular subpackages", () => {
  it.each([
    ["from .deep.base import Base", "Base"],
    ["from .deep.base import Base as Parent", "Parent"],
    ["from .deep.base import (Base as Parent,)", "Parent"]
  ])("verifies the complete module range, package witnesses and written base: %s", (statement, name) => {
    const { edges, factsByFile } = project({ ...files, "src/pkg/child.py": child(statement, name) });
    expect(factsByFile.get("src/pkg/child.py")!.pythonFacts?.relativeNamedImports).toEqual([
      expect.objectContaining({ moduleName: "deep.base", localName: name,
        range: { start: { line: 1, column: 6 }, end: { line: 1, column: 16 } } })
    ]);
    expect(edges.map(edge => edge.kind)).toEqual(["imports", "extends"]);
    const base = factsByFile.get("src/pkg/deep/base.py")!.symbols.find(symbol => symbol.kind === "class")!;
    expect(edges[1]).toMatchObject({ targetId: base.id, referenceName: name, resolution: "exact", confidence: 1,
      evidence: { candidateSymbolIds: [base.id], configurationPaths: ["src/pkg/__init__.py", "src/pkg/deep/__init__.py"],
        resolutionPath: ["src/pkg/child.py", "src/pkg/deep/base.py"] } });
    expect(edges[0]).toMatchObject({ referenceName: ".deep.base", evidence: { configurationPaths: edges[1]!.evidence!.configurationPaths } });
    expect(factsByFile.get("src/pkg/child.py")!.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "self.handle_error", targetId: null, resolution: "unresolved", confidence: 0 })
    ]));
  });

  it.each([
    ["missing current package", { "src/pkg/deep/__init__.py": "", "src/pkg/deep/base.py": target }],
    ["intermediate file/package collision", { ...files, "src/pkg/deep.py": "" }],
    ["target file/package collision", { ...files, "src/pkg/deep/base/__init__.py": target }],
    ["rebound target", { ...files, "src/pkg/deep/base.py": target + "Base = replacement\n" }],
    ["dynamic target", { ...files, "src/pkg/deep/base.py": target + "exec(code)\n" }],
    ["duplicate declaration", { ...files, "src/pkg/deep/base.py": target + "class Base:\n    pass\n" }]
  ])("does not invent inheritance for %s", (_, modified) => {
    expect(project({ ...modified, "src/pkg/child.py": child("from .deep.base import Base") }).edges
      .filter(edge => edge.kind === "extends")).toEqual([]);
  });

  it("cites unmarked subdirectories below a regular ancestor without resolving calls or construction", () => {
    const { edges } = project({ "src/pkg/__init__.py": "", "src/pkg/deep/base.py": target,
      "src/pkg/deep/child.py": child("from .base import Base") + "\ndef construct():\n    return Base()\n" });
    expect(edges.map(edge => edge.kind)).toEqual(["imports", "extends"]);
    expect(edges[1]).toMatchObject({ evidence: { ruleId: "module.python.anchored-relative-named-import.unique-top-level-class-inheritance",
      configurationPaths: ["src/pkg/__init__.py"], unmarkedPackagePaths: ["src/pkg/deep"] } });
    expect(edges[0]).toMatchObject({ evidence: { ruleId: "module.python.anchored-relative-named-base-import",
      unmarkedPackagePaths: ["src/pkg/deep"] } });
    expect(project({ "src/pkg/deep/base.py": target, "src/pkg/deep/child.py": child("from .base import Base") }).edges).toEqual([]);
  });

  it.each([
    "from ..deep.base import Base", "from .deep.base import *", "from .deep.base import (Base as)",
    "from .deep.base import Base\nBase = replacement", "from .deep.base import Base\nexec(code)",
    "from .deep.base import Base\nfrom external import Base"
  ])("preserves exclusions and binding safety: %s", statement => {
    expect(project({ ...files, "src/pkg/child.py": child(statement) }).edges.filter(edge => edge.kind === "extends")).toEqual([]);
  });
});
