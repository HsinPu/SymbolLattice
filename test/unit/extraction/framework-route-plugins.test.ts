import { describe, expect, it } from "vitest";

import { ARTIFACT_FACTS_EXTRACTOR_VERSION } from "../../../src/domain/index.js";
import {
  createFrameworkRoutePluginExtractor,
  createFrameworkRoutePluginRegistry,
  extractFileFacts,
  FrameworkRoutePluginConfigurationError,
  frameworkRoutePluginExtractorVersion,
  type FrameworkRoutePlugin,
  type FrameworkRoutePluginRegistry
} from "../../../src/extraction/index.js";

const latticeRouterPlugin: FrameworkRoutePlugin = {
  id: "acme/lattice-router",
  languages: ["typescript", "javascript"],
  moduleSpecifier: "@acme/lattice-router",
  factoryExport: "Router",
  routeMethods: [
    { methodName: "get", routeMethod: "GET" },
    { methodName: "post", routeMethod: "POST" }
  ],
  mountMethods: [{ methodName: "mount" }],
  surfaces: [
    "exact named Router imports",
    "const zero-argument Router receivers with literal named-handler HTTP methods"
  ]
};

const latticeControllerPlugin: FrameworkRoutePlugin = {
  id: "acme/lattice-controller",
  languages: ["typescript"],
  moduleSpecifier: "@acme/lattice-controller",
  decoratorRoutes: [{ decoratorExport: "Get", routeMethod: "GET" }],
  surfaces: ["exact named Get imports", "TypeScript instance methods with literal decorator paths"]
};

