import { describe, expect, it } from "vitest";

import {
  mcpSourcePointerContext,
  projectMcpSourcePointer
} from "../../src/mcp/source-pointer.js";

describe("MCP source pointers", () => {
  it("counts CRLF, CR, and Unicode separators as physical line boundaries", () => {
    const text = "a\r\nb\u2028c\u2029d\re";
    const context = mcpSourcePointerContext({
      filePath: "src/mixed.ts",
      text,
      start: { line: 10, column: 3 },
      expectedEnd: { line: 14, column: 2 }
    });

    expect(context).not.toBeNull();
    expect(projectMcpSourcePointer({
      context: context!,
      sourceId: `source:${"1".repeat(64)}`,
      deliveredCharacterOffsets: { start: 0, end: text.length },
      fullFileCharacterOffsets: { start: 40, end: 40 + text.length }
    })).toMatchObject({
      range: { start: { line: 10, column: 3 }, end: { line: 14, column: 2 } },
      lineSpan: { start: 10, end: 14 },
      display: "src/mixed.ts:L10-L14",
      pointerSha256: expect.stringMatching(/^[0-9a-f]{64}$/u)
    });
  });

  it("refuses a display pointer whose boundary splits CRLF", () => {
    const text = "a\r\nb";
    const context = mcpSourcePointerContext({
      filePath: "src/crlf.ts",
      text,
      start: { line: 1, column: 1 },
      expectedEnd: { line: 2, column: 2 }
    });

    expect(context).not.toBeNull();
    expect(projectMcpSourcePointer({
      context: context!,
      sourceId: `source:${"2".repeat(64)}`,
      deliveredCharacterOffsets: { start: 1, end: 2 },
      fullFileCharacterOffsets: { start: 1, end: 2 }
    })).toBeNull();
  });

  it("refuses a source identity outside the verified source-id contract", () => {
    const context = mcpSourcePointerContext({
      filePath: "src/example.ts",
      text: "value",
      start: { line: 1, column: 1 },
      expectedEnd: { line: 1, column: 6 }
    });

    expect(context).not.toBeNull();
    expect(projectMcpSourcePointer({
      context: context!,
      sourceId: "unverified-source",
      deliveredCharacterOffsets: { start: 0, end: 5 },
      fullFileCharacterOffsets: { start: 0, end: 5 }
    })).toBeNull();
  });
});
