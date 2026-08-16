import { posix } from "node:path";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type JspTaglibFact,
  type JspTemplateReferenceFact,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface JspExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "jsp";
}

const MAXIMUM_JSP_NODES = 50_000;
const MAXIMUM_JSP_DEPTH = 256;
const MAXIMUM_JSP_NAME_LENGTH = 160;
const MAXIMUM_JSP_ATTRIBUTES = 256;
const MAXIMUM_JSP_ATTRIBUTE_NAME_LENGTH = 160;
const MAXIMUM_JSP_ATTRIBUTE_VALUE_LENGTH = 32_768;

const JSP_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*$/u;
const JSP_ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/u;
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
const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set(["script", "style", "textarea", "title"]);

interface ParsedAttribute {
  readonly name: string;
  readonly value: string | null;
  readonly start: number;
  readonly end: number;
}

interface ParsedTag {
  readonly name: string;
  readonly attributes: readonly ParsedAttribute[];
  readonly selfClosing: boolean;
}

interface JspResourceRecord {
  readonly recordKind: "directive" | "element";
  readonly name: string;
  readonly qualifiedName: string;
  readonly start: number;
  end: number;
  readonly parentRecord: number | null;
  readonly ruleId: string;
  readonly attributes: readonly ParsedAttribute[];
  symbol?: SymbolNode;
}

interface OpenElement {
  readonly name: string;
  readonly normalizedName: string;
  readonly recordIndex: number;
}

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
    if ((lineStarts[middle] ?? 0) <= offset) {
      lower = middle;
    } else {
      upper = middle;
    }
  }
  return { line: lower + 1, column: offset - (lineStarts[lower] ?? 0) + 1 };
}

function rangeForSpan(
  lineStarts: readonly number[],
  start: number,
  end: number
): SourceRange {
  return { start: positionFor(lineStarts, start), end: positionFor(lineStarts, end) };
}

