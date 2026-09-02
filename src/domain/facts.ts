import type {
  ArtifactLanguage,
  ExtractionPluginProvenance,
  FrameworkPluginProvenance,
  GraphEdge,
  PendingReference,
  SourceRange,
  SymbolNode
} from "./types.js";
import type { RouteMethod } from "./graph.js";

/**
 * Bump this value whenever extraction semantics change in a way that makes
 * previously persisted raw facts unsafe to reuse.
 */
export const ARTIFACT_FACTS_EXTRACTOR_VERSION = "multi-language-ast-v395";

/**
 * Bump this value whenever cross-file resolution semantics change in a way
 * that requires a fresh graph projection from persisted facts.
 */
export const PROJECT_RESOLVER_VERSION = "project-resolver-v197";

/** Hard cap for one source-proven Java exhaustive if/else-if/else assignment join. */
export const JAVA_EXHAUSTIVE_ASSIGNMENT_JOIN_MAXIMUM_BRANCHES = 8;

/** Hard cap for one source-proven Java exhaustive switch-rule assignment join. */
export const JAVA_EXHAUSTIVE_SWITCH_JOIN_MAXIMUM_ARMS = 8;

/** Hard cap for one source-proven Java positive instanceof `&&` flow chain. */
export const JAVA_INSTANCEOF_AND_CHAIN_MAXIMUM_OPERANDS = 8;

/** Hard cap for parentheses retained around one negated Java pattern guard. */
export const JAVA_NEGATED_PATTERN_MAXIMUM_GROUPING_DEPTH = 4;

export const EDGE_EVIDENCE_STAGES = [
  "syntax",
  "lexical",
  "module",
  "heuristic",
  "unresolved",
  "legacy"
] as const;

export type EdgeEvidenceStage = (typeof EDGE_EVIDENCE_STAGES)[number];

/** One ordered, syntax-proven segment that projected a framework route prefix. */
export interface RoutePrefixSegment {
  /** Project-relative source file containing the direct mount call. */
  readonly filePath: string;
  /** Exact source range of the direct mount call that supplied this segment. */
  readonly range: SourceRange;
  readonly parentReceiver: string;
  readonly childReceiver: string;
  readonly mountMethod: string;
  readonly prefix: string;
}

/** One source-declared overload considered against a syntax-proven call arity. */
export interface CallArityCandidateEvidence {
  readonly symbolId: string;
  readonly minimumArgumentCount: number;
  /** Null means the declaration accepts additional varargs arguments. */
  readonly maximumArgumentCount: number | null;
  readonly applicable: boolean;
}

/** Deterministic overload filtering evidence for one exact call edge. */
export interface CallArityEvidence {
  readonly actualArgumentCount: number;
  readonly candidates: readonly CallArityCandidateEvidence[];
}

export type CallTypeCompatibility =
  | "compatible"
  | "incompatible"
  | "unknown"
  | "not-applicable";

export type CallTypeConversionKind =
  | "exact"
  | "primitive-widening"
  | "reference-widening"
  | "incompatible"
  | "unknown";

/** One exact persisted heritage edge used to prove a reference widening conversion. */
export interface CallTypeHierarchySegmentEvidence {
  readonly edgeId: string;
  readonly sourceSymbolId: string;
  readonly targetSymbolId: string;
  readonly relationKind: "extends" | "implements";
  readonly filePath: string;
  readonly range: SourceRange;
  readonly ruleId: string;
}

/** One declaration owner considered while dispatching a call through an inherited Java type. */
export interface CallDispatchOwnerCandidateEvidence {
  readonly ownerTypeSymbolId: string;
  /** Persisted declaration kind used by Java's class-over-interface precedence rule. */
  readonly ownerTypeKind: "class" | "interface";
  readonly declarationSymbolIds: readonly string[];
  readonly distance: number;
  readonly hierarchyPath: readonly CallTypeHierarchySegmentEvidence[];
}

/** One bounded Java dispatch signature after syntax-proven type canonicalization. */
export interface CallDispatchSignatureEvidence {
  readonly invocationMode: "fixed" | "varargs";
  readonly parameterTypes: readonly (string | null)[];
  readonly complete: boolean;
}

/** Caller-context proof used to admit one Java member into a chained dispatch method set. */
export interface CallDispatchAccessEvidence {
  readonly policy: "java-source-access-v1";
  readonly visibility: "public" | "protected" | "package" | "private";
  readonly decision:
    | "declaring-class"
    | "public"
    | "same-package"
    | "protected-subclass-receiver"
    | "protected-subclass-static";
  readonly callerTypeSymbolId: string;
  readonly callerPackageName: string;
  readonly receiverTypeSymbolId: string;
  readonly receiverPackageName: string;
  readonly ownerTypeSymbolId: string;
  readonly ownerPackageName: string;
  readonly callerToOwnerPath: readonly CallTypeHierarchySegmentEvidence[];
  readonly receiverToCallerPath: readonly CallTypeHierarchySegmentEvidence[];
}

/** Caller-context proof used to admit one Java field as a receiver binding. */
export interface CallFieldAccessEvidence {
  readonly policy: "java-source-field-access-v1";
  readonly visibility: "public" | "protected" | "package" | "private";
  readonly decision: "declaring-class" | "public" | "same-package" | "protected-subclass";
  readonly callerTypeSymbolId: string;
  readonly callerPackageName: string;
  readonly ownerTypeSymbolId: string;
  readonly ownerPackageName: string;
}

/** Shared source declaration proof for the static receiver type of one Java call. */
interface CallReceiverBindingEvidenceBase {
  readonly kind:
    | "parameter"
    | "local"
    | "enhanced-for"
    | "catch"
    | "lambda"
    | "instanceof-pattern"
    | "instanceof-and-pattern"
    | "instanceof-and-chain-pattern"
    | "instanceof-grouped-and-pattern"
    | "instanceof-negated-early-exit-pattern"
    | "instanceof-negated-target-exit-pattern"
    | "instanceof-negated-else-pattern"
    | "try-resource"
    | "field"
    | "this-field"
    | "super-field"
    | "type-field";
  readonly name: string;
  readonly type: CallTypeValueEvidence;
  readonly declarationRange: SourceRange;
  readonly scopeRange: SourceRange;
}

/** Lexical or bounded project-selected field evidence proving one Java receiver type. */
export type CallReceiverBindingEvidence =
  | (CallReceiverBindingEvidenceBase &
      (
        | {
            readonly kind: "parameter" | "local";
            readonly policy: "java-source-lexical-binding-v1";
          }
        | {
            readonly kind: "local";
            readonly policy: "java-source-lexical-binding-v2";
            readonly typeSource: "object-creation-initializer";
            readonly initializerRange: SourceRange;
          }
        | {
            readonly kind: "local";
            readonly policy: "java-source-lexical-binding-v6";
            readonly typeSource: "declared-type-after-direct-assignment";
            readonly assignment: {
              readonly policy: "java-source-direct-assignment-v1";
              readonly range: SourceRange;
              readonly initializerRange: SourceRange;
              readonly valueType: CallTypeValueEvidence;
              readonly compatibility: "identity" | "reference-widening";
              readonly hierarchyPath: readonly CallTypeHierarchySegmentEvidence[];
              readonly hierarchyBounds: {
                readonly maximumDepth: number;
                readonly maximumVisitedTypes: number;
              };
            };
          }
        | {
            readonly kind: "local";
            readonly policy: "java-source-lexical-binding-v7";
            readonly typeSource: "declared-type-after-exhaustive-if-else";
            readonly assignmentJoin: {
              readonly policy: "java-source-if-else-assignment-join-v1";
              readonly statementRange: SourceRange;
              readonly conditionRange: SourceRange;
              readonly branches: readonly [
                {
                  readonly branch: "then";
                  readonly scopeRange: SourceRange;
                  readonly assignmentRange: SourceRange;
                  readonly initializerRange: SourceRange;
                  readonly valueType: CallTypeValueEvidence;
                  readonly compatibility: "identity" | "reference-widening";
                  readonly hierarchyPath: readonly CallTypeHierarchySegmentEvidence[];
                  readonly hierarchyBounds: {
                    readonly maximumDepth: number;
                    readonly maximumVisitedTypes: number;
                  };
                },
                {
                  readonly branch: "else";
                  readonly scopeRange: SourceRange;
                  readonly assignmentRange: SourceRange;
                  readonly initializerRange: SourceRange;
                  readonly valueType: CallTypeValueEvidence;
                  readonly compatibility: "identity" | "reference-widening";
                  readonly hierarchyPath: readonly CallTypeHierarchySegmentEvidence[];
                  readonly hierarchyBounds: {
                    readonly maximumDepth: number;
                    readonly maximumVisitedTypes: number;
                  };
                }
              ];
            };
          }
        | {
            readonly kind: "local";
            readonly policy: "java-source-lexical-binding-v8";
            readonly typeSource: "declared-type-after-exhaustive-if-else-chain";
            readonly assignmentJoin: {
              readonly policy: "java-source-if-else-chain-assignment-join-v1";
              readonly statementRange: SourceRange;
              readonly bounds: {
                readonly maximumBranches: number;
                readonly observedBranches: number;
              };
              readonly branches: readonly {
                readonly ordinal: number;
                readonly branch: "if" | "else-if" | "else";
                readonly statementRange: SourceRange;
                readonly conditionRange?: SourceRange;
                readonly scopeRange: SourceRange;
                readonly assignmentRange: SourceRange;
                readonly initializerRange: SourceRange;
                readonly valueType: CallTypeValueEvidence;
                readonly compatibility: "identity" | "reference-widening";
                readonly hierarchyPath: readonly CallTypeHierarchySegmentEvidence[];
                readonly hierarchyBounds: {
                  readonly maximumDepth: number;
                  readonly maximumVisitedTypes: number;
                };
              }[];
            };
          }
        | {
            readonly kind: "local";
            readonly policy: "java-source-lexical-binding-v9";
            readonly typeSource: "declared-type-after-exhaustive-switch-rules";
            readonly assignmentJoin: {
              readonly policy: "java-source-switch-rule-assignment-join-v1";
              readonly statementRange: SourceRange;
              readonly selectorRange: SourceRange;
              readonly bounds: {
                readonly maximumArms: number;
                readonly observedArms: number;
              };
              readonly arms: readonly {
                readonly ordinal: number;
                readonly arm: "case" | "default";
                readonly labelRange: SourceRange;
                readonly assignmentRange: SourceRange;
                readonly initializerRange: SourceRange;
                readonly valueType: CallTypeValueEvidence;
                readonly compatibility: "identity" | "reference-widening";
                readonly hierarchyPath: readonly CallTypeHierarchySegmentEvidence[];
                readonly hierarchyBounds: {
                  readonly maximumDepth: number;
                  readonly maximumVisitedTypes: number;
                };
              }[];
            };
          }
      ))
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "enhanced-for" | "catch" | "lambda";
      readonly policy: "java-source-lexical-binding-v3";
      readonly typeSource: "declared-type";
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-pattern";
      readonly policy: "java-source-lexical-binding-v10";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-and-pattern";
      readonly policy: "java-source-lexical-binding-v11";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly rightOperandRange: SourceRange;
      readonly trueBlockRange: SourceRange;
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-and-chain-pattern";
      readonly policy: "java-source-lexical-binding-v12";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly logicalOperandRanges: readonly SourceRange[];
      readonly activeOperandRange: SourceRange | null;
      readonly activeOperandOrdinal: number | null;
      readonly trueBlockRange: SourceRange;
      readonly operandCount: number;
      readonly maximumOperands: number;
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-grouped-and-pattern";
      readonly policy: "java-source-lexical-binding-v13";
      readonly typeSource: "instanceof-pattern";
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
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-negated-early-exit-pattern";
      readonly policy: "java-source-lexical-binding-v14";
      readonly typeSource: "instanceof-pattern";
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
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-negated-target-exit-pattern";
      readonly policy: "java-source-lexical-binding-v16";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly negatedPatternRange: SourceRange;
      readonly negationGroupingRanges: readonly SourceRange[];
      readonly maximumGroupingDepth: number;
      readonly guardStatementRange: SourceRange;
      readonly exitBodyKind: "block" | "statement";
      readonly exitBodyRange: SourceRange;
      readonly abruptCompletionKind: "break" | "continue";
      readonly abruptStatementRange: SourceRange;
      readonly abruptTargetKind: "while" | "do" | "for" | "enhanced-for";
      readonly abruptTargetRange: SourceRange;
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-negated-target-exit-pattern";
      readonly policy: "java-source-lexical-binding-v18";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly negatedPatternRange: SourceRange;
      readonly negationGroupingRanges: readonly SourceRange[];
      readonly maximumGroupingDepth: number;
      readonly guardStatementRange: SourceRange;
      readonly exitBodyKind: "block" | "statement";
      readonly exitBodyRange: SourceRange;
      readonly abruptCompletionKind: "break" | "continue";
      readonly abruptStatementRange: SourceRange;
      readonly abruptTargetKind: "while" | "do" | "for" | "enhanced-for" | "block" | "statement";
      readonly abruptTargetRange: SourceRange;
      readonly abruptTargetBodyRange: SourceRange;
      readonly abruptTargetLabel: string;
      readonly abruptTargetLabelRange: SourceRange;
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-negated-target-exit-pattern";
      readonly policy: "java-source-lexical-binding-v20";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly negatedPatternRange: SourceRange;
      readonly negationGroupingRanges: readonly SourceRange[];
      readonly maximumGroupingDepth: number;
      readonly guardStatementRange: SourceRange;
      readonly exitBodyKind: "block" | "statement";
      readonly exitBodyRange: SourceRange;
      readonly abruptCompletionKind: "break";
      readonly abruptStatementRange: SourceRange;
      readonly abruptTargetKind: "switch";
      readonly abruptTargetRange: SourceRange;
      readonly abruptTargetBodyRange: SourceRange;
      readonly abruptTargetCaseGroupRange: SourceRange;
      readonly abruptTargetCaseLabelRanges: readonly SourceRange[];
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-negated-target-exit-pattern";
      readonly policy: "java-source-lexical-binding-v22";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly negatedPatternRange: SourceRange;
      readonly negationGroupingRanges: readonly SourceRange[];
      readonly maximumGroupingDepth: number;
      readonly guardStatementRange: SourceRange;
      readonly exitBodyKind: "block" | "statement";
      readonly exitBodyRange: SourceRange;
      readonly abruptCompletionKind: "yield";
      readonly abruptStatementRange: SourceRange;
      readonly abruptTargetKind: "switch-expression";
      readonly abruptTargetRange: SourceRange;
      readonly abruptTargetBodyRange: SourceRange;
      readonly abruptTargetRuleRange: SourceRange;
      readonly abruptTargetRuleBodyRange: SourceRange;
      readonly abruptTargetRuleLabelRange: SourceRange;
      readonly abruptTargetExpressionContext: "return" | "initializer" | "assignment" | "yield";
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind:
        | "instanceof-negated-early-exit-pattern"
        | "instanceof-negated-target-exit-pattern";
      readonly policy: "java-source-lexical-binding-v24";
      readonly typeSource: "instanceof-pattern";
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
      readonly abruptTargetKind:
        | "while"
        | "do"
        | "for"
        | "enhanced-for"
        | "block"
        | "statement"
        | "switch"
        | "switch-expression"
        | null;
      readonly abruptTargetRange: SourceRange | null;
      readonly abruptTargetBodyRange: SourceRange | null;
      readonly abruptTargetCaseGroupRange: SourceRange | null;
      readonly abruptTargetCaseLabelRanges: readonly SourceRange[];
      readonly abruptTargetRuleRange: SourceRange | null;
      readonly abruptTargetRuleBodyRange: SourceRange | null;
      readonly abruptTargetRuleLabelRange: SourceRange | null;
      readonly abruptTargetExpressionContext:
        | "return"
        | "initializer"
        | "assignment"
        | "yield"
        | null;
      readonly abruptTargetLabel: string | null;
      readonly abruptTargetLabelRange: SourceRange | null;
      readonly abruptWrapperKind: "try-finally";
      readonly abruptWrapperPolicy: "java-source-transparent-finally-v1";
      readonly abruptWrapperRange: SourceRange;
      readonly abruptWrapperTryBodyRange: SourceRange;
      readonly abruptWrapperFinallyRange: SourceRange;
      readonly abruptWrapperFinallyBodyRange: SourceRange;
      readonly abruptWrapperFinallyStatementRanges: readonly SourceRange[];
      readonly abruptWrapperBounds: {
        readonly maximumFinallyStatements: number;
        readonly observedFinallyStatements: number;
      };
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-negated-else-pattern";
      readonly policy: "java-source-lexical-binding-v15";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly negatedPatternRange: SourceRange;
      readonly negationGroupingRanges: readonly SourceRange[];
      readonly maximumGroupingDepth: number;
      readonly guardStatementRange: SourceRange;
      readonly thenBodyKind: "block" | "statement";
      readonly thenBodyRange: SourceRange;
      readonly thenAbruptCompletionKind: "return" | "throw" | null;
      readonly thenAbruptStatementRange: SourceRange | null;
      readonly elseBodyKind: "block" | "statement";
      readonly elseBodyRange: SourceRange;
      readonly activeRegion: "else-body" | "following-scope";
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-negated-else-pattern";
      readonly policy: "java-source-lexical-binding-v17";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly negatedPatternRange: SourceRange;
      readonly negationGroupingRanges: readonly SourceRange[];
      readonly maximumGroupingDepth: number;
      readonly guardStatementRange: SourceRange;
      readonly thenBodyKind: "block" | "statement";
      readonly thenBodyRange: SourceRange;
      readonly thenAbruptCompletionKind: "break" | "continue";
      readonly thenAbruptStatementRange: SourceRange;
      readonly thenAbruptTargetKind: "while" | "do" | "for" | "enhanced-for";
      readonly thenAbruptTargetRange: SourceRange;
      readonly elseBodyKind: "block" | "statement";
      readonly elseBodyRange: SourceRange;
      readonly activeRegion: "else-body" | "following-scope";
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-negated-else-pattern";
      readonly policy: "java-source-lexical-binding-v19";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly negatedPatternRange: SourceRange;
      readonly negationGroupingRanges: readonly SourceRange[];
      readonly maximumGroupingDepth: number;
      readonly guardStatementRange: SourceRange;
      readonly thenBodyKind: "block" | "statement";
      readonly thenBodyRange: SourceRange;
      readonly thenAbruptCompletionKind: "break" | "continue";
      readonly thenAbruptStatementRange: SourceRange;
      readonly thenAbruptTargetKind:
        | "while"
        | "do"
        | "for"
        | "enhanced-for"
        | "block"
        | "statement";
      readonly thenAbruptTargetRange: SourceRange;
      readonly thenAbruptTargetBodyRange: SourceRange;
      readonly thenAbruptTargetLabel: string;
      readonly thenAbruptTargetLabelRange: SourceRange;
      readonly elseBodyKind: "block" | "statement";
      readonly elseBodyRange: SourceRange;
      readonly activeRegion: "else-body" | "following-scope";
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-negated-else-pattern";
      readonly policy: "java-source-lexical-binding-v21";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly negatedPatternRange: SourceRange;
      readonly negationGroupingRanges: readonly SourceRange[];
      readonly maximumGroupingDepth: number;
      readonly guardStatementRange: SourceRange;
      readonly thenBodyKind: "block" | "statement";
      readonly thenBodyRange: SourceRange;
      readonly thenAbruptCompletionKind: "break";
      readonly thenAbruptStatementRange: SourceRange;
      readonly thenAbruptTargetKind: "switch";
      readonly thenAbruptTargetRange: SourceRange;
      readonly thenAbruptTargetBodyRange: SourceRange;
      readonly thenAbruptTargetCaseGroupRange: SourceRange;
      readonly thenAbruptTargetCaseLabelRanges: readonly SourceRange[];
      readonly elseBodyKind: "block" | "statement";
      readonly elseBodyRange: SourceRange;
      readonly activeRegion: "else-body" | "following-scope";
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-negated-else-pattern";
      readonly policy: "java-source-lexical-binding-v23";
      readonly typeSource: "instanceof-pattern";
      readonly conditionRange: SourceRange;
      readonly testedValueRange: SourceRange;
      readonly negatedPatternRange: SourceRange;
      readonly negationGroupingRanges: readonly SourceRange[];
      readonly maximumGroupingDepth: number;
      readonly guardStatementRange: SourceRange;
      readonly thenBodyKind: "block" | "statement";
      readonly thenBodyRange: SourceRange;
      readonly thenAbruptCompletionKind: "yield";
      readonly thenAbruptStatementRange: SourceRange;
      readonly thenAbruptTargetKind: "switch-expression";
      readonly thenAbruptTargetRange: SourceRange;
      readonly thenAbruptTargetBodyRange: SourceRange;
      readonly thenAbruptTargetRuleRange: SourceRange;
      readonly thenAbruptTargetRuleBodyRange: SourceRange;
      readonly thenAbruptTargetRuleLabelRange: SourceRange;
      readonly thenAbruptTargetExpressionContext:
        | "return"
        | "initializer"
        | "assignment"
        | "yield";
      readonly elseBodyKind: "block" | "statement";
      readonly elseBodyRange: SourceRange;
      readonly activeRegion: "else-body" | "following-scope";
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "instanceof-negated-else-pattern";
      readonly policy: "java-source-lexical-binding-v25";
      readonly typeSource: "instanceof-pattern";
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
        | "yield";
      readonly thenAbruptStatementRange: SourceRange;
      readonly thenAbruptTargetKind:
        | "while"
        | "do"
        | "for"
        | "enhanced-for"
        | "block"
        | "statement"
        | "switch"
        | "switch-expression"
        | null;
      readonly thenAbruptTargetRange: SourceRange | null;
      readonly thenAbruptTargetBodyRange: SourceRange | null;
      readonly thenAbruptTargetCaseGroupRange: SourceRange | null;
      readonly thenAbruptTargetCaseLabelRanges: readonly SourceRange[];
      readonly thenAbruptTargetRuleRange: SourceRange | null;
      readonly thenAbruptTargetRuleBodyRange: SourceRange | null;
      readonly thenAbruptTargetRuleLabelRange: SourceRange | null;
      readonly thenAbruptTargetExpressionContext:
        | "return"
        | "initializer"
        | "assignment"
        | "yield"
        | null;
      readonly thenAbruptTargetLabel: string | null;
      readonly thenAbruptTargetLabelRange: SourceRange | null;
      readonly thenAbruptWrapperKind: "try-finally";
      readonly thenAbruptWrapperPolicy: "java-source-transparent-finally-v1";
      readonly thenAbruptWrapperRange: SourceRange;
      readonly thenAbruptWrapperTryBodyRange: SourceRange;
      readonly thenAbruptWrapperFinallyRange: SourceRange;
      readonly thenAbruptWrapperFinallyBodyRange: SourceRange;
      readonly thenAbruptWrapperFinallyStatementRanges: readonly SourceRange[];
      readonly thenAbruptWrapperBounds: {
        readonly maximumFinallyStatements: number;
        readonly observedFinallyStatements: number;
      };
      readonly elseBodyKind: "block" | "statement";
      readonly elseBodyRange: SourceRange;
      readonly activeRegion: "else-body" | "following-scope";
    })
  | (CallReceiverBindingEvidenceBase &
      (
        | {
            readonly kind: "try-resource";
            readonly policy: "java-source-lexical-binding-v4";
          }
        | {
            readonly kind: "try-resource";
            readonly policy: "java-source-lexical-binding-v5";
            readonly resourceOrdinal: number;
            readonly visibility: "later-resources-and-try-body";
            readonly tryBodyRange: SourceRange;
          }
      ) &
      (
        | { readonly typeSource: "declared-type" }
        | {
            readonly typeSource: "object-creation-initializer";
            readonly initializerRange: SourceRange;
          }
      ))
  | (CallReceiverBindingEvidenceBase &
      {
        readonly kind: "field" | "this-field" | "super-field";
        readonly declaringTypeSymbolId: string;
        readonly isStatic: boolean;
        readonly visibility: "public" | "protected" | "package" | "private";
      } &
      (
        | { readonly policy: "java-source-field-binding-v1" }
        | {
            readonly policy: "java-source-field-binding-v2";
            readonly selectionReason: "declared-owner" | "nearest-inherited-owner";
            readonly ownerSelectionPath: readonly CallTypeHierarchySegmentEvidence[];
            readonly hierarchyBounds: {
              readonly maximumDepth: number;
              readonly maximumVisitedTypes: number;
            };
            readonly access: CallFieldAccessEvidence;
          }
        | {
            readonly policy: "java-source-field-binding-v3";
            readonly declaringTypeKind: "class" | "interface";
            readonly isFinal: boolean;
            readonly modifierProof: "declared" | "interface-implicit";
            readonly selectionReason:
              | "declared-owner"
              | "nearest-inherited-owner"
              | "unique-interface-owner";
            readonly ownerSelectionPath: readonly CallTypeHierarchySegmentEvidence[];
            readonly hierarchyBounds: {
              readonly maximumDepth: number;
              readonly maximumVisitedTypes: number;
            };
            readonly access: CallFieldAccessEvidence;
          }
      ))
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "type-field";
      readonly policy: "java-source-field-binding-v4";
      readonly declaringTypeSymbolId: string;
      readonly declaringTypeKind: "interface";
      readonly isStatic: true;
      readonly isFinal: boolean;
      readonly modifierProof: "declared" | "interface-implicit";
      readonly visibility: "public" | "protected" | "package" | "private";
      readonly selectionReason:
        | "declared-owner"
        | "nearest-inherited-owner"
        | "unique-interface-owner";
      readonly ownerSelectionPath: readonly CallTypeHierarchySegmentEvidence[];
      readonly hierarchyBounds: {
        readonly maximumDepth: number;
        readonly maximumVisitedTypes: number;
      };
      readonly access: CallFieldAccessEvidence;
      readonly qualifiedOwnerType: CallTypeValueEvidence;
    })
  | (CallReceiverBindingEvidenceBase & {
      readonly kind: "type-field";
      readonly policy: "java-source-field-binding-v5";
      readonly declaringTypeSymbolId: string;
      readonly declaringTypeKind: "class" | "interface";
      readonly isStatic: true;
      readonly isFinal: boolean;
      readonly modifierProof: "declared" | "interface-implicit";
      readonly visibility: "public" | "protected" | "package" | "private";
      readonly selectionReason:
        | "declared-owner"
        | "nearest-inherited-owner"
        | "unique-interface-owner";
      readonly ownerSelectionPath: readonly CallTypeHierarchySegmentEvidence[];
      readonly hierarchyBounds: {
        readonly maximumDepth: number;
        readonly maximumVisitedTypes: number;
      };
      readonly access: CallFieldAccessEvidence;
      readonly qualifiedOwnerType: CallTypeValueEvidence;
      readonly qualifiedOwnerTypeKind: "class";
    });

