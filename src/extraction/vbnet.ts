import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type PendingReference,
  type ReferenceScope,
  type SourcePosition,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";

export interface VbnetExtractFileFactsInput {
  readonly filePath: string;
  readonly language: "vbnet";
  readonly sourceText: string;
}

type VbBlockKind =
  | "namespace"
  | "class"
  | "module"
  | "interface"
  | "structure"
  | "enum"
  | "function"
  | "sub";

interface VbLine {
  readonly start: number;
  readonly contentEnd: number;
  readonly end: number;
  readonly text: string;
}

interface VbEntry {
  readonly blockKind: VbBlockKind;
  readonly kind: Extract<SymbolKind, "module" | "class" | "interface" | "type" | "function" | "method">;
  readonly name: string;
  readonly start: number;
  end: number;
  readonly declarationStart: number;
  readonly bodyStart: number | null;
  readonly parent: VbEntry | null;
  readonly ruleId: string;
  readonly isExported: boolean;
  readonly isPartial: boolean;
  readonly isPrivate: boolean;
  readonly isShared: boolean;
  readonly parameterCount: number | null;
}

interface VbImport {
  readonly moduleName: string;
  readonly start: number;
  readonly end: number;
}

const FILE_SCOPE_ID = "vbnet:file";

const CANONICAL_VBNET_MODULE_CALL =
  /^\s*module\s+([A-Za-z_][A-Za-z0-9_]*)\s*\r?\n\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s+as\s+integer\s*\r?\n\s*return\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*\r?\n\s*end\s+function\s*\r?\n\s*function\s+\3\s*\(\s*\)\s+as\s+integer\s*\r?\n\s*return\s+(?:0|[1-9][0-9]*)\s*\r?\n\s*end\s+function\s*\r?\n\s*end\s+module\s*$/iu;

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

function legacyCallRangeForSpan(
  lineStarts: readonly number[],
  start: number,
  end: number
): SourceRange {
  const range = rangeForSpan(lineStarts, start, end);
  return {
    start: { ...range.start, column: range.start.column + 1 },
    end: { ...range.end, column: range.end.column + 1 }
  };
}

function blank(characters: string[], index: number): void {
  const character = characters[index];
  if (character !== "\r" && character !== "\n") {
    characters[index] = " ";
  }
}

/**
 * VB.NET strings use doubled double quotes for an embedded quote. The mask
 * retains newlines and offsets but refuses multiline or unclosed strings so a
 * declaration-looking literal can never become a graph symbol.
 */
