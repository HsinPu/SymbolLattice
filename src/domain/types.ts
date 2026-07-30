import type { EdgeEvidence } from "./facts.js";
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
  "calls",
  "routes",
  "handles",
  ...HIERARCHY_RELATION_KINDS
] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

export type ResolutionKind = "exact" | "heuristic" | "unresolved";

/** Framework provenance retained for syntax-proven static HTTP or client-navigation routes. */
export type RouteFramework =
  | "express"
  | "fastify"
  | "nextjs"
  | "react-router"
  | "vue-router"
  | "fastapi"
  | "flask"
  | "gin"
  | "net-http"
  | "chi"
  | "axum"
  | "spring-web"
  | "laravel"
  | "civetweb"
  | "lapis"
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
  | "play";

/** Additional static registration context retained when it changes route provenance or path. */
export type RouteRegistration =
  | "fastify-inline-plugin-prefix"
  | "fastify-local-plugin-prefix"
  | "fastify-imported-plugin-prefix"
  | "nextjs-app-router"
  | "nextjs-pages-router"
  | "react-router-data-router"
  | "react-router-create-routes-from-elements";

export const ARTIFACT_LANGUAGES = [
  "typescript",
  "javascript",
  "vue",
  "python",
  "go",
  "rust",
  "java",
  "php",
  "c",
  "lua",
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
  "scala"
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
    "calls" | "imports" | "exports" | "routes" | HierarchyRelationKind
  >;
  /** Present only for syntax-proven framework route or client-navigation handlers. */
  readonly routeFramework?: RouteFramework;
  /** Present when a statically proven registration projects route provenance or a framework route path. */
  readonly routeRegistration?: RouteRegistration;
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
