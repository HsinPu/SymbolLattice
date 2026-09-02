import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { ArtifactLanguage } from "../../../src/domain/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

function document(
  relativePath: string,
  language: ArtifactLanguage,
  sourceText: string
): SourceDocument {
  return {
    absolutePath: `C:/project/${relativePath}`,
    relativePath,
    language,
    sourceText,
    contentHash: `${language}:${relativePath}:${sourceText.length}`
  };
}

function snapshot(documents: readonly SourceDocument[]) {
  return resolveProjectFacts({
    sourceDocuments: documents,
    extractedFiles: documents.map((source) =>
      extractFileFacts({
        filePath: source.relativePath,
        language: source.language,
        sourceText: source.sourceText
      })
    ),
    indexedAt: "2026-08-26T00:00:00.000Z"
  });
}

describe("Markdown project file references", () => {
  it("resolves exact relative Markdown and code links from their owning section", () => {
    const graph = snapshot([
      document(
        "README.md",
        "markdown",
        [
          "See [guide](docs/guide.md?view=full#install).",
          "# Architecture",
          "Read [implementation](src/index.ts)."
        ].join("\n")
      ),
      document("docs/guide.md", "markdown", "# Guide\n"),
      document("src/index.ts", "typescript", "export const ready = true;\n")
    ]);
    const references = graph.edges.filter((edge) => edge.kind === "references");

    expect(references).toHaveLength(2);
    expect(references.every((edge) => edge.resolution === "exact" && edge.confidence === 1)).toBe(true);
    const byReferenceName = new Map(references.map((edge) => [edge.referenceName, edge]));
    const guide = byReferenceName.get("docs/guide.md?view=full#install");
    const implementation = byReferenceName.get("src/index.ts");
    for (const edge of references) {
      expect(edge.evidence).toEqual({
        ruleId: "syntax.markdown.inline-link.literal-project-file.exact-target",
        stage: "module",
        candidateSymbolIds: [edge.targetId]
      });
    }
    expect(graph.symbols.find((symbol) => symbol.id === guide?.sourceId)?.kind).toBe("file");
    expect(graph.symbols.find((symbol) => symbol.id === implementation?.sourceId)?.kind).toBe("resource");
    expect(graph.symbols.find((symbol) => symbol.id === guide?.targetId)?.filePath).toBe("docs/guide.md");
    expect(graph.symbols.find((symbol) => symbol.id === implementation?.targetId)?.filePath).toBe("src/index.ts");
  });

  it("keeps admitted missing targets unresolved and omits unsupported link forms", () => {
    const graph = snapshot([
      document(
        "docs/guide.md",
        "markdown",
        [
          "# Guide",
          "[missing](missing.md)",
          "[external](https://example.com/guide.md)",
          "[root](/README.md)",
          "[extensionless](other)",
          "![image](asset.png)",
          "[reference][target]",
          "[target]: other.md",
          "`[code](other.md)`",
          "[encoded](other%20file.md)",
          "[escaped](..\\README.md)"
        ].join("\n")
      )
    ]);
    const references = graph.edges.filter((edge) => edge.kind === "references");

    expect(references).toHaveLength(2);
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      referenceName: "missing.md",
      evidence: {
        ruleId: "syntax.markdown.inline-link.literal-project-file.unresolved-target",
        stage: "module",
        candidateSymbolIds: []
      }
      }),
      expect.objectContaining({
        targetId: null,
        resolution: "unresolved",
        confidence: 0,
        referenceName: "other.md",
        evidence: {
          ruleId: "syntax.markdown.reference-link.literal-project-file.unresolved-target",
          stage: "module",
          candidateSymbolIds: []
        }
      })
    ]));
  });
});