/** Project-proven Java method-set and owner selection for a chained return-type dispatch. */
export interface CallDispatchEvidence {
  readonly selectionPolicy:
    | "java-source-method-set-v2"
    | "java-source-method-set-v3"
    | "java-source-method-set-v4";
  /** Missing before v0.307; distinguishes static, explicit, and lexically bound dispatch. */
  readonly invocationKind?:
    | "expression"
    | "type-name-static"
    | "implicit-static"
    | "implicit-instance"
    | "this"
    | "super"
    | "parameter"
    | "local"
    | "enhanced-for"
    | "catch"
    | "lambda"
    | "instanceof-pattern"
    | "instanceof-and-pattern"
    | "instanceof-and-chain-pattern"
    | "instanceof-grouped-and-pattern"
    | "instanceof-negated-early-exit-pattern"
    | "instanceof-negated-target-exit-pattern"
    | "instanceof-negated-else-pattern"
    | "try-resource"
    | "field"
    | "this-field"
    | "super-field"
    | "type-field";
  /** Direct caller-to-receiver proof for explicit `super` dispatch; missing for older receipts. */
  readonly receiverSelectionPath?: readonly CallTypeHierarchySegmentEvidence[];
  /** Present when a source declaration proves a parameter, local, or field receiver type. */
  readonly receiverBinding?: CallReceiverBindingEvidence;
  readonly selectionReason:
    | "declared-owner"
    | "unique-inherited-owner"
    | "owner-specificity"
    | "class-precedence";
  readonly receiverTypeSymbolId: string;
  readonly selectedOwnerTypeSymbolId: string;
  readonly selectedSignature: CallDispatchSignatureEvidence;
  /** Missing only from generations written before v0.305. */
  readonly access?: CallDispatchAccessEvidence;
  readonly hierarchyBounds: {
    readonly maximumDepth: number;
    readonly maximumVisitedTypes: number;
  };
  readonly candidates: readonly CallDispatchOwnerCandidateEvidence[];
}

/** One ordered argument-to-parameter conversion considered by an overload rule. */
export interface CallTypeConversionEvidence {
  readonly argumentIndex: number;
  readonly parameterIndex: number;
  readonly kind: CallTypeConversionKind;
  readonly sourceType: string | null;
  readonly targetType: string | null;
  /** Zero for identity, positive for a proven widening path, and null otherwise. */
  readonly distance: number | null;
  /** Missing before v0.302; present only for a project-proven reference widening. */
  readonly hierarchyPath?: readonly CallTypeHierarchySegmentEvidence[];
  /** Distinguishes an incomplete bounded traversal from an ordinary unresolved type. */
  readonly reason?: "unresolved-type" | "hierarchy-limit";
}

/** One syntax-proven call or parameter type after project-local resolution. */
export interface CallTypeValueEvidence {
  readonly canonicalType: string;
  readonly proof:
    | "primitive-declaration"
    | "primitive-literal"
    | "primitive-cast"
    | "string-literal"
    | "explicit-import"
    | "qualified-type"
    | "same-package"
    | "java-lang-default";
  readonly range: SourceRange;
  readonly targetSymbolId?: string;
}

/** Type evidence for one overload candidate considered by a call rule. */
export interface CallTypeCandidateEvidence {
  readonly symbolId: string;
  readonly parameterTypes: readonly (CallTypeValueEvidence | null)[];
  readonly compatibility: CallTypeCompatibility;
  /** Missing only from pre-v0.301 persisted evidence. */
  readonly invocationMode?: "fixed" | "varargs";
  /** Missing only from pre-v0.301 persisted evidence. */
  readonly conversions?: readonly CallTypeConversionEvidence[];
}

/** Ordered argument and overload evidence used for exact type disambiguation. */
export interface CallTypeEvidence {
  readonly arguments: readonly (CallTypeValueEvidence | null)[];
  readonly candidates: readonly CallTypeCandidateEvidence[];
  /** Missing only from pre-v0.301 persisted evidence. */
  readonly selectionPolicy?: "java-primitive-widening-v1" | "java-source-widening-v2";
  /** Missing only from pre-v0.301 persisted evidence. */
  readonly selectedSymbolId?: string;
  /** Missing before v0.302; explains the final overload selection phase. */
  readonly selectionReason?:
    | "unique-applicable"
    | "unique-compatible"
    | "conversion-cost"
    | "parameter-specificity";
  /** Missing before v0.302; traversal never reads compiler or dependency classpaths. */
  readonly hierarchyBounds?: {
    readonly maximumDepth: number;
    readonly maximumVisitedTypes: number;
  };
}

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
  /** Extraction extension that emitted the source reference, when applicable. */
  readonly extractionPlugin?: ExtractionPluginProvenance;
  /** Project finalizer that emitted the source reference, when applicable. */
  readonly projectPlugin?: FrameworkPluginProvenance;
  /** Exact host condition of a literal HTTP route registration, when one exists. */
  readonly routeDomain?: string;
  /** Project-relative config files that participated in module resolution. */
  readonly configurationPaths?: readonly string[];
  /** Project-relative file hops used to reach an exact re-export target. */
  readonly resolutionPath?: readonly string[];
  /** Ordered static mount evidence used to project a framework route prefix. */
  readonly routePrefixChain?: readonly RoutePrefixSegment[];
  /** Syntax-proven argument count and every declaration considered by an overload rule. */
  readonly callArity?: CallArityEvidence;
  /** Ordered, project-resolved argument and parameter types considered by an overload rule. */
  readonly callType?: CallTypeEvidence;
  /** Caller-context access proof for a directly selected Java callable. */
  readonly callAccess?: CallDispatchAccessEvidence;
  /** Project-proven declaration owner used for a Java chained return-type dispatch. */
  readonly callDispatch?: CallDispatchEvidence;
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

/** A direct identifier reference retained for strict NestJS module resolution. */
export interface NestSymbolReference {
  readonly name: string;
  readonly range: SourceRange;
  /** Lexical scopes visible at the identifier, nearest first. */
  readonly scopeIds: readonly string[];
}

/** Connects one syntax-proven Nest HTTP route to its decorated controller class. */
export interface NestRouteControllerFact {
  readonly routeId: string;
  readonly controllerId: string;
}

/** A direct `@Module({ controllers: [...] })` controller identifier. */
export interface NestModuleControllerFact {
  readonly moduleId: string;
  readonly controller: NestSymbolReference;
}

/** A direct `RouterModule.register()` module prefix, after static child-path composition. */
export interface NestRouterModulePrefixFact {
  readonly module: NestSymbolReference;
  readonly prefix: string;
}

/**
 * Syntax-only facts used to project a Nest controller-local HTTP route through
 * a statically registered RouterModule prefix in the project resolver.
 */
export interface NestRouteFacts {
  readonly routeControllers: readonly NestRouteControllerFact[];
  readonly moduleControllers: readonly NestModuleControllerFact[];
  readonly routerModulePrefixes: readonly NestRouterModulePrefixFact[];
}

