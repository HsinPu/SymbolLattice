import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface GraphqlExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "graphql";
}

type GraphqlDeclarationKind = "type" | "interface" | "input" | "enum" | "scalar" | "union";

interface GraphqlDeclaration {
  readonly kind: GraphqlDeclarationKind;
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface GraphqlToken {
  readonly kind: "name" | "punctuation";
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface SanitizedGraphqlSource {
  readonly valid: boolean;
  readonly text: string;
}

interface ParsedGraphqlDeclaration {
  readonly declaration: GraphqlDeclaration;
  readonly endTokenIndex: number;
}

const GRAPHQL_DEFINITION_KEYWORDS: ReadonlySet<GraphqlDeclarationKind> = new Set([
  "type",
  "interface",
  "input",
  "enum",
  "scalar",
  "union"
]);
const GRAPHQL_BRACED_DEFINITION_KEYWORDS: ReadonlySet<GraphqlDeclarationKind> = new Set([
  "type",
  "interface",
  "input",
  "enum"
]);
const GRAPHQL_OPEN_TO_CLOSE: ReadonlyMap<string, string> = new Map([
  ["{", "}"],
  ["(", ")"],
  ["[", "]"]
]);
const GRAPHQL_CLOSE_TO_OPEN: ReadonlyMap<string, string> = new Map([
  ["}", "{"],
  [")", "("],
  ["]", "["]
]);
const GRAPHQL_PUNCTUATION: ReadonlySet<string> = new Set([
  "!",
  "$",
  "(",
  ")",
  ":",
  "=",
  "@",
  "[",
  "]",
  "{",
  "}",
  "|",
  "&",
  ".",
  "-"
]);
const GRAPHQL_NAME_START = /^[A-Za-z_]$/u;
const GRAPHQL_NAME_PART = /^[A-Za-z0-9_]$/u;

function lineStartsFor(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText.charCodeAt(index);
    if (character === 13) {
      if (sourceText.charCodeAt(index + 1) === 10) {
        index += 1;
      }
      starts.push(index + 1);
    } else if (character === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function positionFor(lineStarts: readonly number[], offset: number): SourcePosition {
  let lower = 0;
  let upper = lineStarts.length - 1;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) {
      lower = middle;
    } else {
      upper = middle - 1;
    }
  }
  const lineStart = lineStarts[lower] ?? 0;
  return { line: lower + 1, column: offset - lineStart + 1 };
}

function rangeFor(lineStarts: readonly number[], from: number, to: number): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function isGraphqlWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\t" || character === "\r" || character === "\n" || character === ",";
}

function isGraphqlNameStart(character: string | undefined): boolean {
  return character !== undefined && GRAPHQL_NAME_START.test(character);
}

function isGraphqlNamePart(character: string | undefined): boolean {
  return character !== undefined && GRAPHQL_NAME_PART.test(character);
}

/**
 * Blanks GraphQL comments and string values without changing offsets. The
 * scanner supports both standard and block strings, then independently checks
 * delimiter balance before any declaration becomes graph evidence.
 */
function sanitizeGraphqlSource(sourceText: string): SanitizedGraphqlSource {
  const text = sourceText.split("");
  let index = 0;

  function blank(position: number): void {
    if (text[position] !== "\r" && text[position] !== "\n") {
      text[position] = " ";
    }
  }

  function scanLineComment(): void {
    while (index < sourceText.length) {
      const character = sourceText[index];
      if (character === "\r" || character === "\n") {
        return;
      }
      blank(index);
      index += 1;
    }
  }

  function scanString(): boolean {
    blank(index);
    index += 1;
    while (index < sourceText.length) {
      const character = sourceText[index];
      if (character === "\r" || character === "\n") {
        return false;
      }
      if (character === "\\") {
        blank(index);
        index += 1;
        const escaped = sourceText[index];
        if (escaped === undefined || escaped === "\r" || escaped === "\n") {
          return false;
        }
        blank(index);
        index += 1;
        continue;
      }
      blank(index);
      index += 1;
      if (character === '"') {
        return true;
      }
    }
    return false;
  }

  function scanBlockString(): boolean {
    blank(index);
    blank(index + 1);
    blank(index + 2);
    index += 3;
    while (index < sourceText.length) {
      if (sourceText.slice(index, index + 3) === '\"\"\"') {
        blank(index);
        blank(index + 1);
        blank(index + 2);
        index += 3;
        return true;
      }
      if (sourceText[index] === "\\") {
        blank(index);
        index += 1;
        if (index >= sourceText.length) {
          return false;
        }
        blank(index);
        index += 1;
        continue;
      }
      blank(index);
      index += 1;
    }
    return false;
  }

  while (index < sourceText.length) {
    if (sourceText[index] === "#") {
      scanLineComment();
      continue;
    }
    if (sourceText.slice(index, index + 3) === '\"\"\"') {
      if (!scanBlockString()) {
        return { valid: false, text: "" };
      }
      continue;
    }
    if (sourceText[index] === '"') {
      if (!scanString()) {
        return { valid: false, text: "" };
      }
      continue;
    }
    index += 1;
  }

  const delimiters: string[] = [];
  for (const character of text) {
    if (GRAPHQL_OPEN_TO_CLOSE.has(character)) {
      delimiters.push(character);
      continue;
    }
    const expectedOpen = GRAPHQL_CLOSE_TO_OPEN.get(character);
    if (expectedOpen !== undefined && delimiters.pop() !== expectedOpen) {
      return { valid: false, text: "" };
    }
  }
  return delimiters.length === 0 ? { valid: true, text: text.join("") } : { valid: false, text: "" };
}

function graphqlTokens(text: string): readonly GraphqlToken[] | null {
  const tokens: GraphqlToken[] = [];
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (isGraphqlWhitespace(character)) {
      index += 1;
      continue;
    }
    if (isGraphqlNameStart(character)) {
      const start = index;
      index += 1;
      while (isGraphqlNamePart(text[index])) {
        index += 1;
      }
      tokens.push({ kind: "name", text: text.slice(start, index), start, end: index });
      continue;
    }
    if (character !== undefined && (GRAPHQL_PUNCTUATION.has(character) || /^[0-9]$/u.test(character))) {
      tokens.push({ kind: "punctuation", text: character, start: index, end: index + 1 });
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

function matchingBraceToken(tokens: readonly GraphqlToken[], openingIndex: number): number | null {
  let depth = 0;
  for (let index = openingIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.text === "{") {
      depth += 1;
    } else if (token?.text === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
      if (depth < 0) {
        return null;
      }
    }
  }
  return null;
}

function bracedDefinitionOpeningToken(
  tokens: readonly GraphqlToken[],
  startIndex: number
): number | null {
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) {
      return null;
    }
    if (token.text === "(") {
      parenthesisDepth += 1;
      continue;
    }
    if (token.text === ")") {
      parenthesisDepth -= 1;
      continue;
    }
    if (token.text === "[") {
      bracketDepth += 1;
      continue;
    }
    if (token.text === "]") {
      bracketDepth -= 1;
      continue;
    }
    if (token.text === "{" && parenthesisDepth === 0 && bracketDepth === 0) {
      return index;
    }
    if (token.text === "}" && parenthesisDepth === 0 && bracketDepth === 0) {
      return null;
    }
    if (
      parenthesisDepth === 0 &&
      bracketDepth === 0 &&
      token.kind === "name" &&
      GRAPHQL_DEFINITION_KEYWORDS.has(token.text as GraphqlDeclarationKind)
    ) {
      return null;
    }
  }
  return null;
}

