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
const HTML_ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/u;
const HTML_STATIC_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
  "alt",
  "autofocus",
  "checked",
  "class",
  "disabled",
  "formnovalidate",
  "hidden",
  "id",
  "lang",
  "multiple",
  "name",
  "novalidate",
  "open",
  "placeholder",
  "readonly",
  "required",
  "role",
  "scope",
  "selected",
  "title",
  "type",
  "value"
]);
const HTML_BOOLEAN_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
  "autofocus",
  "checked",
  "disabled",
  "formnovalidate",
  "hidden",
  "multiple",
  "novalidate",
  "open",
  "readonly",
  "required",
  "selected"
]);
const HTML_INTERACTIVE_FORM_CONTROLS: ReadonlySet<string> = new Set([
  "button",
  "input",
  "select",
  "textarea"
]);
const HTML_RCDATA_ELEMENTS: ReadonlySet<string> = new Set(["textarea", "title"]);
const HTML_RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set(["script", "style"]);
export const MAXIMUM_HTML_ELEMENT_DEPTH = 256;
export const MAXIMUM_HTML_ELEMENTS = 10_000;
export const MAXIMUM_HTML_ATTRIBUTES_PER_ELEMENT = 256;
export const MAXIMUM_HTML_ATTRIBUTE_NAME_LENGTH = 256;
export const MAXIMUM_HTML_ATTRIBUTE_VALUE_LENGTH = 4_096;

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

interface StaticHtmlAttribute {
  readonly name: string;
  readonly value: string | null;
  readonly node: SgNode;
}

function startTag(node: SgNode): SgNode | null {
  const tags = directChildren(node).filter(
    (child) => child.kind() === "start_tag" || child.kind() === "self_closing_tag"
  );
  return tags.length === 1 ? tags[0] ?? null : null;
}

