export interface SfcSourceSpan {
  readonly start: number;
  readonly end: number;
}

export interface SfcTemplateComponentOccurrence {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

function boundary(character: string | undefined): boolean {
  return character === undefined || /[\s/>]/u.test(character);
}

function endOfQuoted(sourceText: string, start: number, quote: string): number | null {
  for (let index = start + 1; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character === "\\") {
      index += 1;
    } else if (character === quote) {
      return index + 1;
    }
  }
  return null;
}

function endOfExpression(sourceText: string, start: number): number | null {
  let depth = 0;
  for (let index = start; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character === '"' || character === "'" || character === "`") {
      const end = endOfQuoted(sourceText, index, character);
      if (end === null) return null;
      index = end - 1;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return index + 1;
  }
  return null;
}

function excludedEnd(spans: readonly SfcSourceSpan[], offset: number): number | null {
  for (const span of spans) {
    if (span.start <= offset && offset < span.end) return span.end;
  }
  return null;
}

/**
 * Finds only direct PascalCase markup tags outside scripts, styles, comments,
 * and brace expressions. Framework-specific binding proof is applied later.
 */
export function directSfcTemplateComponentOccurrences(
  sourceText: string,
  excludedSpans: readonly SfcSourceSpan[] = []
): readonly SfcTemplateComponentOccurrence[] {
  const occurrences: SfcTemplateComponentOccurrence[] = [];
  for (let index = 0; index < sourceText.length;) {
    const excluded = excludedEnd(excludedSpans, index);
    if (excluded !== null) {
      index = excluded;
      continue;
    }
    if (sourceText.startsWith("<!--", index)) {
      const end = sourceText.indexOf("-->", index + 4);
      if (end < 0) return [];
      index = end + 3;
      continue;
    }
    if (sourceText[index] === "{") {
      const end = endOfExpression(sourceText, index);
      if (end === null) return [];
      index = end;
      continue;
    }
    if (sourceText[index] !== "<" || sourceText[index + 1] === "/") {
      index += 1;
      continue;
    }
    const nativeBlock = /^<(script|style)(?=[\s>])/iu.exec(sourceText.slice(index));
    if (nativeBlock?.[1] !== undefined) {
      const openingEnd = sourceText.indexOf(">", index + nativeBlock[0].length);
      if (openingEnd < 0) return [];
      const closing = new RegExp(`</${nativeBlock[1]}\\s*>`, "igu");
      closing.lastIndex = openingEnd + 1;
      const match = closing.exec(sourceText);
      if (match === null) return [];
      index = match.index + match[0].length;
      continue;
    }
    const match = /^<([A-Z][A-Za-z0-9_$]*)(?=[\s/>])/u.exec(sourceText.slice(index));
    if (match?.[1] !== undefined && boundary(sourceText[index + match[0].length])) {
      const start = index + 1;
      occurrences.push({ name: match[1], start, end: start + match[1].length });
      index = start + match[1].length;
      continue;
    }
    index += 1;
  }
  return occurrences;
}

/** Names assigned or updated in executable syntax cannot retain import identity. */
export function mutatedTopLevelNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  const visit = (node: import("typescript").Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      if (ts.isIdentifier(node.left)) names.add(node.left.text);
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) &&
      ts.isIdentifier(node.operand)
    ) {
      names.add(node.operand.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return names;
}
import ts from "typescript";
