import { parser } from "@lezer/java";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type JvmCallableSignatureReferenceFact,
  type JvmDependencyInjectionReferenceFact,
  type JvmFacts,
  type JvmHeritageSyntax,
  type JavaCallTypeReferenceFact,
  type JavaCallableDeclarationFact,
  type JavaChainedCallReferenceFact,
  type JavaMemberCallReferenceFact,
  type PendingReference,
  type ReactNativeFacts,
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
  readonly kind: "class";
  readonly name: string;
  readonly node: JavaSyntaxNode;
  readonly body: JavaSyntaxNode;
  readonly annotations: readonly StaticJavaAnnotation[];
  readonly isExported: boolean;
}

interface StaticJavaInterface {
  readonly kind: "interface";
  readonly name: string;
  readonly node: JavaSyntaxNode;
  readonly body: JavaSyntaxNode;
  readonly isExported: boolean;
}

type StaticJavaType = StaticJavaClass | StaticJavaInterface;

interface StaticJavaSuperclassReference {
  readonly name: string;
  readonly node: JavaSyntaxNode;
  /** Direct dotted spelling such as `example.api.Contract`, never an import lookup. */
  readonly qualifiedTypePath?: string;
}

interface StaticJavaDependencyInjectionReference {
  readonly syntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly reference: StaticJavaSuperclassReference;
}

interface StaticJavaDependencyInjectionAnnotation {
  readonly path: string;
  readonly constructorSyntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly fieldSyntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly methodSyntax: JvmDependencyInjectionReferenceFact["syntax"];
}

interface StaticJavaResourceInjectionAnnotation {
  readonly path: string;
  readonly fieldSyntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly setterSyntax: JvmDependencyInjectionReferenceFact["syntax"];
}

interface StaticJavaMethod {
  readonly name: string;
  readonly nameNode: JavaSyntaxNode;
  readonly node: JavaSyntaxNode;
  /** Null for an abstract interface declaration such as `void run();`. */
  readonly body: JavaSyntaxNode | null;
  readonly annotations: readonly StaticJavaAnnotation[];
  readonly isStatic: boolean;
  readonly visibility: "public" | "protected" | "package" | "private";
  readonly isExported: boolean;
}

interface StaticJavaConstructor {
  readonly name: string;
  readonly nameNode: JavaSyntaxNode;
  readonly node: JavaSyntaxNode;
  readonly body: JavaSyntaxNode;
  readonly annotations: readonly StaticJavaAnnotation[];
  readonly visibility: "public" | "protected" | "package" | "private";
  readonly isExported: boolean;
}

type StaticJavaReactNativeModuleKind = "direct" | "codegen-spec";

interface StaticJavaReactNativeModule {
  readonly moduleName: string;
  readonly kind: StaticJavaReactNativeModuleKind;
}

interface StaticHttpRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly node: JavaSyntaxNode;
  readonly ruleId?: string;
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
const SPRING_REQUEST_METHOD_PATH = "org.springframework.web.bind.annotation.RequestMethod";
const SPRING_VALUE_PATH = "org.springframework.beans.factory.annotation.Value";
const SPRING_CONFIGURATION_PROPERTIES_PATH =
  "org.springframework.boot.context.properties.ConfigurationProperties";
const SPRING_CONFIGURATION_PATH = "org.springframework.context.annotation.Configuration";
const SPRING_BEAN_PATH = "org.springframework.context.annotation.Bean";
const SPRING_AUTOWIRED_PATH = "org.springframework.beans.factory.annotation.Autowired";
const JAKARTA_INJECT_PATH = "jakarta.inject.Inject";
const JAVAX_INJECT_PATH = "javax.inject.Inject";
const JAKARTA_RESOURCE_PATH = "jakarta.annotation.Resource";
const JAVAX_RESOURCE_PATH = "javax.annotation.Resource";
const REACT_NATIVE_REACT_METHOD_PATH = "com.facebook.react.bridge.ReactMethod";
const REACT_NATIVE_CONTEXT_BASE_MODULE_PATH =
  "com.facebook.react.bridge.ReactContextBaseJavaModule";
const MICRONAUT_CONTROLLER_PATH = "io.micronaut.http.annotation.Controller";
const JAKARTA_REST_PATH_PATHS = ["jakarta.ws.rs.Path", "javax.ws.rs.Path"] as const;
const SPRING_BOOT_PROPERTIES_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const REACT_NATIVE_BRIDGE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

const JAVA_DEPENDENCY_INJECTION_ANNOTATIONS: readonly StaticJavaDependencyInjectionAnnotation[] = [
  {
    path: SPRING_AUTOWIRED_PATH,
    constructorSyntax: "spring-autowired-constructor",
    fieldSyntax: "spring-autowired-field",
    methodSyntax: "spring-autowired-method"
  },
  {
    path: JAKARTA_INJECT_PATH,
    constructorSyntax: "jakarta-inject-constructor",
    fieldSyntax: "jakarta-inject-field",
    methodSyntax: "jakarta-inject-method"
  },
  {
    path: JAVAX_INJECT_PATH,
    constructorSyntax: "javax-inject-constructor",
    fieldSyntax: "javax-inject-field",
    methodSyntax: "javax-inject-method"
  }
];

const JAVA_RESOURCE_INJECTION_ANNOTATIONS: readonly StaticJavaResourceInjectionAnnotation[] = [
  {
    path: JAKARTA_RESOURCE_PATH,
    fieldSyntax: "jakarta-resource-field",
    setterSyntax: "jakarta-resource-setter"
  },
  {
    path: JAVAX_RESOURCE_PATH,
    fieldSyntax: "javax-resource-field",
    setterSyntax: "javax-resource-setter"
  }
];

const SPRING_METHOD_MAPPING_PATHS: Readonly<Record<string, RouteMethod>> = {
  "org.springframework.web.bind.annotation.GetMapping": "GET",
  "org.springframework.web.bind.annotation.PostMapping": "POST",
  "org.springframework.web.bind.annotation.PutMapping": "PUT",
  "org.springframework.web.bind.annotation.PatchMapping": "PATCH",
  "org.springframework.web.bind.annotation.DeleteMapping": "DELETE"
};

const SPRING_REQUEST_METHODS: Readonly<Record<string, RouteMethod>> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
  TRACE: "TRACE"
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

function isLegacyGrammarDefaultModifierMarker(node: JavaSyntaxNode): boolean {
  if (
    !node.type.isError ||
    node.from !== node.to ||
    node.parent?.name !== "Modifiers" ||
    node.parent.parent?.name !== "MethodDeclaration" ||
    node.parent.parent.parent?.name !== "InterfaceBody"
  ) {
    return false;
  }
  const siblings = directChildren(node.parent);
  return (
    siblings.length === 2 &&
    siblings[0]?.name === "default" &&
    siblings[1]?.type.isError === true &&
    siblings[1]?.from === node.from &&
    siblings[1]?.to === node.to &&
    node.prevSibling?.name === "default"
  );
}

