import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type ReactNativeFacts,
  type ReactNativeSwiftExternalBridgeMethodFact,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

export interface ObjectiveCExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "objc";
}

interface ObjectiveCLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

type DirectObjectiveCContainerKind = "implementation" | "interface" | "protocol";

interface StaticObjectiveCContainer {
  readonly kind: DirectObjectiveCContainerKind;
  readonly name: string;
  readonly superclass: StaticObjectiveCSuperclass | null;
  readonly start: number;
  readonly end: number;
  readonly bodyStartLine: number;
  readonly endLine: number;
}

interface StaticObjectiveCSuperclass {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

interface StaticObjectiveCMethod {
  readonly name: string;
  readonly polarity?: "+" | "-";
  readonly start: number;
  readonly end: number;
}

type ReactNativeObjectiveCMethodRuleId =
  | "framework.react-native.objc.rct-export-method"
  | "framework.react-native.objc.rct-remap-method"
  | "framework.react-native.objc.rct-extern-method"
  | "framework.react-native.objc.rct-extern-remap-method"
  | "framework.react-native.objc.rct-extern-blocking-synchronous-method";

type ReactNativeObjectiveCExternModuleRuleId =
  | "framework.react-native.objc.rct-extern-module"
  | "framework.react-native.objc.rct-extern-remap-module";

interface StaticReactNativeObjectiveCMethod extends StaticObjectiveCMethod {
  readonly reactNativeRuleId: ReactNativeObjectiveCMethodRuleId;
}

interface StaticReactNativeObjectiveCExternMethod extends StaticReactNativeObjectiveCMethod {
  /** Full Objective-C selector declared by the external bridge macro. */
  readonly selector: string;
}

interface StaticReactNativeObjectiveCModule {
  readonly moduleName: string;
  readonly methods: readonly StaticReactNativeObjectiveCMethod[];
}

/** One source-proven Objective-C declaration that exports an external Swift or private class. */
interface StaticReactNativeObjectiveCExternModule {
  readonly objcClassName: string;
  readonly moduleName: string;
  readonly container: StaticObjectiveCContainer;
  readonly reactNativeRuleId: ReactNativeObjectiveCExternModuleRuleId;
  readonly methods: readonly StaticReactNativeObjectiveCExternMethod[];
}

interface SanitizedObjectiveCSource {
  readonly valid: boolean;
  readonly text: string;
  readonly hasReactNativeBridgeImport: boolean;
}

type ObjectiveCLexicalMode =
  | "block-comment"
  | "line-comment"
  | "single-quoted-literal"
  | "double-quoted-literal"
  | null;

const DIRECT_IMPLEMENTATION_HEADER =
  /^[ \t]*@implementation[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*$/u;
const DIRECT_INTERFACE_HEADER =
  /^[ \t]*@interface[ \t]+([A-Za-z_][A-Za-z0-9_]*)(.*)$/u;
const DIRECT_EMPTY_INLINE_INTERFACE =
  /^[ \t]*@interface[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]+@end[ \t]*$/u;
const DIRECT_PROTOCOL_HEADER =
  /^[ \t]*@protocol[ \t]+([A-Za-z_][A-Za-z0-9_]*)(.*)$/u;
const DIRECT_END_DIRECTIVE = /^[ \t]*@end[ \t]*$/u;
const OBJECTIVE_C_CONTAINER_DIRECTIVE = /^[ \t]*@(interface|implementation|protocol)\b/u;
const REACT_NATIVE_BRIDGE_HEADER =
  /^[ \t]*#\s*import[ \t]+[<"]React\/RCTBridgeModule\.h[>"][ \t]*$/mu;
const REACT_NATIVE_BRIDGE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const DIRECT_PROTOCOL_LIST =
  /^<[ \t]*[A-Za-z_][A-Za-z0-9_]*(?:[ \t]*,[ \t]*[A-Za-z_][A-Za-z0-9_]*)*[ \t]*>$/u;
const DIRECT_INTERFACE_SUFFIX =
  /^(?::[ \t]*[A-Za-z_][A-Za-z0-9_]*(?:[ \t]*<[ \t]*[A-Za-z_][A-Za-z0-9_]*(?:[ \t]*,[ \t]*[A-Za-z_][A-Za-z0-9_]*)*[ \t]*>)?|<[ \t]*[A-Za-z_][A-Za-z0-9_]*(?:[ \t]*,[ \t]*[A-Za-z_][A-Za-z0-9_]*)*[ \t]*>)$/u;
const DIRECT_RCT_EXTERN_MODULE_HEADER =
  /^[ \t]*@interface[ \t]+RCT_EXTERN_MODULE[ \t]*\([ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*,[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*\)[ \t]*$/u;
const DIRECT_RCT_EXTERN_REMAP_MODULE_HEADER =
  /^[ \t]*@interface[ \t]+RCT_EXTERN_REMAP_MODULE[ \t]*\([ \t]*([A-Za-z_$][A-Za-z0-9_$]*)?[ \t]*,[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*,[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*\)[ \t]*$/u;

/**
 * React Native exposes a no-argument RCT_EXPORT_MODULE() under the
 * implementation class name after trimming its documented RCT or RK prefix.
 */
function staticReactNativeObjectiveCDefaultModuleName(className: string): string {
  if (className.startsWith("RCT") && className.length > 3) {
    return className.slice(3);
  }
  if (className.startsWith("RK") && className.length > 2) {
    return className.slice(2);
  }
  return className;
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

function rangeFor(
  lineStarts: readonly number[],
  from: number,
  to: number
): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function blankCharacter(characters: string[], index: number): void {
  const character = characters[index];
  if (character !== undefined && character !== "\r" && character !== "\n") {
    characters[index] = " ";
  }
}

function isNewline(character: string): boolean {
  return character === "\r" || character === "\n";
}

function isHorizontalWhitespace(character: string): boolean {
  return character === " " || character === "\t";
}

function isObjectiveCPreprocessorWhitespace(character: string): boolean {
  return isHorizontalWhitespace(character) || character === "\f" || character === "\v";
}

interface ObjectiveCConditionalFrame {
  sawElse: boolean;
}

function blankObjectiveCRange(characters: string[], start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    blankCharacter(characters, index);
  }
}

/**
 * No build defines are available to the extractor, so every conditional branch
 * is unknown and therefore cannot prove an exact source fact. Directives must
 * still form one balanced stack; malformed stacks invalidate the whole file.
 */
function applyObjectiveCPreprocessorSafety(
  sourceText: string,
  sanitizedText: string,
  directiveStarts: ReadonlySet<number>
): SanitizedObjectiveCSource {
  const characters = sanitizedText.split("");
  const stack: ObjectiveCConditionalFrame[] = [];
  const lines = linesFor(sourceText);
  const orderedDirectiveStarts = [...directiveStarts];
  let directiveIndex = 0;
  let hasReactNativeBridgeImport = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      return { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
    }
    while ((orderedDirectiveStarts[directiveIndex] ?? Number.POSITIVE_INFINITY) < line.start) {
      directiveIndex += 1;
    }
    const candidateDirectiveStart = orderedDirectiveStarts[directiveIndex];
    const directiveStart =
      candidateDirectiveStart !== undefined && candidateDirectiveStart < line.end
        ? candidateDirectiveStart
        : undefined;
    if (directiveStart !== undefined) {
      directiveIndex += 1;
      let directiveEndLine = lineIndex;
      while ((lines[directiveEndLine]?.text ?? "").endsWith("\\")) {
        directiveEndLine += 1;
        if (directiveEndLine >= lines.length) {
          return { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
        }
      }
      const directiveText = sourceText.slice(directiveStart, line.end);
      const directive = /^\s*#\s*([A-Za-z_][A-Za-z0-9_]*)\b(.*)$/u.exec(directiveText);
      if (directive === null) {
        return { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
      }
      const keyword = directive[1]?.toLowerCase();
      const argument = directive[2]?.trim() ?? "";
      if (keyword === "if" || keyword === "ifdef" || keyword === "ifndef") {
        if (
          argument.length === 0 ||
          ((keyword === "ifdef" || keyword === "ifndef") &&
            !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(argument))
        ) {
          return { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
        }
        stack.push({ sawElse: false });
      } else if (keyword === "elif") {
        const frame = stack.at(-1);
        if (frame === undefined || frame.sawElse || argument.length === 0) {
          return { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
        }
      } else if (keyword === "else") {
        const frame = stack.at(-1);
        if (frame === undefined || frame.sawElse || argument.length !== 0) {
          return { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
        }
        frame.sawElse = true;
      } else if (keyword === "endif") {
        if (stack.length === 0 || argument.length !== 0) {
          return { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
        }
        stack.pop();
      } else if (
        stack.length === 0 &&
        directiveEndLine === lineIndex &&
        REACT_NATIVE_BRIDGE_HEADER.test(directiveText)
      ) {
        hasReactNativeBridgeImport = true;
      }

      const lastDirectiveLine = lines[directiveEndLine];
      if (lastDirectiveLine === undefined) {
        return { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
      }
      blankObjectiveCRange(characters, line.start, lastDirectiveLine.end);
      lineIndex = directiveEndLine;
      continue;
    }

    if (stack.length > 0) {
      blankObjectiveCRange(characters, line.start, line.end);
    }
  }

  return stack.length === 0
    ? { valid: true, text: characters.join(""), hasReactNativeBridgeImport }
    : { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
}

function hasBalancedObjectiveCDelimiters(sourceText: string): boolean {
  const stack: string[] = [];
  const closingFor: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}" };
  for (const character of sourceText) {
    if (character === "(" || character === "[" || character === "{") {
      stack.push(character);
      continue;
    }
    if (character === ")" || character === "]" || character === "}") {
      const opening = stack.pop();
      if (opening === undefined || closingFor[opening] !== character) {
        return false;
      }
    }
  }
  return stack.length === 0;
}

/**
 * Blanks C-family comments, quoted literals, and preprocessor directives
 * without changing offsets. This intentionally avoids parsing Objective-C;
 * it only protects the narrow direct-declaration matcher below from text that
 * cannot prove a declaration.
 */
function sanitizeObjectiveC(sourceText: string): SanitizedObjectiveCSource {
  const characters = sourceText.split("");
  const directiveStarts = new Set<number>();
  let mode: ObjectiveCLexicalMode = null;
  let escaped = false;
  let atLineStart = true;
  let inPreprocessorDirective = false;
  let lastDirectiveNonWhitespace = "";

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];
    if (character === undefined) {
      continue;
    }

    if (mode === "block-comment") {
      if (character === "*" && next === "/") {
        blankCharacter(characters, index);
        blankCharacter(characters, index + 1);
        index += 1;
        mode = null;
        continue;
      }
      if (isNewline(character)) {
        atLineStart = true;
      } else {
        blankCharacter(characters, index);
      }
      continue;
    }

    if (mode === "line-comment") {
      if (isNewline(character)) {
        mode = null;
        atLineStart = true;
      } else {
        blankCharacter(characters, index);
      }
      continue;
    }

    if (mode === "single-quoted-literal" || mode === "double-quoted-literal") {
      if (isNewline(character)) {
        return { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
      }
      blankCharacter(characters, index);
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (
        (mode === "single-quoted-literal" && character === "'") ||
        (mode === "double-quoted-literal" && character === "\"")
      ) {
        mode = null;
      }
      continue;
    }

    if (inPreprocessorDirective) {
      if (isNewline(character)) {
        inPreprocessorDirective = lastDirectiveNonWhitespace === "\\";
        lastDirectiveNonWhitespace = "";
        atLineStart = true;
      } else {
        blankCharacter(characters, index);
        if (!isHorizontalWhitespace(character)) {
          lastDirectiveNonWhitespace = character;
        }
      }
      continue;
    }

    if (isNewline(character)) {
      atLineStart = true;
      continue;
    }

    if (atLineStart && isObjectiveCPreprocessorWhitespace(character)) {
      continue;
    }

    if (atLineStart && character === "#") {
      directiveStarts.add(index);
      blankCharacter(characters, index);
      inPreprocessorDirective = true;
      lastDirectiveNonWhitespace = "#";
      atLineStart = false;
      continue;
    }

    if (character === "/" && next === "*") {
      blankCharacter(characters, index);
      blankCharacter(characters, index + 1);
      index += 1;
      mode = "block-comment";
      continue;
    }
    if (character === "/" && next === "/") {
      blankCharacter(characters, index);
      blankCharacter(characters, index + 1);
      index += 1;
      mode = "line-comment";
      continue;
    }
    atLineStart = false;
    if (character === "'") {
      blankCharacter(characters, index);
      mode = "single-quoted-literal";
      escaped = false;
      continue;
    }
    if (character === "\"") {
      blankCharacter(characters, index);
      mode = "double-quoted-literal";
      escaped = false;
    }
  }

  const lexicallyValid =
    mode !== "block-comment" &&
    mode !== "single-quoted-literal" &&
    mode !== "double-quoted-literal" &&
    !(inPreprocessorDirective && lastDirectiveNonWhitespace === "\\");
  if (!lexicallyValid) {
    return { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
  }
  const preprocessed = applyObjectiveCPreprocessorSafety(
    sourceText,
    characters.join(""),
    directiveStarts
  );
  return preprocessed.valid && hasBalancedObjectiveCDelimiters(preprocessed.text)
    ? preprocessed
    : { valid: false, text: sourceText, hasReactNativeBridgeImport: false };
}

function linesFor(sourceText: string): readonly ObjectiveCLine[] {
  const lines: ObjectiveCLine[] = [];
  let start = 0;

  while (start <= sourceText.length) {
    const newline = sourceText.indexOf("\n", start);
    const rawEnd = newline === -1 ? sourceText.length : newline;
    const end = rawEnd > start && sourceText.charAt(rawEnd - 1) === "\r" ? rawEnd - 1 : rawEnd;
    lines.push({ start, end, text: sourceText.slice(start, end) });
    if (newline === -1) {
      break;
    }
    start = newline + 1;
  }

  return lines;
}

function firstCodeOffset(line: ObjectiveCLine): number {
  return line.start + (line.text.length - line.text.trimStart().length);
}

function directContainerHeader(
  line: ObjectiveCLine
): {
  readonly kind: DirectObjectiveCContainerKind;
  readonly name: string;
  readonly superclass: StaticObjectiveCSuperclass | null;
} | null {
  const implementation = DIRECT_IMPLEMENTATION_HEADER.exec(line.text);
  if (implementation !== null) {
    const name = implementation[1];
    return name === undefined ? null : { kind: "implementation", name, superclass: null };
  }

  const interfaceHeader = DIRECT_INTERFACE_HEADER.exec(line.text);
  if (interfaceHeader !== null) {
    const name = interfaceHeader[1];
    const suffix = interfaceHeader[2]?.trim() ?? "";
    if (name !== undefined && (suffix === "" || DIRECT_INTERFACE_SUFFIX.test(suffix))) {
      const superclassMatch = /^:[ \t]*([A-Za-z_][A-Za-z0-9_]*)\b/u.exec(suffix);
      const superclassName = superclassMatch?.[1];
      const afterClassName = line.text.indexOf(name) + name.length;
      const superclassOffset =
        superclassName === undefined ? -1 : line.text.indexOf(superclassName, afterClassName);
      return {
        kind: "interface",
        name,
        superclass:
          superclassName === undefined || superclassOffset < 0
            ? null
            : {
                name: superclassName,
                start: line.start + superclassOffset,
                end: line.start + superclassOffset + superclassName.length
              }
      };
    }
    return null;
  }

  const protocol = DIRECT_PROTOCOL_HEADER.exec(line.text);
  if (protocol !== null) {
    const name = protocol[1];
    const suffix = protocol[2]?.trim() ?? "";
    if (name !== undefined && (suffix === "" || DIRECT_PROTOCOL_LIST.test(suffix))) {
      return { kind: "protocol", name, superclass: null };
    }
  }

  return null;
}

function skipObjectiveCInlineTrivia(sourceText: string, from: number): number | null {
  let cursor = from;
  while (cursor < sourceText.length) {
    const character = sourceText.charAt(cursor);
    if (isHorizontalWhitespace(character)) {
      cursor += 1;
      continue;
    }
    if (sourceText.startsWith("/*", cursor)) {
      const closing = sourceText.indexOf("*/", cursor + 2);
      if (closing === -1) {
        return null;
      }
      cursor = closing + 2;
      continue;
    }
    if (sourceText.startsWith("//", cursor)) {
      return sourceText.length;
    }
    break;
  }
  return cursor;
}

/** Re-proves the inline-empty grammar without treating literals as trivia. */
function isDirectEmptyInlineInterfaceSourceLine(
  sourceText: string,
  expectedName: string
): boolean {
  let cursor = skipObjectiveCInlineTrivia(sourceText, 0);
  if (cursor === null || !sourceText.startsWith("@interface", cursor)) {
    return false;
  }
  cursor += "@interface".length;
  const nameStart = skipObjectiveCInlineTrivia(sourceText, cursor);
  if (nameStart === null || nameStart === cursor || !sourceText.startsWith(expectedName, nameStart)) {
    return false;
  }
  cursor = nameStart + expectedName.length;
  if (isIdentifierPart(sourceText.charAt(cursor))) {
    return false;
  }
  const endStart = skipObjectiveCInlineTrivia(sourceText, cursor);
  if (endStart === null || endStart === cursor || !sourceText.startsWith("@end", endStart)) {
    return false;
  }
  cursor = endStart + "@end".length;
  const end = skipObjectiveCInlineTrivia(sourceText, cursor);
  return end === sourceText.length;
}

function collectDirectContainers(
  lines: readonly ObjectiveCLine[],
  sourceText: string
): readonly StaticObjectiveCContainer[] | null {
  const containers: StaticObjectiveCContainer[] = [];
  const identities = new Set<string>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      return null;
    }
    const emptyInlineInterface = DIRECT_EMPTY_INLINE_INTERFACE.exec(line.text);
    if (emptyInlineInterface !== null) {
      const name = emptyInlineInterface[1];
      if (
        name === undefined ||
        !isDirectEmptyInlineInterfaceSourceLine(sourceText.slice(line.start, line.end), name)
      ) {
        return null;
      }
      const identity = "interface\u0000" + name;
      if (identities.has(identity)) {
        return null;
      }
      identities.add(identity);
      containers.push({
        kind: "interface",
        name,
        superclass: null,
        start: firstCodeOffset(line),
        end: line.end,
        bodyStartLine: lineIndex + 1,
        endLine: lineIndex
      });
      continue;
    }
    const header = directContainerHeader(line);
    if (header === null) {
      if (DIRECT_END_DIRECTIVE.test(line.text)) {
        return null;
      }
      // Categories, class extensions, and React Native extern macro
      // containers are deliberately outside this direct-container subset.
      // Skip one complete unsupported container so its own @end is not
      // mistaken for a stray top-level terminator.
      if (OBJECTIVE_C_CONTAINER_DIRECTIVE.test(line.text)) {
        let unsupportedEndLine = lineIndex + 1;
        for (; unsupportedEndLine < lines.length; unsupportedEndLine += 1) {
          const candidate = lines[unsupportedEndLine];
          if (candidate === undefined) {
            return null;
          }
          if (DIRECT_END_DIRECTIVE.test(candidate.text)) {
            break;
          }
          if (OBJECTIVE_C_CONTAINER_DIRECTIVE.test(candidate.text)) {
            return null;
          }
        }
        if (lines[unsupportedEndLine] === undefined) {
          return null;
        }
        lineIndex = unsupportedEndLine;
      }
      continue;
    }
    const identity = header.kind + "\u0000" + header.name;
    if (identities.has(identity)) {
      return null;
    }

    let endLine = lineIndex + 1;
    for (; endLine < lines.length; endLine += 1) {
      const candidate = lines[endLine];
      if (candidate === undefined) {
        return null;
      }
      if (DIRECT_END_DIRECTIVE.test(candidate.text)) {
        break;
      }
      if (OBJECTIVE_C_CONTAINER_DIRECTIVE.test(candidate.text)) {
        return null;
      }
    }
    const end = lines[endLine];
    if (end === undefined) {
      return null;
    }

    identities.add(identity);
    containers.push({
      kind: header.kind,
      name: header.name,
      superclass: header.superclass,
      start: firstCodeOffset(line),
      end: end.end,
      bodyStartLine: lineIndex + 1,
      endLine
    });
    lineIndex = endLine;
  }

  return containers;
}

function isIdentifierStart(character: string | undefined): boolean {
  return (
    character !== undefined &&
    ((character >= "A" && character <= "Z") ||
      (character >= "a" && character <= "z") ||
      character === "_")
  );
}

function isIdentifierPart(character: string | undefined): boolean {
  return isIdentifierStart(character) || (character !== undefined && character >= "0" && character <= "9");
}

function skipHorizontalWhitespace(sourceText: string, index: number, limit: number): number {
  let cursor = index;
  while (cursor < limit && isHorizontalWhitespace(sourceText.charAt(cursor))) {
    cursor += 1;
  }
  return cursor;
}

function identifierAt(
  sourceText: string,
  index: number,
  limit: number
): { readonly name: string; readonly end: number } | null {
  if (!isIdentifierStart(sourceText.charAt(index))) {
    return null;
  }
  let end = index + 1;
  while (end < limit && isIdentifierPart(sourceText.charAt(end))) {
    end += 1;
  }
  return { name: sourceText.slice(index, end), end };
}

function closingParenthesisOnLine(
  sourceText: string,
  opening: number,
  lineEnd: number
): number | null {
  let depth = 0;
  for (let index = opening; index < lineEnd; index += 1) {
    const character = sourceText.charAt(index);
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
      if (depth < 0) {
        return null;
      }
    }
  }
  return null;
}

function matchingBrace(
  sourceText: string,
  opening: number,
  limit: number
): number | null {
  let depth = 0;
  for (let index = opening; index < limit; index += 1) {
    const character = sourceText.charAt(index);
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
      if (depth < 0) {
        return null;
      }
    }
  }
  return null;
}

type DirectObjectiveCMethodResult = StaticObjectiveCMethod | "malformed" | null;

function directMethodOnLine(
  sourceText: string,
  line: ObjectiveCLine,
  containerEnd: number,
  form: "declaration" | "implementation"
): DirectObjectiveCMethodResult {
  let cursor = skipHorizontalWhitespace(sourceText, line.start, line.end);
  const start = cursor;
  const polarity = sourceText.charAt(cursor);
  if (polarity !== "-" && polarity !== "+") {
    return null;
  }
  cursor = skipHorizontalWhitespace(sourceText, cursor + 1, line.end);
  if (sourceText.charAt(cursor) !== "(") {
    return null;
  }
  const returnTypeEnd = closingParenthesisOnLine(sourceText, cursor, line.end);
  if (returnTypeEnd === null) {
    return null;
  }
  cursor = skipHorizontalWhitespace(sourceText, returnTypeEnd + 1, line.end);
  const firstSelectorPart = identifierAt(sourceText, cursor, line.end);
  if (firstSelectorPart === null) {
    return null;
  }

  const selectorParts = [firstSelectorPart.name];
  cursor = firstSelectorPart.end;
  const terminator = form === "implementation" ? "{" : ";";
  if (sourceText.charAt(cursor) === ":") {
    selectorParts[0] = firstSelectorPart.name + ":";
    cursor += 1;
    while (true) {
      cursor = skipHorizontalWhitespace(sourceText, cursor, line.end);
      if (sourceText.charAt(cursor) !== "(") {
        return null;
      }
      const parameterTypeEnd = closingParenthesisOnLine(sourceText, cursor, line.end);
      if (parameterTypeEnd === null) {
        return null;
      }
      cursor = skipHorizontalWhitespace(sourceText, parameterTypeEnd + 1, line.end);
      const parameter = identifierAt(sourceText, cursor, line.end);
      if (parameter === null) {
        return null;
      }
      cursor = skipHorizontalWhitespace(sourceText, parameter.end, line.end);
      if (sourceText.charAt(cursor) === terminator) {
        break;
      }
      const nextSelectorPart = identifierAt(sourceText, cursor, line.end);
      if (nextSelectorPart === null) {
        return null;
      }
      cursor = skipHorizontalWhitespace(sourceText, nextSelectorPart.end, line.end);
      if (sourceText.charAt(cursor) !== ":") {
        return null;
      }
      selectorParts.push(nextSelectorPart.name + ":");
      cursor += 1;
    }
  } else {
    cursor = skipHorizontalWhitespace(sourceText, cursor, line.end);
    if (sourceText.charAt(cursor) !== terminator) {
      return null;
    }
  }

  if (form === "declaration") {
    const end = cursor + 1;
    return skipHorizontalWhitespace(sourceText, end, line.end) === line.end
      ? { name: selectorParts.join(""), polarity, start, end }
      : "malformed";
  }

  const end = matchingBrace(sourceText, cursor, containerEnd);
  if (end === null) {
    return null;
  }
  const lineFeed = sourceText.indexOf("\n", end + 1);
  const rawLineEnd = lineFeed === -1 ? sourceText.length : lineFeed;
  const physicalLineEnd =
    rawLineEnd > end + 1 && sourceText.charAt(rawLineEnd - 1) === "\r"
      ? rawLineEnd - 1
      : rawLineEnd;
  let suffix = end + 1;
  while (
    suffix < physicalLineEnd &&
    isObjectiveCPreprocessorWhitespace(sourceText.charAt(suffix))
  ) {
    suffix += 1;
  }
  return suffix === physicalLineEnd
    ? { name: selectorParts.join(""), polarity, start, end: end + 1 }
    : "malformed";
}

function directMethodsInContainer(
  sourceText: string,
  lines: readonly ObjectiveCLine[],
  container: StaticObjectiveCContainer
): readonly StaticObjectiveCMethod[] | null {
  const methods: StaticObjectiveCMethod[] = [];
  const methodIdentities = new Set<string>();
  let braceDepth = 0;
  const endLine = lines[container.endLine];
  if (endLine === undefined) {
    return null;
  }

  for (
    let lineIndex = container.bodyStartLine;
    lineIndex < container.endLine;
    lineIndex += 1
  ) {
    const line = lines[lineIndex];
    if (line === undefined) {
      return null;
    }
    if (braceDepth === 0) {
      const method = directMethodOnLine(
        sourceText,
        line,
        endLine.start,
        container.kind === "implementation" ? "implementation" : "declaration"
      );
      if (method === "malformed") {
        return null;
      }
      if (method !== null) {
        const identity = (method.polarity ?? "") + method.name;
        if (methodIdentities.has(identity)) {
          return null;
        }
        methodIdentities.add(identity);
        methods.push(method);
      }
    }

    for (let offset = line.start; offset < line.end; offset += 1) {
      const character = sourceText.charAt(offset);
      if (character === "{") {
        braceDepth += 1;
      } else if (character === "}") {
        braceDepth -= 1;
        if (braceDepth < 0) {
          return null;
        }
      }
    }
  }

  return braceDepth === 0 ? methods : null;
}

function objectiveCMethodCandidateKey(method: StaticObjectiveCMethod): string {
  return (method.polarity ?? "") + "\u0000" + method.name;
}

function objectiveCSelectorsWithBothPolarities(
  methods: readonly StaticObjectiveCMethod[]
): ReadonlySet<string> {
  const polaritiesBySelector = new Map<string, Set<string>>();
  for (const method of methods) {
    if (method.polarity === undefined) {
      continue;
    }
    const polarities = polaritiesBySelector.get(method.name) ?? new Set<string>();
    polarities.add(method.polarity);
    polaritiesBySelector.set(method.name, polarities);
  }
  return new Set(
    [...polaritiesBySelector.entries()]
      .filter(([, polarities]) => polarities.size > 1)
      .map(([selector]) => selector)
  );
}

/** True only for a macro written directly in one implementation body. */
function isDirectObjectiveCContainerMember(
  sanitizedSource: string,
  container: StaticObjectiveCContainer,
  offset: number
): boolean {
  let braceDepth = 0;
  for (let index = container.start; index < offset; index += 1) {
    const character = sanitizedSource[index];
    if (character === "{") {
      braceDepth += 1;
    } else if (character === "}") {
      braceDepth -= 1;
      if (braceDepth < 0) {
        return false;
      }
    }
  }
  return braceDepth === 0;
}

/**
 * Retains one direct Objective-C React Native module only after a bridge-header
 * import, exactly one module macro, and one or more unique export macros.
 */
function staticReactNativeObjectiveCModule(
  sanitizedSource: string,
  container: StaticObjectiveCContainer,
  hasReactNativeBridgeImport: boolean
): StaticReactNativeObjectiveCModule | null {
  if (container.kind !== "implementation" || !hasReactNativeBridgeImport) {
    return null;
  }
  const body = sanitizedSource.slice(container.start, container.end);
  const moduleMacros = [...body.matchAll(/\bRCT_EXPORT_MODULE\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)?\s*\)/gu)].filter(
    (match) =>
      match.index !== undefined &&
      isDirectObjectiveCContainerMember(sanitizedSource, container, container.start + match.index)
  );
  if (moduleMacros.length !== 1 || moduleMacros[0] === undefined) {
    return null;
  }
  const moduleName = moduleMacros[0][1] ?? staticReactNativeObjectiveCDefaultModuleName(container.name);
  if (!REACT_NATIVE_BRIDGE_IDENTIFIER.test(moduleName)) {
    return null;
  }
  const methods: StaticReactNativeObjectiveCMethod[] = [];
  const seenMethodNames = new Set<string>();
  for (const match of body.matchAll(/\bRCT_EXPORT_METHOD\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\b/gu)) {
    if (match.index === undefined) {
      return null;
    }
    const start = container.start + match.index;
    const name = match[1];
    if (
      name === undefined ||
      !isDirectObjectiveCContainerMember(sanitizedSource, container, start) ||
      seenMethodNames.has(name)
    ) {
      return null;
    }
    seenMethodNames.add(name);
    methods.push({
      start,
      end: start + match[0].length,
      name,
      reactNativeRuleId: "framework.react-native.objc.rct-export-method"
    });
  }
  for (
    const match of body.matchAll(
      /\bRCT_REMAP_METHOD\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*([A-Za-z_$][A-Za-z0-9_$]*)\b/gu
    )
  ) {
    if (match.index === undefined) {
      return null;
    }
    const start = container.start + match.index;
    const name = match[1];
    if (
      name === undefined ||
      !isDirectObjectiveCContainerMember(sanitizedSource, container, start) ||
      seenMethodNames.has(name)
    ) {
      return null;
    }
    seenMethodNames.add(name);
    methods.push({
      start,
      end: start + match[0].length,
      name,
      reactNativeRuleId: "framework.react-native.objc.rct-remap-method"
    });
  }
  return methods.length === 0 ? null : { moduleName, methods };
}

function directReactNativeObjectiveCExternModuleHeader(
  line: ObjectiveCLine
): {
  readonly objcClassName: string;
  readonly moduleName: string;
  readonly reactNativeRuleId: ReactNativeObjectiveCExternModuleRuleId;
} | null {
  const direct = DIRECT_RCT_EXTERN_MODULE_HEADER.exec(line.text);
  if (direct !== null) {
    const objcClassName = direct[1];
    return objcClassName === undefined
      ? null
      : {
          objcClassName,
          moduleName: objcClassName,
          reactNativeRuleId: "framework.react-native.objc.rct-extern-module"
        };
  }

  const remapped = DIRECT_RCT_EXTERN_REMAP_MODULE_HEADER.exec(line.text);
  if (remapped === null) {
    return null;
  }
  const jsName = remapped[1];
  const objcClassName = remapped[2];
  if (objcClassName === undefined) {
    return null;
  }
  const moduleName = jsName ?? objcClassName;
  return REACT_NATIVE_BRIDGE_IDENTIFIER.test(moduleName)
    ? {
        objcClassName,
        moduleName,
        reactNativeRuleId: "framework.react-native.objc.rct-extern-remap-module"
      }
    : null;
}

function topLevelCommaOffsets(
  sourceText: string,
  from: number,
  to: number
): readonly number[] | null {
  const commas: number[] = [];
  let parenthesisDepth = 0;
  for (let index = from; index < to; index += 1) {
    const character = sourceText.charAt(index);
    if (character === "(") {
      parenthesisDepth += 1;
    } else if (character === ")") {
      parenthesisDepth -= 1;
      if (parenthesisDepth < 0) {
        return null;
      }
    } else if (character === "," && parenthesisDepth === 0) {
      commas.push(index);
    }
  }
  return parenthesisDepth === 0 ? commas : null;
}

function directIdentifierArgument(
  sourceText: string,
  from: number,
  to: number
): string | null {
  const start = skipHorizontalWhitespace(sourceText, from, to);
  const identifier = identifierAt(sourceText, start, to);
  if (identifier === null) {
    return null;
  }
  return skipHorizontalWhitespace(sourceText, identifier.end, to) === to ? identifier.name : null;
}

function directExternSelector(
  sourceText: string,
  from: number,
  to: number
): string | null {
  const start = skipHorizontalWhitespace(sourceText, from, to);
  const firstLabel = identifierAt(sourceText, start, to);
  if (firstLabel === null) {
    return null;
  }
  let cursor = skipHorizontalWhitespace(sourceText, firstLabel.end, to);
  if (cursor === to) {
    return firstLabel.name;
  }

  const selectorParts = [firstLabel.name];
  while (cursor < to) {
    if (sourceText.charAt(cursor) !== ":") {
      return null;
    }
    selectorParts.push(":");
    cursor = skipHorizontalWhitespace(sourceText, cursor + 1, to);
    if (sourceText.charAt(cursor) !== "(") {
      return null;
    }
    const typeEnd = closingParenthesisOnLine(sourceText, cursor, to);
    if (
      typeEnd === null ||
      skipHorizontalWhitespace(sourceText, cursor + 1, typeEnd) === typeEnd
    ) {
      return null;
    }
    cursor = skipHorizontalWhitespace(sourceText, typeEnd + 1, to);
    const parameter = identifierAt(sourceText, cursor, to);
    if (parameter === null) {
      return null;
    }
    cursor = skipHorizontalWhitespace(sourceText, parameter.end, to);
    if (cursor === to) {
      return selectorParts.join("");
    }
    const nextLabel = identifierAt(sourceText, cursor, to);
    if (nextLabel === null) {
      return null;
    }
    selectorParts.push(nextLabel.name);
    cursor = skipHorizontalWhitespace(sourceText, nextLabel.end, to);
  }
  return null;
}

/**
 * Parses one single-line external-module method macro. `undefined` means the
 * line is not a bridge macro; `null` means it resembles one but is not a
 * complete direct proof, so the surrounding external declaration is rejected.
 */
function directReactNativeObjectiveCExternMethod(
  sanitizedSource: string,
  line: ObjectiveCLine
): StaticReactNativeObjectiveCExternMethod | null | undefined {
  const start = firstCodeOffset(line);
  const macro = [
    {
      name: "RCT_EXTERN_METHOD",
      ruleId: "framework.react-native.objc.rct-extern-method" as const,
      remapped: false
    },
    {
      name: "RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD",
      ruleId: "framework.react-native.objc.rct-extern-blocking-synchronous-method" as const,
      remapped: false
    },
    {
      name: "_RCT_EXTERN_REMAP_METHOD",
      ruleId: "framework.react-native.objc.rct-extern-remap-method" as const,
      remapped: true
    }
  ].find((candidate) =>
    sanitizedSource.startsWith(candidate.name, start) &&
    !isIdentifierPart(sanitizedSource.charAt(start + candidate.name.length))
  );
  if (macro === undefined) {
    return undefined;
  }

  const opening = skipHorizontalWhitespace(sanitizedSource, start + macro.name.length, line.end);
  if (sanitizedSource.charAt(opening) !== "(") {
    return null;
  }
  const closing = closingParenthesisOnLine(sanitizedSource, opening, line.end);
  if (
    closing === null ||
    skipHorizontalWhitespace(sanitizedSource, closing + 1, line.end) !== line.end
  ) {
    return null;
  }

  const commas = topLevelCommaOffsets(sanitizedSource, opening + 1, closing);
  if (commas === null) {
    return null;
  }
  if (!macro.remapped) {
    if (commas.length !== 0) {
      return null;
    }
    const selector = directExternSelector(sanitizedSource, opening + 1, closing);
    if (selector === null) {
      return null;
    }
    const name = selector.split(":", 1)[0];
    return name === undefined
      ? null
      : { start, end: closing + 1, name, selector, reactNativeRuleId: macro.ruleId };
  }

  const firstComma = commas[0];
  const secondComma = commas[1];
  if (firstComma === undefined || secondComma === undefined || commas.length !== 2) {
    return null;
  }
  const name = directIdentifierArgument(sanitizedSource, opening + 1, firstComma);
  const selector = directExternSelector(sanitizedSource, firstComma + 1, secondComma);
  const synchronous = directIdentifierArgument(sanitizedSource, secondComma + 1, closing);
  if (name === null || selector === null || (synchronous !== "NO" && synchronous !== "YES")) {
    return null;
  }
  return { start, end: closing + 1, name, selector, reactNativeRuleId: macro.ruleId };
}

/**
 * Collects direct `RCT_EXTERN_*` declarations used as an Objective-C bridge
 * for Swift or otherwise external React Native modules. It retains full class
 * and selector identity so project resolution can link one unique Swift source
 * implementation without inferring names.
 */
function collectDirectReactNativeObjectiveCExternModules(
  sanitizedSource: string,
  lines: readonly ObjectiveCLine[]
): readonly StaticReactNativeObjectiveCExternModule[] | null {
  const modules: StaticReactNativeObjectiveCExternModule[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      return null;
    }
    const header = directReactNativeObjectiveCExternModuleHeader(line);
    if (header === null) {
      continue;
    }

    let endLine = lineIndex + 1;
    for (; endLine < lines.length; endLine += 1) {
      const candidate = lines[endLine];
      if (candidate === undefined) {
        return null;
      }
      if (DIRECT_END_DIRECTIVE.test(candidate.text)) {
        break;
      }
      if (OBJECTIVE_C_CONTAINER_DIRECTIVE.test(candidate.text)) {
        return null;
      }
    }
    const end = lines[endLine];
    if (end === undefined) {
      return null;
    }

    const container: StaticObjectiveCContainer = {
      kind: "interface",
      name: header.objcClassName,
      superclass: null,
      start: firstCodeOffset(line),
      end: end.end,
      bodyStartLine: lineIndex + 1,
      endLine
    };
    const methods: StaticReactNativeObjectiveCExternMethod[] = [];
    const methodNames = new Set<string>();
    let valid = true;
    for (let bodyLine = container.bodyStartLine; bodyLine < container.endLine; bodyLine += 1) {
      const candidate = lines[bodyLine];
      if (candidate === undefined) {
        return null;
      }
      const method = directReactNativeObjectiveCExternMethod(sanitizedSource, candidate);
      if (method === null) {
        valid = false;
        break;
      }
      if (method !== undefined) {
        if (methodNames.has(method.name)) {
          valid = false;
          break;
        }
        methodNames.add(method.name);
        methods.push(method);
      }
    }
    if (valid) {
      modules.push({ ...header, container, methods });
    }
    lineIndex = endLine;
  }
  return modules;
}

/**
 * Extracts a conservative Objective-C source subset from .m, .mm, and
 * source-proven .h files: complete direct non-category implementations,
 * ordinary class interfaces, and protocols. Implementations contribute
 * one-line brace-bodied methods; interfaces and protocols contribute one-line
 * semicolon-terminated method declarations. Categories, properties, calls,
 * inheritance edges remain deliberately out of scope. Direct `RCT_EXTERN_*`
 * class-and-selector evidence is retained for a later unique Swift lookup.
 */
export function extractObjectiveCFileFacts(input: ObjectiveCExtractFileFactsInput): ArtifactFacts {
  const reactNativeCapability = frameworkCapability("react-native");
  if (!reactNativeCapability.languages.includes(input.language)) {
    throw new Error("React Native bridge extraction was invoked for an unsupported source language.");
  }
  const lineStarts = lineStartsFor(input.sourceText);
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
  const symbols: SymbolNode[] = [fileNode];
  const edges: GraphEdge[] = [];
  const reactNativeNativeMethods: ReactNativeFacts["nativeMethods"][number][] = [];
  const reactNativeSwiftExternalBridgeMethods: ReactNativeSwiftExternalBridgeMethodFact[] = [];
  const classSymbols = new Map<string, SymbolNode>();
  const sameFileSuperclassReferences: Array<{
    readonly source: SymbolNode;
    readonly superclass: StaticObjectiveCSuperclass;
  }> = [];
  const declarationOrdinals = new Map<string, number>();

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = qualifiedName + "\u0000" + kind;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainment(
    parent: SymbolNode,
    child: SymbolNode,
    range: SourceRange,
    ruleId: string
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
        ruleId,
        stage: "syntax",
        candidateSymbolIds: [child.id]
      }
    });
  }

  function addClass(
    container: StaticObjectiveCContainer,
    ruleId: "language.objc.implementation.direct" | "language.objc.interface.direct"
  ): SymbolNode {
    const qualifiedName = input.filePath + "#" + container.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const range = rangeFor(lineStarts, container.start, container.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: container.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, range, ruleId);
    return symbol;
  }

  function addReactNativeExternModule(
    externModule: StaticReactNativeObjectiveCExternModule
  ): SymbolNode {
    const qualifiedName = input.filePath + "#extern:" + externModule.objcClassName;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const range = rangeFor(
      lineStarts,
      externModule.container.start,
      externModule.container.end
    );
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: externModule.objcClassName,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, range, externModule.reactNativeRuleId);
    return symbol;
  }

  function addProtocol(container: StaticObjectiveCContainer): SymbolNode {
    const qualifiedName = input.filePath + "#protocol:" + container.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "interface");
    const range = rangeFor(lineStarts, container.start, container.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "interface",
        declarationOrdinal
      }),
      name: container.name,
      qualifiedName,
      kind: "interface",
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, range, "language.objc.protocol.direct");
    return symbol;
  }

  function addMethod(
    parent: SymbolNode,
    method: StaticObjectiveCMethod,
    ruleId:
      | "language.objc.method.direct-declaration"
      | "language.objc.method.direct-implementation"
      | ReactNativeObjectiveCMethodRuleId,
    includePolarityInIdentity = false
  ): SymbolNode {
    // Keep the selector as the display name. Existing single-polarity qualified
    // names remain stable; only a real +/- selector collision gains a polarity
    // marker so both Objective-C method namespaces remain addressable.
    const identityName =
      includePolarityInIdentity && method.polarity !== undefined
        ? method.polarity + method.name
        : method.name;
    const qualifiedName = parent.qualifiedName + "." + identityName;
    const declarationOrdinal = nextOrdinal(qualifiedName, "method");
    const range = rangeFor(lineStarts, method.start, method.end);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "method",
        declarationOrdinal
      }),
      name: method.name,
      qualifiedName,
      kind: "method",
      filePath: input.filePath,
      range,
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, range, ruleId);
    return symbol;
  }

  const sanitized = sanitizeObjectiveC(input.sourceText);
  if (!sanitized.valid) {
    return emptyFacts(symbols, edges);
  }
  const lines = linesFor(sanitized.text);
  const containers = collectDirectContainers(lines, input.sourceText);
  if (containers === null) {
    return emptyFacts(symbols, edges);
  }
  const reactNativeExternModules = sanitized.hasReactNativeBridgeImport
    ? collectDirectReactNativeObjectiveCExternModules(sanitized.text, lines)
    : [];
  if (reactNativeExternModules === null) {
    return emptyFacts([fileNode], []);
  }

  const methodsByContainer = new Map<StaticObjectiveCContainer, readonly StaticObjectiveCMethod[]>();
  for (const container of containers) {
    const methods = directMethodsInContainer(sanitized.text, lines, container);
    if (methods === null) {
      return emptyFacts([fileNode], []);
    }
    methodsByContainer.set(container, methods);
  }

  const classes = new Map<
    string,
    {
      declaration: StaticObjectiveCContainer | null;
      implementation: StaticObjectiveCContainer | null;
    }
  >();
  const protocols: StaticObjectiveCContainer[] = [];
  for (const container of containers) {
    if (container.kind === "protocol") {
      protocols.push(container);
      continue;
    }
    const existing = classes.get(container.name) ?? {
      declaration: null,
      implementation: null
    };
    if (container.kind === "interface") {
      if (existing.declaration !== null) {
        return emptyFacts([fileNode], []);
      }
      existing.declaration = container;
    } else {
      if (existing.implementation !== null) {
        return emptyFacts([fileNode], []);
      }
      existing.implementation = container;
    }
    classes.set(container.name, existing);
  }

  const owners: Array<
    | {
        readonly kind: "class";
        readonly container: StaticObjectiveCContainer;
        readonly declaration: StaticObjectiveCContainer | null;
        readonly implementation: StaticObjectiveCContainer | null;
      }
    | {
        readonly kind: "protocol";
        readonly container: StaticObjectiveCContainer;
      }
  > = [];
  for (const entry of classes.values()) {
    const container = entry.declaration ?? entry.implementation;
    if (container === null) {
      return emptyFacts([fileNode], []);
    }
    owners.push({
      kind: "class",
      container,
      declaration: entry.declaration,
      implementation: entry.implementation
    });
  }
  for (const protocol of protocols) {
    owners.push({ kind: "protocol", container: protocol });
  }
  owners.sort((left, right) => left.container.start - right.container.start);

  for (const owner of owners) {
    if (owner.kind === "protocol") {
      const parent = addProtocol(owner.container);
      const protocolMethods = methodsByContainer.get(owner.container) ?? [];
      const polarityCollisions = objectiveCSelectorsWithBothPolarities(protocolMethods);
      for (const method of protocolMethods) {
        addMethod(
          parent,
          method,
          "language.objc.method.direct-declaration",
          polarityCollisions.has(method.name)
        );
      }
      continue;
    }

    const parent = addClass(
      owner.container,
      owner.declaration === null
        ? "language.objc.implementation.direct"
        : "language.objc.interface.direct"
    );
    classSymbols.set(owner.container.name, parent);
    if (owner.declaration?.superclass !== null && owner.declaration?.superclass !== undefined) {
      sameFileSuperclassReferences.push({
        source: parent,
        superclass: owner.declaration.superclass
      });
    }
    const selectedMethods = new Map<
      string,
      {
        readonly method: StaticObjectiveCMethod;
        readonly ruleId:
          | "language.objc.method.direct-declaration"
          | "language.objc.method.direct-implementation";
      }
    >();
    for (const source of [
      owner.declaration === null
        ? null
        : {
            container: owner.declaration,
            ruleId: "language.objc.method.direct-declaration" as const
          },
      owner.implementation === null
        ? null
        : {
            container: owner.implementation,
            ruleId: "language.objc.method.direct-implementation" as const
          }
    ]) {
      if (source === null) {
        continue;
      }
      for (const method of methodsByContainer.get(source.container) ?? []) {
        const candidateKey = objectiveCMethodCandidateKey(method);
        if (
          source.ruleId === "language.objc.method.direct-implementation" ||
          !selectedMethods.has(candidateKey)
        ) {
          selectedMethods.set(candidateKey, { method, ruleId: source.ruleId });
        }
      }
    }
    const selectedMethodValues = [...selectedMethods.values()];
    const polarityCollisions = objectiveCSelectorsWithBothPolarities(
      selectedMethodValues.map(({ method }) => method)
    );
    for (const { method, ruleId } of selectedMethodValues.sort(
      (left, right) => left.method.start - right.method.start
    )) {
      addMethod(parent, method, ruleId, polarityCollisions.has(method.name));
    }
    const reactNativeModule =
      owner.implementation === null
        ? null
        : staticReactNativeObjectiveCModule(
            sanitized.text,
            owner.implementation,
            sanitized.hasReactNativeBridgeImport
          );
    if (reactNativeModule !== null) {
      for (const method of reactNativeModule.methods) {
        const methodSymbol = addMethod(
          parent,
          method,
          method.reactNativeRuleId
        );
        reactNativeNativeMethods.push({
          platform: "ios",
          moduleName: reactNativeModule.moduleName,
          methodName: method.name,
          methodId: methodSymbol.id,
          filePath: input.filePath,
          range: rangeFor(lineStarts, method.start, method.end)
        });
      }
    }
  }

  for (const reference of sameFileSuperclassReferences) {
    const target = classSymbols.get(reference.superclass.name);
    if (target === undefined || target.id === reference.source.id) {
      continue;
    }
    const range = rangeFor(lineStarts, reference.superclass.start, reference.superclass.end);
    edges.push({
      id: createEdgeId({
        sourceId: reference.source.id,
        targetId: target.id,
        kind: "extends",
        line: range.start.line,
        column: range.start.column,
        referenceName: reference.superclass.name
      }),
      sourceId: reference.source.id,
      targetId: target.id,
      kind: "extends",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: reference.superclass.name,
      evidence: {
        ruleId: "syntax.objc.same-file.unique-interface-superclass",
        stage: "syntax",
        candidateSymbolIds: [target.id]
      }
    });
  }

  for (const externModule of reactNativeExternModules) {
    const parent = addReactNativeExternModule(externModule);
    for (const method of externModule.methods) {
      const methodSymbol = addMethod(parent, method, method.reactNativeRuleId);
      const range = rangeFor(lineStarts, method.start, method.end);
      reactNativeNativeMethods.push({
        platform: "ios",
        moduleName: externModule.moduleName,
        methodName: method.name,
        methodId: methodSymbol.id,
        filePath: input.filePath,
        range
      });
      reactNativeSwiftExternalBridgeMethods.push({
        objcClassName: externModule.objcClassName,
        selector: method.selector,
        methodId: methodSymbol.id,
        filePath: input.filePath,
        range
      });
    }
  }

  return {
    ...emptyFacts(symbols, edges),
    reactNativeFacts: {
      nativeModuleCalls: [],
      turboModuleCalls: [],
      turboModuleDefaultImportCalls: [],
      turboModuleDefaultExports: [],
      turboModuleSpecMethods: [],
      nativeMethods: reactNativeNativeMethods,
      swiftExternalBridgeMethods: reactNativeSwiftExternalBridgeMethods
    }
  };
}

function emptyFacts(symbols: readonly SymbolNode[], edges: readonly GraphEdge[]): ArtifactFacts {
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