/** A direct `@Resolver(() => Type)` identifier retained for unique schema matching. */
export interface NestGraphqlResolverReferenceFact {
  readonly resolverId: string;
  readonly schemaTypeName: string;
  readonly range: SourceRange;
}

/** Syntax-only facts for bounded NestJS resolver-to-GraphQL-schema projection. */
export interface NestGraphqlFacts {
  readonly resolverReferences: readonly NestGraphqlResolverReferenceFact[];
}

/** A direct identifier reference retained for exact Fastify plugin composition. */
export interface FastifyPluginSymbolReference {
  readonly name: string;
  readonly range: SourceRange;
  /** Lexical scopes visible at the identifier, nearest first. */
  readonly scopeIds: readonly string[];
}

/** A literal Fastify route declared inside one local plugin callback. */
export interface FastifyPluginRouteFact {
  readonly pluginId: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: FastifyPluginSymbolReference;
  readonly range: SourceRange;
}

/** A direct nested `server.register(plugin, { prefix })` callback relationship. */
export interface FastifyPluginChildRegistrationFact {
  readonly parentPluginId: string;
  readonly plugin: FastifyPluginSymbolReference;
  readonly prefix: string;
}

/** A direct Fastify-root registration of an imported or re-exported plugin. */
export interface FastifyPluginRootRegistrationFact {
  readonly plugin: FastifyPluginSymbolReference;
  readonly prefix: string;
}

/**
 * Syntax-only facts used to project routes from imported Fastify plugin modules
 * through direct root and nested static registrations in the project resolver.
 */
export interface FastifyPluginFacts {
  readonly routes: readonly FastifyPluginRouteFact[];
  readonly childRegistrations: readonly FastifyPluginChildRegistrationFact[];
  readonly rootRegistrations: readonly FastifyPluginRootRegistrationFact[];
}

/** A syntax-proven receiver created by one configured framework route plugin. */
export interface FrameworkRoutePluginReceiverFact {
  readonly receiverId: string;
  readonly frameworkId: string;
}

/** A raw plugin route retained so project resolution can replace its mounted path. */
export interface FrameworkRoutePluginRouteFact {
  readonly receiverId: string;
  readonly frameworkId: string;
  readonly routeId: string;
  readonly referenceId: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly range: SourceRange;
  readonly routePrefixChain: readonly RoutePrefixSegment[];
}

/** An imported child receiver passed to a literal mount on a proven local receiver. */
export interface FrameworkRoutePluginImportedMountFact {
  readonly frameworkId: string;
  readonly parentReceiverId: string;
  readonly child: FastifyPluginSymbolReference;
  /** Null records an observed mount whose prefix or arity was not safe to project. */
  readonly segment: RoutePrefixSegment | null;
}

/** File-local extension facts resolved only through exact project module exports. */
export interface FrameworkRoutePluginFacts {
  readonly receivers: readonly FrameworkRoutePluginReceiverFact[];
  readonly routes: readonly FrameworkRoutePluginRouteFact[];
  readonly importedMounts: readonly FrameworkRoutePluginImportedMountFact[];
}

/** A direct, top-level FastAPI `APIRouter` binding with a literal prefix. */
export interface FastApiRouterDeclarationFact {
  readonly name: string;
  readonly prefix: string;
  readonly range: SourceRange;
}

/** A literal route decorated directly on a syntax-proven FastAPI router. */
export interface FastApiRouterRouteFact {
  readonly routerName: string;
  readonly method: RouteMethod;
  readonly path: string;
  /** Stable symbol identity of the directly decorated local handler. */
  readonly handlerId: string;
  readonly range: SourceRange;
}

/** A final, single-name relative or project-root absolute APIRouter export from a package initializer. */
export interface FastApiRouterReExportFact {
  readonly exportedName: string;
  readonly importedRouterName: string;
  readonly moduleSpecifier: string;
  /** Omitted only by artifact facts persisted before v0.233; absence means relative. */
  readonly moduleSpecifierKind?: "relative" | "absolute";
  readonly range: SourceRange;
}

/**
 * A direct, single-name, package-relative or project-root absolute import
 * mounted through a direct FastAPI application's literal `include_router` call.
 */
export interface FastApiImportedRouterInclusionFact {
  readonly applicationName: string;
  readonly routerName: string;
  readonly importedRouterName: string;
  readonly moduleSpecifier: string;
  /** Omitted only by artifact facts persisted before v0.232; absence means relative. */
  readonly moduleSpecifierKind?: "relative" | "absolute";
  readonly prefix: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only facts used to project literal routes through a directly imported
 * FastAPI `APIRouter` in another module of the same proven Python package.
 */
export interface FastApiRouterFacts {
  readonly routers: readonly FastApiRouterDeclarationFact[];
  readonly routes: readonly FastApiRouterRouteFact[];
  /** Omitted only by artifact facts persisted before v0.158. */
  readonly reExports?: readonly FastApiRouterReExportFact[];
  readonly importedRouterInclusions: readonly FastApiImportedRouterInclusionFact[];
}

/** A direct, top-level Django Ninja `Router` binding. */
export interface DjangoNinjaRouterDeclarationFact {
  readonly name: string;
  readonly range: SourceRange;
}

/** The syntax surface that declared a route on a Django Ninja Router. */
export type DjangoNinjaRouterRouteSource = "decorator" | "api-operation";

/** A literal route declared directly on a syntax-proven Django Ninja Router. */
export interface DjangoNinjaRouterRouteFact {
  readonly routerName: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly source: DjangoNinjaRouterRouteSource;
  /** Stable symbol identity of the directly decorated local handler. */
  readonly handlerId: string;
  readonly range: SourceRange;
}

/** A final, single-name Django Ninja Router export from a package initializer. */
export interface DjangoNinjaRouterReExportFact {
  readonly exportedName: string;
  readonly importedRouterName: string;
  readonly moduleSpecifier: string;
  /** Omitted only by artifact facts persisted before v0.231; absence means package-relative. */
  readonly moduleSpecifierKind?: "relative" | "absolute";
  readonly range: SourceRange;
}

/**
 * A direct, single-name Router import mounted through a direct Django Ninja
 * application's literal `add_router` call.
 */
export interface DjangoNinjaImportedRouterInclusionFact {
  readonly applicationName: string;
  readonly routerName: string;
  readonly importedRouterName: string;
  readonly moduleSpecifier: string;
  /** Omitted only by artifact facts persisted before v0.230; absence means package-relative. */
  readonly moduleSpecifierKind?: "relative" | "absolute";
  readonly prefix: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only facts used to project literal routes through a directly imported
 * Django Ninja `Router` in another module of the same proven Python package.
 */
export interface DjangoNinjaRouterFacts {
  readonly routers: readonly DjangoNinjaRouterDeclarationFact[];
  readonly routes: readonly DjangoNinjaRouterRouteFact[];
  /** Omitted only by artifact facts persisted before v0.229. */
  readonly reExports?: readonly DjangoNinjaRouterReExportFact[];
  readonly importedRouterInclusions: readonly DjangoNinjaImportedRouterInclusionFact[];
}

/** A direct, top-level Flask `Blueprint` binding with a literal URL prefix. */
export interface FlaskBlueprintDeclarationFact {
  readonly name: string;
  readonly prefix: string;
  readonly range: SourceRange;
}

/** A literal route decorated directly on a syntax-proven Flask Blueprint. */
export interface FlaskBlueprintRouteFact {
  readonly blueprintName: string;
  readonly method: RouteMethod;
  readonly path: string;
  /** Stable symbol identity of the directly decorated local handler. */
  readonly handlerId: string;
  readonly range: SourceRange;
}

/** A final, single-name relative or project-root absolute Blueprint export from a package initializer. */
export interface FlaskBlueprintReExportFact {
  readonly exportedName: string;
  readonly importedBlueprintName: string;
  readonly moduleSpecifier: string;
  /** Omitted only by artifact facts persisted before v0.235; absence means relative. */
  readonly moduleSpecifierKind?: "relative" | "absolute";
  readonly range: SourceRange;
}

/**
 * A direct, single-name relative or project-root absolute Blueprint import
 * mounted through a direct Flask application's literal `register_blueprint` call.
 */
export interface FlaskImportedBlueprintRegistrationFact {
  readonly applicationName: string;
  readonly blueprintName: string;
  readonly importedBlueprintName: string;
  readonly moduleSpecifier: string;
  /** Omitted only by artifact facts persisted before v0.234; absence means package-relative. */
  readonly moduleSpecifierKind?: "relative" | "absolute";
  readonly prefix: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only facts used to project literal routes through a directly imported
 * Flask Blueprint in another module of the same proven Python package.
 */
export interface FlaskBlueprintFacts {
  readonly blueprints: readonly FlaskBlueprintDeclarationFact[];
  readonly routes: readonly FlaskBlueprintRouteFact[];
  /** Omitted only by artifact facts persisted before v0.159. */
  readonly reExports?: readonly FlaskBlueprintReExportFact[];
  readonly importedBlueprintRegistrations: readonly FlaskImportedBlueprintRegistrationFact[];
}

/** A direct, top-level Sanic `Blueprint` binding with a literal URL prefix. */
export interface SanicBlueprintDeclarationFact {
  readonly name: string;
  readonly prefix: string;
  readonly range: SourceRange;
}

/** A literal route decorated directly on a syntax-proven Sanic Blueprint. */
export interface SanicBlueprintRouteFact {
  readonly blueprintName: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerId: string;
  readonly range: SourceRange;
}

/**
 * A direct `app.blueprint(imported_target)` registration from one
 * package-relative Python module into another. The imported target may prove
 * to be either a Blueprint or a Blueprint group during project resolution.
 */
export interface SanicImportedBlueprintRegistrationFact {
  readonly applicationName: string;
  readonly blueprintName: string;
  readonly importedBlueprintName: string;
  readonly moduleSpecifier: string;
  readonly prefix: string;
  readonly range: SourceRange;
}

/** One statically proven member of a top-level Sanic Blueprint group. */
export type SanicBlueprintGroupMemberFact =
  | {
      readonly kind: "blueprint";
      readonly name: string;
    }
  | {
      readonly kind: "group";
      readonly name: string;
    }
  | {
      readonly kind: "imported";
      readonly importedName: string;
      readonly moduleSpecifier: string;
    };

/** A final, top-level Sanic `Blueprint.group` declaration with literal configuration. */
export interface SanicBlueprintGroupDeclarationFact {
  readonly name: string;
  readonly prefix: string;
  readonly namePrefix: string | null;
  readonly members: readonly SanicBlueprintGroupMemberFact[];
  readonly range: SourceRange;
}

/**
 * A final, single-name relative import exposed by a package `__init__.py`.
 * The target remains unclassified until project resolution proves a Blueprint
 * or Blueprint group in the source module.
 */
export interface SanicBlueprintReExportFact {
  readonly exportedName: string;
  readonly importedName: string;
  readonly moduleSpecifier: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only facts used to project literal routes through directly imported
 * Sanic Blueprints and Blueprint groups in one proven Python package.
 */
export interface SanicBlueprintFacts {
  readonly blueprints: readonly SanicBlueprintDeclarationFact[];
  readonly groups: readonly SanicBlueprintGroupDeclarationFact[];
  readonly reExports: readonly SanicBlueprintReExportFact[];
  readonly routes: readonly SanicBlueprintRouteFact[];
  readonly importedBlueprintRegistrations: readonly SanicImportedBlueprintRegistrationFact[];
}

/** The local handler shape retained for a final Django URL pattern. */
export type DjangoUrlPatternHandlerKind = "function" | "class-as-view";

/** A literal route in a final Django `urlpatterns` list with a local handler. */
export interface DjangoUrlPatternRouteFact {
  readonly path: string;
  /** Stable symbol identity of the directly referenced local handler. */
  readonly handlerId: string;
  /** Omitted only by facts persisted before v0.165; defaults to `function`. */
  readonly handlerKind?: DjangoUrlPatternHandlerKind;
  readonly range: SourceRange;
}

/** The Django URL-pattern factory used for one statically proven URLConf mount. */
export type DjangoUrlconfInclusionFactory = "path" | "re_path" | "url";

/**
 * A direct Django `path`, bounded static `re_path`, or legacy `url` composition
 * where the included URLConf arrived through a single-name package-relative import.
 */
export interface DjangoImportedUrlconfInclusionFact {
  /** Omitted only by artifact facts persisted before v0.163; defaults to `path`. */
  readonly factory?: DjangoUrlconfInclusionFactory;
  readonly urlconfName: string;
  /** Direct `urls`/`urlpatterns` bindings or a final initializer re-export name. */
  readonly importedUrlconfName: string;
  readonly moduleSpecifier: string;
  readonly prefix: string;
  readonly range: SourceRange;
}

/**
 * A direct Django `path`, bounded static `re_path`, or legacy `url` composition
 * with one plain, dotted Python module name. Project resolution later proves the
 * target is unique and lies behind regular-package boundaries.
 */
export interface DjangoLiteralUrlconfInclusionFact {
  /** Omitted only by artifact facts persisted before v0.163; defaults to `path`. */
  readonly factory?: DjangoUrlconfInclusionFactory;
  readonly moduleSpecifier: string;
  readonly prefix: string;
  readonly range: SourceRange;
}

/** A final, single-name relative Django URLConf export from a package initializer. */
export interface DjangoUrlconfReExportFact {
  readonly exportedName: string;
  readonly importedUrlconfName: string;
  readonly moduleSpecifier: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only facts used to project literal child URL patterns through a
 * directly included URLConf in the same proven Python package.
 */
export interface DjangoUrlFacts {
  readonly routes: readonly DjangoUrlPatternRouteFact[];
  /** Present only when the file has a final, syntax-proven `urlpatterns` list. */
  readonly hasUrlpatterns?: true;
  /** Omitted only by artifact facts persisted before v0.160. */
  readonly reExports?: readonly DjangoUrlconfReExportFact[];
  readonly importedUrlconfInclusions: readonly DjangoImportedUrlconfInclusionFact[];
  /** Omitted only by artifact facts persisted before v0.161. */
  readonly literalUrlconfInclusions?: readonly DjangoLiteralUrlconfInclusionFact[];
}

/** One literal `g.Meta` request declaration retained for GoFrame standard routing. */
export interface GoFrameStandardRouterRequestFact {
  readonly name: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly range: SourceRange;
}

/** One exact controller method shape eligible for GoFrame standard routing. */
export interface GoFrameStandardRouterControllerMethodFact {
  readonly controllerName: string;
  readonly methodName: string;
  readonly requestType: string;
  /** Go package qualifier used for a cross-package request type, when present. */
  readonly requestPackageAlias?: string;
  /** Stable identity of the syntax-proven controller method symbol. */
  readonly handlerId: string;
}

/** One exact `Server` or `RouterGroup` controller `Bind` registration. */
export interface GoFrameStandardRouterBindingFact {
  readonly controllerName: string;
  /** Go package qualifier used for a cross-package controller type, when present. */
  readonly controllerPackageAlias?: string;
  /** The fully composed literal Server/Group prefix at the registration point. */
  readonly prefix: string;
  /** Literal `Server.Domain` host conditions inherited by this binding, if any. */
  readonly domains: readonly string[];
  readonly range: SourceRange;
}

/** One statically proven no-argument Go controller factory with a direct pointer return. */
export interface GoFrameStandardRouterControllerFactoryFact {
  readonly factoryName: string;
  readonly controllerName: string;
  readonly range: SourceRange;
}

/** One literal `Server` or `RouterGroup` `Bind(Factory())` call retained for later exact proof. */
export interface GoFrameStandardRouterFactoryBindingFact {
  readonly factoryName: string;
  /** Go package qualifier used for a cross-package factory call, when present. */
  readonly factoryPackageAlias?: string;
  /** The fully composed literal Server/Group prefix at the registration point. */
  readonly prefix: string;
  /** Literal `Server.Domain` host conditions inherited by this binding, if any. */
  readonly domains: readonly string[];
  readonly range: SourceRange;
}

/**
 * One literal Go import that can prove a local module-package hop. `localName`
 * is present for an explicit alias; when absent, the target package clause must
 * prove the qualifier used in source.
 */
export interface GoFrameStandardRouterImportFact {
  readonly moduleSpecifier: string;
  readonly localName?: string;
}

/** @deprecated Use `GoFrameStandardRouterImportFact`; retained for v0.130 raw facts. */
export type GoFrameStandardRouterExplicitImportFact = GoFrameStandardRouterImportFact & {
  readonly localName: string;
};

/**
 * Syntax-only GoFrame facts used to project standard-router `g.Meta` routes
 * across one indexed Go package directory, or through an exact local Go module
 * import with either an explicit alias or target-package-proven default name,
 * in the project resolver.
 */
export interface GoFrameStandardRouterFacts {
  readonly packageName: string;
  readonly requests: readonly GoFrameStandardRouterRequestFact[];
  readonly controllerMethods: readonly GoFrameStandardRouterControllerMethodFact[];
  readonly controllerBindings: readonly GoFrameStandardRouterBindingFact[];
  /** Omitted only by artifact facts persisted before v0.134. */
  readonly controllerFactories?: readonly GoFrameStandardRouterControllerFactoryFact[];
  /** Omitted only by artifact facts persisted before v0.134. */
  readonly controllerFactoryBindings?: readonly GoFrameStandardRouterFactoryBindingFact[];
  /** Omitted only by artifact facts persisted before v0.132. */
  readonly imports?: readonly GoFrameStandardRouterImportFact[];
  /** @deprecated Legacy v0.130 explicit-alias facts remain readable during upgrade. */
  readonly explicitImports?: readonly GoFrameStandardRouterExplicitImportFact[];
}

/** One syntax-proven top-level Go package function retained for package resolution. */
export interface GoProjectFunctionFact {
  readonly name: string;
  readonly symbolId: string;
  readonly filePath: string;
  readonly unconditionallyAvailable: boolean;
}

/** One syntax-proven Go method retained for concrete receiver resolution. */
export interface GoProjectMethodFact {
  readonly receiverTypeName: string;
  readonly name: string;
  readonly symbolId: string;
  readonly filePath: string;
  readonly unconditionallyAvailable: boolean;
}

/** One syntax-proven Go struct type retained for local instantiation resolution. */
export interface GoProjectStructFact {
  readonly name: string;
  readonly symbolId: string;
  readonly filePath: string;
  readonly unconditionallyAvailable: boolean;
}

/** One eligible literal Go import; `localName` is present only for an explicit alias. */
export interface GoProjectImportFact {
  readonly moduleSpecifier: string;
  readonly range: SourceRange;
  readonly localName?: string;
}

/** One direct bare Go call whose caller declaration and header are syntax-proven. */
export interface GoProjectBareCallFact {
  readonly callerId: string;
  readonly targetName: string;
  readonly range: SourceRange;
}

/** One source-proven Go method call through a named typed receiver. */
export interface GoProjectMethodCallFact {
  readonly callerId: string;
  readonly receiverName: string;
  readonly receiverTypeName: string;
  readonly methodName: string;
  readonly range: SourceRange;
}

/** One source-proven Go `new(T)` or `T{}` construction through a named struct. */
export interface GoProjectInstantiationFact {
  readonly callerId: string;
  readonly typeName: string;
  readonly range: SourceRange;
}

/** Syntax-only Go package facts retained for a later bounded project resolver. */
export interface GoProjectFacts {
  readonly packageName: string;
  readonly functions: readonly GoProjectFunctionFact[];
  readonly imports: readonly GoProjectImportFact[];
  readonly bareCalls: readonly GoProjectBareCallFact[];
  /** Omitted only by artifact facts persisted before concrete method-call extraction. */
  readonly methods?: readonly GoProjectMethodFact[];
  /** Omitted only by artifact facts persisted before concrete method-call extraction. */
  readonly methodCalls?: readonly GoProjectMethodCallFact[];
  /** Omitted only by artifact facts persisted before struct instantiation extraction. */
  readonly structs?: readonly GoProjectStructFact[];
  /** Omitted only by artifact facts persisted before struct instantiation extraction. */
  readonly instantiations?: readonly GoProjectInstantiationFact[];
}

/** One complete direct root Ada package specification or body retained for project pairing. */
export interface AdaProjectPackageUnitFact {
  readonly role: "spec" | "body";
  readonly normalizedFullName: string;
  readonly symbolId: string;
  readonly filePath: string;
  readonly unitRange: SourceRange;
  readonly headerRange: SourceRange;
  readonly nameRange: SourceRange;
  readonly endRange: SourceRange;
}

/** Syntax-only Ada package-unit facts retained for a later bounded project resolver. */
export interface AdaProjectFacts {
  readonly packageUnits: readonly AdaProjectPackageUnitFact[];
}

/** A direct external `mod name;` declaration retained for Rust module proof. */
export interface RustActixExternalModuleFact {
  readonly name: string;
  readonly range: SourceRange;
}

/** A literal route declared in one syntax-proven Actix Web `ServiceConfig` callback. */
export interface RustActixServiceConfigRouteFact {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handlerName: string;
  readonly range: SourceRange;
}

/** One unique, direct `&mut ServiceConfig` callback declaration in a Rust file. */
export interface RustActixServiceConfigDeclarationFact {
  readonly name: string;
  readonly range: SourceRange;
  readonly routes: readonly RustActixServiceConfigRouteFact[];
  /** Attribute handlers that are proven to be mounted by this callback. */
  readonly mountedAttributeHandlers: readonly string[];
}

/** The direct Actix builder surface that mounted one imported configuration callback. */
export type RustActixImportedServiceConfigMountKind = "app" | "scope";

/** The Rust import root whose target must be independently proven by the resolver. */
export type RustActixImportedServiceConfigImportRoot = "crate" | "self" | "workspace";

/**
 * A direct `crate::module::config` import mounted through App or Scope
 * configure. `moduleName` is the root direct module for v0.118 compatibility;
 * `modulePath` retains one or two direct module segments when available. A
 * workspace root is projected only after the Cargo resolver proves the crate.
 */
export interface RustActixImportedServiceConfigMountFact {
  readonly configurationName: string;
  readonly moduleName: string;
  /** Omitted only by facts persisted before v0.119. */
  readonly modulePath?: readonly string[];
  /** Omitted by persisted pre-v0.120 local-module facts. */
  readonly importRoot?: RustActixImportedServiceConfigImportRoot;
  /** Present only when `importRoot` is `workspace`. */
  readonly workspaceCrateName?: string;
  readonly prefix: string;
  readonly kind: RustActixImportedServiceConfigMountKind;
  readonly range: SourceRange;
}

/**
 * Syntax-only facts used to project literal Actix Web ServiceConfig routes
 * through one or two directly declared Rust modules in the project resolver.
 */
export interface RustActixServiceConfigFacts {
  readonly externalModules: readonly RustActixExternalModuleFact[];
  readonly configurations: readonly RustActixServiceConfigDeclarationFact[];
  readonly importedMounts: readonly RustActixImportedServiceConfigMountFact[];
}

/** A direct unconditional `mod name;` declaration from a Rust crate root. */
export interface RustProjectModuleFact {
  readonly name: string;
  readonly filePath: string;
  readonly range: SourceRange;
  readonly unconditionallyAvailable: boolean;
}

/** A direct unconditional `use crate::module::Name;` declaration from one Rust module. */
export interface RustProjectImportFact {
  readonly modulePath: readonly string[];
  readonly importedName: string;
  readonly range: SourceRange;
  readonly unconditionallyAvailable: boolean;
}

/** One public, top-level Rust declaration retained for a later exact crate resolver. */
export interface RustProjectDeclarationFact {
  readonly name: string;
  readonly symbolId: string;
  readonly filePath: string;
  readonly kind: "function" | "type";
  /** Present for type declarations so struct/enum/trait namespace proof is explicit. */
  readonly typeKind?: "struct" | "enum" | "trait";
  readonly range: SourceRange;
  readonly unconditionallyAvailable: boolean;
}

/** A syntax-clean local Rust struct, enum, or trait identity. */
export interface RustProjectTypeFact {
  readonly name: string;
  readonly symbolId: string;
  readonly filePath: string;
  readonly typeKind: "struct" | "enum" | "trait";
  readonly variantNames?: readonly string[];
  readonly range: SourceRange;
  readonly unconditionallyAvailable: boolean;
}

/** One inherent or trait implementation block with its direct method names. */
export interface RustProjectImplFact {
  readonly selfTypeName: string;
  readonly traitName?: string;
  readonly methodNames: readonly string[];
  readonly filePath: string;
  readonly range: SourceRange;
  readonly unconditionallyAvailable: boolean;
}

/** One method or associated function declared in an implementation block. */
export interface RustProjectMethodFact {
  readonly receiverTypeName: string;
  readonly traitName?: string;
  readonly name: string;
  readonly symbolId: string;
  readonly filePath: string;
  readonly range: SourceRange;
  readonly callKind: "method" | "associated-function";
  readonly unconditionallyAvailable: boolean;
}

/** One source-proven call through a concrete local receiver or type path. */
export interface RustProjectMethodCallFact {
  readonly callerId: string;
  readonly receiverTypeName: string;
  readonly receiverName?: string;
  readonly methodName: string;
  readonly range: SourceRange;
  readonly callKind: "method" | "associated-function";
}

/** One source-proven struct expression or enum variant construction. */
export interface RustProjectInstantiationFact {
  readonly callerId: string;
  readonly typeName: string;
  readonly variantName?: string;
  readonly range: SourceRange;
  readonly instantiationKind: "struct" | "enum";
}

/**
 * Syntax-only Rust facts. They prove physical root modules, direct crate
 * imports, and public declaration targets without resolving a cross-file edge.
 */
export interface RustProjectFacts {
  readonly modules: readonly RustProjectModuleFact[];
  readonly imports: readonly RustProjectImportFact[];
  readonly declarations: readonly RustProjectDeclarationFact[];
  /** Omitted only by facts persisted before the v0.458 relation slice. */
  readonly types?: readonly RustProjectTypeFact[];
  /** Omitted only by facts persisted before the v0.458 relation slice. */
  readonly impls?: readonly RustProjectImplFact[];
  /** Omitted only by facts persisted before the v0.458 relation slice. */
  readonly methods?: readonly RustProjectMethodFact[];
  /** Omitted only by facts persisted before the v0.458 relation slice. */
  readonly methodCalls?: readonly RustProjectMethodCallFact[];
  /** Omitted only by facts persisted before the v0.458 relation slice. */
  readonly instantiations?: readonly RustProjectInstantiationFact[];
}

/** A Scala class or object declaration with its direct package-clause proof. */
export interface ScalaClassFact {
  readonly symbolId: string;
  readonly packageName: string;
}

/** A Java class declaration with its direct package-declaration proof. */
export interface JavaClassFact {
  readonly symbolId: string;
  readonly packageName: string;
}

/** A literal Play `->` router mount retained from a `conf/routes` table. */
export interface PlayRouterMountFact {
  readonly symbolId: string;
  readonly prefix: string;
  readonly routerName: string;
  readonly range: SourceRange;
}

/** Syntax-only facts retained for exact Play controller-action and router-mount resolution. */
export interface ScalaFacts {
  readonly classes: readonly ScalaClassFact[];
  readonly routerMounts: readonly PlayRouterMountFact[];
}

/** Scala declarations retained for bounded project-local relation resolution. */
export type ScalaRelationDeclarationKind = "object" | "class" | "caseclass" | "trait" | "enum" | "typealias";

export interface ScalaRelationTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly packageName: string;
  readonly qualifiedTypePath: string;
  readonly declarationKind: ScalaRelationDeclarationKind;
  readonly isExported: boolean;
  readonly constructorParameterCount?: number;
  readonly constructorRequiredParameterCount?: number;
  readonly range: SourceRange;
}

export type ScalaRelationCallableKind = "function" | "method" | "constructor";

export interface ScalaRelationCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly packageName: string;
  readonly callableKind: ScalaRelationCallableKind;
  readonly ownerTypeName?: string;
  readonly ownerTypeId?: string;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly isOverride?: boolean;
  readonly range: SourceRange;
}

export interface ScalaRelationImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedPath: string;
  readonly importedName: string;
  readonly localName: string;
  readonly isWildcard: boolean;
  readonly isAliased: boolean;
  readonly range: SourceRange;
}

export interface ScalaRelationCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "module" | "member";
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly receiverObjectName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface ScalaRelationInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface ScalaRelationHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly relationKind: "extends" | "implements";
  readonly range: SourceRange;
}

export interface ScalaRelationOverrideFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly methodName: string;
  readonly ownerTypeName: string;
  readonly range: SourceRange;
}

