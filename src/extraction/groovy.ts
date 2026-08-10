import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface GroovyExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "groovy";
}

type GroovyContainerKind = "class" | "interface" | "trait" | "enum";
type GroovyDeclarationKind = GroovyContainerKind | "function";

interface GroovyDeclaration {
  readonly kind: GroovyDeclarationKind;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly superclass?: {
    readonly name: string;
    readonly start: number;
    readonly end: number;
  };
}

interface GroovyIdentifier {
  readonly name: string;
  readonly end: number;
}

const GROOVY_CONTAINER_KINDS: readonly GroovyContainerKind[] = [
  "class",
  "interface",
  "trait",
  "enum"
];

function lineStartsFor(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function positionFor(lineStarts: readonly number[], offset: number): SourcePosition {
  let lower = 0;
  let upper = lineStarts.length;
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) {
      lower = middle;
    } else {
      upper = middle;
    }
  }
  const lineStart = lineStarts[lower] ?? 0;
  return { line: lower + 1, column: offset - lineStart + 1 };
}

function rangeForSpan(lineStarts: readonly number[], start: number, end: number): SourceRange {
  return {
    start: positionFor(lineStarts, start),
    end: positionFor(lineStarts, end)
  };
}

function blankSourceSpan(characters: string[], start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    const character = characters[index];
    if (character !== "\r" && character !== "\n") {
      characters[index] = " ";
    }
  }
}

/**
 * Blanks regular and triple-quoted strings plus comments without moving source
 * offsets. Slashy and dollar-slashy strings are deliberately handled by the
 * top-level scanner as unsupported because their lexical context is ambiguous.
 */
function sanitizeGroovySource(sourceText: string): string | null {
  const characters = sourceText.split("");
  let index = 0;
  while (index < sourceText.length) {
    const character = sourceText[index];
    const next = sourceText[index + 1];
    if (character === "/" && next === "/") {
      const start = index;
      index += 2;
      while (index < sourceText.length && sourceText[index] !== "\n") {
        index += 1;
      }
      blankSourceSpan(characters, start, index);
      continue;
    }
    if (character === "/" && next === "*") {
      const start = index;
      index += 2;
      while (
        index + 1 < sourceText.length &&
        !(sourceText[index] === "*" && sourceText[index + 1] === "/")
      ) {
        index += 1;
      }
      if (index + 1 >= sourceText.length) {
        return null;
      }
      index += 2;
      blankSourceSpan(characters, start, index);
      continue;
    }
    if (
      character === "#" &&
      next === "!" &&
      (index === 0 || sourceText[index - 1] === "\n")
    ) {
      const start = index;
      index += 2;
      while (index < sourceText.length && sourceText[index] !== "\n") {
        index += 1;
      }
      blankSourceSpan(characters, start, index);
      continue;
    }
    if (character !== "'" && character !== '"') {
      index += 1;
      continue;
    }

    const quote = character;
    const triple = sourceText[index + 1] === quote && sourceText[index + 2] === quote;
    const start = index;
    index += triple ? 3 : 1;
    let closed = false;
    while (index < sourceText.length) {
      const stringCharacter = sourceText[index];
      if (stringCharacter === "\\") {
        if (index + 1 >= sourceText.length) {
          return null;
        }
        index += 2;
        continue;
      }
      if (
        triple &&
        stringCharacter === quote &&
        sourceText[index + 1] === quote &&
        sourceText[index + 2] === quote
      ) {
        index += 3;
        closed = true;
        break;
      }
      if (!triple && stringCharacter === quote) {
        index += 1;
        closed = true;
        break;
      }
      if (!triple && (stringCharacter === "\r" || stringCharacter === "\n")) {
        return null;
      }
      index += 1;
    }
    if (!closed) {
      return null;
    }
    blankSourceSpan(characters, start, index);
  }
  return characters.join("");
}

