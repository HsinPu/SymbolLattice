import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("TypeScript and JavaScript extraction", () => {
  it("collects declarations, containment, module references, and direct calls", () => {
    const facts = extractFileFacts({
      filePath: "src/consumer.ts",
      language: "typescript",
      sourceText: `
        import { add } from "./math.js";
        export interface Result { value: number }
        export function calculate(value: number): number {
          const local = add(value, 1);
          return local;
        }
        export class Calculator {
          increment(value: number): number { return add(value, 1); }
        }
      `
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual(
      expect.arrayContaining([
        ["file", "consumer.ts"],
        ["interface", "Result"],
        ["function", "calculate"],
        ["variable", "local"],
        ["class", "Calculator"],
        ["method", "increment"]
      ])
    );
    expect(facts.symbols.find((symbol) => symbol.name === "calculate")?.isExported).toBe(true);
    expect(facts.edges.filter((edge) => edge.kind === "contains")).not.toHaveLength(0);
    const calculate = facts.symbols.find((symbol) => symbol.name === "calculate");
    const containment = facts.edges.find(
      (edge) => edge.kind === "contains" && edge.targetId === calculate?.id
    );
    expect(containment?.evidence).toEqual({
      ruleId: "syntax.containment",
      stage: "syntax",
      candidateSymbolIds: [calculate?.id]
    });
    expect(
      facts.pendingReferences.map((reference) => [reference.relationKind, reference.referenceName])
    ).toEqual(
      expect.arrayContaining([
        ["imports", "./math.js"],
        ["calls", "add"]
      ])
    );
    expect(facts.pendingReferences.find((reference) => reference.relationKind === "calls")?.range.start.line).toBeGreaterThan(1);
    expect(facts.importBindings).toEqual([
      expect.objectContaining({
        moduleSpecifier: "./math.js",
        localName: "add",
        importedName: "add"
      })
    ]);
  });

  it("preserves local and public names for explicit export aliases", () => {
    const facts = extractFileFacts({
      filePath: "src/math.ts",
      language: "typescript",
      sourceText: "const add = (left: number, right: number) => left + right; export { add as sum };"
    });

    expect(facts.symbols.find((symbol) => symbol.name === "add")?.isExported).toBe(true);
    expect(facts.exportBindings).toEqual([
      expect.objectContaining({ localName: "add", exportedName: "sum" })
    ]);
    expect(facts.reExportBindings).toEqual([]);
  });

  it("retains a namespace import as a non-declaration binding", () => {
    const facts = extractFileFacts({
      filePath: "src/consumer.ts",
      language: "typescript",
      sourceText: 'import * as math from "./math"; export const value = math();'
    });

    expect(facts.importBindings).toEqual([
      expect.objectContaining({ moduleSpecifier: "./math", localName: "math", importedName: "*" })
    ]);
  });

  it("does not mark a same-named local declaration as exported by a re-export", () => {
    const facts = extractFileFacts({
      filePath: "src/bridge.ts",
      language: "typescript",
      sourceText: "const sum = () => 1; export { add as sum } from './math.js';"
    });

    expect(facts.symbols.find((symbol) => symbol.name === "sum")?.isExported).toBe(false);
    expect(facts.exportBindings).toEqual([]);
  });

  it("retains named, wildcard, and namespace re-export facts for later module resolution", () => {
    const facts = extractFileFacts({
      filePath: "src/barrel.ts",
      language: "typescript",
      sourceText:
        'export { foo as bar, default as Foo } from "./named";\n' +
        'export * from "./wild";\n' +
        'export * as namespaceApi from "./namespace";'
    });

    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "exports")
        .map((reference) => reference.referenceName)
    ).toEqual(["./named", "./wild", "./namespace"]);
    expect(facts.exportBindings).toEqual([]);
    expect(facts.reExportBindings).toEqual([
      expect.objectContaining({
        kind: "named",
        moduleSpecifier: "./named",
        importedName: "foo",
        exportedName: "bar",
        range: {
          start: { line: 1, column: 10 },
          end: { line: 1, column: 20 }
        }
      }),
      expect.objectContaining({
        kind: "named",
        moduleSpecifier: "./named",
        importedName: "default",
        exportedName: "Foo",
        range: {
          start: { line: 1, column: 22 },
          end: { line: 1, column: 36 }
        }
      }),
      expect.objectContaining({
        kind: "wildcard",
        moduleSpecifier: "./wild",
        range: {
          start: { line: 2, column: 1 },
          end: { line: 2, column: 24 }
        }
      }),
      expect.objectContaining({
        kind: "namespace",
        moduleSpecifier: "./namespace",
        exportedName: "namespaceApi",
        range: {
          start: { line: 3, column: 8 },
          end: { line: 3, column: 25 }
        }
      })
    ]);
  });

  it("handles JavaScript and does not guess property dispatch", () => {
    const facts = extractFileFacts({
      filePath: "src/legacy.js",
      language: "javascript",
      sourceText: `
        export const twice = (value) => value * 2;
        export function total(value) { return twice(value); }
        total.call(null, 1);
      `
    });

    expect(facts.symbols.map((symbol) => symbol.name)).toEqual(
      expect.arrayContaining(["legacy.js", "twice", "total"])
    );
    expect(
      facts.pendingReferences.filter((reference) => reference.relationKind === "calls").map(
        (reference) => reference.referenceName
      )
    ).toEqual(["twice"]);
  });

  it("extracts syntax-proven static Express routes with literal paths and named handlers", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import express, { Router } from "express";',
        "const app = express();",
        "const router = Router();",
        "const requireAuth = () => undefined;",
        "function listUsers() { return undefined; }",
        "function createUser() { return undefined; }",
        'app.get("/users", listUsers);',
        'router.post("/users", requireAuth, createUser);'
      ].join("\n")
    });

    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    expect(routes.map((route) => [route.name, route.qualifiedName, route.isExported])).toEqual([
      ["GET /users", "src/routes.ts#route:GET /users", false],
      ["POST /users", "src/routes.ts#route:POST /users", false]
    ]);
    expect(routes.map((route) => route.range.start.line)).toEqual([7, 8]);

    const routeReferences = facts.pendingReferences.filter(
      (reference) => reference.relationKind === "routes"
    );
    expect(routeReferences.map((reference) => [reference.referenceName, reference.range])).toEqual([
      [
        "listUsers",
        {
          start: { line: 7, column: 19 },
          end: { line: 7, column: 28 }
        }
      ],
      [
        "createUser",
        {
          start: { line: 8, column: 36 },
          end: { line: 8, column: 46 }
        }
      ]
    ]);
    expect(routeReferences.map((reference) => reference.sourceId)).toEqual(routes.map((route) => route.id));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "contains" && routes.some((route) => route.id === edge.targetId))
        .map((edge) => edge.referenceName)
    ).toEqual(["GET /users", "POST /users"]);
  });

  it("accepts a namespace Express Router factory but only immutable direct receivers", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import * as express from "express";',
        "const router = express.Router();",
        "let mutable = express.Router();",
        "function health() { return undefined; }",
        'router.head("/health", health);',
        'mutable.get("/mutable", health);'
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "HEAD /health"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => reference.referenceName)
    ).toEqual(["health"]);
  });

  it("rejects receivers built from lexically shadowed Express factory imports", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import express, { Router } from "express";',
        'import * as expressNamespace from "express";',
        "function handler() { return undefined; }",
        "function shadowFactories(",
        "  express: () => unknown,",
        "  Router: () => unknown,",
        "  expressNamespace: { Router: () => unknown }",
        ") {",
        "  const shadowedApp = express();",
        "  const shadowedRouter = Router();",
        "  const shadowedNamespaceRouter = expressNamespace.Router();",
        '  shadowedApp.get("/shadowed-default", handler);',
        '  shadowedRouter.post("/shadowed-router", handler);',
        '  shadowedNamespaceRouter.patch("/shadowed-namespace", handler);',
        "}",
        "const app = express();",
        "const router = Router();",
        "const namespaceRouter = expressNamespace.Router();",
        'app.get("/proven-default", handler);',
        'router.post("/proven-router", handler);',
        'namespaceRouter.patch("/proven-namespace", handler);'
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "GET /proven-default",
      "POST /proven-router",
      "PATCH /proven-namespace"
    ]);
  });

  it("rejects Express factory imports that exist only in TypeScript type space", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import type express from "express";',
        'import type * as expressNamespace from "express";',
        'import type { Router } from "express";',
        'import { type Router as TypeOnlyRouter } from "express";',
        "function handler() { return undefined; }",
        "const defaultApp = express();",
        "const namespaceRouter = expressNamespace.Router();",
        "const router = Router();",
        "const aliasedRouter = TypeOnlyRouter();",
        'defaultApp.get("/type-default", handler);',
        'namespaceRouter.get("/type-namespace", handler);',
        'router.get("/type-router", handler);',
        'aliasedRouter.get("/type-alias", handler);'
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
  });

  it("rejects factory names shadowed by named function and class expressions", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import express from "express";',
        "const register = function express() {",
        "  const app = express();",
        "  function handler() { return undefined; }",
        '  app.get("/function-expression-shadow", handler);',
        "};",
        "const Container = class express {",
        "  static register() {",
        "    const app = express();",
        "    function handler() { return undefined; }",
        '    app.get("/class-expression-shadow", handler);',
        "  }",
        "};",
        "void register;",
        "void Container;"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
  });

  it("rejects unproven, dynamic, and nonterminal Express route shapes", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import express from "express";',
        'import other from "not-express";',
        "const app = express();",
        "const optionalFactory = express?.();",
        "const wrongModule = other();",
        'const legacy = require("express");',
        "const legacyApp = legacy();",
        "const unknown = { get: () => undefined };",
        "const controller = { handler: () => undefined };",
        "const handler = () => undefined;",
        "const path = \"/dynamic\";",
        'app.get("/real", handler);',
        'optionalFactory.get("/optional-factory", handler);',
        'app?.get("/optional-property", handler);',
        'app.get?.("/optional-call", handler);',
        "app.get(path, handler);",
        'app.get("health", handler);',
        'app.get("/inline", () => undefined);',
        'app.get("/member", controller.handler);',
        'app["get"]("/computed", handler);',
        'app.use("/mount", handler);',
        'wrongModule.get("/wrong-module", handler);',
        'legacyApp.get("/require", handler);',
        'unknown.get("/unknown", handler);',
        "{",
        "  const app = { get: () => undefined };",
        '  app.get("/shadowed", handler);',
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "GET /real"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => reference.referenceName)
    ).toEqual(["handler"]);
  });
});
