import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  createShellWasmRuntime,
  ShellParserPackagingError,
  SHELL_WASM_ASSET_FILENAME,
  type ShellWasmCompiledModule,
  type ShellWasmInstance,
  type ShellWasmMemory
} from "../../../src/extraction/shell-wasm-runtime.js";

const retainedBytes = (): Uint8Array =>
  readFileSync(new URL(`../../../src/assets/shell/${SHELL_WASM_ASSET_FILENAME}`, import.meta.url));

function fakeInstance(
  response: unknown,
  overrides: Partial<Record<"_initialize" | "abiVersion" | "wasmAlloc" | "process" | "resultSize", () => number>> = {}
): ShellWasmInstance {
  const nativeWebAssembly = (globalThis as unknown as {
    readonly WebAssembly: {
      readonly Memory: new(descriptor: { readonly initial: number }) => ShellWasmMemory;
      readonly RuntimeError: new(message: string) => Error;
    };
  }).WebAssembly;
  const memory = new nativeWebAssembly.Memory({ initial: 1 });
  const bytes = new TextEncoder().encode(JSON.stringify(response));
  const resultPointer = 1_024;
  return {
    exports: {
      memory,
      _initialize: overrides._initialize ?? (() => undefined),
      abiVersion: overrides.abiVersion ?? (() => 1),
      wasmAlloc: overrides.wasmAlloc ?? (() => 0),
      process: overrides.process ?? (() => {
        new Uint8Array(memory.buffer, resultPointer, bytes.length).set(bytes);
        return resultPointer;
      }),
      resultSize: overrides.resultSize ?? (() => bytes.length)
    }
  } satisfies ShellWasmInstance;
}

function runtimeForResponse(response: unknown) {
  const module = {} as ShellWasmCompiledModule;
  return createShellWasmRuntime({
    readAsset: retainedBytes,
    compileModule: () => module,
    moduleImports: () => [],
    instantiateModule: () => fakeInstance(response)
  });
}

