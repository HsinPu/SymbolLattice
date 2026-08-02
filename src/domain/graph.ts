import {
  HIERARCHY_RELATION_KINDS,
  type EdgeKind,
  type GraphEdge,
  type HierarchyRelationKind,
  type SymbolNode
} from "./types.js";

/** Exact static edge kinds eligible for bounded impact evidence. */
export const DEFAULT_EXACT_IMPACT_EDGE_KINDS = [
  "calls",
  "references",
  "routes",
  "handles",
  "imports"
] as const satisfies readonly EdgeKind[];

/** Exact static edge kinds eligible for bounded topology relevance. */
export const DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS = [
  ...DEFAULT_EXACT_IMPACT_EDGE_KINDS,
  ...HIERARCHY_RELATION_KINDS
] as const satisfies readonly EdgeKind[];

const DEFAULT_IMPACT_EDGE_KINDS: readonly EdgeKind[] = DEFAULT_EXACT_IMPACT_EDGE_KINDS;

/**
 * HTTP methods plus the explicit client-navigation discriminator represented
 * by static route symbols. `NAVIGATE` is not an HTTP method.
 */
export const ROUTE_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
  "CONNECT",
  "ALL",
  "NAVIGATE"
] as const;

export type RouteMethod = (typeof ROUTE_METHODS)[number];

const ROUTE_METHOD_SET = new Set<string>(ROUTE_METHODS);

/** Non-HTTP transports represented by static entrypoint symbols. */
export const ENTRYPOINT_TRANSPORTS = ["graphql", "microservice", "websocket", "ui"] as const;

export type EntryPointTransport = (typeof ENTRYPOINT_TRANSPORTS)[number];

/** Operations recognized within one supported entrypoint transport. */
export const ENTRYPOINT_OPERATIONS = [
  "query",
  "mutation",
  "subscription",
  "message",
  "event",
  "subscribe",
  "root"
] as const;

export type EntryPointOperation = (typeof ENTRYPOINT_OPERATIONS)[number];

const ENTRYPOINT_TRANSPORT_SET = new Set<string>(ENTRYPOINT_TRANSPORTS);
const ENTRYPOINT_OPERATION_SET = new Set<string>(ENTRYPOINT_OPERATIONS);

/** Exact file-level edges trusted for affected-test selection. */
export const AFFECTED_TEST_EDGE_KINDS = ["imports", "exports"] as const;

export type TestFileClassification = "test-file-name" | "test-directory";

/** Conservative conventional test-file identification for indexed source paths. */
export function classifyTestFile(filePath: string): TestFileClassification | null {
  const normalizedPath = filePath.replaceAll("\\", "/");
  if (/(?:^|\/)(?:__tests__|tests?|spec|e2e)(?:\/|$)/iu.test(normalizedPath)) {
    return "test-directory";
  }

  return /\.(?:test|spec|e2e)\.[cm]?[jt]sx?$/iu.test(normalizedPath)
    ? "test-file-name"
    : null;
}

/** The graph data required by the pure traversal helpers. */
export interface SymbolGraph {
  readonly symbols: readonly SymbolNode[];
  readonly edges: readonly GraphEdge[];
}

export interface ExactSymbolMatch {
  readonly status: "exact";
  readonly reference: string;
  readonly symbol: SymbolNode;
  readonly candidates: readonly SymbolNode[];
}

export interface AmbiguousSymbolMatch {
  readonly status: "ambiguous";
  readonly reference: string;
  readonly candidates: readonly SymbolNode[];
}

export interface MissingSymbolMatch {
  readonly status: "not_found";
  readonly reference: string;
  readonly candidates: readonly SymbolNode[];
}

/** A deterministic result for a symbol reference supplied by a caller. */
export type SymbolMatch =
  | ExactSymbolMatch
  | AmbiguousSymbolMatch
  | MissingSymbolMatch;

/** A neighboring symbol together with the resolved edge that proves the relation. */
export interface GraphRelation {
  readonly symbol: SymbolNode;
  readonly edge: GraphEdge;
}

/** A direct parent relation proved by an outgoing `extends` or `implements` edge. */
export interface ParentRelation {
  readonly relation: HierarchyRelationKind;
  readonly edge: GraphEdge;
  /** Null when the persisted heritage reference remains unresolved. */
  readonly parent: SymbolNode | null;
}

/** A direct child relation proved by an incoming exact `extends` or `implements` edge. */
export interface ChildRelation {
  readonly relation: HierarchyRelationKind;
  readonly edge: GraphEdge;
  readonly child: SymbolNode;
}

/** A literal HTTP or client-navigation route with persisted handler-resolution evidence. */
export interface RouteRecord {
  readonly method: RouteMethod;
  readonly path: string;
  /** Exact host condition, or null when the persisted route is not domain-bound. */
  readonly domain: string | null;
  readonly route: SymbolNode;
  readonly edge: GraphEdge;
  /** Null when the route handler could not be resolved to an indexed symbol. */
  readonly handler: SymbolNode | null;
}

/** A static non-HTTP transport entrypoint and its persisted handler evidence. */
export interface EntryPointRecord {
  readonly transport: EntryPointTransport;
  readonly operation: EntryPointOperation;
  /** Transport-level operation name, pattern, or namespace-qualified event. */
  readonly name: string;
  readonly entrypoint: SymbolNode;
  readonly edge: GraphEdge;
  /** Null when a future extractor records an unresolved handler binding. */
  readonly handler: SymbolNode | null;
}

/** One reverse-dependency traversal step. The edge retains its original direction. */
export interface ImpactStep {
  readonly from: SymbolNode;
  readonly to: SymbolNode;
  readonly edge: GraphEdge;
}

/**
 * A path from the changed symbol to one impacted symbol.
 *
 * `symbols`, `edges`, and `steps` are aligned: every step links adjacent symbols
 * and carries the edge that established that relationship.
 */
export interface ImpactPath {
  readonly symbols: readonly SymbolNode[];
  readonly edges: readonly GraphEdge[];
  readonly steps: readonly ImpactStep[];
}

/** One impacted terminal retained in a returned reverse-impact path. */
export interface ImpactTerminal {
  readonly symbol: SymbolNode;
  /** Reverse dependency hops from the changed root to this terminal symbol. */
  readonly depth: number;
  /** The final persisted edge that discovered this terminal symbol. */
  readonly discoveryEdge: GraphEdge;
}

/** Impacted terminals grouped by their own source file. */
export interface ImpactFileGroup {
  readonly filePath: string;
  /** Minimum retained reverse dependency depth among this file's terminals. */
  readonly nearestDepth: number;
  readonly impactedSymbols: readonly ImpactTerminal[];
}

/** Route and non-HTTP entrypoint records represented by retained terminal paths. */
export interface ImpactEntrypointCoverage {
  readonly routes: readonly RouteRecord[];
  readonly entrypoints: readonly EntryPointRecord[];
}

