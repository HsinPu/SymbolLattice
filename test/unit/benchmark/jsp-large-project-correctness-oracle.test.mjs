import { describe, expect, it } from "vitest";

import { scoreSets, strictJspDirectiveTruth } from "../../../benchmarks/jsp/correctness-oracle.mjs";

describe("JSP large-project correctness oracle", () => {
  it("derives directive, attribute, binding, and containment truth independently", () => {
    expect(strictJspDirectiveTruth("src/main/webapp/index.jsp", [
      '<%@ page contentType="text/html" %>',
      '<%@ taglib prefix="c" uri="jakarta.tags.core" %>',
      "<main>ok</main>"
    ].join("\n"))).toEqual({
      resources: [
        "src/main/webapp/index.jsp#jsp-directive:page::0",
        "src/main/webapp/index.jsp#jsp-directive:page::0#jsp-attribute:contentType",
        "src/main/webapp/index.jsp#jsp-directive:taglib:c:0",
        "src/main/webapp/index.jsp#jsp-directive:taglib:c:0#jsp-attribute:prefix",
        "src/main/webapp/index.jsp#jsp-directive:taglib:c:0#jsp-attribute:uri",
        "src/main/webapp/index.jsp#jsp-directive:taglib:c:0#jsp-taglib:c"
      ],
      containments: [
        "src/main/webapp/index.jsp->src/main/webapp/index.jsp#jsp-directive:page::0",
        "src/main/webapp/index.jsp#jsp-directive:page::0->src/main/webapp/index.jsp#jsp-directive:page::0#jsp-attribute:contentType",
        "src/main/webapp/index.jsp->src/main/webapp/index.jsp#jsp-directive:taglib:c:0",
        "src/main/webapp/index.jsp#jsp-directive:taglib:c:0->src/main/webapp/index.jsp#jsp-directive:taglib:c:0#jsp-attribute:prefix",
        "src/main/webapp/index.jsp#jsp-directive:taglib:c:0->src/main/webapp/index.jsp#jsp-directive:taglib:c:0#jsp-attribute:uri",
        "src/main/webapp/index.jsp#jsp-directive:taglib:c:0->src/main/webapp/index.jsp#jsp-directive:taglib:c:0#jsp-taglib:c"
      ]
    });
  });

  it("rejects malformed structure and ambiguous prefix bindings", () => {
    expect(strictJspDirectiveTruth("bad.jsp", '<%@ page x="y" %><main>')).toBeNull();
    const rebound = strictJspDirectiveTruth("rebound.jsp", [
      '<%@ taglib prefix="c" uri="jakarta.tags.core" %>',
      '<%@ taglib prefix="c" tagdir="/WEB-INF/tags" %>'
    ].join("\n"));
    expect(rebound?.resources.some((resource) => resource.endsWith("#jsp-taglib:c"))).toBe(false);
  });

  it("scores exact set differences", () => {
    expect(scoreSets(["a", "b"], ["a", "c"])).toMatchObject({ tp: 1, fp: 1, fn: 1 });
  });
});
