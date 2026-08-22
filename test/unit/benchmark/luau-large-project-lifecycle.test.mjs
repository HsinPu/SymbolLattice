import { describe, expect, it } from "vitest";

import { validateDisposableLuauProject } from "../../../scripts/luau-large-project-lifecycle.mjs";

describe("Luau lifecycle contract", () => {
  it("rejects probes outside the disposable Luau project boundary", () => {
    expect(() => validateDisposableLuauProject("C:/tmp/not-a-luau-project", "probe.luau")).toThrow(/luau-v0434/iu);
    expect(() => validateDisposableLuauProject("C:/tmp/luau-v0434-probe", "../probe.luau")).toThrow(/luau-v0434/iu);
  });
});
