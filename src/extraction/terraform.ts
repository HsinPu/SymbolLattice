import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type ExportBinding,
  type GraphEdge,
  type LocalBinding,
  type SourcePosition,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";

export interface TerraformExtractFileFactsInput {
  readonly filePath: string;
  readonly language: "terraform";
  readonly sourceText: string;
}

type TerraformBlockKind = "resource" | "data" | "module" | "variable" | "output";

interface TerraformBlock {
  readonly kind: TerraformBlockKind;
  readonly labels: readonly string[];
  readonly start: number;
  readonly end: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
}

interface TerraformSymbolShape {
  readonly name: string;
  readonly qualifiedSuffix: string;
  readonly kind: Exclude<SymbolKind, "file" | "route" | "entrypoint">;
  readonly isExported: boolean;
  readonly localBindingName: string;
  readonly exportName?: string;
  readonly containmentRuleId: string;
}

const FILE_SCOPE_ID = "terraform:file";
const TERRAFORM_BLOCK_KINDS: readonly TerraformBlockKind[] = [
  "resource",
  "data",
  "module",
  "variable",
  "output"
];

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

function lineBreakEnd(sourceText: string, start: number): number {
  if (sourceText[start] === "\r" && sourceText[start + 1] === "\n") {
    return start + 2;
  }
  return sourceText[start] === "\r" || sourceText[start] === "\n" ? start + 1 : start;
}

function lineContentEnd(sourceText: string, start: number): number {
  let index = start;
  while (index < sourceText.length && sourceText[index] !== "\r" && sourceText[index] !== "\n") {
    index += 1;
  }
  return index;
}

function quotedStringEnd(sourceText: string, start: number): number | null {
  let index = start + 1;
  while (index < sourceText.length) {
    if (sourceText[index] === "\\") {
      index += 2;
      continue;
    }
    if (sourceText[index] === "\"") {
      return index + 1;
    }
    if (sourceText[index] === "\r" || sourceText[index] === "\n") {
      return null;
    }
    index += 1;
  }
  return null;
}

/**
 * Returns undefined when the sequence is not a heredoc introducer, null when
 * it begins a malformed heredoc, and the end offset for a complete heredoc.
 */
function heredocEnd(sourceText: string, start: number): number | null | undefined {
  if (sourceText[start] !== "<" || sourceText[start + 1] !== "<") {
    return undefined;
  }
  let markerStart = start + 2;
  if (sourceText[markerStart] === "-") {
    markerStart += 1;
  }
  let markerEnd = markerStart;
  while (/[A-Za-z0-9_]/u.test(sourceText[markerEnd] ?? "")) {
    markerEnd += 1;
  }
  if (markerEnd === markerStart || !/[A-Za-z_]/u.test(sourceText[markerStart] ?? "")) {
    return undefined;
  }
  let headerEnd = markerEnd;
  while (sourceText[headerEnd] === " " || sourceText[headerEnd] === "\t") {
    headerEnd += 1;
  }
  if (sourceText[headerEnd] !== "\r" && sourceText[headerEnd] !== "\n") {
    return undefined;
  }

  const marker = sourceText.slice(markerStart, markerEnd);
  let lineStart = lineBreakEnd(sourceText, headerEnd);
  while (lineStart < sourceText.length) {
    const contentEnd = lineContentEnd(sourceText, lineStart);
    if (sourceText.slice(lineStart, contentEnd).trim() === marker) {
      return lineBreakEnd(sourceText, contentEnd);
    }
    if (contentEnd === sourceText.length) {
      return null;
    }
    lineStart = lineBreakEnd(sourceText, contentEnd);
  }
  return null;
}

/**
 * Preserves offsets while removing Terraform text that cannot declare a direct
 * top-level block. Unterminated strings, comments, or heredocs fail closed.
 */
function terraformCodeMask(sourceText: string): string | null {
  const characters = sourceText.split("");
  let index = 0;

  while (index < sourceText.length) {
    const character = sourceText[index];
    const next = sourceText[index + 1];
    if (character === "#" || (character === "/" && next === "/")) {
      const contentEnd = lineContentEnd(sourceText, index);
      blankRange(characters, index, contentEnd);
      index = contentEnd;
      continue;
    }
    if (character === "/" && next === "*") {
      const closing = sourceText.indexOf("*/", index + 2);
      if (closing === -1) {
        return null;
      }
      const end = closing + 2;
      blankRange(characters, index, end);
      index = end;
      continue;
    }
    if (character === "\"") {
      const end = quotedStringEnd(sourceText, index);
      if (end === null) {
        return null;
      }
      blankRange(characters, index + 1, end - 1);
      index = end;
      continue;
    }
    if (character === "<" && next === "<") {
      const end = heredocEnd(sourceText, index);
      if (end === null) {
        return null;
      }
      if (end !== undefined) {
        blankRange(characters, index, end);
        index = end;
        continue;
      }
    }
    index += 1;
  }

  return characters.join("");
}

