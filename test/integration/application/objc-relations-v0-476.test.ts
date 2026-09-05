import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../../../src/domain/facts.js";
import { SymbolLatticeService } from "../../../src/application/service.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/graph-store.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";

const temporaryDirectories: string[] = [];

async function createInlineProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-objc-project-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(Object.entries(files).map(async ([relativePath, sourceText]) => {
    const absolutePath = resolve(projectPath, ...relativePath.split("/"));
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, sourceText, "utf8");
  }));
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((projectPath) => rm(projectPath, { recursive: true })));
});

describe("Objective-C project relations v0.476", () => {
  it("resolves unique local header imports, protocol heritage, signatures, class messages, and alloc/init", async () => {
    const projectPath = await createInlineProject({
      "src/Factory.h": [
        "@protocol HealthChecking",
        "- (void)check;",
        "@end",
        "@interface Factory",
        "+ (void)ping;",
        "@end"
      ].join("\n"),
      "src/Consumer.m": [
        '#import "Factory.h"',
        "@interface Consumer : NSObject <HealthChecking>",
        "- (Factory *)make:(Factory *)factory;",
        "@end",
        "@implementation Consumer",
        "- (Factory *)make:(Factory *)factory { [Factory ping]; [[Factory alloc] init]; return factory; }",
        "@end"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());

    const indexed = await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const consumer = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/Consumer.m#Consumer");
    const factory = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/Factory.h#Factory");
    const healthChecking = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/Factory.h#protocol:HealthChecking");
    const ping = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/Factory.h#Factory.ping");
    const make = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/Consumer.m#Consumer.make:");
    const consumerFile = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/Consumer.m");
    const factoryFile = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/Factory.h");

    expect(indexed).toMatchObject({ stale: false });
    expect(graphStore.getActiveGraphBundle(projectPath).extractorVersion).toContain("multi-language-ast-v418");
    expect(graphStore.getActiveGraphBundle(projectPath).resolverVersion).toContain(PROJECT_RESOLVER_VERSION);
    expect(ARTIFACT_FACTS_EXTRACTOR_VERSION).toBe("multi-language-ast-v418");
    expect(consumer).toBeDefined();
    expect(factory).toBeDefined();
    expect(ping).toBeDefined();
    expect(make).toBeDefined();
    expect(consumerFile).toBeDefined();
    expect(factoryFile).toBeDefined();
    expect(healthChecking).toBeDefined();
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: consumerFile?.id, targetId: factoryFile?.id, kind: "imports", resolution: "exact" }),
      expect.objectContaining({ sourceId: consumer?.id, targetId: healthChecking?.id, kind: "implements", resolution: "exact" }),
      expect.objectContaining({ sourceId: make?.id, targetId: factory?.id, kind: "accepts", resolution: "exact" }),
      expect.objectContaining({ sourceId: make?.id, targetId: factory?.id, kind: "returns", resolution: "exact" }),
      expect.objectContaining({ sourceId: make?.id, targetId: ping?.id, kind: "calls", resolution: "exact" }),
      expect.objectContaining({ sourceId: make?.id, targetId: factory?.id, kind: "instantiates", resolution: "exact" })
    ]));
  });

  it("does not resolve external imports or dynamic receivers", async () => {
    const projectPath = await createInlineProject({
      "src/Smoke.m": [
        '#import <Foundation/Foundation.h>',
        "@interface Smoke",
        "- (void)entry;",
        "@end",
        "@implementation Smoke",
        "- (void)entry { [self helper]; [value run]; }",
        "@end"
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    expect(snapshot.edges.filter((edge) => edge.kind === "calls" || edge.kind === "imports")).toEqual([]);
  });
});
