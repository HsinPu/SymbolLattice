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

  it("extracts direct TypeScript heritage identifiers with exact ranges and lexical scopes", () => {
    const facts = extractFileFacts({
      filePath: "src/heritage.ts",
      language: "typescript",
      sourceText: [
        'import type { ImportedBase, ImportedContract } from "./external.js";',
        "class LocalBase {}",
        "interface LocalContract {}",
        "class Derived extends LocalBase implements LocalContract, ImportedContract {}",
        "interface Child extends ImportedBase<string>, LocalContract {}"
      ].join("\n")
    });

    const derived = facts.symbols.find((symbol) => symbol.name === "Derived");
    const child = facts.symbols.find((symbol) => symbol.name === "Child");
    const heritageReferences = facts.pendingReferences.filter(
      (reference) => reference.relationKind === "extends" || reference.relationKind === "implements"
    );

    expect(
      heritageReferences.map((reference) => [
        reference.sourceId,
        reference.relationKind,
        reference.referenceName,
        reference.range
      ])
    ).toEqual([
      [
        derived?.id,
        "extends",
        "LocalBase",
        {
          start: { line: 4, column: 23 },
          end: { line: 4, column: 32 }
        }
      ],
      [
        derived?.id,
        "implements",
        "LocalContract",
        {
          start: { line: 4, column: 44 },
          end: { line: 4, column: 57 }
        }
      ],
      [
        derived?.id,
        "implements",
        "ImportedContract",
        {
          start: { line: 4, column: 59 },
          end: { line: 4, column: 75 }
        }
      ],
      [
        child?.id,
        "extends",
        "ImportedBase",
        {
          start: { line: 5, column: 25 },
          end: { line: 5, column: 37 }
        }
      ],
      [
        child?.id,
        "extends",
        "LocalContract",
        {
          start: { line: 5, column: 47 },
          end: { line: 5, column: 60 }
        }
      ]
    ]);

    const scopesByReferenceId = new Map(
      facts.referenceScopes.map((scope) => [scope.referenceId, scope.scopeIds])
    );
    for (const reference of heritageReferences) {
      const scopeIds = scopesByReferenceId.get(reference.id);
      expect(scopeIds).toBeDefined();
      expect(scopeIds?.at(-1)).toMatch(/^\d+:0:\d+$/);
    }
    expect(scopesByReferenceId.get(heritageReferences[0]?.id ?? "")).toEqual([
      expect.stringMatching(/^\d+:\d+:\d+$/),
      expect.stringMatching(/^\d+:0:\d+$/)
    ]);
  });

  it("rejects qualified, mixin, intersection, and non-identifier heritage shapes", () => {
    const unsupportedSources = [
      "class QualifiedBase extends Namespace.Base {}",
      "interface QualifiedContract extends Namespace.Contract {}",
      "class MixinBase extends mixin(Object) {}",
      "class DynamicBase extends resolveBase() {}",
      "class IntersectionContracts implements First & Second {}",
      "interface IntersectionContract extends First & Second {}",
      "class ArrayBase extends Base[] {}"
    ];

    for (const sourceText of unsupportedSources) {
      const facts = extractFileFacts({
        filePath: "src/unsupported-heritage.ts",
        language: "typescript",
        sourceText
      });
      expect(
        facts.pendingReferences.filter(
          (reference) => reference.relationKind === "extends" || reference.relationKind === "implements"
        )
      ).toEqual([]);
    }
  });

  it("records type/value namespaces and type-only module facts for heritage resolution", () => {
    const facts = extractFileFacts({
      filePath: "src/namespaces.ts",
      language: "typescript",
      sourceText: [
        'import type { ImportedContract } from "./contracts";',
        'export type { ImportedContract as PublicContract } from "./contracts";',
        "class Base {}",
        "interface Contract {}",
        "type Alias = { value: string };",
        "class Child extends Base implements Contract, Alias {}",
        "interface Generic<Contract> extends Contract {}"
      ].join("\n")
    });

    expect(facts.importBindings).toEqual([
      expect.objectContaining({
        localName: "ImportedContract",
        importedName: "ImportedContract",
        isTypeOnly: true
      })
    ]);
    expect(facts.reExportBindings).toEqual([
      expect.objectContaining({
        kind: "named",
        importedName: "ImportedContract",
        exportedName: "PublicContract",
        isTypeOnly: true
      })
    ]);
    expect(facts.localBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Base", space: "value" }),
        expect.objectContaining({ name: "Base", space: "type" }),
        expect.objectContaining({ name: "Contract", space: "type" }),
        expect.objectContaining({ name: "Alias", space: "type" }),
        expect.objectContaining({ name: "Contract", symbolId: null, space: "type" })
      ])
    );
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
