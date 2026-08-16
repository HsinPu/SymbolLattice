import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createSourceInstallPlan,
  executeSourceInstallStage3
} from "../../scripts/github-source-install.mjs";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const VERSION = "0.421.0";
const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function stage3Fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "SymbolLattice-source-stage3-test-"));
  roots.push(root);
  const workspace = join(root, "SymbolLattice-install-fixture");
  const prefix = join(root, "npm-prefix");
  const globalRoot = join(prefix, "node_modules");
  const packageDirectory = join(globalRoot, "@hsinpu", "symbollattice");
  const tarballPath = join(workspace, "source-install-pack", "hsinpu-symbollattice-0.421.0.tgz");
  await mkdir(resolve(tarballPath, ".."), { recursive: true });
  await mkdir(globalRoot, { recursive: true });
  await writeFile(tarballPath, "verified stage3 package bytes");
  const tarball = await readFile(tarballPath);
  await writeFile(join(workspace, ".symbollattice-source-install-workspace.json"), `${JSON.stringify({
    schemaVersion: 1,
    repository: "HsinPu/SymbolLattice",
    commit: COMMIT
  })}\n`);

  if (options.previousVersion !== undefined) {
    await mkdir(join(packageDirectory, "dist", "cli"), { recursive: true });
    await writeFile(join(packageDirectory, "package.json"), `${JSON.stringify({
      name: "@hsinpu/symbollattice",
      version: options.previousVersion,
      ...(options.previousDependencies === undefined ? {} : { dependencies: options.previousDependencies })
    })}\n`);
    await writeFile(join(packageDirectory, "dist", "cli", "main.js"), "// previous global CLI\n");
    await writeFile(join(prefix, "SymbolLattice.cmd"), "previous launcher\n");
  }

  const calls = [];
  const runProcess = async (command, args, context) => {
    calls.push({ command, args: [...args], step: context.step });
    if (context.step === "global-install") {
      if (options.failInstall === true) {
        await mkdir(packageDirectory, { recursive: true });
        await writeFile(join(packageDirectory, "partial.txt"), "partial installation\n");
        throw new Error("simulated global install failure");
      }
      await rm(packageDirectory, { recursive: true, force: true });
      await mkdir(join(packageDirectory, "dist", "cli"), { recursive: true });
      await writeFile(join(packageDirectory, "package.json"), `${JSON.stringify({
        name: "@hsinpu/symbollattice",
        version: VERSION
      })}\n`);
      await writeFile(join(packageDirectory, "dist", "cli", "main.js"), "// new global CLI\n");
      await writeFile(join(prefix, "SymbolLattice"), "new bare launcher\n");
      await writeFile(join(prefix, "SymbolLattice.cmd"), "new launcher\n");
      await writeFile(join(prefix, "SymbolLattice.ps1"), "new PowerShell launcher\n");
      return { stdout: "installed\n", stderr: "" };
    }
    if (context.step === "global-version") return { stdout: `${VERSION}\n`, stderr: "" };
    if (context.step === "global-help") return { stdout: "Usage: SymbolLattice [command]\n", stderr: "" };
    return { stdout: "", stderr: "" };
  };

  const plan = createSourceInstallPlan({
    ref: COMMIT,
    apply: true,
    yes: true,
    nodeVersion: "22.13.0",
    npmPrefix: prefix,
    temporaryRoot: root
  });
  const stage2 = {
    schemaVersion: 1,
    mode: "apply",
    status: "isolated-verified",
    source: {
      repository: "HsinPu/SymbolLattice",
      ref: COMMIT,
      commit: COMMIT,
      packageVersion: VERSION,
      clean: true
    },
    temporaryWorkspace: { path: workspace, retained: true },
    package: {
      name: "@hsinpu/symbollattice",
      version: VERSION,
      filename: "hsinpu-symbollattice-0.421.0.tgz",
      tarballPath,
      sizeBytes: tarball.byteLength,
      sha256: createHash("sha256").update(tarball).digest("hex"),
      requiredFilesPresent: true,
      forbiddenFiles: []
    },
    isolatedInstallation: { version: VERSION, cliHelpPassed: true, mcp: { toolCount: 21 } },
    globalInstallation: { performed: false },
    cleanup: { performed: false, retainedForStage3: true }
  };
  return { calls, globalRoot, packageDirectory, plan, prefix, runProcess, stage2, tarballPath, workspace };
}

