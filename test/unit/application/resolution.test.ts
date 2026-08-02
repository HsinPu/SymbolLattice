import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { ProjectConfigurationError } from "../../../src/domain/configuration.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { createTypeScriptProjectModuleResolver } from "../../../src/infrastructure/typescript/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

const temporaryProjectPaths: string[] = [];

function languageForPath(relativePath: string): SourceDocument["language"] {
  if (/\.svelte$/i.test(relativePath)) {
    return "svelte";
  }
  if (/\.astro$/i.test(relativePath)) {
    return "astro";
  }
  return /\.(?:[cm]?tsx?)$/i.test(relativePath) ? "typescript" : "javascript";
}

async function createConfiguredProject(
  files: Readonly<Record<string, string>>
): Promise<{ readonly projectPath: string; readonly sourceDocuments: readonly SourceDocument[] }> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-resolution-"));
  temporaryProjectPaths.push(projectPath);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, sourceText]) => {
      const absolutePath = resolve(projectPath, ...relativePath.split("/"));
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, sourceText, "utf8");
    })
  );

  return {
    projectPath,
    sourceDocuments: Object.entries(files)
      .filter(([relativePath]) => /\.(?:[cm]?[jt]sx?|svelte|astro)$/i.test(relativePath))
      .map(([relativePath, sourceText]) => ({
        absolutePath: resolve(projectPath, ...relativePath.split("/")),
        relativePath,
        language: languageForPath(relativePath),
        sourceText,
        contentHash: `test:${relativePath}:${sourceText.length}`
      }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  };
}

function snapshotWithResolver(sourceDocuments: readonly SourceDocument[], moduleResolver: Parameters<typeof resolveProjectFacts>[0]["moduleResolver"]) {
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((document) =>
      extractFileFacts({
        filePath: document.relativePath,
        sourceText: document.sourceText,
        language: document.language
      })
    ),
    indexedAt: "2026-07-29T00:00:00.000Z",
    ...(moduleResolver === undefined ? {} : { moduleResolver })
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryProjectPaths.splice(0).map((projectPath) => rm(projectPath, { recursive: true, force: true }))
  );
});

describe("project reference resolution", () => {
  it("resolves an extensionless TypeScript default import to a Svelte component", async () => {
    const project = await createConfiguredProject({
      "src/App.svelte": "<main>App</main>",
      "src/main.ts": [
        'import App from "./App";',
        "export function boot() { return App(); }"
      ].join("\n")
    });
    const configuredResolver = createTypeScriptProjectModuleResolver(project);
    const snapshot = snapshotWithResolver(project.sourceDocuments, configuredResolver.moduleResolver);

    expect(configuredResolver.moduleResolver.resolve("src/main.ts", "./App")).toEqual({
      targetFilePath: "src/App.svelte",
      strategy: "relative",
      configurationPaths: []
    });
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "calls",
          resolution: "exact",
          referenceName: "App",
          evidence: expect.objectContaining({
            ruleId: "module.explicit-import-binding",
            stage: "module"
          })
        })
      ])
    );
  });

  it("resolves an extensionless TypeScript default import to an Astro component", async () => {
    const project = await createConfiguredProject({
      "src/Card.astro": "<article>Card</article>",
      "src/main.ts": [
        'import Card from "./Card";',
        "export function boot() { return Card(); }"
      ].join("\n")
    });
    const configuredResolver = createTypeScriptProjectModuleResolver(project);
    const snapshot = snapshotWithResolver(project.sourceDocuments, configuredResolver.moduleResolver);

    expect(configuredResolver.moduleResolver.resolve("src/main.ts", "./Card")).toEqual({
      targetFilePath: "src/Card.astro",
      strategy: "relative",
      configurationPaths: []
    });
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "calls",
          resolution: "exact",
          referenceName: "Card",
          evidence: expect.objectContaining({
            ruleId: "module.explicit-import-binding",
            stage: "module"
          })
        })
      ])
    );
  });

  it("resolves relative named imports through their explicit bindings", () => {
    const sourceDocuments = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript" as const,
        sourceText: "export function add(left: number, right: number) { return left + right; }",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript" as const,
        sourceText: `
          import { add } from "./math.js";
          export function total() { return add(1, 2) + unknown(); }
        `,
        contentHash: "consumer"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          sourceText: document.sourceText,
          language: document.language
        })
      ),
      indexedAt: "2026-07-29T00:00:00.000Z"
    });

    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "imports", resolution: "exact", targetId: expect.any(String) }),
        expect.objectContaining({
          kind: "calls",
          referenceName: "add",
          resolution: "exact",
          confidence: 1
        }),
        expect.objectContaining({
          kind: "calls",
          referenceName: "unknown",
          resolution: "unresolved",
          targetId: null
        })
      ])
    );
    const add = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/math.ts" && symbol.name === "add"
    );
    const mathFile = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/math.ts" && symbol.kind === "file"
    );
    const addCall = snapshot.edges.find(
      (edge) => edge.kind === "calls" && edge.referenceName === "add"
    );
    const unknownCall = snapshot.edges.find(
      (edge) => edge.kind === "calls" && edge.referenceName === "unknown"
    );
    const moduleImport = snapshot.edges.find(
      (edge) => edge.kind === "imports" && edge.referenceName === "./math.js"
    );
    expect(moduleImport?.evidence).toEqual({
      ruleId: "module.relative-specifier",
      stage: "module",
      candidateSymbolIds: [mathFile?.id]
    });
    expect(addCall?.evidence).toEqual({
      ruleId: "module.explicit-import-binding",
      stage: "module",
      candidateSymbolIds: [add?.id]
    });
    expect(unknownCall?.evidence).toEqual({
      ruleId: "reference.unresolved",
      stage: "unresolved",
      candidateSymbolIds: []
    });
    expect(snapshot.pendingReferences.map((reference) => reference.referenceName)).toEqual(["unknown"]);
  });

  it("records deterministic evidence for a unique imported-export heuristic", () => {
    const sourceDocuments = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript" as const,
        sourceText: "export function add(left: number, right: number) { return left + right; }",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript" as const,
        sourceText: 'import "./math.js"; export function total() { return add(1, 2); }',
        contentHash: "consumer"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          sourceText: document.sourceText,
          language: document.language
        })
      ),
      indexedAt: "2026-07-29T00:00:00.000Z"
    });
    const add = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/math.ts" && symbol.name === "add"
    );
    const addCall = snapshot.edges.find(
      (edge) => edge.kind === "calls" && edge.referenceName === "add"
    );

    expect(addCall).toMatchObject({
      resolution: "heuristic",
      confidence: 0.8,
      targetId: add?.id
    });
    expect(addCall?.evidence).toEqual({
      ruleId: "heuristic.unique-imported-export",
      stage: "heuristic",
      candidateSymbolIds: [add?.id]
    });
  });

  it("resolves a named import through an explicit export alias", () => {
    const sourceDocuments = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript" as const,
        sourceText: "const add = () => 1; export { add as sum };",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript" as const,
        sourceText: 'import { sum } from "./math.js"; export function total() { return sum(); }',
        contentHash: "consumer"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          sourceText: document.sourceText,
          language: document.language
        })
      ),
      indexedAt: "2026-07-29T00:00:00.000Z"
    });
    const add = snapshot.symbols.find((symbol) => symbol.filePath === "src/math.ts" && symbol.name === "add");

    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "calls",
          referenceName: "sum",
          resolution: "exact",
          confidence: 1,
          targetId: add?.id
        })
      ])
    );
    expect(snapshot.pendingReferences).toEqual([]);
  });

  it("resolves a default import to a named default function declaration", () => {
    const sourceDocuments = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript" as const,
        sourceText:
          "export default function add(left: number, right: number) { return left + right; }",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript" as const,
        sourceText:
          'import sum from "./math.js"; export function total() { return sum(1, 2); }',
        contentHash: "consumer"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          sourceText: document.sourceText,
          language: document.language
        })
      ),
      indexedAt: "2026-07-29T00:00:00.000Z"
    });
    const add = snapshot.symbols.find((symbol) => symbol.filePath === "src/math.ts" && symbol.name === "add");
    const total = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/consumer.ts#total");

    expect(add).toEqual(expect.objectContaining({ isExported: true }));
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "calls",
          sourceId: total?.id,
          referenceName: "sum",
          resolution: "exact",
          confidence: 1,
          targetId: add?.id
        })
      ])
    );
    expect(snapshot.pendingReferences).toEqual([]);
  });

  it("resolves a default import through an existing default export binding", () => {
    const sourceDocuments = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript" as const,
        sourceText: "const add = () => 1; export default add;",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript" as const,
        sourceText:
          'import sum from "./math.js"; export function total() { return sum(); }',
        contentHash: "consumer"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          sourceText: document.sourceText,
          language: document.language
        })
      ),
      indexedAt: "2026-07-29T00:00:00.000Z"
    });
    const add = snapshot.symbols.find((symbol) => symbol.filePath === "src/math.ts" && symbol.name === "add");
    const total = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/consumer.ts#total");

    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "calls",
          sourceId: total?.id,
          referenceName: "sum",
          resolution: "exact",
          confidence: 1,
          targetId: add?.id
        })
      ])
    );
    expect(snapshot.pendingReferences).toEqual([]);
  });

  it("resolves a default import to a direct callable default expression", () => {
    const sourceDocuments = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript" as const,
        sourceText: "export default () => 1;",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript" as const,
        sourceText:
          'import sum from "./math.js"; export function total() { return sum(); }',
        contentHash: "consumer"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          sourceText: document.sourceText,
          language: document.language
        })
      ),
      indexedAt: "2026-07-29T00:00:00.000Z"
    });
    const defaultExport = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/math.ts" && symbol.name === "default"
    );
    const total = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/consumer.ts#total");

    expect(defaultExport).toBeDefined();
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "calls",
          sourceId: total?.id,
          referenceName: "sum",
          resolution: "exact",
          confidence: 1,
          targetId: defaultExport?.id
        })
      ])
    );
    expect(
      snapshot.pendingReferences.filter((reference) => reference.relationKind === "calls")
    ).toEqual([]);
  });

  it("resolves the nearest lexical binding before an imported alias", () => {
    const sourceDocuments = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript" as const,
        sourceText: "const add = () => 1; export { add as sum };",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript" as const,
        sourceText: `
          import { sum } from "./math.js";
          export function shadows() { const sum = () => 2; return sum(); }
          export function consumer() { return sum(); }
          export function parameter(sum: () => number) { return sum(); }
          export function varShadow() { if (true) { var sum = () => 3; } return sum(); }
        `,
        contentHash: "consumer"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          sourceText: document.sourceText,
          language: document.language
        })
      ),
      indexedAt: "2026-07-29T00:00:00.000Z"
    });
    const add = snapshot.symbols.find((symbol) => symbol.filePath === "src/math.ts" && symbol.name === "add");
    const shadows = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/consumer.ts#shadows");
    const localSum = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/consumer.ts#shadows.sum"
    );
    const consumer = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/consumer.ts#consumer");
    const parameter = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/consumer.ts#parameter");
    const varShadow = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/consumer.ts#varShadow");
    const varSum = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/consumer.ts#varShadow.sum"
    );
    const sumCalls = snapshot.edges.filter(
      (edge) => edge.kind === "calls" && edge.referenceName === "sum"
    );

    expect(sumCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: shadows?.id, targetId: localSum?.id, resolution: "exact" }),
        expect.objectContaining({ sourceId: consumer?.id, targetId: add?.id, resolution: "exact" }),
        expect.objectContaining({ sourceId: parameter?.id, targetId: null, resolution: "unresolved" }),
        expect.objectContaining({ sourceId: varShadow?.id, targetId: varSum?.id, resolution: "exact" })
      ])
    );
    expect(snapshot.pendingReferences.map((reference) => reference.id)).toEqual(
      expect.arrayContaining([
        sumCalls.find((edge) => edge.sourceId === parameter?.id)?.id
      ])
    );
  });
});