/**
 * A deterministic summary of a caller-supplied set of returned impact paths.
 *
 * This is intentionally not a graph-completeness claim: it describes only the
 * paths passed to `summarizeImpactPaths()`. Route and entrypoint coverage is
 * retained only when that record's own synthetic symbol and binding edge form
 * the terminal step of one of those paths; no same-file or transitive coverage
 * is inferred.
 */
export interface ImpactSummary {
  readonly returnedPathCount: number;
  readonly impactedFileCount: number;
  readonly files: readonly ImpactFileGroup[];
  readonly entrypointCoverage: ImpactEntrypointCoverage;
}

/** Explicit bounds for a reverse traversal that accepts exact evidence only. */
export interface ExactImpactTraversalOptions {
  /** Maximum reverse dependency hops from the root symbol. */
  readonly maxDepth: number;
  /** Maximum unique impacted symbols retained as shortest evidence paths. */
  readonly maxResults: number;
  /** Defaults to static call, reference, route, handler, and import edges. */
  readonly edgeKinds?: readonly EdgeKind[];
}

/** A bounded, exact-only reverse impact traversal. */
export interface ExactImpactTraversalResult {
  /** One deterministic shortest exact path for every retained impacted symbol. */
  readonly paths: readonly ImpactPath[];
  /** True only when another exact impacted symbol was found after the path cap. */
  readonly resultLimitReached: boolean;
}

/**
 * Fixed resource bounds for an undirected relevance walk over exact static
 * graph relations. The scope expands from the supplied lexical seeds before
 * the walk starts; it never follows heuristic, unresolved, or runtime edges.
 */
export interface ExactTopologyRelevanceOptions {
  /** Persisted symbol IDs that supply an equal share of the restart vector. */
  readonly seedSymbolIds: readonly string[];
  /** Maximum undirected exact-static hops retained around the seeds. */
  readonly maxHops: number;
  /** Maximum distinct symbols retained in the relevance-walk scope. */
  readonly maxVisitedSymbols: number;
  /** Fixed number of deterministic restart-walk iterations. */
  readonly iterations: number;
  /** Strictly between zero and one; the probability returned to the seed vector each iteration. */
  readonly restartProbability: number;
  /** Defaults to static call, reference, route, handler, import, and hierarchy edges. */
  readonly edgeKinds?: readonly EdgeKind[];
}

/**
 * A bounded exact-static topology relevance result. `scoresBySymbolId` is
 * relative-only non-restart walk mass: direct restart mass is removed so an
 * isolated lexical seed receives zero topology score rather than a synthetic
 * relevance boost. The score is not an FTS, semantic, runtime, or probability
 * confidence value.
 */
export interface ExactTopologyRelevanceResult {
  readonly scoresBySymbolId: ReadonlyMap<string, number>;
  /** Exact-static neighbor counts inside the retained bounded scope. */
  readonly scopedExactNeighborCountsBySymbolId: ReadonlyMap<string, number>;
  /**
   * Exact static persisted-edge incidences inside the retained scope, grouped
   * by endpoint and edge kind. Each eligible edge increments both endpoints;
   * multiplicity is disclosed as diagnostics only and does not weight the
   * neighbor-deduplicated relevance walk.
   */
  readonly scopedExactIncidentEdgeKindCountsBySymbolId: ReadonlyMap<
    string,
    ReadonlyMap<EdgeKind, number>
  >;
  /** Retained scope IDs in deterministic source order. */
  readonly scopedSymbolIds: readonly string[];
  /** Existing unique seeds retained before bounded scope expansion. */
  readonly seedSymbolIds: readonly string[];
  /** The visited-symbol budget prevented at least one candidate from entering the scope. */
  readonly traversalTruncated: boolean;
  /** The hop boundary left at least one exact-static neighbor outside the scope. */
  readonly depthLimitReached: boolean;
}

/** One directed evidence step, aligned with its graph edge from source to target. */
export interface EvidencePathStep {
  readonly from: SymbolNode;
  readonly to: SymbolNode;
  readonly edge: GraphEdge;
}

/** A directed, exact-resolved-edge evidence path between two persisted symbols. */
export interface EvidencePath {
  readonly symbols: readonly SymbolNode[];
  readonly edges: readonly GraphEdge[];
  readonly steps: readonly EvidencePathStep[];
}

/** The bounded shortest-path result used for context evidence. */
export interface EvidencePathResult {
  readonly path: EvidencePath | null;
  /** True only when the visit cap prevented an unvisited candidate from being explored. */
  readonly truncated: boolean;
}

/** Explicit resource bounds for one changed-file affected-test traversal. */
export interface AffectedTestTraversalOptions {
  /** Maximum reverse exact import/export hops from the changed file. */
  readonly maxDepth: number;
  /** Maximum conventionally classified test paths retained for this changed file. */
  readonly maxResults: number;
  /** Maximum distinct indexed file symbols visited while following dependents. */
  readonly maxVisitedFiles: number;
}

/** A bounded, exact-only reverse file-dependency traversal result. */
export interface AffectedTestTraversalResult {
  readonly paths: readonly ImpactPath[];
  /** An additional test path was found after the result cap was filled. */
  readonly resultLimitReached: boolean;
  /** The visited-file budget blocked at least one unseen exact dependent. */
  readonly traversalTruncated: boolean;
  /** The depth boundary left at least one unseen exact dependent unexplored. */
  readonly depthLimitReached: boolean;
}

interface SourceLocationReference {
  readonly filePath: string;
  readonly line: number;
  readonly column: number | null;
}

interface TraversalState {
  readonly terminal: SymbolNode;
  readonly path: ImpactPath;
}

