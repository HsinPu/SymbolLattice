import { describe, expect, it } from "vitest";

import { validateDisposableCssProject } from "../../../benchmarks/css/lifecycle.mjs";

describe("CSS large-project lifecycle harness", () => {
  it("refuses unmarked or out-of-project mutation targets", () => {
    expect(() => validateDisposableCssProject(process.cwd(), "README.css")).toThrow(/css-v0426/u);
    expect(() => validateDisposableCssProject("css-v0426-fake", "../outside.css")).toThrow(/css-v0426/u);
  });
});
