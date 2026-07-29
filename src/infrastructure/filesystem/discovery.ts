import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, parse, relative, resolve, sep } from "node:path";

export type SupportedLanguage = "typescript" | "javascript";

export const SUPPORTED_EXTENSIONS: ReadonlyMap<string, SupportedLanguage> = new Map([
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".jsx", "javascript"]
] as const);

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".symbol-lattice",
  "coverage",
  "dist",
  "node_modules"
]);

export interface SourceFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly language: SupportedLanguage;
  readonly sourceText: string;
  readonly contentHash: string;
}

export function toProjectRelativePath(projectPath: string, targetPath: string): string {
  const normalizedProjectPath = resolve(projectPath);
  const normalizedTargetPath = isAbsolute(targetPath)
    ? resolve(targetPath)
    : resolve(normalizedProjectPath, targetPath);
  const value = relative(normalizedProjectPath, normalizedTargetPath);

  if (value === "" || value.startsWith(`..${sep}`) || value === "..") {
    throw new Error(`Path is outside the project: ${targetPath}`);
  }

  return value.split(sep).join("/");
}

export function getSourceLanguage(filePath: string): SupportedLanguage | null {
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return SUPPORTED_EXTENSIONS.get(extension) ?? null;
}

export function hashSource(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}

export function isUnsafeProjectPath(projectPath: string): boolean {
  const normalizedPath = resolve(projectPath);
  return normalizedPath === parse(normalizedPath).root || normalizedPath === resolve(homedir());
}

async function collectSourcePaths(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const sourcePaths: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = resolve(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        sourcePaths.push(...(await collectSourcePaths(entryPath)));
      }
      continue;
    }

    if (entry.isFile() && getSourceLanguage(entry.name) !== null) {
      sourcePaths.push(entryPath);
    }
  }

  return sourcePaths;
}

export async function discoverSourceFiles(projectPath: string): Promise<readonly SourceFile[]> {
  const normalizedProjectPath = resolve(projectPath);
  const paths = await collectSourcePaths(normalizedProjectPath);
  const sourceFiles = await Promise.all(
    paths.map(async (absolutePath) => {
      const sourceText = await readFile(absolutePath, "utf8");
      const language = getSourceLanguage(absolutePath);

      if (language === null) {
        throw new Error(`Unsupported source file was discovered: ${absolutePath}`);
      }

      return {
        absolutePath,
        relativePath: toProjectRelativePath(normalizedProjectPath, absolutePath),
        language,
        sourceText,
        contentHash: hashSource(sourceText)
      };
    })
  );

  return sourceFiles.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}
