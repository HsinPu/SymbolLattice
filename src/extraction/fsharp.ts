import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type FsharpCallFact,
  type FsharpCallableFact,
  type FsharpFacts,
  type FsharpHeritageFact,
  type FsharpInstantiationFact,
  type FsharpOpenFact,
  type FsharpOverrideFact,
  type FsharpTypeFact,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface FsharpExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "fsharp";
}

interface FsharpLine {
  readonly start: number;
  readonly content: string;
  readonly indent: number;
}

interface StaticFsharpFunction {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface FsharpParameterShape {
  readonly parameterCount: number;
  readonly parameterNames: readonly string[];
  readonly parameterTypeNames: readonly string[];
}

interface FsharpRawType {
  readonly name: string;
  readonly moduleName: string;
  readonly declarationKind: "module" | "namespace" | "class" | "record" | "struct" | "union" | "interface" | "enum" | "delegate" | "typealias";
  readonly isExported: boolean;
  readonly isAbstract: boolean;
  readonly start: number;
  readonly end: number;
  readonly indent: number;
  readonly headerText: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly constructorParameters: FsharpParameterShape | null;
  readonly bases: readonly { readonly name: string; readonly relationKind: "extends" | "implements" }[];
}

interface FsharpRawCallable {
  readonly key: string;
  readonly name: string;
  readonly moduleName: string;
  readonly ownerTypeName?: string;
  readonly callableKind: "function" | "method" | "constructor";
  readonly parameterCount: number;
  readonly parameterNames: readonly string[];
  readonly parameterTypeNames: readonly string[];
  readonly returnTypeName?: string;
  readonly isStatic: boolean;
  readonly isExported: boolean;
  readonly isOverride: boolean;
  readonly start: number;
  readonly end: number;
  readonly indent: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly startLine: number;
  readonly endLine: number;
}

interface FsharpRawOpen {
  readonly importedPath: string;
  readonly isAlias: boolean;
  readonly start: number;
  readonly end: number;
}

interface FsharpRawCall {
  readonly sourceKey: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "member" | "pipeline";
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly receiverIsType?: boolean;
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface FsharpRawInstantiation {
  readonly sourceKey: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface FsharpRawRelationFacts {
  readonly valid: boolean;
  readonly moduleName: string;
  readonly types: readonly FsharpRawType[];
  readonly callables: readonly FsharpRawCallable[];
  readonly opens: readonly FsharpRawOpen[];
  readonly calls: readonly FsharpRawCall[];
  readonly instantiations: readonly FsharpRawInstantiation[];
}

interface StaticFsharpDirectCall {
  readonly callerName: string;
  readonly calleeName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticGiraffeRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticFsharpFacts {
  readonly valid: boolean;
  readonly functions: readonly StaticFsharpFunction[];
  readonly calls: readonly StaticFsharpDirectCall[];
  readonly routes: readonly StaticGiraffeRoute[];
}

interface SanitizedFsharpSource {
  readonly valid: boolean;
  readonly text: string;
}

const GIRAFFE_METHODS: Readonly<Record<string, RouteMethod>> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
  TRACE: "TRACE",
  CONNECT: "CONNECT"
};

const GIRAFFE_ROUTE_IDENTIFIER_NAMES: ReadonlySet<string> = new Set([
  "route",
  ...Object.keys(GIRAFFE_METHODS)
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

function isFsharpIdentifierCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_']/u.test(value);
}

function isFsharpCharacterLiteral(sourceText: string, index: number): boolean {
  if (isFsharpIdentifierCharacter(sourceText[index - 1])) {
    return false;
  }
  return /^'(?:[^\\'\r\n]|\\(?:[\\'"nrtb]|u[0-9A-Fa-f]{4}))'/u.test(sourceText.slice(index));
}

function sanitizeFsharp(sourceText: string): SanitizedFsharpSource {
  const text = sourceText.split("");
  const delimiters: string[] = [];
  let index = 0;

  function blank(position: number): void {
    if (text[position] !== "\r" && text[position] !== "\n") {
      text[position] = " ";
    }
  }

  function blankRange(from: number, to: number): void {
    for (let position = from; position < to; position += 1) {
      blank(position);
    }
  }

  function scanRegularString(quote = "\""): boolean {
    index += 1;
    while (index < sourceText.length) {
      const current = sourceText[index];
      if (current === "\\") {
        if (index + 1 >= sourceText.length) {
          return false;
        }
        index += 2;
        continue;
      }
      if (current === quote) {
        index += 1;
        return true;
      }
      if (current === "\r" || current === "\n") {
        return false;
      }
      index += 1;
    }
    return false;
  }

  function scanVerbatimString(): boolean {
    const start = index;
    index += 1;
    while (index < sourceText.length) {
      const current = sourceText[index];
      if (current === "\"") {
        if (sourceText[index + 1] === "\"") {
          index += 2;
          continue;
        }
        index += 1;
        blankRange(start, index);
        return true;
      }
      index += 1;
    }
    return false;
  }

  function scanTripleQuotedString(): boolean {
    const start = index;
    const closing = sourceText.indexOf('"""', index + 3);
    if (closing === -1) {
      return false;
    }
    index = closing + 3;
    blankRange(start, index);
    return true;
  }

  while (index < sourceText.length) {
    const current = sourceText[index];
    if (current === undefined) {
      break;
    }

    if (sourceText.slice(index, index + 2) === "//") {
      while (index < sourceText.length && sourceText[index] !== "\r" && sourceText[index] !== "\n") {
        blank(index);
        index += 1;
      }
      continue;
    }

    if (sourceText.slice(index, index + 2) === "(*") {
      let depth = 0;
      while (index < sourceText.length) {
        const pair = sourceText.slice(index, index + 2);
        if (pair === "(*") {
          depth += 1;
          blank(index);
          blank(index + 1);
          index += 2;
          continue;
        }
        if (pair === "*)") {
          depth -= 1;
          blank(index);
          blank(index + 1);
          index += 2;
          if (depth === 0) {
            break;
          }
          continue;
        }
        blank(index);
        index += 1;
      }
      if (depth !== 0) {
        return { valid: false, text: "" };
      }
      continue;
    }

    if (sourceText.slice(index, index + 3) === '"""') {
      if (!scanTripleQuotedString()) {
        return { valid: false, text: "" };
      }
      continue;
    }

    if (sourceText.slice(index, index + 4) === '$"""') {
      blank(index);
      index += 1;
      if (!scanTripleQuotedString()) {
        return { valid: false, text: "" };
      }
      continue;
    }

    if (current === "@" && sourceText[index + 1] === "\"") {
      index += 1;
      if (!scanVerbatimString()) {
        return { valid: false, text: "" };
      }
      continue;
    }

    if (
      (current === "$" && sourceText[index + 1] === "@" && sourceText[index + 2] === "\"") ||
      (current === "@" && sourceText[index + 1] === "$" && sourceText[index + 2] === "\"")
    ) {
      index += 2;
      if (!scanVerbatimString()) {
        return { valid: false, text: "" };
      }
      continue;
    }

    if (current === "$" && sourceText[index + 1] === "\"") {
      index += 1;
      if (!scanRegularString()) {
        return { valid: false, text: "" };
      }
      continue;
    }

    if (current === "\"") {
      if (!scanRegularString()) {
        return { valid: false, text: "" };
      }
      continue;
    }

    if (current === "'" && isFsharpCharacterLiteral(sourceText, index)) {
      if (!scanRegularString("'")) {
        return { valid: false, text: "" };
      }
      continue;
    }

    if (OPEN_TO_CLOSE.has(current)) {
      delimiters.push(current);
    } else {
      const expectedOpen = CLOSE_TO_OPEN.get(current);
      if (expectedOpen !== undefined && delimiters.pop() !== expectedOpen) {
        return { valid: false, text: "" };
      }
    }
    index += 1;
  }

  return delimiters.length === 0
    ? { valid: true, text: text.join("") }
    : { valid: false, text: "" };
}

function linesFor(sourceText: string, sanitizedText: string): readonly FsharpLine[] {
  const starts = lineStartsFor(sourceText);
  const lines: FsharpLine[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index] ?? 0;
    const nextStart = starts[index + 1] ?? sourceText.length;
    let end = nextStart;
    while (end > start && (sourceText[end - 1] === "\r" || sourceText[end - 1] === "\n")) {
      end -= 1;
    }
    const text = sanitizedText.slice(start, end);
    const indentMatch = /^( *)/u.exec(text);
    lines.push({
      start,
      content: text.trim(),
      indent: indentMatch?.[1]?.length ?? 0
    });
  }
  return lines;
}

function fsharpIdentifier(value: string | undefined): string | null {
  return value !== undefined && /^[A-Za-z_][A-Za-z0-9_']*$/u.test(value) ? value : null;
}

function fsharpQualifiedIdentifier(value: string | undefined): string | null {
  return value !== undefined && /^[A-Za-z_][A-Za-z0-9_'.]*(?:\.[A-Za-z_][A-Za-z0-9_']*)*$/u.test(value)
    ? value
    : null;
}

function fsharpIsExported(line: string): boolean {
  return !/\bprivate\b/u.test(line);
}

function fsharpParameterShape(text: string): FsharpParameterShape | null {
  const groups = [...text.matchAll(/\(([^()]*)\)/gu)];
  if (groups.length === 0) return null;
  const parameterNames: string[] = [];
  const parameterTypeNames: string[] = [];
  for (const group of groups) {
    const content = (group[1] ?? "").trim();
    if (content === "") continue;
    const parameters = content.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
    for (const parameter of parameters) {
      const match = /^(?:[A-Za-z_][A-Za-z0-9_']*\s*:\s*)?([A-Za-z_][A-Za-z0-9_'.]*(?:<[^>]+>)?)$/u.exec(parameter);
      if (match === null || match[1] === undefined || parameter.includes("->")) return null;
      const nameMatch = /^([A-Za-z_][A-Za-z0-9_']*)\s*:/u.exec(parameter);
      const typeName = match[1].replace(/<[^>]+>$/u, "");
      if (typeName === "var" || typeName === "obj" || typeName === "dynamic" || fsharpQualifiedIdentifier(typeName) === null) return null;
      parameterNames.push(nameMatch?.[1] ?? "");
      parameterTypeNames.push(typeName);
    }
  }
  return { parameterCount: parameterTypeNames.length, parameterNames, parameterTypeNames };
}

function fsharpArrowParameterShape(text: string): FsharpParameterShape | null {
  if (!text.includes("->")) return null;
  const segments = text.split("->").map((part) => part.trim()).filter((part) => part.length > 0);
  if (segments.length < 2) return null;
  const parameters = segments.slice(0, -1).map((part) => part.replace(/^:\s*/u, "")).filter((part) => part !== "unit");
  if (parameters.some((part) => fsharpQualifiedIdentifier(part) === null)) return null;
  return { parameterCount: parameters.length, parameterNames: parameters.map(() => ""), parameterTypeNames: parameters };
}

function fsharpReturnType(text: string): string | undefined {
  const explicit = /\)\s*:\s*([A-Za-z_][A-Za-z0-9_'.]*)(?:\s*=|\s*$)/u.exec(text)?.[1];
  if (explicit !== undefined && explicit !== "unit") return explicit;
  const arrow = text.split("->").at(-1)?.trim();
  return arrow !== undefined && arrow !== "unit" && fsharpQualifiedIdentifier(arrow) !== null ? arrow : undefined;
}

function fsharpBlockEnd(lines: readonly FsharpLine[], startLine: number, indent: number): number {
  for (let index = startLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && line.content.length > 0 && line.indent <= indent) return index - 1;
  }
  return lines.length - 1;
}

function fsharpTypeDeclarationKind(
  line: FsharpLine,
  previous: FsharpLine | undefined,
  body: string,
  parameterText: string | undefined
): FsharpRawType["declarationKind"] {
  const header = `${previous?.content ?? ""} ${line.content}`;
  if (/^delegate\s+of\b/u.test(body)) return "delegate";
  if (/^interface\b/u.test(body) || /\babstract\s+[A-Za-z_][A-Za-z0-9_']*\s*:/u.test(body)) return "interface";
  if (/^struct\b/u.test(body) || /\bStruct\b/u.test(header)) return "struct";
  if (/^\{/u.test(body) || (body === "" && line.content.startsWith("type ") && /\{/.test(previous?.content ?? ""))) return "record";
  if (/^\|/u.test(body) || /\|/.test(body)) return /\|\s*[A-Za-z_][A-Za-z0-9_']*\s*=\s*-?\d+/u.test(body) ? "enum" : "union";
  if (parameterText !== undefined || /^class\b/u.test(body) || /\binherit\s+[A-Za-z_]/u.test(body)) return "class";
  return "typealias";
}

function parseFsharpRelations(sourceText: string): FsharpRawRelationFacts {
  const sanitized = sanitizeFsharp(sourceText);
  if (!sanitized.valid || sanitized.text.includes("\t") || sourceText.split(/\r?\n/u).some((line) => /^\s*#(?:if|elif|else|endif)\b/u.test(line))) return { valid: false, moduleName: "", types: [], callables: [], opens: [], calls: [], instantiations: [] };
  const lines = linesFor(sourceText, sanitized.text);
  const blocks: Array<{ readonly kind: "module" | "type"; readonly indent: number; readonly name: string }> = [];
  const rawTypes: FsharpRawType[] = [];
  const rawCallables: FsharpRawCallable[] = [];
  const rawOpens: FsharpRawOpen[] = [];
  let rootModuleName = "";
  const functionRanges: Array<{ readonly startLine: number; readonly endLine: number; readonly indent: number }> = [];
  const moduleNameAt = (): string => blocks.filter((block) => block.kind === "module").at(-1)?.name ?? "";
  const currentType = (): { readonly name: string; readonly indent: number; readonly startLine: number } | null => {
    const block = [...blocks].reverse().find((candidate) => candidate.kind === "type");
    return block === undefined ? null : { name: block.name, indent: block.indent, startLine: 0 };
  };
  const lineOffset = (line: FsharpLine): number => line.start + line.indent;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.content.length === 0) continue;
    while (blocks.length > 0 && (blocks.at(-1)?.indent ?? -1) >= 0 && line.indent <= (blocks.at(-1)?.indent ?? -1)) blocks.pop();
    const previous = index > 0 ? lines[index - 1] : undefined;
    const moduleMatch = /^(namespace|module)\s+([A-Za-z_][A-Za-z0-9_'.]*)(\s*=)?$/u.exec(line.content);
    if (moduleMatch !== null && moduleMatch[1] !== undefined && moduleMatch[2] !== undefined) {
      const parent = moduleNameAt();
      const fullName = parent === "" ? moduleMatch[2] : `${parent}.${moduleMatch[2]}`;
      if (rootModuleName === "" && parent === "") rootModuleName = fullName;
      rawTypes.push({ name: fullName, moduleName: parent, declarationKind: moduleMatch[1] === "namespace" ? "namespace" : "module", isExported: true, isAbstract: false, start: lineOffset(line), end: lineOffset(line) + line.content.length, indent: line.indent, headerText: line.content, startLine: index, endLine: index, constructorParameters: null, bases: [] });
      blocks.push({ kind: "module", indent: moduleMatch[3] === undefined ? -1 : line.indent, name: fullName });
      continue;
    }
    const openMatch = /^open\s+([A-Za-z_][A-Za-z0-9_'.]*)(?:\s+as\s+[A-Za-z_][A-Za-z0-9_']*)?$/u.exec(line.content);
    if (openMatch !== null && openMatch[1] !== undefined) {
      rawOpens.push({ importedPath: openMatch[1], isAlias: /\s+as\s+/u.test(line.content), start: lineOffset(line), end: lineOffset(line) + line.content.length });
      continue;
    }
    const insideFunction = functionRanges.some((range) => index > range.startLine && index <= range.endLine && line.indent > range.indent);
    const typeMatch = /^type\s+([A-Z_][A-Za-z0-9_']*)(?:\s*\(([^)]*)\))?\s*(?:=\s*(.*))?$/u.exec(line.content);
    if (!insideFunction && typeMatch !== null && typeMatch[1] !== undefined) {
      const name = typeMatch[1];
      const parameterText = typeMatch[2];
      const body = (typeMatch[3] ?? "").trim();
      const moduleName = moduleNameAt();
      const declarationKind = fsharpTypeDeclarationKind(line, previous, body, parameterText);
      const typeEndLine = fsharpBlockEnd(lines, index, line.indent);
      const bases: Array<{ readonly name: string; readonly relationKind: "extends" | "implements" }> = [];
      for (let bodyIndex = index; bodyIndex <= typeEndLine; bodyIndex += 1) {
        const bodyLine = lines[bodyIndex];
        if (bodyLine === undefined) continue;
        const inherit = /\binherit\s+([A-Za-z_][A-Za-z0-9_'.]*)/u.exec(bodyLine.content)?.[1];
        if (inherit !== undefined) bases.push({ name: inherit, relationKind: "extends" });
        const implementation = /^interface\s+([A-Za-z_][A-Za-z0-9_'.]*)\s+with\b/u.exec(bodyLine.content)?.[1];
        if (implementation !== undefined) bases.push({ name: implementation, relationKind: "implements" });
      }
      rawTypes.push({ name, moduleName, declarationKind, isExported: fsharpIsExported(line.content), isAbstract: /\bAbstractClass\b|\babstract\b/u.test(`${previous?.content ?? ""} ${line.content}`), start: lineOffset(line), end: lineOffset(line) + line.content.length, indent: line.indent, headerText: line.content, startLine: index, endLine: typeEndLine, constructorParameters: parameterText === undefined ? null : fsharpParameterShape(`(${parameterText})`), bases: [...new Map(bases.map((base) => [`${base.relationKind}:${base.name}`, base])).values()] });
      blocks.push({ kind: "type", indent: line.indent, name });
      continue;
    }
    const activeType = currentType();
    if (activeType !== null && line.indent > activeType.indent) {
      const memberMatch = /^(?:(static)\s+)?(member|override|abstract|default)\s+(?:(?:[A-Za-z_][A-Za-z0-9_']*|_)[.]\s*)?([A-Za-z_][A-Za-z0-9_']*)\s*(.*)$/u.exec(line.content);
      if (memberMatch !== null && memberMatch[3] !== undefined) {
        const rest = memberMatch[4] ?? "";
        const shape = fsharpParameterShape(rest) ?? fsharpArrowParameterShape(rest) ?? { parameterCount: 0, parameterNames: [], parameterTypeNames: [] };
        const returnTypeName = fsharpReturnType(rest);
        const endLine = fsharpBlockEnd(lines, index, line.indent);
        rawCallables.push({ key: `method:${index}`, name: memberMatch[3], moduleName: moduleNameAt(), ownerTypeName: activeType.name, callableKind: "method", parameterCount: shape.parameterCount, parameterNames: shape.parameterNames, parameterTypeNames: shape.parameterTypeNames, ...(returnTypeName === undefined ? {} : { returnTypeName }), isStatic: memberMatch[1] !== undefined, isExported: fsharpIsExported(line.content), isOverride: memberMatch[2] === "override", start: lineOffset(line), end: lineOffset(line) + line.content.length, indent: line.indent, bodyStart: lineOffset(line), bodyEnd: endLine >= index ? (lines[endLine]?.start ?? sourceText.length) + (lines[endLine]?.content.length ?? 0) : lineOffset(line) + line.content.length, startLine: index, endLine });
        continue;
      }
    }
    if (insideFunction || activeType !== null) continue;
    const functionMatch = /^let\s+(?:(?:private|internal|public)\s+)?(?:rec\s+)?([a-z_][A-Za-z0-9_']*)\s*(.*?)\s*=\s*(.*)$/u.exec(line.content);
    if (functionMatch !== null && functionMatch[1] !== undefined && (functionMatch[2]?.includes("(") ?? false)) {
      const rest = functionMatch[2] ?? "";
      const shape = fsharpParameterShape(rest);
      if (shape === null) continue;
      const endLine = fsharpBlockEnd(lines, index, line.indent);
      const returnTypeName = fsharpReturnType(rest);
      const callable: FsharpRawCallable = { key: `function:${index}`, name: functionMatch[1], moduleName: moduleNameAt(), callableKind: "function", parameterCount: shape.parameterCount, parameterNames: shape.parameterNames, parameterTypeNames: shape.parameterTypeNames, ...(returnTypeName === undefined ? {} : { returnTypeName }), isStatic: true, isExported: fsharpIsExported(line.content), isOverride: false, start: lineOffset(line), end: lineOffset(line) + line.content.length, indent: line.indent, bodyStart: lineOffset(line), bodyEnd: endLine >= index ? (lines[endLine]?.start ?? sourceText.length) + (lines[endLine]?.content.length ?? 0) : lineOffset(line) + line.content.length, startLine: index, endLine };
      rawCallables.push(callable);
      functionRanges.push({ startLine: index, endLine, indent: line.indent });
    }
  }
  const calls: FsharpRawCall[] = [];
  const instantiations: FsharpRawInstantiation[] = [];
  const callablesForBody = rawCallables.filter((callable) => callable.callableKind !== "constructor");
  for (const callable of callablesForBody) {
    const bindings = new Map<string, string>();
    callable.parameterNames.forEach((name, index) => {
      const typeName = callable.parameterTypeNames[index];
      if (name !== "" && typeName !== undefined) bindings.set(name, typeName);
    });
    const tainted = new Set<string>();
    const bodyLines = lines.slice(callable.startLine, callable.endLine + 1);
    const bodyText = bodyLines.map((line) => line.content).join("\n");
    for (const name of bindings.keys()) {
      if (new RegExp(`(?:\\breturn\\s+${name}\\b|\\b[A-Za-z_][A-Za-z0-9_']*\\s*\\([^)]*\\b${name}\\b[^)]*\\))`, "u").test(bodyText)) tainted.add(name);
    }
    for (const bodyLine of bodyLines) {
      if (bodyLine === undefined || bodyLine.content.length === 0) continue;
      const lineText = bodyLine.content;
      const localBinding = /^let\s+(mutable\s+)?([a-z_][A-Za-z0-9_']*)\s*(?::\s*([A-Za-z_][A-Za-z0-9_'.]*))?\s*=\s*([A-Z_][A-Za-z0-9_']*)\s*\(/u.exec(lineText);
      if (localBinding?.[2] !== undefined) {
        const localType = localBinding[3] ?? localBinding[4];
        if (localType !== undefined && fsharpQualifiedIdentifier(localType) !== null && localType !== "dynamic" && localType !== "obj") bindings.set(localBinding[2], localType);
        if (localBinding[1] !== undefined) tainted.add(localBinding[2]);
        if (new RegExp(`(?:\\breturn\\s+${localBinding[2]}\\b|\\b[A-Za-z_][A-Za-z0-9_']*\\s*\\([^)]*\\b${localBinding[2]}\\b[^)]*\\))`, "u").test(bodyText)) tainted.add(localBinding[2]);
      }
      for (const mutation of lineText.matchAll(/\b([a-z_][A-Za-z0-9_']*)\s*<-/gu)) if (mutation[1] !== undefined) tainted.add(mutation[1]);
      const declarationEquals = /^(?:let\b|(?:(?:static)\s+)?(?:member|override|abstract|default)\b)/u.test(lineText) ? lineText.indexOf("=") : -1;
      const executableOffset = declarationEquals >= 0 ? declarationEquals + 1 : 0;
      const executableText = declarationEquals >= 0 ? lineText.slice(executableOffset) : lineText;
      const sourceOffset = bodyLine.start + bodyLine.indent + executableOffset;
      const pipeline = /\|>\s*([a-z_][A-Za-z0-9_']*)\b/u.exec(executableText)?.[1];
      if (pipeline !== undefined) {
        const start = sourceOffset + Math.max(0, executableText.indexOf(pipeline));
        calls.push({ sourceKey: callable.key, referenceName: pipeline, callKind: "pipeline", argumentCount: 1, start, end: start + pipeline.length });
      }
      for (const match of executableText.matchAll(/\b([A-Za-z_][A-Za-z0-9_']*)\.([A-Za-z_][A-Za-z0-9_']*)\s*\(([^()]*)\)/gu)) {
        const receiverName = match[1];
        const name = match[2];
        if (receiverName === undefined || name === undefined || tainted.has(receiverName)) continue;
        const offset = match.index ?? -1;
        if (offset < 0) continue;
        const argumentCount = (match[3] ?? "").trim() === "" ? 0 : (match[3] ?? "").split(",").length;
        const receiverIsType = /^[A-Z_]/u.test(receiverName);
        const receiverTypeName = bindings.get(receiverName) ?? (receiverIsType ? receiverName : undefined);
        calls.push({ sourceKey: callable.key, referenceName: name, callKind: "member", receiverName, ...(receiverTypeName === undefined ? {} : { receiverTypeName }), ...(receiverIsType ? { receiverIsType: true } : {}), argumentCount, start: sourceOffset + offset, end: sourceOffset + offset + (match[0]?.length ?? 0) });
      }
      for (const match of executableText.matchAll(/\b([a-z_][A-Za-z0-9_']*)\s*\(([^()]*)\)/gu)) {
        const name = match[1];
        const offset = match.index ?? -1;
        const previous = offset > 0 ? executableText[offset - 1] : undefined;
        if (name === undefined || offset < 0 || previous === "." || /^let\s/.test(executableText.slice(0, offset))) continue;
        const argumentCount = (match[2] ?? "").trim() === "" ? 0 : (match[2] ?? "").split(",").length;
        calls.push({ sourceKey: callable.key, referenceName: name, callKind: "direct", argumentCount, start: sourceOffset + offset, end: sourceOffset + offset + name.length });
      }
      for (const match of executableText.matchAll(/\b(?:new\s+)?([A-Z_][A-Za-z0-9_']*)\s*\(([^()]*)\)/gu)) {
        const typeName = match[1];
        if (typeName === undefined) continue;
        const argumentCount = (match[2] ?? "").trim() === "" ? 0 : (match[2] ?? "").split(",").length;
        const offset = match.index ?? 0;
        const start = sourceOffset + offset;
        instantiations.push({ sourceKey: callable.key, typeName, argumentCount, start, end: start + typeName.length + (match[0]?.length ?? typeName.length) - typeName.length });
      }
    }
  }
  const constructorCallables: FsharpRawCallable[] = [];
  for (const type of rawTypes) {
    if (type.declarationKind !== "class" || type.constructorParameters === null) continue;
    constructorCallables.push({ key: `constructor:${type.startLine}`, name: type.name, moduleName: type.moduleName, ownerTypeName: type.name, callableKind: "constructor", parameterCount: type.constructorParameters.parameterCount, parameterNames: type.constructorParameters.parameterNames, parameterTypeNames: type.constructorParameters.parameterTypeNames, isStatic: false, isExported: type.isExported, isOverride: false, start: type.start, end: type.end, indent: type.indent, bodyStart: type.start, bodyEnd: type.end, startLine: type.startLine, endLine: type.endLine });
  }
  return { valid: true, moduleName: rootModuleName, types: rawTypes, callables: [...rawCallables, ...constructorCallables], opens: rawOpens, calls, instantiations };
}

function directFsharpFunction(line: FsharpLine): StaticFsharpFunction | null {
  if (line.indent !== 0) {
    return null;
  }
  const match =
    /^let\s+(?:rec\s+)?([a-z_][A-Za-z0-9_']*)\s+(?:\(\s*\)|\(\s*[a-z_][A-Za-z0-9_']*\s*:\s*HttpFunc\s*\)\s+\(\s*[a-z_][A-Za-z0-9_']*\s*:\s*HttpContext\s*\))\s*=/u.exec(
      line.content
    );
  const name = match?.[1];
  if (name === undefined) {
    return null;
  }
  return {
    name,
    start: line.start,
    end: line.start + line.content.length
  };
}

function directFsharpZeroArgumentCall(line: FsharpLine): StaticFsharpDirectCall | null {
  if (line.indent !== 0) {
    return null;
  }
  const match =
    /^let\s+([a-z_][A-Za-z0-9_']*)\s+\(\s*\)\s*=\s*([a-z_][A-Za-z0-9_']*)\s+\(\s*\)\s*$/u.exec(
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

function isFsharpB1Line(line: FsharpLine): boolean {
  return (
    line.indent === 0 &&
    /^let\s+[a-z_][A-Za-z0-9_']*\s+\(\s*\)\s*=\s+(?:[a-z_][A-Za-z0-9_']*\s+\(\s*\)|[0-9]+|true|false)\s*$/u.test(
      line.content
    )
  );
}

function directTopLevelBindingName(line: FsharpLine): string | null {
  if (line.indent !== 0) {
    return null;
  }
  const match = /^let\s+(?:rec\s+)?([A-Za-z_][A-Za-z0-9_']*)\b/u.exec(line.content);
  return match?.[1] ?? null;
}

function priorNonEmptyLine(lines: readonly FsharpLine[], index: number): FsharpLine | null {
  for (let previous = index - 1; previous >= 0; previous -= 1) {
    const line = lines[previous];
    if (line !== undefined && line.content.length > 0) {
      return line;
    }
  }
  return null;
}

function directGiraffeChooseHeader(lines: readonly FsharpLine[], index: number): FsharpLine | null {
  const line = lines[index];
  if (line === undefined) {
    return null;
  }
  if (
    line.indent === 0 &&
    /^let\s+(?:rec\s+)?[a-z_][A-Za-z0-9_']*\s*=\s*choose\s+\[$/u.test(line.content)
  ) {
    return line;
  }
  if (line.content !== "choose [" || line.indent === 0) {
    return null;
  }
  const binding = priorNonEmptyLine(lines, index);
  if (binding === null || binding.indent !== 0) {
    return null;
  }
  return /^let\s+(?:rec\s+)?[a-z_][A-Za-z0-9_']*\s*=$/u.test(binding.content) ? line : null;
}

function directGiraffeRoute(line: FsharpLine): StaticGiraffeRoute | null {
  const match =
    /^(?:(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+>=>\s+)?route\s+"(\/[^"\\\r\n]*)"\s+>=>\s+([a-z_][A-Za-z0-9_']*)\s*;?$/u.exec(
      line.content
    );
  const verb = match?.[1];
  const path = match?.[2];
  const handlerName = match?.[3];
  const method = verb === undefined ? "ALL" : GIRAFFE_METHODS[verb];
  if (method === undefined || path === undefined || handlerName === undefined) {
    return null;
  }
  return {
    method,
    path,
    handlerName,
    start: line.start + line.indent,
    end: line.start + line.indent + line.content.length
  };
}

function staticFsharpFacts(sourceText: string): StaticFsharpFacts {
  const sanitized = sanitizeFsharp(sourceText);
  if (!sanitized.valid || sanitized.text.includes("\t")) {
    return { valid: false, functions: [], calls: [], routes: [] };
  }
  const lines = linesFor(sourceText, sanitized.text);
  const functions = lines
    .map((line) => directFsharpFunction(line))
    .filter((functionFact): functionFact is StaticFsharpFunction => functionFact !== null);
  const calls = lines
    .map((line) => directFsharpZeroArgumentCall(line))
    .filter((call): call is StaticFsharpDirectCall => call !== null);
  const routes: StaticGiraffeRoute[] = [];
  const directGiraffeOpenCount = lines.filter(
    (line) => line.indent === 0 && line.content === "open Giraffe"
  ).length;
  const hasRouteBindingShadow = lines.some((line) => {
    const bindingName = directTopLevelBindingName(line);
    return bindingName !== null && GIRAFFE_ROUTE_IDENTIFIER_NAMES.has(bindingName);
  });

  for (let index = 0; index < lines.length; index += 1) {
    const header = directGiraffeChooseHeader(lines, index);
    if (header === null) {
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
      const route = directGiraffeRoute(line);
      if (route !== null) {
        routes.push(route);
      }
    }
  }

  return {
    valid: true,
    functions,
    calls: lines.every((line) => line.content.length === 0 || isFsharpB1Line(line)) ? calls : [],
    routes: directGiraffeOpenCount === 1 && !hasRouteBindingShadow ? routes : []
  };
}

export function extractFsharpFileFacts(input: FsharpExtractFileFactsInput): ArtifactFacts {
  const giraffeCapability = frameworkCapability("giraffe");
  if (!giraffeCapability.languages.includes(input.language)) {
    throw new Error("Giraffe extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticFsharpFacts(input.sourceText);
  const relationFacts = parseFsharpRelations(input.sourceText);
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const fsharpTypes: FsharpTypeFact[] = [];
  const fsharpCallables: FsharpCallableFact[] = [];
  const fsharpOpens: FsharpOpenFact[] = [];
  const fsharpCalls: FsharpCallFact[] = [];
  const fsharpInstantiations: FsharpInstantiationFact[] = [];
  const fsharpHeritage: FsharpHeritageFact[] = [];
  const fsharpOverrides: FsharpOverrideFact[] = [];
  const relationCallableSymbols = new Map<string, SymbolNode>();
  const functionSymbolsByStart = new Map<number, SymbolNode>();
  const legacyFunctionStarts = new Set(staticFacts.functions.map((functionFact) => functionFact.start));
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

  function addFsharpContainment(parent: SymbolNode, child: SymbolNode, from: number, to: number): void {
    const range = rangeFor(lineStarts, from, to);
    edges.push({
      id: createEdgeId({ sourceId: parent.id, targetId: child.id, kind: "contains", line: range.start.line, column: range.start.column, referenceName: child.name }),
      sourceId: parent.id,
      targetId: child.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: child.name,
      evidence: { ruleId: "syntax.containment", stage: "syntax", candidateSymbolIds: [child.id] }
    });
  }

  function addFsharpType(type: FsharpRawType, parent: SymbolNode): SymbolNode {
    const qualifiedPath = type.declarationKind === "module" || type.declarationKind === "namespace"
      ? type.name
      : type.moduleName === "" ? type.name : `${type.moduleName}.${type.name}`;
    const qualifiedName = type.declarationKind === "module" || type.declarationKind === "namespace"
      ? `${fileNode.qualifiedName}#module:${type.name}`
      : `${fileNode.qualifiedName}#${qualifiedPath}`;
    const kind: SymbolNode["kind"] = type.declarationKind === "module" || type.declarationKind === "namespace"
      ? "module"
      : type.declarationKind === "class"
        ? "class"
        : type.declarationKind === "interface"
          ? "interface"
          : "type";
    const declarationOrdinal = nextOrdinal(qualifiedName, kind);
    const symbol: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind, declarationOrdinal }), name: type.name, qualifiedName, kind, filePath: input.filePath, range: rangeFor(lineStarts, type.start, type.end), isExported: type.isExported, declarationOrdinal };
    symbols.push(symbol);
    addFsharpContainment(parent, symbol, type.start, type.end);
    fsharpTypes.push({ symbolId: symbol.id, filePath: input.filePath, name: type.name, moduleName: type.moduleName, qualifiedTypePath: qualifiedPath, declarationKind: type.declarationKind, isExported: type.isExported, ...(type.isAbstract ? { isAbstract: true } : {}), range: symbol.range });
    for (const base of type.bases) fsharpHeritage.push({ sourceId: symbol.id, filePath: input.filePath, referenceName: base.name, relationKind: base.relationKind, sourceTypeKind: type.declarationKind, range: symbol.range });
    return symbol;
  }

  function addFsharpCallable(callable: FsharpRawCallable, owner: SymbolNode | undefined): SymbolNode {
    const qualifiedName = callable.ownerTypeName === undefined
      ? legacyFunctionStarts.has(callable.start)
        ? `${fileNode.qualifiedName}.${callable.name}`
        : `${fileNode.qualifiedName}#${callable.moduleName === "" ? "" : `${callable.moduleName}.`}${callable.name}`
      : `${owner?.qualifiedName ?? `${fileNode.qualifiedName}#${callable.ownerTypeName}`}.${callable.name}`;
    const kind: SymbolNode["kind"] = callable.callableKind === "function" ? "function" : "method";
    const declarationOrdinal = nextOrdinal(qualifiedName, kind);
    const symbol: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind, declarationOrdinal }), name: callable.name, qualifiedName, kind, filePath: input.filePath, range: rangeFor(lineStarts, callable.start, callable.end), isExported: callable.isExported, declarationOrdinal };
    symbols.push(symbol);
    if (owner === undefined) addContainment(symbol, callable.start, callable.end);
    else addFsharpContainment(owner, symbol, callable.start, callable.end);
    relationCallableSymbols.set(callable.key, symbol);
    if (callable.callableKind === "function") functionSymbolsByStart.set(callable.start, symbol);
    fsharpCallables.push({ symbolId: symbol.id, filePath: input.filePath, name: callable.name, moduleName: callable.moduleName, callableKind: callable.callableKind, ...(callable.ownerTypeName === undefined ? {} : { ownerTypeName: callable.ownerTypeName }), ...(owner === undefined ? {} : { ownerTypeId: owner.id }), parameterCount: callable.parameterCount, requiredParameterCount: callable.parameterCount, parameterTypeNames: callable.parameterTypeNames, ...(callable.returnTypeName === undefined ? {} : { returnTypeName: callable.returnTypeName }), isStatic: callable.isStatic, isExported: callable.isExported, ...(callable.isOverride ? { isOverride: true } : {}), range: symbol.range });
    if (callable.isOverride && callable.ownerTypeName !== undefined) fsharpOverrides.push({ sourceId: symbol.id, filePath: input.filePath, methodName: callable.name, ownerTypeName: callable.ownerTypeName, range: symbol.range });
    return symbol;
  }

  function addFunction(functionFact: StaticFsharpFunction): SymbolNode {
    const existing = functionSymbolsByStart.get(functionFact.start);
    if (existing !== undefined) return existing;
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

  function addGiraffeRoute(routeFact: StaticGiraffeRoute, handler: SymbolNode | null): void {
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
            ? "framework.giraffe.direct-choose.literal-named-function.unresolved"
            : "framework.giraffe.direct-choose.literal-named-function.local-function",
        stage: "syntax",
        candidateSymbolIds: handler === null ? [] : [handler.id]
      }
    });
  }

  const moduleSymbols = new Map<string, SymbolNode>();
  for (const type of relationFacts.types.filter((candidate) => candidate.declarationKind === "module" || candidate.declarationKind === "namespace").sort((left, right) => left.start - right.start)) {
    const parent = type.moduleName === "" ? fileNode : moduleSymbols.get(type.moduleName) ?? fileNode;
    const symbol = addFsharpType(type, parent);
    moduleSymbols.set(type.name, symbol);
  }
  for (const type of relationFacts.types.filter((candidate) => candidate.declarationKind !== "module" && candidate.declarationKind !== "namespace").sort((left, right) => left.start - right.start)) {
    const parent = type.moduleName === "" ? fileNode : moduleSymbols.get(type.moduleName) ?? fileNode;
    addFsharpType(type, parent);
  }
  const findFsharpType = (moduleName: string, name: string): SymbolNode | undefined => {
    const candidates = fsharpTypes.filter((fact) => fact.moduleName === moduleName && fact.name === name).map((fact) => symbols.find((symbol) => symbol.id === fact.symbolId)).filter((symbol): symbol is SymbolNode => symbol !== undefined);
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  for (const callable of [...relationFacts.callables].sort((left, right) => left.start - right.start)) {
    const owner = callable.ownerTypeName === undefined ? undefined : findFsharpType(callable.moduleName, callable.ownerTypeName);
    addFsharpCallable(callable, owner);
  }
  for (const open of relationFacts.opens) fsharpOpens.push({ sourceId: fileNode.id, filePath: input.filePath, importedPath: open.importedPath, isAlias: open.isAlias, range: rangeFor(lineStarts, open.start, open.end) });
  for (const call of relationFacts.calls) {
    const source = relationCallableSymbols.get(call.sourceKey);
    if (source === undefined) continue;
    fsharpCalls.push({ sourceId: source.id, filePath: input.filePath, referenceName: call.referenceName, callKind: call.callKind, ...(call.receiverName === undefined ? {} : { receiverName: call.receiverName }), ...(call.receiverTypeName === undefined ? {} : { receiverTypeName: call.receiverTypeName }), ...(call.receiverIsType === undefined ? {} : { receiverIsType: call.receiverIsType }), ...(call.receiverModuleName === undefined ? {} : { receiverModuleName: call.receiverModuleName }), argumentCount: call.argumentCount, range: rangeFor(lineStarts, call.start, call.end) });
  }
  for (const instantiation of relationFacts.instantiations) {
    const source = relationCallableSymbols.get(instantiation.sourceKey);
    if (source === undefined) continue;
    fsharpInstantiations.push({ sourceId: source.id, filePath: input.filePath, typeName: instantiation.typeName, argumentCount: instantiation.argumentCount, range: rangeFor(lineStarts, instantiation.start, instantiation.end) });
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
      addGiraffeRoute(routeFact, candidates.length === 1 ? candidates[0] ?? null : null);
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
          ruleId: "syntax.fsharp.same-file.unique-top-level-unit-function-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
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
    reExportBindings: [],
    fsharpFacts: {
      moduleName: relationFacts.moduleName,
      parserRejected: !relationFacts.valid,
      types: fsharpTypes,
      callables: fsharpCallables,
      opens: fsharpOpens,
      calls: fsharpCalls,
      instantiations: fsharpInstantiations,
      heritage: fsharpHeritage,
      overrides: fsharpOverrides
    } satisfies FsharpFacts
  };
}
