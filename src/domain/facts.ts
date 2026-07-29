import type {
  ArtifactLanguage,
  GraphEdge,
  PendingReference,
  SourceRange,
  SymbolNode
} from "./types.js";

/**
 * Bump this value whenever extraction semantics change in a way that makes
 * previously persisted raw facts unsafe to reuse.
 */
export const ARTIFACT_FACTS_EXTRACTOR_VERSION = "typescript-ast-v4";

/**
 * Bump this value whenever cross-file resolution semantics change in a way
 * that requires a fresh graph projection from persisted facts.
 */
export const PROJECT_RESOLVER_VERSION = "project-resolver-v4";

export const EDGE_EVIDENCE_STAGES = [
  "syntax",
  "lexical",
  "module",
  "heuristic",
  "unresolved",
  "legacy"
] as const;

export type EdgeEvidenceStage = (typeof EDGE_EVIDENCE_STAGES)[number];

/**
 * The deterministic explanation for one graph edge.
 *
 * `candidateSymbolIds` is sorted by id and includes the selected target, when
 * there is one, together with every concrete symbol considered by the rule.
 */
export interface EdgeEvidence {
  readonly ruleId: string;
  readonly stage: EdgeEvidenceStage;
  readonly candidateSymbolIds: readonly string[];
  /** Project-relative config files that participated in module resolution. */
  readonly configurationPaths?: readonly string[];
  /** Project-relative file hops used to reach an exact re-export target. */
  readonly resolutionPath?: readonly string[];
}

/** A named import binding retained from syntax extraction for module resolution. */
export interface ImportBinding {
  readonly moduleSpecifier: string;
  readonly localName: string;
  readonly importedName: string;
  readonly range: SourceRange;
  /** Missing in pre-v0.15 facts means this binding is usable in value space. */
  readonly isTypeOnly?: boolean;
}

/** A local symbol name exposed through an export alias. */
export interface ExportBinding {
  readonly localName: string;
  readonly exportedName: string;
  readonly range: SourceRange;
  /** Missing in pre-v0.15 facts means this export is usable in value space. */
  readonly isTypeOnly?: boolean;
}

/** A syntax-proven re-export retained for later cross-file export resolution. */
export type ReExportBinding =
  | {
      readonly kind: "named";
      readonly moduleSpecifier: string;
      readonly importedName: string;
      readonly exportedName: string;
      readonly range: SourceRange;
      /** Missing in pre-v0.15 facts means this re-export is usable in value space. */
      readonly isTypeOnly?: boolean;
    }
  | {
      readonly kind: "wildcard";
      readonly moduleSpecifier: string;
      readonly range: SourceRange;
      /** Missing in pre-v0.15 facts means this re-export is usable in value space. */
      readonly isTypeOnly?: boolean;
    }
  | {
      /** Captured for provenance; namespace property dispatch remains deliberately unresolved. */
      readonly kind: "namespace";
      readonly moduleSpecifier: string;
      readonly exportedName: string;
      readonly range: SourceRange;
      /** Missing in pre-v0.15 facts means this re-export is usable in value space. */
      readonly isTypeOnly?: boolean;
    };

/** A TypeScript namespace in which a lexical binding is visible. */
export type BindingSpace = "value" | "type";

/** A lexical binding visible in either the value or type namespace. */
export interface LocalBinding {
  readonly name: string;
  /** Null means a real lexical binding exists but is intentionally not a graph symbol. */
  readonly symbolId: string | null;
  readonly scopeId: string;
  /** Missing only in pre-v0.15 persisted facts, where the binding is value-space. */
  readonly space?: BindingSpace;
}

/** Lexical scopes that were visible at one unresolved source reference, nearest first. */
export interface ReferenceScope {
  readonly referenceId: string;
  readonly scopeIds: readonly string[];
}

/**
 * Syntax-proven, file-local facts. They deliberately retain unresolved source
 * references so later resolution stages can be recomputed without reparsing.
 */
export interface ArtifactFacts {
  readonly symbols: readonly SymbolNode[];
  readonly edges: readonly GraphEdge[];
  readonly pendingReferences: readonly PendingReference[];
  readonly localBindings: readonly LocalBinding[];
  readonly referenceScopes: readonly ReferenceScope[];
  readonly importBindings: readonly ImportBinding[];
  readonly exportBindings: readonly ExportBinding[];
  readonly reExportBindings: readonly ReExportBinding[];
}

/**
 * Raw facts together with the immutable source artifact identity required to
 * safely cache and reuse them across graph generations.
 */
export interface PersistedArtifactFacts extends ArtifactFacts {
  readonly filePath: string;
  readonly language: ArtifactLanguage;
  readonly contentHash: string;
  readonly extractorVersion: string;
}
