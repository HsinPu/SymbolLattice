import { describe, expect, it } from "vitest";
import { verifyLexicalTextEvidence } from "../../benchmarks/mcp/lexical-text-evidence.mjs";

describe("displayed lexical evidence source audit", () => {
  const source = "    server_version\n    # server_version";
  const matches = ["server", "version"].map(term => ({ term, token: "server_version", filePath: "db.py",
    range: { start: { line: 1, column: 5 }, end: { line: 1, column: 19 } } }));
  const result = { focuses: [{ sourceMatches: matches }] };
  const rendered = "  Source terms (lexical, not resolved relationships): `server`, `version` → `server_version` at `db.py:1:5-19`.";
  it("checks grouped and separate cites against actual source and preserves distinct comment facts", () => {
    expect(verifyLexicalTextEvidence(result, rendered, () => source)).toEqual({ verifiedGroups: 1, verifiedTerms: 2 });
    const separate = rendered.replace("`server`, `version`", "`server`")
      .replace(/\.$/u, "; `version` → `server_version` at `db.py:1:5-19`.");
    expect(verifyLexicalTextEvidence(result, separate, () => source)).toEqual({ verifiedGroups: 2, verifiedTerms: 2 });
    const comment = { ...matches[0], lineContext: "comment-prefixed",
      range: { start: { line: 2, column: 7 }, end: { line: 2, column: 21 } } };
    expect(verifyLexicalTextEvidence({ ...result, sourceWindows: [{ sourceMatches: [comment] }] },
      rendered + "\nRelated source terms (lexical, not resolved relationships): `server` → `server_version` at `db.py:2:7-21` (comment-prefixed line).",
      () => source)).toEqual({ verifiedGroups: 2, verifiedTerms: 3 });
  });
  it("rejects missing terms, invented terms, moved coordinates, changed tokens and removed provenance", () => {
    for (const wrong of [rendered.replace("`server`, ", ""), rendered.replace("`server`,", "`extra`,"),
      rendered.replace("1:5-19", "1:6-20"), rendered.replace("server_version` at", "server_versions` at"),
      rendered.replace("db.py", "other.py"), rendered.replace(" (lexical, not resolved relationships)", "")]) {
      expect(() => verifyLexicalTextEvidence(result, wrong, () => source)).toThrow();
    }
    const commentResult = { focuses: [{ sourceMatches: matches.map(match => ({ ...match, lineContext: "comment-prefixed" })) }] };
    expect(() => verifyLexicalTextEvidence(commentResult, rendered, () => source)).toThrow();
    expect(() => verifyLexicalTextEvidence(result, rendered, () => source.replace("server_version", "different_name"))).toThrow();
  });
  it("independently checks UTF-16 columns for supplementary Unicode letters", () => {
    const token = "輸出版本𝒱", match = { term: "版本", token, filePath: "a.ts",
      range: { start: { line: 1, column: 3 }, end: { line: 1, column: 9 } } };
    const line = "  Source terms (lexical, not resolved relationships): `版本` → `輸出版本𝒱` at `a.ts:1:3-9`.";
    expect(verifyLexicalTextEvidence({ focuses: [{ sourceMatches: [match] }] }, line, () => "  " + token))
      .toEqual({ verifiedGroups: 1, verifiedTerms: 1 });
    expect(() => verifyLexicalTextEvidence({ focuses: [{ sourceMatches: [match] }] }, line.replace("3-9", "3-8"), () => "  " + token)).toThrow();
  });
});
