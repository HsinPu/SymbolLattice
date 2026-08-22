import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { pathToFileURL } from "node:url";

import {
  LUA_GRAMMAR_SHA256,
  LUA_WORKER_RESPONSE_SCHEMA,
  LuaWorkerResponseError,
  validateLuaWorkerResponse,
  type LuaFileFailureCode,
  type LuaWorkerMetrics,
  type LuaWorkerResponse
} from "./lua-worker-protocol.js";

export const LUA_GRAMMAR_ASSET_FILENAME = "tree-sitter-lua-v0.5.0.wasm" as const;
export const LUA_GRAMMAR_BYTE_LENGTH = 53_176 as const;
export const LUA_RUNTIME_WASM_SHA256 =
  "ba5c7a539603f251f380e4d6ce26ee954ffca7bda8b2e13744dc4c87d6ce6041" as const;
export const LUA_RUNTIME_WASM_BYTE_LENGTH = 201_104 as const;

export type LuaParserPackagingErrorCode =
  | "asset-missing"
  | "asset-read"
  | "asset-integrity"
  | "runtime-package"
  | "worker-initialization";

export class LuaParserPackagingError extends Error {
  public override readonly name = "LuaParserPackagingError";

  public constructor(
    public readonly code: LuaParserPackagingErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

export interface LuaWorkerAssets {
  readonly runtimeWasmBytes: Uint8Array;
  readonly grammarWasmBytes: Uint8Array;
  readonly grammarSha256: typeof LUA_GRAMMAR_SHA256;
}

export interface LuaWorkerParseInput {
  readonly requestId: string;
  readonly filePath: string;
  readonly sourceBytes: Uint8Array;
  readonly fileSha256: string;
}

export interface LuaWorkerClient {
  parse(input: LuaWorkerParseInput): Promise<unknown>;
  terminate(): Promise<void>;
}

export interface LuaWorkerFactory {
  create(assets: LuaWorkerAssets): Promise<LuaWorkerClient>;
}

export interface LuaWorkerRuntime {
  parse(input: { readonly filePath: string; readonly sourceBytes?: Uint8Array }): Promise<LuaWorkerResponse>;
}

export interface LuaWorkerRuntimeOptions {
  readonly workerFactory?: LuaWorkerFactory;
  readonly readRuntimeAsset?: () => Uint8Array;
  readonly readGrammarAsset?: () => Uint8Array;
  readonly listLuaAssets?: () => readonly string[];
  readonly readLuaAsset?: (filename: string) => Uint8Array;
  readonly readRuntimePackageFile?: (filename: string) => Uint8Array;
}

const LUA_ASSET_SPECS = Object.freeze({
  "THIRD_PARTY_NOTICES.md": [754, "ca44d053260ee861a2853700aa28122e31b2df06d025b1d43f2cb31d6dc17363"],
  "asset-manifest.json": [1_234, "29cf0d0c82cdc532da04d3ea0ce1d5a385cc71820d75d194b4d4576842ffd9d0"],
  "provenance.json": [2_426, "b01bdefa7c519fd7da00c90d1dfa6a33dd2513e8d3293f155d26303b48889993"],
  "sbom.cdx.json": [2_085, "410d5e42efbb9192f54a732263d6bfc36492645ccc31d738d07f8fffe6731cad"],
  "tree-sitter-lua-MIT.txt": [1_079, "9a32b02e4c917b1ce6b5e79d8ea81e25cefd7f27d89c7235f2afb262c06cf32e"],
  "tree-sitter-lua-v0.5.0.wasm": [LUA_GRAMMAR_BYTE_LENGTH, LUA_GRAMMAR_SHA256],
  "web-tree-sitter-MIT.txt": [1_080, "c5cfb43042b6b72045f4ba997834d0a7786d2793d91680868b5815b39f14fc78"]
} as const);
const LUA_ASSET_FILENAMES = Object.freeze(Object.keys(LUA_ASSET_SPECS).sort(compareText));
const LUA_RUNTIME_ESM_SHA256 =
  "0c868236a47296b4ff3c1570f20e0899e4a784ff6e5cd7bfc9c3a55225463e4a" as const;
const LUA_RUNTIME_CJS_SHA256 =
  "84321506f6d6f5b1292dd449af6dfe3a0c2e97b4e5247c2da6971ab2c6ab9979" as const;
const LUA_RUNTIME_LICENSE_SHA256 =
  "c5cfb43042b6b72045f4ba997834d0a7786d2793d91680868b5815b39f14fc78" as const;
const LUA_RUNTIME_PACKAGE_JSON_SHA256 =
  "bdd6cb2a70ab98609839d73b72b64a5b59087d1edf13bafd7b94d05eb02c4c5a" as const;

class NodeLuaWorkerFactory implements LuaWorkerFactory {
  public async create(assets: LuaWorkerAssets): Promise<LuaWorkerClient> {
    const runtime = transferableCopy(assets.runtimeWasmBytes);
    const grammar = transferableCopy(assets.grammarWasmBytes);
    const worker = new Worker(new URL("./lua-worker.js", import.meta.url), {
      workerData: {
        schema: "symbol-lattice-lua-worker-init-v1",
        runtimeWasmBytes: runtime.buffer,
        grammarWasmBytes: grammar.buffer,
        grammarSha256: assets.grammarSha256
      },
      transferList: [runtime.buffer, grammar.buffer],
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 16,
        codeRangeSizeMb: 16,
        stackSizeMb: 4
      }
    });

    await waitForInitialization(worker);
    return {
      parse: (input) => parseWithWorker(worker, input),
      async terminate() {
        await worker.terminate();
      }
    };
  }
}

export function createLuaWorkerRuntime(options: LuaWorkerRuntimeOptions = {}): LuaWorkerRuntime {
  const workerFactory = options.workerFactory ?? new NodeLuaWorkerFactory();
  let cachedAssets: LuaWorkerAssets | undefined;
  let requestOrdinal = 0;

  function assets(): LuaWorkerAssets {
    if (cachedAssets !== undefined) return cachedAssets;
    const luaAssets = verifyLuaAssetClosure(options);
    const runtimePackage = verifyRuntimePackageClosure(options);
    const runtimeWasmBytes = requiredAsset(
      "web-tree-sitter runtime WASM",
      options.readRuntimeAsset ?? (() => runtimePackage.runtimeWasmBytes),
      LUA_RUNTIME_WASM_BYTE_LENGTH,
      LUA_RUNTIME_WASM_SHA256,
      "runtime-package"
    );
    const grammarWasmBytes = requiredAsset(
      "tree-sitter-lua grammar WASM",
      options.readGrammarAsset ?? (() => luaAssets.get(LUA_GRAMMAR_ASSET_FILENAME)!),
      LUA_GRAMMAR_BYTE_LENGTH,
      LUA_GRAMMAR_SHA256,
      "asset-missing"
    );
    cachedAssets = { runtimeWasmBytes, grammarWasmBytes, grammarSha256: LUA_GRAMMAR_SHA256 };
    return cachedAssets;
  }

  return {
    async parse(input) {
      const preflight = preflightSource(input.sourceBytes);
      const sourceBytes = input.sourceBytes ?? new Uint8Array();
      const fileSha256 = digest(sourceBytes);
      const requestId = `${fileSha256}:${requestOrdinal++}`;
      if (preflight !== null) {
        return fileOnlyResponse(requestId, fileSha256, sourceBytes, preflight);
      }

      let worker: LuaWorkerClient;
      try {
        worker = await workerFactory.create(assets());
      } catch (error) {
        if (error instanceof LuaParserPackagingError) throw error;
        throw new LuaParserPackagingError(
          "worker-initialization",
          "Lua worker could not be initialized.",
          { cause: error }
        );
      }
      let result: LuaWorkerResponse;
      try {
        const raw = await worker.parse({
          requestId,
          filePath: input.filePath,
          sourceBytes,
          fileSha256
        });
        result = validateLuaWorkerResponse(raw, { requestId, fileSha256, sourceBytes });
      } catch (error) {
        const code: LuaFileFailureCode =
          error instanceof LuaWorkerResponseError
            ? "RESPONSE_INVALID"
            : workerFailureCode(error);
        result = fileOnlyResponse(requestId, fileSha256, sourceBytes, code);
      }
      try {
        await worker.terminate();
      } catch {
        return fileOnlyResponse(requestId, fileSha256, sourceBytes, "WORKER_CRASH");
      }
      return result;
    }
  };
}

function verifyLuaAssetClosure(options: LuaWorkerRuntimeOptions): ReadonlyMap<string, Uint8Array> {
  const root = new URL("../assets/lua/", import.meta.url);
  const list = options.listLuaAssets ?? (() => readdirSync(root));
  const read = options.readLuaAsset ?? ((filename: string) => readFileSync(new URL(filename, root)));
  let actualFiles: readonly string[];
  try {
    actualFiles = [...list()].sort(compareText);
  } catch (error) {
    throw new LuaParserPackagingError("asset-read", "Unable to list required Lua parser assets.", {
      cause: error
    });
  }
  if (JSON.stringify(actualFiles) !== JSON.stringify(LUA_ASSET_FILENAMES)) {
    throw new LuaParserPackagingError(
      "asset-integrity",
      `Lua parser asset file set mismatch: expected ${LUA_ASSET_FILENAMES.join(", ")}; received ${actualFiles.join(", ")}.`
    );
  }
  const result = new Map<string, Uint8Array>();
  for (const filename of LUA_ASSET_FILENAMES) {
    const [bytes, sha256] = LUA_ASSET_SPECS[filename as keyof typeof LUA_ASSET_SPECS];
    result.set(filename, requiredAsset(`Lua parser asset ${filename}`, () => read(filename), bytes, sha256, "asset-missing"));
  }
  return result;
}

function verifyRuntimePackageClosure(options: LuaWorkerRuntimeOptions): {
  readonly runtimeWasmBytes: Uint8Array;
} {
  const runtimeWasmUrl = new URL(import.meta.resolve("web-tree-sitter/web-tree-sitter.wasm"));
  const root = new URL("./", runtimeWasmUrl);
  const expectedEsmUrl = new URL("web-tree-sitter.js", root);
  const expectedCjsUrl = new URL("web-tree-sitter.cjs", root);
  const resolvedEsmUrl = new URL(import.meta.resolve("web-tree-sitter"));
  const require = createRequire(import.meta.url);
  const resolvedCjsUrl = pathToFileURL(require.resolve("web-tree-sitter"));
  const resolvedCjsWasmUrl = pathToFileURL(
    require.resolve("web-tree-sitter/web-tree-sitter.wasm")
  );
  if (
    resolvedEsmUrl.href !== expectedEsmUrl.href ||
    resolvedCjsUrl.href !== expectedCjsUrl.href ||
    resolvedCjsWasmUrl.href !== runtimeWasmUrl.href
  ) {
    throw new LuaParserPackagingError(
      "runtime-package",
      "web-tree-sitter package entrypoints do not resolve to the exact hashed ESM, CJS, and WASM files."
    );
  }
  const read = options.readRuntimePackageFile ?? ((filename: string) =>
    readFileSync(new URL(filename, root)));
  const runtimeWasmBytes = requiredAsset(
    "web-tree-sitter runtime WASM",
    () => read("web-tree-sitter.wasm"),
    LUA_RUNTIME_WASM_BYTE_LENGTH,
    LUA_RUNTIME_WASM_SHA256,
    "runtime-package"
  );
  requiredHashedAsset(
    "web-tree-sitter ESM bundle",
    () => read("web-tree-sitter.js"),
    LUA_RUNTIME_ESM_SHA256,
    "runtime-package"
  );
  requiredHashedAsset(
    "web-tree-sitter CJS bundle",
    () => read("web-tree-sitter.cjs"),
    LUA_RUNTIME_CJS_SHA256,
    "runtime-package"
  );
  requiredHashedAsset(
    "web-tree-sitter license",
    () => read("LICENSE"),
    LUA_RUNTIME_LICENSE_SHA256,
    "runtime-package"
  );
  const packageJsonBytes = requiredHashedAsset(
    "web-tree-sitter package.json",
    () => read("package.json"),
    LUA_RUNTIME_PACKAGE_JSON_SHA256,
    "runtime-package"
  );
  let packageJson: unknown;
  try {
    packageJson = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(packageJsonBytes));
  } catch (error) {
    throw new LuaParserPackagingError("runtime-package", "Unable to read web-tree-sitter package identity.", {
      cause: error
    });
  }
  if (
    !isRecord(packageJson) ||
    packageJson.name !== "web-tree-sitter" ||
    packageJson.version !== "0.26.12" ||
    packageJson.license !== "MIT"
  ) {
    throw new LuaParserPackagingError(
      "runtime-package",
      "web-tree-sitter package identity does not match the exact runtime contract."
    );
  }
  return { runtimeWasmBytes };
}

