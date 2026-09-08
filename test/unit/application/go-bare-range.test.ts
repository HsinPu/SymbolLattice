import { describe, expect, it } from "vitest";
import { extractGoFileFacts } from "../../../src/extraction/go.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";

function inspect(loop: string, receiverType = "struct{}", pointer = "*") {
  const filePath = "worker.go";
  const sourceText = `package demo
type Worker ${receiverType}
func (h ${pointer}Worker) Ready() {}
func (h ${pointer}Worker) Run(xs []int) {
${loop}
}
`;
  const facts = extractGoFileFacts({ filePath, sourceText, language: "go" });
  const result = resolveProjectFacts({
    sourceDocuments: [{ relativePath: filePath, absolutePath: filePath, language: "go", sourceText, contentHash: "fixture" }],
    extractedFiles: [facts],
    indexedAt: "2026-09-09T00:00:00.000Z"
  });
  const caller = result.symbols.find(symbol => symbol.name === "Run");
  const target = result.symbols.find(symbol => symbol.qualifiedName === "worker.go#Worker.Ready");
  return { caller, target, edges: result.edges.filter(edge => edge.sourceId === caller?.id && edge.kind === "calls") };
}

describe("Go range clause with no iteration binding", () => {
  it.each(["for range h { h.Ready() }", "for i := range h { _ = i; h.Ready() }"])("does not treat a range RHS receiver as an assignment target: %s", loop => {
    const { edges, target } = inspect(loop, "[]int", "");
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ targetId: target?.id, resolution: "exact", confidence: 1 });
  });

  it.each([
    "for range h { h = nil; h.Ready() }",
    "items := []Worker{nil}; var i int; for i, h = range items { _ = i; h.Ready() }",
    "for _, h := range []Worker{nil} { h.Ready() }"
  ])("retains mutation and shadow suppression for range receivers: %s", loop => {
    expect(inspect(loop, "[]int", "").edges).toEqual([]);
  });

  it.each([
    "for i := range xs { _ = i; h.Ready() }",
    "for range xs { h.Ready() }",
    "for /* header */ range xs { h.Ready() }",
    "for range xs { for range xs { h.Ready() } }"
  ])("preserves declaration and exact concrete method call: %s", loop => {
    const { caller, target, edges } = inspect(loop);
    expect(caller).toBeDefined();
    expect(target).toBeDefined();
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      targetId: target?.id, resolution: "exact", confidence: 1,
      evidence: { candidateSymbolIds: [target?.id] }
    });
  });

  it.each([
    "for range { h.Ready() }",
    "for range xs { h.Ready() }; @",
    "for range xs { h = nil; h.Ready() }"
  ])("does not claim a call through malformed source or mutation: %s", loop => {
    expect(inspect(loop).edges).toEqual([]);
  });
});
