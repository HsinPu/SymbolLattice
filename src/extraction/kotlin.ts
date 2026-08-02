import { parse, type SgNode } from "./ast-grep-languages.js";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SpringBootPropertiesValueReferenceFact,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

/** Kotlin uses the shared prebuilt ast-grep Tree-sitter language registry. */

export interface KotlinExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "kotlin";
}

type KotlinSyntaxNode = SgNode;

interface StaticKotlinType {
  readonly kind: "class" | "interface";
  readonly name: string;
  readonly node: KotlinSyntaxNode;
  readonly body: KotlinSyntaxNode;
}

interface StaticKotlinFunction {
  readonly name: string;
  readonly node: KotlinSyntaxNode;
  readonly body: KotlinSyntaxNode | null;
  readonly receiverName: string | null;
}

interface StaticKtorRoute {
  readonly methodName: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly node: KotlinSyntaxNode;
}

interface StaticKotlinCall {
  readonly name: string;
  readonly suffix: KotlinSyntaxNode;
}

interface StaticKotlinSpringBootPropertiesReference {
  readonly key: string;
  readonly node: KotlinSyntaxNode;
}

const KTOR_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS"
};

const KTOR_APPLICATION_IMPORT = "io.ktor.server.application.Application";
const KTOR_ROUTING_IMPORT = "io.ktor.server.routing.routing";
const KTOR_ROUTE_IMPORT_PREFIX = "io.ktor.server.routing.";
const SPRING_VALUE_IMPORT = "org.springframework.beans.factory.annotation.Value";
const SPRING_BOOT_PROPERTIES_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function directChildren(node: KotlinSyntaxNode): readonly KotlinSyntaxNode[] {
  return node.children();
}

