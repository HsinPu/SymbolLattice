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
    expect(frameworkCapability("chi")).toMatchObject({
      languages: ["go"],
      routeFramework: "chi",
      routeRegistrations: [],
      surfaces: [
        "direct chi.NewRouter and chi.NewMux router methods",
        "literal direct named-handler HTTP registrations"
      ]
    });
    expect(frameworkCapability("axum")).toMatchObject({
      languages: ["rust"],
      routeFramework: "axum",
      routeRegistrations: [],
      surfaces: [
        "direct imported Router::new literal route builder chains",
        "direct imported method-router named local handlers"
      ]
    });
    expect(frameworkCapability("spring-web")).toMatchObject({
      languages: ["java"],
      routeFramework: "spring-web",
      routeRegistrations: [],
      surfaces: [
        "direct imported or fully-qualified Spring controller annotations",
        "literal class and HTTP-method mapping annotations on direct local methods"
      ]
    });
    expect(frameworkCapability("laravel")).toMatchObject({
      languages: ["php"],
      routeFramework: "laravel",
      routeRegistrations: [],
      surfaces: [
        "direct imported or fully-qualified Route facade calls",
        "literal controller-action arrays with same-file exact method evidence"
      ]
    });
    expect(frameworkCapability("civetweb")).toMatchObject({
      languages: ["c"],
      routeFramework: "civetweb",
      routeRegistrations: [],
      surfaces: [
        "direct civetweb.h request-handler registration",
        "literal URI routes with unique unshadowed local function handlers"
      ]
    });
    expect(frameworkCapability("lapis")).toMatchObject({
      languages: ["lua"],
      routeFramework: "lapis",
      routeRegistrations: [],
      surfaces: [
        'direct require("lapis") and Application local bindings',
        "literal direct get/post/put/delete/match routes with unique unshadowed local function handlers"
      ]
    });
    expect(frameworkCapability("plumber")).toMatchObject({
      languages: ["r"],
      routeFramework: "plumber",
      routeRegistrations: [],
      surfaces: [
        "standalone #* or #' HTTP annotations",
        "literal routes immediately followed by top-level braced anonymous function handlers"
      ]
    });
    expect(frameworkCapability("cpp-httplib")).toMatchObject({
      languages: ["cpp"],
      routeFramework: "cpp-httplib",
      routeRegistrations: [],
      surfaces: [
        "direct httplib::Server or httplib::SSLServer local bindings",
        "literal direct named-handler HTTP methods in one local function body"
      ]
    });
    expect(frameworkCapability("aspnet-core")).toMatchObject({
      languages: ["csharp"],
      routeFramework: "aspnet-core",
      routeRegistrations: [],
      surfaces: [
        "direct WebApplication builder bindings with literal Map routes",
        "direct MVC ApiController Route and Http method attributes"
      ]
    });
    expect(frameworkCapability("rails")).toMatchObject({
      languages: ["ruby"],
      routeFramework: "rails",
      routeRegistrations: [],
      surfaces: [
        "direct Rails.application.routes.draw blocks",
        "literal direct verb routes with controller-action strings"
      ]
    });
    expect(frameworkCapability("ktor")).toMatchObject({
      languages: ["kotlin"],
      routeFramework: "ktor",
      routeRegistrations: [],
      surfaces: [
        "direct Application.module routing blocks",
        "literal direct verb routes with local callable-reference handlers"
      ]
    });
    expect(frameworkCapability("vapor")).toMatchObject({
      languages: ["swift"],
      routeFramework: "vapor",
      routeRegistrations: [],
      surfaces: [
        "direct routes(_ app: Application) functions",
        "literal direct verb routes with same-file named handlers"
      ]
    });
    expect(frameworkCapability("flutter")).toMatchObject({
      languages: ["dart"],
      routeFramework: "flutter",
      routeRegistrations: [],
      surfaces: [
        "direct MaterialApp literal routes maps",
        "same-file literal widget-builder classes"
      ]
    });
    expect(frameworkCapability("play")).toMatchObject({
      languages: ["scala"],
      routeFramework: "play",
      routeRegistrations: [],
      surfaces: [
        "direct conf/routes literal HTTP entries",
        "explicit unresolved controller-action handlers"
      ]
    });
  });
});
