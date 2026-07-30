import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type LocalBinding,
  type PendingReference,
  type ReferenceScope,
  type SourcePosition,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";

export interface NixExtractFileFactsInput {
  readonly filePath: string;
  readonly language: "nix";
  readonly sourceText: string;
}

interface NixAttrset {
  readonly start: number;
  readonly end: number;
}

interface NixLetBlock {
  readonly start: number;
  readonly end: number;
  readonly scopeId: string;
}

interface NixDeclaration {
  readonly name: string;
  readonly kind: Extract<SymbolKind, "function" | "variable">;
  readonly start: number;
  readonly end: number;
  readonly ruleSuffix: "binding" | "inherit";
}

interface NixStaticImport {
  readonly path: string;
  readonly start: number;
  readonly end: number;
}

const FILE_SCOPE_ID = "nix:file";
const ROOT_SCOPE_ID = "nix:returned-attrset";

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
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const start = lineStarts[middle] ?? 0;
    const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < start) {
      upper = middle - 1;
      continue;
    }
    if (offset >= next) {
      lower = middle + 1;
      continue;
    }
    return { line: middle + 1, column: offset - start };
  }
  const finalIndex = Math.max(0, lineStarts.length - 1);
  return {
    line: finalIndex + 1,
    column: Math.max(0, offset - (lineStarts[finalIndex] ?? 0))
  };
}

function rangeForSpan(
  lineStarts: readonly number[],
  start: number,
  end: number
): SourceRange {
  return {
    start: positionFor(lineStarts, start),
    end: positionFor(lineStarts, end)
  };
}

function blank(characters: string[], index: number): void {
  const character = characters[index];
  if (character !== "\n" && character !== "\r") {
    characters[index] = " ";
  }
}

/**
 * Keeps every source offset stable while removing syntax that may contain
 * declaration-looking text. An ambiguous or unterminated literal makes the
 * whole first-pass extraction decline rather than inventing symbols.
 */
function nixCodeMask(sourceText: string): string | null {
  const characters = sourceText.split("");
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];
    if (character === "#") {
      blank(characters, index);
      index += 1;
      while (index < characters.length && characters[index] !== "\n" && characters[index] !== "\r") {
        blank(characters, index);
        index += 1;
      }
      index -= 1;
      continue;
    }
    if (character === "/" && next === "*") {
      let depth = 1;
      blank(characters, index);
      blank(characters, index + 1);
      index += 2;
      while (index < characters.length && depth > 0) {
        if (characters[index] === "/" && characters[index + 1] === "*") {
          blank(characters, index);
          blank(characters, index + 1);
          depth += 1;
          index += 2;
          continue;
        }
        if (characters[index] === "*" && characters[index + 1] === "/") {
          blank(characters, index);
          blank(characters, index + 1);
          depth -= 1;
          index += 2;
          continue;
        }
        blank(characters, index);
        index += 1;
      }
      if (depth !== 0) {
        return null;
      }
      index -= 1;
      continue;
    }
    if (character === "\"") {
      blank(characters, index);
      index += 1;
      let closed = false;
      while (index < characters.length) {
        const current = characters[index];
        if (current === "\\") {
          blank(characters, index);
          blank(characters, index + 1);
          index += 2;
          continue;
        }
        blank(characters, index);
        if (current === "\"") {
          closed = true;
          index += 1;
          break;
        }
        index += 1;
      }
      if (!closed) {
        return null;
      }
      index -= 1;
      continue;
    }
    if (character === "'" && next === "'") {
      blank(characters, index);
      blank(characters, index + 1);
      index += 2;
      let closed = false;
      while (index < characters.length) {
        if (characters[index] === "'" && characters[index + 1] === "'") {
          if (characters[index + 2] === "'") {
            return null;
          }
          blank(characters, index);
          blank(characters, index + 1);
          closed = true;
          index += 2;
          break;
        }
        blank(characters, index);
        index += 1;
      }
      if (!closed) {
        return null;
      }
      index -= 1;
    }
  }
  return characters.join("");
}

