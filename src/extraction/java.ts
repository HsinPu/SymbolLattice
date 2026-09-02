import { parser } from "@lezer/java";

import {
  createEdgeId,
  createSymbolId,
  JAVA_EXHAUSTIVE_ASSIGNMENT_JOIN_MAXIMUM_BRANCHES,
  JAVA_EXHAUSTIVE_SWITCH_JOIN_MAXIMUM_ARMS,
  JAVA_INSTANCEOF_AND_CHAIN_MAXIMUM_OPERANDS,
  JAVA_NEGATED_PATTERN_MAXIMUM_GROUPING_DEPTH,
  type ArtifactFacts,
  type GraphEdge,
  type JvmAnnotationReferenceFact,
  type JvmCallableSignatureReferenceFact,
  type JvmDependencyInjectionReferenceFact,
  type JvmFacts,
  type JvmHeritageSyntax,
  type JvmImportReferenceFact,
  type JavaCallTypeReferenceFact,
  type JavaCallableDeclarationFact,
  type JavaChainedCallReferenceFact,
  type JavaFieldDeclarationFact,
  type JavaInstantiationReferenceFact,
  type JavaMemberCallReferenceFact,
  type PendingReference,
  type ReactNativeFacts,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SpringBootConfigurationPropertiesPrefixReferenceFact,
  type SpringBootPropertiesValueReferenceFact,
  type SymbolNode
} from "../domain/index.js";
import { parse as parseAstGrep, type SgNode } from "./ast-grep-languages.js";
import { frameworkCapability } from "./framework-capabilities.js";
import { inspectModernJavaDeclarations } from "./java-modern-declarations.js";
import { inspectJavaRecords, type StaticJavaRecord } from "./java-records.js";

export interface JavaExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "java";
}

type JavaSyntaxNode = ReturnType<typeof parser.parse>["topNode"];

type StaticJavaLoopTargetKind = "while" | "do" | "for" | "enhanced-for";
type StaticJavaLabeledTargetKind = StaticJavaLoopTargetKind | "block" | "statement";
type StaticJavaAbruptTargetKind =
  | StaticJavaLabeledTargetKind
  | "switch"
  | "switch-expression";

interface StaticJavaAnnotation {
  readonly name: string;
  readonly node: JavaSyntaxNode;
  readonly referenceNode: JavaSyntaxNode;
}

interface StaticJavaClass {
  readonly kind: "class";
  readonly name: string;
  readonly node: JavaSyntaxNode;
  readonly body: JavaSyntaxNode;
  readonly annotations: readonly StaticJavaAnnotation[];
  readonly isExported: boolean;
}

interface StaticJavaInterface {
  readonly kind: "interface";
  readonly name: string;
  readonly node: JavaSyntaxNode;
  readonly body: JavaSyntaxNode;
  readonly annotations: readonly StaticJavaAnnotation[];
  readonly isExported: boolean;
}

type StaticJavaType = StaticJavaClass | StaticJavaInterface;

interface StaticJavaSuperclassReference {
  readonly name: string;
  readonly node: JavaSyntaxNode;
  /** Direct dotted spelling such as `example.api.Contract`, never an import lookup. */
  readonly qualifiedTypePath?: string;
}

interface StaticJavaDependencyInjectionReference {
  readonly syntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly reference: StaticJavaSuperclassReference;
}

interface StaticJavaInstanceofAndPatternSyntaxBase {
  readonly name: string;
  readonly typePath: string;
  readonly typeRange: SourceRange;
  readonly declarationRange: SourceRange;
  readonly conditionRange: SourceRange;
  readonly testedValueRange: SourceRange;
  readonly trueBlockRange: SourceRange;
  readonly trueBlockOffsets: { readonly start: number; readonly end: number };
}

type StaticJavaInstanceofAndPatternSyntax =
  | (StaticJavaInstanceofAndPatternSyntaxBase & {
      readonly kind: "single";
      readonly rightOperandRange: SourceRange;
      readonly rightOperandOffsets: { readonly start: number; readonly end: number };
    })
  | (StaticJavaInstanceofAndPatternSyntaxBase & {
      readonly kind: "chain";
      readonly logicalOperandRanges: readonly SourceRange[];
      readonly activeOperandOffsets: readonly {
        readonly start: number;
        readonly end: number;
      }[];
      readonly operandCount: number;
      readonly maximumOperands: number;
    })
  | (StaticJavaInstanceofAndPatternSyntaxBase & {
      readonly kind: "grouped-chain";
      readonly logicalOperandRanges: readonly SourceRange[];
      readonly logicalOperandGroupingPaths: readonly (readonly (
        | "left"
        | "right"
        | "parenthesized"
      )[])[];
      readonly groupingRanges: readonly SourceRange[];
      readonly activeOperandOffsets: readonly {
        readonly start: number;
        readonly end: number;
      }[];
      readonly operandCount: number;
      readonly maximumOperands: number;
    })
  | {
      readonly kind: "negated-early-exit";
      readonly name: string;
      readonly typePath: string;
      readonly typeRange: SourceRange;
      readonly declarationRange: SourceRange;
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly negatedPatternRange: SourceRange;
      readonly negationGroupingRanges: readonly SourceRange[];
      readonly maximumGroupingDepth: number;
      readonly guardStatementRange: SourceRange;
      readonly exitBodyKind: "block" | "statement";
      readonly exitBodyRange: SourceRange;
      readonly abruptCompletionKind: "return" | "throw" | "break" | "continue" | "yield";
      readonly abruptStatementRange: SourceRange;
      readonly abruptWrapperKind: "try-finally" | null;
      readonly abruptWrapperRange: SourceRange | null;
      readonly abruptWrapperTryBodyRange: SourceRange | null;
      readonly abruptWrapperFinallyRange: SourceRange | null;
      readonly abruptWrapperFinallyBodyRange: SourceRange | null;
      readonly abruptWrapperFinallyStatementRanges: readonly SourceRange[];
      readonly abruptWrapperMaximumFinallyStatements: number;
      readonly abruptTargetKind: StaticJavaAbruptTargetKind | null;
      readonly abruptTargetRange: SourceRange | null;
      readonly abruptTargetBodyRange: SourceRange | null;
      readonly abruptTargetCaseGroupRange: SourceRange | null;
      readonly abruptTargetCaseLabelRanges: readonly SourceRange[];
      readonly abruptTargetRuleRange: SourceRange | null;
      readonly abruptTargetRuleBodyRange: SourceRange | null;
      readonly abruptTargetRuleLabelRange: SourceRange | null;
      readonly abruptTargetExpressionContext:
        | StaticJavaSwitchYieldTarget["expressionContext"]
        | null;
      readonly abruptTargetLabel: string | null;
      readonly abruptTargetLabelRange: SourceRange | null;
      readonly followingScopeRange: SourceRange;
      readonly followingScopeOffsets: { readonly start: number; readonly end: number };
    }
  | {
      readonly kind: "negated-else";
      readonly name: string;
      readonly typePath: string;
      readonly typeRange: SourceRange;
      readonly declarationRange: SourceRange;
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly negatedPatternRange: SourceRange;
      readonly negationGroupingRanges: readonly SourceRange[];
      readonly maximumGroupingDepth: number;
      readonly guardStatementRange: SourceRange;
      readonly thenBodyKind: "block" | "statement";
      readonly thenBodyRange: SourceRange;
      readonly thenAbruptCompletionKind:
        | "return"
        | "throw"
        | "break"
        | "continue"
        | "yield"
        | null;
      readonly thenAbruptStatementRange: SourceRange | null;
      readonly thenAbruptWrapperKind: "try-finally" | null;
      readonly thenAbruptWrapperRange: SourceRange | null;
      readonly thenAbruptWrapperTryBodyRange: SourceRange | null;
      readonly thenAbruptWrapperFinallyRange: SourceRange | null;
      readonly thenAbruptWrapperFinallyBodyRange: SourceRange | null;
      readonly thenAbruptWrapperFinallyStatementRanges: readonly SourceRange[];
      readonly thenAbruptWrapperMaximumFinallyStatements: number;
      readonly thenAbruptTargetKind: StaticJavaAbruptTargetKind | null;
      readonly thenAbruptTargetRange: SourceRange | null;
      readonly thenAbruptTargetBodyRange: SourceRange | null;
      readonly thenAbruptTargetCaseGroupRange: SourceRange | null;
      readonly thenAbruptTargetCaseLabelRanges: readonly SourceRange[];
      readonly thenAbruptTargetRuleRange: SourceRange | null;
      readonly thenAbruptTargetRuleBodyRange: SourceRange | null;
      readonly thenAbruptTargetRuleLabelRange: SourceRange | null;
      readonly thenAbruptTargetExpressionContext:
        | StaticJavaSwitchYieldTarget["expressionContext"]
        | null;
      readonly thenAbruptTargetLabel: string | null;
      readonly thenAbruptTargetLabelRange: SourceRange | null;
      readonly elseBodyKind: "block" | "statement";
      readonly elseBodyRange: SourceRange;
      readonly elseBodyOffsets: { readonly start: number; readonly end: number };
      readonly followingScopeRange: SourceRange | null;
      readonly followingScopeOffsets: { readonly start: number; readonly end: number } | null;
    };

interface StaticJavaInstanceofAndPatternInspection {
  readonly syntaxes: readonly StaticJavaInstanceofAndPatternSyntax[];
  readonly legacyRecoveryOffsets: readonly { readonly start: number; readonly end: number }[];
}

interface StaticJavaDependencyInjectionAnnotation {
  readonly path: string;
  readonly constructorSyntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly fieldSyntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly methodSyntax: JvmDependencyInjectionReferenceFact["syntax"];
}

interface StaticJavaResourceInjectionAnnotation {
  readonly path: string;
  readonly fieldSyntax: JvmDependencyInjectionReferenceFact["syntax"];
  readonly setterSyntax: JvmDependencyInjectionReferenceFact["syntax"];
}

interface StaticJavaMethod {
  readonly name: string;
  readonly nameNode: JavaSyntaxNode;
  readonly node: JavaSyntaxNode;
  /** Null for an abstract interface declaration such as `void run();`. */
  readonly body: JavaSyntaxNode | null;
  readonly annotations: readonly StaticJavaAnnotation[];
  readonly isStatic: boolean;
  readonly isFinal: boolean;
  readonly visibility: "public" | "protected" | "package" | "private";
  readonly isExported: boolean;
}

interface StaticJavaConstructor {
  readonly name: string;
  readonly nameNode: JavaSyntaxNode;
  readonly node: JavaSyntaxNode;
  readonly body: JavaSyntaxNode;
  readonly annotations: readonly StaticJavaAnnotation[];
  readonly visibility: "public" | "protected" | "package" | "private";
  readonly isExported: boolean;
}

type StaticJavaReactNativeModuleKind = "direct" | "codegen-spec";

interface StaticJavaReactNativeModule {
  readonly moduleName: string;
  readonly kind: StaticJavaReactNativeModuleKind;
}

interface StaticHttpRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly node: JavaSyntaxNode;
  readonly ruleId?: string;
}

interface StaticSpringBootPropertiesReference {
  readonly key: string;
  readonly node: JavaSyntaxNode;
}

interface StaticSpringBootConfigurationPropertiesPrefixReference {
  readonly prefix: string;
  readonly node: JavaSyntaxNode;
}

const SPRING_REST_CONTROLLER_PATH = "org.springframework.web.bind.annotation.RestController";
const SPRING_CONTROLLER_PATH = "org.springframework.stereotype.Controller";
const SPRING_REQUEST_MAPPING_PATH = "org.springframework.web.bind.annotation.RequestMapping";
const SPRING_REQUEST_METHOD_PATH = "org.springframework.web.bind.annotation.RequestMethod";
const SPRING_VALUE_PATH = "org.springframework.beans.factory.annotation.Value";
const SPRING_CONFIGURATION_PROPERTIES_PATH =
  "org.springframework.boot.context.properties.ConfigurationProperties";
const SPRING_CONFIGURATION_PATH = "org.springframework.context.annotation.Configuration";
const SPRING_BEAN_PATH = "org.springframework.context.annotation.Bean";
const SPRING_AUTOWIRED_PATH = "org.springframework.beans.factory.annotation.Autowired";
const JAKARTA_INJECT_PATH = "jakarta.inject.Inject";
const JAVAX_INJECT_PATH = "javax.inject.Inject";
const JAKARTA_RESOURCE_PATH = "jakarta.annotation.Resource";
const JAVAX_RESOURCE_PATH = "javax.annotation.Resource";
const REACT_NATIVE_REACT_METHOD_PATH = "com.facebook.react.bridge.ReactMethod";
const REACT_NATIVE_CONTEXT_BASE_MODULE_PATH =
  "com.facebook.react.bridge.ReactContextBaseJavaModule";
const MICRONAUT_CONTROLLER_PATH = "io.micronaut.http.annotation.Controller";
const JAKARTA_REST_PATH_PATHS = ["jakarta.ws.rs.Path", "javax.ws.rs.Path"] as const;
const SPRING_BOOT_PROPERTIES_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const REACT_NATIVE_BRIDGE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

const JAVA_DEPENDENCY_INJECTION_ANNOTATIONS: readonly StaticJavaDependencyInjectionAnnotation[] = [
  {
    path: SPRING_AUTOWIRED_PATH,
    constructorSyntax: "spring-autowired-constructor",
    fieldSyntax: "spring-autowired-field",
    methodSyntax: "spring-autowired-method"
  },
  {
    path: JAKARTA_INJECT_PATH,
    constructorSyntax: "jakarta-inject-constructor",
    fieldSyntax: "jakarta-inject-field",
    methodSyntax: "jakarta-inject-method"
  },
  {
    path: JAVAX_INJECT_PATH,
    constructorSyntax: "javax-inject-constructor",
    fieldSyntax: "javax-inject-field",
    methodSyntax: "javax-inject-method"
  }
];

const JAVA_RESOURCE_INJECTION_ANNOTATIONS: readonly StaticJavaResourceInjectionAnnotation[] = [
  {
    path: JAKARTA_RESOURCE_PATH,
    fieldSyntax: "jakarta-resource-field",
    setterSyntax: "jakarta-resource-setter"
  },
  {
    path: JAVAX_RESOURCE_PATH,
    fieldSyntax: "javax-resource-field",
    setterSyntax: "javax-resource-setter"
  }
];

const SPRING_METHOD_MAPPING_PATHS: Readonly<Record<string, RouteMethod>> = {
  "org.springframework.web.bind.annotation.GetMapping": "GET",
  "org.springframework.web.bind.annotation.PostMapping": "POST",
  "org.springframework.web.bind.annotation.PutMapping": "PUT",
  "org.springframework.web.bind.annotation.PatchMapping": "PATCH",
  "org.springframework.web.bind.annotation.DeleteMapping": "DELETE"
};

const SPRING_REQUEST_METHODS: Readonly<Record<string, RouteMethod>> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
  TRACE: "TRACE"
};

const MICRONAUT_METHOD_MAPPING_PATHS: Readonly<Record<string, RouteMethod>> = {
  "io.micronaut.http.annotation.Get": "GET",
  "io.micronaut.http.annotation.Post": "POST",
  "io.micronaut.http.annotation.Put": "PUT",
  "io.micronaut.http.annotation.Patch": "PATCH",
  "io.micronaut.http.annotation.Delete": "DELETE",
  "io.micronaut.http.annotation.Head": "HEAD",
  "io.micronaut.http.annotation.Options": "OPTIONS",
  "io.micronaut.http.annotation.Trace": "TRACE"
};

const JAKARTA_REST_METHOD_MAPPING_PATHS: Readonly<Record<string, RouteMethod>> = {
  "jakarta.ws.rs.GET": "GET",
  "jakarta.ws.rs.POST": "POST",
  "jakarta.ws.rs.PUT": "PUT",
  "jakarta.ws.rs.PATCH": "PATCH",
  "jakarta.ws.rs.DELETE": "DELETE",
  "jakarta.ws.rs.HEAD": "HEAD",
  "jakarta.ws.rs.OPTIONS": "OPTIONS",
  "javax.ws.rs.GET": "GET",
  "javax.ws.rs.POST": "POST",
  "javax.ws.rs.PUT": "PUT",
  "javax.ws.rs.PATCH": "PATCH",
  "javax.ws.rs.DELETE": "DELETE",
  "javax.ws.rs.HEAD": "HEAD",
  "javax.ws.rs.OPTIONS": "OPTIONS"
};

function directChildren(node: JavaSyntaxNode): readonly JavaSyntaxNode[] {
  const children: JavaSyntaxNode[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function nodeText(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): string {
  return input.sourceText.slice(node.from, node.to);
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

function rangeFor(lineStarts: readonly number[], from: number, to: number): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function astGrepChildren(node: SgNode): readonly SgNode[] {
  return node.children();
}

function astGrepHasError(node: SgNode): boolean {
  return node.kind() === "ERROR" || astGrepChildren(node).some((child) => astGrepHasError(child));
}

function astGrepContainsKind(node: SgNode, kind: string): boolean {
  return node.kind() === kind || astGrepChildren(node).some((child) => astGrepContainsKind(child, kind));
}

function astGrepContainsLogicalOperator(node: SgNode): boolean {
  return (
    node.kind() === "&&" ||
    node.kind() === "||" ||
    astGrepChildren(node).some((child) => astGrepContainsLogicalOperator(child))
  );
}

type StaticJavaLogicalGroupingStep = "left" | "right" | "parenthesized";

interface StaticJavaNormalizedAndOperand {
  readonly node: SgNode;
  readonly groupingPath: readonly StaticJavaLogicalGroupingStep[];
}

interface StaticJavaNormalizedAndExpression {
  readonly operands: readonly StaticJavaNormalizedAndOperand[];
  readonly groupingNodes: readonly SgNode[];
  readonly andOperatorCount: number;
}

function normalizeJavaAndExpression(
  node: SgNode,
  groupingPath: readonly StaticJavaLogicalGroupingStep[] = []
): StaticJavaNormalizedAndExpression | null {
  if (node.kind() === "parenthesized_expression") {
    const children = astGrepChildren(node);
    const expression = children[1];
    if (
      children.length !== 3 ||
      children[0]?.kind() !== "(" ||
      expression === undefined ||
      children[2]?.kind() !== ")"
    ) {
      return null;
    }
    const nested = normalizeJavaAndExpression(expression, [...groupingPath, "parenthesized"]);
    if (nested === null) {
      return null;
    }
    return {
      ...nested,
      groupingNodes:
        nested.andOperatorCount > 0 ? [node, ...nested.groupingNodes] : nested.groupingNodes
    };
  }
  if (node.kind() !== "binary_expression") {
    return astGrepContainsLogicalOperator(node)
      ? null
      : { operands: [{ node, groupingPath }], groupingNodes: [], andOperatorCount: 0 };
  }
  const children = astGrepChildren(node);
  const left = children[0];
  const operator = children[1];
  const right = children[2];
  if (children.length !== 3 || left === undefined || right === undefined) {
    return null;
  }
  if (operator?.kind() !== "&&") {
    return astGrepContainsLogicalOperator(node)
      ? null
      : { operands: [{ node, groupingPath }], groupingNodes: [], andOperatorCount: 0 };
  }
  const normalizedLeft = normalizeJavaAndExpression(left, [...groupingPath, "left"]);
  const normalizedRight = normalizeJavaAndExpression(right, [...groupingPath, "right"]);
  if (normalizedLeft === null || normalizedRight === null) {
    return null;
  }
  return {
    operands: [...normalizedLeft.operands, ...normalizedRight.operands],
    groupingNodes: [...normalizedLeft.groupingNodes, ...normalizedRight.groupingNodes],
    andOperatorCount:
      normalizedLeft.andOperatorCount + normalizedRight.andOperatorCount + 1
  };
}

function unwrapJavaParenthesizedExpression(
  node: SgNode
): { readonly expression: SgNode; readonly groupingNodes: readonly SgNode[] } | null {
  const groupingNodes: SgNode[] = [];
  let expression = node;
  while (expression.kind() === "parenthesized_expression") {
    if (groupingNodes.length >= JAVA_NEGATED_PATTERN_MAXIMUM_GROUPING_DEPTH) {
      return null;
    }
    const children = astGrepChildren(expression);
    const nested = children[1];
    if (
      children.length !== 3 ||
      children[0]?.kind() !== "(" ||
      nested === undefined ||
      children[2]?.kind() !== ")"
    ) {
      return null;
    }
    groupingNodes.push(expression);
    expression = nested;
  }
  return { expression, groupingNodes };
}

interface StaticJavaUnlabeledLoopTarget {
  readonly kind: StaticJavaLoopTargetKind;
  readonly node: SgNode;
}

interface StaticJavaLabeledAbruptTarget {
  readonly kind: StaticJavaLabeledTargetKind;
  readonly node: SgNode;
  readonly body: SgNode;
  readonly label: string;
  readonly labelNode: SgNode;
}

interface StaticJavaSwitchBreakTarget {
  readonly kind: "switch";
  readonly node: SgNode;
  readonly body: SgNode;
  readonly caseGroup: SgNode;
  readonly caseLabels: readonly SgNode[];
  readonly followingScopeEnd: number;
}

interface StaticJavaSwitchYieldTarget {
  readonly kind: "switch-expression";
  readonly node: SgNode;
  readonly body: SgNode;
  readonly rule: SgNode;
  readonly ruleBody: SgNode;
  readonly ruleLabel: SgNode;
  readonly expressionContext: "return" | "initializer" | "assignment" | "yield";
  readonly followingScopeEnd: number;
}

const JAVA_NEGATED_PATTERN_MAXIMUM_FINALLY_STATEMENTS = 8;

interface StaticJavaTransparentFinallyWrapper {
  readonly node: SgNode;
  readonly tryBody: SgNode;
  readonly abruptStatement: SgNode;
  readonly finallyClause: SgNode;
  readonly finallyBody: SgNode;
  readonly finallyStatements: readonly SgNode[];
}

function javaTransparentFinallyWrapper(
  node: SgNode
): StaticJavaTransparentFinallyWrapper | null {
  if (node.kind() !== "try_statement") {
    return null;
  }
  const children = astGrepChildren(node);
  const tryBody = children[1];
  const finallyClause = children[2];
  if (
    children.length !== 3 ||
    children[0]?.kind() !== "try" ||
    tryBody?.kind() !== "block" ||
    finallyClause?.kind() !== "finally_clause"
  ) {
    return null;
  }
  const tryStatements = astGrepChildren(tryBody).filter(
    (child) => child.kind() !== "{" && child.kind() !== "}"
  );
  const abruptStatement = tryStatements[0];
  if (
    tryStatements.length !== 1 ||
    abruptStatement === undefined ||
    (abruptStatement.kind() !== "return_statement" &&
      abruptStatement.kind() !== "throw_statement" &&
      abruptStatement.kind() !== "break_statement" &&
      abruptStatement.kind() !== "continue_statement" &&
      abruptStatement.kind() !== "yield_statement")
  ) {
    return null;
  }
  const finallyChildren = astGrepChildren(finallyClause);
  const finallyBody = finallyChildren[1];
  if (
    finallyChildren.length !== 2 ||
    finallyChildren[0]?.kind() !== "finally" ||
    finallyBody?.kind() !== "block"
  ) {
    return null;
  }
  const finallyStatements = astGrepChildren(finallyBody).filter(
    (child) => child.kind() !== "{" && child.kind() !== "}"
  );
  if (
    finallyStatements.length > JAVA_NEGATED_PATTERN_MAXIMUM_FINALLY_STATEMENTS ||
    finallyStatements.some(
      (statement) =>
        (statement.kind() !== "expression_statement" &&
          statement.kind() !== "local_variable_declaration" &&
          statement.kind() !== "empty_statement") ||
        astGrepContainsKind(statement, "return_statement") ||
        astGrepContainsKind(statement, "throw_statement") ||
        astGrepContainsKind(statement, "break_statement") ||
        astGrepContainsKind(statement, "continue_statement") ||
        astGrepContainsKind(statement, "yield_statement")
    )
  ) {
    return null;
  }
  return {
    node,
    tryBody,
    abruptStatement,
    finallyClause,
    finallyBody,
    finallyStatements
  };
}

function javaLoopTargetKind(node: SgNode): StaticJavaLoopTargetKind | null {
  const kind = node.kind();
  return kind === "while_statement"
    ? "while"
    : kind === "do_statement"
      ? "do"
      : kind === "for_statement"
        ? "for"
        : kind === "enhanced_for_statement"
          ? "enhanced-for"
          : null;
}

function javaLabeledTargetKind(node: SgNode): StaticJavaLabeledTargetKind {
  return javaLoopTargetKind(node) ?? (node.kind() === "block" ? "block" : "statement");
}

function javaUnlabeledLoopTarget(input: {
  readonly statement: SgNode;
  readonly abruptCompletionKind: "break" | "continue";
  readonly enclosingBlock: SgNode;
}): StaticJavaUnlabeledLoopTarget | null {
  const children = astGrepChildren(input.statement);
  if (
    children.length !== 2 ||
    children[0]?.kind() !== input.abruptCompletionKind ||
    children[1]?.kind() !== ";"
  ) {
    return null;
  }
  let ancestor = input.statement.parent();
  while (ancestor !== null) {
    const kind = ancestor.kind();
    if (input.abruptCompletionKind === "break" && kind === "switch_expression") {
      return null;
    }
    const targetKind = javaLoopTargetKind(ancestor);
    if (targetKind !== null) {
      const targetOffsets = ancestor.range();
      const blockOffsets = input.enclosingBlock.range();
      if (
        targetOffsets.start.index >= blockOffsets.start.index ||
        blockOffsets.end.index > targetOffsets.end.index
      ) {
        return null;
      }
      return { kind: targetKind, node: ancestor };
    }
    if (
      kind === "method_declaration" ||
      kind === "constructor_declaration" ||
      kind === "lambda_expression" ||
      kind === "class_declaration" ||
      kind === "interface_declaration"
    ) {
      return null;
    }
    ancestor = ancestor.parent();
  }
  return null;
}

function javaUnlabeledSwitchBreakTarget(input: {
  readonly statement: SgNode;
  readonly guardStatement: SgNode;
  readonly enclosingBlock: SgNode;
}): StaticJavaSwitchBreakTarget | null {
  const children = astGrepChildren(input.statement);
  if (children.length !== 2 || children[0]?.kind() !== "break" || children[1]?.kind() !== ";") {
    return null;
  }
  let caseGroup: SgNode | null = null;
  let ancestor = input.statement.parent();
  while (ancestor !== null) {
    const kind = ancestor.kind();
    if (javaLoopTargetKind(ancestor) !== null) {
      return null;
    }
    if (kind === "switch_block_statement_group" && caseGroup === null) {
      caseGroup = ancestor;
    }
    if (kind === "switch_expression") {
      const switchBody = astGrepChildren(ancestor).filter(
        (child) => child.kind() === "switch_block"
      );
      if (
        caseGroup === null ||
        switchBody.length !== 1 ||
        switchBody[0] === undefined ||
        caseGroup.parent()?.range().start.index !== switchBody[0].range().start.index ||
        caseGroup.parent()?.range().end.index !== switchBody[0].range().end.index
      ) {
        return null;
      }
      const groupChildren = astGrepChildren(caseGroup);
      if (
        groupChildren[0]?.kind() !== "switch_label" ||
        groupChildren[1]?.kind() !== ":"
      ) {
        return null;
      }
      const bodyGroups = astGrepChildren(switchBody[0]).filter(
        (child) => child.kind() === "switch_block_statement_group"
      );
      const caseGroupOffsets = caseGroup.range();
      const caseGroupIndex = bodyGroups.findIndex((candidate) => {
        const offsets = candidate.range();
        return (
          offsets.start.index === caseGroupOffsets.start.index &&
          offsets.end.index === caseGroupOffsets.end.index
        );
      });
      if (caseGroupIndex < 0) {
        return null;
      }
      const caseLabels: SgNode[] = [groupChildren[0]];
      for (let index = caseGroupIndex - 1; index >= 0; index -= 1) {
        const precedingChildren = astGrepChildren(bodyGroups[index]!);
        if (
          precedingChildren.length !== 2 ||
          precedingChildren[0]?.kind() !== "switch_label" ||
          precedingChildren[1]?.kind() !== ":"
        ) {
          break;
        }
        caseLabels.unshift(precedingChildren[0]);
      }
      const guardParent = input.guardStatement.parent();
      const groupOffsets = caseGroup.range();
      const blockOffsets = input.enclosingBlock.range();
      const blockIsInsideGroup =
        groupOffsets.start.index <= blockOffsets.start.index &&
        blockOffsets.end.index <= groupOffsets.end.index;
      const guardIsDirectlyInGroup =
        guardParent?.range().start.index === groupOffsets.start.index &&
        guardParent.range().end.index === groupOffsets.end.index;
      if (!blockIsInsideGroup && !guardIsDirectlyInGroup) {
        return null;
      }
      return {
        kind: "switch",
        node: ancestor,
        body: switchBody[0],
        caseGroup,
        caseLabels,
        followingScopeEnd: blockIsInsideGroup ? blockOffsets.end.index : groupOffsets.end.index
      };
    }
    if (
      kind === "method_declaration" ||
      kind === "constructor_declaration" ||
      kind === "lambda_expression" ||
      kind === "class_declaration" ||
      kind === "interface_declaration"
    ) {
      return null;
    }
    ancestor = ancestor.parent();
  }
  return null;
}

function javaSwitchExpressionContext(
  switchExpression: SgNode
): StaticJavaSwitchYieldTarget["expressionContext"] | null {
  let expression = switchExpression;
  let parent = expression.parent();
  while (parent?.kind() === "parenthesized_expression") {
    const children = astGrepChildren(parent);
    const expressionOffsets = expression.range();
    const nestedOffsets = children[1]?.range();
    if (
      children.length !== 3 ||
      children[0]?.kind() !== "(" ||
      nestedOffsets?.start.index !== expressionOffsets.start.index ||
      nestedOffsets.end.index !== expressionOffsets.end.index ||
      children[2]?.kind() !== ")"
    ) {
      return null;
    }
    expression = parent;
    parent = expression.parent();
  }
  if (parent === null) {
    return null;
  }
  const parentChildren = astGrepChildren(parent);
  const expressionOffsets = expression.range();
  const isExpressionChild = (child: SgNode | undefined): boolean => {
    const offsets = child?.range();
    return (
      offsets?.start.index === expressionOffsets.start.index &&
      offsets.end.index === expressionOffsets.end.index
    );
  };
  if (
    parent.kind() === "return_statement" &&
    parentChildren.length === 3 &&
    parentChildren[0]?.kind() === "return" &&
    isExpressionChild(parentChildren[1]) &&
    parentChildren[2]?.kind() === ";"
  ) {
    return "return";
  }
  if (
    parent.kind() === "yield_statement" &&
    parentChildren.length === 3 &&
    parentChildren[0]?.kind() === "yield" &&
    isExpressionChild(parentChildren[1]) &&
    parentChildren[2]?.kind() === ";"
  ) {
    return "yield";
  }
  if (
    parent.kind() === "variable_declarator" &&
    parentChildren.length === 3 &&
    parentChildren[1]?.kind() === "=" &&
    isExpressionChild(parentChildren[2])
  ) {
    return "initializer";
  }
  if (
    parent.kind() === "assignment_expression" &&
    parentChildren.length === 3 &&
    parentChildren[1]?.kind() === "=" &&
    isExpressionChild(parentChildren[2])
  ) {
    return "assignment";
  }
  return null;
}

function javaSwitchYieldTarget(input: {
  readonly statement: SgNode;
  readonly guardStatement: SgNode;
  readonly enclosingBlock: SgNode;
}): StaticJavaSwitchYieldTarget | null {
  const children = astGrepChildren(input.statement);
  if (
    children.length !== 3 ||
    children[0]?.kind() !== "yield" ||
    children[1] === undefined ||
    children[2]?.kind() !== ";"
  ) {
    return null;
  }
  let rule: SgNode | null = null;
  let ancestor = input.statement.parent();
  while (ancestor !== null) {
    const kind = ancestor.kind();
    if (kind === "switch_rule" && rule === null) {
      rule = ancestor;
    }
    if (kind === "switch_expression") {
      const expressionContext = javaSwitchExpressionContext(ancestor);
      const switchBodies = astGrepChildren(ancestor).filter(
        (child) => child.kind() === "switch_block"
      );
      if (
        expressionContext === null ||
        rule === null ||
        switchBodies.length !== 1 ||
        switchBodies[0] === undefined
      ) {
        return null;
      }
      const switchBodyOffsets = switchBodies[0].range();
      const ruleParentOffsets = rule.parent()?.range();
      const ruleChildren = astGrepChildren(rule);
      const ruleLabel = ruleChildren[0];
      const ruleBody = ruleChildren[2];
      if (
        ruleParentOffsets?.start.index !== switchBodyOffsets.start.index ||
        ruleParentOffsets.end.index !== switchBodyOffsets.end.index ||
        ruleChildren.length !== 3 ||
        ruleLabel?.kind() !== "switch_label" ||
        ruleChildren[1]?.kind() !== "->" ||
        ruleBody?.kind() !== "block"
      ) {
        return null;
      }
      const ruleBodyOffsets = ruleBody.range();
      const blockOffsets = input.enclosingBlock.range();
      const guardParentOffsets = input.guardStatement.parent()?.range();
      if (
        ruleBodyOffsets.start.index > blockOffsets.start.index ||
        blockOffsets.end.index > ruleBodyOffsets.end.index ||
        guardParentOffsets?.start.index !== blockOffsets.start.index ||
        guardParentOffsets.end.index !== blockOffsets.end.index
      ) {
        return null;
      }
      return {
        kind: "switch-expression",
        node: ancestor,
        body: switchBodies[0],
        rule,
        ruleBody,
        ruleLabel,
        expressionContext,
        followingScopeEnd: blockOffsets.end.index
      };
    }
    if (
      kind === "method_declaration" ||
      kind === "constructor_declaration" ||
      kind === "lambda_expression" ||
      kind === "class_declaration" ||
      kind === "interface_declaration"
    ) {
      return null;
    }
    ancestor = ancestor.parent();
  }
  return null;
}

function javaLabeledAbruptTarget(input: {
  readonly statement: SgNode;
  readonly abruptCompletionKind: "break" | "continue";
  readonly enclosingBlock: SgNode;
}): StaticJavaLabeledAbruptTarget | null {
  const children = astGrepChildren(input.statement);
  const labelNode = children[1];
  const label = labelNode?.text();
  if (
    children.length !== 3 ||
    children[0]?.kind() !== input.abruptCompletionKind ||
    labelNode?.kind() !== "identifier" ||
    children[2]?.kind() !== ";" ||
    label === undefined ||
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(label)
  ) {
    return null;
  }
  const matches: StaticJavaLabeledAbruptTarget[] = [];
  let ancestor = input.statement.parent();
  while (ancestor !== null) {
    const kind = ancestor.kind();
    if (
      kind === "method_declaration" ||
      kind === "constructor_declaration" ||
      kind === "lambda_expression" ||
      kind === "class_declaration" ||
      kind === "interface_declaration"
    ) {
      break;
    }
    if (kind === "labeled_statement") {
      const targetChildren = astGrepChildren(ancestor);
      const targetLabelNode = targetChildren[0];
      const targetBody = targetChildren[2];
      if (
        targetChildren.length === 3 &&
        targetLabelNode?.kind() === "identifier" &&
        targetChildren[1]?.kind() === ":" &&
        targetBody !== undefined &&
        targetLabelNode.text() === label
      ) {
        const loopKind = javaLoopTargetKind(targetBody);
        if (input.abruptCompletionKind === "continue" && loopKind === null) {
          return null;
        }
        const targetBodyOffsets = targetBody.range();
        const blockOffsets = input.enclosingBlock.range();
        if (
          targetBodyOffsets.start.index > blockOffsets.start.index ||
          blockOffsets.end.index > targetBodyOffsets.end.index
        ) {
          return null;
        }
        matches.push({
          kind: loopKind ?? javaLabeledTargetKind(targetBody),
          node: ancestor,
          body: targetBody,
          label,
          labelNode: targetLabelNode
        });
      }
    }
    ancestor = ancestor.parent();
  }
  return matches.length === 1 ? matches[0]! : null;
}

function javaNegatedEarlyExitPatternSyntax(input: {
  readonly extraction: JavaExtractFileFactsInput;
  readonly statement: SgNode;
  readonly enclosingBlock: SgNode;
  readonly lineStarts: readonly number[];
}): Extract<StaticJavaInstanceofAndPatternSyntax, { readonly kind: "negated-early-exit" }> | null {
  const statementChildren = astGrepChildren(input.statement);
  const condition = statementChildren[1];
  const exitBody = statementChildren[2];
  if (
    statementChildren.length !== 3 ||
    statementChildren[0]?.kind() !== "if" ||
    condition?.kind() !== "parenthesized_expression" ||
    exitBody === undefined ||
    astGrepContainsKind(condition, "assignment_expression")
  ) {
    return null;
  }
  const conditionChildren = astGrepChildren(condition);
  const unary = conditionChildren[1];
  const unaryChildren = unary === undefined ? [] : astGrepChildren(unary);
  const groupedPattern =
    unaryChildren[1] === undefined ? null : unwrapJavaParenthesizedExpression(unaryChildren[1]);
  const pattern = groupedPattern?.expression;
  const patternChildren = pattern === undefined ? [] : astGrepChildren(pattern);
  const testedValue = patternChildren[0];
  const typeNode = patternChildren[2];
  const definition = patternChildren[3];
  const name = definition?.text();
  const typePath = typeNode?.text();
  if (
    conditionChildren.length !== 3 ||
    conditionChildren[0]?.kind() !== "(" ||
    conditionChildren[2]?.kind() !== ")" ||
    unary?.kind() !== "unary_expression" ||
    unaryChildren.length !== 2 ||
    unaryChildren[0]?.kind() !== "!" ||
    groupedPattern === null ||
    groupedPattern.groupingNodes.length < 1 ||
    pattern?.kind() !== "instanceof_expression" ||
    patternChildren.length !== 4 ||
    testedValue === undefined ||
    patternChildren[1]?.kind() !== "instanceof" ||
    typeNode === undefined ||
    (typeNode.kind() !== "type_identifier" && typeNode.kind() !== "scoped_type_identifier") ||
    definition?.kind() !== "identifier" ||
    name === undefined ||
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) ||
    typePath === undefined ||
    !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u.test(typePath)
  ) {
    return null;
  }
  const exitBodyChildren = exitBody.kind() === "block" ? astGrepChildren(exitBody) : [];
  const blockStatements = exitBodyChildren.filter(
    (child) => child.kind() !== "{" && child.kind() !== "}"
  );
  const abruptCandidate = exitBody.kind() === "block" ? blockStatements.at(-1) : exitBody;
  const abruptWrapper =
    abruptCandidate === undefined ? null : javaTransparentFinallyWrapper(abruptCandidate);
  const abruptStatement = abruptWrapper?.abruptStatement ?? abruptCandidate;
  const abruptCompletionKind =
    abruptStatement?.kind() === "return_statement"
      ? "return"
      : abruptStatement?.kind() === "throw_statement"
        ? "throw"
        : abruptStatement?.kind() === "break_statement"
          ? "break"
        : abruptStatement?.kind() === "continue_statement"
            ? "continue"
            : abruptStatement?.kind() === "yield_statement"
              ? "yield"
        : null;
  if (abruptStatement === undefined || abruptCompletionKind === null) {
    return null;
  }
  const unlabeledAbruptTarget =
    abruptCompletionKind === "break" || abruptCompletionKind === "continue"
      ? javaUnlabeledLoopTarget({
          statement: abruptStatement,
          abruptCompletionKind,
          enclosingBlock: input.enclosingBlock
        })
      : null;
  const switchBreakTarget =
    abruptCompletionKind === "break" && unlabeledAbruptTarget === null
      ? javaUnlabeledSwitchBreakTarget({
          statement: abruptStatement,
          guardStatement: input.statement,
          enclosingBlock: input.enclosingBlock
        })
      : null;
  const switchYieldTarget =
    abruptCompletionKind === "yield"
      ? javaSwitchYieldTarget({
          statement: abruptStatement,
          guardStatement: input.statement,
          enclosingBlock: input.enclosingBlock
        })
      : null;
  const labeledAbruptTarget =
    (abruptCompletionKind === "break" || abruptCompletionKind === "continue") &&
    unlabeledAbruptTarget === null &&
    switchBreakTarget === null
      ? javaLabeledAbruptTarget({
          statement: abruptStatement,
          abruptCompletionKind,
          enclosingBlock: input.enclosingBlock
        })
      : null;
  const abruptTarget =
    unlabeledAbruptTarget ?? switchBreakTarget ?? switchYieldTarget ?? labeledAbruptTarget;
  if (
    (abruptCompletionKind === "break" ||
      abruptCompletionKind === "continue" ||
      abruptCompletionKind === "yield") &&
    abruptTarget === null
  ) {
    return null;
  }
  const conditionOffsets = condition.range();
  const statementOffsets = input.statement.range();
  const enclosingBlockOffsets = input.enclosingBlock.range();
  const testedValueOffsets = testedValue.range();
  const typeOffsets = typeNode.range();
  const definitionOffsets = definition.range();
  const patternOffsets = pattern.range();
  const exitBodyOffsets = exitBody.range();
  const abruptOffsets = abruptStatement.range();
  const abruptWrapperOffsets = abruptWrapper?.node.range();
  const abruptWrapperTryBodyOffsets = abruptWrapper?.tryBody.range();
  const abruptWrapperFinallyOffsets = abruptWrapper?.finallyClause.range();
  const abruptWrapperFinallyBodyOffsets = abruptWrapper?.finallyBody.range();
  const abruptTargetOffsets = abruptTarget?.node.range();
  const abruptTargetBodyOffsets =
    switchYieldTarget?.body.range() ??
    switchBreakTarget?.body.range() ??
    labeledAbruptTarget?.body.range() ??
    unlabeledAbruptTarget?.node.range();
  const abruptTargetCaseGroupOffsets = switchBreakTarget?.caseGroup.range();
  const abruptTargetRuleOffsets = switchYieldTarget?.rule.range();
  const abruptTargetRuleBodyOffsets = switchYieldTarget?.ruleBody.range();
  const abruptTargetRuleLabelOffsets = switchYieldTarget?.ruleLabel.range();
  const abruptTargetLabelOffsets = labeledAbruptTarget?.labelNode.range();
  return {
    kind: "negated-early-exit",
    name,
    typePath,
    typeRange: rangeFor(input.lineStarts, typeOffsets.start.index, typeOffsets.end.index),
    declarationRange: rangeFor(
      input.lineStarts,
      definitionOffsets.start.index,
      definitionOffsets.end.index
    ),
    conditionRange: rangeFor(
      input.lineStarts,
      conditionOffsets.start.index,
      conditionOffsets.end.index
    ),
    testedValueRange: rangeFor(
      input.lineStarts,
      testedValueOffsets.start.index,
      testedValueOffsets.end.index
    ),
    negatedPatternRange: rangeFor(
      input.lineStarts,
      patternOffsets.start.index,
      patternOffsets.end.index
    ),
    negationGroupingRanges: groupedPattern.groupingNodes.map((grouping) => {
      const offsets = grouping.range();
      return rangeFor(input.lineStarts, offsets.start.index, offsets.end.index);
    }),
    maximumGroupingDepth: JAVA_NEGATED_PATTERN_MAXIMUM_GROUPING_DEPTH,
    guardStatementRange: rangeFor(
      input.lineStarts,
      statementOffsets.start.index,
      statementOffsets.end.index
    ),
    exitBodyKind: exitBody.kind() === "block" ? "block" : "statement",
    exitBodyRange: rangeFor(
      input.lineStarts,
      exitBodyOffsets.start.index,
      exitBodyOffsets.end.index
    ),
    abruptCompletionKind,
    abruptStatementRange: rangeFor(
      input.lineStarts,
      abruptOffsets.start.index,
      abruptOffsets.end.index
    ),
    abruptWrapperKind: abruptWrapper === null ? null : "try-finally",
    abruptWrapperRange:
      abruptWrapperOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptWrapperOffsets.start.index,
            abruptWrapperOffsets.end.index
          ),
    abruptWrapperTryBodyRange:
      abruptWrapperTryBodyOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptWrapperTryBodyOffsets.start.index,
            abruptWrapperTryBodyOffsets.end.index
          ),
    abruptWrapperFinallyRange:
      abruptWrapperFinallyOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptWrapperFinallyOffsets.start.index,
            abruptWrapperFinallyOffsets.end.index
          ),
    abruptWrapperFinallyBodyRange:
      abruptWrapperFinallyBodyOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptWrapperFinallyBodyOffsets.start.index,
            abruptWrapperFinallyBodyOffsets.end.index
          ),
    abruptWrapperFinallyStatementRanges:
      abruptWrapper?.finallyStatements.map((statement) => {
        const offsets = statement.range();
        return rangeFor(input.lineStarts, offsets.start.index, offsets.end.index);
      }) ?? [],
    abruptWrapperMaximumFinallyStatements: JAVA_NEGATED_PATTERN_MAXIMUM_FINALLY_STATEMENTS,
    abruptTargetKind: abruptTarget?.kind ?? null,
    abruptTargetRange:
      abruptTargetOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetOffsets.start.index,
            abruptTargetOffsets.end.index
          ),
    abruptTargetBodyRange:
      abruptTargetBodyOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetBodyOffsets.start.index,
            abruptTargetBodyOffsets.end.index
          ),
    abruptTargetCaseGroupRange:
      abruptTargetCaseGroupOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetCaseGroupOffsets.start.index,
            abruptTargetCaseGroupOffsets.end.index
          ),
    abruptTargetCaseLabelRanges:
      switchBreakTarget?.caseLabels.map((label) => {
        const offsets = label.range();
        return rangeFor(input.lineStarts, offsets.start.index, offsets.end.index);
      }) ?? [],
    abruptTargetRuleRange:
      abruptTargetRuleOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetRuleOffsets.start.index,
            abruptTargetRuleOffsets.end.index
          ),
    abruptTargetRuleBodyRange:
      abruptTargetRuleBodyOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetRuleBodyOffsets.start.index,
            abruptTargetRuleBodyOffsets.end.index
          ),
    abruptTargetRuleLabelRange:
      abruptTargetRuleLabelOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetRuleLabelOffsets.start.index,
            abruptTargetRuleLabelOffsets.end.index
          ),
    abruptTargetExpressionContext: switchYieldTarget?.expressionContext ?? null,
    abruptTargetLabel: labeledAbruptTarget?.label ?? null,
    abruptTargetLabelRange:
      abruptTargetLabelOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetLabelOffsets.start.index,
            abruptTargetLabelOffsets.end.index
          ),
    followingScopeRange: rangeFor(
      input.lineStarts,
      statementOffsets.end.index,
      switchYieldTarget?.followingScopeEnd ??
        switchBreakTarget?.followingScopeEnd ??
        enclosingBlockOffsets.end.index
    ),
    followingScopeOffsets: {
      start: statementOffsets.end.index,
      end:
        switchYieldTarget?.followingScopeEnd ??
        switchBreakTarget?.followingScopeEnd ??
        enclosingBlockOffsets.end.index
    }
  };
}