/** Syntax-only Scala relation facts. Compiler inference and runtime semantics remain nonclaims. */
export interface ScalaRelationFacts {
  readonly packageName: string;
  readonly parserRejected?: boolean;
  readonly types: readonly ScalaRelationTypeFact[];
  readonly callables: readonly ScalaRelationCallableFact[];
  readonly imports: readonly ScalaRelationImportFact[];
  readonly calls: readonly ScalaRelationCallFact[];
  readonly instantiations: readonly ScalaRelationInstantiationFact[];
  readonly heritage?: readonly ScalaRelationHeritageFact[];
  readonly overrides?: readonly ScalaRelationOverrideFact[];
}

/** Elixir declarations retained for bounded project-local relation resolution. */
export type ElixirTypeDeclarationKind = "module" | "protocol" | "struct" | "exception" | "type" | "behaviour";

export interface ElixirTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly qualifiedTypePath: string;
  readonly declarationKind: ElixirTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export type ElixirCallableKind = "function" | "callback";

export interface ElixirCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly callableKind: ElixirCallableKind;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly isPrivate?: boolean;
  readonly range: SourceRange;
}

export interface ElixirAliasFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedModule: string;
  readonly localName: string;
  readonly range: SourceRange;
}

export interface ElixirImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedModule: string;
  readonly importedNames?: readonly string[];
  readonly range: SourceRange;
}

export interface ElixirCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "module";
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface ElixirInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface ElixirHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly sourceTypeName: string;
  readonly relationKind: "implements";
  readonly range: SourceRange;
}

/** Syntax-only Elixir relation facts. Macro, BEAM and runtime semantics remain nonclaims. */
export interface ElixirFacts {
  readonly moduleName: string;
  readonly parserRejected?: boolean;
  readonly types: readonly ElixirTypeFact[];
  readonly callables: readonly ElixirCallableFact[];
  readonly aliases: readonly ElixirAliasFact[];
  readonly imports: readonly ElixirImportFact[];
  readonly calls: readonly ElixirCallFact[];
  readonly instantiations: readonly ElixirInstantiationFact[];
  readonly heritage?: readonly ElixirHeritageFact[];
}

/** Erlang declarations retained for bounded project-local relation resolution. */
export type ErlangTypeDeclarationKind = "module" | "record" | "type" | "opaque" | "behaviour";

export interface ErlangTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly qualifiedTypePath: string;
  readonly declarationKind: ErlangTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export type ErlangCallableKind = "function" | "callback";

export interface ErlangCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly arity: number;
  readonly callableKind: ErlangCallableKind;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface ErlangImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importKind: "module" | "include";
  readonly importedModule: string;
  readonly importedNames?: readonly string[];
  readonly includePath?: string;
  readonly range: SourceRange;
}

export interface ErlangCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "module";
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface ErlangInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface ErlangHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly sourceTypeName: string;
  readonly relationKind: "implements";
  readonly range: SourceRange;
}

/** Syntax-only Erlang relation facts. BEAM and OTP runtime semantics remain nonclaims. */
export interface ErlangFacts {
  readonly moduleName: string;
  readonly parserRejected?: boolean;
  readonly types: readonly ErlangTypeFact[];
  readonly callables: readonly ErlangCallableFact[];
  readonly imports: readonly ErlangImportFact[];
  readonly calls: readonly ErlangCallFact[];
  readonly instantiations: readonly ErlangInstantiationFact[];
  readonly heritage?: readonly ErlangHeritageFact[];
}

/** Clojure declarations retained for bounded, syntax-only project relations. */
export type ClojureTypeDeclarationKind = "namespace" | "record" | "protocol";

export interface ClojureTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly namespaceName: string;
  readonly declarationKind: ClojureTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface ClojureCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly namespaceName: string;
  readonly parameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface ClojureImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedNamespace: string;
  readonly alias?: string;
  readonly referredNames?: readonly string[];
  readonly range: SourceRange;
}

export interface ClojureCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "namespace";
  readonly receiverNamespaceName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface ClojureInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly constructorKind: "arrow" | "map-arrow";
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface ClojureHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly sourceTypeName: string;
  readonly referenceName: string;
  readonly relationKind: "implements";
  readonly range: SourceRange;
}

/** Syntax-only Clojure relation facts. Macro expansion, vars and runtime dispatch remain nonclaims. */
export interface ClojureFacts {
  readonly namespaceName: string;
  readonly parserRejected?: boolean;
  readonly types: readonly ClojureTypeFact[];
  readonly callables: readonly ClojureCallableFact[];
  readonly imports: readonly ClojureImportFact[];
  readonly calls: readonly ClojureCallFact[];
  readonly instantiations: readonly ClojureInstantiationFact[];
  readonly heritage?: readonly ClojureHeritageFact[];
}

/** Nix attribute declarations retained for bounded project-local relation resolution. */
export interface NixAttributeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly scopeId: string;
  readonly kind: "function" | "variable";
  readonly parameterCount?: number;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface NixImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly bindingSymbolId?: string;
  readonly bindingName?: string;
  readonly importedPath: string;
  readonly range: SourceRange;
}

export interface NixCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "attribute";
  readonly receiverName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

