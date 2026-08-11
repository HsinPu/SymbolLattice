import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  compareStableText,
  type ProjectConfigurationInput
} from "../../domain/index.js";
import type {
  ProjectModuleResolver,
  ResolvedModule,
  SourceDocument
} from "../../ports/source-catalog.js";
import { readProjectConfigurationInput } from "./project-inputs.js";

export interface GoModuleProjectModuleResolver {
  readonly moduleResolver: ProjectModuleResolver;
  /** The root `go.mod` is part of the indexed generation identity. */
  readonly configurationInputs: readonly ProjectConfigurationInput[];
}

const GO_MODULE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~+-]*$/u;

function unresolved(configurationPaths: readonly string[]): ResolvedModule {
  return {
    targetFilePath: null,
    strategy: "unresolved",
    configurationPaths
  };
}

function goPackageDirectory(filePath: string): string {
  const separator = filePath.lastIndexOf("/");
  return separator === -1 ? "" : filePath.slice(0, separator);
}

function isSafeGoModulePath(value: string): boolean {
  return (
    value !== "" &&
    !value.includes("\\") &&
    !value.includes("@") &&
    value.split("/").every(
      (segment) => segment !== "." && segment !== ".." && GO_MODULE_PATH_SEGMENT.test(segment)
    )
  );
}

/**
 * Reads the intentionally narrow root-module subset needed to map an exact
 * internal import path onto an already indexed Go source directory. A
 * non-comment root line beginning a `replace` directive disables this narrow
 * resolver: replacements, nested modules, and external modules remain
 * deliberately unresolved rather than guessed.
 */
