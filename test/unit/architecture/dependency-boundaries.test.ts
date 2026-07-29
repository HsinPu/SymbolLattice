import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function sourceFiles(directoryPath: string): Promise<readonly string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return sourceFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
    })
  );
  return files.flat();
}

describe("architecture boundaries", () => {
  it("keeps the domain independent of runtime and adapter packages", async () => {
    const domainFiles = await sourceFiles(join(projectRoot, "src", "domain"));
    const source = await Promise.all(domainFiles.map((filePath) => readFile(filePath, "utf8")));

    for (const text of source) {
      expect(text).not.toMatch(/from\s+["']node:/);
      expect(text).not.toMatch(/from\s+["'](?:commander|typescript|@modelcontextprotocol\/sdk)/);
      expect(text).not.toMatch(/sqlite/i);
    }
  });

  it("keeps application orchestration independent of CLI and MCP adapters", async () => {
    const applicationFiles = await sourceFiles(join(projectRoot, "src", "application"));
    const source = await Promise.all(applicationFiles.map((filePath) => readFile(filePath, "utf8")));

    for (const text of source) {
      expect(text).not.toMatch(/from\s+["']\.\.\/(?:cli|mcp)\//);
    }
  });
});
