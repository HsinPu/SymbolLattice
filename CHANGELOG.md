# Changelog

All notable changes to SymbolLattice are documented in this file.

## [Unreleased]

No unreleased changes.

## [0.38.0] - 2026-07-30

### Added

- PHP `.php` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/method/function containment, and a first-party `@lezer/php` AST adapter.
- An executable first-party `laravel` capability. A route now requires a direct `Illuminate\Support\Facades\Route` import (including one explicit alias) or fully-qualified facade, one literal URI, one direct `get` / `post` / `put` / `patch` / `delete` / `options` / `any` facade call, and a literal `[Controller::class, 'action']` array. Same-file unqualified controllers emit exact `framework.laravel.direct-facade.literal-controller-action.local-method` evidence; cross-file controllers retain an explicit `unresolved` `Controller@action` edge instead of a guessed target.
- Capability, discovery, exact/unresolved route, alias, fully-qualified facade, dynamic/closure/resource rejection, malformed-source, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.38.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. PHP symbols and Laravel routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v27`; the project resolver remains `project-resolver-v14` because PHP controller resolution is deliberately not inferred. A pre-v0.38 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Laravel support accepts only direct/aliased imported or fully-qualified facade calls, one literal URI, and one literal controller-action array. It excludes controller/import/package resolution, route groups/prefixes/resources, `match`, closure/string/invokable handlers, redirects/views/fallbacks, middleware/configuration semantics, dynamic/escaped/interpolated values, grouped/wildcard imports, and runtime behavior. Cross-file controller action references are retained as unresolved evidence rather than mapped heuristically.
- CodeGraph has broader regex-based Laravel route, controller, and resource extraction. SymbolLattice v0.38 intentionally trades that breadth for AST-proven facade/import, literal URI/action, and explicit exact-versus-unresolved handler evidence in its first PHP/Laravel slice.

## [0.37.0] - 2026-07-30

### Added

- Java `.java` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class and direct method containment, and a first-party `@lezer/java` AST adapter.
- An executable first-party `spring-web` capability. A route now requires direct non-static/non-wildcard Spring annotation imports (or fully-qualified annotations), a direct `@RestController` or `@Controller`, an optional literal class-level `@RequestMapping` prefix, one literal direct `@GetMapping` / `@PostMapping` / `@PutMapping` / `@PatchMapping` / `@DeleteMapping` method annotation, and its exact local method. Matching routes emit `framework.spring-web.direct-controller.literal-method-mapping.local-method` evidence.
- Capability, discovery, exact route, fully-qualified annotation, import/dynamic/method-level-`RequestMapping` rejection, malformed-source, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.37.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Java symbols and Spring Web routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v26`; the project resolver remains `project-resolver-v14` because the supported Java and Spring Web forms are file-local. A pre-v0.37 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Spring Web support accepts only direct non-static/non-wildcard annotation imports or fully-qualified annotations, a direct controller class, an optional one-literal class prefix, and one one-literal shortcut method mapping on a direct local method. Method-level `@RequestMapping(method = ...)`, annotation arrays or multiple paths/conditions, placeholders or SpEL, custom/composed annotations, wildcard/static imports, nested/inherited/interface handlers, Java package/classpath resolution, semantic Spring configuration, and runtime behavior remain excluded.
- CodeGraph has broader Java declaration, project-level Spring detection, `@RequestMapping` method handling, Kotlin, configuration, and regex-based route extraction. SymbolLattice v0.37 intentionally trades that breadth for AST-proven annotation/import, literal-path, direct-controller, and exact local-method evidence in its first Java/Spring slice.

## [0.36.0] - 2026-07-30

### Added

- Rust `.rs` source discovery, persisted source-search language filtering, CLI/MCP validation, conservative top-level function containment, and a first-party `@lezer/rust` AST adapter.
- An executable first-party Axum capability for direct, unambiguous `use` bindings of `axum::Router` and `axum::routing::{get, post, put, patch, delete, head, options, trace}` (including direct aliases). A contiguous direct `Router::new().route("/path", method(handler))` builder chain with a literal path and one named top-level local handler now emits exact `framework.axum.direct-router.route.local-function` route evidence.
- Capability, discovery, CLI, unit, integration, source-search, dynamic/shadow/inline/composition/wrapper/rebinding/import-proof, and malformed-source coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.36.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Rust facts and Axum routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v25`; the project resolver remains `project-resolver-v14` because the supported Rust and Axum forms are file-local. A pre-v0.36 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Axum support accepts only direct non-public/non-wildcard `use` bindings, a direct unshadowed `Router::new()` root, contiguous literal `.route(...)` calls, one direct imported method-router helper, and one named top-level local function handler. `route_service`, `nest`, `merge`, `with_state`, `layer`, type/generic constructors, trailing wrappers, `MethodRouter` composition, inline/wrapped/namespaced handlers, dynamic/escaped paths, mutable/factory/router flow, methods, cross-file Cargo/module resolution, semantic type checking, and runtime behavior remain excluded.
- CodeGraph has materially broader Rust declaration, crate/module, and regex-based Axum/Actix/Rocket coverage. SymbolLattice v0.36 intentionally trades that breadth for auditable import, constructor, builder-chain, literal-path, local-handler, and shadowing proof in this first Rust slice.

## [0.35.0] - 2026-07-30

### Added

- An executable first-party Chi capability for direct non-dot/non-blank `github.com/go-chi/chi/v5` imports. Direct same-function `router := chi.NewRouter()` or `chi.NewMux()` receivers now emit exact route edges for `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`, `Trace`, `Connect`, and `HandleFunc` with `framework.chi.direct-router.method.local-function` evidence.
- Additive `CONNECT` route-method support throughout the existing route symbol, query, CLI, and MCP contracts. Direct Chi `Connect("/path", handler)` routes and literal Go 1.22 `net/http` `"CONNECT /path"` `HandleFunc` patterns now remain exact route records instead of being rejected.
- Capability, unit, integration, dynamic/shadow/inline/wrapper/rebinding/composition-rejection, `CONNECT` filtering, and persisted route-query coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.35.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive `chi` capability and `CONNECT` method reuse existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v24`; the project resolver remains `project-resolver-v14` because all Chi and `net/http` proof remains file-local. A pre-v0.35 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Chi support accepts only a direct `github.com/go-chi/chi/v5` import, a direct unshadowed same-function `:= chi.NewRouter()` or `chi.NewMux()` binding, a literal slash-prefixed path, and one named package-level function handler. `Route`/`Group`/`Mount` composition, `With` middleware chains, `Handle`, `Method`/`MethodFunc`, `Query`, inline/wrapped handlers, dynamic/escaped paths, `var`/factory/wrapper bindings, receiver methods, cross-file router flow, generic Go imports/calls/type resolution, Go module/package resolution, semantic type checking, and runtime behavior remain excluded.
- The new `CONNECT` value is deliberately limited to direct Chi `Connect` and literal `net/http` `HandleFunc` method patterns. It does not imply semantic HTTP validation, host/wildcard pattern support, or arbitrary user-defined method registration.

## [0.34.0] - 2026-07-30

### Added

- An executable first-party `net-http` capability for Go. Direct default-multiplexer `http.HandleFunc("/path", handler)` registrations now emit exact `ALL` route edges with `framework.net-http.default-serve-mux.handle-func.local-function` evidence.
- Same-function direct short-variable `mux := http.NewServeMux()` bindings and literal `mux.HandleFunc(...)` registrations, including the deliberate Go 1.22 `GET /path` / `POST /path` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS` / `TRACE` pattern subset. These emit exact `framework.net-http.serve-mux.handle-func.local-function` evidence.
- Reusable exact Go import-alias extraction for the supported framework packs, plus capability, unit, integration, dynamic/shadow/wrapper/rebinding, method-pattern, and persisted route-query coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.34.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive `net-http` capability and exact Go syntax edges reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v23`; the project resolver remains `project-resolver-v14` because the supported `net/http` forms are file-local. A pre-v0.34 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- `net/http` support accepts only one direct non-dot/non-blank `net/http` import, a direct unshadowed `http.HandleFunc` or same-function `:= http.NewServeMux()` receiver, plain literal slash paths or the documented literal Go 1.22 method-pattern subset, and one named package-level function handler. `http.Handle`, `ServeMux.Handle`, `DefaultServeMux` member calls, `var`/factory/wrapper bindings, inline/wrapped handlers, dynamic/escaped/host/wildcard patterns, `CONNECT`, member handlers, cross-file receiver flow, generic Go imports/calls/type resolution, Go module/package resolution, semantic type checking, and runtime behavior remain excluded.
- Gin remains the direct engine / literal same-function `RouterGroup` slice from v0.33. chi, Echo, Fiber, additional standard-library registration forms, and broader Go resolution remain future work.