function parseGoModulePath(sourceText: string): string | null {
  let modulePath: string | null = null;

  for (const rawLine of sourceText.split(/\r?\n/u)) {
    const line = rawLine.replace(/\s+\/\/.*$/u, "").trim();
    if (/^replace(?:\s|\(|$)/u.test(line)) {
      return null;
    }
    if (!line.startsWith("module")) {
      continue;
    }
    const match = /^module\s+([^\s]+)$/u.exec(line);
    const candidate = match?.[1];
    if (candidate === undefined || modulePath !== null || !isSafeGoModulePath(candidate)) {
      return null;
    }
    modulePath = candidate;
  }

  return modulePath;
}

function localImportDirectory(modulePath: string, moduleSpecifier: string): string | null {
  if (moduleSpecifier === modulePath) {
    return "";
  }
  if (!moduleSpecifier.startsWith(`${modulePath}/`)) {
    return null;
  }
  const directory = moduleSpecifier.slice(modulePath.length + 1);
  return directory === "" || !isSafeGoModulePath(directory) ? null : directory;
}

function firstGoPackageFileByDirectory(
  sourceDocuments: readonly SourceDocument[]
): ReadonlyMap<string, string> {
  const firstByDirectory = new Map<string, string>();
  const sourceFiles = sourceDocuments
    .filter(
      (document) => {
        const fileName = document.relativePath.slice(document.relativePath.lastIndexOf("/") + 1);
        // Keep representatives aligned with files the Go tool considers buildable.
        return document.language === "go" &&
          fileName.endsWith(".go") &&
          !fileName.endsWith("_test.go") &&
          !fileName.startsWith("_") &&
          !fileName.startsWith(".");
      }
    )
    .sort((left, right) => compareStableText(left.relativePath, right.relativePath));

  for (const sourceFile of sourceFiles) {
    const directory = goPackageDirectory(sourceFile.relativePath);
    if (!firstByDirectory.has(directory)) {
      firstByDirectory.set(directory, sourceFile.relativePath);
    }
  }

  return firstByDirectory;
}

/**
 * A nested `go.mod` changes Go's package ownership. Track every source-parent
 * ancestor as present or absent so adding a nested module invalidates a prior
 * root-module projection instead of silently reusing it.
 */
async function nestedGoModuleInputs(
  projectPath: string,
  sourceDocuments: readonly SourceDocument[]
): Promise<readonly ProjectConfigurationInput[]> {
  const candidatePaths = new Set<string>();
  for (const sourceDocument of sourceDocuments) {
    if (
      sourceDocument.language !== "go" ||
      !sourceDocument.relativePath.endsWith(".go") ||
      sourceDocument.relativePath.endsWith("_test.go")
    ) {
      continue;
    }
    let directory = goPackageDirectory(sourceDocument.relativePath);
    while (directory !== "") {
      candidatePaths.add(`${directory}/go.mod`);
      directory = goPackageDirectory(directory);
    }
  }
  return Promise.all(
    [...candidatePaths]
      .sort(compareStableText)
      .map((path) => readProjectConfigurationInput(projectPath, "go-module", path))
  );
}

function nestedModuleDirectory(input: ProjectConfigurationInput): string {
  return input.path.slice(0, -"/go.mod".length);
}

function containingNestedModuleInput(
  directory: string,
  nestedInputs: readonly ProjectConfigurationInput[]
): ProjectConfigurationInput | null {
  const matches = nestedInputs.filter((input) => {
    if (input.state !== "present") {
      return false;
    }
    const nestedDirectory = nestedModuleDirectory(input);
    return directory === nestedDirectory || directory.startsWith(`${nestedDirectory}/`);
  });
  return matches.sort((left, right) => right.path.length - left.path.length)[0] ?? null;
}

/**
 * Resolves only a literal import rooted at the project's single root `go.mod`
 * module path. The returned file is a deterministic representative of the
 * imported package directory; semantic consumers still prove the concrete
 * declarations from their own extracted facts.
 */
export async function createGoModuleProjectModuleResolver(input: {
  readonly projectPath: string;
  readonly sourceDocuments: readonly SourceDocument[];
}): Promise<GoModuleProjectModuleResolver> {
  const projectPath = resolve(input.projectPath);
  const rootInput = await readProjectConfigurationInput(projectPath, "go-module", "go.mod");
  if (rootInput.state === "absent") {
    return {
      moduleResolver: { resolve: (_fromFilePath, _moduleSpecifier) => unresolved([]) },
      configurationInputs: [rootInput]
    };
  }

  const nestedInputs = await nestedGoModuleInputs(projectPath, input.sourceDocuments);

  let moduleSource: string;
  try {
    moduleSource = await readFile(resolve(projectPath, rootInput.path), "utf8");
  } catch {
    return {
      moduleResolver: { resolve: (_fromFilePath, _moduleSpecifier) => unresolved([rootInput.path]) },
      configurationInputs: [rootInput]
    };
  }
  const modulePath = parseGoModulePath(moduleSource);
  const firstPackageFileByDirectory = firstGoPackageFileByDirectory(input.sourceDocuments);

  return {
    moduleResolver: {
      resolve(fromFilePath, moduleSpecifier) {
        if (!fromFilePath.endsWith(".go") || modulePath === null) {
          return unresolved(modulePath === null ? [rootInput.path] : []);
        }
        const directory = localImportDirectory(modulePath, moduleSpecifier);
        if (directory === null) {
          return unresolved([rootInput.path]);
        }
        const sourceNestedModule = containingNestedModuleInput(
          goPackageDirectory(fromFilePath),
          nestedInputs
        );
        if (sourceNestedModule !== null) {
          return unresolved([rootInput.path, sourceNestedModule.path]);
        }
        const nestedModule = containingNestedModuleInput(directory, nestedInputs);
        if (nestedModule !== null) {
          return unresolved([rootInput.path, nestedModule.path]);
        }
        const targetFilePath = firstPackageFileByDirectory.get(directory);
        if (targetFilePath === undefined) {
          return unresolved([rootInput.path]);
        }
        return {
          targetFilePath,
          strategy: "go-module-package",
          configurationPaths: [rootInput.path]
        };
      }
    },
    configurationInputs: [rootInput, ...nestedInputs]
  };
}