function hasSyntaxError(node: JavaSyntaxNode): boolean {
  return (
    (node.type.isError && !isLegacyGrammarDefaultModifierMarker(node)) ||
    directChildren(node).some((child) => hasSyntaxError(child))
  );
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

function staticSpringPathsFromValue(
  input: JavaExtractFileFactsInput,
  value: JavaSyntaxNode
): readonly string[] | null {
  const literals =
    value.name === "ElementValueArrayInitializer"
      ? directChildren(value).filter((child) => !["{", "}", ","].includes(child.name))
      : [value];
  if (literals.length === 0) {
    return null;
  }
  const paths = literals.map((literal) => staticPlainJavaString(input, literal));
  if (paths.some((path): path is null => path === null)) {
    return null;
  }
  const exactPaths = paths as readonly string[];
  const canonicalPaths = exactPaths.map((path) => {
    if (path.length === 0) {
      return "";
    }
    return path.startsWith("/") && !path.includes("//") ? joinHttpPaths(path, "") : null;
  });
  if (canonicalPaths.some((path): path is null => path === null)) {
    return null;
  }
  const exactCanonicalPaths = canonicalPaths as readonly string[];
  return new Set(exactCanonicalPaths).size === exactCanonicalPaths.length
    ? exactCanonicalPaths
    : null;
}

/**
 * Accepts one literal class-level Spring path or a non-empty, unique literal
 * array. Request conditions and dynamic values are deliberately excluded so a
 * class prefix never turns a local method route into a plausible false positive.
 */
function staticSpringClassPaths(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation
): readonly string[] | null {
  if (annotation.node.name === "MarkerAnnotation") {
    return [""];
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
    return [""];
  }
  if (values.length !== 1 || values[0] === undefined) {
    return null;
  }
  const value = values[0];
  if (value.name === "StringLiteral" || value.name === "ElementValueArrayInitializer") {
    return staticSpringPathsFromValue(input, value);
  }
  if (value.name !== "ElementValuePair") {
    return null;
  }
  const pair = directChildren(value);
  const key = pair[0] === undefined ? null : identifierText(input, pair[0]);
  const argument = pair[2];
  if (
    pair.length !== 3 ||
    pair[1]?.name !== "AssignOp" ||
    (key !== "path" && key !== "value") ||
    argument === undefined
  ) {
    return null;
  }
  return staticSpringPathsFromValue(input, argument);
}

function staticSpringRequestMethod(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode,
  imports: ReadonlyMap<string, string>
): RouteMethod | null {
  const match = /^([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\.([A-Z]+)$/u.exec(
    nodeText(input, node)
  );
  const owner = match?.[1];
  const methodName = match?.[2];
  const method = methodName === undefined ? undefined : SPRING_REQUEST_METHODS[methodName];
  if (
    owner === undefined ||
    method === undefined ||
    (owner !== SPRING_REQUEST_METHOD_PATH &&
      (owner !== "RequestMethod" || imports.get(owner) !== SPRING_REQUEST_METHOD_PATH))
  ) {
    return null;
  }
  return method;
}

function staticSpringRequestMethods(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode,
  imports: ReadonlyMap<string, string>
): readonly RouteMethod[] | null {
  const values =
    node.name === "ElementValueArrayInitializer"
      ? directChildren(node).filter((child) => !["{", "}", ","].includes(child.name))
      : [node];
  if (values.length === 0) {
    return null;
  }
  const methods = values.map((value) => staticSpringRequestMethod(input, value, imports));
  if (methods.some((method): method is null => method === null)) {
    return null;
  }
  const exactMethods = methods as readonly RouteMethod[];
  return new Set(exactMethods).size === exactMethods.length ? exactMethods : null;
}

/**
 * Retains direct method-level Spring `@RequestMapping` routes when one or more
 * RequestMethod enum values are provable. Each exact enum produces one route.
 * The optional route path is one positional, `path =`, or `value =` literal;
 * all other request conditions remain deliberately outside this static slice.
 */
function staticSpringRequestMappingRoutes(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation,
  imports: ReadonlyMap<string, string>
): readonly StaticHttpRoute[] | null {
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
  if (values.length === 0 || values.length > 2) {
    return null;
  }
  let path = "";
  let hasPath = false;
  let methods: readonly RouteMethod[] | null = null;
  for (const value of values) {
    if (value.name === "StringLiteral") {
      if (hasPath) {
        return null;
      }
      const literal = staticPlainJavaString(input, value);
      if (literal === null) {
        return null;
      }
      path = literal;
      hasPath = true;
      continue;
    }
    if (value.name !== "ElementValuePair") {
      return null;
    }
    const pair = directChildren(value);
    const key = pair[0] === undefined ? null : identifierText(input, pair[0]);
    const argument = pair[2];
    if (pair.length !== 3 || pair[1]?.name !== "AssignOp" || argument === undefined) {
      return null;
    }
    if (key === "path" || key === "value") {
      if (hasPath) {
        return null;
      }
      const literal = staticPlainJavaString(input, argument);
      if (literal === null) {
        return null;
      }
      path = literal;
      hasPath = true;
      continue;
    }
    if (key !== "method" || methods !== null) {
      return null;
    }
    methods = staticSpringRequestMethods(input, argument, imports);
    if (methods === null) {
      return null;
    }
  }
  return methods !== null && (path.length === 0 || (path.startsWith("/") && !path.includes("//")))
    ? methods.map((method) => ({
        method,
        path,
        node: annotation.node,
        ruleId: "framework.spring-web.direct-controller.literal-request-mapping.local-method"
      }))
    : null;
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

/**
 * React Native Android bridge ownership is retained only for the direct base
 * class spelling or a simple spelling backed by one exact non-wildcard import.
 */
function staticJavaDirectReactNativeModule(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): boolean {
  const header = input.sourceText.slice(declaration.node.from, declaration.body.from);
  if (
    /\bextends\s+com\.facebook\.react\.bridge\.ReactContextBaseJavaModule\b/u.test(header)
  ) {
    return true;
  }
  return (
    imports.get("ReactContextBaseJavaModule") === REACT_NATIVE_CONTEXT_BASE_MODULE_PATH &&
    /\bextends\s+ReactContextBaseJavaModule\b/u.test(header)
  );
}

/**
 * Recognizes the documented Codegen implementation shape only when the direct
 * superclass is a concrete Spec type whose simple spelling has one exact import
 * or whose fully-qualified spelling appears in the source header.
 */
function staticJavaCodegenReactNativeModule(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): boolean {
  const header = input.sourceText.slice(declaration.node.from, declaration.body.from);
  const match =
    /\bextends\s+((?:[A-Za-z_$][A-Za-z0-9_$]*\.)*([A-Za-z_$][A-Za-z0-9_$]*Spec))\b/u.exec(
      header
    );
  if (match?.[1] === undefined || match[2] === undefined) {
    return false;
  }
  return match[1].includes(".") || imports.get(match[2]) !== undefined;
}

function staticJavaReactNativeModuleKind(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): StaticJavaReactNativeModuleKind | null {
  if (staticJavaDirectReactNativeModule(input, declaration, imports)) {
    return "direct";
  }
  return staticJavaCodegenReactNativeModule(input, declaration, imports) ? "codegen-spec" : null;
}

/**
 * Reads one direct class-local `static final String` constant. This deliberately
 * excludes expressions, non-final fields, inherited values, and multi-variable
 * declarations so an Android bridge identity remains syntax-proven.
 */
function staticJavaLiteralStringConstant(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  name: string
): string | null {
  const values: string[] = [];
  for (const field of directChildren(declaration.body)) {
    if (field.name !== "FieldDeclaration") {
      continue;
    }
    const match = /^((?:(?:public|protected|private|static|final)\s+)*)String\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*"([^"\\\r\n]*)"\s*;$/u.exec(
      nodeText(input, field).trim()
    );
    const modifiers = new Set((match?.[1] ?? "").trim().split(/\s+/u).filter(Boolean));
    if (
      match?.[2] !== name ||
      match[3] === undefined ||
      !modifiers.has("static") ||
      !modifiers.has("final")
    ) {
      continue;
    }
    values.push(match[3]);
  }
  return values.length === 1 && values[0] !== undefined ? values[0] : null;
}

/** Retains one literal Android bridge module name from a direct getName body or class constant. */
function staticJavaReactNativeModule(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  methods: readonly StaticJavaMethod[],
  imports: ReadonlyMap<string, string>
): StaticJavaReactNativeModule | null {
  const kind = staticJavaReactNativeModuleKind(input, declaration, imports);
  if (kind === null) {
    return null;
  }
  const getNameMethods = methods.filter((method) => method.name === "getName");
  if (getNameMethods.length !== 1 || getNameMethods[0] === undefined) {
    return null;
  }
  const bodyNode = getNameMethods[0].body;
  if (bodyNode === null) {
    return null;
  }
  const body = nodeText(input, bodyNode);
  const literal = /^\{\s*return\s+"([^"\\\r\n]*)"\s*;\s*\}$/u.exec(body)?.[1] ?? null;
  const constantName = /^\{\s*return\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;\s*\}$/u.exec(body)?.[1] ?? null;
  const moduleName = literal ??
    (constantName === null
      ? null
      : staticJavaLiteralStringConstant(input, declaration, constantName));
  return moduleName !== null && REACT_NATIVE_BRIDGE_IDENTIFIER.test(moduleName)
    ? { moduleName, kind }
    : null;
}

/** A direct ReactMethod annotation needs exact import or fully-qualified proof. */
function isJavaDirectReactNativeMethod(
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): boolean {
  const annotationsNamedReactMethod = declaration.annotations.filter(
    (annotation) => annotation.name === "ReactMethod" || annotation.name === REACT_NATIVE_REACT_METHOD_PATH
  );
  const reactMethods = annotationsNamedReactMethod.filter((annotation) =>
    annotationMatches(annotation, REACT_NATIVE_REACT_METHOD_PATH, imports)
  );
  return (
    annotationsNamedReactMethod.length === reactMethods.length &&
    reactMethods.length === 1
  );
}

/** Codegen methods are direct Java overrides; the resolver later proves their TypeScript contract. */
function isJavaCodegenReactNativeMethod(
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): boolean {
  if (declaration.name === "getName") {
    return false;
  }
  const overrideAnnotations = declaration.annotations.filter(
    (annotation) => annotation.name === "Override" || annotation.name === "java.lang.Override"
  );
  const exactOverrides = overrideAnnotations.filter(
    (annotation) =>
      annotation.name === "java.lang.Override" ||
      (annotation.name === "Override" &&
        (imports.get("Override") === undefined || imports.get("Override") === "java.lang.Override"))
  );
  return overrideAnnotations.length === exactOverrides.length && exactOverrides.length === 1;
}

function isJavaReactNativeMethod(
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>,
  kind: StaticJavaReactNativeModuleKind
): boolean {
  return kind === "direct"
    ? isJavaDirectReactNativeMethod(declaration, imports)
    : isJavaCodegenReactNativeMethod(declaration, imports);
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
  if (nameNode === undefined || name === null || body === undefined) {
    return null;
  }
  const modifiers = children.find((child) => child.name === "Modifiers");
  return {
    kind: "class",
    name,
    node,
    body,
    annotations: staticAnnotations(input, node),
    isExported: modifiers !== undefined && directChildren(modifiers).some((child) => child.name === "public")
  };
}

function staticJavaInterface(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaInterface | null {
  if (node.name !== "InterfaceDeclaration") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.name === "Definition");
  const body = children.find((child) => child.name === "InterfaceBody");
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  if (nameNode === undefined || name === null || body === undefined) {
    return null;
  }
  const modifiers = children.find((child) => child.name === "Modifiers");
  return {
    kind: "interface",
    name,
    node,
    body,
    isExported: modifiers !== undefined && directChildren(modifiers).some((child) => child.name === "public")
  };
}