function delimitersAreBalanced(sourceText: string): boolean {
  const openingForClose: ReadonlyMap<string, string> = new Map([
    ["}", "{"],
    [")", "("],
    ["]", "["]
  ]);
  const stack: string[] = [];
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character === "{" || character === "(" || character === "[") {
      stack.push(character);
      continue;
    }
    const expected = openingForClose.get(character ?? "");
    if (expected !== undefined && stack.pop() !== expected) {
      return false;
    }
  }
  return stack.length === 0;
}

function isWhitespace(character: string | undefined): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\r" ||
    character === "\n" ||
    character === "\f"
  );
}

function isIdentifierStart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z_$]/u.test(character);
}

function isIdentifierPart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_$]/u.test(character);
}

function skipWhitespace(sourceText: string, start: number): number {
  let index = start;
  while (isWhitespace(sourceText[index])) {
    index += 1;
  }
  return index;
}

function readIdentifier(sourceText: string, start: number): GroovyIdentifier | null {
  if (!isIdentifierStart(sourceText[start])) {
    return null;
  }
  let end = start + 1;
  while (isIdentifierPart(sourceText[end])) {
    end += 1;
  }
  return { name: sourceText.slice(start, end), end };
}

function matchesKeyword(sourceText: string, start: number, keyword: string): boolean {
  return (
    sourceText.startsWith(keyword, start) &&
    !isIdentifierPart(sourceText[start - 1]) &&
    !isIdentifierPart(sourceText[start + keyword.length])
  );
}

function containerKindAt(sourceText: string, start: number): GroovyContainerKind | null {
  for (const kind of GROOVY_CONTAINER_KINDS) {
    if (matchesKeyword(sourceText, start, kind)) {
      return kind;
    }
  }
  return null;
}

function declarationKeywordAt(sourceText: string, start: number): GroovyDeclarationKind | null {
  const container = containerKindAt(sourceText, start);
  if (container !== null) {
    return container;
  }
  return matchesKeyword(sourceText, start, "def") ? "function" : null;
}

function matchingDelimiter(
  sourceText: string,
  openingIndex: number,
  opening: string,
  closing: string
): number | null {
  let depth = 0;
  for (let index = openingIndex; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character === opening) {
      depth += 1;
      continue;
    }
    if (character === closing) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return null;
}

function headerOpeningBrace(sourceText: string, start: number): number | null {
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  for (let index = start; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character === "(") {
      parenthesisDepth += 1;
      continue;
    }
    if (character === ")") {
      if (parenthesisDepth === 0) {
        return null;
      }
      parenthesisDepth -= 1;
      continue;
    }
    if (character === "[") {
      bracketDepth += 1;
      continue;
    }
    if (character === "]") {
      if (bracketDepth === 0) {
        return null;
      }
      bracketDepth -= 1;
      continue;
    }
    if (parenthesisDepth !== 0 || bracketDepth !== 0) {
      continue;
    }
    if (character === "{") {
      return index;
    }
    if (character === "}" || character === ";" || character === "=") {
      return null;
    }
    if (declarationKeywordAt(sourceText, index) !== null) {
      return null;
    }
  }
  return null;
}

function directContainerDeclaration(
  sourceText: string,
  start: number,
  kind: GroovyContainerKind
): GroovyDeclaration | null {
  if (sourceText[start - 1] === "@") {
    return null;
  }
  const name = readIdentifier(sourceText, skipWhitespace(sourceText, start + kind.length));
  if (name === null) {
    return null;
  }
  const openingBrace = headerOpeningBrace(sourceText, name.end);
  if (openingBrace === null) {
    return null;
  }
  const closingBrace = matchingDelimiter(sourceText, openingBrace, "{", "}");
  if (closingBrace === null) {
    return null;
  }
  const header = sourceText.slice(name.end, openingBrace);
  const superclassMatch =
    kind === "class"
      ? /^\s+extends\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*$/u.exec(header)
      : null;
  const superclassName = superclassMatch?.[1];
  const superclassOffset =
    superclassName === undefined ? -1 : header.indexOf(superclassName, superclassMatch?.index ?? 0);
  return {
    kind,
    name: name.name,
    start,
    end: closingBrace + 1,
    ...(superclassName === undefined || superclassOffset < 0
      ? {}
      : {
          superclass: {
            name: superclassName,
            start: name.end + superclassOffset,
            end: name.end + superclassOffset + superclassName.length
          }
        })
  };
}

