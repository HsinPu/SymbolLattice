import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreTask, verifySourceExcerpts, verifyLexicalMatches, verifySourceReuse, productFingerprint } from "../../benchmarks/mcp/task-retrieval.mjs";

describe("task retrieval benchmark judgments", () => {
  it("rejects shared prefixes that cite missing, different or insufficient source owners", () => {
    const owner = { reference: "outer", source: { filePath: "a.ts", emittedCharacters: 8,
      range: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } },
      sourceIdentity: { id: "source:owner", fullFileCharacterOffsets: { start: 0, end: 10 } } } };
    const focus = { symbol: { filePath: "a.ts" }, sourceAvailability: "active-generation", source: null,
      sourceReuse: { originalCharacterOffsets: { start: 5, end: 10 }, originalEmittedCharacters: 4, reusedCharacters: 4,
        segments: [{ referenceIndex: 0, reference: "outer", sourceIdentityId: "source:owner", filePath: "a.ts",
          range: { start: { line: 2, column: 1 }, end: { line: 3, column: 1 } }, fullFileCharacterOffsets: { start: 5, end: 10 } }] } };
    const result = { focuses: [owner, focus] }, read = () => "one\r\ntwo\r\nthree";
    expect(verifySourceReuse(result, read)).toEqual({ verifiedReuses: 1, reusedCharacters: 4 });
    for (const mutate of [
      r => { r.focuses[1].sourceReuse.segments[0].referenceIndex = 1; },
      r => { r.focuses[0].source = null; },
      r => { r.focuses[1].sourceReuse.segments[0].filePath = "other.ts"; },
      r => { r.focuses[1].sourceReuse.segments[0].range.start.line = 1; },
      r => { r.focuses[1].sourceReuse.segments[0].fullFileCharacterOffsets.start = 6; },
      r => { r.focuses[0].source.sourceIdentity.fullFileCharacterOffsets.end = 9; }
    ]) { const corrupt = structuredClone(result); mutate(corrupt); expect(() => verifySourceReuse(corrupt, read)).toThrow(); }
  });
  it("requires callee source matches to have an exact directed call receipt and independent literal source", () => {
    const target = { id: "finish", filePath: "a.ts", range: { start: { line: 2, column: 1 }, end: { line: 2, column: 19 } } };
    const edge = { id: "call", sourceId: "run", targetId: target.id, filePath: "a.ts", kind: "calls", resolution: "exact" };
    const match = { filePath: "a.ts", token: "refund", range: { start: { line: 2, column: 3 }, end: { line: 2, column: 9 } } };
    const result = { focuses: [{ symbol: { id: "run", filePath: "a.ts" }, callees: { items: [{ symbol: target, edge }] } }],
      sourceWindows: [{ filePath: "a.ts", connectionEdgeIds: [edge.id], relatedSymbolIds: [target.id], sourceMatches: [match] }] };
    const read = () => "header\r\n  refund(payment);";
    expect(verifyLexicalMatches(result, read)).toEqual({ verifiedMatches: 1 });
    for (const override of [{ resolution: "heuristic" }, { sourceId: "wrong" }, { targetId: "wrong" }, { filePath: "other.ts" }]) {
      const corrupt = structuredClone(result);
      Object.assign(corrupt.focuses[0].callees.items[0].edge, override);
      expect(() => verifyLexicalMatches(corrupt, read)).toThrow("exact target receipt");
    }
    match.range.start.column = 2;
    expect(() => verifyLexicalMatches(result, read)).toThrow("Lexical source mismatch");
  });
  it("identifies changed product builds even when the package version is unchanged", () => {
    const root = mkdtempSync(join(tmpdir(), "SymbolLattice-product-hash-"));
    try {
      mkdirSync(join(root, "dist"));
      writeFileSync(join(root, "dist", "version.js"), "0.520.8");
      const before = productFingerprint(root);
      expect(productFingerprint(root)).toEqual(before);
      writeFileSync(join(root, "dist", "query.js"), "new ranking");
      expect(productFingerprint(root).sha256).not.toBe(before.sha256);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("verifies lexical receipt coordinates independently, rejecting a correct token at the wrong position", () => {
    const match = { filePath: "a.ts", token: "refund", range: { start: { line: 2, column: 3 }, end: { line: 2, column: 9 } } };
    const result = { focuses: [{ symbol: { filePath: "a.ts", range: { start: { line: 2, column: 1 }, end: { line: 2, column: 19 } } }, sourceMatches: [match] }] };
    const read = () => "header\r\n  refund(payment);";
    expect(verifyLexicalMatches(result, read)).toEqual({ verifiedMatches: 1 });
    match.range.start.column = 2;
    expect(() => verifyLexicalMatches(result, read)).toThrow("Lexical source mismatch");
    match.range.start.line = match.range.end.line = 1;
    expect(() => verifyLexicalMatches(result, read)).toThrow("outside its declaration");
    const beyondLine = { focuses: [{ symbol: { filePath: "a.ts",
      range: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } } }, sourceMatches: [{
      filePath: "a.ts", token: "refund", range: { start: { line: 1, column: 1 }, end: { line: 1, column: 20 } }
    }] }] };
    expect(() => verifyLexicalMatches(beyondLine, () => "refund\n")).toThrow("invalid line coordinates");
  });
  const task = { requiredFiles: ["a.ts", "b.ts"], supportingFiles: ["helper.ts"], irrelevantFiles: ["noise.ts"],
    evidence: [{ file: "a.ts", line: 5, text: "run()" }] };
  it("deduplicates files and excludes unjudged results from the precision denominator", () => {
    const focuses = ["a.ts", "a.ts", "helper.ts", "noise.ts", "unknown.ts"].map((filePath) => ({ symbol: { filePath } }));
    expect(scoreTask(task, { focuses })).toMatchObject({
      requiredFileRecall: 0.5, judgedPrecision: 2 / 3, judgedFraction: 0.75,
      falseNegatives: ["b.ts"], falsePositives: ["noise.ts"], unjudged: ["unknown.ts"], evidenceRecall: 0
    });
  });
  it("requires matching source content and line, independently of a file hit", () => {
    const result = { focuses: [{ symbol: { filePath: "a.ts" } }], sourceWindows: [
      { source: { filePath: "a.ts", lines: [{ line: 6, text: "run()" }] } }
    ] };
    expect(scoreTask(task, result).evidenceRecall).toBe(0);
    result.sourceWindows[0].source.lines[0].line = 5;
    expect(scoreTask(task, result).evidenceRecall).toBe(1);
    expect(scoreTask(task, {}).judgedPrecision).toBeNull();
    expect(scoreTask({ ...task, requiredFiles: [], evidence: [] }, {}).requiredFileRecall).toBeNull();
  });

  it("checks source bytes, CRLF offsets and line numbers against independent source text", () => {
    const source = { filePath: "a.ts", text: "run()\n", emittedCharacters: 6,
      range: { start: { line: 2, column: 1 }, end: { line: 3, column: 1 } },
      lines: [{ line: 2, text: "run()" }], sourceIdentity: { fullFileCharacterOffsets: { start: 6, end: 13 },
        contentSha256: createHash("sha256").update("run()\n").digest("hex") } };
    const read = () => "head\r\nrun()\r\ntail";
    expect(verifySourceExcerpts({ source }, read)).toEqual({ verifiedExcerpts: 1, emittedCharacters: 6, emittedLines: 1 });
    expect(() => verifySourceExcerpts({ source: { ...source, text: "fake()" } }, read)).toThrow("Source text mismatch");
    expect(() => verifySourceExcerpts({ source: { ...source, lines: [{ line: 1, text: "run()" }] } }, read)).toThrow();
  });
});
