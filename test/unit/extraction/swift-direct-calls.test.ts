import { describe, expect, it } from "vitest";

import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";
import { extractSwiftFileFacts } from "../../../src/extraction/swift.js";

function functionByName(facts: ArtifactFacts, name: string): SymbolNode {
  const matches = facts.symbols.filter((symbol) => symbol.kind === "function" && symbol.name === name);
  expect(matches).toHaveLength(1);
  const symbol = matches[0];
  if (symbol === undefined) {
    throw new Error(`Missing function ${name}.`);
  }
  return symbol;
}

function calls(facts: ArtifactFacts) {
  return facts.edges.filter((edge) => edge.kind === "calls");
}

describe("Swift bounded same-file direct calls", () => {
  it("emits one exact empty-argument call to a unique file-private top-level function", () => {
    const sources = [
      ["private", "swiftHelper", "swiftHelper"],
      ["fileprivate", "swiftHelper", "swiftHelper"],
      ["private", "`swiftHelper`", "`swiftHelper`"]
    ] as const;

    for (const [visibility, declarationName, callName] of sources) {
      const facts = extractSwiftFileFacts({
        filePath: "Sources/App/Smoke.swift",
        language: "swift",
        sourceText: `${visibility} func ${declarationName}() -> Int { 1 }

func swiftEntry() -> Int {
  ${callName}()
}`
      });
      const caller = functionByName(facts, "swiftEntry");
      const callee = functionByName(facts, "swiftHelper");

      expect(calls(facts), `${visibility} ${declarationName}`).toEqual([
        expect.objectContaining({
          sourceId: caller.id,
          targetId: callee.id,
          resolution: "exact",
          confidence: 1,
          referenceName: "swiftHelper",
          range: {
            start: { line: 4, column: 3 },
            end: { line: 4, column: callName.length + 5 }
          },
          evidence: {
            ruleId: "syntax.swift.same-file.unique-file-private-top-level-function-call",
            stage: "syntax",
            candidateSymbolIds: [callee.id]
          }
        })
      ]);
    }
  });

  it("fails closed for shadowing, overload, nonlocal visibility, and unsupported call forms", () => {
    const sources = [
      [
        "parameter shadow",
        `func swiftEntry(swiftHelper: () -> Int) -> Int { swiftHelper() }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "escaped parameter shadow",
        `func swiftEntry(\`swiftHelper\`: () -> Int) -> Int { swiftHelper() }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "local binding",
        `func swiftEntry() -> Int { let swiftHelper = { 2 }; return swiftHelper() }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "escaped local binding",
        `func swiftEntry() -> Int { let \`swiftHelper\` = { 2 }; return swiftHelper() }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "closure boundary",
        `func swiftEntry() -> Int { let callback = { swiftHelper() }; return callback() }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "nested function",
        `func swiftEntry() -> Int { func swiftHelper() -> Int { 2 }; return swiftHelper() }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "import competition",
        `import Foundation
func swiftEntry() -> Int { swiftHelper() }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "cross-file module visibility",
        `func swiftEntry() -> Int { swiftHelper() }
func swiftHelper() -> Int { 1 }`
      ],
      [
        "member call",
        `func swiftEntry(_ value: Holder) -> Int { value.swiftHelper() }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "qualified call",
        `func swiftEntry() -> Int { SwiftSmoke.swiftHelper() }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "generic call and target",
        `func swiftEntry() -> Int { swiftHelper<Int>() }
private func swiftHelper<T>() -> Int { 1 }`
      ],
      [
        "parameterized call and target",
        `func swiftEntry() -> Int { swiftHelper(1) }
private func swiftHelper(_ value: Int) -> Int { value }`
      ],
      [
        "default parameter",
        `func swiftEntry() -> Int { swiftHelper() }
private func swiftHelper(_ value: Int = 0) -> Int { value }`
      ],
      [
        "variadic parameter",
        `func swiftEntry() -> Int { swiftHelper() }
private func swiftHelper(_ values: Int...) -> Int { values.count }`
      ],
      [
        "overload",
        `func swiftEntry() -> Int { swiftHelper() }
private func swiftHelper() -> Int { 1 }
private func swiftHelper(_ value: Int) -> Int { value }`
      ],
      [
        "escaped function overload",
        `func swiftEntry() -> Int { swiftHelper() }
private func swiftHelper() -> Int { 1 }
private func \`swiftHelper\`(_ value: Int) -> Int { value }`
      ],
      [
        "type and function competition",
        `private struct swiftHelper {}
func swiftEntry() -> Int { swiftHelper(); return 1 }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "escaped type and function competition",
        `private struct \`swiftHelper\` {}
func swiftEntry() -> Int { swiftHelper(); return 1 }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "top-level value and function competition",
        `private let swiftHelper = { 2 }
func swiftEntry() -> Int { swiftHelper() }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "escaped top-level value and function competition",
        `private let \`swiftHelper\` = { 2 }
func swiftEntry() -> Int { swiftHelper() }
private func swiftHelper() -> Int { 1 }`
      ],
      [
        "operator declaration and call",
        `func swiftEntry() -> Int { 1 + 2 }
private func + (left: Int, right: Int) -> Int { left - right }`
      ]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractSwiftFileFacts({
        filePath: "Sources/App/Smoke.swift",
        language: "swift",
        sourceText
      });
      expect(
        facts.symbols.some((symbol) => symbol.kind === "function" && symbol.name === "swiftEntry"),
        description
      ).toBe(true);
      expect(calls(facts), description).toEqual([]);
    }
  });
});
