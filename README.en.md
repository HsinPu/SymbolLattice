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
> v0.215.0 is a developer preview. Run it from source.

SymbolLattice builds a local, queryable code-symbol graph. Every relation retains its rule, evidence stage, and confidence; `exact`, `heuristic`, and `unresolved` evidence are never conflated.

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

# Explicitly update the graph after source changes
node dist/cli/main.js sync /path/to/project

# Start a read-only MCP query host
node dist/cli/main.js serve --mcp --project /path/to/project
```

Index data is stored in the target project's `.symbol-lattice/index.sqlite`. On Windows PowerShell, use `npm.cmd` when npm is unavailable.

> [!NOTE]
> Create the graph with `init`, then use `sync` after source changes. MCP queries themselves never write or rebuild a graph.

## v0.215.0 highlights

- Java and Kotlin now project cross-file `extends`, `implements`, and interface-inheritance edges through one unique explicit direct import or one unique same-package top-level type.
- A proven cross-file direct parent lets Java `@Override` and Kotlin `override fun` resolve to the unique same-named parent method.
- Every cross-file relation retains its source range, candidate symbols, and import/package proof; `init` and later `sync` persist the raw evidence.
- Wildcard imports, Kotlin aliases, qualified and nested types, compiler classpaths, ambiguities, and indirect ancestors remain unresolved—never guessed.

## Scope and guarantees

- This is a local code graph, not an RDF/SPARQL knowledge base or ontology-reasoning system.
- `exact` relations come from persisted static evidence; this is not runtime dynamic-dispatch inference, full type checking, or whole-graph PageRank.
- Indexing and querying stay local. Live file contents determine freshness only and never replace indexed evidence.

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
