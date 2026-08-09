import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { cpus, platform, arch, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseCodeGraphCallees,
  parseSymbolLatticeCallees,
  parseSymbolLatticeIndexPerformance
} from "../dist/benchmark/comparison-adapters.js";
import { scoreComparisonCases } from "../dist/benchmark/comparison-metrics.js";
import { summarizeOperationSamples } from "../dist/benchmark/operation-samples.js";
import { summarizeReadQueryExecutions } from "../dist/benchmark/read-query-metrics.js";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const DEFAULT_MANIFEST = join(PROJECT_ROOT, "benchmark", "codegraph-comparison", "manifest.json");
const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 180_000;
const MCP_REQUEST_TIMEOUT_MS = 30_000;
const MCP_REQUEST_COUNT = 8;
const MCP_CONCURRENCY = 4;
const NO_OP_SYNC_SAMPLE_COUNT = 5;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArguments(argv) {
  const result = {
    manifestPath: DEFAULT_MANIFEST,
    workspacePath: resolve(PROJECT_ROOT, ".."),
    outputPath: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    requireCondition(["--manifest", "--workspace", "--output"].includes(flag), `Unknown argument: ${flag}`);
    requireCondition(value !== undefined && !value.startsWith("--"), `Missing value for ${flag}`);
    index += 1;
    if (flag === "--manifest") result.manifestPath = resolve(value);
    if (flag === "--workspace") result.workspacePath = resolve(value);
    if (flag === "--output") result.outputPath = resolve(value);
  }
  return result;
}

function requireText(value, label) {
  requireCondition(typeof value === "string" && value.length > 0 && value === value.trim(), `${label} must be non-empty trimmed text.`);
  return value;
}

function requireRelativePath(value, label) {
  const text = requireText(value, label);
  requireCondition(!isAbsolute(text), `${label} must be relative.`);
  const segments = text.replaceAll("\\", "/").split("/");
  requireCondition(!segments.some((segment) => segment === "" || segment === "." || segment === ".."), `${label} is unsafe.`);
  return text;
}

function parseManifest(value) {
  requireCondition(value && typeof value === "object" && !Array.isArray(value), "Comparison manifest must be an object.");
  requireCondition(value.schemaVersion === 1, "Comparison manifest schemaVersion must be 1.");
  const benchmarkId = requireText(value.benchmarkId, "benchmarkId");
  requireCondition(Array.isArray(value.projects) && value.projects.length > 0, "Comparison manifest requires projects.");
  requireCondition(Array.isArray(value.cases) && value.cases.length > 0, "Comparison manifest requires cases.");

  const projectIds = new Set();
  const projects = value.projects.map((project, index) => {
    requireCondition(project && typeof project === "object" && !Array.isArray(project), `project ${index} must be an object.`);
    const id = requireText(project.id, `project ${index} id`);
    requireCondition(!projectIds.has(id), `Duplicate project id: ${id}`);
    projectIds.add(id);
    return {
      id,
      repository: requireText(project.repository, `project ${id} repository`),
      workspacePath: requireRelativePath(project.workspacePath, `project ${id} workspacePath`),
      mutationPath: requireRelativePath(project.mutationPath, `project ${id} mutationPath`)
    };
  });

  const caseIds = new Set();
  const cases = value.cases.map((item, index) => {
    requireCondition(item && typeof item === "object" && !Array.isArray(item), `case ${index} must be an object.`);
    const id = requireText(item.id, `case ${index} id`);
    requireCondition(!caseIds.has(id), `Duplicate case id: ${id}`);
    caseIds.add(id);
    const projectId = requireText(item.projectId, `case ${id} projectId`);
    requireCondition(projectIds.has(projectId), `Case ${id} uses unknown project ${projectId}.`);
    requireCondition(Array.isArray(item.expectedTargets), `Case ${id} expectedTargets must be an array.`);
    const expectedTargets = item.expectedTargets.map((target, targetIndex) => requireText(target, `case ${id} target ${targetIndex}`));
    requireCondition(new Set(expectedTargets).size === expectedTargets.length, `Case ${id} has duplicate expected targets.`);
    return {
      id,
      projectId,
      language: requireText(item.language, `case ${id} language`),
      reference: requireText(item.reference, `case ${id} reference`),
      expectedTargets: [...expectedTargets].sort((left, right) => left.localeCompare(right, "en"))
    };
  });
  return { schemaVersion: 1, benchmarkId, projects, cases };
}

