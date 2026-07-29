import { describe, expect, it } from "vitest";

import {
  attributeGitHunkSide,
  GitHunkParseError,
  parseGitUnifiedHunks
} from "../../../src/domain/git-hunk-attribution.js";
import type { SymbolNode } from "../../../src/domain/types.js";

function symbol(id: string, overrides: Partial<SymbolNode> = {}): SymbolNode {
  return {
    id,
    name: id,
    qualifiedName: `src/example.ts#${id}`,
    kind: "function",
    filePath: "src/example.ts",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 2 }
    },
    isExported: false,
    declarationOrdinal: 0,
    ...overrides
  };
}

function range(start: number, end: number): SymbolNode["range"] {
  return {
    start: { line: start, column: 1 },
    end: { line: end, column: 1 }
  };
}

describe("Git unified hunk parsing", () => {
  it("parses standard ranges in patch order without reading file paths", () => {
    const hunks = parseGitUnifiedHunks(
      [
        "diff --git a/src/example.ts b/src/example.ts",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -10,3 +12,4 @@ export function example() {",
        " context",
        "@@ -30 +33 @@ const value = true;"
      ].join("\n")
    );

    expect(hunks).toEqual([
      {
        oldRange: { start: 10, count: 3 },
        newRange: { start: 12, count: 4 }
      },
      {
        oldRange: { start: 30, count: 1 },
        newRange: { start: 33, count: 1 }
      }
    ]);
  });

  it("retains valid explicit zero-count ranges", () => {
    expect(
      parseGitUnifiedHunks(["@@ -0,0 +1,3 @@", "@@ -8,2 +10,0 @@"].join("\r\n"))
    ).toEqual([
      {
        oldRange: { start: 0, count: 0 },
        newRange: { start: 1, count: 3 }
      },
      {
        oldRange: { start: 8, count: 2 },
        newRange: { start: 10, count: 0 }
      }
    ]);
  });

  it.each([
    "@@ -one,2 +3,4 @@",
    "@@ -0,1 +1,1 @@",
    "@@ -1,1 +0,1 @@",
    "@@ -1,2 +3,4 @",
    "@@ -1,2 +3,4",
    "@@ not a unified hunk"
  ])("rejects malformed hunk-header-looking line %j", (line) => {
    expect(() => parseGitUnifiedHunks(line)).toThrow(GitHunkParseError);
  });
});

describe("Git hunk-side declaration attribution", () => {
  it("prefers a nested declaration over its enclosing declaration and ignores file symbols", () => {
    const result = attributeGitHunkSide({
      filePath: "src/example.ts",
      range: { start: 12, count: 2 },
      limit: 10,
      symbols: [
        symbol("symbol:file", { kind: "file", range: range(1, 100) }),
        symbol("symbol:class", { kind: "class", range: range(1, 30) }),
        symbol("symbol:method", { kind: "method", range: range(10, 20) })
      ]
    });

    expect(result).toMatchObject({
      state: "declaration",
      items: [expect.objectContaining({ id: "symbol:method" })],
      total: 1,
      truncated: false
    });
  });

  it("keeps minimal anchors for multiple sibling declarations in one hunk", () => {
    const result = attributeGitHunkSide({
      filePath: "src/example.ts",
      range: { start: 10, count: 26 },
      limit: 10,
      symbols: [
        symbol("symbol:outer", { kind: "class", range: range(1, 100) }),
        symbol("symbol:second", { kind: "method", range: range(30, 35) }),
        symbol("symbol:first", { kind: "method", range: range(10, 15) })
      ]
    });

    expect(result).toMatchObject({
      state: "declaration",
      items: [
        expect.objectContaining({ id: "symbol:first" }),
        expect.objectContaining({ id: "symbol:second" })
      ],
      total: 2,
      truncated: false
    });
  });

  it("keeps overlapping declarations when neither declaration contains the other", () => {
    const result = attributeGitHunkSide({
      filePath: "src/example.ts",
      range: { start: 16, count: 2 },
      limit: 10,
      symbols: [
        symbol("symbol:left", { range: range(10, 20) }),
        symbol("symbol:right", { range: range(15, 25) })
      ]
    });

    expect(result).toMatchObject({
      state: "declaration",
      items: [
        expect.objectContaining({ id: "symbol:left" }),
        expect.objectContaining({ id: "symbol:right" })
      ],
      total: 2,
      truncated: false
    });
  });

  it("uses the explicit file fallback for a nonempty span without a declaration", () => {
    const result = attributeGitHunkSide({
      filePath: "src/example.ts",
      range: { start: 40, count: 2 },
      limit: 10,
      symbols: [
        symbol("symbol:file", { kind: "file", range: range(1, 100) }),
        symbol("symbol:other-file", { filePath: "src/other.ts", range: range(40, 41) })
      ]
    });

    expect(result).toEqual({ state: "file", items: [], total: 0, truncated: false });
  });

  it("uses not-applicable for a zero-count side even when declarations overlap its position", () => {
    expect(
      attributeGitHunkSide({
        filePath: "src/example.ts",
        range: { start: 0, count: 0 },
        limit: 10,
        symbols: [symbol("symbol:method", { kind: "method", range: range(1, 20) })]
      })
    ).toEqual({ state: "not-applicable", items: [], total: 0, truncated: false });
  });

  it("sorts anchors deterministically before applying its limit", () => {
    const symbols = [
      symbol("symbol:third", { range: range(30, 31) }),
      symbol("symbol:first", { range: range(10, 11) }),
      symbol("symbol:second", { range: range(20, 21) })
    ];
    const input = {
      filePath: "src/example.ts",
      range: { start: 10, count: 22 },
      limit: 2,
      symbols
    };

    const forward = attributeGitHunkSide(input);
    const reversed = attributeGitHunkSide({ ...input, symbols: [...symbols].reverse() });

    expect(forward).toMatchObject({
      state: "declaration",
      items: [
        expect.objectContaining({ id: "symbol:first" }),
        expect.objectContaining({ id: "symbol:second" })
      ],
      total: 3,
      truncated: true
    });
    expect(reversed).toEqual(forward);
  });
});
