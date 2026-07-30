import type { ArtifactLanguage, RouteFramework, RouteRegistration } from "../domain/index.js";

/** Stable identifiers for first-party syntax extractors. */
export const FRAMEWORK_CAPABILITY_IDS = [
  "express",
  "fastify",
  "nestjs",
  "react-router",
  "nextjs"
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
    routeRegistrations: ["react-router-data-router"],
    surfaces: ["JSX Route elements", "v6.4+ data-router objects"]
  },
  {
    id: "nextjs",
    languages: ["typescript", "javascript"],
    routeFramework: "nextjs",
    routeRegistrations: ["nextjs-pages-router", "nextjs-app-router"],
    surfaces: ["Pages Router default exports", "App Router page default exports"]
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
