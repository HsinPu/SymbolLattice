import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

type Fixture = { path: string; language: SourceDocument["language"]; source: string };
const files: Fixture[] = [
  { path: "conf/routes", language: "scala", source: "GET /health controllers.HealthController.health\n-> /api api.Routes\n" },
  { path: "app/controllers/HealthController.java", language: "java", source: 'package controllers; public class HealthController { public String health() { return "ok"; } }' },
  { path: "app/api/Routes.scala", language: "scala", source: "package api\nclass Routes {}\n" }
];

function snapshot(admitted: Fixture[]) {
  const sourceDocuments = admitted.map((file) => ({
    relativePath: file.path, absolutePath: `/play-parity/${file.path}`, language: file.language,
    sourceText: file.source, contentHash: createHash("sha256").update(file.source).digest("hex")
  }));
  return resolveProjectFacts({ sourceDocuments,
    extractedFiles: sourceDocuments.map((file) => extractFileFacts({ filePath: file.relativePath,
      language: file.language, sourceText: file.sourceText })), indexedAt: "2026-09-09T00:00:00.000Z" });
}

describe("Play complete-output parity before move", () => {
  it("preserves controller routes and router mount evidence", () => {
    const result = snapshot(files);
    for (const kind of ["routes", "handles"]) {
      const edges = result.edges.filter((edge) => edge.kind === kind && edge.resolution === "exact");
      expect(edges).toHaveLength(1);
      expect(edges[0]?.confidence).toBe(1);
      const evidenceSymbols = result.symbols.filter((symbol) =>
        kind === "routes" ? symbol.filePath === "app/controllers/HealthController.java" && ["class", "method"].includes(symbol.kind)
          : symbol.filePath === "app/api/Routes.scala" && symbol.kind === "class");
      expect([...(edges[0]?.evidence?.candidateSymbolIds ?? [])].sort()).toEqual(evidenceSymbols.map((symbol) => symbol.id).sort());
      expect(edges[0]?.evidence?.ruleId).toBe(kind === "routes"
        ? "framework.play.conf-routes.literal-controller-action.package-class-method"
        : "framework.play.conf-routes.literal-router-mount.package-class");
    }
    expect(result).toMatchSnapshot();
  });
  it("preserves missing controller and router nonclaim", () => {
    const result = snapshot(files.slice(0, 1));
    expect(result.edges.filter((edge) => ["routes", "handles"].includes(edge.kind) && edge.resolution === "exact")).toEqual([]);
    expect(result).toMatchSnapshot();
  });
  it("preserves ambiguous controller and router nonclaim", () => {
    const result = snapshot([...files, ...files.slice(1).map((file) => ({ ...file, path: `duplicate/${file.path}` }))]);
    expect(result.edges.filter((edge) => ["routes", "handles"].includes(edge.kind) && edge.resolution === "exact")).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
