import { identifierTermVariants, identifierWords } from "./identifier-search.js";
import type { SourceRange, SymbolNode } from "./types.js";

export const SOURCE_LEXICAL_POLICY = "callable-source-lexical-v1" as const;
export const SOURCE_LEXICAL_LIMITS = {
  maximumFiles: 128,
  maximumSymbols: 4096,
  maximumSymbolsPerFile: 128,
  maximumCharacters: 1_048_576,
  maximumFileCharacters: 65_536,
  maximumDeclarationCharacters: 8192
} as const;

/** Literal indexed-source evidence. Comments and strings can match; this is not a resolved relation. */
export interface SourceLexicalMatch {
  readonly term: string;
  readonly token: string;
  readonly filePath: string;
  readonly range: SourceRange;
}

export interface SourceLexicalCandidate {
  readonly symbolId: string;
  readonly matches: readonly SourceLexicalMatch[];
  readonly score?: number;
}

export const SOURCE_LEXICAL_SCORING = { policy: "bounded-callable-bm25-v1", k1: 1.2, b: 0.75, maximumScore: 1000 } as const;

export interface SourceLexicalDocument extends SourceLexicalCandidate {
  readonly tokens: number;
  readonly frequencies: readonly number[];
}

/** Saturating term frequency and length normalization over the bounded scanned corpus. */
export function scoreCallableSource(documents: readonly SourceLexicalDocument[]): readonly SourceLexicalCandidate[] {
  const nonempty = documents.filter((document) => document.tokens > 0);
  if (nonempty.length === 0) return [];
  const average = nonempty.reduce((sum, document) => sum + document.tokens, 0) / nonempty.length;
  const conceptCount = nonempty[0]!.frequencies.length;
  const idf = Array.from({ length: conceptCount }, (_, index) => {
    const frequency = nonempty.filter((document) => document.frequencies[index]! > 0).length;
    return frequency === 0 ? 0 : Math.log(1 + (nonempty.length - frequency + 0.5) / (frequency + 0.5));
  });
  const { k1, b, maximumScore } = SOURCE_LEXICAL_SCORING;
  const ceiling = idf.reduce((sum, weight) => sum + weight * (k1 + 1), 0);
  return nonempty.filter((document) => document.matches.length >= 2).map((document) => {
    const score = document.frequencies.reduce((sum, frequency, index) => sum +
      idf[index]! * frequency * (k1 + 1) / (frequency + k1 * (1 - b + b * document.tokens / average)), 0);
    return { symbolId: document.symbolId, matches: document.matches,
      score: ceiling === 0 ? 0 : Math.round(maximumScore * score / ceiling) };
  });
}

export interface SourceLexicalRetrieval {
  readonly policy: typeof SOURCE_LEXICAL_POLICY;
  readonly limits: typeof SOURCE_LEXICAL_LIMITS;
  readonly state: "searched" | "unavailable" | "single-concept";
  readonly scannedFiles: number;
  readonly scannedSymbols: number;
  readonly scannedCharacters: number;
  readonly truncated: boolean;
  readonly candidates: readonly SourceLexicalCandidate[];
}

/** Match whole identifier parts inside each callable's own indexed range. */
export function matchCallableSource(
  sourceText: string,
  symbols: readonly SymbolNode[],
  groups: readonly (readonly string[])[]
): { candidates: readonly SourceLexicalCandidate[]; documents: readonly SourceLexicalDocument[]; truncated: boolean } {
  const lines = sourceText.split(/\r\n|\r|\n|\u2028|\u2029/u);
  const candidates: SourceLexicalCandidate[] = [];
  const documents: SourceLexicalDocument[] = [];
  let truncated = false;
  for (const symbol of symbols) {
    if (!["function", "method", "entrypoint"].includes(symbol.kind)) continue;
    const found = new Map<number, SourceLexicalMatch>();
    const frequencies = groups.map(() => 0);
    let tokens = 0;
    let remaining: number = SOURCE_LEXICAL_LIMITS.maximumDeclarationCharacters;
    const endLine = Math.min(symbol.range.end.line, lines.length);
    if (symbol.range.end.line > lines.length) truncated = true;
    for (let line = symbol.range.start.line; line <= endLine; line += 1) {
      const original = lines[line - 1] ?? "";
      const start = line === symbol.range.start.line ? symbol.range.start.column - 1 : 0;
      const end = line === symbol.range.end.line ? symbol.range.end.column - 1 : original.length;
      const scoped = original.slice(start, end);
      if (scoped.length > remaining) truncated = true;
      const bounded = scoped.slice(0, remaining);
      for (const match of bounded.matchAll(/[\p{L}_$][\p{L}\p{N}_$]*/gu)) {
        const token = match[0];
        if (token.length > 128) continue;
        // A character budget must not create a fabricated partial identifier.
        if (match.index + token.length === bounded.length && bounded.length < scoped.length &&
            /[\p{L}\p{N}_$]/u.test(scoped[bounded.length]!)) continue;
        tokens += 1;
        const variants = new Set([token.normalize("NFKC").toLowerCase(),
          ...identifierWords(token).flatMap(identifierTermVariants)]);
        for (let index = 0; index < groups.length; index += 1) {
          if (!groups[index]!.some((term) => variants.has(term))) continue;
          frequencies[index]! += 1;
          if (found.has(index)) continue;
          const column = start + match.index + 1;
          found.set(index, { term: groups[index]![0]!, token, filePath: symbol.filePath,
            range: { start: { line, column }, end: { line, column: column + token.length } } });
        }
      }
      remaining -= bounded.length + 1;
      if (remaining <= 0) {
        if (line < endLine) truncated = true;
        break;
      }
    }
    // A lone incidental word is insufficient to introduce a body-only candidate.
    const matches = [...found.entries()].sort(([left], [right]) => left - right).map(([, match]) => match);
    if (found.size >= 2) candidates.push({ symbolId: symbol.id, matches });
    documents.push({ symbolId: symbol.id, matches, tokens, frequencies });
  }
  return { candidates, documents, truncated };
}
