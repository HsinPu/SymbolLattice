import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const SHELL_WASM_ASSET_FILENAME = "mvdan-sh-v3.13.1-tinygo-v0.41.1.wasm" as const;
export const SHELL_WASM_SHA256 =
  "e2133afeda7a69abd8af28d64138f5f7fff7dc42e836b382e80b0ffb9cadcf45" as const;
export const SHELL_WASM_BYTE_LENGTH = 319_617 as const;
export const SHELL_WASM_ABI_VERSION = 1 as const;

export type ShellDialect = "posix" | "bash";
export type ShellFunctionForm = "posix-parens" | "bash-function" | "bash-function-parens";
export type ShellParserErrorCode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface ShellParserFunction {
  readonly name: string;
  readonly form: ShellFunctionForm;
  readonly declStart: number;
  readonly declEnd: number;
  readonly nameStart: number;
  readonly nameEnd: number;
}

export type ShellParserResult =
  | { readonly ok: true; readonly functions: readonly ShellParserFunction[] }
  | { readonly ok: false; readonly code: ShellParserErrorCode };

export type ShellParser = (
  source: string | Uint8Array,
  dialect: ShellDialect
) => ShellParserResult;

export type ShellParserPackagingErrorCode =
  | "asset-missing"
  | "asset-read"
  | "asset-integrity"
  | "wasm-compile"
  | "wasm-imports"
  | "wasm-instantiate"
  | "abi-invalid"
  | "abi-mismatch"
  | "runtime-trap"
  | "response-invalid";

/** A deployment/runtime fault that must abort graph generation, never degrade to file-only. */
export class ShellParserPackagingError extends Error {
  public override readonly name = "ShellParserPackagingError";

