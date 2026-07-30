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
  readonly routes: readonly StaticScottyRoute[];
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
  const match = /^([a-z_][A-Za-z0-9_']*)\s*=\s*\S/u.exec(line.content);
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
    return { valid: false, functions: [], routes: [] };
  }
  const lines = linesFor(sourceText, sanitized.text);
  if (lines === null) {
    return { valid: false, functions: [], routes: [] };
  }

  const functions = lines
    .map((line) => directHaskellFunction(line))
    .filter((functionFact): functionFact is StaticHaskellFunction => functionFact !== null);
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
    routes: directScottyImportCount === 1 ? routes : []
  };
}

export function extractHaskellFileFacts(input: HaskellExtractFileFactsInput): ArtifactFacts {
  const scottyCapability = frameworkCapability("scotty");
  if (!scottyCapability.languages.includes(input.language)) {
    throw new Error("Scotty extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticHaskellFacts(input.sourceText);
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

  function addFunction(functionFact: StaticHaskellFunction): SymbolNode {
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

  if (staticFacts.valid) {
    const functionsByName = new Map<string, SymbolNode[]>();
    for (const functionFact of [...staticFacts.functions].sort((left, right) => left.start - right.start)) {
      const symbol = addFunction(functionFact);
      functionsByName.set(functionFact.name, [...(functionsByName.get(functionFact.name) ?? []), symbol]);
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
    reExportBindings: []
  };
}
