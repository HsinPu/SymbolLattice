import { describe, expect, it } from "vitest";
import { callSourceContextPlanner, matchCallSourceContexts, CALL_SOURCE_CONTEXT_LIMITS } from "../../src/application/explore-call-source-context.js";
import { planExploreQuery } from "../../src/application/explore-query.js";
import { allocateExploreSourceWindowCharacters } from "../../src/application/explore-source-windows.js";
import type { GraphEdge, SymbolNode } from "../../src/domain/types.js";
import type { UnresolvedCallEvidence } from "../../src/application/types.js";

function fixture() {
  const documents = new Map([
    ["wrapper.py", { sourceText: "from pkg.middle import Middle\nclass Wrapper(Middle):\n    def dispatch_error(self, error):\n        return self.select_handler(error)\n    def process_request(self, error):\n        return self.dispatch_error(error)\n" }],
    ["pkg/middle.py", { sourceText: "from .base import Base\nclass Middle(Base):\n    def select_handler(self, error):\n        return self.exception_code(error)\n" }],
    ["pkg/base.py", { sourceText: "class Base:\n    def exception_code(self, error):\n        return (type(error), 500)\n" }]
  ]);
  const node = (id: string, name: string, filePath: string, kind: SymbolNode["kind"], start: number, end: number): SymbolNode => ({
    id, name, filePath, kind, qualifiedName: `${filePath}#${name}`, isExported: false,
    range: { start: { line: start, column: kind === "method" ? 5 : 1 },
      end: { line: end, column: documents.get(filePath)!.sourceText.split("\n")[end - 1]!.length + 1 } }
  });
  const root = node("root", "dispatch_error", "wrapper.py", "method", 3, 4);
  const caller = node("caller", "process_request", root.filePath, "method", 5, 6);
  const middle = node("middle", "select_handler", "pkg/middle.py", "method", 3, 4);
  const base = node("base", "exception_code", "pkg/base.py", "method", 2, 3);
  const wrapperClass = node("wrapper-class", "Wrapper", root.filePath, "class", 2, 6);
  const middleClass = node("middle-class", "Middle", middle.filePath, "class", 2, 4);
  const baseClass = node("base-class", "Base", base.filePath, "class", 1, 3);
  const fileNodes = [...documents].map(([path]) => node(`file:${path}`, path, path, "file", 1, documents.get(path)!.sourceText.split("\n").length - 1));
  const edge = (id: string, kind: GraphEdge["kind"], source: SymbolNode, target: SymbolNode, line: number): GraphEdge => ({
    id, kind, sourceId: source.id, targetId: target.id, filePath: source.filePath, confidence: 1, resolution: "exact",
    range: { start: { line, column: 1 }, end: { line, column: documents.get(source.filePath)!.sourceText.split("\n")[line - 1]!.length + 1 } }
  });
  const contains = (owner: SymbolNode, child: SymbolNode) => ({ ...edge(`contains:${child.id}`, "contains", owner, child, child.range.start.line), range: child.range });
  const inheritance = (source: SymbolNode, target: SymbolNode, relative: boolean) => ({ ...edge(`extends:${source.id}`, "extends", source, target, source.range.start.line),
    referenceName: target.name, evidence: { stage: "module" as const, configurationPaths: ["pkg/__init__.py"],
      ruleId: relative ? "module.python.regular-package.relative-named-import.unique-top-level-class-inheritance" :
        "module.python.regular-package.absolute-named-import.unique-top-level-class-inheritance", resolutionPath: [source.filePath, target.filePath] } });
  const imports = (source: SymbolNode, target: SymbolNode, relative: boolean) => ({ ...edge(`import:${source.id}`, "imports", source, target, 1),
    referenceName: relative ? ".base" : "pkg.middle", evidence: { stage: "module" as const, configurationPaths: ["pkg/__init__.py"],
      ruleId: relative ? "module.python.regular-package.relative-named-import" : "module.python.regular-package.absolute-named-base-import",
      resolutionPath: [source.filePath, target.filePath] } });
  const unresolved = (source: SymbolNode, target: SymbolNode): GraphEdge => ({ ...edge(`call:${source.id}`, "calls", source, target, source.range.end.line),
    targetId: null, confidence: 0, resolution: "unresolved", referenceName: `self.${target.name}`,
    range: { start: { line: source.range.end.line, column: 16 }, end: { line: source.range.end.line,
      column: documents.get(source.filePath)!.sourceText.split("\n")[source.range.end.line - 1]!.length + 1 } },
    evidence: { stage: "syntax", ruleId: "syntax.python.member-call.unknown-receiver" } });
  const rootCall = unresolved(root, middle), nestedCall = unresolved(middle, base);
  const incoming = { ...edge("incoming", "calls", caller, root, 6), range: unresolved(caller, root).range };
  const graph = { symbols: [root, caller, middle, base, wrapperClass, middleClass, baseClass, ...fileNodes],
    edges: [contains(wrapperClass, root), contains(wrapperClass, caller), contains(middleClass, middle), contains(baseClass, base),
      inheritance(wrapperClass, middleClass, false), inheritance(middleClass, baseClass, true),
      imports(fileNodes[0]!, fileNodes[1]!, false), imports(fileNodes[1]!, fileNodes[2]!, true), incoming] };
  const queryTerms = ["dispatch", "error", "handler", "exception", "code", "request"];
  const selection = planExploreQuery({ symbols: [root], edges: [] }, queryTerms.join(" ")).selection;
  const available = (items: readonly GraphEdge[]): UnresolvedCallEvidence => ({ state: "available", items, truncated: false });
  const calls = new Map([[root.id, available([rootCall])], [middle.id, available([nestedCall])]]);
  return { graph, selection, queryTerms, documents, root, caller, middle, base, rootCall, nestedCall, calls, available };
}

