<div align="center">

# SymbolLattice

**Queryable, explainable, local-first code intelligence**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.160.0 is a developer preview and is not published to npm. Run it from source.

SymbolLattice builds a queryable local code-symbol graph for a project. Every relation keeps its rule, resolution stage, and confidence; `exact`, `heuristic`, and `unresolved` evidence are never conflated.

## Quick start

Requires Node.js 22.13 or newer, below 25, and npm.

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

On Windows PowerShell, use `npm.cmd` if `npm` is unavailable. Index data stays in the target project's `.symbol-lattice/index.sqlite`.

## v0.160.0

- Django `include(...)` now resolves through nested, final single-name URLConf re-export chains in regular-package `__init__.py` files.
- Every exact route records the mounting module, initializer hops, and source `urlpatterns` module in `resolutionPath` evidence.
- Missing, competing, rebound, or dynamic values never produce an exact route.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- `init` and `sync` are explicit writes. CLI and MCP queries remain read-only.
- A relation needs reproducible static evidence. Otherwise it remains unresolved instead of guessed.

## Boundaries

- Cross-file Python routing currently covers FastAPI `include_router`, Flask `register_blueprint`, Sanic `app.blueprint`, and Django `include`. It accepts only one-leading-dot, single-name relative imports in regular packages plus final, unrebound `__init__.py` export chains.
- Dynamic composition, copied values, list/tuple members, exports outside initializers, namespace packages, parent-relative imports, class views, WebSockets, `add_route`, versioning, and other registration options do not become exact.
- Reflection, runtime configuration, DI, macros, generated code, and ambiguous names are likewise never treated as static proof.

## Verification

~~~bash
npm run check
npm test
npm run build
git diff --check
~~~

## License

[MIT](LICENSE)
