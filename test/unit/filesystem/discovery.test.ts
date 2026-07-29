import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  discoverSourceFiles,
  hashSource,
  isUnsafeProjectPath,
  toProjectRelativePath
} from "../../../src/infrastructure/filesystem/discovery.js";

const temporaryDirectories: string[] = [];

async function createProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-"));
  temporaryDirectories.push(projectPath);
  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directoryPath) => {
      const { rm } = await import("node:fs/promises");
      await rm(directoryPath, { recursive: true, force: true });
    })
  );
});

describe("source discovery", () => {
  it("discovers supported source files in deterministic relative-path order", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "src"), { recursive: true });
    await mkdir(join(projectPath, "node_modules", "ignored"), { recursive: true });
    await writeFile(join(projectPath, "src", "z.ts"), "export const z = 1;", "utf8");
    await writeFile(join(projectPath, "src", "a.js"), "export const a = 1;", "utf8");
    await writeFile(join(projectPath, "README.md"), "ignored", "utf8");
    await writeFile(join(projectPath, "node_modules", "ignored", "index.js"), "ignored", "utf8");

    const files = await discoverSourceFiles(projectPath);

    expect(files.map((file) => file.relativePath)).toEqual(["src/a.js", "src/z.ts"]);
    expect(files.map((file) => file.language)).toEqual(["javascript", "typescript"]);
  });

  it("normalizes safe project-relative paths and rejects external paths", async () => {
    const projectPath = await createProject();

    expect(toProjectRelativePath(projectPath, join(projectPath, "src", "index.ts"))).toBe(
      "src/index.ts"
    );
    expect(() => toProjectRelativePath(projectPath, resolve(projectPath, "..", "other.ts"))).toThrow(
      "outside the project"
    );
  });

  it("uses deterministic content hashes and identifies unsafe roots", () => {
    expect(hashSource("same source")).toBe(hashSource("same source"));
    expect(hashSource("one")).not.toBe(hashSource("two"));
    expect(isUnsafeProjectPath(parse(resolve(tmpdir())).root)).toBe(true);
  });
});