interface EvidenceTraversalState {
  readonly terminal: SymbolNode;
  readonly path: EvidencePath;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function compareNumber(left: number, right: number): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

/** Sorts symbols by source path, source range, then name, with deterministic ties. */
export function compareSymbolNodes(left: SymbolNode, right: SymbolNode): number {
  return (
    compareText(left.filePath, right.filePath) ||
    compareNumber(left.range.start.line, right.range.start.line) ||
    compareNumber(left.range.start.column, right.range.start.column) ||
    compareNumber(left.range.end.line, right.range.end.line) ||
    compareNumber(left.range.end.column, right.range.end.column) ||
    compareText(left.name, right.name) ||
    compareText(left.qualifiedName, right.qualifiedName) ||
    compareText(left.kind, right.kind) ||
    compareNumber(left.declarationOrdinal, right.declarationOrdinal) ||
    compareText(left.id, right.id)
  );
}

/** Sorts edges deterministically when several edges prove the same relation. */
export function compareGraphEdges(left: GraphEdge, right: GraphEdge): number {
  return (
    compareText(left.filePath, right.filePath) ||
    compareNumber(left.range.start.line, right.range.start.line) ||
    compareNumber(left.range.start.column, right.range.start.column) ||
    compareNumber(left.range.end.line, right.range.end.line) ||
    compareNumber(left.range.end.column, right.range.end.column) ||
    compareText(left.sourceId, right.sourceId) ||
    compareText(left.targetId ?? "", right.targetId ?? "") ||
    compareText(left.kind, right.kind) ||
    compareText(left.referenceName ?? "", right.referenceName ?? "") ||
    compareText(left.id, right.id)
  );
}

function sortSymbols(symbols: readonly SymbolNode[]): SymbolNode[] {
  return [...symbols].sort(compareSymbolNodes);
}

function parseSourceLocationReference(reference: string): SourceLocationReference | null {
  const match = /^(.*):([1-9]\d*)(?::([0-9]\d*))?$/.exec(reference);
  if (match === null) {
    return null;
  }

  const [, filePath, lineText, columnText] = match;
  if (filePath === undefined || filePath.length === 0 || lineText === undefined) {
    return null;
  }

  const line = Number(lineText);
  const column = columnText === undefined ? null : Number(columnText);
  if (!Number.isSafeInteger(line) || line < 1 || (column !== null && !Number.isSafeInteger(column))) {
    return null;
  }

  return { filePath, line, column };
}

function containsLocation(symbol: SymbolNode, location: SourceLocationReference): boolean {
  if (symbol.filePath !== location.filePath) {
    return false;
  }

  const { line, column } = location;
  const { start, end } = symbol.range;
  if (line < start.line || line > end.line) {
    return false;
  }

  if (column === null) {
    return true;
  }

  if (line === start.line && column < start.column) {
    return false;
  }

  return line !== end.line || column <= end.column;
}

function createSymbolIndex(symbols: readonly SymbolNode[]): ReadonlyMap<string, SymbolNode> {
  const symbolsById = new Map<string, SymbolNode>();

  for (const symbol of sortSymbols(symbols)) {
    if (!symbolsById.has(symbol.id)) {
      symbolsById.set(symbol.id, symbol);
    }
  }

  return symbolsById;
}

function toSymbolMatch(reference: string, candidates: readonly SymbolNode[]): SymbolMatch {
  if (candidates.length === 0) {
    return { status: "not_found", reference, candidates };
  }

  if (candidates.length === 1) {
    const symbol = candidates[0];
    if (symbol === undefined) {
      return { status: "not_found", reference, candidates: [] };
    }

    return { status: "exact", reference, symbol, candidates };
  }

  return { status: "ambiguous", reference, candidates };
}

/**
 * Resolves an exact id, qualified name, simple name, or `path:line[:column]`
 * reference. Qualified names take precedence over simple names; candidates are
 * always returned in source order so callers can render ambiguity deterministically.
 */
export function matchSymbol(graph: SymbolGraph, reference: string): SymbolMatch {
  const symbols = sortSymbols(graph.symbols);
  const exactIdCandidates = symbols.filter((symbol) => symbol.id === reference);
  if (exactIdCandidates.length > 0) {
    return toSymbolMatch(reference, exactIdCandidates);
  }

  const qualifiedNameCandidates = symbols.filter(
    (symbol) => symbol.qualifiedName === reference
  );
  if (qualifiedNameCandidates.length > 0) {
    return toSymbolMatch(reference, qualifiedNameCandidates);
  }

  const location = parseSourceLocationReference(reference);
  if (location !== null) {
    const locationCandidates = symbols.filter((symbol) => containsLocation(symbol, location));
    const smallestSpan = Math.min(
      ...locationCandidates.map(
        (symbol) =>
          (symbol.range.end.line - symbol.range.start.line) * 1_000_000 +
          symbol.range.end.column -
          symbol.range.start.column
      )
    );
    return toSymbolMatch(
      reference,
      locationCandidates.filter(
        (symbol) =>
          (symbol.range.end.line - symbol.range.start.line) * 1_000_000 +
            symbol.range.end.column -
            symbol.range.start.column ===
          smallestSpan
      )
    );
  }

  return toSymbolMatch(
    reference,
    symbols.filter((symbol) => symbol.name === reference)
  );
}

/** Finds symbols by case-insensitive name or qualified-name substring. */
export function findSymbols(
  graph: SymbolGraph,
  query: string,
  options: { readonly kind?: SymbolNode["kind"]; readonly limit?: number } = {}
): readonly SymbolNode[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery.length === 0) {
    return [];
  }

  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("limit must be a positive integer.");
  }

  return sortSymbols(
    graph.symbols.filter(
      (symbol) =>
        (options.kind === undefined || symbol.kind === options.kind) &&
        (symbol.name.toLocaleLowerCase().includes(normalizedQuery) ||
          symbol.qualifiedName.toLocaleLowerCase().includes(normalizedQuery))
    )
  ).slice(0, limit);
}

/** An edge is usable only when it resolved to a concrete target symbol. */
export function isResolvedGraphEdge(
  edge: GraphEdge
): edge is GraphEdge & { readonly targetId: string } {
  return edge.resolution !== "unresolved" && edge.targetId !== null;
}

function compareRelations(left: GraphRelation, right: GraphRelation): number {
  return compareSymbolNodes(left.symbol, right.symbol) || compareGraphEdges(left.edge, right.edge);
}

function hierarchyRelationKind(edge: GraphEdge): HierarchyRelationKind | null {
  return edge.kind === "extends" || edge.kind === "implements" ? edge.kind : null;
}

function isHierarchySource(symbol: SymbolNode | undefined): symbol is SymbolNode {
  return symbol?.kind === "class" || symbol?.kind === "interface";
}

function compareParentRelations(left: ParentRelation, right: ParentRelation): number {
  return (
    compareGraphEdges(left.edge, right.edge) ||
    compareText(left.relation, right.relation) ||
    compareText(left.parent?.id ?? "", right.parent?.id ?? "")
  );
}

function compareChildRelations(left: ChildRelation, right: ChildRelation): number {
  return (
    compareSymbolNodes(left.child, right.child) ||
    compareGraphEdges(left.edge, right.edge) ||
    compareText(left.relation, right.relation)
  );
}

/**
 * Returns direct TypeScript declaration parents for one class or interface.
 *
 * Heritage edges are directed from child to parent. Their source must be an
 * indexed class or interface; exact records require an indexed target, whose
 * type capability is established by resolution. Unresolved records are retained
 * with a `null` parent so callers can expose missing type evidence without
 * claiming a relationship. Heuristic and malformed persisted records are
 * intentionally excluded. This pure helper applies no result limit or recursive
 * traversal.
 */
export function getParents(graph: SymbolGraph, symbolId: string): readonly ParentRelation[] {
  const symbolsById = createSymbolIndex(graph.symbols);
  const child = symbolsById.get(symbolId);
  if (!isHierarchySource(child)) {
    return [];
  }

  const parents: ParentRelation[] = [];
  for (const edge of graph.edges) {
    const relation = hierarchyRelationKind(edge);
    if (relation === null || edge.sourceId !== child.id) {
      continue;
    }

    if (edge.resolution === "unresolved") {
      if (edge.targetId === null) {
        parents.push({ relation, edge, parent: null });
      }
      continue;
    }

    if (edge.resolution !== "exact" || edge.targetId === null) {
      continue;
    }

    const parent = symbolsById.get(edge.targetId);
    if (parent !== undefined) {
      parents.push({ relation, edge, parent });
    }
  }

  return parents.sort(compareParentRelations);
}

