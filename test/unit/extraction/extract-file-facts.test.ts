import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("source extraction", () => {
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
        'app.trace("/not-an-express-method", handler);',
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

  it("extracts AST-proven React Router JSX navigation routes with direct component handlers", () => {
    const facts = extractFileFacts({
      filePath: "src/app-routes.tsx",
      language: "typescript",
      sourceText: [
        'import { Route as AppRoute } from "react-router-dom";',
        "function HomePage() { return <main>Home</main>; }",
        "function SettingsPage() { return <main>Settings</main>; }",
        "function LegacyPage() { return <main>Legacy</main>; }",
        "export function AppRoutes() {",
        "  return (",
        "    <>",
        '      <AppRoute path="/" element={<HomePage />} />',
        '      <AppRoute path={"/settings"} Component={SettingsPage} />',
        '      <AppRoute path="/legacy" component={LegacyPage} />',
        "    </>",
        "  );",
        "}"
      ].join("\n")
    });

    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    expect(routes.map((route) => route.name)).toEqual([
      "NAVIGATE /",
      "NAVIGATE /settings",
      "NAVIGATE /legacy"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([
      ["HomePage", "react-router"],
      ["SettingsPage", "react-router"],
      ["LegacyPage", "react-router"]
    ]);
  });

  it("extracts React Router JSX navigation routes in JavaScript source", () => {
    const facts = extractFileFacts({
      filePath: "src/app-routes.jsx",
      language: "javascript",
      sourceText: [
        'import { Route } from "react-router";',
        "function Page() { return <main>Page</main>; }",
        "export function AppRoutes() {",
        '  return <Route path="/jsx" element={<Page />} />;',
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /jsx"
    ]);
    expect(facts.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([
      expect.objectContaining({ referenceName: "Page", routeFramework: "react-router" })
    ]);
  });

  it("composes nested JSX relative and index routes through a pathless layout", () => {
    const facts = extractFileFacts({
      filePath: "src/app-routes.tsx",
      language: "typescript",
      sourceText: [
        'import { Route } from "react-router-dom";',
        "function Shell() { return <main />; }",
        "function DashboardPage() { return <main />; }",
        "function OverviewPage() { return <main />; }",
        "function SettingsPage() { return <main />; }",
        "function TabPage() { return <main />; }",
        "export function AppRoutes() {",
        "  return (",
        "    <Route element={<Shell />}>",
        "      <>",
        '        <Route path="dashboard" Component={DashboardPage}>',
        "          <Route index element={<OverviewPage />} />",
        '          <Route path="settings" Component={SettingsPage}>',
        '            <Route path=":tab" element={<TabPage />} />',
        "          </Route>",
        "        </Route>",
        "      </>",
        "    </Route>",
        "  );",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /dashboard",
      "NAVIGATE /dashboard",
      "NAVIGATE /dashboard/settings",
      "NAVIGATE /dashboard/settings/:tab"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => reference.referenceName)
    ).toEqual(["DashboardPage", "OverviewPage", "SettingsPage", "TabPage"]);
  });

  it("retains proven JSX ancestors while rejecting unproven nested path shapes", () => {
    const facts = extractFileFacts({
      filePath: "src/app-routes.tsx",
      language: "typescript",
      sourceText: [
        'import { Route } from "react-router";',
        'const dynamicPath = "dynamic";',
        "function ParentPage() { return <main />; }",
        "function KeptPage() { return <main />; }",
        "function RejectedPage() { return <main />; }",
        "export function AppRoutes() {",
        "  return (",
        '    <Route path="/parent" Component={ParentPage}>',
        '      <Route path="kept" Component={KeptPage} />',
        '      <Route path={dynamicPath} Component={RejectedPage} />',
        '      <Route path="../escape" Component={RejectedPage} />',
        '      <Route path="/absolute" Component={RejectedPage} />',
        '      <Route path="legacy" component={RejectedPage} />',
        '      <Route index path="invalid" Component={RejectedPage} />',
        "      <Route index Component={RejectedPage}>",
        '        <Route path="index-child" Component={RejectedPage} />',
        "      </Route>",
        "    </Route>",
        "  );",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /parent",
      "NAVIGATE /parent/kept"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => reference.referenceName)
    ).toEqual(["ParentPage", "KeptPage"]);
  });

  it("extracts createRoutesFromElements JSX trees with exact factory provenance", () => {
    const facts = extractFileFacts({
      filePath: "src/route-config.tsx",
      language: "typescript",
      sourceText: [
        'import { createRoutesFromElements as makeRoutes, Route as AppRoute } from "react-router-dom";',
        "function Shell() { return <main />; }",
        "function WorkspacePage() { return <main />; }",
        "function OverviewPage() { return <main />; }",
        "function SettingsPage() { return <main />; }",
        "export const routes = makeRoutes(",
        "  <>",
        "    <AppRoute element={<Shell />}>",
        '      <AppRoute path="workspace" Component={WorkspacePage}>',
        "        <AppRoute index element={<OverviewPage />} />",
        '        <AppRoute path="settings" Component={SettingsPage} />',
        "      </AppRoute>",
        "    </AppRoute>",
        "  </>",
        ");"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /workspace",
      "NAVIGATE /workspace",
      "NAVIGATE /workspace/settings"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeRegistration])
    ).toEqual([
      ["WorkspacePage", "react-router-create-routes-from-elements"],
      ["OverviewPage", "react-router-create-routes-from-elements"],
      ["SettingsPage", "react-router-create-routes-from-elements"]
    ]);
  });

  it("extracts createRoutesFromElements JSX trees in JavaScript source", () => {
    const facts = extractFileFacts({
      filePath: "src/route-config.jsx",
      language: "javascript",
      sourceText: [
        'import { createRoutesFromElements, Route } from "react-router";',
        "function Page() { return <main />; }",
        'export const routes = createRoutesFromElements(<Route path="/javascript" element={<Page />} />);'
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /javascript"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeRegistration])
    ).toEqual([["Page", "react-router-create-routes-from-elements"]]);
  });

  it("does not assign createRoutesFromElements provenance to unproven factory calls", () => {
    const facts = extractFileFacts({
      filePath: "src/route-config.tsx",
      language: "typescript",
      sourceText: [
        'import { createRoutesFromElements, Route } from "react-router";',
        'import type { createRoutesFromElements as TypeFactory } from "react-router-dom";',
        "function Page() { return <main />; }",
        "const dynamicTree = <Route path=\"/dynamic\" Component={Page} />;",
        "function shadow(createRoutesFromElements: (routes: unknown) => unknown) {",
        '  return createRoutesFromElements(<Route path="/shadowed" Component={Page} />);',
        "}",
        "void shadow;",
        'createRoutesFromElements(<Route path="/options" Component={Page} />, {});',
        'createRoutesFromElements?.(<Route path="/optional" Component={Page} />);',
        "createRoutesFromElements(dynamicTree);",
        'TypeFactory(<Route path="/type-only" Component={Page} />);'
      ].join("\n")
    });

    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => reference.routeRegistration)
    ).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it("extracts AST-proven React Router data-router object routes with direct page handlers", () => {
    const facts = extractFileFacts({
      filePath: "src/data-routes.tsx",
      language: "typescript",
      sourceText: [
        'import { createBrowserRouter as makeRouter } from "react-router-dom";',
        "function HomePage() { return <main>Home</main>; }",
        "function SettingsPage() { return <main>Settings</main>; }",
        "export const router = makeRouter([",
        '  { path: "/", Component: HomePage },',
        '  { path: "/settings", element: <SettingsPage /> }',
        "]);"
      ].join("\n")
    });

    expect(
      facts.symbols
        .filter((symbol) => symbol.kind === "route")
        .map((route) => [route.name, route.range.start.line])
    ).toEqual([
      ["NAVIGATE /", 5],
      ["NAVIGATE /settings", 6]
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [
          reference.referenceName,
          reference.routeFramework,
          reference.routeRegistration
        ])
    ).toEqual([
      ["HomePage", "react-router", "react-router-data-router"],
      ["SettingsPage", "react-router", "react-router-data-router"]
    ]);
  });

  it("extracts AST-proven React Router data-router object routes in JavaScript source", () => {
    const facts = extractFileFacts({
      filePath: "src/data-routes.jsx",
      language: "javascript",
      sourceText: [
        'import { createHashRouter, createMemoryRouter } from "react-router";',
        "function ProfilePage() { return <main>Profile</main>; }",
        "function MemoryPage() { return <main>Memory</main>; }",
        "export const router = createHashRouter([",
        '  { path: "/profile", element: <ProfilePage /> }',
        "]);",
        'export const memoryRouter = createMemoryRouter([{ path: "/memory", Component: MemoryPage }]);'
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /profile",
      "NAVIGATE /memory"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeRegistration])
    ).toEqual([
      ["ProfilePage", "react-router-data-router"],
      ["MemoryPage", "react-router-data-router"]
    ]);
  });

  it("composes direct data-router child routes while retaining independent root-route proof", () => {
    const facts = extractFileFacts({
      filePath: "src/data-routes.tsx",
      language: "typescript",
      sourceText: [
        'import { createBrowserRouter } from "react-router-dom";',
        'const dynamicPath = "/dynamic";',
        "function ParentPage() { return <main>Parent</main>; }",
        "function ChildPage() { return <main>Child</main>; }",
        "export const router = createBrowserRouter([",
        '  { path: "/parent", Component: ParentPage, children: [{ path: "child", Component: ChildPage }] },',
        "  { path: dynamicPath, Component: ChildPage }",
        "]);"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /parent",
      "NAVIGATE /parent/child"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeRegistration])
    ).toEqual([
      ["ParentPage", "react-router-data-router"],
      ["ChildPage", "react-router-data-router"]
    ]);
  });

  it("composes nested relative and index data-router routes through a pathless layout", () => {
    const facts = extractFileFacts({
      filePath: "src/data-routes.tsx",
      language: "typescript",
      sourceText: [
        'import { createMemoryRouter } from "react-router";',
        "function Shell() { return <main />; }",
        "function DashboardPage() { return <main />; }",
        "function OverviewPage() { return <main />; }",
        "function SettingsPage() { return <main />; }",
        "function TabPage() { return <main />; }",
        "export const router = createMemoryRouter([",
        "  {",
        "    Component: Shell,",
        "    children: [",
        '      { path: "dashboard", Component: DashboardPage, children: [',
        "        { index: true, element: <OverviewPage /> },",
        '        { path: "settings", Component: SettingsPage, children: [{ path: ":tab", Component: TabPage }] }',
        "      ] }",
        "    ]",
        "  }",
        "]);"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /dashboard",
      "NAVIGATE /dashboard",
      "NAVIGATE /dashboard/settings",
      "NAVIGATE /dashboard/settings/:tab"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => reference.referenceName)
    ).toEqual(["DashboardPage", "OverviewPage", "SettingsPage", "TabPage"]);
  });

  it("retains proven data-router ancestors while rejecting unproven nested path shapes", () => {
    const facts = extractFileFacts({
      filePath: "src/data-routes.tsx",
      language: "typescript",
      sourceText: [
        'import { createBrowserRouter } from "react-router-dom";',
        'const dynamicPath = "dynamic";',
        "function ParentPage() { return <main />; }",
        "function KeptPage() { return <main />; }",
        "function RejectedPage() { return <main />; }",
        "export const router = createBrowserRouter([",
        "  {",
        '    path: "/parent",',
        "    Component: ParentPage,",
        "    children: [",
        '      { path: "kept", Component: KeptPage },',
        '      { path: dynamicPath, Component: RejectedPage },',
        '      { path: "../escape", Component: RejectedPage },',
        '      { path: "/absolute", Component: RejectedPage },',
        '      { index: true, path: "invalid", Component: RejectedPage },',
        "      { index: true, Component: RejectedPage, children: [] }",
        "    ]",
        "  }",
        "]);"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /parent",
      "NAVIGATE /parent/kept"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => reference.referenceName)
    ).toEqual(["ParentPage", "KeptPage"]);
  });

  it("rejects unproven, dynamic, spread, and ambiguous React Router data-router objects", () => {
    const facts = extractFileFacts({
      filePath: "src/data-routes.tsx",
      language: "typescript",
      sourceText: [
        'import { createBrowserRouter } from "react-router";',
        'import type { createHashRouter as TypeRouter } from "react-router-dom";',
        'const dynamicPath = "/dynamic";',
        'const routeOptions = { id: "spread" };',
        "function Page() { return <main>Page</main>; }",
        "function shadow(createBrowserRouter: (routes: unknown[]) => unknown) {",
        '  return createBrowserRouter([{ path: "/shadowed", Component: Page }]);',
        "}",
        "void shadow;",
        "createBrowserRouter([{ path: dynamicPath, Component: Page }]);",
        'createBrowserRouter([{ ...routeOptions, path: "/spread", Component: Page }]);',
        'createBrowserRouter([{ ["path"]: "/computed", Component: Page }]);',
        'createBrowserRouter([{ path: "/member", Component: pages.Page }]);',
        'createBrowserRouter([{ path: "/ambiguous", Component: Page, element: <Page /> }]);',
        'createBrowserRouter([{ path: "/lazy", Component: Page, lazy: () => Promise.resolve({ Component: Page }) }]);',
        'createBrowserRouter([{ path: "/options", Component: Page }], { basename: "/app" });',
        'TypeRouter([{ path: "/type-only", Component: Page }]);'
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("rejects dynamic, type-only, shadowed, spread, and ambiguous React Router JSX routes", () => {
    const facts = extractFileFacts({
      filePath: "src/app-routes.tsx",
      language: "typescript",
      sourceText: [
        'import { Route } from "react-router";',
        'import type { Route as TypeRoute } from "react-router-dom";',
        'const dynamicPath = "/dynamic";',
        'const attributes = { path: "/spread" };',
        "function Page() { return <main>Page</main>; }",
        "function shadow(Route: unknown) {",
        '  return <Route path="/shadowed" element={<Page />} />;',
        "}",
        "export function AppRoutes() {",
        "  return (",
        "    <>",
        '      <Route path={dynamicPath} element={<Page />} />',
        '      <Route {...attributes} path="/spread" element={<Page />} />',
        '      <Route path="/member" element={<pages.Page />} />',
        '      <Route path="/ambiguous" Component={Page} element={<Page />} />',
        '      <TypeRoute path="/type-only" element={<Page />} />',
        "    </>",
        "  );",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("extracts convention-derived Next.js Pages Router navigation routes with named default handlers", () => {
    const homeFacts = extractFileFacts({
      filePath: "pages/index.tsx",
      language: "typescript",
      sourceText: "export default function HomePage() { return <main>Home</main>; }"
    });
    const articleFacts = extractFileFacts({
      filePath: "src/pages/blog/[slug].jsx",
      language: "javascript",
      sourceText: [
        "const ArticlePage = () => <article>Article</article>;",
        "export default ArticlePage;"
      ].join("\n")
    });
    const settingsFacts = extractFileFacts({
      filePath: "pages/settings.tsx",
      language: "typescript",
      sourceText: "export default class SettingsPage {}"
    });

    expect(homeFacts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /"
    ]);
    expect(
      homeFacts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [
          reference.referenceName,
          reference.routeFramework,
          reference.routeRegistration
        ])
    ).toEqual([["HomePage", "nextjs", "nextjs-pages-router"]]);
    expect(articleFacts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /blog/[slug]"
    ]);
    expect(articleFacts.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([
      expect.objectContaining({
        referenceName: "ArticlePage",
        routeFramework: "nextjs",
        routeRegistration: "nextjs-pages-router"
      })
    ]);
    expect(settingsFacts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /settings"
    ]);
    expect(settingsFacts.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([
      expect.objectContaining({ referenceName: "SettingsPage", routeRegistration: "nextjs-pages-router" })
    ]);
  });

  it("extracts convention-derived Next.js App Router navigation routes and omits route groups", () => {
    const pricingFacts = extractFileFacts({
      filePath: "src/app/(marketing)/pricing/page.tsx",
      language: "typescript",
      sourceText: "export default function PricingPage() { return <main>Pricing</main>; }"
    });
    const postFacts = extractFileFacts({
      filePath: "app/blog/[slug]/page.jsx",
      language: "javascript",
      sourceText: [
        "const PostPage = () => <article>Post</article>;",
        "export default PostPage;"
      ].join("\n")
    });

    expect(pricingFacts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /pricing"
    ]);
    expect(postFacts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "NAVIGATE /blog/[slug]"
    ]);
    expect(
      [...pricingFacts.pendingReferences, ...postFacts.pendingReferences]
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeRegistration])
    ).toEqual([
      ["PricingPage", "nextjs-app-router"],
      ["PostPage", "nextjs-app-router"]
    ]);
  });

  it("rejects unsupported Next.js conventions and non-direct default exports", () => {
    const rejected = [
      ["pages/api/hello.ts", "export default function Hello() { return null; }"],
      ["pages/_app.tsx", "export default function App() { return null; }"],
      ["pages/404.tsx", "export default function NotFound() { return null; }"],
      ["app/blog/route.ts", "export default function GET() { return null; }"],
      ["app/@modal/page.tsx", "export default function Modal() { return null; }"],
      ["app/(.)feed/page.tsx", "export default function Feed() { return null; }"],
      ["app/anonymous/page.tsx", "export default () => <main>Anonymous</main>;"],
      ["src/not-app/page.tsx", "export default function Page() { return null; }"]
    ] as const;

    for (const [filePath, sourceText] of rejected) {
      const facts = extractFileFacts({ filePath, language: "typescript", sourceText });
      expect(facts.symbols.filter((symbol) => symbol.kind === "route"), filePath).toEqual([]);
      expect(facts.pendingReferences.filter((reference) => reference.relationKind === "routes"), filePath).toEqual(
        []
      );
    }
  });

  it("extracts syntax-proven direct Koa router routes with literal paths and named handlers", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import Router from "@koa/router";',
        "const router = new Router();",
        "const requireAuth = () => undefined;",
        "function handler() { return undefined; }",
        'router.get("/users", requireAuth, handler);',
        'router.post("/users", handler);',
        'router.put("/users/:id", handler);',
        'router.patch("/users/:id", handler);',
        'router.delete("/users/:id", handler);',
        'router.del("/legacy/:id", handler);',
        'router.head("/health", handler);',
        'router.options("/users", handler);',
        'router.connect("/tunnel", handler);',
        'router.trace("/diagnostics", handler);',
        'router.all("/fallback", handler);'
      ].join("\n")
    });

    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    const routeReferences = facts.pendingReferences.filter(
      (reference) => reference.relationKind === "routes"
    );

    expect(routes.map((route) => route.name)).toEqual([
      "GET /users",
      "POST /users",
      "PUT /users/:id",
      "PATCH /users/:id",
      "DELETE /users/:id",
      "DELETE /legacy/:id",
      "HEAD /health",
      "OPTIONS /users",
      "CONNECT /tunnel",
      "TRACE /diagnostics",
      "ALL /fallback"
    ]);
    expect(
      routeReferences.map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([
      ["handler", "koa"],
      ["handler", "koa"],
      ["handler", "koa"],
      ["handler", "koa"],
      ["handler", "koa"],
      ["handler", "koa"],
      ["handler", "koa"],
      ["handler", "koa"],
      ["handler", "koa"],
      ["handler", "koa"],
      ["handler", "koa"]
    ]);
  });

  it("rejects unproven, dynamic, and non-direct Koa router route shapes", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import Router from "@koa/router";',
        'import type TypeOnlyRouter from "@koa/router";',
        'import { default as NamedDefaultRouter } from "@koa/router";',
        'import foreignRouter from "not-koa-router";',
        "const router = new Router();",
        "let mutable = new Router();",
        'const prefixed = new Router({ prefix: "/api" });',
        "const typeOnly = new TypeOnlyRouter();",
        "const namedDefault = new NamedDefaultRouter();",
        "const foreign = new foreignRouter();",
        'const legacy = require("@koa/router");',
        "const legacyRouter = new legacy();",
        "const controller = { handler: () => undefined };",
        'const path = "/dynamic";',
        "function handler() { return undefined; }",
        'router.get("/real", handler);',
        "router.get(path, handler);",
        'router.get("named-route", "/named", handler);',
        'router.get("/inline", () => undefined);',
        'router.get("/member", controller.handler);',
        'router.get("/non-identifier-middleware", {}, handler);',
        'router["get"]("/computed", handler);',
        'router.use("/mount", handler);',
        'router?.get("/optional-property", handler);',
        'router.get?.("/optional-call", handler);',
        'mutable.get("/mutable", handler);',
        'prefixed.get("/prefixed", handler);',
        'typeOnly.get("/type-only", handler);',
        'namedDefault.get("/named-default", handler);',
        'foreign.get("/foreign", handler);',
        'legacyRouter.get("/require", handler);',
        "function shadow(Router: new () => unknown) {",
        "  const shadowed = new Router();",
        '  shadowed.get("/shadowed", handler);',
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "GET /real"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([["handler", "koa"]]);
  });

  it("extracts syntax-proven direct Hono routes with literal paths and named handlers", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import { Hono as WebApp } from "hono";',
        "const app = new WebApp();",
        "const requireAuth = () => undefined;",
        "function handler() { return undefined; }",
        'app.get("/users", requireAuth, handler);',
        'app.post("/users", handler);',
        'app.put("/users/:id", handler);',
        'app.patch("/users/:id", handler);',
        'app.delete("/users/:id", handler);',
        'app.head("/health", handler);',
        'app.options("/users", handler);',
        'app.all("/fallback", handler);'
      ].join("\n")
    });

    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    const routeReferences = facts.pendingReferences.filter(
      (reference) => reference.relationKind === "routes"
    );

    expect(routes.map((route) => route.name)).toEqual([
      "GET /users",
      "POST /users",
      "PUT /users/:id",
      "PATCH /users/:id",
      "DELETE /users/:id",
      "HEAD /health",
      "OPTIONS /users",
      "ALL /fallback"
    ]);
    expect(
      routeReferences.map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([
      ["handler", "hono"],
      ["handler", "hono"],
      ["handler", "hono"],
      ["handler", "hono"],
      ["handler", "hono"],
      ["handler", "hono"],
      ["handler", "hono"],
      ["handler", "hono"]
    ]);
  });

  it("rejects unproven, dynamic, and non-direct Hono route shapes", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import DefaultHono from "hono";',
        'import * as honoNamespace from "hono";',
        'import type { Hono as TypeOnlyHono } from "hono";',
        'import { Hono as WebApp } from "hono";',
        'import foreignHono from "not-hono";',
        "const app = new WebApp();",
        "let mutable = new WebApp();",
        "const configured = new WebApp({ getPath: () => "/" });",
        "const defaultApp = new DefaultHono();",
        "const namespaceApp = new honoNamespace.Hono();",
        "const typeOnly = new TypeOnlyHono();",
        "const foreign = new foreignHono();",
        'const legacy = require("hono");',
        "const legacyApp = new legacy.Hono();",
        "const controller = { handler: () => undefined };",
        'const path = "/dynamic";',
        "function handler() { return undefined; }",
        'app.get("/real", handler);',
        "app.get(path, handler);",
        'app.get("not-slash-prefixed", handler);',
        'app.get("/inline", () => undefined);',
        'app.get("/member", controller.handler);',
        'app.get("/non-identifier-middleware", {}, handler);',
        'app["get"]("/computed", handler);',
        'app?.get("/optional-property", handler);',
        'app.get?.("/optional-call", handler);',
        'app.on("GET", "/on", handler);',
        'app.use("/middleware", handler);',
        'app.route("/mounted", app);',
        'mutable.get("/mutable", handler);',
        'configured.get("/configured", handler);',
        'defaultApp.get("/default", handler);',
        'namespaceApp.get("/namespace", handler);',
        'typeOnly.get("/type-only", handler);',
        'foreign.get("/foreign", handler);',
        'legacyApp.get("/require", handler);',
        "function shadow(WebApp: new () => unknown) {",
        "  const shadowed = new WebApp();",
        '  shadowed.get("/shadowed", handler);',
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "GET /real"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([["handler", "hono"]]);
  });

  it("extracts syntax-proven direct Elysia routes with literal paths and named handlers", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import { Elysia as WebApp } from "elysia";',
        "const app = new WebApp();",
        "const requireAuth = () => undefined;",
        "function handler() { return undefined; }",
        'app.get("/users", requireAuth, handler);',
        'app.post("/users", handler);',
        'app.put("/users/:id", handler);',
        'app.patch("/users/:id", handler);',
        'app.delete("/users/:id", handler);',
        'app.head("/health", handler);',
        'app.options("/users", handler);',
        'app.all("/fallback", handler);'
      ].join("\n")
    });

    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    const routeReferences = facts.pendingReferences.filter(
      (reference) => reference.relationKind === "routes"
    );

    expect(routes.map((route) => route.name)).toEqual([
      "GET /users",
      "POST /users",
      "PUT /users/:id",
      "PATCH /users/:id",
      "DELETE /users/:id",
      "HEAD /health",
      "OPTIONS /users",
      "ALL /fallback"
    ]);
    expect(
      routeReferences.map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([
      ["handler", "elysia"],
      ["handler", "elysia"],
      ["handler", "elysia"],
      ["handler", "elysia"],
      ["handler", "elysia"],
      ["handler", "elysia"],
      ["handler", "elysia"],
      ["handler", "elysia"]
    ]);
  });

  it("rejects unproven, dynamic, and non-direct Elysia route shapes", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import DefaultElysia from "elysia";',
        'import * as elysiaNamespace from "elysia";',
        'import type { Elysia as TypeOnlyElysia } from "elysia";',
        'import { Elysia as WebApp } from "elysia";',
        'import foreignElysia from "not-elysia";',
        "const app = new WebApp();",
        "let mutable = new WebApp();",
        'const configured = new WebApp({ prefix: "/api" });',
        "const defaultApp = new DefaultElysia();",
        "const namespaceApp = new elysiaNamespace.Elysia();",
        "const typeOnly = new TypeOnlyElysia();",
        "const foreign = new foreignElysia();",
        'const legacy = require("elysia");',
        "const legacyApp = new legacy.Elysia();",
        "const controller = { handler: () => undefined };",
        'const path = "/dynamic";',
        "function handler() { return undefined; }",
        'app.get("/real", handler);',
        "app.get(path, handler);",
        'app.get("not-slash-prefixed", handler);',
        'app.get("/inline", () => undefined);',
        'app.get("/member", controller.handler);',
        'app.get("/non-identifier-middleware", {}, handler);',
        'app["get"]("/computed", handler);',
        'app?.get("/optional-property", handler);',
        'app.get?.("/optional-call", handler);',
        'app.route("GET", "/custom-method", handler);',
        'app.group("/group", handler);',
        "app.use(app);",
        'new WebApp().get("/chained", handler);',
        'mutable.get("/mutable", handler);',
        'configured.get("/configured", handler);',
        'defaultApp.get("/default", handler);',
        'namespaceApp.get("/namespace", handler);',
        'typeOnly.get("/type-only", handler);',
        'foreign.get("/foreign", handler);',
        'legacyApp.get("/require", handler);',
        "function shadow(WebApp: new () => unknown) {",
        "  const shadowed = new WebApp();",
        '  shadowed.get("/shadowed", handler);',
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "GET /real"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([["handler", "elysia"]]);
  });

  it("extracts syntax-proven Fastify shorthand and full-object routes with framework provenance", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import Fastify from "fastify";',
        "const app = Fastify({ logger: true });",
        "function listUsers() { return []; }",
        "function createUser() { return undefined; }",
        "function traceDiagnostics() { return undefined; }",
        "function debug() { return undefined; }",
        "function listReports() { return []; }",
        "function health() { return undefined; }",
        "function handler() { return undefined; }",
        'app.get("/users", listUsers);',
        'app.post("/users", { schema: {} }, createUser);',
        'app.trace("/diagnostics", traceDiagnostics);',
        'app.all("/debug", debug);',
        'app.route({ method: ["GET", "POST"], url: "/reports", handler: listReports });',
        'app.route({ method: "HEAD", path: "/health", handler: health });',
        'app.route({ method: "GET", url: "/shorthand-handler", handler });'
      ].join("\n")
    });

    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    const routeReferences = facts.pendingReferences.filter(
      (reference) => reference.relationKind === "routes"
    );

    expect(routes.map((route) => route.name)).toEqual([
      "GET /users",
      "POST /users",
      "TRACE /diagnostics",
      "ALL /debug",
      "GET /reports",
      "POST /reports",
      "HEAD /health",
      "GET /shorthand-handler"
    ]);
    expect(routeReferences.map((reference) => [reference.referenceName, reference.routeFramework])).toEqual([
      ["listUsers", "fastify"],
      ["createUser", "fastify"],
      ["traceDiagnostics", "fastify"],
      ["debug", "fastify"],
      ["listReports", "fastify"],
      ["listReports", "fastify"],
      ["health", "fastify"],
      ["handler", "fastify"]
    ]);
  });

  it("extracts direct Fastify default imports in JavaScript", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.js",
      language: "javascript",
      sourceText: [
        'import Fastify from "fastify";',
        "const app = Fastify();",
        "function health() { return undefined; }",
        "function listUsers() { return []; }",
        'app.head("/health", health);',
        "app.register(async (api) => {",
        '  api.get("/users", listUsers);',
        '}, { prefix: "/api" });'
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "HEAD /health",
      "GET /api/users"
    ]);
    expect(
      facts.pendingReferences.filter((reference) => reference.relationKind === "routes")
    ).toEqual([
      expect.objectContaining({ referenceName: "health", routeFramework: "fastify" }),
      expect.objectContaining({
        referenceName: "listUsers",
        routeFramework: "fastify",
        routeRegistration: "fastify-inline-plugin-prefix"
      })
    ]);
  });

  it("projects same-file named Fastify plugin prefixes in JavaScript", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.js",
      language: "javascript",
      sourceText: [
        'import Fastify from "fastify";',
        "function listUsers() { return []; }",
        "const usersPlugin = async (server) => {",
        '  server.get("/users", listUsers);',
        "};",
        "const app = Fastify();",
        'app.register(usersPlugin, { prefix: "/api" });'
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "GET /api/users"
    ]);
    expect(
      facts.pendingReferences.filter((reference) => reference.relationKind === "routes")
    ).toEqual([
      expect.objectContaining({
        referenceName: "listUsers",
        routeFramework: "fastify",
        routeRegistration: "fastify-local-plugin-prefix"
      })
    ]);
  });

  it("projects static named Fastify plugins through nested local callback composition", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import Fastify from "fastify";',
        "function health() { return undefined; }",
        "function listUsers() { return []; }",
        "async function api(server: unknown) {",
        '  server.get("/health", health);',
        "  server.register(async (diagnostics: unknown) => {",
        '    diagnostics.get("/status", health);',
        '  }, { prefix: "/diagnostics" });',
        '  server.register(v1, { prefix: "/v1" });',
        "}",
        "const v1 = async function(instance: unknown) {",
        '  instance.route({ method: ["GET", "TRACE"], url: "/users", handler: listUsers });',
        "};",
        "const app = Fastify();",
        'app.register(api, { prefix: "/api" });'
      ].join("\n")
    });

    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    const routeReferences = facts.pendingReferences.filter(
      (reference) => reference.relationKind === "routes"
    );

    expect(routes.map((route) => route.name)).toEqual([
      "GET /api/health",
      "GET /api/diagnostics/status",
      "GET /api/v1/users",
      "TRACE /api/v1/users"
    ]);
    expect(
      routeReferences.map((reference) => [
        reference.referenceName,
        reference.routeFramework,
        reference.routeRegistration
      ])
    ).toEqual([
      ["health", "fastify", "fastify-local-plugin-prefix"],
      ["health", "fastify", "fastify-local-plugin-prefix"],
      ["listUsers", "fastify", "fastify-local-plugin-prefix"],
      ["listUsers", "fastify", "fastify-local-plugin-prefix"]
    ]);
  });

  it("projects direct inline Fastify plugin prefixes through nested static callbacks", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import Fastify from "fastify";',
        "const app = Fastify();",
        "function health() { return undefined; }",
        "function listUsers() { return []; }",
        "app.register(async (api) => {",
        '  api.get("/health", health);',
        "  api.register(async function v1(instance) {",
        '    instance.route({ method: ["GET", "TRACE"], url: "/users", handler: listUsers });',
        '  }, { prefix: "/v1" });',
        '}, { prefix: "/api" });'
      ].join("\n")
    });

    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    const routeReferences = facts.pendingReferences.filter(
      (reference) => reference.relationKind === "routes"
    );

    expect(routes.map((route) => route.name)).toEqual([
      "GET /api/health",
      "GET /api/v1/users",
      "TRACE /api/v1/users"
    ]);
    expect(
      routeReferences.map((reference) => [
        reference.referenceName,
        reference.routeFramework,
        reference.routeRegistration
      ])
    ).toEqual([
      ["health", "fastify", "fastify-inline-plugin-prefix"],
      ["listUsers", "fastify", "fastify-inline-plugin-prefix"],
      ["listUsers", "fastify", "fastify-inline-plugin-prefix"]
    ]);
  });

  it("retains exact cross-file Fastify plugin route and registration facts", () => {
    const pluginFacts = extractFileFacts({
      filePath: "src/api.ts",
      language: "typescript",
      sourceText: [
        'import { listUsers } from "./handlers.js";',
        'import { jobsPlugin } from "./jobs.js";',
        "export async function api(server: unknown) {",
        '  server.get("/users", listUsers);',
        '  server.register(jobsPlugin, { prefix: "/v1" });',
        "}"
      ].join("\n")
    });
    const api = pluginFacts.symbols.find(
      (symbol) => symbol.kind === "function" && symbol.qualifiedName === "src/api.ts#api"
    );

    expect(pluginFacts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(pluginFacts.fastifyPluginFacts).toEqual({
      routes: [
        expect.objectContaining({
          pluginId: api?.id,
          method: "GET",
          path: "/users",
          handler: expect.objectContaining({ name: "listUsers" })
        })
      ],
      childRegistrations: [
        expect.objectContaining({
          parentPluginId: api?.id,
          plugin: expect.objectContaining({ name: "jobsPlugin" }),
          prefix: "/v1"
        })
      ],
      rootRegistrations: []
    });

    const rootFacts = extractFileFacts({
      filePath: "src/main.ts",
      language: "typescript",
      sourceText: [
        'import Fastify from "fastify";',
        'import { api as publicApi } from "./barrel.js";',
        "const app = Fastify();",
        'app.register(publicApi, { prefix: "/api" });'
      ].join("\n")
    });

    expect(rootFacts.fastifyPluginFacts).toEqual({
      routes: [],
      childRegistrations: [],
      rootRegistrations: [
        expect.objectContaining({
          plugin: expect.objectContaining({ name: "publicApi" }),
          prefix: "/api"
        })
      ]
    });
  });

  it("retains direct JavaScript Fastify plugin facts for later module projection", () => {
    const facts = extractFileFacts({
      filePath: "src/api.js",
      language: "javascript",
      sourceText: [
        'import { listUsers } from "./handlers.js";',
        "export const api = async (server) => {",
        '  server.route({ method: ["GET", "TRACE"], url: "/users", handler: listUsers });',
        "};"
      ].join("\n")
    });
    const api = facts.symbols.find(
      (symbol) => symbol.kind === "variable" && symbol.qualifiedName === "src/api.js#api"
    );

    expect(facts.fastifyPluginFacts).toEqual({
      routes: [
        expect.objectContaining({ pluginId: api?.id, method: "GET", path: "/users" }),
        expect.objectContaining({ pluginId: api?.id, method: "TRACE", path: "/users" })
      ],
      childRegistrations: [],
      rootRegistrations: []
    });
  });

  it("rejects unproven, dynamic, and ambiguous Fastify route shapes", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import Fastify from "fastify";',
        'import type TypeOnlyFastify from "fastify";',
        'import * as fastifyNamespace from "fastify";',
        'import { default as namedDefaultFastify } from "fastify";',
        'import { importedPlugin } from "./plugins.js";',
        'import foreignFactory from "not-fastify";',
        "const app = Fastify();",
        "let mutable = Fastify();",
        "const optionalFactory = Fastify?.();",
        "const typeOnly = TypeOnlyFastify();",
        "const namespace = fastifyNamespace();",
        "const namedDefault = namedDefaultFastify();",
        "const foreign = foreignFactory();",
        "const controller = { handler: () => undefined };",
        "const dynamicPath = \"/dynamic\";",
        "const dynamicMethods = [\"GET\"];",
        "function handler() { return undefined; }",
        "let namedPlugin = async (server: unknown) => {",
        '  server.get("/named-plugin", handler);',
        "};",
        "const duplicatePlugin = async (server: unknown) => {",
        '  server.get("/duplicate-plugin", handler);',
        "};",
        "const aliasedPlugin = async (server: unknown) => {",
        '  server.get("/aliased-plugin", handler);',
        "};",
        "const pluginAlias = aliasedPlugin;",
        "const wrappedPlugin = wrap(async (server: unknown) => {",
        '  server.get("/wrapped-plugin", handler);',
        "});",
        "function reboundPlugin(server: unknown) {",
        '  server.get("/rebound-plugin", handler);',
        "}",
        "reboundPlugin = async (server: unknown) => {",
        '  server.get("/rebound-after-assignment", handler);',
        "};",
        'app.get("/real", handler);',
        "app.get(dynamicPath, handler);",
        'app.get("/inline", () => undefined);',
        'app.get("/member", controller.handler);',
        'app.get("/too-many", {}, {}, handler);',
        'app.route({ method: "get", url: "/lowercase", handler });',
        'app.route({ method: dynamicMethods, url: "/dynamic-method", handler });',
        'app.route({ method: ["GET", "GET"], url: "/duplicate-method", handler });',
        'app.route({ method: "GET", url: "/both", path: "/both", handler });',
        'app.route({ method: "GET", url: "not-slash-prefixed", handler });',
        'app.route({ method: "GET", url: "/missing-handler" });',
        'app.route({ method: "GET", url: "/member-handler", handler: controller.handler });',
        'app.route({ method: "GET", url: "/spread", ...controller, handler });',
        'mutable.get("/mutable", handler);',
        'optionalFactory.get("/optional", handler);',
        'typeOnly.get("/type-only", handler);',
        'namespace.get("/namespace", handler);',
        'namedDefault.get("/named-default", handler);',
        'foreign.get("/foreign", handler);',
        'app.register(namedPlugin, { prefix: "/named" });',
        'app.register(duplicatePlugin, { prefix: "/first" });',
        'app.register(duplicatePlugin, { prefix: "/second" });',
        'app.register(pluginAlias, { prefix: "/aliased" });',
        'app.register(importedPlugin, { prefix: "/imported" });',
        'app.register(wrappedPlugin, { prefix: "/wrapped" });',
        'app.register(reboundPlugin, { prefix: "/rebound" });',
        "app.register(async (server) => {",
        '  server.get("/dynamic-plugin-prefix", handler);',
        "}, { prefix: dynamicPath });",
        "app.register(async (server) => {",
        '  server.get("/trailing-plugin-prefix", handler);',
        '}, { prefix: "/trailing/" });',
        "app.register(async (server) => {",
        '  server.get("/spread-plugin-prefix", handler);',
        '}, { ...controller, prefix: "/spread" });',
        "app.register(async (server) => {",
        '  server.get("/", handler);',
        '}, { prefix: "/root" });',
        "app.register(async function* (server) {",
        '  server.get("/generator-plugin", handler);',
        '}, { prefix: "/generator" });',
        "app.register(async (server) => {",
        "  server = { get: () => undefined };",
        '  server.get("/reassigned-plugin", handler);',
        '}, { prefix: "/reassigned" });',
        "app.register(async (server) => {",
        '  server.get("/without-prefix", handler);',
        "}, {});",
        "function shadow(Fastify: () => unknown) {",
        "  const shadowed = Fastify();",
        '  shadowed.get("/shadowed", handler);',
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "GET /real"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([["handler", "fastify"]]);
  });

  it("extracts AST-proven NestJS HTTP routes with aliased decorator imports and direct method evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/users.controller.ts",
      language: "typescript",
      sourceText: [
        'import { Controller as ApiController, Get as Read, Post } from "@nestjs/common";',
        "@ApiController(\"/api/users/\")",
        "export class UsersController {",
        "  @Read()",
        "  list(): string { return \"users\"; }",
        "",
        "  @Read(\":id\")",
        "  findOne(): string { return \"user\"; }",
        "",
        "  @Post(\"bulk\")",
        "  createBulk(): string { return \"created\"; }",
        "}"
      ].join("\n")
    });

    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    const methods = facts.symbols.filter((symbol) => symbol.kind === "method");
    const routesByName = new Map(routes.map((route) => [route.name, route]));
    const methodsByName = new Map(methods.map((method) => [method.name, method]));
    const routeEdges = facts.edges.filter((edge) => edge.kind === "routes");

    expect(routes.map((route) => [route.name, route.range.start.line])).toEqual([
      ["GET /api/users", 4],
      ["GET /api/users/:id", 7],
      ["POST /api/users/bulk", 10]
    ]);
    expect(routeEdges).toEqual([
      expect.objectContaining({
        sourceId: routesByName.get("GET /api/users")?.id,
        targetId: methodsByName.get("list")?.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "list",
        evidence: {
          ruleId: "framework.nestjs.decorator-route.local-method",
          stage: "syntax",
          candidateSymbolIds: [methodsByName.get("list")?.id]
        }
      }),
      expect.objectContaining({
        sourceId: routesByName.get("GET /api/users/:id")?.id,
        targetId: methodsByName.get("findOne")?.id,
        referenceName: "findOne"
      }),
      expect.objectContaining({
        sourceId: routesByName.get("POST /api/users/bulk")?.id,
        targetId: methodsByName.get("createBulk")?.id,
        referenceName: "createBulk"
      })
    ]);
    expect(facts.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("supports direct NestJS HTTP decorators in JavaScript source", () => {
    const facts = extractFileFacts({
      filePath: "src/health.controller.js",
      language: "javascript",
      sourceText: [
        'import { Controller, Get } from "@nestjs/common";',
        "@Controller(\"health\")",
        "export class HealthController {",
        "  @Get()",
        "  status() { return { ok: true }; }",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toMatchObject([
      { name: "GET /health", range: { start: { line: 4, column: 3 } } }
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toMatchObject([
      {
        resolution: "exact",
        confidence: 1,
        referenceName: "status",
        evidence: { ruleId: "framework.nestjs.decorator-route.local-method", stage: "syntax" }
      }
    ]);
  });

  it("maps every supported direct NestJS HTTP decorator and root controller path", () => {
    const facts = extractFileFacts({
      filePath: "src/rest.controller.ts",
      language: "typescript",
      sourceText: [
        'import { All, Controller, Delete, Get, Head, Options, Patch, Post, Put } from "@nestjs/common";',
        "@Controller()",
        "class RestController {",
        "  @Get() get() {}",
        "  @Post() post() {}",
        "  @Put() put() {}",
        "  @Patch() patch() {}",
        "  @Delete() delete() {}",
        "  @Head() head() {}",
        "  @Options() options() {}",
        "  @All(`fallback`) all() {}",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "GET /",
      "POST /",
      "PUT /",
      "PATCH /",
      "DELETE /",
      "HEAD /",
      "OPTIONS /",
      "ALL /fallback"
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "routes").map((edge) => edge.referenceName)).toEqual([
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "head",
      "options",
      "all"
    ]);
  });

  it("retains AST-proven Nest module controller and RouterModule prefix facts", () => {
    const facts = extractFileFacts({
      filePath: "src/app.module.ts",
      language: "typescript",
      sourceText: [
        'import { Controller, Get, Module as NestModule } from "@nestjs/common";',
        'import { RouterModule as NestRouter } from "@nestjs/core";',
        "@Controller(\"cats\")",
        "export class CatsController {",
        "  @Get() list() {}",
        "}",
        "@NestModule({ controllers: [CatsController] })",
        "export class CatsModule {}",
        "export class AdminModule {}",
        "@NestModule({",
        "  imports: [",
        "    NestRouter.register([",
        "      { path: \"admin\", module: AdminModule, children: [{ path: `v1`, module: CatsModule }] }",
        "    ])",
        "  ]",
        "})",
        "export class AppModule {}"
      ].join("\n")
    });

    const route = facts.symbols.find((symbol) => symbol.kind === "route" && symbol.name === "GET /cats");
    const controller = facts.symbols.find((symbol) => symbol.name === "CatsController");
    const catsModule = facts.symbols.find((symbol) => symbol.name === "CatsModule");
    const factsForNest = facts.nestRouteFacts;

    expect(factsForNest?.routeControllers).toEqual([
      { routeId: route?.id, controllerId: controller?.id }
    ]);
    expect(factsForNest?.moduleControllers).toEqual([
      expect.objectContaining({
        moduleId: catsModule?.id,
        controller: expect.objectContaining({ name: "CatsController", scopeIds: expect.any(Array) })
      })
    ]);
    expect(
      factsForNest?.routerModulePrefixes.map((prefix) => [prefix.module.name, prefix.prefix])
    ).toEqual([
      ["AdminModule", "/admin"],
      ["CatsModule", "/admin/v1"]
    ]);
  });

  it("does not retain dynamic, type-only, namespace, or shadowed Nest RouterModule prefixes", () => {
    const facts = extractFileFacts({
      filePath: "src/unproven.module.ts",
      language: "typescript",
      sourceText: [
        'import { Controller, Get, Module } from "@nestjs/common";',
        'import { RouterModule } from "@nestjs/core";',
        'import type { RouterModule as TypeRouter } from "@nestjs/core";',
        'import * as nestCore from "@nestjs/core";',
        "const dynamicPath = \"dynamic\";",
        "const RouterModule = { register: () => [] };",
        "@Controller(\"cats\") class CatsController { @Get() list() {} }",
        "@Module({ controllers: [CatsController] }) class CatsModule {}",
        "@Module({ imports: [RouterModule.register([{ path: dynamicPath, module: CatsModule }])] }) class DynamicModule {}",
        "@Module({ imports: [TypeRouter.register([{ path: \"type\", module: CatsModule }])] }) class TypeOnlyModule {}",
        "@Module({ imports: [nestCore.RouterModule.register([{ path: \"namespace\", module: CatsModule }])] }) class NamespaceModule {}"
      ].join("\n")
    });

    expect(facts.nestRouteFacts?.moduleControllers).toHaveLength(1);
    expect(facts.nestRouteFacts?.routerModulePrefixes).toEqual([]);
  });

  it("extracts AST-proven NestJS GraphQL, microservice, and WebSocket entrypoints", () => {
    const facts = extractFileFacts({
      filePath: "src/transports.ts",
      language: "typescript",
      sourceText: [
        'import { Controller as ApiController } from "@nestjs/common";',
        'import { Mutation as Change, Query as Read, Resolver as GraphResolver, Subscription as Stream } from "@nestjs/graphql";',
        'import { EventPattern as Event, MessagePattern as Message } from "@nestjs/microservices";',
        'import { SubscribeMessage as OnMessage, WebSocketGateway as Gateway } from "@nestjs/websockets";',
        "@GraphResolver(() => Author)",
        "class AuthorResolver {",
        "  @Read(() => Author)",
        "  author() { return {}; }",
        "  @Change(() => Author, { name: \"renameAuthor\" })",
        "  rename() { return {}; }",
        "  @Stream(() => Author, { name: `authorUpdated` })",
        "  publish() { return {}; }",
        "  @Stream(\"commentAdded\", { filter: () => true })",
        "  commentAdded() { return {}; }",
        "}",
        "@ApiController()",
        "class MathController {",
        "  @Message({ version: 1, cmd: \"sum\" })",
        "  sum() { return 0; }",
        "  @Event(`user.created`)",
        "  onUserCreated() {}",
        "}",
        "@Gateway(80, { namespace: \"events\" })",
        "class EventsGateway {",
        "  @OnMessage(`created`)",
        "  handleCreated() {}",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => symbol.id)).toEqual(
      [...new Set(facts.symbols.map((symbol) => symbol.id))]
    );
    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "entrypoint").map((symbol) => symbol.name)).toEqual([
      "graphql query author",
      "graphql mutation renameAuthor",
      "graphql subscription authorUpdated",
      "graphql subscription commentAdded",
      'microservice message {"cmd":"sum","version":1}',
      "microservice event user.created",
      "websocket subscribe events:created"
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "handles").map((edge) => [
      symbolsById.get(edge.sourceId)?.name,
      symbolsById.get(edge.targetId ?? "")?.name,
      edge.evidence?.ruleId,
      edge.resolution,
      edge.confidence
    ])).toEqual([
      ["graphql query author", "author", "framework.nestjs.graphql.operation.local-method", "exact", 1],
      ["graphql mutation renameAuthor", "rename", "framework.nestjs.graphql.operation.local-method", "exact", 1],
      ["graphql subscription authorUpdated", "publish", "framework.nestjs.graphql.operation.local-method", "exact", 1],
      ["graphql subscription commentAdded", "commentAdded", "framework.nestjs.graphql.operation.local-method", "exact", 1],
      [
        'microservice message {"cmd":"sum","version":1}',
        "sum",
        "framework.nestjs.microservice.pattern.local-method",
        "exact",
        1
      ],
      ["microservice event user.created", "onUserCreated", "framework.nestjs.microservice.pattern.local-method", "exact", 1],
      ["websocket subscribe events:created", "handleCreated", "framework.nestjs.websocket.subscribe-message.local-method", "exact", 1]
    ]);
    const resolver = facts.symbols.find((symbol) => symbol.name === "AuthorResolver");
    if (resolver === undefined) {
      throw new Error("Expected indexed NestJS GraphQL resolver class.");
    }
    expect(facts.nestGraphqlFacts?.resolverReferences).toEqual([
      {
        resolverId: resolver.id,
        schemaTypeName: "Author",
        range: {
          start: { line: 5, column: 22 },
          end: { line: 5, column: 28 }
        }
      }
    ]);
  });

  it("rejects non-identifier, async, multi-argument, and block NestJS resolver type factories", () => {
    const facts = extractFileFacts({
      filePath: "src/unproven-resolvers.ts",
      language: "typescript",
      sourceText: [
        'import { Resolver } from "@nestjs/graphql";',
        "@Resolver(() => [User]) class ArrayResolver {}",
        "@Resolver(() => User, {}) class OptionsResolver {}",
        "@Resolver(async () => User) class AsyncResolver {}",
        "@Resolver(() => { return User; }) class BlockResolver {}"
      ].join("\n")
    });

    expect(facts.nestGraphqlFacts?.resolverReferences).toEqual([]);
  });

  it("rejects unproven NestJS non-HTTP entrypoint decorators and dynamic identities", () => {
    const facts = extractFileFacts({
      filePath: "src/unproven-transports.ts",
      language: "typescript",
      sourceText: [
        'import { Controller } from "@nestjs/common";',
        'import { Mutation, Query, Resolver, Subscription } from "@nestjs/graphql";',
        'import type { Query as TypeQuery, Resolver as TypeResolver } from "@nestjs/graphql";',
        'import * as graphql from "@nestjs/graphql";',
        'import { EventPattern, MessagePattern } from "@nestjs/microservices";',
        'import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";',
        "const dynamicName = \"dynamic\";",
        "const dynamicPattern = { cmd: \"dynamic\" };",
        "const Query = () => undefined;",
        "@TypeResolver() class TypeOnlyResolver { @TypeQuery() method() {} }",
        "@Resolver() class DynamicResolver {",
        "  @Query(dynamicName) query() {}",
        "  @Mutation(() => Result, { name: dynamicName }) mutation() {}",
        "  @graphql.Subscription() subscription() {}",
        "}",
        "@Controller() class DynamicController {",
        "  @MessagePattern(dynamicName) message() {}",
        "  @EventPattern({ ...dynamicPattern }) event() {}",
        "  @MessagePattern({ __proto__: { cmd: \"unsafe\" } }) prototypePattern() {}",
        "}",
        "@WebSocketGateway({ namespace: dynamicName }) class DynamicGateway {",
        "  @SubscribeMessage(\"created\") created() {}",
        "}",
        "@WebSocketGateway() class InvalidGateway {",
        "  @SubscribeMessage(dynamicName) dynamic() {}",
        "  @SubscribeMessage(\"created\") static invalid() {}",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "entrypoint")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "handles")).toEqual([]);
    expect(facts.nestGraphqlFacts?.resolverReferences).toEqual([]);
  });

  it("rejects type-only, non-Nest, shadowed, dynamic, namespace, and static NestJS route shapes", () => {
    const facts = extractFileFacts({
      filePath: "src/unproven.controller.ts",
      language: "typescript",
      sourceText: [
        'import { Controller, Get, Post } from "@nestjs/common";',
        'import type { Controller as TypeController, Get as TypeGet } from "@nestjs/common";',
        'import { Controller as ForeignController, Get as ForeignGet } from "./not-nest";',
        'import * as nest from "@nestjs/common";',
        "const path = \"dynamic\";",
        "const Get = () => undefined;",
        "@TypeController(\"type-only\") class TypeOnlyController { @TypeGet() index() {} }",
        "@ForeignController(\"foreign\") class ForeignControllerClass { @ForeignGet() index() {} }",
        "@nest.Controller(\"namespace\") class NamespaceController { @nest.Get() index() {} }",
        "@Controller(path) class DynamicController { @Post() index() {} }",
        "@Controller(\"static\") class StaticController { @Post() static index() {} }",
        "@Controller(\"shadowed\") class ShadowedController { @Get() index() {} }",
        "@Controller({ path: \"options\" }) class OptionsController { @Post() index() {} }",
        "@Controller(\"method-dynamic\") class DynamicMethodController { @Post(path) index() {} }",
        "class NoController { @Post() index() {} }"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts Python declarations and direct FastAPI decorator routes with syntax evidence", () => {
    const facts = extractFileFacts({
      filePath: "app/main.py",
      language: "python",
      sourceText: [
        "from fastapi import Depends, FastAPI as Api",
        "app = Api(title=\"Example\")",
        "",
        "@app.get(\"/health\", tags=[\"system\"])",
        "async def health():",
        "    return {\"ok\": True}",
        "",
        "class Service:",
        "    def run(self):",
        "        return \"ready\""
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName, symbol.name])
    ).toEqual(
      expect.arrayContaining([
        ["file", "app/main.py", "main.py"],
        ["function", "app/main.py#health", "health"],
        ["class", "app/main.py#Service", "Service"],
        ["method", "app/main.py#Service.run", "run"],
        ["route", "app/main.py#route:GET /health", "GET /health"]
      ])
    );

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "app/main.py#health",
        "framework.fastapi.direct-app.decorator.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);

  });

  it("extracts same-file FastAPI APIRouter routes through direct literal inclusion", () => {
    const facts = extractFileFacts({
      filePath: "app/catalog.py",
      language: "python",
      sourceText: [
        "from fastapi import Depends, FastAPI as Api, APIRouter as Router",
        "app = Api()",
        "router = Router(prefix=\"/catalog\", tags=[\"catalog\"])",
        "",
        "@router.get(\"/\")",
        "async def list_items():",
        "    return []",
        "",
        "@router.post(\"/{item_id}\", dependencies=[Depends(check_access)])",
        "async def create_item(item_id: str):",
        "    return {\"item_id\": item_id}",
        "",
        "app.include_router(router, prefix=\"/api\", tags=[\"public\"])"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /api/catalog/",
        "app/catalog.py#list_items",
        "framework.fastapi.direct-router.include-router.decorator.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /api/catalog/{item_id}",
        "app/catalog.py#create_item",
        "framework.fastapi.direct-router.include-router.decorator.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);

  });

  it("retains proven cross-file FastAPI router and package-relative inclusion facts", () => {
    const routerFacts = extractFileFacts({
      filePath: "api/routers/catalog.py",
      language: "python",
      sourceText: [
        "from fastapi import APIRouter",
        "router = APIRouter(prefix=\"/catalog\")",
        "",
        "@router.get(\"/health\")",
        "async def health():",
        "    return {\"ok\": True}"
      ].join("\n")
    });
    const mainFacts = extractFileFacts({
      filePath: "api/main.py",
      language: "python",
      sourceText: [
        "from fastapi import FastAPI as Api",
        "from .routers.catalog import router as catalog_router",
        "app = Api()",
        "app.include_router(catalog_router, prefix=\"/api\")"
      ].join("\n")
    });

    expect(routerFacts.fastApiRouterFacts).toMatchObject({
      routers: [{ name: "router", prefix: "/catalog" }],
      routes: [
        {
          routerName: "router",
          method: "GET",
          path: "/health",
          handlerId: expect.any(String)
        }
      ],
      importedRouterInclusions: []
    });
    expect(mainFacts.fastApiRouterFacts).toMatchObject({
      routers: [],
      routes: [],
      importedRouterInclusions: [
        {
          applicationName: "app",
          routerName: "catalog_router",
          importedRouterName: "router",
          moduleSpecifier: ".routers.catalog",
          prefix: "/api"
        }
      ]
    });
  });

  it("rejects parent-relative and rebound FastAPI router import inclusions", () => {
    const facts = extractFileFacts({
      filePath: "api/main.py",
      language: "python",
      sourceText: [
        "from fastapi import FastAPI",
        "from ..routers.catalog import router",
        "app = FastAPI()",
        "app.include_router(router)",
        "",
        "from .routers.catalog import router as catalog_router",
        "catalog_router = build_router()",
        "app.include_router(catalog_router)"
      ].join("\n")
    });

    expect(facts.fastApiRouterFacts?.importedRouterInclusions).toEqual([]);
  });

  it("does not retain cross-file router facts when the source router is later rebound", () => {
    const facts = extractFileFacts({
      filePath: "api/routers/catalog.py",
      language: "python",
      sourceText: [
        "from fastapi import APIRouter",
        "router = APIRouter()",
        "",
        "@router.get(\"/health\")",
        "async def health():",
        "    return {\"ok\": True}",
        "",
        "router = build_router()"
      ].join("\n")
    });

    expect(facts.fastApiRouterFacts).toMatchObject({
      routers: [],
      routes: []
    });
  });

  it("retains proven cross-file Flask Blueprint and package-relative registration facts", () => {
    const blueprintFacts = extractFileFacts({
      filePath: "app/routes/catalog.py",
      language: "python",
      sourceText: [
        "from flask import Blueprint as BP",
        "catalog = BP(\"catalog\", __name__, url_prefix=\"/catalog\")",
        "",
        "@catalog.get(\"/items\")",
        "def items():",
        "    return []"
      ].join("\n")
    });
    const mainFacts = extractFileFacts({
      filePath: "app/main.py",
      language: "python",
      sourceText: [
        "from flask import Flask as App",
        "from .routes.catalog import catalog as catalog_blueprint",
        "app = App(__name__)",
        "app.register_blueprint(catalog_blueprint, url_prefix=\"/api\")"
      ].join("\n")
    });

    expect(blueprintFacts.flaskBlueprintFacts).toMatchObject({
      blueprints: [{ name: "catalog", prefix: "/catalog" }],
      routes: [
        {
          blueprintName: "catalog",
          method: "GET",
          path: "/items",
          handlerId: expect.any(String)
        }
      ],
      importedBlueprintRegistrations: []
    });
    expect(mainFacts.flaskBlueprintFacts).toMatchObject({
      blueprints: [],
      routes: [],
      importedBlueprintRegistrations: [
        {
          applicationName: "app",
          blueprintName: "catalog_blueprint",
          importedBlueprintName: "catalog",
          moduleSpecifier: ".routes.catalog",
          prefix: "/api"
        }
      ]
    });
  });

  it("rejects parent-relative and rebound Flask Blueprint registrations", () => {
    const facts = extractFileFacts({
      filePath: "app/main.py",
      language: "python",
      sourceText: [
        "from flask import Flask",
        "from ..routes.catalog import catalog",
        "app = Flask(__name__)",
        "app.register_blueprint(catalog)",
        "",
        "from .routes.catalog import catalog as catalog_blueprint",
        "catalog_blueprint = build_blueprint()",
        "app.register_blueprint(catalog_blueprint)"
      ].join("\n")
    });

    expect(facts.flaskBlueprintFacts?.importedBlueprintRegistrations).toEqual([]);
  });

  it("does not retain cross-file Blueprint facts when the source Blueprint is later rebound", () => {
    const facts = extractFileFacts({
      filePath: "app/routes/catalog.py",
      language: "python",
      sourceText: [
        "from flask import Blueprint",
        "catalog = Blueprint(\"catalog\", __name__)",
        "",
        "@catalog.get(\"/items\")",
        "def items():",
        "    return []",
        "",
        "catalog = build_blueprint()"
      ].join("\n")
    });

    expect(facts.flaskBlueprintFacts).toMatchObject({
      blueprints: [],
      routes: []
    });
  });

  it("extracts direct Flask shortcut and literal route-method decorators", () => {
    const facts = extractFileFacts({
      filePath: "app/flask_app.py",
      language: "python",
      sourceText: [
        "from flask import Flask as App",
        "app = App(__name__)",
        "",
        "@app.get(\"/health\")",
        "def health():",
        "    return {\"ok\": True}",
        "",
        "@app.route(\"/jobs\", methods=[\"GET\", \"POST\"])",
        "def jobs():",
        "    return []"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "app/flask_app.py#health",
        "framework.flask.direct-app.decorator.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /jobs",
        "app/flask_app.py#jobs",
        "framework.flask.direct-app.decorator.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /jobs",
        "app/flask_app.py#jobs",
        "framework.flask.direct-app.decorator.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("extracts same-file Flask Blueprint routes through literal registration prefixes", () => {
    const facts = extractFileFacts({
      filePath: "app/catalog.py",
      language: "python",
      sourceText: [
        "from flask import Blueprint as BP, Flask as App",
        "app = App(__name__)",
        "catalog = BP(\"catalog\", __name__, url_prefix=\"/catalog\")",
        "",
        "@catalog.route(\"/items\", methods=(\"GET\", \"POST\"))",
        "def items():",
        "    return []",
        "",
        "app.register_blueprint(catalog, url_prefix=\"/api\")"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "GET /api/catalog/items",
        "app/catalog.py#items",
        "framework.flask.direct-blueprint.register-blueprint.decorator.local-function"
      ],
      [
        "POST /api/catalog/items",
        "app/catalog.py#items",
        "framework.flask.direct-blueprint.register-blueprint.decorator.local-function"
      ]
    ]);
  });

  it("rejects dynamic and rebound Flask route shapes", () => {
    const facts = extractFileFacts({
      filePath: "app/unproven_flask.py",
      language: "python",
      sourceText: [
        "from flask import Blueprint, Flask",
        "app = build_app(Flask)",
        "@app.get(\"/factory\")",
        "def factory():",
        "    return {}",
        "",
        "known = Flask(__name__)",
        "@known.route(\"/dynamic\", methods=allowed_methods)",
        "def dynamic_methods():",
        "    return {}",
        "",
        "bp = Blueprint(\"catalog\", __name__, url_prefix=base_path)",
        "@bp.get(\"/items\")",
        "def dynamic_blueprint():",
        "    return {}",
        "known.register_blueprint(bp)",
        "",
        "rebound = Flask(__name__)",
        "rebound = build_app()",
        "@rebound.get(\"/rebound\")",
        "def rebound_handler():",
        "    return {}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts final direct Django urlpatterns paths with exact same-file handlers", () => {
    const facts = extractFileFacts({
      filePath: "project/urls.py",
      language: "python",
      sourceText: [
        "from django.urls import path as url",
        "",
        "def home(request):",
        "    return None",
        "",
        "def user_detail(request):",
        "    return None",
        "",
        "urlpatterns = [",
        "    url('', home, name='home'),",
        "    url('users/<int:user_id>/', user_detail),",
        "]"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "ALL /",
        "project/urls.py#home",
        "framework.django.direct-urlpatterns.path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "ALL /users/<int:user_id>/",
        "project/urls.py#user_detail",
        "framework.django.direct-urlpatterns.path.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("records package-relative Django URLConf inclusion and child route facts", () => {
    const childFacts = extractFileFacts({
      filePath: "project/catalog/urls.py",
      language: "python",
      sourceText: [
        "from django.urls import path",
        "",
        "def items(request):",
        "    return None",
        "",
        "urlpatterns = [path('items/', items)]"
      ].join("\n")
    });
    const mainFacts = extractFileFacts({
      filePath: "project/urls.py",
      language: "python",
      sourceText: [
        "from django.urls import include as mount, path as url",
        "from .catalog import urls as catalog_urls",
        "",
        "urlpatterns = [url('api/', mount(catalog_urls))]"
      ].join("\n")
    });
    const patternsImportFacts = extractFileFacts({
      filePath: "project/urls.py",
      language: "python",
      sourceText: [
        "from django.urls import include, path",
        "from .catalog.urls import urlpatterns as catalog_patterns",
        "",
        "urlpatterns = [path('patterns/', include(catalog_patterns))]"
      ].join("\n")
    });

    const childHandler = childFacts.symbols.find(
      (symbol) => symbol.qualifiedName === "project/catalog/urls.py#items"
    );
    expect(childFacts.djangoUrlFacts).toMatchObject({
      routes: [{ path: "/items/", handlerId: childHandler?.id }],
      importedUrlconfInclusions: []
    });
    expect(mainFacts.djangoUrlFacts).toMatchObject({
      routes: [],
      importedUrlconfInclusions: [
        {
          urlconfName: "catalog_urls",
          importedUrlconfName: "urls",
          moduleSpecifier: ".catalog.urls",
          prefix: "/api/"
        }
      ]
    });
    expect(patternsImportFacts.djangoUrlFacts).toMatchObject({
      importedUrlconfInclusions: [
        {
          urlconfName: "catalog_patterns",
          importedUrlconfName: "urlpatterns",
          moduleSpecifier: ".catalog.urls",
          prefix: "/patterns/"
        }
      ]
    });
  });

  it("rejects dynamic, parent-relative, and rebound Django URLConf inclusion forms", () => {
    const facts = extractFileFacts({
      filePath: "project/urls.py",
      language: "python",
      sourceText: [
        "from django.urls import include, path",
        "from ..catalog import urls as parent_urls",
        "from .catalog import urls as catalog_urls",
        "catalog_urls = replacement",
        "",
        "urlpatterns = [",
        "    path('parent/', include(parent_urls)),",
        "    path('rebound/', include(catalog_urls)),",
        "    path('dynamic/', include(build_urlconf())),",
        "]"
      ].join("\n")
    });

    expect(facts.djangoUrlFacts?.importedUrlconfInclusions).toEqual([]);
  });

  it("rejects non-final, dynamic, non-local, unsupported, and rebound Django path forms", () => {
    const facts = extractFileFacts({
      filePath: "project/urls.py",
      language: "python",
      sourceText: [
        "from django.urls import path",
        "",
        "def health(request):",
        "    return None",
        "",
        "urlpatterns = [path('old/', health)]",
        "urlpatterns = [",
        "    path('/leading-slash/', health),",
        "    path('dynamic/', build_handler()),",
        "    path('unknown/', missing_handler),",
        "    path('kwargs/', health, kwargs={}),",
        "]",
        "path = replacement",
        "urlpatterns = [path('rebound/', health)]"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Go Gin engine and nested literal group routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/main.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        'import g "github.com/gin-gonic/gin"',
        "",
        "func health(c *g.Context) {}",
        "func createUser(c *g.Context) {}",
        "func listUsers(c *g.Context) {}",
        "func search(c *g.Context) {}",
        "",
        "func main() {",
        "  router := g.Default()",
        "  router.GET(\"/health\", health)",
        "  router.POST(\"/users\", createUser)",
        "  api := router.Group(\"/api\")",
        "  v1 := api.Group(\"/v1\")",
        "  v1.GET(\"/users\", listUsers)",
        "  v1.Any(\"/search\", search)",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "cmd/server/main.go#health",
        "framework.gin.direct-engine.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /users",
        "cmd/server/main.go#createUser",
        "framework.gin.direct-engine.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /api/v1/users",
        "cmd/server/main.go#listUsers",
        "framework.gin.direct-group.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "ALL /api/v1/search",
        "cmd/server/main.go#search",
        "framework.gin.direct-group.method.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("extracts direct Go Fiber v3 App and nested literal Group routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/fiber.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        'import f "github.com/gofiber/fiber/v3"',
        "",
        "func health(c f.Ctx) error { return nil }",
        "func headHealth(c f.Ctx) error { return nil }",
        "func createUser(c f.Ctx) error { return nil }",
        "func search(c f.Ctx) error { return nil }",
        "",
        "func main() {",
        "  app := f.New()",
        '  app.Get("/health", health)',
        '  app.Head("/health", headHealth)',
        '  api := app.Group("/api")',
        '  v1 := api.Group("/v1")',
        '  v1.Post("/users", createUser)',
        '  v1.All("/search", search)',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "cmd/server/fiber.go#health",
        "framework.fiber.direct-app.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "HEAD /health",
        "cmd/server/fiber.go#headHealth",
        "framework.fiber.direct-app.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /api/v1/users",
        "cmd/server/fiber.go#createUser",
        "framework.fiber.direct-group.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "ALL /api/v1/search",
        "cmd/server/fiber.go#search",
        "framework.fiber.direct-group.method.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("extracts direct Go Echo v5 App and nested literal Group routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/echo.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        'import e "github.com/labstack/echo/v5"',
        "",
        "func health(c *e.Context) error { return nil }",
        "func headHealth(c *e.Context) error { return nil }",
        "func createUser(c *e.Context) error { return nil }",
        "func search(c *e.Context) error { return nil }",
        "",
        "func main() {",
        "  app := e.New()",
        '  app.GET("/health", health)',
        '  app.HEAD("/health", headHealth)',
        '  api := app.Group("/api")',
        '  v1 := api.Group("/v1")',
        '  v1.POST("/users", createUser)',
        '  v1.Any("/search", search)',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "cmd/server/echo.go#health",
        "framework.echo.direct-app.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "HEAD /health",
        "cmd/server/echo.go#headHealth",
        "framework.echo.direct-app.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /api/v1/users",
        "cmd/server/echo.go#createUser",
        "framework.echo.direct-group.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "ALL /api/v1/search",
        "cmd/server/echo.go#search",
        "framework.echo.direct-group.method.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("rejects shadowed, dynamic, inline, middleware, Match, and rebound Go Echo route shapes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/unproven-echo.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        'import echo "github.com/labstack/echo/v5"',
        "",
        "func health(c *echo.Context) error { return nil }",
        "func stable(c *echo.Context) error { return nil }",
        "",
        "func shadowed(echo int) {",
        "  app := echo.New()",
        '  app.GET("/shadowed", health)',
        "}",
        "",
        "func main() {",
        "  path := \"/dynamic\"",
        "  app := echo.New()",
        "  app.GET(path, health)",
        '  app.GET("/inline", func(c *echo.Context) error { return nil })',
        '  app.GET("/middleware", auth, health)',
        '  app.Match([]string{"GET"}, "/match", stable)',
        "  health := fallback",
        '  app.GET("/rebound-handler", health)',
        "  app = buildApp()",
        '  app.GET("/rebound-app", stable)',
        "  var legacy = echo.New()",
        '  legacy.GET("/var-binding", stable)',
        "  second := echo.New()",
        "  prefix := \"/api\"",
        "  api := second.Group(prefix)",
        '  api.GET("/dynamic-group", stable)',
        '  bad := second.Group("/api/", auth)',
        '  bad.GET("/unsupported-group", stable)',
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Go net/http default and literal ServeMux HandleFunc routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/http.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        'import http "net/http"',
        "",
        "func health(w http.ResponseWriter, r *http.Request) {}",
        "func listUsers(w http.ResponseWriter, r *http.Request) {}",
        "func diagnostics(w http.ResponseWriter, r *http.Request) {}",
        "func tunnel(w http.ResponseWriter, r *http.Request) {}",
        "",
        "func main() {",
        "  http.HandleFunc(\"/health\", health)",
        "  mux := http.NewServeMux()",
        "  mux.HandleFunc(\"GET /users\", listUsers)",
        "  mux.HandleFunc(\"TRACE /diagnostics\", diagnostics)",
        "  mux.HandleFunc(\"CONNECT /tunnel\", tunnel)",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "ALL /health",
        "cmd/server/http.go#health",
        "framework.net-http.default-serve-mux.handle-func.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /users",
        "cmd/server/http.go#listUsers",
        "framework.net-http.serve-mux.handle-func.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "TRACE /diagnostics",
        "cmd/server/http.go#diagnostics",
        "framework.net-http.serve-mux.handle-func.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "CONNECT /tunnel",
        "cmd/server/http.go#tunnel",
        "framework.net-http.serve-mux.handle-func.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("rejects dynamic, shadowed, inline, middleware, and rebound Go Gin route shapes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/unproven.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        'import gin "github.com/gin-gonic/gin"',
        "",
        "func health(c *gin.Context) {}",
        "func stable(c *gin.Context) {}",
        "",
        "func main() {",
        "  router := gin.Default()",
        "  path := \"/dynamic\"",
        "  router.GET(path, health)",
        "  router.GET(\"/inline\", func(c *gin.Context) {})",
        "  router.GET(\"/middleware\", auth, health)",
        "  health := fallback",
        "  router.GET(\"/shadowed\", health)",
        "  router = buildRouter()",
        "  router.GET(\"/rebound\", health)",
        "  var legacy = gin.Default()",
        "  legacy.GET(\"/var-binding\", stable)",
        "  second := gin.New()",
        "  prefix := \"/api\"",
        "  api := second.Group(prefix)",
        "  api.GET(\"/dynamic-group\", health)",
        "  bad := second.Group(\"/api/\")",
        "  bad.GET(\"/trailing-prefix\", stable)",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("rejects shadowed, dynamic, inline, middleware, configured, and rebound Go Fiber route shapes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/unproven-fiber.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        'import f "github.com/gofiber/fiber/v3"',
        "",
        "func health(c f.Ctx) error { return nil }",
        "func stable(c f.Ctx) error { return nil }",
        "",
        "func shadowed(f int) {",
        "  app := f.New()",
        '  app.Get("/shadowed", health)',
        "}",
        "",
        "func main() {",
        "  path := \"/dynamic\"",
        "  app := f.New()",
        "  app.Get(path, health)",
        '  app.Get("/inline", func(c f.Ctx) error { return nil })',
        '  app.Get("/middleware", auth, health)',
        "  health := fallback",
        '  app.Get("/rebound-handler", health)',
        "  app = buildApp()",
        '  app.Get("/rebound-app", stable)',
        "  var legacy = f.New()",
        '  legacy.Get("/var-binding", stable)',
        "  configured := f.New(f.Config{})",
        '  configured.Get("/configured", stable)',
        "  second := f.New()",
        "  prefix := \"/api\"",
        "  api := second.Group(prefix)",
        '  api.Get("/dynamic-group", stable)',
        '  bad := second.Group("/api/", auth)',
        '  bad.Get("/unsupported-group", stable)',
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("rejects dynamic, shadowed, wrapper, unsupported, and rebound Go net/http route shapes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/unproven-http.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        'import http "net/http"',
        "",
        "func health(w http.ResponseWriter, r *http.Request) {}",
        "func stable(w http.ResponseWriter, r *http.Request) {}",
        "",
        "func shadowed(http int) {",
        "  http.HandleFunc(\"/shadowed\", health)",
        "}",
        "",
        "func main() {",
        "  pattern := \"/dynamic\"",
        "  http.HandleFunc(pattern, health)",
        "  http.HandleFunc(\"/inline\", func(w http.ResponseWriter, r *http.Request) {})",
        "  http.HandleFunc(\"/wrapped\", http.HandlerFunc(health))",
        "  mux := http.NewServeMux()",
        "  mux = buildMux()",
        "  mux.HandleFunc(\"/rebound\", stable)",
        "  var legacy = http.NewServeMux()",
        "  legacy.HandleFunc(\"/var-binding\", stable)",
        "  mux.Handle(\"/handle\", stable)",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Go Chi NewRouter and NewMux routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/chi.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  http "net/http"',
        '  "github.com/go-chi/chi/v5"',
        ")",
        "",
        "func health(w http.ResponseWriter, r *http.Request) {}",
        "func createUser(w http.ResponseWriter, r *http.Request) {}",
        "func tunnel(w http.ResponseWriter, r *http.Request) {}",
        "func all(w http.ResponseWriter, r *http.Request) {}",
        "func diagnostics(w http.ResponseWriter, r *http.Request) {}",
        "",
        "func main() {",
        "  router := chi.NewRouter()",
        "  router.Get(\"/health\", health)",
        "  router.Post(\"/users\", createUser)",
        "  router.Connect(\"/tunnel\", tunnel)",
        "  router.HandleFunc(\"/all\", all)",
        "  secondary := chi.NewMux()",
        "  secondary.Trace(\"/diagnostics\", diagnostics)",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "cmd/server/chi.go#health",
        "framework.chi.direct-router.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /users",
        "cmd/server/chi.go#createUser",
        "framework.chi.direct-router.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "CONNECT /tunnel",
        "cmd/server/chi.go#tunnel",
        "framework.chi.direct-router.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "ALL /all",
        "cmd/server/chi.go#all",
        "framework.chi.direct-router.method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "TRACE /diagnostics",
        "cmd/server/chi.go#diagnostics",
        "framework.chi.direct-router.method.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("rejects shadowed, dynamic, inline, wrapped, rebounded, and composed Go Chi route shapes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/unproven-chi.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  http "net/http"',
        '  chi "github.com/go-chi/chi/v5"',
        ")",
        "",
        "func health(w http.ResponseWriter, r *http.Request) {}",
        "func stable(w http.ResponseWriter, r *http.Request) {}",
        "",
        "func shadowed(chi int) {",
        "  router := chi.NewRouter()",
        "  router.Get(\"/shadowed\", health)",
        "}",
        "",
        "func main() {",
        "  path := \"/dynamic\"",
        "  router := chi.NewRouter()",
        "  router.Get(path, health)",
        "  router.Get(\"/inline\", func(w http.ResponseWriter, r *http.Request) {})",
        "  router.Get(\"/wrapped\", http.HandlerFunc(health))",
        "  router = makeRouter()",
        "  router.Post(\"/rebound\", stable)",
        "  var legacy = chi.NewRouter()",
        "  legacy.Get(\"/var-binding\", stable)",
        "  router.MethodFunc(\"GET\", \"/method\", stable)",
        "  router.Route(\"/api\", func(r chi.Router) { r.Get(\"/users\", stable) })",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct and standard-router GoFrame routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/goframe.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  "context"',
        '  g "github.com/gogf/gf/v2/frame/g"',
        ")",
        "",
        "type ListReq struct {",
        '  g.Meta `path:"users" method:"get"`',
        "}",
        "",
        "type HealthReq struct {",
        '  g.Meta `path:"/health"`',
        "}",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) List(ctx context.Context, req *ListReq) (res *ListRes, err error) {",
        "  return",
        "}",
        "",
        "func (c *Controller) Health(ctx context.Context, req *HealthReq) (res *HealthRes, err error) {",
        "  return",
        "}",
        "",
        "func directHandler(ctx context.Context, req *DirectReq) (res *DirectRes, err error) {",
        "  return",
        "}",
        "",
        "func groupHandler(ctx context.Context, req *GroupReq) (res *GroupRes, err error) {",
        "  return",
        "}",
        "",
        "func main() {",
        "  server := g.Server()",
        '  server.BindHandler("POST:/direct", directHandler)',
        '  api := server.Group("/api")',
        '  api.DELETE("/direct-group", groupHandler)',
        "  api.Bind(&Controller{})",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "POST /direct",
        "cmd/server/goframe.go#directHandler",
        "framework.goframe.direct-server.bind-handler.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "DELETE /api/direct-group",
        "cmd/server/goframe.go#groupHandler",
        "framework.goframe.direct-group.http-method.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /api/users",
        "cmd/server/goframe.go#Controller.List",
        "framework.goframe.standard-router.g-meta.direct-bound-controller.local-method",
        "syntax",
        "exact",
        1
      ],
      [
        "ALL /api/health",
        "cmd/server/goframe.go#Controller.Health",
        "framework.goframe.standard-router.g-meta.direct-bound-controller.local-method",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("extracts literal GoFrame v1 BindHandler routes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/goframe-v1.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/frame/g"',
        '  "github.com/gogf/gf/net/ghttp"',
        ")",
        "",
        "func health(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        '  server.BindHandler("GET:/health", health)',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "GET /health",
        "cmd/server/goframe-v1.go#health",
        "framework.goframe.direct-server.bind-handler.local-function"
      ]
    ]);
  });

  it("extracts literal GoFrame BindObjectMethod routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/goframe-bind-object-method.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) Health(r *ghttp.Request) {}",
        "func (c Controller) Status(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := new(Controller)",
        '  server.BindObjectMethod("GET:/direct", &Controller{}, "Health")',
        '  server.BindObjectMethod("/bound", controller, "Status")',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /direct",
        "cmd/server/goframe-bind-object-method.go#Controller.Health",
        "framework.goframe.direct-server.bind-object-method.local-object-method",
        "syntax",
        "exact",
        1
      ],
      [
        "ALL /bound",
        "cmd/server/goframe-bind-object-method.go#Controller.Status",
        "framework.goframe.direct-server.bind-object-method.local-object-method",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("extracts literal GoFrame v1 BindObjectMethod routes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/goframe-v1-bind-object-method.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/frame/g"',
        '  "github.com/gogf/gf/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) Legacy(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        '  server.BindObjectMethod("POST:/legacy", new(Controller), "Legacy")',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "POST /legacy",
        "cmd/server/goframe-v1-bind-object-method.go#Controller.Legacy",
        "framework.goframe.direct-server.bind-object-method.local-object-method"
      ]
    ]);
  });

  it("extracts selected literal GoFrame BindObject routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/goframe-bind-object.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) Index(r *ghttp.Request) {}",
        "func (c *Controller) Show(r *ghttp.Request) {}",
        "func (c Controller) Health(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := new(Controller)",
        '  server.BindObject("/object", controller, "Index, Show")',
        '  server.BindObject("GET:/api", &Controller{}, "Health")',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "ALL /object/index",
        "cmd/server/goframe-bind-object.go#Controller.Index",
        "framework.goframe.direct-server.bind-object.local-object-method",
        "syntax",
        "exact",
        1
      ],
      [
        "ALL /object",
        "cmd/server/goframe-bind-object.go#Controller.Index",
        "framework.goframe.direct-server.bind-object.local-object-method",
        "syntax",
        "exact",
        1
      ],
      [
        "ALL /object/show",
        "cmd/server/goframe-bind-object.go#Controller.Show",
        "framework.goframe.direct-server.bind-object.local-object-method",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /api/health",
        "cmd/server/goframe-bind-object.go#Controller.Health",
        "framework.goframe.direct-server.bind-object.local-object-method",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("extracts literal GoFrame BindObjectRest routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/goframe-bind-object-rest.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) Get(r *ghttp.Request) {}",
        "func (c *Controller) Post(r *ghttp.Request) {}",
        "func (c *Controller) Put(r *ghttp.Request) {}",
        "func (c *Controller) Patch(r *ghttp.Request) {}",
        "func (c *Controller) Delete(r *ghttp.Request) {}",
        "func (c *Controller) Head(r *ghttp.Request) {}",
        "func (c *Controller) Options(r *ghttp.Request) {}",
        "func (c *Controller) Trace(r *ghttp.Request) {}",
        "func (c *Controller) Connect(r *ghttp.Request) {}",
        "func (c *Controller) Hello(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        "  server.SetNameToUriType(ghttp.UriTypeFullName)",
        '  server.BindObjectRest("/objects", controller)',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /objects",
        "cmd/server/goframe-bind-object-rest.go#Controller.Get",
        "framework.goframe.direct-server.bind-object-rest.local-object-method",
        "exact",
        1
      ],
      [
        "POST /objects",
        "cmd/server/goframe-bind-object-rest.go#Controller.Post",
        "framework.goframe.direct-server.bind-object-rest.local-object-method",
        "exact",
        1
      ],
      [
        "PUT /objects",
        "cmd/server/goframe-bind-object-rest.go#Controller.Put",
        "framework.goframe.direct-server.bind-object-rest.local-object-method",
        "exact",
        1
      ],
      [
        "PATCH /objects",
        "cmd/server/goframe-bind-object-rest.go#Controller.Patch",
        "framework.goframe.direct-server.bind-object-rest.local-object-method",
        "exact",
        1
      ],
      [
        "DELETE /objects",
        "cmd/server/goframe-bind-object-rest.go#Controller.Delete",
        "framework.goframe.direct-server.bind-object-rest.local-object-method",
        "exact",
        1
      ],
      [
        "HEAD /objects",
        "cmd/server/goframe-bind-object-rest.go#Controller.Head",
        "framework.goframe.direct-server.bind-object-rest.local-object-method",
        "exact",
        1
      ],
      [
        "OPTIONS /objects",
        "cmd/server/goframe-bind-object-rest.go#Controller.Options",
        "framework.goframe.direct-server.bind-object-rest.local-object-method",
        "exact",
        1
      ],
      [
        "TRACE /objects",
        "cmd/server/goframe-bind-object-rest.go#Controller.Trace",
        "framework.goframe.direct-server.bind-object-rest.local-object-method",
        "exact",
        1
      ],
      [
        "CONNECT /objects",
        "cmd/server/goframe-bind-object-rest.go#Controller.Connect",
        "framework.goframe.direct-server.bind-object-rest.local-object-method",
        "exact",
        1
      ]
    ]);
  });

  it("extracts selected GoFrame v1 BindObject and BindObjectRest routes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/goframe-v1-bind-object.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/frame/g"',
        '  "github.com/gogf/gf/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) Show(r *ghttp.Request) {}",
        "func (c *Controller) Get(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        '  server.BindObject("/legacy", new(Controller), "Show")',
        '  server.BindObjectRest("/legacy-rest", &Controller{})',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "ALL /legacy/show",
        "cmd/server/goframe-v1-bind-object.go#Controller.Show",
        "framework.goframe.direct-server.bind-object.local-object-method"
      ],
      [
        "GET /legacy-rest",
        "cmd/server/goframe-v1-bind-object.go#Controller.Get",
        "framework.goframe.direct-server.bind-object-rest.local-object-method"
      ]
    ]);
  });

  it("extracts literal GoFrame Domain object routes with exact host evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/goframe-domain-object.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) Show(r *ghttp.Request) {}",
        "func (c *Controller) Health(r *ghttp.Request) {}",
        "func (c *Controller) Get(r *ghttp.Request) {}",
        "func (c *Controller) Delete(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        '  server.Domain("api.example.test").BindObject("GET:/objects", controller, "Show")',
        '  admin := server.Domain("admin.example.test, admin-alt.example.test")',
        '  admin.BindObjectMethod("POST:/health", controller, "Health")',
        '  admin.BindObjectRest("/items", controller)',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.routeDomain
        ])
    ).toEqual([
      [
        "GET /objects/show",
        "cmd/server/goframe-domain-object.go#Controller.Show",
        "framework.goframe.domain.bind-object.local-object-method",
        "api.example.test"
      ],
      [
        "POST /health",
        "cmd/server/goframe-domain-object.go#Controller.Health",
        "framework.goframe.domain.bind-object-method.local-object-method",
        "admin.example.test"
      ],
      [
        "POST /health",
        "cmd/server/goframe-domain-object.go#Controller.Health",
        "framework.goframe.domain.bind-object-method.local-object-method",
        "admin-alt.example.test"
      ],
      [
        "GET /items",
        "cmd/server/goframe-domain-object.go#Controller.Get",
        "framework.goframe.domain.bind-object-rest.local-object-method",
        "admin.example.test"
      ],
      [
        "GET /items",
        "cmd/server/goframe-domain-object.go#Controller.Get",
        "framework.goframe.domain.bind-object-rest.local-object-method",
        "admin-alt.example.test"
      ],
      [
        "DELETE /items",
        "cmd/server/goframe-domain-object.go#Controller.Delete",
        "framework.goframe.domain.bind-object-rest.local-object-method",
        "admin.example.test"
      ],
      [
        "DELETE /items",
        "cmd/server/goframe-domain-object.go#Controller.Delete",
        "framework.goframe.domain.bind-object-rest.local-object-method",
        "admin-alt.example.test"
      ]
    ]);
  });

  it("extracts literal GoFrame v1 Domain BindHandler routes with exact host evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/goframe-domain-handler.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/frame/g"',
        '  "github.com/gogf/gf/net/ghttp"',
        ")",
        "",
        "func health(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        '  api := server.Domain("api.example.test, api-alt.example.test")',
        '  api.BindHandler("GET:/health", health)',
        '  server.Domain("admin.example.test").BindHandler("POST:/status", health)',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          edge.evidence?.ruleId,
          edge.evidence?.routeDomain
        ])
    ).toEqual([
      ["GET /health", "framework.goframe.domain.bind-handler.local-function", "api.example.test"],
      ["GET /health", "framework.goframe.domain.bind-handler.local-function", "api-alt.example.test"],
      ["POST /status", "framework.goframe.domain.bind-handler.local-function", "admin.example.test"]
    ]);
  });

  it("rejects unproven GoFrame BindObject and BindObjectRest shapes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/unproven-goframe-bind-object.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "type InvalidRest struct{}",
        "",
        "func (c *Controller) Index(r *ghttp.Request) {}",
        "func (c *Controller) Show(r *ghttp.Request) {}",
        "func (c *Controller) Get(r *ghttp.Request) {}",
        "func (c *Controller) UserName(r *ghttp.Request) {}",
        "func (c *Controller) Init(r *ghttp.Request) {}",
        "func (c *Controller) Shut(r *ghttp.Request) {}",
        "func (c *InvalidRest) Get(r *ghttp.Request) error { return nil }",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        '  dynamicPattern := "/dynamic"',
        '  dynamicMethods := "Show"',
        '  server.BindObject("/all-methods", controller)',
        '  server.BindObject(dynamicPattern, controller, "Show")',
        '  server.BindObject("/dynamic-methods", controller, dynamicMethods)',
        '  server.BindObject("/{.method}", controller, "Show")',
        '  server.BindObject("/unsupported-name", controller, "UserName")',
        '  server.BindObject("/invalid-selection", controller, "Show, Missing")',
        '  server.BindObject("/lifecycle", controller, "Init, Shut")',
        '  server.BindObject("/extra-methods", controller, "Show", "Index")',
        '  api := server.Group("/api")',
        '  api.BindObject("/group", controller, "Show")',
        '  api.BindObjectRest("/group-rest", controller)',
        '  server.BindObjectRest(dynamicPattern, controller)',
        '  server.BindObjectRest("GET:/not-a-rest-path", controller)',
        '  server.BindObjectRest("/invalid-rest", &InvalidRest{})',
        "  controller = factory()",
        '  server.BindObject("/rebound-object", controller, "Show")',
        "  server = replacement()",
        '  server.BindObjectRest("/rebound-server", &Controller{})',
        "}",
        "",
        "func configuredServer() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        "  server.SetNameToUriType(ghttp.UriTypeFullName)",
        '  server.BindObject("/configured", controller, "Show")',
        "}",
        "",
        "func callbackMutation() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        '  server.Group("/config", func(group *ghttp.RouterGroup) {',
        "    server.SetNameToUriType(ghttp.UriTypeFullName)",
        "  })",
        '  server.BindObject("/callback-configured", controller, "Show")',
        "}",
        "",
        "func aliasMutation() {",
        "  server := g.Server()",
        "  alias := server",
        "  controller := &Controller{}",
        "  alias.SetNameToUriType(ghttp.UriTypeFullName)",
        '  server.BindObject("/alias-configured", controller, "Show")',
        "}",
        "",
        "func unprovenDomain() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        '  dynamicDomain := "api.example.test"',
        '  server.Domain(dynamicDomain).BindObject("/dynamic-domain", controller, "Show")',
        '  server.Domain("*.example.test").BindObject("/wildcard-domain", controller, "Show")',
        '  server.Domain("api.example.test, ").BindObject("/empty-domain", controller, "Show")',
        '  api := server.Domain("api.example.test")',
        "  server.SetNameToUriType(ghttp.UriTypeFullName)",
        '  api.BindObject("/configured-domain", controller, "Show")',
        "  api = replacement()",
        '  api.BindObjectRest("/rebound-domain", controller)',
        "}",
        "",
        "func trailingPath() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        '  server.BindObject("/trailing/", controller, "Show")',
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("rejects unproven GoFrame BindObjectMethod shapes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/unproven-goframe-bind-object-method.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) Health(r *ghttp.Request) {}",
        "func (c *Controller) WrongSignature() {}",
        "func (c *Controller) ReturnsValue(r *ghttp.Request) error { return nil }",
        "func (c *Controller) private(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        '  dynamicPattern := "GET:/dynamic-pattern"',
        '  dynamicMethod := "Health"',
        '  server.BindObjectMethod(dynamicPattern, controller, "Health")',
        '  server.BindObjectMethod("GET:/dynamic-method", controller, dynamicMethod)',
        '  server.BindObjectMethod("GET:/unexported", controller, "private")',
        '  server.BindObjectMethod("GET:/missing", controller, "Missing")',
        '  server.BindObjectMethod("GET:/wrong-signature", controller, "WrongSignature")',
        '  server.BindObjectMethod("GET:/returns-value", controller, "ReturnsValue")',
        '  server.BindObjectMethod("GET:/factory", factory(), "Health")',
        '  api := server.Group("/api")',
        '  api.BindObjectMethod("GET:/not-server", controller, "Health")',
        "  server = replacement()",
        '  server.BindObjectMethod("GET:/rebound", controller, "Health")',
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts GoFrame callback Group routes and local object-method handlers with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/goframe-callback.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  "context"',
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  ghttp "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type ListReq struct {",
        '  g.Meta `path:"/users" method:"get"`',
        "}",
        "",
        "type Controller struct{}",
        "",
        "func (c *Controller) List(ctx context.Context, req *ListReq) (res *ListRes, err error) {",
        "  return",
        "}",
        "",
        "func (c *Controller) Total(r *ghttp.Request) {}",
        "",
        "func health(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        "  replacement := new(Controller)",
        '  server.BindHandler("GET:/total", controller.Total)',
        '  server.BindHandler("PATCH:/new", replacement.Total)',
        '  server.Group("/api", func(group *ghttp.RouterGroup) {',
        '    group.GET("/health", health)',
        '    group.POST("/method", controller.Total)',
        "    group.Bind(&Controller{})",
        '    group.Group("/v1", func(v1 *ghttp.RouterGroup) {',
        '      v1.PUT("/nested", controller.Total)',
        "    })",
        "  })",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /total",
        "cmd/server/goframe-callback.go#Controller.Total",
        "framework.goframe.direct-server.bind-handler.local-object-method",
        "exact",
        1
      ],
      [
        "PATCH /new",
        "cmd/server/goframe-callback.go#Controller.Total",
        "framework.goframe.direct-server.bind-handler.local-object-method",
        "exact",
        1
      ],
      [
        "GET /api/health",
        "cmd/server/goframe-callback.go#health",
        "framework.goframe.direct-group.http-method.local-function",
        "exact",
        1
      ],
      [
        "POST /api/method",
        "cmd/server/goframe-callback.go#Controller.Total",
        "framework.goframe.direct-group.http-method.local-object-method",
        "exact",
        1
      ],
      [
        "PUT /api/v1/nested",
        "cmd/server/goframe-callback.go#Controller.Total",
        "framework.goframe.direct-group.http-method.local-object-method",
        "exact",
        1
      ],
      [
        "GET /api/users",
        "cmd/server/goframe-callback.go#Controller.List",
        "framework.goframe.standard-router.g-meta.direct-bound-controller.local-method",
        "exact",
        1
      ]
    ]);
  });

  it("extracts literal GoFrame Map and ALLMap batch routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/goframe-map.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  ghttp "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type Controller struct{}",
        "",
        "func list(r *ghttp.Request) {}",
        "func create(r *ghttp.Request) {}",
        "func (c *Controller) Update(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        "  controller := &Controller{}",
        '  api := server.Group("/api")',
        "  api.Map(g.Map{",
        '    "GET:    /users": list, // list users',
        '    "POST:/users": create,',
        '    "PATCH: /users/:id": controller.Update,',
        "  })",
        "  api.ALLMap(g.Map{",
        '    "/health": list, // health check',
        '    "/status": controller.Update, /* status endpoint */',
        "  })",
        '  server.Group("/callback", func(group *ghttp.RouterGroup) {',
        "    group.Map(g.Map{",
        '      "DELETE: /users/:id": controller.Update,',
        "    })",
        '    group.ALLMap(g.Map{"/ping": list})',
        "  })",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /api/users",
        "cmd/server/goframe-map.go#list",
        "framework.goframe.group.map.local-function",
        "exact",
        1
      ],
      [
        "POST /api/users",
        "cmd/server/goframe-map.go#create",
        "framework.goframe.group.map.local-function",
        "exact",
        1
      ],
      [
        "PATCH /api/users/:id",
        "cmd/server/goframe-map.go#Controller.Update",
        "framework.goframe.group.map.local-object-method",
        "exact",
        1
      ],
      [
        "ALL /api/health",
        "cmd/server/goframe-map.go#list",
        "framework.goframe.group.all-map.local-function",
        "exact",
        1
      ],
      [
        "ALL /api/status",
        "cmd/server/goframe-map.go#Controller.Update",
        "framework.goframe.group.all-map.local-object-method",
        "exact",
        1
      ],
      [
        "DELETE /callback/users/:id",
        "cmd/server/goframe-map.go#Controller.Update",
        "framework.goframe.group.map.local-object-method",
        "exact",
        1
      ],
      [
        "ALL /callback/ping",
        "cmd/server/goframe-map.go#list",
        "framework.goframe.group.all-map.local-function",
        "exact",
        1
      ]
    ]);
  });

  it("rejects unsupported GoFrame batch map forms without projecting partial routes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/unproven-goframe-map.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  ghttp "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "func health(r *ghttp.Request) {}",
        "",
        "func main() {",
        "  server := g.Server()",
        '  api := server.Group("/api")',
        '  dynamicRule := "GET:/dynamic"',
        '  api.Map(g.Map{dynamicRule: health, "GET:/otherwise-valid": health})',
        '  api.ALLMap(g.Map{"GET:/wrong-method": health})',
        '  api.Map(map[string]interface{}{"GET:/raw-map": health})',
        '  api.Map(g.Map{"GET:/inline": func(r *ghttp.Request) {}})',
        '  api.Map(g.Map{"GET:/factory": handlerFactory()})',
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("rejects unproven GoFrame direct and standard-router shapes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/unproven-goframe.go",
      language: "go",
      sourceText: [
        "package main",
        "",
        "import (",
        '  "context"',
        '  g "github.com/gogf/gf/v2/frame/g"',
        '  ghttp "github.com/gogf/gf/v2/net/ghttp"',
        ")",
        "",
        "type GoodReq struct {",
        '  g.Meta `path:"/good" method:"get"`',
        "}",
        "",
        "type InvalidMethodReq struct {",
        '  g.Meta `path:"/invalid" method:"GET,POST"`',
        "}",
        "",
        "type WrongReq struct {",
        '  g.Meta `path:"/wrong" method:"get"`',
        "}",
        "",
        "type Controller struct{}",
        "type WrongController struct{}",
        "",
        "func (c *Controller) Good(ctx context.Context, req *GoodReq) (res *GoodRes, err error) { return }",
        "func (c *Controller) Invalid(ctx context.Context, req *InvalidMethodReq) (res *InvalidRes, err error) { return }",
        "func (c *WrongController) Wrong(ctx context.Context, req *DifferentReq) (res *WrongRes, err error) { return }",
        "func directHandler(ctx context.Context, req *DirectReq) (res *DirectRes, err error) { return }",
        "",
        "func shadowed(g int) {",
        "  server := g.Server()",
        '  server.BindHandler("GET:/shadowed", directHandler)',
        "}",
        "",
        "func mismatched() {",
        "  server := g.Server()",
        "  server.Bind(&WrongController{})",
        "}",
        "",
        "func main() {",
        "  server := g.Server()",
        '  server.BindHandler("GET:/inline", func(ctx context.Context, req *DirectReq) (res *DirectRes, err error) { return })',
        "  pattern := \"GET:/dynamic\"",
        "  server.BindHandler(pattern, directHandler)",
        '  server.BindHandler("GET:/host@localhost", directHandler)',
        "  controller := &Controller{}",
        "  controller = replacement()",
        '  server.BindHandler("GET:/object", controller.Good)',
        '  objectAPI := server.Group("/object")',
        '  objectAPI.GET("/method", controller.Good)',
        '  callbackPrefix := "/callback"',
        "  server.Group(callbackPrefix, func(group *ghttp.RouterGroup) {",
        "    group.Bind(&Controller{})",
        "  })",
        "  server = replacement()",
        '  server.BindHandler("GET:/rebound", directHandler)',
        '  api := g.Server().Group("/api")',
        "  api.Bind(&Controller{})",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Java Spring Web literal controller method mappings with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/api/UserController.java",
      language: "java",
      sourceText: [
        "import org.springframework.web.bind.annotation.RestController;",
        "import org.springframework.web.bind.annotation.RequestMapping;",
        "import org.springframework.web.bind.annotation.GetMapping;",
        "import org.springframework.web.bind.annotation.PostMapping;",
        "import org.springframework.web.bind.annotation.DeleteMapping;",
        "",
        "@RestController",
        "@RequestMapping(\"/api/users\")",
        "public class UserController {",
        "  @GetMapping",
        "  public String listUsers() { return \"[]\"; }",
        "",
        "  @PostMapping(path = \"/\")",
        "  public String createUser() { return \"created\"; }",
        "",
        "  @DeleteMapping(value = \"/{id}\")",
        "  public void deleteUser() {}",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /api/users",
        "src/api/UserController.java#UserController.listUsers",
        "framework.spring-web.direct-controller.literal-method-mapping.local-method",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /api/users",
        "src/api/UserController.java#UserController.createUser",
        "framework.spring-web.direct-controller.literal-method-mapping.local-method",
        "syntax",
        "exact",
        1
      ],
      [
        "DELETE /api/users/{id}",
        "src/api/UserController.java#UserController.deleteUser",
        "framework.spring-web.direct-controller.literal-method-mapping.local-method",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("accepts fully-qualified Java Spring annotations as direct route evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/api/StatusController.java",
      language: "java",
      sourceText: [
        "@org.springframework.web.bind.annotation.RestController",
        "@org.springframework.web.bind.annotation.RequestMapping(\"/system\")",
        "class StatusController {",
        "  @org.springframework.web.bind.annotation.GetMapping(\"/health\")",
        "  String health() { return \"ok\"; }",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "GET /system/health",
        "src/api/StatusController.java#StatusController.health",
        "framework.spring-web.direct-controller.literal-method-mapping.local-method"
      ]
    ]);
  });

  it("accepts direct Spring Controller, PutMapping, and PatchMapping imports", () => {
    const facts = extractFileFacts({
      filePath: "src/api/SettingsController.java",
      language: "java",
      sourceText: [
        "import org.springframework.stereotype.Controller;",
        "import org.springframework.web.bind.annotation.PutMapping;",
        "import org.springframework.web.bind.annotation.PatchMapping;",
        "",
        "@Controller",
        "class SettingsController {",
        "  @PutMapping(\"/settings\")",
        "  String replace() { return \"ok\"; }",
        "",
        "  @PatchMapping(value = \"/settings\")",
        "  String patch() { return \"ok\"; }",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "PUT /settings",
        "src/api/SettingsController.java#SettingsController.replace",
        "framework.spring-web.direct-controller.literal-method-mapping.local-method"
      ],
      [
        "PATCH /settings",
        "src/api/SettingsController.java#SettingsController.patch",
        "framework.spring-web.direct-controller.literal-method-mapping.local-method"
      ]
    ]);
  });

  it("rejects Java Spring mappings without direct import proof or literal paths", () => {
    const facts = extractFileFacts({
      filePath: "src/api/UnprovenController.java",
      language: "java",
      sourceText: [
        "import org.springframework.web.bind.annotation.RestController;",
        "import org.springframework.web.bind.annotation.RequestMapping;",
        "import org.springframework.web.bind.annotation.GetMapping;",
        "",
        "@RestController",
        "@RequestMapping(basePath)",
        "class DynamicPrefixController {",
        "  @GetMapping(\"/users\")",
        "  String users() { return \"[]\"; }",
        "}",
        "",
        "@RestController",
        "@RequestMapping(\"/unproved\")",
        "class DynamicMethodController {",
        "  @GetMapping(basePath)",
        "  String dynamic() { return \"[]\"; }",
        "}",
        "",
        "class PlainClass {",
        "  @GetMapping(\"/not-a-controller\")",
        "  String plain() { return \"[]\"; }",
        "}",
        "",
        "@RestController",
        "@RequestMapping(\"/legacy\")",
        "class LegacyController {",
        "  @RequestMapping(\"/request-mapping-method\")",
        "  String legacy() { return \"[]\"; }",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("requires direct Java Spring imports instead of trusting wildcard annotation imports", () => {
    const facts = extractFileFacts({
      filePath: "src/api/WildcardController.java",
      language: "java",
      sourceText: [
        "import org.springframework.web.bind.annotation.RestController;",
        "import org.springframework.web.bind.annotation.*;",
        "",
        "@RestController",
        "class WildcardController {",
        "  @GetMapping(\"/unproven\")",
        "  String unproven() { return \"[]\"; }",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("fails closed for Java syntax errors instead of emitting partial declarations or routes", () => {
    const facts = extractFileFacts({
      filePath: "src/api/BrokenController.java",
      language: "java",
      sourceText: [
        "import org.springframework.web.bind.annotation.RestController;",
        "import org.springframework.web.bind.annotation.GetMapping;",
        "",
        "@RestController",
        "class BrokenController {",
        "  @GetMapping(\"/health\")",
        "  String health( { return \"ok\"; }",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "class")).toEqual([]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "method")).toEqual([]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Micronaut Controller routes with literal URI evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/api/IssuesController.java",
      language: "java",
      sourceText: [
        "import io.micronaut.http.annotation.Controller;",
        "import io.micronaut.http.annotation.Get;",
        "import io.micronaut.http.annotation.Post;",
        "import io.micronaut.http.annotation.Put;",
        "import io.micronaut.http.annotation.Patch;",
        "import io.micronaut.http.annotation.Delete;",
        "import io.micronaut.http.annotation.Head;",
        "import io.micronaut.http.annotation.Options;",
        "import io.micronaut.http.annotation.Trace;",
        "",
        "@Controller(\"/issues\")",
        "class IssuesController {",
        "  @Get",
        "  String list() { return \"[]\"; }",
        "  @Get(uri = \"/{number}\")",
        "  String show() { return \"{}\"; }",
        "  @Post(value = \"/\")",
        "  String create() { return \"{}\"; }",
        "  @Put(\"/{number}\")",
        "  String replace() { return \"{}\"; }",
        "  @Patch(\"/{number}\")",
        "  String patch() { return \"{}\"; }",
        "  @Delete(\"/{number}\")",
        "  String delete() { return \"{}\"; }",
        "  @Head(\"/{number}\")",
        "  String head() { return \"\"; }",
        "  @Options",
        "  String options() { return \"\"; }",
        "  @Trace(\"/debug\")",
        "  String trace() { return \"\"; }",
        "}",
        "",
        "@io.micronaut.http.annotation.Controller",
        "class FullyQualifiedStatusController {",
        "  @io.micronaut.http.annotation.Get(\"/health\")",
        "  String health() { return \"ok\"; }",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.range.start.line,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /issues",
        "src/api/IssuesController.java#IssuesController.list",
        "framework.micronaut.direct-controller.literal-method-mapping.local-method",
        13,
        "exact",
        1
      ],
      [
        "GET /issues/{number}",
        "src/api/IssuesController.java#IssuesController.show",
        "framework.micronaut.direct-controller.literal-method-mapping.local-method",
        15,
        "exact",
        1
      ],
      [
        "POST /issues",
        "src/api/IssuesController.java#IssuesController.create",
        "framework.micronaut.direct-controller.literal-method-mapping.local-method",
        17,
        "exact",
        1
      ],
      [
        "PUT /issues/{number}",
        "src/api/IssuesController.java#IssuesController.replace",
        "framework.micronaut.direct-controller.literal-method-mapping.local-method",
        19,
        "exact",
        1
      ],
      [
        "PATCH /issues/{number}",
        "src/api/IssuesController.java#IssuesController.patch",
        "framework.micronaut.direct-controller.literal-method-mapping.local-method",
        21,
        "exact",
        1
      ],
      [
        "DELETE /issues/{number}",
        "src/api/IssuesController.java#IssuesController.delete",
        "framework.micronaut.direct-controller.literal-method-mapping.local-method",
        23,
        "exact",
        1
      ],
      [
        "HEAD /issues/{number}",
        "src/api/IssuesController.java#IssuesController.head",
        "framework.micronaut.direct-controller.literal-method-mapping.local-method",
        25,
        "exact",
        1
      ],
      [
        "OPTIONS /issues",
        "src/api/IssuesController.java#IssuesController.options",
        "framework.micronaut.direct-controller.literal-method-mapping.local-method",
        27,
        "exact",
        1
      ],
      [
        "TRACE /issues/debug",
        "src/api/IssuesController.java#IssuesController.trace",
        "framework.micronaut.direct-controller.literal-method-mapping.local-method",
        29,
        "exact",
        1
      ],
      [
        "GET /health",
        "src/api/IssuesController.java#FullyQualifiedStatusController.health",
        "framework.micronaut.direct-controller.literal-method-mapping.local-method",
        35,
        "exact",
        1
      ]
    ]);
  });

  it("rejects unproven, dynamic, multi-route, and metadata-bearing Micronaut mappings", () => {
    const wildcardFacts = extractFileFacts({
      filePath: "src/api/WildcardMicronautController.java",
      language: "java",
      sourceText: [
        "import io.micronaut.http.annotation.Controller;",
        "import io.micronaut.http.annotation.*;",
        "",
        "@Controller(\"/wildcard\")",
        "class WildcardMicronautController {",
        "  @Get(\"/ignored\")",
        "  String ignored() { return \"\"; }",
        "}"
      ].join("\n")
    });
    const unsupportedFacts = extractFileFacts({
      filePath: "src/api/UnsupportedMicronautController.java",
      language: "java",
      sourceText: [
        "import io.micronaut.http.annotation.Controller;",
        "import io.micronaut.http.annotation.Get;",
        "import io.micronaut.http.annotation.Post;",
        "",
        "@Controller(prefix)",
        "class DynamicMicronautController {",
        "  @Get(\"/users\")",
        "  String users() { return \"[]\"; }",
        "}",
        "",
        "@Controller(\"/multiple\")",
        "class MultipleMicronautController {",
        "  @Get(\"/one\")",
        "  @Post(\"/two\")",
        "  String multiple() { return \"\"; }",
        "}",
        "",
        "@Controller(\"/metadata\")",
        "class MetadataMicronautController {",
        "  @Get(produces = MediaType.TEXT_PLAIN)",
        "  String metadata() { return \"\"; }",
        "}"
      ].join("\n")
    });

    expect(wildcardFacts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(wildcardFacts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(unsupportedFacts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(unsupportedFacts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Jakarta REST and legacy JAX-RS Path routes with literal evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/api/CatalogResource.java",
      language: "java",
      sourceText: [
        "import jakarta.ws.rs.Path;",
        "import jakarta.ws.rs.GET;",
        "import jakarta.ws.rs.POST;",
        "import jakarta.ws.rs.PUT;",
        "import jakarta.ws.rs.PATCH;",
        "import jakarta.ws.rs.DELETE;",
        "import jakarta.ws.rs.HEAD;",
        "import jakarta.ws.rs.OPTIONS;",
        "",
        '@Path("catalog")',
        "class CatalogResource {",
        "  @GET",
        "  String index() { return \"[]\"; }",
        '  @GET @Path("{id}")',
        "  String show() { return \"{}\"; }",
        '  @POST @Path(value = "refresh")',
        "  String refresh() { return \"{}\"; }",
        '  @PUT @Path("{id}")',
        "  String replace() { return \"{}\"; }",
        '  @PATCH @Path("{id}")',
        "  String patch() { return \"{}\"; }",
        '  @DELETE @Path("{id}")',
        "  String delete() { return \"{}\"; }",
        '  @HEAD @Path("{id}")',
        "  String head() { return \"\"; }",
        "  @OPTIONS",
        "  String options() { return \"\"; }",
        "}",
        "",
        '@javax.ws.rs.Path("/legacy")',
        "class LegacyResource {",
        "  @javax.ws.rs.GET",
        "  String health() { return \"ok\"; }",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.range.start.line,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /catalog",
        "src/api/CatalogResource.java#CatalogResource.index",
        "framework.jakarta-rest.direct-path.literal-method-mapping.local-method",
        12,
        "exact",
        1
      ],
      [
        "GET /catalog/{id}",
        "src/api/CatalogResource.java#CatalogResource.show",
        "framework.jakarta-rest.direct-path.literal-method-mapping.local-method",
        14,
        "exact",
        1
      ],
      [
        "POST /catalog/refresh",
        "src/api/CatalogResource.java#CatalogResource.refresh",
        "framework.jakarta-rest.direct-path.literal-method-mapping.local-method",
        16,
        "exact",
        1
      ],
      [
        "PUT /catalog/{id}",
        "src/api/CatalogResource.java#CatalogResource.replace",
        "framework.jakarta-rest.direct-path.literal-method-mapping.local-method",
        18,
        "exact",
        1
      ],
      [
        "PATCH /catalog/{id}",
        "src/api/CatalogResource.java#CatalogResource.patch",
        "framework.jakarta-rest.direct-path.literal-method-mapping.local-method",
        20,
        "exact",
        1
      ],
      [
        "DELETE /catalog/{id}",
        "src/api/CatalogResource.java#CatalogResource.delete",
        "framework.jakarta-rest.direct-path.literal-method-mapping.local-method",
        22,
        "exact",
        1
      ],
      [
        "HEAD /catalog/{id}",
        "src/api/CatalogResource.java#CatalogResource.head",
        "framework.jakarta-rest.direct-path.literal-method-mapping.local-method",
        24,
        "exact",
        1
      ],
      [
        "OPTIONS /catalog",
        "src/api/CatalogResource.java#CatalogResource.options",
        "framework.jakarta-rest.direct-path.literal-method-mapping.local-method",
        26,
        "exact",
        1
      ],
      [
        "GET /legacy",
        "src/api/CatalogResource.java#LegacyResource.health",
        "framework.jakarta-rest.direct-path.literal-method-mapping.local-method",
        32,
        "exact",
        1
      ]
    ]);
  });

  it("rejects unproven, dynamic, multi-method, and unsupported Jakarta REST Path forms", () => {
    const wildcardFacts = extractFileFacts({
      filePath: "src/api/WildcardResource.java",
      language: "java",
      sourceText: [
        "import jakarta.ws.rs.Path;",
        "import jakarta.ws.rs.*;",
        "",
        '@Path("/wildcard")',
        "class WildcardResource {",
        "  @GET",
        "  String ignored() { return \"\"; }",
        "}"
      ].join("\n")
    });
    const unsupportedFacts = extractFileFacts({
      filePath: "src/api/UnsupportedResource.java",
      language: "java",
      sourceText: [
        "import jakarta.ws.rs.Path;",
        "import jakarta.ws.rs.GET;",
        "import jakarta.ws.rs.POST;",
        "",
        "@Path(prefix)",
        "class DynamicResource {",
        "  @GET",
        "  String index() { return \"\"; }",
        "}",
        "",
        '@Path("/multiple")',
        "class MultipleResource {",
        "  @GET @POST",
        "  String multiple() { return \"\"; }",
        "}",
        "",
        '@Path("/unsupported")',
        "class UnsupportedPathResource {",
        '  @GET @Path(path = "wrong")',
        "  String wrong() { return \"\"; }",
        "}"
      ].join("\n")
    });

    expect(wildcardFacts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(wildcardFacts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(unsupportedFacts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(unsupportedFacts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("retains direct Java Spring Boot @Value field facts with source ranges", () => {
    const facts = extractFileFacts({
      filePath: "src/config/AppConfig.java",
      language: "java",
      sourceText: [
        "import org.springframework.beans.factory.annotation.Value;",
        "",
        "class AppConfig {",
        '  @Value("${server.port}")',
        "  private String port;",
        '  @Value("${feature.enabled:false}")',
        "  private boolean enabled;",
        "}",
        "",
        "class FullyQualifiedConfig {",
        '  @org.springframework.beans.factory.annotation.Value("${app.name}")',
        "  private String name;",
        "}"
      ].join("\n")
    });
    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));

    expect(
      facts.springBootPropertiesFacts?.valueReferences.map((reference) => [
        symbolsById.get(reference.sourceId)?.name,
        reference.key,
        reference.range
      ])
    ).toEqual([
      [
        "AppConfig",
        "server.port",
        { start: { line: 4, column: 3 }, end: { line: 4, column: 27 } }
      ],
      [
        "AppConfig",
        "feature.enabled",
        { start: { line: 6, column: 3 }, end: { line: 6, column: 37 } }
      ],
      [
        "FullyQualifiedConfig",
        "app.name",
        { start: { line: 11, column: 3 }, end: { line: 11, column: 69 } }
      ]
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "references")).toEqual([]);
  });

  it("rejects non-field, unproven, dynamic, named-argument, and nested Spring @Value forms", () => {
    const directImportFacts = extractFileFacts({
      filePath: "src/config/UnsupportedValues.java",
      language: "java",
      sourceText: [
        "import org.springframework.beans.factory.annotation.Value;",
        "class UnsupportedValues {",
        '  @Value(value = "${named.argument}") private String named;',
        '  @Value("${nested.${key}}") private String nested;',
        '  @Value("${dynamic}" + suffix) private String dynamic;',
        '  @Value("${method.only}") void configure() {}',
        "}"
      ].join("\n")
    });
    const wildcardImportFacts = extractFileFacts({
      filePath: "src/config/WildcardValues.java",
      language: "java",
      sourceText: [
        "import org.springframework.beans.factory.annotation.*;",
        "class WildcardValues {",
        '  @Value("${unproven.key}") private String value;',
        "}"
      ].join("\n")
    });

    expect(directImportFacts.springBootPropertiesFacts?.valueReferences).toEqual([]);
    expect(wildcardImportFacts.springBootPropertiesFacts?.valueReferences).toEqual([]);
  });

  it("extracts direct PHP Laravel facade controller routes with same-file exact method evidence", () => {
    const facts = extractFileFacts({
      filePath: "routes/api.php",
      language: "php",
      sourceText: [
        "<?php",
        "use Illuminate\\Support\\Facades\\Route;",
        "",
        "Route::get('/health', [HealthController::class, 'show']);",
        "Route::post('health', [HealthController::class, 'replace']);",
        "Route::any('/fallback', [HealthController::class, 'fallback']);",
        "",
        "class HealthController {",
        "  public function show(): string { return 'ok'; }",
        "  public function replace(): string { return 'saved'; }",
        "  public function fallback(): string { return 'fallback'; }",
        "}",
        "",
        "function standalone(): void {}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.name)).toEqual([
      "standalone"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.referenceName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "routes/api.php#HealthController.show",
        "HealthController@show",
        "framework.laravel.direct-facade.literal-controller-action.local-method",
        "exact",
        1
      ],
      [
        "POST /health",
        "routes/api.php#HealthController.replace",
        "HealthController@replace",
        "framework.laravel.direct-facade.literal-controller-action.local-method",
        "exact",
        1
      ],
      [
        "ALL /fallback",
        "routes/api.php#HealthController.fallback",
        "HealthController@fallback",
        "framework.laravel.direct-facade.literal-controller-action.local-method",
        "exact",
        1
      ]
    ]);
  });

  it("retains explicit unresolved PHP Laravel controller actions without guessing cross-file targets", () => {
    const facts = extractFileFacts({
      filePath: "routes/web.php",
      language: "php",
      sourceText: [
        "<?php",
        "use Illuminate\\Support\\Facades\\Route as WebRoute;",
        "",
        "WebRoute::options('/users', [App\\Http\\Controllers\\UserController::class, 'options']);",
        "\\Illuminate\\Support\\Facades\\Route::delete('/users/{user}', [UserController::class, 'destroy']);"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          edge.targetId,
          edge.referenceName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "OPTIONS /users",
        null,
        "App\\Http\\Controllers\\UserController@options",
        "framework.laravel.direct-facade.literal-controller-action.unresolved-controller-method",
        "unresolved",
        0
      ],
      [
        "DELETE /users/{user}",
        null,
        "UserController@destroy",
        "framework.laravel.direct-facade.literal-controller-action.unresolved-controller-method",
        "unresolved",
        0
      ]
    ]);
  });

  it("rejects unproven or dynamic PHP Laravel route registrations and fails closed on syntax errors", () => {
    const unproven = extractFileFacts({
      filePath: "routes/unproven.php",
      language: "php",
      sourceText: [
        "<?php",
        "use Illuminate\\Support\\Facades\\Route;",
        "",
        "Route::get($path, [UsersController::class, 'index']);",
        "Route::get('/closures', function () {});",
        "Route::resource('/users', UsersController::class);",
        "OtherRoute::get('/wrong', [UsersController::class, 'index']);"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "routes/broken.php",
      language: "php",
      sourceText: [
        "<?php",
        "use Illuminate\\Support\\Facades\\Route;",
        "Route::get('/health', [HealthController::class, 'show']);",
        "class HealthController { public function show( { return 'ok'; } }"
      ].join("\n")
    });

    expect(unproven.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(unproven.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "class")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "method")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(broken.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct C CivetWeb literal request-handler routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/server.c",
      language: "c",
      sourceText: [
        "#include <civetweb.h>",
        "",
        "static int health(struct mg_connection *conn, void *ignored) { return 200; }",
        "static int user(struct mg_connection *conn, void *ignored) { return 200; }",
        "",
        "void configure_routes(struct mg_context *ctx) {",
        '  mg_set_request_handler(ctx, "/health", health, NULL);',
        '  mg_set_request_handler(ctx, "/users/:id", user, 0);',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/server.c#health",
      "src/server.c#user",
      "src/server.c#configure_routes"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "ALL /health",
        "src/server.c#health",
        "framework.civetweb.direct-request-handler.literal-uri.local-function",
        "exact",
        1
      ],
      [
        "ALL /users/:id",
        "src/server.c#user",
        "framework.civetweb.direct-request-handler.literal-uri.local-function",
        "exact",
        1
      ]
    ]);
  });

  it("accepts direct C quoted CivetWeb headers", () => {
    const facts = extractFileFacts({
      filePath: "src/quoted.c",
      language: "c",
      sourceText: [
        '#include "civetweb.h"',
        "int health(void) { return 200; }",
        "void configure(struct mg_context *ctx) {",
        '  mg_set_request_handler(ctx, "/health", health, NULL);',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "ALL /health",
        "src/quoted.c#health",
        "framework.civetweb.direct-request-handler.literal-uri.local-function"
      ]
    ]);
  });

  it("requires direct C CivetWeb header, literal URI, unique unshadowed local handler, and valid syntax", () => {
    const missingHeader = extractFileFacts({
      filePath: "src/missing-header.c",
      language: "c",
      sourceText: [
        "int health(void) { return 200; }",
        "void configure(struct mg_context *ctx) {",
        '  mg_set_request_handler(ctx, "/health", health, NULL);',
        "}"
      ].join("\n")
    });
    const dynamic = extractFileFacts({
      filePath: "src/dynamic.c",
      language: "c",
      sourceText: [
        "#include <civetweb.h>",
        "int health(void) { return 200; }",
        "void configure(struct mg_context *ctx) {",
        '  const char *path = "/health";',
        "  mg_set_request_handler(ctx, path, health, NULL);",
        "}"
      ].join("\n")
    });
    const shadowed = extractFileFacts({
      filePath: "src/shadowed.c",
      language: "c",
      sourceText: [
        "#include <civetweb.h>",
        "int health(void) { return 200; }",
        "void configure(struct mg_context *ctx) {",
        "  int health = 0;",
        '  mg_set_request_handler(ctx, "/health", health, NULL);',
        "}"
      ].join("\n")
    });
    const duplicate = extractFileFacts({
      filePath: "src/duplicate.c",
      language: "c",
      sourceText: [
        "#include <civetweb.h>",
        "int health(void) { return 200; }",
        "int health(void) { return 201; }",
        "void configure(struct mg_context *ctx) {",
        '  mg_set_request_handler(ctx, "/health", health, NULL);',
        "}"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "src/broken.c",
      language: "c",
      sourceText: [
        "#include <civetweb.h>",
        "int health(void) { return 200; }",
        "void configure( {",
        '  mg_set_request_handler(ctx, "/health", health, NULL);',
        "}"
      ].join("\n")
    });

    for (const facts of [missingHeader, dynamic, shadowed, duplicate, broken]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(broken.symbols.filter((symbol) => symbol.kind === "function")).toEqual([]);
  });

  it("extracts direct Lua Lapis literal routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/app.lua",
      language: "lua",
      sourceText: [
        'local lapis = require("lapis")',
        "local app = lapis.Application()",
        "",
        "local function health(self)",
        '  return "ok"',
        "end",
        "local function create_user(self)",
        '  return "created"',
        "end",
        "local function remove_user(self)",
        '  return "deleted"',
        "end",
        "",
        'app:get("/health", health)',
        'app:post("create-user", "/users", create_user)',
        'app:match("/users/:id", remove_user)'
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)
    ).toEqual(["src/app.lua#health", "src/app.lua#create_user", "src/app.lua#remove_user"]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/app.lua#health",
        "framework.lapis.direct-application.literal-route.local-function",
        "exact",
        1
      ],
      [
        "POST /users",
        "src/app.lua#create_user",
        "framework.lapis.direct-application.literal-route.local-function",
        "exact",
        1
      ],
      [
        "ALL /users/:id",
        "src/app.lua#remove_user",
        "framework.lapis.direct-application.literal-route.local-function",
        "exact",
        1
      ]
    ]);
  });

  it("accepts a direct Lua require(\"lapis\").Application binding", () => {
    const facts = extractFileFacts({
      filePath: "src/direct.lua",
      language: "lua",
      sourceText: [
        'local app = require("lapis").Application()',
        "local function remove_user(self)",
        '  return "deleted"',
        "end",
        'app:delete("/users/:id", remove_user)'
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "DELETE /users/:id",
        "src/direct.lua#remove_user",
        "framework.lapis.direct-application.literal-route.local-function"
      ]
    ]);
  });

  it("requires direct Lua Lapis bindings, literal paths, local handlers before registration, no rebinding, and balanced syntax", () => {
    const missingFramework = extractFileFacts({
      filePath: "src/missing-framework.lua",
      language: "lua",
      sourceText: [
        "local app = make_app()",
        "local function health(self)",
        "end",
        'app:get("/health", health)'
      ].join("\n")
    });
    const dynamicPath = extractFileFacts({
      filePath: "src/dynamic.lua",
      language: "lua",
      sourceText: [
        'local lapis = require("lapis")',
        "local app = lapis.Application()",
        "local function health(self)",
        "end",
        'local path = "/health"',
        "app:get(path, health)"
      ].join("\n")
    });
    const inlineHandler = extractFileFacts({
      filePath: "src/inline.lua",
      language: "lua",
      sourceText: [
        'local lapis = require("lapis")',
        "local app = lapis.Application()",
        'app:get("/health", function(self)',
        "  return \"ok\"",
        "end)"
      ].join("\n")
    });
    const reboundHandler = extractFileFacts({
      filePath: "src/rebound.lua",
      language: "lua",
      sourceText: [
        'local lapis = require("lapis")',
        "local app = lapis.Application()",
        "local function health(self)",
        "end",
        "fallback, health = fallback, fallback",
        'app:get("/health", health)'
      ].join("\n")
    });
    const lateHandler = extractFileFacts({
      filePath: "src/late.lua",
      language: "lua",
      sourceText: [
        'local lapis = require("lapis")',
        "local app = lapis.Application()",
        'app:get("/health", health)',
        "local function health(self)",
        "end"
      ].join("\n")
    });
    const tableWrappedRoute = extractFileFacts({
      filePath: "src/table.lua",
      language: "lua",
      sourceText: [
        'local lapis = require("lapis")',
        "local app = lapis.Application()",
        "local function health(self)",
        "end",
        "local routes = {",
        '  app:get("/health", health)',
        "}"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "src/broken.lua",
      language: "lua",
      sourceText: [
        'local lapis = require("lapis")',
        "local app = lapis.Application()",
        "local function health(self)",
        '  return "ok"',
        'app:get("/health", health)'
      ].join("\n")
    });

    for (const facts of [
      missingFramework,
      dynamicPath,
      inlineHandler,
      reboundHandler,
      lateHandler,
      tableWrappedRoute,
      broken
    ]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(broken.symbols.filter((symbol) => symbol.kind === "function")).toEqual([]);
  });

  it("extracts Luau-compatible top-level functions while keeping Lua-only Lapis routes disabled", () => {
    const facts = extractFileFacts({
      filePath: "src/avatar.luau",
      language: "luau",
      sourceText: [
        "--!strict",
        "export type Avatar = { id: number }",
        "",
        "local function greet(avatar: Avatar): string",
        '  return "hello"',
        "end",
        "",
        "export function publish(avatar: Avatar): boolean",
        "  return avatar.id > 0",
        "end",
        "",
        'local app = require("lapis").Application()',
        'app:get("/ignored", greet)'
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "src/broken.luau",
      language: "luau",
      sourceText: ["--!strict", "local function incomplete(value: number): number", "  return value"].join(
        "\n"
      )
    });
    const indirect = extractFileFacts({
      filePath: "src/indirect.luau",
      language: "luau",
      sourceText: ["local callback = function not_a_declaration()", "  return true", "end"].join("\n")
    });

    expect(
      facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)
    ).toEqual(["src/avatar.luau#greet", "src/avatar.luau#publish"]);
    expect(facts.symbols.find((symbol) => symbol.qualifiedName === "src/avatar.luau#publish")).toMatchObject({
      isExported: true
    });
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(broken.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
    expect(indirect.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
  });

  it("extracts complete direct Pascal routines while rejecting declarations and malformed source", () => {
    const facts = extractFileFacts({
      filePath: "src/health.pas",
      language: "pascal",
      sourceText: [
        "unit Health;",
        "",
        "interface",
        "procedure DeclaredOnly;",
        "",
        "implementation",
        "",
        "procedure THealthService.Ping;",
        "begin",
        "  { function ignored; }",
        "end;",
        "",
        "class procedure THealthService.Reset;",
        "begin",
        "  (* procedure ignored; *)",
        "end;",
        "",
        "function Add(left, right: Integer): Integer;",
        "var",
        "  labelText: string;",
        "begin",
        "  labelText := 'procedure ignored;';",
        "  case left of",
        "    0: Result := right;",
        "  else",
        "    Result := left + right;",
        "  end;",
        "end;",
        "",
        "  procedure NestedButIndented;",
        "  begin",
        "  end;",
        "",
        "procedure InlineRoutine; begin end;",
        "",
        "procedure Broken;",
        "begin",
        "  Result := 1;",
        "end."
      ].join("\n")
    });
    const malformed = extractFileFacts({
      filePath: "src/broken.pas",
      language: "pascal",
      sourceText: ["procedure ValidButIgnored;", "begin", "end;", "(*"].join("\n")
    });

    expect(
      facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)
    ).toEqual([
      "src/health.pas#THealthService.Ping",
      "src/health.pas#THealthService.Reset",
      "src/health.pas#Add",
      "src/health.pas#InlineRoutine"
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "contains")).toHaveLength(4);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(malformed.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
  });

  it("extracts direct Objective-C interface declarations and implementation methods while rejecting unsupported forms", () => {
    const facts = extractFileFacts({
      filePath: "src/health.m",
      language: "objc",
      sourceText: [
        "#import <Foundation/Foundation.h>",
        "",
        "@interface HealthController : NSObject",
        "- (void)declarationOnly;",
        "@end",
        "",
        "/*",
        "@implementation CommentGhost",
        "@end",
        "*/",
        "#define DEFINE_GHOST \\",
        "@implementation MacroGhost \\",
        "@end",
        "",
        "@implementation HealthController",
        "- (void)health {",
        '  NSString *message = @"@implementation StringGhost";',
        "}",
        "+ (instancetype)shared {",
        "  return nil;",
        "}",
        "- (void)create:(NSString *)name with:(id)context {",
        "  (void)name;",
        "  (void)context;",
        "}",
        "- (void)declaredOnly;",
        "- (void)multiLine:",
        "  (NSString *)name {",
        "}",
        "@end",
        "",
        "@implementation HealthController (Diagnostics)",
        "- (void)ignored {",
        "}",
        "@end"
      ].join("\n")
    });
    const malformed = extractFileFacts({
      filePath: "src/broken.m",
      language: "objc",
      sourceText: ["@implementation Broken", "- (void)incomplete {"].join("\n")
    });

    expect(
      facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)
    ).toEqual(["src/health.m#HealthController"]);
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "method").map((symbol) => symbol.qualifiedName)
    ).toEqual([
      "src/health.m#HealthController.declarationOnly",
      "src/health.m#HealthController.health",
      "src/health.m#HealthController.shared",
      "src/health.m#HealthController.create:with:"
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "contains")).toHaveLength(5);
    expect(
      facts.edges.filter((edge) => edge.kind === "contains").map((edge) => edge.evidence?.ruleId)
    ).toEqual([
      "language.objc.interface.direct",
      "language.objc.method.direct-declaration",
      "language.objc.method.direct-implementation",
      "language.objc.method.direct-implementation",
      "language.objc.method.direct-implementation"
    ]);
    expect(malformed.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
  });

  it("extracts direct Objective-C protocol declarations, prefers implementations, and ignores categories", () => {
    const facts = extractFileFacts({
      filePath: "src/contracts.mm",
      language: "objc",
      sourceText: [
        "@interface HealthController : NSObject <HealthChecking>",
        "{",
        "  int status;",
        "}",
        "- (void)declaredOnly;",
        "- (void)create:(NSString *)name with:(id)context;",
        "@end",
        "",
        "@protocol HealthChecking <NSObject>",
        "@required",
        "- (BOOL)isHealthy;",
        "@optional",
        "+ (void)reset;",
        "@end",
        "",
        "@interface HealthController (Diagnostics)",
        "- (void)diagnose;",
        "@end",
        "",
        "@interface HealthController ()",
        "- (void)privateProbe;",
        "@end",
        "",
        "@implementation HealthController",
        "- (void)create:(NSString *)name with:(id)context {",
        "  (void)name;",
        "  (void)context;",
        "}",
        "@end"
      ].join("\n")
    });
    const malformedProtocol = extractFileFacts({
      filePath: "src/broken-protocol.m",
      language: "objc",
      sourceText: ["@protocol Broken", "- (void)unfinished;"].join("\n")
    });

    expect(
      facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)
    ).toEqual(["src/contracts.mm#HealthController"]);
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "interface").map((symbol) => symbol.qualifiedName)
    ).toEqual(["src/contracts.mm#protocol:HealthChecking"]);
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "method").map((symbol) => symbol.qualifiedName)
    ).toEqual([
      "src/contracts.mm#HealthController.declaredOnly",
      "src/contracts.mm#HealthController.create:with:",
      "src/contracts.mm#protocol:HealthChecking.isHealthy",
      "src/contracts.mm#protocol:HealthChecking.reset"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "contains")
        .map((edge) => [edge.referenceName, edge.evidence?.ruleId])
    ).toEqual([
      ["HealthController", "language.objc.interface.direct"],
      ["declaredOnly", "language.objc.method.direct-declaration"],
      ["create:with:", "language.objc.method.direct-implementation"],
      ["HealthChecking", "language.objc.protocol.direct"],
      ["isHealthy", "language.objc.method.direct-declaration"],
      ["reset", "language.objc.method.direct-declaration"]
    ]);
    expect(facts.symbols.some((symbol) => symbol.name === "diagnose")).toBe(false);
    expect(facts.symbols.some((symbol) => symbol.name === "privateProbe")).toBe(false);
    expect(malformedProtocol.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
  });

  it("extracts direct Horse Get/Post/Put/Patch/Delete/Head routes only from a proven Pascal program main block", () => {
    const facts = extractFileFacts({
      filePath: "src/server.dpr",
      language: "pascal",
      sourceText: [
        "program Server;",
        "",
        "uses Horse;",
        "",
        "procedure Health(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "procedure CreateUser(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "procedure UpdateUser(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "procedure PatchUser(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "procedure DeleteUser(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "procedure HeadHealth(Req: THorseRequest; Res: THorseResponse);",
        "begin",
        "end;",
        "",
        "begin",
        "  THorse.Get('/health', health);",
        "  THorse.Post('/users', CreateUser);",
        "  THorse.Put('/users', UpdateUser);",
        "  THorse.Patch('/users', PatchUser);",
        "  THorse.Delete('/users', DeleteUser);",
        "  THorse.Head('/health', HeadHealth);",
        "  THorse.Options('/unsupported', Health);",
        "  if True then",
        "  begin",
        "    THorse.Get('/nested', Health);",
        "  end;",
        "end."
      ].join("\n")
    });
    const missingProof = extractFileFacts({
      filePath: "src/missing-proof.dpr",
      language: "pascal",
      sourceText: [
        "program MissingProof;",
        "",
        "uses System.SysUtils;",
        "",
        "procedure Health;",
        "begin",
        "end;",
        "",
        "begin",
        "  THorse.Get('/ignored', Health);",
        "end."
      ].join("\n")
    });
    const combinedUses = extractFileFacts({
      filePath: "src/combined-uses.dpr",
      language: "pascal",
      sourceText: [
        "program CombinedUses;",
        "",
        "uses Horse, System.SysUtils;",
        "",
        "procedure Health;",
        "begin",
        "end;",
        "",
        "begin",
        "  THorse.Get('/ignored', Health);",
        "end."
      ].join("\n")
    });
    const duplicateUses = extractFileFacts({
      filePath: "src/duplicate-uses.dpr",
      language: "pascal",
      sourceText: [
        "program DuplicateUses;",
        "",
        "uses Horse;",
        "uses Horse;",
        "",
        "procedure Health;",
        "begin",
        "end;",
        "",
        "begin",
        "  THorse.Get('/ignored', Health);",
        "end."
      ].join("\n")
    });
    const lateHandler = extractFileFacts({
      filePath: "src/late-handler.dpr",
      language: "pascal",
      sourceText: [
        "program LateHandler;",
        "",
        "uses Horse;",
        "",
        "begin",
        "  THorse.Get('/ignored', Health);",
        "end.",
        "",
        "procedure Health;",
        "begin",
        "end;"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)).toEqual([
      "GET /health",
      "POST /users",
      "PUT /users",
      "PATCH /users",
      "DELETE /users",
      "HEAD /health"
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toMatchObject([
      {
        referenceName: "Health",
        resolution: "exact",
        evidence: {
          ruleId: "framework.horse.direct-uses.literal-route.local-routine",
          candidateSymbolIds: expect.any(Array)
        }
      },
      {
        referenceName: "CreateUser",
        resolution: "exact",
        evidence: {
          ruleId: "framework.horse.direct-uses.literal-route.local-routine",
          candidateSymbolIds: expect.any(Array)
        }
      },
      {
        referenceName: "UpdateUser",
        resolution: "exact",
        evidence: {
          ruleId: "framework.horse.direct-uses.literal-route.local-routine",
          candidateSymbolIds: expect.any(Array)
        }
      },
      {
        referenceName: "PatchUser",
        resolution: "exact",
        evidence: {
          ruleId: "framework.horse.direct-uses.literal-route.local-routine",
          candidateSymbolIds: expect.any(Array)
        }
      },
      {
        referenceName: "DeleteUser",
        resolution: "exact",
        evidence: {
          ruleId: "framework.horse.direct-uses.literal-route.local-routine",
          candidateSymbolIds: expect.any(Array)
        }
      },
      {
        referenceName: "HeadHealth",
        resolution: "exact",
        evidence: {
          ruleId: "framework.horse.direct-uses.literal-route.local-routine",
          candidateSymbolIds: expect.any(Array)
        }
      }
    ]);
    expect(missingProof.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(combinedUses.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(duplicateUses.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(lateHandler.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
  });

  it("extracts a source-proven COBOL program and direct Procedure Division paragraphs", () => {
    const facts = extractFileFacts({
      filePath: "src/billing.cob",
      language: "cobol",
      sourceText: [
        "       IDENTIFICATION DIVISION.",
        "       PROGRAM-ID. BILLING-REPORT.",
        "       PROCEDURE DIVISION.",
        "       MAIN-LOGIC.",
        "           DISPLAY \"FAKE-PARAGRAPH.\".",
        "           GOBACK.",
        "       FINISH-REPORT.",
        "           GOBACK.",
        "       END PROGRAM BILLING-REPORT."
      ].join("\n")
    });
    const copybook = extractFileFacts({
      filePath: "copybooks/customer.cpy",
      language: "cobol",
      sourceText: ["       01 CUSTOMER-NAME PIC X(30)."].join("\n")
    });
    const programShapedCopybook = extractFileFacts({
      filePath: "copybooks/embedded.cpy",
      language: "cobol",
      sourceText: [
        "       IDENTIFICATION DIVISION.",
        "       PROGRAM-ID. EMBEDDED.",
        "       PROCEDURE DIVISION.",
        "       MAIN-LOGIC.",
        "           GOBACK."
      ].join("\n")
    });
    const multiplePrograms = extractFileFacts({
      filePath: "src/multiple.cbl",
      language: "cobol",
      sourceText: [
        "       IDENTIFICATION DIVISION.",
        "       PROGRAM-ID. FIRST.",
        "       PROCEDURE DIVISION.",
        "       FIRST-LOGIC.",
        "           GOBACK.",
        "       END PROGRAM FIRST.",
        "       IDENTIFICATION DIVISION.",
        "       PROGRAM-ID. SECOND.",
        "       PROCEDURE DIVISION."
      ].join("\n")
    });
    const unterminatedLiteral = extractFileFacts({
      filePath: "src/broken.cobol",
      language: "cobol",
      sourceText: [
        "identification division.",
        "program-id. broken.",
        "procedure division.",
        "main-logic.",
        "display \"unterminated."
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [symbol.kind, symbol.name, symbol.qualifiedName, symbol.isExported])
    ).toEqual([
      ["file", "billing.cob", "src/billing.cob", true],
      ["module", "BILLING-REPORT", "src/billing.cob#program:BILLING-REPORT", true],
      [
        "function",
        "MAIN-LOGIC",
        "src/billing.cob#program:BILLING-REPORT#paragraph:MAIN-LOGIC",
        false
      ],
      [
        "function",
        "FINISH-REPORT",
        "src/billing.cob#program:BILLING-REPORT#paragraph:FINISH-REPORT",
        false
      ]
    ]);
    expect(
      facts.edges.filter((edge) => edge.kind === "contains").map((edge) => [
        edge.referenceName,
        edge.evidence?.ruleId,
        edge.resolution,
        edge.confidence
      ])
    ).toEqual([
      [
        "BILLING-REPORT",
        "language.cobol.program.identification-program-id-procedure",
        "exact",
        1
      ],
      [
        "MAIN-LOGIC",
        "language.cobol.paragraph.direct-procedure-division",
        "exact",
        1
      ],
      [
        "FINISH-REPORT",
        "language.cobol.paragraph.direct-procedure-division",
        "exact",
        1
      ]
    ]);
    expect(copybook.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
    expect(programShapedCopybook.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
    expect(multiplePrograms.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
    expect(unterminatedLiteral.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
  });

  it("extracts direct R Plumber annotation routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/plumber.R",
      language: "r",
      sourceText: [
        "#* Echo a message",
        "#* @get /echo",
        'function(msg = "") {',
        '  list(message = paste0("}", msg))',
        "}",
        "",
        "#' @post /sum",
        "function(a, b) {",
        "  a + b",
        "}",
        "",
        "status_check <- function() {",
        '  "ok"',
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)
    ).toEqual([
      "src/plumber.R#handler:GET:/echo",
      "src/plumber.R#handler:POST:/sum",
      "src/plumber.R#status_check"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /echo",
        "src/plumber.R#handler:GET:/echo",
        "framework.plumber.annotation.literal-route.braced-handler",
        "exact",
        1
      ],
      [
        "POST /sum",
        "src/plumber.R#handler:POST:/sum",
        "framework.plumber.annotation.literal-route.braced-handler",
        "exact",
        1
      ]
    ]);
  });

  it("requires standalone literal R Plumber annotations, immediate braced handlers, and balanced syntax", () => {
    const unmarkedComment = extractFileFacts({
      filePath: "src/unmarked.R",
      language: "r",
      sourceText: ["# @get /health", "function() {}"].join("\n")
    });
    const unsupportedMethod = extractFileFacts({
      filePath: "src/patch.R",
      language: "r",
      sourceText: ["#* @patch /health", "function() {}"].join("\n")
    });
    const dynamicPath = extractFileFacts({
      filePath: "src/path.R",
      language: "r",
      sourceText: ["#* @get health", "function() {}"].join("\n")
    });
    const nonImmediateHandler = extractFileFacts({
      filePath: "src/non-immediate.R",
      language: "r",
      sourceText: ["#* @get /health", "#* endpoint description", "function() {}"].join("\n")
    });
    const namedHandler = extractFileFacts({
      filePath: "src/named.R",
      language: "r",
      sourceText: ["#* @get /health", "health <- function() {}"].join("\n")
    });
    const assignmentContinuation = extractFileFacts({
      filePath: "src/continuation.R",
      language: "r",
      sourceText: ["health <-", "#* @get /health", "function() {}"].join("\n")
    });
    const nested = extractFileFacts({
      filePath: "src/nested.R",
      language: "r",
      sourceText: [
        "wrapper <- function() {",
        "  #* @get /health",
        "  function() {}",
        "}"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "src/broken.R",
      language: "r",
      sourceText: ["#* @get /broken", "function() {"].join("\n")
    });

    for (const facts of [
      unmarkedComment,
      unsupportedMethod,
      dynamicPath,
      nonImmediateHandler,
      namedHandler,
      assignmentContinuation,
      nested,
      broken
    ]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(namedHandler.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.name)).toEqual([
      "health"
    ]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "function")).toEqual([]);
  });

  it("extracts direct Elixir Phoenix scope-composed routes with exact and unresolved evidence", () => {
    const facts = extractFileFacts({
      filePath: "lib/demo_web/router.ex",
      language: "elixir",
      sourceText: [
        "defmodule DemoWeb.Router do",
        "  use Phoenix.Router, helpers: false",
        "",
        "  scope \"/api\", DemoWeb do",
        "    scope \"/v1\" do",
        "      get \"/health\", DemoWeb.HealthController, :index",
        "      post \"/users\", DemoWeb.UsersController, :create",
        "    end",
        "  end",
        "end",
        "",
        "defmodule DemoWeb.HealthController do",
        "  def index(conn, params) do",
        "    {conn, params}",
        "  end",
        "",
        "  defp private_helper(conn) do",
        "    conn",
        "  end",
        "end"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)).toEqual([
      "lib/demo_web/router.ex#DemoWeb.Router",
      "lib/demo_web/router.ex#DemoWeb.HealthController"
    ]);
    expect(
      facts.symbols
        .filter((symbol) => symbol.kind === "method")
        .map((symbol) => [symbol.qualifiedName, symbol.isExported])
    ).toEqual([
      ["lib/demo_web/router.ex#DemoWeb.HealthController.index", true],
      ["lib/demo_web/router.ex#DemoWeb.HealthController.private_helper", false]
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName ?? null,
          edge.referenceName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /api/v1/health",
        "lib/demo_web/router.ex#DemoWeb.HealthController.index",
        "DemoWeb.HealthController#index",
        "framework.phoenix.direct-router.literal-verb.full-module-controller-action.local-method",
        "exact",
        1
      ],
      [
        "POST /api/v1/users",
        null,
        "DemoWeb.UsersController#create",
        "framework.phoenix.direct-router.literal-verb.full-module-controller-action.unresolved-controller-method",
        "unresolved",
        0
      ]
    ]);
  });

  it("requires direct Phoenix.Router, literal direct scopes and routes, and balanced Elixir blocks", () => {
    const indirectUse = extractFileFacts({
      filePath: "lib/indirect.ex",
      language: "elixir",
      sourceText: [
        "defmodule DemoWeb.Router do",
        "  use DemoWeb, :router",
        "  get \"/health\", DemoWeb.HealthController, :index",
        "end"
      ].join("\n")
    });
    const missingUse = extractFileFacts({
      filePath: "lib/missing-use.ex",
      language: "elixir",
      sourceText: [
        "defmodule DemoWeb.Router do",
        "  get \"/health\", DemoWeb.HealthController, :index",
        "end"
      ].join("\n")
    });
    const unsupportedResource = extractFileFacts({
      filePath: "lib/resources.ex",
      language: "elixir",
      sourceText: [
        "defmodule DemoWeb.Router do",
        "  use Phoenix.Router",
        "  resources \"/users\", DemoWeb.UserController",
        "end"
      ].join("\n")
    });
    const nestedRoute = extractFileFacts({
      filePath: "lib/nested.ex",
      language: "elixir",
      sourceText: [
        "defmodule DemoWeb.Router do",
        "  use Phoenix.Router",
        "  if enabled do",
        "    get \"/health\", DemoWeb.HealthController, :index",
        "  end",
        "end"
      ].join("\n")
    });
    const dynamicPath = extractFileFacts({
      filePath: "lib/dynamic.ex",
      language: "elixir",
      sourceText: [
        "defmodule DemoWeb.Router do",
        "  use Phoenix.Router",
        "  get path, DemoWeb.HealthController, :index",
        "end"
      ].join("\n")
    });
    const trailingScope = extractFileFacts({
      filePath: "lib/trailing-scope.ex",
      language: "elixir",
      sourceText: [
        "defmodule DemoWeb.Router do",
        "  use Phoenix.Router",
        "  scope \"/api/\" do",
        "    get \"/health\", DemoWeb.HealthController, :index",
        "  end",
        "end"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "lib/broken.ex",
      language: "elixir",
      sourceText: [
        "defmodule DemoWeb.Router do",
        "  use Phoenix.Router",
        "  get \"/health\", DemoWeb.HealthController, :index"
      ].join("\n")
    });
    const unterminatedString = extractFileFacts({
      filePath: "lib/string.ex",
      language: "elixir",
      sourceText: [
        "defmodule DemoWeb.Router do",
        "  use Phoenix.Router",
        "  get \"/health, DemoWeb.HealthController, :index",
        "end"
      ].join("\n")
    });

    for (const facts of [
      indirectUse,
      missingUse,
      unsupportedResource,
      nestedRoute,
      dynamicPath,
      trailingScope,
      broken,
      unterminatedString
    ]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(broken.symbols).toHaveLength(1);
    expect(unterminatedString.symbols).toHaveLength(1);
  });

  it("extracts direct Erlang Cowboy wildcard-host routes with exact and unresolved evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/demo_handler.erl",
      language: "erlang",
      sourceText: [
        "-module(demo_handler).",
        "-export([start/2, init/2]).",
        "",
        "start(_Type, _Args) ->",
        "    Dispatch = cowboy_router:compile([",
        "        {'_', [",
        "            {\"/health\", demo_handler, #{}},",
        "            {\"/users\", users_handler, []}",
        "        ]}",
        "    ]),",
        "    cowboy:start_clear(demo_listener, [{port, 8080}], #{env => #{dispatch => Dispatch}}).",
        "",
        "init(Req0, State) ->",
        "    {ok, Req0, State}."
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/demo_handler.erl#demo_handler"
    ]);
    expect(
      facts.symbols
        .filter((symbol) => symbol.kind === "method")
        .map((symbol) => [symbol.qualifiedName, symbol.isExported])
    ).toEqual([
      ["src/demo_handler.erl#demo_handler.start/2", true],
      ["src/demo_handler.erl#demo_handler.init/2", true]
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName ?? null,
          edge.referenceName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "ALL /health",
        "src/demo_handler.erl#demo_handler.init/2",
        "demo_handler#init/2",
        "framework.cowboy.direct-router.literal-wildcard-host.local-exported-init",
        "exact",
        1
      ],
      [
        "ALL /users",
        null,
        "users_handler#init/2",
        "framework.cowboy.direct-router.literal-wildcard-host.unresolved-handler-init",
        "unresolved",
        0
      ]
    ]);
  });

  it("requires direct Cowboy literal wildcard-host dispatches and balanced Erlang source", () => {
    const dynamicDispatch = extractFileFacts({
      filePath: "src/dynamic.erl",
      language: "erlang",
      sourceText: [
        "-module(dynamic).",
        "-export([init/2]).",
        "init(Req, State) -> {ok, Req, State}.",
        "start() -> cowboy_router:compile(Routes)."
      ].join("\n")
    });
    const constrainedHost = extractFileFacts({
      filePath: "src/constrained.erl",
      language: "erlang",
      sourceText: [
        "-module(constrained).",
        "-export([init/2]).",
        "init(Req, State) -> {ok, Req, State}.",
        "start() -> cowboy_router:compile([{\"example.test\", [{\"/health\", constrained, #{}}]}])."
      ].join("\n")
    });
    const binaryPath = extractFileFacts({
      filePath: "src/binary.erl",
      language: "erlang",
      sourceText: [
        "-module(binary).",
        "-export([init/2]).",
        "init(Req, State) -> {ok, Req, State}.",
        "start() -> cowboy_router:compile([{'_', [{<<\"/health\">>, binary, #{}}]}])."
      ].join("\n")
    });
    const indirectModule = extractFileFacts({
      filePath: "src/indirect.erl",
      language: "erlang",
      sourceText: [
        "-module(indirect).",
        "-export([init/2]).",
        "init(Req, State) -> {ok, Req, State}.",
        "start() -> Router = cowboy_router, Router:compile([{'_', [{\"/health\", indirect, #{}}]}])."
      ].join("\n")
    });
    const constrainedPathTuple = extractFileFacts({
      filePath: "src/tuple.erl",
      language: "erlang",
      sourceText: [
        "-module(tuple).",
        "-export([init/2]).",
        "init(Req, State) -> {ok, Req, State}.",
        "start() -> cowboy_router:compile([{'_', [{\"/health\", #{}, tuple, #{}}]}])."
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "src/broken.erl",
      language: "erlang",
      sourceText: [
        "-module(broken).",
        "start() -> cowboy_router:compile([{'_', [{\"/health\", broken, #{}}]})."
      ].join("\n")
    });
    const unterminatedString = extractFileFacts({
      filePath: "src/string.erl",
      language: "erlang",
      sourceText: [
        "-module(string).",
        "start() -> cowboy_router:compile([{'_', [{\"/health, string, #{}}]}])."
      ].join("\n")
    });

    for (const facts of [
      dynamicDispatch,
      constrainedHost,
      binaryPath,
      indirectModule,
      constrainedPathTuple,
      broken,
      unterminatedString
    ]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(broken.symbols).toHaveLength(1);
    expect(unterminatedString.symbols).toHaveLength(1);
  });

  it("extracts direct Clojure Compojure routes with exact and unresolved evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/demo/routes.clj",
      language: "clojure",
      sourceText: [
        "(ns demo.routes",
        "  (:require [compojure.core :refer [defroutes GET POST]]))",
        "",
        "(defn health [request]",
        "  {:status 200})",
        "",
        "(defroutes app-routes",
        "  (GET \"/health\" [] health)",
        "  (POST \"/users\" [] create-user))"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/demo/routes.clj#demo.routes"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/demo/routes.clj#demo.routes.health"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName ?? null,
          edge.referenceName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/demo/routes.clj#demo.routes.health",
        "demo.routes/health",
        "framework.compojure.direct-defroutes.literal-verb.local-function",
        "exact",
        1
      ],
      [
        "POST /users",
        null,
        "demo.routes/create-user",
        "framework.compojure.direct-defroutes.literal-verb.unresolved-function",
        "unresolved",
        0
      ]
    ]);

    const referAllFacts = extractFileFacts({
      filePath: "src/demo/all.clj",
      language: "clojure",
      sourceText: [
        "(ns demo.all (:require [compojure.core :refer :all]))",
        "(defn status [request] {:status 200})",
        "(defroutes routes (GET \"/status\" [] status))"
      ].join("\n")
    });
    expect(referAllFacts.edges.filter((edge) => edge.kind === "routes")).toEqual([
      expect.objectContaining({
        resolution: "exact",
        referenceName: "demo.all/status",
        evidence: expect.objectContaining({
          ruleId: "framework.compojure.direct-defroutes.literal-verb.local-function"
        })
      })
    ]);
  });

  it("requires direct Compojure refer bindings, literal named routes, and balanced Clojure forms", () => {
    const aliasedRequire = extractFileFacts({
      filePath: "src/aliased.clj",
      language: "clojure",
      sourceText: [
        "(ns demo.aliased (:require [compojure.core :as compojure]))",
        "(defn health [request] {:status 200})",
        "(compojure/defroutes routes (compojure/GET \"/health\" [] health))"
      ].join("\n")
    });
    const dynamicPath = extractFileFacts({
      filePath: "src/dynamic.clj",
      language: "clojure",
      sourceText: [
        "(ns demo.dynamic (:require [compojure.core :refer [defroutes GET]]))",
        "(defn health [request] {:status 200})",
        "(def path \"/health\")",
        "(defroutes routes (GET path [] health))"
      ].join("\n")
    });
    const inlineHandler = extractFileFacts({
      filePath: "src/inline.clj",
      language: "clojure",
      sourceText: [
        "(ns demo.inline (:require [compojure.core :refer [defroutes GET]]))",
        "(defroutes routes (GET \"/health\" [] (fn [_] {:status 200})))"
      ].join("\n")
    });
    const nestedRoute = extractFileFacts({
      filePath: "src/nested.clj",
      language: "clojure",
      sourceText: [
        "(ns demo.nested (:require [compojure.core :refer [defroutes GET]]))",
        "(defn health [request] {:status 200})",
        "(defroutes routes (context \"/api\" [] (GET \"/health\" [] health)))"
      ].join("\n")
    });
    const missingNamespace = extractFileFacts({
      filePath: "src/missing.clj",
      language: "clojure",
      sourceText: [
        "(defn health [request] {:status 200})",
        "(defroutes routes (GET \"/health\" [] health))"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "src/broken.clj",
      language: "clojure",
      sourceText: "(ns demo.broken (:require [compojure.core :refer [defroutes GET]])"
    });
    const unterminatedString = extractFileFacts({
      filePath: "src/string.clj",
      language: "clojure",
      sourceText: "(ns demo.string (:require [compojure.core :refer [defroutes GET]])) (GET \"/health [] health)"
    });

    for (const facts of [
      aliasedRequire,
      dynamicPath,
      inlineHandler,
      nestedRoute,
      missingNamespace,
      broken,
      unterminatedString
    ]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(broken.symbols).toHaveLength(1);
    expect(unterminatedString.symbols).toHaveLength(1);
  });

  it("extracts direct Perl Dancer2 routes with exact and unresolved evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/demo/app.pl",
      language: "perl",
      sourceText: [
        "package Demo::App;",
        "use Dancer2;",
        "",
        "sub health {",
        "  return \"ok\";",
        "}",
        "",
        "get \"/health\" => \\&health;",
        "post \"/users\" => \\&create_user;",
        "del \"/users/:id\" => \\&delete_user;"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/demo/app.pl#Demo::App"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/demo/app.pl#Demo::App.health"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName ?? null,
          edge.referenceName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/demo/app.pl#Demo::App.health",
        "Demo::App::health",
        "framework.dancer2.direct-route.literal-verb.local-sub",
        "exact",
        1
      ],
      [
        "POST /users",
        null,
        "Demo::App::create_user",
        "framework.dancer2.direct-route.literal-verb.unresolved-sub",
        "unresolved",
        0
      ],
      [
        "DELETE /users/:id",
        null,
        "Demo::App::delete_user",
        "framework.dancer2.direct-route.literal-verb.unresolved-sub",
        "unresolved",
        0
      ]
    ]);

    const scriptFacts = extractFileFacts({
      filePath: "bin/app.pl",
      language: "perl",
      sourceText: [
        "use Dancer2;",
        "sub status { return \"ok\"; }",
        "get \"/status\" => \\&status;"
      ].join("\n")
    });
    expect(scriptFacts.edges.filter((edge) => edge.kind === "routes")).toEqual([
      expect.objectContaining({
        resolution: "exact",
        referenceName: "status",
        evidence: expect.objectContaining({
          ruleId: "framework.dancer2.direct-route.literal-verb.local-sub"
        })
      })
    ]);
  });

  it("requires direct Dancer2 use, literal named coderef routes, and balanced Perl input", () => {
    const importedDsl = extractFileFacts({
      filePath: "src/imported.pl",
      language: "perl",
      sourceText: [
        "use Dancer2 qw(get);",
        "sub health { return \"ok\"; }",
        "get \"/health\" => \\&health;"
      ].join("\n")
    });
    const dynamicPath = extractFileFacts({
      filePath: "src/dynamic.pl",
      language: "perl",
      sourceText: [
        "use Dancer2;",
        "my $path = \"/health\";",
        "sub health { return \"ok\"; }",
        "get $path => \\&health;"
      ].join("\n")
    });
    const inlineHandler = extractFileFacts({
      filePath: "src/inline.pl",
      language: "perl",
      sourceText: ["use Dancer2;", "get \"/health\" => sub { return \"ok\"; };"].join("\n")
    });
    const anyRoute = extractFileFacts({
      filePath: "src/any.pl",
      language: "perl",
      sourceText: ["use Dancer2;", "any \"/health\" => \\&health;"].join("\n")
    });
    const nestedRoute = extractFileFacts({
      filePath: "src/nested.pl",
      language: "perl",
      sourceText: [
        "use Dancer2;",
        "sub configure {",
        "  get \"/health\" => \\&health;",
        "}",
        "sub health { return \"ok\"; }"
      ].join("\n")
    });
    const repeatedUse = extractFileFacts({
      filePath: "src/repeated.pl",
      language: "perl",
      sourceText: [
        "use Dancer2;",
        "use Dancer2;",
        "sub health { return \"ok\"; }",
        "get \"/health\" => \\&health;"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "src/broken.pl",
      language: "perl",
      sourceText: "use Dancer2; sub health { return \"ok\"; get \"/health\" => \\&health;"
    });
    const unterminatedString = extractFileFacts({
      filePath: "src/string.pl",
      language: "perl",
      sourceText: "use Dancer2; get \"/health => \\&health;"
    });

    for (const facts of [
      importedDsl,
      dynamicPath,
      inlineHandler,
      anyRoute,
      nestedRoute,
      repeatedUse,
      broken,
      unterminatedString
    ]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(broken.symbols).toHaveLength(1);
    expect(unterminatedString.symbols).toHaveLength(1);
  });

  it("extracts direct Julia Genie routes with exact and unresolved evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/demo/routes.jl",
      language: "julia",
      sourceText: [
        "using Genie, Genie.Requests",
        "",
        "health() = \"ok\"",
        "create_user() = \"created\"",
        "",
        "route(\"/health\", health)",
        "route(\"/users\", create_user, method = POST)",
        "route(\"/missing\", missing, method = PATCH)"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)
    ).toEqual(["src/demo/routes.jl.health", "src/demo/routes.jl.create_user"]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName ?? null,
          edge.referenceName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/demo/routes.jl.health",
        "health",
        "framework.genie.direct-route.literal-named-function.local-function",
        "exact",
        1
      ],
      [
        "POST /users",
        "src/demo/routes.jl.create_user",
        "create_user",
        "framework.genie.direct-route.literal-named-function.local-function",
        "exact",
        1
      ],
      [
        "PATCH /missing",
        null,
        "missing",
        "framework.genie.direct-route.literal-named-function.unresolved",
        "unresolved",
        0
      ]
    ]);
  });

  it("requires direct Genie use, top-level literal named routes, and balanced Julia input", () => {
    const missingUse = extractFileFacts({
      filePath: "src/missing-use.jl",
      language: "julia",
      sourceText: ["health() = \"ok\"", "route(\"/health\", health)"].join("\n")
    });
    const dynamicPath = extractFileFacts({
      filePath: "src/dynamic.jl",
      language: "julia",
      sourceText: [
        "using Genie",
        "health() = \"ok\"",
        "path = \"/health\"",
        "route(path, health)"
      ].join("\n")
    });
    const inlineHandler = extractFileFacts({
      filePath: "src/inline.jl",
      language: "julia",
      sourceText: ["using Genie", "route(\"/health\", () -> \"ok\")"].join("\n")
    });
    const namedRoute = extractFileFacts({
      filePath: "src/named.jl",
      language: "julia",
      sourceText: [
        "using Genie",
        "health() = \"ok\"",
        "route(\"/health\", health, named = :health)"
      ].join("\n")
    });
    const qualifiedMethod = extractFileFacts({
      filePath: "src/qualified-method.jl",
      language: "julia",
      sourceText: [
        "using Genie",
        "health() = \"ok\"",
        "route(\"/health\", health, method = Router.POST)"
      ].join("\n")
    });
    const nestedRoute = extractFileFacts({
      filePath: "src/nested.jl",
      language: "julia",
      sourceText: [
        "using Genie",
        "function configure()",
        "  route(\"/health\", health)",
        "end",
        "health() = \"ok\""
      ].join("\n")
    });
    const wrappedRoute = extractFileFacts({
      filePath: "src/wrapped.jl",
      language: "julia",
      sourceText: [
        "using Genie",
        "health() = \"ok\"",
        "route(\"/health\", health) do",
        "  \"ignored\"",
        "end"
      ].join("\n")
    });
    const repeatedUse = extractFileFacts({
      filePath: "src/repeated.jl",
      language: "julia",
      sourceText: [
        "using Genie",
        "using Genie",
        "health() = \"ok\"",
        "route(\"/health\", health)"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "src/broken.jl",
      language: "julia",
      sourceText: "using Genie\nhealth() = \"ok\"\nroute(\"/health\", health"
    });
    const unterminatedString = extractFileFacts({
      filePath: "src/string.jl",
      language: "julia",
      sourceText: "using Genie\nroute(\"/health, health)"
    });
    const unsupportedChar = extractFileFacts({
      filePath: "src/char.jl",
      language: "julia",
      sourceText: "using Genie\nhealth() = 'x'\nroute(\"/health\", health)"
    });
    const wrappedFunction = extractFileFacts({
      filePath: "src/wrapped-function.jl",
      language: "julia",
      sourceText: [
        "using Genie",
        "@eval health() = \"ok\"",
        "route(\"/health\", health)"
      ].join("\n")
    });

    for (const facts of [
      missingUse,
      dynamicPath,
      inlineHandler,
      namedRoute,
      qualifiedMethod,
      nestedRoute,
      wrappedRoute,
      repeatedUse,
      broken,
      unterminatedString,
      unsupportedChar
    ]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(broken.symbols).toHaveLength(1);
    expect(unterminatedString.symbols).toHaveLength(1);
    expect(unsupportedChar.symbols).toHaveLength(1);
    expect(wrappedFunction.edges.filter((edge) => edge.kind === "routes")).toEqual([
      expect.objectContaining({
        resolution: "unresolved",
        evidence: expect.objectContaining({
          ruleId: "framework.genie.direct-route.literal-named-function.unresolved"
        })
      })
    ]);
  });

  it("extracts direct Haskell Scotty routes with exact and unresolved evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/demo/App.hs",
      language: "haskell",
      sourceText: [
        "import Web.Scotty",
        "",
        "main = scotty 3000 $ do",
        "  get \"/health\" health",
        "  post \"/users\" $ createUser",
        "  patch \"/missing\" missing",
        "",
        "health = text \"ok\"",
        "createUser = text \"created\""
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)
    ).toEqual(["src/demo/App.hs.main", "src/demo/App.hs.health", "src/demo/App.hs.createUser"]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName ?? null,
          edge.referenceName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/demo/App.hs.health",
        "health",
        "framework.scotty.direct-block.literal-named-function.local-function",
        "exact",
        1
      ],
      [
        "POST /users",
        "src/demo/App.hs.createUser",
        "createUser",
        "framework.scotty.direct-block.literal-named-function.local-function",
        "exact",
        1
      ],
      [
        "PATCH /missing",
        null,
        "missing",
        "framework.scotty.direct-block.literal-named-function.unresolved",
        "unresolved",
        0
      ]
    ]);
  });

  it("requires direct Scotty import, literal-port blocks, direct named routes, and balanced Haskell input", () => {
    const missingImport = extractFileFacts({
      filePath: "src/missing-import.hs",
      language: "haskell",
      sourceText: [
        "main = scotty 3000 $ do",
        "  get \"/health\" health",
        "health = text \"ok\""
      ].join("\n")
    });
    const qualifiedImport = extractFileFacts({
      filePath: "src/qualified.hs",
      language: "haskell",
      sourceText: [
        "import qualified Web.Scotty as S",
        "main = scotty 3000 $ do",
        "  get \"/health\" health",
        "health = text \"ok\""
      ].join("\n")
    });
    const dynamicPort = extractFileFacts({
      filePath: "src/dynamic-port.hs",
      language: "haskell",
      sourceText: [
        "import Web.Scotty",
        "main = scotty port $ do",
        "  get \"/health\" health",
        "health = text \"ok\""
      ].join("\n")
    });
    const dynamicPath = extractFileFacts({
      filePath: "src/dynamic-path.hs",
      language: "haskell",
      sourceText: [
        "import Web.Scotty",
        "main = scotty 3000 $ do",
        "  get path health",
        "health = text \"ok\""
      ].join("\n")
    });
    const inlineHandler = extractFileFacts({
      filePath: "src/inline.hs",
      language: "haskell",
      sourceText: [
        "import Web.Scotty",
        "main = scotty 3000 $ do",
        "  get \"/health\" $ text \"ok\""
      ].join("\n")
    });
    const nestedRoute = extractFileFacts({
      filePath: "src/nested.hs",
      language: "haskell",
      sourceText: [
        "import Web.Scotty",
        "main = scotty 3000 $ do",
        "  when enabled $ do",
        "    get \"/health\" health",
        "health = text \"ok\""
      ].join("\n")
    });
    const repeatedImport = extractFileFacts({
      filePath: "src/repeated.hs",
      language: "haskell",
      sourceText: [
        "import Web.Scotty",
        "import Web.Scotty",
        "main = scotty 3000 $ do",
        "  get \"/health\" health",
        "health = text \"ok\""
      ].join("\n")
    });
    const malformed = extractFileFacts({
      filePath: "src/malformed.hs",
      language: "haskell",
      sourceText: "import Web.Scotty\nmain = scotty 3000 $ do\n  get (\"/health\" health"
    });
    const unterminatedComment = extractFileFacts({
      filePath: "src/comment.hs",
      language: "haskell",
      sourceText: "import Web.Scotty\n{- open\nmain = scotty 3000 $ do"
    });
    const tabbed = extractFileFacts({
      filePath: "src/tabbed.hs",
      language: "haskell",
      sourceText: "import Web.Scotty\nmain = scotty 3000 $ do\n\tget \"/health\" health"
    });
    const localLetHandler = extractFileFacts({
      filePath: "src/local-let.hs",
      language: "haskell",
      sourceText: [
        "import Web.Scotty",
        "main = scotty 3000 $ do",
        "  let health = text \"ok\"",
        "  get \"/health\" health"
      ].join("\n")
    });

    for (const facts of [
      missingImport,
      qualifiedImport,
      dynamicPort,
      dynamicPath,
      inlineHandler,
      nestedRoute,
      repeatedImport,
      malformed,
      unterminatedComment,
      tabbed
    ]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(malformed.symbols).toHaveLength(1);
    expect(unterminatedComment.symbols).toHaveLength(1);
    expect(tabbed.symbols).toHaveLength(1);
    expect(localLetHandler.edges.filter((edge) => edge.kind === "routes")).toEqual([
      expect.objectContaining({
        resolution: "unresolved",
        evidence: expect.objectContaining({
          ruleId: "framework.scotty.direct-block.literal-named-function.unresolved"
        })
      })
    ]);
  });

  it("extracts direct OCaml Dream routes with exact and unresolved evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/demo/app.ml",
      language: "ocaml",
      sourceText: [
        "let health _ = Dream.html \"ok\"",
        "let create_user _ = Dream.html \"created\"",
        "",
        "let () =",
        "  Dream.run",
        "  @@ Dream.router [",
        "    Dream.get \"/health\" health;",
        "    Dream.post \"/users\" @@ create_user;",
        "    Dream.any \"/missing\" missing;",
        "  ]"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)
    ).toEqual(["src/demo/app.ml.health", "src/demo/app.ml.create_user"]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName ?? null,
          edge.referenceName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/demo/app.ml.health",
        "health",
        "framework.dream.direct-router.literal-named-function.local-function",
        "exact",
        1
      ],
      [
        "POST /users",
        "src/demo/app.ml.create_user",
        "create_user",
        "framework.dream.direct-router.literal-named-function.local-function",
        "exact",
        1
      ],
      [
        "ALL /missing",
        null,
        "missing",
        "framework.dream.direct-router.literal-named-function.unresolved",
        "unresolved",
        0
      ]
    ]);
  });

  it("requires direct top-level Dream router lists, literal named handlers, and balanced OCaml input", () => {
    const dynamicPath = extractFileFacts({
      filePath: "src/dynamic.ml",
      language: "ocaml",
      sourceText: [
        "let health _ = Dream.html \"ok\"",
        "let path = \"/health\"",
        "let app = Dream.router [",
        "  Dream.get path health;",
        "]"
      ].join("\n")
    });
    const inlineHandler = extractFileFacts({
      filePath: "src/inline.ml",
      language: "ocaml",
      sourceText: [
        "let app = Dream.router [",
        "  Dream.get \"/health\" (fun _ -> Dream.html \"ok\");",
        "]"
      ].join("\n")
    });
    const qualifiedHandler = extractFileFacts({
      filePath: "src/qualified.ml",
      language: "ocaml",
      sourceText: [
        "let app = Dream.router [",
        "  Dream.get \"/health\" Handlers.health;",
        "]"
      ].join("\n")
    });
    const nestedScope = extractFileFacts({
      filePath: "src/scope.ml",
      language: "ocaml",
      sourceText: [
        "let health _ = Dream.html \"ok\"",
        "let app = Dream.router [",
        "  Dream.scope \"/api\" [] [",
        "    Dream.get \"/health\" health;",
        "  ];",
        "]"
      ].join("\n")
    });
    const localRouter = extractFileFacts({
      filePath: "src/local.ml",
      language: "ocaml",
      sourceText: [
        "let health _ = Dream.html \"ok\"",
        "let configure _ =",
        "  let app = Dream.router [",
        "    Dream.get \"/health\" health;",
        "  ] in",
        "  app"
      ].join("\n")
    });
    const wrongEntrypoint = extractFileFacts({
      filePath: "src/wrong-entrypoint.ml",
      language: "ocaml",
      sourceText: [
        "let health _ = Dream.html \"ok\"",
        "let () =",
        "  Dream.serve",
        "  @@ Dream.router [",
        "    Dream.get \"/health\" health;",
        "  ]"
      ].join("\n")
    });
    const malformed = extractFileFacts({
      filePath: "src/malformed.ml",
      language: "ocaml",
      sourceText: "let app = Dream.router [\n  Dream.get \"/health\" health;"
    });
    const unterminatedComment = extractFileFacts({
      filePath: "src/comment.ml",
      language: "ocaml",
      sourceText: "(* open\nlet app = Dream.router ["
    });
    const unterminatedRawString = extractFileFacts({
      filePath: "src/raw.ml",
      language: "ocaml",
      sourceText: "let note = {| open\nlet app = Dream.router ["
    });
    const duplicateHandler = extractFileFacts({
      filePath: "src/duplicate.ml",
      language: "ocaml",
      sourceText: [
        "let health _ = Dream.html \"one\"",
        "let health _ = Dream.html \"two\"",
        "let app = Dream.router [",
        "  Dream.get \"/health\" health;",
        "]"
      ].join("\n")
    });

    for (const facts of [
      dynamicPath,
      inlineHandler,
      qualifiedHandler,
      nestedScope,
      localRouter,
      wrongEntrypoint,
      malformed,
      unterminatedComment,
      unterminatedRawString
    ]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(malformed.symbols).toHaveLength(1);
    expect(unterminatedComment.symbols).toHaveLength(1);
    expect(unterminatedRawString.symbols).toHaveLength(1);
    expect(duplicateHandler.edges.filter((edge) => edge.kind === "routes")).toEqual([
      expect.objectContaining({
        resolution: "unresolved",
        evidence: expect.objectContaining({
          ruleId: "framework.dream.direct-router.literal-named-function.unresolved"
        })
      })
    ]);
  });

  it("extracts direct F# Giraffe choose routes with exact and unresolved evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/App.fs",
      language: "fsharp",
      sourceText: [
        "open Giraffe",
        "",
        "let health (next : HttpFunc) (ctx : HttpContext) =",
        "  text \"ok\" next ctx",
        "",
        "let createUser (next : HttpFunc) (ctx : HttpContext) =",
        "  text \"created\" next ctx",
        "",
        "let webApp =",
        "  choose [",
        "    GET >=> route \"/health\" >=> health",
        "    POST >=> route \"/users\" >=> createUser",
        "    route \"/all\" >=> health",
        "    PATCH >=> route \"/missing\" >=> missing",
        "  ]"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)
    ).toEqual(["src/App.fs.health", "src/App.fs.createUser"]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName ?? null,
          edge.referenceName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/App.fs.health",
        "health",
        "framework.giraffe.direct-choose.literal-named-function.local-function",
        "exact",
        1
      ],
      [
        "POST /users",
        "src/App.fs.createUser",
        "createUser",
        "framework.giraffe.direct-choose.literal-named-function.local-function",
        "exact",
        1
      ],
      [
        "ALL /all",
        "src/App.fs.health",
        "health",
        "framework.giraffe.direct-choose.literal-named-function.local-function",
        "exact",
        1
      ],
      [
        "PATCH /missing",
        null,
        "missing",
        "framework.giraffe.direct-choose.literal-named-function.unresolved",
        "unresolved",
        0
      ]
    ]);
  });

  it("requires direct Giraffe proof, direct typed handlers, literal paths, flat choose routes, and balanced F# input", () => {
    const missingOpen = extractFileFacts({
      filePath: "src/missing-open.fs",
      language: "fsharp",
      sourceText: [
        "let health (next : HttpFunc) (ctx : HttpContext) =",
        "  text \"ok\" next ctx",
        "let webApp = choose [",
        "  GET >=> route \"/health\" >=> health",
        "]"
      ].join("\n")
    });
    const qualifiedOpen = extractFileFacts({
      filePath: "src/qualified-open.fs",
      language: "fsharp",
      sourceText: [
        "open Giraffe.HttpHandlers",
        "let health (next : HttpFunc) (ctx : HttpContext) =",
        "  text \"ok\" next ctx",
        "let webApp = choose [",
        "  GET >=> route \"/health\" >=> health",
        "]"
      ].join("\n")
    });
    const dynamicPath = extractFileFacts({
      filePath: "src/dynamic.fs",
      language: "fsharp",
      sourceText: [
        "open Giraffe",
        "let health (next : HttpFunc) (ctx : HttpContext) =",
        "  text \"ok\" next ctx",
        "let path = \"/health\"",
        "let webApp = choose [",
        "  GET >=> route path >=> health",
        "]"
      ].join("\n")
    });
    const inlineHandler = extractFileFacts({
      filePath: "src/inline.fs",
      language: "fsharp",
      sourceText: [
        "open Giraffe",
        "let webApp = choose [",
        "  GET >=> route \"/health\" >=> text \"ok\"",
        "]"
      ].join("\n")
    });
    const nestedRoute = extractFileFacts({
      filePath: "src/nested.fs",
      language: "fsharp",
      sourceText: [
        "open Giraffe",
        "let health (next : HttpFunc) (ctx : HttpContext) =",
        "  text \"ok\" next ctx",
        "let webApp = choose [",
        "  subRoute \"/api\" (",
        "    choose [",
        "      GET >=> route \"/health\" >=> health",
        "    ])",
        "]"
      ].join("\n")
    });
    const tripleQuotedRoute = extractFileFacts({
      filePath: "src/string.fs",
      language: "fsharp",
      sourceText: [
        "open Giraffe",
        "let documentation = \"\"\"",
        "let webApp = choose [",
        "  GET >=> route \"/health\" >=> health",
        "]",
        "\"\"\""
      ].join("\n")
    });
    const interpolatedTripleQuotedRoute = extractFileFacts({
      filePath: "src/interpolated-string.fs",
      language: "fsharp",
      sourceText: [
        "open Giraffe",
        "let documentation = $\"\"\"",
        "let webApp = choose [",
        "  GET >=> route \"/health\" >=> health",
        "]",
        "\"\"\""
      ].join("\n")
    });
    const shadowedRoute = extractFileFacts({
      filePath: "src/shadowed.fs",
      language: "fsharp",
      sourceText: [
        "open Giraffe",
        "let route _ = fun next ctx -> text \"custom\" next ctx",
        "let health (next : HttpFunc) (ctx : HttpContext) =",
        "  text \"ok\" next ctx",
        "let webApp = choose [",
        "  GET >=> route \"/health\" >=> health",
        "]"
      ].join("\n")
    });
    const duplicateHandler = extractFileFacts({
      filePath: "src/duplicate.fs",
      language: "fsharp",
      sourceText: [
        "open Giraffe",
        "let health (next : HttpFunc) (ctx : HttpContext) =",
        "  text \"one\" next ctx",
        "let health (next : HttpFunc) (ctx : HttpContext) =",
        "  text \"two\" next ctx",
        "let webApp = choose [",
        "  GET >=> route \"/health\" >=> health",
        "]"
      ].join("\n")
    });
    const malformed = extractFileFacts({
      filePath: "src/malformed.fs",
      language: "fsharp",
      sourceText: "open Giraffe\nlet webApp = choose [\n  GET >=> route \"/health\" >=> health"
    });
    const unterminatedComment = extractFileFacts({
      filePath: "src/comment.fs",
      language: "fsharp",
      sourceText: "(* open Giraffe\nlet webApp = choose ["
    });
    const tabbed = extractFileFacts({
      filePath: "src/tabbed.fs",
      language: "fsharp",
      sourceText: [
        "open Giraffe",
        "let health (next : HttpFunc) (ctx : HttpContext) =",
        "\ttext \"ok\" next ctx",
        "let webApp = choose [",
        "  GET >=> route \"/health\" >=> health",
        "]"
      ].join("\n")
    });

    for (const facts of [
      missingOpen,
      qualifiedOpen,
      dynamicPath,
      inlineHandler,
      nestedRoute,
      tripleQuotedRoute,
      interpolatedTripleQuotedRoute,
      shadowedRoute,
      malformed,
      unterminatedComment,
      tabbed
    ]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(malformed.symbols).toHaveLength(1);
    expect(unterminatedComment.symbols).toHaveLength(1);
    expect(tabbed.symbols).toHaveLength(1);
    expect(duplicateHandler.edges.filter((edge) => edge.kind === "routes")).toEqual([
      expect.objectContaining({
        resolution: "unresolved",
        evidence: expect.objectContaining({
          ruleId: "framework.giraffe.direct-choose.literal-named-function.unresolved"
        })
      })
    ]);
  });

  it("extracts direct Nim Jester route blocks with exact and unresolved evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/app.nim",
      language: "nim",
      sourceText: [
        "import asyncdispatch, jester",
        "",
        "#[",
        "  #[",
        "  get \"/ignored\":",
        "    ignored()",
        "  ]#",
        "]#",
        "",
        "proc health*() =",
        "  discard",
        "",
        "proc createUser() =",
        "  discard",
        "",
        "routes:",
        "  get \"/health\":",
        "    health()",
        "  post \"/users\":",
        "    createUser()",
        "  patch \"/missing\":",
        "    missing()",
        "",
        "router admin:",
        "  delete \"/users\":",
        "    health()"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)
    ).toEqual(["src/app.nim.health", "src/app.nim.createUser"]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName ?? null,
          edge.referenceName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/app.nim.health",
        "health",
        "framework.jester.direct-route-block.literal-named-proc.local-proc",
        "exact",
        1
      ],
      [
        "POST /users",
        "src/app.nim.createUser",
        "createUser",
        "framework.jester.direct-route-block.literal-named-proc.local-proc",
        "exact",
        1
      ],
      [
        "PATCH /missing",
        null,
        "missing",
        "framework.jester.direct-route-block.literal-named-proc.unresolved",
        "unresolved",
        0
      ],
      [
        "DELETE /users",
        "src/app.nim.health",
        "health",
        "framework.jester.direct-route-block.literal-named-proc.local-proc",
        "exact",
        1
      ]
    ]);
  });

  it("requires direct Jester proof, literal route blocks, one direct proc call, and valid Nim layout", () => {
    const missingImport = extractFileFacts({
      filePath: "src/missing-import.nim",
      language: "nim",
      sourceText: [
        "proc health() =",
        "  discard",
        "routes:",
        "  get \"/health\":",
        "    health()"
      ].join("\n")
    });
    const aliasedImport = extractFileFacts({
      filePath: "src/aliased-import.nim",
      language: "nim",
      sourceText: [
        "import jester as web",
        "proc health() =",
        "  discard",
        "routes:",
        "  get \"/health\":",
        "    health()"
      ].join("\n")
    });
    const repeatedImport = extractFileFacts({
      filePath: "src/repeated-import.nim",
      language: "nim",
      sourceText: [
        "import jester",
        "import jester",
        "proc health() =",
        "  discard",
        "routes:",
        "  get \"/health\":",
        "    health()"
      ].join("\n")
    });
    const mixedAliasImport = extractFileFacts({
      filePath: "src/mixed-alias-import.nim",
      language: "nim",
      sourceText: [
        "import jester, jester as web",
        "proc health() =",
        "  discard",
        "routes:",
        "  get \"/health\":",
        "    health()"
      ].join("\n")
    });
    const fromImport = extractFileFacts({
      filePath: "src/from-import.nim",
      language: "nim",
      sourceText: [
        "from jester import routes, get",
        "proc health() =",
        "  discard",
        "routes:",
        "  get \"/health\":",
        "    health()"
      ].join("\n")
    });
    const dynamicPath = extractFileFacts({
      filePath: "src/dynamic.nim",
      language: "nim",
      sourceText: [
        "import jester",
        "const healthPath = \"/health\"",
        "proc health() =",
        "  discard",
        "routes:",
        "  get healthPath:",
        "    health()"
      ].join("\n")
    });
    const inlineHandler = extractFileFacts({
      filePath: "src/inline.nim",
      language: "nim",
      sourceText: [
        "import jester",
        "routes:",
        "  get \"/health\":",
        "    resp \"ok\""
      ].join("\n")
    });
    const multiStatementHandler = extractFileFacts({
      filePath: "src/multi.nim",
      language: "nim",
      sourceText: [
        "import jester",
        "proc health() =",
        "  discard",
        "routes:",
        "  get \"/health\":",
        "    health()",
        "    discard"
      ].join("\n")
    });
    const nestedRoute = extractFileFacts({
      filePath: "src/nested.nim",
      language: "nim",
      sourceText: [
        "import jester",
        "proc health() =",
        "  discard",
        "routes:",
        "  if true:",
        "    get \"/health\":",
        "      health()"
      ].join("\n")
    });
    const longStringRoute = extractFileFacts({
      filePath: "src/string.nim",
      language: "nim",
      sourceText: [
        "import jester",
        "let documentation = \"\"\"",
        "routes:",
        "  get \"/health\":",
        "    health()",
        "\"\"\""
      ].join("\n")
    });
    const shadowedRoute = extractFileFacts({
      filePath: "src/shadowed.nim",
      language: "nim",
      sourceText: [
        "import jester",
        "proc get() =",
        "  discard",
        "proc health() =",
        "  discard",
        "routes:",
        "  get \"/health\":",
        "    health()"
      ].join("\n")
    });
    const malformed = extractFileFacts({
      filePath: "src/malformed.nim",
      language: "nim",
      sourceText: "import jester\nroutes:\n  get \"/health\":\n    health("
    });
    const unterminatedComment = extractFileFacts({
      filePath: "src/comment.nim",
      language: "nim",
      sourceText: "#[ import jester\nroutes:"
    });
    const tabbed = extractFileFacts({
      filePath: "src/tabbed.nim",
      language: "nim",
      sourceText: [
        "import jester",
        "proc health() =",
        "\tdiscard",
        "routes:",
        "  get \"/health\":",
        "    health()"
      ].join("\n")
    });
    const duplicateHandler = extractFileFacts({
      filePath: "src/duplicate.nim",
      language: "nim",
      sourceText: [
        "import jester",
        "proc health() =",
        "  discard",
        "proc health() =",
        "  discard",
        "routes:",
        "  get \"/health\":",
        "    health()"
      ].join("\n")
    });

    for (const facts of [
      missingImport,
      aliasedImport,
      repeatedImport,
      mixedAliasImport,
      fromImport,
      dynamicPath,
      inlineHandler,
      multiStatementHandler,
      nestedRoute,
      longStringRoute,
      shadowedRoute,
      malformed,
      unterminatedComment,
      tabbed
    ]) {
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
    expect(malformed.symbols).toHaveLength(1);
    expect(unterminatedComment.symbols).toHaveLength(1);
    expect(tabbed.symbols).toHaveLength(1);
    expect(duplicateHandler.edges.filter((edge) => edge.kind === "routes")).toEqual([
      expect.objectContaining({
        resolution: "unresolved",
        evidence: expect.objectContaining({
          ruleId: "framework.jester.direct-route-block.literal-named-proc.unresolved"
        })
      })
    ]);
  });

  it("extracts direct C++ cpp-httplib named-handler routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/server.cpp",
      language: "cpp",
      sourceText: [
        "#include <httplib.h>",
        "",
        "void health(const httplib::Request &, httplib::Response &) {}",
        "void create_user(const httplib::Request &, httplib::Response &) {}",
        "void delete_user(const httplib::Request &, httplib::Response &) {}",
        "",
        "class HealthApi {",
        "public:",
        "  void ping() {}",
        "};",
        "",
        "int main() {",
        "  httplib::Server server;",
        "  server.Get(\"/health\", health);",
        "  server.Post(\"/users\", create_user);",
        "  server.Delete(\"/users/:id\", delete_user);",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "method").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/server.cpp#HealthApi.ping"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/server.cpp#health",
        "framework.cpp-httplib.direct-server.literal-route.local-function",
        "exact",
        1
      ],
      [
        "POST /users",
        "src/server.cpp#create_user",
        "framework.cpp-httplib.direct-server.literal-route.local-function",
        "exact",
        1
      ],
      [
        "DELETE /users/:id",
        "src/server.cpp#delete_user",
        "framework.cpp-httplib.direct-server.literal-route.local-function",
        "exact",
        1
      ]
    ]);
  });

  it("requires direct C++ httplib include, local server binding, literal path, and unrebound named handler", () => {
    const unproven = extractFileFacts({
      filePath: "src/unproven.cpp",
      language: "cpp",
      sourceText: [
        "void health() {}",
        "int main() {",
        "  httplib::Server server;",
        "  server.Get(\"/without-header\", health);",
        "}"
      ].join("\n")
    });
    const dynamic = extractFileFacts({
      filePath: "src/dynamic.cpp",
      language: "cpp",
      sourceText: [
        "#include <httplib.h>",
        "void health() {}",
        "int main() {",
        "  httplib::Server server;",
        "  const char *path = \"/dynamic\";",
        "  server.Get(path, health);",
        "  server = make_server();",
        "  server.Get(\"/rebound\", health);",
        "  server.Get(\"/missing\", missing);",
        "}"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "src/broken.cpp",
      language: "cpp",
      sourceText: [
        "#include <httplib.h>",
        "void health() {}",
        "int main( {",
        "  httplib::Server server;",
        "  server.Get(\"/broken\", health);",
        "}"
      ].join("\n")
    });

    expect(unproven.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(unproven.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(dynamic.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(dynamic.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "function")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(broken.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("accepts direct quoted cpp-httplib headers and SSLServer bindings", () => {
    const facts = extractFileFacts({
      filePath: "src/secure.cpp",
      language: "cpp",
      sourceText: [
        '#include "httplib.h"',
        "void health(const httplib::Request &, httplib::Response &) {}",
        "int main() {",
        "  httplib::SSLServer secure;",
        "  secure.Head(\"/health\", health);",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "HEAD /health",
        "src/secure.cpp#health",
        "framework.cpp-httplib.direct-server.literal-route.local-function"
      ]
    ]);
  });

  it("extracts direct C# ASP.NET Core Minimal API and ApiController routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/Program.cs",
      language: "csharp",
      sourceText: [
        "using Microsoft.AspNetCore.Mvc;",
        "",
        "var builder = WebApplication.CreateBuilder(args);",
        "var app = builder.Build();",
        "",
        "app.MapGet(\"/health\", Health);",
        "app.MapPost(\"/orders\", CreateOrder);",
        "",
        "static string Health() => \"ok\";",
        "static void CreateOrder() {}",
        "",
        "namespace Store.Api {",
        "  [ApiController]",
        "  [Route(\"api/orders\")]",
        "  public class OrdersController : ControllerBase {",
        "    [HttpGet(\"{id}\")]",
        "    public string GetById(int id) { return \"ok\"; }",
        "    [HttpDelete]",
        "    public void Delete() {}",
        "  }",
        "  public interface IOrders { void List(); }",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/Program.cs#OrdersController"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "interface").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/Program.cs#IOrders"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "method").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/Program.cs#OrdersController.GetById",
      "src/Program.cs#OrdersController.Delete",
      "src/Program.cs#IOrders.List"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /api/orders/{id}",
        "src/Program.cs#OrdersController.GetById",
        "framework.aspnet-core.direct-api-controller.literal-route.method",
        "exact",
        1
      ],
      [
        "DELETE /api/orders",
        "src/Program.cs#OrdersController.Delete",
        "framework.aspnet-core.direct-api-controller.literal-route.method",
        "exact",
        1
      ],
      [
        "GET /health",
        "src/Program.cs#Health",
        "framework.aspnet-core.direct-web-application.literal-route.local-function",
        "exact",
        1
      ],
      [
        "POST /orders",
        "src/Program.cs#CreateOrder",
        "framework.aspnet-core.direct-web-application.literal-route.local-function",
        "exact",
        1
      ]
    ]);
  });

  it("requires direct C# ASP.NET Core bindings, literal routes, exact MVC evidence, and valid syntax", () => {
    const unproven = extractFileFacts({
      filePath: "src/unproven.cs",
      language: "csharp",
      sourceText: [
        "var builder = WebApplication.CreateBuilder(args);",
        "var app = builder.Build();",
        "app.MapGet(route, Health);",
        "app.MapGet(\"/lambda\", () => \"ok\");",
        "app = CreateReplacement();",
        "app.MapPost(\"/after-rebind\", Health);",
        "static string Health() => \"ok\";"
      ].join("\n")
    });
    const noMvcEvidence = extractFileFacts({
      filePath: "src/no-mvc-evidence.cs",
      language: "csharp",
      sourceText: [
        "[ApiController]",
        "[Route(\"api/orders\")]",
        "public class OrdersController {",
        "  [HttpGet]",
        "  public void List() {}",
        "}"
      ].join("\n")
    });
    const qualifiedMvc = extractFileFacts({
      filePath: "src/qualified-mvc.cs",
      language: "csharp",
      sourceText: [
        "[Microsoft.AspNetCore.Mvc.ApiController]",
        "[Microsoft.AspNetCore.Mvc.Route(\"api/secure\")]",
        "public class SecureController {",
        "  [Microsoft.AspNetCore.Mvc.HttpHead(\"health\")]",
        "  public void Health() {}",
        "}"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "src/broken.cs",
      language: "csharp",
      sourceText: [
        "public class Broken {",
        "  public void Get( {",
        "}"
      ].join("\n")
    });

    expect(unproven.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(unproven.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(noMvcEvidence.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(noMvcEvidence.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(qualifiedMvc.edges.filter((edge) => edge.kind === "routes").map((edge) => edge.evidence?.ruleId)).toEqual([
      "framework.aspnet-core.direct-api-controller.literal-route.method"
    ]);
    expect(
      qualifiedMvc.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)
    ).toEqual(["HEAD /api/secure/health"]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "class")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "method")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(broken.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Ruby Rails routes.draw controller-action routes with exact local evidence", () => {
    const facts = extractFileFacts({
      filePath: "config/routes.rb",
      language: "ruby",
      sourceText: [
        "Rails.application.routes.draw do",
        "  get \"/health\", to: \"health#show\"",
        "  post \"/orders\", to: \"orders#create\"",
        "  head \"/status\", to: \"status#check\"",
        "end",
        "",
        "class HealthController",
        "  def show",
        "  end",
        "end",
        "",
        "class OrdersController",
        "  def create",
        "  end",
        "end",
        "",
        "class StatusController",
        "  def check",
        "  end",
        "end",
        "",
        "def helper",
        "end"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)).toEqual([
      "config/routes.rb#HealthController",
      "config/routes.rb#OrdersController",
      "config/routes.rb#StatusController"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)).toEqual([
      "config/routes.rb#helper"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "config/routes.rb#HealthController.show",
        "framework.rails.direct-routes-draw.literal-controller-action.local-method",
        "exact",
        1
      ],
      [
        "POST /orders",
        "config/routes.rb#OrdersController.create",
        "framework.rails.direct-routes-draw.literal-controller-action.local-method",
        "exact",
        1
      ],
      [
        "HEAD /status",
        "config/routes.rb#StatusController.check",
        "framework.rails.direct-routes-draw.literal-controller-action.local-method",
        "exact",
        1
      ]
    ]);
  });

  it("requires a direct Ruby Rails routes.draw block, literal route/action shape, and valid syntax", () => {
    const unproven = extractFileFacts({
      filePath: "config/routes.rb",
      language: "ruby",
      sourceText: [
        "get \"/outside\", to: \"health#show\"",
        "Rails.application.routes.draw do",
        "  get path, to: \"health#show\"",
        "  get \"/without-action\"",
        "  get \"/extra\", to: \"health#show\", as: :health",
        "end"
      ].join("\n")
    });
    const unresolved = extractFileFacts({
      filePath: "config/routes.rb",
      language: "ruby",
      sourceText: [
        "Rails.application.routes.draw do",
        "  delete \"/admin/health\", to: \"admin/health#destroy\"",
        "end"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "config/routes.rb",
      language: "ruby",
      sourceText: [
        "Rails.application.routes.draw do",
        "  get \"/broken\", to: \"health#show\""
      ].join("\n")
    });

    expect(unproven.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(unproven.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(unresolved.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)).toEqual([
      "DELETE /admin/health"
    ]);
    expect(
      unresolved.edges.filter((edge) => edge.kind === "routes").map((edge) => [
        edge.targetId,
        edge.referenceName,
        edge.resolution,
        edge.confidence,
        edge.evidence?.ruleId
      ])
    ).toEqual([
      [
        null,
        "admin/health#destroy",
        "unresolved",
        0,
        "framework.rails.direct-routes-draw.literal-controller-action.unresolved-controller-method"
      ]
    ]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "class")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(broken.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Kotlin Ktor Application.module callable-reference routes with exact local evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/Application.kt",
      language: "kotlin",
      sourceText: [
        "import io.ktor.server.application.Application",
        "import io.ktor.server.routing.routing",
        "import io.ktor.server.routing.get",
        "import io.ktor.server.routing.post",
        "import io.ktor.server.routing.head",
        "",
        "fun Application.module() {",
        "  routing {",
        "    get(\"/health\", ::health)",
        "    post(\"/orders\", ::createOrder)",
        "    head(\"/status\", ::status)",
        "  }",
        "}",
        "",
        "class HealthController {",
        "  fun show() {}",
        "}",
        "",
        "interface HealthCheck {",
        "  fun check()",
        "}",
        "",
        "fun health() {}",
        "suspend fun createOrder() {}",
        "fun status() {}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/Application.kt#HealthController"
    ]);
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "interface").map((symbol) => symbol.qualifiedName)
    ).toEqual(["src/Application.kt#HealthCheck"]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "method").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/Application.kt#HealthController.show",
      "src/Application.kt#HealthCheck.check"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)).toEqual([
      "src/Application.kt#module",
      "src/Application.kt#health",
      "src/Application.kt#createOrder",
      "src/Application.kt#status"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/Application.kt#health",
        "framework.ktor.direct-application-module.routing.literal-route.callable-reference.local-function",
        "exact",
        1
      ],
      [
        "POST /orders",
        "src/Application.kt#createOrder",
        "framework.ktor.direct-application-module.routing.literal-route.callable-reference.local-function",
        "exact",
        1
      ],
      [
        "HEAD /status",
        "src/Application.kt#status",
        "framework.ktor.direct-application-module.routing.literal-route.callable-reference.local-function",
        "exact",
        1
      ]
    ]);
  });

  it("requires direct Kotlin Ktor imports, Application.module shape, literal callable-reference routes, and valid syntax", () => {
    const unproven = extractFileFacts({
      filePath: "src/Application.kt",
      language: "kotlin",
      sourceText: [
        "import io.ktor.server.application.Application",
        "import io.ktor.server.routing.routing",
        "import io.ktor.server.routing.get",
        "",
        "fun Application.module() {",
        "  routing {",
        "    get(path, ::health)",
        "    get(\"/lambda\") {}",
        "    get(\"/extra\", ::health, ::health)",
        "    get(\"/missing\", ::missing)",
        "  }",
        "}",
        "",
        "fun health() {}"
      ].join("\n")
    });
    const missingImport = extractFileFacts({
      filePath: "src/Application.kt",
      language: "kotlin",
      sourceText: [
        "import io.ktor.server.application.Application",
        "import io.ktor.server.routing.routing",
        "",
        "fun Application.module() {",
        "  routing {",
        "    get(\"/without-import\", ::health)",
        "  }",
        "}",
        "",
        "fun health() {}"
      ].join("\n")
    });
    const wrongModule = extractFileFacts({
      filePath: "src/Application.kt",
      language: "kotlin",
      sourceText: [
        "import io.ktor.server.application.Application",
        "import io.ktor.server.routing.routing",
        "import io.ktor.server.routing.get",
        "",
        "fun module() {",
        "  routing {",
        "    get(\"/wrong-module\", ::health)",
        "  }",
        "}",
        "",
        "fun health() {}"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "src/Application.kt",
      language: "kotlin",
      sourceText: [
        "import io.ktor.server.application.Application",
        "import io.ktor.server.routing.routing",
        "import io.ktor.server.routing.get",
        "",
        "fun Application.module() {",
        "  routing {",
        "    get(\"/broken\", ::health)"
      ].join("\n")
    });

    expect(unproven.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(unproven.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(missingImport.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(wrongModule.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "function")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(broken.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Swift Vapor routes(_ app: Application) routes with exact local evidence", () => {
    const facts = extractFileFacts({
      filePath: "Sources/App/routes.swift",
      language: "swift",
      sourceText: [
        "import Vapor",
        "",
        "public func routes(_ app: Application) throws {",
        "  app.get(\"health\", use: health)",
        "  app.post(\"orders\", \":id\", use: updateOrder)",
        "  app.head(use: status)",
        "}",
        "",
        "class HealthController {",
        "  func show() {}",
        "}",
        "",
        "struct Checkpoint {",
        "  func verify() {}",
        "}",
        "",
        "protocol HealthCheck {",
        "  func check()",
        "}",
        "",
        "func health(req: Request) throws -> String { \"ok\" }",
        "func updateOrder(req: Request) throws -> String { \"updated\" }",
        "func status(req: Request) throws -> String { \"ready\" }"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)).toEqual([
      "Sources/App/routes.swift#HealthController",
      "Sources/App/routes.swift#Checkpoint"
    ]);
    expect(
      facts.symbols.filter((symbol) => symbol.kind === "interface").map((symbol) => symbol.qualifiedName)
    ).toEqual(["Sources/App/routes.swift#HealthCheck"]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "method").map((symbol) => symbol.qualifiedName)).toEqual([
      "Sources/App/routes.swift#HealthController.show",
      "Sources/App/routes.swift#Checkpoint.verify",
      "Sources/App/routes.swift#HealthCheck.check"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)).toEqual([
      "Sources/App/routes.swift#routes",
      "Sources/App/routes.swift#health",
      "Sources/App/routes.swift#updateOrder",
      "Sources/App/routes.swift#status"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "Sources/App/routes.swift#health",
        "framework.vapor.direct-routes-application.literal-segment-route.use.local-function",
        "exact",
        1
      ],
      [
        "POST /orders/:id",
        "Sources/App/routes.swift#updateOrder",
        "framework.vapor.direct-routes-application.literal-segment-route.use.local-function",
        "exact",
        1
      ],
      [
        "HEAD /",
        "Sources/App/routes.swift#status",
        "framework.vapor.direct-routes-application.literal-segment-route.use.local-function",
        "exact",
        1
      ]
    ]);
  });

  it("requires direct Swift Vapor imports, routes(_ app: Application), literal named routes, and valid syntax", () => {
    const unproven = extractFileFacts({
      filePath: "Sources/App/routes.swift",
      language: "swift",
      sourceText: [
        "import Vapor",
        "",
        "func routes(_ app: Application) throws {",
        "  app.get(path, use: health)",
        "  app.get(\"lambda\") { request in \"ok\" }",
        "  app.get(\"extra\", use: health, middleware: health)",
        "  app.get(\"missing\", use: missing)",
        "}",
        "",
        "func health(req: Request) throws -> String { \"ok\" }"
      ].join("\n")
    });
    const missingImport = extractFileFacts({
      filePath: "Sources/App/routes.swift",
      language: "swift",
      sourceText: [
        "func routes(_ app: Application) throws {",
        "  app.get(\"without-import\", use: health)",
        "}",
        "",
        "func health(req: Request) throws -> String { \"ok\" }"
      ].join("\n")
    });
    const wrongRoutesFunction = extractFileFacts({
      filePath: "Sources/App/routes.swift",
      language: "swift",
      sourceText: [
        "import Vapor",
        "",
        "func configure(_ app: Application) throws {",
        "  app.get(\"wrong-function\", use: health)",
        "}",
        "",
        "func health(req: Request) throws -> String { \"ok\" }"
      ].join("\n")
    });
    const wrongParameter = extractFileFacts({
      filePath: "Sources/App/routes.swift",
      language: "swift",
      sourceText: [
        "import Vapor",
        "",
        "func routes(_ server: Application) throws {",
        "  server.get(\"wrong-parameter\", use: health)",
        "}",
        "",
        "func health(req: Request) throws -> String { \"ok\" }"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "Sources/App/routes.swift",
      language: "swift",
      sourceText: [
        "import Vapor",
        "",
        "func routes(_ app: Application) throws {",
        "  app.get(\"broken\", use: health)"
      ].join("\n")
    });

    expect(unproven.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(unproven.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(missingImport.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(wrongRoutesFunction.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(wrongParameter.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "function")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(broken.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Dart Flutter MaterialApp literal routes maps with exact local evidence", () => {
    const facts = extractFileFacts({
      filePath: "lib/main.dart",
      language: "dart",
      sourceText: [
        "import 'package:flutter/material.dart';",
        "",
        "class MyApp extends StatelessWidget {",
        "  Widget build(BuildContext context) {",
        "    return MaterialApp(",
        "      routes: {",
        "        '/': (context) => const HomePage(),",
        "        '/settings': (context) => SettingsPage(),",
        "      },",
        "    );",
        "  }",
        "}",
        "",
        "class HomePage extends StatelessWidget {",
        "  const HomePage();",
        "}",
        "",
        "class SettingsPage extends StatelessWidget {",
        "  SettingsPage();",
        "}",
        "",
        "abstract class HealthCheck {",
        "  void check();",
        "}",
        "",
        "void main() {}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)).toEqual([
      "lib/main.dart#MyApp",
      "lib/main.dart#HomePage",
      "lib/main.dart#SettingsPage",
      "lib/main.dart#HealthCheck"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "method").map((symbol) => symbol.qualifiedName)).toEqual([
      "lib/main.dart#MyApp.build",
      "lib/main.dart#HealthCheck.check"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)).toEqual([
      "lib/main.dart#main"
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "NAVIGATE /",
        "lib/main.dart#HomePage",
        "framework.flutter.direct-material-app.literal-routes-map.local-widget-class",
        "exact",
        1
      ],
      [
        "NAVIGATE /settings",
        "lib/main.dart#SettingsPage",
        "framework.flutter.direct-material-app.literal-routes-map.local-widget-class",
        "exact",
        1
      ]
    ]);
  });

  it("requires direct Dart Flutter imports, literal MaterialApp routes maps, local widget classes, and valid syntax", () => {
    const unproven = extractFileFacts({
      filePath: "lib/main.dart",
      language: "dart",
      sourceText: [
        "import 'package:flutter/material.dart';",
        "",
        "class HomePage extends StatelessWidget {}",
        "",
        "void build() {",
        "  MaterialApp(routes: {",
        "    path: (context) => const HomePage(),",
        "    '/closure': (context) { return const HomePage(); },",
        "    '/missing': (context) => const MissingPage(),",
        "  });",
        "}"
      ].join("\n")
    });
    const missingImport = extractFileFacts({
      filePath: "lib/main.dart",
      language: "dart",
      sourceText: [
        "class HomePage extends StatelessWidget {}",
        "",
        "void build() {",
        "  MaterialApp(routes: {",
        "    '/missing-import': (context) => const HomePage(),",
        "  });",
        "}"
      ].join("\n")
    });
    const wrongApp = extractFileFacts({
      filePath: "lib/main.dart",
      language: "dart",
      sourceText: [
        "import 'package:flutter/material.dart';",
        "",
        "class HomePage extends StatelessWidget {}",
        "",
        "void build() {",
        "  CupertinoApp(routes: {",
        "    '/wrong-app': (context) => const HomePage(),",
        "  });",
        "}"
      ].join("\n")
    });
    const missingRoutes = extractFileFacts({
      filePath: "lib/main.dart",
      language: "dart",
      sourceText: [
        "import 'package:flutter/material.dart';",
        "",
        "class HomePage extends StatelessWidget {}",
        "",
        "void build() {",
        "  MaterialApp(home: const HomePage());",
        "}"
      ].join("\n")
    });
    const broken = extractFileFacts({
      filePath: "lib/main.dart",
      language: "dart",
      sourceText: [
        "import 'package:flutter/material.dart';",
        "",
        "class MyApp extends StatelessWidget {",
        "  Widget build(BuildContext context) {",
        "    return MaterialApp(routes: {",
        "      '/broken': (context) => const HomePage(),"
      ].join("\n")
    });

    expect(unproven.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(unproven.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(missingImport.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(wrongApp.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(missingRoutes.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "class")).toEqual([]);
    expect(broken.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(broken.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Scala class, object, trait, method, and top-level function containment", () => {
    const facts = extractFileFacts({
      filePath: "app/controllers/HealthController.scala",
      language: "scala",
      sourceText: [
        "package controllers",
        "",
        "class HealthController {",
        "  def health(): String = \"ok\"",
        "}",
        "",
        "object Application {",
        "  def main(args: Array[String]): Unit = {}",
        "}",
        "",
        "trait HealthService {",
        "  def check(): String",
        "}",
        "",
        "def utility(): Int = 1"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.qualifiedName)).toEqual([
      "app/controllers/HealthController.scala#HealthController",
      "app/controllers/HealthController.scala#Application"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "interface").map((symbol) => symbol.qualifiedName)).toEqual([
      "app/controllers/HealthController.scala#HealthService"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "method").map((symbol) => symbol.qualifiedName)).toEqual([
      "app/controllers/HealthController.scala#HealthController.health",
      "app/controllers/HealthController.scala#Application.main",
      "app/controllers/HealthController.scala#HealthService.check"
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "function").map((symbol) => symbol.qualifiedName)).toEqual([
      "app/controllers/HealthController.scala#utility"
    ]);
    expect(
      facts.scalaFacts?.classes.map((fact) => [
        symbolsById.get(fact.symbolId)?.name,
        fact.packageName
      ])
    ).toEqual([
      ["HealthController", "controllers"],
      ["Application", "controllers"]
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("extracts direct Play conf/routes literal controller actions as pending references", () => {
    const facts = extractFileFacts({
      filePath: "conf/routes",
      language: "scala",
      sourceText: [
        "# A static Play route table",
        "GET     /health        controllers.HealthController.health",
        "POST    /orders        controllers.OrderController.create(input: OrderInput)",
        "GET     /assets/*file  controllers.Assets.versioned(path = \"/public\", file: Asset)",
        "->      /api           api.Routes",
        "GET     missing        controllers.InvalidController.missing",
        "GET     /dynamic       controllers.DynamicController.handler + suffix"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)).toEqual([
      "GET /health",
      "POST /orders",
      "GET /assets/*file",
      "MOUNT /api -> api.Routes"
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(facts.scalaFacts?.routerMounts.map((mount) => [
      symbolsById.get(mount.symbolId)?.name,
      mount.prefix,
      mount.routerName,
      mount.range.start.line
    ])).toEqual([
      ["MOUNT /api -> api.Routes", "/api", "api.Routes", 5]
    ]);
    expect(
      facts.pendingReferences.map((reference) => [
        symbolsById.get(reference.sourceId)?.name,
        reference.referenceName,
        reference.routeFramework,
        reference.relationKind
        ])
    ).toEqual([
      [
        "GET /health",
        "controllers.HealthController.health",
        "play",
        "routes"
      ],
      [
        "POST /orders",
        "controllers.OrderController.create",
        "play",
        "routes"
      ],
      [
        "GET /assets/*file",
        "controllers.Assets.versioned",
        "play",
        "routes"
      ]
    ]);
  });

  it("records direct Java package facts for cross-file Play controller resolution", () => {
    const facts = extractFileFacts({
      filePath: "app/controllers/HealthController.java",
      language: "java",
      sourceText: [
        "package controllers;",
        "",
        "public class HealthController {",
        "  public String health() { return \"ok\"; }",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(facts.javaFacts?.classes.map((fact) => [
      symbolsById.get(fact.symbolId)?.name,
      fact.packageName
    ])).toEqual([
      ["HealthController", "controllers"]
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "method").map((symbol) => symbol.qualifiedName)).toEqual([
      "app/controllers/HealthController.java#HealthController.health"
    ]);
  });

  it("fails closed for dynamic Play router-mount prefixes", () => {
    const facts = extractFileFacts({
      filePath: "conf/routes",
      language: "scala",
      sourceText: [
        "-> /api api.Routes",
        "-> /:tenant api.DynamicRoutes",
        "-> /api/*tail api.WildcardRoutes",
        "-> /api api.Routes + suffix"
      ].join("\n")
    });

    expect(facts.scalaFacts?.routerMounts.map((mount) => [mount.prefix, mount.routerName])).toEqual([
      ["/api", "api.Routes"]
    ]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)).toEqual([
      "MOUNT /api -> api.Routes"
    ]);
  });

  it("fails closed for malformed Scala syntax and does not treat non-Play config files as routes", () => {
    const broken = extractFileFacts({
      filePath: "app/Broken.scala",
      language: "scala",
      sourceText: "class Broken { def broken( = }"
    });
    const unsupportedConfig = extractFileFacts({
      filePath: "routes",
      language: "scala",
      sourceText: "GET /health controllers.HealthController.health"
    });

    expect(broken.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
    expect(broken.edges).toEqual([]);
    expect(unsupportedConfig.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
    expect(unsupportedConfig.edges).toEqual([]);
  });

  it("extracts direct Rust Axum literal route-builder chains with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/http.rs",
      language: "rust",
      sourceText: [
        "use axum::{Router as AppRouter, routing::{get as axum_get, post, trace}};",
        "",
        "async fn health() {}",
        "async fn create_user() {}",
        "async fn diagnostics() {}",
        "",
        "pub fn app() {",
        "  let app = AppRouter::new()",
        "    .route(\"/health\", axum_get(health))",
        "    .route(\"/users\", post(create_user))",
        "    .route(\"/diagnostics\", trace(diagnostics));",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/http.rs#health",
        "framework.axum.direct-router.route.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /users",
        "src/http.rs#create_user",
        "framework.axum.direct-router.route.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "TRACE /diagnostics",
        "src/http.rs#diagnostics",
        "framework.axum.direct-router.route.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("extracts the conventional direct Rust Axum routing import list", () => {
    const facts = extractFileFacts({
      filePath: "src/conventional.rs",
      language: "rust",
      sourceText: [
        "use axum::Router;",
        "use axum::routing::{get, post};",
        "",
        "async fn health() {}",
        "async fn create_user() {}",
        "",
        "fn app() {",
        "  let app = Router::new()",
        "    .route(\"/health\", get(health))",
        "    .route(\"/users\", post(create_user));",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "GET /health",
        "src/conventional.rs#health",
        "framework.axum.direct-router.route.local-function"
      ],
      [
        "POST /users",
        "src/conventional.rs#create_user",
        "framework.axum.direct-router.route.local-function"
      ]
    ]);
  });

  it("extracts direct imported Actix Web and Rocket attribute routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/attribute-routes.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{get as actix_get, post};",
        "use rocket::{delete as rocket_delete, get as rocket_get};",
        "",
        "#[actix_get(\"/health\")]",
        "async fn health() {}",
        "",
        "#[post(\"/users\")]",
        "async fn create_user() {}",
        "",
        "#[rocket_delete(\"/users/:id\")]",
        "fn delete_user() {}",
        "",
        "#[rocket_get(\"/ready\")]",
        "fn ready() {}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/attribute-routes.rs#health",
        "framework.actix-web.attribute-route.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /users",
        "src/attribute-routes.rs#create_user",
        "framework.actix-web.attribute-route.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "DELETE /users/:id",
        "src/attribute-routes.rs#delete_user",
        "framework.rocket.attribute-route.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /ready",
        "src/attribute-routes.rs#ready",
        "framework.rocket.attribute-route.literal-path.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("extracts direct imported Actix Web App and resource builder routes with exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/actix-builder.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{App as HttpApp, web as http};",
        "",
        "async fn health() {}",
        "async fn list_users() {}",
        "async fn create_user() {}",
        "async fn all_methods() {}",
        "",
        "fn configure() {",
        "  let app = HttpApp::new()",
        "    .route(\"/health\", http::get().to(health))",
        "    .service(",
        "      http::resource(\"/users\")",
        "        .route(http::get().to(list_users))",
        "        .route(http::post().to(create_user))",
        "    )",
        "    .service(http::resource(\"/all\").to(all_methods));",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/actix-builder.rs#health",
        "framework.actix-web.direct-app.route.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /users",
        "src/actix-builder.rs#list_users",
        "framework.actix-web.direct-app.web-resource.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /users",
        "src/actix-builder.rs#create_user",
        "framework.actix-web.direct-app.web-resource.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "ALL /all",
        "src/actix-builder.rs#all_methods",
        "framework.actix-web.direct-app.web-resource.literal-path.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("extracts direct imported Actix Web scope builder routes with exact prefixed evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/actix-scope-builder.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{App as HttpApp, web as http};",
        "",
        "async fn health() {}",
        "async fn list_users() {}",
        "async fn create_user() {}",
        "async fn all_api_methods() {}",
        "async fn root_health() {}",
        "",
        "fn configure() {",
        "  let app = HttpApp::new().service(",
        "    http::scope(\"/api\")",
        "      .route(\"/health\", http::get().to(health))",
        "      .service(http::resource(\"/users\").route(http::get().to(list_users)))",
        "      .service(",
        "        http::scope(\"/v1\")",
        "          .service(http::resource(\"/users\").route(http::post().to(create_user)))",
        "          .service(http::resource(\"/all\").to(all_api_methods))",
        "      ),",
        "  );",
        "}",
        "",
        "fn root_scope() {",
        "  let app = HttpApp::new().service(http::scope(\"/\").route(\"/health\", http::get().to(root_health)));",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /api/health",
        "src/actix-scope-builder.rs#health",
        "framework.actix-web.direct-app.web-scope.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /api/users",
        "src/actix-scope-builder.rs#list_users",
        "framework.actix-web.direct-app.web-scope.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /api/v1/users",
        "src/actix-scope-builder.rs#create_user",
        "framework.actix-web.direct-app.web-scope.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "ALL /api/v1/all",
        "src/actix-scope-builder.rs#all_api_methods",
        "framework.actix-web.direct-app.web-scope.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /health",
        "src/actix-scope-builder.rs#root_health",
        "framework.actix-web.direct-app.web-scope.literal-path.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("projects direct mounted Actix attribute services through App and scope prefixes", () => {
    const facts = extractFileFacts({
      filePath: "src/actix-attribute-services.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{get as actix_get, post, App as HttpApp, web as http};",
        "",
        "#[actix_get(\"/health\")]",
        "async fn health() {}",
        "",
        "#[post(\"/users\")]",
        "async fn list_users() {}",
        "",
        "#[post(\"/users\")]",
        "async fn create_user() {}",
        "",
        "#[actix_get(\"/orphan\")]",
        "async fn orphan() {}",
        "",
        "fn configure() {",
        "  let app = HttpApp::new()",
        "    .service(health)",
        "    .service(",
        "      http::scope(\"/api\")",
        "        .service(list_users)",
        "        .service(http::scope(\"/v1\").service(create_user)),",
        "    );",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/actix-attribute-services.rs#health",
        "framework.actix-web.direct-app.attribute-service.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /api/users",
        "src/actix-attribute-services.rs#list_users",
        "framework.actix-web.direct-app.web-scope.attribute-service.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /api/v1/users",
        "src/actix-attribute-services.rs#create_user",
        "framework.actix-web.direct-app.web-scope.attribute-service.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /orphan",
        "src/actix-attribute-services.rs#orphan",
        "framework.actix-web.attribute-route.literal-path.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("keeps the attribute declaration route when a direct Actix service handler is shadowed", () => {
    const facts = extractFileFacts({
      filePath: "src/shadowed-actix-attribute-service.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{get, App, web};",
        "",
        "#[get(\"/health\")]",
        "async fn health() {}",
        "",
        "fn configure(health: u8) {",
        "  let app = App::new().service(web::scope(\"/api\").service(health));",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "GET /health",
        "src/shadowed-actix-attribute-service.rs#health",
        "framework.actix-web.attribute-route.literal-path.local-function"
      ]
    ]);
  });

  it("keeps the attribute declaration route when a local use shadows an Actix service handler", () => {
    const facts = extractFileFacts({
      filePath: "src/local-use-shadowed-actix-attribute-service.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{get, App};",
        "",
        "#[get(\"/health\")]",
        "async fn health() {}",
        "",
        "fn configure() {",
        "  use crate::external::health;",
        "  let app = App::new().service(health);",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "GET /health",
        "src/local-use-shadowed-actix-attribute-service.rs#health",
        "framework.actix-web.attribute-route.literal-path.local-function"
      ]
    ]);
  });

  it("keeps the attribute declaration route when a later local function shadows an Actix service handler", () => {
    const facts = extractFileFacts({
      filePath: "src/local-function-shadowed-actix-attribute-service.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{get, App};",
        "",
        "#[get(\"/health\")]",
        "async fn health() {}",
        "",
        "fn configure() {",
        "  let app = App::new().service(health);",
        "  fn health() {}",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "GET /health",
        "src/local-function-shadowed-actix-attribute-service.rs#health",
        "framework.actix-web.attribute-route.literal-path.local-function"
      ]
    ]);
  });

  it("projects same-file Actix ServiceConfig routes through App and scope configure mounts", () => {
    const facts = extractFileFacts({
      filePath: "src/actix-service-config.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{get as actix_get, App as HttpApp, web as http};",
        "use actix_web::web::ServiceConfig as Config;",
        "",
        "async fn health() {}",
        "async fn create_user() {}",
        "async fn profile() {}",
        "async fn diagnostics() {}",
        "",
        "#[actix_get(\"/ready\")]",
        "async fn ready() {}",
        "",
        "fn common(cfg: &mut http::ServiceConfig) {",
        "  cfg.route(\"/health\", http::get().to(health));",
        "  cfg.service(ready);",
        "  cfg.service(http::resource(\"/users\").route(http::post().to(create_user)));",
        "  cfg.service(http::scope(\"/v1\").route(\"/profile\", http::get().to(profile)));",
        "}",
        "",
        "fn routes(cfg: &mut http::ServiceConfig) {",
        "  cfg.configure(common);",
        "}",
        "",
        "fn diagnostics_config(cfg: &mut Config) {",
        "  cfg.route(\"/diagnostics\", http::head().to(diagnostics));",
        "}",
        "",
        "fn configure() {",
        "  let app = HttpApp::new()",
        "    .configure(routes)",
        "    .configure(diagnostics_config)",
        "    .service(http::scope(\"/api\").configure(routes));",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId,
          edge.evidence?.stage,
          edge.resolution,
          edge.confidence
        ])
    ).toEqual([
      [
        "GET /health",
        "src/actix-service-config.rs#health",
        "framework.actix-web.direct-app.configure.service-config.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /ready",
        "src/actix-service-config.rs#ready",
        "framework.actix-web.direct-app.configure.service-config.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /users",
        "src/actix-service-config.rs#create_user",
        "framework.actix-web.direct-app.configure.service-config.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /v1/profile",
        "src/actix-service-config.rs#profile",
        "framework.actix-web.direct-app.configure.service-config.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "HEAD /diagnostics",
        "src/actix-service-config.rs#diagnostics",
        "framework.actix-web.direct-app.configure.service-config.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /api/health",
        "src/actix-service-config.rs#health",
        "framework.actix-web.direct-app.web-scope.configure.service-config.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /api/ready",
        "src/actix-service-config.rs#ready",
        "framework.actix-web.direct-app.web-scope.configure.service-config.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "POST /api/users",
        "src/actix-service-config.rs#create_user",
        "framework.actix-web.direct-app.web-scope.configure.service-config.literal-path.local-function",
        "syntax",
        "exact",
        1
      ],
      [
        "GET /api/v1/profile",
        "src/actix-service-config.rs#profile",
        "framework.actix-web.direct-app.web-scope.configure.service-config.literal-path.local-function",
        "syntax",
        "exact",
        1
      ]
    ]);
  });

  it("retains direct external-module Actix ServiceConfig facts", () => {
    const configurationFacts = extractFileFacts({
      filePath: "src/routes.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{get, web};",
        "",
        "async fn health() {}",
        "",
        "#[get(\"/ready\")]",
        "async fn ready() {}",
        "",
        "pub fn configure(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "  cfg.service(ready);",
        "}"
      ].join("\n")
    });
    const mountFacts = extractFileFacts({
      filePath: "src/main.rs",
      language: "rust",
      sourceText: [
        "mod routes;",
        "use actix_web::{App, web};",
        "use crate::routes::configure as routes_config;",
        "",
        "fn bootstrap() {",
        "  let app = App::new()",
        "    .configure(routes_config)",
        "    .service(web::scope(\"/api\").configure(routes_config));",
        "}"
      ].join("\n")
    });

    expect(configurationFacts.rustActixServiceConfigFacts).toMatchObject({
      configurations: [
        {
          name: "configure",
          routes: [
            { method: "GET", path: "/health", handlerName: "health" },
            { method: "GET", path: "/ready", handlerName: "ready" }
          ],
          mountedAttributeHandlers: ["ready"]
        }
      ]
    });
    expect(mountFacts.rustActixServiceConfigFacts).toMatchObject({
      externalModules: [{ name: "routes" }],
      importedMounts: [
        {
          configurationName: "configure",
          moduleName: "routes",
          modulePath: ["routes"],
          prefix: "/",
          kind: "app"
        },
        {
          configurationName: "configure",
          moduleName: "routes",
          modulePath: ["routes"],
          prefix: "/api",
          kind: "scope"
        }
      ]
    });
  });

  it("retains nested direct-module Actix ServiceConfig mount facts", () => {
    const facts = extractFileFacts({
      filePath: "src/main.rs",
      language: "rust",
      sourceText: [
        "pub mod api;",
        "use actix_web::{App, web};",
        "use crate::api::routes::configure as api_routes;",
        "",
        "fn bootstrap() {",
        "  let app = App::new()",
        "    .configure(api_routes)",
        "    .service(web::scope(\"/api\").configure(api_routes));",
        "}"
      ].join("\n")
    });

    expect(facts.rustActixServiceConfigFacts).toMatchObject({
      externalModules: [{ name: "api" }],
      importedMounts: [
        {
          configurationName: "configure",
          moduleName: "api",
          modulePath: ["api", "routes"],
          prefix: "/",
          kind: "app"
        },
        {
          configurationName: "configure",
          moduleName: "api",
          modulePath: ["api", "routes"],
          prefix: "/api",
          kind: "scope"
        }
      ]
    });
  });

  it("retains Cargo workspace-crate Actix ServiceConfig mount facts without local module proof", () => {
    const facts = extractFileFacts({
      filePath: "apps/server/src/main.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{App, web};",
        "use api_routes::routes::configure as api_routes_config;",
        "",
        "fn bootstrap() {",
        "  let app = App::new()",
        "    .configure(api_routes_config)",
        "    .service(web::scope(\"/api\").configure(api_routes_config));",
        "}"
      ].join("\n")
    });

    expect(facts.rustActixServiceConfigFacts).toMatchObject({
      externalModules: [],
      importedMounts: [
        {
          configurationName: "configure",
          moduleName: "routes",
          modulePath: ["routes"],
          importRoot: "workspace",
          workspaceCrateName: "api_routes",
          prefix: "/",
          kind: "app"
        },
        {
          configurationName: "configure",
          moduleName: "routes",
          modulePath: ["routes"],
          importRoot: "workspace",
          workspaceCrateName: "api_routes",
          prefix: "/api",
          kind: "scope"
        }
      ]
    });
  });

  it("resolves Actix ServiceConfig handlers in the config callback lexical scope", () => {
    const facts = extractFileFacts({
      filePath: "src/actix-service-config-lexical-scope.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{App, web};",
        "",
        "async fn health() {}",
        "",
        "fn routes(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "}",
        "",
        "fn configure(health: u8) {",
        "  let app = App::new().configure(routes);",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "GET /health",
        "src/actix-service-config-lexical-scope.rs#health",
        "framework.actix-web.direct-app.configure.service-config.literal-path.local-function"
      ]
    ]);
  });

  it("keeps nested Actix ServiceConfig handlers outside an outer config shadow", () => {
    const facts = extractFileFacts({
      filePath: "src/nested-actix-service-config-lexical-scope.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{App, web};",
        "",
        "async fn health() {}",
        "",
        "fn inner(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/health\", web::get().to(health));",
        "}",
        "",
        "fn outer(cfg: &mut web::ServiceConfig) {",
        "  let health = fallback;",
        "  cfg.service(web::scope(\"/api\").configure(inner));",
        "}",
        "",
        "fn configure() {",
        "  let app = App::new().configure(outer);",
        "}"
      ].join("\n")
    });

    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "routes")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.qualifiedName,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      [
        "GET /api/health",
        "src/nested-actix-service-config-lexical-scope.rs#health",
        "framework.actix-web.direct-app.configure.service-config.literal-path.local-function"
      ]
    ]);
  });

  it("rejects unproven Actix ServiceConfig configure shapes", () => {
    const facts = extractFileFacts({
      filePath: "src/unproven-actix-service-config.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{App, web};",
        "",
        "async fn health() {}",
        "",
        "fn wrong_signature(cfg: web::ServiceConfig) {",
        "  cfg.route(\"/wrong-signature\", web::get().to(health));",
        "}",
        "",
        "fn dynamic_path(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(PATH, web::get().to(health));",
        "}",
        "",
        "fn valid(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/valid\", web::get().to(health));",
        "}",
        "",
        "fn shadowed(valid: u8) {",
        "  let app = App::new().configure(valid);",
        "}",
        "",
        "fn dynamic(callback: fn(&mut web::ServiceConfig)) {",
        "  let app = App::new().configure(callback);",
        "}",
        "",
        "fn wrapped() {",
        "  let app = build_app().configure(valid);",
        "}",
        "",
        "fn locally_shadowed(cfg: &mut web::ServiceConfig) {",
        "  let health = fallback;",
        "  cfg.route(\"/local-shadow\", web::get().to(health));",
        "}",
        "",
        "fn recursive_a(cfg: &mut web::ServiceConfig) {",
        "  cfg.route(\"/recursive\", web::get().to(health));",
        "  cfg.configure(recursive_b);",
        "}",
        "",
        "fn recursive_b(cfg: &mut web::ServiceConfig) {",
        "  cfg.configure(recursive_a);",
        "}",
        "",
        "fn invalid() {",
        "  let app = App::new().configure(wrong_signature);",
        "  let dynamic = App::new().configure(dynamic_path);",
        "  let local = App::new().configure(locally_shadowed);",
        "  let recursive = App::new().configure(recursive_a);",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("rejects unmounted, dynamic, shadowed, and wrapper Actix Web builder routes", () => {
    const facts = extractFileFacts({
      filePath: "src/unproven-actix-builder.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{App, web};",
        "",
        "async fn health() {}",
        "",
        "fn shadowed_app(App: u8) {",
        "  let app = App::new().route(\"/shadowed-app\", web::get().to(health));",
        "}",
        "",
        "fn shadowed_web(web: u8) {",
        "  let app = App::new().route(\"/shadowed-web\", web::get().to(health));",
        "}",
        "",
        "fn shadowed_scope_web(web: u8) {",
        "  let app = App::new().service(web::scope(\"/shadowed-scope\").route(\"/health\", web::get().to(health)));",
        "}",
        "",
        "fn dynamic_path() {",
        "  let path = \"/dynamic\";",
        "  let app = App::new().route(path, web::get().to(health));",
        "}",
        "",
        "fn unmounted_resource() {",
        "  let resource = web::resource(\"/unmounted\").route(web::get().to(health));",
        "}",
        "",
        "fn unmounted_scope() {",
        "  let scope = web::scope(\"/unmounted\").route(\"/health\", web::get().to(health));",
        "}",
        "",
        "fn dynamic_scope() {",
        "  let prefix = \"/api\";",
        "  let app = App::new().service(web::scope(prefix).route(\"/health\", web::get().to(health)));",
        "}",
        "",
        "fn trailing_scope() {",
        "  let app = App::new().service(web::scope(\"/api/\").route(\"/health\", web::get().to(health)));",
        "}",
        "",
        "fn wrapped_app() {",
        "  let app = build_app().route(\"/wrapped\", web::get().to(health));",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("rejects unimported, ambiguous, nonliteral, and nonfunction Rust attribute routes", () => {
    const facts = extractFileFacts({
      filePath: "src/unproven-attribute-routes.rs",
      language: "rust",
      sourceText: [
        "use actix_web::{get, post};",
        "use rocket::get;",
        "use actix_web::web::get as nested_get;",
        "",
        "#[get(\"/ambiguous\")]",
        "fn ambiguous() {}",
        "",
        "#[post(PATH)]",
        "fn dynamic_path() {}",
        "",
        "#[delete(\"/unimported\")]",
        "fn unimported() {}",
        "",
        "#[nested_get(\"/nested-import\")]",
        "fn nested_import() {}",
        "",
        "#[get(\"/not-a-function\")]",
        "struct NotAFunction;"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("rejects dynamic, shadowed, inline, composed, wrapper, and rebounded Rust Axum route shapes", () => {
    const facts = extractFileFacts({
      filePath: "src/unproven.rs",
      language: "rust",
      sourceText: [
        "use axum::{Router, routing::{get, post}};",
        "",
        "async fn health() {}",
        "async fn stable() {}",
        "",
        "fn shadowed(Router: u8) {",
        "  let app = Router::new().route(\"/shadowed-router\", get(health));",
        "}",
        "",
        "fn parameter_shadow((get, _): (u8, u8)) {",
        "  let app = Router::new().route(\"/shadowed-parameter\", get(health));",
        "}",
        "",
        "fn main() {",
        "  let dynamic = \"/dynamic\";",
        "  let app = Router::new().route(dynamic, get(health));",
        "  let get = post;",
        "  let shadowed = Router::new().route(\"/shadowed-method\", get(health));",
        "  let (post, _) = (get, ());",
        "  let tuple_shadow = Router::new().route(\"/tuple-shadow\", post(stable));",
        "  let inline = Router::new().route(\"/inline\", get(|| async {}));",
        "  let composed = Router::new().route(\"/composed\", get(health).post(stable));",
        "  let wrapped = build_router().route(\"/wrapped\", post(stable));",
        "  let rebound = Router::new().route(\"/escaped\\\\path\", post(stable));",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("requires direct Rust Axum import evidence before accepting a route-builder chain", () => {
    const facts = extractFileFacts({
      filePath: "src/no-import.rs",
      language: "rust",
      sourceText: [
        "async fn health() {}",
        "",
        "fn app() {",
        "  let app = Router::new().route(\"/health\", get(health));",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("fails closed for Rust syntax errors instead of emitting partial declarations or routes", () => {
    const facts = extractFileFacts({
      filePath: "src/broken.rs",
      language: "rust",
      sourceText: [
        "use axum::{Router, routing::get};",
        "async fn health() {}",
        "fn app( {",
        "  let app = Router::new().route(\"/health\", get(health));",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "function")).toEqual([]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("fails closed for Go syntax errors instead of emitting partial declarations or routes", () => {
    const facts = extractFileFacts({
      filePath: "cmd/server/broken.go",
      language: "go",
      sourceText: [
        "package main",
        'import "github.com/gin-gonic/gin"',
        "func health(c *gin.Context) {}",
        "func main( {",
        "  router := gin.Default()",
        "  router.GET(\"/health\", health)",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "function")).toEqual([]);
    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("rejects dynamic, unmounted, rebound, and late-included Python APIRouter routes", () => {
    const facts = extractFileFacts({
      filePath: "app/unproven-router.py",
      language: "python",
      sourceText: [
        "from fastapi import APIRouter, FastAPI",
        "app = FastAPI()",
        "",
        "unmounted = APIRouter()",
        "@unmounted.get(\"/unmounted\")",
        "async def unmounted_handler():",
        "    return {}",
        "",
        "dynamic_router = APIRouter(prefix=base_path)",
        "@dynamic_router.get(\"/dynamic-router\")",
        "async def dynamic_router_handler():",
        "    return {}",
        "app.include_router(dynamic_router)",
        "",
        "dynamic_include = APIRouter()",
        "@dynamic_include.get(\"/dynamic-include\")",
        "async def dynamic_include_handler():",
        "    return {}",
        "app.include_router(dynamic_include, prefix=api_prefix)",
        "",
        "late = APIRouter()",
        "app.include_router(late)",
        "@late.get(\"/late\")",
        "async def late_handler():",
        "    return {}",
        "",
        "rebound = APIRouter()",
        "@rebound.get(\"/rebound\")",
        "async def rebound_handler():",
        "    return {}",
        "if enabled:",
        "    rebound = APIRouter()",
        "app.include_router(rebound)",
        "",
        "from fastapi import FastAPI as ambiguous, Depends as ambiguous",
        "app_like = ambiguous()",
        "@app_like.get(\"/ambiguous-import\")",
        "async def ambiguous_import_handler():",
        "    return {}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("rejects dynamic and unproven Python FastAPI route shapes", () => {
    const facts = extractFileFacts({
      filePath: "app/unproven.py",
      language: "python",
      sourceText: [
        "from fastapi import FastAPI",
        "path = \"/dynamic\"",
        "app = build_application(FastAPI)",
        "@app.get(\"/not-proven\")",
        "async def not_proven():",
        "    return {}",
        "",
        "other = FastAPI()",
        "@other.get(path)",
        "async def dynamic_path():",
        "    return {}",
        "",
        "rebound = FastAPI()",
        "rebound = build_application()",
        "@rebound.get(\"/rebound\")",
        "async def rebound_handler():",
        "    return {}",
        "",
        "conditional = FastAPI()",
        "if enabled:",
        "    conditional = build_application()",
        "@conditional.get(\"/conditional\")",
        "async def conditional_handler():",
        "    return {}"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
  });

  it("fails closed for Python syntax errors instead of emitting partial declarations or routes", () => {
    const facts = extractFileFacts({
      filePath: "app/broken.py",
      language: "python",
      sourceText: [
        "from fastapi import FastAPI",
        "app = FastAPI()",
        "@app.get(\"/broken\")",
        "async def broken(:"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "broken.py"]
    ]);
    expect(facts.edges).toEqual([]);
  });

  it("extracts direct Vue SFC script declarations and an auditable default component export", () => {
    const facts = extractFileFacts({
      filePath: "src/views/HomeView.vue",
      language: "vue",
      sourceText: [
        "<!-- <script>const fake = true;</script> -->",
        "<template><main /></template>",
        '<script lang="ts">',
        'import { defineComponent } from "vue";',
        "const HomeView = defineComponent({});",
        'export function formatTitle() { return "home"; }',
        "export default HomeView;",
        "</script>"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "HomeView.vue"],
      ["variable", "HomeView"],
      ["function", "formatTitle"]
    ]);
    expect(facts.exportBindings).toEqual([
      expect.objectContaining({ localName: "HomeView", exportedName: "default" })
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "contains")).toHaveLength(2);
  });

  it("extracts literal Vue option-object default exports but rejects ambiguous SFC script proof", () => {
    const optionComponent = extractFileFacts({
      filePath: "src/views/SettingsView.vue",
      language: "vue",
      sourceText: [
        "<template><main /></template>",
        "<script>",
        'export default { name: "SettingsView" };',
        "</script>"
      ].join("\n")
    });
    const aliasedComponent = extractFileFacts({
      filePath: "src/views/AliasedView.vue",
      language: "vue",
      sourceText: [
        '<script lang="ts">',
        'import { defineComponent as define } from "vue";',
        "const AliasedView = define({});",
        "export default AliasedView;",
        "</script>"
      ].join("\n")
    });
    const multipleScripts = extractFileFacts({
      filePath: "src/views/Multiple.vue",
      language: "vue",
      sourceText: [
        "<script>const first = true;</script>",
        "<script setup>const second = true;</script>"
      ].join("\n")
    });

    expect(optionComponent.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "SettingsView.vue"],
      ["variable", "default"]
    ]);
    expect(optionComponent.exportBindings).toEqual([
      expect.objectContaining({ localName: "default", exportedName: "default" })
    ]);
    expect(aliasedComponent.exportBindings).toEqual([]);
    expect(multipleScripts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Multiple.vue"]
    ]);
  });

  it("extracts direct Vue Router literal routes and leaves unsupported forms absent", () => {
    const facts = extractFileFacts({
      filePath: "src/router.ts",
      language: "typescript",
      sourceText: [
        'import { createRouter, createWebHistory } from "vue-router";',
        'import HomeView from "./views/HomeView";',
        'import SettingsView from "./views/SettingsView";',
        "",
        'const dynamicPath = "/dynamic";',
        "const routes = [",
        '  { path: "/", component: HomeView },',
        '  { path: "/settings", component: SettingsView, children: [{ path: "child" }] },',
        "  { path: dynamicPath, component: HomeView },",
        '  { path: "/lazy", component: () => import("./views/LazyView") }',
        "];",
        "",
        "export const router = createRouter({",
        "  history: createWebHistory(),",
        "  routes",
        "});"
      ].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)).toEqual([
      "NAVIGATE /",
      "NAVIGATE /settings"
    ]);
    expect(
      facts.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => [reference.referenceName, reference.routeFramework])
    ).toEqual([
      ["HomeView", "vue-router"],
      ["SettingsView", "vue-router"]
    ]);

    const alias = extractFileFacts({
      filePath: "src/alias-router.ts",
      language: "typescript",
      sourceText: [
        'import { createRouter as routerFactory } from "vue-router";',
        "const routes = [{ path: \"/alias\", component: AliasView }];",
        "const router = routerFactory({ routes });"
      ].join("\n")
    });
    expect(alias.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
  });

  it("extracts audited Svelte SFC declarations and static SvelteKit page navigation", () => {
    const facts = extractFileFacts({
      filePath: "src/routes/catalog/+page.svelte",
      language: "svelte",
      sourceText: [
        "<!-- <script>const fake = true;</script> -->",
        '<script context="module" lang="ts">',
        "export const prerender = true;",
        "</script>",
        '<script lang="ts">',
        "export let title: string;",
        'function greeting() { return "catalog"; }',
        "</script>",
        "<main>{title}</main>"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "+page.svelte"],
      ["variable", "default"],
      ["variable", "title"],
      ["function", "greeting"],
      ["route", "NAVIGATE /catalog"]
    ]);
    expect(facts.exportBindings).toEqual([
      expect.objectContaining({ localName: "default", exportedName: "default" })
    ]);
    expect(facts.pendingReferences).toEqual([
      expect.objectContaining({
        referenceName: "default",
        relationKind: "routes",
        routeFramework: "sveltekit",
        routeRegistration: "sveltekit-filesystem-page"
      })
    ]);
    expect(facts.referenceScopes).toEqual([
      expect.objectContaining({ scopeIds: ["svelte:file"] })
    ]);
  });

  it("retains only a file for unsupported Svelte scripts and omits dynamic SvelteKit paths", () => {
    const unsupportedScripts = extractFileFacts({
      filePath: "src/routes/+page.svelte",
      language: "svelte",
      sourceText: [
        '<script lang="coffee">answer = 42</script>',
        "<main />"
      ].join("\n")
    });
    const duplicateInstances = extractFileFacts({
      filePath: "src/routes/+page.svelte",
      language: "svelte",
      sourceText: [
        "<script>const one = 1;</script>",
        "<script>const two = 2;</script>"
      ].join("\n")
    });
    const dynamicPath = extractFileFacts({
      filePath: "src/routes/blog/[slug]/+page.svelte",
      language: "svelte",
      sourceText: "<main />"
    });

    expect(unsupportedScripts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "+page.svelte"]
    ]);
    expect(duplicateInstances.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "+page.svelte"]
    ]);
    expect(dynamicPath.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "+page.svelte"],
      ["variable", "default"]
    ]);
    expect(dynamicPath.pendingReferences).toEqual([]);
  });

  it("extracts Astro frontmatter declarations and static Astro page navigation", () => {
    const facts = extractFileFacts({
      filePath: "src/pages/catalog/index.astro",
      language: "astro",
      sourceText: [
        "---",
        'export const title = "Catalog";',
        'export function greeting(): string { return title; }',
        "interface Props { title: string; }",
        "---",
        "<main>{title}</main>"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "index.astro"],
      ["variable", "default"],
      ["variable", "title"],
      ["function", "greeting"],
      ["interface", "Props"],
      ["route", "NAVIGATE /catalog"]
    ]);
    expect(facts.exportBindings).toEqual([
      expect.objectContaining({ localName: "default", exportedName: "default" })
    ]);
    expect(facts.pendingReferences).toEqual([
      expect.objectContaining({
        referenceName: "default",
        relationKind: "routes",
        routeFramework: "astro",
        routeRegistration: "astro-filesystem-page"
      })
    ]);
    expect(facts.referenceScopes).toEqual([
      expect.objectContaining({ scopeIds: ["astro:file"] })
    ]);
  });

  it("fails closed for malformed Astro frontmatter and omits dynamic or private Astro pages", () => {
    const malformedFrontmatter = extractFileFacts({
      filePath: "src/pages/index.astro",
      language: "astro",
      sourceText: [
        "---",
        "const title = 1;"
      ].join("\n")
    });
    const dynamicPage = extractFileFacts({
      filePath: "src/pages/blog/[slug].astro",
      language: "astro",
      sourceText: "<main>Dynamic</main>"
    });
    const privatePage = extractFileFacts({
      filePath: "src/pages/_draft.astro",
      language: "astro",
      sourceText: "<main>Draft</main>"
    });

    expect(malformedFrontmatter.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "index.astro"]
    ]);
    expect(dynamicPage.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "[slug].astro"],
      ["variable", "default"]
    ]);
    expect(dynamicPage.pendingReferences).toEqual([]);
    expect(privatePage.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "_draft.astro"],
      ["variable", "default"]
    ]);
    expect(privatePage.pendingReferences).toEqual([]);
  });

  it("extracts literal Razor page directives as exact local Blazor navigation", () => {
    const facts = extractFileFacts({
      filePath: "Components/Catalog.razor",
      language: "razor",
      sourceText: [
        '@page "/catalog"',
        '@page "/catalog/{id:int}"',
        "",
        "<h1>Catalog</h1>"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Catalog.razor"],
      ["variable", "default"],
      ["route", "NAVIGATE /catalog"],
      ["route", "NAVIGATE /catalog/{id:int}"]
    ]);
    expect(facts.exportBindings).toEqual([
      expect.objectContaining({ localName: "default", exportedName: "default" })
    ]);
    expect(facts.pendingReferences).toEqual([
      expect.objectContaining({
        referenceName: "default",
        relationKind: "routes",
        routeFramework: "blazor",
        routeRegistration: "blazor-page-directive"
      }),
      expect.objectContaining({
        referenceName: "default",
        relationKind: "routes",
        routeFramework: "blazor",
        routeRegistration: "blazor-page-directive"
      })
    ]);
    expect(facts.referenceScopes).toEqual([
      expect.objectContaining({ scopeIds: ["razor:file"] }),
      expect.objectContaining({ scopeIds: ["razor:file"] })
    ]);
  });

  it("omits commented, computed, and non-route Razor directives", () => {
    const facts = extractFileFacts({
      filePath: "Components/Catalog.razor",
      language: "razor",
      sourceText: [
        "@*",
        '@page "/commented"',
        "*@",
        "@page RoutePaths.Catalog",
        '@page "/catalog?draft=1"',
        '@attribute [Route("/attribute")]'
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Catalog.razor"],
      ["variable", "default"]
    ]);
    expect(facts.pendingReferences).toEqual([]);
  });

  it("extracts complete ArkTS ArkUI component structs and direct UI roots", () => {
    const facts = extractFileFacts({
      filePath: "entry/src/main/ets/pages/Home.ets",
      language: "arkts",
      sourceText: [
        "@Entry",
        "@Component",
        "struct Home {",
        "  build() {",
        "    Column() {}",
        "  }",
        "}",
        "",
        "@Component",
        "export struct Detail {",
        "  build() {}",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Home.ets"],
      ["class", "Home"],
      ["entrypoint", "ui root Home"],
      ["class", "Detail"]
    ]);
    expect(facts.localBindings).toEqual([
      expect.objectContaining({ name: "Home", scopeId: "arkts:file" }),
      expect.objectContaining({ name: "Detail", scopeId: "arkts:file" })
    ]);
    expect(facts.exportBindings).toEqual([
      expect.objectContaining({ localName: "Detail", exportedName: "Detail" })
    ]);
    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "handles")
        .map((edge) => [
          symbolsById.get(edge.sourceId)?.name,
          symbolsById.get(edge.targetId ?? "")?.name,
          edge.resolution,
          edge.evidence?.ruleId
        ])
    ).toEqual([
      ["ui root Home", "Home", "exact", "framework.arkui.entry-component.local-struct"]
    ]);
  });

  it("rejects non-direct, commented, and malformed ArkTS ArkUI component shapes", () => {
    const facts = extractFileFacts({
      filePath: "entry/src/main/ets/pages/Invalid.ets",
      language: "arkts",
      sourceText: [
        "// @Entry @Component struct Commented {}",
        'const display = "@Entry @Component struct StringValue {}";',
        "const pattern = /@Entry @Component struct RegexValue {}/;",
        "@Component class NotAStruct {}",
        "@Entry struct MissingComponent {}",
        "@Component struct Incomplete {"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Invalid.ets"]
    ]);
    expect(facts.edges).toEqual([]);
    expect(facts.localBindings).toEqual([]);
    expect(facts.exportBindings).toEqual([]);
  });

  it("extracts complete top-level Terraform and OpenTofu declaration blocks", () => {
    const facts = extractFileFacts({
      filePath: "infra/main.tf",
      language: "terraform",
      sourceText: [
        'resource "aws_instance" "web" {',
        '  ami = "ami-123"',
        "}",
        "",
        'data "aws_ami" "base" {}',
        'module "network" {',
        '  source = "./modules/network"',
        "}",
        'variable "region" {}',
        'output "endpoint" {',
        "  value = aws_instance.web.public_dns",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name, symbol.isExported])).toEqual([
      ["file", "main.tf", true],
      ["resource", "resource aws_instance.web", false],
      ["resource", "data aws_ami.base", false],
      ["module", "module network", false],
      ["variable", "variable region", false],
      ["variable", "output endpoint", true]
    ]);
    expect(facts.localBindings.map((binding) => [binding.name, binding.scopeId])).toEqual([
      ["aws_instance.web", "terraform:file"],
      ["data.aws_ami.base", "terraform:file"],
      ["module.network", "terraform:file"],
      ["var.region", "terraform:file"],
      ["output.endpoint", "terraform:file"]
    ]);
    expect(facts.exportBindings).toEqual([
      expect.objectContaining({ localName: "output.endpoint", exportedName: "endpoint" })
    ]);
    expect(
      facts.edges
        .filter((edge) => edge.kind === "contains")
        .map((edge) => [edge.referenceName, edge.resolution, edge.evidence?.ruleId])
    ).toEqual([
      ["resource aws_instance.web", "exact", "framework.terraform.resource.block"],
      ["data aws_ami.base", "exact", "framework.terraform.data.block"],
      ["module network", "exact", "framework.terraform.module.block"],
      ["variable region", "exact", "framework.terraform.variable.block"],
      ["output endpoint", "exact", "framework.terraform.output.block"]
    ]);
  });

  it("rejects dynamic, nested, commented, heredoc, and malformed Terraform block shapes", () => {
    const facts = extractFileFacts({
      filePath: "infra/invalid.tofu",
      language: "terraform",
      sourceText: [
        '# resource "aws_instance" "commented" {}',
        'message = "resource \\"aws_instance\\" \\"string\\" {}"',
        'resource var.type "dynamic" {}',
        "locals {",
        '  resource "aws_instance" "nested" {}',
        "}",
        'resource "aws_instance" "heredoc" {',
        "  user_data = <<-SCRIPT",
        'resource "aws_instance" "not_real" {}',
        "SCRIPT",
        "}",
        'resource "aws_instance" "incomplete" {'
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "invalid.tofu"]
    ]);
    expect(facts.edges).toEqual([]);
    expect(facts.localBindings).toEqual([]);
    expect(facts.exportBindings).toEqual([]);
  });

  it("extracts direct literal Shopify Liquid snippet and section references", () => {
    const facts = extractFileFacts({
      filePath: "templates/product.liquid",
      language: "liquid",
      sourceText: [
        "{% render 'product-card', product: product %}",
        '{%- include "legacy-card" -%}',
        "{% section 'announcement-bar' %}",
        "{% render 'price/card' %}"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "product.liquid"]
    ]);
    expect(facts.edges).toEqual([]);
    expect(facts.liquidFacts?.templateReferences).toEqual([
      expect.objectContaining({
        kind: "render",
        targetFilePath: "snippets/product-card.liquid",
        referenceName: "render snippets/product-card.liquid",
        range: expect.objectContaining({ start: { line: 1, column: 0 } })
      }),
      expect.objectContaining({
        kind: "include",
        targetFilePath: "snippets/legacy-card.liquid",
        referenceName: "include snippets/legacy-card.liquid",
        range: expect.objectContaining({ start: { line: 2, column: 0 } })
      }),
      expect.objectContaining({
        kind: "section",
        targetFilePath: "sections/announcement-bar.liquid",
        referenceName: "section sections/announcement-bar.liquid",
        range: expect.objectContaining({ start: { line: 3, column: 0 } })
      }),
      expect.objectContaining({
        kind: "render",
        targetFilePath: "snippets/price/card.liquid",
        referenceName: "render snippets/price/card.liquid",
        range: expect.objectContaining({ start: { line: 4, column: 0 } })
      })
    ]);
  });

  it("rejects commented, raw, dynamic, unsafe, and malformed Shopify Liquid tag shapes", () => {
    const facts = extractFileFacts({
      filePath: "templates/invalid.liquid",
      language: "liquid",
      sourceText: [
        "{% comment %}",
        "{% render 'commented' %}",
        "{% endcomment %}",
        "{% raw %}{% section 'raw' %}{% endraw %}",
        "<!-- {% include 'html-comment' %} -->",
        "{% render dynamic_name %}",
        "{% render '../escape' %}",
        "{% render 'incomplete' "
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "invalid.liquid"]
    ]);
    expect(facts.edges).toEqual([]);
    expect(facts.liquidFacts?.templateReferences).toEqual([]);
  });

  it("extracts direct literal Twig template inheritance, inclusion, and macro references", () => {
    const facts = extractFileFacts({
      filePath: "templates/pages/home.html.twig",
      language: "twig",
      sourceText: [
        '{% extends "base.html.twig" %}',
        '{% include "partials/card.html.twig" only %}',
        '{% embed "components/dialog.html.twig" %}',
        '{% import "macros/forms.html.twig" as forms %}',
        '{% from "macros/fields.html.twig" import input as form_input, textarea %}'
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "home.html.twig"]
    ]);
    expect(facts.edges).toEqual([]);
    expect(facts.twigFacts?.templateReferences).toEqual([
      expect.objectContaining({
        kind: "extends",
        targetFilePath: "templates/base.html.twig",
        referenceName: "extends templates/base.html.twig",
        range: expect.objectContaining({ start: { line: 1, column: 0 } })
      }),
      expect.objectContaining({
        kind: "include",
        targetFilePath: "templates/partials/card.html.twig",
        referenceName: "include templates/partials/card.html.twig",
        range: expect.objectContaining({ start: { line: 2, column: 0 } })
      }),
      expect.objectContaining({
        kind: "embed",
        targetFilePath: "templates/components/dialog.html.twig",
        referenceName: "embed templates/components/dialog.html.twig",
        range: expect.objectContaining({ start: { line: 3, column: 0 } })
      }),
      expect.objectContaining({
        kind: "import",
        targetFilePath: "templates/macros/forms.html.twig",
        referenceName: "import templates/macros/forms.html.twig",
        range: expect.objectContaining({ start: { line: 4, column: 0 } })
      }),
      expect.objectContaining({
        kind: "from",
        targetFilePath: "templates/macros/fields.html.twig",
        referenceName: "from templates/macros/fields.html.twig",
        range: expect.objectContaining({ start: { line: 5, column: 0 } })
      })
    ]);
  });

  it("rejects commented, verbatim, dynamic, unsupported-tail, unsafe, and malformed Twig tags", () => {
    const facts = extractFileFacts({
      filePath: "templates/pages/invalid.html.twig",
      language: "twig",
      sourceText: [
        "{# {% extends 'commented.html.twig' %} #}",
        "{% verbatim %}{% include 'verbatim.html.twig' %}{% endverbatim %}",
        "<!-- {% embed 'html-comment.html.twig' %} -->",
        "{% include template_name %}",
        "{% include 'partials/card.html.twig' ~ suffix %}",
        "{% import 'macros/forms.html.twig' %}",
        "{% include '../escape.html.twig' %}",
        "{% extends 'incomplete.html.twig' "
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "invalid.html.twig"]
    ]);
    expect(facts.edges).toEqual([]);
    expect(facts.twigFacts?.templateReferences).toEqual([]);
  });

  it("extracts direct literal Laravel Blade layout and view relationships", () => {
    const facts = extractFileFacts({
      filePath: "resources/views/pages/home.blade.php",
      language: "blade",
      sourceText: [
        "@extends('layouts.app')",
        "@include('partials.card', ['product' => $product])",
        "@component('components.alert')",
        "@each('partials.row', $rows, 'row')"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "home.blade.php"]
    ]);
    expect(facts.edges).toEqual([]);
    expect(facts.bladeFacts?.templateReferences).toEqual([
      expect.objectContaining({
        kind: "extends",
        targetFilePath: "resources/views/layouts/app.blade.php",
        referenceName: "extends resources/views/layouts/app.blade.php",
        range: expect.objectContaining({ start: { line: 1, column: 0 } })
      }),
      expect.objectContaining({
        kind: "include",
        targetFilePath: "resources/views/partials/card.blade.php",
        referenceName: "include resources/views/partials/card.blade.php",
        range: expect.objectContaining({ start: { line: 2, column: 0 } })
      }),
      expect.objectContaining({
        kind: "component",
        targetFilePath: "resources/views/components/alert.blade.php",
        referenceName: "component resources/views/components/alert.blade.php",
        range: expect.objectContaining({ start: { line: 3, column: 0 } })
      }),
      expect.objectContaining({
        kind: "each",
        targetFilePath: "resources/views/partials/row.blade.php",
        referenceName: "each resources/views/partials/row.blade.php",
        range: expect.objectContaining({ start: { line: 4, column: 0 } })
      })
    ]);
  });

  it("rejects commented, literal-block, dynamic, unsafe, escaped, and malformed Blade directives", () => {
    const facts = extractFileFacts({
      filePath: "resources/views/pages/invalid.blade.php",
      language: "blade",
      sourceText: [
        "{{-- @include('commented.card') --}}",
        "@verbatim @extends('ignored.layout') @endverbatim",
        "<!-- @component('ignored.component') -->",
        "@php $fake = \"@include('ignored.php')\"; @endphp",
        "<?php $fake = \"@include('ignored.raw-php')\"; ?>",
        "@@include('escaped.card')",
        "@include($dynamic)",
        "@include('partials.card' . $suffix)",
        "@each('partials.row', $rows)",
        "@include('../escape')",
        "@extends('layouts.app'"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "invalid.blade.php"]
    ]);
    expect(facts.edges).toEqual([]);
    expect(facts.bladeFacts?.templateReferences).toEqual([]);
  });

  it("extracts complete Solidity containers, direct callable members, and simple inheritance facts", () => {
    const facts = extractFileFacts({
      filePath: "contracts/Token.sol",
      language: "solidity",
      sourceText: [
        "pragma solidity ^0.8.24;",
        "interface IAsset {",
        "  function balanceOf(address account) external view returns (uint256);",
        "}",
        "contract Base {",
        "  function owner() public view returns (address) { return address(this); }",
        "  modifier onlyOwner() { _; }",
        "}",
        "contract Token is Base, IAsset {",
        "  constructor() {}",
        "  function balanceOf(address account) external view returns (uint256) { return 0; }",
        "  fallback() external payable {}",
        "  receive() external payable {}",
        "}",
        "library Math { function add(uint a, uint b) internal pure returns (uint) { return a + b; } }"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Token.sol"],
      ["interface", "IAsset"],
      ["method", "balanceOf"],
      ["class", "Base"],
      ["method", "owner"],
      ["method", "onlyOwner"],
      ["class", "Token"],
      ["method", "constructor"],
      ["method", "balanceOf"],
      ["method", "fallback"],
      ["method", "receive"],
      ["class", "Math"],
      ["method", "add"]
    ]);
    expect(facts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "contains",
          sourceId: expect.stringContaining("contract%3AToken"),
          referenceName: "balanceOf",
          evidence: expect.objectContaining({
            ruleId: "language.solidity.function.direct-member",
            stage: "syntax"
          })
        }),
        expect.objectContaining({
          kind: "contains",
          referenceName: "onlyOwner",
          evidence: expect.objectContaining({
            ruleId: "language.solidity.modifier.direct-member",
            stage: "syntax"
          })
        })
      ])
    );
    expect(facts.solidityFacts?.inheritanceReferences).toEqual([
      expect.objectContaining({
        baseName: "Base",
        range: expect.objectContaining({ start: { line: 9, column: 18 } })
      }),
      expect.objectContaining({
        baseName: "IAsset",
        range: expect.objectContaining({ start: { line: 9, column: 24 } })
      })
    ]);
  });

  it("rejects Solidity declarations inside comments or strings and fails closed on malformed source", () => {
    const dynamicFacts = extractFileFacts({
      filePath: "contracts/Dynamic.sol",
      language: "solidity",
      sourceText: [
        "// contract Commented {}",
        'string constant marker = "interface Fake {}";',
        "contract Dynamic is Base(owner) {",
        "  function live() external {}",
        "}"
      ].join("\n")
    });
    const malformedFacts = extractFileFacts({
      filePath: "contracts/Broken.sol",
      language: "solidity",
      sourceText: "contract Broken { function missing() external {"
    });

    expect(dynamicFacts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Dynamic.sol"],
      ["class", "Dynamic"],
      ["method", "live"]
    ]);
    expect(dynamicFacts.solidityFacts?.inheritanceReferences).toEqual([]);
    expect(malformedFacts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Broken.sol"]
    ]);
    expect(malformedFacts.edges).toEqual([]);
  });

  it("extracts complete CFML, CFScript, tag-based, and implicit CFC declarations", () => {
    const scriptFacts = extractFileFacts({
      filePath: "services/OrderService.cfc",
      language: "cfml",
      sourceText: [
        "component {",
        "  public string function format(required string orderId) {",
        "    return orderId;",
        "  }",
        "  private void function audit() {}",
        "}"
      ].join("\n")
    });
    const interfaceFacts = extractFileFacts({
      filePath: "contracts/IClock.cfs",
      language: "cfml",
      sourceText: [
        "interface {",
        "  public string function now();",
        "}"
      ].join("\n")
    });
    const tagFacts = extractFileFacts({
      filePath: "legacy/Inventory.cfc",
      language: "cfml",
      sourceText: [
        "<cfcomponent>",
        "  <cffunction name=\"load\" access=\"public\">",
        "  </cffunction>",
        "</cfcomponent>"
      ].join("\n")
    });
    const implicitFacts = extractFileFacts({
      filePath: "legacy/Legacy.cfc",
      language: "cfml",
      sourceText: [
        "public string function slugify(required string value) {",
        "  return value;",
        "}"
      ].join("\n")
    });
    const bareFacts = extractFileFacts({
      filePath: "scripts/helpers.cfs",
      language: "cfml",
      sourceText: "function clean() { return true; }\n"
    });

    expect(scriptFacts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "OrderService.cfc"],
      ["class", "OrderService"],
      ["method", "format"],
      ["method", "audit"]
    ]);
    expect(scriptFacts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "contains",
          referenceName: "OrderService",
          evidence: expect.objectContaining({
            ruleId: "language.cfml.component.braced",
            stage: "syntax"
          })
        }),
        expect.objectContaining({
          kind: "contains",
          referenceName: "format",
          evidence: expect.objectContaining({
            ruleId: "language.cfml.function.direct-member",
            stage: "syntax"
          })
        })
      ])
    );
    expect(interfaceFacts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "IClock.cfs"],
      ["interface", "IClock"],
      ["method", "now"]
    ]);
    expect(tagFacts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Inventory.cfc"],
      ["class", "Inventory"],
      ["method", "load"]
    ]);
    expect(tagFacts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceName: "load",
          evidence: expect.objectContaining({
            ruleId: "language.cfml.cffunction.tag",
            stage: "syntax"
          })
        })
      ])
    );
    expect(implicitFacts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Legacy.cfc"],
      ["class", "Legacy"],
      ["method", "slugify"]
    ]);
    expect(bareFacts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "helpers.cfs"],
      ["function", "clean"]
    ]);
  });

  it("rejects commented, quoted, malformed, and incomplete CFML declarations", () => {
    const facts = extractFileFacts({
      filePath: "services/Safe.cfc",
      language: "cfml",
      sourceText: [
        "<!--- <cfcomponent><cffunction name=\"hidden\"></cffunction></cfcomponent> --->",
        "var marker = '<cffunction name=\"fake\"></cffunction>';",
        "component {",
        "  public function live() {}",
        "}"
      ].join("\n")
    });
    const malformedScript = extractFileFacts({
      filePath: "services/Broken.cfc",
      language: "cfml",
      sourceText: "component {\n  public function missing()\n"
    });
    const malformedTag = extractFileFacts({
      filePath: "services/BrokenTag.cfc",
      language: "cfml",
      sourceText: "<cfcomponent><cffunction name=\"missing\"></cfcomponent>"
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Safe.cfc"],
      ["class", "Safe"],
      ["method", "live"]
    ]);
    expect(malformedScript.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Broken.cfc"]
    ]);
    expect(malformedScript.edges).toEqual([]);
    expect(malformedTag.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "BrokenTag.cfc"]
    ]);
    expect(malformedTag.edges).toEqual([]);
  });

  it("extracts Nix returned-attrset bindings, let bindings, inherit names, and literal imports", () => {
    const facts = extractFileFacts({
      filePath: "nix/default.nix",
      language: "nix",
      sourceText: [
        "{ lib, ... }:",
        "let",
        "  helper = value: value;",
        "  internal = import ./internal.nix;",
        "in rec {",
        "  package = { name = \"symbol-lattice\"; };",
        "  build = args: import ./build.nix;",
        "  nested.value = { };",
        "  inherit lib;",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name, symbol.isExported])).toEqual([
      ["file", "default.nix", true],
      ["variable", "package", true],
      ["function", "build", true],
      ["variable", "nested.value", true],
      ["variable", "lib", true],
      ["function", "helper", false],
      ["variable", "internal", false]
    ]);
    expect(facts.exportBindings.map((binding) => binding.exportedName)).toEqual([
      "package",
      "build",
      "nested.value",
      "lib"
    ]);
    expect(facts.pendingReferences.map((reference) => [reference.relationKind, reference.referenceName])).toEqual([
      ["imports", "./internal.nix"],
      ["imports", "./build.nix"]
    ]);
    expect(facts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceName: "build",
          evidence: expect.objectContaining({
            ruleId: "language.nix.returned-attrset.binding",
            stage: "syntax"
          })
        }),
        expect.objectContaining({
          referenceName: "helper",
          evidence: expect.objectContaining({
            ruleId: "language.nix.let.binding",
            stage: "syntax"
          })
        }),
        expect.objectContaining({
          referenceName: "lib",
          evidence: expect.objectContaining({
            ruleId: "language.nix.returned-attrset.inherit",
            stage: "syntax"
          })
        })
      ])
    );
  });

  it("rejects malformed Nix and ignores declaration-looking comments and strings", () => {
    const safe = extractFileFacts({
      filePath: "nix/safe.nix",
      language: "nix",
      sourceText: [
        "/* fake = value: value; */",
        "{",
        "  # hidden = value: value;",
        "  marker = \"fake = value: value;\";",
        "  live = value: value;",
        "}"
      ].join("\n")
    });
    const malformed = extractFileFacts({
      filePath: "nix/broken.nix",
      language: "nix",
      sourceText: "{ live = value: value;"
    });

    expect(safe.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "safe.nix"],
      ["variable", "marker"],
      ["function", "live"]
    ]);
    expect(malformed.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "broken.nix"]
    ]);
    expect(malformed.edges).toEqual([]);
  });

  it("extracts complete VB.NET namespaces, containers, callable members, and Imports", () => {
    const facts = extractFileFacts({
      filePath: "vb/Worker.vb",
      language: "vbnet",
      sourceText: [
        "Imports System.Text",
        "Namespace Acme.Tools",
        "  Public Class Worker",
        "    Public Function Format(value As String) As String",
        "      Return value",
        "    End Function",
        "    Private Sub Audit()",
        "    End Sub",
        "  End Class",
        "  Public Interface IClock",
        "    Function Now() As String",
        "  End Interface",
        "  Public Module Program",
        "    Public Sub Main()",
        "    End Sub",
        "  End Module",
        "  Public Structure Point",
        "  End Structure",
        "  Public Enum Mode",
        "  End Enum",
        "End Namespace"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Worker.vb"],
      ["module", "Acme.Tools"],
      ["class", "Worker"],
      ["method", "Format"],
      ["method", "Audit"],
      ["interface", "IClock"],
      ["method", "Now"],
      ["module", "Program"],
      ["method", "Main"],
      ["type", "Point"],
      ["type", "Mode"]
    ]);
    expect(facts.pendingReferences.map((reference) => [reference.relationKind, reference.referenceName])).toEqual([
      ["imports", "System.Text"]
    ]);
    expect(facts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceName: "Worker",
          evidence: expect.objectContaining({
            ruleId: "language.vbnet.class.complete-block",
            stage: "syntax"
          })
        }),
        expect.objectContaining({
          referenceName: "Format",
          evidence: expect.objectContaining({
            ruleId: "language.vbnet.method.complete-block",
            stage: "syntax"
          })
        }),
        expect.objectContaining({
          referenceName: "Now",
          evidence: expect.objectContaining({
            ruleId: "language.vbnet.method.bodyless-signature",
            stage: "syntax"
          })
        })
      ])
    );
  });

  it("rejects malformed VB.NET and ignores declaration-looking comments and strings", () => {
    const safe = extractFileFacts({
      filePath: "vb/Safe.vb",
      language: "vbnet",
      sourceText: [
        "' Public Class Hidden",
        "Rem Public Class AlsoHidden",
        "Dim marker = \"Public Class Quoted\"",
        "Public Class Live",
        "End Class"
      ].join("\n")
    });
    const malformed = extractFileFacts({
      filePath: "vb/Broken.vb",
      language: "vbnet",
      sourceText: "Public Class Broken\n"
    });

    expect(safe.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Safe.vb"],
      ["class", "Live"]
    ]);
    expect(malformed.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "Broken.vb"]
    ]);
    expect(malformed.edges).toEqual([]);
  });

  it("extracts direct Zig top-level containers and functions with source evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/main.zig",
      language: "zig",
      sourceText: [
        "const std = @import(\"std\");",
        "",
        "pub const Point = struct {",
        "    x: f32,",
        "    y: f32,",
        "",
        "    pub fn init(x: f32, y: f32) Point {",
        "        return .{ .x = x, .y = y };",
        "    }",
        "};",
        "",
        "const Choice = enum(u8) { first, second };",
        "pub const Flags = packed struct { ready: bool };",
        "const Result = union(enum) { ok: u8, failed: void };",
        "",
        "pub extern \"c\" fn puts(message: [*:0]const u8) c_int;",
        "pub fn main() void {",
        "    std.debug.print(\"ready\\n\", .{});",
        "}",
        "fn helper() void {}",
        "export fn c_entry() callconv(.c) void {}"
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName, symbol.isExported])
    ).toEqual([
      ["file", "src/main.zig", true],
      ["class", "src/main.zig.Point", true],
      ["class", "src/main.zig.Choice", false],
      ["class", "src/main.zig.Flags", true],
      ["class", "src/main.zig.Result", false],
      ["function", "src/main.zig.puts", true],
      ["function", "src/main.zig.main", true],
      ["function", "src/main.zig.helper", false],
      ["function", "src/main.zig.c_entry", true]
    ]);
    expect(
      facts.edges.map((edge) => [
        edge.kind,
        edge.referenceName,
        edge.evidence?.ruleId,
        edge.resolution
      ])
    ).toEqual([
      ["contains", "Point", "syntax.zig.top-level-container", "exact"],
      ["contains", "Choice", "syntax.zig.top-level-container", "exact"],
      ["contains", "Flags", "syntax.zig.top-level-container", "exact"],
      ["contains", "Result", "syntax.zig.top-level-container", "exact"],
      ["contains", "puts", "syntax.zig.top-level-function", "exact"],
      ["contains", "main", "syntax.zig.top-level-function", "exact"],
      ["contains", "helper", "syntax.zig.top-level-function", "exact"],
      ["contains", "c_entry", "syntax.zig.top-level-function", "exact"]
    ]);
  });

  it("rejects malformed Zig and ignores nested, computed, commented, and quoted declarations", () => {
    const safe = extractFileFacts({
      filePath: "src/safe.zig",
      language: "zig",
      sourceText: [
        "// pub fn commented() void {}",
        "const quoted = \"pub fn quoted() void {}\";",
        "const multiline =",
        "    \\\\pub fn multiline() void {}",
        ";",
        "const Container = struct {",
        "    pub fn nested() void {}",
        "};",
        "const Computed = comptime blk: { break :blk struct {}; };",
        "pub fn real() void {}",
        "test \"nested scope\" {",
        "    fn test_local() void {}",
        "}"
      ].join("\n")
    });
    const malformed = extractFileFacts({
      filePath: "src/broken.zig",
      language: "zig",
      sourceText: "pub fn broken() void {\n"
    });
    const unterminatedString = extractFileFacts({
      filePath: "src/string.zig",
      language: "zig",
      sourceText: "const value = \"unterminated\n"
    });

    expect(safe.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "safe.zig"],
      ["class", "Container"],
      ["function", "real"]
    ]);
    expect(malformed.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "broken.zig"]
    ]);
    expect(unterminatedString.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "string.zig"]
    ]);
    expect(malformed.edges).toEqual([]);
    expect(unterminatedString.edges).toEqual([]);
  });

  it("extracts parser-proven YAML top-level scalar mapping keys with source evidence", () => {
    const facts = extractFileFacts({
      filePath: "config/application.yaml",
      language: "yaml",
      sourceText: [
        "# direct scalar settings",
        "---",
        "service: symbol-lattice",
        "port: 3000",
        'owner: "HsinPu"',
        "metadata:",
        "  team: graph",
        "tags:",
        "  - code-intelligence",
        "..."
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName, symbol.isExported])
    ).toEqual([
      ["file", "config/application.yaml", true],
      ["variable", "config/application.yaml#yaml-key:service", false],
      ["variable", "config/application.yaml#yaml-key:port", false],
      ["variable", "config/application.yaml#yaml-key:owner", false]
    ]);
    expect(
      facts.edges.map((edge) => [
        edge.kind,
        edge.referenceName,
        edge.evidence?.ruleId,
        edge.resolution
      ])
    ).toEqual([
      ["contains", "service", "syntax.yaml.top-level-scalar-mapping", "exact"],
      ["contains", "port", "syntax.yaml.top-level-scalar-mapping", "exact"],
      ["contains", "owner", "syntax.yaml.top-level-scalar-mapping", "exact"]
    ]);
  });

  it("extracts parser-proven Drupal routing YAML controller routes with explicit unresolved targets", () => {
    const facts = extractFileFacts({
      filePath: "modules/custom/example/example.routing.yml",
      language: "yaml",
      sourceText: [
        "example.catalog:",
        "  path: '/catalog'",
        "  defaults:",
        "    _controller: '\\Drupal\\example\\Controller\\CatalogController::index'",
        "  requirements:",
        "    _permission: 'access content'",
        "    _method: 'GET|POST'",
        "",
        "example.status:",
        "  path: /status",
        "  defaults:",
        "    _controller: '\\Drupal\\example\\Controller\\StatusController::show'"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName])).toEqual([
      ["file", "modules/custom/example/example.routing.yml"],
      ["route", "modules/custom/example/example.routing.yml#route:GET /catalog"],
      ["route", "modules/custom/example/example.routing.yml#route:POST /catalog"],
      ["route", "modules/custom/example/example.routing.yml#route:ALL /status"]
    ]);
    expect(
      facts.edges.map((edge) => [
        edge.kind,
        edge.referenceName,
        edge.resolution,
        edge.confidence,
        edge.evidence?.ruleId
      ])
    ).toEqual([
      [
        "contains",
        "GET /catalog",
        "exact",
        1,
        "framework.drupal.routing-yaml.literal-controller.route-node"
      ],
      [
        "routes",
        "\\Drupal\\example\\Controller\\CatalogController::index",
        "unresolved",
        0,
        "framework.drupal.routing-yaml.literal-controller.unresolved-controller-method"
      ],
      [
        "contains",
        "POST /catalog",
        "exact",
        1,
        "framework.drupal.routing-yaml.literal-controller.route-node"
      ],
      [
        "routes",
        "\\Drupal\\example\\Controller\\CatalogController::index",
        "unresolved",
        0,
        "framework.drupal.routing-yaml.literal-controller.unresolved-controller-method"
      ],
      [
        "contains",
        "ALL /status",
        "exact",
        1,
        "framework.drupal.routing-yaml.literal-controller.route-node"
      ],
      [
        "routes",
        "\\Drupal\\example\\Controller\\StatusController::show",
        "unresolved",
        0,
        "framework.drupal.routing-yaml.literal-controller.unresolved-controller-method"
      ]
    ]);
  });

  it("rejects unproven Drupal routing YAML controller, method, alias, and document forms", () => {
    const facts = extractFileFacts({
      filePath: "modules/custom/example/example.routing.yaml",
      language: "yaml",
      sourceText: [
        "example.service:",
        "  path: '/service'",
        "  defaults:",
        "    _controller: 'example.service:show'",
        "",
        "example.form:",
        "  path: '/form'",
        "  defaults:",
        "    _form: '\\Drupal\\example\\Form\\ExampleForm'",
        "",
        "example.dynamic-method:",
        "  path: '/method'",
        "  defaults:",
        "    _controller: '\\Drupal\\example\\Controller\\ExampleController::show'",
        "  requirements:",
        "    _method: 'GET|BREW'",
        "",
        "example.invalid-requirements:",
        "  path: '/requirements'",
        "  defaults:",
        "    _controller: '\\Drupal\\example\\Controller\\ExampleController::show'",
        "  requirements: public",
        "",
        "example.anchored-defaults:",
        "  path: '/defaults'",
        "  defaults: &defaults",
        "    _controller: '\\Drupal\\example\\Controller\\ExampleController::show'",
        "",
        "example.anchored:",
        "  path: &path '/anchored'",
        "  defaults:",
        "    _controller: '\\Drupal\\example\\Controller\\ExampleController::show'"
      ].join("\n")
    });
    const multipleDocuments = extractFileFacts({
      filePath: "modules/custom/example/example.routing.yml",
      language: "yaml",
      sourceText: [
        "example.first:",
        "  path: '/first'",
        "  defaults:",
        "    _controller: '\\Drupal\\example\\Controller\\ExampleController::first'",
        "---",
        "example.second:",
        "  path: '/second'",
        "  defaults:",
        "    _controller: '\\Drupal\\example\\Controller\\ExampleController::second'"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "example.routing.yaml"]
    ]);
    expect(facts.edges).toEqual([]);
    expect(multipleDocuments.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "example.routing.yml"]
    ]);
    expect(multipleDocuments.edges).toEqual([]);
  });

  it("rejects malformed or multi-document YAML and ignores nested, anchored, alias, and tagged mappings", () => {
    const malformed = extractFileFacts({
      filePath: "config/broken.yml",
      language: "yaml",
      sourceText: "service: [unterminated\n"
    });
    const multipleDocuments = extractFileFacts({
      filePath: "config/multiple.yaml",
      language: "yaml",
      sourceText: "first: one\n---\nsecond: two\n"
    });
    const unsupported = extractFileFacts({
      filePath: "config/unsupported.yaml",
      language: "yaml",
      sourceText: [
        "base: &base ready",
        "alias: *base",
        "tagged: !environment production",
        "metadata:",
        "  team: graph",
        "tags:",
        "  - code-intelligence"
      ].join("\n")
    });

    expect(malformed.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "broken.yml"]
    ]);
    expect(multipleDocuments.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "multiple.yaml"]
    ]);
    expect(unsupported.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "unsupported.yaml"]
    ]);
    expect(malformed.edges).toEqual([]);
    expect(multipleDocuments.edges).toEqual([]);
    expect(unsupported.edges).toEqual([]);
  });

  it("extracts complete direct Shell and Bash function declarations with source ranges", () => {
    const facts = extractFileFacts({
      filePath: "scripts/deploy.sh",
      language: "shell",
      sourceText: [
        "#!/usr/bin/env bash",
        "# comments and strings never create declarations",
        "deploy() {",
        "  printf '%s\\n' \"${APP_NAME}\" # function() { is ignored here",
        "}",
        "",
        "function cleanup {",
        "  rm -f \"$1\"",
        "}"
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [
        symbol.kind,
        symbol.qualifiedName,
        symbol.declarationOrdinal,
        symbol.range
      ])
    ).toEqual([
      [
        "file",
        "scripts/deploy.sh",
        0,
        { start: { line: 1, column: 1 }, end: { line: 9, column: 2 } }
      ],
      [
        "function",
        "scripts/deploy.sh#deploy",
        0,
        { start: { line: 3, column: 1 }, end: { line: 5, column: 2 } }
      ],
      [
        "function",
        "scripts/deploy.sh#cleanup",
        0,
        { start: { line: 7, column: 1 }, end: { line: 9, column: 2 } }
      ]
    ]);
    expect(
      facts.edges.map((edge) => [
        edge.kind,
        edge.referenceName,
        edge.evidence?.ruleId,
        edge.resolution,
        edge.range
      ])
    ).toEqual([
      [
        "contains",
        "deploy",
        "language.shell.function.direct-top-level",
        "exact",
        { start: { line: 3, column: 1 }, end: { line: 5, column: 2 } }
      ],
      [
        "contains",
        "cleanup",
        "language.shell.function.direct-top-level",
        "exact",
        { start: { line: 7, column: 1 }, end: { line: 9, column: 2 } }
      ]
    ]);
  });

  it("rejects nested, incomplete, quoted, and here-document Shell function shapes", () => {
    const nested = extractFileFacts({
      filePath: "scripts/nested.bash",
      language: "shell",
      sourceText: [
        "if enabled; then",
        "hidden() {",
        "}",
        "fi",
        "outer() {",
        "inner() {",
        "}",
        "}",
        "visible() {",
        "}"
      ].join("\n")
    });
    const incomplete = extractFileFacts({
      filePath: "scripts/incomplete.sh",
      language: "shell",
      sourceText: "deploy() {\n  printf 'open'\n"
    });
    const quoted = extractFileFacts({
      filePath: "scripts/quoted.sh",
      language: "shell",
      sourceText: 'printf "%s" "fake() { }"\n'
    });
    const hereDocument = extractFileFacts({
      filePath: "scripts/here-doc.sh",
      language: "shell",
      sourceText: "deploy() {\n  cat <<EOF\nvalue\nEOF\n}\n"
    });

    expect(nested.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "nested.bash"],
      ["function", "outer"],
      ["function", "visible"]
    ]);
    expect(incomplete.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "incomplete.sh"]
    ]);
    expect(quoted.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "quoted.sh"]
    ]);
    expect(hereDocument.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "here-doc.sh"]
    ]);
  });

  it("extracts complete direct SQL table and view declarations with source ranges", () => {
    const facts = extractFileFacts({
      filePath: "db/schema.sql",
      language: "sql",
      sourceText: [
        "-- CREATE TABLE ignored (id integer);",
        "CREATE TABLE IF NOT EXISTS public.users (",
        "  id integer PRIMARY KEY,",
        "  note text DEFAULT 'CREATE TABLE fake (id integer);'",
        ");",
        "",
        "CREATE UNLOGGED TABLE audit.events (",
        "  id integer,",
        "  metadata jsonb",
        ");",
        "",
        "CREATE OR REPLACE VIEW public.active_users AS",
        "SELECT id, note FROM public.users;"
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [
        symbol.kind,
        symbol.qualifiedName,
        symbol.declarationOrdinal,
        symbol.range
      ])
    ).toEqual([
      [
        "file",
        "db/schema.sql",
        0,
        { start: { line: 1, column: 1 }, end: { line: 13, column: 35 } }
      ],
      [
        "resource",
        "db/schema.sql#sql-table:public.users",
        0,
        { start: { line: 2, column: 1 }, end: { line: 5, column: 3 } }
      ],
      [
        "resource",
        "db/schema.sql#sql-table:audit.events",
        0,
        { start: { line: 7, column: 1 }, end: { line: 10, column: 3 } }
      ],
      [
        "resource",
        "db/schema.sql#sql-view:public.active_users",
        0,
        { start: { line: 12, column: 1 }, end: { line: 13, column: 35 } }
      ]
    ]);
    expect(
      facts.edges.map((edge) => [
        edge.kind,
        edge.referenceName,
        edge.evidence?.ruleId,
        edge.resolution,
        edge.range
      ])
    ).toEqual([
      [
        "contains",
        "public.users",
        "language.sql.create-table.direct-ddl",
        "exact",
        { start: { line: 2, column: 1 }, end: { line: 5, column: 3 } }
      ],
      [
        "contains",
        "audit.events",
        "language.sql.create-table.direct-ddl",
        "exact",
        { start: { line: 7, column: 1 }, end: { line: 10, column: 3 } }
      ],
      [
        "contains",
        "public.active_users",
        "language.sql.create-view.direct-ddl",
        "exact",
        { start: { line: 12, column: 1 }, end: { line: 13, column: 35 } }
      ]
    ]);
  });

  it("rejects unsupported, incomplete, quoted, and dollar-quoted SQL declaration shapes", () => {
    const quotedName = extractFileFacts({
      filePath: "db/quoted.sql",
      language: "sql",
      sourceText: 'CREATE TABLE "users" (id integer);\n'
    });
    const dynamicName = extractFileFacts({
      filePath: "db/dynamic.sql",
      language: "sql",
      sourceText: "CREATE TABLE ${table_name} (id integer);\n"
    });
    const incomplete = extractFileFacts({
      filePath: "db/incomplete.sql",
      language: "sql",
      sourceText: "CREATE TABLE pending (id integer\n"
    });
    const unsupportedView = extractFileFacts({
      filePath: "db/unsupported-view.sql",
      language: "sql",
      sourceText: "CREATE MATERIALIZED VIEW public.cached AS SELECT 1;\n"
    });
    const columnListView = extractFileFacts({
      filePath: "db/column-list.sql",
      language: "sql",
      sourceText: "CREATE VIEW public.catalog (id) AS SELECT id FROM public.items;\n"
    });
    const malformedView = extractFileFacts({
      filePath: "db/malformed-view.sql",
      language: "sql",
      sourceText: "CREATE VIEW public.catalog AS SELECT (id FROM public.items;\n"
    });
    const dollarQuotedRoutine = extractFileFacts({
      filePath: "db/routine.sql",
      language: "sql",
      sourceText: [
        "CREATE FUNCTION public.seed() RETURNS void AS $$",
        "  CREATE TABLE public.hidden (id integer);",
        "$$ LANGUAGE sql;"
      ].join("\n")
    });

    for (const facts of [
      quotedName,
      dynamicName,
      incomplete,
      unsupportedView,
      columnListView,
      malformedView,
      dollarQuotedRoutine
    ]) {
      expect(facts.symbols).toHaveLength(1);
      expect(facts.symbols[0]?.kind).toBe("file");
      expect(facts.edges).toEqual([]);
    }
  });

  it("extracts complete direct GraphQL schema definitions with source ranges", () => {
    const facts = extractFileFacts({
      filePath: "api/schema.graphql",
      language: "graphql",
      sourceText: [
        "# comments and strings never create schema declarations",
        '\"\"\"A described object.\"\"\"',
        'type User implements Node @key(fields: "id") {',
        "  id: ID!",
        "  profile: Profile",
        "}",
        "interface Node { id: ID! }",
        "input CreateUserInput { name: String! }",
        "enum Role { ADMIN MEMBER }",
        'scalar DateTime @specifiedBy(url: "https://example.test/date-time")',
        "union SearchResult = User | Profile",
        "query RuntimeOperation { user { id } }"
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName, symbol.declarationOrdinal])
    ).toEqual([
      ["file", "api/schema.graphql", 0],
      ["class", "api/schema.graphql#type:User", 0],
      ["interface", "api/schema.graphql#interface:Node", 0],
      ["type", "api/schema.graphql#input:CreateUserInput", 0],
      ["type", "api/schema.graphql#enum:Role", 0],
      ["type", "api/schema.graphql#scalar:DateTime", 0],
      ["type", "api/schema.graphql#union:SearchResult", 0]
    ]);
    expect(facts.symbols.find((symbol) => symbol.name === "User")?.range).toEqual({
      start: { line: 3, column: 1 },
      end: { line: 6, column: 2 }
    });
    expect(facts.symbols.find((symbol) => symbol.name === "DateTime")?.range).toEqual({
      start: { line: 10, column: 1 },
      end: { line: 10, column: 16 }
    });
    expect(facts.symbols.find((symbol) => symbol.name === "SearchResult")?.range).toEqual({
      start: { line: 11, column: 1 },
      end: { line: 11, column: 36 }
    });
    expect(
      facts.edges.map((edge) => [edge.referenceName, edge.evidence?.ruleId, edge.resolution])
    ).toEqual([
      ["User", "language.graphql.type.direct-definition", "exact"],
      ["Node", "language.graphql.interface.direct-definition", "exact"],
      ["CreateUserInput", "language.graphql.input.direct-definition", "exact"],
      ["Role", "language.graphql.enum.direct-definition", "exact"],
      ["DateTime", "language.graphql.scalar.direct-definition", "exact"],
      ["SearchResult", "language.graphql.union.direct-definition", "exact"]
    ]);
  });

  it("rejects incomplete, extended, and operation-only GraphQL source", () => {
    const incomplete = extractFileFacts({
      filePath: "api/incomplete.graphql",
      language: "graphql",
      sourceText: "type User { id: ID!\n"
    });
    const unclosedDescription = extractFileFacts({
      filePath: "api/unclosed.graphql",
      language: "graphql",
      sourceText: '\"\"\"description\ntype User { id: ID! }\n'
    });
    const extension = extractFileFacts({
      filePath: "api/extension.graphql",
      language: "graphql",
      sourceText: [
        "extend type User { id: ID! }",
        "type Profile { id: ID! }"
      ].join("\n")
    });
    const operationOnly = extractFileFacts({
      filePath: "api/query.gql",
      language: "graphql",
      sourceText: "query Search { user { id } }\n"
    });

    for (const facts of [incomplete, unclosedDescription, extension, operationOnly]) {
      expect(facts.symbols).toHaveLength(1);
      expect(facts.symbols[0]?.kind).toBe("file");
      expect(facts.edges).toEqual([]);
    }
  });

  it("extracts direct Protocol Buffers declarations and semicolon RPC members", () => {
    const facts = extractFileFacts({
      filePath: "api/directory.proto",
      language: "proto",
      sourceText: [
        'syntax = "proto3";',
        "package example.directory;",
        "// comments and literals never create declarations",
        "message User {",
        "  string id = 1;",
        "  message Nested { string hidden = 1; }",
        "}",
        "enum UserStatus {",
        "  USER_STATUS_UNSPECIFIED = 0;",
        "  USER_STATUS_ACTIVE = 1;",
        "}",
        "service Directory {",
        "  rpc GetUser(GetUserRequest) returns (GetUserResponse);",
        "  rpc WatchUsers(stream .example.WatchUsersRequest) returns (stream User);",
        "}"
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName, symbol.declarationOrdinal])
    ).toEqual([
      ["file", "api/directory.proto", 0],
      ["class", "api/directory.proto#message:User", 0],
      ["type", "api/directory.proto#enum:UserStatus", 0],
      ["interface", "api/directory.proto#service:Directory", 0],
      ["method", "api/directory.proto#service:Directory::GetUser", 0],
      ["method", "api/directory.proto#service:Directory::WatchUsers", 0]
    ]);
    expect(facts.symbols.find((symbol) => symbol.name === "User")?.range).toEqual({
      start: { line: 4, column: 1 },
      end: { line: 7, column: 2 }
    });
    expect(facts.symbols.find((symbol) => symbol.name === "Directory")?.range).toEqual({
      start: { line: 12, column: 1 },
      end: { line: 15, column: 2 }
    });
    expect(facts.symbols.some((symbol) => symbol.name === "Nested")).toBe(false);
    expect(
      facts.edges.map((edge) => [edge.referenceName, edge.evidence?.ruleId, edge.resolution])
    ).toEqual([
      ["User", "language.proto.message.direct-definition", "exact"],
      ["UserStatus", "language.proto.enum.direct-definition", "exact"],
      ["Directory", "language.proto.service.direct-definition", "exact"],
      ["GetUser", "language.proto.rpc.direct-service-member", "exact"],
      ["WatchUsers", "language.proto.rpc.direct-service-member", "exact"]
    ]);
  });

  it("keeps only the file and complete direct service boundary for unsupported Protocol Buffers source", () => {
    const unbalanced = extractFileFacts({
      filePath: "api/unbalanced.proto",
      language: "proto",
      sourceText: "message User { string id = 1;"
    });
    const unclosedComment = extractFileFacts({
      filePath: "api/unclosed-comment.proto",
      language: "proto",
      sourceText: "/* message User {}"
    });
    const rpcBlock = extractFileFacts({
      filePath: "api/rpc-block.proto",
      language: "proto",
      sourceText: [
        "service Directory {",
        "  rpc Find(FindRequest) returns (FindResponse) {",
        "    option deprecated = true;",
        "  }",
        "}"
      ].join("\n")
    });

    for (const facts of [unbalanced, unclosedComment]) {
      expect(facts.symbols).toHaveLength(1);
      expect(facts.symbols[0]?.kind).toBe("file");
      expect(facts.edges).toEqual([]);
    }
    expect(
      rpcBlock.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName])
    ).toEqual([
      ["file", "api/rpc-block.proto"],
      ["interface", "api/rpc-block.proto#service:Directory"]
    ]);
    expect(rpcBlock.symbols.some((symbol) => symbol.kind === "method")).toBe(false);
  });

  it("extracts complete direct Groovy declarations with source ranges", () => {
    const facts = extractFileFacts({
      filePath: "src/catalog.groovy",
      language: "groovy",
      sourceText: [
        "#!/usr/bin/env groovy",
        "// class CommentOnly {}",
        "class Catalog {",
        "  class Nested { }",
        "}",
        "interface Searchable { }",
        "trait Auditable {",
        '  String audit() { "ok" }',
        "}",
        "enum State { READY, DONE }",
        "def greet(String name) {",
        '  return """class Quoted {}"""',
        "}",
        "def make = { class Hidden {} }"
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName, symbol.declarationOrdinal])
    ).toEqual([
      ["file", "src/catalog.groovy", 0],
      ["class", "src/catalog.groovy#class:Catalog", 0],
      ["interface", "src/catalog.groovy#interface:Searchable", 0],
      ["interface", "src/catalog.groovy#trait:Auditable", 0],
      ["type", "src/catalog.groovy#enum:State", 0],
      ["function", "src/catalog.groovy#function:greet", 0]
    ]);
    expect(facts.symbols.find((symbol) => symbol.name === "Catalog")?.range).toEqual({
      start: { line: 3, column: 1 },
      end: { line: 5, column: 2 }
    });
    expect(facts.symbols.find((symbol) => symbol.name === "greet")?.range).toEqual({
      start: { line: 11, column: 1 },
      end: { line: 13, column: 2 }
    });
    expect(facts.symbols.some((symbol) => symbol.name === "Nested")).toBe(false);
    expect(facts.symbols.some((symbol) => symbol.name === "Hidden")).toBe(false);
    expect(
      facts.edges.map((edge) => [edge.referenceName, edge.evidence?.ruleId, edge.resolution])
    ).toEqual([
      ["Catalog", "language.groovy.class.direct-top-level", "exact"],
      ["Searchable", "language.groovy.interface.direct-top-level", "exact"],
      ["Auditable", "language.groovy.trait.direct-top-level", "exact"],
      ["State", "language.groovy.enum.direct-top-level", "exact"],
      ["greet", "language.groovy.function.direct-top-level", "exact"]
    ]);
  });

  it("rejects malformed and slashy Groovy script-scope input", () => {
    const unbalanced = extractFileFacts({
      filePath: "src/unbalanced.groovy",
      language: "groovy",
      sourceText: "class Broken {\n"
    });
    const unclosedComment = extractFileFacts({
      filePath: "src/unclosed-comment.groovy",
      language: "groovy",
      sourceText: "/* class Broken {}"
    });
    const slashy = extractFileFacts({
      filePath: "src/slashy.groovy",
      language: "groovy",
      sourceText: ["def pattern = /class Hidden {}/", "class Visible {}"].join("\n")
    });
    const scriptDivision = extractFileFacts({
      filePath: "src/division.groovy",
      language: "groovy",
      sourceText: ["def ratio = 6 / 3", "class Visible {}"].join("\n")
    });

    for (const facts of [unbalanced, unclosedComment, slashy, scriptDivision]) {
      expect(facts.symbols).toHaveLength(1);
      expect(facts.symbols[0]?.kind).toBe("file");
      expect(facts.edges).toEqual([]);
    }
  });

  it("extracts complete direct Fortran program units with source ranges", () => {
    const facts = extractFileFacts({
      filePath: "src/numeric.f90",
      language: "fortran",
      sourceText: [
        "! module CommentOnly",
        "module NumericOps",
        "  implicit none",
        "contains",
        "  subroutine hidden()",
        "  end subroutine hidden",
        "end module NumericOps",
        "program Solver",
        '  print *, "end program fake"',
        "end program Solver",
        "subroutine solve(x)",
        "end subroutine solve",
        "real function energy(x)",
        "  energy = x",
        "end function energy",
        "abstract interface",
        "  subroutine callback()",
        "  end subroutine callback",
        "end interface",
        "subroutine visible()",
        "end subroutine visible"
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName, symbol.declarationOrdinal])
    ).toEqual([
      ["file", "src/numeric.f90", 0],
      ["module", "src/numeric.f90#module:NumericOps", 0],
      ["module", "src/numeric.f90#program:Solver", 0],
      ["function", "src/numeric.f90#subroutine:solve", 0],
      ["function", "src/numeric.f90#function:energy", 0],
      ["function", "src/numeric.f90#subroutine:visible", 0]
    ]);
    expect(facts.symbols.find((symbol) => symbol.name === "NumericOps")?.range).toEqual({
      start: { line: 2, column: 1 },
      end: { line: 7, column: 22 }
    });
    expect(facts.symbols.find((symbol) => symbol.name === "Solver")?.range).toEqual({
      start: { line: 8, column: 1 },
      end: { line: 10, column: 19 }
    });
    expect(facts.symbols.some((symbol) => symbol.name === "hidden")).toBe(false);
    expect(facts.symbols.some((symbol) => symbol.name === "callback")).toBe(false);
    expect(
      facts.edges.map((edge) => [edge.referenceName, edge.evidence?.ruleId, edge.resolution])
    ).toEqual([
      ["NumericOps", "language.fortran.module.direct-program-unit", "exact"],
      ["Solver", "language.fortran.program.direct-program-unit", "exact"],
      ["solve", "language.fortran.subroutine.direct-program-unit", "exact"],
      ["energy", "language.fortran.function.direct-program-unit", "exact"],
      ["visible", "language.fortran.subroutine.direct-program-unit", "exact"]
    ]);

    const fixedForm = extractFileFacts({
      filePath: "src/fixed.for",
      language: "fortran",
      sourceText: [
        "c     program CommentOnly",
        "      program FixedMain",
        "      end program FixedMain"
      ].join("\n")
    });
    expect(fixedForm.symbols.find((symbol) => symbol.name === "FixedMain")?.range).toEqual({
      start: { line: 2, column: 7 },
      end: { line: 3, column: 28 }
    });
  });

  it("rejects incomplete, generic-end, and continued Fortran input", () => {
    const unbalanced = extractFileFacts({
      filePath: "src/unbalanced.f90",
      language: "fortran",
      sourceText: "module Broken\n"
    });
    const genericEnd = extractFileFacts({
      filePath: "src/generic-end.f90",
      language: "fortran",
      sourceText: ["program Broken", "end"].join("\n")
    });
    const freeContinuation = extractFileFacts({
      filePath: "src/free-continuation.f90",
      language: "fortran",
      sourceText: ["subroutine split(&", "  value)", "end subroutine split"].join("\n")
    });
    const fixedContinuation = extractFileFacts({
      filePath: "src/fixed-continuation.for",
      language: "fortran",
      sourceText: [
        "      subroutine split(",
        "     & value)",
        "      end subroutine split"
      ].join("\n")
    });
    const moduleProcedure = extractFileFacts({
      filePath: "src/module-procedure.f90",
      language: "fortran",
      sourceText: [
        "module subroutine unsupported()",
        "end subroutine unsupported"
      ].join("\n")
    });
    const fixedSequenceField = extractFileFacts({
      filePath: "src/sequence-field.for",
      language: "fortran",
      sourceText: [
        "      " + " ".repeat(66) + "program OutOfField",
        "      " + " ".repeat(66) + "end program OutOfField"
      ].join("\n")
    });

    for (const facts of [
      unbalanced,
      genericEnd,
      freeContinuation,
      fixedContinuation,
      moduleProcedure,
      fixedSequenceField
    ]) {
      expect(facts.symbols).toHaveLength(1);
      expect(facts.symbols[0]?.kind).toBe("file");
      expect(facts.edges).toEqual([]);
    }
  });

  it("extracts complete direct Ada library units with source ranges", () => {
    const facts = extractFileFacts({
      filePath: "src/directory.adb",
      language: "ada",
      sourceText: [
        "-- package Commented is",
        "package Directory is",
        "  procedure Hidden;",
        "end Directory;",
        "package body Directory is",
        "  procedure Hidden is",
        "  begin",
        '    Ada.Text_IO.Put_Line("end Directory;");',
        "  end Hidden;",
        "end Directory;",
        "procedure Main is",
        "begin",
        "  null;",
        "end Main;",
        "function Sum (Left, Right : Integer) return Integer is",
        "begin",
        "  return Left + Right;",
        "end Sum;",
        "procedure Declared (Value : Integer);",
        "function Named return Boolean;",
        "package Parent.Child is",
        "end Parent.Child;"
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName, symbol.declarationOrdinal])
    ).toEqual([
      ["file", "src/directory.adb", 0],
      ["module", "src/directory.adb#package:Directory", 0],
      ["module", "src/directory.adb#package-body:Directory", 0],
      ["function", "src/directory.adb#procedure:Main", 0],
      ["function", "src/directory.adb#function:Sum", 0],
      ["function", "src/directory.adb#procedure:Declared", 0],
      ["function", "src/directory.adb#function:Named", 0],
      ["module", "src/directory.adb#package:Parent.Child", 0]
    ]);
    expect(facts.symbols.find((symbol) => symbol.qualifiedName.endsWith("package:Directory"))?.range).toEqual({
      start: { line: 2, column: 1 },
      end: { line: 4, column: 15 }
    });
    expect(
      facts.symbols.find((symbol) => symbol.qualifiedName.endsWith("package-body:Directory"))?.range
    ).toEqual({
      start: { line: 5, column: 1 },
      end: { line: 10, column: 15 }
    });
    expect(facts.symbols.find((symbol) => symbol.name === "Main")?.range).toEqual({
      start: { line: 11, column: 1 },
      end: { line: 14, column: 10 }
    });
    expect(facts.symbols.some((symbol) => symbol.name === "Hidden")).toBe(false);
    expect(
      facts.edges.map((edge) => [edge.referenceName, edge.evidence?.ruleId, edge.resolution])
    ).toEqual([
      ["Directory", "language.ada.package.direct-library-unit", "exact"],
      ["Directory", "language.ada.package-body.direct-library-unit", "exact"],
      ["Main", "language.ada.procedure.direct-library-unit", "exact"],
      ["Sum", "language.ada.function.direct-library-unit", "exact"],
      ["Declared", "language.ada.procedure.direct-library-unit", "exact"],
      ["Named", "language.ada.function.direct-library-unit", "exact"],
      ["Parent.Child", "language.ada.package.direct-library-unit", "exact"]
    ]);
  });

  it("rejects incomplete or unsupported Ada library-unit forms", () => {
    const unbalanced = extractFileFacts({
      filePath: "src/unbalanced.ads",
      language: "ada",
      sourceText: "package Broken is\n"
    });
    const genericEnd = extractFileFacts({
      filePath: "src/generic-end.adb",
      language: "ada",
      sourceText: ["procedure Broken is", "end;"].join("\n")
    });
    const wrongEnd = extractFileFacts({
      filePath: "src/wrong-end.adb",
      language: "ada",
      sourceText: ["function Broken return Boolean is", "end Other;"].join("\n")
    });
    const multilineProfile = extractFileFacts({
      filePath: "src/multiline.adb",
      language: "ada",
      sourceText: [
        "procedure Split (",
        "  Value : Integer",
        ") is",
        "begin",
        "  null;",
        "end Split;"
      ].join("\n")
    });
    const aspectClause = extractFileFacts({
      filePath: "src/aspect.adb",
      language: "ada",
      sourceText: [
        "procedure Checked with Pre => Ready is",
        "begin",
        "  null;",
        "end Checked;"
      ].join("\n")
    });
    const unclosedString = extractFileFacts({
      filePath: "src/unclosed-string.adb",
      language: "ada",
      sourceText: [
        "procedure Safe is",
        '  Text : String := "unterminated',
        "end Safe;"
      ].join("\n")
    });

    for (const facts of [
      unbalanced,
      genericEnd,
      wrongEnd,
      multilineProfile,
      aspectClause,
      unclosedString
    ]) {
      expect(facts.symbols).toHaveLength(1);
      expect(facts.symbols[0]?.kind).toBe("file");
      expect(facts.edges).toEqual([]);
    }
  });

  it("extracts source-proven Java properties keys without retaining configuration values", () => {
    const facts = extractFileFacts({
      filePath: "config/application.properties",
      language: "properties",
      sourceText: [
        "# comments never become declarations",
        "spring.datasource.password=database-secret",
        "server.port: 8080",
        "feature.enabled true",
        "empty.value",
        "escaped\\=key=ignored-value",
        "unicode.\\u006bey=ignored-value",
        "banner.text=first\\",
        "  second physical value line",
        "server.port=9090"
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [
        symbol.kind,
        symbol.qualifiedName,
        symbol.declarationOrdinal,
        symbol.range
      ])
    ).toEqual([
      [
        "file",
        "config/application.properties",
        0,
        { start: { line: 1, column: 1 }, end: { line: 10, column: 17 } }
      ],
      [
        "variable",
        "config/application.properties#properties-key:spring.datasource.password",
        0,
        { start: { line: 2, column: 1 }, end: { line: 2, column: 27 } }
      ],
      [
        "variable",
        "config/application.properties#properties-key:server.port",
        0,
        { start: { line: 3, column: 1 }, end: { line: 3, column: 12 } }
      ],
      [
        "variable",
        "config/application.properties#properties-key:feature.enabled",
        0,
        { start: { line: 4, column: 1 }, end: { line: 4, column: 16 } }
      ],
      [
        "variable",
        "config/application.properties#properties-key:empty.value",
        0,
        { start: { line: 5, column: 1 }, end: { line: 5, column: 12 } }
      ],
      [
        "variable",
        "config/application.properties#properties-key:escaped=key",
        0,
        { start: { line: 6, column: 1 }, end: { line: 6, column: 13 } }
      ],
      [
        "variable",
        "config/application.properties#properties-key:unicode.key",
        0,
        { start: { line: 7, column: 1 }, end: { line: 7, column: 17 } }
      ],
      [
        "variable",
        "config/application.properties#properties-key:banner.text",
        0,
        { start: { line: 8, column: 1 }, end: { line: 8, column: 12 } }
      ],
      [
        "variable",
        "config/application.properties#properties-key:server.port",
        1,
        { start: { line: 10, column: 1 }, end: { line: 10, column: 12 } }
      ]
    ]);
    expect(
      facts.edges.map((edge) => [
        edge.kind,
        edge.referenceName,
        edge.evidence?.ruleId,
        edge.resolution,
        edge.range
      ])
    ).toEqual([
      [
        "contains",
        "spring.datasource.password",
        "syntax.properties.literal-key",
        "exact",
        { start: { line: 2, column: 1 }, end: { line: 2, column: 27 } }
      ],
      [
        "contains",
        "server.port",
        "syntax.properties.literal-key",
        "exact",
        { start: { line: 3, column: 1 }, end: { line: 3, column: 12 } }
      ],
      [
        "contains",
        "feature.enabled",
        "syntax.properties.literal-key",
        "exact",
        { start: { line: 4, column: 1 }, end: { line: 4, column: 16 } }
      ],
      [
        "contains",
        "empty.value",
        "syntax.properties.literal-key",
        "exact",
        { start: { line: 5, column: 1 }, end: { line: 5, column: 12 } }
      ],
      [
        "contains",
        "escaped=key",
        "syntax.properties.literal-key",
        "exact",
        { start: { line: 6, column: 1 }, end: { line: 6, column: 13 } }
      ],
      [
        "contains",
        "unicode.key",
        "syntax.properties.literal-key",
        "exact",
        { start: { line: 7, column: 1 }, end: { line: 7, column: 17 } }
      ],
      [
        "contains",
        "banner.text",
        "syntax.properties.literal-key",
        "exact",
        { start: { line: 8, column: 1 }, end: { line: 8, column: 12 } }
      ],
      [
        "contains",
        "server.port",
        "syntax.properties.literal-key",
        "exact",
        { start: { line: 10, column: 1 }, end: { line: 10, column: 12 } }
      ]
    ]);
    expect(JSON.stringify(facts)).not.toContain("database-secret");
    expect(facts.symbols.some((symbol) => symbol.name === "second")).toBe(false);
  });

  it("ignores malformed, continued, and dangling Java properties keys", () => {
    const facts = extractFileFacts({
      filePath: "config/invalid.properties",
      language: "properties",
      sourceText: [
        "bad\\u12=value",
        "continued\\",
        "key=value",
        "valid.key=value",
        "dangling=value\\"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "invalid.properties"],
      ["variable", "valid.key"]
    ]);
    expect(facts.edges).toMatchObject([
      {
        kind: "contains",
        referenceName: "valid.key",
        evidence: { ruleId: "syntax.properties.literal-key", stage: "syntax" }
      }
    ]);
  });

  it("extracts parser-proven XML root and direct-child resources with containment evidence", () => {
    const facts = extractFileFacts({
      filePath: "config/catalog.xml",
      language: "xml",
      sourceText: [
        '<?xml version="1.0"?>',
        "<catalog>",
        '  <item id="first"/>',
        "  <section>",
        "    <entry>hidden</entry>",
        "  </section>",
        "</catalog>"
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName, symbol.isExported])
    ).toEqual([
      ["file", "config/catalog.xml", true],
      ["resource", "config/catalog.xml#xml-element:catalog[0]", true],
      ["resource", "config/catalog.xml#xml-element:catalog[0]/item[0]", false],
      ["resource", "config/catalog.xml#xml-element:catalog[0]/section[0]", false]
    ]);
    expect(
      facts.edges.map((edge) => [
        edge.kind,
        edge.referenceName,
        edge.evidence?.ruleId,
        edge.range
      ])
    ).toEqual([
      [
        "contains",
        "catalog",
        "syntax.xml.root-element",
        { start: { line: 2, column: 1 }, end: { line: 7, column: 11 } }
      ],
      [
        "contains",
        "item",
        "syntax.xml.direct-child-element",
        { start: { line: 3, column: 3 }, end: { line: 3, column: 21 } }
      ],
      [
        "contains",
        "section",
        "syntax.xml.direct-child-element",
        { start: { line: 4, column: 3 }, end: { line: 6, column: 13 } }
      ]
    ]);
    expect(facts.symbols.some((symbol) => symbol.name === "entry")).toBe(false);
  });

  it("assigns stable ordinals to repeated direct XML child element names", () => {
    const facts = extractFileFacts({
      filePath: "config/repeated.xml",
      language: "xml",
      sourceText: "<catalog><item/><item/></catalog>"
    });

    expect(facts.symbols.map((symbol) => symbol.qualifiedName)).toEqual([
      "config/repeated.xml",
      "config/repeated.xml#xml-element:catalog[0]",
      "config/repeated.xml#xml-element:catalog[0]/item[0]",
      "config/repeated.xml#xml-element:catalog[0]/item[1]"
    ]);
  });

  it("extracts bounded MyBatis mapper statements and same-file SQL includes", () => {
    const facts = extractFileFacts({
      filePath: "src/main/resources/UserMapper.xml",
      language: "xml",
      sourceText: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"',
        '  "http://mybatis.org/dtd/mybatis-3-mapper.dtd">',
        '<mapper namespace="com.example.UserMapper">',
        '  <sql id="baseColumns">id, email</sql>',
        '  <select id="findById">',
        '    SELECT <include refid="baseColumns"/> FROM users',
        "  </select>",
        '  <insert id="insertUser">INSERT INTO users</insert>',
        "</mapper>"
      ].join("\n")
    });

    expect(
      facts.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName, symbol.isExported])
    ).toEqual([
      ["file", "src/main/resources/UserMapper.xml", true],
      ["method", "com.example.UserMapper::baseColumns", false],
      ["method", "com.example.UserMapper::findById", false],
      ["method", "com.example.UserMapper::insertUser", false]
    ]);
    expect(facts.symbols.some((symbol) => symbol.kind === "resource")).toBe(false);
    expect(
      facts.edges.map((edge) => [
        edge.kind,
        edge.referenceName,
        edge.resolution,
        edge.confidence,
        edge.evidence?.ruleId
      ])
    ).toEqual([
      [
        "contains",
        "baseColumns",
        "exact",
        1,
        "framework.mybatis.mapper.literal-direct-statement"
      ],
      [
        "contains",
        "findById",
        "exact",
        1,
        "framework.mybatis.mapper.literal-direct-statement"
      ],
      [
        "contains",
        "insertUser",
        "exact",
        1,
        "framework.mybatis.mapper.literal-direct-statement"
      ],
      [
        "calls",
        "com.example.UserMapper::baseColumns",
        "exact",
        1,
        "framework.mybatis.mapper.literal-include.same-file-sql"
      ]
    ]);
    expect(facts.edges.at(-1)?.range).toEqual({
      start: { line: 7, column: 12 },
      end: { line: 7, column: 42 }
    });
  });

  it("keeps unproven MyBatis forms explicit or absent", () => {
    const missingFragment = extractFileFacts({
      filePath: "src/main/resources/MissingMapper.xml",
      language: "xml",
      sourceText: [
        '<mapper namespace="com.example.MissingMapper">',
        '  <select id="find"><if test="enabled"><include refid="missing"/></if></select>',
        "</mapper>"
      ].join("\n")
    });
    const invalidNamespaceAndId = extractFileFacts({
      filePath: "src/main/resources/UnsupportedMapper.xml",
      language: "xml",
      sourceText: '<mapper namespace="UserMapper"><select id="find-user"/></mapper>'
    });
    const otherDtd = extractFileFacts({
      filePath: "src/main/resources/OtherDtdMapper.xml",
      language: "xml",
      sourceText: [
        '<!DOCTYPE mapper SYSTEM "https://example.test/mapper.dtd">',
        '<mapper namespace="com.example.OtherMapper"><select id="find"/></mapper>'
      ].join("\n")
    });

    expect(
      missingFragment.edges.map((edge) => [
        edge.kind,
        edge.referenceName,
        edge.resolution,
        edge.confidence,
        edge.evidence?.ruleId
      ])
    ).toContainEqual([
      "calls",
      "com.example.MissingMapper::missing",
      "unresolved",
      0,
      "framework.mybatis.mapper.literal-include.unresolved-same-file-sql"
    ]);
    expect(
      invalidNamespaceAndId.symbols.map((symbol) => [symbol.kind, symbol.qualifiedName])
    ).toEqual([
      ["file", "src/main/resources/UnsupportedMapper.xml"],
      ["resource", "src/main/resources/UnsupportedMapper.xml#xml-element:mapper[0]"],
      [
        "resource",
        "src/main/resources/UnsupportedMapper.xml#xml-element:mapper[0]/select[0]"
      ]
    ]);
    expect(otherDtd.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "OtherDtdMapper.xml"]
    ]);
    expect(otherDtd.edges).toEqual([]);
  });

  it("rejects malformed, multi-root, and DTD XML without derived facts", () => {
    const malformed = extractFileFacts({
      filePath: "config/broken.xml",
      language: "xml",
      sourceText: "<catalog><item></catalog>"
    });
    const multipleRoots = extractFileFacts({
      filePath: "config/multiple.xml",
      language: "xml",
      sourceText: "<first/><second/>"
    });
    const doctype = extractFileFacts({
      filePath: "config/external.xml",
      language: "xml",
      sourceText: "<!DOCTYPE catalog><catalog><item/></catalog>"
    });

    for (const facts of [malformed, multipleRoots, doctype]) {
      expect(facts.symbols).toHaveLength(1);
      expect(facts.symbols[0]).toMatchObject({ kind: "file" });
      expect(facts.edges).toEqual([]);
    }
  });
});
