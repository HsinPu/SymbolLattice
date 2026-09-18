import ts from "typescript";

function transparent(node: ts.Node): node is ts.ParenthesizedExpression | ts.AsExpression |
  ts.TypeAssertion | ts.SatisfiesExpression | ts.NonNullExpression {
  return ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node);
}

function memberPath(node: ts.Node, depth = 0): string | null {
  if (depth > 32) return null;
  if (transparent(node)) return memberPath(node.expression, depth + 1);
  if (ts.isIdentifier(node)) return node.text;
  if (node.kind === ts.SyntaxKind.ThisKeyword) return "this";
  if ((!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) || node.questionDotToken) return null;
  const owner = memberPath(node.expression, depth + 1);
  if (owner === null) return null;
  let result: string;
  if (ts.isPropertyAccessExpression(node)) {
    if (!ts.isIdentifier(node.name)) return null;
    result = `${owner}.${node.name.text}`;
  } else {
    const key = node.argumentExpression;
    if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) result = `${owner}[${JSON.stringify(key.text)}]`;
    else if (ts.isNumericLiteral(key)) result = `${owner}[${Number(key.text)}]`;
    else return null;
  }
  return result.length <= 512 ? result : null;
}

/** A source label and range, not proof of property identity or runtime dispatch. */
export function anonymousMemberAssignment(node: ts.Node): { name: string; assignment: ts.BinaryExpression } | null {
  if (!ts.isArrowFunction(node) && (!ts.isFunctionExpression(node) || node.name !== undefined)) return null;
  let value: ts.Node = node;
  while (value.parent && transparent(value.parent) && value.parent.expression === value) value = value.parent;
  const assignment = value.parent;
  if (!assignment || !ts.isBinaryExpression(assignment) || assignment.right !== value ||
      assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return null;
  let target: ts.Node = assignment.left;
  while (transparent(target)) target = target.expression;
  if (!ts.isPropertyAccessExpression(target) && !ts.isElementAccessExpression(target)) return null;
  const name = memberPath(target);
  return name === null ? null : { name, assignment };
}
