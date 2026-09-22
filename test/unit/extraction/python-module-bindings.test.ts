import { describe, expect, it } from "vitest";
import { extractFileFacts } from "../../../src/extraction/index.js";

const extract = (sourceText: string) => extractFileFacts({
  filePath: "pkg/settings.py", language: "python", sourceText
});

describe("Python direct module binding evidence", () => {
  it("exposes assignments with complete source ranges without inventing alias targets", () => {
    const source = "handler500 = defaults.server_error\nvalue: str = (\n    'ok'\n)\nhandler500 = replacement\n";
    const facts = extract(source);
    const bindings = facts.symbols.filter((symbol) => symbol.kind === "variable");
    expect(bindings.map(({ name, declarationOrdinal, range }) => ({ name, declarationOrdinal, range }))).toEqual([
      { name: "handler500", declarationOrdinal: 0, range: { start: { line: 1, column: 1 }, end: { line: 1, column: 35 } } },
      { name: "value", declarationOrdinal: 0, range: { start: { line: 2, column: 1 }, end: { line: 4, column: 2 } } },
      { name: "handler500", declarationOrdinal: 1, range: { start: { line: 5, column: 1 }, end: { line: 5, column: 25 } } }
    ]);
    for (const binding of bindings) {
      expect(binding.qualifiedName).toBe(`pkg/settings.py#${binding.name}`);
      expect(facts.edges.filter((edge) => edge.targetId === binding.id)).toEqual([
        expect.objectContaining({ kind: "contains", resolution: "exact", range: binding.range })
      ]);
      expect(facts.edges.filter((edge) => edge.sourceId === binding.id)).toEqual([]);
    }
  });

  it("does not turn other writes or annotations into direct module declarations", () => {
    const source = ["x: int", "a = b = 1", "c, d = pair", "obj.value = 1", "items[0] = 2", "x += 1",
      "if flag:", "    conditional = 1", "class Box:", "    member = 2", "def work():", "    local = 3"].join("\n");
    expect(extract(source).symbols.filter((symbol) => symbol.kind === "variable")).toEqual([]);
  });

  it("does not claim module bindings from parser-rejected files", () => {
    expect(extract("valid = 1\nbroken = (\n").symbols.filter((symbol) => symbol.kind === "variable")).toEqual([]);
  });
});