function staticAttributeValue(node: SgNode): string | null {
  const valueNode = directChildren(node).find(
    (child) => child.kind() === "quoted_attribute_value" || child.kind() === "attribute_value"
  );
  if (valueNode === undefined) {
    return null;
  }
  const text = valueNode.text();
  if (
    valueNode.kind() === "quoted_attribute_value" &&
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function staticAttributes(node: SgNode): readonly StaticHtmlAttribute[] {
  const tag = startTag(node);
  if (tag === null) {
    return [];
  }
  const attributes: StaticHtmlAttribute[] = [];
  for (const attributeNode of directChildren(tag).filter((child) => child.kind() === "attribute")) {
    const nameNodes = directChildren(attributeNode).filter(
      (child) => child.kind() === "attribute_name"
    );
    if (nameNodes.length !== 1 || nameNodes[0] === undefined) {
      continue;
    }
    const name = nameNodes[0].text().toLowerCase();
    if (!HTML_ATTRIBUTE_NAME.test(name)) {
      continue;
    }
    attributes.push({ name, value: staticAttributeValue(attributeNode), node: attributeNode });
  }
  return attributes;
}

function isExposedStaticAttribute(name: string): boolean {
  return (
    HTML_STATIC_ATTRIBUTE_NAMES.has(name) || name.startsWith("aria-") || name.startsWith("data-")
  );
}

function hasTemplateAttributeSyntax(value: string): boolean {
  return /(?:\{\{|\}\}|\{%|%\}|<%|%>|\$\{)/u.test(value);
}

function isProvenStaticAttribute(attribute: StaticHtmlAttribute): boolean {
  return attribute.value === null || !hasTemplateAttributeSyntax(attribute.value);
}

function isProvenInteractiveFormControl(
  elementName: string,
  attributes: readonly StaticHtmlAttribute[]
): boolean {
  if (!HTML_INTERACTIVE_FORM_CONTROLS.has(elementName)) {
    return false;
  }
  if (attributes.some((attribute) => attribute.name === "disabled" || attribute.name === "hidden")) {
    return false;
  }
  if (elementName !== "input") {
    return true;
  }
  const type = attributes.find((attribute) => attribute.name === "type");
  if (type === undefined) {
    return true;
  }
  return (
    isProvenStaticAttribute(type) &&
    type.value !== null &&
    type.value.toLowerCase() !== "hidden"
  );
}

function semanticClassification(elementName: string, parentElementName: string): string | null {
  if (/^h[1-6]$/u.test(elementName)) {
    return `heading:${elementName}`;
  }
  if (["header", "footer"].includes(elementName)) {
    return parentElementName === "body" ? `landmark:${elementName}` : `section:${elementName}`;
  }
  if (["nav", "main", "aside"].includes(elementName)) {
    return `landmark:${elementName}`;
  }
  if (elementName === "form") {
    return "form:form";
  }
  if (["input", "select", "textarea", "button", "output"].includes(elementName)) {
    return `form-control:${elementName}`;
  }
  if (["table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption"].includes(elementName)) {
    return `table:${elementName}`;
  }
  if (["ul", "ol", "li", "dl", "dt", "dd"].includes(elementName)) {
    return `list:${elementName}`;
  }
  return null;
}

function directElementNames(node: SgNode): readonly string[] {
  const names: string[] = [];
  for (const child of directChildren(node)) {
    if (!HTML_ELEMENT_KINDS.has(String(child.kind()))) {
      continue;
    }
    const name = staticElementName(child);
    if (name !== null) {
      names.push(name);
    }
  }
  return names;
}

function hasDescendantElement(node: SgNode, expectedName: string): boolean {
  for (const child of directChildren(node)) {
    if (!HTML_ELEMENT_KINDS.has(String(child.kind()))) {
      continue;
    }
    if (staticElementName(child) === expectedName || hasDescendantElement(child, expectedName)) {
      return true;
    }
  }
  return false;
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
    const attributes = staticAttributes(node);
    if (
      attributes.length > MAXIMUM_HTML_ATTRIBUTES_PER_ELEMENT ||
      attributes.some(
        (attribute) =>
          attribute.name.length > MAXIMUM_HTML_ATTRIBUTE_NAME_LENGTH ||
          (attribute.value?.length ?? 0) > MAXIMUM_HTML_ATTRIBUTE_VALUE_LENGTH
      )
    ) {
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
  const elementRecords: Array<{
    readonly name: string;
    readonly node: SgNode;
    readonly symbol: SymbolNode;
    readonly attributes: readonly StaticHtmlAttribute[];
    readonly addDiagnostic: (name: string, range: SourceRange) => void;
  }> = [];

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
      const childResourceOrdinals = new Map<string, number>();
      const addElementResource = (
        resourceName: string,
        resourceType: "attribute" | "semantic" | "diagnostic",
        resourceRange: SourceRange,
        ruleId: string
      ): void => {
        const identity = `${resourceType}:${resourceName}`;
        const declarationOrdinal = childResourceOrdinals.get(identity) ?? 0;
        childResourceOrdinals.set(identity, declarationOrdinal + 1);
        const resourceQualifiedName = `${qualifiedName}#html-${resourceType}:${resourceName}`;
        const resource: SymbolNode = {
          id: createSymbolId({
            filePath: input.filePath,
            qualifiedName: resourceQualifiedName,
            kind: "resource",
            declarationOrdinal
          }),
          name: resourceName,
          qualifiedName: resourceQualifiedName,
          kind: "resource",
          filePath: input.filePath,
          range: resourceRange,
          isExported: false,
          declarationOrdinal
        };
        symbols.push(resource);
        edges.push({
          id: createEdgeId({
            sourceId: symbol.id,
            targetId: resource.id,
            kind: "contains",
            line: resourceRange.start.line,
            column: resourceRange.start.column,
            referenceName: resource.name
          }),
          sourceId: symbol.id,
          targetId: resource.id,
          kind: "contains",
          filePath: input.filePath,
          range: resourceRange,
          resolution: "exact",
          confidence: 1,
          referenceName: resource.name,
          evidence: { ruleId, stage: "syntax", candidateSymbolIds: [resource.id] }
        });
      };
      for (const attribute of staticAttributes(child)) {
        if (isExposedStaticAttribute(attribute.name) && isProvenStaticAttribute(attribute)) {
          addElementResource(
            attribute.value === null ? attribute.name : `${attribute.name}=${attribute.value}`,
            "attribute",
            sourceRange(attribute.node),
            "syntax.html.static-attribute"
          );
        }
      }
      const semantic = semanticClassification(name, parentSymbol.name);
      if (semantic !== null) {
        addElementResource(semantic, "semantic", range, "syntax.html.element-semantic");
      }
      const attributes = staticAttributes(child);
      elementRecords.push({
        name,
        node: child,
        symbol,
        attributes,
        addDiagnostic: (diagnosticName, diagnosticRange) =>
          addElementResource(
            diagnosticName,
            "diagnostic",
            diagnosticRange,
            "syntax.html.local-diagnostic"
          )
      });
      visitChildren(child, symbol, path);
    }
  }

  visitChildren(root, file, "");

  const htmlElement = elementRecords.find((record) => record.name === "html");
  const htmlLang = htmlElement?.attributes.find((attribute) => attribute.name === "lang");
  if (
    htmlElement !== undefined &&
    (htmlLang === undefined ||
      (isProvenStaticAttribute(htmlLang) && (htmlLang.value ?? "").trim() === ""))
  ) {
    htmlElement.addDiagnostic("diagnostic:html-missing-lang", htmlElement.symbol.range);
  }

  const ids = new Map<string, StaticHtmlAttribute[]>();
  for (const record of elementRecords) {
    const seenAttributes = new Set<string>();
    for (const attribute of record.attributes) {
      if (seenAttributes.has(attribute.name)) {
        record.addDiagnostic(
          `diagnostic:duplicate-attribute:${attribute.name}`,
          sourceRange(attribute.node)
        );
      }
      seenAttributes.add(attribute.name);
      if (
        HTML_BOOLEAN_ATTRIBUTE_NAMES.has(attribute.name) &&
        isProvenStaticAttribute(attribute) &&
        attribute.value !== null &&
        attribute.value !== "" &&
        attribute.value.toLowerCase() !== attribute.name
      ) {
        record.addDiagnostic(
          `diagnostic:boolean-attribute-invalid-value:${attribute.name}`,
          sourceRange(attribute.node)
        );
      }
      if (
        attribute.name === "id" &&
        isProvenStaticAttribute(attribute) &&
        attribute.value !== null &&
        attribute.value.trim() !== ""
      ) {
        const entries = ids.get(attribute.value) ?? [];
        entries.push(attribute);
        ids.set(attribute.value, entries);
      }
    }
    const role = record.attributes.find((attribute) => attribute.name === "role");
    if (
      isProvenInteractiveFormControl(record.name, record.attributes) &&
      role !== undefined &&
      isProvenStaticAttribute(role) &&
      role.value !== null &&
      ["none", "presentation"].includes(role.value.toLowerCase())
    ) {
      record.addDiagnostic(
        "diagnostic:presentational-role-on-form-control",
        sourceRange(role.node)
      );
    }
    const ariaHidden = record.attributes.find((attribute) => attribute.name === "aria-hidden");
    if (
      isProvenInteractiveFormControl(record.name, record.attributes) &&
      ariaHidden !== undefined &&
      isProvenStaticAttribute(ariaHidden) &&
      ariaHidden?.value?.toLowerCase() === "true"
    ) {
      record.addDiagnostic(
        "diagnostic:aria-hidden-interactive-control",
        sourceRange(ariaHidden.node)
      );
    }
    if (record.name === "img" && !record.attributes.some((attribute) => attribute.name === "alt")) {
      record.addDiagnostic("diagnostic:image-missing-alt", record.symbol.range);
    }
    if (
      (record.name === "ul" || record.name === "ol") &&
      directElementNames(record.node).some(
        (childName) => !["li", "script", "template"].includes(childName)
      )
    ) {
      const childName = directElementNames(record.node).find(
        (candidate) => !["li", "script", "template"].includes(candidate)
      );
      if (childName !== undefined) {
        record.addDiagnostic(
          `diagnostic:list-invalid-direct-child:${childName}`,
          record.symbol.range
        );
      }
    }
    if (record.name === "table" && !hasDescendantElement(record.node, "tr")) {
      record.addDiagnostic("diagnostic:table-missing-row", record.symbol.range);
    }
  }

  for (const [id, attributes] of ids) {
    for (const attribute of attributes.slice(1)) {
      const record = elementRecords.find((candidate) => candidate.attributes.includes(attribute));
      record?.addDiagnostic(`diagnostic:duplicate-id:${id}`, sourceRange(attribute.node));
    }
  }

  let previousHeadingLevel: number | null = null;
  for (const record of elementRecords) {
    if (!/^h[1-6]$/u.test(record.name)) {
      continue;
    }
    const level = Number(record.name.slice(1));
    if (previousHeadingLevel !== null && level > previousHeadingLevel + 1) {
      record.addDiagnostic(
        `diagnostic:heading-level-skip:h${previousHeadingLevel}-to-h${level}`,
        record.symbol.range
      );
    }
    previousHeadingLevel = level;
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
