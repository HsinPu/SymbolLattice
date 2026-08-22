#!/usr/bin/env node

import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { verifyShellParserAssets } from "./copy-shell-parser-assets.mjs";
import { verifyLuaParserAssets } from "./copy-lua-parser-assets.mjs";

const PACKAGE_NAME = "@hsinpu/symbollattice";
const REPOSITORY = "HsinPu/SymbolLattice";
const REPOSITORY_URL = "https://github.com/HsinPu/SymbolLattice.git";
const NODE_RANGE = ">=22.13 <25";
const REPOSITORY_PACKAGE_URL = "git+https://github.com/HsinPu/SymbolLattice.git";
const VERSION_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const FULL_COMMIT = /^[0-9a-f]{40}$/u;
const NODE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const PROCESS_OUTPUT_BYTES = 4 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 10 * 60 * 1000;
const MCP_TIMEOUT_MS = 30_000;
const WORKSPACE_MARKER = ".symbollattice-source-install-workspace.json";
const INSTALL_LOCK = ".SymbolLattice-source-install.lock";
const REQUIRED_PACKAGE_FILES = Object.freeze([
  "LICENSE",
  "README.en.md",
  "README.md",
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
  "dist/assets/lua/THIRD_PARTY_NOTICES.md",
  "dist/assets/lua/asset-manifest.json",
  "dist/assets/lua/provenance.json",
  "dist/assets/lua/sbom.cdx.json",
  "dist/assets/lua/tree-sitter-lua-MIT.txt",
  "dist/assets/lua/tree-sitter-lua-v0.5.0.wasm",
  "dist/assets/lua/web-tree-sitter-MIT.txt",
  "dist/cli/main.js",
  "dist/index.js",
  "package.json"
]);
const execFileAsync = promisify(execFile);

const VALUE_ARGUMENTS = new Map([
  ["--ref", "ref"],
  ["--repository", "repository"],
  ["--npm-prefix", "npmPrefix"],
  ["--temp-root", "temporaryRoot"]
]);
const BOOLEAN_ARGUMENTS = new Map([
  ["--apply", "apply"],
  ["--yes", "yes"],
  ["--json", "json"]
]);

export function parseSourceInstallArguments(argv) {
  const result = { apply: false, yes: false, json: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const valueKey = VALUE_ARGUMENTS.get(flag);
    const booleanKey = BOOLEAN_ARGUMENTS.get(flag);
    const key = valueKey ?? booleanKey;
    if (key === undefined) {
      throw new Error(`Unknown argument: ${flag ?? "<missing>"}.`);
    }
    if (seen.has(key)) {
      throw new Error(`Duplicate argument: ${flag}.`);
    }
    seen.add(key);
    if (valueKey !== undefined) {
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("--")) {
        throw new Error(`Missing value for ${flag}.`);
      }
      result[valueKey] = value;
      index += 1;
      continue;
    }
    result[booleanKey] = true;
  }
  if (typeof result.ref !== "string") {
    throw new Error("Missing required source-install argument: ref.");
  }
  return result;
}

export function createSourceInstallPlan(options) {
  const repository = options.repository ?? REPOSITORY_URL;
  if (repository !== REPOSITORY_URL) {
    throw new Error(`Source installation is restricted to the official ${REPOSITORY} repository.`);
  }
  const source = sourceIdentity(options.ref);
  const nodeVersion = validateNodeVersion(options.nodeVersion ?? process.versions.node);
  const npmPrefix = validateAbsoluteDirectory(options.npmPrefix, "npm global prefix");
  const temporaryRoot = validateAbsoluteDirectory(options.temporaryRoot ?? tmpdir(), "temporary root");
  const apply = options.apply === true;
  const yes = options.yes === true;
  if (apply && !yes) {
    throw new Error("--apply requires --yes for a GitHub source installation.");
  }
  if (!apply && yes) {
    throw new Error("--yes is only valid with --apply.");
  }

  return Object.freeze({
    schemaVersion: 1,
    mode: apply ? "apply" : "preview",
    status: "ready",
    package: Object.freeze({ name: PACKAGE_NAME }),
    source: Object.freeze({
      repository: REPOSITORY,
      cloneUrl: REPOSITORY_URL,
      ...source
    }),
    requirements: Object.freeze({
      git: Object.freeze({ required: true, availabilityCheck: "execution-stage" }),
      npm: Object.freeze({ required: true, availabilityCheck: "execution-stage" }),
      powershell: Object.freeze({ required: true, supportedEditions: Object.freeze(["Windows PowerShell 5.1", "PowerShell 7+"]) }),
      node: Object.freeze({ version: nodeVersion, supported: true, range: NODE_RANGE }),
      npmRegistryPublished: false,
      dependencyRegistryRequired: true
    }),
    temporaryWorkspace: Object.freeze({
      parent: temporaryRoot,
      namePattern: "SymbolLattice-install-<uuid>",
      cleanupOnSuccess: true,
      retainOnFailure: true
    }),
    installation: Object.freeze({
      kind: "npm-global-from-github-source",
      npmPrefix,
      modifiesCodexConfiguration: false,
      modifiesProjectIndex: false,
      steps: Object.freeze(sourceInstallSteps(source))
    }),
    mutation: Object.freeze({
      performed: false,
      confirmed: apply && yes,
      executionAvailable: true
    }),
    diagnostics: Object.freeze(apply
      ? ["Apply verifies the package in isolation before a rollback-protected user-level global installation; Codex configuration remains unchanged."]
      : ["Preview only: no network, filesystem, package, Codex configuration, or project index mutation was performed."]),
    nextSteps: Object.freeze(["SymbolLattice install codex"])
  });
}

