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

export interface ClojureExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "clojure";
}

type ClojureTokenKind = "open" | "close" | "atom" | "string";
type ClojureFormKind = "list" | "vector" | "map" | "atom" | "string";

interface ClojureToken {
  readonly kind: ClojureTokenKind;
  readonly value: string | undefined;
  readonly start: number;
  readonly end: number;
  readonly escaped: boolean | undefined;
}

interface ClojureForm {
  readonly kind: ClojureFormKind;
  readonly value: string | undefined;
  readonly start: number;
  readonly end: number;
  readonly escaped: boolean | undefined;
  readonly children: readonly ClojureForm[] | undefined;
}

interface ParsedClojureForms {
  readonly valid: boolean;
  readonly forms: readonly ClojureForm[];
}

interface StaticClojureNamespace {
  readonly name: string;
  readonly form: ClojureForm;
}

interface StaticClojureFunction {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface StaticCompojureRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticClojureFacts {
  readonly valid: boolean;
  readonly namespace: StaticClojureNamespace | null;
  readonly functions: readonly StaticClojureFunction[];
  readonly routes: readonly StaticCompojureRoute[];
}

interface ParsedFormResult {
  readonly form: ClojureForm | null;
  readonly nextIndex: number;
  readonly valid: boolean;
}

const COMPOJURE_METHODS: Readonly<Record<string, RouteMethod>> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS"
};

const COMPOJURE_REFERRED_NAMES = new Set(["defroutes", ...Object.keys(COMPOJURE_METHODS)]);

function isWhitespace(character: string): boolean {
  return /\s/u.test(character) || character === ",";
}

function isDelimiter(character: string): boolean {
  return character === "(" || character === ")" || character === "[" || character === "]" || character === "{" || character === "}";
}

function tokenForDelimiter(character: string): ClojureTokenKind {
  return character === "(" || character === "[" || character === "{" ? "open" : "close";
}

function tokenizeClojure(sourceText: string): { readonly valid: boolean; readonly tokens: readonly ClojureToken[] } {
  const tokens: ClojureToken[] = [];
  let index = 0;

  while (index < sourceText.length) {
    const character = sourceText[index] ?? "";
    if (isWhitespace(character)) {
      index += 1;
      continue;
    }
    if (character === ";") {
      while (index < sourceText.length && sourceText[index] !== "\n") {
        index += 1;
      }
      continue;
    }
    if (isDelimiter(character)) {
      tokens.push({
        kind: tokenForDelimiter(character),
        value: character,
        start: index,
        end: index + 1,
        escaped: undefined
      });
      index += 1;
      continue;
    }
    if (character === '"') {
      const start = index;
      index += 1;
      const valueStart = index;
      let escaped = false;
      let terminated = false;
      while (index < sourceText.length) {
        const current = sourceText[index] ?? "";
        if (current === "\\") {
          escaped = true;
          index += 2;
          continue;
        }
        if (current === '"') {
          tokens.push({
            kind: "string",
            value: sourceText.slice(valueStart, index),
            start,
            end: index + 1,
            escaped
          });
          index += 1;
          terminated = true;
          break;
        }
        index += 1;
      }
      if (!terminated) {
        return { valid: false, tokens: [] };
      }
      continue;
    }

    const start = index;
    while (index < sourceText.length) {
      const current = sourceText[index] ?? "";
      if (isWhitespace(current) || isDelimiter(current) || current === ";" || current === '"') {
        break;
      }
      index += 1;
    }
    if (index === start) {
      return { valid: false, tokens: [] };
    }
    tokens.push({
      kind: "atom",
      value: sourceText.slice(start, index),
      start,
      end: index,
      escaped: undefined
    });
  }

  return { valid: true, tokens };
}

function formKindForOpeningDelimiter(delimiter: string): ClojureFormKind | null {
  if (delimiter === "(") {
    return "list";
  }
  if (delimiter === "[") {
    return "vector";
  }
  if (delimiter === "{") {
    return "map";
  }
  return null;
}

function closingDelimiterFor(openingDelimiter: string): string | null {
  if (openingDelimiter === "(") {
    return ")";
  }
  if (openingDelimiter === "[") {
    return "]";
  }
  if (openingDelimiter === "{") {
    return "}";
  }
  return null;
}