function staticJavaType(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaType | null {
  return staticJavaClass(input, node) ?? staticJavaInterface(input, node);
}

/**
 * Retains one direct, non-generic Java parent type spelling. A dotted spelling
 * with a conventional lower-case package prefix remains an exact project-local
 * candidate only when it names one indexed top-level type; no compiler
 * classpath or nested-type inference is assumed.
 */
function staticJavaQualifiedTopLevelTypePath(typePath: string): string | null {
  const segments = typePath.split(".");
  return segments.length > 1 &&
    segments.slice(0, -1).every((segment) => /^[a-z_$][A-Za-z0-9_$]*$/u.test(segment))
    ? typePath
    : null;
}

function staticJavaDirectTypeReference(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaSuperclassReference | null {
  const typePath = staticDottedIdentifier(input, node);
  if (typePath === null) {
    return null;
  }
  const name = typePath.split(".").at(-1);
  if (name === undefined) {
    return null;
  }
  let qualifiedTypePath: string | undefined;
  if (typePath.includes(".")) {
    const candidate = staticJavaQualifiedTopLevelTypePath(typePath);
    if (candidate === null) {
      return null;
    }
    qualifiedTypePath = candidate;
  }
  return {
    name,
    node,
    ...(qualifiedTypePath === undefined ? {} : { qualifiedTypePath })
  };
}

function isJavaDirectTypeName(node: JavaSyntaxNode): boolean {
  return node.name === "TypeName" || node.name === "ScopedTypeName";
}

function staticJavaDirectSuperclass(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass
): StaticJavaSuperclassReference | null {
  const superclasses = directChildren(declaration.node).filter((child) => child.name === "Superclass");
  if (superclasses.length !== 1 || superclasses[0] === undefined) {
    return null;
  }
  const typeNames = directChildren(superclasses[0]).filter(isJavaDirectTypeName);
  if (typeNames.length !== 1 || typeNames[0] === undefined) {
    return null;
  }
  return staticJavaDirectTypeReference(input, typeNames[0]);
}

/**
 * Retains direct, non-generic Java interface spellings. The relationship kind
 * is passed explicitly because classes use `implements`, while interfaces use
 * `extends` for their direct contracts.
 */
function staticJavaDirectInterfaceReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass | StaticJavaInterface,
  headerName: "SuperInterfaces" | "ExtendsInterfaces"
): readonly StaticJavaSuperclassReference[] {
  const headers = directChildren(declaration.node).filter((child) => child.name === headerName);
  if (headers.length !== 1 || headers[0] === undefined) {
    return [];
  }
  const typeLists = directChildren(headers[0]).filter((child) => child.name === "InterfaceTypeList");
  if (typeLists.length !== 1 || typeLists[0] === undefined) {
    return [];
  }
  const references: StaticJavaSuperclassReference[] = [];
  for (const typeName of directChildren(typeLists[0]).filter(isJavaDirectTypeName)) {
    const reference = staticJavaDirectTypeReference(input, typeName);
    if (reference !== null) {
      references.push(reference);
    }
  }
  return references;
}

/** Java's standard override declaration is a marker annotation. */
function hasJavaOverrideAnnotation(declaration: StaticJavaMethod): boolean {
  return (
    declaration.annotations.filter(
      (annotation) =>
        annotation.node.name === "MarkerAnnotation" &&
        (annotation.name === "Override" || annotation.name === "java.lang.Override")
    ).length === 1
  );
}

function staticJavaVisibility(
  modifiers: JavaSyntaxNode | undefined,
  implicitPublic: boolean
): "public" | "protected" | "package" | "private" {
  const names = new Set(
    (modifiers === undefined ? [] : directChildren(modifiers)).map((child) => child.name)
  );
  if (names.has("public")) return "public";
  if (names.has("protected")) return "protected";
  if (names.has("private")) return "private";
  return implicitPublic ? "public" : "package";
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
  const body = children.find((child) => child.name === "Block") ?? null;
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  if (nameNode === undefined || name === null) {
    return null;
  }
  const modifiers = children.find((child) => child.name === "Modifiers");
  const visibility = staticJavaVisibility(modifiers, node.parent?.name === "InterfaceBody");
  return {
    name,
    nameNode,
    node,
    body,
    annotations: staticAnnotations(input, node),
    isStatic: modifiers !== undefined && directChildren(modifiers).some((child) => child.name === "static"),
    visibility,
    isExported: visibility === "public"
  };
}

function staticJavaConstructor(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaConstructor | null {
  if (node.name !== "ConstructorDeclaration") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.name === "Definition");
  const body = children.find((child) => child.name === "ConstructorBody");
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  if (nameNode === undefined || body === undefined || name === null) {
    return null;
  }
  const modifiers = children.find((child) => child.name === "Modifiers");
  const visibility = staticJavaVisibility(modifiers, false);
  return {
    name,
    nameNode,
    node,
    body,
    annotations: staticAnnotations(input, node),
    visibility,
    isExported: visibility === "public"
  };
}

const JAVA_VALUE_DECLARATION_CONTAINERS = new Set([
  "VariableDeclarator",
  "FormalParameter",
  "CatchFormalParameter",
  "LambdaParameter"
]);

const NESTED_JAVA_CALLABLE_SCOPES = new Set([
  "ClassDeclaration",
  "InterfaceDeclaration",
  "EnumDeclaration",
  "RecordDeclaration",
  "MethodDeclaration",
  "ConstructorDeclaration",
  "LambdaExpression"
]);

function staticJavaValueDeclarationNames(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): ReadonlySet<string> {
  const names = new Set<string>();

  function collectDefinitions(container: JavaSyntaxNode): void {
    if (container.name === "Definition") {
      const name = identifierText(input, container);
      if (name !== null) {
        names.add(name);
      }
      return;
    }
    for (const child of directChildren(container)) {
      collectDefinitions(child);
    }
  }

  function visit(candidate: JavaSyntaxNode): void {
    if (JAVA_VALUE_DECLARATION_CONTAINERS.has(candidate.name)) {
      collectDefinitions(candidate);
      return;
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  }

  visit(node);
  return names;
}

function staticJavaCallableArity(
  declaration: StaticJavaMethod | StaticJavaConstructor
): { readonly minimumArgumentCount: number; readonly maximumArgumentCount: number | null } | null {
  const parameterLists = directChildren(declaration.node).filter(
    (child) => child.name === "FormalParameters"
  );
  if (parameterLists.length !== 1 || parameterLists[0] === undefined) {
    return null;
  }
  const parameters = directChildren(parameterLists[0]).filter(
    (child) => child.name === "FormalParameter" || child.name === "SpreadParameter"
  );
  const spreadIndexes = parameters.flatMap((parameter, index) =>
    parameter.name === "SpreadParameter" ? [index] : []
  );
  if (
    spreadIndexes.length > 1 ||
    (spreadIndexes.length === 1 && spreadIndexes[0] !== parameters.length - 1)
  ) {
    return null;
  }
  const hasVarargs = spreadIndexes.length === 1;
  return {
    minimumArgumentCount: parameters.length - (hasVarargs ? 1 : 0),
    maximumArgumentCount: hasVarargs ? null : parameters.length
  };
}

function staticJavaCallTypeReference(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode,
  imports: ReadonlyMap<string, string>,
  syntax: JavaCallTypeReferenceFact["syntax"]
): JavaCallTypeReferenceFact | null {
  if (node.name === "PrimitiveType") {
    const referenceName = nodeText(input, node);
    return /^(?:boolean|byte|char|double|float|int|long|short)$/u.test(referenceName)
      ? {
          kind: "primitive",
          referenceName,
          syntax,
          range: rangeFor(lineStartsFor(input.sourceText), node.from, node.to)
        }
      : null;
  }
  if (!isJavaDirectTypeName(node)) {
    return null;
  }
  const reference = staticJavaDirectTypeReference(input, node);
  if (reference === null) {
    return null;
  }
  const importedTypePath =
    reference.qualifiedTypePath === undefined ? imports.get(reference.name) : undefined;
  return {
    kind: "reference",
    referenceName: reference.name,
    syntax,
    range: rangeFor(lineStartsFor(input.sourceText), node.from, node.to),
    ...(importedTypePath === undefined ? {} : { importedTypePath }),
    ...(reference.qualifiedTypePath === undefined
      ? {}
      : { qualifiedTypePath: reference.qualifiedTypePath })
  };
}

function staticJavaCallableParameterTypes(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaMethod | StaticJavaConstructor,
  imports: ReadonlyMap<string, string>
): readonly (JavaCallTypeReferenceFact | null)[] | null {
  const parameterLists = directChildren(declaration.node).filter(
    (child) => child.name === "FormalParameters"
  );
  if (parameterLists.length !== 1 || parameterLists[0] === undefined) {
    return null;
  }
  return directChildren(parameterLists[0])
    .filter((child) => child.name === "FormalParameter" || child.name === "SpreadParameter")
    .map((parameter) => {
      const typeNodes = directChildren(parameter).filter(
        (child) => child.name === "PrimitiveType" || isJavaDirectTypeName(child)
      );
      return typeNodes.length === 1 && typeNodes[0] !== undefined
        ? staticJavaCallTypeReference(input, typeNodes[0], imports, "declaration")
        : null;
    });
}

function staticJavaArguments(invocation: JavaSyntaxNode): readonly JavaSyntaxNode[] | null {
  const argumentLists = directChildren(invocation).filter((child) => child.name === "ArgumentList");
  if (argumentLists.length !== 1 || argumentLists[0] === undefined) {
    return null;
  }
  return directChildren(argumentLists[0]).filter(
    (child) => child.name !== "(" && child.name !== ")" && child.name !== ","
  );
}

function staticJavaPrimitiveLiteralType(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): string | null {
  if (node.name === "BooleanLiteral") {
    return "boolean";
  }
  if (node.name === "CharacterLiteral") {
    return "char";
  }
  const literal = nodeText(input, node).replace(/_/gu, "");
  if (node.name === "IntegerLiteral" && /^[0-9]+[lL]?$/u.test(literal)) {
    const isLong = /[lL]$/u.test(literal);
    const digits = isLong ? literal.slice(0, -1) : literal;
    try {
      const value = BigInt(digits);
      if (isLong) {
        return value <= 9_223_372_036_854_775_807n ? "long" : null;
      }
      if (value <= 2_147_483_647n) {
        return "int";
      }
      return value <= 9_223_372_036_854_775_807n ? "long" : null;
    } catch {
      return null;
    }
  }
  if (node.name === "FloatingPointLiteral" && !/^0[xX]/u.test(literal)) {
    return /[fF]$/u.test(literal) ? "float" : "double";
  }
  return null;
}

function staticJavaArgumentType(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode,
  imports: ReadonlyMap<string, string>
): JavaCallTypeReferenceFact | null {
  if (node.name === "CastExpression") {
    const primitiveTypes = directChildren(node).filter((child) => child.name === "PrimitiveType");
    if (primitiveTypes.length === 1 && primitiveTypes[0] !== undefined) {
      const castType = staticJavaCallTypeReference(
        input,
        primitiveTypes[0],
        imports,
        "primitive-cast"
      );
      return castType === null
        ? null
        : {
            ...castType,
            range: rangeFor(lineStartsFor(input.sourceText), node.from, node.to)
          };
    }
  }
  const primitive = staticJavaPrimitiveLiteralType(input, node);
  if (primitive !== null) {
    return {
      kind: "primitive",
      referenceName: primitive,
      syntax: "primitive-literal",
      range: rangeFor(lineStartsFor(input.sourceText), node.from, node.to)
    };
  }
  if (node.name === "StringLiteral") {
    return {
      kind: "reference",
      referenceName: "String",
      syntax: "string-literal",
      range: rangeFor(lineStartsFor(input.sourceText), node.from, node.to),
      qualifiedTypePath: "java.lang.String"
    };
  }
  if (node.name !== "ObjectCreationExpression") {
    return null;
  }
  const typeNodes = directChildren(node).filter(isJavaDirectTypeName);
  return typeNodes.length === 1 && typeNodes[0] !== undefined
    ? staticJavaCallTypeReference(input, typeNodes[0], imports, "object-creation")
    : null;
}

function staticJavaChainedCallReferences(input: {
  readonly extraction: JavaExtractFileFactsInput;
  readonly callable: StaticJavaMethod | StaticJavaConstructor;
  readonly callableSymbol: SymbolNode;
  readonly declaringType: SymbolNode;
  readonly imports: ReadonlyMap<string, string>;
  readonly shadowedValueNames: ReadonlySet<string>;
}): readonly JavaChainedCallReferenceFact[] {
  if (input.callable.body === null) {
    return [];
  }
  const lineStarts = lineStartsFor(input.extraction.sourceText);
  const references: JavaChainedCallReferenceFact[] = [];

  function visit(node: JavaSyntaxNode): void {
    if (node.name === "MethodInvocation") {
      const children = directChildren(node);
      const inner = children.find((child) => child.name === "MethodInvocation");
      const methodNode = children.find((child) => child.name === "MethodName");
      if (inner !== undefined && methodNode !== undefined) {
        const innerChildren = directChildren(inner);
        const nestedInner = innerChildren.some((child) => child.name === "MethodInvocation");
        const factoryMethodNode = innerChildren.find((child) => child.name === "MethodName");
        const methodName = identifierText(input.extraction, methodNode);
        const factoryMethodName =
          factoryMethodNode === undefined ? null : identifierText(input.extraction, factoryMethodNode);
        const factoryArguments = staticJavaArguments(inner);
        const methodArguments = staticJavaArguments(node);
        const factoryArgumentCount = factoryArguments?.length ?? null;
        const methodArgumentCount = methodArguments?.length ?? null;
        const receiverPrefix =
          factoryMethodNode === undefined
            ? ""
            : input.extraction.sourceText.slice(inner.from, factoryMethodNode.from);
        const receiverMatch = receiverPrefix.match(
          /^\s*([A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)*)\s*\.\s*$/u
        );
        const receiverPath = receiverMatch?.[1]?.replace(/\s+/gu, "");
        const receiverSegments = receiverPath?.split(".") ?? [];
        const receiverTypeName = receiverSegments.at(-1);
        if (
          !nestedInner &&
          methodName !== null &&
          factoryMethodNode !== undefined &&
          factoryMethodName !== null &&
          factoryArguments !== null &&
          methodArguments !== null &&
          factoryArgumentCount !== null &&
          methodArgumentCount !== null &&
          receiverPath !== undefined &&
          receiverTypeName !== undefined &&
          receiverSegments.length > 0 &&
          !input.shadowedValueNames.has(receiverSegments[0]!)
        ) {
          const importedTypePath =
            receiverSegments.length === 1 ? input.imports.get(receiverTypeName) : undefined;
          references.push({
            sourceId: input.callableSymbol.id,
            declaringTypeId: input.declaringType.id,
            filePath: input.extraction.filePath,
            receiverTypeName,
            factoryMethodName,
            methodName,
            factoryArgumentCount,
            methodArgumentCount,
            factoryArgumentTypes: factoryArguments.map((argument) =>
              staticJavaArgumentType(input.extraction, argument, input.imports)
            ),
            methodArgumentTypes: methodArguments.map((argument) =>
              staticJavaArgumentType(input.extraction, argument, input.imports)
            ),
            factoryRange: rangeFor(
              lineStarts,
              factoryMethodNode.from,
              factoryMethodNode.to
            ),
            range: rangeFor(lineStarts, methodNode.from, methodNode.to),
            ...(receiverSegments.length > 1
              ? { qualifiedTypePath: receiverPath }
              : importedTypePath === undefined
                ? {}
                : { importedTypePath })
          });
        }
      }
    }
    for (const child of directChildren(node)) {
      visit(child);
    }
  }

  visit(input.callable.body);
  return references;
}

function staticJavaMemberCallReferences(input: {
  readonly extraction: JavaExtractFileFactsInput;
  readonly callable: StaticJavaMethod | StaticJavaConstructor;
  readonly callableSymbol: SymbolNode;
  readonly declaringType: SymbolNode;
  readonly imports: ReadonlyMap<string, string>;
}): readonly JavaMemberCallReferenceFact[] {
  const body = input.callable.body;
  if (body === null) {
    return [];
  }
  const lineStarts = lineStartsFor(input.extraction.sourceText);
  const references: JavaMemberCallReferenceFact[] = [];

  interface ReceiverBinding {
    readonly kind: "parameter" | "local";
    readonly name: string;
    readonly type: JavaCallTypeReferenceFact;
    readonly declarationRange: SourceRange;
    readonly scopeRange: SourceRange;
  }

  type BindingScope = Map<string, ReceiverBinding | null>;
  const bodyRange = rangeFor(lineStarts, body.from, body.to);
  const parameterScope: BindingScope = new Map();
  const parameterLists = directChildren(input.callable.node).filter(
    (child) => child.name === "FormalParameters"
  );
  if (parameterLists.length === 1 && parameterLists[0] !== undefined) {
    for (const parameter of directChildren(parameterLists[0]).filter(
      (child) => child.name === "FormalParameter"
    )) {
      const typeNodes = directChildren(parameter).filter(
        (child) => child.name === "PrimitiveType" || isJavaDirectTypeName(child)
      );
      const definitions = directChildren(parameter).filter((child) => child.name === "Definition");
      const definition = definitions[0];
      const name = definition === undefined ? null : identifierText(input.extraction, definition);
      const type =
        typeNodes.length === 1 && typeNodes[0] !== undefined
          ? staticJavaCallTypeReference(input.extraction, typeNodes[0], input.imports, "declaration")
          : null;
      if (definitions.length !== 1 || definition === undefined || name === null || type === null) {
        continue;
      }
      const binding: ReceiverBinding = {
        kind: "parameter",
        name,
        type,
        declarationRange: rangeFor(lineStarts, definition.from, definition.to),
        scopeRange: bodyRange
      };
      parameterScope.set(name, parameterScope.has(name) ? null : binding);
    }
  }
  const scopes: BindingScope[] = [parameterScope];

  function visibleBinding(name: string): ReceiverBinding | null {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const scope = scopes[index]!;
      if (scope.has(name)) {
        return scope.get(name) ?? null;
      }
    }
    return null;
  }

  function addLocalDeclaration(
    declaration: JavaSyntaxNode,
    scope: BindingScope,
    scopeRange: SourceRange
  ): void {
    const typeNodes = directChildren(declaration).filter(
      (child) => child.name === "PrimitiveType" || isJavaDirectTypeName(child)
    );
    const type =
      typeNodes.length === 1 && typeNodes[0] !== undefined
        ? staticJavaCallTypeReference(input.extraction, typeNodes[0], input.imports, "declaration")
        : null;
    for (const child of directChildren(declaration)) {
      if (child.name !== "VariableDeclarator") {
        visit(child);
        continue;
      }
      // The binding is not visible in its own initializer, but becomes visible
      // to later declarators and statements in the same lexical block.
      visit(child);
      const definitions = directChildren(child).filter((candidate) => candidate.name === "Definition");
      const definition = definitions[0];
      const name = definition === undefined ? null : identifierText(input.extraction, definition);
      if (
        type === null ||
        definitions.length !== 1 ||
        definition === undefined ||
        name === null
      ) {
        continue;
      }
      const binding: ReceiverBinding = {
        kind: "local",
        name,
        type,
        declarationRange: rangeFor(lineStarts, definition.from, definition.to),
        scopeRange
      };
      scope.set(name, scope.has(name) ? null : binding);
    }
  }

  function visit(node: JavaSyntaxNode): void {
    if (node !== body && NESTED_JAVA_CALLABLE_SCOPES.has(node.name)) {
      return;
    }
    if (node.name === "Block" || node.name === "ConstructorBody") {
      const scope: BindingScope = new Map();
      const scopeRange = rangeFor(lineStarts, node.from, node.to);
      scopes.push(scope);
      for (const child of directChildren(node)) {
        if (child.name === "LocalVariableDeclaration") {
          addLocalDeclaration(child, scope, scopeRange);
        } else {
          visit(child);
        }
      }
      scopes.pop();
      return;
    }
    if (node.name === "MethodInvocation") {
      const methodNode = directChildren(node).find((child) => child.name === "MethodName");
      if (methodNode !== undefined) {
        const receiverPrefix = input.extraction.sourceText.slice(node.from, methodNode.from);
        const qualifier = receiverPrefix.match(/^\s*(this|super)\s*\.\s*$/u)?.[1] as
          | "this"
          | "super"
          | undefined;
        const receiverName = receiverPrefix.match(
          /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*$/u
        )?.[1];
        const methodName = identifierText(input.extraction, methodNode);
        const arguments_ = staticJavaArguments(node);
        if (qualifier !== undefined && methodName !== null && arguments_ !== null) {
          references.push({
            sourceId: input.callableSymbol.id,
            declaringTypeId: input.declaringType.id,
            filePath: input.extraction.filePath,
            receiverKind: qualifier,
            methodName,
            argumentCount: arguments_.length,
            argumentTypes: arguments_.map((argument) =>
              staticJavaArgumentType(input.extraction, argument, input.imports)
            ),
            range: rangeFor(lineStarts, methodNode.from, methodNode.to)
          });
        } else if (receiverName !== undefined && methodName !== null && arguments_ !== null) {
          const binding = visibleBinding(receiverName);
          if (binding !== null) {
            references.push({
              sourceId: input.callableSymbol.id,
              declaringTypeId: input.declaringType.id,
              filePath: input.extraction.filePath,
              receiverKind: binding.kind,
              receiverName,
              receiverType: binding.type,
              receiverBindingRange: binding.declarationRange,
              receiverScopeRange: binding.scopeRange,
              methodName,
              argumentCount: arguments_.length,
              argumentTypes: arguments_.map((argument) =>
                staticJavaArgumentType(input.extraction, argument, input.imports)
              ),
              range: rangeFor(lineStarts, methodNode.from, methodNode.to)
            });
          }
        }
      }
    }
    for (const child of directChildren(node)) {
      visit(child);
    }
  }

  visit(body);
  return references;
}

function staticJavaTypeParameterNames(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const parameters of directChildren(node).filter((child) => child.name === "TypeParameters")) {
    for (const parameter of directChildren(parameters).filter((child) => child.name === "TypeParameter")) {
      const definition = directChildren(parameter).find((child) => child.name === "Definition");
      const name = definition === undefined ? null : identifierText(input, definition);
      if (name !== null) {
        names.add(name);
      }
    }
  }
  return names;
}