/**
 * Returns direct TypeScript declaration children for one class or interface.
 *
 * Heritage edges are directed from child to parent, so this is the reverse of
 * `getParents`. Only exact records with an indexed child are usable as child
 * evidence; unresolved edges cannot prove which declaration is a child. The
 * parent may be any indexed type-capable target accepted by resolution, while
 * the child source must be a class or interface. This pure helper applies no
 * result limit or recursive traversal.
 */
export function getChildren(graph: SymbolGraph, symbolId: string): readonly ChildRelation[] {
  const symbolsById = createSymbolIndex(graph.symbols);
  const parent = symbolsById.get(symbolId);
  if (parent === undefined) {
    return [];
  }

  const children: ChildRelation[] = [];
  for (const edge of graph.edges) {
    const relation = hierarchyRelationKind(edge);
    if (
      relation === null ||
      edge.resolution !== "exact" ||
      !isResolvedGraphEdge(edge) ||
      edge.targetId !== parent.id
    ) {
      continue;
    }

    const child = symbolsById.get(edge.sourceId);
    if (isHierarchySource(child)) {
      children.push({ relation, edge, child });
    }
  }

  return children.sort(compareChildRelations);
}

function parseRouteName(route: SymbolNode): Pick<RouteRecord, "method" | "path"> | null {
  // Synthetic names are encoded as `${METHOD} ${literalPath}`. Split only at
  // that first delimiter: literal paths may legally contain whitespace or a
  // newline escape, both of which must survive a persisted graph round trip.
  const delimiterIndex = route.name.indexOf(" ");
  if (delimiterIndex <= 0) {
    return null;
  }
  const method = route.name.slice(0, delimiterIndex).toUpperCase();
  const path = route.name.slice(delimiterIndex + 1);
  if (
    path.length === 0 ||
    !ROUTE_METHOD_SET.has(method) ||
    !path.startsWith("/")
  ) {
    return null;
  }

  return { method: method as RouteMethod, path };
}

function compareRouteRecords(left: RouteRecord, right: RouteRecord): number {
  return (
    compareSymbolNodes(left.route, right.route) ||
    compareGraphEdges(left.edge, right.edge) ||
    compareText(left.handler?.id ?? "", right.handler?.id ?? "")
  );
}

function parseEntrypointName(
  entrypoint: SymbolNode
): Pick<EntryPointRecord, "transport" | "operation" | "name"> | null {
  // Synthetic names are encoded as `${transport} ${operation} ${literalName}`.
  // Split only the two structural delimiters: literal names and canonicalized
  // message patterns may themselves contain whitespace or newline escapes.
  const firstDelimiter = entrypoint.name.indexOf(" ");
  const secondDelimiter = entrypoint.name.indexOf(" ", firstDelimiter + 1);
  if (firstDelimiter <= 0 || secondDelimiter <= firstDelimiter + 1) {
    return null;
  }

  const transport = entrypoint.name.slice(0, firstDelimiter);
  const operation = entrypoint.name.slice(firstDelimiter + 1, secondDelimiter);
  if (!ENTRYPOINT_TRANSPORT_SET.has(transport) || !ENTRYPOINT_OPERATION_SET.has(operation)) {
    return null;
  }

  return {
    transport: transport as EntryPointTransport,
    operation: operation as EntryPointOperation,
    name: entrypoint.name.slice(secondDelimiter + 1)
  };
}

function compareEntrypointRecords(left: EntryPointRecord, right: EntryPointRecord): number {
  return (
    compareSymbolNodes(left.entrypoint, right.entrypoint) ||
    compareGraphEdges(left.edge, right.edge) ||
    compareText(left.handler?.id ?? "", right.handler?.id ?? "")
  );
}

/**
 * Returns literal route records in deterministic source order. A persisted route
 * edge is retained even when its handler is unresolved, in which case `handler`
 * is null. Callers deliberately apply any route filters or result limits themselves.
 */
export function getRoutes(graph: SymbolGraph): readonly RouteRecord[] {
  const symbolsById = createSymbolIndex(graph.symbols);
  const routes: RouteRecord[] = [];

  for (const edge of graph.edges) {
    if (edge.kind !== "routes") {
      continue;
    }

    const route = symbolsById.get(edge.sourceId);
    if (route === undefined || route.kind !== "route") {
      continue;
    }

    const parsed = parseRouteName(route);
    if (parsed === null) {
      continue;
    }

    routes.push({
      ...parsed,
      domain: edge.evidence?.routeDomain ?? null,
      route,
      edge,
      handler: isResolvedGraphEdge(edge) ? symbolsById.get(edge.targetId) ?? null : null
    });
  }

  return routes.sort(compareRouteRecords);
}

/**
 * Returns static non-HTTP entrypoints in deterministic source order. A
 * persisted handler edge is retained even when a future extractor cannot
 * resolve its target, in which case `handler` is null. This remains separate
 * from `getRoutes()` so HTTP method/path semantics are never manufactured for
 * GraphQL, microservice, or WebSocket operations.
 */
export function getEntrypoints(graph: SymbolGraph): readonly EntryPointRecord[] {
  const symbolsById = createSymbolIndex(graph.symbols);
  const entrypoints: EntryPointRecord[] = [];

  for (const edge of graph.edges) {
    if (edge.kind !== "handles") {
      continue;
    }

    const entrypoint = symbolsById.get(edge.sourceId);
    if (entrypoint === undefined || entrypoint.kind !== "entrypoint") {
      continue;
    }

    const parsed = parseEntrypointName(entrypoint);
    if (parsed === null) {
      continue;
    }

    entrypoints.push({
      ...parsed,
      entrypoint,
      edge,
      handler: isResolvedGraphEdge(edge) ? symbolsById.get(edge.targetId) ?? null : null
    });
  }

  return entrypoints.sort(compareEntrypointRecords);
}

function finalImpactEdge(path: ImpactPath): GraphEdge {
  const edge = path.edges.at(-1);
  if (edge === undefined) {
    throw new Error("Impact summaries require paths with at least one reverse-dependency edge.");
  }

  return edge;
}

function compareImpactTerminals(left: ImpactTerminal, right: ImpactTerminal): number {
  return (
    compareNumber(left.depth, right.depth) ||
    compareSymbolNodes(left.symbol, right.symbol) ||
    compareGraphEdges(left.discoveryEdge, right.discoveryEdge)
  );
}

function compareImpactFileGroups(left: ImpactFileGroup, right: ImpactFileGroup): number {
  return compareText(left.filePath, right.filePath) || compareNumber(left.nearestDepth, right.nearestDepth);
}

