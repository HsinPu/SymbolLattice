import { describe, expect, it } from "vitest";

import {
  parseVbnetOracleLine,
  scoreVbnetCandidates,
  scoreVbnetNegativeMatrix
} from "../../../benchmarks/vbnet/correctness-oracle.mjs";

describe("VB.NET large-project correctness oracle", () => {
  it("parses compiler occurrence identity with zero-based columns", () => {
    expect(parseVbnetOracleLine(
      "CANDIDATE\tCompilers/A.vb\tWorker\tclass\tRun\tHelper\t2\t10\t8\t20\t12\t11\t16"
    )).toMatchObject({
      filePath: "Compilers/A.vb",
      container: "Worker",
      containerKind: "class",
      caller: "Run",
      target: "Helper",
      arity: 2,
      callerPosition: { line: 10, column: 8 },
      targetPosition: { line: 20, column: 12 },
      occurrence: { line: 11, column: 16 },
      scope: "Compilers"
    });
  });

  it("keeps all 150 negative cases exact-edge free", () => {
    expect(scoreVbnetNegativeMatrix()).toEqual({ total: 150, tn: 150, falsePositives: [] });
  });

  it("requires singleton exact occurrence evidence", () => {
    const candidate = parseVbnetOracleLine(
      "CANDIDATE\tCompilers/A.vb\tWorker\tclass\tRun\tHelper\t2\t10\t8\t20\t12\t11\t16"
    );
    const facts = {
      symbols: [
        { id: "run", kind: "method", name: "Run", range: { start: { line: 10, column: 8 } } },
        { id: "helper", kind: "method", name: "Helper", range: { start: { line: 20, column: 12 } } }
      ],
      edges: [{
        kind: "calls", sourceId: "run", targetId: "helper",
        range: { start: { line: 11, column: 16 } }, resolution: "exact", confidence: 1,
        evidence: { candidateSymbolIds: ["helper"] }
      }]
    };
    expect(scoreVbnetCandidates([candidate], new Map([["Compilers/A.vb", facts]])).scores).toEqual({
      tp: 1, fp: 0, fn: 0, evidenceInvalid: 0
    });
  });
});
