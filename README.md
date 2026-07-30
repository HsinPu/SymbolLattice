<div align="center">

# SymbolLattice

**Evidence-first local code intelligence for TypeScript, JavaScript, ArkTS/ArkUI, Vue, Svelte, Astro, Razor/Blazor, Terraform/OpenTofu, Shopify Liquid, Solidity, CFML/CFScript, Python, Go, Rust, Java, PHP, C, Lua, R, Elixir, Erlang, Clojure, Perl, Julia, Haskell, OCaml, F#, Nim, C++, C#, Ruby, Kotlin, Swift, Dart, and Scala projects.**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[Quick start](#quick-start) | [Type hierarchy](#direct-type-hierarchy-evidence) | [Routes](#static-route-and-client-navigation-evidence) | [Nest entrypoints](#nestjs-non-http-entrypoint-evidence) | [Node inspection](#generation-bound-node-inspection) | [History and diff](#retained-graph-history-and-structural-diff) | [Auto sync](#opt-in-foreground-watch) | [Affected tests](#affected-test-evidence) | [Git hunks](#immutable-git-hunk-declaration-attribution) | [Context packs](#bounded-multi-symbol-context) | [Commands](#command-reference) | [MCP](#mcp-server) | [Architecture](#architecture) | [Roadmap](#roadmap) | [Comparison](#release-by-release-feature-comparison)

</div>

> [!IMPORTANT]
> **v0.68.0** is an early developer release. This public repository runs from source; its npm package is intentionally private and is not published to npm.

SymbolLattice builds a local symbol graph without hiding uncertainty. It keeps syntax-proven artifact facts, resolves cross-file relationships conservatively, and records why every resolved edge exists. The graph stays local to the inspected project under `.symbol-lattice/index.sqlite`.

## Why SymbolLattice?

- **Evidence-first** - resolved edges retain a rule ID, resolution stage, considered symbols, relevant configuration paths, and re-export route when applicable.
- **Safe freshness** - source hashes and project inputs are stored with each active generation; `status` reports drift instead of silently rebuilding.
- **Workspace-aware** - local npm/Yarn-style workspaces can resolve package roots and explicit subpath exports without reading `node_modules`.
- **Incremental parsing, atomic publication** - `sync` only reparses changed source artifacts when their persisted facts are compatible, then atomically publishes one fresh project graph.
- **Event-accelerated foreground freshness** - opt-in `watch` uses native filesystem events when the host supports them, exposes bounded pending-path evidence in its own stream, coalesces saves, retains bounded polling as a safety sweep, and invokes the same atomic `sync` only after drift.
- **Generation-bound source evidence** - `search` and exact `explore` results use source captured with the active graph generation, even when the live project has since drifted.
- **Declaration-focused node view** - exact `node` results return the full persisted declaration range plus a bounded declaration body, direct callers/callees, and explicit limits from one active generation without substituting live source text.
- **Static route evidence** - narrow Express, Fastify, NestJS, Python FastAPI/Flask, Go Gin/`net/http`/Chi, Rust Axum, Java Spring Web, PHP Laravel, C CivetWeb, Lua Lapis, R Plumber, Elixir Phoenix, Erlang Cowboy, Clojure Compojure, Perl Dancer2, Julia Genie, Haskell Scotty, OCaml Dream, F# Giraffe, Nim Jester, C++ cpp-httplib, C# ASP.NET Core, Ruby Rails, Kotlin Ktor, Swift Vapor, Scala/Java Play HTTP packs, and Flutter, Vue Router, SvelteKit, Astro, Blazor, React Router, and Next.js client-navigation routes create first-class `route` nodes and evidence-bearing `routes` edges only when the registration and handler form are statically proven. Literal Play `->` Router mounts are retained separately as evidence-bearing `handles` relationships, never fabricated HTTP endpoints.
- **Vue SFC + Vue Router navigation evidence** - direct `.vue` default component exports and a narrowly proven `createRouter({ routes })` configuration can form exact cross-file `NAVIGATE` edges through a unique relative Vue module, with the same route query and source-search surfaces as every other indexed language.
- **Svelte SFC + SvelteKit navigation evidence** - validated `.svelte` files expose a conventional default component plus direct instance-script declarations; static `src/routes/**/+page.svelte` paths form exact local `NAVIGATE` evidence only for literal filesystem segments.
- **Astro SFC + Astro page navigation evidence** - validated `.astro` frontmatter exposes a conventional default component plus direct declarations; static `src/pages/**/*.astro` paths form exact local `NAVIGATE` evidence only for literal page segments.
- **Razor + Blazor navigation evidence** - each `.razor` component exposes a conventional local component; each standalone, literal `@page` directive forms an exact local `NAVIGATE` edge, including literal parameter templates.
- **ArkTS + ArkUI root evidence** - complete direct `@Component struct` declarations in `.ets` files become components; a same-stack `@Entry` declaration creates an exact local `ui root` entrypoint rather than a guessed navigation route.
- **Terraform/OpenTofu declaration evidence** - complete top-level literal `resource`, `data`, `module`, `variable`, and `output` blocks in `.tf`, `.tfvars`, and `.tofu` files become audited IaC symbols; outputs retain export evidence without fabricating dependency or deployment facts.
- **Shopify Liquid template-call evidence** - complete literal `render`, `include`, and `section` tags in `.liquid` files become exact project-local calls to indexed snippet or section files when—and only when—the target path exists.
- **Solidity declaration and hierarchy evidence** - complete top-level `contract`, `interface`, and `library` declarations plus their complete direct callable members become auditable symbols; a simple `is Base, Other` clause becomes a hierarchy edge only when a unique target in the same source file proves its kind.
- **CFML / CFScript declaration evidence** - complete braced `component` / `interface` declarations, tag-based `<cfcomponent>` / `<cfinterface>` containers, and conventional CFC components become auditable symbols only with complete direct named function members.
- **Non-HTTP and UI transport evidence** - AST-proven NestJS GraphQL, microservice, and WebSocket entrypoints, plus direct ArkUI UI roots, use distinct `entrypoint` nodes and exact `handles` edges, so a message pattern, subscription, or UI root is never mislabeled as an HTTP route.
- **Direct type-hierarchy evidence** - AST-proven `extends` and `implements` edges preserve value/type namespace proof, type-only imports, re-export provenance, unresolved bases, and bounded direct parent/child views without pretending to have a full type checker.
- **Bounded context packs** - ordered symbol references produce persisted source, capped relationship/impact summaries, and static directed evidence paths without guessing ambiguous symbols or dynamic behavior.
- **Affected-test evidence** - changed indexed files map to conventionally named tests through bounded, exact import/export proof paths; explicit paths, `--working-tree`, and `--base <ref>` retain stale, scope, depth, visit, and result limits in the response.
- **Immutable Git hunk attribution** - `git-hunks` compares a local merge base with `HEAD` through immutable Git blobs, returns zero-context hunks, and anchors declarations independently in each revision without an active graph or a cross-revision identity claim.
- **Retained graph history** - up to five immutable graph generations can be listed and structurally compared without reading Git, live source text, or hidden background state.
- **Agent-safe MCP** - MCP tools are read-only and never initialize or refresh a project.

## Quick start

### Requirements

- Node.js `>=22.13 <25`
- npm

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Create the first graph for a project.
node dist/cli/main.js init /path/to/project

# Inspect a stored relationship.
node dist/cli/main.js explain-edge "edge:<edge-id>" --project /path/to/project
```

On Windows, use `npm.cmd` if `npm` is not available directly in PowerShell.

> [!WARNING]
> SymbolLattice refuses to index a filesystem root or home directory unless `--force` is supplied deliberately.

### Typical workflow

```bash
# Query symbols after indexing.
node dist/cli/main.js find add --project /path/to/project
node dist/cli/main.js callers "src/math.ts#add" --project /path/to/project
node dist/cli/main.js node "src/math.ts#add" --project /path/to/project
node dist/cli/main.js hierarchy "src/models.ts#User" --project /path/to/project --limit 25
node dist/cli/main.js routes /path/to/project --method GET --path /api --limit 20
node dist/cli/main.js routes /path/to/project --method NAVIGATE --path /settings --limit 20
node dist/cli/main.js entrypoints /path/to/project --transport graphql --operation query --name author --limit 20
node dist/cli/main.js entrypoints /path/to/project --transport ui --operation root --name Home --limit 20
node dist/cli/main.js search "session timeout" --project /path/to/project --path src
node dist/cli/main.js search "health" --project /path/to/project --language python
node dist/cli/main.js search "health" --project /path/to/project --language go
node dist/cli/main.js search "health" --project /path/to/project --language java
node dist/cli/main.js search "health" --project /path/to/project --language php
node dist/cli/main.js search "health" --project /path/to/project --language c
node dist/cli/main.js search "health" --project /path/to/project --language lua
node dist/cli/main.js search "health" --project /path/to/project --language r
node dist/cli/main.js search "health" --project /path/to/project --language elixir
node dist/cli/main.js search "health" --project /path/to/project --language erlang
node dist/cli/main.js search "health" --project /path/to/project --language clojure
node dist/cli/main.js search "health" --project /path/to/project --language perl
node dist/cli/main.js search "health" --project /path/to/project --language julia
node dist/cli/main.js search "health" --project /path/to/project --language haskell
node dist/cli/main.js search "health" --project /path/to/project --language ocaml
node dist/cli/main.js search "health" --project /path/to/project --language fsharp
node dist/cli/main.js search "health" --project /path/to/project --language nim
node dist/cli/main.js search "health" --project /path/to/project --language cpp
node dist/cli/main.js search "health" --project /path/to/project --language csharp
node dist/cli/main.js search "health" --project /path/to/project --language ruby
node dist/cli/main.js search "health" --project /path/to/project --language kotlin
node dist/cli/main.js search "health" --project /path/to/project --language swift
node dist/cli/main.js search "health" --project /path/to/project --language dart
node dist/cli/main.js search "health" --project /path/to/project --language scala
node dist/cli/main.js search "HomeView" --project /path/to/project --language vue
node dist/cli/main.js search "Catalog" --project /path/to/project --language svelte
node dist/cli/main.js search "Catalog" --project /path/to/project --language astro
node dist/cli/main.js search "Catalog" --project /path/to/project --language razor
node dist/cli/main.js search "Home" --project /path/to/project --language arkts
node dist/cli/main.js search "aws_instance" --project /path/to/project --language terraform
node dist/cli/main.js search "product-card" --project /path/to/project --language liquid
node dist/cli/main.js search "format" --project /path/to/project --language cfml
node dist/cli/main.js context "src/consumer.ts#calculate" "src/math.ts#add" --project /path/to/project

# Select affected tests from changed files already present in the active generation.
node dist/cli/main.js affected src/math.ts --project /path/to/project
git diff --name-only HEAD | node dist/cli/main.js affected --stdin --project /path/to/project

# Or let SymbolLattice read a local Git change set without fetching or syncing.
node dist/cli/main.js affected --working-tree --project /path/to/project
node dist/cli/main.js affected --base origin/main --project /path/to/project

# Attribute immutable zero-context Git hunks to declarations extracted per revision.
node dist/cli/main.js git-hunks /path/to/project --base origin/main --limit 10

# Inspect freshness before an explicit update.
node dist/cli/main.js status /path/to/project
node dist/cli/main.js sync /path/to/project

# List immutable retained graph generations, then compare two returned IDs.
node dist/cli/main.js history /path/to/project
node dist/cli/main.js diff "generation:<older-id>" /path/to/project --to "generation:<newer-id>"