## [0.33.0] - 2026-07-30

### Added

- Go `.go` discovery, persisted language filters, and a `@lezer/go` AST adapter. Valid Go files now retain conservative file and top-level function containment facts; malformed source fails closed to its file symbol.
- An executable first-party Gin framework capability for direct `gin.Default()` / `gin.New()` short-variable receivers, direct uppercase HTTP methods plus `Any`, and named package-level handlers. Every accepted registration emits an exact `routes` edge with `framework.gin.direct-engine.method.local-function` evidence.
- Same-function literal `RouterGroup` composition, including nested group prefixes. Direct `group.GET("/users", handler)` registrations now project exact paths such as `GET /api/v1/users` with `framework.gin.direct-group.method.local-function` evidence.
- Capability, discovery, source-search language-validation, unit, integration, dynamic/shadow/rebinding, literal-prefix, malformed-source, and exact route-query coverage, plus a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.33.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Go facts and Gin routes use existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v22`; the project resolver remains `project-resolver-v14` because this first Go slice emits only exact file-local syntax facts. A pre-v0.33 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Go-capable facts.

### Deliberate limits

- Gin support accepts only a direct non-dot/non-blank import of `github.com/gin-gonic/gin`, a direct same-function `:=` engine binding, one named handler argument, static slash-prefixed paths, and literal non-root/non-trailing `Group` prefixes. `var` engine declarations, `Handle`, `Match`, static-file helpers, inline/multiple/middleware handlers, dynamic or escaped paths, group middleware, member/chained receivers, factory/wrapper construction, cross-file receiver flow, methods, and runtime configuration are intentionally excluded.
- `net/http`, chi, Echo, Fiber, generic Go imports/calls/type resolution, Go module/package resolution, semantic type checking, and runtime framework behavior are not modeled in v0.33.

## [0.32.0] - 2026-07-30

### Added

- An executable first-party Flask framework capability for Python, with AST-proven direct application `@app.get` / `post` / `put` / `patch` / `delete` routes and direct `@app.route("/...", methods=[...])` or tuple-method registrations. Literal unique uppercase methods emit independent exact route nodes and `framework.flask.direct-app.decorator.local-function` syntax evidence.
- Same-file literal Flask Blueprint composition: a direct `Blueprint(...)` binding with an optional literal `url_prefix`, direct top-level decorated local handlers, and a later direct `app.register_blueprint(blueprint, url_prefix="/...")` now project exact paths such as `GET /api/catalog/items` with `framework.flask.direct-blueprint.register-blueprint.decorator.local-function` evidence.
- Capability, unit, integration, route-query, alias, prefix-composition, dynamic-method/prefix, factory, and rebinding coverage, plus a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.32.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Flask routes use the existing graph edge and route query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v21`; the project resolver remains `project-resolver-v14` because this Flask slice emits only direct same-file syntax evidence. A pre-v0.32 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Flask-capable facts.

### Deliberate limits

- Cross-file Blueprints, `add_url_rule`, nested/factory Blueprints, custom route wrappers, dynamic methods or endpoints, star/keyword expansion, member receivers, runtime route configuration, middleware, and Flask request lifecycle behavior are intentionally excluded.
- Django, Starlette, generic Python import/export/call resolution, Python type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.32.

## [0.31.0] - 2026-07-30

### Added

- Exact cross-file FastAPI `APIRouter` projection for one direct package-relative import: `from .routers.catalog import router [as local_router]`, followed by a direct literal `app.include_router(local_router, prefix="/...")`, now projects literal decorated routes from the router module into first-class route nodes such as `GET /api/catalog/health`.
- Additive persisted `fastApiRouterFacts` record final direct router declarations, their literal local-handler decorators, and direct relative inclusion facts independently from ordinary Python import/call resolution. A regular-package boundary is proven with `__init__.py` markers for the importing directory and each traversed child package.
- Exact `framework.fastapi.imported-router.include-router.decorator.local-function` module evidence, including the mounting and declaration file path. Unit, integration, persistence, and unsafe-boundary coverage verify aliases and reject absent package markers, parent-relative imports, import lists, dynamic/rebound shapes, and ambiguous module targets.
- A Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.31.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive `fastApiRouterFacts` payload keeps prior generations readable while new generations retain auditable Python router-composition evidence.
- The artifact extractor advances to `multi-language-ast-v20` and the project resolver to `project-resolver-v14`. A pre-v0.31 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes cross-file FastAPI router facts.

### Deliberate limits

- The supported Python module surface is intentionally narrow: only a single-leading-dot, one-name relative import in a regular package is projected. Parent-relative/namespace/package-only imports, wildcard or multi-name imports, re-export chains, module members, nested routers, router aliases by assignment, factories/wrappers, and generic Python import/export/call resolution remain excluded.
- Flask, Django, Python type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.31.

## [0.30.0] - 2026-07-30

### Added

- AST-proven same-file FastAPI `APIRouter` route composition. A direct one-line named import from `fastapi` may include `FastAPI` and `APIRouter` together (including direct import aliases); direct top-level `APIRouter(...)` construction, literal router prefixes, direct top-level decorated functions, and direct `app.include_router(router, prefix="/...")` calls now produce first-class exact route nodes such as `GET /api/catalog/items`.
- Exact `framework.fastapi.direct-router.include-router.decorator.local-function` syntax evidence for the composed route-to-handler edge. Existing direct application decorator evidence remains unchanged, while dynamic prefixes, star/keyword expansion, possible rebinding, unmounted routers, and routes declared after their inclusion are rejected instead of guessed.
- Capability, unit, integration, persistence, and route-query coverage for direct same-file router composition, plus a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.30.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive behavior stays in the existing Python artifact-fact and graph payloads; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v19`; the project resolver remains `project-resolver-v13`. A pre-v0.30 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes APIRouter-capable facts.

### Deliberate limits

- This remains a narrow, file-local FastAPI proof. Cross-file/module-member routers, nested routers, assignment aliases, factory wrappers, dynamic or escaped paths/prefixes, import-list continuations, and generic Python import/export/call resolution are intentionally excluded.
- Flask, Django, Python type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.30.

## [0.29.0] - 2026-07-30

### Added

- Python `.py` discovery and a `@lezer/python` AST adapter. Valid Python files now emit conservative file, class, function, method, and exact `contains` facts; malformed source fails closed to its file symbol.
- A first Python framework pack for direct same-file FastAPI routes. A direct `from fastapi import FastAPI` import (with an optional alias), direct top-level application assignment, literal-path HTTP decorator, and top-level `def`/`async def` handler emit an exact `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS`/`TRACE` route edge with `framework.fastapi.direct-app.decorator.local-function` syntax evidence.
- Python language filters through persisted source search, CLI, MCP, and Git source-path selection, plus extraction/persistence/incremental coverage and a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.29.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Python facts use the existing artifact-fact and graph payloads; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v18`; the project resolver remains `project-resolver-v13`. A pre-v0.29 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Python-capable facts.

### Deliberate limits

- This is a narrow, file-local FastAPI proof. `APIRouter`, `include_router`, cross-file Python imports, mixed import lists, factory composition, dynamic/multiline/escaped paths, and non-direct/rebound application shapes are intentionally excluded.
- Generic Python import/export/call resolution, type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.29.

## [0.28.0] - 2026-07-30

### Added

