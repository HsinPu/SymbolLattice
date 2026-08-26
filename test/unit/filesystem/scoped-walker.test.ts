import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ProjectPathUnreadableError } from "../../../src/domain/project-path-access.js";
import {
  nativeProjectFilesystemReader,
  type ProjectFilesystemReader
} from "../../../src/infrastructure/filesystem/project-filesystem.js";
import { walkScopedProject } from "../../../src/infrastructure/filesystem/scoped-walker.js";

const temporaryDirectories: string[] = [];

async function createProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-scoped-walker-"));
  temporaryDirectories.push(projectPath);
  return projectPath;
}

async function writeProjectFile(projectPath: string, path: string, contents = "export {}\n"): Promise<void> {
  const segments = path.split("/");
  await mkdir(join(projectPath, ...segments.slice(0, -1)), { recursive: true });
  await writeFile(join(projectPath, ...segments), contents, "utf8");
}

function relativeSourcePaths(projectPath: string, paths: readonly string[]): readonly string[] {
  const normalizedRoot = resolve(projectPath).replaceAll("\\", "/");
  return paths.map((path) => path.replaceAll("\\", "/").slice(normalizedRoot.length + 1));
}

function typescriptSource(relativePath: string): boolean {
  return relativePath.endsWith(".ts");
}

