import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";

export interface CfmlExtractFileFactsInput {
  readonly filePath: string;
  readonly language: "cfml";
  readonly sourceText: string;
}

type CfmlContainerKeyword = "component" | "interface";
type CfmlTagName = "cfcomponent" | "cfinterface" | "cffunction";

interface CfmlContainer {
  readonly keyword: CfmlContainerKeyword;
  readonly name: string;
  readonly start: number;
  readonly bodyStart: number;
  readonly end: number;
}

interface CfmlFunction {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly isRemote: boolean;
  readonly structuralStart: number;
}

interface CfmlTag {
  readonly name: CfmlTagName;
  readonly start: number;
  readonly end: number;
  readonly closing: boolean;
  readonly selfClosing: boolean;
}

const CFML_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const CFML_FUNCTION_MODIFIERS =
  /^(?:(?:public|private|protected|package|remote|static|final|abstract|synchronized|transaction|implicit|default)(?:\s+|$))*(?:[A-Za-z_$][A-Za-z0-9_$]*(?:\[\])?)?$/iu;

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
    return { line: middle + 1, column: offset - start + 1 };
  }
  const finalIndex = Math.max(0, lineStarts.length - 1);
  return {
    line: finalIndex + 1,
    column: Math.max(1, offset - (lineStarts[finalIndex] ?? 0) + 1)
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
 * Keep offsets stable while removing CFML comments and quoted literals from
 * CFScript declaration detection. An incomplete comment or string invalidates
 * this narrow scanner instead of letting a partial token become a symbol.
 */
function cfmlCodeMask(sourceText: string): string | null {
  const characters = [...sourceText];
  let index = 0;
  while (index < sourceText.length) {
    if (sourceText.startsWith("<!---", index)) {
      const close = sourceText.indexOf("--->", index + 5);
      if (close < 0) {
        return null;
      }
      blankRange(characters, index, close + 4);
      index = close + 4;
      continue;
    }
    if (sourceText.startsWith("<!--", index)) {
      const close = sourceText.indexOf("-->", index + 4);
      if (close < 0) {
        return null;
      }
      blankRange(characters, index, close + 3);
      index = close + 3;
      continue;
    }
    if (sourceText.startsWith("//", index)) {
      const lineEnd = sourceText.indexOf("\n", index + 2);
      const end = lineEnd < 0 ? sourceText.length : lineEnd;
      blankRange(characters, index, end);
      index = end;
      continue;
    }
    if (sourceText.startsWith("/*", index)) {
      const close = sourceText.indexOf("*/", index + 2);
      if (close < 0) {
        return null;
      }
      blankRange(characters, index, close + 2);
      index = close + 2;
      continue;
    }
    const quote = sourceText[index];
    if (quote !== "'" && quote !== "\"") {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    let closed = false;
    while (index < sourceText.length) {
      const character = sourceText[index];
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (character === quote) {
        if (sourceText[index + 1] === quote) {
          index += 2;
          continue;
        }
        index += 1;
        closed = true;
        break;
      }
      index += 1;
    }
    if (!closed) {
      return null;
    }
    blankRange(characters, start, index);
  }
  return characters.join("");
}

function braceDepthAt(sourceText: string, offset: number): number {
  let depth = 0;
  for (let index = 0; index < offset; index += 1) {
    if (sourceText[index] === "{") {
      depth += 1;
    } else if (sourceText[index] === "}") {
      depth -= 1;
    }
  }
  return depth;
}

function matchingBrace(sourceText: string, start: number, limit = sourceText.length): number | null {
  if (sourceText[start] !== "{") {
    return null;
  }
  let depth = 0;
  for (let index = start; index < limit; index += 1) {
    if (sourceText[index] === "{") {
      depth += 1;
    } else if (sourceText[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
      if (depth < 0) {
        return null;
      }
    }
  }
  return null;
}

function matchingParenthesis(sourceText: string, start: number, limit: number): number | null {
  if (sourceText[start] !== "(") {
    return null;
  }
  let depth = 0;
  for (let index = start; index < limit; index += 1) {
    if (sourceText[index] === "(") {
      depth += 1;
    } else if (sourceText[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
      if (depth < 0) {
        return null;
      }
    }
  }
  return null;
}

function linePrefix(sourceText: string, offset: number): string {
  const lineStart = sourceText.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  return sourceText.slice(lineStart, offset).trim();
}

function scriptContainerContext(sourceText: string, offset: number): boolean {
  return /^(?:abstract|final)?$/iu.test(linePrefix(sourceText, offset));
}

function containerOpeningBrace(sourceText: string, start: number): number | null {
  for (let index = start; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (character === "{") {
      return index;
    }
    if (character === ";" || character === "}") {
      return null;
    }
  }
  return null;
}

function fileStem(filePath: string): string {
  const fileName = filePath.split(/[\\/]/u).at(-1) ?? filePath;
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function scriptContainers(sourceText: string, filePath: string): readonly CfmlContainer[] | null {
  const containers: CfmlContainer[] = [];
  const matcher = /\b(component|interface)\b/giu;
  for (const match of sourceText.matchAll(matcher)) {
    const keyword = match[1]?.toLowerCase() as CfmlContainerKeyword | undefined;
    const start = match.index;
    if (keyword === undefined || start === undefined) {
      continue;
    }
    if (braceDepthAt(sourceText, start) !== 0 || !scriptContainerContext(sourceText, start)) {
      continue;
    }
    const headerStart = start + match[0].length;
    const bodyStart = containerOpeningBrace(sourceText, headerStart);
    if (bodyStart === null) {
      continue;
    }
    const endBrace = matchingBrace(sourceText, bodyStart);
    if (endBrace === null) {
      return null;
    }
    containers.push({
      keyword,
      name: fileStem(filePath),
      start,
      bodyStart,
      end: endBrace + 1
    });
  }
  return containers;
}

function functionContext(sourceText: string, offset: number): boolean {
  const prefix = linePrefix(sourceText, offset);
  if (/^(?:return|new|var|local|arguments|this)\b/iu.test(prefix)) {
    return false;
  }
  return CFML_FUNCTION_MODIFIERS.test(prefix);
}

function functionEnd(sourceText: string, parameterEnd: number, limit: number): number | null {
  let index = parameterEnd + 1;
  while (index < limit && /\s/u.test(sourceText[index] ?? "")) {
    index += 1;
  }
  while (index < limit) {
    const character = sourceText[index];
    if (character === "{") {
      const endBrace = matchingBrace(sourceText, index, limit);
      return endBrace === null ? null : endBrace + 1;
    }
    if (character === ";") {
      return index + 1;
    }
    if (character === "}") {
      return null;
    }
    index += 1;
  }
  return null;
}

/**
 * Returns only direct, complete named CFScript functions. Anonymous functions,
 * nested functions, computed names, and malformed parameter/body forms are
 * intentionally left out.
 */
function directScriptFunctions(
  sourceText: string,
  start: number,
  end: number
): readonly CfmlFunction[] | null {
  const functions: CfmlFunction[] = [];
  const body = sourceText.slice(start, end);
  const matcher = /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/giu;
  for (const match of body.matchAll(matcher)) {
    const localStart = match.index;
    const name = match[1];
    if (localStart === undefined || name === undefined) {
      continue;
    }
    const functionStart = start + localStart;
    if (braceDepthAt(body, localStart) !== 0 || !functionContext(sourceText, functionStart)) {
      continue;
    }
    const parameterStart = functionStart + match[0].lastIndexOf("(");
    const parameterEnd = matchingParenthesis(sourceText, parameterStart, end);
    if (parameterEnd === null) {
      return null;
    }
    const declarationEnd = functionEnd(sourceText, parameterEnd, end);
    if (declarationEnd === null) {
      return null;
    }
    const prefixStart = sourceText.lastIndexOf("\n", Math.max(0, functionStart - 1)) + 1;
    functions.push({
      name,
      start: functionStart,
      end: declarationEnd,
      isRemote: /(?:^|\s)remote(?:\s|$)/iu.test(linePrefix(sourceText, functionStart)),
      structuralStart: prefixStart
    });
  }
  return functions;
}

function hasOnlyDirectCfmlFunctions(
  sourceText: string,
  start: number,
  end: number,
  functions: readonly CfmlFunction[]
): boolean {
  const remainder = sourceText.slice(start, end).split("");
  for (const fn of functions) {
    blankRange(remainder, Math.max(0, fn.structuralStart - start), fn.end - start);
  }
  return remainder.join("").trim().length === 0;
}

function tagAt(sourceText: string, start: number): CfmlTag | "none" | "invalid" {
  const match = /^<\s*(\/)?\s*(cfcomponent|cfinterface|cffunction)\b/iu.exec(
    sourceText.slice(start)
  );
  if (match === null) {
    return "none";
  }
  const rawName = match[2];
  if (rawName === undefined) {
    return "invalid";
  }
  let index = start + match[0].length;
  let quote: "'" | "\"" | null = null;
  while (index < sourceText.length) {
    const character = sourceText[index];
    if (quote !== null) {
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (character === quote) {
        if (sourceText[index + 1] === quote) {
          index += 2;
          continue;
        }
        quote = null;
      }
      index += 1;
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      index += 1;
      continue;
    }
    if (character === ">") {
      const end = index + 1;
      return {
        name: rawName.toLowerCase() as CfmlTagName,
        start,
        end,
        closing: match[1] !== undefined,
        selfClosing: !match[1] && /\/\s*>$/u.test(sourceText.slice(start, end))
      };
    }
    index += 1;
  }
  return "invalid";
}

/**
 * Parse only actual CFML tags, skipping comments and quoted CFScript/template
 * strings so text such as a literal cffunction tag cannot create a declaration.
 */
function cfmlTags(sourceText: string): readonly CfmlTag[] | null {
  const tags: CfmlTag[] = [];
  let index = 0;
  while (index < sourceText.length) {
    if (sourceText.startsWith("<!---", index)) {
      const close = sourceText.indexOf("--->", index + 5);
      if (close < 0) {
        return null;
      }
      index = close + 4;
      continue;
    }
    if (sourceText.startsWith("<!--", index)) {
      const close = sourceText.indexOf("-->", index + 4);
      if (close < 0) {
        return null;
      }
      index = close + 3;
      continue;
    }
    const quote = sourceText[index];
    if (quote === "'" || quote === "\"") {
      index += 1;
      let closed = false;
      while (index < sourceText.length) {
        const character = sourceText[index];
        if (character === "\\") {
          index += 2;
          continue;
        }
        if (character === quote) {
          if (sourceText[index + 1] === quote) {
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) {
        return null;
      }
      continue;
    }
    if (sourceText[index] !== "<") {
      index += 1;
      continue;
    }
    const tag = tagAt(sourceText, index);
    if (tag === "invalid") {
      return null;
    }
    if (tag === "none") {
      index += 1;
      continue;
    }
    tags.push(tag);
    index = tag.end;
  }
  return tags;
}

function matchingTagEnd(tags: readonly CfmlTag[], openIndex: number): number | null {
  const open = tags[openIndex];
  if (open === undefined || open.closing) {
    return null;
  }
  if (open.selfClosing) {
    return openIndex;
  }
  let depth = 1;
  for (let index = openIndex + 1; index < tags.length; index += 1) {
    const candidate = tags[index];
    if (candidate === undefined || candidate.name !== open.name) {
      continue;
    }
    if (!candidate.closing && !candidate.selfClosing) {
      depth += 1;
      continue;
    }
    if (candidate.closing) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return null;
}

function tagFunctionName(sourceText: string, tag: CfmlTag): CfmlFunction | null {
  const raw = sourceText.slice(tag.start, tag.end);
  const match = /\bname\s*=\s*(["'])([A-Za-z_$][A-Za-z0-9_$]*)\1/iu.exec(raw);
  if (match === null) {
    return null;
  }
  const name = match[2];
  if (name === undefined || !CFML_IDENTIFIER.test(name)) {
    return null;
  }
  const offset = (match.index ?? 0) + match[0].lastIndexOf(name);
  return {
    name,
    start: tag.start + offset,
    end: tag.start + offset + name.length,
    isRemote: false,
    structuralStart: tag.start
  };
}

function tagContainerFunctions(
  tags: readonly CfmlTag[],
  openIndex: number,
  closeIndex: number,
  sourceText: string
): readonly CfmlFunction[] | null {
  const functions: CfmlFunction[] = [];
  let index = openIndex + 1;
  while (index < closeIndex) {
    const tag = tags[index];
    if (tag === undefined || tag.name !== "cffunction" || tag.closing) {
      index += 1;
      continue;
    }
    const endIndex = matchingTagEnd(tags, index);
    if (endIndex === null || endIndex > closeIndex) {
      return null;
    }
    const name = tagFunctionName(sourceText, tag);
    if (name === null) {
      return null;
    }
    functions.push({
      name: name.name,
      start: tag.start,
      end: tags[endIndex]?.end ?? tag.end,
      isRemote: false,
      structuralStart: tag.start
    });
    index = endIndex + 1;
  }
  return functions;
}

function isCfcFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".cfc");
}

/**
 * Extract a deliberately narrow CFML / CFScript declaration surface:
 *
 * - CFScript component / interface braced containers and direct named functions;
 * - tag-based cfcomponent / cfinterface with complete named cffunction tags;
 * - conventional implicit CFC containers for complete top-level CFScript functions.
 *
 * Imports, includes, CFQuery, dynamic names, tag/script mixing, calls, and
 * framework/runtime behavior remain out of scope for this first language slice.
 */
export function extractCfmlFileFacts(input: CfmlExtractFileFactsInput): ArtifactFacts {
  const lineStarts = lineStartsFor(input.sourceText);
  const fileName = input.filePath.split(/[\\/]/u).at(-1) ?? input.filePath;
  const fileRange = rangeForSpan(lineStarts, 0, input.sourceText.length);
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
      reExportBindings: []
    };
  }

  function addSymbol(inputSymbol: {
    readonly name: string;
    readonly kind: Extract<SymbolKind, "class" | "interface" | "function" | "method" | "entrypoint">;
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

  function addContainer(
    name: string,
    kind: "class" | "interface",
    range: SourceRange,
    ruleId: string
  ): SymbolNode {
    return addSymbol({
      name,
      kind,
      qualifiedName:
        input.filePath + "#" + (kind === "interface" ? "interface:" : "component:") + name,
      range,
      isExported: true,
      parent: fileNode,
      containmentRuleId: ruleId
    });
  }

  function addMembers(
    parent: SymbolNode,
    members: readonly CfmlFunction[],
    ruleId: string
  ): ReadonlyArray<{ readonly member: CfmlFunction; readonly symbol: SymbolNode }> {
    const records: Array<{ readonly member: CfmlFunction; readonly symbol: SymbolNode }> = [];
    for (const member of members) {
      const symbol = addSymbol({
        name: member.name,
        kind: "method",
        qualifiedName: parent.qualifiedName + "::" + member.name,
        range: rangeForSpan(lineStarts, member.start, member.end),
        isExported: false,
        parent,
        containmentRuleId: ruleId
      });
      records.push({ member, symbol });
    }
    return records;
  }

  function addRemoteEntrypoints(
    parent: SymbolNode,
    members: ReadonlyArray<{ readonly member: CfmlFunction; readonly symbol: SymbolNode }>,
    structurallyIsolated: boolean
  ): void {
    if (!structurallyIsolated || members.length !== 1) {
      return;
    }
    for (const record of members) {
      if (
        !record.member.isRemote ||
        members.filter((candidate) => candidate.member.name.toLowerCase() === record.member.name.toLowerCase())
          .length !== 1
      ) {
        continue;
      }
      const range = rangeForSpan(lineStarts, record.member.start, record.member.end);
      const referenceName = `${parent.name}.${record.member.name}`;
      const entrypoint = addSymbol({
        name: `CFML REMOTE ${referenceName}`,
        kind: "entrypoint",
        qualifiedName: `${parent.qualifiedName}::entrypoint:remote:${record.member.name}`,
        range,
        isExported: true,
        parent,
        containmentRuleId: "syntax.cfml.remote-method-entrypoint"
      });
      edges.push({
        id: createEdgeId({
          sourceId: entrypoint.id,
          targetId: record.symbol.id,
          kind: "handles",
          line: range.start.line,
          column: range.start.column,
          referenceName
        }),
        sourceId: entrypoint.id,
        targetId: record.symbol.id,
        kind: "handles",
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName,
        evidence: {
          ruleId: "syntax.cfml.structurally-isolated-cfc-remote-method-entrypoint",
          stage: "syntax",
          candidateSymbolIds: [record.symbol.id]
        }
      });
    }
  }

  const code = cfmlCodeMask(input.sourceText);
  if (code === null) {
    return facts();
  }
  const containers = scriptContainers(code, input.filePath);
  if (containers === null) {
    return facts();
  }
  const tags = cfmlTags(input.sourceText);
  if (tags === null) {
    return facts();
  }

  for (const container of containers) {
    const parent = addContainer(
      container.name,
      container.keyword === "interface" ? "interface" : "class",
      rangeForSpan(lineStarts, container.start, container.end),
      "language.cfml." + container.keyword + ".braced"
    );
    const members = directScriptFunctions(code, container.bodyStart + 1, container.end - 1);
    if (members === null) {
      return {
        ...facts(),
        symbols: [fileNode],
        edges: []
      };
    }
    const memberRecords = addMembers(parent, members, "language.cfml.function.direct-member");
    if (isCfcFile(input.filePath) && containers.length === 1 && tags.length === 0) {
      addRemoteEntrypoints(
        parent,
        memberRecords,
        hasOnlyDirectCfmlFunctions(code, container.bodyStart + 1, container.end - 1, members)
      );
    }
  }

  let tagContainers = 0;
  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    if (
      tag === undefined ||
      tag.closing ||
      tag.selfClosing ||
      (tag.name !== "cfcomponent" && tag.name !== "cfinterface")
    ) {
      continue;
    }
    const closeIndex = matchingTagEnd(tags, index);
    if (closeIndex === null) {
      return {
        ...facts(),
        symbols: [fileNode],
        edges: []
      };
    }
    const members = tagContainerFunctions(tags, index, closeIndex, input.sourceText);
    if (members === null) {
      return {
        ...facts(),
        symbols: [fileNode],
        edges: []
      };
    }
    const parent = addContainer(
      fileStem(input.filePath),
      tag.name === "cfinterface" ? "interface" : "class",
      rangeForSpan(lineStarts, tag.start, tags[closeIndex]?.end ?? tag.end),
      "language.cfml." + tag.name + ".tag"
    );
    addMembers(parent, members, "language.cfml.cffunction.tag");
    tagContainers += 1;
  }

  if (containers.length > 0 || tagContainers > 0) {
    return facts();
  }

  const bareFunctions = directScriptFunctions(code, 0, code.length);
  if (bareFunctions === null) {
    return facts();
  }
  if (isCfcFile(input.filePath) && bareFunctions.length > 0) {
    const parent = addContainer(
      fileStem(input.filePath),
      "class",
      fileRange,
      "language.cfml.cfc.implicit-component"
    );
    const memberRecords = addMembers(
      parent,
      bareFunctions,
      "language.cfml.function.implicit-component-member"
    );
    addRemoteEntrypoints(
      parent,
      memberRecords,
      hasOnlyDirectCfmlFunctions(code, 0, code.length, bareFunctions)
    );
    return facts();
  }
  for (const fn of bareFunctions) {
    addSymbol({
      name: fn.name,
      kind: "function",
      qualifiedName: input.filePath + "#function:" + fn.name,
      range: rangeForSpan(lineStarts, fn.start, fn.end),
      isExported: true,
      parent: fileNode,
      containmentRuleId: "language.cfml.function.top-level"
    });
  }

  return facts();
}