function startsLineWithOnlyWhitespace(sourceText: string, offset: number): boolean {
  for (let index = offset - 1; index >= 0; index -= 1) {
    const character = sourceText[index];
    if (character === "\r" || character === "\n") {
      return true;
    }
    if (character !== " " && character !== "\t") {
      return false;
    }
  }
  return true;
}

function isHclIdentifierPart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_-]/u.test(character);
}

function hasWordAt(sourceText: string, start: number, word: string): boolean {
  return (
    sourceText.slice(start, start + word.length) === word &&
    !isHclIdentifierPart(sourceText[start - 1]) &&
    !isHclIdentifierPart(sourceText[start + word.length])
  );
}

function blockKindAt(sourceText: string, start: number): TerraformBlockKind | null {
  for (const kind of TERRAFORM_BLOCK_KINDS) {
    if (hasWordAt(sourceText, start, kind)) {
      return kind;
    }
  }
  return null;
}

function skipHorizontalWhitespace(sourceText: string, start: number): number {
  let index = start;
  while (sourceText[index] === " " || sourceText[index] === "\t") {
    index += 1;
  }
  return index;
}

function readQuotedLabel(
  sourceText: string,
  code: string,
  start: number
): { readonly text: string; readonly end: number } | null {
  if (sourceText[start] !== "\"" || code[start] !== "\"") {
    return null;
  }
  let index = start + 1;
  while (index < sourceText.length) {
    const character = sourceText[index];
    if (character === "\\" || character === "\r" || character === "\n") {
      return null;
    }
    if (character === "\"") {
      const text = sourceText.slice(start + 1, index);
      return /^[A-Za-z0-9_-]+$/u.test(text) ? { text, end: index + 1 } : null;
    }
    index += 1;
  }
  return null;
}

