import { describe, expect, it } from "vitest";

import {
  parseCodeGraphCallees,
  parseSymbolLatticeCallees
} from "../../../src/benchmark/comparison-adapters.js";

describe("comparison CLI adapters", () => {
  it("normalizes exact SymbolLattice callable edges and rejects truncated evidence", () => {
    const output = JSON.stringify({
      match: { status: "exact" },
      callees: {
        truncated: false,
        items: [
          { symbol: { name: "targetB", kind: "method" }, edge: { kind: "calls" } },
          { symbol: { name: "IgnoredType", kind: "interface" }, edge: { kind: "calls" } },
          { symbol: { name: "targetA", kind: "function" }, edge: { kind: "calls" } },
          { symbol: { name: "notACall", kind: "function" }, edge: { kind: "references" } }
        ]
      }
    });

    expect(parseSymbolLatticeCallees(output, "sourceFn")).toEqual([
      "calls|sourceFn|targetA",
      "calls|sourceFn|targetB"
    ]);
    expect(() => parseSymbolLatticeCallees(JSON.stringify({
      match: { status: "exact" },
      callees: { truncated: true, items: [] }
    }), "sourceFn")).toThrow("truncated");
  });

  it("normalizes the SymbolLattice callees CLI contract", () => {
    const output = JSON.stringify({
      symbol: { name: "sourceFn", kind: "function" },
      relations: [
        { symbol: { name: "targetB", kind: "method" }, edge: { kind: "calls" } },
        { symbol: { name: "IgnoredType", kind: "class" }, edge: { kind: "calls" } },
        { symbol: { name: "targetA", kind: "function" }, edge: { kind: "calls" } }
      ],
      ranking: { truncated: false }
    });

    expect(parseSymbolLatticeCallees(output, "sourceFn")).toEqual([
      "calls|sourceFn|targetA",
      "calls|sourceFn|targetB"
    ]);
    expect(() => parseSymbolLatticeCallees(JSON.stringify({
      symbol: { name: "sourceFn", kind: "function" },
      relations: [],
      ranking: { truncated: true }
    }), "sourceFn")).toThrow("truncated");
  });

  it("normalizes callable CodeGraph rows while excluding dependency-like rows", () => {
    const output = [
      '\u001b[1mCallees of "sourceFn" (4):\u001b[0m',
      "\u001b[36mfunction    \u001b[0m\u001b[37mtargetB\u001b[0m",
      "  src/b.ts:2",
      "method      targetA",
      "  src/a.ts:1",
      "constant    CONFIG",
      "  src/config.ts:1",
      "type_alias  Input",
      "  src/types.ts:1"
    ].join("\n");

    expect(parseCodeGraphCallees(output, "sourceFn")).toEqual([
      "calls|sourceFn|targetA",
      "calls|sourceFn|targetB"
    ]);

    expect(parseCodeGraphCallees(JSON.stringify({
      symbol: "sourceFn",
      callees: [
        { name: "targetB", kind: "method" },
        { name: "CONFIG", kind: "constant" },
        { name: "targetA", kind: "function" }
      ]
    }), "sourceFn")).toEqual([
      "calls|sourceFn|targetA",
      "calls|sourceFn|targetB"
    ]);
  });

  it("rejects missing, ambiguous, and internally inconsistent CodeGraph output", () => {
    expect(() => parseCodeGraphCallees('Symbol "missing" not found', "missing")).toThrow("not found");
    expect(() => parseCodeGraphCallees("Multiple symbols found", "ambiguous")).toThrow("ambiguous");
    expect(() => parseCodeGraphCallees('Callees of "sourceFn" (2):\nfunction    targetA', "sourceFn"))
      .toThrow("declared 2 relations but emitted 1");
  });
});