- AST-proven React Router `createRoutesFromElements(...)` extraction for TypeScript/TSX and JavaScript/JSX. A direct non-type-only named import from `react-router` or `react-router-dom` (including an alias), one direct non-optional factory call, and exactly one direct JSX `Route` or JSX fragment argument now project first-class `NAVIGATE` routes.
- Factory-backed literal JSX trees reuse the established direct-child/fragment, relative-child, index-route, and pathless-layout composition rules. Every emitted page handler carries additive `routeRegistration: "react-router-create-routes-from-elements"` provenance and distinct `framework.react-router.create-routes-from-elements.*` evidence through the existing route, caller, impact, context, CLI, MCP, and retained-fact surfaces.
- Exact extraction, cross-file resolver, persisted-fact, caller, and incremental-reuse coverage for factory-specific route evidence, plus a standalone Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.28.0.md`.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing route symbols and facts remain readable; the new factory registration is an additive value in the existing optional `routeRegistration` contract.
- The artifact extractor advances to `typescript-ast-v17` and the project resolver to `project-resolver-v13`. A pre-v0.28 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes factory-specific facts and handler evidence.

### Deliberate limits

- This pack proves only the direct imported factory/call/argument/tree form. Type-only or shadowed imports, optional calls, additional arguments, dynamic JSX values, JSX conditions or arbitrary wrapper descendants, spread or duplicate attributes, dynamic paths, absolute child paths, and `.` / `..` child segments do not receive factory provenance.
- Unsupported factory calls are not silently reclassified as factory-backed navigation. Existing generic JSX `Route` extraction remains independently available when its own direct syntax proof applies.

## [0.27.0] - 2026-07-30

### Added

- Recursive, AST-proven React Router JSX route trees. Direct literal child `Route` elements, including direct JSX fragments, now compose relative child paths, index routes, and pathless layouts from a slash-prefixed root route into first-class `NAVIGATE` symbols.
- Nested JSX output preserves the existing exact local, imported, re-exported, and unresolved page-handler evidence with distinct `framework.react-router.jsx-route.*` rule IDs. v6 `Component` / `element` handlers can participate in recursive composition; an existing v5 `component` route remains a direct standalone proof and never projects child routes.
- A standalone v0.27 comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.27.0.md`, following the versioned workspace-root report convention.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing route symbols and facts remain readable; recursive JSX routes use the established `NAVIGATE`, route-framework, and edge-evidence contracts.
- The artifact extractor advances to `typescript-ast-v16`. A pre-v0.27 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes recursive JSX facts. The project resolver remains `project-resolver-v12` because handler resolution is unchanged.

### Deliberate limits

- This pack supports only direct literal JSX route children and direct fragments. Conditional expressions, arbitrary wrapper descendants, `createRoutesFromElements`, `basename`, dynamic paths, absolute child paths, `.` / `..` child segments, spread attributes, duplicate attributes, and runtime router configuration are not inferred.
- A pathless layout supplies URL context to supported children but is not emitted as a public navigation route. An index route must have no path or substantive JSX children. The legacy v5 `component` form stays supported for direct routes only because it cannot prove v6 nested-route semantics.

## [0.26.0] - 2026-07-30

### Added

