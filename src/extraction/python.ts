import { parser } from "@lezer/python";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface PythonExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "python";
}

type PythonSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

interface FastApiImport {
  readonly alias: string;
  readonly node: PythonSyntaxNode;
}

interface FastApiApplication {
  readonly name: string;
  readonly constructorName: string;
  readonly node: PythonSyntaxNode;
}

interface StaticFastApiDecorator {
  readonly receiver: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly node: PythonSyntaxNode;
}

const FASTAPI_DECORATOR_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
  trace: "TRACE"
};

function directChildren(node: PythonSyntaxNode): readonly PythonSyntaxNode[] {
  const children: PythonSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function nodeText(input: PythonExtractFileFactsInput, node: PythonSyntaxNode): string {
  return input.sourceText.slice(node.from, node.to);
}

function nodeKey(node: PythonSyntaxNode): string {
  return `${node.name}:${node.from}:${node.to}`;
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

function rangeFor(lineStarts: readonly number[], from: number, to: number): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function hasSyntaxError(node: PythonSyntaxNode): boolean {
  return node.type.isError || directChildren(node).some((child) => hasSyntaxError(child));
}

function declarationName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): string | null {
  const name =
    node.name === "VariableName"
      ? node
      : directChildren(node).find((child) => child.name === "VariableName");
  const text = name === undefined ? "" : nodeText(input, name);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(text) ? text : null;
}

function decoratedDefinition(node: PythonSyntaxNode): PythonSyntaxNode | null {
  if (node.name !== "DecoratedStatement") {
    return null;
  }
  const definitions = directChildren(node).filter(
    (child) => child.name === "FunctionDefinition" || child.name === "ClassDefinition"
  );
  return definitions.length === 1 ? definitions[0] ?? null : null;
}

function isDirectClassMethod(node: PythonSyntaxNode): boolean {
  const decorated = node.parent?.name === "DecoratedStatement" ? node.parent : null;
  const body = decorated?.parent ?? node.parent;
  return body?.name === "Body" && body.parent?.name === "ClassDefinition";
}

function isTopLevelFunction(node: PythonSyntaxNode): boolean {
  const statement = node.parent?.name === "DecoratedStatement" ? node.parent : node;
  return statement.parent?.name === "Script";
}

function staticFastApiImport(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): FastApiImport | null {
  if (node.name !== "ImportStatement") {
    return null;
  }
  const match = /^from[ \t]+fastapi[ \t]+import[ \t]+FastAPI(?:[ \t]+as[ \t]+([A-Za-z_][A-Za-z0-9_]*))?[ \t]*$/u.exec(
    nodeText(input, node)
  );
  return match === null ? null : { alias: match[1] ?? "FastAPI", node };
}

function directAssignmentName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): string | null {
  if (node.name !== "AssignStatement") {
    return null;
  }
  const target = directChildren(node)[0];
  return target?.name === "VariableName" ? declarationName(input, target) : null;
}

function staticFastApiApplication(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  constructorNames: ReadonlySet<string>
): FastApiApplication | null {
  if (node.name !== "AssignStatement") {
    return null;
  }
  const children = directChildren(node);
  const target = children[0];
  const operator = children[1];
  const call = children[2];
  if (
    children.length !== 3 ||
    target?.name !== "VariableName" ||
    operator?.name !== "AssignOp" ||
    call?.name !== "CallExpression"
  ) {
    return null;
  }

  const name = declarationName(input, target);
  const callChildren = directChildren(call);
  const constructor = callChildren[0];
  const arguments_ = callChildren[1];
  if (
    name === null ||
    callChildren.length !== 2 ||
    constructor?.name !== "VariableName" ||
    arguments_?.name !== "ArgList"
  ) {
    return null;
  }

  const constructorName = declarationName(input, constructor);
  return constructorName === null || !constructorNames.has(constructorName)
    ? null
    : { name, constructorName, node };
}

function directVariableNames(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): readonly string[] {
  const names: string[] = [];
  const visit = (candidate: PythonSyntaxNode): void => {
    if (candidate.name === "VariableName") {
      const name = declarationName(input, candidate);
      if (name !== null) {
        names.push(name);
      }
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  };
  visit(node);
  return names;
}

function targetBindsName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  name: string
): boolean {
  if (node.name === "VariableName") {
    return declarationName(input, node) === name;
  }
  if (!["TupleExpression", "ListExpression", "ParenthesizedExpression", "StarExpression"].includes(node.name)) {
    return false;
  }
  return directChildren(node).some((child) => targetBindsName(input, child, name));
}

