import { html, type SgNode } from "@ast-grep/napi";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface HtmlExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "html";
}

const HTML_ELEMENT_KINDS: ReadonlySet<string> = new Set([
  "element",
  "script_element",
  "style_element"
]);
const HTML_VOID_ELEMENTS: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
const HTML_TAG_NAME = /^[A-Za-z][A-Za-z0-9:-]*$/u;
const HTML_RCDATA_ELEMENTS: ReadonlySet<string> = new Set(["textarea", "title"]);
const HTML_RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set(["script", "style"]);
export const MAXIMUM_HTML_ELEMENT_DEPTH = 256;
export const MAXIMUM_HTML_ELEMENTS = 10_000;

function tagEndOffset(sourceText: string, startOffset: number): number | null {
  let quote: '"' | "'" | null = null;
  for (let offset = startOffset; offset < sourceText.length; offset += 1) {
    const character = sourceText[offset];
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") {
      return offset + 1;
    }
  }
  return null;
}

function closingRawElement(
  sourceText: string,
  elementName: string,
  fromOffset: number
): { start: number; end: number } | null {
  const pattern = new RegExp(`</${elementName}\\s*>`, "giu");
  pattern.lastIndex = fromOffset;
  const match = pattern.exec(sourceText);
  return match === null ? null : { start: match.index, end: match.index + match[0].length };
}

/**
 * tree-sitter-html treats RCDATA as ordinary markup. Mask only the RCDATA body
 * while preserving every source offset and line break; script/style remain raw
 * but are skipped here so tag-looking strings inside them cannot start masking.
 */
function parserSourceText(sourceText: string): string | null {
  const masked = sourceText.split("");
  const openElements: string[] = [];
  let offset = 0;
  while (offset < sourceText.length) {
    const opening = sourceText.indexOf("<", offset);
    if (opening < 0) {
      break;
    }
    if (sourceText.startsWith("<!--", opening)) {
      const commentEnd = sourceText.indexOf("-->", opening + 4);
      if (commentEnd < 0) {
        return null;
      }
      offset = commentEnd + 3;
      continue;
    }
    if (/^<!doctype\b/iu.test(sourceText.slice(opening))) {
      const declarationEnd = tagEndOffset(sourceText, opening + 2);
      if (declarationEnd === null) {
        return null;
      }
      offset = declarationEnd;
      continue;
    }
    if (sourceText.startsWith("</", opening)) {
      const endMatch = /^<\/([A-Za-z][A-Za-z0-9:-]*)\s*>/u.exec(sourceText.slice(opening));
      if (endMatch === null || endMatch[1] === undefined) {
        return null;
      }
      const name = endMatch[1].toLowerCase();
      if (openElements.pop() !== name) {
        return null;
      }
      offset = opening + endMatch[0].length;
      continue;
    }
    const nameMatch = /^<([A-Za-z][A-Za-z0-9:-]*)\b/u.exec(sourceText.slice(opening));
    if (nameMatch === null || nameMatch[1] === undefined) {
      offset = opening + 1;
      continue;
    }
    const tagEnd = tagEndOffset(sourceText, opening + nameMatch[0].length);
    if (tagEnd === null) {
      return null;
    }
    const elementName = nameMatch[1].toLowerCase();
    const selfClosing = /\/\s*>$/u.test(sourceText.slice(opening, tagEnd));
    if (selfClosing && !HTML_VOID_ELEMENTS.has(elementName)) {
      return null;
    }
    if (!HTML_RCDATA_ELEMENTS.has(elementName) && !HTML_RAW_TEXT_ELEMENTS.has(elementName)) {
      if (!selfClosing && !HTML_VOID_ELEMENTS.has(elementName)) {
        openElements.push(elementName);
      }
      offset = tagEnd;
      continue;
    }
    if (selfClosing) {
      return null;
    }
    const closing = closingRawElement(sourceText, elementName, tagEnd);
    if (closing === null) {
      return null;
    }
    if (HTML_RCDATA_ELEMENTS.has(elementName)) {
      for (let index = tagEnd; index < closing.start; index += 1) {
        if (masked[index] !== "\r" && masked[index] !== "\n") {
          masked[index] = " ";
        }
      }
    }
    offset = closing.end;
  }
  return openElements.length === 0 ? masked.join("") : null;
}

function directChildren(node: SgNode): readonly SgNode[] {
  return node.children();
}

function sourceRange(node: SgNode): SourceRange {
  const range = node.range();
  return {
    start: { line: range.start.line + 1, column: range.start.column + 1 },
    end: { line: range.end.line + 1, column: range.end.column + 1 }
  };
}

function documentRange(sourceText: string): SourceRange {
  const lines = sourceText.split("\n");
  const lastLine = lines.at(-1) ?? "";
  return {
    start: { line: 1, column: 1 },
    end: { line: lines.length, column: lastLine.length + 1 }
  };
}

