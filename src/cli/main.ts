#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  MAX_AFFECTED_LIMIT,
  MAX_AFFECTED_MAX_DEPTH,
  MAX_CONTEXT_IMPACT_DEPTH,
  MAX_CONTEXT_IMPACT_LIMIT,
  MAX_CONTEXT_MAX_HOPS,
  MAX_CONTEXT_RELATION_LIMIT,
  MAX_GENERATION_DIFF_LIMIT,
  MAX_GENERATION_HISTORY_LIMIT,
  MAX_GIT_HUNK_LIMIT,
  MAX_HIERARCHY_LIMIT,
  MAX_ENTRYPOINT_LIMIT,
  MAX_ROUTE_LIMIT,
  ENTRYPOINT_OPERATIONS,
  ENTRYPOINT_TRANSPORTS,
  ROUTE_METHODS,
  DEFAULT_WATCH_INTERVAL_MS,
  MAX_WATCH_INTERVAL_MS,
  MIN_WATCH_INTERVAL_MS,
  MAX_IMPACT_LIMIT,
  SymbolLatticeError,
  SymbolLatticeService,
  startForegroundWatch,
  validateWatchInterval,
  type ContextOptions,
  type AffectedTestsOptions,
  type EntrypointsOptions,
  type GenerationDiffOptions,
  type GenerationHistoryOptions,
  type ForegroundWatchOptions,
  type GitAffectedTestsOptions,
  type GitHunksOptions,
  type FindOptions,
  type HierarchyOptions,
  type SearchOptions,
  type RoutesOptions,
  type WatchReceipt
} from "../application/index.js";
import { MAX_SOURCE_SEARCH_LIMIT } from "../domain/index.js";
import {
  FileSystemSourceCatalog,
  NodeFileSystemWatchSource
} from "../infrastructure/filesystem/index.js";
import { FileSystemGitChangeSetProvider } from "../infrastructure/git/index.js";
import { SqliteGraphStore } from "../infrastructure/sqlite/index.js";
import { serveMcp } from "../mcp/index.js";
import { SYMBOL_LATTICE_VERSION } from "../version.js";

interface OutputOptions {
  readonly json?: boolean;
}

interface ProjectOptions extends OutputOptions {
  readonly project?: string;
  readonly force?: boolean;
}

interface IndexCommandOptions extends ProjectOptions {
  readonly scope?: readonly string[];
}

interface FindCommandOptions extends ProjectOptions {
  readonly kind?: FindOptions["kind"];
  readonly limit?: number;
}

interface SearchCommandOptions extends ProjectOptions {
  readonly limit?: number;
  readonly path?: string;
  readonly language?: NonNullable<SearchOptions["language"]>;
}

interface RoutesCommandOptions extends ProjectOptions {
  readonly method?: NonNullable<RoutesOptions["method"]>;
  readonly path?: string;
  readonly limit?: number;
}

interface EntrypointsCommandOptions extends ProjectOptions {
  readonly transport?: NonNullable<EntrypointsOptions["transport"]>;
  readonly operation?: NonNullable<EntrypointsOptions["operation"]>;
  readonly name?: string;
  readonly limit?: number;
}

interface HierarchyCommandOptions extends ProjectOptions {
  readonly limit?: number;
}

interface ImpactCommandOptions extends ProjectOptions {
  readonly depth?: number;
  readonly limit?: number;
}

interface AffectedCommandOptions extends ProjectOptions {
  readonly depth?: number;
  readonly limit?: number;
  readonly stdin?: boolean;
  readonly workingTree?: boolean;
  readonly base?: string;
}

interface GitHunksCommandOptions extends ProjectOptions {
  readonly base?: string;
  readonly limit?: number;
}

interface ContextCommandOptions extends ProjectOptions {
  readonly relationLimit?: number;
  readonly maxHops?: number;
  readonly impactDepth?: number;
  readonly impactLimit?: number;
}

