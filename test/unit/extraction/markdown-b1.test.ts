import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";
import { MAXIMUM_MARKDOWN_HEADING_LENGTH } from "../../../src/extraction/markdown.js";

describe("Markdown B1 extraction", () => {
  it("retains ATX and Setext headings with their direct section hierarchy", () => {
    const facts = extractFileFacts({
      filePath: "docs/guide.md",
      language: "markdown" as never,
      sourceText: [
        "# Guide",
        "",
        "## Install",
        "",
        "### Windows",
        "",
        "## Usage",
        "",
        "Appendix",
        "--------"
      ].join("\n")
    });
    const file = facts.symbols.find((symbol) => symbol.kind === "file");
    const headings = facts.symbols.filter((symbol) => symbol.kind === "resource");

    expect(headings.map((symbol) => symbol.name)).toEqual([
      "Guide",
      "Install",
      "Windows",
      "Usage",
      "Appendix"
    ]);
    const byName = new Map(headings.map((symbol) => [symbol.name, symbol]));
    expect(facts.edges).toEqual([
      expect.objectContaining({ sourceId: file?.id, targetId: byName.get("Guide")?.id }),
      expect.objectContaining({ sourceId: byName.get("Guide")?.id, targetId: byName.get("Install")?.id }),
      expect.objectContaining({ sourceId: byName.get("Install")?.id, targetId: byName.get("Windows")?.id }),
      expect.objectContaining({ sourceId: byName.get("Guide")?.id, targetId: byName.get("Usage")?.id }),
      expect.objectContaining({ sourceId: byName.get("Guide")?.id, targetId: byName.get("Appendix")?.id })
    ]);
    for (const edge of facts.edges) {
      expect(edge).toMatchObject({
        kind: "contains",
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: "syntax.markdown.heading-hierarchy",
          stage: "syntax",
          candidateSymbolIds: [edge.targetId]
        }
      });
    }
  });

  it("keeps fenced indented inline-code and HTML content opaque", () => {
    const facts = extractFileFacts({
      filePath: "docs/opaque.markdown",
      language: "markdown" as never,
      sourceText: [
        "# Visible",
        "```md",
        "## Fake fence",
        "[fake](../src/fake.ts)",
        "```",
        "    ## Fake indented",
        "`[fake](../src/inline.ts)`",
        "<div>",
        "## Fake HTML",
        "[fake](../src/html.ts)",
        "</div>",
        "",
        "## Real"
      ].join("\n")
    });

    expect(
      facts.symbols.filter((symbol) => symbol.kind === "resource").map((symbol) => symbol.name)
    ).toEqual(["Visible", "Real"]);
    expect(facts).toMatchObject({ markdownFacts: { links: [] } });
  });

  it("normalizes bounded local destinations while omitting unsafe or unsupported forms", () => {
    const facts = extractFileFacts({
      filePath: "docs/guides/setup.md",
      language: "markdown" as never,
      sourceText: [
        "[root](../../README.md)",
        "# Setup",
        "[api](../api.md#client)",
        "[self](./setup.md?raw=1)",
        "[escape](../../../outside.md)",
        "[root-relative](/README.md)",
        "[extensionless](../api)",
        "[encoded](../api%20guide.md)"
      ].join("\n")
    });

    expect(facts.markdownFacts?.links.map((link) => [link.referenceName, link.targetFilePath])).toEqual([
      ["../../README.md", "README.md"],
      ["../api.md#client", "docs/api.md"],
      ["./setup.md?raw=1", "docs/guides/setup.md"]
    ]);
    const file = facts.symbols.find((symbol) => symbol.kind === "file");
    const heading = facts.symbols.find((symbol) => symbol.name === "Setup");
    expect(facts.markdownFacts?.links.map((link) => link.sourceId)).toEqual([
      file?.id,
      heading?.id,
      heading?.id
    ]);
  });

  it("treats an unclosed fence as opaque through end of file", () => {
    const facts = extractFileFacts({
      filePath: "docs/unclosed.md",
      language: "markdown" as never,
      sourceText: ["# Visible", "```md", "## Hidden", "[hidden](other.md)"].join("\n")
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "resource").map((symbol) => symbol.name)).toEqual([
      "Visible"
    ]);
    expect(facts.markdownFacts?.links).toEqual([]);
  });

  it("fails closed to the file when a heading exceeds the bounded contract", () => {
    const facts = extractFileFacts({
      filePath: "docs/oversized.md",
      language: "markdown" as never,
      sourceText: `# ${"x".repeat(MAXIMUM_MARKDOWN_HEADING_LENGTH + 1)}\n## Fake\n`
    });

    expect(facts.symbols).toHaveLength(1);
    expect(facts.symbols[0]?.kind).toBe("file");
    expect(facts.edges).toEqual([]);
    expect(facts.markdownFacts?.links).toEqual([]);
  });
});
