import { describe, expect, it } from "vitest";

import {
  classifyTestFile,
  findAffectedTestPaths,
  findEvidencePath,
  findSymbols,
  getCallees,
  getCallers,
  getImpactPaths,
  getRoutes,
  matchSymbol,
  type GraphEdge,
  type SymbolNode
} from "../../../src/domain/index.js";

function symbol(input: {
  readonly id: string;
  readonly name: string;
  readonly filePath?: string;
  readonly startLine?: number;
  readonly kind?: SymbolNode["kind"];
}): SymbolNode {
  const filePath = input.filePath ?? "src/example.ts";
  const startLine = input.startLine ?? 1;
  const kind = input.kind ?? "function";
  return {
    id: input.id,
    name: input.name,
    qualifiedName:
      kind === "file"
        ? filePath
        : kind === "route"
          ? `${filePath}#route:${input.name}`
          : `${filePath}#${input.name}`,
    kind,
    filePath,
    range: {
      start: { line: startLine, column: 1 },
      end: { line: startLine + 1, column: 20 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
}

function edge(input: {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string | null;
  readonly kind?: GraphEdge["kind"];
  readonly resolution?: GraphEdge["resolution"];
}): GraphEdge {
  return {
    id: input.id,
    sourceId: input.sourceId,
    targetId: input.targetId,
    kind: input.kind ?? "calls",
    filePath: "src/example.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 4 }
    },
    resolution: input.resolution ?? "exact",
    confidence: input.resolution === "heuristic" ? 0.7 : 1,
    referenceName: null
  };
}

describe("pure graph traversal", () => {
  const changed = symbol({ id: "changed", name: "changed", startLine: 10 });
  const directCaller = symbol({ id: "direct", name: "callerDirect", startLine: 20 });
  const transitiveCaller = symbol({ id: "transitive", name: "callerTransitive", startLine: 30 });
  const duplicateOne = symbol({ id: "duplicate-one", name: "duplicate", filePath: "src/a.ts" });
  const duplicateTwo = symbol({ id: "duplicate-two", name: "duplicate", filePath: "src/b.ts" });
  const graph = {
    symbols: [transitiveCaller, duplicateTwo, changed, directCaller, duplicateOne],
    edges: [
      edge({ id: "direct-calls-changed", sourceId: "direct", targetId: "changed" }),
      edge({ id: "transitive-calls-direct", sourceId: "transitive", targetId: "direct" }),
      edge({ id: "cycle", sourceId: "changed", targetId: "transitive" }),
      edge({ id: "heuristic", sourceId: "direct", targetId: "changed", resolution: "heuristic" }),
      edge({ id: "unresolved", sourceId: "direct", targetId: null, resolution: "unresolved" }),
      edge({ id: "contains", sourceId: "duplicate-one", targetId: "changed", kind: "contains" })
    ]
  };

  it("matches qualified names, source locations, and ambiguity deterministically", () => {
    expect(matchSymbol(graph, changed.qualifiedName)).toMatchObject({
      status: "exact",
      symbol: { id: "changed" }
    });
    expect(matchSymbol(graph, "src/example.ts:10")).toMatchObject({
      status: "exact",
      symbol: { id: "changed" }
    });
    expect(matchSymbol(graph, "duplicate")).toMatchObject({
      status: "ambiguous",
      candidates: [{ id: "duplicate-one" }, { id: "duplicate-two" }]
    });
  });

  it("finds symbols with deterministic filtering", () => {
    expect(findSymbols(graph, "caller").map((item) => item.id)).toEqual([
      "direct",
      "transitive"
    ]);
    expect(findSymbols(graph, "", { limit: 1 })).toEqual([]);
  });

  it("returns resolved caller and callee evidence while skipping unresolved edges", () => {
    expect(getCallers(graph, "changed").map((relation) => relation.edge.id)).toEqual([
      "direct-calls-changed",
      "heuristic"
    ]);
    expect(getCallees(graph, "direct").map((relation) => relation.symbol.id)).toEqual([
      "changed",
      "changed"
    ]);
  });

  it("treats literal routes as static bindings for callers, callees, evidence, and impact", () => {
    const handler = symbol({ id: "handler", name: "handler", filePath: "src/handlers.ts", startLine: 30 });
    const localRoute = symbol({
      id: "local-route",
      name: "GET /health",
      filePath: "src/routes.ts",
      startLine: 10,
      kind: "route"
    });
    const unresolvedRoute = symbol({
      id: "unresolved-route",
      name: "POST /unknown",
      filePath: "src/routes.ts",
      startLine: 20,
      kind: "route"
    });
    const routeGraph = {
      symbols: [handler, unresolvedRoute, localRoute],
      edges: [
        edge({ id: "health-routes-handler", sourceId: "local-route", targetId: "handler", kind: "routes" }),
        edge({
          id: "unknown-routes-handler",
          sourceId: "unresolved-route",
          targetId: null,
          kind: "routes",
          resolution: "unresolved"
        })
      ]
    };

    expect(getRoutes(routeGraph)).toEqual([
      {
        method: "GET",
        path: "/health",
        route: localRoute,
        edge: routeGraph.edges[0],
        handler
      },
      {
        method: "POST",
        path: "/unknown",
        route: unresolvedRoute,
        edge: routeGraph.edges[1],
        handler: null
      }
    ]);
    expect(getCallers(routeGraph, "handler").map((relation) => relation.edge.id)).toEqual([
      "health-routes-handler"
    ]);
    expect(getCallees(routeGraph, "local-route").map((relation) => relation.symbol.id)).toEqual([
      "handler"
    ]);
    expect(findEvidencePath(routeGraph, "local-route", "handler").path?.edges.map((item) => item.id)).toEqual([
      "health-routes-handler"
    ]);
    expect(getImpactPaths(routeGraph, "handler", 1).map((path) => path.symbols.at(-1)?.id)).toEqual([
      "local-route"
    ]);
  });

  it("rejects malformed persisted route names that do not have slash-leading paths", () => {
    const malformedRoute = symbol({
      id: "malformed-route",
      name: "GET *",
      filePath: "src/routes.ts",
      kind: "route"
    });
    const handler = symbol({ id: "handler", name: "handler", filePath: "src/handlers.ts" });

    expect(
      getRoutes({
        symbols: [malformedRoute, handler],
        edges: [
          edge({
            id: "malformed-route-edge",
            sourceId: "malformed-route",
            targetId: "handler",
            kind: "routes"
          })
        ]
      })
    ).toEqual([]);
  });

  it("preserves whitespace and newline escapes in literal route paths", () => {
    const trailingSpaceRoute = symbol({
      id: "trailing-space-route",
      name: "GET /audit ",
      filePath: "src/routes.ts",
      kind: "route"
    });
    const multilineRoute = symbol({
      id: "multiline-route",
      name: "POST /audit\nnext",
      filePath: "src/routes.ts",
      kind: "route"
    });
    const handler = symbol({ id: "handler", name: "handler", filePath: "src/handlers.ts" });

    expect(
      getRoutes({
        symbols: [trailingSpaceRoute, multilineRoute, handler],
        edges: [
          edge({
            id: "trailing-space-route-edge",
            sourceId: "trailing-space-route",
            targetId: "handler",
            kind: "routes"
          }),
          edge({
            id: "multiline-route-edge",
            sourceId: "multiline-route",
            targetId: "handler",
            kind: "routes"
          })
        ]
      }).map((route) => [route.method, route.path])
    ).toEqual([
      ["GET", "/audit "],
      ["POST", "/audit\nnext"]
    ]);
  });

  it("walks reverse call dependencies without cycles and honors depth", () => {
    expect(getImpactPaths(graph, "changed", 1).map((path) => path.symbols.at(-1)?.id)).toEqual([
      "direct"
    ]);
    expect(getImpactPaths(graph, "changed", 2).map((path) => path.symbols.at(-1)?.id)).toEqual([
      "direct",
      "transitive"
    ]);
    expect(() => getImpactPaths(graph, "changed", 0)).toThrow("positive integer");
  });

  it("finds exact affected test-file paths through imports and barrel exports", () => {
    const changedFile = symbol({ id: "changed-file", name: "math.ts", filePath: "src/math.ts", kind: "file" });
    const barrelFile = symbol({ id: "barrel-file", name: "index.ts", filePath: "src/index.ts", kind: "file" });
    const directTest = symbol({ id: "direct-test", name: "math.test.ts", filePath: "test/math.test.ts", kind: "file" });
    const reexportTest = symbol({
      id: "reexport-test",
      name: "math.spec.ts",
      filePath: "tests/math.spec.ts",
      kind: "file"
    });
    const heuristicTest = symbol({
      id: "heuristic-test",
      name: "math.test.ts",
      filePath: "test/heuristic.test.ts",
      kind: "file"
    });
    const routeOnlyTest = symbol({
      id: "route-only-test",
      name: "route-only.test.ts",
      filePath: "test/route-only.test.ts",
      kind: "file"
    });
    const affectedGraph = {
      symbols: [routeOnlyTest, heuristicTest, reexportTest, directTest, barrelFile, changedFile],
      edges: [
        edge({ id: "barrel-exports-math", sourceId: "barrel-file", targetId: "changed-file", kind: "exports" }),
        edge({ id: "direct-imports-math", sourceId: "direct-test", targetId: "changed-file", kind: "imports" }),
        edge({ id: "test-imports-barrel", sourceId: "reexport-test", targetId: "barrel-file", kind: "imports" }),
        edge({ id: "route-only-binding", sourceId: "route-only-test", targetId: "changed-file", kind: "routes" }),
        edge({
          id: "heuristic-import",
          sourceId: "heuristic-test",
          targetId: "changed-file",
          kind: "imports",
          resolution: "heuristic"
        })
      ]
    };

    const result = findAffectedTestPaths(affectedGraph, "changed-file", {
      maxDepth: 2,
      maxResults: 5,
      maxVisitedFiles: 20
    });

    expect(result).toMatchObject({
      resultLimitReached: false,
      traversalTruncated: false,
      depthLimitReached: false
    });
    expect(result.paths.map((path) => path.symbols.at(-1)?.filePath)).toEqual([
      "test/math.test.ts",
      "tests/math.spec.ts"
    ]);
    expect(result.paths[1]?.edges.map((item) => item.kind)).toEqual(["exports", "imports"]);
    expect(classifyTestFile("test/math.test.ts")).toBe("test-directory");
    expect(classifyTestFile("src/math.test.ts")).toBe("test-file-name");
    expect(classifyTestFile("src/math.ts")).toBeNull();

    expect(
      findAffectedTestPaths(affectedGraph, "changed-file", {
        maxDepth: 1,
        maxResults: 5,
        maxVisitedFiles: 20
      })
    ).toMatchObject({
      paths: [expect.objectContaining({ symbols: expect.arrayContaining([expect.objectContaining({ id: "changed-file" })]) })],
      depthLimitReached: true
    });
    expect(
      findAffectedTestPaths(affectedGraph, "changed-file", {
        maxDepth: 2,
        maxResults: 1,
        maxVisitedFiles: 20
      })
    ).toMatchObject({ resultLimitReached: true });
    expect(
      findAffectedTestPaths(affectedGraph, "changed-file", {
        maxDepth: 2,
        maxResults: 5,
        maxVisitedFiles: 1
      })
    ).toMatchObject({ paths: [], traversalTruncated: true });
  });

  it("continues through conventionally classified test helpers to later tests", () => {
    const changedFile = symbol({ id: "changed-file", name: "math.ts", filePath: "src/math.ts", kind: "file" });
    const helperFile = symbol({ id: "helper-file", name: "helpers.ts", filePath: "test/helpers.ts", kind: "file" });
    const subjectTest = symbol({
      id: "subject-test",
      name: "subject.test.ts",
      filePath: "test/subject.test.ts",
      kind: "file"
    });
    const helperGraph = {
      symbols: [subjectTest, helperFile, changedFile],
      edges: [
        edge({ id: "helper-imports-changed", sourceId: "helper-file", targetId: "changed-file", kind: "imports" }),
        edge({ id: "subject-imports-helper", sourceId: "subject-test", targetId: "helper-file", kind: "imports" })
      ]
    };

    const result = findAffectedTestPaths(helperGraph, "changed-file", {
      maxDepth: 2,
      maxResults: 5,
      maxVisitedFiles: 20
    });

    expect(result).toMatchObject({
      resultLimitReached: false,
      traversalTruncated: false,
      depthLimitReached: false
    });
    expect(result.paths.map((path) => path.symbols.at(-1)?.filePath)).toEqual([
      "test/helpers.ts",
      "test/subject.test.ts"
    ]);
    expect(result.paths[1]?.edges.map((item) => item.id)).toEqual([
      "helper-imports-changed",
      "subject-imports-helper"
    ]);

    expect(
      findAffectedTestPaths(helperGraph, "helper-file", {
        maxDepth: 1,
        maxResults: 5,
        maxVisitedFiles: 20
      }).paths.map((path) => path.symbols.at(-1)?.filePath)
    ).toEqual(["test/helpers.ts", "test/subject.test.ts"]);
  });

  it("finds a deterministic shortest directed evidence path with aligned steps", () => {
    const from = symbol({ id: "from", name: "from", filePath: "src/from.ts" });
    const through = symbol({ id: "through", name: "through", filePath: "src/through.ts" });
    const target = symbol({ id: "target", name: "target", filePath: "src/target.ts" });
    const evidenceGraph = {
      symbols: [target, through, from],
      edges: [
        edge({ id: "through-target", sourceId: "through", targetId: "target" }),
        edge({ id: "from-through", sourceId: "from", targetId: "through" }),
        edge({ id: "from-target", sourceId: "from", targetId: "target" })
      ]
    };

    const result = findEvidencePath(evidenceGraph, "from", "target");

    expect(result.truncated).toBe(false);
    expect(result.path?.symbols.map((item) => item.id)).toEqual(["from", "target"]);
    expect(result.path?.edges.map((item) => item.id)).toEqual(["from-target"]);
    expect(
      result.path?.steps.map((step) => ({ from: step.from.id, to: step.to.id, edge: step.edge.id }))
    ).toEqual([{ from: "from", to: "target", edge: "from-target" }]);
    expect(findEvidencePath(evidenceGraph, "target", "from")).toEqual({
      path: null,
      truncated: false
    });
    expect(findEvidencePath(evidenceGraph, "from", "from", 0)).toMatchObject({
      truncated: false,
      path: { symbols: [{ id: "from" }], edges: [], steps: [] }
    });
  });

  it("returns no path without truncation when the hop bound blocks a longer route", () => {
    const from = symbol({ id: "from", name: "from", filePath: "src/from.ts" });
    const middle = symbol({ id: "middle", name: "middle", filePath: "src/middle.ts" });
    const target = symbol({ id: "target", name: "target", filePath: "src/target.ts" });
    const evidenceGraph = {
      symbols: [target, from, middle],
      edges: [
        edge({ id: "middle-target", sourceId: "middle", targetId: "target" }),
        edge({ id: "from-middle", sourceId: "from", targetId: "middle" })
      ]
    };

    expect(findEvidencePath(evidenceGraph, "from", "target", 1)).toEqual({
      path: null,
      truncated: false
    });
    expect(
      findEvidencePath(
        {
          symbols: [from, target],
          edges: [
            edge({
              id: "heuristic-only",
              sourceId: "from",
              targetId: "target",
              resolution: "heuristic"
            })
          ]
        },
        "from",
        "target"
      )
    ).toEqual({ path: null, truncated: false });
  });

  it("marks truncation only when the visit cap blocks an unvisited candidate", () => {
    const from = symbol({ id: "from", name: "from", startLine: 1 });
    const first = symbol({ id: "first", name: "first", startLine: 10 });
    const target = symbol({ id: "target", name: "target", startLine: 20 });
    const evidenceGraph = {
      symbols: [target, from, first],
      edges: [
        edge({ id: "first-cycle", sourceId: "first", targetId: "from" }),
        edge({ id: "from-target", sourceId: "from", targetId: "target" }),
        edge({ id: "from-first", sourceId: "from", targetId: "first" })
      ]
    };

    expect(findEvidencePath(evidenceGraph, "from", "target", 2, 2)).toEqual({
      path: null,
      truncated: true
    });
  });
});
