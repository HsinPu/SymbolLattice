import ts from "typescript";
import type { ArtifactFacts, SourceRange, SymbolNode } from "../domain/index.js";

type Facts = NonNullable<ArtifactFacts["commonJsFacts"]>;

/** Static object exports and const destructuring; no CommonJS/ESM interop inference. */
export function extractCommonJsFacts(input: {
  sourceFile: ts.SourceFile;
  enabled: boolean;
  moduleGlobalSafe: boolean;
  requires: ReadonlyMap<ts.VariableDeclaration, ts.StringLiteral>;
  symbols: ReadonlyMap<ts.Node, SymbolNode>;
  bindingOf: (identifier: ts.Identifier) => ts.Node | undefined;
  recordProperty: (owner: SymbolNode, name: string, property: ts.PropertyAssignment) => SymbolNode;
}): Facts {
  const { sourceFile, bindingOf } = input;
  const range = (node: ts.Node): SourceRange => {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return { start: { line: start.line + 1, column: start.character + 1 }, end: { line: end.line + 1, column: end.character + 1 } };
  };
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => { nodes.push(node); ts.forEachChild(node, visit); };
  visit(sourceFile);
  const relative = (specifier: string): boolean => specifier.startsWith("./") || specifier.startsWith("../");
  const requires = [...new Set([...input.requires.values()].map((node) => node.text).filter(relative))];
  const unsafeModules = new Set<string>();
  const propertyUnsafeModules = new Set<string>();
  const receiverCalls: Facts["receiverCalls"][number][] = [];
  const exports: Facts["exports"][number][] = [];
  const calls: Facts["calls"][number][] = [];
  const propertyExports: NonNullable<Facts["propertyExports"]>[number][] = [];
  const propertyUses: NonNullable<Facts["propertyUses"]>[number][] = [];
  const hasDynamicScope = nodes.some((node) => ts.isWithStatement(node) ||
    (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "eval"));

  const assignmentTargets = (node: ts.Node): ts.Identifier[] => {
    if (ts.isIdentifier(node)) return [node];
    if (ts.isParenthesizedExpression(node)) return assignmentTargets(node.expression);
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(assignmentTargets);
    if (ts.isSpreadElement(node)) return assignmentTargets(node.expression);
    if (ts.isBinaryExpression(node)) return assignmentTargets(node.left);
    if (ts.isObjectLiteralExpression(node)) return node.properties.flatMap((property) =>
      ts.isShorthandPropertyAssignment(property) ? [property.name] :
      ts.isPropertyAssignment(property) ? assignmentTargets(property.initializer) :
      ts.isSpreadAssignment(property) ? assignmentTargets(property.expression) : []);
    return [];
  };
  const assigned = new Set<ts.Node>();
  const assignment = (node: ts.Node): ts.Node | undefined => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return node.left;
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) return node.operand;
    if (ts.isForOfStatement(node) || ts.isForInStatement(node)) return node.initializer;
    if (ts.isDeleteExpression(node)) return node.expression;
    return undefined;
  };
  for (const node of nodes) {
    const target = assignment(node);
    if (target) for (const identifier of assignmentTargets(target)) {
      const binding = bindingOf(identifier);
      if (binding) assigned.add(binding);
    }
  }
  const constDeclaration = (node: ts.VariableDeclaration): boolean =>
    ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0;
  const imported = new Map<ts.VariableDeclaration, Map<string, { name: string; range: SourceRange; specifier: string }>>();
  for (const [declaration, specifier] of input.requires) {
    if (!input.enabled || hasDynamicScope || !relative(specifier.text) || !constDeclaration(declaration) || assigned.has(declaration) || !ts.isObjectBindingPattern(declaration.name)) continue;
    const names = new Map<string, { name: string; range: SourceRange; specifier: string }>();
    for (const element of declaration.name.elements) {
      if (!ts.isIdentifier(element.name) || element.dotDotDotToken || element.initializer ||
          (element.propertyName && !ts.isIdentifier(element.propertyName) && !ts.isStringLiteral(element.propertyName))) continue;
      const name = element.propertyName && (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName))
        ? element.propertyName.text : element.name.text;
      names.set(element.name.text, { name, range: range(declaration), specifier: specifier.text });
    }
    imported.set(declaration, names);
  }
  for (const node of nodes) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && !node.questionDotToken) {
      const binding = bindingOf(node.expression);
      const item = binding && ts.isVariableDeclaration(binding) ? imported.get(binding)?.get(node.expression.text) : undefined;
      if (item && node.getStart(sourceFile) > binding!.getEnd()) calls.push({ moduleSpecifier: item.specifier,
        importedName: item.name, localName: node.expression.text, importRange: item.range, range: range(node.expression) });
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      const binding = bindingOf(node.expression);
      const item = binding && ts.isVariableDeclaration(binding) ? imported.get(binding)?.get(node.expression.text) : undefined;
      if (item && node.getStart(sourceFile) > binding!.getEnd()) propertyUses.push({
        moduleSpecifier: item.specifier, importedName: item.name, localName: node.expression.text,
        importRange: item.range, range: range(node.expression)
      });
    }
    // A required module object that escapes or is written may change exports
    // observed by another importer. Retain a project-level suppression receipt.
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== "require" ||
        node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]!)) continue;
    const specifier = (node.arguments[0] as ts.StringLiteral).text;
    if (!relative(specifier)) continue;
    if (!requires.includes(specifier)) requires.push(specifier);
    if (hasDynamicScope) { unsafeModules.add(specifier); continue; }
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name) && parent.initializer === node) {
      if (parent.name.elements.some((element) => element.dotDotDotToken || element.initializer ||
          (element.propertyName && ts.isComputedPropertyName(element.propertyName)))) unsafeModules.add(specifier);
      continue;
    }
    const readOnlyMember = (object: ts.Node): boolean => {
      const access = object.parent;
      if ((!ts.isPropertyAccessExpression(access) && !ts.isElementAccessExpression(access)) || access.expression !== object) return false;
      let target: ts.Node = access;
      while (ts.isParenthesizedExpression(target.parent)) target = target.parent;
      // Calling a member passes the module object as `this`; the function can
      // mutate it or return it (including Object.prototype.valueOf). Only a
      // proven own function export that never observes `this` can be safe.
      if ((ts.isCallExpression(target.parent) || ts.isTaggedTemplateExpression(target.parent)) &&
          (ts.isCallExpression(target.parent) ? target.parent.expression : target.parent.tag) === target) {
        const name = ts.isPropertyAccessExpression(access) ? access.name.text :
          ts.isStringLiteral(access.argumentExpression) ? access.argumentExpression.text : undefined;
        if (name === undefined) return false;
        receiverCalls.push({ moduleSpecifier: specifier, exportedName: name });
      }
      while (ts.isParenthesizedExpression(target.parent) || ts.isArrayLiteralExpression(target.parent) ||
          ts.isObjectLiteralExpression(target.parent) || ts.isSpreadElement(target.parent) || ts.isSpreadAssignment(target.parent) ||
          (ts.isPropertyAssignment(target.parent) && target.parent.initializer === target)) target = target.parent;
      return assignment(target.parent) !== target;
    };
    if (readOnlyMember(node)) continue;
    if (ts.isExpressionStatement(parent)) continue;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && parent.initializer === node) {
      const safe = !assigned.has(parent) && nodes.every((use) => !ts.isIdentifier(use) || use === parent.name ||
        bindingOf(use) !== parent || readOnlyMember(use));
      if (safe) continue;
    }
    unsafeModules.add(specifier);
  }

  const readOnlyPropertyObservation = (object: ts.Node): boolean => {
    const parent = object.parent;
    if (ts.isCallExpression(parent) && parent.arguments.includes(object as ts.Expression) &&
        ts.isPropertyAccessExpression(parent.expression) &&
        ts.isIdentifier(parent.expression.expression) && parent.expression.expression.text === "Object" &&
        bindingOf(parent.expression.expression) === undefined &&
        ["keys", "values", "entries"].includes(parent.expression.name.text)) return true;
    if ((!ts.isPropertyAccessExpression(parent) && !ts.isElementAccessExpression(parent)) ||
        parent.expression !== object) return false;
    if ((ts.isCallExpression(parent.parent) || ts.isTaggedTemplateExpression(parent.parent)) &&
        (ts.isCallExpression(parent.parent) ? parent.parent.expression : parent.parent.tag) === parent) return false;
    let target: ts.Node = parent;
    while (ts.isParenthesizedExpression(target.parent) || ts.isArrayLiteralExpression(target.parent) ||
        ts.isObjectLiteralExpression(target.parent) || ts.isSpreadElement(target.parent) ||
        ts.isSpreadAssignment(target.parent) ||
        (ts.isPropertyAssignment(target.parent) && target.parent.initializer === target)) target = target.parent;
    return assignment(target.parent) !== target;
  };
  for (const node of nodes) {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== "require" ||
        node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]!)) continue;
    const specifier = (node.arguments[0] as ts.StringLiteral).text;
    if (!relative(specifier)) continue;
    if (hasDynamicScope) { propertyUnsafeModules.add(specifier); continue; }
    const parent = node.parent;
    // Destructuring copies values (including a rest object); it cannot write
    // the required module object. Its own local binding safety is checked at use.
    if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name) && parent.initializer === node) continue;
    if (readOnlyPropertyObservation(node) || ts.isExpressionStatement(parent)) continue;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && parent.initializer === node &&
        !assigned.has(parent) && nodes.every((use) => !ts.isIdentifier(use) || use === parent.name ||
          bindingOf(use) !== parent || readOnlyPropertyObservation(use))) continue;
    propertyUnsafeModules.add(specifier);
  }

  // An object property is a source declaration even when its factory's return
  // type is unknown. Keep its exact binding separate from runtime construction.
  const objectAssignments = sourceFile.statements.flatMap((statement) => {
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) return [];
    const expression = statement.expression;
    return expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(expression.left) &&
      ts.isIdentifier(expression.left.expression) && expression.left.expression.text === "module" &&
      expression.left.name.text === "exports" ? [expression] : [];
  });
  const objectAssignment = objectAssignments.length === 1 ? objectAssignments[0] : undefined;
  const objectBinding = objectAssignment !== undefined && ts.isIdentifier(objectAssignment.right)
    ? bindingOf(objectAssignment.right) : undefined;
  if (input.enabled && !hasDynamicScope && input.moduleGlobalSafe && objectAssignment &&
      objectBinding && ts.isVariableDeclaration(objectBinding) &&
      ts.isVariableStatement(objectBinding.parent.parent) && objectBinding.parent.parent.parent === sourceFile &&
      constDeclaration(objectBinding) && ts.isIdentifier(objectBinding.name) &&
      objectBinding.initializer !== undefined && ts.isObjectLiteralExpression(objectBinding.initializer) &&
      !assigned.has(objectBinding) && input.symbols.has(objectBinding)) {
    const object = objectBinding.initializer;
    const names = new Set<string>();
    const properties: { name: string; node: ts.PropertyAssignment }[] = [];
    let safe = true;
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property) || !property.name ||
          (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) { safe = false; break; }
      const name = property.name.text;
      if (name === "__proto__" || names.has(name)) { safe = false; break; }
      names.add(name);
      properties.push({ name, node: property });
    }
    const changedNames = new Set<string>();
    const staticMemberName = (node: ts.Node): string | undefined =>
      ts.isPropertyAccessExpression(node) ? node.name.text :
      ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)
        ? node.argumentExpression.text : undefined;
    const isExportObject = (node: ts.Node): boolean =>
      ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
      node.expression.text === "module" && node.name.text === "exports";
    const mayWriteMember = (access: ts.Node): boolean => {
      let target = access;
      while (ts.isParenthesizedExpression(target.parent) || ts.isArrayLiteralExpression(target.parent) ||
          ts.isObjectLiteralExpression(target.parent) || ts.isSpreadElement(target.parent) ||
          ts.isSpreadAssignment(target.parent) ||
          (ts.isPropertyAssignment(target.parent) && target.parent.initializer === target)) {
        target = target.parent;
      }
      return assignment(target.parent) === target;
    };
    for (const node of nodes) {
      if (!ts.isIdentifier(node) || bindingOf(node) !== objectBinding || node === objectBinding.name ||
          node === objectAssignment.right) continue;
      const access = node.parent;
      if ((!ts.isPropertyAccessExpression(access) && !ts.isElementAccessExpression(access)) ||
          access.expression !== node || staticMemberName(access) === undefined) { safe = false; break; }
      if (mayWriteMember(access)) changedNames.add(staticMemberName(access)!);
      if ((ts.isCallExpression(access.parent) || ts.isTaggedTemplateExpression(access.parent)) &&
          (ts.isCallExpression(access.parent) ? access.parent.expression : access.parent.tag) === access) {
        safe = false; break;
      }
    }
    for (const node of nodes) {
      if (!ts.isIdentifier(node) || node.text !== "exports" ||
          (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node &&
           ts.isIdentifier(node.parent.expression) && node.parent.expression.text === "module")) continue;
      safe = false; break;
    }
    for (const node of nodes) {
      if ((!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) ||
          !isExportObject(node.expression) || !mayWriteMember(node)) continue;
      const name = staticMemberName(node);
      if (name === undefined) { safe = false; break; }
      changedNames.add(name);
    }
    if (safe) {
      const owner = input.symbols.get(objectBinding)!;
      for (const property of properties) {
        if (changedNames.has(property.name)) continue;
        const symbol = input.recordProperty(owner, property.name, property.node);
        propertyExports.push({ exportedName: property.name, symbolId: symbol.id, range: range(property.node) });
      }
    }
  }

  const exportAssignments = sourceFile.statements.flatMap((statement) => {
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) return [];
    const expression = statement.expression;
    return expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(expression.left) &&
      ts.isIdentifier(expression.left.expression) && expression.left.expression.text === "module" &&
      expression.left.name.text === "exports" && ts.isObjectLiteralExpression(expression.right) ? [expression] : [];
  });
  const exported = exportAssignments.length === 1 ? exportAssignments[0]! : undefined;
  if (!input.enabled || hasDynamicScope || !input.moduleGlobalSafe || !exported || !ts.isPropertyAccessExpression(exported.left) || !ts.isObjectLiteralExpression(exported.right)) return { requires, unsafeModules: [...unsafeModules], propertyUnsafeModules: [...propertyUnsafeModules], receiverCalls, exports, calls, propertyExports, propertyUses };
  const left = exported.left;
  if (nodes.some((node) => ts.isIdentifier(node) &&
      ((node.text === "module" && node !== left.expression) || (node.text === "exports" && node !== left.name)))) return { requires, unsafeModules: [...unsafeModules], propertyUnsafeModules: [...propertyUnsafeModules], receiverCalls, exports, calls, propertyExports, propertyUses };
  const names = new Set<string>();
  for (const property of exported.right.properties) {
    if (ts.isSpreadAssignment(property) || ts.isGetAccessor(property) || ts.isSetAccessor(property) || !property.name || ts.isComputedPropertyName(property.name) ||
        (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) return { requires, unsafeModules: [...unsafeModules], propertyUnsafeModules: [...propertyUnsafeModules], receiverCalls, exports: [], calls, propertyExports, propertyUses };
    const name = property.name.text;
    if (name === "__proto__" || names.has(name)) return { requires, unsafeModules: [...unsafeModules], propertyUnsafeModules: [...propertyUnsafeModules], receiverCalls, exports: [], calls, propertyExports, propertyUses };
    names.add(name);
    const local = ts.isShorthandPropertyAssignment(property) ? property.name :
      ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer) ? property.initializer : undefined;
    if (!local) continue;
    const declaration = bindingOf(local);
    if (!declaration || assigned.has(declaration)) continue;
    const callable = ts.isFunctionDeclaration(declaration) && declaration.parent === sourceFile ||
      ts.isVariableDeclaration(declaration) && declaration.parent.parent.parent === sourceFile && constDeclaration(declaration) &&
      declaration.initializer !== undefined && (ts.isFunctionExpression(declaration.initializer) || ts.isArrowFunction(declaration.initializer));
    const symbol = input.symbols.get(declaration);
    if (callable && symbol) exports.push({ exportedName: name, symbolId: symbol.id, range: range(property),
      receiverIndependent: !nodes.some((node) => node.kind === ts.SyntaxKind.ThisKeyword &&
        node.pos >= declaration.pos && node.end <= declaration.end) });
  }
  return { requires, unsafeModules: [...unsafeModules], propertyUnsafeModules: [...propertyUnsafeModules], receiverCalls, exports, calls, propertyExports, propertyUses };
}
