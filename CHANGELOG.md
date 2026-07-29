# Changelog

All notable changes to SymbolLattice are documented in this file.

## [Unreleased]

No unreleased changes.

## [0.16.0] - 2026-07-30

### Added

- AST-proven NestJS HTTP controller extraction for TypeScript and JavaScript: direct `@Controller(...)` plus `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Head`, `@Options`, or `@All` method decorators create persisted `route` symbols with joined controller/method paths.
- Direct exact `routes` edges from each Nest route to its decorated instance method. They carry `framework.nestjs.decorator-route.local-method` syntax evidence and participate in existing callers, callees, impact, context, exploration, edge explanation, CLI, and MCP route views without a name-resolution fallback.
- Exact decorator-import proof for non-type-only named imports from `@nestjs/common`, including import aliases. The extractor rejects shadowed, namespace, foreign-module, dynamic, object, custom, static, and body-less method shapes instead of manufacturing route evidence.

### Compatibility

- No SQLite schema migration or public query contract change is required. Existing graph, artifact-fact, edge, and retained-snapshot storage persists the additive Nest route shape; existing generations remain readable.
- The artifact extractor advances to `typescript-ast-v5`, so a pre-v0.16 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Nest route evidence. The project resolver remains at `project-resolver-v4` because Nest routes are direct syntax edges, not a new cross-file resolution rule.

### Deliberate limits

- This is the direct NestJS HTTP controller surface, not a general Nest runtime model. It excludes local decorator barrels/re-exports, namespace or custom/composed decorators, literal arrays and object options, dynamic arguments, static/abstract handlers, RouterModule/global/version prefixes, guards, GraphQL, microservices, WebSockets, and SSE.
- Decorator recognition is never inferred from a filename, package manifest, or an unbound identifier. A route needs an AST-proven direct named import from `@nestjs/common`, one supported controller decorator, one supported method decorator, and an indexed method declaration in the same class.

## [0.15.0] - 2026-07-30

### Added

- AST-proven direct declaration hierarchy facts: TypeScript and JavaScript class `extends`, TypeScript class `implements`, and TypeScript interface `extends`. Direct identifiers with generic arguments are retained with exact source ranges; qualified names, mixin/call expressions, intersections, arrays, and other complex heritage expressions remain outside the proof surface.
- First-class `extends` and `implements` graph edges, direct parent/child graph helpers, and persistent unresolved-parent evidence. Heritage uses separate TypeScript value/type namespaces: class bases require a value-space class proof, while interfaces and implemented contracts use type-space class/interface/type-alias targets. Type-only imports and type-only re-export provenance are honored only where valid.
- Read-only `hierarchy <reference> [--limit]` CLI command, `SymbolLatticeService.hierarchy`, and capability-gated `symbol_lattice_hierarchy` MCP tool. They return bounded direct parents and exact children from the active generation, disclose parent/child truncation independently, and never initialize, synchronize, or mutate an index.

### Compatibility

- No SQLite schema migration is required. Existing graph, artifact-fact, edge, pending-reference, and retained-snapshot storage carry the additive hierarchy shape; existing generations remain readable.
- Extractor and resolver versions advance because raw facts now preserve value/type binding namespaces and type-only import/re-export markers. A pre-v0.15 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes hierarchy evidence. Explore-only MCP embeddings retain their tool list because hierarchy is capability-gated.
- Existing callers, callees, reverse impact, affected-test, route, context, and ordinary call-resolution semantics deliberately remain unchanged; hierarchy is its own direct declaration query.

### Deliberate limits

- This is direct syntax evidence, not a semantic TypeScript checker. SymbolLattice does not infer declaration merging, structural type validity, transitive ancestry, overrides, or dynamic/mixin/qualified heritage expressions.
- An unproven, incompatible, ambiguous, or explicitly type-only runtime base remains `unresolved`. SymbolLattice never promotes a project-wide matching name into an inheritance proof.
- Named class/interface declarations and default-exported class expressions are in scope; variable-held and nested class expressions do not yet become independent hierarchy nodes.

## [0.14.0] - 2026-07-30

### Added

