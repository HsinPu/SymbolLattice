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
> v0.161.0 is a developer preview and is not published to npm. Run it from source.

SymbolLattice builds a queryable local code-symbol graph for a project. Every relation keeps its rule, resolution stage, and confidence; `exact`, `heuristic`, and `unresolved` evidence are never conflated.

## Quick start

Requires Node.js 22.13 or newer, below 25, and npm.

```bash
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
```

On Windows PowerShell, use `npm.cmd` if `npm` is unavailable. Index data stays in the target project's `.symbol-lattice/index.sqlite`.

## v0.161.0

- Django now projects static string URLConfs such as `path("api/", include("project.catalog.urls"))` into exact child routes.
- A string may also target a regular package `__init__.py` whose final `urlpatterns` export chain resolves to a child URLConf.
- Each projected route retains the mounting module, URLConf export hops, and source route in `resolutionPath` evidence.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- `init` and `sync` are explicit writes. CLI and MCP queries remain read-only and never update the graph themselves.
- A relation needs reproducible static evidence. Otherwise it remains unresolved instead of guessed.

## Static-analysis boundaries

- Cross-file Python routing currently covers FastAPI `include_router`, Flask `register_blueprint`, Sanic `app.blueprint`, and Django `include`.
- A Django string include accepts one unescaped dotted, project-local Python module name only. The target must be unique and every package directory must have `__init__.py`; final `urlpatterns` may resolve through package-initializer export hops.
- Dynamic composition, external or namespace packages, parent-relative imports, copied values, list or tuple values, class views, WebSockets, `add_route`, versioning, and ambiguous targets never become exact.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```

## License

[MIT](LICENSE)
