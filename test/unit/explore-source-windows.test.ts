import { describe, expect, it } from "vitest";

import {
  allocateExploreSourceWindowCharacters,
  type ExploreSourceWindowAllocationCandidate,
  EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS,
  EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY,
  EXPLORE_SOURCE_WINDOW_LIMITS,
  EXPLORE_SOURCE_WINDOW_POLICY,
  planExploreSourceWindows
} from "../../src/application/explore-source-windows.js";
import type { ExploreConnection, ExploreFocus } from "../../src/application/types.js";
import type { ExplorePathSpinePlan } from "../../src/application/explore-path-spines.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";
import type { ImpactPath } from "../../src/domain/graph.js";
import { matchExploreCalleeSource, EXPLORE_CALLEE_SOURCE_LIMITS } from "../../src/application/explore-callee-source.js";

describe("spare-budget flow callee source", () => {
  const caller = symbol("runTask", "src/run.ts", 1);
  const targets = [30, 50, 70].map(line => symbol(`helper${line}`, caller.filePath, line));
  const calls = targets.map((target, index) => edge(`call${index}`, caller, target, 2 + index).edge);
  const documents = new Map([[caller.filePath, { sourceText: Array<string>(74).fill("// implementation").join("\n") }]]);
  const primary = { ...focus(1, caller, 1, 5), callees: {
    items: targets.map((target, index) => ({ symbol: target, edge: calls[index]! })), truncated: false
  } };

  it("fills spare slots for an explicitly named flow without requiring a repeated query word", () => {
    const plan = planExploreSourceWindows([primary], [], undefined, ["runtask"], documents, true);
    expect(plan.windows.map(window => window.reason)).toEqual(["exact-flow-callee", "exact-flow-callee"]);
    expect(plan.windows[0]).toMatchObject({ relatedSymbolIds: [targets[0]!.id], connectionEdgeIds: [calls[0]!.id] });
    expect(plan.windows.every(window => window.sourceMatches === undefined)).toBe(true);
    expect(plan.summary).toMatchObject({ candidateCount: 3, selectedCount: 2, truncated: true });
    expect(planExploreSourceWindows([{ ...primary, callees: { ...primary.callees,
      items: [...primary.callees.items].reverse() } }], [], undefined, ["runtask"], documents, true)).toEqual(plan);
  });

  it("keeps ordinary searches, non-exact focuses, delivered bodies and unavailable source out of the fallback", () => {
    expect(planExploreSourceWindows([primary], [], undefined, ["runtask"], documents).windows).toEqual([]);
    expect(planExploreSourceWindows([{ ...primary, reasons: ["partial-symbol-term"] }], [], undefined, ["runtask"], documents, true).windows).toEqual([]);
    expect(planExploreSourceWindows([primary], [], undefined, ["unrelated"], documents, true).windows).toEqual([]);
    expect(planExploreSourceWindows([primary], [], undefined, ["runtask"], new Map(), true).windows).toEqual([]);
    expect(planExploreSourceWindows([{ ...primary, source: focus(1, caller, 1, 74).source }], [], undefined, ["runtask"], documents, true).windows).toEqual([]);
  });

  it("requires exact directed calls and deduplicates repeated calls to the same target", () => {
    for (const invalid of [{ ...calls[0]!, resolution: "heuristic" as const }, { ...calls[0]!, kind: "imports" as const },
      { ...calls[0]!, sourceId: "wrong" }, { ...calls[0]!, targetId: "wrong" }, { ...calls[0]!, filePath: "wrong.ts" }]) {
      const item = { ...primary, callees: { items: [{ symbol: targets[0]!, edge: invalid }], truncated: false } };
      expect(planExploreSourceWindows([item], [], undefined, ["runtask"], documents, true).windows).toEqual([]);
    }
    const duplicate = { ...primary, callees: { items: [primary.callees.items[0]!, {
      symbol: targets[0]!, edge: { ...calls[0]!, id: "repeat", range: { start: { line: 4, column: 3 }, end: { line: 4, column: 15 } } }
    }], truncated: false } };
    expect(planExploreSourceWindows([duplicate], [], undefined, ["runtask"], documents, true).windows).toHaveLength(1);
    const external = { ...primary, callees: { items: [{ symbol: { ...targets[0]!, filePath: "other.ts" }, edge: calls[0]! }], truncated: false } };
    expect(planExploreSourceWindows([external], [], undefined, ["runtask"], documents, true).windows).toEqual([]);
  });

  it("does not count lexical candidates twice or bypass their existing cap", () => {
    const lines = Array<string>(74).fill("");
    for (const target of targets) lines[target.range.start.line] = "  shutdown();";
    const docs = new Map([[caller.filePath, { sourceText: lines.join("\n") }]]);
    const original = planExploreSourceWindows([primary], [], undefined, ["runtask", "shutdown"], docs);
    const result = planExploreSourceWindows([primary], [], undefined, ["runtask", "shutdown"], docs, true);
    expect(result.windows).toEqual(original.windows);
    expect(result.summary).toEqual(original.summary);
  });

  it("preserves every existing window when all eight slots are occupied", () => {
    const full = [primary, ...[2, 3, 4].map(rank => focus(rank,
      symbol(`root${rank}`, caller.filePath, rank * 100), rank * 100, rank * 100 + 4))]
      .map(item => ({ ...item, callers: { truncated: false, items: [1, 2].map(offset => {
        const upstream = symbol(`up${item.rank}-${offset}`, caller.filePath, item.rank * 100 + offset * 20);
        return { symbol: upstream, edge: edge(upstream.id, upstream, item.symbol, upstream.range.start.line + 1).edge };
      }) } }));
    const original = planExploreSourceWindows(full, [], undefined, ["runtask"], documents);
    const result = planExploreSourceWindows(full, [], undefined, ["runtask"], documents, true);
    expect(original.windows).toHaveLength(8);
    expect(result.windows).toEqual(original.windows);
    expect(result.summary).toMatchObject({ candidateCount: 11, selectedCount: 8, truncated: true });
  });
});

