import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("JSP B1 extraction", () => {
  it("extracts classic JSP directives, HTML elements, and custom actions with exact containment", () => {
    const facts = extractFileFacts({
      filePath: "src/main/webapp/WEB-INF/views/index.jsp",
      language: "jsp",
      sourceText: [
        '<%@ page contentType="text/html;charset=UTF-8" %>',
        '<%@ taglib prefix="c" uri="jakarta.tags.core" %>',
        "<html>",
        "  <body>",
        '    <c:if test="${ready}">',
        '      <jsp:include page="/WEB-INF/views/card.jsp" />',
        "    </c:if>",
        "  </body>",
        "</html>"
      ].join("\n")
    });

    expect(facts.symbols.slice(0, 7).map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "index.jsp"],
      ["resource", "directive:page"],
      ["resource", "directive:taglib:c"],
      ["resource", "html"],
      ["resource", "body"],
      ["resource", "c:if"],
      ["resource", "jsp:include"]
    ]);
    expect(facts.edges.length).toBeGreaterThanOrEqual(6);
    expect(
      facts.edges.every(
        (edge) =>
          edge.kind === "contains" &&
          edge.resolution === "exact" &&
          edge.confidence === 1 &&
          edge.evidence?.stage === "syntax" &&
          edge.evidence.candidateSymbolIds.length === 1
      )
    ).toBe(true);
  });

  it("extracts XML-syntax JSP documents without treating namespace declarations as elements", () => {
    const facts = extractFileFacts({
      filePath: "src/main/webapp/report.jspx",
      language: "jsp",
      sourceText: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<jsp:root xmlns:jsp="http://java.sun.com/JSP/Page" version="2.3">',
        '  <jsp:directive.page contentType="text/html" />',
        "  <html><body><jsp:text>Report</jsp:text></body></html>",
        "</jsp:root>"
      ].join("\n")
    });

    expect(facts.symbols.slice(0, 6).map((symbol) => symbol.name)).toEqual([
      "report.jspx",
      "jsp:root",
      "jsp:directive.page",
      "html",
      "body",
      "jsp:text"
    ]);
  });

  it.each([
    "<%@ page contentType=\"text/html\" ",
    "<html><body></html>",
    "<html><body><c:if test=\"${ready}\"></body></html>",
    "<html><body><jsp:include page=\"x.jsp\"></body></html>",
    "<html><body><!-- unterminated</body></html>",
    "<html><body><% if (ready) { </body></html>"
  ])("fails closed to the file symbol for malformed JSP: %s", (sourceText) => {
    const facts = extractFileFacts({ filePath: "broken.jsp", language: "jsp", sourceText });
    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "broken.jsp"]
    ]);
    expect(facts.edges).toEqual([]);
  });

  it("keeps tag-looking scriptlet and JSP-comment content opaque", () => {
    const facts = extractFileFacts({
      filePath: "opaque.jsp",
      language: "jsp",
      sourceText: [
        '<%@ page contentType="text/html" %>',
        '<%-- <c:if><jsp:include page="forged.jsp" /></c:if> --%>',
        '<% String forged = "<c:forEach><jsp:forward page=\\\"x.jsp\\\" /></c:forEach>"; %>',
        "<main>Safe</main>"
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => symbol.name)).toEqual(
      expect.arrayContaining(["opaque.jsp", "directive:page", "main"])
    );
    expect(facts.symbols.some((symbol) => symbol.name === "c:if")).toBe(false);
    expect(facts.symbols.some((symbol) => symbol.name === "jsp:forward")).toBe(false);
  });

  it("retains taglib, JSTL, EL, and literal JSP template-reference facts", () => {
    const facts = extractFileFacts({
      filePath: "src/main/webapp/WEB-INF/views/index.jsp",
      language: "jsp",
      sourceText: [
        '<%@ page contentType="text/html" %>',
        '<%@ taglib prefix="c" uri="jakarta.tags.core" %>',
        '<%@ taglib prefix="ui" tagdir="/WEB-INF/tags" %>',
        '<%@ include file="/WEB-INF/views/header.jsp" %>',
        '<c:forEach items="${items}" var="item">',
        '  <span>${item.name}</span>',
        '  <ui:card title="${item.name}" />',
        '  <jsp:include page="details.jsp" />',
        "</c:forEach>",
        '<jsp:forward page="/WEB-INF/views/done.jsp" />'
      ].join("\n")
    });
    const jspFacts = (
      facts as typeof facts & {
        jspFacts?: {
          taglibs: readonly {
            prefix: string;
            uri?: string;
            tagDir?: string;
          }[];
          templateReferences: readonly {
            kind: string;
            targetFilePaths: readonly string[];
          }[];
        };
      }
    ).jspFacts;

    expect(jspFacts?.taglibs).toEqual([
      expect.objectContaining({ prefix: "c", uri: "jakarta.tags.core" }),
      expect.objectContaining({ prefix: "ui", tagDir: "/WEB-INF/tags" })
    ]);
    expect(jspFacts?.templateReferences).toEqual([
      expect.objectContaining({
        kind: "include-directive",
        targetFilePaths: ["src/main/webapp/WEB-INF/views/header.jsp"]
      }),
      expect.objectContaining({
        kind: "tag-file",
        targetFilePaths: [
          "src/main/webapp/WEB-INF/tags/card.tag",
          "src/main/webapp/WEB-INF/tags/card.tagx"
        ]
      }),
      expect.objectContaining({
        kind: "include-action",
        targetFilePaths: ["src/main/webapp/WEB-INF/views/details.jsp"]
      }),
      expect.objectContaining({
        kind: "forward-action",
        targetFilePaths: ["src/main/webapp/WEB-INF/views/done.jsp"]
      })
    ]);
    expect(facts.symbols.map((symbol) => symbol.name)).toEqual(
      expect.arrayContaining([
        "taglib:c=jakarta.tags.core",
        "taglib:ui=/WEB-INF/tags",
        "jstl:iteration:c:forEach",
        "el-path:items",
        "el-path:item.name"
      ])
    );
  });

  it("keeps dynamic JSP targets unresolved in syntax facts and rejects unterminated EL", () => {
    const dynamic = extractFileFacts({
      filePath: "src/main/webapp/dynamic.jsp",
      language: "jsp",
      sourceText: [
        '<%@ taglib prefix="ui" tagdir="${tagRoot}" %>',
        '<%@ include file="${fragment}" %>',
        '<jsp:include page="<%= pageName %>" />',
        '<jsp:forward page="${destination}" />',
        "<main>${safe.path}</main>"
      ].join("\n")
    });
    const dynamicFacts = (
      dynamic as typeof dynamic & {
        jspFacts?: { templateReferences: readonly unknown[] };
      }
    ).jspFacts;
    expect(dynamicFacts?.templateReferences).toEqual([]);
    expect(dynamic.symbols.map((symbol) => symbol.name)).toContain("el-path:safe.path");

    const broken = extractFileFacts({
      filePath: "src/main/webapp/broken-el.jsp",
      language: "jsp",
      sourceText: "<main>${user.name</main>"
    });
    expect(broken.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["file", "broken-el.jsp"]
    ]);
    expect(broken.edges).toEqual([]);
  });

  it("does not infer absolute template targets without a proven web root or arbitrary EL syntax", () => {
    for (const filePath of ["views/index.jsp", "src/mywebapp/views/index.jsp"] as const) {
      const facts = extractFileFacts({
        filePath,
        language: "jsp",
        sourceText: '<%@ include file="/header.jsp" %><main>${value + * forged}</main>'
      });
      expect(facts.jspFacts?.templateReferences, filePath).toEqual([]);
      expect(
        facts.symbols.some((symbol) => symbol.name === "el-expression"),
        filePath
      ).toBe(false);
    }
  });

  it("fails closed for duplicate attributes and XML-syntax case mismatches", () => {
    for (const [filePath, sourceText] of [
      ["duplicate-directive.jsp", '<%@ include file="header.jsp" file="forged.jsp" %>'],
      ["duplicate-element.jsp", '<jsp:include page="safe.jsp" page="forged.jsp" />'],
      ["case-mismatch.jspx", "<jsp:root><Panel></panel></jsp:root>"],
      ["xml-void.jspx", "<jsp:root><br></jsp:root>"]
    ] as const) {
      const facts = extractFileFacts({ filePath, language: "jsp", sourceText });
      expect(facts.symbols.map((symbol) => symbol.kind), filePath).toEqual(["file"]);
      expect(facts.edges, filePath).toEqual([]);
    }
  });

  it("suppresses EL semantics when the page disables EL evaluation", () => {
    const facts = extractFileFacts({
      filePath: "disabled-el.jsp",
      language: "jsp",
      sourceText: [
        '<%@ page isELIgnored="true" %>',
        '<main data-value="${literal.path}">${literal.text}</main>'
      ].join("\n")
    });

    expect(facts.symbols.map((symbol) => symbol.name)).not.toContain("el-path:literal.path");
    expect(facts.symbols.map((symbol) => symbol.name)).not.toContain("el-path:literal.text");
  });

  it("does not infer tag semantics or tag-file references from a rebound prefix", () => {
    const facts = extractFileFacts({
      filePath: "src/main/webapp/rebound.jsp",
      language: "jsp",
      sourceText: [
        '<%@ taglib prefix="c" uri="jakarta.tags.core" %>',
        '<%@ taglib prefix="c" tagdir="/WEB-INF/tags" %>',
        '<c:if test="${ready}" />'
      ].join("\n")
    });
    const jspFacts = (
      facts as typeof facts & {
        jspFacts?: { taglibs: readonly unknown[]; templateReferences: readonly unknown[] };
      }
    ).jspFacts;

    expect(jspFacts?.taglibs).toEqual([]);
    expect(jspFacts?.templateReferences).toEqual([]);
    expect(facts.symbols.some((symbol) => symbol.name.startsWith("jstl:"))).toBe(false);
  });

  it("fails closed across 200 deterministic malformed-source probes", () => {
    const malformedSources = [
      ...Array.from(
        { length: 50 },
        (_, index) => `<%@ page probe${index}="value"`
      ),
      ...Array.from(
        { length: 50 },
        (_, index) => `<root><item${index}></root>`
      ),
      ...Array.from(
        { length: 50 },
        (_, index) => `<root><% int value${index} = 1; </root>`
      ),
      ...Array.from(
        { length: 50 },
        (_, index) => `<root><%-- unfinished-${index}</root>`
      )
    ];

    expect(malformedSources).toHaveLength(200);
    for (const [index, sourceText] of malformedSources.entries()) {
      const facts = extractFileFacts({
        filePath: `negative-${index}.jsp`,
        language: "jsp",
        sourceText
      });
      expect(facts.symbols.map((symbol) => symbol.kind), `negative-${index}`).toEqual(["file"]);
      expect(facts.edges, `negative-${index}`).toEqual([]);
    }
  });
});
