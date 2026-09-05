import {
  createEdgeId,
  createSymbolId,
  type AdaProjectCallFact,
  type AdaProjectPackageUnitFact,
  type AdaProjectProcedureFact,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface AdaExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "ada";
}

type AdaUnitKind = "package" | "package-body" | "procedure" | "function";

interface AdaLine {
  readonly code: string;
  readonly codeStart: number;
  readonly codeEnd: number;
}

interface AdaHeader {
  readonly kind: AdaUnitKind;
  readonly name: string;
  readonly nameStart: number;
  readonly nameEnd: number;
  /** Null means the simple profile grammar could not prove a fixed arity. */
  readonly parameterCount: number | null;
  readonly requiresNamedEnd: boolean;
}

interface AdaUnit {
  readonly kind: AdaUnitKind;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly headerStart: number;
  readonly headerEnd: number;
  readonly nameStart: number;
  readonly nameEnd: number;
  readonly parameterCount: number | null;
  readonly endNameStart?: number;
  readonly endNameEnd?: number;
}

interface AdaNamedEnd {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface AdaDirectCall {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly arity: number;
}

const ADA_NAME = "[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)*";
const ADA_IDENTIFIER = /^[A-Za-z](?:[A-Za-z0-9]|_[A-Za-z0-9])*$/u;
const ADA_RESERVED_WORDS = new Set([
  "abort",
  "abs",
  "abstract",
  "accept",
  "access",
  "aliased",
  "all",
  "and",
  "array",
  "at",
  "begin",
  "body",
  "case",
  "constant",
  "declare",
  "delay",
  "delta",
  "digits",
  "do",
  "else",
  "elsif",
  "end",
  "entry",
  "exception",
  "exit",
  "for",
  "function",
  "generic",
  "goto",
  "if",
  "in",
  "interface",
  "is",
  "limited",
  "loop",
  "mod",
  "new",
  "not",
  "null",
  "of",
  "or",
  "others",
  "out",
  "overriding",
  "package",
  "parallel",
  "pragma",
  "private",
  "procedure",
  "protected",
  "raise",
  "range",
  "record",
  "rem",
  "renames",
  "requeue",
  "return",
  "reverse",
  "select",
  "separate",
  "some",
  "subtype",
  "synchronized",
  "tagged",
  "task",
  "terminate",
  "then",
  "type",
  "until",
  "use",
  "when",
  "while",
  "with",
  "xor"
]);
const PACKAGE_BODY_START = new RegExp(
  "^(?:private\\s+)?package\\s+body\\s+(" + ADA_NAME + ")\\s+is\\s*$",
  "iu"
);
const PACKAGE_START = new RegExp(
  "^(?:private\\s+)?package\\s+(" + ADA_NAME + ")\\s+is\\s*$",
  "iu"
);
const PROCEDURE_BODY_START = new RegExp(
  "^procedure\\s+(" + ADA_NAME + ")(?:\\s*\\([^()]*\\))?\\s+is\\s*$",
  "iu"
);
const PROCEDURE_DECLARATION = new RegExp(
  "^procedure\\s+(" + ADA_NAME + ")(?:\\s*\\([^()]*\\))?\\s*;\\s*$",
  "iu"
);
const FUNCTION_BODY_START = new RegExp(
  "^function\\s+(" +
    ADA_NAME +
    ")(?:\\s*\\([^()]*\\))?\\s+return\\s+" +
    ADA_NAME +
    "\\s+is\\s*$",
  "iu"
);
const FUNCTION_DECLARATION = new RegExp(
  "^function\\s+(" +
    ADA_NAME +
    ")(?:\\s*\\([^()]*\\))?\\s+return\\s+" +
    ADA_NAME +
    "\\s*;\\s*$",
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

function normalizedLegalAdaIdentifier(value: string): string | null {
  const normalized = value.toLowerCase();
  return ADA_IDENTIFIER.test(value) && !ADA_RESERVED_WORDS.has(normalized) ? normalized : null;
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

/**
 * Ada strings use doubled double quotes to escape a quote. An unterminated
 * string makes lexical comment stripping unsafe, so extraction fails closed.
 */
function stripAdaInlineComment(sourceText: string): string | null {
  let inString = false;
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (inString) {
      if (character !== '"') {
        continue;
      }
      if (sourceText[index + 1] === '"') {
        index += 1;
        continue;
      }
      inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "-" && sourceText[index + 1] === "-") {
      return sourceText.slice(0, index);
    }
  }
  return inString ? null : sourceText;
}

function normalizedAdaLine(rawLine: string, lineStart: number): AdaLine | null {
  const commentFree = stripAdaInlineComment(rawLine);
  if (commentFree === null) {
    return null;
  }
  const firstContent = commentFree.search(/\S/u);
  if (firstContent < 0) {
    const emptyOffset = lineStart + commentFree.length;
    return { code: "", codeStart: emptyOffset, codeEnd: emptyOffset };
  }
  const trailingContent = commentFree.replace(/[ \t]*$/u, "").length;
  return {
    code: commentFree.slice(firstContent, trailingContent),
    codeStart: lineStart + firstContent,
    codeEnd: lineStart + trailingContent
  };
}

function adaLines(sourceText: string): readonly AdaLine[] | null {
  const lines: AdaLine[] = [];
  let lineStart = 0;
  while (lineStart < sourceText.length) {
    const newline = sourceText.indexOf("\n", lineStart);
    const lineLimit = newline < 0 ? sourceText.length : newline;
    const lineEnd =
      lineLimit > lineStart && sourceText[lineLimit - 1] === "\r" ? lineLimit - 1 : lineLimit;
    const normalized = normalizedAdaLine(sourceText.slice(lineStart, lineEnd), lineStart);
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

function headerFromMatch(
  line: AdaLine,
  kind: AdaUnitKind,
  match: RegExpExecArray,
  prefix: RegExp,
  requiresNamedEnd: boolean
): AdaHeader | null {
  const name = match[1];
  const prefixMatch = prefix.exec(line.code);
  if (name === undefined || prefixMatch === null) {
    return null;
  }
  const nameStart = line.codeStart + prefixMatch[0].length;
  const suffix = line.code.slice(prefixMatch[0].length + name.length);
  const open = suffix.indexOf("(");
  let parameterCount: number | null = 0;
  if (open >= 0) {
    const close = suffix.lastIndexOf(")");
    if (close <= open) {
      parameterCount = null;
    } else {
      const profile = suffix.slice(open + 1, close).trim();
      if (profile.length === 0) {
        parameterCount = 0;
      } else if (/[()]/u.test(profile) || /:=/u.test(profile)) {
        parameterCount = null;
      } else {
        const groups = profile.split(";").map((group) => group.trim());
        parameterCount = 0;
        for (const group of groups) {
          const colon = group.indexOf(":");
          const names = colon < 0 ? "" : group.slice(0, colon).trim();
          if (
            colon <= 0 ||
            names.length === 0 ||
            names.split(",").some((candidate) => normalizedLegalAdaIdentifier(candidate.trim()) === null)
          ) {
            parameterCount = null;
            break;
          }
          parameterCount += names.split(",").length;
        }
      }
    }
  }
  return {
    kind,
    name,
    nameStart,
    nameEnd: nameStart + name.length,
    parameterCount,
    requiresNamedEnd
  };
}

function directAdaHeader(line: AdaLine): AdaHeader | null {
  const packageBody = PACKAGE_BODY_START.exec(line.code);
  if (packageBody !== null) {
    return headerFromMatch(
      line,
      "package-body",
      packageBody,
      /^(?:private\s+)?package\s+body\s+/iu,
      true
    );
  }
  const pkg = PACKAGE_START.exec(line.code);
  if (pkg !== null) {
    return headerFromMatch(line, "package", pkg, /^(?:private\s+)?package\s+/iu, true);
  }
  const procedureBody = PROCEDURE_BODY_START.exec(line.code);
  if (procedureBody !== null) {
    return headerFromMatch(line, "procedure", procedureBody, /^procedure\s+/iu, true);
  }
  const fnBody = FUNCTION_BODY_START.exec(line.code);
  if (fnBody !== null) {
    return headerFromMatch(line, "function", fnBody, /^function\s+/iu, true);
  }
  const procedureDeclaration = PROCEDURE_DECLARATION.exec(line.code);
  if (procedureDeclaration !== null) {
    return headerFromMatch(
      line,
      "procedure",
      procedureDeclaration,
      /^procedure\s+/iu,
      false
    );
  }
  const functionDeclaration = FUNCTION_DECLARATION.exec(line.code);
  return functionDeclaration === null
    ? null
    : headerFromMatch(line, "function", functionDeclaration, /^function\s+/iu, false);
}

function namedAdaEnd(line: AdaLine): AdaNamedEnd | null {
  const ending = new RegExp("^end\\s+(" + ADA_NAME + ")\\s*;\\s*$", "iu").exec(line.code);
  const name = ending?.[1];
  const prefix = /^end\s+/iu.exec(line.code);
  if (name === undefined || prefix === null) {
    return null;
  }
  const start = line.codeStart + prefix[0].length;
  return { name, start, end: start + name.length };
}

/**
 * A package or subprogram may contain nested declarations. Only the outer
 * named terminator is selected; nested names are not emitted as direct units.
 */
function matchingAdaBodyEnd(
  lines: readonly AdaLine[],
  start: number,
  expectedName: string
): number | null {
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }
    const declaredName = namedAdaEnd(line)?.name;
    if (declaredName !== undefined && declaredName.toLowerCase() === expectedName.toLowerCase()) {
      return index;
    }
  }
  return null;
}

/**
 * Extracts complete direct Ada library units. Multi-line profiles, aspect
 * clauses, generic instances, nested members, and ambiguous endings are not
 * promoted to guessed declarations.
 */
function staticAdaUnits(input: AdaExtractFileFactsInput): readonly AdaUnit[] | null {
  const lines = adaLines(input.sourceText);
  if (lines === null) {
    return null;
  }

  const units: AdaUnit[] = [];
  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }
    const header = directAdaHeader(line);
    if (header === null) {
      index += 1;
      continue;
    }
    if (!header.requiresNamedEnd) {
      units.push({
        kind: header.kind,
        name: header.name,
        start: line.codeStart,
        end: line.codeEnd,
        headerStart: line.codeStart,
        headerEnd: line.codeEnd,
        nameStart: header.nameStart,
        nameEnd: header.nameEnd,
        parameterCount: header.parameterCount
      });
      index += 1;
      continue;
    }
    const endIndex = matchingAdaBodyEnd(lines, index, header.name);
    if (endIndex === null) {
      return null;
    }
    const endLine = lines[endIndex];
    if (endLine === undefined) {
      return null;
    }
    const ending = namedAdaEnd(endLine);
    if (ending === null) {
      return null;
    }
    units.push({
      kind: header.kind,
      name: header.name,
      start: line.codeStart,
      end: endLine.codeEnd,
      headerStart: line.codeStart,
      headerEnd: line.codeEnd,
      nameStart: header.nameStart,
      nameEnd: header.nameEnd,
      parameterCount: header.parameterCount,
      endNameStart: ending.start,
      endNameEnd: ending.end
    });
    index = endIndex + 1;
  }
  return units;
}

