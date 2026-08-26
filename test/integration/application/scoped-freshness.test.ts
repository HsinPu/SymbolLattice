import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/service.js";
import { hashSource, hashUtf8File } from "../../../src/infrastructure/filesystem/discovery.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/graph-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((projectPath) => rm(projectPath, { recursive: true, force: true }))
  );
});

describe("scoped project freshness", () => {
  it("ignores changes outside the persisted scope for status and strict freshness", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-scoped-freshness-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "content"), { recursive: true });
    await writeFile(join(projectPath, "content", "inside.ts"), "export const inside = true;\n", "utf8");
    await writeFile(join(projectPath, "outside.ts"), "export const outside = true;\n", "utf8");

    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    const initial = await service.init({ projectPath, scopeRoots: ["content"] });
    expect(initial).toMatchObject({ stale: false, counts: { files: 1 } });

    await writeFile(join(projectPath, "outside.ts"), "export const outside = false;\n", "utf8");

    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: false,
      staleReasons: []
    });
    expect(await service.observeFreshness(projectPath, { paths: [], complete: false })).toMatchObject({
      knownStale: false,
      status: { stale: false, staleReasons: [] }
    });

    await writeFile(join(projectPath, "content", "inside.ts"), "export const inside = false;\n", "utf8");
    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: true,
      staleReasons: ["source-files-changed"]
    });
  });

  it("retains the scope after an explicit scoped sync", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-scoped-sync-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "content"), { recursive: true });
    await writeFile(join(projectPath, "content", "inside.ts"), "export const inside = true;\n", "utf8");
    await writeFile(join(projectPath, "outside.ts"), "export const outside = true;\n", "utf8");

    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath, scopeRoots: ["content"] });
    await writeFile(join(projectPath, "outside.ts"), "export const outside = false;\n", "utf8");
    await expect(service.sync({ projectPath, scopeRoots: ["content"] })).resolves.toMatchObject({
      stale: false,
      counts: { files: 1 }
    });

    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: false,
      staleReasons: []
    });
  });

  it("retains the scope across a reopened service", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-scoped-reopen-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "content"), { recursive: true });
    await writeFile(join(projectPath, "content", "inside.ts"), "export const inside = true;\n", "utf8");
    await writeFile(join(projectPath, "outside.ts"), "export const outside = true;\n", "utf8");

    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath, scopeRoots: ["content"] });
    await writeFile(join(projectPath, "outside.ts"), "export const outside = false;\n", "utf8");

    const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    expect(await reopened.getStatus(projectPath)).toMatchObject({
      stale: false,
      staleReasons: []
    });
    expect(await reopened.observeFreshness(projectPath, { paths: [], complete: false })).toMatchObject({
      knownStale: false,
      status: { stale: false, staleReasons: [] }
    });
  });

  it("uses the same decoded UTF-8 identity for freshness as the initial scan", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-scoped-utf8-"));
    temporaryDirectories.push(projectPath);
    const sourcePath = join(projectPath, "content.ts");
    await writeFile(sourcePath, new Uint8Array([
      ...new TextEncoder().encode("export const content = true;\n"),
      0xff
    ]));

    const catalog = new FileSystemSourceCatalog();
    const scan = await catalog.scan(projectPath);
    const verification = await catalog.verifyFreshness(projectPath, {
      files: scan.sourceDocuments.map((document) => ({
        path: document.relativePath,
        language: document.language,
        contentHash: document.contentHash,
        indexedAt: "2026-08-26T00:00:00.000Z"
      })),
      indexInputs: scan.indexInputs
    });

    expect(verification).toMatchObject({
      outcome: "proven-unchanged",
      sourceFilesChanged: false
    });
  });

  it("keeps native streaming UTF-8 hashes aligned with TextDecoder BOM handling", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-scoped-bom-"));
    temporaryDirectories.push(projectPath);
    const sourcePath = join(projectPath, "content.md");
    const sourceBytes = new Uint8Array([
      0xef, 0xbb, 0xbf,
      ...new TextEncoder().encode("# Content\uFEFFBody\n")
    ]);
    await writeFile(sourcePath, sourceBytes);

    expect(await hashUtf8File(sourcePath)).toBe(
      hashSource(new TextDecoder("utf-8").decode(sourceBytes))
    );

    const doubleBomPath = join(projectPath, "double-bom.md");
    const doubleBomBytes = new Uint8Array([
      0xef, 0xbb, 0xbf,
      0xef, 0xbb, 0xbf,
      ...new TextEncoder().encode("A\n")
    ]);
    await writeFile(doubleBomPath, doubleBomBytes);
    const decoded = new TextDecoder("utf-8").decode(doubleBomBytes);
    expect(decoded).toBe("\uFEFFA\n");
    expect(await hashUtf8File(doubleBomPath)).toBe(hashSource(decoded));
  });

  it("keeps a BOM-prefixed scoped document fresh when an outside file changes", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-scoped-bom-status-"));
    temporaryDirectories.push(projectPath);
    await mkdir(join(projectPath, "content"), { recursive: true });
    await writeFile(join(projectPath, "content", "inside.md"), new Uint8Array([
      0xef, 0xbb, 0xbf,
      ...new TextEncoder().encode("# Inside\n")
    ]));
    await writeFile(join(projectPath, "outside.ts"), "export const outside = true;\n", "utf8");

    const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
    await service.init({ projectPath, scopeRoots: ["content"] });
    await writeFile(join(projectPath, "outside.ts"), "export const outside = false;\n", "utf8");

    expect(await service.getStatus(projectPath)).toMatchObject({
      stale: false,
      staleReasons: []
    });
  });
});
