import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("CSS B1 extraction", () => {
  it("retains stylesheet rules selectors custom properties and direct containment", () => {
    const facts = extractFileFacts({
      filePath: "web/site.css",
      language: "css",
      sourceText: [
        ":root { --tone: #123456; }",
        ".card:hover, #hero { color: var(--tone); display: grid; }"
      ].join("\n")
    });
    const resources = facts.symbols.filter((symbol) => symbol.kind === "resource");

    expect(facts.symbols[0]).toMatchObject({
      name: "site.css",
      qualifiedName: "web/site.css",
      kind: "file"
    });
    expect(resources.map((symbol) => symbol.name)).toEqual([
      ":root",
      ":root",
      "selector-kind:pseudo",
      "--tone",
      ".card:hover, #hero",
      ".card:hover",
      "selector-kind:class",
      "selector-kind:pseudo",
      "#hero",
      "selector-kind:id",
      "declaration-group:color",
      "declaration-group:layout"
    ]);
    expect(facts.pendingReferences).toEqual([]);
    expect(facts.edges).toHaveLength(resources.length);
    for (const edge of facts.edges) {
      expect(edge).toMatchObject({
        kind: "contains",
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: expect.stringMatching(/^syntax\.css\./u),
          stage: "syntax",
          candidateSymbolIds: [edge.targetId]
        }
      });
    }
  });

  it("fails closed to the file symbol for malformed CSS", () => {
    for (const sourceText of [
      ".card { color: red;",
      ".card { color: \"unterminated; }",
      ".card { color: red; } }",
      "/* unterminated .fake { color: red; }"
    ]) {
      const facts = extractFileFacts({ filePath: "web/broken.css", language: "css", sourceText });
      expect(facts.symbols.map(({ name, kind }) => ({ name, kind }))).toEqual([
        { name: "broken.css", kind: "file" }
      ]);
      expect(facts.edges).toEqual([]);
    }
  });

  it("retains bounded nested at-rules keyframes and complex selector classifications", () => {
    const facts = extractFileFacts({
      filePath: "web/depth.css",
      language: "css",
      sourceText: [
        "@layer components {",
        "  @media screen and (min-width: 48rem) {",
        '    article.card#feature[data-state="open"]:hover::before { display: grid; color: red; }',
        "  }",
        "}",
        "@supports (display: grid) { .grid > [data-cell] { display: grid; } }",
        "@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(1turn); } }"
      ].join("\n")
    });
    const names = facts.symbols.map((symbol) => symbol.name);

    expect(names).toContain("@layer components");
    expect(names).toContain("@media screen and (min-width: 48rem)");
    expect(names).toContain("@supports (display: grid)");
    expect(names).toContain("@keyframes spin");
    expect(names).toContain('article.card#feature[data-state="open"]:hover::before');
    expect(names).toEqual(expect.arrayContaining([
      "selector-kind:attribute",
      "selector-kind:class",
      "selector-kind:id",
      "selector-kind:pseudo",
      "selector-kind:pseudo-element",
      "selector-kind:type",
      "declaration-group:animation",
      "declaration-group:color",
      "declaration-group:layout"
    ]));
    expect(facts.edges).not.toHaveLength(0);
    expect(facts.edges.every((edge) => edge.kind === "contains")).toBe(true);
  });

  it("keeps comments strings URLs and var values opaque", () => {
    const facts = extractFileFacts({
      filePath: "web/opaque.css",
      language: "css",
      sourceText: [
        '/* .forged { --fake: red; } */',
        '.real, /* selector comment */ #actual {',
        '  --image: url("data:image/svg+xml,<svg></svg>");',
        '  content: ".not-a-selector";',
        '  background-image: var(--image);',
        '}'
      ].join("\n")
    });
    const names = facts.symbols.map((symbol) => symbol.name);

    expect(names).toContain(".real");
    expect(names).toContain("#actual");
    expect(names).toContain("--image");
    expect(names).not.toContain(expect.stringContaining("forged"));
    expect(names).not.toContain(expect.stringContaining("not-a-selector"));
    expect(facts.edges.every((edge) => edge.kind === "contains")).toBe(true);
    expect(facts.pendingReferences).toEqual([]);
  });

  it("does not misclassify pseudo names as type selectors", () => {
    const facts = extractFileFacts({
      filePath: "web/pseudo.css",
      language: "css",
      sourceText: ".btn::before, .item:hover { color: red; } article::first-letter { color: blue; }"
    });
    const semantics = facts.symbols
      .filter((symbol) => symbol.name.startsWith("selector-kind:"))
      .map((symbol) => symbol.name);

    expect(semantics.filter((name) => name === "selector-kind:type")).toHaveLength(1);
    expect(semantics).toEqual(expect.arrayContaining([
      "selector-kind:class",
      "selector-kind:pseudo",
      "selector-kind:pseudo-element",
      "selector-kind:type"
    ]));
  });

  it("fails closed for a 150-case malformed lexical matrix", () => {
    const malformed = Array.from({ length: 50 }, (_, index) => [
      `.broken-${index} { color: red;`,
      `.broken-${index} { content: "unterminated; }`,
      `/* unterminated-${index} .fake { color: red; }`
    ]).flat();

    expect(malformed).toHaveLength(150);
    for (const sourceText of malformed) {
      const facts = extractFileFacts({ filePath: "web/matrix.css", language: "css", sourceText });
      expect(facts.symbols).toHaveLength(1);
      expect(facts.symbols[0]?.kind).toBe("file");
      expect(facts.edges).toEqual([]);
    }
  });

  it("fails closed when selector property or nesting bounds are exceeded", () => {
    const sources = [
      `.${"x".repeat(2_049)} { color: red; }`,
      `${":is(".repeat(257)}.x${")".repeat(257)} { color: red; }`,
      `.x { ${"p".repeat(257)}: value; }`
    ];
    for (const sourceText of sources) {
      const facts = extractFileFacts({ filePath: "web/limits.css", language: "css", sourceText });
      expect(facts.symbols).toHaveLength(1);
      expect(facts.edges).toEqual([]);
    }
  });
});
