import type { ArtifactLanguage } from "./types.js";

/**
 * Versioned independently from extraction and resolution: a generation can
 * reuse raw facts while still needing its retrieval projection rebuilt.
 */
export const SOURCE_SEARCH_INDEX_VERSION = "fts5-source-v1";

export const DEFAULT_SOURCE_SEARCH_LIMIT = 20;
export const MAX_SOURCE_SEARCH_LIMIT = 100;

/**
 * Mirrors the portable lexical comparison used to reconstruct local FTS hits
 * for source evidence. The configured tokenizer folds common diacritics, so
 * result spans must fold them in the same direction.
 */
export function normalizeSourceSearchLexicalText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Source text captured with an active graph generation for local retrieval. */
export interface IndexedSourceDocument {
  readonly filePath: string;
  readonly language: ArtifactLanguage;
  readonly sourceText: string;
}

/** Validated, bounded request handed from the application to a retrieval store. */
export interface SourceSearchRequest {
  readonly query: string;
  readonly terms: readonly string[];
  readonly limit: number;
  /** Project-relative prefix filter, normalized with forward slashes. */
  readonly pathPrefix?: string;
  readonly language?: ArtifactLanguage;
}

/** A raw hit from one active-generation source document. */
export interface IndexedSourceSearchHit {
  readonly filePath: string;
  readonly language: ArtifactLanguage;
  /** The immutable source text captured during the indexed generation. */
  readonly sourceText: string;
  /** Retrieval relevance value; consumers must retain store order. */
  readonly relevance: number;
}

/**
 * Normalize a human query into safe lexical terms. The retrieval adapter turns
 * each term into a quoted prefix query, so punctuation is never interpreted as
 * query syntax and partial identifier prefixes remain useful.
 */
export function sourceSearchTerms(query: string): readonly string[] {
  return [
    ...new Set(
      (normalizeSourceSearchLexicalText(query).match(/[\p{L}\p{N}_]+/gu) ?? []).filter(
        (term) => term.length > 0
      )
    )
  ];
}

/** Produces the secondary token corpus that makes camelCase/snake_case searchable by part. */
export function sourceSearchCorpus(sourceText: string): string {
  const identifiers = sourceText.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
  const parts = identifiers.flatMap((identifier) =>
    identifier
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .split(/[_$]+/)
      .filter((part) => part.length > 0)
  );
  return `${sourceText}\n${parts.join(" ")}`;
}
