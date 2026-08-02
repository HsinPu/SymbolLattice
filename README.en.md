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
> v0.200.0 is a developer preview. Run it from source.

SymbolLattice builds a queryable local code-symbol graph. Every relation retains its rule, evidence stage, and confidence; exact, heuristic, and unresolved evidence are never conflated.

## Quick start

Requires Node.js 22.13 or newer, below 25, and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Explicitly create a local code-symbol graph
node dist/cli/main.js init /path/to/project

# Retrieve one persisted-generation structural investigation from keywords
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# Explicitly synchronize after source changes
node dist/cli/main.js sync /path/to/project

# Start an MCP host; tools stay read-only and background auto-sync is enabled by default
node dist/cli/main.js serve --mcp --project /path/to/project

# Require manual init/sync only
node dist/cli/main.js serve --mcp --project /path/to/project --no-auto-sync
```

On Windows PowerShell, use `npm.cmd` if npm is unavailable. Index data stays in the target project's `.symbol-lattice/index.sqlite`.

> [!NOTE]
> MCP tools never create or update a graph themselves. The default `serve --mcp` auto-sync is a separate host-owned background watcher; use `--no-auto-sync` for fully manual updates.

## v0.200.0 highlights

- `serve --mcp` can run graph reads through a bounded worker pool, capped at four workers by default. Set `SYMBOL_LATTICE_MCP_QUERY_POOL_SIZE=1..4` to tune it.
- Workers accept only existing read-only graph tools. They never receive `init`, `index`, `sync`, or automatic-watch capabilities, and an MCP query cannot trigger them.
- Before a worker warms, when the pool becomes unavailable, or after a bounded queue wait, the request safely falls back to the existing main-process read path.
- `investigate --ranking lexical|structure` preserves FTS order or applies disclosed direct-static structure ranking.

## Boundaries

- This is a local code graph, not an RDF/SPARQL knowledge graph or ontology-reasoning system.
- Queries read persisted generations only; they do not use LLMs, PageRank, runtime guesses, or undisclosed weights.
- Indexing and querying stay local. Source changes are reported as freshness state, never substituted for indexed evidence.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```

## License

[MIT](LICENSE)