- Evidence-first Express static-route extraction for a deliberately narrow, AST-proven surface: supported immutable `const` receivers from `express()` / `express.Router()` / `Router()`, slash-prefixed string-literal paths, supported HTTP verbs, and identifier-only middleware chains with a terminal named handler.
- First-class `route` graph nodes and `routes` edges. Exact handler bindings carry framework-specific evidence; unresolved or ambiguous handlers remain inspectable route edges instead of becoming guessed links. Route bindings participate in callers, callees, reverse impact, context evidence paths, and ordinary graph inspection with their distinct edge kind preserved.
- Read-only `routes [path]` CLI command and conditional `symbol_lattice_routes` MCP tool. Both provide bounded method/path filters, handler evidence, freshness, and explicit truncation without initializing, synchronizing, or mutating an index.

### Compatibility

- No SQLite schema migration is required: the existing text-backed symbol, edge, pending-reference, and retained-snapshot storage persists the additive route graph shape. Existing generations remain readable.
- The extractor and resolver versions advance so a pre-v0.14 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes route evidence. Explore-only embedded MCP services retain their prior tool list because `symbol_lattice_routes` is capability-gated.

### Deliberate limits

- This is not a general Express runtime model. It excludes CommonJS `require`, mutable or unknown receiver aliases, `app.use` mounts, chained `.route()`, computed methods, nonliteral or non-slash paths, property/namespace handlers, inline callbacks, arrays/spreads, and dynamic dispatch.
- SymbolLattice does not read `node_modules` or infer Express from a filename, package manifest, or receiver spelling. A supported route must have a local AST proof of its Express import and receiver origin.

## [0.13.0] - 2026-07-30

### Added

- Read-only `node <reference>` CLI command for an exact, generation-bound declaration view. It returns the persisted declaration range when available, direct callers/callees, live freshness, source provenance, and explicit output bounds without initializing or refreshing an index.
- Read-only, idempotent `symbol_lattice_node` MCP tool when an embedding supplies the optional node capability. Existing explore-only embeddings retain their prior MCP surface.
- Explicit node bounds in every result: at most 200 persisted declaration lines, 16,000 UTF-16 code units, 25 direct callers, 25 direct callees, and 25 ambiguous match candidates. Source, relation, and ambiguity truncation are separately disclosed.

### Compatibility

- No SQLite migration or index backfill is required. `node` reuses the existing optional active source-document projection, and existing `explore`, context, history, Git, watch, CLI, and MCP contracts remain unchanged.
- An exact node stays graph-queryable when an older adapter or legacy generation cannot provide persisted source documents. It reports `sourceAvailability: "unavailable"` with `source: null` rather than reading current filesystem text.

### Deliberate limits

- `node` returns source and relationships only for an exact ID, qualified-name, simple-name, or location match. Ambiguous and missing references preserve their match state without selecting a candidate or inventing evidence.
- Source text is an immutable active-generation declaration range. It is not a live-file reader, retained-generation source browser, transitive impact query, dynamic-dispatch analysis, or semantic code explanation.

## [0.12.0] - 2026-07-30

### Added

- Read-only `git-hunks [path] --base <ref> [--limit <count>]` CLI command for immutable local Git hunk declaration attribution. It resolves the local `merge-base(<ref>, HEAD)`, compares that revision with `HEAD`, returns zero-context unified hunks, and extracts declaration anchors separately from the exact old and new revision blobs.
- Read-only, idempotent `symbol_lattice_git_hunks` MCP tool when an embedding supplies the optional Git hunk capability. It preserves the MCP surface of existing explore-only and Git-change-set-only embeddings.
- Explicit immutable Git hunk bounds: at most 50 supported source files, a global hunk-record default of 25 and maximum of 100, and up to 25 declaration anchors for each old or new hunk side.

### Compatibility

- No SQLite migration, active graph, graph refresh, or index backfill is required. The feature reads local immutable Git blobs directly; existing graph, affected-test, retained-history, watch, CLI, and MCP contracts remain unchanged.
- `affected --base <ref>` remains the graph-backed, file-level affected-test selector. `git-hunks` is a separate revision-local source-attribution query and does not select tests.

### Deliberate limits

