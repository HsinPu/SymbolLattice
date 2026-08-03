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
  surfaces: [
    "exact named Router imports",
    "const zero-argument Router receivers with literal named-handler HTTP methods"
  ]
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
    const extractor = createFrameworkRoutePluginExtractor(registry);

    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.plugins)).toBe(true);
    expect(registry.fingerprint).toBe(sameSemanticsInDifferentOrder.fingerprint);
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
  });
});
