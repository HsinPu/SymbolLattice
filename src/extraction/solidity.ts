import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SolidityInheritanceFact,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface SolidityExtractFileFactsInput {
  readonly filePath: string;
  readonly language: "solidity";
  readonly sourceText: string;
}

type SolidityContainerKeyword = "contract" | "interface" | "library";
type SolidityMemberKeyword = "function" | "modifier" | "constructor" | "fallback" | "receive";

interface SolidityIdentifier {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface SolidityInheritanceReference {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface SolidityContainer {
  readonly keyword: SolidityContainerKeyword;
  readonly name: SolidityIdentifier;
  readonly start: number;
  readonly bodyStart: number;
  readonly end: number;
  readonly inheritanceReferences: readonly SolidityInheritanceReference[];
}

interface SolidityMember {
  readonly keyword: SolidityMemberKeyword;
  readonly name: SolidityIdentifier;
  readonly start: number;
  readonly end: number;
  readonly bodyStart: number | null;
  readonly bodyEnd: number | null;
  readonly parameterCount: number;
  readonly isPrivate: boolean;
}

const SIMPLE_INHERITANCE_CLAUSE =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*$/u;

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
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const start = lineStarts[middle] ?? 0;
    const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < start) {
      upper = middle - 1;
      continue;
    }
    if (offset >= next) {
      lower = middle + 1;
      continue;
    }
    return { line: middle + 1, column: offset - start };
  }
  const finalIndex = Math.max(0, lineStarts.length - 1);
  return {
    line: finalIndex + 1,
    column: Math.max(0, offset - (lineStarts[finalIndex] ?? 0))
  };
}

function rangeForSpan(
  lineStarts: readonly number[],
  start: number,
  end: number
): SourceRange {
  return {
    start: positionFor(lineStarts, start),
    end: positionFor(lineStarts, end)
  };
}

function blankRange(characters: string[], start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    if (characters[index] !== "\r" && characters[index] !== "\n") {
      characters[index] = " ";
    }
  }
}

/**
 * Masks strings and comments while preserving every source offset. An unterminated
 * comment or string makes the complete declaration scan fail closed.
 */
function solidityCodeMask(sourceText: string): string | null {
  const characters = sourceText.split("");
  let cursor = 0;
  while (cursor < sourceText.length) {
    const character = sourceText[cursor];
    const next = sourceText[cursor + 1];
    if (character === "/" && next === "/") {
      const start = cursor;
      while (cursor < sourceText.length && sourceText[cursor] !== "\r" && sourceText[cursor] !== "\n") {
        cursor += 1;
      }
      blankRange(characters, start, cursor);
      continue;
    }
    if (character === "/" && next === "*") {
      const start = cursor;
      cursor += 2;
      let closed = false;
      while (cursor < sourceText.length) {
        if (sourceText[cursor] === "*" && sourceText[cursor + 1] === "/") {
          cursor += 2;
          closed = true;
          break;
        }
        cursor += 1;
      }
      if (!closed) {
        return null;
      }
      blankRange(characters, start, cursor);
      continue;
    }
    if (character === "'" || character === "\"") {
      const start = cursor;
      const quote = character;
      cursor += 1;
      let closed = false;
      while (cursor < sourceText.length) {
        if (sourceText[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (sourceText[cursor] === quote) {
          cursor += 1;
          closed = true;
          break;
        }
        cursor += 1;
      }
      if (!closed) {
        return null;
      }
      blankRange(characters, start, cursor);
      characters[start] = "0";
      continue;
    }
    cursor += 1;
  }
  return characters.join("");
}

function isIdentifierStart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z_]/u.test(character);
}

function isIdentifierPart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_]/u.test(character);
}

function identifierAt(sourceText: string, start: number): SolidityIdentifier | null {
  if (!isIdentifierStart(sourceText[start])) {
    return null;
  }
  let end = start + 1;
  while (isIdentifierPart(sourceText[end])) {
    end += 1;
  }
  return {
    name: sourceText.slice(start, end),
    start,
    end
  };
}