function filesystemError(code: "EACCES" | "EPERM" | "ENOENT" | "ENOTDIR", path: string): Error & {
  readonly code: string;
  readonly path: string;
} {
  return Object.assign(new Error(code), { code, path });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("shared scoped project walker", () => {
  it("prunes every dot directory by default without traversing it", async () => {
    const projectPath = await createProject();
    await writeProjectFile(projectPath, ".tmp/pytest-history/blocked.ts");
    await writeProjectFile(projectPath, ".cache/blocked.ts");
    await writeProjectFile(projectPath, ".github/workflows/ci.ts");
    await writeProjectFile(projectPath, ".devcontainer/setup.ts");
    await writeProjectFile(projectPath, ".storybook/story.ts");
    await writeProjectFile(projectPath, ".codex-tmp/pytest-ai-evidence/blocked.ts");
    await writeProjectFile(projectPath, "src/entry.ts");
    const reads: string[] = [];
    const reader: ProjectFilesystemReader = {
      ...nativeProjectFilesystemReader,
      async readdir(directoryPath) {
        reads.push(directoryPath.replaceAll("\\", "/"));
        return nativeProjectFilesystemReader.readdir(directoryPath);
      }
    };

    const result = await walkScopedProject(projectPath, {
      reader,
      isSourceCandidate: typescriptSource
    });

    expect(relativeSourcePaths(projectPath, result.sourcePaths)).toEqual(["src/entry.ts"]);
    expect(reads.some((path) => /\/\.[^/]+(?:\/|$)/u.test(path))).toBe(false);
  });

  it("allows explicit non-root scopes and valid Git negation to override defaults", async () => {
    const projectPath = await createProject();
    await writeProjectFile(projectPath, ".tmp/pytest-history/kept.ts");
    await writeProjectFile(projectPath, "outside.ts");

    const scoped = await walkScopedProject(projectPath, {
      scopeRoots: [".tmp"],
      isSourceCandidate: typescriptSource
    });
    expect(relativeSourcePaths(projectPath, scoped.sourcePaths)).toEqual([
      ".tmp/pytest-history/kept.ts"
    ]);

    await writeProjectFile(projectPath, ".github/workflows/kept.ts");
    const explicitlyScopedHiddenDirectory = await walkScopedProject(projectPath, {
      scopeRoots: [".github"],
      isSourceCandidate: typescriptSource
    });
    expect(relativeSourcePaths(projectPath, explicitlyScopedHiddenDirectory.sourcePaths)).toEqual([
      ".github/workflows/kept.ts"
    ]);

    await writeFile(
      join(projectPath, ".gitignore"),
      "!.tmp/\n!.tmp/pytest-history/\n",
      "utf8"
    );
    const unignored = await walkScopedProject(projectPath, {
      isSourceCandidate: typescriptSource
    });
    expect(relativeSourcePaths(projectPath, unignored.sourcePaths)).toContain(
      ".tmp/pytest-history/kept.ts"
    );
  });

  it("applies nested ignore files and Git parent re-inclusion", async () => {
    const projectPath = await createProject();
    await writeProjectFile(
      projectPath,
      ".gitignore",
      "ignored/\n!ignored/\nignored/*\n!ignored/keep.ts\nblocked/\n!blocked/keep.ts\n"
    );
    await writeProjectFile(projectPath, "ignored/drop.ts");
    await writeProjectFile(projectPath, "ignored/keep.ts");
    await writeProjectFile(projectPath, "blocked/keep.ts");
    await writeProjectFile(projectPath, "nested/.gitignore", "hidden.ts\n");
    await writeProjectFile(projectPath, "nested/hidden.ts");
    await writeProjectFile(projectPath, "nested/visible.ts");

    const result = await walkScopedProject(projectPath, {
      isSourceCandidate: typescriptSource,
      isConfigurationCandidateFileName: (name) => name === "package.json"
    });

    expect(relativeSourcePaths(projectPath, result.sourcePaths)).toEqual([
      "ignored/keep.ts",
      "nested/visible.ts"
    ]);
    expect(result.configurationPaths).toEqual([".gitignore", "nested/.gitignore"]);
  });

  it("never lets scope or ignore rules reopen hard exclusions", async () => {
    const projectPath = await createProject();
    await writeProjectFile(projectPath, ".git/hidden.ts");
    await writeProjectFile(projectPath, "node_modules/pkg/hidden.ts");
    await writeProjectFile(projectPath, ".gitignore", "!.git/\n!node_modules/\n");

    const result = await walkScopedProject(projectPath, {
      scopeRoots: [".git", "node_modules"],
      isSourceCandidate: typescriptSource
    });

    expect(result.sourcePaths).toEqual([]);
  });

  it("aggregates unreadable siblings and does not expose partial success", async () => {
    const projectPath = await createProject();
    await writeProjectFile(projectPath, "locked-a/one.ts");
    await writeProjectFile(projectPath, "locked-b/two.ts");
    await writeProjectFile(projectPath, "visible/three.ts");
    const reader: ProjectFilesystemReader = {
      ...nativeProjectFilesystemReader,
      async readdir(directoryPath) {
        const normalized = directoryPath.replaceAll("\\", "/");
        if (normalized.endsWith("/locked-a")) throw filesystemError("EACCES", directoryPath);
        if (normalized.endsWith("/locked-b")) throw filesystemError("EPERM", directoryPath);
        return nativeProjectFilesystemReader.readdir(directoryPath);
      }
    };

    await expect(walkScopedProject(projectPath, {
      reader,
      isSourceCandidate: typescriptSource
    })).rejects.toMatchObject({
      code: "PROJECT_PATH_UNREADABLE",
      evidence: [
        { path: "locked-a", code: "EACCES" },
        { path: "locked-b", code: "EPERM" }
      ],
      total: 2,
      truncated: false
    } satisfies Partial<ProjectPathUnreadableError>);
  });

  it("reports an unreadable project root without exposing its host path", async () => {
    const projectPath = await createProject();
    const reader: ProjectFilesystemReader = {
      ...nativeProjectFilesystemReader,
      async readdir(directoryPath) {
        throw filesystemError("EACCES", directoryPath);
      }
    };

    const error = await walkScopedProject(projectPath, {
      reader,
      isSourceCandidate: typescriptSource
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "PROJECT_PATH_UNREADABLE",
      evidence: [{ path: ".", code: "EACCES" }]
    });
    expect((error as Error).message).not.toContain(projectPath);
  });

  it("skips ENOENT traversal races while preserving other siblings", async () => {
    const projectPath = await createProject();
    await writeProjectFile(projectPath, "vanished/one.ts");
    await writeProjectFile(projectPath, "visible/two.ts");
    const reader: ProjectFilesystemReader = {
      ...nativeProjectFilesystemReader,
      async readdir(directoryPath) {
        if (directoryPath.replaceAll("\\", "/").endsWith("/vanished")) {
          throw filesystemError("ENOENT", directoryPath);
        }
        return nativeProjectFilesystemReader.readdir(directoryPath);
      }
    };

    const result = await walkScopedProject(projectPath, {
      reader,
      isSourceCandidate: typescriptSource
    });
    expect(relativeSourcePaths(projectPath, result.sourcePaths)).toEqual(["visible/two.ts"]);
  });

  it.each(["ENOENT", "ENOTDIR"] as const)(
    "skips a scoped root that changes during stat with %s",
    async (code) => {
      const projectPath = await createProject();
      await writeProjectFile(projectPath, "vanished/one.ts");
      await writeProjectFile(projectPath, "kept/two.ts");
      const reader: ProjectFilesystemReader = {
        ...nativeProjectFilesystemReader,
        async stat(path) {
          if (path.replaceAll("\\", "/").endsWith("/vanished")) {
            throw filesystemError(code, path);
          }
          return nativeProjectFilesystemReader.stat(path);
        }
      };

      const result = await walkScopedProject(projectPath, {
        scopeRoots: ["vanished", "kept"],
        reader,
        isSourceCandidate: typescriptSource
      });
      expect(result.scopeRoots).toEqual(["kept"]);
      expect(relativeSourcePaths(projectPath, result.sourcePaths)).toEqual(["kept/two.ts"]);
    }
  );

  it("keeps unknown filesystem failures fatal", async () => {
    const projectPath = await createProject();
    const fatal = Object.assign(new Error("device failure"), { code: "EIO" });
    const reader: ProjectFilesystemReader = {
      ...nativeProjectFilesystemReader,
      async readdir() {
        throw fatal;
      }
    };

    await expect(walkScopedProject(projectPath, {
      reader,
      isSourceCandidate: typescriptSource
    })).rejects.toBe(fatal);
  });
});
