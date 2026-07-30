import { parse, type SgNode } from "./ast-grep-languages.js";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

/** Scala uses the shared prebuilt ast-grep Tree-sitter language registry. */

export interface ScalaExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "scala";
}

type ScalaSyntaxNode = SgNode;

interface StaticScalaOwner {
  readonly name: string;
  readonly kind: "class" | "interface";
  readonly node: ScalaSyntaxNode;
  readonly body: ScalaSyntaxNode;
}

interface StaticScalaFunction {
  readonly name: string;
  readonly node: ScalaSyntaxNode;
}

interface StaticPlayRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly controller: string;
  readonly action: string;
  readonly range: SourceRange;
}

const PLAY_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS"
};

const PLAY_ROUTE_LINE =
  /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s]*)\s+((?:[A-Za-z_][A-Za-z0-9_]*\.)+[A-Za-z_][A-Za-z0-9_]*)(?:\s*\([^)]*\))?\s*$/u;

function directChildren(node: ScalaSyntaxNode): readonly ScalaSyntaxNode[] {
  return node.children();
}

function nodeText(node: ScalaSyntaxNode): string {
  return node.text();
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
    const start = lineStarts[middle];
    if (start === undefined || start > offset) {
      upper = middle;
    } else {
      lower = middle;
    }
  }
  const lineStart = lineStarts[lower] ?? 0;
  return { line: lower + 1, column: offset - lineStart + 1 };
}

function rangeForNode(node: ScalaSyntaxNode): SourceRange {
  const range = node.range();
  return {
    start: { line: range.start.line + 1, column: range.start.column + 1 },
    end: { line: range.end.line + 1, column: range.end.column + 1 }
  };
}

function rangeForSpan(
  lineStarts: readonly number[],
  from: number,
  to: number
): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function hasSyntaxError(node: ScalaSyntaxNode): boolean {
  return (
    node.kind() === "ERROR" ||
    (node.kind() !== "compilation_unit" && nodeText(node).length === 0) ||
    directChildren(node).some((child) => hasSyntaxError(child))
  );
}

