import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type PascalCallFact,
  type PascalRoutineFact,
  type PascalUnitFact,
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
  readonly kind: "function" | "procedure";
  readonly hasZeroParameters: boolean;
  readonly start: number;
  readonly bodyStart: number;
  readonly end: number;
}

interface StaticPascalDirectCall {
  readonly caller: StaticPascalRoutine;
  readonly targetName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticPascalProgramMainCall {
  readonly target: StaticPascalRoutine;
  readonly targetName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticPascalProgramRoutineCall {
  readonly targetName: string;
  readonly start: number;
  readonly end: number;
  readonly usesUnitNames: readonly string[];
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
  readonly kind: "function" | "procedure";
  readonly hasZeroParameters: boolean;
  readonly start: number;
  readonly hasInlineBegin: boolean;
}

interface SanitizedPascalSource {
  readonly valid: boolean;
  readonly text: string;
  readonly hasConditionalCompilerDirective: boolean;
  readonly hasMacroCompilerDirective: boolean;
}

interface PascalUnitScope {
  readonly implementationLine: number;
  readonly interfaceRoutineCounts: ReadonlyMap<string, number>;
}

type PascalBlockCloser = "end" | "until";
type HorseRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

const PASCAL_ROUTINE_HEADER =
  /^(?:(?:class|static)\s+)?(procedure|function)\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*(?:\(([^)]*)\))?\s*(?::\s*[A-Za-z_][A-Za-z0-9_.]*)?\s*;\s*(begin\b.*)?$/iu;

const PASCAL_UNIT_DECLARATION = /^unit\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/iu;
const PASCAL_PROGRAM_DECLARATION = /^program\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/iu;

const PASCAL_BUILTIN_ROUTINE_NAMES: ReadonlySet<string> = new Set([
  "abort", "assign", "break", "continue", "dec", "delete", "dispose", "exit", "halt",
  "inc", "insert", "new", "read", "readln", "reset", "rewrite", "setlength", "str",
  "val", "write", "writeln"
]);

const HORSE_ROUTE_METHODS: ReadonlyMap<string, HorseRouteMethod> = new Map([
  ["get", "GET"],
  ["post", "POST"],
  ["put", "PUT"],
  ["patch", "PATCH"],
  ["delete", "DELETE"],
  ["head", "HEAD"]
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
  let hasConditionalCompilerDirective = false;
  let hasMacroCompilerDirective = false;

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
        return {
          valid: false,
          text: sourceText,
          hasConditionalCompilerDirective,
          hasMacroCompilerDirective
        };
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
      if (
        next === "$" &&
        /^\s*(?:IFDEF|IFNDEF|ELSEIF|ENDIF|ELSE|IF)\b/iu.test(sourceText.slice(index + 2))
      ) {
        hasConditionalCompilerDirective = true;
      }
      if (next === "$" && /^\s*(?:MACRO|DEFINE|UNDEF)\b/iu.test(sourceText.slice(index + 2))) {
        hasMacroCompilerDirective = true;
      }
      blankCharacter(characters, index);
      commentMode = "brace";
      continue;
    }

    if (character === "(" && next === "*") {
      if (
        characters[index + 2] === "$" &&
        /^\s*(?:IFDEF|IFNDEF|ELSEIF|ENDIF|ELSE|IF)\b/iu.test(sourceText.slice(index + 3))
      ) {
        hasConditionalCompilerDirective = true;
      }
      if (
        characters[index + 2] === "$" &&
        /^\s*(?:MACRO|DEFINE|UNDEF)\b/iu.test(sourceText.slice(index + 3))
      ) {
        hasMacroCompilerDirective = true;
      }
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
    text: characters.join(""),
    hasConditionalCompilerDirective,
    hasMacroCompilerDirective
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
  const match = PASCAL_ROUTINE_HEADER.exec(line.content);
  const kind = match?.[1]?.toLowerCase();
  const name = match?.[2];
  const parameterList = match?.[3];
  return name === undefined || (kind !== "function" && kind !== "procedure")
    ? null
    : {
        name,
        kind,
        hasZeroParameters: parameterList === undefined || parameterList.trim().length === 0,
        start: line.start,
        hasInlineBegin: match?.[4] !== undefined
      };
}

function directPascalUnitName(lines: readonly PascalLine[]): string | null {
  const declarations = lines
    .map((line) => PASCAL_UNIT_DECLARATION.exec(line.content)?.[1])
    .filter((name): name is string => name !== undefined);
  return declarations.length === 1 ? (declarations[0] ?? null) : null;
}

function directPascalProgramName(lines: readonly PascalLine[]): string | null {
  const declarations = lines
    .map((line) => PASCAL_PROGRAM_DECLARATION.exec(line.content)?.[1])
    .filter((name): name is string => name !== undefined);
  return declarations.length === 1 ? (declarations[0] ?? null) : null;
}

/**
 * Accepts only one simple, explicit program-level uses clause immediately
 * before the main block. Qualified unit names, `in` paths, and other program
 * declarations remain unresolved because they need compiler configuration.
 */
function directPascalUses(
  lines: readonly PascalLine[],
  declarationLine: number,
  blockStartLine: number
): readonly string[] | null {
  const nonEmpty = lines
    .slice(declarationLine + 1, blockStartLine)
    .map((line) => line.content.trim())
    .filter((content) => content.length > 0);
  if (nonEmpty.length === 0) {
    return null;
  }
  const match = /^uses\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s*;\s*$/iu.exec(
    nonEmpty.join(" ")
  );
  if (match?.[1] === undefined) {
    return null;
  }
  const names = match[1]
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return names.length > 0 && new Set(names.map((name) => name.toLowerCase())).size === names.length
    ? names
    : null;
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
      directPascalRoutineHeader(line) !== null
    ) {
      const nestedHeader = directPascalRoutineHeader(line);
      if (nestedHeader === null) {
        return null;
      }
      const nestedBodyStart = directRoutineBodyStart(lines, index, nestedHeader);
      const nestedEndLine =
        nestedBodyStart === null ? null : directBlockEndLine(lines, nestedBodyStart, ";");
      if (nestedEndLine === null) {
        return null;
      }
      index = nestedEndLine;
      continue;
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
    if (headerLine === undefined || headerLine.indent !== 0) {
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
      const bodyLine = lines[bodyStart];
      const inlineBeginOffset = bodyLine?.content.search(/\bbegin\b/iu) ?? -1;
      const bodyStartOffset =
        header.hasInlineBegin && bodyLine !== undefined && inlineBeginOffset >= 0
          ? bodyLine.start + inlineBeginOffset
          : (bodyLine?.start ?? header.start);
      routines.push({
        name: header.name,
        kind: header.kind,
        hasZeroParameters: header.hasZeroParameters,
        start: header.start,
        bodyStart: bodyStartOffset,
        end
      });
    }
  }
  return routines.filter(
    (routine) =>
      !routines.some(
        (candidate) =>
          candidate.start < routine.start && routine.end <= candidate.end
      )
  );
}

function hasPascalUnitDeclaration(lines: readonly PascalLine[]): boolean {
  return lines.some((line) => /^unit\s+[A-Za-z_][A-Za-z0-9_]*\s*;\s*$/iu.test(line.content));
}

function directPascalInterfaceRoutineCounts(
  lines: readonly PascalLine[],
  interfaceLine: number,
  implementationLine: number
): ReadonlyMap<string, number> | null {
  const routineCounts = new Map<string, number>();
  const typeNames: string[] = [];

  for (let index = interfaceLine + 1; index < implementationLine; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      return null;
    }
    const typeStart = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:packed\s+)?(?:class|record|object)\b/iu.exec(line.content);
    if (typeStart !== null) {
      const typeName = typeStart[1];
      if (typeName === undefined || typeNames.length > 0) {
        return null;
      }
      typeNames.push(typeName);
    }

