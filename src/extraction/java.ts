import { parser } from "@lezer/java";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SpringBootConfigurationPropertiesPrefixReferenceFact,
  type SpringBootPropertiesValueReferenceFact,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";
import { inspectJavaRecords, type StaticJavaRecord } from "./java-records.js";

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

interface StaticSpringBootConfigurationPropertiesPrefixReference {
  readonly prefix: string;
  readonly node: JavaSyntaxNode;
}

const SPRING_REST_CONTROLLER_PATH = "org.springframework.web.bind.annotation.RestController";
const SPRING_CONTROLLER_PATH = "org.springframework.stereotype.Controller";
const SPRING_REQUEST_MAPPING_PATH = "org.springframework.web.bind.annotation.RequestMapping";
const SPRING_VALUE_PATH = "org.springframework.beans.factory.annotation.Value";
const SPRING_CONFIGURATION_PROPERTIES_PATH =
  "org.springframework.boot.context.properties.ConfigurationProperties";
const MICRONAUT_CONTROLLER_PATH = "io.micronaut.http.annotation.Controller";
const JAKARTA_REST_PATH_PATHS = ["jakarta.ws.rs.Path", "javax.ws.rs.Path"] as const;
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

const JAKARTA_REST_METHOD_MAPPING_PATHS: Readonly<Record<string, RouteMethod>> = {
  "jakarta.ws.rs.GET": "GET",
  "jakarta.ws.rs.POST": "POST",
  "jakarta.ws.rs.PUT": "PUT",
  "jakarta.ws.rs.PATCH": "PATCH",
  "jakarta.ws.rs.DELETE": "DELETE",
  "jakarta.ws.rs.HEAD": "HEAD",
  "jakarta.ws.rs.OPTIONS": "OPTIONS",
  "javax.ws.rs.GET": "GET",
  "javax.ws.rs.POST": "POST",
  "javax.ws.rs.PUT": "PUT",
  "javax.ws.rs.PATCH": "PATCH",
  "javax.ws.rs.DELETE": "DELETE",
  "javax.ws.rs.HEAD": "HEAD",
  "javax.ws.rs.OPTIONS": "OPTIONS"
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

/**
 * Retains one direct literal prefix from `@ConfigurationProperties("app")`
 * or `@ConfigurationProperties(prefix = "app")`. `value =`, multiple
 * attributes, escaped strings, and dynamic forms are intentionally deferred.
 */
function staticSpringBootConfigurationPropertiesPrefix(
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
  const value = values[0];
  let prefix: string | null;
  if (value.name === "StringLiteral") {
    prefix = staticPlainJavaString(input, value);
  } else if (value.name === "ElementValuePair") {
    const pair = directChildren(value);
    const key = pair[0] === undefined ? null : identifierText(input, pair[0]);
    const literal = pair[2];
    if (
      pair.length !== 3 ||
      pair[1]?.name !== "AssignOp" ||
      key !== "prefix" ||
      literal === undefined
    ) {
      return null;
    }
    prefix = staticPlainJavaString(input, literal);
  } else {
    return null;
  }
  return prefix !== null && SPRING_BOOT_PROPERTIES_KEY.test(prefix) ? prefix : null;
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

/**
 * Jakarta REST `@Path` values are URI templates relative to the application's
 * base URI. This pass keeps one direct literal only; it never interprets a
 * template, parameter binding, encoding, or a deployment-level ApplicationPath.
 */
function staticJakartaRestPath(
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
      key !== "value" ||
      literal === undefined
    ) {
      return null;
    }
    path = staticPlainJavaString(input, literal);
  } else {
    return null;
  }
  return path !== null && !path.includes("\\") && !path.includes("//") && !/\s/u.test(path)
    ? path
    : null;
}

function isJakartaRestPathAnnotationName(name: string): boolean {
  return name === "Path" || JAKARTA_REST_PATH_PATHS.some((path) => path === name);
}

function isJakartaRestMethodAnnotationName(name: string): boolean {
  return Object.keys(JAKARTA_REST_METHOD_MAPPING_PATHS).some(
    (path) => name === path || name === path.split(".").at(-1)
  );
}

