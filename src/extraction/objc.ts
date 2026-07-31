import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface ObjectiveCExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "objc";
}

interface ObjectiveCLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

type DirectObjectiveCContainerKind = "implementation" | "interface" | "protocol";

interface StaticObjectiveCContainer {
  readonly kind: DirectObjectiveCContainerKind;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly bodyStartLine: number;
  readonly endLine: number;
}

interface StaticObjectiveCMethod {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface SanitizedObjectiveCSource {
  readonly valid: boolean;
  readonly text: string;
}

type ObjectiveCLexicalMode =
  | "block-comment"
  | "line-comment"
  | "single-quoted-literal"
  | "double-quoted-literal"
  | null;

const DIRECT_IMPLEMENTATION_HEADER =
  /^[ \t]*@implementation[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*$/u;
const DIRECT_INTERFACE_HEADER =
  /^[ \t]*@interface[ \t]+([A-Za-z_][A-Za-z0-9_]*)(.*)$/u;
const DIRECT_PROTOCOL_HEADER =
  /^[ \t]*@protocol[ \t]+([A-Za-z_][A-Za-z0-9_]*)(.*)$/u;
const DIRECT_END_DIRECTIVE = /^[ \t]*@end[ \t]*$/u;
const OBJECTIVE_C_CONTAINER_DIRECTIVE = /^[ \t]*@(interface|implementation|protocol)\b/u;
const DIRECT_PROTOCOL_LIST =
  /^<[ \t]*[A-Za-z_][A-Za-z0-9_]*(?:[ \t]*,[ \t]*[A-Za-z_][A-Za-z0-9_]*)*[ \t]*>$/u;
const DIRECT_INTERFACE_SUFFIX =
  /^(?::[ \t]*[A-Za-z_][A-Za-z0-9_]*(?:[ \t]*<[ \t]*[A-Za-z_][A-Za-z0-9_]*(?:[ \t]*,[ \t]*[A-Za-z_][A-Za-z0-9_]*)*[ \t]*>)?|<[ \t]*[A-Za-z_][A-Za-z0-9_]*(?:[ \t]*,[ \t]*[A-Za-z_][A-Za-z0-9_]*)*[ \t]*>)$/u;

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
  let upper = lineStarts.length;
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const start = lineStarts[middle];
    if (start === undefined || start > offset) {
      upper = middle;
    } else {
      lower = middle;
    }
  }
  const lineStart = lineStarts[lower] ?? 0;
  return { line: lower + 1, column: offset - lineStart + 1 };
}

function rangeFor(
  lineStarts: readonly number[],
  from: number,
  to: number
): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function blankCharacter(characters: string[], index: number): void {
  const character = characters[index];
  if (character !== undefined && character !== "\r" && character !== "\n") {
    characters[index] = " ";
  }
}

function isNewline(character: string): boolean {
  return character === "\r" || character === "\n";
}

function isHorizontalWhitespace(character: string): boolean {
  return character === " " || character === "\t";
}

/**
 * Blanks C-family comments, quoted literals, and preprocessor directives
 * without changing offsets. This intentionally avoids parsing Objective-C;
 * it only protects the narrow direct-declaration matcher below from text that
 * cannot prove a declaration.
 */
