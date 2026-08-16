import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, parse, relative, resolve, sep } from "node:path";

import ignore, { type Ignore } from "ignore";

import type { ArtifactLanguage } from "../../domain/index.js";

export type SupportedLanguage = ArtifactLanguage;

export const SUPPORTED_EXTENSIONS: ReadonlyMap<string, SupportedLanguage> = new Map([
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".mjs", "javascript"],
  [".jsx", "javascript"],
  [".ets", "arkts"],
  [".vue", "vue"],
  [".svelte", "svelte"],
  [".astro", "astro"],
  [".razor", "razor"],
  [".cshtml", "razor"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
  [".java", "java"],
  [".groovy", "groovy"],
  [".f", "fortran"],
  [".for", "fortran"],
  [".f77", "fortran"],
  [".f90", "fortran"],
  [".f95", "fortran"],
  [".f03", "fortran"],
  [".f08", "fortran"],
  [".f18", "fortran"],
  [".ada", "ada"],
  [".adb", "ada"],
  [".ads", "ada"],
  [".php", "php"],
  [".c", "c"],
  [".lua", "lua"],
  [".luau", "luau"],
  [".pas", "pascal"],
  [".dpr", "pascal"],
  [".dpk", "pascal"],
  [".lpr", "pascal"],
  [".m", "objc"],
  [".mm", "objc"],
  [".r", "r"],
  [".ex", "elixir"],
  [".exs", "elixir"],
  [".erl", "erlang"],
  [".clj", "clojure"],
  [".pl", "perl"],
  [".pm", "perl"],
  [".jl", "julia"],
  [".hs", "haskell"],
  [".ml", "ocaml"],
  [".fs", "fsharp"],
  [".nim", "nim"],
  [".cpp", "cpp"],
  [".cc", "cpp"],
  [".cxx", "cpp"],
  [".hpp", "cpp"],
  [".hh", "cpp"],
  [".hxx", "cpp"],
  [".cs", "csharp"],
  [".rb", "ruby"],
  [".kt", "kotlin"],
  [".swift", "swift"],
  [".dart", "dart"],
  [".scala", "scala"],
  [".tf", "terraform"],
  [".tfvars", "terraform"],
  [".tofu", "terraform"],
  [".liquid", "liquid"],
  [".twig", "twig"],
  [".sol", "solidity"],
  [".cfc", "cfml"],
  [".cfm", "cfml"],
  [".cfs", "cfml"],
  [".nix", "nix"],
  [".vb", "vbnet"],
  [".cbl", "cobol"],
  [".cob", "cobol"],
  [".cobol", "cobol"],
  [".cpy", "cobol"],
  [".zig", "zig"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
  [".xml", "xml"],
  [".properties", "properties"],
  [".sh", "shell"],
  [".bash", "shell"],
  [".sql", "sql"],
  [".graphql", "graphql"],
  [".gql", "graphql"],
  [".graphqls", "graphql"],
  [".proto", "proto"]
] as const);

const OBJECTIVE_C_HEADER_EXTENSION = ".h";
const OBJECTIVE_C_HEADER_CONTAINER =
  /^[ \t]*@(interface|protocol)[ \t]+[A-Za-z_][A-Za-z0-9_]*/mu;
const OBJECTIVE_C_HEADER_END = /^[ \t]*@end[ \t]*$/mu;

/**
 * These directories contain neither user source nor SymbolLattice input. They
 * are deliberately outside `.gitignore` semantics, so a negated rule can
 * never pull one back into an index.
 */
export const HARD_EXCLUDED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  ".git",
  ".SymbolLattice",
  "coverage",
  "dist",
  "node_modules"
]);

/** Languages reachable through extension routing or a path-specific discovery rule. */
export const DISCOVERABLE_LANGUAGES: readonly SupportedLanguage[] = Object.freeze([
  ...new Set<SupportedLanguage>([...SUPPORTED_EXTENSIONS.values(), "blade"])
]);

export interface SourceFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly language: SupportedLanguage;
  readonly sourceText: string;
  readonly contentHash: string;
}

