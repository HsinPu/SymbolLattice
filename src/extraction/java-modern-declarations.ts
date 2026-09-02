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

export interface ModernJavaHeritageReference {
  readonly relationKind:
    | "java-class-superclass"
    | "java-class-interface"
    | "java-interface-superinterface";
  readonly referenceName: string;
  readonly qualifiedTypePath?: string;
  readonly range: ModernJavaDeclarationRange;
}

export interface ModernJavaInstantiationReference {
  readonly referenceName: string;
  readonly qualifiedTypePath?: string;
  readonly range: ModernJavaDeclarationRange;
}

export interface ModernJavaSignatureReference {
  readonly relationKind: "accepts" | "returns";
  readonly referenceName: string;
  readonly qualifiedTypePath?: string;
  readonly isTopLevelType: boolean;
  readonly range: ModernJavaDeclarationRange;
}

export interface ModernJavaCallReference {
  readonly receiverKind: "implicit-static" | "implicit-instance";
  readonly methodName: string;
  readonly argumentCount: number;
  readonly range: ModernJavaDeclarationRange;
}

export interface ModernJavaParameterCallReference {
  readonly receiverKind: "parameter";
  readonly receiverName: string;
  readonly receiverType: {
    readonly referenceName: string;
    readonly qualifiedTypePath?: string;
    readonly range: ModernJavaDeclarationRange;
  };
  readonly receiverBindingRange: ModernJavaDeclarationRange;
  readonly receiverScopeRange: ModernJavaDeclarationRange;
  readonly methodName: string;
  readonly argumentCount: number;
  readonly range: ModernJavaDeclarationRange;
}

export interface ModernJavaDeclaration {
  readonly name: string;
  readonly kind: "class" | "interface" | "method";
  readonly isAnnotation?: true;
  readonly range: ModernJavaDeclarationRange;
  readonly isExported: boolean;
  readonly parentIndex: number | null;
  readonly callable?: ModernJavaCallableDeclaration;
  readonly heritageReferences?: readonly ModernJavaHeritageReference[];
  readonly instantiationReferences?: readonly ModernJavaInstantiationReference[];
  readonly signatureReferences?: readonly ModernJavaSignatureReference[];
  readonly callReferences?: readonly (ModernJavaCallReference | ModernJavaParameterCallReference)[];
}

export interface ModernJavaImport {
  readonly localName: string;
  readonly importedPath: string;
}

export interface ModernJavaDeclarationInspection {
  readonly isSyntaxClean: boolean;
  readonly packageName: string | null;
  readonly staticImportNames: readonly string[];
  readonly declarations: readonly ModernJavaDeclaration[];
  readonly imports: readonly ModernJavaImport[];
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

function directTypeParameterNames(node: SgNode): ReadonlySet<string> {
  const typeParameters = directChildren(node).find(
    (child) => child.kind() === "type_parameters"
  );
  if (typeParameters === undefined) {
    return new Set();
  }
  const names = new Set<string>();
  for (const parameter of directChildren(typeParameters).filter(
    (child) => child.kind() === "type_parameter"
  )) {
    const name = directChildren(parameter).find((child) => child.kind() === "type_identifier");
    if (name !== undefined && /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name.text())) {
      names.add(name.text());
    }
  }
  return names;
}

function typeKind(node: SgNode): "class" | "interface" | null {
  const kind = node.kind();
  return kind === "class_declaration" || kind === "enum_declaration" || kind === "record_declaration"
    ? "class"
    : kind === "interface_declaration" || kind === "annotation_type_declaration"
      ? "interface"
      : null;
}

