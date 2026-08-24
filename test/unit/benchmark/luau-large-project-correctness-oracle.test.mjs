import { describe, expect, it } from "vitest";

import { collectLuauTruth, LUAU_POSITIVE_QUOTAS } from "../../../benchmarks/luau/correctness-oracle.mjs";

describe("Luau large-project correctness oracle", () => {
  it("keeps comments and strings out of the independent declaration truth", () => {
    const facts = collectLuauTruth(
      "fixture",
      "src/probe.luau",
      `-- function fake() end
local text = "function alsoFake() end"
local longText = [=[😀
function longFake() end
]=]
local interpolation = \`player's function interpolatedFake() end\`
--[==[
function commentFake() end
]==]
local function real<T>(value: T): T
  return value
end
export type User = { name: string }`
    );
    expect(facts.filter((fact) => ["identity", "typeIdentity"].includes(fact.stratum)).map((fact) => fact.target)).toEqual([
      expect.objectContaining({ name: "real", kind: "function" }),
      expect.objectContaining({ name: "User", kind: "type" })
    ]);
    expect(facts.filter((fact) => fact.stratum === "containment")).toHaveLength(2);
  });

  it("defines quotas that exceed the minimum positive evidence target", () => {
    expect(Object.values(LUAU_POSITIVE_QUOTAS).reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(300);
  });
});