describe("spare source allocation", () => {
  const base = { index: 0, filePath: "base.ts", requestedCharacters: 700, fullFileCharacters: 1000,
    relevanceWeight: 100, wholeFileEligible: true };
  const extra = { index: 1, filePath: "extra.ts", requestedCharacters: 400, fullFileCharacters: 400,
    relevanceWeight: 5000, wholeFileEligible: false, spareOnly: true };

  it("preserves existing reservations and whole-file promotions before spending remaining capacity", () => {
    const input = { totalCharacterBudget: 2000, primaryEmittedCharacters: 200 };
    const original = allocateExploreSourceWindowCharacters({ ...input, candidates: [base] });
    const result = allocateExploreSourceWindowCharacters({ ...input, candidates: [extra, base] });
    expect(original.windows[0]?.renderMode).toBe("whole-file");
    expect(result.windows[0]).toEqual(original.windows[0]);
    expect(result.windows[1]).toMatchObject({ allocatedCharacters: 400, allocationPhase: "remaining-budget" });
    expect(result.budget.remainingPhase?.availableCharacters).toBe(800);
    expect(result.summary.allocatedCharacters).toBe(1400);
    expect(result.summary.unusedCharacters).toBe(400);
  });

  it("never reduces existing evidence when the envelope is exhausted", () => {
    const input = { totalCharacterBudget: 800, primaryEmittedCharacters: 100 };
    const original = allocateExploreSourceWindowCharacters({ ...input, candidates: [base] });
    const result = allocateExploreSourceWindowCharacters({ ...input, candidates: [base, extra] });
    expect(result.windows[0]).toEqual(original.windows[0]);
    expect(result.windows[1]).toMatchObject({ allocatedCharacters: 0, truncated: true });
    expect(result.summary).toMatchObject({ allocatedCharacters: 700, unusedCharacters: 0, truncated: true });
  });

  it("validates duplicate indexes across phases and disallows spare whole-file upgrades", () => {
    const input = { totalCharacterBudget: 2000, primaryEmittedCharacters: 200 };
    expect(() => allocateExploreSourceWindowCharacters({ ...input, candidates: [base, { ...extra, index: 0 }] })).toThrow(RangeError);
    expect(() => allocateExploreSourceWindowCharacters({ ...input, candidates: [{ ...extra, wholeFileEligible: true }] })).toThrow(RangeError);
  });
});

describe("literal source for differently named exact callees", () => {
  const caller = symbol("run", "src/run.ts", 1);
  const callee = symbol("finish", caller.filePath, 30);
  const call = edge("run-finish", caller, callee, 2).edge;
  const primary = { ...focus(1, caller, 1, 5), callees: { items: [{ symbol: callee, edge: call }], truncated: false } };
  const source = [...Array<string>(29).fill(""), "function finish() {", "  shutdown();", "}"].join("\n");
  const documents = new Map([[caller.filePath, { sourceText: source }]]);

  it("attaches exact call proof and literal coordinates without changing name-based selection", () => {
    const plan = planExploreSourceWindows([primary], [], undefined, ["shutdown"], documents);
    expect(plan.windows).toEqual([expect.objectContaining({ reason: "exact-callee-source",
      filePath: caller.filePath, startLine: 27, endLine: 35, connectionEdgeIds: [call.id], relatedSymbolIds: [callee.id],
      sourceMatches: [{ term: "shutdown", token: "shutdown", filePath: caller.filePath,
        range: { start: { line: 31, column: 3 }, end: { line: 31, column: 11 } } }] })]);
    expect(plan.calleeSourceSearch).toMatchObject({ candidateCount: 1, scannedSymbols: 1, matchedSymbols: 1, truncated: false });
    expect(planExploreSourceWindows([primary], [], undefined, ["unrelated"], documents).windows).toEqual([]);
    expect(planExploreSourceWindows([primary], [], undefined, ["finish"], documents).windows[0]?.reason).toBe("exact-focus-callee");
    expect(planExploreSourceWindows([{ ...primary, source: focus(1, caller, 1, 40).source }], [], undefined, ["shutdown"], documents).windows).toEqual([]);
  });

  it("rejects heuristic or inconsistent call receipts and never fetches additional files", () => {
    for (const invalid of [{ ...call, resolution: "heuristic" as const }, { ...call, kind: "imports" as const },
      { ...call, sourceId: "wrong" }, { ...call, targetId: "wrong" }, { ...call, filePath: "wrong.ts" }]) {
      const item = { ...primary, callees: { items: [{ symbol: callee, edge: invalid }], truncated: false } };
      expect(planExploreSourceWindows([item], [], undefined, ["shutdown"], documents).windows).toEqual([]);
    }
    const external = { ...primary, callees: { items: [{ symbol: { ...callee, filePath: "other.ts" }, edge: call }], truncated: false } };
    expect(planExploreSourceWindows([external], [], undefined, ["shutdown"], documents).windows).toEqual([]);
    const missing = planExploreSourceWindows([primary], [], undefined, ["shutdown"], new Map());
    expect(missing.windows).toEqual([]);
    expect(missing.calleeSourceSearch?.unavailableFiles).toEqual([caller.filePath]);
  });

  it("caps supplementary windows and preserves the existing full envelope", () => {
    const targets = [30, 50, 70].map((line) => symbol(`finish${line}`, caller.filePath, line));
    const lines = Array<string>(72).fill("");
    for (const target of targets) lines[target.range.start.line] = "  shutdown();";
    const docs = new Map([[caller.filePath, { sourceText: lines.join("\n") }]]);
    const item = { ...primary, callees: { items: targets.map((target) => ({ symbol: target,
      edge: edge(`call-${target.id}`, caller, target, 2).edge })), truncated: false } };
    const plan = planExploreSourceWindows([item], [], undefined, ["shutdown"], docs);
    expect(plan.windows).toHaveLength(2);
    expect(plan.summary).toMatchObject({ candidateCount: 3, selectedCount: 2, truncated: true });
    const full = [item, ...[2, 3, 4].map((rank) => focus(rank, symbol(`root${rank}`, caller.filePath, rank * 100), rank * 100, rank * 100 + 4))]
      .map((entry) => ({ ...entry, callers: { truncated: false, items: [1, 2].map((offset) => {
        const upstream = symbol(`up${entry.rank}-${offset}`, caller.filePath, entry.rank * 100 + offset * 20);
        return { symbol: upstream, edge: edge(upstream.id, upstream, entry.symbol, upstream.range.start.line + 1).edge };
      }) } }));
    const original = planExploreSourceWindows(full, [], undefined, ["shutdown"]);
    const candidate = planExploreSourceWindows(full, [], undefined, ["shutdown"], docs);
    expect(original.windows).toHaveLength(8);
    expect(candidate.windows).toEqual(original.windows);
    expect(candidate.summary.truncated).toBe(true);
  });

  it("bounds symbols and file/declaration characters without inventing a cut token", () => {
    const candidates = Array.from({ length: 33 }, (_, index) => ({ ...callee, id: `symbol${index}` }));
    const capped = matchExploreCalleeSource(candidates, ["shutdown"], documents);
    expect(capped.receipt).toMatchObject({ candidateCount: 33, scannedSymbols: 32, matchedSymbols: 32, truncated: true });
    const start = { ...callee, range: { start: { line: 1, column: 1 }, end: { line: 2, column: 2 } } };
    for (const maximum of [EXPLORE_CALLEE_SOURCE_LIMITS.maximumSourceCharacters,
      EXPLORE_CALLEE_SOURCE_LIMITS.maximumDeclarationCharacters]) {
      const cut = " ".repeat(maximum - 8) + "shutdownOther\n}";
      const result = matchExploreCalleeSource([start], ["shutdown"], new Map([[caller.filePath, { sourceText: cut }]]));
      expect(result.matches.size).toBe(0);
      expect(result.receipt.truncated).toBe(true);
      expect(result.receipt.sourceCharacters).toBeLessThanOrEqual(EXPLORE_CALLEE_SOURCE_LIMITS.maximumSourceCharacters);
    }
    const excluded = matchExploreCalleeSource([callee], ["shutdown"],
      new Map([[caller.filePath, { sourceText: "shutdown\n" + source.replace("shutdown", "unrelated") }]]));
    expect(excluded.matches.size).toBe(0);
  });
});

