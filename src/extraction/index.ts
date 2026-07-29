import ts from "typescript";

import {
  createEdgeId,
  createSymbolId,
  ROUTE_METHODS,
  type ArtifactFacts,
  type ArtifactLanguage,
  type EdgeKind,
  type ExportBinding,
  type GraphEdge,
  type ImportBinding,
  type LocalBinding,
  type PendingReference,
  type ReExportBinding,
  type ReferenceScope,
  type RouteMethod,
  type SourceRange,
  type SymbolKind,
  type SymbolNode
} from "../domain/index.js";

export type {
  ArtifactFacts,
  ExportBinding,
  ImportBinding,
  LocalBinding,
  ReExportBinding,
  ReferenceScope
} from "../domain/index.js";

/** @deprecated Use ArtifactLanguage from the domain package. */
export type ExtractionLanguage = ArtifactLanguage;

export interface ExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: ExtractionLanguage;
}

/** @deprecated Use ArtifactFacts from the domain package. */
export type ExtractedFileFacts = ArtifactFacts;

interface DeclarationInfo {
  readonly name: string;
  readonly kind: Exclude<SymbolKind, "file">;
  readonly isExported: boolean;
}

interface ModifierCarrier extends ts.Node {
  readonly modifiers?: ts.NodeArray<ts.ModifierLike>;
}

function scriptKindFor(input: ExtractFileFactsInput): ts.ScriptKind {
  if (input.language === "javascript") {
    return input.filePath.toLowerCase().endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  }

  return input.filePath.toLowerCase().endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function sourceRange(sourceFile: ts.SourceFile, node: ts.Node): SourceRange {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    start: { line: start.line + 1, column: start.character + 1 },
    end: { line: end.line + 1, column: end.character + 1 }
  };
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = (node as ModifierCarrier).modifiers;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function hasDefaultModifier(node: ts.Node): boolean {
  const modifiers = (node as ModifierCarrier).modifiers;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
}

function declarationName(node: ts.NamedDeclaration): string | null {
  if (node.name === undefined) {
    return null;
  }

  if (ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  return null;
}

function declarationInfo(
  node: ts.Node,
  explicitExportNames: ReadonlySet<string>
): DeclarationInfo | null {
  if (ts.isClassDeclaration(node)) {
    const name = declarationName(node) ?? (hasExportModifier(node) ? "default" : null);
    return name === null
      ? null
      : { name, kind: "class", isExported: hasExportModifier(node) || explicitExportNames.has(name) };
  }

  if (ts.isFunctionDeclaration(node)) {
    const name = declarationName(node) ?? (hasExportModifier(node) ? "default" : null);
    return name === null
      ? null
      : {
          name,
          kind: "function",
          isExported: hasExportModifier(node) || explicitExportNames.has(name)
        };
  }

  if (ts.isMethodDeclaration(node)) {
    const name = declarationName(node);
    return name === null ? null : { name, kind: "method", isExported: false };
  }

  if (ts.isInterfaceDeclaration(node)) {
    return {
      name: node.name.text,
      kind: "interface",
      isExported: hasExportModifier(node) || explicitExportNames.has(node.name.text)
    };
  }

  if (ts.isTypeAliasDeclaration(node)) {
    return {
      name: node.name.text,
      kind: "type",
      isExported: hasExportModifier(node) || explicitExportNames.has(node.name.text)
    };
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    const statement = node.parent.parent;
    return {
      name: node.name.text,
      kind: "variable",
      isExported:
        (ts.isVariableStatement(statement) && hasExportModifier(statement)) ||
        explicitExportNames.has(node.name.text)
    };
  }

  return null;
}

function defaultExportExpressionInfo(node: ts.ExportAssignment): DeclarationInfo | null {
  if (node.isExportEquals) {
    return null;
  }

  if (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression)) {
    return { name: "default", kind: "function", isExported: true };
  }

  if (ts.isClassExpression(node.expression)) {
    return { name: "default", kind: "class", isExported: true };
  }

  return null;
}

function collectExplicitExportNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.exportClause === undefined ||
      statement.moduleSpecifier !== undefined
    ) {
      continue;
    }

    if (ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        // `export { localName as publicName }` exports the local declaration,
        // not a declaration named `publicName`.
        names.add(element.propertyName?.text ?? element.name.text);
      }
    }
  }

  return names;
}

