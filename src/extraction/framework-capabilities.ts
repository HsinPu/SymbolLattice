import type { ArtifactLanguage, RouteFramework, RouteRegistration } from "../domain/index.js";

/** Stable identifiers for first-party syntax extractors. */
export const FRAMEWORK_CAPABILITY_IDS = [
  "express",
  "koa",
  "hono",
  "elysia",
  "fastify",
  "nestjs",
  "react-router",
  "vue-router",
  "sveltekit",
  "astro",
  "blazor",
  "arkui",
  "terraform",
  "cics",
  "shopify-liquid",
  "twig",
  "nextjs",
  "fastapi",
  "django-ninja",
  "flask",
  "django",
  "starlette",
  "aiohttp",
  "sanic",
  "gin",
  "fiber",
  "echo",
  "iris",
  "beego",
  "gorilla-mux",
  "httprouter",
  "net-http",
  "chi",
  "goframe",
  "axum",
  "actix-web",
  "rocket",
  "spring-web",
  "micronaut",
  "jakarta-rest",
  "spring-boot-properties",
  "jvm-di",
  "laravel",
  "drupal",
  "laravel-blade",
  "civetweb",
  "lapis",
  "horse",
  "plumber",
  "phoenix",
  "cowboy",
  "compojure",
  "dancer2",
  "genie",
  "scotty",
  "dream",
  "giraffe",
  "jester",
  "cpp-httplib",
  "aspnet-core",
  "rails",
  "ktor",
  "vapor",
  "flutter",
  "react-native",
  "play"
] as const;

export type FrameworkCapabilityId = (typeof FRAMEWORK_CAPABILITY_IDS)[number];

/**
 * A deliberate, inspectable declaration of what a framework extractor can
 * prove today. It is not runtime framework detection: every extractor still
 * requires its own syntax-level evidence before emitting graph facts.
 */
export interface FrameworkCapability {
  readonly id: FrameworkCapabilityId;
  readonly languages: readonly ArtifactLanguage[];
  readonly routeFramework?: RouteFramework;
  readonly routeRegistrations: readonly RouteRegistration[];
  readonly surfaces: readonly string[];
}

/**
 * First-party framework support is declared once, then bound to the extractor
 * pass that implements it. Future framework modules can add a capability and
 * one isolated pass without widening unrelated route rules.
 */
