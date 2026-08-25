import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXCLUDED_DIRECTORY_NAMES,
  HARD_EXCLUDED_DIRECTORY_NAMES,
  MAXIMUM_PROJECT_PATH_UNREADABLE_EVIDENCE,
  ProjectPathAccessCollector,
  type ProjectFilesystemReader,
  readProjectFilesystemText
} from "../../../src/infrastructure/filesystem/project-filesystem.js";
import { ProjectPathUnreadableError } from "../../../src/domain/project-path-access.js";

function filesystemError(code: "EACCES" | "EPERM" | "ENOENT" | "ENOTDIR"): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe("project filesystem reader and access contract", () => {
  it("keeps the hard and default exclusion sets explicit and bounded", () => {
    expect([...HARD_EXCLUDED_DIRECTORY_NAMES]).toEqual([
      ".git",
      ".SymbolLattice",
      "node_modules",
      "dist",
      "coverage"
    ]);
    expect([...DEFAULT_EXCLUDED_DIRECTORY_NAMES]).toEqual([
      ".tmp",
      ".cache",
      ".venv",
      "venv",
      "__pycache__",
      ".pytest_cache",
      "pytest-history",
      ".mypy_cache",
      ".ruff_cache",
      ".tox",
      ".nox",
      ".hypothesis",
      ".ipynb_checkpoints",
      ".next",
      ".nuxt",
      ".svelte-kit",
      ".turbo",
      ".vite",
      ".parcel-cache",
      ".gradle",
      ".dart_tool",
      ".build",
      "build",
      "out",
      ".output",
      "target"
    ]);
    expect(DEFAULT_EXCLUDED_DIRECTORY_NAMES.has(".github")).toBe(false);
    expect(MAXIMUM_PROJECT_PATH_UNREADABLE_EVIDENCE).toBe(8);
  });

  it("accepts an injectable reader and decodes file text without using native fs", async () => {
    const calls: string[] = [];
    const reader: ProjectFilesystemReader = {
      async readdir(directoryPath) {
        calls.push(`readdir:${directoryPath}`);
        return [{ name: "nested", kind: "directory" }, { name: "entry.ts", kind: "file" }];
      },
      async readFile(filePath) {
        calls.push(`readFile:${filePath}`);
        return new TextEncoder().encode("export const entry = true;\n");
      },
      async stat(path) {
        calls.push(`stat:${path}`);
        return { kind: "directory" };
      }
    };

    await expect(readProjectFilesystemText(reader, "C:/project/.gitignore")).resolves.toBe(
      "export const entry = true;\n"
    );
    await expect(reader.readdir("C:/project")).resolves.toEqual([
      { name: "nested", kind: "directory" },
      { name: "entry.ts", kind: "file" }
    ]);
    await expect(reader.stat("C:/project")).resolves.toEqual({ kind: "directory" });
    expect(calls).toEqual([
      "readFile:C:/project/.gitignore",
      "readdir:C:/project",
      "stat:C:/project"
    ]);
  });

  it("aggregates permission evidence deterministically and ignores missing paths", () => {
    const collector = new ProjectPathAccessCollector("C:/project");
    collector.add("src/z.ts", filesystemError("EACCES"));
    collector.add("src/a.ts", filesystemError("EPERM"));
    collector.add("src/a.ts", filesystemError("EPERM"));
    collector.add("src/missing.ts", filesystemError("ENOENT"));
    collector.add("src/not-directory.ts", filesystemError("ENOTDIR"));

    expect(collector.evidence).toEqual([
      { path: "src/a.ts", code: "EPERM" },
      { path: "src/z.ts", code: "EACCES" }
    ]);
    const error = collector.toError();
    expect(error).toBeInstanceOf(ProjectPathUnreadableError);
    expect(error?.evidence).toEqual(collector.evidence);
    expect(error).toMatchObject({ total: 2, truncated: false });
    expect(error?.message).toBe(
      "Unable to read 2 project paths: src/a.ts [EPERM], src/z.ts [EACCES]."
    );
  });

  it("retains at most eight sorted project-relative permission paths", () => {
    const collector = new ProjectPathAccessCollector("C:/project");
    for (let index = 15; index >= 0; index -= 1) {
      collector.add(`src/${String(index).padStart(2, "0")}.ts`, filesystemError(index % 2 === 0 ? "EACCES" : "EPERM"));
    }

    expect(collector.evidence).toHaveLength(MAXIMUM_PROJECT_PATH_UNREADABLE_EVIDENCE);
    expect(collector.evidence.map((item) => item.path)).toEqual([
      "src/00.ts",
      "src/01.ts",
      "src/02.ts",
      "src/03.ts",
      "src/04.ts",
      "src/05.ts",
      "src/06.ts",
      "src/07.ts"
    ]);
    expect(collector.toError()).toMatchObject({ total: 16, truncated: true });
    expect(collector.toError()?.message).not.toContain("C:/project");
  });
});
