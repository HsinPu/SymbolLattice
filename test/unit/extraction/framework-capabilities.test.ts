import { describe, expect, it } from "vitest";

import {
  FRAMEWORK_CAPABILITIES,
  FRAMEWORK_CAPABILITY_IDS,
  frameworkCapability
} from "../../../src/extraction/index.js";

describe("first-party framework capabilities", () => {
  it("declares one executable capability for every registered extractor", () => {
    expect(FRAMEWORK_CAPABILITY_IDS).toEqual([
      "express",
      "fastify",
      "nestjs",
      "react-router",
      "nextjs",
      "fastapi",
      "flask",
      "gin",
      "net-http"
    ]);
    expect(FRAMEWORK_CAPABILITIES.map((capability) => capability.id)).toEqual(
      FRAMEWORK_CAPABILITY_IDS
    );
    expect(frameworkCapability("react-router")).toMatchObject({
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
    });
    expect(frameworkCapability("nextjs")).toMatchObject({
      languages: ["typescript", "javascript"],
      routeFramework: "nextjs",
      routeRegistrations: ["nextjs-pages-router", "nextjs-app-router"],
      surfaces: ["Pages Router default exports", "App Router page default exports"]
    });
    expect(frameworkCapability("fastapi")).toMatchObject({
      languages: ["python"],
      routeFramework: "fastapi",
      routeRegistrations: [],
      surfaces: [
        "direct FastAPI application decorators",
        "same-file APIRouter decorators through direct include_router"
      ]
    });
    expect(frameworkCapability("flask")).toMatchObject({
      languages: ["python"],
      routeFramework: "flask",
      routeRegistrations: [],
      surfaces: [
        "direct Flask application decorators",
        "same-file Blueprint decorators through direct register_blueprint"
      ]
    });
    expect(frameworkCapability("gin")).toMatchObject({
      languages: ["go"],
      routeFramework: "gin",
      routeRegistrations: [],
      surfaces: [
        "direct Gin engine methods",
        "same-function literal RouterGroup prefixes"
      ]
    });
    expect(frameworkCapability("net-http")).toMatchObject({
      languages: ["go"],
      routeFramework: "net-http",
      routeRegistrations: [],
      surfaces: [
        "direct http.HandleFunc registrations",
        "same-function literal ServeMux HandleFunc registrations"
      ]
    });
  });
});
