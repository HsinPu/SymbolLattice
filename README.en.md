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
> v0.120.0 is an early developer release. The package is not published to npm; run it from source.

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

## v0.120.0

- Actix Web can now project a `ServiceConfig` from another Cargo workspace crate, for example `use api_routes::routes::configure`.
- Projection requires literal workspace membership, the target crate's `Cargo.toml`, a direct inline-table `[dependencies]` `path` dependency from the mounting crate, and every direct `mod` hop from target `src/lib.rs`; package aliases are supported.
- The projected edge retains all three manifest inputs plus a mount-file → `lib.rs` → callback-module resolution path. Missing evidence means no projection and no suppression of the raw attribute route.

## Deliberate limits

- This is not a compiler, type checker, framework runtime, or execution tracer.
- Dynamic dispatch, reflection, macro expansion, code generation, dependency injection, and ambiguous names never become exact graph relations.
- Cross-file Actix Web `ServiceConfig` support accepts only one or two direct external modules from `main.rs` / `lib.rs`. Workspace crates require literal `members`, a root package or explicit member, and an inline-table `[dependencies]` `path` dependency. Glob members, `workspace = true`, registry/transitive/dev/build dependencies, re-exports, `#[path]`, inline modules, deeper paths, closures, wrappers, dynamic callbacks, and dynamic paths remain unprojected.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```
