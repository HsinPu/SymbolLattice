import { describe, expect, it } from "vitest";
import { extractGoFileFacts } from "../../../src/extraction/go.js";
import { parser } from "../../../src/extraction/go-parser/parser.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";

function inspect(sourceText: string) {
  const filePath = "worker.go";
  const errors: number[] = [];
  parser.parse(sourceText).iterate({ enter(node) {
    if (node.type.isError) errors.push(node.from);
  } });
  const facts = extractGoFileFacts({ filePath, sourceText, language: "go" });
  const result = resolveProjectFacts({
    sourceDocuments: [{ relativePath: filePath, absolutePath: filePath,
      language: "go", sourceText, contentHash: "fixture" }],
    extractedFiles: [facts], indexedAt: "2026-10-06T00:00:00.000Z"
  });
  return { errors, facts, result };
}

describe("Go automatic semicolons after boolean identifiers", () => {
  for (const newline of ["\n", "\r\n"]) {
    it.each(["true", "false"])(`preserves a complete method and package call with ${JSON.stringify(newline)} after %s`, value => {
      const source = ["package demo", "// 中文 😀", "type Worker struct{}",
        "func helper() {}", "func (w Worker) Run() {",
        ` flag := ${value} // line comment`, " if flag {",
        "  flag = false", "  helper()", " }", "}", ""].join(newline);
      const { errors, result } = inspect(source);
      expect(errors).toEqual([]);
      const caller = result.symbols.find(symbol => symbol.name === "Run")!;
      const target = result.symbols.find(symbol => symbol.name === "helper")!;
      expect(caller).toMatchObject({ range: {
        start: { line: 5, column: 1 }, end: { line: 11, column: 2 }
      } });
      const calls = result.edges.filter(edge => edge.kind === "calls" && edge.sourceId === caller.id);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ targetId: target.id, resolution: "exact",
        evidence: { candidateSymbolIds: [target.id] }, range: {
          start: { line: 9, column: 3 }, end: { line: 9, column: 9 }
        } });
    });
  }

  it("retains adjacent complete functions after boolean assignment and return", () => {
    const source = "package demo\nfunc ready() bool {\n flag := true\n return flag\n}\nfunc disabled() bool {\n return false\n}\n";
    const { errors, facts } = inspect(source);
    expect(errors).toEqual([]);
    expect(facts.symbols.filter(symbol => symbol.kind === "function").map(symbol => symbol.name))
      .toEqual(["ready", "disabled"]);
  });

  it.each([
    " flag := true\n && false\n _ = flag",
    " flag := false\n @\n _ = flag",
    " flag := true\n if flag {"
  ])("does not suppress syntax errors or publish a malformed method: %s", body => {
    const source = `package demo\ntype Worker struct{}\nfunc (w Worker) Run() {\n${body}\n}\n`;
    const { errors, facts } = inspect(source);
    expect(errors.length).toBeGreaterThan(0);
    expect(facts.symbols.some(symbol => symbol.name === "Run")).toBe(false);
  });
});