/** Full-content identity used by freshness checks without retaining source text. */
export interface SourceFileFingerprint {
  readonly relativePath: string;
  readonly language: SupportedLanguage;
  readonly contentHash: string;
}

export interface SourceDiscoveryOptions {
  /** Source directories relative to the project root. Defaults to the project root. */
  readonly scopeRoots?: readonly string[];
}

export const FRESHNESS_PATH_DISCOVERY_POLICY = "single-project-walk-v1" as const;
export const STREAMING_UTF8_HASH_POLICY = "streaming-utf8-v1" as const;
export const SOURCE_FINGERPRINT_READ_POLICY =
  "streaming-utf8-with-objective-c-header-classification-v1" as const;
export const MAXIMUM_FRESHNESS_CONCURRENT_READS = 8 as const;
/** Full source reads retain text, so keep descriptor pressure bounded on large repositories. */
export const MAXIMUM_SOURCE_CONCURRENT_READS = 8 as const;

export type SourceTextReader = (absolutePath: string) => Promise<string>;

export interface FreshnessProjectPathDiscovery {
  readonly policy: typeof FRESHNESS_PATH_DISCOVERY_POLICY;
  readonly sourcePaths: readonly string[];
  readonly configurationPaths: readonly string[];
}

export interface FreshnessProjectPathDiscoveryOptions extends SourceDiscoveryOptions {
  readonly isConfigurationCandidateFileName: (fileName: string) => boolean;
}

/**
 * A stable byte-wise comparison avoids host locale settings affecting graph
 * input order. All paths passed here are normalized POSIX project-relative
 * strings.
 */
export function compareProjectPaths(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

export function toProjectRelativePath(projectPath: string, targetPath: string): string {
  const normalizedProjectPath = resolve(projectPath);
  const normalizedTargetPath = isAbsolute(targetPath)
    ? resolve(targetPath)
    : resolve(normalizedProjectPath, targetPath);
  const value = relative(normalizedProjectPath, normalizedTargetPath);

  if (
    value === "" ||
    value === ".." ||
    value.startsWith(`..${sep}`) ||
    isAbsolute(value)
  ) {
    throw new Error(`Path is outside the project: ${targetPath}`);
  }

  return value.split(sep).join("/");
}

/**
 * Canonicalize directory scopes once, before walking any files. An empty list
 * has the same meaning as an omitted list: index the project root.
 */
export async function canonicalizeScopeRoots(
  projectPath: string,
  scopeRoots?: readonly string[]
): Promise<readonly string[]> {
  const normalizedProjectPath = resolve(projectPath);
  const requestedRoots = scopeRoots === undefined || scopeRoots.length === 0 ? ["."] : scopeRoots;
  const canonicalRoots = new Set<string>();

  for (const scopeRoot of requestedRoots) {
    if (isAbsolute(scopeRoot)) {
      throw new Error(`Scope root must be project-relative: ${scopeRoot}`);
    }

    const absoluteScopeRoot = resolve(normalizedProjectPath, scopeRoot);
    const relativeScopeRoot = toProjectRelativeDirectoryPath(
      normalizedProjectPath,
      absoluteScopeRoot,
      scopeRoot
    );
    const metadata = await stat(absoluteScopeRoot);

    if (!metadata.isDirectory()) {
      throw new Error(`Scope root is not a directory: ${scopeRoot}`);
    }

    canonicalRoots.add(relativeScopeRoot);
  }

  const sortedRoots = [...canonicalRoots].sort(compareProjectPaths);
  return sortedRoots.filter(
    (candidate, index) =>
      !sortedRoots.slice(0, index).some((ancestor) => isScopeAncestor(ancestor, candidate))
  );
}

export function getSourceLanguage(
  filePath: string,
  sourceText?: string
): SupportedLanguage | null {
  if (isPlayRoutesFile(filePath)) {
    return "scala";
  }
  if (filePath.toLowerCase().endsWith(".blade.php")) {
    return "blade";
  }
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (extension === OBJECTIVE_C_HEADER_EXTENSION) {
    return sourceText !== undefined && isProvenObjectiveCHeader(sourceText) ? "objc" : null;
  }
  return SUPPORTED_EXTENSIONS.get(extension) ?? null;
}

export function hashSource(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}

/** Hash decoded UTF-8 incrementally without retaining the complete file string. */
export async function hashUtf8File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath, { encoding: "utf8" });
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export function isUnsafeProjectPath(projectPath: string): boolean {
  const normalizedPath = resolve(projectPath);
  return normalizedPath === parse(normalizedPath).root || normalizedPath === resolve(homedir());
}

