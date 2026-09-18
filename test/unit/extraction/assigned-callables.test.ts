import { describe, expect, it } from "vitest";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";

function graph(sourceText: string, language: "javascript" | "typescript") {
  const filePath = language === "javascript" ? "assigned.js" : "assigned.ts";
  const facts = extractFileFacts({ filePath, language, sourceText });
  const snapshot = resolveProjectFacts({ sourceDocuments: [{ relativePath: filePath, absolutePath: `C:/project/${filePath}`,
    language, sourceText, contentHash: "fixture" }], extractedFiles: [facts], indexedAt: "2026-09-18T00:00:00Z" });
  return { facts, snapshot };
}

describe.each(["javascript", "typescript"] as const)("%s anonymous member assignments", (language) => {
  it("keeps the assignment source and attributes initializer calls to its function", () => {
    const assignment = "Reply.prototype.send = function (payload) { const value = handle(payload); return value; }";
    const { facts, snapshot } = graph(`function handle() {}\n${assignment};\nsend();`, language);
    const callable = facts.symbols.find((item) => item.name === "Reply.prototype.send")!;
    const target = facts.symbols.find((item) => item.name === "handle")!;
    expect(callable).toMatchObject({ kind: "function", isExported: false,
      range: { start: { line: 2, column: 1 }, end: { line: 2, column: assignment.length + 1 } } });
    expect(snapshot.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact"))
      .toEqual([expect.objectContaining({ sourceId: callable.id, targetId: target.id })]);
    expect(facts.localBindings.some((binding) => binding.symbolId === callable.id)).toBe(false);
    expect(facts.exportBindings).toEqual([]);
  });

  it.each([
    ["obj.run = () => helper()", "obj.run"],
    ["obj['run'] = (function () { helper(); })", 'obj["run"]'],
    ["obj[0] = async () => helper()", "obj[0]"],
    ["this.run = function* () { yield helper(); }", "this.run"],
    ["module.exports = function () { helper(); }", "module.exports"]
  ])("retains one anonymous callable for %s", (assignment, name) => {
    const { facts, snapshot } = graph(`function helper() {}\n${assignment};`, language);
    const target = facts.symbols.find((item) => item.name === name)!;
    expect(target).toBeDefined();
    expect(facts.symbols.filter((item) => item.kind === "function")).toHaveLength(2);
    expect(snapshot.edges).toContainEqual(expect.objectContaining({ kind: "calls", sourceId: target.id, resolution: "exact" }));
  });

  it("keeps repeated assignments distinct and nests closures under their actual callable", () => {
    const { facts, snapshot } = graph([
      "function helper() {}",
      "obj.run = function () { function inner() { helper(); } inner(); };",
      "obj.run = function () { helper(); };"
    ].join("\n"), language);
    const assigned = facts.symbols.filter((item) => item.name === "obj.run");
    expect(assigned).toHaveLength(2);
    expect(new Set(assigned.map((item) => item.id)).size).toBe(2);
    const inner = facts.symbols.find((item) => item.name === "inner")!;
    expect(inner.qualifiedName).toContain("obj.run.inner");
    expect(snapshot.edges).toContainEqual(expect.objectContaining({ sourceId: assigned[0]!.id, targetId: inner.id, kind: "calls", resolution: "exact" }));
  });

  it("respects parameters and does not infer property dispatch from the assignment label", () => {
    const { facts, snapshot } = graph("function helper() {}\nobj.run = function (helper) { helper(); };\nobj.run(); run();", language);
    expect(facts.symbols.some((item) => item.name === "obj.run")).toBe(true);
    expect(snapshot.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact")).toEqual([]);
  });

  it.each(["obj[key] = function () {}", "factory().run = () => 1", "obj.run ||= function () {}", "obj.run += function () {}"])("does not invent a static assignment label for %s", (source) => {
    const { facts } = graph(source, language);
    expect(facts.symbols.filter((item) => item.kind === "function")).toEqual([]);
  });

  it("preserves named-expression, variable, property and default-export identities", () => {
    const { facts } = graph("obj.run = function named() {}; const variable = () => {}; class A { field = () => {}; } export default () => {};", language);
    expect(facts.symbols.map((item) => item.name)).toEqual(expect.arrayContaining(["named", "variable", "field", "default"]));
    expect(facts.symbols.some((item) => item.name === "obj.run")).toBe(false);
    expect(facts.symbols.filter((item) => item.name === "default")).toHaveLength(1);
  });
});

it("retains TypeScript assertion wrappers and signature evidence without proving a property target", () => {
  const { facts, snapshot } = graph("interface Payload {}\nobj.run = ((value: Payload): Payload => value) satisfies Handler;", "typescript");
  const assigned = facts.symbols.find((item) => item.name === "obj.run")!;
  expect(assigned.range.start).toEqual({ line: 2, column: 1 });
  expect(snapshot.edges).toContainEqual(expect.objectContaining({ sourceId: assigned.id, kind: "accepts", resolution: "exact" }));
  expect(snapshot.edges).toContainEqual(expect.objectContaining({ sourceId: assigned.id, kind: "returns", resolution: "exact" }));
});
