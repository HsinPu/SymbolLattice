import { parse, type SgNode } from "./ast-grep-languages.js";

export interface JavaRecordExtractFileFactsInput {
  readonly sourceText: string;
}

export interface JavaRecordRange {
  readonly start: number;
  readonly end: number;
}

export interface JavaRecordPropertiesReference {
  readonly key: string;
  readonly node: SgNode;
}

export interface JavaRecordConfigurationPropertiesPrefixReference {
  readonly prefix: string;
  readonly node: SgNode;
}

export interface StaticJavaRecord {
  readonly name: string;
  readonly node: SgNode;
  readonly isExported: boolean;
  readonly valueReferences: readonly JavaRecordPropertiesReference[];
  readonly configurationPropertiesPrefixes: readonly JavaRecordConfigurationPropertiesPrefixReference[];
}

export interface JavaRecordInspection {
  /** True only when the modern Java grammar accepts the complete source file. */
  readonly isSyntaxClean: boolean;
  /** All record spans, including nested records that remain out of scope. */
  readonly recordRanges: readonly JavaRecordRange[];
  /** Direct top-level records eligible for this deliberately narrow slice. */
  readonly records: readonly StaticJavaRecord[];
}

interface StaticJavaRecordAnnotation {
  readonly name: string;
  readonly node: SgNode;
}

const SPRING_VALUE_PATH = "org.springframework.beans.factory.annotation.Value";
const SPRING_CONFIGURATION_PROPERTIES_PATH =
  "org.springframework.boot.context.properties.ConfigurationProperties";
const SPRING_BOOT_PROPERTIES_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const JAVA_DOTTED_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u;

function directChildren(node: SgNode): readonly SgNode[] {
  return node.children();
}

function hasSyntaxError(node: SgNode): boolean {
  return node.kind() === "ERROR" || directChildren(node).some((child) => hasSyntaxError(child));
}

function staticJavaRecordAnnotation(node: SgNode): StaticJavaRecordAnnotation | null {
  if (node.kind() !== "annotation") {
    return null;
  }
  const references = directChildren(node).filter(
    (child) => child.kind() === "identifier" || child.kind() === "scoped_identifier"
  );
  const reference = references[0];
  if (references.length !== 1 || reference === undefined) {
    return null;
  }
  const name = reference.text();
  return JAVA_DOTTED_IDENTIFIER.test(name) ? { name, node } : null;
}

function staticJavaRecordAnnotations(node: SgNode): readonly StaticJavaRecordAnnotation[] {
  const modifiers = directChildren(node).find((child) => child.kind() === "modifiers");
  return modifiers === undefined
    ? []
    : directChildren(modifiers)
        .map((child) => staticJavaRecordAnnotation(child))
        .filter((annotation): annotation is StaticJavaRecordAnnotation => annotation !== null);
}

