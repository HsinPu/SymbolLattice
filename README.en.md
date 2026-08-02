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
> v0.202.0 is a developer preview. Run it from source.

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

## v0.202.0 highlights

- `npm run benchmark:mcp` measures the read-only MCP worker pool on a fixed TypeScript graph that is created and removed in a temporary directory; it never indexes, reads, or writes your project.
- The report emits sequential and concurrent `explore`/`investigate` P50/P95, error and fallback counts, query-pool state, and a main-process event-loop-delay sample; errors or fallbacks produce a non-zero exit.
- Defaults are two workers, four concurrent calls, and 24 requests. Tune with `SYMBOL_LATTICE_BENCHMARK_POOL_SIZE=1..4`, `SYMBOL_LATTICE_BENCHMARK_CONCURRENCY=1..16`, `SYMBOL_LATTICE_BENCHMARK_REQUESTS=1..512`, and `SYMBOL_LATTICE_BENCHMARK_WARMUP=1..64`.
- Results are same-machine, same-version comparison baselines, not cross-hardware performance promises or fixed pass thresholds.
- MCP workers still accept existing read-only graph tools only; a query cannot trigger `init`, `index`, `sync`, or automatic watching.

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