function impactPath(symbols: readonly SymbolNode[], edges: readonly GraphEdge[]): ImpactPath {
  return { symbols, edges, steps: edges.map((edge, index) => ({ from: symbols[index]!, to: symbols[index + 1]!, edge })) };
}

describe("query-relevant upstream call evidence", () => {
  const root = symbol("chooseStatus", "src/reply.js", 1);
  const bridge = symbol("handleFailure", "src/reply.js", 30);
  const entry = symbol("Reply.prototype.send", "src/reply.js", 60);
  const first = edge("bridge-root", bridge, root, 31).edge;
  const second = edge("entry-bridge", entry, bridge, 61).edge;
  const path = impactPath([root, bridge, entry], [first, second]);
  const primary = { ...focus(1, root, 1, 5),
    callers: { items: [{ symbol: bridge, edge: first }], truncated: false },
    impact: { paths: [path], truncated: false } };

  it("fills spare slots with upstream source and preserves both directed edge receipts", () => {
    const plan = planExploreSourceWindows([primary], [], undefined, ["sending"]);
    expect(plan.windows).toEqual([
      expect.objectContaining({ startLine: 28, endLine: 34, reason: "exact-focus-call" }),
      expect.objectContaining({ startLine: 58, endLine: 64, reason: "exact-impact-call",
        connectionEdgeIds: [first.id, second.id], relatedSymbolIds: [bridge.id, entry.id] })
    ]);
    expect(plan.summary.truncated).toBe(false);
    expect(planExploreSourceWindows([primary], [], undefined, ["unrelated"]).windows).toHaveLength(1);
  });

  it("rejects heuristic hops, reversed edges, broken chains, cycles and unavailable files", () => {
    for (const invalid of [
      impactPath(path.symbols, [{ ...first, resolution: "heuristic" }, second]),
      impactPath(path.symbols, [first, { ...second, sourceId: bridge.id, targetId: entry.id }]),
      impactPath(path.symbols, [first, { ...second, targetId: root.id }]),
      impactPath(path.symbols, [first, { ...second, filePath: "wrong.js" }]),
      impactPath([root, bridge, root], [first, { ...second, sourceId: root.id }]),
      impactPath([root, bridge, { ...entry, filePath: "other.js" }], [first, { ...second, filePath: "other.js" }])
    ]) {
      const plan = planExploreSourceWindows([{ ...primary, impact: { paths: [invalid], truncated: false } }], [], undefined, ["send", "status"]);
      expect(plan.windows).toHaveLength(1);
    }
    const missing = impactPath([root, bridge, { ...entry, filePath: "other.js" }], [first, { ...second, filePath: "other.js" }]);
    expect(planExploreSourceWindows([{ ...primary, impact: { paths: [missing], truncated: false } }], [], undefined, ["send"])
      .summary.unavailableFileSiteCount).toBe(1);
  });

  it("deduplicates repeated sites, omits delivered source and discloses the supplemental cap", () => {
    const more = [path, path, ...[80, 100, 120].map((line) => {
      const sender = { ...symbol(`sender-${line}`, "src/reply.js", line), name: "sendResponse" };
      return impactPath([root, bridge, sender], [first, edge(`sender-${line}`, sender, bridge, line + 1).edge]);
    })];
    const plan = planExploreSourceWindows([{ ...primary, impact: { paths: more, truncated: false } }], [], undefined, ["sending"]);
    expect(plan.windows.filter((item) => item.reason === "exact-impact-call")).toHaveLength(2);
    expect(plan.summary).toMatchObject({ candidateCount: 5, selectedCount: 3, truncated: true });
    const delivered = { ...primary, source: focus(1, root, 1, 70).source };
    expect(planExploreSourceWindows([delivered], [], undefined, ["sending"]).windows).toEqual([]);
  });

  it("replaces lower-ranked direct calls with query-relevant upstream evidence within the full envelope", () => {
    const focuses = [primary, ...[2, 3, 4].map((rank) => focus(rank, symbol(`root-${rank}`, "src/reply.js", rank * 100), rank * 100, rank * 100 + 4))]
      .map((item) => ({ ...item, callers: { truncated: false, items: [1, 2].map((offset) => {
        const caller = symbol(`caller-${item.rank}-${offset}`, "src/reply.js", item.rank * 100 + offset * 20);
        return { symbol: caller, edge: edge(caller.id, caller, item.symbol, caller.range.start.line + 1).edge };
      }) } }));
    const withoutImpact = planExploreSourceWindows(focuses.map((item) => ({ ...item, impact: { paths: [], truncated: false } })), [], undefined, ["sending"]);
    const withImpact = planExploreSourceWindows(focuses, [], undefined, ["sending"]);
    expect(withoutImpact.windows).toHaveLength(8);
    expect(withImpact.windows).toHaveLength(withoutImpact.windows.length);
    expect(withImpact.windows.filter(window => window.reason === "exact-impact-call")).toHaveLength(2);
    expect(withImpact.windows.filter(window => window.focusRank === 4)).toHaveLength(0);
    expect(withImpact.summary).toMatchObject({ replacedLowerRankedCallWindowCount: 2, selectedFocusCount: 3 });
    expect(withImpact.summary.truncated).toBe(true);
  });

  it("accepts a matching intermediate caller without treating it as the terminal caller", () => {
    const plan = planExploreSourceWindows([primary], [], undefined, ["failure"]);
    expect(plan.windows.some(window => window.reason === "exact-impact-call" &&
      window.startLine === 58 && window.connectionEdgeIds.includes(second.id))).toBe(true);
  });

  it("preserves explicit connection evidence when all window slots are protected", () => {
    const focuses = [{ ...primary, callers: { items: [], truncated: false } }, ...[2, 3, 4].map(rank =>
      focus(rank, symbol(`root-${rank}`, root.filePath, rank * 100), rank * 100, rank * 100 + 4))];
    const connections = focuses.flatMap((item, index) => [20, 40].map(offset =>
      edge(`connection-${index}-${offset}`, item.symbol, focuses[(index + 1) % focuses.length]!.symbol,
        item.symbol.range.start.line + offset)));
    const plan = planExploreSourceWindows(focuses, connections, undefined, ["sending"]);
    expect(plan.windows).toHaveLength(8);
    expect(plan.windows.every(window => window.reason === "exact-connection-site")).toBe(true);
    expect(plan.summary.replacedLowerRankedCallWindowCount).toBe(0);
  });

  it("does not displace equally or better ranked calls", () => {
    const earlier = [1, 2, 3, 4].map(rank => {
      const item = focus(rank, symbol(`earlier-${rank}`, root.filePath, rank * 100), rank * 100, rank * 100 + 4);
      return { ...item, callers: { truncated: false, items: [20, 40].map(offset => {
        const caller = symbol(`caller-${rank}-${offset}`, root.filePath, rank * 100 + offset);
        return { symbol: caller, edge: edge(caller.id, caller, item.symbol, caller.range.start.line + 1).edge };
      }) } };
    });
    const plan = planExploreSourceWindows([...earlier, { ...primary, rank: 5 }], [], undefined, ["sending"]);
    expect(plan.windows).toHaveLength(8);
    expect(plan.windows.every(window => window.focusRank < 5)).toBe(true);
    expect(plan.summary.replacedLowerRankedCallWindowCount).toBe(0);
  });

  it("prioritizes concept-rich paths and then their proven upstream entry over side branches", () => {
    const file = "src/payments.ts";
    const audit = symbol("auditSink", file, 1), auditBridge = symbol("auditPayment", file, 30);
    const collector = symbol("collectPayment", file, 60);
    const handler = symbol("refundHandler", file, 100), hook = symbol("refundHook", file, 130);
    const logger = symbol("paymentLog", file, 200), entry = symbol("beginOrder", file, 230);
    const auditPath = impactPath([audit, auditBridge, collector], [
      edge("audit-bridge", auditBridge, audit, 31).edge, edge("collector-audit", collector, auditBridge, 61).edge
    ]);
    const hookCall = edge("hook-handler", hook, handler, 131).edge;
    const handlerPath = impactPath([handler, hook, collector], [hookCall, edge("collector-hook", collector, hook, 71).edge]);
    const logCall = edge("collector-log", collector, logger, 85).edge;
    const logPath = impactPath([logger, collector, entry], [logCall, edge("entry-collector", entry, collector, 231).edge]);
    const focuses = [
      { ...focus(1, audit, 1, 5), impact: { paths: [auditPath], truncated: false } },
      { ...focus(2, handler, 100, 104), callers: { items: [{ symbol: hook, edge: hookCall }], truncated: false },
        impact: { paths: [handlerPath], truncated: false } },
      { ...focus(3, logger, 200, 204), callers: { items: [{ symbol: collector, edge: logCall }], truncated: false },
        impact: { paths: [logPath], truncated: false } }
    ];
    const plan = planExploreSourceWindows(focuses, [], undefined, ["payment", "refund", "handler"]);
    expect(plan.windows.filter(window => window.reason === "exact-impact-call").map(window => window.startLine)).toEqual([68, 228]);
  });
});