function directFunctionDeclaration(sourceText: string, start: number): GroovyDeclaration | null {
  const name = readIdentifier(sourceText, skipWhitespace(sourceText, start + "def".length));
  if (name === null) {
    return null;
  }
  const openingParenthesis = skipWhitespace(sourceText, name.end);
  if (sourceText[openingParenthesis] !== "(") {
    return null;
  }
  const closingParenthesis = matchingDelimiter(sourceText, openingParenthesis, "(", ")");
  if (closingParenthesis === null) {
    return null;
  }
  const openingBrace = headerOpeningBrace(sourceText, closingParenthesis + 1);
  if (openingBrace === null) {
    return null;
  }
  const closingBrace = matchingDelimiter(sourceText, openingBrace, "{", "}");
  return closingBrace === null
    ? null
    : { kind: "function", name: name.name, start, end: closingBrace + 1 };
}

function directGroovyDeclaration(sourceText: string, start: number): GroovyDeclaration | null {
  const container = containerKindAt(sourceText, start);
  if (container !== null) {
    return directContainerDeclaration(sourceText, start, container);
  }
  return matchesKeyword(sourceText, start, "def")
    ? directFunctionDeclaration(sourceText, start)
    : null;
}

function isIncompleteContainerDeclaration(sourceText: string, start: number): boolean {
  const kind = containerKindAt(sourceText, start);
  if (kind === null || sourceText[start - 1] === "@") {
    return false;
  }
  return readIdentifier(sourceText, skipWhitespace(sourceText, start + kind.length)) !== null;
}

/**
 * Extracts only complete top-level Groovy declarations. An unmasked slash at
 * script scope intentionally rejects the file because slashy literals require
 * context-sensitive tokenization to distinguish them safely from division.
 */
function staticGroovyDeclarations(sourceText: string): readonly GroovyDeclaration[] | null {
  const sanitized = sanitizeGroovySource(sourceText);
  if (sanitized === null || !delimitersAreBalanced(sanitized)) {
    return null;
  }

  const declarations: GroovyDeclaration[] = [];
  let braceDepth = 0;
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  for (let index = 0; index < sanitized.length; ) {
    const character = sanitized[index];
    if (braceDepth === 0 && parenthesisDepth === 0 && bracketDepth === 0) {
      if (character === "/" || (character === "$" && sanitized[index + 1] === "/")) {
        return null;
      }
      const declaration = directGroovyDeclaration(sanitized, index);
      if (declaration !== null) {
        declarations.push(declaration);
        index = declaration.end;
        continue;
      }
      if (isIncompleteContainerDeclaration(sanitized, index)) {
        return null;
      }
    }

    if (character === "{") {
      braceDepth += 1;
    } else if (character === "}") {
      braceDepth -= 1;
    } else if (character === "(") {
      parenthesisDepth += 1;
    } else if (character === ")") {
      parenthesisDepth -= 1;
    } else if (character === "[") {
      bracketDepth += 1;
    } else if (character === "]") {
      bracketDepth -= 1;
    }
    index += 1;
  }

  return braceDepth === 0 && parenthesisDepth === 0 && bracketDepth === 0 ? declarations : null;
}

function hasOnlyGroovyDeclarations(
  sourceText: string,
  declarations: readonly GroovyDeclaration[]
): boolean {
  const sanitized = sanitizeGroovySource(sourceText);
  if (sanitized === null) {
    return false;
  }
  const remainder = sanitized.split("");
  for (const declaration of declarations) {
    blankSourceSpan(remainder, declaration.start, declaration.end);
  }
  return remainder.join("").trim().length === 0;
}

