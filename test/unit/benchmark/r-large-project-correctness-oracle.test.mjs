import { describe, expect, it } from "vitest";

import { collectRTruth, R_POSITIVE_QUOTAS } from "../../../benchmarks/r/correctness-oracle.mjs";

describe("R large-project correctness oracle", () => {
  it("keeps comments, strings, and nested functions out of independent truth", () => {
    const facts = collectRTruth(
      "fixture",
      "R/probe.r",
      `# hidden <- function() { 1 }
text <- "fake <- function() { 1 }"
setClass("RealRecord", slots = list(value = "character"))
real <- function(value) {
  value
}
outer <- function() {
  inner <- function() { 1 }
}
`
    );
    expect(facts.filter((fact) => ["identity", "typeIdentity"].includes(fact.stratum)).map((fact) => fact.target)).toEqual([
      expect.objectContaining({ name: "RealRecord", kind: "class" }),
      expect.objectContaining({ name: "real", kind: "function" }),
      expect.objectContaining({ name: "outer", kind: "function" })
    ]);
    expect(facts.filter((fact) => fact.stratum === "containment")).toHaveLength(3);
  });

  it("defines quotas above the minimum positive evidence target", () => {
    expect(Object.values(R_POSITIVE_QUOTAS).reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(300);
  });

  it("excludes function-valued arguments nested in parentheses and brackets", () => {
    const facts = collectRTruth(
      "fixture",
      "R/nested-arguments.r",
      `record <- new_class(
  constructor = function(value) { value },
  handlers = list(error = function(error) error)
)
root <- function(value) value
split <-
  function(value) value
`
    );
    expect(facts.filter((fact) => fact.kind === "identity").map((fact) => fact.target.name)).toEqual([
      "root",
      "split"
    ]);
  });

  it("excludes a declaration used as a braceless control-flow body", () => {
    const facts = collectRTruth(
      "fixture",
      "R/control.r",
      `if (TRUE)
  hidden <- function() 1
visible <- function() 1
`
    );
    expect(facts.filter((fact) => fact.kind === "identity").map((fact) => fact.target.name)).toEqual([
      "visible"
    ]);
  });
});
