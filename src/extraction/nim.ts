import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type NimCallFact,
  type NimCallableFact,
  type NimFacts,
  type NimHeritageFact,
  type NimImportFact,
  type NimInstantiationFact,
  type NimTypeFact,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface NimExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "nim";
}

interface NimLine {
  readonly start: number;
  readonly end: number;
  readonly content: string;
  readonly indent: number;
}

interface StaticNimFunction {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface StaticNimDirectCall {
  readonly callerName: string;
  readonly calleeName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticJesterRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticNimFacts {
  readonly valid: boolean;
  readonly functions: readonly StaticNimFunction[];
  readonly calls: readonly StaticNimDirectCall[];
  readonly routes: readonly StaticJesterRoute[];
}

interface SanitizedNimSource {
  readonly valid: boolean;
  readonly text: string;
}

interface JesterImportProof {
  readonly exactCount: number;
  readonly hasUnsupportedJesterForm: boolean;
}

type NimStringMode = "regular" | "raw" | "character" | "triple";

const JESTER_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
  trace: "TRACE",
  connect: "CONNECT"
};

const JESTER_ROUTE_IDENTIFIER_NAMES: ReadonlySet<string> = new Set([
  "routes",
  "router",
  ...Object.keys(JESTER_METHODS)
]);

const OPEN_TO_CLOSE: ReadonlyMap<string, string> = new Map([
  ["{", "}"],
  ["[", "]"],
  ["(", ")"]
]);

const CLOSE_TO_OPEN: ReadonlyMap<string, string> = new Map([
  ["}", "{"],
  ["]", "["],
  [")", "("]
]);

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

function rangeFor(lineStarts: readonly number[], from: number, to: number): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function isNimIdentifierCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_]/u.test(value);
}

function blankCharacter(characters: string[], index: number): void {
  const character = characters[index];
  if (character !== "\n" && character !== "\r") {
    characters[index] = " ";
  }
}

/**
 * Keeps source offsets stable while removing comments and long strings that
 * could otherwise mimic layout-sensitive Jester route blocks. Normal literal
 * strings stay visible so only a direct literal route header can consume one.
 */
function sanitizeNim(sourceText: string): SanitizedNimSource {
  const characters = sourceText.split("");
  const delimiters: string[] = [];
  let blockCommentDepth = 0;
  let stringMode: NimStringMode | null = null;
  let escaped = false;

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];
    const afterNext = characters[index + 2];

    if (character === undefined) {
      continue;
    }

    if (blockCommentDepth > 0) {
      if (character === "#" && next === "[") {
        blankCharacter(characters, index);
        blankCharacter(characters, index + 1);
        index += 1;
        blockCommentDepth += 1;
        continue;
      }
      if (character === "]" && next === "#") {
        blankCharacter(characters, index);
        blankCharacter(characters, index + 1);
        index += 1;
        blockCommentDepth -= 1;
        continue;
      }
      blankCharacter(characters, index);
      continue;
    }

    if (stringMode === "triple") {
      if (character === '"' && next === '"' && afterNext === '"') {
        blankCharacter(characters, index);
        blankCharacter(characters, index + 1);
        blankCharacter(characters, index + 2);
        index += 2;
        stringMode = null;
        continue;
      }
      blankCharacter(characters, index);
      continue;
    }

    if (stringMode === "regular" || stringMode === "character") {
      const terminator = stringMode === "regular" ? '"' : "'";
      if (character === "\n" || character === "\r") {
        return { valid: false, text: sourceText };
      }
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === terminator) {
        stringMode = null;
      }
      continue;
    }

    if (stringMode === "raw") {
      if (character === "\n" || character === "\r") {
        return { valid: false, text: sourceText };
      }
      if (character === '"') {
        if (next === '"') {
          index += 1;
          continue;
        }
        stringMode = null;
      }
      continue;
    }

    if (character === "#" && next === "[") {
      blankCharacter(characters, index);
      blankCharacter(characters, index + 1);
      index += 1;
      blockCommentDepth = 1;
      continue;
    }

    if (character === "#") {
      for (let commentIndex = index; commentIndex < characters.length; commentIndex += 1) {
        const commentCharacter = characters[commentIndex];
        if (commentCharacter === "\n" || commentCharacter === "\r") {
          index = commentIndex - 1;
          break;
        }
        blankCharacter(characters, commentIndex);
        if (commentIndex === characters.length - 1) {
          index = commentIndex;
        }
      }
      continue;
    }

    if (character === '"' && next === '"' && afterNext === '"') {
      blankCharacter(characters, index);
      blankCharacter(characters, index + 1);
      blankCharacter(characters, index + 2);
      index += 2;
      stringMode = "triple";
      continue;
    }

    if (
      character === "r" &&
      next === '"' &&
      !isNimIdentifierCharacter(characters[index - 1])
    ) {
      index += 1;
      stringMode = "raw";
      continue;
    }

    if (character === '"') {
      stringMode = "regular";
      escaped = false;
      continue;
    }

    if (character === "'" && !isNimIdentifierCharacter(characters[index - 1])) {
      stringMode = "character";
      escaped = false;
      continue;
    }

    const close = OPEN_TO_CLOSE.get(character);
    if (close !== undefined) {
      delimiters.push(close);
      continue;
    }
    const expectedOpen = CLOSE_TO_OPEN.get(character);
    if (expectedOpen !== undefined) {
      const expectedClose = delimiters.pop();
      if (expectedClose !== character) {
        return { valid: false, text: sourceText };
      }
    }
  }

  return {
    valid: blockCommentDepth === 0 && stringMode === null && delimiters.length === 0,
    text: characters.join("")
  };
}

