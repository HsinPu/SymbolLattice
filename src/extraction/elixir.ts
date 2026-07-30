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

export interface ElixirExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "elixir";
}

type PhoenixRouteMethod = Extract<
  RouteMethod,
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE" | "CONNECT"
>;
type ElixirBlockKind = "module" | "scope" | "function" | "other";

interface ElixirLine {
  readonly code: string;
  readonly start: number;
  readonly end: number;
}

interface ElixirBlockFrame {
  readonly kind: ElixirBlockKind;
  readonly start: number;
  readonly moduleName?: string;
  readonly scopePath?: string;
  readonly functionName?: string;
  readonly isExported?: boolean;
}

interface StaticElixirModule {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface StaticElixirMethod {
  readonly moduleName: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly isExported: boolean;
}

interface StaticPhoenixRoute {
  readonly method: PhoenixRouteMethod;
  readonly path: string;
  readonly controller: string;
  readonly action: string;
  readonly start: number;
  readonly end: number;
}

interface ElixirStaticFacts {
  readonly valid: boolean;
  readonly modules: readonly StaticElixirModule[];
  readonly methods: readonly StaticElixirMethod[];
  readonly routes: readonly StaticPhoenixRoute[];
}

const PHOENIX_ROUTE_METHODS: ReadonlyMap<string, PhoenixRouteMethod> = new Map([
  ["get", "GET"],
  ["post", "POST"],
  ["put", "PUT"],
  ["patch", "PATCH"],
  ["delete", "DELETE"],
  ["head", "HEAD"],
  ["options", "OPTIONS"],
  ["trace", "TRACE"],
  ["connect", "CONNECT"]
]);

const ELIXIR_MODULE = "[A-Z][A-Za-z0-9_]*(?:\\.[A-Z][A-Za-z0-9_]*)*";
const ELIXIR_FUNCTION = "[a-z_][A-Za-z0-9_?!]*";
const DIRECT_MODULE_PATTERN = new RegExp(`^\\s*defmodule\\s+(${ELIXIR_MODULE})\\s+do\\s*$`, "u");
const DIRECT_SCOPE_PATTERN = new RegExp(
  `^\\s*scope\\s+"(\\/[^"\\\\\\s]*)"(?:\\s*,\\s*${ELIXIR_MODULE})?\\s+do\\s*$`,
  "u"
);
const DIRECT_FUNCTION_PATTERN = new RegExp(
  `^\\s*(def|defp)\\s+(${ELIXIR_FUNCTION})\\s*\\([^()]*\\)\\s+do\\s*$`,
  "u"
);
const DIRECT_PHOENIX_USE_PATTERN = /^\s*use\s+Phoenix\.Router(?:\s*,\s*helpers:\s*false)?\s*$/u;
const DIRECT_ROUTE_PATTERN = new RegExp(
  `^\\s*(${[...PHOENIX_ROUTE_METHODS.keys()].join("|")})\\s+"(\\/[^"\\\\\\s]*)"\\s*,\\s*(${ELIXIR_MODULE})\\s*,\\s*:(${ELIXIR_FUNCTION})\\s*$`,
  "u"
);

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
    if ((lineStarts[middle] ?? 0) <= offset) {
      lower = middle;
    } else {
      upper = middle;
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

function maskedCharacter(character: string): string {
  return character === "\r" || character === "\n" ? character : " ";
}

/**
 * Replaces comments and heredoc contents with spaces while preserving offsets.
 * Normal string/charlist contents remain because static Phoenix paths are quoted
 * text. Unterminated quoted input fails the entire lexical pass closed.
 */
function sanitizeElixirSource(sourceText: string): string | null {
  const output: string[] = [];
  let index = 0;
  let quote: '"' | "'" | null = null;
  let heredocQuote: '"' | "'" | null = null;

  while (index < sourceText.length) {
    const character = sourceText[index] ?? "";
    if (heredocQuote !== null) {
      const delimiter = heredocQuote.repeat(3);
      if (sourceText.startsWith(delimiter, index)) {
        output.push(" ", " ", " ");
        index += 3;
        heredocQuote = null;
        continue;
      }
      output.push(maskedCharacter(character));
      index += 1;
      continue;
    }

    if (quote !== null) {
      output.push(character);
      if (character === "\\") {
        const escaped = sourceText[index + 1];
        if (escaped !== undefined) {
          output.push(escaped);
          index += 2;
          continue;
        }
      } else if (character === quote) {
        quote = null;
      } else if (character === "\r" || character === "\n") {
        return null;
      }
      index += 1;
      continue;
    }

    if (sourceText.startsWith('"""', index)) {
      output.push(" ", " ", " ");
      index += 3;
      heredocQuote = '"';
      continue;
    }
    if (sourceText.startsWith("'''", index)) {
      output.push(" ", " ", " ");
      index += 3;
      heredocQuote = "'";
      continue;
    }
    if (character === '"' || character === "'") {
      output.push(character);
      quote = character;
      index += 1;
      continue;
    }
    if (character === "#") {
      while (index < sourceText.length) {
        const commentCharacter = sourceText[index] ?? "";
        if (commentCharacter === "\r" || commentCharacter === "\n") {
          break;
        }
        output.push(" ");
        index += 1;
      }
      continue;
    }
    output.push(character);
    index += 1;
  }

  return quote === null && heredocQuote === null ? output.join("") : null;
}

function linesFor(sourceText: string, sanitized: string): readonly ElixirLine[] {
  const lines: ElixirLine[] = [];
  let start = 0;
  for (let index = 0; index <= sourceText.length; index += 1) {
    const character = sourceText[index];
    if (index !== sourceText.length && character !== "\r" && character !== "\n") {
      continue;
    }
    lines.push({ code: sanitized.slice(start, index), start, end: index });
    if (character === "\r" && sourceText[index + 1] === "\n") {
      index += 1;
    }
    start = index + 1;
  }
  return lines;
}

function staticLiteralPath(path: string, allowRoot: boolean): string | null {
  if (!path.startsWith("/") || path.includes("//") || path.includes("\\") || /\s/u.test(path)) {
    return null;
  }
  if (path === "/") {
    return allowRoot ? path : null;
  }
  return path.endsWith("/") ? null : path;
}

function joinPaths(prefixes: readonly string[], path: string): string {
  const parts = [...prefixes, path].filter((part) => part !== "/");
  return parts.length === 0 ? "/" : `/${parts.map((part) => part.slice(1)).join("/")}`;
}

function nearestModule(stack: readonly ElixirBlockFrame[]): string | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const candidate = stack[index];
    if (candidate?.kind === "module") {
      return candidate.moduleName ?? null;
    }
  }
  return null;
}