function identifierText(node: ScalaSyntaxNode): string | null {
  const value = nodeText(node);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function staticScalaOwner(node: ScalaSyntaxNode): StaticScalaOwner | null {
  const kind = node.kind();
  if (
    kind !== "class_definition" &&
    kind !== "object_definition" &&
    kind !== "trait_definition"
  ) {
    return null;
  }
  const children = directChildren(node);
  const identifiers = children
    .filter((child) => child.kind() === "identifier")
    .map((child) => identifierText(child))
    .filter((candidate): candidate is string => candidate !== null);
  const body = children.find((child) => child.kind() === "template_body");
  if (identifiers.length !== 1 || body === undefined) {
    return null;
  }
  const name = identifiers[0];
  if (name === undefined) {
    return null;
  }
  return {
    name,
    kind: kind === "trait_definition" ? "interface" : "class",
    node,
    body
  };
}

function staticScalaFunction(node: ScalaSyntaxNode): StaticScalaFunction | null {
  if (node.kind() !== "function_definition" && node.kind() !== "function_declaration") {
    return null;
  }
  const identifiers = directChildren(node)
    .filter((child) => child.kind() === "identifier")
    .map((child) => identifierText(child))
    .filter((candidate): candidate is string => candidate !== null);
  if (identifiers.length !== 1) {
    return null;
  }
  const name = identifiers[0];
  return name === undefined ? null : { name, node };
}

function isPlayRoutesFile(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return /(?:^|\/)conf\/(?:routes|[^/]+\.routes)$/u.test(normalized);
}

function staticPlayRoutes(
  sourceText: string,
  lineStarts: readonly number[]
): readonly StaticPlayRoute[] {
  const routes: StaticPlayRoute[] = [];
  let offset = 0;
  for (const rawLine of sourceText.split(/\r\n|\r|\n/u)) {
    const trimmed = rawLine.trim();
    const leadingOffset = rawLine.length - rawLine.trimStart().length;
    const match =
      trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("->")
        ? null
        : PLAY_ROUTE_LINE.exec(trimmed);
    if (match !== null) {
      const method = PLAY_ROUTE_METHODS[match[1] ?? ""];
      const path = match[2];
      const actionPath = match[3];
      if (method !== undefined && path !== undefined && actionPath !== undefined) {
        const actionParts = actionPath.split(".");
        const action = actionParts.at(-1);
        const controller = actionParts.at(-2);
        if (action !== undefined && controller !== undefined) {
          routes.push({
            method,
            path,
            controller,
            action,
            range: rangeForSpan(
              lineStarts,
              offset + leadingOffset,
              offset + leadingOffset + trimmed.length
            )
          });
        }
      }
    }
    offset += rawLine.length;
    const nextStart = lineStarts.find((start) => start > offset);
    if (nextStart !== undefined) {
      offset = nextStart;
    }
  }
  return routes;
}

export function extractScalaFileFacts(input: ScalaExtractFileFactsInput): ArtifactFacts {
  const playCapability = frameworkCapability("play");
  if (!playCapability.languages.includes(input.language)) {
    throw new Error("Play framework extraction was invoked for an unsupported source language.");
  }

  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
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
    range: rangeForSpan(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  symbols.push(fileNode);

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = qualifiedName + "\u0000" + kind;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(
    parent: SymbolNode,
    child: SymbolNode,
    range: SourceRange
  ): void {
    edges.push({
      id: createEdgeId({
        sourceId: parent.id,
        targetId: child.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: child.name
      }),
      sourceId: parent.id,
      targetId: child.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: child.name,
      evidence: {
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [child.id]
      }
    });
  }

  function addOwner(declaration: StaticScalaOwner): SymbolNode {
    const qualifiedName = input.filePath + "#" + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, declaration.kind);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: declaration.kind,
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: declaration.kind,
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, rangeForNode(declaration.node));
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticScalaFunction): void {
    const qualifiedName = parent.qualifiedName + "." + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "method");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "method",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "method",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, rangeForNode(declaration.node));
  }

  function addFunction(declaration: StaticScalaFunction): void {
    const qualifiedName = input.filePath + "#" + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "function");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "function",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "function",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, rangeForNode(declaration.node));
  }

  function addPlayRoute(routeFact: StaticPlayRoute): void {
    const routeName = routeFact.method + " " + routeFact.path;
    const qualifiedName = input.filePath + "#route:" + routeName;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
    const route: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name: routeName,
      qualifiedName,
      kind: "route",
      filePath: input.filePath,
      range: routeFact.range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(route);
    addContainment(fileNode, route, routeFact.range);
    const referenceName = routeFact.controller + "." + routeFact.action;
    edges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: null,
        kind: "routes",
        line: routeFact.range.start.line,
        column: routeFact.range.start.column,
        referenceName
      }),
      sourceId: route.id,
      targetId: null,
      kind: "routes",
      filePath: input.filePath,
      range: routeFact.range,
      resolution: "unresolved",
      confidence: 0,
      referenceName,
      evidence: {
        ruleId: "framework.play.conf-routes.literal-controller-action.unresolved-handler",
        stage: "syntax",
        candidateSymbolIds: []
      }
    });
  }

  if (isPlayRoutesFile(input.filePath)) {
    for (const route of staticPlayRoutes(input.sourceText, lineStarts)) {
      addPlayRoute(route);
    }
  } else {
    const root = parse("scala", input.sourceText).root();
    if (!hasSyntaxError(root)) {
      const topLevel = directChildren(root);
      for (const declaration of topLevel
        .map((node) => staticScalaOwner(node))
        .filter((candidate): candidate is StaticScalaOwner => candidate !== null)) {
        const owner = addOwner(declaration);
        for (const method of directChildren(declaration.body)
          .map((node) => staticScalaFunction(node))
          .filter((candidate): candidate is StaticScalaFunction => candidate !== null)) {
          addMethod(owner, method);
        }
      }
      for (const declaration of topLevel
        .map((node) => staticScalaFunction(node))
        .filter((candidate): candidate is StaticScalaFunction => candidate !== null)) {
        addFunction(declaration);
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
    reExportBindings: [],
    nestRouteFacts: {
      routeControllers: [],
      moduleControllers: [],
      routerModulePrefixes: []
    },
    fastifyPluginFacts: {
      routes: [],
      childRegistrations: [],
      rootRegistrations: []
    },
    fastApiRouterFacts: {
      routers: [],
      routes: [],
      importedRouterInclusions: []
    }
  };
}
