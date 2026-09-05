import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, parse, relative, resolve, sep } from "node:path";

import type { ArtifactLanguage } from "../../domain/index.js";
import {
  nativeProjectFilesystemReader,
  ProjectPathAccessCollector,
  projectFilesystemMissingCode,
  type ProjectFilesystemReader
} from "./project-filesystem.js";
import {
  canonicalizeScopedProjectRoots,
  compareScopedProjectPaths,
  walkScopedProject
} from "./scoped-walker.js";

export { HARD_EXCLUDED_DIRECTORY_NAMES } from "./project-filesystem.js";

export type SupportedLanguage = ArtifactLanguage;

export const SUPPORTED_EXTENSIONS: ReadonlyMap<string, SupportedLanguage> = new Map([
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
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
  [".html", "html"],
  [".htm", "html"],
  [".jsp", "jsp"],
  [".jspf", "jsp"],
  [".jspx", "jsp"],
  [".tag", "jsp"],
  [".tagx", "jsp"],
  [".css", "css"],
  [".properties", "properties"],
  [".sh", "shell"],
  [".bash", "shell"],
  [".sql", "sql"],
  [".graphql", "graphql"],
  [".gql", "graphql"],
  [".graphqls", "graphql"],
  [".proto", "proto"],
  [".md", "markdown"],
  [".markdown", "markdown"]
] as const);

const OBJECTIVE_C_HEADER_EXTENSION = ".h";
const PASCAL_PP_EXTENSION = ".pp";
const PASCAL_PP_MODULE_HEADER = /^(?:\s*)(?:unit|program|library)\s+[A-Za-z_][A-Za-z0-9_]*\s*;\s*$/iu;
const OBJECTIVE_C_HEADER_CONTAINER =
  /^[ \t]*@(interface|protocol)[ \t]+[A-Za-z_][A-Za-z0-9_]*/mu;
const OBJECTIVE_C_HEADER_END = /^[ \t]*@end[ \t]*$/mu;
const C_HEADER_MARKER =
  /(^|\n)[ \t]*(?:#\s*include\b|typedef\b|struct\b|union\b|enum\b|extern\b|static\b|(?:void|char|short|int|long|float|double|unsigned|signed)\b)/mu;
const CPP_HEADER_MARKER =
  /(^|\n)[ \t]*(?:class\b|namespace\b|template\b|concept\b|using\b|#\s*include\s*[<"][^>"]+\.(?:hpp|hh|hxx)\b)|::/mu;

export const SHELL_SHEBANG_ALLOWLIST = Object.freeze([
  "#!/bin/sh",
  "#!/usr/bin/sh",
  "#!/bin/dash",
  "#!/usr/bin/dash",
  "#!/bin/bash",
  "#!/usr/bin/bash",
  "#!/usr/bin/env sh",
  "#!/usr/bin/env dash",
  "#!/usr/bin/env bash"
] as const);

/** Longest allowlisted line plus two bytes, so a suffix, LF, or CRLF is observable. */
export const MAXIMUM_SHELL_SHEBANG_READ_BYTES = 21 as const;

/** Languages reachable through extension routing or a path-specific discovery rule. */
export const DISCOVERABLE_LANGUAGES: readonly SupportedLanguage[] = Object.freeze([
  ...new Set<SupportedLanguage>([...SUPPORTED_EXTENSIONS.values(), "blade"])
]);

export interface SourceFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly language: SupportedLanguage;
  readonly sourceText: string;
  /** Retained for byte-sensitive Shell and Lua parser contracts. */
  readonly sourceBytes?: Uint8Array;
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
  /** Injectable only to make the bounded, ignore-before-read policy testable. */
  readonly shellShebangReader?: ShellShebangReader;
  /** Injectable filesystem seam for deterministic access-error tests. */
  readonly filesystemReader?: ProjectFilesystemReader;
}

export const FRESHNESS_PATH_DISCOVERY_POLICY = "single-project-walk-v3" as const;
export const STREAMING_UTF8_HASH_POLICY = "streaming-utf8-v1" as const;
export const SOURCE_FINGERPRINT_READ_POLICY =
  "streaming-raw-bytes-for-shell-and-lua-with-objective-c-header-classification-v4" as const;
export const MAXIMUM_FRESHNESS_CONCURRENT_READS = 8 as const;
/** Full source reads retain text, so keep descriptor pressure bounded on large repositories. */
export const MAXIMUM_SOURCE_CONCURRENT_READS = 8 as const;

export type SourceTextReader = (absolutePath: string) => Promise<string>;
export type ShellShebangReader = (
  absolutePath: string,
  maximumBytes: number
) => Promise<Uint8Array>;

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
  return compareScopedProjectPaths(left, right);
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
  scopeRoots?: readonly string[],
  filesystemReader: ProjectFilesystemReader = nativeProjectFilesystemReader
): Promise<readonly string[]> {
  return canonicalizeScopedProjectRoots(projectPath, scopeRoots, filesystemReader);
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
  if (extension === PASCAL_PP_EXTENSION) {
    return sourceText !== undefined && isPascalPpSource(sourceText) ? "pascal" : null;
  }
  if (extension === OBJECTIVE_C_HEADER_EXTENSION) {
    if (sourceText !== undefined && isProvenObjectiveCHeader(sourceText)) {
      return "objc";
    }
    if (sourceText !== undefined && isProvenCHeader(sourceText)) {
      return "c";
    }
    return null;
  }
  const extensionLanguage = SUPPORTED_EXTENSIONS.get(extension);
  if (extensionLanguage !== undefined) {
    return extensionLanguage;
  }
  return sourceText !== undefined && hasExactShellShebang(sourceText) ? "shell" : null;
}

function isPascalPpPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(PASCAL_PP_EXTENSION);
}

/**
 * `.pp` is shared by Free Pascal and Puppet. Admit it only after a lexical
 * sanitization pass proves exactly one top-level Pascal module header. The
 * gate intentionally rejects compiler-condition/include/macro taint and
 * malformed comments or strings; it is a discovery boundary, not a grammar.
 */
function isPascalPpSource(sourceText: string): boolean {
  const characters = sourceText.split("");
  let commentMode: "brace" | "paren" | null = null;
  let inString = false;
  let hasConditional = false;
  let hasMacro = false;
  let hasInclude = false;

  const blank = (index: number): void => {
    const character = characters[index];
    if (character !== undefined && character !== "\r" && character !== "\n") {
      characters[index] = " ";
    }
  };
  const markDirective = (body: string): void => {
    if (/^\s*(?:IFDEF|IFNDEF|ELSEIF|ENDIF|ELSE|IF)\b/iu.test(body)) {
      hasConditional = true;
    }
    if (/^\s*(?:DEFINE|UNDEF|MACRO)\b/iu.test(body)) {
      hasMacro = true;
    }
    if (/^\s*(?:I|INCLUDE)\b/iu.test(body)) {
      hasInclude = true;
    }
  };

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];
    if (character === undefined) {
      continue;
    }

    if (commentMode === "brace") {
      blank(index);
      if (character === "}") {
        commentMode = null;
      }
      continue;
    }
    if (commentMode === "paren") {
      blank(index);
      if (character === "*" && next === ")") {
        blank(index + 1);
        index += 1;
        commentMode = null;
      }
      continue;
    }
    if (inString) {
      if (character === "\r" || character === "\n") {
        return false;
      }
      blank(index);
      if (character === "'") {
        if (next === "'") {
          blank(index + 1);
          index += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (character === "{") {
      if (next === "$") {
        markDirective(sourceText.slice(index + 2));
      }
      blank(index);
      commentMode = "brace";
      continue;
    }
    if (character === "(" && next === "*") {
      if (characters[index + 2] === "$") {
        markDirective(sourceText.slice(index + 3));
      }
      blank(index);
      blank(index + 1);
      index += 1;
      commentMode = "paren";
      continue;
    }
    if (character === "/" && next === "/") {
      for (let commentIndex = index; commentIndex < characters.length; commentIndex += 1) {
        const commentCharacter = characters[commentIndex];
        if (commentCharacter === "\r" || commentCharacter === "\n") {
          index = commentIndex - 1;
          break;
        }
        blank(commentIndex);
        if (commentIndex === characters.length - 1) {
          index = commentIndex;
        }
      }
      continue;
    }
    if (character === "'") {
      blank(index);
      inString = true;
    }
  }

  if (commentMode !== null || inString || hasConditional || hasMacro || hasInclude) {
    return false;
  }
  const headers = characters.join("").split(/\r?\n/u).filter((line) => PASCAL_PP_MODULE_HEADER.test(line));
  return headers.length === 1;
}

function isProvenCHeader(sourceText: string): boolean {
  return !CPP_HEADER_MARKER.test(sourceText) && C_HEADER_MARKER.test(sourceText);
}

export function hashSource(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}

function hashSourceBytes(sourceBytes: Uint8Array): string {
  return createHash("sha256").update(sourceBytes).digest("hex");
}

async function hashRawFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function hashRawFileWithReader(
  filePath: string,
  filesystemReader: ProjectFilesystemReader
): Promise<string> {
  return filesystemReader === nativeProjectFilesystemReader
    ? hashRawFile(filePath)
    : hashSourceBytes(await filesystemReader.readFile(filePath));
}

/**
 * Hash decoded UTF-8 incrementally without retaining the complete file string.
 *
 * Keep this decoder aligned with `new TextDecoder("utf-8").decode(bytes)`,
 * which is the identity used by the initial source scan. An encoded Node stream
 * can preserve a leading UTF-8 BOM as U+FEFF, while TextDecoder's default policy
 * removes it. Use the same decoder here and let it distinguish the byte-order
 * mark from a subsequent, legitimate U+FEFF content code point.
 */
export async function hashUtf8File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const decoder = new TextDecoder("utf-8");
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    const decoded = decoder.decode(chunk, { stream: true });
    if (decoded.length > 0) hash.update(decoded);
  }
  const remainder = decoder.decode();
  if (remainder.length > 0) hash.update(remainder);
  return hash.digest("hex");
}