function parseClojureForm(tokens: readonly ClojureToken[], index: number): ParsedFormResult {
  const token = tokens[index];
  if (token === undefined || token.kind === "close") {
    return { form: null, nextIndex: index, valid: false };
  }
  if (token.kind === "atom" || token.kind === "string") {
    return {
      form: {
        kind: token.kind,
        value: token.value,
        start: token.start,
        end: token.end,
        escaped: token.escaped,
        children: undefined
      },
      nextIndex: index + 1,
      valid: true
    };
  }

  const openingDelimiter = token.value;
  const closingDelimiter = openingDelimiter === undefined ? null : closingDelimiterFor(openingDelimiter);
  const kind = openingDelimiter === undefined ? null : formKindForOpeningDelimiter(openingDelimiter);
  if (closingDelimiter === null || kind === null) {
    return { form: null, nextIndex: index, valid: false };
  }
  const children: ClojureForm[] = [];
  let cursor = index + 1;
  while (cursor < tokens.length) {
    const next = tokens[cursor];
    if (next?.kind === "close") {
      if (next.value !== closingDelimiter) {
        return { form: null, nextIndex: cursor, valid: false };
      }
      return {
        form: {
          kind,
          value: undefined,
          start: token.start,
          end: next.end,
          escaped: undefined,
          children
        },
        nextIndex: cursor + 1,
        valid: true
      };
    }
    const parsed = parseClojureForm(tokens, cursor);
    if (!parsed.valid || parsed.form === null || parsed.nextIndex <= cursor) {
      return { form: null, nextIndex: cursor, valid: false };
    }
    children.push(parsed.form);
    cursor = parsed.nextIndex;
  }
  return { form: null, nextIndex: cursor, valid: false };
}

function parseClojureForms(sourceText: string): ParsedClojureForms {
  const tokenized = tokenizeClojure(sourceText);
  if (!tokenized.valid) {
    return { valid: false, forms: [] };
  }
  const forms: ClojureForm[] = [];
  let index = 0;
  while (index < tokenized.tokens.length) {
    const parsed = parseClojureForm(tokenized.tokens, index);
    if (!parsed.valid || parsed.form === null || parsed.nextIndex <= index) {
      return { valid: false, forms: [] };
    }
    forms.push(parsed.form);
    index = parsed.nextIndex;
  }
  return { valid: true, forms };
}

function childrenOf(form: ClojureForm): readonly ClojureForm[] {
  return form.children ?? [];
}

function atomValue(form: ClojureForm | undefined): string | null {
  return form?.kind === "atom" && form.value !== undefined ? form.value : null;
}

function unescapedStringValue(form: ClojureForm | undefined): string | null {
  return form?.kind === "string" && form.value !== undefined && form.escaped === false ? form.value : null;
}

