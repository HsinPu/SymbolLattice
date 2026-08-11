import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface FortranExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "fortran";
}

type FortranUnitKind = "module" | "program" | "subroutine" | "function";
type FortranSkippedBlockKind = "interface" | "submodule" | "type";

interface FortranLine {
  readonly code: string;
  readonly codeStart: number;
  readonly codeEnd: number;
}

interface FortranUnit {
  readonly kind: FortranUnitKind;
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface FortranDirectCall {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface FortranContainedProcedure extends FortranUnit {
  readonly parameterNames: ReadonlySet<string>;
  readonly blockedCallNames: ReadonlySet<string>;
  readonly hasWildcardUse: boolean;
  readonly calls: readonly FortranDirectCall[];
  readonly conditional: boolean;
}

interface FortranModuleMembers {
  readonly module: FortranUnit;
  readonly members: readonly FortranContainedProcedure[];
  readonly importedNames: ReadonlySet<string>;
  readonly hasWildcardUse: boolean;
  readonly genericNames: ReadonlySet<string>;
}

const FIXED_FORM_EXTENSIONS: ReadonlySet<string> = new Set([".f", ".for", ".f77"]);
const PREPROCESSING_PRONE_FORTRAN_EXTENSIONS: ReadonlySet<string> = new Set([
  ".F",
  ".FOR",
  ".F77",
  ".F90",
  ".F95",
  ".F03",
  ".F08",
  ".F18"
]);
const FORTRAN_IDENTIFIER = "[A-Za-z][A-Za-z0-9_]*";
const FORTRAN_INTRINSIC_SUBROUTINES: ReadonlySet<string> = new Set([
  "atomic_add",
  "atomic_and",
  "atomic_cas",
  "atomic_define",
  "atomic_fetch_add",
  "atomic_fetch_and",
  "atomic_fetch_or",
  "atomic_fetch_xor",
  "atomic_or",
  "atomic_ref",
  "atomic_xor",
  "co_broadcast",
  "co_max",
  "co_min",
  "co_reduce",
  "cpu_time",
  "date_and_time",
  "event_query",
  "execute_command_line",
  "get_command",
  "get_command_argument",
  "get_environment_variable",
  "move_alloc",
  "mvbits",
  "random_init",
  "random_number",
  "random_seed",
  "system_clock"
]);
const MODULE_START = new RegExp("^module\\s+(" + FORTRAN_IDENTIFIER + ")\\s*$", "iu");
const PROGRAM_START = new RegExp("^program\\s+(" + FORTRAN_IDENTIFIER + ")\\s*$", "iu");
const SUBROUTINE_START = new RegExp(
  "^(?:(?:recursive|pure|impure|elemental|non_recursive)\\s+)*subroutine\\s+(" +
    FORTRAN_IDENTIFIER +
    ")(?:\\s*\\([^()]*\\))?(?:\\s+bind\\s*\\([^()]*\\))?\\s*$",
  "iu"
);
const FUNCTION_START = new RegExp(
  "^(?:(?:recursive|pure|impure|elemental|non_recursive)\\s+)*(?:(?:(?:integer|real|logical|complex|character)(?:\\s*\\([^()]*\\))?|double\\s+precision)\\s+)?function\\s+(" +
    FORTRAN_IDENTIFIER +
    ")(?:\\s*\\([^()]*\\))?(?:\\s+result\\s*\\(\\s*" +
    FORTRAN_IDENTIFIER +
    "\\s*\\))?(?:\\s+bind\\s*\\([^()]*\\))?\\s*$",
  "iu"
);
const FORTRAN_CALL = new RegExp(
  "^call\\s+(" + FORTRAN_IDENTIFIER + ")(?:\\s*(\\(.*\\)))?\\s*$",
  "iu"
);
const FORTRAN_USE = new RegExp(
  "^use(?:\\s*,\\s*(?:intrinsic|non_intrinsic))?\\s*(?:::\\s*)?(" +
    FORTRAN_IDENTIFIER +
    ")(?:\\s*,\\s*only\\s*:\\s*(.+))?$",
  "iu"
);

function lineStartsFor(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === "\n") {
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
    if ((lineStarts[middle] ?? 0) <= offset) {
      lower = middle;
    } else {
      upper = middle;
    }
  }
  const lineStart = lineStarts[lower] ?? 0;
  return { line: lower + 1, column: offset - lineStart + 1 };
}

function rangeForSpan(lineStarts: readonly number[], start: number, end: number): SourceRange {
  return {
    start: positionFor(lineStarts, start),
    end: positionFor(lineStarts, end)
  };
}

function isFixedFormSource(filePath: string): boolean {
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return FIXED_FORM_EXTENSIONS.has(extension);
}

function isPreprocessingProneFortranSource(filePath: string): boolean {
  const extension = filePath.slice(filePath.lastIndexOf("."));
  return PREPROCESSING_PRONE_FORTRAN_EXTENSIONS.has(extension);
}

function stripFortranInlineComment(sourceText: string): string | null {
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (quote !== null) {
      if (character !== quote) {
        continue;
      }
      if (sourceText[index + 1] === quote) {
        index += 1;
        continue;
      }
      quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "!") {
      return sourceText.slice(0, index);
    }
  }
  return quote === null ? sourceText : null;
}