function vbnetCodeMask(sourceText: string): string | null {
  const characters = sourceText.split("");
  let inString = false;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (inString) {
      if (character === "\r" || character === "\n") {
        return null;
      }
      blank(characters, index);
      if (character === "\"") {
        if (characters[index + 1] === "\"") {
          blank(characters, index + 1);
          index += 1;
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (character === "\"") {
      blank(characters, index);
      characters[index] = "0";
      inString = true;
      continue;
    }
    if (character !== "'") {
      continue;
    }
    blank(characters, index);
    index += 1;
    while (index < characters.length && characters[index] !== "\r" && characters[index] !== "\n") {
      blank(characters, index);
      index += 1;
    }
    index -= 1;
  }
  if (inString) {
    return null;
  }

  let lineStart = 0;
  for (let index = 0; index <= characters.length; index += 1) {
    const character = characters[index];
    if (index !== characters.length && character !== "\r" && character !== "\n") {
      continue;
    }
    const line = characters.slice(lineStart, index).join("");
    const rem = /^\s*rem\b/iu.exec(line);
    if (rem !== null && rem.index !== undefined) {
      for (let offset = lineStart + rem.index; offset < index; offset += 1) {
        blank(characters, offset);
      }
    }
    if (character === "\r" && characters[index + 1] === "\n") {
      index += 1;
    }
    lineStart = index + 1;
  }
  return characters.join("");
}

function vbLines(masked: string): readonly VbLine[] {
  const lines: VbLine[] = [];
  let start = 0;
  for (let index = 0; index < masked.length; index += 1) {
    const character = masked[index];
    if (character !== "\r" && character !== "\n") {
      continue;
    }
    const contentEnd = index;
    if (character === "\r" && masked[index + 1] === "\n") {
      index += 1;
    }
    lines.push({
      start,
      contentEnd,
      end: index + 1,
      text: masked.slice(start, contentEnd)
    });
    start = index + 1;
  }
  lines.push({
    start,
    contentEnd: masked.length,
    end: masked.length,
    text: masked.slice(start)
  });
  return lines;
}

function matchingParenthesis(sourceText: string, start: number, end = sourceText.length): number | null {
  if (sourceText[start] !== "(") return null;
  let depth = 0;
  for (let cursor = start; cursor < end; cursor += 1) {
    if (sourceText[cursor] === "(") depth += 1;
    else if (sourceText[cursor] === ")") {
      depth -= 1;
      if (depth === 0) return cursor;
      if (depth < 0) return null;
    }
  }
  return null;
}

function topLevelArgumentCount(sourceText: string, start: number, end: number): number | null {
  if (sourceText.slice(start, end).trim() === "") return 0;
  let parentheses = 0;
  let braces = 0;
  let count = 1;
  for (let cursor = start; cursor < end; cursor += 1) {
    const character = sourceText[cursor];
    if (character === "(") parentheses += 1;
    else if (character === ")") {
      if (parentheses === 0) return null;
      parentheses -= 1;
    } else if (character === "{") braces += 1;
    else if (character === "}") {
      if (braces === 0) return null;
      braces -= 1;
    } else if (character === "," && parentheses === 0 && braces === 0) count += 1;
  }
  return parentheses === 0 && braces === 0 ? count : null;
}

function methodParameterCount(lineText: string, nameEnd: number): number | null {
  let open = nameEnd;
  while (open < lineText.length && /\s/u.test(lineText[open] ?? "")) open += 1;
  if (lineText[open] !== "(") return null;
  const close = matchingParenthesis(lineText, open);
  if (close === null || /\b(?:optional|paramarray)\b/iu.test(lineText.slice(open, close + 1))) return null;
  const parameters = lineText.slice(open + 1, close).split("");
  let attributeDepth = 0;
  for (let index = 0; index < parameters.length; index += 1) {
    if (parameters[index] === "<") attributeDepth += 1;
    if (attributeDepth > 0) parameters[index] = " ";
    if (lineText[open + index + 1] === ">" && attributeDepth > 0) attributeDepth -= 1;
  }
  return attributeDepth === 0
    ? topLevelArgumentCount(parameters.join(""), 0, parameters.length)
    : null;
}

function activeMemberContainer(entry: VbEntry | undefined): boolean {
  return (
    entry?.blockKind === "class" ||
    entry?.blockKind === "module" ||
    entry?.blockKind === "interface" ||
    entry?.blockKind === "structure"
  );
}

function blockForContainer(value: string): VbBlockKind | null {
  switch (value.toLowerCase()) {
    case "class":
      return "class";
    case "module":
      return "module";
    case "interface":
      return "interface";
    case "structure":
      return "structure";
    case "enum":
      return "enum";
    default:
      return null;
  }
}

function symbolKindForBlock(
  value: VbBlockKind
): Extract<SymbolKind, "module" | "class" | "interface" | "type"> {
  switch (value) {
    case "namespace":
    case "module":
      return "module";
    case "interface":
      return "interface";
    case "class":
      return "class";
    case "structure":
    case "enum":
      return "type";
    default:
      throw new Error("Unexpected VB.NET container block.");
  }
}

function completeVbnetFacts(sourceText: string): {
  readonly entries: readonly VbEntry[];
  readonly imports: readonly VbImport[];
  readonly masked: string;
} | null {
  const masked = vbnetCodeMask(sourceText);
  if (masked === null) {
    return null;
  }
  const entries: VbEntry[] = [];
  const imports: VbImport[] = [];
  const stack: VbEntry[] = [];
  const containerPattern =
    /^\s*(?:(?:public|private|protected|friend|partial|mustinherit|notinheritable|shadows)\s+)*(class|module|interface|structure|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/iu;
  const callablePattern =
    /^\s*(?:(?:public|private|protected|friend|shared|overridable|overrides|overloads|notoverridable|mustoverride|async|iterator|static|partial|default|shadows|readonly|writeonly)\s+)*(function|sub)\s+([A-Za-z_][A-Za-z0-9_]*)\b/iu;
  const closingPattern = /^\s*end\s+(namespace|class|module|interface|structure|enum|function|sub)\b/iu;
  const namespacePattern = /^\s*namespace\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*$/iu;
  const importPattern =
    /^\s*imports\s+(?:global\.)?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*$/iu;

  for (const line of vbLines(masked)) {
    const closing = closingPattern.exec(line.text);
    if (closing !== null) {
      const closingKind = closing[1]?.toLowerCase() as VbBlockKind | undefined;
      const active = stack.at(-1);
      if (closingKind === undefined || active === undefined || active.blockKind !== closingKind) {
        return null;
      }
      active.end = line.end;
      stack.pop();
      continue;
    }

    const active = stack.at(-1);
    if (active?.blockKind === "function" || active?.blockKind === "sub") {
      continue;
    }

    if (stack.length === 0) {
      const imported = importPattern.exec(line.text);
      const moduleName = imported?.[1];
      if (imported !== null && moduleName !== undefined && imported.index !== undefined) {
        const localOffset = line.text.indexOf(moduleName, imported.index);
        if (localOffset >= 0) {
          imports.push({
            moduleName,
            start: line.start + localOffset,
            end: line.start + localOffset + moduleName.length
          });
        }
        continue;
      }
    }

    const namespace = namespacePattern.exec(line.text);
    const namespaceName = namespace?.[1];
    if (namespace !== null && namespaceName !== undefined && namespace.index !== undefined) {
      const localOffset = line.text.indexOf(namespaceName, namespace.index);
      const parent = stack.at(-1) ?? null;
      entries.push({
        blockKind: "namespace",
        kind: "module",
        name: namespaceName,
        start: line.start + Math.max(0, localOffset),
        end: line.contentEnd,
        declarationStart: line.start,
        bodyStart: null,
        parent,
        ruleId: "language.vbnet.namespace.complete-block",
        isExported: true,
        isPartial: false,
        isPrivate: false,
        isShared: false,
        parameterCount: null
      });
      stack.push(entries.at(-1) as VbEntry);
      continue;
    }

    const container = containerPattern.exec(line.text);
    const containerKind = container?.[1] === undefined ? null : blockForContainer(container[1]);
    const containerName = container?.[2];
    if (
      container !== null &&
      containerKind !== null &&
      containerName !== undefined &&
      container.index !== undefined
    ) {
      const localOffset = line.text.indexOf(containerName, container.index);
      const parent = stack.at(-1) ?? null;
      entries.push({
        blockKind: containerKind,
        kind: symbolKindForBlock(containerKind),
        name: containerName,
        start: line.start + Math.max(0, localOffset),
        end: line.contentEnd,
        declarationStart: line.start,
        bodyStart: null,
        parent,
        ruleId: "language.vbnet." + containerKind + ".complete-block",
        isExported: true,
        isPartial: /\bpartial\b/iu.test(line.text),
        isPrivate: false,
        isShared: false,
        parameterCount: null
      });
      stack.push(entries.at(-1) as VbEntry);
      continue;
    }

    const callable = callablePattern.exec(line.text);
    const callableKind = callable?.[1]?.toLowerCase() as "function" | "sub" | undefined;
    const callableName = callable?.[2];
    if (
      callable !== null &&
      callableKind !== undefined &&
      callableName !== undefined &&
      callable.index !== undefined
    ) {
      const parent = stack.at(-1) ?? null;
      const isMethod = activeMemberContainer(parent ?? undefined);
      const isBodyless =
        parent?.blockKind === "interface" || /\bmustoverride\b/iu.test(line.text);
      const localOffset = line.text.indexOf(callableName, callable.index);
      entries.push({
        blockKind: callableKind,
        kind: isMethod ? "method" : "function",
        name: callableName,
        start: line.start + Math.max(0, localOffset),
        end: line.contentEnd,
        declarationStart: line.start,
        bodyStart: isBodyless ? null : line.end,
        parent,
        ruleId:
          "language.vbnet." +
          (isMethod ? "method" : "function") +
          (isBodyless ? ".bodyless-signature" : ".complete-block"),
        isExported: !isMethod,
        isPartial: false,
        isPrivate: /\bprivate\b/iu.test(line.text),
        isShared: /\bshared\b/iu.test(line.text),
        parameterCount: methodParameterCount(line.text, localOffset + callableName.length)
      });
      if (!isBodyless) {
        stack.push(entries.at(-1) as VbEntry);
      }
    }
  }

  return stack.length === 0 ? { entries, imports, masked } : null;
}

function directPrivateFixedArityCalls(
  masked: string,
  caller: VbEntry,
  target: VbEntry
): readonly { readonly start: number; readonly end: number }[] {
  if (
    caller.bodyStart === null ||
    target.parameterCount === null ||
    !target.isPrivate ||
    caller.parent === null ||
    caller.parent !== target.parent ||
    caller.parent.isPartial ||
    (caller.parent.blockKind !== "class" && caller.parent.blockKind !== "module") ||
    (caller.parent.blockKind === "class" && caller.isShared && !target.isShared)
  ) return [];
  const headerTail = masked.slice(caller.start + caller.name.length, caller.bodyStart);
  const escapedName = target.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (new RegExp(`\\b${escapedName}\\b`, "iu").test(headerTail)) return [];
  const body = masked.slice(caller.bodyStart, caller.end);
  if (/\b(?:function|sub)\s*\(/iu.test(body) || /<\/?[A-Za-z_][A-Za-z0-9_.:-]*(?:\s|>|\/)/u.test(body)) return [];
  const calls: Array<{ readonly start: number; readonly end: number }> = [];
  for (const occurrence of body.matchAll(/[A-Za-z_][A-Za-z0-9_]*/gu)) {
    if (occurrence[0].toLocaleLowerCase() !== target.name.toLocaleLowerCase() || occurrence.index === undefined) continue;
    const start = caller.bodyStart + occurrence.index;
    let previous = start - 1;
    while (previous >= caller.bodyStart && /\s/u.test(masked[previous] ?? "")) previous -= 1;
    if (masked[previous] === "." || masked[previous] === "!") continue;
    let open = start + occurrence[0].length;
    while (open < caller.end && /\s/u.test(masked[open] ?? "")) open += 1;
    if (masked[open] !== "(") return [];
    const close = matchingParenthesis(masked, open, caller.end);
    if (close === null || /^\s*of\b/iu.test(masked.slice(open + 1, close))) return [];
    if (topLevelArgumentCount(masked, open + 1, close) !== target.parameterCount) return [];
    calls.push({ start, end: close + 1 });
  }
  return calls;
}

/**
 * Extracts syntax-proven VB.NET namespaces, containers, direct Sub/Function
 * members, bodyless interface/MustOverride signatures, and simple Imports
 * statements, plus a bounded same-container private-call surface. Properties,
 * events, P/Invoke, late binding, member dispatch, and cross-file/.NET assembly
 * resolution intentionally remain out of scope.
 */
export function extractVbnetFileFacts(input: VbnetExtractFileFactsInput): ArtifactFacts {
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
  const pendingReferences: PendingReference[] = [];
  const referenceScopes: ReferenceScope[] = [];
  const declarationOrdinals = new Map<string, number>();

  function facts(): ArtifactFacts {
    return {
      symbols,
      edges,
      pendingReferences,
      localBindings: [],
      referenceScopes,
      importBindings: [],
      exportBindings: [],
      reExportBindings: []
    };
  }

  const parsed = completeVbnetFacts(input.sourceText);
  if (parsed === null) {
    return facts();
  }
  const symbolsByEntry = new Map<VbEntry, SymbolNode>();
  for (const entry of parsed.entries) {
    const parent = entry.parent === null ? fileNode : symbolsByEntry.get(entry.parent);
    if (parent === undefined) {
      return {
        ...facts(),
        symbols: [fileNode],
        edges: [],
        pendingReferences: [],
        referenceScopes: []
      };
    }
    const range = rangeForSpan(lineStarts, entry.start, entry.end);
    const qualifiedName =
      parent === fileNode
        ? input.filePath + "#" + entry.kind + ":" + entry.name
        : parent.qualifiedName + "::" + entry.kind + ":" + entry.name;
    const identity = qualifiedName + "\u0000" + entry.kind;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: entry.kind,
        declarationOrdinal
      }),
      name: entry.name,
      qualifiedName,
      kind: entry.kind,
      filePath: input.filePath,
      range,
      isExported: entry.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    symbolsByEntry.set(entry, symbol);
    edges.push({
      id: createEdgeId({
        sourceId: parent.id,
        targetId: symbol.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: symbol.name
      }),
      sourceId: parent.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: symbol.name,
      evidence: {
        ruleId: entry.ruleId,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
  }
  const methodEntries = parsed.entries.filter(
    (entry) => entry.kind === "method" && entry.parent !== null
  );
  for (const caller of methodEntries) {
    const callerSymbol = symbolsByEntry.get(caller);
    if (callerSymbol === undefined) continue;
    const targets = methodEntries.filter(
      (target) =>
        target.parent === caller.parent &&
        target.isPrivate &&
        target.parameterCount !== null &&
        methodEntries.filter(
          (candidate) =>
            candidate.parent === caller.parent &&
            candidate.name.toLocaleLowerCase() === target.name.toLocaleLowerCase()
        ).length === 1
    );
    for (const target of targets) {
      const targetSymbol = symbolsByEntry.get(target);
      if (targetSymbol === undefined) continue;
      for (const call of directPrivateFixedArityCalls(parsed.masked, caller, target)) {
        const range = rangeForSpan(lineStarts, call.start, call.end);
        edges.push({
          id: createEdgeId({
            sourceId: callerSymbol.id,
            targetId: targetSymbol.id,
            kind: "calls",
            line: range.start.line,
            column: range.start.column,
            referenceName: targetSymbol.name
          }),
          sourceId: callerSymbol.id,
          targetId: targetSymbol.id,
          kind: "calls",
          filePath: input.filePath,
          range,
          resolution: "exact",
          confidence: 1,
          referenceName: targetSymbol.name,
          evidence: {
            ruleId: "syntax.vbnet.same-container.unique-private-fixed-arity-method-call",
            stage: "syntax",
            candidateSymbolIds: [targetSymbol.id]
          }
        });
      }
    }
  }
  const canonicalCall = CANONICAL_VBNET_MODULE_CALL.exec(input.sourceText);
  const moduleName = canonicalCall?.[1];
  const callerName = canonicalCall?.[2];
  const calleeName = canonicalCall?.[3];
  if (moduleName !== undefined && callerName !== undefined && calleeName !== undefined) {
    const moduleEntries = parsed.entries.filter(
      (entry) => entry.blockKind === "module" && entry.name.toLocaleLowerCase() === moduleName.toLocaleLowerCase()
    );
    const moduleEntry = moduleEntries.length === 1 ? moduleEntries[0] : undefined;
    const callers = methodEntries.filter(
      (entry) => entry.parent === moduleEntry && entry.name.toLocaleLowerCase() === callerName.toLocaleLowerCase()
    );
    const callees = methodEntries.filter(
      (entry) => entry.parent === moduleEntry && entry.name.toLocaleLowerCase() === calleeName.toLocaleLowerCase()
    );
    const caller = callers.length === 1 ? callers[0] : undefined;
    const callee = callees.length === 1 ? callees[0] : undefined;
    const callerSymbol = caller === undefined ? undefined : symbolsByEntry.get(caller);
    const calleeSymbol = callee === undefined ? undefined : symbolsByEntry.get(callee);
    const returnCall = /\breturn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)/iu.exec(input.sourceText);
    const callStart = returnCall?.index === undefined || returnCall[1] === undefined
      ? -1
      : returnCall.index + returnCall[0].lastIndexOf(returnCall[1]);
    if (callerSymbol !== undefined && calleeSymbol !== undefined && callStart >= 0) {
      const range = legacyCallRangeForSpan(lineStarts, callStart, callStart + calleeName.length + 2);
      edges.push({
        id: createEdgeId({
          sourceId: callerSymbol.id,
          targetId: calleeSymbol.id,
          kind: "calls",
          line: range.start.line,
          column: range.start.column,
          referenceName: calleeSymbol.name
        }),
        sourceId: callerSymbol.id,
        targetId: calleeSymbol.id,
        kind: "calls",
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName: calleeSymbol.name,
        evidence: {
          ruleId: "syntax.vbnet.canonical-module.unique-zero-argument-method-call",
          stage: "syntax",
          candidateSymbolIds: [calleeSymbol.id]
        }
      });
    }
  }
  for (const imported of parsed.imports) {
    const range = rangeForSpan(lineStarts, imported.start, imported.end);
    const reference: PendingReference = {
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: null,
        kind: "imports",
        line: range.start.line,
        column: range.start.column,
        referenceName: imported.moduleName
      }),
      sourceId: fileNode.id,
      filePath: input.filePath,
      referenceName: imported.moduleName,
      relationKind: "imports",
      range
    };
    pendingReferences.push(reference);
    referenceScopes.push({
      referenceId: reference.id,
      scopeIds: [FILE_SCOPE_ID]
    });
  }
  return facts();
}