describe("direct TypeScript heritage resolution", () => {
  it("resolves local, imported, and re-exported direct heritage with namespace proof", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/base.ts",
        relativePath: "src/base.ts",
        language: "typescript",
        sourceText: [
          "export class ImportedBase {}",
          "export interface ImportedContract {}",
          "export type ImportedAlias = { value: string };"
        ].join("\n"),
        contentHash: "base"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText:
          'export { ImportedBase, ImportedContract, ImportedAlias } from "./base";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/type-barrel.ts",
        relativePath: "src/type-barrel.ts",
        language: "typescript",
        sourceText: 'export type { ImportedBase as TypeOnlyBase } from "./base";',
        contentHash: "type-barrel"
      },
      {
        absolutePath: "C:/project/src/local.ts",
        relativePath: "src/local.ts",
        language: "typescript",
        sourceText: [
          "export class LocalBase {}",
          "export interface LocalContract {}",
          "export type LocalAlias = { value: string };",
          "export class LocalDerived extends LocalBase implements LocalContract, LocalAlias {}",
          "export interface LocalChild extends LocalContract {}"
        ].join("\n"),
        contentHash: "local"
      },
      {
        absolutePath: "C:/project/src/imported.ts",
        relativePath: "src/imported.ts",
        language: "typescript",
        sourceText: [
          'import { ImportedBase } from "./base";',
          'import type { ImportedContract, ImportedAlias } from "./base";',
          "export class ImportedDerived extends ImportedBase implements ImportedContract, ImportedAlias {}"
        ].join("\n"),
        contentHash: "imported"
      },
      {
        absolutePath: "C:/project/src/reexported.ts",
        relativePath: "src/reexported.ts",
        language: "typescript",
        sourceText: [
          'import { ImportedBase } from "./barrel";',
          'import type { ImportedContract } from "./barrel";',
          "export class BarrelDerived extends ImportedBase implements ImportedContract {}"
        ].join("\n"),
        contentHash: "reexported"
      },
      {
        absolutePath: "C:/project/src/unproven.ts",
        relativePath: "src/unproven.ts",
        language: "typescript",
        sourceText: [
          'import type { ImportedBase, ImportedContract } from "./base";',
          'import { TypeOnlyBase } from "./type-barrel";',
          "export class TypeOnlyImportDerived extends ImportedBase {}",
          "export class TypeOnlyReexportDerived extends TypeOnlyBase {}",
          "export class GlobalDerived extends LocalBase {}",
          "export interface Shadowed<ImportedContract> extends ImportedContract {}"
        ].join("\n"),
        contentHash: "unproven"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const heritageEdge = (sourceQualifiedName: string, referenceName: string) =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.referenceName === referenceName
      );

    const localBase = symbol("src/local.ts#LocalBase");
    const localContract = symbol("src/local.ts#LocalContract");
    const localAlias = symbol("src/local.ts#LocalAlias");
    const importedBase = symbol("src/base.ts#ImportedBase");
    const importedContract = symbol("src/base.ts#ImportedContract");
    const importedAlias = symbol("src/base.ts#ImportedAlias");

    expect(heritageEdge("src/local.ts#LocalDerived", "LocalBase")).toMatchObject({
      kind: "extends",
      targetId: localBase?.id,
      resolution: "exact",
      evidence: { ruleId: "heritage.extends.local-value-binding", stage: "lexical" }
    });
    expect(heritageEdge("src/local.ts#LocalDerived", "LocalContract")).toMatchObject({
      kind: "implements",
      targetId: localContract?.id,
      resolution: "exact",
      evidence: { ruleId: "heritage.implements.local-type-binding", stage: "lexical" }
    });
    expect(heritageEdge("src/local.ts#LocalDerived", "LocalAlias")).toMatchObject({
      kind: "implements",
      targetId: localAlias?.id,
      resolution: "exact",
      evidence: { ruleId: "heritage.implements.local-type-binding", stage: "lexical" }
    });
    expect(heritageEdge("src/local.ts#LocalChild", "LocalContract")).toMatchObject({
      kind: "extends",
      targetId: localContract?.id,
      resolution: "exact",
      evidence: { ruleId: "heritage.extends.local-type-binding", stage: "lexical" }
    });

    expect(heritageEdge("src/imported.ts#ImportedDerived", "ImportedBase")).toMatchObject({
      kind: "extends",
      targetId: importedBase?.id,
      resolution: "exact",
      evidence: { ruleId: "heritage.extends.imported-target", stage: "module" }
    });
    expect(heritageEdge("src/imported.ts#ImportedDerived", "ImportedContract")).toMatchObject({
      kind: "implements",
      targetId: importedContract?.id,
      resolution: "exact",
      evidence: { ruleId: "heritage.implements.imported-target", stage: "module" }
    });
    expect(heritageEdge("src/imported.ts#ImportedDerived", "ImportedAlias")).toMatchObject({
      kind: "implements",
      targetId: importedAlias?.id,
      resolution: "exact",
      evidence: { ruleId: "heritage.implements.imported-target", stage: "module" }
    });
    expect(heritageEdge("src/reexported.ts#BarrelDerived", "ImportedBase")).toMatchObject({
      kind: "extends",
      targetId: importedBase?.id,
      resolution: "exact",
      evidence: { ruleId: "heritage.extends.reexported-target", stage: "module" }
    });
    expect(heritageEdge("src/reexported.ts#BarrelDerived", "ImportedContract")).toMatchObject({
      kind: "implements",
      targetId: importedContract?.id,
      resolution: "exact",
      evidence: { ruleId: "heritage.implements.reexported-target", stage: "module" }
    });

    for (const [sourceName, referenceName, relationKind] of [
      ["TypeOnlyImportDerived", "ImportedBase", "extends"],
      ["TypeOnlyReexportDerived", "TypeOnlyBase", "extends"],
      ["GlobalDerived", "LocalBase", "extends"],
      ["Shadowed", "ImportedContract", "extends"]
    ] as const) {
      expect(heritageEdge(`src/unproven.ts#${sourceName}`, referenceName)).toMatchObject({
        kind: relationKind,
        targetId: null,
        resolution: "unresolved",
        confidence: 0,
        evidence: { ruleId: `heritage.${relationKind}.unresolved-target`, stage: "unresolved" }
      });
    }
    expect(
      snapshot.pendingReferences
        .filter((reference) => reference.relationKind === "extends" || reference.relationKind === "implements")
        .map((reference) => reference.referenceName)
        .sort()
    ).toEqual(["ImportedBase", "ImportedContract", "LocalBase", "TypeOnlyBase"]);
  });

  it("resolves a direct JavaScript class extends clause through a value import", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/base.js",
        relativePath: "src/base.js",
        language: "javascript",
        sourceText: "export class JavaScriptBase {}",
        contentHash: "js-base"
      },
      {
        absolutePath: "C:/project/src/child.js",
        relativePath: "src/child.js",
        language: "javascript",
        sourceText:
          'import { JavaScriptBase } from "./base.js"; export class JavaScriptChild extends JavaScriptBase {}',
        contentHash: "js-child"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const base = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/base.js#JavaScriptBase");
    const child = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/child.js#JavaScriptChild");
    const edge = snapshot.edges.find(
      (candidate) => candidate.sourceId === child?.id && candidate.kind === "extends"
    );

    expect(edge).toMatchObject({
      targetId: base?.id,
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "heritage.extends.imported-target", stage: "module" }
    });
    expect(snapshot.pendingReferences).toEqual([]);
  });
});

