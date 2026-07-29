import type {
  GraphRelation,
  ImpactPath,
  SymbolMatch
} from "../domain/graph.js";
import type { GraphEdge, GraphSnapshot, IndexStatus, SymbolNode } from "../domain/types.js";

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