- Only the resolved local merge base and `HEAD` participate. The command and MCP tool do not select working-tree, staged, or untracked files; they never fetch, index, synchronize, or mutate Git or SQLite state.
- Declaration anchors and IDs are revision-local evidence. The release makes no rename, move, old/new identity, or cross-side continuity claim.
- Attribution is limited to supported TypeScript/JavaScript source sides and zero-context unified hunks. A selection above the 50-source-file cap is rejected rather than silently truncated.

## [0.11.0] - 2026-07-30

### Added

- Immutable retained graph snapshots for up to five SymbolLattice generations, including the active generation. Each retained summary records captured graph counts, index-work telemetry when available, extractor/resolver versions, and the immutable snapshot-payload version.
- Read-only `history [path]` and `diff <from-generation-id> [path]` CLI commands. `history` returns newest-first retained summaries and explicit retention/request bounds; `diff` compares retained graph snapshots with independently bounded added, removed, and modified file, symbol, edge, and pending-reference sections.
- Read-only, idempotent `symbol_lattice_history` and `symbol_lattice_diff` MCP tools when a compatible service capability is present. Both preserve the tool surface of older explore-only embeddings.
- Explicit `activeStatus` on history/diff responses. It reports the live-filesystem freshness of the current active generation without claiming freshness for an older immutable snapshot.
- Additive `generation_snapshots` SQLite storage with active v2-v4 projection backfill on explicit initialization, deterministic retention pruning, manual FTS cleanup before generation deletion, and rollback-safe pointer-last replacement.

### Compatibility

- SQLite metadata remains at marker `4` so a v0.10 binary can still open and explicitly reindex after a rollback. The retained snapshot table is additive; an explicit `sync`, `index`, or `init` repairs/backfills a v2-v4 active generation without fabricating a v1 generation ID.
- `history` and `diff` are strictly read-only. A legacy active generation without a saved immutable snapshot, or an older external `GraphStore` adapter without the optional capability, returns `GENERATION_HISTORY_UNAVAILABLE` instead of changing storage during a query.
- Evicted, unknown, invalid, and same-generation comparisons report explicit generation errors. Existing graph, source-search, context, affected-test, watch, CLI, and MCP contracts remain unchanged.

### Deliberate limits

- This release compares retained **graph snapshots**, not Git commits, source hunks, historical source text, rename/move intent, or hunk-to-symbol attribution.
- A stable graph ID with a changed persisted payload is reported as `modified`; without a stable identity, a change remains remove-plus-add rather than an inferred move or rename.

## [0.10.0] - 2026-07-30

### Added

- Bounded pending-file disclosure in the native foreground `watch [path]` NDJSON stream. `event-pending` reports a lexically ordered sample of up to 25 project-relative paths, explicit unknown/overflow semantics, and retains the disclosure through failed status or sync work.
- `event-fresh` receipt for an event-associated reconciliation that finds no drift. A successful `event-fresh` or `synced` receipt clears the pending state only when no newer event arrived during that reconciliation.
- Native watcher path hygiene: Windows separators normalize to forward slashes; absolute, traversal, ambiguous, or missing filenames still invalidate safely but are disclosed as unknown rather than leaking host paths. Hard-excluded directories stay invisible.

### Compatibility

- No SQLite migration, daemon, MCP mutation, or cross-process state is added. `WatchEventSource` retains source compatibility because event callbacks may still be invoked without a path.
- `WatchReceipt` now always includes `pendingFileCount`, `pendingFiles`, `pendingFilesTruncated`, and `pendingFilesUnknown`. TypeScript integrations that construct that public type must add the four fields; consumers should treat a `null` count as intentionally non-exact rather than as zero.

### Deliberate limits

- Pending paths exist only in the foreground watch process that observed native events. SymbolLattice does not yet persist them, expose an MCP per-query warning/banner, coordinate multiple watchers, or claim daemon-level freshness.
- The disclosure is a scheduling and safety signal, not a per-file partial resolver: every reconciliation still evaluates complete live index freshness before publishing.

## [0.9.0] - 2026-07-30

### Added

