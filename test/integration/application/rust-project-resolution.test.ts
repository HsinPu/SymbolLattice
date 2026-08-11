import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];
const RUST_FILE_IMPORT_RULE = "project.rust.crate.direct-module.named-import-file";

async function createInlineProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "symbol-lattice-rust-project-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, sourceText]) => {
      const absolutePath = resolve(projectPath, ...relativePath.split("/"));
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, sourceText, "utf8");
    })
  );
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

function rustCrateFiles(layout: "file" | "mod" = "file"): Record<string, string> {
  const mapPath = layout === "file" ? "src/map.rs" : "src/map/mod.rs";
  const valuePath = layout === "file" ? "src/value.rs" : "src/value/mod.rs";
  return {
    "Cargo.toml": ["[package]", 'name = "serde-json"', 'version = "1.0.0"', 'edition = "2021"'].join("\n"),
    "src/lib.rs": ["mod map;", "mod value;"].join("\n"),
    [mapPath]: "use crate::value::Value;\n",
    [valuePath]: "pub enum Value { Null }\n"
  };
}

function projectImportEdges(snapshot: { readonly edges: readonly { readonly evidence?: { readonly ruleId?: string } }[] }) {
  return snapshot.edges.filter((edge) => edge.evidence?.ruleId === RUST_FILE_IMPORT_RULE);
}

