<div align="center">

# SymbolLattice

**Evidence-first, queryable local code intelligence**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.150.0 is an early developer release. The package is not published to npm; run it from source.

SymbolLattice builds a queryable local code-symbol graph for a project. Each relation retains its source rule, resolution stage, and confidence. Source remains in the indexed project's `.symbol-lattice/index.sqlite` and is never silently uploaded.

## Highlights

- Builds AST-backed facts for files, symbols, imports/exports, type hierarchy, routes, entrypoints, and cross-file relations.
- Makes uncertainty explicit: relations are `exact`, `heuristic`, or `unresolved`, never silently upgraded to certainty.
- Covers frontend, backend, JVM, systems, data, IaC, template, and schema languages with bounded, auditable framework route extraction.
- Offers CLI and read-only MCP queries for symbols, relations, routes, entrypoints, impact, history, diffs, and index status.

## Quick start

Requires Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Explicitly create a local index
node dist/cli/main.js init /path/to/project

# Read-only queries; explicitly sync only after source changes
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js routes --project /path/to/project --domain api.example.test
node dist/cli/main.js sync /path/to/project

# Start a read-only MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
```

On Windows PowerShell, use `npm.cmd` if `npm` is unavailable. Filesystem roots and home directories are rejected unless `--force` is explicit.

## v0.150.0

- Adds same-file direct Sanic Blueprint routes: `Blueprint(..., url_prefix="/...")`, `app.blueprint(bp)`, and the Blueprint's direct decorator routes.
- A Blueprint may be mounted before or after its route decorator; only proven import, app, Blueprint, literal prefix/path/method, and no-rebinding combinations become `exact`. Repeated mounts of the same app–Blueprint pair conservatively emit no exact route.
- Artifact facts advance to `multi-language-ast-v131`; the project resolver remains `project-resolver-v38`.

## Deliberate limits

- This is not a compiler, type checker, framework runtime, or execution tracer.
- Dynamic dispatch, reflection, macro expansion, code generation, dependency injection, and ambiguous names never become exact graph relations.
- GoFrame Domain extraction accepts only proven literal, non-wildcard hosts. Dynamic values, empty entries, wildcards, and rebound receivers remain unresolved.
- Chained GoFrame receivers are limited to a `g.Server()` root and a finite literal `Domain`/one-argument `Group` chain. Arbitrary method calls, dynamic prefixes, variable propagation, and unsupported callback forms never become exact relations.
- Cross-file GoFrame standard routing supports only statically proven direct pointers (`&Controller{}` / `new(Controller)`), no-argument `Factory()` calls, and one unrebound same-function pointer/factory alias. A pointer alias may use `:=`, or one directly initialized `var`; a declared type must be the matching pointer type. A factory alias may use `:=` or one untyped directly initialized `var`. Each `Bind(...)` argument must prove itself independently; slice expansion, dynamic values, globals, grouped/multi-value var declarations, typed factory vars, forwarding, branches, map/interface/DI containers, callback shadowing, rebinding, and ambiguity never become `exact`. Explicit import aliases are accepted directly; default imports require a matching target `package` clause and are never inferred from the import path. `.`/`_` imports, external/transitive modules, `replace`, nested-module selection, and build tags remain unresolved.
- Unbound GoFrame request-signature candidates are always `heuristic`, never proof of runtime route registration; reflection, dynamic Bind calls, and unknown prefixes or hosts remain unresolved.
- Iris currently supports only `iris.New()`, one named handler, literal `Party` prefixes, and `Handle` with a standard uppercase method. `Default`, MVC, middleware, custom or lowercase methods, dynamic paths, and rebound receivers never become `exact`.
- Beego currently supports only direct v2 `web` package functional HTTP methods. Namespaces, controller/MVC, Router, annotations, middleware, dynamic paths, and rebound package aliases never become `exact`.
- Gorilla/mux currently supports only direct `mux.NewRouter()` `HandleFunc` registrations and one `Methods` chain. Subrouters, PathPrefix, Host, Headers, Schemes, middleware, other matcher chains, dynamic values, and rebinding never become `exact`.
- HttpRouter currently supports only direct `httprouter.New()` HTTP methods. `Handle`, `Handler`, `HandlerFunc`, automatic OPTIONS behavior, wrappers, dynamic values, and rebinding never become `exact`.
- Rails currently supports only literal verb, `resources`, and `resource` declarations inside direct `Rails.application.routes.draw` blocks, with standard actions and array-shaped `only`/`except` filters. Namespaces, scopes, nested resources, custom paths/controllers, single-symbol filters, dynamic values, and non-unique conventional file/class/action evidence never become `exact`.
- Starlette currently supports only direct imports, top-level literal `Route` lists, and same-file top-level named function endpoints mounted through `Starlette(routes=...)`. `Mount`/`Router`, class endpoints, mixed or dynamic lists, tuples, unsupported `Route` options, cross-file routes, handlers declared after routes, rebinding, and ambiguity never become `exact`.
- aiohttp currently supports direct `from aiohttp import web`, `web.Application()`, top-level `app.router.add_get`/`add_post`/`add_put`/`add_patch`/`add_delete`/`add_head`/`add_route`, plus named or inline literal `app.router.add_routes([web.get(...)])` tables and same-file top-level named function handlers. `RouteTableDef`, decorators, class views, subapps, dynamic values, non-uppercase or wildcard `route`/`add_route` methods, non-literal `allow_head`, handlers declared after their entry, rebinding, and ambiguity never become `exact`.
- Sanic currently supports direct application decorators and same-file direct `Blueprint(..., url_prefix=...)` plus `app.blueprint(bp)`. Cross-file Blueprint imports, Blueprint groups/copies, registration options, `Sanic.get_app`, `add_route`, class views, WebSockets, versioning or other configuration, dynamic paths or methods, non-uppercase or wildcard methods, external handlers, rebinding, and ambiguity never become `exact`.
- Other frameworks expose only implemented, evidence-backed slices; see [CHANGELOG.md](CHANGELOG.md) for the full history.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```