function staticJavaRecordImport(node: SgNode): string | null {
  if (node.kind() !== "import_declaration") {
    return null;
  }
  const match = /^import\s+([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*;$/u.exec(
    node.text()
  );
  return match?.[1] ?? null;
}

/** Java has no aliases, so a simple name needs exactly one direct import. */
function staticJavaRecordImports(root: SgNode): ReadonlyMap<string, string> {
  const pathsByLocalName = new Map<string, Set<string>>();
  for (const declaration of directChildren(root)) {
    const path = staticJavaRecordImport(declaration);
    const localName = path?.split(".").at(-1);
    if (path === null || localName === undefined) {
      continue;
    }
    const paths = pathsByLocalName.get(localName) ?? new Set<string>();
    paths.add(path);
    pathsByLocalName.set(localName, paths);
  }

  const imports = new Map<string, string>();
  for (const [localName, paths] of pathsByLocalName) {
    if (paths.size === 1) {
      const path = [...paths][0];
      if (path !== undefined) {
        imports.set(localName, path);
      }
    }
  }
  return imports;
}

function annotationMatches(
  annotation: StaticJavaRecordAnnotation,
  expectedPath: string,
  imports: ReadonlyMap<string, string>
): boolean {
  return annotation.name === expectedPath || imports.get(annotation.name) === expectedPath;
}

function staticPlainJavaString(node: SgNode): string | null {
  if (node.kind() !== "string_literal") {
    return null;
  }
  const value = node.text();
  if (
    value.length < 2 ||
    value[0] !== '"' ||
    value.at(-1) !== '"' ||
    value.includes("\\") ||
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  return value.slice(1, -1);
}

/**
 * Mirrors the established Java class surface: one positional, unescaped
 * literal `@Value("${key}")` placeholder only. Named arguments, arrays,
 * expressions, escapes, and nested placeholders remain out of scope.
 */
function staticJavaRecordPropertiesKey(annotation: StaticJavaRecordAnnotation): string | null {
  const argumentLists = directChildren(annotation.node).filter(
    (child) => child.kind() === "annotation_argument_list"
  );
  if (argumentLists.length !== 1 || argumentLists[0] === undefined) {
    return null;
  }
  const values = directChildren(argumentLists[0]).filter((child) => {
    const kind = child.kind();
    return kind !== "(" && kind !== ")" && kind !== ",";
  });
  if (values.length !== 1 || values[0] === undefined) {
    return null;
  }
  const literal = staticPlainJavaString(values[0]);
  if (literal === null) {
    return null;
  }
  const match = /^\$\{([A-Za-z0-9][A-Za-z0-9._-]*)(?::[^{}]*)?\}$/u.exec(literal);
  const key = match?.[1] ?? null;
  return key !== null && SPRING_BOOT_PROPERTIES_KEY.test(key) ? key : null;
}

/**
 * Mirrors the established Java class surface: one positional literal prefix or
 * one literal `prefix =` argument only. `value =`, multiple attributes,
 * escapes, and dynamic expressions remain out of scope.
 */
function staticJavaRecordConfigurationPropertiesPrefix(
  annotation: StaticJavaRecordAnnotation
): string | null {
  const argumentLists = directChildren(annotation.node).filter(
    (child) => child.kind() === "annotation_argument_list"
  );
  if (argumentLists.length !== 1 || argumentLists[0] === undefined) {
    return null;
  }
  const values = directChildren(argumentLists[0]).filter((child) => {
    const kind = child.kind();
    return kind !== "(" && kind !== ")" && kind !== ",";
  });
  if (values.length !== 1 || values[0] === undefined) {
    return null;
  }
  const value = values[0];
  if (value.kind() === "string_literal") {
    const prefix = staticPlainJavaString(value);
    return prefix !== null && SPRING_BOOT_PROPERTIES_KEY.test(prefix) ? prefix : null;
  }
  if (value.kind() !== "element_value_pair") {
    return null;
  }
  const pair = directChildren(value);
  const key = pair[0];
  const literal = pair[2];
  if (
    pair.length !== 3 ||
    key?.kind() !== "identifier" ||
    key.text() !== "prefix" ||
    pair[1]?.kind() !== "=" ||
    literal === undefined
  ) {
    return null;
  }
  const prefix = staticPlainJavaString(literal);
  return prefix !== null && SPRING_BOOT_PROPERTIES_KEY.test(prefix) ? prefix : null;
}

function staticJavaRecordValueReferences(
  declaration: SgNode,
  imports: ReadonlyMap<string, string>
): readonly JavaRecordPropertiesReference[] {
  const formalParameters = directChildren(declaration).filter(
    (child) => child.kind() === "formal_parameters"
  );
  const formalParametersNode = formalParameters[0];
  if (formalParameters.length !== 1 || formalParametersNode === undefined) {
    return [];
  }
  const references: JavaRecordPropertiesReference[] = [];
  for (const component of directChildren(formalParametersNode)) {
    if (component.kind() !== "formal_parameter") {
      continue;
    }
    const annotations = staticJavaRecordAnnotations(component);
    const annotationsNamedValue = annotations.filter(
      (annotation) => annotation.name === "Value" || annotation.name === SPRING_VALUE_PATH
    );
    const valueAnnotations = annotationsNamedValue.filter((annotation) =>
      annotationMatches(annotation, SPRING_VALUE_PATH, imports)
    );
    if (
      annotationsNamedValue.length !== valueAnnotations.length ||
      valueAnnotations.length !== 1
    ) {
      continue;
    }
    const annotation = valueAnnotations[0];
    if (annotation === undefined) {
      continue;
    }
    const key = staticJavaRecordPropertiesKey(annotation);
    if (key !== null) {
      references.push({ key, node: annotation.node });
    }
  }
  return references;
}

function staticJavaRecordConfigurationPropertiesPrefixReferences(
  declaration: SgNode,
  imports: ReadonlyMap<string, string>
): readonly JavaRecordConfigurationPropertiesPrefixReference[] {
  const annotations = staticJavaRecordAnnotations(declaration);
  const annotationsNamedConfigurationProperties = annotations.filter(
    (annotation) =>
      annotation.name === "ConfigurationProperties" ||
      annotation.name === SPRING_CONFIGURATION_PROPERTIES_PATH
  );
  const configurationPropertiesAnnotations = annotationsNamedConfigurationProperties.filter(
    (annotation) => annotationMatches(annotation, SPRING_CONFIGURATION_PROPERTIES_PATH, imports)
  );
  if (
    annotationsNamedConfigurationProperties.length !== configurationPropertiesAnnotations.length ||
    configurationPropertiesAnnotations.length !== 1
  ) {
    return [];
  }
  const annotation = configurationPropertiesAnnotations[0];
  if (annotation === undefined) {
    return [];
  }
  const prefix = staticJavaRecordConfigurationPropertiesPrefix(annotation);
  return prefix === null ? [] : [{ prefix, node: annotation.node }];
}

function staticJavaRecord(
  declaration: SgNode,
  imports: ReadonlyMap<string, string>
): StaticJavaRecord | null {
  if (declaration.kind() !== "record_declaration") {
    return null;
  }
  const children = directChildren(declaration);
  const names = children.filter((child) => child.kind() === "identifier");
  const nameNode = names[0];
  const body = children.filter((child) => child.kind() === "class_body");
  const name = nameNode?.text();
  if (
    names.length !== 1 ||
    name === undefined ||
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) ||
    body.length !== 1
  ) {
    return null;
  }
  const modifiers = children.find((child) => child.kind() === "modifiers");
  return {
    name,
    node: declaration,
    isExported: modifiers !== undefined && directChildren(modifiers).some((child) => child.kind() === "public"),
    valueReferences: staticJavaRecordValueReferences(declaration, imports),
    configurationPropertiesPrefixes: staticJavaRecordConfigurationPropertiesPrefixReferences(
      declaration,
      imports
    )
  };
}

function collectRecordRanges(node: SgNode, ranges: JavaRecordRange[]): void {
  if (node.kind() === "record_declaration") {
    const range = node.range();
    ranges.push({ start: range.start.index, end: range.end.index });
  }
  for (const child of directChildren(node)) {
    collectRecordRanges(child, ranges);
  }
}

/**
 * Inspects records with the modern Java grammar only when the source actually
 * contains the contextual `record` token. All returned facts are syntax-clean
 * and direct-top-level; nested spans are retained only to guard the legacy
 * parser from misclassifying their components.
 */
export function inspectJavaRecords(
  input: JavaRecordExtractFileFactsInput
): JavaRecordInspection {
  if (!input.sourceText.includes("record")) {
    return { isSyntaxClean: false, recordRanges: [], records: [] };
  }
  const root = parse("java", input.sourceText).root();
  if (hasSyntaxError(root)) {
    return { isSyntaxClean: false, recordRanges: [], records: [] };
  }
  const recordRanges: JavaRecordRange[] = [];
  collectRecordRanges(root, recordRanges);
  const imports = staticJavaRecordImports(root);
  const records = directChildren(root)
    .map((declaration) => staticJavaRecord(declaration, imports))
    .filter((record): record is StaticJavaRecord => record !== null);
  return { isSyntaxClean: true, recordRanges, records };
}
