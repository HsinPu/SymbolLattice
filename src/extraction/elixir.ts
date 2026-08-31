import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type ElixirAliasFact,
  type ElixirCallFact,
  type ElixirCallableFact,
  type ElixirFacts,
  type ElixirHeritageFact,
  type ElixirImportFact,
  type ElixirInstantiationFact,
  type ElixirTypeFact,
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
  readonly isZeroArity?: boolean;
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
  readonly isZeroArity: boolean;
}

interface StaticElixirCall {
  readonly moduleName: string;
  readonly callerName: string;
  readonly callerStart: number;
  readonly calleeName: string;
  readonly start: number;
  readonly end: number;
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
  readonly directCalls: readonly StaticElixirCall[];
  readonly routes: readonly StaticPhoenixRoute[];
}

interface ElixirRawType {
  readonly name: string;
  readonly moduleName: string;
  readonly declarationKind: "module" | "protocol" | "struct" | "exception" | "type" | "behaviour";
  readonly isExported: boolean;
  readonly start: number;
  readonly end: number;
  readonly startLine: number;
  readonly endLine: number;
}

interface ElixirRawCallable {
  readonly key: string;
  readonly name: string;
  readonly moduleName: string;
  readonly callableKind: "function" | "callback";
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterNames: readonly string[];
  readonly parameterTypeNames: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly isPrivate: boolean;
  readonly start: number;
  readonly end: number;
  readonly startLine: number;
  readonly endLine: number;
}

interface ElixirRawAlias {
  readonly importedModule: string;
  readonly localName: string;
  readonly start: number;
  readonly end: number;
}

interface ElixirRawImport {
  readonly importedModule: string;
  readonly importedNames?: readonly string[];
  readonly start: number;
  readonly end: number;
}

interface ElixirRawCall {
  readonly sourceKey: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "module";
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface ElixirRawInstantiation {
  readonly sourceKey: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly start: number;
  readonly end: number;
}

interface ElixirRawHeritage {
  readonly sourceTypeName: string;
  readonly referenceName: string;
  readonly start: number;
  readonly end: number;
}

interface ElixirRawRelationFacts {
  readonly valid: boolean;
  readonly moduleName: string;
  readonly types: readonly ElixirRawType[];
  readonly callables: readonly ElixirRawCallable[];
  readonly aliases: readonly ElixirRawAlias[];
  readonly imports: readonly ElixirRawImport[];
  readonly calls: readonly ElixirRawCall[];
  readonly instantiations: readonly ElixirRawInstantiation[];
  readonly heritage: readonly ElixirRawHeritage[];
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
  `^\\s*(def|defp)\\s+(${ELIXIR_FUNCTION})\\s*\\(([^()]*)\\)\\s+do\\s*$`,
  "u"
);
const DIRECT_PHOENIX_USE_PATTERN = /^\s*use\s+Phoenix\.Router(?:\s*,\s*helpers:\s*false)?\s*$/u;
const DIRECT_BARE_ZERO_ARGUMENT_CALL_PATTERN = new RegExp(
  `^\\s*(${ELIXIR_FUNCTION})\\s*\\(\\)\\s*$`,
  "u"
);
const UNSAFE_DIRECT_CALL_MODULE_PATTERN = /^\s*(?:alias|import|require|use|defmacro|defmacrop)\b/u;
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

function nearestFunction(stack: readonly ElixirBlockFrame[]): ElixirBlockFrame | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const candidate = stack[index];
    if (candidate?.kind === "function") {
      return candidate;
    }
  }
  return null;
}

function isDirectModuleBody(stack: readonly ElixirBlockFrame[]): boolean {
  return stack.length === 1 && stack[0]?.kind === "module";
}

