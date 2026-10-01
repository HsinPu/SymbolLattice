import { describe, expect, it } from "vitest";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";

const rule = "syntax.javascript.member-call.unknown-receiver";
const extract = (sourceText: string) => extractFileFacts({ filePath: "calls.js", language: "javascript", sourceText });
describe("written JavaScript member call receipts", () => {
  it("preserves full chains and UTF-16 ranges without adding graph targets", () => {
    const sourceText = "'use strict';\r\nfunction run() { const emoji='🙂'; ns.registerPlugin.call(this); this.worker.apply(null, []); obj.\\u0072un(); }";
    const facts = extract(sourceText), calls = facts.edges.filter(edge => edge.evidence?.ruleId === rule);
    expect(calls.map(edge => edge.referenceName)).toEqual(["ns.registerPlugin.call", "this.worker.apply", "obj.run"]);
    const owner = facts.symbols.find(symbol => symbol.name === "run")!;
    expect(calls.every(edge => edge.sourceId === owner.id && edge.targetId === null && edge.confidence === 0 &&
      edge.resolution === "unresolved" && edge.kind === "calls")).toBe(true);
    const lines = sourceText.split("\r\n");
    expect(calls.map(edge => lines[edge.range.start.line - 1]!.slice(edge.range.start.column - 1, edge.range.end.column - 1)))
      .toEqual(["ns.registerPlugin.call", "this.worker.apply", "obj.\\u0072un"]);
    const graph = resolveProjectFacts({ sourceDocuments: [{ relativePath: "calls.js", absolutePath: "C:/calls.js",
      language: "javascript", sourceText, contentHash: "fixture" }], extractedFiles: [facts], indexedAt: "2026-10-01T00:00:00Z" });
    expect(graph.edges.some(edge => edge.evidence?.ruleId === rule)).toBe(false);
  });
  it("keeps callable ownership and excludes headers, anonymous callbacks, class execution and dynamic receivers", () => {
    const facts = extract(`ns.top();
function outer(value=ns.header()) { ns.outer(); items.map(()=>ns.callback());
  function inner(){ ns.inner(); } const arrow=()=>ns.arrow();
  class Box { field=ns.field(); method(){ ns.method(); } }
  getObject().dynamic(); obj[key].computed(); obj?.optional();
}`);
    const calls = facts.edges.filter(edge => edge.evidence?.ruleId === rule);
    const names = calls.map(edge => edge.referenceName);
    expect(names).toEqual(expect.arrayContaining(["ns.outer", "items.map", "ns.inner", "ns.arrow", "ns.method"]));
    expect(names).not.toEqual(expect.arrayContaining(["ns.callback"]));
    expect(names.some(name => /header|top|field|dynamic|computed|optional/.test(name!))).toBe(false);
    for (const name of ["inner", "arrow", "method"]) {
      const edge = calls.find(edge => edge.referenceName === `ns.${name}`)!;
      expect(facts.symbols.find(symbol => symbol.id === edge.sourceId)?.name).toBe(name);
    }
  });
  it("does not fabricate receipts from parser-rejected source", () => {
    expect(extract("function run( { obj.call();").edges.some(edge => edge.evidence?.ruleId === rule)).toBe(false);
  });
});