export class SourceInstallStage2Error extends Error {
  constructor(step, workspacePath, cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`GitHub source installation failed during ${step}. The diagnostic workspace was retained at ${workspacePath}. ${detail}`);
    this.name = "SourceInstallStage2Error";
    this.step = step;
    this.workspacePath = workspacePath;
    this.cause = cause;
  }
}

export class SourceInstallStage3Error extends Error {
  constructor(step, workspacePath, cause, rollback = {}) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const rollbackDetail = rollback.error instanceof Error ? ` Rollback warning: ${rollback.error.message}` : "";
    super(`GitHub source installation failed during ${step}. The diagnostic workspace was retained at ${workspacePath}. ${detail}${rollbackDetail}`);
    this.name = "SourceInstallStage3Error";
    this.step = step;
    this.workspacePath = workspacePath;
    this.rollbackPerformed = rollback.performed === true;
    this.previousVersion = rollback.previousVersion ?? null;
    this.rollbackError = rollback.error ?? null;
    this.cause = cause;
  }
}

/**
 * Executes only the isolated Stage 2 path. It never installs globally, edits an
 * Agent configuration, initializes a project index, or deletes the workspace.
 */
export async function executeSourceInstallStage2(plan, dependencies = {}) {
  if (plan?.schemaVersion !== 1 || plan.mode !== "apply" || plan.mutation?.confirmed !== true) {
    throw new Error("Stage 2 execution requires one confirmed schema v1 apply plan.");
  }
  if (plan.source?.cloneUrl !== REPOSITORY_URL || plan.installation?.kind !== "npm-global-from-github-source") {
    throw new Error("Stage 2 execution requires the official GitHub source installation plan.");
  }

  const createWorkspace = dependencies.createWorkspace ?? createTemporaryWorkspace;
  const runProcess = dependencies.runProcess ?? runExternalProcess;
  const runMcpSmoke = dependencies.runMcpSmoke ?? runStdioMcpSmoke;
  const workspacePath = await createWorkspace(plan.temporaryWorkspace.parent);
  let step = "clone-init";
  const executedSteps = [];
  const run = async (nextStep, command, args, options = {}) => {
    step = nextStep;
    const result = await runProcess(command, args, {
      step: nextStep,
      cwd: options.cwd ?? workspacePath,
      env: options.env
    });
    executedSteps.push(nextStep);
    return result;
  };

  try {
    await run("clone-init", "git", ["-C", workspacePath, "init"]);
    await run("clone-origin", "git", ["-C", workspacePath, "remote", "add", "origin", REPOSITORY_URL]);
    if (plan.source.refKind === "version-tag") {
      await run("clone-fetch", "git", [
        "-C", workspacePath, "fetch", "--depth", "1", "origin",
        `refs/tags/${plan.source.ref}:refs/tags/${plan.source.ref}`
      ]);
      await run("clone-checkout", "git", ["-C", workspacePath, "checkout", "--detach", `refs/tags/${plan.source.ref}`]);
    } else {
      await run("clone-fetch", "git", ["-C", workspacePath, "fetch", "--depth", "1", "origin", plan.source.ref]);
      await run("clone-checkout", "git", ["-C", workspacePath, "checkout", "--detach", "FETCH_HEAD"]);
    }

    const origin = (await run("verify-origin", "git", ["-C", workspacePath, "remote", "get-url", "origin"])).stdout.trim();
    if (origin !== REPOSITORY_URL) throw new Error("Cloned repository origin does not match the official URL.");
    const commit = (await run("verify-head", "git", ["-C", workspacePath, "rev-parse", "HEAD"])).stdout.trim();
    if (!FULL_COMMIT.test(commit)) throw new Error("Cloned HEAD is not a full lowercase Git commit.");
    if (plan.source.refKind === "commit" && commit !== plan.source.ref) {
      throw new Error("Cloned HEAD does not match the requested commit.");
    }
    if (plan.source.refKind === "version-tag") {
      const taggedCommit = (await run("verify-tag", "git", [
        "-C", workspacePath, "rev-parse", `refs/tags/${plan.source.ref}^{commit}`
      ])).stdout.trim();
      if (taggedCommit !== commit) throw new Error("Version tag does not peel to the checked-out HEAD.");
    } else {
      executedSteps.push("verify-tag");
    }
    const porcelain = (await run("verify-clean", "git", ["-C", workspacePath, "status", "--porcelain=v1"])).stdout;
    if (porcelain.trim().length !== 0) throw new Error("Fresh source checkout is not clean.");
    await writeFile(join(workspacePath, WORKSPACE_MARKER), `${JSON.stringify({
      schemaVersion: 1,
      repository: REPOSITORY,
      commit
    })}\n`, { encoding: "utf8", flag: "wx" });

    step = "verify-package";
    const packageJson = JSON.parse(await readFile(join(workspacePath, "package.json"), "utf8"));
    validateSourcePackage(packageJson, plan);
    await assertRegularFile(join(workspacePath, "package-lock.json"), "package-lock.json");
    if (existsSync(join(workspacePath, ".gitmodules"))) {
      throw new Error("Source installations do not accept repositories with Git submodules.");
    }
    executedSteps.push("verify-package");

    const npmCache = join(workspacePath, ".npm-cache-source-install");
    const npmEnvironment = { npm_config_cache: npmCache, npm_config_audit: "false", npm_config_fund: "false" };
    await run("install-dependencies", "npm", ["ci", "--no-audit", "--no-fund"], { env: npmEnvironment });
    await run("type-check", "npm", ["run", "check"], { env: npmEnvironment });
    await run("build", "npm", ["run", "build"], { env: npmEnvironment });
    step = "verify-build-assets";
    const builtShellAssets = await verifyShellParserAssets(
      join(workspacePath, "dist", "assets", "shell")
    );
    const builtLuaAssets = await verifyLuaParserAssets(
      join(workspacePath, "dist", "assets", "lua")
    );
    executedSteps.push("verify-build-assets");

    step = "pack-directory";
    const packDirectory = join(workspacePath, "source-install-pack");
    await mkdir(packDirectory, { recursive: false });
    executedSteps.push("pack-directory");
    const packResult = await run("pack", "npm", [
      "pack", "--json", "--silent", "--pack-destination", packDirectory
    ], { env: npmEnvironment });
    const packageEvidence = await validatePackResult(packResult.stdout, packDirectory, packageJson.version);

    const isolatedPrefix = join(workspacePath, "isolated-prefix");
    await run("isolated-install", "npm", [
      "install", "--prefix", isolatedPrefix, "--no-audit", "--no-fund", packageEvidence.tarballPath
    ], { env: npmEnvironment });
    const isolatedPackageDirectory = join(
      isolatedPrefix,
      "node_modules",
      "@hsinpu",
      "symbollattice"
    );
    step = "verify-isolated-assets";
    const isolatedShellAssets = await verifyShellParserAssets(
      join(isolatedPackageDirectory, "dist", "assets", "shell")
    );
    const isolatedLuaAssets = await verifyLuaParserAssets(
      join(isolatedPackageDirectory, "dist", "assets", "lua")
    );
    executedSteps.push("verify-isolated-assets");
    const isolatedEntry = join(
      isolatedPackageDirectory,
      "dist",
      "cli",
      "main.js"
    );
    await assertRegularFile(isolatedEntry, "isolated SymbolLattice CLI entrypoint");
    const reportedVersion = (await run("isolated-version", process.execPath, [isolatedEntry, "--version"])).stdout.trim();
    if (reportedVersion !== packageJson.version) {
      throw new Error(`Isolated CLI version mismatch: expected ${packageJson.version}, received ${reportedVersion || "<empty>"}.`);
    }
    const help = (await run("isolated-help", process.execPath, [isolatedEntry, "--help"])).stdout;
    if (!help.includes("Usage: SymbolLattice")) throw new Error("Isolated CLI help did not load the SymbolLattice command surface.");

    step = "isolated-mcp";
    const mcp = await runMcpSmoke({ entryPath: isolatedEntry, projectPath: workspacePath });
    validateMcpSmoke(mcp);
    executedSteps.push("isolated-mcp");

    return Object.freeze({
      schemaVersion: 1,
      mode: "apply",
      status: "isolated-verified",
      source: Object.freeze({
        repository: REPOSITORY,
        ref: plan.source.ref,
        commit,
        packageVersion: packageJson.version,
        clean: true
      }),
      temporaryWorkspace: Object.freeze({ path: workspacePath, retained: true }),
      package: Object.freeze({
        name: PACKAGE_NAME,
        version: packageJson.version,
        filename: packageEvidence.filename,
        tarballPath: packageEvidence.tarballPath,
        sizeBytes: packageEvidence.sizeBytes,
        sha256: packageEvidence.sha256,
        files: Object.freeze(packageEvidence.files),
        requiredFilesPresent: true,
        forbiddenFiles: Object.freeze([]),
        shellAssets: freezeAssetEvidence(builtShellAssets),
        luaAssets: freezeAssetEvidence(builtLuaAssets)
      }),
      isolatedInstallation: Object.freeze({
        prefix: isolatedPrefix,
        entryPath: isolatedEntry,
        version: reportedVersion,
        cliHelpPassed: true,
        shellAssets: freezeAssetEvidence(isolatedShellAssets),
        luaAssets: freezeAssetEvidence(isolatedLuaAssets),
        mcp: Object.freeze(mcp)
      }),
      globalInstallation: Object.freeze({ performed: false }),
      mutation: Object.freeze({ performed: true, globalInstallationPerformed: false }),
      cleanup: Object.freeze({ performed: false, retainedForStage3: true }),
      executedSteps: Object.freeze(executedSteps),
      nextSteps: Object.freeze(["Stage 3 must add global installation, verification, rollback, and bounded cleanup."])
    });
  } catch (error) {
    if (error instanceof SourceInstallStage2Error) throw error;
    throw new SourceInstallStage2Error(step, workspacePath, error);
  }
}

