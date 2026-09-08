import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTypeScriptProjectModuleResolver } from "../../../src/infrastructure/typescript/module-resolver.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

const roots: string[] = [];
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, statSync: vi.fn(actual.statSync), existsSync: vi.fn(actual.existsSync), realpathSync: vi.fn(actual.realpathSync), readFileSync: vi.fn(actual.readFileSync) };
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(nodeFs.readFileSync).mockReset();
  vi.mocked(nodeFs.existsSync).mockReset();
  vi.mocked(nodeFs.statSync).mockReset();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("explicit project reference configuration admission", () => {
  it("preserves access denial while probing a local extends candidate", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-reference-"));
    roots.push(projectPath);
    await writeFile(join(projectPath, "tsconfig.json"), '{"extends":"./base.json"}');
    await writeFile(join(projectPath, "base.json"), "{}");
    vi.mocked(nodeFs.existsSync).mockReturnValue(false);
    vi.mocked(nodeFs.statSync).mockImplementationOnce(() => { throw Object.assign(new Error("denied"), { code: "EACCES" }); });
    expect(() => createTypeScriptProjectModuleResolver({ projectPath, sourceDocuments: [], configurationCandidatePaths: ["tsconfig.json"] })).toThrow(expect.objectContaining({ code: "PROJECT_PATH_UNREADABLE" }));
  });
  it("does not trust a false exists probe when reading the root config is denied", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-reference-"));
    roots.push(projectPath);
    await writeFile(join(projectPath, "tsconfig.json"), "{}");
    vi.mocked(nodeFs.existsSync).mockReturnValue(false);
    vi.mocked(nodeFs.readFileSync).mockImplementationOnce(() => { throw Object.assign(new Error("denied"), { code: "EACCES" }); });
    expect(() => createTypeScriptProjectModuleResolver({ projectPath, sourceDocuments: [], configurationCandidatePaths: ["tsconfig.json"] })).toThrow(expect.objectContaining({ code: "PROJECT_PATH_UNREADABLE" }));
  });
  it.each(["tsconfig.json", ".hidden/tsconfig.json"])("preserves read access failure for %s", async (deniedPath) => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-reference-"));
    roots.push(projectPath);
    await mkdir(join(projectPath, ".hidden"));
    await writeFile(join(projectPath, "tsconfig.json"), '{"references":[{"path":"./.hidden"}]}');
    await writeFile(join(projectPath, ".hidden/tsconfig.json"), "{}");
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(nodeFs.readFileSync).mockImplementation((...args) => {
      if (String(args[0]) === join(projectPath, deniedPath)) throw Object.assign(new Error("denied"), { code: "EPERM" });
      return actual.readFileSync(...args);
    });
    expect(() => createTypeScriptProjectModuleResolver({ projectPath, sourceDocuments: [], configurationCandidatePaths: ["tsconfig.json"] })).toThrow(expect.objectContaining({ code: "PROJECT_PATH_UNREADABLE" }));
  });
  it("rejects a configuration symlink escaping the project root", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-reference-"));
    const outsidePath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-outside-"));
    roots.push(projectPath, outsidePath);
    await writeFile(join(outsidePath, "tsconfig.json"), "{}");
    await symlink(outsidePath, join(projectPath, "linked"), process.platform === "win32" ? "junction" : "dir");
    await writeFile(join(projectPath, "tsconfig.json"), '{"extends":"./linked/tsconfig.json"}');
    expect(() => createTypeScriptProjectModuleResolver({ projectPath, sourceDocuments: [], configurationCandidatePaths: ["tsconfig.json"] })).toThrow(/allowed project boundary/);
  });
  it.skipIf(process.platform !== "win32")("rejects mixed-case Windows hard-excluded configuration paths", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-reference-"));
    roots.push(projectPath);
    await mkdir(join(projectPath, "NODE_MODULES"));
    await writeFile(join(projectPath, "tsconfig.json"), '{"references":[{"path":"./NODE_MODULES"}]}');
    await writeFile(join(projectPath, "NODE_MODULES/tsconfig.json"), "{}");
    expect(() => createTypeScriptProjectModuleResolver({ projectPath, sourceDocuments: [], configurationCandidatePaths: ["tsconfig.json"] })).toThrow(/allowed project boundary/);
  });
  it("preserves access-denied errors instead of reporting a missing configuration", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-reference-"));
    roots.push(projectPath);
    await writeFile(join(projectPath, "tsconfig.json"), "{}");
    vi.mocked(nodeFs.realpathSync).mockImplementationOnce(() => { throw Object.assign(new Error("denied"), { code: "EACCES" }); });
    expect(() => createTypeScriptProjectModuleResolver({ projectPath, sourceDocuments: [], configurationCandidatePaths: ["tsconfig.json"] })).toThrow(expect.objectContaining({ code: "PROJECT_PATH_UNREADABLE" }));
  });
  it("rejects a root extends chain entering a hard-excluded directory", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-reference-"));
    roots.push(projectPath);
    await mkdir(join(projectPath, "node_modules"));
    await writeFile(join(projectPath, "tsconfig.json"), '{"extends":"./node_modules/base.json"}');
    await writeFile(join(projectPath, "node_modules/base.json"), "{}");
    expect(() => createTypeScriptProjectModuleResolver({ projectPath, sourceDocuments: [], configurationCandidatePaths: ["tsconfig.json"] })).toThrow(/allowed project boundary/);
  });
  it("rejects a hidden reference whose extends chain enters a hard-excluded directory", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-reference-"));
    roots.push(projectPath);
    await mkdir(join(projectPath, ".hidden"));
    await mkdir(join(projectPath, "node_modules"));
    await writeFile(join(projectPath, "tsconfig.json"), '{"references":[{"path":"./.hidden"}]}');
    await writeFile(join(projectPath, ".hidden/tsconfig.json"), '{"extends":"../node_modules/base.json"}');
    await writeFile(join(projectPath, "node_modules/base.json"), "{}");
    expect(() => createTypeScriptProjectModuleResolver({
      projectPath, sourceDocuments: [], configurationCandidatePaths: ["tsconfig.json"]
    })).toThrow(/allowed project boundary/);
  });
  it.each([
    { name: "missing", reference: "./.hidden", contents: undefined },
    { name: "malformed", reference: "./.hidden", contents: "{ broken" },
    { name: "cycle", reference: "./.hidden", contents: '{"references":[{"path":"../tsconfig.json"}]}' },
    { name: "outside root", reference: "../outside", contents: undefined }
  ])("rejects a $name reference without discovery admission", async ({ reference, contents }) => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-reference-"));
    roots.push(projectPath);
    await writeFile(join(projectPath, "tsconfig.json"), JSON.stringify({ references: [{ path: reference }] }));
    if (contents !== undefined) {
      await mkdir(join(projectPath, ".hidden"));
      await writeFile(join(projectPath, ".hidden/tsconfig.json"), contents);
    }
    expect(() => createTypeScriptProjectModuleResolver({
      projectPath, sourceDocuments: [], configurationCandidatePaths: ["tsconfig.json"]
    })).toThrow(/Invalid project configuration/);
  });
  it.each([".git", ".SymbolLattice", "node_modules", "dist", "coverage"])(
    "rejects an explicitly referenced hard-excluded %s directory even when offered as a candidate",
    async (directory) => {
      const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-reference-"));
      roots.push(projectPath);
      await mkdir(join(projectPath, directory), { recursive: true });
      await writeFile(join(projectPath, "tsconfig.json"), JSON.stringify({ references: [{ path: `./${directory}` }] }));
      await writeFile(join(projectPath, directory, "tsconfig.json"), "{}");
      expect(() => createTypeScriptProjectModuleResolver({
        projectPath, sourceDocuments: [],
        configurationCandidatePaths: ["tsconfig.json", `${directory}/tsconfig.json`]
      })).toThrow(/project reference/);
    }
  );
  it("reads an explicitly referenced hidden config without expanding the source set", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-reference-"));
    roots.push(projectPath);
    const hiddenConfig = JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@hidden/*": ["src/*"] } } });
    const files: Record<string, string> = {
      "tsconfig.json": JSON.stringify({ references: [{ path: "./scripts" }] }),
      "scripts/tsconfig.json": JSON.stringify({ references: [{ path: "../.github/scripts/tsconfig.json" }] }),
      ".github/scripts/tsconfig.json": hiddenConfig,
      ".github/scripts/src/helper.ts": "export const hidden = true;",
      "scripts/consumer.ts": 'import { helper } from "./helper"; helper();',
      "scripts/helper.ts": "export function helper() { return 1; }"
    };
    for (const [path, source] of Object.entries(files)) {
      const absolutePath = join(projectPath, path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source);
    }
    const sourceDocuments: SourceDocument[] = ["scripts/consumer.ts", "scripts/helper.ts"].map((path) => ({
      absolutePath: join(projectPath, path), relativePath: path, language: "typescript",
      sourceText: files[path]!, contentHash: createHash("sha256").update(files[path]!).digest("hex")
    }));
    const resolver = createTypeScriptProjectModuleResolver({
      projectPath, sourceDocuments,
      configurationCandidatePaths: ["tsconfig.json", "scripts/tsconfig.json"]
    });
    expect(resolver.configurationInputs).toContainEqual({
      kind: "tsconfig", path: ".github/scripts/tsconfig.json", state: "present",
      contentHash: createHash("sha256").update(hiddenConfig).digest("hex")
    });
    expect(resolver.moduleResolver.resolve("scripts/consumer.ts", "./helper")).toEqual({
      targetFilePath: "scripts/helper.ts", strategy: "relative", configurationPaths: []
    });
    expect(resolver.moduleResolver.resolve("scripts/consumer.ts", "@hidden/helper").targetFilePath).toBeNull();
    expect(resolver.moduleResolver.resolve("scripts/consumer.ts", "../.github/scripts/src/helper").targetFilePath).toBeNull();
    expect(sourceDocuments.map((source) => source.relativePath)).toEqual(["scripts/consumer.ts", "scripts/helper.ts"]);
  });
});