function isLexicalScope(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isFunctionLike(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isCaseBlock(node) ||
    ts.isModuleBlock(node)
  );
}

function scopeIdFor(sourceFile: ts.SourceFile, node: ts.Node): string {
  return `${node.kind}:${node.getStart(sourceFile)}:${node.getEnd()}`;
}

function enclosingScopeNodes(node: ts.Node): readonly ts.Node[] {
  const scopeNodes: ts.Node[] = [];
  let current = node.parent;

  while (current !== undefined) {
    if (isLexicalScope(current)) {
      scopeNodes.push(current);
    }
    current = current.parent;
  }

  return scopeNodes;
}

function enclosingScopeIds(sourceFile: ts.SourceFile, node: ts.Node): readonly string[] {
  return enclosingScopeNodes(node).map((scopeNode) => scopeIdFor(sourceFile, scopeNode));
}

function isVarDeclaration(node: ts.Node): node is ts.VariableDeclaration {
  return (
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    (node.parent.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0
  );
}

function declarationScopeId(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  info: DeclarationInfo
): string | undefined {
  const scopeNodes = enclosingScopeNodes(node);
  if (info.kind === "variable" && isVarDeclaration(node)) {
    const variableScope = scopeNodes.find(
      (scopeNode) => ts.isFunctionLike(scopeNode) || ts.isSourceFile(scopeNode)
    );
    return variableScope === undefined ? undefined : scopeIdFor(sourceFile, variableScope);
  }

  const lexicalScope = scopeNodes[0];
  return lexicalScope === undefined ? undefined : scopeIdFor(sourceFile, lexicalScope);
}

function hasValueBinding(info: DeclarationInfo): boolean {
  return info.kind === "class" || info.kind === "function" || info.kind === "variable";
}

interface ScopedRouteReceiverBindings {
  /** The closest value binding decides whether a receiver is known to be Express. */
  readonly byScopeId: ReadonlyMap<string, ReadonlyMap<string, readonly RouteBinding[]>>;
}

type RouteBindingKind =
  | "express-receiver"
  | "express-default-factory"
  | "express-namespace"
  | "express-router-factory"
  | "other";

interface RouteBinding {
  readonly declaration: ts.Node;
  kind: RouteBindingKind;
}

interface StaticExpressRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: ts.Identifier;
}

function bindingNames(name: ts.BindingName): readonly string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }

  const names: string[] = [];
  for (const element of name.elements) {
    if (!ts.isBindingElement(element)) {
      continue;
    }
    names.push(...bindingNames(element.name));
  }
  return names;
}

function sourceScopeId(sourceFile: ts.SourceFile): string {
  return scopeIdFor(sourceFile, sourceFile);
}

function variableBindingScopeId(
  sourceFile: ts.SourceFile,
  declaration: ts.VariableDeclaration
): string | undefined {
  return declarationScopeId(sourceFile, declaration, {
    name: "value-binding",
    kind: "variable",
    isExported: false
  });
}

function isConstVariableDeclaration(declaration: ts.VariableDeclaration): boolean {
  return (
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
  );
}

function isExpressImport(statement: ts.ImportDeclaration): boolean {
  return (
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "express" &&
    statement.importClause?.isTypeOnly !== true
  );
}

function namedExpressImportBindingKind(
  statement: ts.ImportDeclaration,
  element: ts.ImportSpecifier
): RouteBindingKind {
  if (!isExpressImport(statement) || element.isTypeOnly) {
    return "other";
  }
  const importedName = element.propertyName?.text ?? element.name.text;
  if (importedName === "default") {
    return "express-default-factory";
  }
  if (importedName === "Router") {
    return "express-router-factory";
  }
  return "other";
}

