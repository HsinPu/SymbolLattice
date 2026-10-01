import ts from "typescript";
import { createEdgeId, type GraphEdge, type PendingReference, type SymbolNode } from "../domain/index.js";

/** Written callees only; no receiver type, module target or runtime dispatch inference. */
export function javascriptMemberCallReceipts(
  sourceFile: ts.SourceFile, filePath: string,
  declarations: ReadonlyMap<ts.Node, SymbolNode>,
  existingEdges: readonly GraphEdge[], pending: readonly PendingReference[]
): readonly GraphEdge[] {
  const nameOf = (node: ts.Expression): string | null => {
    if (ts.isIdentifier(node)) return node.text;
    if (node.kind === ts.SyntaxKind.ThisKeyword) return "this";
    if (!ts.isPropertyAccessExpression(node) || node.questionDotToken || !ts.isIdentifier(node.name)) return null;
    const receiver = nameOf(node.expression);
    return receiver === null ? null : `${receiver}.${node.name.text}`;
  };
  const ownerOf = (node: ts.Node): SymbolNode | null => {
    for (let current = node.parent; current !== undefined; current = current.parent) {
      if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) return null;
      if (!ts.isFunctionLike(current)) continue;
      const body = (current as ts.FunctionLikeDeclaration).body;
      if (body === undefined || node.getStart(sourceFile) < body.getStart(sourceFile) || node.end > body.end) return null;
      // Never attribute an unrepresented callback's body to an outer function.
      return declarations.get(current) ??
        ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
          ts.isVariableDeclaration(current.parent) && current.parent.initializer === current
          ? declarations.get(current.parent) ?? null : null);
    }
    return null;
  };
  const sites = new Set([...existingEdges.filter(edge => edge.kind === "calls"),
    ...pending.filter(reference => reference.relationKind === "calls")]
    .map(edge => `${edge.sourceId}:${edge.range.end.line}:${edge.range.end.column}`));
  const receipts: GraphEdge[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && !ts.isCallChain(node) && ts.isPropertyAccessExpression(node.expression)) {
      const referenceName = nameOf(node.expression), owner = ownerOf(node);
      if (referenceName !== null && owner !== null) {
        const start = sourceFile.getLineAndCharacterOfPosition(node.expression.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.expression.end);
        const range = { start: { line: start.line + 1, column: start.character + 1 },
          end: { line: end.line + 1, column: end.character + 1 } };
        const site = `${owner.id}:${range.end.line}:${range.end.column}`;
        if (!sites.has(site)) {
          sites.add(site);
          receipts.push({ id: createEdgeId({ sourceId: owner.id, targetId: null, kind: "calls",
            line: range.start.line, column: range.start.column, referenceName }),
            sourceId: owner.id, targetId: null, kind: "calls", filePath, range,
            resolution: "unresolved", confidence: 0, referenceName,
            evidence: { ruleId: "syntax.javascript.member-call.unknown-receiver", stage: "syntax", candidateSymbolIds: [] } });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return receipts;
}