function linesFor(sanitizedText: string): readonly NimLine[] {
  const lines: NimLine[] = [];
  let lineStart = 0;

  while (lineStart <= sanitizedText.length) {
    const newline = sanitizedText.indexOf("\n", lineStart);
    const rawEnd = newline === -1 ? sanitizedText.length : newline;
    const lineEnd =
      rawEnd > lineStart && sanitizedText.charAt(rawEnd - 1) === "\r" ? rawEnd - 1 : rawEnd;
    const raw = sanitizedText.slice(lineStart, lineEnd);
    const indent = /^ */u.exec(raw)?.[0].length ?? 0;
    const content = raw.slice(indent).trimEnd();

    lines.push({
      start: lineStart + indent,
      end: lineStart + indent + content.length,
      content,
      indent
    });

    if (newline === -1) {
      break;
    }
    lineStart = newline + 1;
  }

  return lines;
}

function directNimFunction(line: NimLine): StaticNimFunction | null {
  if (line.indent !== 0) {
    return null;
  }

  const match =
    /^proc\s+([A-Za-z_][A-Za-z0-9_]*)(?:\*)?\s*\(\s*\)\s*(?::\s*[A-Za-z_][A-Za-z0-9_.\[\]]*)?\s*=/u.exec(
      line.content
    );
  const name = match?.[1];
  return name === undefined ? null : { name, start: line.start, end: line.end };
}

function directNimZeroArgumentCall(line: NimLine): StaticNimDirectCall | null {
  if (line.indent !== 0) {
    return null;
  }
  const match =
    /^proc\s+([A-Za-z_][A-Za-z0-9_]*)(?:\*)?\s*\(\s*\)\s*(?::\s*[A-Za-z_][A-Za-z0-9_.\[\]]*)?\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*$/u.exec(
      line.content
    );
  const callerName = match?.[1];
  const calleeName = match?.[2];
  if (callerName === undefined || calleeName === undefined || callerName === calleeName) {
    return null;
  }
  const calleeStart = line.start + line.content.lastIndexOf(calleeName);
  return { callerName, calleeName, start: calleeStart, end: calleeStart + calleeName.length };
}