async function hashUtf8FileWithReader(
  filePath: string,
  filesystemReader: ProjectFilesystemReader
): Promise<string> {
  return filesystemReader === nativeProjectFilesystemReader
    ? hashUtf8File(filePath)
    : hashSource(new TextDecoder("utf-8").decode(await filesystemReader.readFile(filePath)));
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
  const paths = await discoverSourcePaths(normalizedProjectPath, options);
  const sourceFiles = await loadSourcePaths(
    normalizedProjectPath,
    paths,
    undefined,
    options?.filesystemReader
  );

  return sourceFiles.sort((left, right) => compareProjectPaths(left.relativePath, right.relativePath));
}

/**
 * Loads source text in bounded batches. Exposed for deterministic concurrency tests; callers
 * normally use `discoverSourceFiles`, which supplies native UTF-8 reads and discovered paths.
 */
export async function loadSourcePaths(
  projectPath: string,
  paths: readonly string[],
  readSourceText?: SourceTextReader,
  filesystemReader: ProjectFilesystemReader = nativeProjectFilesystemReader
): Promise<SourceFile[]> {
  const normalizedProjectPath = resolve(projectPath);
  const sourceFiles: SourceFile[] = [];
  const access = new ProjectPathAccessCollector(normalizedProjectPath);
  for (let offset = 0; offset < paths.length; offset += MAXIMUM_SOURCE_CONCURRENT_READS) {
    const batch = await Promise.all(
      paths.slice(offset, offset + MAXIMUM_SOURCE_CONCURRENT_READS).map(async (absolutePath) => {
        let sourceInput: string | Uint8Array;
        try {
          sourceInput = readSourceText === undefined
            ? await filesystemReader.readFile(absolutePath)
            : await readSourceText(absolutePath);
        } catch (error) {
          if (projectFilesystemMissingCode(error) !== null) return null;
          if (access.add(absolutePath, error)) return null;
          throw error;
        }
        const sourceBytes = typeof sourceInput === "string" ? undefined : sourceInput;
        const sourceText = typeof sourceInput === "string"
          ? sourceInput
          : new TextDecoder("utf-8").decode(sourceInput);
        const language = getSourceLanguage(absolutePath, sourceText);
        if (language === null) {
          if (isObjectiveCHeaderPath(absolutePath) || isPascalPpPath(absolutePath)) {
            return null;
          }
          throw new Error(`Unsupported source file was discovered: ${absolutePath}`);
        }
        return {
          absolutePath,
          relativePath: toProjectRelativePath(normalizedProjectPath, absolutePath),
          language,
          sourceText,
          ...(requiresRawSourceBytes(language) && sourceBytes !== undefined ? { sourceBytes } : {}),
          contentHash: requiresRawSourceBytes(language) && sourceBytes !== undefined
            ? hashSourceBytes(sourceBytes)
            : hashSource(sourceText)
        } satisfies SourceFile;
      })
    );
    for (const file of batch) {
      if (file !== null) {
        sourceFiles.push(file);
      }
    }
  }
  access.throwIfAny();
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
  return fingerprintSourcePaths(normalizedProjectPath, paths, options?.filesystemReader);
}

