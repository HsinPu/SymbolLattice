import { parser } from "@lezer/java";

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

export interface JavaExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "java";
}

type JavaSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

interface StaticJavaAnnotation {
  readonly name: string;
  readonly node: JavaSyntaxNode;
}

interface StaticJavaClass {
  readonly name: string;
  readonly node: JavaSyntaxNode;
  readonly body: JavaSyntaxNode;
  readonly annotations: readonly StaticJavaAnnotation[];
  readonly isExported: boolean;
}

interface StaticJavaMethod {
  readonly name: string;
  readonly node: JavaSyntaxNode;
  readonly annotations: readonly StaticJavaAnnotation[];
  readonly isExported: boolean;
}

interface StaticHttpRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly node: JavaSyntaxNode;
}

interface StaticSpringBootPropertiesReference {
  readonly key: string;
  readonly node: JavaSyntaxNode;
}

const SPRING_REST_CONTROLLER_PATH = "org.springframework.web.bind.annotation.RestController";
const SPRING_CONTROLLER_PATH = "org.springframework.stereotype.Controller";
const SPRING_REQUEST_MAPPING_PATH = "org.springframework.web.bind.annotation.RequestMapping";
const SPRING_VALUE_PATH = "org.springframework.beans.factory.annotation.Value";
const MICRONAUT_CONTROLLER_PATH = "io.micronaut.http.annotation.Controller";
const SPRING_BOOT_PROPERTIES_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const SPRING_METHOD_MAPPING_PATHS: Readonly<Record<string, RouteMethod>> = {
  "org.springframework.web.bind.annotation.GetMapping": "GET",
  "org.springframework.web.bind.annotation.PostMapping": "POST",
  "org.springframework.web.bind.annotation.PutMapping": "PUT",
  "org.springframework.web.bind.annotation.PatchMapping": "PATCH",
  "org.springframework.web.bind.annotation.DeleteMapping": "DELETE"
};

const MICRONAUT_METHOD_MAPPING_PATHS: Readonly<Record<string, RouteMethod>> = {
  "io.micronaut.http.annotation.Get": "GET",
  "io.micronaut.http.annotation.Post": "POST",
  "io.micronaut.http.annotation.Put": "PUT",
  "io.micronaut.http.annotation.Patch": "PATCH",
  "io.micronaut.http.annotation.Delete": "DELETE",
  "io.micronaut.http.annotation.Head": "HEAD",
  "io.micronaut.http.annotation.Options": "OPTIONS",
  "io.micronaut.http.annotation.Trace": "TRACE"
};

