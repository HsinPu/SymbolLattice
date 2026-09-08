import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

const INDEXED_AT = "2026-09-09T00:00:00.000Z";

type FixtureFiles = Readonly<Record<string, string>>;

const NESTED_GROUP_FILES: FixtureFiles = {
  "app/__init__.py": "",
  "app/routes/__init__.py": [
    "from .public import public as public_blueprint",
    "from .api import api as api_group"
  ].join("\n"),
  "app/routes/public.py": [
    "from sanic import Blueprint as Router",
    "public = Router(\"public\", url_prefix=\"/public\")",
    "",
    "@public.get(\"/status\")",
    "async def status(request):",
    "    return None"
  ].join("\n"),
  "app/routes/catalog.py": [
    "from sanic import Blueprint as Router",
    "catalog = Router(\"catalog\", url_prefix=\"/catalog\")",
    "",
    "@catalog.get(\"/items\")",
    "async def items(request):",
    "    return None"
  ].join("\n"),
  "app/routes/users.py": [
    "from sanic import Blueprint as Router",
    "users = Router(\"users\", url_prefix=\"/users\")",
    "",
    "@users.get(\"/health\")",
    "async def health(request):",
    "    return None"
  ].join("\n"),
  "app/routes/content.py": [
    "from sanic import Blueprint as Router",
    "from .users import users as users_blueprint",
    "content = Router.group(users_blueprint, url_prefix=\"/content\")"
  ].join("\n"),
  "app/routes/api.py": [
    "from sanic import Blueprint as Router",
    "from .catalog import catalog as catalog_blueprint",
    "from .content import content as content_group",
    "reports = Router(\"reports\", url_prefix=\"/reports\")",
    "api = Router.group(catalog_blueprint, content_group, reports, url_prefix=\"/api\")",
    "",
    "@reports.get(\"/summary\")",
    "async def summary(request):",
    "    return None"
  ].join("\n"),
  "app/main.py": [
    "from sanic import Sanic as App",
    "from .routes import public_blueprint",
    "from .routes import api_group",
    "app = App(\"SymbolLattice\")",
    "app.blueprint(public_blueprint, url_prefix=\"/v1\")",
    "app.blueprint(api_group, url_prefix=\"/v2\")"
  ].join("\n")
};

const NAMED_GROUP_FILES: FixtureFiles = {
  "app/__init__.py": "",
  "app/routes/__init__.py": "",
  "app/routes/users.py": [
    "from sanic import Blueprint as Router",
    "users = Router(\"users\", url_prefix=\"/users\")",
    "",
    "@users.get(\"/health\")",
    "async def health(request):",
    "    return None"
  ].join("\n"),
  "app/routes/public.py": [
    "from sanic import Blueprint as Router",
    "from .users import users as users_blueprint",
    "public = Router.group(users_blueprint, url_prefix=\"/public\", name_prefix=\"public\")"
  ].join("\n"),
  "app/routes/admin.py": [
    "from sanic import Blueprint as Router",
    "from .users import users as users_blueprint",
    "admin = Router.group(users_blueprint, url_prefix=\"/admin\", name_prefix=\"admin\")"
  ].join("\n"),
  "app/main.py": [
    "from sanic import Sanic as App",
    "from .routes.public import public as public_group",
    "from .routes.admin import admin as admin_group",
    "app = App(\"SymbolLattice\")",
    "app.blueprint(public_group, url_prefix=\"/v1\")",
    "app.blueprint(admin_group, url_prefix=\"/v2\")"
  ].join("\n")
};

const COLLIDING_GROUP_FILES: FixtureFiles = {
  "app/__init__.py": "",
  "app/routes/__init__.py": "",
  "app/routes/users.py": [
    "from sanic import Blueprint as Router",
    "users = Router(\"users\", url_prefix=\"/users\")",
    "",
    "@users.get(\"/health\")",
    "async def health(request):",
    "    return None"
  ].join("\n"),
  "app/routes/public.py": [
    "from sanic import Blueprint as Router",
    "from .users import users as users_blueprint",
    "public = Router.group(users_blueprint, url_prefix=\"/public\")"
  ].join("\n"),
  "app/routes/admin.py": [
    "from sanic import Blueprint as Router",
    "from .users import users as users_blueprint",
    "admin = Router.group(users_blueprint, url_prefix=\"/admin\")"
  ].join("\n"),
  "app/main.py": [
    "from sanic import Sanic as App",
    "from .routes.public import public as public_group",
    "from .routes.admin import admin as admin_group",
    "app = App(\"SymbolLattice\")",
    "app.blueprint(public_group, url_prefix=\"/v1\")",
    "app.blueprint(admin_group, url_prefix=\"/v2\")"
  ].join("\n")
};

