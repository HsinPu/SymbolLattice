import { describe, expect, it } from "vitest";

import { collectJuliaTruth, JULIA_POSITIVE_QUOTAS } from "../../../benchmarks/julia/correctness-oracle.mjs";

describe("Julia large-project correctness oracle", () => {
  it("keeps comments and literals out of the independent declaration truth", () => {
    const facts = collectJuliaTruth(
      "fixture",
      "src/probe.jl",
      `# function fake() = 1
const text = "function alsoFake() = 1"
module Real
struct User
  name::String
end
function render(user::User)
  user.name
end
end`
    );
    expect(facts.filter((fact) => ["identity", "typeIdentity"].includes(fact.stratum)).map((fact) => fact.target)).toEqual([
      expect.objectContaining({ name: "Real", kind: "module" }),
      expect.objectContaining({ name: "User", kind: "type" }),
      expect.objectContaining({ name: "render", kind: "function" })
    ]);
    expect(facts.filter((fact) => fact.stratum === "containment")).toHaveLength(1);
  });

  it("defines quotas above the minimum positive evidence target", () => {
    expect(Object.values(JULIA_POSITIVE_QUOTAS).reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(300);
  });

  it("distinguishes short-form declarations from calls and comparisons", () => {
    const facts = collectJuliaTruth(
      "fixture",
      "src/short-form.jl",
      `real(x) = x
Base.show(x)::String where {T} = string(x)
sum(values) == 1
println("(S, T) = result")
value(x)::Int`
    );

    expect(facts.filter((fact) => fact.kind === "identity").map((fact) => fact.target.name)).toEqual([
      "real",
      "Base.show"
    ]);
  });

  it("masks triple strings without treating adjoint apostrophes as character literals", () => {
    const facts = collectJuliaTruth(
      "fixture",
      "src/literals.jl",
      `const docs = """function hidden() = 1
struct Hidden end"""
matrix = vectors' * vectors
function visible()
    matrix
end`
    );

    expect(facts.filter((fact) => fact.kind === "identity").map((fact) => fact.target.name)).toEqual([
      "visible"
    ]);
  });

  it("keeps eval-generated declarations outside the static truth contract", () => {
    const facts = collectJuliaTruth(
      "fixture",
      "src/dynamic.jl",
      `@eval begin
function generated()
end
generated_short(x) = x
end
function visible()
end`
    );

    expect(facts.filter((fact) => fact.kind === "identity").map((fact) => fact.target.name)).toEqual([
      "visible"
    ]);
  });
});
