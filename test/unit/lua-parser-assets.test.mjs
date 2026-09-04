import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  copyLuaParserAssets,
  LUA_ASSET_MANIFEST_SHA256,
  verifyLuaParserAssets
} from "../../scripts/build/copy-lua-parser-assets.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDirectory = join(repositoryRoot, "src", "assets", "lua");
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("Lua parser asset closure", () => {
  it("binds the exact seven-file retained grammar and license closure", async () => {
    const result = await verifyLuaParserAssets(sourceDirectory);

    expect(result.manifestSha256).toBe(LUA_ASSET_MANIFEST_SHA256);
    expect(result.files).toEqual([
      "THIRD_PARTY_NOTICES.md",
      "asset-manifest.json",
      "provenance.json",
      "sbom.cdx.json",
      "tree-sitter-lua-MIT.txt",
      "tree-sitter-lua-v0.5.0.wasm",
      "web-tree-sitter-MIT.txt"
    ]);
    expect(result.entries.find(({ path }) => path.endsWith(".wasm"))).toMatchObject({
      bytes: 53_176,
      sha256: "609f25f03773c8eaa3e94c504f360e770c49009ba9383b65be581b2d51774b71"
    });
  });

  it("copies the complete closure and rejects any byte drift", async () => {
    const root = await mkdtemp(join(tmpdir(), "SymbolLattice-lua-assets-"));
    temporaryDirectories.push(root);
    const destinationDirectory = join(root, "dist", "assets", "lua");
    const copied = await copyLuaParserAssets({ sourceDirectory, destinationDirectory });

    expect(copied.files).toEqual((await readdir(sourceDirectory)).sort());
    await expect(verifyLuaParserAssets(destinationDirectory)).resolves.toEqual(copied);

    const corruptDirectory = join(root, "corrupt");
    await cp(sourceDirectory, corruptDirectory, { recursive: true });
    const provenancePath = join(corruptDirectory, "provenance.json");
    await writeFile(provenancePath, `${await readFile(provenancePath, "utf8")} `, "utf8");
    await expect(verifyLuaParserAssets(corruptDirectory)).rejects.toThrow(/integrity mismatch/u);
  });

  it("keeps build and Git byte-stability gates explicit", async () => {
    const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
    const attributes = await readFile(join(repositoryRoot, ".gitattributes"), "utf8");

    expect(packageJson.dependencies["web-tree-sitter"]).toBe("0.26.12");
    expect(packageJson.scripts.build).toContain("scripts/build/copy-lua-parser-assets.mjs");
    expect(packageJson.scripts.prepack).toBe("npm run build && npm run verify:language-depth");
    expect(attributes).toContain("/src/assets/lua/* -text\n");
  });

  it("binds the installed runtime artifact and authored worker import allowlist", async () => {
    const runtimeWasm = await readFile(join(
      repositoryRoot,
      "node_modules",
      "web-tree-sitter",
      "web-tree-sitter.wasm"
    ));
    const runtimeEsm = await readFile(join(repositoryRoot, "node_modules", "web-tree-sitter", "web-tree-sitter.js"));
    const runtimeCjs = await readFile(join(repositoryRoot, "node_modules", "web-tree-sitter", "web-tree-sitter.cjs"));
    const runtimeLicense = await readFile(join(repositoryRoot, "node_modules", "web-tree-sitter", "LICENSE"));
    const retainedLicense = await readFile(join(sourceDirectory, "web-tree-sitter-MIT.txt"));
    const lockfile = JSON.parse(await readFile(join(repositoryRoot, "package-lock.json"), "utf8"));
    const workerSource = await readFile(
      join(repositoryRoot, "src", "extraction", "lua-worker.ts"),
      "utf8"
    );
    const imports = [...workerSource.matchAll(/from\s+"([^"]+)"/gu)].map((match) => match[1]);

    expect(runtimeWasm.byteLength).toBe(201_104);
    expect(createHash("sha256").update(runtimeWasm).digest("hex"))
      .toBe("ba5c7a539603f251f380e4d6ce26ee954ffca7bda8b2e13744dc4c87d6ce6041");
    expect(createHash("sha256").update(runtimeEsm).digest("hex"))
      .toBe("0c868236a47296b4ff3c1570f20e0899e4a784ff6e5cd7bfc9c3a55225463e4a");
    expect(createHash("sha256").update(runtimeCjs).digest("hex"))
      .toBe("84321506f6d6f5b1292dd449af6dfe3a0c2e97b4e5247c2da6971ab2c6ab9979");
    expect(runtimeLicense.equals(retainedLicense)).toBe(true);
    expect(lockfile.packages["node_modules/web-tree-sitter"]).toMatchObject({
      version: "0.26.12",
      integrity: "sha512-fvqTNZQBGUgUgfP0mHw+iHf9Yf6bRQrp0A3pSf2v/hSKxkT1beCoIWoLVmlPL7O6dmySfSb/t1aJoJvrgTRStw=="
    });
    expect(imports).toEqual([
      "node:worker_threads",
      "web-tree-sitter",
      "./lua-worker-protocol.js",
      "./lua-worker-ast.js"
    ]);
    expect(workerSource).not.toMatch(/node:(?:fs|http|https|net)|\bfetch\s*\(|\beval\s*\(|\bFunction\s*\(|\bimport\s*\(/u);
    const workerAstSource = await readFile(
      join(repositoryRoot, "src", "extraction", "lua-worker-ast.ts"),
      "utf8"
    );
    expect(workerAstSource).not.toMatch(/node:(?:fs|http|https|net)|\bfetch\s*\(|\beval\s*\(|\bFunction\s*\(|\bimport\s*\(/u);
  });
});