function modernJavaImports(sourceText: string): readonly ModernJavaImport[] {
  const imports: ModernJavaImport[] = [];
  const pattern = /^\s*import\s+(?!static\s)([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*;/gmu;
  for (const match of sourceText.matchAll(pattern)) {
    const importedPath = match[1];
    if (importedPath === undefined || importedPath.endsWith(".*")) {
      continue;
    }
    const localName = importedPath.split(".").at(-1);
    if (localName !== undefined) {
      imports.push({ localName, importedPath });
    }
  }
  return imports;
}

function modernJavaStaticImportNames(sourceText: string): readonly string[] {
  const names = new Set<string>();
  const pattern = /^\s*import\s+static\s+[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*\.(\*|[A-Za-z_$][A-Za-z0-9_$]*)\s*;/gmu;
  for (const match of sourceText.matchAll(pattern)) {
    const name = match[1];
    if (name !== undefined) {
      names.add(name);
    }
  }
  return [...names].sort();
}

function directTypeNode(node: SgNode): SgNode | null {
  if (node.kind() === "type_identifier" || node.kind() === "scoped_type_identifier") {
    return node;
  }
  if (node.kind() !== "generic_type") {
    return null;
  }
  return directChildren(node).find(
    (child) => child.kind() === "type_identifier" || child.kind() === "scoped_type_identifier"
  ) ?? null;
}

interface ModernJavaTypeReference {
  readonly referenceName: string;
  readonly qualifiedTypePath?: string;
  readonly range: ModernJavaDeclarationRange;
}

function typeReference(node: SgNode): ModernJavaTypeReference | null {
  const base = directTypeNode(node);
  if (base === null) {
    return null;
  }
  const text = base.text();
  const segments = text.split(".");
  if (
    segments.length === 0 ||
    segments.some((segment) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(segment)) ||
    (segments.length > 1 && !segments.slice(0, -1).every((segment) => /^[a-z_$][A-Za-z0-9_$]*$/u.test(segment)))
  ) {
    return null;
  }
  const referenceName = segments.at(-1);
  if (referenceName === undefined) {
    return null;
  }
  const range = base.range();
  return {
    referenceName,
    ...(segments.length > 1 ? { qualifiedTypePath: text } : {}),
    range: { start: range.start.index, end: range.end.index }
  };
}

function hasUnsupportedSignatureShape(node: SgNode): boolean {
  if (node.kind() === "array_type" || node.kind() === "wildcard") {
    return true;
  }
  return directChildren(node).some((child) => hasUnsupportedSignatureShape(child));
}

function signatureTypeReference(node: SgNode): ModernJavaTypeReference | null {
  if (hasUnsupportedSignatureShape(node)) {
    return null;
  }
  const typeNode = directTypeNode(node) ??
    directChildren(node)
      .map(directTypeNode)
      .find((child): child is SgNode => child !== null) ??
    null;
  return typeNode === null ? null : typeReference(typeNode);
}

function modernJavaCallableSignatureReferences(
  node: SgNode,
  excludedNames: ReadonlySet<string>
): readonly ModernJavaSignatureReference[] {
  const references: ModernJavaSignatureReference[] = [];
  const children = directChildren(node);
  const methodNameIndex = children.findIndex((child) => child.kind() === "identifier");
  if (node.kind() === "method_declaration" && methodNameIndex >= 0) {
    const returnType = children
      .slice(0, methodNameIndex)
      .filter((child) => child.kind() !== "modifiers" && child.kind() !== "type_parameters")
      .map(signatureTypeReference)
      .find((candidate): candidate is ModernJavaTypeReference => candidate !== null);
    if (returnType !== undefined && !excludedNames.has(returnType.referenceName)) {
      references.push({ relationKind: "returns", isTopLevelType: true, ...returnType });
    }
  }

  const parameterList = children.find((child) => child.kind() === "formal_parameters");
  if (parameterList !== undefined) {
    for (const parameter of directChildren(parameterList).filter(
      (child) => child.kind() === "formal_parameter" || child.kind() === "spread_parameter"
    )) {
      const reference = signatureTypeReference(parameter);
      if (reference === null || excludedNames.has(reference.referenceName)) {
        continue;
      }
      references.push({ relationKind: "accepts", isTopLevelType: false, ...reference });
    }
  }
  return references;
}

function modernJavaCallableCallReferences(
  node: SgNode,
  isStatic: boolean,
  staticImportNames: ReadonlySet<string>
): readonly ModernJavaCallReference[] {
  const references: ModernJavaCallReference[] = [];
  function argumentCount(argumentList: SgNode): number {
    return directChildren(argumentList).filter(
      (child) => child.kind() !== "(" && child.kind() !== ")" && child.kind() !== ","
    ).length;
  }
  function visit(candidate: SgNode): void {
    if (
      candidate !== node &&
      (candidate.kind() === "lambda_expression" ||
        candidate.kind() === "class_declaration" ||
        candidate.kind() === "interface_declaration" ||
        candidate.kind() === "enum_declaration" ||
        candidate.kind() === "record_declaration" ||
        candidate.kind() === "method_declaration" ||
        candidate.kind() === "constructor_declaration")
    ) {
      return;
    }
    if (candidate.kind() === "method_invocation") {
      const children = directChildren(candidate);
      const name = children.find((child) => child.kind() === "identifier");
      const argumentList = children.find((child) => child.kind() === "argument_list");
      const hasReceiver = children.some((child) => child.kind() === ".");
      if (name !== undefined && argumentList !== undefined && !hasReceiver) {
        const nameText = name.text();
        if (
          /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(nameText) &&
          !staticImportNames.has("*") &&
          !staticImportNames.has(nameText)
        ) {
          const range = name.range();
          references.push({
            receiverKind: isStatic ? "implicit-static" : "implicit-instance",
            methodName: nameText,
            argumentCount: argumentCount(argumentList),
            range: { start: range.start.index, end: range.end.index }
          });
        }
      }
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  }
  visit(node);
  return references;
}

function modernJavaParameterCallReferences(
  node: SgNode
): readonly ModernJavaParameterCallReference[] {
  const body = directChildren(node).find(
    (child) => child.kind() === "block" || child.kind() === "constructor_body"
  );
  const parameterList = directChildren(node).find((child) => child.kind() === "formal_parameters");
  if (body === undefined || parameterList === undefined) {
    return [];
  }
  const bodyNode = body;
  const parameters = new Map<string, {
    readonly name: string;
    readonly type: ModernJavaTypeReference;
    readonly bindingRange: ModernJavaDeclarationRange;
  }>();
  for (const parameter of directChildren(parameterList).filter(
    (child) => child.kind() === "formal_parameter"
  )) {
    const type = signatureTypeReference(parameter);
    const nameNode = directChildren(parameter).find((child) => child.kind() === "identifier") ??
      directChildren(parameter)
        .find((child) => child.kind() === "variable_declarator")
        ?.children()
        .find((child) => child.kind() === "identifier");
    if (type === null || nameNode === undefined) {
      continue;
    }
    const name = nameNode.text();
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name)) {
      continue;
    }
    const range = nameNode.range();
    parameters.set(name, {
      name,
      type,
      bindingRange: { start: range.start.index, end: range.end.index }
    });
  }
  if (parameters.size === 0) {
    return [];
  }

  const escapedName = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const nestedCallable = new Set([
    "lambda_expression",
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
    "method_declaration",
    "constructor_declaration"
  ]);
  const containsUnsafeArgumentUse = (candidate: SgNode, name: string): boolean => {
    if (candidate.kind() === "lambda_expression") {
      return candidate.text().match(new RegExp(`\\b${escapedName(name)}\\b`, "u")) !== null;
    }
    if (candidate.kind() === "method_invocation") {
      const children = directChildren(candidate);
      const argumentList = children.find((child) => child.kind() === "argument_list");
      const methodName = children.find((child) => child.kind() === "identifier");
      if (argumentList !== undefined && containsUnsafeArgumentUse(argumentList, name)) {
        return true;
      }
      const methodNameIndex = methodName === undefined ? -1 : children.indexOf(methodName);
      for (const child of children.slice(0, Math.max(0, methodNameIndex))) {
        if (child.kind() === "identifier" && child.text() === name) {
          continue;
        }
        if (containsUnsafeArgumentUse(child, name)) {
          return true;
        }
      }
      return false;
    }
    if (candidate.kind() === "identifier" && candidate.text() === name) {
      return true;
    }
    return directChildren(candidate).some((child) => containsUnsafeArgumentUse(child, name));
  };
  const parameterIsTainted = (name: string): boolean => {
    let tainted = false;
    function visit(candidate: SgNode): void {
      if (tainted) {
        return;
      }
      if (candidate !== node && nestedCallable.has(String(candidate.kind()))) {
        if (
          candidate.kind() === "lambda_expression" &&
          new RegExp(`\\b${escapedName(name)}\\b`, "u").test(candidate.text())
        ) {
          tainted = true;
        }
        return;
      }
      const text = candidate.text();
      if (
        (candidate.kind() === "assignment_expression" || candidate.kind() === "update_expression") &&
        new RegExp(
          `(?:^|[^A-Za-z0-9_$])${escapedName(name)}\\s*(?:[+\\-*/%&|^]?=|\\+\\+|--)|(?:^|[^A-Za-z0-9_$])${escapedName(name)}\\s*\\.(?:[A-Za-z_$][A-Za-z0-9_$]*\\s*)?=`,
          "u"
        ).test(text)
      ) {
        tainted = true;
        return;
      }
      if (
        (candidate.kind() === "return_statement" || candidate.kind() === "throw_statement") &&
        new RegExp(`\\b${escapedName(name)}\\b`, "u").test(text)
      ) {
        tainted = true;
        return;
      }
      if (candidate.kind() === "instanceof_expression") {
        const patternBinding = directChildren(candidate)
          .filter((child) => child.kind() === "identifier")
          .at(-1);
        if (patternBinding?.text() === name) {
          tainted = true;
          return;
        }
      }
      if (candidate.kind() === "variable_declarator") {
        const declaredName = directChildren(candidate)
          .find((child) => child.kind() === "identifier");
        if (declaredName?.text() === name) {
          tainted = true;
          return;
        }
      }
      if (
        candidate.kind() === "variable_declarator" &&
        new RegExp(`=\\s*${escapedName(name)}\\b`, "u").test(text)
      ) {
        tainted = true;
        return;
      }
      if (candidate.kind() === "method_invocation") {
        const argumentList = directChildren(candidate).find((child) => child.kind() === "argument_list");
        if (argumentList !== undefined && containsUnsafeArgumentUse(argumentList, name)) {
          tainted = true;
          return;
        }
      }
      for (const child of directChildren(candidate)) {
        visit(child);
      }
    }
    visit(bodyNode);
    return tainted;
  };
  const taintedParameters = new Set(
    [...parameters.keys()].filter((name) => parameterIsTainted(name))
  );
  const references: ModernJavaParameterCallReference[] = [];
  function visit(candidate: SgNode): void {
    if (candidate !== node && nestedCallable.has(String(candidate.kind()))) {
      return;
    }
    if (candidate.kind() === "method_invocation") {
      const children = directChildren(candidate);
      const receiver = children[0];
      const dot = children[1];
      const methodName = children[2];
      const argumentList = children.find((child) => child.kind() === "argument_list");
      if (
        receiver?.kind() === "identifier" &&
        dot?.kind() === "." &&
        methodName?.kind() === "identifier" &&
        argumentList !== undefined
      ) {
        const parameter = parameters.get(receiver.text());
        if (parameter !== undefined && !taintedParameters.has(parameter.name)) {
          const methodRange = methodName.range();
          const bodyRange = bodyNode.range();
          references.push({
            receiverKind: "parameter",
            receiverName: parameter.name,
            receiverType: parameter.type,
            receiverBindingRange: parameter.bindingRange,
            receiverScopeRange: { start: bodyRange.start.index, end: bodyRange.end.index },
            methodName: methodName.text(),
            argumentCount: directChildren(argumentList).filter(
              (child) => child.kind() !== "(" && child.kind() !== ")" && child.kind() !== ","
            ).length,
            range: { start: methodRange.start.index, end: methodRange.end.index }
          });
        }
      }
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  }
  visit(bodyNode);
  return references;
}

function modernJavaPackageName(root: SgNode): string | null {
  const declarations = directChildren(root).filter((child) => child.kind() === "package_declaration");
  if (declarations.length === 0) {
    return "";
  }
  if (declarations.length !== 1 || declarations[0] === undefined) {
    return null;
  }
  const nameNode = directChildren(declarations[0]).find(
    (child) => child.kind() === "scoped_identifier" || child.kind() === "identifier"
  );
  const name = nameNode?.text();
  return name !== undefined && /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u.test(name)
    ? name
    : null;
}

function modernJavaHeritageReferences(
  node: SgNode
): readonly ModernJavaHeritageReference[] {
  const nodeKind = node.kind();
  const relationGroups: Array<{
    readonly relationKind: ModernJavaHeritageReference["relationKind"];
    readonly groupKind: "superclass" | "super_interfaces" | "extends_interfaces";
  }> = nodeKind === "class_declaration"
    ? [
        { relationKind: "java-class-superclass", groupKind: "superclass" },
        { relationKind: "java-class-interface", groupKind: "super_interfaces" }
      ]
    : nodeKind === "interface_declaration"
      ? [{ relationKind: "java-interface-superinterface", groupKind: "extends_interfaces" }]
      : [];
  const references: ModernJavaHeritageReference[] = [];
  for (const { relationKind, groupKind } of relationGroups) {
    const group = directChildren(node).find((child) => child.kind() === groupKind);
    if (group === undefined) {
      continue;
    }
    const typeNodes = groupKind === "superclass"
      ? directChildren(group).filter((child) => child.kind() !== "extends")
      : directChildren(group)
          .find((child) => child.kind() === "type_list")
          ?.children() ?? [];
    for (const typeNode of typeNodes) {
      const reference = typeReference(typeNode);
      if (reference !== null) {
        references.push({ relationKind, ...reference });
      }
    }
  }
  return references;
}

function modernJavaInstantiationReferences(
  node: SgNode
): readonly ModernJavaInstantiationReference[] {
  const references: ModernJavaInstantiationReference[] = [];
  function visit(candidate: SgNode): void {
    if (
      candidate !== node &&
      (candidate.kind() === "lambda_expression" ||
        candidate.kind() === "class_declaration" ||
        candidate.kind() === "interface_declaration" ||
        candidate.kind() === "enum_declaration" ||
        candidate.kind() === "record_declaration" ||
        candidate.kind() === "method_declaration" ||
        candidate.kind() === "constructor_declaration")
    ) {
      return;
    }
    if (candidate.kind() === "object_creation_expression") {
      const typeNode = directChildren(candidate)
        .map(directTypeNode)
        .find((child): child is SgNode => child !== null);
      const reference = typeNode === undefined ? null : typeReference(typeNode);
      if (reference !== null) {
        references.push(reference);
      }
      for (const child of directChildren(candidate)) {
        if (child.kind() !== "class_body") {
          visit(child);
        }
      }
      return;
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  }
  visit(node);
  return references;
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
  const imports = modernJavaImports(sourceText);
  const staticImportNames = modernJavaStaticImportNames(sourceText);
  let root = parse("java", sourceText).root();
  if (hasSyntaxError(root)) {
    const compatibilitySource = recordPatternCompatibilitySource(sourceText, root);
    if (compatibilitySource === null) {
      return { isSyntaxClean: false, packageName: null, staticImportNames, declarations: [], imports };
    }
    root = parse("java", compatibilitySource).root();
    if (hasSyntaxError(root)) {
      return { isSyntaxClean: false, packageName: null, staticImportNames, declarations: [], imports };
    }
  }

  const declarations: ModernJavaDeclaration[] = [];
  let semanticError = false;

  function visit(
    node: SgNode,
    parentIndex: number | null,
    ownerTypeName: string | null,
    ownerTypeKind: "class" | "interface" | null,
    ownerTypeParameters: ReadonlySet<string>
  ): void {
    if (isAnonymousBodyContainer(node)) {
      for (const body of directChildren(node).filter((child) => child.kind() === "class_body")) {
        for (const child of directChildren(body)) {
          visit(child, parentIndex, null, null, ownerTypeParameters);
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
      const heritageReferences = modernJavaHeritageReferences(node);
      const typeParameters = new Set([
        ...ownerTypeParameters,
        ...directTypeParameterNames(node)
      ]);
      declarations.push({
        name,
        kind: staticTypeKind,
        ...(node.kind() === "annotation_type_declaration" ? { isAnnotation: true as const } : {}),
        range: { start: range.start.index, end: range.end.index },
        isExported: isPublic(node),
        parentIndex,
        ...(heritageReferences.length === 0 ? {} : { heritageReferences })
      });
      for (const child of directChildren(node)) {
        visit(child, index, name, staticTypeKind, typeParameters);
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
        const instantiationReferences = modernJavaInstantiationReferences(node);
        const signatureReferences = modernJavaCallableSignatureReferences(
          node,
          new Set([...ownerTypeParameters, ...directTypeParameterNames(node)])
        );
        const callReferences = callable === null
          ? []
          : [
              ...modernJavaCallableCallReferences(
                node,
                callable.isStatic,
                new Set(staticImportNames)
              ),
              ...modernJavaParameterCallReferences(node)
            ];
        const index = declarations.length;
        declarations.push({
          name,
          kind: "method",
          range: { start: range.start.index, end: range.end.index },
          isExported:
            isPublic(node) ||
            (ownerTypeKind === "interface" && !hasModifier(node, "private")),
          parentIndex,
          ...(callable === null ? {} : { callable }),
          ...(instantiationReferences.length === 0 ? {} : { instantiationReferences }),
          ...(signatureReferences.length === 0 ? {} : { signatureReferences }),
          ...(callReferences.length === 0 ? {} : { callReferences })
        });
        for (const child of directChildren(node)) {
          visit(child, index, null, null, ownerTypeParameters);
        }
        return;
      }
    }

    for (const child of directChildren(node)) {
      visit(child, parentIndex, ownerTypeName, ownerTypeKind, ownerTypeParameters);
    }
  }

  visit(root, null, null, null, new Set());
  return semanticError
    ? { isSyntaxClean: false, packageName: null, staticImportNames, declarations: [], imports }
    : {
        isSyntaxClean: true,
        packageName: modernJavaPackageName(root),
        staticImportNames,
        declarations,
        imports
      };
}
