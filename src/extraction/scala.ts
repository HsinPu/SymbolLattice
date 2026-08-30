import { parse, type SgNode } from "./ast-grep-languages.js";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type ScalaRelationCallFact,
  type ScalaRelationCallableFact,
  type ScalaRelationFacts,
  type ScalaRelationHeritageFact,
  type ScalaRelationImportFact,
  type ScalaRelationInstantiationFact,
  type ScalaRelationOverrideFact,
  type ScalaRelationTypeFact,
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

interface ScalaRawParameterShape {
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterNames: readonly string[];
  readonly parameterTypeNames: readonly string[];
}

interface ScalaRawCall {
  readonly sourceKey: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "module" | "member";
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly receiverObjectName?: string;
  readonly argumentCount: number;
  readonly node: ScalaSyntaxNode;
}

interface ScalaRawInstantiation {
  readonly sourceKey: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly node: ScalaSyntaxNode;
}

interface ScalaRawHeritage {
  readonly sourceId: string;
  readonly referenceName: string;
  readonly relationKind: "extends" | "implements";
  readonly node: ScalaSyntaxNode;
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

function walkScalaNodes(node: ScalaSyntaxNode, visitor: (candidate: ScalaSyntaxNode) => void): void {
  visitor(node);
  for (const child of directChildren(node)) walkScalaNodes(child, visitor);
}

function simpleScalaTypeName(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/gu, " ");
  return normalized !== undefined && /^[A-Z_][A-Za-z0-9_]*(?:\.[A-Z_][A-Za-z0-9_]*)*$/u.test(normalized)
    ? normalized
    : null;
}

function scalaParameterShape(node: ScalaSyntaxNode): ScalaRawParameterShape {
  const groups = directChildren(node).filter((child) => child.kind() === "parameters" || child.kind() === "class_parameters");
  const parameterNames: string[] = [];
  const parameterTypeNames: string[] = [];
  let requiredParameterCount = 0;
  for (const group of groups) {
    for (const parameter of directChildren(group).filter((child) => child.kind() === "parameter" || child.kind() === "class_parameter")) {
      const text = nodeText(parameter).trim();
      const match = /^(?:val\s+|var\s+|using\s+|implicit\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=]+?)(?:\s*=.*)?$/u.exec(text);
      const name = match?.[1];
      const typeText = match?.[2]?.trim();
      if (name === undefined || typeText === undefined || text.includes("=") || /\b(?:using|implicit|given)\b/u.test(text)) continue;
      parameterNames.push(name);
      const typeName = simpleScalaTypeName(typeText);
      if (typeName !== null) parameterTypeNames.push(typeName);
      requiredParameterCount += 1;
    }
  }
  return { parameterCount: parameterNames.length, requiredParameterCount, parameterNames, parameterTypeNames: parameterTypeNames.length === parameterNames.length ? parameterTypeNames : [] };
}

function scalaReturnTypeName(node: ScalaSyntaxNode): string | undefined {
  const header = nodeText(node).split("=")[0] ?? "";
  const match = /:\s*([^:=]+?)\s*$/u.exec(header);
  const typeName = simpleScalaTypeName(match?.[1]);
  return typeName ?? undefined;
}

function scalaArgumentCount(node: ScalaSyntaxNode): number {
  const argumentsNode = directChildren(node).find((child) => child.kind() === "arguments");
  if (argumentsNode === undefined) return 0;
  const text = nodeText(argumentsNode).trim();
  if (text === "()") return 0;
  const content = text.startsWith("(") && text.endsWith(")") ? text.slice(1, -1).trim() : text;
  return content === "" ? 0 : content.split(",").length;
}

function scalaOwnerName(node: ScalaSyntaxNode): string | null {
  const nameNode = directChildren(node).find((child) => child.kind() === "identifier");
  return nameNode === undefined ? null : identifierText(nameNode);
}

function scalaTypeReferenceName(node: ScalaSyntaxNode): string | null {
  const text = nodeText(node).trim();
  const first = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/u.exec(text)?.[1];
  return first === undefined ? null : first;
}

