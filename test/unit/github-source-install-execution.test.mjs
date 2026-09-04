import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  createSourceInstallPlan,
  executeSourceInstallStage2
} from "../../scripts/install/github-source-install.mjs";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const VERSION = "0.421.0";
const OFFICIAL_REPOSITORY = "https://github.com/HsinPu/SymbolLattice.git";
const SHELL_ASSET_MANIFEST_SHA256 = "7f3ce86cbebf22479e072a609a555bac6ba1e7187c4f5b2e83bd60ddd10b29b5";
const LUA_ASSET_MANIFEST_SHA256 = "7bd06e26f9da2b60cf1fdbd8abfe58e4bf09f5fc37e120fd92b044e09e8c98dc";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const shellAssetSource = join(repositoryRoot, "src", "assets", "shell");
const luaAssetSource = join(repositoryRoot, "src", "assets", "lua");
const REQUIRED_PACKAGE_FILES = [
  "LICENSE",
  "README.en.md",
  "README.md",
  "dist/assets/lua/THIRD_PARTY_NOTICES.md",
  "dist/assets/lua/asset-manifest.json",
  "dist/assets/lua/provenance.json",
  "dist/assets/lua/sbom.cdx.json",
  "dist/assets/lua/tree-sitter-lua-MIT.txt",
  "dist/assets/lua/tree-sitter-lua-v0.5.0.wasm",
  "dist/assets/lua/web-tree-sitter-MIT.txt",
  "dist/assets/shell/Binaryen-Apache-2.0.txt",
  "dist/assets/shell/Go-BSD-3-Clause.txt",
  "dist/assets/shell/LLVM-compiler-rt-Apache-2.0-WITH-LLVM-exception.txt",
  "dist/assets/shell/THIRD_PARTY_NOTICES.md",
  "dist/assets/shell/TinyGo-BSD-3-Clause.txt",
  "dist/assets/shell/asset-manifest.json",
  "dist/assets/shell/mvdan-sh-BSD-3-Clause.txt",
  "dist/assets/shell/mvdan-sh-v3.13.1-tinygo-v0.41.1.wasm",
  "dist/assets/shell/provenance.json",
  "dist/assets/shell/sbom.cdx.json",
  "dist/cli/main.js",
  "dist/index.js",
  "package.json"
];
const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function executionFixture(options = {}) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "SymbolLattice-source-stage2-test-"));
  roots.push(temporaryRoot);
  const calls = [];
  let workspace = null;
  const failStep = options.failStep ?? null;

  const dependencies = {
    createWorkspace: async (parent) => {
      workspace = await mkdtemp(join(parent, "SymbolLattice-install-"));
      await writeFile(join(workspace, "package.json"), `${JSON.stringify({
        name: "@hsinpu/symbollattice",
        version: VERSION,
        private: true,
        repository: { type: "git", url: "git+https://github.com/HsinPu/SymbolLattice.git" },
        engines: { node: ">=22.13 <25" },
        ...(options.packageOverrides ?? {})
      }, null, 2)}\n`);
      await writeFile(join(workspace, "package-lock.json"), "{}\n");
      await cp(shellAssetSource, join(workspace, "src", "assets", "shell"), { recursive: true });
      await cp(luaAssetSource, join(workspace, "src", "assets", "lua"), { recursive: true });
      return workspace;
    },
    runProcess: async (command, args, context) => {
      calls.push({ command, args: [...args], step: context.step });
      if (context.step === failStep) {
        throw new Error(`simulated ${failStep} failure`);
      }
      if (command === "git" && args.includes("get-url")) return { stdout: `${OFFICIAL_REPOSITORY}\n`, stderr: "" };
      if (command === "git" && args.includes("rev-parse")) return { stdout: `${COMMIT}\n`, stderr: "" };
      if (command === "git" && args.includes("status")) return { stdout: "", stderr: "" };
      if (command === "npm" && args[0] === "run" && args[1] === "build") {
        const builtAssets = join(workspace, "dist", "assets", "shell");
        await cp(join(workspace, "src", "assets", "shell"), builtAssets, { recursive: true });
        await cp(
          join(workspace, "src", "assets", "lua"),
          join(workspace, "dist", "assets", "lua"),
          { recursive: true }
        );
        if (options.corruptBuildAsset === true) {
          await writeFile(join(builtAssets, "provenance.json"), " ", { flag: "a" });
        }
        return { stdout: "built\n", stderr: "" };
      }
      if (command === "npm" && args[0] === "pack") {
        const packDirectory = args[args.indexOf("--pack-destination") + 1];
        await mkdir(packDirectory, { recursive: true });
        const filename = "hsinpu-symbollattice-0.421.0.tgz";
        await writeFile(join(packDirectory, filename), "verified package bytes");
        return {
          stdout: `${options.packStdoutPrefix ?? ""}${JSON.stringify([{
            id: "@hsinpu/symbollattice@0.421.0",
            name: "@hsinpu/symbollattice",
            version: VERSION,
            filename,
            files: (options.packFiles ?? REQUIRED_PACKAGE_FILES).map((path) => ({ path, size: 1 }))
          }])}${options.packStdoutSuffix ?? ""}`,
          stderr: ""
        };
      }
      if (command === "npm" && args[0] === "install") {
        const prefix = args[args.indexOf("--prefix") + 1];
        const entry = join(prefix, "node_modules", "@hsinpu", "symbollattice", "dist", "cli", "main.js");
        await mkdir(resolve(entry, ".."), { recursive: true });
        await writeFile(entry, "// isolated fixture\n");
        if (options.omitIsolatedAssets !== true) {
          await cp(
            join(workspace, "dist", "assets", "shell"),
            join(prefix, "node_modules", "@hsinpu", "symbollattice", "dist", "assets", "shell"),
            { recursive: true }
          );
          await cp(
            join(workspace, "dist", "assets", "lua"),
            join(prefix, "node_modules", "@hsinpu", "symbollattice", "dist", "assets", "lua"),
            { recursive: true }
          );
        }
        return { stdout: "installed\n", stderr: "" };
      }
      if (command === process.execPath && args.at(-1) === "--version") return { stdout: `${VERSION}\n`, stderr: "" };
      if (command === process.execPath && args.at(-1) === "--help") return { stdout: "Usage: SymbolLattice [command]\n", stderr: "" };
      return { stdout: "", stderr: "" };
    },
    runMcpSmoke: async ({ entryPath, projectPath }) => ({
      entryPath,
      projectPath,
      protocolVersion: "2025-06-18",
      toolCount: 21,
      toolNames: Array.from({ length: 21 }, (_, index) => `SymbolLattice_tool_${index + 1}`)
    })
  };
  const plan = createSourceInstallPlan({
    ref: `v${VERSION}`,
    apply: true,
    yes: true,
    nodeVersion: "22.13.0",
    npmPrefix: resolve(temporaryRoot, "unused-global-prefix"),
    temporaryRoot
  });
  return { calls, dependencies, plan, temporaryRoot, workspace: () => workspace };
}

