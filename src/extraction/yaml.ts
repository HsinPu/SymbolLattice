import { isMap, isScalar, parseAllDocuments, parseDocument } from "yaml";

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

export interface YamlExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "yaml";
}

interface YamlDeclaration {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface YamlScalarSource {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

interface StaticDrupalRoute {
  readonly path: string;
  readonly methods: readonly RouteMethod[];
  readonly controller: string;
  readonly start: number;
  readonly end: number;
}

const DRUPAL_ROUTING_FILE = /\.routing\.ya?ml$/iu;
const SPRING_BOOT_YAML_FILE = /^(application|bootstrap)(?:-[A-Za-z0-9_.-]+)?\.ya?ml$/iu;
const SPRING_BOOT_YAML_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const DRUPAL_CONTROLLER =
  /^\\Drupal\\(?:[A-Za-z_][A-Za-z0-9_]*\\)+[A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*$/u;
const DRUPAL_HTTP_METHODS: Readonly<Record<string, RouteMethod>> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
  TRACE: "TRACE",
  CONNECT: "CONNECT"
};

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
  let upper = lineStarts.length - 1;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) {
      lower = middle;
    } else {
      upper = middle - 1;
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

function scalarSource(sourceText: string, node: unknown): YamlScalarSource | null {
  if (
    !isScalar(node) ||
    typeof node.value !== "string" ||
    node.value.length === 0 ||
    node.anchor !== undefined ||
    node.tag !== undefined ||
    node.range === undefined ||
    node.range === null
  ) {
    return null;
  }
  const start = node.range[0];
  const end = node.range[1];
  const source = sourceText.slice(start, end);
  return source.includes("\r") || source.includes("\n")
    ? null
    : { value: node.value, start, end };
}

/**
 * Returns a source-ranged, single-line scalar without retaining its value.
 * Spring configuration values can contain secrets, so only the key's source
 * range is ever emitted as graph data. YAML scalar values may be strings,
 * numbers, or booleans; explicit nulls, anchors, tags, and multiline scalars
 * remain outside this proof.
 */
function scalarRange(sourceText: string, node: unknown): Pick<YamlScalarSource, "start" | "end"> | null {
  if (
    !isScalar(node) ||
    node.value === null ||
    node.anchor !== undefined ||
    node.tag !== undefined ||
    node.range === undefined ||
    node.range === null
  ) {
    return null;
  }
  const start = node.range[0];
  const end = node.range[1];
  const source = sourceText.slice(start, end);
  return source.includes("\r") || source.includes("\n") ? null : { start, end };
}

function plainMap(node: unknown): boolean {
  return isMap(node) && node.anchor === undefined && node.tag === undefined;
}

function directMapValue(map: unknown, sourceText: string, key: string): unknown | undefined {
  if (!isMap(map) || !plainMap(map)) {
    return undefined;
  }
  const matches = map.items.filter((pair) => scalarSource(sourceText, pair.key)?.value === key);
  return matches.length === 1 ? matches[0]?.value : undefined;
}

function staticDrupalMethods(route: unknown, sourceText: string): readonly RouteMethod[] | null {
  const requirements = directMapValue(route, sourceText, "requirements");
  if (requirements === undefined) {
    return ["ALL"];
  }
  if (!plainMap(requirements)) {
    return null;
  }
  const methodNode = directMapValue(requirements, sourceText, "_method");
  if (methodNode === undefined) {
    return ["ALL"];
  }
  const methodSource = scalarSource(sourceText, methodNode);
  if (methodSource === null) {
    return null;
  }
  const methods = methodSource.value.split("|").map((method) => DRUPAL_HTTP_METHODS[method]);
  if (methods.length === 0 || methods.some((method) => method === undefined)) {
    return null;
  }
  const resolved = methods.filter((method): method is RouteMethod => method !== undefined);
  return new Set(resolved).size === resolved.length ? resolved : null;
}

/**
 * Retains direct static Drupal controller routes from a valid routing YAML file.
 * The route target remains explicit-but-unresolved because PHP namespace and
 * service resolution are deliberately outside this file-local YAML slice.
 */
function staticDrupalRoutes(filePath: string, sourceText: string): readonly StaticDrupalRoute[] {
  if (!DRUPAL_ROUTING_FILE.test(filePath)) {
    return [];
  }
  try {
    const document = parseDocument(sourceText, { prettyErrors: false });
    if (document.errors.length > 0 || !isMap(document.contents) || !plainMap(document.contents)) {
      return [];
    }
    const routes: StaticDrupalRoute[] = [];
    for (const pair of document.contents.items) {
      const routeName = scalarSource(sourceText, pair.key);
      if (
        routeName === null ||
        !isMap(pair.value) ||
        !plainMap(pair.value) ||
        pair.value.range === undefined ||
        pair.value.range === null
      ) {
        continue;
      }
      const path = scalarSource(sourceText, directMapValue(pair.value, sourceText, "path"));
      const defaults = directMapValue(pair.value, sourceText, "defaults");
      const controller = scalarSource(sourceText, directMapValue(defaults, sourceText, "_controller"));
      const methods = staticDrupalMethods(pair.value, sourceText);
      if (
        path === null ||
        !path.value.startsWith("/") ||
        controller === null ||
        !DRUPAL_CONTROLLER.test(controller.value) ||
        methods === null
      ) {
        continue;
      }
      routes.push({
        path: path.value,
        methods,
        controller: controller.value,
        start: routeName.start,
        end: pair.value.range[2]
      });
    }
    return routes;
  } catch {
    return [];
  }
}

/**
 * Retains only a parsed single-document top-level mapping pair when both its
 * key and value are source-ranged, untagged, unanchored scalars on one line.
 * Nested YAML remains outside generic declaration extraction. A separate,
 * narrowly defined Drupal routing pass may inspect its own nested route shape.
 */
function staticYamlDeclarations(sourceText: string): readonly YamlDeclaration[] {
  try {
    const document = parseDocument(sourceText, { prettyErrors: false });
    if (document.errors.length > 0 || !isMap(document.contents)) {
      return [];
    }

    const declarations: YamlDeclaration[] = [];
    for (const pair of document.contents.items) {
      if (
        !isScalar(pair.key) ||
        typeof pair.key.value !== "string" ||
        pair.key.value.length === 0 ||
        pair.key.anchor !== undefined ||
        pair.key.tag !== undefined ||
        !isScalar(pair.value) ||
        pair.value.value === null ||
        pair.value.anchor !== undefined ||
        pair.value.tag !== undefined ||
        pair.key.range === undefined ||
        pair.value.range === undefined
      ) {
        continue;
      }

      const start = pair.key.range[0];
      const end = pair.value.range[1];
      const source = sourceText.slice(start, end);
      if (source.includes("\r") || source.includes("\n")) {
        continue;
      }
      declarations.push({ name: pair.key.value, start, end });
    }
    return declarations;
  } catch {
    return [];
  }
}

/**
 * Retains only literal Spring Boot configuration leaf keys from conventional
 * application/bootstrap YAML files. Every ancestor must be an untagged,
 * unanchored mapping; sequences, aliases, tags, nulls, and multiline scalars
 * are deliberately excluded. The graph stores dotted key identities and key
 * ranges only, never configuration values.
 */
function staticSpringBootYamlDeclarations(
  filePath: string,
  sourceText: string
): readonly YamlDeclaration[] {
  const fileName = filePath.split(/[\\/]/u).at(-1) ?? filePath;
  if (!SPRING_BOOT_YAML_FILE.test(fileName)) {
    return [];
  }
  try {
    const documents = parseAllDocuments(sourceText, { prettyErrors: false });
    if (documents.length !== 1) {
      return [];
    }
    const document = documents[0];
    if (document === undefined || document.errors.length > 0 || !plainMap(document.contents)) {
      return [];
    }

    const declarations: YamlDeclaration[] = [];
    const visit = (mapping: unknown, ancestors: readonly string[]): void => {
      if (!isMap(mapping) || !plainMap(mapping)) {
        return;
      }
      for (const pair of mapping.items) {
        const key = scalarSource(sourceText, pair.key);
        if (key === null) {
          continue;
        }
        const path = [...ancestors, key.value];
        const dottedKey = path.join(".");
        if (!SPRING_BOOT_YAML_KEY.test(dottedKey)) {
          continue;
        }
        if (plainMap(pair.value)) {
          visit(pair.value, path);
          continue;
        }
        const value = scalarRange(sourceText, pair.value);
        if (value !== null) {
          declarations.push({ name: dottedKey, start: key.start, end: key.end });
        }
      }
    };
    visit(document.contents, []);
    return declarations;
  } catch {
    return [];
  }
}

/**
 * Extracts source-proven YAML file and top-level scalar mapping-key symbols.
 * It intentionally excludes nested mappings/sequences, aliases, anchors,
 * tags, multi-document streams, imports, calls, and runtime configuration
 * semantics. Drupal routing YAML is the explicit framework-specific exception.
 */
export function extractYamlFileFacts(input: YamlExtractFileFactsInput): ArtifactFacts {
  const drupalCapability = frameworkCapability("drupal");
  if (!drupalCapability.languages.includes(input.language)) {
    throw new Error("Drupal framework extraction was invoked for an unsupported source language.");
  }
  const springBootPropertiesCapability = frameworkCapability("spring-boot-properties");
  if (!springBootPropertiesCapability.languages.includes(input.language)) {
    throw new Error("Spring Boot YAML extraction was invoked for an unsupported source language.");
  }
  const declarations = staticYamlDeclarations(input.sourceText);
  const springBootYamlDeclarations = staticSpringBootYamlDeclarations(input.filePath, input.sourceText);
  const drupalRoutes = staticDrupalRoutes(input.filePath, input.sourceText);
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
    range: rangeFor(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  symbols.push(fileNode);

  for (const declaration of declarations) {
    const qualifiedName = `${fileNode.qualifiedName}#yaml-key:${declaration.name}`;
    const identity = `${qualifiedName}\u0000variable`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, declaration.start, declaration.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "variable",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "variable",
      filePath: input.filePath,
      range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(symbol);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: symbol.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: symbol.name
      }),
      sourceId: fileNode.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: symbol.name,
      evidence: {
        ruleId: "syntax.yaml.top-level-scalar-mapping",
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
  }

  for (const declaration of springBootYamlDeclarations) {
    const qualifiedName = `${fileNode.qualifiedName}#spring-boot-yaml-key:${declaration.name}`;
    const identity = `${qualifiedName}\u0000variable`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const range = rangeFor(lineStarts, declaration.start, declaration.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "variable",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "variable",
      filePath: input.filePath,
      range,
      isExported: false,
      declarationOrdinal
    };
    symbols.push(symbol);
    edges.push({
      id: createEdgeId({
        sourceId: fileNode.id,
        targetId: symbol.id,
        kind: "contains",
        line: range.start.line,
        column: range.start.column,
        referenceName: symbol.name
      }),
      sourceId: fileNode.id,
      targetId: symbol.id,
      kind: "contains",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: symbol.name,
      evidence: {
        ruleId: "framework.spring-boot.yaml.literal-nested-scalar-key",
        stage: "syntax",
        candidateSymbolIds: [symbol.id]
      }
    });
  }

  for (const routeFact of drupalRoutes) {
    for (const method of routeFact.methods) {
      const routeName = `${method} ${routeFact.path}`;
      const qualifiedName = `${fileNode.qualifiedName}#route:${routeName}`;
      const identity = `${qualifiedName}\u0000route`;
      const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
      declarationOrdinals.set(identity, declarationOrdinal + 1);
      const range = rangeFor(lineStarts, routeFact.start, routeFact.end);
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
      edges.push({
        id: createEdgeId({
          sourceId: fileNode.id,
          targetId: route.id,
          kind: "contains",
          line: range.start.line,
          column: range.start.column,
          referenceName: route.name
        }),
        sourceId: fileNode.id,
        targetId: route.id,
        kind: "contains",
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName: route.name,
        evidence: {
          ruleId: "framework.drupal.routing-yaml.literal-controller.route-node",
          stage: "syntax",
          candidateSymbolIds: [route.id]
        }
      });
      edges.push({
        id: createEdgeId({
          sourceId: route.id,
          targetId: null,
          kind: "routes",
          line: range.start.line,
          column: range.start.column,
          referenceName: routeFact.controller
        }),
        sourceId: route.id,
        targetId: null,
        kind: "routes",
        filePath: input.filePath,
        range,
        resolution: "unresolved",
        confidence: 0,
        referenceName: routeFact.controller,
        evidence: {
          ruleId: "framework.drupal.routing-yaml.literal-controller.unresolved-controller-method",
          stage: "syntax",
          candidateSymbolIds: []
        }
      });
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
    reExportBindings: []
  };
}
