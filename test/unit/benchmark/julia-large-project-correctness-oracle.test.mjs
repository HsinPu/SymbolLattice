import { describe, expect, it } from "vitest";

import { collectJuliaTruth, JULIA_POSITIVE_QUOTAS } from "../../../scripts/julia-large-project-correctness-oracle.mjs";

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
});
