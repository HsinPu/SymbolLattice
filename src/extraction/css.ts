import { css, type SgNode } from "@ast-grep/napi";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface CssExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "css";
}

export const MAXIMUM_CSS_SOURCE_LENGTH = 5_000_000;
export const MAXIMUM_CSS_AST_DEPTH = 256;
export const MAXIMUM_CSS_AST_NODES = 100_000;
export const MAXIMUM_CSS_RESOURCES = 50_000;
export const MAXIMUM_CSS_SELECTOR_LENGTH = 2_048;
export const MAXIMUM_CSS_PROPERTY_NAME_LENGTH = 256;
export const MAXIMUM_CSS_PROPERTY_VALUE_LENGTH = 8_192;

const CSS_AT_RULE_KINDS = new Set([
  "at_rule",
  "charset_statement",
  "container_statement",
  "document_statement",
  "font_face_statement",
  "import_statement",
  "keyframes_statement",
  "layer_statement",
  "media_statement",
  "namespace_statement",
  "page_statement",
  "starting_style_statement",
  "supports_statement"
]);

function sourceRange(node: SgNode): SourceRange {
  const range = node.range();
  return {
    start: { line: range.start.line + 1, column: range.start.column + 1 },
    end: { line: range.end.line + 1, column: range.end.column + 1 }
  };
}

function documentRange(sourceText: string): SourceRange {
  const lines = sourceText.split("\n");
  return {
    start: { line: 1, column: 1 },
    end: { line: lines.length, column: (lines.at(-1) ?? "").length + 1 }
  };
}