function assignmentBindsName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  name: string
): boolean {
  const children = directChildren(node);
  return children.some(
    (child, index) => children[index + 1]?.name === "AssignOp" && targetBindsName(input, child, name)
  );
}

function syntaxMayBindName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  name: string
): boolean {
  const definition = decoratedDefinition(node) ?? node;
  if (definition.name === "FunctionDefinition" || definition.name === "ClassDefinition") {
    return declarationName(input, definition) === name;
  }
  if (node.name === "ImportStatement") {
    return directVariableNames(input, node).includes(name);
  }
  if (node.name === "AssignStatement" || node.name === "NamedExpression") {
    return assignmentBindsName(input, node, name);
  }
  if (node.name === "UpdateStatement" || node.name === "DeleteStatement") {
    return directChildren(node).some((child) => targetBindsName(input, child, name));
  }
  if (node.name === "ForStatement") {
    const children = directChildren(node);
    const inIndex = children.findIndex((child) => child.name === "in");
    return children
      .slice(0, inIndex < 0 ? 0 : inIndex)
      .some((child) => targetBindsName(input, child, name));
  }
  if (node.name === "WithStatement" || node.name === "TryStatement") {
    const children = directChildren(node);
    return children.some(
      (child, index) =>
        child.name === "as" &&
        children[index + 1] !== undefined &&
        targetBindsName(input, children[index + 1] as PythonSyntaxNode, name)
    );
  }
  if (node.name === "CapturePattern") {
    return directChildren(node).some((child) => targetBindsName(input, child, name));
  }
  if (node.name === "LambdaExpression") {
    return false;
  }
  return directChildren(node).some((child) => syntaxMayBindName(input, child, name));
}

function topLevelNodeBindsName(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode,
  name: string
): boolean {
  return syntaxMayBindName(input, node, name);
}

function hasTopLevelRebinding(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  name: string,
  after: number,
  before: number
): boolean {
  return topLevelNodes.some(
    (candidate) =>
      candidate.from >= after &&
      candidate.to <= before &&
      topLevelNodeBindsName(input, candidate, name)
  );
}

function staticPlainPythonString(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): string | null {
  const value = nodeText(input, node);
  const quote = value[0];
  if (
    value.length < 2 ||
    (quote !== "\"" && quote !== "'") ||
    value.at(-1) !== quote ||
    value.startsWith(`${quote}${quote}${quote}`)
  ) {
    return null;
  }
  const inner = value.slice(1, -1);
  return inner.includes("\\") || /[\r\n]/u.test(inner) ? null : inner;
}

function staticFastApiDecorator(
  input: PythonExtractFileFactsInput,
  node: PythonSyntaxNode
): StaticFastApiDecorator | null {
  if (node.name !== "Decorator") {
    return null;
  }
  const children = directChildren(node);
  const members = children.filter(
    (child) => child.name === "VariableName" || child.name === "PropertyName"
  );
  const arguments_ = children.filter((child) => child.name === "ArgList");
  if (members.length !== 2 || arguments_.length !== 1) {
    return null;
  }

  const receiver = declarationName(input, members[0] ?? node);
  const methodName = nodeText(input, members[1] ?? node);
  const method = FASTAPI_DECORATOR_METHODS[methodName];
  const argumentList = arguments_[0];
  const firstArgument = argumentList === undefined
    ? undefined
    : directChildren(argumentList).find(
        (child) => child.name !== "(" && child.name !== ")"
      );
  if (receiver === null || method === undefined || firstArgument?.name !== "String") {
    return null;
  }

  const path = staticPlainPythonString(input, firstArgument);
  return path === null || !path.startsWith("/") ? null : { receiver, method, path, node };
}

function latestProvenFastApiApplication(
  input: PythonExtractFileFactsInput,
  topLevelNodes: readonly PythonSyntaxNode[],
  imports: readonly FastApiImport[],
  applications: readonly FastApiApplication[],
  decorator: StaticFastApiDecorator
): FastApiApplication | null {
  const candidates = applications
    .filter(
      (application) =>
        application.name === decorator.receiver &&
        application.node.to <= decorator.node.from &&
        !hasTopLevelRebinding(
          input,
          topLevelNodes,
          application.name,
          application.node.to,
          decorator.node.from
        )
    )
    .sort((left, right) => right.node.from - left.node.from);

  for (const application of candidates) {
    const imported = imports
      .filter(
        (candidate) =>
          candidate.alias === application.constructorName &&
          candidate.node.to <= application.node.from &&
          !hasTopLevelRebinding(
            input,
            topLevelNodes,
            candidate.alias,
            candidate.node.to,
            application.node.from
          )
      )
      .sort((left, right) => right.node.from - left.node.from)
      .at(0);
    if (imported !== undefined) {
      return application;
    }
  }

  return null;
}