function sanitizeObjectiveC(sourceText: string): SanitizedObjectiveCSource {
  const characters = sourceText.split("");
  let mode: ObjectiveCLexicalMode = null;
  let escaped = false;
  let atLineStart = true;
  let inPreprocessorDirective = false;
  let lastDirectiveNonWhitespace = "";

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];
    if (character === undefined) {
      continue;
    }

    if (mode === "block-comment") {
      if (character === "*" && next === "/") {
        blankCharacter(characters, index);
        blankCharacter(characters, index + 1);
        index += 1;
        mode = null;
        continue;
      }
      if (isNewline(character)) {
        atLineStart = true;
      } else {
        blankCharacter(characters, index);
      }
      continue;
    }

    if (mode === "line-comment") {
      if (isNewline(character)) {
        mode = null;
        atLineStart = true;
      } else {
        blankCharacter(characters, index);
      }
      continue;
    }

    if (mode === "single-quoted-literal" || mode === "double-quoted-literal") {
      if (isNewline(character)) {
        return { valid: false, text: sourceText };
      }
      blankCharacter(characters, index);
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (
        (mode === "single-quoted-literal" && character === "'") ||
        (mode === "double-quoted-literal" && character === "\"")
      ) {
        mode = null;
      }
      continue;
    }

    if (inPreprocessorDirective) {
      if (isNewline(character)) {
        inPreprocessorDirective = lastDirectiveNonWhitespace === "\\";
        lastDirectiveNonWhitespace = "";
        atLineStart = true;
      } else {
        blankCharacter(characters, index);
        if (!isHorizontalWhitespace(character)) {
          lastDirectiveNonWhitespace = character;
        }
      }
      continue;
    }

    if (isNewline(character)) {
      atLineStart = true;
      continue;
    }

    if (atLineStart && isHorizontalWhitespace(character)) {
      continue;
    }

    if (atLineStart && character === "#") {
      blankCharacter(characters, index);
      inPreprocessorDirective = true;
      lastDirectiveNonWhitespace = "#";
      atLineStart = false;
      continue;
    }

    atLineStart = false;
    if (character === "/" && next === "*") {
      blankCharacter(characters, index);
      blankCharacter(characters, index + 1);
      index += 1;
      mode = "block-comment";
      continue;
    }
    if (character === "/" && next === "/") {
      blankCharacter(characters, index);
      blankCharacter(characters, index + 1);
      index += 1;
      mode = "line-comment";
      continue;
    }
    if (character === "'") {
      blankCharacter(characters, index);
      mode = "single-quoted-literal";
      escaped = false;
      continue;
    }
    if (character === "\"") {
      blankCharacter(characters, index);
      mode = "double-quoted-literal";
      escaped = false;
    }
  }

  return {
    valid:
      mode !== "block-comment" &&
      mode !== "single-quoted-literal" &&
      mode !== "double-quoted-literal" &&
      !(inPreprocessorDirective && lastDirectiveNonWhitespace === "\\"),
    text: characters.join("")
  };
}

function linesFor(sourceText: string): readonly ObjectiveCLine[] {
  const lines: ObjectiveCLine[] = [];
  let start = 0;

  while (start <= sourceText.length) {
    const newline = sourceText.indexOf("\n", start);
    const rawEnd = newline === -1 ? sourceText.length : newline;
    const end = rawEnd > start && sourceText.charAt(rawEnd - 1) === "\r" ? rawEnd - 1 : rawEnd;
    lines.push({ start, end, text: sourceText.slice(start, end) });
    if (newline === -1) {
      break;
    }
    start = newline + 1;
  }

  return lines;
}

function firstCodeOffset(line: ObjectiveCLine): number {
  return line.start + (line.text.length - line.text.trimStart().length);
}

function directContainerHeader(
  line: ObjectiveCLine
): { readonly kind: DirectObjectiveCContainerKind; readonly name: string } | null {
  const implementation = DIRECT_IMPLEMENTATION_HEADER.exec(line.text);
  if (implementation !== null) {
    const name = implementation[1];
    return name === undefined ? null : { kind: "implementation", name };
  }

  const interfaceHeader = DIRECT_INTERFACE_HEADER.exec(line.text);
  if (interfaceHeader !== null) {
    const name = interfaceHeader[1];
    const suffix = interfaceHeader[2]?.trim() ?? "";
    if (name !== undefined && (suffix === "" || DIRECT_INTERFACE_SUFFIX.test(suffix))) {
      return { kind: "interface", name };
    }
    return null;
  }

  const protocol = DIRECT_PROTOCOL_HEADER.exec(line.text);
  if (protocol !== null) {
    const name = protocol[1];
    const suffix = protocol[2]?.trim() ?? "";
    if (name !== undefined && (suffix === "" || DIRECT_PROTOCOL_LIST.test(suffix))) {
      return { kind: "protocol", name };
    }
  }

  return null;
}

