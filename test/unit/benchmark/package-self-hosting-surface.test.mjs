import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../../..");

const PUBLIC_SELF_HOSTING_TARGETS = Object.freeze({
  "benchmark:typescript-large-oracle": "scripts/typescript-large-project-correctness-oracle.mjs",
  "benchmark:typescript-large-index-evidence": "scripts/typescript-large-project-index-evidence.mjs",
  "benchmark:typescript-large-incremental": "scripts/typescript-large-project-incremental-performance.mjs",
  "verify:typescript-self-hosting-mcp": "scripts/verify-typescript-self-hosting-mcp.mjs"
});

const REPOSITORY_ONLY_SELF_HOSTING_TARGETS = Object.freeze({
  "benchmark:typescript-self-hosting": "scripts/typescript-self-hosting-ground-truth.mjs",
  "check:typescript-self-hosting": "tsconfig.self-hosting.json"
});

describe("self-hosting package surface", () => {
  it("ships public tools while keeping source-dependent commands repository-only", async () => {
    const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
    const packageFiles = new Set(packageJson.files);

    for (const [alias, target] of Object.entries(PUBLIC_SELF_HOSTING_TARGETS)) {
      expect(packageJson.scripts[alias], alias).toContain(target);
      expect(packageFiles.has(target), `${alias} target is excluded from npm files`).toBe(true);
      await expect(access(resolve(projectRoot, target)), `${alias} target is missing`).resolves.toBeUndefined();
    }

    for (const [alias, target] of Object.entries(REPOSITORY_ONLY_SELF_HOSTING_TARGETS)) {
      expect(packageJson.scripts[alias], alias).toContain(target);
      expect(packageFiles.has(target), `${alias} must remain repository-only`).toBe(false);
      await expect(access(resolve(projectRoot, target)), `${alias} repository target is missing`).resolves.toBeUndefined();
    }
  });
});
