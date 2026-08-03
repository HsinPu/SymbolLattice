<div align="center">

# SymbolLattice

**Queryable, explainable, evidence-first local code intelligence**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.230.0 is a developer preview. Run it from source.

SymbolLattice indexes a project into a local code-symbol graph. Every relation retains its rule, evidence stage, and confidence; `exact`, `heuristic`, and `unresolved` are never conflated.

## Quick start

Requires Node.js 22.13 or newer, below 25, and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Create a local graph
node dist/cli/main.js init /path/to/project

# Query indexed code evidence
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# Explicitly update the graph after source or configuration changes
node dist/cli/main.js sync /path/to/project

# Start a read-only MCP query host
node dist/cli/main.js serve --mcp --project /path/to/project
```

Index data is stored in the target project's `.symbol-lattice/index.sqlite`. On Windows PowerShell, use `npm.cmd` when npm is unavailable.

## v0.230.0 highlights

- Django Ninja now recognizes project-root absolute imports such as `from api.routers.catalog import router`, requiring one local target and a complete `__init__.py` package boundary.
- Relative imports and final `__init__.py` Router re-export chains both project through a direct main-API `add_router` mount; decorators and fixed `api_operation` method arrays retain full module paths and `exact` evidence.
- Continues to provide multi-language static symbols, calls, imports, routes, and cross-file relationship queries while keeping graph and query data local.

## Current limits

- This release deliberately does not infer parent-relative, string-imported, or incomplete-package Django Ninja Router imports; absolute `__init__.py` re-exports; nested Routers; dynamic or non-literal-method `api_operation`; dynamic paths; conditional construction; or rebound API/Router instances.
- This is a code graph, not an RDF/SPARQL knowledge base. It does not infer runtime dynamic dispatch, full type checking, or dependency-injection selection.
- After `init`, source or configuration changes require an explicit `sync`; MCP queries never write or rebuild a graph.

## Verification

```bash
npm run check
npm test
npm run build
npm run benchmark:mcp
npm run verify:mcp-worker-generation
git diff --check
```

## License

[MIT](LICENSE)