/**
 * Promotes a Stage 2 verified tarball to the configured user npm prefix. The
 * existing package, launchers, and npm global lock metadata are copied into the
 * retained workspace before mutation and restored on every failed deployment.
 */
export async function executeSourceInstallStage3(plan, stage2, dependencies = {}) {
  const runProcess = dependencies.runProcess ?? runExternalProcess;
  const runMcpSmoke = dependencies.runMcpSmoke ?? runStdioMcpSmoke;
  const workspacePath = stage2?.temporaryWorkspace?.path;
  let step = "verify-workspace";
  let installLock = null;
  let snapshot = null;
  let deploymentStarted = false;

  try {
    validateStage3Inputs(plan, stage2);
    const marker = await verifiedWorkspaceMarker(workspacePath, plan.temporaryWorkspace.parent, stage2.source.commit);
    step = "verify-artifact";
    const artifact = await verifiedStage2Artifact(stage2, workspacePath);
    await assertDirectory(plan.installation.npmPrefix, "npm global prefix");

    step = "install-lock";
    const lockPath = join(plan.installation.npmPrefix, INSTALL_LOCK);
    try {
      installLock = await open(lockPath, "wx");
      await installLock.writeFile(`${JSON.stringify({
        schemaVersion: 1,
        workspacePath,
        commit: stage2.source.commit
      })}\n`, "utf8");
    } catch (error) {
      throw new Error(`Another SymbolLattice source installation may be active at ${lockPath}. ${error instanceof Error ? error.message : String(error)}`);
    }

    step = "snapshot-global";
    snapshot = await captureGlobalInstallation(plan.installation.npmPrefix, workspacePath);

    step = "global-install";
    deploymentStarted = true;
    const npmEnvironment = {
      npm_config_cache: join(workspacePath, ".npm-cache-source-install"),
      npm_config_audit: "false",
      npm_config_fund: "false"
    };
    await runProcess("npm", [
      "install",
      "--global",
      "--prefix", plan.installation.npmPrefix,
      "--install-strategy=nested",
      "--no-audit",
      "--no-fund",
      artifact.tarballPath
    ], { step, cwd: workspacePath, env: npmEnvironment });

    step = "verify-global-package";
    const globalPaths = globalInstallationPaths(plan.installation.npmPrefix);
    const installedPackage = JSON.parse(await readFile(join(globalPaths.packageDirectory, "package.json"), "utf8"));
    if (installedPackage?.name !== PACKAGE_NAME || installedPackage.version !== stage2.package.version) {
      throw new Error("The globally installed package identity does not match the verified tarball.");
    }
    await assertRegularFile(globalPaths.entryPath, "global SymbolLattice CLI entrypoint");
    for (const launcher of globalPaths.launchers) {
      await assertRegularFile(launcher, "global SymbolLattice launcher");
    }
    await verifyNestedGlobalDependencies(globalPaths);

    step = "global-version";
    const reportedVersion = (await runProcess(process.execPath, [globalPaths.entryPath, "--version"], {
      step,
      cwd: workspacePath
    })).stdout.trim();
    if (reportedVersion !== stage2.package.version) {
      throw new Error(`Global CLI version mismatch: expected ${stage2.package.version}, received ${reportedVersion || "<empty>"}.`);
    }
    step = "global-help";
    const help = (await runProcess(process.execPath, [globalPaths.entryPath, "--help"], {
      step,
      cwd: workspacePath
    })).stdout;
    if (!help.includes("Usage: SymbolLattice")) throw new Error("Global CLI help did not load the SymbolLattice command surface.");

    step = "global-mcp";
    const mcp = await runMcpSmoke({ entryPath: globalPaths.entryPath, projectPath: workspacePath });
    validateMcpSmoke(mcp);

    step = "release-lock";
    await releaseInstallLock(installLock, lockPath);
    installLock = null;
    step = "cleanup";
    await removeVerifiedWorkspace(workspacePath, plan.temporaryWorkspace.parent, marker);

    return Object.freeze({
      schemaVersion: 1,
      mode: "apply",
      status: "globally-installed-verified",
      source: Object.freeze({
        repository: REPOSITORY,
        ref: stage2.source.ref,
        commit: stage2.source.commit,
        packageVersion: stage2.package.version
      }),
      package: Object.freeze({
        name: PACKAGE_NAME,
        version: stage2.package.version,
        sizeBytes: artifact.sizeBytes,
        sha256: artifact.sha256
      }),
      previousInstallation: Object.freeze({
        present: snapshot.packagePresent,
        version: snapshot.previousVersion
      }),
      globalInstallation: Object.freeze({
        performed: true,
        prefix: plan.installation.npmPrefix,
        entryPath: globalPaths.entryPath,
        version: reportedVersion,
        cliHelpPassed: true,
        mcp: Object.freeze(mcp)
      }),
      rollback: Object.freeze({ required: false, performed: false }),
      cleanup: Object.freeze({ performed: true, workspacePath }),
      codexConfiguration: Object.freeze({ modified: false }),
      projectIndex: Object.freeze({ modified: false }),
      nextSteps: Object.freeze(["Run SymbolLattice install codex separately when Codex MCP setup is desired."])
    });
  } catch (error) {
    let rollback = { performed: false, previousVersion: snapshot?.previousVersion ?? null, error: null };
    if (deploymentStarted && snapshot !== null) {
      rollback = await restoreGlobalInstallation(plan.installation.npmPrefix, workspacePath, snapshot, runProcess);
    }
    if (installLock !== null) {
      try {
        await releaseInstallLock(installLock, join(plan.installation.npmPrefix, INSTALL_LOCK));
      } catch (lockError) {
        rollback.error ??= lockError;
      }
    }
    if (error instanceof SourceInstallStage3Error) throw error;
    throw new SourceInstallStage3Error(step, workspacePath ?? "<unknown>", error, rollback);
  }
}

