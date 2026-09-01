import { parse, type SgNode } from "./ast-grep-languages.js";

import {
  createEdgeId,
  createSymbolId,
  type ArtifactFacts,
  type GraphEdge,
  type PendingReference,
  type RubyCallFact,
  type RubyCallableFact,
  type RubyFacts,
  type RubyHeritageFact,
  type RubyImportFact,
  type RubyTypeFact,
  type RouteRegistration,
  type RouteMethod,
  type SourcePosition,
  type SourceRange,
  type SymbolNode
} from "../domain/index.js";
import { frameworkCapability } from "./framework-capabilities.js";

/** Ruby uses the shared prebuilt ast-grep Tree-sitter language registry. */

export interface RubyExtractFileFactsInput {
  readonly filePath: string;
  readonly sourceText: string;
  readonly language: "ruby";
}

type RubySyntaxNode = SgNode;

interface StaticRubyClass {
  readonly name: string;
  readonly constantPath: string;
  readonly node: RubySyntaxNode;
  readonly body: RubySyntaxNode | null;
}

interface StaticRubyModule {
  readonly name: string;
  readonly constantPath: string;
  readonly node: RubySyntaxNode;
  readonly body: RubySyntaxNode | null;
}

interface StaticRubyMethod {
  readonly name: string;
  readonly node: RubySyntaxNode;
}

interface StaticRubySingletonMethod {
  readonly name: string;
  readonly receiverPath: string | null;
  readonly node: RubySyntaxNode;
  readonly body: RubySyntaxNode | null;
}

interface StaticRailsControllerAction {
  readonly controller: string;
  /** A bare controller can be proven only when its class and method are in this file. */
  readonly localControllerName: string | null;
  readonly action: string;
}

interface StaticRailsRoute {
  readonly method: RouteMethod;
  readonly path: string;
  readonly action: StaticRailsControllerAction;
  readonly node: RubySyntaxNode;
  readonly routeRegistration?: Extract<RouteRegistration, "rails-resources" | "rails-resource">;
}

interface StaticRubyMemberCall {
  readonly receiver: RubySyntaxNode;
  readonly name: string;
  readonly block: RubySyntaxNode | null;
}

const RAILS_ROUTE_METHODS: Readonly<Record<string, RouteMethod>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  options: "OPTIONS"
};

const RUBY_AST_MAX_DEPTH = 2048;
const RUBY_AST_MAX_NODES = 100_000;

const RAILS_PLURAL_RESOURCE_ACTIONS = [
  "index",
  "create",
  "new",
  "show",
  "edit",
  "update",
  "destroy"
] as const;

const RAILS_SINGULAR_RESOURCE_ACTIONS = [
  "create",
  "new",
  "show",
  "edit",
  "update",
  "destroy"
] as const;

const RUBY_SINGLETON_METHOD_TABLE_MUTATION_NAMES: ReadonlySet<string> = new Set([
  "alias_method",
  "class_eval",
  "class_exec",
  "define_method",
  "define_singleton_method",
  "extend",
  "include",
  "instance_eval",
  "instance_exec",
  "module_eval",
  "module_function",
  "prepend",
  "public_send",
  "remove_method",
  "remove_singleton_method",
  "send",
  "singleton_class",
  "undef_method",
  "using"
]);

function directChildren(node: RubySyntaxNode): readonly RubySyntaxNode[] {
  return node.children();
}

function nodeText(node: RubySyntaxNode): string {
  return node.text();
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

function rangeForNode(node: RubySyntaxNode): SourceRange {
  const range = node.range();
  return {
    start: { line: range.start.line + 1, column: range.start.column + 1 },
    end: { line: range.end.line + 1, column: range.end.column + 1 }
  };
}

function rangeForSpan(
  lineStarts: readonly number[],
  from: number,
  to: number
): SourceRange {
  return {
    start: positionFor(lineStarts, from),
    end: positionFor(lineStarts, to)
  };
}

function hasSyntaxError(node: RubySyntaxNode): boolean {
  // tree-sitter-ruby represents a missing terminal (for example a missing
  // `end`) as an empty token node instead of an ERROR node. Treat either form
  // as invalid so a partially recovered route block never becomes a result.
  const pending: Array<{ readonly node: RubySyntaxNode; readonly depth: number }> = [
    { node, depth: 0 }
  ];
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      continue;
    }
    visited += 1;
    if (current.depth > RUBY_AST_MAX_DEPTH || visited > RUBY_AST_MAX_NODES) {
      return true;
    }
    if (
      current.node.kind() === "ERROR" ||
      (current.node.kind() !== "program" && nodeText(current.node).length === 0)
    ) {
      return true;
    }
    const children = directChildren(current.node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        pending.push({ node: child, depth: current.depth + 1 });
      }
    }
  }
  return false;
}

function identifierText(node: RubySyntaxNode): string | null {
  const value = nodeText(node);
  return /^[a-zA-Z_][a-zA-Z0-9_]*[!?=]?$/u.test(value) ? value : null;
}