function collectDirectContainers(
  lines: readonly ObjectiveCLine[]
): readonly StaticObjectiveCContainer[] | null {
  const containers: StaticObjectiveCContainer[] = [];
  const identities = new Set<string>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      return null;
    }
    const header = directContainerHeader(line);
    if (header === null) {
      continue;
    }
    const identity = header.kind + "\u0000" + header.name;
    if (identities.has(identity)) {
      return null;
    }

    let endLine = lineIndex + 1;
    for (; endLine < lines.length; endLine += 1) {
      const candidate = lines[endLine];
      if (candidate === undefined) {
        return null;
      }
      if (DIRECT_END_DIRECTIVE.test(candidate.text)) {
        break;
      }
      if (OBJECTIVE_C_CONTAINER_DIRECTIVE.test(candidate.text)) {
        return null;
      }
    }
    const end = lines[endLine];
    if (end === undefined) {
      return null;
    }

    identities.add(identity);
    containers.push({
      kind: header.kind,
      name: header.name,
      start: firstCodeOffset(line),
      end: end.end,
      bodyStartLine: lineIndex + 1,
      endLine
    });
    lineIndex = endLine;
  }

  return containers;
}

function isIdentifierStart(character: string | undefined): boolean {
  return (
    character !== undefined &&
    ((character >= "A" && character <= "Z") ||
      (character >= "a" && character <= "z") ||
      character === "_")
  );
}

function isIdentifierPart(character: string | undefined): boolean {
  return isIdentifierStart(character) || (character !== undefined && character >= "0" && character <= "9");
}

function skipHorizontalWhitespace(sourceText: string, index: number, limit: number): number {
  let cursor = index;
  while (cursor < limit && isHorizontalWhitespace(sourceText.charAt(cursor))) {
    cursor += 1;
  }
  return cursor;
}

function identifierAt(
  sourceText: string,
  index: number,
  limit: number
): { readonly name: string; readonly end: number } | null {
  if (!isIdentifierStart(sourceText.charAt(index))) {
    return null;
  }
  let end = index + 1;
  while (end < limit && isIdentifierPart(sourceText.charAt(end))) {
    end += 1;
  }
  return { name: sourceText.slice(index, end), end };
}

