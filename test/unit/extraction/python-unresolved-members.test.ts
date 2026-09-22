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

  it("does not duplicate resolved calls or confuse member access and dynamic receivers with static callees", () => {
    const facts = extract(["class Box:", "    def helper(self): pass", "    def run(self, obj):",
      "        self.helper()", "        obj.member", "        factory().run()", "        obj['key']()", "        obj.unknown()"].join("\n"));
    expect(facts.edges.filter((edge) => edge.kind === "calls").map((edge) => [edge.referenceName, edge.resolution]))
      .toEqual([["helper", "exact"], ["obj.unknown", "unresolved"]]);
    expect(extract("def broken(obj):\n    obj.run()\n    x = (\n").edges.some((edge) => edge.evidence?.ruleId === ruleId)).toBe(false);
  });
});
