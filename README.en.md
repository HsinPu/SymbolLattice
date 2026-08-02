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
> v0.211.0 is a developer preview. Run it from source.

SymbolLattice builds a local, queryable code-symbol graph. Every relation retains its rule, evidence stage, and confidence; `exact`, `heuristic`, and `unresolved` evidence are never conflated.

## Quick start

Requires Node.js 22.13 or newer, below 25, and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Create the first code knowledge graph
node dist/cli/main.js init /path/to/project

# Query persisted graph evidence
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# Re-rank with bounded exact topology evidence
node dist/cli/main.js investigate "user token" --project /path/to/project --ranking topology --json

# Explicitly refresh the graph after source changes
node dist/cli/main.js sync /path/to/project

# Start a read-only MCP query host
node dist/cli/main.js serve --mcp --project /path/to/project
```

Index data is stored in the target project's `.symbol-lattice/index.sqlite`. On Windows PowerShell, use `npm.cmd` when npm is unavailable.

> [!NOTE]
> MCP queries never create or update a graph. The default `serve --mcp` auto-sync is a host-owned background watcher; use `--no-auto-sync` for a fully manual `init`/`sync` workflow.

## v0.211.0 highlights

- Direct TypeScript and JavaScript `new ClassName()` expressions now produce `instantiates` relations.
- Only uniquely proven local, imported, or re-exported `class` targets receive exact edges. Function constructors, unimported same-name classes, member access, and dynamic constructors are never guessed as exact.
- `investigate --ranking topology` now includes exact `instantiates` edges and discloses fixed-order relation counts in each result's `topologySignals`.
- Run `sync` once on an existing index to re-extract facts and obtain the new relation.

## Scope and guarantees

- This is a local code graph, not an RDF/SPARQL knowledge base or ontology-reasoning system.
- Topology ranking uses only bounded, persisted, `exact` `calls`, `references`, `routes`, `handles`, `imports`, `extends`, `implements`, and `instantiates` relations. It is not whole-graph PageRank, runtime analysis, or dynamic-dispatch inference.
- `instantiates` currently covers direct class construction in native TypeScript and JavaScript files; Astro endpoint route projection remains unaffected.
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