function constantText(node: RubySyntaxNode): string | null {
  const value = nodeText(node);
  return /^[A-Z][a-zA-Z0-9_]*$/u.test(value) ? value : null;
}

function constantPath(node: RubySyntaxNode): { readonly name: string; readonly path: string } | null {
  const value = nodeText(node).replace(/^::/u, "");
  if (!/^[A-Z][a-zA-Z0-9_]*(?:::[A-Z][a-zA-Z0-9_]*)*$/u.test(value)) {
    return null;
  }
  const name = value.split("::").at(-1);
  return name === undefined ? null : { name, path: value };
}

function rubyMethodName(node: RubySyntaxNode): string | null {
  const value = nodeText(node);
  if (node.kind() === "identifier") {
    return identifierText(node);
  }
  if (node.kind() === "constant") {
    return constantText(node);
  }
  if (node.kind() === "setter") {
    return /^[a-z_][a-zA-Z0-9_]*=$/u.test(value) ? value : null;
  }
  if (node.kind() === "operator") {
    return /^(?:\[\]=?|\+@|-@|\*\*|<<|>>|<=>|===|==|=~|<=|>=|!=|!~|[+\-*/%&|^~!<>`])$/u.test(value)
      ? value
      : null;
  }
  return null;
}

function staticPlainRubyString(node: RubySyntaxNode): string | null {
  if (node.kind() !== "string") {
    return null;
  }
  const value = nodeText(node);
  if (
    value.length < 2 ||
    value[0] !== "\"" ||
    value.at(-1) !== "\"" ||
    value[1] === "\"" ||
    value.at(-2) === "\"" ||
    value.includes("\\") ||
    value.includes("#{") ||
    /[\r\n]/u.test(value)
  ) {
    return null;
  }
  return value.slice(1, -1);
}

function staticRailsPath(node: RubySyntaxNode): string | null {
  const path = staticPlainRubyString(node);
  return path === null || !path.startsWith("/") || path.includes("//") ? null : path;
}

function staticRubyClass(node: RubySyntaxNode): StaticRubyClass | null {
  if (node.kind() !== "class") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children.find(
    (child) => child.kind() === "constant" || child.kind() === "scope_resolution"
  );
  const body = children.find((child) => child.kind() === "body_statement");
  const name = nameNode === undefined ? null : constantPath(nameNode);
  return name === null
    ? null
    : { name: name.name, constantPath: name.path, node, body: body ?? null };
}

function staticRubyModule(node: RubySyntaxNode): StaticRubyModule | null {
  if (node.kind() !== "module") {
    return null;
  }
  const children = directChildren(node);
  const names = children.filter(
    (child) => child.kind() === "constant" || child.kind() === "scope_resolution"
  );
  const bodies = children.filter((child) => child.kind() === "body_statement");
  const nameNode = names[0];
  const body = bodies[0];
  const name = nameNode === undefined ? null : constantPath(nameNode);
  return name === null || names.length !== 1 || bodies.length > 1
    ? null
    : { name: name.name, constantPath: name.path, node, body: body ?? null };
}

function staticRubyMethod(node: RubySyntaxNode): StaticRubyMethod | null {
  if (node.kind() !== "method") {
    return null;
  }
  const nameNode = directChildren(node).find((child) =>
    child.kind() === "identifier" || child.kind() === "constant" || child.kind() === "setter" || child.kind() === "operator"
  );
  const name = nameNode === undefined ? null : rubyMethodName(nameNode);
  return name === null ? null : { name, node };
}

function staticRubySingletonMethod(node: RubySyntaxNode): StaticRubySingletonMethod | null {
  if (node.kind() !== "singleton_method") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children[3];
  const bodies = children.filter((child) => child.kind() === "body_statement");
  const name = nameNode === undefined ? null : rubyMethodName(nameNode);
  const receiver = children[1];
  const receiverPath =
    receiver?.kind() === "self" ? null : receiver === undefined ? null : constantPath(receiver)?.path;
  return (
    name === null ||
    children[0]?.kind() !== "def" ||
    receiver === undefined ||
    (receiver.kind() !== "self" && receiverPath === undefined) ||
    children[2]?.kind() !== "." ||
    bodies.length > 1
  )
    ? null
    : { name, receiverPath: receiver.kind() === "self" ? null : receiverPath ?? null, node, body: bodies[0] ?? null };
}

function rubyMethodParameterCount(node: RubySyntaxNode): number {
  const parameters = directChildren(node).find((child) => child.kind() === "method_parameters");
  if (parameters === undefined) return 0;
  return directChildren(parameters).filter(
    (child) => child.kind() !== "(" && child.kind() !== ")" && child.kind() !== ","
  ).length;
}

function staticRubySuperclass(node: RubySyntaxNode): { readonly path: string; readonly node: RubySyntaxNode } | null {
  const superclass = directChildren(node).find((child) => child.kind() === "superclass");
  if (superclass === undefined) return null;
  const parent = directChildren(superclass).find(
    (child) => child.kind() === "constant" || child.kind() === "scope_resolution"
  );
  const path = parent === undefined ? null : constantPath(parent)?.path ?? null;
  return path === null || parent === undefined ? null : { path, node: parent };
}

function staticRubyRequireRelative(node: RubySyntaxNode): string | null {
  if (node.kind() !== "call") return null;
  const children = directChildren(node);
  if (children[0]?.kind() !== "identifier" || nodeText(children[0]) !== "require_relative") return null;
  const argumentList = children[1];
  if (argumentList?.kind() !== "argument_list" || children.length !== 2) return null;
  const arguments_ = directChildren(argumentList).filter(
    (child) => child.kind() !== "(" && child.kind() !== ")" && child.kind() !== ","
  );
  return arguments_.length === 1 && arguments_[0] !== undefined
    ? staticPlainRubyString(arguments_[0])
    : null;
}

function staticRubyQualifiedCall(node: RubySyntaxNode): {
  readonly receiverTypePath: string;
  readonly name: string;
  readonly argumentCount: number;
} | null {
  if (node.kind() !== "call") return null;
  const children = directChildren(node);
  const receiver = children[0];
  const nameNode = children[2];
  if (
    receiver === undefined ||
    (receiver.kind() !== "constant" && receiver.kind() !== "scope_resolution") ||
    children[1]?.kind() !== "." ||
    nameNode === undefined
  ) return null;
  const receiverPath = constantPath(receiver)?.path;
  const name = rubyMethodName(nameNode);
  if (receiverPath === undefined || name === null) return null;
  const tail = children.slice(3);
  const argumentLists = tail.filter((child) => child.kind() === "argument_list");
  const nonArguments = tail.filter((child) => child.kind() !== "argument_list");
  if (nonArguments.length !== 0 || argumentLists.length > 1) return null;
  const argumentList = argumentLists[0];
  if (argumentList === undefined) return { receiverTypePath: receiverPath, name, argumentCount: 0 };
  const arguments_ = directChildren(argumentList).filter(
    (child) => child.kind() !== "(" && child.kind() !== ")" && child.kind() !== ","
  );
  if (
    arguments_.some((child) =>
      child.kind() === "splat_argument" ||
      child.kind() === "hash_splat_argument" ||
      child.kind() === "block_argument"
    )
  ) return null;
  return { receiverTypePath: receiverPath, name, argumentCount: arguments_.length };
}

const RUBY_RELATION_MUTATION_NAMES = new Set([
  "alias_method", "class_eval", "class_exec", "const_get", "const_set", "define_method",
  "define_singleton_method", "extend", "include", "instance_eval", "instance_exec",
  "method_missing", "module_eval", "prepend", "public_send", "remove_const", "remove_method",
  "remove_singleton_method", "send", "singleton_class", "undef_method", "using"
]);

function hasRubyRelationMutation(root: RubySyntaxNode): boolean {
  const pending: RubySyntaxNode[] = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (node.kind() === "alias" || node.kind() === "undef") return true;
    if (node.kind() === "assignment" && /^[A-Z][A-Za-z0-9_:]*\s*=/u.test(nodeText(node))) return true;
    if (node.kind() === "call") {
      const name = rubyCallName(node);
      if (name !== null && RUBY_RELATION_MUTATION_NAMES.has(name)) return true;
    }
    pending.push(...directChildren(node));
  }
  return false;
}

/**
 * The singleton-call slice accepts no module-scope execution: every direct
 * body child must be one of the explicitly modelled `def self.name` forms.
 */
function staticRubyModuleSingletonMethods(
  module: StaticRubyModule
): readonly StaticRubySingletonMethod[] | null {
  if (module.body === null) {
    return [];
  }
  const declarations = directChildren(module.body);
  const methods = declarations
    .map((node) => staticRubySingletonMethod(node))
    .filter((candidate): candidate is StaticRubySingletonMethod => candidate !== null);
  return methods.length === declarations.length ? methods : null;
}

function rubyCallName(node: RubySyntaxNode): string | null {
  if (node.kind() !== "call") {
    return null;
  }
  const identifiers = directChildren(node).filter((child) => child.kind() === "identifier");
  const nameNode = identifiers[identifiers.length - 1];
  return identifiers.length === 1 && nameNode !== undefined ? identifierText(nameNode) : null;
}

/** True for `singleton_class` and receiver chains rooted at it. */
function isRubySingletonClassChain(node: RubySyntaxNode): boolean {
  if (node.kind() === "identifier") {
    return nodeText(node) === "singleton_class";
  }
  if (node.kind() !== "call") {
    return false;
  }
  const children = directChildren(node);
  return children[0] !== undefined && children[1]?.kind() === "." && isRubySingletonClassChain(children[0]);
}

function isRubySingletonClassMutation(node: RubySyntaxNode): boolean {
  if (node.kind() !== "call") {
    return false;
  }
  const children = directChildren(node);
  const receiver = children[0];
  const methodName = children[2];
  const name = methodName === undefined ? null : identifierText(methodName);
  return (
    receiver !== undefined &&
    children[1]?.kind() === "." &&
    name !== null &&
    RUBY_SINGLETON_METHOD_TABLE_MUTATION_NAMES.has(name) &&
    isRubySingletonClassChain(receiver)
  );
}

function hasRubyModuleSingletonAmbiguity(module: StaticRubyModule): boolean {
  if (module.body === null) {
    return false;
  }
  const pending: RubySyntaxNode[] = [module.body];
  let visited = 0;
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      continue;
    }
    visited += 1;
    if (visited > RUBY_AST_MAX_NODES) {
      return true;
    }
    if (node.kind() === "alias" || node.kind() === "undef" || node.kind() === "singleton_class") {
      return true;
    }
    const name = rubyCallName(node);
    if (
      isRubySingletonClassMutation(node) ||
      (name !== null && RUBY_SINGLETON_METHOD_TABLE_MUTATION_NAMES.has(name))
    ) {
      return true;
    }
    for (const child of directChildren(node)) {
      pending.push(child);
    }
  }
  return false;
}

function staticMemberCall(node: RubySyntaxNode): StaticRubyMemberCall | null {
  if (node.kind() !== "call") {
    return null;
  }
  const children = directChildren(node);
  const receiver = children[0];
  const nameNode = children[2];
  const tail = children.slice(3);
  const name = nameNode === undefined ? null : identifierText(nameNode);
  const block = tail.find((child) => child.kind() === "do_block");
  return (
    receiver === undefined ||
    name === null ||
    children[1]?.kind() !== "." ||
    tail.filter((child) => child.kind() !== "do_block").length !== 0 ||
    tail.filter((child) => child.kind() === "do_block").length > 1
  )
    ? null
    : { receiver, name, block: block ?? null };
}

function isRailsApplication(node: RubySyntaxNode): boolean {
  const call = staticMemberCall(node);
  return (
    call !== null &&
    call.name === "application" &&
    call.block === null &&
    call.receiver.kind() === "constant" &&
    nodeText(call.receiver) === "Rails"
  );
}

function isRailsRoutes(node: RubySyntaxNode): boolean {
  const call = staticMemberCall(node);
  return call !== null && call.name === "routes" && call.block === null && isRailsApplication(call.receiver);
}

function staticRailsRoutesDraw(node: RubySyntaxNode): RubySyntaxNode | null {
  const call = staticMemberCall(node);
  if (call === null || call.name !== "draw" || call.block === null || !isRailsRoutes(call.receiver)) {
    return null;
  }
  const blockChildren = directChildren(call.block);
  if (blockChildren.some((child) => child.kind() === "block_parameters")) {
    return null;
  }
  const bodies = blockChildren.filter((child) => child.kind() === "body_statement");
  return bodies.length === 1 && bodies[0] !== undefined ? bodies[0] : null;
}

function staticRailsDrawBodies(root: RubySyntaxNode): readonly RubySyntaxNode[] {
  const bodies: RubySyntaxNode[] = [];
  const pending: RubySyntaxNode[] = [root];
  let visited = 0;
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      continue;
    }
    visited += 1;
    if (visited > RUBY_AST_MAX_NODES) {
      return [];
    }
    const body = staticRailsRoutesDraw(node);
    if (body !== null) {
      bodies.push(body);
    }
    const children = directChildren(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        pending.push(child);
      }
    }
  }
  return bodies;
}

function staticRailsToAction(node: RubySyntaxNode): StaticRailsControllerAction | null {
  if (node.kind() !== "pair") {
    return null;
  }
  const children = directChildren(node);
  const key = children[0];
  const separator = children[1];
  const value = children[2];
  if (
    key === undefined ||
    separator === undefined ||
    value === undefined ||
    children.length !== 3 ||
    key.kind() !== "hash_key_symbol" ||
    separator.kind() !== ":" ||
    nodeText(key) !== "to"
  ) {
    return null;
  }
  const actionValue = staticPlainRubyString(value);
  const match =
    actionValue === null
      ? null
      : /^([a-z_][a-z0-9_]*(?:\/[a-z_][a-z0-9_]*)*)#([a-z_][a-zA-Z0-9_]*)$/u.exec(
          actionValue
        );
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  return staticRailsControllerAction(match[1], match[2]);
}

function staticRailsHashRocketAction(node: RubySyntaxNode): {
  readonly path: string;
  readonly action: StaticRailsControllerAction;
} | null {
  if (node.kind() !== "pair") {
    return null;
  }
  const children = directChildren(node);
  const pathNode = children[0];
  const operator = children[1];
  const value = children[2];
  if (
    children.length !== 3 ||
    pathNode?.kind() !== "string" ||
    operator?.kind() !== "=>" ||
    value?.kind() !== "string"
  ) {
    return null;
  }
  const path = staticRailsPath(pathNode);
  const handler = staticPlainRubyString(value);
  const match =
    handler === null
      ? null
      : /^([a-z_][a-z0-9_]*(?:\/[a-z_][a-z0-9_]*)*)#([a-z_][a-zA-Z0-9_]*)$/u.exec(handler);
  if (
    path === null ||
    match === null ||
    match[1] === undefined ||
    match[2] === undefined
  ) {
    return null;
  }
  const action = staticRailsControllerAction(match[1], match[2]);
  return action === null ? null : { path, action };
}

function staticRailsAsOption(node: RubySyntaxNode): boolean {
  if (node.kind() !== "pair") {
    return false;
  }
  const children = directChildren(node);
  const key = children[0];
  const separator = children[1];
  const value = children[2];
  if (
    children.length !== 3 ||
    key === undefined ||
    separator === undefined ||
    value === undefined ||
    key.kind() !== "hash_key_symbol" ||
    separator.kind() !== ":" ||
    nodeText(key) !== "as" ||
    (value.kind() !== "simple_symbol" && value.kind() !== "string")
  ) {
    return false;
  }
  const asValue =
    value.kind() === "simple_symbol"
      ? /^:([a-z_][a-zA-Z0-9_]*)$/u.exec(nodeText(value))?.[1] ?? null
      : staticPlainRubyString(value);
  return asValue !== null && /^[a-z_][a-zA-Z0-9_]*$/u.test(asValue);
}

function staticRailsControllerAction(
  controller: string,
  action: string
): StaticRailsControllerAction | null {
  if (
    !/^([a-z_][a-z0-9_]*(?:\/[a-z_][a-z0-9_]*)*)$/u.test(controller) ||
    !/^[a-z_][a-zA-Z0-9_]*$/u.test(action)
  ) {
    return null;
  }
  const localControllerName = controller.includes("/")
    ? null
    : controller
        .split("_")
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join("") + "Controller";
  return { controller, localControllerName, action };
}

function staticRailsRoute(node: RubySyntaxNode): StaticRailsRoute | null {
  if (node.kind() !== "call") {
    return null;
  }
  const children = directChildren(node);
  const nameNode = children[0];
  const argumentList = children[1];
  const methodName = nameNode === undefined ? null : identifierText(nameNode);
  const method = methodName === null ? undefined : RAILS_ROUTE_METHODS[methodName];
  if (
    method === undefined ||
    argumentList?.kind() !== "argument_list" ||
    children.length !== 2
  ) {
    return null;
  }
  const arguments_ = directChildren(argumentList).filter(
    (child) => child.kind() !== "," && child.kind() !== "comment"
  );
  if (arguments_.length === 2 && arguments_[0]?.kind() === "string" && arguments_[1]?.kind() === "pair") {
    const path = staticRailsPath(arguments_[0]);
    const action = staticRailsToAction(arguments_[1]);
    return path === null || action === null ? null : { method, path, action, node };
  }
  if (
    (arguments_.length !== 1 && arguments_.length !== 2) ||
    arguments_[0]?.kind() !== "pair"
  ) {
    return null;
  }
  const hashRoute = staticRailsHashRocketAction(arguments_[0]);
  if (
    hashRoute === null ||
    (arguments_.length === 2 &&
      (arguments_[1] === undefined || !staticRailsAsOption(arguments_[1])))
  ) {
    return null;
  }
  return { method, path: hashRoute.path, action: hashRoute.action, node };
}

function staticRailsSimpleSymbol(node: RubySyntaxNode): string | null {
  if (node.kind() !== "simple_symbol") {
    return null;
  }
  const match = /^:([a-z_][a-z0-9_]*)$/u.exec(nodeText(node));
  return match?.[1] ?? null;
}

function staticRailsResourceFilter(
  node: RubySyntaxNode,
  allowedActions: readonly string[]
): readonly string[] | null {
  if (node.kind() !== "pair") {
    return null;
  }
  const children = directChildren(node);
  const key = children[0];
  const separator = children[1];
  const value = children[2];
  if (
    children.length !== 3 ||
    key?.kind() !== "hash_key_symbol" ||
    nodeText(key) !== "only" && nodeText(key) !== "except" ||
    separator?.kind() !== ":" ||
    value?.kind() !== "array"
  ) {
    return null;
  }
  const entries = directChildren(value);
  if (
    entries.length < 2 ||
    entries[0]?.kind() !== "[" ||
    entries.at(-1)?.kind() !== "]" ||
    entries.some(
      (entry, index) =>
        index !== 0 &&
        index !== entries.length - 1 &&
        entry.kind() !== "simple_symbol" &&
        entry.kind() !== ","
    )
  ) {
    return null;
  }
  const selected = entries
    .filter((entry) => entry.kind() === "simple_symbol")
    .map(staticRailsSimpleSymbol);
  if (
    selected.some((entry) => entry === null) ||
    new Set(selected).size !== selected.length ||
    selected.some((entry) => entry === null || !allowedActions.includes(entry))
  ) {
    return null;
  }
  const selectedActions = new Set(selected.filter((entry): entry is string => entry !== null));
  return nodeText(key) === "only"
    ? allowedActions.filter((action) => selectedActions.has(action))
    : allowedActions.filter((action) => !selectedActions.has(action));
}

function pluralizeRailsResource(resource: string): string {
  if (/[^aeiou]y$/u.test(resource)) {
    return resource.slice(0, -1) + "ies";
  }
  if (/(s|x|z|ch|sh)$/u.test(resource)) {
    return resource + "es";
  }
  return resource + "s";
}

function staticRailsResourceRoutes(node: RubySyntaxNode): readonly StaticRailsRoute[] {
  if (node.kind() !== "call") {
    return [];
  }
  const children = directChildren(node);
  const nameNode = children[0];
  const argumentList = children[1];
  const methodName = nameNode === undefined ? null : identifierText(nameNode);
  const plural = methodName === "resources";
  if (
    (methodName !== "resources" && methodName !== "resource") ||
    argumentList?.kind() !== "argument_list" ||
    children.length !== 2
  ) {
    return [];
  }
  const arguments_ = directChildren(argumentList);
  const resourceNode = arguments_[0];
  const filterNode = arguments_[2];
  const allowedActions = plural ? RAILS_PLURAL_RESOURCE_ACTIONS : RAILS_SINGULAR_RESOURCE_ACTIONS;
  if (
    resourceNode === undefined ||
    staticRailsSimpleSymbol(resourceNode) === null ||
    !(
      arguments_.length === 1 ||
      (arguments_.length === 3 && arguments_[1]?.kind() === "," && filterNode !== undefined)
    )
  ) {
    return [];
  }
  const resource = staticRailsSimpleSymbol(resourceNode);
  if (resource === null) {
    return [];
  }
  const selectedActions =
    filterNode === undefined ? allowedActions : staticRailsResourceFilter(filterNode, allowedActions);
  if (selectedActions === null) {
    return [];
  }
  const controller = plural ? resource : pluralizeRailsResource(resource);
  const routeRegistration = plural ? "rails-resources" : "rails-resource";
  const basePath = "/" + resource;
  const itemPath = plural ? basePath + "/:id" : basePath;
  return selectedActions.flatMap((actionName): readonly StaticRailsRoute[] => {
    const action = staticRailsControllerAction(controller, actionName);
    if (action === null) {
      return [];
    }
    const route = (method: RouteMethod, path: string): StaticRailsRoute => ({
      method,
      path,
      action,
      node,
      routeRegistration
    });
    switch (actionName) {
      case "index":
        return [route("GET", basePath)];
      case "create":
        return [route("POST", basePath)];
      case "new":
        return [route("GET", basePath + "/new")];
      case "show":
        return [route("GET", itemPath)];
      case "edit":
        return [route("GET", itemPath + "/edit")];
      case "update":
        return [route("PATCH", itemPath), route("PUT", itemPath)];
      case "destroy":
        return [route("DELETE", itemPath)];
      default:
        return [];
    }
  });
}

export function extractRubyFileFacts(input: RubyExtractFileFactsInput): ArtifactFacts {
  const railsCapability = frameworkCapability("rails");
  if (!railsCapability.languages.includes(input.language)) {
    throw new Error("Rails framework extraction was invoked for an unsupported source language.");
  }

  const root = parse("ruby", input.sourceText).root();
  const lineStarts = lineStartsFor(input.sourceText);
  const symbols: SymbolNode[] = [];
  const edges: GraphEdge[] = [];
  const pendingReferences: PendingReference[] = [];
  const rubyTypes: RubyTypeFact[] = [];
  const rubyCallables: RubyCallableFact[] = [];
  const rubyImports: RubyImportFact[] = [];
  const rubyHeritage: RubyHeritageFact[] = [];
  const rubyCalls: RubyCallFact[] = [];
  const typePathsBySymbolId = new Map<string, string>();
  const callableRanges: Array<{ readonly sourceId: string; readonly start: number; readonly end: number }> = [];
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
    range: rangeForSpan(lineStarts, 0, input.sourceText.length),
    isExported: true,
    declarationOrdinal: 0
  };
  symbols.push(fileNode);

  function nextOrdinal(qualifiedName: string, kind: SymbolNode["kind"]): number {
    const identity = qualifiedName + "\u0000" + kind;
    const ordinal = declarationOrdinals.get(identity) ?? 0;
    declarationOrdinals.set(identity, ordinal + 1);
    return ordinal;
  }

  function fullRubyTypePath(parent: SymbolNode, declaration: StaticRubyClass | StaticRubyModule): string {
    if (declaration.constantPath.includes("::")) return declaration.constantPath;
    const parentPath = typePathsBySymbolId.get(parent.id);
    return parentPath === undefined ? declaration.name : `${parentPath}::${declaration.name}`;
  }

  function addContainment(
    parent: SymbolNode,
    child: SymbolNode,
    node: RubySyntaxNode,
    ruleId = "syntax.containment"
  ): void {
    const range = rangeForNode(node);
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

  function addClass(parent: SymbolNode, declaration: StaticRubyClass): SymbolNode {
    const typePath = fullRubyTypePath(parent, declaration);
    const qualifiedName =
      declaration.constantPath.includes("::")
        ? input.filePath + "#" + declaration.constantPath
        : parent.kind === "file"
        ? input.filePath + "#" + declaration.name
        : parent.qualifiedName + "." + declaration.name;
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
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(
      parent,
      symbol,
      declaration.node,
      parent.kind === "file"
        ? "language.ruby.v1_6.direct-declaration.containment"
        : "language.ruby.v1_6.lexical-declaration.containment"
    );
    typePathsBySymbolId.set(symbol.id, typePath);
    rubyTypes.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      constantPath: typePath,
      declarationKind: "class",
      isExported: symbol.isExported,
      range: symbol.range
    });
    const superclass = staticRubySuperclass(declaration.node);
    if (superclass !== null) {
      rubyHeritage.push({
        sourceId: symbol.id,
        filePath: input.filePath,
        sourceTypePath: typePath,
        targetTypePath: superclass.path,
        range: rangeForNode(superclass.node)
      });
    }
    return symbol;
  }

  function addModule(parent: SymbolNode, declaration: StaticRubyModule): SymbolNode {
    const typePath = fullRubyTypePath(parent, declaration);
    const qualifiedName =
      declaration.constantPath.includes("::")
        ? input.filePath + "#" + declaration.constantPath
        : parent.kind === "file"
        ? input.filePath + "#" + declaration.name
        : parent.qualifiedName + "." + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "module");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "module",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "module",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(
      parent,
      symbol,
      declaration.node,
      parent.kind === "file"
        ? "language.ruby.v1_6.direct-declaration.containment"
        : "language.ruby.v1_6.lexical-declaration.containment"
    );
    typePathsBySymbolId.set(symbol.id, typePath);
    rubyTypes.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      constantPath: typePath,
      declarationKind: "module",
      isExported: symbol.isExported,
      range: symbol.range
    });
    return symbol;
  }

  function addMethod(parent: SymbolNode, declaration: StaticRubyMethod): SymbolNode {
    const qualifiedName = parent.qualifiedName + "." + declaration.name;
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
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    const ownerTypePath = typePathsBySymbolId.get(parent.id);
    rubyCallables.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      ...(ownerTypePath === undefined ? {} : { ownerTypePath }),
      isSingleton: false,
      parameterCount: rubyMethodParameterCount(declaration.node),
      isExported: symbol.isExported,
      range: symbol.range
    });
    callableRanges.push({
      sourceId: symbol.id,
      start: declaration.node.range().start.index,
      end: declaration.node.range().end.index
    });
    return symbol;
  }

  function addSingletonMethod(
    parent: SymbolNode,
    declaration: StaticRubySingletonMethod
  ): SymbolNode {
    const qualifiedName =
      declaration.receiverPath === null
        ? parent.qualifiedName + "." + declaration.name
        : parent.qualifiedName + "." + declaration.receiverPath + "." + declaration.name;
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
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    const parentTypePath = typePathsBySymbolId.get(parent.id);
    const ownerTypePath = declaration.receiverPath === null
      ? parentTypePath
      : parentTypePath === undefined
        ? declaration.receiverPath
        : `${parentTypePath}::${declaration.receiverPath}`;
    rubyCallables.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      ...(ownerTypePath === undefined ? {} : { ownerTypePath }),
      isSingleton: true,
      parameterCount: rubyMethodParameterCount(declaration.node),
      isExported: symbol.isExported,
      range: symbol.range
    });
    callableRanges.push({
      sourceId: symbol.id,
      start: declaration.node.range().start.index,
      end: declaration.node.range().end.index
    });
    return symbol;
  }

  function addFunction(parent: SymbolNode, declaration: StaticRubyMethod): SymbolNode {
    const qualifiedName =
      parent.kind === "file"
        ? input.filePath + "#" + declaration.name
        : parent.qualifiedName + "." + declaration.name;
    const declarationOrdinal = nextOrdinal(qualifiedName, "function");
    const symbol: SymbolNode = {
      id: createSymbolId({
        filePath: input.filePath,
        qualifiedName,
        kind: "function",
        declarationOrdinal
      }),
      name: declaration.name,
      qualifiedName,
      kind: "function",
      filePath: input.filePath,
      range: rangeForNode(declaration.node),
      isExported: true,
      declarationOrdinal
    };
    symbols.push(symbol);
    addContainment(parent, symbol, declaration.node);
    rubyCallables.push({
      symbolId: symbol.id,
      filePath: input.filePath,
      name: declaration.name,
      isSingleton: false,
      parameterCount: rubyMethodParameterCount(declaration.node),
      isExported: symbol.isExported,
      range: symbol.range
    });
    callableRanges.push({
      sourceId: symbol.id,
      start: declaration.node.range().start.index,
      end: declaration.node.range().end.index
    });
    return symbol;
  }

  function addRailsRoute(routeFact: StaticRailsRoute): void {
    const routeName = routeFact.method + " " + routeFact.path;
    const qualifiedName = input.filePath + "#route:" + routeName;
    const declarationOrdinal = nextOrdinal(qualifiedName, "route");
    const range = rangeForNode(routeFact.node);
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
    addContainment(
      fileNode,
      route,
      routeFact.node,
      "language.ruby.v1_6_1.rails.direct-routes-draw.literal-registration.containment"
    );
  }

  const parserRejected = hasSyntaxError(root);
  if (!parserRejected) {
    type RubyStructuralScope = "file" | "class" | "module" | "method";
    function visitStructural(
      node: RubySyntaxNode,
      owner: SymbolNode,
      scope: RubyStructuralScope,
      singletonClassReceiverPath?: string
    ): void {
      const classDeclaration = staticRubyClass(node);
      if (classDeclaration !== null) {
        const symbol = addClass(owner, classDeclaration);
        if (classDeclaration.body !== null) {
          for (const child of directChildren(classDeclaration.body)) {
            visitStructural(child, symbol, "class");
          }
        }
        return;
      }
      const moduleDeclaration = staticRubyModule(node);
      if (moduleDeclaration !== null) {
        const symbol = addModule(owner, moduleDeclaration);
        if (moduleDeclaration.body !== null) {
          for (const child of directChildren(moduleDeclaration.body)) {
            visitStructural(child, symbol, "module");
          }
        }
        return;
      }
      if (node.kind() === "class" || node.kind() === "module") {
        return;
      }
      if (node.kind() === "singleton_class") {
        const children = directChildren(node);
        const body = children.find((child) => child.kind() === "body_statement");
        const receiver = children[2];
        if (receiver?.kind() === "self" && body !== undefined) {
          for (const child of directChildren(body)) {
            visitStructural(child, owner, scope);
          }
        } else if (receiver !== undefined && body !== undefined && (scope === "class" || scope === "module")) {
          const receiverPath = constantPath(receiver)?.path;
          if (receiverPath !== undefined) {
            for (const child of directChildren(body)) {
              visitStructural(child, owner, scope, receiverPath);
            }
          }
        }
        return;
      }
      const singletonMethod = staticRubySingletonMethod(node);
      if (singletonMethod !== null) {
        const symbol =
          scope === "class" || scope === "module"
            ? addSingletonMethod(owner, singletonMethod)
            : addFunction(owner, singletonMethod);
        if (singletonMethod.body !== null) {
          for (const child of directChildren(singletonMethod.body)) {
            visitStructural(child, symbol, "method");
          }
        }
        return;
      }
      const method = staticRubyMethod(node);
      if (method !== null) {
        const symbol =
          singletonClassReceiverPath !== undefined
            ? addSingletonMethod(owner, {
                name: method.name,
                receiverPath: singletonClassReceiverPath,
                node: method.node,
                body: directChildren(method.node).find(
                  (child) => child.kind() === "body_statement"
                ) ?? null
              })
            : scope === "class" || scope === "module"
            ? addMethod(owner, method)
            : addFunction(owner, method);
        for (const child of directChildren(node)) {
          visitStructural(child, symbol, "method");
        }
        return;
      }
      for (const child of directChildren(node)) {
        visitStructural(child, owner, scope);
      }
    }

    const topLevel = directChildren(root);
    for (const node of topLevel) {
      visitStructural(node, fileNode, "file");
    }

    const routeDeclarations = staticRailsDrawBodies(root)
      .flatMap((body) => directChildren(body).map((node) => staticRailsRoute(node)))
      .filter((candidate): candidate is StaticRailsRoute => candidate !== null)
      .map((route, order) => ({ route, order }))
      .sort((left, right) => {
        const offset = left.route.node.range().start.index - right.route.node.range().start.index;
        return offset === 0 ? left.order - right.order : offset;
      });
    for (const { route } of routeDeclarations) {
      addRailsRoute(route);
    }

    const relationNodes: RubySyntaxNode[] = [root];
    while (relationNodes.length > 0) {
      const node = relationNodes.pop();
      if (node === undefined) continue;
      const importedPath = staticRubyRequireRelative(node);
      if (importedPath !== null) {
        rubyImports.push({
          sourceId: fileNode.id,
          filePath: input.filePath,
          importedPath,
          range: rangeForNode(node)
        });
      }
      const qualifiedCall = staticRubyQualifiedCall(node);
      if (qualifiedCall !== null) {
        const offset = node.range().start.index;
        const owner = callableRanges
          .filter((candidate) => candidate.start <= offset && offset <= candidate.end)
          .sort((left, right) => right.start - left.start)[0];
        if (owner !== undefined) {
          rubyCalls.push({
            sourceId: owner.sourceId,
            filePath: input.filePath,
            receiverTypePath: qualifiedCall.receiverTypePath,
            referenceName: qualifiedCall.name,
            argumentCount: qualifiedCall.argumentCount,
            range: rangeForNode(node)
          });
        }
      }
      relationNodes.push(...directChildren(node));
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
    rubyFacts: {
      parserRejected,
      ...(parserRejected || !hasRubyRelationMutation(root) ? {} : { unsafeDynamicFeatures: true }),
      types: rubyTypes,
      callables: rubyCallables,
      imports: rubyImports,
      heritage: rubyHeritage,
      calls: rubyCalls
    } satisfies RubyFacts,
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
    }
  };
}
