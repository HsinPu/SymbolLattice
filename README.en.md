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
> v0.198.0 is a developer preview. Run it from source.

SymbolLattice builds a queryable local code-symbol graph. Every relation retains its rule, evidence stage, and confidence; exact, heuristic, and unresolved evidence are never conflated.

## Quick start

Requires Node.js 22.13 or newer, below 25, and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Explicitly create a local code graph
node dist/cli/main.js init /path/to/project

# Retrieve one persisted-generation structural context from keywords
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# Explicitly synchronize after source changes
node dist/cli/main.js sync /path/to/project

# Start a read-only MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
```

On Windows PowerShell, use `npm.cmd` if npm is unavailable. Index data stays in the target project's `.symbol-lattice/index.sqlite`.

## v0.198.0 highlights

- `investigate <query>` and `symbol_lattice_investigate` now return each selected symbol's declaration source from the same graph generation. Each declaration is capped at 200 physical lines or 16,000 UTF-16 code units, with the total size and truncation disclosed.
- Responses disclose source rank, candidate rank, candidate total, and truncation. A fuzzy text hit is never presented as a proven symbol relationship.
- `init` creates a local code-symbol graph snapshot; only `sync` updates it. `investigate`, CLI, and MCP queries remain read-only.

## Boundaries

- This is a local code graph, not an RDF/SPARQL knowledge graph or ontology-reasoning system.
- `investigate` selects only persisted lexical matches and overlapping declarations; it does not use LLMs, PageRank, or guessed dynamic relationships.
- Indexing and querying stay local. When source files change, the result reports staleness while still showing only evidence from the indexed generation.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```

## License

[MIT](LICENSE)