function normalizedFortranLine(
  rawLine: string,
  lineStart: number,
  fixedForm: boolean
): FortranLine | null {
  if (
    fixedForm &&
    (rawLine[0] === "c" || rawLine[0] === "C" || rawLine[0] === "*" || rawLine[0] === "!")
  ) {
    return { code: "", codeStart: lineStart, codeEnd: lineStart };
  }
  if (
    fixedForm &&
    rawLine.length > 5 &&
    rawLine[5] !== " " &&
    rawLine[5] !== "0" &&
    rawLine[5] !== "\t"
  ) {
    return null;
  }

  const sourceOffset = fixedForm ? Math.min(6, rawLine.length) : 0;
  const sourceField = fixedForm
    ? rawLine.slice(sourceOffset, 72)
    : rawLine.slice(sourceOffset);
  const commentFree = stripFortranInlineComment(sourceField);
  if (commentFree === null) {
    return null;
  }
  const firstContent = commentFree.search(/\S/u);
  if (firstContent < 0) {
    const emptyOffset = lineStart + sourceOffset + commentFree.length;
    return { code: "", codeStart: emptyOffset, codeEnd: emptyOffset };
  }
  const trailingContent = commentFree.replace(/[ \t]*$/u, "").length;
  const code = commentFree.slice(firstContent, trailingContent);
  return {
    code,
    codeStart: lineStart + sourceOffset + firstContent,
    codeEnd: lineStart + sourceOffset + trailingContent
  };
}

function fortranLines(sourceText: string, fixedForm: boolean): readonly FortranLine[] | null {
  const lines: FortranLine[] = [];
  let lineStart = 0;
  while (lineStart < sourceText.length) {
    const newline = sourceText.indexOf("\n", lineStart);
    const lineLimit = newline < 0 ? sourceText.length : newline;
    const lineEnd =
      lineLimit > lineStart && sourceText[lineLimit - 1] === "\r" ? lineLimit - 1 : lineLimit;
    const normalized = normalizedFortranLine(
      sourceText.slice(lineStart, lineEnd),
      lineStart,
      fixedForm
    );
    if (normalized === null) {
      return null;
    }
    lines.push(normalized);
    if (newline < 0) {
      break;
    }
    lineStart = newline + 1;
  }
  return lines;
}

function directFortranUnit(line: FortranLine): Omit<FortranUnit, "start" | "end"> | null {
  const module = MODULE_START.exec(line.code);
  if (module !== null) {
    return { kind: "module", name: module[1] ?? "" };
  }
  const program = PROGRAM_START.exec(line.code);
  if (program !== null) {
    return { kind: "program", name: program[1] ?? "" };
  }
  const subroutine = SUBROUTINE_START.exec(line.code);
  if (subroutine !== null) {
    return { kind: "subroutine", name: subroutine[1] ?? "" };
  }
  const fn = FUNCTION_START.exec(line.code);
  return fn === null ? null : { kind: "function", name: fn[1] ?? "" };
}

function skippedBlockKind(line: FortranLine): FortranSkippedBlockKind | null {
  if (/^(?:abstract\s+)?interface\b/iu.test(line.code)) {
    return "interface";
  }
  if (/^submodule\b/iu.test(line.code)) {
    return "submodule";
  }
  return /^type(?:\s*,[^:]*)?(?:\s*::\s*|\s+)[A-Za-z][A-Za-z0-9_]*\s*$/iu.test(line.code)
    ? "type"
    : null;
}