function javaNegatedElsePatternSyntax(input: {
  readonly extraction: JavaExtractFileFactsInput;
  readonly statement: SgNode;
  readonly enclosingBlock: SgNode;
  readonly lineStarts: readonly number[];
}): Extract<StaticJavaInstanceofAndPatternSyntax, { readonly kind: "negated-else" }> | null {
  const statementChildren = astGrepChildren(input.statement);
  const condition = statementChildren[1];
  const thenBody = statementChildren[2];
  const elseBody = statementChildren[4];
  if (
    statementChildren.length !== 5 ||
    statementChildren[0]?.kind() !== "if" ||
    condition?.kind() !== "parenthesized_expression" ||
    thenBody === undefined ||
    statementChildren[3]?.kind() !== "else" ||
    elseBody === undefined ||
    astGrepContainsKind(condition, "assignment_expression")
  ) {
    return null;
  }
  const conditionChildren = astGrepChildren(condition);
  const unary = conditionChildren[1];
  const unaryChildren = unary === undefined ? [] : astGrepChildren(unary);
  const groupedPattern =
    unaryChildren[1] === undefined ? null : unwrapJavaParenthesizedExpression(unaryChildren[1]);
  const pattern = groupedPattern?.expression;
  const patternChildren = pattern === undefined ? [] : astGrepChildren(pattern);
  const testedValue = patternChildren[0];
  const typeNode = patternChildren[2];
  const definition = patternChildren[3];
  const name = definition?.text();
  const typePath = typeNode?.text();
  if (
    conditionChildren.length !== 3 ||
    conditionChildren[0]?.kind() !== "(" ||
    conditionChildren[2]?.kind() !== ")" ||
    unary?.kind() !== "unary_expression" ||
    unaryChildren.length !== 2 ||
    unaryChildren[0]?.kind() !== "!" ||
    groupedPattern === null ||
    groupedPattern.groupingNodes.length < 1 ||
    pattern?.kind() !== "instanceof_expression" ||
    patternChildren.length !== 4 ||
    testedValue === undefined ||
    patternChildren[1]?.kind() !== "instanceof" ||
    typeNode === undefined ||
    (typeNode.kind() !== "type_identifier" && typeNode.kind() !== "scoped_type_identifier") ||
    definition?.kind() !== "identifier" ||
    name === undefined ||
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) ||
    typePath === undefined ||
    !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u.test(typePath)
  ) {
    return null;
  }
  const thenStatements =
    thenBody.kind() === "block"
      ? astGrepChildren(thenBody).filter((child) => child.kind() !== "{" && child.kind() !== "}")
      : [];
  const abruptCandidate = thenBody.kind() === "block" ? thenStatements.at(-1) : thenBody;
  const abruptWrapper =
    abruptCandidate === undefined ? null : javaTransparentFinallyWrapper(abruptCandidate);
  const abruptStatement = abruptWrapper?.abruptStatement ?? abruptCandidate;
  const candidateAbruptCompletionKind =
    abruptStatement?.kind() === "return_statement"
      ? "return"
      : abruptStatement?.kind() === "throw_statement"
        ? "throw"
        : abruptStatement?.kind() === "break_statement"
          ? "break"
        : abruptStatement?.kind() === "continue_statement"
            ? "continue"
            : abruptStatement?.kind() === "yield_statement"
              ? "yield"
            : null;
  const unlabeledAbruptTarget =
    candidateAbruptCompletionKind === "break" || candidateAbruptCompletionKind === "continue"
      ? javaUnlabeledLoopTarget({
          statement: abruptStatement!,
          abruptCompletionKind: candidateAbruptCompletionKind,
          enclosingBlock: input.enclosingBlock
        })
      : null;
  const switchBreakTarget =
    candidateAbruptCompletionKind === "break" && unlabeledAbruptTarget === null
      ? javaUnlabeledSwitchBreakTarget({
          statement: abruptStatement!,
          guardStatement: input.statement,
          enclosingBlock: input.enclosingBlock
        })
      : null;
  const switchYieldTarget =
    candidateAbruptCompletionKind === "yield"
      ? javaSwitchYieldTarget({
          statement: abruptStatement!,
          guardStatement: input.statement,
          enclosingBlock: input.enclosingBlock
        })
      : null;
  const labeledAbruptTarget =
    (candidateAbruptCompletionKind === "break" ||
      candidateAbruptCompletionKind === "continue") &&
    unlabeledAbruptTarget === null &&
    switchBreakTarget === null
      ? javaLabeledAbruptTarget({
          statement: abruptStatement!,
          abruptCompletionKind: candidateAbruptCompletionKind,
          enclosingBlock: input.enclosingBlock
        })
      : null;
  const abruptTarget =
    unlabeledAbruptTarget ?? switchBreakTarget ?? switchYieldTarget ?? labeledAbruptTarget;
  const thenAbruptCompletionKind =
    (candidateAbruptCompletionKind === "break" ||
      candidateAbruptCompletionKind === "continue" ||
      candidateAbruptCompletionKind === "yield") &&
    abruptTarget === null
      ? null
      : candidateAbruptCompletionKind;
  const conditionOffsets = condition.range();
  const statementOffsets = input.statement.range();
  const enclosingBlockOffsets = input.enclosingBlock.range();
  const testedValueOffsets = testedValue.range();
  const typeOffsets = typeNode.range();
  const definitionOffsets = definition.range();
  const patternOffsets = pattern.range();
  const thenBodyOffsets = thenBody.range();
  const elseBodyOffsets = elseBody.range();
  const abruptOffsets = thenAbruptCompletionKind === null ? null : abruptStatement!.range();
  const abruptWrapperOffsets =
    thenAbruptCompletionKind === null ? undefined : abruptWrapper?.node.range();
  const abruptWrapperTryBodyOffsets =
    thenAbruptCompletionKind === null ? undefined : abruptWrapper?.tryBody.range();
  const abruptWrapperFinallyOffsets =
    thenAbruptCompletionKind === null ? undefined : abruptWrapper?.finallyClause.range();
  const abruptWrapperFinallyBodyOffsets =
    thenAbruptCompletionKind === null ? undefined : abruptWrapper?.finallyBody.range();
  const abruptTargetOffsets = abruptTarget?.node.range();
  const abruptTargetBodyOffsets =
    switchYieldTarget?.body.range() ??
    switchBreakTarget?.body.range() ??
    labeledAbruptTarget?.body.range() ??
    unlabeledAbruptTarget?.node.range();
  const abruptTargetCaseGroupOffsets = switchBreakTarget?.caseGroup.range();
  const abruptTargetRuleOffsets = switchYieldTarget?.rule.range();
  const abruptTargetRuleBodyOffsets = switchYieldTarget?.ruleBody.range();
  const abruptTargetRuleLabelOffsets = switchYieldTarget?.ruleLabel.range();
  const abruptTargetLabelOffsets = labeledAbruptTarget?.labelNode.range();
  return {
    kind: "negated-else",
    name,
    typePath,
    typeRange: rangeFor(input.lineStarts, typeOffsets.start.index, typeOffsets.end.index),
    declarationRange: rangeFor(
      input.lineStarts,
      definitionOffsets.start.index,
      definitionOffsets.end.index
    ),
    conditionRange: rangeFor(
      input.lineStarts,
      conditionOffsets.start.index,
      conditionOffsets.end.index
    ),
    testedValueRange: rangeFor(
      input.lineStarts,
      testedValueOffsets.start.index,
      testedValueOffsets.end.index
    ),
    negatedPatternRange: rangeFor(
      input.lineStarts,
      patternOffsets.start.index,
      patternOffsets.end.index
    ),
    negationGroupingRanges: groupedPattern.groupingNodes.map((grouping) => {
      const offsets = grouping.range();
      return rangeFor(input.lineStarts, offsets.start.index, offsets.end.index);
    }),
    maximumGroupingDepth: JAVA_NEGATED_PATTERN_MAXIMUM_GROUPING_DEPTH,
    guardStatementRange: rangeFor(
      input.lineStarts,
      statementOffsets.start.index,
      statementOffsets.end.index
    ),
    thenBodyKind: thenBody.kind() === "block" ? "block" : "statement",
    thenBodyRange: rangeFor(
      input.lineStarts,
      thenBodyOffsets.start.index,
      thenBodyOffsets.end.index
    ),
    thenAbruptCompletionKind,
    thenAbruptStatementRange:
      abruptOffsets === null
        ? null
        : rangeFor(input.lineStarts, abruptOffsets.start.index, abruptOffsets.end.index),
    thenAbruptWrapperKind:
      thenAbruptCompletionKind === null || abruptWrapper === null ? null : "try-finally",
    thenAbruptWrapperRange:
      abruptWrapperOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptWrapperOffsets.start.index,
            abruptWrapperOffsets.end.index
          ),
    thenAbruptWrapperTryBodyRange:
      abruptWrapperTryBodyOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptWrapperTryBodyOffsets.start.index,
            abruptWrapperTryBodyOffsets.end.index
          ),
    thenAbruptWrapperFinallyRange:
      abruptWrapperFinallyOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptWrapperFinallyOffsets.start.index,
            abruptWrapperFinallyOffsets.end.index
          ),
    thenAbruptWrapperFinallyBodyRange:
      abruptWrapperFinallyBodyOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptWrapperFinallyBodyOffsets.start.index,
            abruptWrapperFinallyBodyOffsets.end.index
          ),
    thenAbruptWrapperFinallyStatementRanges:
      thenAbruptCompletionKind === null
        ? []
        : (abruptWrapper?.finallyStatements.map((statement) => {
            const offsets = statement.range();
            return rangeFor(input.lineStarts, offsets.start.index, offsets.end.index);
          }) ?? []),
    thenAbruptWrapperMaximumFinallyStatements:
      JAVA_NEGATED_PATTERN_MAXIMUM_FINALLY_STATEMENTS,
    thenAbruptTargetKind: abruptTarget?.kind ?? null,
    thenAbruptTargetRange:
      abruptTargetOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetOffsets.start.index,
            abruptTargetOffsets.end.index
          ),
    thenAbruptTargetBodyRange:
      abruptTargetBodyOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetBodyOffsets.start.index,
            abruptTargetBodyOffsets.end.index
          ),
    thenAbruptTargetCaseGroupRange:
      abruptTargetCaseGroupOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetCaseGroupOffsets.start.index,
            abruptTargetCaseGroupOffsets.end.index
          ),
    thenAbruptTargetCaseLabelRanges:
      switchBreakTarget?.caseLabels.map((label) => {
        const offsets = label.range();
        return rangeFor(input.lineStarts, offsets.start.index, offsets.end.index);
      }) ?? [],
    thenAbruptTargetRuleRange:
      abruptTargetRuleOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetRuleOffsets.start.index,
            abruptTargetRuleOffsets.end.index
          ),
    thenAbruptTargetRuleBodyRange:
      abruptTargetRuleBodyOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetRuleBodyOffsets.start.index,
            abruptTargetRuleBodyOffsets.end.index
          ),
    thenAbruptTargetRuleLabelRange:
      abruptTargetRuleLabelOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetRuleLabelOffsets.start.index,
            abruptTargetRuleLabelOffsets.end.index
          ),
    thenAbruptTargetExpressionContext: switchYieldTarget?.expressionContext ?? null,
    thenAbruptTargetLabel: labeledAbruptTarget?.label ?? null,
    thenAbruptTargetLabelRange:
      abruptTargetLabelOffsets === undefined
        ? null
        : rangeFor(
            input.lineStarts,
            abruptTargetLabelOffsets.start.index,
            abruptTargetLabelOffsets.end.index
          ),
    elseBodyKind: elseBody.kind() === "block" ? "block" : "statement",
    elseBodyRange: rangeFor(
      input.lineStarts,
      elseBodyOffsets.start.index,
      elseBodyOffsets.end.index
    ),
    elseBodyOffsets: {
      start: elseBodyOffsets.start.index,
      end: elseBodyOffsets.end.index
    },
    followingScopeRange:
      thenAbruptCompletionKind === null
        ? null
        : rangeFor(
            input.lineStarts,
            statementOffsets.end.index,
            switchYieldTarget?.followingScopeEnd ??
              switchBreakTarget?.followingScopeEnd ??
              enclosingBlockOffsets.end.index
          ),
    followingScopeOffsets:
      thenAbruptCompletionKind === null
        ? null
        : {
            start: statementOffsets.end.index,
            end:
              switchYieldTarget?.followingScopeEnd ??
              switchBreakTarget?.followingScopeEnd ??
              enclosingBlockOffsets.end.index
          }
  };
}

function inspectJavaInstanceofAndPatterns(
  input: JavaExtractFileFactsInput
): StaticJavaInstanceofAndPatternInspection {
  if (!input.sourceText.includes("instanceof")) {
    return { syntaxes: [], legacyRecoveryOffsets: [] };
  }
  const root = parseAstGrep("java", input.sourceText).root();
  if (astGrepHasError(root)) {
    return { syntaxes: [], legacyRecoveryOffsets: [] };
  }
  const lineStarts = lineStartsFor(input.sourceText);
  const syntaxes: StaticJavaInstanceofAndPatternSyntax[] = [];
  const legacyRecoveryOffsets: Array<{ readonly start: number; readonly end: number }> = [];

  function retainSwitchExpressionRecovery(node: SgNode): void {
    let ancestor = node.parent();
    while (ancestor !== null) {
      if (ancestor.kind() === "switch_expression") {
        const offsets = ancestor.range();
        legacyRecoveryOffsets.push({
          start: offsets.start.index,
          end: offsets.end.index
        });
      }
      ancestor = ancestor.parent();
    }
  }

  function visit(node: SgNode, enclosingBlock: SgNode | null): void {
    if (node.kind() === "if_statement") {
      if (enclosingBlock !== null) {
        const negatedElse = javaNegatedElsePatternSyntax({
          extraction: input,
          statement: node,
          enclosingBlock,
          lineStarts
        });
        if (negatedElse !== null) {
          const statementOffsets = node.range();
          legacyRecoveryOffsets.push({
            start: statementOffsets.start.index,
            end: statementOffsets.end.index
          });
          if (negatedElse.thenAbruptTargetKind === "switch-expression") {
            retainSwitchExpressionRecovery(node);
          }
          syntaxes.push(negatedElse);
        }
        const earlyExit = javaNegatedEarlyExitPatternSyntax({
          extraction: input,
          statement: node,
          enclosingBlock,
          lineStarts
        });
        if (earlyExit !== null) {
          const statementOffsets = node.range();
          legacyRecoveryOffsets.push({
            start: statementOffsets.start.index,
            end: statementOffsets.end.index
          });
          if (earlyExit.abruptTargetKind === "switch-expression") {
            retainSwitchExpressionRecovery(node);
          }
          syntaxes.push(earlyExit);
        }
      }
      const statementChildren = astGrepChildren(node);
      const condition = statementChildren[1];
      const trueBlock = statementChildren[2];
      if (
        statementChildren[0]?.kind() === "if" &&
        condition?.kind() === "parenthesized_expression" &&
        trueBlock?.kind() === "block"
      ) {
        const conditionChildren = astGrepChildren(condition);
        const binary = conditionChildren[1];
        const normalized =
          binary === undefined ? null : normalizeJavaAndExpression(binary);
        const operands = normalized?.operands;
        const pattern = operands?.[0]?.node;
        const patternChildren = pattern === undefined ? [] : astGrepChildren(pattern);
        const testedValue = patternChildren[0];
        const typeNode = patternChildren[2];
        const definition = patternChildren[3];
        const name = definition?.text();
        const typePath = typeNode?.text();
        if (
          conditionChildren.length === 3 &&
          conditionChildren[0]?.kind() === "(" &&
          conditionChildren[2]?.kind() === ")" &&
          binary?.kind() === "binary_expression" &&
          normalized !== null &&
          normalized.andOperatorCount >= 1 &&
          operands !== undefined &&
          operands.length >= 2 &&
          operands.length <= JAVA_INSTANCEOF_AND_CHAIN_MAXIMUM_OPERANDS &&
          pattern?.kind() === "instanceof_expression" &&
          patternChildren.length === 4 &&
          testedValue !== undefined &&
          patternChildren[1]?.kind() === "instanceof" &&
          typeNode !== undefined &&
          (typeNode.kind() === "type_identifier" || typeNode.kind() === "scoped_type_identifier") &&
          definition?.kind() === "identifier" &&
          name !== undefined &&
          /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) &&
          typePath !== undefined &&
          /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u.test(typePath) &&
          !astGrepContainsKind(binary, "assignment_expression")
        ) {
          const conditionOffsets = condition.range();
          const statementOffsets = node.range();
          const testedValueOffsets = testedValue.range();
          const typeOffsets = typeNode.range();
          const definitionOffsets = definition.range();
          const operandOffsets = operands.map((operand) => operand.node.range());
          const logicalOperandRanges = operandOffsets.map((operand) =>
            rangeFor(lineStarts, operand.start.index, operand.end.index)
          );
          const rightOperandOffsets = operandOffsets[1]!;
          const rightOperandRange = logicalOperandRanges[1]!;
          const logicalOperandGroupingPaths = operands.map((operand) => operand.groupingPath);
          const groupingRanges = normalized.groupingNodes.map((grouping) => {
            const offsets = grouping.range();
            return rangeFor(lineStarts, offsets.start.index, offsets.end.index);
          });
          const trueBlockOffsets = trueBlock.range();
          legacyRecoveryOffsets.push({
            start: statementOffsets.start.index,
            end: statementOffsets.end.index
          });
          syntaxes.push({
            ...(groupingRanges.length > 0
              ? {
                  kind: "grouped-chain" as const,
                  logicalOperandRanges,
                  logicalOperandGroupingPaths,
                  groupingRanges,
                  activeOperandOffsets: operandOffsets.slice(1).map((operand) => ({
                    start: operand.start.index,
                    end: operand.end.index
                  })),
                  operandCount: operands.length,
                  maximumOperands: JAVA_INSTANCEOF_AND_CHAIN_MAXIMUM_OPERANDS
                }
              : operands.length === 2
              ? {
                  kind: "single" as const,
                  rightOperandRange,
                  rightOperandOffsets: {
                    start: rightOperandOffsets.start.index,
                    end: rightOperandOffsets.end.index
                  }
                }
              : {
                  kind: "chain" as const,
                  logicalOperandRanges,
                  activeOperandOffsets: operandOffsets.slice(1).map((operand) => ({
                    start: operand.start.index,
                    end: operand.end.index
                  })),
                  operandCount: operands.length,
                  maximumOperands: JAVA_INSTANCEOF_AND_CHAIN_MAXIMUM_OPERANDS
                }),
            name,
            typePath,
            typeRange: rangeFor(lineStarts, typeOffsets.start.index, typeOffsets.end.index),
            declarationRange: rangeFor(
              lineStarts,
              definitionOffsets.start.index,
              definitionOffsets.end.index
            ),
            conditionRange: rangeFor(
              lineStarts,
              conditionOffsets.start.index,
              conditionOffsets.end.index
            ),
            testedValueRange: rangeFor(
              lineStarts,
              testedValueOffsets.start.index,
              testedValueOffsets.end.index
            ),
            trueBlockRange: rangeFor(
              lineStarts,
              trueBlockOffsets.start.index,
              trueBlockOffsets.end.index
            ),
            trueBlockOffsets: {
              start: trueBlockOffsets.start.index,
              end: trueBlockOffsets.end.index
            }
          });
        }
      }
    }
    const childEnclosingBlock = node.kind() === "block" ? node : enclosingBlock;
    for (const child of astGrepChildren(node)) {
      visit(child, childEnclosingBlock);
    }
  }

  visit(root, null);
  return {
    syntaxes,
    legacyRecoveryOffsets
  };
}

