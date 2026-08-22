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

export interface PerlExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "perl";
}

type PerlTokenKind = "word" | "string" | "symbol";

interface PerlToken {
  readonly kind: PerlTokenKind;
  readonly text: string;
  readonly value: string | undefined;
  readonly escaped: boolean | undefined;
  readonly start: number;
  readonly end: number;
}

interface StaticPerlPackage {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface StaticPerlFunction {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface StaticDancer2Route {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly start: number;
  readonly end: number;
}

interface StaticPerlFacts {
  readonly valid: boolean;
  readonly declarations: readonly StaticPerlDeclaration[];
  readonly package: StaticPerlPackage | null;
  readonly functions: readonly StaticPerlFunction[];
  readonly routes: readonly StaticDancer2Route[];
}

type StaticPerlDeclarationKind = "package" | "function" | "class";

interface StaticPerlDeclaration {
  readonly kind: StaticPerlDeclarationKind;
  readonly name: string;
  readonly packageName: string | null;
  readonly start: number;
  readonly end: number;
}

interface LexicalPerlTokens {
  readonly valid: boolean;
  readonly tokens: readonly PerlToken[];
}

interface DelimiterPairs {
  readonly valid: boolean;
  readonly pairs: ReadonlyMap<number, number>;
}

const DANCER2_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  del: "DELETE",
  options: "OPTIONS"
};

const OPEN_TO_CLOSE: ReadonlyMap<string, string> = new Map([
  ["{", "}"],
  ["[", "]"],
  ["(", ")"]
]);

const CLOSE_TO_OPEN: ReadonlyMap<string, string> = new Map([
  ["}", "{"],
  ["]", "["],
  [")", "("]
]);

function isPerlWordStart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z_]/u.test(value);
}

function isPerlWordPart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_]/u.test(value);
}

function isSimplePerlIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value);
}

function perlQuoteLikeAt(sourceText: string, start: number): { readonly end: number } | null | false {
  const prefix = ["qq", "qw", "qx", "qr", "q"].find((candidate) => sourceText.startsWith(candidate, start));
  if (prefix === undefined) {
    return null;
  }
  const delimiter = sourceText[start + prefix.length];
  if (delimiter === undefined || /[\sA-Za-z0-9_]/u.test(delimiter)) {
    return null;
  }
  const pairedClose: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}", "<": ">" };
  const close = pairedClose[delimiter] ?? delimiter;
  let depth = 0;
  let index = start + prefix.length + 1;
  while (index < sourceText.length) {
    const value = sourceText[index];
    if (value === "\\") {
      index += 2;
      continue;
    }
    if (delimiter !== close && value === delimiter) depth += 1;
    if (value === close) {
      if (delimiter === close || depth === 0) return { end: index + 1 };
      depth -= 1;
    }
    index += 1;
  }
  return false;
}

function isPerlPackageName(value: string): boolean {
  return /^(?:[A-Za-z_][A-Za-z0-9_]*)(?:::[A-Za-z_][A-Za-z0-9_]*)*$/u.test(value);
}

