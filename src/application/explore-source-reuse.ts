import { canonicalSourceDeliveryText, type SourceDeliveryCharacterOffsets } from "./source-delivery.js";
import type { DeliveredSourceExcerpt } from "./types.js";
import type { SourceRange } from "../domain/types.js";

export interface ExploreSourceReuse {
  readonly policy: "explore-source-prefix-reuse-v1";
  readonly originalSourceIdentityId: string;
  readonly originalCharacterOffsets: SourceDeliveryCharacterOffsets;
  readonly originalRange: SourceRange;
  readonly originalEmittedCharacters: number;
  readonly originalTruncated: boolean;
  readonly reusedCharacters: number;
  readonly segments: readonly {
    readonly referenceIndex: number;
    readonly reference: string;
    readonly sourceIdentityId: string;
    readonly filePath: string;
    readonly range: SourceRange;
    readonly fullFileCharacterOffsets: SourceDeliveryCharacterOffsets;
  }[];
}

/** Reuse only a contiguous prefix actually emitted by earlier focuses in this generation. */
export function planExploreSourceReuse(
  source: DeliveredSourceExcerpt,
  previous: readonly { readonly referenceIndex: number; readonly reference: string; readonly source: DeliveredSourceExcerpt }[],
  sourceText: string
): { startOffset: number; receipt: ExploreSourceReuse } | undefined {
  const original = source.sourceIdentity.fullFileCharacterOffsets;
  let cursor = original.start;
  const segments: Omit<ExploreSourceReuse["segments"][number], "range">[] = [];
  while (cursor < original.end) {
    const owner = previous.filter((item) => item.source.filePath === source.filePath &&
      item.source.sourceIdentity.fullFileCharacterOffsets.start <= cursor &&
      item.source.sourceIdentity.fullFileCharacterOffsets.end > cursor)
      .sort((left, right) => right.source.sourceIdentity.fullFileCharacterOffsets.end - left.source.sourceIdentity.fullFileCharacterOffsets.end ||
        left.referenceIndex - right.referenceIndex)[0];
    if (owner === undefined) break;
    const end = Math.min(original.end, owner.source.sourceIdentity.fullFileCharacterOffsets.end);
    segments.push({ referenceIndex: owner.referenceIndex, reference: owner.reference, sourceIdentityId: owner.source.sourceIdentity.id,
      filePath: source.filePath, fullFileCharacterOffsets: { start: cursor, end } });
    cursor = end;
  }
  if (cursor < original.end) {
    // Keep the remaining excerpt on a complete line, including CRLF boundaries.
    const prefixEnd = sourceText[cursor - 1] === "\r" && sourceText[cursor] === "\n" ? cursor - 1 : cursor;
    const endings = [...sourceText.slice(original.start, prefixEnd).matchAll(/\r\n|\r|\n|\u2028|\u2029/gu)];
    const last = endings.at(-1);
    cursor = last === undefined ? original.start : original.start + last.index + last[0].length;
  }
  if (cursor <= original.start) return undefined;
  const position = (offset: number) => {
    const prefix = sourceText.slice(original.start, offset);
    const endings = [...prefix.matchAll(/\r\n|\r|\n|\u2028|\u2029/gu)];
    const last = endings.at(-1);
    return { line: source.range.start.line + endings.length,
      column: last === undefined ? source.range.start.column + prefix.length : prefix.length - last.index - last[0].length + 1 };
  };
  return { startOffset: cursor, receipt: { policy: "explore-source-prefix-reuse-v1",
    originalSourceIdentityId: source.sourceIdentity.id, originalCharacterOffsets: original, originalRange: source.range,
    originalEmittedCharacters: source.emittedCharacters, originalTruncated: source.truncated,
    reusedCharacters: canonicalSourceDeliveryText(sourceText.slice(original.start, cursor)).length,
    segments: segments.filter((segment) => segment.fullFileCharacterOffsets.start < cursor).map((segment) => {
      const offsets = { start: segment.fullFileCharacterOffsets.start, end: Math.min(segment.fullFileCharacterOffsets.end, cursor) };
      return { ...segment, fullFileCharacterOffsets: offsets, range: { start: position(offsets.start), end: position(offsets.end) } };
    }) } };
}