function directChildren(node: JavaSyntaxNode): readonly JavaSyntaxNode[] {
  const children: JavaSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function nodeText(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): string {
  return input.sourceText.slice(node.from, node.to);
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

function hasSyntaxError(node: JavaSyntaxNode): boolean {
  return node.type.isError || directChildren(node).some((child) => hasSyntaxError(child));
}

function identifierText(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): string | null {
  const value = nodeText(input, node);
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value) ? value : null;
}

function staticDottedIdentifier(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): string | null {
  const value = nodeText(input, node);
  return /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u.test(value)
    ? value
    : null;
}

function staticPlainJavaString(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): string | null {
  if (node.name !== "StringLiteral") {
    return null;
  }
  const value = nodeText(input, node);
  if (
    value.length < 2 ||
    value[0] !== "\"" ||
    value.at(-1) !== "\"" ||
    value.includes("\\") ||
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  return value.slice(1, -1);
}

/**
 * Accepts the small path surface that has one syntactically direct string:
 * `@GetMapping("/pets")`, `@GetMapping(path = "/pets")`, or a bare mapping.
 * Arrays, concatenation, placeholders, and additional condition attributes are
 * deliberately deferred instead of being guessed from annotation text.
 */
function staticAnnotationPath(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation
): string | null {
  if (annotation.node.name === "MarkerAnnotation") {
    return "";
  }
  if (annotation.node.name !== "Annotation") {
    return null;
  }
  const arguments_ = directChildren(annotation.node).find(
    (child) => child.name === "AnnotationArgumentList"
  );
  if (arguments_ === undefined) {
    return null;
  }
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  if (values.length === 0) {
    return "";
  }
  const value = values[0];
  if (value === undefined || values.length !== 1) {
    return null;
  }
  if (value.name === "StringLiteral") {
    return staticPlainJavaString(input, value);
  }
  if (value.name !== "ElementValuePair") {
    return null;
  }
  const pair = directChildren(value);
  const key = pair[0] === undefined ? null : identifierText(input, pair[0]);
  const literal = pair[2];
  if (
    pair.length !== 3 ||
    pair[1]?.name !== "AssignOp" ||
    (key !== "path" && key !== "value") ||
    literal === undefined
  ) {
    return null;
  }
  return staticPlainJavaString(input, literal);
}

function staticSpringPath(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation
): string | null {
  const path = staticAnnotationPath(input, annotation);
  if (path === null) {
    return null;
  }
  if (path.length === 0) {
    return "";
  }
  return path.startsWith("/") && !path.includes("//") ? path : null;
}

/**
 * Micronaut maps a marker `@Controller` / HTTP method annotation to `/`.
 * This first slice accepts only that default, a single positional literal, or
 * one literal `value` (plus method-only `uri`) argument. `uris`, media-type
 * arrays, aliases, and dynamic URI construction deliberately remain absent.
 */
function staticMicronautPath(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation,
  allowUriArgument: boolean
): string | null {
  if (annotation.node.name === "MarkerAnnotation") {
    return "/";
  }
  if (annotation.node.name !== "Annotation") {
    return null;
  }
  const arguments_ = directChildren(annotation.node).find(
    (child) => child.name === "AnnotationArgumentList"
  );
  if (arguments_ === undefined) {
    return null;
  }
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  if (values.length === 0) {
    return "/";
  }
  if (values.length !== 1 || values[0] === undefined) {
    return null;
  }
  const value = values[0];
  let path: string | null;
  if (value.name === "StringLiteral") {
    path = staticPlainJavaString(input, value);
  } else if (value.name === "ElementValuePair") {
    const pair = directChildren(value);
    const key = pair[0] === undefined ? null : identifierText(input, pair[0]);
    const literal = pair[2];
    if (
      pair.length !== 3 ||
      pair[1]?.name !== "AssignOp" ||
      (key !== "value" && (!allowUriArgument || key !== "uri")) ||
      literal === undefined
    ) {
      return null;
    }
    path = staticPlainJavaString(input, literal);
  } else {
    return null;
  }
  return path !== null && path.startsWith("/") && !path.includes("//") ? path : null;
}

/**
 * Retains only a literal Spring placeholder value such as
 * `@Value("${server.port}")` or `@Value("${server.port:8080}")`. Named
 * arguments, escaped strings, nested placeholders, SpEL, and key expressions
 * are deferred rather than treated as configuration references.
 */
function staticSpringBootPropertiesKey(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation
): string | null {
  if (annotation.node.name !== "Annotation") {
    return null;
  }
  const arguments_ = directChildren(annotation.node).find(
    (child) => child.name === "AnnotationArgumentList"
  );
  if (arguments_ === undefined) {
    return null;
  }
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  if (values.length !== 1 || values[0] === undefined) {
    return null;
  }
  const literal = staticPlainJavaString(input, values[0]);
  if (literal === null) {
    return null;
  }
  const match = /^\$\{([A-Za-z0-9][A-Za-z0-9._-]*)(?::[^{}]*)?\}$/u.exec(literal);
  const key = match?.[1] ?? null;
  return key !== null && SPRING_BOOT_PROPERTIES_KEY.test(key) ? key : null;
}

function staticAnnotation(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): StaticJavaAnnotation | null {
  if (node.name !== "Annotation" && node.name !== "MarkerAnnotation") {
    return null;
  }
  const reference = directChildren(node).find(
    (child) => child.name === "Identifier" || child.name === "ScopedIdentifier"
  );
  const name =
    reference === undefined
      ? null
      : reference.name === "Identifier"
        ? identifierText(input, reference)
        : staticDottedIdentifier(input, reference);
  return name === null ? null : { name, node };
}

function staticAnnotations(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): readonly StaticJavaAnnotation[] {
  const modifiers = directChildren(node).find((child) => child.name === "Modifiers");
  return modifiers === undefined
    ? []
    : directChildren(modifiers)
        .map((child) => staticAnnotation(input, child))
        .filter((annotation): annotation is StaticJavaAnnotation => annotation !== null);
}

function staticJavaImport(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): string | null {
  if (node.name !== "ImportDeclaration") {
    return null;
  }
  const match = /^import\s+([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*;$/u.exec(
    nodeText(input, node)
  );
  return match?.[1] ?? null;
}

/**
 * Java has no aliases. A simple annotation name is trusted only if it maps to
 * one exact non-static, non-wildcard import; a fully-qualified annotation is
 * independently exact and does not need an import.
 */
function staticJavaImports(
  input: JavaExtractFileFactsInput,
  root: JavaSyntaxNode
): ReadonlyMap<string, string> {
  const pathsByLocalName = new Map<string, Set<string>>();
  for (const declaration of directChildren(root)) {
    const path = staticJavaImport(input, declaration);
    const localName = path?.split(".").at(-1);
    if (path === null || localName === undefined) {
      continue;
    }
    const paths = pathsByLocalName.get(localName) ?? new Set<string>();
    paths.add(path);
    pathsByLocalName.set(localName, paths);
  }

  const imports = new Map<string, string>();
  for (const [localName, paths] of pathsByLocalName) {
    if (paths.size === 1) {
      const path = [...paths][0];
      if (path !== undefined) {
        imports.set(localName, path);
      }
    }
  }
  return imports;
}

function staticJavaPackage(
  input: JavaExtractFileFactsInput,
  root: JavaSyntaxNode
): string | null {
  const declarations = directChildren(root).filter(
    (node) => node.name === "PackageDeclaration"
  );
  if (declarations.length === 0) {
    return "";
  }
  const declaration = declarations[0];
  if (declarations.length !== 1 || declaration === undefined) {
    return null;
  }
  const packageNameNode = directChildren(declaration).find(
    (node) => node.name === "ScopedIdentifier" || node.name === "Identifier"
  );
  return packageNameNode === undefined
    ? null
    : staticDottedIdentifier(input, packageNameNode);
}

function annotationMatches(
  annotation: StaticJavaAnnotation,
  expectedPath: string,
  imports: ReadonlyMap<string, string>
): boolean {
  return annotation.name === expectedPath || imports.get(annotation.name) === expectedPath;
}

function staticJavaClass(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaClass | null {
  if (node.name !== "ClassDeclaration") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.name === "Definition");
  const body = children.find((child) => child.name === "ClassBody");
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  if (name === null || body === undefined) {
    return null;
  }
  const modifiers = children.find((child) => child.name === "Modifiers");
  return {
    name,
    node,
    body,
    annotations: staticAnnotations(input, node),
    isExported: modifiers !== undefined && directChildren(modifiers).some((child) => child.name === "public")
  };
}

function staticJavaMethod(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaMethod | null {
  if (node.name !== "MethodDeclaration") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.name === "Definition");
  const body = children.find((child) => child.name === "Block");
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  if (name === null || body === undefined) {
    return null;
  }
  const modifiers = children.find((child) => child.name === "Modifiers");
  return {
    name,
    node,
    annotations: staticAnnotations(input, node),
    isExported: modifiers !== undefined && directChildren(modifiers).some((child) => child.name === "public")
  };
}

function staticClassPrefix(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): string | null {
  const annotationsNamedRequestMapping = declaration.annotations.filter(
    (annotation) => annotation.name === "RequestMapping" || annotation.name === SPRING_REQUEST_MAPPING_PATH
  );
  const mappings = declaration.annotations.filter((annotation) =>
    annotationMatches(annotation, SPRING_REQUEST_MAPPING_PATH, imports)
  );
  // An unproved `@RequestMapping` could alter the prefix, so do not emit a
  // plausible-but-wrong subroute beneath it.
  if (annotationsNamedRequestMapping.length !== mappings.length || mappings.length > 1) {
    return null;
  }
  if (mappings.length === 0) {
    return "";
  }
  const mapping = mappings[0];
  return mapping === undefined ? null : staticSpringPath(input, mapping);
}

function staticMethodRoute(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): StaticHttpRoute | null {
  const annotationsNamedRequestMapping = declaration.annotations.filter(
    (annotation) => annotation.name === "RequestMapping" || annotation.name === SPRING_REQUEST_MAPPING_PATH
  );
  const requestMappings = annotationsNamedRequestMapping.filter((annotation) =>
    annotationMatches(annotation, SPRING_REQUEST_MAPPING_PATH, imports)
  );
  if (
    annotationsNamedRequestMapping.length !== requestMappings.length ||
    requestMappings.length > 0
  ) {
    // `@RequestMapping(method = RequestMethod.GET)` is intentionally a later,
    // separately-tested surface. Never mix it with shortcut annotations here.
    return null;
  }
  const mappings = declaration.annotations.flatMap((annotation) => {
    const method = Object.entries(SPRING_METHOD_MAPPING_PATHS).find(([path]) =>
      annotationMatches(annotation, path, imports)
    )?.[1];
    return method === undefined ? [] : [{ annotation, method }];
  });
  if (mappings.length !== 1) {
    return null;
  }
  const mapping = mappings[0];
  if (mapping === undefined) {
    return null;
  }
  const path = staticSpringPath(input, mapping.annotation);
  return path === null ? null : { method: mapping.method, path, node: mapping.annotation.node };
}

function staticMicronautClassPrefix(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): string | null {
  const annotationsNamedController = declaration.annotations.filter(
    (annotation) => annotation.name === "Controller" || annotation.name === MICRONAUT_CONTROLLER_PATH
  );
  const controllers = annotationsNamedController.filter((annotation) =>
    annotationMatches(annotation, MICRONAUT_CONTROLLER_PATH, imports)
  );
  if (annotationsNamedController.length !== controllers.length || controllers.length !== 1) {
    return null;
  }
  const controller = controllers[0];
  return controller === undefined ? null : staticMicronautPath(input, controller, false);
}

function isMicronautMappingAnnotationName(name: string): boolean {
  return Object.keys(MICRONAUT_METHOD_MAPPING_PATHS).some(
    (path) => name === path || name === path.split(".").at(-1)
  );
}

function staticMicronautMethodRoute(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): StaticHttpRoute | null {
  const annotationsNamedMappings = declaration.annotations.filter((annotation) =>
    isMicronautMappingAnnotationName(annotation.name)
  );
  const mappings = annotationsNamedMappings.flatMap((annotation) => {
    const method = Object.entries(MICRONAUT_METHOD_MAPPING_PATHS).find(([path]) =>
      annotationMatches(annotation, path, imports)
    )?.[1];
    return method === undefined ? [] : [{ annotation, method }];
  });
  if (annotationsNamedMappings.length !== mappings.length || mappings.length !== 1) {
    return null;
  }
  const mapping = mappings[0];
  if (mapping === undefined) {
    return null;
  }
  const path = staticMicronautPath(input, mapping.annotation, true);
  return path === null ? null : { method: mapping.method, path, node: mapping.annotation.node };
}

function isSpringController(
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): boolean {
  return declaration.annotations.some(
    (annotation) =>
      annotationMatches(annotation, SPRING_REST_CONTROLLER_PATH, imports) ||
      annotationMatches(annotation, SPRING_CONTROLLER_PATH, imports)
  );
}

/**
 * Retains direct class-field `@Value` annotations only after one exact import
 * or fully-qualified annotation proves Spring's `Value` type. The owner is
 * the enclosing class because this Java slice does not add generic field
 * symbols; the annotation retains its own source range for later projection.
 */
function staticSpringBootPropertiesReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootPropertiesReference[] {
  const references: StaticSpringBootPropertiesReference[] = [];
  for (const field of directChildren(declaration.body)) {
    if (field.name !== "FieldDeclaration") {
      continue;
    }
    const annotations = staticAnnotations(input, field);
    const annotationsNamedValue = annotations.filter(
      (annotation) => annotation.name === "Value" || annotation.name === SPRING_VALUE_PATH
    );
    const valueAnnotations = annotationsNamedValue.filter((annotation) =>
      annotationMatches(annotation, SPRING_VALUE_PATH, imports)
    );
    if (
      annotationsNamedValue.length !== valueAnnotations.length ||
      valueAnnotations.length !== 1
    ) {
      continue;
    }
    const annotation = valueAnnotations[0];
    if (annotation === undefined) {
      continue;
    }
    const key = staticSpringBootPropertiesKey(input, annotation);
    if (key !== null) {
      references.push({ key, node: annotation.node });
    }
  }
  return references;
}

function joinHttpPaths(prefix: string, path: string): string {
  const segments = [prefix, path]
    .flatMap((value) => value.split("/"))
    .filter((segment) => segment.length > 0);
  return `/${segments.join("/")}`;
}

/**
 * Extracts Java class and method symbols plus deliberately narrow Spring Web
 * and Micronaut routes, as well as Spring Boot properties facts. Each HTTP
 * surface proves a direct controller annotation, unambiguous framework import
 * (or fully-qualified annotation), one literal mapping path, and the exact
 * local method declaration. Spring Boot properties retains only direct
 * field-level literal `@Value` placeholders.
 */
export function extractJavaFileFacts(input: JavaExtractFileFactsInput): ArtifactFacts {
  const springWebCapability = frameworkCapability("spring-web");
  if (!springWebCapability.languages.includes(input.language)) {
    throw new Error("Java framework extraction was invoked for an unsupported source language.");
  }
  const micronautCapability = frameworkCapability("micronaut");
  if (!micronautCapability.languages.includes(input.language)) {
    throw new Error("Micronaut route extraction was invoked for an unsupported source language.");
  }
  const springBootPropertiesCapability = frameworkCapability("spring-boot-properties");
  if (!springBootPropertiesCapability.languages.includes(input.language)) {
    throw new Error("Spring Boot properties extraction was invoked for an unsupported source language.");
  }

  const root = parser.parse(input.sourceText).topNode;
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const javaClassFacts: Array<{ symbolId: string; packageName: string }> = [];
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
    range: rangeFor(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  symbols.push(fileNode);

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = `${qualifiedName}\u0000${kind}`;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(parent: SymbolNode, child: SymbolNode, node: JavaSyntaxNode): void {
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

  function addClass(declaration: StaticJavaClass, packageName: string | null): SymbolNode {
    const qualifiedName = `${input.filePath}#${declaration.name}`;
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
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    if (packageName !== null) {
      javaClassFacts.push({ symbolId: symbol.id, packageName });
    }
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticJavaMethod): SymbolNode {
    const qualifiedName = `${parent.qualifiedName}.${declaration.name}`;
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
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    return symbol;
  }

  function addFrameworkRoute(
    parent: SymbolNode,
    routeFact: StaticHttpRoute,
    handler: SymbolNode,
    ruleId: string
  ): void {
    const routeName = `${routeFact.method} ${routeFact.path}`;
    const qualifiedName = `${parent.qualifiedName}#route:${routeName}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
    const range = rangeFor(lineStarts, routeFact.node.from, routeFact.node.to);
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
    addContainment(parent, route, routeFact.node);
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
        ruleId,
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const imports = staticJavaImports(input, root);
    const packageName = staticJavaPackage(input, root);
    const classes = directChildren(root)
      .map((node) => staticJavaClass(input, node))
      .filter((candidate): candidate is StaticJavaClass => candidate !== null);

    for (const classDeclaration of classes) {
      const classSymbol = addClass(classDeclaration, packageName);
      for (const reference of staticSpringBootPropertiesReferences(
        input,
        classDeclaration,
        imports
      )) {
        springBootPropertiesValueReferences.push({
          sourceId: classSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeFor(lineStarts, reference.node.from, reference.node.to)
        });
      }
      const methods = directChildren(classDeclaration.body)
        .map((node) => staticJavaMethod(input, node))
        .filter((candidate): candidate is StaticJavaMethod => candidate !== null);
      const symbolsByMethod = new Map<StaticJavaMethod, SymbolNode>();
      for (const methodDeclaration of methods) {
        symbolsByMethod.set(methodDeclaration, addMethod(classSymbol, methodDeclaration));
      }

      if (isSpringController(classDeclaration, imports)) {
        const prefix = staticClassPrefix(input, classDeclaration, imports);
        if (prefix !== null) {
          for (const methodDeclaration of methods) {
            const route = staticMethodRoute(input, methodDeclaration, imports);
            const handler = symbolsByMethod.get(methodDeclaration);
            if (route !== null && handler !== undefined) {
              addFrameworkRoute(
                classSymbol,
                { ...route, path: joinHttpPaths(prefix, route.path) },
                handler,
                "framework.spring-web.direct-controller.literal-method-mapping.local-method"
              );
            }
          }
        }
      }

      const micronautPrefix = staticMicronautClassPrefix(input, classDeclaration, imports);
      if (micronautPrefix === null) {
        continue;
      }
      for (const methodDeclaration of methods) {
        const route = staticMicronautMethodRoute(input, methodDeclaration, imports);
        const handler = symbolsByMethod.get(methodDeclaration);
        if (route !== null && handler !== undefined) {
          addFrameworkRoute(
            classSymbol,
            { ...route, path: joinHttpPaths(micronautPrefix, route.path) },
            handler,
            "framework.micronaut.direct-controller.literal-method-mapping.local-method"
          );
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
    },
    javaFacts: {
      classes: javaClassFacts
    },
    springBootPropertiesFacts: {
      valueReferences: springBootPropertiesValueReferences
    }
  };
}