function isNimB1Line(line: NimLine): boolean {
  return (
    line.indent === 0 &&
    /^proc\s+[A-Za-z_][A-Za-z0-9_]*(?:\*)?\s*\(\s*\)\s*(?::\s*[A-Za-z_][A-Za-z0-9_.\[\]]*)?\s*=\s*(?:[A-Za-z_][A-Za-z0-9_]*\s*\(\s*\)|[0-9]+|true|false)\s*$/u.test(
      line.content
    )
  );
}

function directTopLevelBindingName(line: NimLine): string | null {
  if (line.indent !== 0) {
    return null;
  }

  const match =
    /^(?:proc|func|template|macro|iterator|let|var|const|type)\s+([A-Za-z_][A-Za-z0-9_]*)/u.exec(
      line.content
    );
  return match?.[1] ?? null;
}

function directJesterImportProof(line: NimLine): JesterImportProof {
  if (line.indent !== 0) {
    return { exactCount: 0, hasUnsupportedJesterForm: false };
  }
  if (/^from\s+jester(?:\s|\/|$)/u.test(line.content)) {
    return { exactCount: 0, hasUnsupportedJesterForm: true };
  }
  if (!line.content.startsWith("import ")) {
    return { exactCount: 0, hasUnsupportedJesterForm: false };
  }

  let exactCount = 0;
  let hasUnsupportedJesterForm = false;
  for (const moduleName of line.content.slice("import ".length).split(",")) {
    const normalized = moduleName.trim();
    if (normalized === "jester") {
      exactCount += 1;
    } else if (/^jester(?:\s|\/|$)/u.test(normalized)) {
      hasUnsupportedJesterForm = true;
    }
  }

  return { exactCount, hasUnsupportedJesterForm };
}

function isDirectJesterBlockHeader(line: NimLine): boolean {
  return (
    line.indent === 0 &&
    (/^routes\s*:\s*$/u.test(line.content) ||
      /^router\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*$/u.test(line.content))
  );
}

function directJesterRouteHeader(line: NimLine): StaticJesterRoute | null {
  const match =
    /^(get|post|put|patch|delete|head|options|trace|connect)\s+"(\/[^"\\\r\n]*)"\s*:\s*$/u.exec(
      line.content
    );
  const methodName = match?.[1];
  const path = match?.[2];
  const method = methodName === undefined ? undefined : JESTER_METHODS[methodName];

  if (method === undefined || path === undefined) {
    return null;
  }

  return {
    method,
    path,
    handlerName: "",
    start: line.start,
    end: line.end
  };
}

function directJesterRoute(
  lines: readonly NimLine[],
  headerIndex: number
): StaticJesterRoute | null {
  const header = lines[headerIndex];
  if (header === undefined) {
    return null;
  }
  const route = directJesterRouteHeader(header);
  if (route === null) {
    return null;
  }

  let handlerIndent: number | undefined;
  let handlerName: string | null = null;

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.content.length === 0) {
      continue;
    }
    if (line.indent <= header.indent) {
      break;
    }
    handlerIndent ??= line.indent;
    if (line.indent !== handlerIndent || handlerName !== null) {
      return null;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*$/u.exec(line.content);
    handlerName = match?.[1] ?? null;
    if (handlerName === null) {
      return null;
    }
  }

  return handlerName === null ? null : { ...route, handlerName };
}