function validateStage3Inputs(plan, stage2) {
  if (plan?.schemaVersion !== 1 || plan.mode !== "apply" || plan.mutation?.confirmed !== true) {
    throw new Error("Stage 3 execution requires one confirmed schema v1 apply plan.");
  }
  if (plan.source?.cloneUrl !== REPOSITORY_URL || plan.installation?.kind !== "npm-global-from-github-source") {
    throw new Error("Stage 3 execution requires the official GitHub source installation plan.");
  }
  if (
    stage2?.schemaVersion !== 1 ||
    stage2.status !== "isolated-verified" ||
    stage2.source?.repository !== REPOSITORY ||
    stage2.source?.ref !== plan.source.ref ||
    !FULL_COMMIT.test(stage2.source?.commit ?? "") ||
    stage2.package?.name !== PACKAGE_NAME ||
    stage2.package?.version !== stage2.source?.packageVersion ||
    stage2.package?.requiredFilesPresent !== true ||
    !Array.isArray(stage2.package?.forbiddenFiles) ||
    stage2.package.forbiddenFiles.length !== 0 ||
    stage2.isolatedInstallation?.version !== stage2.package.version ||
    stage2.isolatedInstallation?.cliHelpPassed !== true ||
    stage2.globalInstallation?.performed !== false ||
    stage2.cleanup?.retainedForStage3 !== true
  ) {
    throw new Error("Stage 3 requires one complete, internally consistent Stage 2 isolated verification receipt.");
  }
  if (plan.source.refKind === "commit" && stage2.source.commit !== plan.source.ref) {
    throw new Error("Stage 2 commit does not match the requested fixed commit.");
  }
}