describe("GitHub source installation Stage 2 execution", () => {
  it("verifies, builds, packs, and smoke-tests one official source in isolation", async () => {
    const fixture = await executionFixture();
    const result = await executeSourceInstallStage2(fixture.plan, fixture.dependencies);

    expect(result).toMatchObject({
      schemaVersion: 1,
      mode: "apply",
      status: "isolated-verified",
      source: {
        repository: "HsinPu/SymbolLattice",
        ref: "v0.421.0",
        commit: COMMIT,
        packageVersion: VERSION,
        clean: true
      },
      package: {
        name: "@hsinpu/symbollattice",
        version: VERSION,
        sizeBytes: 22,
        requiredFilesPresent: true,
        forbiddenFiles: [],
        shellAssets: { manifestSha256: SHELL_ASSET_MANIFEST_SHA256 },
        luaAssets: { manifestSha256: LUA_ASSET_MANIFEST_SHA256 }
      },
      isolatedInstallation: {
        version: VERSION,
        cliHelpPassed: true,
        mcp: { toolCount: 21 },
        shellAssets: { manifestSha256: SHELL_ASSET_MANIFEST_SHA256 },
        luaAssets: { manifestSha256: LUA_ASSET_MANIFEST_SHA256 }
      },
      globalInstallation: { performed: false },
      mutation: { performed: true, globalInstallationPerformed: false },
      cleanup: { performed: false, retainedForStage3: true }
    });
    expect(result.package.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.package.files).toEqual(REQUIRED_PACKAGE_FILES);
    expect(result.temporaryWorkspace.path).toBe(fixture.workspace());
    expect(fixture.calls.map((call) => call.step)).toEqual([
      "clone-init",
      "clone-origin",
      "clone-fetch",
      "clone-checkout",
      "verify-origin",
      "verify-head",
      "verify-tag",
      "verify-clean",
      "install-dependencies",
      "type-check",
      "build",
      "pack",
      "isolated-install",
      "isolated-version",
      "isolated-help"
    ]);
    expect(fixture.calls.some((call) => call.args.includes("--global"))).toBe(false);
  });

  it("accepts newline-delimited prepack diagnostics before the final npm pack JSON array", async () => {
    const fixture = await executionFixture({
      packStdoutPrefix: '{"asset":"shell","status":"copied"}\n{"asset":"lua","status":"copied"}\n'
    });

    const result = await executeSourceInstallStage2(fixture.plan, fixture.dependencies);

    expect(result.status).toBe("isolated-verified");
    expect(result.package.version).toBe(VERSION);
  });

  it("rejects trailing non-whitespace after the npm pack JSON array", async () => {
    const fixture = await executionFixture({ packStdoutSuffix: "\nuntrusted trailing output" });

    await expect(executeSourceInstallStage2(fixture.plan, fixture.dependencies)).rejects.toMatchObject({
      name: "SourceInstallStage2Error",
      step: "pack"
    });
  });

  it("stops before packing or installation and reports the retained workspace on failure", async () => {
    const fixture = await executionFixture({ failStep: "build" });
    let failure;
    try {
      await executeSourceInstallStage2(fixture.plan, fixture.dependencies);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      name: "SourceInstallStage2Error",
      step: "build",
      workspacePath: fixture.workspace()
    });
    expect(fixture.calls.some((call) => call.step === "pack")).toBe(false);
    expect(fixture.calls.some((call) => call.step === "isolated-install")).toBe(false);
    expect(fixture.calls.some((call) => call.args.includes("--global"))).toBe(false);
  });

  it("stops before packing when a built Shell parser asset is stale", async () => {
    const fixture = await executionFixture({ corruptBuildAsset: true });

    await expect(executeSourceInstallStage2(fixture.plan, fixture.dependencies)).rejects.toMatchObject({
      name: "SourceInstallStage2Error",
      step: "verify-build-assets"
    });
    expect(fixture.calls.some((call) => call.step === "pack")).toBe(false);
  });

  it("rejects an isolated install that omits the Shell parser asset closure", async () => {
    const fixture = await executionFixture({ omitIsolatedAssets: true });

    await expect(executeSourceInstallStage2(fixture.plan, fixture.dependencies)).rejects.toMatchObject({
      name: "SourceInstallStage2Error",
      step: "verify-isolated-assets"
    });
    expect(fixture.calls.some((call) => call.step === "isolated-version")).toBe(false);
  });

  it("rejects a cloned package identity mismatch before installing dependencies", async () => {
    const fixture = await executionFixture({
      packageOverrides: { repository: { type: "git", url: "git+https://github.com/example/forgery.git" } }
    });

    await expect(executeSourceInstallStage2(fixture.plan, fixture.dependencies)).rejects.toMatchObject({
      name: "SourceInstallStage2Error",
      step: "verify-package"
    });
    expect(fixture.calls.some((call) => call.step === "install-dependencies")).toBe(false);
  });

  it.each(["src/private.ts", "benchmarks/r/correctness-oracle.mjs"])(
    "rejects a pack manifest with source leakage before isolated installation: %s",
    async (leakedPath) => {
      const fixture = await executionFixture({ packFiles: [...REQUIRED_PACKAGE_FILES, leakedPath] });

      await expect(executeSourceInstallStage2(fixture.plan, fixture.dependencies)).rejects.toMatchObject({
        name: "SourceInstallStage2Error",
        step: "pack"
      });
      expect(fixture.calls.some((call) => call.step === "isolated-install")).toBe(false);
    }
  );
});