function lexPerl(sourceText: string): LexicalPerlTokens {
  const tokens: PerlToken[] = [];
  let index = 0;

  while (index < sourceText.length) {
    const current = sourceText[index];
    if (current === undefined) {
      break;
    }

    if (/\s/u.test(current)) {
      index += 1;
      continue;
    }

    if (current === "#") {
      const nextLine = sourceText.indexOf("\n", index);
      index = nextLine === -1 ? sourceText.length : nextLine + 1;
      continue;
    }

    const quoteLike = perlQuoteLikeAt(sourceText, index);
    if (quoteLike !== null) {
      if (quoteLike === false) {
        return { valid: false, tokens: [] };
      }
      const start = index;
      index = quoteLike.end;
      tokens.push({
        kind: "string",
        text: sourceText.slice(start, index),
        value: sourceText.slice(start, index),
        escaped: false,
        start,
        end: index
      });
      continue;
    }

    if (current === "'" || current === "\"") {
      const start = index;
      const quote = current;
      let escaped = false;
      index += 1;
      let closed = false;
      while (index < sourceText.length) {
        const value = sourceText[index];
        if (value === "\\") {
          escaped = true;
          index += 1;
          if (index >= sourceText.length) {
            return { valid: false, tokens: [] };
          }
          index += 1;
          continue;
        }
        if (value === quote) {
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) {
        return { valid: false, tokens: [] };
      }
      tokens.push({
        kind: "string",
        text: sourceText.slice(start, index),
        value: sourceText.slice(start + 1, index - 1),
        escaped,
        start,
        end: index
      });
      continue;
    }

    if (isPerlWordStart(current)) {
      const start = index;
      index += 1;
      while (isPerlWordPart(sourceText[index])) {
        index += 1;
      }
      while (
        sourceText.slice(index, index + 2) === "::" &&
        isPerlWordStart(sourceText[index + 2])
      ) {
        index += 3;
        while (isPerlWordPart(sourceText[index])) {
          index += 1;
        }
      }
      tokens.push({
        kind: "word",
        text: sourceText.slice(start, index),
        value: undefined,
        escaped: undefined,
        start,
        end: index
      });
      continue;
    }

    const start = index;
    const paired = sourceText.slice(index, index + 2);
    if (paired === "=>" || paired === "\\&") {
      index += 2;
    } else {
      index += 1;
    }
    tokens.push({
      kind: "symbol",
      text: sourceText.slice(start, index),
      value: undefined,
      escaped: undefined,
      start,
      end: index
    });
  }

  return { valid: true, tokens };
}

function delimiterPairs(tokens: readonly PerlToken[]): DelimiterPairs {
  const pairs = new Map<number, number>();
  const stack: number[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "symbol") {
      continue;
    }
    if (OPEN_TO_CLOSE.has(token.text)) {
      stack.push(index);
      continue;
    }
    const expectedOpen = CLOSE_TO_OPEN.get(token.text);
    if (expectedOpen === undefined) {
      continue;
    }
    const openIndex = stack.pop();
    if (openIndex === undefined || tokens[openIndex]?.text !== expectedOpen) {
      return { valid: false, pairs: new Map() };
    }
    pairs.set(openIndex, index);
  }

  return stack.length === 0 ? { valid: true, pairs } : { valid: false, pairs: new Map() };
}

function directPerlPackage(tokens: readonly PerlToken[], index: number): StaticPerlPackage | null {
  const keyword = tokens[index];
  const packageName = tokens[index + 1];
  const terminator = tokens[index + 2];
  if (
    keyword?.kind !== "word" ||
    keyword.text !== "package" ||
    packageName?.kind !== "word" ||
    !isPerlPackageName(packageName.text) ||
    terminator?.text !== ";"
  ) {
    return null;
  }
  return {
    name: packageName.text,
    start: keyword.start,
    end: terminator.end
  };
}

function isDirectDancer2Use(tokens: readonly PerlToken[], index: number): boolean {
  return (
    tokens[index]?.kind === "word" &&
    tokens[index]?.text === "use" &&
    tokens[index + 1]?.kind === "word" &&
    tokens[index + 1]?.text === "Dancer2" &&
    tokens[index + 2]?.text === ";"
  );
}

function directPerlFunction(
  tokens: readonly PerlToken[],
  index: number,
  pairs: ReadonlyMap<number, number>
): StaticPerlFunction | null {
  const keyword = tokens[index];
  const name = tokens[index + 1];
  const bodyOpen = tokens[index + 2];
  if (
    keyword?.kind !== "word" ||
    keyword.text !== "sub" ||
    name?.kind !== "word" ||
    !isSimplePerlIdentifier(name.text) ||
    bodyOpen?.text !== "{"
  ) {
    return null;
  }
  const closingIndex = pairs.get(index + 2);
  const closing = closingIndex === undefined ? undefined : tokens[closingIndex];
  if (closing === undefined) {
    return null;
  }
  return {
    name: name.text,
    start: keyword.start,
    end: closing.end
  };
}