- Recursive, AST-proven React Router v6.4+ data-router trees. Direct literal `children` arrays now compose relative child paths, index routes, and pathless layout traversal from an eligible slash-prefixed root route into first-class `NAVIGATE` route symbols.
- Existing local, imported, re-exported, and unresolved page-handler resolution remains intact for every emitted nested route. Nested output keeps `routeRegistration: "react-router-data-router"` and its distinct `framework.react-router.data-router.*` evidence.
- A versioned workspace-root comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.26.0.md`, maintained outside the project checkout so it can compare the local SymbolLattice and CodeGraph checkouts side by side. Every later version creates its own `FEATURE_COMPARISON_vX.Y.Z.md` with verified capability, evidence, deliberate limits, and a plain-language assessment.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing route facts remain readable; nested routes use the existing `NAVIGATE`, route-framework, registration, and edge-evidence contracts.
- The artifact extractor advances to `typescript-ast-v15`. A pre-v0.26 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes recursive data-router facts. The project resolver remains `project-resolver-v12` because the existing handler-resolution semantics are unchanged.

### Deliberate limits

- This pack supports direct literal `children` arrays only. Dynamic child arrays, spreads, `lazy`, factory options or `basename`, nested JSX `Route` composition, route-array variables, absolute child paths, `.` / `..` child segments, and runtime router configuration are not inferred.
- A pathless layout can pass its parent's URL context to static children, but does not become a separate public navigation route itself. An index child must have no path or children; malformed children are excluded independently without removing a separately proven ancestor or sibling.

## [0.25.0] - 2026-07-30

### Added

- An executable first-party framework capability registry for Express, Fastify, NestJS, React Router, and Next.js. The AST extraction pipeline now selects registered passes by the parsed language, so framework coverage has one inspectable extension boundary rather than a documentation-only inventory.
- Syntax-proven Next.js Pages Router navigation from `pages/` and `src/pages/` files with a direct named default export. `index` files map to their containing path and dynamic path segments remain explicit route patterns such as `NAVIGATE /blog/[slug]`.
- Syntax-proven Next.js App Router navigation from `app/` and `src/app/` `page` files with a direct named default export. Conventional route groups are omitted from the URL, while ordinary local/import/re-export handler resolution produces `framework.nextjs.pages-router.*` or `framework.nextjs.app-router.*` evidence.
- Additive `routeFramework: "nextjs"` and `routeRegistration: "nextjs-pages-router" | "nextjs-app-router"` provenance, plus unit, resolution, persisted-fact, caller, and incremental-reuse coverage.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing raw artifact facts gain only additive route-framework and route-registration values; existing route symbols and evidence remain readable.
- The artifact extractor advances to `typescript-ast-v14` and the project resolver to `project-resolver-v12`. A pre-v0.25 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes capability and Next.js navigation evidence.

### Deliberate limits

- Next.js coverage is a static convention proof, not a runtime model. Pages API files, special Pages files, App Router `route` handlers, middleware, layouts, templates, loading/error/not-found files, anonymous/wrapped/HOC defaults, parallel routes, intercepting routes, and runtime configuration are excluded.
- App route groups are omitted only for conventional `(name)` segments. React Router nested/index/relative composition remains a later pack; this release does not widen the existing React Router data-router proof boundary.

## [0.24.0] - 2026-07-30

### Added

- AST-proven React Router v6.4+ data-router object routes for TypeScript/TSX and JavaScript/JSX. Direct non-type-only named `createBrowserRouter`, `createHashRouter`, and `createMemoryRouter` imports from `react-router` or `react-router-dom` (including aliases) now recognize a direct one-argument route array with slash-prefixed literal object paths and exactly one direct `Component: Page` or `element: <Page />` page handler.
- Additive `routeRegistration: "react-router-data-router"` fact provenance and `framework.react-router.data-router.*` terminal-handler evidence. Local, imported, re-exported, and unresolved page references retain the factory/object route shape through the existing route, caller, impact, context, CLI, and MCP views, while `NAVIGATE` remains an explicit client-navigation discriminator rather than an HTTP method.
- Exact type-only, lexical-shadow, factory-options, path, handler, spread, duplicate, computed-field, member-expression, and lazy-route rejection boundaries, plus persisted-fact and incremental-reuse coverage for a real data-router project.

### Compatibility

- No SQLite schema migration or new route-query command is required. The existing raw artifact-fact payload gains the additive optional `routeRegistration: "react-router-data-router"` value; existing route facts and evidence remain readable.
- The artifact extractor advances to `typescript-ast-v13` and the project resolver to `project-resolver-v11`. A pre-v0.24 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes data-router navigation evidence.

### Deliberate limits

- This pack scans only direct object entries in a literal first-argument route array. It does not compose `children`, derive index or relative paths, apply a `basename`/factory options object, infer lazy or runtime route modules, follow route-array variables/spreads, or interpret Next.js file-system routing. A direct `lazy` field is rejected because it can replace the rendered page at runtime.

## [0.23.0] - 2026-07-30

### Added

- AST-proven React Router JSX client-navigation routes for TypeScript/TSX and JavaScript/JSX. A direct non-type-only named `Route` import from `react-router` or `react-router-dom` now recognizes literal slash-prefixed `path` attributes paired with exactly one direct v5 `component`, v6 `Component`, or v6 `element={<Page />}` page reference.
- Explicit `NAVIGATE` route discriminator for client-side navigation. React Router records become first-class route symbols such as `NAVIGATE /settings`, retain ordinary `routes` edges to local, imported, re-exported, or unresolved page components, and remain queryable through the existing CLI, service, and MCP route views without being mislabeled as HTTP `GET` requests.
- Framework-specific `framework.react-router.jsx-route.*` evidence, including exact lexical/module/re-export provenance and unresolved component evidence. Route/import binding checks reject type-only, shadowed, spread, duplicate, member-expression, or runtime-shaped JSX registrations before they reach graph resolution.

### Compatibility

- No SQLite schema migration or new route-query command is required. `NAVIGATE` is an additive route-method value and `react-router` is an additive optional `routeFramework` provenance value in the existing raw artifact-fact payload; existing HTTP routes and persisted facts remain readable.
- The artifact extractor advances to `typescript-ast-v12` and the project resolver to `project-resolver-v10`. A pre-v0.23 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes React Router navigation evidence.

### Deliberate limits

- This pack supports JSX `<Route>` elements only. It excludes direct data-router route-object arrays passed to `createBrowserRouter`, `createHashRouter`, and similar APIs, plus lazy/wrapped/inline or member-expression page handlers, spreads, dynamic paths, nested-path composition, runtime router configuration, and Next.js file-system conventions. The `NAVIGATE` discriminator intentionally represents browser navigation rather than an HTTP method.

## [0.22.0] - 2026-07-30

### Added

- AST-proven cross-file Fastify plugin-prefix composition for TypeScript and JavaScript. A direct `app.register(importedPlugin, { prefix: "/..." })` root registration now resolves one value-space ESM import or re-export surface to an exported function or variable callback, projects literal source-plugin routes, and preserves the route declaration file.
- Nested source-plugin composition. An exported plugin can directly `register(childPlugin, { prefix: "/..." })` through an exact local, imported, or re-exported identifier; literal prefixes compose into ordinary route nodes such as `GET /api/users` and `TRACE /api/v1/jobs`. A repeated plugin in one active ancestry is not expanded again, keeping cyclic source registrations finite and deterministic.
- Additive `fastifyPluginFacts` raw artifact facts for source-plugin routes, child registrations, and imported root registrations, plus `routeRegistration: "fastify-imported-plugin-prefix"` and `framework.fastify.imported-plugin-prefix.*` terminal-handler evidence. Exact local, imported, re-exported, and unresolved handlers retain that provenance through the existing route/caller/impact/query surfaces.

### Compatibility

- No SQLite schema migration or new CLI/MCP command is required. The existing artifact-fact JSON stores the additive optional `fastifyPluginFacts` and imported-plugin route-registration provenance; old facts remain readable and retain their former evidence rules.
- The artifact extractor advances to `typescript-ast-v11` and the project resolver to `project-resolver-v9`. A pre-v0.22 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes cross-file Fastify plugin evidence.

### Deliberate limits

- Cross-file composition accepts only direct identifiers, exact value-space ESM import/re-export surfaces, direct function declarations or immutable direct function/arrow `const` callbacks, exactly two-argument `register` calls, and static slash-prefixed non-root/non-trailing prefix objects. It excludes CommonJS, namespace/member access, assignment aliases, type-only or ambiguous exports, mutable/wrapped (`fastify-plugin`) callbacks, computed/spread/duplicate registrations, and dynamic prefixes.
- Root routes inside any prefixed plugin remain excluded because Fastify `prefixTrailingSlash` can produce different concrete runtime paths. Hooks, schemas, custom methods, inline/member handlers, runtime route options, and runtime composition remain outside the static proof surface.

## [0.21.0] - 2026-07-30

### Added

- AST-proven same-file Fastify named-plugin prefix composition for TypeScript and JavaScript. A direct `register(plugin, { prefix: "/..." })` call can now establish a scoped Fastify receiver when `plugin` resolves lexically to either a direct non-generator function declaration with no direct rebinding or an immutable `const` initialized by a direct function/arrow expression.
- Nested static composition across those named local callbacks and existing direct inline callbacks. A local `api` plugin that registers a local `v1` plugin produces ordinary first-class paths such as `GET /api/users` and `TRACE /api/v1/jobs`, with the same bounded read-only route graph surface as v0.20.
- Additive `routeRegistration: "fastify-local-plugin-prefix"` raw-fact provenance and `framework.fastify.local-plugin-prefix.*` handler evidence. Local, imported, re-exported, and unresolved terminal handlers retain the local-plugin prefix proof through project resolution.

### Compatibility

- No SQLite schema migration or new CLI/MCP command is required. The existing raw artifact-fact JSON gains one optional route-registration value; pre-v0.21 facts remain readable and retain their existing rule IDs.
- The artifact extractor advances to `typescript-ast-v10` and the project resolver to `project-resolver-v8`. A pre-v0.21 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes named-plugin route evidence.

### Deliberate limits

- A local plugin must be in the same file and passed as the direct first argument of a direct `register` call. Accepted local definitions are direct function declarations with no direct rebinding, or direct function/arrow initializers of immutable `const` bindings. The callback still needs an identifier first receiver parameter with no lexical reassignment and the registration still needs exactly two arguments plus a literal slash-prefixed, non-root, non-trailing `prefix` object.
- To avoid choosing one incomplete path surface, a local callback is excluded when its exact lexical binding is passed to more than one direct `.register(...)` call anywhere in the same source file. Imported/re-exported/aliased/wrapped (`fastify-plugin`), mutable, member, dynamic, computed, spread, duplicate, or otherwise ambiguous plugin registrations remain outside this release. Prefixed-plugin root routes remain excluded because `prefixTrailingSlash` can change Fastify's concrete runtime paths.

## [0.20.0] - 2026-07-30

### Added

- AST-proven Fastify inline-plugin prefix composition for TypeScript and JavaScript. A direct inline function or arrow callback passed to a direct `server.register(callback, { prefix: "/..." })` call now establishes a scoped Fastify receiver, so its shorthand and full-object routes become first-class paths such as `GET /api/users`.
- Nested direct inline registrations compose their literal non-trailing prefixes before route extraction. `app.register(api => api.register(v1 => v1.route(...), { prefix: "/v1" }), { prefix: "/api" })` produces the same bounded read-only route graph surface as an ordinary Fastify route, including `TRACE` and multi-method full objects.
- Additive `routeRegistration: "fastify-inline-plugin-prefix"` raw-fact provenance and `framework.fastify.inline-plugin-prefix.*` handler evidence. Local, imported, re-exported, and unresolved handlers retain the route's plugin-prefix proof instead of being reported as an unqualified registration.

### Compatibility

- No SQLite schema migration or new CLI/MCP command is required. The existing raw artifact-fact JSON gains one optional route-registration field; existing Fastify and Express facts remain readable and retain their prior evidence rules.
- The artifact extractor advances to `typescript-ast-v9` and the project resolver to `project-resolver-v7`. A pre-v0.20 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes inline-plugin route evidence.

### Deliberate limits

- Prefix composition accepts only a direct, non-optional `register` call on a proven Fastify receiver, with a direct non-generator inline callback, an identifier first parameter that is not reassigned in its lexical body, exactly two arguments, and a direct object-literal slash-prefixed non-root/non-trailing `prefix`. Named, imported, re-exported, wrapped (`fastify-plugin`), mutable, aliased, dynamic, computed, spread, duplicate, or otherwise ambiguous plugin registrations remain outside this release.
- Root routes inside prefixed plugins remain excluded because Fastify's runtime `prefixTrailingSlash` setting can register different concrete path surfaces. Direct root routes without a plugin prefix remain supported by the v0.19 pack.

## [0.19.0] - 2026-07-30

### Added

- AST-proven Fastify HTTP routes for TypeScript and JavaScript. A direct non-type-only default import from `fastify`, a lexical unshadowed immutable `const server = Fastify(...)` receiver, a literal slash-prefixed path, and a direct identifier handler now create first-class `route` symbols and `routes` edges.
- Fastify shorthand registrations for `get`, `head`, `trace`, `delete`, `options`, `patch`, `put`, `post`, and `all`, plus direct `server.route({ method, url | path, handler })` objects. Full objects accept one uppercase method or a nonempty duplicate-free static method array, with either explicit `handler: name` or `{ handler }` shorthand; `url` and its documented `path` alias remain mutually exclusive.
- Framework-specific pending-route provenance and `framework.fastify.static-route.*` resolver evidence for local, imported, re-exported, and unresolved handlers. Fastify routes reuse the existing bounded read-only `routes` CLI, service, and MCP views; `TRACE` is now an accepted route filter across those views.

### Compatibility

- No SQLite schema migration is required. The additive optional `routeFramework` field lives in existing raw artifact-fact storage, while existing Express facts without it retain their `framework.express.literal-route.*` evidence on resolution.
- The artifact extractor advances to `typescript-ast-v8` and the project resolver advances to `project-resolver-v6`. A pre-v0.19 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Fastify route evidence. Route handlers now require value-space lexical/import/re-export proof, so a type-only import or re-export is never promoted into a runtime handler edge.

### Deliberate limits

- This is a static Fastify route surface, not runtime framework execution. It excludes CommonJS, namespace/named-default factories, mutable or aliased receivers, `register(..., { prefix })` composition, hooks, schema interpretation, custom methods, dynamic method/path/handler values, inline or member handlers, and nonliteral paths or methods. A shorthand options slot can be present but is not interpreted.
- A Fastify full-route object must be a direct object literal with direct `method`, exactly one of `url` or `path`, and a direct identifier `handler`. Computed, spread, duplicate, conflicting, dynamic, or ambiguous shapes are intentionally not promoted into graph facts.

## [0.18.0] - 2026-07-30

### Added

- AST-proven NestJS non-HTTP entrypoints for TypeScript and JavaScript. Direct non-type-only named imports (including aliases) now recognize GraphQL `@Resolver` plus `@Query` / `@Mutation` / `@Subscription`, microservice `@Controller` plus `@MessagePattern` / `@EventPattern`, and `@WebSocketGateway` plus `@SubscribeMessage`.
- First-class `entrypoint` graph symbols and exact `handles` edges. They retain transport (`graphql`, `microservice`, or `websocket`), operation, and literal operation name/pattern/namespace-qualified event without pretending that non-HTTP dispatch is an HTTP route. The edges participate in callers, callees, impact, context, exploration, node retrieval, and edge explanation.
- Bounded read-only `entrypoints [path]` CLI command, `SymbolLatticeService.entrypoints`, and capability-gated `symbol_lattice_entrypoints` MCP tool. They expose transport, operation, and exact name-prefix filters with live freshness and explicit truncation while never initializing, indexing, or synchronizing a project.
- Static GraphQL name derivation from a handler name, direct schema-first literal name, or static `{ name: "..." }` option; recursive static JSON-compatible microservice object patterns with canonicalized keys; and static WebSocket gateway namespace composition.

### Compatibility

- No SQLite schema migration is required. Existing graph, artifact-fact, edge, and retained-snapshot storage persist the additive symbols and edges; existing generations remain readable.
- The artifact extractor advances to `typescript-ast-v7`. A pre-v0.18 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes entrypoint evidence. The project resolver remains `project-resolver-v5` because these edges are exact file-local syntax evidence.
- The `entrypoints` MCP tool is additive and capability-gated, so explore-only or route-only embedded services retain their existing tool lists.

### Deliberate limits

- SymbolLattice does not execute Nest, build a GraphQL schema, connect to a broker, inspect WebSocket runtime adapters, or infer a runtime transport. It recognizes only direct AST bindings and decorated instance methods with a body.
- Namespace imports, local decorator barrels, custom/composed decorators, type-only/foreign/shadowed imports, dynamic or conflicting GraphQL names, dynamic/prototype-setter microservice patterns, dynamic gateway namespace/event configuration, GraphQL field resolvers, and runtime guards/adapters remain outside the proof surface.

## [0.17.0] - 2026-07-30

### Added

- AST-proven NestJS `RouterModule.register([...])` module-prefix composition for TypeScript and JavaScript. A direct named `RouterModule` import from `@nestjs/core`, a direct named `@Module` import from `@nestjs/common`, literal route-object paths, and direct module identifiers now project controller-local HTTP routes through statically registered prefixes.
- Recursive `children` route trees, import aliases, and exact local/import/re-export class bindings. A route under `{ path: "admin", module: AdminModule, children: [{ path: "catalog", module: CatsModule }] }` becomes `/admin/catalog/...` when the controller is statically registered in `CatsModule`.
- Persisted syntax facts for route-to-controller, module-to-controller, and RouterModule-prefix relationships. The project resolver derives a full route symbol and an exact `routes` edge with `framework.nestjs.router-module.exact-prefix` module evidence; the existing CLI, MCP, callers, callees, context, and route views receive the projected route without a new public command.

### Compatibility

- No SQLite schema migration or public query contract change is required. The existing raw artifact-fact JSON payload carries the additive RouterModule facts, and existing generations remain readable.
- The artifact extractor advances to `typescript-ast-v6` and the project resolver advances to `project-resolver-v5`. A pre-v0.17 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes complete Nest module-prefix evidence.

### Deliberate limits

- This supports only direct `RouterModule.register([...])` expressions in a direct `@Module({ imports: [...] })` array. `forRoot` / `forChild`, variables, factories, CommonJS, local decorator barrels, namespace calls, custom wrappers, computed/spread/duplicate route-object properties, nonliteral paths, non-identifier modules, and dynamic children are deliberately excluded.
- A controller-local route is retained when its module prefix is missing, dynamic, ambiguous, or otherwise unproven. SymbolLattice adds no guessed global prefix, versioning, runtime adapter, guard, GraphQL, microservice, WebSocket, or SSE behavior.

## [0.16.0] - 2026-07-30

### Added

- AST-proven NestJS HTTP controller extraction for TypeScript and JavaScript: direct `@Controller(...)` plus `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Head`, `@Options`, or `@All` method decorators create persisted `route` symbols with joined controller/method paths.
- Direct exact `routes` edges from each Nest route to its decorated instance method. They carry `framework.nestjs.decorator-route.local-method` syntax evidence and participate in existing callers, callees, impact, context, exploration, edge explanation, CLI, and MCP route views without a name-resolution fallback.
- Exact decorator-import proof for non-type-only named imports from `@nestjs/common`, including import aliases. The extractor rejects shadowed, namespace, foreign-module, dynamic, object, custom, static, and body-less method shapes instead of manufacturing route evidence.

### Compatibility

- No SQLite schema migration or public query contract change is required. Existing graph, artifact-fact, edge, and retained-snapshot storage persists the additive Nest route shape; existing generations remain readable.
- The artifact extractor advances to `typescript-ast-v5`, so a pre-v0.16 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Nest route evidence. The project resolver remains at `project-resolver-v4` because Nest routes are direct syntax edges, not a new cross-file resolution rule.

### Deliberate limits

- This is the direct NestJS HTTP controller surface, not a general Nest runtime model. It excludes local decorator barrels/re-exports, namespace or custom/composed decorators, literal arrays and object options, dynamic arguments, static/abstract handlers, RouterModule/global/version prefixes, guards, GraphQL, microservices, WebSockets, and SSE.
- Decorator recognition is never inferred from a filename, package manifest, or an unbound identifier. A route needs an AST-proven direct named import from `@nestjs/common`, one supported controller decorator, one supported method decorator, and an indexed method declaration in the same class.

## [0.15.0] - 2026-07-30

### Added

- AST-proven direct declaration hierarchy facts: TypeScript and JavaScript class `extends`, TypeScript class `implements`, and TypeScript interface `extends`. Direct identifiers with generic arguments are retained with exact source ranges; qualified names, mixin/call expressions, intersections, arrays, and other complex heritage expressions remain outside the proof surface.
- First-class `extends` and `implements` graph edges, direct parent/child graph helpers, and persistent unresolved-parent evidence. Heritage uses separate TypeScript value/type namespaces: class bases require a value-space class proof, while interfaces and implemented contracts use type-space class/interface/type-alias targets. Type-only imports and type-only re-export provenance are honored only where valid.
- Read-only `hierarchy <reference> [--limit]` CLI command, `SymbolLatticeService.hierarchy`, and capability-gated `symbol_lattice_hierarchy` MCP tool. They return bounded direct parents and exact children from the active generation, disclose parent/child truncation independently, and never initialize, synchronize, or mutate an index.

### Compatibility

- No SQLite schema migration is required. Existing graph, artifact-fact, edge, pending-reference, and retained-snapshot storage carry the additive hierarchy shape; existing generations remain readable.
- Extractor and resolver versions advance because raw facts now preserve value/type binding namespaces and type-only import/re-export markers. A pre-v0.15 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes hierarchy evidence. Explore-only MCP embeddings retain their tool list because hierarchy is capability-gated.
- Existing callers, callees, reverse impact, affected-test, route, context, and ordinary call-resolution semantics deliberately remain unchanged; hierarchy is its own direct declaration query.

### Deliberate limits

- This is direct syntax evidence, not a semantic TypeScript checker. SymbolLattice does not infer declaration merging, structural type validity, transitive ancestry, overrides, or dynamic/mixin/qualified heritage expressions.
- An unproven, incompatible, ambiguous, or explicitly type-only runtime base remains `unresolved`. SymbolLattice never promotes a project-wide matching name into an inheritance proof.
- Named class/interface declarations and default-exported class expressions are in scope; variable-held and nested class expressions do not yet become independent hierarchy nodes.

## [0.14.0] - 2026-07-30

### Added

- Evidence-first Express static-route extraction for a deliberately narrow, AST-proven surface: supported immutable `const` receivers from `express()` / `express.Router()` / `Router()`, slash-prefixed string-literal paths, supported HTTP verbs, and identifier-only middleware chains with a terminal named handler.
- First-class `route` graph nodes and `routes` edges. Exact handler bindings carry framework-specific evidence; unresolved or ambiguous handlers remain inspectable route edges instead of becoming guessed links. Route bindings participate in callers, callees, reverse impact, context evidence paths, and ordinary graph inspection with their distinct edge kind preserved.
- Read-only `routes [path]` CLI command and conditional `symbol_lattice_routes` MCP tool. Both provide bounded method/path filters, handler evidence, freshness, and explicit truncation without initializing, synchronizing, or mutating an index.

### Compatibility

- No SQLite schema migration is required: the existing text-backed symbol, edge, pending-reference, and retained-snapshot storage persists the additive route graph shape. Existing generations remain readable.
- The extractor and resolver versions advance so a pre-v0.14 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes route evidence. Explore-only embedded MCP services retain their prior tool list because `symbol_lattice_routes` is capability-gated.

### Deliberate limits

- This is not a general Express runtime model. It excludes CommonJS `require`, mutable or unknown receiver aliases, `app.use` mounts, chained `.route()`, computed methods, nonliteral or non-slash paths, property/namespace handlers, inline callbacks, arrays/spreads, and dynamic dispatch.
- SymbolLattice does not read `node_modules` or infer Express from a filename, package manifest, or receiver spelling. A supported route must have a local AST proof of its Express import and receiver origin.

## [0.13.0] - 2026-07-30

### Added

- Read-only `node <reference>` CLI command for an exact, generation-bound declaration view. It returns the persisted declaration range when available, direct callers/callees, live freshness, source provenance, and explicit output bounds without initializing or refreshing an index.
- Read-only, idempotent `symbol_lattice_node` MCP tool when an embedding supplies the optional node capability. Existing explore-only embeddings retain their prior MCP surface.
- Explicit node bounds in every result: at most 200 persisted declaration lines, 16,000 UTF-16 code units, 25 direct callers, 25 direct callees, and 25 ambiguous match candidates. Source, relation, and ambiguity truncation are separately disclosed.

### Compatibility

- No SQLite migration or index backfill is required. `node` reuses the existing optional active source-document projection, and existing `explore`, context, history, Git, watch, CLI, and MCP contracts remain unchanged.
- An exact node stays graph-queryable when an older adapter or legacy generation cannot provide persisted source documents. It reports `sourceAvailability: "unavailable"` with `source: null` rather than reading current filesystem text.

### Deliberate limits

- `node` returns source and relationships only for an exact ID, qualified-name, simple-name, or location match. Ambiguous and missing references preserve their match state without selecting a candidate or inventing evidence.
- Source text is an immutable active-generation declaration range. It is not a live-file reader, retained-generation source browser, transitive impact query, dynamic-dispatch analysis, or semantic code explanation.

## [0.12.0] - 2026-07-30

### Added

- Read-only `git-hunks [path] --base <ref> [--limit <count>]` CLI command for immutable local Git hunk declaration attribution. It resolves the local `merge-base(<ref>, HEAD)`, compares that revision with `HEAD`, returns zero-context unified hunks, and extracts declaration anchors separately from the exact old and new revision blobs.
- Read-only, idempotent `symbol_lattice_git_hunks` MCP tool when an embedding supplies the optional Git hunk capability. It preserves the MCP surface of existing explore-only and Git-change-set-only embeddings.
- Explicit immutable Git hunk bounds: at most 50 supported source files, a global hunk-record default of 25 and maximum of 100, and up to 25 declaration anchors for each old or new hunk side.

### Compatibility

- No SQLite migration, active graph, graph refresh, or index backfill is required. The feature reads local immutable Git blobs directly; existing graph, affected-test, retained-history, watch, CLI, and MCP contracts remain unchanged.
- `affected --base <ref>` remains the graph-backed, file-level affected-test selector. `git-hunks` is a separate revision-local source-attribution query and does not select tests.

### Deliberate limits

- Only the resolved local merge base and `HEAD` participate. The command and MCP tool do not select working-tree, staged, or untracked files; they never fetch, index, synchronize, or mutate Git or SQLite state.
- Declaration anchors and IDs are revision-local evidence. The release makes no rename, move, old/new identity, or cross-side continuity claim.
- Attribution is limited to supported TypeScript/JavaScript source sides and zero-context unified hunks. A selection above the 50-source-file cap is rejected rather than silently truncated.

## [0.11.0] - 2026-07-30

### Added

- Immutable retained graph snapshots for up to five SymbolLattice generations, including the active generation. Each retained summary records captured graph counts, index-work telemetry when available, extractor/resolver versions, and the immutable snapshot-payload version.
- Read-only `history [path]` and `diff <from-generation-id> [path]` CLI commands. `history` returns newest-first retained summaries and explicit retention/request bounds; `diff` compares retained graph snapshots with independently bounded added, removed, and modified file, symbol, edge, and pending-reference sections.
- Read-only, idempotent `symbol_lattice_history` and `symbol_lattice_diff` MCP tools when a compatible service capability is present. Both preserve the tool surface of older explore-only embeddings.
- Explicit `activeStatus` on history/diff responses. It reports the live-filesystem freshness of the current active generation without claiming freshness for an older immutable snapshot.
- Additive `generation_snapshots` SQLite storage with active v2-v4 projection backfill on explicit initialization, deterministic retention pruning, manual FTS cleanup before generation deletion, and rollback-safe pointer-last replacement.

### Compatibility

- SQLite metadata remains at marker `4` so a v0.10 binary can still open and explicitly reindex after a rollback. The retained snapshot table is additive; an explicit `sync`, `index`, or `init` repairs/backfills a v2-v4 active generation without fabricating a v1 generation ID.
- `history` and `diff` are strictly read-only. A legacy active generation without a saved immutable snapshot, or an older external `GraphStore` adapter without the optional capability, returns `GENERATION_HISTORY_UNAVAILABLE` instead of changing storage during a query.
- Evicted, unknown, invalid, and same-generation comparisons report explicit generation errors. Existing graph, source-search, context, affected-test, watch, CLI, and MCP contracts remain unchanged.

### Deliberate limits

- This release compares retained **graph snapshots**, not Git commits, source hunks, historical source text, rename/move intent, or hunk-to-symbol attribution.
- A stable graph ID with a changed persisted payload is reported as `modified`; without a stable identity, a change remains remove-plus-add rather than an inferred move or rename.

## [0.10.0] - 2026-07-30

### Added

- Bounded pending-file disclosure in the native foreground `watch [path]` NDJSON stream. `event-pending` reports a lexically ordered sample of up to 25 project-relative paths, explicit unknown/overflow semantics, and retains the disclosure through failed status or sync work.
- `event-fresh` receipt for an event-associated reconciliation that finds no drift. A successful `event-fresh` or `synced` receipt clears the pending state only when no newer event arrived during that reconciliation.
- Native watcher path hygiene: Windows separators normalize to forward slashes; absolute, traversal, ambiguous, or missing filenames still invalidate safely but are disclosed as unknown rather than leaking host paths. Hard-excluded directories stay invisible.

### Compatibility

- No SQLite migration, daemon, MCP mutation, or cross-process state is added. `WatchEventSource` retains source compatibility because event callbacks may still be invoked without a path.
- `WatchReceipt` now always includes `pendingFileCount`, `pendingFiles`, `pendingFilesTruncated`, and `pendingFilesUnknown`. TypeScript integrations that construct that public type must add the four fields; consumers should treat a `null` count as intentionally non-exact rather than as zero.

### Deliberate limits

- Pending paths exist only in the foreground watch process that observed native events. SymbolLattice does not yet persist them, expose an MCP per-query warning/banner, coordinate multiple watchers, or claim daemon-level freshness.
- The disclosure is a scheduling and safety signal, not a per-file partial resolver: every reconciliation still evaluates complete live index freshness before publishing.

## [0.9.0] - 2026-07-30

### Added

- Native filesystem-event acceleration for the explicit foreground `watch [path]` command. The CLI subscribes recursively when the host supports it, debounces event bursts for 250 ms, filters the same hard-excluded directories as source discovery, and always reuses the established `getStatus` then atomic `sync` path.
- The existing bounded polling cadence now remains a safety sweep. Native watcher setup or runtime failure emits a compact `event-watch-failed` NDJSON receipt with `WATCH_EVENTS_UNAVAILABLE` or `WATCH_EVENTS_FAILED`, closes the event source, and continues polling instead of silently losing freshness checks.
- `event-watch-active` NDJSON receipt, deterministic event-burst/coalescing/cleanup coverage, and a testable Node `fs.watch` adapter. `watch --poll` explicitly disables native event acceleration for controlled environments.

### Compatibility

- No SQLite migration is required. `WatchEventSource` is optional: existing application embeddings that call `startForegroundWatch` without one retain v0.8 polling behavior, while the CLI supplies the native adapter by default.
- The foreground process, persisted scope, atomic publication, force guard, retry/backoff, signal handling, and read-only MCP boundary are unchanged. No daemon or MCP mutation surface was added.

### Deliberate limits

- Native events are a scheduling hint, not a per-file semantic incremental resolver. A reconciliation still scans the complete live catalog and can rebuild the full project projection when required.
- SymbolLattice does not provide a daemon, durable background watch, cross-process coordination, CodeGraph-style pending-file banners, historical graph generations, semantic Git diff, or hunk-to-declaration attribution in this release.

## [0.8.0] - 2026-07-30

### Added

- Explicit foreground `watch [path]` command for an existing index. It performs the same live freshness check as `status`, runs the established atomic `sync` only when drift is detected, and preserves the active generation when a refresh fails.
- Compact, stable NDJSON lifecycle receipts: `started`, `stale-detected`, `synced`, `sync-failed`, `status-failed`, and `stopped`. Each record keeps generation IDs, current status, index-work telemetry, actionable errors, and an explicit retry delay.
- Bounded polling interval validation (`250-60000` ms; default `2000`), non-overlapping recursive scheduling, exponential retry/backoff, fail-fast handling when an active index disappears, and graceful `SIGINT`/`SIGTERM` shutdown that waits for an in-flight sync to finish.
- Deterministic lifecycle, retry, no-overlap, shutdown, CLI-output, and real filesystem-sync tests.

### Compatibility

- No SQLite migration is required. `watch` is a CLI-only lifecycle around existing `getStatus` and `sync` semantics; it does not replace persisted scope, alter ordinary command output, or add an MCP mutation surface.
- Existing MCP tools remain read-only and never start, control, or wait for a watch session. Existing `affected` and Git-affected result contracts are unchanged.

### Deliberate limits

- `watch` is foreground polling, not a daemon, native filesystem-event watcher, cross-process coordinator, or background service. It scans the project catalog every interval and stops when its terminal process exits.
- It requires an initialized project and never runs `init` automatically. `--scope` is intentionally unavailable so a watcher cannot silently replace the active generation's stored scope.

## [0.7.0] - 2026-07-30

### Added

- Local Git-aware affected-test selection through `affected --working-tree` and `affected --base <ref>`. Working-tree mode compares `HEAD` with staged and unstaged work plus untracked files; base mode compares the local `merge-base(<ref>, HEAD)` with `HEAD` and never fetches.
- A small `GitChangeSetProvider` port and native `FileSystemGitChangeSetProvider` adapter. The adapter uses argv-only `execFile`, `--no-ext-diff`, `--no-textconv`, NUL-delimited output parsing, bounded command execution, and project-relative path validation.
- Immutable `changeSet` provenance for requested base, merge base, HEAD, untracked inclusion, deterministic Git records, rename/copy scores, and selected source paths. Both sides of a rename or copy remain visible to the active-generation graph query.
- Read-only, idempotent `symbol_lattice_affected_git` MCP tool when a Git-aware service capability is configured; existing MCP and explicit-path affected-test surfaces remain unchanged.

### Compatibility

- No SQLite migration is required. Existing graph queries and explicit-path `affected` behavior are unchanged.
- Older embedded services can omit the optional `GitChangeSetProvider`; they retain their existing MCP tool surface instead of exposing a partially configured Git tool.

### Deliberate limits

- Git selection is local file-level selection, not semantic Git diff, hunk-to-symbol mapping, runtime analysis, or test-runner discovery.
- Only supported TypeScript/JavaScript paths outside hard-excluded directories enter graph analysis. A Git change set with no such paths returns provenance with `affected: null`; more than 50 source paths fails explicitly rather than truncating.

## [0.6.0] - 2026-07-29

### Added

- `affected [filePaths...]` CLI command with Git-friendly `--stdin`, bounded `--depth` and `--limit`, project-relative/absolute path normalization, and stable JSON output.
- `SymbolLatticeService.affectedTests(projectPath, filePaths, options)` for changed-file test selection from the active graph generation.
- Read-only, idempotent `symbol_lattice_affected` MCP tool with capability detection, preserving the tool list of older explore-only embeddings.
- Deterministic affected-test evidence paths through exact persisted `imports` and `exports` edges, including barrel re-exports. A changed conventionally named test file is returned with a zero-edge `changed-test` proof.
- Shared conservative test-path classification for `*.test.*`, `*.spec.*`, `*.e2e.*`, and conventional test directories.
- Explicit analysis bounds and completeness reporting: indexed versus unindexed inputs, active index scope, stale index state, depth, visited-file, and result-limit omissions.

### Compatibility

- No SQLite migration is required. `affected` reads the active graph bundle only and remains compatible with older GraphStore adapters.
- Older adapters that do not persist index inputs return `indexScope: null`; the feature does not fabricate scope or source provenance.

### Deliberate limits

- `affected` is changed-file static analysis, not Git semantic diff or test-runner discovery. Git is an explicit caller-owned pipeline integration.
- Only exact persisted file-level import/export edges count as proof. Dynamic dispatch, runtime test discovery, unindexed paths, unsupported languages, and omitted traversal branches are surfaced as limitations rather than treated as safe.

## [0.5.0] - 2026-07-29

### Added

- `context <reference...>` CLI command for 1–8 ordered symbol references, with explicit caps for direct relationships, static proof hops, reverse-impact depth, and reverse-impact paths.
- Read-only, idempotent `symbol_lattice_context` MCP tool with structured output and capability detection, so existing explore-only embeddings retain their previous tool surface.
- Generation-bound multi-symbol context records: each reference preserves its `exact`, `ambiguous`, or `not_found` resolution, and exact records carry persisted source when available plus bounded callers, callees, and reverse impact. Ambiguous candidate lists are capped with an explicit truncation flag.
- Deterministic shortest directed evidence paths for adjacent exact references. Paths follow only exact resolved `calls` and `imports` edges, retain their original edge evidence, and report `no-path`, `not-applicable`, or traversal truncation explicitly when appropriate.
- An additive `impact` options overload and `impact --limit` CLI flag. Explicit limits return the deterministic path prefix together with `truncated`; existing unbounded impact responses keep their prior JSON shape.

### Compatibility

- No SQLite metadata or table migration is required. `context` reuses the v0.4.1 optional active-generation source-document bundle.
- Older GraphStore adapters and legacy generations remain graph-queryable. Exact context records use `source: null` with `sourceAvailability: "unavailable"` when persisted source cannot be supplied; they never fall back to live filesystem content.

### Deliberate limits

- Context references are explicit rather than natural-language retrieval. Evidence paths do not reverse edges, promote heuristic edges to proof, invent dynamic dispatch, or cross unsupported language/framework boundaries.

## [0.4.1] - 2026-07-29

### Fixed

- Exact `explore` responses now take their source excerpt from the same persisted active generation as the graph, relationships, and ranges. Changed or deleted live files can no longer be mixed with older graph evidence.

### Added

- The bundled `SymbolLatticeService` now returns additive `explore.sourceAvailability` to distinguish immutable `active-generation` source evidence from `unavailable` legacy/retrieval states and `not-applicable` non-exact matches; legacy external embeddings may omit it without inventing provenance.
- An optional, backward-compatible GraphStore source-document bundle read for exact generation-bound source evidence.

### Compatibility

- No SQLite metadata or table migration is required. Older GraphStore adapters and active generations remain graph-queryable; when they cannot provide persisted source text, `explore` returns `source: null` with `sourceAvailability: "unavailable"` instead of reading the live filesystem.

## [0.4.0] - 2026-07-29

### Added

- Generation-bound local FTS5 source retrieval across persisted TypeScript/TSX/JavaScript/JSX source text and identifier parts.
- `search <query>` CLI command with bounded `--limit`, project-relative `--path`, and `--language` filters.
- Persisted source hit evidence: deterministic rank, range, excerpt, direct source terms, lexical explanation, and overlapping symbol candidates.
- Read-only, idempotent `symbol_lattice_search` MCP tool with structured output; `symbol_lattice_explore` now also exposes structured output.
- Additive source-retrieval tables for source documents and a versioned FTS projection, committed atomically with the active graph generation under the SQLite v4 metadata marker.
- A `prepack` build gate so packaged artifacts always regenerate `dist` from the current source.

### Changed

- Query-only graph reads now load a lightweight active graph bundle instead of raw artifacts.
- `sync` treats a missing or outdated source-search projection as an explicit indexer-version change and can backfill it while reusing compatible raw facts.
- Search freshness is evaluated against the current project while every result excerpt and range remains bound to the persisted active generation.
- Existing v0.3 `GraphStore` adapters retain ordinary graph reads; source search stays explicitly unavailable until an adapter opts into the new retrieval capability.

### Upgrade notes

- SQLite v1-v4 indexes remain readable. The additive retrieval tables keep a v4 metadata marker so a v0.3 binary can still open and reindex after a rollback. A legacy active generation intentionally has no source-search projection; run `sync` or `index` before using `search`.
- The v0.4 source-search backfill reuses compatible v0.3 raw artifacts when safe. It never fabricates historical source evidence or index-work data.

### Deliberate limits

- Retrieval is local lexical FTS only. Embeddings, cloud search, semantic ranking, multi-symbol context assembly, and historical source browsing remain out of scope.

## [0.3.0] - 2026-07-29

### Added

- Local workspace package resolution from root `package.json` workspaces arrays or objects, including recursive/excluded patterns, root entries, explicit subpath exports, and safe entrypoint fallbacks.
- Workspace manifest tracking in the active generation fingerprint; duplicate names, malformed manifests, escaping entries, and out-of-scope targets now fail explicitly instead of guessing.
- TypeScript AST facts for named, wildcard, default-through-named, and namespace re-export syntax.
- Deterministic re-export export surfaces for multi-hop barrels, explicit-over-wildcard precedence, wildcard collision safety, cycle termination, and re-export route evidence.
- Incremental `sync` raw-artifact reuse based on file path, content hash, language, and extractor version.
- Reverse import/re-export dependency invalidation telemetry through persisted `lastIndexWork`; no-op sync does not publish a new generation.
- SQLite schema v4 with generation-bound index-work records and an atomic active-generation bundle read.

### Changed

- `sync` now rebuilds the complete cross-file projection from current raw facts after incremental extraction, preserving correctness for new exports, removals, aliases, barrels, and manifest changes.
- Project freshness now recognizes `indexer-version-changed` and treats the root and discovered workspace manifests as reproducibility inputs.
- Re-exported exact calls use `module.reexported-import-binding` evidence with a project-relative resolution path.
- Persisted v1-v3 raw facts missing re-export data are normalized at the storage boundary but cannot be reused until a compatible v0.3 extraction succeeds.

### Deliberate limits

- pnpm workspace YAML, watcher/daemon sync, namespace property dispatch, CommonJS `require`, and external dependency indexing remain out of scope.

## [0.2.1] - 2026-07-29

### Added

- Root `.gitignore`-aware, deterministic TypeScript/JavaScript source discovery with negation support and permanent tool/build-directory exclusions.
- Repeatable `--scope` indexing option with canonical, persisted project-relative scope roots.
- TypeScript/JavaScript `baseUrl` and `paths` module resolution using the TypeScript compiler API.
- Project-local `tsconfig.json` / `jsconfig.json` selection with tracked local `extends` chains.
- Generation-bound configuration input fingerprints and actionable freshness reasons: `project-inputs-changed`, `configuration-invalid`, and `configuration-untracked`.
- SQLite schema v3 migration for active-generation index inputs; v1 and v2 graph snapshots remain readable without fabricated historical provenance.

### Changed

- Alias imports and their explicit imported calls now retain configuration-path evidence when configuration participated in resolution.
- `index` and `sync` reuse the previous successful scope unless a new `--scope` is supplied.
- Invalid or unsupported project configuration fails explicitly before replacing the active graph generation.

### Deliberate limits

- Only the root `.gitignore` controls discovery in this version; nested ignore files remain out of scope.
- External/package TypeScript `extends`, project references, workspaces, re-exports, CommonJS `require`, watchers, and incremental synchronization are not yet supported.

## [0.2.0] - 2026-07-29

### Added

- An active graph generation for a durable, identifiable successful index.
- Persisted artifact facts for symbols, structural edges, pending references, and TypeScript/JavaScript binding data.
- Per-edge resolution evidence with a rule ID, stage, and considered candidates.
- Read-only `explain-edge` CLI command and `symbol_lattice_explain_edge` MCP tool.
- A shared runtime version contract for the CLI and MCP server.

### Changed

- Complete rebuilds now replace graph, artifact facts, evidence, and active-generation metadata atomically.
- Existing v0.1 indexes remain readable; one explicit `sync` upgrades them to the v0.2.0 evidence model.

### Not yet included

- Watchers, automatic sync, incremental indexing, path aliases, full-text search, and additional language adapters.

## [0.1.0] - 2026-07-29

### Added

- Initial TypeScript/JavaScript local symbol graph.
- Explicit full indexing, caller/callee/impact queries, and read-only MCP exploration.
- `exact`, `heuristic`, and `unresolved` relationship states.

[Unreleased]: https://github.com/HsinPu/symbol-lattice/compare/v0.35.0...HEAD
[0.35.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.34.0...v0.35.0
[0.34.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.33.0...v0.34.0
[0.33.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.32.0...v0.33.0
[0.32.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.31.0...v0.32.0
[0.31.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.30.0...v0.31.0
[0.30.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.29.0...v0.30.0
[0.29.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.28.0...v0.29.0
[0.28.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.27.0...v0.28.0
[0.27.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.26.0...v0.27.0
[0.26.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.25.0...v0.26.0
[0.25.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/HsinPu/symbol-lattice/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/HsinPu/symbol-lattice/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/HsinPu/symbol-lattice/releases/tag/v0.1.0
