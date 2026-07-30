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
});