export async function discoverSourceFiles(
  projectPath: string,
  options?: SourceDiscoveryOptions
): Promise<readonly SourceFile[]> {
  const normalizedProjectPath = resolve(projectPath);
  const scopeRoots = await canonicalizeScopeRoots(normalizedProjectPath, options?.scopeRoots);
  const ignoreMatcher = await loadRootGitignore(normalizedProjectPath);
  const paths = (
    await Promise.all(
      scopeRoots.map(async (scopeRoot) => {
        if (containsHardExcludedDirectory(scopeRoot)) {
          return [];
        }

        return collectSourcePaths(
          resolve(normalizedProjectPath, scopeRoot),
          scopeRoot,
          ignoreMatcher
        );
      })
    )
  ).flat();
  const sourceFiles = await loadSourcePaths(normalizedProjectPath, paths);

  return sourceFiles.sort((left, right) => compareProjectPaths(left.relativePath, right.relativePath));
}

/**
 * Loads source text in bounded batches. Exposed for deterministic concurrency tests; callers
 * normally use `discoverSourceFiles`, which supplies native UTF-8 reads and discovered paths.
 */
export async function loadSourcePaths(
  projectPath: string,
  paths: readonly string[],
  readSourceText: SourceTextReader = (absolutePath) => readFile(absolutePath, "utf8")
): Promise<SourceFile[]> {
  const normalizedProjectPath = resolve(projectPath);
  const sourceFiles: SourceFile[] = [];
  for (let offset = 0; offset < paths.length; offset += MAXIMUM_SOURCE_CONCURRENT_READS) {
    const batch = await Promise.all(
      paths.slice(offset, offset + MAXIMUM_SOURCE_CONCURRENT_READS).map(async (absolutePath) => {
        const sourceText = await readSourceText(absolutePath);
        const language = getSourceLanguage(absolutePath, sourceText);
        if (language === null) {
          if (isObjectiveCHeaderPath(absolutePath)) {
            return null;
          }
          throw new Error(`Unsupported source file was discovered: ${absolutePath}`);
        }
        return {
          absolutePath,
          relativePath: toProjectRelativePath(normalizedProjectPath, absolutePath),
          language,
          sourceText,
          contentHash: hashSource(sourceText)
        } satisfies SourceFile;
      })
    );
    for (const file of batch) {
      if (file !== null) {
        sourceFiles.push(file);
      }
    }
  }
  return sourceFiles;
}

/**
 * Re-hashes every discovered source file while retaining only its compact
 * identity. Bounded batches prevent a no-op sync from holding the whole
 * project's source text in memory, while full SHA-256 verification avoids the
 * same-size/same-mtime blind spot of metadata-only caches.
 */
export async function discoverSourceFileFingerprints(
  projectPath: string,
  options?: SourceDiscoveryOptions
): Promise<readonly SourceFileFingerprint[]> {
  const normalizedProjectPath = resolve(projectPath);
  const paths = await discoverSourcePaths(normalizedProjectPath, options);
  return fingerprintSourcePaths(normalizedProjectPath, paths);
}

