import { describe, expect, it } from "vitest";

import { extractSqlFileFacts } from "../../../src/extraction/sql.js";

describe.skipIf(process.env.SQL_V2_LOW_HEAP_WORKER !== "1")("SQL v2 low-heap oversized input", () => {
  it("rejects an 8 MiB newline-dense source without an O(lines) file-range allocation", () => {
    const sourceText = "\n".repeat(8 * 1024 * 1024);
    const facts = extractSqlFileFacts({ filePath: "targeted/low-heap.sql", language: "sql", sourceText });
    expect(facts.symbols).toEqual([
      expect.objectContaining({
        kind: "file",
        range: {
          start: { line: 1, column: 1 },
          end: { line: 8 * 1024 * 1024 + 1, column: 1 }
        }
      })
    ]);
    expect(facts.edges).toEqual([]);
  });
});
