import type { SourceRange } from "../domain/types.js";

/** Retain complete evidence lines when a prefix-only slice would omit them. */
export function evidenceWindowStart(input: {
  readonly lineStarts: readonly number[];
  readonly sourceLength: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly characterBudget: number;
  readonly contextPaddingLines: number;
  readonly evidenceRanges: readonly SourceRange[];
}): number {
  const { lineStarts, sourceLength, startOffset, endOffset, characterBudget } = input;
  if (input.evidenceRanges.length === 0 || characterBudget <= 0 || endOffset - startOffset <= characterBudget) return startOffset;
  const anchors = input.evidenceRanges.flatMap(range => {
    if (!Number.isSafeInteger(range.start.line) || !Number.isSafeInteger(range.end.line) ||
        range.start.line < 1 || range.end.line < range.start.line || range.end.line > lineStarts.length) return [];
    const start = lineStarts[range.start.line - 1];
    const end = lineStarts[range.end.line] ?? sourceLength;
    return start === undefined || start < startOffset || end > endOffset || end <= start ||
      end - start > characterBudget ? [] : [{ start, end, line: range.start.line }];
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  const first = anchors[0];
  if (first === undefined) return startOffset;
  const lastEnd = Math.max(...anchors.map(anchor => anchor.end));
  const anchorEnd = lastEnd - first.start <= characterBudget ? lastEnd : first.end;
  if (anchorEnd - startOffset <= characterBudget) return startOffset;
  // Reserve room after the proof, rather than spending it all on leading padding.
  const paddedStart = lineStarts[Math.max(0, first.line - 1 - input.contextPaddingLines)] ?? first.start;
  return lineStarts.find(offset => offset >= Math.max(anchorEnd - characterBudget, paddedStart) &&
    offset >= startOffset && offset <= first.start) ?? startOffset;
}
