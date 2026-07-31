import { SaxesParser } from "saxes";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";

export interface XmlExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "xml";
}

interface XmlElementFact {
  readonly name: string;
  readonly path: string;
  readonly parentPath: string | null;
  readonly start: number;
  readonly end: number;
}

interface OpenXmlElement {
  readonly name: string;
  readonly path: string | null;
  readonly parentPath: string | null;
  readonly start: number;
  readonly directChildOrdinals: Map<string, number>;
}

type MyBatisStatementKind = "select" | "insert" | "update" | "delete" | "sql";

interface MyBatisIncludeFact {
  readonly qualifiedName: string;
  readonly start: number;
  readonly end: number;
}

interface MyBatisStatementFact {
  readonly kind: MyBatisStatementKind;
  readonly id: string;
  readonly qualifiedName: string;
  readonly start: number;
  readonly end: number;
  readonly includes: readonly MyBatisIncludeFact[];
}

interface MutableMyBatisStatement {
  readonly kind: MyBatisStatementKind;
  readonly id: string;
  readonly qualifiedName: string;
  readonly start: number;
  readonly includes: MyBatisIncludeFact[];
}

interface OpenMyBatisElement {
  readonly start: number;
  readonly statement: MutableMyBatisStatement | null;
}

interface MyBatisMapperFacts {
  readonly namespace: string;
  readonly statements: readonly MyBatisStatementFact[];
}

const MYBATIS_STATEMENT_KINDS: ReadonlySet<MyBatisStatementKind> = new Set([
  "select",
  "insert",
  "update",
  "delete",
  "sql"
]);
const JAVA_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const JAVA_QUALIFIED_TYPE = /^(?:[A-Za-z_$][A-Za-z0-9_$]*\.)+[A-Za-z_$][A-Za-z0-9_$]*$/u;
const MYBATIS_MAPPER_DTD =
  /^mapper\s+PUBLIC\s+["']-\/\/mybatis\.org\/\/DTD Mapper 3\.0\/\/EN["']\s+["']https?:\/\/mybatis\.org\/dtd\/mybatis-3-mapper\.dtd["']$/u;

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
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) {
      lower = middle;
    } else {
      upper = middle - 1;
    }
  }
  const lineStart = lineStarts[lower] ?? 0;
  return { line: lower + 1, column: offset - lineStart + 1 };
}

function rangeFor(lineStarts: readonly number[], from: number, to: number): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