function fileSymbol(input: JspExtractFileFactsInput): SymbolNode {
  const fileName = input.filePath.split(/[\\/]/u).at(-1) ?? input.filePath;
  const lineStarts = lineStartsFor(input.sourceText);
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
    range: rangeForSpan(lineStarts, 0, input.sourceText.length),
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

function closingDelimiterOutsideQuotes(
  sourceText: string,
  start: number,
  delimiter: string
): number | null {
  let quote: "\"" | "'" | null = null;
  let escaped = false;
  for (let index = start; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (sourceText.startsWith(delimiter, index)) {
      return index;
    }
  }
  return null;
}

function parseAttributes(text: string, sourceOffset: number): readonly ParsedAttribute[] | null {
  const attributes: ParsedAttribute[] = [];
  const attributeNames = new Set<string>();
  let cursor = 0;
  while (cursor < text.length) {
    while (/\s/u.test(text[cursor] ?? "")) {
      cursor += 1;
    }
    if (cursor >= text.length) {
      return attributes;
    }
    const nameStart = cursor;
    while (cursor < text.length && !/[\s=]/u.test(text[cursor] ?? "")) {
      cursor += 1;
    }
    const name = text.slice(nameStart, cursor);
    if (!JSP_ATTRIBUTE_NAME.test(name) || name.length > MAXIMUM_JSP_ATTRIBUTE_NAME_LENGTH) {
      return null;
    }
    if (attributeNames.has(name)) {
      return null;
    }
    attributeNames.add(name);
    while (/\s/u.test(text[cursor] ?? "")) {
      cursor += 1;
    }
    let value: string | null = null;
    if (text[cursor] === "=") {
      cursor += 1;
      while (/\s/u.test(text[cursor] ?? "")) {
        cursor += 1;
      }
      const quote = text[cursor];
      if (quote === "\"" || quote === "'") {
        cursor += 1;
        const valueStart = cursor;
        while (cursor < text.length && text[cursor] !== quote) {
          cursor += 1;
        }
        if (cursor >= text.length) {
          return null;
        }
        value = text.slice(valueStart, cursor);
        cursor += 1;
      } else {
        const valueStart = cursor;
        while (cursor < text.length && !/\s/u.test(text[cursor] ?? "")) {
          if (/[<>"'`=]/u.test(text[cursor] ?? "")) {
            return null;
          }
          cursor += 1;
        }
        if (cursor === valueStart) {
          return null;
        }
        value = text.slice(valueStart, cursor);
      }
      if (value.length > MAXIMUM_JSP_ATTRIBUTE_VALUE_LENGTH) {
        return null;
      }
    }
    attributes.push({
      name,
      value,
      start: sourceOffset + nameStart,
      end: sourceOffset + cursor
    });
    if (attributes.length > MAXIMUM_JSP_ATTRIBUTES) {
      return null;
    }
  }
  return attributes;
}

function parseOpeningTag(sourceText: string, start: number, end: number): ParsedTag | null {
  let content = sourceText.slice(start + 1, end);
  const selfClosing = /\/\s*$/u.test(content);
  if (selfClosing) {
    content = content.replace(/\/\s*$/u, "");
  }
  const nameMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)/u.exec(content);
  const name = nameMatch?.[1];
  if (name === undefined || name.length > MAXIMUM_JSP_NAME_LENGTH) {
    return null;
  }
  const attributesStart = name.length;
  const attributes = parseAttributes(content.slice(attributesStart), start + 1 + attributesStart);
  return attributes === null ? null : { name, attributes, selfClosing };
}

function directiveRecord(
  sourceText: string,
  start: number,
  end: number,
  ordinal: number
): Omit<JspResourceRecord, "parentRecord"> | null {
  const body = sourceText.slice(start + 3, end);
  const match = /^\s*([A-Za-z_][A-Za-z0-9_.:-]*)/u.exec(body);
  const kind = match?.[1];
  if (match === null || kind === undefined || kind.length > MAXIMUM_JSP_NAME_LENGTH) {
    return null;
  }
  const tailStart = match.index + match[0].length;
  const attributes = parseAttributes(body.slice(tailStart), start + 3 + tailStart);
  if (attributes === null) {
    return null;
  }
  const prefix = attributes.find((attribute) => attribute.name === "prefix")?.value;
  const name = kind === "taglib" && prefix !== null && prefix !== undefined
    ? `directive:taglib:${prefix}`
    : `directive:${kind}`;
  return {
    recordKind: "directive",
    name,
    qualifiedName: `jsp-directive:${kind}:${prefix ?? ""}:${ordinal}`,
    start,
    end: end + 2,
    ruleId: "syntax.jsp.complete-directive",
    attributes
  };
}

function normalizedElementName(name: string, xmlSyntax: boolean): string {
  return xmlSyntax ? name : name.toLowerCase();
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function parseJspResources(
  sourceText: string,
  xmlSyntax: boolean
): readonly JspResourceRecord[] | null {
  const records: JspResourceRecord[] = [];
  const stack: OpenElement[] = [];
  const childOrdinals = new Map<string, Map<string, number>>();
  const directiveOrdinals = new Map<string, number>();
  let cursor = 0;

  const nextOrdinal = (parentRecord: number | null, name: string): number => {
    const parentKey = parentRecord === null ? "file" : String(parentRecord);
    const siblings = childOrdinals.get(parentKey) ?? new Map<string, number>();
    childOrdinals.set(parentKey, siblings);
    const ordinal = (siblings.get(name) ?? 0) + 1;
    siblings.set(name, ordinal);
    return ordinal;
  };

  while (cursor < sourceText.length) {
    if (records.length > MAXIMUM_JSP_NODES || stack.length > MAXIMUM_JSP_DEPTH) {
      return null;
    }
    const rawElement = stack.at(-1);
    if (
      rawElement !== undefined &&
      RAW_TEXT_ELEMENTS.has(xmlSyntax ? rawElement.normalizedName.toLowerCase() : rawElement.normalizedName)
    ) {
      const closePattern = new RegExp(
        `</${escapeRegularExpression(rawElement.name)}\\s*>`,
        xmlSyntax ? "gu" : "igu"
      );
      closePattern.lastIndex = cursor;
      const close = closePattern.exec(sourceText);
      if (close === null) {
        return null;
      }
      cursor = close.index;
    }
    const opening = sourceText.indexOf("<", cursor);
    if (opening === -1) {
      break;
    }
    cursor = opening;
    if (sourceText.startsWith("<%--", cursor)) {
      const end = sourceText.indexOf("--%>", cursor + 4);
      if (end === -1) {
        return null;
      }
      cursor = end + 4;
      continue;
    }
    if (sourceText.startsWith("<!--", cursor)) {
      const end = sourceText.indexOf("-->", cursor + 4);
      if (end === -1) {
        return null;
      }
      cursor = end + 3;
      continue;
    }
    if (sourceText.startsWith("<%@", cursor)) {
      const end = closingDelimiterOutsideQuotes(sourceText, cursor + 3, "%>");
      if (end === null) {
        return null;
      }
      const bodyKind = /^\s*([A-Za-z_][A-Za-z0-9_.:-]*)/u.exec(
        sourceText.slice(cursor + 3, end)
      )?.[1];
      if (bodyKind === undefined) {
        return null;
      }
      const ordinal = directiveOrdinals.get(bodyKind) ?? 0;
      directiveOrdinals.set(bodyKind, ordinal + 1);
      const record = directiveRecord(sourceText, cursor, end, ordinal);
      if (record === null) {
        return null;
      }
      records.push({ ...record, parentRecord: null });
      cursor = end + 2;
      continue;
    }
    if (
      sourceText.startsWith("<%!", cursor) ||
      sourceText.startsWith("<%=", cursor) ||
      sourceText.startsWith("<%", cursor)
    ) {
      const end = sourceText.indexOf("%>", cursor + 2);
      if (end === -1) {
        return null;
      }
      cursor = end + 2;
      continue;
    }
    if (sourceText.startsWith("<?", cursor)) {
      const end = closingDelimiterOutsideQuotes(sourceText, cursor + 2, "?>");
      if (end === null) {
        return null;
      }
      cursor = end + 2;
      continue;
    }
    if (/^<!doctype\b/iu.test(sourceText.slice(cursor, cursor + 16))) {
      const end = closingDelimiterOutsideQuotes(sourceText, cursor + 2, ">");
      if (end === null) {
        return null;
      }
      cursor = end + 1;
      continue;
    }
    if (sourceText.startsWith("</", cursor)) {
      const end = closingDelimiterOutsideQuotes(sourceText, cursor + 2, ">");
      if (end === null) {
        return null;
      }
      const body = sourceText.slice(cursor + 2, end).trim();
      if (!JSP_NAME.test(body)) {
        return null;
      }
      const open = stack.pop();
      if (open === undefined || open.normalizedName !== normalizedElementName(body, xmlSyntax)) {
        return null;
      }
      const record = records[open.recordIndex];
      if (record === undefined) {
        return null;
      }
      record.end = end + 1;
      cursor = end + 1;
      continue;
    }
    if (sourceText.startsWith("<!", cursor)) {
      return null;
    }
    const end = closingDelimiterOutsideQuotes(sourceText, cursor + 1, ">");
    if (end === null) {
      return null;
    }
    const tag = parseOpeningTag(sourceText, cursor, end);
    if (tag === null) {
      return null;
    }
    const parentRecord = stack.at(-1)?.recordIndex ?? null;
    const normalizedName = normalizedElementName(tag.name, xmlSyntax);
    const ordinal = nextOrdinal(parentRecord, normalizedName);
    const parentPath = parentRecord === null ? "" : records[parentRecord]?.qualifiedName ?? "";
    const qualifiedName = parentPath.length === 0
      ? `jsp-element:${normalizedName}[${ordinal}]`
      : `${parentPath}/${normalizedName}[${ordinal}]`;
    const recordIndex = records.length;
    records.push({
      recordKind: "element",
      name: tag.name,
      qualifiedName,
      start: cursor,
      end: end + 1,
      parentRecord,
      ruleId: parentRecord === null ? "syntax.jsp.root-resource" : "syntax.jsp.direct-child-resource",
      attributes: tag.attributes
    });
    if (!tag.selfClosing && (xmlSyntax || !HTML_VOID_ELEMENTS.has(normalizedName))) {
      stack.push({ name: tag.name, normalizedName, recordIndex });
    }
    cursor = end + 1;
  }
  return stack.length === 0 ? records : null;
}

function attributeValue(record: JspResourceRecord, name: string): string | null | undefined {
  return record.attributes.find((attribute) => attribute.name === name)?.value;
}

function hasDynamicJspValue(value: string): boolean {
  return /(?:<%|%>|\$\{|#\{)/u.test(value);
}

function conventionalJspWebRoot(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  for (const marker of ["src/main/webapp/", "WebContent/", "webapp/", "docroot/"]) {
    let index = normalized.indexOf(marker);
    while (index !== -1) {
      if (index === 0 || normalized[index - 1] === "/") {
        return normalized.slice(0, index + marker.length - 1);
      }
      index = normalized.indexOf(marker, index + 1);
    }
  }
  const webInf = normalized.indexOf("/WEB-INF/");
  return webInf === -1 ? "" : normalized.slice(0, webInf);
}

function safeProjectRelativePath(value: string): string | null {
  const normalized = posix.normalize(value.replaceAll("\\", "/"));
  return normalized === ".." || normalized.startsWith("../") || posix.isAbsolute(normalized)
    ? null
    : normalized.replace(/^\.\//u, "");
}

function literalJspTargetPath(sourceFilePath: string, value: string): string | null {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 2_048 ||
    hasDynamicJspValue(trimmed) ||
    /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/u.test(trimmed) ||
    /[?#]/u.test(trimmed)
  ) {
    return null;
  }
  const source = sourceFilePath.replaceAll("\\", "/");
  const webRoot = conventionalJspWebRoot(source);
  if (trimmed.startsWith("/") && webRoot.length === 0) {
    return null;
  }
  const candidate = trimmed.startsWith("/")
    ? posix.join(webRoot, trimmed.slice(1))
    : posix.join(posix.dirname(source), trimmed);
  return safeProjectRelativePath(candidate);
}

function opaqueJspSpans(
  sourceText: string,
  records: readonly JspResourceRecord[]
): readonly { readonly start: number; readonly end: number }[] | null {
  const spans: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor < sourceText.length) {
    const start = sourceText.indexOf("<", cursor);
    if (start === -1) {
      break;
    }
    if (sourceText.startsWith("<%--", start)) {
      const end = sourceText.indexOf("--%>", start + 4);
      if (end === -1) {
        return null;
      }
      spans.push({ start, end: end + 4 });
      cursor = end + 4;
      continue;
    }
    if (sourceText.startsWith("<%", start)) {
      const end = sourceText.indexOf("%>", start + 2);
      if (end === -1) {
        return null;
      }
      spans.push({ start, end: end + 2 });
      cursor = end + 2;
      continue;
    }
    if (sourceText.startsWith("<!--", start)) {
      const end = sourceText.indexOf("-->", start + 4);
      if (end === -1) {
        return null;
      }
      spans.push({ start, end: end + 3 });
      cursor = end + 3;
      continue;
    }
    cursor = start + 1;
  }
  for (const record of records) {
    if (
      record.recordKind === "element" &&
      RAW_TEXT_ELEMENTS.has(record.name.toLowerCase())
    ) {
      spans.push({ start: record.start, end: record.end });
    }
  }
  return spans.sort((left, right) => left.start - right.start || left.end - right.end);
}

function isWithinSpan(
  spans: readonly { readonly start: number; readonly end: number }[],
  start: number
): boolean {
  return spans.some((span) => span.start <= start && start < span.end);
}

function closingElExpression(sourceText: string, start: number): number | null {
  let depth = 1;
  let quote: "\"" | "'" | null = null;
  let escaped = false;
  for (let cursor = start + 2; cursor < sourceText.length; cursor += 1) {
    const character = sourceText[cursor];
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return cursor + 1;
      }
    }
  }
  return null;
}

interface JspExpressionRecord {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly parentRecord: number | null;
}

function collectJspExpressions(
  sourceText: string,
  records: readonly JspResourceRecord[]
): readonly JspExpressionRecord[] | null {
  const opaque = opaqueJspSpans(sourceText, records);
  if (opaque === null) {
    return null;
  }
  const expressions: JspExpressionRecord[] = [];
  for (let cursor = 0; cursor < sourceText.length - 1; cursor += 1) {
    if (
      (sourceText[cursor] !== "$" && sourceText[cursor] !== "#") ||
      sourceText[cursor + 1] !== "{" ||
      sourceText[cursor - 1] === "\\" ||
      isWithinSpan(opaque, cursor)
    ) {
      continue;
    }
    const end = closingElExpression(sourceText, cursor);
    if (end === null || end - cursor > 4_096) {
      return null;
    }
    const body = sourceText.slice(cursor + 2, end - 1).trim();
    if (body.length === 0) {
      return null;
    }
    const pathParts = body.split(/\s*\.\s*/u);
    const isStaticPath = pathParts.every((part) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(part));
    const containing = records
      .map((record, recordIndex) => ({ record, recordIndex }))
      .filter(
        ({ record }) =>
          record.recordKind === "element" && record.start <= cursor && end <= record.end
      )
      .sort((left, right) =>
        left.record.end - left.record.start - (right.record.end - right.record.start)
      )[0];
    if (isStaticPath) {
      expressions.push({
        name: `el-path:${pathParts.join(".")}`,
        start: cursor,
        end,
        parentRecord: containing?.recordIndex ?? null
      });
    }
    cursor = end - 1;
  }
  return expressions;
}

const JSTL_CORE_URIS: ReadonlySet<string> = new Set([
  "jakarta.tags.core",
  "http://java.sun.com/jsp/jstl/core",
  "http://xmlns.jcp.org/jsp/jstl/core"
]);

function jstlSemanticName(localName: string): string | null {
  if (["if", "choose", "when", "otherwise"].includes(localName)) {
    return "conditional";
  }
  if (["forEach", "forTokens"].includes(localName)) {
    return "iteration";
  }
  if (["set", "remove", "catch"].includes(localName)) {
    return "binding";
  }
  if (["import", "url", "redirect"].includes(localName)) {
    return "resource";
  }
  if (["out"].includes(localName)) {
    return "output";
  }
  return null;
}

/** Extracts complete JSP directives and balanced template resources with direct containment only. */
export function extractJspFileFacts(input: JspExtractFileFactsInput): ArtifactFacts {
  const file = fileSymbol(input);
  const xmlSyntax = /\.(?:jspx|tagx)$/iu.test(input.filePath);
  const records = parseJspResources(input.sourceText, xmlSyntax);
  if (records === null) {
    return fileOnlyFacts(file);
  }
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [file];
  const edges: GraphEdge[] = [];
  const symbolOrdinals = new Map<string, number>();

  for (const record of records) {
    const declarationOrdinal = symbolOrdinals.get(record.qualifiedName) ?? 0;
    symbolOrdinals.set(record.qualifiedName, declarationOrdinal + 1);
    const qualifiedName = `${input.filePath}#${record.qualifiedName}`;
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "resource",
        declarationOrdinal
      }),
      name: record.name,
      qualifiedName,
      kind: "resource",
      filePath: input.filePath,
      range: rangeForSpan(lineStarts, record.start, record.end),
      isExported: record.parentRecord === null,
      declarationOrdinal
    };
    record.symbol = symbol;
    symbols.push(symbol);
  }
  for (const record of records) {
    const target = record.symbol;
    const source = record.parentRecord === null ? file : records[record.parentRecord]?.symbol;
    if (target === undefined || source === undefined) {
      return fileOnlyFacts(file);
    }
    edges.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: target.id,
        kind: "contains",
        line: target.range.start.line,
        column: target.range.start.column,
        referenceName: target.name
      }),
      sourceId: source.id,
      targetId: target.id,
      kind: "contains",
      filePath: input.filePath,
      range: target.range,
      resolution: "exact",
      confidence: 1,
      referenceName: target.name,
      evidence: {
        ruleId: record.ruleId,
        stage: "syntax",
        candidateSymbolIds: [target.id]
      }
    });
  }

  const taglibs: JspTaglibFact[] = [];
  const templateReferences: JspTemplateReferenceFact[] = [];
  const tagDirectories = new Map<string, string>();
  const jstlCorePrefixes = new Set<string>();
  const taglibPrefixCounts = new Map<string, number>();
  for (const record of records) {
    if (record.recordKind !== "directive" || !record.name.startsWith("directive:taglib:")) {
      continue;
    }
    const prefix = attributeValue(record, "prefix");
    if (prefix !== null && prefix !== undefined) {
      taglibPrefixCounts.set(prefix, (taglibPrefixCounts.get(prefix) ?? 0) + 1);
    }
  }
  const addDetailResource = (
    parent: SymbolNode,
    name: string,
    range: SourceRange,
    identity: string,
    ruleId: string
  ): SymbolNode => {
    const ordinalKey = `${parent.id}:${identity}`;
    const declarationOrdinal = symbolOrdinals.get(ordinalKey) ?? 0;
    symbolOrdinals.set(ordinalKey, declarationOrdinal + 1);
    const qualifiedName = `${parent.qualifiedName}#jsp-${identity}`;
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "resource",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "resource",
      filePath: input.filePath,
      range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(symbol);
    edges.push({
      id: createEdgeId({
        sourceId: parent.id,
        targetId: symbol.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: name
      }),
      sourceId: parent.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: name,
      evidence: { ruleId, stage: "syntax", candidateSymbolIds: [symbol.id] }
    });
    return symbol;
  };

  for (const record of records) {
    const owner = record.symbol;
    if (owner === undefined) {
      return fileOnlyFacts(file);
    }
    for (const attribute of record.attributes) {
      const exposedValue =
        attribute.value !== null &&
        attribute.value.length <= 256 &&
        !hasDynamicJspValue(attribute.value)
          ? `=${attribute.value}`
          : "";
      addDetailResource(
        owner,
        `attribute:${attribute.name}${exposedValue}`,
        rangeForSpan(lineStarts, attribute.start, attribute.end),
        `attribute:${attribute.name}`,
        "syntax.jsp.static-attribute"
      );
    }
    if (record.recordKind !== "directive" || !record.name.startsWith("directive:taglib:")) {
      continue;
    }
    const prefix = attributeValue(record, "prefix");
    const uri = attributeValue(record, "uri");
    const tagDir = attributeValue(record, "tagdir");
    if (
      prefix === null ||
      prefix === undefined ||
      !/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(prefix) ||
      taglibPrefixCounts.get(prefix) !== 1 ||
      (uri !== undefined && uri !== null && hasDynamicJspValue(uri)) ||
      (tagDir !== undefined && tagDir !== null && hasDynamicJspValue(tagDir))
    ) {
      continue;
    }
    const literalUri = uri ?? undefined;
    const literalTagDir = tagDir ?? undefined;
    taglibs.push({
      sourceId: owner.id,
      filePath: input.filePath,
      prefix,
      ...(literalUri === undefined ? {} : { uri: literalUri }),
      ...(literalTagDir === undefined ? {} : { tagDir: literalTagDir }),
      range: owner.range
    });
    const binding = literalTagDir ?? literalUri;
    if (binding !== undefined) {
      addDetailResource(
        owner,
        `taglib:${prefix}=${binding}`,
        owner.range,
        `taglib:${prefix}`,
        "syntax.jsp.literal-taglib-binding"
      );
    }
    if (literalTagDir !== undefined) {
      tagDirectories.set(prefix, literalTagDir);
    }
    if (literalUri !== undefined && JSTL_CORE_URIS.has(literalUri)) {
      jstlCorePrefixes.add(prefix);
    }
  }

  const addTemplateReference = (
    record: JspResourceRecord,
    kind: JspTemplateReferenceFact["kind"],
    targetFilePaths: readonly string[]
  ): void => {
    const source = record.symbol;
    if (source === undefined || targetFilePaths.length === 0) {
      return;
    }
    templateReferences.push({
      sourceId: source.id,
      filePath: input.filePath,
      kind,
      targetFilePaths,
      referenceName: `${kind} ${targetFilePaths.join("|")}`,
      range: source.range
    });
  };

  for (const record of records) {
    if (record.recordKind === "directive" && record.name === "directive:include") {
      const value = attributeValue(record, "file");
      const target = value === null || value === undefined
        ? null
        : literalJspTargetPath(input.filePath, value);
      if (target !== null) {
        addTemplateReference(record, "include-directive", [target]);
      }
      continue;
    }
    if (record.recordKind !== "element") {
      continue;
    }
    const normalizedName = normalizedElementName(record.name, xmlSyntax);
    if (normalizedName === "jsp:include" || normalizedName === "jsp:forward") {
      const value = attributeValue(record, "page");
      const target = value === null || value === undefined
        ? null
        : literalJspTargetPath(input.filePath, value);
      if (target !== null) {
        addTemplateReference(
          record,
          normalizedName === "jsp:include" ? "include-action" : "forward-action",
          [target]
        );
      }
    }
    const separator = record.name.indexOf(":");
    if (separator !== -1) {
      const prefix = record.name.slice(0, separator);
      const localName = record.name.slice(separator + 1);
      const tagDir = tagDirectories.get(prefix);
      if (tagDir !== undefined && /^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(localName)) {
        const tagBase = literalJspTargetPath(input.filePath, `${tagDir}/${localName}`);
        if (tagBase !== null) {
          addTemplateReference(record, "tag-file", [`${tagBase}.tag`, `${tagBase}.tagx`]);
        }
      }
      if (jstlCorePrefixes.has(prefix)) {
        const semantic = jstlSemanticName(localName);
        if (semantic !== null && record.symbol !== undefined) {
          addDetailResource(
            record.symbol,
            `jstl:${semantic}:${record.name}`,
            record.symbol.range,
            `jstl-semantic:${semantic}`,
            "syntax.jsp.locally-bound-jstl-core-semantic"
          );
        }
      }
    }
  }

  const elPolicies = records
    .filter(
      (record) =>
        record.recordKind === "directive" &&
        (record.name === "directive:page" || record.name === "directive:tag")
    )
    .map((record) => attributeValue(record, "isELIgnored"))
    .filter((value): value is string | null => value !== undefined);
  const elEnabled = elPolicies.every(
    (value) => value !== null && value.toLowerCase() === "false"
  );
  const expressions = elEnabled ? collectJspExpressions(input.sourceText, records) : [];
  if (expressions === null) {
    return fileOnlyFacts(file);
  }
  for (const expression of expressions) {
    const parent = expression.parentRecord === null
      ? file
      : records[expression.parentRecord]?.symbol;
    if (parent === undefined) {
      return fileOnlyFacts(file);
    }
    addDetailResource(
      parent,
      expression.name,
      rangeForSpan(lineStarts, expression.start, expression.end),
      `el:${expression.name}`,
      "syntax.jsp.complete-el-property-path"
    );
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
    jspFacts: { taglibs, templateReferences }
  };
}
