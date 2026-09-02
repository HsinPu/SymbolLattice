import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type ProtoImportFact,
  type ProtoRpcFact,
  type ProtoFacts,
  type ProtoTypeFact,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface ProtoExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "proto";
}

type ProtoDeclarationKind = "message" | "enum" | "service";

interface ProtoToken {
  readonly kind: "name" | "punctuation";
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface ProtoDeclaration {
  readonly kind: ProtoDeclarationKind;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly openingTokenIndex: number;
  readonly closingTokenIndex: number;
}

interface ProtoScan {
  readonly declarations: readonly ProtoDeclaration[];
  readonly tokens: readonly ProtoToken[];
}

interface StaticProtoImport {
  readonly importPath: string;
  readonly importKind: "plain" | "public" | "weak";
  readonly start: number;
  readonly end: number;
}

interface ParsedProtoDeclaration {
  readonly declaration: ProtoDeclaration;
  readonly endTokenIndex: number;
}

interface ProtoRpc {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly requestType: ProtoRpcMessageType;
  readonly responseType: ProtoRpcMessageType;
}

interface ProtoRpcMessageType {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly qualified: boolean;
}

interface ParsedProtoRpc {
  readonly rpc: ProtoRpc;
  readonly endTokenIndex: number;
}

const PROTO_DECLARATION_KINDS: ReadonlySet<ProtoDeclarationKind> = new Set([
  "message",
  "enum",
  "service"
]);
const PROTO_OPEN_TO_CLOSE: ReadonlyMap<string, string> = new Map([
  ["{", "}"],
  ["(", ")"],
  ["[", "]"],
  ["<", ">"]
]);
const PROTO_CLOSE_TO_OPEN: ReadonlyMap<string, string> = new Map([
  ["}", "{"],
  [")", "("],
  ["]", "["],
  [">", "<"]
]);
const PROTO_PUNCTUATION: ReadonlySet<string> = new Set([
  "{",
  "}",
  "(",
  ")",
  "[",
  "]",
  "<",
  ">",
  "=",
  ";",
  ",",
  ".",
  ":",
  "-",
  "+"
]);
const PROTO_NAME_START = /^[A-Za-z_]$/u;
const PROTO_NAME_PART = /^[A-Za-z0-9_]$/u;

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

/** Blanks comments and quoted option/import values without moving source offsets. */
function sanitizeProtoSource(sourceText: string): string | null {
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
    if (character !== "'" && character !== '"') {
      index += 1;
      continue;
    }

    const quote = character;
    const start = index;
    index += 1;
    let closed = false;
    while (index < sourceText.length) {
      const stringCharacter = sourceText[index];
      if (stringCharacter === "\r" || stringCharacter === "\n") {
        return null;
      }
      if (stringCharacter === "\\") {
        if (index + 1 >= sourceText.length) {
          return null;
        }
        index += 2;
        continue;
      }
      if (stringCharacter === quote) {
        index += 1;
        closed = true;
        break;
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

/** Masks comments while preserving quoted import strings and their offsets. */
function maskProtoComments(sourceText: string): string {
  const characters = sourceText.split("");
  let index = 0;
  let blockComment = false;
  while (index < sourceText.length) {
    const character = sourceText[index];
    const next = sourceText[index + 1];
    if (blockComment) {
      if (character === "*" && next === "/") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 2;
        blockComment = false;
        continue;
      }
      if (character !== "\r" && character !== "\n") characters[index] = " ";
      index += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 2;
      while (index < sourceText.length && sourceText[index] !== "\n") {
        if (sourceText[index] !== "\r") characters[index] = " ";
        index += 1;
      }
      continue;
    }
    if (character === "/" && next === "*") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 2;
      blockComment = true;
      continue;
    }
    if (character === '"' || character === "'") {
      const quote = character;
      index += 1;
      while (index < sourceText.length) {
        if (sourceText[index] === "\\") {
          index += 2;
          continue;
        }
        if (sourceText[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    index += 1;
  }
  return characters.join("");
}

function staticProtoImports(sourceText: string): readonly StaticProtoImport[] {
  const masked = maskProtoComments(sourceText);
  const imports: StaticProtoImport[] = [];
  const pattern = /^[ \t]*import[ \t]+(?:(public|weak)[ \t]+)?(["'])([^"'\r\n]+)\2[ \t]*;[ \t]*$/gmu;
  for (const match of masked.matchAll(pattern)) {
    const full = match[0] ?? "";
    const importPath = match[3] ?? "";
    const matchIndex = match.index;
    if (matchIndex === undefined || importPath.length === 0) continue;
    const pathOffset = matchIndex + full.indexOf(importPath);
    imports.push({
      importPath,
      importKind: match[1] === "public" ? "public" : match[1] === "weak" ? "weak" : "plain",
      start: pathOffset,
      end: pathOffset + importPath.length
    });
  }
  return imports;
}

function delimitersAreBalanced(sourceText: string): boolean {
  const stack: string[] = [];
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character === undefined) {
      continue;
    }
    if (PROTO_OPEN_TO_CLOSE.has(character)) {
      stack.push(character);
      continue;
    }
    const expectedOpen = PROTO_CLOSE_TO_OPEN.get(character);
    if (expectedOpen !== undefined && stack.pop() !== expectedOpen) {
      return false;
    }
  }
  return stack.length === 0;
}

function isProtoWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/u.test(character);
}

function isProtoNameStart(character: string | undefined): boolean {
  return character !== undefined && PROTO_NAME_START.test(character);
}

function isProtoNamePart(character: string | undefined): boolean {
  return character !== undefined && PROTO_NAME_PART.test(character);
}

function protoTokens(sourceText: string): readonly ProtoToken[] | null {
  const tokens: ProtoToken[] = [];
  let index = 0;
  while (index < sourceText.length) {
    const character = sourceText[index];
    if (isProtoWhitespace(character)) {
      index += 1;
      continue;
    }
    if (isProtoNameStart(character)) {
      const start = index;
      index += 1;
      while (isProtoNamePart(sourceText[index])) {
        index += 1;
      }
      tokens.push({ kind: "name", text: sourceText.slice(start, index), start, end: index });
      continue;
    }
    if (character !== undefined && (PROTO_PUNCTUATION.has(character) || /^[0-9]$/u.test(character))) {
      tokens.push({ kind: "punctuation", text: character, start: index, end: index + 1 });
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

function matchingBraceToken(tokens: readonly ProtoToken[], openingIndex: number): number | null {
  if (tokens[openingIndex]?.text !== "{") {
    return null;
  }
  let depth = 0;
  for (let index = openingIndex; index < tokens.length; index += 1) {
    const text = tokens[index]?.text;
    if (text === "{") {
      depth += 1;
      continue;
    }
    if (text === "}") {
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

function directProtoDeclaration(
  tokens: readonly ProtoToken[],
  index: number
): ParsedProtoDeclaration | null {
  const keyword = tokens[index];
  const name = tokens[index + 1];
  const opening = tokens[index + 2];
  if (
    keyword?.kind !== "name" ||
    !PROTO_DECLARATION_KINDS.has(keyword.text as ProtoDeclarationKind) ||
    name?.kind !== "name" ||
    opening?.text !== "{"
  ) {
    return null;
  }
  const closingIndex = matchingBraceToken(tokens, index + 2);
  const closing = closingIndex === null ? undefined : tokens[closingIndex];
  if (closingIndex === null || closing === undefined) {
    return null;
  }
  return {
    declaration: {
      kind: keyword.text as ProtoDeclarationKind,
      name: name.text,
      start: keyword.start,
      end: closing.end,
      openingTokenIndex: index + 2,
      closingTokenIndex: closingIndex
    },
    endTokenIndex: closingIndex
  };
}

function protoRpcMessageType(
  tokens: readonly ProtoToken[],
  start: number
): { readonly type: ProtoRpcMessageType; readonly endTokenIndex: number } | null {
  let index = start;
  const firstToken = tokens[index];
  let qualified = false;
  if (tokens[index]?.text === ".") {
    qualified = true;
    index += 1;
  }
  const firstName = tokens[index];
  if (firstName?.kind !== "name") {
    return null;
  }
  let finalName = firstName;
  index += 1;
  while (tokens[index]?.text === ".") {
    const nextName = tokens[index + 1];
    if (nextName?.kind !== "name") {
      return null;
    }
    qualified = true;
    finalName = nextName;
    index += 2;
  }
  return {
    type: {
      name: finalName.text,
      start: firstToken?.start ?? firstName.start,
      end: finalName.end,
      qualified
    },
    endTokenIndex: index
  };
}

function directProtoRpc(
  tokens: readonly ProtoToken[],
  index: number,
  closingTokenIndex: number
): ParsedProtoRpc | null {
  const keyword = tokens[index];
  const name = tokens[index + 1];
  if (keyword?.text !== "rpc" || name?.kind !== "name" || tokens[index + 2]?.text !== "(") {
    return null;
  }
  let cursor = index + 3;
  if (tokens[cursor]?.text === "stream") {
    cursor += 1;
  }
  const request = protoRpcMessageType(tokens, cursor);
  if (request === null || tokens[request.endTokenIndex]?.text !== ")" || tokens[request.endTokenIndex + 1]?.text !== "returns") {
    return null;
  }
  cursor = request.endTokenIndex + 2;
  if (tokens[cursor]?.text !== "(") {
    return null;
  }
  cursor += 1;
  if (tokens[cursor]?.text === "stream") {
    cursor += 1;
  }
  const response = protoRpcMessageType(tokens, cursor);
  if (response === null || tokens[response.endTokenIndex]?.text !== ")" || tokens[response.endTokenIndex + 1]?.text !== ";") {
    return null;
  }
  const semicolonIndex = response.endTokenIndex + 1;
  const semicolon = tokens[semicolonIndex];
  if (semicolon === undefined || semicolonIndex >= closingTokenIndex) {
    return null;
  }
  return {
    rpc: {
      name: name.text,
      start: keyword.start,
      end: semicolon.end,
      requestType: request.type,
      responseType: response.type
    },
    endTokenIndex: semicolonIndex
  };
}

function directServiceRpcs(
  tokens: readonly ProtoToken[],
  declaration: ProtoDeclaration
): readonly ProtoRpc[] {
  const rpcs: ProtoRpc[] = [];
  let braceDepth = 0;
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  let angleDepth = 0;
  for (let index = declaration.openingTokenIndex + 1; index < declaration.closingTokenIndex; ) {
    const token = tokens[index];
    if (token === undefined) {
      break;
    }
    if (token.text === "{") {
      braceDepth += 1;
      index += 1;
      continue;
    }
    if (token.text === "}") {
      braceDepth -= 1;
      index += 1;
      continue;
    }
    if (token.text === "(") {
      parenthesisDepth += 1;
      index += 1;
      continue;
    }
    if (token.text === ")") {
      parenthesisDepth -= 1;
      index += 1;
      continue;
    }
    if (token.text === "[") {
      bracketDepth += 1;
      index += 1;
      continue;
    }
    if (token.text === "]") {
      bracketDepth -= 1;
      index += 1;
      continue;
    }
    if (token.text === "<") {
      angleDepth += 1;
      index += 1;
      continue;
    }
    if (token.text === ">") {
      angleDepth -= 1;
      index += 1;
      continue;
    }
    if (
      braceDepth === 0 &&
      parenthesisDepth === 0 &&
      bracketDepth === 0 &&
      angleDepth === 0 &&
      token.text === "rpc"
    ) {
      const parsed = directProtoRpc(tokens, index, declaration.closingTokenIndex);
      if (parsed !== null) {
        rpcs.push(parsed.rpc);
        index = parsed.endTokenIndex + 1;
        continue;
      }
    }
    index += 1;
  }
  return rpcs;
}

/**
 * Extracts only complete top-level Protocol Buffers message, enum, and service
 * declarations, plus direct semicolon-terminated RPC methods inside a service.
 * Field schemas, imports, options, nested declarations, RPC option blocks, and
 * gRPC runtime behavior deliberately remain outside this dependency-free slice.
 */
function staticProtoScan(sourceText: string): ProtoScan | null {
  const sanitized = sanitizeProtoSource(sourceText);
  if (sanitized === null || !delimitersAreBalanced(sanitized)) {
    return null;
  }
  const tokens = protoTokens(sanitized);
  if (tokens === null) {
    return null;
  }

  const declarations: ProtoDeclaration[] = [];
  let braceDepth = 0;
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  let angleDepth = 0;
  for (let index = 0; index < tokens.length; ) {
    const token = tokens[index];
    if (token === undefined) {
      break;
    }
    if (token.text === "{") {
      braceDepth += 1;
      index += 1;
      continue;
    }
    if (token.text === "}") {
      braceDepth -= 1;
      index += 1;
      continue;
    }
    if (token.text === "(") {
      parenthesisDepth += 1;
      index += 1;
      continue;
    }
    if (token.text === ")") {
      parenthesisDepth -= 1;
      index += 1;
      continue;
    }
    if (token.text === "[") {
      bracketDepth += 1;
      index += 1;
      continue;
    }
    if (token.text === "]") {
      bracketDepth -= 1;
      index += 1;
      continue;
    }
    if (token.text === "<") {
      angleDepth += 1;
      index += 1;
      continue;
    }
    if (token.text === ">") {
      angleDepth -= 1;
      index += 1;
      continue;
    }
    if (
      braceDepth !== 0 ||
      parenthesisDepth !== 0 ||
      bracketDepth !== 0 ||
      angleDepth !== 0 ||
      token.kind !== "name" ||
      !PROTO_DECLARATION_KINDS.has(token.text as ProtoDeclarationKind)
    ) {
      index += 1;
      continue;
    }
    const parsed = directProtoDeclaration(tokens, index);
    if (parsed === null) {
      index += 1;
      continue;
    }
    declarations.push(parsed.declaration);
    index = parsed.endTokenIndex + 1;
  }
  return { declarations, tokens };
}

function symbolKindFor(declaration: ProtoDeclaration): "class" | "type" | "interface" {
  switch (declaration.kind) {
    case "message":
      return "class";
    case "enum":
      return "type";
    case "service":
      return "interface";
  }
}

/** Emits source-ranged Protocol Buffers declarations without claiming full proto parsing. */
export function extractProtoFileFacts(input: ProtoExtractFileFactsInput): ArtifactFacts {
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
  const declarationOrdinals = new Map<string, number>();
  const staticImports = staticProtoImports(input.sourceText);
  const protoImports: ProtoImportFact[] = [];
  const protoTypes: ProtoTypeFact[] = [];
  const protoRpcs: ProtoRpcFact[] = [];
  const declarationSymbols: Array<{
    readonly declaration: ProtoDeclaration;
    readonly symbol: SymbolNode;
  }> = [];
  const rpcSymbols: Array<{
    readonly rpc: ProtoRpc;
    readonly symbol: SymbolNode;
    readonly serviceId: string;
  }> = [];

  function addSymbol(inputSymbol: {
    readonly name: string;
    readonly kind: "class" | "type" | "interface" | "method";
    readonly qualifiedName: string;
    readonly range: SourceRange;
    readonly isExported: boolean;
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
      isExported: inputSymbol.isExported,
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

  const scan = staticProtoScan(input.sourceText);
  const declarations = scan?.declarations ?? [];
  const tokens = scan?.tokens ?? [];
  for (const declaration of declarations) {
    const symbol = addSymbol({
      name: declaration.name,
      kind: symbolKindFor(declaration),
      qualifiedName: `${input.filePath}#${declaration.kind}:${declaration.name}`,
      range: rangeForSpan(lineStarts, declaration.start, declaration.end),
      isExported: true,
      parent: fileNode,
      containmentRuleId: `language.proto.${declaration.kind}.direct-definition`
    });
    declarationSymbols.push({ declaration, symbol });
    protoTypes.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      declarationKind: declaration.kind,
      range: symbol.range
    });
    if (declaration.kind !== "service") {
      continue;
    }
    for (const rpc of directServiceRpcs(tokens, declaration)) {
      const rpcSymbol = addSymbol({
        name: rpc.name,
        kind: "method",
        qualifiedName: `${symbol.qualifiedName}::${rpc.name}`,
        range: rangeForSpan(lineStarts, rpc.start, rpc.end),
        isExported: false,
        parent: symbol,
        containmentRuleId: "language.proto.rpc.direct-service-member"
      });
      rpcSymbols.push({ rpc, symbol: rpcSymbol, serviceId: symbol.id });
      protoRpcs.push({
        sourceId: rpcSymbol.id,
        filePath: input.filePath,
        name: rpc.name,
        requestName: rpc.requestType.name,
        responseName: rpc.responseType.name,
        requestQualified: rpc.requestType.qualified,
        responseQualified: rpc.responseType.qualified,
        requestRange: rangeForSpan(lineStarts, rpc.requestType.start, rpc.requestType.end),
        responseRange: rangeForSpan(lineStarts, rpc.responseType.start, rpc.responseType.end),
        range: rangeForSpan(lineStarts, rpc.start, rpc.end)
      });
    }
  }

  if (scan !== null) {
    for (const importFact of staticImports) {
      protoImports.push({
        sourceId: fileNode.id,
        filePath: input.filePath,
        importPath: importFact.importPath,
        importKind: importFact.importKind,
        range: rangeForSpan(lineStarts, importFact.start, importFact.end)
      });
    }
  }

  const hasImport = protoImports.length > 0;
  if (!hasImport) {
    for (const source of rpcSymbols) {
      const duplicateRpc = rpcSymbols.filter(
        (candidate) => candidate.serviceId === source.serviceId && candidate.rpc.name === source.rpc.name
      ).length !== 1;
      const resolveMessage = (type: ProtoRpcMessageType) => {
        if (type.qualified) {
          return undefined;
        }
        const candidates = declarationSymbols.filter(
          (candidate) =>
            candidate.declaration.kind === "message" && candidate.declaration.name === type.name
        );
        return candidates.length === 1 ? candidates[0] : undefined;
      };
      const request = resolveMessage(source.rpc.requestType);
      const response = resolveMessage(source.rpc.responseType);
      if (duplicateRpc || request === undefined || response === undefined) {
        continue;
      }
      for (const relation of [
        {
          type: source.rpc.requestType,
          target: request,
          ruleId: "syntax.proto.same-file.unique-rpc-request-message-reference"
        },
        {
          type: source.rpc.responseType,
          target: response,
          ruleId: "syntax.proto.same-file.unique-rpc-response-message-reference"
        }
      ] as const) {
        const range = rangeForSpan(lineStarts, relation.type.start, relation.type.end);
        edges.push({
          id: createEdgeId({
            sourceId: source.symbol.id,
            targetId: relation.target.symbol.id,
            kind: "references",
            line: range.start.line,
            column: range.start.column,
            referenceName: relation.type.name
          }),
          sourceId: source.symbol.id,
          targetId: relation.target.symbol.id,
          kind: "references",
          filePath: input.filePath,
          range,
          resolution: "exact",
          confidence: 1,
          referenceName: relation.type.name,
          evidence: {
            ruleId: relation.ruleId,
            stage: "syntax",
            candidateSymbolIds: [relation.target.symbol.id]
          }
        });
      }
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
    reExportBindings: [],
    protoFacts: {
      parserRejected: scan === null,
      imports: protoImports,
      types: protoTypes,
      rpcs: protoRpcs
    } satisfies ProtoFacts
  };
}
