import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createSourceInstallPlan,
  executeSourceInstallStage2
} from "../../scripts/github-source-install.mjs";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const VERSION = "0.421.0";
const OFFICIAL_REPOSITORY = "https://github.com/HsinPu/SymbolLattice.git";
const REQUIRED_PACKAGE_FILES = [
  "LICENSE",
  "README.en.md",
  "README.md",
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
      if (command === "npm" && args[0] === "pack") {
        const packDirectory = args[args.indexOf("--pack-destination") + 1];
        await mkdir(packDirectory, { recursive: true });
        const filename = "hsinpu-symbollattice-0.421.0.tgz";
        await writeFile(join(packDirectory, filename), "verified package bytes");
        return {
          stdout: JSON.stringify([{
            id: "@hsinpu/symbollattice@0.421.0",
            name: "@hsinpu/symbollattice",
            version: VERSION,
            filename,
            files: (options.packFiles ?? REQUIRED_PACKAGE_FILES).map((path) => ({ path, size: 1 }))
          }]),
          stderr: ""
        };
      }
      if (command === "npm" && args[0] === "install") {
        const prefix = args[args.indexOf("--prefix") + 1];
        const entry = join(prefix, "node_modules", "@hsinpu", "symbollattice", "dist", "cli", "main.js");
        await mkdir(resolve(entry, ".."), { recursive: true });
        await writeFile(entry, "// isolated fixture\n");
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
        forbiddenFiles: []
      },
      isolatedInstallation: {
        version: VERSION,
        cliHelpPassed: true,
        mcp: { toolCount: 21 }
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

  it("rejects a pack manifest with source leakage before isolated installation", async () => {
    const fixture = await executionFixture({ packFiles: [...REQUIRED_PACKAGE_FILES, "src/private.ts"] });

    await expect(executeSourceInstallStage2(fixture.plan, fixture.dependencies)).rejects.toMatchObject({
      name: "SourceInstallStage2Error",
      step: "pack"
    });
    expect(fixture.calls.some((call) => call.step === "isolated-install")).toBe(false);
  });
});
