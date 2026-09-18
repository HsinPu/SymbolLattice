import { describe, expect, it } from "vitest";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";

function graph(sourceText: string, language: "javascript" | "typescript") {
  const filePath = language === "javascript" ? "src/expressions.js" : "src/expressions.ts";
  const facts = extractFileFacts({ filePath, language, sourceText });
  return { facts, snapshot: resolveProjectFacts({
    sourceDocuments: [{ absolutePath: `C:/project/${filePath}`, relativePath: filePath,
      sourceText, language, contentHash: "fixture" }], extractedFiles: [facts],
    indexedAt: "2026-09-18T00:00:00Z"
  }) };
}

describe.each(["javascript", "typescript"] as const)("%s named function expressions", (language) => {
  it("retains assigned expression source and attributes initializer calls to it", () => {
    const expression = "function dispatch () { const result = helper(); return result; }";
    const source = `function helper () {}\nmodule.exports = ${expression};\ndispatch();`;
    const { facts, snapshot } = graph(source, language);
    const callable = facts.symbols.find((node) => node.name === "dispatch")!;
    const helper = facts.symbols.find((node) => node.name === "helper")!;
    expect(callable).toMatchObject({ kind: "function", isExported: false,
      range: { start: { line: 2, column: 18 }, end: { line: 2, column: 18 + expression.length } } });
    expect(facts.exportBindings).toEqual([]);
    expect(snapshot.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact"))
      .toEqual([expect.objectContaining({ sourceId: callable.id, targetId: helper.id })]);
    expect(snapshot.pendingReferences).toContainEqual(expect.objectContaining({ referenceName: "dispatch" }));
  });

  it("keeps repeated callback names separate and recursion inside its own scope", () => {
    const { facts, snapshot } = graph([
      "function recur () {}",
      "consume(function recur () { recur(); });",
      "consume(function recur () { recur(); });",
      "recur();"
    ].join("\n"), language);
    const callables = facts.symbols.filter((node) => node.name === "recur");
    expect(callables).toHaveLength(3);
    expect(new Set(callables.map((node) => node.id)).size).toBe(3);
    const byLine = new Map(callables.map((node) => [node.range.start.line, node.id]));
    const calls = snapshot.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");
    expect(calls.filter((edge) => edge.range?.start.line === 2)).toEqual([
      expect.objectContaining({ sourceId: byLine.get(2), targetId: byLine.get(2) })
    ]);
    expect(calls.filter((edge) => edge.range?.start.line === 3)).toEqual([
      expect.objectContaining({ sourceId: byLine.get(3), targetId: byLine.get(3) })
    ]);
    expect(calls.filter((edge) => edge.range?.start.line === 4)).toEqual([
      expect.objectContaining({ targetId: byLine.get(1) })
    ]);
  });

  it("reuses a callable variable identity without leaking its private self name", () => {
    const { facts, snapshot } = graph([
      "const publicName = function privateName () { privateName(); };",
      "publicName();",
      "privateName();"
    ].join("\n"), language);
    const callable = facts.symbols.find((node) => node.name === "publicName")!;
    expect(facts.symbols.some((node) => node.name === "privateName")).toBe(false);
    expect(snapshot.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceId: callable.id, targetId: callable.id }),
        expect.objectContaining({ targetId: callable.id, range: expect.objectContaining({ start: { line: 2, column: 1 } }) })
      ]));
    expect(snapshot.edges.some((edge) => edge.kind === "calls" && edge.resolution === "exact" && edge.range?.start.line === 3)).toBe(false);
  });

  it.each(["recur", "{ recur }", "{ run: recur }", "[recur]", "...recur"])("does not resolve a callback parameter %s as a self-recursive call", (parameter) => {
    const { facts, snapshot } = graph(`consume(function recur (${parameter}) { recur(); });\nrecur();`, language);
    expect(facts.symbols.filter((node) => node.name === "recur")).toHaveLength(1);
    expect(snapshot.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact")).toEqual([]);
  });

  it("resolves a same-name local declaration before the expression's private name", () => {
    const { facts, snapshot } = graph("consume(function recur () { const recur = () => {}; recur(); });", language);
    const local = facts.symbols.find((node) => node.kind === "variable" && node.name === "recur")!;
    const expression = facts.symbols.find((node) => node.kind === "function" && node.name === "recur")!;
    expect(snapshot.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact"))
      .toEqual([expect.objectContaining({ sourceId: expression.id, targetId: local.id })]);
  });

  it("keeps self names available to nested closures", () => {
    const { facts, snapshot } = graph("consume(function recur () { function nested () { recur(); } });", language);
    const expression = facts.symbols.find((node) => node.name === "recur")!;
    const nested = facts.symbols.find((node) => node.name === "nested")!;
    expect(snapshot.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact"))
      .toEqual([expect.objectContaining({ sourceId: nested.id, targetId: expression.id })]);
  });

  it("does not duplicate default-export and class-property callables", () => {
    const { facts, snapshot } = graph([
      "export default function recur () { recur(); }",
      "class Holder { run = function privateRun () { privateRun(); }; }",
      "privateRun();"
    ].join("\n"), language);
    expect(facts.symbols.filter((node) => node.name === "recur")).toHaveLength(1);
    expect(facts.symbols.some((node) => node.name === "privateRun")).toBe(false);
    const run = facts.symbols.find((node) => node.name === "run")!;
    expect(snapshot.edges).toContainEqual(expect.objectContaining({ kind: "calls", sourceId: run.id, targetId: run.id, resolution: "exact" }));
    expect(snapshot.edges.some((edge) => edge.kind === "calls" && edge.resolution === "exact" && edge.range?.start.line === 3)).toBe(false);
  });
});
