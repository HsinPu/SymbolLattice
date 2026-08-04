import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { ARTIFACT_FACTS_EXTRACTOR_VERSION } from "../../../src/domain/index.js";
import {
  createFrameworkFactPluginExtractor,
  createFrameworkFactPluginRegistry,
  extractFileFacts,
  FrameworkFactPluginConfigurationError,
  FrameworkFactPluginOutputError,
  type FrameworkFactPlugin
} from "../../../src/extraction/index.js";

const sourceText = [
  'import { health } from "./handlers";',
  "const route = frameworkRoute();",
  "const event = frameworkEvent();"
].join("\n");

const plugin: FrameworkFactPlugin = {
  id: "acme/framework-facts",
  version: "1.0.0",
  languages: ["typescript"],
  extract: ({ filePath, coreFacts }) => {
    expect(Object.isFrozen(coreFacts)).toBe(true);
    expect(Object.isFrozen(coreFacts.symbols)).toBe(true);
    if (filePath !== "src/routes.ts") {
      return null;
    }
    return {
      symbols: [
        {
          key: "route.health",
          kind: "route",
          method: "GET",
          path: "/health",
          range: { start: { line: 2, column: 1 }, end: { line: 2, column: 32 } }
        },
        {
          key: "entrypoint.event",
          kind: "entrypoint",
          transport: "microservice",
          operation: "event",
          name: "health.requested",
          range: { start: { line: 3, column: 1 }, end: { line: 3, column: 32 } }
        }
      ],
      references: [
        {
          key: "route.health.handler",
          source: { kind: "plugin-symbol", key: "route.health" },
          referenceName: "health",
          relationKind: "routes",
          range: { start: { line: 2, column: 15 }, end: { line: 2, column: 30 } }
        },
        {
          key: "entrypoint.event.handler",
          source: { kind: "plugin-symbol", key: "entrypoint.event" },
          referenceName: "health",
          relationKind: "handles",
          range: { start: { line: 3, column: 15 }, end: { line: 3, column: 30 } }
        }
      ]
    };
  }
};

