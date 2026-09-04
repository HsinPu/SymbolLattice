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
        "bounded-relation": 27,
        "large-project-structural": 10,
        targeted: 19
      },
      relationDepth: {
        project: 41,
        "same-file": 9,
        framework: 4,
        structural: 4
      },
      largeProjectValidated: 18,
      relationReleaseValidated: 29
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
    expect(byLanguage.get("shell")).toMatchObject({
      relationDepth: "structural",
      relationReleaseValidated: false
    });
    expect(byLanguage.get("lua")).toMatchObject({
      relationDepth: "structural",
      relationReleaseValidated: false
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