/** Finds the opening `<` for a parser-validated element start tag. */
function openingTagStart(sourceText: string, end: number): number | null {
  let quoted: '"' | "'" | null = null;
  for (let index = end - 1; index >= 0; index -= 1) {
    const character = sourceText[index];
    if (quoted !== null) {
      if (character === quoted) {
        quoted = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quoted = character;
      continue;
    }
    if (character === "<") {
      return index;
    }
  }
  return null;
}

/**
 * Retains a well-formed XML document's root and direct child elements only.
 * DTDs are rejected to avoid entity or schema semantics; attributes, text,
 * namespaces, XPath, imports, calls, and deeper structure remain outside this
 * source-only language slice.
 */
function staticXmlElements(sourceText: string): readonly XmlElementFact[] {
  const parser = new SaxesParser({ position: true });
  const openElements: OpenXmlElement[] = [];
  const elements: XmlElementFact[] = [];
  let valid = true;

  parser.on("error", () => {
    valid = false;
  });
  parser.on("doctype", () => {
    valid = false;
  });
  parser.on("opentag", (tag) => {
    const start = openingTagStart(sourceText, parser.position);
    if (start === null) {
      valid = false;
      return;
    }

    const parent = openElements.at(-1);
    let path: string | null = null;
    let parentPath: string | null = null;
    if (parent === undefined) {
      path = `${tag.name}[0]`;
    } else if (openElements.length === 1 && parent.path !== null) {
      const ordinal = parent.directChildOrdinals.get(tag.name) ?? 0;
      parent.directChildOrdinals.set(tag.name, ordinal + 1);
      parentPath = parent.path;
      path = `${parent.path}/${tag.name}[${ordinal}]`;
    }

    openElements.push({
      name: tag.name,
      path,
      parentPath,
      start,
      directChildOrdinals: new Map<string, number>()
    });
  });
  parser.on("closetag", () => {
    const element = openElements.pop();
    if (element === undefined || parser.position <= element.start) {
      valid = false;
      return;
    }
    if (element.path !== null) {
      elements.push({
        name: element.name,
        path: element.path,
        parentPath: element.parentPath,
        start: element.start,
        end: parser.position
      });
    }
  });

  try {
    parser.write(sourceText).close();
  } catch {
    valid = false;
  }

  const roots = elements.filter((element) => element.parentPath === null);
  if (!valid || openElements.length !== 0 || roots.length !== 1) {
    return [];
  }
  return elements.sort((left, right) => left.start - right.start || left.end - right.end);
}

function currentMyBatisStatement(
  openElements: readonly OpenMyBatisElement[]
): MutableMyBatisStatement | null {
  for (let index = openElements.length - 1; index >= 0; index -= 1) {
    const statement = openElements[index]?.statement;
    if (statement !== null && statement !== undefined) {
      return statement;
    }
  }
  return null;
}

/**
 * Retains one narrow MyBatis 3 mapper subset. The standard mapper DTD is
 * accepted without fetching or evaluating it; all other DTDs remain rejected.
 * Only direct statement children and self-closing literal same-mapper includes
 * become facts, so dynamic SQL and wider XML framework semantics stay out of scope.
 */
function staticMyBatisMapper(sourceText: string): MyBatisMapperFacts | null {
  const parser = new SaxesParser({ position: true });
  const openElements: OpenMyBatisElement[] = [];
  const statements: MyBatisStatementFact[] = [];
  let namespace: string | null = null;
  let rootSeen = false;
  let valid = true;

  parser.on("error", () => {
    valid = false;
  });
  parser.on("doctype", (doctype) => {
    if (!MYBATIS_MAPPER_DTD.test(doctype.trim())) {
      valid = false;
    }
  });
  parser.on("opentag", (tag) => {
    const start = openingTagStart(sourceText, parser.position);
    if (start === null) {
      valid = false;
      return;
    }

    let statement: MutableMyBatisStatement | null = null;
    if (openElements.length === 0) {
      rootSeen = true;
      const rootNamespace = tag.attributes.namespace;
      if (
        tag.name === "mapper" &&
        typeof rootNamespace === "string" &&
        JAVA_QUALIFIED_TYPE.test(rootNamespace)
      ) {
        namespace = rootNamespace;
      }
    } else if (openElements.length === 1 && namespace !== null) {
      const id = tag.attributes.id;
      if (
        MYBATIS_STATEMENT_KINDS.has(tag.name as MyBatisStatementKind) &&
        typeof id === "string" &&
        JAVA_IDENTIFIER.test(id)
      ) {
        const kind = tag.name as MyBatisStatementKind;
        statement = {
          kind,
          id,
          qualifiedName: `${namespace}::${id}`,
          start,
          includes: []
        };
      }
    }

    if (namespace !== null && tag.name === "include" && tag.isSelfClosing) {
      const owner = currentMyBatisStatement(openElements);
      const refid = tag.attributes.refid;
      if (owner !== null && typeof refid === "string" && JAVA_IDENTIFIER.test(refid)) {
        owner.includes.push({
          qualifiedName: `${namespace}::${refid}`,
          start,
          end: parser.position
        });
      }
    }

    openElements.push({ start, statement });
  });
  parser.on("closetag", () => {
    const element = openElements.pop();
    if (element === undefined || parser.position <= element.start) {
      valid = false;
      return;
    }
    if (element.statement !== null) {
      statements.push({
        kind: element.statement.kind,
        id: element.statement.id,
        qualifiedName: element.statement.qualifiedName,
        start: element.statement.start,
        end: parser.position,
        includes: element.statement.includes
      });
    }
  });

  try {
    parser.write(sourceText).close();
  } catch {
    valid = false;
  }

  if (!valid || openElements.length !== 0 || !rootSeen || namespace === null) {
    return null;
  }
  return {
    namespace,
    statements: statements.sort((left, right) => left.start - right.start || left.end - right.end)
  };
}

/**
 * Extracts parser-proven XML element containment without treating XML as a
 * runtime, schema, XPath, or cross-file configuration model.
 */
export function extractXmlFileFacts(input: XmlExtractFileFactsInput): ArtifactFacts {
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
    range: rangeFor(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const symbolsByPath = new Map<string, SymbolNode>();
  const myBatisSymbols = new Map<MyBatisStatementFact, SymbolNode>();
  const myBatisSqlSymbols = new Map<string, SymbolNode[]>();

  for (const element of staticXmlElements(input.sourceText)) {
    const parent =
      element.parentPath === null ? fileNode : symbolsByPath.get(element.parentPath) ?? null;
    if (parent === null) {
      return {
        symbols: [fileNode],
        edges: [],
        pendingReferences: [],
        localBindings: [],
        referenceScopes: [],
        importBindings: [],
        exportBindings: [],
        reExportBindings: []
      };
    }

    const qualifiedName = `${fileNode.qualifiedName}#xml-element:${element.path}`;
    const identity = `${qualifiedName}\u0000resource`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, element.start, element.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "resource",
        declarationOrdinal
      }),
      name: element.name,
      qualifiedName,
      kind: "resource",
      filePath: input.filePath,
      range,
      isExported: element.parentPath === null,
      declarationOrdinal
    };
    symbols.push(symbol);
    symbolsByPath.set(element.path, symbol);
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
        ruleId:
          element.parentPath === null ? "syntax.xml.root-element" : "syntax.xml.direct-child-element",
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
  }

  const myBatisMapper = staticMyBatisMapper(input.sourceText);
  if (myBatisMapper !== null) {
    for (const statement of myBatisMapper.statements) {
      const identity = `${statement.qualifiedName}\u0000method`;
      const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
      declarationOrdinals.set(identity, declarationOrdinal + 1);
      const range = rangeFor(lineStarts, statement.start, statement.end);
      const symbol: SymbolNode = {
        id: createSymbolId({
          filePath: input.filePath,
          qualifiedName: statement.qualifiedName,
          kind: "method",
          declarationOrdinal
        }),
        name: statement.id,
        qualifiedName: statement.qualifiedName,
        kind: "method",
        filePath: input.filePath,
        range,
        isExported: false,
        declarationOrdinal
      };
      symbols.push(symbol);
      myBatisSymbols.set(statement, symbol);
      if (statement.kind === "sql") {
        const existing = myBatisSqlSymbols.get(statement.qualifiedName) ?? [];
        existing.push(symbol);
        myBatisSqlSymbols.set(statement.qualifiedName, existing);
      }
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
          ruleId: "framework.mybatis.mapper.literal-direct-statement",
          stage: "syntax",
          candidateSymbolIds: [symbol.id]
        }
      });
    }

    for (const statement of myBatisMapper.statements) {
      const source = myBatisSymbols.get(statement);
      if (source === undefined) {
        continue;
      }
      for (const include of statement.includes) {
        const candidates = myBatisSqlSymbols.get(include.qualifiedName) ?? [];
        const candidateSymbolIds = candidates.map((candidate) => candidate.id).sort();
        const target = candidates.length === 1 ? candidates[0] ?? null : null;
        const range = rangeFor(lineStarts, include.start, include.end);
        edges.push({
          id: createEdgeId({
            sourceId: source.id,
            targetId: target?.id ?? null,
            kind: "calls",
            line: range.start.line,
            column: range.start.column,
            referenceName: include.qualifiedName
          }),
          sourceId: source.id,
          targetId: target?.id ?? null,
          kind: "calls",
          filePath: input.filePath,
          range,
          resolution: target === null ? "unresolved" : "exact",
          confidence: target === null ? 0 : 1,
          referenceName: include.qualifiedName,
          evidence: {
            ruleId:
              target === null
                ? "framework.mybatis.mapper.literal-include.unresolved-same-file-sql"
                : "framework.mybatis.mapper.literal-include.same-file-sql",
            stage: "syntax",
            candidateSymbolIds
          }
        });
      }
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
    reExportBindings: []
  };
}
