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

export interface ModernJavaFieldDeclaration {
  readonly name: string;
  readonly type: ModernJavaTypeReference;
  readonly isStatic: boolean;
  readonly isFinal: boolean;
  readonly visibility: "public" | "protected" | "package" | "private";
  readonly modifierProof: "declared";
  readonly declarationRange: ModernJavaDeclarationRange;
  readonly scopeRange: ModernJavaDeclarationRange;
}

export interface ModernJavaFieldCallReference {
  readonly receiverKind: "field";
  readonly receiverName: string;
  readonly methodName: string;
  readonly argumentCount: number;
  readonly range: ModernJavaDeclarationRange;
}

export interface ModernJavaLocalCallReference {
  readonly receiverKind: "local";
  readonly receiverName: string;
  readonly receiverType: {
    readonly referenceName: string;
    readonly qualifiedTypePath?: string;
    readonly range: ModernJavaDeclarationRange;
  };
  readonly receiverBindingRange: ModernJavaDeclarationRange;
  readonly receiverScopeRange: ModernJavaDeclarationRange;
  readonly receiverInitializerRange?: ModernJavaDeclarationRange;
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
  readonly fieldDeclarations?: readonly ModernJavaFieldDeclaration[];
  readonly callable?: ModernJavaCallableDeclaration;
  readonly heritageReferences?: readonly ModernJavaHeritageReference[];
  readonly instantiationReferences?: readonly ModernJavaInstantiationReference[];
  readonly signatureReferences?: readonly ModernJavaSignatureReference[];
  readonly callReferences?: readonly (
    | ModernJavaCallReference
    | ModernJavaParameterCallReference
    | ModernJavaFieldCallReference
    | ModernJavaLocalCallReference
  )[];
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

function fieldVisibility(node: SgNode): "public" | "protected" | "package" | "private" {
  if (hasModifier(node, "private")) {
    return "private";
  }
  if (hasModifier(node, "protected")) {
    return "protected";
  }
  if (hasModifier(node, "public")) {
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

function modernJavaFieldDeclarations(
  node: SgNode
): readonly ModernJavaFieldDeclaration[] {
  const body = directChildren(node).find(
    (child) => child.kind() === "class_body" || child.kind() === "interface_body"
  );
  if (body === undefined || node.kind() !== "class_declaration" &&
      node.kind() !== "enum_declaration" && node.kind() !== "record_declaration") {
    return [];
  }
  const ownerRange = node.range();
  const scopeRange = { start: ownerRange.start.index, end: ownerRange.end.index };
  const fields: ModernJavaFieldDeclaration[] = [];
  for (const field of directChildren(body).filter((child) => child.kind() === "field_declaration")) {
    if (!hasModifier(field, "final")) {
      continue;
    }
    const type = signatureTypeReference(field);
    if (type === null) {
      continue;
    }
    for (const declarator of directChildren(field).filter(
      (child) => child.kind() === "variable_declarator"
    )) {
      const nameNode = directChildren(declarator).find(
        (child) => child.kind() === "identifier"
      );
      const name = nameNode === undefined ? null : identifier(nameNode);
      if (name === null || nameNode === undefined) {
        continue;
      }
      const nameRange = nameNode.range();
      fields.push({
        name,
        type,
        isStatic: hasModifier(field, "static"),
        isFinal: true,
        visibility: fieldVisibility(field),
        modifierProof: "declared",
        declarationRange: { start: nameRange.start.index, end: nameRange.end.index },
        scopeRange
      });
    }
  }
  return fields;
}

function modernJavaFieldIdentifierNames(
  node: SgNode,
  fieldNames: ReadonlySet<string>,
  excludedNames: ReadonlySet<string> = new Set()
): readonly string[] {
  const names = new Set<string>();
  function visit(candidate: SgNode): void {
    if (candidate.kind() === "identifier") {
      const name = identifier(candidate);
      if (name !== null && fieldNames.has(name) && !excludedNames.has(name)) {
        names.add(name);
      }
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  }
  visit(node);
  return [...names];
}

function modernJavaFieldShadowedNames(
  node: SgNode,
  fieldNames: ReadonlySet<string>
): ReadonlySet<string> {
  const shadowed = new Set<string>();
  const nestedCallable = new Set([
    "lambda_expression",
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
    "method_declaration",
    "constructor_declaration"
  ]);
  function addDirectName(candidate: SgNode): void {
    const nameNode = directChildren(candidate).find((child) => child.kind() === "identifier") ??
      directChildren(candidate)
        .find((child) => child.kind() === "variable_declarator")
        ?.children()
        .find((child) => child.kind() === "identifier");
    const name = nameNode === undefined ? null : identifier(nameNode);
    if (name !== null && fieldNames.has(name)) {
      shadowed.add(name);
    }
  }
  function visit(candidate: SgNode): void {
    if (candidate !== node && nestedCallable.has(String(candidate.kind()))) {
      return;
    }
    if (
      candidate.kind() === "formal_parameter" ||
      candidate.kind() === "spread_parameter" ||
      candidate.kind() === "catch_formal_parameter"
    ) {
      addDirectName(candidate);
    }
    if (candidate.kind() === "variable_declarator") {
      addDirectName(candidate);
    }
    if (candidate.kind() === "instanceof_expression") {
      const patternBinding = directChildren(candidate)
        .filter((child) => child.kind() === "identifier")
        .at(-1);
      const name = patternBinding === undefined ? null : identifier(patternBinding);
      if (name !== null && fieldNames.has(name)) {
        shadowed.add(name);
      }
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  }
  visit(node);
  return shadowed;
}

function modernJavaFieldEscapeNames(
  ownerNode: SgNode,
  fields: ReadonlyMap<string, ModernJavaFieldDeclaration>
): ReadonlySet<string> {
  if (fields.size === 0) {
    return new Set();
  }
  const fieldNames = new Set(fields.keys());
  const escaped = new Set<string>();
  const nestedCallable = new Set([
    "lambda_expression",
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
    "method_declaration",
    "constructor_declaration"
  ]);
  const escapedName = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const mark = (candidate: SgNode, excludedNames: ReadonlySet<string>): void => {
    for (const name of modernJavaFieldIdentifierNames(candidate, fieldNames, excludedNames)) {
      escaped.add(name);
    }
  };
  const markWrites = (candidate: SgNode, excludedNames: ReadonlySet<string>): void => {
    const text = candidate.text();
    for (const name of fieldNames) {
      if (
        excludedNames.has(name) ||
        !new RegExp(
          `(?:^|[^A-Za-z0-9_$])(?:this\\s*\\.\\s*)?${escapedName(name)}\\s*(?:[+\\-*/%&|^]?=|\\+\\+|--)`,
          "u"
        ).test(text)
      ) {
        continue;
      }
      escaped.add(name);
    }
  };
  function scanCallable(callable: SgNode): void {
    const body = directChildren(callable).find(
      (child) => child.kind() === "block" || child.kind() === "constructor_body"
    );
    if (body === undefined) {
      return;
    }
    const shadowed = modernJavaFieldShadowedNames(callable, fieldNames);
    const isConstructor = callable.kind() === "constructor_declaration";
    function visit(candidate: SgNode): void {
      if (candidate !== body && nestedCallable.has(String(candidate.kind()))) {
        if (candidate.kind() === "lambda_expression") {
          mark(candidate, shadowed);
        }
        return;
      }
      if (candidate.kind() === "method_invocation") {
        const argumentList = directChildren(candidate).find(
          (child) => child.kind() === "argument_list"
        );
        if (argumentList !== undefined) {
          mark(argumentList, shadowed);
        }
      }
      if (candidate.kind() === "return_statement" || candidate.kind() === "throw_statement") {
        mark(candidate, shadowed);
      }
      if (candidate.kind() === "variable_declarator") {
        const equalsIndex = directChildren(candidate).findIndex((child) => child.kind() === "=");
        if (equalsIndex >= 0) {
          for (const child of directChildren(candidate).slice(equalsIndex + 1)) {
            mark(child, shadowed);
          }
        }
      }
      if (!isConstructor && (
        candidate.kind() === "assignment_expression" || candidate.kind() === "update_expression"
      )) {
        markWrites(candidate, shadowed);
      }
      for (const child of directChildren(candidate)) {
        visit(child);
      }
    }
    visit(body);
  }
  function visit(candidate: SgNode): void {
    if (candidate !== ownerNode && (
      candidate.kind() === "class_declaration" ||
      candidate.kind() === "interface_declaration" ||
      candidate.kind() === "enum_declaration" ||
      candidate.kind() === "record_declaration"
    )) {
      return;
    }
    if (candidate.kind() === "method_declaration" || candidate.kind() === "constructor_declaration") {
      scanCallable(candidate);
      return;
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  }
  visit(ownerNode);
  return escaped;
}

function modernJavaFieldCallReferences(
  node: SgNode,
  fields: ReadonlyMap<string, ModernJavaFieldDeclaration>,
  escapedFields: ReadonlySet<string>
): readonly ModernJavaFieldCallReference[] {
  const body = directChildren(node).find(
    (child) => child.kind() === "block" || child.kind() === "constructor_body"
  );
  if (body === undefined || fields.size === 0) {
    return [];
  }
  const fieldNames = new Set(fields.keys());
  const shadowedFields = modernJavaFieldShadowedNames(node, fieldNames);
  const nestedCallable = new Set([
    "lambda_expression",
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
    "method_declaration",
    "constructor_declaration"
  ]);
  const references: ModernJavaFieldCallReference[] = [];
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
        argumentList !== undefined &&
        fieldNames.has(receiver.text()) &&
        !escapedFields.has(receiver.text()) &&
        !shadowedFields.has(receiver.text())
      ) {
        const methodRange = methodName.range();
        references.push({
          receiverKind: "field",
          receiverName: receiver.text(),
          methodName: methodName.text(),
          argumentCount: directChildren(argumentList).filter(
            (child) => child.kind() !== "(" && child.kind() !== ")" && child.kind() !== ","
          ).length,
          range: { start: methodRange.start.index, end: methodRange.end.index }
        });
      }
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  }
  visit(body);
  return references;
}

function modernJavaLocalCallReferences(
  node: SgNode
): readonly ModernJavaLocalCallReference[] {
  const body = directChildren(node).find(
    (child) => child.kind() === "block" || child.kind() === "constructor_body"
  );
  if (body === undefined) {
    return [];
  }
  type LocalBinding = {
    readonly name: string;
    readonly type: ModernJavaTypeReference;
    readonly bindingRange: ModernJavaDeclarationRange;
    readonly scopeRange: ModernJavaDeclarationRange;
    readonly initializerRange?: ModernJavaDeclarationRange;
  };
  const nestedCallable = new Set([
    "lambda_expression",
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
    "method_declaration",
    "constructor_declaration"
  ]);
  const containsKind = (candidate: SgNode, expected: string): boolean =>
    candidate.kind() === expected || directChildren(candidate).some((child) => containsKind(child, expected));
  const nodeKey = (candidate: SgNode): string => {
    const range = candidate.range();
    return `${candidate.kind()}:${range.start.index}:${range.end.index}`;
  };
  const declarationBindings = new Map<string, LocalBinding | null>();
  const declarationNames = new Map<string, readonly string[]>();
  const localNames = new Set<string>();
  const localNameCounts = new Map<string, number>();
  const bodyRange = body.range();
  const identifierNames = (candidate: SgNode): readonly string[] => {
    const names = new Set<string>();
    function visit(candidateNode: SgNode): void {
      if (candidateNode.kind() === "identifier") {
        const name = identifier(candidateNode);
        if (name !== null) {
          names.add(name);
        }
      }
      for (const child of directChildren(candidateNode)) {
        visit(child);
      }
    }
    visit(candidate);
    return [...names];
  };
  const localDeclarationBinding = (
    declaration: SgNode,
    scopeRange: ModernJavaDeclarationRange
  ): LocalBinding | null => {
    const declarators = directChildren(declaration).filter(
      (child) => child.kind() === "variable_declarator"
    );
    if (declarators.length !== 1 || declarators[0] === undefined) {
      return null;
    }
    const declarator = declarators[0];
    const nameNode = directChildren(declarator).find((child) => child.kind() === "identifier");
    const name = nameNode === undefined ? null : identifier(nameNode);
    if (name === null || nameNode === undefined) {
      return null;
    }
    const typeNode = directChildren(declaration).find(
      (child) =>
        child.kind() === "type_identifier" ||
        child.kind() === "scoped_type_identifier" ||
        child.kind() === "generic_type"
    );
    const isVar = typeNode?.kind() === "type_identifier" && typeNode.text() === "var";
    const declaredType = isVar ? null : signatureTypeReference(declaration);
    const equalsIndex = directChildren(declarator).findIndex((child) => child.kind() === "=");
    const initializerCandidates = directChildren(declarator).filter(
      (child) => child.kind() === "object_creation_expression"
    );
    const initializer = initializerCandidates[0];
    if (
      equalsIndex < 0 ||
      initializerCandidates.length !== 1 ||
      initializer === undefined ||
      containsKind(declaration, "type_arguments") ||
      containsKind(initializer, "class_body") ||
      containsKind(initializer, "type_arguments")
    ) {
      return null;
    }
    const initializerTypeNode = directChildren(initializer)
      .map(directTypeNode)
      .find((child): child is SgNode => child !== null);
    const initializerType = initializerTypeNode === undefined
      ? null
      : typeReference(initializerTypeNode);
    if (initializerType === null || (declaredType !== null &&
        declaredType.referenceName !== initializerType.referenceName)) {
      return null;
    }
    const type = declaredType ?? initializerType;
    const nameRange = nameNode.range();
    const initializerRange = initializer.range();
    return {
      name,
      type,
      bindingRange: { start: nameRange.start.index, end: nameRange.end.index },
      scopeRange,
      ...(isVar
        ? { initializerRange: { start: initializerRange.start.index, end: initializerRange.end.index } }
        : {})
    };
  };

  function collectDeclarations(
    candidate: SgNode,
    enclosingScopeRange: ModernJavaDeclarationRange = {
      start: bodyRange.start.index,
      end: bodyRange.end.index
    }
  ): void {
    if (candidate !== node && nestedCallable.has(String(candidate.kind()))) {
      return;
    }
    if (candidate.kind() === "block" || candidate.kind() === "constructor_body") {
      const range = candidate.range();
      const scopeRange = { start: range.start.index, end: range.end.index };
      for (const child of directChildren(candidate)) {
        collectDeclarations(child, scopeRange);
      }
      return;
    }
    if (candidate.kind() === "local_variable_declaration") {
      const names = directChildren(candidate)
        .filter((child) => child.kind() === "variable_declarator")
        .flatMap((declarator) =>
          directChildren(declarator)
            .filter((child) => child.kind() === "identifier")
            .map((child) => identifier(child))
            .filter((name): name is string => name !== null)
        );
      declarationNames.set(nodeKey(candidate), names);
      const binding = localDeclarationBinding(candidate, enclosingScopeRange);
      declarationBindings.set(nodeKey(candidate), binding);
      for (const name of names) {
        localNames.add(name);
        localNameCounts.set(name, (localNameCounts.get(name) ?? 0) + 1);
      }
    }
    for (const child of directChildren(candidate)) {
      collectDeclarations(child, enclosingScopeRange);
    }
  }
  collectDeclarations(body);
  if (localNames.size === 0) {
    return [];
  }

  const taintedNames = new Set<string>(
    [...localNameCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name)
  );
  const escapedName = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const markIdentifiers = (candidate: SgNode): void => {
    for (const name of identifierNames(candidate)) {
      if (localNames.has(name)) {
        taintedNames.add(name);
      }
    }
  };
  const formalParameters = directChildren(node).find(
    (child) => child.kind() === "formal_parameters"
  );
  if (formalParameters !== undefined) {
    for (const name of identifierNames(formalParameters)) {
      if (localNames.has(name)) {
        taintedNames.add(name);
      }
    }
  }
  function scanTaint(candidate: SgNode): void {
    if (candidate !== node && nestedCallable.has(String(candidate.kind()))) {
      if (candidate.kind() === "lambda_expression") {
        markIdentifiers(candidate);
      }
      return;
    }
    if (candidate.kind() === "method_invocation") {
      const argumentList = directChildren(candidate).find(
        (child) => child.kind() === "argument_list"
      );
      if (argumentList !== undefined) {
        markIdentifiers(argumentList);
      }
    }
    if (candidate.kind() === "return_statement" || candidate.kind() === "throw_statement") {
      markIdentifiers(candidate);
    }
    if (candidate.kind() === "variable_declarator") {
      const equalsIndex = directChildren(candidate).findIndex((child) => child.kind() === "=");
      if (equalsIndex >= 0) {
        for (const child of directChildren(candidate).slice(equalsIndex + 1)) {
          markIdentifiers(child);
        }
      }
    }
    if (candidate.kind() === "instanceof_expression") {
      const patternBinding = directChildren(candidate)
        .filter((child) => child.kind() === "identifier")
        .at(-1);
      const name = patternBinding === undefined ? null : identifier(patternBinding);
      if (name !== null && localNames.has(name)) {
        taintedNames.add(name);
      }
    }
    if (candidate.kind() === "assignment_expression" || candidate.kind() === "update_expression") {
      const text = candidate.text();
      for (const name of localNames) {
        if (new RegExp(
          `(?:^|[^A-Za-z0-9_$])${escapedName(name)}\\s*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*\\s*)?(?:[+\\-*/%&|^]?=|\\+\\+|--)`,
          "u"
        ).test(text)) {
          taintedNames.add(name);
        }
      }
    }
    for (const child of directChildren(candidate)) {
      scanTaint(child);
    }
  }
  scanTaint(body);

  const scopes: Array<Map<string, LocalBinding | null>> = [];
  const visibleBinding = (name: string): LocalBinding | null | undefined => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const scope = scopes[index]!;
      if (scope.has(name)) {
        return scope.get(name) ?? null;
      }
    }
    return undefined;
  };
  const references: ModernJavaLocalCallReference[] = [];
  function visit(candidate: SgNode): void {
    if (candidate !== node && nestedCallable.has(String(candidate.kind()))) {
      return;
    }
    if (candidate.kind() === "block" || candidate.kind() === "constructor_body") {
      const scope = new Map<string, LocalBinding | null>();
      scopes.push(scope);
      for (const child of directChildren(candidate)) {
        if (child.kind() === "local_variable_declaration") {
          for (const nested of directChildren(child)) {
            visit(nested);
          }
          const names = declarationNames.get(nodeKey(child)) ?? [];
          const binding = declarationBindings.get(nodeKey(child)) ?? null;
          for (const name of names) {
            const entry = binding !== null && binding.name === name && names.length === 1
              ? binding
              : null;
            scope.set(name, scope.has(name) ? null : entry);
          }
        } else {
          visit(child);
        }
      }
      scopes.pop();
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
        const binding = visibleBinding(receiver.text());
        if (binding !== undefined && binding !== null && !taintedNames.has(binding.name)) {
          const methodRange = methodName.range();
          references.push({
            receiverKind: "local",
            receiverName: binding.name,
            receiverType: binding.type,
            receiverBindingRange: binding.bindingRange,
            receiverScopeRange: binding.scopeRange,
            ...(binding.initializerRange === undefined
              ? {}
              : { receiverInitializerRange: binding.initializerRange }),
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
  visit(body);
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
    ownerTypeParameters: ReadonlySet<string>,
    ownerFields: ReadonlyMap<string, ModernJavaFieldDeclaration> = new Map(),
    escapedOwnerFields: ReadonlySet<string> = new Set()
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
      const fieldDeclarations = modernJavaFieldDeclarations(node);
      const fieldsByName = new Map(fieldDeclarations.map((field) => [field.name, field]));
      const escapedFields = modernJavaFieldEscapeNames(node, fieldsByName);
      declarations.push({
        name,
        kind: staticTypeKind,
        ...(node.kind() === "annotation_type_declaration" ? { isAnnotation: true as const } : {}),
        range: { start: range.start.index, end: range.end.index },
        isExported: isPublic(node),
        parentIndex,
        ...(fieldDeclarations.length === 0 ? {} : { fieldDeclarations }),
        ...(heritageReferences.length === 0 ? {} : { heritageReferences })
      });
      for (const child of directChildren(node)) {
        visit(child, index, name, staticTypeKind, typeParameters, fieldsByName, escapedFields);
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
              ...modernJavaParameterCallReferences(node),
              ...modernJavaFieldCallReferences(node, ownerFields, escapedOwnerFields),
              ...modernJavaLocalCallReferences(node)
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
      visit(
        child,
        parentIndex,
        ownerTypeName,
        ownerTypeKind,
        ownerTypeParameters,
        ownerFields,
        escapedOwnerFields
      );
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