function matchingSkippedBlockEnd(
  lines: readonly FortranLine[],
  start: number,
  kind: FortranSkippedBlockKind
): number | null {
  const ending = new RegExp(
    "^end\\s+" + kind + "(?:\\s+" + FORTRAN_IDENTIFIER + ")?\\s*$",
    "iu"
  );
  for (let index = start + 1; index < lines.length; index += 1) {
    if (ending.test(lines[index]?.code ?? "")) {
      return index;
    }
  }
  return null;
}

function directUnitEnd(
  line: FortranLine,
  kind: FortranUnitKind,
  expectedName: string
): "match" | "wrong-name" | "none" {
  const ending = new RegExp(
    "^end\\s+" + kind + "(?:\\s+(" + FORTRAN_IDENTIFIER + "))?\\s*$",
    "iu"
  ).exec(line.code);
  if (ending === null) {
    return "none";
  }
  const declaredName = ending[1];
  return declaredName === undefined || declaredName.toLowerCase() === expectedName.toLowerCase()
    ? "match"
    : "wrong-name";
}

function matchingUnitEnd(
  lines: readonly FortranLine[],
  start: number,
  kind: FortranUnitKind,
  expectedName: string
): number | null {
  for (let index = start + 1; index < lines.length; ) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }
    const skipped = skippedBlockKind(line);
    if (skipped !== null) {
      const skippedEnd = matchingSkippedBlockEnd(lines, index, skipped);
      if (skippedEnd === null) {
        return null;
      }
      index = skippedEnd + 1;
      continue;
    }
    const ending = directUnitEnd(line, kind, expectedName);
    if (ending === "match") {
      return index;
    }
    if (ending === "wrong-name") {
      return null;
    }
    index += 1;
  }
  return null;
}

/**
 * Extracts complete direct Fortran program units from one physical-line source
 * form. A generic END statement and unsupported nested structure fail closed
 * rather than creating a guessed declaration; continued headers are not
 * recognized as declarations or calls.
 */
function staticFortranUnits(input: FortranExtractFileFactsInput): readonly FortranUnit[] | null {
  const lines = fortranLines(input.sourceText, isFixedFormSource(input.filePath));
  if (lines === null) {
    return null;
  }

  const units: FortranUnit[] = [];
  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }
    const skipped = skippedBlockKind(line);
    if (skipped !== null) {
      const skippedEnd = matchingSkippedBlockEnd(lines, index, skipped);
      if (skippedEnd === null) {
        return null;
      }
      index = skippedEnd + 1;
      continue;
    }
    const unit = directFortranUnit(line);
    if (unit === null) {
      index += 1;
      continue;
    }
    const endIndex = matchingUnitEnd(lines, index, unit.kind, unit.name);
    if (endIndex === null) {
      return null;
    }
    const endLine = lines[endIndex];
    if (endLine === undefined) {
      return null;
    }
    units.push({
      ...unit,
      start: line.codeStart,
      end: endLine.codeEnd
    });
    index = endIndex + 1;
  }
  return units;
}

function isBalancedFortranArguments(sourceText: string): boolean {
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character === undefined) {
      return false;
    }
    if (quote !== null) {
      if (character === quote) {
        if (sourceText[index + 1] === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    }
  }
  return quote === null && depth === 0;
}

function directFortranCalls(lines: readonly FortranLine[]): readonly FortranDirectCall[] | null {
  const calls: FortranDirectCall[] = [];
  for (const line of lines) {
    const match = FORTRAN_CALL.exec(line.code);
    if (match === null) {
      continue;
    }
    const name = match[1];
    const argumentsText = match[2];
    if (name === undefined || (argumentsText !== undefined && !isBalancedFortranArguments(argumentsText))) {
      return null;
    }
    const offset = line.code.indexOf(name);
    if (offset < 0) {
      return null;
    }
    calls.push({ name, start: line.codeStart + offset, end: line.codeStart + offset + name.length });
  }
  return calls;
}