function visibleRouteBindingKind(
  sourceFile: ts.SourceFile,
  identifier: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): RouteBindingKind | undefined {
  for (const scopeId of enclosingScopeIds(sourceFile, identifier)) {
    const candidates = bindings.byScopeId.get(scopeId)?.get(identifier.text);
    if (candidates !== undefined) {
      // A duplicate declaration is ambiguous. It must block lookup rather than
      // allowing an outer Express import to prove a synthetic receiver.
      return candidates.length === 1 ? candidates[0]?.kind : undefined;
    }
  }
  return undefined;
}

function isExpressReceiverInitializer(
  sourceFile: ts.SourceFile,
  initializer: ts.Expression,
  bindings: ScopedRouteReceiverBindings
): boolean {
  if (!ts.isCallExpression(initializer) || initializer.questionDotToken !== undefined) {
    return false;
  }

  if (ts.isIdentifier(initializer.expression)) {
    const binding = visibleRouteBindingKind(sourceFile, initializer.expression, bindings);
    return binding === "express-default-factory" || binding === "express-router-factory";
  }

  if (
    !ts.isPropertyAccessExpression(initializer.expression) ||
    initializer.expression.name.text !== "Router" ||
    !ts.isIdentifier(initializer.expression.expression)
  ) {
    return false;
  }

  const binding = visibleRouteBindingKind(sourceFile, initializer.expression.expression, bindings);
  return binding === "express-default-factory" || binding === "express-namespace";
}

function addScopedValueBinding(
  byScopeId: Map<string, Map<string, RouteBinding[]>>,
  scopeId: string | undefined,
  names: readonly string[],
  declaration: ts.Node,
  bindingKind: RouteBindingKind = "other"
): void {
  if (scopeId === undefined) {
    return;
  }

  const bindings = byScopeId.get(scopeId) ?? new Map<string, RouteBinding[]>();
  for (const name of names) {
    const candidates = bindings.get(name) ?? [];
    candidates.push({ declaration, kind: bindingKind });
    bindings.set(name, candidates);
  }
  byScopeId.set(scopeId, bindings);
}

function markExpressRouteReceiver(
  byScopeId: Map<string, Map<string, RouteBinding[]>>,
  scopeId: string | undefined,
  declaration: ts.VariableDeclaration
): void {
  if (scopeId === undefined || !ts.isIdentifier(declaration.name)) {
    return;
  }

  const binding = byScopeId
    .get(scopeId)
    ?.get(declaration.name.text)
    ?.find((candidate) => candidate.declaration === declaration);
  if (binding !== undefined) {
    binding.kind = "express-receiver";
  }
}

/**
 * Finds value bindings before route extraction so a receiver cannot be inferred
 * from its spelling. A lexical shadow always wins over an outer Express receiver.
 */