function isDirectModuleBody(stack: readonly ElixirBlockFrame[]): boolean {
  return stack.length === 1 && stack[0]?.kind === "module";
}

function isDirectPhoenixRoutePosition(stack: readonly ElixirBlockFrame[]): boolean {
  return (
    stack.some((frame) => frame.kind === "module") &&
    stack.every((frame) => frame.kind === "module" || frame.kind === "scope")
  );
}

function opensUnknownElixirBlock(code: string): boolean {
  return /\bdo\s*$/u.test(code) || /\bfn\b.*->\s*$/u.test(code);
}

function staticElixirFacts(sourceText: string): ElixirStaticFacts {
  const sanitized = sanitizeElixirSource(sourceText);
  if (sanitized === null) {
    return { valid: false, modules: [], methods: [], routes: [] };
  }

  const modules: StaticElixirModule[] = [];
  const methods: StaticElixirMethod[] = [];
  const routes: StaticPhoenixRoute[] = [];
  const phoenixRouterModules = new Set<string>();
  const stack: ElixirBlockFrame[] = [];

  for (const line of linesFor(sourceText, sanitized)) {
    const code = line.code;
    if (/^\s*$/u.test(code)) {
      continue;
    }
    if (/^\s*end\s*$/u.test(code)) {
      const frame = stack.pop();
      if (frame === undefined) {
        return { valid: false, modules: [], methods: [], routes: [] };
      }
      if (frame.kind === "module" && frame.moduleName !== undefined) {
        modules.push({ name: frame.moduleName, start: frame.start, end: line.end });
      } else if (
        frame.kind === "function" &&
        frame.moduleName !== undefined &&
        frame.functionName !== undefined &&
        frame.isExported !== undefined
      ) {
        methods.push({
          moduleName: frame.moduleName,
          name: frame.functionName,
          start: frame.start,
          end: line.end,
          isExported: frame.isExported
        });
      }
      continue;
    }

    const moduleMatch = DIRECT_MODULE_PATTERN.exec(code);
    if (moduleMatch !== null) {
      const moduleName = moduleMatch[1];
      if (moduleName === undefined || stack.length !== 0) {
        return { valid: false, modules: [], methods: [], routes: [] };
      }
      stack.push({ kind: "module", start: line.start, moduleName });
      continue;
    }

    if (isDirectModuleBody(stack) && DIRECT_PHOENIX_USE_PATTERN.test(code)) {
      const moduleName = nearestModule(stack);
      if (moduleName !== null) {
        phoenixRouterModules.add(moduleName);
      }
      continue;
    }

    const scopeMatch = DIRECT_SCOPE_PATTERN.exec(code);
    if (scopeMatch !== null) {
      const scopePath = staticLiteralPath(scopeMatch[1] ?? "", true);
      if (scopePath === null || !isDirectPhoenixRoutePosition(stack)) {
        return { valid: false, modules: [], methods: [], routes: [] };
      }
      stack.push({ kind: "scope", start: line.start, scopePath });
      continue;
    }

    const functionMatch = DIRECT_FUNCTION_PATTERN.exec(code);
    if (functionMatch !== null) {
      const moduleName = nearestModule(stack);
      const visibility = functionMatch[1];
      const name = functionMatch[2];
      if (
        moduleName === null ||
        name === undefined ||
        (visibility !== "def" && visibility !== "defp") ||
        !isDirectModuleBody(stack)
      ) {
        return { valid: false, modules: [], methods: [], routes: [] };
      }
      stack.push({
        kind: "function",
        start: line.start,
        moduleName,
        functionName: name,
        isExported: visibility === "def"
      });
      continue;
    }

    const routeMatch = DIRECT_ROUTE_PATTERN.exec(code);
    if (routeMatch !== null) {
      const moduleName = nearestModule(stack);
      const method = PHOENIX_ROUTE_METHODS.get(routeMatch[1] ?? "");
      const routePath = staticLiteralPath(routeMatch[2] ?? "", true);
      const controller = routeMatch[3];
      const action = routeMatch[4];
      if (
        moduleName !== null &&
        phoenixRouterModules.has(moduleName) &&
        method !== undefined &&
        routePath !== null &&
        controller !== undefined &&
        action !== undefined &&
        isDirectPhoenixRoutePosition(stack)
      ) {
        const scopePrefixes = stack.flatMap((frame) =>
          frame.kind === "scope" && frame.scopePath !== undefined ? [frame.scopePath] : []
        );
        routes.push({
          method,
          path: joinPaths(scopePrefixes, routePath),
          controller,
          action,
          start: line.start,
          end: line.end
        });
      }
      continue;
    }

    if (opensUnknownElixirBlock(code)) {
      stack.push({ kind: "other", start: line.start });
    }
  }

  return stack.length === 0
    ? { valid: true, modules, methods, routes }
    : { valid: false, modules: [], methods: [], routes: [] };
}

