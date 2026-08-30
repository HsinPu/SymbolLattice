import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type HaskellCallFact,
  type HaskellCallableFact,
  type HaskellFacts,
  type HaskellHeritageFact,
  type HaskellImportFact,
  type HaskellInstantiationFact,
  type HaskellTypeFact,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface HaskellExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "haskell";
}

interface HaskellLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly content: string;
  readonly indent: number;
}

interface StaticHaskellFunction {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly isUnitArgument: boolean;
}

interface StaticHaskellDirectCall {
  readonly callerName: string;
  readonly callerStart: number;
  readonly calleeName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticScottyRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticHaskellFacts {
  readonly valid: boolean;
  readonly functions: readonly StaticHaskellFunction[];
  readonly equationNames: readonly string[];
  readonly calls: readonly StaticHaskellDirectCall[];
  readonly routes: readonly StaticScottyRoute[];
}

interface HaskellRawType {
  readonly name: string;
  readonly moduleName: string;
  readonly declarationKind: "module" | "data" | "newtype" | "typealias" | "record" | "variant" | "class";
  readonly constructorNames: readonly string[];
  readonly constructorArities: Readonly<Record<string, number>>;
  readonly isExported: boolean;
  readonly start: number;
  readonly end: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly indent: number;
}

interface HaskellRawCallable {
  readonly key: string;
  readonly name: string;
  readonly moduleName: string;
  readonly callableKind: "function" | "method";
  readonly ownerTypeName?: string;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterNames: readonly string[];
  readonly parameterTypeNames: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly start: number;
  readonly end: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly indent: number;
}

interface HaskellRawImport {
  readonly importedModule: string;
  readonly importedNames?: readonly string[];
  readonly isQualified: boolean;
  readonly alias?: string;
  readonly start: number;
  readonly end: number;
}

interface HaskellRawCall {
  readonly sourceKey: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "module";
  readonly receiverModuleName?: string;
  readonly receiverAlias?: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface HaskellRawInstantiation {
  readonly sourceKey: string;
  readonly constructorName: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface HaskellRawHeritage {
  readonly sourceTypeName: string;
  readonly referenceName: string;
  readonly start: number;
  readonly end: number;
}

interface HaskellRawRelationFacts {
  readonly valid: boolean;
  readonly moduleName: string;
  readonly types: readonly HaskellRawType[];
  readonly callables: readonly HaskellRawCallable[];
  readonly imports: readonly HaskellRawImport[];
  readonly calls: readonly HaskellRawCall[];
  readonly instantiations: readonly HaskellRawInstantiation[];
  readonly heritage: readonly HaskellRawHeritage[];
}

interface SanitizedHaskellSource {
  readonly valid: boolean;
  readonly text: string;
}

const SCOTTY_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  delete: "DELETE",
  patch: "PATCH",
  options: "OPTIONS"
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

function isHaskellIdentifierSuffix(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_']/u.test(value);
}

function sanitizeHaskell(sourceText: string): SanitizedHaskellSource {
  const text = sourceText.split("");
  const delimiters: string[] = [];
  let index = 0;

  function blank(position: number): void {
    if (text[position] !== "\r" && text[position] !== "\n") {
      text[position] = " ";
    }
  }

  function scanQuoted(quote: string): boolean {
    const start = index;
    index += 1;
    while (index < sourceText.length) {
      const current = sourceText[index];
      if (current === "\\") {
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
    index = start;
    return false;
  }

  while (index < sourceText.length) {
    const current = sourceText[index];
    if (current === undefined) {
      break;
    }

    if (sourceText.slice(index, index + 2) === "--") {
      while (index < sourceText.length && sourceText[index] !== "\r" && sourceText[index] !== "\n") {
        blank(index);
        index += 1;
      }
      continue;
    }

    if (sourceText.slice(index, index + 2) === "{-") {
      let depth = 0;
      while (index < sourceText.length) {
        const pair = sourceText.slice(index, index + 2);
        if (pair === "{-") {
          depth += 1;
          blank(index);
          blank(index + 1);
          index += 2;
          continue;
        }
        if (pair === "-}") {
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

    if (current === "'" && !isHaskellIdentifierSuffix(sourceText[index - 1])) {
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

function hasTabsOutsideCommentsOrQuotes(line: HaskellLine): boolean {
  return line.text.includes("\t");
}

function linesFor(sourceText: string, sanitizedText: string): readonly HaskellLine[] | null {
  const starts = lineStartsFor(sourceText);
  const lines: HaskellLine[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index] ?? 0;
    const nextStart = starts[index + 1] ?? sourceText.length;
    let end = nextStart;
    while (end > start && (sourceText[end - 1] === "\r" || sourceText[end - 1] === "\n")) {
      end -= 1;
    }
    const text = sanitizedText.slice(start, end);
    const indentMatch = /^( *)/u.exec(text);
    const line: HaskellLine = {
      start,
      end,
      text,
      content: text.trim(),
      indent: indentMatch?.[1]?.length ?? 0
    };
    if (hasTabsOutsideCommentsOrQuotes(line)) {
      return null;
    }
    lines.push(line);
  }
  return lines;
}

function directHaskellFunction(line: HaskellLine): StaticHaskellFunction | null {
  if (line.indent !== 0) {
    return null;
  }
  const match = /^([a-z_][A-Za-z0-9_']*)(\s+\(\))?\s*=\s*\S/u.exec(line.content);
  const name = match?.[1];
  if (name === undefined) {
    return null;
  }
  return {
    name,
    start: line.start,
    end: line.start + line.content.length,
    isUnitArgument: match?.[2] !== undefined
  };
}

function directHaskellUnitArgumentBareCall(line: HaskellLine): StaticHaskellDirectCall | null {
  if (line.indent !== 0) {
    return null;
  }
  const match =
    /^([a-z_][A-Za-z0-9_']*)\s+\(\)\s*=\s+([a-z_][A-Za-z0-9_']*)\s+\(\)$/u.exec(
      line.content
    );
  const callerName = match?.[1];
  const calleeName = match?.[2];
  if (callerName === undefined || calleeName === undefined) {
    return null;
  }
  const calleeOffset = line.content.lastIndexOf(calleeName);
  if (calleeOffset < 0) {
    return null;
  }
  return {
    callerName,
    callerStart: line.start,
    calleeName,
    start: line.start + calleeOffset,
    end: line.start + calleeOffset + calleeName.length
  };
}

function topLevelHaskellEquationName(line: HaskellLine): string | null {
  if (line.indent !== 0) {
    return null;
  }
  const match = /^([a-z_][A-Za-z0-9_']*)(?:$|(?=\s|\(|\[|\{|=))/u.exec(line.content);
  return match?.[1] ?? null;
}

function hasUnsafeHaskellDirectCallContext(lines: readonly HaskellLine[]): boolean {
  return lines.some(
    (line) =>
      /^import\s/u.test(line.content) ||
      line.content.includes("$(") ||
      line.content.startsWith("{-#")
  );
}

function isDirectScottyImport(line: HaskellLine): boolean {
  return line.indent === 0 && line.content === "import Web.Scotty";
}

function isDirectScottyBlockHeader(line: HaskellLine): boolean {
  return (
    line.indent === 0 &&
    /^[a-z_][A-Za-z0-9_']*\s*=\s*scotty\s+[0-9]+\s+\$\s+do$/u.test(line.content)
  );
}

function directScottyRoute(line: HaskellLine): StaticScottyRoute | null {
  const match =
    /^(get|post|put|delete|patch|options)\s+"(\/[^"\\\s$]*)"\s+(?:\$\s+)?([a-z_][A-Za-z0-9_']*)$/u.exec(
      line.content
    );
  const verb = match?.[1];
  const path = match?.[2];
  const handlerName = match?.[3];
  const method = verb === undefined ? undefined : SCOTTY_METHODS[verb];
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

function staticHaskellFacts(sourceText: string): StaticHaskellFacts {
  const sanitized = sanitizeHaskell(sourceText);
  if (!sanitized.valid) {
    return { valid: false, functions: [], equationNames: [], calls: [], routes: [] };
  }
  const lines = linesFor(sourceText, sanitized.text);
  if (lines === null) {
    return { valid: false, functions: [], equationNames: [], calls: [], routes: [] };
  }

  const functions = lines
    .map((line) => directHaskellFunction(line))
    .filter((functionFact): functionFact is StaticHaskellFunction => functionFact !== null);
  const equationNames = lines
    .map((line) => topLevelHaskellEquationName(line))
    .filter((name): name is string => name !== null);
  const calls = lines
    .map((line) => directHaskellUnitArgumentBareCall(line))
    .filter((callFact): callFact is StaticHaskellDirectCall => callFact !== null);
  const directScottyImportCount = lines.filter((line) => isDirectScottyImport(line)).length;
  const routes: StaticScottyRoute[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index];
    if (header === undefined || !isDirectScottyBlockHeader(header)) {
      continue;
    }

    let bodyIndent: number | undefined;
    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
      const line = lines[bodyIndex];
      if (line === undefined || line.content.length === 0) {
        continue;
      }
      if (line.indent <= header.indent) {
        break;
      }
      bodyIndent ??= line.indent;
      if (line.indent !== bodyIndent) {
        continue;
      }
      const route = directScottyRoute(line);
      if (route !== null) {
        routes.push(route);
      }
    }
  }

  return {
    valid: true,
    functions,
    equationNames,
    calls: hasUnsafeHaskellDirectCallContext(lines) ? [] : calls,
    routes: directScottyImportCount === 1 ? routes : []
  };
}

function haskellTypeIdentifier(value: string | undefined): string | null {
  return value !== undefined && /^[A-Z][A-Za-z0-9_']*(?:\.[A-Z][A-Za-z0-9_']*)*$/u.test(value)
    ? value
    : null;
}

function haskellDeclarationEnd(lines: readonly HaskellLine[], startLine: number): number {
  for (let index = startLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && line.content.length > 0 && line.indent === 0) {
      return index - 1;
    }
  }
  return lines.length - 1;
}

interface HaskellSignatureShape {
  readonly parameterTypeNames: readonly string[];
  readonly returnTypeName?: string;
}

function haskellSignatureShape(signature: string): HaskellSignatureShape | null {
  const normalized = signature.replace(/\s+/gu, " ").trim();
  if (normalized === "" || normalized.includes("=>") || /[{}[\]\\|]/u.test(normalized)) {
    return null;
  }
  const segments = normalized.split("->").map((segment) => segment.trim());
  if (segments.length === 0) return null;
  const returnType = segments.at(-1);
  const parameterTypes = segments.slice(0, -1);
  if (returnType === undefined || parameterTypes.some((segment) => haskellTypeIdentifier(segment) === null)) {
    return null;
  }
  const returnTypeName = haskellTypeIdentifier(returnType);
  return {
    parameterTypeNames: parameterTypes,
    ...(returnTypeName === null ? {} : { returnTypeName })
  };
}

function haskellDefinitionParameters(text: string): readonly string[] | null {
  const normalized = text.trim();
  if (normalized === "") return [];
  if (/\b(?:where|guards?)\b|[{}[\]@:]|\\|\||\bcase\b/u.test(normalized)) return null;
  const tokens = normalized.split(/\s+/u).filter((token) => token.length > 0);
  if (tokens.some((token) => !/^[a-z_][A-Za-z0-9_']*$/u.test(token) && token !== "()")) return null;
  return tokens.map((token) => token === "()" ? "" : token);
}

function haskellConstructorShapes(body: string): { readonly names: readonly string[]; readonly arities: Readonly<Record<string, number>> } {
  const clean = body.replace(/\bderiving\b[\s\S]*$/u, "").trim();
  if (clean === "") return { names: [], arities: {} };
  const names: string[] = [];
  const arities: Record<string, number> = {};
  for (const part of clean.split("|")) {
    const match = /^\s*([A-Z][A-Za-z0-9_']*)\b([\s\S]*)$/u.exec(part);
    const name = match?.[1];
    if (name === undefined) continue;
    const rest = (match?.[2] ?? "").trim();
    let arity = 0;
    if (rest.includes("{")) {
      arity = [...rest.matchAll(/::/gu)].length;
    } else if (rest !== "") {
      arity = rest.replace(/[(),]/gu, " ").split(/\s+/u).filter((token) => token.length > 0 && token !== "where").length;
    }
    names.push(name);
    arities[name] = arity;
  }
  return { names, arities };
}

function parseHaskellRelations(sourceText: string): HaskellRawRelationFacts {
  const sanitized = sanitizeHaskell(sourceText);
  if (!sanitized.valid || sourceText.includes("{-#") || sourceText.includes("$(") || /^\s*#(?:if|elif|else|endif)\b/mu.test(sourceText)) {
    return { valid: false, moduleName: "", types: [], callables: [], imports: [], calls: [], instantiations: [], heritage: [] };
  }
  const lines = linesFor(sourceText, sanitized.text);
  if (lines === null) {
    return { valid: false, moduleName: "", types: [], callables: [], imports: [], calls: [], instantiations: [], heritage: [] };
  }
  const moduleLine = lines.find((line) => /^module\s+/u.test(line.content));
  const moduleName = moduleLine === undefined
    ? ""
    : /^module\s+([A-Z][A-Za-z0-9_']*(?:\.[A-Z][A-Za-z0-9_']*)*)\s*(?:\(.*\))?\s+where$/u.exec(moduleLine.content)?.[1] ?? "";
  const types: HaskellRawType[] = [];
  const imports: HaskellRawImport[] = [];
  const heritage: HaskellRawHeritage[] = [];
  const signatures = new Map<string, { readonly shape: HaskellSignatureShape; readonly line: HaskellLine }>();
  if (moduleLine !== undefined && moduleName !== "") {
    types.push({ name: moduleName, moduleName: "", declarationKind: "module", constructorNames: [], constructorArities: {}, isExported: true, start: moduleLine.start + moduleLine.indent, end: moduleLine.start + moduleLine.indent + moduleLine.content.length, startLine: lines.indexOf(moduleLine), endLine: lines.indexOf(moduleLine), indent: moduleLine.indent });
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.content.length === 0 || line.indent !== 0) continue;
    const importMatch = /^import\s+(qualified\s+)?([A-Z][A-Za-z0-9_'.]*)(?:\s+as\s+([A-Z][A-Za-z0-9_']*))?(?:\s*\((.*)\))?$/u.exec(line.content);
    if (importMatch?.[2] !== undefined) {
      const importedNames = importMatch[4] === undefined
        ? undefined
        : importMatch[4].split(",").map((name) => name.trim().replace(/\(\.\.\)$/u, "")).filter((name) => /^[A-Za-z_][A-Za-z0-9_']*$/u.test(name));
      imports.push({ importedModule: importMatch[2], ...(importedNames === undefined ? {} : { importedNames }), isQualified: importMatch[1] !== undefined, ...(importMatch[3] === undefined ? {} : { alias: importMatch[3] }), start: line.start + line.indent, end: line.start + line.indent + line.content.length });
      continue;
    }
    const signatureMatch = /^([a-z_][A-Za-z0-9_']*)\s*::\s*(.+)$/u.exec(line.content);
    if (signatureMatch?.[1] !== undefined && signatureMatch[2] !== undefined) {
      const shape = haskellSignatureShape(signatureMatch[2]);
      if (shape !== null) signatures.set(signatureMatch[1], { shape, line });
      continue;
    }
    const dataMatch = /^(data|newtype|type)\s+([A-Z][A-Za-z0-9_']*)\b(?:[^=]*)?(?:=\s*(.*))?$/u.exec(line.content);
    if (dataMatch?.[1] !== undefined && dataMatch[2] !== undefined) {
      const declarationKind = dataMatch[1] === "newtype" ? "newtype" : dataMatch[1] === "type" ? "typealias" : "data";
      const endLine = haskellDeclarationEnd(lines, index);
      const continuation = lines.slice(index, endLine + 1).map((candidate) => candidate?.content ?? "").join(" ");
      const body = continuation.includes("=") ? continuation.slice(continuation.indexOf("=") + 1).trim() : (dataMatch[3] ?? "");
      const constructors = declarationKind === "typealias" ? { names: [], arities: {} } : haskellConstructorShapes(body);
      const finalKind = declarationKind === "data" && body.includes("{") ? "record" : declarationKind === "data" && body.includes("|") ? "variant" : declarationKind;
      types.push({ name: dataMatch[2], moduleName, declarationKind: finalKind, constructorNames: constructors.names, constructorArities: constructors.arities, isExported: true, start: line.start + line.indent, end: line.start + line.indent + line.content.length, startLine: index, endLine, indent: line.indent });
      continue;
    }
    const classMatch = /^class\s+([A-Z][A-Za-z0-9_']*)\b.*\bwhere$/u.exec(line.content);
    if (classMatch?.[1] !== undefined) {
      const endLine = haskellDeclarationEnd(lines, index);
      types.push({ name: classMatch[1], moduleName, declarationKind: "class", constructorNames: [], constructorArities: {}, isExported: true, start: line.start + line.indent, end: line.start + line.indent + line.content.length, startLine: index, endLine, indent: line.indent });
      continue;
    }
    const instanceMatch = /^instance\s+(?:\([^)]*\)\s*=>\s*)?([A-Z][A-Za-z0-9_']*)\s+([A-Z][A-Za-z0-9_']*)\s+where$/u.exec(line.content);
    if (instanceMatch?.[1] !== undefined && instanceMatch[2] !== undefined) {
      heritage.push({ referenceName: instanceMatch[1], sourceTypeName: instanceMatch[2], start: line.start + line.indent, end: line.start + line.indent + line.content.length });
    }
  }

  const callables: HaskellRawCallable[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.indent !== 0) continue;
    const definition = /^([a-z_][A-Za-z0-9_']*)\s*(.*?)\s*=\s*(.*)$/u.exec(line.content);
    const name = definition?.[1];
    if (name === undefined) continue;
    const signature = signatures.get(name);
    if (signature === undefined) continue;
    const parameterNames = haskellDefinitionParameters(definition?.[2] ?? "");
    if (parameterNames === null || parameterNames.length !== signature.shape.parameterTypeNames.length) continue;
    const endLine = haskellDeclarationEnd(lines, index);
    callables.push({ key: `function:${index}:${name}`, name, moduleName, callableKind: "function", parameterCount: signature.shape.parameterTypeNames.length, requiredParameterCount: signature.shape.parameterTypeNames.length, parameterNames, parameterTypeNames: signature.shape.parameterTypeNames, ...(signature.shape.returnTypeName === undefined ? {} : { returnTypeName: signature.shape.returnTypeName }), isExported: true, start: line.start + line.indent, end: line.start + line.indent + line.content.length, startLine: index, endLine, indent: line.indent });
  }

  const calls: HaskellRawCall[] = [];
  const instantiations: HaskellRawInstantiation[] = [];
  const reserved = new Set(["let", "in", "if", "then", "else", "case", "of", "where", "do", "pure", "return", "error", "seq"]);
  const callableNameCounts = new Map<string, number>();
  for (const callable of callables) callableNameCounts.set(callable.name, (callableNameCounts.get(callable.name) ?? 0) + 1);
  for (const callable of callables) {
    if ((callableNameCounts.get(callable.name) ?? 0) !== 1) continue;
    const bodyLines = lines.slice(callable.startLine, callable.endLine + 1);
    const bodyText = bodyLines.map((line) => line.content).join("\n");
    if (/\\|\b(case|where|do)\b|->/u.test(bodyText)) continue;
    for (const bodyLine of bodyLines) {
      if (bodyLine === undefined || bodyLine.content.length === 0) continue;
      const equals = bodyLine.content.indexOf("=");
      const executableOffset = equals >= 0 ? equals + 1 : 0;
      const executable = equals >= 0 ? bodyLine.content.slice(executableOffset) : bodyLine.content;
      const sourceOffset = bodyLine.start + bodyLine.indent + executableOffset;
      for (const match of executable.matchAll(/\b([A-Z][A-Za-z0-9_']*)\.([a-z_][A-Za-z0-9_']*)\s+(?:\(([^()]*)\)|([a-z_][A-Za-z0-9_']*|[A-Z][A-Za-z0-9_']*|\d+|\(\)))/gu)) {
        const receiver = match[1]; const name = match[2]; if (receiver === undefined || name === undefined) continue;
        const argumentText = match[3] ?? match[4] ?? ""; const offset = match.index ?? 0; calls.push({ sourceKey: callable.key, referenceName: name, callKind: "module", receiverModuleName: receiver, receiverAlias: receiver, argumentCount: argumentText.trim() === "" || argumentText === "()" ? 0 : argumentText.split(",").length, start: sourceOffset + offset, end: sourceOffset + offset + (match[0]?.length ?? 0) });
      }
      for (const match of executable.matchAll(/\b([a-z_][A-Za-z0-9_']*)\s+(?:\(([^()]*)\)|([a-z_][A-Za-z0-9_']*|[A-Z][A-Za-z0-9_']*|\d+|\(\)))/gu)) {
        const name = match[1]; const offset = match.index ?? -1; const previous = offset > 0 ? executable[offset - 1] : undefined; if (name === undefined || offset < 0 || previous === "." || reserved.has(name)) continue;
        const argumentText = match[2] ?? match[3] ?? ""; calls.push({ sourceKey: callable.key, referenceName: name, callKind: "direct", argumentCount: argumentText.trim() === "" || argumentText === "()" ? 0 : argumentText.split(",").length, start: sourceOffset + offset, end: sourceOffset + offset + name.length });
      }
      for (const match of executable.matchAll(/\b([A-Z][A-Za-z0-9_']*)\s+(?:\(([^()]*)\)|([a-z_][A-Za-z0-9_']*|[A-Z][A-Za-z0-9_']*|\d+|\(\)))/gu)) {
        const name = match[1]; const offset = match.index ?? -1; const previous = offset > 0 ? executable[offset - 1] : undefined; if (name === undefined || offset < 0 || previous === ".") continue;
        const argumentText = match[2] ?? match[3] ?? ""; instantiations.push({ sourceKey: callable.key, constructorName: name, argumentCount: argumentText.trim() === "" || argumentText === "()" ? 0 : argumentText.split(",").length, start: sourceOffset + offset, end: sourceOffset + offset + (match[0]?.length ?? 0) });
      }
    }
  }
  return { valid: true, moduleName, types, callables, imports, calls, instantiations, heritage };
}

export function extractHaskellFileFacts(input: HaskellExtractFileFactsInput): ArtifactFacts {
  const scottyCapability = frameworkCapability("scotty");
  if (!scottyCapability.languages.includes(input.language)) {
    throw new Error("Scotty extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticHaskellFacts(input.sourceText);
  const relationFacts = parseHaskellRelations(input.sourceText);
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const haskellTypes: HaskellTypeFact[] = [];
  const haskellCallables: HaskellCallableFact[] = [];
  const haskellImports: HaskellImportFact[] = [];
  const haskellCalls: HaskellCallFact[] = [];
  const haskellInstantiations: HaskellInstantiationFact[] = [];
  const haskellHeritage: HaskellHeritageFact[] = [];
  const relationCallableSymbols = new Map<string, SymbolNode>();
  const functionSymbolsByStart = new Map<number, SymbolNode>();
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

  function addHaskellContainment(parent: SymbolNode, child: SymbolNode, from: number, to: number): void {
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

  function addHaskellType(type: HaskellRawType, parent: SymbolNode): SymbolNode {
    const qualifiedPath = type.declarationKind === "module"
      ? type.name
      : type.moduleName === "" ? type.name : `${type.moduleName}.${type.name}`;
    const qualifiedName = type.declarationKind === "module"
      ? `${fileNode.qualifiedName}#module:${type.name}`
      : `${fileNode.qualifiedName}#${qualifiedPath}`;
    const kind: SymbolNode["kind"] = type.declarationKind === "module"
      ? "module"
      : type.declarationKind === "class" ? "class" : "type";
    const declarationOrdinal = nextOrdinal(qualifiedName, kind);
    const symbol: SymbolNode = {
      id: createSymbolId({ filePath: input.filePath, qualifiedName, kind, declarationOrdinal }),
      name: type.name,
      qualifiedName,
      kind,
      filePath: input.filePath,
      range: rangeFor(lineStarts, type.start, type.end),
      isExported: type.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addHaskellContainment(parent, symbol, type.start, type.end);
    haskellTypes.push({ symbolId: symbol.id, filePath: input.filePath, name: type.name, moduleName: type.moduleName, qualifiedTypePath: qualifiedPath, declarationKind: type.declarationKind, constructorNames: type.constructorNames, constructorArities: type.constructorArities, isExported: type.isExported, range: symbol.range });
    return symbol;
  }

  function addHaskellCallable(callable: HaskellRawCallable, owner: SymbolNode | undefined): SymbolNode {
    const qualifiedPath = callable.moduleName === "" ? callable.name : `${callable.moduleName}.${callable.name}`;
    const qualifiedName = `${fileNode.qualifiedName}#${qualifiedPath}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "function");
    const symbol: SymbolNode = {
      id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "function", declarationOrdinal }),
      name: callable.name,
      qualifiedName,
      kind: callable.callableKind === "method" ? "method" : "function",
      filePath: input.filePath,
      range: rangeFor(lineStarts, callable.start, callable.end),
      isExported: callable.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    if (owner === undefined) addContainment(symbol, callable.start, callable.end); else addHaskellContainment(owner, symbol, callable.start, callable.end);
    relationCallableSymbols.set(callable.key, symbol);
    if (callable.callableKind === "function") functionSymbolsByStart.set(callable.start, symbol);
    haskellCallables.push({ symbolId: symbol.id, filePath: input.filePath, name: callable.name, moduleName: callable.moduleName, callableKind: callable.callableKind, ...(callable.ownerTypeName === undefined ? {} : { ownerTypeName: callable.ownerTypeName }), parameterCount: callable.parameterCount, requiredParameterCount: callable.requiredParameterCount, parameterTypeNames: callable.parameterTypeNames, ...(callable.returnTypeName === undefined ? {} : { returnTypeName: callable.returnTypeName }), isExported: callable.isExported, range: symbol.range });
    return symbol;
  }

  function addFunction(functionFact: StaticHaskellFunction): SymbolNode {
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
    functionSymbolsByStart.set(functionFact.start, symbol);
    return symbol;
  }

  function addScottyRoute(routeFact: StaticScottyRoute, handler: SymbolNode | null): void {
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
            ? "framework.scotty.direct-block.literal-named-function.unresolved"
            : "framework.scotty.direct-block.literal-named-function.local-function",
        stage: "syntax",
        candidateSymbolIds: handler === null ? [] : [handler.id]
      }
    });
  }

  const moduleSymbols = new Map<string, SymbolNode>();
  for (const type of relationFacts.types.filter((candidate) => candidate.declarationKind === "module").sort((left, right) => left.start - right.start)) {
    const symbol = addHaskellType(type, fileNode);
    moduleSymbols.set(type.name, symbol);
  }
  for (const type of relationFacts.types.filter((candidate) => candidate.declarationKind !== "module").sort((left, right) => left.start - right.start)) {
    const parent = type.moduleName === "" ? fileNode : moduleSymbols.get(type.moduleName) ?? fileNode;
    addHaskellType(type, parent);
  }
  const findHaskellType = (name: string, moduleName = ""): SymbolNode | undefined => {
    const candidates = haskellTypes
      .filter((fact) => fact.name === name && (moduleName === "" || fact.moduleName === moduleName))
      .map((fact) => symbols.find((symbol) => symbol.id === fact.symbolId))
      .filter((symbol): symbol is SymbolNode => symbol !== undefined);
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  for (const callable of [...relationFacts.callables].sort((left, right) => left.start - right.start)) {
    addHaskellCallable(callable, callable.ownerTypeName === undefined ? undefined : findHaskellType(callable.ownerTypeName, callable.moduleName));
  }
  for (const importFact of relationFacts.imports) {
    haskellImports.push({ sourceId: fileNode.id, filePath: input.filePath, importedModule: importFact.importedModule, ...(importFact.importedNames === undefined ? {} : { importedNames: importFact.importedNames }), isQualified: importFact.isQualified, ...(importFact.alias === undefined ? {} : { alias: importFact.alias }), range: rangeFor(lineStarts, importFact.start, importFact.end) });
  }
  for (const call of relationFacts.calls) {
    const source = relationCallableSymbols.get(call.sourceKey);
    if (source === undefined) continue;
    haskellCalls.push({ sourceId: source.id, filePath: input.filePath, referenceName: call.referenceName, callKind: call.callKind, ...(call.receiverModuleName === undefined ? {} : { receiverModuleName: call.receiverModuleName }), ...(call.receiverAlias === undefined ? {} : { receiverAlias: call.receiverAlias }), argumentCount: call.argumentCount, range: rangeFor(lineStarts, call.start, call.end) });
  }
  for (const instantiation of relationFacts.instantiations) {
    const source = relationCallableSymbols.get(instantiation.sourceKey);
    if (source === undefined) continue;
    haskellInstantiations.push({ sourceId: source.id, filePath: input.filePath, constructorName: instantiation.constructorName, argumentCount: instantiation.argumentCount, range: rangeFor(lineStarts, instantiation.start, instantiation.end) });
  }
  for (const heritageFact of relationFacts.heritage) {
    const source = findHaskellType(heritageFact.sourceTypeName, relationFacts.moduleName);
    if (source === undefined) continue;
    haskellHeritage.push({ sourceId: source.id, filePath: input.filePath, referenceName: heritageFact.referenceName, sourceTypeName: heritageFact.sourceTypeName, relationKind: "implements", range: rangeFor(lineStarts, heritageFact.start, heritageFact.end) });
  }

  if (staticFacts.valid) {
    const functionsByName = new Map<string, SymbolNode[]>();
    const functionsByStart = new Map<number, SymbolNode>();
    const unitArgumentFunctionsByName = new Map<string, SymbolNode[]>();
    const equationCounts = new Map<string, number>();
    for (const name of staticFacts.equationNames) {
      equationCounts.set(name, (equationCounts.get(name) ?? 0) + 1);
    }
    for (const functionFact of [...staticFacts.functions].sort((left, right) => left.start - right.start)) {
      const symbol = addFunction(functionFact);
      functionsByName.set(functionFact.name, [...(functionsByName.get(functionFact.name) ?? []), symbol]);
      functionsByStart.set(functionFact.start, symbol);
      if (functionFact.isUnitArgument) {
        unitArgumentFunctionsByName.set(functionFact.name, [
          ...(unitArgumentFunctionsByName.get(functionFact.name) ?? []),
          symbol
        ]);
      }
    }
    for (const callFact of [...staticFacts.calls].sort((left, right) => left.start - right.start)) {
      const caller = functionsByStart.get(callFact.callerStart);
      const candidates = functionsByName.get(callFact.calleeName) ?? [];
      const unitArgumentCandidates = unitArgumentFunctionsByName.get(callFact.calleeName) ?? [];
      if (
        caller === undefined ||
        candidates.length !== 1 ||
        unitArgumentCandidates.length !== 1 ||
        equationCounts.get(callFact.calleeName) !== 1
      ) {
        continue;
      }
      const callee = unitArgumentCandidates[0];
      if (callee === undefined) {
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
          ruleId: "syntax.haskell.same-file.unique-unit-argument-bare-function-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      });
    }
    for (const routeFact of [...staticFacts.routes].sort((left, right) => left.start - right.start)) {
      const candidates = functionsByName.get(routeFact.handlerName) ?? [];
      addScottyRoute(routeFact, candidates.length === 1 ? candidates[0] ?? null : null);
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
    haskellFacts: {
      moduleName: relationFacts.moduleName,
      parserRejected: !relationFacts.valid,
      types: haskellTypes,
      callables: haskellCallables,
      imports: haskellImports,
      calls: haskellCalls,
      instantiations: haskellInstantiations,
      heritage: haskellHeritage
    } satisfies HaskellFacts
  };
}
