import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface PascalExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "pascal";
}

interface PascalLine {
  readonly start: number;
  readonly end: number;
  readonly content: string;
  readonly indent: number;
}

interface StaticPascalRoutine {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface StaticHorseRoute {
  readonly method: HorseRouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly start: number;
  readonly end: number;
}

interface PascalProgramBlock {
  readonly declarationLine: number;
  readonly startLine: number;
  readonly endLine: number;
}

interface PascalRoutineHeader {
  readonly name: string;
  readonly start: number;
  readonly hasInlineBegin: boolean;
}

interface SanitizedPascalSource {
  readonly valid: boolean;
  readonly text: string;
}

type PascalBlockCloser = "end" | "until";
type HorseRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const PASCAL_ROUTINE_HEADER =
  /^(?:(?:class|static)\s+)?(?:procedure|function)\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*(?:\([^)]*\))?\s*(?::\s*[A-Za-z_][A-Za-z0-9_.]*)?\s*;\s*(begin\b.*)?$/iu;

const HORSE_ROUTE_METHODS: ReadonlyMap<string, HorseRouteMethod> = new Map([
  ["get", "GET"],
  ["post", "POST"],
  ["put", "PUT"],
  ["patch", "PATCH"],
  ["delete", "DELETE"]
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

function blankCharacter(characters: string[], index: number): void {
  const character = characters[index];
  if (character !== undefined && character !== "\r" && character !== "\n") {
    characters[index] = " ";
  }
}

/**
 * Blanks Pascal comments and strings without changing offsets. This is not a
 * grammar: it only supplies a fail-closed lexical boundary for direct routine
 * declarations, so comment or string text cannot create a false declaration.
 */
function sanitizePascal(sourceText: string): SanitizedPascalSource {
  const characters = sourceText.split("");
  let commentMode: "brace" | "paren" | null = null;
  let inString = false;

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];

    if (character === undefined) {
      continue;
    }

    if (commentMode === "brace") {
      blankCharacter(characters, index);
      if (character === "}") {
        commentMode = null;
      }
      continue;
    }

    if (commentMode === "paren") {
      blankCharacter(characters, index);
      if (character === "*" && next === ")") {
        blankCharacter(characters, index + 1);
        index += 1;
        commentMode = null;
      }
      continue;
    }

    if (inString) {
      if (character === "\r" || character === "\n") {
        return { valid: false, text: sourceText };
      }
      blankCharacter(characters, index);
      if (character === "'") {
        if (next === "'") {
          blankCharacter(characters, index + 1);
          index += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (character === "{") {
      blankCharacter(characters, index);
      commentMode = "brace";
      continue;
    }

    if (character === "(" && next === "*") {
      blankCharacter(characters, index);
      blankCharacter(characters, index + 1);
      index += 1;
      commentMode = "paren";
      continue;
    }

    if (character === "/" && next === "/") {
      for (let commentIndex = index; commentIndex < characters.length; commentIndex += 1) {
        const commentCharacter = characters[commentIndex];
        if (commentCharacter === "\r" || commentCharacter === "\n") {
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

    if (character === "'") {
      blankCharacter(characters, index);
      inString = true;
    }
  }

  return {
    valid: commentMode === null && !inString,
    text: characters.join("")
  };
}

function linesFor(sourceText: string): readonly PascalLine[] {
  const lines: PascalLine[] = [];
  let lineStart = 0;

  while (lineStart <= sourceText.length) {
    const newline = sourceText.indexOf("\n", lineStart);
    const rawEnd = newline === -1 ? sourceText.length : newline;
    const lineEnd =
      rawEnd > lineStart && sourceText.charAt(rawEnd - 1) === "\r" ? rawEnd - 1 : rawEnd;
    const raw = sourceText.slice(lineStart, lineEnd);
    const indent = /^[ \t]*/u.exec(raw)?.[0].length ?? 0;
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

function directPascalRoutineHeader(line: PascalLine): PascalRoutineHeader | null {
  if (line.indent !== 0) {
    return null;
  }
  const match = PASCAL_ROUTINE_HEADER.exec(line.content);
  const name = match?.[1];
  return name === undefined
    ? null
    : { name, start: line.start, hasInlineBegin: match?.[2] !== undefined };
}

function directRoutineBodyStart(
  lines: readonly PascalLine[],
  headerIndex: number,
  header: PascalRoutineHeader
): number | null {
  if (header.hasInlineBegin) {
    return headerIndex;
  }
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.content.length === 0) {
      continue;
    }
    if (
      /^\s*(?:implementation|interface|initialization|finalization)\b/iu.test(line.content) ||
      /^end\.\s*$/iu.test(line.content) ||
      (line.indent === 0 && directPascalRoutineHeader(line) !== null)
    ) {
      return null;
    }
    if (/^begin\b/iu.test(line.content)) {
      return index;
    }
  }
  return null;
}

function pascalTokens(line: string): readonly string[] {
  return line.match(/[A-Za-z_][A-Za-z0-9_]*|=/gu) ?? [];
}

function beginsPascalTypeBlock(tokens: readonly string[], index: number): boolean {
  const token = tokens[index]?.toLowerCase();
  return (
    (token === "record" || token === "class" || token === "object") &&
    tokens.slice(0, index).includes("=")
  );
}

function directBlockEndLine(
  lines: readonly PascalLine[],
  bodyStart: number,
  terminator: ";" | "."
): number | null {
  const blocks: PascalBlockCloser[] = [];

  for (let lineIndex = bodyStart; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      continue;
    }
    const tokens = pascalTokens(line.content);
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      const token = tokens[tokenIndex]?.toLowerCase();
      if (token === undefined) {
        continue;
      }
      if (
        token === "begin" ||
        token === "case" ||
        token === "try" ||
        token === "asm" ||
        beginsPascalTypeBlock(tokens, tokenIndex)
      ) {
        blocks.push("end");
        continue;
      }
      if (token === "repeat") {
        blocks.push("until");
        continue;
      }
      if (token === "until") {
        if (blocks.pop() !== "until") {
          return null;
        }
        continue;
      }
      if (token !== "end") {
        continue;
      }
      if (blocks.pop() !== "end") {
        return null;
      }
      if (blocks.length === 0) {
        const endsCorrectly =
          terminator === ";"
            ? /\bend\s*;\s*$/iu.test(line.content)
            : /\bend\s*\.\s*$/iu.test(line.content);
        return endsCorrectly ? lineIndex : null;
      }
    }
  }

  return null;
}

function directRoutineEnd(lines: readonly PascalLine[], bodyStart: number): number | null {
  const endLine = directBlockEndLine(lines, bodyStart, ";");
  return endLine === null ? null : (lines[endLine]?.end ?? null);
}

function collectDirectPascalRoutines(lines: readonly PascalLine[]): readonly StaticPascalRoutine[] {
  const routines: StaticPascalRoutine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const headerLine = lines[index];
    if (headerLine === undefined) {
      continue;
    }
    const header = directPascalRoutineHeader(headerLine);
    if (header === null) {
      continue;
    }
    const bodyStart = directRoutineBodyStart(lines, index, header);
    if (bodyStart === null) {
      continue;
    }
    const end = directRoutineEnd(lines, bodyStart);
    if (end !== null) {
      routines.push({ name: header.name, start: header.start, end });
    }
  }
  return routines;
}

function isDirectPascalProgramDeclaration(line: PascalLine): boolean {
  return (
    line.indent === 0 &&
    /^program\s+[A-Za-z_][A-Za-z0-9_]*\s*;\s*$/iu.test(line.content)
  );
}

function lineIsInsideRoutine(line: PascalLine, routines: readonly StaticPascalRoutine[]): boolean {
  return routines.some((routine) => routine.start <= line.start && line.end <= routine.end);
}

function directPascalProgramBlock(
  lines: readonly PascalLine[],
  routines: readonly StaticPascalRoutine[]
): PascalProgramBlock | null {
  const programDeclarations = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => isDirectPascalProgramDeclaration(line));
  if (programDeclarations.length !== 1) {
    return null;
  }
  const program = programDeclarations[0];
  if (program === undefined) {
    return null;
  }

  const blocks: PascalProgramBlock[] = [];
  for (let index = program.index + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      line === undefined ||
      line.indent !== 0 ||
      !/^begin\s*$/iu.test(line.content) ||
      lineIsInsideRoutine(line, routines)
    ) {
      continue;
    }
    const endLine = directBlockEndLine(lines, index, ".");
    if (endLine !== null) {
      blocks.push({ declarationLine: program.index, startLine: index, endLine });
    }
  }
  return blocks.length === 1 ? (blocks[0] ?? null) : null;
}

function hasExactlyOneDirectHorseUses(
  lines: readonly PascalLine[],
  program: PascalProgramBlock
): boolean {
  const horseUses = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.indent === 0 && /^uses\s+Horse\s*;\s*$/iu.test(line.content));
  const horseUse = horseUses[0];
  return (
    horseUses.length === 1 &&
    horseUse !== undefined &&
    horseUse.index > program.declarationLine &&
    horseUse.index < program.startLine
  );
}