function delimiterPairs(code: string): ReadonlyMap<number, number> | null {
  const stack: Array<{ readonly character: "(" | "[" | "{"; readonly index: number }> = [];
  const pairs = new Map<number, number>();
  const expectedOpen: Readonly<Record<")" | "]" | "}", "(" | "[" | "{">> = {
    ")": "(",
    "]": "[",
    "}": "{"
  };
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    if (character === "(" || character === "[" || character === "{") {
      stack.push({ character, index });
      continue;
    }
    if (character !== ")" && character !== "]" && character !== "}") {
      continue;
    }
    const opening = stack.pop();
    if (opening === undefined || opening.character !== expectedOpen[character]) {
      return null;
    }
    pairs.set(opening.index, index);
    pairs.set(index, opening.index);
  }
  return stack.length === 0 ? pairs : null;
}

function isIdentifierStart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z_]/u.test(character);
}

function isIdentifierPart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_'-]/u.test(character);
}

function skipWhitespace(code: string, start: number, end = code.length): number {
  let index = start;
  while (index < end && /\s/u.test(code[index] ?? "")) {
    index += 1;
  }
  return index;
}

function previousSignificant(code: string, before: number): number {
  let index = before - 1;
  while (index >= 0 && /\s/u.test(code[index] ?? "")) {
    index -= 1;
  }
  return index;
}

function nextSignificant(code: string, start: number): number {
  return skipWhitespace(code, start);
}

function readIdentifier(
  code: string,
  start: number,
  end = code.length
): { readonly name: string; readonly end: number } | null {
  if (!isIdentifierStart(code[start])) {
    return null;
  }
  let index = start + 1;
  while (index < end && isIdentifierPart(code[index])) {
    index += 1;
  }
  return { name: code.slice(start, index), end: index };
}

function readAttrPath(
  code: string,
  start: number,
  end: number
): { readonly name: string; readonly end: number } | null {
  const first = readIdentifier(code, start, end);
  if (first === null) {
    return null;
  }
  let name = first.name;
  let index = first.end;
  while (code[index] === ".") {
    const segment = readIdentifier(code, index + 1, end);
    if (segment === null) {
      return null;
    }
    name += "." + segment.name;
    index = segment.end;
  }
  return { name, end: index };
}

function wordAt(code: string, index: number, word: string): boolean {
  if (!code.startsWith(word, index)) {
    return false;
  }
  return !isIdentifierPart(code[index - 1]) && !isIdentifierPart(code[index + word.length]);
}

function previousWord(
  code: string,
  before: number
): { readonly word: string; readonly start: number; readonly end: number } | null {
  const end = previousSignificant(code, before) + 1;
  if (end <= 0 || !isIdentifierPart(code[end - 1])) {
    return null;
  }
  let start = end - 1;
  while (start > 0 && isIdentifierPart(code[start - 1])) {
    start -= 1;
  }
  return { word: code.slice(start, end), start, end };
}

function returnedAttrset(
  code: string,
  pairs: ReadonlyMap<number, number>
): NixAttrset | null {
  const stack: string[] = [];
  let result: NixAttrset | null = null;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    if (character === "(" || character === "[" || character === "{") {
      if (character === "{" && stack.length === 0) {
        const end = pairs.get(index);
        const after = end === undefined ? -1 : nextSignificant(code, end + 1);
        if (end !== undefined && code[after] !== ":" && isReturnedAttrsetCandidate(code, index)) {
          result = { start: index, end };
        }
      }
      stack.push(character);
      continue;
    }
    if (character === ")" || character === "]" || character === "}") {
      stack.pop();
    }
  }
  return result;
}

function isReturnedAttrsetCandidate(code: string, start: number): boolean {
  const before = previousSignificant(code, start);
  if (before < 0 || code[before] === ":") {
    return true;
  }
  const word = previousWord(code, start);
  if (word?.word === "in") {
    return true;
  }
  if (word?.word !== "rec") {
    return false;
  }
  const beforeRec = previousSignificant(code, word.start);
  return beforeRec < 0 || code[beforeRec] === ":" || previousWord(code, word.start)?.word === "in";
}

function statementEnd(code: string, start: number, end: number): number | null {
  let depth = 0;
  for (let index = start; index < end; index += 1) {
    const character = code[index];
    if (character === "(" || character === "[" || character === "{") {
      depth += 1;
      continue;
    }
    if (character === ")" || character === "]" || character === "}") {
      depth -= 1;
      if (depth < 0) {
        return null;
      }
      continue;
    }
    if (character === ";" && depth === 0) {
      return index;
    }
  }
  return null;
}

