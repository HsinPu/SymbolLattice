import type {
  ArtifactLanguage,
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
export const ARTIFACT_FACTS_EXTRACTOR_VERSION = "multi-language-ast-v43";

/**
 * Bump this value whenever cross-file resolution semantics change in a way
 * that requires a fresh graph projection from persisted facts.
 */
export const PROJECT_RESOLVER_VERSION = "project-resolver-v16";

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

/**
 * A direct, single-name, package-relative import mounted through a direct
 * FastAPI application's literal `include_router` call.
 */
export interface FastApiImportedRouterInclusionFact {
  readonly applicationName: string;
  readonly routerName: string;
  readonly importedRouterName: string;
  readonly moduleSpecifier: string;
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
  readonly importedRouterInclusions: readonly FastApiImportedRouterInclusionFact[];
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

/** Syntax-only Java package facts retained for exact Play controller-action resolution. */
export interface JavaFacts {
  readonly classes: readonly JavaClassFact[];
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
  /** Omitted only by artifact facts persisted before v0.17. */
  readonly nestRouteFacts?: NestRouteFacts;
  /** Omitted only by artifact facts persisted before v0.22. */
  readonly fastifyPluginFacts?: FastifyPluginFacts;
  /** Omitted only by artifact facts persisted before v0.31. */
  readonly fastApiRouterFacts?: FastApiRouterFacts;
  /** Omitted only by artifact facts persisted before v0.46. */
  readonly scalaFacts?: ScalaFacts;
  /** Omitted only by artifact facts persisted before v0.47. */
  readonly javaFacts?: JavaFacts;
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
