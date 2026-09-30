import { describe, expect, it } from "vitest";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

function project(sourceText: string) {
  const document: SourceDocument = { absolutePath: "C:/project/main.ts", relativePath: "main.ts",
    language: "typescript", sourceText, contentHash: "fixture" };
  const facts = extractFileFacts({ filePath: document.relativePath, language: document.language, sourceText });
  return { facts, graph: resolveProjectFacts({ sourceDocuments: [document], extractedFiles: [facts],
    indexedAt: "2026-09-30T00:00:00.000Z" }) };
}

describe("TypeScript optional member source receipts", () => {
  it("retains optional receiver, optional call and nested chain method tokens without claiming dispatch", () => {
    const text = ["export function inspect(value: any) {", "  value?.isCycle(1);",
      "  value.complete?.();", "  value?.nested.report();", "}"].join("\n");
    const { facts, graph } = project(text);
    const owner = facts.symbols.find(symbol => symbol.name === "inspect")!;
    const calls = graph.edges.filter(edge => edge.kind === "calls");
    expect(calls).toHaveLength(3);
    expect(calls.map(edge => edge.referenceName).sort()).toEqual(["complete", "isCycle", "report"]);
    for (const edge of calls) {
      expect(edge).toMatchObject({ sourceId: owner.id, targetId: null, resolution: "unresolved", confidence: 0,
        evidence: { ruleId: "syntax.typescript.optional-member-call.unknown-receiver", candidateSymbolIds: [] } });
      const line = text.split("\n")[edge.range.start.line - 1]!;
      expect(line.slice(edge.range.start.column - 1, edge.range.end.column - 1)).toBe(edge.referenceName);
    }
  });

  it("never resolves an optional method token to a same-named function or typed class member", () => {
    const { graph } = project(["function isCycle() { return false; }",
      "class Signal { isCycle() { return true; } }",
      "export function inspect(signal: Signal) { return signal?.isCycle(); }"].join("\n"));
    const call = graph.edges.find(edge => edge.kind === "calls" && edge.referenceName === "isCycle")!;
    expect(call).toMatchObject({ targetId: null, resolution: "unresolved", confidence: 0 });
    expect(call.evidence?.candidateSymbolIds).toEqual([]);
  });

  it("preserves proven nonoptional calls and excludes computed optional members", () => {
    const { facts, graph } = project(["class Signal { run() {} }",
      "export function inspect(signal: Signal, key: string) {",
      "  signal.run(); signal?.['run'](); signal?.[key]();", "}"].join("\n"));
    expect(facts.pendingReferences.filter(reference => reference.relationKind === "calls")).toHaveLength(1);
    expect(graph.edges.filter(edge => edge.kind === "calls")).toEqual([
      expect.objectContaining({ referenceName: "run", resolution: "exact", targetId: expect.any(String) })
    ]);
  });

  it("does not extend JavaScript member dispatch through this TypeScript addition", () => {
    const facts = extractFileFacts({ filePath: "main.js", language: "javascript",
      sourceText: "export function inspect(value) { value?.isCycle(); }" });
    expect(facts.pendingReferences.filter(reference => reference.relationKind === "calls")).toEqual([]);
  });
});