function hasUnsafePerlB1SubBody(
  tokens: readonly PerlToken[],
  bodyOpen: number,
  bodyClose: number
): boolean {
  const unsafeWords = new Set([
    "BEGIN",
    "UNITCHECK",
    "CHECK",
    "INIT",
    "END",
    "eval",
    "evalbytes",
    "do",
    "require"
  ]);
  for (let index = bodyOpen + 1; index < bodyClose; index += 1) {
    const token = tokens[index];
    if (token === undefined) {
      continue;
    }
    if (
      token.kind === "word" &&
      [...unsafeWords].some((unsafeWord) => token.text === unsafeWord || token.text.endsWith("::" + unsafeWord))
    ) {
      return true;
    }
    if (token.kind === "word" && token.text === "undef" && ["&", "*"].includes(tokens[index + 1]?.text ?? "")) {
      return true;
    }
    if (token.text === "*" && tokens[index + 1]?.kind === "word") {
      return true;
    }
  }
  return false;
}

function hasOnlyPerlB1TopLevelForms(
  tokens: readonly PerlToken[],
  pairs: ReadonlyMap<number, number>
): boolean {
  let index = 0;
  while (index < tokens.length) {
    const packageFact = directPerlPackage(tokens, index);
    if (packageFact !== null) {
      index += 3;
      continue;
    }
    if (isDirectDancer2Use(tokens, index)) {
      index += 3;
      continue;
    }
    const functionFact = directPerlFunction(tokens, index, pairs);
    if (functionFact !== null) {
      const bodyOpen = index + 2;
      const bodyClose = pairs.get(bodyOpen);
      if (bodyClose === undefined) {
        return false;
      }
      if (hasUnsafePerlB1SubBody(tokens, bodyOpen, bodyClose)) {
        return false;
      }
      index = bodyClose + 1;
      continue;
    }
    if (directDancer2Route(tokens, index) !== null) {
      index += 6;
      continue;
    }
    return false;
  }
  return true;
}

function isLiteralSlashPath(
  token: PerlToken | undefined
): token is PerlToken & { readonly value: string; readonly escaped: false } {
  return (
    token?.kind === "string" &&
    token.value !== undefined &&
    token.escaped === false &&
    /^\/[^\s\\]*$/u.test(token.value)
  );
}

function directDancer2Route(tokens: readonly PerlToken[], index: number): StaticDancer2Route | null {
  const methodToken = tokens[index];
  const method = methodToken?.kind === "word" ? DANCER2_METHODS[methodToken.text] : undefined;
  const path = tokens[index + 1];
  const separator = tokens[index + 2];
  const coderef = tokens[index + 3];
  const handler = tokens[index + 4];
  const terminator = tokens[index + 5];
  if (
    method === undefined ||
    !isLiteralSlashPath(path) ||
    separator?.text !== "=>" ||
    coderef?.text !== "\\&" ||
    handler?.kind !== "word" ||
    !isSimplePerlIdentifier(handler.text) ||
    terminator?.text !== ";"
  ) {
    return null;
  }
  return {
    method,
    path: path.value,
    handlerName: handler.text,
    start: methodToken?.start ?? path.start,
    end: terminator.end
  };
}

