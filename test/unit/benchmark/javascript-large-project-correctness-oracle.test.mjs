import { describe, expect, it } from "vitest";

import {
  collectJavaScriptTruth,
  scoreJavaScriptSelection
} from "../../../benchmarks/javascript/correctness-oracle.mjs";

describe("JavaScript large-project correctness oracle", () => {
  it("collects conservative ESTree identities and direct relations", () => {
    const facts = collectJavaScriptTruth(
      "fixture",
      "src/sample.js",
      [
        "class Base {}",
        "class Child extends Base {}",
        "function helper() {}",
        "function entry() { helper(); new Child(); }"
      ].join("\n")
    );

    expect(facts.filter((fact) => fact.stratum === "identity")).toHaveLength(4);
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ stratum: "call", kind: "calls", target: expect.objectContaining({ name: "helper" }) }),
      expect.objectContaining({ stratum: "instantiation", kind: "instantiates", target: expect.objectContaining({ name: "Child" }) }),
      expect.objectContaining({ stratum: "heritage", kind: "extends", target: expect.objectContaining({ name: "Base" }) })
    ]));
  });

  it("does not treat caller-local shadows as same-file direct targets", () => {
    const facts = collectJavaScriptTruth(
      "fixture",
      "src/shadow.js",
      "function helper() {}\nfunction entry(helper) { helper(); }"
    );
    expect(facts.filter((fact) => fact.kind === "calls")).toEqual([]);
  });

  it("scores only singleton exact evidence as TP", () => {
    const fact = {
      project: "fixture",
      type: "positive",
      stratum: "call",
      kind: "calls",
      source: { filePath: "src/a.js", name: "entry", kind: "function", line: 1, column: 1 },
      target: { filePath: "src/a.js", name: "helper", kind: "function", line: 2, column: 1 },
      occurrence: { filePath: "src/a.js", line: 1, column: 20 }
    };
    const snapshots = new Map([["fixture", {
      symbols: [
        { id: "entry", filePath: "src/a.js", name: "entry", kind: "function", range: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } } },
        { id: "helper", filePath: "src/a.js", name: "helper", kind: "function", range: { start: { line: 2, column: 1 }, end: { line: 2, column: 21 } } }
      ],
      edges: [{
        id: "call",
        sourceId: "entry",
        targetId: "helper",
        kind: "calls",
        filePath: "src/a.js",
        range: { start: { line: 1, column: 20 } },
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId: "syntax.fixture", candidateSymbolIds: ["helper"] }
      }]
    }]]);
    expect(scoreJavaScriptSelection({ positives: [fact] }, snapshots).scores).toEqual({ tp: 1, fp: 0, fn: 0, evidenceInvalid: 0 });
  });
});
