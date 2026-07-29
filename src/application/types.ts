import type {
  GraphRelation,
  ImpactPath,
  SymbolMatch
} from "../domain/graph.js";
import type {
  ArtifactLanguage,
  GraphEdge,
  GraphSnapshot,
  IndexStatus,
  SourceRange,
  SymbolNode
} from "../domain/types.js";

export interface GraphContext {
  readonly status: IndexStatus;
  readonly snapshot: GraphSnapshot;
}

export interface SourceExcerptLine {
  readonly line: number;
  readonly text: string;
}

export interface SourceExcerpt {
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly lines: readonly SourceExcerptLine[];
}

export interface FindResult {
  readonly status: IndexStatus;
  readonly symbols: readonly SymbolNode[];
}

/** Optional filters for persisted-source lexical retrieval. */
export interface SearchOptions {
  /** Maximum number of matching indexed files to return. */
  readonly limit?: number;
  /** Project-relative directory or file prefix, normalized to forward slashes. */
  readonly pathPrefix?: string;
  /** Restricts results to one indexed source language. */
  readonly language?: ArtifactLanguage;
}

/** One deterministic source hit from the active persisted graph generation. */
export interface SourceSearchHitResult {
  /** One-based position in the persisted retrieval ordering. */
  readonly rank: number;
  readonly filePath: string;
  readonly language: ArtifactLanguage;
  /** Exact lexical span selected from the persisted source text. */
  readonly range: SourceRange;
  /** Small persisted-source context around the lexical span. */
  readonly excerpt: SourceExcerpt;
  /** Query terms found directly in the persisted source text. */
  readonly matchingTerms: readonly string[];
  /** Stable explanation of how this file matched the persisted lexical index. */
  readonly lexicalReason: string;
  /** All non-file declarations whose persisted ranges overlap the lexical span. */
  readonly symbolCandidates: readonly SymbolNode[];
}

export interface SearchResult {
  /** Freshness is evaluated against the current project without changing these persisted hits. */
  readonly status: IndexStatus;
  readonly results: readonly SourceSearchHitResult[];
}

export interface RelationResult {
  readonly status: IndexStatus;
  readonly symbol: SymbolNode;
  readonly relations: readonly GraphRelation[];
}

export interface ImpactResult {
  readonly status: IndexStatus;
  readonly symbol: SymbolNode;
  readonly paths: readonly ImpactPath[];
}

export interface ExploreResult {
  readonly status: IndexStatus;
  readonly match: SymbolMatch;
  readonly source: SourceExcerpt | null;
  readonly callers: readonly GraphRelation[];
  readonly callees: readonly GraphRelation[];
  readonly impact: readonly ImpactPath[];
}

/**
 * A proof-oriented view of one persisted graph relation. The edge retains its
 * optional evidence, while the resolved endpoints make the explanation useful
 * without a follow-up symbol lookup.
 */
export interface ExplainEdgeResult {
  readonly status: IndexStatus;
  readonly edge: GraphEdge;
  readonly source: SymbolNode;
  readonly target: SymbolNode | null;
}