function namesInFortranHeader(line: FortranLine): ReadonlySet<string> | null {
  const match = new RegExp(
    "\\b(?:subroutine|function)\\s+" + FORTRAN_IDENTIFIER + "\\s*\\(([^()]*)\\)",
    "iu"
  ).exec(line.code);
  if (match === null) {
    return new Set();
  }
  const parameters = match[1];
  if (parameters === undefined) {
    return null;
  }
  if (parameters.trim().length === 0) {
    return new Set();
  }
  const names = new Set<string>();
  for (const parameter of parameters.split(",")) {
    const name = parameter.trim();
    if (!new RegExp("^" + FORTRAN_IDENTIFIER + "$", "iu").test(name)) {
      return null;
    }
    names.add(name.toLowerCase());
  }
  return names;
}

function declaredFortranProcedureNames(lines: readonly FortranLine[]): Set<string> | null {
  const names = new Set<string>();
  for (const line of lines) {
    const match = /^(?:external|procedure)(?:\s*\([^)]*\))?(?:\s*,[^:]*)?\s*(?:::\s*)?(.+)$/iu.exec(
      line.code
    );
    if (match === null) {
      continue;
    }
    const declarations = match[1];
    if (declarations === undefined) {
      return null;
    }
    for (const declaration of declarations.split(",")) {
      const name = declaration.split("=>")[0]?.trim();
      if (name === undefined || !new RegExp("^" + FORTRAN_IDENTIFIER + "$", "iu").test(name)) {
        return null;
      }
      names.add(name.toLowerCase());
    }
  }
  return names;
}

function localFortranCallBlockers(
  lines: readonly FortranLine[]
): { readonly names: ReadonlySet<string>; readonly hasWildcardUse: boolean } | null {
  const names = declaredFortranProcedureNames(lines);
  if (names === null) {
    return null;
  }
  let hasWildcardUse = false;
  for (const line of lines) {
    const imported = importedFortranNames(line);
    if (imported === null) {
      return null;
    }
    if (imported === "wildcard") {
      hasWildcardUse = true;
    } else {
      for (const name of imported) {
        names.add(name);
      }
    }
    const genericName = genericFortranInterfaceName(line);
    if (genericName !== null) {
      names.add(genericName);
    }
    if (/^(?:abstract\s+)?interface\b/iu.test(line.code)) {
      hasWildcardUse = true;
    }
  }
  return { names, hasWildcardUse };
}

function importedFortranNames(line: FortranLine): readonly string[] | "wildcard" | null {
  if (!/^use\b/iu.test(line.code)) {
    return [];
  }
  const match = FORTRAN_USE.exec(line.code);
  const onlyList = match?.[2];
  if (match === null || onlyList === undefined) {
    return "wildcard";
  }
  const names: string[] = [];
  for (const entry of onlyList.split(",")) {
    const localName = entry.split("=>")[0]?.trim();
    if (localName === undefined || !new RegExp("^" + FORTRAN_IDENTIFIER + "$", "iu").test(localName)) {
      return null;
    }
    names.push(localName.toLowerCase());
  }
  return names;
}

function preprocessorDepths(lines: readonly FortranLine[]): readonly number[] | null {
  const depths: number[] = [];
  let depth = 0;
  for (const line of lines) {
    const code = line.code;
    if (/^#\s*(?:if|ifdef|ifndef)\b/iu.test(code)) {
      depths.push(depth);
      depth += 1;
      continue;
    }
    if (/^#\s*endif\b/iu.test(code)) {
      if (depth === 0) {
        return null;
      }
      depth -= 1;
      depths.push(depth);
      continue;
    }
    depths.push(depth);
  }
  return depth === 0 ? depths : null;
}

function isAtFortranPreprocessorDepthZero(
  lines: readonly FortranLine[],
  depths: readonly number[],
  offset: number
): boolean {
  const lineIndex = lines.findIndex(
    (line) => line.codeStart <= offset && offset < line.codeEnd
  );
  return lineIndex >= 0 && depths[lineIndex] === 0;
}

