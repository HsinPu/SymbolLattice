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
  if (/\.ets$/i.test(relativePath)) {
    return "arkts";
  }
  if (/\.svelte$/i.test(relativePath)) {
    return "svelte";
  }
  if (/\.vue$/i.test(relativePath)) {
    return "vue";
  }
  if (/\.astro$/i.test(relativePath)) {
    return "astro";
  }
  return /\.(?:[cm]?tsx?)$/i.test(relativePath) ? "typescript" : "javascript";
}

async function createConfiguredProject(
  files: Readonly<Record<string, string>>
): Promise<{ readonly projectPath: string; readonly sourceDocuments: readonly SourceDocument[] }> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-resolution-"));
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
      .filter(([relativePath]) => /\.(?:[cm]?[jt]sx?|vue|svelte|astro|ets)$/i.test(relativePath))
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
  it("fails closed for duplicate or conflicting persisted Razor companion class facts", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/Pages/Index.cshtml",
        relativePath: "Pages/Index.cshtml",
        language: "razor",
        sourceText: ["@page", "@model IndexModel"].join("\n"),
        contentHash: "razor"
      },
      {
        absolutePath: "C:/project/Pages/Index.cshtml.cs",
        relativePath: "Pages/Index.cshtml.cs",
        language: "csharp",
        sourceText: "public class IndexModel {}\n",
        contentHash: "csharp"
      }
    ];
    const extractedFiles = sourceDocuments.map((document) =>
      extractFileFacts({ filePath: document.relativePath, language: document.language, sourceText: document.sourceText })
    );
    const pageFacts = extractedFiles.find((facts) => facts.symbols[0]?.filePath === "Pages/Index.cshtml");
    const csharpFacts = extractedFiles.find((facts) => facts.symbols[0]?.filePath === "Pages/Index.cshtml.cs");
    const model = csharpFacts?.symbols.find((symbol) => symbol.kind === "class" && symbol.name === "IndexModel");
    const page = pageFacts?.symbols.find((symbol) => symbol.qualifiedName === "Pages/Index.cshtml#default");
    if (pageFacts === undefined || csharpFacts === undefined || model === undefined || page === undefined) {
      throw new Error("Expected Razor companion fixtures.");
    }
    const directClassFact = csharpFacts.csharpDirectClassFacts?.find((fact) => fact.classId === model.id);
    if (directClassFact === undefined) {
      throw new Error("Expected direct C# class fact.");
    }

    for (const duplicate of [
      { ...directClassFact },
      { ...directClassFact, isPartial: true }
    ]) {
      const snapshot = resolveProjectFacts({
        sourceDocuments,
        extractedFiles: [
          pageFacts,
          {
            ...csharpFacts,
            csharpDirectClassFacts: [directClassFact, duplicate]
          }
        ],
        indexedAt: "2026-08-11T00:00:00.000Z"
      });
      expect(
        snapshot.edges.filter(
          (edge) => edge.sourceId === page.id && edge.targetId === model.id && edge.kind === "references"
        )
      ).toEqual([]);
    }
  });

  it("resolves a unique extensionless ArkTS import and rejects cross-extension ambiguity", async () => {
    const uniqueProject = await createConfiguredProject({
      "src/common/TopView.ets": "@Component struct TopView {}",
      "src/pages/Index.ets": 'import { TopView } from "../common/TopView";\n@Entry @Component struct Index {}'
    });
    const uniqueResolver = createTypeScriptProjectModuleResolver(uniqueProject);
    expect(uniqueResolver.moduleResolver.resolve("src/pages/Index.ets", "../common/TopView")).toEqual({
      targetFilePath: "src/common/TopView.ets",
      strategy: "relative",
      configurationPaths: []
    });

    const ambiguousProject = await createConfiguredProject({
      "src/common/TopView.ets": "@Component struct TopView {}",
      "src/common/TopView.ts": "export class TopView {}",
      "src/pages/Index.ets": 'import { TopView } from "../common/TopView";\n@Entry @Component struct Index {}'
    });
    const ambiguousResolver = createTypeScriptProjectModuleResolver(ambiguousProject);
    expect(
      ambiguousResolver.moduleResolver.resolve("src/pages/Index.ets", "../common/TopView")
    ).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: []
    });
  });

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

  it("projects direct qualified Java/Kotlin parents without falling back to same-name types", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/java/api/JavaContract.java",
        relativePath: "src/java/api/JavaContract.java",
        language: "java",
        sourceText: [
          "package example.java.api;",
          "public interface JavaContract { void run(); }"
        ].join("\n"),
        contentHash: "java-qualified-contract"
      },
      {
        absolutePath: "C:/project/src/java/api/JavaBase.java",
        relativePath: "src/java/api/JavaBase.java",
        language: "java",
        sourceText: [
          "package example.java.api;",
          "public class JavaBase { void run() {} }"
        ].join("\n"),
        contentHash: "java-qualified-base"
      },
      {
        absolutePath: "C:/project/src/java/api/outer/JavaContract.java",
        relativePath: "src/java/api/outer/JavaContract.java",
        language: "java",
        sourceText: [
          "package example.java.api.Outer;",
          "public interface JavaContract {}"
        ].join("\n"),
        contentHash: "java-potential-nested-contract"
      },
      {
        absolutePath: "C:/project/src/java/impl/JavaContract.java",
        relativePath: "src/java/impl/JavaContract.java",
        language: "java",
        sourceText: [
          "package example.java.impl;",
          "public interface JavaContract { void localOnly(); }"
        ].join("\n"),
        contentHash: "java-qualified-shadow-contract"
      },
      {
        absolutePath: "C:/project/src/java/impl/JavaBase.java",
        relativePath: "src/java/impl/JavaBase.java",
        language: "java",
        sourceText: [
          "package example.java.impl;",
          "public class JavaBase { void localOnly() {} }"
        ].join("\n"),
        contentHash: "java-qualified-shadow-base"
      },
      {
        absolutePath: "C:/project/src/java/impl/JavaQualifiedInterfaceChild.java",
        relativePath: "src/java/impl/JavaQualifiedInterfaceChild.java",
        language: "java",
        sourceText: [
          "package example.java.impl;",
          "public class JavaQualifiedInterfaceChild implements example.java.api.JavaContract { @Override public void run() {} }"
        ].join("\n"),
        contentHash: "java-qualified-interface-child"
      },
      {
        absolutePath: "C:/project/src/java/impl/JavaQualifiedBaseChild.java",
        relativePath: "src/java/impl/JavaQualifiedBaseChild.java",
        language: "java",
        sourceText: [
          "package example.java.impl;",
          "public class JavaQualifiedBaseChild extends example.java.api.JavaBase { @Override void run() {} }"
        ].join("\n"),
        contentHash: "java-qualified-base-child"
      },
      {
        absolutePath: "C:/project/src/java/impl/JavaMissingQualifiedChild.java",
        relativePath: "src/java/impl/JavaMissingQualifiedChild.java",
        language: "java",
        sourceText: [
          "package example.java.impl;",
          "public class JavaMissingQualifiedChild implements missing.java.api.JavaContract {}"
        ].join("\n"),
        contentHash: "java-missing-qualified-child"
      },
      {
        absolutePath: "C:/project/src/java/impl/JavaPotentialNestedChild.java",
        relativePath: "src/java/impl/JavaPotentialNestedChild.java",
        language: "java",
        sourceText: [
          "package example.java.impl;",
          "public class JavaPotentialNestedChild implements example.java.api.Outer.JavaContract {}"
        ].join("\n"),
        contentHash: "java-potential-nested-child"
      },
      {
        absolutePath: "C:/project/src/kotlin/api/KotlinContract.kt",
        relativePath: "src/kotlin/api/KotlinContract.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.api",
          "interface KotlinContract { fun run() }"
        ].join("\n"),
        contentHash: "kotlin-qualified-contract"
      },
      {
        absolutePath: "C:/project/src/kotlin/api/KotlinBase.kt",
        relativePath: "src/kotlin/api/KotlinBase.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.api",
          "abstract class KotlinBase { abstract fun run() }"
        ].join("\n"),
        contentHash: "kotlin-qualified-base"
      },
      {
        absolutePath: "C:/project/src/kotlin/api/outer/KotlinContract.kt",
        relativePath: "src/kotlin/api/outer/KotlinContract.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.api.Outer",
          "interface KotlinContract"
        ].join("\n"),
        contentHash: "kotlin-potential-nested-contract"
      },
      {
        absolutePath: "C:/project/src/kotlin/impl/KotlinContract.kt",
        relativePath: "src/kotlin/impl/KotlinContract.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.impl",
          "interface KotlinContract { fun localOnly() }"
        ].join("\n"),
        contentHash: "kotlin-qualified-shadow-contract"
      },
      {
        absolutePath: "C:/project/src/kotlin/impl/KotlinBase.kt",
        relativePath: "src/kotlin/impl/KotlinBase.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.impl",
          "open class KotlinBase { fun localOnly() {} }"
        ].join("\n"),
        contentHash: "kotlin-qualified-shadow-base"
      },
      {
        absolutePath: "C:/project/src/kotlin/impl/KotlinQualifiedInterfaceChild.kt",
        relativePath: "src/kotlin/impl/KotlinQualifiedInterfaceChild.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.impl",
          "class KotlinQualifiedInterfaceChild : example.kotlin.api.KotlinContract { override fun run() {} }"
        ].join("\n"),
        contentHash: "kotlin-qualified-interface-child"
      },
      {
        absolutePath: "C:/project/src/kotlin/impl/KotlinQualifiedBaseChild.kt",
        relativePath: "src/kotlin/impl/KotlinQualifiedBaseChild.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.impl",
          "class KotlinQualifiedBaseChild : example.kotlin.api.KotlinBase() { override fun run() {} }"
        ].join("\n"),
        contentHash: "kotlin-qualified-base-child"
      },
      {
        absolutePath: "C:/project/src/kotlin/impl/KotlinMissingQualifiedChild.kt",
        relativePath: "src/kotlin/impl/KotlinMissingQualifiedChild.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.impl",
          "class KotlinMissingQualifiedChild : missing.kotlin.api.KotlinContract"
        ].join("\n"),
        contentHash: "kotlin-missing-qualified-child"
      },
      {
        absolutePath: "C:/project/src/kotlin/impl/KotlinPotentialNestedChild.kt",
        relativePath: "src/kotlin/impl/KotlinPotentialNestedChild.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.impl",
          "class KotlinPotentialNestedChild : example.kotlin.api.Outer.KotlinContract"
        ].join("\n"),
        contentHash: "kotlin-potential-nested-child"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const heritageEdge = (sourceQualifiedName: string, kind: "extends" | "implements") =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === kind
      );
    const overrideEdge = (sourceQualifiedName: string) =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === "overrides"
      );

    for (const [sourceQualifiedName, targetQualifiedName, kind, ruleId] of [
      [
        "src/java/impl/JavaQualifiedInterfaceChild.java#JavaQualifiedInterfaceChild",
        "src/java/api/JavaContract.java#JavaContract",
        "implements",
        "syntax.jvm.cross-file.qualified-type.direct-implements"
      ],
      [
        "src/java/impl/JavaQualifiedBaseChild.java#JavaQualifiedBaseChild",
        "src/java/api/JavaBase.java#JavaBase",
        "extends",
        "syntax.jvm.cross-file.qualified-type.direct-superclass"
      ],
      [
        "src/kotlin/impl/KotlinQualifiedInterfaceChild.kt#KotlinQualifiedInterfaceChild",
        "src/kotlin/api/KotlinContract.kt#KotlinContract",
        "implements",
        "syntax.jvm.cross-file.qualified-type.direct-implements"
      ],
      [
        "src/kotlin/impl/KotlinQualifiedBaseChild.kt#KotlinQualifiedBaseChild",
        "src/kotlin/api/KotlinBase.kt#KotlinBase",
        "extends",
        "syntax.jvm.cross-file.qualified-type.direct-superclass"
      ]
    ] as const) {
      expect(heritageEdge(sourceQualifiedName, kind)).toMatchObject({
        targetId: symbol(targetQualifiedName)?.id,
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId, stage: "module" }
      });
    }

    for (const [sourceQualifiedName, targetQualifiedName] of [
      [
        "src/java/impl/JavaQualifiedInterfaceChild.java#JavaQualifiedInterfaceChild.run",
        "src/java/api/JavaContract.java#JavaContract.run"
      ],
      [
        "src/java/impl/JavaQualifiedBaseChild.java#JavaQualifiedBaseChild.run",
        "src/java/api/JavaBase.java#JavaBase.run"
      ],
      [
        "src/kotlin/impl/KotlinQualifiedInterfaceChild.kt#KotlinQualifiedInterfaceChild.run",
        "src/kotlin/api/KotlinContract.kt#KotlinContract.run"
      ],
      [
        "src/kotlin/impl/KotlinQualifiedBaseChild.kt#KotlinQualifiedBaseChild.run",
        "src/kotlin/api/KotlinBase.kt#KotlinBase.run"
      ]
    ] as const) {
      expect(overrideEdge(sourceQualifiedName)).toMatchObject({
        targetId: symbol(targetQualifiedName)?.id,
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId: "syntax.override.explicit-direct-base-method", stage: "syntax" }
      });
    }

    expect(
      heritageEdge("src/java/impl/JavaMissingQualifiedChild.java#JavaMissingQualifiedChild", "implements")
    ).toBeUndefined();
    expect(
      heritageEdge("src/kotlin/impl/KotlinMissingQualifiedChild.kt#KotlinMissingQualifiedChild", "implements")
    ).toBeUndefined();
    expect(
      heritageEdge("src/java/impl/JavaPotentialNestedChild.java#JavaPotentialNestedChild", "implements")
    ).toBeUndefined();
    expect(
      heritageEdge("src/kotlin/impl/KotlinPotentialNestedChild.kt#KotlinPotentialNestedChild", "implements")
    ).toBeUndefined();
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

