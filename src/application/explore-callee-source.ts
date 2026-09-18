import { identifierTermGroups } from "../domain/identifier-search.js";
import { matchCallableSource, SOURCE_LEXICAL_LIMITS, type SourceLexicalMatch } from "../domain/source-lexical.js";
import type { SymbolNode } from "../domain/types.js";

export const EXPLORE_CALLEE_SOURCE_LIMITS = {
  maximumSymbols: 32,
  maximumSourceCharacters: 65_536,
  maximumDeclarationCharacters: SOURCE_LEXICAL_LIMITS.maximumDeclarationCharacters,
  maximumWindows: 2
} as const;

export interface ExploreCalleeSourceSearch {
  readonly policy: "exact-callee-source-terms-v1";
  readonly limits: typeof EXPLORE_CALLEE_SOURCE_LIMITS;
  readonly candidateCount: number;
  readonly scannedSymbols: number;
  readonly scannedFiles: number;
  readonly sourceCharacters: number;
  readonly matchedSymbols: number;
  readonly unavailableFiles: readonly string[];
  readonly truncated: boolean;
}

/** Search only already-requested, same-generation source for proven callees. */
export function matchExploreCalleeSource(
  candidates: readonly SymbolNode[],
  queryTerms: readonly string[],
  documents: ReadonlyMap<string, { readonly sourceText: string }>
): { matches: ReadonlyMap<string, readonly SourceLexicalMatch[]>; receipt: ExploreCalleeSourceSearch } {
  const groups = identifierTermGroups(queryTerms);
  const unique = [...new Map(candidates.map((symbol) => [symbol.id, symbol])).values()];
  const selected = unique.slice(0, EXPLORE_CALLEE_SOURCE_LIMITS.maximumSymbols);
  const byFile = new Map<string, SymbolNode[]>();
  for (const symbol of selected) byFile.set(symbol.filePath, [...(byFile.get(symbol.filePath) ?? []), symbol]);
  const matches = new Map<string, readonly SourceLexicalMatch[]>();
  const unavailableFiles: string[] = [];
  let scannedSymbols = 0, scannedFiles = 0, sourceCharacters = 0;
  let truncated = selected.length < unique.length;
  for (const [filePath, symbols] of byFile) {
    const document = documents.get(filePath);
    if (document === undefined) { unavailableFiles.push(filePath); continue; }
    const remaining = EXPLORE_CALLEE_SOURCE_LIMITS.maximumSourceCharacters - sourceCharacters;
    if (remaining <= 0) { truncated = true; break; }
    let text = document.sourceText.slice(0, remaining);
    sourceCharacters += text.length;
    if (document.sourceText.length > remaining) {
      truncated = true;
      // A cut identifier or CRLF boundary must not become a fabricated match.
      const lastBreak = Math.max(text.lastIndexOf("\n"), text.lastIndexOf("\r"), text.lastIndexOf("\u2028"), text.lastIndexOf("\u2029"));
      text = text.slice(0, Math.max(0, lastBreak));
    }
    scannedFiles += 1;
    scannedSymbols += symbols.length;
    const result = matchCallableSource(text, symbols, groups);
    truncated ||= result.truncated;
    // Unlike new retrieval seeds, these targets already have exact call
    // evidence. One literal query concept can justify supplementary source.
    for (const resultDocument of result.documents) {
      if (resultDocument.matches.length > 0) matches.set(resultDocument.symbolId, resultDocument.matches);
    }
  }
  return { matches, receipt: { policy: "exact-callee-source-terms-v1", limits: EXPLORE_CALLEE_SOURCE_LIMITS,
    candidateCount: unique.length, scannedSymbols, scannedFiles, sourceCharacters,
    matchedSymbols: matches.size, unavailableFiles, truncated } };
}
