import { describe, expect, it } from "vitest";

import { extractZigFileFacts } from "../../../src/extraction/zig.js";

describe("Zig v0.472 bounded relation facts", () => {
  it("extracts literal imports, typed declarations, calls, construction, and signatures", () => {
    const facts = extractZigFileFacts({
      filePath: "src/app.zig",
      language: "zig",
      sourceText: [
        'const api = @import("api.zig");',
        "const Local = struct {};",
        "const Mode = enum { ready, done };",
        "fn helper(value: Local) Local { return value; }",
        "fn caller(value: Local) Local {",
        "  _ = api.build(1);",
        "  return helper(value);",
        "}",
        "fn make(value: Local) Local { return Local{ .value = value }; }"
      ].join("\n")
    });

    expect(facts.zigFacts?.parserRejected).toBe(false);
    expect(facts.zigFacts?.imports).toEqual([
      expect.objectContaining({
        sourceId: expect.any(String),
        filePath: "src/app.zig",
        localName: "api",
        importedPath: "api.zig",
        range: { start: { line: 1, column: 22 }, end: { line: 1, column: 29 } }
      })
    ]);
    expect(facts.zigFacts?.types).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Local", declarationKind: "struct" }),
        expect.objectContaining({ name: "Mode", declarationKind: "enum" })
      ])
    );
    expect(facts.zigFacts?.callables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "helper", parameterCount: 1, parameterTypeNames: ["Local"], returnTypeName: "Local" }),
        expect.objectContaining({ name: "caller", parameterCount: 1, parameterTypeNames: ["Local"], returnTypeName: "Local" })
      ])
    );
    expect(facts.zigFacts?.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callKind: "module", receiverModuleName: "api", referenceName: "build", argumentCount: 1 })
      ])
    );
    expect(facts.zigFacts?.instantiations).toEqual([
      expect.objectContaining({ typeName: "Local", argumentCount: 0 })
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "calls")).toEqual([]);
  });

  it.each([
    ["malformed delimiter", "fn caller() void {"],
    ["anytype parameter", "fn caller(value: anytype) void { helper(value); }\nfn helper(value: anytype) void {}"],
    ["local function binding", "fn caller() void { const helper = callback; helper(); }\nfn helper() void {}"],
    ["comptime body", "fn caller() void { comptime helper(); }\nfn helper() void {}"],
    ["qualified foreign call", "fn caller() void { foreign.helper(); }\nfn helper() void {}"]
  ])("fails closed for %s", (_description, sourceText) => {
    const facts = extractZigFileFacts({ filePath: "src/probe.zig", language: "zig", sourceText });
    expect(facts.edges.filter((edge) => ["calls", "instantiates"].includes(edge.kind))).toEqual([]);
    if (_description === "malformed delimiter") {
      expect(facts.zigFacts?.parserRejected).toBe(true);
    }
  });
});
