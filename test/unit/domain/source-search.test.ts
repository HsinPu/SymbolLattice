import { describe, expect, it } from "vitest";

import {
  sourceSearchCorpus,
  sourceSearchTerms
} from "../../../src/domain/source-search.js";

describe("source search lexical helpers", () => {
  it("normalizes, deduplicates, and removes FTS punctuation from user terms", () => {
    expect(sourceSearchTerms('  $SearchTarget OR "searchTarget" + café  ')).toEqual([
      "searchtarget",
      "or",
      "cafe"
    ]);
  });

  it("adds deterministic identifier parts without changing the indexed source text", () => {
    const source = "export const searchTarget_value = fetchHTTPResponse();";
    const corpus = sourceSearchCorpus(source);

    expect(corpus.startsWith(`${source}\n`)).toBe(true);
    expect(corpus).toContain("search Target value");
    expect(corpus).toContain("fetch HTTP Response");
  });
});