function staticNimFacts(sourceText: string): StaticNimFacts {
  const sanitized = sanitizeNim(sourceText);
  if (!sanitized.valid || sanitized.text.includes("\t")) {
    return { valid: false, functions: [], calls: [], routes: [] };
  }

  const lines = linesFor(sanitized.text);
  const functions = lines
    .map((line) => directNimFunction(line))
    .filter((functionFact): functionFact is StaticNimFunction => functionFact !== null);
  const calls = lines
    .map((line) => directNimZeroArgumentCall(line))
    .filter((call): call is StaticNimDirectCall => call !== null);
  const jesterImportProof = lines
    .map((line) => directJesterImportProof(line))
    .reduce<JesterImportProof>(
      (total, proof) => ({
        exactCount: total.exactCount + proof.exactCount,
        hasUnsupportedJesterForm: total.hasUnsupportedJesterForm || proof.hasUnsupportedJesterForm
      }),
      { exactCount: 0, hasUnsupportedJesterForm: false }
    );
  const hasRouteBindingShadow = lines.some((line) => {
    const bindingName = directTopLevelBindingName(line);
    return bindingName !== null && JESTER_ROUTE_IDENTIFIER_NAMES.has(bindingName);
  });
  const routes: StaticJesterRoute[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index];
    if (header === undefined || !isDirectJesterBlockHeader(header)) {
      continue;
    }

    let routeIndent: number | undefined;
    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
      const line = lines[bodyIndex];
      if (line === undefined || line.content.length === 0) {
        continue;
      }
      if (line.indent <= header.indent) {
        break;
      }
      routeIndent ??= line.indent;
      if (line.indent !== routeIndent) {
        continue;
      }
      const route = directJesterRoute(lines, bodyIndex);
      if (route !== null) {
        routes.push(route);
      }
    }
  }

  return {
    valid: true,
    functions,
    calls: lines.every((line) => line.content.length === 0 || isNimB1Line(line)) ? calls : [],
    routes:
      jesterImportProof.exactCount === 1 &&
      !jesterImportProof.hasUnsupportedJesterForm &&
      !hasRouteBindingShadow
        ? routes
        : []
  };
}

interface NimRawType {
  readonly name: string;
  readonly moduleName: string;
  readonly declarationKind: "object" | "enum" | "distinct" | "alias";
  readonly isExported: boolean;
  readonly parentTypeName?: string;
  readonly start: number;
  readonly end: number;
}

interface NimRawCallable {
  readonly key: string;
  readonly name: string;
  readonly moduleName: string;
  readonly parameterCount: number;
  readonly parameterTypeNames: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly start: number;
  readonly end: number;
}

interface NimRawImport {
  readonly importedModule: string;
  readonly localName?: string;
  readonly start: number;
  readonly end: number;
}

interface NimRawCall {
  readonly sourceKey: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "module";
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface NimRawInstantiation {
  readonly sourceKey: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface NimRawHeritage {
  readonly sourceTypeName: string;
  readonly referenceName: string;
  readonly start: number;
  readonly end: number;
}

interface NimRawRelationFacts {
  readonly valid: boolean;
  readonly moduleName: string;
  readonly types: readonly NimRawType[];
  readonly callables: readonly NimRawCallable[];
  readonly imports: readonly NimRawImport[];
  readonly calls: readonly NimRawCall[];
  readonly instantiations: readonly NimRawInstantiation[];
  readonly heritage: readonly NimRawHeritage[];
}

function emptyNimRelations(): NimRawRelationFacts {
  return { valid: false, moduleName: "", types: [], callables: [], imports: [], calls: [], instantiations: [], heritage: [] };
}

function nimModuleName(filePath: string): string {
  const fileName = filePath.replaceAll("\\", "/").split("/").at(-1) ?? filePath;
  return fileName.replace(/\.(?:nim|nims|nimble)$/iu, "");
}

function nimTypeName(value: string): string | null {
  const normalized = value.trim().replace(/\*$/u, "");
  return /^[A-Za-z_][A-Za-z0-9_.]*$/u.test(normalized) ? normalized : null;
}

function nimArgumentCount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  if (/[\[\]{}]|\b(?:if|for|while|case|proc|func|template|macro|iterator)\b/u.test(trimmed)) return null;
  return trimmed.split(",").every((part) => /^[A-Za-z_][A-Za-z0-9_]*$|^-?[0-9]+(?:\.[0-9]+)?$/u.test(part.trim())) ? trimmed.split(",").length : null;
}

function parseNimParameterShape(parameters: string): { parameterCount: number; parameterTypeNames: string[] } | null {
  const trimmed = parameters.trim();
  if (trimmed === "") return { parameterCount: 0, parameterTypeNames: [] };
  const parameterTypeNames: string[] = [];
  const parts = trimmed.split(",");
  for (const part of parts) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\*)?\s*:\s*([A-Za-z_][A-Za-z0-9_.\[\]]*)$/u.exec(part.trim());
    if (match === null || match[2] === undefined) return null;
    const typeName = nimTypeName(match[2]);
    if (typeName === null) return null;
    parameterTypeNames.push(typeName);
  }
  return { parameterCount: parts.length, parameterTypeNames };
}

