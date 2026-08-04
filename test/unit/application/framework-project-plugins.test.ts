import { describe, expect, it, vi } from "vitest";

import {
  createFrameworkProjectPluginRegistry,
  frameworkProjectPluginProjectVersion,
  FrameworkProjectPluginConfigurationError,
  FrameworkProjectPluginOutputError,
  requireFrameworkProjectPluginRegistry,
  type FrameworkProjectPlugin
} from "../../../src/application/index.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { PROJECT_RESOLVER_VERSION } from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/index.js";

const noopPlugin: FrameworkProjectPlugin = {
  id: "acme/project-composition",
  version: "1.0.0",
  languages: ["typescript"],
  finalize: () => null
};

function fixture(
  sources: Readonly<Record<string, string>>,
  registry: ReturnType<typeof createFrameworkProjectPluginRegistry>
) {
  const sourceDocuments: SourceDocument[] = Object.entries(sources).map(
    ([relativePath, sourceText]) => ({
      absolutePath: `C:/fixture/${relativePath}`,
      relativePath,
      language: "typescript",
      sourceText,
      contentHash: `fixture:${relativePath}:${sourceText.length}`
    })
  );
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((document) =>
      extractFileFacts({
        filePath: document.relativePath,
        sourceText: document.sourceText,
        language: document.language
      })
    ),
    indexedAt: "2026-08-04T00:00:00.000Z",
    frameworkProjectPlugins: registry
  });
}

describe("framework project plugins", () => {
  it("canonicalizes immutable registries and binds only project freshness", () => {
    const first = createFrameworkProjectPluginRegistry([
      noopPlugin,
      {
        id: "acme/cross-runtime",
        version: "2",
        languages: ["javascript", "typescript"],
        finalize: () => null
      }
    ]);
    const reordered = createFrameworkProjectPluginRegistry([
      {
        id: "acme/cross-runtime",
        version: "2",
        languages: ["typescript", "javascript"],
        finalize: () => null
      },
      noopPlugin
    ]);
    const changed = createFrameworkProjectPluginRegistry([{ ...noopPlugin, version: "1.0.1" }]);

    expect(first.fingerprint).toBe(reordered.fingerprint);
    expect(first.plugins.map((plugin) => plugin.id)).toEqual([
      "acme/cross-runtime",
      "acme/project-composition"
    ]);
    expect(frameworkProjectPluginProjectVersion(PROJECT_RESOLVER_VERSION, first)).toContain(
      first.fingerprint
    );
    expect(frameworkProjectPluginProjectVersion(PROJECT_RESOLVER_VERSION, changed)).not.toContain(
      first.fingerprint
    );
    expect(
      frameworkProjectPluginProjectVersion(
        PROJECT_RESOLVER_VERSION,
        createFrameworkProjectPluginRegistry([])
      )
    ).toBe(PROJECT_RESOLVER_VERSION);
  });

  it("rejects duplicate, unsafe, and forged registries", () => {
    expect(() => createFrameworkProjectPluginRegistry([noopPlugin, noopPlugin])).toThrow(
      FrameworkProjectPluginConfigurationError
    );
    expect(() =>
      createFrameworkProjectPluginRegistry([{ ...noopPlugin, id: "Unsafe" }])
    ).toThrow(FrameworkProjectPluginConfigurationError);
    expect(() =>
      createFrameworkProjectPluginRegistry([{ ...noopPlugin, languages: ["unknown"] as never }])
    ).toThrow(FrameworkProjectPluginConfigurationError);
    expect(() =>
      requireFrameworkProjectPluginRegistry({ plugins: [noopPlugin], fingerprint: "forged" })
    ).toThrow(FrameworkProjectPluginConfigurationError);
  });

  it("projects a cross-file reference through the host resolver with provenance", () => {
    const finalize = vi.fn<FrameworkProjectPlugin["finalize"]>((input) => {
      const caller = input.files
        .flatMap((file) => file.facts.symbols)
        .find((symbol) => symbol.name === "caller");
      expect(Object.isFrozen(input.files)).toBe(true);
      expect(Object.isFrozen(input.files[0]?.facts)).toBe(true);
      expect("sourceText" in (input.files[0] ?? {})).toBe(false);
      if (caller === undefined) return null;
      return {
        references: [
          {
            key: "caller-to-execute",
            sourceSymbolId: caller.id,
            referenceName: "execute",
            relationKind: "calls",
            range: caller.range
          }
        ]
      };
    });
    const snapshot = fixture(
      {
        "src/caller.ts": 'import { execute } from "./target";\nexport function caller() { return 1; }',
        "src/target.ts": "export function execute() { return 2; }"
      },
      createFrameworkProjectPluginRegistry([{ ...noopPlugin, finalize }])
    );
    const edge = snapshot.edges.find(
      (candidate) => candidate.kind === "calls" && candidate.referenceName === "execute"
    );

    expect(finalize).toHaveBeenCalledOnce();
    expect(edge).toMatchObject({
      resolution: "exact",
      confidence: 1,
      evidence: {
        stage: "module",
        projectPlugin: { pluginId: "acme/project-composition", pluginVersion: "1.0.0" }
      }
    });
    expect(snapshot.symbols.find((symbol) => symbol.id === edge?.targetId)?.filePath).toBe(
      "src/target.ts"
    );
  });

  it("fails before projection on mutation, unknown identities, invalid relations, or collisions", () => {
    const baseSources = {
      "src/caller.ts": "export function caller() { return 1; }",
      "src/target.ts": "export function execute() { return 2; }"
    };
    expect(() =>
      fixture(
        baseSources,
        createFrameworkProjectPluginRegistry([
          {
            ...noopPlugin,
            finalize: (input) => {
              (input.files as unknown[]).push({});
              return null;
            }
          }
        ])
      )
    ).toThrow(FrameworkProjectPluginOutputError);
    expect(() =>
      fixture(
        baseSources,
        createFrameworkProjectPluginRegistry([
          {
            ...noopPlugin,
            finalize: () => ({
              references: [
                {
                  key: "unknown",
                  sourceSymbolId: "missing",
                  referenceName: "execute",
                  relationKind: "calls",
                  range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
                }
              ]
            })
          }
        ])
      )
    ).toThrow(FrameworkProjectPluginOutputError);
    expect(() =>
      fixture(
        baseSources,
        createFrameworkProjectPluginRegistry([
          {
            ...noopPlugin,
            finalize: (input) => {
              const caller = input.files
                .flatMap((file) => file.facts.symbols)
                .find((symbol) => symbol.name === "caller")!;
              const descriptor = {
                key: "duplicate",
                sourceSymbolId: caller.id,
                referenceName: "execute",
                relationKind: "calls" as const,
                range: caller.range
              };
              return { references: [descriptor, descriptor] };
            }
          }
        ])
      )
    ).toThrow(FrameworkProjectPluginOutputError);
  });

  it("skips plugins whose languages are absent", () => {
    const finalize = vi.fn<FrameworkProjectPlugin["finalize"]>(() => null);
    fixture(
      { "src/file.ts": "export const value = 1;" },
      createFrameworkProjectPluginRegistry([
        { ...noopPlugin, languages: ["python"], finalize }
      ])
    );
    expect(finalize).not.toHaveBeenCalled();
  });
});