async function verifiedWorkspaceMarker(workspacePath, temporaryRoot, expectedCommit) {
  if (typeof workspacePath !== "string" || !isAbsolute(workspacePath)) {
    throw new Error("Stage 2 workspace path must be absolute.");
  }
  const workspace = resolve(workspacePath);
  const root = resolve(temporaryRoot);
  const child = relative(root, workspace);
  if (
    child.length === 0 ||
    child.startsWith(`..${parse(workspace).root === "\\" ? "\\" : "/"}`) ||
    child === ".." ||
    isAbsolute(child) ||
    dirname(child) !== "." ||
    !child.startsWith("SymbolLattice-install-")
  ) {
    throw new Error("Stage 2 workspace is not one direct, uniquely named child of the approved temporary root.");
  }
  let marker;
  try {
    marker = JSON.parse(await readFile(join(workspace, WORKSPACE_MARKER), "utf8"));
  } catch {
    throw new Error("Stage 2 workspace marker is missing or invalid; refusing installation and cleanup.");
  }
  if (
    marker?.schemaVersion !== 1 ||
    marker.repository !== REPOSITORY ||
    marker.commit !== expectedCommit
  ) {
    throw new Error("Stage 2 workspace marker does not match the verified source receipt.");
  }
  return marker;
}

async function verifiedStage2Artifact(stage2, workspacePath) {
  const expectedPath = resolve(workspacePath, "source-install-pack", stage2.package.filename);
  const receiptPath = resolve(stage2.package.tarballPath);
  if (receiptPath !== expectedPath || dirname(receiptPath) !== resolve(workspacePath, "source-install-pack")) {
    throw new Error("Stage 2 tarball path is outside the verified workspace pack directory.");
  }
  const bytes = await readFile(receiptPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== stage2.package.sizeBytes || sha256 !== stage2.package.sha256) {
    throw new Error("Stage 2 tarball bytes changed after isolated verification.");
  }
  return { tarballPath: receiptPath, sizeBytes: bytes.byteLength, sha256 };
}

async function assertDirectory(path, label) {
  let directoryStatus;
  try {
    directoryStatus = await stat(path);
  } catch {
    throw new Error(`Required ${label} does not exist: ${path}.`);
  }
  if (!directoryStatus.isDirectory()) throw new Error(`Required ${label} is not a directory: ${path}.`);
}

function globalInstallationPaths(prefix) {
  const globalRoot = process.platform === "win32"
    ? join(prefix, "node_modules")
    : join(prefix, "lib", "node_modules");
  const executableRoot = process.platform === "win32" ? prefix : join(prefix, "bin");
  const packageDirectory = join(globalRoot, "@hsinpu", "symbollattice");
  return {
    globalRoot,
    packageDirectory,
    packageScope: dirname(packageDirectory),
    entryPath: join(packageDirectory, "dist", "cli", "main.js"),
    launchers: process.platform === "win32"
      ? ["SymbolLattice", "SymbolLattice.cmd", "SymbolLattice.ps1"].map((name) => join(executableRoot, name))
      : [join(executableRoot, "SymbolLattice")],
    npmLock: join(globalRoot, ".package-lock.json")
  };
}

async function captureGlobalInstallation(prefix, workspacePath) {
  const paths = globalInstallationPaths(prefix);
  await assertDirectory(paths.globalRoot, "npm global node_modules directory");
  const backupRoot = join(workspacePath, "global-install-backup");
  await mkdir(backupRoot, { recursive: false });
  const candidates = [
    { id: "package", path: paths.packageDirectory },
    ...paths.launchers.map((path, index) => ({ id: `launcher-${index}`, path })),
    { id: "npm-lock", path: paths.npmLock }
  ];
  const entries = [];
  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) continue;
    const backupPath = join(backupRoot, candidate.id);
    await cp(candidate.path, backupPath, {
      recursive: true,
      force: false,
      preserveTimestamps: true,
      verbatimSymlinks: true
    });
    entries.push({ ...candidate, backupPath });
  }
  let previousVersion = null;
  const packagePresent = existsSync(paths.packageDirectory);
  if (packagePresent) {
    const previousPackage = JSON.parse(await readFile(join(paths.packageDirectory, "package.json"), "utf8"));
    if (previousPackage?.name !== PACKAGE_NAME || typeof previousPackage.version !== "string") {
      throw new Error("Existing global package directory is not a valid SymbolLattice installation.");
    }
    previousVersion = previousPackage.version;
    await verifyNestedGlobalDependencies(paths);
  }
  return {
    backupRoot,
    entries,
    packagePresent,
    previousVersion,
    packageScopePresent: existsSync(paths.packageScope),
    paths
  };
}