export async function fingerprintSourcePaths(
  projectPath: string,
  paths: readonly string[],
  filesystemReader: ProjectFilesystemReader = nativeProjectFilesystemReader
): Promise<readonly SourceFileFingerprint[]> {
  const normalizedProjectPath = resolve(projectPath);
  const fingerprints: SourceFileFingerprint[] = [];
  const access = new ProjectPathAccessCollector(normalizedProjectPath);

  for (let offset = 0; offset < paths.length; offset += MAXIMUM_FRESHNESS_CONCURRENT_READS) {
    const batch = await Promise.all(
      paths.slice(offset, offset + MAXIMUM_FRESHNESS_CONCURRENT_READS).map(async (absolutePath) => {
        try {
          const needsContentClassification = getSourceLanguage(absolutePath) === null;
          const sourceBytes = needsContentClassification
            ? await filesystemReader.readFile(absolutePath)
            : undefined;
          const sourceText = sourceBytes === undefined
            ? undefined
            : new TextDecoder("utf-8").decode(sourceBytes);
          const language = getSourceLanguage(absolutePath, sourceText);
          if (language === null) {
            if (needsContentClassification && (isObjectiveCHeaderPath(absolutePath) || isPascalPpPath(absolutePath))) {
              return null;
            }
            throw new Error(`Unsupported source file was discovered: ${absolutePath}`);
          }
          return {
            relativePath: toProjectRelativePath(normalizedProjectPath, absolutePath),
            language,
            contentHash: requiresRawSourceBytes(language)
              ? sourceBytes === undefined
                ? await hashRawFileWithReader(absolutePath, filesystemReader)
                : hashSourceBytes(sourceBytes)
              : sourceText === undefined
                ? await hashUtf8FileWithReader(absolutePath, filesystemReader)
                : hashSource(sourceText)
          };
        } catch (error) {
          if (projectFilesystemMissingCode(error) !== null) return null;
          if (access.add(absolutePath, error)) return null;
          throw error;
        }
      })
    );
    for (const fingerprint of batch) {
      if (fingerprint !== null) {
        fingerprints.push(fingerprint);
      }
    }
  }

  access.throwIfAny();
  return fingerprints.sort((left, right) => compareProjectPaths(left.relativePath, right.relativePath));
}

