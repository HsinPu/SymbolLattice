import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SYMBOL_LATTICE_VERSION } from "../../src/version.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("release version contract", () => {
  it("keeps the runtime version aligned with package metadata", async () => {
    const packageJson = JSON.parse(
      await readFile(join(projectRoot, "package.json"), "utf8")
    ) as { version: string };

    expect(packageJson.version).toBe(SYMBOL_LATTICE_VERSION);
  });
});
