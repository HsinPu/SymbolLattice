<div align="center">

# SymbolLattice

**Evidence-first local code intelligence for TypeScript and JavaScript projects.**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[Quick start](#quick-start) | [Context packs](#bounded-multi-symbol-context) | [Commands](#command-reference) | [MCP](#mcp-server) | [Architecture](#architecture) | [Roadmap](#roadmap)

</div>

> [!IMPORTANT]
> **v0.5.0** is an early developer release. This public repository runs from source; its npm package is intentionally private and is not published to npm.

SymbolLattice builds a local symbol graph without hiding uncertainty. It keeps syntax-proven artifact facts, resolves cross-file relationships conservatively, and records why every resolved edge exists. The graph stays local to the inspected project under `.symbol-lattice/index.sqlite`.

## Why SymbolLattice?

- **Evidence-first** - resolved edges retain a rule ID, resolution stage, considered symbols, relevant configuration paths, and re-export route when applicable.
- **Safe freshness** - source hashes and project inputs are stored with each active generation; `status` reports drift instead of silently rebuilding.
- **Workspace-aware** - local npm/Yarn-style workspaces can resolve package roots and explicit subpath exports without reading `node_modules`.
- **Incremental parsing, atomic publication** - `sync` only reparses changed source artifacts when their persisted facts are compatible, then atomically publishes one fresh project graph.
- **Generation-bound source evidence** - `search` and exact `explore` results use source captured with the active graph generation, even when the live project has since drifted.
- **Bounded context packs** - ordered symbol references produce persisted source, capped relationship/impact summaries, and static directed evidence paths without guessing ambiguous symbols or dynamic behavior.
- **Agent-safe MCP** - MCP tools are read-only and never initialize or refresh a project.

## Quick start

### Requirements

- Node.js `>=22.13 <25`
- npm

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Create the first graph for a project.
node dist/cli/main.js init /path/to/project

# Inspect a stored relationship.
node dist/cli/main.js explain-edge "edge:<edge-id>" --project /path/to/project
```

On Windows, use `npm.cmd` if `npm` is not available directly in PowerShell.

> [!WARNING]
> SymbolLattice refuses to index a filesystem root or home directory unless `--force` is supplied deliberately.

### Typical workflow

```bash
# Query symbols after indexing.
node dist/cli/main.js find add --project /path/to/project
node dist/cli/main.js callers "src/math.ts#add" --project /path/to/project
node dist/cli/main.js search "session timeout" --project /path/to/project --path src
node dist/cli/main.js context "src/consumer.ts#calculate" "src/math.ts#add" --project /path/to/project

# Inspect freshness before an explicit update.
node dist/cli/main.js status /path/to/project
node dist/cli/main.js sync /path/to/project
```

All data commands emit stable, pretty JSON. `--json` is retained as a forward-compatible script flag.

## Capabilities

| Area | v0.5.0 behavior |
| --- | --- |
| Source files | TypeScript, TSX, JavaScript, and JSX |
| Scope | Project root by default or repeatable, persisted `--scope` directories |
| Discovery | Root `.gitignore` with negation; `.git`, `.symbol-lattice`, `coverage`, `dist`, and `node_modules` are always excluded |
| Symbols | Files, classes, functions, methods, interfaces, types, and variables |
| Relationships | `contains`, module imports/exports, and direct identifier calls |
| Module resolution | Relative paths, TypeScript/JavaScript `baseUrl` and `paths`, then local workspace packages |
| Workspaces | Root `package.json` workspaces array/object, local package root/subpath `exports`, and entrypoint fallback |
| Re-exports | Named aliases, `export *`, default-through-named aliases, and namespace-export provenance |
| Retrieval | Local deterministic FTS5 search across persisted source text and identifier parts; bounded path/language filters, source/symbol evidence, and exact `explore` excerpts from the same active generation |
| Context | Bounded packs for 1–8 ordered references: exact-match source excerpts, capped callers/callees and reverse impact, plus shortest static directed evidence paths between adjacent exact references |
| Storage | Local SQLite v4 metadata with additive generation-bound source retrieval tables, raw artifact facts, edge evidence, index inputs, and index-work telemetry |
| Freshness | Source hashes, configuration/workspace manifest fingerprints, extractor/resolver versions, and actionable stale reasons |

### Resolution contract

| State | Meaning |
| --- | --- |
| `exact` | Proven by syntax, lexical binding, explicit import, workspace package, or re-export surface |
| `heuristic` | Conservative unique-name inference; useful but never presented as proof |
| `unresolved` | Kept for inspection but excluded from callers, callees, and impact paths |

For an exact call that travels through a barrel, evidence uses `module.reexported-import-binding` and includes a `resolutionPath`, for example:

```json
{
  "ruleId": "module.reexported-import-binding",
  "resolutionPath": [
    "apps/web/src/consumer.ts",
    "packages/core/src/index.ts",
    "packages/core/src/math.ts"
  ]
}
```

### Indexed source search

`find` and `query` resolve graph symbols by name, qualified name, ID, or location. `search` is a separate retrieval command: it searches only the source text and identifier-part corpus captured with the active graph generation.

```bash
# Prefix-style lexical retrieval. All query terms must match the indexed corpus.
node dist/cli/main.js search "fetch response" --project /path/to/project

# Restrict persisted results without reading the live source tree.
node dist/cli/main.js search "session timeout" --project /path/to/project \
  --path src/server --language typescript --limit 10
```

Search accepts letters, numbers, and identifier fragments; punctuation is treated as text separation rather than query syntax, and common diacritics fold consistently with local FTS (`café` can match `cafe`). Each result includes its deterministic rank, file and language, persisted source range/excerpt, terms found directly in source, an explanation, and zero or more overlapping declaration candidates.

> [!NOTE]
> `status` is evaluated against the live project, but `search.results` always come from the persisted active generation. If a file changes after indexing, search can truthfully return `stale: true` while still showing the older indexed excerpt. Run `sync` or `index` to publish newer evidence.

### Generation-bound exploration

For an exact symbol match, `explore` returns its excerpt from the same active generation as its graph relationships and ranges. It never substitutes the current file contents. This means a changed or deleted live file can produce `stale: true` while the response still carries the older, internally consistent evidence.

The bundled v0.5.0 service supplies `sourceAvailability` to make that contract explicit:

- `active-generation` — `source` is immutable persisted evidence from the active generation.
- `unavailable` — the graph is still queryable, but an older adapter or legacy generation cannot supply persisted source text; `source` is `null` and SymbolLattice does not fall back to the live filesystem.
- `not-applicable` — the reference was ambiguous or not found, so there is no exact symbol source to return.

The field is additive: an external legacy `ExploreService` embedding may omit it rather than making a provenance claim it cannot support.

### Bounded multi-symbol context

`context` is a separate, additive view for reading a small, explicit set of related symbols. It does not replace the single-symbol `explore` contract.

```bash
node dist/cli/main.js context \
  "src/consumer.ts#calculate" \
  "src/math.ts#add" \
  --project /path/to/project
```

The input accepts **1–8 ordered references**. Each result preserves the normal `exact`, `ambiguous`, or `not_found` match rather than selecting an ambiguous candidate. Ambiguous candidate lists cap at 25 and set `matchCandidatesTruncated` when more persisted candidates exist. Exact matches include a persisted source excerpt when the active generation can supply it, bounded direct callers/callees, and bounded reverse-impact paths.

Adjacent exact references are also checked as a directed static route in the supplied order. A returned `path` is the deterministic shortest path through **exact** `calls` or `imports` edges only. SymbolLattice never reverses an edge, treats a heuristic edge as proof, or fabricates a dynamic-dispatch hop. Each pair reports one of `path`, `same-symbol`, `no-path`, `not-applicable`, or `truncated`.

| Option | Default | Range | Effect |
| --- | ---: | ---: | --- |
| Match candidates | `25` | fixed | Cap candidates returned for each ambiguous reference and report `matchCandidatesTruncated` |
| `--relation-limit` | `8` | `1–25` | Cap direct callers and callees per exact symbol |
| `--max-hops` | `4` | `1–6` | Cap directed evidence-path hops for each adjacent pair |
| `--impact-depth` | `2` | `1–3` | Cap reverse dependency depth per exact symbol |
| `--impact-limit` | `8` | `1–25` | Cap reverse-impact paths per exact symbol |

Each context response includes the applied `bounds`, per-section `truncated` flags, and a fixed per-path traversal budget. This makes response size and omitted evidence explicit instead of silently ranking or dropping data.

> [!NOTE]
> Context uses the same active-generation source-document bundle as its graph data. With an older `GraphStore` adapter or legacy generation, exact graph context remains available with `sourceAvailability: "unavailable"`; SymbolLattice never reads the live file as a substitute.

### Workspace resolution

SymbolLattice recognizes local workspace packages declared by the root `package.json`:

```json
{
  "private": true,
  "workspaces": ["packages/*"]
}
```

It also accepts `{ "workspaces": { "packages": [...] } }`, recursive `**` patterns, and `!` exclusions. Resolution order is:

1. Relative source path.
2. TypeScript/JavaScript `paths` or `baseUrl` alias.
3. Local workspace package name and explicit subpath export.
4. Unresolved.

Workspace targets must already be inside the active source scope. SymbolLattice never broadens `--scope`, follows `node_modules`, or chooses between duplicate workspace package names. Invalid, escaping, or duplicate manifests fail explicitly before replacing the active graph.

### Re-export semantics

The extractor stores re-export syntax as raw, reusable facts. The resolver then builds a deterministic export surface across the project:

- Local and explicit named exports take precedence over wildcard exports.
- `export *` never forwards `default`.
- Wildcard name collisions remain unresolved rather than selecting the first candidate.
- Cyclic barrels terminate safely; no target is fabricated without a declaration.
- `export * as namespace` is retained as provenance, but namespace property dispatch remains unresolved in this release.

### Incremental sync contract

`init` and `index` perform a complete extraction and graph rebuild. `sync` is explicit and follows this contract:

1. Scan current sources, scope, ignore policy, TypeScript configuration, and workspace manifests.
2. Reuse a persisted raw artifact only when its file path, content hash, language, and extractor version match.
3. Re-extract added, modified, or incompatible artifacts.
4. Compute reverse import/re-export dependency invalidation for observability.
5. Rebuild the full module/export and source-retrieval projections from the current raw facts and scanned source documents.
6. Atomically replace the active generation only after all work succeeds.

The full-project projection in step 5 is intentional: a new export, removed file, barrel change, or configuration change can affect an unchanged caller. `lastIndexWork` reports `reExtractedFiles`, `reusedArtifactFiles`, and `dependencyInvalidatedFiles`; it does **not** claim that resolution was only partial. A no-op `sync` does not create a new generation.

## Configuration and scope

```bash
# Index only selected project-relative directories.
node dist/cli/main.js init /path/to/project --scope src --scope packages/core

# Reuse the successful scope later.
node dist/cli/main.js sync /path/to/project

# Replace it deliberately.
node dist/cli/main.js sync /path/to/project --scope src
```

The active generation fingerprints the root `.gitignore`, selected `tsconfig.json` or `jsconfig.json`, project-local `extends` chain, root workspace manifest, discovered workspace manifests, and effective scope. `status` can report:

| Reason | Meaning |
| --- | --- |
| `source-files-changed` | The active source set or source hash differs |
| `project-inputs-changed` | Scope, ignore policy, config, or workspace metadata differs |
| `indexer-version-changed` | Persisted artifacts or projection semantics need an explicit refresh |
| `configuration-invalid` | Current TypeScript or workspace configuration cannot be parsed safely |
| `configuration-untracked` | A legacy generation has no reproducibility identity |

## Command reference

| Command | Purpose |
| --- | --- |
| `init [path]` | Create the local database and build the first full generation |
| `index [path]` | Explicitly perform a full extraction and rebuild |
| `sync [path]` | Explicitly reuse compatible raw facts and publish a fresh graph when needed |
| `status [path]` | Report active generation, freshness, stale reasons, and latest index work |
| `find <query>` / `query <query>` | Search symbols by name, qualified name, ID, or location |
| `search <query>` | Search persisted source and identifier evidence; accepts `--limit`, `--path`, and `--language` |
| `callers <symbol>` / `callees <symbol>` | Show direct graph relationships |
| `impact <symbol>` | Trace reverse impact with optional `--depth` and explicit output `--limit` |
| `explore <query>` | Return exact generation-bound source when available, callers, callees, impact, and freshness |
| `context <reference...>` | Build a bounded multi-symbol persisted-evidence pack for 1–8 ordered references |
| `explain-edge <edge-id>` | Explain edge endpoints and resolution evidence |
| `serve --mcp` | Start the stdio MCP server |

`init`, `index`, and `sync` accept repeatable `--scope <directory>` plus `--force`.

## MCP server

Build SymbolLattice and initialize the target project first:

```bash
node dist/cli/main.js serve --mcp --project /path/to/project
```

| Tool | Contract |
| --- | --- |
| `symbol_lattice_explore` | Return generation-bound source when available, callers, callees, impact, freshness, and structured output for an existing graph |
| `symbol_lattice_context` | Return bounded generation-bound source, relationships, reverse impact, and directed proof paths for ordered references without refreshing an index |
| `symbol_lattice_search` | Return persisted source evidence, declaration candidates, and freshness without refreshing an index |
| `symbol_lattice_explain_edge` | Return an edge, endpoints, evidence, and freshness for an existing graph |

None of these tools initializes, refreshes, or otherwise mutates an index.

## Upgrade notes

SQLite v1 through v4 indexes remain readable. v0.4 adds generation-bound source documents and an FTS5 projection under the SQLite v4 metadata marker, so a v0.3 binary can still open and reindex after a rollback. A legacy generation has no historical source-search projection, so `search` reports an explicit availability error until a successful `sync` or `index` publishes one. That backfill can reuse compatible v0.3 raw artifact facts; it does not invent historical source evidence or telemetry. v0.4.1 adds no schema migration: when an embedded older GraphStore adapter or legacy active generation cannot supply the persisted source documents, exact `explore` remains graph-queryable with `source: null` and `sourceAvailability: "unavailable"`; it never reads a live file as substitute evidence. v0.5 adds no SQLite migration either: `context` reuses that same optional source-document bundle and keeps exact graph context available with source marked `unavailable` when an older adapter cannot supply it. A short-lived pre-release marker `5` is normalized to `4` by explicit `sync` or `index` before rollback.

## Architecture

```mermaid
flowchart LR
  CLI["CLI: explicit init/index/sync"] --> App["Application service"]
  MCP["Read-only MCP"] --> App
  Catalog["Filesystem catalog\nscope + gitignore"] --> Inputs["Index inputs"]
  Catalog --> TS["TS alias resolver"]
  Catalog --> WS["Workspace resolver"]
  Extractor["TypeScript AST extractor"] --> Facts["Reusable artifact facts"]
  Catalog --> SourceDocs["Persisted source documents"]
  SourceDocs --> Retrieval["Generation-bound lexical projection"]
  Facts --> Resolver["Full project export surface"]
  TS --> Resolver
  WS --> Resolver
  Inputs --> SQLite["Atomic SQLite generation"]
  Resolver --> SQLite
  Retrieval --> SQLite
  App --> SQLite
```

```text
src/
  application/     Use cases, incremental planning, and graph projection
  cli/             Commander-based CLI
  domain/          Graph, evidence, identity, and index-work contracts
  extraction/      TypeScript AST fact extraction
  infrastructure/  Filesystem, workspace, TypeScript, and SQLite adapters
  mcp/             Read-only MCP server
  ports/           Dependency boundaries
```

## Deliberate boundaries

v0.5.0 does not yet provide:

- File watchers, daemon mode, automatic sync, worker pools, or historical graph generations.
- pnpm workspace YAML, TypeScript project references, external/package `extends`, or nested `.gitignore` semantics.
- CommonJS `require`, dynamic dispatch, decorators, framework routes, reflection, or namespace property-call resolution.
- Parsers beyond TS/TSX/JS/JSX, external dependency indexing, telemetry, or multi-project routing.
- Embedding-based or cloud retrieval, semantic ranking, arbitrary natural-language context assembly, or historical source browsing.

## Roadmap

| Milestone | Focus |
| --- | --- |
| `v0.3.0` | Workspace packages, AST re-exports, dependency-aware incremental parsing, and schema v4 telemetry |
| `v0.4.0` | Generation-bound FTS5 source retrieval, source/symbol evidence, CLI search, and structured read-only MCP retrieval |
| `v0.4.1` | Generation-bound exact exploration source, explicit source availability, and adapter-safe source-document reads |
| `v0.5.0` | Bounded multi-symbol context, exact static evidence paths, capped relationship/impact context, and explicit `impact --limit` |
| `v0.6+` | Opt-in watcher/daemon, language adapters, framework packs, Git semantic diff, and contract graphs |

See [CHANGELOG.md](CHANGELOG.md) for release notes and migration history.

## Development

```bash
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd pack --dry-run
git diff --check
```

The suite covers discovery, input fingerprints, alias and workspace resolution, re-export semantics, generation-bound search and exploration source evidence, legacy backfill, stale-source evidence, incremental raw-fact reuse, no-op sync, schema migration, atomic rollback, MCP read-only behavior, CLI parsing, and architecture boundaries.

## Contributing

Issues and focused pull requests are welcome. Keep changes small, preserve explicit indexing and evidence contracts, and add tests for observable graph behavior.

## License

Distributed under the [MIT License](LICENSE).

## Links

- [Repository](https://github.com/HsinPu/symbol-lattice)
- [Issues](https://github.com/HsinPu/symbol-lattice/issues)
- [Pull requests](https://github.com/HsinPu/symbol-lattice/pulls)
- [Releases and tags](https://github.com/HsinPu/symbol-lattice/tags)
