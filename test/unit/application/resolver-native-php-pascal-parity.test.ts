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
    language: "c",
    expectedCrossFileKinds: ["imports", "calls", "accepts", "returns"],
    files: {
      "src/api.h": [
        "struct Model { int value; };",
        "struct Model build(struct Model value) { return value; }"
      ].join("\n"),
      "src/app.c": [
        '#include "api.h"',
        "struct Model run(struct Model value) { return build(value); }"
      ].join("\n")
    }
  },
  {
    language: "php",
    expectedCrossFileKinds: ["imports", "calls", "extends", "accepts", "returns"],
    files: {
      "src/Domain.php": [
        "<?php",
        "namespace Domain;",
        "class Model {",
        "  public static function make(Model $value): Model { return new Model(); }",
        "}",
        "function build(Model $value): Model { return $value; }"
      ].join("\n"),
      "src/App.php": [
        "<?php",
        "namespace App;",
        "use Domain\\Model;",
        "use function Domain\\build as buildModel;",
        "class Child extends Model {",
        "  public function run(Model $value): Model { return Model::make($value); }",
        "}",
        "function execute(Model $value): Model { return buildModel($value); }"
      ].join("\n")
    }
  },
  {
    language: "cpp",
    expectedCrossFileKinds: ["imports", "calls", "instantiates", "accepts", "returns"],
    files: {
      "src/api.hpp": [
        "struct Model {};",
        "inline Model build(Model value) { return value; }",
        "struct Box {",
        "  int helper(int value) { return value; }",
        "  int caller(int value) { this->helper(value); return value; }",
        "};"
      ].join("\n"),
      "src/app.cpp": [
        '#include "api.hpp"',
        "inline Model run(Model value) { return *new Model(); }",
        "inline Model invoke(Model value) { return build(value); }"
      ].join("\n")
    }
  },
  {
    language: "pascal",
    expectedCrossFileKinds: ["calls"],
    files: {
      "helper.pas": "unit HelperUnit;\n\ninterface\n\nprocedure Helper;\n\nimplementation\n\nprocedure Helper;\nbegin\nend;\n\nend.\n",
      "main.pas": "program Main;\n\nuses HelperUnit;\n\nbegin\n  Helper;\nend.\n"
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

describe("C, PHP, C++, and Pascal resolver pre-move parity golden", () => {
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
    // A Pascal program-main consumer with an unresolved `uses` unit has no
    // local routine declaration; the complete snapshot still records that
    // intentional nonclaim.
    if (language !== "pascal") {
      expect(exactLocalEdges(result).length).toBeGreaterThan(0);
    }
    expect(result).toMatchSnapshot();
  });
});
