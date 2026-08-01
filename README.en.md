<div align="center">

# SymbolLattice

**Evidence-first, local code intelligence**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.126.0 is an early developer release. The package is not published to npm; run it from source.

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

## v0.126.0

- GoFrame v1/v2 now projects literal `Server.BindObjectMethod(pattern, object, method)` registrations. The pattern and method must be literals; the object must be direct `new(Controller)`, `&Controller{}`, or an un-rebound same-function local binding.
- Only one unique same-file public controller method with a `func (receiver) Method(*ghttp.Request)` signature is accepted. Dynamic values, factory/rebound objects, non-Server receivers, and unsupported method signatures remain unresolved.
- The extractor advances to `multi-language-ast-v108`; existing graphs re-extract raw facts on the next explicit `sync`.

## Deliberate limits

- This is not a compiler, type checker, framework runtime, or execution tracer.
- Dynamic dispatch, reflection, macro expansion, code generation, dependency injection, and ambiguous names never become exact graph relations.
- GoFrame batch extraction accepts only direct `g.Map` literals. Raw maps, dynamic keys or values, inline handlers, partial batches, dynamic receivers, factory/wrapper/rebound objects, cross-file controller/request joins, multi-method tags, and domain rules remain unresolved.
- Other frameworks cover only their implemented, evidence-backed slices; see [CHANGELOG.md](CHANGELOG.md) for complete history and compatibility detail.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```