function requiredHashedAsset(
  label: string,
  read: () => Uint8Array,
  expectedSha256: string,
  code: LuaParserPackagingErrorCode
): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = read();
  } catch (error) {
    throw new LuaParserPackagingError(code, `Unable to read required ${label}.`, { cause: error });
  }
  const sha256 = digest(bytes);
  if (sha256 !== expectedSha256) {
    throw new LuaParserPackagingError(
      code,
      `${label} integrity mismatch: expected ${expectedSha256}, received ${sha256}.`
    );
  }
  return new Uint8Array(bytes);
}

function requiredAsset(
  label: string,
  read: () => Uint8Array,
  expectedBytes: number,
  expectedSha256: string,
  missingCode: LuaParserPackagingErrorCode
): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = read();
  } catch (error) {
    const code = isNodeError(error) && error.code === "ENOENT" ? missingCode : "asset-read";
    throw new LuaParserPackagingError(code, `Unable to read required ${label}.`, { cause: error });
  }
  const sha256 = digest(bytes);
  if (bytes.byteLength !== expectedBytes || sha256 !== expectedSha256) {
    throw new LuaParserPackagingError(
      "asset-integrity",
      `${label} integrity mismatch: expected ${expectedSha256}/${expectedBytes}, received ${sha256}/${bytes.byteLength}.`
    );
  }
  return new Uint8Array(bytes);
}

