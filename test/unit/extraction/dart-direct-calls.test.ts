import { describe, expect, it } from "vitest";

import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";
import { extractDartFileFacts } from "../../../src/extraction/dart.js";

function symbolByName(facts: ArtifactFacts, kind: SymbolNode["kind"], name: string): SymbolNode {
  const matches = facts.symbols.filter((symbol) => symbol.kind === kind && symbol.name === name);
  expect(matches).toHaveLength(1);
  const symbol = matches[0];
  if (symbol === undefined) {
    throw new Error(`Missing ${kind} ${name}.`);
  }
  return symbol;
}

function calls(facts: ArtifactFacts) {
  return facts.edges.filter((edge) => edge.kind === "calls");
}

describe("Dart bounded same-file direct calls", () => {
  it("emits one exact zero-argument top-level function call with unique target evidence", () => {
    const facts = extractDartFileFacts({
      filePath: "lib/smoke.dart",
      language: "dart",
      sourceText: `int dartEntry() => dartHelper();

int dartHelper() => 1;`
    });
    const caller = symbolByName(facts, "function", "dartEntry");
    const callee = symbolByName(facts, "function", "dartHelper");

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        filePath: "lib/smoke.dart",
        range: {
          start: { line: 1, column: 20 },
          end: { line: 1, column: 30 }
        },
        resolution: "exact",
        confidence: 1,
        referenceName: "dartHelper",
        evidence: {
          ruleId: "syntax.dart.same-file.unique-top-level-zero-argument-function-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("fails closed for shadowing, nested execution, and non-bare call forms", () => {
    const sources = [
      [
        "parameter",
        `int dartEntry(int Function() dartHelper) => dartHelper();\nint dartHelper() => 1;`
      ],
      [
        "optional parameter",
        `int dartEntry([int Function()? dartHelper]) => dartHelper();\nint dartHelper() => 1;`
      ],
      [
        "named parameter",
        `int dartEntry({required int Function() dartHelper}) => dartHelper();\nint dartHelper() => 1;`
      ],
      [
        "local",
        `int dartEntry() { final dartHelper = () => 2; return dartHelper(); }\nint dartHelper() => 1;`
      ],
      [
        "local function",
        `int dartEntry() { int dartHelper() => 2; return dartHelper(); }\nint dartHelper() => 1;`
      ],
      [
        "for binding",
        `int dartEntry(List<Function> values) { for (final dartHelper in values) { return dartHelper(); } return 0; }\nint dartHelper() => 1;`
      ],
      [
        "catch binding",
        `int dartEntry() { try { throw 1; } catch (dartHelper) { return dartHelper(); } }\nint dartHelper() => 1;`
      ],
      [
        "closure body",
        `Function dartEntry() => () => dartHelper();\nint dartHelper() => 1;`
      ],
      [
        "nested function body",
        `int dartEntry() { int nested() => dartHelper(); return nested(); }\nint dartHelper() => 1;`
      ],
      [
        "member",
        `int dartEntry(dynamic value) => value.dartHelper();\nint dartHelper() => 1;`
      ],
      [
        "qualified",
        `int dartEntry() => foreign.dartHelper();\nint dartHelper() => 1;`
      ],
      [
        "generic",
        `int dartEntry() => dartHelper<int>();\nT dartHelper<T>() => throw StateError('x');`
      ],
      [
        "nonzero argument",
        `int dartEntry() => dartHelper(1);\nint dartHelper(int value) => value;`
      ]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractDartFileFacts({
        filePath: "lib/smoke.dart",
        language: "dart",
        sourceText
      });
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("fails closed when target arity or same-file declaration identity is not unique", () => {
    const sources = [
      [
        "required parameter",
        `int dartEntry() => dartHelper();\nint dartHelper(int value) => value;`
      ],
      [
        "optional parameter",
        `int dartEntry() => dartHelper();\nint dartHelper([int value = 0]) => value;`
      ],
      [
        "named parameter",
        `int dartEntry() => dartHelper();\nint dartHelper({int value = 0}) => value;`
      ],
      [
        "duplicate function declaration",
        `int dartEntry() => dartHelper();\nint dartHelper() => 1;\nint dartHelper(int value) => value;`
      ],
      [
        "class and function competition",
        `class dartHelper {}\nint dartEntry() => dartHelper();\nint dartHelper() => 1;`
      ],
      [
        "typedef and function competition",
        `typedef dartHelper = int Function();\nint dartEntry() => dartHelper();\nint dartHelper() => 1;`
      ],
      [
        "top-level variable and function competition",
        `final dartHelper = () => 2;\nint dartEntry() => dartHelper();\nint dartHelper() => 1;`
      ],
      [
        "class method is not a top-level target",
        `class Smoke { int dartEntry() => dartHelper(); int dartHelper() => 1; }`
      ]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractDartFileFacts({
        filePath: "lib/smoke.dart",
        language: "dart",
        sourceText
      });
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("fails closed when imports, exports, parts, or explicit libraries add cross-file visibility", () => {
    const sources = [
      `import 'foreign.dart';\nint dartEntry() => dartHelper();\nint dartHelper() => 1;`,
      `export 'foreign.dart';\nint dartEntry() => dartHelper();\nint dartHelper() => 1;`,
      `part 'foreign.dart';\nint dartEntry() => dartHelper();\nint dartHelper() => 1;`,
      `part of smoke;\nint dartEntry() => dartHelper();\nint dartHelper() => 1;`,
      `library smoke;\nint dartEntry() => dartHelper();\nint dartHelper() => 1;`
    ] as const;

    for (const sourceText of sources) {
      const facts = extractDartFileFacts({
        filePath: "lib/smoke.dart",
        language: "dart",
        sourceText
      });
      expect(calls(facts), sourceText.split("\n", 1)[0]).toEqual([]);
    }
  });

  it("preserves bodyless function declarations without treating them as local definitions", () => {
    const facts = extractDartFileFacts({
      filePath: "lib/smoke.dart",
      language: "dart",
      sourceText: `external int dartHelper();
int dartEntry() => dartHelper();`
    });

    symbolByName(facts, "function", "dartHelper");
    symbolByName(facts, "function", "dartEntry");
    expect(calls(facts)).toEqual([]);
  });
});
