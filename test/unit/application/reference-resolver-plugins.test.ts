import { describe, expect, it } from "vitest";

import {
  createReferenceResolverPluginRegistry,
  referenceResolverPluginProjectVersion,
  requireReferenceResolverPluginRegistry,
  ReferenceResolverPluginConfigurationError,
  type ReferenceResolverPlugin
} from "../../../src/application/index.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { PROJECT_RESOLVER_VERSION } from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

const serviceConventionPlugin: ReferenceResolverPlugin = {
  id: "acme/service-convention",
  version: "1.0.0",
  languages: ["typescript"],
  relations: ["calls"],
  resolve: () => null
};

function resolveSources(
  sources: Readonly<Record<string, string>>,
  referenceResolverPlugins: ReturnType<typeof createReferenceResolverPluginRegistry>
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
    referenceResolverPlugins
  });
}

describe("reference resolver plugin registry", () => {
  it("canonicalizes descriptors and binds their version into project freshness", () => {
    const first = createReferenceResolverPluginRegistry([
      serviceConventionPlugin,
      {
        id: "acme/handler-convention",
        version: "2",
        languages: ["javascript", "typescript"],
        relations: ["routes", "calls"],
        resolve: () => null
      }
    ]);
    const reordered = createReferenceResolverPluginRegistry([
      {
        id: "acme/handler-convention",
        version: "2",
        languages: ["typescript", "javascript"],
        relations: ["calls", "routes"],
        resolve: () => null
      },
      serviceConventionPlugin
    ]);
    const changed = createReferenceResolverPluginRegistry([
      { ...serviceConventionPlugin, version: "1.0.1" }
    ]);

    expect(first.fingerprint).toBe(reordered.fingerprint);
    expect(first.plugins.map((plugin) => plugin.id)).toEqual([
      "acme/handler-convention",
      "acme/service-convention"
    ]);
    expect(referenceResolverPluginProjectVersion(first)).toContain(first.fingerprint);
    expect(referenceResolverPluginProjectVersion(changed)).not.toContain(first.fingerprint);
    expect(referenceResolverPluginProjectVersion(createReferenceResolverPluginRegistry([]))).toBe(
      PROJECT_RESOLVER_VERSION
    );
  });

  it("rejects unsafe, duplicate, or forged registries before indexing", () => {
    expect(() =>
      createReferenceResolverPluginRegistry([
        serviceConventionPlugin,
        serviceConventionPlugin
      ])
    ).toThrow(ReferenceResolverPluginConfigurationError);
    expect(() =>
      createReferenceResolverPluginRegistry([
        { ...serviceConventionPlugin, relations: ["contains"] as never }
      ])
    ).toThrow(ReferenceResolverPluginConfigurationError);
    expect(
      createReferenceResolverPluginRegistry([
        { ...serviceConventionPlugin, relations: ["references", "handles"] }
      ]).plugins[0]?.relations
    ).toEqual(["handles", "references"]);
    expect(() =>
      createReferenceResolverPluginRegistry([
        { ...serviceConventionPlugin, relations: ["imports"] }
      ])
    ).toThrow(ReferenceResolverPluginConfigurationError);
    expect(() =>
      createReferenceResolverPluginRegistry([
        { ...serviceConventionPlugin, version: "not valid" }
      ])
    ).toThrow(ReferenceResolverPluginConfigurationError);
    expect(() =>
      requireReferenceResolverPluginRegistry({
        plugins: [serviceConventionPlugin],
        fingerprint: "forged"
      })
    ).toThrow(ReferenceResolverPluginConfigurationError);
  });

  it("lets one plugin resolve a bounded project candidate without overstating exact proof", () => {
    const registry = createReferenceResolverPluginRegistry([
      {
        ...serviceConventionPlugin,
        resolve: (input) => {
          const selected = input.projectCandidates.find(
            (candidate) => candidate.symbol.filePath === "src/preferred.ts"
          );
          return selected === undefined
            ? null
            : {
                targetSymbolId: selected.symbol.id,
                candidateSymbolIds: input.projectCandidates.map((candidate) => candidate.symbol.id),
                ruleName: "preferred-service"
              };
        }
      }
    ]);
    const snapshot = resolveSources(
      {
        "src/caller.ts": "export function caller() { return execute(); }",
        "src/preferred.ts": "export function execute() { return 1; }",
        "src/other.ts": "export function execute() { return 2; }"
      },
      registry
    );
    const edge = snapshot.edges.find(
      (candidate) => candidate.kind === "calls" && candidate.referenceName === "execute"
    );

    expect(edge).toMatchObject({
      resolution: "heuristic",
      confidence: 0.7,
      evidence: {
        ruleId:
          "plugin.reference-resolver.acme.service-convention.preferred-service.project-target",
        stage: "heuristic"
      }
    });
    expect(snapshot.symbols.find((symbol) => symbol.id === edge?.targetId)?.filePath).toBe(
      "src/preferred.ts"
    );
    expect(snapshot.pendingReferences).toHaveLength(0);
  });

  it("never invokes plugins for a core-resolved reference", () => {
    const registry = createReferenceResolverPluginRegistry([
      {
        ...serviceConventionPlugin,
        resolve: () => {
          throw new Error("must not run");
        }
      }
    ]);
    const snapshot = resolveSources(
      {
        "src/local.ts": [
          "function execute() { return 1; }",
          "export function caller() { return execute(); }"
        ].join("\n")
      },
      registry
    );
    const edge = snapshot.edges.find(
      (candidate) => candidate.kind === "calls" && candidate.referenceName === "execute"
    );

    expect(edge).toMatchObject({ resolution: "exact", confidence: 1 });
    expect(edge?.evidence?.ruleId).toBe("lexical.local-binding");
  });

  it("fails closed on plugin collisions, exceptions, and unknown candidates", () => {
    const sources = {
      "src/caller.ts": "export function caller() { return execute(); }",
      "src/first.ts": "export function execute() { return 1; }",
      "src/second.ts": "export function execute() { return 2; }"
    };
    const claimingPlugin = (id: string): ReferenceResolverPlugin => ({
      ...serviceConventionPlugin,
      id,
      resolve: (input) => ({
        targetSymbolId: input.projectCandidates[0]?.symbol.id ?? null,
        candidateSymbolIds: input.projectCandidates.map((candidate) => candidate.symbol.id),
        ruleName: "claim"
      })
    });
    const collision = resolveSources(
      sources,
      createReferenceResolverPluginRegistry([
        claimingPlugin("acme/first-convention"),
        claimingPlugin("acme/second-convention")
      ])
    );
    const runtimeError = resolveSources(
      sources,
      createReferenceResolverPluginRegistry([
        {
          ...serviceConventionPlugin,
          resolve: () => {
            throw new Error("plugin failed");
          }
        }
      ])
    );
    const invalid = resolveSources(
      sources,
      createReferenceResolverPluginRegistry([
        {
          ...serviceConventionPlugin,
          resolve: () => ({
            targetSymbolId: "unknown",
            candidateSymbolIds: ["unknown"],
            ruleName: "invalid"
          })
        }
      ])
    );

    expect(collision.pendingReferences).toHaveLength(1);
    expect(collision.edges.find((edge) => edge.referenceName === "execute")?.evidence?.ruleId).toBe(
      "plugin.reference-resolver.collision"
    );
    expect(runtimeError.pendingReferences).toHaveLength(1);
    expect(runtimeError.edges.find((edge) => edge.referenceName === "execute")?.evidence?.ruleId).toBe(
      "plugin.reference-resolver.acme.service-convention.runtime-error"
    );
    expect(invalid.pendingReferences).toHaveLength(1);
    expect(invalid.edges.find((edge) => edge.referenceName === "execute")?.evidence?.ruleId).toBe(
      "plugin.reference-resolver.acme.service-convention.invalid-result"
    );
  });

  it("does not offer relation-incompatible project targets", () => {
    let observedCandidateCount = -1;
    const snapshot = resolveSources(
      {
        "src/caller.ts": "export function caller() { return new Service(); }",
        "src/not-a-class.ts": "export function Service() { return {}; }"
      },
      createReferenceResolverPluginRegistry([
        {
          ...serviceConventionPlugin,
          relations: ["instantiates"],
          resolve: (input) => {
            observedCandidateCount = input.projectCandidates.length;
            return null;
          }
        }
      ])
    );

    expect(observedCandidateCount).toBe(0);
    expect(snapshot.pendingReferences).toHaveLength(1);
    expect(snapshot.edges.find((edge) => edge.referenceName === "Service")).toMatchObject({
      resolution: "unresolved",
      targetId: null
    });
  });
});