function parseNimRelations(sourceText: string, filePath: string): NimRawRelationFacts {
  const sanitized = sanitizeNim(sourceText);
  if (!sanitized.valid || sanitized.text.includes("\t") || /^\s*(?:template|macro|iterator|converter|method|concept)\b/mu.test(sanitized.text)) return emptyNimRelations();
  const lines = linesFor(sanitized.text);
  const moduleName = nimModuleName(filePath);
  const types: NimRawType[] = [];
  const callables: NimRawCallable[] = [];
  const imports: NimRawImport[] = [];
  const calls: NimRawCall[] = [];
  const instantiations: NimRawInstantiation[] = [];
  const heritage: NimRawHeritage[] = [];
  let callableOrdinal = 0;
  let inTypeBlock = false;
  for (const line of lines) {
    if (line.content.length === 0) continue;
    if (line.indent === 0 && line.content === "type") {
      inTypeBlock = true;
      continue;
    }
    if (line.indent === 0 && line.content !== "type") inTypeBlock = false;
    const typeLine = inTypeBlock && line.indent > 0 ? line.content : line.content.startsWith("type ") ? line.content.slice("type ".length).trim() : "";
    const typeMatch = /^([A-Za-z_][A-Za-z0-9_]*)(\*)?\s*=\s*(?:(ref)\s+)?(object|enum|distinct(?:\s+[A-Za-z_][A-Za-z0-9_.]*)?|[A-Za-z_][A-Za-z0-9_.]*)\s*(?:of\s+([A-Za-z_][A-Za-z0-9_.]*))?/u.exec(typeLine);
    if (typeMatch?.[1] !== undefined && typeMatch[4] !== undefined) {
      const kindText = typeMatch[4];
      const declarationKind = kindText === "object" ? "object" : kindText === "enum" ? "enum" : kindText.startsWith("distinct") ? "distinct" : "alias";
      const parentTypeName = typeMatch[5];
      types.push({ name: typeMatch[1], moduleName, declarationKind, isExported: typeMatch[2] === "*", ...(parentTypeName === undefined ? {} : { parentTypeName }), start: line.start, end: line.end });
      if (parentTypeName !== undefined && declarationKind === "object") heritage.push({ sourceTypeName: typeMatch[1], referenceName: parentTypeName, start: line.start, end: line.end });
      continue;
    }
    if (line.indent === 0 && line.content.startsWith("import ")) {
      const importText = line.content.slice("import ".length).trim();
      if (importText.startsWith("{") || importText.startsWith("from ") || importText.includes(" except ")) return emptyNimRelations();
      for (const part of importText.split(",")) {
        const match = /^([A-Za-z_][A-Za-z0-9_./]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/u.exec(part.trim());
        if (match?.[1] === undefined) return emptyNimRelations();
        imports.push({ importedModule: match[1], ...(match[2] === undefined ? {} : { localName: match[2] }), start: line.start + line.content.indexOf(match[1]), end: line.start + line.content.indexOf(match[1]) + match[1].length });
      }
      continue;
    }
    if (line.indent !== 0) continue;
    const callableMatch = /^(proc|func)\s+([A-Za-z_][A-Za-z0-9_]*)(\*)?\s*\(([^()]*)\)\s*(?::\s*([A-Za-z_][A-Za-z0-9_.\[\]]*))?\s*=\s*(.*)$/u.exec(line.content);
    if (callableMatch?.[2] !== undefined && callableMatch[4] !== undefined && callableMatch[6] !== undefined) {
      const shape = parseNimParameterShape(callableMatch[4]);
      if (shape === null) continue;
      const key = `${moduleName}\u0000${callableMatch[2]}\u0000${callableOrdinal++}`;
      const returnTypeName = callableMatch[5] === undefined ? undefined : nimTypeName(callableMatch[5]) ?? undefined;
      const callable: NimRawCallable = { key, name: callableMatch[2], moduleName, parameterCount: shape.parameterCount, parameterTypeNames: shape.parameterTypeNames, ...(returnTypeName === undefined ? {} : { returnTypeName }), isExported: callableMatch[3] === "*", start: line.start, end: line.end };
      callables.push(callable);
      const body = callableMatch[6].trim();
      if (body.length === 0 || /\b(?:if|for|while|case|try|except|finally|template|macro|iterator|yield|await|spawn|parallel|block|defer|when|concept|mixin|include|import|cast|addr|unsafe)\b/u.test(body)) continue;
      const bodyOffset = line.start + line.content.indexOf(callableMatch[6]) + (callableMatch[6].length - callableMatch[6].trimStart().length);
      const qualified = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\(([^()]*)\)$/u.exec(body);
      const direct = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^()]*)\)$/u.exec(body);
      if (qualified?.[1] !== undefined && qualified[2] !== undefined && qualified[3] !== undefined) {
        const argumentCount = nimArgumentCount(qualified[3]);
        if (argumentCount !== null) calls.push({ sourceKey: key, referenceName: qualified[2], callKind: "module", receiverModuleName: qualified[1], argumentCount, start: bodyOffset, end: bodyOffset + qualified[1].length + 1 + qualified[2].length });
      } else if (direct?.[1] !== undefined && direct[2] !== undefined) {
        const argumentCount = nimArgumentCount(direct[2]);
        if (argumentCount !== null) {
          const start = bodyOffset;
          const end = start + direct[1].length;
          if (/^[A-Z]/u.test(direct[1])) instantiations.push({ sourceKey: key, typeName: direct[1], argumentCount, start, end });
          else if (!new Set(["discard", "echo", "return", "result", "assert", "raise", "quit"]).has(direct[1])) calls.push({ sourceKey: key, referenceName: direct[1], callKind: "direct", argumentCount, start, end });
        }
      }
    }
  }
  return { valid: true, moduleName, types, callables, imports, calls, instantiations, heritage };
}

