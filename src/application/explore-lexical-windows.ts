import type { ExploreFocus } from "./types.js";
import type { SourceLexicalMatch } from "../domain/source-lexical.js";

export const EXPLORE_LEXICAL_WINDOW_LIMITS = {
  maximumFocuses: 8, maximumMatchesPerFocus: 12, maximumFileCharacters: 65_536,
  maximumSourceCharacters: 524_288, maximumWindows: 2, maximumWindowLines: 24,
  paddingLines: 3, mergeGapLines: 3
} as const;

export interface ExploreLexicalWindowSearch {
  readonly policy: "focus-source-match-windows-v1";
  readonly limits: typeof EXPLORE_LEXICAL_WINDOW_LIMITS;
  readonly sourceCharacters: number;
  readonly verifiedMatches: number;
  readonly rejectedMatches: number;
  readonly unavailableFiles: readonly string[];
  readonly candidateCount: number;
  readonly selectedCount: number;
  readonly replacedCallWindowCount: number;
  readonly truncated: boolean;
}

/** Validate existing receipts against already-requested source; never fetch or infer a relation. */
export function exploreLexicalWindows(
  focuses: readonly ExploreFocus[],
  queryTerms: readonly string[],
  documents: ReadonlyMap<string, { readonly sourceText: string }> | undefined,
  covered: (match: SourceLexicalMatch) => boolean
) {
  const limits = EXPLORE_LEXICAL_WINDOW_LIMITS;
  const candidates: { focus: ExploreFocus; startLine: number; endLine: number; sourceMatches: SourceLexicalMatch[] }[] = [];
  const files = new Map<string, readonly string[]>();
  const unavailableFiles = new Set<string>();
  let sourceCharacters = 0, verifiedMatches = 0, rejectedMatches = 0;
  let truncated = focuses.length > limits.maximumFocuses;
  const compare = (a: SourceLexicalMatch["range"]["start"], b: SourceLexicalMatch["range"]["start"]) => a.line - b.line || a.column - b.column;
  for (const focus of [...focuses].sort((a, b) => a.rank - b.rank).slice(0, limits.maximumFocuses)) {
    const matches = focus.sourceMatches ?? [];
    truncated ||= matches.length > limits.maximumMatchesPerFocus;
    const seen = new Set<string>();
    for (const match of matches.slice(0, limits.maximumMatchesPerFocus)) {
      const { start, end } = match.range;
      if (match.filePath !== focus.symbol.filePath || !queryTerms.includes(match.term) ||
          ![start.line, start.column, end.line, end.column].every(n => Number.isSafeInteger(n) && n > 0) ||
          start.line !== end.line || end.column <= start.column || match.token.length === 0 ||
          compare(start, focus.symbol.range.start) < 0 || compare(end, focus.symbol.range.end) > 0) {
        rejectedMatches++; continue;
      }
      if (covered(match)) continue;
      if (focus.sourceAvailability !== "active-generation" || !documents?.has(match.filePath)) {
        unavailableFiles.add(match.filePath); continue;
      }
      let lines = files.get(match.filePath);
      if (lines === undefined) {
        const source = documents.get(match.filePath)!.sourceText;
        const length = Math.min(limits.maximumFileCharacters, limits.maximumSourceCharacters - sourceCharacters);
        let prefix = source.slice(0, length);
        sourceCharacters += prefix.length;
        if (source.length > prefix.length) {
          truncated = true;
          // Never verify a token from a cut line or split CRLF pair.
          const lastBreak = Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf("\r"), prefix.lastIndexOf("\u2028"), prefix.lastIndexOf("\u2029"));
          prefix = prefix.slice(0, Math.max(0, lastBreak));
        }
        lines = prefix.split(/\r\n|\r|\n|\u2028|\u2029/u);
        files.set(match.filePath, lines);
      }
      const line = lines[start.line - 1];
      if (line === undefined) { truncated = true; continue; }
      if (end.column > line.length + 1 || line.slice(start.column - 1, end.column - 1) !== match.token) {
        rejectedMatches++; continue;
      }
      const key = `${start.line}:${start.column}:${end.column}:${match.term}`;
      if (seen.has(key)) continue;
      seen.add(key); verifiedMatches++;
      candidates.push({ focus, startLine: Math.max(1, start.line - limits.paddingLines),
        endLine: Math.min(lines.length, end.line + limits.paddingLines), sourceMatches: [match] });
    }
  }
  const merged: typeof candidates = [];
  for (const candidate of candidates.sort((a, b) => a.focus.rank - b.focus.rank || a.startLine - b.startLine)) {
    const previous = merged.at(-1);
    if (previous?.focus.symbol.id === candidate.focus.symbol.id &&
        candidate.startLine <= previous.endLine + limits.mergeGapLines &&
        Math.max(previous.endLine, candidate.endLine) - previous.startLine + 1 <= limits.maximumWindowLines) {
      previous.endLine = Math.max(previous.endLine, candidate.endLine);
      previous.sourceMatches.push(...candidate.sourceMatches);
    } else merged.push(candidate);
  }
  const numeric = (item: typeof candidates[number]) => Number(item.sourceMatches.some(m => /^\p{N}{3,}$/u.test(m.term) && m.token.normalize("NFKC") === m.term));
  merged.sort((a, b) => numeric(b) - numeric(a) || a.focus.rank - b.focus.rank ||
    b.sourceMatches.length - a.sourceMatches.length || a.startLine - b.startLine);
  const receipt: ExploreLexicalWindowSearch = { policy: "focus-source-match-windows-v1", limits,
    sourceCharacters, verifiedMatches, rejectedMatches, unavailableFiles: [...unavailableFiles],
    candidateCount: merged.length, selectedCount: 0, replacedCallWindowCount: 0, truncated };
  return { candidates: merged, receipt };
}
