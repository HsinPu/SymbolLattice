import { compareStableText } from "./order.js";
import type { SourcePosition, SourceRange, SymbolNode } from "./types.js";

/** A line range from one side of a Git unified-diff hunk. */
export interface GitLineRange {
  /** Git's one-based line position. A zero start is valid only for a zero-count range. */
  readonly start: number;
  /** The number of lines represented on this side of the hunk. */
  readonly count: number;
}

/** The old and new line ranges described by one unified-diff hunk header. */
export interface GitUnifiedHunk {
  readonly oldRange: GitLineRange;
  readonly newRange: GitLineRange;
}

/** Raised when a line that begins like a unified-hunk header is not valid Git syntax. */
export class GitHunkParseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GitHunkParseError";
  }
}

/**
 * Parses only unified hunk headers from a patch for one already-known file.
 * File paths, file status, and hunk body lines remain adapter concerns.
 */
export function parseGitUnifiedHunks(patchText: string): readonly GitUnifiedHunk[] {
  const hunks: GitUnifiedHunk[] = [];
  const lines = patchText.split(/\r\n|\n|\r/);

  for (const [index, line] of lines.entries()) {
    if (!line.startsWith("@@")) {
      continue;
    }

    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(line);
    if (match === null) {
      throw new GitHunkParseError(`Malformed Git unified hunk header on line ${index + 1}.`);
    }

    const oldStart = match[1];
    const newStart = match[3];
    if (oldStart === undefined || newStart === undefined) {
      throw new GitHunkParseError(`Malformed Git unified hunk header on line ${index + 1}.`);
    }

    hunks.push({
      oldRange: parseHeaderRange(oldStart, match[2], "old", index + 1),
      newRange: parseHeaderRange(newStart, match[4], "new", index + 1)
    });
  }

  return hunks;
}

/** The confidence tier of a single hunk side's local graph attribution. */
export type GitHunkAttributionState = "declaration" | "file" | "not-applicable";

/** Input required to attribute one old or new hunk side to indexed declarations. */
export interface GitHunkSideAttributionInput {
  readonly filePath: string;
  readonly range: GitLineRange;
  readonly symbols: readonly SymbolNode[];
  /** Maximum number of declaration anchors included in the response. */
  readonly limit: number;
}

/**
 * A bounded attribution for one hunk side. `file` and `not-applicable` have
 * no declaration items; their state is the intentionally explicit fallback.
 */
export interface GitHunkSymbolAttribution {
  readonly state: GitHunkAttributionState;
  readonly items: readonly SymbolNode[];
  /** Matching declaration count before the response bound was applied. */
  readonly total: number;
  readonly truncated: boolean;
}

interface DeclarationCandidate {
  readonly symbol: SymbolNode;
}

function parseHeaderRange(
  startText: string,
  countText: string | undefined,
  side: "old" | "new",
  lineNumber: number
): GitLineRange {
  const start = parseSafeNonNegativeInteger(startText, `${side} hunk start`, lineNumber);
  const count =
    countText === undefined
      ? 1
      : parseSafeNonNegativeInteger(countText, `${side} hunk count`, lineNumber);

  if (start === 0 && count !== 0) {
    throw new GitHunkParseError(
      `Git ${side} hunk range may start at zero only when its count is zero on line ${lineNumber}.`
    );
  }

  return { start, count };
}

function parseSafeNonNegativeInteger(value: string, label: string, lineNumber: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new GitHunkParseError(`Invalid ${label} on Git unified hunk header line ${lineNumber}.`);
  }
  return parsed;
}

function requireAnchorLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("Git hunk anchor limit must be a positive whole number.");
  }
}

function changedLineEnd(range: GitLineRange): number | null {
  if (!Number.isSafeInteger(range.start) || range.start < 0) {
    throw new RangeError("Git hunk line-range start must be a non-negative whole number.");
  }
  if (!Number.isSafeInteger(range.count) || range.count < 0) {
    throw new RangeError("Git hunk line-range count must be a non-negative whole number.");
  }
  if (range.count === 0) {
    return null;
  }
  if (range.start < 1 || range.count - 1 > Number.MAX_SAFE_INTEGER - range.start) {
    throw new RangeError("Git hunk line range exceeds the supported line-number bounds.");
  }
  return range.start + range.count - 1;
}

