import ts from "typescript";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type ExportBinding,
  type GraphEdge,
  type LocalBinding,
  type PendingReference,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface ArkTsExtractFileFactsInput {
  readonly filePath: string;
  readonly language: "arkts";
  readonly sourceText: string;
}

interface ArkTsComponentDeclaration {
  readonly name: string;
  readonly isEntry: boolean;
  readonly isExported: boolean;
  readonly start: number;
  readonly end: number;
}

const FILE_SCOPE_ID = "arkts:file";

interface ArkTsStaticImport {
  readonly specifier: string;
  readonly start: number;
  readonly end: number;
}

function arkTsStaticImports(
  sourceText: string,
  filePath: string
): readonly ArkTsStaticImport[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const imports: ArkTsStaticImport[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      break;
    }
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    imports.push({
      specifier: statement.moduleSpecifier.text,
      start: statement.moduleSpecifier.getStart(sourceFile),
      end: statement.moduleSpecifier.getEnd()
    });
  }
  return imports;
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
 * Preserves byte offsets while excluding strings and comments from the small
 * declarative scanner below. Template interpolation is intentionally excluded
 * too: entry-component declarations in a runtime string are not source facts.
 */
function sourceCodeMask(sourceText: string): string {
  const characters = sourceText.split("");
  let index = 0;

  while (index < sourceText.length) {
    const character = sourceText[index];
    const next = sourceText[index + 1];
    if (character === "/" && next === "/") {
      const newline = sourceText.indexOf("\n", index + 2);
      const end = newline === -1 ? sourceText.length : newline;
      blankRange(characters, index, end);
      index = end;
      continue;
    }
    if (character === "/" && next === "*") {
      const closing = sourceText.indexOf("*/", index + 2);
      const end = closing === -1 ? sourceText.length : closing + 2;
      blankRange(characters, index, end);
      index = end;
      continue;
    }
    if (character === "'" || character === "\"" || character === String.fromCharCode(96)) {
      const quote = character;
      let end = index + 1;
      while (end < sourceText.length) {
        if (sourceText[end] === "\\") {
          end += 2;
          continue;
        }
        if (sourceText[end] === quote) {
          end += 1;
          break;
        }
        end += 1;
      }
      blankRange(characters, index, Math.min(end, sourceText.length));
      index = end;
      continue;
    }
    index += 1;
  }

  return characters.join("");
}

function isIdentifierStart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z_$]/u.test(character);
}

function isIdentifierPart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_$]/u.test(character);
}

function skipWhitespace(sourceText: string, start: number): number {
  let index = start;
  while (index < sourceText.length && /\s/u.test(sourceText[index] ?? "")) {
    index += 1;
  }
  return index;
}

function startsLineWithOnlyWhitespace(sourceText: string, offset: number): boolean {
  for (let index = offset - 1; index >= 0; index -= 1) {
    const character = sourceText[index];
    if (character === "\n" || character === "\r") {
      return true;
    }
    if (!/\s/u.test(character ?? "")) {
      return false;
    }
  }
  return true;
}

function readIdentifier(
  sourceText: string,
  start: number
): { readonly text: string; readonly end: number } | null {
  if (!isIdentifierStart(sourceText[start])) {
    return null;
  }
  let end = start + 1;
  while (isIdentifierPart(sourceText[end])) {
    end += 1;
  }
  return { text: sourceText.slice(start, end), end };
}

function hasWordAt(sourceText: string, start: number, word: string): boolean {
  return (
    sourceText.slice(start, start + word.length) === word &&
    !isIdentifierPart(sourceText[start - 1]) &&
    !isIdentifierPart(sourceText[start + word.length])
  );
}

