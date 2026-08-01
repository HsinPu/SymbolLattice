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
> v0.123.0 is an early developer release. The package is not published to npm; run it from source.

SymbolLattice builds a queryable local code-symbol graph for a project. Every relation keeps its source rule, resolution stage, and confidence. Source code remains in the indexed project's `.symbol-lattice/index.sqlite` and is never silently uploaded.

## Highlights

- Extracts AST-proven files, symbols, imports/exports, type hierarchy, routes, entrypoints, and cross-file relations.
- Leaves ambiguous facts unresolved or heuristic instead of presenting guesses as exact graph relations.
- Covers frontend, backend, JVM, systems, data, IaC, template, and schema languages. Rust includes conservative Axum, Actix Web, Rocket, and Cargo-workspace route analysis.
- Provides CLI and read-only MCP queries for symbols, relations, routes, entrypoints, impact, history, diffs, and index status.

## Quick start

Requirements: Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Create a local graph
node dist/cli/main.js init /path/to/project

# Query it; explicitly synchronize when source changes
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# Start a foreground, read-only MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
```

On Windows PowerShell, use `npm.cmd` if `npm` is unavailable. Filesystem roots and home directories are rejected unless `--force` is explicit.

## v0.123.0

- Adds GoFrame v1/v2 route extraction for literal-rule `g.Server().BindHandler` calls or HTTP-method literal calls on a static `Group`, plus same-file standard-router joins of `g.Meta`, direct `Bind`, and a controller method.
- Every new route keeps exact evidence. Existing graphs re-extract their raw facts on the next explicit `sync` because the extractor version advances.

## v0.122.0

- Cargo workspace `members` now accept common `*`, `?`, and `**` globs. Glob expansion honors `[workspace].exclude`, while explicit literal members retain Cargo precedence.
- Every globbed workspace graph persists a member snapshot. Adding only a matching `Cargo.toml`, before any Rust source exists, still makes `status` stale until an explicit `sync`.
- Cross-crate Actix Web `ServiceConfig` projection still requires member proof, root local-path proof, member opt-in, a matching target `Cargo.toml` package name, and every direct `mod` hop from target `src/lib.rs`.

## Deliberate limits

- This is not a compiler, type checker, framework runtime, or execution tracer.
- Dynamic dispatch, reflection, macro expansion, code generation, dependency injection, and ambiguous names never become exact graph relations.
- GoFrame intentionally does not project inline or object-method handlers, callback `Group` forms, cross-file controller/request joins, multi-method tags, domain rules, or dynamic receivers/rules.
- Cross-file Actix Web `ServiceConfig` support accepts only one or two direct external modules from `main.rs` / `lib.rs`. Workspace crates accept literal or common-glob `members`, `exclude`, a root package or explicit member, plus either a direct inline-table `[dependencies]` `path` or a matching `{ workspace = true }` inheritance of a root local `[workspace.dependencies]` path. Character classes, brace and `!` glob patterns, Cargo's implicit path-dependency membership, inherited registry/transitive/dev/build dependencies, non-inline tables, target-specific sections, re-exports, `#[path]`, inline modules, deeper paths, closures, wrappers, dynamic callbacks, and dynamic paths remain unprojected.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```
