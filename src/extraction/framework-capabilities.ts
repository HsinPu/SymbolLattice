import type { ArtifactLanguage, RouteFramework, RouteRegistration } from "../domain/index.js";

/** Stable identifiers for first-party syntax extractors. */
export const FRAMEWORK_CAPABILITY_IDS = [
  "express",
  "fastify",
  "nestjs",
  "react-router",
  "vue-router",
  "sveltekit",
  "astro",
  "blazor",
  "arkui",
  "terraform",
  "shopify-liquid",
  "twig",
  "nextjs",
  "fastapi",
  "flask",
  "django",
  "gin",
  "net-http",
  "chi",
  "axum",
  "spring-web",
  "laravel",
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
    languages: ["astro"],
    routeFramework: "astro",
    routeRegistrations: ["astro-filesystem-page"],
    surfaces: ["src/pages static .astro convention-derived default components"]
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
      "same-file APIRouter decorators through direct include_router"
    ]
  },
  {
    id: "flask",
    languages: ["python"],
    routeFramework: "flask",
    routeRegistrations: [],
    surfaces: [
      "direct Flask application decorators",
      "same-file Blueprint decorators through direct register_blueprint"
    ]
  },
  {
    id: "django",
    languages: ["python"],
    routeFramework: "django",
    routeRegistrations: [],
    surfaces: [
      "direct django.urls path imports",
      "final literal urlpatterns lists with same-file top-level function handlers"
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
    id: "spring-web",
    languages: ["java"],
    routeFramework: "spring-web",
    routeRegistrations: [],
    surfaces: [
      "direct imported or fully-qualified Spring controller annotations",
      "literal class and HTTP-method mapping annotations on direct local methods"
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
      "literal direct verb routes with controller-action strings"
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