interface WatchCommandOptions extends ProjectOptions {
  readonly interval?: number;
  readonly poll?: boolean;
}

interface GenerationHistoryCommandOptions extends ProjectOptions {
  readonly limit?: number;
}

interface GenerationDiffCommandOptions extends ProjectOptions {
  readonly to?: string;
  readonly limit?: number;
}

/** Injectable CLI seam for a long-lived foreground watch command. */
export type WatchCommandRunner = (
  service: SymbolLatticeService,
  options: ForegroundWatchOptions
) => Promise<void>;

/** Minimal process-signal contract for the foreground watch lifecycle. */
export interface WatchSignalSource {
  once(signal: NodeJS.Signals, listener: () => void): unknown;
  off(signal: NodeJS.Signals, listener: () => void): unknown;
}

function createService(): SymbolLatticeService {
  const gitChangeSetProvider = new FileSystemGitChangeSetProvider();
  return new SymbolLatticeService(
    new SqliteGraphStore(),
    new FileSystemSourceCatalog(),
    undefined,
    gitChangeSetProvider,
    gitChangeSetProvider
  );
}

function defaultProjectPath(options: ProjectOptions): string {
  return resolve(options.project ?? process.cwd());
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received \"${value}\".`);
  }
  return parsed;
}

function parseSearchLimit(value: string): number {
  return parseBoundedPositiveInteger(value, MAX_SOURCE_SEARCH_LIMIT);
}

function parseBoundedPositiveInteger(value: string, maximum: number): number {
  const parsed = parsePositiveInteger(value);
  if (parsed > maximum) {
    throw new Error(`Expected an integer between 1 and ${maximum}, received \"${value}\".`);
  }
  return parsed;
}

/** Parses the bounded polling interval before the watch lifecycle starts. */
export function parseWatchInterval(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new SymbolLatticeError(
      "INVALID_WATCH_INTERVAL",
      `Watch interval must be an integer between ${MIN_WATCH_INTERVAL_MS} and ${MAX_WATCH_INTERVAL_MS} milliseconds.`
    );
  }
  return validateWatchInterval(parsed);
}

function parseSearchPath(value: string): string {
  const pathPrefix = value.trim();
  if (pathPrefix.length === 0) {
    throw new Error("Expected a non-empty project-relative path prefix.");
  }
  return pathPrefix;
}

function parseSearchLanguage(value: string): NonNullable<SearchOptions["language"]> {
  const language = value.trim();
  if (language !== "typescript" && language !== "javascript") {
    throw new Error(
      `Expected \"typescript\" or \"javascript\", received \"${value}\".`
    );
  }
  return language;
}

function parseRouteMethod(value: string): NonNullable<RoutesOptions["method"]> {
  if (!ROUTE_METHODS.includes(value as NonNullable<RoutesOptions["method"]>)) {
    throw new Error(`Expected one of: ${ROUTE_METHODS.join(", ")}; received "${value}".`);
  }
  return value as NonNullable<RoutesOptions["method"]>;
}

function parseRoutePathPrefix(value: string): string {
  if (value.length === 0 || !value.startsWith("/")) {
    throw new Error('Expected a non-empty route path prefix beginning with "/".');
  }
  return value;
}

function parseEntrypointTransport(value: string): NonNullable<EntrypointsOptions["transport"]> {
  if (!ENTRYPOINT_TRANSPORTS.includes(value as NonNullable<EntrypointsOptions["transport"]>)) {
    throw new Error(`Expected one of: ${ENTRYPOINT_TRANSPORTS.join(", ")}; received "${value}".`);
  }
  return value as NonNullable<EntrypointsOptions["transport"]>;
}

function parseEntrypointOperation(value: string): NonNullable<EntrypointsOptions["operation"]> {
  if (!ENTRYPOINT_OPERATIONS.includes(value as NonNullable<EntrypointsOptions["operation"]>)) {
    throw new Error(`Expected one of: ${ENTRYPOINT_OPERATIONS.join(", ")}; received "${value}".`);
  }
  return value as NonNullable<EntrypointsOptions["operation"]>;
}