/**
 * Summarizes only the supplied retained impact paths into deterministic file
 * groups and terminal route/entrypoint record coverage. The helper accepts the
 * output of `getImpactPaths()` (or a bounded prefix of it), so callers can make
 * any truncation explicit without implying that omitted paths were considered.
 */
export function summarizeImpactPaths(
  graph: SymbolGraph,
  paths: readonly ImpactPath[]
): ImpactSummary {
  const terminalsByFilePath = new Map<string, ImpactTerminal[]>();
  const terminalEdgeIdsBySymbolId = new Map<string, Set<string>>();

  for (const path of paths) {
    const symbol = terminalSymbol(path);
    const discoveryEdge = finalImpactEdge(path);
    const terminal: ImpactTerminal = {
      symbol,
      depth: path.edges.length,
      discoveryEdge
    };
    const terminals = terminalsByFilePath.get(symbol.filePath) ?? [];
    terminals.push(terminal);
    terminalsByFilePath.set(symbol.filePath, terminals);

    const edgeIds = terminalEdgeIdsBySymbolId.get(symbol.id) ?? new Set<string>();
    edgeIds.add(discoveryEdge.id);
    terminalEdgeIdsBySymbolId.set(symbol.id, edgeIds);
  }

  const files = [...terminalsByFilePath.entries()]
    .map(([filePath, terminals]): ImpactFileGroup => ({
      filePath,
      nearestDepth: Math.min(...terminals.map((terminal) => terminal.depth)),
      impactedSymbols: terminals.sort(compareImpactTerminals)
    }))
    .sort(compareImpactFileGroups);
  const hasTerminalRecord = (symbolId: string, edgeId: string): boolean =>
    terminalEdgeIdsBySymbolId.get(symbolId)?.has(edgeId) ?? false;

  return {
    returnedPathCount: paths.length,
    impactedFileCount: files.length,
    files,
    entrypointCoverage: {
      routes: getRoutes(graph).filter((record) => hasTerminalRecord(record.route.id, record.edge.id)),
      entrypoints: getEntrypoints(graph).filter((record) =>
        hasTerminalRecord(record.entrypoint.id, record.edge.id)
      )
    }
  };
}

/** Returns all resolved static call, reference, route, or entrypoint-handler bindings targeting a symbol. */
export function getCallers(graph: SymbolGraph, symbolId: string): readonly GraphRelation[] {
  const symbolsById = createSymbolIndex(graph.symbols);
  if (!symbolsById.has(symbolId)) {
    return [];
  }

  const callers: GraphRelation[] = [];
  for (const edge of graph.edges) {
    if (
      (edge.kind !== "calls" &&
        edge.kind !== "references" &&
        edge.kind !== "routes" &&
        edge.kind !== "handles") ||
      !isResolvedGraphEdge(edge) ||
      edge.targetId !== symbolId
    ) {
      continue;
    }

    const caller = symbolsById.get(edge.sourceId);
    if (caller !== undefined) {
      callers.push({ symbol: caller, edge });
    }
  }

  return callers.sort(compareRelations);
}

/** Returns all resolved static call, reference, route, or entrypoint-handler targets referenced by a symbol. */
export function getCallees(graph: SymbolGraph, symbolId: string): readonly GraphRelation[] {
  const symbolsById = createSymbolIndex(graph.symbols);
  if (!symbolsById.has(symbolId)) {
    return [];
  }

  const callees: GraphRelation[] = [];
  for (const edge of graph.edges) {
    if (
      (edge.kind !== "calls" &&
        edge.kind !== "references" &&
        edge.kind !== "routes" &&
        edge.kind !== "handles") ||
      !isResolvedGraphEdge(edge) ||
      edge.sourceId !== symbolId
    ) {
      continue;
    }

    const callee = symbolsById.get(edge.targetId);
    if (callee !== undefined) {
      callees.push({ symbol: callee, edge });
    }
  }

  return callees.sort(compareRelations);
}

function createEvidenceRootPath(root: SymbolNode): EvidencePath {
  return {
    symbols: [root],
    edges: [],
    steps: []
  };
}

function extendEvidencePath(
  path: EvidencePath,
  from: SymbolNode,
  to: SymbolNode,
  edge: GraphEdge
): EvidencePath {
  return {
    symbols: [...path.symbols, to],
    edges: [...path.edges, edge],
    steps: [...path.steps, { from, to, edge }]
  };
}

function outgoingExactRelations(
  graph: SymbolGraph,
  symbolsById: ReadonlyMap<string, SymbolNode>,
  sourceId: string,
  edgeKinds: ReadonlySet<EdgeKind>
): GraphRelation[] {
  const relations: GraphRelation[] = [];

  for (const edge of graph.edges) {
    if (
      !isResolvedGraphEdge(edge) ||
      edge.resolution !== "exact" ||
      edge.sourceId !== sourceId ||
      !edgeKinds.has(edge.kind)
    ) {
      continue;
    }

    const target = symbolsById.get(edge.targetId);
    if (target !== undefined) {
      relations.push({ symbol: target, edge });
    }
  }

  return relations.sort(compareRelations);
}

function assertNonnegativeHops(maxHops: number): void {
  if (!Number.isSafeInteger(maxHops) || maxHops < 0) {
    throw new RangeError("maxHops must be a nonnegative integer.");
  }
}

function assertPositiveVisitCap(maxVisitedSymbols: number): void {
  if (!Number.isSafeInteger(maxVisitedSymbols) || maxVisitedSymbols < 1) {
    throw new RangeError("maxVisitedSymbols must be a positive integer.");
  }
}

/**
 * Finds one deterministic shortest directed evidence path through exact,
 * resolved graph edges. The bounded breadth-first traversal follows calls,
 * references, routes, entrypoint handlers, and imports by default, never revisits a symbol, and only reports truncation
 * when its visit cap prevented another unvisited candidate from entering the
 * search.
 */
