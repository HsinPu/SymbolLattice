import { describe, expect, it } from "vitest";
import { matchCallableSource, scoreCallableSource, SOURCE_LEXICAL_LIMITS } from "../../../src/domain/source-lexical.js";
import { identifierTermGroups } from "../../../src/domain/identifier-search.js";
import type { SymbolNode } from "../../../src/domain/types.js";

const callable = (start: number, end: number, kind: SymbolNode["kind"] = "function"): SymbolNode => ({
  id: "run", name: "run", qualifiedName: "src/work.ts#run", filePath: "src/work.ts", kind,
  isExported: false, range: { start: { line: start, column: 1 }, end: { line: end, column: 2 } }
});

describe("callable source lexical evidence", () => {
  it("preserves per-declaration frequencies and first occurrence receipts for repeated tokens", () => {
    const source = "payment refund payment\n  refund payment refund\n}";
    const second = { ...callable(2, 3), id: "second", filePath: "src/second.ts" };
    const result = matchCallableSource(source, [callable(1, 3), second], [["payment"], ["refund"]]);
    expect(result.documents.map(({ tokens, frequencies }) => ({ tokens, frequencies }))).toEqual([
      { tokens: 6, frequencies: [3, 3] }, { tokens: 3, frequencies: [1, 2] }
    ]);
    expect(result.documents[1]!.matches).toEqual([
      { term: "payment", token: "payment", filePath: "src/second.ts",
        range: { start: { line: 2, column: 10 }, end: { line: 2, column: 17 } } },
      { term: "refund", token: "refund", filePath: "src/second.ts",
        range: { start: { line: 2, column: 3 }, end: { line: 2, column: 9 } } }
    ]);
    const changedQuery = matchCallableSource(source, [second], [["refund"], ["absent"]]);
    expect(changedQuery.documents[0]!.frequencies).toEqual([2, 0]);
    expect(changedQuery.candidates).toEqual([]);
  });

  it("keeps matching after many distinct tokens and does not conflate identifier spellings", () => {
    const source = Array.from({ length: 4200 }, (_, index) => `unique${index}`).join("\n") +
      "\npayment refund\npaymentRefund payment_refund\n}";
    const symbols = Array.from({ length: 43 }, (_, index) => ({
      ...callable(index * 100 + 1, Math.min(index * 100 + 100, 4203)), id: String(index)
    }));
    const result = matchCallableSource(source, symbols, [["payment"], ["refund"]]);
    const last = result.documents.at(-1)!;
    expect(last.frequencies).toEqual([3, 3]);
    expect(last.matches.map(({ token, range }) => [token, range.start.line])).toEqual([
      ["payment", 4201], ["refund", 4201]
    ]);
    expect(result.truncated).toBe(false);
  });

  it("prefers concentrated evidence over the same terms buried in a long declaration and bounds repetition", () => {
    const matches = matchCallableSource("function run() {\n refund(payment);\n}", [callable(1, 3)], [["payment"], ["refund"]]).candidates[0]!.matches;
    const scored = scoreCallableSource([
      { symbolId: "focused", matches, tokens: 30, frequencies: [3, 3] },
      { symbolId: "incidental", matches, tokens: 1000, frequencies: [3, 3] },
      { symbolId: "repeated", matches, tokens: 1000, frequencies: [300, 300] }
    ]);
    expect(scored[0]!.score).toBeGreaterThan(scored[1]!.score!);
    expect(scored.every((candidate) => candidate.score! >= 0 && candidate.score! <= 1000)).toBe(true);
    expect(scored[2]!.score).toBeLessThan(scored[0]!.score! * 2);
  });
  it("finds identifier parts and inflections with exact UTF-16 columns across line endings", () => {
    const source = "function run() {\r\n  // 🧪\r\n  issueRefund(payment);\r\n}";
    const result = matchCallableSource(source, [callable(1, 4)], identifierTermGroups(["payments", "refunds"]));
    expect(result.candidates[0]?.matches).toEqual([
      { term: "payments", token: "payment", filePath: "src/work.ts", range: { start: { line: 3, column: 15 }, end: { line: 3, column: 22 } } },
      { term: "refunds", token: "issueRefund", filePath: "src/work.ts", range: { start: { line: 3, column: 3 }, end: { line: 3, column: 14 } } }
    ]);
  });

  it("does not lend words in neighboring declarations or class containers to a callable", () => {
    const source = "function run() {\n  payment();\n}\nfunction other() { refund(); }";
    const groups = identifierTermGroups(["payments", "refunds"]);
    expect(matchCallableSource(source, [callable(1, 3)], groups).candidates).toEqual([]);
    expect(matchCallableSource(source, [callable(1, 4, "class")], groups).candidates).toEqual([]);
    expect(matchCallableSource("unresolved counterpart\n}", [callable(1, 2)], identifierTermGroups(["resolving", "part"])).candidates).toEqual([]);
  });

  it("reports bounded scans and never invents a token by cutting its suffix", () => {
    const padding = " ".repeat(SOURCE_LEXICAL_LIMITS.maximumDeclarationCharacters - "payment refund".length);
    const source = `${padding}payment refundedElsewhere\n}`;
    const result = matchCallableSource(source, [callable(1, 2)], identifierTermGroups(["payment", "refund"]));
    expect(result.truncated).toBe(true);
    expect(result.candidates).toEqual([]);
  });

  it("matches conventional code abbreviations at word boundaries without fabricating a relationship", () => {
    const result = matchCallableSource("function run() {\n  forward(req, params, ctx);\n}", [callable(1, 3)],
      identifierTermGroups(["request", "parameters", "context"]));
    expect(result.candidates[0]?.matches.map((match) => [match.term, match.token])).toEqual([
      ["request", "req"], ["parameters", "params"], ["context", "ctx"]
    ]);
    expect(matchCallableSource("require(requested);\n}", [callable(1, 2)],
      identifierTermGroups(["request", "parameters"])).candidates).toEqual([]);
  });
});