export async function fingerprintSourcePaths(
  projectPath: string,
  paths: readonly string[]
): Promise<readonly SourceFileFingerprint[]> {
  const normalizedProjectPath = resolve(projectPath);
  const fingerprints: SourceFileFingerprint[] = [];

  for (let offset = 0; offset < paths.length; offset += MAXIMUM_FRESHNESS_CONCURRENT_READS) {
    const batch = await Promise.all(
      paths.slice(offset, offset + MAXIMUM_FRESHNESS_CONCURRENT_READS).map(async (absolutePath) => {
        const objectiveCHeader = isObjectiveCHeaderPath(absolutePath);
        const sourceText = objectiveCHeader ? await readFile(absolutePath, "utf8") : undefined;
        const language = getSourceLanguage(absolutePath, sourceText);
        if (language === null) {
          if (objectiveCHeader) {
            return null;
          }
          throw new Error(`Unsupported source file was discovered: ${absolutePath}`);
        }
        return {
          relativePath: toProjectRelativePath(normalizedProjectPath, absolutePath),
          language,
          contentHash: sourceText === undefined ? await hashUtf8File(absolutePath) : hashSource(sourceText)
        };
      })
    );
    for (const fingerprint of batch) {
      if (fingerprint !== null) {
        fingerprints.push(fingerprint);
      }
    }
  }

  return fingerprints.sort((left, right) => compareProjectPaths(left.relativePath, right.relativePath));
}

/**
 * Walk the project once for both scoped, gitignore-aware source paths and
 * project-wide resolver configuration candidates.
 */
export async function discoverFreshnessProjectPaths(
  projectPath: string,
  options: FreshnessProjectPathDiscoveryOptions
): Promise<FreshnessProjectPathDiscovery> {
  const normalizedProjectPath = resolve(projectPath);
  const scopeRoots = (await canonicalizeScopeRoots(normalizedProjectPath, options.scopeRoots))
    .filter((scopeRoot) => !containsHardExcludedDirectory(scopeRoot));
  const ignoreMatcher = await loadRootGitignore(normalizedProjectPath);
  const sourcePaths: string[] = [];
  const configurationPaths: string[] = [];

  const insideSourceScope = (path: string): boolean =>
    scopeRoots.some((scopeRoot) => scopeRoot === "." || path.startsWith(`${scopeRoot}/`));

  async function visit(directoryPath: string, directoryRelativePath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => compareProjectPaths(left.name, right.name))) {
      const entryPath = resolve(directoryPath, entry.name);
      const entryRelativePath = joinProjectRelativePath(directoryRelativePath, entry.name);
      if (entry.isDirectory()) {
        if (!HARD_EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
          await visit(entryPath, entryRelativePath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (options.isConfigurationCandidateFileName(entry.name)) {
        configurationPaths.push(entryRelativePath);
      }
      if (
        insideSourceScope(entryRelativePath) &&
        isSourceCandidatePath(entryRelativePath) &&
        !ignoreMatcher.ignores(entryRelativePath)
      ) {
        sourcePaths.push(entryPath);
      }
    }
  }

  await visit(normalizedProjectPath, ".");
  return {
    policy: FRESHNESS_PATH_DISCOVERY_POLICY,
    sourcePaths,
    configurationPaths: configurationPaths.sort(compareProjectPaths)
  };
}

async function discoverSourcePaths(
  normalizedProjectPath: string,
  options?: SourceDiscoveryOptions
): Promise<readonly string[]> {
  const scopeRoots = await canonicalizeScopeRoots(normalizedProjectPath, options?.scopeRoots);
  const ignoreMatcher = await loadRootGitignore(normalizedProjectPath);
  return (
    await Promise.all(
      scopeRoots.map(async (scopeRoot) => {
        if (containsHardExcludedDirectory(scopeRoot)) {
          return [];
        }
        return collectSourcePaths(
          resolve(normalizedProjectPath, scopeRoot),
          scopeRoot,
          ignoreMatcher
        );
      })
    )
  ).flat();
}

async function collectSourcePaths(
  directoryPath: string,
  directoryRelativePath: string,
  ignoreMatcher: Ignore
): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const sourcePaths: string[] = [];

  for (const entry of entries.sort((left, right) => compareProjectPaths(left.name, right.name))) {
    const entryPath = resolve(directoryPath, entry.name);
    const entryRelativePath = joinProjectRelativePath(directoryRelativePath, entry.name);

    if (entry.isDirectory()) {
      if (!HARD_EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
        // Never prune an ordinary ignored directory here. Gitignore negation
        // rules can re-include descendants, so every non-hard-excluded branch
        // must still be inspected.
        sourcePaths.push(
          ...(await collectSourcePaths(entryPath, entryRelativePath, ignoreMatcher))
        );
      }
      continue;
    }

    if (
      entry.isFile() &&
      isSourceCandidatePath(entryRelativePath) &&
      !ignoreMatcher.ignores(entryRelativePath)
    ) {
      sourcePaths.push(entryPath);
    }
  }

  return sourcePaths;
}