async function verifyNestedGlobalDependencies(paths) {
  const installedPackage = JSON.parse(await readFile(join(paths.packageDirectory, "package.json"), "utf8"));
  const dependencyNames = Object.keys(installedPackage.dependencies ?? {});
  const missing = [];
  for (const dependency of dependencyNames) {
    const dependencyPath = dependency.startsWith("@")
      ? join(paths.packageDirectory, "node_modules", ...dependency.split("/"))
      : join(paths.packageDirectory, "node_modules", dependency);
    if (!existsSync(dependencyPath)) missing.push(dependency);
  }
  if (missing.length > 0) {
    throw new Error(`Global install did not keep dependencies inside the bounded package directory: ${missing.join(", ")}.`);
  }
}

async function restoreGlobalInstallation(prefix, workspacePath, snapshot, runProcess) {
  let uninstallError = null;
  try {
    await runProcess("npm", [
      "uninstall", "--global", "--prefix", prefix, "--no-audit", "--no-fund", PACKAGE_NAME
    ], {
      step: "rollback-uninstall",
      cwd: workspacePath,
      env: {
        npm_config_cache: join(workspacePath, ".npm-cache-source-install"),
        npm_config_audit: "false",
        npm_config_fund: "false"
      }
    });
  } catch (error) {
    uninstallError = error;
  }
  try {
    for (const path of [snapshot.paths.packageDirectory, ...snapshot.paths.launchers, snapshot.paths.npmLock]) {
      await rm(path, { recursive: true, force: true });
    }
    for (const entry of snapshot.entries) {
      await mkdir(dirname(entry.path), { recursive: true });
      await cp(entry.backupPath, entry.path, {
        recursive: true,
        force: false,
        preserveTimestamps: true,
        verbatimSymlinks: true
      });
    }
    if (!snapshot.packageScopePresent && existsSync(snapshot.paths.packageScope)) {
      const scopeEntries = await readdir(snapshot.paths.packageScope);
      if (scopeEntries.length === 0) await rm(snapshot.paths.packageScope, { recursive: true, force: false });
    }
    return { performed: true, previousVersion: snapshot.previousVersion, error: uninstallError };
  } catch (error) {
    return {
      performed: false,
      previousVersion: snapshot.previousVersion,
      error: new Error(`Filesystem rollback failed. ${error instanceof Error ? error.message : String(error)}`)
    };
  }
}

async function releaseInstallLock(handle, lockPath) {
  await handle.close();
  await rm(lockPath, { force: false });
}

async function removeVerifiedWorkspace(workspacePath, temporaryRoot, expectedMarker) {
  const marker = await verifiedWorkspaceMarker(workspacePath, temporaryRoot, expectedMarker.commit);
  if (JSON.stringify(marker) !== JSON.stringify(expectedMarker)) {
    throw new Error("Workspace marker changed before cleanup; refusing recursive deletion.");
  }
  await rm(resolve(workspacePath), { recursive: true, force: false });
}

function sourceIdentity(ref) {
  if (typeof ref !== "string") {
    throw new Error("Source ref must be a version tag or full lowercase 40-character Git commit.");
  }
  const tag = VERSION_TAG.exec(ref);
  if (tag !== null) {
    return {
      ref,
      refKind: "version-tag",
      expectedVersion: ref.slice(1),
      verification: "resolve-tag-then-match-package-version-and-head"
    };
  }
  if (FULL_COMMIT.test(ref)) {
    return {
      ref,
      refKind: "commit",
      expectedVersion: null,
      verification: "match-head-exactly"
    };
  }
  throw new Error("Source ref must be a version tag or full lowercase 40-character Git commit.");
}

