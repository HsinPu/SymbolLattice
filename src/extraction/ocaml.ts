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

  function addFunction(functionFact: StaticOcamlFunction): SymbolNode {
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
    reExportBindings: []
  };
}
