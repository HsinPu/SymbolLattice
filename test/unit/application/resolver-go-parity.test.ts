import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { ProjectModuleResolver, SourceDocument } from "../../../src/ports/source-catalog.js";

// Captured before the v0.519 move. These are behavior goldens, not correctness truth.
function snapshot(files: Readonly<Record<string, string>>, moduleResolver?: ProjectModuleResolver) {
  const sourceDocuments: SourceDocument[] = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath, absolutePath: `/resolver-parity/${relativePath}`, sourceText, language: "go",
    contentHash: createHash("sha256").update(sourceText).digest("hex")
  }));
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((file) => extractFileFacts({
      filePath: file.relativePath, sourceText: file.sourceText, language: file.language
    })),
    indexedAt: "2026-09-09T00:00:00.000Z",
    ...(moduleResolver === undefined ? {} : { moduleResolver })
  });
}

describe("Go resolver behavior parity before module extraction", () => {
  it("preserves complete cross-file call, receiver, construction and import output", () => {
    const result = snapshot({
      "caller.go": 'package sample\nimport "example.test/local/lib"\nfunc Caller(s *Service) { helper(); s.Run(); _ = new(Service) }\n',
      "service.go": "package sample\ntype Service struct{}\nfunc helper() {}\nfunc (s *Service) Run() {}\n",
      "lib/lib.go": "package lib\nfunc Exported() {}\n"
    }, { resolve: () => ({ targetFilePath: "lib/lib.go", strategy: "go-module-package", configurationPaths: ["go.mod"] }) });
    expect(result.edges.filter((edge) => edge.evidence?.ruleId.startsWith("project.go.")).length).toBe(4);
    expect(result).toMatchSnapshot();
  });

  it("preserves same-file syntax evidence and nested bare-range calls", () => {
    expect(snapshot({
      "local.go": "package sample\ntype Service []int\nfunc helper() {}\nfunc (s Service) Run() {}\nfunc Caller(s Service) { for range s { helper(); s.Run(); _ = Service{} } }\n"
    })).toMatchSnapshot();
  });

  it.each([
    ["duplicate", "package sample\nfunc helper() {}\nfunc helper() {}\n"],
    ["conditional", "//go:build windows\npackage sample\nfunc helper() {}\n"],
    ["different-package", "package other\nfunc helper() {}\n"]
  ])("preserves %s nonclaims and all pending evidence", (_name, target) => {
    const result = snapshot({
      "caller.go": "package sample\nfunc Caller() { helper() }\n",
      "target.go": target
    });
    expect(result.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact")).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
