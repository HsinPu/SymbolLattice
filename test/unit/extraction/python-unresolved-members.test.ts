import { describe, expect, it } from "vitest";
import { extractFileFacts } from "../../../src/extraction/index.js";

const extract = (sourceText: string) => extractFileFacts({ filePath: "pkg/service.py", language: "python", sourceText });
const ruleId = "syntax.python.member-call.unknown-receiver";

describe("Python unresolved member invocation evidence", () => {
  it("preserves an unknown receiver call with its full callee range and no guessed target", () => {
    const facts = extract("def handle(request, resolver):\n    callback = resolver.resolve_error_handler(500)\n    return callback(request)\n");
    const owner = facts.symbols.find((symbol) => symbol.name === "handle")!;
    expect(facts.edges.filter((edge) => edge.kind === "calls")).toEqual([
      expect.objectContaining({ sourceId: owner.id, targetId: null, referenceName: "resolver.resolve_error_handler",
        resolution: "unresolved", confidence: 0,
        range: { start: { line: 2, column: 16 }, end: { line: 2, column: 46 } },
        evidence: { ruleId, stage: "syntax", candidateSymbolIds: [] } })
    ]);
    expect(facts.pendingReferences).toEqual([]);
  });

  it("keeps lexical ownership across async, decorated, nested and class scopes", () => {
    const facts = extract([
      "@decorate(factory.call())", "async def outer(client):", "    await client.send()",
      "    def inner():", "        nested.work()", "    class Box:", "        body.run()",
      "        def method(self):", "            service.api.run()", "    return lambda: hidden.call()"
    ].join("\n"));
    const calls = facts.edges.filter((edge) => edge.evidence?.ruleId === ruleId);
    expect(calls.map((edge) => [facts.symbols.find((symbol) => symbol.id === edge.sourceId)?.name, edge.referenceName]))
      .toEqual([["outer", "client.send"], ["inner", "nested.work"], ["method", "service.api.run"]]);
  });

  it("keeps written member calls around a recoverable bare yield", () => {
    const facts = extract("def stream(client):\n    client.before()\n    yield\n    client.after()\n");
    const owner = facts.symbols.find((symbol) => symbol.name === "stream")!;
    expect(facts.edges.filter((edge) => edge.evidence?.ruleId === ruleId)).toEqual([
      expect.objectContaining({ sourceId: owner.id, targetId: null,
        referenceName: "client.before", resolution: "unresolved", confidence: 0,
        range: { start: { line: 2, column: 5 }, end: { line: 2, column: 18 } } }),
      expect.objectContaining({ sourceId: owner.id, targetId: null,
        referenceName: "client.after", resolution: "unresolved", confidence: 0,
        range: { start: { line: 4, column: 5 }, end: { line: 4, column: 17 } } })
    ]);
  });

  it("does not duplicate resolved calls or confuse member access and dynamic receivers with static callees", () => {
    const facts = extract(["class Box:", "    def helper(self): pass", "    def run(self, obj):",
      "        self.helper()", "        obj.member", "        factory().run()", "        obj['key']()", "        obj.unknown()"].join("\n"));
    expect(facts.edges.filter((edge) => edge.kind === "calls").map((edge) => [edge.referenceName, edge.resolution]))
      .toEqual([["helper", "exact"], ["obj.unknown", "unresolved"]]);
    expect(extract("def broken(obj):\n    obj.run()\n    x = (\n").edges.some((edge) => edge.evidence?.ruleId === ruleId)).toBe(false);
  });
});

describe("Python non-call member source evidence", () => {
  const references = (text: string) => extract(text).edges.filter((edge) =>
    edge.evidence?.ruleId === "syntax.python.member-reference.unknown-receiver");

  it("keeps maximal static occurrences including Store/Del without calling them invocations", () => {
    const text = ["def use(obj):", "    obj.inner.value = obj.other", "    obj.count += 1",
      "    del obj.cached", "    obj.inner.run(obj.input)", "    return obj.items[obj.index].value"].join("\n");
    const facts = extract(text);
    expect(references(text).map((edge) => edge.referenceName)).toEqual([
      "obj.inner.value", "obj.other", "obj.count", "obj.cached", "obj.input", "obj.items", "obj.index"
    ]);
    expect(references(text).every((edge) => edge.kind === "references" && edge.targetId === null &&
      edge.resolution === "unresolved" && edge.confidence === 0)).toBe(true);
    expect(facts.edges.filter((edge) => edge.kind === "calls").map((edge) => edge.referenceName)).toEqual(["obj.inner.run"]);
    for (const edge of references(text)) {
      expect(text.split("\n")[edge.range.start.line - 1]?.slice(edge.range.start.column - 1,
        edge.range.end.column - 1)).toBe(edge.referenceName);
    }
  });

  it("keeps body ownership while excluding decorators, defaults, lambda and class execution", () => {
    const facts = extract(["module.value", "@decorate(obj.decorator)", "async def outer(x=obj.default):",
      "    obj.outer", "    def inner():", "        obj.inner", "    class Box:", "        obj.class_body",
      "        def method(self):", "            self.member", "    return lambda: obj.lambda_body"].join("\n"));
    expect(facts.edges.filter((edge) => edge.evidence?.ruleId === "syntax.python.member-reference.unknown-receiver")
      .map((edge) => [facts.symbols.find((symbol) => symbol.id === edge.sourceId)?.name, edge.referenceName]))
      .toEqual([["outer", "obj.outer"], ["inner", "obj.inner"], ["method", "self.member"]]);
  });

  it("retains UTF-16 ranges, CRLF and bare-yield recovery but excludes unsupported parser input", () => {
    const text = "def read(obj):\r\n    text = '😀'; obj.版本\r\n    yield\r\n    return obj.after\r\n";
    const edges = references(text);
    expect(edges.map((edge) => edge.referenceName)).toEqual(["obj.版本", "obj.after"]);
    for (const edge of edges) expect(text.split("\r\n")[edge.range.start.line - 1]?.slice(
      edge.range.start.column - 1, edge.range.end.column - 1)).toBe(edge.referenceName);
    expect(references("def broken(obj):\n    obj.value\n    x = (\n")).toEqual([]);
    expect(references("def read(obj):\n    return (obj).value\n")).toEqual([]);
  });
});
