import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import type { PendingReference } from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";

// Retained pending-fact compatibility only: the current Ruby extractor does not
// emit this handler reference. This is not evidence of new Rails extraction.
function snapshot(controller: string | null) {
  const files = [{ path: "config/routes.rb", source: 'Rails.application.routes.draw do\n  get "/health", to: "health#show"\nend\n' },
    ...(controller === null ? [] : [{ path: "app/controllers/health_controller.rb", source: controller }])];
  const sourceDocuments = files.map((file) => ({ relativePath: file.path,
    absolutePath: `/rails-legacy/${file.path}`, language: "ruby" as const,
    sourceText: file.source, contentHash: createHash("sha256").update(file.source).digest("hex") }));
  const extractedFiles = sourceDocuments.map((file) => extractFileFacts({
    filePath: file.relativePath, language: file.language, sourceText: file.sourceText }));
  const route = extractedFiles[0]!.symbols.find((symbol) => symbol.kind === "route");
  expect(route).toBeDefined();
  const reference: PendingReference = { id: "rails-legacy-handler", sourceId: route!.id,
    filePath: "config/routes.rb", referenceName: "health#show", relationKind: "routes",
    routeFramework: "rails", range: route!.range };
  return resolveProjectFacts({ sourceDocuments, extractedFiles: extractedFiles.map((file, index) =>
    index === 0 ? { ...file, pendingReferences: [...file.pendingReferences, reference] } : file),
    indexedAt: "2026-09-09T00:00:00.000Z" });
}

describe("Rails retained-fact complete-output parity", () => {
  it("preserves conventional controller and method resolution", () => {
    const result = snapshot("class HealthController\n  def show\n    :ok\n  end\nend\n");
    expect(result.edges.filter((edge) => edge.kind === "routes" && edge.resolution === "exact")).toHaveLength(1);
    expect(result).toMatchSnapshot();
  });
  it("preserves missing controller nonclaim", () => {
    const result = snapshot(null);
    expect(result.edges.filter((edge) => edge.kind === "routes" && edge.resolution === "exact")).toEqual([]);
    expect(result).toMatchSnapshot();
  });
  it("preserves missing action nonclaim", () => {
    const result = snapshot("class HealthController\n  def other\n    :ok\n  end\nend\n");
    expect(result.edges.filter((edge) => edge.kind === "routes" && edge.resolution === "exact")).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
