import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  PROJECT_RESOLVER_VERSION
} from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("Shell structural v1.2.2 persistence", () => {
  it("keeps a deeply nested source-induced WASM trap file-only", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-shell-trap-"));
    temporaryDirectories.push(projectPath);
    const scriptPath = join(projectPath, "trap.sh");
    const source = `f(){ echo ${"$(".repeat(1_024)}:${")".repeat(1_024)}; }\n`;
    await writeFile(scriptPath, source, "utf8");
    await writeFile(join(projectPath, "healthy.sh"), "healthy() { :; }\n", "utf8");

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await expect(service.init({ projectPath })).resolves.toBeDefined();
    const facts = store.getArtifactFacts(projectPath).find(({ filePath }) => filePath === "trap.sh");
    expect(facts?.symbols.map(({ kind }) => kind)).toEqual(["file"]);
    expect(facts?.edges).toEqual([]);
    const healthyFacts = store.getArtifactFacts(projectPath)
      .find(({ filePath }) => filePath === "healthy.sh");
    expect(healthyFacts?.symbols.filter(({ kind }) => kind === "function").map(({ name }) => name))
      .toEqual(["healthy"]);
  });

  it("uses original Shell bytes for strict UTF-8 and hashing without rejecting valid U+FFFD", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-shell-raw-utf8-"));
    temporaryDirectories.push(projectPath);
    const invalidPath = join(projectPath, "invalid.sh");
    const validPath = join(projectPath, "valid.sh");
    const invalidPrefix = Buffer.from("#!/bin/sh\ninvalid() { :; }\n# ", "utf8");
    await writeFile(invalidPath, Buffer.concat([invalidPrefix, Buffer.from([0xff])]));
    await writeFile(validPath, "#!/bin/sh\nvalid() { :; }\n# �\n", "utf8");

    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });

    const initialFacts = store.getArtifactFacts(projectPath);
    const invalidFacts = initialFacts.find(({ filePath }) => filePath === "invalid.sh");
    const validFacts = initialFacts.find(({ filePath }) => filePath === "valid.sh");
    expect(invalidFacts?.symbols.map(({ kind }) => kind)).toEqual(["file"]);
    expect(invalidFacts?.edges).toEqual([]);
    expect(validFacts?.symbols.filter(({ kind }) => kind === "function").map(({ name }) => name))
      .toEqual(["valid"]);

    await writeFile(invalidPath, Buffer.concat([invalidPrefix, Buffer.from([0xfe])]));
    const synced = await service.sync({ projectPath });
    expect(synced.lastIndexWork?.reExtractedFiles).toContain("invalid.sh");
  });

  it("keeps string-only custom source catalogs compatible", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-shell-string-catalog-"));
    temporaryDirectories.push(projectPath);
    await writeFile(join(projectPath, "custom.sh"), "#!/bin/sh\ncustom() { :; }\n# �\n", "utf8");
    const filesystemCatalog = new FileSystemSourceCatalog();
    const stringOnlyCatalog = {
      async scan(path: string) {
        const scan = await filesystemCatalog.scan(path);
        return {
          ...scan,
          sourceDocuments: scan.sourceDocuments.map((document) => ({
            absolutePath: document.absolutePath,
            relativePath: document.relativePath,
            language: document.language,
            sourceText: document.sourceText,
            contentHash: document.contentHash
          }))
        };
      },
      read: (path: string, relativePath: string) => filesystemCatalog.read(path, relativePath),
      isUnsafeProjectPath: (path: string) => filesystemCatalog.isUnsafeProjectPath(path)
    };
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, stringOnlyCatalog);

    await service.init({ projectPath });

    const facts = store.getArtifactFacts(projectPath)[0];
    expect(facts?.symbols.filter(({ kind }) => kind === "function").map(({ name }) => name))
      .toEqual(["custom"]);
  });

  it("invalidates stale v327 facts and persists v330 direct-root structure", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-shell-v328-"));
    temporaryDirectories.push(projectPath);
    const scriptPath = join(projectPath, "scripts", "deploy.sh");
    await mkdir(dirname(scriptPath), { recursive: true });
    await writeFile(
      scriptPath,
      [
        "#!/bin/bash",
        "left() { nested() { :; }; }; function right { :; }",
        "export -f left",
        ""
      ].join("\n"),
      "utf8"
    );

    const staleExtractor = Object.assign(
      (input: Parameters<typeof extractFileFacts>[0]) => {
        const facts = extractFileFacts(input);
        return input.language !== "shell"
          ? facts
          : {
              ...facts,
              symbols: facts.symbols.filter(({ kind }) => kind === "file"),
              edges: []
            };
      },
      { version: "multi-language-ast-v327" }
    );
    const staleStore = new SqliteGraphStore();
    const staleService = new SymbolLatticeService(staleStore, new FileSystemSourceCatalog(), {
      artifactFactsExtractor: staleExtractor
    });
    await staleService.init({ projectPath });
    expect(staleStore.getArtifactFacts(projectPath)).toEqual([
      expect.objectContaining({
        filePath: "scripts/deploy.sh",
        extractorVersion: "multi-language-ast-v327",
        symbols: [expect.objectContaining({ kind: "file" })],
        edges: []
      })
    ]);

    const upgradedStore = new SqliteGraphStore();
    const upgradedService = new SymbolLatticeService(
      upgradedStore,
      new FileSystemSourceCatalog()
    );
    await expect(upgradedService.getStatus(projectPath)).resolves.toMatchObject({
      stale: true,
      staleReasons: ["indexer-version-changed"]
    });

    const synced = await upgradedService.sync({ projectPath });
    expect(ARTIFACT_FACTS_EXTRACTOR_VERSION).toBe("multi-language-ast-v369");
    expect(PROJECT_RESOLVER_VERSION).toBe("project-resolver-v174");
    expect(synced.lastIndexWork).toMatchObject({
      mode: "incremental",
      reExtractedFiles: ["scripts/deploy.sh"],
      reuseInvalidationReasons: ["extractor-version-changed"]
    });

    const facts = upgradedStore.getArtifactFacts(projectPath)[0];
    expect(facts).toMatchObject({
      filePath: "scripts/deploy.sh",
      extractorVersion: "multi-language-ast-v369"
    });
    expect(facts?.symbols.filter(({ kind }) => kind === "function").map(({ name }) => name))
      .toEqual(["left", "right"]);
    expect(facts?.edges.map(({ kind }) => kind)).toEqual(["contains", "contains"]);
    expect(facts?.pendingReferences).toEqual([]);
    expect(facts?.exportBindings).toEqual([]);
  });
});
