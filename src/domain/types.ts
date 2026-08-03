import type { EdgeEvidence, RoutePrefixSegment } from "./facts.js";
import type { IndexStalenessReason } from "./index-inputs.js";
import type { IndexWork } from "./index-work.js";

export const SYMBOL_KINDS = [
  "file",
  "class",
  "function",
  "method",
  "interface",
  "type",
  "variable",
  "resource",
  "module",
  "route",
  "entrypoint"
] as const;

export type SymbolKind = (typeof SYMBOL_KINDS)[number];

/** Direct declaration-level TypeScript heritage relations. */
export const HIERARCHY_RELATION_KINDS = ["extends", "implements"] as const;

export type HierarchyRelationKind = (typeof HIERARCHY_RELATION_KINDS)[number];

export const EDGE_KINDS = [
  "contains",
  "imports",
  "exports",
  "references",
  "calls",
  "instantiates",
  "overrides",
  "routes",
  "handles",
  ...HIERARCHY_RELATION_KINDS
] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

export type ResolutionKind = "exact" | "heuristic" | "unresolved";

/** Reserved provenance namespace for validated, user-supplied framework route descriptors. */
export const CUSTOM_ROUTE_FRAMEWORK_PREFIX = "plugin:" as const;

export type CustomRouteFramework = `${typeof CUSTOM_ROUTE_FRAMEWORK_PREFIX}${string}`;

/** Framework provenance retained for syntax-proven static HTTP or client-navigation routes. */
export type RouteFramework =
  | "express"
  | "koa"
  | "hono"
  | "elysia"
  | "fastify"
  | "nextjs"
  | "sveltekit"
  | "astro"
  | "blazor"
  | "react-router"
  | "vue-router"
  | "fastapi"
  | "django-ninja"
  | "flask"
  | "django"
  | "starlette"
  | "aiohttp"
  | "sanic"
  | "gin"
  | "fiber"
  | "echo"
  | "iris"
  | "beego"
  | "gorilla-mux"
  | "httprouter"
  | "net-http"
  | "chi"
  | "goframe"
  | "axum"
  | "actix-web"
  | "rocket"
  | "spring-web"
  | "micronaut"
  | "jakarta-rest"
  | "laravel"
  | "drupal"
  | "civetweb"
  | "lapis"
  | "horse"
  | "plumber"
  | "phoenix"
  | "cowboy"
  | "compojure"
  | "dancer2"
  | "genie"
  | "scotty"
  | "dream"
  | "giraffe"
  | "jester"
  | "cpp-httplib"
  | "aspnet-core"
  | "rails"
  | "ktor"
  | "vapor"
  | "flutter"
  | "play"
  | CustomRouteFramework;

const CUSTOM_ROUTE_FRAMEWORK_ID_PATTERN = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/u;

/** Creates provenance for a public framework route descriptor after strict namespace validation. */
export function customRouteFramework(pluginId: string): CustomRouteFramework {
  if (!CUSTOM_ROUTE_FRAMEWORK_ID_PATTERN.test(pluginId)) {
    throw new Error(`Invalid custom route framework id: ${pluginId}`);
  }
  return `${CUSTOM_ROUTE_FRAMEWORK_PREFIX}${pluginId}`;
}

/** Distinguishes persisted public-extension provenance from first-party framework names. */
export function isCustomRouteFramework(
  framework: RouteFramework | undefined
): framework is CustomRouteFramework {
  return (
    typeof framework === "string" &&
    framework.startsWith(CUSTOM_ROUTE_FRAMEWORK_PREFIX) &&
    CUSTOM_ROUTE_FRAMEWORK_ID_PATTERN.test(framework.slice(CUSTOM_ROUTE_FRAMEWORK_PREFIX.length))
  );
}