function fileSymbol(input: CssExtractFileFactsInput): SymbolNode {
  const name = input.filePath.split(/[\\/]/u).at(-1) ?? input.filePath;
  return {
    id: createSymbolId({
      filePath: input.filePath,
      qualifiedName: input.filePath,
      kind: "file",
      declarationOrdinal: 0
    }),
    name,
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

function hasValidCssLexicalStructure(sourceText: string): boolean {
  if (sourceText.length > MAXIMUM_CSS_SOURCE_LENGTH) {
    return false;
  }
  const stack: string[] = [];
  let quote: '"' | "'" | null = null;
  let inComment = false;
  for (let offset = 0; offset < sourceText.length; offset += 1) {
    const character = sourceText[offset];
    const next = sourceText[offset + 1];
    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        offset += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (character === "\\") {
        offset += 1;
        continue;
      }
      if (character === quote) {
        quote = null;
        continue;
      }
      if (character === "\r" || character === "\n") {
        return false;
      }
      continue;
    }
    if (character === "/" && next === "*") {
      inComment = true;
      offset += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{" || character === "(" || character === "[") {
      stack.push(character);
      if (stack.length > MAXIMUM_CSS_AST_DEPTH) {
        return false;
      }
      continue;
    }
    const expected = character === "}" ? "{" : character === ")" ? "(" : character === "]" ? "[" : null;
    if (expected !== null && stack.pop() !== expected) {
      return false;
    }
  }
  return !inComment && quote === null && stack.length === 0;
}

function hasValidCssAst(node: SgNode, state: { count: number }, depth = 0): boolean {
  state.count += 1;
  if (
    state.count > MAXIMUM_CSS_AST_NODES ||
    depth > MAXIMUM_CSS_AST_DEPTH ||
    node.kind() === "ERROR"
  ) {
    return false;
  }
  if (node.kind() === "rule_set") {
    const selectors = node.children().find((child) => child.kind() === "selectors");
    if (selectors === undefined || selectors.text().trim().length > MAXIMUM_CSS_SELECTOR_LENGTH) {
      return false;
    }
  }
  if (node.kind() === "declaration") {
    const property = node.children().find((child) => child.kind() === "property_name");
    if (property === undefined || property.text().length > MAXIMUM_CSS_PROPERTY_NAME_LENGTH) {
      return false;
    }
    if (node.text().length > MAXIMUM_CSS_PROPERTY_VALUE_LENGTH) {
      return false;
    }
  }
  return node.children().every((child) => hasValidCssAst(child, state, depth + 1));
}

function atRuleName(node: SgNode): string {
  const text = node.text().trim();
  const opening = text.indexOf("{");
  const semicolon = text.indexOf(";");
  const boundary = [opening, semicolon].filter((value) => value >= 0).sort((a, b) => a - b)[0];
  return text.slice(0, boundary ?? text.length).trim().replace(/\s+/gu, " ");
}

function selectorKinds(node: SgNode): readonly string[] {
  const kinds = new Set<string>();
  function visit(current: SgNode): void {
    switch (current.kind()) {
      case "class_selector":
        kinds.add("class");
        break;
      case "id_selector":
        kinds.add("id");
        break;
      case "attribute_selector":
        kinds.add("attribute");
        break;
      case "pseudo_class_selector":
        kinds.add("pseudo");
        break;
      case "pseudo_element_selector":
        kinds.add("pseudo-element");
        break;
      case "tag_name":
        const parent = current.parent();
        const pseudoSeparator = parent?.kind() === "pseudo_element_selector"
          ? parent.children().find((child) => child.kind() === "::")
          : undefined;
        if (
          pseudoSeparator === undefined ||
          current.range().start.index < pseudoSeparator.range().start.index
        ) {
          kinds.add("type");
        }
        break;
      case "type_selector":
        kinds.add("type");
        break;
      case "universal_selector":
        kinds.add("universal");
        break;
    }
    for (const child of current.children()) {
      visit(child);
    }
  }
  visit(node);
  return [...kinds].sort();
}

function declarationGroup(propertyName: string): string | null {
  const property = propertyName.toLowerCase();
  if (/^(?:color|background|border|box-shadow|fill|stroke|opacity)/u.test(property)) {
    return "color";
  }
  if (/^(?:display|position|inset|top|right|bottom|left|float|clear|overflow|z-index|box-sizing|width|height|min-|max-|margin|padding|gap|grid|flex|align|justify|place-)/u.test(property)) {
    return "layout";
  }
  if (/^(?:font|line-height|letter-spacing|text-|white-space|word-)/u.test(property)) {
    return "typography";
  }
  if (/^(?:animation|transition|transform)/u.test(property)) {
    return "animation";
  }
  return property.startsWith("--") ? "custom-property" : null;
}

/** Extracts only syntax-proven, file-local CSS resources and direct containment. */
export function extractCssFileFacts(input: CssExtractFileFactsInput): ArtifactFacts {
  const file = fileSymbol(input);
  if (!hasValidCssLexicalStructure(input.sourceText)) {
    return fileOnlyFacts(file);
  }
  let root: SgNode;
  try {
    root = css.parse(input.sourceText).root();
  } catch {
    return fileOnlyFacts(file);
  }
  if (root.kind() !== "stylesheet" || !hasValidCssAst(root, { count: 0 })) {
    return fileOnlyFacts(file);
  }

  const symbols: SymbolNode[] = [file];
  const edges: GraphEdge[] = [];
  const resourceOrdinals = new Map<string, number>();
  const structuralOrdinals = new Map<string, number>();
  let resourceBoundsExceeded = false;

  function addResource(
    parent: SymbolNode,
    name: string,
    category: string,
    range: SourceRange,
    ruleId: string
  ): SymbolNode | null {
    if (symbols.length >= MAXIMUM_CSS_RESOURCES + 1 || name.length > MAXIMUM_CSS_SELECTOR_LENGTH) {
      resourceBoundsExceeded = true;
      return null;
    }
    const qualifiedName = `${parent.qualifiedName}#css-${category}:${name}`;
    const identity = qualifiedName;
    const declarationOrdinal = resourceOrdinals.get(identity) ?? 0;
    resourceOrdinals.set(identity, declarationOrdinal + 1);
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
      isExported: parent.kind === "file",
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
  }

  function structuralName(parent: SymbolNode, category: string): string {
    const key = `${parent.id}\u0000${category}`;
    const ordinal = (structuralOrdinals.get(key) ?? 0) + 1;
    structuralOrdinals.set(key, ordinal);
    return `${category}[${ordinal}]`;
  }

  function addDeclarationResources(block: SgNode, owner: SymbolNode): void {
    const groups = new Set<string>();
    for (const declaration of block.children().filter((child) => child.kind() === "declaration")) {
      const property = declaration.children().find((child) => child.kind() === "property_name");
      if (property === undefined) {
        continue;
      }
      const propertyName = property.text();
      if (propertyName.startsWith("--")) {
        addResource(owner, propertyName, "custom-property", sourceRange(property), "syntax.css.custom-property");
      }
      const group = declarationGroup(propertyName);
      if (group !== null && group !== "custom-property") {
        groups.add(group);
      }
    }
    for (const group of groups) {
      addResource(
        owner,
        `declaration-group:${group}`,
        "semantic",
        owner.range,
        "syntax.css.declaration-group"
      );
    }
  }

  function visit(node: SgNode, parent: SymbolNode): void {
    if (node.kind() === "rule_set") {
      const selectors = node.children().find((child) => child.kind() === "selectors");
      const block = node.children().find((child) => child.kind() === "block");
      if (selectors === undefined || block === undefined) {
        return;
      }
      const rule = addResource(
        parent,
        selectors.text().trim(),
        structuralName(parent, "rule"),
        sourceRange(node),
        "syntax.css.style-rule"
      );
      if (rule === null) {
        return;
      }
      for (const selectorNode of selectors
        .children()
        .filter((child) => child.kind() !== "," && child.kind() !== "comment")) {
        const selectorName = selectorNode.text().trim();
        if (selectorName.length === 0) {
          continue;
        }
        const selector = addResource(
          rule,
          selectorName,
          "selector",
          sourceRange(selectorNode),
          "syntax.css.selector"
        );
        if (selector === null) {
          continue;
        }
        for (const kind of selectorKinds(selectorNode)) {
          addResource(
            selector,
            `selector-kind:${kind}`,
            "semantic",
            sourceRange(selectorNode),
            "syntax.css.selector-classification"
          );
        }
      }
      addDeclarationResources(block, rule);
      for (const child of block.children()) {
        if (child.kind() !== "declaration") {
          visit(child, rule);
        }
      }
      return;
    }
    if (node.kind() === "keyframe_block") {
      const block = node.children().find((child) => child.kind() === "block");
      if (block === undefined) {
        return;
      }
      const opening = node.text().indexOf("{");
      const name = node.text().slice(0, opening < 0 ? node.text().length : opening).trim();
      const keyframe = addResource(
        parent,
        name,
        structuralName(parent, "keyframe"),
        sourceRange(node),
        "syntax.css.keyframe-stage"
      );
      if (keyframe === null) {
        return;
      }
      addDeclarationResources(block, keyframe);
      return;
    }
    if (CSS_AT_RULE_KINDS.has(String(node.kind()))) {
      const name = atRuleName(node);
      const atRule = addResource(
        parent,
        name,
        structuralName(parent, "at-rule"),
        sourceRange(node),
        node.kind() === "keyframes_statement" ? "syntax.css.keyframes" : "syntax.css.at-rule"
      );
      if (atRule === null) {
        return;
      }
      for (const child of node.children()) {
        visit(child, atRule);
      }
      return;
    }
    for (const child of node.children()) {
      visit(child, parent);
    }
  }

  visit(root, file);
  if (resourceBoundsExceeded) {
    return fileOnlyFacts(file);
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
