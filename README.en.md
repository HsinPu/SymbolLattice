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
> v0.163.0 is a developer preview and is not published to npm. Run it from source.

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

## v0.163.0

- Adds cross-file Django `re_path(prefix, include(...))` URLConf projection for relative imports, literal URLConfs, and package-initializer re-exports.
- Only a pure static prefix with a leading `^`, no trailing `$`, and a trailing `/` is accepted, such as `r"^api/"`; projected edges retain a `re_path`-specific evidence rule.
- Captures, wildcards, escapes, missing anchors, non-slash endings, dynamic values, and rebinding are never guessed as exact mounts.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- `init` and `sync` are explicit writes. CLI and MCP queries remain read-only and never update the graph themselves.
- A relation needs reproducible static evidence. Otherwise it remains unresolved instead of guessed.

## Static-analysis boundaries

- Cross-file Python routing covers FastAPI `include_router`, Flask `register_blueprint`, Sanic `app.blueprint`, Django `path(..., include(...))`, and bounded `re_path(..., include(...))`.
- Direct Django `re_path` accepts only one literal, full-match path pattern. Cross-file `re_path` accepts only a static prefix that composes with child paths; general regex semantics never become `exact` results.
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