function staticJavaSignatureTypeReferences(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode,
  excludedNames: ReadonlySet<string>,
  isTopLevelType: boolean = true
): readonly (StaticJavaSuperclassReference & { readonly isTopLevelType: boolean })[] {
  if (node.name === "TypeName" || node.name === "ScopedTypeName") {
    const reference = staticJavaDirectTypeReference(input, node);
    return reference === null || excludedNames.has(reference.name)
      ? []
      : [{ ...reference, isTopLevelType }];
  }
  if (node.name === "GenericType") {
    return directChildren(node).flatMap((child) =>
      staticJavaSignatureTypeReferences(
        input,
        child,
        excludedNames,
        child.name === "TypeArguments" ? false : isTopLevelType
      )
    );
  }
  return directChildren(node).flatMap((child) =>
    staticJavaSignatureTypeReferences(input, child, excludedNames, false)
  );
}

function staticJavaCallableSignatureReferences(input: {
  readonly extraction: JavaExtractFileFactsInput;
  readonly callable: StaticJavaMethod | StaticJavaConstructor;
  readonly callableSymbol: SymbolNode;
  readonly declaringType: SymbolNode;
  readonly enclosingTypeParameters: ReadonlySet<string>;
  readonly imports: ReadonlyMap<string, string>;
}): readonly JvmCallableSignatureReferenceFact[] {
  const excludedNames = new Set([
    ...input.enclosingTypeParameters,
    ...staticJavaTypeParameterNames(input.extraction, input.callable.node)
  ]);
  const facts: JvmCallableSignatureReferenceFact[] = [];
  const addReferences = (
    relationKind: "accepts" | "returns",
    node: JavaSyntaxNode
  ): void => {
    for (const reference of staticJavaSignatureTypeReferences(input.extraction, node, excludedNames)) {
      const importedTypePath =
        reference.qualifiedTypePath === undefined
          ? input.imports.get(reference.name)
          : undefined;
      facts.push({
        sourceId: input.callableSymbol.id,
        declaringTypeId: input.declaringType.id,
        filePath: input.extraction.filePath,
        referenceName: reference.name,
        relationKind,
        isTopLevelType: relationKind === "returns" && reference.isTopLevelType,
        range: rangeFor(lineStartsFor(input.extraction.sourceText), reference.node.from, reference.node.to),
        ...(importedTypePath === undefined ? {} : { importedTypePath }),
        ...(reference.qualifiedTypePath === undefined
          ? {}
          : { qualifiedTypePath: reference.qualifiedTypePath })
      });
    }
  };
  const children = directChildren(input.callable.node);
  if (input.callable.node.name === "MethodDeclaration") {
    const definitionIndex = children.findIndex(
      (child) =>
        child.name === input.callable.nameNode.name &&
        child.from === input.callable.nameNode.from &&
        child.to === input.callable.nameNode.to
    );
    for (const child of children.slice(0, Math.max(0, definitionIndex))) {
      if (child.name !== "Modifiers" && child.name !== "TypeParameters") {
        addReferences("returns", child);
      }
    }
  }
  const parameters = children.filter((child) => child.name === "FormalParameters");
  if (parameters.length === 1 && parameters[0] !== undefined) {
    for (const parameter of directChildren(parameters[0]).filter(
      (child) => child.name === "FormalParameter" || child.name === "SpreadParameter"
    )) {
      addReferences("accepts", parameter);
    }
  }
  return facts;
}

