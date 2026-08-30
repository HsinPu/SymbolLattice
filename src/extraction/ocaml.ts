import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type OcamlCallFact,
  type OcamlCallableFact,
  type OcamlFacts,
  type OcamlHeritageFact,
  type OcamlInstantiationFact,
  type OcamlOpenFact,
  type OcamlOverrideFact,
  type OcamlTypeFact,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface OcamlExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "ocaml";
}

interface OcamlLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly content: string;
  readonly indent: number;
}

interface StaticOcamlFunction {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface OcamlParameterShape {
  readonly parameterCount: number;
  readonly parameterNames: readonly string[];
  readonly parameterTypeNames: readonly string[];
}

interface OcamlRawType {
  readonly name: string;
  readonly moduleName: string;
  readonly declarationKind: "module" | "class" | "record" | "variant" | "object" | "interface" | "enum" | "typealias";
  readonly isExported: boolean;
  readonly start: number;
  readonly end: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly indent: number;
  readonly headerText: string;
  readonly constructorParameters: OcamlParameterShape | null;
  readonly bases: readonly { readonly name: string; readonly relationKind: "extends" | "implements" }[];
}

interface OcamlRawCallable {
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
  readonly startLine: number;
  readonly endLine: number;
  readonly indent: number;
}

interface OcamlRawOpen {
  readonly importedPath: string;
  readonly isAlias: boolean;
  readonly start: number;
  readonly end: number;
}

interface OcamlRawCall {
  readonly sourceKey: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "member" | "module";
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly receiverIsType?: boolean;
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface OcamlRawInstantiation {
  readonly sourceKey: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface OcamlRawRelationFacts {
  readonly valid: boolean;
  readonly moduleName: string;
  readonly types: readonly OcamlRawType[];
  readonly callables: readonly OcamlRawCallable[];
  readonly opens: readonly OcamlRawOpen[];
  readonly calls: readonly OcamlRawCall[];
  readonly instantiations: readonly OcamlRawInstantiation[];
}

interface StaticOcamlDirectCall {
  readonly callerName: string;
  readonly calleeName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticDreamRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticOcamlFacts {
  readonly valid: boolean;
  readonly functions: readonly StaticOcamlFunction[];
  readonly calls: readonly StaticOcamlDirectCall[];
  readonly routes: readonly StaticDreamRoute[];
}

interface SanitizedOcamlSource {
  readonly valid: boolean;
  readonly text: string;
}

const DREAM_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  delete: "DELETE",
  head: "HEAD",
  connect: "CONNECT",
  options: "OPTIONS",
  trace: "TRACE",
  patch: "PATCH",
  any: "ALL"
};

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

function isOcamlIdentifierCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_']/u.test(value);
}

function isOcamlCharacterLiteral(sourceText: string, index: number): boolean {
  if (isOcamlIdentifierCharacter(sourceText[index - 1])) {
    return false;
  }
  return /^'(?:[^\\'\r\n]|\\(?:[\\'"nrtb]|[0-9]{3}|x[0-9A-Fa-f]{2}))'/u.test(
    sourceText.slice(index)
  );
}

function sanitizeOcaml(sourceText: string): SanitizedOcamlSource {
  const text = sourceText.split("");
  const delimiters: string[] = [];
  let index = 0;

  function blank(position: number): void {
    if (text[position] !== "\r" && text[position] !== "\n") {
      text[position] = " ";
    }
  }

  function scanQuoted(quote: string): boolean {
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
      index += 1;
    }
    return false;
  }

  function scanRawString(): boolean {
    const delimiter = /^\{([A-Za-z0-9_]*)\|/u.exec(sourceText.slice(index));
    if (delimiter === null) {
      return false;
    }
    const closing = "|" + (delimiter[1] ?? "") + "}";
    const closingIndex = sourceText.indexOf(closing, index + delimiter[0].length);
    if (closingIndex === -1) {
      return false;
    }
    index = closingIndex + closing.length;
    return true;
  }

  while (index < sourceText.length) {
    const current = sourceText[index];
    if (current === undefined) {
      break;
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

    if (current === "\"") {
      if (!scanQuoted("\"")) {
        return { valid: false, text: "" };
      }
      continue;
    }

    if (current === "{" && /^\{[A-Za-z0-9_]*\|/u.test(sourceText.slice(index))) {
      if (!scanRawString()) {
        return { valid: false, text: "" };
      }
      continue;
    }

    if (current === "'" && isOcamlCharacterLiteral(sourceText, index)) {
      if (!scanQuoted("'")) {
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

function linesFor(sourceText: string, sanitizedText: string): readonly OcamlLine[] {
  const starts = lineStartsFor(sourceText);
  const lines: OcamlLine[] = [];
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
      end,
      text,
      content: text.trim(),
      indent: indentMatch?.[1]?.length ?? 0
    });
  }
  return lines;
}

function ocamlIdentifier(value: string | undefined): string | null {
  return value !== undefined && /^[a-z_][A-Za-z0-9_']*$/u.test(value) ? value : null;
}

function ocamlModuleIdentifier(value: string | undefined): string | null {
  return value !== undefined && /^[A-Z][A-Za-z0-9_']*(?:\.[A-Z][A-Za-z0-9_']*)*$/u.test(value) ? value : null;
}

function ocamlTypeIdentifier(value: string | undefined): string | null {
  return value !== undefined && /^[a-z_][A-Za-z0-9_']*(?:\.[A-Za-z0-9_']+)*$/u.test(value) ? value : null;
}

function ocamlIsExported(line: string): boolean {
  return !/\b(private|hidden)\b/u.test(line);
}

function ocamlParameterShape(text: string): OcamlParameterShape | null {
  const groups = [...text.matchAll(/\(([^()]*)\)/gu)];
  if (groups.length === 0) return null;
  const parameterNames: string[] = [];
  const parameterTypeNames: string[] = [];
  for (const group of groups) {
    const content = (group[1] ?? "").trim();
    if (content === "") continue;
    for (const parameter of content.split(",").map((part) => part.trim()).filter((part) => part.length > 0)) {
      const match = /^(?:([a-z_][A-Za-z0-9_']*)\s*:\s*)?([a-z_][A-Za-z0-9_'.]*(?:\s+of\s+[a-z_][A-Za-z0-9_'.]*)?)$/u.exec(parameter);
      if (match === null || match[2] === undefined || parameter.includes("->")) return null;
      const typeName = match[2].trim();
      if (ocamlTypeIdentifier(typeName) === null || ["unit", "obj", "_'a"].includes(typeName)) return null;
      parameterNames.push(match[1] ?? "");
      parameterTypeNames.push(typeName);
    }
  }
  return { parameterCount: parameterTypeNames.length, parameterNames, parameterTypeNames };
}

function ocamlArrowParameterShape(text: string): OcamlParameterShape | null {
  if (!text.includes("->")) return null;
  const segments = text.split("->").map((part) => part.replace(/^\s*:\s*/u, "").trim()).filter((part) => part.length > 0);
  if (segments.length < 2) return null;
  const parameters = segments.slice(0, -1).filter((part) => part !== "unit");
  if (parameters.some((part) => ocamlTypeIdentifier(part) === null)) return null;
  return { parameterCount: parameters.length, parameterNames: parameters.map(() => ""), parameterTypeNames: parameters };
}

function ocamlReturnType(text: string): string | undefined {
  const explicit = /\)\s*:\s*([a-z_][A-Za-z0-9_'.]*)\s*(?:=|$)/u.exec(text)?.[1];
  if (explicit !== undefined && explicit !== "unit") return explicit;
  const arrow = text.split("->").at(-1)?.replace(/\s*=.*$/u, "").trim();
  return arrow !== undefined && arrow !== "unit" && ocamlTypeIdentifier(arrow) !== null ? arrow : undefined;
}

function ocamlBlockEnd(lines: readonly OcamlLine[], startLine: number, indent: number): number {
  for (let index = startLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && line.content.length > 0 && line.indent <= indent && line.content !== "end") return index - 1;
    if (line?.content === "end" && line.indent <= indent) return index;
  }
  return lines.length - 1;
}

function ocamlTypeDeclarationKind(line: OcamlLine, body: string, isClass: boolean, isClassType: boolean, previous: OcamlLine | undefined): OcamlRawType["declarationKind"] {
  if (isClassType) return "interface";
  if (isClass) return "class";
  const next = body === "" ? body : body.trim();
  if (/^object\b|^<\s*/u.test(next)) return "object";
  if (/^\{/u.test(next)) return "record";
  if (/^\|/u.test(next) || /\|/.test(next)) return /\|\s*[A-Za-z_][A-Za-z0-9_']*\s*=\s*-?\d+/u.test(next) ? "enum" : "variant";
  if (/^[a-z_][A-Za-z0-9_'.]*$/u.test(next)) return "typealias";
  return "variant";
}

function parseOcamlRelations(sourceText: string): OcamlRawRelationFacts {
  const sanitized = sanitizeOcaml(sourceText);
  if (!sanitized.valid || sourceText.includes("[%%") || sourceText.includes("[%") || sourceText.split(/\r?\n/u).some((line) => /^\s*#(?:if|elif|else|endif)\b/u.test(line))) return { valid: false, moduleName: "", types: [], callables: [], opens: [], calls: [], instantiations: [] };
  const lines = linesFor(sourceText, sanitized.text);
  const blocks: Array<{ readonly kind: "module" | "class"; readonly indent: number; readonly name: string }> = [];
  const rawTypes: OcamlRawType[] = [];
  const rawCallables: OcamlRawCallable[] = [];
  const rawOpens: OcamlRawOpen[] = [];
  const functionRanges: Array<{ readonly startLine: number; readonly endLine: number; readonly indent: number }> = [];
  let rootModuleName = "";
  const moduleNameAt = (): string => blocks.filter((block) => block.kind === "module").at(-1)?.name ?? "";
  const lineOffset = (line: OcamlLine): number => line.start + line.indent;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.content.length === 0) continue;
    while (blocks.length > 0 && line.indent <= (blocks.at(-1)?.indent ?? -1)) blocks.pop();
    const previous = index > 0 ? lines[index - 1] : undefined;
    const moduleMatch = /^module\s+([A-Z][A-Za-z0-9_']*)\s*=\s*(?:struct)?\s*$/u.exec(line.content);
    if (moduleMatch?.[1] !== undefined) {
      const parent = moduleNameAt();
      const fullName = parent === "" ? moduleMatch[1] : `${parent}.${moduleMatch[1]}`;
      if (rootModuleName === "") rootModuleName = fullName;
      rawTypes.push({ name: fullName, moduleName: parent, declarationKind: "module", isExported: true, start: lineOffset(line), end: lineOffset(line) + line.content.length, startLine: index, endLine: fsharpLikeBlockEnd(lines, index, line.indent), indent: line.indent, headerText: line.content, constructorParameters: null, bases: [] });
      blocks.push({ kind: "module", indent: line.indent, name: fullName });
      continue;
    }
    const openMatch = /^open\s+([A-Z][A-Za-z0-9_'.]*)(?:\s+as\s+[A-Z][A-Za-z0-9_']*)?$/u.exec(line.content);
    if (openMatch?.[1] !== undefined) {
      rawOpens.push({ importedPath: openMatch[1], isAlias: /\s+as\s+/u.test(line.content), start: lineOffset(line), end: lineOffset(line) + line.content.length });
      continue;
    }
    const classMatch = /^class\s+(type\s+)?([a-z_][A-Za-z0-9_']*)(?:\s*\(([^)]*)\))?(?:\s*:\s*([a-z_][A-Za-z0-9_']*))?\s*=\s*(.*)$/u.exec(line.content);
    const typeMatch = /^type\s+([a-z_][A-Za-z0-9_']*)\s*=\s*(.*)$/u.exec(line.content);
    if (classMatch?.[2] !== undefined || typeMatch?.[1] !== undefined) {
      const isClass = classMatch !== null;
      const isClassType = classMatch?.[1] !== undefined;
      const name = classMatch?.[2] ?? typeMatch?.[1];
      if (name === undefined) continue;
      const body = (classMatch?.[5] ?? typeMatch?.[2] ?? "").trim();
      const moduleName = moduleNameAt();
      const endLine = ocamlBlockEnd(lines, index, line.indent);
      const bases: Array<{ readonly name: string; readonly relationKind: "extends" | "implements" }> = [];
      for (let bodyIndex = index; bodyIndex <= endLine; bodyIndex += 1) {
        const bodyLine = lines[bodyIndex];
        const inherit = bodyLine === undefined ? undefined : /^inherit\s+([a-z_][A-Za-z0-9_'.]*)/u.exec(bodyLine.content)?.[1];
        if (inherit !== undefined) bases.push({ name: inherit, relationKind: "extends" });
      }
      const implemented = classMatch?.[4];
      if (implemented !== undefined) bases.push({ name: implemented, relationKind: "implements" });
      rawTypes.push({ name, moduleName, declarationKind: ocamlTypeDeclarationKind(line, body === "" ? (lines[index + 1]?.content ?? "") : body, isClass, isClassType, previous), isExported: ocamlIsExported(line.content), start: lineOffset(line), end: lineOffset(line) + line.content.length, startLine: index, endLine, indent: line.indent, headerText: line.content, constructorParameters: isClass && classMatch?.[3] !== undefined ? ocamlParameterShape(`(${classMatch[3]})`) : null, bases: [...new Map(bases.map((base) => [`${base.relationKind}:${base.name}`, base])).values()] });
      if (isClass || isClassType) blocks.push({ kind: "class", indent: line.indent, name });
      continue;
    }
    const insideFunction = functionRanges.some((range) => index > range.startLine && index <= range.endLine && line.indent > range.indent);
    const activeClass = [...blocks].reverse().find((block) => block.kind === "class");
    if (!insideFunction && activeClass !== undefined && line.indent > activeClass.indent) {
      const methodMatch = /^(?:method(!)?(?:\s+virtual)?|virtual\s+method)\s+([a-z_][A-Za-z0-9_']*)\s*(.*)$/u.exec(line.content);
      if (methodMatch?.[2] !== undefined) {
        const rest = methodMatch[3] ?? "";
        const shape = ocamlParameterShape(rest) ?? ocamlArrowParameterShape(rest) ?? { parameterCount: 0, parameterNames: [], parameterTypeNames: [] };
        const returnTypeName = ocamlReturnType(rest);
        const endLine = ocamlBlockEnd(lines, index, line.indent);
        rawCallables.push({ key: `method:${index}`, name: methodMatch[2], moduleName: moduleNameAt(), ownerTypeName: activeClass.name, callableKind: "method", parameterCount: shape.parameterCount, parameterNames: shape.parameterNames, parameterTypeNames: shape.parameterTypeNames, ...(returnTypeName === undefined ? {} : { returnTypeName }), isStatic: false, isExported: ocamlIsExported(line.content), isOverride: methodMatch[1] === "!", start: lineOffset(line), end: lineOffset(line) + line.content.length, startLine: index, endLine, indent: line.indent });
        continue;
      }
    }
    if (insideFunction || activeClass !== undefined) continue;
    const functionMatch = /^let\s+(?:rec\s+)?([a-z_][A-Za-z0-9_']*)\s*(.*?)\s*=\s*(.*)$/u.exec(line.content);
    if (functionMatch?.[1] !== undefined && functionMatch[2]?.includes("(")) {
      const shape = ocamlParameterShape(functionMatch[2]);
      if (shape === null) continue;
      const returnTypeName = ocamlReturnType(functionMatch[2]);
      const endLine = ocamlBlockEnd(lines, index, line.indent);
      rawCallables.push({ key: `function:${index}`, name: functionMatch[1], moduleName: moduleNameAt(), callableKind: "function", parameterCount: shape.parameterCount, parameterNames: shape.parameterNames, parameterTypeNames: shape.parameterTypeNames, ...(returnTypeName === undefined ? {} : { returnTypeName }), isStatic: true, isExported: ocamlIsExported(line.content), isOverride: false, start: lineOffset(line), end: lineOffset(line) + line.content.length, startLine: index, endLine, indent: line.indent });
      functionRanges.push({ startLine: index, endLine, indent: line.indent });
    }
  }
  const constructorCallables: OcamlRawCallable[] = [];
  for (const type of rawTypes) {
    if (type.declarationKind !== "class") continue;
    const shape = type.constructorParameters ?? { parameterCount: 0, parameterNames: [], parameterTypeNames: [] };
    constructorCallables.push({ key: `constructor:${type.startLine}`, name: type.name, moduleName: type.moduleName, ownerTypeName: type.name, callableKind: "constructor", parameterCount: shape.parameterCount, parameterNames: shape.parameterNames, parameterTypeNames: shape.parameterTypeNames, isStatic: false, isExported: type.isExported, isOverride: false, start: type.start, end: type.end, startLine: type.startLine, endLine: type.endLine, indent: type.indent });
  }
  const calls: OcamlRawCall[] = [];
  const instantiations: OcamlRawInstantiation[] = [];
  for (const callable of rawCallables) {
    const bindings = new Map<string, string>();
    callable.parameterNames.forEach((name, index) => { const typeName = callable.parameterTypeNames[index]; if (name !== "" && typeName !== undefined) bindings.set(name, typeName); });
    const bodyLines = lines.slice(callable.startLine, callable.endLine + 1);
    const bodyText = bodyLines.map((line) => line.content).join("\n");
    if (/\b(match|function|try|fun)\b|->/u.test(bodyText)) continue;
    const tainted = new Set<string>();
    for (const name of bindings.keys()) if (new RegExp(`(?:\\breturn\\s+${name}\\b|\\b[a-z_][A-Za-z0-9_']*\\s*\\([^)]*\\b${name}\\b[^)]*\\))`, "u").test(bodyText)) tainted.add(name);
    for (const bodyLine of bodyLines) {
      if (bodyLine === undefined || bodyLine.content.length === 0) continue;
      const lineText = bodyLine.content;
      const localBinding = /^let\s+(?:mutable\s+)?([a-z_][A-Za-z0-9_']*)\s*(?::\s*([a-z_][A-Za-z0-9_'.]*))?\s*=\s*(?:new\s+)?([a-z_][A-Za-z0-9_']*)/u.exec(lineText);
      if (localBinding?.[1] !== undefined) { const typeName = localBinding[2] ?? localBinding[3]; if (typeName !== undefined) bindings.set(localBinding[1], typeName); if (localBinding[0].includes("mutable")) tainted.add(localBinding[1]); if (new RegExp(`(?:\\breturn\\s+${localBinding[1]}\\b|\\b[a-z_][A-Za-z0-9_']*\\s*\\([^)]*\\b${localBinding[1]}\\b[^)]*\\))`, "u").test(bodyText)) tainted.add(localBinding[1]); }
      for (const mutation of lineText.matchAll(/\b([a-z_][A-Za-z0-9_']*)\s*(?::=|<-)/gu)) if (mutation[1] !== undefined) tainted.add(mutation[1]);
      const declarationEquals = /^(?:let\b|(?:method|virtual\s+method)\b)/u.test(lineText) ? lineText.indexOf("=") : -1;
      const executableOffset = declarationEquals >= 0 ? declarationEquals + 1 : 0;
      const executable = declarationEquals >= 0 ? lineText.slice(executableOffset) : lineText;
      const sourceOffset = bodyLine.start + bodyLine.indent + executableOffset;
      for (const match of executable.matchAll(/\b([a-z_][A-Za-z0-9_']*)#([a-z_][A-Za-z0-9_']*)\b(?:\s*(?:\(([^()]*)\)|([a-z_][A-Za-z0-9_']*)))?/gu)) {
        const receiverName = match[1]; const name = match[2]; if (receiverName === undefined || name === undefined || tainted.has(receiverName)) continue;
        const argumentText = match[3] ?? match[4] ?? ""; const argumentCount = argumentText.trim() === "" ? 0 : argumentText.split(",").length; const offset = match.index ?? 0; const receiverTypeName = bindings.get(receiverName);
        calls.push({ sourceKey: callable.key, referenceName: name, callKind: "member", receiverName, ...(receiverTypeName === undefined ? {} : { receiverTypeName }), argumentCount, start: sourceOffset + offset, end: sourceOffset + offset + (match[0]?.length ?? 0) });
      }
      for (const match of executable.matchAll(/\b([A-Z][A-Za-z0-9_']*)\.([a-z_][A-Za-z0-9_']*)\s*(?:\(([^()]*)\)|([a-z_][A-Za-z0-9_']*))?/gu)) {
        const receiverModuleName = match[1]; const name = match[2]; if (receiverModuleName === undefined || name === undefined) continue;
        const argumentText = match[3] ?? match[4] ?? ""; const argumentCount = argumentText.trim() === "" ? 0 : argumentText.split(",").length; const offset = match.index ?? 0;
        calls.push({ sourceKey: callable.key, referenceName: name, callKind: "module", receiverName: receiverModuleName, receiverModuleName, argumentCount, start: sourceOffset + offset, end: sourceOffset + offset + (match[0]?.length ?? 0) });
      }
      for (const match of executable.matchAll(/\b([a-z_][A-Za-z0-9_']*)\s*\(([^()]*)\)/gu)) {
        const name = match[1]; const offset = match.index ?? -1; const previous = offset > 0 ? executable[offset - 1] : undefined; if (name === undefined || offset < 0 || previous === "#" || previous === ".") continue;
        const argumentText = match[2] ?? ""; calls.push({ sourceKey: callable.key, referenceName: name, callKind: "direct", argumentCount: argumentText.trim() === "" ? 0 : argumentText.split(",").length, start: sourceOffset + offset, end: sourceOffset + offset + name.length });
      }
      for (const match of executable.matchAll(/\bnew\s+([a-z_][A-Za-z0-9_']*)\b\s*(?:\(([^()]*)\)|(-?\d+|[a-z_][A-Za-z0-9_']*))?/gu)) {
        const typeName = match[1]; if (typeName === undefined) continue; const token = match[3]; const reserved = match[2] === undefined && (token === undefined || ["in", "then", "else", "with"].includes(token)); const argumentText = reserved ? "" : match[2] ?? token ?? ""; const offset = match.index ?? 0; const full = reserved ? `new ${typeName}` : match[0] ?? typeName; instantiations.push({ sourceKey: callable.key, typeName, argumentCount: reserved ? 0 : argumentText.split(",").length, start: sourceOffset + offset, end: sourceOffset + offset + full.length });
      }
    }
  }
  return { valid: true, moduleName: rootModuleName, types: rawTypes, callables: [...rawCallables, ...constructorCallables], opens: rawOpens, calls, instantiations };
}

function fsharpLikeBlockEnd(lines: readonly OcamlLine[], startLine: number, indent: number): number {
  for (let index = startLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && line.content.length > 0 && line.indent <= indent && line.content !== "end") return index - 1;
  }
  return lines.length - 1;
}

function directOcamlFunction(line: OcamlLine): StaticOcamlFunction | null {
  if (line.indent !== 0) {
    return null;
  }
  const match =
    /^let\s+(?:rec\s+)?([a-z_][A-Za-z0-9_']*)\s+(?:\(\s*\)|_|[a-z_][A-Za-z0-9_']*)\s*=(?!=)/u.exec(
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

function directOcamlZeroArgumentCall(line: OcamlLine): StaticOcamlDirectCall | null {
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

function isOcamlB1Line(line: OcamlLine): boolean {
  return (
    line.indent === 0 &&
    /^let\s+[a-z_][A-Za-z0-9_']*\s+\(\s*\)\s*=\s+(?:[a-z_][A-Za-z0-9_']*\s+\(\s*\)|[0-9]+|true|false)\s*$/u.test(
      line.content
    )
  );
}

function priorNonEmptyLine(lines: readonly OcamlLine[], index: number): OcamlLine | null {
  for (let previous = index - 1; previous >= 0; previous -= 1) {
    const line = lines[previous];
    if (line !== undefined && line.content.length > 0) {
      return line;
    }
  }
  return null;
}

function isDirectDreamRouterHeader(lines: readonly OcamlLine[], index: number): boolean {
  const line = lines[index];
  if (line === undefined) {
    return false;
  }
  if (
    line.indent === 0 &&
    /^let\s+(?:rec\s+)?[a-z_][A-Za-z0-9_']*\s*=\s*Dream\.router\s+\[$/u.test(line.content)
  ) {
    return true;
  }
  if (
    line.indent === 0 &&
    /^let\s*\(\s*\)\s*=\s*Dream\.run\s+@@\s+Dream\.router\s+\[$/u.test(line.content)
  ) {
    return true;
  }
  if (line.content !== "@@ Dream.router [") {
    return false;
  }
  const run = priorNonEmptyLine(lines, index);
  if (run === null || run.content !== "Dream.run" || run.indent !== line.indent) {
    return false;
  }
  const entrypoint = priorNonEmptyLine(lines, lines.indexOf(run));
  return (
    entrypoint !== null &&
    entrypoint.indent === 0 &&
    /^let\s*\(\s*\)\s*=$/u.test(entrypoint.content)
  );
}

function directDreamRoute(line: OcamlLine): StaticDreamRoute | null {
  const match =
    /^Dream\.(get|post|put|delete|head|connect|options|trace|patch|any)\s+"(\/[^"\\\r\n]*)"\s+(?:@@\s+)?([a-z_][A-Za-z0-9_']*)\s*;?$/u.exec(
      line.content
    );
  const verb = match?.[1];
  const path = match?.[2];
  const handlerName = match?.[3];
  const method = verb === undefined ? undefined : DREAM_METHODS[verb];
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

function staticOcamlFacts(sourceText: string): StaticOcamlFacts {
  const sanitized = sanitizeOcaml(sourceText);
  if (!sanitized.valid) {
    return { valid: false, functions: [], calls: [], routes: [] };
  }
  const lines = linesFor(sourceText, sanitized.text);
  const functions = lines
    .map((line) => directOcamlFunction(line))
    .filter((functionFact): functionFact is StaticOcamlFunction => functionFact !== null);
  const calls = lines
    .map((line) => directOcamlZeroArgumentCall(line))
    .filter((call): call is StaticOcamlDirectCall => call !== null);
  const routes: StaticDreamRoute[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index];
    if (header === undefined || !isDirectDreamRouterHeader(lines, index)) {
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
      const route = directDreamRoute(line);
      if (route !== null) {
        routes.push(route);
      }
    }
  }

  return {
    valid: true,
    functions,
    calls: lines.every((line) => line.content.length === 0 || isOcamlB1Line(line)) ? calls : [],
    routes
  };
}

export function extractOcamlFileFacts(input: OcamlExtractFileFactsInput): ArtifactFacts {
  const dreamCapability = frameworkCapability("dream");
  if (!dreamCapability.languages.includes(input.language)) {
    throw new Error("Dream extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticOcamlFacts(input.sourceText);
  const relationFacts = parseOcamlRelations(input.sourceText);
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const ocamlTypes: OcamlTypeFact[] = [];
  const ocamlCallables: OcamlCallableFact[] = [];
  const ocamlOpens: OcamlOpenFact[] = [];
  const ocamlCalls: OcamlCallFact[] = [];
  const ocamlInstantiations: OcamlInstantiationFact[] = [];
  const ocamlHeritage: OcamlHeritageFact[] = [];
  const ocamlOverrides: OcamlOverrideFact[] = [];
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

  function addOcamlContainment(parent: SymbolNode, child: SymbolNode, from: number, to: number): void {
    const range = rangeFor(lineStarts, from, to);
    edges.push({ id: createEdgeId({ sourceId: parent.id, targetId: child.id, kind: "contains", line: range.start.line, column: range.start.column, referenceName: child.name }), sourceId: parent.id, targetId: child.id, kind: "contains", filePath: input.filePath, range, resolution: "exact", confidence: 1, referenceName: child.name, evidence: { ruleId: "syntax.containment", stage: "syntax", candidateSymbolIds: [child.id] } });
  }

  function addOcamlType(type: OcamlRawType, parent: SymbolNode): SymbolNode {
    const qualifiedPath = type.declarationKind === "module" ? type.name : type.moduleName === "" ? type.name : `${type.moduleName}.${type.name}`;
    const qualifiedName = type.declarationKind === "module" ? `${fileNode.qualifiedName}#module:${type.name}` : `${fileNode.qualifiedName}#${qualifiedPath}`;
    const kind: SymbolNode["kind"] = type.declarationKind === "module" ? "module" : type.declarationKind === "class" ? "class" : type.declarationKind === "interface" ? "interface" : "type";
    const declarationOrdinal = nextOrdinal(qualifiedName, kind);
    const symbol: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind, declarationOrdinal }), name: type.name, qualifiedName, kind, filePath: input.filePath, range: rangeFor(lineStarts, type.start, type.end), isExported: type.isExported, declarationOrdinal };
    symbols.push(symbol);
    addOcamlContainment(parent, symbol, type.start, type.end);
    ocamlTypes.push({ symbolId: symbol.id, filePath: input.filePath, name: type.name, moduleName: type.moduleName, qualifiedTypePath: qualifiedPath, declarationKind: type.declarationKind, isExported: type.isExported, range: symbol.range });
    for (const base of type.bases) ocamlHeritage.push({ sourceId: symbol.id, filePath: input.filePath, referenceName: base.name, relationKind: base.relationKind, sourceTypeKind: type.declarationKind, range: symbol.range });
    return symbol;
  }

  function addOcamlCallable(callable: OcamlRawCallable, owner: SymbolNode | undefined): SymbolNode {
    const qualifiedName = callable.ownerTypeName === undefined
      ? legacyFunctionStarts.has(callable.start) ? `${fileNode.qualifiedName}.${callable.name}` : `${fileNode.qualifiedName}#${callable.moduleName === "" ? "" : `${callable.moduleName}.`}${callable.name}`
      : `${owner?.qualifiedName ?? `${fileNode.qualifiedName}#${callable.ownerTypeName}`}.${callable.name}`;
    const kind: SymbolNode["kind"] = callable.callableKind === "function" ? "function" : "method";
    const declarationOrdinal = nextOrdinal(qualifiedName, kind);
    const symbol: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind, declarationOrdinal }), name: callable.name, qualifiedName, kind, filePath: input.filePath, range: rangeFor(lineStarts, callable.start, callable.end), isExported: callable.isExported, declarationOrdinal };
    symbols.push(symbol);
    if (owner === undefined) addContainment(symbol, callable.start, callable.end); else addOcamlContainment(owner, symbol, callable.start, callable.end);
    relationCallableSymbols.set(callable.key, symbol);
    if (callable.callableKind === "function") functionSymbolsByStart.set(callable.start, symbol);
    ocamlCallables.push({ symbolId: symbol.id, filePath: input.filePath, name: callable.name, moduleName: callable.moduleName, callableKind: callable.callableKind, ...(callable.ownerTypeName === undefined ? {} : { ownerTypeName: callable.ownerTypeName }), ...(owner === undefined ? {} : { ownerTypeId: owner.id }), parameterCount: callable.parameterCount, requiredParameterCount: callable.parameterCount, parameterTypeNames: callable.parameterTypeNames, ...(callable.returnTypeName === undefined ? {} : { returnTypeName: callable.returnTypeName }), isStatic: callable.isStatic, isExported: callable.isExported, ...(callable.isOverride ? { isOverride: true } : {}), range: symbol.range });
    if (callable.isOverride && callable.ownerTypeName !== undefined) ocamlOverrides.push({ sourceId: symbol.id, filePath: input.filePath, methodName: callable.name, ownerTypeName: callable.ownerTypeName, range: symbol.range });
    return symbol;
  }

  function addFunction(functionFact: StaticOcamlFunction): SymbolNode {
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

  function addDreamRoute(routeFact: StaticDreamRoute, handler: SymbolNode | null): void {
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
            ? "framework.dream.direct-router.literal-named-function.unresolved"
            : "framework.dream.direct-router.literal-named-function.local-function",
        stage: "syntax",
        candidateSymbolIds: handler === null ? [] : [handler.id]
      }
    });
  }

  const moduleSymbols = new Map<string, SymbolNode>();
  for (const type of relationFacts.types.filter((candidate) => candidate.declarationKind === "module").sort((left, right) => left.start - right.start)) {
    const parent = type.moduleName === "" ? fileNode : moduleSymbols.get(type.moduleName) ?? fileNode;
    const symbol = addOcamlType(type, parent);
    moduleSymbols.set(type.name, symbol);
  }
  for (const type of relationFacts.types.filter((candidate) => candidate.declarationKind !== "module").sort((left, right) => left.start - right.start)) {
    const parent = type.moduleName === "" ? fileNode : moduleSymbols.get(type.moduleName) ?? fileNode;
    addOcamlType(type, parent);
  }
  const findOcamlType = (moduleName: string, name: string): SymbolNode | undefined => {
    const candidates = ocamlTypes.filter((fact) => fact.moduleName === moduleName && fact.name === name).map((fact) => symbols.find((symbol) => symbol.id === fact.symbolId)).filter((symbol): symbol is SymbolNode => symbol !== undefined);
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  for (const callable of [...relationFacts.callables].sort((left, right) => left.start - right.start)) {
    const owner = callable.ownerTypeName === undefined ? undefined : findOcamlType(callable.moduleName, callable.ownerTypeName);
    addOcamlCallable(callable, owner);
  }
  for (const open of relationFacts.opens) ocamlOpens.push({ sourceId: fileNode.id, filePath: input.filePath, importedPath: open.importedPath, isAlias: open.isAlias, range: rangeFor(lineStarts, open.start, open.end) });
  for (const call of relationFacts.calls) {
    const source = relationCallableSymbols.get(call.sourceKey);
    if (source === undefined) continue;
    ocamlCalls.push({ sourceId: source.id, filePath: input.filePath, referenceName: call.referenceName, callKind: call.callKind, ...(call.receiverName === undefined ? {} : { receiverName: call.receiverName }), ...(call.receiverTypeName === undefined ? {} : { receiverTypeName: call.receiverTypeName }), ...(call.receiverIsType === undefined ? {} : { receiverIsType: call.receiverIsType }), ...(call.receiverModuleName === undefined ? {} : { receiverModuleName: call.receiverModuleName }), argumentCount: call.argumentCount, range: rangeFor(lineStarts, call.start, call.end) });
  }
  for (const instantiation of relationFacts.instantiations) {
    const source = relationCallableSymbols.get(instantiation.sourceKey);
    if (source === undefined) continue;
    ocamlInstantiations.push({ sourceId: source.id, filePath: input.filePath, typeName: instantiation.typeName, argumentCount: instantiation.argumentCount, range: rangeFor(lineStarts, instantiation.start, instantiation.end) });
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
      addDreamRoute(routeFact, candidates.length === 1 ? candidates[0] ?? null : null);
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
          ruleId: "syntax.ocaml.same-file.unique-top-level-unit-function-call",
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
    ocamlFacts: {
      moduleName: relationFacts.moduleName,
      parserRejected: !relationFacts.valid,
      types: ocamlTypes,
      callables: ocamlCallables,
      opens: ocamlOpens,
      calls: ocamlCalls,
      instantiations: ocamlInstantiations,
      heritage: ocamlHeritage,
      overrides: ocamlOverrides
    } satisfies OcamlFacts
  };
}