/** Syntax-only Nix relation facts. Evaluation, derivations, flakes, and runtime semantics remain nonclaims. */
export interface NixFacts {
  readonly parserRejected?: boolean;
  readonly attributes: readonly NixAttributeFact[];
  readonly imports: readonly NixImportFact[];
  readonly calls: readonly NixCallFact[];
}

/** Nim declarations retained for bounded, syntax-only project relations. */
export type NimTypeDeclarationKind = "object" | "enum" | "distinct" | "alias";

export interface NimTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly declarationKind: NimTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface NimCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly parameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface NimImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedModule: string;
  readonly localName?: string;
  readonly range: SourceRange;
}

export interface NimCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "module";
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface NimInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface NimHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly sourceTypeName: string;
  readonly referenceName: string;
  readonly relationKind: "extends";
  readonly range: SourceRange;
}

/** Syntax-only Nim relation facts. Compiler, macro, UFCS, and runtime semantics remain nonclaims. */
export interface NimFacts {
  readonly moduleName: string;
  readonly parserRejected?: boolean;
  readonly types: readonly NimTypeFact[];
  readonly callables: readonly NimCallableFact[];
  readonly imports: readonly NimImportFact[];
  readonly calls: readonly NimCallFact[];
  readonly instantiations: readonly NimInstantiationFact[];
  readonly heritage?: readonly NimHeritageFact[];
}

/** Zig declarations retained for bounded, syntax-only project relations. */
export type ZigTypeDeclarationKind = "struct" | "enum" | "union" | "opaque";

export interface ZigTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly declarationKind: ZigTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface ZigCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly parameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface ZigImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly localName: string;
  readonly importedPath: string;
  readonly range: SourceRange;
}

export interface ZigCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "module";
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface ZigInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

/** Syntax-only Zig relation facts. Compiler, comptime, and runtime semantics remain nonclaims. */
export interface ZigFacts {
  readonly moduleName: string;
  readonly parserRejected?: boolean;
  readonly types: readonly ZigTypeFact[];
  readonly callables: readonly ZigCallableFact[];
  readonly imports: readonly ZigImportFact[];
  readonly calls: readonly ZigCallFact[];
  readonly instantiations: readonly ZigInstantiationFact[];
}

/** C++ declarations retained for bounded, syntax-only project relations. */
export type CppTypeDeclarationKind = "class" | "struct" | "enum";

export interface CppTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly declarationKind: CppTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface CppCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly ownerTypeName?: string;
  readonly parameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface CppImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedPath: string;
  readonly range: SourceRange;
}

export interface CppCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "member";
  readonly receiverTypeName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface CppInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

/** Syntax-only C++ relation facts. Templates, ABI, and runtime dispatch remain nonclaims. */
export interface CppFacts {
  readonly parserRejected?: boolean;
  readonly types: readonly CppTypeFact[];
  readonly callables: readonly CppCallableFact[];
  readonly imports: readonly CppImportFact[];
  readonly calls: readonly CppCallFact[];
  readonly instantiations: readonly CppInstantiationFact[];
}

/** C declarations retained for bounded, syntax-only project relations. */
export type CTypeDeclarationKind = "struct" | "union" | "enum" | "typedef";

export interface CTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly declarationKind: CTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface CCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly parameterCount: number;
  readonly variadic?: boolean;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface CPrototypeFact {
  readonly name: string;
  readonly parameterCount: number;
  readonly variadic?: boolean;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly range: SourceRange;
}

export interface CImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedPath: string;
  readonly range: SourceRange;
}

export interface CCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

/** Syntax-only C relation facts. Preprocessor and indirect dispatch remain nonclaims. */
export interface CFacts {
  readonly parserRejected?: boolean;
  readonly unsafePreprocessor?: boolean;
  readonly types: readonly CTypeFact[];
  readonly callables: readonly CCallableFact[];
  readonly prototypes: readonly CPrototypeFact[];
  readonly imports: readonly CImportFact[];
  readonly calls: readonly CCallFact[];
}

/** PHP declarations retained for bounded, syntax-only project relations. */
export type PhpTypeDeclarationKind = "class" | "interface" | "trait" | "enum";

export interface PhpTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly namespaceName: string;
  readonly declarationKind: PhpTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface PhpCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly namespaceName: string;
  readonly ownerTypeName?: string;
  readonly parameterCount: number;
  readonly variadic?: boolean;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isStatic?: boolean;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface PhpImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedName: string;
  readonly localName: string;
  readonly importKind: "class" | "function" | "const";
  readonly range: SourceRange;
}

export interface PhpCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "static";
  readonly receiverTypeName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface PhpInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface PhpHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly sourceTypeName: string;
  readonly targetTypeName: string;
  readonly range: SourceRange;
}

/** Syntax-only PHP relation facts. Autoloading, traits, magic methods, and dynamic dispatch remain nonclaims. */
export interface PhpFacts {
  readonly parserRejected?: boolean;
  readonly namespaceName?: string;
  readonly types: readonly PhpTypeFact[];
  readonly callables: readonly PhpCallableFact[];
  readonly imports: readonly PhpImportFact[];
  readonly calls: readonly PhpCallFact[];
  readonly instantiations: readonly PhpInstantiationFact[];
  readonly heritage: readonly PhpHeritageFact[];
}

/** Objective-C declarations retained for bounded, syntax-only project relations. */
export type ObjcTypeDeclarationKind = "class" | "protocol";

export interface ObjcTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly declarationKind: ObjcTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface ObjcCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly ownerTypeName: string;
  readonly polarity?: "+" | "-";
  readonly parameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface ObjcImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedPath: string;
  readonly range: SourceRange;
}

export interface ObjcHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly sourceTypeName: string;
  readonly targetTypeName: string;
  readonly relationKind: "extends" | "implements";
  readonly range: SourceRange;
}

export interface ObjcCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly receiverTypeName: string;
  readonly referenceName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface ObjcInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

/** Syntax-only Objective-C relation facts. Dynamic dispatch, categories, macros, and runtime swizzling remain nonclaims. */
export interface ObjcFacts {
  readonly parserRejected?: boolean;
  readonly types: readonly ObjcTypeFact[];
  readonly callables: readonly ObjcCallableFact[];
  readonly imports: readonly ObjcImportFact[];
  readonly heritage: readonly ObjcHeritageFact[];
  readonly calls: readonly ObjcCallFact[];
  readonly instantiations: readonly ObjcInstantiationFact[];
}

/** Ruby declarations retained for conservative, syntax-only project relations. */
export type RubyTypeDeclarationKind = "class" | "module";

export interface RubyTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly constantPath: string;
  readonly declarationKind: RubyTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface RubyCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly ownerTypePath?: string;
  readonly isSingleton: boolean;
  readonly parameterCount: number;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface RubyImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedPath: string;
  readonly range: SourceRange;
}

export interface RubyHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly sourceTypePath: string;
  readonly targetTypePath: string;
  readonly range: SourceRange;
}

export interface RubyCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly receiverTypePath: string;
  readonly referenceName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

/** Syntax-only Ruby relation facts. Reopen, alias, mixin, reflection, and dynamic dispatch remain nonclaims. */
export interface RubyFacts {
  readonly parserRejected?: boolean;
  readonly unsafeDynamicFeatures?: true;
  readonly types: readonly RubyTypeFact[];
  readonly callables: readonly RubyCallableFact[];
  readonly imports: readonly RubyImportFact[];
  readonly heritage: readonly RubyHeritageFact[];
  readonly calls: readonly RubyCallFact[];
}

/** PostgreSQL DDL relations retained for bounded, source-only schema analysis. */
export type SqlDeclarationKind = "schema" | "table";

export interface SqlTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly declarationKind: SqlDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface SqlRelationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly sourceTableName: string;
  readonly targetTableName: string;
  readonly relationKind: "references" | "extends";
  readonly range: SourceRange;
}

/** Syntax-only SQL relation facts. Dialect execution, search_path, views, routines, and dynamic SQL remain nonclaims. */
export interface SqlFacts {
  readonly parserRejected?: boolean;
  readonly types: readonly SqlTypeFact[];
  readonly relations: readonly SqlRelationFact[];
}

/** Syntax-only Java package facts retained for exact Play controller-action resolution. */
export interface JavaFacts {
  readonly classes: readonly JavaClassFact[];
}

/**
 * A top-level Java or Kotlin type whose package declaration was parsed without
 * recovery. The project resolver uses this identity only for direct JVM
 * inheritance facts; it does not model a compiler classpath or nested types.
 */
export interface JvmTypeFact {
  readonly symbolId: string;
  readonly packageName: string;
  /** Present only when source syntax declares a Java annotation type. */
  readonly isAnnotation?: true;
}

/** One unique, undecorated top-level Python declaration safe for B2 import resolution. */
export interface PythonTopLevelDeclarationFact {
  readonly symbolId: string;
  readonly name: string;
  readonly kind: "function" | "class";
  /** Present only for a synchronous top-level function eligible as an exact call target. */
  readonly runtimeCallEligible?: true;
  /** Present only for an undecorated class without an explicit metaclass keyword. */
  readonly instantiationEligible?: true;
}

/** A single-name `from .module import Name [as Alias]` parsed without recovery. */
export interface PythonRelativeNamedImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly moduleName: string;
  readonly importedName: string;
  readonly localName: string;
  readonly range: SourceRange;
}

/** A bare direct call through one syntax-proven Python relative named import. */
export interface PythonImportedFunctionCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly localName: string;
  readonly range: SourceRange;
}

/** A bare direct call that may resolve to one imported top-level Python class. */
export interface PythonImportedClassInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly localName: string;
  readonly range: SourceRange;
}

/** One direct class base written through one syntax-proven Python relative named import. */
export interface PythonImportedClassInheritanceFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly localName: string;
  readonly range: SourceRange;
}

/** Syntax-only facts for deliberately narrow Python regular-package B2 resolution. */
export interface PythonFacts {
  readonly topLevelDeclarations: readonly PythonTopLevelDeclarationFact[];
  readonly relativeNamedImports: readonly PythonRelativeNamedImportFact[];
  readonly importedFunctionCalls: readonly PythonImportedFunctionCallFact[];
  readonly importedClassInstantiations?: readonly PythonImportedClassInstantiationFact[];
  readonly importedClassInheritances: readonly PythonImportedClassInheritanceFact[];
  /** Declaration names whose module binding can be replaced through `global` in this artifact. */
  readonly artifactGlobalTaintedNames?: readonly string[];
  /** True when a bare code-token `globals()` or `exec()` prevents exact runtime identity. */
  readonly dynamicGlobalHazard?: true;
}

/** The parsed direct JVM heritage shape before its target type is resolved. */
export type JvmHeritageSyntax =
  | "java-class-superclass"
  | "java-class-interface"
  | "java-interface-superinterface"
  | "kotlin-supertype";

/**
 * One direct Java or Kotlin parent-type reference. A target path is retained
 * either from an explicit, non-static/non-wildcard Java import, a
 * non-aliased/non-wildcard Kotlin import, or a syntactically direct qualified
 * type spelling. Generic, wildcard, alias, and nested-type semantics remain
 * outside this syntax-only fact.
 */
export interface JvmHeritageReferenceFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly syntax: JvmHeritageSyntax;
  readonly range: SourceRange;
  readonly importedTypePath?: string;
  readonly qualifiedTypePath?: string;
}

/** One exact, non-static, non-wildcard Java import retained for project-type resolution. */
export interface JvmImportReferenceFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly importedTypePath: string;
  readonly range: SourceRange;
}

/** One direct Java declaration annotation whose type spelling remains source-proven. */
export interface JvmAnnotationReferenceFact {
  readonly sourceId: string;
  readonly declaringTypeId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly range: SourceRange;
  readonly importedTypePath?: string;
  readonly qualifiedTypePath?: string;
}

/**
 * The source-only form of a JVM dependency-injection point. It proves the
 * annotation and declared type only; it never claims a runtime bean/provider
 * selection, qualifier outcome, or compiler classpath result.
 */
export type JvmDependencyInjectionSyntax =
  | "spring-autowired-constructor"
  | "spring-autowired-field"
  | "spring-autowired-setter"
  | "spring-autowired-method"
  | "jakarta-inject-constructor"
  | "jakarta-inject-field"
  | "jakarta-inject-setter"
  | "jakarta-inject-method"
  | "javax-inject-constructor"
  | "javax-inject-field"
  | "javax-inject-setter"
  | "javax-inject-method"
  | "jakarta-resource-field"
  | "jakarta-resource-setter"
  | "javax-resource-field"
  | "javax-resource-setter";

/**
 * One direct Java/Kotlin DI-point type reference. A target path is retained
 * only from an explicit, non-static/non-wildcard import or a syntactically
 * direct qualified type spelling. Generic, alias, wildcard, nested-type, and
 * runtime-provider semantics remain outside this syntax-only fact. `@Resource`
 * facts are retained only for bare or empty annotations, so explicit name,
 * lookup, and type overrides never masquerade as type-based resolution.
 */
export interface JvmDependencyInjectionReferenceFact {
  /** Stable symbol identity of the directly declaring Java/Kotlin class. */
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly syntax: JvmDependencyInjectionSyntax;
  readonly range: SourceRange;
  readonly importedTypePath?: string;
  readonly qualifiedTypePath?: string;
}

/**
 * One source-declared Java callable parameter or return type. The extractor
 * records only direct syntax and removes enclosing class/method type
 * parameters; project resolution still requires a unique indexed top-level
 * type proven by an explicit import, qualified spelling, or same package.
 */
export interface JvmCallableSignatureReferenceFact {
  readonly sourceId: string;
  readonly declaringTypeId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly relationKind: "accepts" | "returns";
  /** True only for the outer declared return type; omitted by pre-v0.298 facts. */
  readonly isTopLevelType?: boolean;
  readonly range: SourceRange;
  readonly importedTypePath?: string;
  readonly qualifiedTypePath?: string;
}

/**
 * One source-declared Java callable retained for receiver-aware project
 * resolution. Static-ness is syntax evidence only; constructors can never be
 * selected as static factories by the chained-call projector.
 */
export interface JavaCallableDeclarationFact {
  readonly symbolId: string;
  readonly declaringTypeId: string;
  readonly name: string;
  readonly callableKind: "method" | "constructor";
  readonly isStatic: boolean;
  /** Missing before v0.358; only a declared final method is true. */
  readonly isFinal?: boolean;
  /** Omitted by pre-v0.304 facts; unresolved visibility is never treated as public. */
  readonly visibility?: "public" | "protected" | "package" | "private";
  /** Omitted by pre-v0.299 facts, which are never eligible for arity resolution. */
  readonly minimumArgumentCount?: number;
  /** Null denotes varargs; omitted by pre-v0.299 facts. */
  readonly maximumArgumentCount?: number | null;
  /** Ordered declaration types; null entries are unsupported syntax. Omitted by pre-v0.300 facts. */
  readonly parameterTypes?: readonly (JavaCallTypeReferenceFact | null)[];
}

/** A direct Java primitive or non-generic reference type retained for call matching. */
export interface JavaCallTypeReferenceFact {
  readonly kind: "primitive" | "reference";
  readonly referenceName: string;
  readonly syntax:
    | "declaration"
    | "object-creation"
    | "primitive-literal"
    | "primitive-cast"
    | "string-literal"
    | "type-qualifier";
  readonly range: SourceRange;
  readonly importedTypePath?: string;
  readonly qualifiedTypePath?: string;
}

/** One direct Java object creation whose constructed top-level type is source-proven. */
export interface JavaInstantiationReferenceFact {
  readonly sourceId: string;
  readonly declaringTypeId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly range: SourceRange;
  readonly importedTypePath?: string;
  readonly qualifiedTypePath?: string;
}

/** One source-declared Java class field or interface constant retained for receiver resolution. */
export interface JavaFieldDeclarationFact {
  readonly declaringTypeId: string;
  readonly name: string;
  readonly declarationKind: "class-field" | "interface-constant";
  /** Null preserves unsupported syntax as a name-hiding boundary. */
  readonly type: JavaCallTypeReferenceFact | null;
  readonly isStatic: boolean;
  readonly isFinal: boolean;
  readonly visibility: "public" | "protected" | "package" | "private";
  readonly modifierProof: "declared" | "interface-implicit";
  readonly declarationRange: SourceRange;
  readonly scopeRange: SourceRange;
}

/**
 * A direct two-call Java chain such as `Factory.create().execute()`. The
 * extractor proves only the syntax and import spelling. Project resolution
 * must still prove the receiver type, a unique static factory, its exact
 * declared return type, and a unique method owned by that return type.
 */
