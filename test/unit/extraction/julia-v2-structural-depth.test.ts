import { describe, expect, it } from "vitest";

import { extractJuliaFileFacts } from "../../../src/extraction/julia.js";

function symbols(facts: ReturnType<typeof extractJuliaFileFacts>) {
  return facts.symbols.filter((symbol) => symbol.kind !== "file");
}

function contains(facts: ReturnType<typeof extractJuliaFileFacts>) {
  return facts.edges.filter((edge) => edge.kind === "contains");
}

describe("Julia structural depth v2", () => {
  it("extracts nested modules, types, full-form methods, and one-line methods", () => {
    const facts = extractJuliaFileFacts({
      filePath: "src/Geometry.jl",
      language: "julia",
      sourceText: `module Geometry

abstract type Shape end

mutable struct Point{T<:Real} <: Shape
    x::T
    y::T
end

function distance(a::Point, b::Point)::Float64
    sqrt((a.x - b.x)^2 + (a.y - b.y)^2)
end

translate(p::Point, dx::Real, dy::Real) = Point(p.x + dx, p.y + dy)

end
`
    });

    expect(symbols(facts)).toEqual([
      expect.objectContaining({ kind: "module", name: "Geometry" }),
      expect.objectContaining({ kind: "type", name: "Shape" }),
      expect.objectContaining({ kind: "type", name: "Point" }),
      expect.objectContaining({ kind: "function", name: "distance" }),
      expect.objectContaining({ kind: "function", name: "translate" })
    ]);
    expect(contains(facts)).toHaveLength(5);
    expect(contains(facts).every((edge) => edge.resolution === "exact" && edge.confidence === 1)).toBe(true);
    expect(contains(facts).every((edge) => edge.evidence?.stage === "syntax")).toBe(true);
  });

  it("extracts qualified methods and primitive types without guessing runtime dispatch", () => {
    const facts = extractJuliaFileFacts({
      filePath: "src/Methods.jl",
      language: "julia",
      sourceText: `module Methods
primitive type UInt24 24 end
struct Box
    value::Int
end
function Base.show(io::IO, box::Box)
    print(io, box.value)
end
Base.length(box::Box) = 1
      end
`
    });
    expect(symbols(facts)).toEqual([
      expect.objectContaining({ kind: "module", name: "Methods" }),
      expect.objectContaining({ kind: "type", name: "UInt24" }),
      expect.objectContaining({ kind: "type", name: "Box" }),
      expect.objectContaining({ kind: "function", name: "Base.show" }),
      expect.objectContaining({ kind: "function", name: "Base.length" })
    ]);
    expect(contains(facts)).toHaveLength(5);
  });

  it("fails closed for malformed structural declarations and dynamic macro forms", () => {
    const malformed = extractJuliaFileFacts({
      filePath: "src/Bad.jl",
      language: "julia",
      sourceText: `module Bad
struct Missing
  value::Int
module Nested
end
`
    });
    expect(symbols(malformed)).toEqual([]);

    const dynamic = extractJuliaFileFacts({
      filePath: "src/Dynamic.jl",
      language: "julia",
      sourceText: `@eval module Generated
function hidden() = 1
end
`
    });
    expect(symbols(dynamic)).toEqual([]);
  });

  it("keeps declarations outside Julia character, triple-quoted, command, and nested comments", () => {
    const debugSource = [
      "module Literals",
      "const CHAR = 'x'",
      'const DOC = """function fake() = 1',
      'struct NotAType end"""',
      `const COMMAND = ${String.fromCharCode(96)}function not_a_function() = 1${String.fromCharCode(96)}`,
      "#= outer #= nested function hidden() = 1 =# still comment =#",
      "real() = CHAR",
      "end",
      ""
    ].join("\n");
    const facts = extractJuliaFileFacts({ filePath: "src/Literals.jl", language: "julia", sourceText: debugSource });
    expect(symbols(facts)).toEqual([
      expect.objectContaining({ kind: "module", name: "Literals" }),
      expect.objectContaining({ kind: "function", name: "real" })
    ]);
  });

  it("treats paired Julia adjoints as operators without swallowing delimiters", () => {
    const facts = extractJuliaFileFacts({
      filePath: "src/Adjoints.jl",
      language: "julia",
      sourceText: `module Adjoints
function before()
    values = compare(rewrite(x' * ones(2, 2)), x' * ones(2, 2))
end
function after()
    true
end
end`
    });

    expect(symbols(facts)).toEqual([
      expect.objectContaining({ kind: "module", name: "Adjoints" }),
      expect.objectContaining({ kind: "function", name: "before" }),
      expect.objectContaining({ kind: "function", name: "after" })
    ]);
  });

  it("extracts bounded nested Julia method declarations", () => {
    const facts = extractJuliaFileFacts({
      filePath: "src/NestedMethods.jl",
      language: "julia",
      sourceText: `module NestedMethods
struct Box
    value::Int
    function Box(value::Int)
        new(value)
    end
end
function outer!_impl()
    local_short(x) = x
    function local_long(y)
        y
    end
end
end`
    });

    expect(symbols(facts).map((symbol) => [symbol.kind, symbol.name])).toEqual([
      ["module", "NestedMethods"],
      ["type", "Box"],
      ["function", "Box"],
      ["function", "local_short"],
      ["function", "local_long"]
    ]);

    const dynamic = extractJuliaFileFacts({
      filePath: "src/DynamicNested.jl",
      language: "julia",
      sourceText: `@eval begin
function generated()
end
end`
    });
    expect(symbols(dynamic)).toEqual([]);

    const typedCall = extractJuliaFileFacts({
      filePath: "src/TypedCall.jl",
      language: "julia",
      sourceText: `module TypedCall
function outer(model)
    MOI.get(model, MOI.ListOfVariableIndices())::Vector{MOI.VariableIndex}
    next_value = 1
end
end`
    });
    expect(symbols(typedCall).map((symbol) => symbol.name)).toEqual(["TypedCall", "outer"]);
  });
});