export const FRAMEWORK_CAPABILITIES = [
  {
    id: "express",
    languages: ["typescript", "javascript"],
    routeFramework: "express",
    routeRegistrations: [],
    surfaces: ["literal HTTP receiver methods"]
  },
  {
    id: "koa",
    languages: ["typescript", "javascript"],
    routeFramework: "koa",
    routeRegistrations: [],
    surfaces: [
      "direct default @koa/router imports",
      "immutable direct new Router() receivers with literal named-handler HTTP methods"
    ]
  },
  {
    id: "hono",
    languages: ["typescript", "javascript"],
    routeFramework: "hono",
    routeRegistrations: [],
    surfaces: [
      "direct named Hono imports",
      "immutable direct new Hono() receivers with literal named-handler HTTP methods"
    ]
  },
  {
    id: "elysia",
    languages: ["typescript", "javascript"],
    routeFramework: "elysia",
    routeRegistrations: [],
    surfaces: [
      "direct named Elysia imports",
      "immutable direct new Elysia() receivers with literal named-handler HTTP methods"
    ]
  },
  {
    id: "fastify",
    languages: ["typescript", "javascript"],
    routeFramework: "fastify",
    routeRegistrations: [
      "fastify-inline-plugin-prefix",
      "fastify-local-plugin-prefix",
      "fastify-imported-plugin-prefix"
    ],
    surfaces: ["literal HTTP routes", "static plugin prefixes"]
  },
  {
    id: "nestjs",
    languages: ["typescript", "javascript"],
    routeRegistrations: [],
    surfaces: ["HTTP decorators", "GraphQL", "microservices", "WebSocket handlers"]
  },
  {
    id: "react-router",
    languages: ["typescript", "javascript"],
    routeFramework: "react-router",
    routeRegistrations: [
      "react-router-data-router",
      "react-router-create-routes-from-elements"
    ],
    surfaces: [
      "JSX Route elements",
      "createRoutesFromElements JSX trees",
      "v6.4+ data-router objects"
    ]
  },
  {
    id: "vue-router",
    languages: ["typescript", "javascript"],
    routeFramework: "vue-router",
    routeRegistrations: [],
    surfaces: [
      "exactly one direct createRouter import",
      "top-level literal createRouter routes options with named component identifiers"
    ]
  },
  {
    id: "sveltekit",
    languages: ["svelte"],
    routeFramework: "sveltekit",
    routeRegistrations: ["sveltekit-filesystem-page"],
    surfaces: ["src/routes static +page.svelte convention-derived default components"]
  },
  {
    id: "astro",
    languages: ["astro", "typescript", "javascript"],
    routeFramework: "astro",
    routeRegistrations: ["astro-filesystem-page", "astro-filesystem-endpoint"],
    surfaces: [
      "src/pages static, parameter, and final rest .astro convention-derived default components",
      "unique-config evidence-backed direct TypeScript, JavaScript, and MJS HTTP endpoint exports"
    ]
  },
  {
    id: "blazor",
    languages: ["razor"],
    routeFramework: "blazor",
    routeRegistrations: ["blazor-page-directive"],
    surfaces: [".razor conventional components", "standalone literal @page directive routes"]
  },
  {
    id: "arkui",
    languages: ["arkts"],
    routeRegistrations: [],
    surfaces: [
      "complete direct @Component struct declarations",
      "direct @Entry @Component UI root entrypoints"
    ]
  },
  {
    id: "terraform",
    languages: ["terraform"],
    routeRegistrations: [],
    surfaces: [
      "complete top-level literal resource and data blocks",
      "complete top-level literal module variable and output blocks"
    ]
  },
  {
    id: "cics",
    languages: ["cobol"],
    routeRegistrations: [],
    surfaces: [
      "direct literal EXEC CICS RETURN and START TRANSID commands",
      "unique TRAN-named direct COBOL transaction-owner declarations"
    ]
  },
  {
    id: "shopify-liquid",
    languages: ["liquid"],
    routeRegistrations: [],
    surfaces: [
      "complete direct literal render and include snippet tags",
      "complete direct literal section tags resolved against indexed local Liquid files"
    ]
  },
  {
    id: "twig",
    languages: ["twig"],
    routeRegistrations: [],
    surfaces: [
      "complete direct literal extends include and embed template tags",
      "complete direct literal import and from macro tags resolved against indexed templates root files"
    ]
  },
  {
    id: "nextjs",
    languages: ["typescript", "javascript"],
    routeFramework: "nextjs",
    routeRegistrations: ["nextjs-pages-router", "nextjs-app-router"],
    surfaces: ["Pages Router default exports", "App Router page default exports"]
  },
  {
    id: "fastapi",
    languages: ["python"],
    routeFramework: "fastapi",
    routeRegistrations: [],
    surfaces: [
      "direct FastAPI application decorators",
      "same-file APIRouter decorators through direct include_router",
      "package-relative imported APIRouter decorators through direct include_router prefixes",
      "project-root absolute imported APIRouter decorators through direct include_router prefixes",
      "final package-initializer APIRouter re-export chains through package-relative imports",
      "top-level named local function handlers"
    ]
  },
  {
    id: "django-ninja",
    languages: ["python"],
    routeFramework: "django-ninja",
    routeRegistrations: [],
    surfaces: [
      "direct NinjaAPI application decorators with literal paths",
      "same-file direct Router decorators through literal NinjaAPI add_router prefixes",
      "literal api_operation method arrays on direct applications and mounted same-file Routers",
      "package-relative imported Router decorators and api_operation arrays through direct add_router prefixes",
      "project-root absolute imported Router decorators and api_operation arrays through direct add_router prefixes",
      "final package-initializer Router re-export chains through package-relative or project-root absolute imports",
      "top-level named local function handlers"
    ]
  },
  {
    id: "flask",
    languages: ["python"],
    routeFramework: "flask",
    routeRegistrations: [],
    surfaces: [
      "direct Flask application decorators",
      "same-file Blueprint decorators through direct register_blueprint",
      "package-relative imported Blueprint decorators through direct register_blueprint"
    ]
  },
  {
    id: "django",
    languages: ["python"],
    routeFramework: "django",
    routeRegistrations: [],
    surfaces: [
      "direct django.urls path imports",
      "final literal urlpatterns lists with same-file top-level function handlers",
      "package-relative imported URLConfs through direct path and include composition"
    ]
  },
  {
    id: "starlette",
    languages: ["python"],
    routeFramework: "starlette",
    routeRegistrations: [],
    surfaces: [
      "direct Starlette applications with literal Route lists",
      "same-file top-level function endpoints"
    ]
  },
  {
    id: "aiohttp",
    languages: ["python"],
    routeFramework: "aiohttp",
    routeRegistrations: [],
    surfaces: [
      "direct aiohttp.web Application router registrations",
      "literal aiohttp.web route tables through direct router add_routes",
      "same-file top-level function handlers"
    ]
  },
  {
    id: "sanic",
    languages: ["python"],
    routeFramework: "sanic",
    routeRegistrations: [],
    surfaces: [
      "direct Sanic application decorators",
      "direct Sanic Blueprint decorators mounted through direct application registration",
      "same-file top-level function handlers"
    ]
  },
  {
    id: "gin",
    languages: ["go"],
    routeFramework: "gin",
    routeRegistrations: [],
    surfaces: [
      "direct Gin engine methods",
      "same-function literal RouterGroup prefixes"
    ]
  },
  {
    id: "fiber",
    languages: ["go"],
    routeFramework: "fiber",
    routeRegistrations: [],
    surfaces: [
      "direct Fiber v2/v3 App methods",
      "same-function literal Router Group prefixes"
    ]
  },
  {
    id: "echo",
    languages: ["go"],
    routeFramework: "echo",
    routeRegistrations: [],
    surfaces: [
      "direct Echo v4/v5 App methods",
      "same-function literal Group prefixes"
    ]
  },
  {
    id: "iris",
    languages: ["go"],
    routeFramework: "iris",
    routeRegistrations: [],
    surfaces: [
      "direct Iris v12 Application/Party HTTP methods and Handle registrations",
      "same-function literal Party prefixes"
    ]
  },
  {
    id: "beego",
    languages: ["go"],
    routeFramework: "beego",
    routeRegistrations: [],
    surfaces: [
      "direct Beego v2 web package functional HTTP registrations",
      "literal direct named-function handlers"
    ]
  },
  {
    id: "gorilla-mux",
    languages: ["go"],
    routeFramework: "gorilla-mux",
    routeRegistrations: [],
    surfaces: [
      "direct mux.NewRouter HandleFunc registrations",
      "literal direct named-function handlers with optional literal Methods chains"
    ]
  },
  {
    id: "httprouter",
    languages: ["go"],
    routeFramework: "httprouter",
    routeRegistrations: [],
    surfaces: [
      "direct httprouter.New router HTTP methods",
      "literal direct named-function HTTP handle registrations"
    ]
  },
  {
    id: "net-http",
    languages: ["go"],
    routeFramework: "net-http",
    routeRegistrations: [],
    surfaces: [
      "direct http.HandleFunc registrations",
      "same-function literal ServeMux HandleFunc registrations"
    ]
  },
  {
    id: "chi",
    languages: ["go"],
    routeFramework: "chi",
    routeRegistrations: [],
    surfaces: [
      "direct chi.NewRouter and chi.NewMux router methods",
      "literal direct named-handler HTTP registrations"
    ]
  },
  {
    id: "goframe",
    languages: ["go"],
    routeFramework: "goframe",
    routeRegistrations: [],
    surfaces: [
      "direct g.Server BindHandler, BindObjectMethod, selected BindObject, or BindObjectRest literal rules and static or callback Group HTTP-method literal rules with named local functions or direct local object methods",
      "direct or variable g.Server.Domain literal BindHandler, BindObjectMethod, selected BindObject, or BindObjectRest rules with exact non-wildcard domain evidence",
      "literal g.Map batch rules and ALLMap paths on static or callback Groups with named local functions or direct local object methods",
      "same-file and root-go.mod cross-package standard-router g.Meta request metadata with one or more independently statically proven direct controller, direct controller pointer alias from a short or matching-pointer var initializer, or no-argument factory Bind arguments, including one non-rebound local factory alias from a short or untyped var initializer, plus unbound unique request-signature candidates marked heuristic"
    ]
  },
  {
    id: "axum",
    languages: ["rust"],
    routeFramework: "axum",
    routeRegistrations: [],
    surfaces: [
      "direct imported Router::new literal route builder chains",
      "direct imported method-router named local handlers"
    ]
  },
  {
    id: "actix-web",
    languages: ["rust"],
    routeFramework: "actix-web",
    routeRegistrations: [],
    surfaces: [
      "direct imported HTTP attribute macros with direct same-file service or ServiceConfig mounts",
      "literal attribute paths on direct top-level function handlers",
      "direct imported App::new, web resource, web scope, and ServiceConfig builder chains",
      "literal direct app, resource, scope, mounted attribute-service, and configured ServiceConfig routes with named local handlers"
    ]
  },
  {
    id: "rocket",
    languages: ["rust"],
    routeFramework: "rocket",
    routeRegistrations: [],
    surfaces: [
      "direct imported HTTP attribute macros",
      "literal attribute paths on direct top-level function handlers"
    ]
  },
  {
    id: "spring-web",
    languages: ["java", "kotlin"],
    routeFramework: "spring-web",
    routeRegistrations: [],
    surfaces: [
      "direct imported or fully-qualified Spring controller annotations",
      "one or more literal class-level paths and HTTP-method mapping annotations, including one or more exact RequestMapping method enums, on direct local Java methods or concrete Kotlin functions"
    ]
  },
  {
    id: "micronaut",
    languages: ["java"],
    routeFramework: "micronaut",
    routeRegistrations: [],
    surfaces: [
      "direct imported or fully-qualified Micronaut Controller annotations",
      "literal class and HTTP-method mapping annotations on direct local methods"
    ]
  },
  {
    id: "jakarta-rest",
    languages: ["java"],
    routeFramework: "jakarta-rest",
    routeRegistrations: [],
    surfaces: [
      "direct imported or fully-qualified Jakarta REST and legacy JAX-RS Path annotations",
      "literal Path declarations with direct local HTTP request-method annotations"
    ]
  },
  {
    id: "spring-boot-properties",
    languages: ["java", "kotlin", "properties", "yaml"],
    routeRegistrations: [],
    surfaces: [
      "direct imported or fully-qualified @Value literal-key annotations on direct Java fields, constructor parameters, concrete-method parameters, or qualifying one-parameter concrete methods, or Kotlin class properties, primary-constructor parameters, concrete-method parameters, or qualifying one-parameter concrete methods",
      "direct imported or fully-qualified @Value literal-key annotations on direct top-level Java record components",
      "direct imported or fully-qualified @Value literal-key annotations on direct top-level Kotlin object properties, concrete-method parameters, or qualifying one-parameter concrete methods",
      "direct imported or fully-qualified @ConfigurationProperties literal-prefix annotations on direct Java or Kotlin classes",
      "direct imported or fully-qualified @ConfigurationProperties literal-prefix annotations on direct top-level Java records",
      "direct concrete Java or Kotlin @Bean methods in direct @Configuration classes when all Spring annotations are exact imported or fully-qualified and the prefix is literal",
      "Kotlin regular-string placeholders with an explicit escaped dollar sign",
      "unique literal keys in conventional application or bootstrap properties or YAML files",
      "case/dash/underscore relaxed-key fallback only when one canonical configuration candidate exists",
      "direct nested YAML mapping leaves without anchors, tags, sequences, aliases, nulls, or multiline scalars"
    ]
  },
  {
    id: "jvm-di",
    languages: ["java", "kotlin"],
    routeRegistrations: [],
    surfaces: [
      "direct imported or fully-qualified Spring @Autowired constructor, field, mutable Kotlin @set: setter, and concrete-method parameter injection points",
      "direct imported or fully-qualified Jakarta/Javax @Inject constructor, field, mutable Kotlin @set: setter, and concrete-method parameter injection points",
      "direct imported or fully-qualified bare or empty Jakarta/Javax @Resource fields, JavaBean setters, and mutable Kotlin @set: setters",
      "unique project-local declared injection types without runtime provider, qualifier, or JNDI name/lookup/type inference"
    ]
  },
  {
    id: "laravel",
    languages: ["php"],
    routeFramework: "laravel",
    routeRegistrations: [],
    surfaces: [
      "direct imported or fully-qualified Route facade calls",
      "literal controller-action arrays with same-file exact method evidence"
    ]
  },
  {
    id: "drupal",
    languages: ["yaml"],
    routeFramework: "drupal",
    routeRegistrations: [],
    surfaces: [
      "single-document module.routing.yml literal path mappings",
      "direct Drupal FQCN controller methods with static _method requirements"
    ]
  },
  {
    id: "laravel-blade",
    languages: ["blade"],
    routeRegistrations: [],
    surfaces: [
      "complete direct literal extends and include view directives",
      "complete direct literal component and each view directives resolved against indexed Laravel resources/views files"
    ]
  },
  {
    id: "civetweb",
    languages: ["c"],
    routeFramework: "civetweb",
    routeRegistrations: [],
    surfaces: [
      "direct civetweb.h request-handler registration",
      "literal URI routes with unique unshadowed local function handlers"
    ]
  },
  {
    id: "lapis",
    languages: ["lua"],
    routeFramework: "lapis",
    routeRegistrations: [],
    surfaces: [
      "direct require(\"lapis\") and Application local bindings",
      "literal direct get/post/put/delete/match routes with unique unshadowed local function handlers"
    ]
  },
  {
    id: "horse",
    languages: ["pascal"],
    routeFramework: "horse",
    routeRegistrations: [],
    surfaces: [
      "exactly one direct uses Horse proof",
      "direct program-main-block THorse Get/Post literal routes with unique prior same-file routine handlers"
    ]
  },
  {
    id: "plumber",
    languages: ["r"],
    routeFramework: "plumber",
    routeRegistrations: [],
    surfaces: [
      "standalone #* or #' HTTP annotations",
      "literal routes immediately followed by top-level braced anonymous function handlers"
    ]
  },
  {
    id: "phoenix",
    languages: ["elixir"],
    routeFramework: "phoenix",
    routeRegistrations: [],
    surfaces: [
      "direct use Phoenix.Router module bindings",
      "literal scope-composed HTTP verb routes with full-module controller atom actions"
    ]
  },
  {
    id: "cowboy",
    languages: ["erlang"],
    routeFramework: "cowboy",
    routeRegistrations: [],
    surfaces: [
      "direct cowboy_router:compile literal wildcard-host dispatch lists",
      "literal three-item routes with same-module exported init/2 callback proof"
    ]
  },
  {
    id: "compojure",
    languages: ["clojure"],
    routeFramework: "compojure",
    routeRegistrations: [],
    surfaces: [
      "direct ns compojure.core refer proof",
      "direct defroutes literal verb routes with same-file named defn handler proof"
    ]
  },
  {
    id: "dancer2",
    languages: ["perl"],
    routeFramework: "dancer2",
    routeRegistrations: [],
    surfaces: [
      "direct use Dancer2 proof",
      "direct literal verb routes with same-file named sub coderef handler proof"
    ]
  },
  {
    id: "genie",
    languages: ["julia"],
    routeFramework: "genie",
    routeRegistrations: [],
    surfaces: [
      "direct using Genie proof",
      "direct literal named-handler routes with optional literal method proof"
    ]
  },
  {
    id: "scotty",
    languages: ["haskell"],
    routeFramework: "scotty",
    routeRegistrations: [],
    surfaces: [
      "direct import Web.Scotty proof",
      "direct literal-port scotty do blocks with literal named-handler routes"
    ]
  },
  {
    id: "dream",
    languages: ["ocaml"],
    routeFramework: "dream",
    routeRegistrations: [],
    surfaces: [
      "direct top-level Dream.router literal lists",
      "direct literal named-handler HTTP routes"
    ]
  },
  {
    id: "giraffe",
    languages: ["fsharp"],
    routeFramework: "giraffe",
    routeRegistrations: [],
    surfaces: [
      "exactly one direct open Giraffe proof",
      "direct top-level choose literal routes with typed local named handlers"
    ]
  },
  {
    id: "jester",
    languages: ["nim"],
    routeFramework: "jester",
    routeRegistrations: [],
    surfaces: [
      "exactly one direct top-level import list containing jester",
      "direct top-level routes or router literal blocks with one named local proc call"
    ]
  },
  {
    id: "cpp-httplib",
    languages: ["cpp"],
    routeFramework: "cpp-httplib",
    routeRegistrations: [],
    surfaces: [
      "direct httplib::Server or httplib::SSLServer local bindings",
      "literal direct named-handler HTTP methods in one local function body"
    ]
  },
  {
    id: "aspnet-core",
    languages: ["csharp"],
    routeFramework: "aspnet-core",
    routeRegistrations: [],
    surfaces: [
      "direct WebApplication builder bindings with literal Map routes",
      "direct MVC ApiController Route and Http method attributes"
    ]
  },
  {
    id: "rails",
    languages: ["ruby"],
    routeFramework: "rails",
    routeRegistrations: [],
    surfaces: [
      "direct Rails.application.routes.draw blocks",
      "literal direct verb routes with controller-action strings",
      "literal direct resources/resource RESTful declarations with only/except action filters",
      "unique conventional app/controllers class-method route handler resolution"
    ]
  },
  {
    id: "ktor",
    languages: ["kotlin"],
    routeFramework: "ktor",
    routeRegistrations: [],
    surfaces: [
      "direct Application.module routing blocks",
      "literal direct verb routes with local callable-reference handlers"
    ]
  },
  {
    id: "vapor",
    languages: ["swift"],
    routeFramework: "vapor",
    routeRegistrations: [],
    surfaces: [
      "direct routes(_ app: Application) functions",
      "literal direct verb routes with same-file named handlers"
    ]
  },
  {
    id: "flutter",
    languages: ["dart"],
    routeFramework: "flutter",
    routeRegistrations: [],
    surfaces: [
      "direct MaterialApp literal routes maps",
      "same-file literal widget-builder classes"
    ]
  },
  {
    id: "react-native",
    languages: ["typescript", "javascript", "java", "kotlin", "objc"],
    routeRegistrations: [],
    surfaces: [
      "direct react-native NativeModules named or namespace imports with literal module and method calls",
      "direct TurboModuleRegistry named or namespace imports with literal registry bindings, calls, and exported TypeScript specs",
      "cross-file default-import TurboModule calls through a resolved local default export or static default re-export chain anchored at a literal registry result",
      "direct Android ReactContextBaseJavaModule classes with direct literal or class-local constant getName values and direct ReactMethod annotations, plus directly imported or fully-qualified Codegen Spec subclasses with direct override methods only after a unique TypeScript TurboModule contract",
      "direct Objective-C RCTBridgeModule imports with one explicit or RCT/RK-default RCT_EXPORT_MODULE and direct RCT_EXPORT_METHOD/RCT_REMAP_METHOD macros"
    ]
  },
  {
    id: "play",
    languages: ["scala"],
    routeFramework: "play",
    routeRegistrations: [],
    surfaces: [
      "direct conf/routes literal HTTP entries",
      "explicit unresolved controller-action handlers"
    ]
  }
] as const satisfies readonly FrameworkCapability[];

/** Returns the registered capability or fails fast if an extractor is miswired. */
export function frameworkCapability(id: FrameworkCapabilityId): FrameworkCapability {
  const capability = FRAMEWORK_CAPABILITIES.find((candidate) => candidate.id === id);
  if (capability === undefined) {
    throw new Error(`Missing framework capability: ${id}`);
  }
  return capability;
}
