#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  MAX_AFFECTED_LIMIT,
  MAX_AFFECTED_MAX_DEPTH,
  MAX_CONTEXT_IMPACT_DEPTH,
  MAX_CONTEXT_IMPACT_LIMIT,
  MAX_CONTEXT_MAX_HOPS,
  MAX_CONTEXT_RELATION_LIMIT,
  INVESTIGATE_RANKING_STRATEGIES,
  MAX_INVESTIGATE_SYMBOL_LIMIT,
  MAX_GENERATION_DIFF_LIMIT,
  MAX_GENERATION_HISTORY_LIMIT,
  MAX_GIT_HUNK_LIMIT,
  MAX_HIERARCHY_LIMIT,
  MAX_ENTRYPOINT_LIMIT,
  FILE_FORMATS,
  MAX_FILE_PATTERN_LENGTH,
  MAX_FILE_TREE_DEPTH,
  MAX_FILE_LIMIT,
  MAX_FILE_CURSOR_LENGTH,
  MAX_ROUTE_LIMIT,
  ENTRYPOINT_OPERATIONS,
  ENTRYPOINT_TRANSPORTS,
  ROUTE_METHODS,
  DEFAULT_WATCH_INTERVAL_MS,
  MAX_WATCH_INTERVAL_MS,
  MIN_WATCH_INTERVAL_MS,
  MAX_IMPACT_LIMIT,
  AutoSyncStatusTracker,
  loadSymbolLatticePluginModules,
  SymbolLatticeError,
  SymbolLatticeService,
  startForegroundWatch,
  validateWatchInterval,
  type AcquiredAutoSyncOwnerLease,
  type ContextOptions,
  type InvestigateOptions,
  type AffectedTestsOptions,
  type AutoSyncDiagnosticJournal,
  type AutoSyncDiagnosticJournalOptions,
  type AutoSyncDiagnosticsOptions,
  type AutoSyncOwnerLease,
  type AutoSyncDiagnosticsResult,
  type AutoSyncStatusResult,
  type EntrypointsOptions,
  type FilesOptions,
  type GenerationDiffOptions,
  type GenerationHistoryOptions,
  type ForegroundWatchOptions,
  type ForegroundWatchSession,
  type GitAffectedTestsOptions,
  type GitHunksOptions,
  type FindOptions,
  type HierarchyOptions,
  type SearchOptions,
  type RoutesOptions,
  type SymbolLatticeServiceExtensions,
  type WatchReceipt
} from "../application/index.js";
import { ARTIFACT_LANGUAGES, MAX_SOURCE_SEARCH_LIMIT } from "../domain/index.js";
import {
  FileSystemSourceCatalog,
  NodeFileSystemWatchSource
} from "../infrastructure/filesystem/index.js";
import { FileSystemGitChangeSetProvider } from "../infrastructure/git/index.js";
import {
  SqliteAutoSyncDiagnosticJournal,
  SqliteAutoSyncOwnerLease,
  SqliteGraphStore
} from "../infrastructure/sqlite/index.js";
import {
  startMcpServerWithReadQueryPool,
  type AutoSyncDiagnosticJournalService,
  type AutoSyncDiagnosticsService,
  type AutoSyncStatusService,
  type McpServerSession
} from "../mcp/index.js";
import { SYMBOL_LATTICE_VERSION } from "../version.js";
import { createMcpConfig, type McpConfigOptions } from "./mcp-config.js";
import { createMcpDoctor } from "./mcp-doctor.js";
import { createMcpInstall } from "./mcp-install.js";
import { createMcpUninstall } from "./mcp-uninstall.js";
import {
  runUpgradeCommand,
  type UpgradeCommandOptions as UpgradeExecutionOptions,
  type UpgradeCommandResult
} from "./upgrade-apply.js";

interface OutputOptions {
  readonly json?: boolean;
}

interface ProjectOptions extends OutputOptions {
  readonly project?: string;
  readonly force?: boolean;
}

interface PluginCommandOptions {
  readonly plugin?: readonly string[];
  readonly allowExternalPlugin?: boolean;
}