function isPlayRoutesFile(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return /(?:^|\/)conf\/(?:routes|[^/]+\.routes)$/u.test(normalized);
}

function isSourceCandidatePath(filePath: string): boolean {
  return getSourceLanguage(filePath) !== null || isObjectiveCHeaderPath(filePath);
}

function isObjectiveCHeaderPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(OBJECTIVE_C_HEADER_EXTENSION);
}

/**
 * A bare .h extension is ambiguous among C, C++, and Objective-C. Accept it
 * only when a direct Objective-C container and its closing @end remain after
 * comments, literals, and preprocessor directives are blanked. The extractor
 * independently validates the container before emitting symbols.
 */
function isProvenObjectiveCHeader(sourceText: string): boolean {
  const sanitized = sanitizeObjectiveCHeaderSource(sourceText);
  if (sanitized === null) {
    return false;
  }
  const container = OBJECTIVE_C_HEADER_CONTAINER.exec(sanitized);
  if (container === null) {
    return false;
  }

  return OBJECTIVE_C_HEADER_END.test(sanitized.slice(container.index + container[0].length));
}

function sanitizeObjectiveCHeaderSource(sourceText: string): string | null {
  let result = "";
  const directiveStarts = new Set<number>();
  let mode: "code" | "line-comment" | "block-comment" | "string" | "character" | "preprocessor" =
    "code";

  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index] ?? "";
    const next = sourceText[index + 1] ?? "";

    if (mode === "line-comment") {
      result += character === "\n" ? "\n" : " ";
      if (character === "\n") {
        mode = "code";
      }
      continue;
    }

    if (mode === "block-comment") {
      if (character === "*" && next === "/") {
        result += "  ";
        index += 1;
        mode = "code";
      } else {
        result += character === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (mode === "string" || mode === "character") {
      if (character === "\\") {
        result += " ";
        if (next.length > 0) {
          result += next === "\n" ? "\n" : " ";
          index += 1;
        }
      } else {
        result += character === "\n" ? "\n" : " ";
        if (
          (mode === "string" && character === "\"") ||
          (mode === "character" && character === "'")
        ) {
          mode = "code";
        }
      }
      continue;
    }

    if (mode === "preprocessor") {
      result += character === "\n" ? "\n" : " ";
      if (character === "\n" && !isPreprocessorContinuation(sourceText, index)) {
        mode = "code";
      }
      continue;
    }

    if (character === "/" && next === "/") {
      result += "  ";
      index += 1;
      mode = "line-comment";
      continue;
    }
    if (character === "/" && next === "*") {
      result += "  ";
      index += 1;
      mode = "block-comment";
      continue;
    }
    if (character === "\"") {
      result += " ";
      mode = "string";
      continue;
    }
    if (character === "'") {
      result += " ";
      mode = "character";
      continue;
    }
    if (character === "#" && isObjectiveCPreprocessorPrefix(result, index)) {
      directiveStarts.add(index);
      result += " ";
      mode = "preprocessor";
      continue;
    }

    result += character;
  }

  return blankUnknownObjectiveCHeaderConditionalRegions(sourceText, result, directiveStarts);
}

