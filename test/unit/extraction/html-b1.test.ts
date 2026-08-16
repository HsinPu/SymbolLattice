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
    const elementIds = new Set([html, body, main, heading, image].map((candidate) => candidate?.id));

    expect(
      facts.symbols
        .filter((candidate) => candidate.kind === "file" || elementIds.has(candidate.id))
        .map(({ name, kind }) => ({ name, kind }))
    ).toEqual([
      { name: "index.html", kind: "file" },
      { name: "html", kind: "resource" },
      { name: "body", kind: "resource" },
      { name: "main", kind: "resource" },
      { name: "h1", kind: "resource" },
      { name: "img", kind: "resource" }
    ]);
    expect(facts.edges.filter((candidate) => elementIds.has(candidate.targetId ?? ""))).toEqual([
      expect.objectContaining({ sourceId: file?.id, targetId: html?.id }),
      expect.objectContaining({ sourceId: html?.id, targetId: body?.id }),
      expect.objectContaining({ sourceId: body?.id, targetId: main?.id }),
      expect.objectContaining({ sourceId: main?.id, targetId: heading?.id }),
      expect.objectContaining({ sourceId: main?.id, targetId: image?.id })
    ]);
    for (const edge of facts.edges.filter((candidate) => elementIds.has(candidate.targetId ?? ""))) {
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

  it("exposes bounded static attributes as exact element resources without URL linking", () => {
    const facts = extractFileFacts({
      filePath: "web/depth.html",
      language: "html",
      sourceText: [
        '<html lang="zh-Hant">',
        '  <body><main id="app" class="shell wide" role="main" data-state="ready" aria-label="內容">',
        '    <input name="query" type="search" placeholder="搜尋" required disabled="disabled">',
        '    <a href="other.html"><img src="logo.svg" alt="品牌"></a>',
        "  </main></body>",
        "</html>"
      ].join("\n")
    });
    const attributes = facts.symbols
      .filter((symbol) => symbol.qualifiedName.includes("#html-attribute:"))
      .map((symbol) => symbol.name);

    expect(attributes).toEqual([
      "lang=zh-Hant",
      "id=app",
      "class=shell wide",
      "role=main",
      "data-state=ready",
      "aria-label=內容",
      "name=query",
      "type=search",
      "placeholder=搜尋",
      "required",
      "disabled=disabled",
      "alt=品牌"
    ]);
    expect(attributes).not.toContain("href=other.html");
    expect(attributes).not.toContain("src=logo.svg");
    for (const symbol of facts.symbols.filter((candidate) =>
      candidate.qualifiedName.includes("#html-attribute:")
    )) {
      expect(facts.edges).toContainEqual(
        expect.objectContaining({
          targetId: symbol.id,
          kind: "contains",
          resolution: "exact",
          confidence: 1,
          evidence: {
            ruleId: "syntax.html.static-attribute",
            stage: "syntax",
            candidateSymbolIds: [symbol.id]
          }
        })
      );
    }
  });

  it("omits template-valued attributes without forging dependent diagnostics", () => {
    const facts = extractFileFacts({
      filePath: "web/template-values.html",
      language: "html",
      sourceText: [
        '<html lang="{{ locale }}"><body>',
        '<main id="${dynamicId}" aria-label="<%= label %>"><img alt="{% imageAlt %}"></main>',
        "</body></html>"
      ].join("\n")
    });
    const deepNames = facts.symbols
      .filter((symbol) => /#html-(?:attribute|diagnostic):/u.test(symbol.qualifiedName))
      .map((symbol) => symbol.name);

    expect(deepNames).not.toContain("lang={{ locale }}");
    expect(deepNames).not.toContain("id=${dynamicId}");
    expect(deepNames).not.toContain("aria-label=<%= label %>");
    expect(deepNames).not.toContain("alt={% imageAlt %}");
    expect(deepNames).not.toContain("diagnostic:html-missing-lang");
    expect(deepNames).not.toContain("diagnostic:image-missing-alt");
  });

  it("classifies local heading landmark form table and list semantics", () => {
    const facts = extractFileFacts({
      filePath: "web/semantics.html",
      language: "html",
      sourceText: [
        "<html><body><header></header><nav></nav><main>",
        "<h2>Title</h2><form><button>Save</button><select></select></form>",
        "<table><tbody><tr><th>Key</th><td>Value</td></tr></tbody></table>",
        "<ul><li>One</li></ul>",
        "</main><footer></footer></body></html>"
      ].join("\n")
    });

    expect(
      facts.symbols
        .filter((symbol) => symbol.qualifiedName.includes("#html-semantic:"))
        .map((symbol) => symbol.name)
    ).toEqual([
      "landmark:header",
      "landmark:nav",
      "landmark:main",
      "heading:h2",
      "form:form",
      "form-control:button",
      "form-control:select",
      "table:table",
      "table:tbody",
      "table:tr",
      "table:th",
      "table:td",
      "list:ul",
      "list:li",
      "landmark:footer"
    ]);
  });

  it("does not forge header or footer landmark semantics inside sectioning containers", () => {
    const facts = extractFileFacts({
      filePath: "web/nested-landmarks.html",
      language: "html",
      sourceText:
        '<html lang="en"><body><main><header></header><article><footer></footer></article></main></body></html>'
    });
    const semantics = facts.symbols
      .filter((symbol) => symbol.qualifiedName.includes("#html-semantic:"))
      .map((symbol) => symbol.name);

    expect(semantics).toContain("landmark:main");
    expect(semantics).toContain("section:header");
    expect(semantics).toContain("section:footer");
    expect(semantics).not.toContain("landmark:header");
    expect(semantics).not.toContain("landmark:footer");
  });

  it("emits deterministic local diagnostics for statically proven HTML quality issues", () => {
    const facts = extractFileFacts({
      filePath: "web/issues.html",
      language: "html",
      sourceText: [
        "<html><body>",
        "<h1>One</h1><h3>Three</h3>",
        '<div id="same"></div><section id="same"></section>',
        "<img>",
        "<ul><div>wrong</div></ul>",
        "<table><caption>Only</caption></table>",
        '<input required="false" role="presentation" aria-hidden="true">',
        '<div title="one" title="two"></div>',
        "</body></html>"
      ].join("\n")
    });

    expect(
      facts.symbols
        .filter((symbol) => symbol.qualifiedName.includes("#html-diagnostic:"))
        .map((symbol) => symbol.name)
        .sort()
    ).toEqual([
      "diagnostic:aria-hidden-interactive-control",
      "diagnostic:boolean-attribute-invalid-value:required",
      "diagnostic:duplicate-attribute:title",
      "diagnostic:duplicate-id:same",
      "diagnostic:heading-level-skip:h1-to-h3",
      "diagnostic:html-missing-lang",
      "diagnostic:image-missing-alt",
      "diagnostic:list-invalid-direct-child:div",
      "diagnostic:presentational-role-on-form-control",
      "diagnostic:table-missing-row"
    ]);
  });

  it("does not diagnose the supported well-formed local semantics", () => {
    const facts = extractFileFacts({
      filePath: "web/valid-depth.html",
      language: "html",
      sourceText: [
        '<html lang="zh-Hant"><body><main>',
        "<h1>One</h1><h2>Two</h2>",
        '<img alt=""><ul><li>Item</li><template><li>Later</li></template><script></script></ul>',
        "<table><tbody><tr><td>Value</td></tr></tbody></table>",
        '<input required><input type="hidden" aria-hidden="true" role="presentation"><button disabled aria-hidden="true" role="presentation">Unavailable</button><button hidden aria-hidden="true" role="presentation">Hidden</button><button role="button">Save</button>',
        "</main></body></html>"
      ].join("\n")
    });

    expect(
      facts.symbols.filter((symbol) => symbol.qualifiedName.includes("#html-diagnostic:"))
    ).toEqual([]);
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

    expect(
      facts.symbols
        .filter(
          (symbol) =>
            !symbol.qualifiedName.includes("#html-semantic:") &&
            !symbol.qualifiedName.includes("#html-attribute:") &&
            !symbol.qualifiedName.includes("#html-diagnostic:")
        )
        .map((symbol) => symbol.name)
    ).toEqual([
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

    expect(
      facts.symbols
        .filter(
          (symbol) =>
            !symbol.qualifiedName.includes("#html-semantic:") &&
            !symbol.qualifiedName.includes("#html-attribute:") &&
            !symbol.qualifiedName.includes("#html-diagnostic:")
        )
        .map((symbol) => symbol.name)
    ).toEqual([
      "editor.html",
      "html",
      "head",
      "title",
      "body",
      "textarea",
      "main"
    ]);
    expect(
      facts.edges.filter((edge) => {
        const target = facts.symbols.find((symbol) => symbol.id === edge.targetId)?.qualifiedName ?? "";
        return (
          target.includes("#html-element:") &&
          !target.includes("#html-semantic:") &&
          !target.includes("#html-attribute:") &&
          !target.includes("#html-diagnostic:")
        );
      })
    ).toHaveLength(6);
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

  it("bounds adversarial attribute count and value size before producing deep facts", () => {
    for (const sourceText of [
      `<div ${Array.from({ length: 257 }, (_, index) => `data-k${index}="v"`).join(" ")}></div>`,
      `<div data-payload="${"x".repeat(4_097)}"></div>`
    ]) {
      const facts = extractFileFacts({
        filePath: "web/attribute-bounds.html",
        language: "html",
        sourceText
      });

      expect(facts.symbols, sourceText.slice(0, 100)).toHaveLength(1);
      expect(facts.edges, sourceText.slice(0, 100)).toEqual([]);
    }
  });

  it("passes 150 generated negative controls without URL links raw-text forgeries or recovery facts", () => {
    const controls = [
      ...Array.from({ length: 50 }, (_, index) => ({
        kind: "url",
        sourceText: `<html lang="en"><body><a href="page-${index}.html"><img src="image-${index}.svg" alt=""></a></body></html>`
      })),
      ...Array.from({ length: 50 }, (_, index) => ({
        kind: "raw",
        sourceText: `<html lang="en"><body><script>const x${index} = '<main id="forged-${index}"></main>';</script><textarea><section data-forged="${index}"></section></textarea></body></html>`
      })),
      ...Array.from({ length: 50 }, (_, index) => ({
        kind: "malformed",
        sourceText: `<div data-case="${index}"><span></div>`
      }))
    ];

    expect(controls).toHaveLength(150);
    for (const control of controls) {
      const facts = extractFileFacts({
        filePath: `web/negative-${control.kind}.html`,
        language: "html",
        sourceText: control.sourceText
      });
      if (control.kind === "malformed") {
        expect(facts.symbols, control.sourceText).toHaveLength(1);
        expect(facts.edges, control.sourceText).toEqual([]);
        continue;
      }
      const deepNames = facts.symbols.map((symbol) => symbol.name);
      expect(deepNames.some((name) => /^(?:href|src)=/u.test(name)), control.sourceText).toBe(false);
      expect(deepNames.some((name) => name.includes("forged-")), control.sourceText).toBe(false);
    }
  });
});
