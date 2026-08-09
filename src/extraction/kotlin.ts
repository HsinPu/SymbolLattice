import { parse, type SgNode } from "./ast-grep-languages.js";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type JvmDependencyInjectionReferenceFact,
  type JvmFacts,
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

/** Kotlin uses the shared prebuilt ast-grep Tree-sitter language registry. */

export interface KotlinExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "kotlin";
}

type KotlinSyntaxNode = SgNode;

interface StaticKotlinType {
  readonly kind: "class" | "interface";
  /** Kotlin objects use the class graph kind but retain their source shape. */
  readonly isObject: boolean;
  readonly name: string;
  readonly node: KotlinSyntaxNode;
  readonly body: KotlinSyntaxNode;
}

interface StaticKotlinFunction {
  readonly name: string;
  readonly nameNode: KotlinSyntaxNode;
  readonly node: KotlinSyntaxNode;
  readonly body: KotlinSyntaxNode | null;
  readonly receiverName: string | null;
}

interface StaticKotlinSupertypeReference {
  readonly name: string;
  readonly node: KotlinSyntaxNode;
  /** Direct dotted spelling such as `example.api.Contract`, never an import lookup. */
  readonly qualifiedTypePath?: string;
}

interface StaticKotlinDependencyInjectionReference {
  readonly syntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly reference: StaticKotlinSupertypeReference;
}

interface StaticKotlinDependencyInjectionAnnotation {
  readonly importPath: string;
  readonly constructorSyntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly fieldSyntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly setterSyntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly methodSyntax: JvmDependencyInjectionReferenceFact["syntax"];
}

interface StaticKotlinResourceInjectionAnnotation {
  readonly importPath: string;
  readonly fieldSyntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly setterSyntax: JvmDependencyInjectionReferenceFact["syntax"];
}

interface StaticKotlinAnnotationIdentity {
  readonly name: string;
  /** Null means the annotation uses Kotlin's ordinary, target-unspecified form. */
  readonly useSiteTarget: string | null;
}

type StaticKotlinReactNativeModuleKind = "direct" | "codegen-spec";

interface StaticKotlinReactNativeModule {
  readonly moduleName: string;
  readonly kind: StaticKotlinReactNativeModuleKind;
}

interface StaticKtorRoute {
  readonly methodName: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly node: KotlinSyntaxNode;
}

interface StaticKotlinSpringWebRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly node: KotlinSyntaxNode;
  readonly ruleId: string;
}

interface StaticKotlinCall {
  readonly name: string;
  readonly suffix: KotlinSyntaxNode;
}

interface StaticKotlinSpringBootPropertiesReference {
  readonly key: string;
  readonly node: KotlinSyntaxNode;
}

interface StaticKotlinSpringBootConfigurationPropertiesPrefixReference {
  readonly prefix: string;
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
const SPRING_CONFIGURATION_PROPERTIES_IMPORT =
  "org.springframework.boot.context.properties.ConfigurationProperties";
const SPRING_CONFIGURATION_IMPORT = "org.springframework.context.annotation.Configuration";
const SPRING_BEAN_IMPORT = "org.springframework.context.annotation.Bean";
const SPRING_AUTOWIRED_IMPORT = "org.springframework.beans.factory.annotation.Autowired";
const JAKARTA_INJECT_IMPORT = "jakarta.inject.Inject";
const JAVAX_INJECT_IMPORT = "javax.inject.Inject";
const JAKARTA_RESOURCE_IMPORT = "jakarta.annotation.Resource";
const JAVAX_RESOURCE_IMPORT = "javax.annotation.Resource";
const SPRING_REST_CONTROLLER_IMPORT =
  "org.springframework.web.bind.annotation.RestController";
const SPRING_CONTROLLER_IMPORT = "org.springframework.stereotype.Controller";
const SPRING_REQUEST_MAPPING_IMPORT =
  "org.springframework.web.bind.annotation.RequestMapping";
const SPRING_REQUEST_METHOD_IMPORT =
  "org.springframework.web.bind.annotation.RequestMethod";
const REACT_NATIVE_REACT_METHOD_IMPORT = "com.facebook.react.bridge.ReactMethod";
const REACT_NATIVE_CONTEXT_BASE_MODULE_IMPORT =
  "com.facebook.react.bridge.ReactContextBaseJavaModule";
const SPRING_BOOT_PROPERTIES_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const REACT_NATIVE_BRIDGE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

const KOTLIN_DEPENDENCY_INJECTION_ANNOTATIONS: readonly StaticKotlinDependencyInjectionAnnotation[] = [
  {
    importPath: SPRING_AUTOWIRED_IMPORT,
    constructorSyntax: "spring-autowired-constructor",
    fieldSyntax: "spring-autowired-field",
    setterSyntax: "spring-autowired-setter",
    methodSyntax: "spring-autowired-method"
  },
  {
    importPath: JAKARTA_INJECT_IMPORT,
    constructorSyntax: "jakarta-inject-constructor",
    fieldSyntax: "jakarta-inject-field",
    setterSyntax: "jakarta-inject-setter",
    methodSyntax: "jakarta-inject-method"
  },
  {
    importPath: JAVAX_INJECT_IMPORT,
    constructorSyntax: "javax-inject-constructor",
    fieldSyntax: "javax-inject-field",
    setterSyntax: "javax-inject-setter",
    methodSyntax: "javax-inject-method"
  }
];

const KOTLIN_RESOURCE_INJECTION_ANNOTATIONS: readonly StaticKotlinResourceInjectionAnnotation[] = [
  {
    importPath: JAKARTA_RESOURCE_IMPORT,
    fieldSyntax: "jakarta-resource-field",
    setterSyntax: "jakarta-resource-setter"
  },
  {
    importPath: JAVAX_RESOURCE_IMPORT,
    fieldSyntax: "javax-resource-field",
    setterSyntax: "javax-resource-setter"
  }
];

const SPRING_METHOD_MAPPING_IMPORTS: Readonly<Record<string, RouteMethod>> = {
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
  const isObject = node.kind() === "object_declaration";
  if (!isObject && node.kind() !== "class_declaration") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.kind() === "type_identifier");
  const body = children.find((child) => child.kind() === "class_body");
  const name = nameNode === undefined ? null : identifierText(nameNode);
  if (
    name === null ||
    children.filter((child) => child.kind() === "type_identifier").length !== 1
  ) {
    return null;
  }
  if (isObject) {
    // SymbolLattice has no separate object symbol kind. A direct named Kotlin
    // object is therefore a class-like owner, but only when its braced body
    // proves local members that framework extraction may inspect.
    return body === undefined ? null : { kind: "class", isObject: true, name, node, body };
  }
  const classOrInterface = children.find(
    (child) => child.kind() === "class" || child.kind() === "interface"
  );
  if (classOrInterface === undefined) {
    return null;
  }
  // Kotlin permits a valid top-level class without a braced body. Reusing the
  // declaration as its empty member scope preserves the direct-member contract
  // while making its primary constructor available to framework extractors.
  const memberScope = body ?? node;
  const kind = classOrInterface.kind();
  if (kind === "class") {
    return { kind: "class", isObject: false, name, node, body: memberScope };
  }
  if (kind === "interface") {
    return { kind: "interface", isObject: false, name, node, body: memberScope };
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
  if (nameNode === undefined || name === null) {
    return null;
  }
  const nameIndex = children.indexOf(nameNode);
  const receiver =
    nameIndex > 0 && children[nameIndex - 1]?.kind() === "."
      ? children
          .slice(0, nameIndex)
          .filter((child) => child.kind() === "user_type")
          .at(-1)
      : undefined;
  const body = children.find((child) => child.kind() === "function_body") ?? null;
  return {
    name,
    nameNode,
    node,
    body,
    receiverName: receiver === undefined ? null : nodeText(receiver)
  };
}

/**
 * Retains one direct, non-generic Kotlin parent type spelling. A dotted spelling
 * with a conventional lower-case package prefix remains an exact project-local
 * candidate only when it names one indexed top-level type; aliases and
 * compiler-classpath semantics stay deferred.
 */
function staticKotlinQualifiedTopLevelTypePath(typePath: string): string | null {
  const segments = typePath.split(".");
  return segments.length > 1 &&
    segments.slice(0, -1).every((segment) => /^[a-z_][A-Za-z0-9_]*$/u.test(segment))
    ? typePath
    : null;
}

function staticKotlinDirectTypeReference(
  userType: KotlinSyntaxNode
): StaticKotlinSupertypeReference | null {
  const typePath = nodeText(userType);
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u.test(typePath)) {
    return null;
  }
  const name = typePath.split(".").at(-1);
  if (name === undefined) {
    return null;
  }
  let qualifiedTypePath: string | undefined;
  if (typePath.includes(".")) {
    const candidate = staticKotlinQualifiedTopLevelTypePath(typePath);
    if (candidate === null) {
      return null;
    }
    qualifiedTypePath = candidate;
  }
  return {
    name,
    node: userType,
    ...(qualifiedTypePath === undefined ? {} : { qualifiedTypePath })
  };
}

