import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directoryPath) =>
      rm(directoryPath, { recursive: true, force: true })
    )
  );
});

describe("filesystem source catalog freshness", () => {
  it("resolves a package-local tsconfig paths alias inside its configuration boundary", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-package-tsconfig-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "packages", "app", "src"), { recursive: true });
    await writeFile(join(projectPath, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }), "utf8");
    await writeFile(
      join(projectPath, "packages", "app", "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@app/*": ["src/*"] }
        }
      }),
      "utf8"
    );
    await writeFile(
      join(projectPath, "packages", "app", "src", "util.ts"),
      "export const value = 42;\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "packages", "app", "src", "consumer.ts"),
      'import { value } from "@app/util"; export const result = value;\n',
      "utf8"
    );

    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(
      scan.moduleResolver.resolve("packages/app/src/consumer.ts", "@app/util")
    ).toEqual({
      targetFilePath: "packages/app/src/util.ts",
      strategy: "tsconfig-paths",
      configurationPaths: ["packages/app/tsconfig.json"]
    });
    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "tsconfig",
          path: "packages/app/tsconfig.json",
          state: "present"
        })
      ])
    );
  });

  it("isolates a malformed nested tsconfig as one fail-closed boundary", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-invalid-package-tsconfig-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "packages", "app", "src"), { recursive: true });
    await writeFile(join(projectPath, "packages", "app", "tsconfig.json"), "{ invalid", "utf8");
    await writeFile(
      join(projectPath, "packages", "app", "src", "util.ts"),
      "export const value = 42;\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "packages", "app", "src", "consumer.ts"),
      'import { value } from "./util";\nimport { missing } from "@app/missing";\nexport const result = value + missing;\n',
      "utf8"
    );

    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("packages/app/src/consumer.ts", "./util")).toEqual({
      targetFilePath: "packages/app/src/util.ts",
      strategy: "relative",
      configurationPaths: []
    });
    expect(scan.moduleResolver.resolve("packages/app/src/consumer.ts", "@app/missing")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["packages/app/tsconfig.json"]
    });
    expect(
      scan.moduleResolver.resolve("packages/app/src/consumer.ts", "@app/missing").strategy
    ).not.toBe("workspace-package");
  });

  it("retains exact Lua bytes and binds the content hash to those bytes", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-lua-"));
    temporaryDirectories.push(projectPath);
    const sourceBytes = new Uint8Array([
      ...new TextEncoder().encode("function byteExact()\nend\n"),
      0xff
    ]);
    await writeFile(join(projectPath, "entry.lua"), sourceBytes);

    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.sourceDocuments).toHaveLength(1);
    expect(scan.sourceDocuments[0]).toMatchObject({
      relativePath: "entry.lua",
      language: "lua",
      contentHash: createHash("sha256").update(sourceBytes).digest("hex")
    });
    expect(Array.from(scan.sourceDocuments[0]?.sourceBytes ?? [])).toEqual(Array.from(sourceBytes));
  });

  it("proves an unchanged project from source and bounded configuration identities", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"), { recursive: true });
    await writeFile(join(projectPath, "package.json"), "{\"private\":true}\n", "utf8");
    await writeFile(join(projectPath, "src", "entry.ts"), "export const answer = 42;\n", "utf8");
    const catalog = new FileSystemSourceCatalog();
    const scan = await catalog.scan(projectPath);

    const verification = await catalog.verifyFreshness(projectPath, {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        language: document.language,
        contentHash: document.contentHash,
        indexedAt: "2026-08-09T00:00:00.000Z"
      })),
      indexInputs: scan.indexInputs
    });

    expect(scan.indexInputs).toMatchObject({ formatVersion: "project-inputs-v11" });
    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "configuration-discovery" })
      ])
    );
    expect(verification).toEqual({
      policy: "streaming-full-content-configuration-candidates-v5",
      outcome: "proven-unchanged",
      sourceFilesChanged: false,
      projectInputsChanged: false,
      complete: true,
      priorityDetection: "full-verification",
      filesChecked: 1,
      sourceHash: "sha256",
      retainedSourceText: false,
      configurationPolicy: "configuration-candidates-v2",
      configurationCandidatesChecked: expect.any(Number),
      sourceReadPolicy: "streaming-raw-bytes-for-shell-and-lua-with-objective-c-header-classification-v4",
      configurationReadPolicy: "streaming-utf8-v1",
      discoveryPolicy: "single-project-walk-v3",
      maximumConcurrentReads: 8,
      performance: {
        policy: "freshness-performance-v1",
        phases: [
          expect.objectContaining({ name: "freshness-discovery" }),
          expect.objectContaining({ name: "freshness-source-hash" }),
          expect.objectContaining({ name: "freshness-configuration-snapshot" })
        ]
      }
    });
    expect(verification.configurationCandidatesChecked).toBeGreaterThanOrEqual(2);
    expect(verification.performance.phases.every((phase) =>
      phase.durationMs >= 0 &&
      phase.residentSetSize.unit === "bytes" &&
      phase.residentSetSize.samplingPolicy === "phase-boundary-v1"
    )).toBe(true);
  });

  it("retains both source and project-input stale reasons in one complete receipt", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-both-stale-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"), { recursive: true });
    await writeFile(join(projectPath, "package.json"), "{\"private\":true}\n", "utf8");
    await writeFile(join(projectPath, "src", "entry.ts"), "export const answer = 42;\n", "utf8");
    const catalog = new FileSystemSourceCatalog();
    const scan = await catalog.scan(projectPath);

    await writeFile(join(projectPath, "package.json"), "{\"private\":false}\n", "utf8");
    await writeFile(join(projectPath, "src", "entry.ts"), "export const answer = 43;\n", "utf8");

    const verification = await catalog.verifyFreshness(projectPath, {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        language: document.language,
        contentHash: document.contentHash,
        indexedAt: "2026-08-25T00:00:00.000Z"
      })),
      indexInputs: scan.indexInputs
    });

    expect(verification).toMatchObject({
      policy: "streaming-full-content-configuration-candidates-v5",
      outcome: "source-files-changed",
      sourceFilesChanged: true,
      projectInputsChanged: true,
      complete: true,
      priorityDetection: "full-verification"
    });
    expect(verification.configurationCandidatesChecked).toBeGreaterThanOrEqual(2);
    expect(verification.performance.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "freshness-configuration-snapshot" })
      ])
    );
  });

  it("reports a source-only change without inventing a project-input change", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-source-only-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"), { recursive: true });
    await writeFile(join(projectPath, "package.json"), "{\"private\":true}\n", "utf8");
    await writeFile(join(projectPath, "src", "entry.ts"), "export const answer = 42;\n", "utf8");
    const catalog = new FileSystemSourceCatalog();
    const scan = await catalog.scan(projectPath);

    await writeFile(join(projectPath, "src", "entry.ts"), "export const answer = 43;\n", "utf8");

    const verification = await catalog.verifyFreshness(projectPath, {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        language: document.language,
        contentHash: document.contentHash,
        indexedAt: "2026-08-25T00:00:00.000Z"
      })),
      indexInputs: scan.indexInputs
    });

    expect(verification).toMatchObject({
      outcome: "source-files-changed",
      sourceFilesChanged: true,
      projectInputsChanged: false,
      complete: true
    });
    expect(verification.configurationCandidatesChecked).toBeGreaterThanOrEqual(2);
  });

  it("accepts priority options while this catalog performs the complete verification", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-priority-options-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"), { recursive: true });
    await writeFile(join(projectPath, "src", "entry.ts"), "export const answer = 42;\n", "utf8");
    const catalog = new FileSystemSourceCatalog();
    const scan = await catalog.scan(projectPath);

    const verification = await catalog.verifyFreshness(projectPath, {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        language: document.language,
        contentHash: document.contentHash,
        indexedAt: "2026-08-25T00:00:00.000Z"
      })),
      indexInputs: scan.indexInputs
    }, {
      priorityPaths: ["src/entry.ts"],
      allowEarlySourceExit: true
    });

    expect(verification).toMatchObject({
      policy: "streaming-full-content-configuration-candidates-v5",
      outcome: "proven-unchanged",
      sourceFilesChanged: false,
      projectInputsChanged: false,
      complete: true,
      priorityDetection: "full-verification"
    });
  });

  it("returns an incomplete stale receipt after an exact indexed priority path changes", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-priority-stale-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"), { recursive: true });
    await writeFile(join(projectPath, "src", "entry.ts"), "export const answer = 42;\n", "utf8");
    const catalog = new FileSystemSourceCatalog();
    const scan = await catalog.scan(projectPath);
    await writeFile(join(projectPath, "src", "entry.ts"), "export const answer = 43;\n", "utf8");

    const verification = await catalog.verifyFreshness(projectPath, {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        language: document.language,
        contentHash: document.contentHash,
        indexedAt: "2026-08-25T00:00:00.000Z"
      })),
      indexInputs: scan.indexInputs
    }, {
      priorityPaths: ["src/entry.ts"],
      allowEarlySourceExit: true
    });

    expect(verification).toMatchObject({
      policy: "streaming-full-content-configuration-candidates-v5",
      outcome: "source-files-changed",
      sourceFilesChanged: true,
      projectInputsChanged: false,
      complete: false,
      priorityDetection: "priority-paths",
      filesChecked: 1,
      configurationCandidatesChecked: 0,
      performance: {
        phases: [expect.objectContaining({ name: "freshness-source-hash" })]
      }
    });
  });

  it("detects deletion of an exact indexed priority path without a full walk", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-priority-delete-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"), { recursive: true });
    const sourcePath = join(projectPath, "src", "entry.ts");
    await writeFile(sourcePath, "export const answer = 42;\n", "utf8");
    const catalog = new FileSystemSourceCatalog();
    const scan = await catalog.scan(projectPath);
    await unlink(sourcePath);

    const verification = await catalog.verifyFreshness(projectPath, {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        language: document.language,
        contentHash: document.contentHash,
        indexedAt: "2026-08-25T00:00:00.000Z"
      })),
      indexInputs: scan.indexInputs
    }, {
      priorityPaths: ["src/entry.ts"],
      allowEarlySourceExit: true
    });

    expect(verification).toMatchObject({
      sourceFilesChanged: true,
      projectInputsChanged: false,
      complete: false,
      priorityDetection: "priority-paths",
      filesChecked: 0,
      configurationCandidatesChecked: 0
    });
  });

  it("falls back to complete verification for a priority path absent from the active index", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-priority-new-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"), { recursive: true });
    await writeFile(join(projectPath, "src", "entry.ts"), "export const answer = 42;\n", "utf8");
    const catalog = new FileSystemSourceCatalog();
    const scan = await catalog.scan(projectPath);
    await writeFile(join(projectPath, "src", "new.ts"), "export const created = true;\n", "utf8");

    const verification = await catalog.verifyFreshness(projectPath, {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        language: document.language,
        contentHash: document.contentHash,
        indexedAt: "2026-08-25T00:00:00.000Z"
      })),
      indexInputs: scan.indexInputs
    }, {
      priorityPaths: ["src/new.ts"],
      allowEarlySourceExit: true
    });

    expect(verification).toMatchObject({
      sourceFilesChanged: true,
      complete: true,
      priorityDetection: "full-verification",
      filesChecked: 2
    });
  });

  it("fails closed to a full project-input check for an index without discovery identity", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-legacy-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "src"), { recursive: true });
    await writeFile(join(projectPath, "src", "entry.ts"), "export const answer = 42;\n", "utf8");
    const catalog = new FileSystemSourceCatalog();
    const scan = await catalog.scan(projectPath);
    const legacyInputs = {
      ...scan.indexInputs,
      configurationInputs: scan.indexInputs.configurationInputs.filter(
        (input) => input.kind !== "configuration-discovery"
      )
    };

    const verification = await catalog.verifyFreshness(projectPath, {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        language: document.language,
        contentHash: document.contentHash,
        indexedAt: "2026-08-09T00:00:00.000Z"
      })),
      indexInputs: legacyInputs
    });

    expect(verification).toMatchObject({
      outcome: "project-inputs-changed",
      configurationCandidatesChecked: 0,
      sourceFilesChanged: false,
      projectInputsChanged: true,
      complete: true,
      priorityDetection: "full-verification"
    });
  });

  it("detects a nested gitignore edit even when source membership is unchanged", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-source-catalog-ignore-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "src", "nested"), { recursive: true });
    await writeFile(join(projectPath, "src", "entry.ts"), "export const entry = true;\n", "utf8");
    await writeFile(join(projectPath, "src", "nested", ".gitignore"), "ignored.ts\n", "utf8");
    const catalog = new FileSystemSourceCatalog();
    const scan = await catalog.scan(projectPath);

    await writeFile(
      join(projectPath, "src", "nested", ".gitignore"),
      "ignored.ts\n# policy changed\n",
      "utf8"
    );
    const verification = await catalog.verifyFreshness(projectPath, {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        language: document.language,
        contentHash: document.contentHash,
        indexedAt: "2026-08-25T00:00:00.000Z"
      })),
      indexInputs: scan.indexInputs
    });

    expect(verification).toMatchObject({
      outcome: "project-inputs-changed",
      configurationPolicy: "configuration-candidates-v2",
      discoveryPolicy: "single-project-walk-v3",
      sourceFilesChanged: false,
      projectInputsChanged: true,
      complete: true,
      priorityDetection: "full-verification"
    });
  });
});