function blankUnknownObjectiveCHeaderConditionalRegions(
  sourceText: string,
  sanitizedText: string,
  directiveStarts: ReadonlySet<number>
): string | null {
  const characters = sanitizedText.split("");
  const stack: Array<{ sawElse: boolean }> = [];
  const orderedDirectiveStarts = [...directiveStarts];
  let directiveIndex = 0;
  let lineStart = 0;

  while (lineStart <= sourceText.length) {
    const lineFeed = sourceText.indexOf("\n", lineStart);
    const rawEnd = lineFeed === -1 ? sourceText.length : lineFeed;
    const lineEnd = rawEnd > lineStart && sourceText[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
    const lineText = sourceText.slice(lineStart, lineEnd);
    while ((orderedDirectiveStarts[directiveIndex] ?? Number.POSITIVE_INFINITY) < lineStart) {
      directiveIndex += 1;
    }
    const candidateDirectiveOffset = orderedDirectiveStarts[directiveIndex];
    const directiveOffset =
      candidateDirectiveOffset !== undefined && candidateDirectiveOffset < lineEnd
        ? candidateDirectiveOffset
        : undefined;

    if (directiveOffset !== undefined) {
      directiveIndex += 1;
      const directiveText = sourceText.slice(directiveOffset, lineEnd);
      const directive = /^\s*#\s*([A-Za-z_][A-Za-z0-9_]*)\b(.*)$/u.exec(directiveText);
      if (directive === null) {
        return null;
      }
      const keyword = directive[1]?.toLowerCase();
      const argument = directive[2]?.trim() ?? "";
      if (keyword === "if" || keyword === "ifdef" || keyword === "ifndef") {
        if (
          argument.length === 0 ||
          ((keyword === "ifdef" || keyword === "ifndef") &&
            !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(argument))
        ) {
          return null;
        }
        stack.push({ sawElse: false });
      } else if (keyword === "elif") {
        const frame = stack.at(-1);
        if (frame === undefined || frame.sawElse || argument.length === 0) {
          return null;
        }
      } else if (keyword === "else") {
        const frame = stack.at(-1);
        if (frame === undefined || frame.sawElse || argument.length !== 0) {
          return null;
        }
        frame.sawElse = true;
      } else if (keyword === "endif") {
        if (stack.length === 0 || argument.length !== 0) {
          return null;
        }
        stack.pop();
      }
    } else if (stack.length > 0) {
      for (let index = lineStart; index < lineEnd; index += 1) {
        characters[index] = " ";
      }
    }

    if (lineFeed === -1) {
      break;
    }
    lineStart = lineFeed + 1;
  }

  return stack.length === 0 ? characters.join("") : null;
}

function isObjectiveCPreprocessorPrefix(sanitizedPrefix: string, index: number): boolean {
  const lineStart = sanitizedPrefix.lastIndexOf("\n", index - 1) + 1;
  return /^[ \t\f\v]*$/u.test(sanitizedPrefix.slice(lineStart, index));
}

function isPreprocessorContinuation(sourceText: string, lineFeedIndex: number): boolean {
  const previousIndex =
    sourceText[lineFeedIndex - 1] === "\r" ? lineFeedIndex - 2 : lineFeedIndex - 1;
  return sourceText[previousIndex] === "\\";
}

async function loadRootGitignore(projectPath: string): Promise<Ignore> {
  const matcher = ignore({ ignoreCase: false });
  const gitignorePath = resolve(projectPath, ".gitignore");

  try {
    matcher.add(await readFile(gitignorePath, "utf8"));
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  return matcher;
}

function toProjectRelativeDirectoryPath(
  projectPath: string,
  targetPath: string,
  originalScopeRoot: string
): string {
  const value = relative(projectPath, targetPath);

  if (value === "") {
    return ".";
  }

  if (value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    throw new Error(`Scope root is outside the project: ${originalScopeRoot}`);
  }

  return value.split(sep).join("/");
}

function isScopeAncestor(ancestor: string, candidate: string): boolean {
  return ancestor === "." || candidate.startsWith(`${ancestor}/`);
}

function containsHardExcludedDirectory(relativePath: string): boolean {
  return relativePath !== "." && relativePath.split("/").some((name) => HARD_EXCLUDED_DIRECTORY_NAMES.has(name));
}

function joinProjectRelativePath(directoryPath: string, entryName: string): string {
  return directoryPath === "." ? entryName : `${directoryPath}/${entryName}`;
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