function staticKotlinDirectSupertypeReferences(
  declaration: StaticKotlinType
): readonly StaticKotlinSupertypeReference[] {
  const references: StaticKotlinSupertypeReference[] = [];
  for (const specifier of directChildren(declaration.node).filter(
    (child) => child.kind() === "delegation_specifier"
  )) {
    const children = directChildren(specifier);
    const constructor = children.find((child) => child.kind() === "constructor_invocation");
    const userTypes =
      constructor === undefined
        ? children.filter((child) => child.kind() === "user_type")
        : directChildren(constructor).filter((child) => child.kind() === "user_type");
    if (userTypes.length !== 1 || userTypes[0] === undefined) {
      continue;
    }
    const reference = staticKotlinDirectTypeReference(userTypes[0]);
    if (reference !== null) {
      references.push(reference);
    }
  }
  return references;
}

/** Kotlin's `override` is a direct member modifier in the parsed declaration. */
function hasKotlinOverrideModifier(declaration: StaticKotlinFunction): boolean {
  const modifiers = directChildren(declaration.node).filter((child) => child.kind() === "modifiers");
  if (modifiers.length !== 1 || modifiers[0] === undefined) {
    return false;
  }
  return (
    directChildren(modifiers[0]).filter(
      (modifier) =>
        modifier.kind() === "member_modifier" &&
        directChildren(modifier).some((child) => child.kind() === "override")
    ).length === 1
  );
}

function staticDirectImportPaths(root: KotlinSyntaxNode): ReadonlySet<string> {
  return new Set(staticKotlinDirectImports(root).values());
}

/**
 * Kotlin import aliases and wildcard imports need compiler-level binding
 * resolution. Retain only one explicit, unaliased path per local type name.
 */
function staticKotlinDirectImports(root: KotlinSyntaxNode): ReadonlyMap<string, string> {
  const importList = directChildren(root).find((child) => child.kind() === "import_list");
  if (importList === undefined) {
    return new Map();
  }
  const pathsByLocalName = new Map<string, Set<string>>();
  for (const header of directChildren(importList).filter(
    (child) => child.kind() === "import_header"
  )) {
    const match = /^import\s+([A-Za-z_][A-Za-z0-9_.]*)$/u.exec(nodeText(header));
    if (match?.[1] !== undefined) {
      const localName = match[1].split(".").at(-1);
      if (localName === undefined) {
        continue;
      }
      const paths = pathsByLocalName.get(localName) ?? new Set<string>();
      paths.add(match[1]);
      pathsByLocalName.set(localName, paths);
    }
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

function hasKotlinImport(root: KotlinSyntaxNode): boolean {
  const importList = directChildren(root).find((child) => child.kind() === "import_list");
  return (
    importList !== undefined &&
    directChildren(importList)
      .filter((child) => child.kind() === "import_header")
      .length > 0
  );
}

/** One direct package header is the minimum proof for JVM same-package resolution. */
function staticKotlinPackage(root: KotlinSyntaxNode): string | null {
  const packageHeaders = directChildren(root).filter((child) => child.kind() === "package_header");
  if (packageHeaders.length === 0) {
    return "";
  }
  if (packageHeaders.length !== 1 || packageHeaders[0] === undefined) {
    return null;
  }
  const match = /^package\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/u.exec(
    nodeText(packageHeaders[0])
  );
  return match?.[1] ?? null;
}

/**
 * Restricts Android bridge ownership to a direct ReactContextBaseJavaModule
 * supertype, either fully-qualified or backed by one exact direct import.
 */
function staticKotlinDirectReactNativeModule(
  declaration: StaticKotlinType,
  imports: ReadonlySet<string>
): boolean {
  if (declaration.kind !== "class" || declaration.isObject) {
    return false;
  }
  const source = nodeText(declaration.node);
  const bodyStart = source.indexOf("{");
  const header = bodyStart < 0 ? source : source.slice(0, bodyStart);
  if (
    /:\s*com\.facebook\.react\.bridge\.ReactContextBaseJavaModule\s*\(/u.test(header)
  ) {
    return true;
  }
  return (
    imports.has(REACT_NATIVE_CONTEXT_BASE_MODULE_IMPORT) &&
    /:\s*ReactContextBaseJavaModule\s*\(/u.test(header)
  );
}

/**
 * Recognizes a direct Codegen Spec superclass. Aliased and wildcard imports
 * are absent from staticDirectImportPaths, so a simple base spelling remains
 * tied to one explicit source import.
 */
function staticKotlinCodegenReactNativeModule(
  declaration: StaticKotlinType,
  imports: ReadonlySet<string>
): boolean {
  if (declaration.kind !== "class" || declaration.isObject) {
    return false;
  }
  const source = nodeText(declaration.node);
  const bodyStart = source.indexOf("{");
  const header = bodyStart < 0 ? source : source.slice(0, bodyStart);
  const match =
    /:\s*((?:[A-Za-z_][A-Za-z0-9_]*\.)*([A-Za-z_][A-Za-z0-9_]*Spec))\b/u.exec(header);
  if (match?.[1] === undefined || match[2] === undefined) {
    return false;
  }
  return (
    match[1].includes(".") ||
    [...imports].filter((path) => path.endsWith("." + match[2])).length === 1
  );
}

function staticKotlinReactNativeModuleKind(
  declaration: StaticKotlinType,
  imports: ReadonlySet<string>
): StaticKotlinReactNativeModuleKind | null {
  if (staticKotlinDirectReactNativeModule(declaration, imports)) {
    return "direct";
  }
  return staticKotlinCodegenReactNativeModule(declaration, imports) ? "codegen-spec" : null;
}

/**
 * Reads one direct companion `const val` string. Values on other nested objects,
 * mutable properties, expressions, and inherited constants stay out of scope so
 * a bridge module identity remains syntax-proven.
 */
function staticKotlinCompanionLiteralStringConstant(
  declaration: StaticKotlinType,
  name: string
): string | null {
  const values: string[] = [];
  for (const companion of directChildren(declaration.body).filter(
    (child) => child.kind() === "companion_object"
  )) {
    const body = directChildren(companion).find((child) => child.kind() === "class_body");
    if (body === undefined) {
      continue;
    }
    for (const property of directChildren(body).filter(
      (child) => child.kind() === "property_declaration"
    )) {
      const match = /^(?:(?:public|protected|private|internal)\s+)?const\s+val\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*(?:String|kotlin\.String)\s*)?=\s*"([^"\\\r\n]*)"\s*;?$/u.exec(
        nodeText(property).trim()
      );
      if (match?.[1] === name && match[2] !== undefined) {
        values.push(match[2]);
      }
    }
  }
  return values.length === 1 && values[0] !== undefined ? values[0] : null;
}

/** Retains one literal Android bridge module name from a direct getName body or companion constant. */
function staticKotlinReactNativeModule(
  declaration: StaticKotlinType,
  methods: readonly StaticKotlinFunction[],
  imports: ReadonlySet<string>
): StaticKotlinReactNativeModule | null {
  const kind = staticKotlinReactNativeModuleKind(declaration, imports);
  if (kind === null) {
    return null;
  }
  const getNameMethods = methods.filter((method) => method.name === "getName");
  if (getNameMethods.length !== 1 || getNameMethods[0]?.body === null || getNameMethods[0] === undefined) {
    return null;
  }
  const body = nodeText(getNameMethods[0].body);
  const literalExpression = /^=\s*"([^"\\\r\n]*)"\s*$/u.exec(body)?.[1] ?? null;
  const literalBlock = /^\{\s*return\s+"([^"\\\r\n]*)"\s*\}$/u.exec(body)?.[1] ?? null;
  const constantExpression = /^=\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*$/u.exec(body)?.[1] ?? null;
  const constantBlock = /^\{\s*return\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\}$/u.exec(body)?.[1] ?? null;
  const constantName = constantExpression ?? constantBlock;
  const moduleName = literalExpression ?? literalBlock ??
    (constantName === null
      ? null
      : staticKotlinCompanionLiteralStringConstant(declaration, constantName));
  return moduleName !== null && REACT_NATIVE_BRIDGE_IDENTIFIER.test(moduleName)
    ? { moduleName, kind }
    : null;
}

/** A direct ReactMethod annotation needs exact import or fully-qualified proof. */
function isKotlinDirectReactNativeMethod(
  declaration: StaticKotlinFunction,
  imports: ReadonlySet<string>
): boolean {
  const modifiers = directChildren(declaration.node).find((child) => child.kind() === "modifiers");
  if (modifiers === undefined) {
    return false;
  }
  const annotations = directChildren(modifiers).filter((child) => child.kind() === "annotation");
  const annotationsNamedReactMethod = annotations.filter((annotation) => {
    const name = staticKotlinAnnotationName(annotation);
    return name === "ReactMethod" || name === REACT_NATIVE_REACT_METHOD_IMPORT;
  });
  const reactMethods = annotationsNamedReactMethod.filter((annotation) => {
    const name = staticKotlinAnnotationName(annotation);
    return (
      name === REACT_NATIVE_REACT_METHOD_IMPORT ||
      (name === "ReactMethod" && imports.has(REACT_NATIVE_REACT_METHOD_IMPORT))
    );
  });
  return (
    annotationsNamedReactMethod.length === reactMethods.length &&
    reactMethods.length === 1
  );
}

