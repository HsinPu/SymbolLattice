import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("HTML B1 extraction", () => {
  it("retains parser-proven elements and their direct containment hierarchy", () => {
    const facts = extractFileFacts({
      filePath: "web/index.html",
      language: "html",
      sourceText: [
        "<!doctype html>",
        '<html lang="en">',
        "  <body>",
        '    <main id="app">',
        "      <h1>Welcome</h1>",
        '      <img src="logo.png">',
        "    </main>",
        "  </body>",
        "</html>"
      ].join("\n")
    });
    const symbol = (qualifiedName: string) =>
      facts.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const file = symbol("web/index.html");
    const html = symbol("web/index.html#html-element:html[1]");
    const body = symbol("web/index.html#html-element:html[1]/body[1]");
    const main = symbol("web/index.html#html-element:html[1]/body[1]/main[1]");
    const heading = symbol("web/index.html#html-element:html[1]/body[1]/main[1]/h1[1]");
    const image = symbol("web/index.html#html-element:html[1]/body[1]/main[1]/img[1]");

    expect(facts.symbols.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "index.html", kind: "file" },
      { name: "html", kind: "resource" },
      { name: "body", kind: "resource" },
      { name: "main", kind: "resource" },
      { name: "h1", kind: "resource" },
      { name: "img", kind: "resource" }
    ]);
    expect(facts.edges).toEqual([
      expect.objectContaining({ sourceId: file?.id, targetId: html?.id }),
      expect.objectContaining({ sourceId: html?.id, targetId: body?.id }),
      expect.objectContaining({ sourceId: body?.id, targetId: main?.id }),
      expect.objectContaining({ sourceId: main?.id, targetId: heading?.id }),
      expect.objectContaining({ sourceId: main?.id, targetId: image?.id })
    ]);
    for (const edge of facts.edges) {
      expect(edge).toMatchObject({
        kind: "contains",
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: expect.stringMatching(/^syntax\.html\.(?:root|direct-child)-element$/u),
          stage: "syntax",
          candidateSymbolIds: [edge.targetId]
        }
      });
    }
  });

  it("keeps script and style contents opaque instead of forging nested elements", () => {
    const facts = extractFileFacts({
      filePath: "web/assets.htm",
      language: "html",
      sourceText: [
        "<html><head>",
        '  <script>const fake = "<section></section>";</script>',
        "  <style>.card::before { content: '<aside>'; }</style>",
        "</head></html>"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => symbol.name)).toEqual([
      "assets.htm",
      "html",
      "head",
      "script",
      "style"
    ]);
  });

  it("keeps textarea and title RCDATA opaque while retaining surrounding elements", () => {
    const facts = extractFileFacts({
      filePath: "web/editor.html",
      language: "html",
      sourceText: [
        "<html><head><title>Teach <strong> tags</title></head><body>",
        '  <textarea>😀 <p>Example</p>\nconst small = value < 5;</textarea>',
        "  <main>Visible</main>",
        "</body></html>"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => symbol.name)).toEqual([
      "editor.html",
      "html",
      "head",
      "title",
      "body",
      "textarea",
      "main"
    ]);
    expect(facts.edges).toHaveLength(6);
  });

  it("fails closed to the file symbol for malformed or unsupported element structure", () => {
    for (const sourceText of [
      '<div id="unterminated></div>',
      "<div><span></div>",
      "<script>const value = 1",
      "<p><div></p></div>",
      "<table><tr><td></tr></td></table>",
      "<html><head><body></head></body></html>",
      "<div><p></div>",
      "<li>one<li>two"
    ]) {
      const facts = extractFileFacts({
        filePath: "web/broken.html",
        language: "html",
        sourceText
      });

      expect(facts.symbols, sourceText).toHaveLength(1);
      expect(facts.symbols[0]?.kind, sourceText).toBe("file");
      expect(facts.edges, sourceText).toEqual([]);
    }
  });

  it("bounds adversarial element depth before producing exact containment", () => {
    const depth = 257;
    const sourceText = `${"<div>".repeat(depth)}${"</div>".repeat(depth)}`;
    const facts = extractFileFacts({
      filePath: "web/deep.html",
      language: "html",
      sourceText
    });

    expect(facts.symbols).toHaveLength(1);
    expect(facts.edges).toEqual([]);
  });
});