/** Additional static registration context retained when it changes route provenance or path. */
export type RouteRegistration =
  | "fastify-inline-plugin-prefix"
  | "fastify-local-plugin-prefix"
  | "fastify-imported-plugin-prefix"
  | "plugin-literal-prefix-mount"
  | "plugin-literal-prefix-chain"
  | "rails-resources"
  | "rails-resource"
  | "nextjs-app-router"
  | "nextjs-pages-router"
  | "sveltekit-filesystem-page"
  | "astro-filesystem-page"
  | "astro-filesystem-endpoint"
  | "blazor-page-directive"
  | "react-router-data-router"
  | "react-router-create-routes-from-elements";

/**
 * Project-wide framework evidence discovered without evaluating application
 * configuration. Extractors may use it only to enable conventions that would
 * otherwise be ambiguous with another framework.
 */
export interface ProjectFrameworkEvidence {
  readonly astro: boolean;
}

export const ARTIFACT_LANGUAGES = [
  "typescript",
  "javascript",
  "arkts",
  "vue",
  "svelte",
  "astro",
  "razor",
  "python",
  "go",
  "rust",
  "java",
  "groovy",
  "fortran",
  "ada",
  "php",
  "blade",
  "c",
  "lua",
  "luau",
  "pascal",
  "objc",
  "r",
  "elixir",
  "erlang",
  "clojure",
  "perl",
  "julia",
  "haskell",
  "ocaml",
  "fsharp",
  "nim",
  "cpp",
  "csharp",
  "ruby",
  "kotlin",
  "swift",
  "dart",
  "scala",
  "terraform",
  "liquid",
  "twig",
  "solidity",
  "cfml",
  "nix",
  "vbnet",
  "cobol",
  "zig",
  "yaml",
  "xml",
  "properties",
  "shell",
  "sql",
  "graphql",
  "proto"
] as const;

export type ArtifactLanguage = (typeof ARTIFACT_LANGUAGES)[number];

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

export interface SourceRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface IndexedFile {
  readonly path: string;
  readonly contentHash: string;
  readonly language: ArtifactLanguage;
  readonly indexedAt: string;
}

export interface SymbolNode {
  readonly id: string;
  readonly name: string;
  readonly qualifiedName: string;
  readonly kind: SymbolKind;
  readonly filePath: string;
  readonly range: SourceRange;
  readonly isExported: boolean;
  readonly declarationOrdinal: number;
}

export interface GraphEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string | null;
  readonly kind: EdgeKind;
  readonly filePath: string;
  readonly range: SourceRange;
  readonly resolution: ResolutionKind;
  readonly confidence: number;
  readonly referenceName: string | null;
  /** Omitted only for v0.1-compatible persisted snapshots. */
  readonly evidence?: EdgeEvidence;
}

export interface PendingReference {
  readonly id: string;
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly relationKind: Extract<
    EdgeKind,
    | "calls"
    | "instantiates"
    | "overrides"
    | "imports"
    | "exports"
    | "routes"
    | HierarchyRelationKind
  >;
  /** Present only for syntax-proven framework route or client-navigation handlers. */
  readonly routeFramework?: RouteFramework;
  /** Present when a statically proven registration projects route provenance or a framework route path. */
  readonly routeRegistration?: RouteRegistration;
  /** Ordered static mount evidence when a framework route uses a projected prefix. */
  readonly routePrefixChain?: readonly RoutePrefixSegment[];
  readonly range: SourceRange;
}

export interface IndexCounts {
  readonly files: number;
  readonly symbols: number;
  readonly edges: number;
  readonly pendingReferences: number;
}

export interface IndexStatus {
  readonly initialized: boolean;
  readonly stale: boolean;
  /** Empty when the active generation is current. */
  readonly staleReasons: readonly IndexStalenessReason[];
  readonly projectPath: string;
  readonly indexedAt: string | null;
  readonly generationId: string | null;
  readonly counts: IndexCounts;
  /** Omitted for generations created before index-work telemetry existed. */
  readonly lastIndexWork?: IndexWork;
}

export interface GraphSnapshot {
  readonly files: readonly IndexedFile[];
  readonly symbols: readonly SymbolNode[];
  readonly edges: readonly GraphEdge[];
  readonly pendingReferences: readonly PendingReference[];
}
