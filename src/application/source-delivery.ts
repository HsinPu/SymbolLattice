import { createHash } from "node:crypto";

export const SOURCE_DELIVERY_IDENTITY_POLICY = "source-delivery-v1" as const;

export interface SourceDeliveryIdentity {
  readonly policy: typeof SOURCE_DELIVERY_IDENTITY_POLICY;
  readonly id: `source:${string}`;
  readonly canonicalization: "line-endings-lf";
  readonly filePath: string;
  readonly fullFileCharacterOffsets: {
    readonly start: number;
    readonly end: number;
  };
  readonly contentSha256: string;
}

export interface SourceDeliveryIdentityInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly fullFileCharacterOffsets: {
    readonly start: number;
    readonly end: number;
  };
}

export interface DeliveredSourceIdentityInput {
  readonly filePath: string;
  readonly text: string;
  readonly fullFileCharacterOffsets: {
    readonly start: number;
    readonly end: number;
  };
}

export function canonicalSourceDeliveryText(value: string): string {
  return value.replace(/\r\n|\r|\u2028|\u2029/gu, "\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sourceDeliveryIdentity(
  input: SourceDeliveryIdentityInput
): SourceDeliveryIdentity {
  const { start, end } = input.fullFileCharacterOffsets;
  if (
    input.filePath.length === 0 ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
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
  if (
    input.filePath.length === 0 ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start
  ) {
    throw new RangeError("Source delivery identity requires valid full-file UTF-16 offsets.");
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
    contentSha256
  };
}
