import { beforeAll, describe, expect, it } from "vitest";
import { prepareLuaFixtureFacts } from "../../../benchmarks/languages/nonempty-depth-runtime.mjs";

import { ARTIFACT_LANGUAGES } from "../../../src/domain/types.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { LANGUAGE_NONEMPTY_FIXTURES } from "../../../benchmarks/languages/nonempty-depth-fixtures.mjs";
import {
  NONEMPTY_EXPECTATIONS,
  scoreNonEmptyFixture,
  scoreNonEmptyFixtures
} from "../../../benchmarks/languages/nonempty-depth-scorer.mjs";

let luaFacts;
beforeAll(async () => { luaFacts = await prepareLuaFixtureFacts(LANGUAGE_NONEMPTY_FIXTURES); });
function factsFor(fixture) {
  if (fixture.language === "lua") return luaFacts.get(fixture.filePath);
  return extractFileFacts({
    filePath: fixture.filePath,
    language: fixture.language,
    sourceText: fixture.sourceText,
    ...(fixture.language === "shell" || fixture.language === "lua"
      ? { sourceBytes: new Uint8Array(Buffer.from(fixture.sourceText, "utf8")) }
      : {})
  });
}

function supportedFixtures() {
  return LANGUAGE_NONEMPTY_FIXTURES.filter(
    (fixture) => NONEMPTY_EXPECTATIONS[fixture.language]?.symbols?.length > 0
  ).slice(0, 25);
}

describe("58-language non-empty depth admission gate", () => {
  it("checks every registered language with independent declarations and exact minimum relations", () => {
    expect(LANGUAGE_NONEMPTY_FIXTURES).toHaveLength(ARTIFACT_LANGUAGES.length);
    expect(LANGUAGE_NONEMPTY_FIXTURES.map(({ language }) => language)).toEqual([...ARTIFACT_LANGUAGES]);
    expect(new Set(LANGUAGE_NONEMPTY_FIXTURES.map(({ language }) => language)).size).toBe(58);
    for (const fixture of LANGUAGE_NONEMPTY_FIXTURES) {
      expect(fixture.sourceText.trim(), fixture.language).not.toBe("");
      expect(NONEMPTY_EXPECTATIONS[fixture.language], fixture.language).toBeDefined();
    }

    const result = scoreNonEmptyFixtures(LANGUAGE_NONEMPTY_FIXTURES, factsFor);
    expect(result.languageCount).toBe(58);
    expect(result.supportedCount).toBe(58);
    expect(result.knownFileOnlyCount).toBe(0);
    expect(result.acceptedCount).toBe(58);
    expect(result.supportedFailures).toEqual([]);
    expect(result.knownFileOnlyFailures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.strictPassed).toBe(true);
  });

  it("rejects 150 deterministic mutations instead of scoring current output as truth", () => {
    const mutations = [
      "empty-source",
      "remove-declarations",
      "wrong-name",
      "wrong-kind",
      "wrong-range",
      "missing-containment"
    ];
    const fixtures = supportedFixtures();
    expect(fixtures).toHaveLength(25);
    let rejected = 0;

    for (const mutation of mutations) {
      for (const fixture of fixtures) {
        const facts = factsFor(fixture);
        let mutatedFacts = structuredClone(facts);
        let mutatedFixture = fixture;
        const expected = NONEMPTY_EXPECTATIONS[fixture.language];
        const expectedSymbol = expected.symbols?.[0];
        if (mutation === "empty-source") {
          mutatedFixture = { ...fixture, sourceText: "" };
        } else if (mutation === "remove-declarations" || mutation === "file-only-stub") {
          mutatedFacts = {
            ...mutatedFacts,
            symbols: mutatedFacts.symbols.filter((symbol) => symbol.kind === "file"),
            edges: []
          };
        } else if (mutation === "missing-containment") {
          mutatedFacts.edges = mutatedFacts.edges.filter((edge) => edge.kind !== "contains");
        } else if (mutation === "wrong-name") {
          mutatedFacts.symbols = mutatedFacts.symbols.map((symbol) =>
            symbol.kind === expectedSymbol.kind && symbol.name === expectedSymbol.name
              ? { ...symbol, name: `${symbol.name}-wrong` }
              : symbol
          );
        } else if (mutation === "wrong-kind") {
          mutatedFacts.symbols = mutatedFacts.symbols.map((symbol) =>
            symbol.kind === expectedSymbol.kind && symbol.name === expectedSymbol.name
              ? { ...symbol, kind: "file" }
              : symbol
          );
        } else if (mutation === "wrong-range") {
          mutatedFacts.symbols = mutatedFacts.symbols.map((symbol) =>
            symbol.kind === expectedSymbol.kind && symbol.name === expectedSymbol.name
              ? { ...symbol, range: { start: { line: 2, column: 0 }, end: { line: 1, column: 0 } } }
              : symbol
          );
        }

        const scored = scoreNonEmptyFixture(mutatedFixture, mutatedFacts);
        expect(scored.accepted, `${mutation}:${fixture.language}`).toBe(false);
        rejected += 1;
      }
    }
    expect(rejected).toBe(150);
  });

  it("rejects ambiguous evidence and well-formed but out-of-bounds ranges", () => {
    for (const fixture of LANGUAGE_NONEMPTY_FIXTURES.filter(f => NONEMPTY_EXPECTATIONS[f.language].relation)) {
      for (const mutation of ["ambiguous", "wrong-candidate", "out-of-bounds"]) {
        const facts = structuredClone(factsFor(fixture));
        const edge = facts.edges.find(e => e.kind === "calls");
        if (mutation === "ambiguous") edge.evidence.candidateSymbolIds.push("other-target");
        if (mutation === "wrong-candidate") edge.evidence.candidateSymbolIds = ["other-target"];
        if (mutation === "out-of-bounds") edge.range = { start: { line: 1, column: 9999 }, end: { line: 1, column: 10000 } };
        expect(scoreNonEmptyFixture(fixture, facts).accepted, `${fixture.language}:${mutation}`).toBe(false);
      }
    }
  });

  it("rejects corrupted containment evidence and file-only template output", () => {
    for (const fixture of LANGUAGE_NONEMPTY_FIXTURES) {
      const facts = structuredClone(factsFor(fixture));
      const expected = NONEMPTY_EXPECTATIONS[fixture.language];
      if (expected.symbols) {
        for (const edge of facts.edges.filter(e => e.kind === "contains")) {
          edge.evidence.candidateSymbolIds = ["wrong-target"];
        }
      } else {
        const [container, field] = expected.relationFact.field.split(".");
        facts[container][field] = [];
      }
      expect(scoreNonEmptyFixture(fixture, facts).accepted, fixture.language).toBe(false);
    }
  });
});