# Or keep an already initialized local graph fresh in this terminal.
node dist/cli/main.js watch /path/to/project
```

One-shot data commands emit stable, pretty JSON. `watch` is the deliberate streaming exception: it emits one compact NDJSON receipt per line. `--json` is retained as a forward-compatible script flag.

## Capabilities

| Area | v0.68.0 behavior |
| --- | --- |
| Source files | TypeScript, TSX, JavaScript, JSX, ArkTS/ArkUI, Vue SFC, Svelte SFC, Astro SFC, Razor/Blazor components, Terraform/OpenTofu HCL, Shopify Liquid, Solidity, CFML/CFScript, Python, Go, Rust, Java, PHP, C, Lua, R, Elixir, Erlang, Clojure, Perl, Julia, Haskell, OCaml, F#, Nim, C++, C#, Ruby, Kotlin, Swift, Dart, and Scala (`.ets`, `.vue`, `.svelte`, `.astro`, `.razor`, `.tf`, `.tfvars`, `.tofu`, `.liquid`, `.sol`, `.cfc`, `.cfm`, `.cfs`, `.c`, `.lua`, `.r`, `.ex`, `.exs`, `.erl`, `.clj`, `.pl`, `.pm`, `.jl`, `.hs`, `.ml`, `.fs`, `.nim`, `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx`, `.cs`, `.rb`, `.kt`, `.swift`, `.dart`, `.scala`; plus Play `conf/routes` and `conf/*.routes` route tables) |
| F# + Giraffe | Direct top-level typed `HttpFunc` / `HttpContext` handlers plus exactly one `open Giraffe` proof and a direct literal `choose [` route table. Fixed HTTP verbs and plain `route "/..."` entries become exact same-file or explicit unresolved route evidence. |
| Nim + Jester | Direct top-level zero-argument `proc` handlers plus exactly one direct `import` list containing `jester`, then a flat `routes:` or `router name:` literal route block. Fixed lowercase HTTP verbs become exact same-file or explicit unresolved route evidence. |
| Vue + Vue Router | Vue `.vue` files contribute a file symbol plus direct inline JavaScript/TypeScript script declarations and an auditable default component export. In TypeScript/JavaScript router modules, exactly one direct `createRouter` import plus one top-level literal `routes` option emits `NAVIGATE` route evidence; direct default imports can resolve exactly through `.vue` modules. |
| Svelte + SvelteKit | Validated Svelte `.svelte` files contribute a conventional default component and direct instance-script declarations. Static `src/routes/**/+page.svelte` files with literal path segments emit exact local `NAVIGATE` route evidence; bracket and route-group conventions are intentionally excluded. |
| Astro | Validated Astro `.astro` frontmatter contributes a conventional default component and direct declarations. Static `src/pages/**/*.astro` files with literal page segments emit exact local `NAVIGATE` route evidence; bracket, leading-underscore, endpoint, and runtime forms are intentionally excluded. |
| Razor + Blazor | Every `.razor` file contributes a conventional local `default` component. Only standalone, unescaped, slash-prefixed literal `@page` directives become exact local `NAVIGATE` evidence; multiple literal route templates are preserved. |
| ArkTS + ArkUI | Complete direct `@Component struct` declarations in `.ets` files become component symbols. A direct same-stack `@Entry` component creates an exact `ui root` entrypoint and local `handles` evidence; it is not a route or navigation claim. |
| Terraform / OpenTofu | Complete line-leading top-level literal `resource`, `data`, `module`, `variable`, and `output` blocks emit exact local declaration evidence. Resource/data blocks use the additive `resource` kind, modules use the additive `module` kind, and outputs retain export facts. |
| Shopify Liquid | Complete literal `render`, `include`, and `section` tags emit an exact project-local `calls` edge only when the expected `snippets/<name>.liquid` or `sections/<name>.liquid` target exists; missing targets remain explicit unresolved evidence. |
| Solidity | Complete top-level `contract`, `interface`, and `library` declarations plus complete direct callable members emit exact `contains` evidence. A simple literal `is Base, Other` clause emits an exact hierarchy edge only when one same-file declaration proves each target kind. |
| CFML / CFScript | Complete braced `component` / `interface` declarations, complete tag-based `<cfcomponent>` / `<cfinterface>` containers with named `<cffunction>` members, and conventional implicit CFC components emit exact local `contains` evidence. |
| Scope | Project root by default or repeatable, persisted `--scope` directories |
| Discovery | Root `.gitignore` with negation; `.git`, `.symbol-lattice`, `coverage`, `dist`, and `node_modules` are always excluded |
| Symbols | TypeScript/JavaScript: files, classes, functions, methods, interfaces, types, variables, routes, and entrypoints. Python: files, classes, functions, methods, and direct FastAPI / same-file or proven cross-file `APIRouter` / same-file Flask routes. Go: files, top-level functions, and direct Gin / `net/http` / Chi routes. Rust: files, top-level functions, and direct Axum routes. Java: files, direct top-level classes and methods, direct Spring Web routes, and direct package facts usable by Play controller resolution. PHP: files, direct top-level classes, methods, functions, and direct Laravel facade routes. C: files, direct top-level functions, and direct CivetWeb routes. Lua: files, direct top-level `function` / `local function` declarations, and direct Lapis routes. R: files, direct top-level braced `name <- function(...)` / `name = function(...)` declarations, and direct Plumber annotation routes. Elixir: files, direct top-level `defmodule` declarations represented by the existing `class` kind, direct module `def` / `defp` methods, and direct Phoenix Router routes. Erlang: files, direct `-module(...)` declarations represented by the existing `class` kind, direct simple top-level functions, and direct Cowboy dispatch routes. Clojure: files, direct `ns` declarations represented by the existing `class` kind, direct simple top-level `defn` functions, and direct Compojure routes. Perl: files, direct `package` declarations represented by the existing `class` kind, direct simple top-level `sub` functions, and direct Dancer2 routes. Julia: files, direct top-level one-line `name(...) = ...` functions, and direct Genie routes. C++: files, direct top-level classes, methods, functions, and direct cpp-httplib routes. C#: files, direct top-level classes, interfaces, methods, local functions, and direct ASP.NET Core routes. Ruby: files, direct top-level classes, methods, functions, and direct Rails routes. Kotlin: files, direct top-level classes, interfaces, methods, functions, and direct Ktor routes. Swift: files, direct top-level classes, structs, protocols, methods, functions, and direct Vapor routes. Dart: files, direct top-level classes, methods, functions, and direct Flutter named-navigation routes. Scala: files, direct top-level classes, objects, traits, methods, functions, direct Play route-table entries, and literal Play Router-mount nodes. CFML/CFScript: files, complete braced or tag-based component/interface containers, conventional implicit CFC component classes, direct named methods, and standalone complete top-level CFScript functions. |
| Relationships | TypeScript/JavaScript: `contains`, module imports/exports, direct identifier calls, evidence-bearing `routes` and `handles`, plus direct `extends` / `implements`. Python: syntax-proven `contains` plus direct FastAPI and Flask `routes`. Go: syntax-proven `contains` plus direct Gin, `net/http`, and Chi `routes`. Rust: syntax-proven `contains` plus direct Axum `routes`. Java: syntax-proven `contains` plus direct Spring Web `routes` and exact Play controller-action targets when one direct Java package/class/method proves the route. PHP: syntax-proven `contains` plus direct Laravel `routes`, exact only for same-file controller methods and explicitly unresolved otherwise. C: syntax-proven `contains` plus direct CivetWeb `ALL` routes to exact same-file top-level functions. Lua: lexical `contains` plus direct Lapis `GET` / `POST` / `PUT` / `DELETE` / `ALL` routes to exact same-file prior local-function handlers. R: lexical `contains` plus direct Plumber `GET` / `POST` / `PUT` / `DELETE` annotation routes to exact same-file braced anonymous function handlers. Elixir: lexical `contains` plus direct Phoenix `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS` / `TRACE` / `CONNECT` routes; a full-module controller atom action resolves exactly only to one direct same-file module method, otherwise remains explicit `unresolved`. Erlang: lexical `contains` plus direct Cowboy `ALL` wildcard-host routes; a handler resolves exactly only to one same-module exported `init/2` method, otherwise remains explicit `unresolved`. Clojure: lexical `contains` plus direct Compojure `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS` routes; a handler resolves exactly only to one same-file `defn`, otherwise remains explicit `unresolved`. Perl: lexical `contains` plus direct Dancer2 `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `OPTIONS` routes; a handler resolves exactly only to one same-file simple `sub`, otherwise remains explicit `unresolved`. Julia: lexical `contains` plus direct Genie `GET` default and literal `POST` / `PUT` / `PATCH` / `DELETE` / `OPTIONS` method-keyword routes; a handler resolves exactly only to one same-file one-line function, otherwise remains explicit `unresolved`. C++: syntax-proven `contains` plus direct cpp-httplib `routes` to exact same-file top-level functions. C#: syntax-proven `contains` plus direct ASP.NET Core Minimal API and MVC controller `routes` to exact same-file handlers. Ruby: syntax-proven `contains` plus direct Rails `routes`, exact only for same-file non-namespaced controller methods and explicitly unresolved otherwise. Kotlin: syntax-proven `contains` plus direct Ktor `routes` to exact same-file top-level callable-reference functions. Swift: syntax-proven `contains` plus direct Vapor `routes` to exact same-file named functions. Dart: syntax-proven `contains` plus direct Flutter `NAVIGATE` routes to exact same-file widget classes. Scala: syntax-proven `contains` plus direct Play `conf/routes` entries that resolve exactly only with one direct Scala-or-Java package, one matching indexed class/object, and one direct method; literal `->` Router mounts become exact or unresolved `handles` edges and never appear as concrete `routes` results |
| Module resolution | Relative paths, TypeScript/JavaScript `baseUrl` and `paths`, then local workspace packages; Python has a deliberately narrow, regular-package proof for direct one-dot FastAPI router imports; Go, Rust, Java, PHP, C, Lua, R, Elixir, Erlang, Clojure, Perl, Julia, Haskell, OCaml, C++, C#, Ruby, Kotlin, Swift, Dart, Scala, and CFML have no generic module resolver in this release |
| F# module resolution | No generic F# module, project, package, or cross-file handler resolver in this release. |
| Nim symbols and routes | Files, direct top-level zero-argument `proc` declarations, and direct Jester routes with exact same-file or explicit unresolved evidence. |
| Nim module resolution | No generic Nim module, package, macro, project, or cross-file handler resolver in this release. |
| Vue symbols and relationships | One audited inline JavaScript/TypeScript `<script>` block yields direct top-level declarations; a supported direct default export is retained as an export binding. A Vue Router static route emits an evidence-bearing `NAVIGATE` `routes` reference to its same-file or uniquely resolved imported component. |
| Vue module resolution | Relative TypeScript/JavaScript module resolution includes a unique `.vue` candidate. Only audited direct Vue SFC default-export forms participate; implicit `script setup` compiler exports remain deliberately unresolved. |
| Svelte symbols and relationships | A validated Svelte SFC emits a conventional `default` component plus direct top-level instance-script functions, classes, interfaces, type aliases, and identifier variables. A static SvelteKit page emits a `NAVIGATE` `routes` reference to that local default component. |
| Svelte module resolution | Relative TypeScript/JavaScript module resolution includes a unique `.svelte` candidate. Only the conventional SFC default component participates; template semantics and compiler-generated exports remain deliberately unresolved. |
| Astro symbols and relationships | A validated optional opening frontmatter fence emits a conventional `default` component plus direct frontmatter functions, classes, interfaces, type aliases, and identifier variables. A static Astro page emits a `NAVIGATE` `routes` reference to that local default component. |
| Astro module resolution | Relative TypeScript/JavaScript module resolution includes a unique `.astro` candidate. Only the conventional SFC default component participates; frontmatter imports and template/client-script semantics remain deliberately unresolved. |
| Razor/Blazor symbols and relationships | Each `.razor` file emits a file symbol and a conventional local `default` component. Every accepted literal `@page` directive emits one `NAVIGATE` route and an exact local component `routes` edge. |
| Razor/Blazor module resolution | No generic Razor namespace, project, package, template-component, or C# code-block resolver is claimed in this release. |
| ArkTS/ArkUI symbols and relationships | A complete direct `@Component struct` emits a local class-kind component symbol. A same adjacent decorator stack containing `@Entry` emits `ui root <Component>` and an exact local `handles` edge; direct `export` immediately before `struct` is retained as an export binding. |
| ArkTS/ArkUI module resolution | No generic ArkTS module, package, UI DSL, state-decorator, or cross-file component resolver is claimed in this release. |
| Terraform/OpenTofu symbols and relationships | Complete line-leading top-level literal `resource`, `data`, `module`, `variable`, and `output` blocks emit evidence-bearing `contains` relationships. `resource` / `data` use the additive `resource` kind, `module` uses the additive `module` kind, and `output` becomes an exported variable symbol. |
| Terraform/OpenTofu module resolution | No Terraform/OpenTofu module-source, provider, dependency, plan, apply, state, or runtime resolver is claimed in this release. |
| Shopify Liquid relationships | Complete literal `render` / `include` tags target only `snippets/<name>.liquid`; complete literal `section` tags target only `sections/<name>.liquid`. Existing indexed target files receive exact `calls` edges; missing targets receive explicit unresolved `calls` evidence. |
| Shopify Liquid module resolution | No general Liquid import, layout, theme inheritance, remote snippet, JSON-template, schema, object/property, filter, or runtime resolver is claimed in this release. |
| Solidity symbols and relationships | Complete top-level ASCII-named `contract`, `interface`, and `library` declarations emit class/interface symbols; complete direct `function`, `modifier`, `constructor`, `fallback`, and `receive` members emit contained method symbols. A simple `is Base, Other` clause yields exact same-file `extends` or `implements` evidence only when a unique target declaration proves the relation kind. |
| Solidity module resolution | No Solidity import, cross-file inheritance, inherited constructor-argument, call, compiler, ABI, bytecode, storage, proxy, or runtime-chain resolver is claimed in this release. |
| CFML / CFScript symbols and relationships | Complete braced `component` / `interface` containers and tag-based `<cfcomponent>` / `<cfinterface>` containers emit class/interface symbols. Complete direct named CFScript functions and complete named `<cffunction>` tags emit contained methods; a `.cfc` with complete top-level CFScript functions can emit a conventional local component. |
| CFML / CFScript module resolution | No `cfinclude`, `import`, inheritance, call, framework, query, compiler, or runtime resolver is claimed in this release. |
| Workspaces | Root `package.json` workspaces array/object, local package root/subpath `exports`, and entrypoint fallback |
| Re-exports | Named aliases, `export *`, default-through-named aliases, and namespace-export provenance |
| Retrieval | Local deterministic FTS5 search across persisted source text and identifier parts; bounded path/language filters, source/symbol evidence, and exact `explore` excerpts from the same active generation |
| Node inspection | Exact ID, qualified-name, simple-name, or `path:line[:column]` matches can return the persisted declaration range, capped direct callers/callees, source provenance, truncation, and active freshness from one generation |
| Routes | Static AST-proven Express literal registrations; Fastify shorthand/full-object registrations plus inline, same-file named, and imported/re-exported plugin `register(..., { prefix })` projection; direct NestJS controller decorators plus `RouterModule.register()` module-prefix projection; direct same-file FastAPI application decorators plus same-file and one-dot package-relative cross-file `APIRouter` / literal `include_router(...)` composition; direct Flask application decorators and same-file literal `Blueprint` / `register_blueprint(...)` composition; direct Go Gin engine / literal same-function `RouterGroup` composition, direct `net/http` `HandleFunc` / same-function `ServeMux` composition, and direct Chi `NewRouter` / `NewMux` method registrations; direct Rust Axum `Router::new().route(...)` builder chains; direct Java Spring Web controller method annotations with literal paths; direct PHP Laravel facade controller-action routes; direct C CivetWeb literal `mg_set_request_handler(...)` routes represented as `ALL`; direct Lua Lapis literal `get` / `post` / `put` / `delete` / `match` routes with prior local handlers; direct R Plumber `#*` / `#'` literal `@get` / `@post` / `@put` / `@delete` annotations with immediately following braced anonymous handlers; direct Elixir Phoenix Router module-level `use Phoenix.Router`, literal `scope` composition, and full-module controller atom-action verb routes; direct Erlang Cowboy `cowboy_router:compile([{'_', [{"/literal", handler_module, InitialState}]}])` wildcard-host dispatch routes; direct Clojure Compojure `ns` `compojure.core` refer proof plus `defroutes` literal verb routes with direct named handlers; direct Perl Dancer2 named-coderef routes; direct Julia Genie named-handler routes with a literal optional method keyword; direct C++ cpp-httplib named-handler routes; direct C# `WebApplication` Minimal API `Map*` and `ApiController` MVC method attributes; direct Ruby `Rails.application.routes.draw` literal controller-action routes; direct Kotlin Ktor `Application.module` `routing` callable-reference routes; direct Swift Vapor `routes(_ app: Application)` literal segment routes with same-file named handlers; direct Dart Flutter `MaterialApp(routes: {...})` same-file widget navigation; direct Scala/Java Play `conf/routes` literal controller-action entries with exact unique package-class-method handlers or explicit unresolved evidence, plus literal `->` Router mount `handles` evidence; recursively composed literal React Router JSX `Route`, `createRoutesFromElements(...)`, and v6.4+ data-router navigation; and convention-derived Next.js Pages/App Router page routes. All concrete HTTP/browser registrations use bounded `routes` listing and exact or deliberately unresolved handler evidence; browser routes use `NAVIGATE`, never fabricated HTTP `GET` |
| Vue Router routes | Exactly one direct, unaliased `createRouter` import from `vue-router`, exactly one top-level `createRouter({ routes })` form, and literal slash-prefixed route records with named component identifiers. These become `NAVIGATE` routes, with exact same-file/imported component evidence only when the binding is unique. |
| SvelteKit routes | Static `src/routes/**/+page.svelte` filesystem pages with literal segments only. The conventional local `default` component becomes the exact `NAVIGATE` handler; dynamic brackets, route groups, layouts, endpoints, and runtime router behavior are excluded. |
| Astro routes | Static `src/pages/**/*.astro` filesystem pages with literal segments only; `index.astro` maps to its containing path. The conventional local `default` component becomes the exact `NAVIGATE` handler; dynamic brackets, leading-underscore segments, endpoints, Markdown/MDX/HTML pages, and runtime navigation are excluded. |
| Blazor routes | Standalone literal slash-prefixed `@page "..."` directives in `.razor` files only. Each directive resolves exactly to the conventional local `default` component; computed directives, `@attribute` routes, Razor comments, `.cshtml`, C# code-block, template-component, and runtime router behavior are excluded. |
| Perl Dancer2 | Direct `use Dancer2;` proof, top-level literal `get` / `post` / `put` / `patch` / `del` / `options` registrations, and direct `\&named_sub` handlers; unique simple same-file `sub` targets are exact and all other accepted coderefs are explicit `unresolved` |
| Julia Genie | Direct `using Genie` proof, top-level literal `route("/path", named_function)` registrations, and an optional literal `method = GET/POST/PUT/PATCH/DELETE/OPTIONS` keyword; unique same-file one-line function targets are exact and all other accepted handlers are explicit `unresolved` |
| Haskell Scotty | Direct `import Web.Scotty` proof, a top-level literal-port `scotty ... $ do` block, and direct block-level literal `get/post/put/delete/patch/options` named handlers; unique same-file zero-argument functions are exact and all other accepted handlers are explicit `unresolved` |
| OCaml Dream | Direct [Dream router](https://ocaml.org/p/dream/latest/doc/dream/Dream/index.html) literal lists and direct `Dream.run` pipelines with literal `Dream.get/post/put/delete/head/connect/options/trace/patch/any` named handlers; unique same-file one-parameter functions are exact and all other accepted handlers are explicit `unresolved` |
| Non-HTTP and UI entrypoints | AST-proven direct NestJS GraphQL `Query` / `Mutation` / `Subscription`, microservice `MessagePattern` / `EventPattern`, WebSocket `SubscribeMessage` handlers, and ArkUI `@Entry @Component struct` UI roots. Bounded `entrypoints` listing keeps transport/operation/name semantics and exact `handles` evidence separate from HTTP routes |
| Type hierarchy | Direct TS/JS class `extends`, TS class `implements`, and TS interface `extends`; exact lexical/import/re-export proof with value/type namespaces, plus bounded direct parents/children |
| Context | Bounded packs for 1–8 ordered references: exact-match source excerpts, capped callers/callees and reverse impact, plus shortest static directed evidence paths between adjacent exact references |
| Affected tests | Explicit changed files or local Git change sets feed exact persisted `imports` / `exports` paths, deterministic proof paths, conventional test-path classification, and explicit completeness limits |
| Immutable Git hunks | Local merge-base-to-`HEAD` zero-context hunks from immutable blobs, independently anchored to revision-local declarations without an active SQLite graph |
| Retained history | Up to five immutable graph generations, newest-first summaries, live active freshness kept separate, and bounded structural `history` / `diff` reads |
| Storage | Local SQLite v4-compatible metadata with additive retained snapshot, generation-bound source retrieval, raw artifact-fact, edge-evidence, index-input, and index-work tables |
| Freshness | Source hashes, configuration/workspace manifest fingerprints, extractor/resolver versions, and actionable stale reasons |
| Foreground watch | Explicit native-event-accelerated monitor with a 250 ms debounce, bounded pending-file disclosure, compact NDJSON receipts, polling fallback/retry, and the existing atomic incremental `sync` |

### First-party framework capability registry

Framework coverage is declared once and actively selects the extraction passes applicable to the parsed language. This is a stable integration boundary, not a runtime framework detector: every pass below still requires its own syntax proof before it emits facts.

| Capability | Proven surfaces in v0.66 |
| --- | --- |
| Express | Literal receiver methods and identifier handlers |
| Fastify | Literal routes and static prefix composition |
| NestJS | HTTP decorators, non-HTTP entrypoints, and module prefixes |
| FastAPI | Python direct application decorators plus same-file and direct one-dot package-relative `APIRouter` routes through literal `include_router` prefixes |
| Flask | Python direct app shortcut / `route` decorators plus same-file `Blueprint` routes through literal `register_blueprint` prefixes |
| Gin | Go direct engine methods plus same-function literal `RouterGroup` prefixes |
| net/http | Go direct `http.HandleFunc` and same-function literal `http.NewServeMux().HandleFunc` registrations |
| Chi | Go direct `chi.NewRouter()` / `chi.NewMux()` literal named-handler registrations |
| Axum | Rust direct imported `Router::new()` literal route-builder chains and direct imported method-router named local handlers |
| Spring Web | Java direct imported or fully-qualified `@RestController` / `@Controller`, a literal optional class `@RequestMapping`, and one literal `@GetMapping` / `@PostMapping` / `@PutMapping` / `@PatchMapping` / `@DeleteMapping` direct local method |
| Laravel | PHP direct imported/fully-qualified route facade calls with literal controller-action arrays |
| CivetWeb | C direct [`mg_set_request_handler(context, uri, handler, cbdata)`](https://civetweb.github.io/civetweb/api/mg_set_request_handler.html) registration after `civetweb.h` inclusion, with unique unshadowed same-file handlers; represented as `ALL` because registration has no method argument |
| Lapis | Lua direct [`require("lapis")` / `Application()`](https://leafo.net/lapis/reference/lua_getting_started.html) bindings with literal `get` / `post` / `put` / `delete` / `match` registrations and unique, prior, un-rebound same-file local function handlers |
| Plumber | R direct [`#*` / `#'` annotations](https://www.rplumber.io/) with literal `@get` / `@post` / `@put` / `@delete` slash paths and immediately following top-level braced anonymous function handlers |
| Phoenix | Elixir direct [`use Phoenix.Router`](https://phoenix.hexdocs.pm/Phoenix.Router.html) modules, literal nested `scope` prefixes, and direct verb routes with full-module controller atom actions |
| Cowboy | Erlang direct [`cowboy_router:compile/1`](https://ninenines.eu/docs/en/cowboy/2.14/manual/cowboy_router.compile/) literal wildcard-host dispatch lists with same-module exported `init/2` proof |
| Compojure | Clojure direct [`compojure.core`](https://github.com/weavejester/compojure) `:refer :all` or explicit macro proof, top-level `defroutes`, literal verb paths, and same-file named `defn` handlers |
| Dancer2 | Perl direct [`use Dancer2;`](https://metacpan.org/pod/Dancer2) proof, literal `get/post/put/patch/del/options` paths, and same-file named `\&sub` handlers |
| Genie | Julia direct [`using Genie`](https://genieframework.github.io/Genie.jl/dev/tutorials/12--Advanced_Routing_Techniques.html) proof, literal named `route` paths, and optional literal method-keyword handlers |
| Scotty | Haskell direct [`Web.Scotty`](https://hackage-content.haskell.org/package/scotty-0.30/docs/Web-Scotty.html) import proof, literal-port `scotty ... $ do` blocks, and literal named `get/post/put/delete/patch/options` handlers |
| Dream | OCaml direct [Dream router](https://ocaml.org/p/dream/latest/doc/dream/Dream/index.html) literal lists, direct `Dream.run` pipelines, and literal named `Dream.get/post/put/delete/head/connect/options/trace/patch/any` handlers |
| Giraffe | F# direct [Giraffe routing](https://giraffe.wiki/docs) `open Giraffe` proof, flat top-level `choose` lists, literal verb/`route` compositions, and typed local named handlers |
| Jester | Nim direct [Jester route blocks](https://github.com/dom96/jester) with exactly one direct import-list proof, flat `routes:` / `router name:` blocks, literal fixed-verb paths, and one named zero-argument local `proc` call |
| cpp-httplib | C++ direct local server bindings with literal named-handler HTTP methods |
| ASP.NET Core | C# direct `WebApplication` Minimal API bindings and `ApiController` MVC attributes |
| Rails | Ruby direct `Rails.application.routes.draw` literal controller-action routes |
| Ktor | Kotlin direct `Application.module` / `routing` literal callable-reference routes |
| Vapor | Swift direct `routes(_ app: Application)` literal segment routes with same-file named handlers |
| Flutter | Dart direct `MaterialApp(routes: {...})` literal named-navigation routes with same-file widget classes |
| Vue Router | TypeScript/JavaScript direct `createRouter` import plus a top-level literal `routes` option with named Vue component identifiers |
| SvelteKit | Svelte `src/routes` static `+page.svelte` convention-derived default components |
| Astro | Astro `src/pages` static `.astro` convention-derived default components |
| Blazor | Razor `.razor` conventional components and standalone literal `@page` directive routes |
| ArkUI | ArkTS complete direct `@Component struct` declarations and direct `@Entry @Component` UI root entrypoints |
| Terraform/OpenTofu | Complete line-leading top-level literal `resource`, `data`, `module`, `variable`, and `output` declaration blocks |
| Shopify Liquid | Complete direct literal `render` / `include` snippet tags and `section` tags resolved only against indexed local Liquid files |
| CFML / CFScript | Complete braced component/interface declarations, complete tag-based component/interface plus named function pairs, and conventional implicit CFC components |
| Play | Scala `conf/routes` / `conf/*.routes` literal controller-action entries with exact unique Scala-or-Java package-class-method handlers, plus literal static `->` Router-mount `handles` evidence |
| React Router | Recursive literal JSX `Route`, `createRoutesFromElements` JSX trees, and data-router object trees |
| Next.js | Pages Router and App Router page default exports |

### Resolution contract

| State | Meaning |
| --- | --- |
| `exact` | Proven by syntax, lexical binding, explicit import, workspace package, or re-export surface |
| `heuristic` | Conservative unique-name inference; useful but never presented as proof |
| `unresolved` | Kept for inspection but excluded from callers, callees, and impact paths |

For an exact call that travels through a barrel, evidence uses `module.reexported-import-binding` and includes a `resolutionPath`, for example:

```json
{
  "ruleId": "module.reexported-import-binding",
  "resolutionPath": [
    "apps/web/src/consumer.ts",
    "packages/core/src/index.ts",
    "packages/core/src/math.ts"
  ]
}
```

### Static route and client-navigation evidence

v0.14 introduced the first framework pack as a graph contract, not a regex guess; v0.25 adds an executable first-party capability registry and convention-derived Next.js page routes, v0.26 recursively composes proven literal React Router data-router paths, v0.27 brings the same bounded composition to literal JSX `Route` trees, v0.28 proves direct `createRoutesFromElements(...)` JSX trees independently, v0.29 adds the first Python/FastAPI slice, v0.30 composes direct same-file `APIRouter` registrations, v0.31 projects a strictly proven one-dot package-relative FastAPI router import, v0.32 adds direct Flask app and same-file Blueprint route evidence, v0.33 adds direct Go Gin engine and literal RouterGroup routes, v0.34 adds direct Go `net/http` `HandleFunc` routes, v0.35 adds direct Chi router routes, v0.36 adds the first Rust/Axum route-builder slice, v0.37 adds direct Java/Spring Web controller method mappings, v0.38 adds PHP/Laravel, v0.39 adds C++/cpp-httplib, v0.40 adds C#/ASP.NET Core, v0.41 adds Ruby/Rails, v0.42 adds Kotlin/Ktor, v0.43 adds Swift/Vapor, v0.44 adds Dart/Flutter named navigation, v0.45 adds Scala/Play route tables, v0.46 resolves a Play controller action through unique direct package-class-method proof, v0.47 extends that proof to Java classes while making literal Play `->` Router mounts explicit `handles` evidence, v0.48 adds C/CivetWeb, v0.49 adds Lua/Lapis, v0.50 adds R/Plumber, v0.51 adds Elixir/Phoenix, v0.52 adds Erlang/Cowboy, v0.53 adds Clojure/Compojure, v0.54 adds Perl/Dancer2, v0.55 adds Julia/Genie, v0.56 adds Haskell/Scotty, and v0.57 adds OCaml/Dream. A supported concrete registration creates a first-class `route` symbol such as `GET /users`, `GET /api/users`, `CONNECT /tunnel`, `ALL /health`, or `NAVIGATE /settings` and a distinct `routes` edge to its terminal handler. That edge remains visible in `callers`, `callees`, `impact`, `context`, `explore`, `node`, and `explain-edge`; its kind keeps HTTP dispatch and browser navigation separate from ordinary function calls.

#### Lapis (Lua)

The official Lapis [Lua getting-started guide](https://leafo.net/lapis/reference/lua_getting_started.html) creates an application with `require("lapis")` and `lapis.Application()`, while its [routing reference](https://leafo.net/lapis/reference/actions.html) documents `match` plus the HTTP verb shortcuts. v0.49 retains only this direct, auditable subset:

```lua
local lapis = require("lapis")
local app = lapis.Application()

local function health(self)
  return "ok"
end

local function create_user(self)
  return "created"
end

app:get("/health", health)
app:post("create-user", "/users", create_user)
```

This emits `GET /health -> health` and `POST /users -> create_user` with `framework.lapis.direct-application.literal-route.local-function` syntax evidence. `app:match(...)` emits `ALL`, because it is not a verb-specific shortcut. The extractor accepts only parenthesized direct `require("lapis")` / local `Application()` bindings, top-level direct calls, plain slash-prefixed quoted paths, optional literal route names, and one unique prior same-file `local function` handler with no direct top-level rebinding. It rejects MoonScript, `Application:extend`, `include`, `respond_to`, tables, inline/global/imported handlers, aliases/wrappers, groups/prefixes, dynamic/raw/escaped paths, nested control flow, action-body method dispatch, and runtime behavior.

#### Plumber (R)

The official [Plumber documentation](https://www.rplumber.io/) exposes R functions through roxygen-style `#*` annotations and also accepts `#'`; its [reference index](https://www.rplumber.io/reference/index.html) documents the direct HTTP verb helpers. v0.50 retains this direct, auditable subset:

```r
#* @get /health
function() {
  list(status = "ok")
}

#' @post /users
function(name = "") {
  list(created = name)
}
```

This emits `GET /health -> GET /health handler` and `POST /users -> POST /users handler` with `framework.plumber.annotation.literal-route.braced-handler` syntax evidence. The extractor accepts only standalone top-level `#*` / `#'` annotations, a literal slash-prefixed path, `@get` / `@post` / `@put` / `@delete`, and the immediately following top-level braced anonymous `function(...) { ... }` handler. It rejects unsupported verbs, dynamic/raw/escaped paths, comments or assignments between annotation and handler, named/inline/nested handlers, programmatic `pr_*` / `Plumber$handle` registration, filters, mounts, OpenAPI annotations, route groups, generic R import/call/type analysis, and runtime behavior.

#### Phoenix (Elixir)

The official [Phoenix.Router API](https://phoenix.hexdocs.pm/Phoenix.Router.html) documents verb macros such as `get` and `post`; the [routing cheatsheet](https://phoenix.hexdocs.pm/router.html) shows that `scope` prefixes compose with their nested route paths. v0.51 retains this direct, auditable subset:

```elixir
defmodule DemoWeb.Router do
  use Phoenix.Router

  scope "/api" do
    scope "/v1" do
      get "/health", DemoWeb.HealthController, :index
    end
  end
end

defmodule DemoWeb.HealthController do
  def index(conn, _params) do
    conn
  end
end
```

This emits `GET /api/v1/health -> DemoWeb.HealthController.index` with `framework.phoenix.direct-router.literal-verb.full-module-controller-action.local-method` evidence. A direct literal route whose full-module controller action does not match exactly one direct same-file module method is preserved as an explicit `unresolved` route edge; SymbolLattice does not guess across files. The extractor accepts a direct module-level `use Phoenix.Router` (optionally `helpers: false`), literal nested `scope` prefixes, one direct literal `get` / `post` / `put` / `patch` / `delete` / `head` / `options` / `trace` / `connect` call, a full controller module name, and an atom action. It rejects indirect router macros, dynamic/escaped paths, `resources`, `match`, `forward`, aliases, imported or cross-file controllers, macro-generated routing, and runtime behavior.

#### Cowboy (Erlang)

The official [Cowboy routing guide](https://ninenines.eu/docs/en/cowboy/2.13/guide/routing/) defines a dispatch list as host rules containing path tuples, and documents that the list is compiled through [`cowboy_router:compile/1`](https://ninenines.eu/docs/en/cowboy/2.14/manual/cowboy_router.compile/). v0.52 retains one direct, auditable subset: a single literal wildcard host and literal three-item path tuples.

```erlang
-module(demo_handler).
-export([start/2, init/2]).

start(_Type, _Args) ->
    Dispatch = cowboy_router:compile([
        {'_', [
            {"/health", demo_handler, #{}},
            {"/users", users_handler, []}
        ]}
    ]),
    cowboy:start_clear(demo_listener, [{port, 8080}], #{env => #{dispatch => Dispatch}}).

init(Req0, State) ->
    {ok, Req0, State}.
```

This emits `ALL /health -> demo_handler.init/2` with `framework.cowboy.direct-router.literal-wildcard-host.local-exported-init` evidence because the handler module equals the current `-module` and has one direct exported `init/2`. `ALL /users` is retained as an explicit `unresolved` route edge: v0.52 does not guess a separate handler module. The extractor accepts only a direct `cowboy_router:compile([{'_', [...] }])` call, literal slash-prefixed unescaped string paths, unquoted handler atoms, and three-item `{Path, Handler, InitialState}` tuples. It rejects variables, aliases, non-wildcard hosts, host/path constraints, binary or dynamic paths, quoted handlers, nested/indirect router calls, generic Erlang module resolution, and runtime Cowboy behavior.

#### Compojure (Clojure)

The official [Compojure README](https://github.com/weavejester/compojure) describes a Clojure/Ring routing library and demonstrates `defroutes` with HTTP-verb macros; Clojure's [namespace guide](https://clojure.org/guides/learn/namespaces) documents `ns`, `:require`, and `defn`. v0.53 retains one direct, auditable subset:

```clojure
(ns demo.routes
  (:require [compojure.core :refer [defroutes GET POST]]))

(defn health [request]
  {:status 200})

(defroutes app-routes
  (GET "/health" [] health)
  (POST "/users" [] create-user))
```

This emits `GET /health -> demo.routes/health` with `framework.compojure.direct-defroutes.literal-verb.local-function` evidence. `POST /users` is retained as an explicit `unresolved` route edge because no unique direct same-file `defn create-user` exists. The extractor accepts exactly one direct top-level `ns`, one direct `(:require ...)` Compojure-core vector with either `:refer :all` or an explicit `:refer [defroutes GET ...]` proof, simple top-level `defn` declarations, a top-level `defroutes`, and immediate four-item literal `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS` route forms. It rejects aliases and namespaced macro calls, unbound macro names, `context` / `routes` / `ANY`, middleware, dynamic or escaped paths, inline/qualified/nested handlers, docstring/metadata/private/multi-arity `defn` forms, generic namespace resolution, cross-file handler resolution, and runtime Ring/Compojure behavior.

#### Dancer2 (Perl)

The official [Dancer2 README](https://github.com/PerlDancer/Dancer2) identifies it as a Perl web framework and shows `use Dancer2;` together with a `get` route; the [Dancer2 manual](https://metacpan.org/pod/Dancer2::Manual) defines a route as method, path, and coderef and documents `get`, `post`, `put`, `del`, `options`, and `patch`. v0.54 keeps one direct, auditable subset:

```perl
package Demo::App;
use Dancer2;

sub health {
  return "ok";
}

get "/health" => \&health;
post "/users" => \&create_user;
```

This emits `GET /health -> Demo::App::health` with `framework.dancer2.direct-route.literal-verb.local-sub` evidence. `POST /users` is retained with explicit `unresolved` evidence because no unique direct same-file `sub create_user` exists. The extractor accepts exactly one direct `use Dancer2;`, at most one direct `package`, simple direct top-level `sub name { ... }`, and a direct top-level literal `get` / `post` / `put` / `patch` / `del` / `options` form whose handler is exactly `\&name`. It rejects Dancer2 import lists/aliases, multiple direct Dancer2 uses, `any`, named-route syntax, inline/anonymous/wrapped/qualified handlers, prefixes/hooks/plugins, dynamic or escaped paths, prototyped/attributed/nested subs, generic package/module resolution, cross-file handlers, and runtime behavior.

#### Genie (Julia)

The official [Genie advanced-routing guide](https://genieframework.github.io/Genie.jl/dev/tutorials/12--Advanced_Routing_Techniques.html) documents a named-handler form, `route(pattern::String, f::Function)`, including `using Genie`, `greet() = ...`, and `route("/greet", greet)`; it also documents the optional `method` keyword and the `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS` constants. v0.55 keeps one direct, auditable subset:

```julia
using Genie, Genie.Requests

health() = "ok"
create_user() = "created"

route("/health", health)
route("/users", create_user, method = POST)
route("/missing", missing, method = PATCH)
```

This emits `GET /health -> health` and `POST /users -> create_user` with `framework.genie.direct-route.literal-named-function.local-function` evidence. `PATCH /missing` is retained with explicit `unresolved` evidence because no unique direct same-file one-line `missing(...) = ...` function exists. The extractor accepts exactly one direct top-level `using Genie` statement (a comma-qualified import list may follow), simple top-level one-line `name(...) = ...` functions, and a direct statement-start literal `route("/path", name)` form with either the default `GET` or exactly one literal `method = GET/POST/PUT/PATCH/DELETE/OPTIONS` keyword. It rejects `import Genie`, repeated use proof, inline `do ... end` handlers, named routes, qualified method constants, dynamic or escaped paths, and routes inside blocks/modules/functions; it does not model macro or generic wrapper expansion, generic Julia module/type/call resolution, cross-file handlers, or runtime Genie behavior.

#### Scotty (Haskell)

The official [Scotty API](https://hackage-content.haskell.org/package/scotty-0.30/docs/Web-Scotty.html) defines `get`, `post`, `put`, `delete`, `patch`, and `options` as HTTP route constructors. v0.56 keeps one direct, layout-aware subset:

```haskell
import Web.Scotty

main = scotty 3000 $ do
  get "/health" health
  post "/users" $ createUser
  patch "/missing" missing

health = text "ok"
createUser = text "created"
```

This emits `GET /health -> health` and `POST /users -> createUser` with `framework.scotty.direct-block.literal-named-function.local-function` evidence. `PATCH /missing` remains explicit `unresolved` evidence because no unique direct, zero-argument, same-file `missing = ...` function exists. The extractor accepts exactly one column-zero `import Web.Scotty`, a column-zero `name = scotty <literal-port> $ do` header, direct baseline-indented literal `get/post/put/delete/patch/options` registrations, and simple column-zero zero-argument function definitions. It excludes qualified/selective/repeated imports, `scottyT`, dynamic ports or paths, `addroute`/`matchAny`, inline `do` handlers, nested statements, local `let`/`where` callbacks, tabs, generic Haskell module/type/call/package resolution, cross-file callbacks, and runtime behavior. Unbalanced delimiters, unterminated quoted/comment input, or tab-indented input retain only the file symbol until repaired.

#### Dream (OCaml)

The official [Dream API](https://ocaml.org/p/dream/latest/doc/dream/Dream/index.html) documents `Dream.router` route lists and `Dream.get`, `Dream.post`, `Dream.put`, `Dream.delete`, `Dream.head`, `Dream.connect`, `Dream.options`, `Dream.trace`, `Dream.patch`, and `Dream.any`. v0.57 keeps one direct, auditable subset:

```ocaml
let health _ = Dream.html "ok"
let create_user _ = Dream.html "created"

let () =
  Dream.run
  @@ Dream.router [
    Dream.get "/health" health;
    Dream.post "/users" @@ create_user;
    Dream.any "/missing" missing;
  ]
```

This emits `GET /health -> health` and `POST /users -> create_user` with `framework.dream.direct-router.literal-named-function.local-function` evidence. `ALL /missing` remains explicit `unresolved` evidence because no unique direct same-file one-parameter `missing` function exists. The extractor accepts a direct top-level `let name = Dream.router [` list or a narrow direct `Dream.run` / `@@ Dream.router [` pipeline, direct baseline-indented literal named handlers, and simple top-level one-parameter `let` functions. It excludes `Dream.scope`, `Dream.serve`, option/composition chains, dynamic or escaped paths, anonymous or qualified handlers, local or typed/pattern function forms, generic OCaml module/type/call/package resolution, cross-file callbacks, and runtime behavior. Unbalanced delimiters or unterminated string/raw-string/nested-comment input retain only the file symbol until repaired.

#### Giraffe (F#)

The official [Giraffe routing documentation](https://giraffe.wiki/docs) demonstrates `choose [` route tables, composition with `>=>`, fixed HTTP handlers such as `GET` / `POST`, and `route "/..."` middleware. v0.58 deliberately keeps one auditable subset:

```fsharp
open Giraffe

let health (next : HttpFunc) (ctx : HttpContext) =
  text "ok" next ctx

let createUser (next : HttpFunc) (ctx : HttpContext) =
  text "created" next ctx

let webApp =
  choose [
    GET >=> route "/health" >=> health
    POST >=> route "/users" >=> createUser
    route "/all" >=> health
    PATCH >=> route "/missing" >=> missing
  ]
```

This emits `GET /health -> health`, `POST /users -> createUser`, and `ALL /all -> health` with `framework.giraffe.direct-choose.literal-named-function.local-function` evidence. `PATCH /missing` remains explicit `unresolved` evidence because no unique direct same-file typed `missing` handler exists. The extractor requires exactly one top-level `open Giraffe`, a direct top-level `let name = choose [` list or its immediately following indented `choose [` form, one flat baseline of literal routes, and direct top-level handlers whose two parameter types are `HttpFunc` and `HttpContext`. It excludes `GET_HEAD`, `subRoute` / nested composition, aliases or top-level `route` / HTTP-handler rebinding, dynamic or escaped paths, inline or qualified handlers, untyped/annotated/pattern/local functions, multiple or qualified opens, generic F# module/type/call/package analysis, cross-file callbacks, and runtime behavior. Unbalanced delimiters, unterminated strings/comments, or tab-indented code retain only the file symbol until repaired.

#### Jester (Nim)

The official [Jester README](https://github.com/dom96/jester) documents the `routes:` DSL, lowercase fixed HTTP verbs, literal route patterns, and custom `router myrouter:` blocks. v0.59 recognizes one deliberately small static-evidence subset:

```nim
import asyncdispatch, jester

proc health*() =
  discard

proc createUser() =
  discard

routes:
  get "/health":
    health()
  post "/users":
    createUser()
  patch "/missing":
    missing()
```

This emits `GET /health -> health` and `POST /users -> createUser` with `framework.jester.direct-route-block.literal-named-proc.local-proc` evidence. `PATCH /missing` remains explicit `unresolved` evidence because no unique direct same-file zero-argument `missing` `proc` exists. The extractor requires exactly one top-level direct `import` list containing `jester`, a direct top-level `routes:` or simple `router name:` block, one flat baseline of literal routes, and a route body containing exactly one simple zero-argument named call. It excludes `from jester import`, aliases, repeated imports, dynamic/special/regex/escaped paths, inline or multi-statement route bodies, nested control-flow/composition, `before` / `after` / `error` handlers, top-level DSL rebinding, parameterized/generic/cross-file procedures, and runtime behavior. Unbalanced delimiters, unterminated strings/comments, or tab-indented code retain only the file symbol until repaired.

#### Vue Router (Vue SFC + TypeScript / JavaScript router modules)

The official [Vue Router guide](https://router.vuejs.org/guide/) describes configuring `createRouter` with a `routes` array whose entries map a literal `path` to a `component`. v0.60 proves the following narrow cross-file form:

```vue
<!-- src/views/HomeView.vue -->
<template><main /></template>
<script>
export default { name: "HomeView" }
</script>
```

```ts
// src/router/index.ts
import { createRouter, createWebHistory } from "vue-router"
import HomeView from "../views/HomeView"

const routes = [{ path: "/", component: HomeView }]

export const router = createRouter({
  history: createWebHistory(),
  routes
})
```

This emits `NAVIGATE / -> HomeView` with `framework.vue-router.create-router.routes-option.imported-handler` evidence when the target Vue SFC has one audited default export. The SFC extractor accepts one inline, non-`src` JavaScript/TypeScript `<script>` block and preserves direct top-level functions, classes, interfaces, types, and identifier variables. It recognizes a default component only from a direct option object, a direct unaliased `defineComponent(...)` default call, or a unique direct `const Name = defineComponent(...); export default Name` form.

It deliberately excludes aliases/type-only/repeated `createRouter` imports, multiple router factories, dynamic route arrays or paths, lazy/inline/member-expression components, router `addRoute` calls, child-route composition, dynamic SFC transforms, external `src` scripts, multiple script blocks, non-JavaScript/TypeScript languages, and implicit `script setup` compiler exports. Those cases remain absent or explicitly unresolved rather than being guessed.

#### Svelte + SvelteKit (Svelte SFC + static filesystem pages)

The official [Svelte documentation](https://svelte.dev/docs/svelte/overview) describes a component file as a combination of markup, styles, and JavaScript, with optional `<script>` content. v0.61 adds a deliberately narrow graph surface around that file format and the static page convention:

```svelte
<!-- src/routes/catalog/+page.svelte -->
<script lang="ts">
  export let title: string

  export function greeting() {
    return "catalog"
  }
</script>

<main>{title}</main>
```

The validated SFC emits a conventional local `default` component, its direct instance-script declarations, and a `NAVIGATE /catalog -> default` edge with `framework.sveltekit.filesystem-page.local-handler` evidence. The scanner accepts no script, or at most one inline instance script and one inline module script, each in JavaScript or TypeScript. Module scripts are syntax-validated but their declarations are not yet indexed; this keeps the component and route claim explicit rather than treating Svelte compiler output as an ordinary ES module.

It deliberately excludes `src` scripts, non-JavaScript/TypeScript or repeated scripts, malformed script input, template component/call edges, styles, runes/macros, compiler-generated exports, props semantics, SvelteKit layouts/endpoints/actions/hooks, dynamic bracket segments such as `[slug]`, route groups such as `(marketing)`, rest/optional parameters, and runtime navigation. Only literal directories beneath `src/routes` ending in `+page.svelte` become route nodes.

#### Astro (Astro SFC + static filesystem pages)

The official [Astro component documentation](https://docs.astro.build/en/basics/astro-components/) describes a component script fenced by `---`; the [Astro Pages guide](https://docs.astro.build/en/basics/astro-pages/) documents file-based pages beneath `src/pages/`. v0.62 proves the following narrow static form:

```astro
---
export const title = "Catalog"

export function greeting(): string {
  return title
}
---

<main>{title}</main>
```

For `src/pages/catalog/index.astro`, the validated component emits a conventional local `default` symbol, direct frontmatter declarations, and a `NAVIGATE /catalog -> default` edge with `framework.astro.filesystem-page.local-handler` evidence. `src/pages/index.astro` maps to `/`; a non-index static page keeps its literal file stem in the route.

The scanner accepts no frontmatter or one exact opening frontmatter fence at the start of the file, parsed as TypeScript. An initial incomplete/malformed fence or invalid frontmatter syntax retains only the file node. It deliberately excludes frontmatter imports and re-exports, template component/call edges, client `<script>` tags, styles/directives/islands, `Astro` global and props semantics, `.ts`/`.js` endpoints, Markdown/MDX/HTML pages, dynamic brackets such as `[slug]`, leading-underscore segments, route configuration, and runtime navigation.

#### Razor / Blazor (literal `@page` component routes)

Microsoft's [Blazor routing documentation](https://learn.microsoft.com/en-us/aspnet/core/blazor/fundamentals/routing?view=aspnetcore-10.0) defines routing through an `@page` directive on a reachable Razor component, and its [Razor syntax reference](https://learn.microsoft.com/en-us/aspnet/core/mvc/views/razor?view=aspnetcore-10.0) documents `@code` as the component C# member block. v0.63 proves only the compact directive form:

```razor
<!-- Components/Catalog.razor -->
@page "/catalog"
@page "/catalog/{id:int}"

<h1>Catalog</h1>
```

The file emits a conventional local `default` component. Each standalone, unescaped, slash-prefixed string-literal `@page` directive emits its own `NAVIGATE` route and an exact `framework.blazor.page-directive.local-handler` edge to that component. Multiple literal route templates, including a literal parameter template, are retained independently.

It deliberately excludes `@attribute [Route(...)]`, computed or escaped route values, query/fragment forms, directives inside Razor comments, `.cshtml` pages, C# `@code`/`@functions` member extraction, `@inject`/`@model`/`@inherits` semantic references, template component tags, layouts, render modes, routing configuration, generic Razor namespace/project/package resolution, and runtime router behavior.

#### ArkTS / ArkUI (direct component roots)

Huawei's official [ArkUI reference example](https://developer.huawei.com/consumer/en/doc/harmonyos-references-V2/ts-universal-attributes-overlay-0000001427744788-V2) shows the declarative `@Entry`, `@Component`, and `struct` form used for an ArkUI page. v0.64 retains only this complete, source-local declaration shape:

```ts
@Entry
@Component
struct Home {
  build() {
    Column() {
      Text("Hello")
    }
  }
}
```

The `.ets` file emits a `Home` component symbol and a `ui root Home` entrypoint with an exact `framework.arkui.entry-component.local-struct` `handles` edge to that component. Query UI roots through the existing read-only entrypoint surface:

```bash
node dist/cli/main.js entrypoints /path/to/project --transport ui --operation root
```

The scanner accepts a direct adjacent decorator stack ending in `struct Name { ... }`, with an optional direct `export` immediately before `struct`. It intentionally rejects declarations inside comments/strings, detached decorators, non-struct forms, malformed bodies, and generic ArkTS syntax. It does not infer `build()` DSL calls, child component use, `@Builder`/`@Extend`/`@Styles`, state decorators, lifecycle wiring, navigation, module/package resolution, or runtime UI behavior.

#### Terraform / OpenTofu (direct IaC block declarations)

v0.65 adds a deliberately small HCL declaration surface for Terraform and OpenTofu. It accepts only complete, line-leading, top-level blocks with literal labels:

```hcl
# infra/main.tf
resource "aws_instance" "web" {
  ami = var.ami
}

data "aws_ami" "base" {}

module "network" {
  source = "./modules/network"
}

variable "region" {
  type = string
}

output "instance_id" {
  value = aws_instance.web.id
}
```

The file emits `resource aws_instance.web`, `data aws_ami.base`, `module network`, `variable region`, and `output instance_id` symbols with exact local `contains` evidence. Resource/data declarations use the additive `resource` kind, module declarations use the additive `module` kind, and an output is retained as an exported variable binding.

The scanner checks block structure while masking comments, quoted strings, and heredocs, so a declaration-looking string or heredoc body cannot become a cloud-resource fact. It intentionally excludes `terraform` / `provider` / `locals` blocks, dynamic labels, expressions and interpolation, resource references, `depends_on`, provider aliases, module source resolution, JSON configuration, state, plan/apply behavior, and runtime cloud topology.

#### Shopify Liquid (literal local template calls)

v0.66 introduces a deliberately small Shopify Liquid relation surface. It recognizes a complete direct literal target at the start of the tag payload; trailing render arguments are not interpreted:

```liquid
{% render 'product-card', product: product %}
{%- include "legacy-card" -%}
{% section 'recommendations' %}
```

When the project also contains the expected target file, the source file receives an exact `calls` edge:

| Tag | Only accepted target | Exact project-local target |
| --- | --- | --- |
| `render` / `include` | a safe literal snippet name | `snippets/<name>.liquid` |
| `section` | a safe literal section name | `sections/<name>.liquid` |

If the target is absent, the graph preserves an explicit unresolved `calls` edge with a `framework.shopify-liquid.*.literal-project-file.unresolved-target` rule instead of binding to a same-named file elsewhere. Tags within HTML comments, Liquid `comment` / `raw` blocks, dynamic names, path traversal, incomplete/nested tags, and malformed delimiters create no template facts.

This release does not parse Liquid expressions or theme semantics: it excludes `assign`, capture/loop/condition/filter behavior, layouts, schema JSON, JSON templates/section groups, app blocks, objects/metafields/locales, render argument semantics, remote snippets, theme inheritance, and runtime storefront rendering.

#### Solidity (same-file declaration and hierarchy evidence)

v0.67 adds a deliberately small Solidity surface for complete `.sol` files:

```solidity
interface IReadable {}

interface IAsset is IReadable {
  function balanceOf(address account) external view returns (uint256);
}

contract Ownable {}

contract Token is Ownable, IAsset {
  constructor() {}
  function balanceOf(address account) external view returns (uint256) { return 0; }
}
```

| Accepted source form | Evidence |
| --- | --- |
| Complete top-level `contract` / `library` | A class-kind symbol with exact file containment |
| Complete top-level `interface` | An interface-kind symbol with exact file containment |
| Complete direct `function`, `modifier`, `constructor`, `fallback`, `receive` | A method-kind symbol contained by its declared contract/interface/library |
| Complete simple `is Base, Other` | Exact same-file `extends` or `implements` only after a unique target declaration proves its kind |

The scanner masks comments and single/double quoted strings while preserving source offsets. It fails closed for unclosed comments, strings, braces, and declarations. Import-based or cross-file inheritance, constructor arguments after a base type, calls, events, errors, state variables, ABI/bytecode, proxy behavior, compilation, and runtime-chain semantics are deliberately excluded.

#### CFML / CFScript (complete declaration evidence)

v0.68 adds a deliberately small `.cfc`, `.cfm`, and `.cfs` declaration surface:

```cfml
component {
  public string function format(required string orderId) {
    return orderId;
  }
}
```

```cfml
<cfcomponent>
  <cffunction name="load" access="public">
  </cffunction>
</cfcomponent>
```

| Accepted source form | Evidence |
| --- | --- |
| Complete braced CFScript `component` / `interface` | A class/interface symbol named from the conventional source-file stem |
| Complete direct named CFScript `function` | A method-kind symbol contained by the braced container |
| Complete `<cfcomponent>` / `<cfinterface>` pair | A class/interface symbol with exact tag span containment |
| Complete named `<cffunction name="...">` pair | A method-kind symbol contained by its tag-based component/interface |
| Complete top-level CFScript function in a `.cfc` file | A conventional local component plus a contained method |
| Complete top-level CFScript function in a `.cfs` / `.cfm` file | A direct top-level function symbol |

The scanner masks CFML/HTML comments plus quoted strings and fails closed for unclosed comments, strings, braced containers, tags, or functions. It deliberately excludes `cfinclude`, `import`, inheritance, accessors, annotations, dynamic names, closures/nested members, tag-based `<cfscript>` bodies, CFQuery, calls, Adobe ColdFusion/Lucee framework conventions, compilation, and runtime behavior.

#### Express

```ts
import express, { Router } from "express";
import { listUsers } from "./users.js";

const app = express();
const router = Router();

app.get("/users", listUsers);
router.post("/users", requireAuth, createUser);
```

```bash
# Read the persisted active-generation route graph only.
node dist/cli/main.js routes /path/to/project
node dist/cli/main.js routes /path/to/project --method GET --path /users --limit 20
```

The pack accepts only static proofs:

- an ESM `express` default/namespace import or named `Router` import;
- an immutable `const` local receiver initialized directly by `express()`, `express.Router()`, or `Router()`;
- one of `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, or `all`;
- a slash-prefixed string literal path; and
- identifier-only middleware/handler arguments, with the final identifier as the terminal handler.

#### Fastify

SymbolLattice follows the direct registration forms documented in the official [Fastify Routes](https://fastify.dev/docs/latest/Reference/Routes/) and [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) references, while retaining only facts it can prove from the source AST:

```ts
import Fastify from "fastify";
import { createJob, listUsers } from "./handlers.js";

const server = Fastify({ logger: true });

server.get("/users", listUsers);
server.post("/jobs", { schema: {} }, createJob);
server.route({
  method: ["GET", "TRACE"],
  url: "/diagnostics",
  handler: listUsers
});

server.register(async (api) => {
  api.get("/users", listUsers);
  api.register(async (v1) => {
    v1.route({ method: "POST", url: "/jobs", handler: createJob });
  }, { prefix: "/v1" });
}, { prefix: "/api" });

async function adminPlugin(server: unknown) {
  server.get("/health", listUsers);
  server.register(reportsPlugin, { prefix: "/reports" });
}

const reportsPlugin = async (server: unknown) => {
  server.get("/daily", listUsers);
};

server.register(adminPlugin, { prefix: "/admin" });
```

v0.22 additionally follows a direct ESM export surface across files. The route symbols remain attached to their declaration file, while their paths are projected through the root and nested plugin prefixes:

```ts
// src/api.ts
import { listUsers } from "./handlers.js";
import { jobsPlugin } from "./jobs-barrel.js";

export async function api(server: unknown) {
  server.get("/users", listUsers);
  server.register(jobsPlugin, { prefix: "/v1" });
}

// src/jobs-barrel.ts
export { jobsPlugin } from "./jobs.js";

// src/api-barrel.ts
export { api } from "./api.js";

// src/main.ts
import Fastify from "fastify";
import { api as publicApi } from "./api-barrel.js";

const app = Fastify();
app.register(publicApi, { prefix: "/api" });
// Projects GET /api/users and any static jobsPlugin routes under /api/v1.
```

The v0.22 pack accepts only:

- a direct non-type-only ESM default import from `fastify`;
- an immutable, lexically unshadowed `const server = Fastify(...)` receiver;
- shorthand `get`, `head`, `trace`, `delete`, `options`, `patch`, `put`, `post`, or `all` calls with a slash-prefixed string or no-substitution template path and a terminal identifier handler; or
- one direct `server.route({ ... })` object with one uppercase static HTTP method (or nonempty duplicate-free static method array), exactly one literal `url` or `path`, and a direct identifier `handler` (either `handler: name` or `{ handler }`) with a value-space lexical/import/re-export proof.
- a direct non-generator inline function/arrow callback, a same-file local callback, or a direct non-type-only ESM-imported callback passed as the first argument to `server.register(callback, { prefix: "/..." })`. A named source callback must be either a direct function declaration with no direct rebinding or an immutable `const` initialized by a direct function/arrow expression; it must have an identifier first parameter that is not reassigned in its lexical body. Every accepted registration has exactly two arguments and one static slash-prefixed, non-root, non-trailing `prefix`.
- for an imported root callback, an exact value-space import/re-export path to one exported function or variable symbol. Its source plugin may use direct local, imported, or re-exported identifier child callbacks with the same literal registration shape. Nested accepted callbacks compose prefixes before route projection; a repeated plugin in the active ancestry is not expanded again.

Every Fastify route handler must resolve in value space; type-only imports or re-exports remain unresolved rather than becoming a runtime edge. A projected inline-plugin route records `routeRegistration: "fastify-inline-plugin-prefix"`; a route whose prefix chain includes a named local callback records `routeRegistration: "fastify-local-plugin-prefix"`; a route projected from an imported source plugin records `routeRegistration: "fastify-imported-plugin-prefix"`. Resolution preserves that distinction as `framework.fastify.inline-plugin-prefix.*`, `framework.fastify.local-plugin-prefix.*`, or `framework.fastify.imported-plugin-prefix.*` evidence. The optional Fastify shorthand options slot is retained as call context but not interpreted.

Same-file named-plugin receiver projection remains singular: its exact lexical binding must appear as the direct first argument of exactly one direct `.register(...)` call in that source file. Cross-file projection accepts only direct identifier imports and exact export surfaces; assignment aliases, namespace/member access, `fastify-plugin` wrappers, mutable callbacks, computed/spread/duplicate registrations, unresolved or ambiguous exports, and dynamic prefixes remain excluded. Root routes inside a prefixed plugin are also excluded: Fastify's runtime `prefixTrailingSlash` option can yield different concrete route surfaces, so SymbolLattice retains no guessed canonical path. CommonJS/namespace factories, hooks, schemas, custom methods, runtime route options, dynamic values, inline/member handlers, computed/spread/duplicate full-route fields, and conflicting `url` plus `path` remain outside this release.

If the terminal handler cannot be resolved through a lexical binding, explicit import, or re-export surface, the route and its `routes` edge remain persisted as `unresolved`. SymbolLattice does not promote a unique global name to a route handler.

#### FastAPI (Python)

The Python framework pack follows FastAPI's documented [direct application/decorator](https://fastapi.tiangolo.com/tutorial/first-steps/) and [APIRouter composition](https://fastapi.tiangolo.com/tutorial/bigger-applications/) forms, but emits facts only for a narrow AST-proven subset:

```python
from fastapi import FastAPI as Api, APIRouter as Router

app = Api()
router = Router(prefix="/catalog")

@router.get("/")
async def list_items():
    return []

app.include_router(router, prefix="/api")
```

This creates `GET /api/catalog/ -> list_items` with an exact `routes` edge and `framework.fastapi.direct-router.include-router.decorator.local-function` syntax evidence. Direct application decorators remain supported with `framework.fastapi.direct-app.decorator.local-function`.

v0.31 additionally recognizes this regular-package cross-file form:

```python
# api/routers/catalog.py
from fastapi import APIRouter

router = APIRouter(prefix="/catalog")

@router.get("/health")
async def health():
    return {"ok": True}
```

```python
# api/main.py
from fastapi import FastAPI
from .routers.catalog import router as catalog_router

app = FastAPI()
app.include_router(catalog_router, prefix="/api")
```

When `api/__init__.py` and `api/routers/__init__.py` are present, this creates `GET /api/catalog/health -> health` with exact module evidence, `framework.fastapi.imported-router.include-router.decorator.local-function`, and the stored path `api/main.py -> api/routers/catalog.py`.

The v0.31 contract accepts only:

- a syntactically valid `.py` file with a direct one-line `from fastapi import ...` named import; `FastAPI` and `APIRouter` may appear in the same import list and may use direct import aliases;
- a direct top-level `app = FastAPI(...)` / `app = Alias(...)` or `router = APIRouter(...)` / `router = Alias(...)` assignment, with no possible top-level rebinding before the use being proved;
- an optional `APIRouter(prefix="/...")` and `app.include_router(router, prefix="/...")` prefix that is a plain, unescaped literal and has no trailing slash; unrelated keyword arguments such as `tags` and `dependencies` are retained only as configuration, not inferred graph evidence;
- a direct top-level `@app.get` or `@router.get` (`post`, `put`, `patch`, `delete`, `head`, `options`, or `trace`) decorator immediately attached to a top-level `def` or `async def`; and
- for an `APIRouter` route, either a direct top-level same-file `app.include_router(router, ...)` after the decorated function, or one direct `from .module import router [as local_router]` mounted by a direct top-level literal `app.include_router(local_router, ...)`. The cross-file form requires a regular package (`__init__.py` at the importer directory and every traversed child directory), a single leading dot, one imported name, a final non-rebound source router, and an exact local handler.

It intentionally excludes parent-relative (`..`) and package-only (`from . import ...`) imports, namespace packages, wildcard/multiple-name imports, member router imports (`users.router`), import/re-export chains, nested routers, `include_router` factories/wrappers, dynamic or escaped paths/prefixes, star/keyword expansion, router decorators declared after inclusion, malformed Python, and generic Python call/import/export resolution. Those remain later, separately proven slices rather than inferred from text.

> [!NOTE]
> `routes` is a read-only active-generation query. Its `status` may be stale after a source edit, while every route/handler record remains evidence from the last successfully indexed generation. Run `sync` or `index` to publish newer route evidence.

#### Flask (Python)

v0.32 adds a second Python framework pack for the documented Flask [routing](https://flask.palletsprojects.com/en/stable/quickstart/#routing) and [Blueprint](https://flask.palletsprojects.com/en/stable/blueprints/) forms. It produces direct exact route-to-handler edges for this narrow subset:

```python
from flask import Blueprint as BP, Flask as App

app = App(__name__)
catalog = BP("catalog", __name__, url_prefix="/catalog")

@app.route("/health", methods=["GET", "POST"])
def health():
    return {"ok": True}

@catalog.get("/items")
def list_items():
    return []

app.register_blueprint(catalog, url_prefix="/api")
```

This emits `GET /health`, `POST /health`, and `GET /api/catalog/items` with exact syntax evidence. Direct app routes use `framework.flask.direct-app.decorator.local-function`; Blueprint composition uses `framework.flask.direct-blueprint.register-blueprint.decorator.local-function`.

The v0.32 Flask contract accepts only:

- a syntactically valid, one-line named `from flask import ...` import, with direct aliases allowed for `Flask` and `Blueprint`;
- direct top-level `app = Flask(...)` and `blueprint = Blueprint(first_argument, second_argument, ...)` assignments, with no possible top-level rebinding before the route or registration being proved;
- direct top-level `@app.get` / `post` / `put` / `patch` / `delete`, or `@app.route("/...", methods=[...])` / tuple methods using unique uppercase literal HTTP methods; an omitted `methods` records the documented default `GET` only;
- direct top-level Blueprint decorators in the same file, followed by direct `app.register_blueprint(blueprint, url_prefix="/...")`; and
- a plain, unescaped literal `url_prefix` with no trailing slash. Blueprint constructor positional values and unrelated keyword options remain configuration, not graph evidence.

It intentionally excludes cross-file Blueprints, `add_url_rule`, nested or factory Blueprints, `before_request` / middleware / dependency behavior, dynamic methods or endpoints, star/keyword expansion, member receivers, custom decorator wrappers, escaped/dynamic prefixes, and runtime routing configuration.

#### Gin (Go)

v0.33 adds a first Go framework pack using the `@lezer/go` AST adapter. It proves only direct Gin engine and same-function literal `RouterGroup` registrations:

```go
package main

import gin "github.com/gin-gonic/gin"

func health(c *gin.Context) {}
func listUsers(c *gin.Context) {}

func main() {
  router := gin.Default()
  router.GET("/health", health)

  api := router.Group("/api")
  api.GET("/users", listUsers)
}
```

This emits `GET /health -> health` with `framework.gin.direct-engine.method.local-function` evidence and `GET /api/users -> listUsers` with `framework.gin.direct-group.method.local-function` evidence. Direct `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS` methods are supported; `Any` is represented as `ALL`.

The v0.33 Gin contract accepts only:

- a syntactically valid `.go` file and one direct non-dot/non-blank import of `github.com/gin-gonic/gin`, using the default `gin` name or a direct alias;
- a same-function short-variable engine binding such as `router := gin.Default()` or `router := gin.New()`, whose package alias is not shadowed before the binding;
- direct `group := receiver.Group("/prefix")` bindings with one literal slash-prefixed, non-root, non-trailing, non-duplicated-slash prefix; nested proven groups compose their literal prefixes;
- a direct receiver HTTP method with one literal slash-prefixed path and exactly one named package-level function handler; and
- no local shadowing of the handler name before the proven registration.

It intentionally excludes `var` engine declarations, `Handle`, `Match`, static-file helpers, inline/multiple/middleware handlers, dynamic or escaped paths, root/trailing/double-slash group prefixes, group middleware, chained/member receivers, factory/wrapper construction, cross-file receiver flow, Go module/package resolution, methods, and runtime routing behavior.

#### net/http (Go)

v0.34 adds a separate standard-library capability. It accepts direct `HandleFunc` registrations on the default multiplexer and on a literal same-function `ServeMux` binding; v0.35 extends the literal method-pattern subset with `CONNECT`:

```go
package main

import "net/http"

func health(w http.ResponseWriter, r *http.Request) {}
func listUsers(w http.ResponseWriter, r *http.Request) {}

func main() {
  http.HandleFunc("/health", health)

  mux := http.NewServeMux()
  mux.HandleFunc("GET /users", listUsers)
}
```

This emits `ALL /health -> health` with `framework.net-http.default-serve-mux.handle-func.local-function` evidence and `GET /users -> listUsers` with `framework.net-http.serve-mux.handle-func.local-function` evidence. Bare slash-prefixed patterns are explicitly represented as `ALL`; the supported Go 1.22 method patterns are `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `TRACE`, and `CONNECT`.

The contract requires one direct non-dot/non-blank `net/http` import (default `http` name or direct alias), a same-function short-variable `mux := http.NewServeMux()` binding when a custom mux is used, a plain literal slash path or supported `METHOD /path` pattern, and exactly one unshadowed named package-level handler. It intentionally excludes `http.Handle`, `ServeMux.Handle`, method receivers, inline or wrapped handlers, dynamic/escaped patterns, `var` and factory/wrapper bindings, `DefaultServeMux` member calls, host/wildcard patterns, cross-file receiver flow, generic Go module/package resolution, and runtime routing behavior.

#### Chi (Go)

v0.35 adds a distinct `github.com/go-chi/chi/v5` capability. It proves a direct non-dot/non-blank import using the default `chi` name or a direct alias, a same-function `:= chi.NewRouter()` or `chi.NewMux()` binding, a literal slash-prefixed path, and one unshadowed named package-level handler:

```go
package main

import (
  "net/http"
  chi "github.com/go-chi/chi/v5"
)

func health(w http.ResponseWriter, r *http.Request) {}
func openTunnel(w http.ResponseWriter, r *http.Request) {}

func main() {
  router := chi.NewRouter()
  router.Get("/health", health)
  router.Connect("/tunnel", openTunnel)
}
```

This emits `GET /health -> health` and `CONNECT /tunnel -> openTunnel`, each with `framework.chi.direct-router.method.local-function` evidence. Direct `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`, `Trace`, `Connect`, and `HandleFunc` are supported; `HandleFunc` is represented as `ALL`.

It intentionally excludes `Route` / `Group` / `Mount` path composition, `With` middleware chains, `Handle`, `Method` / `MethodFunc`, `Query`, inline or wrapped handlers, dynamic/escaped paths, `var`/factory/wrapper bindings, receiver methods, cross-file router flow, generic Go module/package resolution, and runtime router behavior.

#### Axum (Rust)

v0.36 adds the first non-Go language adapter and a deliberately narrow `axum` capability. It proves a direct `use` binding for `axum::Router` and each method-router helper, a contiguous literal `Router::new().route(...)` builder chain, and one unshadowed named top-level Rust function handler:

```rust
use axum::{
    routing::{get, post},
    Router,
};

async fn health() {}
async fn create_user() {}

fn app() {
    let app = Router::new()
        .route("/health", get(health))
        .route("/users", post(create_user));
}
```

This emits `GET /health -> health` and `POST /users -> create_user`, each with `framework.axum.direct-router.route.local-function` evidence. Direct imported `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, and `trace` helpers are supported; import aliases are accepted when their source path remains unambiguous. `get` is retained as the explicit `GET` registration rather than synthesizing Axum's implicit `HEAD` behavior.

The contract deliberately excludes `route_service`, `nest`, `merge`, `with_state`, `layer`, typed or generic `Router` construction, trailing builder wrappers, `MethodRouter` method composition such as `get(a).post(b)`, inline/closure/wrapped/namespaced handlers, dynamic/escaped paths, `Router`/method-helper shadows, `pub use` or wildcard imports, mutable/factory/router-flow tracking, methods, cross-file Cargo/module resolution, semantic type checking, and runtime behavior. Syntax-error Rust files retain only their file symbol until repaired.

#### Spring Web (Java)

v0.37 adds Java `.java` discovery, direct top-level class/method containment, and the first `spring-web` capability. A route requires a direct (non-static, non-wildcard) import or a fully-qualified Spring annotation, a direct `@RestController` or `@Controller` class, an optional literal class `@RequestMapping` prefix, a single literal method shortcut annotation, and the exact direct local method declaration:

```java
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {
  @GetMapping
  public String listUsers() { return "[]"; }

  @PostMapping(path = "/")
  public String createUser() { return "created"; }
}
```

This emits `GET /api/users -> UserController.listUsers` and `POST /api/users -> UserController.createUser`, each with `framework.spring-web.direct-controller.literal-method-mapping.local-method` evidence. It supports direct imported or fully-qualified `@RestController` / `@Controller`, optional `@RequestMapping`, and direct `@GetMapping`, `@PostMapping`, `@PutMapping`, `@PatchMapping`, or `@DeleteMapping` annotations. A bare method mapping contributes the controller prefix; the path argument may be a single literal positional value or one literal `path =` / `value =` value.

It intentionally excludes method-level `@RequestMapping(method = ...)`, multi-path arrays, custom/composed annotations, placeholders or SpEL, multiple condition attributes, wildcard/static imports, nested types, inherited/interface handlers, generic Java package/classpath resolution, semantic Spring configuration, and runtime behavior. Java files with syntax errors retain only their file symbol until repaired.

#### Laravel (PHP)

v0.38 adds PHP `.php` discovery, direct top-level PHP declarations, and an AST-proven `laravel` capability. It accepts a direct `use Illuminate\Support\Facades\Route` import (including one explicit alias) or the fully-qualified facade, one literal URI, and one controller action array. The direct methods are `get`, `post`, `put`, `patch`, `delete`, `options`, and `any`; a URI without a leading slash is normalized to one:

```php
<?php

use Illuminate\Support\Facades\Route;

Route::get('/health', [HealthController::class, 'show']);
Route::post('health', [HealthController::class, 'replace']);

class HealthController {
    public function show(): string { return 'ok'; }
    public function replace(): string { return 'saved'; }
}
```

This emits `GET /health -> HealthController.show` and `POST /health -> HealthController.replace`, each with `framework.laravel.direct-facade.literal-controller-action.local-method` evidence. A typical controller in another PHP file remains useful but honest: SymbolLattice records the literal route and `Controller@action` reference with `unresolved` evidence rather than guessing a cross-file target.

It intentionally excludes controller/import/package resolution, route groups and prefixes, `resource` / `apiResource`, closures, invokable/string handlers, `match`, redirects/views/fallbacks, middleware, route-model binding, route-cache/configuration semantics, dynamic or escaped/interpolated values, grouped/wildcard imports, aliases beyond one direct facade binding, trait/interface/anonymous declarations, and runtime behavior. PHP files with syntax errors retain only their file symbol until repaired.

#### cpp-httplib (C++)

v0.39 adds C++ `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, and `.hxx` discovery, direct top-level class/method/function containment, and the first `cpp-httplib` capability. A route requires a direct `#include <httplib.h>` (or `"httplib.h"`), a direct `httplib::Server` or `httplib::SSLServer` binding in one direct top-level function body, a literal slash-prefixed path, and one unique named top-level local function handler:

```cpp
#include <httplib.h>

void health(const httplib::Request &, httplib::Response &) {}
void create_user(const httplib::Request &, httplib::Response &) {}

int main() {
  httplib::Server server;
  server.Get("/health", health);
  server.Post("/users", create_user);
}
```

This emits `GET /health -> health` and `POST /users -> create_user`, each with `framework.cpp-httplib.direct-server.literal-route.local-function` evidence. Direct `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, and `Options` registrations are supported. A direct receiver reassignment invalidates the binding before later route extraction.

It intentionally excludes `using namespace httplib`, wrapper/factory/mutable server flow beyond direct rebinding invalidation, nested blocks, routes declared through class/member/lambda/callback handlers, regex/raw/escaped/dynamic paths, server/client aliases, cross-file handlers, generic include resolution, middleware/pre/post routing handlers, C++ overload/template/namespace resolution, and runtime behavior. C++ files with syntax errors retain only their file symbol until repaired.

#### ASP.NET Core (C#)

v0.40 adds C# `.cs` discovery, direct top-level class/interface/method/local-function containment, and an `aspnet-core` capability backed by a prebuilt Tree-sitter grammar. Minimal API routes require a direct `WebApplication.CreateBuilder(...).Build()` chain or direct builder-plus-`Build()` bindings, a literal slash-prefixed `MapGet`, `MapPost`, `MapPut`, `MapPatch`, or `MapDelete` call, and one unique direct top-level named local function handler:

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/health", Health);
app.MapPost("/orders", CreateOrder);

static string Health() => "ok";
static void CreateOrder() {}
```

This emits `GET /health -> Health` and `POST /orders -> CreateOrder`, each with `framework.aspnet-core.direct-web-application.literal-route.local-function` evidence. Direct builder or app receiver reassignment invalidates that binding before later route extraction.

The same pack also accepts direct MVC controller routes when exactly one direct `using Microsoft.AspNetCore.Mvc;` (or fully-qualified MVC attributes) proves `ApiController`, `Route`, and one `HttpGet` / `HttpPost` / `HttpPut` / `HttpPatch` / `HttpDelete` / `HttpHead` / `HttpOptions` method attribute:

```csharp
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/orders")]
public class OrdersController {
  [HttpGet("{id}")]
  public string GetById(int id) => id.ToString();
}
```

This emits `GET /api/orders/{id} -> OrdersController.GetById` with `framework.aspnet-core.direct-api-controller.literal-route.method` evidence. Controller templates are combined only from direct, literal class and method attributes.

It intentionally excludes `MapMethods`, `MapGroup`, route filters, middleware, lambda/delegate/member/cross-file handlers, endpoint metadata, controller tokens such as `[controller]`, aliases, inheritance/interface resolution, nested types/scopes, full ASP.NET configuration and DI semantics, semantic type checking, and runtime behavior. C# files with syntax errors retain only their file symbol until repaired.

#### Rails (Ruby)

v0.41 adds Ruby `.rb` discovery, direct top-level class/method/function containment, and a first `rails` capability backed by a prebuilt Tree-sitter grammar. A route must appear directly inside `Rails.application.routes.draw do ... end`, use one of `get`, `post`, `put`, `patch`, `delete`, `head`, or `options`, have one literal slash-prefixed path, and provide exactly `to: "controller#action"`:

```ruby
Rails.application.routes.draw do
  get "/health", to: "health#show"
  post "/orders", to: "orders#create"
end

class HealthController
  def show
  end
end
```

This emits `GET /health -> HealthController.show` with `framework.rails.direct-routes-draw.literal-controller-action.local-method` evidence when that non-namespaced controller class and method are in the same Ruby file. A normal Rails `config/routes.rb` file still records the literal route and `controller#action` reference with `unresolved` evidence instead of guessing a controller in another file.

It intentionally excludes `resources` / `resource`, `namespace`, `scope`, route groups/prefixes, constraints, redirects, mounts, roots, `match`, lambdas and non-controller handlers, controller aliases/namespaces, dynamic/interpolated/escaped values, generic Ruby module/call/type resolution, cross-file controller resolution, and runtime Rails behavior. Ruby files with syntax errors retain only their file symbol until repaired.

#### Ktor (Kotlin)

v0.42 adds Kotlin `.kt` discovery, direct top-level class/interface/method/function containment, and a first `ktor` capability backed by the shared prebuilt Tree-sitter registry. A route requires direct, unaliased imports of `Application`, `routing`, and its route verb; a direct `fun Application.module()` body; one direct `routing { ... }` block; and one literal path plus a same-file callable reference:

```kotlin
import io.ktor.server.application.Application
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing

fun Application.module() {
  routing {
    get("/health", ::health)
    post("/orders", ::createOrder)
  }
}

fun health() {}
fun createOrder() {}
```

This emits `GET /health -> health` and `POST /orders -> createOrder` with `framework.ktor.direct-application-module.routing.literal-route.callable-reference.local-function` evidence. A handler must be one unique direct top-level function in the same file, so every accepted Ktor edge is `exact` rather than a guessed lambda or cross-file target.

It intentionally excludes star/aliased imports, other module names/receivers, nested or receiver-qualified `routing` calls, `route` / `authenticate` / `static` composition, lambda handlers, named/qualified/member references, dynamic/interpolated/escaped paths, overload or cross-file resolution, generic Kotlin import/package/type analysis, Ktor plugins/pipelines, and runtime behavior. Kotlin files with syntax errors retain only their file symbol until repaired.

#### Vapor (Swift)

v0.43 adds Swift `.swift` discovery, direct top-level class/struct/protocol/method/function containment, and a first `vapor` capability backed by the shared prebuilt Tree-sitter registry. A route requires one direct `import Vapor`, a direct `routes(_ app: Application)` function, a direct `app.get` / `post` / `put` / `patch` / `delete` / `head` / `options` call, zero or more literal path segments, and a unique same-file named `use: handler` function:

```swift
import Vapor

public func routes(_ app: Application) throws {
  app.get("health", use: health)
  app.post("orders", ":id", use: updateOrder)
}

func health(req: Request) throws -> String { "ok" }
func updateOrder(req: Request) throws -> String { "updated" }
```

This emits `GET /health -> health` and `POST /orders/:id -> updateOrder` with `framework.vapor.direct-routes-application.literal-segment-route.use.local-function` evidence. The handler must be one unique direct top-level function in the same file, so every accepted Vapor edge is `exact` rather than a guessed closure, controller member, or cross-file target.

It intentionally excludes aliases, non-`app` receivers, `group` / `grouped` / middleware composition, closure/member/qualified handlers, dynamic/interpolated/escaped path segments, overload or cross-file resolution, generic Swift package/import/call/type analysis, Fluent models/controllers, and runtime Vapor behavior. Swift files with syntax errors retain only their file symbol until repaired.

#### Flutter (Dart)

v0.44 adds Dart `.dart` discovery, direct top-level class/method/function containment, and a first `flutter` capability backed by the shared prebuilt Tree-sitter registry. A navigation route requires a direct `import 'package:flutter/material.dart';`, one direct `MaterialApp` construction, one direct literal `routes` map, a slash-prefixed literal key, a one-parameter arrow builder, and a unique same-file widget class:

```dart
import 'package:flutter/material.dart';

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      routes: {
        '/': (context) => const HomePage(),
        '/settings': (context) => SettingsPage(),
      },
    );
  }
}

class HomePage extends StatelessWidget {}
class SettingsPage extends StatelessWidget {}
```

This emits `NAVIGATE / -> HomePage` and `NAVIGATE /settings -> SettingsPage` with `framework.flutter.direct-material-app.literal-routes-map.local-widget-class` evidence. Each accepted edge targets exactly one direct same-file class, so navigation remains `exact` rather than guessing a dynamic builder, a router delegate, or a widget defined elsewhere.

It intentionally excludes `MaterialApp.router`, `CupertinoApp`, `home` / `onGenerateRoute` / `Navigator` calls, aliases, spreads or typed/dynamic maps, nonliteral paths, closures, constructors with arguments, non-class targets, and cross-file widget resolution. Dart files with syntax errors retain only their file symbol until repaired.

#### Play (Scala route tables; Scala or Java controllers)

v0.47 keeps Scala `.scala` discovery, direct top-level class/object/trait/method/function containment, and the `play` capability. Play route tables are a separate configuration syntax, so SymbolLattice discovers only `conf/routes` and `conf/*.routes` as Scala-owned inputs. It accepts one literal HTTP verb, one slash-prefixed path, and one controller-action reference:

```routes
GET   /health        controllers.HealthController.health
POST  /orders        controllers.OrderController.create(input: CreateOrder)
```

This emits `GET /health` and `POST /orders` route symbols. A route receives `framework.play.conf-routes.literal-controller-action.package-class-method` and an `exact` `routes` edge only when all of the following are uniquely proven from indexed syntax:

- The route names a fully static controller action such as `controllers.HealthController.health`.
- One direct Scala or Java package declaration matches `controllers`.
- Exactly one matching Scala class/object or Java class symbol exists in that package.
- Exactly one direct body `def health` belongs to that symbol.

The resolver records every class and method candidate in evidence. If any proof is absent or ambiguous, the edge stays `unresolved` with `framework.play.conf-routes.literal-controller-action.unresolved-handler`; it never falls back to a project-wide name guess. The package/class facts are persisted in SQLite raw artifact facts, so an unrelated incremental `sync` recomputes the same cross-file resolution without reparsing unchanged controllers.

The official [Play Scala routing documentation](https://www.playframework.com/documentation/switch/3.0.8/ScalaRouting) describes `->` as a Router mount rather than a concrete controller-action route. v0.47 preserves its literal static subset without inventing endpoints:

~~~routes
->   /api   api.Routes
~~~

This emits a `MOUNT /api -> api.Routes` route-kind graph node and one `handles` edge to a uniquely proven `api.Routes` Scala/Java class. Its evidence is `framework.play.conf-routes.literal-router-mount.package-class`; a missing or ambiguous target remains an explicit `unresolved` `framework.play.conf-routes.literal-router-mount.unresolved-router` edge. A mount never appears in the `routes` command because it is not itself a concrete HTTP endpoint.

It intentionally excludes nonliteral or malformed route rows, dynamic/wildcard Router prefixes, unqualified Router names, router-interface type checking, recursive expansion of a mounted Router into HTTP endpoints, `build.sbt` project detection, imported or classpath controller resolution, overload resolution, custom route binders, reverse routing, and runtime Play behavior. Scala files with syntax errors retain only their file symbol until repaired.

### React Router client-navigation evidence

v0.28 indexes three deliberately narrow React Router source forms: recursively composed literal JSX `Route` trees, direct `createRoutesFromElements(...)` JSX trees, and recursively composed literal v6.4+ data-router object trees. A supported client route becomes a `NAVIGATE /...` symbol, not an HTTP route: `NAVIGATE` is a query discriminator that preserves browser-navigation meaning while reusing the existing read-only `routes`, callers, impact, context, and edge-explanation views.

#### JSX `Route` elements

```tsx
import { Route as AppRoute } from "react-router-dom";
import { DashboardPage, OverviewPage, SettingsPage } from "./pages.js";

export function AppRoutes() {
  return (
    <AppRoute element={<Shell />}>
      <>
        <AppRoute path="/dashboard" Component={DashboardPage}>
          <AppRoute index element={<OverviewPage />} />
          <AppRoute path="settings" element={<SettingsPage />} />
        </AppRoute>
      </>
    </AppRoute>
  );
}
```

The resulting route records are `NAVIGATE /dashboard -> DashboardPage`, `NAVIGATE /dashboard -> OverviewPage`, and `NAVIGATE /dashboard/settings -> SettingsPage`. The pathless `Shell` layout establishes child context but does not become a fabricated public route merely because it has an element. A v5 `component={LegacyPage}` route remains supported only as a direct standalone slash-prefixed route; it never enables nested composition.

#### `createRoutesFromElements(...)` JSX trees

```tsx
import { createRoutesFromElements as makeRoutes, Route } from "react-router-dom";
import { OverviewPage, SettingsPage, WorkspacePage } from "./pages.js";

export const routes = makeRoutes(
  <>
    <Route element={<Shell />}>
      <Route path="workspace" Component={WorkspacePage}>
        <Route index element={<OverviewPage />} />
        <Route path="settings" Component={SettingsPage} />
      </Route>
    </Route>
  </>
);
```

This produces `NAVIGATE /workspace -> WorkspacePage`, `NAVIGATE /workspace -> OverviewPage`, and `NAVIGATE /workspace/settings -> SettingsPage` with `routeRegistration: "react-router-create-routes-from-elements"` provenance and `framework.react-router.create-routes-from-elements.*` edge evidence. The factory provenance is not assigned merely because the function name occurs in source: SymbolLattice proves the direct value import, direct non-optional call, exact one JSX argument, and literal direct-child route tree before it emits facts.

#### Data-router object arrays

```tsx
import { createBrowserRouter as makeRouter } from "react-router-dom";
import { OverviewPage, SettingsPage, WorkspacePage } from "./pages.js";

export const router = makeRouter([
  {
    // A pathless layout contributes no public URL of its own.
    children: [
      {
        path: "workspace",
        Component: WorkspacePage,
        children: [
          { index: true, Component: OverviewPage },
          { path: "settings", element: <SettingsPage /> }
        ]
      }
    ]
  }
]);
```

This produces `NAVIGATE /workspace -> WorkspacePage`, `NAVIGATE /workspace -> OverviewPage`, and `NAVIGATE /workspace/settings -> SettingsPage` with `routeRegistration: "react-router-data-router"` provenance and `framework.react-router.data-router.*` edge evidence. A pathless layout passes its parent's URL context to literal children but does not become a fabricated public route itself. Query either React Router form separately from HTTP registrations when useful:

```bash
node dist/cli/main.js routes /path/to/project --method NAVIGATE --path /workspace/settings --limit 20
```

> [!NOTE]
> Compared with the local CodeGraph baseline used to plan this pack, SymbolLattice proves the import binding, direct JSX/factory/data-router tree shape, literal path composition, and page binding through the AST instead of matching a source-text window. Dynamic router configurations can therefore remain unresolved by design, while unrelated object `path` fields or JSX tags are not promoted into navigation evidence.

The v0.28 pack accepts only:

- a direct, non-type-only named `Route`, `createRoutesFromElements`, `createBrowserRouter`, `createHashRouter`, or `createMemoryRouter` import from `react-router` or `react-router-dom`; import aliases are supported;
- for JSX, a direct literal `Route` tree with slash-prefixed root paths or pathless layouts, direct child `Route` elements or direct JSX fragments, static relative child paths, and `index` children that have neither a path nor substantive route content; v6 `Component={Page}` / `element={<Page />}` handlers may compose, while v5 `component={Page}` remains direct and standalone;
- for `createRoutesFromElements`, one direct non-optional factory call with exactly one direct JSX `Route` or JSX fragment argument. Its literal tree follows the same root/pathless-layout, direct-child/fragment, static-relative-child, and index-route rules as JSX extraction;
- for data routers, one direct non-optional factory call with exactly one direct array-literal argument; a slash-prefixed root or a pathless layout can lead a recursive literal `children` array, static non-root children must have a nonempty relative path, and an `index: true` child uses its parent URL with no own path or children;
- for every emitted JSX, factory, or data-router route, exactly one direct supported page reference; a pathless layout passes context but is not emitted merely because it has a component; and
- exact local, import, or re-export value-space proof for the page component. Unresolved component references remain visible as unresolved `routes` edges rather than becoming global name guesses.

JSX, factory, and data-router extraction intentionally do not make one unsupported child erase an independently proven ancestor or sibling. They do not, however, derive a route from an unsupported shape. Dynamic paths or child arrays, member/wrapped/inline page expressions, type-only or shadowed imports, route-array variables/spreads, `lazy` route fields, unsupported factory call shapes (including optional calls, multiple arguments, or dynamic JSX values), JSX conditionals or arbitrary wrapper descendants, absolute child paths, and `.` / `..` child segments produce no recursive navigation evidence for that shape. Runtime router semantics are not inferred.

### Next.js filesystem navigation evidence

v0.25 recognizes two narrow convention surfaces without loading Next.js, executing a build, or inferring runtime configuration. An eligible source file must have exactly one direct, named default export; the file path then contributes the route pattern and the ordinary resolver proves the handler binding.

```tsx
// pages/blog/[slug].tsx
export default function ArticlePage() {
  return <article>Article</article>;
}

// src/app/(marketing)/pricing/page.tsx
import { PricingPage } from "../../../components/pricing-page.js";

export default PricingPage;
```

These produce `NAVIGATE /blog/[slug] -> ArticlePage` with `routeRegistration: "nextjs-pages-router"` and `NAVIGATE /pricing -> PricingPage` with `routeRegistration: "nextjs-app-router"`. The handler edge carries `framework.nextjs.pages-router.*` or `framework.nextjs.app-router.*` evidence, including the existing exact local/import/re-export distinction.

The v0.25 pack accepts only:

- `pages/` or `src/pages/` files, excluding `pages/api/` and special `_app`, `_document`, `_error`, `404`, and `500` files; `index` maps to its containing path;
- `app/` or `src/app/` files named `page` with a TS/JS extension; normal route segments and dynamic segments such as `[slug]` are retained, while a conventional route group such as `(marketing)` is omitted from the URL;
- one direct named `export default function Page() {}`, `export default class Page {}`, or a direct `export default Page` identifier; and
- the existing exact lexical, import, or re-export resolution of that named page handler. An unresolved handler remains an unresolved `routes` edge instead of becoming a global-name guess.

> [!CAUTION]
> This is not a generic Next.js runtime model. Pages API files, App Router `route` handlers, middleware, layouts, templates, loading/error/not-found files, anonymous or wrapped/HOC default exports, parallel-route `@slot` segments, and intercepting-route segments are deliberately excluded. Route groups are omitted only when their segment has the conventional `(name)` shape.

### NestJS decorator and RouterModule route evidence

v0.17 extends the AST-proven NestJS HTTP pack with exact `RouterModule.register()` prefix projection. Nest combines the optional controller prefix with a method decorator path, and module routes recursively add parent-to-child prefixes. SymbolLattice follows the documented [controller-routing](https://docs.nestjs.com/controllers) and [RouterModule](https://docs.nestjs.com/recipes/router-module) models while retaining source, binding, and module-composition evidence.

```ts
import { Controller as ApiController, Get, Post } from "@nestjs/common";

@ApiController("api/cats")
export class CatsController {
  @Get()
  findAll() { return []; }

  @Post(":id")
  replaceOne() { return []; }
}
```

The indexed route records are `GET /api/cats -> CatsController.findAll` and `POST /api/cats/:id -> CatsController.replaceOne`. No name lookup or project-wide fallback is used for these handler edges: a valid decorated method in the same controller is the proof.

When the controller is registered in a module with a static RouterModule route tree, the resolver produces the complete project route:

```ts
import { Module } from "@nestjs/common";
import { RouterModule } from "@nestjs/core";

@Module({ controllers: [CatsController] })
export class CatsModule {}

@Module({
  imports: [
    RouterModule.register([
      {
        path: "admin",
        module: AdminModule,
        children: [{ path: "catalog", module: CatsModule }]
      }
    ])
  ]
})
export class AppModule {}
```

Here `@Controller("cats")` plus `@Get(":id")` becomes `GET /admin/catalog/cats/:id`. Its persisted handler edge remains `exact`, but now records `framework.nestjs.router-module.exact-prefix` module evidence with the handler, controller, and owning module candidates.

The v0.17 surface is deliberately strict:

- TypeScript and JavaScript source are supported when the parser exposes decorators.
- `Controller`, `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`, and `All` must be non-type-only **named imports** from `@nestjs/common`; import aliases are supported.
- `@Controller(...)` and the method decorator must be direct calls with zero arguments or one static string/template-literal path. Prefixes are normalized only at their join boundary, so `@Controller("api")` plus `@Get(":id")` becomes `/api/:id`.
- Decorated instance methods with a body are accepted. Their `routes` edge is `exact` with `framework.nestjs.decorator-route.local-method` syntax evidence.
- Module composition requires direct named `Module` and `RouterModule` imports from `@nestjs/common` and `@nestjs/core`, respectively; aliases are supported. Only a direct `RouterModule.register([...])` entry in a direct `@Module({ imports: [...] })` array is read.
- The route tree accepts literal `path`, direct identifier `module`, and recursively static `children` entries. Controller/module targets need exact local, import, or re-export class proof. Dynamic, namespace, type-only, shadowed, duplicate, computed, or spread-based shapes are not promoted into a prefix.
- If a module prefix cannot be proven, SymbolLattice retains the controller-local route rather than inventing a global route. `forRoot` / `forChild`, global prefixes, versioning, runtime adapters, guards, custom/composed decorators, and SSE remain outside the HTTP route proof surface. The separate non-HTTP NestJS proof surface is documented below.

> [!NOTE]
> `routes` does not need a new command or MCP tool for React Router, Fastify, or NestJS: the existing read-only route query returns Express, Fastify, React Router, and NestJS evidence from the active generation together. Use `--method NAVIGATE` to select React Router client-navigation routes.

### NestJS non-HTTP entrypoint evidence

v0.18 adds a distinct transport graph contract for NestJS operations that are not HTTP routes. A supported declaration creates an `entrypoint` node named as `<transport> <operation> <name>` and an exact `handles` edge to its instance method. The edge participates in callers, callees, impact, context, `explore`, `node`, and `explain-edge`, but it never appears in `routes` or receives a fabricated HTTP method/path.

```ts
import { Controller } from "@nestjs/common";
import { Query, Resolver } from "@nestjs/graphql";
import { MessagePattern } from "@nestjs/microservices";
import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";

@Resolver()
export class AuthorsResolver {
  @Query()
  author() { return {}; }
}

@Controller()
export class MathController {
  @MessagePattern({ cmd: "sum" })
  sum() { return 0; }
}

@WebSocketGateway({ namespace: "events" })
export class EventsGateway {
  @SubscribeMessage("created")
  created() {}
}
```

The persisted records are `graphql query author`, `microservice message {"cmd":"sum"}`, and `websocket subscribe events:created` respectively. Query them independently from HTTP routes:

```bash
# Read the active generation only; this never initializes or refreshes an index.
node dist/cli/main.js entrypoints /path/to/project --transport graphql --operation query
node dist/cli/main.js entrypoints /path/to/project --transport microservice --name '{"cmd"'
node dist/cli/main.js entrypoints /path/to/project --transport websocket --operation subscribe --name events:
node dist/cli/main.js entrypoints /path/to/project --transport ui --operation root --name Home
```

v0.64 also records a complete direct ArkUI `@Entry @Component struct Home { ... }` declaration as `ui root Home` with an exact local `handles` edge to the `Home` component. A UI root is not a browser-navigation route, so it never appears in `routes` or receives an invented HTTP method/path.

The contract follows Nest's documented [GraphQL resolver](https://docs.nestjs.com/graphql/resolvers) and [subscription](https://docs.nestjs.com/graphql/subscriptions), [microservice message/event](https://docs.nestjs.com/microservices/basics), and [WebSocket gateway](https://docs.nestjs.com/websockets/gateways) decorators while keeping only statically provable information:

- Decorators must be direct, non-type-only named imports from their owning Nest package; aliases are supported. Namespace calls, local barrels, custom/composed decorators, foreign imports, and shadowed bindings are not promoted.
- GraphQL requires one direct `@Resolver(...)` on the class plus direct `@Query`, `@Mutation`, or `@Subscription` instance-method decorators. A zero-argument or arrow-return-type operation uses the method name; a literal schema-first name or a static `{ name: "..." }` option is retained exactly. Dynamic or conflicting names remain outside the graph.
- Microservices require one direct `@Controller(...)` class decorator plus direct `@MessagePattern` or `@EventPattern` methods. The first pattern argument may be a static string/template literal or a recursively static JSON-compatible object with ordinary data properties; object keys are canonicalized before persistence. An optional transport argument is not separately modeled.
- WebSockets require one direct `@WebSocketGateway(...)` class decorator and a direct single-literal `@SubscribeMessage(...)` method decorator. A gateway with no options, a literal numeric port, or an object with an absent/static literal `namespace` is supported; a nonempty namespace is composed as `namespace:event`.
- Handlers must be non-static methods with a body and a direct source-level name. Runtime schema generation, GraphQL field resolvers, dynamic pattern construction, dynamic gateway configuration, runtime transport selection, guards, adapters, and broker/server wiring are intentionally not inferred.

> [!NOTE]
> `entrypoints` is a read-only active-generation view with a default limit of 50 and a maximum of 100. Its status may be stale after source edits, while its records remain evidence from the last successful index. Run `sync` or `index` to publish newer transport facts.

### Direct type hierarchy evidence

v0.15 adds declaration-level hierarchy facts without borrowing a compiler type checker or using a project-wide name guess. A supported relationship is an AST-proven direct identifier in a class or interface heritage clause; SymbolLattice records the exact identifier range and preserves an unresolved relationship when its binding cannot be proved.

```ts
import { BaseModel } from "./base-model.js";
import type { Auditable, Serializable } from "./contracts.js";

export class User extends BaseModel implements Auditable, Serializable {}
export interface AdminUser extends Auditable {}
```

```bash
# Query only the persisted active-generation hierarchy.
node dist/cli/main.js hierarchy "src/user.ts#User" --project /path/to/project
node dist/cli/main.js hierarchy "src/base-model.ts#BaseModel" --project /path/to/project --limit 25
```

The graph edge direction is child to parent. `hierarchy` therefore returns direct outgoing parents and exact incoming children, bounded independently by a default of 25 and a maximum of 100. An unresolved parent remains visible as `parent: null`; unresolved edges never manufacture a child relationship.

The evidence contract is intentionally narrow:

- TypeScript and JavaScript class `extends` require a **value-space** proof and resolve only to an indexed class.
- TypeScript class `implements` and interface `extends` use the **type space** and may resolve to an indexed class, interface, or type alias. `import type` and type-only re-export provenance are supported here, but never as runtime class bases.
- Local lexical bindings, explicit imports, and re-export surfaces can prove a target. Explicit but incompatible, ambiguous, or missing bindings remain `unresolved`; SymbolLattice never falls back to a unique global name for heritage.
- Direct identifier generic arguments such as `Base<T>` are accepted. Qualified names, mixin/call expressions, intersections, conditional types, and other complex heritage expressions are deliberately excluded.
- The source surface is named class/interface declarations plus default-exported class expressions. Variable-held and nested class expressions do not receive separate hierarchy nodes in v0.15.

> [!NOTE]
> `hierarchy` is a read-only active-generation query, not a transitive traversal or override engine. Its status may be stale after a source edit, while its parents and children remain evidence from the last successful generation. Run `sync` or `index` to publish newer hierarchy facts.

### Indexed source search

`find` and `query` resolve graph symbols by name, qualified name, ID, or location. `search` is a separate retrieval command: it searches only the source text and identifier-part corpus captured with the active graph generation.

```bash
# Prefix-style lexical retrieval. All query terms must match the indexed corpus.
node dist/cli/main.js search "fetch response" --project /path/to/project

# Restrict persisted results without reading the live source tree.
node dist/cli/main.js search "session timeout" --project /path/to/project \
  --path src/server --language typescript --limit 10
```

Search accepts letters, numbers, and identifier fragments; punctuation is treated as text separation rather than query syntax, and common diacritics fold consistently with local FTS (`café` can match `cafe`). Each result includes its deterministic rank, file and language, persisted source range/excerpt, terms found directly in source, an explanation, and zero or more overlapping declaration candidates.

> [!NOTE]
> `status` is evaluated against the live project, but `search.results` always come from the persisted active generation. If a file changes after indexing, search can truthfully return `stale: true` while still showing the older indexed excerpt. Run `sync` or `index` to publish newer evidence.

### Generation-bound exploration

For an exact symbol match, `explore` returns its excerpt from the same active generation as its graph relationships and ranges. It never substitutes the current file contents. This means a changed or deleted live file can produce `stale: true` while the response still carries the older, internally consistent evidence.

The bundled service supplies `sourceAvailability` to make that contract explicit:

- `active-generation` — `source` is immutable persisted evidence from the active generation.
- `unavailable` — the graph is still queryable, but an older adapter or legacy generation cannot supply persisted source text; `source` is `null` and SymbolLattice does not fall back to the live filesystem.
- `not-applicable` — the reference was ambiguous or not found, so there is no exact symbol source to return.

The field is additive: an external legacy `ExploreService` embedding may omit it rather than making a provenance claim it cannot support.

### Generation-bound node inspection

`node` is the exact-symbol companion to `explore`: it returns the full declaration range plus a bounded persisted declaration body rather than a small surrounding excerpt, together with direct persisted callers and callees from the same active generation.

```bash
# ID, qualified name, simple name, and path:line[:column] references use the normal exact-match rules.
node dist/cli/main.js node "src/math.ts#add" --project /path/to/project
node dist/cli/main.js node "src/math.ts:12" --project /path/to/project
```

Every response carries fixed `bounds`: at most **200 source lines**, **16,000 UTF-16 code units**, **25 direct callers**, **25 direct callees**, and **25 ambiguous match candidates**. `source` includes the full persisted declaration `range`, `totalLines`, `totalCharacters`, and `truncated`. When a declaration exceeds either source bound, `source.text` is a contiguous prefix of that immutable declaration range; SymbolLattice never quietly reads a current file to fill the remainder. `callers.truncated`, `callees.truncated`, and `matchCandidatesTruncated` make relation or ambiguity omissions explicit.

Like `explore`, `node` preserves `exact`, `ambiguous`, and `not_found` matching rather than choosing an ambiguous candidate. Ambiguous candidates retain deterministic source order and are capped at 25 with `matchCandidatesTruncated: true` when further persisted candidates exist. Only an exact match has source or graph relationships. `sourceAvailability` is `active-generation`, `unavailable`, or `not-applicable`; a legacy adapter or generation with no persisted source projection remains graph-queryable but returns `source: null`, never live source. The command and MCP tool are read-only and do not initialize, sync, or refresh an index.

### Bounded multi-symbol context

`context` is a separate, additive view for reading a small, explicit set of related symbols. It does not replace the single-symbol `explore` contract.

```bash
node dist/cli/main.js context \
  "src/consumer.ts#calculate" \
  "src/math.ts#add" \
  --project /path/to/project
```

The input accepts **1–8 ordered references**. Each result preserves the normal `exact`, `ambiguous`, or `not_found` match rather than selecting an ambiguous candidate. Ambiguous candidate lists cap at 25 and set `matchCandidatesTruncated` when more persisted candidates exist. Exact matches include a persisted source excerpt when the active generation can supply it, bounded direct callers/callees, and bounded reverse-impact paths.

Adjacent exact references are also checked as a directed static path in the supplied order. A returned `path` is the deterministic shortest path through **exact** `calls`, `routes`, `handles`, or `imports` edges only. SymbolLattice never reverses an edge, treats a heuristic edge as proof, or fabricates a dynamic-dispatch hop. Each pair reports one of `path`, `same-symbol`, `no-path`, `not-applicable`, or `truncated`.

| Option | Default | Range | Effect |
| --- | ---: | ---: | --- |
| Match candidates | `25` | fixed | Cap candidates returned for each ambiguous reference and report `matchCandidatesTruncated` |
| `--relation-limit` | `8` | `1–25` | Cap direct callers and callees per exact symbol |
| `--max-hops` | `4` | `1–6` | Cap directed evidence-path hops for each adjacent pair |
| `--impact-depth` | `2` | `1–3` | Cap reverse dependency depth per exact symbol |
| `--impact-limit` | `8` | `1–25` | Cap reverse-impact paths per exact symbol |

Each context response includes the applied `bounds`, per-section `truncated` flags, and a fixed per-path traversal budget. This makes response size and omitted evidence explicit instead of silently ranking or dropping data.

> [!NOTE]
> Context uses the same active-generation source-document bundle as its graph data. With an older `GraphStore` adapter or legacy generation, exact graph context remains available with `sourceAvailability: "unavailable"`; SymbolLattice never reads the live file as a substitute.

### Affected test evidence

`affected` turns changed source files into a bounded test-selection report. Supply one or more paths directly, pipe a file list into `--stdin`, or select the files with a local read-only Git change set.

```bash
# One or more project-relative files. Absolute paths are normalized to the project.
node dist/cli/main.js affected src/math.ts src/http/client.ts --project /path/to/project

# Keep Git selection caller-owned when that fits an existing CI pipeline.
git diff --name-only HEAD | node dist/cli/main.js affected --stdin --project /path/to/project

# Compare HEAD with the staged/unstaged working tree and untracked files.
node dist/cli/main.js affected --working-tree --project /path/to/project

# Compare the local merge-base of origin/main and HEAD. This does not fetch.
node dist/cli/main.js affected --base origin/main --project /path/to/project
```

#### Local Git selection

`--working-tree` resolves the local `HEAD`, compares it with the staged and unstaged working tree, and adds untracked files that are not ignored. `--base <ref>` resolves the supplied **local** ref, finds `merge-base(<ref>, HEAD)`, and compares that merge base with `HEAD`; it intentionally excludes uncommitted and untracked work.

The two Git modes are mutually exclusive and cannot be combined with explicit paths or `--stdin`. They require a repository with a resolvable `HEAD`. Git is run with argv-only process execution, `--no-ext-diff`, and `--no-textconv`; SymbolLattice never fetches, commits, stages, initializes, indexes, or syncs as part of this query.

Git output is preserved under `changeSet.changes`, including non-source files and both sides of renames or copies. Only supported TypeScript/JavaScript/Python/Go/Rust paths outside `.git`, `.symbol-lattice`, `coverage`, `dist`, and `node_modules` become `changeSet.sourcePaths`; those paths are capped at `50` and are the only inputs sent to graph analysis. If a Git change set has no supported source paths, the response returns its provenance with `affected: null` rather than inventing an empty graph traversal.

> [!CAUTION]
> Git selection is **file-level**, not semantic Git diff. It does not map hunks to declarations, infer runtime behavior, or run a test runner. A base comparison may also be stale relative to the active graph generation; use the returned freshness and completeness fields before treating the selected tests as complete.

For each changed file that exists in the active generation, SymbolLattice walks reverse **exact** `imports` and `exports` edges. This includes barrel re-exports and returns one deterministic proof path from the changed file to each selected test. A changed test file itself is included with a zero-edge `changed-test` path.

Test files are classified conservatively from their indexed paths: `*.test.*`, `*.spec.*`, and `*.e2e.*`, plus files under `__tests__/`, `test/`, `tests/`, `spec/`, or `e2e/`. This is static path convention, not test-runner discovery.

| Bound | Default | Range | Effect |
| --- | ---: | ---: | --- |
| Changed source paths | `50` | `1-50` explicit; `0-50` from Git | Rejects oversized input lists instead of silently dropping files |
| `--depth` | `5` | `1-8` | Caps reverse exact import/export hops per changed indexed file |
| `--limit` | `25` | `1-100` | Caps returned proof-bearing test records |
| Visited files | `500` | fixed | Caps traversal work independently for each changed indexed file |

An explicit-path report always includes `inputs.indexed`, `inputs.notIndexed`, the test-path classification, proof path, `indexScope`, and `completeness`. A Git-selected report wraps that report in `affected` and adds immutable `changeSet` provenance. `completeForActiveGeneration` is true only when the active generation is fresh, every requested path was indexed, and no depth, visit, or result cap omitted evidence. It is never a claim that unindexed source roots, runtime-discovered tests, dynamic dispatch, or unsupported languages are fully covered.

> [!NOTE]
> The graph proof is always read from the active persisted generation. As with other query commands, freshness is evaluated against the live project so a stale index is visible rather than silently refreshed.

### Immutable Git hunk declaration attribution

`git-hunks [path] --base <ref> [--limit <count>]` is intentionally separate from `affected --base <ref>`. `affected` first performs **file-level** local Git selection and then uses the active persisted graph to select conventionally named tests. `git-hunks` requires no active SQLite graph: it resolves the supplied local ref, computes `merge-base(<ref>, HEAD)`, and compares that merge base with `HEAD` only. It reads immutable local Git blobs, returns zero-context unified hunks, and extracts declaration anchors separately from the exact old and new revisions.

```bash
# Read immutable local Git revisions only; this never fetches or uses the working tree.
node dist/cli/main.js git-hunks /path/to/project --base origin/main

# Apply a smaller global hunk-record result bound.
node dist/cli/main.js git-hunks /path/to/project --base origin/main --limit 10
```

The command has no working-tree, staged, or untracked-file selector. It does not read an active graph, select tests, fetch, index, synchronize, or mutate Git or SQLite state. Supported TS/TSX/JS/JSX/Python/Go/Rust/Java source sides are read from the two resolved revisions only.

| Bound | Default | Range | Effect |
| --- | ---: | ---: | --- |
| Changed supported source files | `50` | fixed maximum | Rejects a larger local merge-base-to-`HEAD` source selection rather than reading more blobs |
| `--limit` | `25` | `1-100` | Globally caps returned hunk records after deterministic ordering |
| Declaration anchors | `25` per side | fixed maximum | Caps anchors independently for each old and new hunk side and reports truncation explicitly |

> [!CAUTION]
> Declaration IDs and anchors are **revision-local** evidence. A returned old-side declaration and new-side declaration are not an identity match: SymbolLattice makes no rename, move, or cross-side continuity claim.

### Workspace resolution

SymbolLattice recognizes local workspace packages declared by the root `package.json`:

```json
{
  "private": true,
  "workspaces": ["packages/*"]
}
```

It also accepts `{ "workspaces": { "packages": [...] } }`, recursive `**` patterns, and `!` exclusions. Resolution order is:

1. Relative source path.
2. TypeScript/JavaScript `paths` or `baseUrl` alias.
3. Local workspace package name and explicit subpath export.
4. Unresolved.

Workspace targets must already be inside the active source scope. SymbolLattice never broadens `--scope`, follows `node_modules`, or chooses between duplicate workspace package names. Invalid, escaping, or duplicate manifests fail explicitly before replacing the active graph.

### Re-export semantics

The extractor stores re-export syntax as raw, reusable facts. The resolver then builds a deterministic export surface across the project:

- Local and explicit named exports take precedence over wildcard exports.
- `export *` never forwards `default`.
- Wildcard name collisions remain unresolved rather than selecting the first candidate.
- Cyclic barrels terminate safely; no target is fabricated without a declaration.
- `export * as namespace` is retained as provenance, but namespace property dispatch remains unresolved in this release.

### Incremental sync contract

`init` and `index` perform a complete extraction and graph rebuild. `sync` is explicit and follows this contract:

1. Scan current sources, scope, ignore policy, TypeScript configuration, and workspace manifests.
2. Reuse a persisted raw artifact only when its file path, content hash, language, and extractor version match.
3. Re-extract added, modified, or incompatible artifacts.
4. Compute reverse import/re-export dependency invalidation for observability.
5. Rebuild the full module/export and source-retrieval projections from the current raw facts and scanned source documents.
6. Atomically replace the active generation only after all work succeeds.

The full-project projection in step 5 is intentional: a new export, removed file, barrel change, or configuration change can affect an unchanged caller. `lastIndexWork` reports `reExtractedFiles`, `reusedArtifactFiles`, and `dependencyInvalidatedFiles`; it does **not** claim that resolution was only partial. A no-op `sync` does not create a new generation.

## Retained graph history and structural diff

Every successful `init`, `index`, or changed `sync` publishes an immutable graph snapshot. SymbolLattice retains at most **five** generations, including the active one. `history` lists their IDs and immutable metadata; use those IDs as inputs to `diff`.

```bash
# Newest first. `--limit` only limits this response; it does not change retention.
node dist/cli/main.js history /path/to/project --limit 5

# Compare an older retained graph with the active graph.
node dist/cli/main.js diff "generation:<older-id>" /path/to/project --limit 50

# Or select both retained graph generations explicitly.
node dist/cli/main.js diff "generation:<older-id>" /path/to/project \
  --to "generation:<newer-id>" --limit 50
```

`history` returns newest-first generation summaries with the captured counts, index-work telemetry when available, extractor/resolver versions, and a `retention` object. Its `activeStatus` is deliberately separate: it is the live-filesystem freshness of the **current active generation**, not a freshness claim about an older retained snapshot.

Each `history` or `diff` selection is assembled from one coherent persisted SQLite read. A concurrent `sync` cannot mix retained snapshots from one generation set with an active projection from another; live freshness remains separately reported in `activeStatus`.

`diff` compares two saved `GraphSnapshot` values and returns independently bounded `added`, `removed`, and `modified` sections for files, symbols, edges, and pending references. Every section reports `{ items, total, truncated }`; `--limit` applies independently to every section. File modification ignores the publication-only `indexedAt` field and instead uses path, content hash, and language. Symbols, edges, and pending references are compared by stable ID; a same-ID payload change is an explicit structural modification.

> [!CAUTION]
> This is a retained **graph** diff, not Git history or a semantic source diff. It does not identify commits, inspect hunks, infer renames or moves, browse historical source text, or map lines to declarations. A changed identity is reported as remove-plus-add unless a stable ID persists. Unknown, evicted, or older than five generations are reported explicitly rather than silently substituted.

History and diff are read-only: they never run `init`, `index`, `sync`, or `watch`. A no-op `sync` also does not create a duplicate generation. Existing v0.10-and-earlier active indexes gain a trustworthy retained snapshot only through an explicit mutating lifecycle such as `sync`, `index`, or `init`; read commands never perform that migration for you.

### Opt-in event-accelerated foreground watch

`watch` brings the existing freshness and atomic-sync contract into an explicit foreground process. The CLI requests a native recursive filesystem watcher when the host supports it, coalesces event bursts for 250 ms, and keeps the established bounded polling cadence as a safety sweep. It never starts implicitly from a query, MCP request, or another CLI command.

```bash
# Requires an existing initialized graph. Native events accelerate the default 2-second safety sweep.
node dist/cli/main.js watch /path/to/project

# Choose an intentionally slower safety sweep for a large project (250-60000 ms).
node dist/cli/main.js watch /path/to/project --interval 5000

# Opt out of native events when a controlled environment needs polling only.
node dist/cli/main.js watch /path/to/project --poll

# A filesystem root or home-directory project still needs deliberate consent.
node dist/cli/main.js watch /path/to/project --force
```

At startup, SymbolLattice runs the same live freshness check used by `status`, completes an atomic `sync` only if that check finds drift, then subscribes to native project events. An event restarts one 250 ms debounce and runs the same status-to-sync path, while an independent bounded safety sweep remains armed even if events continue arriving. Events that arrive during a status check or sync coalesce into one later reconciliation, so scans and writes never overlap. The adapter ignores `.git`, `.symbol-lattice`, `coverage`, `dist`, and `node_modules` events; its own SQLite publication cannot trigger a feedback loop. The watch process reuses stored scope and intentionally exposes no `--scope`, so it cannot quietly replace the scope established by a prior `init`, `index`, or `sync`.

Each stdout line is one compact NDJSON receipt. Every receipt has `event`, `observedAt`, `projectPath`, `status`, `previousGenerationId`, `generationId`, `lastIndexWork`, `error`, `retryDelayMs`, `pendingFileCount`, `pendingFiles`, `pendingFilesTruncated`, and `pendingFilesUnknown`; values that do not apply are explicit `null` rather than omitted. `event-watch-active` confirms that native events are available. `event-watch-failed` carries either `WATCH_EVENTS_UNAVAILABLE` (setup) or `WATCH_EVENTS_FAILED` (a later watcher error), closes the event source, and leaves polling active.

For native events, `event-pending` discloses the bounded project-relative paths that still need a successful freshness reconciliation. `pendingFiles` is lexically ordered and capped at 25 paths. `pendingFileCount` is exact only when no path was unknown and the cap was not reached; otherwise it is `null`, with `pendingFilesUnknown` or `pendingFilesTruncated` explaining why. A successful `event-fresh` or `synced` receipt clears the pending state; a `status-failed` or `sync-failed` receipt retains it. Polling-only mode never fabricates file paths. The abbreviated examples below show only the fields relevant to each transition.

```json
{"event":"event-watch-active","error":null,"retryDelayMs":null}
{"event":"event-pending","pendingFileCount":1,"pendingFiles":["src/math.ts"],"pendingFilesTruncated":false,"pendingFilesUnknown":false}
{"event":"stale-detected","previousGenerationId":"generation:old","generationId":"generation:old","error":null,"retryDelayMs":null}
{"event":"synced","previousGenerationId":"generation:old","generationId":"generation:new","lastIndexWork":{"mode":"incremental"},"pendingFileCount":0,"pendingFiles":[],"pendingFilesTruncated":false,"pendingFilesUnknown":false,"error":null,"retryDelayMs":null}
```

Temporary configuration or filesystem failures emit `sync-failed` or `status-failed` with an actionable error and a bounded exponential retry delay (at most 60000 ms). If native watching is unavailable or later fails, the existing polling loop remains the fallback rather than making freshness silently disappear. If the previously active index itself disappears, `watch` emits terminal `status-failed` with `MISSING_INDEX`, exits non-zero, and requires a new explicit `init` before restart. The current active generation remains available through ordinary refresh failures because `sync` publishes only after a successful full-project projection. Press `Ctrl+C` (or send `SIGTERM`) to close the event source and stop future work; an in-flight sync is allowed to finish before the final `stopped` receipt.

> [!CAUTION]
> This is an explicit foreground event accelerator with polling fallback, not a daemon or a durable background service. Native events are a scheduling hint: every reconciliation still scans the live catalog before deciding whether to publish. Pending paths are observable only by the foreground stream that observed them; SymbolLattice does not claim CodeGraph-style MCP response banners, cross-process pending state, per-file partial resolution, semantic Git diff, or background freshness after the process exits.

## Configuration and scope

```bash
# Index only selected project-relative directories.
node dist/cli/main.js init /path/to/project --scope src --scope packages/core

# Reuse the successful scope later.
node dist/cli/main.js sync /path/to/project

# Replace it deliberately.
node dist/cli/main.js sync /path/to/project --scope src
```

The active generation fingerprints the root `.gitignore`, selected `tsconfig.json` or `jsconfig.json`, project-local `extends` chain, root workspace manifest, discovered workspace manifests, and effective scope. `status` can report:

| Reason | Meaning |
| --- | --- |
| `source-files-changed` | The active source set or source hash differs |
| `project-inputs-changed` | Scope, ignore policy, config, or workspace metadata differs |
| `indexer-version-changed` | Persisted artifacts or projection semantics need an explicit refresh |
| `configuration-invalid` | Current TypeScript or workspace configuration cannot be parsed safely |
| `configuration-untracked` | A legacy generation has no reproducibility identity |

## Command reference

| Command | Purpose |
| --- | --- |
| `init [path]` | Create the local database and build the first full generation |
| `index [path]` | Explicitly perform a full extraction and rebuild |
| `sync [path]` | Explicitly reuse compatible raw facts and publish a fresh graph when needed |
| `watch [path]` | Keep an existing graph fresh in the foreground with native-event acceleration, a 250 ms debounce, capped pending-path disclosure, `--interval 250-60000` polling fallback, `--poll` opt-out, compact NDJSON receipts, retry/backoff, and `--force` only for deliberate broad paths |
| `status [path]` | Report active generation, freshness, stale reasons, and latest index work |
| `history [path]` | List bounded immutable retained graph-generation summaries; accepts `--limit` and never refreshes the index |
| `diff <from-generation-id> [path]` | Structurally compare an older retained graph with active or explicit `--to <generation-id>`; accepts per-category `--limit` and never refreshes the index |
| `find <query>` / `query <query>` | Search symbols by name, qualified name, ID, or location |
| `search <query>` | Search persisted source and identifier evidence; accepts `--limit`, `--path`, and `--language` |
| `node <reference>` | Return one exact symbol's bounded persisted declaration range, direct callers/callees, provenance, and freshness; never refreshes the index |
| `hierarchy <reference>` | Return bounded direct `extends` / `implements` parents and exact children, including unresolved parent evidence; accepts `--limit` and never refreshes the index |
| `routes [path]` | List bounded static Express, Fastify, Flask, FastAPI, Gin, `net/http`, Chi, and Axum route nodes (including direct inline, same-file named, and imported/re-exported Fastify plugin-prefix projections) plus AST-proven NestJS route nodes with exact `RouterModule.register()` prefix projections; accepts `--method` (including `TRACE` and `CONNECT`), `--path`, and `--limit`; never refreshes the index |
| `entrypoints [path]` | List bounded AST-proven NestJS GraphQL, microservice, WebSocket, and ArkUI UI-root entrypoints with exact handler evidence; accepts `--transport`, `--operation`, `--name`, and `--limit`; never refreshes the index |
| `callers <symbol>` / `callees <symbol>` | Show direct graph relationships |
| `impact <symbol>` | Trace reverse impact with optional `--depth` and explicit output `--limit` |
| `affected [filePaths...]` | Select conventionally named tests from exact persisted import/export evidence; accepts direct paths or `--stdin`, plus local Git `--working-tree` or `--base <ref>`, `--depth`, and `--limit` |
| `git-hunks [path] --base <ref> [--limit <count>]` | Read bounded zero-context hunks from immutable local merge-base-to-`HEAD` blobs and anchor declarations independently per revision; needs no active SQLite graph |
| `explore <query>` | Return exact generation-bound source when available, callers, callees, impact, and freshness |
| `context <reference...>` | Build a bounded multi-symbol persisted-evidence pack for 1–8 ordered references |
| `explain-edge <edge-id>` | Explain edge endpoints and resolution evidence |
| `serve --mcp` | Start the stdio MCP server |

`init`, `index`, and `sync` accept repeatable `--scope <directory>` plus `--force`. `watch` deliberately has no `--scope`: it reuses the active generation's persisted scope.

## MCP server

Build SymbolLattice and initialize the target project first:

```bash
node dist/cli/main.js serve --mcp --project /path/to/project
```

| Tool | Contract |
| --- | --- |
| `symbol_lattice_explore` | Return generation-bound source when available, callers, callees, impact, freshness, and structured output for an existing graph |
| `symbol_lattice_node` | Return one exact node's bounded persisted declaration range, direct callers/callees, provenance, and freshness without refreshing an index |
| `symbol_lattice_hierarchy` | Return bounded direct `extends` / `implements` parents and exact children from one active generation, including unresolved parent evidence, without refreshing an index |
| `symbol_lattice_routes` | Return bounded static Express and Fastify route nodes, including direct inline, same-file named, and imported/re-exported Fastify plugin-prefix projections, plus AST-proven NestJS route nodes with exact RouterModule prefix projections, method/path filters, handler-edge evidence, and freshness without refreshing an index |
| `symbol_lattice_entrypoints` | Return bounded AST-proven NestJS GraphQL, microservice, WebSocket, and ArkUI UI-root entrypoints with transport/operation/name filters, exact `handles` evidence, and freshness without refreshing an index |
| `symbol_lattice_context` | Return bounded generation-bound source, relationships, reverse impact, and directed proof paths for ordered references without refreshing an index |
| `symbol_lattice_affected` | Return bounded affected-test proofs for changed files, index coverage, and completeness limits without refreshing an index |
| `symbol_lattice_affected_git` | Read a local Git working-tree or merge-base change set, then return its provenance and bounded affected-test proofs without fetching, refreshing, or synchronizing an index |
| `symbol_lattice_git_hunks` | Return bounded zero-context hunks from immutable local merge-base-to-`HEAD` blobs and revision-local declaration anchors without an active graph, Git fetch, or mutation |
| `symbol_lattice_search` | Return persisted source evidence, declaration candidates, and freshness without refreshing an index |
| `symbol_lattice_history` | List retained immutable graph-generation summaries and separately named active live freshness without refreshing an index |
| `symbol_lattice_diff` | Compare two retained graph snapshots structurally with per-category bounds; it is not a Git or hunk diff and never refreshes an index |
| `symbol_lattice_explain_edge` | Return an edge, endpoints, evidence, and freshness for an existing graph |

None of these tools initializes, refreshes, starts a watcher, or otherwise mutates an index. `symbol_lattice_affected_git` additionally uses local read-only Git only; it never fetches or updates repository state. `symbol_lattice_git_hunks` uses only immutable local Git blobs from the resolved merge base to `HEAD`; it does not select working-tree, staged, or untracked files, read an active SQLite graph, or claim rename, move, or cross-side identity. `symbol_lattice_history` and `symbol_lattice_diff` read retained graph snapshots only; they do not browse historical source or run Git.

## Upgrade notes

SQLite v1 through v4 indexes remain readable. v0.4 adds generation-bound source documents and an FTS5 projection under the SQLite v4 metadata marker, so a v0.3 binary can still open and reindex after a rollback. A legacy generation has no historical source-search projection, so `search` reports an explicit availability error until a successful `sync` or `index` publishes one. That backfill can reuse compatible v0.3 raw artifact facts; it does not invent historical source evidence or telemetry. v0.4.1 adds no schema migration: when an embedded older GraphStore adapter or legacy active generation cannot supply the persisted source documents, exact `explore` remains graph-queryable with `source: null` and `sourceAvailability: "unavailable"`; it never reads a live file as substitute evidence. v0.5 adds no SQLite migration either: `context` reuses that same optional source-document bundle and keeps exact graph context available with source marked `unavailable` when an older adapter cannot supply it. v0.6 adds no SQLite migration: `affected` only reads the active graph bundle, so compatible legacy GraphStore adapters remain usable; older adapters expose `indexScope: null` instead of a fabricated scope. v0.7 also adds no SQLite migration: ordinary graph queries and explicit-path `affected` remain compatible with older adapters, while Git-selected affected tests are available only when a `GitChangeSetProvider` is injected; the CLI provides the local read-only adapter. v0.8 adds no SQLite migration: `watch` is a foreground CLI lifecycle around the existing status and sync service paths, so older embeddings and the read-only MCP tool surface remain unchanged. v0.9 also adds no SQLite migration: it injects an optional native event source into the existing foreground lifecycle, while older embeddings continue with polling only. v0.10 adds no SQLite migration and keeps callback callers source-compatible, but TypeScript producers that construct `WatchReceipt` must supply the four pending-disclosure fields. A short-lived pre-release marker `5` is normalized to `4` by explicit `sync` or `index` before rollback.

v0.11 keeps the SQLite metadata marker at `4` for rollback compatibility and adds an immutable `generation_snapshots` table plus retained-generation side data. It retains at most five graph generations, including the active one, and explicitly removes obsolete FTS rows before generation deletion. A v2-v4 active projection is backfilled only by an explicit mutating lifecycle (`sync`, `index`, or `init`); a v1 projection has no real generation ID, so SymbolLattice never fabricates a historical snapshot for it. `history` and `diff` remain read-only: if the active generation has not been backfilled, they return an explicit availability error instead of modifying the database. Older external `GraphStore` adapters remain usable for their existing features; retained-history requests return an explicit availability error until the adapter implements the optional capability. Embeddings that do not expose `history` or `diff` do not register their respective MCP tools.

v0.12 adds no SQLite migration or active-graph requirement. Immutable Git hunk attribution is available to an embedding only when it supplies the optional Git hunk capability; otherwise its existing MCP surface remains unchanged. The feature reads local immutable Git blobs directly and never backfills, refreshes, or otherwise changes an index.

v0.13 adds no SQLite migration or index backfill. `node` reuses the optional active source-document bundle already used by exact exploration: a compatible adapter exposes the additive CLI/service and `symbol_lattice_node` MCP surface, while an explore-only embedding keeps its existing MCP tools. Exact nodes remain graph-queryable when a legacy adapter or generation cannot return source documents, but report `sourceAvailability: "unavailable"` and never read current filesystem text as a substitute.

v0.14 adds no SQLite schema migration. It persists additive `route` symbols and `routes` edges through the existing graph and retained-snapshot tables, while the raw-fact/resolver version advance deliberately marks a pre-v0.14 active index as needing `sync` or `index` before it can make a route-coverage claim. The `routes` CLI/service works against the active generation only; an explore-only embedded MCP service does not register `symbol_lattice_routes` until it exposes that optional capability.

v0.15 adds no SQLite schema migration. It persists additive `extends` and `implements` edges through the existing graph, raw-fact, and retained-snapshot storage. The extractor/resolver version advance deliberately marks a pre-v0.15 active index as needing `sync` or `index` before it can make a hierarchy-coverage claim; raw facts now retain value/type binding namespaces and type-only import/re-export markers. Existing generations remain readable. The `hierarchy` CLI/service reads only the active generation, and an explore-only embedded MCP service does not register `symbol_lattice_hierarchy` until it exposes that optional capability.

v0.16 adds no SQLite schema migration or public query surface. It persists direct NestJS HTTP `route` symbols and exact `routes` edges through the existing graph and retained-snapshot tables. The extractor advances because raw facts now contain AST-proven Nest decorator edges, so a pre-v0.16 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes route evidence; the resolver version is unchanged because no name-resolution rule was added. Existing generations remain readable, and the existing `routes` CLI/service/MCP tool reads the active generation only.

v0.17 adds no SQLite schema migration or public query surface. It persists additive Nest route-to-controller, module-to-controller, and `RouterModule.register()` prefix facts in the existing raw artifact-fact payload, then projects complete route symbols during full project resolution. Both extractor and resolver versions advance, so a pre-v0.17 active index requires an explicit `sync` or `index` before route coverage can include module prefixes. Existing generations remain readable; the current `routes` CLI/service/MCP surface reads only the active generation.

v0.18 adds no SQLite schema migration. It persists additive `entrypoint` symbols and direct `handles` edges through existing graph, raw-fact, and retained-snapshot storage. The extractor advances to `typescript-ast-v7`, so a pre-v0.18 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes complete non-HTTP transport evidence; the resolver remains `project-resolver-v5` because these are file-local syntax edges. Existing generations remain readable. The new `entrypoints` CLI/service and `symbol_lattice_entrypoints` MCP tool are read-only; an explore-only embedding does not register the MCP tool until it exposes the additive capability.

v0.19 adds no SQLite schema migration or new route-query surface. It retains optional Fastify route provenance in the existing raw artifact-fact JSON and reuses the existing `routes` CLI/service/MCP tool. The extractor advances to `typescript-ast-v8` and the resolver to `project-resolver-v6`, so a pre-v0.19 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Fastify facts. Route handlers now require value-space lexical/import/re-export proof, preventing type-only imports or re-exports from appearing as runtime handler edges. Existing Express facts without Fastify provenance remain readable and preserve their established Express evidence rule IDs.

v0.20 adds no SQLite schema migration or route-query command. It stores the additive optional `routeRegistration: "fastify-inline-plugin-prefix"` field in the same raw artifact-fact payload and reuses the existing `routes` CLI/service/MCP view. The extractor advances to `typescript-ast-v9` and the resolver to `project-resolver-v7`, so a pre-v0.20 active index requires an explicit `sync` or `index` before direct inline Fastify plugin-prefix routes can appear. Existing facts remain readable and preserve their established Express and non-plugin Fastify evidence rules.

v0.21 adds no SQLite schema migration or route-query command. It introduces the additive optional `routeRegistration: "fastify-local-plugin-prefix"` value in the same raw artifact-fact payload and reuses the existing `routes` CLI/service/MCP view. The extractor advances to `typescript-ast-v10` and the resolver to `project-resolver-v8`, so a pre-v0.21 active index requires an explicit `sync` or `index` before same-file named Fastify plugin-prefix routes can appear. Existing facts remain readable and preserve their established Express, non-plugin Fastify, and inline-plugin evidence rules.

v0.22 adds no SQLite schema migration or route-query command. It persists additive `fastifyPluginFacts` (source-plugin routes, nested registrations, and imported root registrations) plus the optional `routeRegistration: "fastify-imported-plugin-prefix"` value in the existing raw artifact-fact JSON, then resolves exact plugin import/re-export surfaces into ordinary `route` symbols and `routes` edges. The extractor advances to `typescript-ast-v11` and the resolver to `project-resolver-v9`, so a pre-v0.22 active index requires an explicit `sync` or `index` before cross-file Fastify plugin-prefix routes can appear. Existing facts remain readable and preserve their previous evidence rules.

v0.23 adds no SQLite schema migration or route-query command. It introduces additive `RouteMethod` value `NAVIGATE` and optional `routeFramework: "react-router"` provenance in the existing route fact payload, then projects direct JSX `Route` declarations into ordinary route symbols and `routes` edges. The extractor advances to `typescript-ast-v12` and the resolver to `project-resolver-v10`, so a pre-v0.23 active index requires an explicit `sync` or `index` before React Router navigation evidence can appear. Existing HTTP route symbols and facts remain readable.

v0.24 adds no SQLite schema migration or route-query command. It adds the optional `routeRegistration: "react-router-data-router"` value to the existing route fact payload, then projects direct `createBrowserRouter`, `createHashRouter`, and `createMemoryRouter` object entries into ordinary route symbols and `routes` edges. The extractor advances to `typescript-ast-v13` and the resolver to `project-resolver-v11`, so a pre-v0.24 active index requires an explicit `sync` or `index` before data-router navigation evidence can appear. Existing React Router JSX and HTTP route symbols and facts remain readable.

v0.25 adds no SQLite schema migration or route-query command. It introduces executable first-party framework capability declarations and additive `routeFramework: "nextjs"` plus `routeRegistration: "nextjs-pages-router" | "nextjs-app-router"` provenance in existing route facts, then projects convention-derived Pages/App Router navigation routes into ordinary route symbols and `routes` edges. The extractor advances to `typescript-ast-v14` and the resolver to `project-resolver-v12`, so a pre-v0.25 active index requires an explicit `sync` or `index` before the new capability and Next.js navigation evidence can appear. Existing facts and evidence remain readable.

v0.26 adds no SQLite schema migration or route-query command. It recursively projects direct literal React Router data-router `children` trees, static relative children, index routes, and pathless layouts through the existing `NAVIGATE`, route-framework, route-registration, and `routes` evidence contracts. The extractor advances to `typescript-ast-v15`, so a pre-v0.26 active index requires an explicit `sync` or `index` before recursive route facts can appear. The project resolver remains `project-resolver-v12`, and existing facts and evidence remain readable.

v0.27 adds no SQLite schema migration or route-query command. It recursively projects direct literal React Router JSX `Route` trees, direct JSX fragments, static relative children, index routes, and pathless layouts through the same existing `NAVIGATE`, route-framework, route-registration, and `routes` evidence contracts. The extractor advances to `typescript-ast-v16`, so a pre-v0.27 active index requires an explicit `sync` or `index` before recursive JSX route facts can appear. The project resolver remains `project-resolver-v12`, and existing facts and evidence remain readable.

v0.28 adds no SQLite schema migration or route-query command. It introduces the additive `routeRegistration: "react-router-create-routes-from-elements"` provenance and independently projects direct imported `createRoutesFromElements(...)` JSX trees through the existing `NAVIGATE`, route-framework, and `routes` evidence contracts. The extractor advances to `typescript-ast-v17` and the resolver to `project-resolver-v13`, so a pre-v0.28 active index requires an explicit `sync` or `index` before exact factory-specific evidence can appear. Existing facts and evidence remain readable.

v0.29 adds no SQLite schema migration or route-query command. It adds Python `.py` discovery, Python declaration/containment facts, and same-file direct FastAPI decorator routes to the existing raw-fact and graph payloads. The extractor advances to `multi-language-ast-v18`; the resolver remains `project-resolver-v13` because the initial Python surface emits only file-local syntax edges. A pre-v0.29 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Python-capable facts. Existing generations remain readable.

v0.30 adds no SQLite schema migration or route-query command. It expands the existing file-local Python raw-fact surface with direct same-file `APIRouter` decorators, literal router prefixes, and direct literal `app.include_router(router, ...)` composition. The extractor advances to `multi-language-ast-v19`; the resolver remains `project-resolver-v13` because route proof still remains within one Python file. A pre-v0.30 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes APIRouter-capable facts. Existing generations remain readable.

v0.31 adds no SQLite schema migration or route-query command. It persists additive `fastApiRouterFacts` for final direct router declarations, their literal decorated handler routes, and direct one-dot relative router inclusions; the project resolver then projects exact route nodes only when the source and target form one regular Python package with explicit `__init__.py` markers. The extractor advances to `multi-language-ast-v20` and the resolver to `project-resolver-v14`, so a pre-v0.31 active index requires an explicit `sync` or `index` before cross-file FastAPI router evidence can appear. Existing generations remain readable.

v0.32 adds no SQLite schema migration or route-query command. It introduces an additive `flask` framework capability and direct Python syntax edges for literal Flask app and same-file Blueprint registrations; no generic Python module resolver is added. The extractor advances to `multi-language-ast-v21`; the resolver remains `project-resolver-v14`. A pre-v0.32 active index requires an explicit `sync` or `index` before Flask route evidence can appear. Existing generations remain readable.

v0.33 adds no SQLite schema migration or route-query command. It adds Go `.go` discovery, persisted Go language filters, conservative top-level function containment, and direct Gin engine / same-function literal RouterGroup route evidence. The extractor advances to `multi-language-ast-v22`; the resolver remains `project-resolver-v14`. A pre-v0.33 active index requires an explicit `sync` or `index` before Go and Gin evidence can appear. Existing generations remain readable.

v0.34 adds no SQLite schema migration or route-query command. It introduces an additive `net-http` framework capability and exact Go `http.HandleFunc` / same-function `http.NewServeMux().HandleFunc` route facts, including the documented literal Go 1.22 method-pattern subset. The extractor advances to `multi-language-ast-v23`; the resolver remains `project-resolver-v14` because all proof remains file-local. A pre-v0.34 active index requires an explicit `sync` or `index` before `net/http` route evidence can appear. Existing generations remain readable.

v0.35 adds no SQLite schema migration or route-query command. It introduces an additive `chi` framework capability, direct `chi.NewRouter()` / `chi.NewMux()` HTTP route facts, and the additive `CONNECT` route-method value used by direct Chi and Go 1.22 `net/http` patterns. The extractor advances to `multi-language-ast-v24`; the resolver remains `project-resolver-v14` because all proof remains file-local. A pre-v0.35 active index requires an explicit `sync` or `index` before Chi or `CONNECT` route evidence can appear. Existing generations remain readable.

v0.36 adds no SQLite schema migration or route-query command. It adds Rust `.rs` discovery, source-search/CLI/MCP language filtering, conservative top-level Rust function containment, and exact direct Axum route-builder facts. The extractor advances to `multi-language-ast-v25`; the resolver remains `project-resolver-v14` because all proof remains file-local. A pre-v0.36 active index requires an explicit `sync` or `index` before Rust or Axum route evidence can appear. Existing generations remain readable.

v0.37 adds no SQLite schema migration or route-query command. It adds Java `.java` discovery, persisted Java source-search/CLI/MCP language filtering, conservative direct top-level Java class/method containment, and exact direct Spring Web route facts. The extractor advances to `multi-language-ast-v26`; the resolver remains `project-resolver-v14` because all proof remains file-local. A pre-v0.37 active index requires an explicit `sync` or `index` before Java or Spring Web route evidence can appear. Existing generations remain readable.

v0.38 adds no SQLite schema migration or route-query command. It adds PHP `.php` discovery, persisted PHP source-search/CLI/MCP language filtering, direct top-level PHP class/method/function containment, and direct Laravel facade route facts. The extractor advances to `multi-language-ast-v27`; the resolver remains `project-resolver-v14`. A pre-v0.38 active index requires an explicit `sync` or `index` before PHP or Laravel route evidence can appear. Existing generations remain readable.

v0.39 adds no SQLite schema migration or route-query command. It adds C++ source/header discovery, persisted C++ source-search/CLI/MCP language filtering, direct top-level C++ class/method/function containment, and exact direct cpp-httplib route facts. The extractor advances to `multi-language-ast-v28`; the resolver remains `project-resolver-v14` because all supported C++ proof remains file-local. A pre-v0.39 active index requires an explicit `sync` or `index` before C++ or cpp-httplib route evidence can appear. Existing generations remain readable.

v0.40 adds no SQLite schema migration or route-query command. It adds C# `.cs` discovery, persisted C# source-search/CLI/MCP language filtering, direct top-level C# class/interface/method/local-function containment, and exact direct ASP.NET Core Minimal API and MVC controller route facts. The extractor advances to `multi-language-ast-v29`; the resolver remains `project-resolver-v14` because all supported C# proof remains file-local. A pre-v0.40 active index requires an explicit `sync` or `index` before C# or ASP.NET Core route evidence can appear. Existing generations remain readable.

v0.41 adds no SQLite schema migration or route-query command. It adds Ruby `.rb` discovery, persisted Ruby source-search/CLI/MCP language filtering, direct top-level Ruby class/method/function containment, and direct Rails `routes.draw` controller-action route facts. The shared ast-grep adapter registers C# and Ruby grammars together so either extractor can run in one process. The extractor advances to `multi-language-ast-v30`; the resolver remains `project-resolver-v14` because all supported Ruby proof remains file-local. A pre-v0.41 active index requires an explicit `sync` or `index` before Ruby or Rails route evidence can appear. Existing generations remain readable.

v0.42 adds no SQLite schema migration or route-query command. It adds Kotlin `.kt` discovery, persisted Kotlin source-search/CLI/MCP language filtering, direct top-level Kotlin class/interface/method/function containment, and exact direct Ktor `Application.module`/`routing` callable-reference route facts. The shared ast-grep adapter registers C#, Ruby, and Kotlin grammars together so all three extractors can run in one process. The extractor advances to `multi-language-ast-v31`; the resolver remains `project-resolver-v14` because all supported Kotlin proof remains file-local. A pre-v0.42 active index requires an explicit `sync` or `index` before Kotlin or Ktor route evidence can appear. Existing generations remain readable.

v0.43 adds no SQLite schema migration or route-query command. It adds Swift `.swift` discovery, persisted Swift source-search/CLI/MCP language filtering, direct top-level class/struct/protocol/method/function containment, and exact direct Vapor `routes(_ app: Application)` literal-segment route facts. The shared ast-grep adapter registers C#, Ruby, Kotlin, and Swift grammars together so all four extractors can run in one process. The extractor advances to `multi-language-ast-v32`; the resolver remains `project-resolver-v14` because all supported Swift proof remains file-local. A pre-v0.43 active index requires an explicit `sync` or `index` before Swift or Vapor route evidence can appear. Existing generations remain readable.

v0.44 adds no SQLite schema migration or route-query command. It adds Dart `.dart` discovery, persisted Dart source-search/CLI/MCP language filtering, direct top-level class/method/function containment, and exact direct Flutter `MaterialApp(routes: {...})` named-navigation facts. The shared ast-grep adapter registers C#, Ruby, Kotlin, Swift, and Dart grammars together so all five extractors can run in one process. The extractor advances to `multi-language-ast-v33`; the resolver remains `project-resolver-v14` because all supported Flutter proof remains file-local. A pre-v0.44 active index requires an explicit `sync` or `index` before Dart or Flutter route evidence can appear. Existing generations remain readable.

v0.45 adds no SQLite schema migration or route-query command. It adds Scala `.scala` and Play `conf/routes` / `conf/*.routes` discovery, persisted Scala source-search/CLI/MCP language filtering, direct top-level class/object/trait/method/function containment, and direct literal Play controller-action route facts with explicit unresolved handlers. The shared ast-grep adapter registers C#, Ruby, Kotlin, Swift, Dart, and Scala grammars together so all six extractors can run in one process. The extractor advances to `multi-language-ast-v34`; the resolver remains `project-resolver-v14` because v0.45 does not resolve Scala controller handlers across files. A pre-v0.45 active index requires an explicit `sync` or `index` before Scala or Play route evidence can appear. Existing generations remain readable.

v0.46 adds no SQLite schema migration or route-query command. It retains additive `scalaFacts` package/class facts and Play route pending references in the existing raw artifact-fact payload, then resolves an exact edge only from unique direct package-class-method proof. The extractor advances to `multi-language-ast-v35` and the resolver to `project-resolver-v15`; a pre-v0.46 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new raw facts and cross-file projection. Existing generations remain readable.

v0.47 adds no SQLite schema migration or route-query command. It persists the previously additive `scalaFacts` payload, adds additive `javaFacts` package/class facts, and records literal Play Router mounts as raw facts projected into `handles` evidence. Direct Play controller actions now accept exactly one matching Scala or Java package/class/method proof. The extractor advances to `multi-language-ast-v36` and the resolver to `project-resolver-v16`; a pre-v0.47 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes all compatible facts. Existing generations remain readable.

v0.48 adds no SQLite schema migration or route-query command. It adds C `.c` discovery, direct C function containment, and direct CivetWeb literal request-handler routes represented as `ALL` through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v37`; the resolver remains `project-resolver-v16` because all accepted CivetWeb proof is file-local. A pre-v0.48 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes C-capable facts. Existing generations remain readable.

v0.49 adds no SQLite schema migration or route-query command. It adds Lua `.lua` discovery, direct top-level Lua function containment, and direct Lapis literal route registrations through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v38`; the resolver remains `project-resolver-v16` because all accepted Lapis proof is file-local. A pre-v0.49 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Lua-capable facts. Existing generations remain readable.

v0.50 adds no SQLite schema migration or route-query command. It adds R `.r` discovery, direct top-level braced R function containment, and direct Plumber literal annotation route registrations through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v39`; the resolver remains `project-resolver-v16` because all accepted Plumber proof is file-local. A pre-v0.50 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes R-capable facts. Existing generations remain readable.

v0.51 adds no SQLite schema migration or route-query command. It adds Elixir `.ex` / `.exs` discovery, direct top-level module and method containment, and direct Phoenix Router literal scope-composed controller-action routes through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v40`; the resolver remains `project-resolver-v16` because all accepted Phoenix proof is file-local. A pre-v0.51 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Elixir-capable facts. Existing generations remain readable.

v0.52 adds no SQLite schema migration or route-query command. It adds Erlang `.erl` discovery, direct `-module` / `-export` / simple function containment, and direct Cowboy literal wildcard-host dispatch routes through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v41`; the resolver remains `project-resolver-v16` because accepted Cowboy proof resolves only a same-module exported `init/2` callback. A pre-v0.52 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Erlang-capable facts. Existing generations remain readable.

v0.53 adds no SQLite schema migration or route-query command. It adds Clojure `.clj` discovery, direct `ns` / simple `defn` containment, and direct Compojure literal verb routes through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v42`; the resolver remains `project-resolver-v16` because accepted Compojure proof resolves only a same-file named `defn` callback. A pre-v0.53 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Clojure-capable facts. Existing generations remain readable.

v0.54 adds no SQLite schema migration or route-query command. It adds Perl `.pl` / `.pm` discovery, direct optional `package` / simple `sub` containment, and direct Dancer2 literal verb routes through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v43`; the resolver remains `project-resolver-v16` because accepted Dancer2 proof resolves only a same-file named `sub` callback. A pre-v0.54 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Perl-capable facts. Existing generations remain readable.

v0.55 adds no SQLite schema migration or route-query command. It adds Julia `.jl` discovery, direct simple one-line function containment, and direct Genie literal named-handler routes through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v44`; the resolver remains `project-resolver-v16` because accepted Genie proof resolves only a same-file one-line function callback. A pre-v0.55 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Julia-capable facts. Existing generations remain readable.

v0.56 adds no SQLite schema migration or route-query command. It adds Haskell `.hs` discovery, direct column-zero zero-argument function containment, and direct Scotty literal named-handler routes through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v45`; the resolver remains `project-resolver-v16` because accepted Scotty proof resolves only a same-file callback. A pre-v0.56 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Haskell-capable facts. Existing generations remain readable.

v0.57 adds no SQLite schema migration or route-query command. It adds OCaml `.ml` discovery, direct top-level one-parameter function containment, and direct Dream literal named-handler routes through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v46`; the resolver remains `project-resolver-v16` because accepted Dream proof resolves only a same-file callback. A pre-v0.57 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes OCaml-capable facts. Existing generations remain readable.

v0.58 adds no SQLite schema migration or route-query command. It adds F# `.fs` discovery, direct top-level typed `HttpFunc` / `HttpContext` function containment, and direct Giraffe `choose` literal named-handler routes through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v47`; the resolver remains `project-resolver-v16` because accepted Giraffe proof resolves only a same-file callback. A pre-v0.58 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes F#-capable facts. Existing generations remain readable.

v0.59 adds no SQLite schema migration or route-query command. It adds Nim `.nim` discovery, direct top-level zero-argument `proc` containment, and direct Jester literal named-proc route blocks through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v48`; the resolver remains `project-resolver-v16` because accepted Jester proof resolves only a same-file callback. A pre-v0.59 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Nim-capable facts. Existing generations remain readable.

v0.60 adds no SQLite schema migration or route-query command. It adds Vue `.vue` discovery, direct audited inline JavaScript/TypeScript script facts, supported direct default-export bindings, and direct Vue Router `createRouter({ routes })` client-navigation facts through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v49`; the resolver advances to `project-resolver-v17` because a unique relative `.vue` target can now participate in exact TypeScript/JavaScript module resolution. A pre-v0.60 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Vue-capable facts. Existing generations remain readable.

v0.61 adds no SQLite schema migration or query command. It adds Svelte `.svelte` discovery, validated SFC default-component/direct instance-script facts, static SvelteKit `src/routes/**/+page.svelte` navigation facts, and a unique relative `.svelte` TypeScript/JavaScript module candidate through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v50`; the resolver advances to `project-resolver-v18`. A pre-v0.61 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Svelte-capable facts. Existing generations remain readable.

v0.62 adds no SQLite schema migration or query command. It adds Astro `.astro` discovery, validated frontmatter conventional-default/direct declaration facts, static Astro `src/pages/**/*.astro` navigation facts, and a unique relative `.astro` TypeScript/JavaScript module candidate through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v51`; the resolver advances to `project-resolver-v19`. A pre-v0.62 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Astro-capable facts. Existing generations remain readable.

v0.63 adds no SQLite schema migration or query command. It adds Razor `.razor` discovery, a conventional local Razor component fact, and standalone unescaped literal Blazor `@page` directive navigation facts through the existing file, symbol, edge, source-search, and route-query contracts. The extractor advances to `multi-language-ast-v52`; the resolver remains `project-resolver-v19` because every accepted route resolves only to a local conventional component. A pre-v0.63 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Razor-capable facts. Existing generations remain readable.

v0.64 adds no SQLite schema migration or query command. It adds ArkTS `.ets` discovery, complete direct `@Component struct` component facts, and direct `@Entry @Component` UI-root entrypoint facts through the existing file, symbol, edge, source-search, and entrypoint-query contracts. The `ui` transport and `root` operation are additive entrypoint filters. The extractor advances to `multi-language-ast-v53`; the resolver remains `project-resolver-v19` because every accepted UI root resolves only to a local component. A pre-v0.64 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes ArkTS-capable facts. Existing generations remain readable.

v0.65 adds no SQLite schema migration or query command. It adds Terraform/OpenTofu `.tf`, `.tfvars`, and `.tofu` discovery plus complete top-level literal `resource`, `data`, `module`, `variable`, and `output` declaration facts through the existing file, symbol, edge, binding, and source-search contracts. The additive `resource` and `module` symbol kinds keep existing generations readable. The extractor advances to `multi-language-ast-v54`; the resolver remains `project-resolver-v19` because v0.65 does not resolve HCL module sources, providers, or dependency expressions. A pre-v0.65 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Terraform-capable facts.

v0.66 adds no SQLite schema migration or query command. It adds Shopify Liquid `.liquid` discovery and direct literal `render` / `include` / `section` raw facts through the existing file, edge, source-search, caller/callee, and raw-artifact contracts. The extractor advances to `multi-language-ast-v55` and the resolver to `project-resolver-v20` because a Liquid tag is projected only after its exact local target file is known. A pre-v0.66 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Liquid-capable facts and relations. Existing generations remain readable.

v0.67 adds no SQLite schema migration or query command. It adds Solidity `.sol` discovery, complete top-level container and direct-member facts, and only same-file uniquely proven `extends` / `implements` edges through the existing file, symbol, hierarchy, source-search, and raw-artifact contracts. The extractor advances to `multi-language-ast-v56` and the resolver to `project-resolver-v21` because a Solidity `is` clause is interpreted only after the complete source file has supplied its declaration symbols. A pre-v0.67 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Solidity-capable facts and hierarchy evidence. Existing generations remain readable.

v0.68 adds no SQLite schema migration or query command. It adds CFML / CFScript `.cfc`, `.cfm`, and `.cfs` discovery plus complete braced, tag-based, and conventional implicit-CFC declaration facts through the existing file, symbol, containment-edge, source-search, and raw-artifact contracts. The extractor advances to `multi-language-ast-v57`; the resolver remains `project-resolver-v21` because v0.68 does not resolve CFML imports, includes, calls, or cross-file relationships. A pre-v0.68 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes CFML-capable facts. Existing generations remain readable.

## Architecture

```mermaid
flowchart LR
  CLI["CLI: explicit init/index/sync/watch\nread-only hierarchy/routes/entrypoints/node/history/diff/git-hunks"] --> App["Application service"]
  Native["Native filesystem events\nfiltered + recursive"] --> Watch["Foreground watch\ndebounce + polling fallback"]
  Timer["Bounded polling safety sweep"] --> Watch
  Watch --> App
  MCP["Read-only MCP"] --> App
  Git["Local immutable Git blobs\nmerge-base to HEAD"] --> GitHunks["Zero-context hunks + revision-local declarations\nno active SQLite graph"] --> App
  Catalog["Filesystem catalog\nscope + gitignore"] --> Inputs["Index inputs"]
  Catalog --> TS["TS alias resolver"]
  Catalog --> WS["Workspace resolver"]
  Extractor["TypeScript AST extractor + ArkTS/ArkUI lexical scanner + Vue/Svelte/Astro SFC scanners + Razor/Blazor directive scanner + Terraform/OpenTofu HCL lexical scanner + Shopify Liquid tag scanner + Solidity and CFML/CFScript declaration scanners + Python/Go/Rust/Java/PHP/C/C++ Lezer parsers + Lua/R/Elixir/Erlang/Clojure/Perl/Julia/Haskell lexical extractors + C#/Ruby/Kotlin/Swift/Dart/Scala ast-grep parsers\nfirst-party framework capability passes\nExpress/Fastify/Nest HTTP routes + Fastify plugin facts + FastAPI/Flask/Gin/net-http/Chi/Axum/Spring Web/Laravel/CivetWeb/Lapis/Plumber/Phoenix/Cowboy/Compojure/Dancer2/Genie/Scotty/cpp-httplib/ASP.NET Core/Rails/Ktor/Vapor/Flutter/Play facts\nFlutter/Vue Router/SvelteKit/Astro/Blazor/React Router/Next client navigation\nNest module-prefix facts + non-HTTP and ArkUI UI-root entrypoints + Terraform/OpenTofu IaC declaration facts + Shopify Liquid local template calls + Solidity hierarchy + CFML/CFScript declaration facts"] --> Facts["Reusable artifact facts"]
  Catalog --> SourceDocs["Persisted source documents"]
  SourceDocs --> Retrieval["Generation-bound lexical projection"]
  Facts --> Resolver["Full project export surface"]
  TS --> Resolver
  WS --> Resolver
  Inputs --> SQLite["Atomic SQLite generation"]
  Resolver --> SQLite
  Retrieval --> SQLite
  SQLite --> Retained["Immutable retained graph snapshots\nmaximum 5"]
  App --> SQLite
```

```text
src/
  application/     Use cases, incremental planning, and graph projection
  cli/             Commander-based CLI
  domain/          Graph, evidence, identity, and index-work contracts
  extraction/      TypeScript AST, ArkTS/ArkUI lexical, Vue/Svelte/Astro SFC, Razor/Blazor directive, Terraform/OpenTofu HCL lexical, Shopify Liquid tag lexical, Solidity declaration lexical, CFML/CFScript declaration lexical, Python/Go/Rust/Java/PHP/C/C++ Lezer, Lua/R/Elixir/Erlang/Clojure/Perl/Julia/Haskell lexical, and C#/Ruby/Kotlin/Swift/Dart/Scala ast-grep fact extraction
  infrastructure/  Filesystem, workspace, TypeScript, and SQLite adapters
  mcp/             Read-only MCP server
  ports/           Dependency boundaries
```

## Deliberate boundaries

v0.68.0 does not yet provide:

- Daemon mode, background automatic sync after the foreground process exits, cross-process watch coordination, MCP per-query pending-file banners, worker pools, or historical source browsing.
- pnpm workspace YAML, TypeScript project references, external/package `extends`, or nested `.gitignore` semantics.
- CommonJS `require`, dynamic dispatch, reflection, arbitrary framework routes, or namespace property-call resolution. The Express and Fastify packs remain limited to syntax-proven direct static registrations; Fastify now projects direct imported/re-exported plugin callbacks and nested direct identifier registrations, but it does not model mutable/assignment aliases, namespace/member access, `fastify-plugin` wrappers, dynamic prefixes, prefixed-plugin root-route variants, hooks, inline route handlers, or runtime route composition. The React Router pack accepts only direct literal JSX `Route` trees with direct child routes/fragments, direct one-argument `createRoutesFromElements(...)` literal JSX trees, or direct one-argument data-router literal trees with direct page identifiers; it does not model `basename`, `lazy`, array variables/spreads, v5 nested `component` trees, dynamic children, JSX conditionals/arbitrary wrapper descendants, absolute child paths, dynamic/optional/multiple-argument factory calls, or runtime router configuration. The Next.js pack accepts only convention-derived Pages/App page files with one direct named default export; it excludes API and App Route handlers, wrappers, parallel/intercepting routes, layouts, middleware, and runtime configuration.
- The Python/FastAPI surface proves one narrow cross-file router form: direct import aliases, direct `APIRouter` construction, literal router/include prefixes, same-file composition, and a one-dot regular-package direct router import are supported. Flask supports direct app and same-file Blueprint registrations with literal methods/prefixes. Neither pack resolves generic Python imports/exports/calls, parent-relative or namespace-package FastAPI imports, cross-file Flask Blueprints, member routers, import/re-export chains, nested routers, assignment aliases, dependencies or middleware as graph relationships, factory composition, star/keyword expansion, possible rebindings, dynamic/escaped paths or prefixes, or routers declared after inclusion. Syntax-error Python files retain only their file symbol until repaired.
- The Go surface proves top-level functions, direct same-function `:= gin.Default()` / `gin.New()` receivers, literal one-handler Gin registrations with literal non-root/non-trailing `RouterGroup` prefixes, direct `http.HandleFunc`, same-function `mux := http.NewServeMux()` / `mux.HandleFunc` registrations, and direct `chi.NewRouter()` / `chi.NewMux()` receiver methods. It excludes `var` bindings, `Handle` / `Match`, static helpers, inline/multiple/middleware or wrapped handlers, path escaping/dynamic values, root/trailing/double-slash Gin group prefixes, Chi `Route` / `Group` / `Mount` composition, factory/wrapper/chained/mutable receiver flow, `DefaultServeMux` member calls, host/wildcard pattern semantics, cross-file module/package resolution, methods, generic Go imports/calls/types, and runtime framework behavior. Syntax-error Go files retain only their file symbol until repaired.
- The Rust surface proves top-level functions and direct Axum `Router::new().route("/path", method(handler))` chains only when the `Router` and method helpers have direct unambiguous `axum` imports. It excludes `route_service`, `nest`, `merge`, state/layer/wrapper chains, generic constructors, `MethodRouter` composition, inline/wrapped/namespaced handlers, dynamic/escaped paths, wildcard or public re-exports, cross-file Cargo/module resolution, methods, semantic type checking, and runtime behavior. Syntax-error Rust files retain only their file symbol until repaired.
- The Java surface proves direct top-level classes/methods and Spring Web routes only when direct non-static/non-wildcard imports (or fully-qualified annotations), one direct `@RestController` / `@Controller`, an optional literal class `@RequestMapping`, one literal shortcut method mapping, and its direct local method body are all present. It excludes method-level `@RequestMapping(method = ...)`, multi-path arrays, custom/composed annotations, placeholders/SpEL, additional conditions, nested/inherited/interface handlers, Java package/classpath resolution, generic Java import/call/type analysis, semantic Spring configuration, and runtime behavior. Syntax-error Java files retain only their file symbol until repaired.
- The PHP surface proves direct top-level classes/methods/functions and literal Laravel facade controller-action routes only after one direct facade import/alias or fully-qualified facade proof. It resolves only an unqualified same-file controller method; imported or cross-file controllers stay explicitly unresolved. It excludes `match`, group/prefix/resource composition, closures and other handler forms, generic PHP import/package/call/type resolution, dynamic/escaped/interpolated paths or actions, middleware/configuration semantics, and runtime behavior. Syntax-error PHP files retain only their file symbol until repaired.
- The C surface proves only direct top-level function containment and direct CivetWeb `mg_set_request_handler(context, "/literal", handler, cbdata)` registrations after direct `civetweb.h` inclusion. It represents the registration as `ALL` because CivetWeb chooses no method there. It excludes preprocessing/macro/header graph resolution, C type checking, function-pointer or cross-file handler resolution, wrappers/aliases, nested control flow, dynamic/raw/escaped URIs, non-identifier context/handler expressions, duplicate or potentially shadowed handlers, auth/WebSocket callbacks, per-method request inspection, and runtime behavior. Syntax-error C files retain only their file symbol until repaired.
- The Lua surface is a direct lexical/block-balancing subset, not a full Lua grammar. It proves only top-level `function` / `local function` containment and Lapis routes after parenthesized `require("lapis")`, a direct local `Application()` binding, a top-level literal `get` / `post` / `put` / `delete` / `match` call, and one unique prior un-rebound local function handler. It excludes MoonScript, long/dynamic/raw/escaped route strings, `require "lapis"`, `Application:extend`, `include`, `respond_to`, table/inline/global/imported/cross-file handlers, aliases/wrappers, route groups/prefixes, nested control flow, generic Lua import/call/type/module analysis, action-body method dispatch, and runtime behavior. Unbalanced block/parenthesis or unterminated string/comment input retains only its file symbol until repaired.
- The R surface is a direct lexical/delimiter-balancing subset, not a full R parser. It proves only direct top-level braced `name <- function(...) { ... }` / `name = function(...) { ... }` containment and Plumber routes after a standalone top-level `#*` / `#'` annotation with one literal slash-prefixed `@get` / `@post` / `@put` / `@delete` method and an immediately following top-level braced anonymous `function(...) { ... }` handler. It excludes `@head`, `@patch`, programmatic `pr_*` / `Plumber$handle` registration, filters, mounts, route groups, OpenAPI annotations, named/inline/nested handlers, generic R packages/imports/calls/types, dynamic/raw/escaped paths, aliases/wrappers, and runtime behavior. Unbalanced delimiters or unterminated quoted/backtick input retains only its file symbol until repaired.
- The Elixir surface is a direct lexical/block-balancing subset, not a full Elixir parser. It proves only direct top-level `defmodule` containment, direct module `def` / `defp` blocks, and Phoenix routes after a direct module-level `use Phoenix.Router` (optionally `helpers: false`), literal nested `scope` prefixes, a literal direct HTTP-verb call, a full controller module, and an atom action. It resolves only one same-file direct module method; every other accepted controller action stays explicitly unresolved. It excludes customary `use MyAppWeb, :router` macro expansion, aliases/imports, `resources`, `match`, `forward`, pipelines, router/controller factories, macro-generated routes, cross-file/controller-module resolution, `def name, do:` functions, nested modules, generic Elixir imports/calls/types, dynamic/escaped paths, and runtime behavior. Unbalanced `do` / `end`, unterminated quoted/charlist/heredoc input, or unsupported structural forms retain only the file symbol until repaired.
- The Erlang surface is a direct lexical/delimiter-balancing subset, not a full Erlang parser. It proves only direct `-module`, `-export`, simple top-level `name(variables...) -> ... .` functions, and one direct `cowboy_router:compile([{'_', [{"/literal", handler_module, InitialState}]}])` wildcard-host dispatch shape. It resolves only a unique same-module exported `init/2`; every other accepted handler stays explicitly unresolved. It excludes multiple or specific hosts, host/path constraints, binary/dynamic/escaped paths, quoted or macro-generated handlers, dispatch variables, aliases, nested calls, `-behaviour` semantics, guards, pattern matching, records, OTP/includes/parse transforms, generic Erlang calls/types/module resolution, cross-file callbacks, and runtime behavior. Unbalanced delimiters or unterminated quoted input retain only the file symbol until repaired.
- The Clojure surface is a direct lexical/delimiter-balancing subset, not a full Clojure reader or parser. It proves only exactly one direct `ns`, simple top-level `defn` declarations with one vector parameter form, a direct `ns` `:require` containing exactly one `[compojure.core :refer :all]` or explicit `[compojure.core :refer [defroutes verb ...]]` proof, a top-level `defroutes`, and immediate four-item literal `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS` forms with simple named handlers. Exactly one same-file `defn` target is exact; every other accepted handler stays explicitly unresolved. It excludes aliases/namespaced macro calls, `:use` or dynamic dependency forms, multiple Compojure-core bindings, docstring/metadata/private/multi-arity `defn` forms, `context` / `routes` / `ANY`, middleware, inline or qualified handlers, dynamic/escaped paths, generic Clojure namespace/call/type/module resolution, cross-file callbacks, and runtime behavior. Unbalanced delimiters or unterminated quoted input retain only the file symbol until repaired.
- The Perl surface is a direct lexical/delimiter-balancing subset, not a full Perl parser. It proves only at most one direct `package`, simple top-level `sub name { ... }`, exactly one direct `use Dancer2;`, and a direct top-level literal `get` / `post` / `put` / `patch` / `del` / `options` route with exactly `\&name`. A unique same-file sub is exact; every other accepted handler is unresolved. It excludes Dancer2 import lists, aliases, multiple direct uses, `any`, named routes, prefixes/hooks/plugins, inline or qualified/wrapped handlers, dynamic/escaped paths, prototypes/attributes/nested subs, Perl regex/heredoc/POD semantics, generic package/module/call/type resolution, cross-file callbacks, and runtime behavior. Unbalanced delimiters or unterminated quoted input retain only the file symbol until repaired.
- The Julia surface is a direct lexical/delimiter/block-balancing subset, not a full Julia parser. It proves only exactly one direct top-level `using Genie` proof (a comma-qualified import list may follow), simple top-level one-line ASCII `name(...) = ...` functions, and direct statement-start literal `route("/path", name)` calls with either default `GET` or exactly one literal `method = GET/POST/PUT/PATCH/DELETE/OPTIONS` keyword. A unique same-file one-line function is exact; every other accepted handler is unresolved. It excludes `import Genie`, repeated use proof, block/multiline functions, modules, blocks and `do ... end` handlers, named routes, qualified method constants, dynamic/escaped paths, and qualified/wrapped/inline handlers; it does not model macro expansion, Julia string interpolation/triple strings/chars/adjoints/nested block-comment semantics, generic Julia module/type/call resolution, cross-file callbacks, or runtime behavior. Unbalanced delimiters, block depth, or unterminated quoted/comment input retain only the file symbol until repaired.
- The Haskell surface is a direct lexical/layout-aware subset, not a full Haskell parser. It proves only exactly one column-zero `import Web.Scotty`, a column-zero `name = scotty <decimal-port> $ do` header, direct baseline-indented literal `get`/`post`/`put`/`delete`/`patch`/`options` named-handler routes, and simple column-zero zero-argument `name = ...` functions. A unique same-file function is exact; every other accepted handler is unresolved. It excludes qualified/selective/repeated imports, `scottyT`, dynamic ports or paths, `addroute`/`matchAny`, inline handlers, nested route statements, local `let`/`where` callbacks, tab layout, generic Haskell module/type/call/package resolution, cross-file callbacks, and runtime behavior. Unbalanced delimiters, unterminated quoted/comment input, or tabs retain only the file symbol until repaired.
- The C++ surface proves direct top-level classes/methods/functions and cpp-httplib routes only after a direct `httplib.h` include, one direct `httplib::Server` / `httplib::SSLServer` local binding, a literal path, and a unique direct named local function handler. It excludes `using namespace`, aliases/wrappers/factories/nested scopes, lambda/member/callback handlers, dynamic/raw/escaped paths, generic include/namespace/template/overload/cross-file resolution, middleware hooks, and runtime behavior. Syntax-error C++ files retain only their file symbol until repaired.
- The C# surface proves direct top-level classes/interfaces/methods/local functions plus ASP.NET Core routes only after direct `WebApplication` builder/application bindings with literal `MapGet` / `MapPost` / `MapPut` / `MapPatch` / `MapDelete` calls and a unique named local-function handler, or direct MVC import/fully-qualified `ApiController`, literal `Route`, and one literal `Http*` method attribute on its exact local method. It excludes `MapMethods`, `MapGroup`, filters/middleware, lambdas/delegates/member/cross-file handlers, controller tokens/aliases, nested/inherited/interface controllers, ASP.NET configuration/DI semantics, generic C# import/call/type resolution, and runtime behavior. Syntax-error C# files retain only their file symbol until repaired.
- The Ruby surface proves direct top-level classes/methods/functions and Rails routes only inside a direct `Rails.application.routes.draw` block with one supported direct verb, one literal slash-prefixed path, and exactly one literal `to: "controller#action"` pair. It resolves only a non-namespaced same-file controller class and method; all other valid controller-action references remain explicitly unresolved. It excludes `resources` / `resource`, `namespace` / `scope`, constraints, dynamic strings, block/lambda handlers, controller aliases, generic Ruby module/call/type resolution, cross-file controller resolution, and runtime Rails behavior. Syntax-error Ruby files retain only their file symbol until repaired.
- The Kotlin surface proves direct top-level classes/interfaces/methods/functions and Ktor routes only after direct unaliased imports of `io.ktor.server.application.Application`, `io.ktor.server.routing.routing`, and the used HTTP verb; a direct `fun Application.module()` body; a direct `routing` block; a literal path; and one unique direct top-level `::handler` reference. It excludes wildcard/aliased imports, alternate module/receiver names, route groups/plugins/pipeline composition, lambda/member/qualified/overloaded/cross-file handlers, dynamic strings, generic Kotlin import/package/call/type resolution, and runtime Ktor behavior. Syntax-error Kotlin files retain only their file symbol until repaired.
- The Swift surface proves direct top-level classes/structs/protocols/methods/functions and Vapor routes only after a direct `import Vapor`, a direct `routes(_ app: Application)` function, direct `app` verb calls, zero or more literal path segments, and one unique direct same-file `use: handler` function. It excludes groups/prefixes/middleware, closure/member/qualified/overloaded/cross-file handlers, dynamic/escaped/interpolated strings, generic Swift package/import/call/type resolution, Fluent/controller semantics, and runtime Vapor behavior. Syntax-error Swift files retain only their file symbol until repaired.
- The Dart surface proves direct top-level classes/methods/functions and Flutter navigation only after a direct `package:flutter/material.dart` import, one direct `MaterialApp` literal `routes` map, a slash-prefixed literal key, a one-parameter arrow builder that calls a no-argument class constructor, and exactly one same-file class target. It excludes `MaterialApp.router`, `CupertinoApp`, `home` / `onGenerateRoute` / `Navigator` calls, aliases, typed/dynamic or spread maps, dynamic/escaped/interpolated paths, closures, constructor arguments, non-class/cross-file targets, generic Dart import/package/call/type resolution, and runtime Flutter behavior. Syntax-error Dart files retain only their file symbol until repaired.
- The Scala surface proves direct top-level classes, objects, traits, methods, and functions through the Scala AST. The Play surface proves an `exact` handler only for literal `conf/routes` / `conf/*.routes` entries whose fully static controller action has one direct matching Scala-or-Java package declaration, class/object, and body method; every other accepted entry remains `unresolved`. It also preserves a literal static fully-qualified `->` Router mount as a `handles` edge, not a concrete endpoint. It excludes dynamic/wildcard prefixes, Router-interface type checking, recursive mounted-router endpoint expansion, `build.sbt` detection, imported/classpath controller resolution, overload resolution, custom binders, reverse routing, Scala 3 contextual declarations, generic Scala/Java call/type analysis, and runtime Play behavior. Syntax-error Scala files retain only their file symbol until repaired.
- The Vue surface is a deliberately small SFC scanner, not the Vue compiler. It accepts one inline JavaScript/TypeScript `<script>` block and only direct top-level declarations plus one of three auditable default-export forms: an object literal, a direct unaliased `defineComponent(...)` call, or a direct named variable initialized from that call. It excludes multiple/`src`/non-JS scripts, `script setup` implicit compiler exports, templates/styles/custom blocks, macro expansion, composables, TypeScript component inference, aliases/rebindings, generic Vue import/export/call/type analysis, and runtime behavior. Vue Router accepts only an exact-one direct `createRouter` import, one direct top-level literal routes option/array, slash-prefixed literal paths, and named component identifiers; it excludes aliases, repeated/rebound imports, nested/child records, spreads, lazy/inline components, dynamic paths, router factories, history/middleware configuration, and runtime navigation.
- The Svelte surface is a deliberately small SFC scanner, not the Svelte compiler. It emits a conventional `default` component for a validated file and direct instance-script functions, classes, interfaces, type aliases, and identifier variables. It accepts no script, or at most one inline JavaScript/TypeScript instance script and one inline JavaScript/TypeScript module script; module declarations are syntax-validated but not indexed. SvelteKit navigation accepts only literal directories under `src/routes` ending in `+page.svelte` and links the route to that local conventional default component. It excludes `src`, non-JS/TS, duplicate or malformed scripts, template/styles/runes/macros, compiler-generated exports, props semantics, dynamic/optional/rest bracket paths, route groups, layouts/endpoints/actions/hooks, generic Svelte module/call/type analysis, and runtime behavior.
- The Astro surface is a deliberately small SFC scanner, not the Astro compiler. It emits a conventional `default` component for a file with no frontmatter or one valid opening frontmatter fence, and direct frontmatter functions, classes, interfaces, type aliases, and identifier variables. Astro page navigation accepts only literal segments under `src/pages` ending in `.astro`; `index.astro` maps to the containing route. It excludes malformed starting fences or TypeScript frontmatter, frontmatter imports/re-exports, template/client-script/style/directive/island semantics, `Astro` global/props semantics, endpoints, Markdown/MDX/HTML pages, bracket/dynamic paths, leading-underscore segments, route configuration, generic Astro module/call/type analysis, and runtime behavior.
- The Razor/Blazor surface is a deliberately small directive scanner, not the Razor compiler or a C# parser. Every `.razor` file emits a conventional local `default` component. It accepts only standalone, unescaped, slash-prefixed string-literal `@page` directives and links each accepted route exactly to that local component. It excludes `@attribute` routes, computed/escaped/query/fragment values, Razor comments, `.cshtml`, C# `@code`/`@functions`, component tags, `@inject`/`@model`/`@inherits` semantics, layouts, render modes, generic Razor namespace/project/package resolution, and runtime behavior.
- The ArkTS/ArkUI surface is a deliberately small lexical scanner, not an ArkTS compiler or TypeScript fallback. It accepts only a complete adjacent direct `@Component struct` declaration, and emits a `ui root` entrypoint only when that same decorator stack also contains `@Entry`. It excludes general ArkTS declarations, `build()` DSL calls, child components, `@Builder`/`@Extend`/`@Styles`, state/lifecycle semantics, navigation, modules/packages, and runtime UI behavior.
- The Terraform/OpenTofu surface is a deliberately small lexical block scanner, not an HCL parser, compiler, or deployment planner. It accepts only complete line-leading top-level literal `resource`, `data`, `module`, `variable`, and `output` blocks, while masking comments, strings, and heredocs. It excludes `terraform`/`provider`/`locals`, dynamic labels, JSON configuration, expression/interpolation/reference analysis, `depends_on`, provider aliases, module source resolution, state, plan/apply, and runtime cloud topology.
- The Shopify Liquid surface is a deliberately small lexical tag scanner, not a Liquid parser, Shopify theme compiler, or renderer. It accepts only complete literal `render`/`include`/`section` tags with safe path segments and then only exact indexed local `snippets`/`sections` file targets. It excludes tags in HTML comments or Liquid `comment`/`raw` blocks, dynamic/unsafe/incomplete/nested tags, `assign`/capture/loop/condition/filter semantics, layouts/schema/JSON templates/app blocks, objects/metafields/locales, remote snippets/theme inheritance, and runtime storefront behavior.
- The Solidity surface is a deliberately small lexical declaration scanner, not a Solidity parser, compiler, EVM analyzer, or deployment simulator. It accepts only complete ASCII-named top-level `contract`/`interface`/`library` declarations, direct callable members, and a simple same-file `is Base, Other` clause with a unique compatible declaration target. It excludes imports/cross-file resolution, constructor arguments, events/errors/structs/enums/types/state, calls/emits/reverts/modifier application, assembly/Yul, visibility/override semantics, ABI/bytecode/storage/proxy behavior, compilation, and runtime chain behavior.
- The CFML / CFScript surface is a deliberately small lexical declaration scanner, not a CFML parser, Adobe ColdFusion/Lucee runtime, template renderer, CFQuery analyzer, or framework analyzer. It accepts only complete braced `component`/`interface` declarations, complete tag-based `<cfcomponent>`/`<cfinterface>` and named `<cffunction>` pairs, conventional CFC components, and complete direct named functions. It excludes `cfinclude`/`import`, inheritance, accessors/annotations, dynamic names, closures/nested functions, tag-based `<cfscript>` bodies, CFQuery, calls, framework conventions, compilation, and runtime behavior.
- Semantic type checking, transitive hierarchy traversal, declaration-merging semantics, override dispatch, mixin/qualified/conditional heritage expressions, or automatic framework decorator inference. v0.18 recognizes direct imported NestJS HTTP decorators, direct static `RouterModule.register()` prefixes, and the narrowly defined non-HTTP decorators documented above; it does not infer custom decorators, barrels, `forRoot` / `forChild`, global/version prefixes, guards, GraphQL field resolvers, dynamic patterns, dynamic gateway configuration, or runtime transport wiring.
- Language adapters beyond TS/TSX/JS/JSX/ArkTS/Vue/Svelte/Astro/Razor/Terraform/OpenTofu/Shopify-Liquid/Solidity/CFML-CFScript/Python/Go/Rust/Java/PHP/C/Lua/R/Elixir/Erlang/Clojure/Perl/Julia/Haskell/OCaml/F#/C++/C#/Ruby/Kotlin/Swift/Dart/Scala, external dependency indexing, telemetry, or multi-project routing.
- Embedding-based or cloud retrieval, semantic ranking, arbitrary natural-language context assembly, semantic Git diff beyond immutable zero-context hunk-to-revision-local-declaration evidence, or reliable rename/move/cross-side identity attribution.

## Roadmap

| Milestone | Focus |
| --- | --- |
| `v0.3.0` | Workspace packages, AST re-exports, dependency-aware incremental parsing, and schema v4 telemetry |
| `v0.4.0` | Generation-bound FTS5 source retrieval, source/symbol evidence, CLI search, and structured read-only MCP retrieval |
| `v0.4.1` | Generation-bound exact exploration source, explicit source availability, and adapter-safe source-document reads |
| `v0.5.0` | Bounded multi-symbol context, exact static evidence paths, capped relationship/impact context, and explicit `impact --limit` |
| `v0.6.0` | Changed-file affected-test evidence with exact import/export proofs, bounded traversal, explicit index coverage, and read-only MCP support |
| `v0.7.0` | Local Git-aware changed-file selection for working trees or local merge bases, immutable change-set provenance, and read-only MCP support |
| `v0.8.0` | Opt-in foreground freshness watch, compact NDJSON lifecycle receipts, bounded retry/backoff, and atomic incremental synchronization without MCP mutation |
| `v0.9.0` | Native-event-accelerated foreground watch with debounce, hard-excluded event filtering, polling fallback, atomic sync reuse, and no MCP mutation |
| `v0.10.0` | Bounded foreground pending-file disclosure for native event batches, honest unknown/overflow semantics, and clear-after-success lifecycle evidence |
| `v0.11.0` | Bounded retained immutable graph generations, read-only CLI/MCP history and structural diff, explicit active freshness, and v4-compatible storage migration |
| `v0.12.0` | Bounded immutable local Git hunk attribution with zero-context hunks, revision-local declaration anchors, and read-only CLI/MCP support without an active graph |
| `v0.13.0` | Exact persisted node inspection with bounded full declaration ranges, direct callers/callees, explicit source provenance, and additive read-only CLI/MCP support |
| `v0.14.0` | First AST-proven Express framework pack: literal static route nodes/handler edges, route-aware graph traversal, and bounded read-only CLI/MCP listing |
| `v0.15.0` | Direct AST-proven TypeScript/JavaScript `extends` / `implements` graph with value/type namespace proof, unresolved heritage evidence, and bounded read-only CLI/MCP hierarchy views |
| `v0.16.0` | AST-proven NestJS HTTP controller decorators with direct method edges, imported-alias proof, and shared read-only route views |
| `v0.17.0` | AST-proven `RouterModule.register()` module prefixes, recursive static children, exact module/controller bindings, and complete Nest HTTP route projections |
| `v0.18.0` | AST-proven NestJS GraphQL operations, microservice message/event patterns, and WebSocket subscriptions as separate `entrypoint` / `handles` evidence, with bounded read-only CLI and MCP listing |
| `v0.19.0` | AST-proven Fastify shorthand and full-object route registrations, Fastify-specific handler evidence, and `TRACE` route filtering through the existing read-only route views |
| `v0.20.0` | AST-proven direct inline Fastify plugin-prefix composition, nested static prefixes, prefix-aware handler evidence, and unchanged read-only route views |
| `v0.21.0` | AST-proven same-file named Fastify plugin-prefix composition, nested local/inline prefixes, distinct local-plugin handler evidence, and unchanged read-only route views |
| `v0.22.0` | AST-proven imported/re-exported Fastify plugin-prefix composition, nested cross-file plugin facts, cycle-safe projection, distinct imported-plugin handler evidence, and unchanged read-only route views |
| `v0.23.0` | AST-proven React Router JSX `Route` extraction, explicit `NAVIGATE` client-navigation records, exact page-component evidence, and existing read-only route views across CLI, MCP, callers, impact, and context |
| `v0.24.0` | AST-proven React Router `createBrowserRouter` / `createHashRouter` / `createMemoryRouter` direct object arrays, data-router-specific handler evidence, and existing read-only navigation route views |
| `v0.25.0` | Executable first-party framework capability registry plus AST/syntax-proven Next.js Pages Router and App Router page-navigation evidence, exact handler resolution, deliberate convention boundaries, and unchanged read-only route views |
| `v0.26.0` | AST-proven recursive React Router literal data-router trees: relative children, index routes, pathless-layout traversal, exact handler evidence, unsafe-shape rejection, and unchanged read-only navigation route views |
| `v0.27.0` | AST-proven recursive React Router literal JSX `Route` trees: direct child routes/fragments, relative children, index routes, pathless-layout traversal, exact handler evidence, v5 standalone compatibility, unsafe-shape rejection, and unchanged read-only navigation route views |
| `v0.28.0` | AST-proven direct React Router `createRoutesFromElements(...)` JSX trees: import/call/tree proof, factory-specific provenance and evidence, nested relative/index/pathless composition, unsafe-shape rejection, and unchanged read-only navigation route views |
| `v0.29.0` | Python `.py` discovery through a Lezer AST adapter, conservative file/class/function/method containment, and direct same-file FastAPI decorator route evidence with exact local handlers |
| `v0.30.0` | AST-proven same-file FastAPI `APIRouter` decorators projected through direct literal `include_router(...)` prefixes, including direct import aliases, static prefix composition, exact local handlers, and rejection of dynamic/rebound/late shapes |
| `v0.31.0` | Python cross-file one-dot regular-package direct router facts and exact literal `include_router` projection, with source/target package-boundary proof and auditable module evidence |
| `v0.32.0` | Flask direct application shortcut / `route` decorators and same-file Blueprint prefix composition, with exact local handlers and dynamic/rebound rejection |
| `v0.33.0` | Go `.go` discovery, conservative top-level function containment, direct Gin engine methods, and nested same-function literal `RouterGroup` prefix composition with exact local handlers |
| `v0.34.0` | Go standard-library `http.HandleFunc` and same-function literal `ServeMux.HandleFunc` routes, including an exact Go 1.22 method-pattern subset and dynamic/rebound rejection |
| `v0.35.0` | Go Chi `NewRouter` / `NewMux` direct literal route methods, `CONNECT` route-query support, and continued dynamic/shadow/rebinding rejection |
| `v0.36.0` | Rust `.rs` discovery, top-level function containment, exact direct Axum `Router::new().route(...)` method-router chains, Rust source-search/CLI/MCP filters, and dynamic/shadow/wrapper rejection |
| `v0.37.0` | Java `.java` discovery, direct class/method containment, exact direct Spring Web controller shortcut mappings, Java source-search/CLI/MCP filters, and literal/import/syntax-error rejection |
| `v0.38.0` | PHP `.php` discovery, direct PHP declaration containment, AST-proven direct Laravel facade controller-action routes, exact same-file method evidence, explicit cross-file unresolved evidence, and PHP source-search/CLI/MCP filters |
| `v0.39.0` | C++ source/header discovery, direct C++ declaration containment, AST-proven cpp-httplib direct named-handler routes, C++ source-search/CLI/MCP filters, direct receiver-rebinding invalidation, and dynamic/lambda/syntax-error rejection |
| `v0.40.0` | C# `.cs` discovery, class/interface/method/local-function containment, AST-proven ASP.NET Core Minimal API and MVC controller routes, C# source-search/CLI/MCP filters, direct receiver-rebinding invalidation, and dynamic/lambda/syntax-error rejection |
| `v0.41.0` | Ruby `.rb` discovery, direct Ruby declaration containment, AST-proven direct Rails `routes.draw` controller-action routes, exact same-file method evidence, explicit cross-file unresolved evidence, shared C#/Ruby ast-grep registry, and Ruby source-search/CLI/MCP filters |
| `v0.42.0` | Kotlin `.kt` discovery, class/interface/method/function containment, AST-proven Ktor direct `Application.module` / `routing` callable-reference routes, Kotlin source-search/CLI/MCP filters, shared C#/Ruby/Kotlin ast-grep registry, and dynamic/lambda/import/syntax-error rejection |
| `v0.43.0` | Swift `.swift` discovery, class/struct/protocol/method/function containment, AST-proven direct Vapor `routes(_ app: Application)` literal-segment routes, Swift source-search/CLI/MCP filters, shared C#/Ruby/Kotlin/Swift ast-grep registry, and dynamic/closure/import/syntax-error rejection |
| `v0.44.0` | Dart `.dart` discovery, class/method/function containment, AST-proven Flutter `MaterialApp(routes: {...})` named navigation, Dart source-search/CLI/MCP filters, shared C#/Ruby/Kotlin/Swift/Dart ast-grep registry, and dynamic/closure/import/syntax-error rejection |
| `v0.45.0` | Scala `.scala` discovery, class/object/trait/method/function containment, static Play `conf/routes` and `conf/*.routes` controller-action route facts, Scala source-search/CLI/MCP filters, shared C#/Ruby/Kotlin/Swift/Dart/Scala ast-grep registry, and explicit unresolved handler evidence |
| `v0.46.0` | Scala Play full controller-action pending facts plus exact unique direct package-class-method cross-file resolution, evidence candidates, and fail-closed missing/ambiguous proof behavior |
| `v0.47.0` | Persisted Scala package/class raw facts, Java package/class raw facts for exact Play handler resolution, Java-or-Scala unique package-class-method proof, and literal static Play `->` Router mounts as exact/unresolved `handles` evidence without fabricated endpoints |
| `v0.48.0` | C `.c` discovery and function containment, direct CivetWeb literal request-handler `ALL` routes, C source-search/CLI/MCP filters, unique unshadowed handler proof, and dynamic/missing-header/syntax-error rejection |
| `v0.49.0` | Lua `.lua` discovery and direct function containment, lexical Lapis `Application()` literal get/post/put/delete/match routes, Lua source-search/CLI/MCP filters, unique prior un-rebound local-handler proof, and dynamic/inline/late/unbalanced-source rejection |
| `v0.50.0` | R `.r` discovery and direct braced-function containment, lexical Plumber `#*` / `#'` literal get/post/put/delete annotation routes, R source-search/CLI/MCP filters, exact anonymous-handler evidence, and dynamic/non-immediate/named/nested/unbalanced-source rejection |
| `v0.51.0` | Elixir `.ex` / `.exs` discovery, direct module/method containment, lexical Phoenix Router literal scope composition and full-module controller-action routes, Elixir source-search/CLI/MCP filters, exact same-file method evidence, explicit unresolved controller evidence, and dynamic/macro/cross-file/unbalanced-source rejection |
| `v0.52.0` | Erlang `.erl` discovery, direct module/export/simple-function containment, lexical Cowboy literal wildcard-host dispatch routes, Erlang source-search/CLI/MCP filters, exact same-module exported `init/2` evidence, explicit unresolved handler evidence, and dynamic/constraint/binary/indirect/unbalanced-source rejection |
| `v0.53.0` | Clojure `.clj` discovery, direct `ns`/simple `defn` containment, lexical Compojure direct `:refer` proof plus `defroutes` literal verb routes, Clojure source-search/CLI/MCP filters, exact same-file function evidence, explicit unresolved handler evidence, and alias/dynamic/nested/unbalanced-source rejection |
| `v0.54.0` | Perl `.pl` / `.pm` discovery, direct optional package/simple-sub containment, lexical Dancer2 direct `use` proof plus literal named-coderef routes, Perl source-search/CLI/MCP filters, exact same-file sub evidence, explicit unresolved handler evidence, and inline/dynamic/nested/unbalanced rejection |
| `v0.55.0` | Julia `.jl` discovery, simple top-level one-line function containment, lexical Genie direct `using` proof plus literal named-handler routes with an optional literal method keyword, Julia source-search/CLI/MCP filters, exact same-file function evidence, explicit unresolved handler evidence, and inline/dynamic/nested/unbalanced-source rejection |
| `v0.56.0` | Haskell `.hs` discovery, direct column-zero zero-argument function containment, lexical Scotty `import Web.Scotty` proof, literal-port `scotty ... $ do` block routes, Haskell source-search/CLI/MCP filters, exact same-file function evidence, explicit unresolved handler evidence, and dynamic/inline/nested/unbalanced/tab-layout rejection |
| `v0.57.0` | OCaml `.ml` discovery, direct top-level one-parameter function containment, lexical Dream literal router-list and narrow `Dream.run` pipeline routes, OCaml source-search/CLI/MCP filters, exact same-file function evidence, explicit unresolved handler evidence, and dynamic/inline/qualified/scoped/unbalanced-source rejection |
| `v0.58.0` | F# `.fs` discovery, direct top-level typed handler containment, exact-one `open Giraffe` proof, flat direct `choose` literal routes, F# source-search/CLI/MCP filters, exact same-file function evidence, explicit unresolved handler evidence, and dynamic/inline/nested/unbalanced/tab-layout rejection |
| `v0.59.0` | Nim `.nim` discovery, direct top-level zero-argument `proc` containment, exact-one direct import-list Jester proof, flat direct `routes:` / `router name:` literal routes, Nim source-search/CLI/MCP filters, exact same-file function evidence, explicit unresolved handler evidence, and missing-import/dynamic/inline/multi-statement/nested/repeated-import/unbalanced/tab-layout rejection |
| `v0.60.0` | Vue `.vue` discovery, audited inline script declarations/default exports, unique relative Vue module resolution, direct exact-one `vue-router` `createRouter({ routes })` navigation evidence, Vue source-search/CLI/MCP filters, and dynamic/alias/rebound/lazy/inline/`script setup` rejection |
| `v0.61.0` | Svelte `.svelte` discovery, validated SFC conventional-default/direct instance-script facts, unique relative Svelte module resolution, static literal-segment SvelteKit `+page.svelte` navigation evidence, Svelte source-search/CLI/MCP filters, and duplicate/`src`/non-JS/malformed/dynamic-path rejection |
| `v0.62.0` | Astro `.astro` discovery, validated optional frontmatter conventional-default/direct declaration facts, unique relative Astro module resolution, static literal-segment `src/pages/**/*.astro` navigation evidence, Astro source-search/CLI/MCP filters, and malformed-fence/dynamic/private-page rejection |
| `v0.63.0` | Razor `.razor` discovery, conventional local component facts, standalone literal Blazor `@page` navigation evidence, Razor source-search/CLI/MCP filters, exact local route evidence, and comment/computed/`@attribute`/query-fragment/`.cshtml` rejection |
| `v0.64.0` | ArkTS `.ets` discovery, line-leading complete ArkUI `@Component struct` component facts, exact local `@Entry` UI-root `entrypoint` evidence, ArkTS source-search/CLI/MCP filters, additive `ui/root` entrypoint filters, and comment/string/regex/detached/non-struct/malformed rejection |
| `v0.65.0` | Terraform/OpenTofu `.tf` / `.tfvars` / `.tofu` discovery, literal top-level resource/data/module/variable/output facts, additive resource/module kinds, exported output bindings, Terraform source-search/CLI/MCP filters, and comment/string/heredoc/dynamic/nested/malformed rejection |
| `v0.66.0` | Shopify Liquid `.liquid` discovery, literal render/include/section raw facts, exact project-local snippet/section `calls` edges, explicit missing-target evidence, Liquid source-search/CLI/MCP filters, and comment/raw/HTML-comment/dynamic/path-traversal/malformed rejection |
| `v0.67.0` | Solidity `.sol` discovery, complete top-level contract/interface/library and direct callable-member facts, same-file unique `is` hierarchy projection, Solidity source-search/CLI filters, and comment/string/dynamic-constructor-argument/malformed rejection |
| `v0.68.0` | CFML / CFScript `.cfc` / `.cfm` / `.cfs` discovery, complete braced/tag-based/implicit-CFC declarations, direct function containment, CFML source-search/CLI filters, and comment/string/incomplete-container-or-tag/malformed rejection |
| `v0.68+` | CFML grammar validation, `cfinclude`/`import` and cross-file relationships, inheritance/accessors/annotations, tag-based `<cfscript>`, CFQuery, calls, framework-specific application/request facts, compiler validation, and runtime analysis |
| `v0.67+` | Solidity grammar validation, imports and cross-file inheritance, structs/enums/value types/state/events/errors, visibility/override/call/emit/revert facts, compiler/ABI/bytecode/storage/proxy evidence, and controlled EVM-aware analysis |
| `v0.66+` | Liquid grammar validation, `assign`/capture/loop/condition/filter facts, layout/schema/app-block and JSON template/section-group relations, safe render-argument semantics, object/metafield/locale analysis, theme inheritance, and runtime storefront behavior |
| `v0.65+` | HCL grammar validation, `terraform` / `provider` / `locals` facts, literal dependency/reference evidence, `depends_on`, provider aliases, local module source proof, JSON configuration, state/plan/apply awareness, and runtime cloud topology |
| `v0.64+` | ArkTS general declarations/imports/exports/calls, ArkUI `build()` DSL and child-component edges, `@Builder`/`@Extend`/`@Styles` and state/lifecycle semantics, navigation, module/package/project resolution, ArkTS compiler checks, and runtime UI composition |
| `v0.63+` | Razor `@code`/`@functions` member extraction, `@inject`/`@model`/`@inherits` references, template component/tag semantics, layouts/render modes, `@attribute` route constants, Razor Pages/`.cshtml`, generic Razor namespace/project/package resolution, and runtime router behavior |
| `v0.62+` | Astro frontmatter imports/re-exports and template component/call edges, client-script/style/directive/island semantics, props/`Astro` globals, static `.md`/`.mdx`/`.html` pages, endpoint facts, dynamic/rest routes, routing configuration, and broader Astro module resolution |
| `v0.61+` | Svelte template component/call edges, module-script declarations, `script` attributes/macros/runes/props semantics, SvelteKit layouts/endpoints/actions/hooks, dynamic/group/rest/optional filesystem routes, client-router configuration, and broader Svelte module resolution |
| `v0.60+` | Vue `script setup` compiler exports, template component/call edges, multiple script blocks, TypeScript Vue inference, Vue Router children/nesting, lazy/dynamic components, aliases/factories/history configuration, and cross-file router composition |
| `v0.59+` | Jester `from jester import` / alias proof, `before` / `after` / `error` handlers, special or regex route patterns, parameterized/async handlers, route composition, macro expansion, Nim package/module resolution, and proven cross-file callbacks |
| `v0.58+` | Giraffe `GET_HEAD`, `subRoute` / `choose` composition, endpoint-routing integration, aliases, broader handler signatures, cross-file proof, F# project/package/module resolution; Scotty qualified/selective imports, `scottyT`, dynamic ports, `addroute`/`matchAny`, route composition, local callback proof, generic Haskell package/module resolution, and proven cross-file functions; Play `build.sbt`/configuration detection, recursive mounted-router endpoint expansion with Router-interface proof, imported/classpath/overload controller resolution; Phoenix customary `use AppWeb, :router` expansion, aliases/imports, `resources` / `match` / `forward`, pipelines, and proven cross-file controller resolution; Cowboy multiple/specific hosts, constraints, binary paths, dispatch variables, behaviour/callback proof, and cross-file handler resolution; Compojure aliases, qualified macros, `context` / `routes` / `ANY`, middleware, `defn` metadata/docstring/multi-arity forms, handler composition, and proven cross-file namespace resolution; Dancer2 inline/anonymous coderefs, `any`, named-route syntax, prefixes/hooks/plugins, import/alias/package and cross-file sub resolution; Genie inline `do ... end` handlers, named routes, qualified method constants, modules/multiline functions, macro expansion, dynamic patterns, import aliases, and proven cross-file function resolution; Flutter `MaterialApp.router` / `onGenerateRoute` / `Navigator` evidence and proven cross-file widget resolution; Vapor group/prefix composition and proven cross-file handler resolution; Ktor `route` / `authenticate` composition and proven cross-file handler resolution; Rails controller/import/package resolution and `resources` / namespace composition; Laravel controller/import/package resolution and route-group/resource composition; deeper C/CivetWeb, Lua/Lapis, R/Plumber, and cpp-httplib scope/handler and include resolution; ASP.NET Core `MapGroup` / `MapMethods` and controller-token resolution; Spring method-level `@RequestMapping` and richer literal annotation values; Java classpath resolution; Axum route/MethodRouter composition; Rust Cargo/module resolution; Go Chi `Route` / `Group` / `Mount` composition; Echo/Fiber packs and broader Go resolution; React Router `<Routes>` boundary proof; deeper Next.js convention coverage; `fastify-plugin` wrapper proof; GraphQL field-resolver/runtime-transport evidence; contract graphs, retained-generation source browsing, and further CodeGraph-parity work |

See [CHANGELOG.md](CHANGELOG.md) for release notes and migration history.

## Release-by-release feature comparison

Every release creates a verified standalone comparison report against the local CodeGraph baseline at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_vX.Y.Z.md` (for example, `FEATURE_COMPARISON_v0.68.0.md`). The version number is part of the filename, so each release retains an independent comparison record. It intentionally lives beside the local `symbol-lattice` and `codegraph` checkouts rather than inside either project. Starting with v0.28, these reports are written in Traditional Chinese. Each report distinguishes a proven precision advantage from broader-but-less-proven source coverage, and records remaining gaps instead of treating a version bump as parity.

## Development

```bash
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd pack --dry-run
git diff --check
```

The suite covers discovery, input fingerprints, alias and workspace resolution, exact direct TypeScript/JavaScript heritage extraction and namespace-aware local/import/re-export resolution, bounded hierarchy traversal, executable framework-capability registration, exact static Express and Fastify route extraction including inline, same-file named, and cross-file imported/re-exported plugin-prefix composition plus handler resolution, recursive literal React Router JSX, `createRoutesFromElements`, and data-router client-navigation extraction with direct fragments, relative children, index routes, pathless layouts, unsafe-shape rejection, factory-specific evidence, and exact handler resolution, direct Next.js Pages/App Router convention extraction with handler resolution, import/type/shadow/spread/lazy/factory-option boundary checks, CLI/MCP `NAVIGATE` filtering, and incremental raw-fact reuse, direct NestJS controller decorators plus static `RouterModule.register()` prefix composition and non-HTTP GraphQL/microservice/WebSocket entrypoint extraction, direct ArkTS `@Entry @Component struct` UI-root extraction, route- and entrypoint-aware graph traversal, re-export semantics, exact affected-test proofs and completeness limits, local Git change-set parsing and selection, immutable revision-local Git hunk declaration attribution, bounded generation-bound node declaration evidence, generation-bound search and exploration source evidence, retained graph history and structural diffs, legacy snapshot backfill, stale-source evidence, bounded foreground pending-file disclosure, event debounce/polling fallback/retry receipts, no-op sync, schema migration, atomic rollback, MCP read-only behavior, CLI parsing, and architecture boundaries.

Python coverage includes `.py` discovery, direct declaration/containment extraction, malformed-source fail-closed behavior, direct FastAPI alias/application/decorator evidence, same-file plus one-dot regular-package cross-file `APIRouter` literal-prefix/`include_router` composition, direct Flask app and same-file `Blueprint` literal-prefix routes, persisted fact/evidence boundaries, source search, CLI/MCP language filters, and incremental indexing.

Go coverage includes `.go` discovery, persisted source search and CLI/MCP language filters, conservative top-level function containment, direct/default-or-aliased Gin engine creation, direct literal engine and nested same-function `RouterGroup` routes, direct/default-or-aliased `net/http` `HandleFunc` plus same-function `ServeMux` routes, direct/default-or-aliased Chi `NewRouter` / `NewMux` routes, Go 1.22 literal method-pattern and `CONNECT` evidence, dynamic/shadow/rebinding rejection, malformed-source fail-closed behavior, and exact route-query integration.

Rust coverage includes `.rs` discovery, persisted source search and CLI/MCP language filters, conservative top-level function containment, direct/default-or-aliased Axum `Router::new()` literal route-builder chains, imported `get` / `post` / `put` / `patch` / `delete` / `head` / `options` / `trace` method routers, dynamic/shadow/inline/composition/wrapper rejection, malformed-source fail-closed behavior, and exact route-query integration.

Java coverage includes `.java` discovery, persisted source search and CLI/MCP language filters, direct top-level class/method containment, direct imported or fully-qualified Spring Web controller evidence, literal class prefix plus literal method mapping extraction, direct local-method route edges, wildcard/dynamic/multi-value/method-level-`RequestMapping` rejection, malformed-source fail-closed behavior, and exact route-query integration.

PHP coverage includes `.php` discovery, persisted source search and CLI/MCP language filters, direct or aliased/fully-qualified Laravel facade evidence, literal URI and controller-action extraction, exact same-file local-method routes, explicit unresolved cross-file-controller routes, dynamic/closure/resource rejection, malformed-source fail-closed behavior, and persisted route-query integration.

C coverage includes `.c` discovery, persisted source search and CLI/MCP language filters, direct top-level function containment, direct `civetweb.h` inclusion plus literal `mg_set_request_handler(context, uri, handler, cbdata)` routes represented as `ALL`, unique unshadowed same-file function-handler proof, dynamic/missing-header/duplicate/shadowed/syntax-error rejection, and persisted route-query integration.

Lua coverage includes `.lua` discovery, persisted source search and CLI/MCP language filters, direct top-level `function` / `local function` containment, direct parenthesized `require("lapis")` plus local `Application()` binding proof, literal direct `get` / `post` / `put` / `delete` / `match` route extraction, unique prior un-rebound same-file local function handlers, dynamic/inline/global/late/rebound/unbalanced-source rejection, and persisted route-query integration.

R coverage includes `.r` / `.R` discovery, persisted source search and CLI/MCP language filters, direct top-level braced `name <- function(...)` / `name = function(...)` containment, standalone Plumber `#*` / `#'` literal `@get` / `@post` / `@put` / `@delete` annotation route extraction, exact immediately following anonymous braced handler evidence, dynamic/non-immediate/named/nested/unsupported-verb rejection, malformed delimiter/quoted/backtick fail-closed behavior, and persisted route-query integration.

Elixir coverage includes `.ex` / `.exs` discovery, persisted source search and CLI/MCP language filters, direct top-level `defmodule` containment represented by the existing `class` kind, direct module `def` / `defp` methods, direct `use Phoenix.Router` proof, literal nested `scope` path composition, full-module controller atom actions, exact same-file method routes, explicit unresolved controller routes, unsupported/macro/dynamic/cross-file rejection, malformed block or unterminated quote/charlist/heredoc fail-closed behavior, and persisted route-query integration.

Erlang coverage includes `.erl` discovery, persisted source search and CLI/MCP language filters, direct `-module` / `-export` / simple function containment, direct `cowboy_router:compile` literal wildcard-host three-item dispatch tuples, exact same-module exported `init/2` evidence, explicit unresolved external-handler evidence, non-wildcard/dynamic/binary/constrained/indirect route rejection, unbalanced delimiter or unterminated quote fail-closed behavior, and persisted route-query integration.

Clojure coverage includes `.clj` discovery, persisted source search and CLI/MCP language filters, direct `ns` / simple `defn` containment, direct `compojure.core` `:refer` proof (`:all` or an explicit macro list), direct top-level `defroutes` literal verb routes, exact same-file function routes, explicit unresolved handler routes, alias/dynamic/inline/nested/unbalanced/unterminated rejection, and persisted route-query integration.

Perl coverage includes `.pl` / `.pm` discovery, persisted source search and CLI/MCP language filters, direct optional `package` / simple `sub` containment, direct exact-one `use Dancer2;` proof, literal top-level `get` / `post` / `put` / `patch` / `del` / `options` routes with named `\&sub` coderefs, exact same-file function routes, explicit unresolved handler routes, import-list/dynamic/inline/`any`/nested/repeated-use/unbalanced/unterminated rejection, and persisted route-query integration.

Julia coverage includes `.jl` discovery, persisted source search and CLI/MCP language filters, direct simple top-level one-line `name(...) = ...` function containment, direct exact-one `using Genie` proof, direct statement-start literal named `route("/path", handler)` registrations with default `GET` or literal `method = GET/POST/PUT/PATCH/DELETE/OPTIONS`, exact same-file function routes, explicit unresolved handler routes, import/dynamic/inline/named/qualified-method/nested/repeated-use/unbalanced/unterminated rejection, and persisted route-query integration.

Haskell coverage includes `.hs` discovery, persisted source search and CLI/MCP language filters, direct column-zero zero-argument `name = ...` function containment, exact-one `import Web.Scotty` proof, direct literal decimal-port `scotty ... $ do` blocks, direct baseline-indented literal `get`/`post`/`put`/`delete`/`patch`/`options` named-handler routes, exact same-file function routes, explicit unresolved handler routes, qualified/dynamic/inline/nested/repeated-import/unbalanced/unterminated/tab-layout rejection, and persisted route-query integration.

OCaml coverage includes `.ml` discovery, persisted source search and CLI/MCP language filters, direct top-level one-parameter `let name arg = ...` function containment, direct literal `Dream.router` lists and narrow direct `Dream.run` pipelines, literal `Dream.get`/`post`/`put`/`delete`/`head`/`connect`/`options`/`trace`/`patch`/`any` named-handler routes, exact same-file function routes, explicit unresolved handler routes, dynamic/inline/qualified/scoped/local/wrong-entrypoint/unbalanced/unterminated rejection, and persisted route-query integration.

F# coverage includes `.fs` discovery, persisted source search and CLI/MCP language filters, direct top-level typed `HttpFunc` / `HttpContext` function containment, exactly one direct `open Giraffe` proof, direct top-level flat `choose` literal routes with fixed HTTP verb or implicit `ALL` proof, exact same-file function routes, explicit unresolved handler routes, dynamic/inline/qualified/nested/repeated-open/unbalanced/unterminated/tab-layout rejection, and persisted route-query integration.

Nim coverage includes `.nim` discovery, persisted source search and CLI/MCP language filters, direct top-level zero-argument `proc` containment, exactly one direct top-level import list containing `jester`, direct top-level flat `routes:` / `router name:` literal blocks, exact same-file function routes, explicit unresolved handler routes, aliased/repeated/missing-import, dynamic/inline/multi-statement/nested/shadowed/unbalanced/unterminated/tab-layout rejection, and persisted route-query integration.

Vue coverage includes `.vue` discovery, persisted source search and CLI/MCP language filters, one inline JavaScript/TypeScript script block, direct top-level declaration extraction, three auditable direct default-export forms, unique relative `.vue` module resolution, direct exact-one unaliased `vue-router` `createRouter` import proof, direct top-level literal routes-option/array navigation, exact same-file or imported default-component evidence, and multiple-script/`src`/non-JS/`script setup`/alias/rebound/spread/lazy/inline/dynamic rejection.

Svelte coverage includes `.svelte` discovery, persisted source search and CLI/MCP language filters, validated optional inline JavaScript/TypeScript module and instance scripts, conventional default-component evidence, direct instance-script declaration extraction, unique relative `.svelte` module resolution, static literal-segment SvelteKit `src/routes/**/+page.svelte` navigation, exact local default-component route evidence, and duplicate/`src`/non-JS/malformed/template/dynamic-bracket/route-group rejection.

Astro coverage includes `.astro` discovery, persisted source search and CLI/MCP language filters, validated optional initial TypeScript frontmatter, conventional default-component evidence, direct frontmatter declaration extraction, unique relative `.astro` module resolution, static literal-segment Astro `src/pages/**/*.astro` navigation with `index.astro` normalization, exact local default-component route evidence, and malformed-fence/frontmatter/dynamic-bracket/leading-underscore rejection.

Razor/Blazor coverage includes `.razor` discovery, persisted source search and CLI/MCP language filters, conventional local default-component evidence, standalone unescaped literal `@page` directive navigation, multiple literal template preservation, exact local route evidence, and Razor-comment/computed/`@attribute`/query-fragment/`.cshtml` rejection.

ArkTS/ArkUI coverage includes `.ets` discovery, persisted source search and CLI/MCP language filters, complete line-leading direct `@Component struct` component containment, direct same-stack `@Entry` UI-root entrypoints, exact local `handles` evidence, exported component bindings, and comment/string/regex/non-struct/detached/malformed rejection.

Terraform/OpenTofu coverage includes `.tf` / `.tfvars` / `.tofu` discovery, persisted source search and CLI/MCP language filters, complete line-leading top-level literal resource/data/module/variable/output containment, additive resource/module kinds, exported output bindings, exact local evidence, and comment/string/heredoc/dynamic-label/nested/malformed rejection.

Shopify Liquid coverage includes `.liquid` discovery, persisted source search and CLI/MCP language filters, direct literal render/include/section raw facts, exact project-local snippet/section `calls` evidence, explicit missing-target evidence, and HTML-comment/Liquid-comment/raw/dynamic/path-traversal/incomplete/nested rejection.

Solidity coverage includes `.sol` discovery, persisted source search and CLI language filters, complete top-level contract/interface/library symbols, complete direct function/modifier/constructor/fallback/receive containment, same-file unique `is` hierarchy projection, and comment/string/dynamic-constructor-argument/malformed rejection.

CFML / CFScript coverage includes `.cfc` / `.cfm` / `.cfs` discovery, persisted source search and CLI language filters, complete braced component/interface symbols, complete tag-based component/interface with named function containment, conventional implicit-CFC component facts, and comment/string/incomplete/malformed rejection.

C++ coverage includes `.cpp` / `.cc` / `.cxx` / `.hpp` / `.hh` / `.hxx` discovery, persisted source search and CLI/MCP language filters, direct top-level class/method/function containment, direct `httplib.h` include plus `httplib::Server` / `httplib::SSLServer` binding proof, literal direct named-handler HTTP routes, receiver-rebinding invalidation, dynamic/lambda/missing-header rejection, malformed-source fail-closed behavior, and persisted route-query integration.

C# coverage includes `.cs` discovery, persisted source search and CLI/MCP language filters, direct top-level class/interface/method/local-function containment, direct `WebApplication` Minimal API and `ApiController` MVC route proof, direct receiver-rebinding invalidation, dynamic/lambda/missing-import rejection, malformed-source fail-closed behavior, and persisted route-query integration.

Ruby coverage includes `.rb` discovery, persisted source search and CLI/MCP language filters, direct top-level class/method/function containment, direct `Rails.application.routes.draw` literal verb/controller-action proof, exact same-file non-namespaced controller methods, explicit unresolved cross-file or namespaced controller routes, direct/dynamic/resource/namespace rejection, malformed-source fail-closed behavior, and persisted route-query integration.

Kotlin coverage includes `.kt` discovery, persisted source search and CLI/MCP language filters, direct top-level class/interface/method/function containment, direct `Application.module`/`routing` literal callable-reference route proof, exact same-file top-level function handlers, dynamic/lambda/missing-import/wrong-module rejection, malformed-source fail-closed behavior, and persisted route-query integration.

Swift coverage includes `.swift` discovery, persisted source search and CLI/MCP language filters, direct top-level class/struct/protocol/method/function containment, direct `import Vapor` plus `routes(_ app: Application)` literal segment/`use: handler` route proof, exact same-file top-level function handlers, dynamic/closure/missing-import/wrong-function/wrong-parameter rejection, malformed-source fail-closed behavior, and persisted route-query integration.

Dart coverage includes `.dart` discovery, persisted source search and CLI/MCP language filters, direct top-level class/method/function containment, direct `import 'package:flutter/material.dart';` plus `MaterialApp(routes: {...})` literal named-navigation proof, exact same-file widget-class targets, dynamic/closure/missing-import/wrong-app/missing-target rejection, malformed-source fail-closed behavior, and persisted route-query integration.

Scala coverage includes `.scala` plus Play `conf/routes` / `conf/*.routes` discovery, persisted source search and CLI/MCP language filters, direct top-level class/object/trait/method/function containment, static literal Play controller-action pending facts, exact unique direct package-class-method cross-file resolution, candidate evidence, missing/wrong-package fail-closed behavior, malformed-source fail-closed behavior, and persisted route-query integration.

## Contributing

Issues and focused pull requests are welcome. Keep changes small, preserve explicit indexing and evidence contracts, and add tests for observable graph behavior.

## License

Distributed under the [MIT License](LICENSE).

## Links

- [Repository](https://github.com/HsinPu/symbol-lattice)
- [Issues](https://github.com/HsinPu/symbol-lattice/issues)
- [Pull requests](https://github.com/HsinPu/symbol-lattice/pulls)
- [Releases and tags](https://github.com/HsinPu/symbol-lattice/tags)