describe("TypeScript callable signature resolution", () => {
  it("resolves only proven local and imported type targets and keeps unproven names unresolved", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/contracts.ts",
        relativePath: "src/contracts.ts",
        language: "typescript",
        sourceText: [
          "export interface Input {}",
          "export type Result = { ok: boolean };",
          "export function ValueOnly() {}"
        ].join("\n"),
        contentHash: "contracts"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText:
          'export type { Input as RequestInput, Result } from "./contracts";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/service.ts",
        relativePath: "src/service.ts",
        language: "typescript",
        sourceText: [
          'import type { RequestInput, Result } from "./barrel";',
          'import { ValueOnly } from "./contracts";',
          "type LocalOptions = { trace: boolean };",
          "export function execute(input: RequestInput, options: LocalOptions, invalid: ValueOnly): Promise<Result> {",
          '  throw new Error("not implemented");',
          "}",
          "export interface Handler { handle(input: RequestInput): Result; }",
          "export class Service { constructor(input: RequestInput) {} }",
          "export const arrow = (input: RequestInput): Result => ({ ok: true });"
        ].join("\n"),
        contentHash: "service"
      },
      {
        absolutePath: "C:/project/src/unproven.ts",
        relativePath: "src/unproven.ts",
        language: "typescript",
        sourceText:
          'export function stray(input: Input): Result { throw new Error("not implemented"); }',
        contentHash: "unproven"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const signatureEdge = (
      sourceQualifiedName: string,
      kind: "accepts" | "returns",
      referenceName: string
    ) =>
      snapshot.edges.find(
        (edge) =>
          edge.sourceId === symbol(sourceQualifiedName)?.id &&
          edge.kind === kind &&
          edge.referenceName === referenceName
      );

    expect(signatureEdge("src/service.ts#execute", "accepts", "RequestInput")).toMatchObject({
      targetId: symbol("src/contracts.ts#Input")?.id,
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "signature.accepts.reexported-type", stage: "module" }
    });
    expect(signatureEdge("src/service.ts#execute", "accepts", "LocalOptions")).toMatchObject({
      targetId: symbol("src/service.ts#LocalOptions")?.id,
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "signature.accepts.local-type-binding", stage: "lexical" }
    });
    expect(signatureEdge("src/service.ts#execute", "returns", "Result")).toMatchObject({
      targetId: symbol("src/contracts.ts#Result")?.id,
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "signature.returns.reexported-type", stage: "module" }
    });
    for (const [sourceQualifiedName, kind, referenceName] of [
      ["src/service.ts#Handler.handle", "accepts", "RequestInput"],
      ["src/service.ts#Handler.handle", "returns", "Result"],
      ["src/service.ts#Service.constructor", "accepts", "RequestInput"],
      ["src/service.ts#arrow", "accepts", "RequestInput"],
      ["src/service.ts#arrow", "returns", "Result"]
    ] as const) {
      expect(signatureEdge(sourceQualifiedName, kind, referenceName)).toMatchObject({
        targetId: symbol(
          `src/contracts.ts#${referenceName === "RequestInput" ? "Input" : "Result"}`
        )?.id,
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId: `signature.${kind}.reexported-type`, stage: "module" }
      });
    }

    for (const [sourceName, kind, referenceName] of [
      ["execute", "accepts", "ValueOnly"],
      ["stray", "accepts", "Input"],
      ["stray", "returns", "Result"]
    ] as const) {
      expect(signatureEdge(`src/${sourceName === "stray" ? "unproven" : "service"}.ts#${sourceName}`, kind, referenceName)).toMatchObject({
        targetId: null,
        resolution: "unresolved",
        confidence: 0,
        evidence: { ruleId: `signature.${kind}.unresolved-type`, stage: "unresolved" }
      });
    }
  });
});

