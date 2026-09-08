import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runExternalProcess, runStdioMcpSmoke, validatePackResult } from "../install/github-source-install.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === "--output" && args[1]), "Usage: verify-local-pack.mjs [--output report.json]");
const workspace = await mkdtemp(join(tmpdir(), "symbollattice-ci-pack-"));
const cache = join(workspace, "npm-cache");
const prefix = join(workspace, "isolated");
const packDirectory = join(workspace, "pack");
const npmEnvironment = { npm_config_cache: cache, npm_config_ignore_scripts: "false" };
let report;
try {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(manifest.name, "@hsinpu/symbollattice");
  assert.match(manifest.scripts.prepack, /npm run build/u);
  assert.match(manifest.scripts.prepack, /verify:language-depth/u);
  await mkdir(packDirectory);
  console.log("Verifying real npm pack with prepack enabled...");
  const packedOutput = await runExternalProcess("npm", ["pack", "--json", "--pack-destination", packDirectory], {
    cwd: root, env: npmEnvironment, step: "ci-pack"
  });
  const packed = await validatePackResult(packedOutput.stdout, packDirectory, manifest.version);
  console.log("Verifying isolated tarball install and CLI/MCP startup...");
  await runExternalProcess("npm", ["install", "--prefix", prefix, "--no-audit", "--no-fund", packed.tarballPath], {
    cwd: workspace, env: npmEnvironment, step: "ci-isolated-install"
  });
  const entryPath = join(prefix, "node_modules", "@hsinpu", "symbollattice", "dist", "cli", "main.js");
  const version = await runExternalProcess(process.execPath, [entryPath, "--version"], { cwd: workspace, step: "ci-version" });
  assert.equal(version.stdout.trim(), manifest.version);
  const help = await runExternalProcess(process.execPath, [entryPath, "--help"], { cwd: workspace, step: "ci-help" });
  assert.match(help.stdout, /Usage: SymbolLattice/u);
  const mcp = await runStdioMcpSmoke({ entryPath, projectPath: workspace });
  assert.deepEqual(mcp.toolNames, ["SymbolLattice_explore"]);
  report = {
    schemaVersion: 1,
    verification: "local-pack-isolated-install",
    platform: process.platform,
    nodeVersion: process.versions.node,
    productVersion: manifest.version,
    commit: execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim(),
    prepackEnabled: true,
    package: { sizeBytes: packed.sizeBytes, sha256: packed.sha256, fileCount: packed.files.length },
    cliVersionPassed: true,
    cliHelpPassed: true,
    mcp,
    globalInstallationModified: false,
    passed: true
  };
} finally {
  assert.equal(dirname(workspace), resolve(tmpdir()));
  assert(workspace.startsWith(join(tmpdir(), "symbollattice-ci-pack-")));
  await rm(workspace, { recursive: true, force: true });
}
report.workspaceRemoved = true;
if (args.length === 2) await writeFile(resolve(args[1]), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
