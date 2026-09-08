import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

const INDEXED_AT = "2026-09-09T00:00:00.000Z";

type FixtureFiles = Readonly<Record<string, string>>;

const POSITIVE_FILES: FixtureFiles = {
  "api/__init__.py": "",
  "api/routers/__init__.py": [
    "from .catalog import router as public_router",
    "from api.routers.admin import router as absolute_router"
  ].join("\n"),
  "api/routers/catalog.py": [
    "from fastapi import APIRouter",
    "router = APIRouter(prefix=\"/catalog\")",
    "",
    "@router.get(\"/health\")",
    "async def health():",
    "    return {\"ok\": True}"
  ].join("\n"),
  "api/routers/admin.py": [
    "from fastapi import APIRouter",
    "router = APIRouter(prefix=\"/admin\")",
    "",
    "@router.post(\"/ready\")",
    "def ready():",
    "    return {\"ready\": True}"
  ].join("\n"),
  "api/main.py": [
    "from fastapi import FastAPI",
    "from .routers.catalog import router as direct_router",
    "from .routers import public_router",
    "from api.routers.admin import router as absolute_direct_router",
    "from api.routers import absolute_router",
    "app = FastAPI()",
    "app.include_router(direct_router, prefix=\"/direct\")",
    "app.include_router(public_router, prefix=\"/relative-reexport\")",
    "app.include_router(absolute_direct_router, prefix=\"/absolute\")",
    "app.include_router(absolute_router, prefix=\"/absolute-reexport\")"
  ].join("\n")
};

const MISSING_OR_UNSUPPORTED_FILES: FixtureFiles = {
  "api/__init__.py": "",
  "api/routers/__init__.py": [
    "from .missing import router as missing_router"
  ].join("\n"),
  "api/routers/dynamic.py": [
    "from fastapi import APIRouter",
    "prefix = \"/dynamic\"",
    "router = APIRouter(prefix=prefix)",
    "",
    "@router.get(\"/dynamic\")",
    "def dynamic():",
    "    return {\"ok\": True}"
  ].join("\n"),
  "api/main.py": [
    "from fastapi import FastAPI",
    "from .routers.missing import router as missing_direct",
    "from .routers import missing_router",
    "from .routers.dynamic import router as dynamic_router",
    "app = FastAPI()",
    "app.include_router(missing_direct, prefix=\"/missing-direct\")",
    "app.include_router(missing_router, prefix=\"/missing-reexport\")",
    "app.include_router(dynamic_router, prefix=\"/dynamic\")"
  ].join("\n")
};

const MISSING_PACKAGE_BOUNDARY_FILES: FixtureFiles = {
  "api/routers/__init__.py": "",
  "api/routers/catalog.py": [
    "from fastapi import APIRouter",
    "router = APIRouter(prefix=\"/catalog\")",
    "",
    "@router.get(\"/health\")",
    "def health():",
    "    return {\"ok\": True}"
  ].join("\n"),
  "api/main.py": [
    "from fastapi import FastAPI",
    "from .routers.catalog import router",
    "app = FastAPI()",
    "app.include_router(router, prefix=\"/api\")"
  ].join("\n")
};

function resolveFixture(files: FixtureFiles) {
  const sourceDocuments: SourceDocument[] = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath,
    absolutePath: `/fastapi-route-resolver-parity/${relativePath}`,
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

function importedFastApiRouteEdges(result: ReturnType<typeof resolveFixture>) {
  return result.edges.filter(
    (edge) =>
      edge.kind === "routes" &&
      edge.evidence?.ruleId.startsWith("framework.fastapi.") === true &&
      edge.evidence.ruleId.includes("router.include-router.decorator.local-function")
  );
}

describe("FastAPI router resolver pre-move parity golden", () => {
  it("preserves direct, project-absolute, and initializer re-export routes", () => {
    const result = resolveFixture(POSITIVE_FILES);
    const edges = importedFastApiRouteEdges(result);
    const ruleIds = edges.map((edge) => edge.evidence?.ruleId ?? "");

    expect(edges).toHaveLength(4);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.fastapi.imported-router."))).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.fastapi.project-absolute-router."))).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.fastapi.reexported-router."))).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.fastapi.project-absolute-reexported-router."))).toBe(true);
    expect(edges.every((edge) => edge.resolution === "exact" && edge.targetId !== null && edge.confidence === 1)).toBe(true);
    expect(result).toMatchSnapshot();
  });

  it("keeps missing and unsupported router targets unresolved", () => {
    const result = resolveFixture(MISSING_OR_UNSUPPORTED_FILES);
    const edges = importedFastApiRouteEdges(result);

    expect(edges.filter((edge) => edge.resolution === "exact")).toEqual([]);
    expect(edges.filter((edge) => edge.targetId !== null)).toEqual([]);
    expect(result).toMatchSnapshot();
  });

  it("does not cross a missing regular-package boundary", () => {
    const result = resolveFixture(MISSING_PACKAGE_BOUNDARY_FILES);
    const edges = importedFastApiRouteEdges(result);

    expect(edges.filter((edge) => edge.resolution === "exact")).toEqual([]);
    expect(edges.filter((edge) => edge.targetId !== null)).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
