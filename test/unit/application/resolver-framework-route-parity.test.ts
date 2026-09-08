import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import {
  createFrameworkRoutePluginRegistry,
  extractFileFacts,
  type FrameworkRoutePlugin
} from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

type Fixture = {
  readonly path: string;
  readonly language: SourceDocument["language"];
  readonly source: string;
};

const latticeRouterPlugin: FrameworkRoutePlugin = {
  id: "acme/lattice-router",
  languages: ["typescript"],
  moduleSpecifier: "@acme/lattice-router",
  factoryExport: "Router",
  routeMethods: [{ methodName: "get", routeMethod: "GET" }],
  mountMethods: [{ methodName: "mount" }],
  surfaces: [
    "exact named Router imports",
    "const zero-argument Router receivers with literal named-handler HTTP methods"
  ]
};

const frameworkPluginFixtures: readonly Fixture[] = [
  {
    path: "src/child.ts",
    language: "typescript",
    source: [
      'import { Router } from "@acme/lattice-router";',
      "export const child = new Router();",
      "export function health() { return { ok: true }; }",
      'child.get("/health", health);'
    ].join("\n")
  },
  {
    path: "src/mid.ts",
    language: "typescript",
    source: [
      'import { Router } from "@acme/lattice-router";',
      'import { child } from "./child.js";',
      "export const versioned = new Router();",
      'versioned.mount("/v1", child);'
    ].join("\n")
  },
  {
    path: "src/routes.ts",
    language: "typescript",
    source: 'export { versioned as apiRoutes } from "./mid.js";'
  },
  {
    path: "src/app.ts",
    language: "typescript",
    source: [
      'import { Router } from "@acme/lattice-router";',
      'import { apiRoutes as mountedRoutes } from "./routes.js";',
      "const app = new Router();",
      'app.mount("/api", mountedRoutes);'
    ].join("\n")
  }
];

const nestFixtures: readonly Fixture[] = [
  {
    path: "src/cats.controller.ts",
    language: "typescript",
    source: [
      'import { Controller, Get } from "@nestjs/common";',
      '@Controller("cats")',
      "export class CatsController {",
      '  @Get(":id") findOne() { return "cat"; }',
      "}"
    ].join("\n")
  },
  {
    path: "src/controllers.ts",
    language: "typescript",
    source: 'export { CatsController } from "./cats.controller";'
  },
  {
    path: "src/cats.module.ts",
    language: "typescript",
    source: [
      'import { Module } from "@nestjs/common";',
      'import { CatsController } from "./controllers";',
      "@Module({ controllers: [CatsController] })",
      "export class CatsModule {}"
    ].join("\n")
  },
  {
    path: "src/app.module.ts",
    language: "typescript",
    source: [
      'import { Module as NestModule } from "@nestjs/common";',
      'import { RouterModule as NestRouter } from "@nestjs/core";',
      'import { CatsModule } from "./cats.module";',
      "@NestModule({",
      '  imports: [NestRouter.register([{ path: "admin", module: CatsModule }])]',
      "})",
      "export class AppModule {}"
    ].join("\n")
  }
];

const fastifyFixtures: readonly Fixture[] = [
  {
    path: "src/main.ts",
    language: "typescript",
    source: [
      'import Fastify from "fastify";',
      'import { api } from "./barrel.js";',
      "const app = Fastify();",
      'app.register(api, { prefix: "/api" });'
    ].join("\n")
  },
  {
    path: "src/barrel.ts",
    language: "typescript",
    source: 'export { api } from "./api.js";'
  },
  {
    path: "src/api.ts",
    language: "typescript",
    source: [
      'import { listUsers } from "./handlers.js";',
      'import { jobsPlugin } from "./jobs.js";',
      "export async function api(server: unknown) {",
      '  server.get("/users", listUsers);',
      '  server.register(jobsPlugin, { prefix: "/v1" });',
      "}"
    ].join("\n")
  },
  {
    path: "src/jobs.ts",
    language: "typescript",
    source: [
      'import { listUsers } from "./handlers.js";',
      "export async function jobsPlugin(server: unknown) {",
      '  server.get("/jobs", listUsers);',
      "}"
    ].join("\n")
  },
  {
    path: "src/handlers.ts",
    language: "typescript",
    source: "export function listUsers() { return []; }"
  }
];

function snapshot(
  fixtures: readonly Fixture[],
  frameworkRoutePlugins?: ReturnType<typeof createFrameworkRoutePluginRegistry>
) {
  const sourceDocuments: SourceDocument[] = fixtures.map((fixture) => ({
    relativePath: fixture.path,
    absolutePath: `/framework-route-parity/${fixture.path}`,
    language: fixture.language,
    sourceText: fixture.source,
    contentHash: createHash("sha256").update(fixture.source).digest("hex")
  }));
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((document) =>
      extractFileFacts(
        {
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        },
        frameworkRoutePlugins === undefined ? undefined : { frameworkRoutePlugins }
      )
    ),
    indexedAt: "2026-09-09T00:00:00.000Z"
  });
}

describe("framework route/Nest resolver complete-output parity before move", () => {
  it("preserves a re-exported framework receiver and ordered imported mount chain", () => {
    const result = snapshot(
      frameworkPluginFixtures,
      createFrameworkRoutePluginRegistry([latticeRouterPlugin])
    );
    expect(result.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)).toEqual([
      "GET /api/v1/health"
    ]);
    expect(result.edges.filter((edge) => edge.kind === "routes" && edge.resolution === "exact")).toHaveLength(1);
    expect(result).toMatchSnapshot();
  });

  it("preserves Nest controller/module RouterModule projection through a re-export", () => {
    const result = snapshot(nestFixtures);
    expect(result.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)).toEqual([
      "GET /admin/cats/:id"
    ]);
    expect(result.edges.filter((edge) => edge.kind === "routes" && edge.resolution === "exact")).toHaveLength(1);
    expect(result).toMatchSnapshot();
  });

  it("preserves Fastify imported plugin routes while the projector owns only route expansion", () => {
    const result = snapshot(fastifyFixtures);
    expect(result.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name).sort()).toEqual([
      "GET /api/users",
      "GET /api/v1/jobs"
    ]);
    expect(result.edges.filter((edge) => edge.kind === "routes" && edge.resolution === "exact")).toHaveLength(2);
    expect(result).toMatchSnapshot();
  });

  it("keeps dynamic, duplicate, and ambiguous receiver paths non-exact", () => {
    const dynamicPrefix = snapshot(
      [
        {
          path: "src/routes.ts",
          language: "typescript",
          source: [
            'import { Router } from "@acme/lattice-router";',
            "const app = new Router();",
            "const child = new Router();",
            'const prefix = "/api";',
            "function health() {}",
            'child.get("/health", health);',
            "app.mount(prefix, child);",
            'app.mount("/other", child);'
          ].join("\n")
        }
      ],
      createFrameworkRoutePluginRegistry([latticeRouterPlugin])
    );
    expect(dynamicPrefix.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(dynamicPrefix.edges.filter((edge) => edge.kind === "routes")).toEqual([]);

    const missingNest = snapshot([nestFixtures[0]!, nestFixtures[3]!]);
    expect(missingNest.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)).toEqual([
      "GET /cats/:id"
    ]);
    expect(missingNest.edges.filter((edge) => edge.kind === "routes" && edge.resolution === "exact")).toHaveLength(1);
    expect(missingNest).toMatchSnapshot();
  });
});