export function findEvidencePath(
  graph: SymbolGraph,
  fromSymbolId: string,
  toSymbolId: string,
  maxHops = 4,
  maxVisitedSymbols = 500,
  edgeKinds: readonly EdgeKind[] = DEFAULT_IMPACT_EDGE_KINDS
): EvidencePathResult {
  assertNonnegativeHops(maxHops);
  assertPositiveVisitCap(maxVisitedSymbols);

  const symbolsById = createSymbolIndex(graph.symbols);
  const root = symbolsById.get(fromSymbolId);
  const target = symbolsById.get(toSymbolId);
  if (root === undefined || target === undefined) {
    return { path: null, truncated: false };
  }

  const rootPath = createEvidenceRootPath(root);
  if (root.id === target.id) {
    return { path: rootPath, truncated: false };
  }

  const allowedEdgeKinds = new Set(edgeKinds);
  const seenSymbolIds = new Set<string>([root.id]);
  const queue: EvidenceTraversalState[] = [{ terminal: root, path: rootPath }];
  let queueIndex = 0;
  let truncated = false;

  while (queueIndex < queue.length) {
    const state = queue[queueIndex];
    queueIndex += 1;
    if (state === undefined || state.path.edges.length >= maxHops) {
      continue;
    }

    const relations = outgoingExactRelations(
      graph,
      symbolsById,
      state.terminal.id,
      allowedEdgeKinds
    );
    for (const relation of relations) {
      if (seenSymbolIds.has(relation.symbol.id)) {
        continue;
      }
      if (seenSymbolIds.size >= maxVisitedSymbols) {
        truncated = true;
        continue;
      }

      seenSymbolIds.add(relation.symbol.id);
      const path = extendEvidencePath(state.path, state.terminal, relation.symbol, relation.edge);
      if (relation.symbol.id === target.id) {
        return { path, truncated };
      }

      queue.push({ terminal: relation.symbol, path });
    }
  }

  return { path: null, truncated };
}

function createRootPath(root: SymbolNode): ImpactPath {
  return {
    symbols: [root],
    edges: [],
    steps: []
  };
}

function extendImpactPath(
  path: ImpactPath,
  from: SymbolNode,
  to: SymbolNode,
  edge: GraphEdge
): ImpactPath {
  return {
    symbols: [...path.symbols, to],
    edges: [...path.edges, edge],
    steps: [...path.steps, { from, to, edge }]
  };
}

function terminalSymbol(path: ImpactPath): SymbolNode {
  const symbol = path.symbols[path.symbols.length - 1];
  if (symbol === undefined) {
    throw new Error("Impact paths must contain at least one symbol.");
  }

  return symbol;
}

function compareImpactPaths(left: ImpactPath, right: ImpactPath): number {
  const endpointComparison = compareSymbolNodes(terminalSymbol(left), terminalSymbol(right));
  if (endpointComparison !== 0) {
    return endpointComparison;
  }

  const commonLength = Math.min(left.symbols.length, right.symbols.length);
  for (let index = 0; index < commonLength; index += 1) {
    const leftSymbol = left.symbols[index];
    const rightSymbol = right.symbols[index];
    if (leftSymbol === undefined || rightSymbol === undefined) {
      continue;
    }

    const comparison = compareSymbolNodes(leftSymbol, rightSymbol);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return (
    compareNumber(left.symbols.length, right.symbols.length) ||
    compareText(left.edges.map((edge) => edge.id).join("\u0000"), right.edges.map((edge) => edge.id).join("\u0000"))
  );
}

function incomingResolvedRelations(
  graph: SymbolGraph,
  symbolsById: ReadonlyMap<string, SymbolNode>,
  targetId: string,
  edgeKinds: readonly EdgeKind[]
): GraphRelation[] {
  const relations: GraphRelation[] = [];

  for (const edge of graph.edges) {
    if (
      !isResolvedGraphEdge(edge) ||
      edge.targetId !== targetId ||
      !edgeKinds.includes(edge.kind)
    ) {
      continue;
    }

    const source = symbolsById.get(edge.sourceId);
    if (source !== undefined) {
      relations.push({ symbol: source, edge });
    }
  }

  return relations.sort(compareRelations);
}

function incomingExactRelations(
  graph: SymbolGraph,
  symbolsById: ReadonlyMap<string, SymbolNode>,
  targetId: string,
  edgeKinds: readonly EdgeKind[]
): GraphRelation[] {
  const relations: GraphRelation[] = [];

  for (const edge of graph.edges) {
    if (
      !isResolvedGraphEdge(edge) ||
      edge.resolution !== "exact" ||
      edge.targetId !== targetId ||
      !edgeKinds.includes(edge.kind)
    ) {
      continue;
    }

    const source = symbolsById.get(edge.sourceId);
    if (source !== undefined) {
      relations.push({ symbol: source, edge });
    }
  }

  return relations.sort(compareRelations);
}

function incomingExactFileRelations(
  graph: SymbolGraph,
  symbolsById: ReadonlyMap<string, SymbolNode>,
  targetId: string
): GraphRelation[] {
  const relations: GraphRelation[] = [];

  for (const edge of graph.edges) {
    if (
      !isResolvedGraphEdge(edge) ||
      edge.resolution !== "exact" ||
      edge.targetId !== targetId ||
      (edge.kind !== "imports" && edge.kind !== "exports")
    ) {
      continue;
    }

    const source = symbolsById.get(edge.sourceId);
    if (source?.kind === "file") {
      relations.push({ symbol: source, edge });
    }
  }

  return relations.sort(compareRelations);
}

function assertPositiveDepth(maxDepth: number): void {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError("maxDepth must be a positive integer.");
  }
}

function assertPositiveBound(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function assertRestartProbability(value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new RangeError("restartProbability must be greater than zero and less than one.");
  }
}

function compareTopologySymbolIds(
  symbolsById: ReadonlyMap<string, SymbolNode>,
  left: string,
  right: string
): number {
  const leftSymbol = symbolsById.get(left);
  const rightSymbol = symbolsById.get(right);
  if (leftSymbol === undefined || rightSymbol === undefined) {
    return compareText(left, right);
  }

  return compareSymbolNodes(leftSymbol, rightSymbol);
}

function buildExactTopologyAdjacency(
  graph: SymbolGraph,
  symbolsById: ReadonlyMap<string, SymbolNode>,
  edgeKinds: readonly EdgeKind[]
): ReadonlyMap<string, readonly string[]> {
  const neighborIdsBySymbolId = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    if (
      edge.resolution !== "exact" ||
      edge.targetId === null ||
      edge.sourceId === edge.targetId ||
      !edgeKinds.includes(edge.kind) ||
      !symbolsById.has(edge.sourceId) ||
      !symbolsById.has(edge.targetId)
    ) {
      continue;
    }

    const sourceNeighbors = neighborIdsBySymbolId.get(edge.sourceId) ?? new Set<string>();
    sourceNeighbors.add(edge.targetId);
    neighborIdsBySymbolId.set(edge.sourceId, sourceNeighbors);

    const targetNeighbors = neighborIdsBySymbolId.get(edge.targetId) ?? new Set<string>();
    targetNeighbors.add(edge.sourceId);
    neighborIdsBySymbolId.set(edge.targetId, targetNeighbors);
  }

  const adjacency = new Map<string, readonly string[]>();
  for (const symbolId of [...symbolsById.keys()].sort((left, right) =>
    compareTopologySymbolIds(symbolsById, left, right)
  )) {
    adjacency.set(
      symbolId,
      [...(neighborIdsBySymbolId.get(symbolId) ?? [])].sort((left, right) =>
        compareTopologySymbolIds(symbolsById, left, right)
      )
    );
  }

  return adjacency;
}