function validateNodeVersion(version) {
  if (typeof version !== "string") {
    throw new Error(`Node.js ${NODE_RANGE} is required.`);
  }
  const match = NODE_VERSION.exec(version);
  if (match === null) {
    throw new Error(`Node.js version must be a stable x.y.z value within ${NODE_RANGE}.`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major < 22 || major >= 25 || (major === 22 && minor < 13)) {
    throw new Error(`Node.js ${NODE_RANGE} is required; received ${version}.`);
  }
  return version;
}

function validateAbsoluteDirectory(value, label) {
  if (typeof value !== "string" || value.trim().length === 0 || !isAbsolute(value)) {
    throw new Error(`The ${label} must be an absolute path.`);
  }
  const normalized = resolve(value);
  if (normalized === parse(normalized).root) {
    throw new Error(`The ${label} cannot be a filesystem root.`);
  }
  return normalized;
}

async function createTemporaryWorkspace(parent) {
  let rootStatus;
  try {
    rootStatus = await stat(parent);
  } catch {
    throw new Error(`Temporary root does not exist: ${parent}.`);
  }
  if (!rootStatus.isDirectory()) throw new Error(`Temporary root is not a directory: ${parent}.`);
  return mkdtemp(join(parent, "SymbolLattice-install-"));
}

function validateSourcePackage(packageJson, plan) {
  if (packageJson?.name !== PACKAGE_NAME) throw new Error(`Source package must be ${PACKAGE_NAME}.`);
  if (packageJson.private !== true) throw new Error("Source package must remain private because npm Registry publication is disabled.");
  if (packageJson.repository?.url !== REPOSITORY_PACKAGE_URL) {
    throw new Error("Source package repository identity does not match HsinPu/SymbolLattice.");
  }
  if (packageJson.engines?.node !== NODE_RANGE) {
    throw new Error(`Source package Node.js contract must be ${NODE_RANGE}.`);
  }
  if (typeof packageJson.version !== "string" || VERSION_TAG.exec(`v${packageJson.version}`) === null) {
    throw new Error("Source package version is not valid SemVer.");
  }
  if (plan.source.expectedVersion !== null && packageJson.version !== plan.source.expectedVersion) {
    throw new Error("Version tag does not exactly match package.json version.");
  }
}

async function assertRegularFile(path, label) {
  let fileStatus;
  try {
    fileStatus = await stat(path);
  } catch {
    throw new Error(`Required ${label} is missing.`);
  }
  if (!fileStatus.isFile()) throw new Error(`Required ${label} is not a regular file.`);
}

async function validatePackResult(stdout, packDirectory, expectedVersion) {
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new Error("npm pack did not return valid JSON evidence.");
  }
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error("npm pack must return exactly one package artifact.");
  }
  const packed = payload[0];
  if (packed?.name !== PACKAGE_NAME || packed.version !== expectedVersion) {
    throw new Error("npm pack package identity does not match the verified source.");
  }
  if (typeof packed.filename !== "string" || !/^[A-Za-z0-9._-]+\.tgz$/u.test(packed.filename)) {
    throw new Error("npm pack returned an unsafe artifact filename.");
  }
  if (!Array.isArray(packed.files)) throw new Error("npm pack did not report its file manifest.");
  const files = packed.files.map((entry) => typeof entry?.path === "string" ? entry.path : "").sort(compareText);
  if (files.some((path) => path.length === 0)) throw new Error("npm pack returned an invalid file entry.");
  const missing = REQUIRED_PACKAGE_FILES.filter((path) => !files.includes(path));
  if (missing.length > 0) throw new Error(`npm pack is missing required files: ${missing.join(", ")}.`);
  const forbiddenFiles = files.filter(isForbiddenPackagePath);
  if (forbiddenFiles.length > 0) {
    throw new Error(`npm pack contains forbidden source-install files: ${forbiddenFiles.join(", ")}.`);
  }
  const tarballPath = join(packDirectory, packed.filename);
  await assertRegularFile(tarballPath, "npm pack tarball");
  const tarball = await readFile(tarballPath);
  return {
    filename: packed.filename,
    tarballPath,
    sizeBytes: tarball.byteLength,
    sha256: createHash("sha256").update(tarball).digest("hex"),
    files
  };
}

function isForbiddenPackagePath(path) {
  if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/u.test(path)) return true;
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return true;
  return [".git", ".SymbolLattice", "node_modules", "scripts", "src", "test"].includes(segments[0]);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freezeAssetEvidence(evidence) {
  return Object.freeze({
    manifestSha256: evidence.manifestSha256,
    aggregateSha256: evidence.aggregateSha256,
    files: Object.freeze([...evidence.files])
  });
}

function validateMcpSmoke(mcp) {
  if (
    mcp === null ||
    typeof mcp !== "object" ||
    !Number.isInteger(mcp.toolCount) ||
    mcp.toolCount <= 0 ||
    !Array.isArray(mcp.toolNames) ||
    mcp.toolNames.length !== mcp.toolCount ||
    mcp.toolNames.some((name) => typeof name !== "string" || !name.startsWith("SymbolLattice_"))
  ) {
    throw new Error("Isolated MCP smoke did not return a valid SymbolLattice tool surface.");
  }
}

async function runExternalProcess(command, args, context = {}) {
  const invocation = command === "npm" && process.platform === "win32"
    ? windowsNpmInvocation(args)
    : { command, args };
  try {
    const result = await execFileAsync(invocation.command, [...invocation.args], {
      cwd: context.cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        NO_COLOR: "1",
        npm_config_audit: "false",
        npm_config_fund: "false",
        ...(context.env ?? {})
      },
      maxBuffer: PROCESS_OUTPUT_BYTES,
      timeout: PROCESS_TIMEOUT_MS,
      windowsHide: true
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error;
    const stdout = typeof failure?.stdout === "string" ? failure.stdout.slice(-2_000) : "";
    const stderr = typeof failure?.stderr === "string" ? failure.stderr.slice(-2_000) : "";
    const detail = [stdout, stderr].filter((value) => value.length > 0).join(" ");
    throw new Error(
      `Subprocess ${context.step ?? command} failed${failure?.code === undefined ? "" : ` with code ${String(failure.code)}`}.${detail.length === 0 ? "" : ` ${detail}`}`
    );
  }
}

function windowsNpmInvocation(args) {
  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  ].filter((candidate) => typeof candidate === "string" && /npm-cli\.js$/iu.test(candidate));
  const npmCli = candidates.find((candidate) => existsSync(candidate));
  if (npmCli === undefined) {
    throw new Error("Unable to locate npm-cli.js safely on Windows; refusing to invoke npm through a shell.");
  }
  return { command: process.execPath, args: [npmCli, ...args] };
}