describe("GitHub source installation Stage 3 global deployment", () => {
  it("installs only the verified tarball, verifies the global CLI and MCP, then cleans its workspace", async () => {
    const fixture = await stage3Fixture();
    const result = await executeSourceInstallStage3(fixture.plan, fixture.stage2, {
      runProcess: fixture.runProcess,
      runMcpSmoke: async () => ({
        protocolVersion: "2025-06-18",
        toolCount: 21,
        toolNames: Array.from({ length: 21 }, (_, index) => `SymbolLattice_tool_${index + 1}`)
      })
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      status: "globally-installed-verified",
      source: { commit: COMMIT },
      previousInstallation: { present: false },
      globalInstallation: {
        performed: true,
        prefix: fixture.prefix,
        version: VERSION,
        cliHelpPassed: true,
        mcp: { toolCount: 21 }
      },
      rollback: { required: false, performed: false },
      cleanup: { performed: true }
    });
    expect(fixture.calls.find((call) => call.step === "global-install")?.args).toContain("--install-strategy=nested");
    expect(existsSync(fixture.workspace)).toBe(false);
    expect(existsSync(fixture.packageDirectory)).toBe(true);
    expect(existsSync(join(fixture.prefix, "SymbolLattice"))).toBe(true);
    expect(existsSync(join(fixture.prefix, "SymbolLattice.cmd"))).toBe(true);
    expect(existsSync(join(fixture.prefix, "SymbolLattice.ps1"))).toBe(true);
  });

  it("rejects a changed tarball before touching the global prefix and retains the workspace", async () => {
    const fixture = await stage3Fixture();
    await writeFile(fixture.tarballPath, "tampered package bytes");

    await expect(executeSourceInstallStage3(fixture.plan, fixture.stage2, {
      runProcess: fixture.runProcess,
      runMcpSmoke: async () => ({ toolCount: 21, toolNames: [] })
    })).rejects.toMatchObject({
      name: "SourceInstallStage3Error",
      step: "verify-artifact",
      rollbackPerformed: false,
      workspacePath: fixture.workspace
    });
    expect(fixture.calls.some((call) => call.step === "global-install")).toBe(false);
    expect(existsSync(fixture.workspace)).toBe(true);
  });

  it("restores an existing installation byte-for-byte when global MCP verification fails", async () => {
    const fixture = await stage3Fixture({ previousVersion: "0.420.0" });

    await expect(executeSourceInstallStage3(fixture.plan, fixture.stage2, {
      runProcess: fixture.runProcess,
      runMcpSmoke: async () => {
        throw new Error("simulated MCP verification failure");
      }
    })).rejects.toMatchObject({
      name: "SourceInstallStage3Error",
      step: "global-mcp",
      rollbackPerformed: true,
      previousVersion: "0.420.0"
    });
    expect(await readFile(join(fixture.packageDirectory, "dist", "cli", "main.js"), "utf8")).toBe("// previous global CLI\n");
    expect(await readFile(join(fixture.prefix, "SymbolLattice.cmd"), "utf8")).toBe("previous launcher\n");
    expect(existsSync(fixture.workspace)).toBe(true);
  });

  it("removes a partial first installation when npm fails and retains diagnostics", async () => {
    const fixture = await stage3Fixture({ failInstall: true });

    await expect(executeSourceInstallStage3(fixture.plan, fixture.stage2, {
      runProcess: fixture.runProcess,
      runMcpSmoke: async () => ({ toolCount: 21, toolNames: [] })
    })).rejects.toMatchObject({
      name: "SourceInstallStage3Error",
      step: "global-install",
      rollbackPerformed: true,
      previousVersion: null
    });
    expect(existsSync(fixture.packageDirectory)).toBe(false);
    expect(existsSync(fixture.workspace)).toBe(true);
  });

  it("refuses to overwrite an installation whose dependencies cannot be captured inside the package snapshot", async () => {
    const fixture = await stage3Fixture({
      previousVersion: "0.420.0",
      previousDependencies: { externalized: "1.0.0" }
    });

    await expect(executeSourceInstallStage3(fixture.plan, fixture.stage2, {
      runProcess: fixture.runProcess,
      runMcpSmoke: async () => ({ toolCount: 21, toolNames: [] })
    })).rejects.toMatchObject({
      name: "SourceInstallStage3Error",
      step: "snapshot-global",
      rollbackPerformed: false,
      previousVersion: null
    });
    expect(fixture.calls.some((call) => call.step === "global-install")).toBe(false);
    expect(await readFile(join(fixture.packageDirectory, "dist", "cli", "main.js"), "utf8")).toBe("// previous global CLI\n");
  });

  it("refuses cleanup and installation when the retained workspace marker is missing", async () => {
    const fixture = await stage3Fixture();
    await rm(join(fixture.workspace, ".symbollattice-source-install-workspace.json"));

    await expect(executeSourceInstallStage3(fixture.plan, fixture.stage2, {
      runProcess: fixture.runProcess,
      runMcpSmoke: async () => ({ toolCount: 21, toolNames: [] })
    })).rejects.toMatchObject({
      name: "SourceInstallStage3Error",
      step: "verify-workspace",
      rollbackPerformed: false
    });
    expect(fixture.calls.some((call) => call.step === "global-install")).toBe(false);
    expect(existsSync(fixture.workspace)).toBe(true);
  });
});
