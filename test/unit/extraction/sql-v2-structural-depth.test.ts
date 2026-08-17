import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import type { ArtifactFacts, GraphEdge, SymbolNode } from "../../../src/domain/index.js";
import { extractSqlFileFacts } from "../../../src/extraction/sql.js";

function facts(sourceText: string, filePath = "db/schema.sql"): ArtifactFacts {
  return extractSqlFileFacts({ filePath, language: "sql", sourceText });
}

function resources(result: ArtifactFacts): readonly SymbolNode[] {
  return result.symbols.filter((symbol) => symbol.kind === "resource");
}

function contains(result: ArtifactFacts): readonly GraphEdge[] {
  return result.edges.filter((edge) => edge.kind === "contains");
}

function expectFileOnly(result: ArtifactFacts): void {
  expect(result.symbols).toHaveLength(1);
  expect(result.symbols[0]?.kind).toBe("file");
  expect(result.edges).toEqual([]);
  expect(result.pendingReferences).toEqual([]);
}

describe("PostgreSQL structural-only v2 SQL facts", () => {
  it("closes PG001 nested-comment phantom declarations at the lexical boundary", () => {
    expectFileOnly(facts("/* outer /* inner */ CREATE TABLE ghost (id integer); */"));
  });

  it.each([
    "CREATE TABLE select (id integer);",
    "CREATE TABLE public.t (id integer,);",
    "CREATE VIEW public.v AS SELECT FROM;"
  ])("does not emit exact facts for PG002 invalid or unsupported source: %s", (sourceText) => {
    expectFileOnly(facts(sourceText));
  });

  it("closes PG003 by retaining only the later structural table occurrence and no dependency", () => {
    const result = facts("CREATE VIEW public.v AS SELECT * FROM public.t; CREATE TABLE public.t (id integer);");
    expect(resources(result)).toMatchObject([
      {
        name: "public.t",
        qualifiedName: "db/schema.sql#sql-structural-v2:table:qualified:public.t",
        declarationOrdinal: 0,
        range: { start: { line: 1, column: 49 }, end: { line: 1, column: 83 } }
      }
    ]);
    expect(contains(result)).toMatchObject([
      {
        referenceName: "public.t",
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: "language.sql.structural-v2.create-table",
          stage: "syntax",
          candidateSymbolIds: [resources(result)[0]?.id]
        }
      }
    ]);
    expect(result.edges.filter((edge) => edge.kind !== "contains")).toEqual([]);
  });

  it("renders quoted reserved and Unicode identifiers with exact UTF-16 ranges", () => {
    const sourceText = '/* 前置😀 */ CREATE SCHEMA "架構"; CREATE TABLE "架構"."資料😀" ("識別碼" integer NOT NULL, PRIMARY KEY ("識別碼"));';
    const result = facts(sourceText, "targeted/unicode.sql");
    expect(resources(result)).toMatchObject([
      {
        name: '"架構"',
        qualifiedName: 'targeted/unicode.sql#sql-structural-v2:schema:unqualified:"架構"',
        range: { start: { line: 1, column: 12 }, end: { line: 1, column: 30 } }
      },
      {
        name: '"架構"."資料😀"',
        qualifiedName: 'targeted/unicode.sql#sql-structural-v2:table:qualified:"架構"."資料😀"',
        range: { start: { line: 1, column: 32 }, end: { line: 1, column: 102 } }
      }
    ]);
    for (const edge of contains(result)) {
      expect(edge.evidence?.candidateSymbolIds).toEqual([edge.targetId]);
    }
  });

  it("maps CRLF declaration ranges without counting the LF twice", () => {
    const result = facts('-- 前😀\r\nCREATE TABLE "架構"."表😀" (\r\n  "id" integer\r\n);\r\n');
    expect(resources(result)[0]).toMatchObject({
      name: '"架構"."表😀"',
      range: { start: { line: 2, column: 1 }, end: { line: 4, column: 2 } }
    });
  });

  it("keeps duplicate textual occurrences as separate ordinalled singleton facts", () => {
    const result = facts('CREATE TABLE "select" ("id" integer);\nCREATE TABLE "select" ("id" bigint);');
    expect(resources(result).map((resource) => [resource.name, resource.declarationOrdinal])).toEqual([
      ['"select"', 0],
      ['"select"', 1]
    ]);
    expect(contains(result).map((edge) => edge.evidence?.candidateSymbolIds)).toEqual(
      resources(result).map((resource) => [resource.id])
    );
  });

  it("accepts only complete schema/table grammar and rejects unsupported tails", () => {
    const result = facts([
      "CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION owner;",
      "CREATE TABLE IF NOT EXISTS audit.events (id numeric(10, 0) NOT NULL, note character varying(20), CONSTRAINT events_pk PRIMARY KEY (id));",
      "CREATE TABLE audit.inherited (id integer) INHERITS (audit.base);"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual(["audit", "audit.events"]);
    expect(result.edges).toHaveLength(2);
  });

  it("fails the whole file closed for lexical and resource-limit boundary violations", () => {
    const sources = [
      "SELECT 'unterminated; CREATE TABLE ghost (id integer);",
      "COPY public.t FROM STDIN;\nCREATE TABLE ghost (id integer);\n\\.\n",
      "SELECT (1; CREATE TABLE ghost (id integer););",
      "/*".repeat(33) + "payload" + "*/".repeat(33),
      "SELECT " + "(".repeat(65) + "1" + ")".repeat(65) + ";",
      "SELECT '" + "x".repeat(16_385) + "';",
      "SELECT x " + "x ".repeat(4_097),
      "SELECT 1;".repeat(129),
      "CREATE TABLE " + "x".repeat(64) + " (id integer);",
      "x".repeat(65_537)
    ] as const;
    for (const sourceText of sources) {
      expectFileOnly(facts(sourceText));
    }
  });

  it("rejects a newline-dense oversized file without allocating line starts and preserves its file range", () => {
    const sourceText = "\n".repeat(65_537);
    const result = facts(sourceText, "targeted/newlines.sql");
    expectFileOnly(result);
    expect(result.symbols[0]?.range).toEqual({
      start: { line: 1, column: 1 },
      end: { line: 65_538, column: 1 }
    });
  });

  it("proves newline-dense oversized SQL completes in an isolated low-heap worker", () => {
    const worker = spawnSync(
      process.execPath,
      [
        "--max-old-space-size=128",
        resolve("node_modules/vitest/vitest.mjs"),
        "run",
        "test/unit/extraction/sql-v2-low-heap-worker.test.ts",
        "--no-file-parallelism"
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, SQL_V2_LOW_HEAP_WORKER: "1" },
        encoding: "utf8",
        timeout: 30_000
      }
    );
    expect(worker.error).toBeUndefined();
    expect(worker.status, `${worker.stdout}\n${worker.stderr}`).toBe(0);
  });
});
