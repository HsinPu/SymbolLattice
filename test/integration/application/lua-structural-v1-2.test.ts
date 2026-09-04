import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { LUA_GRAMMAR_SHA256 } from "../../../src/extraction/lua-worker-protocol.js";
import {
  LuaParserPackagingError,
  type LuaWorkerFactory
} from "../../../src/extraction/lua-worker-runtime.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";
import type { ProjectScanOptions, SourceCatalog } from "../../../src/ports/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-lua-structural-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(Object.entries(files).map(async ([relativePath, sourceText]) => {
    const absolutePath = resolve(projectPath, ...relativePath.split("/"));
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, sourceText, "utf8");
  }));
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("Lua structural v1.2 application composition", () => {
  it("uses one injected catalog scan and a fresh worker after a file-only fault", async () => {
    const projectPath = await createProject({
      "a-crash.lua": "function crashed()\nend\n",
      "b-missing.lua": "function missing()\nend\n",
      "c-next.lua": "function pkg.next()\nend\n",
      "frozen.luau": "local function frozen()\nend\n"
    });
    const catalog = sourceCatalogWithoutRawBytesFor("b-missing.lua");
    let workersCreated = 0;
    const terminate = vi.fn(async () => undefined);
    const workerFactory: LuaWorkerFactory = {
      async create() {
        workersCreated += 1;
        const workerOrdinal = workersCreated;
        return {
          async parse(input) {
            if (workerOrdinal === 1) throw new Error("simulated worker crash");
            const sourceText = new TextDecoder().decode(input.sourceBytes);
            const name = "pkg.next";
            const nameStartByte = new TextEncoder().encode(sourceText.slice(0, sourceText.indexOf(name))).byteLength;
            return {
              schema: "symbol-lattice-lua-worker-response-v2",
              requestId: input.requestId,
              fileSha256: input.fileSha256,
              grammarSha256: LUA_GRAMMAR_SHA256,
              decision: { kind: "emit" },
              metrics: {
                sourceBytes: input.sourceBytes.byteLength,
                physicalLines: 2,
                functionCandidates: 1,
                namedFunctions: 1,
                maxDepth: 2
              },
              declarations: [{
                name,
                form: "dotted-function",
                declarationStartByte: 0,
                declarationEndByte: input.sourceBytes.byteLength - 1,
                nameStartByte,
                nameEndByte: nameStartByte + name.length,
                bodyStartByte: 0,
                bodyEndByte: input.sourceBytes.byteLength - 1
              }],
              calls: []
            };
          },
          terminate
        };
      }
    };
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, catalog, { luaWorkerFactory: workerFactory });

    await service.index({ projectPath });

    expect(catalog.scan).toHaveBeenCalled();
    expect(workersCreated).toBe(2);
    expect(terminate).toHaveBeenCalledTimes(2);
    const snapshot = store.getSnapshot(projectPath);
    expect(snapshot.symbols.filter((symbol) => symbol.filePath === "a-crash.lua"))
      .toHaveLength(1);
    expect(snapshot.symbols.filter((symbol) => symbol.filePath === "b-missing.lua"))
      .toHaveLength(1);
    expect(snapshot.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ filePath: "c-next.lua", name: "next", qualifiedName: "c-next.lua#pkg.next", kind: "method" }),
      expect.objectContaining({ filePath: "frozen.luau", name: "frozen", kind: "function" })
    ]));
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filePath: "c-next.lua",
        kind: "contains",
        evidence: expect.objectContaining({
          ruleId: "language.lua.function.direct-root.tree-sitter-lua-v0.5"
        })
      })
    ]));
  });

  it("aborts generation when worker initialization fails", async () => {
    const projectPath = await createProject({ "broken.lua": "function broken()\nend\n" });
    const store = new SqliteGraphStore();
    const workerFactory: LuaWorkerFactory = {
      async create() {
        throw new LuaParserPackagingError("worker-initialization", "simulated init failure");
      }
    };
    const service = new SymbolLatticeService(
      store,
      new FileSystemSourceCatalog(),
      { luaWorkerFactory: workerFactory }
    );

    await expect(service.index({ projectPath })).rejects.toMatchObject({
      name: "LuaParserPackagingError",
      code: "worker-initialization"
    });
    expect(store.isInitialized(projectPath)).toBe(false);
  });
});

function sourceCatalogWithoutRawBytesFor(relativePath: string): SourceCatalog & {
  readonly scan: ReturnType<typeof vi.fn<SourceCatalog["scan"]>>;
} {
  const delegate = new FileSystemSourceCatalog();
  const scan = vi.fn(async (projectPath: string, options?: ProjectScanOptions) => {
    const result = await delegate.scan(projectPath, options);
    return {
      ...result,
      sourceDocuments: result.sourceDocuments.map((document) => {
        if (document.relativePath !== relativePath) return document;
        const { sourceBytes: _sourceBytes, ...withoutSourceBytes } = document;
        return withoutSourceBytes;
      })
    };
  });
  return {
    scan,
    verifyFreshness: (projectPath, input) => delegate.verifyFreshness(projectPath, input),
    read: (projectPath, filePath) => delegate.read(projectPath, filePath),
    isUnsafeProjectPath: (projectPath) => delegate.isUnsafeProjectPath(projectPath)
  };
}