interface IndexCommandOptions extends ProjectOptions, PluginCommandOptions {
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

interface FilesCommandOptions extends ProjectOptions {
  readonly limit?: number;
  readonly path?: string;
  readonly language?: NonNullable<FilesOptions["language"]>;
  readonly pattern?: string;
  readonly format?: NonNullable<FilesOptions["format"]>;
  readonly maxDepth?: number;
  readonly cursor?: string;
}

interface InvestigateCommandOptions extends ProjectOptions {
  readonly searchLimit?: number;
  readonly symbolLimit?: number;
  readonly ranking?: NonNullable<InvestigateOptions["ranking"]>;
  readonly path?: string;
  readonly language?: NonNullable<InvestigateOptions["language"]>;
  readonly relationLimit?: number;
  readonly maxHops?: number;
  readonly impactDepth?: number;
  readonly impactLimit?: number;
}

interface RoutesCommandOptions extends ProjectOptions {
  readonly method?: NonNullable<RoutesOptions["method"]>;
  readonly path?: string;
  readonly domain?: string;
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
  readonly pathPrefix?: string;
}

interface GitHunksCommandOptions extends ProjectOptions {
  readonly base?: string;
  readonly limit?: number;
  readonly pathPrefix?: string;
}

interface ContextCommandOptions extends ProjectOptions {
  readonly relationLimit?: number;
  readonly maxHops?: number;
  readonly impactDepth?: number;
  readonly impactLimit?: number;
}

interface WatchCommandOptions extends ProjectOptions, PluginCommandOptions {
  readonly interval?: number;
  readonly poll?: boolean;
}

interface ServeCommandOptions extends ProjectOptions, PluginCommandOptions {
  readonly autoSync?: boolean;
  readonly diagnosticJournal?: boolean;
  readonly syncInterval?: number;
  readonly poll?: boolean;
}

interface McpConfigCommandOptions extends ProjectOptions, PluginCommandOptions {
  readonly location?: string;
  readonly autoSync?: boolean;
  readonly diagnosticJournal?: boolean;
  readonly syncInterval?: number;
  readonly poll?: boolean;
  readonly printSnippet?: boolean;
  readonly source?: boolean;
}

interface McpDoctorCommandOptions extends McpConfigCommandOptions {
  readonly config?: string;
}

interface McpInstallCommandOptions extends McpDoctorCommandOptions {
  readonly apply?: boolean;
  readonly yes?: boolean;
  readonly backupDir?: string;
}

interface McpUninstallCommandOptions extends McpDoctorCommandOptions {
  readonly apply?: boolean;
  readonly yes?: boolean;
  readonly backupDir?: string;
}

interface UpgradeCliOptions extends OutputOptions {
  readonly check?: boolean;
  readonly verify?: boolean;
  readonly apply?: boolean;
  readonly yes?: boolean;
  readonly force?: boolean;
  readonly allowDowngrade?: boolean;
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

/** Options for the MCP host's separate, background freshness watcher. */
export interface McpAutoSyncOptions {
  readonly projectPath: string;
  readonly force?: boolean;
  readonly autoSync?: boolean;
  readonly diagnosticJournal?: boolean;
  readonly intervalMs?: number;
  readonly poll?: boolean;
}

/** Injectable MCP session seam for CLI lifecycle and option coverage. */
export type McpServerRunner = (
  service: SymbolLatticeService,
  defaultProjectPath: string
) => Promise<McpServerSession>;

/** Injectable freshness-watcher seam; MCP handlers never receive this capability. */
export type McpWatchStarter = (
  service: SymbolLatticeService,
  options: ForegroundWatchOptions
) => Promise<ForegroundWatchSession>;

/** Injectable durable receipt store; request handlers only receive its read method. */
export type McpAutoSyncJournalFactory = (
  projectPath: string,
  writable: boolean
) => AutoSyncDiagnosticJournal;

/** Injectable project-ownership seam; MCP request handlers never receive this capability. */
export type AutoSyncOwnerLeaseFactory = (projectPath: string) => AutoSyncOwnerLease;

/** Backward-compatible alias for the MCP composition seam. */
export type McpAutoSyncOwnerLeaseFactory = AutoSyncOwnerLeaseFactory;

/** Injectable composition seam for the `serve --mcp` command. */
export type McpCommandRunner = (
  service: SymbolLatticeService,
  options: McpAutoSyncOptions
) => Promise<void>;

export interface PluginServiceFactoryOptions {
  readonly projectPath: string;
  readonly modulePaths: readonly string[];
  readonly allowExternalModules: boolean;
}

/** Injectable seam proving that only index-writing commands load trusted modules. */
export type PluginServiceFactory = (
  options: PluginServiceFactoryOptions
) => Promise<SymbolLatticeService>;

export type UpgradePlanner = (
  options: UpgradeExecutionOptions
) => Promise<UpgradeCommandResult>;

/** Minimal process-signal contract for the foreground watch lifecycle. */
export interface WatchSignalSource {
  once(signal: NodeJS.Signals, listener: () => void): unknown;
  off(signal: NodeJS.Signals, listener: () => void): unknown;
}

function createService(extensions?: SymbolLatticeServiceExtensions): SymbolLatticeService {
  const gitChangeSetProvider = new FileSystemGitChangeSetProvider();
  return new SymbolLatticeService(
    new SqliteGraphStore(),
    new FileSystemSourceCatalog(),
    extensions ?? {},
    gitChangeSetProvider,
    gitChangeSetProvider
  );
}

async function createPluginService(
  options: PluginServiceFactoryOptions
): Promise<SymbolLatticeService> {
  const loaded = await loadSymbolLatticePluginModules({
    projectPath: options.projectPath,
    modulePaths: options.modulePaths,
    allowExternalModules: options.allowExternalModules
  });
  return createService(loaded.extensions);
}

function defaultProjectPath(options: ProjectOptions): string {
  return resolve(options.project ?? process.cwd());
}

/** Keeps MCP configuration commands aligned on the exact expected serve command. */
function createMcpCommandOptions(options: McpConfigCommandOptions): McpConfigOptions {
  const projectPath = defaultProjectPath(options);
  const pluginModulePaths = (options.plugin ?? []).map((modulePath) => resolve(projectPath, modulePath));
  if (options.allowExternalPlugin === true && pluginModulePaths.length === 0) {
    throw new SymbolLatticeError(
      "INVALID_PLUGIN_MODULE",
      '"--allow-external-plugin" requires at least one explicit "--plugin <path>".'
    );
  }
  return {
    projectPath,
    ...(options.location === undefined ? {} : { location: options.location }),
    force: options.force ?? false,
    autoSync: options.autoSync ?? true,
    diagnosticJournal: options.diagnosticJournal ?? true,
    ...(options.syncInterval === undefined ? {} : { syncIntervalMs: options.syncInterval }),
    poll: options.poll ?? false,
    ...(pluginModulePaths.length === 0 ? {} : { pluginModulePaths }),
    allowExternalPluginModules: options.allowExternalPlugin ?? false,
    ...(options.source === true
      ? {
          command: process.execPath,
          commandArgs: [resolve(fileURLToPath(import.meta.url))]
        }
      : {})
  };
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

function parseFilePattern(value: string): string {
  const pattern = value.trim();
  if (pattern.length === 0 || pattern.length > MAX_FILE_PATTERN_LENGTH) {
    throw new Error(`Expected a non-empty file glob of at most ${MAX_FILE_PATTERN_LENGTH} characters.`);
  }
  return pattern;
}

function parseFileFormat(value: string): NonNullable<FilesOptions["format"]> {
  if (!FILE_FORMATS.includes(value as NonNullable<FilesOptions["format"]>)) {
    throw new Error(`Expected one of: ${FILE_FORMATS.join(", ")}; received "${value}".`);
  }
  return value as NonNullable<FilesOptions["format"]>;
}

function parseFileCursor(value: string): string {
  if (value.length === 0 || value.length > MAX_FILE_CURSOR_LENGTH || value !== value.trim()) {
    throw new Error(`Expected a non-empty file cursor of at most ${MAX_FILE_CURSOR_LENGTH} characters.`);
  }
  return value;
}

function parseSearchLanguage(value: string): NonNullable<SearchOptions["language"]> {
  const language = value.trim();
  if (!ARTIFACT_LANGUAGES.includes(language as NonNullable<SearchOptions["language"]>)) {
    throw new Error(`Expected one of: ${ARTIFACT_LANGUAGES.join(", ")}; received "${value}".`);
  }
  return language as NonNullable<SearchOptions["language"]>;
}

function parseInvestigateRanking(value: string): NonNullable<InvestigateOptions["ranking"]> {
  const ranking = value.trim();
  if (!INVESTIGATE_RANKING_STRATEGIES.includes(ranking as NonNullable<InvestigateOptions["ranking"]>)) {
    throw new Error(
      `Expected one of: ${INVESTIGATE_RANKING_STRATEGIES.join(", ")}; received "${value}".`
    );
  }
  return ranking as NonNullable<InvestigateOptions["ranking"]>;
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

function parseRouteDomain(value: string): string {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error("Expected a non-empty exact route domain without surrounding whitespace.");
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

/**
 * Adds only read-only watcher-health and diagnostics seams for one MCP host.
 * Method calls remain bound to the original service so this wrapper cannot
 * redirect index writes.
 */
function withAutoSyncObservability(
  service: SymbolLatticeService,
  defaultProjectPath: string,
  tracker: AutoSyncStatusTracker,
  journal: AutoSyncDiagnosticJournal
): SymbolLatticeService &
  AutoSyncStatusService &
  AutoSyncDiagnosticsService &
  AutoSyncDiagnosticJournalService {
  const autoSyncStatus = async (): Promise<AutoSyncStatusResult> => ({
    index: await service.getStatus(defaultProjectPath),
    autoSync: tracker.snapshot()
  });
  const autoSyncDiagnostics = async (
    options: AutoSyncDiagnosticsOptions = {}
  ): Promise<AutoSyncDiagnosticsResult> => {
    try {
      const status = await service.getStatus(defaultProjectPath);
      return {
        index: { status, error: null },
        autoSync: tracker.snapshot(),
        timeline: tracker.diagnostics(options)
      };
    } catch (error) {
      return {
        index: { status: null, error: toAutoSyncDiagnosticError(error) },
        autoSync: tracker.snapshot(),
        timeline: tracker.diagnostics(options)
      };
    }
  };
  const autoSyncJournal = async (
    options: AutoSyncDiagnosticJournalOptions = {}
  ) => journal.diagnostics(options);
  return new Proxy(service, {
    get(target, property, receiver): unknown {
      if (property === "autoSyncStatus") {
        return autoSyncStatus;
      }
      if (property === "autoSyncDiagnostics") {
        return autoSyncDiagnostics;
      }
      if (property === "autoSyncJournal") {
        return autoSyncJournal;
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
    has(target, property): boolean {
      return (
        property === "autoSyncStatus" ||
        property === "autoSyncDiagnostics" ||
        property === "autoSyncJournal" ||
        Reflect.has(target, property)
      );
    }
  }) as SymbolLatticeService &
    AutoSyncStatusService &
    AutoSyncDiagnosticsService &
    AutoSyncDiagnosticJournalService;
}

function toAutoSyncDiagnosticError(
  error: unknown
): AutoSyncDiagnosticsResult["index"]["error"] {
  return {
    code: error instanceof SymbolLatticeError ? error.code : "UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : "Unknown SymbolLattice error."
  };
}

/** Creates one bounded local lifecycle receipt when a second host loses the owner race. */
function ownerLeaseUnavailableReceipt(
  projectPath: string,
  error: { readonly code: string; readonly message: string }
): WatchReceipt {
  return {
    event: "owner-lease-unavailable",
    observedAt: new Date().toISOString(),
    projectPath,
    status: null,
    previousGenerationId: null,
    generationId: null,
    lastIndexWork: null,
    error,
    retryDelayMs: null,
    pendingFileCount: 0,
    pendingFiles: [],
    pendingFilesTruncated: false,
    pendingFilesUnknown: false
  };
}

export async function runForegroundWatch(
  service: SymbolLatticeService,
  options: ForegroundWatchOptions,
  signals: WatchSignalSource = process,
  ownerLeaseFactory: AutoSyncOwnerLeaseFactory = (projectPath) =>
    new SqliteAutoSyncOwnerLease(projectPath)
): Promise<void> {
  // Guard the project boundary before creating the separate owner database.
  service.assertSafeProjectPath({
    projectPath: options.projectPath,
    force: options.force ?? false
  });
  const acquired = ownerLeaseFactory(options.projectPath).acquire();
  if (acquired.state === "unavailable") {
    throw new SymbolLatticeError("AUTO_SYNC_OWNER_UNAVAILABLE", acquired.error.message);
  }

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

  try {
    signals.once("SIGINT", stop);
    signals.once("SIGTERM", stop);
    session = await startForegroundWatch(service, options);
    if (stopRequestedBeforeStart) {
      await session.stop();
      return;
    }
    await session.done;
  } finally {
    try {
      signals.off("SIGINT", stop);
    } finally {
      try {
        signals.off("SIGTERM", stop);
      } finally {
        acquired.release();
      }
    }
  }
}

/**
 * Runs a read-only MCP server beside a separate automatic freshness watcher.
 *
 * The watcher performs startup catch-up plus debounced incremental syncs. MCP
 * request handlers stay read-only because they only receive the graph service,
 * never the watcher session or a synchronization callback.
 */
export async function runMcpWithAutoSync(
  service: SymbolLatticeService,
  options: McpAutoSyncOptions,
  serverRunner: McpServerRunner = startMcpServerWithReadQueryPool,
  watchStarter: McpWatchStarter = startForegroundWatch,
  journalFactory: McpAutoSyncJournalFactory = (projectPath, writable) =>
    new SqliteAutoSyncDiagnosticJournal(projectPath, { writable }),
  ownerLeaseFactory: McpAutoSyncOwnerLeaseFactory = (projectPath) =>
    new SqliteAutoSyncOwnerLease(projectPath)
): Promise<void> {
  const autoSyncEnabled = options.autoSync ?? true;
  const journalWritable = autoSyncEnabled && (options.diagnosticJournal ?? true);
  const journal = journalFactory(options.projectPath, journalWritable);
  const tracker = new AutoSyncStatusTracker({
    enabled: autoSyncEnabled,
    nativeEventsRequested: options.poll !== true
  });
  const mcpService = withAutoSyncObservability(service, options.projectPath, tracker, journal);
  let watchSession: ForegroundWatchSession | null = null;
  let ownerLease: AcquiredAutoSyncOwnerLease | null = null;
  const recordReceipt = (receipt: WatchReceipt): void => {
    const event = tracker.record(receipt);
    if (event !== null && journalWritable) {
      journal.append(event);
    }
  };
  try {
    if (autoSyncEnabled) {
      const watchOptions: ForegroundWatchOptions = {
        projectPath: options.projectPath,
        force: options.force ?? false,
        intervalMs: options.intervalMs ?? DEFAULT_WATCH_INTERVAL_MS,
        ...(options.poll === true ? {} : { eventSource: new NodeFileSystemWatchSource() }),
        onReceipt: recordReceipt
      };
      // Match the foreground watch safety gate before the owner database is
      // opened, so a rejected broad path never gains a project-local lock file.
      service.assertSafeProjectPath({
        projectPath: watchOptions.projectPath,
        force: watchOptions.force ?? false
      });
      const acquired = ownerLeaseFactory(options.projectPath).acquire();
      if (acquired.state === "owned") {
        ownerLease = acquired;
        tracker.markOwnerLeaseOwned(new Date().toISOString());
        watchSession = await watchStarter(service, watchOptions);
      } else {
        recordReceipt(ownerLeaseUnavailableReceipt(options.projectPath, acquired.error));
      }
    }
    const mcpSession = await serverRunner(mcpService, options.projectPath);
    await mcpSession.closed;
  } finally {
    try {
      if (watchSession !== null) {
        await watchSession.stop();
      }
    } finally {
      ownerLease?.release();
    }
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

function collectPlugin(value: string, previous: readonly string[] = []): string[] {
  return [...previous, value];
}

function addPluginOptions(command: Command): Command {
  return command
    .option(
      "--plugin <path>",
      "Load an explicit local .js/.mjs/.cjs plugin module for indexing (repeatable)",
      collectPlugin
    )
    .option(
      "--allow-external-plugin",
      "Trust explicitly named plugin modules whose real paths are outside the project root"
    );
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
  service?: SymbolLatticeService,
  watchRunner: WatchCommandRunner = runForegroundWatch,
  mcpRunner: McpCommandRunner = runMcpWithAutoSync,
  pluginServiceFactory: PluginServiceFactory = createPluginService,
  upgradePlanner: UpgradePlanner = runUpgradeCommand
): Command {
  const coreService = service ?? createService();
  const indexingService = async (
    projectPath: string,
    options: PluginCommandOptions
  ): Promise<SymbolLatticeService> => {
    const modulePaths = options.plugin ?? [];
    if (options.allowExternalPlugin === true && modulePaths.length === 0) {
      throw new SymbolLatticeError(
        "INVALID_PLUGIN_MODULE",
        '"--allow-external-plugin" requires at least one explicit "--plugin <path>".'
      );
    }
    if (service !== undefined || modulePaths.length === 0) {
      return coreService;
    }
    return pluginServiceFactory({
      projectPath,
      modulePaths,
      allowExternalModules: options.allowExternalPlugin ?? false
    });
  };
  const program = new Command();
  program
    .name("symbol-lattice")
    .description("Evidence-first local code intelligence across a multi-language, framework-aware catalog.")
    .version(SYMBOL_LATTICE_VERSION);

  addJsonOption(program.command("upgrade [version]"))
    .description("Preview, verify, or explicitly apply a release upgrade")
    .option("--check", "Report the current and selected release without producing a mutation")
    .option("--verify", "Download and verify the tarball, checksum, manifest, and GitHub attestation")
    .option("--apply", "Install the verified release into a proven npm local or global installation")
    .option("--yes", "Explicitly confirm the mutation requested by --apply")
    .option("--force", "Reinstall even when the selected release matches the current version")
    .option("--allow-downgrade", "Permit an explicitly pinned older version together with --apply")
    .action(async (version: string | undefined, options: UpgradeCliOptions) => {
      render(
        await upgradePlanner({
          ...(version === undefined ? {} : { version }),
          check: options.check ?? false,
          ...(options.verify === true ? { verify: true } : {}),
          ...(options.apply === true ? { apply: true } : {}),
          ...(options.yes === true ? { yes: true } : {}),
          ...(options.force === true ? { force: true } : {}),
          ...(options.allowDowngrade === true ? { allowDowngrade: true } : {})
        }),
        options
      );
    });

  addJsonOption(addPluginOptions(addIndexOptions(addProjectOption(program.command("init [path]")))))
    .action(async (path: string | undefined, options: IndexCommandOptions) => {
      const projectPath = resolve(path ?? defaultProjectPath(options));
      const commandService = await indexingService(projectPath, options);
      render(
        await commandService.init(toIndexOptions(projectPath, options)),
        options
      );
    });

  addJsonOption(addPluginOptions(addIndexOptions(addProjectOption(program.command("index [path]")))))
    .action(async (path: string | undefined, options: IndexCommandOptions) => {
      const projectPath = resolve(path ?? defaultProjectPath(options));
      const commandService = await indexingService(projectPath, options);
      render(
        await commandService.index(toIndexOptions(projectPath, options)),
        options
      );
    });

  addJsonOption(addPluginOptions(addIndexOptions(addProjectOption(program.command("sync [path]")))))
    .action(async (path: string | undefined, options: IndexCommandOptions) => {
      const projectPath = resolve(path ?? defaultProjectPath(options));
      const commandService = await indexingService(projectPath, options);
      render(
        await commandService.sync(toIndexOptions(projectPath, options)),
        options
      );
    });

  addPluginOptions(addProjectOption(program.command("watch [path]")))
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
      const commandService = await indexingService(projectPath, options);
      await watchRunner(commandService, {
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
      render(await coreService.getStatus(projectPath), options);
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
        await coreService.history(resolve(path ?? defaultProjectPath(options)), historyOptions),
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
          await coreService.diff(
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
      render(await coreService.find(defaultProjectPath(options), query, findOptions), options);
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
      render(await coreService.find(defaultProjectPath(options), query, findOptions), options);
    });

  addJsonOption(addProjectOption(program.command("node <reference>"))).action(
    async (reference: string, options: ProjectOptions) => {
      render(await coreService.node(defaultProjectPath(options), reference), options);
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
      "--language <typescript|javascript|python|go|rust|java|php|cpp>",
      "Restrict results to one supported indexed source language",
      parseSearchLanguage
    )
    .action(async (query: string, options: SearchCommandOptions) => {
      const searchOptions: SearchOptions = {
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        ...(options.path === undefined ? {} : { pathPrefix: options.path }),
        ...(options.language === undefined ? {} : { language: options.language })
      };
      render(
        await coreService.search(defaultProjectPath(options), normalizeSearchQuery(query), searchOptions),
        options
      );
    });

  addJsonOption(addProjectOption(program.command("investigate <query>")))
    .option(
      "--search-limit <count>",
      `Maximum indexed source matches to inspect (1-${MAX_SOURCE_SEARCH_LIMIT})`,
      parseSearchLimit
    )
    .option(
      "--symbol-limit <count>",
      `Maximum selected symbol contexts (1-${MAX_INVESTIGATE_SYMBOL_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_INVESTIGATE_SYMBOL_LIMIT)
    )
    .option(
      "--ranking <lexical|structure|impact|topology>",
      "Select persisted FTS order, direct static structure, bounded exact reverse impact, or bounded exact-static topology ranking",
      parseInvestigateRanking
    )
    .option("--path <project-relative-prefix>", "Restrict persisted source matches to a project-relative prefix", parseSearchPath)
    .option(
      "--language <language>",
      "Restrict persisted source matches to one supported indexed language",
      parseSearchLanguage
    )
    .option(
      "--relation-limit <count>",
      `Maximum callers and callees per selected symbol (1-${MAX_CONTEXT_RELATION_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_CONTEXT_RELATION_LIMIT)
    )
    .option(
      "--max-hops <count>",
      `Maximum directed evidence-path hops (1-${MAX_CONTEXT_MAX_HOPS})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_CONTEXT_MAX_HOPS)
    )
    .option(
      "--impact-depth <count>",
      `Maximum reverse impact depth per selected symbol (1-${MAX_CONTEXT_IMPACT_DEPTH})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_CONTEXT_IMPACT_DEPTH)
    )
    .option(
      "--impact-limit <count>",
      `Maximum reverse impact paths per selected symbol (1-${MAX_CONTEXT_IMPACT_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_CONTEXT_IMPACT_LIMIT)
    )
    .action(async (query: string, options: InvestigateCommandOptions) => {
      const investigateOptions: InvestigateOptions = {
        ...(options.searchLimit === undefined ? {} : { searchLimit: options.searchLimit }),
        ...(options.symbolLimit === undefined ? {} : { symbolLimit: options.symbolLimit }),
        ...(options.ranking === undefined ? {} : { ranking: options.ranking }),
        ...(options.path === undefined ? {} : { pathPrefix: options.path }),
        ...(options.language === undefined ? {} : { language: options.language }),
        ...(options.relationLimit === undefined ? {} : { relationLimit: options.relationLimit }),
        ...(options.maxHops === undefined ? {} : { maxHops: options.maxHops }),
        ...(options.impactDepth === undefined ? {} : { impactDepth: options.impactDepth }),
        ...(options.impactLimit === undefined ? {} : { impactLimit: options.impactLimit })
      };
      render(
        await coreService.investigate(
          defaultProjectPath(options),
          normalizeSearchQuery(query),
          investigateOptions
        ),
        options
      );
    });

  addJsonOption(addProjectOption(program.command("files [path]")))
    .option(
      "--path <project-relative-prefix>",
      "Restrict persisted file records to a project-relative prefix",
      parseSearchPath
    )
    .option(
      "--language <language>",
      "Restrict persisted file records to one supported indexed language",
      parseSearchLanguage
    )
    .option(
      "--pattern <project-relative-glob>",
      "Restrict persisted file records with anchored *, ?, and ** glob semantics",
      parseFilePattern
    )
    .option(
      "--format <format>",
      `Project returned files as ${FILE_FORMATS.join(", ")}`,
      parseFileFormat
    )
    .option(
      "--max-depth <count>",
      `Maximum rendered tree depth (1-${MAX_FILE_TREE_DEPTH}; tree format only)`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_FILE_TREE_DEPTH)
    )
    .option(
      "--cursor <opaque-cursor>",
      "Continue a generation-bound persisted file listing",
      parseFileCursor
    )
    .option(
      "--limit <count>",
      `Maximum indexed file records to return (1-${MAX_FILE_LIMIT})`,
      (value: string) => parseBoundedPositiveInteger(value, MAX_FILE_LIMIT)
    )
    .action(async (projectPath: string | undefined, options: FilesCommandOptions) => {
      const fileOptions: FilesOptions = {
        ...(options.path === undefined ? {} : { pathPrefix: options.path }),
        ...(options.language === undefined ? {} : { language: options.language }),
        ...(options.pattern === undefined ? {} : { pattern: options.pattern }),
        ...(options.format === undefined ? {} : { format: options.format }),
        ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        ...(options.cursor === undefined ? {} : { cursor: options.cursor })
      };
      render(
        await coreService.files(resolve(projectPath ?? defaultProjectPath(options)), fileOptions),
        options
      );
    });

  addJsonOption(addProjectOption(program.command("routes [path]")))
    .option(
      "--method <method>",
      `Restrict results to one uppercase HTTP method or NAVIGATE (${ROUTE_METHODS.join(", ")})`,
      parseRouteMethod
    )
    .option(
      "--path <route-path-prefix>",
      "Restrict results to a slash-leading route path prefix",
      parseRoutePathPrefix
    )
    .option(
      "--domain <exact-domain>",
      "Restrict results to one exact literal route domain",
      parseRouteDomain
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
        ...(options.domain === undefined ? {} : { domain: options.domain }),
        ...(options.limit === undefined ? {} : { limit: options.limit })
      };
      render(
        await coreService.routes(resolve(path ?? defaultProjectPath(options)), routeOptions),
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
        await coreService.entrypoints(resolve(path ?? defaultProjectPath(options)), entrypointOptions),
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
      render(await coreService.hierarchy(defaultProjectPath(options), reference, hierarchyOptions), options);
    });

  for (const commandName of ["callers", "callees"] as const) {
    addJsonOption(addProjectOption(program.command(`${commandName} <symbol>`))).action(
      async (reference: string, options: ProjectOptions) => {
        const projectPath = defaultProjectPath(options);
        const result =
          commandName === "callers"
            ? await coreService.callers(projectPath, reference)
            : await coreService.callees(projectPath, reference);
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
        await coreService.impact(defaultProjectPath(options), reference, impactOptions),
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
      "--path-prefix <project-relative-path>",
      "Restrict Git-selected changes to an exact file or directory on either rename/copy path side"
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
      if (!hasGitSelection && options.pathPrefix !== undefined) {
        throw new Error('"--path-prefix" requires "--working-tree" or "--base <ref>".');
      }
      if (hasGitSelection) {
        const gitOptions: GitAffectedTestsOptions = {
          ...affectedOptions,
          ...(options.base === undefined ? {} : { baseRef: options.base }),
          ...(options.pathPrefix === undefined ? {} : { pathPrefix: options.pathPrefix })
        };
        render(
          await coreService.affectedTestsFromGit(defaultProjectPath(options), gitOptions),
          options
        );
        return;
      }
      const stdinPaths = options.stdin ? parseAffectedStdin(readFileSync(0, "utf8")) : [];
      render(
        await coreService.affectedTests(defaultProjectPath(options), [...filePaths, ...stdinPaths], affectedOptions),
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
    .option(
      "--path-prefix <project-relative-path>",
      "Restrict hunks to an exact file or directory on either rename/copy path side"
    )
    .action(async (path: string | undefined, options: GitHunksCommandOptions) => {
      const gitHunksOptions: GitHunksOptions = {
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        ...(options.pathPrefix === undefined ? {} : { pathPrefix: options.pathPrefix })
      };
      render(
        await coreService.gitHunks(
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
      render(await coreService.context(defaultProjectPath(options), references, contextOptions), options);
    });

  addJsonOption(addProjectOption(program.command("explore <query>"))).action(
    async (query: string, options: ProjectOptions) => {
      render(await coreService.explore(defaultProjectPath(options), query), options);
    }
  );

  addJsonOption(addProjectOption(program.command("explain-edge <edge-id>"))).action(
    async (edgeId: string, options: ProjectOptions) => {
      render(await coreService.explainEdge(defaultProjectPath(options), edgeId), options);
    }
  );

  addJsonOption(addPluginOptions(addProjectOption(program.command("mcp-config <target>"))))
    .option("--location <scope>", "Target configuration scope: global or local (default depends on target)")
    .option("--force", "Include the explicit broad-project auto-sync permission")
    .option("--no-auto-sync", "Generate configuration with background incremental sync disabled")
    .option(
      "--no-diagnostic-journal",
      "Generate configuration with persistent auto-sync diagnostic journal writes disabled"
    )
    .option(
      "--sync-interval <milliseconds>",
      `Polling fallback interval for generated MCP auto-sync (${MIN_WATCH_INTERVAL_MS}-${MAX_WATCH_INTERVAL_MS})`,
      parseWatchInterval
    )
    .option("--poll", "Generate configuration that disables native filesystem-event acceleration")
    .option("--source", "Generate configuration that invokes this built CLI through the current Node executable")
    .option("--print-snippet", "Print only the copy-and-paste configuration snippet")
    .action((target: string, options: McpConfigCommandOptions) => {
      const result = createMcpConfig(target, createMcpCommandOptions(options));
      if (options.printSnippet === true) {
        process.stdout.write(`${result.snippet}\n`);
        return;
      }
      render(result, options);
    });

  addJsonOption(addPluginOptions(addProjectOption(program.command("mcp-doctor <target>"))))
    .option("--location <scope>", "Target configuration scope: global or local (default depends on target)")
    .option("--config <path>", "Read this configuration file instead of the target's conventional destination")
    .option("--force", "Match a configuration generated with the explicit broad-project auto-sync permission")
    .option("--no-auto-sync", "Match a configuration with background incremental sync disabled")
    .option(
      "--no-diagnostic-journal",
      "Match a configuration with persistent auto-sync diagnostic journal writes disabled"
    )
    .option(
      "--sync-interval <milliseconds>",
      `Match a generated MCP polling fallback interval (${MIN_WATCH_INTERVAL_MS}-${MAX_WATCH_INTERVAL_MS})`,
      parseWatchInterval
    )
    .option("--poll", "Match a configuration that disables native filesystem-event acceleration")
    .option("--source", "Check a configuration that invokes this built CLI through the current Node executable")
    .action((target: string, options: McpDoctorCommandOptions) => {
      const result = createMcpDoctor(target, {
        ...createMcpCommandOptions(options),
        ...(options.config === undefined ? {} : { configPath: options.config })
      });
      render(result, options);
    });

  addJsonOption(addPluginOptions(addProjectOption(program.command("mcp-install <target>"))))
    .option("--location <scope>", "Target configuration scope: global or local (default depends on target)")
    .option("--config <path>", "Write this configuration file instead of the target's conventional destination")
    .option("--backup-dir <path>", "Directory for a full pre-write configuration backup")
    .option("--apply", "Apply the displayed configuration plan (requires --yes)")
    .option("--yes", "Acknowledge that an applied plan may modify one MCP configuration file")
    .option("--force", "Include the explicit broad-project auto-sync permission")
    .option("--no-auto-sync", "Install configuration with background incremental sync disabled")
    .option(
      "--no-diagnostic-journal",
      "Install configuration with persistent auto-sync diagnostic journal writes disabled"
    )
    .option(
      "--sync-interval <milliseconds>",
      `Polling fallback interval for installed MCP auto-sync (${MIN_WATCH_INTERVAL_MS}-${MAX_WATCH_INTERVAL_MS})`,
      parseWatchInterval
    )
    .option("--poll", "Install configuration that disables native filesystem-event acceleration")
    .option("--source", "Install configuration that invokes this built CLI through the current Node executable")
    .action((target: string, options: McpInstallCommandOptions) => {
      const result = createMcpInstall(target, {
        ...createMcpCommandOptions(options),
        ...(options.config === undefined ? {} : { configPath: options.config }),
        ...(options.backupDir === undefined ? {} : { backupDirectory: options.backupDir }),
        apply: options.apply ?? false,
        yes: options.yes ?? false
      });
      render(result, options);
    });

  addJsonOption(addPluginOptions(addProjectOption(program.command("mcp-uninstall <target>"))))
    .option("--location <scope>", "Target configuration scope: global or local (default depends on target)")
    .option("--config <path>", "Update this configuration file instead of the target's conventional destination")
    .option("--backup-dir <path>", "Directory for a full pre-write configuration backup")
    .option("--apply", "Apply the displayed removal plan (requires --yes)")
    .option("--yes", "Acknowledge that an applied plan may modify one MCP configuration file")
    .option("--force", "Match a configuration with the explicit broad-project auto-sync permission")
    .option("--no-auto-sync", "Match a configuration with background incremental sync disabled")
    .option(
      "--no-diagnostic-journal",
      "Match a configuration with persistent auto-sync diagnostic journal writes disabled"
    )
    .option(
      "--sync-interval <milliseconds>",
      `Match a generated MCP polling fallback interval (${MIN_WATCH_INTERVAL_MS}-${MAX_WATCH_INTERVAL_MS})`,
      parseWatchInterval
    )
    .option("--poll", "Match a configuration that disables native filesystem-event acceleration")
    .option("--source", "Match a configuration that invokes this built CLI through the current Node executable")
    .action((target: string, options: McpUninstallCommandOptions) => {
      const result = createMcpUninstall(target, {
        ...createMcpCommandOptions(options),
        ...(options.config === undefined ? {} : { configPath: options.config }),
        ...(options.backupDir === undefined ? {} : { backupDirectory: options.backupDir }),
        apply: options.apply ?? false,
        yes: options.yes ?? false
      });
      render(result, options);
    });

  addPluginOptions(addProjectOption(program.command("serve")))
    .requiredOption("--mcp", "Run the MCP stdio server")
    .option("--force", "Allow background sync of a filesystem root or the home directory")
    .option("--no-auto-sync", "Disable background incremental sync while serving MCP")
    .option(
      "--no-diagnostic-journal",
      "Disable persistent auto-sync diagnostic journal writes while serving MCP"
    )
    .option(
      "--sync-interval <milliseconds>",
      `Polling fallback interval for MCP auto-sync (${MIN_WATCH_INTERVAL_MS}-${MAX_WATCH_INTERVAL_MS}; default ${DEFAULT_WATCH_INTERVAL_MS})`,
      parseWatchInterval
    )
    .option("--poll", "Disable native filesystem-event acceleration for MCP auto-sync")
    .action(async (options: ServeCommandOptions) => {
      const projectPath = defaultProjectPath(options);
      const autoSync = options.autoSync ?? true;
      const commandService = autoSync ? await indexingService(projectPath, options) : coreService;
      await mcpRunner(commandService, {
        projectPath,
        force: options.force ?? false,
        autoSync,
        diagnosticJournal: options.diagnosticJournal ?? true,
        intervalMs: options.syncInterval ?? DEFAULT_WATCH_INTERVAL_MS,
        poll: options.poll ?? false
      });
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

/** Recognizes direct execution and npm's Unix `.bin` symlink without importing side effects. */
export function isCliEntrypoint(
  invokedPath: string | undefined,
  modulePath: string,
  resolveRealPath: (path: string) => string = realpathSync.native
): boolean {
  if (invokedPath === undefined) return false;
  const invoked = resolve(invokedPath);
  const module = resolve(modulePath);
  const comparable = (path: string): string => process.platform === "win32" ? path.toLowerCase() : path;
  if (comparable(invoked) === comparable(module)) return true;
  try {
    return comparable(resolveRealPath(invoked)) === comparable(resolveRealPath(module));
  } catch {
    return false;
  }
}

if (isCliEntrypoint(process.argv[1], fileURLToPath(import.meta.url))) {
  void run();
}