function nodeText(node: KotlinSyntaxNode): string {
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

function rangeForNode(node: KotlinSyntaxNode): SourceRange {
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

function hasSyntaxError(node: KotlinSyntaxNode): boolean {
  // Kotlin's grammar, like Ruby's, can represent a missing terminal as an
  // empty token instead of an ERROR node. Fail closed for either recovery form.
  return (
    node.kind() === "ERROR" ||
    (node.kind() !== "source_file" && nodeText(node).length === 0) ||
    directChildren(node).some((child) => hasSyntaxError(child))
  );
}

function identifierText(node: KotlinSyntaxNode): string | null {
  const value = nodeText(node);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) ? value : null;
}

function staticKotlinType(node: KotlinSyntaxNode): StaticKotlinType | null {
  if (node.kind() !== "class_declaration") {
    return null;
  }
  const children = directChildren(node);
  const classOrInterface = children.find(
    (child) => child.kind() === "class" || child.kind() === "interface"
  );
  const nameNode = children.find((child) => child.kind() === "type_identifier");
  const body = children.find((child) => child.kind() === "class_body");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  if (
    classOrInterface === undefined ||
    name === null ||
    body === undefined ||
    children.filter((child) => child.kind() === "type_identifier").length !== 1
  ) {
    return null;
  }
  const kind = classOrInterface.kind();
  if (kind === "class") {
    return { kind: "class", name, node, body };
  }
  if (kind === "interface") {
    return { kind: "interface", name, node, body };
  }
  return null;
}

function staticKotlinFunction(node: KotlinSyntaxNode): StaticKotlinFunction | null {
  if (node.kind() !== "function_declaration") {
    return null;
  }
  const children = directChildren(node);
  const identifiers = children.filter((child) => child.kind() === "simple_identifier");
  const nameNode = identifiers.at(-1);
  const name = nameNode === undefined ? null : identifierText(nameNode);
  if (name === null) {
    return null;
  }
  const receiver = children.find((child) => child.kind() === "user_type");
  const body = children.find((child) => child.kind() === "function_body") ?? null;
  return {
    name,
    node,
    body,
    receiverName: receiver === undefined ? null : nodeText(receiver)
  };
}

function staticDirectImportPaths(root: KotlinSyntaxNode): ReadonlySet<string> {
  const importList = directChildren(root).find((child) => child.kind() === "import_list");
  if (importList === undefined) {
    return new Set();
  }
  const imports = new Set<string>();
  for (const header of directChildren(importList).filter(
    (child) => child.kind() === "import_header"
  )) {
    const match = /^import\s+([A-Za-z_][A-Za-z0-9_.]*)$/u.exec(nodeText(header));
    if (match?.[1] !== undefined) {
      imports.add(match[1]);
    }
  }
  return imports;
}

function staticKotlinAnnotationInvocation(annotation: KotlinSyntaxNode): KotlinSyntaxNode | null {
  if (annotation.kind() !== "annotation") {
    return null;
  }
  const children = directChildren(annotation);
  const invocation = children.find((child) => child.kind() === "constructor_invocation");
  return children.length === 2 && invocation !== undefined ? invocation : null;
}

function staticKotlinAnnotationName(annotation: KotlinSyntaxNode): string | null {
  const invocation = staticKotlinAnnotationInvocation(annotation);
  if (invocation === null) {
    return null;
  }
  const userTypes = directChildren(invocation).filter((child) => child.kind() === "user_type");
  if (userTypes.length !== 1 || userTypes[0] === undefined) {
    return null;
  }
  const name = nodeText(userTypes[0]);
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u.test(name) ? name : null;
}

/**
 * Reads one Kotlin regular-string Spring placeholder. Kotlin evaluates an
 * unescaped `${...}` expression, so only the static `\${...}` spelling is
 * accepted. Raw strings, dynamic interpolation, named arguments, escapes
 * beyond the required dollar escape, and nested placeholders stay outside the
 * evidence boundary.
 */
function staticKotlinSpringBootPropertiesKey(annotation: KotlinSyntaxNode): string | null {
  const invocation = staticKotlinAnnotationInvocation(annotation);
  if (invocation === null) {
    return null;
  }
  const argumentLists = directChildren(invocation).filter((child) => child.kind() === "value_arguments");
  if (argumentLists.length !== 1 || argumentLists[0] === undefined) {
    return null;
  }
  const arguments_ = directChildren(argumentLists[0]).filter((child) => child.kind() === "value_argument");
  if (arguments_.length !== 1 || arguments_[0] === undefined) {
    return null;
  }
  const argumentChildren = directChildren(arguments_[0]);
  const literal = argumentChildren[0];
  if (literal?.kind() !== "string_literal" || argumentChildren.length !== 1) {
    return null;
  }
  const literalChildren = directChildren(literal);
  if (literalChildren.length !== 1 || literalChildren[0]?.kind() !== "string_content") {
    return null;
  }
  const source = nodeText(literal);
  const prefix = '"\\${';
  if (!source.startsWith(prefix) || !source.endsWith('}"')) {
    return null;
  }
  const placeholder = source.slice(prefix.length, -2);
  const defaultSeparator = placeholder.indexOf(":");
  const key = defaultSeparator < 0 ? placeholder : placeholder.slice(0, defaultSeparator);
  const defaultValue = defaultSeparator < 0 ? "" : placeholder.slice(defaultSeparator + 1);
  return SPRING_BOOT_PROPERTIES_KEY.test(key) && !/[{}"\\]/u.test(defaultValue) ? key : null;
}

/**
 * Retains direct Kotlin class-property Spring `@Value` annotations only after
 * one exact import or a fully-qualified annotation proves Spring's `Value`
 * type. Kotlin properties do not need their own generic graph symbols here;
 * the enclosing class owns the relation, matching the existing Java contract.
 */
function staticKotlinSpringBootPropertiesReferences(
  declaration: StaticKotlinType,
  imports: ReadonlySet<string>
): readonly StaticKotlinSpringBootPropertiesReference[] {
  if (declaration.kind !== "class") {
    return [];
  }
  const references: StaticKotlinSpringBootPropertiesReference[] = [];
  for (const property of directChildren(declaration.body).filter(
    (child) => child.kind() === "property_declaration"
  )) {
    const modifiers = directChildren(property).find((child) => child.kind() === "modifiers");
    if (modifiers === undefined) {
      continue;
    }
    const annotations = directChildren(modifiers).filter((child) => child.kind() === "annotation");
    const annotationsNamedValue = annotations.filter(
      (annotation) => staticKotlinAnnotationName(annotation) === "Value" ||
        staticKotlinAnnotationName(annotation) === SPRING_VALUE_IMPORT
    );
    const valueAnnotations = annotationsNamedValue.filter((annotation) => {
      const name = staticKotlinAnnotationName(annotation);
      return name === SPRING_VALUE_IMPORT || (name === "Value" && imports.has(SPRING_VALUE_IMPORT));
    });
    if (annotationsNamedValue.length !== valueAnnotations.length || valueAnnotations.length !== 1) {
      continue;
    }
    const annotation = valueAnnotations[0];
    if (annotation === undefined) {
      continue;
    }
    const key = staticKotlinSpringBootPropertiesKey(annotation);
    if (key !== null) {
      references.push({ key, node: annotation });
    }
  }
  return references;
}

function staticDirectCall(node: KotlinSyntaxNode): StaticKotlinCall | null {
  if (node.kind() !== "call_expression") {
    return null;
  }
  const children = directChildren(node);
  const callee = children[0];
  const suffix = children[1];
  const name = callee === undefined ? null : identifierText(callee);
  if (
    name === null ||
    suffix?.kind() !== "call_suffix" ||
    children.length !== 2
  ) {
    return null;
  }
  return { name, suffix };
}

function staticLambdaStatements(callSuffix: KotlinSyntaxNode): readonly KotlinSyntaxNode[] | null {
  const suffixChildren = directChildren(callSuffix);
  const annotatedLambda = suffixChildren[0];
  if (
    annotatedLambda?.kind() !== "annotated_lambda" ||
    suffixChildren.length !== 1
  ) {
    return null;
  }
  const lambdaChildren = directChildren(annotatedLambda);
  const lambda = lambdaChildren[0];
  if (lambda?.kind() !== "lambda_literal" || lambdaChildren.length !== 1) {
    return null;
  }
  const statements = directChildren(lambda).filter((child) => child.kind() === "statements");
  if (statements.length === 0) {
    return [];
  }
  return statements.length === 1 && statements[0] !== undefined
    ? directChildren(statements[0])
    : null;
}

function staticPlainKotlinPath(node: KotlinSyntaxNode): string | null {
  if (node.kind() !== "value_argument") {
    return null;
  }
  const children = directChildren(node);
  const stringLiteral = children[0];
  if (stringLiteral?.kind() !== "string_literal" || children.length !== 1) {
    return null;
  }
  const value = nodeText(stringLiteral);
  if (
    value.length < 2 ||
    value[0] !== "\"" ||
    value.at(-1) !== "\"" ||
    value.includes("\\") ||
    value.includes("$")
  ) {
    return null;
  }
  const path = value.slice(1, -1);
  return path.startsWith("/") && !path.includes("//") ? path : null;
}

function staticCallableReference(node: KotlinSyntaxNode): string | null {
  if (node.kind() !== "value_argument") {
    return null;
  }
  const children = directChildren(node);
  const reference = children[0];
  if (reference?.kind() !== "callable_reference" || children.length !== 1) {
    return null;
  }
  const match = /^::([A-Za-z_][A-Za-z0-9_]*)$/u.exec(nodeText(reference));
  return match?.[1] ?? null;
}

function staticKtorRoute(node: KotlinSyntaxNode): StaticKtorRoute | null {
  const call = staticDirectCall(node);
  const method = call === null ? undefined : KTOR_ROUTE_METHODS[call.name];
  if (call === null || method === undefined) {
    return null;
  }
  const suffixChildren = directChildren(call.suffix);
  const valueArguments = suffixChildren[0];
  if (valueArguments?.kind() !== "value_arguments" || suffixChildren.length !== 1) {
    return null;
  }
  const arguments_ = directChildren(valueArguments).filter(
    (child) => child.kind() === "value_argument"
  );
  if (arguments_.length !== 2 || arguments_[0] === undefined || arguments_[1] === undefined) {
    return null;
  }
  const path = staticPlainKotlinPath(arguments_[0]);
  const handlerName = staticCallableReference(arguments_[1]);
  return path === null || handlerName === null
    ? null
    : { methodName: call.name, method, path, handlerName, node };
}

function staticKtorRouteStatements(
  functionDeclaration: StaticKotlinFunction
): readonly KotlinSyntaxNode[] {
  if (
    functionDeclaration.name !== "module" ||
    functionDeclaration.receiverName !== "Application" ||
    functionDeclaration.body === null
  ) {
    return [];
  }
  const bodyStatements = directChildren(functionDeclaration.body).filter(
    (child) => child.kind() === "statements"
  );
  if (bodyStatements.length !== 1 || bodyStatements[0] === undefined) {
    return [];
  }
  const routeStatements: KotlinSyntaxNode[] = [];
  for (const statement of directChildren(bodyStatements[0])) {
    const call = staticDirectCall(statement);
    if (call?.name !== "routing") {
      continue;
    }
    const statements = staticLambdaStatements(call.suffix);
    if (statements !== null) {
      routeStatements.push(...statements);
    }
  }
  return routeStatements;
}

export function extractKotlinFileFacts(input: KotlinExtractFileFactsInput): ArtifactFacts {
  const ktorCapability = frameworkCapability("ktor");
  if (!ktorCapability.languages.includes(input.language)) {
    throw new Error("Ktor framework extraction was invoked for an unsupported source language.");
  }
  const springBootPropertiesCapability = frameworkCapability("spring-boot-properties");
  if (!springBootPropertiesCapability.languages.includes(input.language)) {
    throw new Error("Spring Boot properties extraction was invoked for an unsupported source language.");
  }

  const root = parse("kotlin", input.sourceText).root();
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const springBootPropertiesValueReferences: SpringBootPropertiesValueReferenceFact[] = [];
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

  function addContainment(parent: SymbolNode, child: SymbolNode, node: KotlinSyntaxNode): void {
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

  function addType(declaration: StaticKotlinType): SymbolNode {
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
    addContainment(fileNode, symbol, declaration.node);
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticKotlinFunction): SymbolNode {
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

  function addFunction(declaration: StaticKotlinFunction): SymbolNode {
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

  function addKtorRoute(routeFact: StaticKtorRoute, handler: SymbolNode): void {
    const routeName = routeFact.method + " " + routeFact.path;
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
        ruleId:
          "framework.ktor.direct-application-module.routing.literal-route.callable-reference.local-function",
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const topLevel = directChildren(root);
    const imports = staticDirectImportPaths(root);
    const topLevelFunctions = topLevel
      .map((node) => staticKotlinFunction(node))
      .filter((candidate): candidate is StaticKotlinFunction => candidate !== null);
    const functionsByName = new Map<string, SymbolNode[]>();

    for (const declaration of topLevel
      .map((node) => staticKotlinType(node))
      .filter((candidate): candidate is StaticKotlinType => candidate !== null)) {
      const typeSymbol = addType(declaration);
      for (const reference of staticKotlinSpringBootPropertiesReferences(declaration, imports)) {
        springBootPropertiesValueReferences.push({
          sourceId: typeSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeForNode(reference.node)
        });
      }
      for (const methodDeclaration of directChildren(declaration.body)
        .map((node) => staticKotlinFunction(node))
        .filter((candidate): candidate is StaticKotlinFunction => candidate !== null)) {
        addMethod(typeSymbol, methodDeclaration);
      }
    }

    for (const functionDeclaration of topLevelFunctions) {
      const symbol = addFunction(functionDeclaration);
      const candidates = functionsByName.get(functionDeclaration.name) ?? [];
      candidates.push(symbol);
      functionsByName.set(functionDeclaration.name, candidates);
    }

    if (imports.has(KTOR_APPLICATION_IMPORT) && imports.has(KTOR_ROUTING_IMPORT)) {
      for (const functionDeclaration of topLevelFunctions) {
        for (const statement of staticKtorRouteStatements(functionDeclaration)) {
          const route = staticKtorRoute(statement);
          if (
            route === null ||
            !imports.has(KTOR_ROUTE_IMPORT_PREFIX + route.methodName)
          ) {
            continue;
          }
          const handlerCandidates = functionsByName.get(route.handlerName) ?? [];
          if (handlerCandidates.length === 1) {
            const handler = handlerCandidates[0];
            if (handler !== undefined) {
              addKtorRoute(route, handler);
            }
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
    springBootPropertiesFacts: {
      valueReferences: springBootPropertiesValueReferences,
      configurationPropertiesPrefixes: []
    },
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
