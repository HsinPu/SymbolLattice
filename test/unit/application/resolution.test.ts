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
      .filter(([relativePath]) => /\.(?:[cm]?[jt]sx?)$/i.test(relativePath))
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
});
