import { describe, expect, it } from "vitest";

import {
  MARKDOWN_POSITIVE_QUOTAS,
  scoreMarkdownSelection,
  strictMarkdownTruth
} from "../../../benchmarks/markdown/correctness-oracle.mjs";

describe("Markdown large-project correctness oracle", () => {
  it("derives ATX, Setext, hierarchy, and unique relative-file references independently", () => {
    const truth = strictMarkdownTruth("docs/guide.md", [
      "# Guide",
      "",
      "## Install",
      "Windows",
      "-------",
      "",
      "[Source](../src/main.rs#entry)",
      "",
      "### Usage",
      "[Other](./other.md?view=full)"
    ].join("\n"), { knownFiles: new Set(["docs/guide.md", "src/main.rs", "docs/other.md"]) });

    expect(truth?.headings.map((heading) => [heading.name, heading.level])).toEqual([
      ["Guide", 1],
      ["Install", 2],
      ["Windows", 2],
      ["Usage", 3]
    ]);
    expect(truth?.containments.map((fact) => [fact.source.name, fact.target.name])).toEqual([
      ["docs/guide.md", "Guide"],
      ["Guide", "Install"],
      ["Guide", "Windows"],
      ["Windows", "Usage"]
    ]);
    expect(truth?.references.map((fact) => [fact.source.name, fact.target.filePath, fact.referenceName])).toEqual([
      ["Windows", "src/main.rs", "../src/main.rs#entry"],
      ["Usage", "docs/other.md", "./other.md?view=full"]
    ]);
  });

  it("keeps fenced, indented, inline-code, and HTML blocks opaque", () => {
    const truth = strictMarkdownTruth("docs/opaque.md", [
      "# Visible",
      "```md",
      "## Fake fence",
      "[fake](../src/fake.ts)",
      "```",
      "    ## Fake indented",
      "`[fake](../src/inline.ts)`",
      "<!--",
      "## Fake comment",
      "[fake](../src/comment.ts)",
      "-->",
      "<div>",
      "## Fake HTML",
      "[fake](../src/html.ts)",
      "</div>",
      "",
      "## Real"
    ].join("\n"), { knownFiles: new Set(["docs/opaque.md", "src/fake.ts", "src/inline.ts", "src/html.ts"]) });

    expect(truth?.headings.map((heading) => heading.name)).toEqual(["Visible", "Real"]);
    expect(truth?.references).toEqual([]);
  });

  it("fails closed for unclosed inline code, malformed nested links, and lowercase doctype blocks", () => {
    expect(strictMarkdownTruth("unclosed.md", "`[hidden](target.md)\n[still-hidden](target.md)", {
      knownFiles: new Set(["unclosed.md", "target.md"])
    })?.references).toEqual([]);
    expect(strictMarkdownTruth("nested.md", "[outer [inner](target.md)](outer.md)", {
      knownFiles: new Set(["nested.md", "target.md", "outer.md"])
    })?.references).toEqual([]);
    expect(strictMarkdownTruth("doctype.md", "<!doctype html>\n[hidden](target.md)\n\n[visible](target.md)", {
      knownFiles: new Set(["doctype.md", "target.md"])
    })?.references.map((fact) => fact.referenceName)).toEqual(["target.md"]);
  });

  it("rejects recovery-dependent input and unsupported destinations", () => {
    expect(strictMarkdownTruth("bad.md", "~~~\n# hidden")).toBeNull();
    const truth = strictMarkdownTruth("links.md", [
      "[external](https://example.test/docs.md)",
      "[anchor](#section)",
      "![image](image.png)",
      "[dynamic](${DOC_PATH})"
    ].join("\n"), { knownFiles: new Set(["links.md", "image.png"]) });
    expect(truth?.references).toEqual([]);
  });

  it("keeps the approved quota contract and exact evidence scorer deterministic", () => {
    expect(MARKDOWN_POSITIVE_QUOTAS).toEqual({ file: 50, heading: 100, containment: 100, reference: 50 });
    const selection = [{
      project: "fixture",
      stratum: "file",
      kind: "identity",
      target: { filePath: "README.md", name: "README.md", kind: "file", line: 1, column: 1 },
      source: null,
      occurrence: { filePath: "README.md", line: 1, column: 1 }
    }];
    const snapshot = { symbols: [{ id: "file", filePath: "README.md", name: "README.md", qualifiedName: "README.md", kind: "file", range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } }], edges: [] };
    expect(scoreMarkdownSelection(selection, new Map([["fixture", snapshot]])).scores).toMatchObject({ tp: 1, fp: 0, fn: 0, evidenceInvalid: 0 });
  });
});
