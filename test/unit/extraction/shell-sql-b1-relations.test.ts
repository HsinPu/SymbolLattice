import { describe, expect, it } from "vitest";

import type { ArtifactFacts, GraphEdge, SymbolNode } from "../../../src/domain/index.js";
import { extractShellFileFacts } from "../../../src/extraction/shell.js";
import { extractSqlFileFacts } from "../../../src/extraction/sql.js";

function symbol(facts: ArtifactFacts, name: string, kind: SymbolNode["kind"]): SymbolNode {
  const matches = facts.symbols.filter((candidate) => candidate.name === name && candidate.kind === kind);
  expect(matches).toHaveLength(1);
  const selected = matches[0];
  if (selected === undefined) {
    throw new Error(`Missing ${kind} ${name}.`);
  }
  return selected;
}

function references(facts: ArtifactFacts): readonly GraphEdge[] {
  return facts.edges.filter((edge) => edge.kind === "references");
}

describe("Shell and SQL B1 semantic relationships", () => {
  it("emits an exact reference from a Shell file to one directly exported function", () => {
    const facts = extractShellFileFacts({
      filePath: "src/deploy.sh",
      language: "shell",
      sourceText: `deploy_helper() {
  :
}

export -f deploy_helper
`
    });
    const file = symbol(facts, "deploy.sh", "file");
    const helper = symbol(facts, "deploy_helper", "function");

    expect(references(facts)).toEqual([
      expect.objectContaining({
        sourceId: file.id,
        targetId: helper.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "deploy_helper",
        evidence: {
          ruleId: "syntax.shell.direct-top-level-export-function-reference",
          stage: "syntax",
          candidateSymbolIds: [helper.id]
        }
      })
    ]);
  });

  it("fails closed for unsafe Shell export shapes and competing declarations", () => {
    const sources = [
      `export -f deploy_helper\ndeploy_helper() {\n  :\n}\n`,
      `deploy_helper() {\n  :\n}\nexport -f "deploy_helper"\n`,
      `deploy_helper() {\n  :\n}\nexport -f deploy_helper other\n`,
      `deploy_helper() {\n  :\n}\nexport -f \${TARGET}\n`,
      `deploy_helper() {\n  :\n}\nalias deploy_helper=: \nexport -f deploy_helper\n`,
      `deploy_helper() {\n  :\n}\nexport() {\n  :\n}\nexport -f deploy_helper\n`,
      `deploy_helper() {\n  :\n} ; export() { :; }\nexport -f deploy_helper\n`,
      `deploy_helper() {\n  :\n}\ndeploy_helper() {\n  :\n}\nexport -f deploy_helper\n`
    ] as const;

    for (const sourceText of sources) {
      const facts = extractShellFileFacts({ filePath: "src/deploy.sh", language: "shell", sourceText });
      expect(references(facts), sourceText).toEqual([]);
    }
  });

  it("emits one exact SQL view-to-table reference for the bounded direct SELECT shape", () => {
    const facts = extractSqlFileFacts({
      filePath: "src/schema.sql",
      language: "sql",
      sourceText: `CREATE TABLE users (
  id INTEGER
);

CREATE VIEW active_users AS SELECT * FROM users;
`
    });
    const view = symbol(facts, "active_users", "resource");
    const table = symbol(facts, "users", "resource");

    expect(references(facts)).toEqual([
      expect.objectContaining({
        sourceId: view.id,
        targetId: table.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "users",
        evidence: {
          ruleId: "syntax.sql.same-file.unique-direct-view-table-reference",
          stage: "syntax",
          candidateSymbolIds: [table.id]
        }
      })
    ]);
  });

  it("fails closed for SQL references that are external, ambiguous, qualified differently, or complex", () => {
    const sources = [
      `CREATE VIEW active_users AS SELECT * FROM users;`,
      `CREATE TABLE users (id INTEGER);\nCREATE TABLE users (id INTEGER);\nCREATE VIEW active_users AS SELECT * FROM users;`,
      `CREATE TABLE app.users (id INTEGER);\nCREATE VIEW active_users AS SELECT * FROM users;`,
      `CREATE TABLE users (id INTEGER);\nSET search_path TO other;\nCREATE VIEW active_users AS SELECT * FROM users;`,
      `CREATE TABLE users (id INTEGER);\nCREATE VIEW active_users AS WITH selected AS (SELECT * FROM users) SELECT * FROM selected;`,
      `CREATE TABLE users (id INTEGER);\nCREATE VIEW active_users AS SELECT * FROM users JOIN roles ON roles.id = users.id;`,
      `CREATE TABLE users (id INTEGER);\nCREATE VIEW active_users AS SELECT * FROM users WHERE id > 0;`
    ] as const;

    for (const sourceText of sources) {
      const facts = extractSqlFileFacts({ filePath: "src/schema.sql", language: "sql", sourceText });
      expect(references(facts), sourceText).toEqual([]);
    }
  });
});