function containsNameToken(tokens: readonly GraphqlToken[], start: number, end: number): boolean {
  return tokens.slice(start, end).some((token) => token.kind === "name");
}

function directBracedDefinition(
  tokens: readonly GraphqlToken[],
  index: number,
  kind: Extract<GraphqlDeclarationKind, "type" | "interface" | "input" | "enum">
): ParsedGraphqlDeclaration | null {
  const keyword = tokens[index];
  const name = tokens[index + 1];
  if (keyword === undefined || name === undefined || name.kind !== "name") {
    return null;
  }
  const opening = bracedDefinitionOpeningToken(tokens, index + 2);
  if (opening === null) {
    return null;
  }
  const closing = matchingBraceToken(tokens, opening);
  if (closing === null || !containsNameToken(tokens, opening + 1, closing)) {
    return null;
  }
  const closingToken = tokens[closing];
  if (closingToken === undefined) {
    return null;
  }
  return {
    declaration: { kind, name: name.text, start: keyword.start, end: closingToken.end },
    endTokenIndex: closing
  };
}

function directScalarDefinition(
  tokens: readonly GraphqlToken[],
  index: number
): ParsedGraphqlDeclaration | null {
  const keyword = tokens[index];
  const name = tokens[index + 1];
  if (keyword === undefined || name === undefined || name.kind !== "name") {
    return null;
  }
  return {
    declaration: { kind: "scalar", name: name.text, start: keyword.start, end: name.end },
    endTokenIndex: index + 1
  };
}