describe("query-relevant exact callee source", () => {
  it("includes an uncovered callee implementation after its call site was already delivered", () => {
    const entry = symbol("entry", "src/run.ts", 1);
    const target = symbol("validateRequest", "src/run.ts", 30);
    const linked = edge("entry-target", entry, target, 2);
    const primary = { ...focus(1, entry, 1, 5),
      callees: { items: [{ symbol: target, edge: linked.edge }], truncated: false } };
    const plan = planExploreSourceWindows([primary], [], undefined, ["request"]);
    expect(plan.windows).toEqual([expect.objectContaining({ filePath: "src/run.ts", startLine: 27, endLine: 35,
      reason: "exact-focus-callee", connectionEdgeIds: ["entry-target"], relatedSymbolIds: [target.id] })]);
    expect(planExploreSourceWindows([primary], [], undefined, ["unrelated"]).windows).toEqual([]);
    expect(planExploreSourceWindows([{ ...primary, callees: { items: [
      { symbol: target, edge: { ...linked.edge, resolution: "heuristic" } }
    ], truncated: false } }], [], undefined, ["request"]).windows).toEqual([]);
    const external = { ...target, filePath: "src/other.ts" };
    expect(planExploreSourceWindows([{ ...primary, callees: { items: [
      { symbol: external, edge: linked.edge }
    ], truncated: false } }], [], undefined, ["request"]).windows).toEqual([]);
  });
});

function symbol(id: string, filePath: string, line: number): SymbolNode {
  return {
    id,
    name: id,
    qualifiedName: `${filePath}#${id}`,
    kind: "function",
    filePath,
    range: {
      start: { line, column: 1 },
      end: { line: line + 2, column: 2 }
    },
    isExported: true,
    declarationOrdinal: 0
  };
}

