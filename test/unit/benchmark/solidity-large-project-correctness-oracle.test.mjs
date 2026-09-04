import { describe, expect, it } from "vitest";

import {
  collectSolidityCallTruth,
  isSolidityOracleIgnoredDirectory,
  scoreSolidityFacts,
  scoreSolidityNegativeMatrix
} from "../../../benchmarks/solidity/correctness-oracle.mjs";

describe("Solidity large-project correctness oracle", () => {
  it("matches source discovery exclusions", () => {
    expect([".git", ".github", ".SymbolLattice", "node_modules", "lib", "out", "cache"].every(
      isSolidityOracleIgnoredDirectory
    )).toBe(true);
    expect(["contracts", "src", "test"].some(isSolidityOracleIgnoredDirectory)).toBe(false);
  });

  it("collects compiler-confirmed unique private fixed-arity calls", () => {
    const sourceText = `import {Base} from "./Base.sol";
contract C is Base {
  function entry(uint value) external { helper(value, address(this)); }
  function helper(uint value, address account) private {}
}`;
    const result = collectSolidityCallTruth("fixture", "contracts/C.sol", sourceText);
    expect(result.rejected).toBe(false);
    expect(result.facts).toEqual([
      expect.objectContaining({
        project: "fixture",
        kind: "calls",
        arity: 2,
        source: expect.objectContaining({ name: "entry", kind: "method" }),
        target: expect.objectContaining({ name: "helper", kind: "method" })
      })
    ]);
  });

  it("excludes caller assembly, function values, and lexical shadows from positive truth", () => {
    const sources = [
      `contract C { function entry() external { assembly { helper() } } function helper() private {} }`,
      `contract C { function entry(function() internal helper) external { helper(); } function helper() private {} }`,
      `contract C { function entry(uint helper) external { helper(1); } function helper(uint value) private {} }`
    ];
    for (const sourceText of sources) {
      expect(collectSolidityCallTruth("fixture", "contracts/C.sol", sourceText).facts).toEqual([]);
    }
  });

  it("keeps all 150 negative cases exact-edge free", () => {
    expect(scoreSolidityNegativeMatrix()).toEqual({ total: 150, tn: 150, falsePositives: [] });
  });

  it("requires singleton exact target evidence", () => {
    const fact = {
      project: "fixture",
      kind: "calls",
      source: { filePath: "C.sol", name: "entry", kind: "method", line: 1, column: 13 },
      target: { filePath: "C.sol", name: "helper", kind: "method", line: 2, column: 2 },
      occurrence: { filePath: "C.sol", line: 1, column: 41 },
      arity: 0
    };
    const extracted = {
      symbols: [
        { id: "entry", filePath: "C.sol", name: "entry", kind: "method", range: { start: { line: 1, column: 13 } } },
        { id: "helper", filePath: "C.sol", name: "helper", kind: "method", range: { start: { line: 2, column: 2 } } }
      ],
      edges: [{
        kind: "calls", sourceId: "entry", targetId: "helper", range: { start: { line: 1, column: 41 } },
        resolution: "exact", confidence: 1, evidence: { candidateSymbolIds: ["helper"] }
      }]
    };
    expect(scoreSolidityFacts([fact], new Map([["fixture\0C.sol", extracted]])).scores).toEqual({
      tp: 1, fp: 0, fn: 0, evidenceInvalid: 0
    });
  });
});