/**
 * A direct injection annotation is retained only when its source spelling is
 * fully qualified or a unique direct import proves one of the supported JVM
 * DI APIs. Multiple or unproven DI annotations fail closed.
 */
function staticJavaDependencyInjectionSyntax(
  annotations: readonly StaticJavaAnnotation[],
  imports: ReadonlyMap<string, string>,
  member: "constructor" | "field" | "method"
): JvmDependencyInjectionReferenceFact["syntax"] | null {
  const annotationsNamedDependencyInjection = annotations.filter((annotation) =>
    [...JAVA_DEPENDENCY_INJECTION_ANNOTATIONS, ...JAVA_RESOURCE_INJECTION_ANNOTATIONS].some(
      (candidate) => {
      const simpleName = candidate.path.split(".").at(-1);
      return annotation.name === candidate.path || annotation.name === simpleName;
      }
    )
  );
  const provenAnnotations = annotationsNamedDependencyInjection.flatMap((annotation) =>
    JAVA_DEPENDENCY_INJECTION_ANNOTATIONS.flatMap((candidate) =>
      annotationMatches(annotation, candidate.path, imports)
        ? [
            member === "constructor"
              ? candidate.constructorSyntax
              : member === "field"
                ? candidate.fieldSyntax
                : candidate.methodSyntax
          ]
        : []
    )
  );
  return annotationsNamedDependencyInjection.length === provenAnnotations.length &&
    provenAnnotations.length === 1
    ? provenAnnotations[0] ?? null
    : null;
}

/**
 * `@Resource` derives its requested type from the field or JavaBeans setter
 * only when its arguments are absent. Explicit name, lookup, and type values
 * change the resource contract, so they remain outside this static type rule.
 */
function staticJavaBareResourceAnnotation(annotation: StaticJavaAnnotation): boolean {
  if (annotation.node.name === "MarkerAnnotation") {
    return true;
  }
  if (annotation.node.name !== "Annotation") {
    return false;
  }
  const argumentLists = directChildren(annotation.node).filter(
    (child) => child.name === "AnnotationArgumentList"
  );
  return (
    argumentLists.length === 1 &&
    argumentLists[0] !== undefined &&
    directChildren(argumentLists[0]).every((child) => child.name === "(" || child.name === ")")
  );
}

