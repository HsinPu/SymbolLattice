import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type ClojureCallFact,
  type ClojureCallableFact,
  type ClojureFacts,
  type ClojureHeritageFact,
  type ClojureImportFact,
  type ClojureInstantiationFact,
  type ClojureTypeFact,
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

interface ClojureRawType {
  readonly name: string;
  readonly namespaceName: string;
  readonly declarationKind: "namespace" | "record" | "protocol";
  readonly isExported: boolean;
  readonly implementedProtocols: readonly string[];
  readonly start: number;
  readonly end: number;
}

interface ClojureRawCallable {
  readonly key: string;
  readonly name: string;
  readonly namespaceName: string;
  readonly parameterCount: number;
  readonly parameterTypeNames: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly start: number;
  readonly end: number;
  readonly body: readonly ClojureForm[];
}

interface ClojureRawImport {
  readonly importedNamespace: string;
  readonly alias?: string;
  readonly referredNames?: readonly string[];
  readonly start: number;
  readonly end: number;
}

interface ClojureRawCall {
  readonly sourceKey: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "namespace";
  readonly receiverNamespaceName?: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface ClojureRawInstantiation {
  readonly sourceKey: string;
  readonly typeName: string;
  readonly constructorKind: "arrow" | "map-arrow";
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface ClojureRawHeritage {
  readonly sourceTypeName: string;
  readonly referenceName: string;
  readonly start: number;
  readonly end: number;
}

interface ClojureRawRelationFacts {
  readonly valid: boolean;
  readonly namespaceName: string;
  readonly types: readonly ClojureRawType[];
  readonly callables: readonly ClojureRawCallable[];
  readonly imports: readonly ClojureRawImport[];
  readonly calls: readonly ClojureRawCall[];
  readonly instantiations: readonly ClojureRawInstantiation[];
  readonly heritage: readonly ClojureRawHeritage[];
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

const CLOJURE_UNSUPPORTED_FORMS = new Set([
  "fn",
  "fn*",
  "let",
  "letfn",
  "loop",
  "recur",
  "for",
  "doseq",
  "with-open",
  "binding",
  "case",
  "cond",
  "try",
  "catch",
  "finally",
  "quote",
  "var",
  "set!",
  "swap!",
  "reset!",
  "alter-var-root",
  "eval",
  "apply",
  "resolve",
  "load-string",
  "read-string",
  "reify",
  "proxy",
  "new",
  ".",
  "..",
  "extend-type",
  "extend-protocol",
  "def",
  "defn",
  "defn-",
  "defmacro",
  "defmulti",
  "defmethod",
  "->",
  "->>",
  "as->",
  "some->",
  "some->>",
  "doto",
  "comp",
  "partial",
  "future",
  "go"
]);

const CLOJURE_FORM_KEYWORDS = new Set([
  "ns",
  "defrecord",
  "defprotocol",
  "defn",
  "defn-",
  "if",
  "when",
  "unless",
  "and",
  "or",
  "not",
  "do",
  "true",
  "false",
  "nil"
]);

function emptyClojureRelations(): ClojureRawRelationFacts {
  return { valid: false, namespaceName: "", types: [], callables: [], imports: [], calls: [], instantiations: [], heritage: [] };
}

function isClojureNamespaceName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(?:[.-][A-Za-z0-9_]+)*$/u.test(value);
}

function isClojureQualifiedSymbol(value: string): boolean {
  const parts = value.split("/");
  return parts.length === 2 && parts.every((part) => part.length > 0 && isClojureNamespaceName(part));
}

function isClojureReferredName(value: string): boolean {
  return isDirectSymbol(value) || /^(?:map->|->)[A-Z][A-Za-z0-9_.-]*$/u.test(value);
}

function containsClojureUnsupportedForm(form: ClojureForm): boolean {
  const first = atomValue(childrenOf(form)[0]);
  if (first !== null && CLOJURE_UNSUPPORTED_FORMS.has(first)) {
    return true;
  }
  return childrenOf(form).some(containsClojureUnsupportedForm);
}

function clojureTypeHint(form: ClojureForm | undefined): string | null {
  const value = atomValue(form);
  if (value === null || !value.startsWith("^") || value.length <= 1) {
    return null;
  }
  const typeName = value.slice(1);
  return isClojureNamespaceName(typeName) ? typeName : null;
}

function parseClojureRequireClauses(namespaceForm: ClojureForm): { valid: boolean; imports: ClojureRawImport[] } {
  const imports: ClojureRawImport[] = [];
  for (const clause of childrenOf(namespaceForm).slice(2)) {
    const clauseChildren = childrenOf(clause);
    if (clause.kind !== "list" || atomValue(clauseChildren[0]) !== ":require") {
      continue;
    }
    for (const entry of clauseChildren.slice(1)) {
      if (entry.kind !== "vector") {
        return { valid: false, imports: [] };
      }
      const entryChildren = childrenOf(entry);
      const importedNamespace = atomValue(entryChildren[0]);
      if (importedNamespace === null || !isClojureNamespaceName(importedNamespace)) {
        return { valid: false, imports: [] };
      }
      let alias: string | undefined;
      let referredNames: string[] | undefined;
      for (let index = 1; index < entryChildren.length; index += 1) {
        const option = atomValue(entryChildren[index]);
        if (option === ":as") {
          const candidate = atomValue(entryChildren[index + 1]);
          if (candidate === null || !isClojureNamespaceName(candidate) || alias !== undefined) {
            return { valid: false, imports: [] };
          }
          alias = candidate;
          index += 1;
        } else if (option === ":refer") {
          const target = entryChildren[index + 1];
          if (target?.kind !== "vector" || referredNames !== undefined) {
            return { valid: false, imports: [] };
          }
          const names = childrenOf(target).map(atomValue);
          if (names.some((name) => name === null || !isClojureReferredName(name))) {
            return { valid: false, imports: [] };
          }
          referredNames = names.filter((name): name is string => name !== null);
          index += 1;
        } else {
          return { valid: false, imports: [] };
        }
      }
      imports.push({ importedNamespace, ...(alias === undefined ? {} : { alias }), ...(referredNames === undefined ? {} : { referredNames }), start: entry.start, end: entry.end });
    }
  }
  return { valid: true, imports };
}

function parseClojureDefn(
  form: ClojureForm,
  namespaceName: string,
  ordinal: number
): { callable: ClojureRawCallable | null; calls: ClojureRawCall[]; instantiations: ClojureRawInstantiation[] } {
  const children = childrenOf(form);
  const defnName = atomValue(children[0]);
  if (form.kind !== "list" || (defnName !== "defn" && defnName !== "defn-") || children.length < 4) {
    return { callable: null, calls: [], instantiations: [] };
  }
  let nameIndex = 1;
  let returnTypeName: string | undefined;
  const explicitReturnType = clojureTypeHint(children[nameIndex]);
  if (explicitReturnType !== null) {
    returnTypeName = explicitReturnType;
    nameIndex += 1;
  }
  const name = atomValue(children[nameIndex]);
  if (name === null || !isDirectSymbol(name) || name.startsWith(":") || name.includes("/")) {
    return { callable: null, calls: [], instantiations: [] };
  }
  let parameterIndex = -1;
  for (let index = nameIndex + 1; index < children.length; index += 1) {
    const candidate = children[index];
    if (candidate?.kind === "vector") {
      parameterIndex = index;
      break;
    }
    if (candidate?.kind !== "string" && candidate?.kind !== "map") {
      return { callable: null, calls: [], instantiations: [] };
    }
  }
  const parameterVector = parameterIndex < 0 ? undefined : children[parameterIndex];
  if (parameterVector === undefined) {
    return { callable: null, calls: [], instantiations: [] };
  }
  const parameterTypeNames: string[] = [];
  const parameterChildren = childrenOf(parameterVector);
  for (let index = 0; index < parameterChildren.length; index += 1) {
    const typeHint = clojureTypeHint(parameterChildren[index]);
    if (typeHint !== null) {
      const parameterName = atomValue(parameterChildren[index + 1]);
      if (parameterName === null || !isDirectSymbol(parameterName) || parameterName.startsWith(":")) {
        return { callable: null, calls: [], instantiations: [] };
      }
      parameterTypeNames.push(typeHint);
      index += 1;
      continue;
    }
    const parameterName = atomValue(parameterChildren[index]);
    if (parameterName === null || !isDirectSymbol(parameterName) || parameterName.startsWith(":") || parameterName === "&") {
      return { callable: null, calls: [], instantiations: [] };
    }
  }
  const body = children.slice(parameterIndex + 1);
  if (body.length === 0 || body.some(containsClojureUnsupportedForm)) {
    return { callable: null, calls: [], instantiations: [] };
  }
  const key = `${namespaceName}\u0000${name}\u0000${ordinal}`;
  const callable: ClojureRawCallable = {
    key,
    name,
    namespaceName,
    parameterCount: parameterChildren.filter((child) => clojureTypeHint(child) === null).length,
    parameterTypeNames,
    ...(returnTypeName === undefined ? {} : { returnTypeName }),
    isExported: defnName === "defn",
    start: form.start,
    end: form.end,
    body
  };
  const calls: ClojureRawCall[] = [];
  const instantiations: ClojureRawInstantiation[] = [];
  const visit = (candidate: ClojureForm): void => {
    if (candidate.kind !== "list") {
      for (const child of childrenOf(candidate)) visit(child);
      return;
    }
    const candidateChildren = childrenOf(candidate);
    const callee = atomValue(candidateChildren[0]);
    const isConstructorCallee = callee !== null && /^(?:map->|->)[A-Z][A-Za-z0-9_.-]*$/u.test(callee);
    if (callee !== null && (isDirectSymbol(callee) || isClojureQualifiedSymbol(callee) || isConstructorCallee) && !callee.startsWith(":") && !CLOJURE_FORM_KEYWORDS.has(callee)) {
      const arrowMatch = /^(map->|->)([A-Z][A-Za-z0-9_.-]*)$/u.exec(callee);
      if (arrowMatch?.[2] !== undefined) {
        instantiations.push({ sourceKey: key, typeName: arrowMatch[2], constructorKind: arrowMatch[1] === "map->" ? "map-arrow" : "arrow", argumentCount: candidateChildren.length - 1, start: candidate.start, end: candidate.end });
      } else if (isClojureQualifiedSymbol(callee)) {
        const [receiverNamespaceName, referenceName] = callee.split("/");
        if (receiverNamespaceName !== undefined && referenceName !== undefined && isDirectSymbol(referenceName)) {
          calls.push({ sourceKey: key, referenceName, callKind: "namespace", receiverNamespaceName, argumentCount: candidateChildren.length - 1, start: candidate.start, end: candidate.end });
        }
      } else {
        calls.push({ sourceKey: key, referenceName: callee, callKind: "direct", argumentCount: candidateChildren.length - 1, start: candidate.start, end: candidate.end });
      }
    }
    for (const child of candidateChildren.slice(1)) visit(child);
  };
  for (const bodyForm of body) visit(bodyForm);
  return { callable, calls, instantiations };
}

function parseClojureRelations(sourceText: string): ClojureRawRelationFacts {
  const parsed = parseClojureForms(sourceText);
  if (!parsed.valid || /[#@'`~]/u.test(sourceText) || /\^[^A-Z]/u.test(sourceText) || /\b(?:defmacro|defmulti|defmethod|eval|apply|resolve|reify|proxy|gen-class|ns-unmap|alter-var-root|intern|load-string|read-string)\b/u.test(sourceText)) {
    return emptyClojureRelations();
  }
  const namespaceForms = parsed.forms.filter((form) => staticNamespace(form) !== null);
  if (namespaceForms.length !== 1 || namespaceForms[0] === undefined) {
    return emptyClojureRelations();
  }
  const namespaceForm = namespaceForms[0];
  const namespaceName = staticNamespace(namespaceForm)?.name;
  if (namespaceName === undefined) {
    return emptyClojureRelations();
  }
  const requireResult = parseClojureRequireClauses(namespaceForm);
  if (!requireResult.valid) {
    return emptyClojureRelations();
  }
  const types: ClojureRawType[] = [{ name: namespaceName, namespaceName, declarationKind: "namespace", isExported: true, implementedProtocols: [], start: namespaceForm.start, end: namespaceForm.end }];
  const callables: ClojureRawCallable[] = [];
  const calls: ClojureRawCall[] = [];
  const instantiations: ClojureRawInstantiation[] = [];
  const heritage: ClojureRawHeritage[] = [];
  let callableOrdinal = 0;
  for (const form of parsed.forms) {
    const children = childrenOf(form);
    const head = atomValue(children[0]);
    if (form.kind !== "list" || head === "ns") continue;
    if (head === "defrecord" || head === "defprotocol") {
      const name = atomValue(children[1]);
      if (name === null || !/^[A-Z][A-Za-z0-9_.-]*$/u.test(name)) return emptyClojureRelations();
      if (head === "defrecord" && children[2]?.kind !== "vector") return emptyClojureRelations();
      const implementedProtocols = head === "defrecord"
        ? children.slice(3).filter((child) => child.kind === "atom").map(atomValue).filter((value): value is string => value !== null && isClojureNamespaceName(value))
        : [];
      if (head === "defrecord" && children.slice(3).some((child) => child.kind !== "atom" && child.kind !== "list")) return emptyClojureRelations();
      types.push({ name, namespaceName, declarationKind: head === "defrecord" ? "record" : "protocol", isExported: true, implementedProtocols, start: form.start, end: form.end });
      for (const protocol of implementedProtocols) {
        heritage.push({ sourceTypeName: name, referenceName: protocol, start: form.start, end: form.end });
      }
      continue;
    }
    if (head === "defn" || head === "defn-") {
      const parsedDefn = parseClojureDefn(form, namespaceName, callableOrdinal);
      callableOrdinal += 1;
      if (parsedDefn.callable === null) return emptyClojureRelations();
      callables.push(parsedDefn.callable);
      calls.push(...parsedDefn.calls);
      instantiations.push(...parsedDefn.instantiations);
    }
  }
  return { valid: true, namespaceName, types, callables, imports: requireResult.imports, calls, instantiations, heritage };
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
  const relationFacts = parseClojureRelations(input.sourceText);
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const clojureTypes: ClojureTypeFact[] = [];
  const clojureCallables: ClojureCallableFact[] = [];
  const clojureImports: ClojureImportFact[] = [];
  const clojureCalls: ClojureCallFact[] = [];
  const clojureInstantiations: ClojureInstantiationFact[] = [];
  const clojureHeritage: ClojureHeritageFact[] = [];
  const relationCallableSymbols = new Map<string, SymbolNode>();
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

  function findRelationSymbol(
    qualifiedName: string,
    kind: SymbolNode["kind"],
    start?: number
  ): SymbolNode | undefined {
    return symbols.find((symbol) => {
      if (symbol.qualifiedName !== qualifiedName || symbol.kind !== kind) {
        return false;
      }
      if (start === undefined) {
        return true;
      }
      const range = rangeFor(lineStarts, start, start);
      return symbol.range.start.line === range.start.line && symbol.range.start.column === range.start.column;
    });
  }

  function addClojureType(type: ClojureRawType, namespaceSymbol: SymbolNode | undefined): SymbolNode {
    const kind: SymbolNode["kind"] = type.declarationKind === "protocol" ? "interface" : type.declarationKind === "record" ? "type" : "class";
    const qualifiedName = type.declarationKind === "namespace"
      ? `${input.filePath}#${type.name}`
      : `${input.filePath}#${type.namespaceName}.${type.name}`;
    const existing = findRelationSymbol(qualifiedName, kind, type.start);
    if (existing !== undefined) {
      clojureTypes.push({ symbolId: existing.id, filePath: input.filePath, name: type.name, namespaceName: type.namespaceName, declarationKind: type.declarationKind, isExported: type.isExported, range: existing.range });
      return existing;
    }
    const declarationOrdinal = nextOrdinal(qualifiedName, kind);
    const symbol: SymbolNode = {
      id: createSymbolId({ filePath: input.filePath, qualifiedName, kind, declarationOrdinal }),
      name: type.name,
      qualifiedName,
      kind,
      filePath: input.filePath,
      range: rangeFor(lineStarts, type.start, type.end),
      isExported: type.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(type.declarationKind === "namespace" ? fileNode : namespaceSymbol ?? fileNode, symbol, type.start, type.end);
    clojureTypes.push({ symbolId: symbol.id, filePath: input.filePath, name: type.name, namespaceName: type.namespaceName, declarationKind: type.declarationKind, isExported: type.isExported, range: symbol.range });
    return symbol;
  }

  function addClojureCallable(callable: ClojureRawCallable, namespaceSymbol: SymbolNode | undefined): SymbolNode {
    const qualifiedName = `${input.filePath}#${callable.namespaceName}.${callable.name}`;
    const existing = findRelationSymbol(qualifiedName, "function", callable.start);
    const symbol = existing ?? (() => {
      const declarationOrdinal = nextOrdinal(qualifiedName, "function");
      const created: SymbolNode = {
        id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "function", declarationOrdinal }),
        name: callable.name,
        qualifiedName,
        kind: "function",
        filePath: input.filePath,
        range: rangeFor(lineStarts, callable.start, callable.end),
        isExported: callable.isExported,
        declarationOrdinal
      };
      symbols.push(created);
      addContainment(namespaceSymbol ?? fileNode, created, callable.start, callable.end);
      return created;
    })();
    clojureCallables.push({ symbolId: symbol.id, filePath: input.filePath, name: callable.name, namespaceName: callable.namespaceName, parameterCount: callable.parameterCount, ...(callable.parameterTypeNames.length === 0 ? {} : { parameterTypeNames: callable.parameterTypeNames }), ...(callable.returnTypeName === undefined ? {} : { returnTypeName: callable.returnTypeName }), isExported: callable.isExported, range: symbol.range });
    relationCallableSymbols.set(callable.key, symbol);
    return symbol;
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

  if (relationFacts.valid) {
    const namespaceFact = relationFacts.types.find((type) => type.declarationKind === "namespace");
    const namespaceSymbol = namespaceFact === undefined ? undefined : addClojureType(namespaceFact, undefined);
    const relationTypes = [...relationFacts.types]
      .filter((type) => type.declarationKind !== "namespace")
      .sort((left, right) => left.start - right.start);
    const typeSymbols = new Map<string, SymbolNode[]>();
    for (const type of relationTypes) {
      const symbol = addClojureType(type, namespaceSymbol);
      typeSymbols.set(type.name, [...(typeSymbols.get(type.name) ?? []), symbol]);
    }
    for (const callable of [...relationFacts.callables].sort((left, right) => left.start - right.start)) {
      addClojureCallable(callable, namespaceSymbol);
    }
    for (const imported of relationFacts.imports) {
      clojureImports.push({ sourceId: fileNode.id, filePath: input.filePath, importedNamespace: imported.importedNamespace, ...(imported.alias === undefined ? {} : { alias: imported.alias }), ...(imported.referredNames === undefined ? {} : { referredNames: imported.referredNames }), range: rangeFor(lineStarts, imported.start, imported.end) });
    }
    for (const call of relationFacts.calls) {
      const source = relationCallableSymbols.get(call.sourceKey);
      if (source === undefined) continue;
      clojureCalls.push({ sourceId: source.id, filePath: input.filePath, referenceName: call.referenceName, callKind: call.callKind, ...(call.receiverNamespaceName === undefined ? {} : { receiverNamespaceName: call.receiverNamespaceName }), argumentCount: call.argumentCount, range: rangeFor(lineStarts, call.start, call.end) });
    }
    for (const instantiation of relationFacts.instantiations) {
      const source = relationCallableSymbols.get(instantiation.sourceKey);
      if (source === undefined) continue;
      clojureInstantiations.push({ sourceId: source.id, filePath: input.filePath, typeName: instantiation.typeName, constructorKind: instantiation.constructorKind, argumentCount: instantiation.argumentCount, range: rangeFor(lineStarts, instantiation.start, instantiation.end) });
    }
    for (const heritage of relationFacts.heritage) {
      const source = typeSymbols.get(heritage.sourceTypeName)?.length === 1 ? typeSymbols.get(heritage.sourceTypeName)?.[0] : undefined;
      if (source === undefined) continue;
      clojureHeritage.push({ sourceId: source.id, filePath: input.filePath, sourceTypeName: heritage.sourceTypeName, referenceName: heritage.referenceName, relationKind: "implements", range: rangeFor(lineStarts, heritage.start, heritage.end) });
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
    clojureFacts: {
      namespaceName: relationFacts.namespaceName,
      parserRejected: !relationFacts.valid,
      types: clojureTypes,
      callables: clojureCallables,
      imports: clojureImports,
      calls: clojureCalls,
      instantiations: clojureInstantiations,
      heritage: clojureHeritage
    } satisfies ClojureFacts
  };
}
