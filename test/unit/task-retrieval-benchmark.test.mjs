import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreTask, verifySourceExcerpts, verifyLexicalMatches, verifySourceReuse, verifyUnresolvedCalls, verifyNameFollowups, verifyPropertyUseFollowups, verifyNumericQualifiers, productFingerprint } from "../../benchmarks/mcp/task-retrieval.mjs";

describe("task retrieval benchmark judgments", () => {
  it("verifies lexical windows against their original owner and rejects invented relationship claims", () => {
    const match = { term: '413', token: '413', filePath: 'a.ts', range: { start: { line: 2, column: 3 }, end: { line: 2, column: 6 } } };
    const result = { focuses: [{ rank: 1, symbol: { id: 'codes', filePath: 'a.ts',
      range: { start: { line: 1, column: 1 }, end: { line: 3, column: 2 } } }, sourceMatches: [match] }],
      sourceWindows: [{ reason: 'focus-source-match', focusRank: 1, filePath: 'a.ts', startLine: 1, endLine: 3,
        connectionEdgeIds: [], pathSpineIndexes: [], relatedSymbolIds: ['codes'], sourceMatches: [match] }] };
    const read = () => 'const codes = {\n  413\n}';
    expect(verifyLexicalMatches(result, read)).toEqual({ verifiedMatches: 2 });
    for (const mutate of [r => { r.sourceWindows[0].connectionEdgeIds = ['invented']; },
      r => { r.sourceWindows[0].focusRank = 2; }, r => { r.sourceWindows[0].sourceMatches[0].term = 'other'; },
      r => { r.sourceWindows[0].startLine = 3; }, r => { r.sourceWindows[0].filePath = 'other.ts'; },
      r => { r.sourceWindows[0].relatedSymbolIds = ['other']; }]) {
      const copy = JSON.parse(JSON.stringify(result)); mutate(copy);
      expect(() => verifyLexicalMatches(copy, read)).toThrow();
    }
  });
  it("rejects numeric qualifier claims based only on a digit prefix or an absent query term", () => {
    const result = { queryPlan: { identifierTerms: ['503'] }, focuses: [{ symbol: { name: 'handler503' },
      numericQualifier: { policy: 'numeric-query-qualifiers-v1', score: 500, terms: ['503'] } }] };
    expect(verifyNumericQualifiers(result)).toEqual({ verifiedQualifiers: 1 });
    result.focuses[0].symbol.id = 'anchor';
    result.queryPlan.numericCoverage = { policy: 'numeric-query-coverage-v1', symbolId: 'missing', terms: ['503'] };
    expect(() => verifyNumericQualifiers(result)).toThrow('retain its qualified focus');
    result.queryPlan.numericCoverage.symbolId = 'anchor';
    expect(verifyNumericQualifiers(result)).toEqual({ verifiedQualifiers: 1 });
    delete result.queryPlan.numericCoverage;
    result.focuses[0].symbol.name = 'handler5030';
    expect(() => verifyNumericQualifiers(result)).toThrow();
    result.focuses[0].sourceMatches = [{ term: '503', token: 'STATUS_503' }];
    expect(verifyNumericQualifiers(result)).toEqual({ verifiedQualifiers: 1 });
    result.queryPlan.identifierTerms = [];
    expect(() => verifyNumericQualifiers(result)).toThrow();
  });
  it("requires supplementary names to cite two original unresolved call receipts", () => {
    const calls = ['a', 'b'].map(id => ({ id, sourceId: id, targetId: null, kind: 'calls',
      resolution: 'unresolved', filePath: `${id}.py`, referenceName: 'resolver.resolve_error' }));
    const result = { queryPlan: { nameFollowupSearch: { emittedCount: 1 } }, focuses: [
      ...calls.map(edge => ({ symbol: { id: edge.sourceId, filePath: edge.filePath },
        unresolvedCalls: { state: 'available', items: [edge] } })),
      { symbol: { id: 'target', name: 'resolve_error', filePath: 'target.py' }, nameFollowup: {
        state: 'unresolved-name-match', scope: 'bounded-candidates', matchingDeclarationCount: 1, calls
      } }
    ] };
    expect(verifyNameFollowups(result)).toEqual({ verifiedFollowups: 1, verifiedOrigins: 2 });
    for (const mutate of [r => { r.focuses[2].nameFollowup.calls[0].targetId = 'target'; },
      r => { r.focuses[2].nameFollowup.calls.pop(); }, r => { r.focuses[2].symbol.name = 'different'; },
      r => { r.focuses[2].nameFollowup.calls[0].filePath = 'changed.py'; }]) {
      const changed = structuredClone(result); mutate(changed);
      expect(() => verifyNameFollowups(changed)).toThrow();
    }
  });
  it("requires a source-property followup to cite a selected exact reference", () => {
    const anchor = { id: "code", name: "BODY_413", filePath: "errors.js", kind: "variable", isExported: true };
    const source = { id: "run", name: "run", filePath: "parser.js", kind: "function" };
    const edge = { id: "use", sourceId: source.id, targetId: anchor.id, filePath: source.filePath,
      kind: "references", resolution: "exact", evidence: {
        ruleId: "module.commonjs-object-property-reference", resolutionPath: [source.filePath, anchor.filePath],
        commonJsBinding: { policy: "javascript-commonjs-object-property-reference-v1",
          importSite: { filePath: source.filePath }, exportSite: { filePath: anchor.filePath } }
      } };
    const result = { focuses: [{ symbol: anchor }, { symbol: source, reasons: ["source-property-use"],
      propertyUseFollowup: { policy: "source-property-use-followup-v1", anchorSymbolId: anchor.id,
        replacedFilePath: "generic.js", candidateFileCount: 1, edgeIds: [edge.id] } }],
      connections: [{ source, target: anchor, edge }], connectionsTruncated: false };
    expect(verifyPropertyUseFollowups(result)).toEqual({ verifiedFollowups: 1, verifiedEdges: 1, unverifiedEdges: 0 });
    for (const mutate of [
      r => { r.connections[0].edge.resolution = "heuristic"; },
      r => { r.connections[0].edge.evidence.resolutionPath[1] = "other.js"; },
      r => { r.focuses[1].propertyUseFollowup.anchorSymbolId = "missing"; },
      r => { r.connections[0].source.id = "other"; },
      r => { r.focuses[1].propertyUseFollowup.edgeIds = ["missing"]; }
    ]) { const corrupt = structuredClone(result); mutate(corrupt); expect(() => verifyPropertyUseFollowups(corrupt)).toThrow(); }
    const truncated = structuredClone(result);
    truncated.connections = [];
    truncated.connectionsTruncated = true;
    expect(verifyPropertyUseFollowups(truncated)).toEqual({ verifiedFollowups: 1, verifiedEdges: 0, unverifiedEdges: 1 });
  });
  it("independently rejects invented unknown-call targets, names, owners and source positions", () => {
    const edge = { sourceId: "owner", targetId: null, kind: "calls", resolution: "unresolved", confidence: 0,
      filePath: "a.py", referenceName: "client.send", range: { start: { line: 2, column: 5 }, end: { line: 2, column: 16 } },
      evidence: { ruleId: "syntax.python.member-call.unknown-receiver", candidateSymbolIds: [] } };
    const result = { focuses: [{ symbol: { id: "owner", filePath: "a.py",
      range: { start: { line: 1, column: 1 }, end: { line: 2, column: 18 } } },
      unresolvedCalls: { state: "available", items: [edge], truncated: false } }] };
    const read = () => "def run(client):\n    client.send()";
    expect(verifyUnresolvedCalls(result, read)).toEqual({ verifiedCalls: 1, verifiedPythonCallees: 1 });
    for (const mutate of [e => { e.targetId = 'guessed'; }, e => { e.referenceName = 'client.other'; },
      e => { e.sourceId = 'other'; }, e => { e.range.start.column = 1; }, e => { e.range.end.line = 3; }]) {
      const changed = structuredClone(result); mutate(changed.focuses[0].unresolvedCalls.items[0]);
      expect(() => verifyUnresolvedCalls(changed, read)).toThrow();
    }
  });
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
