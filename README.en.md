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
> v0.153.0 is a developer preview. The package is not published to npm; run it from source.

SymbolLattice builds a queryable local code-symbol graph for a project. Every relation retains its rule, resolution stage, and confidence; exact, heuristic, and unresolved evidence are never conflated.

## Quick start

Requires Node.js 22.13 or newer, but below 25, plus npm.

~~~bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Explicitly create a local index
node dist/cli/main.js init /path/to/project

# Read-only queries; explicitly synchronize after source changes
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# Start a read-only MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
~~~

On Windows PowerShell, use npm.cmd if npm is unavailable. Index data stays in the target project's .symbol-lattice/index.sqlite.

## v0.153.0

- Adds same-file, single-layer Sanic `Blueprint.group(...)` support: the group prefix, Blueprint prefix, `app.blueprint(..., url_prefix=...)`, and decorator path compose into an exact route.
- Every group member must be a syntax-proven, unrebound direct Blueprint; otherwise no exact route is emitted.
- The next explicit `sync` re-extracts existing Python facts and rebuilds affected routes.

## Boundaries

- All indexing and queries stay local; source is never silently uploaded.
- Dynamic dispatch, reflection, macros, generated code, DI, ambiguous names, and runtime configuration never become exact relations.
- Cross-file Sanic support remains limited to one direct Blueprint imported by a single-name, one-dot relative import. Groups are same-file only, single-layer, direct Blueprint variables, and at most one literal `url_prefix`; nested groups, copies, array members, other registration options, class views, WebSockets, `add_route`, and dynamic composition remain unsupported.

## Verification

~~~bash
npm run check
npm test
npm run build
git diff --check
~~~
