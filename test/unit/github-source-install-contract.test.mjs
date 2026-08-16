import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createSourceInstallPlan,
  parseSourceInstallArguments
} from "../../scripts/github-source-install.mjs";

const OFFICIAL_REPOSITORY = "https://github.com/HsinPu/SymbolLattice.git";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

describe("GitHub source installation contract", () => {
  it("creates a non-mutating preview for one official version tag", () => {
    const plan = createSourceInstallPlan({
      ref: "v0.421.0",
      repository: OFFICIAL_REPOSITORY,
      nodeVersion: "22.13.0",
      npmPrefix: resolve(".test-global-prefix"),
      temporaryRoot: resolve(".test-temporary-root")
    });

    expect(plan).toMatchObject({
      schemaVersion: 1,
      mode: "preview",
      status: "ready",
      source: {
        repository: "HsinPu/SymbolLattice",
        cloneUrl: OFFICIAL_REPOSITORY,
        ref: "v0.421.0",
        refKind: "version-tag",
        expectedVersion: "0.421.0"
      },
      requirements: {
        node: { version: "22.13.0", supported: true, range: ">=22.13 <25" },
        npmRegistryPublished: false,
        dependencyRegistryRequired: true
      },
      temporaryWorkspace: {
        cleanupOnSuccess: true,
        retainOnFailure: true
      },
      installation: {
        kind: "npm-global-from-github-source",
        modifiesCodexConfiguration: false,
        modifiesProjectIndex: false
      },
      mutation: {
        performed: false,
        confirmed: false
      }
    });
    expect(plan.installation.steps.map((step) => step.id)).toEqual([
      "clone",
      "verify-source",
      "install-dependencies",
      "type-check",
      "build",
      "pack",
      "isolated-install",
      "isolated-smoke",
      "global-install",
      "global-smoke"
    ]);
    expect(plan.nextSteps).toContain("SymbolLattice install codex");
    expect(JSON.stringify(plan)).not.toContain("--apply --yes");
  });

  it("accepts a full lowercase commit but rejects floating or ambiguous refs", () => {
    expect(createSourceInstallPlan({
      ref: COMMIT,
      nodeVersion: "24.9.0",
      npmPrefix: resolve(".test-global-prefix")
    }).source).toMatchObject({
      ref: COMMIT,
      refKind: "commit",
      expectedVersion: null
    });

    for (const ref of ["main", "master", "HEAD", "refs/heads/main", "feature/install", "ABCDEF".repeat(6) + "ABCD"]) {
      expect(() => createSourceInstallPlan({
        ref,
        nodeVersion: "22.13.0",
        npmPrefix: resolve(".test-global-prefix")
      })).toThrow(/version tag or full lowercase 40-character Git commit/u);
    }
  });

  it("rejects non-official repositories and unsupported Node versions", () => {
    expect(() => createSourceInstallPlan({
      ref: "v0.421.0",
      repository: "https://github.com/example/SymbolLattice.git",
      nodeVersion: "22.13.0",
      npmPrefix: resolve(".test-global-prefix")
    })).toThrow("official HsinPu/SymbolLattice repository");

    for (const nodeVersion of ["22.12.9", "25.0.0", "v24", "24.0.0-beta.1"]) {
      expect(() => createSourceInstallPlan({
        ref: "v0.421.0",
        nodeVersion,
        npmPrefix: resolve(".test-global-prefix")
      })).toThrow(/Node\.js/u);
    }
  });

  it("requires explicit apply and confirmation together without performing a mutation", () => {
    expect(() => createSourceInstallPlan({
      ref: "v0.421.0",
      apply: true,
      yes: false,
      nodeVersion: "22.13.0",
      npmPrefix: resolve(".test-global-prefix")
    })).toThrow("--apply requires --yes");
    expect(() => createSourceInstallPlan({
      ref: "v0.421.0",
      apply: false,
      yes: true,
      nodeVersion: "22.13.0",
      npmPrefix: resolve(".test-global-prefix")
    })).toThrow("--yes is only valid with --apply");

    const applyPlan = createSourceInstallPlan({
      ref: "v0.421.0",
      apply: true,
      yes: true,
      nodeVersion: "22.13.0",
      npmPrefix: resolve(".test-global-prefix")
    });
    expect(applyPlan.mode).toBe("apply");
    expect(applyPlan.mutation).toEqual({
      performed: false,
      confirmed: true,
      executionAvailable: true
    });
    expect(applyPlan.diagnostics).toContain(
      "Apply verifies the package in isolation before a rollback-protected user-level global installation; Codex configuration remains unchanged."
    );
  });

  it("parses a closed CLI argument surface and rejects duplicates or unknown flags", () => {
    expect(parseSourceInstallArguments([
      "--ref", "v0.421.0",
      "--repository", OFFICIAL_REPOSITORY,
      "--npm-prefix", "C:/Users/example/npm",
      "--temp-root", "C:/Temp",
      "--apply",
      "--yes",
      "--json"
    ])).toEqual({
      ref: "v0.421.0",
      repository: OFFICIAL_REPOSITORY,
      npmPrefix: "C:/Users/example/npm",
      temporaryRoot: "C:/Temp",
      apply: true,
      yes: true,
      json: true
    });

    expect(() => parseSourceInstallArguments(["--ref", "v0.421.0", "--ref", COMMIT])).toThrow("Duplicate argument");
    expect(() => parseSourceInstallArguments(["--ref", "v0.421.0", "--publish"])).toThrow("Unknown argument");
    expect(() => parseSourceInstallArguments(["--repository", OFFICIAL_REPOSITORY])).toThrow("Missing required");
  });

  it("exposes the same preview contract through the PowerShell entrypoint", () => {
    const shell = process.platform === "win32" ? "powershell.exe" : "pwsh";
    const output = execFileSync(shell, [
      "-NoProfile",
      ...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []),
      "-File", resolve("install.ps1"),
      "-Ref", "v0.421.0",
      "-NpmPrefix", resolve(".test global prefix"),
      "-TempRoot", resolve(".test temporary root"),
      "-Json"
    ], { encoding: "utf8", windowsHide: true });
    const plan = JSON.parse(output);

    expect(plan).toMatchObject({
      mode: "preview",
      status: "ready",
      source: { repository: "HsinPu/SymbolLattice", ref: "v0.421.0" },
      mutation: { performed: false, executionAvailable: true }
    });
  });

  it("discovers the npm global prefix without invoking npm through a Windows shell", () => {
    const shell = process.platform === "win32" ? "powershell.exe" : "pwsh";
    const output = execFileSync(shell, [
      "-NoProfile",
      ...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []),
      "-File", resolve("install.ps1"),
      "-Ref", "v0.421.0",
      "-TempRoot", resolve(".test temporary root"),
      "-Json"
    ], { encoding: "utf8", windowsHide: true });
    const plan = JSON.parse(output);

    expect(plan.installation.npmPrefix).toMatch(process.platform === "win32" ? /^[A-Za-z]:\\/u : /^\//u);
    expect(plan.mutation.performed).toBe(false);
  });

  it("keeps confirmed plan construction non-mutating until the Stage 2 executor is called", () => {
    const temporaryRoot = resolve(`.test planned temporary root ${process.pid}`);
    expect(existsSync(temporaryRoot)).toBe(false);
    const plan = createSourceInstallPlan({
      ref: "v0.421.0",
      apply: true,
      yes: true,
      nodeVersion: "22.13.0",
      npmPrefix: resolve(".test global prefix"),
      temporaryRoot
    });
    expect(plan).toMatchObject({
      mode: "apply",
      status: "ready",
      mutation: { performed: false, confirmed: true, executionAvailable: true }
    });
    expect(existsSync(temporaryRoot)).toBe(false);
  });
});