describe("bounded Python call-source context", () => {
  it("retains two written base steps and a short exact caller without resolving self calls", () => {
    const f = fixture(), planner = callSourceContextPlanner(f.graph, f.selection, f.queryTerms)!;
    const initial = planner(new Map([[f.root.id, f.calls.get(f.root.id)!]]));
    expect(initial.pendingSourceIds).toEqual([f.middle.id]);
    const plan = planner(f.calls);
    expect(plan.candidates.map(candidate => candidate.declaration.id)).toEqual([f.middle.id, f.base.id, f.caller.id]);
    expect(plan.candidates[1]?.steps.map(step => step.call)).toEqual([f.rootCall, f.nestedCall]);
    expect(plan.pendingSourceIds).toEqual([]);
    for (const candidate of plan.candidates) for (const step of candidate.steps) expect(step.call).toMatchObject({ targetId: null, confidence: 0, resolution: "unresolved" });
    const matched = matchCallSourceContexts(plan, f.documents);
    expect(matched.receipt).toMatchObject({ matchedCount: 3, sourceTruncated: false, truncated: false });
    for (const candidate of matched.candidates) for (const match of candidate.sourceMatches) {
      const original = f.documents.get(match.filePath)!.sourceText.split("\n")[match.range.start.line - 1]!;
      expect(original.slice(match.range.start.column - 1, match.range.end.column - 1)).toBe(match.token);
    }
    const crlf = new Map([...f.documents].map(([path, doc]) => [path, { sourceText: doc.sourceText.replaceAll("\n", "\r\n") }]));
    expect(matchCallSourceContexts(plan, crlf)).toEqual(matched);
  });

  it.each(["other.select_handler", "self.handler.select_handler"])("rejects an unsupported receiver %s", referenceName => {
    const f = fixture(); f.calls.set(f.root.id, f.available([{ ...f.rootCall, referenceName }]));
    expect(callSourceContextPlanner(f.graph, f.selection, f.queryTerms)!(f.calls).candidates.filter(item => item.steps.length)).toEqual([]);
  });

  it("rejects broken imports, ambiguous declarations and out-of-owner call ranges", () => {
    const missing = fixture(); missing.graph.edges = missing.graph.edges.filter(edge => edge.id !== "import:file:wrapper.py");
    expect(callSourceContextPlanner(missing.graph, missing.selection, missing.queryTerms)!(missing.calls).candidates.filter(item => item.steps.length)).toEqual([]);
    const ambiguous = fixture(), sibling = { ...ambiguous.middle, id: "sibling" };
    ambiguous.graph.symbols.push(sibling);
    const containment = ambiguous.graph.edges.find(edge => edge.targetId === ambiguous.middle.id && edge.kind === "contains")!;
    ambiguous.graph.edges.push({ ...containment, id: "sibling-contains", targetId: sibling.id });
    expect(callSourceContextPlanner(ambiguous.graph, ambiguous.selection, ambiguous.queryTerms)!(ambiguous.calls).candidates.filter(item => item.steps.length)).toEqual([]);
    const foreign = fixture(); foreign.calls.set(foreign.root.id, foreign.available([{ ...foreign.rootCall,
      range: { start: { line: 6, column: 16 }, end: { line: 6, column: 30 } } }]));
    expect(callSourceContextPlanner(foreign.graph, foreign.selection, foreign.queryTerms)!(foreign.calls).candidates.filter(item => item.steps.length)).toEqual([]);
  });

  it("discloses a nested generation mismatch without using that call", () => {
    const f = fixture(); f.calls.set(f.middle.id, { state: "generation-mismatch", items: [f.nestedCall], truncated: false });
    const plan = callSourceContextPlanner(f.graph, f.selection, f.queryTerms)!(f.calls);
    expect(plan.generationMismatch).toBe(true);
    expect(plan.candidates.some(item => item.declaration.id === f.base.id)).toBe(false);
    expect(matchCallSourceContexts(plan, f.documents).receipt.truncated).toBe(true);
  });

  it("requires two source concepts and reports unavailable or oversized declarations", () => {
    const f = fixture(), plan = callSourceContextPlanner(f.graph, f.selection, f.queryTerms)!(f.calls);
    const unrelated = new Map([...f.documents].map(([path, doc]) => [path, { sourceText: doc.sourceText.replace(/[A-Za-z_]+/gu, "unused") }]));
    expect(matchCallSourceContexts(plan, unrelated).candidates).toEqual([]);
    expect(matchCallSourceContexts(plan, new Map()).receipt.unavailableFiles).toHaveLength(3);
    const long = { ...plan, candidates: [{ ...plan.candidates[0]!, declaration: { ...f.middle,
      range: { start: f.middle.range.start, end: { line: 70, column: 1 } } } }] };
    const documents = new Map(f.documents); documents.set(f.middle.filePath, { sourceText: "\n".repeat(70) });
    expect(matchCallSourceContexts(long, documents)).toMatchObject({ candidates: [], receipt: { sourceTruncated: true, truncated: true } });
  });

  it("bounds terms, calls and graph inspection and excludes test declarations", () => {
    const f = fixture(); f.calls.set(f.root.id, { ...f.calls.get(f.root.id)!, items: Array<GraphEdge>(12).fill(f.rootCall) });
    const terms = [...f.queryTerms, ...Array.from({ length: 24 }, (_, index) => `qualifier${index}`)];
    const plan = callSourceContextPlanner(f.graph, f.selection, terms, true)!(f.calls);
    expect(plan).toMatchObject({ callsTruncated: true, graphTruncated: true, termsTruncated: true });
    expect(plan.queryTerms).toHaveLength(CALL_SOURCE_CONTEXT_LIMITS.maximumTerms);
    f.graph.symbols.push(...Array<SymbolNode>(4096).fill({ ...f.root, id: "outside" }));
    expect(callSourceContextPlanner(f.graph, f.selection, terms)!(f.calls).graphTruncated).toBe(true);
    const auxiliary = fixture(); auxiliary.graph.symbols = auxiliary.graph.symbols.map(node => node.filePath === auxiliary.middle.filePath ? { ...node, filePath: "tests/base.py" } : node);
    expect(callSourceContextPlanner(auxiliary.graph, auxiliary.selection, auxiliary.queryTerms)!(auxiliary.calls).candidates.filter(item => item.steps.length)).toEqual([]);
  });
});

