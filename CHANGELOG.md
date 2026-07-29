# Changelog

All notable changes to SymbolLattice are documented in this file.

## [Unreleased]

No unreleased changes.

## [0.4.0] - 2026-07-29

### Added

- Generation-bound local FTS5 source retrieval across persisted TypeScript/TSX/JavaScript/JSX source text and identifier parts.
- `search <query>` CLI command with bounded `--limit`, project-relative `--path`, and `--language` filters.
- Persisted source hit evidence: deterministic rank, range, excerpt, direct source terms, lexical explanation, and overlapping symbol candidates.
- Read-only, idempotent `symbol_lattice_search` MCP tool with structured output; `symbol_lattice_explore` now also exposes structured output.
- Additive source-retrieval tables for source documents and a versioned FTS projection, committed atomically with the active graph generation under the SQLite v4 metadata marker.
- A `prepack` build gate so packaged artifacts always regenerate `dist` from the current source.

### Changed

- Query-only graph reads now load a lightweight active graph bundle instead of raw artifacts.
- `sync` treats a missing or outdated source-search projection as an explicit indexer-version change and can backfill it while reusing compatible raw facts.
- Search freshness is evaluated against the current project while every result excerpt and range remains bound to the persisted active generation.
- Existing v0.3 `GraphStore` adapters retain ordinary graph reads; source search stays explicitly unavailable until an adapter opts into the new retrieval capability.

### Upgrade notes

- SQLite v1-v4 indexes remain readable. The additive retrieval tables keep a v4 metadata marker so a v0.3 binary can still open and reindex after a rollback. A legacy active generation intentionally has no source-search projection; run `sync` or `index` before using `search`.
- The v0.4 source-search backfill reuses compatible v0.3 raw artifacts when safe. It never fabricates historical source evidence or index-work data.

### Deliberate limits

- Retrieval is local lexical FTS only. Embeddings, cloud search, semantic ranking, multi-symbol context assembly, and historical source browsing remain out of scope.

## [0.3.0] - 2026-07-29

### Added

- Local workspace package resolution from root `package.json` workspaces arrays or objects, including recursive/excluded patterns, root entries, explicit subpath exports, and safe entrypoint fallbacks.
- Workspace manifest tracking in the active generation fingerprint; duplicate names, malformed manifests, escaping entries, and out-of-scope targets now fail explicitly instead of guessing.
- TypeScript AST facts for named, wildcard, default-through-named, and namespace re-export syntax.
- Deterministic re-export export surfaces for multi-hop barrels, explicit-over-wildcard precedence, wildcard collision safety, cycle termination, and re-export route evidence.
- Incremental `sync` raw-artifact reuse based on file path, content hash, language, and extractor version.
- Reverse import/re-export dependency invalidation telemetry through persisted `lastIndexWork`; no-op sync does not publish a new generation.
- SQLite schema v4 with generation-bound index-work records and an atomic active-generation bundle read.

### Changed

- `sync` now rebuilds the complete cross-file projection from current raw facts after incremental extraction, preserving correctness for new exports, removals, aliases, barrels, and manifest changes.
- Project freshness now recognizes `indexer-version-changed` and treats the root and discovered workspace manifests as reproducibility inputs.
- Re-exported exact calls use `module.reexported-import-binding` evidence with a project-relative resolution path.
- Persisted v1-v3 raw facts missing re-export data are normalized at the storage boundary but cannot be reused until a compatible v0.3 extraction succeeds.

### Deliberate limits

- pnpm workspace YAML, watcher/daemon sync, namespace property dispatch, CommonJS `require`, and external dependency indexing remain out of scope.

## [0.2.1] - 2026-07-29

### Added

- Root `.gitignore`-aware, deterministic TypeScript/JavaScript source discovery with negation support and permanent tool/build-directory exclusions.
- Repeatable `--scope` indexing option with canonical, persisted project-relative scope roots.
- TypeScript/JavaScript `baseUrl` and `paths` module resolution using the TypeScript compiler API.
- Project-local `tsconfig.json` / `jsconfig.json` selection with tracked local `extends` chains.
- Generation-bound configuration input fingerprints and actionable freshness reasons: `project-inputs-changed`, `configuration-invalid`, and `configuration-untracked`.
- SQLite schema v3 migration for active-generation index inputs; v1 and v2 graph snapshots remain readable without fabricated historical provenance.

### Changed

- Alias imports and their explicit imported calls now retain configuration-path evidence when configuration participated in resolution.
- `index` and `sync` reuse the previous successful scope unless a new `--scope` is supplied.
- Invalid or unsupported project configuration fails explicitly before replacing the active graph generation.

### Deliberate limits

- Only the root `.gitignore` controls discovery in this version; nested ignore files remain out of scope.
- External/package TypeScript `extends`, project references, workspaces, re-exports, CommonJS `require`, watchers, and incremental synchronization are not yet supported.

## [0.2.0] - 2026-07-29

### Added

- An active graph generation for a durable, identifiable successful index.
- Persisted artifact facts for symbols, structural edges, pending references, and TypeScript/JavaScript binding data.
- Per-edge resolution evidence with a rule ID, stage, and considered candidates.
- Read-only `explain-edge` CLI command and `symbol_lattice_explain_edge` MCP tool.
- A shared runtime version contract for the CLI and MCP server.

### Changed

- Complete rebuilds now replace graph, artifact facts, evidence, and active-generation metadata atomically.
- Existing v0.1 indexes remain readable; one explicit `sync` upgrades them to the v0.2.0 evidence model.

### Not yet included

- Watchers, automatic sync, incremental indexing, path aliases, full-text search, and additional language adapters.

## [0.1.0] - 2026-07-29

### Added

- Initial TypeScript/JavaScript local symbol graph.
- Explicit full indexing, caller/callee/impact queries, and read-only MCP exploration.
- `exact`, `heuristic`, and `unresolved` relationship states.

[Unreleased]: https://github.com/HsinPu/symbol-lattice/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/HsinPu/symbol-lattice/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/HsinPu/symbol-lattice/releases/tag/v0.1.0
