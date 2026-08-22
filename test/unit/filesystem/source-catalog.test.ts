import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

    expect(scan.indexInputs).toMatchObject({ formatVersion: "project-inputs-v8" });
    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "configuration-discovery" })
      ])
    );
    expect(verification).toEqual({
      policy: "streaming-full-content-configuration-candidates-v4",
      outcome: "proven-unchanged",
      filesChecked: 1,
      sourceHash: "sha256",
      retainedSourceText: false,
      configurationPolicy: "configuration-candidates-v1",
      configurationCandidatesChecked: expect.any(Number),
      sourceReadPolicy: "streaming-raw-bytes-for-shell-and-lua-with-objective-c-header-classification-v3",
      configurationReadPolicy: "streaming-utf8-v1",
      discoveryPolicy: "single-project-walk-v1",
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
      configurationCandidatesChecked: 0
    });
  });
});