describe("direct class instantiation resolution", () => {
  it("resolves local, imported, re-exported, and JavaScript classes exactly without name guessing", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/widgets.ts",
        relativePath: "src/widgets.ts",
        language: "typescript",
        sourceText: [
          "export class ImportedWidget {}",
          "export class ReexportedWidget {}",
          "export function Factory() {}"
        ].join("\n"),
        contentHash: "widgets"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export { ReexportedWidget } from "./widgets";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/default-widget.ts",
        relativePath: "src/default-widget.ts",
        language: "typescript",
        sourceText: "export default class DefaultWidget {}",
        contentHash: "default-widget"
      },
      {
        absolutePath: "C:/project/src/consumer.ts",
        relativePath: "src/consumer.ts",
        language: "typescript",
        sourceText: [
          'import { ImportedWidget, Factory } from "./widgets";',
          'import { ReexportedWidget } from "./barrel";',
          'import DefaultWidget from "./default-widget";',
          'import type { ImportedWidget as TypeOnlyWidget } from "./widgets";',
          "class LocalWidget {}",
          "export function createLocal() { return new LocalWidget(); }",
          "export function createImported() { return new ImportedWidget(); }",
          "export function createReexported() { return new ReexportedWidget(); }",
          "export function createDefault() { return new DefaultWidget(); }",
          "export function createTypeOnly() { return new TypeOnlyWidget(); }",
          "export function createFactory() { return new Factory(); }"
        ].join("\n"),
        contentHash: "consumer"
      },
      {
        absolutePath: "C:/project/src/unproven.ts",
        relativePath: "src/unproven.ts",
        language: "typescript",
        sourceText: "export function createUnproven() { return new ImportedWidget(); }",
        contentHash: "unproven"
      },
      {
        absolutePath: "C:/project/src/js-widget.js",
        relativePath: "src/js-widget.js",
        language: "javascript",
        sourceText: "export class JavaScriptWidget {}",
        contentHash: "js-widget"
      },
      {
        absolutePath: "C:/project/src/js-consumer.js",
        relativePath: "src/js-consumer.js",
        language: "javascript",
        sourceText:
          'import { JavaScriptWidget } from "./js-widget.js"; export function createJavaScript() { return new JavaScriptWidget(); }',
        contentHash: "js-consumer"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const instantiationEdge = (sourceQualifiedName: string, referenceName: string) =>
      snapshot.edges.find(
        (edge) =>
          edge.sourceId === symbol(sourceQualifiedName)?.id &&
          edge.kind === "instantiates" &&
          edge.referenceName === referenceName
      );

    expect(instantiationEdge("src/consumer.ts#createLocal", "LocalWidget")).toMatchObject({
      targetId: symbol("src/consumer.ts#LocalWidget")?.id,
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "syntax.new-expression.local-class-binding", stage: "lexical" }
    });
    expect(instantiationEdge("src/consumer.ts#createImported", "ImportedWidget")).toMatchObject({
      targetId: symbol("src/widgets.ts#ImportedWidget")?.id,
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "syntax.new-expression.imported-class-target", stage: "module" }
    });
    expect(instantiationEdge("src/consumer.ts#createReexported", "ReexportedWidget")).toMatchObject({
      targetId: symbol("src/widgets.ts#ReexportedWidget")?.id,
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "syntax.new-expression.reexported-class-target", stage: "module" }
    });
    expect(instantiationEdge("src/consumer.ts#createDefault", "DefaultWidget")).toMatchObject({
      targetId: symbol("src/default-widget.ts#DefaultWidget")?.id,
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "syntax.new-expression.imported-class-target", stage: "module" }
    });
    expect(instantiationEdge("src/js-consumer.js#createJavaScript", "JavaScriptWidget")).toMatchObject({
      targetId: symbol("src/js-widget.js#JavaScriptWidget")?.id,
      resolution: "exact",
      confidence: 1,
      evidence: { ruleId: "syntax.new-expression.imported-class-target", stage: "module" }
    });

    for (const [sourceQualifiedName, referenceName] of [
      ["src/consumer.ts#createFactory", "Factory"],
      ["src/consumer.ts#createTypeOnly", "TypeOnlyWidget"],
      ["src/unproven.ts#createUnproven", "ImportedWidget"]
    ] as const) {
      expect(instantiationEdge(sourceQualifiedName, referenceName)).toMatchObject({
        targetId: null,
        resolution: "unresolved",
        confidence: 0,
        evidence: { ruleId: "syntax.new-expression.unresolved-class-target", stage: "unresolved" }
      });
    }
    expect(
      snapshot.pendingReferences
        .filter((reference) => reference.relationKind === "instantiates")
        .map((reference) => reference.referenceName)
        .sort()
    ).toEqual(["Factory", "ImportedWidget", "TypeOnlyWidget"]);
  });
});

describe("explicit TypeScript override resolution", () => {
  it("resolves only a unique method on an exactly resolved direct parent class", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/base.ts",
        relativePath: "src/base.ts",
        language: "typescript",
        sourceText: [
          "export class ImportedBase { run(): string { return \"base\"; } }",
          "export class ReexportedBase { render(): string { return \"base\"; } }",
          "export class AmbiguousBase {",
          "  run(value: string): string;",
          "  run(value: number): string;",
          "  run(value: string | number): string { return String(value); }",
          "}"
        ].join("\n"),
        contentHash: "base"
      },
      {
        absolutePath: "C:/project/src/barrel.ts",
        relativePath: "src/barrel.ts",
        language: "typescript",
        sourceText: 'export { ReexportedBase } from "./base";',
        contentHash: "barrel"
      },
      {
        absolutePath: "C:/project/src/children.ts",
        relativePath: "src/children.ts",
        language: "typescript",
        sourceText: [
          'import { ImportedBase } from "./base";',
          'import { AmbiguousBase } from "./base";',
          'import { ReexportedBase } from "./barrel";',
          "export class LocalBase { localRun(): string { return \"base\"; } }",
          "export class LocalChild extends LocalBase { override localRun(): string { return \"child\"; } }",
          "export class ImportedChild extends ImportedBase { override run(): string { return \"child\"; } }",
          "export class ReexportedChild extends ReexportedBase { override render(): string { return \"child\"; } }",
          "export class NoBaseMethod extends LocalBase { override missing(): string { return \"child\"; } }",
          "export class AmbiguousChild extends AmbiguousBase { override run(value: string | number): string { return String(value); } }",
          "export class UnmarkedChild extends LocalBase { localRun(): string { return \"child\"; } }"
        ].join("\n"),
        contentHash: "children"
      },
      {
        absolutePath: "C:/project/src/unproven.ts",
        relativePath: "src/unproven.ts",
        language: "typescript",
        sourceText:
          'export class UnprovenChild extends MissingBase { override run(): string { return "child"; } }',
        contentHash: "unproven"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const overrideEdge = (sourceQualifiedName: string, referenceName: string) =>
      snapshot.edges.find(
        (edge) =>
          edge.sourceId === symbol(sourceQualifiedName)?.id &&
          edge.kind === "overrides" &&
          edge.referenceName === referenceName
      );

    for (const [sourceQualifiedName, referenceName, targetQualifiedName] of [
      ["src/children.ts#LocalChild.localRun", "localRun", "src/children.ts#LocalBase.localRun"],
      ["src/children.ts#ImportedChild.run", "run", "src/base.ts#ImportedBase.run"],
      ["src/children.ts#ReexportedChild.render", "render", "src/base.ts#ReexportedBase.render"]
    ] as const) {
      expect(overrideEdge(sourceQualifiedName, referenceName)).toMatchObject({
        targetId: symbol(targetQualifiedName)?.id,
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId: "syntax.override.explicit-direct-base-method", stage: "syntax" }
      });
    }

    for (const [sourceQualifiedName, referenceName] of [
      ["src/children.ts#NoBaseMethod.missing", "missing"],
      ["src/children.ts#AmbiguousChild.run", "run"],
      ["src/unproven.ts#UnprovenChild.run", "run"]
    ] as const) {
      expect(overrideEdge(sourceQualifiedName, referenceName)).toMatchObject({
        targetId: null,
        resolution: "unresolved",
        confidence: 0,
        evidence: { ruleId: "syntax.override.unresolved-direct-base-method", stage: "unresolved" }
      });
    }
    expect(overrideEdge("src/children.ts#UnmarkedChild.localRun", "localRun")).toBeUndefined();
    expect(
      snapshot.pendingReferences
        .filter((reference) => reference.relationKind === "overrides")
        .map((reference) => reference.referenceName)
        .sort()
    ).toEqual(["missing", "run", "run"]);
  });
});

describe("explicit Java and Kotlin override resolution", () => {
  it("resolves only same-file direct class or interface methods and leaves external or ambiguous bases unresolved", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/JavaOverrides.java",
        relativePath: "src/JavaOverrides.java",
        language: "java",
        sourceText: [
          "class JavaBase { void run() {} }",
          "class JavaChild extends JavaBase { @Override void run() {} }"
        ].join("\n"),
        contentHash: "java-overrides"
      },
      {
        absolutePath: "C:/project/src/KotlinOverrides.kt",
        relativePath: "src/KotlinOverrides.kt",
        language: "kotlin",
        sourceText: [
          "abstract class KotlinBase { abstract fun run() }",
          "class KotlinChild : KotlinBase() { override fun run() {} }"
        ].join("\n"),
        contentHash: "kotlin-overrides"
      },
      {
        absolutePath: "C:/project/src/ExternalOverrides.java",
        relativePath: "src/ExternalOverrides.java",
        language: "java",
        sourceText: "class JavaExternal extends MissingBase { @Override void run() {} }",
        contentHash: "java-external"
      },
      {
        absolutePath: "C:/project/src/ExternalOverrides.kt",
        relativePath: "src/ExternalOverrides.kt",
        language: "kotlin",
        sourceText: "class KotlinExternal : MissingBase() { override fun run() {} }",
        contentHash: "kotlin-external"
      },
      {
        absolutePath: "C:/project/src/InterfaceOverrides.java",
        relativePath: "src/InterfaceOverrides.java",
        language: "java",
        sourceText: [
          "interface JavaContract { void run(); }",
          "class JavaInterfaceChild implements JavaContract { @Override public void run() {} }"
        ].join("\n"),
        contentHash: "java-interface"
      },
      {
        absolutePath: "C:/project/src/InterfaceOverrides.kt",
        relativePath: "src/InterfaceOverrides.kt",
        language: "kotlin",
        sourceText: [
          "interface KotlinContract { fun run() }",
          "class KotlinInterfaceChild : KotlinContract { override fun run() {} }"
        ].join("\n"),
        contentHash: "kotlin-interface"
      },
      {
        absolutePath: "C:/project/src/AmbiguousInterfaceOverrides.java",
        relativePath: "src/AmbiguousInterfaceOverrides.java",
        language: "java",
        sourceText: [
          "interface FirstJavaContract { void run(); }",
          "interface SecondJavaContract { void run(); }",
          "class JavaAmbiguous implements FirstJavaContract, SecondJavaContract { @Override public void run() {} }"
        ].join("\n"),
        contentHash: "java-ambiguous-interface"
      },
      {
        absolutePath: "C:/project/src/AmbiguousInterfaceOverrides.kt",
        relativePath: "src/AmbiguousInterfaceOverrides.kt",
        language: "kotlin",
        sourceText: [
          "interface FirstKotlinContract { fun run() }",
          "interface SecondKotlinContract { fun run() }",
          "class KotlinAmbiguous : FirstKotlinContract, SecondKotlinContract { override fun run() {} }"
        ].join("\n"),
        contentHash: "kotlin-ambiguous-interface"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const overrideEdge = (sourceQualifiedName: string) =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === "overrides"
      );

    for (const [sourceQualifiedName, targetQualifiedName] of [
      ["src/JavaOverrides.java#JavaChild.run", "src/JavaOverrides.java#JavaBase.run"],
      ["src/KotlinOverrides.kt#KotlinChild.run", "src/KotlinOverrides.kt#KotlinBase.run"],
      ["src/InterfaceOverrides.java#JavaInterfaceChild.run", "src/InterfaceOverrides.java#JavaContract.run"],
      ["src/InterfaceOverrides.kt#KotlinInterfaceChild.run", "src/InterfaceOverrides.kt#KotlinContract.run"]
    ] as const) {
      expect(overrideEdge(sourceQualifiedName)).toMatchObject({
        targetId: symbol(targetQualifiedName)?.id,
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId: "syntax.override.explicit-direct-base-method", stage: "syntax" }
      });
    }

    for (const sourceQualifiedName of [
      "src/ExternalOverrides.java#JavaExternal.run",
      "src/ExternalOverrides.kt#KotlinExternal.run",
      "src/AmbiguousInterfaceOverrides.java#JavaAmbiguous.run",
      "src/AmbiguousInterfaceOverrides.kt#KotlinAmbiguous.run"
    ]) {
      expect(overrideEdge(sourceQualifiedName)).toMatchObject({
        targetId: null,
        resolution: "unresolved",
        confidence: 0,
        evidence: { ruleId: "syntax.override.unresolved-direct-base-method", stage: "unresolved" }
      });
    }
    expect(
      snapshot.pendingReferences
        .filter((reference) => reference.relationKind === "overrides")
        .map((reference) => reference.filePath)
    ).toEqual([
      "src/AmbiguousInterfaceOverrides.java",
      "src/AmbiguousInterfaceOverrides.kt",
      "src/ExternalOverrides.java",
      "src/ExternalOverrides.kt"
    ]);
  });
});