describe("Rust project resolution", () => {
  it("resolves direct crate imports when retained ranges cross CRLF boundaries", async () => {
    const projectPath = await createInlineProject({
      "Cargo.toml": ["[package]", 'name = "serde-json"', 'version = "1.0.0"'].join("\r\n"),
      "src/lib.rs": "mod map;\r\nmod value;\r\n",
      "src/map.rs": "// serde map\r\nuse crate::value::Value;\r\n",
      "src/value.rs": "// serde value\r\npub enum Value { Null }\r\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = store.getSnapshot(projectPath);
    const source = snapshot.symbols.find(
      (symbol) => symbol.kind === "file" && symbol.filePath === "src/map.rs"
    );
    const target = snapshot.symbols.find(
      (symbol) => symbol.kind === "file" && symbol.filePath === "src/value.rs"
    );
    expect(projectImportEdges(snapshot)).toEqual([
      expect.objectContaining({
        sourceId: source?.id,
        targetId: target?.id,
        referenceName: "crate::value::Value",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: RUST_FILE_IMPORT_RULE,
          candidateSymbolIds: [target?.id],
          resolutionPath: ["src/map.rs", "src/lib.rs", "src/value.rs"]
        })
      })
    ]);
  });

  it.each(["file", "mod"] as const)(
    "resolves serde-json-shaped direct crate imports through %s layouts across persistence, queries, and sync",
    async (layout) => {
      const projectPath = await createInlineProject(rustCrateFiles(layout));
      const store = new SqliteGraphStore();
      const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
      const sourcePath = layout === "file" ? "src/map.rs" : "src/map/mod.rs";
      const targetPath = layout === "file" ? "src/value.rs" : "src/value/mod.rs";
      const source = () => store.getSnapshot(projectPath).symbols.find(
        (symbol) => symbol.kind === "file" && symbol.filePath === sourcePath
      );
      const target = () => store.getSnapshot(projectPath).symbols.find(
        (symbol) => symbol.kind === "file" && symbol.filePath === targetPath
      );
      const edge = () => projectImportEdges(store.getSnapshot(projectPath))[0];

      const initial = await service.init({ projectPath });

      expect(edge()).toMatchObject({
        sourceId: source()?.id,
        targetId: target()?.id,
        kind: "imports",
        filePath: sourcePath,
        resolution: "exact",
        confidence: 1,
        referenceName: "crate::value::Value",
        evidence: {
          ruleId: RUST_FILE_IMPORT_RULE,
          stage: "module",
          candidateSymbolIds: [target()?.id],
          resolutionPath: [sourcePath, "src/lib.rs", targetPath]
        }
      });
      expect(edge()?.evidence?.configurationPaths).toBeUndefined();
      expect(await service.fileView(projectPath, targetPath)).toMatchObject({
        dependents: [expect.objectContaining({ filePath: sourcePath })]
      });
      expect(await service.explainEdge(projectPath, edge()?.id ?? "missing")).toMatchObject({
        source: { id: source()?.id },
        target: { id: target()?.id },
        edge: { evidence: { ruleId: RUST_FILE_IMPORT_RULE } }
      });
      expect((await service.sync({ projectPath })).generationId).toBe(initial.generationId);
      const reopened = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
      expect(await reopened.fileView(projectPath, targetPath)).toMatchObject({
        dependents: [expect.objectContaining({ filePath: sourcePath })]
      });

      const alternateTargetPath = layout === "file" ? "src/value/mod.rs" : "src/value.rs";
      await writeFile(resolve(projectPath, ...targetPath.split("/")), "", "utf8");
      await mkdir(resolve(projectPath, ...alternateTargetPath.split("/").slice(0, -1)), { recursive: true });
      await writeFile(resolve(projectPath, ...alternateTargetPath.split("/")), "pub enum Value { Changed }\n", "utf8");
      const dualLayout = await service.sync({ projectPath });
      expect(dualLayout.generationId).not.toBe(initial.generationId);
      expect(projectImportEdges(store.getSnapshot(projectPath))).toEqual([]);

      await rm(resolve(projectPath, ...targetPath.split("/")), { force: true });
      const replacement = await service.sync({ projectPath });
      expect(replacement.generationId).not.toBe(dualLayout.generationId);
      const replacementTarget = store.getSnapshot(projectPath).symbols.find(
        (symbol) => symbol.kind === "file" && symbol.filePath === alternateTargetPath
      );
      expect(edge()).toMatchObject({
        targetId: replacementTarget?.id,
        evidence: { resolutionPath: [sourcePath, "src/lib.rs", alternateTargetPath] }
      });

      await rm(resolve(projectPath, ...alternateTargetPath.split("/")), { force: true });
      const removed = await service.sync({ projectPath });
      expect(removed.generationId).not.toBe(replacement.generationId);
      expect(projectImportEdges(store.getSnapshot(projectPath))).toEqual([]);
    }
  );

  it.each([
    ["no crate root", { "Cargo.toml": "[package]\nname = \"sample\"\nversion = \"1\"\n", "src/map.rs": "use crate::value::Value;\n", "src/value.rs": "pub enum Value { Unit }\n" }],
    ["dual conventional roots", { ...rustCrateFiles(), "src/main.rs": "mod map;\nmod value;\n" }],
    ["a nested crate root", { ...rustCrateFiles(), "examples/nested/src/lib.rs": "pub enum Nested { Unit }\n" }],
    ["a workspace-like additional root", { ...rustCrateFiles(), "crates/other/src/main.rs": "fn main() {}\n" }],
    ["a src/bin multi-root", { ...rustCrateFiles(), "src/bin/other.rs": "fn main() {}\n" }],
    ["a missing root module proof", { ...rustCrateFiles(), "src/lib.rs": "mod map;\n" }],
    ["a root-module mismatch", { ...rustCrateFiles(), "src/lib.rs": "mod other;\nmod value;\n" }],
    ["a cfg-gated module", { ...rustCrateFiles(), "src/lib.rs": "mod map;\n#[cfg(feature = \"x\")]\nmod value;\n" }],
    ["a path-directed module", { ...rustCrateFiles(), "src/lib.rs": "mod map;\n#[path = \"custom.rs\"]\nmod value;\n" }],
    ["an alias import", { ...rustCrateFiles(), "src/map.rs": "use crate::value::Value as LocalValue;\n" }],
    ["a missing target", { ...rustCrateFiles(), "src/value.rs": "pub enum Other { Unit }\n" }]
  ] as const)("emits no exact Rust project edge for %s", async (_description, files) => {
    const projectPath = await createInlineProject(files);
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    expect(projectImportEdges(store.getSnapshot(projectPath))).toEqual([]);
  });

  it("fails closed for forged project facts with mismatched ownership, ranges, or duplicate declarations", () => {
    const rootSource = "mod map;\nmod value;\n";
    const mapSource = "use crate::value::Value;\n";
    const valueSource = "pub enum Value { Unit }\n";
    const rootFacts = extractFileFacts({ filePath: "src/lib.rs", language: "rust", sourceText: rootSource });
    const mapFacts = extractFileFacts({ filePath: "src/map.rs", language: "rust", sourceText: mapSource });
    const valueFacts = extractFileFacts({ filePath: "src/value.rs", language: "rust", sourceText: valueSource });
    const document = (relativePath: string, sourceText: string) => ({
      absolutePath: `/${relativePath}`,
      relativePath,
      language: "rust" as const,
      sourceText,
      contentHash: relativePath
    });

    for (const mutation of [
      {
        ...mapFacts,
        rustProjectFacts: {
          ...mapFacts.rustProjectFacts!,
          imports: [...mapFacts.rustProjectFacts!.imports, mapFacts.rustProjectFacts!.imports[0]!]
        }
      },
      {
        ...mapFacts,
        rustProjectFacts: {
          ...mapFacts.rustProjectFacts!,
          imports: mapFacts.rustProjectFacts!.imports.map((fact) => ({ ...fact, range: rootFacts.rustProjectFacts!.modules[0]!.range }))
        }
      },
      {
        ...valueFacts,
        rustProjectFacts: {
          ...valueFacts.rustProjectFacts!,
          declarations: [...valueFacts.rustProjectFacts!.declarations, valueFacts.rustProjectFacts!.declarations[0]!]
        }
      },
      {
        ...valueFacts,
        rustProjectFacts: {
          ...valueFacts.rustProjectFacts!,
          declarations: valueFacts.rustProjectFacts!.declarations.map((fact) => ({
            ...fact,
            symbolId: "symbol:forged"
          }))
        }
      },
      {
        ...valueFacts,
        rustProjectFacts: {
          ...valueFacts.rustProjectFacts!,
          declarations: valueFacts.rustProjectFacts!.declarations.map((fact) => ({
            ...fact,
            kind: "function" as const
          }))
        }
      },
      {
        ...rootFacts,
        rustProjectFacts: {
          ...rootFacts.rustProjectFacts!,
          modules: [...rootFacts.rustProjectFacts!.modules, rootFacts.rustProjectFacts!.modules[0]!]
        }
      },
      {
        ...rootFacts,
        rustProjectFacts: {
          ...rootFacts.rustProjectFacts!,
          modules: rootFacts.rustProjectFacts!.modules.map((fact) => ({
            ...fact,
            filePath: "src/forged.rs"
          }))
        }
      }
    ]) {
      const snapshot = resolveProjectFacts({
        sourceDocuments: [
          document("src/lib.rs", rootSource),
          document("src/map.rs", mapSource),
          document("src/value.rs", valueSource)
        ],
        extractedFiles: mutation.filePath === "src/lib.rs"
          ? [mutation, mapFacts, valueFacts]
          : mutation.filePath === "src/map.rs"
            ? [rootFacts, mutation, valueFacts]
            : [rootFacts, mapFacts, mutation],
        indexedAt: "2026-08-11T00:00:00.000Z"
      });
      expect(projectImportEdges(snapshot)).toEqual([]);
    }
  });

  it("fails closed for malformed persisted CRLF ranges", () => {
    const rootSource = "mod map;\r\nmod value;\r\n";
    const mapSource = "// map\r\nuse crate::value::Value;\r\n";
    const valueSource = "// value\r\npub enum Value { Unit }\r\n";
    const rootFacts = extractFileFacts({ filePath: "src/lib.rs", language: "rust", sourceText: rootSource });
    const mapFacts = extractFileFacts({ filePath: "src/map.rs", language: "rust", sourceText: mapSource });
    const valueFacts = extractFileFacts({ filePath: "src/value.rs", language: "rust", sourceText: valueSource });
    const malformedMapFacts = {
      ...mapFacts,
      rustProjectFacts: {
        ...mapFacts.rustProjectFacts!,
        imports: mapFacts.rustProjectFacts!.imports.map((fact) => ({
          ...fact,
          range: {
            start: { line: 2, column: 1 },
            end: { line: 2, column: 10_000 }
          }
        }))
      }
    };
    const document = (relativePath: string, sourceText: string) => ({
      absolutePath: `/${relativePath}`,
      relativePath,
      language: "rust" as const,
      sourceText,
      contentHash: relativePath
    });
    const snapshot = resolveProjectFacts({
      sourceDocuments: [
        document("src/lib.rs", rootSource),
        document("src/map.rs", mapSource),
        document("src/value.rs", valueSource)
      ],
      extractedFiles: [rootFacts, malformedMapFacts, valueFacts],
      indexedAt: "2026-08-11T00:00:00.000Z"
    });

    expect(projectImportEdges(snapshot)).toEqual([]);
  });
});
