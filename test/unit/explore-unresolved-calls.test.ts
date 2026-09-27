import { describe, expect, it } from "vitest";
import { selectQueryUnresolvedCalls } from "../../src/application/explore-unresolved-calls.js";
import type { GraphEdge } from "../../src/domain/types.js";

describe("query-selected unresolved call evidence", () => {
  it("keeps a name-followup origin even when later names have stronger query overlap", () => {
    const calls: GraphEdge[] = ["resolver.resolve_error_handler",
      ...Array<string>(8).fill("resolver.default_error_view")].map((referenceName, index) => ({
      id: `call:${index}`, sourceId: "owner", targetId: null, kind: "calls",
      filePath: "owner.py", referenceName, resolution: "unresolved", confidence: 0,
      range: { start: { line: index + 2, column: 5 }, end: { line: index + 2, column: 30 } }
    }));
    const selected = selectQueryUnresolvedCalls({ state: "available", items: calls, truncated: false },
      ["default", "error", "view"], 8, new Set([calls[0]!.id]));
    expect(selected.truncated).toBe(true);
    expect(selected.items).toHaveLength(8);
    expect(selected.items).toContainEqual(calls[0]);
    expect(selected.items.map((edge) => edge.range.start.line))
      .toEqual([...selected.items.map((edge) => edge.range.start.line)].sort((a, b) => a - b));
  });
});