function staticJavaResourceInjectionSyntax(
  annotations: readonly StaticJavaAnnotation[],
  imports: ReadonlyMap<string, string>,
  member: "field" | "setter"
): JvmDependencyInjectionReferenceFact["syntax"] | null {
  const annotationsNamedDependencyInjection = annotations.filter((annotation) =>
    [...JAVA_DEPENDENCY_INJECTION_ANNOTATIONS, ...JAVA_RESOURCE_INJECTION_ANNOTATIONS].some(
      (candidate) => {
        const simpleName = candidate.path.split(".").at(-1);
        return annotation.name === candidate.path || annotation.name === simpleName;
      }
    )
  );
  const provenAnnotations = annotationsNamedDependencyInjection.flatMap((annotation) =>
    JAVA_RESOURCE_INJECTION_ANNOTATIONS.flatMap((candidate) =>
      staticJavaBareResourceAnnotation(annotation) && annotationMatches(annotation, candidate.path, imports)
        ? [member === "field" ? candidate.fieldSyntax : candidate.setterSyntax]
        : []
    )
  );
  return annotationsNamedDependencyInjection.length === provenAnnotations.length &&
    provenAnnotations.length === 1
    ? provenAnnotations[0] ?? null
    : null;
}

/**
 * Retains direct, non-generic constructor, field, and concrete-method
 * injection point types. `@Autowired` and `@Inject` retain every individually
 * proven method parameter; bare `@Resource` additionally retains only a void
 * JavaBeans setter's one direct parameter. Every fact describes a declared DI
 * type dependency, not a runtime bean or provider selection. Qualifier,
 * optional, collection, and JNDI-resource semantics remain outside this
 * source-only slice.
 */
function staticJavaMethodInjectionReferences(
  input: JavaExtractFileFactsInput,
  method: StaticJavaMethod
): readonly StaticJavaSuperclassReference[] {
  const parameterLists = directChildren(method.node).filter(
    (child) => child.name === "FormalParameters"
  );
  if (parameterLists.length !== 1 || parameterLists[0] === undefined) {
    return [];
  }
  const parameters = directChildren(parameterLists[0]).filter(
    (child) => child.name === "FormalParameter"
  );
  const references: StaticJavaSuperclassReference[] = [];
  for (const parameter of parameters) {
    const typeNodes = directChildren(parameter).filter(isJavaDirectTypeName);
    if (typeNodes.length !== 1 || typeNodes[0] === undefined) {
      continue;
    }
    const reference = staticJavaDirectTypeReference(input, typeNodes[0]);
    if (reference !== null) {
      references.push(reference);
    }
  }
  return references;
}

/**
 * Standard `@Resource` method injection is restricted to one non-vararg,
 * void JavaBeans setter. Other method targets can carry a resource declaration
 * but do not prove a property type for this graph relationship.
 */
function staticJavaResourceSetterInjectionReferences(
  input: JavaExtractFileFactsInput,
  method: StaticJavaMethod
): readonly StaticJavaSuperclassReference[] {
  if (
    !/^set[A-Z][A-Za-z0-9_$]*$/u.test(method.name) ||
    !directChildren(method.node).some((child) => child.name === "void")
  ) {
    return [];
  }
  const parameterLists = directChildren(method.node).filter(
    (child) => child.name === "FormalParameters"
  );
  if (parameterLists.length !== 1 || parameterLists[0] === undefined) {
    return [];
  }
  const parameters = directChildren(parameterLists[0]).filter(
    (child) => child.name === "FormalParameter" || child.name === "SpreadParameter"
  );
  return parameters.length === 1 && parameters[0]?.name === "FormalParameter"
    ? staticJavaMethodInjectionReferences(input, method)
    : [];
}

function staticJavaDependencyInjectionReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticJavaDependencyInjectionReference[] {
  const references: StaticJavaDependencyInjectionReference[] = [];
  const constructors = directChildren(declaration.body).filter(
    (child) => child.name === "ConstructorDeclaration"
  );
  const annotatedConstructors = constructors.flatMap((constructor) => {
    const syntax = staticJavaDependencyInjectionSyntax(
      staticAnnotations(input, constructor),
      imports,
      "constructor"
    );
    return syntax === null ? [] : [{ constructor, syntax }];
  });
  if (annotatedConstructors.length === 1 && annotatedConstructors[0] !== undefined) {
    const { constructor, syntax } = annotatedConstructors[0];
    const parameters = directChildren(constructor).find(
      (child) => child.name === "FormalParameters"
    );
    if (parameters !== undefined) {
      for (const parameter of directChildren(parameters)) {
        if (parameter.name !== "FormalParameter") {
          continue;
        }
        const typeNodes = directChildren(parameter).filter(isJavaDirectTypeName);
        if (typeNodes.length !== 1 || typeNodes[0] === undefined) {
          continue;
        }
        const reference = staticJavaDirectTypeReference(input, typeNodes[0]);
        if (reference !== null) {
          references.push({ syntax, reference });
        }
      }
    }
  }

  for (const field of directChildren(declaration.body)) {
    if (field.name !== "FieldDeclaration") {
      continue;
    }
    const syntax = staticJavaDependencyInjectionSyntax(
      staticAnnotations(input, field),
      imports,
      "field"
    );
    const resourceSyntax = staticJavaResourceInjectionSyntax(
      staticAnnotations(input, field),
      imports,
      "field"
    );
    if (syntax === null && resourceSyntax === null) {
      continue;
    }
    const typeNodes = directChildren(field).filter(isJavaDirectTypeName);
    if (typeNodes.length !== 1 || typeNodes[0] === undefined) {
      continue;
    }
    const reference = staticJavaDirectTypeReference(input, typeNodes[0]);
    if (reference !== null) {
      if (syntax !== null) {
        references.push({ syntax, reference });
      }
      if (resourceSyntax !== null) {
        references.push({ syntax: resourceSyntax, reference });
      }
    }
  }

  for (const method of directChildren(declaration.body)
    .map((node) => staticJavaMethod(input, node))
    .filter((candidate): candidate is StaticJavaMethod => candidate !== null)) {
    if (method.body === null || method.isStatic) {
      continue;
    }
    const syntax = staticJavaDependencyInjectionSyntax(method.annotations, imports, "method");
    if (syntax !== null) {
      for (const reference of staticJavaMethodInjectionReferences(input, method)) {
        references.push({ syntax, reference });
      }
    }
    const resourceSyntax = staticJavaResourceInjectionSyntax(method.annotations, imports, "setter");
    if (resourceSyntax !== null) {
      for (const reference of staticJavaResourceSetterInjectionReferences(input, method)) {
        references.push({ syntax: resourceSyntax, reference });
      }
    }
  }

  return references;
}

/** Java interface methods are public unless they explicitly opt into `private`. */
function isJavaInterfaceMethodExported(declaration: StaticJavaMethod): boolean {
  const modifiers = directChildren(declaration.node).find((child) => child.name === "Modifiers");
  return modifiers === undefined || !directChildren(modifiers).some((child) => child.name === "private");
}

function staticClassPrefixes(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly string[] | null {
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
    return [""];
  }
  const mapping = mappings[0];
  return mapping === undefined ? null : staticSpringClassPaths(input, mapping);
}

