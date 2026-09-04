import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Language, Parser } from "web-tree-sitter";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";
import { inspectLuaTree } from "../../../src/extraction/lua-worker-ast.js";
import { LUA_GRAMMAR_SHA256, LUA_WORKER_RESPONSE_SCHEMA } from "../../../src/extraction/lua-worker-protocol.js";
import type { LuaWorkerFactory } from "../../../src/extraction/lua-worker-runtime.js";

const directories: string[] = [];
let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  const language = await Language.load(await readFile(new URL(
    "../../../src/assets/lua/tree-sitter-lua-v0.5.0.wasm",
    import.meta.url
  )));
  parser = new Parser();
  parser.setLanguage(language);
});

const workerFactory: LuaWorkerFactory = {
  async create() {
    return {
      async parse(input) {
        const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(input.sourceBytes);
        const parserSourceText = sourceText.replaceAll("\r\n", "\n");
        const tree = parser.parse(parserSourceText)!;
        const inspected = inspectLuaTree(tree.rootNode, input.sourceBytes, parserSourceText);
        tree.delete();
        return {
          schema: LUA_WORKER_RESPONSE_SCHEMA,
          requestId: input.requestId,
          fileSha256: input.fileSha256,
          grammarSha256: LUA_GRAMMAR_SHA256,
          decision: inspected.code === null ? { kind: "emit" } : { kind: "file-only", code: inspected.code },
          metrics: inspected.metrics,
          declarations: inspected.code === null ? inspected.declarations : [],
          calls: inspected.code === null ? inspected.calls : []
        };
      },
      async terminate() {}
    };
  }
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function graph(sourceText: string) {
  const projectPath = await mkdtemp(join(tmpdir(), "symbollattice-lua-v0504-"));
  directories.push(projectPath);
  await writeFile(join(projectPath, "main.lua"), sourceText, "utf8");
  const store = new SqliteGraphStore();
  const service = new SymbolLatticeService(store, new FileSystemSourceCatalog(), { luaWorkerFactory: workerFactory });
  await service.init({ projectPath });
  return store.getSnapshot(projectPath);
}

describe("Lua relations v0.504", () => {
  it("projects parser-proven calls to one earlier local function", async () => {
    const snapshot = await graph([
      "local function target(value)",
      "  return value",
      "end",
      "local function caller()",
      "  return target(1)",
      "end"
    ].join("\n"));
    expect(snapshot.edges.filter((edge) => edge.kind === "calls")).toEqual([
      expect.objectContaining({
        referenceName: "target",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "language.lua.call.direct-local-function.singleton-parser-proof"
        })
      })
    ]);
  });

  it("keeps shadow, rebind, dynamic load, debug, and nested callable cases unresolved", async () => {
    const cases = [
      "local function target() end\nlocal target = other\nlocal function caller() target() end",
      "local function target() end\ntarget = other\nlocal function caller() target() end",
      "local function target() end\nlocal function caller(target) target() end",
      "local function target() end\nlocal function caller() local target = other; target() end",
      "local function target() end\nlocal function caller() return function() target() end end",
      "local function target() end\nlocal function caller() load('target()')() end",
      "local function target() end\nlocal function caller() debug.setupvalue(caller, 1, other); target() end"
    ];
    for (const sourceText of cases) {
      expect((await graph(sourceText)).edges.filter((edge) => edge.kind === "calls")).toEqual([]);
    }
  });
});
