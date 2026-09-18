import { describe, expect, it } from "vitest";
import { downstreamFocusPaths, EXPLORE_FLOW_FOCUS_LIMITS } from "../../src/application/explore-flow-focus.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";

const node = (id: string): SymbolNode => ({ id, name: id, qualifiedName: `a.ts#${id}`, filePath: "a.ts", kind: "function",
  range: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }, isExported: true, declarationOrdinal: 0 });
const call = (sourceId: string, targetId: string, id = `${sourceId}-${targetId}`): GraphEdge => ({ id, sourceId, targetId,
  kind: "calls", resolution: "exact", confidence: 1, filePath: "a.ts", referenceName: targetId,
  range: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } }, evidence: { ruleId: "test.call", stage: "lexical" } });
const symbols = ["caller", "anchor", "middle", "later"].map(node);
const edges = [call("caller", "anchor"), call("anchor", "middle"), call("middle", "later")];

describe("bounded downstream flow focuses", () => {
  it("retains each exact directed hop and does not return a direct callee as a later focus", () => {
    const found = downstreamFocusPaths({ symbols, edges }, symbols[1]!, symbols[0]!);
    expect([...found.keys()]).toEqual(["later"]);
    expect(found.get("later")).toMatchObject({ examinedEdges: 2, truncated: false,
      replacedCall: edges[0], path: { symbols: symbols.slice(1), edges: edges.slice(1) } });
    expect(downstreamFocusPaths({ symbols: [...symbols].reverse(), edges: [...edges].reverse() }, symbols[1]!, symbols[0]!)).toEqual(found);
  });
  it("rejects guessed, reversed, misfiled and cross-file hops, and requires the original caller", () => {
    for (const invalid of [{ ...edges[2]!, resolution: "heuristic" as const }, { ...edges[2]!, sourceId: "later", targetId: "middle" },
      { ...edges[2]!, filePath: "b.ts" }, { ...edges[2]!, kind: "imports" as const }]) {
      expect(downstreamFocusPaths({ symbols, edges: [edges[0]!, edges[1]!, invalid] }, symbols[1]!, symbols[0]!).size).toBe(0);
    }
    expect(downstreamFocusPaths({ symbols, edges: edges.slice(1) }, symbols[1]!, symbols[0]!).size).toBe(0);
    expect(downstreamFocusPaths({ symbols: symbols.map(s => s.id === "later" ? { ...s, filePath: "b.ts" } : s), edges }, symbols[1]!, symbols[0]!).size).toBe(0);
  });
  it("stops at hop/node/edge bounds and cannot loop through the displaced caller", () => {
    const chain = [node("caller"), ...Array.from({ length: 8 }, (_, i) => node(`n${i}`))];
    const links = [call("caller", "n0"), ...Array.from({ length: 7 }, (_, i) => call(`n${i}`, `n${i + 1}`)), call("n1", "caller")];
    const capped = downstreamFocusPaths({ symbols: chain, edges: links }, chain[1]!, chain[0]!);
    expect([...capped.keys()]).toEqual(["n2", "n3", "n4"]);
    expect(capped.get("n4")?.truncated).toBe(true);
    const many = [...symbols, ...Array.from({ length: 150 }, (_, i) => node(`extra${i}`))];
    const fanout = downstreamFocusPaths({ symbols: many, edges: [...edges, ...many.slice(4).map(s => call("later", s.id))] }, symbols[1]!, symbols[0]!);
    expect(fanout.get("later")?.visitedSymbols).toBe(EXPLORE_FLOW_FOCUS_LIMITS.maximumVisitedSymbols);
    expect(fanout.get("later")?.truncated).toBe(true);
    const repeated = downstreamFocusPaths({ symbols, edges: [...edges, ...Array.from({ length: 600 }, (_, i) => call("later", "anchor", `repeat${i}`))] }, symbols[1]!, symbols[0]!);
    expect(repeated.get("later")).toMatchObject({ examinedEdges: 512, truncated: true });
  });
});
