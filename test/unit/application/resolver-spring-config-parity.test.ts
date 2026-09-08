import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

type Fixture = { path: string; language: SourceDocument["language"]; source: string };
const consumer: Fixture = { path: "src/AppConfig.java", language: "java", source: [
  "import org.springframework.beans.factory.annotation.Value;",
  "import org.springframework.boot.context.properties.ConfigurationProperties;",
  '@ConfigurationProperties(prefix = "app.cache")',
  "class AppConfig {",
  '  @Value("${server.port}") private String port;',
  '  @Value("${app.clientName}") private String client;',
  "}"
].join("\n") };
const config: Fixture = { path: "src/main/resources/application.properties", language: "properties",
  source: "server.port=8080\napp.client-name=demo\napp.cache.size=10\n" };

function snapshot(files: Fixture[]) {
  const sourceDocuments = files.map((file) => ({ relativePath: file.path, absolutePath: `/spring-parity/${file.path}`,
    language: file.language, sourceText: file.source, contentHash: createHash("sha256").update(file.source).digest("hex") }));
  return resolveProjectFacts({ sourceDocuments, extractedFiles: sourceDocuments.map((file) => extractFileFacts({
    filePath: file.relativePath, language: file.language, sourceText: file.sourceText })), indexedAt: "2026-09-09T00:00:00.000Z" });
}

describe("Spring configuration complete-output parity before move", () => {
  it("preserves exact literals and separate relaxed/prefix heuristic confidence", () => {
    const result = snapshot([consumer, config]);
    const edges = result.edges.filter((edge) => edge.evidence?.ruleId.startsWith("framework.spring-boot."));
    expect(edges.map((edge) => [edge.referenceName, edge.resolution, edge.confidence]).sort()).toEqual([
      ["app.cache:app.cache.size", "heuristic", 0.85], ["app.clientName", "heuristic", 0.75], ["server.port", "exact", 1]
    ]);
    expect(result).toMatchSnapshot();
  });
  it("preserves profile collision nonclaim without choosing precedence", () => {
    const result = snapshot([consumer, config, { ...config, path: "src/main/resources/application-prod.properties" }]);
    const edges = result.edges.filter((edge) => edge.evidence?.ruleId.startsWith("framework.spring-boot."));
    expect(edges).toHaveLength(3);
    expect(edges.every((edge) => edge.resolution === "unresolved" && edge.targetId === null)).toBe(true);
    expect(result).toMatchSnapshot();
  });
  it("preserves missing configuration nonclaim", () => {
    const result = snapshot([consumer]);
    const edges = result.edges.filter((edge) => edge.evidence?.ruleId.startsWith("framework.spring-boot."));
    expect(edges).toHaveLength(3);
    expect(edges.every((edge) => edge.resolution === "unresolved" && edge.targetId === null)).toBe(true);
    expect(result).toMatchSnapshot();
  });
});