function preflightSource(sourceBytes: Uint8Array | undefined): LuaFileFailureCode | null {
  if (sourceBytes === undefined) return "RAW_BYTES_MISSING";
  if (!(sourceBytes instanceof Uint8Array)) return "RESPONSE_INVALID";
  if (sourceBytes.byteLength > 65_536) return "SOURCE_LIMIT";
  let sourceText: string;
  try {
    sourceText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
  } catch {
    return "INVALID_UTF8";
  }
  if (!byteEqual(new TextEncoder().encode(sourceText), sourceBytes)) return "INVALID_UTF8";
  if (sourceBytes.includes(0)) return "NUL";
  if (physicalLines(sourceBytes) > 4_096) return "LINE_LIMIT";
  const lexicalBounds = luaLexicalBounds(sourceText);
  if (lexicalBounds.functionCandidates > 512) return "FUNCTION_LIMIT";
  if (lexicalBounds.maxDepth > 128) return "NESTING_LIMIT";
  return null;
}

function luaLexicalBounds(sourceText: string): {
  readonly functionCandidates: number;
  readonly maxDepth: number;
} {
  let functionCandidates = 0;
  let depth = 0;
  let maxDepth = 0;
  let index = 0;
  const open = () => {
    depth += 1;
    maxDepth = Math.max(maxDepth, depth);
  };
  const close = () => {
    depth = Math.max(0, depth - 1);
  };

  while (index < sourceText.length) {
    const character = sourceText[index];
    if (character === "-" && sourceText[index + 1] === "-") {
      const longComment = longBracketAt(sourceText, index + 2);
      if (longComment !== null) {
        index = skipLongBracket(sourceText, longComment);
      } else {
        const carriageReturn = sourceText.indexOf("\r", index + 2);
        const lineFeed = sourceText.indexOf("\n", index + 2);
        const newline = carriageReturn < 0
          ? lineFeed
          : lineFeed < 0
            ? carriageReturn
            : Math.min(carriageReturn, lineFeed);
        index = newline < 0
          ? sourceText.length
          : newline + (sourceText[newline] === "\r" && sourceText[newline + 1] === "\n" ? 2 : 1);
      }
      continue;
    }
    if (character === "\"" || character === "'") {
      index = skipQuotedString(sourceText, index, character);
      continue;
    }
    if (character === "[") {
      const longString = longBracketAt(sourceText, index);
      if (longString !== null) {
        index = skipLongBracket(sourceText, longString);
      } else {
        open();
        index += 1;
      }
      continue;
    }
    if (character === "(" || character === "{") {
      open();
      index += 1;
      continue;
    }
    if (character === ")" || character === "}" || character === "]") {
      close();
      index += 1;
      continue;
    }
    if (character !== undefined && /[A-Za-z_]/u.test(character)) {
      let end = index + 1;
      while (end < sourceText.length && /[A-Za-z0-9_]/u.test(sourceText[end] ?? "")) end += 1;
      const token = sourceText.slice(index, end);
      if (token === "function") {
        functionCandidates += 1;
        open();
      } else if (token === "do" || token === "then" || token === "repeat") {
        open();
      } else if (token === "elseif") {
        close();
      } else if (token === "end" || token === "until") {
        close();
      }
      index = end;
      continue;
    }
    index += 1;
  }
  return { functionCandidates, maxDepth };
}