function requiresRawSourceBytes(language: SupportedLanguage): boolean {
  return language === "shell" || language === "lua";
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
  const filesystemReader = options.filesystemReader ?? nativeProjectFilesystemReader;
  const result = await walkScopedProject(normalizedProjectPath, {
    ...(options.scopeRoots === undefined ? {} : { scopeRoots: options.scopeRoots }),
    reader: filesystemReader,
    isConfigurationCandidateFileName: options.isConfigurationCandidateFileName,
    isSourceCandidate: (relativePath, absolutePath) => isSourceCandidateFile(
      relativePath,
      absolutePath,
      sourceShebangReader(options, filesystemReader)
    )
  });
  return {
    policy: FRESHNESS_PATH_DISCOVERY_POLICY,
    sourcePaths: result.sourcePaths,
    configurationPaths: result.configurationPaths
  };
}

async function discoverSourcePaths(
  normalizedProjectPath: string,
  options?: SourceDiscoveryOptions
): Promise<readonly string[]> {
  const filesystemReader = options?.filesystemReader ?? nativeProjectFilesystemReader;
  const result = await walkScopedProject(normalizedProjectPath, {
    ...(options?.scopeRoots === undefined ? {} : { scopeRoots: options.scopeRoots }),
    reader: filesystemReader,
    isSourceCandidate: (relativePath, absolutePath) => isSourceCandidateFile(
      relativePath,
      absolutePath,
      sourceShebangReader(options, filesystemReader)
    )
  });
  return result.sourcePaths;
}

function isPlayRoutesFile(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return /(?:^|\/)conf\/(?:routes|[^/]+\.routes)$/u.test(normalized);
}

async function isSourceCandidateFile(
  relativePath: string,
  absolutePath: string,
  shellShebangReader: ShellShebangReader
): Promise<boolean> {
  if (isPascalPpPath(relativePath) || getSourceLanguage(relativePath) !== null || isObjectiveCHeaderPath(relativePath)) {
    return true;
  }

  const prefix = await shellShebangReader(absolutePath, MAXIMUM_SHELL_SHEBANG_READ_BYTES);
  return hasExactShellShebangBytes(prefix);
}

function isObjectiveCHeaderPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(OBJECTIVE_C_HEADER_EXTENSION);
}

async function readShellShebangPrefix(
  absolutePath: string,
  maximumBytes: number
): Promise<Uint8Array> {
  const handle = await open(absolutePath, "r");
  try {
    const buffer = Buffer.alloc(maximumBytes);
    const { bytesRead } = await handle.read(buffer, 0, maximumBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function sourceShebangReader(
  options: SourceDiscoveryOptions | undefined,
  filesystemReader: ProjectFilesystemReader
): ShellShebangReader {
  if (options?.shellShebangReader !== undefined) return options.shellShebangReader;
  if (filesystemReader === nativeProjectFilesystemReader) return readShellShebangPrefix;
  return async (absolutePath, maximumBytes) =>
    (await filesystemReader.readFile(absolutePath)).slice(0, maximumBytes);
}

function hasExactShellShebang(sourceText: string): boolean {
  const newlineIndex = sourceText.indexOf("\n");
  const rawFirstLine = newlineIndex === -1 ? sourceText : sourceText.slice(0, newlineIndex);
  const firstLine = newlineIndex !== -1 && rawFirstLine.endsWith("\r") ? rawFirstLine.slice(0, -1) : rawFirstLine;
  return (SHELL_SHEBANG_ALLOWLIST as readonly string[]).includes(firstLine);
}

function hasExactShellShebangBytes(prefix: Uint8Array): boolean {
  const newlineIndex = prefix.indexOf(0x0a);
  const rawFirstLine = newlineIndex === -1 ? prefix : prefix.subarray(0, newlineIndex);
  const firstLine = newlineIndex !== -1 && rawFirstLine.at(-1) === 0x0d
    ? rawFirstLine.subarray(0, rawFirstLine.byteLength - 1)
    : rawFirstLine;
  return SHELL_SHEBANG_ALLOWLIST.some((shebang) => {
    const expected = Buffer.from(shebang, "ascii");
    return firstLine.byteLength === expected.byteLength &&
      firstLine.every((value, index) => value === expected[index]);
  });
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