/** Codegen methods are direct Kotlin overrides; the resolver later proves their TypeScript contract. */
function isKotlinCodegenReactNativeMethod(declaration: StaticKotlinFunction): boolean {
  return (
    declaration.name !== "getName" &&
    declaration.receiverName === null &&
    /(?:^|\s)override\s+fun\s+/u.test(nodeText(declaration.node))
  );
}

function isKotlinReactNativeMethod(
  declaration: StaticKotlinFunction,
  imports: ReadonlySet<string>,
  kind: StaticKotlinReactNativeModuleKind
): boolean {
  return kind === "direct"
    ? isKotlinDirectReactNativeMethod(declaration, imports)
    : isKotlinCodegenReactNativeMethod(declaration);
}

function staticKotlinAnnotationInvocation(annotation: KotlinSyntaxNode): KotlinSyntaxNode | null {
  if (annotation.kind() !== "annotation") {
    return null;
  }
  const children = directChildren(annotation);
  const invocation = children.find((child) => child.kind() === "constructor_invocation");
  return children.length === 2 && invocation !== undefined ? invocation : null;
}

function staticKotlinAnnotationIdentity(
  annotation: KotlinSyntaxNode
): StaticKotlinAnnotationIdentity | null {
  if (annotation.kind() !== "annotation") {
    return null;
  }
  const children = directChildren(annotation);
  const useSiteTargets = children.filter((child) => child.kind() === "use_site_target");
  if (useSiteTargets.length > 1) {
    return null;
  }
  const useSiteTargetNode = useSiteTargets[0];
  if (
    (useSiteTargetNode === undefined && children.length !== 2) ||
    (useSiteTargetNode !== undefined && children.length !== 3)
  ) {
    return null;
  }
  const subject = children.at(-1);
  let userType: KotlinSyntaxNode | undefined;
  if (subject?.kind() === "user_type") {
    userType = subject;
  } else if (subject?.kind() === "constructor_invocation") {
    const userTypes = directChildren(subject).filter((child) => child.kind() === "user_type");
    if (userTypes.length !== 1 || userTypes[0] === undefined) {
      return null;
    }
    userType = userTypes[0];
  }
  if (userType === undefined) {
    return null;
  }
  const name = nodeText(userType);
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u.test(name)) {
    return null;
  }
  if (useSiteTargetNode === undefined) {
    return { name, useSiteTarget: null };
  }
  const useSiteTarget = /^([a-z]+):$/u.exec(nodeText(useSiteTargetNode))?.[1];
  return useSiteTarget === undefined ? null : { name, useSiteTarget };
}

function staticKotlinAnnotationName(annotation: KotlinSyntaxNode): string | null {
  const identity = staticKotlinAnnotationIdentity(annotation);
  return identity?.useSiteTarget === null ? identity.name : null;
}

function staticKotlinAnnotationHasExpectedName(
  annotation: KotlinSyntaxNode,
  expectedImport: string
): boolean {
  const expectedName = expectedImport.split(".").at(-1);
  const name = staticKotlinAnnotationName(annotation);
  return name !== null && expectedName !== undefined && (name === expectedName || name === expectedImport);
}

function staticKotlinAnnotationMatches(
  annotation: KotlinSyntaxNode,
  expectedImport: string,
  imports: ReadonlySet<string>
): boolean {
  const expectedName = expectedImport.split(".").at(-1);
  const name = staticKotlinAnnotationName(annotation);
  return (
    name !== null &&
    expectedName !== undefined &&
    (name === expectedImport || (name === expectedName && imports.has(expectedImport)))
  );
}

/**
 * Resolves one annotation only when its source spelling is a fully-qualified
 * target or its unaliased simple name has the exact direct import. This keeps
 * the framework facts independent of Kotlin's broader name-resolution rules.
 */
function staticKotlinExactlyOneProvenAnnotation(
  annotations: readonly KotlinSyntaxNode[],
  expectedImport: string,
  imports: ReadonlySet<string>
): KotlinSyntaxNode | null {
  const annotationsNamedExpected = annotations.filter((annotation) =>
    staticKotlinAnnotationHasExpectedName(annotation, expectedImport)
  );
  const provenAnnotations = annotationsNamedExpected.filter((annotation) =>
    staticKotlinAnnotationMatches(annotation, expectedImport, imports)
  );
  if (
    annotationsNamedExpected.length !== provenAnnotations.length ||
    provenAnnotations.length !== 1
  ) {
    return null;
  }
  return provenAnnotations[0] ?? null;
}

type StaticKotlinDependencyInjectionMember = "constructor" | "field" | "setter" | "method";

function staticKotlinDependencyInjectionUseSiteTargetMatches(
  member: StaticKotlinDependencyInjectionMember,
  useSiteTarget: string | null
): boolean {
  if (member === "field") {
    return useSiteTarget === null || useSiteTarget === "field";
  }
  if (member === "setter") {
    return useSiteTarget === "set";
  }
  return useSiteTarget === null;
}

function staticKotlinDependencyInjectionAnnotationHasExpectedName(
  annotation: KotlinSyntaxNode,
  expectedImport: string,
  member: StaticKotlinDependencyInjectionMember
): boolean {
  const expectedName = expectedImport.split(".").at(-1);
  const identity = staticKotlinAnnotationIdentity(annotation);
  return (
    identity !== null &&
    expectedName !== undefined &&
    staticKotlinDependencyInjectionUseSiteTargetMatches(member, identity.useSiteTarget) &&
    (identity.name === expectedName || identity.name === expectedImport)
  );
}

function staticKotlinDependencyInjectionAnnotationMatches(
  annotation: KotlinSyntaxNode,
  expectedImport: string,
  imports: ReadonlySet<string>,
  member: StaticKotlinDependencyInjectionMember
): boolean {
  const expectedName = expectedImport.split(".").at(-1);
  const identity = staticKotlinAnnotationIdentity(annotation);
  return (
    identity !== null &&
    expectedName !== undefined &&
    staticKotlinDependencyInjectionUseSiteTargetMatches(member, identity.useSiteTarget) &&
    (identity.name === expectedImport ||
      (identity.name === expectedName && imports.has(expectedImport)))
  );
}

function staticKotlinKnownDependencyInjectionAnnotationHasExpectedName(
  annotation: KotlinSyntaxNode,
  member: StaticKotlinDependencyInjectionMember
): boolean {
  return [...KOTLIN_DEPENDENCY_INJECTION_ANNOTATIONS, ...KOTLIN_RESOURCE_INJECTION_ANNOTATIONS].some(
    (candidate) =>
      staticKotlinDependencyInjectionAnnotationHasExpectedName(
        annotation,
        candidate.importPath,
        member
      )
  );
}

/**
 * Accepts one fully-qualified or explicitly imported JVM DI annotation. Kotlin
 * `@field:` is accepted only as a field point, `@set:` only as a setter point,
 * and all other use-site targets fail closed before a relation fact is emitted.
 */
