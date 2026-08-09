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

export function extractNimFileFacts(input: NimExtractFileFactsInput): ArtifactFacts {
  const jesterCapability = frameworkCapability("jester");
  if (!jesterCapability.languages.includes(input.language)) {
    throw new Error("Jester extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticNimFacts(input.sourceText);
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
