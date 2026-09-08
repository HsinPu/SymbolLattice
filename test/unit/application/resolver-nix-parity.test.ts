import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

const consumer = "{\n helper = value: value;\n imported = import ./api.nix;\n local = value: helper value;\n remote = value: imported.build value;\n}";
function snapshot(files: Readonly<Record<string, string>>) {
  const sourceDocuments: SourceDocument[] = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath, absolutePath: `/nix-parity/${relativePath}`, sourceText, language: "nix",
    contentHash: createHash("sha256").update(sourceText).digest("hex")
  }));
  return resolveProjectFacts({sourceDocuments,
    extractedFiles: sourceDocuments.map((f) => extractFileFacts({filePath: f.relativePath, sourceText: f.sourceText, language: f.language})),
    indexedAt: "2026-09-09T00:00:00.000Z"
  });
}

describe("Nix complete-output parity before resolver move", () => {
  it("preserves imported attribute and local calls", () => {
    const result = snapshot({"src/api.nix": "{ build = value: value; }\n", "src/default.nix": consumer});
    expect(result.edges.some((e) => e.kind === "calls" && e.referenceName === "imported.build" && e.resolution === "exact")).toBe(true);
    expect(result.edges.some((e) => e.kind === "calls" && e.referenceName === "helper" && e.resolution === "exact")).toBe(true);
    expect(result).toMatchSnapshot();
  });
  it("preserves missing target nonclaim and local call", () => {
    const result = snapshot({"src/default.nix": consumer});
    expect(result.edges.some((e) => e.kind === "calls" && e.referenceName === "imported.build" && e.resolution === "exact")).toBe(false);
    expect(result.edges.some((e) => e.kind === "calls" && e.referenceName === "helper" && e.resolution === "exact")).toBe(true);
    expect(result).toMatchSnapshot();
  });
  it("preserves duplicate import binding nonclaim", () => {
    const result = snapshot({"src/one.nix": "{ build = value: value; }", "src/two.nix": "{ build = value: value; }",
      "src/default.nix": "{\n imported = import ./one.nix;\n imported = import ./two.nix;\n remote = value: imported.build value;\n}"});
    expect(result.edges.filter((e) => e.kind === "calls" && e.resolution === "exact")).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
