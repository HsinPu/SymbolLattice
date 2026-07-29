import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("TypeScript and JavaScript extraction", () => {
  it("collects declarations, containment, module references, and direct calls", () => {
    const facts = extractFileFacts({
      filePath: "src/consumer.ts",
      language: "typescript",
      sourceText: `
        import { add } from "./math.js";
        export interface Result { value: number }
        export function calculate(value: number): number {
          const local = add(value, 1);
          return local;
        }
        export class Calculator {
          increment(value: number): number { return add(value, 1); }
        }
      `
    });

    expect(facts.symbols.map((symbol) => [symbol.kind, symbol.name])).toEqual(
      expect.arrayContaining([
        ["file", "consumer.ts"],
        ["interface", "Result"],
        ["function", "calculate"],
        ["variable", "local"],
        ["class", "Calculator"],
        ["method", "increment"]
      ])
    );
    expect(facts.symbols.find((symbol) => symbol.name === "calculate")?.isExported).toBe(true);
    expect(facts.edges.filter((edge) => edge.kind === "contains")).not.toHaveLength(0);
    const calculate = facts.symbols.find((symbol) => symbol.name === "calculate");
    const containment = facts.edges.find(
      (edge) => edge.kind === "contains" && edge.targetId === calculate?.id
    );
    expect(containment?.evidence).toEqual({
      ruleId: "syntax.containment",
      stage: "syntax",
      candidateSymbolIds: [calculate?.id]
    });
    expect(
      facts.pendingReferences.map((reference) => [reference.relationKind, reference.referenceName])
    ).toEqual(
      expect.arrayContaining([
        ["imports", "./math.js"],
        ["calls", "add"]
      ])
    );
    expect(facts.pendingReferences.find((reference) => reference.relationKind === "calls")?.range.start.line).toBeGreaterThan(1);
    expect(facts.importBindings).toEqual([
      expect.objectContaining({
        moduleSpecifier: "./math.js",
        localName: "add",
        importedName: "add"
      })
    ]);
  });

  it("preserves local and public names for explicit export aliases", () => {
    const facts = extractFileFacts({
      filePath: "src/math.ts",
      language: "typescript",
      sourceText: "const add = (left: number, right: number) => left + right; export { add as sum };"
    });

    expect(facts.symbols.find((symbol) => symbol.name === "add")?.isExported).toBe(true);
    expect(facts.exportBindings).toEqual([
      expect.objectContaining({ localName: "add", exportedName: "sum" })
    ]);
  });

  it("does not mark a same-named local declaration as exported by a re-export", () => {
    const facts = extractFileFacts({
      filePath: "src/bridge.ts",
      language: "typescript",
      sourceText: "const sum = () => 1; export { add as sum } from './math.js';"
    });

    expect(facts.symbols.find((symbol) => symbol.name === "sum")?.isExported).toBe(false);
    expect(facts.exportBindings).toEqual([]);
  });

  it("handles JavaScript and does not guess property dispatch", () => {
    const facts = extractFileFacts({
      filePath: "src/legacy.js",
      language: "javascript",
      sourceText: `
        export const twice = (value) => value * 2;
        export function total(value) { return twice(value); }
        total.call(null, 1);
      `
    });

    expect(facts.symbols.map((symbol) => symbol.name)).toEqual(
      expect.arrayContaining(["legacy.js", "twice", "total"])
    );
    expect(
      facts.pendingReferences.filter((reference) => reference.relationKind === "calls").map(
        (reference) => reference.referenceName
      )
    ).toEqual(["twice"]);
  });
});
