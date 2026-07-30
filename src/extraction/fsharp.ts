import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
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

function directFsharpFunction(line: FsharpLine): StaticFsharpFunction | null {
  if (line.indent !== 0) {
    return null;
  }
  const match =
    /^let\s+(?:rec\s+)?([a-z_][A-Za-z0-9_']*)\s+\(\s*[a-z_][A-Za-z0-9_']*\s*:\s*HttpFunc\s*\)\s+\(\s*[a-z_][A-Za-z0-9_']*\s*:\s*HttpContext\s*\)\s*=$/u.exec(
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
    return { valid: false, functions: [], routes: [] };
  }
  const lines = linesFor(sourceText, sanitized.text);
  const functions = lines
    .map((line) => directFsharpFunction(line))
    .filter((functionFact): functionFact is StaticFsharpFunction => functionFact !== null);
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
    routes: directGiraffeOpenCount === 1 && !hasRouteBindingShadow ? routes : []
  };
}

export function extractFsharpFileFacts(input: FsharpExtractFileFactsInput): ArtifactFacts {
  const giraffeCapability = frameworkCapability("giraffe");
  if (!giraffeCapability.languages.includes(input.language)) {
    throw new Error("Giraffe extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticFsharpFacts(input.sourceText);
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
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

  function addFunction(functionFact: StaticFsharpFunction): SymbolNode {
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

  if (staticFacts.valid) {
    const functionsByName = new Map<string, SymbolNode[]>();
    for (const functionFact of [...staticFacts.functions].sort((left, right) => left.start - right.start)) {
      const symbol = addFunction(functionFact);
      functionsByName.set(functionFact.name, [...(functionsByName.get(functionFact.name) ?? []), symbol]);
    }
    for (const routeFact of [...staticFacts.routes].sort((left, right) => left.start - right.start)) {
      const candidates = functionsByName.get(routeFact.handlerName) ?? [];
      addGiraffeRoute(routeFact, candidates.length === 1 ? candidates[0] ?? null : null);
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
