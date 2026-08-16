import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

function jspDocument(relativePath: string, sourceText: string): SourceDocument {
  return {
    absolutePath: `C:/project/${relativePath}`,
    relativePath,
    language: "jsp",
    sourceText,
    contentHash: `jsp:${relativePath}:${sourceText.length}`
  };
}

function snapshot(documents: readonly SourceDocument[]) {
  return resolveProjectFacts({
    sourceDocuments: documents,
    extractedFiles: documents.map((document) =>
      extractFileFacts({
        filePath: document.relativePath,
        language: document.language,
        sourceText: document.sourceText
      })
    ),
    indexedAt: "2026-08-16T00:00:00.000Z"
  });
}

describe("JSP project resource resolution", () => {
  it("resolves unique literal includes, forwards, and tag files to indexed project files", () => {
    const graph = snapshot([
      jspDocument(
        "src/main/webapp/WEB-INF/views/index.jsp",
        [
          '<%@ taglib prefix="ui" tagdir="/WEB-INF/tags" %>',
          '<%@ include file="/WEB-INF/views/header.jsp" %>',
          '<ui:card />',
          '<jsp:include page="details.jsp" />',
          '<jsp:forward page="/WEB-INF/views/done.jsp" />'
        ].join("\n")
      ),
      jspDocument("src/main/webapp/WEB-INF/views/header.jsp", "<header />"),
      jspDocument("src/main/webapp/WEB-INF/views/details.jsp", "<section />"),
      jspDocument("src/main/webapp/WEB-INF/views/done.jsp", "<main />"),
      jspDocument("src/main/webapp/WEB-INF/tags/card.tag", '<%@ tag body-content="empty" %>')
    ]);
    const references = graph.edges.filter((edge) => edge.kind === "references");

    expect(references).toHaveLength(4);
    expect(references.map((edge) => edge.resolution)).toEqual([
      "exact",
      "exact",
      "exact",
      "exact"
    ]);
    expect(references.every((edge) => edge.confidence === 1)).toBe(true);
    expect(references.map((edge) => edge.evidence?.ruleId)).toEqual(
      expect.arrayContaining([
        "syntax.jsp.include-directive.literal-project-file.exact-target",
        "syntax.jsp.tag-file.literal-project-file.exact-target",
        "syntax.jsp.include-action.literal-project-file.exact-target",
        "syntax.jsp.forward-action.literal-project-file.exact-target"
      ])
    );
    expect(
      references.map((edge) => graph.symbols.find((symbol) => symbol.id === edge.targetId)?.filePath)
    ).toEqual(
      expect.arrayContaining([
        "src/main/webapp/WEB-INF/views/header.jsp",
        "src/main/webapp/WEB-INF/tags/card.tag",
        "src/main/webapp/WEB-INF/views/details.jsp",
        "src/main/webapp/WEB-INF/views/done.jsp"
      ])
    );
  });

  it("keeps missing or ambiguous literal JSP resources unresolved", () => {
    const graph = snapshot([
      jspDocument(
        "src/main/webapp/index.jsp",
        [
          '<%@ taglib prefix="ui" tagdir="/WEB-INF/tags" %>',
          '<%@ include file="missing.jsp" %>',
          '<ui:card />'
        ].join("\n")
      ),
      jspDocument("src/main/webapp/WEB-INF/tags/card.tag", '<%@ tag body-content="empty" %>'),
      jspDocument("src/main/webapp/WEB-INF/tags/card.tagx", '<jsp:root version="2.3" />')
    ]);
    const references = graph.edges.filter((edge) => edge.kind === "references");

    expect(references).toHaveLength(2);
    expect(references.every((edge) => edge.targetId === null)).toBe(true);
    expect(references.every((edge) => edge.resolution === "unresolved")).toBe(true);
    expect(references.every((edge) => edge.confidence === 0)).toBe(true);
  });
});