function collectScopedRouteReceiverBindings(sourceFile: ts.SourceFile): ScopedRouteReceiverBindings {
  const byScopeId = new Map<string, Map<string, RouteBinding[]>>();
  const rootScopeId = sourceScopeId(sourceFile);

  function collectBindings(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause;
      if (importClause?.name !== undefined) {
        addScopedValueBinding(
          byScopeId,
          rootScopeId,
          [importClause.name.text],
          importClause.name,
          isExpressImport(node) ? "express-default-factory" : "other"
        );
      }
      if (importClause?.namedBindings !== undefined) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          addScopedValueBinding(
            byScopeId,
            rootScopeId,
            [importClause.namedBindings.name.text],
            importClause.namedBindings.name,
            isExpressImport(node) ? "express-namespace" : "other"
          );
        } else {
          for (const element of importClause.namedBindings.elements) {
            addScopedValueBinding(
              byScopeId,
              rootScopeId,
              [element.name.text],
              element.name,
              namedExpressImportBindingKind(node, element)
            );
          }
        }
      }
    }

    if (ts.isVariableDeclaration(node)) {
      const names = bindingNames(node.name);
      const scopeId = variableBindingScopeId(sourceFile, node);
      addScopedValueBinding(byScopeId, scopeId, names, node);
    }

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node) ||
      ts.isImportEqualsDeclaration(node)
    ) {
      if (node.name !== undefined) {
        const scopeId = declarationScopeId(sourceFile, node, {
          name: node.name.text,
          kind: ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ? "class" : "variable",
          isExported: false
        });
        addScopedValueBinding(byScopeId, scopeId, [node.name.text], node);
      }
    }

    if (
      (ts.isFunctionExpression(node) || ts.isClassExpression(node)) &&
      node.name !== undefined
    ) {
      // Named expressions bind their own name only inside their lexical body.
      // Record that self-binding so it cannot be mistaken for an outer import.
      addScopedValueBinding(byScopeId, scopeIdFor(sourceFile, node), [node.name.text], node);
    }

    if (ts.isFunctionLike(node)) {
      const scopeId = scopeIdFor(sourceFile, node);
      for (const parameter of node.parameters) {
        addScopedValueBinding(byScopeId, scopeId, bindingNames(parameter.name), parameter);
      }
    }

    if (ts.isCatchClause(node) && node.variableDeclaration !== undefined) {
      addScopedValueBinding(
        byScopeId,
        scopeIdFor(sourceFile, node),
        bindingNames(node.variableDeclaration.name),
        node.variableDeclaration
      );
    }

    ts.forEachChild(node, collectBindings);
  }

  function collectReceivers(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isConstVariableDeclaration(node) &&
      isExpressReceiverInitializer(sourceFile, node.initializer, { byScopeId })
    ) {
      markExpressRouteReceiver(byScopeId, variableBindingScopeId(sourceFile, node), node);
    }

    ts.forEachChild(node, collectReceivers);
  }

  ts.forEachChild(sourceFile, collectBindings);
  ts.forEachChild(sourceFile, collectReceivers);
  return { byScopeId };
}

function isExpressRouteReceiver(
  sourceFile: ts.SourceFile,
  receiver: ts.Identifier,
  bindings: ScopedRouteReceiverBindings
): boolean {
  return visibleRouteBindingKind(sourceFile, receiver, bindings) === "express-receiver";
}

function staticExpressRoute(
  sourceFile: ts.SourceFile,
  node: ts.CallExpression,
  bindings: ScopedRouteReceiverBindings
): StaticExpressRoute | null {
  if (
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(node.expression.expression) ||
    !isExpressRouteReceiver(sourceFile, node.expression.expression, bindings)
  ) {
    return null;
  }

  const methodName = node.expression.name.text;
  const method = ROUTE_METHODS.find((candidate) => candidate.toLowerCase() === methodName);
  if (method === undefined) {
    return null;
  }

  const pathArgument = node.arguments[0];
  const handler = node.arguments.at(-1);
  if (
    node.arguments.length < 2 ||
    pathArgument === undefined ||
    !ts.isStringLiteral(pathArgument) ||
    !pathArgument.text.startsWith("/") ||
    handler === undefined ||
    !ts.isIdentifier(handler) ||
    node.arguments.slice(1).some((argument) => !ts.isIdentifier(argument))
  ) {
    return null;
  }

  return { method, path: pathArgument.text, handler };
}

function fileNodeFor(sourceFile: ts.SourceFile, input: ExtractFileFactsInput): SymbolNode {
  const fileName = input.filePath.split("/").at(-1) ?? input.filePath;
  return {
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
    range: sourceRange(sourceFile, sourceFile),
    isExported: true,
    declarationOrdinal: 0
  };
}

/**
 * Extracts only file-local, syntax-proven facts. Cross-file resolution is deliberately
 * left to the application layer so an unresolved reference cannot become a false edge.
 */