    const header = directPascalRoutineHeader(line);
    if (header !== null && typeNames.length === 0 && !header.name.includes(".")) {
      const normalizedName = header.name.toLowerCase();
      routineCounts.set(normalizedName, (routineCounts.get(normalizedName) ?? 0) + 1);
    }

    for (const token of pascalTokens(line.content)) {
      if (token.toLowerCase() === "end") {
        if (typeNames.pop() === undefined) {
          return null;
        }
      }
    }
  }
  return typeNames.length === 0 ? routineCounts : null;
}

function directPascalUnitScope(lines: readonly PascalLine[]): PascalUnitScope | null {
  const unitLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^unit\s+[A-Za-z_][A-Za-z0-9_]*\s*;\s*$/iu.test(line.content));
  if (unitLines.length !== 1) {
    return null;
  }
  const unit = unitLines[0];
  if (unit === undefined) {
    return null;
  }
  const interfaceLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^interface\s*$/iu.test(line.content));
  const implementationLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^implementation\s*$/iu.test(line.content));
  const interfaceLine = interfaceLines[0];
  const implementationLine = implementationLines[0];
  if (
    interfaceLines.length !== 1 ||
    implementationLines.length !== 1 ||
    interfaceLine === undefined ||
    implementationLine === undefined ||
    unit.index >= interfaceLine.index ||
    interfaceLine.index >= implementationLine.index
  ) {
    return null;
  }

  const interfaceRoutineCounts = directPascalInterfaceRoutineCounts(
    lines,
    interfaceLine.index,
    implementationLine.index
  );
  if (interfaceRoutineCounts === null) {
    return null;
  }
  return { implementationLine: implementationLine.index, interfaceRoutineCounts };
}

