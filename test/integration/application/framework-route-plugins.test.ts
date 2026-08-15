import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import {
  createFrameworkRoutePluginExtractor,
  createFrameworkRoutePluginRegistry,
  type FrameworkRoutePlugin
} from "../../../src/extraction/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createInlineProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-framework-plugin-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, sourceText]) => {
      const absolutePath = resolve(projectPath, ...relativePath.split("/"));
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, sourceText, "utf8");
    })
  );
  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directoryPath) =>
      rm(directoryPath, { recursive: true, force: true })
    )
  );
});

const latticeRouterPlugin: FrameworkRoutePlugin = {
  id: "acme/lattice-router",
  languages: ["typescript"],
  moduleSpecifier: "@acme/lattice-router",
  factoryExport: "Router",
  routeMethods: [{ methodName: "get", routeMethod: "GET" }],
  decoratorRoutes: [{ decoratorExport: "Get", routeMethod: "GET" }],
  mountMethods: [{ methodName: "mount" }],
  surfaces: [
    "exact named Router imports",
    "const literal named-handler HTTP routes",
    "TypeScript literal method decorator routes"
  ]
};

describe("framework route plugin service integration", () => {
  it("projects an exactly imported receiver through a re-exported cross-file mount", async () => {
    const projectPath = await createInlineProject({
      "src/child.ts": [
        'import { Router } from "@acme/lattice-router";',
        "export const child = new Router();",
        "export function health() { return { ok: true }; }",
        'child.get("/health", health);'
      ].join("\n"),
      "src/mid.ts": [
        'import { Router } from "@acme/lattice-router";',
        'import { child } from "./child.js";',
        "export const versioned = new Router();",
        'versioned.mount("/v1", child);'
      ].join("\n"),
      "src/routes.ts": 'export { versioned as apiRoutes } from "./mid.js";',
      "src/app.ts": [
        'import { Router } from "@acme/lattice-router";',
        'import { apiRoutes as mountedRoutes } from "./routes.js";',
        "const app = new Router();",
        'app.mount("/api", mountedRoutes);'
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const extractor = createFrameworkRoutePluginExtractor(
      createFrameworkRoutePluginRegistry([latticeRouterPlugin])
    );
    const service = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      extractor
    );

    await service.init({ projectPath });
    const routes = await service.routes(projectPath, { method: "GET" });
    const persistedFacts = graphStore.getArtifactFacts(projectPath);

    expect(routes.routes.map((route) => route.path)).toEqual(["/api/v1/health"]);
    expect(
      persistedFacts.find((facts) => facts.filePath === "src/child.ts")
        ?.frameworkRoutePluginFacts
    ).toMatchObject({ receivers: [expect.any(Object)], routes: [expect.any(Object)] });
    expect(
      persistedFacts.find((facts) => facts.filePath === "src/app.ts")
        ?.frameworkRoutePluginFacts?.importedMounts
    ).toEqual([
      expect.objectContaining({
        frameworkId: "acme/lattice-router",
        segment: expect.objectContaining({ prefix: "/api" })
      })
    ]);
    expect(routes.routes[0]).toMatchObject({
      handler: { qualifiedName: "src/child.ts#health" },
      edge: {
        evidence: {
          ruleId:
            "framework.plugin.acme.lattice-router.imported-literal-prefix-chain.local-handler",
          stage: "lexical",
          resolutionPath: [
            "src/app.ts",
            "src/routes.ts",
            "src/mid.ts",
            "src/child.ts"
          ],
          routePrefixChain: [
            expect.objectContaining({
              filePath: "src/app.ts",
              parentReceiver: "app",
              childReceiver: "mountedRoutes",
              mountMethod: "mount",
              prefix: "/api"
            }),
            expect.objectContaining({
              filePath: "src/mid.ts",
              parentReceiver: "versioned",
              childReceiver: "child",
              mountMethod: "mount",
              prefix: "/v1"
            })
          ]
        }
      }
    });
  });

  it("fails closed for dynamic and duplicate imported mounts", async () => {
    const projectPath = await createInlineProject({
      "src/child.ts": [
        'import { Router } from "@acme/lattice-router";',
        "export const child = new Router();",
        "function health() { return { ok: true }; }",
        'child.get("/health", health);'
      ].join("\n"),
      "src/dynamic-child.ts": [
        'import { Router } from "@acme/lattice-router";',
        "export const dynamicChild = new Router();",
        "function status() { return { ok: true }; }",
        'dynamicChild.get("/status", status);'
      ].join("\n"),
      "src/app.ts": [
        'import { Router } from "@acme/lattice-router";',
        'import { child } from "./child.js";',
        'import { dynamicChild } from "./dynamic-child.js";',
        "const app = new Router();",
        'const prefix = "/dynamic";',
        'app.mount("/api", child);',
        'app.mount("/internal", child);',
        "app.mount(prefix, dynamicChild);"
      ].join("\n")
    });
    const service = new SymbolLatticeService(
      new SqliteGraphStore(),
      new FileSystemSourceCatalog(),
      createFrameworkRoutePluginExtractor(
        createFrameworkRoutePluginRegistry([latticeRouterPlugin])
      )
    );

    await service.init({ projectPath });
    await expect(service.routes(projectPath, { method: "GET" })).resolves.toMatchObject({
      routes: []
    });
  });

  it("resolves routes and invalidates persisted facts when the scoped descriptor changes", async () => {
    const projectPath = await createInlineProject({
      "src/routes.ts": [
        'import { Get, Router } from "@acme/lattice-router";',
        "const api = new Router();",
        "const mounted = new Router();",
        "const versioned = new Router();",
        "const nested = new Router();",
        "export function health() { return { ok: true }; }",
        'api.get("/health", health);',
        "function mountedHealth() { return { ok: true }; }",
        'mounted.get("/mounted", mountedHealth);',
        'api.mount("/api", mounted);',
        "function nestedHealth() { return { ok: true }; }",
        'nested.get("/nested", nestedHealth);',
        'versioned.mount("/v1", nested);',
        'api.mount("/versioned", versioned);',
        "class StatusController {",
        '  @Get("/status")',
        "  status() { return { ok: true }; }",
        "}"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const firstRegistry = createFrameworkRoutePluginRegistry([latticeRouterPlugin]);
    const firstExtractor = createFrameworkRoutePluginExtractor(firstRegistry);
    const firstService = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      firstExtractor
    );

    await firstService.init({ projectPath });
    const firstRoutes = await firstService.routes(projectPath, { method: "GET" });
    const firstFacts = graphStore.getArtifactFacts(projectPath)[0];

    expect(firstRoutes.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/health",
          handler: expect.objectContaining({ qualifiedName: "src/routes.ts#health" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.plugin.acme.lattice-router.literal-route.local-handler",
              stage: "lexical"
            })
          })
        }),
        expect.objectContaining({
          path: "/status",
          handler: expect.objectContaining({
            qualifiedName: "src/routes.ts#StatusController.status"
          }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.plugin.acme.lattice-router.decorator-route.local-method",
              stage: "syntax"
            })
          })
        }),
        expect.objectContaining({
          path: "/api/mounted",
          handler: expect.objectContaining({ qualifiedName: "src/routes.ts#mountedHealth" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.plugin.acme.lattice-router.literal-prefix-mount.local-handler",
              stage: "lexical"
            })
          })
        }),
        expect.objectContaining({
          path: "/versioned/v1/nested",
          handler: expect.objectContaining({ qualifiedName: "src/routes.ts#nestedHealth" }),
          edge: expect.objectContaining({
            evidence: expect.objectContaining({
              ruleId: "framework.plugin.acme.lattice-router.literal-prefix-chain.local-handler",
              stage: "lexical",
              routePrefixChain: [
                expect.objectContaining({
                  filePath: "src/routes.ts",
                  parentReceiver: "api",
                  childReceiver: "versioned",
                  mountMethod: "mount",
                  prefix: "/versioned",
                  range: expect.objectContaining({
                    start: expect.objectContaining({ line: 14, column: 1 })
                  })
                }),
                expect.objectContaining({
                  filePath: "src/routes.ts",
                  parentReceiver: "versioned",
                  childReceiver: "nested",
                  mountMethod: "mount",
                  prefix: "/v1",
                  range: expect.objectContaining({
                    start: expect.objectContaining({ line: 13, column: 1 })
                  })
                })
              ]
            })
          })
        })
      ])
    );
    const nestedRoute = firstRoutes.routes.find((route) => route.path === "/versioned/v1/nested");
    if (nestedRoute === undefined) {
      throw new Error("Expected the nested framework-plugin route to be indexed.");
    }
    const explainedRoute = await firstService.explainEdge(projectPath, nestedRoute.edge.id);
    expect(explainedRoute.edge.evidence?.routePrefixChain).toEqual([
      expect.objectContaining({
        filePath: "src/routes.ts",
        parentReceiver: "api",
        childReceiver: "versioned",
        mountMethod: "mount",
        prefix: "/versioned",
        range: expect.objectContaining({
          start: expect.objectContaining({ line: 14, column: 1 })
        })
      }),
      expect.objectContaining({
        filePath: "src/routes.ts",
        parentReceiver: "versioned",
        childReceiver: "nested",
        mountMethod: "mount",
        prefix: "/v1",
        range: expect.objectContaining({
          start: expect.objectContaining({ line: 13, column: 1 })
        })
      })
    ]);
    expect(firstFacts?.extractorVersion).toBe(firstExtractor.version);

    const changedRegistry = createFrameworkRoutePluginRegistry([
      {
        ...latticeRouterPlugin,
        mountMethods: [{ methodName: "use" }]
      }
    ]);
    const changedExtractor = createFrameworkRoutePluginExtractor(changedRegistry);
    const changedService = new SymbolLatticeService(
      graphStore,
      new FileSystemSourceCatalog(),
      changedExtractor
    );

    expect(changedExtractor.version).not.toBe(firstExtractor.version);
    await expect(changedService.getStatus(projectPath)).resolves.toMatchObject({
      stale: true,
      staleReasons: ["indexer-version-changed"]
    });

    const synced = await changedService.sync({ projectPath });
    const changedFacts = graphStore.getArtifactFacts(projectPath)[0];

    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["src/routes.ts"],
      reuseInvalidationReasons: ["extractor-version-changed"]
    });
    expect(changedFacts?.extractorVersion).toBe(changedExtractor.version);
  });
});