function closingParenthesisOnLine(
  sourceText: string,
  opening: number,
  lineEnd: number
): number | null {
  let depth = 0;
  for (let index = opening; index < lineEnd; index += 1) {
    const character = sourceText.charAt(index);
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
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

function matchingBrace(
  sourceText: string,
  opening: number,
  limit: number
): number | null {
  let depth = 0;
  for (let index = opening; index < limit; index += 1) {
    const character = sourceText.charAt(index);
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
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

function directMethodOnLine(
  sourceText: string,
  line: ObjectiveCLine,
  containerEnd: number,
  form: "declaration" | "implementation"
): StaticObjectiveCMethod | null {
  let cursor = skipHorizontalWhitespace(sourceText, line.start, line.end);
  const start = cursor;
  const polarity = sourceText.charAt(cursor);
  if (polarity !== "-" && polarity !== "+") {
    return null;
  }
  cursor = skipHorizontalWhitespace(sourceText, cursor + 1, line.end);
  if (sourceText.charAt(cursor) !== "(") {
    return null;
  }
  const returnTypeEnd = closingParenthesisOnLine(sourceText, cursor, line.end);
  if (returnTypeEnd === null) {
    return null;
  }
  cursor = skipHorizontalWhitespace(sourceText, returnTypeEnd + 1, line.end);
  const firstSelectorPart = identifierAt(sourceText, cursor, line.end);
  if (firstSelectorPart === null) {
    return null;
  }

  const selectorParts = [firstSelectorPart.name];
  cursor = firstSelectorPart.end;
  const terminator = form === "implementation" ? "{" : ";";
  if (sourceText.charAt(cursor) === ":") {
    selectorParts[0] = firstSelectorPart.name + ":";
    cursor += 1;
    while (true) {
      cursor = skipHorizontalWhitespace(sourceText, cursor, line.end);
      if (sourceText.charAt(cursor) !== "(") {
        return null;
      }
      const parameterTypeEnd = closingParenthesisOnLine(sourceText, cursor, line.end);
      if (parameterTypeEnd === null) {
        return null;
      }
      cursor = skipHorizontalWhitespace(sourceText, parameterTypeEnd + 1, line.end);
      const parameter = identifierAt(sourceText, cursor, line.end);
      if (parameter === null) {
        return null;
      }
      cursor = skipHorizontalWhitespace(sourceText, parameter.end, line.end);
      if (sourceText.charAt(cursor) === terminator) {
        break;
      }
      const nextSelectorPart = identifierAt(sourceText, cursor, line.end);
      if (nextSelectorPart === null) {
        return null;
      }
      cursor = skipHorizontalWhitespace(sourceText, nextSelectorPart.end, line.end);
      if (sourceText.charAt(cursor) !== ":") {
        return null;
      }
      selectorParts.push(nextSelectorPart.name + ":");
      cursor += 1;
    }
  } else {
    cursor = skipHorizontalWhitespace(sourceText, cursor, line.end);
    if (sourceText.charAt(cursor) !== terminator) {
      return null;
    }
  }

  if (form === "declaration") {
    const end = cursor + 1;
    return skipHorizontalWhitespace(sourceText, end, line.end) === line.end
      ? { name: selectorParts.join(""), start, end }
      : null;
  }

  const end = matchingBrace(sourceText, cursor, containerEnd);
  return end === null ? null : { name: selectorParts.join(""), start, end: end + 1 };
}

function directMethodsInContainer(
  sourceText: string,
  lines: readonly ObjectiveCLine[],
  container: StaticObjectiveCContainer
): readonly StaticObjectiveCMethod[] | null {
  const methods: StaticObjectiveCMethod[] = [];
  let braceDepth = 0;
  const endLine = lines[container.endLine];
  if (endLine === undefined) {
    return null;
  }

  for (
    let lineIndex = container.bodyStartLine;
    lineIndex < container.endLine;
    lineIndex += 1
  ) {
    const line = lines[lineIndex];
    if (line === undefined) {
      return null;
    }
    if (braceDepth === 0) {
      const method = directMethodOnLine(
        sourceText,
        line,
        endLine.start,
        container.kind === "implementation" ? "implementation" : "declaration"
      );
      if (method !== null) {
        methods.push(method);
      }
    }

    for (let offset = line.start; offset < line.end; offset += 1) {
      const character = sourceText.charAt(offset);
      if (character === "{") {
        braceDepth += 1;
      } else if (character === "}") {
        braceDepth -= 1;
        if (braceDepth < 0) {
          return null;
        }
      }
    }
  }

  return braceDepth === 0 ? methods : null;
}

/**
 * Extracts a conservative Objective-C source subset from .m, .mm, and
 * source-proven .h files: complete direct non-category implementations,
 * ordinary class interfaces, and protocols. Implementations contribute
 * one-line brace-bodied methods; interfaces and protocols contribute one-line
 * semicolon-terminated method declarations. Categories, properties, calls,
 * inheritance edges, and Swift bridging remain deliberately out of scope.
 */
export function extractObjectiveCFileFacts(input: ObjectiveCExtractFileFactsInput): ArtifactFacts {
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

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = qualifiedName + "\u0000" + kind;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(
    parent: SymbolNode,
    child: SymbolNode,
    range: SourceRange,
    ruleId: string
  ): void {
    edges.push({
      id: createEdgeId({
        sourceId: parent.id,
        targetId: child.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: child.name
      }),
      sourceId: parent.id,
      targetId: child.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: child.name,
      evidence: {
        ruleId,
        stage: "syntax",
        candidateSymbolIds: [child.id]
      }
    });
  }

  function addClass(
    container: StaticObjectiveCContainer,
    ruleId: "language.objc.implementation.direct" | "language.objc.interface.direct"
  ): SymbolNode {
    const qualifiedName = input.filePath + "#" + container.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const range = rangeFor(lineStarts, container.start, container.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: container.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, range, ruleId);
    return symbol;
  }

  function addProtocol(container: StaticObjectiveCContainer): SymbolNode {
    const qualifiedName = input.filePath + "#protocol:" + container.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "interface");
    const range = rangeFor(lineStarts, container.start, container.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "interface",
        declarationOrdinal
      }),
      name: container.name,
      qualifiedName,
      kind: "interface",
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, range, "language.objc.protocol.direct");
    return symbol;
  }

  function addMethod(
    parent: SymbolNode,
    method: StaticObjectiveCMethod,
    ruleId: "language.objc.method.direct-declaration" | "language.objc.method.direct-implementation"
  ): void {
    const qualifiedName = parent.qualifiedName + "." + method.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "method");
    const range = rangeFor(lineStarts, method.start, method.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "method",
        declarationOrdinal
      }),
      name: method.name,
      qualifiedName,
      kind: "method",
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, range, ruleId);
  }

  const sanitized = sanitizeObjectiveC(input.sourceText);
  if (!sanitized.valid) {
    return emptyFacts(symbols, edges);
  }
  const lines = linesFor(sanitized.text);
  const containers = collectDirectContainers(lines);
  if (containers === null) {
    return emptyFacts(symbols, edges);
  }

  const methodsByContainer = new Map<StaticObjectiveCContainer, readonly StaticObjectiveCMethod[]>();
  for (const container of containers) {
    const methods = directMethodsInContainer(sanitized.text, lines, container);
    if (methods === null) {
      return emptyFacts([fileNode], []);
    }
    methodsByContainer.set(container, methods);
  }

  const classes = new Map<
    string,
    {
      declaration: StaticObjectiveCContainer | null;
      implementation: StaticObjectiveCContainer | null;
    }
  >();
  const protocols: StaticObjectiveCContainer[] = [];
  for (const container of containers) {
    if (container.kind === "protocol") {
      protocols.push(container);
      continue;
    }
    const existing = classes.get(container.name) ?? {
      declaration: null,
      implementation: null
    };
    if (container.kind === "interface") {
      if (existing.declaration !== null) {
        return emptyFacts([fileNode], []);
      }
      existing.declaration = container;
    } else {
      if (existing.implementation !== null) {
        return emptyFacts([fileNode], []);
      }
      existing.implementation = container;
    }
    classes.set(container.name, existing);
  }

  const owners: Array<
    | {
        readonly kind: "class";
        readonly container: StaticObjectiveCContainer;
        readonly declaration: StaticObjectiveCContainer | null;
        readonly implementation: StaticObjectiveCContainer | null;
      }
    | {
        readonly kind: "protocol";
        readonly container: StaticObjectiveCContainer;
      }
  > = [];
  for (const entry of classes.values()) {
    const container = entry.declaration ?? entry.implementation;
    if (container === null) {
      return emptyFacts([fileNode], []);
    }
    owners.push({
      kind: "class",
      container,
      declaration: entry.declaration,
      implementation: entry.implementation
    });
  }
  for (const protocol of protocols) {
    owners.push({ kind: "protocol", container: protocol });
  }
  owners.sort((left, right) => left.container.start - right.container.start);

  for (const owner of owners) {
    if (owner.kind === "protocol") {
      const parent = addProtocol(owner.container);
      for (const method of methodsByContainer.get(owner.container) ?? []) {
        addMethod(parent, method, "language.objc.method.direct-declaration");
      }
      continue;
    }

    const parent = addClass(
      owner.container,
      owner.declaration === null
        ? "language.objc.implementation.direct"
        : "language.objc.interface.direct"
    );
    const selectedMethods = new Map<
      string,
      {
        readonly method: StaticObjectiveCMethod;
        readonly ruleId:
          | "language.objc.method.direct-declaration"
          | "language.objc.method.direct-implementation";
      }
    >();
    for (const source of [
      owner.declaration === null
        ? null
        : {
            container: owner.declaration,
            ruleId: "language.objc.method.direct-declaration" as const
          },
      owner.implementation === null
        ? null
        : {
            container: owner.implementation,
            ruleId: "language.objc.method.direct-implementation" as const
          }
    ]) {
      if (source === null) {
        continue;
      }
      for (const method of methodsByContainer.get(source.container) ?? []) {
        if (source.ruleId === "language.objc.method.direct-implementation" || !selectedMethods.has(method.name)) {
          selectedMethods.set(method.name, { method, ruleId: source.ruleId });
        }
      }
    }
    for (const { method, ruleId } of [...selectedMethods.values()].sort(
      (left, right) => left.method.start - right.method.start
    )) {
      addMethod(parent, method, ruleId);
    }
  }

  return emptyFacts(symbols, edges);
}

function emptyFacts(symbols: readonly SymbolNode[], edges: readonly GraphEdge[]): ArtifactFacts {
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
