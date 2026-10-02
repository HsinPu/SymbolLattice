import { describe, expect, it } from "vitest";
import { inheritedSourceLookup } from "../../src/application/explore-inherited-source.js";
import { supplementOmittedCallDeclarations } from "../../src/application/explore-omitted-declarations.js";
import { planExploreQuery } from "../../src/application/explore-query.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";

function fixture() {
  const node = (id: string, name: string, filePath: string, kind: SymbolNode["kind"]): SymbolNode => ({
    id, name, filePath, kind, qualifiedName: `${filePath}#${name}`, isExported: false,
    range: { start: { line: 1, column: 1 }, end: { line: 20, column: 1 } }
  });
  const source = node("source", "alpha", "wrapper.py", "method"), declaration = node("decl", "temporary_connection", "base.py", "method");
  const callerClass = node("caller", "Wrapper", source.filePath, "class"), baseClass = node("base", "Base", declaration.filePath, "class");
  const edge = (id: string, kind: GraphEdge["kind"], sourceId: string, targetId: string): GraphEdge => ({
    id, kind, sourceId, targetId, filePath: source.filePath, confidence: 1, resolution: "exact",
    range: { start: { line: 3, column: 1 }, end: { line: 3, column: 20 } }
  });
  const path = [source.filePath, declaration.filePath];
  const call: GraphEdge = { ...edge("call", "calls", source.id, declaration.id), targetId: null, resolution: "unresolved", confidence: 0,
    referenceName: "self.temporary_connection", evidence: { stage: "syntax", ruleId: "syntax.python.member-call.unknown-receiver" } };
  const edges: GraphEdge[] = [edge("caller-contains", "contains", callerClass.id, source.id),
    { ...edge("base-contains", "contains", baseClass.id, declaration.id), filePath: declaration.filePath },
    { ...edge("extends", "extends", callerClass.id, baseClass.id), referenceName: "Base",
      evidence: { stage: "module", ruleId: "module.python.regular-package.absolute-named-import.unique-top-level-class-inheritance", resolutionPath: path } },
    { ...edge("import", "imports", "source-file", "base-file"), referenceName: "base",
      evidence: { stage: "module", ruleId: "module.python.regular-package.absolute-named-base-import", resolutionPath: path } }];
  const graph = { symbols: [source, declaration, callerClass, baseClass,
    node("source-file", "wrapper.py", source.filePath, "file"), node("base-file", "base.py", declaration.filePath, "file")], edges };
  return { graph, source, declaration, call };
}

describe("bounded direct-base source witnesses", () => {
  it("accepts a paired relative import and inheritance proof but rejects mixed provenance", () => {
    const f = fixture();
    f.graph.edges[2] = { ...f.graph.edges[2]!, evidence: { ...f.graph.edges[2]!.evidence!,
      ruleId: "module.python.regular-package.relative-named-import.unique-top-level-class-inheritance" } };
    expect(inheritedSourceLookup(f.graph)(f.source, f.call, f.declaration)).toBeUndefined();
    f.graph.edges[3] = { ...f.graph.edges[3]!, evidence: { ...f.graph.edges[3]!.evidence!,
      ruleId: "module.python.regular-package.relative-named-import" }, referenceName: ".base" };
    expect(inheritedSourceLookup(f.graph)(f.source, f.call, f.declaration)?.importEdge.id).toBe("import");
    expect(f.call).toMatchObject({ targetId: null, confidence: 0, resolution: "unresolved" });
  });
  it("requires matching regular anchors and unmarked paths for anchored source context", () => {
    const f = fixture();
    f.graph.edges[2] = { ...f.graph.edges[2]!, evidence: { ...f.graph.edges[2]!.evidence!,
      ruleId: "module.python.anchored-relative-named-import.unique-top-level-class-inheritance",
      configurationPaths: ["pkg/__init__.py"], unmarkedPackagePaths: ["pkg/namespace"] } };
    f.graph.edges[3] = { ...f.graph.edges[3]!, evidence: { ...f.graph.edges[3]!.evidence!,
      ruleId: "module.python.anchored-relative-named-base-import", configurationPaths: ["pkg/__init__.py"],
      unmarkedPackagePaths: ["pkg/other"] } };
    expect(inheritedSourceLookup(f.graph)(f.source, f.call, f.declaration)).toBeUndefined();
    f.graph.edges[3] = { ...f.graph.edges[3]!, evidence: { ...f.graph.edges[3]!.evidence!, unmarkedPackagePaths: ["pkg/namespace"] } };
    expect(inheritedSourceLookup(f.graph)(f.source, f.call, f.declaration)?.importEdge.id).toBe("import");
  });
  it("adds source through a complete chain while retaining the unresolved call and zero ranking contribution", () => {
    const f = fixture();
    const plan = planExploreQuery({ symbols: [f.source], edges: [] }, "alpha bravo charlie delta echo foxtrot golf hotel temporary connection");
    const calls = new Map([[f.source.id, { state: "available" as const, items: [f.call], truncated: false }]]);
    const result = supplementOmittedCallDeclarations(f.graph, plan, calls);
    expect(result.selection.at(-1)?.symbol.id).toBe(f.declaration.id);
    expect(result.selection.at(-1)?.omittedQueryDeclaration).toMatchObject({ scope: "inspected-inherited-source",
      call: { resolution: "unresolved", targetId: null, confidence: 0 }, inheritedSource: {
        callerContainment: { id: "caller-contains" }, inheritance: { id: "extends" },
        declarationContainment: { id: "base-contains" }, importEdge: { id: "import" } } });
    expect(result.selection.at(-1)?.graphDiffusion.rankingContribution).toBe(0);
    expect(result.selection.at(-1)?.score).toBe(0);
    expect(f.call.targetId).toBeNull();
  });

  it.each([0, 1, 2, 3])("rejects a missing chain edge %i", index => {
    const f = fixture(); f.graph.edges.splice(index, 1);
    expect(inheritedSourceLookup(f.graph)(f.source, f.call, f.declaration)).toBeUndefined();
  });

  it.each([0, 1, 2, 3])("rejects heuristic chain edge %i", index => {
    const f = fixture(); f.graph.edges[index] = { ...f.graph.edges[index]!, resolution: "heuristic" };
    expect(inheritedSourceLookup(f.graph)(f.source, f.call, f.declaration)).toBeUndefined();
  });

  it("rejects unknown receiver, different leaf, a second base, broken ownership and mismatched import paths", () => {
    for (const name of ["other.temporary_connection", "self.other", "self.connection.temporary_connection"]) {
      const f = fixture(); expect(inheritedSourceLookup(f.graph)(f.source, { ...f.call, referenceName: name }, f.declaration)).toBeUndefined();
    }
    const multi = fixture(); multi.graph.edges.push({ ...multi.graph.edges[2]!, id: "second-base" });
    expect(inheritedSourceLookup(multi.graph)(multi.source, multi.call, multi.declaration)).toBeUndefined();
    const broken = fixture(); broken.graph.edges[0] = { ...broken.graph.edges[0]!, sourceId: "missing-class" };
    expect(inheritedSourceLookup(broken.graph)(broken.source, broken.call, broken.declaration)).toBeUndefined();
    const path = fixture(); path.graph.edges[3] = { ...path.graph.edges[3]!, evidence: { ...path.graph.edges[3]!.evidence!, resolutionPath: ["other.py", "base.py"] } };
    expect(inheritedSourceLookup(path.graph)(path.source, path.call, path.declaration)).toBeUndefined();
  });
});