interface LongBracket {
  readonly contentStart: number;
  readonly equals: string;
}

function longBracketAt(sourceText: string, index: number): LongBracket | null {
  if (sourceText[index] !== "[") return null;
  let cursor = index + 1;
  while (sourceText[cursor] === "=") cursor += 1;
  if (sourceText[cursor] !== "[") return null;
  return { contentStart: cursor + 1, equals: sourceText.slice(index + 1, cursor) };
}

function skipLongBracket(sourceText: string, bracket: LongBracket): number {
  const close = `]${bracket.equals}]`;
  const end = sourceText.indexOf(close, bracket.contentStart);
  return end < 0 ? sourceText.length : end + close.length;
}

function skipQuotedString(sourceText: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < sourceText.length) {
    const character = sourceText[index];
    if (character === "\\") {
      index += 2;
    } else if (character === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return sourceText.length;
}

function fileOnlyResponse(
  requestId: string,
  fileSha256: string,
  sourceBytes: Uint8Array,
  code: LuaFileFailureCode
): LuaWorkerResponse {
  return {
    schema: LUA_WORKER_RESPONSE_SCHEMA,
    requestId,
    fileSha256,
    grammarSha256: LUA_GRAMMAR_SHA256,
    decision: { kind: "file-only", code },
    metrics: emptyMetrics(sourceBytes),
    declarations: []
  };
}

function emptyMetrics(sourceBytes: Uint8Array): LuaWorkerMetrics {
  return {
    sourceBytes: sourceBytes.byteLength,
    physicalLines: Math.min(4_096, physicalLines(sourceBytes)),
    functionCandidates: 0,
    namedFunctions: 0,
    maxDepth: 0
  };
}

function workerFailureCode(error: unknown): LuaFileFailureCode {
  return isRecord(error) && error.code === "TIMEOUT" ? "TIMEOUT" : "WORKER_CRASH";
}

function waitForInitialization(worker: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new LuaParserPackagingError("worker-initialization", "Lua worker initialization timed out."));
    }, 5_000);
    const cleanup = () => {
      clearTimeout(timeout);
      worker.off("message", onMessage);
      worker.off("error", onError);
      worker.off("exit", onExit);
    };
    const fail = (message: string, cause?: unknown) => {
      cleanup();
      void worker.terminate();
      reject(new LuaParserPackagingError("worker-initialization", message, { cause }));
    };
    const onMessage = (message: unknown) => {
      if (isRecord(message) && message.kind === "ready") {
        cleanup();
        resolve();
      } else {
        fail("Lua worker returned an invalid initialization response.");
      }
    };
    const onError = (error: Error) => fail("Lua worker initialization failed.", error);
    const onExit = (code: number) => fail(`Lua worker exited during initialization with code ${code}.`);
    worker.once("message", onMessage);
    worker.once("error", onError);
    worker.once("exit", onExit);
  });
}