function isDirectModuleFunctionBody(stack: readonly ElixirBlockFrame[]): boolean {
  return stack.length === 2 && stack[0]?.kind === "module" && stack[1]?.kind === "function";
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
    return { valid: false, modules: [], methods: [], directCalls: [], routes: [] };
  }

  const modules: StaticElixirModule[] = [];
  const methods: StaticElixirMethod[] = [];
  const directCalls: StaticElixirCall[] = [];
  const routes: StaticPhoenixRoute[] = [];
  const phoenixRouterModules = new Set<string>();
  const unsafeDirectCallModules = new Set<string>();
  const unsafeDirectCallFunctions = new Set<number>();
  const stack: ElixirBlockFrame[] = [];

  for (const line of linesFor(sourceText, sanitized)) {
    const code = line.code;
    if (/^\s*$/u.test(code)) {
      continue;
    }
    if (/^\s*end\s*$/u.test(code)) {
      const frame = stack.pop();
      if (frame === undefined) {
        return { valid: false, modules: [], methods: [], directCalls: [], routes: [] };
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
          isExported: frame.isExported,
          isZeroArity: frame.isZeroArity === true
        });
      }
      continue;
    }

    const moduleMatch = DIRECT_MODULE_PATTERN.exec(code);
    if (moduleMatch !== null) {
      const moduleName = moduleMatch[1];
      if (moduleName === undefined || stack.length !== 0) {
        return { valid: false, modules: [], methods: [], directCalls: [], routes: [] };
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

    if (isDirectModuleBody(stack) && UNSAFE_DIRECT_CALL_MODULE_PATTERN.test(code)) {
      const moduleName = nearestModule(stack);
      if (moduleName !== null) {
        unsafeDirectCallModules.add(moduleName);
      }
    }

    const activeFunction = nearestFunction(stack);
    if (activeFunction !== null && /\bfn\b/u.test(code)) {
      unsafeDirectCallFunctions.add(activeFunction.start);
    }

    const scopeMatch = DIRECT_SCOPE_PATTERN.exec(code);
    if (scopeMatch !== null) {
      const scopePath = staticLiteralPath(scopeMatch[1] ?? "", true);
      if (scopePath === null || !isDirectPhoenixRoutePosition(stack)) {
        return { valid: false, modules: [], methods: [], directCalls: [], routes: [] };
      }
      stack.push({ kind: "scope", start: line.start, scopePath });
      continue;
    }

    const functionMatch = DIRECT_FUNCTION_PATTERN.exec(code);
    if (functionMatch !== null) {
      const moduleName = nearestModule(stack);
      const visibility = functionMatch[1];
      const name = functionMatch[2];
      const parameters = functionMatch[3];
      if (
        moduleName === null ||
        name === undefined ||
        parameters === undefined ||
        (visibility !== "def" && visibility !== "defp") ||
        !isDirectModuleBody(stack)
      ) {
        return { valid: false, modules: [], methods: [], directCalls: [], routes: [] };
      }
      stack.push({
        kind: "function",
        start: line.start,
        moduleName,
        functionName: name,
        isExported: visibility === "def",
        isZeroArity: parameters.trim() === ""
      });
      continue;
    }

    const callMatch = DIRECT_BARE_ZERO_ARGUMENT_CALL_PATTERN.exec(code);
    if (callMatch !== null && isDirectModuleFunctionBody(stack)) {
      const moduleName = nearestModule(stack);
      const caller = stack[1];
      const calleeName = callMatch[1];
      if (
        moduleName !== null &&
        caller?.functionName !== undefined &&
        calleeName !== undefined
      ) {
        const callStart = line.start + code.indexOf(calleeName);
        directCalls.push({
          moduleName,
          callerName: caller.functionName,
          callerStart: caller.start,
          calleeName,
          start: callStart,
          end: callStart + calleeName.length + 2
        });
      }
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
    ? {
        valid: true,
        modules,
        methods,
        directCalls: directCalls.filter(
          (call) =>
            !unsafeDirectCallModules.has(call.moduleName) &&
            !unsafeDirectCallFunctions.has(call.callerStart)
        ),
        routes
      }
    : { valid: false, modules: [], methods: [], directCalls: [], routes: [] };
}

function elixirCurrentModule(stack: readonly { readonly kind: ElixirBlockKind; readonly moduleName?: string }[]): string | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const frame = stack[index];
    if (frame?.kind === "module" && frame.moduleName !== undefined) return frame.moduleName;
  }
  return null;
}

