import { describe, expect, it } from "vitest";

import {
  SOURCE_DELIVERY_IDENTITY_POLICY,
  sourceDeliveryIdentity
} from "../../src/application/source-delivery.js";

describe("source delivery identity", () => {
  it("uses canonical LF content with exact full-file UTF-16 offsets", () => {
    const crlf = sourceDeliveryIdentity({
      filePath: "src/users.ts",
      sourceText: "before\r\nexport const user = 1;\r\nafter",
      fullFileCharacterOffsets: { start: 8, end: 30 }
    });
    const lf = sourceDeliveryIdentity({
      filePath: "src/users.ts",
      sourceText: "before\nexport const user = 1;\nafter",
      fullFileCharacterOffsets: { start: 7, end: 29 }
    });

    expect(crlf).toMatchObject({
      policy: SOURCE_DELIVERY_IDENTITY_POLICY,
      canonicalization: "line-endings-lf",
      filePath: "src/users.ts",
      fullFileCharacterOffsets: { start: 8, end: 30 }
    });
    expect(crlf.contentSha256).toBe(lf.contentSha256);
    expect(crlf.id).not.toBe(lf.id);
  });

  it("distinguishes identical text at different locations", () => {
    const sourceText = "same\nsame";
    const first = sourceDeliveryIdentity({
      filePath: "src/copy.ts",
      sourceText,
      fullFileCharacterOffsets: { start: 0, end: 4 }
    });
    const second = sourceDeliveryIdentity({
      filePath: "src/copy.ts",
      sourceText,
      fullFileCharacterOffsets: { start: 5, end: 9 }
    });

    expect(first.contentSha256).toBe(second.contentSha256);
    expect(first.id).not.toBe(second.id);
  });

  it("fails closed for invalid offsets", () => {
    expect(() => sourceDeliveryIdentity({
      filePath: "src/users.ts",
      sourceText: "short",
      fullFileCharacterOffsets: { start: 1, end: 6 }
    })).toThrow(/offset/i);
  });
});
