import { describe, expect, it } from "vitest";
import { planExploreSourceReuse } from "../../src/application/explore-source-reuse.js";
import { canonicalSourceDeliverySlice } from "../../src/application/source-delivery.js";
import type { DeliveredSourceExcerpt } from "../../src/application/types.js";

function excerpt(text: string, start: number, end: number, filePath = "a.ts"): DeliveredSourceExcerpt {
  const delivery = canonicalSourceDeliverySlice({ filePath, sourceText: text, fullFileCharacterOffsets: { start, end } });
  const position = (offset: number) => { const parts = text.slice(0, offset).split(/\r\n|\r|\n|\u2028|\u2029/u);
    return { line: parts.length, column: parts.at(-1)!.length + 1 }; };
  return { ...delivery, filePath, startLine: position(start).line, endLine: position(end).line, lines: [], range: { start: position(start), end: position(end) },
    requestedCharacters: end - start, emittedCharacters: delivery.text.length, truncated: false, truncationReason: null };
}
describe("reuse of already delivered source prefixes", () => {
  it("returns a shared-prefix receipt and preserves the unseen suffix on a whole line", () => {
    const text = "first\r\nsecond\r\nthird\r\nfourth";
    const prior = excerpt(text, 0, 17);
    const source = excerpt(text, 7, text.length);
    const result = planExploreSourceReuse(source, [{ referenceIndex: 0, reference: "outer", source: prior }], text);
    expect(result).toMatchObject({ startOffset: 15, receipt: { reusedCharacters: 7, originalEmittedCharacters: source.text.length,
      segments: [{ referenceIndex: 0, sourceIdentityId: prior.sourceIdentity.id, fullFileCharacterOffsets: { start: 7, end: 15 },
        range: { start: { line: 2, column: 1 }, end: { line: 3, column: 1 } } }] } });
    expect(result!.receipt.reusedCharacters + excerpt(text, result!.startOffset, text.length).text.length).toBe(source.text.length);
  });
  it("can share a fully covered excerpt but never relies on an absent file, a gap, or an undelivered suffix", () => {
    const text = "one\ntwo\nthree";
    const source = excerpt(text, 4, 8);
    const owner = excerpt(text, 0, 12);
    expect(planExploreSourceReuse(source, [{ referenceIndex: 0, reference: "owner", source: owner }], text)?.startOffset).toBe(8);
    for (const prior of [excerpt(text, 0, 3), excerpt(text, 5, 10), excerpt(text, 0, 12, "b.ts")]) {
      expect(planExploreSourceReuse(source, [{ referenceIndex: 0, reference: "owner", source: prior }], text)).toBeUndefined();
    }
  });
  it("handles Unicode line endings and refuses to trim at a split CRLF", () => {
    const text = "one\r\ntwo\u2028three\u2029four";
    const source = excerpt(text, 0, text.length);
    expect(planExploreSourceReuse(source, [{ referenceIndex: 0, reference: "cut", source: excerpt(text, 0, 4) }], text)).toBeUndefined();
    expect(planExploreSourceReuse(source, [{ referenceIndex: 0, reference: "whole", source: excerpt(text, 0, 16) }], text)?.startOffset).toBe(15);
  });
  it("joins adjacent emitted owners without citing omitted content between them", () => {
    const text = "one\ntwo\nthree\nfour";
    const previous = [excerpt(text, 0, 4), excerpt(text, 4, 8)].map((source, referenceIndex) => ({ source, referenceIndex, reference: `r${referenceIndex}` }));
    const plan = planExploreSourceReuse(excerpt(text, 0, text.length), previous, text);
    expect(plan?.startOffset).toBe(8);
    expect(plan?.receipt.segments.map(s => s.fullFileCharacterOffsets)).toEqual([{ start: 0, end: 4 }, { start: 4, end: 8 }]);
  });
});
