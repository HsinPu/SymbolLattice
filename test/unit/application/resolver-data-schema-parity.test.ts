import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import type { GraphEdge } from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

type ParityCase = {
  readonly language: SourceDocument["language"];
  readonly files: Readonly<Record<string, string>>;
  readonly consumerPath: string;
  readonly expectedCrossFileKinds: readonly GraphEdge["kind"][];
  readonly expectedLocalKinds: readonly GraphEdge["kind"][];
};

const cases: readonly ParityCase[] = [
  {
    language: "sql",
    consumerPath: "db/child.sql",
    expectedCrossFileKinds: ["references", "extends"],
    expectedLocalKinds: ["contains"],
    files: {
      "db/base.sql": [
        "CREATE TABLE public.parent (id integer);",
        "CREATE TABLE public.audit (id integer);",
        ""
      ].join("\n"),
      "db/child.sql": [
        "CREATE TABLE public.child (",
        "  parent_id integer REFERENCES public.parent(id),",
        "  audit_id integer,",
        "  CONSTRAINT child_audit_fk FOREIGN KEY (audit_id) REFERENCES public.audit(id)",
        ") INHERITS (public.parent);",
        ""
      ].join("\n")
    }
  },
  {
    language: "r",
    consumerPath: "R/entry.R",
    // R deliberately has no project/package-loading relation. Its positive
    // contract is the local call; the second file makes the cross-file
    // nonclaim boundary observable without inventing an edge.
    expectedCrossFileKinds: [],
    expectedLocalKinds: ["calls"],
    files: {
      "R/entry.R": [
        "helper <- function(value) { value }",
        "entry <- function(value) { helper(value) }",
        ""
      ].join("\n"),
      "R/foreign.R": "helper <- function(value) { value + 1 }\n"
    }
  },
  {
    language: "proto",
    consumerPath: "api/service.proto",
    expectedCrossFileKinds: ["imports", "references"],
    expectedLocalKinds: ["contains"],
    files: {
      "api/messages.proto": [
        'syntax = "proto3";',
        "message HelloRequest {}",
        "message HelloResponse {}",
        ""
      ].join("\n"),
      "api/service.proto": [
        'syntax = "proto3";',
        'import "messages.proto";',
        "service Greeter {",
        "  rpc Say(HelloRequest) returns (HelloResponse);",
        "}",
        ""
      ].join("\n")
    }
  },
  {
    language: "graphql",
    consumerPath: "schema/user.graphql",
    expectedCrossFileKinds: ["extends"],
    expectedLocalKinds: ["contains"],
    files: {
      "schema/node.graphql": "interface Node { id: ID! }\n",
      "schema/user.graphql": "type User implements Node { id: ID! }\n"
    }
  }
];

function resolveFixture(
  language: SourceDocument["language"],
  files: Readonly<Record<string, string>>
) {
  const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath,
    absolutePath: `/resolver-data-schema-parity/${relativePath}`,
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
    if (edge.resolution !== "exact") return false;
    const sourceFilePath = symbolsById.get(edge.sourceId)?.filePath;
    const targetFilePath = symbolsById.get(edge.targetId)?.filePath;
    return sourceFilePath !== undefined && targetFilePath !== undefined && sourceFilePath !== targetFilePath;
  });
}

function exactLocalEdges(result: ReturnType<typeof resolveFixture>): readonly GraphEdge[] {
  const symbolsById = new Map(result.symbols.map((symbol) => [symbol.id, symbol]));
  return result.edges.filter((edge) => {
    if (edge.resolution !== "exact") return false;
    const sourceFilePath = symbolsById.get(edge.sourceId)?.filePath;
    const targetFilePath = symbolsById.get(edge.targetId)?.filePath;
    return sourceFilePath !== undefined && sourceFilePath === targetFilePath;
  });
}

describe("SQL, R, Proto, and GraphQL resolver pre-move parity golden", () => {
  it.each(cases)("$language preserves applicable cross-file and local output", ({
    language,
    files,
    expectedCrossFileKinds,
    expectedLocalKinds
  }) => {
    const result = resolveFixture(language, files);
    const crossFileEdges = exactCrossFileEdges(result);
    const localEdges = exactLocalEdges(result);

    if (expectedCrossFileKinds.length === 0) {
      expect(crossFileEdges).toEqual([]);
    } else {
      for (const kind of expectedCrossFileKinds) {
        expect(crossFileEdges.some((edge) => edge.kind === kind)).toBe(true);
      }
    }
    expect(localEdges.length).toBeGreaterThan(0);
    expect(
      [...crossFileEdges, ...localEdges].some((edge) =>
        [...expectedCrossFileKinds, ...expectedLocalKinds].includes(edge.kind)
      )
    ).toBe(true);
    expect(result).toMatchSnapshot();
  });

  it.each(cases)("$language keeps consumer-only cross-file targets unresolved while retaining local output", ({
    language,
    files,
    consumerPath,
    expectedLocalKinds
  }) => {
    const consumerSource = files[consumerPath];
    if (consumerSource === undefined) {
      throw new Error(`Missing consumer fixture: ${consumerPath}`);
    }
    const result = resolveFixture(language, { [consumerPath]: consumerSource });
    const crossFileEdges = exactCrossFileEdges(result);
    const localEdges = exactLocalEdges(result);

    expect(crossFileEdges).toEqual([]);
    expect(localEdges.length).toBeGreaterThan(0);
    expect(localEdges.some((edge) => expectedLocalKinds.includes(edge.kind))).toBe(true);
    expect(result).toMatchSnapshot();
  });
});