function hasValidDeclarationRange(symbol: SymbolNode): boolean {
  const { start, end } = symbol.range;
  return (
    Number.isSafeInteger(start.line) &&
    start.line > 0 &&
    Number.isSafeInteger(end.line) &&
    end.line >= start.line
  );
}

function overlapsChangedLines(symbol: SymbolNode, startLine: number, endLine: number): boolean {
  return symbol.range.start.line <= endLine && symbol.range.end.line >= startLine;
}

function comparePosition(left: SourcePosition, right: SourcePosition): number {
  if (left.line !== right.line) {
    return left.line - right.line;
  }
  return left.column - right.column;
}

function rangeContains(container: SourceRange, contained: SourceRange): boolean {
  return (
    comparePosition(container.start, contained.start) <= 0 &&
    comparePosition(container.end, contained.end) >= 0
  );
}

function hasSameRange(left: SourceRange, right: SourceRange): boolean {
  return comparePosition(left.start, right.start) === 0 && comparePosition(left.end, right.end) === 0;
}

function isMoreSpecific(candidate: DeclarationCandidate, reference: DeclarationCandidate): boolean {
  return (
    !hasSameRange(candidate.symbol.range, reference.symbol.range) &&
    rangeContains(reference.symbol.range, candidate.symbol.range)
  );
}

function compareDeclarationAnchors(left: SymbolNode, right: SymbolNode): number {
  const start = comparePosition(left.range.start, right.range.start);
  if (start !== 0) {
    return start;
  }

  const end = comparePosition(left.range.end, right.range.end);
  if (end !== 0) {
    return end;
  }

  const qualifiedName = compareStableText(left.qualifiedName, right.qualifiedName);
  if (qualifiedName !== 0) {
    return qualifiedName;
  }

  const name = compareStableText(left.name, right.name);
  if (name !== 0) {
    return name;
  }

  const kind = compareStableText(left.kind, right.kind);
  if (kind !== 0) {
    return kind;
  }

  const id = compareStableText(left.id, right.id);
  if (id !== 0) {
    return id;
  }

  return left.declarationOrdinal - right.declarationOrdinal;
}

function emptyAttribution(state: Exclude<GitHunkAttributionState, "declaration">): GitHunkSymbolAttribution {
  return { state, items: [], total: 0, truncated: false };
}

/**
 * Attributes one revision-local side of a unified hunk to declarations in the
 * same revision-local graph. A declaration that contains another matching
 * declaration is omitted, so a nested method is preferred over its enclosing
 * class while a hunk crossing sibling declarations keeps both anchors.
 */
export function attributeGitHunkSide(
  input: GitHunkSideAttributionInput
): GitHunkSymbolAttribution {
  requireAnchorLimit(input.limit);
  const endLine = changedLineEnd(input.range);
  if (endLine === null) {
    return emptyAttribution("not-applicable");
  }

  const candidates: DeclarationCandidate[] = input.symbols
    .filter(
      (symbol) =>
        symbol.filePath === input.filePath &&
        symbol.kind !== "file" &&
        hasValidDeclarationRange(symbol) &&
        overlapsChangedLines(symbol, input.range.start, endLine)
    )
    .map((symbol) => ({ symbol }));

  const anchors = candidates
    .filter(
      (candidate) =>
        !candidates.some(
          (other) => other !== candidate && isMoreSpecific(other, candidate)
        )
    )
    .map((candidate) => candidate.symbol)
    .sort(compareDeclarationAnchors);

  if (anchors.length === 0) {
    return emptyAttribution("file");
  }

  return {
    state: "declaration",
    items: anchors.slice(0, input.limit),
    total: anchors.length,
    truncated: anchors.length > input.limit
  };
}
