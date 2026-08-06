import { createHash } from "node:crypto";

export const SOURCE_DELIVERY_IDENTITY_POLICY = "source-delivery-v2" as const;
export const SOURCE_DELIVERY_OFFSET_MAP_POLICY = "source-delivery-offset-map-v1" as const;
export const SOURCE_DELIVERY_MAXIMUM_OFFSET_SPANS = 4_096 as const;

export interface SourceDeliveryCharacterOffsets {
  readonly start: number;
  readonly end: number;
}

export interface SourceDeliveryOffsetSpan {
  readonly kind: "identity" | "normalized-line-ending";
  /** UTF-16 offsets relative to the text carried in the response. */
  readonly deliveredCharacterOffsets: SourceDeliveryCharacterOffsets;
  /** Absolute UTF-16 offsets in the persisted active-generation source file. */
  readonly fullFileCharacterOffsets: SourceDeliveryCharacterOffsets;
}

export interface SourceDeliveryOffsetMap {
  readonly policy: typeof SOURCE_DELIVERY_OFFSET_MAP_POLICY;
  readonly deliveredTextLength: number;
  readonly sourceTextLength: number;
  readonly spans: readonly SourceDeliveryOffsetSpan[];
  readonly mapSha256: string;
}

export interface SourceDeliveryIdentity {
  readonly policy: typeof SOURCE_DELIVERY_IDENTITY_POLICY;
  readonly id: `source:${string}`;
  readonly canonicalization: "line-endings-lf";
  readonly filePath: string;
  readonly fullFileCharacterOffsets: SourceDeliveryCharacterOffsets;
  readonly contentSha256: string;
  readonly offsetMap: SourceDeliveryOffsetMap;
}

export interface SourceDeliveryIdentityInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly fullFileCharacterOffsets: SourceDeliveryCharacterOffsets;
}

export interface DeliveredSourceIdentityInput {
  readonly filePath: string;
  readonly text: string;
  readonly fullFileCharacterOffsets: SourceDeliveryCharacterOffsets;
  /** Omit only when delivered UTF-16 offsets equal persisted source offsets one-for-one. */
  readonly offsetMap?: SourceDeliveryOffsetMap;
}

export interface SourceDeliveryOffsetMapInput {
  readonly text: string;
  readonly fullFileCharacterOffsets: SourceDeliveryCharacterOffsets;
  readonly spans: readonly SourceDeliveryOffsetSpan[];
  /** When supplied, reject the map unless its canonical SHA-256 matches. */
  readonly expectedMapSha256?: string;
}

export interface CanonicalSourceDeliverySlice {
  readonly text: string;
  readonly sourceIdentity: SourceDeliveryIdentity;
}

