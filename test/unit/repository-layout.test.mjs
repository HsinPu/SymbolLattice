import { readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const executableExtensions = new Set([".cjs", ".groovy", ".java", ".js", ".mjs", ".ps1", ".sh", ".ts"]);

async function rootLayout(path) {
  const entries = await readdir(join(repositoryRoot, path), { withFileTypes: true });
  return {
    directories: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
    executableFiles: entries
      .filter((entry) => entry.isFile() && executableExtensions.has(extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort()
  };
}

describe("repository automation layout", () => {
  it("keeps executable automation below owned script categories", async () => {
    await expect(rootLayout("scripts")).resolves.toEqual({
      directories: ["build", "install", "release"],
      executableFiles: []
    });
  });

  it("keeps benchmark executables below their evidence domains", async () => {
    await expect(rootLayout("benchmarks")).resolves.toEqual({
      directories: ["css", "filesystem", "fortran", "groovy", "html", "java", "javascript", "jsp", "julia", "languages", "lua", "luau", "markdown", "mcp", "perl", "python", "r", "sfc", "shell", "solidity", "vbnet"],
      executableFiles: []
    });
  });
});
