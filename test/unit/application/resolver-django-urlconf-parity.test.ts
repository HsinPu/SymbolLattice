import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

const INDEXED_AT = "2026-09-09T00:00:00.000Z";

type FixtureFiles = Readonly<Record<string, string>>;

const POSITIVE_FILES: FixtureFiles = {
  "project/__init__.py": "",
  "project/catalog/__init__.py": "",
  "project/catalog/urls.py": [
    "from django.urls import path",
    "",
    "def items(request):",
    "    return None",
    "",
    "urlpatterns = [path(\"items/\", items)]"
  ].join("\n"),
  "project/routes/__init__.py": "from .catalog.urls import urlpatterns as public_patterns",
  "project/routes/catalog/__init__.py": "",
  "project/routes/catalog/urls.py": [
    "from django.urls import re_path",
    "",
    "def health(request):",
    "    return None",
    "",
    "urlpatterns = [re_path(r\"^health/$\", health)]"
  ].join("\n"),
  "project/urls.py": [
    "from django.urls import include, path, re_path",
    "from .catalog import urls as catalog_urls",
    "from .routes import public_patterns",
    "",
    "urlpatterns = [",
    "    path(\"api/\", include(catalog_urls)),",
    "    re_path(r\"^v1/\", include(public_patterns)),",
    "    path(\"internal/\", include(\"project.catalog.urls\")),",
    "]"
  ].join("\n")
};

const INVALID_INCLUSION_FILES: FixtureFiles = {
  "project/__init__.py": "",
  "project/catalog/__init__.py": "",
  "project/catalog/urls.py": [
    "from django.urls import path",
    "",
    "def items(request):",
    "    return None",
    "",
    "urlpatterns = [path(\"items/\", items)]"
  ].join("\n"),
  "project/urls.py": [
    "from django.urls import include, path",
    "from .catalog import urls as catalog_urls",
    "prefix = \"/dynamic/\"",
    "",
    "urlpatterns = [",
    "    path(\"api//\", include(catalog_urls)),",
    "    path(prefix, include(catalog_urls)),",
    "    path(\"missing/\", include(\"project.missing.urls\")),",
    "]"
  ].join("\n")
};

const INVALID_CHILD_PATH_FILES: FixtureFiles = {
  "project/__init__.py": "",
  "project/catalog/__init__.py": "",
  "project/catalog/urls.py": [
    "from django.urls import path",
    "",
    "def items(request):",
    "    return None",
    "",
    "urlpatterns = [path(\"items//\", items)]"
  ].join("\n"),
  "project/urls.py": [
    "from django.urls import include, path",
    "",
    "urlpatterns = [path(\"api/\", include(\"project.catalog.urls\"))]"
  ].join("\n")
};

const MISSING_PACKAGE_BOUNDARY_FILES: FixtureFiles = {
  "project/catalog/urls.py": [
    "from django.urls import path",
    "",
    "def items(request):",
    "    return None",
    "",
    "urlpatterns = [path(\"items/\", items)]"
  ].join("\n"),
  "project/urls.py": [
    "from django.urls import include, path",
    "from .catalog import urls as catalog_urls",
    "",
    "urlpatterns = [path(\"api/\", include(catalog_urls))]"
  ].join("\n")
};

function resolveFixture(files: FixtureFiles) {
  const sourceDocuments: SourceDocument[] = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath,
    absolutePath: `/django-urlconf-resolver-parity/${relativePath}`,
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

function importedDjangoUrlconfRouteEdges(result: ReturnType<typeof resolveFixture>) {
  return result.edges.filter(
    (edge) =>
      edge.kind === "routes" &&
      edge.evidence?.ruleId.startsWith("framework.django.") === true &&
      edge.evidence.ruleId.includes("include.")
  );
}

function routeNames(result: ReturnType<typeof resolveFixture>) {
  const symbolsById = new Map(result.symbols.map((symbol) => [symbol.id, symbol]));
  return importedDjangoUrlconfRouteEdges(result)
    .map((edge) => symbolsById.get(edge.sourceId)?.name ?? "")
    .sort();
}

describe("Django URLconf resolver pre-move parity golden", () => {
  it("preserves relative import, initializer re-export, and dotted literal URLConfs", () => {
    const result = resolveFixture(POSITIVE_FILES);
    const edges = importedDjangoUrlconfRouteEdges(result);
    const ruleIds = edges.map((edge) => edge.evidence?.ruleId ?? "");

    expect(edges).toHaveLength(3);
    expect(routeNames(result)).toEqual(["ALL /api/items/", "ALL /internal/items/", "ALL /v1/health/"]);
    expect(ruleIds).toContain("framework.django.imported-urlconf.path.include.local-function");
    expect(ruleIds).toContain("framework.django.reexported-urlconf.re-path.include.local-function");
    expect(ruleIds).toContain("framework.django.literal-urlconf.path.include.local-function");
    expect(edges.every((edge) => edge.resolution === "exact" && edge.targetId !== null && edge.confidence === 1)).toBe(true);
    expect(result).toMatchSnapshot();
  });

  it("keeps dynamic, malformed, and missing URLconf inclusions unresolved", () => {
    const result = resolveFixture(INVALID_INCLUSION_FILES);
    const edges = importedDjangoUrlconfRouteEdges(result);

    expect(edges.filter((edge) => edge.resolution === "exact")).toEqual([]);
    expect(edges.filter((edge) => edge.targetId !== null)).toEqual([]);
    expect(result).toMatchSnapshot();
  });

  it("rejects a child URL pattern with an invalid double-slash path", () => {
    const result = resolveFixture(INVALID_CHILD_PATH_FILES);
    const edges = importedDjangoUrlconfRouteEdges(result);

    expect(edges.filter((edge) => edge.resolution === "exact")).toEqual([]);
    expect(edges.filter((edge) => edge.targetId !== null)).toEqual([]);
    expect(result).toMatchSnapshot();
  });

  it("does not cross a missing regular-package boundary", () => {
    const result = resolveFixture(MISSING_PACKAGE_BOUNDARY_FILES);
    const edges = importedDjangoUrlconfRouteEdges(result);

    expect(edges.filter((edge) => edge.resolution === "exact")).toEqual([]);
    expect(edges.filter((edge) => edge.targetId !== null)).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