describe("framework route plugin registry", () => {
  it("adds only a syntax-proven route through an exact named import and immutable receiver", () => {
    const registry = createFrameworkRoutePluginRegistry([latticeRouterPlugin]);
    const facts = extractFileFacts(
      {
        filePath: "src/routes.ts",
        language: "typescript",
        sourceText: [
          'import { Router as LatticeRouter } from "@acme/lattice-router";',
          "const api = new LatticeRouter();",
          "function health() { return { ok: true }; }",
          'api.get("/health", health);'
        ].join("\n")
      },
      { frameworkRoutePlugins: registry }
    );

    expect(facts.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "route", name: "GET /health" })
      ])
    );
    expect(facts.pendingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationKind: "routes",
          referenceName: "health",
          routeFramework: "plugin:acme/lattice-router"
        })
      ])
    );
  });

  it("adds an exact TypeScript method decorator route with direct method evidence", () => {
    const registry = createFrameworkRoutePluginRegistry([latticeControllerPlugin]);
    const facts = extractFileFacts(
      {
        filePath: "src/controller.ts",
        language: "typescript",
        sourceText: [
          'import { Get as Route } from "@acme/lattice-controller";',
          "class HealthController {",
          '  @Route("/health")',
          "  health() { return { ok: true }; }",
          "}"
        ].join("\n")
      },
      { frameworkRoutePlugins: registry }
    );

    expect(facts.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "route", name: "GET /health" })
      ])
    );
    expect(facts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "routes",
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId: "framework.plugin.acme.lattice-controller.decorator-route.local-method",
            stage: "syntax"
          })
        })
      ])
    );
  });

  it("supports a configured default method decorator import", () => {
    const registry = createFrameworkRoutePluginRegistry([
      {
        ...latticeControllerPlugin,
        decoratorRoutes: [{ decoratorExport: "default", routeMethod: "POST" }]
      }
    ]);
    const facts = extractFileFacts(
      {
        filePath: "src/controller.ts",
        language: "typescript",
        sourceText: [
          'import Post from "@acme/lattice-controller";',
          "class HealthController {",
          '  @Post("/health")',
          "  health() { return { ok: true }; }",
          "}"
        ].join("\n")
      },
      { frameworkRoutePlugins: registry }
    );

    expect(facts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "routes",
          evidence: expect.objectContaining({
            ruleId: "framework.plugin.acme.lattice-controller.decorator-route.local-method"
          })
        })
      ])
    );
  });

  it("fails closed for dynamic paths, non-const receivers, and unsupported receiver calls", () => {
    const registry = createFrameworkRoutePluginRegistry([latticeRouterPlugin]);
    const cases = [
      [
        'import { Router } from "@acme/lattice-router";',
        "const api = new Router();",
        "const path = \"/health\";",
        "function health() {}",
        "api.get(path, health);"
      ],
      [
        'import { Router } from "@acme/lattice-router";',
        "let api = new Router();",
        "function health() {}",
        'api.get("/health", health);'
      ],
      [
        'import { Router } from "@acme/lattice-router";',
        "const api = new Router({ runtime: true });",
        "function health() {}",
        'api.get("/health", health);'
      ],
      [
        'import { Router } from "@acme/lattice-router";',
        "const api = new Router();",
        "function health() {}",
        'api.patch("/health", health);'
      ]
    ];

    for (const sourceLines of cases) {
      const facts = extractFileFacts(
        {
          filePath: "src/routes.ts",
          language: "typescript",
          sourceText: sourceLines.join("\n")
        },
        { frameworkRoutePlugins: registry }
      );
      expect(facts.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
    }
  });

  it("projects one child router through one literal fixed prefix", () => {
    const registry = createFrameworkRoutePluginRegistry([latticeRouterPlugin]);
    const facts = extractFileFacts(
      {
        filePath: "src/routes.ts",
        language: "typescript",
        sourceText: [
          'import { Router } from "@acme/lattice-router";',
          "const app = new Router();",
          "const healthRoutes = new Router();",
          "function health() { return { ok: true }; }",
          'healthRoutes.get("/health", health);',
          'app.mount("/api", healthRoutes);'
        ].join("\n")
      },
      { frameworkRoutePlugins: registry }
    );

    expect(facts.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "route", name: "GET /api/health" })
      ])
    );
    expect(facts.symbols).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "route", name: "GET /health" })
      ])
    );
    expect(facts.pendingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationKind: "routes",
          routeRegistration: "plugin-literal-prefix-mount"
        })
      ])
    );
  });

  it("projects one JavaScript child router through one literal fixed prefix", () => {
    const registry = createFrameworkRoutePluginRegistry([latticeRouterPlugin]);
    const facts = extractFileFacts(
      {
        filePath: "src/routes.js",
        language: "javascript",
        sourceText: [
          'import { Router } from "@acme/lattice-router";',
          "const app = new Router();",
          "const healthRoutes = new Router();",
          "function health() { return { ok: true }; }",
          'healthRoutes.get("/health", health);',
          'app.mount("/api", healthRoutes);'
        ].join("\n")
      },
      { frameworkRoutePlugins: registry }
    );

    expect(facts.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "route", name: "GET /api/health" })
      ])
    );
    expect(facts.pendingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationKind: "routes",
          routeRegistration: "plugin-literal-prefix-mount"
        })
      ])
    );
  });

  it("projects a unique nested literal prefix chain with distinct route evidence", () => {
    const registry = createFrameworkRoutePluginRegistry([latticeRouterPlugin]);
    const facts = extractFileFacts(
      {
        filePath: "src/routes.ts",
        language: "typescript",
        sourceText: [
          'import { Router } from "@acme/lattice-router";',
          "const root = new Router();",
          "const api = new Router();",
          "const healthRoutes = new Router();",
          "function info() { return { ok: true }; }",
          'api.get("/info", info);',
          "function health() { return { ok: true }; }",
          'healthRoutes.get("/health", health);',
          'root.mount("/api", api);',
          'api.mount("/v1", healthRoutes);'
        ].join("\n")
      },
      { frameworkRoutePlugins: registry }
    );

    expect(facts.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "route", name: "GET /api/info" }),
        expect.objectContaining({ kind: "route", name: "GET /api/v1/health" })
      ])
    );
    expect(facts.pendingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationKind: "routes",
          routeRegistration: "plugin-literal-prefix-mount",
          routePrefixChain: [
            expect.objectContaining({
              filePath: "src/routes.ts",
              parentReceiver: "root",
              childReceiver: "api",
              mountMethod: "mount",
              prefix: "/api",
              range: expect.objectContaining({
                start: expect.objectContaining({ line: 9, column: 1 })
              })
            })
          ]
        }),
        expect.objectContaining({
          relationKind: "routes",
          routeRegistration: "plugin-literal-prefix-chain",
          routePrefixChain: [
            expect.objectContaining({
              filePath: "src/routes.ts",
              parentReceiver: "root",
              childReceiver: "api",
              mountMethod: "mount",
              prefix: "/api",
              range: expect.objectContaining({
                start: expect.objectContaining({ line: 9, column: 1 })
              })
            }),
            expect.objectContaining({
              filePath: "src/routes.ts",
              parentReceiver: "api",
              childReceiver: "healthRoutes",
              mountMethod: "mount",
              prefix: "/v1",
              range: expect.objectContaining({
                start: expect.objectContaining({ line: 10, column: 1 })
              })
            })
          ]
        })
      ])
    );
  });

  it("keeps the supported literal prefix-chain depth and suppresses a deeper route", () => {
    const registry = createFrameworkRoutePluginRegistry([latticeRouterPlugin]);
    const sourceForMountCount = (mountCount: number): string =>
      [
        'import { Router } from "@acme/lattice-router";',
        ...Array.from(
          { length: mountCount + 1 },
          (_, index) => `const router${index} = new Router();`
        ),
        "function health() {}",
        `router${mountCount}.get("/health", health);`,
        ...Array.from(
          { length: mountCount },
          (_, index) => `router${index}.mount("/p${index}", router${index + 1});`
        )
      ].join("\n");
    const supportedFacts = extractFileFacts(
      {
        filePath: "src/routes.ts",
        language: "typescript",
        sourceText: sourceForMountCount(16)
      },
      { frameworkRoutePlugins: registry }
    );
    expect(supportedFacts.pendingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationKind: "routes",
          routeRegistration: "plugin-literal-prefix-chain"
        })
      ])
    );

    const overDeepFacts = extractFileFacts(
      {
        filePath: "src/routes.ts",
        language: "typescript",
        sourceText: sourceForMountCount(17)
      },
      { frameworkRoutePlugins: registry }
    );
    expect(
      overDeepFacts.pendingReferences.filter((reference) => reference.relationKind === "routes")
    ).toEqual([]);
  });

  it("suppresses a child route when a configured mount is dynamic, invalid, overloaded, duplicate, cyclic, or has an unresolved ancestor", () => {
    const registry = createFrameworkRoutePluginRegistry([latticeRouterPlugin]);
    const cases = [
      [
        'import { Router } from "@acme/lattice-router";',
        "const app = new Router();",
        "const child = new Router();",
        'const prefix = "/api";',
        "function health() {}",
        'child.get("/health", health);',
        "app.mount(prefix, child);"
      ],
      [
        'import { Router } from "@acme/lattice-router";',
        "const app = new Router();",
        "const child = new Router();",
        "function health() {}",
        'child.get("/health", health);',
        'app.mount("/a", child);',
        'app.mount("/b", child);'
      ],
      [
        'import { Router } from "@acme/lattice-router";',
        "const app = new Router();",
        "const child = new Router();",
        "function health() {}",
        'child.get("/health", health);',
        'app.mount("/", child);'
      ],
      [
        'import { Router } from "@acme/lattice-router";',
        "const app = new Router();",
        "const child = new Router();",
        "function health() {}",
        'child.get("/health", health);',
        'app.mount("/api/", child);'
      ],
      [
        'import { Router } from "@acme/lattice-router";',
        "const app = new Router();",
        "const child = new Router();",
        "function health() {}",
        'child.get("/health", health);',
        'app.mount("/api", child, { strict: true });'
      ],
      [
        'import { Router } from "@acme/lattice-router";',
        "const root = new Router();",
        "const app = new Router();",
        "const child = new Router();",
        'const rootPrefix = "/root";',
        "function health() {}",
        'child.get("/health", health);',
        "root.mount(rootPrefix, app);",
        'app.mount("/api", child);'
      ],
      [
        'import { Router } from "@acme/lattice-router";',
        "const root = new Router();",
        "const child = new Router();",
        "function health() {}",
        'child.get("/health", health);',
        'root.mount("/root", child);',
        'child.mount("/child", root);'
      ]
    ];

    for (const sourceLines of cases) {
      const facts = extractFileFacts(
        {
          filePath: "src/routes.ts",
          language: "typescript",
          sourceText: sourceLines.join("\n")
        },
        { frameworkRoutePlugins: registry }
      );
      expect(facts.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
    }
  });

  it("fails closed for dynamic, overloaded, static, or shadowed decorator expressions", () => {
    const registry = createFrameworkRoutePluginRegistry([latticeControllerPlugin]);
    const cases = [
      [
        'import { Get } from "@acme/lattice-controller";',
        'const path = "/health";',
        "class HealthController {",
        "  @Get(path)",
        "  health() {}",
        "}"
      ],
      [
        'import { Get } from "@acme/lattice-controller";',
        "class HealthController {",
        '  @Get("/health", "extra")',
        "  health() {}",
        "}"
      ],
      [
        'import { Get } from "@acme/lattice-controller";',
        "class HealthController {",
        '  @Get("/health")',
        "  static health() {}",
        "}"
      ],
      [
        'import { Get } from "@acme/lattice-controller";',
        "function build(Get: unknown) {",
        "  class HealthController {",
        '    @Get("/health")',
        "    health() {}",
        "  }",
        "}"
      ]
    ];

    for (const sourceLines of cases) {
      const facts = extractFileFacts(
        {
          filePath: "src/controller.ts",
          language: "typescript",
          sourceText: sourceLines.join("\n")
        },
        { frameworkRoutePlugins: registry }
      );
      expect(
        facts.edges.filter(
          (edge) => edge.evidence.ruleId === "framework.plugin.acme.lattice-controller.decorator-route.local-method"
        )
      ).toEqual([]);
    }
  });

  it("freezes canonical descriptors, fingerprints their semantics, and rejects ambiguous declarations", () => {
    const registry = createFrameworkRoutePluginRegistry([latticeRouterPlugin]);
    const sameSemanticsInDifferentOrder = createFrameworkRoutePluginRegistry([
      {
        ...latticeRouterPlugin,
        languages: ["javascript", "typescript"],
        routeMethods: [...latticeRouterPlugin.routeMethods].reverse(),
        surfaces: [...latticeRouterPlugin.surfaces].reverse()
      }
    ]);
    const changedMountSemantics = createFrameworkRoutePluginRegistry([
      {
        ...latticeRouterPlugin,
        mountMethods: [{ methodName: "use" }]
      }
    ]);
    const extractor = createFrameworkRoutePluginExtractor(registry);

    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.plugins)).toBe(true);
    expect(registry.fingerprint).toBe(sameSemanticsInDifferentOrder.fingerprint);
    expect(registry.fingerprint).not.toBe(changedMountSemantics.fingerprint);
    expect(extractor.version).toBe(frameworkRoutePluginExtractorVersion(registry));
    expect(extractor.version).toContain(ARTIFACT_FACTS_EXTRACTOR_VERSION);
    expect(() =>
      createFrameworkRoutePluginExtractor({
        plugins: [],
        fingerprint: "forged"
      } as unknown as FrameworkRoutePluginRegistry)
    ).toThrow(FrameworkRoutePluginConfigurationError);
    expect(() =>
      createFrameworkRoutePluginRegistry([
        latticeRouterPlugin,
        { ...latticeRouterPlugin, id: "other/lattice-router" }
      ])
    ).toThrow(FrameworkRoutePluginConfigurationError);
    expect(() =>
      createFrameworkRoutePluginRegistry([
        {
          ...latticeRouterPlugin,
          routeMethods: [{ methodName: "go", routeMethod: "NAVIGATE" }]
        } as unknown as FrameworkRoutePlugin
      ])
    ).toThrow(FrameworkRoutePluginConfigurationError);
    expect(() =>
      createFrameworkRoutePluginRegistry([
        { ...latticeControllerPlugin, languages: ["javascript"] }
      ])
    ).toThrow(FrameworkRoutePluginConfigurationError);
    expect(() =>
      createFrameworkRoutePluginRegistry([
        {
          ...latticeRouterPlugin,
          decoratorRoutes: [{ decoratorExport: "Router", routeMethod: "GET" }]
        }
      ])
    ).toThrow(FrameworkRoutePluginConfigurationError);
    expect(() =>
      createFrameworkRoutePluginRegistry([
        {
          ...latticeControllerPlugin,
          mountMethods: [{ methodName: "mount" }]
        }
      ])
    ).toThrow(FrameworkRoutePluginConfigurationError);
    expect(() =>
      createFrameworkRoutePluginRegistry([
        {
          ...latticeRouterPlugin,
          mountMethods: [{ methodName: "mount" }, { methodName: "mount" }]
        }
      ])
    ).toThrow(FrameworkRoutePluginConfigurationError);
  });
});