- Native filesystem-event acceleration for the explicit foreground `watch [path]` command. The CLI subscribes recursively when the host supports it, debounces event bursts for 250 ms, filters the same hard-excluded directories as source discovery, and always reuses the established `getStatus` then atomic `sync` path.
- The existing bounded polling cadence now remains a safety sweep. Native watcher setup or runtime failure emits a compact `event-watch-failed` NDJSON receipt with `WATCH_EVENTS_UNAVAILABLE` or `WATCH_EVENTS_FAILED`, closes the event source, and continues polling instead of silently losing freshness checks.
- `event-watch-active` NDJSON receipt, deterministic event-burst/coalescing/cleanup coverage, and a testable Node `fs.watch` adapter. `watch --poll` explicitly disables native event acceleration for controlled environments.

### Compatibility

- No SQLite migration is required. `WatchEventSource` is optional: existing application embeddings that call `startForegroundWatch` without one retain v0.8 polling behavior, while the CLI supplies the native adapter by default.
- The foreground process, persisted scope, atomic publication, force guard, retry/backoff, signal handling, and read-only MCP boundary are unchanged. No daemon or MCP mutation surface was added.

### Deliberate limits

- Native events are a scheduling hint, not a per-file semantic incremental resolver. A reconciliation still scans the complete live catalog and can rebuild the full project projection when required.
- SymbolLattice does not provide a daemon, durable background watch, cross-process coordination, CodeGraph-style pending-file banners, historical graph generations, semantic Git diff, or hunk-to-declaration attribution in this release.

## [0.8.0] - 2026-07-30

### Added

- Explicit foreground `watch [path]` command for an existing index. It performs the same live freshness check as `status`, runs the established atomic `sync` only when drift is detected, and preserves the active generation when a refresh fails.
- Compact, stable NDJSON lifecycle receipts: `started`, `stale-detected`, `synced`, `sync-failed`, `status-failed`, and `stopped`. Each record keeps generation IDs, current status, index-work telemetry, actionable errors, and an explicit retry delay.
- Bounded polling interval validation (`250-60000` ms; default `2000`), non-overlapping recursive scheduling, exponential retry/backoff, fail-fast handling when an active index disappears, and graceful `SIGINT`/`SIGTERM` shutdown that waits for an in-flight sync to finish.
- Deterministic lifecycle, retry, no-overlap, shutdown, CLI-output, and real filesystem-sync tests.

### Compatibility

- No SQLite migration is required. `watch` is a CLI-only lifecycle around existing `getStatus` and `sync` semantics; it does not replace persisted scope, alter ordinary command output, or add an MCP mutation surface.
- Existing MCP tools remain read-only and never start, control, or wait for a watch session. Existing `affected` and Git-affected result contracts are unchanged.

### Deliberate limits

- `watch` is foreground polling, not a daemon, native filesystem-event watcher, cross-process coordinator, or background service. It scans the project catalog every interval and stops when its terminal process exits.
- It requires an initialized project and never runs `init` automatically. `--scope` is intentionally unavailable so a watcher cannot silently replace the active generation's stored scope.

## [0.7.0] - 2026-07-30

### Added

- Local Git-aware affected-test selection through `affected --working-tree` and `affected --base <ref>`. Working-tree mode compares `HEAD` with staged and unstaged work plus untracked files; base mode compares the local `merge-base(<ref>, HEAD)` with `HEAD` and never fetches.
- A small `GitChangeSetProvider` port and native `FileSystemGitChangeSetProvider` adapter. The adapter uses argv-only `execFile`, `--no-ext-diff`, `--no-textconv`, NUL-delimited output parsing, bounded command execution, and project-relative path validation.
- Immutable `changeSet` provenance for requested base, merge base, HEAD, untracked inclusion, deterministic Git records, rename/copy scores, and selected source paths. Both sides of a rename or copy remain visible to the active-generation graph query.
- Read-only, idempotent `symbol_lattice_affected_git` MCP tool when a Git-aware service capability is configured; existing MCP and explicit-path affected-test surfaces remain unchanged.

### Compatibility

- No SQLite migration is required. Existing graph queries and explicit-path `affected` behavior are unchanged.
- Older embedded services can omit the optional `GitChangeSetProvider`; they retain their existing MCP tool surface instead of exposing a partially configured Git tool.

### Deliberate limits

- Git selection is local file-level selection, not semantic Git diff, hunk-to-symbol mapping, runtime analysis, or test-runner discovery.
- Only supported TypeScript/JavaScript paths outside hard-excluded directories enter graph analysis. A Git change set with no such paths returns provenance with `affected: null`; more than 50 source paths fails explicitly rather than truncating.

