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
export const ARTIFACT_FACTS_EXTRACTOR_VERSION = "multi-language-ast-v189";

/**
 * Bump this value whenever cross-file resolution semantics change in a way
 * that requires a fresh graph projection from persisted facts.
 */
export const PROJECT_RESOLVER_VERSION = "project-resolver-v75";

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
  /** Exact host condition of a literal HTTP route registration, when one exists. */
  readonly routeDomain?: string;
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

/** A final, single-name relative APIRouter export from a package initializer. */
export interface FastApiRouterReExportFact {
  readonly exportedName: string;
  readonly importedRouterName: string;
  readonly moduleSpecifier: string;
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

/**
 * A direct, single-name, package-relative Router import mounted through a
 * direct Django Ninja application's literal `add_router` call.
 */
export interface DjangoNinjaImportedRouterInclusionFact {
  readonly applicationName: string;
  readonly routerName: string;
  readonly importedRouterName: string;
  readonly moduleSpecifier: string;
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

/** A final, single-name relative Blueprint export from a package initializer. */
export interface FlaskBlueprintReExportFact {
  readonly exportedName: string;
  readonly importedBlueprintName: string;
  readonly moduleSpecifier: string;
  readonly range: SourceRange;
}

/**
 * A direct, single-name, package-relative Blueprint import mounted through a
 * direct Flask application's literal `register_blueprint` call.
 */
export interface FlaskImportedBlueprintRegistrationFact {
  readonly applicationName: string;
  readonly blueprintName: string;
  readonly importedBlueprintName: string;
  readonly moduleSpecifier: string;
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
 * A top-level Java or Kotlin type whose package declaration was parsed without
 * recovery. The project resolver uses this identity only for direct JVM
 * inheritance facts; it does not model a compiler classpath or nested types.
 */
export interface JvmTypeFact {
  readonly symbolId: string;
  readonly packageName: string;
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

/** Syntax-only JVM package, import, heritage, and DI-point facts for project resolution. */
export interface JvmFacts {
  readonly types: readonly JvmTypeFact[];
  readonly heritageReferences: readonly JvmHeritageReferenceFact[];
  /** Omitted only by artifact facts persisted before v0.220. */
  readonly dependencyInjectionReferences?: readonly JvmDependencyInjectionReferenceFact[];
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
  /** Omitted only by artifact facts persisted before v0.97. */
  readonly nestGraphqlFacts?: NestGraphqlFacts;
  /** Omitted only by artifact facts persisted before v0.22. */
  readonly fastifyPluginFacts?: FastifyPluginFacts;
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
  /** Omitted only by artifact facts persisted before v0.118. */
  readonly rustActixServiceConfigFacts?: RustActixServiceConfigFacts;
  /** Omitted only by artifact facts persisted before v0.46. */
  readonly scalaFacts?: ScalaFacts;
  /** Omitted only by artifact facts persisted before v0.47. */
  readonly javaFacts?: JavaFacts;
  /** Omitted only by artifact facts persisted before v0.215. */
  readonly jvmFacts?: JvmFacts;
  /** Omitted only by artifact facts persisted before v0.92. */
  readonly springBootPropertiesFacts?: SpringBootPropertiesFacts;
  /** Omitted only by artifact facts persisted before v0.66. */
  readonly liquidFacts?: LiquidFacts;
  /** Omitted only by artifact facts persisted before v0.67. */
  readonly solidityFacts?: SolidityFacts;
  /** Omitted only by artifact facts persisted before v0.71. */
  readonly twigFacts?: TwigFacts;
  /** Omitted only by artifact facts persisted before v0.72. */
  readonly bladeFacts?: BladeFacts;
  /** Omitted only by artifact facts persisted before v0.168. */
  readonly cobolCicsFacts?: CobolCicsFacts;
  /** Omitted only by artifact facts persisted before v0.186. */
  readonly reactNativeFacts?: ReactNativeFacts;
  /** Omitted only by artifact facts persisted before v0.194. */
  readonly swiftObjectiveCFacts?: SwiftObjectiveCFacts;
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