function directUnionDefinition(
  tokens: readonly GraphqlToken[],
  index: number
): ParsedGraphqlDeclaration | null {
  const keyword = tokens[index];
  const name = tokens[index + 1];
  const equals = tokens[index + 2];
  const firstMember = tokens[index + 3];
  if (
    keyword === undefined ||
    name === undefined ||
    name.kind !== "name" ||
    equals?.text !== "=" ||
    firstMember === undefined ||
    firstMember.kind !== "name"
  ) {
    return null;
  }

  let endTokenIndex = index + 3;
  while (tokens[endTokenIndex + 1]?.text === "|") {
    const member = tokens[endTokenIndex + 2];
    if (member === undefined || member.kind !== "name") {
      return null;
    }
    endTokenIndex += 2;
  }
  const endToken = tokens[endTokenIndex];
  if (endToken === undefined) {
    return null;
  }
  return {
    declaration: { kind: "union", name: name.text, start: keyword.start, end: endToken.end },
    endTokenIndex
  };
}

function directGraphqlDeclaration(
  tokens: readonly GraphqlToken[],
  index: number
): ParsedGraphqlDeclaration | null {
  const keyword = tokens[index];
  if (keyword === undefined || keyword.kind !== "name") {
    return null;
  }
  const kind = keyword.text as GraphqlDeclarationKind;
  if (GRAPHQL_BRACED_DEFINITION_KEYWORDS.has(kind)) {
    return directBracedDefinition(
      tokens,
      index,
      kind as Extract<GraphqlDeclarationKind, "type" | "interface" | "input" | "enum">
    );
  }
  if (kind === "scalar") {
    return directScalarDefinition(tokens, index);
  }
  if (kind === "union") {
    return directUnionDefinition(tokens, index);
  }
  return null;
}

/**
 * Extracts a bounded GraphQL schema-definition surface. Only complete direct
 * braced object/interface/input/enum definitions plus simple scalar and union
 * definitions become symbols; operations, extensions, fields, directives,
 * type references, execution, and schema validation remain out of scope.
 */
function staticGraphqlDeclarations(sourceText: string): readonly GraphqlDeclaration[] {
  const sanitized = sanitizeGraphqlSource(sourceText);
  if (!sanitized.valid) {
    return [];
  }
  const tokens = graphqlTokens(sanitized.text);
  if (tokens === null) {
    return [];
  }

  const declarations: GraphqlDeclaration[] = [];
  let braceDepth = 0;
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) {
      continue;
    }
    if (token.text === "{") {
      braceDepth += 1;
      continue;
    }
    if (token.text === "}") {
      braceDepth -= 1;
      continue;
    }
    if (token.text === "(") {
      parenthesisDepth += 1;
      continue;
    }
    if (token.text === ")") {
      parenthesisDepth -= 1;
      continue;
    }
    if (token.text === "[") {
      bracketDepth += 1;
      continue;
    }
    if (token.text === "]") {
      bracketDepth -= 1;
      continue;
    }
    if (braceDepth !== 0 || parenthesisDepth !== 0 || bracketDepth !== 0 || token.kind !== "name") {
      continue;
    }
    if (token.text === "extend") {
      return [];
    }
    if (!GRAPHQL_DEFINITION_KEYWORDS.has(token.text as GraphqlDeclarationKind)) {
      continue;
    }
    const parsed = directGraphqlDeclaration(tokens, index);
    if (parsed === null) {
      continue;
    }
    declarations.push(parsed.declaration);
    index = parsed.endTokenIndex;
  }
  return declarations;
}

function symbolKindFor(
  kind: GraphqlDeclarationKind
): Extract<SymbolNode["kind"], "class" | "interface" | "type"> {
  if (kind === "type") {
    return "class";
  }
  if (kind === "interface") {
    return "interface";
  }
  return "type";
}

/**
 * Emits direct GraphQL schema declaration facts without claiming a full
 * GraphQL parser, schema validation, resolver linkage, query execution, or
 * runtime service behavior.
 */
export function extractGraphqlFileFacts(input: GraphqlExtractFileFactsInput): ArtifactFacts {
  const declarations = staticGraphqlDeclarations(input.sourceText);
  const lineStarts = lineStartsFor(input.sourceText);
  const fileName = input.filePath.split(/[\\/]/u).at(-1) ?? input.filePath;
  const fileNode: SymbolNode = {
    id: createSymbolId({
      filePath: input.filePath,
      qualifiedName: input.filePath,
      kind: "file",
      declarationOrdinal: 0
    }),
    name: fileName,
    qualifiedName: input.filePath,
    kind: "file",
    filePath: input.filePath,
    range: rangeFor(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();

  for (const declaration of declarations) {
    const kind = symbolKindFor(declaration.kind);
    const qualifiedName = `${input.filePath}#${declaration.kind}:${declaration.name}`;
    const identity = `${qualifiedName}\u0000${kind}`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, declaration.start, declaration.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind,
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind,
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: symbol.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: symbol.name
      }),
      sourceId: fileNode.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: symbol.name,
      evidence: {
        ruleId: `language.graphql.${declaration.kind}.direct-definition`,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
  }

  return {
    symbols,
    edges,
    pendingReferences: [],
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: []
  };
}
