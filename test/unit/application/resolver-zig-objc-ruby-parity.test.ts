import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import type { GraphEdge } from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

type ParityCase = {
  readonly language: SourceDocument["language"];
  readonly files: Readonly<Record<string, string>>;
  readonly expectedCrossFileKinds: readonly GraphEdge["kind"][];
};

const cases: readonly ParityCase[] = [
  {
    language: "zig",
    expectedCrossFileKinds: ["imports", "calls"],
    files: {
      "src/api.zig": [
        "pub const Model = struct {};",
        "pub fn build(value: i32) i32 { return value; }"
      ].join("\n"),
      "src/app.zig": [
        'const api = @import("api.zig");',
        "const Local = struct {};",
        "pub fn helper(value: Local) Local { return value; }",
        "pub fn caller(value: Local) Local {",
        "  _ = api.build(1);",
        "  return helper(value);",
        "}",
        "pub fn make(value: Local) Local { return Local{ .value = value }; }"
      ].join("\n"),
      "src/local.zig": [
        "const Local = struct {};",
        "pub fn helper(value: Local) Local { return value; }",
        "pub fn caller(value: Local) Local { return helper(value); }"
      ].join("\n")
    }
  },
  {
    language: "objc",
    expectedCrossFileKinds: ["imports", "implements", "calls", "instantiates"],
    files: {
      "src/Factory.h": [
        "@protocol HealthChecking",
        "- (void)check;",
        "@end",
        "@interface Factory",
        "+ (void)ping;",
        "@end"
      ].join("\n"),
      "src/Consumer.m": [
        '#import "Factory.h"',
        "@interface Consumer : NSObject <HealthChecking>",
        "- (Factory *)make:(Factory *)factory;",
        "@end",
        "@implementation Consumer",
        "- (Factory *)make:(Factory *)factory { [Factory ping]; [[Factory alloc] init]; return factory; }",
        "@end"
      ].join("\n")
    }
  },
  {
    language: "ruby",
    expectedCrossFileKinds: ["imports", "extends", "calls"],
    files: {
      "src/parent.rb": [
        "class Parent",
        "  def self.ping(value)",
        "    value",
        "  end",
        "end",
        ""
      ].join("\n"),
      "src/child.rb": [
        'require_relative "./parent"',
        "class Child < Parent",
        "  def run(value)",
        "    Parent.ping(value)",
        "  end",
        "end",
        ""
      ].join("\n")
    }
  }
];

function resolveFixture(
  language: SourceDocument["language"],
  files: Readonly<Record<string, string>>
) {
  const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath,
    absolutePath: `/resolver-parity/${relativePath}`,
    language,
    sourceText,
    contentHash: createHash("sha256").update(sourceText).digest("hex")
  }));
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((document) => extractFileFacts({
      filePath: document.relativePath,
      sourceText: document.sourceText,
      language: document.language
    })),
    indexedAt: "2026-09-09T00:00:00.000Z"
  });
}

function exactCrossFileEdges(result: ReturnType<typeof resolveFixture>): readonly GraphEdge[] {
  const symbolsById = new Map(result.symbols.map((symbol) => [symbol.id, symbol]));
  return result.edges.filter((edge) => {
    if (edge.resolution !== "exact" || edge.targetId === null) {
      return false;
    }
    const sourceFilePath = symbolsById.get(edge.sourceId)?.filePath;
    const targetFilePath = symbolsById.get(edge.targetId)?.filePath;
    return sourceFilePath !== undefined && targetFilePath !== undefined && sourceFilePath !== targetFilePath;
  });
}

function exactLocalEdges(result: ReturnType<typeof resolveFixture>): readonly GraphEdge[] {
  const symbolsById = new Map(result.symbols.map((symbol) => [symbol.id, symbol]));
  return result.edges.filter((edge) => {
    if (edge.resolution !== "exact" || edge.targetId === null) {
      return false;
    }
    const sourceFilePath = symbolsById.get(edge.sourceId)?.filePath;
    const targetFilePath = symbolsById.get(edge.targetId)?.filePath;
    return sourceFilePath !== undefined && sourceFilePath === targetFilePath;
  });
}

describe("Zig, Objective-C, and Ruby resolver pre-move parity golden", () => {
  it.each(cases)("$language preserves complete cross-file and local output", ({ language, files, expectedCrossFileKinds }) => {
    const result = resolveFixture(language, files);
    const crossFileEdges = exactCrossFileEdges(result);
    expect(crossFileEdges.length).toBeGreaterThan(0);
    for (const kind of expectedCrossFileKinds) {
      expect(crossFileEdges.some((edge) => edge.kind === kind)).toBe(true);
    }
    expect(exactLocalEdges(result).length).toBeGreaterThan(0);
    expect(result).toMatchSnapshot();
  });

  it.each(cases)("$language keeps consumer-only imports and cross-file relations unresolved", ({ language, files }) => {
    const consumer = Object.entries(files).at(-1);
    if (consumer === undefined) {
      throw new Error("Missing consumer fixture");
    }
    const result = resolveFixture(language, Object.fromEntries([consumer]));
    expect(exactCrossFileEdges(result)).toEqual([]);
    expect(exactLocalEdges(result).length).toBeGreaterThan(0);
    expect(result).toMatchSnapshot();
  });
});