function isLegacyGrammarDefaultModifierMarker(node: JavaSyntaxNode): boolean {
  if (
    !node.type.isError ||
    node.from !== node.to ||
    node.parent?.name !== "Modifiers" ||
    node.parent.parent?.name !== "MethodDeclaration" ||
    node.parent.parent.parent?.name !== "InterfaceBody"
  ) {
    return false;
  }
  const siblings = directChildren(node.parent);
  return (
    siblings.length === 2 &&
    siblings[0]?.name === "default" &&
    siblings[1]?.type.isError === true &&
    siblings[1]?.from === node.from &&
    siblings[1]?.to === node.to &&
    node.prevSibling?.name === "default"
  );
}

function isLegacyGrammarSwitchRuleMarker(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): boolean {
  if (!node.type.isError || node.parent?.name !== "SwitchLabel") {
    return false;
  }
  const siblings = directChildren(node.parent);
  const labelKind = siblings[0]?.name;
  if (labelKind !== "case" && labelKind !== "default") {
    return false;
  }
  if (node.from < node.to) {
    return nodeText(input, node) === "->" &&
      (node.nextSibling?.type.isError === true || node.nextSibling === null);
  }
  return (
    labelKind === "default" &&
    node.prevSibling?.type.isError === true &&
    nodeText(input, node.prevSibling) === "->"
  );
}

function isLegacyGrammarInstanceofPatternMarker(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): boolean {
  if (!node.type.isError || node.parent?.name !== "InstanceofExpression") {
    return false;
  }
  const siblings = directChildren(node.parent);
  return (
    siblings.length === 4 &&
    siblings[1]?.name === "instanceof" &&
    siblings[2] !== undefined &&
    isJavaDirectTypeName(siblings[2]) &&
    siblings[3]?.from === node.from &&
    siblings[3]?.to === node.to &&
    identifierText(input, node) !== null
  );
}

function hasSyntaxError(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode,
  modernRecoveryOffsets: readonly { readonly start: number; readonly end: number }[] = []
): boolean {
  const isModernRecoveredError =
    node.type.isError &&
    modernRecoveryOffsets.some(
      (range) => range.start <= node.from && node.to <= range.end
    );
  return (
    (node.type.isError &&
      !isModernRecoveredError &&
      !isLegacyGrammarClassLiteralMarker(input, node) &&
      !isLegacyGrammarDefaultModifierMarker(node) &&
      !isLegacyGrammarSwitchRuleMarker(input, node) &&
      !isLegacyGrammarInstanceofPatternMarker(input, node)) ||
    directChildren(node).some((child) => hasSyntaxError(input, child, modernRecoveryOffsets))
  );
}

/**
 * @lezer/java 1.1.3 recovers the `class` token in an otherwise valid Java
 * class literal (for example `String.class` or `int[].class`) as an error. It
 * also appends a zero-width error to some otherwise complete qualified member
 * accesses. Accept only those exact, closed legacy-parser shapes; every
 * surrounding or additional syntax error remains fail-closed.
 */
function isLegacyGrammarClassLiteralMarker(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): boolean {
  if (!node.type.isError || node.parent === null) {
    return false;
  }
  const parentText = nodeText(input, node.parent).trim();
  const hasOnlyTrailingWhitespace = input.sourceText.slice(node.to, node.parent.to).trim().length === 0;
  const isClosedQualifiedMember =
    node.from === node.to &&
    hasOnlyTrailingWhitespace &&
    node.parent.name === "MethodReference" &&
    /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/u.test(parentText);
  const isClassLiteral =
    /^(?:(?:byte|short|int|long|float|double|boolean|char|void)|[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)(?:\[\])*\.class$/u.test(
      parentText
    );
  return (
    isClosedQualifiedMember ||
    (isClassLiteral &&
      hasOnlyTrailingWhitespace &&
      ((nodeText(input, node) === "class" &&
        (node.parent.name === "ObjectCreationExpression" || node.parent.name === "ScopedTypeName")) ||
        (node.from === node.to && node.parent.name === "MethodReference")))
  );
}

function identifierText(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): string | null {
  const value = nodeText(input, node);
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value) ? value : null;
}

function staticDottedIdentifier(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): string | null {
  const value = nodeText(input, node);
  return /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u.test(value)
    ? value
    : null;
}