function structuralPerlDeclarations(
  sourceText: string,
  tokens: readonly PerlToken[],
  pairs: ReadonlyMap<number, number>
): readonly StaticPerlDeclaration[] {
  const depths: number[] = [];
  let depth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    depths[index] = depth;
    if (token?.kind !== "symbol") continue;
    if (OPEN_TO_CLOSE.has(token.text)) depth += 1;
    else if (CLOSE_TO_OPEN.has(token.text)) depth -= 1;
  }
  const declarations: StaticPerlDeclaration[] = [];
  let currentPackage: string | null = null;
  const directStatement = (index: number): boolean => {
    const previous = tokens[index - 1];
    const current = tokens[index];
    if (current === undefined || previous === undefined || previous.text === ";") return true;
    return /\r|\n/u.test(sourceText.slice(previous.end, current.start));
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "word" || depths[index] !== 0 || !directStatement(index)) continue;
    const packageFact = directPerlPackage(tokens, index);
    if (packageFact !== null) {
      currentPackage = packageFact.name;
      declarations.push({ kind: "package", name: packageFact.name, packageName: null, start: packageFact.start, end: packageFact.end });
      continue;
    }
    if (token.text === "sub") {
      const nameToken = tokens[index + 1];
      if (nameToken?.kind !== "word" || !isPerlPackageName(nameToken.text) || nameToken.text.includes("::")) continue;
      let cursor = index + 2;
      let endToken: PerlToken | undefined;
      while (cursor < tokens.length) {
        const candidate = tokens[cursor];
        if (candidate === undefined) break;
        if (depths[cursor] === 0 && candidate.text === ";") {
          endToken = candidate;
          break;
        }
        if (depths[cursor] === 0 && candidate.text === "{") {
          const closeIndex = pairs.get(cursor);
          endToken = closeIndex === undefined ? undefined : tokens[closeIndex];
          break;
        }
        cursor += 1;
      }
      if (endToken === undefined) continue;
      declarations.push({ kind: "function", name: nameToken.text, packageName: currentPackage, start: token.start, end: endToken.end });
      continue;
    }
    if (token.text === "class" || token.text === "role") {
      const nameToken = tokens[index + 1];
      if (nameToken?.kind !== "word" || !isPerlPackageName(nameToken.text)) continue;
      let cursor = index + 2;
      while (cursor < tokens.length && depths[cursor] === 0 && tokens[cursor]?.text !== "{") cursor += 1;
      const closeIndex = tokens[cursor]?.text === "{" ? pairs.get(cursor) : undefined;
      const endToken = closeIndex === undefined ? undefined : tokens[closeIndex];
      if (endToken === undefined) continue;
      declarations.push({ kind: "class", name: nameToken.text, packageName: currentPackage, start: token.start, end: endToken.end });
    }
  }
  return declarations.sort((left, right) => left.start - right.start || left.end - right.end);
}

function staticPerlFacts(sourceText: string): StaticPerlFacts {
  const lexical = lexPerl(sourceText);
  if (!lexical.valid) {
    return { valid: false, declarations: [], package: null, functions: [], routes: [] };
  }
  const delimiters = delimiterPairs(lexical.tokens);
  if (!delimiters.valid) {
    return { valid: false, declarations: [], package: null, functions: [], routes: [] };
  }
  const declarations = structuralPerlDeclarations(sourceText, lexical.tokens, delimiters.pairs);

  const packages: StaticPerlPackage[] = [];
  const functions: StaticPerlFunction[] = [];
  const routes: StaticDancer2Route[] = [];
  let directDancer2UseCount = 0;
  let depth = 0;

  for (let index = 0; index < lexical.tokens.length; index += 1) {
    const token = lexical.tokens[index];
    if (token === undefined) {
      continue;
    }
    if (depth === 0) {
      const packageFact = directPerlPackage(lexical.tokens, index);
      if (packageFact !== null) {
        packages.push(packageFact);
      }
      if (isDirectDancer2Use(lexical.tokens, index)) {
        directDancer2UseCount += 1;
      }
      const functionFact = directPerlFunction(lexical.tokens, index, delimiters.pairs);
      if (functionFact !== null) {
        functions.push(functionFact);
      }
      const routeFact = directDancer2Route(lexical.tokens, index);
      if (routeFact !== null) {
        routes.push(routeFact);
      }
    }
    if (token.kind !== "symbol") {
      continue;
    }
    if (OPEN_TO_CLOSE.has(token.text)) {
      depth += 1;
    } else if (CLOSE_TO_OPEN.has(token.text)) {
      depth -= 1;
    }
  }

  const packageFact = packages.length === 1 ? packages[0] ?? null : null;
  return {
    valid: true,
    declarations,
    package: packageFact,
    functions,
    routes:
      directDancer2UseCount === 1 &&
      packages.length <= 1 &&
      hasOnlyPerlB1TopLevelForms(lexical.tokens, delimiters.pairs)
        ? routes
        : []
  };
}