function blockDepthBeforeLines(
  lines: readonly PascalLine[],
  startLine: number,
  endLine: number
): ReadonlyMap<number, number> | null {
  const depths = new Map<number, number>();
  const blocks: PascalBlockCloser[] = [];

  for (let lineIndex = startLine; lineIndex <= endLine; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      return null;
    }
    depths.set(lineIndex, blocks.length);
    const tokens = pascalTokens(line.content);
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      const token = tokens[tokenIndex]?.toLowerCase();
      if (token === undefined) {
        continue;
      }
      if (
        token === "begin" ||
        token === "case" ||
        token === "try" ||
        token === "asm" ||
        beginsPascalTypeBlock(tokens, tokenIndex)
      ) {
        blocks.push("end");
        continue;
      }
      if (token === "repeat") {
        blocks.push("until");
        continue;
      }
      if (token === "until") {
        if (blocks.pop() !== "until") {
          return null;
        }
        continue;
      }
      if (token === "end" && blocks.pop() !== "end") {
        return null;
      }
    }
  }

  return blocks.length === 0 ? depths : null;
}

function staticHorsePath(value: string): string | null {
  const path = value.replaceAll("''", "'");
  return path.startsWith("/") && !path.includes("//") && !/[?#]/u.test(path) ? path : null;
}

function directHorseRoute(rawLine: PascalLine): StaticHorseRoute | null {
  const match =
    /^THorse\.(Get|Post|Put|Patch|Delete)\(\s*'((?:''|[^'\r\n])*)'\s*,\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\)\s*;\s*$/iu.exec(
      rawLine.content
    );
  const method = match?.[1] === undefined ? undefined : HORSE_ROUTE_METHODS.get(match[1].toLowerCase());
  const path = match?.[2] === undefined ? null : staticHorsePath(match[2]);
  const handlerName = match?.[3];
  if (method === undefined || path === null || handlerName === undefined) {
    return null;
  }
  return { method, path, handlerName, start: rawLine.start, end: rawLine.end };
}

