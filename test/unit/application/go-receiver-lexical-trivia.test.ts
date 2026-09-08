import { describe, expect, it } from "vitest";
import { extractGoFileFacts } from "../../../src/extraction/go.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";

function runEdges(body: string) {
  const relativePath = "worker.go";
  const sourceText = `package demo
type Worker struct { Field int }
type Inner struct{}
func (h Inner) Ready() int { return 2 }
func (h *Worker) Ready() int { return 1 }
func sink(h *Worker) {}
func sinkResult(value int) {}
func sinkAny(value any) {}
func (h *Worker) Run() {
${body}
h.Ready()
}
`;
  const result = resolveProjectFacts({
    sourceDocuments: [{ relativePath, absolutePath: relativePath, language: "go", sourceText, contentHash: "fixture" }],
    extractedFiles: [extractGoFileFacts({ filePath: relativePath, sourceText, language: "go" })],
    indexedAt: "2026-09-09T00:00:00.000Z"
  });
  const caller = result.symbols.find(symbol => symbol.name === "Run");
  const target = result.symbols.find(symbol => symbol.qualifiedName === "worker.go#Worker.Ready");
  expect(caller).toBeDefined();
  expect(target).toBeDefined();
  return { target, edges: result.edges.filter(edge => edge.sourceId === caller?.id && edge.referenceName === "Ready" && edge.kind === "calls") };
}

describe("Go receiver safety ignores lexical trivia, not executable escape", () => {
  it.each([
    "{ var h Inner; sinkResult(h.Ready()) }",
    "{ h, other := Inner{}, 1; _ = other; sinkResult(h.Ready()) }",
    "for _, h := range []Inner{{}} { sinkResult(h.Ready()) }"
  ])("does not bind a shadowed nested receiver to the outer type: %s", body => {
    expect(runEdges(body).edges).toEqual([]);
  });

  it("does not treat an equality guard as receiver assignment", () => {
    const { edges, target } = runEdges("if h == nil { return }");
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ resolution: "exact", confidence: 1, evidence: { candidateSymbolIds: [target?.id] } });
  });

  it("does not treat logical conjunction as an address escape", () => {
    const { edges } = runEdges("if h != nil && h.Field > 0 { }");
    expect(edges).toHaveLength(1);
  });

  it("retains a direct concrete method call used as another call's argument", () => {
    const { edges, target } = runEdges("sinkResult(h.Ready())");
    expect(edges).toHaveLength(2);
    for (const edge of edges) {
      expect(edge).toMatchObject({ resolution: "exact", confidence: 1, targetId: target?.id, evidence: { candidateSymbolIds: [target?.id] } });
    }
  });

  it.each([
    "// h = nil",
    "/* sink(h) */",
    '_ = "h = nil; sink(h)"',
    "_ = `h = nil; sink(h)`"
  ])("does not treat trivia as receiver mutation: %s", body => {
    const { edges, target } = runEdges(body);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ resolution: "exact", confidence: 1, evidence: { candidateSymbolIds: [target?.id] } });
  });

  it.each([
    "alias := &h; _ = alias; sinkResult(h.Ready())",
    "other := h; h, other = other, h; sinkResult(h.Ready())",
    "other := new(Worker); h, other = other, nil; sinkResult(h.Ready())",
    "h = nil",
    "sink(h)",
    "sink(/* comment */ h)",
    "sink(/* ) */ h)",
    "h /* comment */ = nil",
    "sinkAny(h.Ready)",
    "sinkResult(h.Field)",
    "alias := h; _ = alias",
    "f := func() { sink(h) }; f()",
    '_ = "safe"; sink(h)'
  ])("retains the nonclaim for executable receiver escape: %s", body => {
    expect(runEdges(body).edges).toEqual([]);
  });
});