describe("exact Java object-creation resolution", () => {
  it("projects imported, qualified, and same-package constructions without simple-name guessing", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/api/Widget.java",
        relativePath: "src/api/Widget.java",
        language: "java",
        sourceText: "package api; public class Widget {}",
        contentHash: "api-widget"
      },
      {
        absolutePath: "C:/project/src/other/Widget.java",
        relativePath: "src/other/Widget.java",
        language: "java",
        sourceText: "package other; public class Widget {}",
        contentHash: "other-widget"
      },
      {
        absolutePath: "C:/project/src/app/LocalWidget.java",
        relativePath: "src/app/LocalWidget.java",
        language: "java",
        sourceText: "package app; class LocalWidget {}",
        contentHash: "local-widget"
      },
      {
        absolutePath: "C:/project/src/app/Consumer.java",
        relativePath: "src/app/Consumer.java",
        language: "java",
        sourceText: [
          "package app;",
          "import api.Widget;",
          "class Consumer {",
          "  void imported() { new Widget(); }",
          "  void qualified() { new api.Widget(); }",
          "  void local() { new LocalWidget(); }",
          "}"
        ].join("\n"),
        contentHash: "consumer"
      },
      {
        absolutePath: "C:/project/src/app/Wildcard.java",
        relativePath: "src/app/Wildcard.java",
        language: "java",
        sourceText: "package app; import api.*; class Wildcard { void create() { new Widget(); } }",
        contentHash: "wildcard"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          sourceText: document.sourceText,
          language: "java"
        })
      ),
      indexedAt: "2026-08-16T00:00:00.000Z",
      jvmProjectModuleEvidence: {
        memberships: ["src/app/Consumer.java", "src/app/LocalWidget.java"].flatMap((filePath) => [
          {
            filePath,
            moduleId: "gradle:build.gradle",
            sourceSet: "main" as const,
            configurationPaths: ["build.gradle", "settings.gradle"]
          },
          {
            filePath,
            moduleId: "maven:pom.xml",
            sourceSet: "main" as const,
            configurationPaths: ["pom.xml"]
          }
        ])
      }
    });
    const target = snapshot.symbols.find(
      (symbol) => symbol.qualifiedName === "src/api/Widget.java#Widget"
    );
    const edges = snapshot.edges.filter((edge) => edge.kind === "instantiates");

    expect(edges).toHaveLength(3);
    expect(edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetId: target?.id,
        referenceName: "Widget",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "syntax.java.object-creation.explicit-import",
          candidateSymbolIds: [target?.id]
        })
      }),
      expect.objectContaining({
        targetId: target?.id,
        referenceName: "Widget",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "syntax.java.object-creation.qualified-type",
          candidateSymbolIds: [target?.id]
        })
      }),
      expect.objectContaining({
        referenceName: "LocalWidget",
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({
          ruleId: "syntax.java.object-creation.same-package",
          configurationPaths: ["build.gradle", "settings.gradle", "pom.xml"]
        })
      })
    ]));
    expect(edges.some((edge) => edge.filePath === "src/app/Wildcard.java")).toBe(false);
  });
});

describe("exact JVM cross-file heritage resolution", () => {
  it("projects direct imported and same-package Java/Kotlin parents, but rejects wildcard and aliased imports", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/java/api/JavaContract.java",
        relativePath: "src/java/api/JavaContract.java",
        language: "java",
        sourceText: [
          "package example.java.api;",
          "public interface JavaContract { void run(); }"
        ].join("\n"),
        contentHash: "java-contract"
      },
      {
        absolutePath: "C:/project/src/java/impl/JavaImportedChild.java",
        relativePath: "src/java/impl/JavaImportedChild.java",
        language: "java",
        sourceText: [
          "package example.java.impl;",
          "import example.java.api.JavaContract;",
          "public class JavaImportedChild implements JavaContract { @Override public void run() {} }"
        ].join("\n"),
        contentHash: "java-imported-child"
      },
      {
        absolutePath: "C:/project/src/java/impl/JavaImportedInterface.java",
        relativePath: "src/java/impl/JavaImportedInterface.java",
        language: "java",
        sourceText: [
          "package example.java.impl;",
          "import example.java.api.JavaContract;",
          "public interface JavaImportedInterface extends JavaContract {}"
        ].join("\n"),
        contentHash: "java-imported-interface"
      },
      {
        absolutePath: "C:/project/src/java/shared/JavaBase.java",
        relativePath: "src/java/shared/JavaBase.java",
        language: "java",
        sourceText: [
          "package example.java.shared;",
          "public class JavaBase { void run() {} }"
        ].join("\n"),
        contentHash: "java-same-package-base"
      },
      {
        absolutePath: "C:/project/src/java/shared/JavaSamePackageChild.java",
        relativePath: "src/java/shared/JavaSamePackageChild.java",
        language: "java",
        sourceText: [
          "package example.java.shared;",
          "public class JavaSamePackageChild extends JavaBase { @Override void run() {} }"
        ].join("\n"),
        contentHash: "java-same-package-child"
      },
      {
        absolutePath: "C:/project/src/java/impl/JavaWildcardChild.java",
        relativePath: "src/java/impl/JavaWildcardChild.java",
        language: "java",
        sourceText: [
          "package example.java.impl;",
          "import example.java.api.*;",
          "public class JavaWildcardChild implements JavaContract { @Override public void run() {} }"
        ].join("\n"),
        contentHash: "java-wildcard-child"
      },
      {
        absolutePath: "C:/project/src/kotlin/api/KotlinContract.kt",
        relativePath: "src/kotlin/api/KotlinContract.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.api",
          "interface KotlinContract { fun run() }"
        ].join("\n"),
        contentHash: "kotlin-contract"
      },
      {
        absolutePath: "C:/project/src/kotlin/impl/KotlinImportedChild.kt",
        relativePath: "src/kotlin/impl/KotlinImportedChild.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.impl",
          "import example.kotlin.api.KotlinContract",
          "class KotlinImportedChild : KotlinContract { override fun run() {} }"
        ].join("\n"),
        contentHash: "kotlin-imported-child"
      },
      {
        absolutePath: "C:/project/src/kotlin/impl/KotlinImportedInterface.kt",
        relativePath: "src/kotlin/impl/KotlinImportedInterface.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.impl",
          "import example.kotlin.api.KotlinContract",
          "interface KotlinImportedInterface : KotlinContract"
        ].join("\n"),
        contentHash: "kotlin-imported-interface"
      },
      {
        absolutePath: "C:/project/src/kotlin/shared/KotlinBase.kt",
        relativePath: "src/kotlin/shared/KotlinBase.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.shared",
          "abstract class KotlinBase { abstract fun run() }"
        ].join("\n"),
        contentHash: "kotlin-same-package-base"
      },
      {
        absolutePath: "C:/project/src/kotlin/shared/KotlinSamePackageChild.kt",
        relativePath: "src/kotlin/shared/KotlinSamePackageChild.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.shared",
          "class KotlinSamePackageChild : KotlinBase() { override fun run() {} }"
        ].join("\n"),
        contentHash: "kotlin-same-package-child"
      },
      {
        absolutePath: "C:/project/src/kotlin/impl/KotlinAliasChild.kt",
        relativePath: "src/kotlin/impl/KotlinAliasChild.kt",
        language: "kotlin",
        sourceText: [
          "package example.kotlin.impl",
          "import example.kotlin.api.KotlinContract as ImportedContract",
          "class KotlinAliasChild : ImportedContract { override fun run() {} }"
        ].join("\n"),
        contentHash: "kotlin-alias-child"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const heritageEdge = (sourceQualifiedName: string, kind: "extends" | "implements") =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === kind
      );
    const overrideEdge = (sourceQualifiedName: string) =>
      snapshot.edges.find(
        (edge) => edge.sourceId === symbol(sourceQualifiedName)?.id && edge.kind === "overrides"
      );

    for (const [
      sourceQualifiedName,
      targetQualifiedName,
      kind,
      ruleId
    ] of [
      [
        "src/java/impl/JavaImportedChild.java#JavaImportedChild",
        "src/java/api/JavaContract.java#JavaContract",
        "implements",
        "syntax.jvm.cross-file.explicit-import.direct-implements"
      ],
      [
        "src/java/impl/JavaImportedInterface.java#JavaImportedInterface",
        "src/java/api/JavaContract.java#JavaContract",
        "extends",
        "syntax.jvm.cross-file.explicit-import.direct-interface-extends"
      ],
      [
        "src/java/shared/JavaSamePackageChild.java#JavaSamePackageChild",
        "src/java/shared/JavaBase.java#JavaBase",
        "extends",
        "syntax.jvm.cross-file.same-package.direct-superclass"
      ],
      [
        "src/kotlin/impl/KotlinImportedChild.kt#KotlinImportedChild",
        "src/kotlin/api/KotlinContract.kt#KotlinContract",
        "implements",
        "syntax.jvm.cross-file.explicit-import.direct-implements"
      ],
      [
        "src/kotlin/impl/KotlinImportedInterface.kt#KotlinImportedInterface",
        "src/kotlin/api/KotlinContract.kt#KotlinContract",
        "extends",
        "syntax.jvm.cross-file.explicit-import.direct-interface-extends"
      ],
      [
        "src/kotlin/shared/KotlinSamePackageChild.kt#KotlinSamePackageChild",
        "src/kotlin/shared/KotlinBase.kt#KotlinBase",
        "extends",
        "syntax.jvm.cross-file.same-package.direct-superclass"
      ]
    ] as const) {
      expect(heritageEdge(sourceQualifiedName, kind)).toMatchObject({
        targetId: symbol(targetQualifiedName)?.id,
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId, stage: "module" }
      });
    }

    for (const [sourceQualifiedName, targetQualifiedName] of [
      [
        "src/java/impl/JavaImportedChild.java#JavaImportedChild.run",
        "src/java/api/JavaContract.java#JavaContract.run"
      ],
      [
        "src/java/shared/JavaSamePackageChild.java#JavaSamePackageChild.run",
        "src/java/shared/JavaBase.java#JavaBase.run"
      ],
      [
        "src/kotlin/impl/KotlinImportedChild.kt#KotlinImportedChild.run",
        "src/kotlin/api/KotlinContract.kt#KotlinContract.run"
      ],
      [
        "src/kotlin/shared/KotlinSamePackageChild.kt#KotlinSamePackageChild.run",
        "src/kotlin/shared/KotlinBase.kt#KotlinBase.run"
      ]
    ] as const) {
      expect(overrideEdge(sourceQualifiedName)).toMatchObject({
        targetId: symbol(targetQualifiedName)?.id,
        resolution: "exact",
        confidence: 1,
        evidence: { ruleId: "syntax.override.explicit-direct-base-method", stage: "syntax" }
      });
    }

    expect(
      heritageEdge("src/java/impl/JavaWildcardChild.java#JavaWildcardChild", "implements")
    ).toBeUndefined();
    expect(heritageEdge("src/kotlin/impl/KotlinAliasChild.kt#KotlinAliasChild", "implements")).toBeUndefined();
    for (const sourceQualifiedName of [
      "src/java/impl/JavaWildcardChild.java#JavaWildcardChild.run",
      "src/kotlin/impl/KotlinAliasChild.kt#KotlinAliasChild.run"
    ]) {
      expect(overrideEdge(sourceQualifiedName)).toMatchObject({
        targetId: null,
        resolution: "unresolved",
        confidence: 0,
        evidence: { ruleId: "syntax.override.unresolved-direct-base-method", stage: "unresolved" }
      });
    }
  });
});