function parseEntrypointNamePrefix(value: string): string {
  if (value.length === 0) {
    throw new Error("Expected a non-empty entrypoint name prefix.");
  }
  return value;
}

function normalizeSearchQuery(value: string): string {
  const query = value.trim();
  if (query.length === 0) {
    throw new Error("Expected a non-empty search query.");
  }
  return query;
}

/** Parses one Git-friendly changed-file path per input line. */
export function parseAffectedStdin(value: string): readonly string[] {
  return value
    .split(/\r\n|\r|\n/u)
    .map((filePath) => filePath.trim())
    .filter((filePath) => filePath.length > 0);
}

function render(value: unknown, _options: OutputOptions): void {
  // JSON is deliberately the single stable public contract in this release. The flag is
  // retained so callers can depend on it before a future human renderer lands.
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Watch uses compact NDJSON so every lifecycle receipt is independently parseable. */
function renderWatchReceipt(receipt: WatchReceipt): void {
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

export async function runForegroundWatch(
  service: SymbolLatticeService,
  options: ForegroundWatchOptions,
  signals: WatchSignalSource = process
): Promise<void> {
  let session: Awaited<ReturnType<typeof startForegroundWatch>> | null = null;
  let stopping = false;
  let stopRequestedBeforeStart = false;
  const stop = () => {
    if (stopping) {
      return;
    }
    stopping = true;
    if (session === null) {
      // A first freshness repair can already be running. Retain the signal so
      // the foreground process does not exit in the middle of that atomic sync.
      stopRequestedBeforeStart = true;
      return;
    }
    void session.stop();
  };

  signals.once("SIGINT", stop);
  signals.once("SIGTERM", stop);
  try {
    session = await startForegroundWatch(service, options);
    if (stopRequestedBeforeStart) {
      await session.stop();
      return;
    }
    await session.done;
  } finally {
    signals.off("SIGINT", stop);
    signals.off("SIGTERM", stop);
  }
}

function renderError(error: unknown, json: boolean): void {
  const code = error instanceof SymbolLatticeError ? error.code : "UNEXPECTED_ERROR";
  const message = error instanceof Error ? error.message : "Unknown SymbolLattice error.";
  if (json) {
    process.stderr.write(`${JSON.stringify({ error: { code, message } }, null, 2)}\n`);
  } else {
    process.stderr.write(`symbol-lattice: ${code}: ${message}\n`);
  }
}

function assertSupportedNodeVersion(): void {
  const [majorText, minorText] = process.versions.node.split(".");
  const major = Number(majorText);
  const minor = Number(minorText);
  if (
    !Number.isSafeInteger(major) ||
    !Number.isSafeInteger(minor) ||
    major < 22 ||
    (major === 22 && minor < 13) ||
    major >= 25
  ) {
    throw new SymbolLatticeError(
      "UNSUPPORTED_NODE_VERSION",
      `SymbolLattice requires Node >=22.13 and <25; found ${process.versions.node}.`
    );
  }
}

function addProjectOption(command: Command): Command {
  return command.option("-p, --project <path>", "Project directory (defaults to the current directory)");
}

function addJsonOption(command: Command): Command {
  return command.option("--json", "Emit the stable JSON contract");
}

function collectScope(value: string, previous: readonly string[] = []): string[] {
  return [...previous, value];
}

function addIndexOptions(command: Command): Command {
  return command
    .option("--force", "Allow indexing a filesystem root or the home directory")
    .option(
      "--scope <directory>",
      "Limit indexing to a project-relative directory (repeatable; replaces the stored scope)",
      collectScope
    );
}

function toIndexOptions(projectPath: string, options: IndexCommandOptions) {
  const base = { projectPath, force: options.force ?? false };
  return options.scope === undefined ? base : { ...base, scopeRoots: options.scope };
}

export function createProgram(
  service = createService(),
  watchRunner: WatchCommandRunner = runForegroundWatch
): Command {
  const program = new Command();
  program
    .name("symbol-lattice")
    .description("Evidence-first local code graph exploration for TypeScript and JavaScript.")
    .version(SYMBOL_LATTICE_VERSION);

  addJsonOption(addIndexOptions(addProjectOption(program.command("init [path]"))))
    .action(async (path: string | undefined, options: IndexCommandOptions) => {
      const projectPath = resolve(path ?? defaultProjectPath(options));
      render(
        await service.init(toIndexOptions(projectPath, options)),
        options
      );
    });

  addJsonOption(addIndexOptions(addProjectOption(program.command("index [path]"))))
    .action(async (path: string | undefined, options: IndexCommandOptions) => {
      const projectPath = resolve(path ?? defaultProjectPath(options));
      render(
        await service.index(toIndexOptions(projectPath, options)),
        options
      );
    });

  addJsonOption(addIndexOptions(addProjectOption(program.command("sync [path]"))))
    .action(async (path: string | undefined, options: IndexCommandOptions) => {
      const projectPath = resolve(path ?? defaultProjectPath(options));
      render(
        await service.sync(toIndexOptions(projectPath, options)),
        options
      );
    });

  addProjectOption(program.command("watch [path]"))
    .option("--force", "Allow automatic sync of a filesystem root or the home directory")
    .option(
      "--interval <milliseconds>",
      `Polling fallback interval in milliseconds (${MIN_WATCH_INTERVAL_MS}-${MAX_WATCH_INTERVAL_MS}; default ${DEFAULT_WATCH_INTERVAL_MS})`,
      parseWatchInterval
    )
    .option("--poll", "Disable native filesystem-event acceleration and use polling only")
    .option("--json", "Emit newline-delimited JSON watch receipts (the default)")
    .action(async (path: string | undefined, options: WatchCommandOptions) => {
      const projectPath = resolve(path ?? defaultProjectPath(options));
      await watchRunner(service, {
        projectPath,
        force: options.force ?? false,
        intervalMs: options.interval ?? DEFAULT_WATCH_INTERVAL_MS,
        ...(options.poll === true ? {} : { eventSource: new NodeFileSystemWatchSource() }),
        onReceipt: renderWatchReceipt
      });
    });

  addJsonOption(addProjectOption(program.command("status [path]"))).action(
    async (path: string | undefined, options: ProjectOptions) => {
      const projectPath = resolve(path ?? defaultProjectPath(options));
      render(await service.getStatus(projectPath), options);
    }
  );

  addJsonOption(addProjectOption(program.command("history [path]")))
    .option(
      "--limit <count>",
      `Maximum retained generation summaries to return (1-${MAX_GENERATION_HISTORY_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_GENERATION_HISTORY_LIMIT)
    )
    .action(async (path: string | undefined, options: GenerationHistoryCommandOptions) => {
      const historyOptions: GenerationHistoryOptions =
        options.limit === undefined ? {} : { limit: options.limit };
      render(
        await service.history(resolve(path ?? defaultProjectPath(options)), historyOptions),
        options
      );
    });

  addJsonOption(addProjectOption(program.command("diff <from-generation-id> [path]")))
    .option("--to <generation-id>", "Retained generation ID to compare with (defaults to active)")
    .option(
      "--limit <count>",
      `Maximum changes per structural category (1-${MAX_GENERATION_DIFF_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_GENERATION_DIFF_LIMIT)
    )
    .action(
      async (
        fromGenerationId: string,
        path: string | undefined,
        options: GenerationDiffCommandOptions
      ) => {
        const diffOptions: GenerationDiffOptions = {
          ...(options.to === undefined ? {} : { toGenerationId: options.to }),
          ...(options.limit === undefined ? {} : { limit: options.limit })
        };
        render(
          await service.diff(
            resolve(path ?? defaultProjectPath(options)),
            fromGenerationId,
            diffOptions
          ),
          options
        );
      }
    );

  addJsonOption(addProjectOption(program.command("find <query>")))
    .option("--kind <kind>", "Restrict results to a symbol kind")
    .option("--limit <count>", "Maximum number of results", parsePositiveInteger)
    .action(async (query: string, options: FindCommandOptions) => {
      const findOptions: { kind?: Exclude<FindOptions["kind"], undefined>; limit?: number } = {};
      if (options.kind !== undefined) {
        findOptions.kind = options.kind;
      }
      if (options.limit !== undefined) {
        findOptions.limit = options.limit;
      }
      render(await service.find(defaultProjectPath(options), query, findOptions), options);
    });

  addJsonOption(addProjectOption(program.command("query <query>")))
    .option("--kind <kind>", "Restrict results to a symbol kind")
    .option("--limit <count>", "Maximum number of results", parsePositiveInteger)
    .action(async (query: string, options: FindCommandOptions) => {
      const findOptions: { kind?: Exclude<FindOptions["kind"], undefined>; limit?: number } = {};
      if (options.kind !== undefined) {
        findOptions.kind = options.kind;
      }
      if (options.limit !== undefined) {
        findOptions.limit = options.limit;
      }
      render(await service.find(defaultProjectPath(options), query, findOptions), options);
    });

  addJsonOption(addProjectOption(program.command("node <reference>"))).action(
    async (reference: string, options: ProjectOptions) => {
      render(await service.node(defaultProjectPath(options), reference), options);
    }
  );

  addJsonOption(addProjectOption(program.command("search <query>")))
    .option(
      "--limit <count>",
      `Maximum number of results (1-${MAX_SOURCE_SEARCH_LIMIT})`,
      parseSearchLimit
    )
    .option("--path <project-relative-prefix>", "Restrict results to a project-relative source-path prefix", parseSearchPath)
    .option(
      "--language <typescript|javascript>",
      "Restrict results to TypeScript or JavaScript",
      parseSearchLanguage
    )
    .action(async (query: string, options: SearchCommandOptions) => {
      const searchOptions: SearchOptions = {
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        ...(options.path === undefined ? {} : { pathPrefix: options.path }),
        ...(options.language === undefined ? {} : { language: options.language })
      };
      render(
        await service.search(defaultProjectPath(options), normalizeSearchQuery(query), searchOptions),
        options
      );
    });

  addJsonOption(addProjectOption(program.command("routes [path]")))
    .option(
      "--method <method>",
      `Restrict results to one uppercase HTTP method (${ROUTE_METHODS.join(", ")})`,
      parseRouteMethod
    )
    .option(
      "--path <route-path-prefix>",
      "Restrict results to a slash-leading route path prefix",
      parseRoutePathPrefix
    )
    .option(
      "--limit <count>",
      `Maximum route records to return (1-${MAX_ROUTE_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_ROUTE_LIMIT)
    )
    .action(async (path: string | undefined, options: RoutesCommandOptions) => {
      const routeOptions: RoutesOptions = {
        ...(options.method === undefined ? {} : { method: options.method }),
        ...(options.path === undefined ? {} : { pathPrefix: options.path }),
        ...(options.limit === undefined ? {} : { limit: options.limit })
      };
      render(
        await service.routes(resolve(path ?? defaultProjectPath(options)), routeOptions),
        options
      );
    });

  addJsonOption(addProjectOption(program.command("entrypoints [path]")))
    .option(
      "--transport <transport>",
      `Restrict results to one transport (${ENTRYPOINT_TRANSPORTS.join(", ")})`,
      parseEntrypointTransport
    )
    .option(
      "--operation <operation>",
      `Restrict results to one operation (${ENTRYPOINT_OPERATIONS.join(", ")})`,
      parseEntrypointOperation
    )
    .option(
      "--name <entrypoint-name-prefix>",
      "Restrict results to a non-empty persisted entrypoint name prefix",
      parseEntrypointNamePrefix
    )
    .option(
      "--limit <count>",
      `Maximum entrypoint records to return (1-${MAX_ENTRYPOINT_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_ENTRYPOINT_LIMIT)
    )
    .action(async (path: string | undefined, options: EntrypointsCommandOptions) => {
      const entrypointOptions: EntrypointsOptions = {
        ...(options.transport === undefined ? {} : { transport: options.transport }),
        ...(options.operation === undefined ? {} : { operation: options.operation }),
        ...(options.name === undefined ? {} : { namePrefix: options.name }),
        ...(options.limit === undefined ? {} : { limit: options.limit })
      };
      render(
        await service.entrypoints(resolve(path ?? defaultProjectPath(options)), entrypointOptions),
        options
      );
    });

  addJsonOption(addProjectOption(program.command("hierarchy <reference>")))
    .option(
      "--limit <count>",
      `Maximum direct parents and children returned independently (1-${MAX_HIERARCHY_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_HIERARCHY_LIMIT)
    )
    .action(async (reference: string, options: HierarchyCommandOptions) => {
      const hierarchyOptions: HierarchyOptions = {
        ...(options.limit === undefined ? {} : { limit: options.limit })
      };
      render(await service.hierarchy(defaultProjectPath(options), reference, hierarchyOptions), options);
    });

  for (const commandName of ["callers", "callees"] as const) {
    addJsonOption(addProjectOption(program.command(`${commandName} <symbol>`))).action(
      async (reference: string, options: ProjectOptions) => {
        const projectPath = defaultProjectPath(options);
        const result =
          commandName === "callers"
            ? await service.callers(projectPath, reference)
            : await service.callees(projectPath, reference);
        render(result, options);
      }
    );
  }

  addJsonOption(addProjectOption(program.command("impact <symbol>")))
    .option("--depth <count>", "Maximum reverse dependency depth", parsePositiveInteger)
    .option(
      "--limit <count>",
      `Maximum returned impact paths (1-${MAX_IMPACT_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_IMPACT_LIMIT)
    )
    .action(async (reference: string, options: ImpactCommandOptions) => {
      const impactOptions = {
        maxDepth: options.depth ?? 1,
        ...(options.limit === undefined ? {} : { limit: options.limit })
      };
      render(
        await service.impact(defaultProjectPath(options), reference, impactOptions),
        options
      );
    });

  addJsonOption(addProjectOption(program.command("affected [filePaths...]")))
    .option("--stdin", "Read additional changed file paths from standard input (one per line)")
    .option(
      "--working-tree",
      "Select changed source files from HEAD, staged/unstaged work, and untracked files through local Git"
    )
    .option(
      "--base <ref>",
      "Select source files changed from the local merge-base of <ref> and HEAD through local Git"
    )
    .option(
      "--depth <count>",
      `Maximum reverse import/export depth per changed file (1-${MAX_AFFECTED_MAX_DEPTH})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_AFFECTED_MAX_DEPTH)
    )
    .option(
      "--limit <count>",
      `Maximum returned affected-test proofs (1-${MAX_AFFECTED_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_AFFECTED_LIMIT)
    )
    .action(async (filePaths: string[], options: AffectedCommandOptions) => {
      const affectedOptions: AffectedTestsOptions = {
        ...(options.depth === undefined ? {} : { maxDepth: options.depth }),
        ...(options.limit === undefined ? {} : { limit: options.limit })
      };
      const hasGitSelection = options.workingTree === true || options.base !== undefined;
      if (options.workingTree === true && options.base !== undefined) {
        throw new Error('Use either "--working-tree" or "--base <ref>", not both.');
      }
      if (hasGitSelection && (filePaths.length > 0 || options.stdin === true)) {
        throw new Error(
          'Git selection cannot be combined with explicit affected file paths or "--stdin".'
        );
      }
      if (hasGitSelection) {
        const gitOptions: GitAffectedTestsOptions = {
          ...affectedOptions,
          ...(options.base === undefined ? {} : { baseRef: options.base })
        };
        render(
          await service.affectedTestsFromGit(defaultProjectPath(options), gitOptions),
          options
        );
        return;
      }
      const stdinPaths = options.stdin ? parseAffectedStdin(readFileSync(0, "utf8")) : [];
      render(
        await service.affectedTests(defaultProjectPath(options), [...filePaths, ...stdinPaths], affectedOptions),
        options
      );
    });

  addJsonOption(addProjectOption(program.command("git-hunks [path]")))
    .requiredOption(
      "--base <ref>",
      "Compare the local merge-base of <ref> and HEAD through immutable local Git blobs"
    )
    .option(
      "--limit <count>",
      `Maximum hunk records to return (1-${MAX_GIT_HUNK_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_GIT_HUNK_LIMIT)
    )
    .action(async (path: string | undefined, options: GitHunksCommandOptions) => {
      const gitHunksOptions: GitHunksOptions =
        options.limit === undefined ? {} : { limit: options.limit };
      render(
        await service.gitHunks(
          resolve(path ?? defaultProjectPath(options)),
          options.base ?? "",
          gitHunksOptions
        ),
        options
      );
    });

  addJsonOption(addProjectOption(program.command("context <reference...>")))
    .option(
      "--relation-limit <count>",
      `Maximum callers and callees per exact symbol (1-${MAX_CONTEXT_RELATION_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_CONTEXT_RELATION_LIMIT)
    )
    .option(
      "--max-hops <count>",
      `Maximum evidence-path hops (1-${MAX_CONTEXT_MAX_HOPS})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_CONTEXT_MAX_HOPS)
    )
    .option(
      "--impact-depth <count>",
      `Maximum impact depth per exact symbol (1-${MAX_CONTEXT_IMPACT_DEPTH})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_CONTEXT_IMPACT_DEPTH)
    )
    .option(
      "--impact-limit <count>",
      `Maximum impact paths per exact symbol (1-${MAX_CONTEXT_IMPACT_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_CONTEXT_IMPACT_LIMIT)
    )
    .action(async (references: string[], options: ContextCommandOptions) => {
      const contextOptions: ContextOptions = {
        ...(options.relationLimit === undefined ? {} : { relationLimit: options.relationLimit }),
        ...(options.maxHops === undefined ? {} : { maxHops: options.maxHops }),
        ...(options.impactDepth === undefined ? {} : { impactDepth: options.impactDepth }),
        ...(options.impactLimit === undefined ? {} : { impactLimit: options.impactLimit })
      };
      render(await service.context(defaultProjectPath(options), references, contextOptions), options);
    });

  addJsonOption(addProjectOption(program.command("explore <query>"))).action(
    async (query: string, options: ProjectOptions) => {
      render(await service.explore(defaultProjectPath(options), query), options);
    }
  );

  addJsonOption(addProjectOption(program.command("explain-edge <edge-id>"))).action(
    async (edgeId: string, options: ProjectOptions) => {
      render(await service.explainEdge(defaultProjectPath(options), edgeId), options);
    }
  );

  addProjectOption(program.command("serve"))
    .requiredOption("--mcp", "Run the MCP stdio server")
    .action(async (options: ProjectOptions) => {
      await serveMcp(service, defaultProjectPath(options));
    });

  return program;
}

export async function run(argv = process.argv): Promise<void> {
  try {
    assertSupportedNodeVersion();
    const program = createProgram();
    await program.parseAsync(argv);
  } catch (error) {
    renderError(error, argv.includes("--json"));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(invokedPath)) {
  void run();
}
