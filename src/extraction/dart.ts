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

/** Dart uses the shared prebuilt ast-grep Tree-sitter language registry. */

export interface DartExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "dart";
}

type DartSyntaxNode = SgNode;

interface StaticDartClass {
  readonly name: string;
  readonly node: DartSyntaxNode;
  readonly body: DartSyntaxNode;
}

interface StaticDartFunction {
  readonly name: string;
  readonly node: DartSyntaxNode;
}

interface StaticDartFunctionBody {
  readonly declaration: StaticDartFunction;
  readonly body: DartSyntaxNode;
}

interface StaticDartDirectCall {
  readonly name: string;
  readonly node: DartSyntaxNode;
}

interface StaticFlutterRoute {
  readonly path: string;
  readonly widgetName: string;
  readonly node: DartSyntaxNode;
}

const FLUTTER_MATERIAL_IMPORT = "package:flutter/material.dart";

function directChildren(node: DartSyntaxNode): readonly DartSyntaxNode[] {
  return node.children();
}

function nodeText(node: DartSyntaxNode): string {
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

function rangeForNode(node: DartSyntaxNode): SourceRange {
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

function hasSyntaxError(node: DartSyntaxNode): boolean {
  return (
    node.kind() === "ERROR" ||
    (node.kind() !== "program" && nodeText(node).length === 0) ||
    directChildren(node).some((child) => hasSyntaxError(child))
  );
}

function identifierText(node: DartSyntaxNode): string | null {
  const value = nodeText(node);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function staticDartClass(node: DartSyntaxNode): StaticDartClass | null {
  if (node.kind() !== "class_definition") {
    return null;
  }
  const children = directChildren(node);
  const identifiers = children.filter((child) => child.kind() === "identifier");
  const nameNode = identifiers[0];
  const body = children.find((child) => child.kind() === "class_body");
  const name = nameNode === undefined || identifiers.length !== 1 ? null : identifierText(nameNode);
  return name === null || body === undefined ? null : { name, node, body };
}

function staticDartFunctionSignature(node: DartSyntaxNode): StaticDartFunction | null {
  if (node.kind() !== "function_signature") {
    return null;
  }
  const identifiers = directChildren(node).filter((child) => child.kind() === "identifier");
  const nameNode = identifiers[0];
  const name = nameNode === undefined || identifiers.length !== 1 ? null : identifierText(nameNode);
  return name === null ? null : { name, node };
}

function staticDartMethod(node: DartSyntaxNode): StaticDartFunction | null {
  if (node.kind() === "method_signature") {
    const signature = directChildren(node).find((child) => child.kind() === "function_signature");
    const functionDeclaration =
      signature === undefined ? null : staticDartFunctionSignature(signature);
    return functionDeclaration === null
      ? null
      : { ...functionDeclaration, node };
  }

  if (node.kind() === "declaration") {
    const signature = directChildren(node).find((child) => child.kind() === "function_signature");
    const functionDeclaration =
      signature === undefined ? null : staticDartFunctionSignature(signature);
    return functionDeclaration === null
      ? null
      : { ...functionDeclaration, node };
  }

  return null;
}

function staticTopLevelDartFunctions(
  topLevel: readonly DartSyntaxNode[]
): readonly StaticDartFunctionBody[] {
  const functions: StaticDartFunctionBody[] = [];
  for (let index = 0; index + 1 < topLevel.length; index += 1) {
    const signature = topLevel[index];
    const body = topLevel[index + 1];
    if (signature === undefined || body?.kind() !== "function_body") {
      continue;
    }
    const declaration = staticDartFunctionSignature(signature);
    if (declaration !== null) {
      functions.push({ declaration, body });
    }
  }
  return functions;
}

function hasCrossFileDartVisibility(topLevel: readonly DartSyntaxNode[]): boolean {
  return topLevel.some((node) =>
    [
      "import_or_export",
      "library_name",
      "part_directive",
      "part_of_directive"
    ].includes(String(node.kind()))
  );
}

function collectIdentifierNames(node: DartSyntaxNode, names: Set<string>): void {
  if (node.kind() === "identifier") {
    const name = identifierText(node);
    if (name !== null) {
      names.add(name);
    }
  }
  for (const child of directChildren(node)) {
    collectIdentifierNames(child, names);
  }
}

function firstDirectDeclarationName(node: DartSyntaxNode): string | null {
  const nameNode = directChildren(node).find(
    (child) => child.kind() === "identifier" || child.kind() === "type_identifier"
  );
  return nameNode === undefined ? null : identifierText(nameNode);
}

function competingTopLevelDartNames(topLevel: readonly DartSyntaxNode[]): ReadonlySet<string> {
  const names = new Set<string>();
  const namedDeclarationKinds = new Set([
    "class_definition",
    "enum_declaration",
    "extension_declaration",
    "getter_signature",
    "mixin_declaration",
    "setter_signature",
    "type_alias"
  ]);
  const variableDeclarationKinds = new Set([
    "initialized_identifier_list",
    "static_final_declaration_list"
  ]);

  for (const node of topLevel) {
    const kind = String(node.kind());
    if (namedDeclarationKinds.has(kind)) {
      const name = firstDirectDeclarationName(node);
      if (name !== null) {
        names.add(name);
      }
    } else if (variableDeclarationKinds.has(kind)) {
      collectIdentifierNames(node, names);
    }
  }
  return names;
}

function hasNoDartFunctionParameters(signature: DartSyntaxNode): boolean {
  if (directChildren(signature).some((child) => child.kind() === "type_parameters")) {
    return false;
  }
  const parameterList = directChildren(signature).find(
    (child) => child.kind() === "formal_parameter_list"
  );
  return (
    parameterList !== undefined &&
    directChildren(parameterList).every((child) => child.kind() === "(" || child.kind() === ")")
  );
}

function shadowingDartNames(declaration: StaticDartFunction, body: DartSyntaxNode): ReadonlySet<string> {
  const names = new Set<string>();
  const parameterList = directChildren(declaration.node).find(
    (child) => child.kind() === "formal_parameter_list"
  );
  if (parameterList !== undefined) {
    collectIdentifierNames(parameterList, names);
  }

  const bindingKinds = new Set([
    "catch_parameters",
    "for_loop_parts",
    "local_function_declaration",
    "local_variable_declaration"
  ]);
  function collectBindings(node: DartSyntaxNode): void {
    const kind = String(node.kind());
    if (bindingKinds.has(kind) || kind.includes("pattern")) {
      collectIdentifierNames(node, names);
      return;
    }
    for (const child of directChildren(node)) {
      collectBindings(child);
    }
  }
  collectBindings(body);
  return names;
}

function collectStaticDartDirectCalls(
  node: DartSyntaxNode,
  calls: StaticDartDirectCall[]
): void {
  if (node.kind() === "function_expression" || node.kind() === "local_function_declaration") {
    return;
  }
  const children = directChildren(node);
  for (let index = 0; index + 1 < children.length; index += 1) {
    const callee = children[index];
    const selector = children[index + 1];
    const name = callee?.kind() === "identifier" ? identifierText(callee) : null;
    if (
      callee !== undefined &&
      name !== null &&
      selector !== undefined &&
      staticEmptySelectorArguments(selector)
    ) {
      calls.push({ name, node: callee });
    }
  }
  for (const child of children) {
    collectStaticDartDirectCalls(child, calls);
  }
}

function hasDirectFlutterMaterialImport(root: DartSyntaxNode): boolean {
  return directChildren(root).some((node) => {
    if (node.kind() !== "import_or_export") {
      return false;
    }
    const normalized = nodeText(node).replace(/\s+/gu, " ").trim();
    return (
      normalized === "import '" + FLUTTER_MATERIAL_IMPORT + "';" ||
      normalized === "import \"" + FLUTTER_MATERIAL_IMPORT + "\";"
    );
  });
}

function staticSelectorArguments(selector: DartSyntaxNode): readonly DartSyntaxNode[] | null {
  if (selector.kind() !== "selector") {
    return null;
  }
  const selectorChildren = directChildren(selector);
  const argumentPart = selectorChildren[0];
  if (argumentPart?.kind() !== "argument_part" || selectorChildren.length !== 1) {
    return null;
  }
  const argumentPartChildren = directChildren(argumentPart);
  const argumentsNode = argumentPartChildren[0];
  if (argumentsNode?.kind() !== "arguments" || argumentPartChildren.length !== 1) {
    return null;
  }
  return directChildren(argumentsNode);
}

function staticEmptyArguments(node: DartSyntaxNode): boolean {
  if (node.kind() !== "arguments") {
    return false;
  }
  return directChildren(node).every((child) => child.kind() === "(" || child.kind() === ")");
}

function staticEmptySelectorArguments(selector: DartSyntaxNode): boolean {
  const selectorChildren = staticSelectorArguments(selector);
  if (selectorChildren === null) {
    return false;
  }
  const argumentsNode = directChildren(selector)[0];
  const argumentPart = argumentsNode === undefined ? undefined : directChildren(argumentsNode)[0];
  return argumentPart !== undefined && staticEmptyArguments(argumentPart);
}

function staticPlainDartPath(node: DartSyntaxNode): string | null {
  if (node.kind() !== "string_literal") {
    return null;
  }
  const value = nodeText(node);
  const quote = value[0];
  if (
    quote === undefined ||
    (quote !== "'" && quote !== "\"") ||
    value.length < 3 ||
    value.at(-1) !== quote ||
    value.includes("\\") ||
    value.includes("$") ||
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  const path = value.slice(1, -1);
  return path.startsWith("/") && !path.includes("//") ? path : null;
}

function staticWidgetBuilderTarget(node: DartSyntaxNode): string | null {
  if (node.kind() !== "function_expression") {
    return null;
  }
  const children = directChildren(node);
  const parameters = children[0];
  const body = children[1];
  if (
    parameters?.kind() !== "formal_parameter_list" ||
    body?.kind() !== "function_expression_body" ||
    children.length !== 2
  ) {
    return null;
  }
  if (
    directChildren(parameters).filter((child) => child.kind() === "formal_parameter").length !== 1
  ) {
    return null;
  }
  const bodyChildren = directChildren(body);
  const arrow = bodyChildren[0];
  const expression = bodyChildren[1];
  if (arrow?.kind() !== "=>" || expression === undefined) {
    return null;
  }

  if (expression.kind() === "const_object_expression" && bodyChildren.length === 2) {
    const expressionChildren = directChildren(expression);
    const typeNode = expressionChildren.find((child) => child.kind() === "type_identifier");
    const argumentsNode = expressionChildren.find((child) => child.kind() === "arguments");
    const typeName = typeNode === undefined ? null : identifierText(typeNode);
    if (
      typeName === null ||
      argumentsNode === undefined ||
      !staticEmptyArguments(argumentsNode) ||
      expressionChildren.filter((child) => child.kind() === "type_identifier").length !== 1
    ) {
      return null;
    }
    return typeName;
  }

  const selector = bodyChildren[2];
  const typeName = expression.kind() === "identifier" ? identifierText(expression) : null;
  return (
    typeName !== null &&
    selector !== undefined &&
    bodyChildren.length === 3 &&
    staticEmptySelectorArguments(selector)
  )
    ? typeName
    : null;
}

function staticFlutterRoutePair(node: DartSyntaxNode): StaticFlutterRoute | null {
  if (node.kind() !== "pair") {
    return null;
  }
  const children = directChildren(node);
  const pathNode = children[0];
  const colon = children[1];
  const builder = children[2];
  if (
    pathNode === undefined ||
    colon?.kind() !== ":" ||
    builder === undefined ||
    children.length !== 3
  ) {
    return null;
  }
  const path = staticPlainDartPath(pathNode);
  const widgetName = staticWidgetBuilderTarget(builder);
  return path === null || widgetName === null ? null : { path, widgetName, node };
}

function staticFlutterRoutesFromMaterialApp(
  selector: DartSyntaxNode
): readonly StaticFlutterRoute[] | null {
  const arguments_ = staticSelectorArguments(selector);
  if (arguments_ === null) {
    return null;
  }
  const routesArguments = arguments_.filter((argument) => {
    if (argument.kind() !== "named_argument") {
      return false;
    }
    const label = directChildren(argument)[0];
    return label?.kind() === "label" && nodeText(label) === "routes:";
  });
  const routesArgument = routesArguments[0];
  if (routesArgument === undefined || routesArguments.length !== 1) {
    return null;
  }
  const routesChildren = directChildren(routesArgument);
  const routesLiteral = routesChildren[1];
  if (
    routesChildren[0]?.kind() !== "label" ||
    routesLiteral?.kind() !== "set_or_map_literal" ||
    routesChildren.length !== 2
  ) {
    return null;
  }
  const literalChildren = directChildren(routesLiteral);
  const pairs = literalChildren.filter((child) => child.kind() === "pair");
  if (
    literalChildren.some(
      (child) =>
        child.kind() !== "{" &&
        child.kind() !== "}" &&
        child.kind() !== "," &&
        child.kind() !== "pair"
    )
  ) {
    return null;
  }
  const routes: StaticFlutterRoute[] = [];
  for (const pair of pairs) {
    const route = staticFlutterRoutePair(pair);
    if (route === null) {
      return null;
    }
    routes.push(route);
  }
  return routes;
}

function collectStaticFlutterRoutes(
  node: DartSyntaxNode,
  routes: StaticFlutterRoute[]
): void {
  const children = directChildren(node);
  for (let index = 0; index + 1 < children.length; index += 1) {
    const callee = children[index];
    const selector = children[index + 1];
    if (
      callee?.kind() === "identifier" &&
      identifierText(callee) === "MaterialApp" &&
      selector?.kind() === "selector"
    ) {
      const materialAppRoutes = staticFlutterRoutesFromMaterialApp(selector);
      if (materialAppRoutes !== null) {
        routes.push(...materialAppRoutes);
      }
    }
  }
  for (const child of children) {
    collectStaticFlutterRoutes(child, routes);
  }
}

export function extractDartFileFacts(input: DartExtractFileFactsInput): ArtifactFacts {
  const flutterCapability = frameworkCapability("flutter");
  if (!flutterCapability.languages.includes(input.language)) {
    throw new Error("Flutter framework extraction was invoked for an unsupported source language.");
  }

  const root = parse("dart", input.sourceText).root();
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

  function addContainment(parent: SymbolNode, child: SymbolNode, node: DartSyntaxNode): void {
    const range = rangeForNode(node);
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

  function addClass(declaration: StaticDartClass): SymbolNode {
    const qualifiedName = input.filePath + "#" + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticDartFunction): SymbolNode {
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
    addContainment(parent, symbol, declaration.node);
    return symbol;
  }

  function addFunction(declaration: StaticDartFunction): SymbolNode {
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
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addDirectCall(
    caller: SymbolNode,
    callee: SymbolNode,
    call: StaticDartDirectCall
  ): void {
    const range = rangeForNode(call.node);
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: call.name
      }),
      sourceId: caller.id,
      targetId: callee.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: call.name,
      evidence: {
        ruleId: "syntax.dart.same-file.unique-top-level-zero-argument-function-call",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
      }
    });
  }

  function addFlutterRoute(routeFact: StaticFlutterRoute, widget: SymbolNode): void {
    const routeName = "NAVIGATE " + routeFact.path;
    const qualifiedName = input.filePath + "#route:" + routeName;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
    const range = rangeForNode(routeFact.node);
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
      range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(route);
    addContainment(fileNode, route, routeFact.node);
    edges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: widget.id,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName: widget.name
      }),
      sourceId: route.id,
      targetId: widget.id,
      kind: "routes",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: widget.name,
      evidence: {
        ruleId:
          "framework.flutter.direct-material-app.literal-routes-map.local-widget-class",
        stage: "syntax",
        candidateSymbolIds: [widget.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const topLevel = directChildren(root);
    const classesByName = new Map<string, SymbolNode[]>();
    const topLevelFunctionDeclarations = topLevel
      .map((node) => staticDartFunctionSignature(node))
      .filter((candidate): candidate is StaticDartFunction => candidate !== null);
    const topLevelFunctions = staticTopLevelDartFunctions(topLevel);
    const functionSymbols = new Map<DartSyntaxNode, SymbolNode>();
    const functionDeclarationCounts = new Map<string, number>();
    const functionsByName = new Map<string, StaticDartFunctionBody[]>();

    for (const declaration of topLevel
      .map((node) => staticDartClass(node))
      .filter((candidate): candidate is StaticDartClass => candidate !== null)) {
      const classSymbol = addClass(declaration);
      const classes = classesByName.get(declaration.name) ?? [];
      classes.push(classSymbol);
      classesByName.set(declaration.name, classes);

      for (const methodDeclaration of directChildren(declaration.body)
        .map((node) => staticDartMethod(node))
        .filter((candidate): candidate is StaticDartFunction => candidate !== null)) {
        addMethod(classSymbol, methodDeclaration);
      }
    }

    for (const declaration of topLevelFunctionDeclarations) {
      functionSymbols.set(declaration.node, addFunction(declaration));
      functionDeclarationCounts.set(
        declaration.name,
        (functionDeclarationCounts.get(declaration.name) ?? 0) + 1
      );
    }

    for (const function_ of topLevelFunctions) {
      const candidates = functionsByName.get(function_.declaration.name) ?? [];
      candidates.push(function_);
      functionsByName.set(function_.declaration.name, candidates);
    }

    if (!hasCrossFileDartVisibility(topLevel)) {
      const competingNames = competingTopLevelDartNames(topLevel);
      for (const caller of topLevelFunctions) {
        const callerSymbol = functionSymbols.get(caller.declaration.node);
        if (callerSymbol === undefined) {
          continue;
        }
        const shadowingNames = shadowingDartNames(caller.declaration, caller.body);
        const directCalls: StaticDartDirectCall[] = [];
        collectStaticDartDirectCalls(caller.body, directCalls);
        for (const call of directCalls) {
          const candidates = functionsByName.get(call.name) ?? [];
          const target = candidates[0];
          if (
            functionDeclarationCounts.get(call.name) !== 1 ||
            candidates.length !== 1 ||
            target === undefined ||
            competingNames.has(call.name) ||
            shadowingNames.has(call.name) ||
            !hasNoDartFunctionParameters(target.declaration.node)
          ) {
            continue;
          }
          const calleeSymbol = functionSymbols.get(target.declaration.node);
          if (calleeSymbol !== undefined) {
            addDirectCall(callerSymbol, calleeSymbol, call);
          }
        }
      }
    }

    if (hasDirectFlutterMaterialImport(root)) {
      const routes: StaticFlutterRoute[] = [];
      collectStaticFlutterRoutes(root, routes);
      for (const route of routes) {
        const widgetCandidates = classesByName.get(route.widgetName) ?? [];
        if (widgetCandidates.length === 1) {
          const widget = widgetCandidates[0];
          if (widget !== undefined) {
            addFlutterRoute(route, widget);
          }
        }
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
