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
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-framework-plugin-"));
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
  it("resolves routes and invalidates persisted facts when the scoped descriptor changes", async () => {
    const projectPath = await createInlineProject({
      "src/routes.ts": [
        'import { Get, Router } from "@acme/lattice-router";',
        "const api = new Router();",
        "const mounted = new Router();",
        "export function health() { return { ok: true }; }",
        'api.get("/health", health);',
        "function mountedHealth() { return { ok: true }; }",
        'mounted.get("/mounted", mountedHealth);',
        'api.mount("/api", mounted);',
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
        })
      ])
    );
    expect(firstFacts?.extractorVersion).toBe(firstExtractor.version);

    const changedRegistry = createFrameworkRoutePluginRegistry([
      {
        ...latticeRouterPlugin,
        decoratorRoutes: [
          ...(latticeRouterPlugin.decoratorRoutes ?? []),
          { decoratorExport: "Post", routeMethod: "POST" }
        ]
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