function isFunctionValue(
  code: string,
  start: number,
  end: number,
  pairs: ReadonlyMap<number, number>
): boolean {
  let index = skipWhitespace(code, start, end);
  const first = readIdentifier(code, index, end);
  if (first !== null) {
    index = first.end;
    if (code[index] === "@") {
      index = skipWhitespace(code, index + 1, end);
      if (code[index] !== "{") {
        return false;
      }
      const close = pairs.get(index);
      if (close === undefined || close >= end) {
        return false;
      }
      index = close + 1;
    }
    return code[skipWhitespace(code, index, end)] === ":";
  }
  if (code[index] !== "{") {
    return false;
  }
  const close = pairs.get(index);
  if (close === undefined || close >= end) {
    return false;
  }
  index = skipWhitespace(code, close + 1, end);
  if (code[index] === "@") {
    const alias = readIdentifier(code, skipWhitespace(code, index + 1, end), end);
    if (alias === null) {
      return false;
    }
    index = alias.end;
  }
  return code[skipWhitespace(code, index, end)] === ":";
}

function inheritedDeclarations(
  code: string,
  start: number,
  end: number,
  pairs: ReadonlyMap<number, number>
): readonly NixDeclaration[] {
  const declarations: NixDeclaration[] = [];
  let index = skipWhitespace(code, start + "inherit".length, end);
  if (code[index] === "(") {
    const close = pairs.get(index);
    if (close === undefined || close >= end) {
      return declarations;
    }
    index = close + 1;
  }
  while (index < end) {
    index = skipWhitespace(code, index, end);
    const identifier = readIdentifier(code, index, end);
    if (identifier === null) {
      index += 1;
      continue;
    }
    declarations.push({
      name: identifier.name,
      kind: "variable",
      start: index,
      end: identifier.end,
      ruleSuffix: "inherit"
    });
    index = identifier.end;
  }
  return declarations;
}

function directDeclarations(
  code: string,
  start: number,
  end: number,
  pairs: ReadonlyMap<number, number>
): readonly NixDeclaration[] | null {
  const declarations: NixDeclaration[] = [];
  let index = start;
  while (index < end) {
    index = skipWhitespace(code, index, end);
    if (index >= end) {
      break;
    }
    if (code[index] === ";") {
      index += 1;
      continue;
    }
    if (wordAt(code, index, "inherit")) {
      const terminal = statementEnd(code, index, end);
      if (terminal === null) {
        return null;
      }
      declarations.push(...inheritedDeclarations(code, index, terminal, pairs));
      index = terminal + 1;
      continue;
    }
    const attrPath = readAttrPath(code, index, end);
    if (attrPath === null) {
      const terminal = statementEnd(code, index, end);
      index = terminal === null ? index + 1 : terminal + 1;
      continue;
    }
    const equals = skipWhitespace(code, attrPath.end, end);
    if (code[equals] !== "=") {
      const terminal = statementEnd(code, index, end);
      index = terminal === null ? attrPath.end : terminal + 1;
      continue;
    }
    const terminal = statementEnd(code, equals + 1, end);
    if (terminal === null) {
      return null;
    }
    const valueStart = skipWhitespace(code, equals + 1, terminal);
    declarations.push({
      name: attrPath.name,
      kind: isFunctionValue(code, valueStart, terminal, pairs) ? "function" : "variable",
      start: index,
      end: terminal + 1,
      ruleSuffix: "binding"
    });
    index = terminal + 1;
  }
  return declarations;
}

function letBlocks(code: string): readonly NixLetBlock[] | null {
  const result: NixLetBlock[] = [];
  for (let index = 0; index < code.length; index += 1) {
    if (!wordAt(code, index, "let")) {
      continue;
    }
    let nested = 0;
    let cursor = index + "let".length;
    let closing: number | null = null;
    while (cursor < code.length) {
      if (wordAt(code, cursor, "let")) {
        nested += 1;
        cursor += "let".length;
        continue;
      }
      if (wordAt(code, cursor, "in")) {
        if (nested === 0) {
          closing = cursor;
          break;
        }
        nested -= 1;
        cursor += "in".length;
        continue;
      }
      cursor += 1;
    }
    if (closing === null) {
      return null;
    }
    result.push({
      start: index + "let".length,
      end: closing,
      scopeId: "nix:let:" + index
    });
  }
  return result;
}

function staticImports(code: string): readonly NixStaticImport[] {
  const imports: NixStaticImport[] = [];
  const expression = /\b(?:builtins\s*\.\s*)?import\s+((?:\.\.?\/)[A-Za-z0-9_./-]+)/gu;
  for (const match of code.matchAll(expression)) {
    const path = match[1];
    if (path === undefined) {
      continue;
    }
    const start = (match.index ?? 0) + match[0].lastIndexOf(path);
    imports.push({ path, start, end: start + path.length });
  }
  return imports;
}

