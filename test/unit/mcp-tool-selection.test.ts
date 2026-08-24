import { describe, expect, it } from "vitest";

import {
  ALL_SYMBOL_LATTICE_MCP_TOOL_NAMES,
  SYMBOL_LATTICE_MCP_TOOLS_ENVIRONMENT_VARIABLE,
  resolveMcpToolSelection
} from "../../src/mcp/tool-selection.js";

describe("MCP tool selection", () => {
  it("exposes only explore by default", () => {
    expect([...resolveMcpToolSelection(undefined)]).toEqual(["explore"]);
  });

  it("keeps explore primary while enabling an explicit optional allowlist", () => {
    expect([...resolveMcpToolSelection(" node, impact, node ")]).toEqual([
      "explore",
      "node",
      "impact"
    ]);
  });

  it("supports an explicit all-tools compatibility surface", () => {
    expect([...resolveMcpToolSelection("all")]).toEqual(ALL_SYMBOL_LATTICE_MCP_TOOL_NAMES);
  });

  it("rejects unknown tools and mixed all selections", () => {
    expect(() => resolveMcpToolSelection("missing")).toThrow(
      `${SYMBOL_LATTICE_MCP_TOOLS_ENVIRONMENT_VARIABLE} contains unsupported tools: missing.`
    );
    expect(() => resolveMcpToolSelection("all,node")).toThrow(
      `${SYMBOL_LATTICE_MCP_TOOLS_ENVIRONMENT_VARIABLE}=all cannot be combined with other tools.`
    );
  });
});
