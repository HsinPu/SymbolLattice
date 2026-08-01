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
> v0.139.0 is an early developer release. The package is not published to npm; run it from source.

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

## v0.139.0

- GoFrame v1/v2 now supports an untyped factory `var` alias in the same function: after `var controller = NewController()` or `var controller = handlers.NewV1()`, `Bind(controller)` can project an `exact` route.
- A factory alias retains the proven factory, `Group` prefix, `Domain` host, and root-`go.mod` cross-package evidence. Typed factory vars, grouped/multi-value declarations, reassignment, and a callback parameter of the same name remain non-exact.
- Artifact facts advance to `multi-language-ast-v120`; the next explicit `sync` re-extracts Go facts and reprojects routes.

## Deliberate limits

- This is not a compiler, type checker, framework runtime, or execution tracer.
- Dynamic dispatch, reflection, macro expansion, code generation, dependency injection, and ambiguous names never become exact graph relations.
- GoFrame Domain extraction accepts only proven literal, non-wildcard hosts. Dynamic values, empty entries, wildcards, and rebound receivers remain unresolved.
- Chained GoFrame receivers are limited to a `g.Server()` root and a finite literal `Domain`/one-argument `Group` chain. Arbitrary method calls, dynamic prefixes, variable propagation, and unsupported callback forms never become exact relations.
- Cross-file GoFrame standard routing supports only statically proven direct pointers (`&Controller{}` / `new(Controller)`), no-argument `Factory()` calls, and one unrebound same-function pointer/factory alias. A pointer alias may use `:=`, or one directly initialized `var`; a declared type must be the matching pointer type. A factory alias may use `:=` or one untyped directly initialized `var`. Each `Bind(...)` argument must prove itself independently; slice expansion, dynamic values, globals, grouped/multi-value var declarations, typed factory vars, forwarding, branches, map/interface/DI containers, callback shadowing, rebinding, and ambiguity never become `exact`. Explicit import aliases are accepted directly; default imports require a matching target `package` clause and are never inferred from the import path. `.`/`_` imports, external/transitive modules, `replace`, nested-module selection, and build tags remain unresolved.
- Unbound GoFrame request-signature candidates are always `heuristic`, never proof of runtime route registration; reflection, dynamic Bind calls, and unknown prefixes or hosts remain unresolved.
- Other frameworks expose only implemented, evidence-backed slices; see [CHANGELOG.md](CHANGELOG.md) for the full history.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```