/**
 * Extracts direct Elixir modules/methods and a narrow Phoenix Router subset.
 * A route requires `use Phoenix.Router`, direct literal scopes, a literal
 * verb/controller/action line, and a same-file full-module handler for exactness.
 */
export function extractElixirFileFacts(input: ElixirExtractFileFactsInput): ArtifactFacts {
  const phoenixCapability = frameworkCapability("phoenix");
  if (!phoenixCapability.languages.includes(input.language)) {
    throw new Error("Phoenix framework extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticElixirFacts(input.sourceText);
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
    const identity = `${qualifiedName}\u0000${kind}`;
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

  function addModule(moduleFact: StaticElixirModule): SymbolNode {
    const qualifiedName = `${input.filePath}#${moduleFact.name}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: moduleFact.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range: rangeFor(lineStarts, moduleFact.start, moduleFact.end),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, moduleFact.start, moduleFact.end);
    return symbol;
  }

  function addMethod(parent: SymbolNode, methodFact: StaticElixirMethod): SymbolNode {
    const qualifiedName = `${parent.qualifiedName}.${methodFact.name}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "method");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "method",
        declarationOrdinal
      }),
      name: methodFact.name,
      qualifiedName,
      kind: "method",
      filePath: input.filePath,
      range: rangeFor(lineStarts, methodFact.start, methodFact.end),
      isExported: methodFact.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, methodFact.start, methodFact.end);
    return symbol;
  }

  function addPhoenixRoute(routeFact: StaticPhoenixRoute, handler: SymbolNode | null): void {
    const routeName = `${routeFact.method} ${routeFact.path}`;
    const qualifiedName = `${input.filePath}#route:${routeName}`;
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
    addContainment(fileNode, route, routeFact.start, routeFact.end);
    const referenceName = `${routeFact.controller}#${routeFact.action}`;
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
            ? "framework.phoenix.direct-router.literal-verb.full-module-controller-action.unresolved-controller-method"
            : "framework.phoenix.direct-router.literal-verb.full-module-controller-action.local-method",
        stage: "syntax",
        candidateSymbolIds: handler === null ? [] : [handler.id]
      }
    });
  }

  if (staticFacts.valid) {
    const moduleSymbols = new Map<string, SymbolNode[]>();
    for (const moduleFact of [...staticFacts.modules].sort((left, right) => left.start - right.start)) {
      const moduleSymbol = addModule(moduleFact);
      moduleSymbols.set(moduleFact.name, [...(moduleSymbols.get(moduleFact.name) ?? []), moduleSymbol]);
    }

    const methodsByModuleAndName = new Map<string, SymbolNode[]>();
    for (const methodFact of [...staticFacts.methods].sort((left, right) => left.start - right.start)) {
      const moduleCandidates = moduleSymbols.get(methodFact.moduleName) ?? [];
      if (moduleCandidates.length !== 1) {
        continue;
      }
      const parent = moduleCandidates[0];
      if (parent === undefined) {
        continue;
      }
      const methodSymbol = addMethod(parent, methodFact);
      const identity = `${methodFact.moduleName}\u0000${methodFact.name}`;
      methodsByModuleAndName.set(identity, [
        ...(methodsByModuleAndName.get(identity) ?? []),
        methodSymbol
      ]);
    }

    for (const routeFact of [...staticFacts.routes].sort((left, right) => left.start - right.start)) {
      const candidates = methodsByModuleAndName.get(`${routeFact.controller}\u0000${routeFact.action}`) ?? [];
      addPhoenixRoute(routeFact, candidates.length === 1 ? candidates[0] ?? null : null);
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
