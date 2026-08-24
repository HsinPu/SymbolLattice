import { describe, expect, it } from "vitest";
import { renderExploreText } from "../../src/mcp/explore-text.js";

describe("MCP explore text rendering", () => {
  it("renders a concise Markdown result instead of exposing diagnostic JSON", () => {
    const text = renderExploreText({
      status: {
        initialized: true,
        stale: true,
        staleReasons: ["source-files-changed"],
        projectPath: "C:/project",
        generationId: "generation:test",
        counts: { files: 12, symbols: 34, edges: 56, pendingReferences: 7 }
      },
      mode: "query",
      match: { status: "not_found", reference: "user handler", candidates: [] },
      queryPlan: { query: "user handler", selection: [{ internal: "diagnostic" }] },
      focuses: [{
        rank: 1,
        symbol: {
          qualifiedName: "src/users.ts#userById",
          name: "userById",
          kind: "function",
          filePath: "src/users.ts",
          range: { start: { line: 12, column: 1 }, end: { line: 14, column: 2 } }
        },
        source: {
          filePath: "src/users.ts",
          startLine: 12,
          endLine: 14,
          lines: [
            { line: 12, text: "export function userById() {" },
            { line: 13, text: "  return findUser();" },
            { line: 14, text: "}" }
          ],
          text: "export function userById() {\n  return findUser();\n}",
          sourceIdentity: { internal: "diagnostic" }
        }
      }],
      connections: [{
        source: { qualifiedName: "src/users.ts#userById" },
        target: { qualifiedName: "src/db.ts#findUser" },
        edge: { kind: "calls", filePath: "src/users.ts", range: { start: { line: 13 } } }
      }],
      connectionsTruncated: false,
      sourceWindows: [],
      evidencePaths: [],
      sourceWindowAllocation: { internal: "diagnostic" }
    });

    expect(text).toContain("**Exploration: user handler**");
    expect(text).toContain("Index: stale");
    expect(text).toContain("Found 1 ranked focus");
    expect(text).toContain("`src/users.ts#userById` → `src/db.ts#findUser` (calls)");
    expect(text).toContain("12\texport function userById() {");
    expect(text).not.toContain("queryPlan");
    expect(text).not.toContain("sourceIdentity");
    expect(text).not.toContain("sourceWindowAllocation");
  });

  it("renders an actionable missing-symbol response", () => {
    const text = renderExploreText({
      status: {
        initialized: true,
        stale: false,
        projectPath: "C:/project",
        generationId: "generation:test",
        counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 }
      },
      match: { status: "not_found", reference: "missing", candidates: [] },
      source: null,
      callers: [],
      callees: [],
      impact: []
    });

    expect(text).toContain("**Exploration: missing**");
    expect(text).toContain("No exact symbol found for `missing`.");
    expect(text.trim().startsWith("{")).toBe(false);
  });
});