function matchesJakartaRestPath(
  annotation: StaticJavaAnnotation,
  imports: ReadonlyMap<string, string>
): boolean {
  return JAKARTA_REST_PATH_PATHS.some((path) => annotationMatches(annotation, path, imports));
}

function staticJakartaRestClassPrefix(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): string | null {
  const annotationsNamedPath = declaration.annotations.filter((annotation) =>
    isJakartaRestPathAnnotationName(annotation.name)
  );
  const paths = annotationsNamedPath.filter((annotation) => matchesJakartaRestPath(annotation, imports));
  if (annotationsNamedPath.length !== paths.length || paths.length !== 1) {
    return null;
  }
  const path = paths[0];
  return path === undefined ? null : staticJakartaRestPath(input, path);
}

function staticJakartaRestMethodRoute(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): StaticHttpRoute | null {
  const annotationsNamedPath = declaration.annotations.filter((annotation) =>
    isJakartaRestPathAnnotationName(annotation.name)
  );
  const paths = annotationsNamedPath.filter((annotation) => matchesJakartaRestPath(annotation, imports));
  if (annotationsNamedPath.length !== paths.length || paths.length > 1) {
    return null;
  }
  const annotationsNamedMethods = declaration.annotations.filter((annotation) =>
    isJakartaRestMethodAnnotationName(annotation.name)
  );
  const methods = annotationsNamedMethods.flatMap((annotation) => {
    const method = Object.entries(JAKARTA_REST_METHOD_MAPPING_PATHS).find(([path]) =>
      annotationMatches(annotation, path, imports)
    )?.[1];
    return method === undefined ? [] : [{ annotation, method }];
  });
  if (annotationsNamedMethods.length !== methods.length || methods.length !== 1) {
    return null;
  }
  const requestMethod = methods[0];
  if (requestMethod === undefined || requestMethod.annotation.node.name !== "MarkerAnnotation") {
    return null;
  }
  const pathAnnotation = paths[0];
  const path = pathAnnotation === undefined ? "" : staticJakartaRestPath(input, pathAnnotation);
  return path === null
    ? null
    : { method: requestMethod.method, path, node: requestMethod.annotation.node };
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

/**
 * Retains direct constructor-parameter `@Value` annotations after the same
 * exact Spring type proof as fields. Methods, nested declarations, and any
 * nonliteral annotation surface never enter this first constructor slice.
 */
function staticSpringBootConstructorParameterReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootPropertiesReference[] {
  const references: StaticSpringBootPropertiesReference[] = [];
  for (const constructor of directChildren(declaration.body)) {
    if (constructor.name !== "ConstructorDeclaration") {
      continue;
    }
    const parameters = directChildren(constructor).find(
      (child) => child.name === "FormalParameters"
    );
    if (parameters === undefined) {
      continue;
    }
    for (const parameter of directChildren(parameters)) {
      if (parameter.name !== "FormalParameter") {
        continue;
      }
      const annotations = staticAnnotations(input, parameter);
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
  }
  return references;
}

/**
 * Retains direct concrete-method parameter `@Value` annotations after the same
 * exact Spring type proof as fields and constructors. Abstract methods,
 * interfaces, nested declarations, and nonliteral annotation surfaces stay
 * outside this first method-injection slice.
 */
function staticSpringBootMethodParameterReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootPropertiesReference[] {
  const references: StaticSpringBootPropertiesReference[] = [];
  for (const method of directChildren(declaration.body)) {
    if (method.name !== "MethodDeclaration") {
      continue;
    }
    const hasBody = directChildren(method).some((child) => child.name === "Block");
    if (!hasBody) {
      continue;
    }
    const parameters = directChildren(method).find((child) => child.name === "FormalParameters");
    if (parameters === undefined) {
      continue;
    }
    for (const parameter of directChildren(parameters)) {
      if (parameter.name !== "FormalParameter") {
        continue;
      }
      const annotations = staticAnnotations(input, parameter);
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
  }
  return references;
}

/**
 * Retains one direct concrete-method `@Value` annotation only when the method
 * has exactly one parameter and that parameter has no separately proven Spring
 * `@Value`. This keeps method-level and parameter-level injection evidence from
 * producing duplicate or contradictory class-owned configuration facts.
 */
function staticSpringBootMethodAnnotationReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootPropertiesReference[] {
  const references: StaticSpringBootPropertiesReference[] = [];
  for (const method of directChildren(declaration.body)) {
    if (method.name !== "MethodDeclaration") {
      continue;
    }
    const children = directChildren(method);
    if (!children.some((child) => child.name === "Block")) {
      continue;
    }
    const formalParameters = children.find((child) => child.name === "FormalParameters");
    if (formalParameters === undefined) {
      continue;
    }
    const parameters = directChildren(formalParameters).filter(
      (child) => child.name === "FormalParameter"
    );
    const parameter = parameters[0];
    if (parameters.length !== 1 || parameter === undefined) {
      continue;
    }
    const parameterHasSpringValue = staticAnnotations(input, parameter).some(
      (annotation) =>
        (annotation.name === "Value" || annotation.name === SPRING_VALUE_PATH) &&
        annotationMatches(annotation, SPRING_VALUE_PATH, imports)
    );
    if (parameterHasSpringValue) {
      continue;
    }
    const annotations = staticAnnotations(input, method);
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

/**
 * A direct top-level Java class may own one statically proven Spring Boot
 * configuration prefix. The project resolver later fans it out only to
 * parser-proven leaf keys, keeping profile and format ambiguity explicit.
 */
function staticSpringBootConfigurationPropertiesPrefixReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootConfigurationPropertiesPrefixReference[] {
  const annotationsNamedConfigurationProperties = declaration.annotations.filter(
    (annotation) =>
      annotation.name === "ConfigurationProperties" ||
      annotation.name === SPRING_CONFIGURATION_PROPERTIES_PATH
  );
  const configurationPropertiesAnnotations = annotationsNamedConfigurationProperties.filter(
    (annotation) => annotationMatches(annotation, SPRING_CONFIGURATION_PROPERTIES_PATH, imports)
  );
  if (
    annotationsNamedConfigurationProperties.length !== configurationPropertiesAnnotations.length ||
    configurationPropertiesAnnotations.length !== 1
  ) {
    return [];
  }
  const annotation = configurationPropertiesAnnotations[0];
  if (annotation === undefined) {
    return [];
  }
  const prefix = staticSpringBootConfigurationPropertiesPrefix(input, annotation);
  return prefix === null ? [] : [{ prefix, node: annotation.node }];
}

function joinHttpPaths(prefix: string, path: string): string {
  const segments = [prefix, path]
    .flatMap((value) => value.split("/"))
    .filter((segment) => segment.length > 0);
  return `/${segments.join("/")}`;
}

/**
 * Extracts Java class and method symbols plus deliberately narrow Spring Web
 * and Micronaut/Jakarta REST routes, as well as Spring Boot properties facts. Each HTTP
 * surface proves a direct controller annotation, unambiguous framework import
 * (or fully-qualified annotation), one literal mapping path, and the exact
 * local method declaration. Spring Boot properties retain direct field-level
 * literal `@Value` placeholders and direct Java class-level
 * `@ConfigurationProperties` literal prefixes.
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
  const jakartaRestCapability = frameworkCapability("jakarta-rest");
  if (!jakartaRestCapability.languages.includes(input.language)) {
    throw new Error("Jakarta REST route extraction was invoked for an unsupported source language.");
  }
  const springBootPropertiesCapability = frameworkCapability("spring-boot-properties");
  if (!springBootPropertiesCapability.languages.includes(input.language)) {
    throw new Error("Spring Boot properties extraction was invoked for an unsupported source language.");
  }

  const root = parser.parse(input.sourceText).topNode;
  const recordInspection = inspectJavaRecords({ sourceText: input.sourceText });
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const javaClassFacts: Array<{ symbolId: string; packageName: string }> = [];
  const springBootPropertiesValueReferences: SpringBootPropertiesValueReferenceFact[] = [];
  const springBootConfigurationPropertiesPrefixes: SpringBootConfigurationPropertiesPrefixReferenceFact[] = [];
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

  function addContainmentAtRange(
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

  function addContainment(parent: SymbolNode, child: SymbolNode, node: JavaSyntaxNode): void {
    addContainmentAtRange(parent, child, rangeFor(lineStarts, node.from, node.to));
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

  function addRecord(declaration: StaticJavaRecord, packageName: string | null): SymbolNode {
    const qualifiedName = `${input.filePath}#${declaration.name}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const nodeRange = declaration.node.range();
    const range = rangeFor(lineStarts, nodeRange.start.index, nodeRange.end.index);
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
      range,
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainmentAtRange(fileNode, symbol, range);
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

  const canUseLegacyJavaRoot =
    !hasSyntaxError(root) ||
    (recordInspection.isSyntaxClean && recordInspection.recordRanges.length > 0);
  const packageName = canUseLegacyJavaRoot ? staticJavaPackage(input, root) : null;
  const overlapsRecord = (node: JavaSyntaxNode): boolean =>
    recordInspection.recordRanges.some(
      (recordRange) => node.from < recordRange.end && recordRange.start < node.to
    );

  if (canUseLegacyJavaRoot) {
    const imports = staticJavaImports(input, root);
    const classes = directChildren(root)
      .map((node) => staticJavaClass(input, node))
      .filter((candidate): candidate is StaticJavaClass => candidate !== null)
      .filter((candidate) => !hasSyntaxError(candidate.node));

    for (const classDeclaration of classes) {
      const classSymbol = addClass(classDeclaration, packageName);
      for (const reference of staticSpringBootPropertiesReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (overlapsRecord(reference.node)) {
          continue;
        }
        springBootPropertiesValueReferences.push({
          sourceId: classSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeFor(lineStarts, reference.node.from, reference.node.to)
        });
      }
      for (const reference of staticSpringBootConstructorParameterReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (overlapsRecord(reference.node)) {
          continue;
        }
        springBootPropertiesValueReferences.push({
          sourceId: classSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeFor(lineStarts, reference.node.from, reference.node.to)
        });
      }
      for (const reference of staticSpringBootMethodParameterReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (overlapsRecord(reference.node)) {
          continue;
        }
        springBootPropertiesValueReferences.push({
          sourceId: classSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeFor(lineStarts, reference.node.from, reference.node.to)
        });
      }
      for (const reference of staticSpringBootMethodAnnotationReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (overlapsRecord(reference.node)) {
          continue;
        }
        springBootPropertiesValueReferences.push({
          sourceId: classSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeFor(lineStarts, reference.node.from, reference.node.to)
        });
      }
      for (const reference of staticSpringBootConfigurationPropertiesPrefixReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (overlapsRecord(reference.node)) {
          continue;
        }
        springBootConfigurationPropertiesPrefixes.push({
          sourceId: classSymbol.id,
          filePath: input.filePath,
          prefix: reference.prefix,
          range: rangeFor(lineStarts, reference.node.from, reference.node.to)
        });
      }
      const methods = directChildren(classDeclaration.body)
        .map((node) => staticJavaMethod(input, node))
        .filter((candidate): candidate is StaticJavaMethod => candidate !== null)
        .filter((candidate) => !overlapsRecord(candidate.node));
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

      const jakartaRestPrefix = staticJakartaRestClassPrefix(input, classDeclaration, imports);
      if (jakartaRestPrefix !== null) {
        for (const methodDeclaration of methods) {
          const route = staticJakartaRestMethodRoute(input, methodDeclaration, imports);
          const handler = symbolsByMethod.get(methodDeclaration);
          if (route !== null && handler !== undefined) {
            addFrameworkRoute(
              classSymbol,
              { ...route, path: joinHttpPaths(jakartaRestPrefix, route.path) },
              handler,
              "framework.jakarta-rest.direct-path.literal-method-mapping.local-method"
            );
          }
        }
      }

      const micronautPrefix = staticMicronautClassPrefix(input, classDeclaration, imports);
      if (micronautPrefix !== null) {
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
  }

  if (recordInspection.isSyntaxClean) {
    for (const recordDeclaration of recordInspection.records) {
      const recordSymbol = addRecord(recordDeclaration, packageName);
      for (const reference of recordDeclaration.valueReferences) {
        const referenceRange = reference.node.range();
        springBootPropertiesValueReferences.push({
          sourceId: recordSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeFor(lineStarts, referenceRange.start.index, referenceRange.end.index)
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
      valueReferences: springBootPropertiesValueReferences,
      configurationPropertiesPrefixes: springBootConfigurationPropertiesPrefixes
    }
  };
}
