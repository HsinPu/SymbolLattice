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
> v0.224.0 is a developer preview. Run it from source.

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

## v0.224.0 highlights

- Direct Java and Kotlin `@Autowired`, `jakarta.inject.Inject`, and `javax.inject.Inject` constructor, field, and each direct non-generic parameter of a concrete method (including setters and multi-parameter methods) project independent cross-file `references` edges to uniquely identified project-local top-level types.
- Direct Kotlin `@field:` and setter-generating `@set:` injection annotations also project exact edges; `@set:` is accepted only on mutable `var` properties.
- Direct `jakarta.annotation.Resource` and `javax.annotation.Resource` now cover Java fields and `void setX(T)` methods, plus Kotlin direct/`@field:` fields and mutable `@set:` properties. Bare and empty-parentheses forms are both verified.
- Every DI edge retains its annotation family, explicit import or qualified type spelling, and local Maven/Gradle module-dependency evidence when available.
- The graph does not infer runtime bean/provider selection, qualifier outcomes, `@Resource` `name`/`lookup`/`type` overrides, Java static methods, collection, generic, or vararg parameters, other Kotlin use-site targets such as `@get:`, alias/wildcard imports, secondary constructors, or compiler classpaths.

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