async function runStdioMcpSmoke({ entryPath, projectPath }) {
  const child = spawn(process.execPath, [
    entryPath,
    "serve",
    "--mcp",
    "--no-auto-sync",
    "--project",
    projectPath
  ], {
    cwd: projectPath,
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  let stdoutBuffer = "";
  let stderr = "";
  let exited = false;
  const pending = new Map();
  const rejectPending = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4_000);
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    for (;;) {
      const newline = stdoutBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = stdoutBuffer.slice(0, newline).replace(/\r$/u, "");
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (line.length === 0) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        rejectPending(new Error("Isolated MCP server wrote invalid JSON-RPC output."));
        continue;
      }
      const request = pending.get(message.id);
      if (request !== undefined) {
        pending.delete(message.id);
        clearTimeout(request.timeout);
        if (message.error !== undefined) request.reject(new Error(`MCP request failed: ${JSON.stringify(message.error)}`));
        else request.resolve(message.result);
      }
    }
  });
  child.once("error", (error) => rejectPending(error));
  child.once("exit", (code, signal) => {
    exited = true;
    if (pending.size > 0) rejectPending(new Error(`Isolated MCP server exited early (${String(code ?? signal)}). ${stderr}`));
  });

  let nextId = 1;
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const request = (method, params) => new Promise((resolveRequest, rejectRequest) => {
    const id = nextId;
    nextId += 1;
    const timeout = setTimeout(() => {
      pending.delete(id);
      rejectRequest(new Error(`Timed out waiting for isolated MCP ${method}. ${stderr}`));
    }, MCP_TIMEOUT_MS);
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timeout });
    send({ jsonrpc: "2.0", id, method, params });
  });

  try {
    const initialized = await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "SymbolLattice-source-install-smoke", version: "1.0.0" }
    });
    if (typeof initialized?.protocolVersion !== "string") throw new Error("Isolated MCP initialize response is incomplete.");
    send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    const listed = await request("tools/list", {});
    const toolNames = Array.isArray(listed?.tools) ? listed.tools.map((tool) => tool?.name) : [];
    return {
      protocolVersion: initialized.protocolVersion,
      toolCount: toolNames.length,
      toolNames
    };
  } finally {
    child.stdin.end();
    if (!exited) child.kill();
  }
}

function sourceInstallSteps(source) {
  return [
    step("clone", "Clone the official repository into one uniquely named temporary directory.", ["git", "clone", "--filter=blob:none", "--no-checkout", REPOSITORY_URL]),
    step("verify-source", `Resolve and verify ${source.refKind === "commit" ? "the exact commit" : "the version tag, HEAD, and package version"}.`, ["git", "rev-parse", "HEAD"]),
    step("install-dependencies", "Install lockfile-pinned build dependencies without audit or funding network calls.", ["npm", "ci", "--no-audit", "--no-fund"]),
    step("type-check", "Run the repository type-check gate.", ["npm", "run", "check"]),
    step("build", "Build a clean dist directory.", ["npm", "run", "build"]),
    step("pack", "Create and validate one local npm tarball.", ["npm", "pack", "--json"]),
    step("isolated-install", "Install the tarball into a disposable npm prefix.", ["npm", "install", "--prefix", "<isolated-prefix>", "<tarball>"]),
    step("isolated-smoke", "Verify the isolated CLI version, help, and MCP startup.", ["<isolated-SymbolLattice>", "--version"]),
    step("global-install", "Install the already-verified tarball into the current user's npm global prefix.", ["npm", "install", "--global", "<tarball>"]),
    step("global-smoke", "Verify the globally installed CLI before deleting temporary files.", ["SymbolLattice", "--version"])
  ];
}

function step(id, description, command) {
  return Object.freeze({ id, description, command: Object.freeze(command) });
}

function resolveNpmPrefix() {
  try {
    const invocation = process.platform === "win32"
      ? windowsNpmInvocation(["prefix", "--global"])
      : { command: "npm", args: ["prefix", "--global"] };
    return execFileSync(invocation.command, invocation.args, {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1", npm_config_audit: "false", npm_config_fund: "false" },
      windowsHide: true,
      timeout: 10_000
    }).trim();
  } catch {
    throw new Error("Unable to determine the npm global prefix. Confirm that npm is installed and available on PATH.");
  }
}

function renderPlan(plan) {
  const lines = [
    `SymbolLattice GitHub source install ${plan.mode}`,
    `Source: ${plan.source.cloneUrl} @ ${plan.source.ref}`,
    `Node.js: ${plan.requirements.node.version} (${plan.requirements.node.range})`,
    `Global prefix: ${plan.installation.npmPrefix}`,
    `Temporary parent: ${plan.temporaryWorkspace.parent}`,
    "Planned steps:"
  ];
  for (const [index, planned] of plan.installation.steps.entries()) {
    lines.push(`  ${index + 1}. ${planned.description}`);
  }
  lines.push(...plan.diagnostics);
  return `${lines.join("\n")}\n`;
}

function renderExecution(result) {
  return [
    "SymbolLattice GitHub source install",
    `Status: ${result.status}`,
    `Source: ${result.source.ref} -> ${result.source.commit}`,
    `Package: ${result.package.name}@${result.package.version}`,
    `Global CLI: ${result.globalInstallation.version}`,
    `MCP tools: ${result.globalInstallation.mcp.toolCount}`,
    `Global prefix: ${result.globalInstallation.prefix}`,
    `Temporary workspace cleaned: ${String(result.cleanup.performed)}`,
    result.nextSteps[0],
    ""
  ].join("\n");
}

function isMainModule() {
  if (process.argv[1] === undefined) return false;
  return resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
}

if (isMainModule()) {
  try {
    const args = parseSourceInstallArguments(process.argv.slice(2));
    const plan = createSourceInstallPlan({
      ...args,
      nodeVersion: process.versions.node,
      npmPrefix: args.npmPrefix ?? resolveNpmPrefix()
    });
    const result = plan.mode === "apply"
      ? await executeSourceInstallStage3(plan, await executeSourceInstallStage2(plan))
      : plan;
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : plan.mode === "apply" ? renderExecution(result) : renderPlan(plan));
  } catch (error) {
    process.stderr.write(`github-source-install: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
