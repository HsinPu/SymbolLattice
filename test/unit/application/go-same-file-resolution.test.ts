import { describe, expect, it } from "vitest";
import { extractGoFileFacts } from "../../../src/extraction/go.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";

function graph(sourceText: string) {
  const relativePath = "worker.go";
  return resolveProjectFacts({
    sourceDocuments: [{ relativePath, absolutePath: relativePath, language: "go", sourceText, contentHash: "fixture" }],
    extractedFiles: [extractGoFileFacts({filePath: relativePath, sourceText, language: "go"})],
    indexedAt: "2026-09-06T00:00:00.000Z"
  });
}

describe("Go same-file package call resolution", () => {
  it("resolves method callers and retains one edge for an existing function caller", () => {
    const result = graph("package demo\ntype Worker struct{}\nfunc helper() {}\nfunc entry() { helper() }\nfunc (w Worker) Run() { helper() }\n");
    const target = result.symbols.find(s => s.name === "helper")!;
    for (const name of ["entry", "Run"]) {
      const caller = result.symbols.find(s => s.name === name)!;
      const edges = result.edges.filter(e => e.kind === "calls" && e.sourceId === caller.id && e.targetId === target.id);
      expect(edges, name).toHaveLength(1);
      expect(edges[0]).toMatchObject({resolution: "exact", confidence: 1, evidence: {candidateSymbolIds: [target.id]}});
    }
  });

  it.each([
    "func (w Worker) Run(helper func()) { helper() }",
    "func (w Worker) Run() { helper := func() {}; helper() }",
    "func helper() {}\nfunc (w Worker) Run() { helper() }"
  ])("rejects shadowed or duplicate package targets: %s", caller => {
    const result = graph(`package demo\ntype Worker struct{}\nfunc helper() {}\n${caller}\n`);
    expect(result.edges.filter(e => e.kind === "calls")).toEqual([]);
  });
});