function staticKotlinDependencyInjectionSyntax(
  annotations: readonly KotlinSyntaxNode[],
  imports: ReadonlySet<string>,
  member: StaticKotlinDependencyInjectionMember
): JvmDependencyInjectionReferenceFact["syntax"] | null {
  const annotationsNamedDependencyInjection = annotations.filter((annotation) =>
    staticKotlinKnownDependencyInjectionAnnotationHasExpectedName(annotation, member)
  );
  const provenAnnotations = annotationsNamedDependencyInjection.flatMap((annotation) =>
    KOTLIN_DEPENDENCY_INJECTION_ANNOTATIONS.flatMap((candidate) =>
      staticKotlinDependencyInjectionAnnotationMatches(
        annotation,
        candidate.importPath,
        imports,
        member
      )
        ? [
            member === "constructor"
              ? candidate.constructorSyntax
              : member === "field"
                ? candidate.fieldSyntax
                : member === "setter"
                  ? candidate.setterSyntax
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
 * `@Resource` has a member-derived type only when its annotation has no
 * arguments. Name, lookup, and type overrides stay outside static type
 * projection rather than being treated as type-based injection evidence.
 */
function staticKotlinBareResourceAnnotation(annotation: KotlinSyntaxNode): boolean {
  if (staticKotlinAnnotationIdentity(annotation) === null) {
    return false;
  }
  const subject = directChildren(annotation).at(-1);
  if (subject?.kind() === "user_type") {
    return true;
  }
  if (subject?.kind() !== "constructor_invocation") {
    return false;
  }
  const argumentLists = directChildren(subject).filter((child) => child.kind() === "value_arguments");
  return (
    argumentLists.length === 1 &&
    argumentLists[0] !== undefined &&
    directChildren(argumentLists[0]).every((child) => child.kind() === "(" || child.kind() === ")")
  );
}

function staticKotlinResourceInjectionSyntax(
  annotations: readonly KotlinSyntaxNode[],
  imports: ReadonlySet<string>,
  member: "field" | "setter"
): JvmDependencyInjectionReferenceFact["syntax"] | null {
  const annotationsNamedDependencyInjection = annotations.filter((annotation) =>
    staticKotlinKnownDependencyInjectionAnnotationHasExpectedName(annotation, member)
  );
  const provenAnnotations = annotationsNamedDependencyInjection.flatMap((annotation) =>
    KOTLIN_RESOURCE_INJECTION_ANNOTATIONS.flatMap((candidate) =>
      staticKotlinBareResourceAnnotation(annotation) &&
      staticKotlinDependencyInjectionAnnotationMatches(annotation, candidate.importPath, imports, member)
        ? [member === "field" ? candidate.fieldSyntax : candidate.setterSyntax]
        : []
    )
  );
  return annotationsNamedDependencyInjection.length === provenAnnotations.length &&
    provenAnnotations.length === 1
    ? provenAnnotations[0] ?? null
    : null;
}

function staticKotlinDirectInjectionTypeReference(
  node: KotlinSyntaxNode
): StaticKotlinSupertypeReference | null {
  const userTypes = directChildren(node).filter((child) => child.kind() === "user_type");
  return userTypes.length === 1 && userTypes[0] !== undefined
    ? staticKotlinDirectTypeReference(userTypes[0])
    : null;
}

function staticKotlinMethodInjectionReferences(
  method: StaticKotlinFunction
): readonly StaticKotlinSupertypeReference[] {
  const parameterLists = directChildren(method.node).filter(
    (child) => child.kind() === "function_value_parameters"
  );
  if (parameterLists.length !== 1 || parameterLists[0] === undefined) {
    return [];
  }
  const parameterChildren = directChildren(parameterLists[0]);
  const references: StaticKotlinSupertypeReference[] = [];
  for (const [index, parameter] of parameterChildren.entries()) {
    if (parameter.kind() !== "parameter") {
      continue;
    }
    const modifiers = parameterChildren[index - 1];
    const isVararg =
      modifiers?.kind() === "parameter_modifiers" &&
      directChildren(modifiers).some(
        (modifier) => modifier.kind() === "parameter_modifier" && nodeText(modifier) === "vararg"
      );
    if (isVararg) {
      continue;
    }
    const reference = staticKotlinDirectInjectionTypeReference(parameter);
    if (reference !== null) {
      references.push(reference);
    }
  }
  return references;
}

function staticKotlinPropertyHasSetter(property: KotlinSyntaxNode): boolean {
  const bindingKinds = directChildren(property).filter(
    (child) => child.kind() === "binding_pattern_kind"
  );
  return (
    bindingKinds.length === 1 &&
    bindingKinds[0] !== undefined &&
    directChildren(bindingKinds[0]).some((child) => child.kind() === "var")
  );
}

/**
 * Retains direct primary-constructor, class-property, and concrete-method
 * injection point types. `@Autowired` and `@Inject` retain every individually
 * proven method parameter; bare `@Resource` retains only direct fields and
 * mutable-property `@set:` targets. It records only declared static type
 * dependencies; collection/generic types, secondary constructors, direct
 * `@Resource` methods, other use-site targets, extension functions, and
 * runtime provider selection stay outside this JVM DI projection.
 */
function staticKotlinDependencyInjectionReferences(
  declaration: StaticKotlinType,
  imports: ReadonlySet<string>
): readonly StaticKotlinDependencyInjectionReference[] {
  if (declaration.kind !== "class" || declaration.isObject) {
    return [];
  }
  const references: StaticKotlinDependencyInjectionReference[] = [];
  const primaryConstructors = directChildren(declaration.node).filter(
    (child) => child.kind() === "primary_constructor"
  );
  if (primaryConstructors.length === 1 && primaryConstructors[0] !== undefined) {
    const primaryConstructor = primaryConstructors[0];
    const syntax = staticKotlinDependencyInjectionSyntax(
      staticKotlinAnnotations(primaryConstructor),
      imports,
      "constructor"
    );
    if (syntax !== null) {
      for (const parameter of directChildren(primaryConstructor)) {
        if (parameter.kind() !== "class_parameter") {
          continue;
        }
        const reference = staticKotlinDirectInjectionTypeReference(parameter);
        if (reference !== null) {
          references.push({ syntax, reference });
        }
      }
    }
  }

  for (const property of directChildren(declaration.body)) {
    if (property.kind() !== "property_declaration") {
      continue;
    }
    const annotations = staticKotlinAnnotations(property);
    const variableDeclaration = directChildren(property).find(
      (child) => child.kind() === "variable_declaration"
    );
    if (variableDeclaration === undefined) {
      continue;
    }
    const reference = staticKotlinDirectInjectionTypeReference(variableDeclaration);
    if (reference === null) {
      continue;
    }
    const fieldSyntax = staticKotlinDependencyInjectionSyntax(annotations, imports, "field");
    if (fieldSyntax !== null) {
      references.push({ syntax: fieldSyntax, reference });
    }
    const resourceFieldSyntax = staticKotlinResourceInjectionSyntax(annotations, imports, "field");
    if (resourceFieldSyntax !== null) {
      references.push({ syntax: resourceFieldSyntax, reference });
    }
    const setterSyntax = staticKotlinDependencyInjectionSyntax(annotations, imports, "setter");
    if (setterSyntax !== null && staticKotlinPropertyHasSetter(property)) {
      references.push({ syntax: setterSyntax, reference });
    }
    const resourceSetterSyntax = staticKotlinResourceInjectionSyntax(annotations, imports, "setter");
    if (resourceSetterSyntax !== null && staticKotlinPropertyHasSetter(property)) {
      references.push({ syntax: resourceSetterSyntax, reference });
    }
  }

  for (const method of directChildren(declaration.body)
    .map((node) => staticKotlinFunction(node))
    .filter((candidate): candidate is StaticKotlinFunction => candidate !== null)) {
    if (method.body === null || method.receiverName !== null) {
      continue;
    }
    const syntax = staticKotlinDependencyInjectionSyntax(
      staticKotlinAnnotations(method.node),
      imports,
      "method"
    );
    if (syntax === null) {
      continue;
    }
    for (const reference of staticKotlinMethodInjectionReferences(method)) {
      references.push({ syntax, reference });
    }
  }

  return references;
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

function staticKotlinPlainStringLiteral(node: KotlinSyntaxNode): string | null {
  if (node.kind() !== "string_literal") {
    return null;
  }
  const children = directChildren(node);
  const source = nodeText(node);
  if (
    children.length !== 1 ||
    children[0]?.kind() !== "string_content" ||
    source.length < 2 ||
    !source.startsWith('"') ||
    !source.endsWith('"') ||
    source.includes("\\")
  ) {
    return null;
  }
  return source.slice(1, -1);
}

/**
 * Accepts a Spring Web annotation with no arguments, one positional literal,
 * or one `path` / `value` literal. Arrays, placeholders, composed arguments,
 * and all dynamic forms remain outside this parser-backed route surface.
 */
function staticKotlinSpringAnnotationPath(annotation: KotlinSyntaxNode): string | null {
  if (annotation.kind() !== "annotation") {
    return null;
  }
  const annotationChildren = directChildren(annotation);
  if (annotationChildren.length !== 2) {
    return null;
  }
  if (annotationChildren[1]?.kind() === "user_type") {
    return "";
  }
  const invocation = staticKotlinAnnotationInvocation(annotation);
  if (invocation === null) {
    return null;
  }
  const argumentLists = directChildren(invocation).filter((child) => child.kind() === "value_arguments");
  if (argumentLists.length !== 1 || argumentLists[0] === undefined) {
    return null;
  }
  const arguments_ = directChildren(argumentLists[0]).filter(
    (child) => child.kind() === "value_argument"
  );
  if (arguments_.length === 0) {
    return "";
  }
  if (arguments_.length !== 1 || arguments_[0] === undefined) {
    return null;
  }
  const argumentChildren = directChildren(arguments_[0]);
  let literal: KotlinSyntaxNode | undefined;
  if (argumentChildren.length === 1) {
    literal = argumentChildren[0];
  } else if (
    argumentChildren.length === 3 &&
    argumentChildren[0]?.kind() === "simple_identifier" &&
    (nodeText(argumentChildren[0]) === "path" || nodeText(argumentChildren[0]) === "value") &&
    argumentChildren[1]?.kind() === "="
  ) {
    literal = argumentChildren[2];
  } else {
    return null;
  }
  return literal === undefined ? null : staticKotlinPlainStringLiteral(literal);
}

function staticKotlinSpringPath(annotation: KotlinSyntaxNode): string | null {
  const path = staticKotlinSpringAnnotationPath(annotation);
  if (path === null) {
    return null;
  }
  return path.length === 0 || (path.startsWith("/") && !path.includes("//")) ? path : null;
}

function staticKotlinSpringPathsFromValue(value: KotlinSyntaxNode): readonly string[] | null {
  const literals =
    value.kind() === "collection_literal"
      ? directChildren(value).filter(
          (child) => child.kind() !== "[" && child.kind() !== "]" && child.kind() !== ","
        )
      : [value];
  if (literals.length === 0) {
    return null;
  }
  const paths = literals.map((literal) => staticKotlinPlainStringLiteral(literal));
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
 * Accepts a class-level Spring path as one literal or a non-empty, unique
 * literal collection. Conditions and dynamic values remain excluded so the
 * cross-product with direct local handlers stays evidence-backed.
 */
function staticKotlinSpringWebClassPaths(annotation: KotlinSyntaxNode): readonly string[] | null {
  if (annotation.kind() !== "annotation") {
    return null;
  }
  const annotationChildren = directChildren(annotation);
  if (annotationChildren.length !== 2) {
    return null;
  }
  if (annotationChildren[1]?.kind() === "user_type") {
    return [""];
  }
  const invocation = staticKotlinAnnotationInvocation(annotation);
  if (invocation === null) {
    return null;
  }
  const argumentLists = directChildren(invocation).filter((child) => child.kind() === "value_arguments");
  if (argumentLists.length !== 1 || argumentLists[0] === undefined) {
    return null;
  }
  const arguments_ = directChildren(argumentLists[0]).filter(
    (child) => child.kind() === "value_argument"
  );
  if (arguments_.length === 0) {
    return [""];
  }
  if (arguments_.length !== 1 || arguments_[0] === undefined) {
    return null;
  }
  const argumentChildren = directChildren(arguments_[0]);
  if (argumentChildren.length === 1 && argumentChildren[0] !== undefined) {
    return staticKotlinSpringPathsFromValue(argumentChildren[0]);
  }
  if (
    argumentChildren.length !== 3 ||
    argumentChildren[0]?.kind() !== "simple_identifier" ||
    (nodeText(argumentChildren[0]) !== "path" && nodeText(argumentChildren[0]) !== "value") ||
    argumentChildren[1]?.kind() !== "=" ||
    argumentChildren[2] === undefined
  ) {
    return null;
  }
  return staticKotlinSpringPathsFromValue(argumentChildren[2]);
}

function staticKotlinSpringRequestMethodValue(
  node: KotlinSyntaxNode,
  imports: ReadonlySet<string>
): RouteMethod | null {
  if (node.kind() !== "navigation_expression") {
    return null;
  }
  const match = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\.([A-Z]+)$/u.exec(
    nodeText(node)
  );
  const owner = match?.[1];
  const methodName = match?.[2];
  const method = methodName === undefined ? undefined : SPRING_REQUEST_METHODS[methodName];
  if (
    owner === undefined ||
    method === undefined ||
    (owner !== SPRING_REQUEST_METHOD_IMPORT &&
      (owner !== "RequestMethod" || !imports.has(SPRING_REQUEST_METHOD_IMPORT)))
  ) {
    return null;
  }
  return method;
}

function staticKotlinSpringRequestMethods(
  node: KotlinSyntaxNode,
  imports: ReadonlySet<string>
): readonly RouteMethod[] | null {
  if (node.kind() !== "collection_literal") {
    return null;
  }
  const values = directChildren(node).filter(
    (child) => child.kind() !== "[" && child.kind() !== "]" && child.kind() !== ","
  );
  if (values.length === 0) {
    return null;
  }
  const methods = values.map((value) => staticKotlinSpringRequestMethodValue(value, imports));
  if (methods.some((method): method is null => method === null)) {
    return null;
  }
  const exactMethods = methods as readonly RouteMethod[];
  return new Set(exactMethods).size === exactMethods.length ? exactMethods : null;
}

/**
 * Retains direct Kotlin method-level `@RequestMapping` routes only when its
 * request-method array has one or more exact enum values. Each exact enum
 * produces one route. The optional path is one positional, `path =`, or
 * `value =` literal; conditions remain outside this static evidence boundary.
 */
function staticKotlinSpringWebRequestMappingRoutes(
  annotation: KotlinSyntaxNode,
  imports: ReadonlySet<string>
): readonly StaticKotlinSpringWebRoute[] | null {
  const invocation = staticKotlinAnnotationInvocation(annotation);
  if (invocation === null) {
    return null;
  }
  const argumentLists = directChildren(invocation).filter((child) => child.kind() === "value_arguments");
  if (argumentLists.length !== 1 || argumentLists[0] === undefined) {
    return null;
  }
  const arguments_ = directChildren(argumentLists[0]).filter(
    (child) => child.kind() === "value_argument"
  );
  if (arguments_.length === 0 || arguments_.length > 2) {
    return null;
  }
  let path = "";
  let hasPath = false;
  let methods: readonly RouteMethod[] | null = null;
  for (const argument of arguments_) {
    const argumentChildren = directChildren(argument);
    if (argumentChildren.length === 1) {
      if (hasPath || argumentChildren[0] === undefined) {
        return null;
      }
      const literal = staticKotlinPlainStringLiteral(argumentChildren[0]);
      if (literal === null) {
        return null;
      }
      path = literal;
      hasPath = true;
      continue;
    }
    if (
      argumentChildren.length !== 3 ||
      argumentChildren[0]?.kind() !== "simple_identifier" ||
      argumentChildren[1]?.kind() !== "=" ||
      argumentChildren[2] === undefined
    ) {
      return null;
    }
    const key = nodeText(argumentChildren[0]);
    const value = argumentChildren[2];
    if (key === "path" || key === "value") {
      if (hasPath) {
        return null;
      }
      const literal = staticKotlinPlainStringLiteral(value);
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
    methods = staticKotlinSpringRequestMethods(value, imports);
    if (methods === null) {
      return null;
    }
  }
  return methods !== null && (path.length === 0 || (path.startsWith("/") && !path.includes("//")))
    ? methods.map((method) => ({
        method,
        path,
        node: annotation,
        ruleId: "framework.spring-web.direct-kotlin-controller.literal-request-mapping.local-function"
      }))
    : null;
}

function staticKotlinAnnotations(node: KotlinSyntaxNode): readonly KotlinSyntaxNode[] {
  const modifiers = directChildren(node).find((child) => child.kind() === "modifiers");
  return modifiers === undefined
    ? []
    : directChildren(modifiers).filter((child) => child.kind() === "annotation");
}

/**
 * A Kotlin Spring controller is accepted only when one direct top-level class
 * has exactly one exact `@RestController` or `@Controller` annotation. Objects,
 * interfaces, aliases, wildcard imports, and ambiguous same-name annotations
 * deliberately cannot establish the route owner.
 */
function staticKotlinSpringWebController(
  declaration: StaticKotlinType,
  imports: ReadonlySet<string>
): boolean {
  if (declaration.kind !== "class" || declaration.isObject) {
    return false;
  }
  const annotations = staticKotlinAnnotations(declaration.node);
  const controllerImports = [SPRING_REST_CONTROLLER_IMPORT, SPRING_CONTROLLER_IMPORT] as const;
  const annotationsNamedController = annotations.filter((annotation) =>
    controllerImports.some((controllerImport) =>
      staticKotlinAnnotationHasExpectedName(annotation, controllerImport)
    )
  );
  const controllers = annotationsNamedController.filter((annotation) =>
    controllerImports.some((controllerImport) =>
      staticKotlinAnnotationMatches(annotation, controllerImport, imports)
    )
  );
  return (
    annotationsNamedController.length === controllers.length &&
    controllers.length === 1
  );
}

function staticKotlinSpringWebClassPrefixes(
  declaration: StaticKotlinType,
  imports: ReadonlySet<string>
): readonly string[] | null {
  const annotations = staticKotlinAnnotations(declaration.node);
  const annotationsNamedRequestMapping = annotations.filter((annotation) =>
    staticKotlinAnnotationHasExpectedName(annotation, SPRING_REQUEST_MAPPING_IMPORT)
  );
  const mappings = annotationsNamedRequestMapping.filter((annotation) =>
    staticKotlinAnnotationMatches(annotation, SPRING_REQUEST_MAPPING_IMPORT, imports)
  );
  if (
    annotationsNamedRequestMapping.length !== mappings.length ||
    mappings.length > 1
  ) {
    return null;
  }
  if (mappings.length === 0) {
    return [""];
  }
  const mapping = mappings[0];
  return mapping === undefined ? null : staticKotlinSpringWebClassPaths(mapping);
}

/**
 * Supports the shortcut surface and separately proven method-level
 * `@RequestMapping(method = [RequestMethod.X, ...])` forms. Broad default
 * method semantics and conditions remain intentionally absent.
 */
function staticKotlinSpringWebMethodRoutes(
  declaration: StaticKotlinFunction,
  imports: ReadonlySet<string>
): readonly StaticKotlinSpringWebRoute[] {
  if (declaration.body === null) {
    return [];
  }
  const annotations = staticKotlinAnnotations(declaration.node);
  const annotationsNamedRequestMapping = annotations.filter((annotation) =>
    staticKotlinAnnotationHasExpectedName(annotation, SPRING_REQUEST_MAPPING_IMPORT)
  );
  const requestMappings = annotationsNamedRequestMapping.filter((annotation) =>
    staticKotlinAnnotationMatches(annotation, SPRING_REQUEST_MAPPING_IMPORT, imports)
  );
  if (annotationsNamedRequestMapping.length !== requestMappings.length) {
    return [];
  }
  if (requestMappings.length > 0) {
    return requestMappings.length === 1 && requestMappings[0] !== undefined
      ? (staticKotlinSpringWebRequestMappingRoutes(requestMappings[0], imports) ?? [])
      : [];
  }
  const annotationsNamedMappings = annotations.filter((annotation) =>
    Object.keys(SPRING_METHOD_MAPPING_IMPORTS).some((mappingImport) =>
      staticKotlinAnnotationHasExpectedName(annotation, mappingImport)
    )
  );
  const mappings = annotationsNamedMappings.flatMap((annotation) => {
    const method = Object.entries(SPRING_METHOD_MAPPING_IMPORTS).find(([mappingImport]) =>
      staticKotlinAnnotationMatches(annotation, mappingImport, imports)
    )?.[1];
    return method === undefined ? [] : [{ annotation, method }];
  });
  if (annotationsNamedMappings.length !== mappings.length || mappings.length !== 1) {
    return [];
  }
  const mapping = mappings[0];
  if (mapping === undefined) {
    return [];
  }
  const path = staticKotlinSpringPath(mapping.annotation);
  return path === null
    ? []
    : [{
        method: mapping.method,
        path,
        node: mapping.annotation,
        ruleId: "framework.spring-web.direct-kotlin-controller.literal-method-mapping.local-function"
      }];
}

function joinHttpPaths(prefix: string, path: string): string {
  const segments = [prefix, path]
    .flatMap((value) => value.split("/"))
    .filter((segment) => segment.length > 0);
  return "/" + segments.join("/");
}

/**
 * Retains one Kotlin regular-string literal prefix from
 * `@ConfigurationProperties("app")` or
 * `@ConfigurationProperties(prefix = "app")`. Aliases, wildcard imports,
 * raw strings, named `value`, multiple attributes, and dynamic expressions
 * deliberately remain outside this static evidence boundary.
 */
function staticKotlinSpringBootConfigurationPropertiesPrefix(
  annotation: KotlinSyntaxNode
): string | null {
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
  let literal: KotlinSyntaxNode | undefined;
  if (argumentChildren.length === 1) {
    literal = argumentChildren[0];
  } else if (
    argumentChildren.length === 3 &&
    argumentChildren[0]?.kind() === "simple_identifier" &&
    nodeText(argumentChildren[0]) === "prefix" &&
    argumentChildren[1]?.kind() === "="
  ) {
    literal = argumentChildren[2];
  } else {
    return null;
  }
  const prefix = literal === undefined ? null : staticKotlinPlainStringLiteral(literal);
  return prefix !== null && SPRING_BOOT_PROPERTIES_KEY.test(prefix) ? prefix : null;
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

/**
 * Retains direct primary-constructor parameter `@Value` annotations on a
 * top-level Kotlin class. Secondary constructors, function parameters,
 * use-site targets, aliases, and dynamic strings stay outside this slice.
 */
function staticKotlinSpringBootConstructorParameterReferences(
  declaration: StaticKotlinType,
  imports: ReadonlySet<string>
): readonly StaticKotlinSpringBootPropertiesReference[] {
  if (declaration.kind !== "class") {
    return [];
  }
  const primaryConstructor = directChildren(declaration.node).find(
    (child) => child.kind() === "primary_constructor"
  );
  if (primaryConstructor === undefined) {
    return [];
  }
  const references: StaticKotlinSpringBootPropertiesReference[] = [];
  for (const parameter of directChildren(primaryConstructor)) {
    if (parameter.kind() !== "class_parameter") {
      continue;
    }
    const modifiers = directChildren(parameter).find((child) => child.kind() === "modifiers");
    if (modifiers === undefined) {
      continue;
    }
    const annotations = directChildren(modifiers).filter((child) => child.kind() === "annotation");
    const annotationsNamedValue = annotations.filter((annotation) => {
      const name = staticKotlinAnnotationName(annotation);
      return name === "Value" || name === SPRING_VALUE_IMPORT;
    });
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

/**
 * Retains direct concrete class-method parameter `@Value` annotations.
 * Top-level functions, abstract declarations, secondary constructors,
 * use-site targets, aliases, and dynamic strings stay outside this slice.
 */
function staticKotlinSpringBootMethodParameterReferences(
  declaration: StaticKotlinType,
  imports: ReadonlySet<string>
): readonly StaticKotlinSpringBootPropertiesReference[] {
  if (declaration.kind !== "class") {
    return [];
  }
  const references: StaticKotlinSpringBootPropertiesReference[] = [];
  for (const method of directChildren(declaration.body)) {
    if (method.kind() !== "function_declaration") {
      continue;
    }
    const hasBody = directChildren(method).some((child) => child.kind() === "function_body");
    if (!hasBody) {
      continue;
    }
    const parameters = directChildren(method).find(
      (child) => child.kind() === "function_value_parameters"
    );
    if (parameters === undefined) {
      continue;
    }
    const parameterChildren = directChildren(parameters);
    for (const [index, modifiers] of parameterChildren.entries()) {
      if (
        modifiers.kind() !== "parameter_modifiers" ||
        parameterChildren[index + 1]?.kind() !== "parameter"
      ) {
        continue;
      }
      const annotations = directChildren(modifiers).filter((child) => child.kind() === "annotation");
      const annotationsNamedValue = annotations.filter((annotation) => {
        const name = staticKotlinAnnotationName(annotation);
        return name === "Value" || name === SPRING_VALUE_IMPORT;
      });
      const valueAnnotations = annotationsNamedValue.filter((annotation) => {
        const name = staticKotlinAnnotationName(annotation);
        return name === SPRING_VALUE_IMPORT || (name === "Value" && imports.has(SPRING_VALUE_IMPORT));
      });
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
      const key = staticKotlinSpringBootPropertiesKey(annotation);
      if (key !== null) {
        references.push({ key, node: annotation });
      }
    }
  }
  return references;
}

/**
 * Retains one direct concrete-method `@Value` annotation only when its method
 * has exactly one parameter and that parameter has no separately proven Spring
 * `@Value`. This keeps method-level and parameter-level injection evidence from
 * producing duplicate or contradictory class-owned configuration facts.
 */
function staticKotlinSpringBootMethodAnnotationReferences(
  declaration: StaticKotlinType,
  imports: ReadonlySet<string>
): readonly StaticKotlinSpringBootPropertiesReference[] {
  if (declaration.kind !== "class") {
    return [];
  }
  const references: StaticKotlinSpringBootPropertiesReference[] = [];
  for (const method of directChildren(declaration.body)) {
    if (method.kind() !== "function_declaration") {
      continue;
    }
    const methodChildren = directChildren(method);
    if (!methodChildren.some((child) => child.kind() === "function_body")) {
      continue;
    }
    const parameters = methodChildren.find(
      (child) => child.kind() === "function_value_parameters"
    );
    if (parameters === undefined) {
      continue;
    }
    const parameterChildren = directChildren(parameters);
    const parameterIndexes = parameterChildren
      .map((child, index) => (child.kind() === "parameter" ? index : -1))
      .filter((index) => index >= 0);
    const parameterIndex = parameterIndexes[0];
    if (parameterIndexes.length !== 1 || parameterIndex === undefined) {
      continue;
    }
    const parameterModifiers = parameterChildren[parameterIndex - 1];
    const parameterHasSpringValue =
      parameterModifiers?.kind() === "parameter_modifiers" &&
      directChildren(parameterModifiers)
        .filter((child) => child.kind() === "annotation")
        .some((annotation) => {
          const name = staticKotlinAnnotationName(annotation);
          return (
            (name === "Value" && imports.has(SPRING_VALUE_IMPORT)) ||
            name === SPRING_VALUE_IMPORT
          );
        });
    if (parameterHasSpringValue) {
      continue;
    }
    const modifiers = methodChildren.find((child) => child.kind() === "modifiers");
    if (modifiers === undefined) {
      continue;
    }
    const annotations = directChildren(modifiers).filter((child) => child.kind() === "annotation");
    const annotationsNamedValue = annotations.filter((annotation) => {
      const name = staticKotlinAnnotationName(annotation);
      return name === "Value" || name === SPRING_VALUE_IMPORT;
    });
    const valueAnnotations = annotationsNamedValue.filter((annotation) => {
      const name = staticKotlinAnnotationName(annotation);
      return name === SPRING_VALUE_IMPORT || (name === "Value" && imports.has(SPRING_VALUE_IMPORT));
    });
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
    const key = staticKotlinSpringBootPropertiesKey(annotation);
    if (key !== null) {
      references.push({ key, node: annotation });
    }
  }
  return references;
}

/**
 * Retains one direct Kotlin top-level-class configuration prefix only after an
 * exact import or fully-qualified annotation proves Spring's type. The shared
 * project resolver fans the fact out to individually unique configuration
 * leaves and keeps profile/source collisions unresolved.
 */
function staticKotlinSpringBootConfigurationPropertiesPrefixReferences(
  declaration: StaticKotlinType,
  imports: ReadonlySet<string>
): readonly StaticKotlinSpringBootConfigurationPropertiesPrefixReference[] {
  if (declaration.kind !== "class" || declaration.isObject) {
    return [];
  }
  const modifiers = directChildren(declaration.node).find((child) => child.kind() === "modifiers");
  if (modifiers === undefined) {
    return [];
  }
  const annotations = directChildren(modifiers).filter((child) => child.kind() === "annotation");
  const annotationsNamedConfigurationProperties = annotations.filter((annotation) => {
    const name = staticKotlinAnnotationName(annotation);
    return name === "ConfigurationProperties" || name === SPRING_CONFIGURATION_PROPERTIES_IMPORT;
  });
  const configurationPropertiesAnnotations = annotationsNamedConfigurationProperties.filter((annotation) => {
    const name = staticKotlinAnnotationName(annotation);
    return (
      name === SPRING_CONFIGURATION_PROPERTIES_IMPORT ||
      (name === "ConfigurationProperties" && imports.has(SPRING_CONFIGURATION_PROPERTIES_IMPORT))
    );
  });
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
  const prefix = staticKotlinSpringBootConfigurationPropertiesPrefix(annotation);
  return prefix === null ? [] : [{ prefix, node: annotation }];
}

/**
 * Retains a configuration prefix on one direct concrete Kotlin `@Bean`
 * function only inside a direct `@Configuration` class. The class, bean
 * function, and properties annotation each require exact import or
 * fully-qualified proof. This models a source-proven factory relationship,
 * not Spring's runtime bean registration or binding result.
 */
function staticKotlinSpringBootBeanConfigurationPropertiesPrefixReferences(
  declaration: StaticKotlinType,
  method: StaticKotlinFunction,
  imports: ReadonlySet<string>
): readonly StaticKotlinSpringBootConfigurationPropertiesPrefixReference[] {
  if (declaration.kind !== "class" || declaration.isObject || method.body === null) {
    return [];
  }
  const typeModifiers = directChildren(declaration.node).find((child) => child.kind() === "modifiers");
  if (typeModifiers === undefined) {
    return [];
  }
  const typeAnnotations = directChildren(typeModifiers).filter((child) => child.kind() === "annotation");
  if (
    staticKotlinExactlyOneProvenAnnotation(typeAnnotations, SPRING_CONFIGURATION_IMPORT, imports) ===
    null
  ) {
    return [];
  }
  const methodModifiers = directChildren(method.node).find((child) => child.kind() === "modifiers");
  if (methodModifiers === undefined) {
    return [];
  }
  const methodAnnotations = directChildren(methodModifiers).filter((child) => child.kind() === "annotation");
  if (staticKotlinExactlyOneProvenAnnotation(methodAnnotations, SPRING_BEAN_IMPORT, imports) === null) {
    return [];
  }
  const annotation = staticKotlinExactlyOneProvenAnnotation(
    methodAnnotations,
    SPRING_CONFIGURATION_PROPERTIES_IMPORT,
    imports
  );
  if (annotation === null) {
    return [];
  }
  const prefix = staticKotlinSpringBootConfigurationPropertiesPrefix(annotation);
  return prefix === null ? [] : [{ prefix, node: annotation }];
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

function isKotlinZeroArgumentCall(call: StaticKotlinCall): boolean {
  const suffixChildren = directChildren(call.suffix);
  const arguments_ = suffixChildren[0];
  return (
    suffixChildren.length === 1 &&
    arguments_?.kind() === "value_arguments" &&
    nodeText(arguments_) === "()"
  );
}

function isKotlinExplicitZeroParameterFunction(functionDeclaration: StaticKotlinFunction): boolean {
  const parameterLists = directChildren(functionDeclaration.node).filter(
    (child) => child.kind() === "function_value_parameters"
  );
  return parameterLists.length === 1 && parameterLists[0] !== undefined && nodeText(parameterLists[0]) === "()";
}

function hasKotlinFunctionParameterNamed(functionDeclaration: StaticKotlinFunction, name: string): boolean {
  const parameters = directChildren(functionDeclaration.node).find(
    (child) => child.kind() === "function_value_parameters"
  );
  return parameters !== undefined && new RegExp(`\\b${name}\\b`, "u").test(nodeText(parameters));
}

function kotlinDirectCalls(body: KotlinSyntaxNode): {
  readonly calls: readonly {
    readonly isZeroArgument: boolean;
    readonly name: string;
    readonly node: KotlinSyntaxNode;
  }[];
  readonly boundNames: ReadonlySet<string>;
  readonly unsafe: boolean;
} {
  const calls: Array<{
    readonly isZeroArgument: boolean;
    readonly name: string;
    readonly node: KotlinSyntaxNode;
  }> = [];
  const boundNames = new Set<string>();
  let unsafe = false;
  const bindingKinds: ReadonlySet<string> = new Set([
    "property_declaration",
    "multi_variable_declaration",
    "for_statement",
    "catch_block"
  ]);
  const collectIdentifiers = (node: KotlinSyntaxNode): void => {
    const name = identifierText(node);
    if (name !== null) {
      boundNames.add(name);
    }
    for (const child of directChildren(node)) {
      collectIdentifiers(child);
    }
  };
  const visit = (node: KotlinSyntaxNode): void => {
    if (node.kind() === "function_declaration" || node.kind() === "lambda_literal") {
      unsafe = true;
      return;
    }
    if (bindingKinds.has(node.kind() as string)) {
      collectIdentifiers(node);
    }
    const call = staticDirectCall(node);
    if (call !== null) {
      calls.push({ isZeroArgument: isKotlinZeroArgumentCall(call), name: call.name, node });
    }
    for (const child of directChildren(node)) {
      visit(child);
    }
  };
  visit(body);
  return { calls, boundNames, unsafe };
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
  const springWebCapability = frameworkCapability("spring-web");
  if (!springWebCapability.languages.includes(input.language)) {
    throw new Error("Kotlin Spring Web extraction was invoked for an unsupported source language.");
  }
  const ktorCapability = frameworkCapability("ktor");
  if (!ktorCapability.languages.includes(input.language)) {
    throw new Error("Ktor framework extraction was invoked for an unsupported source language.");
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

  const root = parse("kotlin", input.sourceText).root();
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const pendingReferences: PendingReference[] = [];
  const jvmTypeFacts: JvmFacts["types"][number][] = [];
  const jvmHeritageReferences: JvmFacts["heritageReferences"][number][] = [];
  const jvmDependencyInjectionReferences: JvmDependencyInjectionReferenceFact[] = [];
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

  function addType(declaration: StaticKotlinType, packageName: string | null): SymbolNode {
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
    if (packageName !== null) {
      jvmTypeFacts.push({ symbolId: symbol.id, packageName });
    }
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

  function addPendingOverrideReference(source: SymbolNode, declaration: StaticKotlinFunction): void {
    const range = rangeForNode(declaration.nameNode);
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
   * Each direct simple-name Kotlin supertype can become an exact edge only
   * when it identifies one compatible type declared in this same file.
   */
  function addExactSameFileSupertypeRelations(
    child: SymbolNode,
    declaration: StaticKotlinType,
    typesByName: ReadonlyMap<string, readonly SymbolNode[]>
  ): void {
    for (const reference of staticKotlinDirectSupertypeReferences(declaration)) {
      if (reference.qualifiedTypePath !== undefined) {
        continue;
      }
      const candidates = (typesByName.get(reference.name) ?? []).filter(
        (symbol) =>
          symbol.id !== child.id && (symbol.kind === "class" || symbol.kind === "interface")
      );
      if (candidates.length !== 1 || candidates[0] === undefined) {
        continue;
      }
      const target = candidates[0];
      const relationKind =
        declaration.kind === "class" && target.kind === "class"
          ? "extends"
          : declaration.kind === "class" && target.kind === "interface"
            ? "implements"
            : declaration.kind === "interface" && target.kind === "interface"
              ? "extends"
              : null;
      if (relationKind === null) {
        continue;
      }
      const ruleId =
        relationKind === "implements"
          ? "syntax.kotlin.same-file.direct-implements"
          : declaration.kind === "interface"
            ? "syntax.kotlin.same-file.direct-interface-extends"
            : "syntax.kotlin.same-file.direct-superclass";
      const range = rangeForNode(reference.node);
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
   * Persists a direct Kotlin supertype. A qualified spelling takes precedence
   * over imports; otherwise the import map has already excluded aliases and
   * wildcards, leaving the project resolver reproducible source evidence rather
   * than a best-effort lookup.
   */
  function addJvmHeritageReference(
    source: SymbolNode,
    reference: StaticKotlinSupertypeReference,
    imports: ReadonlyMap<string, string>
  ): void {
    const importedTypePath =
      reference.qualifiedTypePath === undefined ? imports.get(reference.name) : undefined;
    jvmHeritageReferences.push({
      sourceId: source.id,
      filePath: input.filePath,
      referenceName: reference.name,
      syntax: "kotlin-supertype",
      range: rangeForNode(reference.node),
      ...(importedTypePath === undefined ? {} : { importedTypePath }),
      ...(reference.qualifiedTypePath === undefined
        ? {}
        : { qualifiedTypePath: reference.qualifiedTypePath })
    });
  }

  function addJvmDependencyInjectionReference(
    source: SymbolNode,
    injectionReference: StaticKotlinDependencyInjectionReference,
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
      range: rangeForNode(reference.node),
      ...(importedTypePath === undefined ? {} : { importedTypePath }),
      ...(reference.qualifiedTypePath === undefined
        ? {}
        : { qualifiedTypePath: reference.qualifiedTypePath })
    });
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

  function addFrameworkRoute(
    parent: SymbolNode,
    routeFact: {
      readonly method: RouteMethod;
      readonly path: string;
      readonly node: KotlinSyntaxNode;
    },
    handler: SymbolNode,
    ruleId: string
  ): void {
    const routeName = routeFact.method + " " + routeFact.path;
    const qualifiedName = parent.qualifiedName + "#route:" + routeName;
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

  function addExactSameFileTopLevelFunctionCall(
    caller: SymbolNode,
    callee: SymbolNode,
    name: string,
    node: KotlinSyntaxNode
  ): void {
    const range = rangeForNode(node);
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: name
      }),
      sourceId: caller.id,
      targetId: callee.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: name,
      evidence: {
        ruleId: "syntax.kotlin.same-file.unique-top-level-function-call",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
      }
    });
  }

  if (!hasSyntaxError(root)) {
    const topLevel = directChildren(root);
    const imports = staticDirectImportPaths(root);
    const directImports = staticKotlinDirectImports(root);
    const packageName = staticKotlinPackage(root);
    const topLevelFunctions = topLevel
      .map((node) => staticKotlinFunction(node))
      .filter((candidate): candidate is StaticKotlinFunction => candidate !== null);
    const functionsByName = new Map<string, SymbolNode[]>();
    const typesByName = new Map<string, SymbolNode[]>();
    const declaredTypes: Array<{ declaration: StaticKotlinType; symbol: SymbolNode }> = [];

    for (const declaration of topLevel
      .map((node) => staticKotlinType(node))
      .filter((candidate): candidate is StaticKotlinType => candidate !== null)) {
      const typeSymbol = addType(declaration, packageName);
      const typeCandidates = typesByName.get(declaration.name) ?? [];
      typeCandidates.push(typeSymbol);
      typesByName.set(declaration.name, typeCandidates);
      declaredTypes.push({ declaration, symbol: typeSymbol });
      const springWebPrefixes = staticKotlinSpringWebController(declaration, imports)
        ? staticKotlinSpringWebClassPrefixes(declaration, imports)
        : null;
      for (const reference of staticKotlinSpringBootPropertiesReferences(declaration, imports)) {
        springBootPropertiesValueReferences.push({
          sourceId: typeSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeForNode(reference.node)
        });
      }
      for (const reference of staticKotlinSpringBootConstructorParameterReferences(
        declaration,
        imports
      )) {
        springBootPropertiesValueReferences.push({
          sourceId: typeSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeForNode(reference.node)
        });
      }
      for (const reference of staticKotlinSpringBootMethodParameterReferences(
        declaration,
        imports
      )) {
        springBootPropertiesValueReferences.push({
          sourceId: typeSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeForNode(reference.node)
        });
      }
      for (const reference of staticKotlinSpringBootMethodAnnotationReferences(
        declaration,
        imports
      )) {
        springBootPropertiesValueReferences.push({
          sourceId: typeSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeForNode(reference.node)
        });
      }
      for (const reference of staticKotlinSpringBootConfigurationPropertiesPrefixReferences(
        declaration,
        imports
      )) {
        springBootConfigurationPropertiesPrefixes.push({
          sourceId: typeSymbol.id,
          filePath: input.filePath,
          prefix: reference.prefix,
          range: rangeForNode(reference.node)
        });
      }
      for (const reference of staticKotlinDependencyInjectionReferences(declaration, imports)) {
        addJvmDependencyInjectionReference(typeSymbol, reference, directImports);
      }
      const methods = directChildren(declaration.body)
        .map((node) => staticKotlinFunction(node))
        .filter((candidate): candidate is StaticKotlinFunction => candidate !== null);
      const reactNativeModule = staticKotlinReactNativeModule(
        declaration,
        methods,
        imports
      );
      for (const methodDeclaration of methods) {
        const methodSymbol = addMethod(typeSymbol, methodDeclaration);
        if (declaration.kind === "class" && hasKotlinOverrideModifier(methodDeclaration)) {
          addPendingOverrideReference(methodSymbol, methodDeclaration);
        }
        if (
          reactNativeModule !== null &&
          isKotlinReactNativeMethod(methodDeclaration, imports, reactNativeModule.kind)
        ) {
          reactNativeNativeMethods.push({
            platform: "android",
            moduleName: reactNativeModule.moduleName,
            methodName: methodDeclaration.name,
            methodId: methodSymbol.id,
            filePath: input.filePath,
            range: rangeForNode(methodDeclaration.node),
            ...(reactNativeModule.kind === "codegen-spec"
              ? { implementationKind: "codegen-spec-override" }
              : {})
          });
        }
        for (const reference of staticKotlinSpringBootBeanConfigurationPropertiesPrefixReferences(
          declaration,
          methodDeclaration,
          imports
        )) {
          springBootConfigurationPropertiesPrefixes.push({
            sourceId: methodSymbol.id,
            filePath: input.filePath,
            prefix: reference.prefix,
            range: rangeForNode(reference.node)
          });
        }
        if (springWebPrefixes !== null) {
          const routes = staticKotlinSpringWebMethodRoutes(methodDeclaration, imports);
          for (const springWebPrefix of springWebPrefixes) {
            for (const route of routes) {
              addFrameworkRoute(
                typeSymbol,
                { ...route, path: joinHttpPaths(springWebPrefix, route.path) },
                methodSymbol,
                route.ruleId
              );
            }
          }
        }
      }
    }

    for (const { declaration, symbol } of declaredTypes) {
      addExactSameFileSupertypeRelations(symbol, declaration, typesByName);
      for (const reference of staticKotlinDirectSupertypeReferences(declaration)) {
        addJvmHeritageReference(symbol, reference, directImports);
      }
    }

    const topLevelFunctionSymbols: Array<{
      readonly declaration: StaticKotlinFunction;
      readonly symbol: SymbolNode;
    }> = [];
    for (const functionDeclaration of topLevelFunctions) {
      const symbol = addFunction(functionDeclaration);
      topLevelFunctionSymbols.push({ declaration: functionDeclaration, symbol });
      const candidates = functionsByName.get(functionDeclaration.name) ?? [];
      candidates.push(symbol);
      functionsByName.set(functionDeclaration.name, candidates);
    }

    if (
      !hasKotlinImport(root) &&
      !topLevel.some((node) => node.kind() === "package_header")
    ) {
      for (const caller of topLevelFunctionSymbols) {
        if (caller.declaration.receiverName !== null || caller.declaration.body === null) {
          continue;
        }
        const directCalls = kotlinDirectCalls(caller.declaration.body);
        if (directCalls.unsafe) {
          continue;
        }
        for (const call of directCalls.calls) {
          if (
            !call.isZeroArgument ||
            directCalls.boundNames.has(call.name) ||
            hasKotlinFunctionParameterNamed(caller.declaration, call.name) ||
            typesByName.has(call.name)
          ) {
            continue;
          }
          const candidates = topLevelFunctionSymbols.filter(
            (candidate) => candidate.declaration.name === call.name
          );
          if (
            candidates.length !== 1 ||
            candidates[0] === undefined ||
            candidates[0].declaration.receiverName !== null ||
            !isKotlinExplicitZeroParameterFunction(candidates[0].declaration)
          ) {
            continue;
          }
          addExactSameFileTopLevelFunctionCall(caller.symbol, candidates[0].symbol, call.name, call.node);
        }
      }
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
              addFrameworkRoute(
                fileNode,
                route,
                handler,
                "framework.ktor.direct-application-module.routing.literal-route.callable-reference.local-function"
              );
            }
          }
        }
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
    jvmFacts: {
      types: jvmTypeFacts,
      heritageReferences: jvmHeritageReferences,
      dependencyInjectionReferences: jvmDependencyInjectionReferences
    },
    springBootPropertiesFacts: {
      valueReferences: springBootPropertiesValueReferences,
      configurationPropertiesPrefixes: springBootConfigurationPropertiesPrefixes
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