function edge(
  id: string,
  source: SymbolNode,
  target: SymbolNode,
  line: number,
  resolution: GraphEdge["resolution"] = "exact"
): ExploreConnection {
  return {
    source,
    target,
    edge: {
      id,
      sourceId: source.id,
      targetId: target.id,
      kind: "calls",
      filePath: source.filePath,
      range: {
        start: { line, column: 3 },
        end: { line, column: 15 }
      },
      resolution,
      confidence: resolution === "exact" ? 1 : 0.5,
      referenceName: target.name,
      evidence: { ruleId: "test.call", stage: "lexical" }
    }
  };
}

function focus(rank: number, node: SymbolNode, primaryStart: number, primaryEnd: number): ExploreFocus {
  return {
    rank,
    symbol: node,
    score: 100,
    baseScore: 100,
    connectionScore: 0,
    matchedTerms: [node.name.toLowerCase()],
    reasons: ["exact-symbol-term"],
    reference: node.qualifiedName,
    match: { status: "exact", reference: node.qualifiedName, symbol: node, candidates: [node] },
    matchCandidatesTruncated: false,
    sourceAvailability: "active-generation",
    source: {
      filePath: node.filePath,
      startLine: primaryStart,
      endLine: primaryEnd,
      lines: [],
      range: {
        start: { line: primaryStart, column: 1 },
        end: { line: primaryEnd + 1, column: 1 }
      },
      text: "primary",
      sourceIdentity: {
        policy: "source-delivery-v2",
        id: `source:${"0".repeat(64)}`,
        canonicalization: "line-endings-lf",
        filePath: node.filePath,
        fullFileCharacterOffsets: { start: 0, end: 7 },
        contentSha256: "0".repeat(64),
        offsetMap: {
          policy: "source-delivery-offset-map-v1",
          deliveredTextLength: 7,
          sourceTextLength: 7,
          spans: [],
          mapSha256: "0".repeat(64)
        }
      },
      requestedCharacters: 7,
      emittedCharacters: 7,
      truncated: false,
      truncationReason: null
    },
    callers: { items: [], truncated: false },
    callees: { items: [], truncated: false },
    impact: { paths: [], truncated: false }
  };
}