it("reserves a bounded context phase before plain and spare flow windows", () => {
  const result = allocateExploreSourceWindowCharacters({ totalCharacterBudget: 10000, primaryEmittedCharacters: 4000,
    priorityContextCharacterBudget: 2500, candidates: [
      { index: 0, filePath: "old.py", requestedCharacters: 2000, fullFileCharacters: 2000, relevanceWeight: 10, wholeFileEligible: false },
      { index: 1, filePath: "flow.py", requestedCharacters: 500, fullFileCharacters: 500, relevanceWeight: 10, wholeFileEligible: false, spareOnly: true },
      { index: 2, filePath: "base.py", requestedCharacters: 1500, fullFileCharacters: 1500, relevanceWeight: 10, wholeFileEligible: false, priorityContext: true }
    ] });
  expect(result.windows[2]).toMatchObject({ allocatedCharacters: 1500, allocationPhase: "call-source-context" });
  expect(result.windows[1]).toMatchObject({ allocatedCharacters: 500, allocationPhase: "remaining-budget" });
  expect(result.budget).toMatchObject({ totalCharacterBudget: 10000, primaryEmittedCharacters: 4000, availableCharacters: 6000,
    priorityContextPhase: { characterBudget: 2500, allocatedCharacters: 1500 } });
  expect(result.summary.allocatedCharacters + result.budget.primaryEmittedCharacters).toBeLessThanOrEqual(10000);
  expect(() => allocateExploreSourceWindowCharacters({ totalCharacterBudget: 10000, primaryEmittedCharacters: 0,
    priorityContextCharacterBudget: 6001, candidates: [] })).toThrow(RangeError);
});
