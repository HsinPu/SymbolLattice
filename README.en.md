<div align="center">

# SymbolLattice

**Evidence-first, local code intelligence**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) · [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.118.0 is an early developer release. Run it from source; the npm package is not published.

SymbolLattice builds a queryable local code-symbol graph and preserves the source rule, resolution stage, and confidence behind every relationship. Index data stays in the inspected project's `.symbol-lattice/index.sqlite`; source code is never silently uploaded.

## Highlights

- Extracts syntax-proven files, symbols, imports/exports, type hierarchy, routes, entrypoints, and cross-file relations.
- Leaves ambiguous facts unresolved or heuristic rather than presenting guesses as exact graph relations.
- Covers frontend, backend, JVM, systems, data, IaC, template, and schema languages. Rust route support includes conservative Axum, Actix Web, and Rocket extraction.
- Provides CLI and read-only MCP queries for symbols, relations, routes, entrypoints, diffs, impact, and index status.

## Quick start

Requirements: Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Initialize a local graph for a project
node dist/cli/main.js init /path/to/project

# Query it and explicitly synchronize source changes
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# Start a foreground, read-only MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
```

On Windows PowerShell, use `npm.cmd` if `npm` is unavailable. Filesystem roots and home directories are rejected unless `--force` is explicit.

## v0.118.0

- Rust Actix Web now projects cross-file `ServiceConfig` callbacks from a crate root's direct `mod routes;` plus direct `crate::routes::configure` or `self::routes::configure` import. Aliases, `routes.rs`, and `routes/mod.rs` are supported.
- Every cross-file route carries module-stage evidence and the mount-file-to-callback-file resolution path. Exact projection requires one exported, type-proven callback and one same-module handler.
- Root and scope prefixes, persisted facts, and attribute-route replacement are verified. A raw attribute route is replaced only after the cross-file mount proof succeeds.

## Deliberate limits

- This is not a compiler, type checker, framework runtime, or execution tracer.
- Dynamic dispatch, reflection, macro expansion, code generation, dependency injection, and ambiguous name matches never become exact graph relations.
- Actix Web accepts directly imported HTTP attribute macros and contiguous static `App::new()` `.route(...)` / `.service(...)` / `.configure(...)` chains. Cross-file `ServiceConfig` support is limited to a direct external module of `main.rs` or `lib.rs` and a direct `crate` or `self` import. Nested modules, re-exports, `#[path]`, namespace handlers, closures, guards, wrappers, dynamic callbacks or paths, and runtime composition remain intentionally unprojected.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```
