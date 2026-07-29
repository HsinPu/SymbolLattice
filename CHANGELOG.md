# Changelog

All notable changes to SymbolLattice are documented in this file.

## [Unreleased]

No unreleased changes.

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

[Unreleased]: https://github.com/HsinPu/symbol-lattice/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/HsinPu/symbol-lattice/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/HsinPu/symbol-lattice/releases/tag/v0.1.0
