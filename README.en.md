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
> v0.113.0 is an early developer release. Run it from source; the npm package is not published.

SymbolLattice builds a queryable local code-symbol graph and preserves the source rule, resolution stage, and confidence behind every relationship. Index data stays in the inspected project's `.symbol-lattice/index.sqlite`; source code is never silently uploaded.

## Highlights

- Extracts syntax-proven files, symbols, imports/exports, type hierarchy, routes, entrypoints, and cross-file relations.
- Creates exact edges only when evidence is sufficient; ambiguous candidates remain unresolved or heuristic instead of becoming runtime guesses.
- Covers frontend, backend, JVM, systems, data, IaC, template, and schema languages. Rust route support includes conservative Axum, Actix Web, and Rocket scanners.
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

## v0.113.0

- Adds Rust Actix Web and Rocket HTTP attribute routes with direct-import aliases, literal paths, and same-file top-level handlers.
- Retains a framework-specific evidence rule for every route. Unimported macros, ambiguous aliases, dynamic paths, and non-function attributes emit no route.
- Advances the artifact-facts version; the next explicit `sync` or fresh `init` safely rebuilds affected Rust facts.

## Deliberate limits

- This is not a compiler, type checker, framework runtime, or execution tracer.
- Dynamic dispatch, reflection, macro expansion, code generation, dependency injection, and ambiguous name matches never become exact graph relations.
- Actix Web and Rocket currently accept only directly imported `get`, `post`, `put`, `patch`, `delete`, `head`, and `options` attribute macros with one literal path. Mounts, scopes, guards, dynamic paths, and runtime composition are deferred.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```