describe("retained mvdan Shell WASM runtime", () => {
  it("parses same-line roots, excludes nested declarations, and retains duplicate source order", () => {
    const runtime = createShellWasmRuntime();
    const source = [
      "left() { nested() { :; }; }; right() { :; }",
      "dup() { :; }; dup() { :; }",
      ""
    ].join("\n");

    const result = runtime.parse(source, "posix");

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.functions.map(({ name }) => name)).toEqual(["left", "right", "dup", "dup"]);
    expect(result.functions.map(({ declStart }) => declStart)).toEqual(
      [...result.functions].map(({ declStart }) => declStart).sort((left, right) => left - right)
    );
  });

  it("returns exact UTF-8 byte ranges across Unicode and CRLF", () => {
    const runtime = createShellWasmRuntime();
    const source = "# 😀\r\nuni() { :; }\r\n";

    const result = runtime.parse(source, "posix");

    expect(result).toEqual({
      ok: true,
      functions: [{
        name: "uni",
        form: "posix-parens",
        declStart: 8,
        declEnd: 20,
        nameStart: 8,
        nameEnd: 11
      }]
    });
  });

  it("accepts fixed-mvdan Bash function names without duplicating its grammar", () => {
    const runtime = createShellWasmRuntime();
    const cases = [
      [
        "kube::build::get_docker_wrapped_binaries() { :; }\n",
        "kube::build::get_docker_wrapped_binaries",
        "posix-parens"
      ],
      ["function kube::build::setup_vars { :; }\n", "kube::build::setup_vars", "bash-function"],
      ["function name-with-hyphen { :; }\n", "name-with-hyphen", "bash-function"],
      ["function foo\\" + "\n" + "bar { :; }\n", "foobar", "bash-function"],
      ["function foo\\ bar { :; }\n", "foo\\ bar", "bash-function"]
    ] as const;

    for (const [source, name, form] of cases) {
      expect(runtime.parse(source, "bash")).toMatchObject({
        ok: true,
        functions: [{ name, form }]
      });
      expect(runtime.parse(source, "posix")).toEqual({ ok: false, code: 6 });
    }
  });

  it("returns deterministic file-only response codes for every reachable source boundary", () => {
    const runtime = createShellWasmRuntime();
    const cases: ReadonlyArray<readonly [Uint8Array | string, "posix" | "bash", number]> = [
      [new Uint8Array([0xff]), "posix", 2],
      [new Uint8Array([0]), "posix", 3],
      ["x".repeat(65_537), "posix", 4],
      [":\n".repeat(4_097), "posix", 5],
      ["broken() {\n", "posix", 6],
      [Array.from({ length: 513 }, (_, index) => `f${index}() { :; }`).join("\n"), "posix", 7],
      [`${"if :; then\n".repeat(129)}:${"\nfi".repeat(129)}\n`, "posix", 8]
    ];

    for (const [source, dialect, code] of cases) {
      expect(runtime.parse(source, dialect)).toEqual({ ok: false, code });
    }
  });

  it("maps the exact 1,024-deep mvdan process trap to a file-only response", () => {
    const runtime = createShellWasmRuntime();
    const source = `f(){ echo ${"$(".repeat(1_024)}:${")".repeat(1_024)}; }\n`;

    expect(Buffer.byteLength(source, "utf8")).toBe(3_087);
    expect(runtime.parse(source, "posix")).toEqual({ ok: false, code: 10 });
  });

  it("lets mvdan accept flat substitutions and quoted literals", () => {
    const runtime = createShellWasmRuntime();
    const flatSubstitutions = Array.from({ length: 129 }, () => 'printf "%s" "$( :)";')
      .join(" ");
    const quotedLiteral = `${"$(".repeat(129)}${")".repeat(129)}`;
    const source = `f(){ ${flatSubstitutions} printf '%s' '${quotedLiteral}'; }\n`;

    expect(runtime.parse(source, "posix")).toMatchObject({
      ok: true,
      functions: [{ name: "f" }]
    });
  });

  it("lets mvdan parse literal nesting in complete quoted and unquoted heredoc bodies", () => {
    const runtime = createShellWasmRuntime();
    const literalNesting = "(".repeat(129);
    const quoted = `f(){ cat <<'EOF'\n${literalNesting}\nEOF\n}\n`;
    const unquoted = `f(){ cat <<EOF\n${literalNesting}\nEOF\n}\n`;

    expect(Buffer.byteLength(quoted, "utf8")).toBe(153);
    expect(runtime.parse(quoted, "posix")).toMatchObject({
      ok: true,
      functions: [{ name: "f" }]
    });
    expect(runtime.parse(unquoted, "posix")).toMatchObject({
      ok: true,
      functions: [{ name: "f" }]
    });
  });

  it("handles tab-stripped and multiple queued heredocs", () => {
    const runtime = createShellWasmRuntime();
    const literalNesting = "(".repeat(129);
    const tabStripped = `f(){ cat <<-'EOF'\n\t${literalNesting}\n\tEOF\n}\n`;
    const multiple = [
      `f(){ printf '%s' \"<<'ignored'\"; # <<'COMMENT'`,
      "cat <<'ONE' <<TWO",
      literalNesting,
      "ONE",
      "literal $(:)",
      "TWO",
      "}",
      ""
    ].join("\n");

    expect(runtime.parse(tabStripped, "posix")).toMatchObject({
      ok: true,
      functions: [{ name: "f" }]
    });
    expect(runtime.parse(multiple, "posix")).toMatchObject({
      ok: true,
      functions: [{ name: "f" }]
    });
  });

  it("defers continued quoted delimiters and heredoc expansion comments to mvdan", () => {
    const runtime = createShellWasmRuntime();
    const literalNesting = "(".repeat(129);
    const newline = "\n";
    const continuedDelimiter =
      'f(){ cat <<"EO' + "\\" + newline + 'F"' + newline + literalNesting +
      newline + "EOF" + newline + "}" + newline;
    const expansionComment = [
      "f(){ cat <<EOF",
      `$( # ${literalNesting}`,
      ": )",
      "EOF",
      "}",
      ""
    ].join(newline);

    expect(Buffer.byteLength(continuedDelimiter, "utf8")).toBe(155);
    expect(Buffer.byteLength(expansionComment, "utf8")).toBe(160);
    for (const source of [continuedDelimiter, expansionComment]) {
      expect(runtime.parse(source, "posix")).toMatchObject({
        ok: true,
        functions: [{ name: "f" }]
      });
    }
  });

  it("preserves mvdan depth and syntax errors for unquoted and incomplete heredocs", () => {
    const runtime = createShellWasmRuntime();
    const nestedExpansion = `${"$(".repeat(129)}:${")".repeat(129)}`;
    const unquoted = `f(){ cat <<EOF\n'${nestedExpansion}'\nEOF\n}\n`;
    const incomplete = `f(){ cat <<'EOF'\n${"(".repeat(129)}\n`;

    expect(runtime.parse(unquoted, "posix")).toEqual({ ok: false, code: 8 });
    expect(runtime.parse(incomplete, "posix")).toEqual({ ok: false, code: 6 });
  });

  it("lets mvdan distinguish arithmetic shifts and Bash here-strings", () => {
    const runtime = createShellWasmRuntime();

    expect(runtime.parse("f(){ echo $((1 << 2)); }\n", "posix")).toMatchObject({
      ok: true,
      functions: [{ name: "f" }]
    });
    expect(
      runtime.parse('f(){ (( value = 1 << 2 )); cat <<<"("; }\n', "bash")
    ).toMatchObject({
      ok: true,
      functions: [{ name: "f" }]
    });
  });

  it("keeps maximum-size nested and unterminated inputs time and memory bounded", () => {
    const runtime = createShellWasmRuntime();
    const maximumBytes = 65_536;
    const nestedCore = `f(){ echo ${"$(".repeat(20_000)}:${")".repeat(20_000)}; }\n`;
    const nested = nestedCore + "#".repeat(maximumBytes - Buffer.byteLength(nestedCore, "utf8"));
    const unterminatedHeader = "f(){ cat <<EOF\n";
    const unterminated = unterminatedHeader +
      "x".repeat(maximumBytes - Buffer.byteLength(unterminatedHeader, "utf8"));

    expect(runtime.parse("warm() { :; }\n", "posix")).toMatchObject({ ok: true });
    const rssBefore = process.memoryUsage().rss;
    const startedAt = performance.now();
    const nestedResult = runtime.parse(nested, "posix");
    const unterminatedResult = runtime.parse(unterminated, "posix");
    const elapsedMilliseconds = performance.now() - startedAt;
    const rssGrowthBytes = Math.max(0, process.memoryUsage().rss - rssBefore);

    expect(Buffer.byteLength(nested, "utf8")).toBe(maximumBytes);
    expect(Buffer.byteLength(unterminated, "utf8")).toBe(maximumBytes);
    expect(nestedResult).toEqual({ ok: false, code: 10 });
    expect(unterminatedResult).toEqual({ ok: false, code: 6 });
    expect(elapsedMilliseconds).toBeLessThan(5_000);
    expect(rssGrowthBytes).toBeLessThan(128 * 1_024 * 1_024);
  });

  it("reports missing and corrupt packaged assets with typed errors", () => {
    const missing = createShellWasmRuntime({
      readAsset: () => {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }
    });
    const corrupt = createShellWasmRuntime({ readAsset: () => new Uint8Array([0]) });

    expect(() => missing.parse("f() { :; }\n", "posix")).toThrowError(
      expect.objectContaining<Partial<ShellParserPackagingError>>({ code: "asset-missing" })
    );
    expect(() => corrupt.parse("f() { :; }\n", "posix")).toThrowError(
      expect.objectContaining<Partial<ShellParserPackagingError>>({ code: "asset-integrity" })
    );
  });

  it("aborts lifecycle and response faults but makes only a process trap file-only", () => {
    const nativeWebAssembly = (globalThis as unknown as {
      readonly WebAssembly: { readonly RuntimeError: new(message: string) => Error };
    }).WebAssembly;
    const module = {} as ShellWasmCompiledModule;
    const common = {
      readAsset: retainedBytes,
      compileModule: () => module,
      moduleImports: () => []
    };
    const mismatch = createShellWasmRuntime({
      ...common,
      instantiateModule: () => fakeInstance({ code: 0, functions: [] }, { abiVersion: () => 2 })
    });
    const importful = createShellWasmRuntime({
      ...common,
      moduleImports: () => [{ module: "host", name: "unexpected", kind: "function" }],
      instantiateModule: () => fakeInstance({ code: 0, functions: [] })
    });
    const initializationTrap = createShellWasmRuntime({
      ...common,
      instantiateModule: () => fakeInstance(
        { code: 0, functions: [] },
        { _initialize: () => { throw new nativeWebAssembly.RuntimeError("init"); } }
      )
    });
    const allocationTrap = createShellWasmRuntime({
      ...common,
      instantiateModule: () => fakeInstance(
        { code: 0, functions: [] },
        { wasmAlloc: () => { throw new nativeWebAssembly.RuntimeError("alloc"); } }
      )
    });
    const invalidResultRange = createShellWasmRuntime({
      ...common,
      instantiateModule: () => fakeInstance(
        { code: 0, functions: [] },
        { resultSize: () => Number.MAX_SAFE_INTEGER }
      )
    });
    const invalidResponse = createShellWasmRuntime({
      ...common,
      instantiateModule: () => fakeInstance({ code: 0, functions: "invalid" })
    });
    const trap = createShellWasmRuntime({
      ...common,
      instantiateModule: () => fakeInstance(
        { code: 0, functions: [] },
        { process: () => { throw new nativeWebAssembly.RuntimeError("trap"); } }
      )
    });

    expect(() => mismatch.parse("f() { :; }\n", "posix")).toThrowError(
      expect.objectContaining<Partial<ShellParserPackagingError>>({ code: "abi-mismatch" })
    );
    expect(() => importful.parse("f() { :; }\n", "posix")).toThrowError(
      expect.objectContaining<Partial<ShellParserPackagingError>>({ code: "wasm-imports" })
    );
    for (const runtime of [initializationTrap, allocationTrap]) {
      expect(() => runtime.parse("f() { :; }\n", "posix")).toThrowError(
        expect.objectContaining<Partial<ShellParserPackagingError>>({ code: "runtime-trap" })
      );
    }
    expect(() => invalidResultRange.parse("f() { :; }\n", "posix")).toThrowError(
      expect.objectContaining<Partial<ShellParserPackagingError>>({ code: "abi-invalid" })
    );
    expect(() => invalidResponse.parse("f() { :; }\n", "posix")).toThrowError(
      expect.objectContaining<Partial<ShellParserPackagingError>>({ code: "response-invalid" })
    );
    expect(trap.parse("f() { :; }\n", "posix")).toEqual({ ok: false, code: 10 });
  });

  for (const [label, response] of [
    ["success extra key", { code: 0, functions: [], unexpected: true }],
    ["error extra key", { code: 6, functions: [], unexpected: true }],
    ["success missing functions", { code: 0 }],
    ["error missing functions", { code: 6 }],
    ["missing code", { functions: [] }]
  ] as const) {
    it(`rejects top-level response envelope drift: ${label}`, () => {
      expect(() => runtimeForResponse(response).parse("f() { :; }\n", "posix")).toThrowError(
        expect.objectContaining<Partial<ShellParserPackagingError>>({ code: "response-invalid" })
      );
    });
  }

  it("rejects malformed synthetic function names and source-offset mismatches", () => {
    const functionResponse = (
      name: unknown,
      nameStart = 0,
      nameEnd = 1,
      extras: Readonly<Record<string, unknown>> = {}
    ) => ({
      code: 0,
      functions: [{
        name,
        form: "posix-parens",
        declStart: 0,
        declEnd: 11,
        nameStart,
        nameEnd,
        ...extras
      }]
    });

    for (const response of [
      functionResponse(""),
      functionResponse("\ud800"),
      functionResponse("\0"),
      functionResponse("\u0001"),
      functionResponse("a".repeat(12)),
      functionResponse("f", 11, 12),
      functionResponse(1),
      functionResponse("f", 0, 1, { unexpected: true })
    ]) {
      expect(() => runtimeForResponse(response).parse("f() { :; }\n", "posix")).toThrowError(
        expect.objectContaining<Partial<ShellParserPackagingError>>({ code: "response-invalid" })
      );
    }
  });

  it("compiles once and creates one fresh instance for every file", () => {
    const module = {} as ShellWasmCompiledModule;
    const compileModule = vi.fn(() => module);
    const instantiateModule = vi.fn(() => fakeInstance({ code: 0, functions: [] }));
    const runtime = createShellWasmRuntime({
      readAsset: retainedBytes,
      compileModule,
      moduleImports: () => [],
      instantiateModule
    });

    expect(runtime.parse("a() { :; }\n", "posix")).toEqual({ ok: true, functions: [] });
    expect(runtime.parse("b() { :; }\n", "posix")).toEqual({ ok: true, functions: [] });
    expect(compileModule).toHaveBeenCalledOnce();
    expect(instantiateModule).toHaveBeenCalledTimes(2);
  });
});
