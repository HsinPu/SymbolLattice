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
> v0.227.0 is a developer preview. Run it from source.

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

## v0.227.0 highlights

- Django Ninja now recognises fixed `api_operation(["POST", "PATCH"], "/path")` multi-method routes on direct `NinjaAPI` instances and mounted same-file `Router`s.
- It accepts only non-empty, unique, literal uppercase `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS` method arrays with literal paths; each method retains an independent `exact` route edge.
- Continues to provide multi-language static symbols, calls, imports, routes, and cross-file relationship queries while keeping graph and query data local.

## Current limits

- This release deliberately does not infer cross-file or string-imported Django Ninja Routers, nested Routers, dynamic or non-literal-method `api_operation`, dynamic paths, conditional construction, or rebound API/Router instances.
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