function staticMethodRoutes(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): readonly StaticHttpRoute[] {
  const annotationsNamedRequestMapping = declaration.annotations.filter(
    (annotation) => annotation.name === "RequestMapping" || annotation.name === SPRING_REQUEST_MAPPING_PATH
  );
  const requestMappings = annotationsNamedRequestMapping.filter((annotation) =>
    annotationMatches(annotation, SPRING_REQUEST_MAPPING_PATH, imports)
  );
  if (annotationsNamedRequestMapping.length !== requestMappings.length) {
    return [];
  }
  if (requestMappings.length > 0) {
    return requestMappings.length === 1 && requestMappings[0] !== undefined
      ? (staticSpringRequestMappingRoutes(input, requestMappings[0], imports) ?? [])
      : [];
  }
  const mappings = declaration.annotations.flatMap((annotation) => {
    const method = Object.entries(SPRING_METHOD_MAPPING_PATHS).find(([path]) =>
      annotationMatches(annotation, path, imports)
    )?.[1];
    return method === undefined ? [] : [{ annotation, method }];
  });
  if (mappings.length !== 1) {
    return [];
  }
  const mapping = mappings[0];
  if (mapping === undefined) {
    return [];
  }
  const path = staticSpringPath(input, mapping.annotation);
  return path === null ? [] : [{ method: mapping.method, path, node: mapping.annotation.node }];
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

/**
 * Retains a configuration prefix on one direct concrete `@Bean` method only
 * inside a direct `@Configuration` class. All three Spring annotation types
 * require exact import or fully-qualified proof. This intentionally models a
 * source-proven factory relationship, not Spring's runtime bean registration.
 */
function staticSpringBootBeanConfigurationPropertiesPrefixReferences(
  input: JavaExtractFileFactsInput,
  owner: StaticJavaClass,
  method: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootConfigurationPropertiesPrefixReference[] {
  if (!directChildren(method.node).some((child) => child.name === "Block")) {
    return [];
  }
  const annotationsNamedConfiguration = owner.annotations.filter(
    (annotation) => annotation.name === "Configuration" || annotation.name === SPRING_CONFIGURATION_PATH
  );
  const configurationAnnotations = annotationsNamedConfiguration.filter((annotation) =>
    annotationMatches(annotation, SPRING_CONFIGURATION_PATH, imports)
  );
  if (
    annotationsNamedConfiguration.length !== configurationAnnotations.length ||
    configurationAnnotations.length !== 1
  ) {
    return [];
  }
  const annotationsNamedBean = method.annotations.filter(
    (annotation) => annotation.name === "Bean" || annotation.name === SPRING_BEAN_PATH
  );
  const beanAnnotations = annotationsNamedBean.filter((annotation) =>
    annotationMatches(annotation, SPRING_BEAN_PATH, imports)
  );
  if (annotationsNamedBean.length !== beanAnnotations.length || beanAnnotations.length !== 1) {
    return [];
  }
  const annotationsNamedConfigurationProperties = method.annotations.filter(
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
 * literal `@Value` placeholders and direct Java class-level, direct top-level
 * record-level, or proven `@Bean` factory-method `@ConfigurationProperties`
 * literal prefixes.
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
  const jvmDependencyInjectionCapability = frameworkCapability("jvm-di");
  if (!jvmDependencyInjectionCapability.languages.includes(input.language)) {
    throw new Error("JVM dependency-injection extraction was invoked for an unsupported source language.");
  }
  const reactNativeCapability = frameworkCapability("react-native");
  if (!reactNativeCapability.languages.includes(input.language)) {
    throw new Error("React Native bridge extraction was invoked for an unsupported source language.");
  }

  const root = parser.parse(input.sourceText).topNode;
  const recordInspection = inspectJavaRecords({ sourceText: input.sourceText });
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const pendingReferences: PendingReference[] = [];
  const javaClassFacts: Array<{ symbolId: string; packageName: string }> = [];
  const jvmTypeFacts: JvmFacts["types"][number][] = [];
  const jvmHeritageReferences: JvmFacts["heritageReferences"][number][] = [];
  const jvmDependencyInjectionReferences: JvmDependencyInjectionReferenceFact[] = [];
  const jvmCallableSignatureReferences: JvmCallableSignatureReferenceFact[] = [];
  const javaCallableDeclarations: JavaCallableDeclarationFact[] = [];
  const javaChainedCallReferences: JavaChainedCallReferenceFact[] = [];
  const javaMemberCallReferences: JavaMemberCallReferenceFact[] = [];
  const springBootPropertiesValueReferences: SpringBootPropertiesValueReferenceFact[] = [];
  const springBootConfigurationPropertiesPrefixes: SpringBootConfigurationPropertiesPrefixReferenceFact[] = [];
  const reactNativeNativeMethods: ReactNativeFacts["nativeMethods"][number][] = [];
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
      jvmTypeFacts.push({ symbolId: symbol.id, packageName });
    }
    return symbol;
  }

  function addInterface(
    declaration: StaticJavaInterface,
    packageName: string | null
  ): SymbolNode {
    const qualifiedName = `${input.filePath}#${declaration.name}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "interface");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "interface",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "interface",
      filePath: input.filePath,
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    if (packageName !== null) {
      jvmTypeFacts.push({ symbolId: symbol.id, packageName });
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

  function addMethod(
    parent: SymbolNode,
    declaration: StaticJavaMethod | StaticJavaConstructor,
    imports: ReadonlyMap<string, string>,
    isExported: boolean = declaration.isExported
  ): SymbolNode {
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
      isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    const arity = staticJavaCallableArity(declaration);
    const parameterTypes = staticJavaCallableParameterTypes(input, declaration, imports);
    if (arity !== null && parameterTypes !== null) {
      javaCallableDeclarations.push({
        symbolId: symbol.id,
        declaringTypeId: parent.id,
        name: declaration.name,
        callableKind: "isStatic" in declaration ? "method" : "constructor",
        isStatic: "isStatic" in declaration && declaration.isStatic,
        visibility: declaration.visibility,
        ...arity,
        parameterTypes
      });
    }
    return symbol;
  }

  function addPendingOverrideReference(source: SymbolNode, declaration: StaticJavaMethod): void {
    const range = rangeFor(lineStarts, declaration.nameNode.from, declaration.nameNode.to);
    pendingReferences.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: null,
        kind: "overrides",
        line: range.start.line,
        column: range.start.column,
        referenceName: declaration.name
      }),
      sourceId: source.id,
      filePath: input.filePath,
      referenceName: declaration.name,
      relationKind: "overrides",
      range
    });
  }

  /**
   * The Java extractor has no compiler classpath. It can nevertheless retain
   * an exact hierarchy fact when one direct simple-name superclass is declared
   * once in this same source file.
   */
  function addExactSameFileSuperclass(
    child: SymbolNode,
    declaration: StaticJavaClass,
    typesByName: ReadonlyMap<string, readonly SymbolNode[]>
  ): void {
    const superclass = staticJavaDirectSuperclass(input, declaration);
    if (superclass === null || superclass.qualifiedTypePath !== undefined) {
      return;
    }
    const candidates = (typesByName.get(superclass.name) ?? []).filter(
      (candidate) => candidate.id !== child.id && candidate.kind === "class"
    );
    if (candidates.length !== 1 || candidates[0] === undefined) {
      return;
    }
    const target = candidates[0];
    const range = rangeFor(lineStarts, superclass.node.from, superclass.node.to);
    edges.push({
      id: createEdgeId({
        sourceId: child.id,
        targetId: target.id,
        kind: "extends",
        line: range.start.line,
        column: range.start.column,
        referenceName: superclass.name
      }),
      sourceId: child.id,
      targetId: target.id,
      kind: "extends",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: superclass.name,
      evidence: {
        ruleId: "syntax.java.same-file.direct-superclass",
        stage: "syntax",
        candidateSymbolIds: [target.id]
      }
    });
  }

  /**
   * Direct interface hierarchy facts need no classpath when an unqualified
   * contract name identifies exactly one interface declared in this file.
   */
  function addExactSameFileInterfaceRelations(
    child: SymbolNode,
    declaration: StaticJavaClass | StaticJavaInterface,
    typesByName: ReadonlyMap<string, readonly SymbolNode[]>,
    headerName: "SuperInterfaces" | "ExtendsInterfaces",
    relationKind: "extends" | "implements",
    ruleId: string
  ): void {
    for (const reference of staticJavaDirectInterfaceReferences(input, declaration, headerName)) {
      if (reference.qualifiedTypePath !== undefined) {
        continue;
      }
      const candidates = (typesByName.get(reference.name) ?? []).filter(
        (candidate) => candidate.id !== child.id && candidate.kind === "interface"
      );
      if (candidates.length !== 1 || candidates[0] === undefined) {
        continue;
      }
      const target = candidates[0];
      const range = rangeFor(lineStarts, reference.node.from, reference.node.to);
      edges.push({
        id: createEdgeId({
          sourceId: child.id,
          targetId: target.id,
          kind: relationKind,
          line: range.start.line,
          column: range.start.column,
          referenceName: reference.name
        }),
        sourceId: child.id,
        targetId: target.id,
        kind: relationKind,
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName: reference.name,
        evidence: {
          ruleId,
          stage: "syntax",
          candidateSymbolIds: [target.id]
        }
      });
    }
  }

  /**
   * Retains a direct source-level JVM parent reference for the project resolver.
   * A qualified spelling takes precedence over imports; otherwise the import map
   * contains only unique direct Java imports, so static, wildcard, and ambiguous
   * imports cannot acquire cross-file evidence here.
   */
  function addJvmHeritageReference(
    source: SymbolNode,
    reference: StaticJavaSuperclassReference,
    syntax: JvmHeritageSyntax,
    imports: ReadonlyMap<string, string>
  ): void {
    const importedTypePath =
      reference.qualifiedTypePath === undefined ? imports.get(reference.name) : undefined;
    jvmHeritageReferences.push({
      sourceId: source.id,
      filePath: input.filePath,
      referenceName: reference.name,
      syntax,
      range: rangeFor(lineStarts, reference.node.from, reference.node.to),
      ...(importedTypePath === undefined ? {} : { importedTypePath }),
      ...(reference.qualifiedTypePath === undefined
        ? {}
        : { qualifiedTypePath: reference.qualifiedTypePath })
    });
  }

  function addJvmDependencyInjectionReference(
    source: SymbolNode,
    injectionReference: StaticJavaDependencyInjectionReference,
    imports: ReadonlyMap<string, string>
  ): void {
    const { reference, syntax } = injectionReference;
    const importedTypePath =
      reference.qualifiedTypePath === undefined ? imports.get(reference.name) : undefined;
    jvmDependencyInjectionReferences.push({
      sourceId: source.id,
      filePath: input.filePath,
      referenceName: reference.name,
      syntax,
      range: rangeFor(lineStarts, reference.node.from, reference.node.to),
      ...(importedTypePath === undefined ? {} : { importedTypePath }),
      ...(reference.qualifiedTypePath === undefined
        ? {}
        : { qualifiedTypePath: reference.qualifiedTypePath })
    });
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
    const types = directChildren(root)
      .map((node) => staticJavaType(input, node))
      .filter((candidate): candidate is StaticJavaType => candidate !== null)
      .filter((candidate) => !hasSyntaxError(candidate.node));
    const typesByName = new Map<string, SymbolNode[]>();
    const declaredClasses: Array<{ declaration: StaticJavaClass; symbol: SymbolNode }> = [];
    const declaredInterfaces: Array<{ declaration: StaticJavaInterface; symbol: SymbolNode }> = [];

    for (const typeDeclaration of types) {
      const typeSymbol =
        typeDeclaration.kind === "class"
          ? addClass(typeDeclaration, packageName)
          : addInterface(typeDeclaration, packageName);
      const typeCandidates = typesByName.get(typeDeclaration.name) ?? [];
      typeCandidates.push(typeSymbol);
      typesByName.set(typeDeclaration.name, typeCandidates);

      if (typeDeclaration.kind === "interface") {
        declaredInterfaces.push({ declaration: typeDeclaration, symbol: typeSymbol });
        const methods = directChildren(typeDeclaration.body)
          .map((node) => staticJavaMethod(input, node))
          .filter((candidate): candidate is StaticJavaMethod => candidate !== null)
          .filter((candidate) => !overlapsRecord(candidate.node));
        const typeParameters = staticJavaTypeParameterNames(input, typeDeclaration.node);
        const shadowedValueNames = staticJavaValueDeclarationNames(input, typeDeclaration.body);
        for (const methodDeclaration of methods) {
          const methodSymbol = addMethod(
            typeSymbol,
            methodDeclaration,
            imports,
            isJavaInterfaceMethodExported(methodDeclaration)
          );
          jvmCallableSignatureReferences.push(
            ...staticJavaCallableSignatureReferences({
              extraction: input,
              callable: methodDeclaration,
              callableSymbol: methodSymbol,
              declaringType: typeSymbol,
              enclosingTypeParameters: typeParameters,
              imports
            })
          );
          javaChainedCallReferences.push(
            ...staticJavaChainedCallReferences({
              extraction: input,
              callable: methodDeclaration,
              callableSymbol: methodSymbol,
              declaringType: typeSymbol,
              imports,
              shadowedValueNames
            })
          );
          javaMemberCallReferences.push(
            ...staticJavaMemberCallReferences({
              extraction: input,
              callable: methodDeclaration,
              callableSymbol: methodSymbol,
              declaringType: typeSymbol,
              imports
            })
          );
        }
        continue;
      }

      const classDeclaration = typeDeclaration;
      const classSymbol = typeSymbol;
      declaredClasses.push({ declaration: classDeclaration, symbol: classSymbol });
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
      for (const reference of staticJavaDependencyInjectionReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (!overlapsRecord(reference.reference.node)) {
          addJvmDependencyInjectionReference(classSymbol, reference, imports);
        }
      }
      const methods = directChildren(classDeclaration.body)
        .map((node) => staticJavaMethod(input, node))
        .filter((candidate): candidate is StaticJavaMethod => candidate !== null)
        .filter((candidate) => !overlapsRecord(candidate.node));
      const constructors = directChildren(classDeclaration.body)
        .map((node) => staticJavaConstructor(input, node))
        .filter((candidate): candidate is StaticJavaConstructor => candidate !== null)
        .filter((candidate) => !overlapsRecord(candidate.node));
      const typeParameters = staticJavaTypeParameterNames(input, classDeclaration.node);
      const shadowedValueNames = staticJavaValueDeclarationNames(input, classDeclaration.body);
      for (const constructorDeclaration of constructors) {
        const constructorSymbol = addMethod(classSymbol, constructorDeclaration, imports);
        jvmCallableSignatureReferences.push(
          ...staticJavaCallableSignatureReferences({
            extraction: input,
            callable: constructorDeclaration,
            callableSymbol: constructorSymbol,
            declaringType: classSymbol,
            enclosingTypeParameters: typeParameters,
            imports
          })
        );
        javaChainedCallReferences.push(
          ...staticJavaChainedCallReferences({
            extraction: input,
            callable: constructorDeclaration,
            callableSymbol: constructorSymbol,
            declaringType: classSymbol,
            imports,
            shadowedValueNames
          })
        );
        javaMemberCallReferences.push(
          ...staticJavaMemberCallReferences({
            extraction: input,
            callable: constructorDeclaration,
            callableSymbol: constructorSymbol,
            declaringType: classSymbol,
            imports
          })
        );
      }
      const symbolsByMethod = new Map<StaticJavaMethod, SymbolNode>();
      for (const methodDeclaration of methods) {
        const methodSymbol = addMethod(classSymbol, methodDeclaration, imports);
        symbolsByMethod.set(methodDeclaration, methodSymbol);
        jvmCallableSignatureReferences.push(
          ...staticJavaCallableSignatureReferences({
            extraction: input,
            callable: methodDeclaration,
            callableSymbol: methodSymbol,
            declaringType: classSymbol,
            enclosingTypeParameters: typeParameters,
            imports
          })
        );
        javaChainedCallReferences.push(
          ...staticJavaChainedCallReferences({
            extraction: input,
            callable: methodDeclaration,
            callableSymbol: methodSymbol,
            declaringType: classSymbol,
            imports,
            shadowedValueNames
          })
        );
        javaMemberCallReferences.push(
          ...staticJavaMemberCallReferences({
            extraction: input,
            callable: methodDeclaration,
            callableSymbol: methodSymbol,
            declaringType: classSymbol,
            imports
          })
        );
        if (hasJavaOverrideAnnotation(methodDeclaration)) {
          addPendingOverrideReference(methodSymbol, methodDeclaration);
        }
      }
      const reactNativeModule = staticJavaReactNativeModule(
        input,
        classDeclaration,
        methods,
        imports
      );
      if (reactNativeModule !== null) {
        for (const methodDeclaration of methods) {
          const methodSymbol = symbolsByMethod.get(methodDeclaration);
          if (
            methodSymbol === undefined ||
            !isJavaReactNativeMethod(methodDeclaration, imports, reactNativeModule.kind)
          ) {
            continue;
          }
          reactNativeNativeMethods.push({
            platform: "android",
            moduleName: reactNativeModule.moduleName,
            methodName: methodDeclaration.name,
            methodId: methodSymbol.id,
            filePath: input.filePath,
            range: rangeFor(lineStarts, methodDeclaration.node.from, methodDeclaration.node.to),
            ...(reactNativeModule.kind === "codegen-spec"
              ? { implementationKind: "codegen-spec-override" }
              : {})
          });
        }
      }
      for (const methodDeclaration of methods) {
        const methodSymbol = symbolsByMethod.get(methodDeclaration);
        if (methodSymbol === undefined) {
          continue;
        }
        for (const reference of staticSpringBootBeanConfigurationPropertiesPrefixReferences(
          input,
          classDeclaration,
          methodDeclaration,
          imports
        )) {
          springBootConfigurationPropertiesPrefixes.push({
            sourceId: methodSymbol.id,
            filePath: input.filePath,
            prefix: reference.prefix,
            range: rangeFor(lineStarts, reference.node.from, reference.node.to)
          });
        }
      }

      if (isSpringController(classDeclaration, imports)) {
        const prefixes = staticClassPrefixes(input, classDeclaration, imports);
        if (prefixes !== null) {
          for (const methodDeclaration of methods) {
            const routes = staticMethodRoutes(input, methodDeclaration, imports);
            const handler = symbolsByMethod.get(methodDeclaration);
            if (handler !== undefined) {
              for (const prefix of prefixes) {
                for (const route of routes) {
                  addFrameworkRoute(
                    classSymbol,
                    { ...route, path: joinHttpPaths(prefix, route.path) },
                    handler,
                    route.ruleId ??
                      "framework.spring-web.direct-controller.literal-method-mapping.local-method"
                  );
                }
              }
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

    for (const { declaration, symbol } of declaredClasses) {
      addExactSameFileSuperclass(symbol, declaration, typesByName);
      addExactSameFileInterfaceRelations(
        symbol,
        declaration,
        typesByName,
        "SuperInterfaces",
        "implements",
        "syntax.java.same-file.direct-implements"
      );
      const superclass = staticJavaDirectSuperclass(input, declaration);
      if (superclass !== null) {
        addJvmHeritageReference(symbol, superclass, "java-class-superclass", imports);
      }
      for (const reference of staticJavaDirectInterfaceReferences(
        input,
        declaration,
        "SuperInterfaces"
      )) {
        addJvmHeritageReference(symbol, reference, "java-class-interface", imports);
      }
    }
    for (const { declaration, symbol } of declaredInterfaces) {
      addExactSameFileInterfaceRelations(
        symbol,
        declaration,
        typesByName,
        "ExtendsInterfaces",
        "extends",
        "syntax.java.same-file.direct-interface-extends"
      );
      for (const reference of staticJavaDirectInterfaceReferences(
        input,
        declaration,
        "ExtendsInterfaces"
      )) {
        addJvmHeritageReference(symbol, reference, "java-interface-superinterface", imports);
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
      for (const reference of recordDeclaration.configurationPropertiesPrefixes) {
        const referenceRange = reference.node.range();
        springBootConfigurationPropertiesPrefixes.push({
          sourceId: recordSymbol.id,
          filePath: input.filePath,
          prefix: reference.prefix,
          range: rangeFor(lineStarts, referenceRange.start.index, referenceRange.end.index)
        });
      }
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
    javaFacts: {
      classes: javaClassFacts
    },
    jvmFacts: {
      types: jvmTypeFacts,
      heritageReferences: jvmHeritageReferences,
      dependencyInjectionReferences: jvmDependencyInjectionReferences,
      callableSignatureReferences: jvmCallableSignatureReferences,
      javaCallableDeclarations,
      javaChainedCallReferences,
      javaMemberCallReferences
    },
    springBootPropertiesFacts: {
      valueReferences: springBootPropertiesValueReferences,
      configurationPropertiesPrefixes: springBootConfigurationPropertiesPrefixes
    },
    reactNativeFacts: {
      nativeModuleCalls: [],
      turboModuleCalls: [],
      turboModuleDefaultImportCalls: [],
      turboModuleDefaultExports: [],
      turboModuleSpecMethods: [],
      nativeMethods: reactNativeNativeMethods
    }
  };
}