## [0.6.0] - 2026-07-29

### Added

- `affected [filePaths...]` CLI command with Git-friendly `--stdin`, bounded `--depth` and `--limit`, project-relative/absolute path normalization, and stable JSON output.
- `SymbolLatticeService.affectedTests(projectPath, filePaths, options)` for changed-file test selection from the active graph generation.
- Read-only, idempotent `symbol_lattice_affected` MCP tool with capability detection, preserving the tool list of older explore-only embeddings.
- Deterministic affected-test evidence paths through exact persisted `imports` and `exports` edges, including barrel re-exports. A changed conventionally named test file is returned with a zero-edge `changed-test` proof.
- Shared conservative test-path classification for `*.test.*`, `*.spec.*`, `*.e2e.*`, and conventional test directories.
- Explicit analysis bounds and completeness reporting: indexed versus unindexed inputs, active index scope, stale index state, depth, visited-file, and result-limit omissions.

### Compatibility

- No SQLite migration is required. `affected` reads the active graph bundle only and remains compatible with older GraphStore adapters.
- Older adapters that do not persist index inputs return `indexScope: null`; the feature does not fabricate scope or source provenance.

### Deliberate limits

- `affected` is changed-file static analysis, not Git semantic diff or test-runner discovery. Git is an explicit caller-owned pipeline integration.
- Only exact persisted file-level import/export edges count as proof. Dynamic dispatch, runtime test discovery, unindexed paths, unsupported languages, and omitted traversal branches are surfaced as limitations rather than treated as safe.

## [0.5.0] - 2026-07-29

### Added

- `context <reference...>` CLI command for 1–8 ordered symbol references, with explicit caps for direct relationships, static proof hops, reverse-impact depth, and reverse-impact paths.
- Read-only, idempotent `symbol_lattice_context` MCP tool with structured output and capability detection, so existing explore-only embeddings retain their previous tool surface.
- Generation-bound multi-symbol context records: each reference preserves its `exact`, `ambiguous`, or `not_found` resolution, and exact records carry persisted source when available plus bounded callers, callees, and reverse impact. Ambiguous candidate lists are capped with an explicit truncation flag.
- Deterministic shortest directed evidence paths for adjacent exact references. Paths follow only exact resolved `calls` and `imports` edges, retain their original edge evidence, and report `no-path`, `not-applicable`, or traversal truncation explicitly when appropriate.
- An additive `impact` options overload and `impact --limit` CLI flag. Explicit limits return the deterministic path prefix together with `truncated`; existing unbounded impact responses keep their prior JSON shape.

### Compatibility

- No SQLite metadata or table migration is required. `context` reuses the v0.4.1 optional active-generation source-document bundle.
- Older GraphStore adapters and legacy generations remain graph-queryable. Exact context records use `source: null` with `sourceAvailability: "unavailable"` when persisted source cannot be supplied; they never fall back to live filesystem content.

### Deliberate limits

- Context references are explicit rather than natural-language retrieval. Evidence paths do not reverse edges, promote heuristic edges to proof, invent dynamic dispatch, or cross unsupported language/framework boundaries.

## [0.4.1] - 2026-07-29

### Fixed

- Exact `explore` responses now take their source excerpt from the same persisted active generation as the graph, relationships, and ranges. Changed or deleted live files can no longer be mixed with older graph evidence.

### Added

- The bundled `SymbolLatticeService` now returns additive `explore.sourceAvailability` to distinguish immutable `active-generation` source evidence from `unavailable` legacy/retrieval states and `not-applicable` non-exact matches; legacy external embeddings may omit it without inventing provenance.
- An optional, backward-compatible GraphStore source-document bundle read for exact generation-bound source evidence.

### Compatibility

- No SQLite metadata or table migration is required. Older GraphStore adapters and active generations remain graph-queryable; when they cannot provide persisted source text, `explore` returns `source: null` with `sourceAvailability: "unavailable"` instead of reading the live filesystem.

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

[Unreleased]: https://github.com/HsinPu/symbol-lattice/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/HsinPu/symbol-lattice/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/HsinPu/symbol-lattice/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/HsinPu/symbol-lattice/releases/tag/v0.1.0