function milliseconds(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function rounded(value) {
  return Math.round(value * 1_000) / 1_000;
}

function appendCapture(current, chunk, label) {
  const next = current + chunk;
  requireCondition(Buffer.byteLength(next) <= MAX_CAPTURE_BYTES, `${label} exceeded ${MAX_CAPTURE_BYTES} bytes.`);
  return next;
}

async function windowsWorkingSet(pid) {
  const result = await runCommand(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64`],
    { timeoutMs: 5_000, sampleMemory: false, allowFailure: true }
  );
  const value = Number(result.stdout.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function linuxWorkingSet(pid) {
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    const match = /^VmRSS:\s+(\d+)\s+kB$/mu.exec(status);
    return match?.[1] === undefined ? null : Number(match[1]) * 1024;
  } catch {
    return null;
  }
}

async function workingSet(pid) {
  if (process.platform === "win32") return windowsWorkingSet(pid);
  if (process.platform === "linux") return linuxWorkingSet(pid);
  return null;
}

async function runCommand(command, args, options = {}) {
  const startedAt = process.hrtime.bigint();
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let peakRssBytes = null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout = appendCapture(stdout, chunk, `${command} stdout`); });
  child.stderr.on("data", (chunk) => { stderr = appendCapture(stderr, chunk, `${command} stderr`); });

  let sampling = options.sampleMemory !== false;
  const sample = async () => {
    while (sampling && child.pid !== undefined && child.exitCode === null) {
      const bytes = await workingSet(child.pid);
      if (bytes !== null) peakRssBytes = Math.max(peakRssBytes ?? 0, bytes);
      await new Promise((resolve_) => setTimeout(resolve_, 200));
    }
  };
  const sampler = sample();
  const timeoutMs = options.timeoutMs ?? PROCESS_TIMEOUT_MS;
  const timeout = setTimeout(() => child.kill(), timeoutMs);
  const result = await new Promise((resolve_, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve_({ code, signal }));
  });
  clearTimeout(timeout);
  sampling = false;
  await sampler;
  const execution = {
    command,
    args,
    exitCode: result.code,
    signal: result.signal,
    durationMs: rounded(milliseconds(startedAt)),
    peakRssBytes,
    stdout,
    stderr
  };
  if (!options.allowFailure && result.code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.code ?? result.signal}): ${stderr || stdout}`);
  }
  return execution;
}

async function gitOutput(repositoryPath, args) {
  const result = await runCommand(
    "git",
    ["-c", `safe.directory=${repositoryPath.replaceAll("\\", "/")}`, ...args],
    { cwd: repositoryPath, sampleMemory: false }
  );
  return result.stdout;
}

function safeDestination(root, relativePath) {
  const normalized = relativePath.replaceAll("/", sep);
  const destination = resolve(root, normalized);
  const back = relative(root, destination);
  requireCondition(back !== "" && !back.startsWith(`..${sep}`) && back !== ".." && !isAbsolute(back), `Unsafe repository path: ${relativePath}`);
  return destination;
}

