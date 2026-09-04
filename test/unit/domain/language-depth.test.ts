import { describe, expect, it } from "vitest";

import {
  LANGUAGE_DEPTH_MATRIX,
  summarizeLanguageDepthMatrix
} from "../../../src/domain/language-depth.js";
import { ARTIFACT_LANGUAGES } from "../../../src/domain/types.js";

describe("language depth matrix", () => {
  it("covers every supported language exactly once in registry order", () => {
    expect(LANGUAGE_DEPTH_MATRIX.map(({ language }) => language)).toEqual(ARTIFACT_LANGUAGES);
    expect(new Set(LANGUAGE_DEPTH_MATRIX.map(({ language }) => language)).size).toBe(58);
  });

  it("keeps the current evidence tiers explicit instead of claiming equal depth", () => {
    expect(summarizeLanguageDepthMatrix(LANGUAGE_DEPTH_MATRIX)).toEqual({
      languages: 58,
      tiers: {
        "external-tier-a": 1,
        "external-partial": 1,
        "bounded-relation": 35,
        "large-project-structural": 6,
        targeted: 15
      },
      relationDepth: {
        project: 41,
        "same-file": 11,
        framework: 4,
        structural: 2
      },
      largeProjectValidated: 22,
      relationReleaseValidated: 37
    });
  });

  it("preserves the known low-depth and bounded truth contracts", () => {
    const byLanguage = new Map(LANGUAGE_DEPTH_MATRIX.map((entry) => [entry.language, entry]));

    expect(byLanguage.get("typescript")).toMatchObject({
      evidenceTier: "external-tier-a",
      relationDepth: "project",
      truthKind: "typescript-compiler-api"
    });
    expect(byLanguage.get("java")).toMatchObject({
      evidenceTier: "external-partial",
      relationDepth: "project",
      truthKind: "javac-oracle"
    });
    expect(byLanguage.get("javascript")).toMatchObject({
      evidenceTier: "bounded-relation",
      relationDepth: "project",
      truthKind: "javascript-estree",
      evidenceVersion: "0.500.0",
      largeProjectValidated: true,
      relationReleaseValidated: true
    });
    expect(byLanguage.get("python")).toMatchObject({
      evidenceTier: "bounded-relation",
      relationDepth: "project",
      truthKind: "python-stdlib-ast",
      evidenceVersion: "0.501.0",
      largeProjectValidated: true,
      relationReleaseValidated: true
    });
    for (const language of ["vue", "svelte", "astro"] as const) {
      expect(byLanguage.get(language)).toMatchObject({
        evidenceTier: "bounded-relation",
        relationDepth: "project",
        truthKind: "sfc-compiler-api",
        evidenceVersion: "0.502.0",
        largeProjectValidated: true,
        relationReleaseValidated: true
      });
    }
    expect(byLanguage.get("shell")).toMatchObject({
      evidenceTier: "bounded-relation",
      relationDepth: "same-file",
      truthKind: "shell-mvdan-ast",
      evidenceVersion: "0.503.0",
      relationReleaseValidated: true
    });
    expect(byLanguage.get("lua")).toMatchObject({
      evidenceTier: "bounded-relation",
      relationDepth: "same-file",
      truthKind: "lua-tree-sitter-ast",
      evidenceVersion: "0.504.0",
      relationReleaseValidated: true
    });
    expect(byLanguage.get("solidity")).toMatchObject({
      evidenceTier: "bounded-relation",
      relationDepth: "same-file",
      truthKind: "solc-ast",
      evidenceVersion: "0.505.0",
      largeProjectValidated: true,
      relationReleaseValidated: true
    });
    expect(byLanguage.get("r")).toMatchObject({
      evidenceTier: "bounded-relation",
      relationDepth: "same-file"
    });
    expect(byLanguage.get("groovy")).toMatchObject({
      evidenceTier: "bounded-relation",
      relationDepth: "same-file",
      truthKind: "groovy-compiler-ast",
      evidenceVersion: "0.499.0",
      largeProjectValidated: true,
      relationReleaseValidated: true
    });
  });
});