function hasUnsafeFortranPreprocessing(
  lines: readonly FortranLine[],
  relevantNames: ReadonlySet<string>
): boolean {
  const conditionalStack: boolean[] = [];
  const locallyDefinedMacros = new Set<string>();
  for (const line of lines) {
    if (!/^#/u.test(line.code)) {
      continue;
    }
    const directive = /^#\s*([A-Za-z]+)\b(.*)$/u.exec(line.code);
    const name = directive?.[1]?.toLowerCase();
    const suffix = directive?.[2]?.trim() ?? "";
    if (name === undefined) {
      return true;
    }
    if (name === "if" || name === "ifdef" || name === "ifndef") {
      if (suffix.length === 0) {
        return true;
      }
      conditionalStack.push(false);
      continue;
    }
    if (name === "elif") {
      const elseSeen = conditionalStack.at(-1);
      if (elseSeen === undefined || elseSeen || suffix.length === 0) {
        return true;
      }
      continue;
    }
    if (name === "else") {
      const elseSeen = conditionalStack.at(-1);
      if (elseSeen === undefined || elseSeen || suffix.length > 0) {
        return true;
      }
      conditionalStack[conditionalStack.length - 1] = true;
      continue;
    }
    if (name === "endif") {
      if (conditionalStack.pop() === undefined || suffix.length > 0) {
        return true;
      }
      continue;
    }
    if (name === "define") {
      const macro = new RegExp("^(" + FORTRAN_IDENTIFIER + ")(?:\\s|$)", "u").exec(suffix)?.[1];
      if (
        macro === undefined ||
        conditionalStack.length === 0 ||
        relevantNames.has(macro.toLowerCase())
      ) {
        return true;
      }
      locallyDefinedMacros.add(macro);
      continue;
    }
    return true;
  }
  if (conditionalStack.length !== 0) {
    return true;
  }
  for (const macro of locallyDefinedMacros) {
    const escapedMacro = macro.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const token = new RegExp("(?:^|[^A-Za-z0-9_])" + escapedMacro + "(?=$|[^A-Za-z0-9_])", "iu");
    if (lines.some((line) => !/^#/u.test(line.code) && token.test(line.code))) {
      return true;
    }
  }
  return false;
}

function genericFortranInterfaceName(line: FortranLine): string | null {
  const match = /^interface\s+("?)([^\s]+)\1\s*$/iu.exec(line.code);
  if (match === null) {
    return null;
  }
  const name = match[2];
  return name !== undefined && new RegExp("^" + FORTRAN_IDENTIFIER + "$", "iu").test(name)
    ? name.toLowerCase()
    : null;
}

function staticFortranModuleMembers(
  lines: readonly FortranLine[],
  units: readonly FortranUnit[]
): readonly FortranModuleMembers[] | null {
  if (lines.some((line) => /^submodule\b/iu.test(line.code))) {
    return [];
  }
  const depths = preprocessorDepths(lines);
  if (depths === null) {
    return null;
  }
  const modules = units.filter((unit) => unit.kind === "module");
  if (modules.length !== 1 || units.length !== 1) {
    return [];
  }
  const module = modules[0];
  if (module === undefined) {
    return null;
  }
  const startIndex = lines.findIndex((line) => line.codeStart === module.start);
  const endIndex = lines.findIndex((line) => line.codeEnd === module.end);
  if (startIndex < 0 || endIndex <= startIndex) {
    return null;
  }

  const importedNames = new Set<string>();
  const genericNames = new Set<string>();
  const members: FortranContainedProcedure[] = [];
  let hasWildcardUse = false;
  let procedurePart = false;
  for (let index = startIndex + 1; index < endIndex; ) {
    const line = lines[index];
    const depth = depths[index];
    if (line === undefined || depth === undefined) {
      return null;
    }
    if (!procedurePart) {
      if (/^contains\s*$/iu.test(line.code)) {
        procedurePart = true;
        index += 1;
        continue;
      }
      const imported = importedFortranNames(line);
      if (imported === null) {
        return null;
      }
      if (imported === "wildcard") {
        hasWildcardUse = true;
      } else {
        for (const name of imported) {
          importedNames.add(name);
        }
      }
      const skipped = skippedBlockKind(line);
      if (skipped !== null) {
        const skippedEnd = matchingSkippedBlockEnd(lines, index, skipped);
        if (skippedEnd === null || skippedEnd >= endIndex) {
          return null;
        }
        if (skipped === "interface") {
          const genericName = genericFortranInterfaceName(line);
          if (genericName !== null) {
            genericNames.add(genericName);
          }
        } else {
          const typeBoundNames = declaredFortranProcedureNames(lines.slice(index + 1, skippedEnd));
          if (typeBoundNames === null) {
            return null;
          }
          for (const name of typeBoundNames) {
            genericNames.add(name);
          }
        }
        index = skippedEnd + 1;
        continue;
      }
      if (directFortranUnit(line) !== null || /^end\b/iu.test(line.code)) {
        return null;
      }
      index += 1;
      continue;
    }

    if (line.code.length === 0) {
      index += 1;
      continue;
    }
    if (/^#/u.test(line.code)) {
      index += 1;
      continue;
    }
    if (/^(?:contains|interface|type\b|submodule\b)/iu.test(line.code)) {
      return null;
    }
    const unit = directFortranUnit(line);
    if (unit === null || (unit.kind !== "subroutine" && unit.kind !== "function")) {
      return null;
    }
    const memberEndIndex = matchingUnitEnd(lines, index, unit.kind, unit.name);
    if (memberEndIndex === null || memberEndIndex >= endIndex) {
      return null;
    }
    const endLine = lines[memberEndIndex];
    if (endLine === undefined) {
      return null;
    }
    const memberLines = lines.slice(index, memberEndIndex + 1);
    const parameterNames = namesInFortranHeader(line);
    const blockers = localFortranCallBlockers(memberLines.slice(1, -1));
    const calls = directFortranCalls(memberLines.slice(1, -1));
    if (parameterNames === null || blockers === null || calls === null) {
      return null;
    }
    const conditional = memberLines.some((_, memberLineIndex) => {
      const originalIndex = index + memberLineIndex;
      return (depths[originalIndex] ?? 1) > 0;
    });
    members.push({
      kind: unit.kind,
      name: unit.name,
      start: line.codeStart,
      end: endLine.codeEnd,
      parameterNames,
      blockedCallNames: blockers.names,
      hasWildcardUse: blockers.hasWildcardUse,
      calls,
      conditional
    });
    index = memberEndIndex + 1;
  }
  return procedurePart
    ? [
        {
          module,
          members,
          importedNames,
          hasWildcardUse,
          genericNames
        }
      ]
    : [];
}

function symbolKindFor(unit: FortranUnit): "module" | "function" {
  return unit.kind === "module" || unit.kind === "program" ? "module" : "function";
}

function isZeroArgumentFortranSubroutineHeader(line: FortranLine, expectedName: string): boolean {
  const escapedName = expectedName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    "^(?:(?:recursive|pure|impure|elemental|non_recursive)\\s+)*subroutine\\s+" +
      escapedName +
      "\\s*\\(\\s*\\)(?:\\s+bind\\s*\\([^()]*\\))?\\s*$",
    "iu"
  ).test(line.code);
}

/**
 * This deliberately recognizes only an otherwise declaration-free subroutine
 * body containing one bare zero-argument CALL. That leaves procedure
 * variables, interfaces, host association, and arbitrary local bindings out
 * of the exact-edge claim.
 */
function directFortranCall(
  unit: FortranUnit,
  lines: readonly FortranLine[]
): FortranDirectCall | null {
  const unitLines = lines.filter(
    (line) => line.codeStart >= unit.start && line.codeEnd <= unit.end && line.code.length > 0
  );
  const header = unitLines[0];
  const ending = unitLines.at(-1);
  if (
    header === undefined ||
    ending === undefined ||
    !isZeroArgumentFortranSubroutineHeader(header, unit.name) ||
    directUnitEnd(ending, unit.kind, unit.name) !== "match"
  ) {
    return null;
  }
  const body = unitLines.slice(1, -1).filter((line) => !/^implicit\s+none$/iu.test(line.code));
  if (body.length !== 1) {
    return null;
  }
  const line = body[0];
  if (line === undefined) {
    return null;
  }
  const match = new RegExp("^call\\s+(" + FORTRAN_IDENTIFIER + ")\\s*\\(\\s*\\)\\s*$", "iu").exec(
    line.code
  );
  const name = match?.[1];
  if (match === null || name === undefined) {
    return null;
  }
  const offset = line.code.indexOf(name);
  return offset < 0
    ? null
    : { name, start: line.codeStart + offset, end: line.codeStart + offset + name.length };
}

function permitsFortranDirectCalls(lines: readonly FortranLine[]): boolean {
  return !lines.some((line) =>
    /^(?:use|external|procedure|interface|associate|select\s+type|contains)\b/iu.test(line.code)
  );
}

/**
 * Emits source-ranged Fortran program units without claiming full Fortran
 * parsing, generic END recovery, module-member analysis, or runtime behavior.
 */
export function extractFortranFileFacts(input: FortranExtractFileFactsInput): ArtifactFacts {
  const lineStarts = lineStartsFor(input.sourceText);
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
    range: rangeForSpan(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const symbolsByUnit = new Map<FortranUnit, SymbolNode>();
  const symbolsByContainedProcedure = new Map<FortranContainedProcedure, SymbolNode>();

  function addSymbol(inputSymbol: {
    readonly name: string;
    readonly kind: "module" | "function";
    readonly qualifiedName: string;
    readonly range: SourceRange;
    readonly containmentRuleId: string;
    readonly container?: SymbolNode;
  }): SymbolNode {
    const identity = inputSymbol.qualifiedName + "\u0000" + inputSymbol.kind;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName: inputSymbol.qualifiedName,
        kind: inputSymbol.kind,
        declarationOrdinal
      }),
      name: inputSymbol.name,
      qualifiedName: inputSymbol.qualifiedName,
      kind: inputSymbol.kind,
      filePath: input.filePath,
      range: inputSymbol.range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    const container = inputSymbol.container ?? fileNode;
    edges.push({
      id: createEdgeId({
        sourceId: container.id,
        targetId: symbol.id,
        kind: "contains",
        line: inputSymbol.range.start.line,
        column: inputSymbol.range.start.column,
        referenceName: symbol.name
      }),
      sourceId: container.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range: inputSymbol.range,
      resolution: "exact",
      confidence: 1,
      referenceName: symbol.name,
      evidence: {
        ruleId: inputSymbol.containmentRuleId,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
    return symbol;
  }

  const units = staticFortranUnits(input) ?? [];
  for (const unit of units) {
    const symbol = addSymbol({
      name: unit.name,
      kind: symbolKindFor(unit),
      qualifiedName: input.filePath + "#" + unit.kind + ":" + unit.name,
      range: rangeForSpan(lineStarts, unit.start, unit.end),
      containmentRuleId: "language.fortran." + unit.kind + ".direct-program-unit"
    });
    symbolsByUnit.set(unit, symbol);
  }

  const lines = fortranLines(input.sourceText, isFixedFormSource(input.filePath));
  const conditionalDepths = lines === null ? null : preprocessorDepths(lines);
  const moduleMembers = lines === null ? null : staticFortranModuleMembers(lines, units);
  const exactCallNames = new Set(units.map((unit) => unit.name.toLowerCase()));
  if (moduleMembers !== null) {
    for (const moduleMemberGroup of moduleMembers) {
      for (const member of moduleMemberGroup.members) {
        exactCallNames.add(member.name.toLowerCase());
        for (const call of member.calls) {
          exactCallNames.add(call.name.toLowerCase());
        }
      }
    }
  }
  if (lines !== null) {
    for (const unit of units) {
      const call = directFortranCall(unit, lines);
      if (call !== null) {
        exactCallNames.add(call.name.toLowerCase());
      }
    }
  }
  const exactCallsPermitted =
    lines !== null &&
    conditionalDepths !== null &&
    !isPreprocessingProneFortranSource(input.filePath) &&
    !hasUnsafeFortranPreprocessing(lines, exactCallNames);
  if (moduleMembers !== null) {
    for (const moduleMemberGroup of moduleMembers) {
      const moduleSymbol = symbolsByUnit.get(moduleMemberGroup.module);
      if (moduleSymbol === undefined) {
        continue;
      }
      for (const member of moduleMemberGroup.members) {
        const symbol = addSymbol({
          name: member.name,
          kind: "function",
          qualifiedName: moduleMemberGroup.module.name + "::" + member.name,
          range: rangeForSpan(lineStarts, member.start, member.end),
          containmentRuleId: "language.fortran.module-contained-procedure",
          container: moduleSymbol
        });
        symbolsByContainedProcedure.set(member, symbol);
      }
    }
    for (const moduleMemberGroup of moduleMembers) {
      const memberCounts = new Map<string, number>();
      for (const member of moduleMemberGroup.members) {
        const name = member.name.toLowerCase();
        memberCounts.set(name, (memberCounts.get(name) ?? 0) + 1);
      }
      for (const callerUnit of moduleMemberGroup.members) {
        if (callerUnit.conditional) {
          continue;
        }
        const caller = symbolsByContainedProcedure.get(callerUnit);
        if (caller === undefined) {
          continue;
        }
        for (const call of callerUnit.calls) {
          const callName = call.name.toLowerCase();
          if (
            FORTRAN_INTRINSIC_SUBROUTINES.has(callName) ||
            !exactCallsPermitted ||
            moduleMemberGroup.hasWildcardUse ||
            moduleMemberGroup.importedNames.has(callName) ||
            moduleMemberGroup.genericNames.has(callName) ||
            callerUnit.hasWildcardUse ||
            callerUnit.parameterNames.has(callName) ||
            callerUnit.blockedCallNames.has(callName) ||
            memberCounts.get(callName) !== 1
          ) {
            continue;
          }
          const candidates = moduleMemberGroup.members.filter(
            (member) =>
              member.kind === "subroutine" &&
              !member.conditional &&
              member.name.toLowerCase() === callName
          );
          const targetUnit = candidates[0];
          if (candidates.length !== 1 || targetUnit === undefined) {
            continue;
          }
          const target = symbolsByContainedProcedure.get(targetUnit);
          if (target === undefined) {
            continue;
          }
          const range = rangeForSpan(lineStarts, call.start, call.end);
          edges.push({
            id: createEdgeId({
              sourceId: caller.id,
              targetId: target.id,
              kind: "calls",
              line: range.start.line,
              column: range.start.column,
              referenceName: call.name
            }),
            sourceId: caller.id,
            targetId: target.id,
            kind: "calls",
            filePath: input.filePath,
            range,
            resolution: "exact",
            confidence: 1,
            referenceName: call.name,
            evidence: {
              ruleId: "syntax.fortran.same-module.unique-contained-subroutine-call",
              stage: "syntax",
              candidateSymbolIds: [target.id]
            }
          });
        }
      }
    }
  }
  if (
    lines !== null &&
    conditionalDepths !== null &&
    exactCallsPermitted &&
    permitsFortranDirectCalls(lines)
  ) {
    const subroutines = units.filter((unit) => unit.kind === "subroutine");
    for (const callerUnit of subroutines) {
      const call = directFortranCall(callerUnit, lines);
      if (
        call === null ||
        FORTRAN_INTRINSIC_SUBROUTINES.has(call.name.toLowerCase()) ||
        !isAtFortranPreprocessorDepthZero(lines, conditionalDepths, callerUnit.start) ||
        !isAtFortranPreprocessorDepthZero(lines, conditionalDepths, call.start)
      ) {
        continue;
      }
      const candidates = subroutines.filter(
        (unit) =>
          unit.name.toLowerCase() === call.name.toLowerCase() &&
          isAtFortranPreprocessorDepthZero(lines, conditionalDepths, unit.start) &&
          isZeroArgumentFortranSubroutineHeader(
            lines.find((line) => line.codeStart === unit.start) ?? { code: "", codeStart: 0, codeEnd: 0 },
            unit.name
          )
      );
      if (candidates.length !== 1) {
        continue;
      }
      const targetUnit = candidates[0];
      const caller = symbolsByUnit.get(callerUnit);
      const target = targetUnit === undefined ? undefined : symbolsByUnit.get(targetUnit);
      if (caller === undefined || target === undefined) {
        continue;
      }
      const range = rangeForSpan(lineStarts, call.start, call.end);
      edges.push({
        id: createEdgeId({
          sourceId: caller.id,
          targetId: target.id,
          kind: "calls",
          line: range.start.line,
          column: range.start.column,
          referenceName: call.name
        }),
        sourceId: caller.id,
        targetId: target.id,
        kind: "calls",
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName: call.name,
        evidence: {
          ruleId: "syntax.fortran.same-file.unique-zero-argument-subroutine-call",
          stage: "syntax",
          candidateSymbolIds: [target.id]
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