const MISSING_PACKAGE_BOUNDARY_FILES: FixtureFiles = {
  "app/routes/__init__.py": "",
  "app/routes/catalog.py": [
    "from sanic import Blueprint as Router",
    "catalog = Router(\"catalog\", url_prefix=\"/catalog\")",
    "",
    "@catalog.get(\"/items\")",
    "async def items(request):",
    "    return None"
  ].join("\n"),
  "app/main.py": [
    "from sanic import Sanic as App",
    "from .routes.catalog import catalog",
    "app = App(\"SymbolLattice\")",
    "app.blueprint(catalog, url_prefix=\"/api\")"
  ].join("\n")
};

function resolveFixture(files: FixtureFiles) {
  const sourceDocuments: SourceDocument[] = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath,
    absolutePath: `/sanic-resolver-parity/${relativePath}`,
    language: "python",
    sourceText,
    contentHash: createHash("sha256").update(sourceText).digest("hex")
  }));
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((document) =>
      extractFileFacts({
        filePath: document.relativePath,
        sourceText: document.sourceText,
        language: document.language
      })
    ),
    indexedAt: INDEXED_AT
  });
}

function importedSanicRouteEdges(result: ReturnType<typeof resolveFixture>) {
  return result.edges.filter(
    (edge) =>
      edge.kind === "routes" &&
      edge.evidence?.ruleId.startsWith("framework.sanic.") === true
  );
}

describe("Sanic Blueprint resolver pre-move parity golden", () => {
  it("preserves re-exported nested Blueprint groups and literal route prefixes", () => {
    const result = resolveFixture(NESTED_GROUP_FILES);
    const edges = importedSanicRouteEdges(result);
    const symbolsById = new Map(result.symbols.map((symbol) => [symbol.id, symbol]));
    const paths = edges.map((edge) => symbolsById.get(edge.sourceId)?.name ?? "").sort();
    const ruleIds = edges.map((edge) => edge.evidence?.ruleId ?? "");

    expect(edges).toHaveLength(4);
    expect(paths).toEqual([
      "GET /v1/public/status",
      "GET /v2/api/catalog/items",
      "GET /v2/api/content/users/health",
      "GET /v2/api/reports/summary"
    ]);
    expect(ruleIds.some((ruleId) => ruleId === "framework.sanic.reexported-blueprint.app-blueprint.decorator.local-function")).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId === "framework.sanic.reexported-blueprint-group.app-blueprint.decorator.local-function")).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId === "framework.sanic.reexported-nested-blueprint-group.app-blueprint.decorator.local-function")).toBe(true);
    expect(edges.every((edge) => edge.resolution === "exact" && edge.targetId !== null && edge.confidence === 1)).toBe(true);
    expect(result).toMatchSnapshot();
  });

  it("keeps distinct repeated named group mounts exact", () => {
    const result = resolveFixture(NAMED_GROUP_FILES);
    const edges = importedSanicRouteEdges(result);
    const routeNames = edges.map((edge) => edge.referenceName).sort();

    expect(edges).toHaveLength(2);
    expect(routeNames).toEqual(["health", "health"]);
    expect(
      edges.every(
        (edge) =>
          edge.resolution === "exact" &&
          edge.targetId !== null &&
          edge.confidence === 1 &&
          edge.evidence?.ruleId ===
            "framework.sanic.imported-named-blueprint-group.app-blueprint.decorator.local-function"
      )
    ).toBe(true);
    expect(result).toMatchSnapshot();
  });

  it("rejects repeated group mounts without unique literal name prefixes", () => {
    const result = resolveFixture(COLLIDING_GROUP_FILES);
    const edges = importedSanicRouteEdges(result);

    expect(edges.filter((edge) => edge.resolution === "exact")).toEqual([]);
    expect(edges.filter((edge) => edge.targetId !== null)).toEqual([]);
    expect(result).toMatchSnapshot();
  });

  it("does not cross a missing regular-package boundary", () => {
    const result = resolveFixture(MISSING_PACKAGE_BOUNDARY_FILES);
    const edges = importedSanicRouteEdges(result);

    expect(edges.filter((edge) => edge.resolution === "exact")).toEqual([]);
    expect(edges.filter((edge) => edge.targetId !== null)).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