describe("framework fact extraction plugins", () => {
  it("canonicalizes configuration and binds plugin versions into artifact freshness", () => {
    const first = createFrameworkFactPluginRegistry([plugin]);
    const reorderedLanguages = createFrameworkFactPluginRegistry([
      { ...plugin, languages: ["typescript"] }
    ]);
    const changed = createFrameworkFactPluginRegistry([{ ...plugin, version: "1.0.1" }]);
    const extractor = createFrameworkFactPluginExtractor(extractFileFacts, first);
    const changedExtractor = createFrameworkFactPluginExtractor(extractFileFacts, changed);

    expect(first.fingerprint).toBe(reorderedLanguages.fingerprint);
    expect(extractor.version).toContain(ARTIFACT_FACTS_EXTRACTOR_VERSION);
    expect(extractor.version).toContain(first.fingerprint);
    expect(changedExtractor.version).not.toBe(extractor.version);
    expect(
      createFrameworkFactPluginExtractor(
        Object.assign(extractFileFacts, { version: "custom-extractor-v7" }),
        createFrameworkFactPluginRegistry([])
      ).version
    ).toBe("custom-extractor-v7");
  });

  it("lets the host create stable route, entrypoint, containment, and pending-reference facts", () => {
    const extractor = createFrameworkFactPluginExtractor(
      extractFileFacts,
      createFrameworkFactPluginRegistry([plugin])
    );
    const facts = extractor({ filePath: "src/routes.ts", language: "typescript", sourceText });

    const route = facts.symbols.find((symbol) => symbol.name === "GET /health");
    const entrypoint = facts.symbols.find(
      (symbol) => symbol.name === "microservice event health.requested"
    );
    expect(route).toMatchObject({ kind: "route", declarationOrdinal: 0 });
    expect(entrypoint).toMatchObject({ kind: "entrypoint", declarationOrdinal: 0 });
    expect(route?.qualifiedName).toContain("#extension:acme/framework-facts:route.health");
    expect(facts.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: route?.id,
          kind: "contains",
          resolution: "exact",
          evidence: expect.objectContaining({
            ruleId: "extension.framework-fact.acme/framework-facts@1.0.0.containment"
          })
        })
      ])
    );
    expect(facts.pendingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: route?.id,
          relationKind: "routes",
          extractionPlugin: { pluginId: "acme/framework-facts", pluginVersion: "1.0.0" }
        }),
        expect.objectContaining({
          sourceId: entrypoint?.id,
          relationKind: "handles",
          extractionPlugin: { pluginId: "acme/framework-facts", pluginVersion: "1.0.0" }
        })
      ])
    );
  });

  it("composes emitted references with built-in cross-file import resolution and preserves provenance", () => {
    const extractor = createFrameworkFactPluginExtractor(
      extractFileFacts,
      createFrameworkFactPluginRegistry([plugin])
    );
    const documents = [
      {
        absolutePath: "C:/fixture/src/routes.ts",
        relativePath: "src/routes.ts",
        language: "typescript" as const,
        sourceText,
        contentHash: "routes"
      },
      {
        absolutePath: "C:/fixture/src/handlers.ts",
        relativePath: "src/handlers.ts",
        language: "typescript" as const,
        sourceText: "export function health() { return true; }",
        contentHash: "handlers"
      }
    ];
    const snapshot = resolveProjectFacts({
      sourceDocuments: documents,
      extractedFiles: documents.map((document) => extractor({
        filePath: document.relativePath,
        language: document.language,
        sourceText: document.sourceText
      })),
      indexedAt: "2026-08-04T00:00:00.000Z"
    });

    const handler = snapshot.symbols.find(
      (symbol) => symbol.filePath === "src/handlers.ts" && symbol.name === "health"
    );
    const dispatchEdges = snapshot.edges.filter(
      (edge) => edge.kind === "routes" || edge.kind === "handles"
    );
    expect(dispatchEdges).toHaveLength(2);
    expect(dispatchEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: handler?.id,
          resolution: "exact",
          evidence: expect.objectContaining({
            extractionPlugin: { pluginId: "acme/framework-facts", pluginVersion: "1.0.0" }
          })
        })
      ])
    );
    expect(
      snapshot.pendingReferences.filter((reference) => reference.extractionPlugin !== undefined)
    ).toHaveLength(0);
  });

  it("rejects forged configuration and unsafe graph output before facts are accepted", () => {
    expect(() => createFrameworkFactPluginRegistry([plugin, plugin])).toThrow(
      FrameworkFactPluginConfigurationError
    );
    expect(() =>
      createFrameworkFactPluginExtractor(extractFileFacts, {
        plugins: [plugin],
        fingerprint: "forged"
      })
    ).toThrow(FrameworkFactPluginConfigurationError);

    const invalidPlugins: FrameworkFactPlugin[] = [
      {
        ...plugin,
        extract: () => ({
          symbols: [{
            key: "outside",
            kind: "resource",
            name: "outside",
            range: { start: { line: 99, column: 1 }, end: { line: 99, column: 2 } }
          }]
        })
      },
      {
        ...plugin,
        extract: () => ({
          symbols: [
            {
              key: "a",
              kind: "resource",
              name: "a",
              parent: { kind: "plugin-symbol", key: "b" },
              range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }
            },
            {
              key: "b",
              kind: "resource",
              name: "b",
              parent: { kind: "plugin-symbol", key: "a" },
              range: { start: { line: 1, column: 2 }, end: { line: 1, column: 3 } }
            }
          ]
        })
      },
      {
        ...plugin,
        extract: () => ({
          symbols: [{
            key: "not-route",
            kind: "resource",
            name: "not-route",
            range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }
          }],
          references: [{
            key: "bad-route-source",
            source: { kind: "plugin-symbol", key: "not-route" },
            referenceName: "health",
            relationKind: "routes",
            range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }
          }]
        })
      }
    ];

    for (const invalidPlugin of invalidPlugins) {
      const extractor = createFrameworkFactPluginExtractor(
        extractFileFacts,
        createFrameworkFactPluginRegistry([invalidPlugin])
      );
      expect(() =>
        extractor({ filePath: "src/routes.ts", language: "typescript", sourceText })
      ).toThrow(FrameworkFactPluginOutputError);
    }
  });

  it("enforces bounded plugin output", () => {
    const oversized: FrameworkFactPlugin = {
      ...plugin,
      extract: () => ({
        symbols: Array.from({ length: 257 }, (_, index) => ({
          key: `symbol-${index}`,
          kind: "resource" as const,
          name: `symbol-${index}`,
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }
        }))
      })
    };
    const extractor = createFrameworkFactPluginExtractor(
      extractFileFacts,
      createFrameworkFactPluginRegistry([oversized])
    );

    expect(() =>
      extractor({ filePath: "src/routes.ts", language: "typescript", sourceText })
    ).toThrow(FrameworkFactPluginOutputError);
  });
});
