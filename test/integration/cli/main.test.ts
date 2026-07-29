import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  type SearchOptions,
  type SearchResult,
  type SymbolLatticeService
} from "../../../src/application/index.js";
import { createProgram } from "../../../src/cli/main.js";

function searchResult(): SearchResult {
  return {
    status: {
      initialized: true,
      stale: false,
      staleReasons: [],
      projectPath: "C:/project",
      indexedAt: "2026-07-29T00:00:00.000Z",
      generationId: "generation:test",
      counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 }
    },
    results: []
  };
}

describe("symbol-lattice search CLI", () => {
  it("forwards bounded source-search filters and renders the stable JSON result", async () => {
    const calls: Array<{ projectPath: string; query: string; options: SearchOptions }> = [];
    const result = searchResult();
    const service = {
      async search(
        projectPath: string,
        query: string,
        options: SearchOptions = {}
      ): Promise<SearchResult> {
        calls.push({ projectPath, query, options });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "search",
        "  User Token  ",
        "--project",
        "C:/chosen-project",
        "--limit",
        "7",
        "--path",
        " src/ ",
        "--language",
        "typescript",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/chosen-project"),
        query: "User Token",
        options: { limit: 7, pathPrefix: "src/", language: "typescript" }
      }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("rejects search limits above the persisted retrieval bound", async () => {
    const service = { async search(): Promise<SearchResult> { return searchResult(); } } as unknown as SymbolLatticeService;
    const program = createProgram(service);
    program.exitOverride();

    await expect(
      program.parseAsync(
        ["node", "symbol-lattice", "search", "user", "--limit", "101"],
        { from: "node" }
      )
    ).rejects.toThrow("Expected an integer between 1 and 100");
  });
});