function routineLineIndex(lines: readonly PascalLine[], routine: StaticPascalRoutine): number | null {
  const index = lines.findIndex((line) => line.start === routine.start);
  return index === -1 ? null : index;
}

function directPascalFileRoutines(
  lines: readonly PascalLine[],
  routines: readonly StaticPascalRoutine[],
  unitScope: PascalUnitScope | null
): readonly StaticPascalRoutine[] {
  if (hasPascalUnitDeclaration(lines)) {
    if (unitScope === null) {
      return [];
    }
    return routines.filter((routine) => {
      const lineIndex = routineLineIndex(lines, routine);
      return lineIndex !== null && lineIndex > unitScope.implementationLine;
    });
  }

  const programDeclarations = lines.filter((line) => isDirectPascalProgramDeclaration(line));
  if (programDeclarations.length === 0) {
    return routines;
  }
  const program = directPascalProgramBlock(lines, routines);
  if (program === null) {
    return [];
  }
  const programStart = lines[program.startLine]?.start;
  return programStart === undefined ? [] : routines.filter((routine) => routine.start < programStart);
}

function hasPascalPotentialShadow(
  sourceText: string,
  caller: StaticPascalRoutine,
  targetName: string
): boolean {
  const identifier = "[A-Za-z_][A-Za-z0-9_]*";
  const declarationPrefix = sourceText.slice(caller.start, caller.bodyStart);
  if (new RegExp(`\\b${targetName}\\b`, "iu").test(declarationPrefix)) {
    return true;
  }
  const callerText = sourceText.slice(caller.start, caller.end);
  const groupedDeclaration = `(?:${identifier}\\s*,\\s*)*${targetName}(?:\\s*,\\s*${identifier})*`;
  if (new RegExp(`\\b${groupedDeclaration}\\s*(?::|:=|=|;|$)`, "imu").test(callerText)) {
    return true;
  }
  return new RegExp(`\\bvar\\b[\\s\\S]*\\b${targetName}\\b`, "iu").test(callerText);
}

