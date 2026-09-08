import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

const INDEXED_AT = "2026-09-09T00:00:00.000Z";

type FixtureFiles = Readonly<Record<string, string>>;

const POSITIVE_FILES: FixtureFiles = {
  "app/__init__.py": "",
  "app/routes/__init__.py": [
    "from .catalog import catalog as public_blueprint",
    "from app.routes.admin import blueprint as absolute_blueprint"
  ].join("\n"),
  "app/routes/catalog.py": [
    "from flask import Blueprint",
    "catalog = Blueprint(\"catalog\", __name__, url_prefix=\"/catalog\")",
    "",
    "@catalog.get(\"/items\")",
    "def items():",
    "    return []",
    "",
    "@catalog.post(\"/orders\")",
    "def orders():",
    "    return {\"ok\": True}"
  ].join("\n"),
  "app/routes/admin.py": [
    "from flask import Blueprint",
    "blueprint = Blueprint(\"admin\", __name__, url_prefix=\"/admin\")",
    "",
    "@blueprint.delete(\"/users\")",
    "def delete_users():",
    "    return {\"ok\": True}"
  ].join("\n"),
  "app/main.py": [
    "from flask import Flask",
    "from .routes.catalog import catalog as direct_blueprint",
    "from .routes import public_blueprint",
    "from app.routes.admin import blueprint as absolute_direct_blueprint",
    "from app.routes import absolute_blueprint",
    "app = Flask(__name__)",
    "app.register_blueprint(direct_blueprint, url_prefix=\"/direct\")",
    "app.register_blueprint(public_blueprint, url_prefix=\"/relative-reexport\")",
    "app.register_blueprint(absolute_direct_blueprint, url_prefix=\"/absolute\")",
    "app.register_blueprint(absolute_blueprint, url_prefix=\"/absolute-reexport\")"
  ].join("\n")
};

const MISSING_OR_UNSUPPORTED_FILES: FixtureFiles = {
  "app/__init__.py": "",
  "app/routes/__init__.py": "from .missing import blueprint as missing_blueprint",
  "app/routes/dynamic.py": [
    "from flask import Blueprint",
    "prefix = \"/dynamic\"",
    "blueprint = Blueprint(\"dynamic\", __name__, url_prefix=prefix)",
    "",
    "@blueprint.get(\"/dynamic\")",
    "def dynamic():",
    "    return {\"ok\": True}"
  ].join("\n"),
  "app/main.py": [
    "from flask import Flask",
    "from .routes.missing import blueprint as missing_direct",
    "from .routes import missing_blueprint",
    "from .routes.dynamic import blueprint as dynamic_blueprint",
    "prefix = \"/dynamic\"",
    "app = Flask(__name__)",
    "app.register_blueprint(missing_direct, url_prefix=\"/missing-direct\")",
    "app.register_blueprint(missing_blueprint, url_prefix=\"/missing-reexport\")",
    "app.register_blueprint(dynamic_blueprint, url_prefix=prefix)"
  ].join("\n")
};

const MISSING_PACKAGE_BOUNDARY_FILES: FixtureFiles = {
  "app/routes/__init__.py": "",
  "app/routes/catalog.py": [
    "from flask import Blueprint",
    "catalog = Blueprint(\"catalog\", __name__, url_prefix=\"/catalog\")",
    "",
    "@catalog.get(\"/items\")",
    "def items():",
    "    return []"
  ].join("\n"),
  "app/main.py": [
    "from flask import Flask",
    "from .routes.catalog import catalog",
    "app = Flask(__name__)",
    "app.register_blueprint(catalog, url_prefix=\"/api\")"
  ].join("\n")
};

function resolveFixture(files: FixtureFiles) {
  const sourceDocuments: SourceDocument[] = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath,
    absolutePath: `/flask-resolver-parity/${relativePath}`,
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

function importedFlaskRouteEdges(result: ReturnType<typeof resolveFixture>) {
  return result.edges.filter(
    (edge) =>
      edge.kind === "routes" &&
      edge.evidence?.ruleId.startsWith("framework.flask.") === true &&
      edge.evidence.ruleId.includes(".register-blueprint.")
  );
}

describe("Flask Blueprint resolver pre-move parity golden", () => {
  it("preserves relative, absolute, and initializer re-export Blueprint routes", () => {
    const result = resolveFixture(POSITIVE_FILES);
    const edges = importedFlaskRouteEdges(result);
    const ruleIds = edges.map((edge) => edge.evidence?.ruleId ?? "");

    expect(edges).toHaveLength(6);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.flask.imported-blueprint."))).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.flask.project-absolute-blueprint."))).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.flask.reexported-blueprint."))).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.flask.project-absolute-reexported-blueprint."))).toBe(true);
    expect(edges.every((edge) => edge.resolution === "exact" && edge.targetId !== null && edge.confidence === 1)).toBe(true);
    expect(result).toMatchSnapshot();
  });

  it("keeps missing and dynamic Blueprint targets unresolved", () => {
    const result = resolveFixture(MISSING_OR_UNSUPPORTED_FILES);
    const edges = importedFlaskRouteEdges(result);

    expect(edges.filter((edge) => edge.resolution === "exact")).toEqual([]);
    expect(edges.filter((edge) => edge.targetId !== null)).toEqual([]);
    expect(result).toMatchSnapshot();
  });

  it("does not cross a missing regular-package boundary", () => {
    const result = resolveFixture(MISSING_PACKAGE_BOUNDARY_FILES);
    const edges = importedFlaskRouteEdges(result);

    expect(edges.filter((edge) => edge.resolution === "exact")).toEqual([]);
    expect(edges.filter((edge) => edge.targetId !== null)).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
