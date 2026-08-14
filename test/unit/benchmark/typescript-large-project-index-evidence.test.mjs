import { describe, expect, it } from "vitest";

import {
  parseIndexEvidenceArguments,
  projectIndexEvidence
} from "../../../scripts/typescript-large-project-index-evidence.mjs";

const symbol = (id, name, line) => ({
  id,
  filePath: "src/example.ts",
  name,
  kind: "function",
  range: { start: { line, column: 1 }, end: { line, column: 5 } }
});

describe("TypeScript large-project index evidence", () => {
  it("requires explicit indexed project and output paths", () => {
    expect(() => parseIndexEvidenceArguments(["--project", "."])).toThrow("Required arguments");
    expect(parseIndexEvidenceArguments(["--project", ".", "--output", "result.json"])).toMatchObject({ project: expect.any(String), output: expect.any(String) });
  });

  it("exports only exact targeted edges with occurrence and real evidence", () => {
    const source = symbol("source", "source", 1);
    const target = symbol("target", "target", 5);
    const base = { sourceId: source.id, targetId: target.id, kind: "calls", filePath: "src/example.ts", range: { start: { line: 2, column: 3 }, end: { line: 2, column: 9 } }, referenceName: "target", confidence: 1, evidence: { ruleId: "syntax.call", stage: "syntax", candidateSymbolIds: [target.id] } };
    const result = projectIndexEvidence({ status: { projectPath: "fixture", generationId: "generation:1", indexedAt: "now", counts: { files: 1, symbols: 2, edges: 2, pendingReferences: 0 } }, snapshot: { symbols: [source, target], edges: [{ ...base, id: "exact", resolution: "exact" }, { ...base, id: "candidate", resolution: "candidate" }] } });
    expect(result.symbols).toHaveLength(2);
    expect(result.edges).toEqual([expect.objectContaining({ id: "exact", occurrence: expect.objectContaining({ filePath: "src/example.ts", range: { start: { line: 2, column: 3 } } }), evidence: { rule: "syntax.call", stage: "syntax", candidateSymbolIds: ["target"] } })]);
  });
});