export function extractNimFileFacts(input: NimExtractFileFactsInput): ArtifactFacts {
  const jesterCapability = frameworkCapability("jester");
  if (!jesterCapability.languages.includes(input.language)) {
    throw new Error("Jester extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticNimFacts(input.sourceText);
  const relationFacts = parseNimRelations(input.sourceText, input.filePath);
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const nimTypes: NimTypeFact[] = [];
  const nimCallables: NimCallableFact[] = [];
  const nimImports: NimImportFact[] = [];
  const nimCalls: NimCallFact[] = [];
  const nimInstantiations: NimInstantiationFact[] = [];
  const nimHeritage: NimHeritageFact[] = [];
  const relationCallableSymbols = new Map<string, SymbolNode>();
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
  symbols.push(fileNode);

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = qualifiedName + "\u0000" + kind;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(child: SymbolNode, from: number, to: number): void {
    const range = rangeFor(lineStarts, from, to);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: child.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: child.name
      }),
      sourceId: fileNode.id,
      targetId: child.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: child.name,
      evidence: {
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [child.id]
      }
    });
  }

  function addFunction(functionFact: StaticNimFunction): SymbolNode {
    const qualifiedName = fileNode.qualifiedName + "." + functionFact.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "function");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "function",
        declarationOrdinal
      }),
      name: functionFact.name,
      qualifiedName,
      kind: "function",
      filePath: input.filePath,
      range: rangeFor(lineStarts, functionFact.start, functionFact.end),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(symbol, functionFact.start, functionFact.end);
    return symbol;
  }

  function addJesterRoute(routeFact: StaticJesterRoute, handler: SymbolNode | null): void {
    const routeName = routeFact.method + " " + routeFact.path;
    const qualifiedName = fileNode.qualifiedName + "#route:" + routeName;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
    const range = rangeFor(lineStarts, routeFact.start, routeFact.end);
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name: routeName,
      qualifiedName,
      kind: "route",
      filePath: input.filePath,
      range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(route);
    addContainment(route, routeFact.start, routeFact.end);
    edges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: handler?.id ?? null,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName: routeFact.handlerName
      }),
      sourceId: route.id,
      targetId: handler?.id ?? null,
      kind: "routes",
      filePath: input.filePath,
      range,
      resolution: handler === null ? "unresolved" : "exact",
      confidence: handler === null ? 0 : 1,
      referenceName: routeFact.handlerName,
      evidence: {
        ruleId:
          handler === null
            ? "framework.jester.direct-route-block.literal-named-proc.unresolved"
            : "framework.jester.direct-route-block.literal-named-proc.local-proc",
        stage: "syntax",
        candidateSymbolIds: handler === null ? [] : [handler.id]
      }
    });
  }

  function relationSymbol(
    qualifiedName: string,
    kind: SymbolNode["kind"],
    start: number
  ): SymbolNode | undefined {
    const range = rangeFor(lineStarts, start, start);
    return symbols.find((symbol) => symbol.qualifiedName === qualifiedName && symbol.kind === kind && symbol.range.start.line === range.start.line && symbol.range.start.column === range.start.column);
  }

  function addNimType(type: NimRawType): SymbolNode {
    const qualifiedName = `${input.filePath}#type:${type.name}`;
    const existing = relationSymbol(qualifiedName, "type", type.start);
    if (existing !== undefined) {
      nimTypes.push({ symbolId: existing.id, filePath: input.filePath, name: type.name, moduleName: type.moduleName, declarationKind: type.declarationKind, isExported: type.isExported, range: existing.range });
      return existing;
    }
    const declarationOrdinal = nextOrdinal(qualifiedName, "type");
    const symbol: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "type", declarationOrdinal }), name: type.name, qualifiedName, kind: "type", filePath: input.filePath, range: rangeFor(lineStarts, type.start, type.end), isExported: type.isExported, declarationOrdinal };
    symbols.push(symbol);
    addContainment(symbol, type.start, type.end);
    nimTypes.push({ symbolId: symbol.id, filePath: input.filePath, name: type.name, moduleName: type.moduleName, declarationKind: type.declarationKind, isExported: type.isExported, range: symbol.range });
    return symbol;
  }

  function addNimCallable(callable: NimRawCallable): SymbolNode {
    const qualifiedName = `${input.filePath}.${callable.name}`;
    const existing = relationSymbol(qualifiedName, "function", callable.start);
    const symbol = existing ?? (() => {
      const declarationOrdinal = nextOrdinal(qualifiedName, "function");
      const created: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "function", declarationOrdinal }), name: callable.name, qualifiedName, kind: "function", filePath: input.filePath, range: rangeFor(lineStarts, callable.start, callable.end), isExported: callable.isExported, declarationOrdinal };
      symbols.push(created);
      addContainment(created, callable.start, callable.end);
      return created;
    })();
    nimCallables.push({ symbolId: symbol.id, filePath: input.filePath, name: callable.name, moduleName: callable.moduleName, parameterCount: callable.parameterCount, ...(callable.parameterTypeNames.length === 0 ? {} : { parameterTypeNames: callable.parameterTypeNames }), ...(callable.returnTypeName === undefined ? {} : { returnTypeName: callable.returnTypeName }), isExported: callable.isExported, range: symbol.range });
    relationCallableSymbols.set(callable.key, symbol);
    return symbol;
  }

  if (staticFacts.valid) {
    const functionsByName = new Map<string, SymbolNode[]>();
    const functionStartsById = new Map<string, number>();
    for (const functionFact of [...staticFacts.functions].sort((left, right) => left.start - right.start)) {
      const symbol = addFunction(functionFact);
      functionsByName.set(functionFact.name, [...(functionsByName.get(functionFact.name) ?? []), symbol]);
      functionStartsById.set(symbol.id, functionFact.start);
    }
    for (const routeFact of [...staticFacts.routes].sort((left, right) => left.start - right.start)) {
      const candidates = functionsByName.get(routeFact.handlerName) ?? [];
      addJesterRoute(routeFact, candidates.length === 1 ? candidates[0] ?? null : null);
    }
    for (const callFact of staticFacts.calls) {
      const callers = functionsByName.get(callFact.callerName) ?? [];
      const candidates = (functionsByName.get(callFact.calleeName) ?? []).filter(
        (candidate) => (functionStartsById.get(candidate.id) ?? Number.POSITIVE_INFINITY) < callFact.start
      );
      const caller = callers.length === 1 ? callers[0] : undefined;
      const callee = candidates.length === 1 ? candidates[0] : undefined;
      if (caller === undefined || callee === undefined) {
        continue;
      }
      const range = rangeFor(lineStarts, callFact.start, callFact.end);
      edges.push({
        id: createEdgeId({
          sourceId: caller.id,
          targetId: callee.id,
          kind: "calls",
          line: range.start.line,
          column: range.start.column,
          referenceName: callFact.calleeName
        }),
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName: callFact.calleeName,
        evidence: {
          ruleId: "syntax.nim.same-file.unique-top-level-zero-argument-proc-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      });
    }
  }

  if (relationFacts.valid) {
    const typeSymbols = new Map<string, SymbolNode[]>();
    for (const type of [...relationFacts.types].sort((left, right) => left.start - right.start)) {
      const symbol = addNimType(type);
      typeSymbols.set(type.name, [...(typeSymbols.get(type.name) ?? []), symbol]);
    }
    for (const callable of [...relationFacts.callables].sort((left, right) => left.start - right.start)) addNimCallable(callable);
    for (const imported of relationFacts.imports) {
      nimImports.push({ sourceId: fileNode.id, filePath: input.filePath, importedModule: imported.importedModule, ...(imported.localName === undefined ? {} : { localName: imported.localName }), range: rangeFor(lineStarts, imported.start, imported.end) });
    }
    for (const call of relationFacts.calls) {
      const source = relationCallableSymbols.get(call.sourceKey);
      if (source === undefined) continue;
      nimCalls.push({ sourceId: source.id, filePath: input.filePath, referenceName: call.referenceName, callKind: call.callKind, ...(call.receiverModuleName === undefined ? {} : { receiverModuleName: call.receiverModuleName }), argumentCount: call.argumentCount, range: rangeFor(lineStarts, call.start, call.end) });
    }
    for (const instantiation of relationFacts.instantiations) {
      const source = relationCallableSymbols.get(instantiation.sourceKey);
      if (source === undefined) continue;
      nimInstantiations.push({ sourceId: source.id, filePath: input.filePath, typeName: instantiation.typeName, argumentCount: instantiation.argumentCount, range: rangeFor(lineStarts, instantiation.start, instantiation.end) });
    }
    for (const reference of relationFacts.heritage) {
      const source = typeSymbols.get(reference.sourceTypeName)?.length === 1 ? typeSymbols.get(reference.sourceTypeName)?.[0] : undefined;
      if (source === undefined) continue;
      nimHeritage.push({ sourceId: source.id, filePath: input.filePath, sourceTypeName: reference.sourceTypeName, referenceName: reference.referenceName, relationKind: "extends", range: rangeFor(lineStarts, reference.start, reference.end) });
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
    nimFacts: {
      moduleName: relationFacts.moduleName,
      parserRejected: !relationFacts.valid,
      types: nimTypes,
      callables: nimCallables,
      imports: nimImports,
      calls: nimCalls,
      instantiations: nimInstantiations,
      heritage: nimHeritage
    } satisfies NimFacts
  };
}