/**
 * Extracts conservative Python file facts. The initial Python surface records
 * declarations, containment, and same-file FastAPI decorator routes only.
 */
export function extractPythonFileFacts(input: PythonExtractFileFactsInput): ArtifactFacts {
  const capability = frameworkCapability("fastapi");
  if (!capability.languages.includes(input.language)) {
    throw new Error("FastAPI extraction was invoked for an unsupported source language.");
  }

  const root = parser.parse(input.sourceText).topNode;
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const symbolsByNodeKey = new Map<string, SymbolNode>();
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
  symbols.push(fileNode);

  function addContainment(parent: SymbolNode, child: SymbolNode, node: PythonSyntaxNode): void {
    const range = rangeFor(lineStarts, node.from, node.to);
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

  function addDeclaration(node: PythonSyntaxNode, owner: SymbolNode): SymbolNode | null {
    const name = declarationName(input, node);
    if (name === null) {
      return null;
    }
    const kind: SymbolKind =
      node.name === "ClassDefinition"
        ? "class"
        : isDirectClassMethod(node)
          ? "method"
          : "function";
    const qualifiedName =
      owner.kind === "file" ? `${input.filePath}#${name}` : `${owner.qualifiedName}.${name}`;
    const identity = `${qualifiedName}\u0000${kind}`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind,
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind,
      filePath: input.filePath,
      range: rangeFor(lineStarts, node.from, node.to),
      isExported: false,
      declarationOrdinal
    };
    symbols.push(symbol);
    symbolsByNodeKey.set(nodeKey(node), symbol);
    addContainment(owner, symbol, node);
    return symbol;
  }

  function visit(node: PythonSyntaxNode, owner: SymbolNode): void {
    const declaration =
      node.name === "FunctionDefinition" || node.name === "ClassDefinition"
        ? addDeclaration(node, owner)
        : null;
    for (const child of directChildren(node)) {
      visit(child, declaration ?? owner);
    }
  }

  if (!hasSyntaxError(root)) {
    const topLevelNodes = directChildren(root);
    for (const node of topLevelNodes) {
      visit(node, fileNode);
    }

    const imports = topLevelNodes
      .map((node) => staticFastApiImport(input, node))
      .filter((candidate): candidate is FastApiImport => candidate !== null);
    const constructorNames = new Set(imports.map((candidate) => candidate.alias));
    const applications = topLevelNodes
      .map((node) => staticFastApiApplication(input, node, constructorNames))
      .filter((candidate): candidate is FastApiApplication => candidate !== null);

    for (const statement of topLevelNodes) {
      const functionNode = decoratedDefinition(statement);
      if (functionNode === null || functionNode.name !== "FunctionDefinition" || !isTopLevelFunction(functionNode)) {
        continue;
      }
      const handler = symbolsByNodeKey.get(nodeKey(functionNode));
      if (handler?.kind !== "function") {
        continue;
      }
      for (const decoratorNode of directChildren(statement).filter((node) => node.name === "Decorator")) {
        const decorator = staticFastApiDecorator(input, decoratorNode);
        if (
          decorator === null ||
          latestProvenFastApiApplication(
            input,
            topLevelNodes,
            imports,
            applications,
            decorator
          ) === null
        ) {
          continue;
        }

        const routeName = `${decorator.method} ${decorator.path}`;
        const qualifiedName = `${input.filePath}#route:${routeName}`;
        const identity = `${qualifiedName}\u0000route`;
        const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
        declarationOrdinals.set(identity, declarationOrdinal + 1);
        const range = rangeFor(lineStarts, decorator.node.from, decorator.node.to);
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
        addContainment(fileNode, route, decorator.node);
        edges.push({
          id: createEdgeId({
            sourceId: route.id,
            targetId: handler.id,
            kind: "routes",
            line: range.start.line,
            column: range.start.column,
            referenceName: handler.name
          }),
          sourceId: route.id,
          targetId: handler.id,
          kind: "routes",
          filePath: input.filePath,
          range,
          resolution: "exact",
          confidence: 1,
          referenceName: handler.name,
          evidence: {
            ruleId: "framework.fastapi.direct-app.decorator.local-function",
            stage: "syntax",
            candidateSymbolIds: [handler.id]
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
    }
  };
}
