import { describe, expect, it } from "vitest";

import { extractErlangFileFacts } from "../../../src/extraction/erlang.js";

describe("Erlang v0.468 bounded relation facts", () => {
  it("extracts module/export, record/type, callback/spec, imports, calls, and record creation", () => {
    const facts = extractErlangFileFacts({
      filePath: "src/app.erl",
      language: "erlang",
      sourceText: [
        "-module(app).",
        "-export([execute/1]).",
        "-export_type([point/0]).",
        "-import(api, [helper/1]).",
        "-record(point, {value}).",
        "-type point() :: atom().",
        "-callback callback(point()) -> point().",
        "-spec execute(point()) -> point().",
        "execute(Value) ->",
        "  Point = #point{value = Value},",
        "  api:helper(Point),",
        "  helper(Point)."
      ].join("\n")
    });

    expect(facts.erlangFacts?.parserRejected).toBe(false);
    expect(facts.erlangFacts?.moduleName).toBe("app");
    expect(facts.erlangFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "app", declarationKind: "module" }),
      expect.objectContaining({ name: "point", declarationKind: "record" }),
      expect.objectContaining({ name: "point", declarationKind: "type" })
    ]));
    expect(facts.erlangFacts?.callables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "callback", arity: 1, callableKind: "callback" }),
      expect.objectContaining({ name: "execute", arity: 1, callableKind: "function", parameterTypeNames: ["point"], returnTypeName: "point" })
    ]));
    expect(facts.erlangFacts?.imports).toEqual([
      expect.objectContaining({ importKind: "module", importedModule: "api", importedNames: ["helper/1"] })
    ]);
    expect(facts.erlangFacts?.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ callKind: "module", receiverModuleName: "api", referenceName: "helper/1", argumentCount: 1 }),
      expect.objectContaining({ callKind: "direct", referenceName: "helper/1", argumentCount: 1 })
    ]));
    expect(facts.erlangFacts?.instantiations).toEqual([
      expect.objectContaining({ typeName: "point", argumentCount: 1 })
    ]);
  });

  it("keeps behaviours and unsupported clause, parse-transform, and malformed forms fail-closed", () => {
    const behaviour = extractErlangFileFacts({
      filePath: "src/service.erl",
      language: "erlang",
      sourceText: [
        "-module(service).",
        "-behaviour(contract).",
        "-export([run/1]).",
        "-spec run(point()) -> point().",
        "run(Value) -> Value."
      ].join("\n")
    });
    expect(behaviour.erlangFacts?.heritage).toEqual([
      expect.objectContaining({ sourceTypeName: "service", referenceName: "contract", relationKind: "implements" })
    ]);

    const cases = [
      "-module(clauses).\n-export([run/1]).\nrun(ok) -> one;\nrun(Value) -> Value.",
      "-module(transform).\n-compile({parse_transform, custom}).\nrun(Value) -> Value.",
      "-module(conditional).\n-ifdef(TEST).\nrun(Value) -> Value.\n-endif.",
      "-module(broken).\nrun(Value) -> {Value."
    ];
    for (const sourceText of cases) {
      const facts = extractErlangFileFacts({ filePath: "src/bad.erl", language: "erlang", sourceText });
      expect(facts.erlangFacts?.parserRejected === true || facts.erlangFacts?.callables.length === 0).toBe(true);
      expect(facts.erlangFacts?.calls).toEqual([]);
      expect(facts.erlangFacts?.instantiations).toEqual([]);
    }
  });
});