function symbolKindFor(unit: AdaUnit): "module" | "function" {
  return unit.kind === "package" || unit.kind === "package-body" ? "module" : "function";
}

function isAdaSubunit(unit: AdaUnit, lines: readonly AdaLine[]): boolean {
  const preceding = lines.filter(
    (line) => line.code.length > 0 && line.codeEnd <= unit.headerStart
  ).at(-1);
  return preceding === undefined
    ? false
    : new RegExp("^separate\\s*\\(\\s*" + ADA_NAME + "\\s*\\)\\s*$", "iu").test(
        preceding.code
      );
}

function isZeroArgumentAdaProcedureHeader(line: AdaLine, expectedName: string): boolean {
  const header = directAdaHeader(line);
  return (
    header?.kind === "procedure" &&
    header.name.toLowerCase() === expectedName.toLowerCase() &&
    header.requiresNamedEnd &&
    header.parameterCount === 0
  );
}

/**
 * Restrict the exact claim to a direct library procedure with no declarations:
 * BEGIN followed by one unqualified procedure statement. This excludes local
 * renames, access-to-subprogram values, nested declarations, and package use.
 */
function directAdaCall(unit: AdaUnit, lines: readonly AdaLine[]): AdaDirectCall | null {
  const unitLines = lines.filter(
    (line) => line.codeStart >= unit.start && line.codeEnd <= unit.end && line.code.length > 0
  );
  const header = unitLines[0];
  const ending = unitLines.at(-1);
  if (
    header === undefined ||
    ending === undefined ||
    !isZeroArgumentAdaProcedureHeader(header, unit.name) ||
    namedAdaEnd(ending)?.name.toLowerCase() !== unit.name.toLowerCase()
  ) {
    return null;
  }
  const body = unitLines.slice(1, -1);
  const statement = body[1];
  if (body.length !== 2 || body[0]?.code.toLowerCase() !== "begin" || statement === undefined) {
    return null;
  }
  const match = new RegExp("^(" + ADA_NAME + ")\\s*(?:\\(([^()]*)\\))?\\s*;\\s*$", "iu").exec(
    statement.code
  );
  const name = match?.[1];
  if (match === null || name === undefined) {
    return null;
  }
  const argumentsText = match[2];
  if (argumentsText !== undefined && /["']|=>|;/u.test(argumentsText)) {
    return null;
  }
  const arity =
    argumentsText === undefined || argumentsText.trim().length === 0
      ? 0
      : argumentsText.split(",").length;
  const offset = statement.code.indexOf(name);
  return offset < 0
    ? null
    : {
        name,
        start: statement.codeStart + offset,
        end: statement.codeStart + offset + name.length,
        arity
      };
}

function permitsAdaDirectCalls(lines: readonly AdaLine[]): boolean {
  return !lines.some((line) => /^(?:use|renames|generic|separate)\b/iu.test(line.code));
}

function hasDirectAdaContextWith(
  caller: AdaUnit,
  targetName: string,
  units: readonly AdaUnit[],
  lines: readonly AdaLine[]
): boolean {
  let contextStart = 0;
  for (const unit of units) {
    if (unit.start >= caller.start) {
      break;
    }
    contextStart = Math.max(contextStart, unit.end);
  }
  const contextLines = lines.filter(
    (line) =>
      line.code.length > 0 && line.codeStart >= contextStart && line.codeStart < caller.start
  );
  if (contextLines.length === 0) {
    return false;
  }
  const withNames: string[] = [];
  for (const line of contextLines) {
    const match = new RegExp("^with\\s+(" + ADA_NAME + ")\\s*;\\s*$", "iu").exec(line.code);
    const withName = match?.[1];
    if (match === null || withName === undefined) {
      return false;
    }
    withNames.push(withName);
  }
  return withNames.filter((name) => name.toLowerCase() === targetName.toLowerCase()).length === 1;
}

/**
 * Emits source-ranged direct Ada library units without claiming full Ada
 * parsing, member analysis, specification/body pairing, or runtime behavior.
 * Simple fixed-arity top-level procedure calls are retained for the bounded
 * project resolver; optional, nested, qualified, and dynamic forms stay out.
 */
export function extractAdaFileFacts(input: AdaExtractFileFactsInput): ArtifactFacts {
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
  const symbolsByUnit = new Map<AdaUnit, SymbolNode>();
  const packageUnits: AdaProjectPackageUnitFact[] = [];
  const procedureFacts: AdaProjectProcedureFact[] = [];
  const callFacts: AdaProjectCallFact[] = [];

  function addSymbol(inputSymbol: {
    readonly name: string;
    readonly kind: "module" | "function";
    readonly qualifiedName: string;
    readonly range: SourceRange;
    readonly containmentRuleId: string;
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
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: symbol.id,
        kind: "contains",
        line: inputSymbol.range.start.line,
        column: inputSymbol.range.start.column,
        referenceName: symbol.name
      }),
      sourceId: fileNode.id,
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

  const units = staticAdaUnits(input) ?? [];
  const lines = adaLines(input.sourceText);
  for (const unit of units) {
    const symbol = addSymbol({
      name: unit.name,
      kind: symbolKindFor(unit),
      qualifiedName: input.filePath + "#" + unit.kind + ":" + unit.name,
      range: rangeForSpan(lineStarts, unit.start, unit.end),
      containmentRuleId: "language.ada." + unit.kind + ".direct-library-unit"
    });
    symbolsByUnit.set(unit, symbol);
    const normalizedFullName = normalizedLegalAdaIdentifier(unit.name);
    if (
      (unit.kind === "package" || unit.kind === "package-body") &&
      !unit.name.includes(".") &&
      normalizedFullName !== null &&
      lines !== null &&
      !isAdaSubunit(unit, lines) &&
      unit.endNameStart !== undefined &&
      unit.endNameEnd !== undefined
    ) {
      packageUnits.push({
        role: unit.kind === "package" ? "spec" : "body",
        normalizedFullName,
        symbolId: symbol.id,
        filePath: input.filePath,
        unitRange: symbol.range,
        headerRange: rangeForSpan(lineStarts, unit.headerStart, unit.headerEnd),
        nameRange: rangeForSpan(lineStarts, unit.nameStart, unit.nameEnd),
        endRange: rangeForSpan(lineStarts, unit.endNameStart, unit.endNameEnd)
      });
    }
    if (
      unit.kind === "procedure" &&
      unit.endNameStart !== undefined &&
      unit.parameterCount !== null &&
      normalizedFullName !== null
    ) {
      procedureFacts.push({
        symbolId: symbol.id,
        filePath: input.filePath,
        normalizedFullName,
        parameterCount: unit.parameterCount,
        projectEligible: !unit.name.includes(".") && !isAdaSubunit(unit, lines ?? []),
        range: symbol.range
      });
    }
  }

  if (lines !== null && permitsAdaDirectCalls(lines)) {
    const procedures = units.filter((unit) => unit.kind === "procedure");
    for (const callerUnit of procedures) {
      const call = directAdaCall(callerUnit, lines);
      if (
        call === null ||
        (callerUnit.name.includes(".") && !call.name.includes("."))
      ) {
        continue;
      }
      if (
        !call.name.includes(".") &&
        hasDirectAdaContextWith(callerUnit, call.name, units, lines)
      ) {
        const caller = symbolsByUnit.get(callerUnit);
        if (caller !== undefined) {
          callFacts.push({
            sourceId: caller.id,
            filePath: input.filePath,
            referenceName: call.name,
            argumentCount: call.arity,
            range: rangeForSpan(lineStarts, call.start, call.end)
          });
        }
      }
      const candidates = procedures.filter(
        (unit) =>
          unit.name.toLowerCase() === call.name.toLowerCase() &&
          unit.parameterCount === call.arity &&
          unit.parameterCount !== null &&
          unit.kind === "procedure" &&
          unit.start !== callerUnit.start &&
          unit.endNameStart !== undefined
      );
      if (candidates.length !== 1) {
        continue;
      }
      const targetUnit = candidates[0];
      const caller = symbolsByUnit.get(callerUnit);
      const target = targetUnit === undefined ? undefined : symbolsByUnit.get(targetUnit);
      if (
        caller === undefined ||
        target === undefined ||
        !hasDirectAdaContextWith(callerUnit, call.name, units, lines)
      ) {
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
          ruleId:
            call.arity === 0
              ? "syntax.ada.same-file.unique-zero-argument-procedure-call.direct-context-with"
              : "syntax.ada.same-file.unique-fixed-arity-procedure-call.direct-context-with",
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
    reExportBindings: [],
    adaProjectFacts: {
      packageUnits,
      ...(procedureFacts.length === 0 ? {} : { procedures: procedureFacts }),
      ...(callFacts.length === 0 ? {} : { calls: callFacts })
    }
  };
}
