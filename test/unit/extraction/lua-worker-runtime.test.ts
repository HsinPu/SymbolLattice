import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  createLuaWorkerRuntime,
  LuaParserPackagingError,
  type LuaWorkerFactory
} from "../../../src/extraction/lua-worker-runtime.js";
import { LUA_GRAMMAR_SHA256 } from "../../../src/extraction/lua-worker-protocol.js";

const encoder = new TextEncoder();

function successfulResponse(requestId: string, sourceBytes: Uint8Array) {
  return {
    schema: "symbol-lattice-lua-worker-response-v2",
    requestId,
    fileSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    grammarSha256: LUA_GRAMMAR_SHA256,
    decision: { kind: "emit" },
    metrics: {
      sourceBytes: sourceBytes.byteLength,
      physicalLines: 1,
      functionCandidates: 0,
      namedFunctions: 0,
      maxDepth: 1
    },
    declarations: [],
    calls: []
  };
}

describe("Lua worker runtime fault boundary", () => {
  it("keeps absent bytes and invalid UTF-8 file-only without starting a worker", async () => {
    const factory: LuaWorkerFactory = { create: vi.fn() };
    const runtime = createLuaWorkerRuntime({ workerFactory: factory });

    await expect(runtime.parse({ filePath: "missing.lua" })).resolves.toMatchObject({
      decision: { kind: "file-only", code: "RAW_BYTES_MISSING" }
    });
    await expect(runtime.parse({ filePath: "invalid.lua", sourceBytes: new Uint8Array([0xff]) }))
      .resolves.toMatchObject({ decision: { kind: "file-only", code: "INVALID_UTF8" } });
    expect(factory.create).not.toHaveBeenCalled();
  });

  it("rejects lexical function and nesting limits before starting a worker", async () => {
    const factory: LuaWorkerFactory = { create: vi.fn() };
    const runtime = createLuaWorkerRuntime({ workerFactory: factory });
    const functions = Array.from({ length: 1_025 }, (_, index) =>
      `function f${index}() end`
    ).join("\n");
    const nestedDo = `${"do ".repeat(257)}${"end ".repeat(257)}`;
    const nestedParentheses = `return ${"(".repeat(257)}1${")".repeat(257)}`;
    const tooManyLines = "\n".repeat(16_384);
    const tooManyBytes = new Uint8Array(1_048_577).fill(0x20);

    await expect(runtime.parse({ filePath: "functions.lua", sourceBytes: encoder.encode(functions) }))
      .resolves.toMatchObject({ decision: { kind: "file-only", code: "FUNCTION_LIMIT" } });
    await expect(runtime.parse({ filePath: "blocks.lua", sourceBytes: encoder.encode(nestedDo) }))
      .resolves.toMatchObject({ decision: { kind: "file-only", code: "NESTING_LIMIT" } });
    await expect(runtime.parse({ filePath: "delimiters.lua", sourceBytes: encoder.encode(nestedParentheses) }))
      .resolves.toMatchObject({ decision: { kind: "file-only", code: "NESTING_LIMIT" } });
    await expect(runtime.parse({ filePath: "lines.lua", sourceBytes: encoder.encode(tooManyLines) }))
      .resolves.toMatchObject({ decision: { kind: "file-only", code: "LINE_LIMIT" } });
    await expect(runtime.parse({ filePath: "bytes.lua", sourceBytes: tooManyBytes }))
      .resolves.toMatchObject({ decision: { kind: "file-only", code: "SOURCE_LIMIT" } });
    expect(factory.create).not.toHaveBeenCalled();
  });

  it("admits exact resource limits and ignores keywords inside comments and strings", async () => {
    const create = vi.fn(async () => ({
      async parse(input: Parameters<Awaited<ReturnType<LuaWorkerFactory["create"]>>["parse"]>[0]) {
        return successfulResponse(input.requestId, input.sourceBytes);
      },
      async terminate() {}
    }));
    const runtime = createLuaWorkerRuntime({ workerFactory: { create } });
    const atFunctionLimit = Array.from({ length: 1_024 }, (_, index) =>
      `function f${index}() end`
    ).join("\n");
    const atBlockLimit = `${"do ".repeat(256)}${"end ".repeat(256)}`;
    const atDelimiterLimit = `return ${"(".repeat(256)}1${")".repeat(256)}`;
    const inertKeywords = `-- ${"function ".repeat(1_025)}\nlocal value = [=[${"do ".repeat(257)}]=]`;

    for (const [filePath, sourceText] of [
      ["functions.lua", atFunctionLimit],
      ["blocks.lua", atBlockLimit],
      ["delimiters.lua", atDelimiterLimit],
      ["lines.lua", "\n".repeat(16_383)],
      ["bytes.lua", " ".repeat(1_048_576)],
      ["inert.lua", inertKeywords]
    ] as const) {
      await expect(runtime.parse({ filePath, sourceBytes: encoder.encode(sourceText) }))
        .resolves.toMatchObject({ decision: { kind: "emit" } });
    }
    expect(create).toHaveBeenCalledTimes(6);
  });

  it.each([
    ["exports root", (value: Record<string, any>) => { value.exports = "./evil.js"; }],
    ["default target", (value: Record<string, any>) => { value.exports["."].import.default = "./evil.js"; }],
    ["import condition", (value: Record<string, any>) => { value.exports["."].import = "./web-tree-sitter.js"; }],
    ["require target", (value: Record<string, any>) => { value.exports["."].require.default = "./evil.cjs"; }],
    ["exports path", (value: Record<string, any>) => { value.exports["./web-tree-sitter.wasm"] = "./evil.wasm"; }],
    ["extra exports key", (value: Record<string, any>) => { value.exports["./evil"] = "./evil.js"; }]
  ])("aborts when runtime package %s drifts", async (_label, mutate) => {
    const runtimePackageRoot = new URL("../../../node_modules/web-tree-sitter/", import.meta.url);
    const packageJson = JSON.parse(readFileSync(new URL("package.json", runtimePackageRoot), "utf8"));
    mutate(packageJson);
    const create = vi.fn();
    const runtime = createLuaWorkerRuntime({
      workerFactory: { create },
      readRuntimePackageFile: (filename) => filename === "package.json"
        ? Buffer.from(`${JSON.stringify(packageJson, null, 2)}\n`)
        : readFileSync(new URL(filename, runtimePackageRoot))
    });

    await expect(runtime.parse({
      filePath: "package-entry.lua",
      sourceBytes: encoder.encode("return 1\n")
    })).rejects.toMatchObject({ name: "LuaParserPackagingError", code: "runtime-package" });
    expect(create).not.toHaveBeenCalled();
  });

  it("aborts on semantically inert runtime package raw-hash drift", async () => {
    const runtimePackageRoot = new URL("../../../node_modules/web-tree-sitter/", import.meta.url);
    const packageJsonBytes = readFileSync(new URL("package.json", runtimePackageRoot));
    const create = vi.fn();
    const runtime = createLuaWorkerRuntime({
      workerFactory: { create },
      readRuntimePackageFile: (filename) => filename === "package.json"
        ? Buffer.concat([packageJsonBytes, Buffer.from(" ")])
        : readFileSync(new URL(filename, runtimePackageRoot))
    });

    await expect(runtime.parse({
      filePath: "package-hash.lua",
      sourceBytes: encoder.encode("return 1\n")
    })).rejects.toMatchObject({ name: "LuaParserPackagingError", code: "runtime-package" });
    expect(create).not.toHaveBeenCalled();
  });

  it("aborts on package/initialization failure instead of degrading or falling back", async () => {
    const factory: LuaWorkerFactory = {
      async create() {
        throw new LuaParserPackagingError("worker-initialization", "simulated init failure");
      }
    };
    const runtime = createLuaWorkerRuntime({ workerFactory: factory });

    await expect(runtime.parse({ filePath: "healthy.lua", sourceBytes: encoder.encode("return 1\n") }))
      .rejects.toMatchObject({ name: "LuaParserPackagingError", code: "worker-initialization" });

    const genericFailureRuntime = createLuaWorkerRuntime({
      workerFactory: { async create() { throw new Error("worker constructor failed"); } }
    });
    await expect(genericFailureRuntime.parse({
      filePath: "constructor.lua",
      sourceBytes: encoder.encode("return 1\n")
    })).rejects.toMatchObject({
      name: "LuaParserPackagingError",
      code: "worker-initialization"
    });

    const luaAssetRoot = new URL("../../../src/assets/lua/", import.meta.url);
    const corruptProvenanceRuntime = createLuaWorkerRuntime({
      workerFactory: { create: vi.fn() },
      listLuaAssets: () => readdirSync(luaAssetRoot),
      readLuaAsset: (filename) => filename === "provenance.json"
        ? Buffer.from("{}\n")
        : readFileSync(new URL(filename, luaAssetRoot))
    });
    await expect(corruptProvenanceRuntime.parse({
      filePath: "provenance.lua",
      sourceBytes: encoder.encode("return 1\n")
    })).rejects.toMatchObject({ name: "LuaParserPackagingError", code: "asset-integrity" });

    const runtimePackageRoot = new URL("../../../node_modules/web-tree-sitter/", import.meta.url);
    const corruptPackageRuntime = createLuaWorkerRuntime({
      workerFactory: { create: vi.fn() },
      readRuntimePackageFile: (filename) => filename === "package.json"
        ? Buffer.from('{"name":"web-tree-sitter","version":"0.0.0","license":"MIT"}\n')
        : readFileSync(new URL(filename, runtimePackageRoot))
    });
    await expect(corruptPackageRuntime.parse({
      filePath: "package.lua",
      sourceBytes: encoder.encode("return 1\n")
    })).rejects.toMatchObject({ name: "LuaParserPackagingError", code: "runtime-package" });
  });

  it("discards parse faults and malformed responses, then creates a fresh worker", async () => {
    let createCalls = 0;
    const terminate = vi.fn(async () => undefined);
    const factory: LuaWorkerFactory = {
      async create() {
        createCalls += 1;
        const ordinal = createCalls;
        return {
          async parse(input) {
            if (ordinal === 1) throw new Error("simulated worker crash");
            if (ordinal === 2) return { ...successfulResponse(input.requestId, input.sourceBytes), extra: true };
            return successfulResponse(input.requestId, input.sourceBytes);
          },
          terminate
        };
      }
    };
    const runtime = createLuaWorkerRuntime({ workerFactory: factory });
    const sourceBytes = encoder.encode("return 1\n");

    await expect(runtime.parse({ filePath: "crash.lua", sourceBytes })).resolves.toMatchObject({
      decision: { kind: "file-only", code: "WORKER_CRASH" }, declarations: []
    });
    await expect(runtime.parse({ filePath: "malformed.lua", sourceBytes })).resolves.toMatchObject({
      decision: { kind: "file-only", code: "RESPONSE_INVALID" }, declarations: []
    });
    await expect(runtime.parse({ filePath: "healthy.lua", sourceBytes })).resolves.toMatchObject({
      decision: { kind: "emit" }
    });
    expect(createCalls).toBe(3);
    expect(terminate).toHaveBeenCalledTimes(3);
  });

  it("discards a successful response when worker termination fails", async () => {
    const sourceBytes = encoder.encode("return 1\n");
    const factory: LuaWorkerFactory = {
      async create() {
        return {
          async parse(input) {
            return successfulResponse(input.requestId, input.sourceBytes);
          },
          async terminate() {
            throw new Error("simulated termination failure");
          }
        };
      }
    };
    const runtime = createLuaWorkerRuntime({ workerFactory: factory });

    await expect(runtime.parse({ filePath: "termination.lua", sourceBytes })).resolves.toMatchObject({
      decision: { kind: "file-only", code: "WORKER_CRASH" },
      declarations: []
    });
  });
});
