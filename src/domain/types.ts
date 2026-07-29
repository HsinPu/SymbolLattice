import type { EdgeEvidence } from "./facts.js";
import type { IndexStalenessReason } from "./index-inputs.js";

export const SYMBOL_KINDS = [
  "file",
  "class",
  "function",
  "method",
  "interface",
  "type",
  "variable"
] as const;

export type SymbolKind = (typeof SYMBOL_KINDS)[number];

export const EDGE_KINDS = ["contains", "imports", "exports", "calls"] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

export type ResolutionKind = "exact" | "heuristic" | "unresolved";

export const ARTIFACT_LANGUAGES = ["typescript", "javascript"] as const;

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
  readonly relationKind: Extract<EdgeKind, "calls" | "imports" | "exports">;
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
}

export interface GraphSnapshot {
  readonly files: readonly IndexedFile[];
  readonly symbols: readonly SymbolNode[];
  readonly edges: readonly GraphEdge[];
  readonly pendingReferences: readonly PendingReference[];
}