function scalaNodeKey(node: ScalaSyntaxNode): string {
  const range = node.range();
  return `${range.start.line}:${range.start.column}:${range.end.line}:${range.end.column}`;
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
  const scalaRelationTypes: ScalaRelationTypeFact[] = [];
  const scalaRelationCallables: ScalaRelationCallableFact[] = [];
  const scalaRelationImports: ScalaRelationImportFact[] = [];
  const scalaRelationCalls: ScalaRelationCallFact[] = [];
  const scalaRelationInstantiations: ScalaRelationInstantiationFact[] = [];
  const scalaRelationHeritage: ScalaRelationHeritageFact[] = [];
  const scalaRelationOverrides: ScalaRelationOverrideFact[] = [];
  const relationCallableSymbolsByNode = new Map<string, SymbolNode>();
  const relationTypeSymbolsByName = new Map<string, SymbolNode[]>();
  const ownerFieldTypes = new Map<string, ReadonlyMap<string, string>>();
  let scalaRelationParserRejected = false;
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
    const declarationKind: ScalaRelationTypeFact["declarationKind"] = declaration.node.kind() === "object_definition"
      ? "object"
      : declaration.node.kind() === "trait_definition"
        ? "trait"
        : nodeText(declaration.node).trimStart().startsWith("case class")
          ? "caseclass"
          : "class";
    const constructorShape = declarationKind === "class" || declarationKind === "caseclass" ? scalaParameterShape(declaration.node) : null;
    const relationFact: ScalaRelationTypeFact = {
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      packageName: packageName ?? "",
      qualifiedTypePath: packageName === null || packageName === "" ? declaration.name : `${packageName}.${declaration.name}`,
      declarationKind,
      isExported: true,
      ...(constructorShape === null ? {} : { constructorParameterCount: constructorShape.parameterCount, constructorRequiredParameterCount: constructorShape.requiredParameterCount }),
      range: symbol.range
    };
    scalaRelationTypes.push(relationFact);
    relationTypeSymbolsByName.set(`${relationFact.packageName}\u0000${relationFact.name}`, [...(relationTypeSymbolsByName.get(`${relationFact.packageName}\u0000${relationFact.name}`) ?? []), symbol]);
    if (constructorShape !== null) {
      const fields: Array<readonly [string, string]> = [];
      constructorShape.parameterNames.forEach((name, index) => {
        const typeName = constructorShape.parameterTypeNames[index];
        if (typeName !== undefined) fields.push([name, typeName]);
      });
      ownerFieldTypes.set(symbol.id, new Map(fields));
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
    const shape = scalaParameterShape(declaration.node);
    const returnTypeName = scalaReturnTypeName(declaration.node);
    const relationCallable: ScalaRelationCallableFact = {
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      packageName: staticScalaPackage(parse("scala", input.sourceText).root()) ?? "",
      callableKind: "method",
      ownerTypeName: parent.name,
      ownerTypeId: parent.id,
      parameterCount: shape.parameterCount,
      requiredParameterCount: shape.requiredParameterCount,
      ...(shape.parameterTypeNames.length === shape.parameterCount ? { parameterTypeNames: shape.parameterTypeNames } : {}),
      ...(returnTypeName === undefined ? {} : { returnTypeName }),
      isExported: true,
      ...(nodeText(declaration.node).trimStart().startsWith("override ") ? { isOverride: true } : {}),
      range: symbol.range
    };
    scalaRelationCallables.push(relationCallable);
    relationCallableSymbolsByNode.set(scalaNodeKey(declaration.node), symbol);
    if (relationCallable.isOverride) scalaRelationOverrides.push({ sourceId: symbol.id, filePath: input.filePath, methodName: declaration.name, ownerTypeName: parent.name, range: symbol.range });
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

  function addFunction(declaration: StaticScalaFunction): SymbolNode {
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
    const shape = scalaParameterShape(declaration.node);
    const packageName = staticScalaPackage(parse("scala", input.sourceText).root()) ?? "";
    const returnTypeName = scalaReturnTypeName(declaration.node);
    scalaRelationCallables.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      packageName,
      callableKind: "function",
      parameterCount: shape.parameterCount,
      requiredParameterCount: shape.requiredParameterCount,
      ...(shape.parameterTypeNames.length === shape.parameterCount ? { parameterTypeNames: shape.parameterTypeNames } : {}),
      ...(returnTypeName === undefined ? {} : { returnTypeName }),
      isExported: true,
      range: symbol.range
    });
    relationCallableSymbolsByNode.set(scalaNodeKey(declaration.node), symbol);
    return symbol;
  }

  function addRelationTypeSymbol(name: string, declarationKind: "enum" | "typealias", packageName: string, range: SourceRange): SymbolNode {
    const qualifiedName = input.filePath + "#" + name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "type");
    const symbol: SymbolNode = {
      id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "type", declarationOrdinal }),
      name,
      qualifiedName,
      kind: "type",
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, range);
    scalaRelationTypes.push({ symbolId: symbol.id, filePath: input.filePath, name, packageName, qualifiedTypePath: packageName === "" ? name : `${packageName}.${name}`, declarationKind, isExported: true, range });
    relationTypeSymbolsByName.set(`${packageName}\u0000${name}`, [...(relationTypeSymbolsByName.get(`${packageName}\u0000${name}`) ?? []), symbol]);
    return symbol;
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
    scalaRelationParserRejected = hasSyntaxError(root);
    if (!scalaRelationParserRejected) {
      const topLevel = directChildren(root);
      const packageName = staticScalaPackage(root);
      const ownersByNodeKey = new Map<string, SymbolNode>();
      for (const declaration of topLevel
        .map((node) => staticScalaOwner(node))
        .filter((candidate): candidate is StaticScalaOwner => candidate !== null)) {
        const owner = addOwner(declaration, packageName);
        ownersByNodeKey.set(scalaNodeKey(declaration.node), owner);
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
      for (const node of topLevel) {
        if (node.kind() === "enum_definition") {
          const nameNode = directChildren(node).find((child) => child.kind() === "identifier");
          const name = nameNode === undefined ? null : identifierText(nameNode);
          if (name !== null) addRelationTypeSymbol(name, "enum", packageName ?? "", rangeForNode(node));
        } else if (node.kind() === "type_definition") {
          const nameNode = directChildren(node).find((child) => child.kind() === "type_identifier");
          const name = nameNode === undefined ? null : scalaTypeReferenceName(nameNode);
          if (name !== null) addRelationTypeSymbol(name, "typealias", packageName ?? "", rangeForNode(node));
        }
        if (node.kind() !== "import_declaration") continue;
        const raw = nodeText(node).trim().replace(/^import\s+/u, "");
        const range = rangeForNode(node);
        const addImport = (importedPath: string, importedName: string, localName: string, isWildcard: boolean, isAliased: boolean): void => {
          scalaRelationImports.push({ sourceId: fileNode.id, filePath: input.filePath, importedPath, importedName, localName, isWildcard, isAliased, range });
        };
        const selectorStart = raw.indexOf(".{");
        if (selectorStart >= 0 && raw.endsWith("}")) {
          const prefix = raw.slice(0, selectorStart);
          const selectors = raw.slice(selectorStart + 2, -1).split(",").map((selector) => selector.trim()).filter((selector) => selector.length > 0);
          for (const selector of selectors) {
            if (selector === "_") { addImport(prefix, "", "", true, false); continue; }
            const parts = selector.split(/\s*=>\s*/u);
            const importedName = parts[0] ?? "";
            const localName = parts[1] ?? importedName;
            if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(importedName) && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(localName)) addImport(`${prefix}.${importedName}`, importedName, localName, false, parts.length > 1);
          }
        } else if (raw.endsWith("._")) {
          addImport(raw.slice(0, -2), "", "", true, false);
        } else if (/^(?:[A-Za-z_][A-Za-z0-9_]*\.)+[A-Za-z_][A-Za-z0-9_]*$/u.test(raw)) {
          const importedName = raw.split(".").at(-1) ?? raw;
          addImport(raw, importedName, importedName, false, false);
        }
      }
      for (const ownerDeclaration of topLevel
        .map((node) => staticScalaOwner(node))
        .filter((candidate): candidate is StaticScalaOwner => candidate !== null)) {
        const owner = ownersByNodeKey.get(scalaNodeKey(ownerDeclaration.node));
        const extendsClause = directChildren(ownerDeclaration.node).find((child) => child.kind() === "extends_clause");
        if (owner === undefined || extendsClause === undefined) continue;
        let first = true;
        for (const parent of directChildren(extendsClause).filter((child) => child.kind() === "type_identifier" || child.kind() === "generic_type")) {
          const referenceName = scalaTypeReferenceName(parent);
          if (referenceName === null) continue;
          scalaRelationHeritage.push({ sourceId: owner.id, filePath: input.filePath, referenceName, relationKind: first ? "extends" : "implements", range: rangeForNode(extendsClause) });
          first = false;
        }
      }
      const functionEntries: Array<{ readonly node: ScalaSyntaxNode; readonly source: SymbolNode; readonly ownerName?: string; readonly ownerId?: string }> = [];
      for (const ownerDeclaration of topLevel
        .map((node) => staticScalaOwner(node))
        .filter((candidate): candidate is StaticScalaOwner => candidate !== null)) {
        const owner = ownersByNodeKey.get(scalaNodeKey(ownerDeclaration.node));
        if (owner === undefined) continue;
        for (const methodDeclaration of directChildren(ownerDeclaration.body)
          .map((node) => staticScalaFunction(node))
          .filter((candidate): candidate is StaticScalaFunction => candidate !== null)) {
          const source = relationCallableSymbolsByNode.get(scalaNodeKey(methodDeclaration.node));
          if (source !== undefined) functionEntries.push({ node: methodDeclaration.node, source, ownerName: owner.name, ownerId: owner.id });
        }
      }
      for (const functionDeclaration of topLevel
        .map((node) => staticScalaFunction(node))
        .filter((candidate): candidate is StaticScalaFunction => candidate !== null)) {
        const source = relationCallableSymbolsByNode.get(scalaNodeKey(functionDeclaration.node));
        if (source !== undefined) functionEntries.push({ node: functionDeclaration.node, source });
      }
      for (const entry of functionEntries) {
        const bindings = new Map<string, string>(entry.ownerId === undefined ? [] : [...(ownerFieldTypes.get(entry.ownerId) ?? new Map()).entries()]);
        const shape = scalaParameterShape(entry.node);
        shape.parameterNames.forEach((name, index) => { const typeName = shape.parameterTypeNames[index]; if (typeName !== undefined) bindings.set(name, typeName); });
        for (const match of nodeText(entry.node).matchAll(/\b(?:val|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Z_][A-Za-z0-9_]*(?:\.[A-Z_][A-Za-z0-9_]*)*)\s*=/gu)) {
          const name = match[1];
          const typeName = match[2];
          if (name !== undefined && typeName !== undefined) bindings.set(name, typeName);
        }
        walkScalaNodes(entry.node, (candidate) => {
          if (candidate.kind() === "instance_expression") {
            const typeNode = directChildren(candidate).find((child) => child.kind() === "type_identifier" || child.kind() === "generic_type");
            const typeName = typeNode === undefined ? null : scalaTypeReferenceName(typeNode);
            if (typeName !== null) scalaRelationInstantiations.push({ sourceId: entry.source.id, filePath: input.filePath, typeName, argumentCount: scalaArgumentCount(candidate), range: rangeForNode(candidate) });
            return;
          }
          if (candidate.kind() !== "call_expression") return;
          const callee = directChildren(candidate).find((child) => child.kind() !== "arguments");
          if (callee === undefined) return;
          const argumentCount = scalaArgumentCount(candidate);
          if (callee.kind() === "field_expression") {
            const parts = nodeText(callee).split(".");
            const referenceName = parts.at(-1);
            const receiverName = parts.slice(0, -1).join(".");
            if (referenceName === undefined || receiverName === "") return;
            const receiverTypeName = receiverName === "this" ? entry.ownerName : bindings.get(receiverName);
            if (/^[A-Z]/u.test(receiverName)) scalaRelationCalls.push({ sourceId: entry.source.id, filePath: input.filePath, referenceName, callKind: "module", receiverObjectName: receiverName, argumentCount, range: rangeForNode(candidate) });
            else scalaRelationCalls.push({ sourceId: entry.source.id, filePath: input.filePath, referenceName, callKind: "member", receiverName, ...(receiverTypeName === undefined ? {} : { receiverTypeName }), argumentCount, range: rangeForNode(candidate) });
            return;
          }
          const referenceName = identifierText(callee);
          if (referenceName === null) return;
          if (/^[A-Z]/u.test(referenceName)) scalaRelationInstantiations.push({ sourceId: entry.source.id, filePath: input.filePath, typeName: referenceName, argumentCount, range: rangeForNode(candidate) });
          else scalaRelationCalls.push({ sourceId: entry.source.id, filePath: input.filePath, referenceName, callKind: "direct", argumentCount, range: rangeForNode(candidate) });
        });
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
    },
    scalaRelationFacts: {
      packageName: isPlayRoutesFile(input.filePath) ? "" : (staticScalaPackage(parse("scala", input.sourceText).root()) ?? ""),
      parserRejected: isPlayRoutesFile(input.filePath) || scalaRelationParserRejected,
      types: scalaRelationTypes,
      callables: scalaRelationCallables,
      imports: scalaRelationImports,
      calls: scalaRelationCalls,
      instantiations: scalaRelationInstantiations,
      heritage: scalaRelationHeritage,
      overrides: scalaRelationOverrides
    }
  };
}
