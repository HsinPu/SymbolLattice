import { describe, expect, it } from "vitest";

import {
  collectJavaScriptTruth,
  isJavaScriptOracleIgnoredDirectory,
  scoreJavaScriptNegativeMatrix,
  scoreJavaScriptNegativeSnapshot,
  scoreJavaScriptSelection
} from "../../../benchmarks/javascript/correctness-oracle.mjs";

describe("JavaScript large-project correctness oracle", () => {
  it("matches synthetic file endpoints by unique path when AST range starts after comments", () => {
    const fact = { project: "fixture", kind: "identity", stratum: "identity",
      target: { filePath: "a.js", name: "a.js", kind: "file", line: 1, column: 1 } };
    const snapshots = new Map([["fixture", { symbols: [{
      id: "a", kind: "file", filePath: "a.js", name: "a.js", qualifiedName: "a.js",
      range: { start: { line: 3, column: 1 }, end: { line: 5, column: 1 } }
    }], edges: [] }]]);
    expect(scoreJavaScriptSelection({ positives: [fact] }, snapshots).scores).toMatchObject({ tp: 1, fn: 0 });
  });

  it.each([
    { confidence: 0.5, evidence: { candidateSymbolIds: ["target"] } },
    { confidence: 1, evidence: { candidateSymbolIds: [] } },
    { confidence: 1, evidence: { candidateSymbolIds: ["other"] } },
    { confidence: 1, evidence: undefined }
  ])("rejects local exact imports even with malformed evidence: %j", (evidence) => {
    const snapshot = {
      symbols: [
        { id: "entry", kind: "file", filePath: "entry.js" },
        { id: "target", kind: "file", filePath: "target.js" }
      ],
      edges: [{ id: "bad", kind: "imports", sourceId: "entry", targetId: "target", resolution: "exact", ...evidence }]
    };
    expect(scoreJavaScriptNegativeSnapshot(snapshot, "entry.js").map((edge) => edge.id)).toEqual(["bad"]);
  });

  it.each([
    { line: 8, column: 10 },
    { line: 2, column: 31 },
    { line: 2, column: 1 },
    { line: 2, column: 30 }
  ])("rejects a unique name outside its half-open source range: %j", (point) => {
    const fact = {
      project: "fixture", kind: "identity", stratum: "identity",
      target: { filePath: "a.js", name: "helper", kind: "function", ...point }
    };
    const snapshots = new Map([["fixture", {
      symbols: [{
        id: "helper", filePath: "a.js", name: "helper", kind: "function",
        range: { start: { line: 2, column: 5 }, end: { line: 2, column: 30 } }
      }], edges: []
    }]]);
    expect(scoreJavaScriptSelection({ positives: [fact] }, snapshots).scores)
      .toMatchObject({ tp: 0, fn: 1 });
  });

  it("matches default discovery by excluding every dot directory and dependencies", () => {
    expect([".git", ".github", ".cache", ".SymbolLattice", "node_modules"].every(
      isJavaScriptOracleIgnoredDirectory
    )).toBe(true);
    expect(["lib", "src", "test"].some(isJavaScriptOracleIgnoredDirectory)).toBe(false);
  });

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

  it("collects exact relative ESM and strict CommonJS module imports only when one tracked target exists", () => {
    const knownFiles = new Set(["src/entry.js", "src/helper.js", "src/legacy.cjs"]);
    const esm = collectJavaScriptTruth(
      "fixture",
      "src/entry.js",
      "import { helper } from './helper.js'; helper();",
      { knownFiles }
    );
    const commonjs = collectJavaScriptTruth(
      "fixture",
      "src/legacy.cjs",
      "const helper = require('./helper')",
      { knownFiles }
    );

    expect(esm.filter((fact) => fact.stratum === "esmImport")).toEqual([
      expect.objectContaining({
        kind: "imports",
        moduleSyntax: "esm",
        target: expect.objectContaining({ filePath: "src/helper.js", kind: "file" })
      })
    ]);
    expect(commonjs.filter((fact) => fact.stratum === "commonJsImport")).toEqual([
      expect.objectContaining({
        kind: "imports",
        moduleSyntax: "commonjs",
        target: expect.objectContaining({ filePath: "src/helper.js", kind: "file" })
      })
    ]);
    expect(collectJavaScriptTruth(
      "fixture",
      "src/entry.js",
      "import external from 'external';",
      { knownFiles }
    ).filter((fact) => fact.stratum === "esmImport" || fact.stratum === "commonJsImport")).toEqual([]);
  });

  it("does not treat caller-local shadows as same-file direct targets", () => {
    const facts = collectJavaScriptTruth(
      "fixture",
      "src/shadow.js",
      "function helper() {}\nfunction entry(helper) { helper(); }"
    );
    expect(facts.filter((fact) => fact.kind === "calls")).toEqual([]);
  });

  it("keeps the 150-case JavaScript module negative matrix exact-edge free", () => {
    expect(scoreJavaScriptNegativeMatrix()).toEqual({
      total: 150,
      tn: 150,
      falsePositives: [],
      coverage: {
        semanticTemplates: 15,
        repetitionsPerTemplate: 10,
        scope: "local-module-import-exact-only"
      }
    });
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
    expect(scoreJavaScriptSelection({ positives: [fact] }, snapshots).scores).toEqual({ tp: 1, fp: null, fn: 0, evidenceInvalid: 0 });
    // Positive selection does not provide truth for every emitted edge.
    // An extra edge must not turn an unmeasured precision into a claimed FP=0.
    snapshots.get("fixture").edges.push({
      ...snapshots.get("fixture").edges[0],
      id: "unjudged-call",
      targetId: "unjudged",
      evidence: { ruleId: "syntax.fixture", candidateSymbolIds: ["unjudged"] }
    });
    const scored = scoreJavaScriptSelection({ positives: [fact] }, snapshots);
    expect(scored.scores.fp).toBeNull();
    expect(scored.scores).toMatchObject({ tp: 0, evidenceInvalid: 1 });
    expect(scored.positives[0].score.reason).toBe("conflicting-exact-target");
    expect(scored.measurement).toEqual({
      recallScope: "selected-positive-truth",
      precisionScope: "not-measured"
    });
  });
});
