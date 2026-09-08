import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

type Fixture = { path: string; language: SourceDocument["language"]; source: string };
const consumer: Fixture = { path: "src/user.ts", language: "typescript", source:
  'import { Resolver } from "@nestjs/graphql";\nclass User {}\n@Resolver(() => User)\nclass UserResolver {}\n' };
const schema: Fixture = { path: "schema.graphql", language: "graphql", source: "type User { id: ID! }\n" };
function snapshot(files: Fixture[]) {
  const sourceDocuments = files.map((file) => ({ relativePath: file.path, absolutePath: `/nest-parity/${file.path}`,
    language: file.language, sourceText: file.source, contentHash: createHash("sha256").update(file.source).digest("hex") }));
  return resolveProjectFacts({ sourceDocuments, extractedFiles: sourceDocuments.map((file) => extractFileFacts({
    filePath: file.relativePath, language: file.language, sourceText: file.sourceText })), indexedAt: "2026-09-09T00:00:00.000Z" });
}
describe("Nest GraphQL complete-output parity before move", () => {
  it.each(["unique", "missing", "duplicate"])("preserves %s schema evidence", (mode) => {
    const result = snapshot(mode === "missing" ? [consumer] : mode === "unique" ? [consumer, schema]
      : [consumer, schema, { ...schema, path: "duplicate.graphql" }]);
    const edges = result.edges.filter((edge) => edge.evidence?.ruleId.startsWith("framework.nestjs.graphql.resolver-schema."));
    expect(edges).toHaveLength(1);
    expect(edges[0]?.resolution).toBe(mode === "unique" ? "heuristic" : "unresolved");
    expect(edges[0]?.confidence).toBe(mode === "unique" ? 0.85 : 0);
    expect(edges[0]?.evidence?.candidateSymbolIds).toHaveLength(mode === "unique" ? 1 : mode === "missing" ? 0 : 2);
    expect(edges[0]?.evidence?.ruleId).toBe(`framework.nestjs.graphql.resolver-schema.${mode === "unique" ? "unique" : mode === "missing" ? "unresolved" : "ambiguous"}-object-type`);
    expect(result).toMatchSnapshot();
  });
});
