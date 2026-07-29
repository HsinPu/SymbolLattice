import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";

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
