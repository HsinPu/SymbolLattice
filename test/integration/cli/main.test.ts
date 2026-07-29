import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  type ContextOptions,
  type ContextResult,
  type ImpactOptions,
  type ImpactResult,
  type SearchOptions,
  type SearchResult,
  type SymbolLatticeService
} from "../../../src/application/index.js";
import { createProgram } from "../../../src/cli/main.js";

function resultStatus(): SearchResult["status"] {
  return {
    initialized: true,
    stale: false,
    staleReasons: [],
    projectPath: "C:/project",
    indexedAt: "2026-07-29T00:00:00.000Z",
    generationId: "generation:test",
    counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 }
  };
}

function searchResult(): SearchResult {
  return {
    status: resultStatus(),
    results: []
  };
}

function contextResult(): ContextResult {
  return {
    status: resultStatus(),
    bounds: {
      maxReferences: 8,
      matchCandidateLimit: 25,
      relationLimit: 8,
      maxHops: 4,
      maxVisitedSymbolsPerPath: 500,
      impactDepth: 2,
      impactLimit: 8
    },
    contexts: [],
    evidencePaths: []
  };
}

function impactResult(): ImpactResult {
  return {
    status: resultStatus(),
    symbol: {
      id: "symbol:target",
      name: "target",
      qualifiedName: "src/target.ts#target",
      kind: "function",
      filePath: "src/target.ts",
      range: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 32 }
      },
      isExported: true,
      declarationOrdinal: 0
    },
    paths: []
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

describe("symbol-lattice v0.5 context and impact CLI", () => {
  it("forwards bounded context options, references, project selection, and JSON output", async () => {
    const calls: Array<{
      projectPath: string;
      references: readonly string[];
      options: ContextOptions;
    }> = [];
    const result = contextResult();
    const service = {
      async context(
        projectPath: string,
        references: readonly string[],
        options: ContextOptions = {}
      ): Promise<ContextResult> {
        calls.push({ projectPath, references, options });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "context",
        "src/consumer.ts#calculate",
        "src/math.ts#add",
        "--project",
        "C:/chosen-project",
        "--relation-limit",
        "7",
        "--max-hops",
        "5",
        "--impact-depth",
        "3",
        "--impact-limit",
        "12",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/chosen-project"),
        references: ["src/consumer.ts#calculate", "src/math.ts#add"],
        options: {
          relationLimit: 7,
          maxHops: 5,
          impactDepth: 3,
          impactLimit: 12
        }
      }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  for (const rangeCase of [
    ["--relation-limit", "26", "Expected an integer between 1 and 25"],
    ["--max-hops", "7", "Expected an integer between 1 and 6"],
    ["--impact-depth", "4", "Expected an integer between 1 and 3"],
    ["--impact-limit", "26", "Expected an integer between 1 and 25"]
  ] as const) {
    it(`rejects ${rangeCase[0]} outside its bounded context range`, async () => {
      const service = {
        async context(): Promise<ContextResult> {
          return contextResult();
        }
      } as unknown as SymbolLatticeService;
      const program = createProgram(service);
      program.exitOverride();

      await expect(
        program.parseAsync(
          ["node", "symbol-lattice", "context", "src/example.ts#one", rangeCase[0], rangeCase[1]],
          { from: "node" }
        )
      ).rejects.toThrow(rangeCase[2]);
    });
  }

  it("forwards an explicit impact limit through the options overload", async () => {
    const calls: Array<{ projectPath: string; reference: string; options: ImpactOptions }> = [];
    const result = impactResult();
    const service = {
      async impact(
        projectPath: string,
        reference: string,
        options: ImpactOptions
      ): Promise<ImpactResult> {
        calls.push({ projectPath, reference, options });
        return result;
      }
    } as unknown as SymbolLatticeService;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      [
        "node",
        "symbol-lattice",
        "impact",
        "src/math.ts#add",
        "--project",
        "C:/chosen-project",
        "--depth",
        "2",
        "--limit",
        "9",
        "--json"
      ],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve("C:/chosen-project"),
        reference: "src/math.ts#add",
        options: { maxDepth: 2, limit: 9 }
      }
    ]);
    expect(write).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("uses the impact options overload without a limit property when none was requested", async () => {
    const calls: Array<{ projectPath: string; reference: string; options: ImpactOptions }> = [];
    const service = {
      async impact(
        projectPath: string,
        reference: string,
        options: ImpactOptions
      ): Promise<ImpactResult> {
        calls.push({ projectPath, reference, options });
        return impactResult();
      }
    } as unknown as SymbolLatticeService;
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await createProgram(service).parseAsync(
      ["node", "symbol-lattice", "impact", "src/math.ts#add", "--depth", "2"],
      { from: "node" }
    );

    expect(calls).toEqual([
      {
        projectPath: resolve(process.cwd()),
        reference: "src/math.ts#add",
        options: { maxDepth: 2 }
      }
    ]);
  });

  it("rejects impact limits above the bounded public range", async () => {
    const service = {
      async impact(): Promise<ImpactResult> {
        return impactResult();
      }
    } as unknown as SymbolLatticeService;
    const program = createProgram(service);
    program.exitOverride();

    await expect(
      program.parseAsync(
        ["node", "symbol-lattice", "impact", "src/math.ts#add", "--limit", "101"],
        { from: "node" }
      )
    ).rejects.toThrow("Expected an integer between 1 and 100");
  });
});
