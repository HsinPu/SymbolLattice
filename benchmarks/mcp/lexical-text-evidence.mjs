import assert from "node:assert/strict";

/** Check displayed terms and UTF-16 token spans against both receipts and actual source. */
export function verifyLexicalTextEvidence(result, rendered, readSource) {
  const focusMatches = (result.focuses ?? []).map(focus => focus.sourceMatches ?? []).filter(matches => matches.length);
  const relatedMatches = (result.sourceWindows ?? []).flatMap(window => window.sourceMatches ?? []);
  const sections = rendered.split("\n").filter(line =>
    /^\s*Source terms \(lexical, not resolved relationships\): /u.test(line));
  const related = rendered.split("\n").filter(line =>
    /^Related source terms \(lexical, not resolved relationships\): /u.test(line));
  assert.equal(sections.length, focusMatches.length, "Missing or extra focus lexical section");
  assert.equal(related.length, relatedMatches.length ? 1 : 0, "Missing or extra related lexical section");
  let verifiedGroups = 0, verifiedTerms = 0;
  const verify = (line, matches) => {
    const expected = new Set(matches.map(match => {
      assert.equal(match.range.start.line, match.range.end.line, "Lexical receipt crosses source lines");
      return JSON.stringify([match.term, match.token, match.filePath,
        match.range.start.line, match.range.start.column, match.range.end.column, match.lineContext ?? null]);
    }));
    const actual = new Set();
    const entries = line.slice(line.indexOf(": ") + 2, -1).split("; ");
    for (const entry of entries) {
      const parsed = /^((?:`[^`]+`(?:, )?)+) → `([^`]+)` at `(.*):(\d+):(\d+)-(\d+)`( \(comment-prefixed line\))?$/u.exec(entry);
      assert.ok(parsed, "Incomplete or malformed lexical token citation");
      const [, termsText, token, filePath, row, start, end, comment] = parsed;
      const sourceLine = readSource(filePath).split(/\r\n|\r|\n|\u2028|\u2029/u)[Number(row) - 1];
      assert.ok(sourceLine !== undefined && Number(start) >= 1 && Number(end) <= sourceLine.length + 1,
        "Displayed lexical coordinates are outside source");
      assert.equal(sourceLine.slice(Number(start) - 1, Number(end) - 1), token,
        "Displayed token does not match source");
      const commentPrefixed = /^\s*\/\//u.test(sourceLine) || /\.pyi?$/iu.test(filePath) && /^\s*#/u.test(sourceLine);
      assert.equal(Boolean(comment), commentPrefixed, "Displayed comment provenance differs from source");
      for (const term of termsText.matchAll(/`([^`]+)`/gu)) {
        actual.add(JSON.stringify([term[1], token, filePath, Number(row), Number(start), Number(end),
          comment ? "comment-prefixed" : null]));
      }
      verifiedGroups++;
    }
    assert.deepEqual(actual, expected, "Displayed lexical facts differ from the structured receipts");
    verifiedTerms += actual.size;
  };
  sections.forEach((line, index) => verify(line, focusMatches[index]));
  if (related.length) verify(related[0], relatedMatches);
  return { verifiedGroups, verifiedTerms };
}