function lineStartsFor(sourceText: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function positionFor(lineStarts: readonly number[], index: number): SourcePosition {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = lineStarts[middle];
    const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (start !== undefined && index >= start && index < next) {
      return { line: middle + 1, column: index - start + 1 };
    }
    if (start !== undefined && index < start) {
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  const finalStart = lineStarts.at(-1) ?? 0;
  return { line: lineStarts.length, column: Math.max(1, index - finalStart + 1) };
}

function rangeFor(lineStarts: readonly number[], start: number, end: number): SourceRange {
  return {
    start: positionFor(lineStarts, start),
    end: positionFor(lineStarts, Math.max(start, end))
  };
}

/**
 * Extracts direct Perl package/sub declarations and a narrow Dancer2 route subset.
 * Exact routes require a direct use Dancer2 proof and a unique same-file named sub coderef.
 */
export function extractPerlFileFacts(input: PerlExtractFileFactsInput): ArtifactFacts {
  const dancer2Capability = frameworkCapability("dancer2");
  if (!dancer2Capability.languages.includes(input.language)) {
    throw new Error("Dancer2 extraction was invoked for an unsupported source language.");
  }

  const staticFacts = staticPerlFacts(input.sourceText);
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

  function addPackage(packageFact: StaticPerlPackage): SymbolNode {
    const qualifiedName = input.filePath + "#" + packageFact.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: packageFact.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range: rangeFor(lineStarts, packageFact.start, packageFact.end),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, packageFact.start, packageFact.end);
    return symbol;
  }

  function addFunction(parent: SymbolNode, functionFact: StaticPerlFunction): SymbolNode {
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

  function addClassDeclaration(declaration: StaticPerlDeclaration, parent: SymbolNode): SymbolNode {
    const qualifiedName = parent.kind === "file"
      ? input.filePath + "#class:" + declaration.name
      : parent.qualifiedName + "." + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const symbol: SymbolNode = {
      id: createSymbolId({ filePath: input.filePath, qualifiedName, kind: "class", declarationOrdinal }),
      name: declaration.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range: rangeFor(lineStarts, declaration.start, declaration.end),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.start, declaration.end);
    return symbol;
  }

  function addDancer2Route(
    parent: SymbolNode,
    packageFact: StaticPerlPackage | null,
    routeFact: StaticDancer2Route,
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
    const referenceName =
      packageFact === null ? routeFact.handlerName : packageFact.name + "::" + routeFact.handlerName;
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
            ? "framework.dancer2.direct-route.literal-verb.unresolved-sub"
            : "framework.dancer2.direct-route.literal-verb.local-sub",
        stage: "syntax",
        candidateSymbolIds: handler === null ? [] : [handler.id]
      }
    });
  }

  const packageSymbols = new Map<string, SymbolNode>();
  const functionsByName = new Map<string, SymbolNode[]>();
  const structuralDeclarations = staticFacts.declarations.length > 0
    ? staticFacts.declarations
    : staticFacts.valid
      ? [
          ...(staticFacts.package === null ? [] : [{ kind: "package" as const, name: staticFacts.package.name, packageName: null, start: staticFacts.package.start, end: staticFacts.package.end }]),
          ...staticFacts.functions.map((functionFact) => ({ kind: "function" as const, name: functionFact.name, packageName: staticFacts.package?.name ?? null, start: functionFact.start, end: functionFact.end }))
        ]
      : [];
  for (const declaration of [...structuralDeclarations].sort((left, right) => left.start - right.start || left.end - right.end)) {
    if (declaration.kind === "package") {
      const symbol = addPackage({ name: declaration.name, start: declaration.start, end: declaration.end });
      packageSymbols.set(declaration.name, symbol);
      continue;
    }
    const parent = declaration.packageName === null ? fileNode : packageSymbols.get(declaration.packageName) ?? fileNode;
    const symbol = declaration.kind === "class"
      ? addClassDeclaration(declaration, parent)
      : addFunction(parent, { name: declaration.name, start: declaration.start, end: declaration.end });
    if (declaration.kind === "function") {
      functionsByName.set(declaration.name, [...(functionsByName.get(declaration.name) ?? []), symbol]);
    }
  }
  if (staticFacts.valid) {
    const routeParent = staticFacts.package === null
      ? fileNode
      : packageSymbols.get(staticFacts.package.name) ?? fileNode;
    for (const routeFact of [...staticFacts.routes].sort((left, right) => left.start - right.start)) {
      const candidates = functionsByName.get(routeFact.handlerName) ?? [];
      addDancer2Route(
        routeParent,
        staticFacts.package,
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
