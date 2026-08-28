import { parse, type SgNode } from "./ast-grep-languages.js";

export interface ModernJavaDeclarationRange {
  readonly start: number;
  readonly end: number;
}

export interface ModernJavaCallableDeclaration {
  readonly callableKind: "method" | "constructor";
  readonly isStatic: boolean;
  readonly isFinal: boolean;
  readonly visibility: "public" | "protected" | "package" | "private";
  readonly minimumArgumentCount: number;
  readonly maximumArgumentCount: number | null;
  readonly parameterCount: number;
}

export interface ModernJavaDeclaration {
  readonly name: string;
  readonly kind: "class" | "interface" | "method";
  readonly isAnnotation?: true;
  readonly range: ModernJavaDeclarationRange;
  readonly isExported: boolean;
  readonly parentIndex: number | null;
  readonly callable?: ModernJavaCallableDeclaration;
}

export interface ModernJavaDeclarationInspection {
  readonly isSyntaxClean: boolean;
  readonly declarations: readonly ModernJavaDeclaration[];
}

function directChildren(node: SgNode): readonly SgNode[] {
  return node.children();
}

function hasSyntaxError(node: SgNode): boolean {
  const range = node.range();
  return (
    node.kind() === "ERROR" ||
    (node.kind() !== "program" && range.start.index === range.end.index) ||
    directChildren(node).some((child) => hasSyntaxError(child))
  );
}

function syntaxErrors(node: SgNode): readonly SgNode[] {
  const errors: SgNode[] = [];
  function collect(candidate: SgNode): void {
    if (candidate.kind() === "ERROR") {
      errors.push(candidate);
    }
    for (const child of directChildren(candidate)) {
      collect(child);
    }
  }
  collect(node);
  return errors;
}

function recordPatternCompatibilitySource(sourceText: string, root: SgNode): string | null {
  const component = String.raw`(?:byte|short|int|long|float|double|boolean|char|[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)[\t ]+[A-Za-z_$][A-Za-z0-9_$]*`;
  const pattern = new RegExp(
    String.raw`\binstanceof[\t ]+[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*[\t ]*\([\t ]*${component}(?:[\t ]*,[\t ]*${component})*[\t ]*\)`,
    "gu"
  );
  const masks: Array<{ start: number; end: number }> = [];
  for (const match of sourceText.matchAll(pattern)) {
    if (match.index === undefined) {
      continue;
    }
    const openOffset = match[0].lastIndexOf("(");
    const closeOffset = match[0].lastIndexOf(")");
    if (openOffset < 0 || closeOffset <= openOffset) {
      continue;
    }
    masks.push({ start: match.index + openOffset, end: match.index + closeOffset + 1 });
  }
  const errors = syntaxErrors(root);
  if (
    masks.length === 0 ||
    errors.length === 0 ||
    errors.some((error) => {
      const range = error.range();
      return !masks.some((mask) => range.start.index >= mask.start && range.start.index <= mask.end);
    })
  ) {
    return null;
  }
  const characters = sourceText.split("");
  for (const mask of masks) {
    for (let index = mask.start; index < mask.end; index += 1) {
      if (characters[index] !== "\r" && characters[index] !== "\n") {
        characters[index] = " ";
      }
    }
  }
  return characters.join("");
}

function identifier(node: SgNode): string | null {
  const value = node.text();
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value) ? value : null;
}

function isPublic(node: SgNode): boolean {
  const modifiers = directChildren(node).find((child) => child.kind() === "modifiers");
  return modifiers !== undefined && directChildren(modifiers).some((child) => child.kind() === "public");
}

function hasModifier(node: SgNode, expected: string): boolean {
  const modifiers = directChildren(node).find((child) => child.kind() === "modifiers");
  return modifiers !== undefined && directChildren(modifiers).some(
    (child) => child.kind() === expected && child.text() === expected
  );
}

function callableVisibility(
  node: SgNode,
  ownerTypeKind: "class" | "interface"
): "public" | "protected" | "package" | "private" {
  if (hasModifier(node, "private")) {
    return "private";
  }
  if (hasModifier(node, "protected")) {
    return "protected";
  }
  if (hasModifier(node, "public") || ownerTypeKind === "interface") {
    return "public";
  }
  return "package";
}

