import { describe, expect, it } from "vitest";

import { extractLuaFileFacts } from "../../../src/extraction/lua.js";

function functions(facts: ReturnType<typeof extractLuaFileFacts>) {
  return facts.symbols.filter((symbol) => symbol.kind === "function" || symbol.kind === "method");
}

function types(facts: ReturnType<typeof extractLuaFileFacts>) {
  return facts.symbols.filter((symbol) => symbol.kind === "type");
}

function calls(facts: ReturnType<typeof extractLuaFileFacts>) {
  return facts.edges.filter((edge) => edge.kind === "calls");
}

describe("Luau v2 structural depth", () => {
  it("recognizes bounded generic named functions and exact same-file calls", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/generic.luau",
      language: "luau",
      sourceText: `local function identity<T>(value: T): T
  return value
end

local function entry(): number
  return identity(1)
end`
    });

    expect(functions(facts).map((symbol) => symbol.name)).toEqual(["identity", "entry"]);
    expect(calls(facts)).toEqual([
      expect.objectContaining({
        referenceName: "identity",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "syntax.luau.same-file.unique-bounded-argument-bare-function-call",
          candidateSymbolIds: [expect.any(String)]
        })
      })
    ]);
  });

  it("emits a stable method symbol for a bounded receiver member declaration", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/widget.luau",
      language: "luau",
      sourceText: `function Widget.map<T>(items: {T}): {T}
  return items
end`
    });

    expect(functions(facts)).toEqual([
      expect.objectContaining({
        name: "map",
        qualifiedName: "src/widget.luau#Widget.map",
        kind: "method",
        isExported: true
      })
    ]);

    const colonFacts = extractLuaFileFacts({
      filePath: "src/widget.luau",
      language: "luau",
      sourceText: `function Widget:reset(): boolean
  return true
end`
    });
    expect(functions(colonFacts)).toEqual([
      expect.objectContaining({
        name: "reset",
        qualifiedName: "src/widget.luau#Widget:reset",
        kind: "method"
      })
    ]);
  });

  it("emits exported and local type aliases without claiming type relations", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/types.luau",
      language: "luau",
      sourceText: `export type User<T> = { name: string, value: T? }
type Scalar = string | number`
    });

    expect(types(facts)).toEqual([
      expect.objectContaining({ name: "User", kind: "type", isExported: true }),
      expect.objectContaining({ name: "Scalar", kind: "type", isExported: false })
    ]);
    expect(facts.edges.filter((edge) => edge.kind !== "contains")).toEqual([]);
  });

  it("accepts bounded singleton and typeof-based Luau aliases", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/runtime-types.luau",
      language: "luau",
      sourceText: `export type Mode = "open" | "closed"
export type Packet = { type: "full", data: string }
export type Widget = typeof(setmetatable({} :: {}, {} :: typeof({ __index = Widget })))
export type WrappedIterator<T...> = (...any) -> T...
type Schedulable = ImmediateSchedulableSystem<(ImmediateRuntime, ...any) -> ()>`
    });

    expect(types(facts).map((symbol) => symbol.name)).toEqual([
      "Mode",
      "Packet",
      "Widget",
      "WrappedIterator",
      "Schedulable"
    ]);

    const malformedPack = extractLuaFileFacts({
      filePath: "src/malformed-pack.luau",
      language: "luau",
      sourceText: "type MissingElement = (...)"
    });
    expect(types(malformedPack)).toEqual([]);
  });

  it("keeps exact calls when parameter and return annotations are bounded compound types", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/compound.luau",
      language: "luau",
      sourceText: `export type User = {name: string}

local function read(value: {name: string}): string
  return value.name
end

local function entry(): string
  return read({name = "x"})
end`
    });

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        referenceName: "read",
        resolution: "exact",
        confidence: 1
      })
    ]);
  });

  it("accepts bounded generic, optional, union, and function type annotations", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/advanced-types.luau",
      language: "luau",
      sourceText: `export function apply<T, U>(value: T?, transform: (T) -> U): U | nil
  return transform(value :: T)
end`
    });

    expect(functions(facts)).toEqual([
      expect.objectContaining({ name: "apply", kind: "function", isExported: true })
    ]);
  });

  it("treats Luau interpolated strings as literals for structural scanning", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/interpolation.luau",
      language: "luau",
      sourceText: `local function render(value: string): string
  return \`value: {value}\`
end`
    });
    expect(functions(facts).map((symbol) => symbol.name)).toEqual(["render"]);
  });

  it("accepts Luau if-expressions without treating then/else as block delimiters", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/if-expression.luau",
      language: "luau",
      sourceText: `local function choose(flag: boolean): string
  local value = if flag then "yes" else "no"
  return value
end`
    });
    expect(functions(facts).map((symbol) => symbol.name)).toEqual(["choose"]);

    const malformed = extractLuaFileFacts({
      filePath: "src/if-expression-invalid.luau",
      language: "luau",
      sourceText: `local function broken(flag: boolean): string
  local value = if flag then "yes"
  return value
end`
    });
    expect(functions(malformed)).toEqual([]);
  });

  it("keeps multiline and statement-nested Luau if-expressions structurally balanced", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/nested-if-expressions.luau",
      language: "luau",
      sourceText: `local function choose(flag: boolean): string
  if flag then
    return tostring(
      if flag then "yes" else "no"
    )
  end

  local value = if flag
    then if flag then "nested" else "no"
    else "fallback"
  return value
end`
    });

    expect(functions(facts).map((symbol) => symbol.name)).toEqual(["choose"]);

    const callbackFacts = extractLuaFileFacts({
      filePath: "src/callback-statements.luau",
      language: "luau",
      sourceText: `local function register(flag: boolean): boolean
  return run(function()
    if flag then
      return true
    end
    return false
  end)
end`
    });
    expect(functions(callbackFacts).map((symbol) => symbol.name)).toEqual(["register"]);
  });

  it("fails closed for malformed generic heads and aliases", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/invalid.luau",
      language: "luau",
      sourceText: `local function broken<T(value: T): T
  return value
end
export type Missing = { name: string`
    });

    expect(functions(facts)).toEqual([]);
    expect(types(facts)).toEqual([]);
    expect(calls(facts)).toEqual([]);
  });
});