function closingDelimiter(
  sourceText: string,
  start: number,
  open: string,
  close: string
): number | null {
  if (sourceText[start] !== open) {
    return null;
  }
  let depth = 0;
  for (let index = start; index < sourceText.length; index += 1) {
    if (sourceText[index] === open) {
      depth += 1;
    } else if (sourceText[index] === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return null;
}

function readDecorator(
  sourceText: string,
  start: number
): { readonly name: string; readonly end: number } | null {
  if (sourceText[start] !== "@") {
    return null;
  }
  const identifier = readIdentifier(sourceText, start + 1);
  if (identifier === null) {
    return null;
  }
  let end = skipWhitespace(sourceText, identifier.end);
  if (sourceText[end] === "(") {
    const closing = closingDelimiter(sourceText, end, "(", ")");
    if (closing === null) {
      return null;
    }
    end = closing + 1;
  }
  return { name: identifier.text, end };
}

/**
 * Keeps only complete, direct ArkUI declarations:
 *
 * @Entry
 * @Component
 * struct Home { ... }
 *
 * Export may sit directly between the final decorator and struct. This is a
 * scanner rather than a general ArkTS parser, so non-line-leading or
 * non-adjacent decorators, generic runtime syntax, and malformed bodies fail
 * closed.
 */
function arkTsComponentDeclarations(sourceText: string): readonly ArkTsComponentDeclaration[] {
  const code = sourceCodeMask(sourceText);
  const declarations: ArkTsComponentDeclaration[] = [];
  let cursor = 0;

  while (cursor < code.length) {
    if (code[cursor] !== "@" || !startsLineWithOnlyWhitespace(code, cursor)) {
      cursor += 1;
      continue;
    }

    const start = cursor;
    const decorators: string[] = [];
    let afterDecorators = cursor;
    while (true) {
      const decorator = readDecorator(code, afterDecorators);
      if (decorator === null) {
        break;
      }
      decorators.push(decorator.name);
      afterDecorators = skipWhitespace(code, decorator.end);
      if (code[afterDecorators] !== "@") {
        break;
      }
    }

    let declarationStart = afterDecorators;
    let isExported = false;
    if (hasWordAt(code, declarationStart, "export")) {
      isExported = true;
      declarationStart = skipWhitespace(code, declarationStart + "export".length);
    }
    if (!decorators.includes("Component") || !hasWordAt(code, declarationStart, "struct")) {
      cursor = start + 1;
      continue;
    }

    const identifier = readIdentifier(
      code,
      skipWhitespace(code, declarationStart + "struct".length)
    );
    if (identifier === null) {
      cursor = start + 1;
      continue;
    }
    const openingBrace = skipWhitespace(code, identifier.end);
    const closingBrace =
      code[openingBrace] === "}"
        ? null
        : closingDelimiter(code, openingBrace, "{", "}");
    if (code[openingBrace] !== "{" || closingBrace === null) {
      cursor = start + 1;
      continue;
    }

    declarations.push({
      name: identifier.text,
      isEntry: decorators.includes("Entry"),
      isExported,
      start,
      end: closingBrace + 1
    });
    cursor = closingBrace + 1;
  }

  return declarations;
}

/**
 * Extracts a narrow ArkTS/ArkUI contract. It recognizes only complete direct
 * Component struct declarations and maps Entry components to explicit UI root
 * entrypoints. It deliberately does not parse general ArkTS declarations,
 * component DSL calls, decorators on members, navigation, or runtime state.
 */
export function extractArkTsFileFacts(input: ArkTsExtractFileFactsInput): ArtifactFacts {
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
  const pendingReferences: PendingReference[] = [];
  const localBindings: LocalBinding[] = [];
  const exportBindings: ExportBinding[] = [];
  const componentOrdinals = new Map<string, number>();
  const entrypointOrdinals = new Map<string, number>();

  for (const imported of arkTsStaticImports(input.sourceText, input.filePath)) {
    const range = rangeForSpan(lineStarts, imported.start, imported.end);
    pendingReferences.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: null,
        kind: "imports",
        line: range.start.line,
        column: range.start.column,
        referenceName: imported.specifier
      }),
      sourceId: fileNode.id,
      filePath: input.filePath,
      referenceName: imported.specifier,
      relationKind: "imports",
      range
    });
  }

  function addContainment(target: SymbolNode, range: SourceRange, ruleId: string): void {
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: target.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: target.name
      }),
      sourceId: fileNode.id,
      targetId: target.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: target.name,
      evidence: {
        ruleId,
        stage: "syntax",
        candidateSymbolIds: [target.id]
      }
    });
  }

  for (const declaration of arkTsComponentDeclarations(input.sourceText)) {
    const range = rangeForSpan(lineStarts, declaration.start, declaration.end);
    const qualifiedName = input.filePath + "#" + declaration.name;
    const componentOrdinal = componentOrdinals.get(qualifiedName) ?? 0;
    componentOrdinals.set(qualifiedName, componentOrdinal + 1);
    const component: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal: componentOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range,
      isExported: declaration.isExported,
      declarationOrdinal: componentOrdinal
    };
    symbols.push(component);
    addContainment(component, range, "framework.arkui.component-struct");
    localBindings.push({
      name: component.name,
      symbolId: component.id,
      scopeId: FILE_SCOPE_ID
    });
    if (declaration.isExported) {
      exportBindings.push({
        localName: component.name,
        exportedName: component.name,
        range
      });
    }

    if (!declaration.isEntry) {
      continue;
    }

    const entrypointName = "ui root " + component.name;
    const entrypointQualifiedName = input.filePath + "#entrypoint:" + entrypointName;
    const entrypointOrdinal = entrypointOrdinals.get(entrypointQualifiedName) ?? 0;
    entrypointOrdinals.set(entrypointQualifiedName, entrypointOrdinal + 1);
    const entrypoint: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName: entrypointQualifiedName,
        kind: "entrypoint",
        declarationOrdinal: entrypointOrdinal
      }),
      name: entrypointName,
      qualifiedName: entrypointQualifiedName,
      kind: "entrypoint",
      filePath: input.filePath,
      range,
      isExported: false,
      declarationOrdinal: entrypointOrdinal
    };
    symbols.push(entrypoint);
    addContainment(entrypoint, range, "framework.arkui.entry-component.entrypoint");
    edges.push({
      id: createEdgeId({
        sourceId: entrypoint.id,
        targetId: component.id,
        kind: "handles",
        line: range.start.line,
        column: range.start.column,
        referenceName: component.name
      }),
      sourceId: entrypoint.id,
      targetId: component.id,
      kind: "handles",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: component.name,
      evidence: {
        ruleId: "framework.arkui.entry-component.local-struct",
        stage: "syntax",
        candidateSymbolIds: [component.id]
      }
    });
  }

  return {
    symbols,
    edges,
    pendingReferences,
    localBindings,
    referenceScopes: [],
    importBindings: [],
    exportBindings,
    reExportBindings: []
  };
}