function buildScopedExactTopologyIncidentEdgeKindCounts(
  graph: SymbolGraph,
  scopedSymbolIds: readonly string[],
  edgeKinds: readonly EdgeKind[]
): ReadonlyMap<string, ReadonlyMap<EdgeKind, number>> {
  const scopedSymbolIdSet = new Set(scopedSymbolIds);
  const eligibleEdgeKinds = new Set(edgeKinds);
  const countsBySymbolId = new Map<string, Map<EdgeKind, number>>();

  for (const symbolId of scopedSymbolIds) {
    const counts = new Map<EdgeKind, number>();
    for (const kind of edgeKinds) {
      counts.set(kind, 0);
    }
    countsBySymbolId.set(symbolId, counts);
  }

  for (const edge of graph.edges) {
    if (
      edge.resolution !== "exact" ||
      edge.targetId === null ||
      edge.sourceId === edge.targetId ||
      !eligibleEdgeKinds.has(edge.kind) ||
      !scopedSymbolIdSet.has(edge.sourceId) ||
      !scopedSymbolIdSet.has(edge.targetId)
    ) {
      continue;
    }

    const sourceCounts = countsBySymbolId.get(edge.sourceId);
    const targetCounts = countsBySymbolId.get(edge.targetId);
    if (sourceCounts === undefined || targetCounts === undefined) {
      continue;
    }
    sourceCounts.set(edge.kind, (sourceCounts.get(edge.kind) ?? 0) + 1);
    targetCounts.set(edge.kind, (targetCounts.get(edge.kind) ?? 0) + 1);
  }

  return countsBySymbolId;
}

/**
 * Builds a bounded undirected exact-static topology around lexical seed
 * symbols, then runs a fixed restart walk within that retained scope. The
 * output score excludes direct restart mass, making it a connectivity signal
 * rather than a reward merely for being a lexical seed.
 */
export function getBoundedExactTopologyRelevance(
  graph: SymbolGraph,
  options: ExactTopologyRelevanceOptions
): ExactTopologyRelevanceResult {
  assertPositiveDepth(options.maxHops);
  assertPositiveBound(options.maxVisitedSymbols, "maxVisitedSymbols");
  assertPositiveBound(options.iterations, "iterations");
  assertRestartProbability(options.restartProbability);

  const edgeKinds = options.edgeKinds ?? DEFAULT_EXACT_TOPOLOGY_EDGE_KINDS;
  const symbolsById = createSymbolIndex(graph.symbols);
  const adjacency = buildExactTopologyAdjacency(graph, symbolsById, edgeKinds);
  const retainedSeedSymbolIds: string[] = [];
  const seenSeedSymbolIds = new Set<string>();
  let traversalTruncated = false;

  for (const seedSymbolId of options.seedSymbolIds) {
    if (seenSeedSymbolIds.has(seedSymbolId) || !symbolsById.has(seedSymbolId)) {
      continue;
    }
    seenSeedSymbolIds.add(seedSymbolId);
    if (retainedSeedSymbolIds.length >= options.maxVisitedSymbols) {
      traversalTruncated = true;
      continue;
    }
    retainedSeedSymbolIds.push(seedSymbolId);
  }

  if (retainedSeedSymbolIds.length === 0) {
    return {
      scoresBySymbolId: new Map(),
      scopedExactNeighborCountsBySymbolId: new Map(),
      scopedExactIncidentEdgeKindCountsBySymbolId: new Map(),
      scopedSymbolIds: [],
      seedSymbolIds: [],
      traversalTruncated,
      depthLimitReached: false
    };
  }

  const scopedSymbolIdSet = new Set(retainedSeedSymbolIds);
  let frontier = retainedSeedSymbolIds
    .map((symbolId) => symbolsById.get(symbolId))
    .filter((symbol): symbol is SymbolNode => symbol !== undefined)
    .sort(compareSymbolNodes);

  for (let depth = 0; depth < options.maxHops && frontier.length > 0; depth += 1) {
    const nextById = new Map<string, SymbolNode>();
    for (const terminal of frontier) {
      for (const neighborId of adjacency.get(terminal.id) ?? []) {
        if (scopedSymbolIdSet.has(neighborId)) {
          continue;
        }
        if (scopedSymbolIdSet.size >= options.maxVisitedSymbols) {
          traversalTruncated = true;
          continue;
        }

        const neighbor = symbolsById.get(neighborId);
        if (neighbor === undefined) {
          continue;
        }
        scopedSymbolIdSet.add(neighbor.id);
        nextById.set(neighbor.id, neighbor);
      }
    }
    frontier = [...nextById.values()].sort(compareSymbolNodes);
  }

  const depthLimitReached =
    !traversalTruncated &&
    frontier.some((terminal) =>
      (adjacency.get(terminal.id) ?? []).some((neighborId) => !scopedSymbolIdSet.has(neighborId))
    );
  const scopedSymbolIds = [...scopedSymbolIdSet].sort((left, right) =>
    compareTopologySymbolIds(symbolsById, left, right)
  );
  const scopedExactIncidentEdgeKindCountsBySymbolId =
    buildScopedExactTopologyIncidentEdgeKindCounts(graph, scopedSymbolIds, edgeKinds);
  const indexBySymbolId = new Map(scopedSymbolIds.map((symbolId, index) => [symbolId, index]));
  const neighborIndexes = scopedSymbolIds.map((symbolId) =>
    (adjacency.get(symbolId) ?? []).flatMap((neighborId) => {
      const index = indexBySymbolId.get(neighborId);
      return index === undefined ? [] : [index];
    })
  );
  const restart = new Array<number>(scopedSymbolIds.length).fill(0);
  const restartShare = 1 / retainedSeedSymbolIds.length;
  for (const seedSymbolId of retainedSeedSymbolIds) {
    const index = indexBySymbolId.get(seedSymbolId);
    if (index !== undefined) {
      restart[index] = restartShare;
    }
  }

  let state = restart.slice();
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const propagated = new Array<number>(scopedSymbolIds.length).fill(0);
    for (let index = 0; index < scopedSymbolIds.length; index += 1) {
      const current = state[index] ?? 0;
      const neighbors = neighborIndexes[index] ?? [];
      if (current === 0 || neighbors.length === 0) {
        continue;
      }

      const share = current / neighbors.length;
      for (const neighborIndex of neighbors) {
        propagated[neighborIndex] = (propagated[neighborIndex] ?? 0) + share;
      }
    }
    state = state.map(
      (_value, index) =>
        (1 - options.restartProbability) * (propagated[index] ?? 0) +
        options.restartProbability * (restart[index] ?? 0)
    );
  }

  const scoresBySymbolId = new Map<string, number>();
  const scopedExactNeighborCountsBySymbolId = new Map<string, number>();
  for (const [index, symbolId] of scopedSymbolIds.entries()) {
    const directRestartMass = options.restartProbability * (restart[index] ?? 0);
    scoresBySymbolId.set(symbolId, Math.max(0, (state[index] ?? 0) - directRestartMass));
    scopedExactNeighborCountsBySymbolId.set(symbolId, (neighborIndexes[index] ?? []).length);
  }

  return {
    scoresBySymbolId,
    scopedExactNeighborCountsBySymbolId,
    scopedExactIncidentEdgeKindCountsBySymbolId,
    scopedSymbolIds,
    seedSymbolIds: retainedSeedSymbolIds,
    traversalTruncated,
    depthLimitReached
  };
}