describe("JVM module-aware same-package heritage resolution", () => {
  it("keeps same-package parents inside one visible Maven source set while preserving explicit imports", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/api/src/main/java/example/shared/Shared.java",
        relativePath: "api/src/main/java/example/shared/Shared.java",
        language: "java",
        sourceText: "package example.shared; public interface Shared { void run(); }\n",
        contentHash: "shared"
      },
      {
        absolutePath: "C:/project/app/src/main/java/example/shared/CrossModuleChild.java",
        relativePath: "app/src/main/java/example/shared/CrossModuleChild.java",
        language: "java",
        sourceText: "package example.shared; public class CrossModuleChild implements Shared { public void run() {} }\n",
        contentHash: "cross-module-child"
      },
      {
        absolutePath: "C:/project/api/src/main/java/example/api/ImportedContract.java",
        relativePath: "api/src/main/java/example/api/ImportedContract.java",
        language: "java",
        sourceText: "package example.api; public interface ImportedContract {}\n",
        contentHash: "imported-contract"
      },
      {
        absolutePath: "C:/project/app/src/main/java/example/app/ImportedChild.java",
        relativePath: "app/src/main/java/example/app/ImportedChild.java",
        language: "java",
        sourceText: [
          "package example.app;",
          "import example.api.ImportedContract;",
          "public class ImportedChild implements ImportedContract {}"
        ].join("\n"),
        contentHash: "imported-child"
      },
      {
        absolutePath: "C:/project/api/src/main/java/example/local/MainBase.java",
        relativePath: "api/src/main/java/example/local/MainBase.java",
        language: "java",
        sourceText: "package example.local; public class MainBase {}\n",
        contentHash: "main-base"
      },
      {
        absolutePath: "C:/project/api/src/test/java/example/local/TestChild.java",
        relativePath: "api/src/test/java/example/local/TestChild.java",
        language: "java",
        sourceText: "package example.local; public class TestChild extends MainBase {}\n",
        contentHash: "test-child"
      },
      {
        absolutePath: "C:/project/api/src/test/java/example/local/TestBase.java",
        relativePath: "api/src/test/java/example/local/TestBase.java",
        language: "java",
        sourceText: "package example.local; public class TestBase {}\n",
        contentHash: "test-base"
      },
      {
        absolutePath: "C:/project/api/src/main/java/example/local/MainChild.java",
        relativePath: "api/src/main/java/example/local/MainChild.java",
        language: "java",
        sourceText: "package example.local; public class MainChild extends TestBase {}\n",
        contentHash: "main-child"
      }
    ];
    const configurationPaths = ["api/pom.xml", "pom.xml"];
    const memberships = sourceDocuments.map((document) => ({
      filePath: document.relativePath,
      moduleId: document.relativePath.startsWith("api/") ? "maven:api/pom.xml" : "maven:app/pom.xml",
      sourceSet: document.relativePath.includes("/src/test/") ? ("test" as const) : ("main" as const),
      configurationPaths:
        document.relativePath.startsWith("api/") ? configurationPaths : ["app/pom.xml", "pom.xml"]
    }));
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-03T00:00:00.000Z",
      jvmProjectModuleEvidence: { memberships }
    });
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const extendsEdge = (qualifiedName: string) =>
      snapshot.edges.find((edge) => edge.sourceId === symbol(qualifiedName)?.id && edge.kind === "extends");
    const implementsEdge = (qualifiedName: string) =>
      snapshot.edges.find((edge) => edge.sourceId === symbol(qualifiedName)?.id && edge.kind === "implements");

    expect(implementsEdge("app/src/main/java/example/shared/CrossModuleChild.java#CrossModuleChild")).toBeUndefined();
    expect(extendsEdge("api/src/main/java/example/local/MainChild.java#MainChild")).toBeUndefined();
    expect(implementsEdge("app/src/main/java/example/app/ImportedChild.java#ImportedChild")).toMatchObject({
      targetId: symbol("api/src/main/java/example/api/ImportedContract.java#ImportedContract")?.id,
      resolution: "exact",
      evidence: {
        ruleId: "syntax.jvm.cross-file.explicit-import.direct-implements"
      }
    });
    expect(
      implementsEdge("app/src/main/java/example/app/ImportedChild.java#ImportedChild")?.evidence
    ).not.toHaveProperty("configurationPaths");
    expect(extendsEdge("api/src/test/java/example/local/TestChild.java#TestChild")).toMatchObject({
      targetId: symbol("api/src/main/java/example/local/MainBase.java#MainBase")?.id,
      resolution: "exact",
      evidence: {
        ruleId: "syntax.jvm.cross-file.same-package.direct-superclass",
        configurationPaths
      }
    });
  });

  it("adds direct Gradle project dependency evidence to imported and qualified parents", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/api/src/main/java/example/api/Contract.java",
        relativePath: "api/src/main/java/example/api/Contract.java",
        language: "java",
        sourceText: "package example.api; public interface Contract {}\n",
        contentHash: "contract"
      },
      {
        absolutePath: "C:/project/app/src/main/java/example/app/ImportedChild.java",
        relativePath: "app/src/main/java/example/app/ImportedChild.java",
        language: "java",
        sourceText: [
          "package example.app;",
          "import example.api.Contract;",
          "public class ImportedChild implements Contract {}"
        ].join("\n"),
        contentHash: "imported-child"
      },
      {
        absolutePath: "C:/project/app/src/test/java/example/app/QualifiedTestChild.java",
        relativePath: "app/src/test/java/example/app/QualifiedTestChild.java",
        language: "java",
        sourceText:
          "package example.app; public class QualifiedTestChild implements example.api.Contract {}\n",
        contentHash: "qualified-test-child"
      }
    ];
    const configurationPaths = ["api/build.gradle.kts", "app/build.gradle.kts", "settings.gradle.kts"];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-03T00:00:00.000Z",
      jvmProjectModuleEvidence: {
        memberships: [
          {
            filePath: "api/src/main/java/example/api/Contract.java",
            moduleId: "gradle:api/build.gradle.kts",
            sourceSet: "main",
            configurationPaths
          },
          {
            filePath: "app/src/main/java/example/app/ImportedChild.java",
            moduleId: "gradle:app/build.gradle.kts",
            sourceSet: "main",
            configurationPaths
          },
          {
            filePath: "app/src/test/java/example/app/QualifiedTestChild.java",
            moduleId: "gradle:app/build.gradle.kts",
            sourceSet: "test",
            configurationPaths
          }
        ],
        dependencies: [
          {
            sourceModuleId: "gradle:app/build.gradle.kts",
            targetModuleId: "gradle:api/build.gradle.kts",
            consumerSourceSet: "main",
            kind: "gradle-project",
            configurationPaths
          },
          {
            sourceModuleId: "gradle:app/build.gradle.kts",
            targetModuleId: "gradle:api/build.gradle.kts",
            consumerSourceSet: "test",
            kind: "gradle-project",
            configurationPaths
          }
        ]
      }
    });
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const implementsEdge = (qualifiedName: string) =>
      snapshot.edges.find((edge) => edge.sourceId === symbol(qualifiedName)?.id && edge.kind === "implements");

    expect(implementsEdge("app/src/main/java/example/app/ImportedChild.java#ImportedChild")).toMatchObject({
      targetId: symbol("api/src/main/java/example/api/Contract.java#Contract")?.id,
      resolution: "exact",
      evidence: {
        ruleId: "syntax.jvm.cross-file.explicit-import.declared-gradle-project.direct-implements",
        configurationPaths
      }
    });
    expect(
      implementsEdge("app/src/test/java/example/app/QualifiedTestChild.java#QualifiedTestChild")
    ).toMatchObject({
      targetId: symbol("api/src/main/java/example/api/Contract.java#Contract")?.id,
      resolution: "exact",
      evidence: {
        ruleId: "syntax.jvm.cross-file.qualified-type.declared-gradle-project.direct-implements",
        configurationPaths
      }
    });
  });

  it("adds direct Maven module dependency evidence to an imported parent", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/api/src/main/java/example/api/Contract.java",
        relativePath: "api/src/main/java/example/api/Contract.java",
        language: "java",
        sourceText: "package example.api; public interface Contract {}\n",
        contentHash: "contract"
      },
      {
        absolutePath: "C:/project/app/src/main/java/example/app/ImportedChild.java",
        relativePath: "app/src/main/java/example/app/ImportedChild.java",
        language: "java",
        sourceText: [
          "package example.app;",
          "import example.api.Contract;",
          "public class ImportedChild implements Contract {}"
        ].join("\n"),
        contentHash: "imported-child"
      }
    ];
    const configurationPaths = ["api/pom.xml", "app/pom.xml", "pom.xml"];
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) =>
        extractFileFacts({
          filePath: document.relativePath,
          language: document.language,
          sourceText: document.sourceText
        })
      ),
      indexedAt: "2026-08-03T00:00:00.000Z",
      jvmProjectModuleEvidence: {
        memberships: [
          {
            filePath: "api/src/main/java/example/api/Contract.java",
            moduleId: "maven:api/pom.xml",
            sourceSet: "main",
            configurationPaths
          },
          {
            filePath: "app/src/main/java/example/app/ImportedChild.java",
            moduleId: "maven:app/pom.xml",
            sourceSet: "main",
            configurationPaths
          }
        ],
        dependencies: [
          {
            sourceModuleId: "maven:app/pom.xml",
            targetModuleId: "maven:api/pom.xml",
            consumerSourceSet: "main",
            kind: "maven-module",
            configurationPaths
          }
        ]
      }
    });
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const implementsEdge = snapshot.edges.find(
      (edge) =>
        edge.sourceId === symbol("app/src/main/java/example/app/ImportedChild.java#ImportedChild")?.id &&
        edge.kind === "implements"
    );

    expect(implementsEdge).toMatchObject({
      targetId: symbol("api/src/main/java/example/api/Contract.java#Contract")?.id,
      resolution: "exact",
      evidence: {
        ruleId: "syntax.jvm.cross-file.explicit-import.declared-maven-module.direct-implements",
        configurationPaths
      }
    });
  });
});

