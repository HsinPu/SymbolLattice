import { describe, expect, it } from "vitest";

import { scoreOracleSelection } from "../../../benchmarks/java/correctness-oracle.mjs";

const endpoint = (name, kind, line) => ({
  filePath: "src/App.java",
  name,
  kind,
  line,
  column: 1
});

const occurrence = (line, column) => ({
  filePath: "src/App.java",
  line,
  column
});

function selection(positives, negatives) {
  return {
    positives,
    negatives,
    positiveCounts: {},
    negativeCounts: {}
  };
}

function snapshot(edges) {
  return {
    symbols: [
      { id: "caller", filePath: "src/App.java", name: "run", kind: "method", range: { start: { line: 2, column: 1 }, end: { line: 6, column: 2 } } },
      { id: "target", filePath: "src/App.java", name: "work", kind: "method", range: { start: { line: 8, column: 1 }, end: { line: 10, column: 2 } } }
    ],
    edges
  };
}

describe("Java large-project correctness oracle", () => {
  it("scores exact singleton evidence and source occurrences", () => {
    const facts = selection(
      [{
        project: "fixture",
        type: "positive",
        stratum: "call",
        kind: "calls",
        source: endpoint("run", "method", 2),
        target: endpoint("work", "method", 8),
        occurrence: occurrence(4, 5)
      }],
      [{
        project: "fixture",
        type: "negative",
        stratum: "external-call",
        kind: "calls",
        source: endpoint("run", "method", 2),
        target: null,
        occurrence: occurrence(5, 5)
      }]
    );
    const snapshots = new Map([["fixture", snapshot([{
      id: "edge:call",
      sourceId: "caller",
      targetId: "target",
      kind: "calls",
      filePath: "src/App.java",
      range: { start: { line: 4, column: 5 } },
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "syntax.java.fixture", candidateSymbolIds: ["target"] }
    }])]]);

    expect(scoreOracleSelection(facts, snapshots).scores).toEqual({
      tp: 1,
      fp: 0,
      fn: 0,
      evidenceInvalid: 0,
      tn: 1
    });
  });

  it("fails closed on missing or non-singleton evidence and flags forbidden exact edges", () => {
    const positive = {
      project: "fixture",
      type: "positive",
      stratum: "call",
      kind: "calls",
      source: endpoint("run", "method", 2),
      target: endpoint("work", "method", 8),
      occurrence: occurrence(4, 5)
    };
    const negative = {
      project: "fixture",
      type: "negative",
      stratum: "external-call",
      kind: "calls",
      source: endpoint("run", "method", 2),
      target: null,
      occurrence: occurrence(5, 5)
    };
    const invalidEdge = {
      id: "edge:invalid",
      sourceId: "caller",
      targetId: "target",
      kind: "calls",
      filePath: "src/App.java",
      range: { start: { line: 4, column: 5 } },
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "syntax.java.fixture", candidateSymbolIds: ["target", "other"] }
    };
    const forbiddenEdge = {
      ...invalidEdge,
      id: "edge:forbidden",
      range: { start: { line: 5, column: 5 } },
      evidence: { ruleId: "syntax.java.fixture", candidateSymbolIds: ["target"] }
    };
    const result = scoreOracleSelection(
      selection([positive], [negative]),
      new Map([["fixture", snapshot([invalidEdge, forbiddenEdge])]])
    );

    expect(result.scores).toEqual({ tp: 0, fp: 1, fn: 0, evidenceInvalid: 1, tn: 0 });
  });

  it("treats repeated signature types as occurrence-sensitive", () => {
    const fact = {
      project: "fixture",
      type: "positive",
      stratum: "signature",
      kind: "accepts",
      source: endpoint("run", "method", 2),
      target: endpoint("work", "method", 8),
      occurrence: occurrence(5, 7)
    };
    const shared = {
      sourceId: "caller",
      targetId: "target",
      kind: "accepts",
      filePath: "src/App.java",
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "signature.java.fixture", candidateSymbolIds: ["target"] }
    };
    const result = scoreOracleSelection(
      selection([fact], []),
      new Map([[
        "fixture",
        snapshot([
          { ...shared, id: "edge:first", range: { start: { line: 4, column: 5 } } },
          { ...shared, id: "edge:second", range: { start: { line: 5, column: 7 } } }
        ])
      ]])
    );

    expect(result.scores).toEqual({ tp: 1, fp: 0, fn: 0, evidenceInvalid: 0, tn: 0 });
  });
});