export interface JavaChainedCallReferenceFact {
  readonly sourceId: string;
  readonly declaringTypeId: string;
  readonly filePath: string;
  readonly receiverTypeName: string;
  readonly factoryMethodName: string;
  readonly methodName: string;
  /** Omitted by pre-v0.299 facts, which are never eligible for arity resolution. */
  readonly factoryArgumentCount?: number;
  /** Omitted by pre-v0.299 facts, which are never eligible for arity resolution. */
  readonly methodArgumentCount?: number;
  /** Ordered argument types; null entries are intentionally unknown. Omitted by pre-v0.300 facts. */
  readonly factoryArgumentTypes?: readonly (JavaCallTypeReferenceFact | null)[];
  /** Ordered argument types; null entries are intentionally unknown. Omitted by pre-v0.300 facts. */
  readonly methodArgumentTypes?: readonly (JavaCallTypeReferenceFact | null)[];
  readonly factoryRange: SourceRange;
  readonly range: SourceRange;
  readonly importedTypePath?: string;
  readonly qualifiedTypePath?: string;
}

/**
 * One explicit Java member invocation through `this`, `super`, a source-proven
 * parameter/local/field declaration, an enhanced-for/catch/explicit-lambda/
 * positive-instanceof binding, or a direct `var = new Type(...)`
 * initializer. Extraction retains source binding and argument evidence;
 * project resolution still proves the indexed receiver type, hierarchy,
 * method set, overload, and access.
 */
interface JavaMemberCallReferenceBaseFact {
  readonly sourceId: string;
  readonly declaringTypeId: string;
  readonly filePath: string;
  readonly methodName: string;
  readonly argumentCount: number;
  readonly argumentTypes: readonly (JavaCallTypeReferenceFact | null)[];
  readonly range: SourceRange;
}

export type JavaMemberCallReferenceFact =
  | (JavaMemberCallReferenceBaseFact & {
      /** Bare invocation in a static callable; resolution is locked to the declaring type. */
      readonly receiverKind: "implicit-static";
    })
  | (JavaMemberCallReferenceBaseFact & {
      /**
       * Bare invocation in an instance callable. Project resolution may select only one
       * non-static private method declared on this exact class; wider dispatch stays unresolved.
       */
      readonly receiverKind: "implicit-instance";
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "this" | "super";
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "type-name-static";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "parameter";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
      readonly receiverBindingRange: SourceRange;
      readonly receiverScopeRange: SourceRange;
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "local";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
      readonly receiverBindingRange: SourceRange;
      readonly receiverScopeRange: SourceRange;
      /** Present only when Java `var` derives its type from one direct object creation. */
      readonly receiverInitializerRange?: SourceRange;
      /** Present only after one direct same-block assignment activates an uninitialized local. */
      readonly receiverAssignmentType?: JavaCallTypeReferenceFact;
      readonly receiverAssignmentRange?: SourceRange;
      readonly receiverAssignmentInitializerRange?: SourceRange;
      /** Present only after one exhaustive, exact two-block if/else assignment join. */
      readonly receiverAssignmentJoin?: {
        readonly statementRange: SourceRange;
        readonly conditionRange: SourceRange;
        readonly branches: readonly [
          {
            readonly branch: "then";
            readonly scopeRange: SourceRange;
            readonly type: JavaCallTypeReferenceFact;
            readonly assignmentRange: SourceRange;
            readonly initializerRange: SourceRange;
          },
          {
            readonly branch: "else";
            readonly scopeRange: SourceRange;
            readonly type: JavaCallTypeReferenceFact;
            readonly assignmentRange: SourceRange;
            readonly initializerRange: SourceRange;
          }
        ];
      };
      /** Present only after one bounded exhaustive if/else-if/else assignment chain. */
      readonly receiverAssignmentChain?: {
        readonly statementRange: SourceRange;
        readonly bounds: {
          readonly maximumBranches: number;
          readonly observedBranches: number;
        };
        readonly branches: readonly {
          readonly ordinal: number;
          readonly branch: "if" | "else-if" | "else";
          readonly statementRange: SourceRange;
          readonly conditionRange?: SourceRange;
          readonly scopeRange: SourceRange;
          readonly type: JavaCallTypeReferenceFact;
          readonly assignmentRange: SourceRange;
          readonly initializerRange: SourceRange;
        }[];
      };
      /** Present only after one bounded exhaustive arrow-rule switch assignment join. */
      readonly receiverSwitchAssignmentJoin?: {
        readonly statementRange: SourceRange;
        readonly selectorRange: SourceRange;
        readonly bounds: {
          readonly maximumArms: number;
          readonly observedArms: number;
        };
        readonly arms: readonly {
          readonly ordinal: number;
          readonly arm: "case" | "default";
          readonly labelRange: SourceRange;
          readonly type: JavaCallTypeReferenceFact;
          readonly assignmentRange: SourceRange;
          readonly initializerRange: SourceRange;
        }[];
      };
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "enhanced-for" | "catch" | "lambda";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
      readonly receiverBindingRange: SourceRange;
      readonly receiverScopeRange: SourceRange;
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "instanceof-pattern";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
      readonly receiverBindingRange: SourceRange;
      readonly receiverScopeRange: SourceRange;
      readonly receiverConditionRange: SourceRange;
      readonly receiverTestedValueRange: SourceRange;
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "instanceof-and-pattern";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
      readonly receiverBindingRange: SourceRange;
      readonly receiverScopeRange: SourceRange;
      readonly receiverConditionRange: SourceRange;
      readonly receiverTestedValueRange: SourceRange;
      readonly receiverRightOperandRange: SourceRange;
      readonly receiverTrueBlockRange: SourceRange;
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "instanceof-and-chain-pattern";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
      readonly receiverBindingRange: SourceRange;
      readonly receiverScopeRange: SourceRange;
      readonly receiverConditionRange: SourceRange;
      readonly receiverTestedValueRange: SourceRange;
      readonly receiverLogicalOperandRanges: readonly SourceRange[];
      readonly receiverActiveOperandRange: SourceRange | null;
      readonly receiverActiveOperandOrdinal: number | null;
      readonly receiverTrueBlockRange: SourceRange;
      readonly receiverOperandCount: number;
      readonly receiverMaximumOperands: number;
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "instanceof-grouped-and-pattern";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
      readonly receiverBindingRange: SourceRange;
      readonly receiverScopeRange: SourceRange;
      readonly receiverConditionRange: SourceRange;
      readonly receiverTestedValueRange: SourceRange;
      readonly receiverLogicalOperandRanges: readonly SourceRange[];
      readonly receiverLogicalOperandGroupingPaths: readonly (readonly (
        | "left"
        | "right"
        | "parenthesized"
      )[])[];
      readonly receiverGroupingRanges: readonly SourceRange[];
      readonly receiverActiveOperandRange: SourceRange | null;
      readonly receiverActiveOperandOrdinal: number | null;
      readonly receiverTrueBlockRange: SourceRange;
      readonly receiverOperandCount: number;
      readonly receiverMaximumOperands: number;
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "instanceof-negated-early-exit-pattern";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
      readonly receiverBindingRange: SourceRange;
      readonly receiverScopeRange: SourceRange;
      readonly receiverConditionRange: SourceRange;
      readonly receiverTestedValueRange: SourceRange;
      readonly receiverNegatedPatternRange: SourceRange;
      readonly receiverNegationGroupingRanges: readonly SourceRange[];
      readonly receiverMaximumGroupingDepth: number;
      readonly receiverGuardStatementRange: SourceRange;
      readonly receiverExitBodyKind: "block" | "statement";
      readonly receiverExitBodyRange: SourceRange;
      readonly receiverAbruptCompletionKind: "return" | "throw";
      readonly receiverAbruptStatementRange: SourceRange;
      readonly receiverAbruptWrapperKind: "try-finally" | null;
      readonly receiverAbruptWrapperRange: SourceRange | null;
      readonly receiverAbruptWrapperTryBodyRange: SourceRange | null;
      readonly receiverAbruptWrapperFinallyRange: SourceRange | null;
      readonly receiverAbruptWrapperFinallyBodyRange: SourceRange | null;
      readonly receiverAbruptWrapperFinallyStatementRanges: readonly SourceRange[];
      readonly receiverAbruptWrapperMaximumFinallyStatements: number;
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "instanceof-negated-target-exit-pattern";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
      readonly receiverBindingRange: SourceRange;
      readonly receiverScopeRange: SourceRange;
      readonly receiverConditionRange: SourceRange;
      readonly receiverTestedValueRange: SourceRange;
      readonly receiverNegatedPatternRange: SourceRange;
      readonly receiverNegationGroupingRanges: readonly SourceRange[];
      readonly receiverMaximumGroupingDepth: number;
      readonly receiverGuardStatementRange: SourceRange;
      readonly receiverExitBodyKind: "block" | "statement";
      readonly receiverExitBodyRange: SourceRange;
      readonly receiverAbruptCompletionKind: "break" | "continue" | "yield";
      readonly receiverAbruptStatementRange: SourceRange;
      readonly receiverAbruptWrapperKind: "try-finally" | null;
      readonly receiverAbruptWrapperRange: SourceRange | null;
      readonly receiverAbruptWrapperTryBodyRange: SourceRange | null;
      readonly receiverAbruptWrapperFinallyRange: SourceRange | null;
      readonly receiverAbruptWrapperFinallyBodyRange: SourceRange | null;
      readonly receiverAbruptWrapperFinallyStatementRanges: readonly SourceRange[];
      readonly receiverAbruptWrapperMaximumFinallyStatements: number;
      readonly receiverAbruptTargetKind:
        | "while"
        | "do"
        | "for"
        | "enhanced-for"
        | "block"
        | "statement"
        | "switch"
        | "switch-expression";
      readonly receiverAbruptTargetRange: SourceRange;
      readonly receiverAbruptTargetBodyRange: SourceRange;
      readonly receiverAbruptTargetCaseGroupRange: SourceRange | null;
      readonly receiverAbruptTargetCaseLabelRanges: readonly SourceRange[];
      readonly receiverAbruptTargetRuleRange: SourceRange | null;
      readonly receiverAbruptTargetRuleBodyRange: SourceRange | null;
      readonly receiverAbruptTargetRuleLabelRange: SourceRange | null;
      readonly receiverAbruptTargetExpressionContext:
        | "return"
        | "initializer"
        | "assignment"
        | "yield"
        | null;
      readonly receiverAbruptTargetLabel: string | null;
      readonly receiverAbruptTargetLabelRange: SourceRange | null;
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "instanceof-negated-else-pattern";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
      readonly receiverBindingRange: SourceRange;
      readonly receiverScopeRange: SourceRange;
      readonly receiverConditionRange: SourceRange;
      readonly receiverTestedValueRange: SourceRange;
      readonly receiverNegatedPatternRange: SourceRange;
      readonly receiverNegationGroupingRanges: readonly SourceRange[];
      readonly receiverMaximumGroupingDepth: number;
      readonly receiverGuardStatementRange: SourceRange;
      readonly receiverThenBodyKind: "block" | "statement";
      readonly receiverThenBodyRange: SourceRange;
      readonly receiverThenAbruptCompletionKind:
        | "return"
        | "throw"
        | "break"
        | "continue"
        | "yield"
        | null;
      readonly receiverThenAbruptStatementRange: SourceRange | null;
      readonly receiverThenAbruptWrapperKind: "try-finally" | null;
      readonly receiverThenAbruptWrapperRange: SourceRange | null;
      readonly receiverThenAbruptWrapperTryBodyRange: SourceRange | null;
      readonly receiverThenAbruptWrapperFinallyRange: SourceRange | null;
      readonly receiverThenAbruptWrapperFinallyBodyRange: SourceRange | null;
      readonly receiverThenAbruptWrapperFinallyStatementRanges: readonly SourceRange[];
      readonly receiverThenAbruptWrapperMaximumFinallyStatements: number;
      readonly receiverThenAbruptTargetKind:
        | "while"
        | "do"
        | "for"
        | "enhanced-for"
        | "block"
        | "statement"
        | "switch"
        | "switch-expression"
        | null;
      readonly receiverThenAbruptTargetRange: SourceRange | null;
      readonly receiverThenAbruptTargetBodyRange: SourceRange | null;
      readonly receiverThenAbruptTargetCaseGroupRange: SourceRange | null;
      readonly receiverThenAbruptTargetCaseLabelRanges: readonly SourceRange[];
      readonly receiverThenAbruptTargetRuleRange: SourceRange | null;
      readonly receiverThenAbruptTargetRuleBodyRange: SourceRange | null;
      readonly receiverThenAbruptTargetRuleLabelRange: SourceRange | null;
      readonly receiverThenAbruptTargetExpressionContext:
        | "return"
        | "initializer"
        | "assignment"
        | "yield"
        | null;
      readonly receiverThenAbruptTargetLabel: string | null;
      readonly receiverThenAbruptTargetLabelRange: SourceRange | null;
      readonly receiverElseBodyKind: "block" | "statement";
      readonly receiverElseBodyRange: SourceRange;
      readonly receiverActiveRegion: "else-body" | "following-scope";
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "try-resource";
      readonly receiverName: string;
      readonly receiverType: JavaCallTypeReferenceFact;
      readonly receiverBindingRange: SourceRange;
      readonly receiverScopeRange: SourceRange;
      /** Present only when Java `var` derives its type from one direct object creation. */
      readonly receiverInitializerRange?: SourceRange;
      readonly receiverResourceOrdinal: number;
      readonly receiverTryBodyRange: SourceRange;
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "field" | "this-field" | "super-field";
      readonly receiverName: string;
      /** Legacy direct-field facts only; v0.312+ selects the owner during project resolution. */
      readonly receiverType?: JavaCallTypeReferenceFact;
      readonly receiverBindingRange?: SourceRange;
      readonly receiverScopeRange?: SourceRange;
      readonly receiverFieldStatic?: boolean;
      readonly receiverFieldVisibility?: "public" | "protected" | "package" | "private";
    })
  | (JavaMemberCallReferenceBaseFact & {
      readonly receiverKind: "type-field";
      readonly receiverName: string;
      readonly receiverOwnerType: JavaCallTypeReferenceFact;
      /** First lexical segment; project resolution rejects competing value-field bindings. */
      readonly receiverQualifierRootName: string;
    });

/** Kotlin declaration shapes retained for bounded project-local relation resolution. */
export type KotlinTypeDeclarationKind = "class" | "object" | "interface" | "enum" | "typealias";

export interface KotlinTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly packageName: string;
  readonly qualifiedTypePath: string;
  readonly declarationKind: KotlinTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
  readonly variantNames?: readonly string[];
  readonly aliasTargetName?: string;
  readonly constructorParameterCount?: number;
  readonly constructorRequiredParameterCount?: number;
}

export type KotlinCallableKind = "function" | "method" | "extension";

export interface KotlinCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly packageName: string;
  readonly callableKind: KotlinCallableKind;
  readonly ownerTypeName?: string;
  readonly ownerTypeId?: string;
  readonly receiverTypeName?: string;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly isExported: boolean;
  readonly isOverride?: boolean;
  readonly range: SourceRange;
}

/** One explicit, unaliased Kotlin import retained for exact project resolution. */
export interface KotlinImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedPath: string;
  readonly importedName: string;
  readonly localName: string;
  readonly isWildcard: boolean;
  readonly isAliased: boolean;
  readonly range: SourceRange;
}

/** One direct Kotlin call through a top-level name, concrete receiver, or object. */
export interface KotlinCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "member";
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly receiverTypePath?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

/** One direct Kotlin class-constructor call; objects, aliases, and dynamic calls stay out. */
export interface KotlinInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly typePath?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

/** Syntax-only Kotlin relation facts. Unsupported JVM/compiler/runtime semantics remain nonclaims. */
export interface KotlinFacts {
  readonly packageName: string;
  readonly types: readonly KotlinTypeFact[];
  readonly callables: readonly KotlinCallableFact[];
  readonly imports: readonly KotlinImportFact[];
  readonly calls: readonly KotlinCallFact[];
  readonly instantiations: readonly KotlinInstantiationFact[];
}

/** Syntax-only JVM package, import, heritage, and DI-point facts for project resolution. */
export interface JvmFacts {
  readonly types: readonly JvmTypeFact[];
  readonly heritageReferences: readonly JvmHeritageReferenceFact[];
  /** Omitted only by artifact facts persisted before v0.438. */
  readonly importReferences?: readonly JvmImportReferenceFact[];
  /** Omitted only by artifact facts persisted before v0.438. */
  readonly annotationReferences?: readonly JvmAnnotationReferenceFact[];
  /** Omitted only by artifact facts persisted before v0.220. */
  readonly dependencyInjectionReferences?: readonly JvmDependencyInjectionReferenceFact[];
  /** Omitted only by artifact facts persisted before v0.297. */
  readonly callableSignatureReferences?: readonly JvmCallableSignatureReferenceFact[];
  /** Omitted only by artifact facts persisted before v0.298. */
  readonly javaCallableDeclarations?: readonly JavaCallableDeclarationFact[];
  /** Omitted only by artifact facts persisted before v0.298. */
  readonly javaChainedCallReferences?: readonly JavaChainedCallReferenceFact[];
  /** Omitted only by artifact facts persisted before v0.308. */
  readonly javaMemberCallReferences?: readonly JavaMemberCallReferenceFact[];
  /** Omitted only by artifact facts persisted before v0.311. */
  readonly javaFieldDeclarations?: readonly JavaFieldDeclarationFact[];
  /** Omitted only by artifact facts persisted before v0.309. */
  readonly javaInstantiationReferences?: readonly JavaInstantiationReferenceFact[];
}

