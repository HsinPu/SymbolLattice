import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

function facts(sourceText: string) {
  return extractFileFacts({ filePath: "pkg/service.py", language: "python", sourceText });
}

describe("Python relation facts v0.501", () => {
  it("resolves an undecorated direct self member call to one direct method", () => {
    const result = facts([
      "class Service:",
      "    def helper(self, value):",
      "        return value",
      "",
      "    def run(self, value):",
      "        return self.helper(value)"
    ].join("\n"));
    const run = result.symbols.find((symbol) => symbol.qualifiedName.endsWith("Service.run"));
    const helper = result.symbols.find((symbol) => symbol.qualifiedName.endsWith("Service.helper"));
    expect(result.edges).toContainEqual(expect.objectContaining({
      sourceId: run?.id,
      targetId: helper?.id,
      kind: "calls",
      resolution: "exact",
      confidence: 1,
      referenceName: "helper",
      evidence: {
        ruleId: "syntax.python.same-class.unique-direct-self-member-call",
        stage: "syntax",
        candidateSymbolIds: [helper?.id]
      }
    }));
  });

  it("keeps decorated, rebound, and dynamically mutated member calls as nonclaims", () => {
    const cases = [
      ["@decorate", "class Service:", "    def helper(self): pass", "    def run(self): return self.helper()"],
      ["class Service:", "    @decorate", "    def helper(self): pass", "    def run(self): return self.helper()"],
      ["class Service:", "    def helper(self): pass", "    def run(self):", "        self = other", "        return self.helper()"],
      ["class Service:", "    def helper(self): pass", "    def run(self):", "        setattr(self, 'helper', other)", "        return self.helper()"],
      ["class Service(metaclass=Meta):", "    def helper(self): pass", "    def run(self): return self.helper()"],
      ["class Service:", "    def __getattribute__(self, name): return other", "    def helper(self): pass", "    def run(self): return self.helper()"],
      ["class Service:", "    @decorate", "    def __getattr__(self, name): return other", "    def helper(self): pass", "    def run(self): return self.helper()"],
      ["class Service:", "    def helper(self): pass", "    helper = other", "    def run(self): return self.helper()"],
      ["class Service:", "    def helper(self): pass", "    def run(self): return self.helper()", "Service.helper = other"]
    ];
    for (const lines of cases) {
      expect(facts(lines.join("\n")).edges.filter((edge) =>
        edge.evidence?.ruleId === "syntax.python.same-class.unique-direct-self-member-call"
      )).toEqual([]);
    }
  });
});