function elixirFunctionEnd(lines: readonly ElixirLine[], startLine: number): number {
  let depth = 1;
  for (let index = startLine + 1; index < lines.length; index += 1) {
    const code = lines[index]?.code ?? "";
    if (/^\s*end\s*$/u.test(code)) {
      depth -= 1;
      if (depth === 0) return index;
      continue;
    }
    if (/\bdo\s*$/u.test(code) && !/\bdo:\s*/u.test(code)) depth += 1;
  }
  return lines.length - 1;
}

function elixirArgumentCount(text: string): number {
  const normalized = text.trim();
  if (normalized === "" || normalized === "()") return 0;
  return normalized.split(",").length;
}

function elixirCodeStart(line: ElixirLine): number {
  return line.start + line.code.length - line.code.trimStart().length;
}

function elixirSpecTypes(text: string): { readonly parameterCount: number; readonly parameterTypeNames: readonly string[]; readonly returnTypeName?: string } | null {
  const match = /^\s*([^:]+?)\s*::\s*(.+)$/u.exec(text);
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  const left = match[1].trim();
  const open = left.indexOf("(");
  const close = left.lastIndexOf(")");
  const argumentsText = open >= 0 && close > open ? left.slice(open + 1, close) : "";
  const parameterCount = argumentsText.trim() === "" ? 0 : argumentsText.split(",").length;
  const parameterTypeNames = [...argumentsText.matchAll(/%?([A-Z][A-Za-z0-9_.]*)/gu)].map((item) => item[1]).filter((name): name is string => name !== undefined && !["Integer", "Float", "Atom", "Binary", "Map", "List", "Tuple"].includes(name));
  const returnTypeName = [...(match[2].matchAll(/%?([A-Z][A-Za-z0-9_.]*)/gu))].map((item) => item[1]).find((name) => name !== undefined && !["Integer", "Float", "Atom", "Binary", "Map", "List", "Tuple"].includes(name));
  return { parameterCount, parameterTypeNames, ...(returnTypeName === undefined ? {} : { returnTypeName }) };
}