function directTagName(node: SgNode, containerKind: string): string | null {
  const containers = directChildren(node).filter((child) => child.kind() === containerKind);
  if (containers.length !== 1 || containers[0] === undefined) {
    return null;
  }
  const names = directChildren(containers[0]).filter((child) => child.kind() === "tag_name");
  if (names.length !== 1 || names[0] === undefined) {
    return null;
  }
  const name = names[0].text();
  return HTML_TAG_NAME.test(name) ? name.toLowerCase() : null;
}

function staticElementName(node: SgNode): string | null {
  return directTagName(node, "start_tag") ?? directTagName(node, "self_closing_tag");
}

function hasValidHtmlStructure(
  node: SgNode,
  state: { elementCount: number },
  elementDepth = 0
): boolean {
  if (node.kind() === "ERROR") {
    return false;
  }
  let childElementDepth = elementDepth;
  if (HTML_ELEMENT_KINDS.has(String(node.kind()))) {
    state.elementCount += 1;
    childElementDepth += 1;
    if (
      state.elementCount > MAXIMUM_HTML_ELEMENTS ||
      childElementDepth > MAXIMUM_HTML_ELEMENT_DEPTH
    ) {
      return false;
    }
    const name = staticElementName(node);
    if (name === null) {
      return false;
    }
    const selfClosing = directChildren(node).some((child) => child.kind() === "self_closing_tag");
    const endTags = directChildren(node).filter((child) => child.kind() === "end_tag");
    if (selfClosing) {
      if (!HTML_VOID_ELEMENTS.has(name) || endTags.length !== 0) {
        return false;
      }
    } else if (endTags.length === 0) {
      if (!HTML_VOID_ELEMENTS.has(name)) {
        return false;
      }
    } else {
      const endName = directTagName(node, "end_tag");
      if (endTags.length !== 1 || endName !== name) {
        return false;
      }
    }
    if ((node.kind() === "script_element" || node.kind() === "style_element") && endTags.length !== 1) {
      return false;
    }
  }
  return directChildren(node).every((child) =>
    hasValidHtmlStructure(child, state, childElementDepth)
  );
}

function fileSymbol(input: HtmlExtractFileFactsInput): SymbolNode {
  const fileName = input.filePath.split(/[\\/]/u).at(-1) ?? input.filePath;
  return {
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
    range: documentRange(input.sourceText),
    isExported: true,
    declarationOrdinal: 0
  };
}

function fileOnlyFacts(file: SymbolNode): ArtifactFacts {
  return {
    symbols: [file],
    edges: [],
    pendingReferences: [],
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: []
  };
}

/** Extracts syntax-proven HTML elements and direct DOM containment only. */
export function extractHtmlFileFacts(input: HtmlExtractFileFactsInput): ArtifactFacts {
  const file = fileSymbol(input);
  const parserSource = parserSourceText(input.sourceText);
  if (parserSource === null) {
    return fileOnlyFacts(file);
  }
  let root: SgNode;
  try {
    root = html.parse(parserSource).root();
  } catch {
    return fileOnlyFacts(file);
  }
  if (
    root.kind() !== "document" ||
    !hasValidHtmlStructure(root, { elementCount: 0 })
  ) {
    return fileOnlyFacts(file);
  }
  const symbols: SymbolNode[] = [file];
  const edges: GraphEdge[] = [];

  function visitChildren(parentNode: SgNode, parentSymbol: SymbolNode, parentPath: string): void {
    const siblingOrdinals = new Map<string, number>();
    for (const child of directChildren(parentNode)) {
      if (!HTML_ELEMENT_KINDS.has(String(child.kind()))) {
        continue;
      }
      const name = staticElementName(child);
      if (name === null) {
        continue;
      }
      const ordinal = (siblingOrdinals.get(name) ?? 0) + 1;
      siblingOrdinals.set(name, ordinal);
      const path = parentPath.length === 0 ? `${name}[${ordinal}]` : `${parentPath}/${name}[${ordinal}]`;
      const qualifiedName = `${input.filePath}#html-element:${path}`;
      const range = sourceRange(child);
      const symbol: SymbolNode = {
        id: createSymbolId({
          filePath: input.filePath,
          qualifiedName,
          kind: "resource",
          declarationOrdinal: 0
        }),
        name,
        qualifiedName,
        kind: "resource",
        filePath: input.filePath,
        range,
        isExported: parentSymbol.kind === "file",
        declarationOrdinal: 0
      };
      symbols.push(symbol);
      edges.push({
        id: createEdgeId({
          sourceId: parentSymbol.id,
          targetId: symbol.id,
          kind: "contains",
          line: range.start.line,
          column: range.start.column,
          referenceName: name
        }),
        sourceId: parentSymbol.id,
        targetId: symbol.id,
        kind: "contains",
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName: name,
        evidence: {
          ruleId: parentSymbol.kind === "file" ? "syntax.html.root-element" : "syntax.html.direct-child-element",
          stage: "syntax",
          candidateSymbolIds: [symbol.id]
        }
      });
      visitChildren(child, symbol, path);
    }
  }

  visitChildren(root, file, "");
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