describe("explore source window planning", () => {
  it("retains an uncovered call site even when its padding overlaps a primary excerpt", () => {
    const source = symbol("source", "src/source.ts", 1);
    const target = symbol("target", "src/target.ts", 1);
    const plan = planExploreSourceWindows([focus(1, source, 1, 5)], [
      edge("covered", source, target, 3), edge("uncovered", source, target, 8)
    ]);
    expect(plan.windows).toHaveLength(1);
    expect(plan.windows[0]).toMatchObject({ startLine: 5, endLine: 11, connectionEdgeIds: ["uncovered"] });
  });

  it("does not treat a partially delivered last line as complete evidence", () => {
    const source = symbol("source", "src/source.ts", 1);
    const target = symbol("target", "src/target.ts", 1);
    const item = focus(1, source, 1, 5);
    const partial: ExploreFocus = { ...item, source: { ...item.source!, truncated: true,
      truncationReason: "character-budget", range: { start: { line: 1, column: 1 }, end: { line: 5, column: 3 } } } };
    expect(planExploreSourceWindows([partial], [edge("partial-line", source, target, 5)]).windows)
      .toHaveLength(1);
  });

  it("uses exact incoming and outgoing call sites within requested files and discloses others", () => {
    const source = symbol("source", "src/source.ts", 20);
    const caller = symbol("caller", source.filePath, 1);
    const target = symbol("target", "src/target.ts", 1);
    const external = symbol("external", "src/other.ts", 1);
    const incoming = edge("incoming", caller, source, 10);
    const outgoing = edge("outgoing", source, target, 50);
    const heuristic = edge("guess", source, target, 60, "heuristic");
    const outside = edge("outside", external, source, 30);
    const item: ExploreFocus = { ...focus(1, source, 18, 22),
      callers: { items: [{ symbol: caller, edge: incoming.edge }, { symbol: external, edge: outside.edge }], truncated: false },
      callees: { items: [{ symbol: target, edge: outgoing.edge }, { symbol: target, edge: heuristic.edge }], truncated: false } };
    const plan = planExploreSourceWindows([item], []);
    expect(plan.windows.map((window) => window.connectionEdgeIds)).toEqual([["incoming"], ["outgoing"]]);
    expect(plan.windows.every((window) => window.reason === "exact-focus-call")).toBe(true);
    expect(plan.summary.unavailableFileSiteCount).toBe(1);
  });

  it("recognizes proof already covered by another focus in the same file", () => {
    const source = symbol("source", "src/source.ts", 1);
    const target = symbol("target", source.filePath, 20);
    const plan = planExploreSourceWindows([focus(1, source, 1, 5), focus(2, target, 18, 25)],
      [edge("covered-by-another-focus", source, target, 22)]);
    expect(plan.windows).toEqual([]);
  });

  it("merges nearby exact call sites, excludes the primary excerpt, and enforces bounds", () => {
    const entry = symbol("entry", "src/entry.ts", 1);
    const target = symbol("target", "src/target.ts", 1);
    const secondary = symbol("secondary", "src/secondary.ts", 1);
    const connections = [
      edge("overlaps-primary", entry, target, 3),
      edge("near-a", entry, target, 100),
      edge("near-b", entry, secondary, 104),
      edge("far-a", entry, target, 200),
      edge("far-b", entry, target, 300),
      edge("heuristic", entry, target, 400, "heuristic"),
      edge("second-focus", secondary, target, 50)
    ];

    const plan = planExploreSourceWindows(
      [focus(1, entry, 1, 5), focus(2, secondary, 1, 5)],
      connections
    );

    expect(plan).toMatchObject({
      policy: EXPLORE_SOURCE_WINDOW_POLICY,
      limits: EXPLORE_SOURCE_WINDOW_LIMITS,
      summary: {
        candidateCount: 4,
        selectedCount: 3,
        selectedFocusCount: 2,
        truncated: true
      }
    });
    expect(plan.windows).toEqual([
      expect.objectContaining({
        index: 0,
        focusRank: 1,
        filePath: "src/entry.ts",
        startLine: 97,
        endLine: 107,
        connectionEdgeIds: ["near-a", "near-b"],
        relatedSymbolIds: ["target", "secondary"],
        reason: "exact-connection-site"
      }),
      expect.objectContaining({
        index: 1,
        focusRank: 1,
        startLine: 197,
        endLine: 203,
        connectionEdgeIds: ["far-a"]
      }),
      expect.objectContaining({
        index: 2,
        focusRank: 2,
        filePath: "src/secondary.ts",
        startLine: 47,
        endLine: 53,
        connectionEdgeIds: ["second-focus"]
      })
    ]);
  });

  it("is independent of connection input order", () => {
    const source = symbol("source", "src/source.ts", 1);
    const target = symbol("target", "src/target.ts", 1);
    const connections = [edge("b", source, target, 80), edge("a", source, target, 40)];

    expect(
      planExploreSourceWindows([focus(1, source, 1, 5)], [...connections].reverse())
    ).toEqual(planExploreSourceWindows([focus(1, source, 1, 5)], connections));
  });

  it("keeps raw explore relevance so generated source worth is applied exactly once", () => {
    const source = symbol("source", "src/source.generated.ts", 1);
    const target = symbol("target", "src/target.ts", 1);
    const generatedFocus: ExploreFocus = {
      ...focus(1, source, 1, 5),
      score: 510,
      baseScore: 510,
      generated: {
        classifierVersion: "generated-evidence-v1",
        generated: true,
        evidence: [{ kind: "path", ruleId: "test.generated", range: null }]
      },
      sourceWorth: 0.3,
      rankingScore: 153,
      rankingDecision: "generated-source-worth"
    };
    const plan = planExploreSourceWindows(
      [generatedFocus],
      [edge("source-target", source, target, 100)]
    );

    expect(plan.windows[0]).toMatchObject({ relevanceWeight: 510 });
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [{
        index: 0,
        filePath: source.filePath,
        requestedCharacters: 1_000,
        fullFileCharacters: 1_000,
        relevanceWeight: plan.windows[0]!.relevanceWeight,
        wholeFileEligible: false,
        generated: true,
        generatedClassifierVersion: "generated-evidence-v1",
        generatedEvidenceRuleIds: ["test.generated"]
      }]
    });

    expect(allocation.windows[0]).toMatchObject({
      relevanceWeight: 510,
      sourceWorth: 0.3,
      effectiveWeight: 153
    });
  });

  it("adds a bounded bridge declaration window from an exact path spine", () => {
    const entry = symbol("entry", "src/entry.ts", 1);
    const bridge = symbol("bridge", "src/bridge.ts", 1);
    const target = symbol("target", "src/target.ts", 20);
    const first = edge("entry-bridge", entry, bridge, 5);
    const second = edge("bridge-target", bridge, target, 12);
    const spinePlan: ExplorePathSpinePlan = {
      policy: "explore-path-spines-v3",
      limits: {
        maximumPairAttempts: 16, maximumReversePairAttempts: 16,
        maximumHops: 4,
        maximumVisitedSymbolsPerPair: 500,
        maximumSpines: 4,
        maximumBridgeSymbols: 8
      },
      summary: {
        pairCandidateCount: 1,
        attemptedPairCount: 1,
        discoveredSpineCount: 1,
        selectedSpineCount: 1,
        bridgeSymbolCount: 1,
        pairAttemptsTruncated: false,
        spinesTruncated: false,
        traversalTruncated: false
      },
      spines: [{
        index: 0,
        fromFocusRank: 1,
        toFocusRank: 2,
        score: 80,
        bridgeSymbols: [bridge],
        edgeIds: [first.edge.id, second.edge.id],
        path: {
          symbols: [entry, bridge, target],
          edges: [first.edge, second.edge],
          steps: [
            { from: entry, to: bridge, edge: first.edge },
            { from: bridge, to: target, edge: second.edge }
          ]
        }
      }]
    };

    const plan = planExploreSourceWindows(
      [focus(1, entry, 1, 5), focus(2, target, 20, 24)],
      [],
      spinePlan
    );

    expect(plan.windows).toEqual([
      expect.objectContaining({
        index: 0,
        focusRank: 1,
        filePath: "src/bridge.ts",
        startLine: 1,
        endLine: 6,
        connectionEdgeIds: ["entry-bridge", "bridge-target"],
        relatedSymbolIds: ["bridge"],
        pathSpineIndexes: [0],
        relevanceWeight: 100,
        reason: "exact-path-spine"
      })
    ]);

    const bridges = [1, 2, 3].map((index) => symbol(`bridge-${index}`, `src/bridge-${index}.ts`, 1));
    const chain = [entry, ...bridges, target];
    const chainEdges = chain.slice(0, -1).map((node, index) => edge(`chain-${index}`, node, chain[index + 1]!, 2).edge);
    const caller = symbol("caller", entry.filePath, 100);
    const incoming = edge("incoming", caller, entry, 101);
    const extended = planExploreSourceWindows([
      { ...focus(1, entry, 1, 5), callers: { items: [{ symbol: caller, edge: incoming.edge }], truncated: false } },
      focus(2, target, 20, 24)
    ], [], {
      ...spinePlan,
      summary: { ...spinePlan.summary, bridgeSymbolCount: 3 },
      spines: [{ ...spinePlan.spines[0]!, bridgeSymbols: bridges, edgeIds: chainEdges.map((item) => item.id),
        path: { symbols: chain, edges: chainEdges,
          steps: chainEdges.map((edge, index) => ({ from: chain[index]!, to: chain[index + 1]!, edge })) } }]
    });
    expect(extended.windows.filter((window) => window.reason === "exact-path-spine")).toHaveLength(3);
    expect(extended.windows.some((window) => window.connectionEdgeIds.includes("incoming"))).toBe(true);
    expect(extended.summary.truncated).toBe(false);
  });

  it("reserves only the source budget left after primary focus excerpts", () => {
    expect(
      allocateExploreSourceWindowCharacters({
        totalCharacterBudget: 24_000,
        primaryEmittedCharacters: 23_000,
        candidates: [
          {
            index: 1,
            filePath: "src/second.ts",
            requestedCharacters: 1_000,
            fullFileCharacters: 1_000,
            relevanceWeight: 1,
            wholeFileEligible: false
          },
          {
            index: 0,
            filePath: "src/first.ts",
            requestedCharacters: 1_000,
            fullFileCharacters: 1_000,
            relevanceWeight: 3,
            wholeFileEligible: false
          }
        ]
      })
    ).toEqual({
      policy: EXPLORE_SOURCE_WINDOW_ALLOCATION_POLICY,
      budget: {
        totalCharacterBudget: 24_000,
        primaryEmittedCharacters: 23_000,
        availableCharacters: 1_000,
        minimumPerWindow: EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.minimumPerWindow,
        maximumShareFraction: EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.maximumShareFraction,
        generatedSourceWorth: 0.3,
        relativeCliffFraction: 0.15,
        relativeCliffMaximumWeight: 10,
        relativeCliffThreshold: 0.45,
        wholeFileGraceFraction: 0.15,
        wholeFileGraceMaximumCharacters: 800,
        wholeFileBuyMinimumCoverageFraction: 0.6,
        wholeFileBuyOvershootFraction: 0.15,
        wholeFileBuyOvershootBudget: 3_600,
        wholeFileBuyOvershootSpentCharacters: 0
      },
      summary: {
        candidateCount: 2,
        generatedCandidates: 0,
        cliffedWindows: 0,
        wholeFileEligibleCandidates: 0,
        wholeFilePromotedWindows: 0,
        requestedCharacters: 2_000,
        baseAllocatedCharacters: 1_000,
        allocatedCharacters: 1_000,
        unusedCharacters: 0,
        truncated: true
      },
      windows: [
        {
          index: 0,
          filePath: "src/first.ts",
          windowRequestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          requestedCharacters: 1_000,
          relevanceWeight: 3,
          generated: false,
          generatedClassifierVersion: "unclassified-allocation-input",
          generatedEvidenceRuleIds: [],
          sourceWorth: 1,
          effectiveWeight: 3,
          cliffExempt: false,
          allocationDecision: "admitted",
          maximumShareCharacters: 700,
          baseAllocatedCharacters: 622,
          allocatedCharacters: 622,
          wholeFileEligible: false,
          wholeFileCoverageFraction: 0.622,
          wholeFileGraceCharacters: 93,
          wholeFileOvershootCharacters: 0,
          wholeFileBuySpentCharacters: 0,
          renderMode: "window",
          wholeFileDecision: "not-eligible",
          truncated: true,
          reason: "score-spine-and-source-worth"
        },
        {
          index: 1,
          filePath: "src/second.ts",
          windowRequestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          requestedCharacters: 1_000,
          relevanceWeight: 1,
          generated: false,
          generatedClassifierVersion: "unclassified-allocation-input",
          generatedEvidenceRuleIds: [],
          sourceWorth: 1,
          effectiveWeight: 1,
          cliffExempt: false,
          allocationDecision: "admitted",
          maximumShareCharacters: 700,
          baseAllocatedCharacters: 378,
          allocatedCharacters: 378,
          wholeFileEligible: false,
          wholeFileCoverageFraction: 0.378,
          wholeFileGraceCharacters: 56,
          wholeFileOvershootCharacters: 0,
          wholeFileBuySpentCharacters: 0,
          renderMode: "window",
          wholeFileDecision: "not-eligible",
          truncated: true,
          reason: "score-spine-and-source-worth"
        }
      ]
    });
  });

  it("promotes one bridge window to a whole file inside the grace allowance", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [{
        index: 0,
        filePath: "src/bridge.ts",
        requestedCharacters: 600,
        fullFileCharacters: 650,
        relevanceWeight: 10,
        wholeFileEligible: true
      }]
    });

    expect(allocation).toMatchObject({
      policy: "explore-source-window-allocation-v5",
      budget: {
        wholeFileGraceFraction: 0.15,
        wholeFileGraceMaximumCharacters: 800,
        wholeFileBuyMinimumCoverageFraction: 0.6,
        wholeFileBuyOvershootFraction: 0.15,
        wholeFileBuyOvershootBudget: 150,
        wholeFileBuyOvershootSpentCharacters: 0
      },
      summary: {
        wholeFileEligibleCandidates: 1,
        wholeFilePromotedWindows: 1,
        baseAllocatedCharacters: 600,
        allocatedCharacters: 650,
        unusedCharacters: 350,
        truncated: false
      },
      windows: [{
        index: 0,
        filePath: "src/bridge.ts",
        windowRequestedCharacters: 600,
        fullFileCharacters: 650,
        requestedCharacters: 650,
        baseAllocatedCharacters: 600,
        allocatedCharacters: 650,
        wholeFileEligible: true,
        wholeFileCoverageFraction: 600 / 650,
        wholeFileGraceCharacters: 90,
        wholeFileOvershootCharacters: 50,
        wholeFileBuySpentCharacters: 0,
        renderMode: "whole-file",
        wholeFileDecision: "grace",
        truncated: false
      }]
    });
  });

  it("spends one shared whole-file buy pool in stable window order", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 2_000,
      primaryEmittedCharacters: 0,
      candidates: [
        {
          index: 0,
          filePath: "src/first.ts",
          requestedCharacters: 600,
          fullFileCharacters: 850,
          relevanceWeight: 2,
          wholeFileEligible: true
        },
        {
          index: 1,
          filePath: "src/second.ts",
          requestedCharacters: 600,
          fullFileCharacters: 850,
          relevanceWeight: 1,
          wholeFileEligible: true
        }
      ]
    });

    expect(allocation.budget).toMatchObject({
      wholeFileBuyOvershootBudget: 300,
      wholeFileBuyOvershootSpentCharacters: 250
    });
    expect(allocation.summary).toMatchObject({
      wholeFileEligibleCandidates: 2,
      wholeFilePromotedWindows: 1,
      baseAllocatedCharacters: 1_200,
      allocatedCharacters: 1_450,
      unusedCharacters: 550,
      truncated: false
    });
    expect(allocation.windows).toEqual([
      expect.objectContaining({
        index: 0,
        renderMode: "whole-file",
        wholeFileDecision: "buy",
        wholeFileOvershootCharacters: 250,
        wholeFileBuySpentCharacters: 250,
        allocatedCharacters: 850
      }),
      expect.objectContaining({
        index: 1,
        renderMode: "window",
        wholeFileDecision: "window-only",
        wholeFileOvershootCharacters: 0,
        wholeFileBuySpentCharacters: 0,
        allocatedCharacters: 600
      })
    ]);
    expect(
      allocation.summary.allocatedCharacters + allocation.budget.primaryEmittedCharacters
    ).toBeLessThanOrEqual(allocation.budget.totalCharacterBudget);
  });

  it("assigns whole-file ownership to only the strongest window for one file", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [
        {
          index: 0,
          filePath: "src/shared.ts",
          requestedCharacters: 400,
          fullFileCharacters: 450,
          relevanceWeight: 1,
          wholeFileEligible: true
        },
        {
          index: 1,
          filePath: "src/shared.ts",
          requestedCharacters: 400,
          fullFileCharacters: 450,
          relevanceWeight: 2,
          wholeFileEligible: true
        }
      ]
    });

    expect(allocation.windows).toEqual([
      expect.objectContaining({
        index: 0,
        renderMode: "window",
        wholeFileDecision: "duplicate-file"
      }),
      expect.objectContaining({
        index: 1,
        renderMode: "whole-file",
        wholeFileDecision: "grace"
      })
    ]);
  });

  it("fails closed when a whole-file candidate omits its persisted file identity", () => {
    expect(() => allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [{
        index: 0,
        requestedCharacters: 400,
        fullFileCharacters: 450,
        relevanceWeight: 1,
        wholeFileEligible: true
      } as ExploreSourceWindowAllocationCandidate]
    })).toThrowError(RangeError);
  });

  it("rejects a whole-file size smaller than its planned source window", () => {
    expect(() => allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [{
        index: 0,
        filePath: "src/bridge.ts",
        requestedCharacters: 451,
        fullFileCharacters: 450,
        relevanceWeight: 1,
        wholeFileEligible: true
      }]
    })).toThrowError(RangeError);
  });

  it("never spends grace or buy characters beyond the remaining total envelope", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 600,
      candidates: [{
        index: 0,
        filePath: "src/bridge.ts",
        requestedCharacters: 300,
        fullFileCharacters: 450,
        relevanceWeight: 1,
        wholeFileEligible: true
      }]
    });

    expect(allocation.windows[0]).toMatchObject({
      allocatedCharacters: 300,
      renderMode: "window",
      wholeFileDecision: "window-only"
    });
    expect(
      allocation.summary.allocatedCharacters + allocation.budget.primaryEmittedCharacters
    ).toBeLessThanOrEqual(allocation.budget.totalCharacterBudget);
  });

  it("cliffs low-worth generated source without displacing a relevant handwritten window", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_200,
      primaryEmittedCharacters: 0,
      candidates: [
        {
          index: 0,
          filePath: "src/primary.ts",
          requestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          relevanceWeight: 100,
          wholeFileEligible: false,
          generated: false,
          generatedClassifierVersion: "generated-evidence-v1",
          generatedEvidenceRuleIds: [],
          cliffExempt: false
        },
        {
          index: 1,
          filePath: "src/contracts.generated.ts",
          requestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          relevanceWeight: 20,
          wholeFileEligible: false,
          generated: true,
          generatedClassifierVersion: "generated-evidence-v1",
          generatedEvidenceRuleIds: [
            "generated.path.javascript.generated-suffix",
            "generated.path.javascript.generated-suffix"
          ],
          cliffExempt: false
        },
        {
          index: 2,
          filePath: "src/handwritten-bridge.ts",
          requestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          relevanceWeight: 15,
          wholeFileEligible: false,
          generated: false,
          generatedClassifierVersion: "generated-evidence-v1",
          generatedEvidenceRuleIds: [],
          cliffExempt: false
        }
      ] as readonly ExploreSourceWindowAllocationCandidate[]
    });

    expect(allocation).toMatchObject({
      policy: "explore-source-window-allocation-v5",
      budget: {
        generatedSourceWorth: 0.3,
        relativeCliffFraction: 0.15,
        relativeCliffMaximumWeight: 10,
        relativeCliffThreshold: 10
      },
      summary: {
        generatedCandidates: 1,
        cliffedWindows: 1
      },
      windows: [
        expect.objectContaining({
          index: 0,
          sourceWorth: 1,
          effectiveWeight: 100,
          allocationDecision: "admitted"
        }),
        expect.objectContaining({
          index: 1,
          sourceWorth: 0.3,
          effectiveWeight: 6,
          generatedEvidenceRuleIds: ["generated.path.javascript.generated-suffix"],
          allocatedCharacters: 0,
          allocationDecision: "relative-cliff",
          reason: "score-spine-and-source-worth"
        }),
        expect.objectContaining({
          index: 2,
          sourceWorth: 1,
          effectiveWeight: 15,
          allocationDecision: "admitted"
        })
      ]
    });
    expect(allocation.windows[2]!.allocatedCharacters).toBeGreaterThan(0);
  });

  it("keeps an exact path-spine window even when generated source worth is below the cliff", () => {
    const allocation = allocateExploreSourceWindowCharacters({
      totalCharacterBudget: 1_000,
      primaryEmittedCharacters: 0,
      candidates: [
        {
          index: 0,
          filePath: "src/entry.ts",
          requestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          relevanceWeight: 100,
          wholeFileEligible: false,
          generated: false,
          generatedClassifierVersion: "generated-evidence-v1",
          generatedEvidenceRuleIds: [],
          cliffExempt: false
        },
        {
          index: 1,
          filePath: "src/flow.generated.ts",
          requestedCharacters: 1_000,
          fullFileCharacters: 1_000,
          relevanceWeight: 1,
          wholeFileEligible: true,
          generated: true,
          generatedClassifierVersion: "generated-evidence-v1",
          generatedEvidenceRuleIds: ["generated.path.javascript.generated-suffix"],
          cliffExempt: true
        }
      ]
    });

    expect(allocation.windows[1]).toMatchObject({
      generated: true,
      sourceWorth: 0.3,
      effectiveWeight: 0.3,
      cliffExempt: true,
      allocationDecision: "admitted"
    });
    expect(allocation.windows[1]!.allocatedCharacters).toBeGreaterThanOrEqual(
      EXPLORE_SOURCE_WINDOW_ALLOCATION_LIMITS.minimumPerWindow
    );
  });
});