function closingBrace(sourceText: string, start: number): number | null {
  if (sourceText[start] !== "{") {
    return null;
  }
  let depth = 0;
  for (let index = start; index < sourceText.length; index += 1) {
    if (sourceText[index] === "{") {
      depth += 1;
      continue;
    }
    if (sourceText[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return null;
}

function terraformBlockAt(
  sourceText: string,
  code: string,
  start: number,
  kind: TerraformBlockKind
): TerraformBlock | null {
  let index = skipHorizontalWhitespace(code, start + kind.length);
  const labels: string[] = [];
  const labelCount = kind === "resource" || kind === "data" ? 2 : 1;

  for (let labelIndex = 0; labelIndex < labelCount; labelIndex += 1) {
    const label = readQuotedLabel(sourceText, code, index);
    if (label === null) {
      return null;
    }
    labels.push(label.text);
    index = skipHorizontalWhitespace(code, label.end);
  }

  if (code[index] !== "{") {
    return null;
  }
  const end = closingBrace(code, index);
  if (end === null) {
    return null;
  }
  return { kind, labels, start, end: end + 1, bodyStart: index + 1, bodyEnd: end };
}

interface TerraformOutputResourceTraversal {
  readonly address: string;
  readonly start: number;
  readonly end: number;
}

function directOutputResourceTraversal(
  code: string,
  block: TerraformBlock
): TerraformOutputResourceTraversal | null {
  if (block.kind !== "output") {
    return null;
  }
  const body = code.slice(block.bodyStart, block.bodyEnd);
  const match = /^\s*value\s*=\s*([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\s*$/u.exec(body);
  if (match === null) {
    return null;
  }
  const address = `${match[1]}.${match[2]}`;
  const relativeStart = body.indexOf(address, match.index);
  if (relativeStart === -1) {
    return null;
  }
  const start = block.bodyStart + relativeStart;
  return { address, start, end: start + address.length };
}

/**
 * Retains only complete top-level literal Terraform/OpenTofu blocks. Dynamic
 * labels, nested blocks, HCL JSON, provider configuration, expressions, and
 * module-source resolution remain deliberately outside this first slice.
 */
function terraformBlocks(sourceText: string): readonly TerraformBlock[] {
  const code = terraformCodeMask(sourceText);
  if (code === null) {
    return [];
  }

  const blocks: TerraformBlock[] = [];
  let cursor = 0;
  let depth = 0;
  while (cursor < code.length) {
    const character = code[cursor];
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
    if (depth !== 0 || !startsLineWithOnlyWhitespace(code, cursor)) {
      cursor += 1;
      continue;
    }
    const kind = blockKindAt(code, cursor);
    if (kind === null) {
      cursor += 1;
      continue;
    }
    const block = terraformBlockAt(sourceText, code, cursor, kind);
    if (block === null) {
      cursor += 1;
      continue;
    }
    blocks.push(block);
    cursor = block.end;
  }

  return depth === 0 ? blocks : [];
}

function symbolShape(block: TerraformBlock): TerraformSymbolShape {
  const firstLabel = block.labels[0] ?? "";
  const secondLabel = block.labels[1] ?? "";
  if (block.kind === "resource") {
    const address = firstLabel + "." + secondLabel;
    return {
      name: "resource " + address,
      qualifiedSuffix: "resource:" + address,
      kind: "resource",
      isExported: false,
      localBindingName: address,
      containmentRuleId: "framework.terraform.resource.block"
    };
  }
  if (block.kind === "data") {
    const address = firstLabel + "." + secondLabel;
    return {
      name: "data " + address,
      qualifiedSuffix: "data:" + address,
      kind: "resource",
      isExported: false,
      localBindingName: "data." + address,
      containmentRuleId: "framework.terraform.data.block"
    };
  }
  if (block.kind === "module") {
    return {
      name: "module " + firstLabel,
      qualifiedSuffix: "module:" + firstLabel,
      kind: "module",
      isExported: false,
      localBindingName: "module." + firstLabel,
      containmentRuleId: "framework.terraform.module.block"
    };
  }
  if (block.kind === "variable") {
    return {
      name: "variable " + firstLabel,
      qualifiedSuffix: "variable:" + firstLabel,
      kind: "variable",
      isExported: false,
      localBindingName: "var." + firstLabel,
      containmentRuleId: "framework.terraform.variable.block"
    };
  }
  return {
    name: "output " + firstLabel,
    qualifiedSuffix: "output:" + firstLabel,
    kind: "variable",
    isExported: true,
    localBindingName: "output." + firstLabel,
    exportName: firstLabel,
    containmentRuleId: "framework.terraform.output.block"
  };
}

/**
 * Extracts a small declarative Terraform/OpenTofu surface. It records only
 * complete top-level block declarations and never infers provider state,
 * dependency order, runtime values, module targets, or a plan/apply result.
 */
export function extractTerraformFileFacts(input: TerraformExtractFileFactsInput): ArtifactFacts {
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
  const localBindings: LocalBinding[] = [];
  const exportBindings: ExportBinding[] = [];
  const declarationOrdinals = new Map<string, number>();
  const blockSymbols: Array<{ readonly block: TerraformBlock; readonly symbol: SymbolNode }> = [];

  function addContainment(symbol: SymbolNode, range: SourceRange, ruleId: string): void {
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: symbol.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: symbol.name
      }),
      sourceId: fileNode.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: symbol.name,
      evidence: {
        ruleId,
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
  }

  const blocks = terraformBlocks(input.sourceText);
  const code = terraformCodeMask(input.sourceText);
  for (const block of blocks) {
    const shape = symbolShape(block);
    const range = rangeForSpan(lineStarts, block.start, block.end);
    const qualifiedName = input.filePath + "#" + shape.qualifiedSuffix;
    const identity = qualifiedName + "\u0000" + shape.kind;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: shape.kind,
        declarationOrdinal
      }),
      name: shape.name,
      qualifiedName,
      kind: shape.kind,
      filePath: input.filePath,
      range,
      isExported: shape.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    blockSymbols.push({ block, symbol });
    addContainment(symbol, range, shape.containmentRuleId);
    localBindings.push({
      name: shape.localBindingName,
      symbolId: symbol.id,
      scopeId: FILE_SCOPE_ID
    });
    if (shape.exportName !== undefined) {
      exportBindings.push({
        localName: shape.localBindingName,
        exportedName: shape.exportName,
        range
      });
    }
  }

  if (code !== null) {
    for (const source of blockSymbols) {
      const traversal = directOutputResourceTraversal(code, source.block);
      if (traversal === null) {
        continue;
      }
      const targets = blockSymbols.filter(
        (candidate) =>
          candidate.block.kind === "resource" &&
          candidate.block.labels.join(".") === traversal.address
      );
      const target = targets.length === 1 ? targets[0] : undefined;
      if (target === undefined) {
        continue;
      }
      const range = rangeForSpan(lineStarts, traversal.start, traversal.end);
      edges.push({
        id: createEdgeId({
          sourceId: source.symbol.id,
          targetId: target.symbol.id,
          kind: "references",
          line: range.start.line,
          column: range.start.column,
          referenceName: traversal.address
        }),
        sourceId: source.symbol.id,
        targetId: target.symbol.id,
        kind: "references",
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName: traversal.address,
        evidence: {
          ruleId: "syntax.terraform.same-file.unique-output-resource-traversal",
          stage: "syntax",
          candidateSymbolIds: [target.symbol.id]
        }
      });
    }
  }

  return {
    symbols,
    edges,
    pendingReferences: [],
    localBindings,
    referenceScopes: [],
    importBindings: [],
    exportBindings,
    reExportBindings: []
  };
}