function collectDirectPascalCalls(
  sourceText: string,
  lines: readonly PascalLine[],
  routines: readonly StaticPascalRoutine[],
  hasCompilerIncludeDirective: boolean,
  hasMacroCompilerDirective: boolean
): readonly StaticPascalDirectCall[] {
  if (
    hasCompilerIncludeDirective ||
    hasMacroCompilerDirective ||
    lines.some((line) => /^unit\b/iu.test(line.content)) ||
    lines.some((line) => /^uses\b/iu.test(line.content)) ||
    /\b(?:forward|external|overload|with)\b/iu.test(sourceText)
  ) {
    return [];
  }
  const calls: StaticPascalDirectCall[] = [];
  for (const caller of routines) {
    if (caller.name.includes(".")) {
      continue;
    }
    const callerLines = lines.filter((line) => caller.start < line.start && line.end < caller.end);
    if (
      callerLines.some(
        (line) => line.indent > 0 && /^(?:procedure|function)\b/iu.test(line.content)
      )
    ) {
      continue;
    }
    for (const line of callerLines) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*;\s*$/u.exec(line.content);
      const targetName = match?.[1];
      if (targetName === undefined) {
        continue;
      }
      const targetCandidates = routines.filter(
        (routine) =>
          !routine.name.includes(".") &&
          routine.end < caller.start &&
          routine.name.toLowerCase() === targetName.toLowerCase()
      );
      if (
        targetCandidates.length !== 1 ||
        hasPascalPotentialShadow(sourceText, caller, targetName)
      ) {
        continue;
      }
      const callStart = line.start + line.content.indexOf(targetName);
      calls.push({
        caller,
        targetName,
        start: callStart,
        end: callStart + targetName.length + 2
      });
    }
  }
  return calls;
}

function hasPascalCompilerIncludeDirective(sourceText: string): boolean {
  return (
    /\{\$\s*(?:I|INCLUDE)(?=\s|\})/iu.test(sourceText) ||
    /\(\*\$\s*(?:I|INCLUDE)(?=\s|\*)/iu.test(sourceText)
  );
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

function directPascalProgramMainRoutineCalls(
  sourceText: string,
  lines: readonly PascalLine[],
  routines: readonly StaticPascalRoutine[],
  program: PascalProgramBlock | null,
  hasCompilerIncludeDirective: boolean,
  hasConditionalCompilerDirective: boolean,
  hasMacroCompilerDirective: boolean
): readonly StaticPascalProgramRoutineCall[] {
  if (
    program === null ||
    hasCompilerIncludeDirective ||
    hasConditionalCompilerDirective ||
    hasMacroCompilerDirective ||
    hasPascalUnitDeclaration(lines) ||
    /\b(?:forward|external|overload|with)\b/iu.test(sourceText)
  ) {
    return [];
  }
  const usesUnitNames = directPascalUses(lines, program.declarationLine, program.startLine);
  if (usesUnitNames === null) {
    return [];
  }
  const localRoutineNames = new Set(
    routines
      .filter((routine) => !routine.name.includes("."))
      .map((routine) => routine.name.toLowerCase())
  );
  const statements = lines
    .slice(program.startLine + 1, program.endLine)
    .filter((line) => line.content.length > 0);
  const calls: StaticPascalProgramRoutineCall[] = [];
  for (const statement of statements) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\s*\))?\s*;\s*$/u.exec(statement.content);
    const targetName = match?.[1];
    if (
      targetName === undefined ||
      PASCAL_BUILTIN_ROUTINE_NAMES.has(targetName.toLowerCase()) ||
      localRoutineNames.has(targetName.toLowerCase())
    ) {
      return [];
    }
    const start = statement.start + statement.content.indexOf(targetName);
    calls.push({
      targetName,
      start,
      end: start + targetName.length,
      usesUnitNames
    });
  }
  return calls;
}

