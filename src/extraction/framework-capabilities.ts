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
  "spring-web"
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