async function copyWorktree(repositoryPath, destination) {
  const output = await gitOutput(repositoryPath, ["ls-files", "-co", "--exclude-standard", "-z"]);
  const paths = [...new Set(output.split("\u0000").filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
  for (const filePath of paths) {
    requireRelativePath(filePath, "Git worktree path");
    const source = safeDestination(repositoryPath, filePath);
    const stat = await lstat(source);
    requireCondition(stat.isFile(), `Benchmark snapshots accept regular files only: ${filePath}`);
    const target = safeDestination(destination, filePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  return paths.length;
}

async function resolveCodeGraphLaunch(workspacePath) {
  const checkoutRoot = join(workspacePath, "codegraph");
  const checkoutEntrypoint = join(checkoutRoot, "dist", "bin", "codegraph.js");
  try {
    await access(checkoutEntrypoint);
    const checkoutPackage = JSON.parse(await readFile(join(checkoutRoot, "package.json"), "utf8"));
    return {
      command: process.execPath,
      prefixArgs: [checkoutEntrypoint],
      expectedVersion: requireText(checkoutPackage.version, "CodeGraph checkout version"),
      source: "workspace-checkout"
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const configured = process.env.CODEGRAPH_BIN;
  if (configured !== undefined) {
    return { command: configured, prefixArgs: [], expectedVersion: null, source: "CODEGRAPH_BIN" };
  }
  if (process.platform !== "win32") {
    return { command: "codegraph", prefixArgs: [], expectedVersion: null, source: "PATH" };
  }
  const located = await runCommand(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", "(Get-Command codegraph -ErrorAction Stop).Source"],
    { sampleMemory: false }
  );
  const commandPath = located.stdout.split(/\r?\n/u).map((value) => value.trim()).find(Boolean);
  requireCondition(commandPath !== undefined, "PowerShell did not locate codegraph.");
  if (!commandPath.toLowerCase().endsWith(".cmd")) {
    return { command: commandPath, prefixArgs: [], expectedVersion: null, source: "PATH" };
  }
  const installationRoot = resolve(dirname(commandPath), "..");
  const nodePath = join(installationRoot, "node.exe");
  const entrypointPath = join(installationRoot, "lib", "dist", "bin", "codegraph.js");
  await access(nodePath);
  await access(entrypointPath);
  return { command: nodePath, prefixArgs: [entrypointPath], expectedVersion: null, source: "PATH" };
}

async function engineDefinitions(workspacePath) {
  const symbolCli = join(PROJECT_ROOT, "dist", "cli", "main.js");
  const codeGraphLaunch = await resolveCodeGraphLaunch(workspacePath);
  return [
    {
      id: "symbol-lattice",
      command: process.execPath,
      initArgs: (projectPath) => [symbolCli, "init", projectPath, "--json"],
      syncArgs: (projectPath) => [symbolCli, "sync", projectPath, "--json"],
      queryArgs: (projectPath, reference) => [symbolCli, "callees", reference, "--project", projectPath, "--json"],
      parseQuery: parseSymbolLatticeCallees,
      parseOperationPerformance: parseSymbolLatticeIndexPerformance,
      mcpArgs: (projectPath) => [symbolCli, "serve", "--mcp", "--project", projectPath, "--no-auto-sync"],
      mcpTool: "symbol_lattice_node",
      mcpArguments: (projectPath, reference) => ({ projectPath, query: reference, sourceSessionMode: "deduplicate" }),
      env: {}
    },
    {
      id: "codegraph",
      command: codeGraphLaunch.command,
      launchSource: codeGraphLaunch.source,
      expectedVersion: codeGraphLaunch.expectedVersion,
      versionArgs: [...codeGraphLaunch.prefixArgs, "--version"],
      initArgs: (projectPath) => [...codeGraphLaunch.prefixArgs, "init", projectPath],
      syncArgs: (projectPath) => [...codeGraphLaunch.prefixArgs, "sync", projectPath],
      queryArgs: (projectPath, reference) => [...codeGraphLaunch.prefixArgs, "callees", reference, "--path", projectPath, "--json"],
      parseQuery: parseCodeGraphCallees,
      parseOperationPerformance: null,
      mcpArgs: (projectPath) => [...codeGraphLaunch.prefixArgs, "serve", "--mcp", "--path", projectPath],
      mcpTool: "codegraph_node",
      mcpArguments: (projectPath, reference) => ({ projectPath, symbol: reference, includeCode: false }),
      env: {
        CODEGRAPH_NO_DAEMON: "1",
        CODEGRAPH_MCP_TOOLS: "node",
        CODEGRAPH_TELEMETRY: "0",
        DO_NOT_TRACK: "1",
        NO_COLOR: "1",
        FORCE_COLOR: "0"
      }
    }
  ];
}

async function runMcpBatch(engine, projectPath, cases) {
  const child = spawn(engine.command, engine.mcpArgs(projectPath), {
    cwd: projectPath,
    env: { ...process.env, ...engine.env },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let buffer = "";
  let stderr = "";
  let peakRssBytes = null;
  let sampling = true;
  const pending = new Map();
  const sample = (async () => {
    while (sampling && child.pid !== undefined && child.exitCode === null) {
      const bytes = await workingSet(child.pid);
      if (bytes !== null) peakRssBytes = Math.max(peakRssBytes ?? 0, bytes);
      await new Promise((resolve_) => setTimeout(resolve_, 200));
    }
  })();
  child.stderr.on("data", (chunk) => { stderr = appendCapture(stderr, chunk, `${engine.id} MCP stderr`); });
  child.stdout.on("data", (chunk) => {
    buffer = appendCapture(buffer, chunk, `${engine.id} MCP stdout`);
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      const waiter = pending.get(String(message.id));
      if (waiter !== undefined) {
        pending.delete(String(message.id));
        waiter.resolve(message);
      }
    }
  });

  const request = (id, method, params, timeoutMs = MCP_REQUEST_TIMEOUT_MS) => new Promise((resolve_, reject) => {
    const timer = setTimeout(() => {
      pending.delete(String(id));
      reject(new Error(`${engine.id} MCP ${method} timed out after ${timeoutMs}ms. stderr=${stderr}`));
    }, timeoutMs);
    pending.set(String(id), {
      resolve: (message) => {
        clearTimeout(timer);
        resolve_(message);
      }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });

  try {
    const initialized = await request(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "symbol-lattice-comparison-benchmark", version: "1" }
    });
    requireCondition(initialized.result !== undefined && initialized.error === undefined, `${engine.id} MCP initialize failed.`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

    const warmCase = cases[0];
    await request(2, "tools/call", {
      name: engine.mcpTool,
      arguments: engine.mcpArguments(projectPath, warmCase.reference)
    });

    const samples = [];
    let next = 0;
    async function worker(workerId) {
      while (true) {
        const index = next;
        next += 1;
        if (index >= MCP_REQUEST_COUNT) return;
        const item = cases[index % cases.length];
        const startedAt = process.hrtime.bigint();
        let isError = false;
        try {
          const response = await request(100 + index, "tools/call", {
            name: engine.mcpTool,
            arguments: engine.mcpArguments(projectPath, item.reference)
          });
          isError = response.error !== undefined || response.result?.isError === true;
        } catch {
          isError = true;
        }
        samples.push({ latencyMs: milliseconds(startedAt), usedFallback: false, isError, workerId });
      }
    }
    await Promise.all(Array.from({ length: MCP_CONCURRENCY }, (_, index) => worker(index)));
    return {
      requestCount: MCP_REQUEST_COUNT,
      concurrency: MCP_CONCURRENCY,
      peakRssBytes,
      summary: summarizeReadQueryExecutions(samples)
    };
  } finally {
    sampling = false;
    child.kill();
    await sample;
  }
}

async function engineVersion(engine) {
  if (engine.id === "symbol-lattice") {
    const packageJson = JSON.parse(await readFile(join(PROJECT_ROOT, "package.json"), "utf8"));
    return packageJson.version;
  }
  const result = await runCommand(engine.command, engine.versionArgs ?? ["--version"], { env: engine.env, sampleMemory: false });
  const version = result.stdout.trim() || result.stderr.trim();
  if (engine.expectedVersion !== undefined && engine.expectedVersion !== null) {
    requireCondition(
      version === engine.expectedVersion || version.endsWith(` ${engine.expectedVersion}`),
      `CodeGraph runtime version ${version} does not match checkout ${engine.expectedVersion}.`
    );
  }
  return version;
}

async function runEngineProject(engine, project, cases, repositoryPath, scratchRoot) {
  const projectPath = join(scratchRoot, `${engine.id}-${project.id}`);
  await mkdir(projectPath, { recursive: true });
  const copiedFiles = await copyWorktree(repositoryPath, projectPath);
  const init = await runCommand(engine.command, engine.initArgs(projectPath), {
    cwd: projectPath,
    env: engine.env
  });

  const noOpSyncSamples = [];
  for (let sampleIndex = 0; sampleIndex < NO_OP_SYNC_SAMPLE_COUNT; sampleIndex += 1) {
    const execution = await runCommand(engine.command, engine.syncArgs(projectPath), {
      cwd: projectPath,
      env: engine.env
    });
    noOpSyncSamples.push({
      sampleIndex,
      durationMs: execution.durationMs,
      peakRssBytes: execution.peakRssBytes,
      operationPerformance: engine.parseOperationPerformance === null
        ? null
        : engine.parseOperationPerformance(execution.stdout, "sync")
    });
  }

  const mutationPath = safeDestination(projectPath, project.mutationPath);
  await writeFile(mutationPath, `${await readFile(mutationPath, "utf8")}\n// symbol-lattice comparison benchmark mutation\n`, "utf8");
  const sync = await runCommand(engine.command, engine.syncArgs(projectPath), {
    cwd: projectPath,
    env: engine.env
  });

  const observations = [];
  const querySamples = [];
  for (const item of cases) {
    const execution = await runCommand(engine.command, engine.queryArgs(projectPath, item.reference), {
      cwd: projectPath,
      env: engine.env
    });
    const observed = engine.parseQuery(execution.stdout, item.reference);
    observations.push({
      id: item.id,
      projectId: item.projectId,
      language: item.language,
      expected: item.expectedTargets.map((target) => `calls|${item.reference}|${target}`),
      observed
    });
    querySamples.push({
      caseId: item.id,
      latencyMs: execution.durationMs,
      usedFallback: false,
      isError: false
    });
  }
  const mcp = await runMcpBatch(engine, projectPath, cases);
  return {
    projectId: project.id,
    repository: project.repository,
    copiedFiles,
    source: {
      head: (await gitOutput(repositoryPath, ["rev-parse", "HEAD"])).trim(),
      dirty: (await gitOutput(repositoryPath, ["status", "--porcelain", "--untracked-files=normal"])).trim().length > 0
    },
    index: {
      durationMs: init.durationMs,
      peakRssBytes: init.peakRssBytes,
      operationPerformance: engine.parseOperationPerformance === null
        ? null
        : engine.parseOperationPerformance(init.stdout, "index")
    },
    noOpSync: {
      policy: "repeated-sequential-no-op-v1",
      sampleCount: NO_OP_SYNC_SAMPLE_COUNT,
      samples: noOpSyncSamples,
      summary: summarizeOperationSamples(noOpSyncSamples)
    },
    incrementalSync: {
      mutationPath: project.mutationPath,
      durationMs: sync.durationMs,
      peakRssBytes: sync.peakRssBytes,
      operationPerformance: engine.parseOperationPerformance === null
        ? null
        : engine.parseOperationPerformance(sync.stdout, "sync")
    },
    correctness: scoreComparisonCases(observations),
    cliQueries: {
      samples: querySamples,
      summary: summarizeReadQueryExecutions(querySamples)
    },
    mcp
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifestBytes = await readFile(options.manifestPath);
  const manifest = parseManifest(JSON.parse(manifestBytes.toString("utf8")));
  const scratchRoot = await mkdtemp(join(tmpdir(), "symbol-lattice-codegraph-comparison-"));
  try {
    const engines = [];
    for (const engine of await engineDefinitions(options.workspacePath)) {
      const projects = [];
      for (const project of manifest.projects) {
        const repositoryPath = resolve(options.workspacePath, project.workspacePath);
        requireCondition(repositoryPath.startsWith(`${options.workspacePath}${sep}`), `Project ${project.id} escapes the workspace.`);
        const cases = manifest.cases.filter((item) => item.projectId === project.id);
        projects.push(await runEngineProject(engine, project, cases, repositoryPath, scratchRoot));
      }
      const allCases = projects.flatMap((project) => project.correctness.cases.map((item) => ({
        id: item.id,
        projectId: item.projectId,
        language: item.language,
        expected: item.truePositives.concat(item.falseNegatives),
        observed: item.truePositives.concat(item.falsePositives)
      })));
      engines.push({
        id: engine.id,
        version: await engineVersion(engine),
        launchSource: engine.launchSource ?? "current-checkout",
        correctness: scoreComparisonCases(allCases),
        projects
      });
    }

    const result = {
      schemaVersion: 4,
      benchmark: manifest.benchmarkId,
      generatedAt: new Date().toISOString(),
      manifest: {
        path: relative(PROJECT_ROOT, options.manifestPath).replaceAll("\\", "/"),
        sha256: createHash("sha256").update(manifestBytes).digest("hex"),
        projectCount: manifest.projects.length,
        caseCount: manifest.cases.length
      },
      environment: {
        platform: platform(),
        architecture: arch(),
        node: process.version,
        logicalCpuCount: cpus().length
      },
      protocol: {
        sourceSnapshot: "git tracked plus untracked non-ignored regular files",
        isolation: "temporary per-engine worktree copy removed after the run",
        correctnessScope: "curated project-local function and method callees",
        cliQueries: "both engines use their JSON callees command; latency includes each command's complete response contract",
        memory: "sampled process working set; null when unsupported",
        noOpSync: {
          policy: "repeated-sequential-no-op-v1",
          samples: NO_OP_SYNC_SAMPLE_COUNT,
          ordering: "sequential samples immediately after index without source mutation",
          summary: "raw samples plus nearest-rank median/p95 and median-absolute-deviation outlier indexes; unsupported working-set samples remain null"
        },
        phaseTimings: "SymbolLattice index and sync expose validated process-local monotonic phase receipts; CodeGraph has no equivalent public receipt, so its value is null and only end-to-end totals are compared",
        mcp: {
          requests: MCP_REQUEST_COUNT,
          concurrency: MCP_CONCURRENCY,
          warmupRequests: 1,
          scope: "end-to-end node tool latency; response contracts and payload sizes differ by engine"
        }
      },
      engines
    };
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    if (options.outputPath === null) {
      process.stdout.write(serialized);
    } else {
      await mkdir(dirname(options.outputPath), { recursive: true });
      await writeFile(options.outputPath, serialized, "utf8");
      process.stdout.write(`${options.outputPath}\n`);
    }
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

await main();