describe("literal route handler resolution", () => {
  it("resolves local, imported, and re-exported route handlers exactly", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/handlers.ts",
        relativePath: "src/handlers.ts",
        language: "typescript",
        sourceText:
          "export function importedHandler() { return 1; } export function reexportedHandler() { return 2; }",
        contentHash: "handlers"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export { reexportedHandler } from "./handlers";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/local-routes.ts",
        relativePath: "src/local-routes.ts",
        language: "typescript",
        sourceText:
          'import express from "express"; const app = express(); function localHandler() { return 3; } app.get("/local", localHandler);',
        contentHash: "local-routes"
      },
      {
        absolutePath: "C:/project/src/imported-routes.ts",
        relativePath: "src/imported-routes.ts",
        language: "typescript",
        sourceText:
          'import express from "express"; import { importedHandler } from "./handlers"; const app = express(); app.post("/imported", importedHandler);',
        contentHash: "imported-routes"
      },
      {
        absolutePath: "C:/project/src/reexported-routes.ts",
        relativePath: "src/reexported-routes.ts",
        language: "typescript",
        sourceText:
          'import express from "express"; import { reexportedHandler } from "./barrel"; const app = express(); app.put("/reexported", reexportedHandler);',
        contentHash: "reexported-routes"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const localHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/local-routes.ts" && symbol.name === "localHandler"
    );
    const importedHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/handlers.ts" && symbol.name === "importedHandler"
    );
    const reexportedHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/handlers.ts" && symbol.name === "reexportedHandler"
    );
    const localRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "localHandler"
    );
    const importedRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "importedHandler"
    );
    const reexportedRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "reexportedHandler"
    );

    expect(localRoute).toMatchObject({
      targetId: localHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.express.literal-route.local-handler",
        stage: "lexical",
        candidateSymbolIds: [localHandler?.id]
      }
    });
    expect(importedRoute).toMatchObject({
      targetId: importedHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.express.literal-route.imported-handler",
        stage: "module",
        candidateSymbolIds: [importedHandler?.id]
      }
    });
    expect(reexportedRoute).toMatchObject({
      targetId: reexportedHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.express.literal-route.reexported-handler",
        stage: "module",
        candidateSymbolIds: [reexportedHandler?.id],
        resolutionPath: ["src/reexported-routes.ts", "src/barrel.ts", "src/handlers.ts"]
      }
    });
    expect(
      snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")
    ).toEqual([]);
  });

  it("resolves Koa router handlers with distinct framework evidence", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/handlers.ts",
        relativePath: "src/handlers.ts",
        language: "typescript",
        sourceText:
          "export function importedHandler() { return 1; } export function reexportedHandler() { return 2; }",
        contentHash: "handlers"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export { reexportedHandler } from "./handlers";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/local-routes.ts",
        relativePath: "src/local-routes.ts",
        language: "typescript",
        sourceText:
          'import Router from "@koa/router"; const router = new Router(); function localHandler() { return 3; } router.get("/local", localHandler);',
        contentHash: "local-routes"
      },
      {
        absolutePath: "C:/project/src/imported-routes.ts",
        relativePath: "src/imported-routes.ts",
        language: "typescript",
        sourceText:
          'import Router from "@koa/router"; import { importedHandler } from "./handlers"; const router = new Router(); router.post("/imported", importedHandler);',
        contentHash: "imported-routes"
      },
      {
        absolutePath: "C:/project/src/reexported-routes.ts",
        relativePath: "src/reexported-routes.ts",
        language: "typescript",
        sourceText:
          'import Router from "@koa/router"; import { reexportedHandler } from "./barrel"; const router = new Router(); router.del("/reexported", reexportedHandler);',
        contentHash: "reexported-routes"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const localHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/local-routes.ts" && symbol.name === "localHandler"
    );
    const importedHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/handlers.ts" && symbol.name === "importedHandler"
    );
    const reexportedHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/handlers.ts" && symbol.name === "reexportedHandler"
    );
    const localRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "localHandler"
    );
    const importedRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "importedHandler"
    );
    const reexportedRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "reexportedHandler"
    );

    expect(localRoute).toMatchObject({
      targetId: localHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.koa.router.literal-route.local-handler",
        stage: "lexical",
        candidateSymbolIds: [localHandler?.id]
      }
    });
    expect(importedRoute).toMatchObject({
      targetId: importedHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.koa.router.literal-route.imported-handler",
        stage: "module",
        candidateSymbolIds: [importedHandler?.id]
      }
    });
    expect(reexportedRoute).toMatchObject({
      targetId: reexportedHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.koa.router.literal-route.reexported-handler",
        stage: "module",
        candidateSymbolIds: [reexportedHandler?.id],
        resolutionPath: ["src/reexported-routes.ts", "src/barrel.ts", "src/handlers.ts"]
      }
    });
    expect(
      snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")
    ).toEqual([]);
  });

  it("resolves Hono application handlers with distinct framework evidence", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/handlers.ts",
        relativePath: "src/handlers.ts",
        language: "typescript",
        sourceText:
          "export function importedHandler() { return 1; } export function reexportedHandler() { return 2; }",
        contentHash: "handlers"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export { reexportedHandler } from "./handlers";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/local-routes.ts",
        relativePath: "src/local-routes.ts",
        language: "typescript",
        sourceText:
          'import { Hono } from "hono"; const app = new Hono(); function localHandler() { return 3; } app.get("/local", localHandler);',
        contentHash: "local-routes"
      },
      {
        absolutePath: "C:/project/src/imported-routes.ts",
        relativePath: "src/imported-routes.ts",
        language: "typescript",
        sourceText:
          'import { Hono } from "hono"; import { importedHandler } from "./handlers"; const app = new Hono(); app.post("/imported", importedHandler);',
        contentHash: "imported-routes"
      },
      {
        absolutePath: "C:/project/src/reexported-routes.ts",
        relativePath: "src/reexported-routes.ts",
        language: "typescript",
        sourceText:
          'import { Hono } from "hono"; import { reexportedHandler } from "./barrel"; const app = new Hono(); app.delete("/reexported", reexportedHandler);',
        contentHash: "reexported-routes"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const localHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/local-routes.ts" && symbol.name === "localHandler"
    );
    const importedHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/handlers.ts" && symbol.name === "importedHandler"
    );
    const reexportedHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/handlers.ts" && symbol.name === "reexportedHandler"
    );
    const localRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "localHandler"
    );
    const importedRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "importedHandler"
    );
    const reexportedRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "reexportedHandler"
    );

    expect(localRoute).toMatchObject({
      targetId: localHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.hono.app.literal-route.local-handler",
        stage: "lexical",
        candidateSymbolIds: [localHandler?.id]
      }
    });
    expect(importedRoute).toMatchObject({
      targetId: importedHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.hono.app.literal-route.imported-handler",
        stage: "module",
        candidateSymbolIds: [importedHandler?.id]
      }
    });
    expect(reexportedRoute).toMatchObject({
      targetId: reexportedHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.hono.app.literal-route.reexported-handler",
        stage: "module",
        candidateSymbolIds: [reexportedHandler?.id],
        resolutionPath: ["src/reexported-routes.ts", "src/barrel.ts", "src/handlers.ts"]
      }
    });
    expect(
      snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")
    ).toEqual([]);
  });

  it("resolves Elysia application handlers with distinct framework evidence", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/handlers.ts",
        relativePath: "src/handlers.ts",
        language: "typescript",
        sourceText:
          "export function importedHandler() { return 1; } export function reexportedHandler() { return 2; }",
        contentHash: "handlers"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export { reexportedHandler } from "./handlers";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/local-routes.ts",
        relativePath: "src/local-routes.ts",
        language: "typescript",
        sourceText:
          'import { Elysia } from "elysia"; const app = new Elysia(); function localHandler() { return 3; } app.get("/local", localHandler);',
        contentHash: "local-routes"
      },
      {
        absolutePath: "C:/project/src/imported-routes.ts",
        relativePath: "src/imported-routes.ts",
        language: "typescript",
        sourceText:
          'import { Elysia } from "elysia"; import { importedHandler } from "./handlers"; const app = new Elysia(); app.post("/imported", importedHandler);',
        contentHash: "imported-routes"
      },
      {
        absolutePath: "C:/project/src/reexported-routes.ts",
        relativePath: "src/reexported-routes.ts",
        language: "typescript",
        sourceText:
          'import { Elysia } from "elysia"; import { reexportedHandler } from "./barrel"; const app = new Elysia(); app.delete("/reexported", reexportedHandler);',
        contentHash: "reexported-routes"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const localHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/local-routes.ts" && symbol.name === "localHandler"
    );
    const importedHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/handlers.ts" && symbol.name === "importedHandler"
    );
    const reexportedHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/handlers.ts" && symbol.name === "reexportedHandler"
    );
    const localRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "localHandler"
    );
    const importedRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "importedHandler"
    );
    const reexportedRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "reexportedHandler"
    );

    expect(localRoute).toMatchObject({
      targetId: localHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.elysia.app.literal-route.local-handler",
        stage: "lexical",
        candidateSymbolIds: [localHandler?.id]
      }
    });
    expect(importedRoute).toMatchObject({
      targetId: importedHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.elysia.app.literal-route.imported-handler",
        stage: "module",
        candidateSymbolIds: [importedHandler?.id]
      }
    });
    expect(reexportedRoute).toMatchObject({
      targetId: reexportedHandler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.elysia.app.literal-route.reexported-handler",
        stage: "module",
        candidateSymbolIds: [reexportedHandler?.id],
        resolutionPath: ["src/reexported-routes.ts", "src/barrel.ts", "src/handlers.ts"]
      }
    });
    expect(
      snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")
    ).toEqual([]);
  });

  it("does not resolve a Fastify runtime handler through a type-only import", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/contracts.ts",
        relativePath: "src/contracts.ts",
        language: "typescript",
        sourceText: "export type Handler = () => void;",
        contentHash: "contracts"
      },
      {
        absolutePath: "C:/project/src/routes.ts",
        relativePath: "src/routes.ts",
        language: "typescript",
        sourceText: [
          'import Fastify from "fastify";',
          'import type { Handler } from "./contracts";',
          "const app = Fastify();",
          'app.get("/type-only", Handler);'
        ].join("\n"),
        contentHash: "routes"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const route = snapshot.edges.find((edge) => edge.kind === "routes");

    expect(route).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.fastify.static-route.unresolved-handler",
        stage: "unresolved"
      }
    });
    expect(snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([
      expect.objectContaining({
        relationKind: "routes",
        referenceName: "Handler",
        routeFramework: "fastify"
      })
    ]);
  });

  it("preserves FastAPI pending-route provenance without falling back to Express evidence", () => {
    const sourceDocument: SourceDocument = {
      absolutePath: "C:/project/src/routes.ts",
      relativePath: "src/routes.ts",
      language: "typescript",
      sourceText: [
        'import express from "express";',
        "const app = express();",
        "function health() { return 1; }",
        'app.get("/health", health);'
      ].join("\n"),
      contentHash: "routes"
    };
    const extracted = extractFileFacts({
      filePath: sourceDocument.relativePath,
      sourceText: sourceDocument.sourceText,
      language: sourceDocument.language
    });
    const snapshot = resolveProjectFacts({
      sourceDocuments: [sourceDocument],
      extractedFiles: [{
        ...extracted,
        pendingReferences: extracted.pendingReferences.map((reference) =>
          reference.relationKind === "routes"
            ? { ...reference, routeFramework: "fastapi" as const }
            : reference
        )
      }],
      indexedAt: "2026-07-30T00:00:00.000Z"
    });

    expect(snapshot.edges.find((edge) => edge.kind === "routes")).toMatchObject({
      resolution: "exact",
      evidence: {
        ruleId: "framework.fastapi.direct-app.decorator.local-handler",
        stage: "lexical"
      }
    });
  });

  it("resolves React Router JSX page components with distinct navigation evidence", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/pages.tsx",
        relativePath: "src/pages.tsx",
        language: "typescript",
        sourceText: [
          "export function SettingsPage() { return <main>Settings</main>; }",
          "export function AccountPage() { return <main>Account</main>; }"
        ].join("\n"),
        contentHash: "pages"
      },
      {
        absolutePath: "C:/project/src/pages-barrel.ts",
        relativePath: "src/pages-barrel.ts",
        language: "typescript",
        sourceText: 'export { AccountPage as PublicAccountPage } from "./pages.js";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/app-routes.tsx",
        relativePath: "src/app-routes.tsx",
        language: "typescript",
        sourceText: [
          'import { Route as AppRoute } from "react-router-dom";',
          'import { SettingsPage } from "./pages.js";',
          'import { PublicAccountPage } from "./pages-barrel.js";',
          "export function AppRoutes() {",
          "  return <>",
          '    <AppRoute path="/settings">',
          '      <AppRoute index element={<SettingsPage />} />',
          '      <AppRoute path="account" Component={PublicAccountPage} />',
          "    </AppRoute>",
          "  </>;",
          "}"
        ].join("\n"),
        contentHash: "routes"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const page = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/pages.tsx" && symbol.name === "SettingsPage"
    );
    const accountPage = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/pages.tsx" && symbol.name === "AccountPage"
    );
    const route = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "NAVIGATE /settings"
    );
    const accountRoute = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "NAVIGATE /settings/account"
    );
    const edge = snapshot.edges.find(
      (candidate) => candidate.kind === "routes" && candidate.sourceId === route?.id
    );
    const accountEdge = snapshot.edges.find(
      (candidate) => candidate.kind === "routes" && candidate.sourceId === accountRoute?.id
    );

    expect(edge).toMatchObject({
      targetId: page?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.react-router.jsx-route.imported-handler",
        stage: "module",
        candidateSymbolIds: [page?.id]
      }
    });
    expect(accountEdge).toMatchObject({
      targetId: accountPage?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.react-router.jsx-route.reexported-handler",
        stage: "module",
        candidateSymbolIds: [accountPage?.id],
        resolutionPath: ["src/app-routes.tsx", "src/pages-barrel.ts", "src/pages.tsx"]
      }
    });
    expect(snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("resolves React Router createRoutesFromElements page components with distinct navigation evidence", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/pages.tsx",
        relativePath: "src/pages.tsx",
        language: "typescript",
        sourceText: "export function SettingsPage() { return <main>Settings</main>; }",
        contentHash: "pages"
      },
      {
        absolutePath: "C:/project/src/route-config.tsx",
        relativePath: "src/route-config.tsx",
        language: "typescript",
        sourceText: [
          'import { createRoutesFromElements as makeRoutes, Route } from "react-router-dom";',
          'import { SettingsPage } from "./pages.js";',
          'export const routes = makeRoutes(<Route path="/settings" Component={SettingsPage} />);'
        ].join("\n"),
        contentHash: "routes"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const page = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/pages.tsx" && symbol.name === "SettingsPage"
    );
    const route = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "NAVIGATE /settings"
    );
    const edge = snapshot.edges.find(
      (candidate) => candidate.kind === "routes" && candidate.sourceId === route?.id
    );

    expect(edge).toMatchObject({
      targetId: page?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.react-router.create-routes-from-elements.imported-handler",
        stage: "module",
        candidateSymbolIds: [page?.id]
      }
    });
    expect(snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("resolves React Router data-router page components with distinct navigation evidence", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/pages.tsx",
        relativePath: "src/pages.tsx",
        language: "typescript",
        sourceText: [
          "export function SettingsPage() { return <main>Settings</main>; }",
          "export function AccountPage() { return <main>Account</main>; }"
        ].join("\n"),
        contentHash: "pages"
      },
      {
        absolutePath: "C:/project/src/pages-barrel.ts",
        relativePath: "src/pages-barrel.ts",
        language: "typescript",
        sourceText: 'export { AccountPage as PublicAccountPage } from "./pages.js";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/data-routes.tsx",
        relativePath: "src/data-routes.tsx",
        language: "typescript",
        sourceText: [
          'import { createBrowserRouter as makeRouter } from "react-router-dom";',
          'import { SettingsPage } from "./pages.js";',
          'import { PublicAccountPage } from "./pages-barrel.js";',
          "export const router = makeRouter([",
          '  { path: "/settings", children: [',
          '    { index: true, Component: SettingsPage },',
          '    { path: "account", element: <PublicAccountPage /> }',
          "  ] }",
          "]);"
        ].join("\n"),
        contentHash: "routes"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const page = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/pages.tsx" && symbol.name === "SettingsPage"
    );
    const accountPage = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/pages.tsx" && symbol.name === "AccountPage"
    );
    const route = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "NAVIGATE /settings"
    );
    const accountRoute = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "NAVIGATE /settings/account"
    );
    const edge = snapshot.edges.find(
      (candidate) => candidate.kind === "routes" && candidate.sourceId === route?.id
    );
    const accountEdge = snapshot.edges.find(
      (candidate) => candidate.kind === "routes" && candidate.sourceId === accountRoute?.id
    );

    expect(edge).toMatchObject({
      targetId: page?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.react-router.data-router.imported-handler",
        stage: "module",
        candidateSymbolIds: [page?.id]
      }
    });
    expect(accountEdge).toMatchObject({
      targetId: accountPage?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.react-router.data-router.reexported-handler",
        stage: "module",
        candidateSymbolIds: [accountPage?.id],
        resolutionPath: ["src/data-routes.tsx", "src/pages-barrel.ts", "src/pages.tsx"]
      }
    });
    expect(snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("resolves Next.js App Router default page exports with distinct navigation evidence", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/components/pricing-page.tsx",
        relativePath: "src/components/pricing-page.tsx",
        language: "typescript",
        sourceText: "export function PricingPage() { return <main>Pricing</main>; }",
        contentHash: "page"
      },
      {
        absolutePath: "C:/project/src/app/pricing/page.tsx",
        relativePath: "src/app/pricing/page.tsx",
        language: "typescript",
        sourceText: [
          'import { PricingPage } from "../../components/pricing-page.js";',
          "export default PricingPage;"
        ].join("\n"),
        contentHash: "route"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const page = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/components/pricing-page.tsx" && symbol.name === "PricingPage"
    );
    const route = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "NAVIGATE /pricing"
    );
    const edge = snapshot.edges.find(
      (candidate) => candidate.kind === "routes" && candidate.sourceId === route?.id
    );

    expect(edge).toMatchObject({
      targetId: page?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.nextjs.app-router.imported-handler",
        stage: "module",
        candidateSymbolIds: [page?.id]
      }
    });
    expect(snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("resolves Next.js Pages Router re-exported page handlers with distinct navigation evidence", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/components/pages.tsx",
        relativePath: "src/components/pages.tsx",
        language: "typescript",
        sourceText: "export function BillingPage() { return <main>Billing</main>; }",
        contentHash: "page"
      },
      {
        absolutePath: "C:/project/src/components/public-pages.ts",
        relativePath: "src/components/public-pages.ts",
        language: "typescript",
        sourceText: 'export { BillingPage as PublicBillingPage } from "./pages.js";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/pages/billing.tsx",
        relativePath: "src/pages/billing.tsx",
        language: "typescript",
        sourceText: [
          'import { PublicBillingPage } from "../components/public-pages.js";',
          "export default PublicBillingPage;"
        ].join("\n"),
        contentHash: "route"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const page = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/components/pages.tsx" && symbol.name === "BillingPage"
    );
    const route = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "NAVIGATE /billing"
    );
    const edge = snapshot.edges.find(
      (candidate) => candidate.kind === "routes" && candidate.sourceId === route?.id
    );

    expect(edge).toMatchObject({
      targetId: page?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.nextjs.pages-router.reexported-handler",
        stage: "module",
        candidateSymbolIds: [page?.id],
        resolutionPath: [
          "src/pages/billing.tsx",
          "src/components/public-pages.ts",
          "src/components/pages.tsx"
        ]
      }
    });
    expect(snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("resolves direct inline Fastify plugin-prefix handlers with distinct evidence", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/routes.ts",
        relativePath: "src/routes.ts",
        language: "typescript",
        sourceText: [
          'import Fastify from "fastify";',
          "function listUsers() { return []; }",
          "const app = Fastify();",
          "app.register(async (api) => {",
          '  api.get("/users", listUsers);',
          '}, { prefix: "/api" });'
        ].join("\n"),
        contentHash: "routes"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const route = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "GET /api/users"
    );
    const edge = snapshot.edges.find((candidate) => candidate.kind === "routes" && candidate.sourceId === route?.id);

    expect(route).toMatchObject({ name: "GET /api/users", kind: "route" });
    expect(edge).toMatchObject({
      targetId: expect.any(String),
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.fastify.inline-plugin-prefix.local-handler",
        stage: "lexical"
      }
    });
    expect(snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("resolves same-file named Fastify plugin-prefix handlers with distinct evidence", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/routes.ts",
        relativePath: "src/routes.ts",
        language: "typescript",
        sourceText: [
          'import Fastify from "fastify";',
          "function listUsers() { return []; }",
          "async function api(server: unknown) {",
          '  server.get("/users", listUsers);',
          "}",
          "const app = Fastify();",
          'app.register(api, { prefix: "/api" });'
        ].join("\n"),
        contentHash: "routes"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const route = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "GET /api/users"
    );
    const edge = snapshot.edges.find((candidate) => candidate.kind === "routes" && candidate.sourceId === route?.id);

    expect(route).toMatchObject({ name: "GET /api/users", kind: "route" });
    expect(edge).toMatchObject({
      targetId: expect.any(String),
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.fastify.local-plugin-prefix.local-handler",
        stage: "lexical"
      }
    });
    expect(snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("projects imported and re-exported Fastify plugin routes through nested prefixes", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/handlers.ts",
        relativePath: "src/handlers.ts",
        language: "typescript",
        sourceText: [
          "export function listUsers() { return []; }",
          "export function createJob() { return undefined; }"
        ].join("\n"),
        contentHash: "handlers"
      },
      {
        absolutePath: "C:/project/src/jobs.ts",
        relativePath: "src/jobs.ts",
        language: "typescript",
        sourceText: [
          'import { createJob } from "./handlers.js";',
          "export const jobsPlugin = async (server: unknown) => {",
          '  server.route({ method: ["POST", "TRACE"], url: "/jobs", handler: createJob });',
          "};"
        ].join("\n"),
        contentHash: "jobs"
      },
      {
        absolutePath: "C:/project/src/jobs-barrel.ts",
        relativePath: "src/jobs-barrel.ts",
        language: "typescript",
        sourceText: 'export { jobsPlugin } from "./jobs.js";',
        contentHash: "jobs-barrel"
      },
      {
        absolutePath: "C:/project/src/api.ts",
        relativePath: "src/api.ts",
        language: "typescript",
        sourceText: [
          'import { listUsers } from "./handlers.js";',
          'import { jobsPlugin } from "./jobs-barrel.js";',
          "export async function api(server: unknown) {",
          '  server.get("/users", listUsers);',
          '  server.register(jobsPlugin, { prefix: "/v1" });',
          "}"
        ].join("\n"),
        contentHash: "api"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export { api as publicApi } from "./api.js";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/main.ts",
        relativePath: "src/main.ts",
        language: "typescript",
        sourceText: [
          'import Fastify from "fastify";',
          'import { publicApi } from "./barrel.js";',
          "const app = Fastify();",
          'app.register(publicApi, { prefix: "/api" });'
        ].join("\n"),
        contentHash: "main"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const listUsers = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/handlers.ts#listUsers"
    );
    const createJob = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/handlers.ts#createJob"
    );
    const usersRoute = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "GET /api/users"
    );
    const postJobsRoute = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "POST /api/v1/jobs"
    );
    const traceJobsRoute = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "TRACE /api/v1/jobs"
    );

    expect(usersRoute).toMatchObject({ filePath: "src/api.ts", kind: "route" });
    expect(postJobsRoute).toMatchObject({ filePath: "src/jobs.ts", kind: "route" });
    expect(traceJobsRoute).toMatchObject({ filePath: "src/jobs.ts", kind: "route" });
    expect(snapshot.edges.find((edge) => edge.kind === "routes" && edge.sourceId === usersRoute?.id)).toMatchObject({
      targetId: listUsers?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.fastify.imported-plugin-prefix.imported-handler",
        stage: "module"
      }
    });
    for (const route of [postJobsRoute, traceJobsRoute]) {
      expect(snapshot.edges.find((edge) => edge.kind === "routes" && edge.sourceId === route?.id)).toMatchObject({
        targetId: createJob?.id,
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: "framework.fastify.imported-plugin-prefix.imported-handler",
          stage: "module"
        }
      });
    }
    expect(snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("stops Fastify imported-plugin projection at a recursive plugin boundary", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/a.ts",
        relativePath: "src/a.ts",
        language: "typescript",
        sourceText: [
          'import { b } from "./b.js";',
          "function handleA() { return undefined; }",
          "export function a(server: unknown) {",
          '  server.get("/a", handleA);',
          '  server.register(b, { prefix: "/b" });',
          "}"
        ].join("\n"),
        contentHash: "a"
      },
      {
        absolutePath: "C:/project/src/b.ts",
        relativePath: "src/b.ts",
        language: "typescript",
        sourceText: [
          'import { a } from "./a.js";',
          "function handleB() { return undefined; }",
          "export function b(server: unknown) {",
          '  server.get("/b", handleB);',
          '  server.register(a, { prefix: "/a" });',
          "}"
        ].join("\n"),
        contentHash: "b"
      },
      {
        absolutePath: "C:/project/src/main.ts",
        relativePath: "src/main.ts",
        language: "typescript",
        sourceText: [
          'import Fastify from "fastify";',
          'import { a } from "./a.js";',
          "const app = Fastify();",
          'app.register(a, { prefix: "/root" });'
        ].join("\n"),
        contentHash: "main"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const routes = snapshot.symbols
      .filter((symbol) => symbol.kind === "route")
      .map((symbol) => symbol.name)
      .sort();

    expect(routes).toEqual(["GET /root/a", "GET /root/b/b"]);
    expect(snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("preserves AST-proven NestJS controller routes as direct exact method edges", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/cats.controller.ts",
        relativePath: "src/cats.controller.ts",
        language: "typescript",
        sourceText: [
          'import { Controller, Get, Post } from "@nestjs/common";',
          "@Controller(\"cats\")",
          "export class CatsController {",
          "  @Get()",
          "  findAll() { return []; }",
          "  @Post(\"bulk\")",
          "  createBulk() { return []; }",
          "}"
        ].join("\n"),
        contentHash: "cats"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const findAll = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/cats.controller.ts#CatsController.findAll"
    );
    const createBulk = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/cats.controller.ts#CatsController.createBulk"
    );
    const getRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "findAll"
    );
    const postRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "createBulk"
    );

    expect(getRoute).toMatchObject({
      targetId: findAll?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.nestjs.decorator-route.local-method",
        stage: "syntax",
        candidateSymbolIds: [findAll?.id]
      }
    });
    expect(postRoute).toMatchObject({
      targetId: createBulk?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.nestjs.decorator-route.local-method",
        stage: "syntax",
        candidateSymbolIds: [createBulk?.id]
      }
    });
    expect(snapshot.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([]);
  });

  it("projects Nest RouterModule child prefixes through exact module and re-export bindings", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/cats.controller.ts",
        relativePath: "src/cats.controller.ts",
        language: "typescript",
        sourceText: [
          'import { Controller, Get } from "@nestjs/common";',
          '@Controller("cats")',
          "export class CatsController {",
          '  @Get(":id") findOne() { return "cat"; }',
          "}"
        ].join("\n"),
        contentHash: "cats-controller"
      },
      {
        absolutePath: "C:/project/src/controllers.ts",
        relativePath: "src/controllers.ts",
        language: "typescript",
        sourceText: 'export { CatsController } from "./cats.controller";',
        contentHash: "controllers-barrel"
      },
      {
        absolutePath: "C:/project/src/cats.module.ts",
        relativePath: "src/cats.module.ts",
        language: "typescript",
        sourceText: [
          'import { Module } from "@nestjs/common";',
          'import { CatsController } from "./controllers";',
          "@Module({ controllers: [CatsController] })",
          "export class CatsModule {}"
        ].join("\n"),
        contentHash: "cats-module"
      },
      {
        absolutePath: "C:/project/src/admin.module.ts",
        relativePath: "src/admin.module.ts",
        language: "typescript",
        sourceText: [
          'import { Module } from "@nestjs/common";',
          "@Module({})",
          "export class AdminModule {}"
        ].join("\n"),
        contentHash: "admin-module"
      },
      {
        absolutePath: "C:/project/src/app.module.ts",
        relativePath: "src/app.module.ts",
        language: "typescript",
        sourceText: [
          'import { Module as NestModule } from "@nestjs/common";',
          'import { RouterModule as NestRouter } from "@nestjs/core";',
          'import { AdminModule } from "./admin.module";',
          'import { CatsModule } from "./cats.module";',
          "@NestModule({",
          "  imports: [",
          "    NestRouter.register([",
          "      { path: \"admin\", module: AdminModule, children: [{ path: \"catalog\", module: CatsModule }] }",
          "    ])",
          "  ]",
          "})",
          "export class AppModule {}"
        ].join("\n"),
        contentHash: "app-module"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const handler = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/cats.controller.ts#CatsController.findOne"
    );
    const controller = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/cats.controller.ts#CatsController"
    );
    const catsModule = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/cats.module.ts#CatsModule"
    );
    const projectedRoute = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.name === "GET /admin/catalog/cats/:id"
    );
    const routeEdge = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.sourceId === projectedRoute?.id
    );

    expect(snapshot.symbols.filter((symbol) => symbol.kind === "route").map((route) => route.name)).toEqual([
      "GET /admin/catalog/cats/:id"
    ]);
    expect(routeEdge).toMatchObject({
      targetId: handler?.id,
      resolution: "exact",
      confidence: 1,
      evidence: {
        ruleId: "framework.nestjs.router-module.exact-prefix",
        stage: "module",
        candidateSymbolIds: [handler?.id, controller?.id, catsModule?.id]
          .filter((id): id is string => id !== undefined)
          .sort()
      }
    });
  });

  it("keeps the controller-local Nest route when its RouterModule path is not statically proven", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/cats.controller.ts",
        relativePath: "src/cats.controller.ts",
        language: "typescript",
        sourceText: [
          'import { Controller, Get } from "@nestjs/common";',
          '@Controller("cats")',
          "export class CatsController { @Get() findAll() {} }"
        ].join("\n"),
        contentHash: "cats-controller"
      },
      {
        absolutePath: "C:/project/src/cats.module.ts",
        relativePath: "src/cats.module.ts",
        language: "typescript",
        sourceText: [
          'import { Module } from "@nestjs/common";',
          'import { CatsController } from "./cats.controller";',
          "@Module({ controllers: [CatsController] })",
          "export class CatsModule {}"
        ].join("\n"),
        contentHash: "cats-module"
      },
      {
        absolutePath: "C:/project/src/app.module.ts",
        relativePath: "src/app.module.ts",
        language: "typescript",
        sourceText: [
          'import { Module } from "@nestjs/common";',
          'import { RouterModule } from "@nestjs/core";',
          'import { CatsModule } from "./cats.module";',
          'const prefix = "admin";',
          "@Module({ imports: [RouterModule.register([{ path: prefix, module: CatsModule }])] })",
          "export class AppModule {}"
        ].join("\n"),
        contentHash: "app-module"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const route = snapshot.symbols.find((symbol) => symbol.kind === "route");
    const routeEdge = snapshot.edges.find((edge) => edge.kind === "routes");

    expect(route).toMatchObject({ name: "GET /cats" });
    expect(routeEdge?.evidence).toMatchObject({
      ruleId: "framework.nestjs.decorator-route.local-method",
      stage: "syntax"
    });
  });

  it("keeps colliding Express route edges and unresolved handler references attached to their projected route symbols", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/mixed.ts",
        relativePath: "src/mixed.ts",
        language: "typescript",
        sourceText: [
          'import express from "express";',
          'import { Controller, Get, Module, Post } from "@nestjs/common";',
          'import { RouterModule } from "@nestjs/core";',
          "const app = express();",
          "function expressHandler() {}",
          '@Controller("cats")',
          "class CatsController {",
          "  @Get() findAll() {}",
          "  @Post() create() {}",
          "}",
          "@Module({ controllers: [CatsController] })",
          "class CatsModule {}",
          "@Module({ imports: [RouterModule.register([{ path: \"admin\", module: CatsModule }])] })",
          "class AppModule {}",
          'app.get("/admin/cats", expressHandler);',
          'app.post("/admin/cats", missingHandler);'
        ].join("\n"),
        contentHash: "mixed"
      }
    ];

    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const expressHandler = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/mixed.ts#expressHandler"
    );
    const expressGetRoute = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.range.start.line === 15
    );
    const expressPostRoute = snapshot.symbols.find(
      (symbol) => symbol.kind === "route" && symbol.range.start.line === 16
    );
    const expressGetEdge = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.targetId === expressHandler?.id
    );
    const missingPostEdge = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "missingHandler"
    );
    const missingPostReference = snapshot.pendingReferences.find(
      (reference) => reference.referenceName === "missingHandler"
    );

    expect(expressGetEdge).toMatchObject({
      sourceId: expressGetRoute?.id,
      resolution: "exact",
      evidence: { ruleId: "framework.express.literal-route.local-handler", stage: "lexical" }
    });
    expect(missingPostEdge).toMatchObject({
      sourceId: expressPostRoute?.id,
      targetId: null,
      resolution: "unresolved"
    });
    expect(missingPostReference).toMatchObject({ sourceId: expressPostRoute?.id });
  });

  it("keeps ambiguous and unproven route handlers unresolved without changing ordinary call heuristics", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/left.ts",
        relativePath: "src/left.ts",
        language: "typescript",
        sourceText: "export function handler() { return 1; }",
        contentHash: "left"
      },
      {
        absolutePath: "C:/project/src/right.ts",
        relativePath: "src/right.ts",
        language: "typescript",
        sourceText: "export function handler() { return 2; }",
        contentHash: "right"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export * from "./left"; export * from "./right";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/unrelated.ts",
        relativePath: "src/unrelated.ts",
        language: "typescript",
        sourceText: "export function orphan() { return 3; }",
        contentHash: "unrelated"
      },
      {
        absolutePath: "C:/project/src/routes.ts",
        relativePath: "src/routes.ts",
        language: "typescript",
        sourceText:
          'import express from "express"; import { handler } from "./barrel"; import "./unrelated"; const app = express(); app.get("/ambiguous", handler); app.post("/unproven", orphan); export const ordinary = orphan();',
        contentHash: "routes"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const leftHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/left.ts" && symbol.name === "handler"
    );
    const rightHandler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/right.ts" && symbol.name === "handler"
    );
    const orphan = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/unrelated.ts" && symbol.name === "orphan"
    );
    const ambiguousRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "handler"
    );
    const unprovenRoute = snapshot.edges.find(
      (edge) => edge.kind === "routes" && edge.referenceName === "orphan"
    );
    const ordinaryCall = snapshot.edges.find(
      (edge) => edge.kind === "calls" && edge.referenceName === "orphan"
    );

    expect(ambiguousRoute).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: {
        ruleId: "framework.express.literal-route.unresolved-handler",
        stage: "unresolved",
        candidateSymbolIds: [leftHandler?.id, rightHandler?.id]
      }
    });
    expect(unprovenRoute).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({
        ruleId: "framework.express.literal-route.unresolved-handler",
        stage: "unresolved",
        candidateSymbolIds: expect.arrayContaining([orphan?.id])
      })
    });
    expect(ordinaryCall).toMatchObject({
      targetId: orphan?.id,
      resolution: "heuristic",
      confidence: 0.8,
      evidence: {
        ruleId: "heuristic.unique-imported-export",
        stage: "heuristic",
        candidateSymbolIds: [orphan?.id]
      }
    });
    expect(
      snapshot.pendingReferences
        .filter((reference) => reference.relationKind === "routes")
        .map((reference) => reference.referenceName)
        .sort()
    ).toEqual(["handler", "orphan"]);
  });
});