/**
 * One direct Spring `@Value` literal-key annotation on a Java field or
 * constructor or concrete-method parameter, or a one-parameter concrete
 * method, or a Kotlin class property, primary-constructor parameter,
 * concrete-method parameter, or one-parameter concrete method.
 */
export interface SpringBootPropertiesValueReferenceFact {
  /** Stable symbol identity of the directly enclosing Java or Kotlin class. */
  readonly sourceId: string;
  readonly filePath: string;
  readonly key: string;
  readonly range: SourceRange;
}

/**
 * One direct Java/Kotlin class, direct top-level Java record, or direct
 * concrete Java/Kotlin `@Bean` method in a direct `@Configuration` class with a
 * `@ConfigurationProperties` literal-prefix annotation.
 */
export interface SpringBootConfigurationPropertiesPrefixReferenceFact {
  /** Stable symbol identity of the directly annotated owner. */
  readonly sourceId: string;
  readonly filePath: string;
  readonly prefix: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only Spring Boot configuration facts. The project resolver links
 * literal `@Value` keys and `@ConfigurationProperties` prefixes from direct Java/Kotlin
 * classes, direct top-level Java records, or direct concrete Java/Kotlin `@Bean` methods
 * in direct `@Configuration` classes only to parser-proven keys in conventional
 * application/bootstrap properties or YAML files.
 */
export interface SpringBootPropertiesFacts {
  readonly valueReferences: readonly SpringBootPropertiesValueReferenceFact[];
  /** Omitted only by artifact facts persisted before v0.171. */
  readonly configurationPropertiesPrefixes?: readonly SpringBootConfigurationPropertiesPrefixReferenceFact[];
}

/** Direct literal Shopify Liquid template tag kinds retained for project-local resolution. */
export type LiquidTemplateReferenceKind = "render" | "include" | "section";

/** One complete direct literal Liquid template reference. */
export interface LiquidTemplateReferenceFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly kind: LiquidTemplateReferenceKind;
  readonly targetFilePath: string;
  readonly referenceName: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only Liquid facts projected into exact or explicitly unresolved
 * project-local template calls after all indexed file symbols are available.
 */
export interface LiquidFacts {
  readonly templateReferences: readonly LiquidTemplateReferenceFact[];
}

/** Direct literal Twig template tag kinds retained for project-local resolution. */
export type TwigTemplateReferenceKind = "extends" | "include" | "embed" | "import" | "from";

/** One complete direct literal Twig template reference. */
export interface TwigTemplateReferenceFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly kind: TwigTemplateReferenceKind;
  readonly targetFilePath: string;
  readonly referenceName: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only Twig facts projected into exact or explicitly unresolved calls
 * only after the indexed project file catalog is available.
 */
export interface TwigFacts {
  readonly templateReferences: readonly TwigTemplateReferenceFact[];
}

/** Direct literal JSP project-resource reference kinds retained for project resolution. */
export type JspTemplateReferenceKind =
  | "include-directive"
  | "include-action"
  | "forward-action"
  | "tag-file";

/** One locally declared JSP tag-library prefix with a literal URI or tag directory when proven. */
export interface JspTaglibFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly prefix: string;
  readonly uri?: string;
  readonly tagDir?: string;
  readonly range: SourceRange;
}

/** One complete direct literal JSP resource reference with bounded candidate paths. */
export interface JspTemplateReferenceFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly kind: JspTemplateReferenceKind;
  readonly targetFilePaths: readonly string[];
  readonly referenceName: string;
  readonly range: SourceRange;
}

/** Syntax-only JSP facts resolved only after the complete indexed file catalog is available. */
export interface JspFacts {
  readonly taglibs: readonly JspTaglibFact[];
  readonly templateReferences: readonly JspTemplateReferenceFact[];
}

/** One bounded direct inline Markdown link retained for project-local file resolution. */
export interface MarkdownLinkFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly targetFilePath: string;
  readonly referenceName: string;
  readonly range: SourceRange;
  /** Distinguishes an inline destination from a resolved reference definition. */
  readonly sourceKind?: "inline" | "reference";
}

/** Syntax-only Markdown facts resolved after the complete indexed file catalog is available. */
export interface MarkdownFacts {
  readonly links: readonly MarkdownLinkFact[];
}

/** One literal Protocol Buffers import retained for project-local resolution. */
export interface ProtoImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importPath: string;
  readonly importKind: "plain" | "public" | "weak";
  readonly range: SourceRange;
}

/** One Protocol Buffers declaration retained for imported RPC message proof. */
export interface ProtoTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly declarationKind: "message" | "enum" | "service";
  readonly range: SourceRange;
}

/** One service RPC signature with source-ranged request and response names. */
export interface ProtoRpcFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly name: string;
  readonly requestName: string;
  readonly responseName: string;
  readonly requestQualified: boolean;
  readonly responseQualified: boolean;
  readonly requestRange: SourceRange;
  readonly responseRange: SourceRange;
  readonly range: SourceRange;
}

/** Syntax-only Protocol Buffers facts; compiler plugins and gRPC runtime remain nonclaims. */
export interface ProtoFacts {
  readonly parserRejected?: boolean;
  readonly imports: readonly ProtoImportFact[];
  readonly types: readonly ProtoTypeFact[];
  readonly rpcs: readonly ProtoRpcFact[];
}

/** One GraphQL schema type or interface declaration retained for project proof. */
export interface GraphqlTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly declarationKind: "type" | "interface" | "enum";
  readonly range: SourceRange;
}

/** One direct GraphQL `implements Interface` occurrence. */
export interface GraphqlHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly range: SourceRange;
}

/** Syntax-only GraphQL facts; schema stitching, resolver linkage and execution remain nonclaims. */
export interface GraphqlFacts {
  readonly parserRejected?: boolean;
  readonly types: readonly GraphqlTypeFact[];
  readonly heritage: readonly GraphqlHeritageFact[];
}

/** One top-level R function binding retained for same-file call resolution. */
export interface RFunctionFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly parameterCount: number;
  readonly parameterNames: readonly string[];
  /** True when the body uses S3/S4 dispatch or another dynamic method surface. */
  readonly dynamicDispatch: boolean;
  readonly range: SourceRange;
}

/** One direct R function call occurrence retained for bounded local resolution. */
export interface RCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

/** Syntax-only R facts; package loading, S3/S4 dispatch and evaluation remain nonclaims. */
export interface RFacts {
  readonly parserRejected?: boolean;
  /** File-level binding mutation or loading makes all direct calls non-exact. */
  readonly bindingTainted?: boolean;
  readonly functions: readonly RFunctionFact[];
  readonly calls: readonly RCallFact[];
}

/** Direct literal Laravel Blade view directive kinds retained for project-local resolution. */
export type BladeTemplateReferenceKind = "extends" | "include" | "component" | "each";

/** One complete direct literal Laravel Blade view directive reference. */
export interface BladeTemplateReferenceFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly kind: BladeTemplateReferenceKind;
  readonly targetFilePath: string;
  readonly referenceName: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only Blade facts projected into exact or explicitly unresolved calls
 * only after the indexed project file catalog is available.
 */
export interface BladeFacts {
  readonly templateReferences: readonly BladeTemplateReferenceFact[];
}

/** A direct simple Solidity `is Base` clause retained for same-file proof. */
export interface SolidityInheritanceFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly baseName: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only Solidity inheritance facts. They are resolved only against one
 * complete indexed source file so contract/interface relation kind stays exact.
 */
export interface SolidityFacts {
  readonly inheritanceReferences: readonly SolidityInheritanceFact[];
}

/** A direct COBOL data declaration that conventionally owns one CICS transaction id. */
export interface CobolCicsTransactionOwnerFact {
  readonly transactionId: string;
  /** Stable symbol identity of the source-proven COBOL program declaration. */
  readonly programId: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only COBOL CICS ownership facts. A CICS resource definition is
 * external to the repository, so the project resolver treats this convention
 * as a bounded heuristic rather than an exact runtime guarantee.
 */
export interface CobolCicsFacts {
  readonly transactionOwners: readonly CobolCicsTransactionOwnerFact[];
}

/** One direct JavaScript/TypeScript call through a proven React Native NativeModules binding. */
export interface ReactNativeNativeModuleCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly moduleName: string;
  readonly methodName: string;
  readonly range: SourceRange;
}

/** One direct JavaScript call through a statically proven TurboModule registry binding. */
export interface ReactNativeTurboModuleCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly moduleName: string;
  readonly methodName: string;
  readonly range: SourceRange;
}

/** A direct method call through one default import that may later prove to be a TurboModule. */
export interface ReactNativeTurboModuleDefaultImportCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly moduleSpecifier: string;
  readonly methodName: string;
  readonly range: SourceRange;
}

/** One direct default export of a literal React Native TurboModule registry result. */
export interface ReactNativeTurboModuleDefaultExportFact {
  readonly filePath: string;
  readonly moduleName: string;
  readonly range: SourceRange;
}

/** One method declared by a statically proven React Native TurboModule TypeScript spec. */
export interface ReactNativeTurboModuleSpecMethodFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly moduleName: string;
  readonly methodName: string;
  readonly range: SourceRange;
}

/** One direct native implementation method exported by a React Native bridge. */
export interface ReactNativeNativeMethodFact {
  readonly platform: "android" | "ios";
  readonly moduleName: string;
  readonly methodName: string;
  readonly methodId: string;
  readonly filePath: string;
  readonly range: SourceRange;
  /**
   * Codegen Spec overrides are candidates until the project resolver finds one
   * matching TypeScript TurboModule contract. Omitted direct bridge facts do
   * not need that additional project-level proof.
   */
  readonly implementationKind?: "codegen-spec-override";
}

/**
 * One Objective-C `RCT_EXTERN_*` declaration whose Objective-C class and full
 * selector are directly available for a later, evidence-backed Swift lookup.
 */
export interface ReactNativeSwiftExternalBridgeMethodFact {
  readonly objcClassName: string;
  readonly selector: string;
  /** Stable symbol identity of the Objective-C bridge declaration. */
  readonly methodId: string;
  readonly filePath: string;
  readonly range: SourceRange;
}

/** One explicitly named Swift `@objc` implementation method. */
export interface SwiftObjectiveCMethodFact {
  readonly objcClassName: string;
  readonly selector: string;
  /** Stable symbol identity of the Swift implementation method. */
  readonly methodId: string;
  readonly filePath: string;
  readonly range: SourceRange;
}

/**
 * A direct Swift type declaration relevant to an explicit Objective-C bridge.
 * `objcClassName` is null when a same-file extension has a direct local type
 * but that type does not provide an explicit Objective-C class identity.
 */
export interface SwiftObjectiveCTypeFact {
  readonly swiftTypeName: string;
  readonly objcClassName: string | null;
  readonly filePath: string;
  readonly range: SourceRange;
}

/**
 * A direct Swift extension implementation with an explicit selector. Its
 * Objective-C class identity remains unresolved until a project-level rule
 * proves the extended Swift type.
 */
export interface SwiftObjectiveCExtensionMethodFact {
  readonly extendedTypeName: string;
  readonly selector: string;
  /** Stable symbol identity of the Swift extension implementation method. */
  readonly methodId: string;
  readonly filePath: string;
  readonly range: SourceRange;
}

/** Syntax-only Swift Objective-C interop facts. */
export interface SwiftObjectiveCFacts {
  readonly methods: readonly SwiftObjectiveCMethodFact[];
  /** Omitted by raw facts persisted before v0.196. */
  readonly types?: readonly SwiftObjectiveCTypeFact[];
  /** Omitted by raw facts persisted before v0.196. */
  readonly extensionMethods?: readonly SwiftObjectiveCExtensionMethodFact[];
}

/** Swift declaration shapes retained for bounded project-local relation resolution. */
export type SwiftTypeDeclarationKind =
  | "class"
  | "struct"
  | "enum"
  | "protocol"
  | "actor"
  | "typealias";

export interface SwiftTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  /** Swift has no package declaration in source; an empty module is deliberate. */
  readonly moduleName: string;
  readonly qualifiedTypePath: string;
  readonly declarationKind: SwiftTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
  readonly isDecoratorTainted?: boolean;
  readonly aliasTargetName?: string;
}

export type SwiftCallableKind = "function" | "method" | "initializer" | "extension";

export interface SwiftCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly callableKind: SwiftCallableKind;
  readonly ownerTypeName?: string;
  readonly ownerTypeId?: string;
  readonly receiverTypeName?: string;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly isOverride?: boolean;
  readonly range: SourceRange;
}

/** One direct Swift import. Wildcard and alias forms remain nonclaims. */
export interface SwiftImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedPath: string;
  readonly importedName: string;
  readonly localName: string;
  readonly isWildcard: boolean;
  readonly isAliased: boolean;
  readonly range: SourceRange;
}

export interface SwiftCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "member";
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface SwiftInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface SwiftHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly relationKind: "extends" | "implements";
  readonly sourceTypeKind: SwiftTypeDeclarationKind;
  readonly range: SourceRange;
}

export interface SwiftOverrideFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly methodName: string;
  readonly ownerTypeName: string;
  readonly range: SourceRange;
}

/** Syntax-only Swift relation facts. Runtime dispatch and compiler features remain nonclaims. */
export interface SwiftFacts {
  readonly moduleName: string;
  readonly types: readonly SwiftTypeFact[];
  readonly callables: readonly SwiftCallableFact[];
  readonly imports: readonly SwiftImportFact[];
  readonly calls: readonly SwiftCallFact[];
  readonly instantiations: readonly SwiftInstantiationFact[];
  readonly heritage?: readonly SwiftHeritageFact[];
  readonly overrides?: readonly SwiftOverrideFact[];
}

/** Dart declaration shapes retained for bounded project-local relation resolution. */
export type DartTypeDeclarationKind = "class" | "mixin" | "enum" | "typedef" | "extension";

export interface DartTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly qualifiedTypePath: string;
  readonly declarationKind: DartTypeDeclarationKind;
  readonly isExported: boolean;
  readonly isAbstract?: boolean;
  readonly range: SourceRange;
}

export type DartCallableKind = "function" | "method" | "constructor" | "extension";

export interface DartCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly callableKind: DartCallableKind;
  readonly ownerTypeName?: string;
  readonly ownerTypeId?: string;
  readonly receiverTypeName?: string;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly isOverride?: boolean;
  readonly range: SourceRange;
}

export interface DartImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedPath: string;
  readonly relationKind: "imports" | "exports";
  readonly isAliased: boolean;
  readonly hasShowHide: boolean;
  readonly range: SourceRange;
}

export interface DartCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "member";
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface DartInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface DartHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly relationKind: "extends" | "with" | "implements";
  readonly sourceTypeKind: DartTypeDeclarationKind;
  readonly range: SourceRange;
}

export interface DartOverrideFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly methodName: string;
  readonly ownerTypeName: string;
  readonly range: SourceRange;
}

/** Syntax-only Dart relation facts. Analyzer/package/runtime semantics remain nonclaims. */
export interface DartFacts {
  readonly types: readonly DartTypeFact[];
  readonly callables: readonly DartCallableFact[];
  readonly imports: readonly DartImportFact[];
  readonly calls: readonly DartCallFact[];
  readonly instantiations: readonly DartInstantiationFact[];
  readonly heritage?: readonly DartHeritageFact[];
  readonly overrides?: readonly DartOverrideFact[];
}

/**
 * Syntax-only React Native bridge facts. JavaScript callsites and native
 * implementations remain independent until project resolution proves their
 * module-and-method identity.
 */
export interface ReactNativeFacts {
  readonly nativeModuleCalls: readonly ReactNativeNativeModuleCallFact[];
  readonly turboModuleCalls: readonly ReactNativeTurboModuleCallFact[];
  readonly turboModuleDefaultImportCalls: readonly ReactNativeTurboModuleDefaultImportCallFact[];
  readonly turboModuleDefaultExports: readonly ReactNativeTurboModuleDefaultExportFact[];
  readonly turboModuleSpecMethods: readonly ReactNativeTurboModuleSpecMethodFact[];
  readonly nativeMethods: readonly ReactNativeNativeMethodFact[];
  /** Omitted only by artifact facts persisted before v0.194. */
  readonly swiftExternalBridgeMethods?: readonly ReactNativeSwiftExternalBridgeMethodFact[];
}