  public constructor(
    public readonly code: ShellParserPackagingErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

export interface ShellWasmRuntime {
  readonly parse: ShellParser;
}

export interface ShellWasmCompiledModule {
  readonly __shellWasmCompiledModuleBrand?: never;
}

export interface ShellWasmModuleImportDescriptor {
  readonly module: string;
  readonly name: string;
  readonly kind: string;
}

export interface ShellWasmMemory {
  readonly buffer: ArrayBuffer;
}

export interface ShellWasmInstance {
  readonly exports: Readonly<Record<string, unknown>>;
}

export interface ShellWasmRuntimeOptions {
  readonly readAsset?: (assetUrl: URL) => Uint8Array;
  readonly compileModule?: (bytes: Uint8Array) => ShellWasmCompiledModule;
  readonly moduleImports?: (module: ShellWasmCompiledModule) => readonly ShellWasmModuleImportDescriptor[];
  readonly instantiateModule?: (module: ShellWasmCompiledModule) => ShellWasmInstance;
}

interface ShellWasmExports {
  readonly memory: ShellWasmMemory;
  readonly _initialize: () => void;
  readonly abiVersion: () => number;
  readonly wasmAlloc: (size: number) => number;
  readonly process: (size: number, dialect: number) => number;
  readonly resultSize: () => number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const wasmApi = (globalThis as unknown as {
  readonly WebAssembly: {
    readonly Module: {
      new(bytes: Uint8Array): ShellWasmCompiledModule;
      imports(module: ShellWasmCompiledModule): ShellWasmModuleImportDescriptor[];
    };
    readonly Instance: new(
      module: ShellWasmCompiledModule,
      imports: Readonly<Record<string, never>>
    ) => ShellWasmInstance;
    readonly Memory: {
      readonly prototype: ShellWasmMemory;
      [Symbol.hasInstance](value: unknown): boolean;
    };
    readonly RuntimeError: {
      readonly prototype: Error;
      [Symbol.hasInstance](value: unknown): boolean;
    };
  };
}).WebAssembly;
const MAXIMUM_SOURCE_BYTES = 65_536;
const MAXIMUM_PHYSICAL_LINES = 4_096;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const FORMS = new Set<ShellFunctionForm>([
  "posix-parens",
  "bash-function",
  "bash-function-parens"
]);
const FUNCTION_RESPONSE_KEYS = new Set([
  "name",
  "form",
  "declStart",
  "declEnd",
  "nameStart",
  "nameEnd"
]);
const RESPONSE_KEYS = new Set(["code", "functions"]);

export function createShellWasmRuntime(
  options: ShellWasmRuntimeOptions = {}
): ShellWasmRuntime {
  const assetUrl = new URL(`../assets/shell/${SHELL_WASM_ASSET_FILENAME}`, import.meta.url);
  const readAsset = options.readAsset ?? ((url: URL) => readFileSync(url));
  const compileModule = options.compileModule ?? ((bytes: Uint8Array) => new wasmApi.Module(bytes));
  const moduleImports = options.moduleImports ?? ((module: ShellWasmCompiledModule) => wasmApi.Module.imports(module));
  const instantiateModule = options.instantiateModule ??
    ((module: ShellWasmCompiledModule) => new wasmApi.Instance(module, {}));
  let compiledModule: ShellWasmCompiledModule | undefined;

  function loadModule(): ShellWasmCompiledModule {
    if (compiledModule !== undefined) {
      return compiledModule;
    }

    let bytes: Uint8Array;
    try {
      bytes = readAsset(assetUrl);
    } catch (error) {
      const missing = isNodeError(error) && error.code === "ENOENT";
      throw new ShellParserPackagingError(
        missing ? "asset-missing" : "asset-read",
        missing
          ? `Required Shell parser asset is missing: ${assetUrl.pathname}`
          : `Unable to read Shell parser asset: ${assetUrl.pathname}`,
        { cause: error }
      );
    }

    const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== SHELL_WASM_BYTE_LENGTH || digest !== SHELL_WASM_SHA256) {
      throw new ShellParserPackagingError(
        "asset-integrity",
        `Shell parser asset integrity mismatch: expected ${SHELL_WASM_SHA256}/${SHELL_WASM_BYTE_LENGTH}, received ${digest}/${bytes.byteLength}`
      );
    }

    let module: ShellWasmCompiledModule;
    try {
      module = compileModule(bytes);
    } catch (error) {
      throw new ShellParserPackagingError(
        "wasm-compile",
        "Unable to synchronously compile the Shell parser WASM asset",
        { cause: error }
      );
    }

    let imports: readonly ShellWasmModuleImportDescriptor[];
    try {
      imports = moduleImports(module);
    } catch (error) {
      throw new ShellParserPackagingError(
        "wasm-compile",
        "Unable to inspect the Shell parser WASM module",
        { cause: error }
      );
    }
    if (imports.length !== 0) {
      throw new ShellParserPackagingError(
        "wasm-imports",
        `Shell parser WASM must have zero imports; received ${imports.length}`
      );
    }

    compiledModule = module;
    return module;
  }

  const parse: ShellParser = (source, dialect) => {
    const sourceBytes = typeof source === "string" ? encoder.encode(source) : source;
    if (!(sourceBytes instanceof Uint8Array)) {
      throw new TypeError("Shell parser source must be a string or Uint8Array");
    }

    let instance: ShellWasmInstance;
    try {
      instance = instantiateModule(loadModule());
    } catch (error) {
      if (error instanceof ShellParserPackagingError) {
        throw error;
      }
      throw new ShellParserPackagingError(
        "wasm-instantiate",
        "Unable to create a fresh Shell parser WASM instance",
        { cause: error }
      );
    }

    const exports = validateExports(instance.exports);
    try {
      exports._initialize();
      const abiVersion = exports.abiVersion();
      if (!Number.isInteger(abiVersion)) {
        throw new ShellParserPackagingError("abi-invalid", "Shell parser returned a non-integer ABI version");
      }
      if (abiVersion !== SHELL_WASM_ABI_VERSION) {
        throw new ShellParserPackagingError(
          "abi-mismatch",
          `Unsupported Shell parser WASM ABI: expected ${SHELL_WASM_ABI_VERSION}, received ${abiVersion}`
        );
      }

      const sourceFailure = preflightSource(sourceBytes);
      if (sourceFailure !== null) {
        return sourceFailure;
      }

      const inputPointer = exports.wasmAlloc(sourceBytes.byteLength);
      validateMemoryRange(exports.memory, inputPointer, sourceBytes.byteLength, "input");
      new Uint8Array(exports.memory.buffer, inputPointer, sourceBytes.byteLength).set(sourceBytes);

      const dialectCode = dialect === "posix" ? 1 : dialect === "bash" ? 2 : 0;
      let resultPointer: number;
      try {
        resultPointer = exports.process(sourceBytes.byteLength, dialectCode);
      } catch (error) {
        if (error instanceof wasmApi.RuntimeError) {
          return { ok: false, code: 10 };
        }
        throw error;
      }
      const resultSize = exports.resultSize();
      validateMemoryRange(exports.memory, resultPointer, resultSize, "result");
      const resultBytes = new Uint8Array(exports.memory.buffer, resultPointer, resultSize);
      return validateResponse(JSON.parse(decoder.decode(resultBytes)), sourceBytes, dialect);
    } catch (error) {
      if (error instanceof ShellParserPackagingError) {
        throw error;
      }
      throw new ShellParserPackagingError(
        "runtime-trap",
        "Shell parser WASM trapped or returned unreadable output",
        { cause: error }
      );
    }
  };

  return { parse };
}

/** Enforces only syntax-agnostic source bounds; retained mvdan owns syntax and depth. */
function preflightSource(sourceBytes: Uint8Array): ShellParserResult | null {
  if (sourceBytes.byteLength > MAXIMUM_SOURCE_BYTES) {
    return { ok: false, code: 4 };
  }

  try {
    decoder.decode(sourceBytes);
  } catch {
    return { ok: false, code: 2 };
  }
  if (sourceBytes.includes(0)) {
    return { ok: false, code: 3 };
  }

  let physicalLines = sourceBytes.byteLength === 0 ? 0 : 1;
  for (const byte of sourceBytes) {
    if (byte === 0x0a) {
      physicalLines += 1;
    }
  }
  if (sourceBytes.at(-1) === 0x0a) {
    physicalLines -= 1;
  }
  if (physicalLines > MAXIMUM_PHYSICAL_LINES) {
    return { ok: false, code: 5 };
  }

  return null;
}

function validateExports(exports: Readonly<Record<string, unknown>>): ShellWasmExports {
  const candidate = exports as Partial<ShellWasmExports>;
  if (
    !(candidate.memory instanceof wasmApi.Memory) ||
    typeof candidate._initialize !== "function" ||
    typeof candidate.abiVersion !== "function" ||
    typeof candidate.wasmAlloc !== "function" ||
    typeof candidate.process !== "function" ||
    typeof candidate.resultSize !== "function"
  ) {
    throw new ShellParserPackagingError(
      "abi-invalid",
      "Shell parser WASM exports do not match ABI 1"
    );
  }
  return candidate as ShellWasmExports;
}

function validateMemoryRange(
  memory: ShellWasmMemory,
  pointer: number,
  size: number,
  label: "input" | "result"
): void {
  if (
    !Number.isInteger(pointer) ||
    !Number.isInteger(size) ||
    pointer < 0 ||
    size < 0 ||
    pointer > memory.buffer.byteLength ||
    size > memory.buffer.byteLength - pointer
  ) {
    throw new ShellParserPackagingError(
      "abi-invalid",
      `Shell parser returned an invalid ${label} memory range`
    );
  }
}

function validateResponse(
  value: unknown,
  sourceBytes: Uint8Array,
  dialect: ShellDialect
): ShellParserResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, RESPONSE_KEYS) ||
    !Number.isInteger(value.code) ||
    !Array.isArray(value.functions)
  ) {
    throw invalidResponse("Shell parser response must contain exactly integer code and functions array");
  }
  const code = value.code as number;
  if (code < 0 || code > 10) {
    throw invalidResponse(`Shell parser returned unsupported response code ${code}`);
  }
  if (code !== 0) {
    if (value.functions.length !== 0) {
      throw invalidResponse("Shell parser error response unexpectedly contained functions");
    }
    return { ok: false, code: code as ShellParserErrorCode };
  }

  const functions: ShellParserFunction[] = [];
  let previousEnd = 0;
  for (const [index, rawFunction] of value.functions.entries()) {
    if (!isRecord(rawFunction) || !hasExactKeys(rawFunction, FUNCTION_RESPONSE_KEYS)) {
      throw invalidResponse(`Shell parser function ${index} does not match the ABI object shape`);
    }
    const { name, form, declStart, declEnd, nameStart, nameEnd } = rawFunction;
    if (
      !validFunctionName(name, sourceBytes.byteLength) ||
      typeof form !== "string" ||
      !FORMS.has(form as ShellFunctionForm) ||
      !validOffset(declStart) ||
      !validOffset(declEnd) ||
      !validOffset(nameStart) ||
      !validOffset(nameEnd)
    ) {
      throw invalidResponse(`Shell parser function ${index} has an invalid shape`);
    }
    if (
      declStart < previousEnd ||
      declStart >= declEnd ||
      nameStart < declStart ||
      nameStart >= nameEnd ||
      nameEnd > declEnd ||
      declEnd > sourceBytes.byteLength
    ) {
      throw invalidResponse(`Shell parser function ${index} has invalid or unordered boundaries`);
    }
    if (dialect === "posix" && form !== "posix-parens") {
      throw invalidResponse(`Shell parser returned Bash-only form for POSIX input at function ${index}`);
    }
    try {
      decoder.decode(sourceBytes.subarray(declStart, declEnd));
      decoder.decode(sourceBytes.subarray(nameStart, nameEnd));
    } catch (error) {
      if (error instanceof ShellParserPackagingError) {
        throw error;
      }
      throw invalidResponse(`Shell parser function ${index} splits a UTF-8 boundary`, error);
    }
    functions.push({
      name,
      form: form as ShellFunctionForm,
      declStart,
      declEnd,
      nameStart,
      nameEnd
    });
    previousEnd = declEnd;
  }

  return { ok: true, functions };
}

function validOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** ABI safety only: fixed mvdan remains the authority for Shell name grammar. */
function validFunctionName(value: unknown, maximumBytes: number): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    CONTROL_CHARACTER.test(value)
  ) {
    return false;
  }
  const encoded = encoder.encode(value);
  return encoded.byteLength <= maximumBytes && decoder.decode(encoded) === value;
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function invalidResponse(message: string, cause?: unknown): ShellParserPackagingError {
  return new ShellParserPackagingError("response-invalid", message, { cause });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}

const defaultRuntime = createShellWasmRuntime();

export const parseShellSource: ShellParser = (source, dialect) =>
  defaultRuntime.parse(source, dialect);
