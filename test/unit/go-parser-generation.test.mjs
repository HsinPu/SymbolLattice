import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const generated = ["parser.ts", "parser.terms.ts", "tokens.ts", "highlight.ts"];

describe("Go parser generation contract", () => {
  it("verifies deterministic generated files without modifying them", async () => {
    const snapshots = await Promise.all(generated.map(async name => {
      const path = new URL(`../../src/extraction/go-parser/${name}`, import.meta.url);
      return { path, text: await readFile(path, "utf8"), time: (await stat(path)).mtimeMs };
    }));
    const result = spawnSync(process.execPath, ["scripts/build/generate-go-parser.mjs", "--check"], {
      cwd: root, encoding: "utf8", timeout: 30_000, windowsHide: true
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    for (const snapshot of snapshots) {
      expect(await readFile(snapshot.path, "utf8")).toBe(snapshot.text);
      expect((await stat(snapshot.path)).mtimeMs).toBe(snapshot.time);
      expect(snapshot.text).toContain("MIT License");
      expect(snapshot.text).toContain("Copyright (C) 2020 by Marijn Haverbeke");
    }
  });

  it("pins build tooling separately from the runtime and verifies before compilation", async () => {
    const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
    expect(pkg.dependencies["@lezer/go"]).toBe("1.0.1");
    expect(pkg.devDependencies["@lezer/generator"]).toBe("1.8.0");
    expect(pkg.dependencies["@lezer/generator"]).toBeUndefined();
    expect(pkg.scripts.build.startsWith("node scripts/build/generate-go-parser.mjs --check && ")).toBe(true);
    for (const name of generated) {
      const source = await readFile(new URL(`../../src/extraction/go-parser/${name}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/from ["']@lezer\/generator["']/u);
    }
  });
});