function parseElixirRelations(sourceText: string): ElixirRawRelationFacts {
  const sanitized = sanitizeElixirSource(sourceText);
  if (sanitized === null || /\b(?:defmacro|defmacrop|quote|unquote|use\s+[A-Z]|@before_compile|@after_compile|@on_definition)\b/u.test(sourceText) || /^\s*#(?:if|ifdef|ifndef|else|endif)\b/mu.test(sourceText)) {
    return { valid: false, moduleName: "", types: [], callables: [], aliases: [], imports: [], calls: [], instantiations: [], heritage: [] };
  }
  const lines = linesFor(sourceText, sanitized);
  const stack: Array<{ readonly kind: ElixirBlockKind; readonly start: number; readonly moduleName?: string; readonly functionName?: string }> = [];
  const types: ElixirRawType[] = [];
  const callables: ElixirRawCallable[] = [];
  const aliases: ElixirRawAlias[] = [];
  const imports: ElixirRawImport[] = [];
  const heritage: ElixirRawHeritage[] = [];
  const calls: ElixirRawCall[] = [];
  const instantiations: ElixirRawInstantiation[] = [];
  const specs = new Map<string, { readonly shape: ReturnType<typeof elixirSpecTypes>; readonly start: number }>();
  let moduleName = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || /^\s*$/u.test(line.code)) continue;
    if (/^\s*end\s*$/u.test(line.code)) {
      if (stack.pop() === undefined) return { valid: false, moduleName: "", types: [], callables: [], aliases: [], imports: [], calls: [], instantiations: [], heritage: [] };
      continue;
    }
    const moduleMatch = /^\s*defmodule\s+([A-Z][A-Za-z0-9_.]*)\s+do\s*$/u.exec(line.code);
    if (moduleMatch?.[1] !== undefined) {
      if (stack.length !== 0) return { valid: false, moduleName: "", types: [], callables: [], aliases: [], imports: [], calls: [], instantiations: [], heritage: [] };
      moduleName = moduleMatch[1];
      types.push({ name: moduleName, moduleName: "", declarationKind: "module", isExported: true, start: elixirCodeStart(line), end: line.end, startLine: index, endLine: elixirFunctionEnd(lines, index) });
      stack.push({ kind: "module", start: elixirCodeStart(line), moduleName });
      continue;
    }
    const protocolMatch = /^\s*defprotocol\s+([A-Z][A-Za-z0-9_.]*)\s+do\s*$/u.exec(line.code);
    if (protocolMatch?.[1] !== undefined) {
      if (stack.length !== 0) return { valid: false, moduleName: "", types: [], callables: [], aliases: [], imports: [], calls: [], instantiations: [], heritage: [] };
      types.push({ name: protocolMatch[1], moduleName: "", declarationKind: "protocol", isExported: true, start: elixirCodeStart(line), end: line.end, startLine: index, endLine: elixirFunctionEnd(lines, index) });
      stack.push({ kind: "module", start: elixirCodeStart(line), moduleName: protocolMatch[1] });
      continue;
    }
    const implMatch = /^\s*defimpl\s+([A-Z][A-Za-z0-9_.]*)\s*,\s*for:\s*([A-Z][A-Za-z0-9_.]*)\s+do\s*$/u.exec(line.code);
    if (implMatch?.[1] !== undefined && implMatch[2] !== undefined) {
      heritage.push({ sourceTypeName: implMatch[2], referenceName: implMatch[1], start: elixirCodeStart(line), end: line.end });
      stack.push({ kind: "module", start: elixirCodeStart(line), moduleName: implMatch[2] });
      continue;
    }
    const currentModule = elixirCurrentModule(stack);
    const aliasMatch = /^\s*alias\s+([A-Z][A-Za-z0-9_.]*)(?:\s*,\s*as:\s*([A-Z][A-Za-z0-9_]*))?\s*$/u.exec(line.code);
    if (aliasMatch?.[1] !== undefined) {
      const importedModule = aliasMatch[1];
      aliases.push({ importedModule, localName: aliasMatch[2] ?? importedModule.split(".").at(-1) ?? importedModule, start: elixirCodeStart(line), end: line.end });
      continue;
    }
    const importMatch = /^\s*import\s+([A-Z][A-Za-z0-9_.]*)(?:\s*,\s*only:\s*\[([^\]]*)\])?\s*$/u.exec(line.code);
    if (importMatch?.[1] !== undefined) {
      const names = importMatch[2] === undefined ? undefined : importMatch[2].split(",").map((name) => name.trim().split(":")[0] ?? "").filter((name): name is string => /^[a-z_][A-Za-z0-9_?!]*$/u.test(name));
      imports.push({ importedModule: importMatch[1], ...(names === undefined ? {} : { importedNames: names }), start: elixirCodeStart(line), end: line.end });
      continue;
    }
    const structMatch = /^\s*defstruct\b(.*)$/u.exec(line.code);
    if (structMatch !== null && currentModule !== null) {
      types.push({ name: currentModule, moduleName: currentModule, declarationKind: "struct", isExported: true, start: elixirCodeStart(line), end: line.end, startLine: index, endLine: index });
      continue;
    }
    const exceptionMatch = /^\s*defexception\b(.*)$/u.exec(line.code);
    if (exceptionMatch !== null && currentModule !== null) {
      types.push({ name: currentModule, moduleName: currentModule, declarationKind: "exception", isExported: true, start: elixirCodeStart(line), end: line.end, startLine: index, endLine: index });
      continue;
    }
    const typeMatch = /^\s*@type(?:p)?\s+([a-z_][A-Za-z0-9_?!]*)\s+::/u.exec(line.code);
    if (typeMatch?.[1] !== undefined && currentModule !== null) {
      types.push({ name: typeMatch[1], moduleName: currentModule, declarationKind: "type", isExported: !line.code.includes("@typep"), start: elixirCodeStart(line), end: line.end, startLine: index, endLine: index });
      continue;
    }
    const behaviourMatch = /^\s*@behaviour\s+([A-Z][A-Za-z0-9_.]*)\s*$/u.exec(line.code);
    if (behaviourMatch?.[1] !== undefined && currentModule !== null) {
      heritage.push({ sourceTypeName: currentModule, referenceName: behaviourMatch[1], start: elixirCodeStart(line), end: line.end });
      continue;
    }
    const specMatch = /^\s*@spec\s+([a-z_][A-Za-z0-9_?!]*)\s*(\([^)]*\)\s*::\s*.+)$/u.exec(line.code);
    if (specMatch?.[1] !== undefined && specMatch[2] !== undefined && currentModule !== null) {
      specs.set(`${currentModule}\u0000${specMatch[1]}`, { shape: elixirSpecTypes(specMatch[2]), start: elixirCodeStart(line) });
      continue;
    }
    const callbackMatch = /^\s*@callback\s+([a-z_][A-Za-z0-9_?!]*)\s*(\([^)]*\)\s*::\s*.+)$/u.exec(line.code);
    if (callbackMatch?.[1] !== undefined && callbackMatch[2] !== undefined && currentModule !== null) {
      const shape = elixirSpecTypes(callbackMatch[2]);
      if (shape !== null) {
        const key = `${currentModule}\u0000${callbackMatch[1]}\u0000callback\u0000${index}`;
        callables.push({ key, name: callbackMatch[1], moduleName: currentModule, callableKind: "callback", parameterCount: shape.parameterCount, requiredParameterCount: shape.parameterCount, parameterNames: [], parameterTypeNames: shape.parameterTypeNames, ...(shape.returnTypeName === undefined ? {} : { returnTypeName: shape.returnTypeName }), isExported: true, isPrivate: false, start: elixirCodeStart(line), end: line.end, startLine: index, endLine: index });
      }
      continue;
    }
    const functionMatch = /^\s*(defp?|def)\s+([a-z_][A-Za-z0-9_?!]*)\s*\(([^()]*)\)(?:\s*,\s*do:\s*(.*)|\s+do\s*)$/u.exec(line.code);
    if (functionMatch?.[2] !== undefined && functionMatch[3] !== undefined && currentModule !== null) {
      const visibility = functionMatch[1] === "defp" ? "private" : "public";
      const parameters = functionMatch[3].trim() === "" ? [] : functionMatch[3].split(",").map((part) => part.trim());
      if (parameters.some((parameter) => !/^[a-z_][A-Za-z0-9_?!]*$/u.test(parameter))) continue;
      const spec = specs.get(`${currentModule}\u0000${functionMatch[2]}`)?.shape;
      const shape = spec ?? { parameterCount: parameters.length, parameterTypeNames: [] };
      const key = `${currentModule}\u0000${functionMatch[2]}\u0000${index}`;
      const oneLine = functionMatch[4] !== undefined;
      const endLine = oneLine ? index : elixirFunctionEnd(lines, index);
      callables.push({ key, name: functionMatch[2], moduleName: currentModule, callableKind: "function", parameterCount: shape.parameterCount, requiredParameterCount: shape.parameterCount, parameterNames: parameters, parameterTypeNames: shape.parameterTypeNames, ...(shape.returnTypeName === undefined ? {} : { returnTypeName: shape.returnTypeName }), isExported: visibility === "public", isPrivate: visibility === "private", start: elixirCodeStart(line), end: line.end, startLine: index, endLine });
      if (!oneLine) stack.push({ kind: "function", start: elixirCodeStart(line), moduleName: currentModule, functionName: functionMatch[2] });
      continue;
    }
    if (/^\s*(?:defmacro|defmacrop|quote|unquote)\b/u.test(line.code)) return { valid: false, moduleName: "", types: [], callables: [], aliases: [], imports: [], calls: [], instantiations: [], heritage: [] };
  }
  if (stack.length !== 0) return { valid: false, moduleName: "", types: [], callables: [], aliases: [], imports: [], calls: [], instantiations: [], heritage: [] };
  const reserved = new Set(["def", "defp", "if", "unless", "case", "cond", "with", "receive", "try", "rescue", "catch", "after", "do", "end", "fn", "alias", "import", "require", "use"]);
  for (const callable of callables) {
    const bodyLines = lines.slice(callable.startLine, callable.endLine + 1);
    const bodyText = bodyLines.map((line) => line.code).join("\n");
    if (/\b(?:case|cond|with|receive|try|rescue|catch|fn)\b|->/u.test(bodyText)) continue;
    for (const bodyLine of bodyLines) {
      const code = bodyLine?.code ?? "";
      if (/^\s*def(?:p)?\b/u.test(code)) continue;
      const equals = code.indexOf("do:");
      const executable = equals >= 0 ? code.slice(equals + 3) : code;
      // `executable` still includes the original indentation when scanning a
      // normal function body. Anchor from the physical line start so the
      // regex match offset is not counted twice (one-based ranges must point
      // at the actual callee or `%Struct{}` token).
      const sourceOffset = bodyLine.start + (equals >= 0 ? equals + 3 : 0);
      for (const match of executable.matchAll(/\b([A-Z][A-Za-z0-9_.]*)\.([a-z_][A-Za-z0-9_?!]*)\s*\(([^()]*)\)/gu)) {
        const receiver = match[1]; const name = match[2]; if (receiver === undefined || name === undefined) continue;
        const args = match[3] ?? ""; const offset = match.index ?? 0;
        calls.push({ sourceKey: callable.key, referenceName: name, callKind: "module", receiverModuleName: receiver, argumentCount: elixirArgumentCount(args), start: sourceOffset + offset, end: sourceOffset + offset + (match[0]?.length ?? 0) });
      }
      for (const match of executable.matchAll(/(?<![.%])\b([a-z_][A-Za-z0-9_?!]*)\s*\(([^()]*)\)/gu)) {
        const name = match[1]; const offset = match.index ?? 0; if (name === undefined || reserved.has(name)) continue;
        const args = match[2] ?? "";
        calls.push({ sourceKey: callable.key, referenceName: name, callKind: "direct", argumentCount: elixirArgumentCount(args), start: sourceOffset + offset, end: sourceOffset + offset + name.length });
      }
      for (const match of executable.matchAll(/%([A-Z][A-Za-z0-9_.]*)\s*\{([^}]*)\}/gu)) {
        const typeName = match[1]; if (typeName === undefined) continue; const args = match[2] ?? ""; const offset = match.index ?? 0;
        instantiations.push({ sourceKey: callable.key, typeName, argumentCount: elixirArgumentCount(args.replace(/\b[a-z_][A-Za-z0-9_?!]*\s*:/gu, "x:")), start: sourceOffset + offset, end: sourceOffset + offset + (match[0]?.length ?? 0) });
      }
    }
  }
  return { valid: true, moduleName, types, callables, aliases, imports, calls, instantiations, heritage };
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
  const relationFacts = parseElixirRelations(input.sourceText);
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const declarationOrdinals = new Map<string, number>();
  const elixirTypes: ElixirTypeFact[] = [];
  const elixirCallables: ElixirCallableFact[] = [];
  const elixirAliases: ElixirAliasFact[] = [];
  const elixirImports: ElixirImportFact[] = [];
  const elixirCalls: ElixirCallFact[] = [];
  const elixirInstantiations: ElixirInstantiationFact[] = [];
  const elixirHeritage: ElixirHeritageFact[] = [];
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

  function findSymbol(qualifiedName: string, kind: SymbolNode["kind"]): SymbolNode | undefined {
    return symbols.find((symbol) => symbol.qualifiedName === qualifiedName && symbol.kind === kind);
  }

  function addElixirType(type: ElixirRawType, moduleSymbols: ReadonlyMap<string, SymbolNode>): SymbolNode {
    const isModuleLike = type.declarationKind === "module" || type.declarationKind === "protocol" || type.declarationKind === "behaviour";
    const qualifiedName = isModuleLike
      ? `${input.filePath}#${type.name}`
      : type.declarationKind === "struct"
        ? `${input.filePath}#${type.name}.struct`
        : `${input.filePath}#${type.moduleName}.${type.name}`;
    const kind: SymbolNode["kind"] = type.declarationKind === "protocol" ? "interface" : type.declarationKind === "type" || type.declarationKind === "struct" || type.declarationKind === "exception" ? "type" : "class";
    const existing = findSymbol(qualifiedName, kind);
    if (existing !== undefined) {
      elixirTypes.push({ symbolId: existing.id, filePath: input.filePath, name: type.name, moduleName: type.moduleName, qualifiedTypePath: type.declarationKind === "struct" ? type.moduleName : type.moduleName === "" ? type.name : `${type.moduleName}.${type.name}`, declarationKind: type.declarationKind, isExported: type.isExported, range: existing.range });
      return existing;
    }
    const declarationOrdinal = nextOrdinal(qualifiedName, kind);
    const symbol: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind, declarationOrdinal }), name: type.name, qualifiedName, kind, filePath: input.filePath, range: rangeFor(lineStarts, type.start, type.end), isExported: type.isExported, declarationOrdinal };
    symbols.push(symbol);
    const parent = type.declarationKind === "module" || type.declarationKind === "protocol" || type.moduleName === "" ? fileNode : moduleSymbols.get(type.moduleName) ?? fileNode;
    addContainment(parent, symbol, type.start, type.end);
    elixirTypes.push({ symbolId: symbol.id, filePath: input.filePath, name: type.name, moduleName: type.moduleName, qualifiedTypePath: type.declarationKind === "struct" ? type.moduleName : type.moduleName === "" ? type.name : `${type.moduleName}.${type.name}`, declarationKind: type.declarationKind, isExported: type.isExported, range: symbol.range });
    return symbol;
  }

  function addElixirCallable(callable: ElixirRawCallable, moduleSymbols: ReadonlyMap<string, SymbolNode>): SymbolNode {
    const qualifiedName = `${input.filePath}#${callable.moduleName}.${callable.name}`;
    const existing = findSymbol(qualifiedName, "method");
    const symbol = existing ?? (() => {
      const declarationOrdinal = nextOrdinal(qualifiedName, "method");
      const created: SymbolNode = { id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "method", declarationOrdinal }), name: callable.name, qualifiedName, kind: "method", filePath: input.filePath, range: rangeFor(lineStarts, callable.start, callable.end), isExported: callable.isExported, declarationOrdinal };
      symbols.push(created);
      addContainment(moduleSymbols.get(callable.moduleName) ?? fileNode, created, callable.start, callable.end);
      return created;
    })();
    elixirCallables.push({ symbolId: symbol.id, filePath: input.filePath, name: callable.name, moduleName: callable.moduleName, callableKind: callable.callableKind, parameterCount: callable.parameterCount, requiredParameterCount: callable.requiredParameterCount, ...(callable.parameterTypeNames.length === 0 ? {} : { parameterTypeNames: callable.parameterTypeNames }), ...(callable.returnTypeName === undefined ? {} : { returnTypeName: callable.returnTypeName }), isExported: callable.isExported, ...(callable.isPrivate ? { isPrivate: true } : {}), range: symbol.range });
    relationCallableSymbols.set(callable.key, symbol);
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

  function addDirectCall(callFact: StaticElixirCall, caller: SymbolNode, callee: SymbolNode): void {
    const range = rangeFor(lineStarts, callFact.start, callFact.end);
    edges.push({
      id: createEdgeId({
        sourceId: caller.id,
        targetId: callee.id,
        kind: "calls",
        line: range.start.line,
        column: range.start.column,
        referenceName: callFact.calleeName
      }),
      sourceId: caller.id,
      targetId: callee.id,
      kind: "calls",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: callFact.calleeName,
      evidence: {
        ruleId: "syntax.elixir.same-module.unique-bare-zero-argument-direct-call",
        stage: "syntax",
        candidateSymbolIds: [callee.id]
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
    const zeroArityMethodsByModuleAndName = new Map<string, SymbolNode[]>();
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
      if (methodFact.isZeroArity) {
        zeroArityMethodsByModuleAndName.set(identity, [
          ...(zeroArityMethodsByModuleAndName.get(identity) ?? []),
          methodSymbol
        ]);
      }
    }

    for (const routeFact of [...staticFacts.routes].sort((left, right) => left.start - right.start)) {
      const candidates = methodsByModuleAndName.get(`${routeFact.controller}\u0000${routeFact.action}`) ?? [];
      addPhoenixRoute(routeFact, candidates.length === 1 ? candidates[0] ?? null : null);
    }

    for (const callFact of staticFacts.directCalls) {
      const callerCandidates =
        methodsByModuleAndName.get(`${callFact.moduleName}\u0000${callFact.callerName}`) ?? [];
      const calleeCandidates =
        zeroArityMethodsByModuleAndName.get(`${callFact.moduleName}\u0000${callFact.calleeName}`) ?? [];
      if (callerCandidates.length === 1 && calleeCandidates.length === 1) {
        const caller = callerCandidates[0];
        const callee = calleeCandidates[0];
        if (caller !== undefined && callee !== undefined) {
          addDirectCall(callFact, caller, callee);
        }
      }
    }
  }

  const relationModuleSymbols = new Map<string, SymbolNode>();
  for (const type of relationFacts.types.filter((candidate) => candidate.declarationKind === "module" || candidate.declarationKind === "protocol").sort((left, right) => left.start - right.start)) {
    const symbol = addElixirType(type, relationModuleSymbols);
    relationModuleSymbols.set(type.name, symbol);
  }
  for (const type of relationFacts.types.filter((candidate) => candidate.declarationKind !== "module" && candidate.declarationKind !== "protocol").sort((left, right) => left.start - right.start)) {
    addElixirType(type, relationModuleSymbols);
  }
  for (const callable of [...relationFacts.callables].sort((left, right) => left.start - right.start)) {
    addElixirCallable(callable, relationModuleSymbols);
  }
  for (const alias of relationFacts.aliases) {
    elixirAliases.push({ sourceId: fileNode.id, filePath: input.filePath, importedModule: alias.importedModule, localName: alias.localName, range: rangeFor(lineStarts, alias.start, alias.end) });
  }
  for (const importFact of relationFacts.imports) {
    elixirImports.push({ sourceId: fileNode.id, filePath: input.filePath, importedModule: importFact.importedModule, ...(importFact.importedNames === undefined ? {} : { importedNames: importFact.importedNames }), range: rangeFor(lineStarts, importFact.start, importFact.end) });
  }
  for (const call of relationFacts.calls) {
    const source = relationCallableSymbols.get(call.sourceKey);
    if (source === undefined) continue;
    elixirCalls.push({ sourceId: source.id, filePath: input.filePath, referenceName: call.referenceName, callKind: call.callKind, ...(call.receiverModuleName === undefined ? {} : { receiverModuleName: call.receiverModuleName }), argumentCount: call.argumentCount, range: rangeFor(lineStarts, call.start, call.end) });
  }
  for (const instantiation of relationFacts.instantiations) {
    const source = relationCallableSymbols.get(instantiation.sourceKey);
    if (source === undefined) continue;
    elixirInstantiations.push({ sourceId: source.id, filePath: input.filePath, typeName: instantiation.typeName, argumentCount: instantiation.argumentCount, range: rangeFor(lineStarts, instantiation.start, instantiation.end) });
  }
  for (const heritageFact of relationFacts.heritage) {
    const source = relationModuleSymbols.get(heritageFact.sourceTypeName) ?? fileNode;
    elixirHeritage.push({ sourceId: source.id, filePath: input.filePath, referenceName: heritageFact.referenceName, sourceTypeName: heritageFact.sourceTypeName, relationKind: "implements", range: rangeFor(lineStarts, heritageFact.start, heritageFact.end) });
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
    elixirFacts: {
      moduleName: relationFacts.moduleName,
      parserRejected: !relationFacts.valid,
      types: elixirTypes,
      callables: elixirCallables,
      aliases: elixirAliases,
      imports: elixirImports,
      calls: elixirCalls,
      instantiations: elixirInstantiations,
      heritage: elixirHeritage
    } satisfies ElixirFacts
  };
}
