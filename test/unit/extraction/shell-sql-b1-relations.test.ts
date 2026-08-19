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
  it("keeps export -f outside the structural Shell relationship contract", () => {
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

    expect(facts.edges.filter((edge) => edge.kind === "contains")).toEqual([
      expect.objectContaining({
        sourceId: file.id,
        targetId: helper.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "deploy_helper",
        evidence: {
          ruleId: "language.shell.function.direct-top-level",
          stage: "syntax",
          candidateSymbolIds: [helper.id]
        }
      })
    ]);
    expect(references(facts)).toEqual([]);
    expect(facts.pendingReferences).toEqual([]);
    expect(facts.exportBindings).toEqual([]);
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

  it("does not infer an SQL dependency from a view and a later same-file table", () => {
    const facts = extractSqlFileFacts({
      filePath: "src/schema.sql",
      language: "sql",
      sourceText: "CREATE VIEW public.v AS SELECT * FROM public.t; CREATE TABLE public.t (id integer);"
    });
    expect(symbol(facts, "public.t", "resource").declarationOrdinal).toBe(0);
    expect(references(facts)).toEqual([]);
  });
});
