import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ProjectConfigurationError } from "../../../src/domain/configuration.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import {
  nativeProjectFilesystemReader,
  type ProjectFilesystemReader
} from "../../../src/infrastructure/filesystem/project-filesystem.js";

const temporaryProjectPaths: string[] = [];

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-workspace-"));
  temporaryProjectPaths.push(projectPath);

  await Promise.all(
    Object.entries(files).map(async ([relativePath, sourceText]) => {
      const absolutePath = resolve(projectPath, ...relativePath.split("/"));
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, sourceText, "utf8");
    })
  );

  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjectPaths.splice(0).map((projectPath) => rm(projectPath, { recursive: true, force: true }))
  );
});

describe("workspace package module resolution", () => {
  it("resolves root and explicit subpath exports from an array workspace declaration", async () => {
    const projectPath = await createProject({
      "package.json": JSON.stringify({ private: true, workspaces: ["packages/*"] }),
      "packages/core/package.json": JSON.stringify({
        name: "@fixture/core",
        exports: {
          ".": "./src/index.ts",
          "./math": "./src/math.ts"
        }
      }),
      "packages/core/src/index.ts": "export const indexValue = 1;",
      "packages/core/src/math.ts": "export const add = (left: number, right: number) => left + right;",
      "apps/web/src/consumer.ts": 'import { indexValue } from "@fixture/core"; export const value = indexValue;'
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("apps/web/src/consumer.ts", "@fixture/core")).toEqual({
      targetFilePath: "packages/core/src/index.ts",
      strategy: "workspace-package",
      configurationPaths: ["package.json", "packages/core/package.json"]
    });
    expect(scan.moduleResolver.resolve("apps/web/src/consumer.ts", "@fixture/core/math")).toEqual({
      targetFilePath: "packages/core/src/math.ts",
      strategy: "workspace-package",
      configurationPaths: ["package.json", "packages/core/package.json"]
    });
    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "workspace-root-manifest", path: "package.json", state: "present" }),
        expect.objectContaining({
          kind: "workspace-package-manifest",
          path: "packages/core/package.json",
          state: "present"
        })
      ])
    );
  });

  it("supports object workspaces, recursive patterns, exclusions, and root entry fallbacks", async () => {
    const projectPath = await createProject({
      "package.json": JSON.stringify({
        private: true,
        workspaces: { packages: ["packages/**", "!packages/ignored"] }
      }),
      "packages/nested/core/package.json": JSON.stringify({ name: "@fixture/deep", main: "./dist/index.js" }),
      "packages/nested/core/src/index.ts": "export const deep = true;",
      "packages/ignored/package.json": JSON.stringify({ name: "@fixture/ignored", main: "./src/index.ts" }),
      "packages/ignored/src/index.ts": "export const ignored = true;",
      "apps/web/src/consumer.ts": "export const consumer = true;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("apps/web/src/consumer.ts", "@fixture/deep")).toEqual({
      targetFilePath: "packages/nested/core/src/index.ts",
      strategy: "workspace-package",
      configurationPaths: ["package.json", "packages/nested/core/package.json"]
    });
    expect(scan.moduleResolver.resolve("apps/web/src/consumer.ts", "@fixture/ignored")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["package.json"]
    });
    expect(
      scan.indexInputs.configurationInputs
        .filter((input) => input.kind === "workspace-package-manifest")
        .map((input) => input.path)
        .sort(compareText)
    ).toEqual(["packages/nested/core/package.json"]);
  });

  it("does not rediscover workspace manifests inside nested default-excluded caches", async () => {
    const projectPath = await createProject({
      "package.json": JSON.stringify({ private: true, workspaces: ["backend/**"] }),
      "backend/package.json": JSON.stringify({ name: "@fixture/backend", source: "./src/index.ts" }),
      "backend/src/index.ts": "export const backend = true;",
      "backend/.pytest_cache/package.json": JSON.stringify({
        name: "@fixture/cache",
        source: "./src/index.ts"
      }),
      "backend/.pytest_cache/src/index.ts": "export const cache = true;",
      "apps/web/src/consumer.ts": "export const consumer = true;"
    });

    const cacheAccesses: string[] = [];
    const guardCachePath = (path: string): void => {
      if (path.replaceAll("\\", "/").includes("/backend/.pytest_cache")) {
        cacheAccesses.push(path);
        throw Object.assign(new Error("EPERM"), { code: "EPERM", path });
      }
    };
    const reader: ProjectFilesystemReader = {
      async readdir(path) {
        guardCachePath(path);
        return nativeProjectFilesystemReader.readdir(path);
      },
      async readFile(path) {
        guardCachePath(path);
        return nativeProjectFilesystemReader.readFile(path);
      },
      async stat(path) {
        guardCachePath(path);
        return nativeProjectFilesystemReader.stat(path);
      }
    };

    const scan = await new FileSystemSourceCatalog(reader).scan(projectPath);

    expect(cacheAccesses).toEqual([]);
    expect(
      scan.indexInputs.configurationInputs
        .filter((input) => input.kind === "workspace-package-manifest")
        .map((input) => input.path)
        .sort(compareText)
    ).toEqual(["backend/package.json"]);
    expect(scan.moduleResolver.resolve("apps/web/src/consumer.ts", "@fixture/cache")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["package.json"]
    });
  });

  it("does not expand a narrowed source scope to satisfy a workspace import", async () => {
    const projectPath = await createProject({
      "package.json": JSON.stringify({ private: true, workspaces: ["packages/*"] }),
      "packages/core/package.json": JSON.stringify({ name: "@fixture/core", source: "./src/index.ts" }),
      "packages/core/src/index.ts": "export const core = true;",
      "apps/web/src/consumer.ts": 'import { core } from "@fixture/core"; export const value = core;'
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath, { scopeRoots: ["apps"] });

    expect(scan.sourceDocuments.map((document) => document.relativePath)).toEqual(["apps/web/src/consumer.ts"]);
    expect(scan.moduleResolver.resolve("apps/web/src/consumer.ts", "@fixture/core")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["package.json", "packages/core/package.json"]
    });
  });

  it("keeps TypeScript paths aliases ahead of matching workspace package names", async () => {
    const projectPath = await createProject({
      "package.json": JSON.stringify({ private: true, workspaces: ["packages/*"] }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@fixture/core": ["src/alias.ts"] }
        }
      }),
      "src/alias.ts": "export const fromAlias = true;",
      "packages/core/package.json": JSON.stringify({ name: "@fixture/core", source: "./src/index.ts" }),
      "packages/core/src/index.ts": "export const fromWorkspace = true;",
      "apps/web/src/consumer.ts": "export const consumer = true;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("apps/web/src/consumer.ts", "@fixture/core")).toEqual({
      targetFilePath: "src/alias.ts",
      strategy: "tsconfig-paths",
      configurationPaths: ["tsconfig.json"]
    });
  });

  it("uses the nearest package tsconfig without leaking its aliases to sibling sources", async () => {
    const projectPath = await createProject({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@selected": ["src/root.ts"] }
        }
      }),
      "src/root.ts": "export const selected = 'root';",
      "packages/app/tsconfig.json": JSON.stringify({
        compilerOptions: {
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@selected": ["src/package.ts"] }
        }
      }),
      "packages/app/src/package.ts": "export const selected = 'package';",
      "packages/app/src/consumer.ts": "export const packageConsumer = true;",
      "apps/web/src/consumer.ts": "export const rootConsumer = true;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("packages/app/src/consumer.ts", "@selected")).toEqual({
      targetFilePath: "packages/app/src/package.ts",
      strategy: "tsconfig-paths",
      configurationPaths: ["packages/app/tsconfig.json"]
    });
    expect(scan.moduleResolver.resolve("apps/web/src/consumer.ts", "@selected")).toEqual({
      targetFilePath: "src/root.ts",
      strategy: "tsconfig-paths",
      configurationPaths: ["tsconfig.json"]
    });
  });

  it("prefers a package tsconfig over a colocated jsconfig", async () => {
    const projectPath = await createProject({
      "packages/app/tsconfig.json": JSON.stringify({
        compilerOptions: {
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@selected": ["src/typescript.ts"] }
        }
      }),
      "packages/app/jsconfig.json": JSON.stringify({
        compilerOptions: {
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@selected": ["src/javascript.ts"] }
        }
      }),
      "packages/app/src/consumer.ts": "export const consumer = true;",
      "packages/app/src/typescript.ts": "export const selected = 'typescript';",
      "packages/app/src/javascript.ts": "export const selected = 'javascript';"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("packages/app/src/consumer.ts", "@selected")).toEqual({
      targetFilePath: "packages/app/src/typescript.ts",
      strategy: "tsconfig-paths",
      configurationPaths: ["packages/app/tsconfig.json"]
    });
  });

  it("falls through from an unclaimed package tsconfig to an exact workspace package", async () => {
    const projectPath = await createProject({
      "package.json": JSON.stringify({ private: true, workspaces: ["packages/*"] }),
      "packages/app/tsconfig.json": JSON.stringify({ compilerOptions: { moduleResolution: "Bundler" } }),
      "packages/app/src/consumer.ts": "export const consumer = true;",
      "packages/core/package.json": JSON.stringify({ name: "@fixture/core", source: "./src/index.ts" }),
      "packages/core/src/index.ts": "export const core = true;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("packages/app/src/consumer.ts", "@fixture/core")).toEqual({
      targetFilePath: "packages/core/src/index.ts",
      strategy: "workspace-package",
      configurationPaths: [
        "packages/app/tsconfig.json",
        "package.json",
        "packages/core/package.json"
      ]
    });
  });

  it("uses a package tsconfig that extends a project-local root base config", async () => {
    const projectPath = await createProject({
      "tsconfig.base.json": JSON.stringify({
        compilerOptions: {
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@shared/*": ["src/shared/*"] }
        }
      }),
      "packages/app/tsconfig.json": JSON.stringify({ extends: "../../tsconfig.base.json" }),
      "packages/app/src/consumer.ts": "export const consumer = true;",
      "src/shared/util.ts": "export const shared = true;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("packages/app/src/consumer.ts", "@shared/util")).toEqual({
      targetFilePath: "src/shared/util.ts",
      strategy: "tsconfig-paths",
      configurationPaths: ["packages/app/tsconfig.json", "tsconfig.base.json"]
    });
  });

  it("does not fall through to a workspace package when a TypeScript path claims the specifier", async () => {
    const projectPath = await createProject({
      "package.json": JSON.stringify({ private: true, workspaces: ["packages/*"] }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@fixture/core": ["src/missing-alias-target.ts"] }
        }
      }),
      "packages/core/package.json": JSON.stringify({ name: "@fixture/core", source: "./src/index.ts" }),
      "packages/core/src/index.ts": "export const fromWorkspace = true;",
      "apps/web/src/consumer.ts": "export const consumer = true;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("apps/web/src/consumer.ts", "@fixture/core")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["tsconfig.json"]
    });
  });

  it("rejects duplicate workspace package names and escaping package entries", async () => {
    const duplicateProjectPath = await createProject({
      "package.json": JSON.stringify({ private: true, workspaces: ["packages/*"] }),
      "packages/one/package.json": JSON.stringify({ name: "@fixture/duplicate" }),
      "packages/two/package.json": JSON.stringify({ name: "@fixture/duplicate" })
    });
    const escapingProjectPath = await createProject({
      "package.json": JSON.stringify({ private: true, workspaces: ["packages/*"] }),
      "packages/core/package.json": JSON.stringify({
        name: "@fixture/core",
        exports: { ".": "./../outside.ts" }
      }),
      "outside.ts": "export const outside = true;",
      "apps/web/src/consumer.ts": "export const consumer = true;"
    });
    const catalog = new FileSystemSourceCatalog();

    await expect(catalog.scan(duplicateProjectPath)).rejects.toBeInstanceOf(ProjectConfigurationError);
    await expect(catalog.scan(escapingProjectPath)).rejects.toBeInstanceOf(ProjectConfigurationError);
  });
});