describe("TypeScript configuration module resolution", () => {
  it("resolves exact and wildcard paths aliases with deterministic import and call evidence", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: {
            "@math": ["src/math.ts"],
            "@lib/*": ["src/lib/*"]
          }
        }
      }),
      "src/math.ts": "export function calculate(value: number) { return value + 1; }",
      "src/lib/double.ts": "export function double(value: number) { return value * 2; }",
      "src/consumer.ts": `
        import { calculate } from "@math";
        import { double } from "@lib/double";
        export function total() { return calculate(double(2)); }
      `
    });
    const configuredResolver = createTypeScriptProjectModuleResolver(project);

    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "@math")).toEqual({
      targetFilePath: "src/math.ts",
      strategy: "tsconfig-paths",
      configurationPaths: ["tsconfig.json"]
    });
    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "@lib/double")).toEqual({
      targetFilePath: "src/lib/double.ts",
      strategy: "tsconfig-paths",
      configurationPaths: ["tsconfig.json"]
    });

    const firstSnapshot = snapshotWithResolver(
      project.sourceDocuments,
      configuredResolver.moduleResolver
    );
    const secondSnapshot = snapshotWithResolver(
      project.sourceDocuments,
      configuredResolver.moduleResolver
    );
    const calculate = firstSnapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/math.ts#calculate"
    );
    const importEdge = firstSnapshot.edges.find(
      (edge) => edge.kind === "imports" && edge.referenceName === "@math"
    );
    const callEdge = firstSnapshot.edges.find(
      (edge) => edge.kind === "calls" && edge.referenceName === "calculate"
    );

    expect(importEdge).toMatchObject({ resolution: "exact" });
    expect(importEdge?.evidence).toEqual({
      ruleId: "module.tsconfig-paths",
      stage: "module",
      candidateSymbolIds: [firstSnapshot.symbols.find((symbol) => symbol.filePath === "src/math.ts" && symbol.kind === "file")?.id],
      configurationPaths: ["tsconfig.json"]
    });
    expect(callEdge).toMatchObject({ targetId: calculate?.id, resolution: "exact", confidence: 1 });
    expect(callEdge?.evidence).toEqual({
      ruleId: "module.explicit-import-binding",
      stage: "module",
      candidateSymbolIds: [calculate?.id],
      configurationPaths: ["tsconfig.json"]
    });
    expect(secondSnapshot.edges).toEqual(firstSnapshot.edges);
  });

  it("proves baseUrl resolution separately from paths mapping", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: "./src"
        }
      }),
      "src/math.ts": "export function increment(value: number) { return value + 1; }",
      "src/consumer.ts": 'import { increment } from "math"; export const value = increment(1);'
    });
    const configuredResolver = createTypeScriptProjectModuleResolver(project);

    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "math")).toEqual({
      targetFilePath: "src/math.ts",
      strategy: "tsconfig-base-url",
      configurationPaths: ["tsconfig.json"]
    });
  });

  it("does not claim paths evidence when baseUrl independently produces a matching paths target", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: "./src",
          paths: { math: ["math"] }
        }
      }),
      "src/math.ts": "export function increment(value: number) { return value + 1; }",
      "src/consumer.ts": 'import { increment } from "math"; export const value = increment(1);'
    });
    const configuredResolver = createTypeScriptProjectModuleResolver(project);

    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "math")).toEqual({
      targetFilePath: "src/math.ts",
      strategy: "tsconfig-base-url",
      configurationPaths: ["tsconfig.json"]
    });
  });

  it("uses a project-local extends chain and reports it in alias evidence", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        extends: "./config/base.json",
        compilerOptions: { module: "ESNext", moduleResolution: "Bundler" }
      }),
      "config/base.json": JSON.stringify({
        compilerOptions: {
          baseUrl: "..",
          paths: { "@shared/*": ["src/shared/*"] }
        }
      }),
      "src/shared/math.ts": "export function add(left: number, right: number) { return left + right; }",
      "src/consumer.ts": 'import { add } from "@shared/math"; export const value = add(1, 2);'
    });
    const configuredResolver = createTypeScriptProjectModuleResolver(project);

    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "@shared/math")).toEqual({
      targetFilePath: "src/shared/math.ts",
      strategy: "tsconfig-paths",
      configurationPaths: ["tsconfig.json", "config/base.json"]
    });
    expect(configuredResolver.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "tsconfig", path: "tsconfig.json", state: "present" }),
        expect.objectContaining({ kind: "extends", path: "config/base.json", state: "present" })
      ])
    );
  });

  it("does not turn an alias target excluded from the scan into a graph edge", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@private/*": ["src/private/*"] }
        }
      }),
      "src/private/secret.ts": "export function secret() { return 42; }",
      "src/consumer.ts": 'import { secret } from "@private/secret"; export const value = secret();'
    });
    const sourceDocuments = project.sourceDocuments.filter(
      (document) => document.relativePath !== "src/private/secret.ts"
    );
    const configuredResolver = createTypeScriptProjectModuleResolver({
      projectPath: project.projectPath,
      sourceDocuments
    });
    const snapshot = snapshotWithResolver(sourceDocuments, configuredResolver.moduleResolver);
    const importEdge = snapshot.edges.find(
      (edge) => edge.kind === "imports" && edge.referenceName === "@private/secret"
    );

    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "@private/secret")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["tsconfig.json"]
    });
    expect(importEdge?.evidence).toEqual({
      ruleId: "module.unresolved-specifier",
      stage: "unresolved",
      candidateSymbolIds: [],
      configurationPaths: ["tsconfig.json"]
    });
    expect(snapshot.pendingReferences.map((reference) => reference.referenceName)).toContain("@private/secret");
  });

  it("prefers tsconfig and does not persist an ignored jsconfig as an input", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@selected": ["src/from-tsconfig.ts"] }
        }
      }),
      "jsconfig.json": JSON.stringify({
        compilerOptions: {
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@selected": ["src/from-jsconfig.ts"] }
        }
      }),
      "src/from-tsconfig.ts": "export const value = 1;",
      "src/from-jsconfig.ts": "export const value = 2;",
      "src/consumer.ts": 'import { value } from "@selected"; export const selected = value;'
    });
    const configuredResolver = createTypeScriptProjectModuleResolver(project);

    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "@selected")).toEqual({
      targetFilePath: "src/from-tsconfig.ts",
      strategy: "tsconfig-paths",
      configurationPaths: ["tsconfig.json"]
    });
    expect(configuredResolver.configurationInputs).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "jsconfig", path: "jsconfig.json" })])
    );
  });

  it("tracks an absent tsconfig when jsconfig is the selected configuration", async () => {
    const project = await createConfiguredProject({
      "jsconfig.json": JSON.stringify({
        compilerOptions: {
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@selected": ["src/from-jsconfig.ts"] }
        }
      }),
      "src/from-jsconfig.ts": "export const value = 2;",
      "src/consumer.ts": 'import { value } from "@selected"; export const selected = value;'
    });
    const configuredResolver = createTypeScriptProjectModuleResolver(project);

    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "@selected")).toEqual({
      targetFilePath: "src/from-jsconfig.ts",
      strategy: "tsconfig-paths",
      configurationPaths: ["jsconfig.json"]
    });
    expect(configuredResolver.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "jsconfig", path: "jsconfig.json", state: "present" }),
        expect.objectContaining({ kind: "tsconfig", path: "tsconfig.json", state: "absent" })
      ])
    );
  });

  it("normalizes malformed or external configs into ProjectConfigurationError", async () => {
    const malformed = await createConfiguredProject({ "tsconfig.json": "{ invalid json" });
    const external = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({ extends: "@tsconfig/node22/tsconfig.json" })
    });

    expect(() => createTypeScriptProjectModuleResolver(malformed)).toThrow(ProjectConfigurationError);
    expect(() => createTypeScriptProjectModuleResolver(malformed)).not.toThrow(/Debug Failure/);
    expect(() => createTypeScriptProjectModuleResolver(external)).toThrow(ProjectConfigurationError);
  });

  it("resolves a named re-export chain to the original declaration with route evidence", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript",
        sourceText: "export function add() { return 1; }",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export { add as sum } from "./math";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript",
        sourceText: 'import { sum } from "./barrel"; export const total = sum();',
        contentHash: "consumer"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const add = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/math.ts" && symbol.name === "add"
    );
    const call = snapshot.edges.find((edge) => edge.kind === "calls" && edge.referenceName === "sum");

    expect(call).toMatchObject({ targetId: add?.id, resolution: "exact", confidence: 1 });
    expect(call?.evidence).toEqual({
      ruleId: "module.reexported-import-binding",
      stage: "module",
      candidateSymbolIds: [add?.id],
      resolutionPath: ["src/consumer.ts", "src/barrel.ts", "src/math.ts"]
    });
  });

  it("resolves a local export alias that forwards an imported binding", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript",
        sourceText: "export function add() { return 1; }",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'import { add } from "./math"; export { add as sum };',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript",
        sourceText: 'import { sum } from "./barrel"; export const total = sum();',
        contentHash: "consumer"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const add = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/math.ts" && symbol.name === "add"
    );
    const call = snapshot.edges.find((edge) => edge.kind === "calls" && edge.referenceName === "sum");

    expect(call).toMatchObject({ targetId: add?.id, resolution: "exact", confidence: 1 });
    expect(call?.evidence?.resolutionPath).toEqual([
      "src/consumer.ts",
      "src/barrel.ts",
      "src/math.ts"
    ]);
  });

  it("resolves wildcard barrels while keeping default exports out of their surface", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript",
        sourceText: "export function add() { return 1; } export default function hidden() { return 2; }",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export * from "./math";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript",
        sourceText: 'import { add, default as hidden } from "./barrel"; export const total = add() + hidden();',
        contentHash: "consumer"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const addCall = snapshot.edges.find((edge) => edge.kind === "calls" && edge.referenceName === "add");
    const hiddenCall = snapshot.edges.find(
      (edge) => edge.kind === "calls" && edge.referenceName === "hidden"
    );

    expect(addCall).toMatchObject({ resolution: "exact", targetId: expect.any(String) });
    expect(hiddenCall).toMatchObject({ resolution: "unresolved", targetId: null });
  });

  it("keeps conflicting wildcard exports unresolved instead of selecting a first match", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/left.ts",
        relativePath: "src/left.ts",
        language: "typescript",
        sourceText: "export function value() { return 1; }",
        contentHash: "left"
      },
      {
        absolutePath: "C:/project/src/right.ts",
        relativePath: "src/right.ts",
        language: "typescript",
        sourceText: "export function value() { return 2; }",
        contentHash: "right"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export * from "./left"; export * from "./right";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript",
        sourceText: 'import { value } from "./barrel"; export const selected = value();',
        contentHash: "consumer"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const valueCall = snapshot.edges.find(
      (edge) => edge.kind === "calls" && edge.referenceName === "value"
    );

    expect(valueCall).toMatchObject({ resolution: "unresolved", targetId: null });
    expect(valueCall?.evidence?.candidateSymbolIds).toHaveLength(2);
  });

  it("lets an explicit re-export take precedence over a wildcard collision", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/left.ts",
        relativePath: "src/left.ts",
        language: "typescript",
        sourceText: "export function value() { return 1; }",
        contentHash: "left"
      },
      {
        absolutePath: "C:/project/src/right.ts",
        relativePath: "src/right.ts",
        language: "typescript",
        sourceText: "export function value() { return 2; }",
        contentHash: "right"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export { value } from "./right"; export * from "./left";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript",
        sourceText: 'import { value } from "./barrel"; export const selected = value();',
        contentHash: "consumer"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const rightValue = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/right.ts" && symbol.name === "value"
    );
    const valueCall = snapshot.edges.find(
      (edge) => edge.kind === "calls" && edge.referenceName === "value"
    );

    expect(valueCall).toMatchObject({ resolution: "exact", targetId: rightValue?.id });
  });

  it("terminates cyclic wildcard re-exports without manufacturing a target", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/a.ts",
        relativePath: "src/a.ts",
        language: "typescript",
        sourceText: 'export * from "./b";',
        contentHash: "a"
      },
      {
        absolutePath: "C:/project/src/b.ts",
        relativePath: "src/b.ts",
        language: "typescript",
        sourceText: 'export * from "./a";',
        contentHash: "b"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript",
        sourceText: 'import { value } from "./a"; export const selected = value();',
        contentHash: "consumer"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const valueCall = snapshot.edges.find(
      (edge) => edge.kind === "calls" && edge.referenceName === "value"
    );

    expect(valueCall).toMatchObject({ resolution: "unresolved", targetId: null });
  });

  it("does not use a global heuristic for an explicit namespace re-export binding", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript",
        sourceText: "export function real() { return 1; }",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export * as ns from "./math";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/unrelated.ts",
        relativePath: "src/unrelated.ts",
        language: "typescript",
        sourceText: "export function ns() { return 2; }",
        contentHash: "unrelated"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript",
        sourceText: 'import { ns } from "./barrel"; export const selected = ns();',
        contentHash: "consumer"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const nsCall = snapshot.edges.find((edge) => edge.kind === "calls" && edge.referenceName === "ns");

    expect(nsCall).toMatchObject({ resolution: "unresolved", targetId: null });
    expect(nsCall?.evidence?.candidateSymbolIds).toEqual([]);
  });

  it("does not use a global heuristic for a namespace import", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/math.ts",
        relativePath: "src/math.ts",
        language: "typescript",
        sourceText: "export function real() { return 1; }",
        contentHash: "math"
      },
      {
        absolutePath: "C:/project/src/unrelated.ts",
        relativePath: "src/unrelated.ts",
        language: "typescript",
        sourceText: "export function math() { return 2; }",
        contentHash: "unrelated"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript",
        sourceText: 'import * as math from "./math"; export const selected = math();',
        contentHash: "consumer"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const mathCall = snapshot.edges.find(
      (edge) => edge.kind === "calls" && edge.referenceName === "math"
    );

    expect(mathCall).toMatchObject({ resolution: "unresolved", targetId: null });
  });

  it("projects a React Native NativeModules call to each independently unique Android and iOS target", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/bridge.ts",
        relativePath: "src/bridge.ts",
        language: "typescript",
        sourceText: [
          'import { NativeModules } from "react-native";',
          "export function schedule() { NativeModules.CalendarModule.createEvent(); }"
        ].join("\n"),
        contentHash: "bridge"
      },
      {
        absolutePath: "C:/project/android/CalendarModule.java",
        relativePath: "android/CalendarModule.java",
        language: "java",
        sourceText: [
          "import com.facebook.react.bridge.ReactContextBaseJavaModule;",
          "import com.facebook.react.bridge.ReactMethod;",
          "public class CalendarModule extends ReactContextBaseJavaModule {",
          '  private static final String NAME = "CalendarModule";',
          "  public String getName() { return NAME; }",
          "  @ReactMethod public void createEvent() {}",
          "}"
        ].join("\n"),
        contentHash: "android"
      },
      {
        absolutePath: "C:/project/ios/CalendarModule.m",
        relativePath: "ios/CalendarModule.m",
        language: "objc",
        sourceText: [
          "#import <React/RCTBridgeModule.h>",
          "@implementation CalendarModule",
          "RCT_EXPORT_MODULE(CalendarModule)",
          "RCT_EXPORT_METHOD(createEvent)",
          "@end"
        ].join("\n"),
        contentHash: "ios"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-02T00:00:00.000Z"
    });
    const schedule = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/bridge.ts" && symbol.name === "schedule"
    );
    const android = snapshot.symbols.find(
      (symbol) => symbol.filePath === "android/CalendarModule.java" && symbol.name === "createEvent"
    );
    const ios = snapshot.symbols.find(
      (symbol) => symbol.filePath === "ios/CalendarModule.m" && symbol.name === "createEvent"
    );

    expect(schedule).toBeDefined();
    expect(android).toBeDefined();
    expect(ios).toBeDefined();
    expect(
      snapshot.edges.filter(
        (edge) => edge.sourceId === schedule?.id && edge.referenceName === "CalendarModule.createEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: android?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.react-native.native-modules.direct-module-and-method.android.exact-target",
            stage: "module"
          })
        }),
        expect.objectContaining({
          targetId: ios?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.react-native.native-modules.direct-module-and-method.ios.exact-target",
            stage: "module"
          })
        })
      ])
    );
  });

  it("projects default-name and remapped Objective-C React Native exports", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/bridge.ts",
        relativePath: "src/bridge.ts",
        language: "typescript",
        sourceText: [
          'import { NativeModules } from "react-native";',
          "export function schedule() {",
          "  NativeModules.CalendarModule.removeEvent();",
          "  NativeModules.LocationModule.beginTracking();",
          "}"
        ].join("\n"),
        contentHash: "objc-remap-bridge"
      },
      {
        absolutePath: "C:/project/ios/RCTCalendarModule.m",
        relativePath: "ios/RCTCalendarModule.m",
        language: "objc",
        sourceText: [
          "#import <React/RCTBridgeModule.h>",
          "@implementation RCTCalendarModule",
          "RCT_EXPORT_MODULE()",
          "RCT_REMAP_METHOD(removeEvent, deleteEvent:(NSString *)eventId)",
          "@end"
        ].join("\n"),
        contentHash: "objc-rct-remap"
      },
      {
        absolutePath: "C:/project/ios/RKLocationModule.m",
        relativePath: "ios/RKLocationModule.m",
        language: "objc",
        sourceText: [
          "#import <React/RCTBridgeModule.h>",
          "@implementation RKLocationModule",
          "RCT_EXPORT_MODULE()",
          "RCT_REMAP_METHOD(beginTracking, startTracking:(BOOL)enabled)",
          "@end"
        ].join("\n"),
        contentHash: "objc-rk-remap"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-02T00:00:00.000Z"
    });
    const schedule = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/bridge.ts" && symbol.name === "schedule"
    );
    const removeEvent = snapshot.symbols.find(
      (symbol) => symbol.filePath === "ios/RCTCalendarModule.m" && symbol.name === "removeEvent"
    );
    const beginTracking = snapshot.symbols.find(
      (symbol) => symbol.filePath === "ios/RKLocationModule.m" && symbol.name === "beginTracking"
    );

    expect(schedule).toBeDefined();
    expect(removeEvent).toBeDefined();
    expect(beginTracking).toBeDefined();
    expect(
      snapshot.edges.filter(
        (edge) => edge.sourceId === schedule?.id && edge.referenceName === "CalendarModule.removeEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: removeEvent?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.react-native.native-modules.direct-module-and-method.ios.exact-target",
            stage: "module"
          })
        })
      ])
    );
    expect(
      snapshot.edges.filter(
        (edge) => edge.sourceId === schedule?.id && edge.referenceName === "LocationModule.beginTracking"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: beginTracking?.id,
          resolution: "exact",
          confidence: 1,
          evidence: expect.objectContaining({
            ruleId: "framework.react-native.native-modules.direct-module-and-method.ios.exact-target",
            stage: "module"
          })
        })
      ])
    );
  });

  it("projects direct React Native Swift external bridge declarations through NativeModules", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/bridge.ts",
        relativePath: "src/bridge.ts",
        language: "typescript",
        sourceText: [
          'import { NativeModules } from "react-native";',
          "export function schedule() {",
          "  NativeModules.CalendarModule.createEvent();",
          "  NativeModules.CalendarModule.currentEvent();",
          "  NativeModules.CalendarJS.removeEvent();",
          "}"
        ].join("\n"),
        contentHash: "swift-extern-bridge"
      },
      {
        absolutePath: "C:/project/ios/CalendarModuleExport.m",
        relativePath: "ios/CalendarModuleExport.m",
        language: "objc",
        sourceText: [
        "#import <React/RCTBridgeModule.h>",
        "@interface RCT_EXTERN_MODULE(CalendarModule, NSObject)",
        "RCT_EXTERN_METHOD(createEvent:(NSString *)name withFoo:(NSInteger)a bar:(NSInteger)b)",
          "RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(currentEvent)",
          "@end"
        ].join("\n"),
        contentHash: "swift-extern-default"
      },
      {
        absolutePath: "C:/project/ios/RemappedCalendarModuleExport.m",
        relativePath: "ios/RemappedCalendarModuleExport.m",
        language: "objc",
        sourceText: [
          "#import <React/RCTBridgeModule.h>",
          "@interface RCT_EXTERN_REMAP_MODULE(CalendarJS, CalendarModule, NSObject)",
        "_RCT_EXTERN_REMAP_METHOD(removeEvent, deleteEvent:(NSString *)eventId, NO)",
        "@end"
      ].join("\n"),
      contentHash: "swift-extern-remapped"
      },
      {
        absolutePath: "C:/project/ios/CalendarModule.swift",
        relativePath: "ios/CalendarModule.swift",
        language: "swift",
        sourceText: [
          "@objc(CalendarModule)",
          "final class CalendarModule: NSObject {",
          "  @objc(createEvent:withFoo:bar:)",
          "  func writeEvent(name: String, withFoo a: Int, bar b: Int) {}",
          "  @objc(currentEvent)",
          "  func readEvent() {}",
          "  @objc(deleteEvent:)",
          "  func removeStoredEvent(eventId: String) {}",
          "}"
        ].join("\n"),
        contentHash: "swift-implementation"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-02T00:00:00.000Z"
    });
    const schedule = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/bridge.ts" && symbol.name === "schedule"
    );
    const createEvent = snapshot.symbols.find(
      (symbol) => symbol.filePath === "ios/CalendarModuleExport.m" && symbol.name === "createEvent"
    );
    const currentEvent = snapshot.symbols.find(
      (symbol) => symbol.filePath === "ios/CalendarModuleExport.m" && symbol.name === "currentEvent"
    );
    const removeEvent = snapshot.symbols.find(
      (symbol) =>
        symbol.filePath === "ios/RemappedCalendarModuleExport.m" && symbol.name === "removeEvent"
    );
    const writeEvent = snapshot.symbols.find(
      (symbol) => symbol.filePath === "ios/CalendarModule.swift" && symbol.name === "writeEvent"
    );
    const readEvent = snapshot.symbols.find(
      (symbol) => symbol.filePath === "ios/CalendarModule.swift" && symbol.name === "readEvent"
    );
    const removeStoredEvent = snapshot.symbols.find(
      (symbol) =>
        symbol.filePath === "ios/CalendarModule.swift" && symbol.name === "removeStoredEvent"
    );

    expect(schedule).toBeDefined();
    expect(createEvent).toBeDefined();
    expect(currentEvent).toBeDefined();
    expect(removeEvent).toBeDefined();
    expect(writeEvent).toBeDefined();
    expect(readEvent).toBeDefined();
    expect(removeStoredEvent).toBeDefined();
    for (const [referenceName, target] of [
      ["CalendarModule.createEvent", createEvent],
      ["CalendarModule.currentEvent", currentEvent],
      ["CalendarJS.removeEvent", removeEvent]
    ] as const) {
      expect(
        snapshot.edges.find(
          (edge) => edge.sourceId === schedule?.id && edge.referenceName === referenceName
        )
      ).toMatchObject({
        targetId: target?.id,
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "framework.react-native.native-modules.direct-module-and-method.ios.exact-target",
          stage: "module"
        })
      });
    }
    for (const [source, referenceName, target] of [
      [createEvent, "CalendarModule.createEvent:withFoo:bar:", writeEvent],
      [currentEvent, "CalendarModule.currentEvent", readEvent],
      [removeEvent, "CalendarModule.deleteEvent:", removeStoredEvent]
    ] as const) {
      expect(
        snapshot.edges.find(
          (edge) => edge.sourceId === source?.id && edge.referenceName === referenceName
        )
      ).toMatchObject({
        kind: "references",
        targetId: target?.id,
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "framework.react-native.swift-extern.direct-objc-class-and-selector.exact-target",
          stage: "module"
        })
      });
    }
  });

  it("keeps unmatched and colliding Swift external bridge identities unresolved", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/ios/UnresolvedModuleExport.m",
        relativePath: "ios/UnresolvedModuleExport.m",
        language: "objc",
        sourceText: [
          "#import <React/RCTBridgeModule.h>",
          "@interface RCT_EXTERN_MODULE(UnresolvedModule, NSObject)",
          "RCT_EXTERN_METHOD(missing:(NSString *)value)",
          "@end"
        ].join("\n"),
        contentHash: "swift-extern-unresolved"
      },
      {
        absolutePath: "C:/project/ios/CollisionModuleExport.m",
        relativePath: "ios/CollisionModuleExport.m",
        language: "objc",
        sourceText: [
          "#import <React/RCTBridgeModule.h>",
          "@interface RCT_EXTERN_MODULE(CollisionModule, NSObject)",
          "RCT_EXTERN_METHOD(refresh)",
          "@end"
        ].join("\n"),
        contentHash: "swift-extern-collision"
      },
      {
        absolutePath: "C:/project/ios/FirstCollision.swift",
        relativePath: "ios/FirstCollision.swift",
        language: "swift",
        sourceText: [
          "@objc(CollisionModule)",
          "class FirstCollision: NSObject {",
          "  @objc(refresh)",
          "  func firstRefresh() {}",
          "}"
        ].join("\n"),
        contentHash: "swift-first-collision"
      },
      {
        absolutePath: "C:/project/ios/SecondCollision.swift",
        relativePath: "ios/SecondCollision.swift",
        language: "swift",
        sourceText: [
          "@objc(CollisionModule)",
          "class SecondCollision: NSObject {",
          "  @objc(refresh)",
          "  func secondRefresh() {}",
          "}"
        ].join("\n"),
        contentHash: "swift-second-collision"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-02T00:00:00.000Z"
    });
    const missing = snapshot.edges.find(
      (edge) =>
        edge.referenceName === "UnresolvedModule.missing:" &&
        edge.evidence?.ruleId ===
          "framework.react-native.swift-extern.direct-objc-class-and-selector.unresolved-target"
    );
    const collision = snapshot.edges.find(
      (edge) =>
        edge.referenceName === "CollisionModule.refresh" &&
        edge.evidence?.ruleId ===
          "framework.react-native.swift-extern.direct-objc-class-and-selector.ambiguous-target"
    );

    expect(missing).toMatchObject({ resolution: "unresolved", confidence: 0, targetId: null });
    expect(missing?.evidence?.candidateSymbolIds).toEqual([]);
    expect(collision).toMatchObject({ resolution: "unresolved", confidence: 0, targetId: null });
    expect(collision?.evidence?.candidateSymbolIds).toHaveLength(2);
  });

  it("keeps colliding React Native implementations on one platform unresolved", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/bridge.ts",
        relativePath: "src/bridge.ts",
        language: "typescript",
        sourceText: [
          'import { NativeModules } from "react-native";',
          "export function schedule() { NativeModules.CalendarModule.createEvent(); }"
        ].join("\n"),
        contentHash: "bridge"
      },
      {
        absolutePath: "C:/project/android/CalendarModule.java",
        relativePath: "android/CalendarModule.java",
        language: "java",
        sourceText: [
          "import com.facebook.react.bridge.ReactContextBaseJavaModule;",
          "import com.facebook.react.bridge.ReactMethod;",
          "public class CalendarModule extends ReactContextBaseJavaModule {",
          '  public String getName() { return "CalendarModule"; }',
          "  @ReactMethod public void createEvent() {}",
          "}"
        ].join("\n"),
        contentHash: "java"
      },
      {
        absolutePath: "C:/project/android/CalendarModule.kt",
        relativePath: "android/CalendarModule.kt",
        language: "kotlin",
        sourceText: [
          "import com.facebook.react.bridge.ReactContextBaseJavaModule",
          "import com.facebook.react.bridge.ReactMethod",
          "class CalendarModule(context: Any) : ReactContextBaseJavaModule(context) {",
          '  override fun getName(): String = "CalendarModule"',
          "  @ReactMethod fun createEvent() {}",
          "}"
        ].join("\n"),
        contentHash: "kotlin"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-02T00:00:00.000Z"
    });
    const unresolved = snapshot.edges.find(
      (edge) =>
        edge.referenceName === "CalendarModule.createEvent" &&
        edge.targetId === null &&
        edge.evidence?.ruleId ===
          "framework.react-native.native-modules.direct-module-and-method.any.ambiguous-platform-target"
    );

    expect(unresolved).toMatchObject({ resolution: "unresolved", confidence: 0 });
    expect(unresolved?.evidence?.candidateSymbolIds).toHaveLength(2);
  });

  it("projects React Native TurboModule registry calls and spec contracts to each unique platform target", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/NativeCalendar.ts",
        relativePath: "src/NativeCalendar.ts",
        language: "typescript",
        sourceText: [
          'import { TurboModuleRegistry } from "react-native";',
          'import type { TurboModule } from "react-native";',
          "export interface Spec extends TurboModule {",
          "  createEvent(): void;",
          "  cancelEvent(): void;",
          "}",
          'const Calendar = TurboModuleRegistry.getEnforcing<Spec>("CalendarModule");',
          "export function schedule() { Calendar.createEvent(); }"
        ].join("\n"),
        contentHash: "turbo-spec"
      },
      {
        absolutePath: "C:/project/android/CalendarModule.java",
        relativePath: "android/CalendarModule.java",
        language: "java",
        sourceText: [
          "import com.facebook.react.bridge.ReactContextBaseJavaModule;",
          "import com.facebook.react.bridge.ReactMethod;",
          "public class CalendarModule extends ReactContextBaseJavaModule {",
          '  public String getName() { return "CalendarModule"; }',
          "  @ReactMethod public void createEvent() {}",
          "}"
        ].join("\n"),
        contentHash: "turbo-android"
      },
      {
        absolutePath: "C:/project/ios/CalendarModule.m",
        relativePath: "ios/CalendarModule.m",
        language: "objc",
        sourceText: [
          "#import <React/RCTBridgeModule.h>",
          "@implementation CalendarModule",
          "RCT_EXPORT_MODULE(CalendarModule)",
          "RCT_EXPORT_METHOD(createEvent)",
          "@end"
        ].join("\n"),
        contentHash: "turbo-ios"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-02T00:00:00.000Z"
    });
    const schedule = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/NativeCalendar.ts" && symbol.name === "schedule"
    );
    const specMethod = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/NativeCalendar.ts#Spec.createEvent"
    );
    const android = snapshot.symbols.find(
      (symbol) => symbol.filePath === "android/CalendarModule.java" && symbol.name === "createEvent"
    );
    const ios = snapshot.symbols.find(
      (symbol) => symbol.filePath === "ios/CalendarModule.m" && symbol.name === "createEvent"
    );

    expect(schedule).toBeDefined();
    expect(specMethod).toBeDefined();
    expect(android).toBeDefined();
    expect(ios).toBeDefined();
    expect(
      snapshot.edges.filter(
        (edge) => edge.sourceId === schedule?.id && edge.referenceName === "CalendarModule.createEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: android?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.turbo-modules.direct-registry.literal-module-and-method.android.exact-target"
          })
        }),
        expect.objectContaining({
          targetId: ios?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.turbo-modules.direct-registry.literal-module-and-method.ios.exact-target"
          })
        })
      ])
    );
    expect(
      snapshot.edges.filter(
        (edge) => edge.sourceId === specMethod?.id && edge.referenceName === "CalendarModule.createEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: android?.id,
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.turbo-modules.spec-contract.literal-module-and-method.android.exact-target"
          })
        }),
        expect.objectContaining({
          targetId: ios?.id,
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.turbo-modules.spec-contract.literal-module-and-method.ios.exact-target"
          })
        })
      ])
    );
    expect(
      snapshot.edges.find(
        (edge) =>
          edge.referenceName === "CalendarModule.cancelEvent" &&
          edge.sourceId !== schedule?.id &&
          edge.targetId === null &&
          edge.evidence?.ruleId ===
            "framework.react-native.turbo-modules.spec-contract.literal-module-and-method.any.unresolved-target"
      )
    ).toMatchObject({ resolution: "unresolved", confidence: 0 });
  });

  it("projects React Native Codegen Spec overrides only through one unique TypeScript contract", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/mobile/NativeCalendar.ts",
        relativePath: "src/mobile/NativeCalendar.ts",
        language: "typescript",
        sourceText: [
          'import { NativeModules, TurboModuleRegistry } from "react-native";',
          'import type { TurboModule } from "react-native";',
          "export interface Spec extends TurboModule {",
          "  createCodegenEvent(): void;",
          "  cancelCodegenEvent(): void;",
          "}",
          'const Calendar = TurboModuleRegistry.getEnforcing<Spec>("CalendarModule");',
          "export function schedule() {",
          "  Calendar.createCodegenEvent();",
          "  Calendar.cancelCodegenEvent();",
          "  NativeModules.UncontractedModule.uncontracted();",
          "}",
          "export default Calendar;"
        ].join("\n"),
        contentHash: "codegen-calendar"
      },
      {
        absolutePath: "C:/project/src/mobile/useCalendar.ts",
        relativePath: "src/mobile/useCalendar.ts",
        language: "typescript",
        sourceText: [
          'import Calendar from "./NativeCalendar";',
          "export function defaultSchedule() { Calendar.createCodegenEvent(); }"
        ].join("\n"),
        contentHash: "codegen-default-import"
      },
      {
        absolutePath: "C:/project/src/mobile/NativeCalendarBarrel.ts",
        relativePath: "src/mobile/NativeCalendarBarrel.ts",
        language: "typescript",
        sourceText: 'export { default } from "./NativeCalendar";',
        contentHash: "codegen-default-re-export"
      },
      {
        absolutePath: "C:/project/src/mobile/useCalendarReExport.ts",
        relativePath: "src/mobile/useCalendarReExport.ts",
        language: "typescript",
        sourceText: [
          'import Calendar from "./NativeCalendarBarrel";',
          "export function reExportSchedule() { Calendar.cancelCodegenEvent(); }"
        ].join("\n"),
        contentHash: "codegen-re-export-consumer"
      },
      {
        absolutePath: "C:/project/src/mobile/NativeDuplicateOne.ts",
        relativePath: "src/mobile/NativeDuplicateOne.ts",
        language: "typescript",
        sourceText: [
          'import { TurboModuleRegistry } from "react-native";',
          'import type { TurboModule } from "react-native";',
          "export interface Spec extends TurboModule { duplicateEvent(): void; }",
          'const Duplicate = TurboModuleRegistry.getEnforcing<Spec>("DuplicateModule");',
          "export function invokeDuplicate() { Duplicate.duplicateEvent(); }"
        ].join("\n"),
        contentHash: "codegen-duplicate-one"
      },
      {
        absolutePath: "C:/project/src/mobile/NativeDuplicateTwo.ts",
        relativePath: "src/mobile/NativeDuplicateTwo.ts",
        language: "typescript",
        sourceText: [
          'import { TurboModuleRegistry } from "react-native";',
          'import type { TurboModule } from "react-native";',
          "export interface Spec extends TurboModule { duplicateEvent(): void; }",
          'const Duplicate = TurboModuleRegistry.getEnforcing<Spec>("DuplicateModule");'
        ].join("\n"),
        contentHash: "codegen-duplicate-two"
      },
      {
        absolutePath: "C:/project/android/NativeCalendarModule.java",
        relativePath: "android/NativeCalendarModule.java",
        language: "java",
        sourceText: [
          "import com.example.NativeCalendarSpec;",
          "public class NativeCalendarModule extends NativeCalendarSpec {",
          '  private static final String NAME = "CalendarModule";',
          "  @Override public String getName() { return NAME; }",
          "  @Override public void createCodegenEvent() {}",
          "}"
        ].join("\n"),
        contentHash: "codegen-java"
      },
      {
        absolutePath: "C:/project/android/NativeCalendarModule.kt",
        relativePath: "android/NativeCalendarModule.kt",
        language: "kotlin",
        sourceText: [
          "import com.example.NativeCalendarSpec",
          "class NativeCalendarModule(context: Any) : NativeCalendarSpec(context) {",
          "  companion object {",
          '    const val NAME: String = "CalendarModule"',
          "  }",
          "  override fun getName(): String = NAME",
          "  override fun cancelCodegenEvent() {}",
          "}"
        ].join("\n"),
        contentHash: "codegen-kotlin"
      },
      {
        absolutePath: "C:/project/android/NativeUncontractedModule.java",
        relativePath: "android/NativeUncontractedModule.java",
        language: "java",
        sourceText: [
          "import com.example.NativeUncontractedSpec;",
          "public class NativeUncontractedModule extends NativeUncontractedSpec {",
          '  @Override public String getName() { return "UncontractedModule"; }',
          "  @Override public void uncontracted() {}",
          "}"
        ].join("\n"),
        contentHash: "codegen-uncontracted"
      },
      {
        absolutePath: "C:/project/android/NativeDuplicateModule.java",
        relativePath: "android/NativeDuplicateModule.java",
        language: "java",
        sourceText: [
          "import com.example.NativeDuplicateSpec;",
          "public class NativeDuplicateModule extends NativeDuplicateSpec {",
          '  @Override public String getName() { return "DuplicateModule"; }',
          "  @Override public void duplicateEvent() {}",
          "}"
        ].join("\n"),
        contentHash: "codegen-duplicate-java"
      }
    ];
    const extractedFiles = sourceDocuments.map((document) =>
      extractFileFacts({
        filePath: document.relativePath,
        language: document.language,
        sourceText: document.sourceText
      })
    );
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles,
      indexedAt: "2026-08-02T00:00:00.000Z"
    });
    const schedule = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/mobile/NativeCalendar.ts" && symbol.name === "schedule"
    );
    const createSpec = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/mobile/NativeCalendar.ts#Spec.createCodegenEvent"
    );
    const cancelSpec = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/mobile/NativeCalendar.ts#Spec.cancelCodegenEvent"
    );
    const javaTarget = snapshot.symbols.find(
      (symbol) =>
        symbol.filePath === "android/NativeCalendarModule.java" &&
        symbol.name === "createCodegenEvent"
    );
    const kotlinTarget = snapshot.symbols.find(
      (symbol) =>
        symbol.filePath === "android/NativeCalendarModule.kt" &&
        symbol.name === "cancelCodegenEvent"
    );
    const duplicateCall = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/mobile/NativeDuplicateOne.ts" && symbol.name === "invokeDuplicate"
    );
    const defaultSchedule = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/mobile/useCalendar.ts" && symbol.name === "defaultSchedule"
    );
    const reExportSchedule = snapshot.symbols.find(
      (symbol) =>
        symbol.filePath === "src/mobile/useCalendarReExport.ts" && symbol.name === "reExportSchedule"
    );

    expect(schedule).toBeDefined();
    expect(createSpec).toBeDefined();
    expect(cancelSpec).toBeDefined();
    expect(javaTarget).toBeDefined();
    expect(kotlinTarget).toBeDefined();
    expect(duplicateCall).toBeDefined();
    expect(defaultSchedule).toBeDefined();
    expect(reExportSchedule).toBeDefined();
    expect(
      snapshot.edges.filter(
        (edge) =>
          edge.sourceId === schedule?.id &&
          edge.referenceName === "CalendarModule.createCodegenEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: javaTarget?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.codegen-spec.turbo-direct-registry.direct-spec-superclass-and-unique-typescript-contract.android.exact-target"
          })
        })
      ])
    );
    expect(
      snapshot.edges.filter(
        (edge) =>
          edge.sourceId === defaultSchedule?.id &&
          edge.referenceName === "CalendarModule.createCodegenEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: javaTarget?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.codegen-spec.turbo-default-import.direct-spec-superclass-and-unique-typescript-contract.android.exact-target"
          })
        })
      ])
    );
    expect(
      snapshot.edges.filter(
        (edge) =>
          edge.sourceId === reExportSchedule?.id &&
          edge.referenceName === "CalendarModule.cancelCodegenEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: kotlinTarget?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.codegen-spec.turbo-default-re-export.direct-spec-superclass-and-unique-typescript-contract.android.exact-target",
            resolutionPath: [
              "src/mobile/NativeCalendarBarrel.ts",
              "src/mobile/NativeCalendar.ts"
            ]
          })
        })
      ])
    );
    expect(
      snapshot.edges.filter(
        (edge) =>
          edge.sourceId === schedule?.id &&
          edge.referenceName === "CalendarModule.cancelCodegenEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: kotlinTarget?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.codegen-spec.turbo-direct-registry.direct-spec-superclass-and-unique-typescript-contract.android.exact-target"
          })
        })
      ])
    );
    expect(
      snapshot.edges.filter(
        (edge) =>
          edge.sourceId === createSpec?.id &&
          edge.referenceName === "CalendarModule.createCodegenEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: javaTarget?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.codegen-spec.turbo-spec-contract.direct-spec-superclass-and-unique-typescript-contract.android.exact-target"
          })
        })
      ])
    );
    expect(
      snapshot.edges.filter(
        (edge) =>
          edge.sourceId === cancelSpec?.id &&
          edge.referenceName === "CalendarModule.cancelCodegenEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: kotlinTarget?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.codegen-spec.turbo-spec-contract.direct-spec-superclass-and-unique-typescript-contract.android.exact-target"
          })
        })
      ])
    );
    expect(
      snapshot.edges.find(
        (edge) =>
          edge.sourceId === schedule?.id &&
          edge.referenceName === "UncontractedModule.uncontracted" &&
          edge.targetId === null &&
          edge.evidence?.ruleId ===
            "framework.react-native.codegen-spec.native-modules.direct-spec-superclass-and-unique-typescript-contract.any.unresolved-target"
      )
    ).toMatchObject({ resolution: "unresolved", confidence: 0 });
    expect(
      snapshot.edges.find(
        (edge) =>
          edge.sourceId === duplicateCall?.id &&
          edge.referenceName === "DuplicateModule.duplicateEvent" &&
          edge.targetId === null &&
          edge.evidence?.ruleId ===
            "framework.react-native.codegen-spec.turbo-direct-registry.direct-spec-superclass-and-unique-typescript-contract.any.unresolved-target"
      )
    ).toMatchObject({ resolution: "unresolved", confidence: 0 });
  });

  it("keeps colliding React Native TurboModule spec implementations unresolved on one platform", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/NativeCalendar.ts",
        relativePath: "src/NativeCalendar.ts",
        language: "typescript",
        sourceText: [
          'import { TurboModuleRegistry } from "react-native";',
          'import type { TurboModule } from "react-native";',
          "export interface Spec extends TurboModule { createEvent(): void; }",
          'export default TurboModuleRegistry.getEnforcing<Spec>("CalendarModule");'
        ].join("\n"),
        contentHash: "turbo-spec-collision"
      },
      {
        absolutePath: "C:/project/android/CalendarModule.java",
        relativePath: "android/CalendarModule.java",
        language: "java",
        sourceText: [
          "import com.facebook.react.bridge.ReactContextBaseJavaModule;",
          "import com.facebook.react.bridge.ReactMethod;",
          "public class CalendarModule extends ReactContextBaseJavaModule {",
          '  public String getName() { return "CalendarModule"; }',
          "  @ReactMethod public void createEvent() {}",
          "}"
        ].join("\n"),
        contentHash: "turbo-java"
      },
      {
        absolutePath: "C:/project/android/CalendarModule.kt",
        relativePath: "android/CalendarModule.kt",
        language: "kotlin",
        sourceText: [
          "import com.facebook.react.bridge.ReactContextBaseJavaModule",
          "import com.facebook.react.bridge.ReactMethod",
          "class CalendarModule(context: Any) : ReactContextBaseJavaModule(context) {",
          '  override fun getName(): String = "CalendarModule"',
          "  @ReactMethod fun createEvent() {}",
          "}"
        ].join("\n"),
        contentHash: "turbo-kotlin"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-02T00:00:00.000Z"
    });
    const unresolved = snapshot.edges.find(
      (edge) =>
        edge.referenceName === "CalendarModule.createEvent" &&
        edge.targetId === null &&
        edge.evidence?.ruleId ===
          "framework.react-native.turbo-modules.spec-contract.literal-module-and-method.any.ambiguous-platform-target"
    );

    expect(unresolved).toMatchObject({ resolution: "unresolved", confidence: 0 });
    expect(unresolved?.evidence?.candidateSymbolIds).toHaveLength(2);
  });

  it("projects a React Native TurboModule default import only through a proven local default export", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/mobile/NativeCalendar.ts",
        relativePath: "src/mobile/NativeCalendar.ts",
        language: "typescript",
        sourceText: [
          'import { TurboModuleRegistry } from "react-native";',
          'import type { TurboModule } from "react-native";',
          "export interface Spec extends TurboModule { createEvent(): void; }",
          'const Calendar = TurboModuleRegistry.getEnforcing<Spec>("CalendarModule");',
          "export default Calendar;"
        ].join("\n"),
        contentHash: "default-export"
      },
      {
        absolutePath: "C:/project/src/mobile/useCalendar.ts",
        relativePath: "src/mobile/useCalendar.ts",
        language: "typescript",
        sourceText: [
          'import Calendar from "./NativeCalendar";',
          "export function schedule() { Calendar.createEvent(); }"
        ].join("\n"),
        contentHash: "default-import"
      },
      {
        absolutePath: "C:/project/src/mobile/Plain.ts",
        relativePath: "src/mobile/Plain.ts",
        language: "typescript",
        sourceText: "export default { createEvent() {} };",
        contentHash: "plain-export"
      },
      {
        absolutePath: "C:/project/src/mobile/usePlain.ts",
        relativePath: "src/mobile/usePlain.ts",
        language: "typescript",
        sourceText: [
          'import Plain from "./Plain";',
          "export function ignore() { Plain.createEvent(); }"
        ].join("\n"),
        contentHash: "plain-import"
      },
      {
        absolutePath: "C:/project/android/CalendarModule.java",
        relativePath: "android/CalendarModule.java",
        language: "java",
        sourceText: [
          "import com.facebook.react.bridge.ReactContextBaseJavaModule;",
          "import com.facebook.react.bridge.ReactMethod;",
          "public class CalendarModule extends ReactContextBaseJavaModule {",
          '  public String getName() { return "CalendarModule"; }',
          "  @ReactMethod public void createEvent() {}",
          "}"
        ].join("\n"),
        contentHash: "default-android"
      },
      {
        absolutePath: "C:/project/ios/CalendarModule.m",
        relativePath: "ios/CalendarModule.m",
        language: "objc",
        sourceText: [
          "#import <React/RCTBridgeModule.h>",
          "@implementation CalendarModule",
          "RCT_EXPORT_MODULE(CalendarModule)",
          "RCT_EXPORT_METHOD(createEvent)",
          "@end"
        ].join("\n"),
        contentHash: "default-ios"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-02T00:00:00.000Z"
    });
    const schedule = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/mobile/useCalendar.ts" && symbol.name === "schedule"
    );
    const ignore = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/mobile/usePlain.ts" && symbol.name === "ignore"
    );
    const android = snapshot.symbols.find(
      (symbol) => symbol.filePath === "android/CalendarModule.java" && symbol.name === "createEvent"
    );
    const ios = snapshot.symbols.find(
      (symbol) => symbol.filePath === "ios/CalendarModule.m" && symbol.name === "createEvent"
    );

    expect(schedule).toBeDefined();
    expect(ignore).toBeDefined();
    expect(android).toBeDefined();
    expect(ios).toBeDefined();
    expect(
      snapshot.edges.filter(
        (edge) => edge.sourceId === schedule?.id && edge.referenceName === "CalendarModule.createEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: android?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.turbo-modules.default-import.literal-module-and-method.android.exact-target"
          })
        }),
        expect.objectContaining({
          targetId: ios?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.turbo-modules.default-import.literal-module-and-method.ios.exact-target"
          })
        })
      ])
    );
    expect(
      snapshot.edges.some(
        (edge) => edge.sourceId === ignore?.id && edge.targetId === android?.id && edge.kind === "calls"
      )
    ).toBe(false);
  });

  it("projects a React Native TurboModule through one static default re-export chain", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/mobile/NativeCalendar.ts",
        relativePath: "src/mobile/NativeCalendar.ts",
        language: "typescript",
        sourceText: [
          'import { TurboModuleRegistry } from "react-native";',
          'const Calendar = TurboModuleRegistry.getEnforcing("CalendarModule");',
          "export default Calendar;"
        ].join("\n"),
        contentHash: "re-export-leaf"
      },
      {
        absolutePath: "C:/project/src/mobile/NativeCalendarBarrel.ts",
        relativePath: "src/mobile/NativeCalendarBarrel.ts",
        language: "typescript",
        sourceText: 'export { default } from "./NativeCalendar";',
        contentHash: "re-export-barrel"
      },
      {
        absolutePath: "C:/project/src/mobile/NativeCalendarApi.ts",
        relativePath: "src/mobile/NativeCalendarApi.ts",
        language: "typescript",
        sourceText: [
          'import Calendar from "./NativeCalendarBarrel";',
          "export default Calendar;"
        ].join("\n"),
        contentHash: "re-export-api"
      },
      {
        absolutePath: "C:/project/src/mobile/useCalendar.ts",
        relativePath: "src/mobile/useCalendar.ts",
        language: "typescript",
        sourceText: [
          'import Calendar from "./NativeCalendarApi";',
          "export function schedule() { Calendar.createEvent(); }"
        ].join("\n"),
        contentHash: "re-export-consumer"
      },
      {
        absolutePath: "C:/project/src/mobile/UnsafeCalendarFacade.ts",
        relativePath: "src/mobile/UnsafeCalendarFacade.ts",
        language: "typescript",
        sourceText: [
          'import Calendar from "./NativeCalendar";',
          "const Plain = { createEvent() {} };",
          "export default Plain;",
          "void Calendar;"
        ].join("\n"),
        contentHash: "unsafe-facade"
      },
      {
        absolutePath: "C:/project/src/mobile/useUnsafeCalendar.ts",
        relativePath: "src/mobile/useUnsafeCalendar.ts",
        language: "typescript",
        sourceText: [
          'import Calendar from "./UnsafeCalendarFacade";',
          "export function ignore() { Calendar.createEvent(); }"
        ].join("\n"),
        contentHash: "unsafe-consumer"
      },
      {
        absolutePath: "C:/project/android/CalendarModule.java",
        relativePath: "android/CalendarModule.java",
        language: "java",
        sourceText: [
          "import com.facebook.react.bridge.ReactContextBaseJavaModule;",
          "import com.facebook.react.bridge.ReactMethod;",
          "public class CalendarModule extends ReactContextBaseJavaModule {",
          '  private static final String NAME = "CalendarModule";',
          "  public String getName() { return NAME; }",
          "  @ReactMethod public void createEvent() {}",
          "}"
        ].join("\n"),
        contentHash: "re-export-android"
      },
      {
        absolutePath: "C:/project/ios/CalendarModule.m",
        relativePath: "ios/CalendarModule.m",
        language: "objc",
        sourceText: [
          "#import <React/RCTBridgeModule.h>",
          "@implementation CalendarModule",
          "RCT_EXPORT_MODULE(CalendarModule)",
          "RCT_EXPORT_METHOD(createEvent)",
          "@end"
        ].join("\n"),
        contentHash: "re-export-ios"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-02T00:00:00.000Z"
    });
    const schedule = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/mobile/useCalendar.ts" && symbol.name === "schedule"
    );
    const ignore = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/mobile/useUnsafeCalendar.ts" && symbol.name === "ignore"
    );
    const android = snapshot.symbols.find(
      (symbol) => symbol.filePath === "android/CalendarModule.java" && symbol.name === "createEvent"
    );
    const ios = snapshot.symbols.find(
      (symbol) => symbol.filePath === "ios/CalendarModule.m" && symbol.name === "createEvent"
    );

    expect(schedule).toBeDefined();
    expect(ignore).toBeDefined();
    expect(android).toBeDefined();
    expect(ios).toBeDefined();
    expect(
      snapshot.edges.filter(
        (edge) => edge.sourceId === schedule?.id && edge.referenceName === "CalendarModule.createEvent"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: android?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.turbo-modules.default-re-export.literal-module-and-method.android.exact-target",
            resolutionPath: [
              "src/mobile/NativeCalendarApi.ts",
              "src/mobile/NativeCalendarBarrel.ts",
              "src/mobile/NativeCalendar.ts"
            ]
          })
        }),
        expect.objectContaining({
          targetId: ios?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId:
              "framework.react-native.turbo-modules.default-re-export.literal-module-and-method.ios.exact-target",
            resolutionPath: [
              "src/mobile/NativeCalendarApi.ts",
              "src/mobile/NativeCalendarBarrel.ts",
              "src/mobile/NativeCalendar.ts"
            ]
          })
        })
      ])
    );
    expect(
      snapshot.edges.some(
        (edge) => edge.sourceId === ignore?.id && edge.targetId === android?.id && edge.kind === "calls"
      )
    ).toBe(false);
  });
});