export function canonicalSourceDeliveryText(value: string): string {
  return value.replace(/\r\n|\r|\u2028|\u2029/gu, "\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validOffsets(offsets: SourceDeliveryCharacterOffsets): boolean {
  return Number.isSafeInteger(offsets.start) &&
    Number.isSafeInteger(offsets.end) &&
    offsets.start >= 0 &&
    offsets.end >= offsets.start;
}

function offsetMapPayload(
  deliveredTextLength: number,
  sourceTextLength: number,
  spans: readonly SourceDeliveryOffsetSpan[]
): string {
  return JSON.stringify({
    policy: SOURCE_DELIVERY_OFFSET_MAP_POLICY,
    deliveredTextLength,
    sourceTextLength,
    spans
  });
}

/** Builds and validates one complete, gap-free delivered-text to persisted-source map. */
export function sourceDeliveryOffsetMap(
  input: SourceDeliveryOffsetMapInput
): SourceDeliveryOffsetMap {
  const range = input.fullFileCharacterOffsets;
  if (!validOffsets(range)) {
    throw new RangeError("Source delivery offset map requires valid full-file UTF-16 offsets.");
  }
  const sourceTextLength = range.end - range.start;
  if (input.spans.length > SOURCE_DELIVERY_MAXIMUM_OFFSET_SPANS) {
    throw new RangeError(
      `Source delivery offset map exceeds ${SOURCE_DELIVERY_MAXIMUM_OFFSET_SPANS} spans.`
    );
  }
  let deliveredCursor = 0;
  let sourceCursor = range.start;
  const spans = input.spans.map((span): SourceDeliveryOffsetSpan => {
    const delivered = span.deliveredCharacterOffsets;
    const source = span.fullFileCharacterOffsets;
    if (
      !validOffsets(delivered) ||
      !validOffsets(source) ||
      delivered.start !== deliveredCursor ||
      source.start !== sourceCursor ||
      delivered.end <= delivered.start ||
      source.end <= source.start
    ) {
      throw new RangeError("Source delivery offset-map spans must be positive, ordered, contiguous, and gap-free.");
    }
    const deliveredLength = delivered.end - delivered.start;
    const sourceLength = source.end - source.start;
    if (span.kind === "identity") {
      if (deliveredLength !== sourceLength) {
        throw new RangeError("Identity offset-map spans require equal delivered and source lengths.");
      }
    } else if (
      span.kind !== "normalized-line-ending" ||
      deliveredLength !== 1 ||
      (sourceLength !== 1 && sourceLength !== 2) ||
      input.text.slice(delivered.start, delivered.end) !== "\n"
    ) {
      throw new RangeError("Normalized line-ending spans require one delivered LF and one or two source UTF-16 characters.");
    }
    deliveredCursor = delivered.end;
    sourceCursor = source.end;
    return {
      kind: span.kind,
      deliveredCharacterOffsets: { start: delivered.start, end: delivered.end },
      fullFileCharacterOffsets: { start: source.start, end: source.end }
    };
  });
  if (
    deliveredCursor !== input.text.length ||
    sourceCursor !== range.end ||
    (input.text.length === 0 && (spans.length !== 0 || sourceTextLength !== 0)) ||
    (input.text.length > 0 && spans.length === 0)
  ) {
    throw new RangeError("Source delivery offset map must cover the entire delivered text and persisted source range.");
  }
  const mapSha256 = sha256(offsetMapPayload(input.text.length, sourceTextLength, spans));
  if (input.expectedMapSha256 !== undefined && input.expectedMapSha256 !== mapSha256) {
    throw new RangeError("Source delivery offset-map SHA-256 does not match its spans.");
  }
  return {
    policy: SOURCE_DELIVERY_OFFSET_MAP_POLICY,
    deliveredTextLength: input.text.length,
    sourceTextLength,
    spans,
    mapSha256
  };
}

function identityOffsetMap(
  text: string,
  fullFileCharacterOffsets: SourceDeliveryCharacterOffsets
): SourceDeliveryOffsetMap {
  if (fullFileCharacterOffsets.end - fullFileCharacterOffsets.start !== text.length) {
    throw new RangeError(
      "A non-identity source delivery requires an explicit, verified offset map."
    );
  }
  return sourceDeliveryOffsetMap({
    text,
    fullFileCharacterOffsets,
    spans: text.length === 0
      ? []
      : [{
          kind: "identity",
          deliveredCharacterOffsets: { start: 0, end: text.length },
          fullFileCharacterOffsets
        }]
  });
}

function canonicalSliceSpans(
  sourceText: string,
  start: number,
  end: number
): { readonly text: string; readonly spans: readonly SourceDeliveryOffsetSpan[] } {
  const chunks: string[] = [];
  const spans: SourceDeliveryOffsetSpan[] = [];
  let sourceCursor = start;
  let identityStart = start;
  let deliveredCursor = 0;
  const appendIdentity = (identityEnd: number): void => {
    if (identityEnd <= identityStart) return;
    const chunk = sourceText.slice(identityStart, identityEnd);
    chunks.push(chunk);
    spans.push({
      kind: "identity",
      deliveredCharacterOffsets: {
        start: deliveredCursor,
        end: deliveredCursor + chunk.length
      },
      fullFileCharacterOffsets: { start: identityStart, end: identityEnd }
    });
    deliveredCursor += chunk.length;
  };

  while (sourceCursor < end) {
    const character = sourceText[sourceCursor];
    const sourceLineEndingLength = character === "\r"
      ? sourceText[sourceCursor + 1] === "\n" && sourceCursor + 1 < end ? 2 : 1
      : character === "\u2028" || character === "\u2029" ? 1 : 0;
    if (sourceLineEndingLength === 0) {
      sourceCursor += 1;
      continue;
    }
    appendIdentity(sourceCursor);
    chunks.push("\n");
    spans.push({
      kind: "normalized-line-ending",
      deliveredCharacterOffsets: { start: deliveredCursor, end: deliveredCursor + 1 },
      fullFileCharacterOffsets: {
        start: sourceCursor,
        end: sourceCursor + sourceLineEndingLength
      }
    });
    deliveredCursor += 1;
    sourceCursor += sourceLineEndingLength;
    identityStart = sourceCursor;
  }
  appendIdentity(end);
  return { text: chunks.join(""), spans };
}

/** Canonicalizes one persisted source slice and binds every emitted UTF-16 span back to it. */
export function canonicalSourceDeliverySlice(
  input: SourceDeliveryIdentityInput
): CanonicalSourceDeliverySlice {
  const { start, end } = input.fullFileCharacterOffsets;
  if (
    input.filePath.length === 0 ||
    !validOffsets(input.fullFileCharacterOffsets) ||
    end > input.sourceText.length
  ) {
    throw new RangeError("Canonical source delivery requires valid full-file UTF-16 offsets.");
  }
  const canonical = canonicalSliceSpans(input.sourceText, start, end);
  const offsetMap = sourceDeliveryOffsetMap({
    text: canonical.text,
    fullFileCharacterOffsets: input.fullFileCharacterOffsets,
    spans: canonical.spans
  });
  return {
    text: canonical.text,
    sourceIdentity: sourceDeliveryIdentityFromText({
      filePath: input.filePath,
      text: canonical.text,
      fullFileCharacterOffsets: input.fullFileCharacterOffsets,
      offsetMap
    })
  };
}

export function sourceDeliveryIdentity(
  input: SourceDeliveryIdentityInput
): SourceDeliveryIdentity {
  const { start, end } = input.fullFileCharacterOffsets;
  if (
    input.filePath.length === 0 ||
    !validOffsets(input.fullFileCharacterOffsets) ||
    end > input.sourceText.length
  ) {
    throw new RangeError("Source delivery identity requires valid full-file UTF-16 offsets.");
  }
  return sourceDeliveryIdentityFromText({
    filePath: input.filePath,
    text: input.sourceText.slice(start, end),
    fullFileCharacterOffsets: input.fullFileCharacterOffsets
  });
}

export function sourceDeliveryIdentityFromText(
  input: DeliveredSourceIdentityInput
): SourceDeliveryIdentity {
  const { start, end } = input.fullFileCharacterOffsets;
  if (input.filePath.length === 0 || !validOffsets(input.fullFileCharacterOffsets)) {
    throw new RangeError("Source delivery identity requires valid full-file UTF-16 offsets.");
  }
  if (
    input.offsetMap !== undefined &&
    (
      input.offsetMap.policy !== SOURCE_DELIVERY_OFFSET_MAP_POLICY ||
      !Number.isSafeInteger(input.offsetMap.deliveredTextLength) ||
      !Number.isSafeInteger(input.offsetMap.sourceTextLength) ||
      !Array.isArray(input.offsetMap.spans) ||
      typeof input.offsetMap.mapSha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(input.offsetMap.mapSha256)
    )
  ) {
    throw new RangeError("Source delivery offset-map metadata is incomplete or invalid.");
  }
  const offsetMap = input.offsetMap === undefined
    ? identityOffsetMap(input.text, input.fullFileCharacterOffsets)
    : sourceDeliveryOffsetMap({
        text: input.text,
        fullFileCharacterOffsets: input.fullFileCharacterOffsets,
        spans: input.offsetMap.spans,
        expectedMapSha256: input.offsetMap.mapSha256
      });
  if (
    input.offsetMap !== undefined &&
    (
      input.offsetMap.deliveredTextLength !== offsetMap.deliveredTextLength ||
      input.offsetMap.sourceTextLength !== offsetMap.sourceTextLength
    )
  ) {
    throw new RangeError("Source delivery offset-map metadata does not match its verified spans.");
  }
  const contentSha256 = sha256(canonicalSourceDeliveryText(input.text));
  const identitySha256 = sha256(JSON.stringify({
    policy: SOURCE_DELIVERY_IDENTITY_POLICY,
    filePath: input.filePath,
    start,
    end,
    contentSha256
  }));
  return {
    policy: SOURCE_DELIVERY_IDENTITY_POLICY,
    id: `source:${identitySha256}`,
    canonicalization: "line-endings-lf",
    filePath: input.filePath,
    fullFileCharacterOffsets: { start, end },
    contentSha256,
    offsetMap
  };
}