function staticPlainJavaString(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): string | null {
  if (node.name !== "StringLiteral") {
    return null;
  }
  const value = nodeText(input, node);
  if (
    value.length < 2 ||
    value[0] !== "\"" ||
    value.at(-1) !== "\"" ||
    value.includes("\\") ||
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  return value.slice(1, -1);
}

/**
 * Accepts the small path surface that has one syntactically direct string:
 * `@GetMapping("/pets")`, `@GetMapping(path = "/pets")`, or a bare mapping.
 * Arrays, concatenation, placeholders, and additional condition attributes are
 * deliberately deferred instead of being guessed from annotation text.
 */
function staticAnnotationPath(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation
): string | null {
  if (annotation.node.name === "MarkerAnnotation") {
    return "";
  }
  if (annotation.node.name !== "Annotation") {
    return null;
  }
  const arguments_ = directChildren(annotation.node).find(
    (child) => child.name === "AnnotationArgumentList"
  );
  if (arguments_ === undefined) {
    return null;
  }
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  if (values.length === 0) {
    return "";
  }
  const value = values[0];
  if (value === undefined || values.length !== 1) {
    return null;
  }
  if (value.name === "StringLiteral") {
    return staticPlainJavaString(input, value);
  }
  if (value.name !== "ElementValuePair") {
    return null;
  }
  const pair = directChildren(value);
  const key = pair[0] === undefined ? null : identifierText(input, pair[0]);
  const literal = pair[2];
  if (
    pair.length !== 3 ||
    pair[1]?.name !== "AssignOp" ||
    (key !== "path" && key !== "value") ||
    literal === undefined
  ) {
    return null;
  }
  return staticPlainJavaString(input, literal);
}

function staticSpringPath(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation
): string | null {
  const path = staticAnnotationPath(input, annotation);
  if (path === null) {
    return null;
  }
  if (path.length === 0) {
    return "";
  }
  return path.startsWith("/") && !path.includes("//") ? path : null;
}

function staticSpringPathsFromValue(
  input: JavaExtractFileFactsInput,
  value: JavaSyntaxNode
): readonly string[] | null {
  const literals =
    value.name === "ElementValueArrayInitializer"
      ? directChildren(value).filter((child) => !["{", "}", ","].includes(child.name))
      : [value];
  if (literals.length === 0) {
    return null;
  }
  const paths = literals.map((literal) => staticPlainJavaString(input, literal));
  if (paths.some((path): path is null => path === null)) {
    return null;
  }
  const exactPaths = paths as readonly string[];
  const canonicalPaths = exactPaths.map((path) => {
    if (path.length === 0) {
      return "";
    }
    return path.startsWith("/") && !path.includes("//") ? joinHttpPaths(path, "") : null;
  });
  if (canonicalPaths.some((path): path is null => path === null)) {
    return null;
  }
  const exactCanonicalPaths = canonicalPaths as readonly string[];
  return new Set(exactCanonicalPaths).size === exactCanonicalPaths.length
    ? exactCanonicalPaths
    : null;
}

/**
 * Accepts one literal class-level Spring path or a non-empty, unique literal
 * array. Request conditions and dynamic values are deliberately excluded so a
 * class prefix never turns a local method route into a plausible false positive.
 */
function staticSpringClassPaths(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation
): readonly string[] | null {
  if (annotation.node.name === "MarkerAnnotation") {
    return [""];
  }
  if (annotation.node.name !== "Annotation") {
    return null;
  }
  const arguments_ = directChildren(annotation.node).find(
    (child) => child.name === "AnnotationArgumentList"
  );
  if (arguments_ === undefined) {
    return null;
  }
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  if (values.length === 0) {
    return [""];
  }
  if (values.length !== 1 || values[0] === undefined) {
    return null;
  }
  const value = values[0];
  if (value.name === "StringLiteral" || value.name === "ElementValueArrayInitializer") {
    return staticSpringPathsFromValue(input, value);
  }
  if (value.name !== "ElementValuePair") {
    return null;
  }
  const pair = directChildren(value);
  const key = pair[0] === undefined ? null : identifierText(input, pair[0]);
  const argument = pair[2];
  if (
    pair.length !== 3 ||
    pair[1]?.name !== "AssignOp" ||
    (key !== "path" && key !== "value") ||
    argument === undefined
  ) {
    return null;
  }
  return staticSpringPathsFromValue(input, argument);
}

function staticSpringRequestMethod(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode,
  imports: ReadonlyMap<string, string>
): RouteMethod | null {
  const match = /^([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\.([A-Z]+)$/u.exec(
    nodeText(input, node)
  );
  const owner = match?.[1];
  const methodName = match?.[2];
  const method = methodName === undefined ? undefined : SPRING_REQUEST_METHODS[methodName];
  if (
    owner === undefined ||
    method === undefined ||
    (owner !== SPRING_REQUEST_METHOD_PATH &&
      (owner !== "RequestMethod" || imports.get(owner) !== SPRING_REQUEST_METHOD_PATH))
  ) {
    return null;
  }
  return method;
}

function staticSpringRequestMethods(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode,
  imports: ReadonlyMap<string, string>
): readonly RouteMethod[] | null {
  const values =
    node.name === "ElementValueArrayInitializer"
      ? directChildren(node).filter((child) => !["{", "}", ","].includes(child.name))
      : [node];
  if (values.length === 0) {
    return null;
  }
  const methods = values.map((value) => staticSpringRequestMethod(input, value, imports));
  if (methods.some((method): method is null => method === null)) {
    return null;
  }
  const exactMethods = methods as readonly RouteMethod[];
  return new Set(exactMethods).size === exactMethods.length ? exactMethods : null;
}

/**
 * Retains direct method-level Spring `@RequestMapping` routes when one or more
 * RequestMethod enum values are provable. Each exact enum produces one route.
 * The optional route path is one positional, `path =`, or `value =` literal;
 * all other request conditions remain deliberately outside this static slice.
 */
function staticSpringRequestMappingRoutes(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation,
  imports: ReadonlyMap<string, string>
): readonly StaticHttpRoute[] | null {
  if (annotation.node.name !== "Annotation") {
    return null;
  }
  const arguments_ = directChildren(annotation.node).find(
    (child) => child.name === "AnnotationArgumentList"
  );
  if (arguments_ === undefined) {
    return null;
  }
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  if (values.length === 0 || values.length > 2) {
    return null;
  }
  let path = "";
  let hasPath = false;
  let methods: readonly RouteMethod[] | null = null;
  for (const value of values) {
    if (value.name === "StringLiteral") {
      if (hasPath) {
        return null;
      }
      const literal = staticPlainJavaString(input, value);
      if (literal === null) {
        return null;
      }
      path = literal;
      hasPath = true;
      continue;
    }
    if (value.name !== "ElementValuePair") {
      return null;
    }
    const pair = directChildren(value);
    const key = pair[0] === undefined ? null : identifierText(input, pair[0]);
    const argument = pair[2];
    if (pair.length !== 3 || pair[1]?.name !== "AssignOp" || argument === undefined) {
      return null;
    }
    if (key === "path" || key === "value") {
      if (hasPath) {
        return null;
      }
      const literal = staticPlainJavaString(input, argument);
      if (literal === null) {
        return null;
      }
      path = literal;
      hasPath = true;
      continue;
    }
    if (key !== "method" || methods !== null) {
      return null;
    }
    methods = staticSpringRequestMethods(input, argument, imports);
    if (methods === null) {
      return null;
    }
  }
  return methods !== null && (path.length === 0 || (path.startsWith("/") && !path.includes("//")))
    ? methods.map((method) => ({
        method,
        path,
        node: annotation.node,
        ruleId: "framework.spring-web.direct-controller.literal-request-mapping.local-method"
      }))
    : null;
}

/**
 * Micronaut maps a marker `@Controller` / HTTP method annotation to `/`.
 * This first slice accepts only that default, a single positional literal, or
 * one literal `value` (plus method-only `uri`) argument. `uris`, media-type
 * arrays, aliases, and dynamic URI construction deliberately remain absent.
 */
function staticMicronautPath(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation,
  allowUriArgument: boolean
): string | null {
  if (annotation.node.name === "MarkerAnnotation") {
    return "/";
  }
  if (annotation.node.name !== "Annotation") {
    return null;
  }
  const arguments_ = directChildren(annotation.node).find(
    (child) => child.name === "AnnotationArgumentList"
  );
  if (arguments_ === undefined) {
    return null;
  }
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  if (values.length === 0) {
    return "/";
  }
  if (values.length !== 1 || values[0] === undefined) {
    return null;
  }
  const value = values[0];
  let path: string | null;
  if (value.name === "StringLiteral") {
    path = staticPlainJavaString(input, value);
  } else if (value.name === "ElementValuePair") {
    const pair = directChildren(value);
    const key = pair[0] === undefined ? null : identifierText(input, pair[0]);
    const literal = pair[2];
    if (
      pair.length !== 3 ||
      pair[1]?.name !== "AssignOp" ||
      (key !== "value" && (!allowUriArgument || key !== "uri")) ||
      literal === undefined
    ) {
      return null;
    }
    path = staticPlainJavaString(input, literal);
  } else {
    return null;
  }
  return path !== null && path.startsWith("/") && !path.includes("//") ? path : null;
}

/**
 * Retains only a literal Spring placeholder value such as
 * `@Value("${server.port}")` or `@Value("${server.port:8080}")`. Named
 * arguments, escaped strings, nested placeholders, SpEL, and key expressions
 * are deferred rather than treated as configuration references.
 */
function staticSpringBootPropertiesKey(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation
): string | null {
  if (annotation.node.name !== "Annotation") {
    return null;
  }
  const arguments_ = directChildren(annotation.node).find(
    (child) => child.name === "AnnotationArgumentList"
  );
  if (arguments_ === undefined) {
    return null;
  }
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  if (values.length !== 1 || values[0] === undefined) {
    return null;
  }
  const literal = staticPlainJavaString(input, values[0]);
  if (literal === null) {
    return null;
  }
  const match = /^\$\{([A-Za-z0-9][A-Za-z0-9._-]*)(?::[^{}]*)?\}$/u.exec(literal);
  const key = match?.[1] ?? null;
  return key !== null && SPRING_BOOT_PROPERTIES_KEY.test(key) ? key : null;
}

/**
 * Retains one direct literal prefix from `@ConfigurationProperties("app")`
 * or `@ConfigurationProperties(prefix = "app")`. `value =`, multiple
 * attributes, escaped strings, and dynamic forms are intentionally deferred.
 */
function staticSpringBootConfigurationPropertiesPrefix(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation
): string | null {
  if (annotation.node.name !== "Annotation") {
    return null;
  }
  const arguments_ = directChildren(annotation.node).find(
    (child) => child.name === "AnnotationArgumentList"
  );
  if (arguments_ === undefined) {
    return null;
  }
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  if (values.length !== 1 || values[0] === undefined) {
    return null;
  }
  const value = values[0];
  let prefix: string | null;
  if (value.name === "StringLiteral") {
    prefix = staticPlainJavaString(input, value);
  } else if (value.name === "ElementValuePair") {
    const pair = directChildren(value);
    const key = pair[0] === undefined ? null : identifierText(input, pair[0]);
    const literal = pair[2];
    if (
      pair.length !== 3 ||
      pair[1]?.name !== "AssignOp" ||
      key !== "prefix" ||
      literal === undefined
    ) {
      return null;
    }
    prefix = staticPlainJavaString(input, literal);
  } else {
    return null;
  }
  return prefix !== null && SPRING_BOOT_PROPERTIES_KEY.test(prefix) ? prefix : null;
}

function staticAnnotation(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): StaticJavaAnnotation | null {
  if (node.name !== "Annotation" && node.name !== "MarkerAnnotation") {
    return null;
  }
  const reference = directChildren(node).find(
    (child) => child.name === "Identifier" || child.name === "ScopedIdentifier"
  );
  const name =
    reference === undefined
      ? null
      : reference.name === "Identifier"
        ? identifierText(input, reference)
        : staticDottedIdentifier(input, reference);
  return name === null || reference === undefined ? null : { name, node, referenceNode: reference };
}

function staticAnnotations(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): readonly StaticJavaAnnotation[] {
  const modifiers = directChildren(node).find((child) => child.name === "Modifiers");
  return modifiers === undefined
    ? []
    : directChildren(modifiers)
        .map((child) => staticAnnotation(input, child))
        .filter((annotation): annotation is StaticJavaAnnotation => annotation !== null);
}

function staticJavaImport(input: JavaExtractFileFactsInput, node: JavaSyntaxNode): string | null {
  if (node.name !== "ImportDeclaration") {
    return null;
  }
  const match = /^import\s+([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*;$/u.exec(
    nodeText(input, node)
  );
  return match?.[1] ?? null;
}

/**
 * Java has no aliases. A simple annotation name is trusted only if it maps to
 * one exact non-static, non-wildcard import; a fully-qualified annotation is
 * independently exact and does not need an import.
 */
function staticJavaImports(
  input: JavaExtractFileFactsInput,
  root: JavaSyntaxNode
): ReadonlyMap<string, string> {
  const pathsByLocalName = new Map<string, Set<string>>();
  for (const declaration of directChildren(root)) {
    const path = staticJavaImport(input, declaration);
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

function staticJavaImportReferences(input: {
  readonly extraction: JavaExtractFileFactsInput;
  readonly root: JavaSyntaxNode;
  readonly sourceId: string;
  readonly imports: ReadonlyMap<string, string>;
  readonly lineStarts: readonly number[];
}): readonly JvmImportReferenceFact[] {
  const references: JvmImportReferenceFact[] = [];
  for (const declaration of directChildren(input.root)) {
    const importedTypePath = staticJavaImport(input.extraction, declaration);
    const referenceNode = directChildren(declaration).find(
      (child) => child.name === "Identifier" || child.name === "ScopedIdentifier"
    );
    const referenceName = importedTypePath?.split(".").at(-1);
    if (
      importedTypePath === null ||
      referenceName === undefined ||
      referenceNode === undefined ||
      input.imports.get(referenceName) !== importedTypePath
    ) {
      continue;
    }
    references.push({
      sourceId: input.sourceId,
      filePath: input.extraction.filePath,
      referenceName,
      importedTypePath,
      range: rangeFor(input.lineStarts, referenceNode.from, referenceNode.to)
    });
  }
  return references;
}

function staticJavaPackage(
  input: JavaExtractFileFactsInput,
  root: JavaSyntaxNode
): string | null {
  const declarations = directChildren(root).filter(
    (node) => node.name === "PackageDeclaration"
  );
  if (declarations.length === 0) {
    return "";
  }
  const declaration = declarations[0];
  if (declarations.length !== 1 || declaration === undefined) {
    return null;
  }
  const packageNameNode = directChildren(declaration).find(
    (node) => node.name === "ScopedIdentifier" || node.name === "Identifier"
  );
  return packageNameNode === undefined
    ? null
    : staticDottedIdentifier(input, packageNameNode);
}

function annotationMatches(
  annotation: StaticJavaAnnotation,
  expectedPath: string,
  imports: ReadonlyMap<string, string>
): boolean {
  return annotation.name === expectedPath || imports.get(annotation.name) === expectedPath;
}

/**
 * React Native Android bridge ownership is retained only for the direct base
 * class spelling or a simple spelling backed by one exact non-wildcard import.
 */
function staticJavaDirectReactNativeModule(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): boolean {
  const header = input.sourceText.slice(declaration.node.from, declaration.body.from);
  if (
    /\bextends\s+com\.facebook\.react\.bridge\.ReactContextBaseJavaModule\b/u.test(header)
  ) {
    return true;
  }
  return (
    imports.get("ReactContextBaseJavaModule") === REACT_NATIVE_CONTEXT_BASE_MODULE_PATH &&
    /\bextends\s+ReactContextBaseJavaModule\b/u.test(header)
  );
}

/**
 * Recognizes the documented Codegen implementation shape only when the direct
 * superclass is a concrete Spec type whose simple spelling has one exact import
 * or whose fully-qualified spelling appears in the source header.
 */
function staticJavaCodegenReactNativeModule(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): boolean {
  const header = input.sourceText.slice(declaration.node.from, declaration.body.from);
  const match =
    /\bextends\s+((?:[A-Za-z_$][A-Za-z0-9_$]*\.)*([A-Za-z_$][A-Za-z0-9_$]*Spec))\b/u.exec(
      header
    );
  if (match?.[1] === undefined || match[2] === undefined) {
    return false;
  }
  return match[1].includes(".") || imports.get(match[2]) !== undefined;
}

function staticJavaReactNativeModuleKind(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): StaticJavaReactNativeModuleKind | null {
  if (staticJavaDirectReactNativeModule(input, declaration, imports)) {
    return "direct";
  }
  return staticJavaCodegenReactNativeModule(input, declaration, imports) ? "codegen-spec" : null;
}

/**
 * Reads one direct class-local `static final String` constant. This deliberately
 * excludes expressions, non-final fields, inherited values, and multi-variable
 * declarations so an Android bridge identity remains syntax-proven.
 */
function staticJavaLiteralStringConstant(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  name: string
): string | null {
  const values: string[] = [];
  for (const field of directChildren(declaration.body)) {
    if (field.name !== "FieldDeclaration") {
      continue;
    }
    const match = /^((?:(?:public|protected|private|static|final)\s+)*)String\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*"([^"\\\r\n]*)"\s*;$/u.exec(
      nodeText(input, field).trim()
    );
    const modifiers = new Set((match?.[1] ?? "").trim().split(/\s+/u).filter(Boolean));
    if (
      match?.[2] !== name ||
      match[3] === undefined ||
      !modifiers.has("static") ||
      !modifiers.has("final")
    ) {
      continue;
    }
    values.push(match[3]);
  }
  return values.length === 1 && values[0] !== undefined ? values[0] : null;
}

/** Retains one literal Android bridge module name from a direct getName body or class constant. */
function staticJavaReactNativeModule(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  methods: readonly StaticJavaMethod[],
  imports: ReadonlyMap<string, string>
): StaticJavaReactNativeModule | null {
  const kind = staticJavaReactNativeModuleKind(input, declaration, imports);
  if (kind === null) {
    return null;
  }
  const getNameMethods = methods.filter((method) => method.name === "getName");
  if (getNameMethods.length !== 1 || getNameMethods[0] === undefined) {
    return null;
  }
  const bodyNode = getNameMethods[0].body;
  if (bodyNode === null) {
    return null;
  }
  const body = nodeText(input, bodyNode);
  const literal = /^\{\s*return\s+"([^"\\\r\n]*)"\s*;\s*\}$/u.exec(body)?.[1] ?? null;
  const constantName = /^\{\s*return\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;\s*\}$/u.exec(body)?.[1] ?? null;
  const moduleName = literal ??
    (constantName === null
      ? null
      : staticJavaLiteralStringConstant(input, declaration, constantName));
  return moduleName !== null && REACT_NATIVE_BRIDGE_IDENTIFIER.test(moduleName)
    ? { moduleName, kind }
    : null;
}

/** A direct ReactMethod annotation needs exact import or fully-qualified proof. */
function isJavaDirectReactNativeMethod(
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): boolean {
  const annotationsNamedReactMethod = declaration.annotations.filter(
    (annotation) => annotation.name === "ReactMethod" || annotation.name === REACT_NATIVE_REACT_METHOD_PATH
  );
  const reactMethods = annotationsNamedReactMethod.filter((annotation) =>
    annotationMatches(annotation, REACT_NATIVE_REACT_METHOD_PATH, imports)
  );
  return (
    annotationsNamedReactMethod.length === reactMethods.length &&
    reactMethods.length === 1
  );
}

/** Codegen methods are direct Java overrides; the resolver later proves their TypeScript contract. */
function isJavaCodegenReactNativeMethod(
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): boolean {
  if (declaration.name === "getName") {
    return false;
  }
  const overrideAnnotations = declaration.annotations.filter(
    (annotation) => annotation.name === "Override" || annotation.name === "java.lang.Override"
  );
  const exactOverrides = overrideAnnotations.filter(
    (annotation) =>
      annotation.name === "java.lang.Override" ||
      (annotation.name === "Override" &&
        (imports.get("Override") === undefined || imports.get("Override") === "java.lang.Override"))
  );
  return overrideAnnotations.length === exactOverrides.length && exactOverrides.length === 1;
}

function isJavaReactNativeMethod(
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>,
  kind: StaticJavaReactNativeModuleKind
): boolean {
  return kind === "direct"
    ? isJavaDirectReactNativeMethod(declaration, imports)
    : isJavaCodegenReactNativeMethod(declaration, imports);
}

function staticJavaClass(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaClass | null {
  if (node.name !== "ClassDeclaration") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.name === "Definition");
  const body = children.find((child) => child.name === "ClassBody");
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  if (nameNode === undefined || name === null || body === undefined) {
    return null;
  }
  const modifiers = children.find((child) => child.name === "Modifiers");
  return {
    kind: "class",
    name,
    node,
    body,
    annotations: staticAnnotations(input, node),
    isExported: modifiers !== undefined && directChildren(modifiers).some((child) => child.name === "public")
  };
}

function staticJavaInterface(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaInterface | null {
  if (node.name !== "InterfaceDeclaration") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.name === "Definition");
  const body = children.find((child) => child.name === "InterfaceBody");
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  if (nameNode === undefined || name === null || body === undefined) {
    return null;
  }
  const modifiers = children.find((child) => child.name === "Modifiers");
  return {
    kind: "interface",
    name,
    node,
    body,
    annotations: staticAnnotations(input, node),
    isExported: modifiers !== undefined && directChildren(modifiers).some((child) => child.name === "public")
  };
}

function staticJavaType(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaType | null {
  return staticJavaClass(input, node) ?? staticJavaInterface(input, node);
}

/**
 * Retains one direct, non-generic Java parent type spelling. A dotted spelling
 * with a conventional lower-case package prefix remains an exact project-local
 * candidate only when it names one indexed top-level type; no compiler
 * classpath or nested-type inference is assumed.
 */
function staticJavaQualifiedTopLevelTypePath(typePath: string): string | null {
  const segments = typePath.split(".");
  return segments.length > 1 &&
    segments.slice(0, -1).every((segment) => /^[a-z_$][A-Za-z0-9_$]*$/u.test(segment))
    ? typePath
    : null;
}

function staticJavaDirectTypeReference(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaSuperclassReference | null {
  const typePath = staticDottedIdentifier(input, node);
  if (typePath === null) {
    return null;
  }
  const name = typePath.split(".").at(-1);
  if (name === undefined) {
    return null;
  }
  let qualifiedTypePath: string | undefined;
  if (typePath.includes(".")) {
    const candidate = staticJavaQualifiedTopLevelTypePath(typePath);
    if (candidate === null) {
      return null;
    }
    qualifiedTypePath = candidate;
  }
  return {
    name,
    node,
    ...(qualifiedTypePath === undefined ? {} : { qualifiedTypePath })
  };
}

function isJavaDirectTypeName(node: JavaSyntaxNode): boolean {
  return node.name === "TypeName" || node.name === "ScopedTypeName";
}

/**
 * Returns the outer name of one direct Java nominal type. Generic arguments
 * are deliberately ignored: they qualify the outer type but are not separate
 * heritage or construction targets. Other compound or recovered shapes fail closed.
 */
function staticJavaDirectOuterTypeName(node: JavaSyntaxNode): JavaSyntaxNode | null {
  if (isJavaDirectTypeName(node)) {
    return node;
  }
  if (node.name !== "GenericType") {
    return null;
  }
  const children = directChildren(node);
  if (
    children.length !== 2 ||
    !isJavaDirectTypeName(children[0]!) ||
    children[1]?.name !== "TypeArguments"
  ) {
    return null;
  }
  return children[0]!;
}

function staticJavaDirectSuperclass(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass
): StaticJavaSuperclassReference | null {
  const superclasses = directChildren(declaration.node).filter((child) => child.name === "Superclass");
  if (superclasses.length !== 1 || superclasses[0] === undefined) {
    return null;
  }
  const heritageTypes = directChildren(superclasses[0]).filter(
    (child) => child.name !== "extends"
  );
  if (heritageTypes.length !== 1 || heritageTypes[0] === undefined) {
    return null;
  }
  const typeName = staticJavaDirectOuterTypeName(heritageTypes[0]);
  return typeName === null ? null : staticJavaDirectTypeReference(input, typeName);
}

/**
 * Retains direct Java interface spellings, including the outer name of a
 * parameterized interface. The relationship kind is passed explicitly because
 * classes use `implements`, while interfaces use `extends` for their contracts.
 */
function staticJavaDirectInterfaceReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass | StaticJavaInterface,
  headerName: "SuperInterfaces" | "ExtendsInterfaces"
): readonly StaticJavaSuperclassReference[] {
  const headers = directChildren(declaration.node).filter((child) => child.name === headerName);
  if (headers.length !== 1 || headers[0] === undefined) {
    return [];
  }
  const typeLists = directChildren(headers[0]).filter((child) => child.name === "InterfaceTypeList");
  if (typeLists.length !== 1 || typeLists[0] === undefined) {
    return [];
  }
  const references: StaticJavaSuperclassReference[] = [];
  for (const heritageType of directChildren(typeLists[0]).filter((child) => child.name !== ",")) {
    const typeName = staticJavaDirectOuterTypeName(heritageType);
    if (typeName === null) {
      continue;
    }
    const reference = staticJavaDirectTypeReference(input, typeName);
    if (reference !== null) {
      references.push(reference);
    }
  }
  return references;
}

/** Java's standard override declaration is a marker annotation. */
function hasJavaOverrideAnnotation(declaration: StaticJavaMethod): boolean {
  return (
    declaration.annotations.filter(
      (annotation) =>
        annotation.node.name === "MarkerAnnotation" &&
        (annotation.name === "Override" || annotation.name === "java.lang.Override")
    ).length === 1
  );
}

function staticJavaVisibility(
  modifiers: JavaSyntaxNode | undefined,
  implicitPublic: boolean
): "public" | "protected" | "package" | "private" {
  const names = new Set(
    (modifiers === undefined ? [] : directChildren(modifiers)).map((child) => child.name)
  );
  if (names.has("public")) return "public";
  if (names.has("protected")) return "protected";
  if (names.has("private")) return "private";
  return implicitPublic ? "public" : "package";
}

function staticJavaMethod(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaMethod | null {
  if (node.name !== "MethodDeclaration") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.name === "Definition");
  const body = children.find((child) => child.name === "Block") ?? null;
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  if (nameNode === undefined || name === null) {
    return null;
  }
  const modifiers = children.find((child) => child.name === "Modifiers");
  const visibility = staticJavaVisibility(modifiers, node.parent?.name === "InterfaceBody");
  return {
    name,
    nameNode,
    node,
    body,
    annotations: staticAnnotations(input, node),
    isStatic: modifiers !== undefined && directChildren(modifiers).some((child) => child.name === "static"),
    isFinal: modifiers !== undefined && directChildren(modifiers).some((child) => child.name === "final"),
    visibility,
    isExported: visibility === "public"
  };
}

function staticJavaConstructor(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): StaticJavaConstructor | null {
  if (node.name !== "ConstructorDeclaration") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find((child) => child.name === "Definition");
  const body = children.find((child) => child.name === "ConstructorBody");
  const name = nameNode === undefined ? null : identifierText(input, nameNode);
  if (nameNode === undefined || body === undefined || name === null) {
    return null;
  }
  const modifiers = children.find((child) => child.name === "Modifiers");
  const visibility = staticJavaVisibility(modifiers, false);
  return {
    name,
    nameNode,
    node,
    body,
    annotations: staticAnnotations(input, node),
    visibility,
    isExported: visibility === "public"
  };
}

function staticJavaCallableAnnotations(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaMethod | StaticJavaConstructor
): readonly StaticJavaAnnotation[] {
  const formalParameters = directChildren(declaration.node).find(
    (child) => child.name === "FormalParameters"
  );
  const parameterAnnotations = formalParameters === undefined
    ? []
    : directChildren(formalParameters)
        .filter(
          (child) => child.name === "FormalParameter" || child.name === "SpreadParameter"
        )
        .flatMap((parameter) => staticAnnotations(input, parameter));
  return [...declaration.annotations, ...parameterAnnotations];
}

const JAVA_VALUE_DECLARATION_CONTAINERS = new Set([
  "VariableDeclarator",
  "FormalParameter",
  "CatchFormalParameter",
  "LambdaParameter"
]);

const JAVA_TYPE_DECLARATION_CONTAINERS = new Set([
  "ClassDeclaration",
  "InterfaceDeclaration",
  "EnumDeclaration",
  "RecordDeclaration",
  "AnnotationTypeDeclaration",
  "TypeParameter"
]);

const NESTED_JAVA_CALLABLE_SCOPES = new Set([
  "ClassDeclaration",
  "InterfaceDeclaration",
  "EnumDeclaration",
  "RecordDeclaration",
  "MethodDeclaration",
  "ConstructorDeclaration",
  "LambdaExpression"
]);

function staticJavaInstantiationReferences(input: {
  readonly extraction: JavaExtractFileFactsInput;
  readonly callable: StaticJavaMethod | StaticJavaConstructor;
  readonly callableSymbol: SymbolNode;
  readonly declaringType: SymbolNode;
  readonly imports: ReadonlyMap<string, string>;
}): readonly JavaInstantiationReferenceFact[] {
  const body = input.callable.body;
  if (body === null) {
    return [];
  }
  const references: JavaInstantiationReferenceFact[] = [];

  function visit(node: JavaSyntaxNode): void {
    if (node !== body && NESTED_JAVA_CALLABLE_SCOPES.has(node.name)) {
      return;
    }
    if (node.name === "ObjectCreationExpression") {
      const typeNodes = directChildren(node)
        .map(staticJavaDirectOuterTypeName)
        .filter((typeNode): typeNode is JavaSyntaxNode => typeNode !== null);
      const type =
        typeNodes.length === 1 && typeNodes[0] !== undefined
          ? staticJavaCallTypeReference(
              input.extraction,
              typeNodes[0],
              input.imports,
              "object-creation"
            )
          : null;
      if (type?.kind === "reference") {
        references.push({
          sourceId: input.callableSymbol.id,
          declaringTypeId: input.declaringType.id,
          filePath: input.extraction.filePath,
          referenceName: type.referenceName,
          range: type.range,
          ...(type.importedTypePath === undefined ? {} : { importedTypePath: type.importedTypePath }),
          ...(type.qualifiedTypePath === undefined ? {} : { qualifiedTypePath: type.qualifiedTypePath })
        });
      }
    }
    for (const child of directChildren(node)) {
      visit(child);
    }
  }

  visit(body);
  return references;
}

function staticJavaValueDeclarationNames(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): ReadonlySet<string> {
  const names = new Set<string>();

  function collectDefinitions(container: JavaSyntaxNode): void {
    if (container.name === "Definition") {
      const name = identifierText(input, container);
      if (name !== null) {
        names.add(name);
      }
      return;
    }
    for (const child of directChildren(container)) {
      collectDefinitions(child);
    }
  }

  function visit(candidate: JavaSyntaxNode): void {
    if (JAVA_VALUE_DECLARATION_CONTAINERS.has(candidate.name)) {
      collectDefinitions(candidate);
      return;
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  }

  visit(node);
  return names;
}

function staticJavaTypeDeclarationNames(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): ReadonlySet<string> {
  const names = new Set<string>();

  function visit(candidate: JavaSyntaxNode): void {
    if (JAVA_TYPE_DECLARATION_CONTAINERS.has(candidate.name)) {
      const definition = directChildren(candidate).find((child) => child.name === "Definition");
      const name = definition === undefined ? null : identifierText(input, definition);
      if (name !== null) {
        names.add(name);
      }
    }
    for (const child of directChildren(candidate)) {
      visit(child);
    }
  }

  visit(node);
  return names;
}

function staticJavaCallableArity(
  declaration: StaticJavaMethod | StaticJavaConstructor
): { readonly minimumArgumentCount: number; readonly maximumArgumentCount: number | null } | null {
  const parameterLists = directChildren(declaration.node).filter(
    (child) => child.name === "FormalParameters"
  );
  if (parameterLists.length !== 1 || parameterLists[0] === undefined) {
    return null;
  }
  const parameters = directChildren(parameterLists[0]).filter(
    (child) => child.name === "FormalParameter" || child.name === "SpreadParameter"
  );
  const spreadIndexes = parameters.flatMap((parameter, index) =>
    parameter.name === "SpreadParameter" ? [index] : []
  );
  if (
    spreadIndexes.length > 1 ||
    (spreadIndexes.length === 1 && spreadIndexes[0] !== parameters.length - 1)
  ) {
    return null;
  }
  const hasVarargs = spreadIndexes.length === 1;
  return {
    minimumArgumentCount: parameters.length - (hasVarargs ? 1 : 0),
    maximumArgumentCount: hasVarargs ? null : parameters.length
  };
}

function staticJavaCallTypeReference(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode,
  imports: ReadonlyMap<string, string>,
  syntax: JavaCallTypeReferenceFact["syntax"]
): JavaCallTypeReferenceFact | null {
  if (node.name === "PrimitiveType") {
    const referenceName = nodeText(input, node);
    return /^(?:boolean|byte|char|double|float|int|long|short)$/u.test(referenceName)
      ? {
          kind: "primitive",
          referenceName,
          syntax,
          range: rangeFor(lineStartsFor(input.sourceText), node.from, node.to)
        }
      : null;
  }
  if (!isJavaDirectTypeName(node)) {
    return null;
  }
  const reference = staticJavaDirectTypeReference(input, node);
  if (reference === null) {
    return null;
  }
  const importedTypePath =
    reference.qualifiedTypePath === undefined ? imports.get(reference.name) : undefined;
  return {
    kind: "reference",
    referenceName: reference.name,
    syntax,
    range: rangeFor(lineStartsFor(input.sourceText), node.from, node.to),
    ...(importedTypePath === undefined ? {} : { importedTypePath }),
    ...(reference.qualifiedTypePath === undefined
      ? {}
      : { qualifiedTypePath: reference.qualifiedTypePath })
  };
}

function staticJavaCallableParameterTypes(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaMethod | StaticJavaConstructor,
  imports: ReadonlyMap<string, string>
): readonly (JavaCallTypeReferenceFact | null)[] | null {
  const parameterLists = directChildren(declaration.node).filter(
    (child) => child.name === "FormalParameters"
  );
  if (parameterLists.length !== 1 || parameterLists[0] === undefined) {
    return null;
  }
  return directChildren(parameterLists[0])
    .filter((child) => child.name === "FormalParameter" || child.name === "SpreadParameter")
    .map((parameter) => {
      const typeNodes = directChildren(parameter).filter(
        (child) => child.name === "PrimitiveType" || isJavaDirectTypeName(child)
      );
      return typeNodes.length === 1 && typeNodes[0] !== undefined
        ? staticJavaCallTypeReference(input, typeNodes[0], imports, "declaration")
        : null;
    });
}

function staticJavaArguments(invocation: JavaSyntaxNode): readonly JavaSyntaxNode[] | null {
  const argumentLists = directChildren(invocation).filter((child) => child.name === "ArgumentList");
  if (argumentLists.length !== 1 || argumentLists[0] === undefined) {
    return null;
  }
  return directChildren(argumentLists[0]).filter(
    (child) => child.name !== "(" && child.name !== ")" && child.name !== ","
  );
}

function staticJavaPrimitiveLiteralType(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): string | null {
  if (node.name === "BooleanLiteral") {
    return "boolean";
  }
  if (node.name === "CharacterLiteral") {
    return "char";
  }
  const literal = nodeText(input, node).replace(/_/gu, "");
  if (node.name === "IntegerLiteral" && /^[0-9]+[lL]?$/u.test(literal)) {
    const isLong = /[lL]$/u.test(literal);
    const digits = isLong ? literal.slice(0, -1) : literal;
    try {
      const value = BigInt(digits);
      if (isLong) {
        return value <= 9_223_372_036_854_775_807n ? "long" : null;
      }
      if (value <= 2_147_483_647n) {
        return "int";
      }
      return value <= 9_223_372_036_854_775_807n ? "long" : null;
    } catch {
      return null;
    }
  }
  if (node.name === "FloatingPointLiteral" && !/^0[xX]/u.test(literal)) {
    return /[fF]$/u.test(literal) ? "float" : "double";
  }
  return null;
}

function staticJavaArgumentType(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode,
  imports: ReadonlyMap<string, string>
): JavaCallTypeReferenceFact | null {
  if (node.name === "CastExpression") {
    const primitiveTypes = directChildren(node).filter((child) => child.name === "PrimitiveType");
    if (primitiveTypes.length === 1 && primitiveTypes[0] !== undefined) {
      const castType = staticJavaCallTypeReference(
        input,
        primitiveTypes[0],
        imports,
        "primitive-cast"
      );
      return castType === null
        ? null
        : {
            ...castType,
            range: rangeFor(lineStartsFor(input.sourceText), node.from, node.to)
          };
    }
  }
  const primitive = staticJavaPrimitiveLiteralType(input, node);
  if (primitive !== null) {
    return {
      kind: "primitive",
      referenceName: primitive,
      syntax: "primitive-literal",
      range: rangeFor(lineStartsFor(input.sourceText), node.from, node.to)
    };
  }
  if (node.name === "StringLiteral") {
    return {
      kind: "reference",
      referenceName: "String",
      syntax: "string-literal",
      range: rangeFor(lineStartsFor(input.sourceText), node.from, node.to),
      qualifiedTypePath: "java.lang.String"
    };
  }
  if (node.name !== "ObjectCreationExpression") {
    return null;
  }
  const typeNodes = directChildren(node).filter(isJavaDirectTypeName);
  return typeNodes.length === 1 && typeNodes[0] !== undefined
    ? staticJavaCallTypeReference(input, typeNodes[0], imports, "object-creation")
    : null;
}

function staticJavaChainedCallReferences(input: {
  readonly extraction: JavaExtractFileFactsInput;
  readonly callable: StaticJavaMethod | StaticJavaConstructor;
  readonly callableSymbol: SymbolNode;
  readonly declaringType: SymbolNode;
  readonly imports: ReadonlyMap<string, string>;
  readonly shadowedValueNames: ReadonlySet<string>;
}): readonly JavaChainedCallReferenceFact[] {
  if (input.callable.body === null) {
    return [];
  }
  const lineStarts = lineStartsFor(input.extraction.sourceText);
  const references: JavaChainedCallReferenceFact[] = [];

  function visit(node: JavaSyntaxNode): void {
    if (node.name === "MethodInvocation") {
      const children = directChildren(node);
      const inner = children.find((child) => child.name === "MethodInvocation");
      const methodNode = children.find((child) => child.name === "MethodName");
      if (inner !== undefined && methodNode !== undefined) {
        const innerChildren = directChildren(inner);
        const nestedInner = innerChildren.some((child) => child.name === "MethodInvocation");
        const factoryMethodNode = innerChildren.find((child) => child.name === "MethodName");
        const methodName = identifierText(input.extraction, methodNode);
        const factoryMethodName =
          factoryMethodNode === undefined ? null : identifierText(input.extraction, factoryMethodNode);
        const factoryArguments = staticJavaArguments(inner);
        const methodArguments = staticJavaArguments(node);
        const factoryArgumentCount = factoryArguments?.length ?? null;
        const methodArgumentCount = methodArguments?.length ?? null;
        const receiverPrefix =
          factoryMethodNode === undefined
            ? ""
            : input.extraction.sourceText.slice(inner.from, factoryMethodNode.from);
        const receiverMatch = receiverPrefix.match(
          /^\s*([A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)*)\s*\.\s*$/u
        );
        const receiverPath = receiverMatch?.[1]?.replace(/\s+/gu, "");
        const receiverSegments = receiverPath?.split(".") ?? [];
        const receiverTypeName = receiverSegments.at(-1);
        if (
          !nestedInner &&
          methodName !== null &&
          factoryMethodNode !== undefined &&
          factoryMethodName !== null &&
          factoryArguments !== null &&
          methodArguments !== null &&
          factoryArgumentCount !== null &&
          methodArgumentCount !== null &&
          receiverPath !== undefined &&
          receiverTypeName !== undefined &&
          receiverSegments.length > 0 &&
          !input.shadowedValueNames.has(receiverSegments[0]!)
        ) {
          const importedTypePath =
            receiverSegments.length === 1 ? input.imports.get(receiverTypeName) : undefined;
          references.push({
            sourceId: input.callableSymbol.id,
            declaringTypeId: input.declaringType.id,
            filePath: input.extraction.filePath,
            receiverTypeName,
            factoryMethodName,
            methodName,
            factoryArgumentCount,
            methodArgumentCount,
            factoryArgumentTypes: factoryArguments.map((argument) =>
              staticJavaArgumentType(input.extraction, argument, input.imports)
            ),
            methodArgumentTypes: methodArguments.map((argument) =>
              staticJavaArgumentType(input.extraction, argument, input.imports)
            ),
            factoryRange: rangeFor(
              lineStarts,
              factoryMethodNode.from,
              factoryMethodNode.to
            ),
            range: rangeFor(lineStarts, methodNode.from, methodNode.to),
            ...(receiverSegments.length > 1
              ? { qualifiedTypePath: receiverPath }
              : importedTypePath === undefined
                ? {}
                : { importedTypePath })
          });
        }
      }
    }
    for (const child of directChildren(node)) {
      visit(child);
    }
  }

  visit(input.callable.body);
  return references;
}

function staticJavaMemberCallReferences(input: {
  readonly extraction: JavaExtractFileFactsInput;
  readonly callable: StaticJavaMethod | StaticJavaConstructor;
  readonly callableSymbol: SymbolNode;
  readonly declaringType: SymbolNode;
  readonly imports: ReadonlyMap<string, string>;
  readonly declaredFieldNames: ReadonlySet<string>;
  readonly shadowedTypeNames: ReadonlySet<string>;
  readonly instanceofAndPatternSyntaxes: readonly StaticJavaInstanceofAndPatternSyntax[];
}): readonly JavaMemberCallReferenceFact[] {
  const body = input.callable.body;
  if (body === null) {
    return [];
  }
  const lineStarts = lineStartsFor(input.extraction.sourceText);
  const references: JavaMemberCallReferenceFact[] = [];

  function hasCompetingStaticImport(methodName: string): boolean {
    const escapedName = methodName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(
      `^[ \\t]*import[ \\t]+static[ \\t]+[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*\\.(?:${escapedName}|\\*)[ \\t]*;`,
      "mu"
    ).test(input.extraction.sourceText);
  }

  interface ReceiverBindingBase {
    readonly name: string;
    readonly type: JavaCallTypeReferenceFact;
    readonly declarationRange: SourceRange;
    readonly scopeRange: SourceRange;
    readonly initializerRange?: SourceRange;
  }

  interface DirectAssignmentBinding {
    readonly type: JavaCallTypeReferenceFact;
    readonly assignmentRange: SourceRange;
    readonly initializerRange: SourceRange;
  }

  interface ExhaustiveAssignmentBranchBinding extends DirectAssignmentBinding {
    readonly branch: "then" | "else";
    readonly name: string;
    readonly scopeRange: SourceRange;
  }

  interface ExhaustiveAssignmentJoinBinding {
    readonly statementRange: SourceRange;
    readonly conditionRange: SourceRange;
    readonly branches: readonly [
      ExhaustiveAssignmentBranchBinding,
      ExhaustiveAssignmentBranchBinding
    ];
  }

  interface ExhaustiveAssignmentChainBranchBinding extends DirectAssignmentBinding {
    readonly ordinal: number;
    readonly branch: "if" | "else-if" | "else";
    readonly name: string;
    readonly statementRange: SourceRange;
    readonly conditionRange?: SourceRange;
    readonly scopeRange: SourceRange;
  }

  interface ExhaustiveAssignmentChainBinding {
    readonly statementRange: SourceRange;
    readonly branches: readonly ExhaustiveAssignmentChainBranchBinding[];
  }

  interface ExhaustiveSwitchAssignmentArmBinding extends DirectAssignmentBinding {
    readonly ordinal: number;
    readonly arm: "case" | "default";
    readonly name: string;
    readonly labelRange: SourceRange;
  }

  interface ExhaustiveSwitchAssignmentJoinBinding {
    readonly statementRange: SourceRange;
    readonly selectorRange: SourceRange;
    readonly arms: readonly ExhaustiveSwitchAssignmentArmBinding[];
  }

  type ReceiverBinding = ReceiverBindingBase &
    (
      | { readonly kind: "parameter" | "enhanced-for" | "catch" | "lambda" }
      | {
          readonly kind: "instanceof-pattern";
          readonly conditionRange: SourceRange;
          readonly testedValueRange: SourceRange;
        }
      | {
          readonly kind: "instanceof-and-pattern";
          readonly conditionRange: SourceRange;
          readonly testedValueRange: SourceRange;
          readonly rightOperandRange: SourceRange;
          readonly trueBlockRange: SourceRange;
        }
      | {
          readonly kind: "instanceof-and-chain-pattern";
          readonly conditionRange: SourceRange;
          readonly testedValueRange: SourceRange;
          readonly logicalOperandRanges: readonly SourceRange[];
          readonly activeOperandRange: SourceRange | null;
          readonly activeOperandOrdinal: number | null;
          readonly trueBlockRange: SourceRange;
          readonly operandCount: number;
          readonly maximumOperands: number;
        }
      | {
          readonly kind: "instanceof-grouped-and-pattern";
          readonly conditionRange: SourceRange;
          readonly testedValueRange: SourceRange;
          readonly logicalOperandRanges: readonly SourceRange[];
          readonly logicalOperandGroupingPaths: readonly (readonly (
            | "left"
            | "right"
            | "parenthesized"
          )[])[];
          readonly groupingRanges: readonly SourceRange[];
          readonly activeOperandRange: SourceRange | null;
          readonly activeOperandOrdinal: number | null;
          readonly trueBlockRange: SourceRange;
          readonly operandCount: number;
          readonly maximumOperands: number;
        }
      | {
          readonly kind: "instanceof-negated-early-exit-pattern";
          readonly conditionRange: SourceRange;
          readonly testedValueRange: SourceRange;
          readonly negatedPatternRange: SourceRange;
          readonly negationGroupingRanges: readonly SourceRange[];
          readonly maximumGroupingDepth: number;
          readonly guardStatementRange: SourceRange;
          readonly exitBodyKind: "block" | "statement";
          readonly exitBodyRange: SourceRange;
          readonly abruptCompletionKind: "return" | "throw";
          readonly abruptStatementRange: SourceRange;
          readonly abruptWrapperKind: "try-finally" | null;
          readonly abruptWrapperRange: SourceRange | null;
          readonly abruptWrapperTryBodyRange: SourceRange | null;
          readonly abruptWrapperFinallyRange: SourceRange | null;
          readonly abruptWrapperFinallyBodyRange: SourceRange | null;
          readonly abruptWrapperFinallyStatementRanges: readonly SourceRange[];
          readonly abruptWrapperMaximumFinallyStatements: number;
        }
      | {
          readonly kind: "instanceof-negated-target-exit-pattern";
          readonly conditionRange: SourceRange;
          readonly testedValueRange: SourceRange;
          readonly negatedPatternRange: SourceRange;
          readonly negationGroupingRanges: readonly SourceRange[];
          readonly maximumGroupingDepth: number;
          readonly guardStatementRange: SourceRange;
          readonly exitBodyKind: "block" | "statement";
          readonly exitBodyRange: SourceRange;
          readonly abruptCompletionKind: "break" | "continue" | "yield";
          readonly abruptStatementRange: SourceRange;
          readonly abruptWrapperKind: "try-finally" | null;
          readonly abruptWrapperRange: SourceRange | null;
          readonly abruptWrapperTryBodyRange: SourceRange | null;
          readonly abruptWrapperFinallyRange: SourceRange | null;
          readonly abruptWrapperFinallyBodyRange: SourceRange | null;
          readonly abruptWrapperFinallyStatementRanges: readonly SourceRange[];
          readonly abruptWrapperMaximumFinallyStatements: number;
          readonly abruptTargetKind: StaticJavaAbruptTargetKind;
          readonly abruptTargetRange: SourceRange;
          readonly abruptTargetBodyRange: SourceRange;
          readonly abruptTargetCaseGroupRange: SourceRange | null;
          readonly abruptTargetCaseLabelRanges: readonly SourceRange[];
          readonly abruptTargetRuleRange: SourceRange | null;
          readonly abruptTargetRuleBodyRange: SourceRange | null;
          readonly abruptTargetRuleLabelRange: SourceRange | null;
          readonly abruptTargetExpressionContext:
            | StaticJavaSwitchYieldTarget["expressionContext"]
            | null;
          readonly abruptTargetLabel: string | null;
          readonly abruptTargetLabelRange: SourceRange | null;
        }
      | {
          readonly kind: "instanceof-negated-else-pattern";
          readonly conditionRange: SourceRange;
          readonly testedValueRange: SourceRange;
          readonly negatedPatternRange: SourceRange;
          readonly negationGroupingRanges: readonly SourceRange[];
          readonly maximumGroupingDepth: number;
          readonly guardStatementRange: SourceRange;
          readonly thenBodyKind: "block" | "statement";
          readonly thenBodyRange: SourceRange;
          readonly thenAbruptCompletionKind:
            | "return"
            | "throw"
            | "break"
            | "continue"
            | "yield"
            | null;
          readonly thenAbruptStatementRange: SourceRange | null;
          readonly thenAbruptWrapperKind: "try-finally" | null;
          readonly thenAbruptWrapperRange: SourceRange | null;
          readonly thenAbruptWrapperTryBodyRange: SourceRange | null;
          readonly thenAbruptWrapperFinallyRange: SourceRange | null;
          readonly thenAbruptWrapperFinallyBodyRange: SourceRange | null;
          readonly thenAbruptWrapperFinallyStatementRanges: readonly SourceRange[];
          readonly thenAbruptWrapperMaximumFinallyStatements: number;
          readonly thenAbruptTargetKind: StaticJavaAbruptTargetKind | null;
          readonly thenAbruptTargetRange: SourceRange | null;
          readonly thenAbruptTargetBodyRange: SourceRange | null;
          readonly thenAbruptTargetCaseGroupRange: SourceRange | null;
          readonly thenAbruptTargetCaseLabelRanges: readonly SourceRange[];
          readonly thenAbruptTargetRuleRange: SourceRange | null;
          readonly thenAbruptTargetRuleBodyRange: SourceRange | null;
          readonly thenAbruptTargetRuleLabelRange: SourceRange | null;
          readonly thenAbruptTargetExpressionContext:
            | StaticJavaSwitchYieldTarget["expressionContext"]
            | null;
          readonly thenAbruptTargetLabel: string | null;
          readonly thenAbruptTargetLabelRange: SourceRange | null;
          readonly elseBodyKind: "block" | "statement";
          readonly elseBodyRange: SourceRange;
          readonly activeRegion: "else-body" | "following-scope";
        }
      | {
          readonly kind: "local";
          readonly directAssignment?: DirectAssignmentBinding;
          readonly assignmentJoin?: ExhaustiveAssignmentJoinBinding;
          readonly assignmentChain?: ExhaustiveAssignmentChainBinding;
          readonly switchAssignmentJoin?: ExhaustiveSwitchAssignmentJoinBinding;
        }
      | {
          readonly kind: "try-resource";
          readonly resourceOrdinal: number;
          readonly visibility: "later-resources-and-try-body";
          readonly tryBodyRange: SourceRange;
        }
    );

  interface UnassignedLocalBinding {
    readonly kind: "unassigned-local";
    readonly name: string;
    readonly type: JavaCallTypeReferenceFact;
    readonly declarationRange: SourceRange;
    readonly scopeRange: SourceRange;
  }

  type BindingEntry = ReceiverBinding | UnassignedLocalBinding | null;
  type BindingScope = Map<string, BindingEntry>;
  const bodyRange = rangeFor(lineStarts, body.from, body.to);
  const parameterScope: BindingScope = new Map();
  const parameterLists = directChildren(input.callable.node).filter(
    (child) => child.name === "FormalParameters"
  );
  if (parameterLists.length === 1 && parameterLists[0] !== undefined) {
    for (const parameter of directChildren(parameterLists[0]).filter(
      (child) => child.name === "FormalParameter"
    )) {
      const typeNodes = directChildren(parameter).filter(
        (child) => child.name === "PrimitiveType" || isJavaDirectTypeName(child)
      );
      const definitions = directChildren(parameter).filter((child) => child.name === "Definition");
      const definition = definitions[0];
      const name = definition === undefined ? null : identifierText(input.extraction, definition);
      const type =
        typeNodes.length === 1 && typeNodes[0] !== undefined
          ? staticJavaCallTypeReference(input.extraction, typeNodes[0], input.imports, "declaration")
          : null;
      if (definitions.length !== 1 || definition === undefined || name === null) {
        continue;
      }
      const binding: ReceiverBinding | null =
        type === null
          ? null
          : {
              kind: "parameter",
              name,
              type,
              declarationRange: rangeFor(lineStarts, definition.from, definition.to),
              scopeRange: bodyRange
            };
      parameterScope.set(name, parameterScope.has(name) ? null : binding);
    }
  }
  const scopes: BindingScope[] = [parameterScope];

  function visibleBinding(name: string): ReceiverBinding | null | undefined {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const scope = scopes[index]!;
      if (scope.has(name)) {
        const entry = scope.get(name) ?? null;
        return entry === null || entry.kind === "unassigned-local" ? null : entry;
      }
    }
    return undefined;
  }

  function visibleBindingAt(
    name: string,
    offset: number
  ): ReceiverBinding | null | undefined {
    const lexical = visibleBinding(name);
    const activePatterns: Array<{
      readonly syntax: StaticJavaInstanceofAndPatternSyntax;
      readonly activeOperandRange: SourceRange | null;
      readonly activeOperandOrdinal: number | null;
      readonly activeRegion: "else-body" | "following-scope" | null;
    }> = [];
    for (const syntax of input.instanceofAndPatternSyntaxes) {
      if (syntax.name !== name) {
        continue;
      }
      if (syntax.kind === "negated-early-exit") {
        if (
          syntax.followingScopeOffsets.start <= offset &&
          offset < syntax.followingScopeOffsets.end
        ) {
          activePatterns.push({
            syntax,
            activeOperandRange: null,
            activeOperandOrdinal: null,
            activeRegion: "following-scope"
          });
        }
        continue;
      }
      if (syntax.kind === "negated-else") {
        const activeRegion =
          syntax.elseBodyOffsets.start <= offset && offset < syntax.elseBodyOffsets.end
            ? "else-body"
            : syntax.followingScopeOffsets !== null &&
                syntax.followingScopeOffsets.start <= offset &&
                offset < syntax.followingScopeOffsets.end
              ? "following-scope"
              : null;
        if (activeRegion !== null) {
          activePatterns.push({
            syntax,
            activeOperandRange: null,
            activeOperandOrdinal: null,
            activeRegion
          });
        }
        continue;
      }
      if (syntax.kind === "single") {
        if (
          syntax.rightOperandOffsets.start <= offset &&
          offset < syntax.rightOperandOffsets.end
        ) {
          activePatterns.push({
            syntax,
            activeOperandRange: syntax.rightOperandRange,
            activeOperandOrdinal: 1,
            activeRegion: null
          });
          continue;
        }
      } else {
        const activeIndex = syntax.activeOperandOffsets.findIndex(
          (operand) => operand.start <= offset && offset < operand.end
        );
        const activeOperandRange = syntax.logicalOperandRanges[activeIndex + 1];
        if (activeIndex >= 0 && activeOperandRange !== undefined) {
          activePatterns.push({
            syntax,
            activeOperandRange,
            activeOperandOrdinal: activeIndex + 1,
            activeRegion: null
          });
          continue;
        }
      }
      if (syntax.trueBlockOffsets.start <= offset && offset < syntax.trueBlockOffsets.end) {
        activePatterns.push({
          syntax,
          activeOperandRange: null,
          activeOperandOrdinal: null,
          activeRegion: null
        });
      }
    }
    if (activePatterns.length === 0) {
      return lexical;
    }
    const activePattern = activePatterns[0];
    if (activePatterns.length !== 1 || activePattern === undefined || lexical !== undefined) {
      return null;
    }
    const pattern = activePattern.syntax;
    const typeSegments = pattern.typePath.split(".");
    const referenceName = typeSegments.at(-1);
    if (referenceName === undefined) {
      return null;
    }
    const qualifiedTypePath = typeSegments.length > 1 ? pattern.typePath : undefined;
    const importedTypePath =
      qualifiedTypePath === undefined ? input.imports.get(referenceName) : undefined;
    const scopeRange =
      pattern.kind === "negated-early-exit"
        ? pattern.followingScopeRange
        : pattern.kind === "negated-else"
          ? activePattern.activeRegion === "else-body"
            ? pattern.elseBodyRange
            : pattern.followingScopeRange!
        : activePattern.activeOperandRange ?? pattern.trueBlockRange;
    const bindingBase: ReceiverBindingBase & {
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
    } = {
      name,
      type: {
        kind: "reference",
        referenceName,
        syntax: "declaration",
        range: pattern.typeRange,
        ...(importedTypePath === undefined ? {} : { importedTypePath }),
        ...(qualifiedTypePath === undefined ? {} : { qualifiedTypePath })
      },
      declarationRange: pattern.declarationRange,
      scopeRange,
      conditionRange: pattern.conditionRange,
      testedValueRange: pattern.testedValueRange
    };
    if (pattern.kind === "negated-early-exit") {
      if (
        (pattern.abruptCompletionKind === "break" ||
          pattern.abruptCompletionKind === "continue" ||
          pattern.abruptCompletionKind === "yield") &&
        pattern.abruptTargetKind !== null &&
        pattern.abruptTargetRange !== null &&
        pattern.abruptTargetBodyRange !== null
      ) {
        return {
          ...bindingBase,
          kind: "instanceof-negated-target-exit-pattern",
          negatedPatternRange: pattern.negatedPatternRange,
          negationGroupingRanges: pattern.negationGroupingRanges,
          maximumGroupingDepth: pattern.maximumGroupingDepth,
          guardStatementRange: pattern.guardStatementRange,
          exitBodyKind: pattern.exitBodyKind,
          exitBodyRange: pattern.exitBodyRange,
          abruptCompletionKind: pattern.abruptCompletionKind,
          abruptStatementRange: pattern.abruptStatementRange,
          abruptWrapperKind: pattern.abruptWrapperKind,
          abruptWrapperRange: pattern.abruptWrapperRange,
          abruptWrapperTryBodyRange: pattern.abruptWrapperTryBodyRange,
          abruptWrapperFinallyRange: pattern.abruptWrapperFinallyRange,
          abruptWrapperFinallyBodyRange: pattern.abruptWrapperFinallyBodyRange,
          abruptWrapperFinallyStatementRanges: pattern.abruptWrapperFinallyStatementRanges,
          abruptWrapperMaximumFinallyStatements:
            pattern.abruptWrapperMaximumFinallyStatements,
          abruptTargetKind: pattern.abruptTargetKind,
          abruptTargetRange: pattern.abruptTargetRange,
          abruptTargetBodyRange: pattern.abruptTargetBodyRange,
          abruptTargetCaseGroupRange: pattern.abruptTargetCaseGroupRange,
          abruptTargetCaseLabelRanges: pattern.abruptTargetCaseLabelRanges,
          abruptTargetRuleRange: pattern.abruptTargetRuleRange,
          abruptTargetRuleBodyRange: pattern.abruptTargetRuleBodyRange,
          abruptTargetRuleLabelRange: pattern.abruptTargetRuleLabelRange,
          abruptTargetExpressionContext: pattern.abruptTargetExpressionContext,
          abruptTargetLabel: pattern.abruptTargetLabel,
          abruptTargetLabelRange: pattern.abruptTargetLabelRange
        };
      }
      if (
        pattern.abruptCompletionKind !== "return" &&
        pattern.abruptCompletionKind !== "throw"
      ) {
        return null;
      }
      return {
        ...bindingBase,
        kind: "instanceof-negated-early-exit-pattern",
        negatedPatternRange: pattern.negatedPatternRange,
        negationGroupingRanges: pattern.negationGroupingRanges,
        maximumGroupingDepth: pattern.maximumGroupingDepth,
        guardStatementRange: pattern.guardStatementRange,
        exitBodyKind: pattern.exitBodyKind,
        exitBodyRange: pattern.exitBodyRange,
        abruptCompletionKind: pattern.abruptCompletionKind,
        abruptStatementRange: pattern.abruptStatementRange,
        abruptWrapperKind: pattern.abruptWrapperKind,
        abruptWrapperRange: pattern.abruptWrapperRange,
        abruptWrapperTryBodyRange: pattern.abruptWrapperTryBodyRange,
        abruptWrapperFinallyRange: pattern.abruptWrapperFinallyRange,
        abruptWrapperFinallyBodyRange: pattern.abruptWrapperFinallyBodyRange,
        abruptWrapperFinallyStatementRanges: pattern.abruptWrapperFinallyStatementRanges,
        abruptWrapperMaximumFinallyStatements: pattern.abruptWrapperMaximumFinallyStatements
      };
    }
    if (pattern.kind === "negated-else") {
      return {
        ...bindingBase,
        kind: "instanceof-negated-else-pattern",
        negatedPatternRange: pattern.negatedPatternRange,
        negationGroupingRanges: pattern.negationGroupingRanges,
        maximumGroupingDepth: pattern.maximumGroupingDepth,
        guardStatementRange: pattern.guardStatementRange,
        thenBodyKind: pattern.thenBodyKind,
        thenBodyRange: pattern.thenBodyRange,
        thenAbruptCompletionKind: pattern.thenAbruptCompletionKind,
        thenAbruptStatementRange: pattern.thenAbruptStatementRange,
        thenAbruptWrapperKind: pattern.thenAbruptWrapperKind,
        thenAbruptWrapperRange: pattern.thenAbruptWrapperRange,
        thenAbruptWrapperTryBodyRange: pattern.thenAbruptWrapperTryBodyRange,
        thenAbruptWrapperFinallyRange: pattern.thenAbruptWrapperFinallyRange,
        thenAbruptWrapperFinallyBodyRange: pattern.thenAbruptWrapperFinallyBodyRange,
        thenAbruptWrapperFinallyStatementRanges:
          pattern.thenAbruptWrapperFinallyStatementRanges,
        thenAbruptWrapperMaximumFinallyStatements:
          pattern.thenAbruptWrapperMaximumFinallyStatements,
        thenAbruptTargetKind: pattern.thenAbruptTargetKind,
        thenAbruptTargetRange: pattern.thenAbruptTargetRange,
        thenAbruptTargetBodyRange: pattern.thenAbruptTargetBodyRange,
        thenAbruptTargetCaseGroupRange: pattern.thenAbruptTargetCaseGroupRange,
        thenAbruptTargetCaseLabelRanges: pattern.thenAbruptTargetCaseLabelRanges,
        thenAbruptTargetRuleRange: pattern.thenAbruptTargetRuleRange,
        thenAbruptTargetRuleBodyRange: pattern.thenAbruptTargetRuleBodyRange,
        thenAbruptTargetRuleLabelRange: pattern.thenAbruptTargetRuleLabelRange,
        thenAbruptTargetExpressionContext: pattern.thenAbruptTargetExpressionContext,
        thenAbruptTargetLabel: pattern.thenAbruptTargetLabel,
        thenAbruptTargetLabelRange: pattern.thenAbruptTargetLabelRange,
        elseBodyKind: pattern.elseBodyKind,
        elseBodyRange: pattern.elseBodyRange,
        activeRegion: activePattern.activeRegion!
      };
    }
    if (pattern.kind === "single") {
      return {
        ...bindingBase,
        kind: "instanceof-and-pattern",
        rightOperandRange: pattern.rightOperandRange,
        trueBlockRange: pattern.trueBlockRange
      };
    }
    if (pattern.kind === "chain") {
      return {
        ...bindingBase,
        kind: "instanceof-and-chain-pattern",
        logicalOperandRanges: pattern.logicalOperandRanges,
        activeOperandRange: activePattern.activeOperandRange,
        activeOperandOrdinal: activePattern.activeOperandOrdinal,
        trueBlockRange: pattern.trueBlockRange,
        operandCount: pattern.operandCount,
        maximumOperands: pattern.maximumOperands
      };
    }
    return {
      ...bindingBase,
      kind: "instanceof-grouped-and-pattern",
      logicalOperandRanges: pattern.logicalOperandRanges,
      logicalOperandGroupingPaths: pattern.logicalOperandGroupingPaths,
      groupingRanges: pattern.groupingRanges,
      activeOperandRange: activePattern.activeOperandRange,
      activeOperandOrdinal: activePattern.activeOperandOrdinal,
      trueBlockRange: pattern.trueBlockRange,
      operandCount: pattern.operandCount,
      maximumOperands: pattern.maximumOperands
    };
  }

  function addLocalDeclaration(
    declaration: JavaSyntaxNode,
    scope: BindingScope,
    scopeRange: SourceRange
  ): void {
    const declarationChildren = directChildren(declaration);
    const typeNodes = directChildren(declaration).filter(
      (child) => child.name === "PrimitiveType" || isJavaDirectTypeName(child)
    );
    const declaredType =
      typeNodes.length === 1 && typeNodes[0] !== undefined
        ? staticJavaCallTypeReference(input.extraction, typeNodes[0], input.imports, "declaration")
        : null;
    const declarators = declarationChildren.filter((child) => child.name === "VariableDeclarator");
    const isVarDeclaration =
      declarationChildren.filter((child) => child.name === "var").length === 1 &&
      declarators.length === 1;
    for (const child of declarationChildren) {
      if (child.name !== "VariableDeclarator") {
        visit(child);
        continue;
      }
      // The binding is not visible in its own initializer, but becomes visible
      // to later declarators and statements in the same lexical block.
      visit(child);
      const definitions = directChildren(child).filter((candidate) => candidate.name === "Definition");
      const definition = definitions[0];
      const name = definition === undefined ? null : identifierText(input.extraction, definition);
      const assignments = directChildren(child).filter(
        (candidate) => candidate.name === "AssignOp" && nodeText(input.extraction, candidate) === "="
      );
      const initializerCandidates = directChildren(child).filter(
        (candidate) => candidate.name === "ObjectCreationExpression"
      );
      const initializer = initializerCandidates[0];
      const initializerChildren = initializer === undefined ? [] : directChildren(initializer);
      const initializerTypeNodes = initializerChildren.filter(isJavaDirectTypeName);
      const safeInitializer =
        isVarDeclaration &&
        assignments.length === 1 &&
        initializerCandidates.length === 1 &&
        initializer !== undefined &&
        initializerChildren.every(
          (candidate) => candidate.name !== "TypeArguments" && candidate.name !== "ClassBody"
        ) &&
        initializerTypeNodes.length === 1 &&
        initializerTypeNodes[0] !== undefined
          ? {
              type: staticJavaCallTypeReference(
                input.extraction,
                initializerTypeNodes[0],
                input.imports,
                "object-creation"
              ),
              range: rangeFor(lineStarts, initializer.from, initializer.to)
            }
          : null;
      const type = declaredType ?? safeInitializer?.type ?? null;
      if (definitions.length !== 1 || definition === undefined || name === null) {
        continue;
      }
      const binding: BindingEntry =
        type === null
          ? null
          : declaredType !== null && assignments.length === 0
            ? {
                kind: "unassigned-local",
                name,
                type,
                declarationRange: rangeFor(lineStarts, definition.from, definition.to),
                scopeRange
              }
          : {
              kind: "local",
              name,
              type,
              declarationRange: rangeFor(lineStarts, definition.from, definition.to),
              scopeRange,
              ...(declaredType === null && safeInitializer !== null
                ? { initializerRange: safeInitializer.range }
                : {})
            };
      scope.set(name, scope.has(name) ? null : binding);
    }
  }

  function visitDirectSameBlockAssignment(statement: JavaSyntaxNode, scope: BindingScope): void {
    const assignments = directChildren(statement).filter(
      (child) => child.name === "AssignmentExpression"
    );
    const assignment = assignments[0];
    const children = assignment === undefined ? [] : directChildren(assignment);
    const identifiers = children.filter((child) => child.name === "Identifier");
    const assignOps = children.filter(
      (child) => child.name === "AssignOp" && nodeText(input.extraction, child) === "="
    );
    const initializers = children.filter((child) => child.name === "ObjectCreationExpression");
    const identifier = identifiers[0];
    const initializer = initializers[0];

    // Calls inside the assignment expression observe the pre-assignment state.
    visit(statement);

    const name = identifier === undefined ? null : identifierText(input.extraction, identifier);
    const prior = name === null ? undefined : scope.get(name);
    const isDirectIdentifierAssignment =
      assignments.length === 1 &&
      assignment !== undefined &&
      children.length === 3 &&
      identifiers.length === 1 &&
      identifier !== undefined &&
      children[0] === identifier &&
      children.filter((child) => child.name === "AssignOp").length === 1;
    if (
      isDirectIdentifierAssignment &&
      name !== null &&
      prior !== undefined &&
      prior !== null &&
      prior.kind === "local"
    ) {
      // A later write invalidates the earlier assignment proof. Reassignment dataflow is
      // intentionally unsupported until every intervening value can be proven.
      scope.set(name, null);
      return;
    }

    if (
      assignments.length !== 1 ||
      assignment === undefined ||
      children.length !== 3 ||
      identifiers.length !== 1 ||
      identifier === undefined ||
      assignOps.length !== 1 ||
      initializers.length !== 1 ||
      initializer === undefined
    ) {
      return;
    }
    if (name === null || prior === undefined || prior === null || prior.kind !== "unassigned-local") {
      return;
    }
    const initializerChildren = directChildren(initializer);
    const initializerTypeNodes = initializerChildren.filter(isJavaDirectTypeName);
    const initializerType = initializerTypeNodes[0];
    if (
      initializerChildren.some(
        (candidate) => candidate.name === "TypeArguments" || candidate.name === "ClassBody"
      ) ||
      initializerTypeNodes.length !== 1 ||
      initializerType === undefined
    ) {
      return;
    }
    const assignmentType = staticJavaCallTypeReference(
      input.extraction,
      initializerType,
      input.imports,
      "object-creation"
    );
    if (assignmentType === null) {
      return;
    }
    scope.set(name, {
      kind: "local",
      name,
      type: prior.type,
      declarationRange: prior.declarationRange,
      scopeRange: prior.scopeRange,
      directAssignment: {
        type: assignmentType,
        assignmentRange: rangeFor(lineStarts, assignment.from, assignment.to),
        initializerRange: rangeFor(lineStarts, initializer.from, initializer.to)
      }
    });
  }

  function directObjectCreationAssignment(
    statement: JavaSyntaxNode
  ):
    | {
        readonly name: string;
        readonly type: JavaCallTypeReferenceFact;
        readonly assignmentRange: SourceRange;
        readonly initializerRange: SourceRange;
      }
    | null {
    const assignments = directChildren(statement).filter(
      (child) => child.name === "AssignmentExpression"
    );
    const assignment = assignments[0];
    const children = assignment === undefined ? [] : directChildren(assignment);
    const identifier = children[0];
    const assignOp = children[1];
    const initializer = children[2];
    if (
      assignments.length !== 1 ||
      assignment === undefined ||
      children.length !== 3 ||
      identifier?.name !== "Identifier" ||
      assignOp?.name !== "AssignOp" ||
      nodeText(input.extraction, assignOp) !== "=" ||
      initializer?.name !== "ObjectCreationExpression"
    ) {
      return null;
    }
    const name = identifierText(input.extraction, identifier);
    const initializerChildren = directChildren(initializer);
    const initializerTypeNodes = initializerChildren.filter(isJavaDirectTypeName);
    const initializerType = initializerTypeNodes[0];
    if (
      name === null ||
      initializerChildren.some(
        (candidate) => candidate.name === "TypeArguments" || candidate.name === "ClassBody"
      ) ||
      initializerTypeNodes.length !== 1 ||
      initializerType === undefined
    ) {
      return null;
    }
    const type = staticJavaCallTypeReference(
      input.extraction,
      initializerType,
      input.imports,
      "object-creation"
    );
    return type === null
      ? null
      : {
          name,
          type,
          assignmentRange: rangeFor(lineStarts, assignment.from, assignment.to),
          initializerRange: rangeFor(lineStarts, initializer.from, initializer.to)
        };
  }

  function containsJavaNode(node: JavaSyntaxNode, name: string): boolean {
    if (node.name === name) {
      return true;
    }
    return directChildren(node).some((child) => containsJavaNode(child, name));
  }

  function assignedIdentifierNames(node: JavaSyntaxNode, root = true): ReadonlySet<string> {
    const names = new Set<string>();
    function collect(candidate: JavaSyntaxNode, isRoot: boolean): void {
      if (!isRoot && NESTED_JAVA_CALLABLE_SCOPES.has(candidate.name)) {
        return;
      }
      if (candidate.name === "AssignmentExpression") {
        const children = directChildren(candidate);
        const identifier = children[0];
        if (identifier?.name === "Identifier" && children[1]?.name === "AssignOp") {
          const name = identifierText(input.extraction, identifier);
          if (name !== null) {
            names.add(name);
          }
        }
      }
      for (const child of directChildren(candidate)) {
        collect(child, false);
      }
    }
    collect(node, root);
    return names;
  }

  function exhaustiveBranchAssignment(
    block: JavaSyntaxNode,
    branch: "then" | "else"
  ): ExhaustiveAssignmentBranchBinding | null {
    const statements = directChildren(block).filter(
      (child) => child.name !== "{" && child.name !== "}"
    );
    const statement = statements[0];
    if (statements.length !== 1 || statement?.name !== "ExpressionStatement") {
      return null;
    }
    const assignment = directObjectCreationAssignment(statement);
    return assignment === null
      ? null
      : {
          branch,
          name: assignment.name,
          scopeRange: rangeFor(lineStarts, block.from, block.to),
          type: assignment.type,
          assignmentRange: assignment.assignmentRange,
          initializerRange: assignment.initializerRange
        };
  }

  function exhaustiveAssignmentChain(
    statement: JavaSyntaxNode
  ): ExhaustiveAssignmentChainBinding | null {
    const branches: ExhaustiveAssignmentChainBranchBinding[] = [];
    let current = statement;

    while (true) {
      // Every remaining IfStatement requires both its own branch and one terminal else branch.
      if (branches.length >= JAVA_EXHAUSTIVE_ASSIGNMENT_JOIN_MAXIMUM_BRANCHES - 1) {
        return null;
      }
      const children = directChildren(current);
      const condition = children[1];
      const block = children[2];
      const tail = children[4];
      if (
        children.length !== 5 ||
        children[0]?.name !== "if" ||
        condition?.name !== "ParenthesizedExpression" ||
        containsJavaNode(condition, "AssignmentExpression") ||
        block?.name !== "Block" ||
        children[3]?.name !== "else" ||
        (tail?.name !== "Block" && tail?.name !== "IfStatement")
      ) {
        return null;
      }
      const assignment = exhaustiveBranchAssignment(block, "then");
      if (assignment === null) {
        return null;
      }
      branches.push({
        ordinal: branches.length,
        branch: branches.length === 0 ? "if" : "else-if",
        name: assignment.name,
        statementRange: rangeFor(lineStarts, current.from, current.to),
        conditionRange: rangeFor(lineStarts, condition.from, condition.to),
        scopeRange: assignment.scopeRange,
        type: assignment.type,
        assignmentRange: assignment.assignmentRange,
        initializerRange: assignment.initializerRange
      });

      if (tail.name === "IfStatement") {
        current = tail;
        continue;
      }
      const finalAssignment = exhaustiveBranchAssignment(tail, "else");
      if (finalAssignment === null) {
        return null;
      }
      branches.push({
        ordinal: branches.length,
        branch: "else",
        name: finalAssignment.name,
        statementRange: rangeFor(lineStarts, current.from, current.to),
        scopeRange: finalAssignment.scopeRange,
        type: finalAssignment.type,
        assignmentRange: finalAssignment.assignmentRange,
        initializerRange: finalAssignment.initializerRange
      });
      break;
    }

    if (
      branches.length < 3 ||
      branches.length > JAVA_EXHAUSTIVE_ASSIGNMENT_JOIN_MAXIMUM_BRANCHES ||
      new Set(branches.map((branch) => branch.name)).size !== 1
    ) {
      return null;
    }
    return {
      statementRange: rangeFor(lineStarts, statement.from, statement.to),
      branches
    };
  }

  function visitExhaustiveIfElseAssignment(statement: JavaSyntaxNode, scope: BindingScope): void {
    // Calls in the condition and branches observe the pre-join state.
    visitIfStatementContents(statement);

    const assignedNames = assignedIdentifierNames(statement);
    for (const name of assignedNames) {
      const prior = scope.get(name);
      if (prior !== undefined && prior !== null && prior.kind === "local") {
        // Any conditional write invalidates an earlier linear or joined proof.
        scope.set(name, null);
      }
    }

    const assignmentChain = exhaustiveAssignmentChain(statement);
    const chainName = assignmentChain?.branches[0]?.name;
    const chainPrior = chainName === undefined ? undefined : scope.get(chainName);
    if (
      assignmentChain !== null &&
      chainName !== undefined &&
      chainPrior !== undefined &&
      chainPrior !== null &&
      chainPrior.kind === "unassigned-local"
    ) {
      scope.set(chainName, {
        kind: "local",
        name: chainPrior.name,
        type: chainPrior.type,
        declarationRange: chainPrior.declarationRange,
        scopeRange: chainPrior.scopeRange,
        assignmentChain
      });
      return;
    }

    const children = directChildren(statement);
    const condition = children.find((child) => child.name === "ParenthesizedExpression");
    const branches = children.filter((child) => child.name === "Block");
    const elseTokens = children.filter((child) => child.name === "else");
    const thenBranch = branches[0];
    const elseBranch = branches[1];
    if (
      condition === undefined ||
      containsJavaNode(condition, "AssignmentExpression") ||
      branches.length !== 2 ||
      thenBranch === undefined ||
      elseBranch === undefined ||
      elseTokens.length !== 1
    ) {
      return;
    }
    const thenAssignment = exhaustiveBranchAssignment(thenBranch, "then");
    const elseAssignment = exhaustiveBranchAssignment(elseBranch, "else");
    if (
      thenAssignment === null ||
      elseAssignment === null ||
      thenAssignment.name !== elseAssignment.name
    ) {
      return;
    }
    const prior = scope.get(thenAssignment.name);
    if (prior === undefined || prior === null || prior.kind !== "unassigned-local") {
      return;
    }
    scope.set(thenAssignment.name, {
      kind: "local",
      name: prior.name,
      type: prior.type,
      declarationRange: prior.declarationRange,
      scopeRange: prior.scopeRange,
      assignmentJoin: {
        statementRange: rangeFor(lineStarts, statement.from, statement.to),
        conditionRange: rangeFor(lineStarts, condition.from, condition.to),
        branches: [thenAssignment, elseAssignment]
      }
    });
  }

  function positiveInstanceofPatternBinding(
    statement: JavaSyntaxNode
  ):
    | {
        readonly condition: JavaSyntaxNode;
        readonly body: JavaSyntaxNode;
        readonly name: string;
        readonly binding: ReceiverBinding;
      }
    | null {
    const children = directChildren(statement);
    const condition = children[1];
    const body = children[2];
    if (
      children[0]?.name !== "if" ||
      condition?.name !== "ParenthesizedExpression" ||
      body?.name !== "Block" ||
      containsJavaNode(condition, "AssignmentExpression")
    ) {
      return null;
    }
    const conditionChildren = directChildren(condition);
    const pattern = conditionChildren[1];
    if (
      conditionChildren.length !== 3 ||
      conditionChildren[0]?.name !== "(" ||
      pattern?.name !== "InstanceofExpression" ||
      conditionChildren[2]?.name !== ")"
    ) {
      return null;
    }
    const patternChildren = directChildren(pattern);
    const testedValue = patternChildren[0];
    const typeNode = patternChildren[2];
    const definition = patternChildren[3];
    if (
      patternChildren.length !== 4 ||
      testedValue === undefined ||
      patternChildren[1]?.name !== "instanceof" ||
      typeNode === undefined ||
      !isJavaDirectTypeName(typeNode) ||
      definition === undefined ||
      !definition.type.isError
    ) {
      return null;
    }
    const name = identifierText(input.extraction, definition);
    const type = staticJavaCallTypeReference(input.extraction, typeNode, input.imports, "declaration");
    if (name === null || type === null || visibleBinding(name) !== undefined) {
      return null;
    }
    const scopeRange = rangeFor(lineStarts, body.from, body.to);
    return {
      condition,
      body,
      name,
      binding: {
        kind: "instanceof-pattern",
        name,
        type,
        declarationRange: rangeFor(lineStarts, definition.from, definition.to),
        scopeRange,
        conditionRange: rangeFor(lineStarts, condition.from, condition.to),
        testedValueRange: rangeFor(lineStarts, testedValue.from, testedValue.to)
      }
    };
  }

  function visitIfStatementContents(statement: JavaSyntaxNode): void {
    const pattern = positiveInstanceofPatternBinding(statement);
    if (pattern === null) {
      visit(statement);
      return;
    }
    visit(pattern.condition);
    visitWithScopedBindings(pattern.body, [{ name: pattern.name, binding: pattern.binding }]);
    for (const child of directChildren(statement)) {
      if (
        !(
          child.name === pattern.condition.name &&
          child.from === pattern.condition.from &&
          child.to === pattern.condition.to
        ) &&
        !(
          child.name === pattern.body.name &&
          child.from === pattern.body.from &&
          child.to === pattern.body.to
        ) &&
        child.name !== "if" &&
        child.name !== "else"
      ) {
        visit(child);
      }
    }
  }

  function exhaustiveSwitchAssignmentJoin(
    statement: JavaSyntaxNode
  ): ExhaustiveSwitchAssignmentJoinBinding | null {
    const children = directChildren(statement);
    const selector = children[1];
    const block = children[2];
    if (
      children.length !== 3 ||
      children[0]?.name !== "switch" ||
      selector?.name !== "ParenthesizedExpression" ||
      containsJavaNode(selector, "AssignmentExpression") ||
      block?.name !== "SwitchBlock"
    ) {
      return null;
    }
    const rules = directChildren(block).filter((child) => child.name !== "{" && child.name !== "}");
    if (
      rules.length < 4 ||
      rules.length % 2 !== 0 ||
      rules.length / 2 > JAVA_EXHAUSTIVE_SWITCH_JOIN_MAXIMUM_ARMS
    ) {
      return null;
    }
    const arms: ExhaustiveSwitchAssignmentArmBinding[] = [];
    for (let index = 0; index < rules.length; index += 2) {
      const label = rules[index];
      const body = rules[index + 1];
      if (label?.name !== "SwitchLabel" || body?.name !== "ExpressionStatement") {
        return null;
      }
      const labelChildren = directChildren(label);
      const arm = labelChildren[0]?.name;
      const labelText = nodeText(input.extraction, label);
      const isCaseRule =
        arm === "case" &&
        labelChildren.length === 3 &&
        /^case\s+[^,\s]+\s*->\s*$/u.test(labelText);
      const isDefaultRule =
        arm === "default" &&
        labelChildren.filter((child) => nodeText(input.extraction, child) === "->").length === 1 &&
        /^default\s*->\s*$/u.test(labelText);
      if (!isCaseRule && !isDefaultRule) {
        return null;
      }
      const assignment = directObjectCreationAssignment(body);
      if (assignment === null) {
        return null;
      }
      arms.push({
        ordinal: arms.length,
        arm: isDefaultRule ? "default" : "case",
        name: assignment.name,
        labelRange: rangeFor(lineStarts, label.from, label.to),
        type: assignment.type,
        assignmentRange: assignment.assignmentRange,
        initializerRange: assignment.initializerRange
      });
    }
    if (
      arms.length < 2 ||
      arms.length > JAVA_EXHAUSTIVE_SWITCH_JOIN_MAXIMUM_ARMS ||
      arms.at(-1)?.arm !== "default" ||
      arms.filter((arm) => arm.arm === "default").length !== 1 ||
      new Set(arms.map((arm) => arm.name)).size !== 1
    ) {
      return null;
    }
    return {
      statementRange: rangeFor(lineStarts, statement.from, statement.to),
      selectorRange: rangeFor(lineStarts, selector.from, selector.to),
      arms
    };
  }

  function visitExhaustiveSwitchAssignment(statement: JavaSyntaxNode, scope: BindingScope): void {
    // Calls in the selector and arms observe the pre-join state.
    visit(statement);

    const assignedNames = assignedIdentifierNames(statement);
    for (const name of assignedNames) {
      const prior = scope.get(name);
      if (prior !== undefined && prior !== null && prior.kind === "local") {
        scope.set(name, null);
      }
    }

    const assignmentJoin = exhaustiveSwitchAssignmentJoin(statement);
    const name = assignmentJoin?.arms[0]?.name;
    const prior = name === undefined ? undefined : scope.get(name);
    if (
      assignmentJoin === null ||
      name === undefined ||
      prior === undefined ||
      prior === null ||
      prior.kind !== "unassigned-local"
    ) {
      return;
    }
    scope.set(name, {
      kind: "local",
      name: prior.name,
      type: prior.type,
      declarationRange: prior.declarationRange,
      scopeRange: prior.scopeRange,
      switchAssignmentJoin: assignmentJoin
    });
  }

  function scopedBinding(input_: {
    readonly declaration: JavaSyntaxNode;
    readonly typeNodes: readonly JavaSyntaxNode[];
    readonly kind: "enhanced-for" | "catch" | "lambda";
    readonly scopeRange: SourceRange;
  }): { readonly name: string; readonly binding: ReceiverBinding | null } | null {
    const definitions = directChildren(input_.declaration).filter(
      (candidate) => candidate.name === "Definition"
    );
    const definition = definitions[0];
    const name = definition === undefined ? null : identifierText(input.extraction, definition);
    if (definitions.length !== 1 || definition === undefined || name === null) {
      return null;
    }
    const type =
      input_.typeNodes.length === 1 && input_.typeNodes[0] !== undefined
        ? staticJavaCallTypeReference(
            input.extraction,
            input_.typeNodes[0],
            input.imports,
            "declaration"
          )
        : null;
    return {
      name,
      binding:
        type === null
          ? null
          : {
              kind: input_.kind,
              name,
              type,
              declarationRange: rangeFor(lineStarts, definition.from, definition.to),
              scopeRange: input_.scopeRange
            }
    };
  }

  function visitWithScopedBindings(
    scopedBody: JavaSyntaxNode,
    bindings: readonly { readonly name: string; readonly binding: ReceiverBinding | null }[]
  ): void {
    const scope: BindingScope = new Map();
    for (const entry of bindings) {
      scope.set(entry.name, scope.has(entry.name) ? null : entry.binding);
    }
    scopes.push(scope);
    visit(scopedBody);
    scopes.pop();
  }

  function tryResourceBinding(
    resource: JavaSyntaxNode,
    resourceOrdinal: number,
    scopeRange: SourceRange,
    tryBodyRange: SourceRange
  ): { readonly name: string; readonly binding: ReceiverBinding | null } | null {
    const children = directChildren(resource);
    const definitions = children.filter((candidate) => candidate.name === "Definition");
    const definition = definitions[0];
    const name = definition === undefined ? null : identifierText(input.extraction, definition);
    if (definitions.length !== 1 || definition === undefined || name === null) {
      return null;
    }
    const typeNodes = children.filter(isJavaDirectTypeName);
    const varTypeNodes = typeNodes.filter(
      (candidate) => nodeText(input.extraction, candidate) === "var"
    );
    const declaredTypeNodes = typeNodes.filter(
      (candidate) => nodeText(input.extraction, candidate) !== "var"
    );
    const declaredType =
      varTypeNodes.length === 0 &&
      declaredTypeNodes.length === 1 &&
      declaredTypeNodes[0] !== undefined
        ? staticJavaCallTypeReference(
            input.extraction,
            declaredTypeNodes[0],
            input.imports,
            "declaration"
          )
        : null;
    const assignments = children.filter(
      (candidate) => candidate.name === "AssignOp" && nodeText(input.extraction, candidate) === "="
    );
    const initializerCandidates = children.filter(
      (candidate) => candidate.name === "ObjectCreationExpression"
    );
    const initializer = initializerCandidates[0];
    const initializerChildren = initializer === undefined ? [] : directChildren(initializer);
    const initializerTypeNodes = initializerChildren.filter(isJavaDirectTypeName);
    const safeInitializer =
      varTypeNodes.length === 1 &&
      typeNodes.length === 1 &&
      assignments.length === 1 &&
      initializerCandidates.length === 1 &&
      initializer !== undefined &&
      initializerChildren.every(
        (candidate) => candidate.name !== "TypeArguments" && candidate.name !== "ClassBody"
      ) &&
      initializerTypeNodes.length === 1 &&
      initializerTypeNodes[0] !== undefined
        ? {
            type: staticJavaCallTypeReference(
              input.extraction,
              initializerTypeNodes[0],
              input.imports,
              "object-creation"
            ),
            range: rangeFor(lineStarts, initializer.from, initializer.to)
          }
        : null;
    const type = declaredType ?? safeInitializer?.type ?? null;
    return {
      name,
      binding:
        type === null
          ? null
          : {
              kind: "try-resource",
              name,
              type,
              declarationRange: rangeFor(lineStarts, definition.from, definition.to),
              scopeRange,
              resourceOrdinal,
              visibility: "later-resources-and-try-body",
              tryBodyRange,
              ...(declaredType === null && safeInitializer !== null
                ? { initializerRange: safeInitializer.range }
                : {})
            }
    };
  }

  function visit(node: JavaSyntaxNode): void {
    if (node.name === "TryWithResourcesStatement") {
      const children = directChildren(node);
      const specification = children.find((child) => child.name === "ResourceSpecification");
      const scopedBody = children.find((child) => child.name === "Block");
      if (specification === undefined || scopedBody === undefined) {
        return;
      }
      const tryBodyRange = rangeFor(lineStarts, scopedBody.from, scopedBody.to);
      const resourceScope: BindingScope = new Map();
      scopes.push(resourceScope);
      const resources = directChildren(specification).filter((child) => child.name === "Resource");
      for (const [resourceOrdinal, resource] of resources.entries()) {
        const entry = tryResourceBinding(
          resource,
          resourceOrdinal,
          rangeFor(lineStarts, resource.to, scopedBody.to),
          tryBodyRange
        );
        if (entry === null) {
          visit(resource);
          continue;
        }
        const duplicate = resourceScope.has(entry.name);
        // JLS 6.3 starts resource scope at its declaration. Keep the current
        // initializer fail closed instead of falling back to an outer value or field.
        resourceScope.set(entry.name, null);
        visit(resource);
        resourceScope.set(entry.name, duplicate ? null : entry.binding);
      }
      visit(scopedBody);
      scopes.pop();
      for (const child of children) {
        if (child !== specification && child !== scopedBody) {
          visit(child);
        }
      }
      return;
    }
    if (node.name === "EnhancedForStatement") {
      const children = directChildren(node);
      const specification = children.find((child) => child.name === "ForSpec");
      const scopedBody = children.at(-1);
      if (specification === undefined || scopedBody === undefined || scopedBody === specification) {
        return;
      }
      visit(specification);
      const scopeRange = rangeFor(lineStarts, scopedBody.from, scopedBody.to);
      const binding = scopedBinding({
        declaration: specification,
        typeNodes: directChildren(specification).filter(
          (child) => child.name === "PrimitiveType" || isJavaDirectTypeName(child)
        ),
        kind: "enhanced-for",
        scopeRange
      });
      visitWithScopedBindings(scopedBody, binding === null ? [] : [binding]);
      return;
    }
    if (node.name === "CatchClause") {
      const children = directChildren(node);
      const parameter = children.find((child) => child.name === "CatchFormalParameter");
      const scopedBody = children.at(-1);
      if (parameter === undefined || scopedBody === undefined || scopedBody === parameter) {
        return;
      }
      const catchTypes = directChildren(parameter).filter((child) => child.name === "CatchType");
      const typeNodes =
        catchTypes.length === 1 && catchTypes[0] !== undefined
          ? directChildren(catchTypes[0]).filter(isJavaDirectTypeName)
          : [];
      const binding = scopedBinding({
        declaration: parameter,
        typeNodes,
        kind: "catch",
        scopeRange: rangeFor(lineStarts, scopedBody.from, scopedBody.to)
      });
      visitWithScopedBindings(scopedBody, binding === null ? [] : [binding]);
      return;
    }
    if (node.name === "LambdaExpression") {
      const children = directChildren(node);
      const scopedBody = children.at(-1);
      if (scopedBody === undefined) {
        return;
      }
      const scopeRange = rangeFor(lineStarts, scopedBody.from, scopedBody.to);
      const bindings: Array<{
        readonly name: string;
        readonly binding: ReceiverBinding | null;
      }> = [];
      const formalParameters = children.find((child) => child.name === "FormalParameters");
      if (formalParameters !== undefined) {
        for (const parameter of directChildren(formalParameters).filter(
          (child) => child.name === "FormalParameter"
        )) {
          const binding = scopedBinding({
            declaration: parameter,
            typeNodes: directChildren(parameter).filter(
              (child) => child.name === "PrimitiveType" || isJavaDirectTypeName(child)
            ),
            kind: "lambda",
            scopeRange
          });
          if (binding !== null) {
            bindings.push(binding);
          }
        }
      } else {
        const inferredParameters = children.find((child) => child.name === "InferredParameters");
        const definitions =
          inferredParameters === undefined
            ? children.filter((child) => child.name === "Definition")
            : directChildren(inferredParameters).filter((child) => child.name === "Definition");
        for (const definition of definitions) {
          const name = identifierText(input.extraction, definition);
          if (name !== null) {
            bindings.push({ name, binding: null });
          }
        }
      }
      visitWithScopedBindings(scopedBody, bindings);
      return;
    }
    if (node !== body && NESTED_JAVA_CALLABLE_SCOPES.has(node.name)) {
      return;
    }
    if (node.name === "Block" || node.name === "ConstructorBody") {
      const scope: BindingScope = new Map();
      const scopeRange = rangeFor(lineStarts, node.from, node.to);
      scopes.push(scope);
      for (const child of directChildren(node)) {
        if (child.name === "LocalVariableDeclaration") {
          addLocalDeclaration(child, scope, scopeRange);
        } else if (child.name === "ExpressionStatement") {
          visitDirectSameBlockAssignment(child, scope);
        } else if (child.name === "IfStatement") {
          visitExhaustiveIfElseAssignment(child, scope);
        } else if (child.name === "SwitchStatement") {
          visitExhaustiveSwitchAssignment(child, scope);
        } else {
          visit(child);
        }
      }
      scopes.pop();
      return;
    }
    if (node.name === "MethodInvocation") {
      const methodNode = directChildren(node).find((child) => child.name === "MethodName");
      if (methodNode !== undefined) {
        const receiverPrefix = input.extraction.sourceText.slice(node.from, methodNode.from);
        const explicitFieldName = receiverPrefix.match(
          /^\s*this\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*$/u
        )?.[1];
        const explicitSuperFieldName = receiverPrefix.match(
          /^\s*super\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*$/u
        )?.[1];
        const qualifier = receiverPrefix.match(/^\s*(this|super)\s*\.\s*$/u)?.[1] as
          | "this"
          | "super"
          | undefined;
        const receiverName = receiverPrefix.match(
          /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*$/u
        )?.[1];
        const typeFieldMatch = receiverPrefix.match(
          /^\s*([A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)*)\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*$/u
        );
        const rawOwnerType = typeFieldMatch?.[1];
        const typeFieldName = typeFieldMatch?.[2];
        const ownerTypePath = rawOwnerType?.replace(/\s*\.\s*/gu, ".").trim();
        const ownerTypeSegments = ownerTypePath?.split(".") ?? [];
        const ownerTypeName = ownerTypeSegments.at(-1);
        const ownerTypeRootName = ownerTypeSegments[0];
        const methodName = identifierText(input.extraction, methodNode);
        const arguments_ = staticJavaArguments(node);
        if (
          receiverPrefix.trim().length === 0 &&
          methodName !== null &&
          arguments_ !== null &&
          !hasCompetingStaticImport(methodName)
        ) {
          references.push({
            sourceId: input.callableSymbol.id,
            declaringTypeId: input.declaringType.id,
            filePath: input.extraction.filePath,
            receiverKind:
              "isStatic" in input.callable && input.callable.isStatic
                ? "implicit-static"
                : "implicit-instance",
            methodName,
            argumentCount: arguments_.length,
            argumentTypes: arguments_.map((argument) =>
              staticJavaArgumentType(input.extraction, argument, input.imports)
            ),
            range: rangeFor(lineStarts, methodNode.from, methodNode.to)
          });
        } else if (explicitFieldName !== undefined && methodName !== null && arguments_ !== null) {
          references.push({
            sourceId: input.callableSymbol.id,
            declaringTypeId: input.declaringType.id,
            filePath: input.extraction.filePath,
            receiverKind: "this-field",
            receiverName: explicitFieldName,
            methodName,
            argumentCount: arguments_.length,
            argumentTypes: arguments_.map((argument) =>
              staticJavaArgumentType(input.extraction, argument, input.imports)
            ),
            range: rangeFor(lineStarts, methodNode.from, methodNode.to)
          });
        } else if (
          explicitSuperFieldName !== undefined &&
          methodName !== null &&
          arguments_ !== null
        ) {
          references.push({
            sourceId: input.callableSymbol.id,
            declaringTypeId: input.declaringType.id,
            filePath: input.extraction.filePath,
            receiverKind: "super-field",
            receiverName: explicitSuperFieldName,
            methodName,
            argumentCount: arguments_.length,
            argumentTypes: arguments_.map((argument) =>
              staticJavaArgumentType(input.extraction, argument, input.imports)
            ),
            range: rangeFor(lineStarts, methodNode.from, methodNode.to)
          });
        } else if (qualifier !== undefined && methodName !== null && arguments_ !== null) {
          references.push({
            sourceId: input.callableSymbol.id,
            declaringTypeId: input.declaringType.id,
            filePath: input.extraction.filePath,
            receiverKind: qualifier,
            methodName,
            argumentCount: arguments_.length,
            argumentTypes: arguments_.map((argument) =>
              staticJavaArgumentType(input.extraction, argument, input.imports)
            ),
              range: rangeFor(lineStarts, methodNode.from, methodNode.to)
            });
        } else if (
          rawOwnerType !== undefined &&
          typeFieldName !== undefined &&
          ownerTypePath !== undefined &&
          ownerTypeName !== undefined &&
          ownerTypeRootName !== undefined &&
          ownerTypeRootName !== "this" &&
          ownerTypeRootName !== "super" &&
          visibleBinding(ownerTypeRootName) === undefined &&
          methodName !== null &&
          arguments_ !== null
        ) {
          const ownerTypeStart = node.from + receiverPrefix.indexOf(rawOwnerType);
          const importedTypePath =
            ownerTypeSegments.length === 1 ? input.imports.get(ownerTypeName) : undefined;
          references.push({
            sourceId: input.callableSymbol.id,
            declaringTypeId: input.declaringType.id,
            filePath: input.extraction.filePath,
            receiverKind: "type-field",
            receiverName: typeFieldName,
            receiverOwnerType: {
              kind: "reference",
              referenceName: ownerTypeName,
              syntax: "type-qualifier",
              range: rangeFor(lineStarts, ownerTypeStart, ownerTypeStart + rawOwnerType.length),
              ...(importedTypePath === undefined ? {} : { importedTypePath }),
              ...(ownerTypeSegments.length === 1
                ? {}
                : { qualifiedTypePath: ownerTypePath })
            },
            receiverQualifierRootName: ownerTypeRootName,
            methodName,
            argumentCount: arguments_.length,
            argumentTypes: arguments_.map((argument) =>
              staticJavaArgumentType(input.extraction, argument, input.imports)
            ),
            range: rangeFor(lineStarts, methodNode.from, methodNode.to)
          });
        } else if (receiverName !== undefined && methodName !== null && arguments_ !== null) {
          const binding = visibleBindingAt(receiverName, node.from);
          if (binding !== null && binding !== undefined) {
            const argumentTypes = arguments_.map((argument) =>
              staticJavaArgumentType(input.extraction, argument, input.imports)
            );
            if (binding.kind === "try-resource") {
              references.push({
                sourceId: input.callableSymbol.id,
                declaringTypeId: input.declaringType.id,
                filePath: input.extraction.filePath,
                receiverKind: binding.kind,
                receiverName,
                receiverType: binding.type,
                receiverBindingRange: binding.declarationRange,
                receiverScopeRange: binding.scopeRange,
                ...(binding.initializerRange === undefined
                  ? {}
                  : { receiverInitializerRange: binding.initializerRange }),
                receiverResourceOrdinal: binding.resourceOrdinal,
                receiverTryBodyRange: binding.tryBodyRange,
                methodName,
                argumentCount: arguments_.length,
                argumentTypes,
                range: rangeFor(lineStarts, methodNode.from, methodNode.to)
              });
            } else if (binding.kind === "instanceof-pattern") {
              references.push({
                sourceId: input.callableSymbol.id,
                declaringTypeId: input.declaringType.id,
                filePath: input.extraction.filePath,
                receiverKind: binding.kind,
                receiverName,
                receiverType: binding.type,
                receiverBindingRange: binding.declarationRange,
                receiverScopeRange: binding.scopeRange,
                receiverConditionRange: binding.conditionRange,
                receiverTestedValueRange: binding.testedValueRange,
                methodName,
                argumentCount: arguments_.length,
                argumentTypes,
                range: rangeFor(lineStarts, methodNode.from, methodNode.to)
              });
            } else if (binding.kind === "instanceof-and-pattern") {
              references.push({
                sourceId: input.callableSymbol.id,
                declaringTypeId: input.declaringType.id,
                filePath: input.extraction.filePath,
                receiverKind: binding.kind,
                receiverName,
                receiverType: binding.type,
                receiverBindingRange: binding.declarationRange,
                receiverScopeRange: binding.scopeRange,
                receiverConditionRange: binding.conditionRange,
                receiverTestedValueRange: binding.testedValueRange,
                receiverRightOperandRange: binding.rightOperandRange,
                receiverTrueBlockRange: binding.trueBlockRange,
                methodName,
                argumentCount: arguments_.length,
                argumentTypes,
                range: rangeFor(lineStarts, methodNode.from, methodNode.to)
              });
            } else if (binding.kind === "instanceof-and-chain-pattern") {
              references.push({
                sourceId: input.callableSymbol.id,
                declaringTypeId: input.declaringType.id,
                filePath: input.extraction.filePath,
                receiverKind: binding.kind,
                receiverName,
                receiverType: binding.type,
                receiverBindingRange: binding.declarationRange,
                receiverScopeRange: binding.scopeRange,
                receiverConditionRange: binding.conditionRange,
                receiverTestedValueRange: binding.testedValueRange,
                receiverLogicalOperandRanges: binding.logicalOperandRanges,
                receiverActiveOperandRange: binding.activeOperandRange,
                receiverActiveOperandOrdinal: binding.activeOperandOrdinal,
                receiverTrueBlockRange: binding.trueBlockRange,
                receiverOperandCount: binding.operandCount,
                receiverMaximumOperands: binding.maximumOperands,
                methodName,
                argumentCount: arguments_.length,
                argumentTypes,
                range: rangeFor(lineStarts, methodNode.from, methodNode.to)
              });
            } else if (binding.kind === "instanceof-grouped-and-pattern") {
              references.push({
                sourceId: input.callableSymbol.id,
                declaringTypeId: input.declaringType.id,
                filePath: input.extraction.filePath,
                receiverKind: binding.kind,
                receiverName,
                receiverType: binding.type,
                receiverBindingRange: binding.declarationRange,
                receiverScopeRange: binding.scopeRange,
                receiverConditionRange: binding.conditionRange,
                receiverTestedValueRange: binding.testedValueRange,
                receiverLogicalOperandRanges: binding.logicalOperandRanges,
                receiverLogicalOperandGroupingPaths: binding.logicalOperandGroupingPaths,
                receiverGroupingRanges: binding.groupingRanges,
                receiverActiveOperandRange: binding.activeOperandRange,
                receiverActiveOperandOrdinal: binding.activeOperandOrdinal,
                receiverTrueBlockRange: binding.trueBlockRange,
                receiverOperandCount: binding.operandCount,
                receiverMaximumOperands: binding.maximumOperands,
                methodName,
                argumentCount: arguments_.length,
                argumentTypes,
                range: rangeFor(lineStarts, methodNode.from, methodNode.to)
              });
            } else if (binding.kind === "instanceof-negated-early-exit-pattern") {
              references.push({
                sourceId: input.callableSymbol.id,
                declaringTypeId: input.declaringType.id,
                filePath: input.extraction.filePath,
                receiverKind: binding.kind,
                receiverName,
                receiverType: binding.type,
                receiverBindingRange: binding.declarationRange,
                receiverScopeRange: binding.scopeRange,
                receiverConditionRange: binding.conditionRange,
                receiverTestedValueRange: binding.testedValueRange,
                receiverNegatedPatternRange: binding.negatedPatternRange,
                receiverNegationGroupingRanges: binding.negationGroupingRanges,
                receiverMaximumGroupingDepth: binding.maximumGroupingDepth,
                receiverGuardStatementRange: binding.guardStatementRange,
                receiverExitBodyKind: binding.exitBodyKind,
                receiverExitBodyRange: binding.exitBodyRange,
                receiverAbruptCompletionKind: binding.abruptCompletionKind,
                receiverAbruptStatementRange: binding.abruptStatementRange,
                receiverAbruptWrapperKind: binding.abruptWrapperKind,
                receiverAbruptWrapperRange: binding.abruptWrapperRange,
                receiverAbruptWrapperTryBodyRange: binding.abruptWrapperTryBodyRange,
                receiverAbruptWrapperFinallyRange: binding.abruptWrapperFinallyRange,
                receiverAbruptWrapperFinallyBodyRange: binding.abruptWrapperFinallyBodyRange,
                receiverAbruptWrapperFinallyStatementRanges:
                  binding.abruptWrapperFinallyStatementRanges,
                receiverAbruptWrapperMaximumFinallyStatements:
                  binding.abruptWrapperMaximumFinallyStatements,
                methodName,
                argumentCount: arguments_.length,
                argumentTypes,
                range: rangeFor(lineStarts, methodNode.from, methodNode.to)
              });
            } else if (binding.kind === "instanceof-negated-target-exit-pattern") {
              references.push({
                sourceId: input.callableSymbol.id,
                declaringTypeId: input.declaringType.id,
                filePath: input.extraction.filePath,
                receiverKind: binding.kind,
                receiverName,
                receiverType: binding.type,
                receiverBindingRange: binding.declarationRange,
                receiverScopeRange: binding.scopeRange,
                receiverConditionRange: binding.conditionRange,
                receiverTestedValueRange: binding.testedValueRange,
                receiverNegatedPatternRange: binding.negatedPatternRange,
                receiverNegationGroupingRanges: binding.negationGroupingRanges,
                receiverMaximumGroupingDepth: binding.maximumGroupingDepth,
                receiverGuardStatementRange: binding.guardStatementRange,
                receiverExitBodyKind: binding.exitBodyKind,
                receiverExitBodyRange: binding.exitBodyRange,
                receiverAbruptCompletionKind: binding.abruptCompletionKind,
                receiverAbruptStatementRange: binding.abruptStatementRange,
                receiverAbruptWrapperKind: binding.abruptWrapperKind,
                receiverAbruptWrapperRange: binding.abruptWrapperRange,
                receiverAbruptWrapperTryBodyRange: binding.abruptWrapperTryBodyRange,
                receiverAbruptWrapperFinallyRange: binding.abruptWrapperFinallyRange,
                receiverAbruptWrapperFinallyBodyRange: binding.abruptWrapperFinallyBodyRange,
                receiverAbruptWrapperFinallyStatementRanges:
                  binding.abruptWrapperFinallyStatementRanges,
                receiverAbruptWrapperMaximumFinallyStatements:
                  binding.abruptWrapperMaximumFinallyStatements,
                receiverAbruptTargetKind: binding.abruptTargetKind,
                receiverAbruptTargetRange: binding.abruptTargetRange,
                receiverAbruptTargetBodyRange: binding.abruptTargetBodyRange,
                receiverAbruptTargetCaseGroupRange: binding.abruptTargetCaseGroupRange,
                receiverAbruptTargetCaseLabelRanges: binding.abruptTargetCaseLabelRanges,
                receiverAbruptTargetRuleRange: binding.abruptTargetRuleRange,
                receiverAbruptTargetRuleBodyRange: binding.abruptTargetRuleBodyRange,
                receiverAbruptTargetRuleLabelRange: binding.abruptTargetRuleLabelRange,
                receiverAbruptTargetExpressionContext: binding.abruptTargetExpressionContext,
                receiverAbruptTargetLabel: binding.abruptTargetLabel,
                receiverAbruptTargetLabelRange: binding.abruptTargetLabelRange,
                methodName,
                argumentCount: arguments_.length,
                argumentTypes,
                range: rangeFor(lineStarts, methodNode.from, methodNode.to)
              });
            } else if (binding.kind === "instanceof-negated-else-pattern") {
              references.push({
                sourceId: input.callableSymbol.id,
                declaringTypeId: input.declaringType.id,
                filePath: input.extraction.filePath,
                receiverKind: binding.kind,
                receiverName,
                receiverType: binding.type,
                receiverBindingRange: binding.declarationRange,
                receiverScopeRange: binding.scopeRange,
                receiverConditionRange: binding.conditionRange,
                receiverTestedValueRange: binding.testedValueRange,
                receiverNegatedPatternRange: binding.negatedPatternRange,
                receiverNegationGroupingRanges: binding.negationGroupingRanges,
                receiverMaximumGroupingDepth: binding.maximumGroupingDepth,
                receiverGuardStatementRange: binding.guardStatementRange,
                receiverThenBodyKind: binding.thenBodyKind,
                receiverThenBodyRange: binding.thenBodyRange,
                receiverThenAbruptCompletionKind: binding.thenAbruptCompletionKind,
                receiverThenAbruptStatementRange: binding.thenAbruptStatementRange,
                receiverThenAbruptWrapperKind: binding.thenAbruptWrapperKind,
                receiverThenAbruptWrapperRange: binding.thenAbruptWrapperRange,
                receiverThenAbruptWrapperTryBodyRange: binding.thenAbruptWrapperTryBodyRange,
                receiverThenAbruptWrapperFinallyRange: binding.thenAbruptWrapperFinallyRange,
                receiverThenAbruptWrapperFinallyBodyRange:
                  binding.thenAbruptWrapperFinallyBodyRange,
                receiverThenAbruptWrapperFinallyStatementRanges:
                  binding.thenAbruptWrapperFinallyStatementRanges,
                receiverThenAbruptWrapperMaximumFinallyStatements:
                  binding.thenAbruptWrapperMaximumFinallyStatements,
                receiverThenAbruptTargetKind: binding.thenAbruptTargetKind,
                receiverThenAbruptTargetRange: binding.thenAbruptTargetRange,
                receiverThenAbruptTargetBodyRange: binding.thenAbruptTargetBodyRange,
                receiverThenAbruptTargetCaseGroupRange: binding.thenAbruptTargetCaseGroupRange,
                receiverThenAbruptTargetCaseLabelRanges: binding.thenAbruptTargetCaseLabelRanges,
                receiverThenAbruptTargetRuleRange: binding.thenAbruptTargetRuleRange,
                receiverThenAbruptTargetRuleBodyRange: binding.thenAbruptTargetRuleBodyRange,
                receiverThenAbruptTargetRuleLabelRange: binding.thenAbruptTargetRuleLabelRange,
                receiverThenAbruptTargetExpressionContext:
                  binding.thenAbruptTargetExpressionContext,
                receiverThenAbruptTargetLabel: binding.thenAbruptTargetLabel,
                receiverThenAbruptTargetLabelRange: binding.thenAbruptTargetLabelRange,
                receiverElseBodyKind: binding.elseBodyKind,
                receiverElseBodyRange: binding.elseBodyRange,
                receiverActiveRegion: binding.activeRegion,
                methodName,
                argumentCount: arguments_.length,
                argumentTypes,
                range: rangeFor(lineStarts, methodNode.from, methodNode.to)
              });
            } else {
              references.push({
                sourceId: input.callableSymbol.id,
                declaringTypeId: input.declaringType.id,
                filePath: input.extraction.filePath,
                receiverKind: binding.kind,
                receiverName,
                receiverType: binding.type,
                receiverBindingRange: binding.declarationRange,
                receiverScopeRange: binding.scopeRange,
                ...(binding.initializerRange === undefined
                  ? {}
                  : { receiverInitializerRange: binding.initializerRange }),
                ...(binding.kind !== "local" || binding.directAssignment === undefined
                  ? {}
                  : {
                      receiverAssignmentType: binding.directAssignment.type,
                      receiverAssignmentRange: binding.directAssignment.assignmentRange,
                      receiverAssignmentInitializerRange:
                        binding.directAssignment.initializerRange
                    }),
                ...(binding.kind !== "local" || binding.assignmentJoin === undefined
                  ? {}
                  : {
                      receiverAssignmentJoin: {
                        statementRange: binding.assignmentJoin.statementRange,
                        conditionRange: binding.assignmentJoin.conditionRange,
                        branches: [
                          {
                            branch: "then",
                            scopeRange: binding.assignmentJoin.branches[0].scopeRange,
                            type: binding.assignmentJoin.branches[0].type,
                            assignmentRange:
                              binding.assignmentJoin.branches[0].assignmentRange,
                            initializerRange:
                              binding.assignmentJoin.branches[0].initializerRange
                          },
                          {
                            branch: "else",
                            scopeRange: binding.assignmentJoin.branches[1].scopeRange,
                            type: binding.assignmentJoin.branches[1].type,
                            assignmentRange:
                              binding.assignmentJoin.branches[1].assignmentRange,
                            initializerRange:
                              binding.assignmentJoin.branches[1].initializerRange
                          }
                        ]
                      }
                    }),
                ...(binding.kind !== "local" || binding.assignmentChain === undefined
                  ? {}
                  : {
                      receiverAssignmentChain: {
                        statementRange: binding.assignmentChain.statementRange,
                        bounds: {
                          maximumBranches:
                            JAVA_EXHAUSTIVE_ASSIGNMENT_JOIN_MAXIMUM_BRANCHES,
                          observedBranches: binding.assignmentChain.branches.length
                        },
                        branches: binding.assignmentChain.branches.map((branch) => ({
                          ordinal: branch.ordinal,
                          branch: branch.branch,
                          statementRange: branch.statementRange,
                          ...(branch.conditionRange === undefined
                            ? {}
                            : { conditionRange: branch.conditionRange }),
                          scopeRange: branch.scopeRange,
                          type: branch.type,
                          assignmentRange: branch.assignmentRange,
                          initializerRange: branch.initializerRange
                        }))
                      }
                    }),
                ...(binding.kind !== "local" || binding.switchAssignmentJoin === undefined
                  ? {}
                  : {
                      receiverSwitchAssignmentJoin: {
                        statementRange: binding.switchAssignmentJoin.statementRange,
                        selectorRange: binding.switchAssignmentJoin.selectorRange,
                        bounds: {
                          maximumArms: JAVA_EXHAUSTIVE_SWITCH_JOIN_MAXIMUM_ARMS,
                          observedArms: binding.switchAssignmentJoin.arms.length
                        },
                        arms: binding.switchAssignmentJoin.arms.map((arm) => ({
                          ordinal: arm.ordinal,
                          arm: arm.arm,
                          labelRange: arm.labelRange,
                          type: arm.type,
                          assignmentRange: arm.assignmentRange,
                          initializerRange: arm.initializerRange
                        }))
                      }
                    }),
                methodName,
                argumentCount: arguments_.length,
                argumentTypes,
                range: rangeFor(lineStarts, methodNode.from, methodNode.to)
              });
            }
          } else if (
            binding === undefined &&
            !input.declaredFieldNames.has(receiverName) &&
            !input.shadowedTypeNames.has(receiverName) &&
            input.imports.has(receiverName)
          ) {
            const receiverStart = node.from + receiverPrefix.indexOf(receiverName);
            references.push({
              sourceId: input.callableSymbol.id,
              declaringTypeId: input.declaringType.id,
              filePath: input.extraction.filePath,
              receiverKind: "type-name-static",
              receiverName,
              receiverType: {
                kind: "reference",
                referenceName: receiverName,
                syntax: "type-qualifier",
                range: rangeFor(
                  lineStarts,
                  receiverStart,
                  receiverStart + receiverName.length
                ),
                importedTypePath: input.imports.get(receiverName)!
              },
              methodName,
              argumentCount: arguments_.length,
              argumentTypes: arguments_.map((argument) =>
                staticJavaArgumentType(input.extraction, argument, input.imports)
              ),
              range: rangeFor(lineStarts, methodNode.from, methodNode.to)
            });
            references.push({
              sourceId: input.callableSymbol.id,
              declaringTypeId: input.declaringType.id,
              filePath: input.extraction.filePath,
              receiverKind: "field",
              receiverName,
              methodName,
              argumentCount: arguments_.length,
              argumentTypes: arguments_.map((argument) =>
                staticJavaArgumentType(input.extraction, argument, input.imports)
              ),
              range: rangeFor(lineStarts, methodNode.from, methodNode.to)
            });
          } else if (binding === undefined) {
            references.push({
              sourceId: input.callableSymbol.id,
              declaringTypeId: input.declaringType.id,
              filePath: input.extraction.filePath,
              receiverKind: "field",
              receiverName,
              methodName,
              argumentCount: arguments_.length,
              argumentTypes: arguments_.map((argument) =>
                staticJavaArgumentType(input.extraction, argument, input.imports)
              ),
              range: rangeFor(lineStarts, methodNode.from, methodNode.to)
            });
          }
        }
      }
    }
    for (const child of directChildren(node)) {
      visit(child);
    }
  }

  visit(body);
  return references;
}

function staticJavaFieldDeclarations(input: {
  readonly extraction: JavaExtractFileFactsInput;
  readonly declaration: StaticJavaType;
  readonly declaringType: SymbolNode;
  readonly imports: ReadonlyMap<string, string>;
}): readonly JavaFieldDeclarationFact[] {
  const lineStarts = lineStartsFor(input.extraction.sourceText);
  const scopeRange = rangeFor(
    lineStarts,
    input.declaration.node.from,
    input.declaration.node.to
  );
  const fields: JavaFieldDeclarationFact[] = [];
  for (const field of directChildren(input.declaration.body)) {
    const isInterfaceConstant =
      input.declaration.kind === "interface" && field.name === "ConstantDeclaration";
    if (!isInterfaceConstant && field.name !== "FieldDeclaration") {
      continue;
    }
    const children = directChildren(field);
    const modifiers = children.find((child) => child.name === "Modifiers");
    const typeNodes = children.filter(
      (child) => child.name === "PrimitiveType" || isJavaDirectTypeName(child)
    );
    const type =
      typeNodes.length === 1 && typeNodes[0] !== undefined
        ? staticJavaCallTypeReference(input.extraction, typeNodes[0], input.imports, "declaration")
        : null;
    const modifierNames = new Set(
      modifiers === undefined ? [] : directChildren(modifiers).map((child) => child.name)
    );
    const isStatic = isInterfaceConstant || modifierNames.has("static");
    const isFinal = isInterfaceConstant || modifierNames.has("final");
    const visibility = isInterfaceConstant ? "public" : staticJavaVisibility(modifiers, false);
    for (const declarator of children.filter((child) => child.name === "VariableDeclarator")) {
      const definitions = directChildren(declarator).filter((child) => child.name === "Definition");
      const definition = definitions[0];
      const name = definition === undefined ? null : identifierText(input.extraction, definition);
      if (definitions.length !== 1 || definition === undefined || name === null) {
        continue;
      }
      fields.push({
        declaringTypeId: input.declaringType.id,
        name,
        declarationKind: isInterfaceConstant ? "interface-constant" : "class-field",
        type,
        isStatic,
        isFinal,
        visibility,
        modifierProof: isInterfaceConstant ? "interface-implicit" : "declared",
        declarationRange: rangeFor(lineStarts, definition.from, definition.to),
        scopeRange
      });
    }
  }
  return fields;
}

function staticJavaTypeParameterNames(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const parameters of directChildren(node).filter((child) => child.name === "TypeParameters")) {
    for (const parameter of directChildren(parameters).filter((child) => child.name === "TypeParameter")) {
      const definition = directChildren(parameter).find((child) => child.name === "Definition");
      const name = definition === undefined ? null : identifierText(input, definition);
      if (name !== null) {
        names.add(name);
      }
    }
  }
  return names;
}

function staticJavaSignatureTypeReferences(
  input: JavaExtractFileFactsInput,
  node: JavaSyntaxNode,
  excludedNames: ReadonlySet<string>,
  isTopLevelType: boolean = true
): readonly (StaticJavaSuperclassReference & { readonly isTopLevelType: boolean })[] {
  if (node.name === "TypeName" || node.name === "ScopedTypeName") {
    const reference = staticJavaDirectTypeReference(input, node);
    return reference === null || excludedNames.has(reference.name)
      ? []
      : [{ ...reference, isTopLevelType }];
  }
  if (node.name === "GenericType") {
    return directChildren(node).flatMap((child) =>
      staticJavaSignatureTypeReferences(
        input,
        child,
        excludedNames,
        child.name === "TypeArguments" ? false : isTopLevelType
      )
    );
  }
  return directChildren(node).flatMap((child) =>
    staticJavaSignatureTypeReferences(input, child, excludedNames, false)
  );
}

function staticJavaCallableSignatureReferences(input: {
  readonly extraction: JavaExtractFileFactsInput;
  readonly callable: StaticJavaMethod | StaticJavaConstructor;
  readonly callableSymbol: SymbolNode;
  readonly declaringType: SymbolNode;
  readonly enclosingTypeParameters: ReadonlySet<string>;
  readonly imports: ReadonlyMap<string, string>;
}): readonly JvmCallableSignatureReferenceFact[] {
  const excludedNames = new Set([
    ...input.enclosingTypeParameters,
    ...staticJavaTypeParameterNames(input.extraction, input.callable.node)
  ]);
  const facts: JvmCallableSignatureReferenceFact[] = [];
  const addReferences = (
    relationKind: "accepts" | "returns",
    node: JavaSyntaxNode
  ): void => {
    for (const reference of staticJavaSignatureTypeReferences(input.extraction, node, excludedNames)) {
      const importedTypePath =
        reference.qualifiedTypePath === undefined
          ? input.imports.get(reference.name)
          : undefined;
      facts.push({
        sourceId: input.callableSymbol.id,
        declaringTypeId: input.declaringType.id,
        filePath: input.extraction.filePath,
        referenceName: reference.name,
        relationKind,
        isTopLevelType: relationKind === "returns" && reference.isTopLevelType,
        range: rangeFor(lineStartsFor(input.extraction.sourceText), reference.node.from, reference.node.to),
        ...(importedTypePath === undefined ? {} : { importedTypePath }),
        ...(reference.qualifiedTypePath === undefined
          ? {}
          : { qualifiedTypePath: reference.qualifiedTypePath })
      });
    }
  };
  const children = directChildren(input.callable.node);
  if (input.callable.node.name === "MethodDeclaration") {
    const definitionIndex = children.findIndex(
      (child) =>
        child.name === input.callable.nameNode.name &&
        child.from === input.callable.nameNode.from &&
        child.to === input.callable.nameNode.to
    );
    for (const child of children.slice(0, Math.max(0, definitionIndex))) {
      if (child.name !== "Modifiers" && child.name !== "TypeParameters") {
        addReferences("returns", child);
      }
    }
  }
  const parameters = children.filter((child) => child.name === "FormalParameters");
  if (parameters.length === 1 && parameters[0] !== undefined) {
    for (const parameter of directChildren(parameters[0]).filter(
      (child) => child.name === "FormalParameter" || child.name === "SpreadParameter"
    )) {
      addReferences("accepts", parameter);
    }
  }
  return facts;
}

/**
 * A direct injection annotation is retained only when its source spelling is
 * fully qualified or a unique direct import proves one of the supported JVM
 * DI APIs. Multiple or unproven DI annotations fail closed.
 */
function staticJavaDependencyInjectionSyntax(
  annotations: readonly StaticJavaAnnotation[],
  imports: ReadonlyMap<string, string>,
  member: "constructor" | "field" | "method"
): JvmDependencyInjectionReferenceFact["syntax"] | null {
  const annotationsNamedDependencyInjection = annotations.filter((annotation) =>
    [...JAVA_DEPENDENCY_INJECTION_ANNOTATIONS, ...JAVA_RESOURCE_INJECTION_ANNOTATIONS].some(
      (candidate) => {
      const simpleName = candidate.path.split(".").at(-1);
      return annotation.name === candidate.path || annotation.name === simpleName;
      }
    )
  );
  const provenAnnotations = annotationsNamedDependencyInjection.flatMap((annotation) =>
    JAVA_DEPENDENCY_INJECTION_ANNOTATIONS.flatMap((candidate) =>
      annotationMatches(annotation, candidate.path, imports)
        ? [
            member === "constructor"
              ? candidate.constructorSyntax
              : member === "field"
                ? candidate.fieldSyntax
                : candidate.methodSyntax
          ]
        : []
    )
  );
  return annotationsNamedDependencyInjection.length === provenAnnotations.length &&
    provenAnnotations.length === 1
    ? provenAnnotations[0] ?? null
    : null;
}

/**
 * `@Resource` derives its requested type from the field or JavaBeans setter
 * only when its arguments are absent. Explicit name, lookup, and type values
 * change the resource contract, so they remain outside this static type rule.
 */
function staticJavaBareResourceAnnotation(annotation: StaticJavaAnnotation): boolean {
  if (annotation.node.name === "MarkerAnnotation") {
    return true;
  }
  if (annotation.node.name !== "Annotation") {
    return false;
  }
  const argumentLists = directChildren(annotation.node).filter(
    (child) => child.name === "AnnotationArgumentList"
  );
  return (
    argumentLists.length === 1 &&
    argumentLists[0] !== undefined &&
    directChildren(argumentLists[0]).every((child) => child.name === "(" || child.name === ")")
  );
}

function staticJavaResourceInjectionSyntax(
  annotations: readonly StaticJavaAnnotation[],
  imports: ReadonlyMap<string, string>,
  member: "field" | "setter"
): JvmDependencyInjectionReferenceFact["syntax"] | null {
  const annotationsNamedDependencyInjection = annotations.filter((annotation) =>
    [...JAVA_DEPENDENCY_INJECTION_ANNOTATIONS, ...JAVA_RESOURCE_INJECTION_ANNOTATIONS].some(
      (candidate) => {
        const simpleName = candidate.path.split(".").at(-1);
        return annotation.name === candidate.path || annotation.name === simpleName;
      }
    )
  );
  const provenAnnotations = annotationsNamedDependencyInjection.flatMap((annotation) =>
    JAVA_RESOURCE_INJECTION_ANNOTATIONS.flatMap((candidate) =>
      staticJavaBareResourceAnnotation(annotation) && annotationMatches(annotation, candidate.path, imports)
        ? [member === "field" ? candidate.fieldSyntax : candidate.setterSyntax]
        : []
    )
  );
  return annotationsNamedDependencyInjection.length === provenAnnotations.length &&
    provenAnnotations.length === 1
    ? provenAnnotations[0] ?? null
    : null;
}

/**
 * Retains direct, non-generic constructor, field, and concrete-method
 * injection point types. `@Autowired` and `@Inject` retain every individually
 * proven method parameter; bare `@Resource` additionally retains only a void
 * JavaBeans setter's one direct parameter. Every fact describes a declared DI
 * type dependency, not a runtime bean or provider selection. Qualifier,
 * optional, collection, and JNDI-resource semantics remain outside this
 * source-only slice.
 */
function staticJavaMethodInjectionReferences(
  input: JavaExtractFileFactsInput,
  method: StaticJavaMethod
): readonly StaticJavaSuperclassReference[] {
  const parameterLists = directChildren(method.node).filter(
    (child) => child.name === "FormalParameters"
  );
  if (parameterLists.length !== 1 || parameterLists[0] === undefined) {
    return [];
  }
  const parameters = directChildren(parameterLists[0]).filter(
    (child) => child.name === "FormalParameter"
  );
  const references: StaticJavaSuperclassReference[] = [];
  for (const parameter of parameters) {
    const typeNodes = directChildren(parameter).filter(isJavaDirectTypeName);
    if (typeNodes.length !== 1 || typeNodes[0] === undefined) {
      continue;
    }
    const reference = staticJavaDirectTypeReference(input, typeNodes[0]);
    if (reference !== null) {
      references.push(reference);
    }
  }
  return references;
}

/**
 * Standard `@Resource` method injection is restricted to one non-vararg,
 * void JavaBeans setter. Other method targets can carry a resource declaration
 * but do not prove a property type for this graph relationship.
 */
function staticJavaResourceSetterInjectionReferences(
  input: JavaExtractFileFactsInput,
  method: StaticJavaMethod
): readonly StaticJavaSuperclassReference[] {
  if (
    !/^set[A-Z][A-Za-z0-9_$]*$/u.test(method.name) ||
    !directChildren(method.node).some((child) => child.name === "void")
  ) {
    return [];
  }
  const parameterLists = directChildren(method.node).filter(
    (child) => child.name === "FormalParameters"
  );
  if (parameterLists.length !== 1 || parameterLists[0] === undefined) {
    return [];
  }
  const parameters = directChildren(parameterLists[0]).filter(
    (child) => child.name === "FormalParameter" || child.name === "SpreadParameter"
  );
  return parameters.length === 1 && parameters[0]?.name === "FormalParameter"
    ? staticJavaMethodInjectionReferences(input, method)
    : [];
}

function staticJavaDependencyInjectionReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticJavaDependencyInjectionReference[] {
  const references: StaticJavaDependencyInjectionReference[] = [];
  const constructors = directChildren(declaration.body).filter(
    (child) => child.name === "ConstructorDeclaration"
  );
  const annotatedConstructors = constructors.flatMap((constructor) => {
    const syntax = staticJavaDependencyInjectionSyntax(
      staticAnnotations(input, constructor),
      imports,
      "constructor"
    );
    return syntax === null ? [] : [{ constructor, syntax }];
  });
  if (annotatedConstructors.length === 1 && annotatedConstructors[0] !== undefined) {
    const { constructor, syntax } = annotatedConstructors[0];
    const parameters = directChildren(constructor).find(
      (child) => child.name === "FormalParameters"
    );
    if (parameters !== undefined) {
      for (const parameter of directChildren(parameters)) {
        if (parameter.name !== "FormalParameter") {
          continue;
        }
        const typeNodes = directChildren(parameter).filter(isJavaDirectTypeName);
        if (typeNodes.length !== 1 || typeNodes[0] === undefined) {
          continue;
        }
        const reference = staticJavaDirectTypeReference(input, typeNodes[0]);
        if (reference !== null) {
          references.push({ syntax, reference });
        }
      }
    }
  }

  for (const field of directChildren(declaration.body)) {
    if (field.name !== "FieldDeclaration") {
      continue;
    }
    const syntax = staticJavaDependencyInjectionSyntax(
      staticAnnotations(input, field),
      imports,
      "field"
    );
    const resourceSyntax = staticJavaResourceInjectionSyntax(
      staticAnnotations(input, field),
      imports,
      "field"
    );
    if (syntax === null && resourceSyntax === null) {
      continue;
    }
    const typeNodes = directChildren(field).filter(isJavaDirectTypeName);
    if (typeNodes.length !== 1 || typeNodes[0] === undefined) {
      continue;
    }
    const reference = staticJavaDirectTypeReference(input, typeNodes[0]);
    if (reference !== null) {
      if (syntax !== null) {
        references.push({ syntax, reference });
      }
      if (resourceSyntax !== null) {
        references.push({ syntax: resourceSyntax, reference });
      }
    }
  }

  for (const method of directChildren(declaration.body)
    .map((node) => staticJavaMethod(input, node))
    .filter((candidate): candidate is StaticJavaMethod => candidate !== null)) {
    if (method.body === null || method.isStatic) {
      continue;
    }
    const syntax = staticJavaDependencyInjectionSyntax(method.annotations, imports, "method");
    if (syntax !== null) {
      for (const reference of staticJavaMethodInjectionReferences(input, method)) {
        references.push({ syntax, reference });
      }
    }
    const resourceSyntax = staticJavaResourceInjectionSyntax(method.annotations, imports, "setter");
    if (resourceSyntax !== null) {
      for (const reference of staticJavaResourceSetterInjectionReferences(input, method)) {
        references.push({ syntax: resourceSyntax, reference });
      }
    }
  }

  return references;
}

/** Java interface methods are public unless they explicitly opt into `private`. */
function isJavaInterfaceMethodExported(declaration: StaticJavaMethod): boolean {
  const modifiers = directChildren(declaration.node).find((child) => child.name === "Modifiers");
  return modifiers === undefined || !directChildren(modifiers).some((child) => child.name === "private");
}

function staticClassPrefixes(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly string[] | null {
  const annotationsNamedRequestMapping = declaration.annotations.filter(
    (annotation) => annotation.name === "RequestMapping" || annotation.name === SPRING_REQUEST_MAPPING_PATH
  );
  const mappings = declaration.annotations.filter((annotation) =>
    annotationMatches(annotation, SPRING_REQUEST_MAPPING_PATH, imports)
  );
  // An unproved `@RequestMapping` could alter the prefix, so do not emit a
  // plausible-but-wrong subroute beneath it.
  if (annotationsNamedRequestMapping.length !== mappings.length || mappings.length > 1) {
    return null;
  }
  if (mappings.length === 0) {
    return [""];
  }
  const mapping = mappings[0];
  return mapping === undefined ? null : staticSpringClassPaths(input, mapping);
}

function staticMethodRoutes(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): readonly StaticHttpRoute[] {
  const annotationsNamedRequestMapping = declaration.annotations.filter(
    (annotation) => annotation.name === "RequestMapping" || annotation.name === SPRING_REQUEST_MAPPING_PATH
  );
  const requestMappings = annotationsNamedRequestMapping.filter((annotation) =>
    annotationMatches(annotation, SPRING_REQUEST_MAPPING_PATH, imports)
  );
  if (annotationsNamedRequestMapping.length !== requestMappings.length) {
    return [];
  }
  if (requestMappings.length > 0) {
    return requestMappings.length === 1 && requestMappings[0] !== undefined
      ? (staticSpringRequestMappingRoutes(input, requestMappings[0], imports) ?? [])
      : [];
  }
  const mappings = declaration.annotations.flatMap((annotation) => {
    const method = Object.entries(SPRING_METHOD_MAPPING_PATHS).find(([path]) =>
      annotationMatches(annotation, path, imports)
    )?.[1];
    return method === undefined ? [] : [{ annotation, method }];
  });
  if (mappings.length !== 1) {
    return [];
  }
  const mapping = mappings[0];
  if (mapping === undefined) {
    return [];
  }
  const path = staticSpringPath(input, mapping.annotation);
  return path === null ? [] : [{ method: mapping.method, path, node: mapping.annotation.node }];
}

function staticMicronautClassPrefix(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): string | null {
  const annotationsNamedController = declaration.annotations.filter(
    (annotation) => annotation.name === "Controller" || annotation.name === MICRONAUT_CONTROLLER_PATH
  );
  const controllers = annotationsNamedController.filter((annotation) =>
    annotationMatches(annotation, MICRONAUT_CONTROLLER_PATH, imports)
  );
  if (annotationsNamedController.length !== controllers.length || controllers.length !== 1) {
    return null;
  }
  const controller = controllers[0];
  return controller === undefined ? null : staticMicronautPath(input, controller, false);
}

function isMicronautMappingAnnotationName(name: string): boolean {
  return Object.keys(MICRONAUT_METHOD_MAPPING_PATHS).some(
    (path) => name === path || name === path.split(".").at(-1)
  );
}

function staticMicronautMethodRoute(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): StaticHttpRoute | null {
  const annotationsNamedMappings = declaration.annotations.filter((annotation) =>
    isMicronautMappingAnnotationName(annotation.name)
  );
  const mappings = annotationsNamedMappings.flatMap((annotation) => {
    const method = Object.entries(MICRONAUT_METHOD_MAPPING_PATHS).find(([path]) =>
      annotationMatches(annotation, path, imports)
    )?.[1];
    return method === undefined ? [] : [{ annotation, method }];
  });
  if (annotationsNamedMappings.length !== mappings.length || mappings.length !== 1) {
    return null;
  }
  const mapping = mappings[0];
  if (mapping === undefined) {
    return null;
  }
  const path = staticMicronautPath(input, mapping.annotation, true);
  return path === null ? null : { method: mapping.method, path, node: mapping.annotation.node };
}

/**
 * Jakarta REST `@Path` values are URI templates relative to the application's
 * base URI. This pass keeps one direct literal only; it never interprets a
 * template, parameter binding, encoding, or a deployment-level ApplicationPath.
 */
function staticJakartaRestPath(
  input: JavaExtractFileFactsInput,
  annotation: StaticJavaAnnotation
): string | null {
  if (annotation.node.name !== "Annotation") {
    return null;
  }
  const arguments_ = directChildren(annotation.node).find(
    (child) => child.name === "AnnotationArgumentList"
  );
  if (arguments_ === undefined) {
    return null;
  }
  const values = directChildren(arguments_).filter(
    (child) => !["(", ")", ","].includes(child.name)
  );
  if (values.length !== 1 || values[0] === undefined) {
    return null;
  }
  const value = values[0];
  let path: string | null;
  if (value.name === "StringLiteral") {
    path = staticPlainJavaString(input, value);
  } else if (value.name === "ElementValuePair") {
    const pair = directChildren(value);
    const key = pair[0] === undefined ? null : identifierText(input, pair[0]);
    const literal = pair[2];
    if (
      pair.length !== 3 ||
      pair[1]?.name !== "AssignOp" ||
      key !== "value" ||
      literal === undefined
    ) {
      return null;
    }
    path = staticPlainJavaString(input, literal);
  } else {
    return null;
  }
  return path !== null && !path.includes("\\") && !path.includes("//") && !/\s/u.test(path)
    ? path
    : null;
}

function isJakartaRestPathAnnotationName(name: string): boolean {
  return name === "Path" || JAKARTA_REST_PATH_PATHS.some((path) => path === name);
}

function isJakartaRestMethodAnnotationName(name: string): boolean {
  return Object.keys(JAKARTA_REST_METHOD_MAPPING_PATHS).some(
    (path) => name === path || name === path.split(".").at(-1)
  );
}

function matchesJakartaRestPath(
  annotation: StaticJavaAnnotation,
  imports: ReadonlyMap<string, string>
): boolean {
  return JAKARTA_REST_PATH_PATHS.some((path) => annotationMatches(annotation, path, imports));
}

function staticJakartaRestClassPrefix(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): string | null {
  const annotationsNamedPath = declaration.annotations.filter((annotation) =>
    isJakartaRestPathAnnotationName(annotation.name)
  );
  const paths = annotationsNamedPath.filter((annotation) => matchesJakartaRestPath(annotation, imports));
  if (annotationsNamedPath.length !== paths.length || paths.length !== 1) {
    return null;
  }
  const path = paths[0];
  return path === undefined ? null : staticJakartaRestPath(input, path);
}

function staticJakartaRestMethodRoute(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): StaticHttpRoute | null {
  const annotationsNamedPath = declaration.annotations.filter((annotation) =>
    isJakartaRestPathAnnotationName(annotation.name)
  );
  const paths = annotationsNamedPath.filter((annotation) => matchesJakartaRestPath(annotation, imports));
  if (annotationsNamedPath.length !== paths.length || paths.length > 1) {
    return null;
  }
  const annotationsNamedMethods = declaration.annotations.filter((annotation) =>
    isJakartaRestMethodAnnotationName(annotation.name)
  );
  const methods = annotationsNamedMethods.flatMap((annotation) => {
    const method = Object.entries(JAKARTA_REST_METHOD_MAPPING_PATHS).find(([path]) =>
      annotationMatches(annotation, path, imports)
    )?.[1];
    return method === undefined ? [] : [{ annotation, method }];
  });
  if (annotationsNamedMethods.length !== methods.length || methods.length !== 1) {
    return null;
  }
  const requestMethod = methods[0];
  if (requestMethod === undefined || requestMethod.annotation.node.name !== "MarkerAnnotation") {
    return null;
  }
  const pathAnnotation = paths[0];
  const path = pathAnnotation === undefined ? "" : staticJakartaRestPath(input, pathAnnotation);
  return path === null
    ? null
    : { method: requestMethod.method, path, node: requestMethod.annotation.node };
}

function isSpringController(
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): boolean {
  return declaration.annotations.some(
    (annotation) =>
      annotationMatches(annotation, SPRING_REST_CONTROLLER_PATH, imports) ||
      annotationMatches(annotation, SPRING_CONTROLLER_PATH, imports)
  );
}

/**
 * Retains direct class-field `@Value` annotations only after one exact import
 * or fully-qualified annotation proves Spring's `Value` type. The owner is
 * the enclosing class because this Java slice does not add generic field
 * symbols; the annotation retains its own source range for later projection.
 */
function staticSpringBootPropertiesReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootPropertiesReference[] {
  const references: StaticSpringBootPropertiesReference[] = [];
  for (const field of directChildren(declaration.body)) {
    if (field.name !== "FieldDeclaration") {
      continue;
    }
    const annotations = staticAnnotations(input, field);
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
    const key = staticSpringBootPropertiesKey(input, annotation);
    if (key !== null) {
      references.push({ key, node: annotation.node });
    }
  }
  return references;
}

/**
 * Retains direct constructor-parameter `@Value` annotations after the same
 * exact Spring type proof as fields. Methods, nested declarations, and any
 * nonliteral annotation surface never enter this first constructor slice.
 */
function staticSpringBootConstructorParameterReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootPropertiesReference[] {
  const references: StaticSpringBootPropertiesReference[] = [];
  for (const constructor of directChildren(declaration.body)) {
    if (constructor.name !== "ConstructorDeclaration") {
      continue;
    }
    const parameters = directChildren(constructor).find(
      (child) => child.name === "FormalParameters"
    );
    if (parameters === undefined) {
      continue;
    }
    for (const parameter of directChildren(parameters)) {
      if (parameter.name !== "FormalParameter") {
        continue;
      }
      const annotations = staticAnnotations(input, parameter);
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
      const key = staticSpringBootPropertiesKey(input, annotation);
      if (key !== null) {
        references.push({ key, node: annotation.node });
      }
    }
  }
  return references;
}

/**
 * Retains direct concrete-method parameter `@Value` annotations after the same
 * exact Spring type proof as fields and constructors. Abstract methods,
 * interfaces, nested declarations, and nonliteral annotation surfaces stay
 * outside this first method-injection slice.
 */
function staticSpringBootMethodParameterReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootPropertiesReference[] {
  const references: StaticSpringBootPropertiesReference[] = [];
  for (const method of directChildren(declaration.body)) {
    if (method.name !== "MethodDeclaration") {
      continue;
    }
    const hasBody = directChildren(method).some((child) => child.name === "Block");
    if (!hasBody) {
      continue;
    }
    const parameters = directChildren(method).find((child) => child.name === "FormalParameters");
    if (parameters === undefined) {
      continue;
    }
    for (const parameter of directChildren(parameters)) {
      if (parameter.name !== "FormalParameter") {
        continue;
      }
      const annotations = staticAnnotations(input, parameter);
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
      const key = staticSpringBootPropertiesKey(input, annotation);
      if (key !== null) {
        references.push({ key, node: annotation.node });
      }
    }
  }
  return references;
}

/**
 * Retains one direct concrete-method `@Value` annotation only when the method
 * has exactly one parameter and that parameter has no separately proven Spring
 * `@Value`. This keeps method-level and parameter-level injection evidence from
 * producing duplicate or contradictory class-owned configuration facts.
 */
function staticSpringBootMethodAnnotationReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootPropertiesReference[] {
  const references: StaticSpringBootPropertiesReference[] = [];
  for (const method of directChildren(declaration.body)) {
    if (method.name !== "MethodDeclaration") {
      continue;
    }
    const children = directChildren(method);
    if (!children.some((child) => child.name === "Block")) {
      continue;
    }
    const formalParameters = children.find((child) => child.name === "FormalParameters");
    if (formalParameters === undefined) {
      continue;
    }
    const parameters = directChildren(formalParameters).filter(
      (child) => child.name === "FormalParameter"
    );
    const parameter = parameters[0];
    if (parameters.length !== 1 || parameter === undefined) {
      continue;
    }
    const parameterHasSpringValue = staticAnnotations(input, parameter).some(
      (annotation) =>
        (annotation.name === "Value" || annotation.name === SPRING_VALUE_PATH) &&
        annotationMatches(annotation, SPRING_VALUE_PATH, imports)
    );
    if (parameterHasSpringValue) {
      continue;
    }
    const annotations = staticAnnotations(input, method);
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
    const key = staticSpringBootPropertiesKey(input, annotation);
    if (key !== null) {
      references.push({ key, node: annotation.node });
    }
  }
  return references;
}

/**
 * A direct top-level Java class may own one statically proven Spring Boot
 * configuration prefix. The project resolver later fans it out only to
 * parser-proven leaf keys, keeping profile and format ambiguity explicit.
 */
function staticSpringBootConfigurationPropertiesPrefixReferences(
  input: JavaExtractFileFactsInput,
  declaration: StaticJavaClass,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootConfigurationPropertiesPrefixReference[] {
  const annotationsNamedConfigurationProperties = declaration.annotations.filter(
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
  const prefix = staticSpringBootConfigurationPropertiesPrefix(input, annotation);
  return prefix === null ? [] : [{ prefix, node: annotation.node }];
}

/**
 * Retains a configuration prefix on one direct concrete `@Bean` method only
 * inside a direct `@Configuration` class. All three Spring annotation types
 * require exact import or fully-qualified proof. This intentionally models a
 * source-proven factory relationship, not Spring's runtime bean registration.
 */
function staticSpringBootBeanConfigurationPropertiesPrefixReferences(
  input: JavaExtractFileFactsInput,
  owner: StaticJavaClass,
  method: StaticJavaMethod,
  imports: ReadonlyMap<string, string>
): readonly StaticSpringBootConfigurationPropertiesPrefixReference[] {
  if (!directChildren(method.node).some((child) => child.name === "Block")) {
    return [];
  }
  const annotationsNamedConfiguration = owner.annotations.filter(
    (annotation) => annotation.name === "Configuration" || annotation.name === SPRING_CONFIGURATION_PATH
  );
  const configurationAnnotations = annotationsNamedConfiguration.filter((annotation) =>
    annotationMatches(annotation, SPRING_CONFIGURATION_PATH, imports)
  );
  if (
    annotationsNamedConfiguration.length !== configurationAnnotations.length ||
    configurationAnnotations.length !== 1
  ) {
    return [];
  }
  const annotationsNamedBean = method.annotations.filter(
    (annotation) => annotation.name === "Bean" || annotation.name === SPRING_BEAN_PATH
  );
  const beanAnnotations = annotationsNamedBean.filter((annotation) =>
    annotationMatches(annotation, SPRING_BEAN_PATH, imports)
  );
  if (annotationsNamedBean.length !== beanAnnotations.length || beanAnnotations.length !== 1) {
    return [];
  }
  const annotationsNamedConfigurationProperties = method.annotations.filter(
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
  const prefix = staticSpringBootConfigurationPropertiesPrefix(input, annotation);
  return prefix === null ? [] : [{ prefix, node: annotation.node }];
}

function joinHttpPaths(prefix: string, path: string): string {
  const segments = [prefix, path]
    .flatMap((value) => value.split("/"))
    .filter((segment) => segment.length > 0);
  return `/${segments.join("/")}`;
}

/**
 * Extracts Java class and method symbols plus deliberately narrow Spring Web
 * and Micronaut/Jakarta REST routes, as well as Spring Boot properties facts. Each HTTP
 * surface proves a direct controller annotation, unambiguous framework import
 * (or fully-qualified annotation), one literal mapping path, and the exact
 * local method declaration. Spring Boot properties retain direct field-level
 * literal `@Value` placeholders and direct Java class-level, direct top-level
 * record-level, or proven `@Bean` factory-method `@ConfigurationProperties`
 * literal prefixes.
 */
export function extractJavaFileFacts(input: JavaExtractFileFactsInput): ArtifactFacts {
  const springWebCapability = frameworkCapability("spring-web");
  if (!springWebCapability.languages.includes(input.language)) {
    throw new Error("Java framework extraction was invoked for an unsupported source language.");
  }
  const micronautCapability = frameworkCapability("micronaut");
  if (!micronautCapability.languages.includes(input.language)) {
    throw new Error("Micronaut route extraction was invoked for an unsupported source language.");
  }
  const jakartaRestCapability = frameworkCapability("jakarta-rest");
  if (!jakartaRestCapability.languages.includes(input.language)) {
    throw new Error("Jakarta REST route extraction was invoked for an unsupported source language.");
  }
  const springBootPropertiesCapability = frameworkCapability("spring-boot-properties");
  if (!springBootPropertiesCapability.languages.includes(input.language)) {
    throw new Error("Spring Boot properties extraction was invoked for an unsupported source language.");
  }
  const jvmDependencyInjectionCapability = frameworkCapability("jvm-di");
  if (!jvmDependencyInjectionCapability.languages.includes(input.language)) {
    throw new Error("JVM dependency-injection extraction was invoked for an unsupported source language.");
  }
  const reactNativeCapability = frameworkCapability("react-native");
  if (!reactNativeCapability.languages.includes(input.language)) {
    throw new Error("React Native bridge extraction was invoked for an unsupported source language.");
  }

  const root = parser.parse(input.sourceText).topNode;
  const instanceofAndPatternInspection = inspectJavaInstanceofAndPatterns(input);
  const recordInspection = inspectJavaRecords({ sourceText: input.sourceText });
  const modernDeclarationInspection = inspectModernJavaDeclarations(input.sourceText);
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const pendingReferences: PendingReference[] = [];
  const javaClassFacts: Array<{ symbolId: string; packageName: string }> = [];
  const jvmTypeFacts: JvmFacts["types"][number][] = [];
  const jvmHeritageReferences: JvmFacts["heritageReferences"][number][] = [];
  const jvmImportReferences: JvmImportReferenceFact[] = [];
  const jvmAnnotationReferences: JvmAnnotationReferenceFact[] = [];
  const jvmDependencyInjectionReferences: JvmDependencyInjectionReferenceFact[] = [];
  const jvmCallableSignatureReferences: JvmCallableSignatureReferenceFact[] = [];
  const javaCallableDeclarations: JavaCallableDeclarationFact[] = [];
  const javaChainedCallReferences: JavaChainedCallReferenceFact[] = [];
  const javaMemberCallReferences: JavaMemberCallReferenceFact[] = [];
  const javaFieldDeclarations: JavaFieldDeclarationFact[] = [];
  const javaInstantiationReferences: JavaInstantiationReferenceFact[] = [];
  const springBootPropertiesValueReferences: SpringBootPropertiesValueReferenceFact[] = [];
  const springBootConfigurationPropertiesPrefixes: SpringBootConfigurationPropertiesPrefixReferenceFact[] = [];
  const reactNativeNativeMethods: ReactNativeFacts["nativeMethods"][number][] = [];
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
    const identity = `${qualifiedName}\u0000${kind}`;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function addContainmentAtRange(
    parent: SymbolNode,
    child: SymbolNode,
    range: SourceRange
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
        ruleId: "syntax.containment",
        stage: "syntax",
        candidateSymbolIds: [child.id]
      }
    });
  }

  function addContainment(parent: SymbolNode, child: SymbolNode, node: JavaSyntaxNode): void {
    addContainmentAtRange(parent, child, rangeFor(lineStarts, node.from, node.to));
  }

  function addClass(declaration: StaticJavaClass, packageName: string | null): SymbolNode {
    const qualifiedName = `${input.filePath}#${declaration.name}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    if (packageName !== null) {
      javaClassFacts.push({ symbolId: symbol.id, packageName });
      jvmTypeFacts.push({ symbolId: symbol.id, packageName });
    }
    return symbol;
  }

  function addInterface(
    declaration: StaticJavaInterface,
    packageName: string | null
  ): SymbolNode {
    const qualifiedName = `${input.filePath}#${declaration.name}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "interface");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "interface",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "interface",
      filePath: input.filePath,
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(fileNode, symbol, declaration.node);
    if (packageName !== null) {
      jvmTypeFacts.push({ symbolId: symbol.id, packageName });
    }
    return symbol;
  }

  function addRecord(declaration: StaticJavaRecord, packageName: string | null): SymbolNode {
    const qualifiedName = `${input.filePath}#${declaration.name}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "class");
    const nodeRange = declaration.node.range();
    const range = rangeFor(lineStarts, nodeRange.start.index, nodeRange.end.index);
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "class",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "class",
      filePath: input.filePath,
      range,
      isExported: declaration.isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainmentAtRange(fileNode, symbol, range);
    if (packageName !== null) {
      javaClassFacts.push({ symbolId: symbol.id, packageName });
    }
    return symbol;
  }

  function addMethod(
    parent: SymbolNode,
    declaration: StaticJavaMethod | StaticJavaConstructor,
    imports: ReadonlyMap<string, string>,
    isExported: boolean = declaration.isExported
  ): SymbolNode {
    const qualifiedName = `${parent.qualifiedName}.${declaration.name}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "method");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "method",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "method",
      filePath: input.filePath,
      range: rangeFor(lineStarts, declaration.node.from, declaration.node.to),
      isExported,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    const arity = staticJavaCallableArity(declaration);
    const parameterTypes = staticJavaCallableParameterTypes(input, declaration, imports);
    if (arity !== null && parameterTypes !== null) {
      javaCallableDeclarations.push({
        symbolId: symbol.id,
        declaringTypeId: parent.id,
        name: declaration.name,
        callableKind: "isStatic" in declaration ? "method" : "constructor",
        isStatic: "isStatic" in declaration && declaration.isStatic,
        isFinal: "isFinal" in declaration && declaration.isFinal,
        visibility: declaration.visibility,
        ...arity,
        parameterTypes
      });
    }
    return symbol;
  }

  function addPendingOverrideReference(source: SymbolNode, declaration: StaticJavaMethod): void {
    const range = rangeFor(lineStarts, declaration.nameNode.from, declaration.nameNode.to);
    pendingReferences.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: null,
        kind: "overrides",
        line: range.start.line,
        column: range.start.column,
        referenceName: declaration.name
      }),
      sourceId: source.id,
      filePath: input.filePath,
      referenceName: declaration.name,
      relationKind: "overrides",
      range
    });
  }

  /**
   * The Java extractor has no compiler classpath. It can nevertheless retain
   * an exact hierarchy fact when one direct simple-name superclass is declared
   * once in this same source file.
   */
  function addExactSameFileSuperclass(
    child: SymbolNode,
    declaration: StaticJavaClass,
    typesByName: ReadonlyMap<string, readonly SymbolNode[]>
  ): void {
    const superclass = staticJavaDirectSuperclass(input, declaration);
    if (superclass === null || superclass.qualifiedTypePath !== undefined) {
      return;
    }
    const candidates = (typesByName.get(superclass.name) ?? []).filter(
      (candidate) => candidate.id !== child.id && candidate.kind === "class"
    );
    if (candidates.length !== 1 || candidates[0] === undefined) {
      return;
    }
    const target = candidates[0];
    const range = rangeFor(lineStarts, superclass.node.from, superclass.node.to);
    edges.push({
      id: createEdgeId({
        sourceId: child.id,
        targetId: target.id,
        kind: "extends",
        line: range.start.line,
        column: range.start.column,
        referenceName: superclass.name
      }),
      sourceId: child.id,
      targetId: target.id,
      kind: "extends",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: superclass.name,
      evidence: {
        ruleId: "syntax.java.same-file.direct-superclass",
        stage: "syntax",
        candidateSymbolIds: [target.id]
      }
    });
  }

  /**
   * Direct interface hierarchy facts need no classpath when an unqualified
   * contract name identifies exactly one interface declared in this file.
   */
  function addExactSameFileInterfaceRelations(
    child: SymbolNode,
    declaration: StaticJavaClass | StaticJavaInterface,
    typesByName: ReadonlyMap<string, readonly SymbolNode[]>,
    headerName: "SuperInterfaces" | "ExtendsInterfaces",
    relationKind: "extends" | "implements",
    ruleId: string
  ): void {
    for (const reference of staticJavaDirectInterfaceReferences(input, declaration, headerName)) {
      if (reference.qualifiedTypePath !== undefined) {
        continue;
      }
      const candidates = (typesByName.get(reference.name) ?? []).filter(
        (candidate) => candidate.id !== child.id && candidate.kind === "interface"
      );
      if (candidates.length !== 1 || candidates[0] === undefined) {
        continue;
      }
      const target = candidates[0];
      const range = rangeFor(lineStarts, reference.node.from, reference.node.to);
      edges.push({
        id: createEdgeId({
          sourceId: child.id,
          targetId: target.id,
          kind: relationKind,
          line: range.start.line,
          column: range.start.column,
          referenceName: reference.name
        }),
        sourceId: child.id,
        targetId: target.id,
        kind: relationKind,
        filePath: input.filePath,
        range,
        resolution: "exact",
        confidence: 1,
        referenceName: reference.name,
        evidence: {
          ruleId,
          stage: "syntax",
          candidateSymbolIds: [target.id]
        }
      });
    }
  }

  /**
   * Retains a direct source-level JVM parent reference for the project resolver.
   * A qualified spelling takes precedence over imports; otherwise the import map
   * contains only unique direct Java imports, so static, wildcard, and ambiguous
   * imports cannot acquire cross-file evidence here.
   */
  function addJvmHeritageReference(
    source: SymbolNode,
    reference: StaticJavaSuperclassReference,
    syntax: JvmHeritageSyntax,
    imports: ReadonlyMap<string, string>
  ): void {
    const importedTypePath =
      reference.qualifiedTypePath === undefined ? imports.get(reference.name) : undefined;
    jvmHeritageReferences.push({
      sourceId: source.id,
      filePath: input.filePath,
      referenceName: reference.name,
      syntax,
      range: rangeFor(lineStarts, reference.node.from, reference.node.to),
      ...(importedTypePath === undefined ? {} : { importedTypePath }),
      ...(reference.qualifiedTypePath === undefined
        ? {}
        : { qualifiedTypePath: reference.qualifiedTypePath })
    });
  }

  function addJvmAnnotationReferences(
    source: SymbolNode,
    declaringType: SymbolNode,
    annotations: readonly StaticJavaAnnotation[],
    imports: ReadonlyMap<string, string>
  ): void {
    for (const annotation of annotations) {
      const referenceName = annotation.name.split(".").at(-1);
      if (referenceName === undefined) {
        continue;
      }
      const qualifiedTypePath = annotation.name.includes(".")
        ? staticJavaQualifiedTopLevelTypePath(annotation.name) ?? undefined
        : undefined;
      if (annotation.name.includes(".") && qualifiedTypePath === undefined) {
        continue;
      }
      const importedTypePath = qualifiedTypePath === undefined
        ? imports.get(referenceName)
        : undefined;
      jvmAnnotationReferences.push({
        sourceId: source.id,
        declaringTypeId: declaringType.id,
        filePath: input.filePath,
        referenceName,
        range: rangeFor(lineStarts, annotation.referenceNode.from, annotation.referenceNode.to),
        ...(importedTypePath === undefined ? {} : { importedTypePath }),
        ...(qualifiedTypePath === undefined ? {} : { qualifiedTypePath })
      });
    }
  }

  function addJvmDependencyInjectionReference(
    source: SymbolNode,
    injectionReference: StaticJavaDependencyInjectionReference,
    imports: ReadonlyMap<string, string>
  ): void {
    const { reference, syntax } = injectionReference;
    const importedTypePath =
      reference.qualifiedTypePath === undefined ? imports.get(reference.name) : undefined;
    jvmDependencyInjectionReferences.push({
      sourceId: source.id,
      filePath: input.filePath,
      referenceName: reference.name,
      syntax,
      range: rangeFor(lineStarts, reference.node.from, reference.node.to),
      ...(importedTypePath === undefined ? {} : { importedTypePath }),
      ...(reference.qualifiedTypePath === undefined
        ? {}
        : { qualifiedTypePath: reference.qualifiedTypePath })
    });
  }

  function addFrameworkRoute(
    parent: SymbolNode,
    routeFact: StaticHttpRoute,
    handler: SymbolNode,
    ruleId: string
  ): void {
    const routeName = `${routeFact.method} ${routeFact.path}`;
    const qualifiedName = `${parent.qualifiedName}#route:${routeName}`;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
    const range = rangeFor(lineStarts, routeFact.node.from, routeFact.node.to);
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
    addContainment(parent, route, routeFact.node);
    edges.push({
      id: createEdgeId({
        sourceId: route.id,
        targetId: handler.id,
        kind: "routes",
        line: range.start.line,
        column: range.start.column,
        referenceName: handler.name
      }),
      sourceId: route.id,
      targetId: handler.id,
      kind: "routes",
      filePath: input.filePath,
      range,
      resolution: "exact",
      confidence: 1,
      referenceName: handler.name,
      evidence: {
        ruleId,
        stage: "syntax",
        candidateSymbolIds: [handler.id]
      }
    });
  }

  // The legacy Lezer grammar recovers several valid modern Java constructs as
  // errors. The independent modern tree-sitter parse is already required for
  // record extraction, so a clean whole-file result may safely authorize only
  // the legacy nodes that each bounded extractor still proves structurally.
  const canUseLegacyJavaRoot =
    !hasSyntaxError(input, root, instanceofAndPatternInspection.legacyRecoveryOffsets) ||
    recordInspection.isSyntaxClean;
  const packageName = canUseLegacyJavaRoot ? staticJavaPackage(input, root) : null;
  const overlapsRecord = (node: JavaSyntaxNode): boolean =>
    recordInspection.recordRanges.some(
      (recordRange) => node.from < recordRange.end && recordRange.start < node.to
    );

  if (canUseLegacyJavaRoot) {
    const imports = staticJavaImports(input, root);
    jvmImportReferences.push(
      ...staticJavaImportReferences({
        extraction: input,
        root,
        sourceId: fileNode.id,
        imports,
        lineStarts
      })
    );
    const types = directChildren(root)
      .map((node) => staticJavaType(input, node))
      .filter((candidate): candidate is StaticJavaType => candidate !== null)
      .filter(
        (candidate) =>
          !hasSyntaxError(
            input,
            candidate.node,
            instanceofAndPatternInspection.legacyRecoveryOffsets
          )
      );
    const typesByName = new Map<string, SymbolNode[]>();
    const declaredClasses: Array<{ declaration: StaticJavaClass; symbol: SymbolNode }> = [];
    const declaredInterfaces: Array<{ declaration: StaticJavaInterface; symbol: SymbolNode }> = [];

    for (const typeDeclaration of types) {
      const typeSymbol =
        typeDeclaration.kind === "class"
          ? addClass(typeDeclaration, packageName)
          : addInterface(typeDeclaration, packageName);
      const typeCandidates = typesByName.get(typeDeclaration.name) ?? [];
      typeCandidates.push(typeSymbol);
      typesByName.set(typeDeclaration.name, typeCandidates);

      if (typeDeclaration.kind === "interface") {
        declaredInterfaces.push({ declaration: typeDeclaration, symbol: typeSymbol });
        addJvmAnnotationReferences(typeSymbol, typeSymbol, typeDeclaration.annotations, imports);
        const interfaceFieldDeclarations = staticJavaFieldDeclarations({
          extraction: input,
          declaration: typeDeclaration,
          declaringType: typeSymbol,
          imports
        });
        const declaredFieldNames = new Set(
          interfaceFieldDeclarations.map((field) => field.name)
        );
        const shadowedTypeNames = staticJavaTypeDeclarationNames(input, typeDeclaration.body);
        javaFieldDeclarations.push(...interfaceFieldDeclarations);
        const methods = directChildren(typeDeclaration.body)
          .map((node) => staticJavaMethod(input, node))
          .filter((candidate): candidate is StaticJavaMethod => candidate !== null)
          .filter((candidate) => !overlapsRecord(candidate.node));
        const typeParameters = staticJavaTypeParameterNames(input, typeDeclaration.node);
        const shadowedValueNames = staticJavaValueDeclarationNames(input, typeDeclaration.body);
        for (const methodDeclaration of methods) {
          const methodSymbol = addMethod(
            typeSymbol,
            methodDeclaration,
            imports,
            isJavaInterfaceMethodExported(methodDeclaration)
          );
          addJvmAnnotationReferences(
            methodSymbol,
            typeSymbol,
            staticJavaCallableAnnotations(input, methodDeclaration),
            imports
          );
          jvmCallableSignatureReferences.push(
            ...staticJavaCallableSignatureReferences({
              extraction: input,
              callable: methodDeclaration,
              callableSymbol: methodSymbol,
              declaringType: typeSymbol,
              enclosingTypeParameters: typeParameters,
              imports
            })
          );
          javaChainedCallReferences.push(
            ...staticJavaChainedCallReferences({
              extraction: input,
              callable: methodDeclaration,
              callableSymbol: methodSymbol,
              declaringType: typeSymbol,
              imports,
              shadowedValueNames
            })
          );
          javaMemberCallReferences.push(
            ...staticJavaMemberCallReferences({
              extraction: input,
              callable: methodDeclaration,
              callableSymbol: methodSymbol,
              declaringType: typeSymbol,
              imports,
              declaredFieldNames,
              shadowedTypeNames,
              instanceofAndPatternSyntaxes: instanceofAndPatternInspection.syntaxes
            })
          );
          javaInstantiationReferences.push(
            ...staticJavaInstantiationReferences({
              extraction: input,
              callable: methodDeclaration,
              callableSymbol: methodSymbol,
              declaringType: typeSymbol,
              imports
            })
          );
        }
        continue;
      }

      const classDeclaration = typeDeclaration;
      const classSymbol = typeSymbol;
      declaredClasses.push({ declaration: classDeclaration, symbol: classSymbol });
      addJvmAnnotationReferences(classSymbol, classSymbol, classDeclaration.annotations, imports);
      for (const reference of staticSpringBootPropertiesReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (overlapsRecord(reference.node)) {
          continue;
        }
        springBootPropertiesValueReferences.push({
          sourceId: classSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeFor(lineStarts, reference.node.from, reference.node.to)
        });
      }
      for (const reference of staticSpringBootConstructorParameterReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (overlapsRecord(reference.node)) {
          continue;
        }
        springBootPropertiesValueReferences.push({
          sourceId: classSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeFor(lineStarts, reference.node.from, reference.node.to)
        });
      }
      for (const reference of staticSpringBootMethodParameterReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (overlapsRecord(reference.node)) {
          continue;
        }
        springBootPropertiesValueReferences.push({
          sourceId: classSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeFor(lineStarts, reference.node.from, reference.node.to)
        });
      }
      for (const reference of staticSpringBootMethodAnnotationReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (overlapsRecord(reference.node)) {
          continue;
        }
        springBootPropertiesValueReferences.push({
          sourceId: classSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeFor(lineStarts, reference.node.from, reference.node.to)
        });
      }
      for (const reference of staticSpringBootConfigurationPropertiesPrefixReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (overlapsRecord(reference.node)) {
          continue;
        }
        springBootConfigurationPropertiesPrefixes.push({
          sourceId: classSymbol.id,
          filePath: input.filePath,
          prefix: reference.prefix,
          range: rangeFor(lineStarts, reference.node.from, reference.node.to)
        });
      }
      for (const reference of staticJavaDependencyInjectionReferences(
        input,
        classDeclaration,
        imports
      )) {
        if (!overlapsRecord(reference.reference.node)) {
          addJvmDependencyInjectionReference(classSymbol, reference, imports);
        }
      }
      const methods = directChildren(classDeclaration.body)
        .map((node) => staticJavaMethod(input, node))
        .filter((candidate): candidate is StaticJavaMethod => candidate !== null)
        .filter((candidate) => !overlapsRecord(candidate.node));
      const constructors = directChildren(classDeclaration.body)
        .map((node) => staticJavaConstructor(input, node))
        .filter((candidate): candidate is StaticJavaConstructor => candidate !== null)
        .filter((candidate) => !overlapsRecord(candidate.node));
      const typeParameters = staticJavaTypeParameterNames(input, classDeclaration.node);
      const shadowedValueNames = staticJavaValueDeclarationNames(input, classDeclaration.body);
      const classFieldDeclarations = staticJavaFieldDeclarations({
        extraction: input,
        declaration: classDeclaration,
        declaringType: classSymbol,
        imports
      });
      const declaredFieldNames = new Set(classFieldDeclarations.map((field) => field.name));
      const shadowedTypeNames = staticJavaTypeDeclarationNames(input, classDeclaration.body);
      javaFieldDeclarations.push(...classFieldDeclarations);
      for (const constructorDeclaration of constructors) {
        const constructorSymbol = addMethod(classSymbol, constructorDeclaration, imports);
        addJvmAnnotationReferences(
          constructorSymbol,
          classSymbol,
          staticJavaCallableAnnotations(input, constructorDeclaration),
          imports
        );
        jvmCallableSignatureReferences.push(
          ...staticJavaCallableSignatureReferences({
            extraction: input,
            callable: constructorDeclaration,
            callableSymbol: constructorSymbol,
            declaringType: classSymbol,
            enclosingTypeParameters: typeParameters,
            imports
          })
        );
        javaChainedCallReferences.push(
          ...staticJavaChainedCallReferences({
            extraction: input,
            callable: constructorDeclaration,
            callableSymbol: constructorSymbol,
            declaringType: classSymbol,
            imports,
            shadowedValueNames
          })
        );
        javaMemberCallReferences.push(
          ...staticJavaMemberCallReferences({
            extraction: input,
            callable: constructorDeclaration,
            callableSymbol: constructorSymbol,
            declaringType: classSymbol,
            imports,
            declaredFieldNames,
            shadowedTypeNames,
            instanceofAndPatternSyntaxes: instanceofAndPatternInspection.syntaxes
          })
        );
        javaInstantiationReferences.push(
          ...staticJavaInstantiationReferences({
            extraction: input,
            callable: constructorDeclaration,
            callableSymbol: constructorSymbol,
            declaringType: classSymbol,
            imports
          })
        );
      }
      const symbolsByMethod = new Map<StaticJavaMethod, SymbolNode>();
      for (const methodDeclaration of methods) {
        const methodSymbol = addMethod(classSymbol, methodDeclaration, imports);
        addJvmAnnotationReferences(
          methodSymbol,
          classSymbol,
          staticJavaCallableAnnotations(input, methodDeclaration),
          imports
        );
        symbolsByMethod.set(methodDeclaration, methodSymbol);
        jvmCallableSignatureReferences.push(
          ...staticJavaCallableSignatureReferences({
            extraction: input,
            callable: methodDeclaration,
            callableSymbol: methodSymbol,
            declaringType: classSymbol,
            enclosingTypeParameters: typeParameters,
            imports
          })
        );
        javaChainedCallReferences.push(
          ...staticJavaChainedCallReferences({
            extraction: input,
            callable: methodDeclaration,
            callableSymbol: methodSymbol,
            declaringType: classSymbol,
            imports,
            shadowedValueNames
          })
        );
        javaMemberCallReferences.push(
          ...staticJavaMemberCallReferences({
            extraction: input,
            callable: methodDeclaration,
            callableSymbol: methodSymbol,
            declaringType: classSymbol,
            imports,
            declaredFieldNames,
            shadowedTypeNames,
            instanceofAndPatternSyntaxes: instanceofAndPatternInspection.syntaxes
          })
        );
        javaInstantiationReferences.push(
          ...staticJavaInstantiationReferences({
            extraction: input,
            callable: methodDeclaration,
            callableSymbol: methodSymbol,
            declaringType: classSymbol,
            imports
          })
        );
        if (hasJavaOverrideAnnotation(methodDeclaration)) {
          addPendingOverrideReference(methodSymbol, methodDeclaration);
        }
      }
      const reactNativeModule = staticJavaReactNativeModule(
        input,
        classDeclaration,
        methods,
        imports
      );
      if (reactNativeModule !== null) {
        for (const methodDeclaration of methods) {
          const methodSymbol = symbolsByMethod.get(methodDeclaration);
          if (
            methodSymbol === undefined ||
            !isJavaReactNativeMethod(methodDeclaration, imports, reactNativeModule.kind)
          ) {
            continue;
          }
          reactNativeNativeMethods.push({
            platform: "android",
            moduleName: reactNativeModule.moduleName,
            methodName: methodDeclaration.name,
            methodId: methodSymbol.id,
            filePath: input.filePath,
            range: rangeFor(lineStarts, methodDeclaration.node.from, methodDeclaration.node.to),
            ...(reactNativeModule.kind === "codegen-spec"
              ? { implementationKind: "codegen-spec-override" }
              : {})
          });
        }
      }
      for (const methodDeclaration of methods) {
        const methodSymbol = symbolsByMethod.get(methodDeclaration);
        if (methodSymbol === undefined) {
          continue;
        }
        for (const reference of staticSpringBootBeanConfigurationPropertiesPrefixReferences(
          input,
          classDeclaration,
          methodDeclaration,
          imports
        )) {
          springBootConfigurationPropertiesPrefixes.push({
            sourceId: methodSymbol.id,
            filePath: input.filePath,
            prefix: reference.prefix,
            range: rangeFor(lineStarts, reference.node.from, reference.node.to)
          });
        }
      }

      if (isSpringController(classDeclaration, imports)) {
        const prefixes = staticClassPrefixes(input, classDeclaration, imports);
        if (prefixes !== null) {
          for (const methodDeclaration of methods) {
            const routes = staticMethodRoutes(input, methodDeclaration, imports);
            const handler = symbolsByMethod.get(methodDeclaration);
            if (handler !== undefined) {
              for (const prefix of prefixes) {
                for (const route of routes) {
                  addFrameworkRoute(
                    classSymbol,
                    { ...route, path: joinHttpPaths(prefix, route.path) },
                    handler,
                    route.ruleId ??
                      "framework.spring-web.direct-controller.literal-method-mapping.local-method"
                  );
                }
              }
            }
          }
        }
      }

      const jakartaRestPrefix = staticJakartaRestClassPrefix(input, classDeclaration, imports);
      if (jakartaRestPrefix !== null) {
        for (const methodDeclaration of methods) {
          const route = staticJakartaRestMethodRoute(input, methodDeclaration, imports);
          const handler = symbolsByMethod.get(methodDeclaration);
          if (route !== null && handler !== undefined) {
            addFrameworkRoute(
              classSymbol,
              { ...route, path: joinHttpPaths(jakartaRestPrefix, route.path) },
              handler,
              "framework.jakarta-rest.direct-path.literal-method-mapping.local-method"
            );
          }
        }
      }

      const micronautPrefix = staticMicronautClassPrefix(input, classDeclaration, imports);
      if (micronautPrefix !== null) {
        for (const methodDeclaration of methods) {
          const route = staticMicronautMethodRoute(input, methodDeclaration, imports);
          const handler = symbolsByMethod.get(methodDeclaration);
          if (route !== null && handler !== undefined) {
            addFrameworkRoute(
              classSymbol,
              { ...route, path: joinHttpPaths(micronautPrefix, route.path) },
              handler,
              "framework.micronaut.direct-controller.literal-method-mapping.local-method"
            );
          }
        }
      }
    }

    for (const { declaration, symbol } of declaredClasses) {
      addExactSameFileSuperclass(symbol, declaration, typesByName);
      addExactSameFileInterfaceRelations(
        symbol,
        declaration,
        typesByName,
        "SuperInterfaces",
        "implements",
        "syntax.java.same-file.direct-implements"
      );
      const superclass = staticJavaDirectSuperclass(input, declaration);
      if (superclass !== null) {
        addJvmHeritageReference(symbol, superclass, "java-class-superclass", imports);
      }
      for (const reference of staticJavaDirectInterfaceReferences(
        input,
        declaration,
        "SuperInterfaces"
      )) {
        addJvmHeritageReference(symbol, reference, "java-class-interface", imports);
      }
    }
    for (const { declaration, symbol } of declaredInterfaces) {
      addExactSameFileInterfaceRelations(
        symbol,
        declaration,
        typesByName,
        "ExtendsInterfaces",
        "extends",
        "syntax.java.same-file.direct-interface-extends"
      );
      for (const reference of staticJavaDirectInterfaceReferences(
        input,
        declaration,
        "ExtendsInterfaces"
      )) {
        addJvmHeritageReference(symbol, reference, "java-interface-superinterface", imports);
      }
    }
  }

  if (recordInspection.isSyntaxClean) {
    for (const recordDeclaration of recordInspection.records) {
      const recordSymbol = addRecord(recordDeclaration, packageName);
      for (const reference of recordDeclaration.valueReferences) {
        const referenceRange = reference.node.range();
        springBootPropertiesValueReferences.push({
          sourceId: recordSymbol.id,
          filePath: input.filePath,
          key: reference.key,
          range: rangeFor(lineStarts, referenceRange.start.index, referenceRange.end.index)
        });
      }
      for (const reference of recordDeclaration.configurationPropertiesPrefixes) {
        const referenceRange = reference.node.range();
        springBootConfigurationPropertiesPrefixes.push({
          sourceId: recordSymbol.id,
          filePath: input.filePath,
          prefix: reference.prefix,
          range: rangeFor(lineStarts, referenceRange.start.index, referenceRange.end.index)
        });
      }
    }
  }

  if (modernDeclarationInspection.isSyntaxClean) {
    const projectedSymbols = new Map<number, SymbolNode>();
    const modernImportsByName = new Map<string, string | null>();
    for (const imported of modernDeclarationInspection.imports) {
      const previous = modernImportsByName.get(imported.localName);
      modernImportsByName.set(
        imported.localName,
        previous === undefined
          ? imported.importedPath
          : previous === imported.importedPath
            ? previous
            : null
      );
    }
    for (const [index, declaration] of modernDeclarationInspection.declarations.entries()) {
      const parent = declaration.parentIndex === null
        ? fileNode
        : projectedSymbols.get(declaration.parentIndex);
      if (parent === undefined) {
        continue;
      }
      const declarationRange = rangeFor(lineStarts, declaration.range.start, declaration.range.end);
      let symbol = symbols.find(
        (symbol) =>
          symbol.kind === declaration.kind &&
          symbol.name === declaration.name &&
          symbol.range.start.line === declarationRange.start.line
      );
      if (symbol === undefined) {
        const qualifiedName = parent.kind === "file"
          ? `${input.filePath}#${declaration.name}`
          : `${parent.qualifiedName}.${declaration.name}`;
        const declarationOrdinal = nextOrdinal(qualifiedName, declaration.kind);
        symbol = {
          id: createSymbolId({
            filePath: input.filePath,
            qualifiedName,
            kind: declaration.kind,
            declarationOrdinal
          }),
          name: declaration.name,
          qualifiedName,
          kind: declaration.kind,
          filePath: input.filePath,
          range: declarationRange,
          isExported: declaration.isExported,
          declarationOrdinal
        };
        symbols.push(symbol);
        addContainmentAtRange(parent, symbol, declarationRange);
        if (packageName !== null && declaration.kind !== "method") {
          if (declaration.kind === "class") {
            javaClassFacts.push({ symbolId: symbol.id, packageName });
          }
          jvmTypeFacts.push({
            symbolId: symbol.id,
            packageName,
            ...(declaration.isAnnotation === true ? { isAnnotation: true } : {})
          });
        }
      }
      if (
        declaration.kind === "method" &&
        declaration.callable !== undefined &&
        parent.kind !== "file" &&
        !javaCallableDeclarations.some((candidate) => candidate.symbolId === symbol.id)
      ) {
        javaCallableDeclarations.push({
          symbolId: symbol.id,
          declaringTypeId: parent.id,
          name: declaration.name,
          callableKind: declaration.callable.callableKind,
          isStatic: declaration.callable.isStatic,
          isFinal: declaration.callable.isFinal,
          visibility: declaration.callable.visibility,
          minimumArgumentCount: declaration.callable.minimumArgumentCount,
          maximumArgumentCount: declaration.callable.maximumArgumentCount,
          parameterTypes: Array.from(
            { length: declaration.callable.parameterCount },
            () => null
          )
        });
      }
      if (parent.kind === "file") {
        for (const reference of declaration.heritageReferences ?? []) {
          const range = rangeFor(lineStarts, reference.range.start, reference.range.end);
          const importedTypePath = modernImportsByName.get(reference.referenceName);
          const alreadyRetained = jvmHeritageReferences.some(
            (candidate) =>
              candidate.sourceId === symbol.id &&
              candidate.syntax === reference.relationKind &&
              candidate.referenceName === reference.referenceName &&
              candidate.range.start.line === range.start.line &&
              candidate.range.start.column === range.start.column
          );
          if (alreadyRetained || importedTypePath === null) {
            continue;
          }
          jvmHeritageReferences.push({
            sourceId: symbol.id,
            filePath: input.filePath,
            referenceName: reference.referenceName,
            syntax: reference.relationKind,
            range,
            ...(importedTypePath === undefined ? {} : { importedTypePath })
          });
        }
      }
      projectedSymbols.set(index, symbol);
    }
  }

  return {
    symbols,
    edges,
    pendingReferences,
    localBindings: [],
    referenceScopes: [],
    importBindings: [],
    exportBindings: [],
    reExportBindings: [],
    nestRouteFacts: {
      routeControllers: [],
      moduleControllers: [],
      routerModulePrefixes: []
    },
    fastifyPluginFacts: {
      routes: [],
      childRegistrations: [],
      rootRegistrations: []
    },
    fastApiRouterFacts: {
      routers: [],
      routes: [],
      importedRouterInclusions: []
    },
    javaFacts: {
      classes: javaClassFacts
    },
    jvmFacts: {
      types: jvmTypeFacts,
      heritageReferences: jvmHeritageReferences,
      importReferences: jvmImportReferences,
      annotationReferences: jvmAnnotationReferences,
      dependencyInjectionReferences: jvmDependencyInjectionReferences,
      callableSignatureReferences: jvmCallableSignatureReferences,
      javaCallableDeclarations,
      javaChainedCallReferences,
      javaMemberCallReferences,
      javaFieldDeclarations,
      javaInstantiationReferences
    },
    springBootPropertiesFacts: {
      valueReferences: springBootPropertiesValueReferences,
      configurationPropertiesPrefixes: springBootConfigurationPropertiesPrefixes
    },
    reactNativeFacts: {
      nativeModuleCalls: [],
      turboModuleCalls: [],
      turboModuleDefaultImportCalls: [],
      turboModuleDefaultExports: [],
      turboModuleSpecMethods: [],
      nativeMethods: reactNativeNativeMethods
    }
  };
}