function symbolKindFor(
  declaration: GroovyDeclaration
): "class" | "interface" | "type" | "function" {
  switch (declaration.kind) {
    case "class":
      return "class";
    case "interface":
    case "trait":
      return "interface";
    case "enum":
      return "type";
    case "function":
      return "function";
  }
}

/**
 * Emits source-ranged Groovy declarations without claiming a full Groovy parser,
 * runtime dispatch, trait composition, or Grails framework behavior.
 */
export function extractGroovyFileFacts(input: GroovyExtractFileFactsInput): ArtifactFacts {
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
    range: rangeForSpan(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();

  function addSymbol(inputSymbol: {
    readonly name: string;
    readonly kind: "class" | "interface" | "type" | "function";
    readonly qualifiedName: string;
    readonly range: SourceRange;
    readonly parent: SymbolNode;
    readonly containmentRuleId: string;
  }): SymbolNode {
    const identity = inputSymbol.qualifiedName + "\u0000" + inputSymbol.kind;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName: inputSymbol.qualifiedName,
        kind: inputSymbol.kind,
        declarationOrdinal
      }),
      name: inputSymbol.name,
      qualifiedName: inputSymbol.qualifiedName,
      kind: inputSymbol.kind,
      filePath: input.filePath,
      range: inputSymbol.range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    edges.push({
      id: createEdgeId({
        sourceId: inputSymbol.parent.id,
        targetId: symbol.id,
        kind: "contains",
        line: inputSymbol.range.start.line,
        column: inputSymbol.range.start.column,
        referenceName: symbol.name
      }),
      sourceId: inputSymbol.parent.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range: inputSymbol.range,
      resolution: "exact",
      confidence: 1,
      referenceName: symbol.name,
      evidence: {
        ruleId: inputSymbol.containmentRuleId,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
    return symbol;
  }

  const declarations = staticGroovyDeclarations(input.sourceText) ?? [];
  const declarationSymbols: Array<{
    readonly declaration: GroovyDeclaration;
    readonly symbol: SymbolNode;
  }> = [];
  for (const declaration of declarations) {
    const symbol = addSymbol({
      name: declaration.name,
      kind: symbolKindFor(declaration),
      qualifiedName: input.filePath + "#" + declaration.kind + ":" + declaration.name,
      range: rangeForSpan(lineStarts, declaration.start, declaration.end),
      parent: fileNode,
      containmentRuleId: "language.groovy." + declaration.kind + ".direct-top-level"
    });
    declarationSymbols.push({ declaration, symbol });
  }

  if (hasOnlyGroovyDeclarations(input.sourceText, declarations)) {
    for (const source of declarationSymbols) {
      const superclass = source.declaration.superclass;
      if (superclass === undefined) {
        continue;
      }
      const sources = declarationSymbols.filter(
        (candidate) =>
          candidate.declaration.kind === "class" && candidate.declaration.name === source.declaration.name
      );
      const targets = declarationSymbols.filter(
        (candidate) =>
          candidate.declaration.kind === "class" && candidate.declaration.name === superclass.name
      );
      const target = sources.length === 1 && targets.length === 1 ? targets[0] : undefined;
      if (target === undefined || target.symbol.id === source.symbol.id) {
        continue;
      }
      const range = rangeForSpan(lineStarts, superclass.start, superclass.end);
      edges.push({
        id: createEdgeId({
          sourceId: source.symbol.id,
          targetId: target.symbol.id,
          kind: "extends",
          line: range.start.line,
          column: range.start.column,
          referenceName: superclass.name
        }),
        sourceId: source.symbol.id,
        targetId: target.symbol.id,
        kind: "extends",
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName: superclass.name,
        evidence: {
          ruleId: "syntax.groovy.same-file.unique-direct-class-superclass",
          stage: "syntax",
          candidateSymbolIds: [target.symbol.id]
        }
      });
    }
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
