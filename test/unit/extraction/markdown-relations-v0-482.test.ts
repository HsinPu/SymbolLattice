import { describe, expect, it } from "vitest";

import { extractMarkdownFileFacts } from "../../../src/extraction/markdown.js";

describe("Markdown reference links v0.482", () => {
  it("extracts unique reference and collapsed-reference links with local destinations", () => {
    const facts = extractMarkdownFileFacts({
      filePath: "docs/index.md",
      language: "markdown",
      sourceText: [
        "# Guide",
        "",
        "[read][Guide Link]",
        "[Guide Link][]",
        "[external][external]",
        "[duplicate][dup]",
        "",
        "[Guide Link]: guide.md \"title\"",
        "[external]: https://example.com/guide.md",
        "[dup]: first.md",
        "[dup]: second.md",
        ""
      ].join("\n")
    });

    expect(facts.markdownFacts?.links).toHaveLength(2);
    expect(facts.markdownFacts?.links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKind: "reference",
        targetFilePath: "docs/guide.md",
        referenceName: "guide.md"
      })
    ]));
  });

  it("normalizes labels, ignores definitions in opaque blocks, and fails closed on duplicates", () => {
    const facts = extractMarkdownFileFacts({
      filePath: "docs/index.md",
      language: "markdown",
      sourceText: [
        "[ok][  GUIDE   LINK ]",
        "```md",
        "[guide link]: hidden.md",
        "[ok][guide link]",
        "```",
        "[ok][guide link]",
        "[guide link]: visible.md",
        "[guide link]: duplicate.md",
        ""
      ].join("\n")
    });

    expect(facts.markdownFacts?.links).toEqual([]);
  });
});