function callableShape(
  node: SgNode,
  ownerTypeKind: "class" | "interface"
): ModernJavaCallableDeclaration | null {
  const kind = node.kind();
  if (kind !== "method_declaration" && kind !== "constructor_declaration") {
    return null;
  }
  const parameterLists = directChildren(node).filter(
    (child) => child.kind() === "formal_parameters"
  );
  if (parameterLists.length !== 1 || parameterLists[0] === undefined) {
    return null;
  }
  const parameters = directChildren(parameterLists[0]).filter(
    (child) => child.kind() === "formal_parameter" || child.kind() === "spread_parameter"
  );
  const spreadParameters = parameters.filter((parameter) => parameter.kind() === "spread_parameter");
  if (
    spreadParameters.length > 1 ||
    (spreadParameters.length === 1 && parameters.at(-1)?.kind() !== "spread_parameter")
  ) {
    return null;
  }
  const isVarargs = spreadParameters.length === 1;
  return {
    callableKind: kind === "method_declaration" ? "method" : "constructor",
    isStatic: kind === "method_declaration" && hasModifier(node, "static"),
    isFinal: kind === "method_declaration" && hasModifier(node, "final"),
    visibility: callableVisibility(node, ownerTypeKind),
    minimumArgumentCount: isVarargs ? parameters.length - 1 : parameters.length,
    maximumArgumentCount: isVarargs ? null : parameters.length,
    parameterCount: parameters.length
  };
}

function typeKind(node: SgNode): "class" | "interface" | null {
  const kind = node.kind();
  return kind === "class_declaration" || kind === "enum_declaration" || kind === "record_declaration"
    ? "class"
    : kind === "interface_declaration" || kind === "annotation_type_declaration"
      ? "interface"
      : null;
}

function declarationName(node: SgNode): string | null {
  return directChildren(node)
    .filter((child) => child.kind() === "identifier")
    .map((child) => identifier(child))
    .find((candidate): candidate is string => candidate !== null) ?? null;
}

function callableName(node: SgNode, ownerName: string): string | null {
  const kind = node.kind();
  if (kind === "constructor_declaration" || kind === "compact_constructor_declaration") {
    return ownerName;
  }
  if (kind !== "method_declaration" && kind !== "annotation_type_element_declaration") {
    return null;
  }
  return declarationName(node);
}

function isAnonymousBodyContainer(node: SgNode): boolean {
  if (node.kind() !== "object_creation_expression" && node.kind() !== "enum_constant") {
    return false;
  }
  return directChildren(node).some((child) => child.kind() === "class_body");
}

export function inspectModernJavaDeclarations(sourceText: string): ModernJavaDeclarationInspection {
  let root = parse("java", sourceText).root();
  if (hasSyntaxError(root)) {
    const compatibilitySource = recordPatternCompatibilitySource(sourceText, root);
    if (compatibilitySource === null) {
      return { isSyntaxClean: false, declarations: [] };
    }
    root = parse("java", compatibilitySource).root();
    if (hasSyntaxError(root)) {
      return { isSyntaxClean: false, declarations: [] };
    }
  }

  const declarations: ModernJavaDeclaration[] = [];
  let semanticError = false;

  function visit(
    node: SgNode,
    parentIndex: number | null,
    ownerTypeName: string | null,
    ownerTypeKind: "class" | "interface" | null
  ): void {
    if (isAnonymousBodyContainer(node)) {
      for (const body of directChildren(node).filter((child) => child.kind() === "class_body")) {
        for (const child of directChildren(body)) {
          visit(child, parentIndex, null, null);
        }
      }
      return;
    }

    const staticTypeKind = typeKind(node);
    if (staticTypeKind !== null) {
      const name = declarationName(node);
      if (name === null) {
        return;
      }
      const range = node.range();
      const index = declarations.length;
      declarations.push({
        name,
        kind: staticTypeKind,
        ...(node.kind() === "annotation_type_declaration" ? { isAnnotation: true as const } : {}),
        range: { start: range.start.index, end: range.end.index },
        isExported: isPublic(node),
        parentIndex
      });
      for (const child of directChildren(node)) {
        visit(child, index, name, staticTypeKind);
      }
      return;
    }

    if (ownerTypeName !== null && ownerTypeKind !== null && parentIndex !== null) {
      const name = callableName(node, ownerTypeName);
      if (name !== null) {
        if (ownerTypeKind === "class" && hasModifier(node, "default")) {
          semanticError = true;
          return;
        }
        const range = node.range();
        const callable = callableShape(node, ownerTypeKind);
        const index = declarations.length;
        declarations.push({
          name,
          kind: "method",
          range: { start: range.start.index, end: range.end.index },
          isExported:
            isPublic(node) ||
            (ownerTypeKind === "interface" && !hasModifier(node, "private")),
          parentIndex,
          ...(callable === null ? {} : { callable })
        });
        for (const child of directChildren(node)) {
          visit(child, index, null, null);
        }
        return;
      }
    }

    for (const child of directChildren(node)) {
      visit(child, parentIndex, ownerTypeName, ownerTypeKind);
    }
  }

  visit(root, null, null, null);
  return semanticError
    ? { isSyntaxClean: false, declarations: [] }
    : { isSyntaxClean: true, declarations };
}
