import { parse, type SgNode } from "./ast-grep-languages.js";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type PendingReference,
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

interface StaticPlayRouterMount {
  readonly prefix: string;
  readonly routerName: string;
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

const PLAY_ROUTER_MOUNT_LINE =
  /^->\s+(\/\S*)\s+((?:[A-Za-z_][A-Za-z0-9_]*\.)+[A-Za-z_][A-Za-z0-9_]*)\s*$/u;

/**
 * This deliberately accepts just one complete, import-free object shape. It
 * proves ordinary member lookup without claiming support for Scala's broad
 * overload, implicit, extension, inheritance, or local-binding semantics.
 */
const CANONICAL_SCALA_MEMBER_CALL =
  /^\s*object\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*:\s*Int\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*def\s+\3\s*\(\s*\)\s*:\s*Int\s*=\s*(?:0|[1-9][0-9]*)\s*\}\s*$/u;

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
  const body = children.find((child) => child.kind() === "template_body");
  const nameNode = children.find((child) => child.kind() === "identifier");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  if (name === null || body === undefined) {
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
  const nameNode = directChildren(node).find((child) => child.kind() === "identifier");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  return name === null ? null : { name, node };
}

function staticScalaPackage(root: ScalaSyntaxNode): string | null {
  const packageClauses = directChildren(root).filter((node) => node.kind() === "package_clause");
  if (packageClauses.length === 0) {
    return "";
  }
  const clause = packageClauses[0];
  if (packageClauses.length !== 1 || clause === undefined) {
    return null;
  }
  const packageIdentifier = directChildren(clause).find(
    (node) => node.kind() === "package_identifier"
  );
  const packageName = packageIdentifier === undefined ? null : nodeText(packageIdentifier);
  return packageName !== null &&
    /^(?:[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u.test(packageName)
    ? packageName
    : null;
}

function isPlayRoutesFile(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return /(?:^|\/)conf\/(?:routes|[^/]+\.routes)$/u.test(normalized);
}

function isLiteralPlayRouterPrefix(prefix: string): boolean {
  return (
    prefix === "/" ||
    /^\/[A-Za-z0-9._~!$&'()+,;=@%-]+(?:\/[A-Za-z0-9._~!$&'()+,;=@%-]+)*\/?$/u.test(
      prefix
    )
  );
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
        const controller = actionParts.slice(0, -1).join(".");
        if (action !== undefined && controller.length > 0) {
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

/**
 * Captures only a literal slash-prefix Play router mount. The target is kept as
 * a fully-qualified Router class name; later project resolution decides whether
 * one indexed Scala or Java class proves that reference.
 */
function staticPlayRouterMounts(
  sourceText: string,
  lineStarts: readonly number[]
): readonly StaticPlayRouterMount[] {
  const mounts: StaticPlayRouterMount[] = [];
  let offset = 0;
  for (const rawLine of sourceText.split(/\r\n|\r|\n/u)) {
    const trimmed = rawLine.trim();
    const leadingOffset = rawLine.length - rawLine.trimStart().length;
    const match = PLAY_ROUTER_MOUNT_LINE.exec(trimmed);
    const prefix = match?.[1];
    const routerName = match?.[2];
    if (
      prefix !== undefined &&
      routerName !== undefined &&
      isLiteralPlayRouterPrefix(prefix)
    ) {
      mounts.push({
        prefix,
        routerName,
        range: rangeForSpan(
          lineStarts,
          offset + leadingOffset,
          offset + leadingOffset + trimmed.length
        )
      });
    }
    offset += rawLine.length;
    const nextStart = lineStarts.find((start) => start > offset);
    if (nextStart !== undefined) {
      offset = nextStart;
    }
  }
  return mounts;
}

export function extractScalaFileFacts(input: ScalaExtractFileFactsInput): ArtifactFacts {
  const playCapability = frameworkCapability("play");
  if (!playCapability.languages.includes(input.language)) {
    throw new Error("Play framework extraction was invoked for an unsupported source language.");
  }

  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const pendingReferences: PendingReference[] = [];
  const scalaClassFacts: Array<{ symbolId: string; packageName: string }> = [];
  const playRouterMountFacts: Array<{
    symbolId: string;
    prefix: string;
    routerName: string;
    range: SourceRange;
  }> = [];
  const methodsByOwnerId = new Map<string, SymbolNode[]>();
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

  function addOwner(declaration: StaticScalaOwner, packageName: string | null): SymbolNode {
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
    if (declaration.kind === "class" && packageName !== null) {
      scalaClassFacts.push({ symbolId: symbol.id, packageName });
    }
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticScalaFunction): SymbolNode {
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
    return symbol;
  }

  function addCanonicalMemberCall(): void {
    const match = CANONICAL_SCALA_MEMBER_CALL.exec(input.sourceText);
    const ownerName = match?.[1];
    const callerName = match?.[2];
    const calleeName = match?.[3];
    if (
      ownerName === undefined ||
      callerName === undefined ||
      calleeName === undefined ||
      callerName === calleeName
    ) {
      return;
    }
    const owners = symbols.filter(
      (symbol) => symbol.kind === "class" && symbol.name === ownerName
    );
    const owner = owners.length === 1 ? owners[0] : undefined;
    const methods = owner === undefined ? undefined : methodsByOwnerId.get(owner.id);
    const callers = methods?.filter((symbol) => symbol.name === callerName) ?? [];
    const callees = methods?.filter((symbol) => symbol.name === calleeName) ?? [];
    const caller = callers.length === 1 ? callers[0] : undefined;
    const callee = callees.length === 1 ? callees[0] : undefined;
    const callStart = input.sourceText.indexOf(calleeName + "()");
    if (caller === undefined || callee === undefined || callStart < 0) {
      return;
    }
    const range = rangeForSpan(lineStarts, callStart, callStart + calleeName.length + 2);
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: callee.name
      }),
      sourceId: caller.id,
      targetId: callee.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: callee.name,
      evidence: {
        ruleId: "syntax.scala.canonical-object.unique-zero-argument-member-call",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
      }
    });
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
    pendingReferences.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: null,
        kind: "routes",
        line: routeFact.range.start.line,
        column: routeFact.range.start.column,
        referenceName
      }),
      sourceId: route.id,
      filePath: input.filePath,
      range: routeFact.range,
      referenceName,
      relationKind: "routes",
      routeFramework: "play"
    });
  }

  function addPlayRouterMount(mount: StaticPlayRouterMount): void {
    const name = "MOUNT " + mount.prefix + " -> " + mount.routerName;
    const qualifiedName = input.filePath + "#play-router-mount:" + name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
    const mountSymbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: input.filePath,
      range: mount.range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(mountSymbol);
    addContainment(fileNode, mountSymbol, mount.range);
    playRouterMountFacts.push({
      symbolId: mountSymbol.id,
      prefix: mount.prefix,
      routerName: mount.routerName,
      range: mount.range
    });
  }

  if (isPlayRoutesFile(input.filePath)) {
    for (const route of staticPlayRoutes(input.sourceText, lineStarts)) {
      addPlayRoute(route);
    }
    for (const mount of staticPlayRouterMounts(input.sourceText, lineStarts)) {
      addPlayRouterMount(mount);
    }
  } else {
    const root = parse("scala", input.sourceText).root();
    if (!hasSyntaxError(root)) {
      const topLevel = directChildren(root);
      const packageName = staticScalaPackage(root);
      for (const declaration of topLevel
        .map((node) => staticScalaOwner(node))
        .filter((candidate): candidate is StaticScalaOwner => candidate !== null)) {
        const owner = addOwner(declaration, packageName);
        const methods: SymbolNode[] = [];
        for (const method of directChildren(declaration.body)
          .map((node) => staticScalaFunction(node))
          .filter((candidate): candidate is StaticScalaFunction => candidate !== null)) {
          methods.push(addMethod(owner, method));
        }
        methodsByOwnerId.set(owner.id, methods);
      }
      for (const declaration of topLevel
        .map((node) => staticScalaFunction(node))
        .filter((candidate): candidate is StaticScalaFunction => candidate !== null)) {
        addFunction(declaration);
      }
      addCanonicalMemberCall();
    }
  }

  return {
    symbols,
    edges,
    pendingReferences,
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
    },
    scalaFacts: {
      classes: scalaClassFacts,
      routerMounts: playRouterMountFacts
    }
  };
}
