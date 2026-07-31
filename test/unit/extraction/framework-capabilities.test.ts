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
      "shopify-liquid",
      "twig",
      "nextjs",
      "fastapi",
      "flask",
      "django",
      "gin",
      "fiber",
      "echo",
      "net-http",
      "chi",
      "axum",
      "spring-web",
      "micronaut",
      "jakarta-rest",
      "spring-boot-properties",
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
      "play"
    ]);
    expect(FRAMEWORK_CAPABILITIES.map((capability) => capability.id)).toEqual(
      FRAMEWORK_CAPABILITY_IDS
    );
    expect(frameworkCapability("koa")).toMatchObject({
      languages: ["typescript", "javascript"],
      routeFramework: "koa",
      routeRegistrations: [],
      surfaces: [
        "direct default @koa/router imports",
        "immutable direct new Router() receivers with literal named-handler HTTP methods"
      ]
    });
    expect(frameworkCapability("hono")).toMatchObject({
      languages: ["typescript", "javascript"],
      routeFramework: "hono",
      routeRegistrations: [],
      surfaces: [
        "direct named Hono imports",
        "immutable direct new Hono() receivers with literal named-handler HTTP methods"
      ]
    });
    expect(frameworkCapability("elysia")).toMatchObject({
      languages: ["typescript", "javascript"],
      routeFramework: "elysia",
      routeRegistrations: [],
      surfaces: [
        "direct named Elysia imports",
        "immutable direct new Elysia() receivers with literal named-handler HTTP methods"
      ]
    });
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
    expect(frameworkCapability("vue-router")).toMatchObject({
      languages: ["typescript", "javascript"],
      routeFramework: "vue-router",
      routeRegistrations: [],
      surfaces: [
        "exactly one direct createRouter import",
        "top-level literal createRouter routes options with named component identifiers"
      ]
    });
    expect(frameworkCapability("sveltekit")).toMatchObject({
      languages: ["svelte"],
      routeFramework: "sveltekit",
      routeRegistrations: ["sveltekit-filesystem-page"],
      surfaces: ["src/routes static +page.svelte convention-derived default components"]
    });
    expect(frameworkCapability("astro")).toMatchObject({
      languages: ["astro"],
      routeFramework: "astro",
      routeRegistrations: ["astro-filesystem-page"],
      surfaces: ["src/pages static .astro convention-derived default components"]
    });
    expect(frameworkCapability("blazor")).toMatchObject({
      languages: ["razor"],
      routeFramework: "blazor",
      routeRegistrations: ["blazor-page-directive"],
      surfaces: [".razor conventional components", "standalone literal @page directive routes"]
    });
    expect(frameworkCapability("arkui")).toMatchObject({
      languages: ["arkts"],
      routeRegistrations: [],
      surfaces: [
        "complete direct @Component struct declarations",
        "direct @Entry @Component UI root entrypoints"
      ]
    });
    expect(frameworkCapability("terraform")).toMatchObject({
      languages: ["terraform"],
      routeRegistrations: [],
      surfaces: [
        "complete top-level literal resource and data blocks",
        "complete top-level literal module variable and output blocks"
      ]
    });
    expect(frameworkCapability("shopify-liquid")).toMatchObject({
      languages: ["liquid"],
      routeRegistrations: [],
      surfaces: [
        "complete direct literal render and include snippet tags",
        "complete direct literal section tags resolved against indexed local Liquid files"
      ]
    });
    expect(frameworkCapability("twig")).toMatchObject({
      languages: ["twig"],
      routeRegistrations: [],
      surfaces: [
        "complete direct literal extends include and embed template tags",
        "complete direct literal import and from macro tags resolved against indexed templates root files"
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
        "same-file Blueprint decorators through direct register_blueprint",
        "package-relative imported Blueprint decorators through direct register_blueprint"
      ]
    });
    expect(frameworkCapability("django")).toMatchObject({
      languages: ["python"],
      routeFramework: "django",
      routeRegistrations: [],
      surfaces: [
        "direct django.urls path imports",
        "final literal urlpatterns lists with same-file top-level function handlers",
        "package-relative imported URLConfs through direct path and include composition"
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
    expect(frameworkCapability("fiber")).toMatchObject({
      languages: ["go"],
      routeFramework: "fiber",
      routeRegistrations: [],
      surfaces: [
        "direct Fiber v2/v3 App methods",
        "same-function literal Router Group prefixes"
      ]
    });
    expect(frameworkCapability("echo")).toMatchObject({
      languages: ["go"],
      routeFramework: "echo",
      routeRegistrations: [],
      surfaces: [
        "direct Echo v4/v5 App methods",
        "same-function literal Group prefixes"
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
    expect(frameworkCapability("micronaut")).toMatchObject({
      languages: ["java"],
      routeFramework: "micronaut",
      routeRegistrations: [],
      surfaces: [
        "direct imported or fully-qualified Micronaut Controller annotations",
        "literal class and HTTP-method mapping annotations on direct local methods"
      ]
    });
    expect(frameworkCapability("jakarta-rest")).toMatchObject({
      languages: ["java"],
      routeFramework: "jakarta-rest",
      routeRegistrations: [],
      surfaces: [
        "direct imported or fully-qualified Jakarta REST and legacy JAX-RS Path annotations",
        "literal Path declarations with direct local HTTP request-method annotations"
      ]
    });
    expect(frameworkCapability("spring-boot-properties")).toMatchObject({
      languages: ["java", "properties"],
      routeRegistrations: [],
      surfaces: [
        "direct imported or fully-qualified @Value literal-key annotations on direct Java fields",
        "unique literal keys in conventional application or bootstrap properties files"
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
    expect(frameworkCapability("drupal")).toMatchObject({
      languages: ["yaml"],
      routeFramework: "drupal",
      routeRegistrations: [],
      surfaces: [
        "single-document module.routing.yml literal path mappings",
        "direct Drupal FQCN controller methods with static _method requirements"
      ]
    });
    expect(frameworkCapability("laravel-blade")).toMatchObject({
      languages: ["blade"],
      routeRegistrations: [],
      surfaces: [
        "complete direct literal extends and include view directives",
        "complete direct literal component and each view directives resolved against indexed Laravel resources/views files"
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
    expect(frameworkCapability("horse")).toMatchObject({
      languages: ["pascal"],
      routeFramework: "horse",
      routeRegistrations: [],
      surfaces: [
        "exactly one direct uses Horse proof",
        "direct program-main-block THorse Get/Post literal routes with unique prior same-file routine handlers"
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
    expect(frameworkCapability("phoenix")).toMatchObject({
      languages: ["elixir"],
      routeFramework: "phoenix",
      routeRegistrations: [],
      surfaces: [
        "direct use Phoenix.Router module bindings",
        "literal scope-composed HTTP verb routes with full-module controller atom actions"
      ]
    });
    expect(frameworkCapability("cowboy")).toMatchObject({
      languages: ["erlang"],
      routeFramework: "cowboy",
      routeRegistrations: [],
      surfaces: [
        "direct cowboy_router:compile literal wildcard-host dispatch lists",
        "literal three-item routes with same-module exported init/2 callback proof"
      ]
    });
    expect(frameworkCapability("compojure")).toMatchObject({
      languages: ["clojure"],
      routeFramework: "compojure",
      routeRegistrations: [],
      surfaces: [
        "direct ns compojure.core refer proof",
        "direct defroutes literal verb routes with same-file named defn handler proof"
      ]
    });
    expect(frameworkCapability("dancer2")).toMatchObject({
      languages: ["perl"],
      routeFramework: "dancer2",
      routeRegistrations: [],
      surfaces: [
        "direct use Dancer2 proof",
        "direct literal verb routes with same-file named sub coderef handler proof"
      ]
    });
    expect(frameworkCapability("genie")).toMatchObject({
      languages: ["julia"],
      routeFramework: "genie",
      routeRegistrations: [],
      surfaces: [
        "direct using Genie proof",
        "direct literal named-handler routes with optional literal method proof"
      ]
    });
    expect(frameworkCapability("scotty")).toMatchObject({
      languages: ["haskell"],
      routeFramework: "scotty",
      routeRegistrations: [],
      surfaces: [
        "direct import Web.Scotty proof",
        "direct literal-port scotty do blocks with literal named-handler routes"
      ]
    });
    expect(frameworkCapability("dream")).toMatchObject({
      languages: ["ocaml"],
      routeFramework: "dream",
      routeRegistrations: [],
      surfaces: [
        "direct top-level Dream.router literal lists",
        "direct literal named-handler HTTP routes"
      ]
    });
    expect(frameworkCapability("giraffe")).toMatchObject({
      languages: ["fsharp"],
      routeFramework: "giraffe",
      routeRegistrations: [],
      surfaces: [
        "exactly one direct open Giraffe proof",
        "direct top-level choose literal routes with typed local named handlers"
      ]
    });
    expect(frameworkCapability("jester")).toMatchObject({
      languages: ["nim"],
      routeFramework: "jester",
      routeRegistrations: [],
      surfaces: [
        "exactly one direct top-level import list containing jester",
        "direct top-level routes or router literal blocks with one named local proc call"
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