function skipWhitespace(sourceText: string, start: number, end = sourceText.length): number {
  let cursor = start;
  while (cursor < end && /\s/u.test(sourceText[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function matchingBrace(sourceText: string, start: number): number | null {
  if (sourceText[start] !== "{") {
    return null;
  }
  let depth = 0;
  for (let cursor = start; cursor < sourceText.length; cursor += 1) {
    const character = sourceText[cursor];
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character !== "}") {
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return cursor;
    }
    if (depth < 0) {
      return null;
    }
  }
  return null;
}

function matchingParenthesis(sourceText: string, start: number): number | null {
  if (sourceText[start] !== "(") {
    return null;
  }
  let depth = 0;
  for (let cursor = start; cursor < sourceText.length; cursor += 1) {
    const character = sourceText[cursor];
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character !== ")") {
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return cursor;
    }
    if (depth < 0) {
      return null;
    }
  }
  return null;
}

function topLevelCommaSeparatedCount(sourceText: string, start: number, end: number): number | null {
  if (sourceText.slice(start, end).trim() === "") {
    return 0;
  }
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  let count = 1;
  for (let cursor = start; cursor < end; cursor += 1) {
    const character = sourceText[cursor];
    if (character === "(") parentheses += 1;
    else if (character === ")") {
      if (parentheses === 0) return null;
      parentheses -= 1;
    } else if (character === "[") brackets += 1;
    else if (character === "]") {
      if (brackets === 0) return null;
      brackets -= 1;
    } else if (character === "{") braces += 1;
    else if (character === "}") {
      if (braces === 0) return null;
      braces -= 1;
    } else if (character === "," && parentheses === 0 && brackets === 0 && braces === 0) {
      count += 1;
    }
  }
  return parentheses === 0 && brackets === 0 && braces === 0 ? count : null;
}

function declarationBodyStart(sourceText: string, start: number): number | null {
  let parentheses = 0;
  let brackets = 0;
  for (let cursor = start; cursor < sourceText.length; cursor += 1) {
    const character = sourceText[cursor];
    if (character === "(") {
      parentheses += 1;
      continue;
    }
    if (character === ")") {
      if (parentheses === 0) {
        return null;
      }
      parentheses -= 1;
      continue;
    }
    if (character === "[") {
      brackets += 1;
      continue;
    }
    if (character === "]") {
      if (brackets === 0) {
        return null;
      }
      brackets -= 1;
      continue;
    }
    if (parentheses !== 0 || brackets !== 0) {
      continue;
    }
    if (character === "{") {
      return cursor;
    }
    if (character === ";" || character === "}") {
      return null;
    }
  }
  return null;
}

function simpleInheritanceReferences(
  sourceText: string,
  start: number,
  end: number
): readonly SolidityInheritanceReference[] {
  const header = sourceText.slice(start, end);
  const match = /\bis\b([\s\S]*)$/u.exec(header);
  const remainder = match?.[1];
  const matchedText = match?.[0];
  if (match === null || remainder === undefined || matchedText === undefined) {
    return [];
  }
  const clause = remainder.trim();
  if (!SIMPLE_INHERITANCE_CLAUSE.test(clause)) {
    return [];
  }
  let cursor = start + (match.index ?? 0) + matchedText.length - remainder.length;
  const references: SolidityInheritanceReference[] = [];
  while (cursor < end) {
    cursor = skipWhitespace(sourceText, cursor, end);
    if (cursor >= end) {
      return references;
    }
    const identifier = identifierAt(sourceText, cursor);
    if (identifier === null || identifier.end > end) {
      return [];
    }
    references.push({
      name: identifier.name,
      start: identifier.start,
      end: identifier.end
    });
    cursor = skipWhitespace(sourceText, identifier.end, end);
    if (cursor >= end) {
      return references;
    }
    if (sourceText[cursor] !== ",") {
      return [];
    }
    cursor += 1;
  }
  return references;
}

function topLevelContainers(sourceText: string): readonly SolidityContainer[] | null {
  const containers: SolidityContainer[] = [];
  let depth = 0;
  let cursor = 0;
  while (cursor < sourceText.length) {
    const character = sourceText[cursor];
    if (character === "{") {
      depth += 1;
      cursor += 1;
      continue;
    }
    if (character === "}") {
      if (depth === 0) {
        return null;
      }
      depth -= 1;
      cursor += 1;
      continue;
    }
    if (depth !== 0) {
      cursor += 1;
      continue;
    }
    const keyword = identifierAt(sourceText, cursor);
    if (keyword === null) {
      cursor += 1;
      continue;
    }
    if (
      keyword.name !== "contract" &&
      keyword.name !== "interface" &&
      keyword.name !== "library"
    ) {
      cursor = keyword.end;
      continue;
    }
    const name = identifierAt(sourceText, skipWhitespace(sourceText, keyword.end));
    if (name === null) {
      return null;
    }
    const bodyStart = declarationBodyStart(sourceText, name.end);
    if (bodyStart === null) {
      return null;
    }
    const bodyEnd = matchingBrace(sourceText, bodyStart);
    if (bodyEnd === null) {
      return null;
    }
    containers.push({
      keyword: keyword.name,
      name,
      start: keyword.start,
      bodyStart,
      end: bodyEnd + 1,
      inheritanceReferences: simpleInheritanceReferences(sourceText, name.end, bodyStart)
    });
    cursor = bodyEnd + 1;
  }
  return depth === 0 ? containers : null;
}

function memberEnd(sourceText: string, start: number, containerEnd: number): number | null {
  let parentheses = 0;
  for (let cursor = start; cursor < containerEnd; cursor += 1) {
    const character = sourceText[cursor];
    if (character === "(") {
      parentheses += 1;
      continue;
    }
    if (character === ")") {
      if (parentheses === 0) {
        return null;
      }
      parentheses -= 1;
      continue;
    }
    if (parentheses !== 0) {
      continue;
    }
    if (character === ";") {
      return cursor + 1;
    }
    if (character === "{") {
      const bodyEnd = matchingBrace(sourceText, cursor);
      if (bodyEnd === null || bodyEnd >= containerEnd) {
        return null;
      }
      return bodyEnd + 1;
    }
    if (character === "}") {
      return null;
    }
  }
  return null;
}

function completeMemberAt(
  sourceText: string,
  start: number,
  containerEnd: number
): SolidityMember | null {
  const keyword = identifierAt(sourceText, start);
  if (
    keyword === null ||
    (keyword.name !== "function" &&
      keyword.name !== "modifier" &&
      keyword.name !== "constructor" &&
      keyword.name !== "fallback" &&
      keyword.name !== "receive")
  ) {
    return null;
  }
  const memberKeyword = keyword.name;
  const namedMember = memberKeyword === "function" || memberKeyword === "modifier";
  const name = namedMember
    ? identifierAt(sourceText, skipWhitespace(sourceText, keyword.end, containerEnd))
    : {
        name: memberKeyword,
        start: keyword.start,
        end: keyword.end
      };
  if (name === null) {
    return null;
  }
  const next = skipWhitespace(sourceText, name.end, containerEnd);
  if (sourceText[next] !== "(") {
    return null;
  }
  const parameterEnd = matchingParenthesis(sourceText, next);
  if (parameterEnd === null || parameterEnd >= containerEnd) {
    return null;
  }
  const end = memberEnd(sourceText, name.end, containerEnd);
  if (end === null) {
    return null;
  }
  const bodyStart = declarationBodyStart(sourceText, parameterEnd + 1);
  const bodyEnd = bodyStart === null ? null : matchingBrace(sourceText, bodyStart);
  if (bodyEnd !== null && bodyEnd + 1 !== end) {
    return null;
  }
  const headerEnd = bodyStart ?? end;
  return {
    keyword: memberKeyword,
    name,
    start: keyword.start,
    end,
    bodyStart,
    bodyEnd,
    parameterCount: topLevelCommaSeparatedCount(sourceText, next + 1, parameterEnd) ?? -1,
    isPrivate: /\bprivate\b/u.test(sourceText.slice(parameterEnd + 1, headerEnd))
  };
}

function directMembers(sourceText: string, container: SolidityContainer): readonly SolidityMember[] {
  const members: SolidityMember[] = [];
  let depth = 0;
  let cursor = container.bodyStart + 1;
  while (cursor < container.end - 1) {
    const character = sourceText[cursor];
    if (character === "{") {
      depth += 1;
      cursor += 1;
      continue;
    }
    if (character === "}") {
      if (depth === 0) {
        return [];
      }
      depth -= 1;
      cursor += 1;
      continue;
    }
    if (depth !== 0) {
      cursor += 1;
      continue;
    }
    const member = completeMemberAt(sourceText, cursor, container.end - 1);
    if (member === null) {
      const identifier = identifierAt(sourceText, cursor);
      cursor = identifier?.end ?? cursor + 1;
      continue;
    }
    members.push(member);
    cursor = member.end;
  }
  return depth === 0 ? members : [];
}

function containerSymbolKind(container: SolidityContainer): "class" | "interface" {
  return container.keyword === "interface" ? "interface" : "class";
}

function memberRuleId(keyword: SolidityMemberKeyword): string {
  return "language.solidity." + keyword + ".direct-member";
}

function hasAmbiguousPrivateCallContext(
  sourceText: string,
  source: SolidityMember,
  targetName: string
): boolean {
  if (source.bodyStart === null || source.bodyEnd === null) {
    return true;
  }
  const header = sourceText.slice(source.name.end, source.bodyStart);
  const body = sourceText.slice(source.bodyStart + 1, source.bodyEnd);
  const escapedTargetName = targetName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return (
    /\bfunction\b/u.test(header) ||
    new RegExp(`\\b${escapedTargetName}\\b`, "u").test(header) ||
    /\bassembly\b/u.test(body)
  );
}

function directPrivateFixedArityCalls(
  sourceText: string,
  source: SolidityMember,
  target: SolidityMember
): readonly SolidityIdentifier[] {
  if (
    source.bodyStart === null ||
    source.bodyEnd === null ||
    target.keyword !== "function" ||
    !target.isPrivate ||
    target.parameterCount < 0 ||
    hasAmbiguousPrivateCallContext(sourceText, source, target.name.name)
  ) {
    return [];
  }
  const bodyStart = source.bodyStart + 1;
  const body = sourceText.slice(bodyStart, source.bodyEnd);
  const occurrences = [...body.matchAll(/[A-Za-z_][A-Za-z0-9_]*/gu)].filter(
    (occurrence) => occurrence[0] === target.name.name
  );
  const calls: SolidityIdentifier[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.index === undefined) return [];
    const start = bodyStart + occurrence.index;
    let previous = start - 1;
    while (previous >= bodyStart && /\s/u.test(sourceText[previous] ?? "")) previous -= 1;
    if (sourceText[previous] === ".") continue;
    let cursor = skipWhitespace(sourceText, start + target.name.name.length, source.bodyEnd);
    if (sourceText[cursor] !== "(") return [];
    const end = matchingParenthesis(sourceText, cursor);
    if (end === null || end >= source.bodyEnd) return [];
    const argumentCount = topLevelCommaSeparatedCount(sourceText, cursor + 1, end);
    if (argumentCount !== target.parameterCount) return [];
    calls.push({ name: target.name.name, start, end: end + 1 });
  }
  return calls;
}

/**
 * Extracts complete top-level Solidity containers and their complete direct
 * callable members. It keeps simple `is Base, Other` clauses and one bounded
 * same-contract private-call surface. Import resolution, constructor calls,
 * events, inherited dispatch, and dynamic runtime semantics stay out of scope.
 */
export function extractSolidityFileFacts(input: SolidityExtractFileFactsInput): ArtifactFacts {
  const lineStarts = lineStartsFor(input.sourceText);
  const fileRange = rangeForSpan(lineStarts, 0, input.sourceText.length);
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
    range: fileRange,
    isExported: true,
    declarationOrdinal: 0
  };
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const inheritanceReferences: SolidityInheritanceFact[] = [];
  const declarationOrdinals = new Map<string, number>();

  function facts(): ArtifactFacts {
    return {
      symbols,
      edges,
      pendingReferences: [],
      localBindings: [],
      referenceScopes: [],
      importBindings: [],
      exportBindings: [],
      reExportBindings: [],
      solidityFacts: { inheritanceReferences }
    };
  }

  function addSymbol(inputSymbol: {
    readonly name: string;
    readonly kind: "class" | "interface" | "method";
    readonly qualifiedName: string;
    readonly range: SourceRange;
    readonly isExported: boolean;
    readonly parent: SymbolNode;
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
      isExported: inputSymbol.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    edges.push({
      id: createEdgeId({
        sourceId: inputSymbol.parent.id,
        targetId: symbol.id,
        kind: "contains",
        line: inputSymbol.range.start.line,
        column: inputSymbol.range.start.column,
        referenceName: symbol.name
      }),
      sourceId: inputSymbol.parent.id,
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

  const code = solidityCodeMask(input.sourceText);
  if (code === null) {
    return facts();
  }
  const containers = topLevelContainers(code);
  if (containers === null) {
    return facts();
  }

  for (const container of containers) {
    const containerRange = rangeForSpan(lineStarts, container.start, container.end);
    const containerKind = containerSymbolKind(container);
    const containerSymbol = addSymbol({
      name: container.name.name,
      kind: containerKind,
      qualifiedName: input.filePath + "#" + container.keyword + ":" + container.name.name,
      range: containerRange,
      isExported: true,
      parent: fileNode,
      containmentRuleId: "language.solidity." + container.keyword + ".top-level"
    });

    for (const reference of container.inheritanceReferences) {
      inheritanceReferences.push({
        sourceId: containerSymbol.id,
        filePath: input.filePath,
        baseName: reference.name,
        range: rangeForSpan(lineStarts, reference.start, reference.end)
      });
    }

    const memberSymbols: Array<{ readonly member: SolidityMember; readonly symbol: SymbolNode }> = [];
    for (const member of directMembers(code, container)) {
      const memberRange = rangeForSpan(lineStarts, member.start, member.end);
      const symbol = addSymbol({
        name: member.name.name,
        kind: "method",
        qualifiedName: containerSymbol.qualifiedName + "::" + member.name.name,
        range: memberRange,
        isExported: false,
        parent: containerSymbol,
        containmentRuleId: memberRuleId(member.keyword)
      });
      memberSymbols.push({ member, symbol });
    }

    if (container.keyword !== "contract") {
      continue;
    }
    for (const source of memberSymbols) {
      if (source.member.keyword !== "function" || source.member.bodyStart === null) {
        continue;
      }
      const targets = memberSymbols.filter(
        (candidate) =>
          candidate.member.keyword === "function" &&
          candidate.member.isPrivate &&
          candidate.member.parameterCount >= 0 &&
          candidate.member.bodyStart !== null
      );
      for (const target of targets) {
        if (
          memberSymbols.filter((candidate) => candidate.member.name.name === target.member.name.name)
            .length !== 1
        ) {
          continue;
        }
        for (const call of directPrivateFixedArityCalls(code, source.member, target.member)) {
          const range = rangeForSpan(lineStarts, call.start, call.end);
          edges.push({
            id: createEdgeId({
              sourceId: source.symbol.id,
              targetId: target.symbol.id,
              kind: "calls",
              line: range.start.line,
              column: range.start.column,
              referenceName: target.member.name.name
            }),
            sourceId: source.symbol.id,
            targetId: target.symbol.id,
            kind: "calls",
            filePath: input.filePath,
            range,
            resolution: "exact",
            confidence: 1,
            referenceName: target.member.name.name,
            evidence: {
              ruleId: "syntax.solidity.same-contract.unique-private-fixed-arity-function-call",
              stage: "syntax",
              candidateSymbolIds: [target.symbol.id]
            }
          });
        }
      }
    }
  }

  return facts();
}
