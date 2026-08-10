import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("Groovy and CFML B1 relations", () => {
  it("links one Groovy class to its unique direct same-file superclass", () => {
    const facts = extractFileFacts({
      filePath: "src/Smoke.groovy",
      language: "groovy",
      sourceText: ["class Parent {}", "class Smoke extends Parent {}"].join("\n")
    });
    const child = facts.symbols.find((symbol) => symbol.name === "Smoke");
    const parent = facts.symbols.find((symbol) => symbol.name === "Parent");

    expect(facts.edges.filter((edge) => edge.kind === "extends")).toEqual([
      expect.objectContaining({
        sourceId: child?.id,
        targetId: parent?.id,
        referenceName: "Parent",
        range: { start: { line: 2, column: 21 }, end: { line: 2, column: 27 } },
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: "syntax.groovy.same-file.unique-direct-class-superclass",
          stage: "syntax",
          candidateSymbolIds: [parent?.id]
        }
      })
    ]);
  });

  it("fails closed for ambiguous or non-canonical Groovy inheritance", () => {
    const cases = [
      "class Smoke extends Parent {}",
      ["class Parent {}", "class Parent {}", "class Smoke extends Parent {}"].join("\n"),
      ["package smoke", "class Parent {}", "class Smoke extends Parent {}"].join("\n"),
      ["import vendor.Parent", "class Parent {}", "class Smoke extends Parent {}"].join("\n"),
      ["class Parent<T> {}", "class Smoke extends Parent<String> {}"].join("\n"),
      ["interface Parent {}", "class Smoke implements Parent {}"].join("\n"),
      ["class Parent {}", "class Smoke extends Parent implements Runnable {}"].join("\n")
    ];
    for (const sourceText of cases) {
      const facts = extractFileFacts({ filePath: "src/Smoke.groovy", language: "groovy", sourceText });
      expect(facts.edges.filter((edge) => edge.kind === "extends"), sourceText).toEqual([]);
    }
  });

  it("links one structurally isolated CFML remote entrypoint to its unique CFC method", () => {
    const facts = extractFileFacts({
      filePath: "src/Health.cfc",
      language: "cfml",
      sourceText: "remote function ping() { return 1; }"
    });
    const entrypoint = facts.symbols.find((symbol) => symbol.kind === "entrypoint");
    const method = facts.symbols.find((symbol) => symbol.kind === "method" && symbol.name === "ping");

    expect(entrypoint).toMatchObject({ name: "CFML REMOTE Health.ping" });
    expect(facts.edges.filter((edge) => edge.kind === "handles")).toEqual([
      expect.objectContaining({
        sourceId: entrypoint?.id,
        targetId: method?.id,
        referenceName: "Health.ping",
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: "syntax.cfml.structurally-isolated-cfc-remote-method-entrypoint",
          stage: "syntax",
          candidateSymbolIds: [method?.id]
        }
      })
    ]);
  });

  it("fails closed for non-CFC, duplicate, tagged, or executable CFML remote surfaces", () => {
    const cases = [
      { filePath: "src/Health.cfm", sourceText: "remote function ping() { return 1; }" },
      { filePath: "src/Health.cfc", sourceText: "public function ping() { return 1; }" },
      { filePath: "src/Health.cfc", sourceText: ["remote function ping() {}", "remote function ping() {}"].join("\n") },
      { filePath: "src/Health.cfc", sourceText: ["remote function ping() {}", "mode = 1;"].join("\n") },
      {
        filePath: "src/Health.cfc",
        sourceText: [
          "remote function ping() {}",
          "function init() { this.ping = function() {}; }"
        ].join("\n")
      },
      { filePath: "src/Health.cfc", sourceText: "<cffunction name=\"ping\" access=\"remote\"></cffunction>" },
      {
        filePath: "src/Health.cfc",
        sourceText: ["component {", "  property name=\"mode\";", "  remote function ping() {}", "}"].join("\n")
      },
      {
        filePath: "src/Health.cfc",
        sourceText: ["component {", "  remote function ping() {}", "  this.ping = function() {};", "}"].join("\n")
      }
    ];
    for (const testCase of cases) {
      const facts = extractFileFacts({ language: "cfml", ...testCase });
      expect(facts.edges.filter((edge) => edge.kind === "handles"), testCase.sourceText).toEqual([]);
    }
  });
});