/** A direct, standalone Razor Pages `@model` directive retained for its conventional companion. */
export interface RazorModelFact {
  readonly sourceId: string;
  readonly modelName: string;
  readonly range: SourceRange;
}

/** One literal Razor Pages POST handler attribute retained for its code-behind method. */
export interface RazorPageHandlerFact {
  readonly sourceId: string;
  readonly handlerName: string;
  readonly range: SourceRange;
}

/**
 * Syntax-only Razor facts. The resolver intentionally considers only the
 * canonical same-path `.cshtml.cs` companion; it never falls back to project
 * names for page models.
 */
export interface RazorFacts {
  readonly fileSymbolId: string;
  readonly defaultSymbolId: string;
  readonly model?: RazorModelFact;
  readonly postHandlers?: readonly RazorPageHandlerFact[];
}

/** A direct C# class declaration retained for exact same-file consumers. */
export interface CsharpDirectClassFact {
  readonly classId: string;
  readonly isPartial: boolean;
  /** True only for a direct, non-partial class with a source-proven Razor Pages PageModel base. */
  readonly isRazorPageModel?: boolean;
  /** Eligible public instance OnPost handlers declared directly by this class. */
  readonly razorPageHandlerMethods?: readonly {
    readonly handlerName: string;
    readonly methodId: string;
  }[];
}

/** C# declaration shapes retained for bounded project-local relation resolution. */
export type CsharpTypeDeclarationKind =
  | "namespace"
  | "class"
  | "record"
  | "struct"
  | "interface"
  | "enum"
  | "delegate";

export interface CsharpTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly namespaceName: string;
  readonly qualifiedTypePath: string;
  readonly declarationKind: CsharpTypeDeclarationKind;
  readonly isExported: boolean;
  readonly isPartial?: boolean;
  readonly isAbstract?: boolean;
  readonly range: SourceRange;
}

export type CsharpCallableKind = "method" | "constructor" | "function";

export interface CsharpCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly namespaceName: string;
  readonly callableKind: CsharpCallableKind;
  readonly ownerTypeName?: string;
  readonly ownerTypeId?: string;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isStatic: boolean;
  readonly isExported: boolean;
  readonly isOverride?: boolean;
  readonly range: SourceRange;
}

export interface CsharpUsingFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedPath: string;
  readonly isStatic: boolean;
  readonly isAlias: boolean;
  readonly range: SourceRange;
}

export interface CsharpCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "member";
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly receiverIsType?: boolean;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface CsharpInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface CsharpHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly relationKind: "extends" | "implements";
  readonly sourceTypeKind: CsharpTypeDeclarationKind;
  readonly range: SourceRange;
}

export interface CsharpOverrideFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly methodName: string;
  readonly ownerTypeName: string;
  readonly range: SourceRange;
}

/** Syntax-only C# relation facts; compiler, NuGet, reflection and runtime semantics remain nonclaims. */
export interface CsharpFacts {
  readonly namespaceName: string;
  readonly types: readonly CsharpTypeFact[];
  readonly callables: readonly CsharpCallableFact[];
  readonly usings: readonly CsharpUsingFact[];
  readonly calls: readonly CsharpCallFact[];
  readonly instantiations: readonly CsharpInstantiationFact[];
  readonly heritage?: readonly CsharpHeritageFact[];
  readonly overrides?: readonly CsharpOverrideFact[];
}

/** F# declaration shapes retained for bounded project-local relation resolution. */
export type FsharpTypeDeclarationKind =
  | "module"
  | "namespace"
  | "class"
  | "record"
  | "struct"
  | "union"
  | "interface"
  | "enum"
  | "delegate"
  | "typealias";

export interface FsharpTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly qualifiedTypePath: string;
  readonly declarationKind: FsharpTypeDeclarationKind;
  readonly isExported: boolean;
  readonly isAbstract?: boolean;
  readonly range: SourceRange;
}

export type FsharpCallableKind = "function" | "method" | "constructor";

export interface FsharpCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly callableKind: FsharpCallableKind;
  readonly ownerTypeName?: string;
  readonly ownerTypeId?: string;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isStatic: boolean;
  readonly isExported: boolean;
  readonly isOverride?: boolean;
  readonly range: SourceRange;
}

export interface FsharpOpenFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedPath: string;
  readonly isAlias: boolean;
  readonly range: SourceRange;
}

export interface FsharpCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "member" | "pipeline";
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly receiverIsType?: boolean;
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface FsharpInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface FsharpHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly relationKind: "extends" | "implements";
  readonly sourceTypeKind: FsharpTypeDeclarationKind;
  readonly range: SourceRange;
}

export interface FsharpOverrideFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly methodName: string;
  readonly ownerTypeName: string;
  readonly range: SourceRange;
}

/** Syntax-only F# relation facts. Compiler inference and runtime semantics remain nonclaims. */
export interface FsharpFacts {
  readonly moduleName: string;
  readonly parserRejected?: boolean;
  readonly types: readonly FsharpTypeFact[];
  readonly callables: readonly FsharpCallableFact[];
  readonly opens: readonly FsharpOpenFact[];
  readonly calls: readonly FsharpCallFact[];
  readonly instantiations: readonly FsharpInstantiationFact[];
  readonly heritage?: readonly FsharpHeritageFact[];
  readonly overrides?: readonly FsharpOverrideFact[];
}

/** OCaml declaration shapes retained for bounded project-local relation resolution. */
export type OcamlTypeDeclarationKind =
  | "module"
  | "class"
  | "record"
  | "variant"
  | "object"
  | "interface"
  | "enum"
  | "typealias";

export interface OcamlTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly qualifiedTypePath: string;
  readonly declarationKind: OcamlTypeDeclarationKind;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export type OcamlCallableKind = "function" | "method" | "constructor";

export interface OcamlCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly callableKind: OcamlCallableKind;
  readonly ownerTypeName?: string;
  readonly ownerTypeId?: string;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isStatic: boolean;
  readonly isExported: boolean;
  readonly isOverride?: boolean;
  readonly range: SourceRange;
}

export interface OcamlOpenFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedPath: string;
  readonly isAlias: boolean;
  readonly range: SourceRange;
}

export interface OcamlCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "member" | "module";
  readonly receiverName?: string;
  readonly receiverTypeName?: string;
  readonly receiverIsType?: boolean;
  readonly receiverModuleName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface OcamlInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly typeName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface OcamlHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly relationKind: "extends" | "implements";
  readonly sourceTypeKind: OcamlTypeDeclarationKind;
  readonly range: SourceRange;
}

export interface OcamlOverrideFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly methodName: string;
  readonly ownerTypeName: string;
  readonly range: SourceRange;
}

/** Syntax-only OCaml relation facts. Compiler inference and runtime semantics remain nonclaims. */
export interface OcamlFacts {
  readonly moduleName: string;
  readonly parserRejected?: boolean;
  readonly types: readonly OcamlTypeFact[];
  readonly callables: readonly OcamlCallableFact[];
  readonly opens: readonly OcamlOpenFact[];
  readonly calls: readonly OcamlCallFact[];
  readonly instantiations: readonly OcamlInstantiationFact[];
  readonly heritage?: readonly OcamlHeritageFact[];
  readonly overrides?: readonly OcamlOverrideFact[];
}

/** Haskell declaration shapes retained for bounded project-local relation resolution. */
export type HaskellTypeDeclarationKind =
  | "module"
  | "data"
  | "newtype"
  | "typealias"
  | "record"
  | "variant"
  | "class";

export interface HaskellTypeFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly qualifiedTypePath: string;
  readonly declarationKind: HaskellTypeDeclarationKind;
  readonly constructorNames?: readonly string[];
  readonly constructorArities?: Readonly<Record<string, number>>;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export type HaskellCallableKind = "function" | "method";

export interface HaskellCallableFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly name: string;
  readonly moduleName: string;
  readonly callableKind: HaskellCallableKind;
  readonly ownerTypeName?: string;
  readonly parameterCount: number;
  readonly requiredParameterCount: number;
  readonly parameterTypeNames?: readonly string[];
  readonly returnTypeName?: string;
  readonly isExported: boolean;
  readonly range: SourceRange;
}

export interface HaskellImportFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly importedModule: string;
  readonly importedNames?: readonly string[];
  readonly isQualified: boolean;
  readonly alias?: string;
  readonly range: SourceRange;
}

export interface HaskellCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly callKind: "direct" | "module";
  readonly receiverModuleName?: string;
  readonly receiverAlias?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface HaskellInstantiationFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly constructorName: string;
  readonly typeName?: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

export interface HaskellHeritageFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly sourceTypeName: string;
  readonly relationKind: "implements";
  readonly range: SourceRange;
}

/** Syntax-only Haskell relation facts. Compiler inference and runtime semantics remain nonclaims. */
export interface HaskellFacts {
  readonly moduleName: string;
  readonly parserRejected?: boolean;
  readonly types: readonly HaskellTypeFact[];
  readonly callables: readonly HaskellCallableFact[];
  readonly imports: readonly HaskellImportFact[];
  readonly calls: readonly HaskellCallFact[];
  readonly instantiations: readonly HaskellInstantiationFact[];
  readonly heritage?: readonly HaskellHeritageFact[];
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
  /** Omitted only by artifact facts persisted before the v0.419.1 TypeScript exact-call repair. */
  readonly typescriptFacts?: {
    /** Decorated classes whose runtime constructor/member surface may be replaced. */
    readonly decoratorTaintedTypeSymbolIds: readonly string[];
    /** Decorated methods/accessors/properties whose runtime value may be replaced. */
    readonly decoratorTaintedMemberSymbolIds: readonly string[];
    /** Members declared on the constructor value rather than its instances. */
    readonly staticMemberSymbolIds: readonly string[];
    /** Members declared on class/interface instances. */
    readonly instanceMemberSymbolIds: readonly string[];
    /** Methods or explicitly function-valued properties eligible as direct call targets. */
    readonly callableMemberSymbolIds: readonly string[];
    /** Runtime mutations on one class surface, including inherited member replacements. */
    readonly runtimeTaintedMemberSurfaces: readonly {
      readonly typeSymbolId: string;
      readonly memberName: string | null;
      readonly memberKind: "static" | "instance";
    }[];
  };
  /** Omitted only by artifact facts persisted before v0.17. */
  readonly nestRouteFacts?: NestRouteFacts;
  /** Omitted only by artifact facts persisted before v0.97. */
  readonly nestGraphqlFacts?: NestGraphqlFacts;
  /** Omitted only by artifact facts persisted before v0.22. */
  readonly fastifyPluginFacts?: FastifyPluginFacts;
  /** Omitted only by artifact facts persisted before v0.248. */
  readonly frameworkRoutePluginFacts?: FrameworkRoutePluginFacts;
  /** Omitted only by artifact facts persisted before v0.31. */
  readonly fastApiRouterFacts?: FastApiRouterFacts;
  /** Omitted only by artifact facts persisted before v0.228. */
  readonly djangoNinjaRouterFacts?: DjangoNinjaRouterFacts;
  /** Omitted only by artifact facts persisted before v0.111. */
  readonly flaskBlueprintFacts?: FlaskBlueprintFacts;
  /** Omitted only by artifact facts persisted before v0.151. */
  readonly sanicBlueprintFacts?: SanicBlueprintFacts;
  /** Omitted only by artifact facts persisted before v0.112. */
  readonly djangoUrlFacts?: DjangoUrlFacts;
  /** Omitted only by artifact facts persisted before v0.129. */
  readonly goFrameStandardRouterFacts?: GoFrameStandardRouterFacts;
  /** Omitted only by artifact facts persisted before v0.373. */
  readonly goProjectFacts?: GoProjectFacts;
  /** Omitted only by artifact facts persisted before v0.374. */
  readonly rustProjectFacts?: RustProjectFacts;
  /** Omitted only by artifact facts persisted before v0.377. */
  readonly adaProjectFacts?: AdaProjectFacts;
  /** Omitted only by artifact facts persisted before v0.118. */
  readonly rustActixServiceConfigFacts?: RustActixServiceConfigFacts;
  /** Omitted only by artifact facts persisted before v0.46. */
  readonly scalaFacts?: ScalaFacts;
  /** Omitted only by artifact facts persisted before v0.47. */
  readonly javaFacts?: JavaFacts;
  /** Omitted only by artifact facts persisted before v0.215. */
  readonly jvmFacts?: JvmFacts;
  /** Omitted only by artifact facts persisted before v0.459 Kotlin relation depth. */
  readonly kotlinFacts?: KotlinFacts;
  /** Omitted only by artifact facts persisted before v0.466 Scala relation depth. */
  readonly scalaRelationFacts?: ScalaRelationFacts;
  /** Omitted only by artifact facts persisted before v0.467 Elixir relation depth. */
  readonly elixirFacts?: ElixirFacts;
  /** Omitted only by artifact facts persisted before v0.468 Erlang relation depth. */
  readonly erlangFacts?: ErlangFacts;
  /** Omitted only by artifact facts persisted before v0.469 Clojure relation depth. */
  readonly clojureFacts?: ClojureFacts;
  /** Omitted only by artifact facts persisted before v0.470 Nix relation depth. */
  readonly nixFacts?: NixFacts;
  /** Omitted only by artifact facts persisted before v0.471 Nim relation depth. */
  readonly nimFacts?: NimFacts;
  /** Omitted only by artifact facts persisted before v0.472 Zig relation depth. */
  readonly zigFacts?: ZigFacts;
  /** Omitted only by artifact facts persisted before v0.473 C++ relation depth. */
  readonly cppFacts?: CppFacts;
  /** Omitted only by artifact facts persisted before v0.474 C relation depth. */
  readonly cFacts?: CFacts;
  /** Omitted only by artifact facts persisted before v0.475 PHP relation depth. */
  readonly phpFacts?: PhpFacts;
  /** Omitted only by artifact facts persisted before v0.476 Objective-C relation depth. */
  readonly objcFacts?: ObjcFacts;
  /** Omitted only by artifact facts persisted before v0.477 Ruby relation depth. */
  readonly rubyFacts?: RubyFacts;
  /** Omitted only by artifact facts persisted before v0.478 SQL relation depth. */
  readonly sqlFacts?: SqlFacts;
  /** Omitted only by artifact facts persisted before v0.460 Swift relation depth. */
  readonly swiftFacts?: SwiftFacts;
  /** Omitted only by artifact facts persisted before v0.461 Dart relation depth. */
  readonly dartFacts?: DartFacts;
  /** Omitted only by artifact facts persisted before v0.462 C# relation depth. */
  readonly csharpFacts?: CsharpFacts;
  /** Omitted only by artifact facts persisted before v0.463 F# relation depth. */
  readonly fsharpFacts?: FsharpFacts;
  /** Omitted only by artifact facts persisted before v0.464 OCaml relation depth. */
  readonly ocamlFacts?: OcamlFacts;
  /** Omitted only by artifact facts persisted before v0.465 Haskell relation depth. */
  readonly haskellFacts?: HaskellFacts;
  /** Omitted only by artifact facts persisted before v0.92. */
  readonly springBootPropertiesFacts?: SpringBootPropertiesFacts;
  /** Omitted only by artifact facts persisted before v0.66. */
  readonly liquidFacts?: LiquidFacts;
  /** Omitted only by artifact facts persisted before v0.67. */
  readonly solidityFacts?: SolidityFacts;
  /** Omitted only by artifact facts persisted before v0.71. */
  readonly twigFacts?: TwigFacts;
  /** Omitted only by artifact facts persisted before v0.428.0. */
  readonly jspFacts?: JspFacts;
  /** Omitted only by artifact facts persisted before v0.449.0. */
  readonly markdownFacts?: MarkdownFacts;
  /** Omitted only by artifact facts persisted before v0.483 Protocol Buffers relation depth. */
  readonly protoFacts?: ProtoFacts;
  /** Omitted only by artifact facts persisted before v0.484 GraphQL relation depth. */
  readonly graphqlFacts?: GraphqlFacts;
  /** Omitted only by artifact facts persisted before v0.481 R relation depth. */
  readonly rFacts?: RFacts;
  /** Omitted only by artifact facts persisted before v0.72. */
  readonly bladeFacts?: BladeFacts;
  /** Omitted only by artifact facts persisted before v0.168. */
  readonly cobolCicsFacts?: CobolCicsFacts;
  /** Omitted only by artifact facts persisted before v0.186. */
  readonly reactNativeFacts?: ReactNativeFacts;
  /** Omitted only by artifact facts persisted before v0.194. */
  readonly swiftObjectiveCFacts?: SwiftObjectiveCFacts;
  /** Omitted only by artifact facts persisted before v0.371. */
  readonly razorFacts?: RazorFacts;
  /** Omitted only by artifact facts persisted before v0.371 release repair. */
  readonly csharpDirectClassFacts?: readonly CsharpDirectClassFact[];
  /** Omitted only by artifact facts persisted before v0.349. */
  readonly pythonFacts?: PythonFacts;
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