describe("exact Java import and annotation type resolution", () => {
  it("projects unique project types and fails closed for external and ambiguous targets", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/src/api/Marker.java",
        relativePath: "src/api/Marker.java",
        language: "java",
        sourceText: "package api; public @interface Marker {}\n",
        contentHash: "marker"
      },
      {
        absolutePath: "C:/project/src/app/LocalTag.java",
        relativePath: "src/app/LocalTag.java",
        language: "java",
        sourceText: "package app; public @interface LocalTag {}\n",
        contentHash: "local-tag"
      },
      {
        absolutePath: "C:/project/src/app/Consumer.java",
        relativePath: "src/app/Consumer.java",
        language: "java",
        sourceText: [
          "package app;",
          "import api.Marker;",
          "import java.lang.Deprecated;",
          "@Marker class Consumer {",
          "  @LocalTag @api.Marker @Deprecated void run() {}",
          "}"
        ].join("\n"),
        contentHash: "consumer"
      },
      {
        absolutePath: "C:/project/duplicate-a/api/Ambiguous.java",
        relativePath: "duplicate-a/api/Ambiguous.java",
        language: "java",
        sourceText: "package duplicate.api; public @interface Ambiguous {}\n",
        contentHash: "ambiguous-a"
      },
      {
        absolutePath: "C:/project/duplicate-b/api/Ambiguous.java",
        relativePath: "duplicate-b/api/Ambiguous.java",
        language: "java",
        sourceText: "package duplicate.api; public @interface Ambiguous {}\n",
        contentHash: "ambiguous-b"
      },
      {
        absolutePath: "C:/project/src/app/AmbiguousConsumer.java",
        relativePath: "src/app/AmbiguousConsumer.java",
        language: "java",
        sourceText: [
          "package app;",
          "import duplicate.api.Ambiguous;",
          "@Ambiguous class AmbiguousConsumer {}"
        ].join("\n"),
        contentHash: "ambiguous-consumer"
      }
    ];
    const snapshot = snapshotWithResolver(sourceDocuments, undefined);
    const symbol = (qualifiedName: string) =>
      snapshot.symbols.find((candidate) => candidate.qualifiedName === qualifiedName);
    const consumerFile = symbol("src/app/Consumer.java");
    const consumer = symbol("src/app/Consumer.java#Consumer");
    const run = symbol("src/app/Consumer.java#Consumer.run");
    const marker = symbol("src/api/Marker.java#Marker");
    const localTag = symbol("src/app/LocalTag.java#LocalTag");

    expect(snapshot.edges.filter((edge) => edge.kind === "imports" && edge.sourceId === consumerFile?.id)).toEqual([
      expect.objectContaining({
        targetId: marker?.id,
        referenceName: "Marker",
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: "module.java.explicit-import.project-type",
          stage: "module",
          candidateSymbolIds: [marker?.id],
          resolutionPath: ["src/app/Consumer.java", "src/api/Marker.java"]
        }
      })
    ]);
    expect(snapshot.edges.filter((edge) => edge.kind === "references" && edge.sourceId === consumer?.id)).toEqual([
      expect.objectContaining({
        targetId: marker?.id,
        referenceName: "Marker",
        evidence: expect.objectContaining({
          ruleId: "module.java.annotation-type.explicit-import.project-type",
          candidateSymbolIds: [marker?.id]
        })
      })
    ]);
    expect(snapshot.edges.filter((edge) => edge.kind === "references" && edge.sourceId === run?.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: localTag?.id,
          referenceName: "LocalTag",
          evidence: expect.objectContaining({
            ruleId: "module.java.annotation-type.same-package.project-type",
            candidateSymbolIds: [localTag?.id]
          })
        }),
        expect.objectContaining({
          targetId: marker?.id,
          referenceName: "Marker",
          evidence: expect.objectContaining({
            ruleId: "module.java.annotation-type.qualified-type.project-type",
            candidateSymbolIds: [marker?.id]
          })
        })
      ])
    );
    expect(
      snapshot.edges.some(
        (edge) =>
          edge.sourceId === run?.id &&
          edge.kind === "references" &&
          edge.referenceName === "Deprecated"
      )
    ).toBe(false);
    const ambiguousFile = symbol("src/app/AmbiguousConsumer.java");
    const ambiguousType = symbol("src/app/AmbiguousConsumer.java#AmbiguousConsumer");
    expect(
      snapshot.edges.some(
        (edge) =>
          (edge.sourceId === ambiguousFile?.id || edge.sourceId === ambiguousType?.id) &&
          (edge.kind === "imports" || edge.kind === "references")
      )
    ).toBe(false);
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
  it("falls back to one explicit SFC paths substitution only when arbitrary extensions are enabled", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: ".",
          allowArbitraryExtensions: true,
          paths: { "~/*": ["src/*"] }
        }
      }),
      "src/consumer.ts": "export const consumer = true;",
      "src/layouts/PrimaryLayout.astro": "<slot />",
      "src/components/Notice.vue": "<template><main /></template>",
      "src/components/Navigation.svelte": "<nav />"
    });
    const configuredResolver = createTypeScriptProjectModuleResolver(project);

    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "~/layouts/PrimaryLayout.astro")).toEqual({
      targetFilePath: "src/layouts/PrimaryLayout.astro",
      strategy: "tsconfig-paths",
      configurationPaths: ["tsconfig.json"]
    });
    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "~/components/Notice.vue")).toEqual({
      targetFilePath: "src/components/Notice.vue",
      strategy: "tsconfig-paths",
      configurationPaths: ["tsconfig.json"]
    });
    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "~/components/Navigation.svelte")).toEqual({
      targetFilePath: "src/components/Navigation.svelte",
      strategy: "tsconfig-paths",
      configurationPaths: ["tsconfig.json"]
    });
    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "~/layouts/PrimaryLayout")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["tsconfig.json"]
    });
  });

  it("uses TypeScript's inherited paths base path when no baseUrl is declared", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({ extends: "./config/base.json" }),
      "config/base.json": JSON.stringify({
        compilerOptions: {
          allowArbitraryExtensions: true,
          paths: { "~/*": ["src/*"] }
        }
      }),
      "src/consumer.ts": "export const consumer = true;",
      "config/src/layouts/PrimaryLayout.astro": "<slot />",
      "src/layouts/PrimaryLayout.astro": "<main>wrong root</main>"
    });
    const configuredResolver = createTypeScriptProjectModuleResolver(project);

    expect(configuredResolver.moduleResolver.resolve("src/consumer.ts", "~/layouts/PrimaryLayout.astro")).toEqual({
      targetFilePath: "config/src/layouts/PrimaryLayout.astro",
      strategy: "tsconfig-paths",
      configurationPaths: ["tsconfig.json", "config/base.json"]
    });
  });

  it("recovers an Astro-only explicit alias from root-owned paths when Astro's external config is unavailable", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        extends: "astro/tsconfigs/strictest",
        compilerOptions: { baseUrl: ".", paths: { "~/*": ["src/*"] } }
      }),
      "astro.config.ts": "export default {};",
      "src/pages/index.astro": 'import Layout from "~/layouts/PrimaryLayout.astro";',
      "src/layouts/PrimaryLayout.astro": "<slot />"
    });
    const configuredResolver = createTypeScriptProjectModuleResolver({
      ...project,
      astroConfigurationPath: "astro.config.ts"
    });

    expect(configuredResolver.moduleResolver.resolve(
      "src/pages/index.astro",
      "~/layouts/PrimaryLayout.astro"
    )).toEqual({
      targetFilePath: "src/layouts/PrimaryLayout.astro",
      strategy: "tsconfig-paths",
      configurationPaths: ["tsconfig.json", "astro.config.ts"]
    });
  });

  it("fails closed for source-only Astro recovery without its narrow evidence", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        extends: "astro/tsconfigs/strictest",
        compilerOptions: { baseUrl: ".", paths: { "~/*": ["src/*"] } }
      }),
      "astro.config.ts": "export default {};",
      "src/pages/index.astro": 'import Layout from "~/layouts/PrimaryLayout.astro";',
      "src/consumer.ts": 'import Layout from "~/layouts/PrimaryLayout.astro";',
      "src/layouts/PrimaryLayout.astro": "<slot />",
      "src/components/Notice.vue": "<template />",
      "src/components/Navigation.svelte": "<nav />",
      "src/components/helper.ts": "export const helper = true;"
    });
    const withAstroEvidence = createTypeScriptProjectModuleResolver({
      ...project,
      astroConfigurationPath: "astro.config.ts"
    });
    const withoutAstroEvidence = createTypeScriptProjectModuleResolver(project);
    const unresolvedResult = {
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["tsconfig.json"]
    };

    expect(withoutAstroEvidence.moduleResolver.resolve(
      "src/pages/index.astro",
      "~/layouts/PrimaryLayout.astro"
    )).toEqual(unresolvedResult);
    expect(withAstroEvidence.moduleResolver.resolve(
      "src/consumer.ts",
      "~/layouts/PrimaryLayout.astro"
    )).toEqual(unresolvedResult);
    expect(withAstroEvidence.moduleResolver.resolve(
      "src/pages/index.astro",
      "~/layouts/PrimaryLayout"
    )).toEqual(unresolvedResult);
    expect(withAstroEvidence.moduleResolver.resolve(
      "src/pages/index.astro",
      "~/components/Notice.vue"
    )).toEqual(unresolvedResult);
    expect(withAstroEvidence.moduleResolver.resolve(
      "src/pages/index.astro",
      "~/components/Navigation.svelte"
    )).toEqual(unresolvedResult);
    expect(withAstroEvidence.moduleResolver.resolve(
      "src/pages/index.astro",
      "~/components/helper.ts"
    )).toEqual(unresolvedResult);

    const baseUrlOnly = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        extends: "astro/tsconfigs/strictest",
        compilerOptions: { baseUrl: "." }
      }),
      "astro.config.ts": "export default {};",
      "src/pages/index.astro": 'import Layout from "~/layouts/PrimaryLayout.astro";',
      "src/layouts/PrimaryLayout.astro": "<slot />"
    });
    expect(createTypeScriptProjectModuleResolver({
      ...baseUrlOnly,
      astroConfigurationPath: "astro.config.ts"
    }).moduleResolver.resolve("src/pages/index.astro", "~/layouts/PrimaryLayout.astro")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["tsconfig.json"]
    });

    const ambiguous = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        extends: "astro/tsconfigs/strictest",
        compilerOptions: {
          baseUrl: ".",
          paths: { "~/*": ["src/*"], "~/layouts/*": ["src/layouts/*"] }
        }
      }),
      "astro.config.ts": "export default {};",
      "src/pages/index.astro": 'import Layout from "~/layouts/PrimaryLayout.astro";',
      "src/layouts/PrimaryLayout.astro": "<slot />"
    });
    expect(createTypeScriptProjectModuleResolver({
      ...ambiguous,
      astroConfigurationPath: "astro.config.ts"
    }).moduleResolver.resolve("src/pages/index.astro", "~/layouts/PrimaryLayout.astro")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["tsconfig.json"]
    });
  });

  it("rejects source-only Astro path replacements that do not mirror their pattern star grammar", async () => {
    const wildcard = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        extends: "astro/tsconfigs/strictest",
        compilerOptions: { baseUrl: ".", paths: { "~/*": ["src/*/*"] } }
      }),
      "astro.config.ts": "export default {};",
      "src/pages/index.astro": 'import Layout from "~/layouts/PrimaryLayout.astro";',
      "src/layouts/PrimaryLayout.astro/layouts/PrimaryLayout.astro": "<slot />"
    });
    const exact = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        extends: "astro/tsconfigs/strictest",
        compilerOptions: { baseUrl: ".", paths: { "@layout.astro": ["src/*.astro"] } }
      }),
      "astro.config.ts": "export default {};",
      "src/pages/index.astro": 'import Layout from "@layout.astro";'
    });
    const syntheticTarget: SourceDocument = {
      absolutePath: resolve(exact.projectPath, "src", ".astro"),
      relativePath: "src/.astro",
      language: "astro",
      sourceText: "<slot />",
      contentHash: "test:synthetic-astro-target"
    };

    expect(createTypeScriptProjectModuleResolver({
      ...wildcard,
      astroConfigurationPath: "astro.config.ts"
    }).moduleResolver.resolve("src/pages/index.astro", "~/layouts/PrimaryLayout.astro")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["tsconfig.json"]
    });
    expect(createTypeScriptProjectModuleResolver({
      ...exact,
      sourceDocuments: [...exact.sourceDocuments, syntheticTarget],
      astroConfigurationPath: "astro.config.ts"
    }).moduleResolver.resolve("src/pages/index.astro", "@layout.astro")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["tsconfig.json"]
    });
  });

  it("does not fall back for disabled arbitrary SFC extensions or ambiguous paths patterns", async () => {
    const disabled = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "~/*": ["src/*"] }
        }
      }),
      "src/consumer.ts": "export const consumer = true;",
      "src/layouts/PrimaryLayout.astro": "<slot />"
    });
    const ambiguous = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: ".",
          allowArbitraryExtensions: true,
          paths: {
            "~/*": ["src/*"],
            "~/layouts/*": ["src/layouts/*"]
          }
        }
      }),
      "src/consumer.ts": "export const consumer = true;",
      "src/layouts/PrimaryLayout.astro": "<slot />"
    });

    expect(
      createTypeScriptProjectModuleResolver(disabled).moduleResolver.resolve(
        "src/consumer.ts",
        "~/layouts/PrimaryLayout.astro"
      )
    ).toEqual({ targetFilePath: null, strategy: "unresolved", configurationPaths: ["tsconfig.json"] });
    expect(
      createTypeScriptProjectModuleResolver(ambiguous).moduleResolver.resolve(
        "src/consumer.ts",
        "~/layouts/PrimaryLayout.astro"
      )
    ).toEqual({ targetFilePath: null, strategy: "unresolved", configurationPaths: ["tsconfig.json"] });
  });

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

  it("ignores an external extends conservatively while preserving exact relative imports", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({
        extends: "@vue/tsconfig/tsconfig.dom.json",
        compilerOptions: {
          baseUrl: ".",
          paths: { "@local/*": ["src/*"] }
        }
      }),
      "src/helper.ts": "export function helper() { return 1; }",
      "src/relative.ts": 'import { helper } from "./helper"; export const value = helper();',
      "src/alias.ts": 'import { helper } from "@local/helper"; export const value = helper();'
    });

    const configuredResolver = createTypeScriptProjectModuleResolver(project);

    expect(configuredResolver.moduleResolver.resolve("src/relative.ts", "./helper")).toEqual({
      targetFilePath: "src/helper.ts",
      strategy: "relative",
      configurationPaths: []
    });
    expect(configuredResolver.moduleResolver.resolve("src/alias.ts", "@local/helper")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["tsconfig.json"]
    });
    expect(configuredResolver.hasProjectConfigurationResolution("src/alias.ts", "@local/helper")).toBe(false);
    expect(configuredResolver.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "tsconfig", path: "tsconfig.json", state: "present" })
      ])
    );
  });

  it("ignores a missing generated local extends conservatively while tracking its absence", async () => {
    const project = await createConfiguredProject({
      "jsconfig.json": JSON.stringify({
        extends: "./.svelte-kit/tsconfig.json",
        compilerOptions: {
          baseUrl: ".",
          paths: { "$lib/*": ["src/lib/*"] }
        }
      }),
      "src/lib/helper.js": "export function helper() { return 1; }",
      "src/relative.js": 'import { helper } from "./lib/helper"; export const value = helper();',
      "src/alias.js": 'import { helper } from "$lib/helper"; export const value = helper();'
    });

    const configuredResolver = createTypeScriptProjectModuleResolver(project);

    expect(configuredResolver.moduleResolver.resolve("src/relative.js", "./lib/helper")).toEqual({
      targetFilePath: "src/lib/helper.js",
      strategy: "relative",
      configurationPaths: []
    });
    expect(configuredResolver.moduleResolver.resolve("src/alias.js", "$lib/helper")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["jsconfig.json", ".svelte-kit/tsconfig.json"]
    });
    expect(configuredResolver.hasProjectConfigurationResolution("src/alias.js", "$lib/helper")).toBe(false);
    expect(configuredResolver.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "jsconfig", path: "jsconfig.json", state: "present" }),
        expect.objectContaining({
          kind: "extends",
          path: ".svelte-kit/tsconfig.json",
          state: "absent",
          contentHash: null
        }),
        expect.objectContaining({ kind: "tsconfig", path: "tsconfig.json", state: "absent" })
      ])
    );
  });

  it("rejects an ordinary missing local extends instead of masking a configuration typo", async () => {
    const project = await createConfiguredProject({
      "tsconfig.json": JSON.stringify({ extends: "./config/typo.json" }),
      "src/index.ts": "export const value = 1;"
    });

    expect(() => createTypeScriptProjectModuleResolver(project)).toThrow(
      /cannot read project-local extends "\.\/config\/typo\.json"/u
    );
  });

  it("normalizes malformed configs into ProjectConfigurationError", async () => {
    const malformed = await createConfiguredProject({ "tsconfig.json": "{ invalid json" });

    expect(() => createTypeScriptProjectModuleResolver(malformed)).toThrow(ProjectConfigurationError);
    expect(() => createTypeScriptProjectModuleResolver(malformed)).not.toThrow(/Debug Failure/);
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
          "final class CalendarModule: NSObject {}",
          "",
          "extension CalendarModule {",
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

  it("projects a cross-file Swift extension only through one shared Xcode target", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/ios/CalendarModuleExport.m",
        relativePath: "ios/CalendarModuleExport.m",
        language: "objc",
        sourceText: [
          "#import <React/RCTBridgeModule.h>",
          "@interface RCT_EXTERN_MODULE(CalendarModule, NSObject)",
          "RCT_EXTERN_METHOD(createEvent:(NSString *)name)",
          "@end"
        ].join("\n"),
        contentHash: "cross-file-bridge"
      },
      {
        absolutePath: "C:/project/ios/CalendarModule.swift",
        relativePath: "ios/CalendarModule.swift",
        language: "swift",
        sourceText: [
          "@objc(CalendarModule)",
          "final class CalendarModule: NSObject {}"
        ].join("\n"),
        contentHash: "cross-file-type"
      },
      {
        absolutePath: "C:/project/ios/CalendarModule+Extras.swift",
        relativePath: "ios/CalendarModule+Extras.swift",
        language: "swift",
        sourceText: [
          "extension CalendarModule {",
          "  @objc(createEvent:)",
          "  func writeEvent(name: String) {}",
          "}"
        ].join("\n"),
        contentHash: "cross-file-extension"
      },
      {
        absolutePath: "C:/project/ios/OtherTargetCalendarModule.swift",
        relativePath: "ios/OtherTargetCalendarModule.swift",
        language: "swift",
        sourceText: [
          "@objc(CalendarModule)",
          "final class CalendarModule: NSObject {}"
        ].join("\n"),
        contentHash: "cross-file-other-target"
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
      indexedAt: "2026-08-02T00:00:00.000Z",
      xcodeTargetMemberships: [
        {
          filePath: "ios/CalendarModuleExport.m",
          targetId: "ios/App.xcodeproj/project.pbxproj#APP",
          configurationPath: "ios/App.xcodeproj/project.pbxproj"
        },
        {
          filePath: "ios/CalendarModule.swift",
          targetId: "ios/App.xcodeproj/project.pbxproj#APP",
          configurationPath: "ios/App.xcodeproj/project.pbxproj"
        },
        {
          filePath: "ios/CalendarModule+Extras.swift",
          targetId: "ios/App.xcodeproj/project.pbxproj#APP",
          configurationPath: "ios/App.xcodeproj/project.pbxproj"
        },
        {
          filePath: "ios/OtherTargetCalendarModule.swift",
          targetId: "ios/App.xcodeproj/project.pbxproj#OTHER",
          configurationPath: "ios/App.xcodeproj/project.pbxproj"
        }
      ]
    });
    const bridge = snapshot.symbols.find(
      (symbol) => symbol.filePath === "ios/CalendarModuleExport.m" && symbol.name === "createEvent"
    );
    const extensionMethod = snapshot.symbols.find(
      (symbol) =>
        symbol.filePath === "ios/CalendarModule+Extras.swift" && symbol.name === "writeEvent"
    );

    expect(bridge).toBeDefined();
    expect(extensionMethod).toBeDefined();
    expect(
      snapshot.edges.find(
        (edge) =>
          edge.sourceId === bridge?.id &&
          edge.referenceName === "CalendarModule.createEvent:" &&
          edge.targetId === extensionMethod?.id
      )
    ).toMatchObject({
      resolution: "exact",
      confidence: 1,
      evidence: expect.objectContaining({
        ruleId:
          "framework.react-native.swift-extern.xcode-target.explicit-objc-class-and-selector.exact-target",
        stage: "module",
        configurationPaths: ["ios/App.xcodeproj/project.pbxproj"]
      })
    });
  });

  it("keeps cross-file Swift extensions unresolved without one shared Xcode target", () => {
    const sourceDocuments: readonly SourceDocument[] = [
      {
        absolutePath: "C:/project/ios/CalendarModuleExport.m",
        relativePath: "ios/CalendarModuleExport.m",
        language: "objc",
        sourceText: [
          "#import <React/RCTBridgeModule.h>",
          "@interface RCT_EXTERN_MODULE(CalendarModule, NSObject)",
          "RCT_EXTERN_METHOD(createEvent:(NSString *)name)",
          "@end"
        ].join("\n"),
        contentHash: "unproven-cross-file-bridge"
      },
      {
        absolutePath: "C:/project/ios/CalendarModule.swift",
        relativePath: "ios/CalendarModule.swift",
        language: "swift",
        sourceText: [
          "@objc(CalendarModule)",
          "final class CalendarModule: NSObject {}"
        ].join("\n"),
        contentHash: "unproven-cross-file-type"
      },
      {
        absolutePath: "C:/project/ios/CalendarModule+Extras.swift",
        relativePath: "ios/CalendarModule+Extras.swift",
        language: "swift",
        sourceText: [
          "extension CalendarModule {",
          "  @objc(createEvent:)",
          "  func writeEvent(name: String) {}",
          "}"
        ].join("\n"),
        contentHash: "unproven-cross-file-extension"
      }
    ];
    const extractedFiles = sourceDocuments.map((document) =>
      extractFileFacts({
        filePath: document.relativePath,
        language: document.language,
        sourceText: document.sourceText
      })
    );
    const withoutTargetEvidence = resolveProjectFacts({
      sourceDocuments,
      extractedFiles,
      indexedAt: "2026-08-02T00:00:00.000Z"
    });
    const ambiguousTargetEvidence = resolveProjectFacts({
      sourceDocuments,
      extractedFiles,
      indexedAt: "2026-08-02T00:00:00.000Z",
      xcodeTargetMemberships: ["FIRST", "SECOND"].flatMap((targetName) =>
        [
          "ios/CalendarModuleExport.m",
          "ios/CalendarModule.swift",
          "ios/CalendarModule+Extras.swift"
        ].map((filePath) => ({
          filePath,
          targetId: `ios/App.xcodeproj/project.pbxproj#${targetName}`,
          configurationPath: "ios/App.xcodeproj/project.pbxproj"
        }))
      )
    });
    const extensionMethod = extractedFiles
      .flatMap((facts) => facts.symbols)
      .find(
        (symbol) =>
          symbol.filePath === "ios/CalendarModule+Extras.swift" && symbol.name === "writeEvent"
      );
    const unresolved = withoutTargetEvidence.edges.find(
      (edge) => edge.referenceName === "CalendarModule.createEvent:"
    );
    const ambiguous = ambiguousTargetEvidence.edges.find(
      (edge) => edge.referenceName === "CalendarModule.createEvent:"
    );

    expect(unresolved).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({
        ruleId:
          "framework.react-native.swift-extern.xcode-target.explicit-objc-class-and-selector.unresolved-target",
        candidateSymbolIds: [extensionMethod?.id]
      })
    });
    expect(ambiguous).toMatchObject({
      targetId: null,
      resolution: "unresolved",
      confidence: 0,
      evidence: expect.objectContaining({
        ruleId:
          "framework.react-native.swift-extern.xcode-target.explicit-objc-class-and-selector.ambiguous-target",
        candidateSymbolIds: [extensionMethod?.id],
        configurationPaths: ["ios/App.xcodeproj/project.pbxproj"]
      })
    });
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