function parseWithWorker(worker: Worker, input: LuaWorkerParseInput): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(Object.assign(new Error("Lua worker parse timed out."), { code: "TIMEOUT" }));
    }, 1_000);
    const cleanup = () => {
      clearTimeout(timeout);
      worker.off("message", onMessage);
      worker.off("error", onError);
      worker.off("exit", onExit);
    };
    const onMessage = (message: unknown) => { cleanup(); resolve(message); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onExit = (code: number) => {
      cleanup();
      reject(new Error(`Lua worker exited during parse with code ${code}.`));
    };
    worker.once("message", onMessage);
    worker.once("error", onError);
    worker.once("exit", onExit);
    const transferred = transferableCopy(input.sourceBytes);
    worker.postMessage({ ...input, sourceBytes: transferred.buffer }, [transferred.buffer]);
  });
}

function transferableCopy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

function physicalLines(bytes: Uint8Array): number {
  if (bytes.byteLength === 0) return 0;
  let lines = 1;
  for (let index = 0; index < bytes.byteLength; index += 1) {
    const byte = bytes[index];
    if (byte === 0x0d) {
      lines += 1;
      if (bytes[index + 1] === 0x0a) index += 1;
    } else if (byte === 0x0a) {
      lines += 1;
    }
  }
  return lines;
}

function byteEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
