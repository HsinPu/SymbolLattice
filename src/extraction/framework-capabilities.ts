import type { ArtifactLanguage, RouteFramework, RouteRegistration } from "../domain/index.js";

/** Stable identifiers for first-party syntax extractors. */
export const FRAMEWORK_CAPABILITY_IDS = [
  "express",
  "fastify",
  "nestjs",
  "react-router",
  "nextjs",
  "fastapi",
  "flask",
  "gin",
  "net-http",
  "chi",
  "axum",
  "spring-web",
  "laravel",
  "civetweb",
  "lapis",
  "plumber",
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