function collectDirectHorseRoutes(
  rawLines: readonly PascalLine[],
  sanitizedLines: readonly PascalLine[],
  routines: readonly StaticPascalRoutine[]
): readonly StaticHorseRoute[] {
  if (rawLines.length !== sanitizedLines.length) {
    return [];
  }
  const program = directPascalProgramBlock(sanitizedLines, routines);
  if (program === null || !hasExactlyOneDirectHorseUses(sanitizedLines, program)) {
    return [];
  }
  const depths = blockDepthBeforeLines(sanitizedLines, program.startLine, program.endLine);
  if (depths === null) {
    return [];
  }

  const routes: StaticHorseRoute[] = [];
  for (let lineIndex = program.startLine + 1; lineIndex < program.endLine; lineIndex += 1) {
    if (depths.get(lineIndex) !== 1) {
      continue;
    }
    const rawLine = rawLines[lineIndex];
    if (rawLine === undefined) {
      continue;
    }
    const route = directHorseRoute(rawLine);
    if (route !== null) {
      routes.push(route);
    }
  }
  return routes;
}

/**
 * Extracts direct Pascal routines plus a narrow Horse route subset. Horse
 * requires exactly one direct `uses Horse;` proof, one complete program main
 * block, direct literal `THorse.Get/Post/Put/Patch/Delete` registrations, and
 * prior same-file direct routine handlers.
 */
export function extractPascalFileFacts(input: PascalExtractFileFactsInput): ArtifactFacts {
  const horseCapability = frameworkCapability("horse");
  if (!horseCapability.languages.includes(input.language)) {
    throw new Error("Horse extraction was invoked for an unsupported source language.");
  }
  const sanitized = sanitizePascal(input.sourceText);
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
    const identity = `${qualifiedName}\u0000${kind}`;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addRoutine(routine: StaticPascalRoutine): SymbolNode {
    const qualifiedName = `${input.filePath}#${routine.name}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "function");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "function",
        declarationOrdinal
      }),
      name: routine.name,
      qualifiedName,
      kind: "function",
      filePath: input.filePath,
      range: rangeFor(lineStarts, routine.start, routine.end),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    const range = rangeFor(lineStarts, routine.start, routine.end);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: symbol.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: routine.name
      }),
      sourceId: fileNode.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: routine.name,
      evidence: {
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
    return symbol;
  }

  function addHorseRoute(routeFact: StaticHorseRoute, handler: SymbolNode): void {
    const routeName = `${routeFact.method} ${routeFact.path}`;
    const qualifiedName = `${fileNode.qualifiedName}#route:${routeName}`;
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
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: route.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: routeName
      }),
      sourceId: fileNode.id,
      targetId: route.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: routeName,
      evidence: {
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [route.id]
      }
    });
    edges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: handler.id,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName: handler.name
      }),
      sourceId: route.id,
      targetId: handler.id,
      kind: "routes",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: handler.name,
      evidence: {
        ruleId: "framework.horse.direct-uses.literal-route.local-routine",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  if (sanitized.valid) {
    const sanitizedLines = linesFor(sanitized.text);
    const routines = collectDirectPascalRoutines(sanitizedLines);
    const routinesByName = new Map<string, Array<{ routine: StaticPascalRoutine; symbol: SymbolNode }>>();
    for (const routine of routines) {
      const symbol = addRoutine(routine);
      const normalizedName = routine.name.toLowerCase();
      const existing = routinesByName.get(normalizedName) ?? [];
      existing.push({ routine, symbol });
      routinesByName.set(normalizedName, existing);
    }

    for (const routeFact of collectDirectHorseRoutes(
      linesFor(input.sourceText),
      sanitizedLines,
      routines
    )) {
      const candidates = (routinesByName.get(routeFact.handlerName.toLowerCase()) ?? []).filter(
        (candidate) => candidate.routine.end < routeFact.start
      );
      if (candidates.length === 1) {
        const candidate = candidates[0];
        if (candidate !== undefined) {
          addHorseRoute(routeFact, candidate.symbol);
        }
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
    reExportBindings: []
  };
}