export function extractFileFacts(input: ExtractFileFactsInput): ExtractedFileFacts {
  const sourceFile = ts.createSourceFile(
    input.filePath,
    input.sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(input)
  );
  const explicitExportNames = collectExplicitExportNames(sourceFile);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const pendingReferences: PendingReference[] = [];
  const localBindings: LocalBinding[] = [];
  const referenceScopes: ReferenceScope[] = [];
  const importBindings: ImportBinding[] = [];
  const exportBindings: ExportBinding[] = [];
  const reExportBindings: ReExportBinding[] = [];
  const declarationOrdinals = new Map<string, number>();
  const routeReceiverBindings = collectScopedRouteReceiverBindings(sourceFile);
  const stack: SymbolNode[] = [];

  const fileNode = fileNodeFor(sourceFile, input);
  symbols.push(fileNode);
  stack.push(fileNode);

  function currentOwner(): SymbolNode {
    const owner = stack.at(-1);
    if (owner === undefined) {
      throw new Error("Extraction symbol stack unexpectedly became empty.");
    }
    return owner;
  }

  function addResolvedEdge(
    sourceId: string,
    targetId: string,
    kind: EdgeKind,
    node: ts.Node,
    referenceName: string
  ): void {
    const range = sourceRange(sourceFile, node);
    edges.push({
      id: createEdgeId({
        sourceId,
        targetId,
        kind,
        line: range.start.line,
        column: range.start.column,
        referenceName
      }),
      sourceId,
      targetId,
      kind,
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName,
      evidence: {
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [targetId]
      }
    });
  }

  function addPendingReference(
    sourceId: string,
    referenceName: string,
    relationKind: PendingReference["relationKind"],
    node: ts.Node
  ): void {
    const range = sourceRange(sourceFile, node);
    const reference: PendingReference = {
      id: createEdgeId({
        sourceId,
        targetId: null,
        kind: relationKind,
        line: range.start.line,
        column: range.start.column,
        referenceName
      }),
      sourceId,
      filePath: input.filePath,
      referenceName,
      relationKind,
      range
    };
    pendingReferences.push(reference);
    referenceScopes.push({
      referenceId: reference.id,
      scopeIds: enclosingScopeIds(sourceFile, node)
    });
  }

  function addStaticExpressRoute(node: ts.CallExpression, route: StaticExpressRoute): void {
    const name = `${route.method} ${route.path}`;
    const qualifiedName = `${input.filePath}#route:${name}`;
    const identity = `${qualifiedName}\u0000route`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "route",
        declarationOrdinal
      }),
      name,
      qualifiedName,
      kind: "route",
      filePath: input.filePath,
      range: sourceRange(sourceFile, node),
      isExported: false,
      declarationOrdinal
    };
    symbols.push(symbol);
    addResolvedEdge(fileNode.id, symbol.id, "contains", node, name);
    addPendingReference(symbol.id, route.handler.text, "routes", route.handler);
  }

  function addDeclaration(node: ts.Node, info: DeclarationInfo): SymbolNode {
    const parent = currentOwner();
    const qualifiedName =
      parent.kind === "file"
        ? `${input.filePath}#${info.name}`
        : `${parent.qualifiedName}.${info.name}`;
    const identity = `${qualifiedName}\u0000${info.kind}`;
    const declarationOrdinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, declarationOrdinal + 1);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: info.kind,
        declarationOrdinal
      }),
      name: info.name,
      qualifiedName,
      kind: info.kind,
      filePath: input.filePath,
      range: sourceRange(sourceFile, node),
      isExported: info.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addResolvedEdge(parent.id, symbol.id, "contains", node, info.name);
    return symbol;
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      addPendingReference(fileNode.id, node.moduleSpecifier.text, "imports", node.moduleSpecifier);

      const importClause = node.importClause;
      if (importClause?.name !== undefined) {
        importBindings.push({
          moduleSpecifier: node.moduleSpecifier.text,
          localName: importClause.name.text,
          importedName: "default",
          range: sourceRange(sourceFile, importClause.name)
        });
      }

      if (importClause?.namedBindings !== undefined && ts.isNamedImports(importClause.namedBindings)) {
        for (const element of importClause.namedBindings.elements) {
          importBindings.push({
            moduleSpecifier: node.moduleSpecifier.text,
            localName: element.name.text,
            importedName: element.propertyName?.text ?? element.name.text,
            range: sourceRange(sourceFile, element)
          });
        }
      } else if (
        importClause?.namedBindings !== undefined &&
        ts.isNamespaceImport(importClause.namedBindings)
      ) {
        // A namespace is a module object rather than a declaration target. Keep
        // the binding so resolution can reject an unsafe global-name fallback.
        importBindings.push({
          moduleSpecifier: node.moduleSpecifier.text,
          localName: importClause.namedBindings.name.text,
          importedName: "*",
          range: sourceRange(sourceFile, importClause.namedBindings)
        });
      }
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      addPendingReference(fileNode.id, node.moduleSpecifier.text, "exports", node.moduleSpecifier);

      if (node.exportClause === undefined) {
        reExportBindings.push({
          kind: "wildcard",
          moduleSpecifier: node.moduleSpecifier.text,
          range: sourceRange(sourceFile, node)
        });
      } else if (ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          reExportBindings.push({
            kind: "named",
            moduleSpecifier: node.moduleSpecifier.text,
            importedName: element.propertyName?.text ?? element.name.text,
            exportedName: element.name.text,
            range: sourceRange(sourceFile, element)
          });
        }
      } else if (ts.isNamespaceExport(node.exportClause)) {
        reExportBindings.push({
          kind: "namespace",
          moduleSpecifier: node.moduleSpecifier.text,
          exportedName: node.exportClause.name.text,
          range: sourceRange(sourceFile, node.exportClause)
        });
      }
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier === undefined &&
      node.exportClause !== undefined &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const element of node.exportClause.elements) {
        exportBindings.push({
          localName: element.propertyName?.text ?? element.name.text,
          exportedName: element.name.text,
          range: sourceRange(sourceFile, element)
        });
      }
    }

    let info = declarationInfo(node, explicitExportNames);
    const exportAssignment = ts.isExportAssignment(node) ? node : null;
    const expressionInfo =
      exportAssignment === null ? null : defaultExportExpressionInfo(exportAssignment);
    let declaredSymbol = info === null ? null : addDeclaration(node, info);
    if (declaredSymbol === null && expressionInfo !== null && exportAssignment !== null) {
      info = expressionInfo;
      declaredSymbol = addDeclaration(exportAssignment.expression, info);
    }
    if (
      declaredSymbol !== null &&
      info !== null &&
      (hasDefaultModifier(node) || expressionInfo !== null)
    ) {
      exportBindings.push({
        localName: info.name,
        exportedName: "default",
        range: sourceRange(sourceFile, node)
      });
    }
    if (ts.isExportAssignment(node) && !node.isExportEquals && ts.isIdentifier(node.expression)) {
      exportBindings.push({
        localName: node.expression.text,
        exportedName: "default",
        range: sourceRange(sourceFile, node)
      });
    }
    if (info !== null && declaredSymbol !== null && hasValueBinding(info)) {
      const enclosingScopeId = declarationScopeId(sourceFile, node, info);
      if (enclosingScopeId !== undefined) {
        localBindings.push({
          name: info.name,
          symbolId: declaredSymbol.id,
          scopeId: enclosingScopeId
        });
      }
    }

    if (ts.isFunctionLike(node)) {
      const functionScopeId = scopeIdFor(sourceFile, node);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name)) {
          localBindings.push({ name: parameter.name.text, symbolId: null, scopeId: functionScopeId });
        }
      }
    }

    if (
      ts.isCatchClause(node) &&
      node.variableDeclaration !== undefined &&
      ts.isIdentifier(node.variableDeclaration.name)
    ) {
      localBindings.push({
        name: node.variableDeclaration.name.text,
        symbolId: null,
        scopeId: scopeIdFor(sourceFile, node)
      });
    }
    if (declaredSymbol !== null) {
      stack.push(declaredSymbol);
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      addPendingReference(currentOwner().id, node.expression.text, "calls", node.expression);
    }

    ts.forEachChild(node, visit);

    if (declaredSymbol !== null) {
      stack.pop();
    }
  }

  ts.forEachChild(sourceFile, visit);

  function extractStaticExpressRoutes(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const route = staticExpressRoute(sourceFile, node, routeReceiverBindings);
      if (route !== null) {
        addStaticExpressRoute(node, route);
      }
    }
    ts.forEachChild(node, extractStaticExpressRoutes);
  }

  ts.forEachChild(sourceFile, extractStaticExpressRoutes);

  return {
    symbols,
    edges,
    pendingReferences,
    localBindings,
    referenceScopes,
    importBindings,
    exportBindings,
    reExportBindings
  };
}