function isDirectSymbol(value: string): boolean {
  return /^[A-Za-z_*!?+<>=.$%&][A-Za-z0-9_*!?+<>=.$%&'-]*$/u.test(value);
}

function isStaticRoutePath(value: string): boolean {
  return value.startsWith("/") && !value.includes("\r") && !value.includes("\n");
}

function staticNamespace(form: ClojureForm): StaticClojureNamespace | null {
  const children = childrenOf(form);
  const namespaceName = atomValue(children[1]);
  if (form.kind !== "list" || atomValue(children[0]) !== "ns" || namespaceName === null || !isDirectSymbol(namespaceName)) {
    return null;
  }
  return { name: namespaceName, form };
}

function directReferredCompojureNames(namespaceForm: ClojureForm): ReadonlySet<string> | null {
  const clauses = childrenOf(namespaceForm).slice(2);
  const requireClauses = clauses.filter(
    (clause) => clause.kind === "list" && atomValue(childrenOf(clause)[0]) === ":require"
  );
  const compojureEntries = requireClauses
    .flatMap((clause) => childrenOf(clause).slice(1))
    .filter((entry) => entry.kind === "vector")
    .filter((entry) => atomValue(childrenOf(entry)[0]) === "compojure.core");
  if (compojureEntries.length !== 1) {
    return null;
  }
  const entryChildren = childrenOf(compojureEntries[0] as ClojureForm);
  for (let index = 1; index < entryChildren.length; index += 1) {
    if (atomValue(entryChildren[index]) !== ":refer") {
      continue;
    }
    const target = entryChildren[index + 1];
    if (atomValue(target) === ":all") {
      return new Set(COMPOJURE_REFERRED_NAMES);
    }
    if (target?.kind !== "vector") {
      return null;
    }
    const names = childrenOf(target).map(atomValue);
    if (names.some((name) => name === null)) {
      return null;
    }
    return new Set(names.filter((name): name is string => name !== null));
  }
  return null;
}

function staticClojureFunction(form: ClojureForm): StaticClojureFunction | null {
  const children = childrenOf(form);
  const name = atomValue(children[1]);
  if (
    form.kind !== "list" ||
    atomValue(children[0]) !== "defn" ||
    name === null ||
    !isDirectSymbol(name) ||
    children[2]?.kind !== "vector" ||
    children.length < 4
  ) {
    return null;
  }
  return { name, start: form.start, end: form.end };
}

function staticCompojureRoute(
  form: ClojureForm,
  referredNames: ReadonlySet<string>
): StaticCompojureRoute | null {
  const children = childrenOf(form);
  const macroName = atomValue(children[0]);
  const method = macroName === null || !referredNames.has(macroName) ? undefined : COMPOJURE_METHODS[macroName];
  const path = unescapedStringValue(children[1]);
  const handlerName = atomValue(children[3]);
  if (
    form.kind !== "list" ||
    method === undefined ||
    path === null ||
    !isStaticRoutePath(path) ||
    children[2]?.kind !== "vector" ||
    handlerName === null ||
    !isDirectSymbol(handlerName) ||
    children.length !== 4
  ) {
    return null;
  }
  return { method, path, handlerName, start: form.start, end: form.end };
}

function staticCompojureRoutes(
  forms: readonly ClojureForm[],
  referredNames: ReadonlySet<string>
): readonly StaticCompojureRoute[] {
  if (!referredNames.has("defroutes")) {
    return [];
  }
  const routes: StaticCompojureRoute[] = [];
  for (const form of forms) {
    const children = childrenOf(form);
    const routeSetName = atomValue(children[1]);
    if (
      form.kind !== "list" ||
      atomValue(children[0]) !== "defroutes" ||
      routeSetName === null ||
      !isDirectSymbol(routeSetName)
    ) {
      continue;
    }
    for (const child of children.slice(2)) {
      const route = staticCompojureRoute(child, referredNames);
      if (route !== null) {
        routes.push(route);
      }
    }
  }
  return routes;
}

function staticClojureFacts(sourceText: string): StaticClojureFacts {
  const parsed = parseClojureForms(sourceText);
  if (!parsed.valid) {
    return { valid: false, namespace: null, functions: [], routes: [] };
  }
  const namespaces = parsed.forms
    .map(staticNamespace)
    .filter((candidate): candidate is StaticClojureNamespace => candidate !== null);
  if (namespaces.length !== 1) {
    return { valid: true, namespace: null, functions: [], routes: [] };
  }
  const namespace = namespaces[0] as StaticClojureNamespace;
  const referredNames = directReferredCompojureNames(namespace.form);
  return {
    valid: true,
    namespace,
    functions: parsed.forms
      .map(staticClojureFunction)
      .filter((candidate): candidate is StaticClojureFunction => candidate !== null),
    routes: referredNames === null ? [] : staticCompojureRoutes(parsed.forms, referredNames)
  };
}

function lineStartsFor(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText.charCodeAt(index) === 13) {
      if (sourceText.charCodeAt(index + 1) === 10) {
        index += 1;
      }
      starts.push(index + 1);
    } else if (sourceText.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function positionFor(lineStarts: readonly number[], offset: number): SourcePosition {
  let lower = 0;
  let upper = lineStarts.length - 1;
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const start = lineStarts[middle] ?? 0;
    const nextStart = lineStarts[middle + 1];
    if (offset < start) {
      upper = middle - 1;
    } else if (nextStart !== undefined && offset >= nextStart) {
      lower = middle + 1;
    } else {
      return { line: middle + 1, column: offset - start + 1 };
    }
  }
  const fallbackIndex = Math.max(0, Math.min(lineStarts.length - 1, lower));
  const fallbackStart = lineStarts[fallbackIndex] ?? 0;
  return { line: fallbackIndex + 1, column: Math.max(1, offset - fallbackStart + 1) };
}

function rangeFor(lineStarts: readonly number[], start: number, end: number): SourceRange {
  return {
    start: positionFor(lineStarts, start),
    end: positionFor(lineStarts, Math.max(start, end))
  };
}

/**
 * Extracts direct Clojure namespace/functions and a narrow Compojure route subset.
 * Exact routes require a direct compojure.core refer proof and a unique same-file defn.
 */
export function extractClojureFileFacts(input: ClojureExtractFileFactsInput): ArtifactFacts {
  const compojureCapability = frameworkCapability("compojure");
  if (!compojureCapability.languages.includes(input.language)) {
    throw new Error("Compojure extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticClojureFacts(input.sourceText);
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

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = qualifiedName + "\u0000" + kind;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(parent: SymbolNode, child: SymbolNode, from: number, to: number): void {
    const range = rangeFor(lineStarts, from, to);
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

  function addNamespace(namespaceFact: StaticClojureNamespace): SymbolNode {
    const qualifiedName = input.filePath + "#" + namespaceFact.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: namespaceFact.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range: rangeFor(lineStarts, namespaceFact.form.start, namespaceFact.form.end),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, namespaceFact.form.start, namespaceFact.form.end);
    return symbol;
  }

  function addFunction(parent: SymbolNode, functionFact: StaticClojureFunction): SymbolNode {
    const qualifiedName = parent.qualifiedName + "." + functionFact.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "function");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "function",
        declarationOrdinal
      }),
      name: functionFact.name,
      qualifiedName,
      kind: "function",
      filePath: input.filePath,
      range: rangeFor(lineStarts, functionFact.start, functionFact.end),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, functionFact.start, functionFact.end);
    return symbol;
  }

  function addCompojureRoute(
    parent: SymbolNode,
    namespaceFact: StaticClojureNamespace,
    routeFact: StaticCompojureRoute,
    handler: SymbolNode | null
  ): void {
    const routeName = routeFact.method + " " + routeFact.path;
    const qualifiedName = parent.qualifiedName + "#route:" + routeName;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
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
    addContainment(parent, route, routeFact.start, routeFact.end);
    const referenceName = namespaceFact.name + "/" + routeFact.handlerName;
    edges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: handler?.id ?? null,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName
      }),
      sourceId: route.id,
      targetId: handler?.id ?? null,
      kind: "routes",
      filePath: input.filePath,
      range,
      resolution: handler === null ? "unresolved" : "exact",
      confidence: handler === null ? 0 : 1,
      referenceName,
      evidence: {
        ruleId:
          handler === null
            ? "framework.compojure.direct-defroutes.literal-verb.unresolved-function"
            : "framework.compojure.direct-defroutes.literal-verb.local-function",
        stage: "syntax",
        candidateSymbolIds: handler === null ? [] : [handler.id]
      }
    });
  }

  if (staticFacts.valid && staticFacts.namespace !== null) {
    const namespaceSymbol = addNamespace(staticFacts.namespace);
    const functionsByName = new Map<string, SymbolNode[]>();
    for (const functionFact of [...staticFacts.functions].sort((left, right) => left.start - right.start)) {
      const symbol = addFunction(namespaceSymbol, functionFact);
      functionsByName.set(functionFact.name, [...(functionsByName.get(functionFact.name) ?? []), symbol]);
    }
    for (const routeFact of [...staticFacts.routes].sort((left, right) => left.start - right.start)) {
      const candidates = functionsByName.get(routeFact.handlerName) ?? [];
      addCompojureRoute(
        namespaceSymbol,
        staticFacts.namespace,
        routeFact,
        candidates.length === 1 ? candidates[0] ?? null : null
      );
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
