import { describe, expect, it } from "vitest";

import { extractSqlFileFacts } from "../../../src/extraction/sql.js";

function facts(sourceText: string, filePath = "db/schema.sql") {
  return extractSqlFileFacts({ filePath, language: "sql", sourceText });
}

describe("PostgreSQL relation facts v0.478", () => {
  it("retains table types and literal foreign-key/INHERITS relation occurrences", () => {
    const result = facts([
      "CREATE TABLE parent (id integer);",
      "CREATE TABLE audit (id integer);",
      "CREATE TABLE child (",
      "  parent_id integer REFERENCES parent(id),",
      "  audit_id integer,",
      "  CONSTRAINT child_audit_fk FOREIGN KEY (audit_id) REFERENCES audit(id)",
      ") INHERITS (parent);"
    ].join("\n"));

    expect(result.sqlFacts).toMatchObject({ parserRejected: false });
    expect(result.sqlFacts?.types).toHaveLength(3);
    expect(result.sqlFacts?.relations).toEqual([
      expect.objectContaining({ sourceTableName: "child", targetTableName: "parent", relationKind: "references" }),
      expect.objectContaining({ sourceTableName: "child", targetTableName: "audit", relationKind: "references" }),
      expect.objectContaining({ sourceTableName: "child", targetTableName: "parent", relationKind: "extends" })
    ]);
    expect(result.sqlFacts?.relations.every((relation) => relation.range.start.line >= 1)).toBe(true);
  });

  it("keeps unsupported views/routines and malformed lexical input out of relation facts", () => {
    const unsupported = facts("CREATE VIEW child_view AS SELECT * FROM parent; CREATE FUNCTION run() RETURNS void AS $$ SELECT 1; $$ LANGUAGE sql;");
    expect(unsupported.sqlFacts?.relations).toEqual([]);

    const malformed = facts("CREATE TABLE child (parent_id integer REFERENCES parent(id);");
    expect(malformed.sqlFacts?.parserRejected).toBe(true);
    expect(malformed.sqlFacts?.types).toEqual([]);
    expect(malformed.sqlFacts?.relations).toEqual([]);
  });
});