/**
 * Extracts only syntax-proven Nix bindings: direct members of a returned
 * attribute set, direct let bindings, simple inherit names, and literal
 * project-relative import paths. Dynamic attributes, flake inputs, evaluation,
 * and call semantics intentionally remain out of scope.
 */
export function extractNixFileFacts(input: NixExtractFileFactsInput): ArtifactFacts {
  const lineStarts = lineStartsFor(input.sourceText);
  const fileName = input.filePath.split(/[\\/]/u).at(-1) ?? input.filePath;
  const fileRange = rangeForSpan(lineStarts, 0, input.sourceText.length);
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
    range: fileRange,
    isExported: true,
    declarationOrdinal: 0
  };
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const pendingReferences: PendingReference[] = [];
  const localBindings: LocalBinding[] = [];
  const referenceScopes: ReferenceScope[] = [];
  const exportBindings: Array<{ readonly localName: string; readonly exportedName: string; readonly range: SourceRange }> = [];
  const declarationOrdinals = new Map<string, number>();

  function facts(): ArtifactFacts {
    return {
      symbols,
      edges,
      pendingReferences,
      localBindings,
      referenceScopes,
      importBindings: [],
      exportBindings,
      reExportBindings: []
    };
  }

  function addDeclaration(
    declaration: NixDeclaration,
    scopeId: string,
    isExported: boolean,
    rulePrefix: string
  ): void {
    const range = rangeForSpan(lineStarts, declaration.start, declaration.end);
    const qualifiedName =
      input.filePath +
      "#" +
      (scopeId === ROOT_SCOPE_ID || scopeId === FILE_SCOPE_ID ? "" : scopeId + ":") +
      declaration.kind +
      ":" +
      declaration.name;
    const identity = qualifiedName + "\u0000" + declaration.kind;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: declaration.kind,
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: declaration.kind,
      filePath: input.filePath,
      range,
      isExported,
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
        ruleId: rulePrefix + "." + declaration.ruleSuffix,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
    localBindings.push({
      name: declaration.name,
      symbolId: symbol.id,
      scopeId
    });
    if (isExported) {
      exportBindings.push({
        localName: declaration.name,
        exportedName: declaration.name,
        range
      });
    }
  }

  const code = nixCodeMask(input.sourceText);
  if (code === null) {
    return facts();
  }
  const pairs = delimiterPairs(code);
  if (pairs === null) {
    return facts();
  }
  const root = returnedAttrset(code, pairs);
  const rootDeclarations =
    root === null
      ? directDeclarations(code, 0, code.length, pairs)
      : directDeclarations(code, root.start + 1, root.end, pairs);
  if (rootDeclarations === null) {
    return facts();
  }
  const scopedLets = letBlocks(code);
  if (scopedLets === null) {
    return facts();
  }
  const letDeclarations: Array<{ readonly block: NixLetBlock; readonly declarations: readonly NixDeclaration[] }> = [];
  for (const block of scopedLets) {
    const declarations = directDeclarations(code, block.start, block.end, pairs);
    if (declarations === null) {
      return facts();
    }
    letDeclarations.push({ block, declarations });
  }

  for (const declaration of rootDeclarations) {
    addDeclaration(
      declaration,
      root === null ? FILE_SCOPE_ID : ROOT_SCOPE_ID,
      true,
      root === null ? "language.nix.top-level" : "language.nix.returned-attrset"
    );
  }
  for (const entry of letDeclarations) {
    for (const declaration of entry.declarations) {
      addDeclaration(declaration, entry.block.scopeId, false, "language.nix.let");
    }
  }
  for (const imported of staticImports(code)) {
    const range = rangeForSpan(lineStarts, imported.start, imported.end);
    const reference: PendingReference = {
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: null,
        kind: "imports",
        line: range.start.line,
        column: range.start.column,
        referenceName: imported.path
      }),
      sourceId: fileNode.id,
      filePath: input.filePath,
      referenceName: imported.path,
      relationKind: "imports",
      range
    };
    pendingReferences.push(reference);
    referenceScopes.push({ referenceId: reference.id, scopeIds: [FILE_SCOPE_ID] });
  }
  return facts();
}
