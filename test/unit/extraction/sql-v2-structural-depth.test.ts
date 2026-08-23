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

  it("accepts complete schema/table grammar including inheritance tails", () => {
    const result = facts([
      "CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION owner;",
      "CREATE TABLE IF NOT EXISTS audit.events (id numeric(10, 0) NOT NULL, note character varying(20), CONSTRAINT events_pk PRIMARY KEY (id));",
      "CREATE TABLE audit.inherited (id integer) INHERITS (audit.base);",
      "CREATE TABLE audit.inherited_key (local_id integer, PRIMARY KEY (inherited_id, local_id)) INHERITS (audit.base);"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual(["audit", "audit.events", "audit.inherited", "audit.inherited_key"]);
    expect(result.edges).toHaveLength(4);
  });

  it("accepts psql-variable schema authorization without projecting the dynamic owner", () => {
    const result = facts("CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION :owner_role;");
    expect(resources(result).map((resource) => resource.name)).toEqual(["audit"]);
    expectFileOnly(facts("CREATE SCHEMA audit AUTHORIZATION :;"));
  });

  it("retains structural declarations across bounded large statement and token workloads", () => {
    const statementHeavy = facts(
      `${"SELECT 1;".repeat(800)}CREATE TABLE retained_after_statements (id integer);`
    );
    expect(resources(statementHeavy).map((resource) => resource.name)).toEqual([
      "retained_after_statements"
    ]);

    const tokenHeavy = facts(
      `SELECT ${"x ".repeat(20_000)}; CREATE TABLE retained_after_tokens (id integer);`
    );
    expect(resources(tokenHeavy).map((resource) => resource.name)).toEqual([
      "retained_after_tokens"
    ]);

    const sourceHeavy = facts(
      `${"-- bounded padding\n".repeat(4_000)}CREATE TABLE retained_after_source (id integer);`
    );
    expect(resources(sourceHeavy).map((resource) => resource.name)).toEqual([
      "retained_after_source"
    ]);
  });

  it("isolates supported inline psql result commands without admitting dynamic declarations", () => {
    const result = facts([
      "CREATE TABLE before_gset (id integer);",
      "SELECT 1 AS captured \\gset",
      "SELECT 'CREATE TABLE dynamic_ghost (id integer)' \\gexec",
      "SELECT 2 \\g results.out",
      "SELECT 3 AS line_command",
      "\\gset",
      "CREATE TABLE after_gexec (id integer);"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual([
      "before_gset",
      "after_gexec"
    ]);
    expectFileOnly(facts("CREATE TABLE hidden (id integer); SELECT 1 \\unknown"));
  });

  it("isolates a macro-expanded psql statement with source-level unmatched closings", () => {
    const result = facts([
      "CREATE TABLE before_macro (id integer);",
      "SELECT count(*) FROM :fn true) bulk JOIN :fn false) rowbyrow USING (path);",
      "CREATE TABLE after_macro (id integer);"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual([
      "before_macro",
      "after_macro"
    ]);
    expectFileOnly(facts("CREATE TABLE hidden (id integer); SELECT 1);"));
  });

  it("keeps backslashes literal in standard strings while retaining E-string escapes", () => {
    const result = facts("SELECT 'different\\'; CREATE TABLE after_standard_string (id integer);");
    expect(resources(result).map((resource) => resource.name)).toEqual(["after_standard_string"]);
    expectFileOnly(facts("SELECT E'unterminated\\'; CREATE TABLE hidden (id integer);"));
  });

  it("isolates unsupported Unicode-escape tokens to their statement", () => {
    const result = facts([
      "CREATE TABLE before_unicode_escape (id integer);",
      'CREATE TABLE rejected_unicode_escape (U&"a\\0000b" integer);',
      "CREATE TABLE after_unicode_escape (id integer);"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual([
      "before_unicode_escape",
      "after_unicode_escape"
    ]);
  });

  it("isolates COPY FROM STDIN payloads from surrounding structural declarations", () => {
    const result = facts([
      "CREATE TABLE before_copy (id integer);",
      "COPY before_copy FROM STDIN;",
      "1",
      "CREATE TABLE payload_ghost (id integer);",
      "\\.",
      "CREATE TABLE after_copy (id integer);"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual([
      "before_copy",
      "after_copy"
    ]);
    expectFileOnly(facts("CREATE TABLE hidden (id integer); COPY hidden FROM STDIN;\n1\n"));
  });

  it("accepts PostgreSQL int and float type aliases", () => {
    const result = facts("CREATE TABLE metrics (device int, reading float);");
    expect(resources(result).map((resource) => resource.name)).toEqual(["metrics"]);
  });

  it("accepts PostgreSQL multiword time, double precision, and array types", () => {
    const result = facts([
      "CREATE TABLE measurements (",
      "  recorded_at timestamp without time zone NOT NULL,",
      "  local_time time with time zone,",
      "  reading double precision,",
      "  tags text[]",
      ");"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual(["measurements"]);
  });

  it("accepts empty tables, persistence modifiers, and user-defined column types", () => {
    const result = facts([
      "CREATE TABLE cache_marker();",
      "CREATE TEMP TABLE session_rows (payload app.custom_payload);",
      'CREATE UNLOGGED TABLE queue_rows (payload "CustomPayload"[]);'
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual([
      "cache_marker",
      "session_rows",
      "queue_rows"
    ]);
  });

  it("accepts bounded defaults and common column/table constraints", () => {
    const result = facts([
      "CREATE TABLE catalog_items (",
      "  id integer NOT NULL DEFAULT nextval('catalog_items_id_seq'),",
      "  code text UNIQUE,",
      "  parent_id integer REFERENCES catalog_items(id),",
      "  score numeric DEFAULT round(1.25, 1),",
      "  CONSTRAINT score_positive CHECK (score > 0),",
      "  CONSTRAINT catalog_items_parent_fk FOREIGN KEY (parent_id) REFERENCES catalog_items(id) ON DELETE CASCADE,",
      "  UNIQUE (code, parent_id),",
      "  EXCLUDE USING btree (id WITH =, code WITH =) WHERE (id > 0)",
      ");"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual(["catalog_items"]);
  });

  it("accepts bounded character modifiers and constraint timing/index options", () => {
    const result = facts([
      "CREATE TABLE constrained (",
      "  id integer PRIMARY KEY DEFERRABLE INITIALLY DEFERRED NOT NULL DEFAULT 1,",
      "  code char(10) UNIQUE DEFERRABLE INITIALLY DEFERRED,",
      "  score integer CONSTRAINT score_positive CHECK (score > 0),",
      "  CONSTRAINT constrained_code_key UNIQUE (code) USING INDEX TABLESPACE fastspace DEFERRABLE INITIALLY DEFERRED",
      ");"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual(["constrained"]);
  });

  it("accepts PostgreSQL LIKE, partition, and bounded storage tails", () => {
    const result = facts([
      "CREATE TABLE copied (LIKE public.source INCLUDING DEFAULTS EXCLUDING INDEXES);",
      "CREATE TABLE ranged (id integer) PARTITION BY RANGE (id);",
      "CREATE TABLE ranged_low PARTITION OF ranged FOR VALUES FROM (0) TO (100);",
      "CREATE TABLE ranged_default PARTITION OF ranged DEFAULT;",
      "CREATE TABLE configured (time timestamptz) WITH (tsdb.hypertable, tsdb.partition_column = 'time');",
      "CREATE TABLE placed (id integer) TABLESPACE fastspace;",
      "CREATE TABLE custom_am (id integer) USING heap;"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual([
      "copied",
      "ranged",
      "ranged_low",
      "ranged_default",
      "configured",
      "placed",
      "custom_am"
    ]);
  });

  it("accepts typed tables, temporal precision, and column collations", () => {
    const result = facts([
      "CREATE TABLE typed_measurements OF public.measurement_type;",
      'CREATE TABLE precise (at timestamp(0) with time zone, label text COLLATE "C");'
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual([
      "typed_measurements",
      "precise"
    ]);
  });

  it("accepts bounded CREATE TABLE AS query declarations", () => {
    const result = facts([
      "CREATE TABLE snapshot AS SELECT * FROM public.source;",
      "CREATE TEMP TABLE selected AS SELECT id, value FROM source WHERE active = true;"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual([
      "snapshot",
      "selected"
    ]);
  });

  it("accepts bounded psql placeholders in non-identity table grammar", () => {
    const result = facts([
      "CREATE TEMP TABLE staged (ts, device, temp) AS SELECT ts, device, temp FROM source;",
      'CREATE TABLE collated (name text COLLATE :"COLLATION");',
      "CREATE TABLE copied_dynamic (LIKE :SOURCE_TABLE);",
      "CREATE TABLE typed_dynamic (time :TIME_TYPE NOT NULL);",
      "CREATE TABLE queried_dynamic AS :QUERY;"
    ].join("\n"));
    expect(resources(result).map((resource) => resource.name)).toEqual([
      "staged",
      "collated",
      "copied_dynamic",
      "typed_dynamic",
      "queried_dynamic"
    ]);
  });

  it.each([
    "CREATE TABLE malformed (id integer) WITH storage;",
    "CREATE TABLE malformed PARTITION OF parent FOR VALUES FROM (0);",
    "CREATE TABLE malformed (LIKE parent INCLUDING imaginary);",
    "CREATE TABLE malformed OF;",
    "CREATE TABLE malformed (at timestamp(nope));",
    "CREATE TABLE malformed AS SELECT;",
    "CREATE TABLE malformed AS 'SELECT 1';",
    "CREATE TABLE malformed (value :);",
    "CREATE TABLE malformed AS :;"
  ])("rejects malformed modeled table extensions: %s", (sourceText) => {
    expectFileOnly(facts(sourceText));
  });

  it("fails the whole file closed for lexical and resource-limit boundary violations", () => {
    const sources = [
      "SELECT 'unterminated; CREATE TABLE ghost (id integer);",
      "SELECT (1; CREATE TABLE ghost (id integer););",
      "/*".repeat(33) + "payload" + "*/".repeat(33),
      "SELECT " + "(".repeat(65) + "1" + ")".repeat(65) + ";",
      "SELECT '" + "x".repeat(16_385) + "';",
      "SELECT x " + "x ".repeat(32_769),
      "SELECT 1;".repeat(1_025),
      "CREATE TABLE " + "x".repeat(64) + " (id integer);",
      "x".repeat(131_073)
    ] as const;
    for (const sourceText of sources) {
      expectFileOnly(facts(sourceText));
    }
  });

  it("rejects a newline-dense oversized file without allocating line starts and preserves its file range", () => {
    const sourceText = "\n".repeat(131_073);
    const result = facts(sourceText, "targeted/newlines.sql");
    expectFileOnly(result);
    expect(result.symbols[0]?.range).toEqual({
      start: { line: 1, column: 1 },
      end: { line: 131_074, column: 1 }
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
