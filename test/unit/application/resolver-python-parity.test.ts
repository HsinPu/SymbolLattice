import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";

function snapshot(files: Readonly<Record<string, string>>) {
  const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath, absolutePath: `/resolver-parity/${relativePath}`, sourceText,
    language: "python" as const, contentHash: createHash("sha256").update(sourceText).digest("hex")
  }));
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((file) => extractFileFacts({
      filePath: file.relativePath, sourceText: file.sourceText, language: file.language
    })),
    indexedAt: "2026-09-09T00:00:00.000Z"
  });
}

// Freeze the original resolver behavior before moving it; not compiler truth.
describe("Python resolver module-move parity", () => {
  it("preserves full import, call, construction and heritage evidence", () => {
    const result = snapshot({
      "pkg/__init__.py": "",
      "pkg/helpers.py": "def helper():\n    return 1\nclass Base:\n    pass\n",
      "pkg/entry.py": "from .helpers import helper\nfrom .helpers import Base\nclass Child(Base):\n    pass\ndef run():\n    helper()\n    return Base()\n"
    });
    for (const kind of ["imports", "calls", "instantiates", "extends"]) {
      expect(result.edges.some((edge) => edge.kind === kind && edge.resolution === "exact")).toBe(true);
    }
    expect(result).toMatchSnapshot();
  });

  it.each([
    ["namespace package", false, "def helper():\n    return 1\n"],
    ["duplicate declaration", true, "def helper():\n    return 1\ndef helper():\n    return 2\n"],
    ["decorated target", true, "@decorate\ndef helper():\n    return 1\n"],
    ["rebound target", true, "def helper():\n    return 1\nhelper = replacement\n"]
  ])("preserves %s nonclaims", (_name, regular, target) => {
    const result = snapshot({
      ...(regular ? { "pkg/__init__.py": "" } : {}),
      "pkg/helpers.py": target,
      "pkg/entry.py": "from .helpers import helper\ndef run():\n    return helper()\n"
    });
    expect(result.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact")).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