function directPascalProgramMainCall(
  sourceText: string,
  lines: readonly PascalLine[],
  routines: readonly StaticPascalRoutine[],
  hasCompilerIncludeDirective: boolean,
  hasConditionalCompilerDirective: boolean,
  hasMacroCompilerDirective: boolean
): StaticPascalProgramMainCall | null {
  if (
    hasCompilerIncludeDirective ||
    hasConditionalCompilerDirective ||
    hasMacroCompilerDirective ||
    hasPascalUnitDeclaration(lines) ||
    lines.some((line) => /^uses\b/iu.test(line.content)) ||
    /\b(?:forward|external|overload|with)\b/iu.test(sourceText)
  ) {
    return null;
  }
  const program = directPascalProgramBlock(lines, routines);
  const routineKeywords = sourceText.match(/\b(?:procedure|function)\b/giu) ?? [];
  if (program === null || routineKeywords.length !== routines.length) {
    return null;
  }
  const statements = lines
    .slice(program.startLine + 1, program.endLine)
    .filter((line) => line !== undefined && line.content.length > 0);
  if (statements.length !== 1) {
    return null;
  }
  const statement = statements[0];
  if (statement === undefined) {
    return null;
  }
  const match = /^WriteLn\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\);\s*$/iu.exec(statement.content);
  const targetName = match?.[1];
  if (targetName === undefined) {
    return null;
  }
  const sameName = routines.filter((routine) => routine.name.toLowerCase() === targetName.toLowerCase());
  const target = sameName[0];
  if (
    sameName.length !== 1 ||
    target === undefined ||
    target.kind !== "function" ||
    !target.hasZeroParameters ||
    target.name.includes(".") ||
    target.end >= statement.start
  ) {
    return null;
  }
  const occurrences = sourceText.match(new RegExp(`\\b${targetName}\\b`, "giu")) ?? [];
  if (occurrences.length !== 2) {
    return null;
  }
  const start = statement.start + statement.content.indexOf(targetName);
  return { target, targetName, start, end: start + targetName.length };
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
    /^THorse\.(Get|Post|Put|Patch|Delete|Head)\(\s*'((?:''|[^'\r\n])*)'\s*,\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\)\s*;\s*$/iu.exec(
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
  routines: readonly StaticPascalRoutine[],
  hasCompilerIncludeDirective: boolean,
  hasMacroCompilerDirective: boolean
): readonly StaticHorseRoute[] {
  if (
    hasCompilerIncludeDirective ||
    hasMacroCompilerDirective ||
    rawLines.length !== sanitizedLines.length
  ) {
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
 * block, direct literal `THorse.Get/Post/Put/Patch/Delete/Head` registrations, and
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

  const pascalUnits: PascalUnitFact[] = [];
  const pascalRoutines: PascalRoutineFact[] = [];
  const pascalCalls: PascalCallFact[] = [];

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = `${qualifiedName}\u0000${kind}`;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addRoutine(routine: StaticPascalRoutine, isExported: boolean): SymbolNode {
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
      isExported,
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

  function addDirectCall(call: StaticPascalDirectCall, caller: SymbolNode, callee: SymbolNode): void {
    const range = rangeFor(lineStarts, call.start, call.end);
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: call.targetName
      }),
      sourceId: caller.id,
      targetId: callee.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: call.targetName,
      evidence: {
        ruleId: "syntax.pascal.same-file.unique-zero-argument-bare-routine-call",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
      }
    });
  }

  function addProgramMainCall(call: StaticPascalProgramMainCall, callee: SymbolNode): void {
    const range = rangeFor(lineStarts, call.start, call.end);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: callee.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: call.targetName
      }),
      sourceId: fileNode.id,
      targetId: callee.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: call.targetName,
      evidence: {
        ruleId: "syntax.pascal.program-main.unique-prior-zero-argument-function-writeln-expression",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
      }
    });
  }

  if (sanitized.valid) {
    const sanitizedLines = linesFor(sanitized.text);
    const unitScope = directPascalUnitScope(sanitizedLines);
    const unitName = directPascalUnitName(sanitizedLines);
    const programName = directPascalProgramName(sanitizedLines);
    const routines = sanitized.hasConditionalCompilerDirective
      ? []
      : directPascalFileRoutines(
          sanitizedLines,
          collectDirectPascalRoutines(sanitizedLines),
          unitScope
        );
    const programBlock = directPascalProgramBlock(sanitizedLines, routines);
    const hasStableProjectSyntax =
      !sanitized.hasConditionalCompilerDirective &&
      !sanitized.hasMacroCompilerDirective &&
      !hasPascalCompilerIncludeDirective(input.sourceText);
    if (unitName !== null && unitScope !== null) {
      pascalUnits.push({
        symbolId: fileNode.id,
        filePath: input.filePath,
        name: unitName,
        kind: "unit",
        projectEligible: hasStableProjectSyntax,
        range: fileNode.range
      });
    } else if (programName !== null && programBlock !== null) {
      pascalUnits.push({
        symbolId: fileNode.id,
        filePath: input.filePath,
        name: programName,
        kind: "program",
        projectEligible: hasStableProjectSyntax,
        range: fileNode.range
      });
    }
    const implementationRoutineCounts = new Map<string, number>();
    for (const routine of routines) {
      const normalizedName = routine.name.toLowerCase();
      implementationRoutineCounts.set(normalizedName, (implementationRoutineCounts.get(normalizedName) ?? 0) + 1);
    }
    const routinesByName = new Map<string, Array<{ routine: StaticPascalRoutine; symbol: SymbolNode }>>();
    for (const routine of routines) {
      const normalizedName = routine.name.toLowerCase();
      const isExported =
        !hasPascalUnitDeclaration(sanitizedLines) ||
        (unitScope?.interfaceRoutineCounts.get(normalizedName) === 1 &&
          implementationRoutineCounts.get(normalizedName) === 1);
      const symbol = addRoutine(routine, isExported);
      pascalRoutines.push({
        symbolId: symbol.id,
        filePath: input.filePath,
        unitName,
        name: routine.name,
        kind: routine.kind,
        parameterCount: routine.hasZeroParameters ? 0 : null,
        projectEligible:
          hasStableProjectSyntax &&
          unitName !== null &&
          unitScope !== null &&
          isExported &&
          !routine.name.includes(".") &&
          routine.hasZeroParameters,
        range: symbol.range
      });
      const existing = routinesByName.get(normalizedName) ?? [];
      existing.push({ routine, symbol });
      routinesByName.set(normalizedName, existing);
    }

    for (const call of collectDirectPascalCalls(
      sanitized.text,
      sanitizedLines,
      routines,
      hasPascalCompilerIncludeDirective(input.sourceText),
      sanitized.hasMacroCompilerDirective
    )) {
      const callerCandidates = (routinesByName.get(call.caller.name.toLowerCase()) ?? []).filter(
        (candidate) => !candidate.routine.name.includes(".")
      );
      const targetCandidates = (routinesByName.get(call.targetName.toLowerCase()) ?? []).filter(
        (candidate) => !candidate.routine.name.includes(".") && candidate.routine.end < call.caller.start
      );
      if (callerCandidates.length === 1 && targetCandidates.length === 1) {
        const caller = callerCandidates[0];
        const target = targetCandidates[0];
        if (caller !== undefined && target !== undefined) {
          addDirectCall(call, caller.symbol, target.symbol);
        }
      }
    }

    for (const call of directPascalProgramMainRoutineCalls(
      sanitized.text,
      sanitizedLines,
      routines,
      programBlock,
      hasPascalCompilerIncludeDirective(input.sourceText),
      sanitized.hasConditionalCompilerDirective,
      sanitized.hasMacroCompilerDirective
    )) {
      pascalCalls.push({
        sourceId: fileNode.id,
        filePath: input.filePath,
        referenceName: call.targetName,
        argumentCount: 0,
        usesUnitNames: call.usesUnitNames,
        range: rangeFor(lineStarts, call.start, call.end)
      });
    }

    const programMainCall = directPascalProgramMainCall(
      sanitized.text,
      sanitizedLines,
      routines,
      hasPascalCompilerIncludeDirective(input.sourceText),
      sanitized.hasConditionalCompilerDirective,
      sanitized.hasMacroCompilerDirective
    );
    if (programMainCall !== null) {
      const candidates = (routinesByName.get(programMainCall.targetName.toLowerCase()) ?? []).filter(
        (candidate) => candidate.routine.start === programMainCall.target.start
      );
      if (candidates.length === 1) {
        const candidate = candidates[0];
        if (candidate !== undefined) {
          addProgramMainCall(programMainCall, candidate.symbol);
        }
      }
    }

    for (const routeFact of collectDirectHorseRoutes(
      linesFor(input.sourceText),
      sanitizedLines,
      routines,
      hasPascalCompilerIncludeDirective(input.sourceText),
      sanitized.hasMacroCompilerDirective
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
    reExportBindings: [],
    pascalFacts: {
      units: pascalUnits,
      routines: pascalRoutines,
      calls: pascalCalls
    }
  };
}
