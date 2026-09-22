import { describe, expect, it } from "vitest";
import { evidenceWindowStart } from "../../src/application/evidence-window-start.js";

const range = (start: number, end = start) => ({
  start: { line: start, column: 1 }, end: { line: end, column: 4 }
});
const input = { lineStarts: [0, 10, 20, 30, 40, 50, 60], sourceLength: 60,
  startOffset: 0, endOffset: 60, characterBudget: 25, contextPaddingLines: 3, evidenceRanges: [range(5)] };

describe("evidence window start", () => {
  it("moves past padding to preserve the complete selected evidence line", () => {
    expect(evidenceWindowStart(input)).toBe(30);
  });
  it("keeps all evidence lines together when they fit", () => {
    expect(evidenceWindowStart({ ...input, evidenceRanges: [range(5), range(4)] })).toBe(30);
  });
  it("leaves room after evidence instead of consuming the budget with leading context", () => {
    expect(evidenceWindowStart({ ...input, lineStarts: [0,10,20,30,40,50,60,70,80,90,100],
      sourceLength: 100, endOffset: 100, characterBudget: 65, evidenceRanges: [range(9)] })).toBe(50);
  });
  it("keeps the first evidence line when distant anchors cannot fit together", () => {
    expect(evidenceWindowStart({ ...input, evidenceRanges: [range(6), range(3)] })).toBe(10);
  });
  it("retains prefix behavior for fitting, absent or unavailable anchors", () => {
    expect(evidenceWindowStart({ ...input, evidenceRanges: [] })).toBe(0);
    expect(evidenceWindowStart({ ...input, evidenceRanges: [range(2)] })).toBe(0);
    expect(evidenceWindowStart({ ...input, characterBudget: 60 })).toBe(0);
    expect(evidenceWindowStart({ ...input, evidenceRanges: [range(0), range(99)] })).toBe(0);
    expect(evidenceWindowStart({ ...input, endOffset: 30 })).toBe(0);
    expect(evidenceWindowStart({ ...input, characterBudget: 5 })).toBe(0);
  });
  it("uses raw UTF-16 boundaries across CRLF and astral text", () => {
    const source = "padding\r\n😀 line\r\nevidence\r\nend";
    const start = evidenceWindowStart({ lineStarts: [0, 9, 18, 28], sourceLength: source.length,
      startOffset: 0, endOffset: source.length, characterBudget: 15, contextPaddingLines: 3, evidenceRanges: [range(3)] });
    expect(start).toBe(18);
    expect(source.slice(start, start + 15)).toBe("evidence\r\nend");
  });
});
