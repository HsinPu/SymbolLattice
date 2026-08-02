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
> v0.210.0 is a developer preview. Run it from source.

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

# Re-rank candidates with bounded, exact reverse-dependency evidence
node dist/cli/main.js investigate "user token" --project /path/to/project --ranking impact --json

# Re-rank from query-matched seeds through bounded bidirectional exact-static topology
node dist/cli/main.js investigate "user token" --project /path/to/project --ranking topology --json

# Inspect persisted reverse impact; the summary covers only returned paths
node dist/cli/main.js impact "src/handlers.ts#users" --project /path/to/project --depth 3 --limit 100 --json

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

## v0.210.0 highlights

- `investigate --ranking topology` now includes exactly resolved `extends` and `implements` relationships in its bidirectional static scope, alongside calls, references, routes, handlers, and imports.
- Each topology-ranked selection now discloses `scopedExactIncidentEdgeKindCounts` in `topologySignals`: fixed-order counts of the persisted relation incidences retained for that candidate, making ranking evidence auditable.
- Relation counts are diagnostic only and do not weight the neighbor-deduplicated topology score; heuristic and unresolved relations remain excluded.

## Boundaries

- This is a local code graph, not an RDF/SPARQL knowledge graph or ontology-reasoning system.
- Queries read persisted generations only. `investigate --ranking impact` and `topology` use bounded `exact` static evidence; topology currently uses `calls`, `references`, `routes`, `handles`, `imports`, `extends`, and `implements`. It is not whole-graph PageRank, semantic ranking, dynamic-dispatch inference, or runtime analysis. The general `impact` query retains its existing resolved static relations, and its summary never upgrades or conflates edge confidence.
- `impact.summary` describes only the paths actually returned. When `--limit` or the MCP bound produces `truncated: true`, it is not a complete-graph impact claim.
- Indexing and querying stay local. Source changes are reported as freshness state, never substituted for indexed evidence.
- WAL is for same-machine local SQLite. Network filesystems, manual checkpoint management, and multi-writer coordination remain unsupported.

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