/**
 * Finds conventionally named test files that have an exact import/export
 * dependency on one changed indexed file. The traversal is reverse-directed,
 * deterministic, and only uses persisted file-level graph edges. It does not
 * infer runtime test discovery or use heuristic resolution as evidence.
 */
export function findAffectedTestPaths(
  graph: SymbolGraph,
  changedFileSymbolId: string,
  options: AffectedTestTraversalOptions
): AffectedTestTraversalResult {
  assertPositiveDepth(options.maxDepth);
  assertPositiveBound(options.maxResults, "maxResults");
  assertPositiveBound(options.maxVisitedFiles, "maxVisitedFiles");

  const symbolsById = createSymbolIndex(graph.symbols);
  const root = symbolsById.get(changedFileSymbolId);
  if (root?.kind !== "file") {
    return {
      paths: [],
      resultLimitReached: false,
      traversalTruncated: false,
      depthLimitReached: false
    };
  }

  const rootPath = createRootPath(root);
  const seenFileSymbolIds = new Set<string>([root.id]);
  const paths: ImpactPath[] = classifyTestFile(root.filePath) === null ? [] : [rootPath];
  let frontier: TraversalState[] = [{ terminal: root, path: rootPath }];
  let resultLimitReached = false;
  let traversalTruncated = false;
  let depthLimitReached = false;

  for (let depth = 0; depth <= options.maxDepth && frontier.length > 0; depth += 1) {
    const nextFrontier: TraversalState[] = [];
    for (const state of frontier.sort((left, right) => compareImpactPaths(left.path, right.path))) {
      const relations = incomingExactFileRelations(graph, symbolsById, state.terminal.id);
      if (depth >= options.maxDepth) {
        if (relations.some((relation) => !seenFileSymbolIds.has(relation.symbol.id))) {
          depthLimitReached = true;
        }
        continue;
      }

      for (const relation of relations) {
        if (seenFileSymbolIds.has(relation.symbol.id)) {
          continue;
        }
        if (seenFileSymbolIds.size >= options.maxVisitedFiles) {
          traversalTruncated = true;
          continue;
        }

        seenFileSymbolIds.add(relation.symbol.id);
        const path = extendImpactPath(state.path, state.terminal, relation.symbol, relation.edge);
        if (classifyTestFile(relation.symbol.filePath) !== null) {
          if (paths.length < options.maxResults) {
            paths.push(path);
          } else {
            resultLimitReached = true;
          }
        }

        // A test-directory file can be a shared helper. Keep following its
        // exact dependents so a later conventional test is not hidden behind it.
        nextFrontier.push({ terminal: relation.symbol, path });
      }
    }
    frontier = nextFrontier;
  }

  return {
    paths: paths.sort(compareImpactPaths),
    resultLimitReached,
    traversalTruncated,
    depthLimitReached
  };
}

/**
 * Traverses resolved incoming edges to find symbols affected by a change.
 *
 * The result excludes the root, keeps one deterministic shortest evidence path
 * per impacted symbol, never repeats a symbol, and follows static calls, references,
 * routes, entrypoint handlers, and imports by default. Pass a subset of `EDGE_KINDS` to scope the dependency relation.
 */
export function getImpactPaths(
  graph: SymbolGraph,
  symbolId: string,
  maxDepth = 1,
  edgeKinds: readonly EdgeKind[] = DEFAULT_IMPACT_EDGE_KINDS
): readonly ImpactPath[] {
  assertPositiveDepth(maxDepth);

  const symbolsById = createSymbolIndex(graph.symbols);
  const root = symbolsById.get(symbolId);
  if (root === undefined) {
    return [];
  }

  const seenSymbolIds = new Set<string>([root.id]);
  const impactedPaths: ImpactPath[] = [];
  let frontier: TraversalState[] = [{ terminal: root, path: createRootPath(root) }];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const nextFrontier: TraversalState[] = [];

    for (const state of frontier.sort((left, right) => compareImpactPaths(left.path, right.path))) {
      const relations = incomingResolvedRelations(
        graph,
        symbolsById,
        state.terminal.id,
        edgeKinds
      );

      for (const relation of relations) {
        if (seenSymbolIds.has(relation.symbol.id)) {
          continue;
        }

        seenSymbolIds.add(relation.symbol.id);
        const path = extendImpactPath(
          state.path,
          state.terminal,
          relation.symbol,
          relation.edge
        );
        nextFrontier.push({ terminal: relation.symbol, path });
        impactedPaths.push(path);
      }
    }

    frontier = nextFrontier;
  }

  return impactedPaths.sort(compareImpactPaths);
}

/**
 * Traverses incoming exact static edges with a deterministic result cap.
 * Each retained impacted symbol has one shortest evidence path; alternative
 * paths to an already seen symbol are intentionally not counted.
 */
export function getBoundedExactImpactPaths(
  graph: SymbolGraph,
  symbolId: string,
  options: ExactImpactTraversalOptions
): ExactImpactTraversalResult {
  assertPositiveDepth(options.maxDepth);
  assertPositiveBound(options.maxResults, "maxResults");
  const edgeKinds = options.edgeKinds ?? DEFAULT_EXACT_IMPACT_EDGE_KINDS;

  const symbolsById = createSymbolIndex(graph.symbols);
  const root = symbolsById.get(symbolId);
  if (root === undefined) {
    return { paths: [], resultLimitReached: false };
  }

  const seenSymbolIds = new Set<string>([root.id]);
  const paths: ImpactPath[] = [];
  let resultLimitReached = false;
  let frontier: TraversalState[] = [{ terminal: root, path: createRootPath(root) }];

  for (let depth = 1; depth <= options.maxDepth && frontier.length > 0; depth += 1) {
    const nextFrontier: TraversalState[] = [];

    for (const state of frontier.sort((left, right) => compareImpactPaths(left.path, right.path))) {
      const relations = incomingExactRelations(
        graph,
        symbolsById,
        state.terminal.id,
        edgeKinds
      );

      for (const relation of relations) {
        if (seenSymbolIds.has(relation.symbol.id)) {
          continue;
        }
        if (paths.length >= options.maxResults) {
          resultLimitReached = true;
          continue;
        }

        seenSymbolIds.add(relation.symbol.id);
        const path = extendImpactPath(
          state.path,
          state.terminal,
          relation.symbol,
          relation.edge
        );
        paths.push(path);
        nextFrontier.push({ terminal: relation.symbol, path });
      }
    }

    frontier = nextFrontier;
  }

  return { paths: paths.sort(compareImpactPaths), resultLimitReached };
}
