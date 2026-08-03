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
> v0.217.0 is a developer preview. Run it from source.

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

> [!NOTE]
> Create the graph with `init`, then explicitly run `sync` after source or project-configuration changes. MCP queries never write or rebuild a graph.

## v0.217.0 highlights

- Scans conventional Maven `pom.xml` modules and literal Gradle `include` modules, retaining Java/Kotlin `src/main` and `src/test` membership as reviewable project evidence.
- When Maven/Gradle evidence exists, a same-package parent without an import or qualified type can produce an `exact` relation only within one visible source set of one unambiguous module. Tests can see same-module main; main never links to test.
- Explicit imports and qualified types retain their independent syntax proof. This release does not claim Maven/Gradle dependency parsing, compiler-classpath resolution, or custom Gradle `projectDir` support.
- `pom.xml`, Gradle settings, and selected build files are persisted as index inputs, so configuration changes can require a graph sync.

## Scope and guarantees

- This is a local code graph, not an RDF/SPARQL knowledge base or ontology-reasoning system.
- `exact` comes from persisted static evidence; it is not runtime dynamic-dispatch inference, full type checking, or whole-graph PageRank.
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
