# Changelog

All notable changes to SymbolLattice are documented in this file.

## [Unreleased]

No unreleased changes.

## [0.212.0] - 2026-08-03

### Added

- Native TypeScript class methods with an explicit `override` modifier now persist an `overrides` reference. It becomes an exact edge only when the active graph proves one exact direct `extends` target and exactly one same-named method directly contained by that parent class.
- Bounded `investigate --ranking topology` now treats exactly resolved `overrides` edges as bidirectional connectivity evidence. `topologySignals.edgeKinds` and `scopedExactIncidentEdgeKindCounts` expand from eight to nine fixed-order kinds.
- Unit, application, graph, and MCP coverage prove explicit-modifier extraction, local/imported/re-exported direct-parent resolution, missing-parent and missing-method rejection, overload ambiguity rejection, heuristic-edge exclusion, persistence through `init`, and the expanded response schema.

### Compatibility

- Existing SQLite data remains readable, but the artifact-facts extractor version advances to `multi-language-ast-v177`. Run `sync` once on an existing index to re-extract source facts and add eligible override relations; no database schema migration is required.
- The fixed topology output tuple now appends `overrides`. Consumers that validate its exact length must accept nine entries. `impact` ranking and traversal keep their existing five eligible edge kinds.

### Deliberate limits

- This release accepts only named native TypeScript `MethodDeclaration` nodes carrying an explicit `override` modifier. It deliberately excludes unmarked methods, computed names, accessors, object-literal methods, mixins, indirect ancestors, and all non-TypeScript language syntaxes.
- The resolver requires a uniquely proven direct parent and a unique same-named direct parent method. It does not run TypeScript compiler signature checks, infer virtual dispatch, or choose among overloaded parent methods.

### Comparison notes

- CodeGraph's inspected type and topology-ranking relation sets list `overrides`; its broader callback synthesizers also bridge superclass or interface methods to implementations across multiple languages through heuristic dispatch `calls` edges. SymbolLattice independently adds a first-class, exact-evidence `overrides` edge for its deliberately narrow TypeScript slice.
- SymbolLattice is more explicit in this slice about the extraction token, parent proof, candidate uniqueness, unresolved result, and per-result relation incidence. CodeGraph remains substantially broader in language coverage, dispatch modeling, query composition, and mature relation extraction.

## [0.211.0] - 2026-08-03

### Added

- Direct TypeScript and JavaScript `new Identifier()` syntax now records an `instantiates` pending reference. It becomes an exact graph edge only when the identifier resolves uniquely to a local, imported, or re-exported `class` declaration.
- Bounded `investigate --ranking topology` now treats exactly resolved `instantiates` edges as bidirectional connectivity evidence. `topologySignals.edgeKinds` and `scopedExactIncidentEdgeKindCounts` expand from seven to eight fixed-order kinds.
- Unit, application, graph, and MCP coverage prove exact local, named-import, default-import, and re-export resolution, JavaScript coverage, persistence through `init`, topology incidence diagnostics, and exclusion of heuristic construction edges.

### Compatibility

- Existing SQLite data remains readable, but the artifact-facts extractor version advances to `multi-language-ast-v176`. Run `sync` once on an existing index to re-extract source facts and add eligible construction edges; no database schema migration is required.
- The fixed topology output tuple now appends `instantiates`. Consumers that validate its exact length must accept eight entries. `impact` ranking and traversal keep their existing five eligible edge kinds.

### Deliberate limits

- This release accepts only direct identifier construction with a proven `class` target. It deliberately leaves `new Namespace.Widget()`, computed or call-based constructors, function constructors, ambiguous names, and unimported project-wide name matches unresolved.
- Astro endpoint files retain their route-only projection behavior; their `new Response()` expressions are not promoted into construction graph edges by this release.

### Comparison notes

- CodeGraph's inspected topology/relevance edge set includes `instantiates`. SymbolLattice independently closes the direct TypeScript/JavaScript class-construction slice while exposing per-edge evidence and per-candidate incidence counts.
- CodeGraph remains broader in the inspected relation set, including `overrides`, `returns`, and `type_of`, and this release does not claim parity for their extraction or ranking behavior.

## [0.210.0] - 2026-08-03

### Added

- `investigate --ranking topology` now traverses exactly resolved `extends` and `implements` edges in addition to `calls`, `references`, `routes`, `handles`, and `imports`. Its bounded undirected scope and fixed restart-walk algorithm remain unchanged.
- Every topology-ranked selection now includes `topologySignals.scopedExactIncidentEdgeKindCounts`: one fixed-order count for every eligible relation kind. Counts represent persisted in-scope edge incidences at that candidate; every eligible edge contributes to both endpoints.
- Unit, application, and MCP coverage prove exact hierarchy inclusion, heuristic-edge exclusion, deterministic diagnostic output, and schema validation of the expanded topology contract.

### Compatibility

- `lexical` remains the default ranking; `structure`, `impact`, CLI syntax, SQLite generations, and `init`/`sync` behavior are unchanged. `topologySignals` gains an additive diagnostic field and its fixed `edgeKinds` tuple expands from five to seven kinds.
- Existing indexes remain readable. The next query uses the persisted relations already present in its active generation; no schema migration or reindex is required for this ranking-only change.

### Deliberate limits

- Hierarchy evidence is accepted only where the active graph already has an exactly resolved persisted `extends` or `implements` edge. This does not infer virtual dispatch, runtime mixins, semantic type compatibility, or relationships absent from the indexed graph.
- The relation incidence counts explain retained evidence but do not introduce multi-edge weighting. Scores remain bounded, query-seeded, neighbor-deduplicated, non-restart connectivity values rather than probabilities or completeness claims.

### Comparison notes

- CodeGraph's inspected relevance path includes hierarchy relations among a broader set of graph evidence. SymbolLattice independently closes this specific static-ranking gap while preserving explicit bounds and per-candidate evidence counts.
- SymbolLattice is more explicit here about exactly which retained edge kinds touched each candidate. CodeGraph remains broader in relation coverage, query composition, dynamic-dispatch handling, and mature relevance tuning; this release narrows one auditable parity gap rather than claiming full parity.

## [0.209.0] - 2026-08-03

### Added

- `investigate --ranking topology` now reorders persisted lexical candidates through a bounded undirected scope of exactly resolved `calls`, `references`, `routes`, `handles`, and `imports` relations. The scope expands at most three hops and 500 symbols from at most 64 lexical seeds, then runs 20 deterministic restart-walk iterations with a 0.2 restart probability.
- Topology-ranked selections expose additive `topologySignals`: seed state and truncation, retained scope and neighbor counts, every fixed bound, the exact edge-kind set, relative non-restart connectivity score, and explicit node/depth boundary state. Direct restart mass is removed from the score so an isolated lexical seed cannot gain a synthetic topology boost.
- The CLI accepts `--ranking topology`; the read-only `symbol_lattice_investigate` MCP input and output schemas advertise and validate the same mode.

### Compatibility

- `lexical` remains the default ranking; `structure` and `impact` behavior are unchanged. `InvestigationSelection` gains the additive `topologySignals` field, which is `null` unless `bounds.ranking` is `topology`.
- SQLite schema, index generations, `init`/`sync`, source-search retrieval, worker isolation, and MCP read-only behavior are unchanged.

### Deliberate limits

- Topology ranking begins with persisted lexical declaration candidates; it does not create candidates from arbitrary graph nodes. It uses only exact static evidence and does not infer dynamic dispatch, runtime behavior, semantic similarity, or an unbounded whole-project ranking.
- `topologySignals.score` is a relative bounded connectivity signal, not a probability, confidence level, FTS score, or completeness claim. The depth and visited-symbol flags disclose scope boundaries rather than silently treating omitted nodes as unrelated.

### Comparison notes

- The checked CodeGraph exploration path uses an undirected RWR/personalized-PageRank-style connectivity signal over a broader relation set as part of a richer FTS, impact, and source-composition workflow. SymbolLattice independently adds the same class of bounded query-seeded topology evidence while exposing each candidate's scope, seed, edge, and boundary state directly.
- SymbolLattice is stronger here for a compact, structured, audit-oriented selection record and for suppressing isolated-seed restart mass. CodeGraph remains broader in relation coverage, query composition, dynamic-dispatch handling, and mature relevance tuning; this release narrows one ranking gap rather than claiming full parity.

## [0.208.0] - 2026-08-03

### Added

- Every general `impact` response now includes `summary`: deterministic grouping of exactly the returned impact terminals by their own file, including nearest depth and the final discovery edge for each terminal.
- `summary.entrypointCoverage` returns only persisted route or non-HTTP entrypoint records whose synthetic symbol and binding edge are the terminal step of a retained path. It does not infer coverage from another symbol in the same file or an intermediate path node.
- Added the read-only, idempotent `symbol_lattice_impact` MCP tool. It accepts an exact reference plus a bounded 1–3 hop depth and 1–100 returned paths, uses the existing MCP read-query executor, and is dispatched by the compiled read-only worker.
- The worker-generation verification now proves that a real worker can execute the new `impact` tool without an in-process fallback.

### Compatibility

- Runtime JSON from the existing CLI and service `impact` query gains the additive `summary` field. TypeScript integrations that construct `ImpactResult` values directly must provide it.
- Existing general impact traversal semantics, direct CLI depth validation, SQLite schema, index generations, `init`/`sync`, and automatic-sync behavior are unchanged.

### Deliberate limits

- `summary` is a report of the returned path set, not a claim that every dependency in the graph was traversed. If `truncated` is true after an explicit path limit, callers must treat the groups and endpoint coverage as partial.
- General impact still follows resolved static relations and is not relabeled as exact-only evidence. The separate `investigate --ranking impact` path remains the bounded exact-only ranking feature.
- The standalone MCP tool caps depth at three and returned paths at 100 so its worker response stays bounded. It neither initializes nor refreshes an index.

### Comparison notes

- The inspected CodeGraph `formatImpact` presents affected symbols grouped by file. SymbolLattice independently adds the same file-oriented reading mode while retaining structured terminal evidence and route/non-HTTP entrypoint coverage for the exact returned records.
- CodeGraph remains broader in FTS, RWR/personalized PageRank, overall impact computation, dynamic-dispatch handling, and mature query ergonomics. The new SymbolLattice summary improves explainability for one bounded static result; it does not establish broader graph-computation parity.

## [0.207.0] - 2026-08-02

### Added

- `investigate --ranking impact` reorders persisted lexical candidates using bounded reverse-impact evidence through exactly resolved `calls`, `references`, `routes`, `handles`, and `imports` edges. Each candidate retains at most one deterministic shortest path per impacted symbol, up to three hops and 24 paths.
- Every impact-ranked selection returns `impactSignals`: fixed bounds, exact dependent counts, depth buckets, final discovery-edge counts, the disclosed integer score, and a truncation flag. The score is `sum(countAtDepth * (maxDepth - depth + 1))`.
- The CLI accepts `--ranking impact`; the read-only MCP schema advertises the same mode and validates its fixed, complete impact-evidence shape.

### Compatibility

- `lexical` remains the default ranking and `structure` behavior is unchanged. Selection records now add `impactSignals`; it is `null` unless `bounds.ranking` is `impact`. Runtime JSON consumers receive an additive field; TypeScript integrations constructing `InvestigationSelection` must provide it.
- SQLite schema, indexed data, `init`/`sync` behavior, existing query semantics, worker isolation, and default MCP read-only behavior are unchanged.

### Deliberate limits

- Impact ranking begins with persisted lexical candidates. It is not full-graph PageRank, RWR, semantic retrieval, runtime analysis, dynamic-dispatch inference, or a substitute for the existing general impact query.
- Only `exact` static edges count. The fixed three-hop / 24-path bounds report truncation rather than silently treating omitted dependents as absent.

### Comparison notes

- CodeGraph remains broader with FTS, RWR/personalized PageRank, and richer query computation. SymbolLattice independently adds a deterministic static ranking whose evidence and scoring can be inspected item by item.
- For a narrowly bounded static-impact explanation, SymbolLattice is more explicit about retained paths, edge classes, score arithmetic, and truncation. That does not make it broader or more complete than CodeGraph's ranking system.

## [0.206.0] - 2026-08-02

### Added

- The bounded MCP read-query pool ceiling is now eight workers. The process-aware default remains `availableParallelism() - 1` with a lower bound of one, so a small host does not pre-allocate workers it cannot use.
- `SYMBOL_LATTICE_MCP_QUERY_POOL_SIZE` accepts explicit values from `1` through `8`; malformed, zero, or larger values retain the process-aware safe default. The pool still starts one worker and grows only for queued work.
- `npm run benchmark:mcp` now accepts `SYMBOL_LATTICE_BENCHMARK_POOL_SIZE=1..8`. Pool unit coverage fixes the eight-worker ceiling, validates the environment edge, and deterministically drives queued work through every worker slot.

### Compatibility

- MCP request and response contracts, SQLite schema, WAL behavior, graph generations, worker read-only enforcement, fallback policy, and indexing behavior are unchanged. A host with more than five available CPUs may now choose a default capacity above four; set `SYMBOL_LATTICE_MCP_QUERY_POOL_SIZE=4` to retain the previous ceiling explicitly.

### Deliberate limits

- The pool does not eagerly start eight workers, does not cache arbitrary project connections, and still starts at most two workers concurrently. Capacity is a host-local upper bound, not a performance promise or a target number of resident workers.
- This release does not adopt CodeGraph query algorithms, automatic sixteen-worker sizing, shared object caches, throughput thresholds, or cross-machine benchmark claims.

### Comparison notes

- The inspected CodeGraph `QueryPool` can auto-size up to sixteen workers. SymbolLattice independently moves from four to an explicitly verified eight-worker ceiling while preserving CPU awareness, demand-driven expansion, storage-level write refusal, and a bounded fallback path.
- CodeGraph remains broader in worker capacity and query computation. SymbolLattice chooses a smaller ceiling with direct scheduler coverage and a reproducible disposable-fixture benchmark instead of claiming capacity parity.

## [0.205.0] - 2026-08-02

### Added

- `npm run verify:mcp-worker-generation` now runs a disposable end-to-end release verification against the compiled MCP worker. It creates one temporary TypeScript project, initializes generation one, waits for one real worker, proves a worker-backed search, changes the source, runs host-owned `sync`, and proves that same one-worker pool returns generation two.
- The JSON receipt contains only temporary-fixture counts, generation-change truth, redacted pool status, and five assertions: worker readiness, first-generation evidence, post-sync evidence from the same worker, no fallback, and no crash. The temporary project is removed in a `finally` block.
- The verification script is explicitly included in the npm package file list, so the documented command is present in a packed artifact as well as a source checkout.

### Compatibility

- Runtime graph, SQLite, WAL, CLI query, MCP request/response, pool scheduling, and indexing behavior are unchanged. The new verification command requires a prior `npm run build` because it deliberately runs the packaged worker entrypoint.

### Deliberate limits

- This is a deterministic two-generation handoff check, not a throughput benchmark, long-running soak test, arbitrary-project test, held-reader transaction test, manual-checkpoint test, or cross-machine/filesystem guarantee.
- It uses one temporary source file and one worker specifically to prove the persistent-reader path without hiding it behind demand-driven pool growth or compatibility fallback.

### Comparison notes

- CodeGraph already uses dedicated query workers with their own WAL readers. SymbolLattice now has a first-party, reproducible proof that its independently designed compiled worker sees a host `sync` generation transition through the real MCP pool path.
- CodeGraph remains broader in query computation, worker capacity, caching, and production maturity. This release validates a narrow correctness contract rather than claiming equivalent system scale.

## [0.204.0] - 2026-08-02

### Added

- Every writable `SqliteGraphStore.initialize` now asks SQLite for WAL only after its schema transaction has completed successfully. New graphs receive WAL, and a valid legacy graph converts in place on its next successful initialization without replacing its active generation or requiring a reindex.
- The store deliberately relies on SQLite's returned journal mode: a target that cannot adopt WAL retains its existing mode. This release does not change `synchronous`, checkpoint, locking, schema-version, generation, or source-evidence settings.
- Integration coverage proves a real WAL reader holds its original active-generation snapshot while a writer commits a new generation, then observes the new generation after its transaction ends. It also proves an existing graph can convert from `DELETE` to `WAL` while retaining its snapshot.

### Compatibility

- The SQLite schema, public CLI and MCP contracts, retained-history format, reader lifecycle, and indexing semantics are unchanged. WAL is a persistent database journal setting, so an existing local index may switch mode after a successful explicit `init`, `index`, or `sync`.
- A filesystem or SQLite build that leaves a non-WAL journal mode remains usable under that existing mode. A writer blocked by an active rollback-journal reader retains SQLite's existing lock/error behavior; this release does not hide, retry, or weaken that boundary.

### Deliberate limits

- WAL remains a same-machine local SQLite capability. Network filesystems, multi-writer coordination, manually scheduled checkpoints, tuned `wal_autocheckpoint`, and `synchronous=NORMAL` are intentionally out of scope.
- The worker pool stays bounded at four processes, project-path overrides stay short-lived, and each read request keeps its own committed snapshot. WAL does not add a shared object cache, a live-source path, or implicit indexing.

### Comparison notes

- CodeGraph already pairs worker-owned WAL readers with a larger query pool and FTS/RWR/PageRank/impact execution. SymbolLattice independently closes the WAL storage baseline with explicit generation-snapshot coverage, while retaining a smaller, bounded worker model and storage-level write refusal.
- This does not establish cross-project latency parity. Query algorithms, fixtures, connection counts, hardware, output shaping, and benchmark harnesses remain different.

## [0.203.0] - 2026-08-02

### Added

- A read-query worker now gives its default project one lazily opened persistent read-only `DatabaseSync` connection. Each graph-store operation still opens and commits a fresh SQLite snapshot, so no request carries a previous generation into the next request.
- `SqliteGraphStore` accepts `persistentReadProjectPath` for this bounded one-project lifecycle, exposes idempotent `close()`, and reopens the connection lazily if another read follows closure. Project-path overrides keep the original short-lived reader behavior.
- `SqliteGraphStore` also accepts `readOnly: true`, which rejects schema initialization and projection replacement. Query workers use both options, making their read-only storage boundary enforceable below the MCP tool allowlist.
- Integration coverage proves connection opening, committed-generation visibility through the same reader, idempotent close/reopen, and write refusal. Worker teardown explicitly attempts to release its retained reader.

### Compatibility

- SQLite schema, graph generations, retained-history format, CLI arguments, MCP request/response schemas, and non-worker graph-store behavior are unchanged. Existing callers get per-operation read connections unless they opt into the bounded persistent default-project path.

### Deliberate limits

- This release does not enable or require WAL mode, add cross-process connection sharing, cache graph objects, retain connections for arbitrary project paths, or change snapshot consistency. A project-path override deliberately remains transient.
- A retained connection does not bypass index freshness. It reads only the database's next committed active generation and never triggers `init`, `index`, `sync`, watcher activity, or live-source substitution.

### Comparison notes

- CodeGraph's worker-owned WAL readers remain broader: they are paired with persistent reader infrastructure and a richer FTS/RWR/PageRank/impact query engine. SymbolLattice independently adds the narrower safe lifecycle first, including an explicit per-request snapshot boundary and storage-level write refusal.
- The projects still cannot be compared directly on latency: their query semantics, fixture size, runtime, database setup, and output construction differ. The local benchmark remains a regression baseline rather than a cross-project claim.

## [0.202.0] - 2026-08-02

### Added

- `npm run benchmark:mcp` creates a fixed 48-file TypeScript fixture in a temporary directory, indexes only that disposable graph, runs warm-up plus sequential and concurrent worker-pool reads, then removes the whole fixture. It never accesses a user-selected project.
- The JSON benchmark contract reports nearest-rank P50/P95 latency, minimum/mean/maximum latency, error and fallback counts, redacted before/after pool diagnostics, and a bounded main-process event-loop-delay sample. A worker readiness failure, error response, or fallback produces a non-zero exit after the report is emitted.
- Environment controls make the load shape explicit and bounded: `SYMBOL_LATTICE_BENCHMARK_POOL_SIZE=1..4`, `SYMBOL_LATTICE_BENCHMARK_CONCURRENCY=1..16`, `SYMBOL_LATTICE_BENCHMARK_REQUESTS=1..512`, and `SYMBOL_LATTICE_BENCHMARK_WARMUP=1..64`.
- The metrics implementation has deterministic unit coverage for percentile, fallback, error, empty-input, and invalid-latency behavior. A release smoke run exercises real compiled workers against the disposable indexed graph.

### Deliberate limits

- This is a reproducible local baseline, not a benchmark claim across machines, Node versions, disks, source trees, or MCP clients. It records measurements rather than enforcing timing thresholds.
- The fixture is intentionally small and synthetic. It demonstrates pool scheduling, worker expansion, response success, fallback avoidance, and host responsiveness; it is not a substitute for a production-scale corpus, CPU/RSS profiling, or a CodeGraph-versus-SymbolLattice shootout.
- The benchmark is read-only after fixture initialization. It does not alter graph query semantics, persistence policy, SQLite connection lifetime, ranking, or user-project data.

### Comparison notes

- CodeGraph remains ahead in persistent worker-side WAL readers and broader CPU-heavy query computation. This release closes an important verification gap on the SymbolLattice side by making its own worker-pool behavior repeatable and observable under a declared workload.
- The two projects do not yet share a fixture, query semantics, hardware envelope, or reporting harness, so their latency values must not be compared directly.

## [0.201.0] - 2026-08-02

### Added

- `symbol_lattice_query_pool_status` is now registered by the CLI's pooled MCP host. It returns only host-local pool state, capacity, worker/queue counts, crash count, and fallback counters; it contains no project path, query text, source, symbol, or graph data.
- `McpReadQueryPool.queryPoolStatus()` exposes the same typed snapshot for programmatic hosts. Its state distinguishes `warming`, `ready`, `recovering`, `degraded`, and `closed` without relying on logs or hidden globals.
- Fallback counters distinguish cold-start, unavailable pool, queue timeout, exhausted worker failure, invalid worker response, and unsupported operation. Tests prove the snapshot is redacted, queue state is truthful, and the MCP status tool is host-owned rather than a graph-worker request.

### Corrected

- A timed-out request now enters its compatibility fallback exactly once. If its worker replies later, the result merely returns that worker to the idle pool and cannot race with or overwrite the already selected fallback response.

### Compatibility

- SQLite schema, graph generations, CLI arguments, and existing MCP tool schemas are unchanged. The new MCP status tool appears only on a host that explicitly owns the pooled executor; legacy direct embeddings retain their existing tool list.

### Deliberate limits

- Counters are process-lifetime observations, not persisted telemetry, billing, tracing, timing percentiles, or cross-host aggregation. They deliberately omit all project and request identifiers.
- The status endpoint observes the pool only; it does not probe workers, retry work, start a pool, read a graph, or alter automatic-sync behavior.

### Comparison notes

- The inspected CodeGraph `QueryPool` exposes internal size, live-worker, health, and readiness getters, but the reviewed MCP path did not establish a corresponding public pool-status tool. SymbolLattice independently makes a smaller, redacted host status contract available through MCP.
- CodeGraph still has the broader and more mature execution path: persistent worker-side readers and CPU-heavy FTS/RWR/PageRank/impact computation. SymbolLattice's advantage here is a narrowly scoped, explicitly non-content-bearing operational contract and a tested late-result fallback rule.

## [0.200.0] - 2026-08-02

### Added

- The CLI `serve --mcp` host now owns a bounded read-query worker pool. It starts one worker eagerly, grows only when ready workers cannot satisfy queued work, and caps concurrency at four workers. `SYMBOL_LATTICE_MCP_QUERY_POOL_SIZE=1..4` provides a deliberate host-local override.
- A worker receives only one serializable request for an existing read-only MCP graph tool. It constructs a separate read-only SymbolLattice service, so it has no `init`, `index`, `sync`, watcher, owner-lease, or diagnostic-journal capability.
- The MCP server now has an injectable read-query execution seam. Every graph retrieval tool can use it, while auto-sync status, diagnostics, and journal endpoints stay on the host-owned service path.
- Pool coverage proves cold-start fallback, demand-driven growth, one-crash retry, worker-size validation, and MCP dispatch separation. A built-worker smoke check proves the compiled file can answer a read request off the transport process.

### Compatibility

- SQLite schema, graph generations, CLI request shapes, and MCP tool schemas are unchanged. No reindex or migration is required.
- `createMcpServer`, `startMcpServer`, and legacy programmatic `serveMcp` retain their direct-service behavior unless a caller explicitly supplies an executor. The CLI MCP host opts into the pooled executor.

### Deliberate limits

- A worker opens the existing SQLite store through the normal read-only service methods; it does not cache or mutate a database connection, observe host-only watcher state, or claim live-source truth.
- Before the first worker is ready, after an exhausted crash budget, or after a 45-second queue wait, the request falls back to the existing in-process handler. This favors an available, equivalent read over a hidden failure.
- The pool does not alter search, traversal, ranking, source bounds, or graph semantics. It is execution isolation only.

### Comparison notes

- The inspected CodeGraph path uses a separate query worker pool with worker-owned WAL readers for CPU-heavy FTS, RWR/personalized PageRank, impact analysis, and response construction. SymbolLattice independently adds a smaller, bounded worker protocol around its persisted read tools; it does not copy CodeGraph's pool or claim its broader scoring model.
- SymbolLattice now explicitly confines every worker to a serializable read-tool allowlist and preserves a tested compatibility fallback to the main-process handler. This is stronger for this narrow capability boundary and failure transparency; CodeGraph remains broader in query computation and persistent reader design.

## [0.199.0] - 2026-08-02

### Added

- `investigate` now accepts an explicit `ranking` strategy. The backwards-compatible `lexical` default preserves the persisted FTS ordering; optional `structure` ranks candidates by disclosed direct exact callers, direct exact callees, and an export bonus before falling back to lexical rank.
- Each selected candidate now returns `selectionRank` and `structuralSignals`. The score is exactly `callerCount + calleeCount + (isExported ? 1 : 0)` and never incorporates undisclosed FTS weights, LLM output, runtime guesses, or dynamic dispatch.
- CLI `investigate --ranking lexical|structure` and MCP `symbol_lattice_investigate` expose and validate the same choice. Service, CLI, and MCP integration coverage proves default preservation, structural reordering, signal disclosure, forwarding, and invalid-value rejection.

### Compatibility

- Existing `investigate` callers retain the `lexical` order unless they explicitly request `structure`. The response additions are generation-bound and require neither a schema migration nor a reindex.

### Deliberate limits

- `structure` uses only direct edges whose persisted resolution is `exact` and whose kind is `calls`, `references`, `routes`, or `handles`. It is not a global graph-centrality algorithm, multi-hop score, semantic search, PageRank, or inferred runtime model.
- Lexical source rank remains the deterministic tie breaker for equal structural scores, so equally supported candidates keep the index's FTS ordering.

### Comparison notes

- The inspected CodeGraph explore worker combines FTS, RWR/personalized PageRank, impact analysis, and output building. SymbolLattice now has an independently implemented, auditable static ranking slice, but it does not claim equivalence to CodeGraph's propagation or query-quality model.
- SymbolLattice exposes the whole small scoring formula and each signal with the selected answer. That is stronger for explaining this narrow ranking decision; CodeGraph remains broader in structural ranking and concurrent MCP query execution.

## [0.198.0] - 2026-08-02

### Added

- `SymbolLatticeService.investigate(projectPath, query, options)` now returns a `declarations` array aligned with deterministic selected-symbol order. Every item carries an exact persisted declaration range, source availability, full range size, and honest truncation state.
- Every investigation response discloses `bounds.declarationSource`: 200 physical source lines and 16,000 UTF-16 code units per selected declaration. The source is a prefix only when `truncated` is true; it is never read from the live filesystem.
- The read-only CLI and `symbol_lattice_investigate` MCP output now expose the same bounded declaration evidence. Service, CLI, and MCP coverage proves the active-generation path, live-source staleness, response cap, and schema propagation.

### Compatibility

- This is an additive response field and requires no SQLite schema migration or reindex for active source-search generations. Existing CLI and MCP requests keep their options and read-only behavior.

### Deliberate limits

- The response returns selected declaration ranges, not whole files, repositories, generated source, or inferred runtime implementations. A malformed persisted range is reported as unavailable rather than substituted with live content.
- Candidate selection remains persisted lexical retrieval plus exact range overlap. It does not add LLM ranking, RWR/personalized PageRank, dynamic-dispatch inference, or any hidden ranking signal.

### Comparison notes

- The inspected CodeGraph `codegraph_explore` worker path combines FTS, RWR/personalized PageRank, impact analysis, and output building, and it can execute CPU-heavy reads through a bounded WAL-reader worker pool. SymbolLattice now narrows the source-payload gap by returning complete bounded declarations, but it does not yet match CodeGraph's ranking or concurrent query execution.
- SymbolLattice explicitly preserves the lexical-to-symbol selection trail and immutable-generation source limits in the returned contract. This is a focused auditability advantage, not a claim of broader CodeGraph parity.

## [0.197.0] - 2026-08-02

### Added

- `SymbolLatticeService.investigate(projectPath, query, options)` builds one bounded structural response from one persisted source-search/graph generation. It returns lexical source hits, deterministic exact-symbol selection, generation-bound source excerpts, callers, callees, reverse impact, and directed evidence paths without creating or refreshing an index.
- Read-only `investigate <query>` CLI command and capability-gated, idempotent `symbol_lattice_investigate` MCP tool. Both expose independent source-match, selected-symbol, relation, path, and impact bounds.
- Investigation selection discloses the originating source rank, candidate rank, distinct-candidate total, and truncation state. Duplicate symbol candidates are de-duplicated deterministically; a hit with no overlapping declaration remains source evidence only.
- Service, CLI, and MCP integration coverage proves active-generation evidence, stale-source behavior, unavailable source-search rejection, bound validation, argument forwarding, capability gating, and the no-indexing query boundary.

### Compatibility

- No SQLite schema migration or reindex is required for indexes that already have the persisted source-search projection. The new library, CLI, and MCP surfaces are additive.
- A legacy graph-store adapter or old active generation without compatible persisted source search returns `SOURCE_SEARCH_UNAVAILABLE`; an explicit `sync` backfills the projection. Existing `explore`, `context`, and `search` contracts remain unchanged.

### Deliberate limits

- This is lexical retrieval plus static graph expansion, not natural-language semantic ranking. It does not use an LLM, RWR/personalized PageRank, inferred dynamic dispatch, or fabricated symbol candidates.
- Only declarations whose persisted range overlaps a selected lexical match can be expanded. Non-declaration hits remain visible in `search.results` but do not become graph contexts.
- Context uses persisted excerpts and existing bounded traversal; it does not claim complete-file source output or complete codebase reasoning.

### Comparison notes

- The inspected CodeGraph `codegraph_explore` path composes FTS, RWR/personalized PageRank, impact analysis, and response composition for one-question agent context, including relevant source and call paths. SymbolLattice now has an evidence-bound one-query starting point, but does not yet match CodeGraph's semantic ranking or full source-oriented composition.
- SymbolLattice explicitly exposes the lexical-to-symbol selection trail and preserves one active-generation boundary through the returned status, source evidence, and graph context. This improves auditability of this local query surface; it is not a claim of broader overall parity.

## [0.196.0] - 2026-08-02

### Added

- In-project <code>.xcodeproj/project.pbxproj</code> files are now parsed as bounded ASCII/OpenStep configuration evidence. SymbolLattice retains only a native target's direct <code>PBXSourcesBuildPhase</code> membership when its <code>PBXFileReference</code> safely resolves to an indexed source document.
- Swift extraction now persists separate direct type facts and explicit Objective-C extension-selector facts. This keeps a cross-file extension's class identity unresolved until project evidence proves it instead of baking in a name match during extraction.
- A React Native <code>RCT_EXTERN_*</code> bridge now reaches a split Swift class and extension only when the bridge, the explicit <code>@objc(Class)</code> type, and the explicit <code>@objc(selector)</code> extension method share exactly one Xcode native target. The resulting edge includes the participating <code>project.pbxproj</code> path.
- Xcode configuration-only changes now invalidate the graph projection, reuse unchanged SQLite artifact facts, and preserve a missing or ambiguous cross-file target as an explicit unresolved edge. Parser, resolver, and SQLite-backed service tests cover exact, missing, ambiguous, malformed, and changed target evidence.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v175</code>, the project resolver advances to <code>project-resolver-v63</code>, and project index inputs advance to <code>project-inputs-v6</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> refreshes the Swift facts and Xcode configuration evidence.

### Deliberate limits

- This is static project-file evidence, not an Xcode build or type-check. It accepts direct <code>PBXNativeTarget</code> source build phases and safely resolvable <code>PBXFileReference</code> paths through <code>PBXGroup</code> or <code>SOURCE_ROOT</code>. Unsupported or malformed OpenStep syntax, non-source phases, unresolved paths, zero/multiple shared targets, runtime registration, generated code, and type-name-only matches remain unproven.

### Comparison notes

- The inspected CodeGraph baseline has a generic Swift-to-Objective-C selector path and legacy React Native <code>RCT_EXPORT_*</code> support, but no corresponding <code>RCT_EXTERN_*</code> extractor or Xcode target-membership join. SymbolLattice independently adds this bounded three-file proof chain. This is stronger only for this specifically evidenced external-bridge case, not a claim of broader overall React Native or Xcode coverage.

## [0.195.0] - 2026-08-02

### Added

- Swift extraction now retains a direct top-level <code>extension TypeName</code> as a visibly named syntax container and records its direct methods. This preserves the source declaration without falsely representing an extension as inheritance or lexical containment inside the original class declaration.
- A direct extension method can now supply a React Native external-bridge implementation fact only when exactly one direct, top-level class with the same Swift type name appears in the same file and explicitly declares <code>@objc(Class)</code>. The method must still declare one explicit <code>@objc(selector)</code> and have a body.
- The existing resolver consequently projects an exact, inspectable Objective-C external-bridge <code>references</code> edge to a uniquely proven method inside that extension. Extraction, resolver, and SQLite-backed service tests cover queryable extension symbols, same-file proof, cross-file rejection, fact persistence, reopened indexes, and bridge callee queries.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v174</code>; the project resolver remains <code>project-resolver-v62</code> because it already projects uniquely retained Swift Objective-C facts. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> refreshes Swift facts before projecting eligible extension implementations.

### Deliberate limits

- This accepts only a direct top-level extension whose target is one unqualified type identifier; qualified or parameterized target syntax does not form a bridge fact. A bridge fact additionally requires one same-file direct top-level class with the same Swift name and an explicit Objective-C class identity. Cross-file type-name matching, nested targets, bare <code>@objc</code>, inferred selectors, wrappers, generated output, runtime registration, and zero/multi-candidate results remain unproven.

### Comparison notes

- The inspected CodeGraph React Native path covers legacy <code>RCT_EXPORT_*</code> macros and has a separate generic Swift-to-Objective-C selector resolver, but does not extract <code>RCT_EXTERN_*</code> external bridge declarations. SymbolLattice independently expands its bounded external-bridge surface by preserving direct extension declarations and requiring same-file, explicit Objective-C class-and-selector evidence before connecting an <code>RCT_EXTERN_*</code> declaration to an extension method. This is stronger only for this narrowly evidenced interop case, not a claim of broader overall React Native coverage.

## [0.194.0] - 2026-08-02

### Added

- React Native external Objective-C bridge extraction now retains the complete native selector from direct <code>RCT_EXTERN_METHOD</code>, <code>_RCT_EXTERN_REMAP_METHOD</code>, and synchronous external-method macros. For example, <code>createEvent:withFoo:bar:</code> remains distinct from its JavaScript method name.
- Swift extraction now records a source implementation only for a top-level class with one explicit <code>@objc(Class)</code> identity and a direct method with one explicit <code>@objc(selector)</code> identity. Bare attributes and inferred names do not become interop facts.
- Project resolution now emits an exact, inspectable <code>references</code> edge from an external Objective-C bridge method to one unique Swift implementation with the same explicit Objective-C class and selector. Missing and colliding Swift candidates remain explicit unresolved edges with candidate ids.
- SQLite artifact-fact persistence now preserves the Swift Objective-C interop facts. Unit, resolver, and SQLite-backed service coverage prove full selectors, renamed Swift methods, missing/ambiguous candidates, reopened indexes, and bridge-to-Swift callee queries.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v173</code> and the project resolver advances to <code>project-resolver-v62</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> refreshes eligible Objective-C and Swift facts before projecting the new relation.

### Deliberate limits

- This accepts only direct, single-line external bridge macros and direct methods in top-level Swift classes. It does not infer Objective-C identities from Swift names, interpret bare <code>@objc</code>, follow extensions, parse generated/preprocessed output, model runtime registration, or treat a zero/multi-candidate result as exact.

### Comparison notes

- The inspected CodeGraph React Native extractor has no corresponding <code>RCT_EXTERN_*</code>-to-Swift source link. SymbolLattice independently adds a bounded two-step model—JavaScript call to Objective-C bridge declaration, then uniquely proven bridge declaration to Swift implementation—with explicit unresolved evidence for every unsupported or ambiguous case. This is stronger on this narrow, directly evidenced interop surface, not a claim of broader overall React Native coverage.

## [0.193.0] - 2026-08-02

### Added

- Objective-C React Native extraction now recognizes direct <code>RCT_EXTERN_MODULE</code> and <code>RCT_EXTERN_REMAP_MODULE</code> declarations, the conventional bridge surface for Swift or private native classes.
- Direct <code>RCT_EXTERN_METHOD</code>, <code>_RCT_EXTERN_REMAP_METHOD</code>, and <code>RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD</code> declarations now emit exact iOS native-method facts with distinct source-rule evidence. Explicit module and JavaScript-method remaps remain literal and inspectable.
- Unit, project-resolution, and SQLite-backed service coverage prove default and remapped module names, ordinary and synchronous methods, duplicate-name rejection, exact NativeModules projection, fact persistence, reopened indexes, and callers queries.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v172</code>; the project resolver remains <code>project-resolver-v61</code> because the existing literal module-plus-method projection already handles these direct bridge facts. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> refreshes eligible Objective-C bridge declarations.

### Deliberate limits

- This recognizes only a direct bridge-header import, one-line <code>RCT_EXTERN_*</code> declarations, direct identifiers, balanced same-line macro arguments, and unique JavaScript method names within that declaration. It does not parse generated/preprocessed output, wrapped or multiline macros, runtime registration, dynamic names, or link the Objective-C bridge declaration to a Swift class or selector.

### Comparison notes

- The inspected CodeGraph React Native path does not contain <code>RCT_EXTERN_*</code> extraction. SymbolLattice independently adds a conservative Swift-bridge declaration model: it retains literal module-plus-method identity, macro-specific evidence, and exact iOS NativeModules edges, while deliberately leaving actual Swift source linkage for a later evidence-proven slice. This is stronger on this bounded declaration surface, not a claim of broader overall React Native coverage.

## [0.192.0] - 2026-08-02

### Added

- Objective-C React Native extraction now recognizes a direct no-argument <code>RCT_EXPORT_MODULE()</code> by deriving the module name from its implementation class and trimming the documented <code>RCT</code> or <code>RK</code> prefix.
- Direct <code>RCT_REMAP_METHOD(jsName, nativeSelector:...)</code> macros now emit a native method under their explicit JavaScript name. Their symbol containment evidence uses a dedicated remap rule; collisions with direct <code>RCT_EXPORT_METHOD</code> names stay rejected.
- Unit and persisted-service coverage prove RCT and RK default names, remapped JavaScript names, cross-file NativeModules projection, macro-rule evidence, collision rejection, SQLite persistence, and reopen queries.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v171</code> and the project resolver advances to <code>project-resolver-v61</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> refreshes eligible Objective-C facts and bridge projections.

### Deliberate limits

- Extraction still requires one direct bridge-header import, exactly one direct module macro, and direct macro calls in a non-category implementation. It does not infer <code>RCT_EXTERN_*</code> Swift bridges, wrapped macros, generated code, runtime registration, dynamic names, or arbitrary preprocessor expansion.

### Comparison notes

- The inspected CodeGraph React Native resolver recognizes <code>RCT_REMAP_METHOD</code> and an <code>RCT_EXPORT_MODULE()</code> fallback that trims <code>RCT</code>. SymbolLattice independently applies the same direct macro semantics under stricter import/container checks, additionally supports the documented <code>RK</code> prefix, preserves literal module-plus-method identity, and retains every unique iOS target as an exact edge. CodeGraph remains broader in convention-driven matching; this change improves parity for this bounded Objective-C surface.

## [0.191.0] - 2026-08-02

### Added

- React Native Android extraction now recognizes the official Codegen source shape for a Java or Kotlin class with one direct imported or fully-qualified <code>*Spec</code> superclass, a directly proven literal or immutable class-local <code>getName()</code> value, and direct Java <code>@Override</code> or Kotlin <code>override</code> methods.
- A Codegen native-method fact remains a candidate until exactly one project-local TypeScript TurboModule Spec method proves the same literal module-plus-method identity. The resolver then projects dedicated Codegen evidence for NativeModules, direct Registry, TypeScript Spec, default-import, and static default re-export surfaces.
- Tests cover Java and Kotlin candidates, rejected ambiguous Kotlin imports, exact Java/Kotlin targets, default-import and default re-export paths, and both missing and duplicate TypeScript contracts. SQLite-backed indexing and reopen queries retain the verified targets.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v170</code> and the project resolver advances to <code>project-resolver-v60</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> refreshes native facts and bridge projections.

### Deliberate limits

- This does not scan generated build output or model runtime registration. A Codegen edge requires the intersection of a direct Spec superclass, directly proven module name, direct override, and exactly one matching project-local TypeScript contract. Indirect wrappers, dynamic names, Swift, aliases, wildcard imports, and custom macro wrappers remain out of scope.

### Comparison notes

- The inspected CodeGraph JVM React Native parser handles literal <code>getName()</code> values and a class-name fallback. SymbolLattice independently adds a narrower Codegen-specific proof chain that joins native source to one project-local TypeScript contract and keeps zero or duplicate contracts unresolved. This is stronger evidence for this bounded Codegen path, not a claim of broader overall React Native coverage.

## [0.190.0] - 2026-08-02

### Added

- React Native Android extraction now accepts a direct <code>getName()</code> return of one class-local Java <code>static final String</code> or Kotlin companion <code>const val</code> literal, alongside an existing direct literal return.
- The parser keeps the existing direct <code>ReactContextBaseJavaModule</code> superclass and directly imported <code>ReactMethod</code> requirements. It emits a native-method fact only when one eligible constant and one direct <code>getName()</code> declaration prove the module identity.
- Unit coverage proves Java and Kotlin constants, rejects a mutable Java field, and exercises both direct NativeModules and static TurboModule re-export projections. The persisted-service test proves the Java and Kotlin constant forms survive SQLite-backed indexing and caller queries.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v169</code>; the project resolver remains <code>project-resolver-v59</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> refreshes eligible native facts.

### Deliberate limits

- Only a single direct class-local literal constant is accepted. Mutable fields, computed values, aliases, inherited members, nested non-companion objects, multiple declarations, Codegen-generated base classes, runtime registration, and Swift implementations remain excluded.

### Comparison notes

- The inspected CodeGraph React Native parser extracts a literal <code>getName()</code> value and otherwise falls back to the class name. SymbolLattice independently adds a narrowly bounded immutable-local-constant proof while retaining source-rule evidence, direct-import checks, and literal module-plus-method matching. This is broader for the stated constant convention, not a claim of broader overall React Native coverage.

## [0.189.0] - 2026-08-02

### Added

- React Native TurboModule default-import projection now follows a static local default re-export chain after the existing export-surface resolver proves every hop. It supports both <code>export { default } from "./NativeCalendar"</code> and an imported binding immediately re-exported as default.
- The terminal declaration must still retain exactly one direct literal Registry default-export fact. A projected Android or iOS bridge edge now includes the ordered <code>resolutionPath</code> through the barrel files, making the cross-file proof inspectable rather than relying on a method-name guess.
- Unit coverage proves a two-hop chain, Android/iOS fan-out, full evidence path, and rejection of a façade that imports a TurboModule but default-exports a different local wrapper. The persisted-service test proves the same result survives SQLite storage and reopening.

### Compatibility

- The project resolver advances to <code>project-resolver-v59</code>. Raw artifact facts stay compatible; the next explicit <code>sync</code> or <code>index</code> recomputes bridge projections with the new re-export semantics.

### Deliberate limits

- This version does not infer named-export-to-default adapters, namespace spec imports, mutable or computed aliases, custom wrappers, runtime registration, Codegen-generated Android base classes, or iOS/Swift Codegen implementations.

### Comparison notes

- CodeGraph retains generic import and re-export metadata, while its inspected React Native bridge resolver resolves common default-import calls from their bare method name. SymbolLattice independently reuses its deterministic export-surface graph only after a literal terminal Registry proof, retains every barrel hop as evidence, and then matches literal module name plus method name. CodeGraph remains broader across conventions; SymbolLattice is stricter and more auditable for this implemented path.

## [0.188.0] - 2026-08-02

### Added

- Parser-backed React Native TurboModule resolution now follows a direct default import across files when the resolved local target directly default-exports either a literal <code>TurboModuleRegistry.get*</code> result or an immutable local registry binding. This supports the conventional <code>import NativeCalendar from "./NativeCalendar"; NativeCalendar.createEvent()</code> shape without treating arbitrary default imports as bridges.
- Extraction persists default-import call candidates separately from proven default-export identities. Project resolution emits a bridge edge only after the existing exact local module resolver connects the two files and the target has exactly one direct TurboModule default-export fact.
- Default-import bridge edges retain the same module-and-method identity, independent Android/iOS exact targets, and unresolved collision behavior as direct Registry calls. New unit and persisted-service coverage proves target proof, lexical shadow rejection, ordinary-default-import rejection, platform fan-out, SQLite persistence, and re-opened-service queries.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v168</code> and the project resolver advances to <code>project-resolver-v58</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> refreshes eligible source and recomputes React Native bridge projections.

### Deliberate limits

- This version accepts only direct local default exports. Default re-export chains, named exports, namespace imports of a spec file, generated Android TurboModule base classes, iOS/Swift Codegen implementations, runtime registration, indirect/mutable aliases, dynamic or computed names, optional dispatch, and custom wrappers remain excluded.

### Comparison notes

- The inspected CodeGraph React Native resolver strips a caller receiver to its bare method name before matching native candidates, so its broader call surface does not retain a local TurboModule module-file proof at this boundary. SymbolLattice independently follows the project module resolver, requires a direct local default-export registry proof, and then matches by literal module name plus method name while preserving separate Android/iOS edges. CodeGraph remains broader across native conventions; SymbolLattice is stricter and more explainable for the implemented default-import path.

## [0.187.0] - 2026-08-02

### Added

- Parser-backed React Native TurboModule extraction now recognizes direct named or namespace imports of <code>TurboModuleRegistry</code>, literal <code>get</code>/<code>getEnforcing</code> registrations, immutable local registry results, and direct chained registry calls. Lexical shadowing, optional chains, computed access, mutable aliases, and dynamic module names remain outside this surface.
- An exported TypeScript <code>interface Spec extends TurboModule</code> with exactly one literal registry registration now gains queryable method symbols. Each proven spec method retains its module-and-method identity and is independently projected to matching Java, Kotlin, and Objective-C bridge implementations.
- TurboModule caller and spec-contract resolution reuse the multi-platform safety model: every uniquely proven Android and iOS implementation receives its own exact <code>calls</code> edge; missing targets and duplicate same-platform implementations remain explicit unresolved edges with candidate ids.
- New extractor, resolver, capability, and persisted-service coverage proves named and namespace forms, local and chained calls, TypeScript type aliases, spec-method symbols, optional-chain and shadow rejection, platform fan-out, ambiguity handling, SQLite persistence, and re-opened-service queries.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v167</code> and the project resolver advances to <code>project-resolver-v57</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> refreshes eligible source and recomputes React Native bridge projections.

### Deliberate limits

- This is a bounded TurboModule surface, not full Codegen/runtime modeling. Cross-file default-import receivers, generated Android TurboModule base classes, iOS/Swift Codegen implementations, <code>RCT_REMAP_METHOD</code>, runtime registration, indirect/mutable registry aliases, multiple registrations for one spec, dynamic or computed names, optional dispatch, and custom wrappers remain excluded.

### Comparison notes

- The inspected CodeGraph resolver recognizes TurboModule spec text and then matches native methods by method spelling across native candidates. SymbolLattice independently requires direct React Native import proof, an exported direct <code>TurboModule</code> interface, and exactly one literal registry registration before projecting a spec contract; it also keeps the literal module name and preserves distinct Android/iOS edges. CodeGraph still covers broader native/TurboModule conventions; SymbolLattice is stricter and more auditable for this implemented Registry-and-spec subset.

## [0.186.0] - 2026-08-02

### Added

- Parser-backed React Native NativeModules bridge extraction now connects direct JavaScript/TypeScript calls to native implementations by both literal module name and method name. Direct named and namespace imports from <code>react-native</code> are lexical-binding aware, so shadowed names, computed access, optional chains, and dynamic member access do not enter the bridge surface.
- Android support accepts one direct Java or Kotlin <code>ReactContextBaseJavaModule</code> class, one literal <code>getName</code> return value, and direct imported or fully-qualified <code>ReactMethod</code> annotations. Objective-C support accepts a direct <code>RCTBridgeModule</code> header import, one direct <code>RCT_EXPORT_MODULE</code>, and unique direct <code>RCT_EXPORT_METHOD</code> macros.
- Project resolution now emits an exact <code>calls</code> edge for every independently unique Android and iOS implementation. It retains both platform targets instead of silently preferring one; duplicate implementations on one platform remain explicit unresolved edges with their candidate ids.
- New extractor, resolver, capability, and persisted-service coverage proves lexical shadow rejection, dynamic-access rejection, Java/Kotlin/Objective-C extraction, exact multi-platform edges, ambiguity handling, SQLite fact persistence, and re-opened-service queries.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v166</code> and the project resolver advances to <code>project-resolver-v56</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> re-extracts eligible React Native source and recomputes bridge projections.

### Deliberate limits

- This is a bounded NativeModules bridge surface, not full React Native runtime modeling. TurboModule/codegen specs, runtime registration, Java/Kotlin aliases and wildcard imports, indirect or constant-derived module names, inherited or wrapper native modules, Objective-C <code>RCT_REMAP_METHOD</code>, Swift modules, custom macro wrappers, computed/optional JavaScript access, and dynamic dispatch remain excluded.

### Comparison notes

- The inspected CodeGraph React Native resolver strips a JavaScript receiver to a bare method name, then chooses an Objective-C target when both iOS and Android candidates exist, at <code>0.6</code> confidence. SymbolLattice independently requires direct import proof plus module-and-method identity, records independent exact platform edges, and keeps same-platform collisions unresolved. CodeGraph covers additional conventions in its own resolver; SymbolLattice is stricter and more explainable for this bounded cross-platform bridge surface.

## [0.185.0] - 2026-08-02

### Added

- Parser-backed Spring Web extraction now expands one direct class-level <code>@RequestMapping</code> path into one or more exact prefixes. Java accepts a single literal or literal <code>{ ... }</code> array; Kotlin accepts a single literal or literal <code>[ ... ]</code> collection, in positional, <code>path =</code>, or <code>value =</code> form.
- Every unique class prefix is cross-producted with every already-proven direct local method route, including the explicit multi-<code>RequestMethod</code> surface added in v0.184. Trailing-slash-equivalent, duplicate prefixes are rejected before a duplicate route can enter the graph.
- New unit and persisted-service coverage proves Java/Kotlin class-prefix expansion, multi-prefix × multi-method combinations, canonical path joining, method-filtered route queries, and rejection of duplicate or conditional class mappings.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v165</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> re-extracts eligible Java and Kotlin Spring controller artifacts under the expanded class-prefix surface.

### Deliberate limits

- This remains a bounded static Spring route surface. Method-level path arrays, default/ALL mappings, empty or duplicate method collections, headers, params, consumes, produces, custom/composed annotations, aliases/wildcard imports, dynamic or escaped paths, class-path conditions, profiles, security, proxy registration, and deployed routing behavior remain excluded.

### Comparison notes

- The inspected CodeGraph Spring resolver uses <code>parseMappingPath</code>, which selects the first quoted path when deriving a class prefix before it joins method routes. SymbolLattice independently parses and cross-products every non-ambiguous literal class prefix while retaining the source-ranged, language-specific exact handler evidence for each route. CodeGraph remains more permissive in general; SymbolLattice is more complete for this static literal collection subset.

## [0.184.0] - 2026-08-02

### Added

- Parser-backed Spring Web extraction now splits one direct method-level <code>@RequestMapping</code> into one exact route per unique, imported or fully-qualified <code>RequestMethod</code> enum. Java accepts a single enum or a literal <code>{ ... }</code> array; Kotlin accepts a literal <code>[ ... ]</code> collection.
- Every emitted Java or Kotlin route keeps the existing local-handler relation, source range, syntax-stage evidence, and language-specific rule id. The mapping path remains one static <code>path =</code> or <code>value =</code> literal, or inherits the proven class prefix when omitted.
- New unit and persisted-service coverage proves Java/Kotlin multi-method route splitting, method-filtered route queries, unique handler evidence, and rejection of missing imports, empty or duplicate collections, extra request conditions, dynamic values, and unsupported enums.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v164</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> re-extracts eligible Java and Kotlin Spring controller artifacts under the expanded <code>RequestMapping</code> method surface.

### Deliberate limits

- This remains a bounded static Spring route surface. Default/ALL mappings, empty or duplicate arrays, headers, params, consumes, produces, custom/composed annotations, aliases/wildcard imports, dynamic or escaped paths, class-path conditions, profiles, security, proxy registration, and deployed routing behavior remain excluded.

### Comparison notes

- The inspected CodeGraph Spring resolver continues to use text patterns and may produce a broad default method when no explicit <code>method =</code> value is found. SymbolLattice independently splits only parser-proven, explicit, unique enum values into routes, retaining evidence for every resulting handler edge. CodeGraph remains more permissive; SymbolLattice is stricter and more auditable for this supported subset.

## [0.183.0] - 2026-08-02

### Added

- Parser-backed Spring Web extraction now supports one direct method-level <code>@RequestMapping</code> route on both Java methods and Kotlin functions. The mapping requires one exact imported or fully-qualified <code>RequestMethod</code> enum: <code>GET</code>, <code>POST</code>, <code>PUT</code>, <code>PATCH</code>, <code>DELETE</code>, <code>HEAD</code>, <code>OPTIONS</code>, or <code>TRACE</code>.
- The optional method route path is one static <code>path =</code> or <code>value =</code> literal; an omitted method path inherits the parser-proven class prefix. Java and Kotlin use distinct evidence rules so a route can be traced to its declaration form as well as its exact local handler.
- New unit and persisted-service coverage proves all supported request methods, imported and fully-qualified annotation/enum forms, inherited prefixes, exact handler relations, and Java/Kotlin persisted route queries. Missing enum proof, wildcard/alias import gaps, multi-method arrays, extra conditions, unsupported enum values, and unqualified default mappings remain non-routes.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v163</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> re-extracts eligible Java and Kotlin Spring controller artifacts under the <code>RequestMapping</code> method surface.

### Deliberate limits

- This is not full Spring request-condition evaluation. The slice excludes method-level default/ALL mappings, multiple methods, arrays with more than one method, headers, params, consumes, produces, custom/composed annotations, aliases/wildcard imports, dynamic or escaped paths, class-path conditions, profiles, security, proxy registration, and deployed routing behavior.

### Comparison notes

- The inspected CodeGraph Spring resolver extracts Java and Kotlin method-level <code>@RequestMapping</code> using a text pattern and assigns a default broad method when it cannot find a <code>method =</code> value. It remains broader for permissive syntax. SymbolLattice independently accepts only an AST-proven exact enum, static path shape, controller, and local concrete handler, then records containment, range, rule id, stage, and confidence. SymbolLattice is stricter and more auditable for this supported subset.

## [0.182.0] - 2026-08-02

### Added

- Parser-backed Spring Web extraction now supports direct Kotlin controller routes. A direct top-level concrete class with one exact imported or fully-qualified <code>@RestController</code> or <code>@Controller</code> may contribute routes from one literal class <code>@RequestMapping</code> and one literal direct-function <code>@GetMapping</code>, <code>@PostMapping</code>, <code>@PutMapping</code>, <code>@PatchMapping</code>, or <code>@DeleteMapping</code> annotation.
- Each accepted route is contained by its controller class and links with <code>exact</code> / <code>1.0</code> evidence to the direct concrete Kotlin function that handles it. Bare mappings, positional literals, and one <code>path =</code> or <code>value =</code> literal are supported; route-path joining is canonical and shared with the Java contract.
- New unit, framework-capability, and persisted-service coverage proves imported and fully-qualified annotations, GET/POST/PUT/PATCH/DELETE routes, expression and block function bodies, source-search filtering, exact route evidence, and rejection of missing proof, wildcard imports, dynamic or multi-attribute paths, Kotlin objects, abstract functions, plain classes, and method-level <code>@RequestMapping</code>.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v162</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> re-extracts eligible Kotlin artifacts under the Spring Web route surface.

### Deliberate limits

- This is not general Kotlin or Spring route discovery. Nested declarations, Kotlin <code>object</code> controllers, interfaces, abstract/top-level functions, aliases/wildcard imports, composed annotations, dynamic/raw/escaped strings, arrays, multiple conditions, method-level <code>@RequestMapping</code>, runtime proxy registration, profiles, conditions, security, media types, path-variable semantics, and deployment routing remain outside analysis.

### Comparison notes

- The inspected CodeGraph Java framework resolver recognizes Spring Java and Kotlin source with text patterns and includes method-level <code>@RequestMapping</code> handling. It remains broader for permissive syntax coverage. SymbolLattice implements an independent AST-only Kotlin subset that proves the exact controller, annotation type, literal path shape, local concrete function, containment, source range, and evidence rule. For the supported surface SymbolLattice is more auditable; CodeGraph remains functionally broader.

## [0.181.0] - 2026-08-02

### Added

- Direct concrete Kotlin <code>@Bean</code> functions inside direct <code>@Configuration</code> classes now contribute parser-backed Spring <code>@ConfigurationProperties</code> literal-prefix facts. The existing method symbol owns each relation, making factory-method configuration impact queries traceable to the declaration.
- Kotlin annotation proof now understands both bare marker spellings and invoked annotations. <code>@Configuration</code>, <code>@Bean</code>, and <code>@ConfigurationProperties</code> each require an exact direct import or a fully-qualified name; the accepted prefix remains one positional literal or one <code>prefix =</code> literal.
- New unit, capability, and service coverage proves imported and fully-qualified Kotlin annotations, expression and block function bodies, exact function ownership, missing-configuration/bean rejection, abstract-function rejection, wildcard rejection, Kotlin-object exclusion, source-value omission, and unchanged-artifact reuse after configuration withdrawal.
- The durable SQLite journal bound test now declares a 120-second semantic-test timeout for its intentional 130-event persistence workload. Product journal behavior is unchanged.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v161</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> or <code>index</code> re-extracts eligible Kotlin artifacts under the factory-method surface.

### Deliberate limits

- This is not general Kotlin or Spring bean discovery. The slice excludes factory functions outside direct <code>@Configuration</code> classes, Kotlin <code>object</code> factories, nested classes, abstract/interface/top-level functions, meta-annotations, aliases/wildcard imports, <code>value =</code>, multiple attributes, nonliteral prefixes, return-type inspection, profiles, imports, precedence, validation, environment overrides, and runtime registration or binding behavior.

### Comparison notes

- The inspected CodeGraph Spring binding path uses one Java/Kotlin text pattern for <code>@ConfigurationProperties</code>, so it can recognize a function annotation without proving the factory owner. SymbolLattice independently requires the AST-proven <code>@Configuration</code> -> concrete <code>@Bean</code> -> literal <code>@ConfigurationProperties</code> chain and records the function owner, range, per-leaf candidates, and unresolved ambiguity. CodeGraph remains broader; SymbolLattice is more specific and auditable for supported Kotlin factory functions.

## [0.180.0] - 2026-08-02

### Added

- Direct concrete Java <code>@Bean</code> methods inside direct <code>@Configuration</code> classes now contribute parser-backed Spring <code>@ConfigurationProperties</code> literal-prefix facts. The graph uses the existing method symbol as the source owner, making factory-method configuration impact queries traceable to the declaration.
- All three Spring annotations must be an exact direct import or a fully-qualified name. The accepted prefix remains one positional literal or one <code>prefix =</code> literal; the existing per-leaf YAML/properties resolver, confidence <code>0.85</code>, explicit ambiguity, source-value omission, and explicit-sync re-projection are reused unchanged.
- New unit, capability, and service coverage proves imported and fully-qualified annotations, exact method ownership, missing-configuration/bean rejection, abstract-method rejection, wildcard rejection, source-value omission, and unchanged-artifact reuse after configuration withdrawal.

### Deliberate limits

- This is not general Spring bean discovery. The slice excludes <code>@Bean</code> methods outside direct <code>@Configuration</code> classes, Kotlin factory methods, nested classes, abstract/interface methods, meta-annotations, aliases/wildcard imports, <code>value =</code>, multiple attributes, nonliteral prefixes, factory return-type inspection, profiles, imports, precedence, validation, environment overrides, and runtime registration or binding behavior.

### Comparison notes

- The inspected CodeGraph Spring binding path uses one Java/Kotlin text pattern for <code>@ConfigurationProperties</code>, so it can recognize method annotations without proving an owner. SymbolLattice independently requires the AST-proven <code>@Configuration</code> → concrete <code>@Bean</code> → literal <code>@ConfigurationProperties</code> chain and records the method owner, range, per-leaf candidates, and unresolved ambiguity. CodeGraph remains broader; SymbolLattice is more specific and auditable for supported factory methods.

## [0.179.0] - 2026-08-02

### Added

- Direct top-level Java <code>record</code> declarations now contribute parser-backed Spring <code>@ConfigurationProperties</code> literal-prefix facts. One positional literal or one <code>prefix =</code> literal on an exact imported or fully-qualified annotation is retained against the record's class-like symbol owner.
- The existing per-leaf configuration resolver is reused unchanged: every unique descendant YAML or <code>.properties</code> key is a <code>heuristic</code> <code>0.85</code> record-to-key relation, while collisions and missing prefixes stay explicit unresolved evidence. Configuration values remain absent from facts and graph evidence.
- New unit, capability, and service coverage proves imported and fully-qualified forms, positional and named prefix literals, exact record ownership, nested-record exclusion, unsupported-form rejection, source-value omission, and explicit-sync withdrawal while the Java artifact is reused.

### Deliberate limits

- This is a declaration-level, direct-top-level Java record slice, not general Spring constructor binding. Nested records, canonical constructors, record methods, <code>value =</code>, multiple attributes, aliases, wildcard imports, escaped or dynamic prefixes, collections, field ownership, profiles, imports, precedence, validation, environment overrides, and runtime behavior remain outside analysis.

### Comparison notes

- The inspected CodeGraph Spring binding path recognizes <code>@ConfigurationProperties</code> with a text pattern shared across Java/Kotlin. SymbolLattice independently uses the Java record AST plus exact import/fully-qualified proof and has narrower syntax coverage, but preserves record ownership, source range, each candidate leaf, and unresolved ambiguity as graph evidence. CodeGraph remains broader; SymbolLattice is more auditable at this static boundary.

## [0.178.0] - 2026-08-02

### Added

- Parser-backed Spring <code>@Value</code> facts now include components on direct top-level Java <code>record</code> declarations. The shared graph has no separate record kind, so each accepted record is intentionally represented as a class-like symbol.
- A narrowly scoped modern Java grammar is used only to prove record ownership, imports, component annotations, and literal placeholder form; the established Lezer Java extractor continues to handle ordinary classes and routes. Record spans also protect the legacy path from misclassifying nested record components as enclosing-class methods while preserving unaffected enclosing-class facts.
- Record-component facts reuse exact-import/fully-qualified annotation proof, literal and relaxed configuration-key resolution, collision-safe unresolved evidence, source-value non-retention, explicit-sync projection behavior, and unchanged-artifact reuse.
- New extraction, capability, and service coverage proves imported and fully-qualified records, exact and relaxed resolution, class-like callers, source-value omission, explicit-sync withdrawal, rejection of named/wildcard/dynamic/nested forms, and preservation of an outer class's unaffected direct facts.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v158</code>; the project resolver remains <code>project-resolver-v55</code>. Existing graphs and SQLite schema remain readable, while the next explicit <code>sync</code> or <code>index</code> re-extracts eligible Java artifacts under the record-component surface.

### Deliberate limits

- This is not general Java record or Spring constructor analysis. Only direct top-level record components qualify. Nested records, canonical constructors, record methods, component/accessor symbols, declaration-level <code>@Value</code>, <code>@ConfigurationProperties</code> records, aliases, wildcard imports, named arguments, expressions, escaped strings, nested placeholders, profiles, precedence, validation, collection binding, and values remain outside analysis.

### Comparison notes

- CodeGraph's inspected Java Spring path uses a broad text regex around <code>@Value</code>, which can cover more placements but does not prove modern Java record ownership, exact annotation type, import binding, argument shape, or nesting. SymbolLattice independently adds the narrow direct-top-level record subset with parser-proven ownership, legacy-parser guardrails, and collision-preserving resolution evidence. SymbolLattice is stronger for static auditability; CodeGraph remains broader and more permissive.

## [0.177.0] - 2026-08-02

### Added

- Parser-backed Spring <code>@Value</code> facts now include direct properties, concrete-method parameters, and qualifying direct concrete one-parameter methods on a direct top-level Kotlin <code>object</code> with a braced body. The shared graph has no separate object symbol kind, so this source owner is intentionally represented as a class-like symbol.
- Object facts reuse exact-import/fully-qualified annotation proof, Kotlin escaped-dollar regular-string proof, parameter-over-method precedence, literal and relaxed configuration-key resolution, collision-safe unresolved evidence, source-value non-retention, and explicit-sync projection behavior.
- New extraction, capability, and service coverage proves object symbol ownership, imported and fully-qualified annotations, exact and relaxed resolution, class-like callers, source-value omission, unchanged-artifact sync withdrawal, and exclusion of a nested companion object.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v157</code>; the project resolver remains <code>project-resolver-v55</code>. Existing graphs and SQLite schema remain readable, while the next explicit <code>sync</code> or <code>index</code> re-extracts eligible Kotlin artifacts under the new object surface.

### Deliberate limits

- This does not treat every Kotlin object-like construct as a Spring owner. Only direct top-level named objects with a braced body qualify. Nested, companion, anonymous, and object-expression forms remain excluded; objects do not gain primary-constructor or <code>@ConfigurationProperties</code> support in this slice.
- Dynamic strings, raw strings, use-site targets, aliases, wildcard imports, named arguments, expressions, nested placeholders, abstract methods, interfaces, top-level functions, runtime bean registration, profiles, precedence, validation, and value semantics remain outside analysis.

### Comparison notes

- CodeGraph's inspected Java/Kotlin Spring path uses a broad simple-name text pattern, which can match Kotlin object annotation spelling without proving the owner, import binding, static string semantics, or nesting. SymbolLattice independently adds the narrow direct-top-level-object subset with parser-proven ownership, exact type proof, Kotlin string semantics, and collision-preserving resolution evidence. SymbolLattice is stronger for static auditability; CodeGraph remains broader and more permissive.

## [0.176.0] - 2026-08-02

### Added

- Parser-backed Spring <code>@Value</code> facts now include a direct annotation on a direct concrete one-parameter method of a direct top-level Java or Kotlin class. Java requires a direct method <code>Block</code>; Kotlin requires a direct <code>function_body</code>; the resulting configuration relation remains owned by the enclosing class.
- A separately proven parameter-level Spring <code>@Value</code> suppresses the method-level fact for that method. This preserves the more local parameter evidence and prevents duplicate or contradictory class-to-key relations.
- New extraction, capability, and service coverage proves Java/Kotlin imported and fully-qualified method annotations, exact and relaxed resolution, class-owned callers, source-value omission, explicit-sync withdrawal, arity/body/import/string rejection, and deterministic parameter-over-method precedence.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v156</code>; the project resolver remains <code>project-resolver-v55</code>. Existing graphs and SQLite schema remain readable, while the next explicit <code>sync</code> or <code>index</code> re-extracts eligible Java/Kotlin artifacts under the new method-annotation surface.

### Deliberate limits

- This is not general method-injection or runtime Spring analysis. Zero- or multi-parameter methods, methods without a body, nested declarations, Java interface methods, Kotlin abstract/interface/top-level functions, use-site targets, aliases, wildcard imports, raw strings, interpolation, named arguments, expressions, and nested placeholders remain excluded.
- A parameter-level <code>@Value</code> wins only when the same method otherwise meets the direct concrete one-parameter shape. The graph does not infer parameter symbols, overloaded invocation, dependency-injection order, profiles, precedence, environment overrides, validation, collection binding, or values.

### Comparison notes

- CodeGraph's inspected Spring extractor uses one broad simple-name text regex, so it can recognize method-level spelling without proving annotation type, AST owner, body, or arity. SymbolLattice independently adds the highest-confidence method-level subset, including exact import/fully-qualified proof, Kotlin escaped-string semantics, parameter-over-method conflict handling, and collision-preserving resolution evidence. SymbolLattice is stronger for static auditability; CodeGraph remains broader and more permissive.

## [0.175.0] - 2026-08-02

### Added

- Parser-backed Spring <code>@Value</code> facts now include parameters on direct concrete methods of direct top-level Java and Kotlin classes. The relation remains owned by the enclosing class, while Java requires a direct <code>MethodDeclaration</code> body and Kotlin requires a direct <code>function_body</code>.
- Method facts reuse the established exact-import/fully-qualified annotation proof, Java literal-placeholder guard, Kotlin escaped-dollar regular-string guard, relaxed-key fallback, collision-safe unresolved evidence, value non-retention, and explicit-sync projection behavior.
- New extraction, capability, and service coverage proves Java/Kotlin imported and fully-qualified method parameters, exact and relaxed resolution, class-owned callers, source-value omission, unchanged-artifact sync withdrawal, and rejection of abstract/interface/top-level/dynamic/named/use-site/alias/wildcard/raw forms.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v155</code>; the project resolver remains <code>project-resolver-v55</code>. Existing graphs and SQLite schema remain readable, while the next explicit <code>sync</code> or <code>index</code> re-extracts eligible Java/Kotlin artifacts under the new method surface.

### Deliberate limits

- This remains bounded syntax analysis, not a general Spring injection model. Java methods without a block, nested declarations, and nonliteral annotation forms are excluded. Kotlin abstract/interface/top-level functions, secondary constructors, use-site targets, raw strings, interpolation, aliases, wildcard imports, named arguments, expressions, and nested placeholders are excluded.
- The graph deliberately models the directly enclosing class rather than inventing parameter symbols or inferring deployed method invocation, dependency injection order, profiles, precedence, environment overrides, validation, collection binding, or value semantics.

### Comparison notes

- CodeGraph's inspected Spring path uses a broad Java/Kotlin text pattern that can cover more annotation placements without proving their AST owner or import binding. SymbolLattice independently adds the direct concrete-method subset with parser-proven declaration ownership, type proof, Kotlin string semantics, and collision-preserving evidence. SymbolLattice is stronger for auditable static facts; CodeGraph remains broader for permissive placement matching and automatic configuration-candidate selection.

## [0.174.0] - 2026-08-02

### Added

- Parser-backed Spring <code>@Value</code> facts now include direct constructor parameters on direct top-level Java classes and direct primary-constructor parameters on direct top-level Kotlin classes. Exact imports or fully-qualified annotations prove the framework type; Java retains one literal <code>"${key}"</code> positional placeholder, while Kotlin retains one escaped-dollar regular-string placeholder.
- Valid Kotlin top-level classes without a braced body now retain their class symbol and primary-constructor facts. The existing project resolver therefore applies the same literal, relaxed-key, collision, source-value non-retention, and explicit-sync behavior to every supported constructor fact.
- New extraction, capability, and service coverage proves Java/Kotlin imported and fully-qualified constructor forms, Kotlin's brace-free declaration form, exact and relaxed resolution, collision-safe unresolved behavior, configuration-value omission, explicit-sync withdrawal, and rejection of dynamic/named/use-site/alias/wildcard/method/secondary-constructor forms.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v154</code>; the project resolver remains <code>project-resolver-v55</code>. Existing graphs and SQLite schema remain readable, while the next explicit <code>sync</code> or <code>index</code> re-extracts eligible Java/Kotlin artifacts under the new constructor surface.

### Deliberate limits

- This is not general constructor or dependency-injection analysis. Java method parameters, nested declarations, and nonliteral annotations remain excluded. Kotlin secondary constructors, function parameters, use-site targets, raw strings, interpolation, aliases, wildcard imports, named arguments, expressions, and nested placeholders remain excluded.
- The graph records the directly enclosing class, never invents parameter symbols, and preserves exact, heuristic, or unresolved configuration evidence rather than modelling Spring's runtime binding, profiles, precedence, environment overrides, validation, collection binding, or value semantics.

### Comparison notes

- The inspected CodeGraph Spring path uses broader Java/Kotlin text-pattern coverage and can recognize more annotation placements. SymbolLattice independently adds the high-value constructor subset through parsed declaration ownership, exact type proof, Kotlin-specific string semantics, conservative relaxed resolution, and unresolved collision evidence. SymbolLattice is stronger for auditable syntax and ambiguity; CodeGraph remains broader for placement and runtime-like configuration coverage.

## [0.173.0] - 2026-08-02

### Added

- Spring Boot configuration resolution now applies one conservative relaxed-key identity inside unchanged dotted segments: case folds to lowercase and hyphens/underscores are removed. This allows source-proven Java/Kotlin <code>@Value</code> and <code>@ConfigurationProperties</code> facts to reach spellings such as <code>cache-list</code>, <code>cache_list</code>, <code>cacheList</code>, and <code>CACHE_LIST</code>.
- A literal key remains <code>exact</code> only when its complete canonical group contains that one spelling. When a literal spelling is absent, exactly one normalized candidate creates <code>heuristic</code> confidence <code>0.75</code> evidence; the new rule IDs distinguish direct-value and configuration-prefix relaxed resolution from literal evidence.
- Any duplicate canonical identity, including a literal key alongside a differently spelled normalized variant, remains explicit <code>unresolved</code> evidence with every candidate and configuration path. Prefix traversal applies the same rule per descendant leaf, preserving exact leaves, normalized leaves, and collisions separately.
- New service and capability coverage proves Java/Kotlin-compatible fact projection, unique camel/kebab/snake fallback, cross-format canonical collisions, source-value non-retention, unchanged-artifact sync re-projection, and absence of a selected collision target.

### Compatibility

- The project resolver advances to <code>project-resolver-v55</code>; artifact extraction remains <code>multi-language-ast-v153</code>. Existing graphs and SQLite schema remain readable, and the next explicit <code>sync</code> reprojects retained facts under the new canonical-key rules even when the source artifact itself is reused.

### Deliberate limits

- Relaxed binding never removes, inserts, or reorders dots, and it does not interpret property values, nested-object fields, collections, indices, aliases, configuration imports, active profiles, source precedence, environment overrides, validation, or runtime Spring behavior.
- A normalized match is evidence of a possible static binding only. It receives lower confidence than literal syntax, and every competing canonical spelling remains unresolved rather than being selected.

### Comparison notes

- The inspected CodeGraph Spring resolver also normalizes case, hyphens, and underscores, but its broader text-pattern pipeline resolves a closest configuration candidate. SymbolLattice independently adds the same bounded key equivalence behind parser-proven facts, preserves dots as structural boundaries, lowers fallback confidence to <code>0.75</code>, and refuses to select any canonical collision. SymbolLattice is stronger for auditable ambiguity; CodeGraph remains broader for text-surface and runtime-like configuration coverage.

## [0.172.0] - 2026-08-02

### Added

- Kotlin direct top-level classes now contribute parser-proven Spring <code>@ConfigurationProperties</code> literal-prefix facts to the same project-local leaf resolver already used by Java. An exact import or fully-qualified annotation proves the framework type; accepted syntax is one plain regular-string positional literal or one <code>prefix =</code> literal.
- Kotlin prefix facts receive the same per-leaf behavior as Java: one YAML or <code>.properties</code> candidate creates a <code>heuristic</code> <code>0.85</code> relation, while each profile or format collision remains explicit <code>unresolved</code> evidence with all candidates and configuration paths.
- New Kotlin extraction and service coverage proves imported and fully-qualified annotations, positional and <code>prefix =</code> literals, YAML/properties projection, per-leaf ambiguity, missing-prefix evidence, explicit synchronization withdrawal, and rejection of interpolation, raw strings, aliases, wildcard imports, <code>value =</code>, multiple attributes, and dynamic expressions.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v153</code>. The generic configuration-prefix resolver remains <code>project-resolver-v54</code> because it already projects persisted prefix facts independently of source language; the next explicit <code>sync</code> re-extracts eligible Kotlin artifacts and rebuilds their relations. Existing graphs and SQLite schema remain readable.

### Deliberate limits

- Kotlin support is limited to direct top-level classes with one plain regular string. Constructor parameters, annotations on properties/functions/parameters, use-site targets, raw strings, escapes, interpolation, aliases, wildcard imports, <code>value =</code>, multiple attributes, nonliteral prefixes, relaxed key binding, collections, nested-object field ownership, configuration imports, active-profile selection, source precedence, environment overrides, validation, and runtime behavior remain outside analysis.
- The relation reports the namespace's unique indexed leaves, not a field-by-field Spring binding result. Profile and source collisions remain unresolved rather than selected.

### Comparison notes

- The inspected CodeGraph Spring extractor has broader Java/Kotlin text-pattern coverage, relaxed-key normalization, and closest-candidate selection. SymbolLattice now matches its direct Java/Kotlin prefix language surface with parser-backed syntax and Kotlin-specific interpolation/raw-string guards, then exposes every uniquely proven leaf and every conflicting leaf separately. SymbolLattice is stronger for auditable static evidence and per-leaf impact traversal; CodeGraph remains broader for relaxed and runtime-like configuration behavior.

## [0.171.0] - 2026-08-02

### Added

- Direct top-level Java classes now retain parser-proven Spring <code>@ConfigurationProperties</code> literal-prefix facts when one exact import or fully-qualified annotation proves the framework type. The accepted annotation surface is one positional literal or one <code>prefix =</code> literal; the source range remains the annotation and configuration values are never retained.
- Project resolution now fans a prefix into every parser-proven descendant YAML or <code>.properties</code> leaf. Each leaf with one candidate produces a class-to-key <code>references</code> edge with <code>heuristic</code> confidence <code>0.85</code> and <code>framework.spring-boot.configuration-properties.literal-prefix.unique-leaf</code> evidence.
- Duplicate leaves across profiles or formats remain per-leaf unresolved evidence with all candidates and configuration paths. A prefix with no eligible descendants reports <code>unresolved-prefix</code>; explicit synchronization removes obsolete leaves without re-extracting an unchanged Java artifact.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v152</code> and the project resolver to <code>project-resolver-v54</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> refreshes Java prefix facts and rebuilds their configuration relations.

### Deliberate limits

- This first prefix slice supports direct Java classes only. Kotlin <code>@ConfigurationProperties</code>, method and parameter annotations, <code>value =</code>, multiple attributes, aliases/wildcard imports, nonliteral prefixes, relaxed key binding, collections, nested-object field ownership, configuration imports, profile activation, source precedence, environment overrides, validation, and runtime behavior remain outside analysis.
- A unique static leaf is useful evidence of a configuration namespace, not proof of Spring's deployed binding result; those edges deliberately remain <code>heuristic</code>. Every collision stays unresolved rather than selecting a configuration source.

### Comparison notes

- The inspected CodeGraph Spring path is broader: it uses a shared Java/Kotlin binding surface, recognizes <code>@ConfigurationProperties</code> prefixes, applies relaxed-key normalization, and selects a closest configuration candidate. SymbolLattice independently adds parser-backed Java-only prefix extraction and emits each unique descendant leaf while preserving every conflicting leaf as unresolved. SymbolLattice is more auditable for per-leaf ambiguity and impact traversal; CodeGraph remains broader for Kotlin and relaxed/runtime-like configuration behavior.

## [0.170.0] - 2026-08-02

### Added

- Kotlin now contributes direct class-property Spring <code>@Value</code> facts to the same project-local configuration resolver used by Java. An exact <code>org.springframework.beans.factory.annotation.Value</code> import or a fully-qualified annotation proves the framework type; unique YAML or <code>.properties</code> candidates retain the established exact configuration edge evidence.
- Kotlin regular strings must use the source-proven escaped-dollar spelling <code>"\${literal.key}"</code>. This distinguishes a static Spring placeholder from Kotlin's runtime <code>${...}</code> string interpolation before any cross-file configuration lookup occurs.
- New Kotlin extraction and service coverage proves imported and fully-qualified annotations, YAML/properties resolution, profile ambiguity, explicit synchronization withdrawal, and rejection of unescaped interpolation, named arguments, nested placeholders, use-site targets, alias imports, and interface properties.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v151</code> and the project resolver to <code>project-resolver-v53</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> refreshes Kotlin facts and projects their configuration edges.

### Deliberate limits

- Kotlin support is limited to direct properties inside a direct top-level class. Constructor parameters, method/parameter annotations, delegated properties, raw strings, aliases, wildcard imports, annotations with use-site targets, named arguments, expressions, escaped content beyond the one required dollar escape, and nested placeholders remain outside analysis.
- <code>@ConfigurationProperties</code>, relaxed binding, configuration imports, active-profile selection, environment overrides, property precedence, values, and runtime Spring behavior remain outside analysis. Multiple candidates remain explicit unresolved evidence rather than a selected deployment guess.

### Comparison notes

- The inspected CodeGraph Spring extractor runs one shared Java/Kotlin <code>@Value("${...}")</code> text pattern and has broader <code>@ConfigurationProperties</code>, relaxed-binding, and config-candidate behavior. SymbolLattice independently adds the direct Kotlin subset with a Kotlin-language semantic guard: only an escaped-dollar regular string is static; an unescaped <code>${...}</code> interpolation cannot become a configuration relation. CodeGraph remains broader for Spring coverage, while SymbolLattice is stricter at the Kotlin static-value boundary and preserves ambiguity without choosing a candidate.

## [0.169.0] - 2026-08-02

### Added

- The <code>spring-boot-properties</code> capability now recognizes conventional <code>application</code> and <code>bootstrap</code> <code>.yml</code>/<code>.yaml</code> files, including profile-name variants. Its YAML pass emits dotted leaf-key symbols such as <code>server.port</code> from parser-proven, plain nested mappings without retaining configuration values.
- Direct Java class-field <code>@Value("${literal.key}")</code> references now resolve through exactly one matching YAML or <code>.properties</code> key. Exact YAML edges retain <code>framework.spring-boot.yaml.direct-value.literal-key.exact-key</code>, their concrete candidate, and participating configuration path.
- Duplicate YAML keys across files, YAML/properties cross-format collisions, and missing keys retain explicit unresolved edges with all candidate symbol IDs and configuration paths. No profile, source-format, or runtime-precedence selection is inferred.
- New YAML extraction, capability, service, and sync coverage proves nested numeric/boolean/string leaves, profile file names, secret-value omission, unsupported YAML constructs, unique resolution, YAML ambiguity, mixed-format ambiguity, missing keys, and relation withdrawal after explicit synchronization.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v150</code> and the project resolver to <code>project-resolver-v52</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts eligible YAML artifacts and rebuilds Spring configuration edges.
- A missing Spring <code>@Value</code> key now reports the format-neutral <code>framework.spring-boot.config.direct-value.literal-key.unresolved-key</code> rule. Existing exact and properties-only ambiguity evidence remains unchanged.

### Deliberate limits

- Only one valid YAML document with untagged, unanchored mapping ancestry and a single-line scalar leaf is eligible. Sequences, aliases, merge keys, tags, nulls, multiline scalars, flow mappings, duplicate YAML keys, and malformed documents are excluded.
- The binding source remains direct Java field <code>@Value</code> syntax. Kotlin, <code>@ConfigurationProperties</code>, parameter/method annotations, wildcard imports, relaxed key binding, placeholders within placeholders, SpEL, configuration imports, active-profile selection, environment overrides, values, and runtime behavior remain outside analysis.

### Comparison notes

- The inspected CodeGraph Spring resolver is broader: it extracts application/bootstrap YAML and properties keys, accepts Java and Kotlin bindings, supports <code>@ConfigurationProperties</code> prefixes, normalizes relaxed key forms, and deterministically selects among multiple config candidates. SymbolLattice independently adds parser-backed nested YAML leaves to its existing direct-Java <code>@Value</code> path, deliberately retains all cross-file and cross-format collisions as unresolved evidence, and never exposes values. CodeGraph remains broader for Spring semantics; SymbolLattice is stricter and more auditable at ambiguity boundaries.

## [0.168.0] - 2026-08-02

### Added

- COBOL now retains complete direct <code>EXEC CICS RETURN</code> and <code>EXEC CICS START</code> commands with exactly one literal <code>TRANSID</code> option as pending cross-program call facts. CICS command strings and comments are excluded, and an incomplete command is discarded before a later direct command can be considered.
- The new <code>cics</code> framework capability records direct CICS transaction handoffs and direct, pre-<code>PROCEDURE DIVISION</code> level-number data declarations whose name contains <code>TRAN</code> and whose literal <code>VALUE</code> is a one-to-four-character transaction id.
- Project resolution matches a transaction hop only when exactly one indexed COBOL program owns that id. The resulting call edge records <code>framework.cics.literal-transid.unique-program-owner</code>, the concrete candidate symbol, and <code>heuristic</code> confidence <code>0.85</code>; missing or duplicate owners remain unresolved with their candidates retained.
- New extraction, capability, and service coverage proves multiline and single-line commands, quoted literal forms, direct owner facts, dynamic and commented rejection, malformed-command recovery, unique resolution, duplicate owners, and missing owners.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v149</code> and the project resolver to <code>project-resolver-v51</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts COBOL facts and rebuilds transaction-hop projection.

### Deliberate limits

- The supported command surface is only a direct line-start <code>EXEC CICS RETURN</code> or <code>START</code> command, completed by <code>END-EXEC</code>, with exactly one direct quoted transaction id. Variable values, <code>RUN TRANSID</code>, CICS macros, command aliases, copy-expanded source, nested programs, and runtime dispatch remain outside analysis.
- The CICS CSD is not source-controlled by the scanner. A unique <code>TRAN</code>-named local declaration is useful project evidence but cannot prove deployed transaction routing, so no CICS edge is labeled <code>exact</code>. Ambiguous owners intentionally produce no target edge.

### Comparison notes

- The inspected CodeGraph CICS resolver also follows literal CICS transaction references and <code>TRAN</code>-named COBOL data declarations. It is broader for same-file dereferenced values and uses the first transaction-owner declaration when collisions occur. SymbolLattice independently implements the direct-literal subset, persists explicit owner facts, and treats duplicate owners as unresolved instead of selecting one; CodeGraph remains broader while SymbolLattice provides a stricter collision boundary and auditable candidate evidence.

## [0.167.0] - 2026-08-02

### Added

- Astro endpoint extraction now accepts exact direct HTTP exports from <code>src/pages/**/*.ts</code>, <code>.js</code>, and <code>.mjs</code> only when one root <code>astro.config.*</code> file proves the project convention. Direct function declarations, immutable arrow/function-expression exports, and type-only parentheses, assertions, or <code>satisfies</code> wrappers resolve to their local handlers.
- The new <code>astro-filesystem-endpoint</code> registration preserves the HTTP method, canonical file-derived path, local handler, and separate lexical evidence. It covers the graph's supported HTTP methods plus <code>ALL</code>, preserves output suffixes such as <code>src/pages/api/[id].json.ts</code> → <code>GET /api/:id.json</code>, and adds <code>.mjs</code> to JavaScript source discovery and project-local module candidates.
- Root Astro configuration candidates are included in project-index inputs. Creation or removal changes only re-extracts affected <code>src/pages</code> endpoint sources during <code>sync</code>, while unrelated configuration drift keeps raw-artifact reuse. The same evidence prevents an eligible Astro endpoint source file from also becoming a Next.js pages-router navigation route.
- New extraction, filesystem, discovery, capability, and end-to-end sync coverage proves config presence, ambiguity rejection, direct handler forms, typed endpoint wrappers, HTTP method paths, dynamic JSON suffixes, <code>.mjs</code>, Next.js collision prevention, and config enable/disable transitions.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v148</code>; the project resolver advances to <code>project-resolver-v50</code> for endpoint provenance and <code>.mjs</code> module candidates. Project-index inputs advance to <code>project-inputs-v5</code> to track Astro configuration candidates. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> refreshes facts and project resolution.

### Deliberate limits

- Endpoint proof requires exactly one root <code>astro.config.js</code>, <code>.mjs</code>, <code>.cjs</code>, <code>.ts</code>, <code>.mts</code>, or <code>.cts</code>. Missing or multiple config files disable endpoint conventions.
- Only direct local named HTTP exports are exact. Re-exports, identifier indirection, mutable bindings, duplicate methods, runtime expressions, dynamic configuration, middleware, Markdown/MDX/HTML pages, optional parameters, and arbitrary HTTP verbs remain outside the proof boundary.

### Comparison notes

- The inspected CodeGraph Astro resolver recognizes broader <code>src/pages</code> route files (<code>.astro</code>, <code>.ts</code>, <code>.js</code>, <code>.mjs</code>) through filename transformation. SymbolLattice now reaches endpoint extension parity while adding explicit config evidence, exact local-handler route edges, type-wrapper support, and incremental evidence-transition handling. CodeGraph remains broader for permissive filename fragments and project detection; SymbolLattice deliberately leaves those forms non-exact until they can retain comparable proof.

## [0.166.0] - 2026-08-02

### Added

- Astro filesystem routing now accepts exact <code>src/pages/**/*.astro</code> whole-segment parameters such as <code>[slug]</code> and one final rest parameter such as <code>[...parts]</code>. They become canonical navigation paths such as <code>/blog/:slug</code> and <code>/docs/*parts</code> while retaining the conventional local default component and existing route evidence.
- Parameter pages, rest pages, and dynamic-directory <code>index.astro</code> pages participate in the existing persisted route query, callers, impact analysis, and source-search contracts without a new command or database schema.
- New extractor, capability, and service coverage proves static, parameter, rest, and dynamic-index pages plus rejection of malformed brackets, non-final rest parameters, duplicate parameter names, private segments, and malformed frontmatter.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v147</code>. The project resolver remains <code>project-resolver-v49</code> because each new route still resolves only to its same-file conventional default component. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Astro facts.

### Deliberate limits

- Astro page routing remains limited to <code>.astro</code> files beneath <code>src/pages</code>. Parameters must occupy a whole path segment, use a unique ASCII identifier, and a rest parameter must be final. Mixed filename fragments, optional parameters, Markdown/MDX/HTML pages, TypeScript/JavaScript endpoints, routing configuration, middleware, and runtime navigation remain outside <code>exact</code> analysis.

### Comparison notes

- The inspected CodeGraph Astro resolver maps broader <code>src/pages</code> route forms, including dynamic parameters and JavaScript/TypeScript endpoints. SymbolLattice now reaches parity for the proven <code>.astro</code> parameter and final-rest filename subset, while retaining stricter segment validation and direct local-component evidence. Endpoint extraction remains the next Astro parity gap.

## [0.165.0] - 2026-08-02

### Added

- Django URL patterns now accept an exact same-file <code>LocalClass.as_view()</code> target for <code>path</code>, bounded static <code>re_path</code>, and legacy <code>django.conf.urls.url</code>. Direct route facts retain an explicit <code>class-as-view</code> handler kind and a distinct evidence rule.
- Existing static Django URLConf projection now carries those class targets through imported and literal <code>include(...)</code> mounts, including final package-initializer re-export chains. Projected evidence preserves both the mount factory and the class-handler shape.
- New extractor and service coverage proves direct modern/regex/legacy routes, named routes, imported and literal mounts, re-exports, and rejection of configured, decorated, imported, dynamic, and rebound handlers.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v146</code> and the project resolver to <code>project-resolver-v49</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Django facts and rebuilds projected route evidence. Persisted routes without a handler kind continue to mean a local function.

### Deliberate limits

- Exact class-view analysis requires an undecorated, unique, top-level local class declared before the final <code>urlpatterns</code> list, a direct no-argument <code>Class.as_view()</code> call, a supported unambiguous route import, and no intervening rebinding. It does not prove framework inheritance or inspect the runtime <code>as_view</code> implementation.
- Configured or dynamically built views, class decorators, imported classes, factories, member chains, aliases, namespaces, copied values, positional <code>kwargs</code>, and ambiguous or non-local URLConfs remain non-exact.

### Comparison notes

- The inspected CodeGraph Django resolver strips broad <code>.as_view(...)</code> spellings while resolving handlers. SymbolLattice independently covers a deliberately smaller syntax proof, but additionally records the class-handler kind and projects it through verified local URLConf composition with auditable evidence. Broader dynamic class-view forms remain CodeGraph coverage rather than SymbolLattice <code>exact</code> evidence.

## [0.164.0] - 2026-08-02

### Added

- Django now accepts legacy <code>django.conf.urls.url(...)</code> as a bounded static regex factory for direct local-function routes and imported or literal <code>include(...)</code> URLConf mounts, including final package-initializer re-export chains.
- Legacy <code>url</code> routes and mounts emit distinct syntax- and module-stage evidence rules, keeping them separate from modern <code>path</code> and <code>re_path</code> analysis.
- The accepted <code>url</code> subset reuses the exact <code>re_path</code> contract: direct routes require a literal, anchored <code>^...$</code> pattern; mounts require a literal, start-anchored, slash-terminated <code>^.../</code> prefix. New coverage proves aliases, direct routes, imported and literal mounts, re-exports, and rejection boundaries.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v145</code> and the project resolver to <code>project-resolver-v48</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Django facts and rebuilds projected route evidence. Earlier facts with an omitted factory still default to <code>path</code>.

### Deliberate limits

- Exact legacy <code>url</code> analysis excludes captures, wildcards, escapes, regex operators, missing anchors, dynamic values, non-slash mount endings, class-based views, namespaces, tuples, positional <code>kwargs</code>, imported handlers, and ambiguous or non-local URLConfs. Those forms remain non-exact.

### Comparison notes

- The inspected CodeGraph Django resolver broadly discovers direct <code>path</code>/<code>re_path</code>/<code>url</code> call shapes and turns string <code>include('module.path')</code> into an import reference. SymbolLattice now independently turns the narrow, proven legacy <code>url</code> subset into concrete local routes with auditable direct or cross-file evidence; CodeGraph retains broader handler-shape coverage such as class views.

## [0.163.0] - 2026-08-02

### Added

- Django now projects a bounded static <code>re_path(prefix, include(...))</code> URLConf mount through direct relative imports, literal dotted module names, and final package-initializer re-export chains.
- Persisted Django URLConf inclusion facts now retain their <code>path</code> or <code>re_path</code> factory. Projected routes use distinct module-stage evidence rules for direct and re-exported imported or literal <code>re_path</code> targets.
- Accepted <code>re_path</code> mounts require a raw or ordinary single-line literal with a leading <code>^</code>, no trailing <code>$</code>, a static body, and a trailing slash unless mounted at root. New coverage proves both inclusion forms, package re-exports, static rejection, and alias rebinding after <code>urlpatterns</code>.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v144</code> and the project resolver to <code>project-resolver-v47</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts facts and rebuilds projected route evidence. Facts persisted before this version continue to default their omitted factory to <code>path</code> during compatibility reads.

### Deliberate limits

- Exact <code>re_path</code> mounts exclude terminal anchors, captures, wildcards, escapes, regex operators, dynamic values, non-slash prefix endings, class-based views, namespaces, tuples, and ambiguous or non-local URLConfs. Those forms remain non-exact rather than being normalized into potentially incorrect child paths.

### Comparison notes

- In the inspected CodeGraph Django resolver, direct <code>path</code>/<code>re_path</code>/<code>url</code> calls are broadly discovered and <code>include('module.path')</code> becomes an import reference. SymbolLattice now independently composes the narrow, fully static <code>re_path</code> include subset into concrete child routes with an auditable evidence path; broad runtime regex composition remains outside <code>exact</code> analysis.

## [0.162.0] - 2026-08-02

### Added

- Django now extracts direct <code>re_path(...)</code> URL patterns with one same-file function handler when the import binding, handler, and pattern are all syntax-proven.
- Accepted patterns are one raw or ordinary single-line string with a leading <code>^</code>, a trailing <code>$</code>, and a body that is a literal Django route path. The resulting edge uses <code>framework.django.direct-urlpatterns.re-path.local-function</code> evidence.
- New unit and service coverage proves aliases, raw and ordinary strings, the root route, persisted route queries, and rejection of captures, wildcards, escapes, missing anchors, dynamic values, and rebinding.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v143</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Python facts before those new direct routes can appear.

### Deliberate limits

- This slice accepts only a direct, fully anchored static <code>re_path</code> pattern. Prefix matches, regex semantics, class-based views, imported handlers, dynamic strings, and <code>re_path(..., include(...))</code> mounts remain non-exact.

### Comparison notes

- The inspected CodeGraph Django resolver recognizes direct <code>path</code>, <code>re_path</code>, and legacy <code>url</code> call shapes through a broad regular expression. SymbolLattice now covers the safely canonical subset of direct <code>re_path</code> patterns and records an explicit evidence rule; richer regex and framework-runtime semantics remain intentionally outside <code>exact</code> analysis.

## [0.161.0] - 2026-08-02

### Added

- Django now persists a syntax-proven, plain dotted module fact for <code>path(prefix, include("project.urlconf"))</code> and projects its final child <code>urlpatterns</code> routes through one exact project-local target.
- Literal module names can target either a regular <code>.py</code> URLConf module or a regular package <code>__init__.py</code>; the latter may continue through final single-name <code>urlpatterns</code> re-export hops.
- Exact module-stage evidence distinguishes direct literal URLConf targets with <code>framework.django.literal-urlconf.path.include.local-function</code> from initializer re-export paths with <code>framework.django.literal-urlconf.reexported-path.include.local-function</code>.
- New extractor and service coverage proves direct literal modules, package targets, re-export chains, malformed or multi-argument strings, dynamic values, and missing regular-package boundaries.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v142</code> and the project resolver to <code>project-resolver-v46</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts facts and reprojects affected routes.

### Deliberate limits

- A literal include accepts only one unescaped dotted module name that maps uniquely from the project source root to one project-local <code>.py</code> module or package initializer. Every package directory must retain an <code>__init__.py</code> marker. External modules, source-root inference, namespace packages, dynamic strings, tuples, namespaces, copied values, self-includes, and ambiguous file/package targets remain non-exact.

### Comparison notes

- In the inspected CodeGraph baseline source tree at <code>572d22bfbe82602080e457bec655f72e3314f9ef</code>, the reviewed Django <code>resolveHandlerName</code> helper maps <code>include('module.path')</code> to an <code>imports</code> reference. SymbolLattice now covers that static string form with a stricter local-module proof, then projects verified child routes and preserves every resolution hop as evidence.

## [0.160.0] - 2026-08-02

### Added

- Django URLConf targets can now resolve through a final chain of single-name, one-leading-dot relative imports exported by regular-package <code>__init__.py</code> files.
- Exact module-stage evidence records the inclusion module, every initializer hop, and the source URLConf module under <code>framework.django.reexported-urlconf.path.include.local-function</code>.
- New extractor and service coverage proves nested initializer chains, aliases, re-exported <code>urlpatterns</code>, rebinding rejection, non-initializer rejection, and unresolved-export rejection while preserving direct Django URLConf evidence and sync behavior.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v141</code> and the project resolver to <code>project-resolver-v45</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Python facts and reprojects affected routes.

### Deliberate limits

- Re-exports are limited to final, unrebound, single-name imports in regular-package <code>__init__.py</code> files and must terminate at a syntax-proven <code>urlpatterns</code> list. Parent-relative imports, import lists, star imports, copied values, non-initializer exports, dynamic composition, namespace packages, and ambiguous or missing targets remain non-exact.

### Comparison notes

- In the inspected CodeGraph baseline source tree at <code>572d22bfbe82602080e457bec655f72e3314f9ef</code>, the reviewed Django resolver creates route nodes from direct <code>path</code>/<code>re_path</code>/<code>url</code> calls and turns string <code>include('app.urls')</code> values into module references. The reviewed path did not establish recursive <code>__init__.py</code> URLConf re-export composition. SymbolLattice independently adds this narrow, auditable static-composition path; runtime framework composition remains outside exact analysis.

## [0.159.0] - 2026-08-02

### Added

- Flask <code>Blueprint</code> targets can now resolve through a final chain of single-name, one-leading-dot relative imports exported by regular-package <code>__init__.py</code> files.
- Exact module-stage evidence records the registration module, every initializer hop, and the direct Blueprint declaration module under <code>framework.flask.reexported-blueprint.register-blueprint.decorator.local-function</code>.
- New extractor and service coverage proves nested initializer chains, aliases, rebinding rejection, non-initializer rejection, and unresolved-export rejection while preserving direct Flask Blueprint evidence and sync behavior.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v140</code> and the project resolver to <code>project-resolver-v44</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Python facts and reprojects affected routes.

### Deliberate limits

- Re-exports are limited to final, unrebound, single-name imports in regular-package <code>__init__.py</code> files. Parent-relative imports, import lists, star imports, copied values, non-initializer exports, dynamic composition, namespace packages, and ambiguous or missing targets remain non-exact.

### Comparison notes

- In the inspected CodeGraph baseline source tree at <code>572d22bfbe82602080e457bec655f72e3314f9ef</code>, the reviewed Flask path extracts direct decorator routes and resolves conventional Blueprint names. The reviewed source did not establish an equivalent <code>register_blueprint</code> package re-export composition path. SymbolLattice independently adds this narrow, auditable static-composition path; runtime framework composition remains outside exact analysis.

## [0.158.0] - 2026-08-02

### Added

- FastAPI <code>APIRouter</code> targets can now resolve through a final chain of single-name, one-leading-dot relative imports exported by regular-package <code>__init__.py</code> files.
- Exact module-stage evidence records the mounting module, every initializer hop, and the direct router declaration module under <code>framework.fastapi.reexported-router.include-router.decorator.local-function</code>.
- New extractor and service coverage proves nested initializer chains, aliases, rebinding rejection, non-initializer rejection, and unresolved-export rejection while preserving direct FastAPI router evidence.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v139</code> and the project resolver to <code>project-resolver-v43</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Python facts and reprojects affected routes.

### Deliberate limits

- Re-exports are limited to final, unrebound, single-name imports in regular-package <code>__init__.py</code> files. Parent-relative imports, import lists, star imports, copied values, non-initializer exports, dynamic composition, namespace packages, and ambiguous or missing targets remain non-exact.

### Comparison notes

- In the inspected CodeGraph baseline source tree at <code>572d22bfbe82602080e457bec655f72e3314f9ef</code>, the reviewed FastAPI path directly extracts decorator routes. The reviewed source did not establish an equivalent <code>include_router</code> package re-export composition path. SymbolLattice independently adds this narrow, auditable static-composition path; runtime framework composition remains outside exact analysis.

## [0.157.0] - 2026-08-02

### Added

- Sanic Blueprint and Blueprint-group targets can now resolve through a final chain of single-name, one-leading-dot relative imports exported by regular-package <code>__init__.py</code> files.
- Exact module-stage evidence now records every initializer and source-module hop for a re-exported target, including nested group member resolution.
- New extractor and service coverage proves nested initializer chains, direct Blueprint and group targets, rebinding rejection, non-initializer rejection, and unresolved-export rejection.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v138</code> and the project resolver to <code>project-resolver-v42</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Python facts and reprojects affected routes.

### Deliberate limits

- Re-exports are limited to final, unrebound, single-name imports in regular-package <code>__init__.py</code> files. Parent-relative imports, import lists, star imports, copied values, non-initializer exports, dynamic composition, namespace packages, and ambiguous or missing targets remain non-exact.

### Comparison notes

- The inspected CodeGraph baseline source tree at <code>572d22bfbe82602080e457bec655f72e3314f9ef</code> contains no <code>sanic</code> reference. SymbolLattice independently adds conservative, evidence-backed initializer re-export resolution for this framework-specific route surface.

## [0.156.0] - 2026-08-01

### Added

- Sanic <code>Blueprint.group(...)</code> route projection now traverses recursively through direct or package-relative imported Blueprint and group members.
- Group facts retain each imported member's source module. Project resolution composes literal app-registration, group, Blueprint, and decorator prefixes and keeps every module hop in exact evidence.
- Repeated direct-group mounts across modules remain exact only with distinct literal <code>name_prefix</code> values. Cycles, duplicate leaf Blueprints, direct-plus-group ambiguity, collisions, and unresolved members emit no exact route.
- Unit and service coverage verifies imported/direct members, nested group paths, aliases, named repeated mounts, and cross-file cycle or ambiguity rejection.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v137</code> and the project resolver to <code>project-resolver-v41</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Python facts and reprojects affected routes.

### Deliberate limits

- This slice accepts only regular Python packages, direct one-leading-dot single-name imports, and top-level literal group and app registrations. Copied values, list/tuple members, re-exports, namespace packages, parent-relative imports, dynamic composition, class views, WebSockets, <code>add_route</code>, versioning, and other configuration remain non-exact.

### Comparison notes

- The inspected CodeGraph baseline source tree contains no <code>sanic</code> reference. SymbolLattice independently adds a conservative, evidence-backed cross-module group route path, while runtime framework composition remains intentionally outside exact static analysis.

## [0.155.0] - 2026-08-01

### Added

- Same-file direct Sanic Blueprint groups now accept a nonempty literal <code>name_prefix</code> made of alphanumerics, underscores, and hyphens.
- One Blueprint may be mounted through multiple direct groups in the same app when every corresponding group has a distinct literal <code>name_prefix</code>. Those paths carry <code>framework.sanic.named-blueprint-group.app-blueprint.decorator.local-function</code> evidence.
- The extractor now suppresses exact routes for repeated mounts without distinct names, name collisions, direct-plus-group ambiguity, or repeated nested branches.
- Unit and service coverage verifies aliased named groups, composed registration prefixes, and rejection of unnamed or colliding repeated mounts.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v136</code>. The project resolver remains at <code>project-resolver-v40</code> because this is same-file extraction only. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Python facts and reprojects affected Sanic routes.

### Deliberate limits

- This slice supports repeated mounts only through direct same-file group members, one app, and distinct restricted literal group names. Cross-file groups, copied Blueprints, list/tuple members, repeated nested branches, app-level <code>name_prefix</code>, versioning, strict-slashes controls, other options, class views, WebSockets, <code>add_route</code>, and dynamic composition remain non-exact.

### Comparison notes

- The inspected CodeGraph baseline source tree contains no <code>sanic</code> reference. SymbolLattice independently adds a narrow, evidence-backed named-group mounting path; it is broader for this explicit static route slice while remaining deliberately narrower than runtime framework composition.

## [0.154.0] - 2026-08-01

### Added

- Same-file Sanic <code>Blueprint.group(...)</code> projection now recursively resolves nested direct groups and composes every ancestor group prefix, member Blueprint prefix, and literal app-registration prefix.
- Routes that traverse more than one group retain the distinct <code>framework.sanic.direct-nested-blueprint-group.app-blueprint.decorator.local-function</code> evidence rule; direct terminal branches retain the existing one-group rule.
- Recursive resolution rejects cyclic group paths, unresolved or rebound members, and a direct Blueprint mounted more than once through a group tree.
- Unit and service coverage verifies aliased nested groups, sibling direct-member composition, and duplicate-Blueprint rejection.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v135</code>. The project resolver remains at <code>project-resolver-v40</code> because this is same-file extraction only. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Python facts and reprojects affected Sanic routes.

### Deliberate limits

- This slice supports same-file direct Blueprint/group variables and at most one literal <code>url_prefix</code> at each group or app registration. Cross-file groups, copied Blueprints, array/tuple members, <code>name_prefix</code>, versioning, strict-slashes controls, other options, class views, WebSockets, <code>add_route</code>, and dynamic composition remain non-exact.

### Comparison notes

- The inspected CodeGraph baseline source tree contains no <code>sanic</code> reference. SymbolLattice independently adds an evidence-backed nested-group route path; it is broader for this explicit static route slice while remaining deliberately narrower than runtime framework composition.

## [0.153.0] - 2026-08-01

### Added

- Same-file, single-layer Sanic <code>Blueprint.group(...)</code> registrations now project member decorator routes through the group prefix, Blueprint prefix, and one literal registration <code>url_prefix</code>.
- Exact group routes require a syntax-proven Sanic import and app, an unrebound direct group, and every group member to resolve to an unrebound direct Blueprint at group creation time.
- Unit and service coverage verifies aliased constructors, composed GET/POST routes, and rejection when even one group member is unproven.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v134</code>. The project resolver remains at <code>project-resolver-v40</code> because this is same-file extraction only. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Python facts and reprojects affected Sanic routes.

### Deliberate limits

- This slice accepts only same-file, single-layer groups with direct Blueprint variable members and at most one literal <code>url_prefix</code>. Nested groups, copied/group-imported Blueprints, list/tuple members, dynamic values, other group or registration options, class views, WebSockets, <code>add_route</code>, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph baseline source tree contains no <code>sanic</code> reference. SymbolLattice independently adds a narrow, evidence-backed group-composition path; it is broader for this explicit static route slice while remaining deliberately narrower than runtime framework composition.

## [0.152.0] - 2026-08-01

### Added

- Direct Sanic Blueprint registrations now accept one literal <code>url_prefix</code> option. Same-file projection composes the registration prefix, Blueprint prefix, and decorator path.
- Cross-file Sanic Blueprint registration facts now retain the literal registration prefix, and the project resolver composes it with the imported Blueprint prefix and source route path.
- Unit and service coverage verifies same-file and package-relative cross-file composition plus rejection of dynamic prefixes and unsupported registration options.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v133</code> and the project resolver to <code>project-resolver-v40</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Python facts and reprojects affected Sanic routes.

### Deliberate limits

- This slice supports one direct Blueprint argument and at most one literal <code>url_prefix</code> keyword. Multiple Blueprints, registration <code>version</code> or other options, groups/copies, dynamic prefixes, indirect construction, class views, WebSockets, <code>add_route</code>, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph baseline source tree contains no <code>sanic</code> reference. SymbolLattice independently adds a narrow, evidence-backed path for composed Sanic registration prefixes; it is broader for this explicit static route slice while remaining deliberately narrower than runtime framework composition.

## [0.151.0] - 2026-08-01

### Added

- Python extraction now retains independent Sanic Blueprint facts for direct Blueprint declarations, direct decorator routes, and direct option-free <code>app.blueprint(imported_blueprint)</code> registrations.
- The project resolver now projects a source module's literal Sanic Blueprint route through a one-dot, single-name package-relative import into the registering module. The projected route retains both module paths as exact module-stage evidence.
- New unit and service coverage verifies import aliases, source Blueprint prefix composition, persisted facts, exact route evidence, parent-relative rejection, imported-binding rebinding, and source-Blueprint rebinding rejection.

### Compatibility

- The artifact-facts extractor advances to <code>multi-language-ast-v132</code> and the project resolver to <code>project-resolver-v39</code>. Existing graphs and SQLite schema remain readable; the next explicit <code>sync</code> re-extracts Python facts and reprojects cross-file Sanic Blueprint routes.

### Deliberate limits

- This slice accepts only a direct one-dot, single-name relative import, a direct option-free one-Blueprint <code>app.blueprint(...)</code> call, literal source Blueprint prefix/path/method, and a source-module top-level local function handler. Parent-relative imports, import lists, groups/copies, registration options, dynamic construction, class views, WebSockets, <code>add_route</code>, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph baseline source tree contains no <code>sanic</code> reference. SymbolLattice independently models a narrow, evidence-backed Sanic cross-file composition path and exposes exact provenance across both modules. It is broader for this explicit direct Blueprint path while remaining deliberately narrower than runtime framework behavior.

## [0.150.0] - 2026-08-01

### Added

- Python extraction now projects same-file Sanic Blueprint routes from direct `from sanic import Blueprint` imports (including aliases), literal `Blueprint("name", url_prefix="/prefix")` declarations, direct `app.blueprint(bp)` registrations, and the existing direct Blueprint decorators.
- A Blueprint may be registered before or after its decorator route, matching the current Sanic Blueprint model. Projection proves the app and Blueprint bindings independently at their registration and decorator sites, then composes the literal Blueprint prefix with the literal route path.
- Same app–Blueprint duplicate registrations, unsupported constructor or registration options, dynamic prefixes, unmounted Blueprints, rebinding, and shadowing are deliberately rejected instead of guessed.
- New unit and service coverage verifies aliases, prefix composition, mount order, generic multi-method routes, exact handler evidence, and all stated rejection boundaries.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v131`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Python facts and reprojects same-file Sanic Blueprint routes. The project resolver remains `project-resolver-v38`.

### Deliberate limits

- This first Blueprint slice is limited to a direct same-file literal Blueprint with at most a literal constructor `url_prefix`, an option-free direct one-Blueprint `app.blueprint(bp)` call, and same-file top-level named function decorators. Cross-file imports, Blueprint groups/copies, registration options, indirect construction, `Sanic.get_app`, `add_route`, class views, WebSockets, dynamic composition, and ambiguous registrations remain non-exact.

### Comparison notes

- The inspected CodeGraph baseline source tree contains no `sanic` reference. SymbolLattice independently proves Sanic Blueprint construction, per-site identity, mount timing, prefix composition, local handler binding, and rebinding boundaries. It is broader for this direct same-file Blueprint slice while intentionally narrower for cross-file composition, groups, views, WebSockets, and runtime configuration.

## [0.149.0] - 2026-08-01

### Added

- Python extraction now recognizes direct Sanic application decorators from `from sanic import Sanic` (including aliases), a direct top-level `Sanic(...)` application assignment, and same-file top-level function handlers decorated with `@app.get`, `post`, `put`, `patch`, `delete`, `head`, `options`, or generic `route`.
- Generic `@app.route("/path")` records its documented default `GET`; literal `methods=["POST", "PATCH"]` records each uppercase standard HTTP method. Literal `name` is accepted only where Sanic permits the direct decorator form.
- New unit and service coverage verifies aliases, shortcuts, generic default and multi-method decorators, exact handler evidence, and rejection of dynamic, unsupported, rebound, or shadowed declarations.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v130`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Python facts and reprojects Sanic routes. The project resolver remains `project-resolver-v38`.

### Deliberate limits

- Sanic support is intentionally limited to direct imports, direct top-level `Sanic(...)` applications, literal direct app decorators, and same-file top-level named function handlers. Blueprints, `Sanic.get_app`, `add_route`, class views, WebSockets, versioning and other decorator configuration, dynamic paths or methods, non-uppercase or wildcard methods, external handlers, rebinding, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph baseline source tree contains no `sanic` reference. SymbolLattice independently uses its Python AST to prove the direct import, application instance, decorator receiver, literal route shape, handler declaration, and rebinding boundary; it is broader for this Sanic slice while deliberately narrower for blueprints, class views, WebSockets, and runtime composition.

## [0.148.0] - 2026-08-01

### Added

- Python extraction now recognizes aiohttp declarative route tables: top-level named lists and inline literal lists of direct `web.get`, `web.post`, `web.put`, `web.patch`, `web.delete`, `web.head`, or `web.route` entries mounted through direct `app.router.add_routes(...)` calls.
- Every table entry independently proves the `aiohttp.web` import alias, literal slash path and standard uppercase generic method, same-file top-level named handler declared before the entry, and absence of rebinding. `web.get` records its documented default `GET` plus `HEAD`, while literal `allow_head=False` records only `GET`.
- New unit and service coverage verifies named and inline tables, aliases, default and suppressed HEAD behavior, generic route entries, exact handler evidence, and rejected dynamic, unmounted, unsupported, rebound, or late declarations.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v129`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Python facts and reprojects aiohttp route tables. The project resolver remains `project-resolver-v38`.

### Deliberate limits

- aiohttp table support is intentionally limited to direct imports, direct `web.Application()` apps, literal direct `web.*` entries, direct `app.router.add_routes(...)` mounts, and same-file top-level named function handlers. `RouteTableDef`, decorators, class views, subapps, nested or dynamic composition, wildcard or non-uppercase generic methods, non-literal `allow_head`, handlers declared after an entry, rebinding, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph baseline source tree contains no `aiohttp` reference. SymbolLattice independently uses its Python AST to prove a literal route-table definition, the add-routes mount, per-entry import and handler proof, and aiohttp's documented `GET`/`HEAD` default; it remains deliberately narrower for decorators, views, subapps, and runtime composition.

## [0.147.0] - 2026-08-01

### Added

- Python extraction now recognizes direct aiohttp router registrations from `from aiohttp import web` (including aliases), `web.Application()`, and top-level `app.router.add_get`, `add_post`, `add_put`, `add_patch`, `add_delete`, `add_head`, or `add_route` calls with literal slash paths and named local handlers.
- The documented `add_get` default now emits both `GET` and `HEAD` routes; a literal `allow_head=False` emits only `GET`. Direct `add_route` accepts literal uppercase standard HTTP methods through `OPTIONS`.
- New unit and service coverage verifies import aliases, default and suppressed implicit HEAD routes, shortcut and generic registrations, exact handler proof, and rejection of dynamic, unsupported, rebound, or ambiguously ordered declarations.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v128`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Python facts and reprojects aiohttp routes. The project resolver remains `project-resolver-v38`.

### Deliberate limits

- aiohttp support is intentionally limited to direct `from aiohttp import web`, `web.Application()`, literal top-level direct router registrations, and same-file top-level named function handlers. `add_routes`, `RouteTableDef`, decorators, class views, subapps, dynamic values, wildcard or non-uppercase `add_route` methods, non-literal `allow_head`, handlers declared after registration, rebinding, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph baseline source tree contains no `aiohttp` reference. SymbolLattice independently uses its Python AST to prove the import alias, direct application, router receiver, literal route form, handler order, and rebinding boundary for this narrow aiohttp slice; route tables, decorators, classes, subapps, and runtime composition remain deliberately outside scope.

## [0.146.0] - 2026-08-01

### Added

- Python extraction now recognizes direct Starlette `Route(...)` tables passed through `Starlette(routes=...)`, including top-level named lists and inline literal lists, exact named imports or aliases, literal slash paths, literal uppercase standard HTTP method lists, and the documented default `GET` method.
- A Starlette route becomes an exact same-file handler relation only after SymbolLattice proves the route factory import, application constructor import, route-list mount, a uniquely named top-level function handler declared before the route, and the absence of relevant rebinding.
- New unit and service coverage verifies named and inline tables, import aliases, default and multi-method routes, and rejection of dynamic, unmounted, unsupported, rebound, or ambiguously ordered declarations.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v127`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Python facts and reprojects Starlette routes. The project resolver remains `project-resolver-v38`.

### Deliberate limits

- Starlette support is intentionally limited to direct imports, top-level literal `Route` lists mounted by `Starlette(routes=...)`, and same-file top-level named function endpoints. `Mount`, `Router`, class endpoints, mixed or dynamic lists, tuples, unsupported route options, cross-file routes, handlers declared after routes, rebinding, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph Python framework module contains a generic FastAPI decorator extractor but no Starlette-specific `Starlette` or `Route` branch. SymbolLattice independently uses its AST to require import, mount, handler-order, and rebinding proof for this narrow Starlette slice; it remains deliberately narrower for classes, mounts, routers, dynamic composition, and cross-file routes.

## [0.145.0] - 2026-08-01

### Added

- Ruby on Rails extraction now expands direct `Rails.application.routes.draw` `resources` and singular `resource` declarations into literal RESTful route facts. Direct literal array-shaped `only` and `except` filters are retained; an `update` action emits both `PATCH` and `PUT` routes.
- Rails direct verb and RESTful routes now retain pending controller-action evidence when a same-file method is unavailable. The project resolver promotes a route only when the conventional `app/controllers/<controller>_controller.rb` file, matching controller class, and requested method are each uniquely syntax-proven.
- New unit and service coverage verifies plural and singular resources, action filters, both update verbs, rejected dynamic/unsupported declarations, exact conventional cross-file resolution, and missing or ambiguous controller evidence.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v126` and the project resolver to `project-resolver-v38`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Ruby facts and reprojects Rails routes.

### Deliberate limits

- Rails support is limited to direct `Rails.application.routes.draw` blocks, literal standard-action `resources`/`resource` declarations, literal array-shaped `only`/`except` filters, and unique conventional controller files/classes/methods. Namespaces, scopes, nested resources, custom paths/controllers, dynamic values, non-array filters, aliases, wrappers, and ambiguous or missing candidates remain non-exact.

### Comparison notes

- The inspected CodeGraph Rails resolver expands direct RESTful resources and uses controller conventions, but its route extraction is regex-driven. SymbolLattice uses the Ruby AST, preserves separate `PATCH` and `PUT` update routes, and requires one exact conventional file/class/method chain before publishing a cross-file handler edge.

## [0.144.0] - 2026-08-01

### Added

- Go HttpRouter extraction now proves direct short-variable `httprouter.New()` routers and direct `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS` registrations with one named local function handler.
- Literal HttpRouter named and catch-all path parameters, such as `/users/:id` and `/files/*path`, remain part of the exact route path instead of being flattened or inferred.
- New unit and service coverage verifies explicit/default imports, HTTP method queries, literal path parameters, and rejection of shadowed or rebound aliases, dynamic paths, inline or wrapped handlers, extra arguments, unsupported `TRACE`, `Handle`, `Handler`, and `HandlerFunc` forms.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v125`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes. The project resolver remains `project-resolver-v37`.

### Deliberate limits

- HttpRouter extraction is limited to direct `httprouter.New()` short declarations, literal slash paths, and one named handler on the documented verb methods. `Handle`, `Handler`, `HandlerFunc`, `ServeFiles`, `GlobalOPTIONS`, host switching, wrappers, var aliases, forwarding, branches, callbacks, reassignment, dynamic values, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph Go matcher can discover a broad set of uppercase receiver methods with a literal path, but does not prove an HttpRouter import, `New()` receiver, or same-file handler. SymbolLattice is deliberately narrower for generic and wrapper APIs, but records framework-proven exact routes including HttpRouter parameter patterns.

## [0.143.0] - 2026-08-01

### Added

- Go Gorilla/mux extraction now proves direct short-variable `mux.NewRouter()` receivers and `HandleFunc("/path", handler)` registrations with one named local function handler.
- A direct single `HandleFunc(...).Methods("GET", ...)` chain emits one exact route for each distinct standard uppercase literal HTTP method, instead of treating the route as method-agnostic.
- New unit and service coverage verifies explicit/default imports, all-method and method-bounded routes, persisted route queries, and rejection of shadowed or rebound aliases, dynamic values, inline handlers, unsupported methods, empty method lists, and extra matcher chains.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v124`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes. The project resolver remains `project-resolver-v37`.

### Deliberate limits

- Gorilla/mux extraction is limited to direct `mux.NewRouter()` short declarations, one named handler, a literal slash path, and an optional single `Methods(...)` chain containing one or more standard uppercase literals. Subrouters, `Handle`, `PathPrefix`, `Host`, `Headers`, `Schemes`, route names, middleware, further matcher chains, var aliases, forwarding, branches, callbacks, reassignment, dynamic values, custom methods, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph Go matcher recognizes a generic `HandleFunc("/path", handler)` shape, but does not prove Gorilla/mux provenance or preserve a chained `Methods(...)` restriction; chained registrations can be represented as broad `ALL` handlers. SymbolLattice is narrower for other mux matchers, but emits import- and receiver-proven per-method exact routes for the supported chain.

## [0.142.0] - 2026-08-01

### Added

- Go Beego v2 extraction now proves direct `github.com/beego/beego/v2/server/web` functional registrations: `web.Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, and `Options` with a literal slash path and one named local function handler.
- Explicit Beego import aliases and default `web` imports are accepted only while visible and unrebound in the registering function. Every emitted route retains exact syntax evidence under `framework.beego.direct-package-function.local-function`.
- New unit and service coverage verifies direct v2 routes, import aliases, exact query results, and rejection of shadowed or rebound aliases, dynamic paths, inline/middleware handlers, and unsupported `Any` routes.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v123`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes. The project resolver remains `project-resolver-v37`.

### Deliberate limits

- Beego extraction is limited to direct v2 `web` package functional registrations with a literal path and one named handler. Namespace composition, controller/MVC, Router/RESTRouter, annotation routing, middleware, `Any`, dynamic values, v1 packages, var aliases, forwarding, branches, callbacks, reassignment, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph Go matcher can discover a broad range of `Get`/`Post`-like receiver calls but does not require a Beego v2 import and cannot distinguish Beego's package-level API from an unrelated identifier. SymbolLattice is narrower for dynamic and controller forms, but emits exact, framework-proven direct-function routes for the supported slice.

## [0.141.0] - 2026-08-01

### Added

- Go Iris v12 extraction now proves direct and literal-Party `Handle("METHOD", "/path", handler)` registrations with one named local function handler. The accepted uppercase methods are `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `TRACE`, and `CONNECT`.
- Handle routes preserve the same static Iris import, unrebound Application/Party receiver, composed Party prefix, source range, and exact rule evidence as the v0.140 verb-method slice.
- New unit and service coverage verifies direct and nested-Party Handle routes, query lookup, dynamic/custom/lowercase method rejection, dynamic paths, inline or middleware handlers, and receiver rebinding rejection.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v122`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes. The project resolver remains `project-resolver-v37`.

### Deliberate limits

- Iris Handle extraction accepts exactly three arguments: a standard uppercase literal method, literal slash path, and one named handler. `Default`, `ANY`/custom/lowercase methods, extra handlers, inline handlers, middleware, MVC, dynamic values, var bindings, forwarding, branches, callbacks, reassignment, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph Go matcher intentionally uses a generic two-argument receiver-method pattern, so it does not directly model Iris' three-argument Handle signature. SymbolLattice is still narrower for dynamic and reflective Iris forms, but now provides exact application/Party-aware evidence for this otherwise uncovered static slice.

## [0.140.0] - 2026-08-01

### Added

- Go Iris v12 extraction now proves direct `iris.New()` Application registrations and same-function literal `Party` prefixes, including nested parties and `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`, `Trace`, `Connect`, and `Any` routes with one named local function handler.
- Exact Iris route evidence records the direct Application or Party rule and only accepts a visible `github.com/kataras/iris/v12` import plus an unrebound local receiver.
- New unit and service coverage verifies import aliases, nested `Party` composition, exact route lookup, and rejection of shadowed imports, dynamic paths/prefixes, inline or middleware handlers, unsupported `Handle`, var bindings, and rebinding.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v121`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes. The project resolver remains `project-resolver-v37`.

### Deliberate limits

- Iris extraction is limited to `iris.New()` short declarations, literal one-argument `Party` bindings, and one named handler for a direct supported HTTP method. `Default`, `Handle`, MVC, route groups with middleware, dynamic values, var bindings, forwarding, branches, callbacks, reassignment, and ambiguity remain non-exact.

### Comparison notes

- The inspected CodeGraph Go resolver uses generic receiver-method matching and can cover a broader mix of Go route-like calls, but it does not prove an Iris import, Application receiver, or composed Party prefix. SymbolLattice is narrower for dynamic and alternative Iris forms, but emits exact route evidence for the proven v12 slice.

## [0.139.0] - 2026-08-01

### Added

- GoFrame v1/v2 standard-router projection now recognizes one untyped direct function-local factory var initializer before registration: `var controller = NewController(); group.Bind(controller)` and its local-module qualified equivalent.
- Controller-pointer and factory aliases now share one bounded direct-local-alias parser, keeping short declarations, supported var forms, rebinding invalidation, and callback parameter shadowing consistent.
- New unit and service coverage verifies same-package and default-imported cross-package factory var aliases, exact Group/Domain/module evidence, typed-var rejection, callback shadowing, and rebinding rejection.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v120`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes. The project resolver remains `project-resolver-v37`.

### Deliberate limits

- A factory var alias must be one untyped direct local VarSpec whose right side is an already supported no-argument factory call. Typed factory vars, grouped or multiple specs, multiple values, globals, forwarding aliases, branches, containers, dynamic values, callback shadows, and later assignments remain non-exact.

### Comparison notes

- The inspected CodeGraph GoFrame path remains a heuristic request-type-to-method join without static Bind-target alias tracking or Group-prefix reconstruction. SymbolLattice remains narrower for dynamic registration, but now proves a common local factory var form with exact registration and module evidence.

## [0.138.0] - 2026-08-01

### Added

- GoFrame v1/v2 standard-router projection now recognizes one direct function-local controller `var` initializer before registration: `var controller = &Controller{}; group.Bind(controller)`. It also accepts an explicit pointer type only when it exactly matches the direct `&Controller{}` or `new(Controller)` value.
- Typed local-module controller aliases preserve the same exact controller, Bind, literal Group/Domain, source-range, and root-`go.mod` evidence as the direct form.
- New unit and service coverage verifies inferred and matching typed `var` aliases, `new(...)`, cross-package default imports, callback shadowing, rebinding rejection, and rejection of an `interface{}` container.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v119`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes. The project resolver remains `project-resolver-v37`.

### Deliberate limits

- Var-alias support accepts exactly one direct local VarSpec with one initializer. Grouped or multiple specs, multiple values, globals, non-pointer declared types, mismatched pointer types, factory var aliases, forwarding aliases, branches, containers, dynamic values, callback shadows, and later assignments remain non-exact.

### Comparison notes

- The inspected CodeGraph GoFrame path still uses a heuristic request-type-to-method join without Bind-target or Group-prefix reconstruction. SymbolLattice is narrower for dynamic runtime registration, but the newly bounded typed-var slice preserves exact static registration and module evidence.

## [0.137.0] - 2026-08-01

### Added

- GoFrame v1/v2 standard-router projection now recognizes one unrebound same-function controller-pointer short declaration before registration: `controller := &Controller{}; group.Bind(controller)` or `controller := new(Controller); group.Bind(controller)`. Each alias can coexist with other independently proven arguments in a variadic `Bind(...)` call.
- Alias bindings retain the exact direct-controller route evidence: literal Group prefix, Domain host condition, source range, and same-package or root-`go.mod` local-module proof.
- New unit and service coverage verifies direct and `new(...)` aliases, variadic coexistence with an unknown argument, callback shadowing, rebinding rejection, and default-imported cross-package controller resolution.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v118`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes. The project resolver remains `project-resolver-v37`.

### Deliberate limits

- Pointer-alias support accepts only a direct function-local `:=` whose right side is an already supported `&Controller{}` or `new(Controller)` shape. `var` declarations, globals, forwarding aliases, branches, maps, interfaces, DI containers, dynamic values, callback shadows, and later assignments do not become exact relations.

### Comparison notes

- The inspected CodeGraph GoFrame path still joins `g.Meta` request metadata to controller methods heuristically and deliberately does not reconstruct reflective Group prefixes. SymbolLattice remains narrower for dynamic registration, but this static alias slice emits exact controller, Bind, Group/Domain, and local-module evidence.

## [0.136.0] - 2026-08-01

### Added

- GoFrame v1/v2 standard-router projection now evaluates every independently static argument in one variadic `RouterGroup.Bind(handlerOrObject ...any)` call. Direct `&Controller{}` values, proven `Factory()` calls, and the existing one-hop local factory aliases can coexist in the same batch and each produces its own exact route evidence.
- An unknown or dynamic argument is ignored for exact extraction without suppressing a neighboring proven controller. Each retained fact keeps the same literal Group prefix, Domain host condition, source range, and local-module proof path as its single-argument form.
- New unit and service coverage verifies a mixed direct-controller and cross-package factory batch, preserved Domain/Group evidence, and rejection of an unknown batch argument.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v117`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes. The project resolver remains `project-resolver-v37`.

### Deliberate limits

- Batch support is per static argument, not general value-flow analysis. Slice expansion, interface/container values, dynamic calls, forwarding helpers, dependency injection, factory rebindings, and any direct controller/factory shape that fails the existing proof remain non-exact.

### Comparison notes

- The inspected CodeGraph GoFrame path remains a heuristic request-type-to-method join and deliberately does not reconstruct Group prefixes. SymbolLattice now covers GoFrame's variadic batch registration for the proven subset with exact controller/factory, Group/Domain, and local-module evidence; CodeGraph remains broader for dynamic and reflective candidate coverage.

## [0.135.0] - 2026-08-01

### Added

- GoFrame v1/v2 standard-router projection now recognizes one local factory alias before registration: `controller := NewController(); group.Bind(controller)` and its local-module qualified equivalent can become exact when the underlying factory already satisfies the v0.134 direct-pointer proof.
- The lexical extractor carries each eligible alias only within the current direct statement sequence and callback scope. A later assignment invalidates it before the next Bind, while callback parameters with the same name hide an outer alias.
- New unit and service coverage verifies local aliases, root-`go.mod` default-imported factories, preserved Group/Domain evidence, and rebind rejection.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v116`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes. The project resolver remains `project-resolver-v37`.

### Deliberate limits

- Alias support accepts only one direct short declaration (`:=`) whose right side is an already supported no-argument factory call. Package globals, `var` declarations, assignments, forwarding aliases, branches, maps, interfaces, DI containers, dynamic function values, and alias rebindings do not become exact relations.

### Comparison notes

- The inspected CodeGraph GoFrame resolver recognizes reflective `group.Bind(user.NewV1())` but leaves the route-to-method link heuristic and does not reconstruct the Group prefix. SymbolLattice remains narrower in syntax but now supports the common local alias form and keeps exact factory, request, controller, Bind, Group/Domain, and local-module evidence for the proven subset.

## [0.134.0] - 2026-08-01

### Added

- GoFrame v1/v2 standard-router projection now resolves exact factory bindings such as `Bind(NewController())` and `Bind(handlers.NewV1())` when a no-argument factory declares `*Controller` and directly returns the same `&Controller{}` or `new(Controller)` value.
- Factory declaration and binding facts retain the factory source location, literal `Group` prefix, and inherited literal `Domain` hosts. The existing same-package and root-`go.mod` local-module proof is reused for explicit and target-`package`-proven default imports.
- New extraction and service coverage verifies local and cross-package factory routes, default imports, preserved route evidence, incremental raw-fact reuse, and separation of malformed factories from `exact` output.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v115` and the project resolver to `project-resolver-v37`. Existing graphs and SQLite schema remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes.

### Deliberate limits

- Exact factory support intentionally excludes parameters, named or multiple results, forwarding calls, dependency injection, branches, local function values, dynamic package values, rebindings, and any return expression other than the matching direct pointer construction. Those shapes may remain unresolved or, where independently eligible, appear only as the existing `heuristic` request-signature candidate.

### Comparison notes

- The inspected CodeGraph GoFrame surface includes reflective factory bindings such as `group.Bind(user.NewV1())` and joins `g.Meta` requests to method signatures heuristically. SymbolLattice remains narrower in accepted factory syntax, but for this proven subset emits `exact` routes with Group/Domain, source-path, and root-`go.mod` evidence; dynamic factory coverage remains weaker than CodeGraph's broader runtime-oriented model.

## [0.133.0] - 2026-08-01

### Added

- GoFrame v1/v2 standard-router projection now emits one bounded `heuristic` route when a literal `g.Meta` request and exactly one eligible controller method share a proven request type, but no identifiable static `Bind` names that controller.
- Same-package and root-`go.mod` local cross-package signatures are supported. Cross-package candidates reuse explicit-alias and target-`package`-proven default-import resolution, retain their request/controller resolution path and any `go.mod` configuration evidence, and never infer an import package name from its path.
- Candidate synthesis rejects duplicate controller signatures, duplicate request declarations, known static Bind controllers, unresolved aliased Bind names, and unproven imports. This prevents an unprefixed candidate from competing with an existing exact Group/Domain route.

### Compatibility

- The project resolver advances to `project-resolver-v36`. Existing artifact facts and SQLite schema remain compatible; the next explicit `sync` reprojects existing facts without re-extraction.

### Deliberate limits

- These candidates are `heuristic` with confidence `0.7`, not proof that GoFrame registered a route. They expose only the literal `g.Meta` path and no inferred Group prefix or Domain host. Runtime reflection, dynamic Bind calls, rebindings, build tags, `replace`, nested modules, external/transitive modules, and ambiguity remain unresolved.

### Comparison notes

- This moves toward the inspected CodeGraph GoFrame synthesizer, which joins `g.Meta` request types to method signatures as heuristic edges. SymbolLattice keeps a stricter local-module proof for cross-package candidates and suppresses candidates whenever observed static Bind evidence could make an unprefixed route misleading.

## [0.132.0] - 2026-08-01

### Added

- GoFrame v1/v2 standard-router projection now accepts ordinary Go default imports at both cross-package boundaries. A request reference such as `contracts.ListReq` and a binding such as `&handlers.UsersController{}` become exact only when the root `go.mod` resolves each import to one indexed local package whose declared `package` is respectively `contracts` or `handlers`.
- Default package names are proven from the target package clause, never inferred from an import-path directory. Existing explicit import aliases remain supported without a package-name equality requirement.
- New extraction and service-level coverage verifies renamed package directories, default imports for both request and controller packages, preservation of chained Group/Domain evidence, incremental raw-fact reuse, and rejection when an imported target declares a mismatched package name.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v114` and the project resolver to `project-resolver-v35`. Existing graphs remain readable; the next explicit `sync` re-extracts Go facts and reprojects routes. SQLite schema is unchanged.

### Deliberate limits

- Default imports require one root local `go.mod`, one deterministic non-test representative, one target package clause matching the source qualifier, one unique request type, one unique controller method, and an already supported static GoFrame Bind receiver. `.`/`_` imports, import-path-name guesses, external/transitive modules, `replace`, nested-module selection, build tags, dynamic/reflection registration, rebindings, and ambiguity remain unresolved.

### Comparison notes

- At inspected CodeGraph commit `572d22bfbe82602080e457bec655f72e3314f9ef`, GoFrame synthesis heuristically matches `g.Meta` routes to method signatures. SymbolLattice v0.132 remains narrower in accepted runtime behavior, but its supported default-import slice proves the root module, target package clause, static Bind receiver, complete Group/Domain context, and persisted configuration evidence before emitting `exact`.

## [0.131.0] - 2026-08-01

### Added

- GoFrame v1/v2 route extraction now resolves a finite literal receiver chain rooted at a visible `g.Server()`: `Domain("host")` followed by one or more one-argument `Group("/prefix")` calls. Direct HTTP registrations, `Map`/`ALLMap`, callback Groups, and standard-router `Bind(&Controller{})` preserve the complete prefix and literal host condition.
- The same chain can be stored in one local receiver binding, so `api := g.Server().Group("/api").Group("/v1")` remains exact only while each segment is static and the binding is not rebound.
- New unit and service-level coverage verifies nested prefixes, literal domain evidence, callback propagation, map routes, standard-router bindings, incremental reuse, alias shadowing, and receiver rebinding rejection.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v113`. Existing graphs remain readable; the next explicit `sync` refreshes Go raw facts. Project-resolver and SQLite schema versions are unchanged.

### Deliberate limits

- Chained evidence is limited to a visible GoFrame import alias, `g.Server()` with no arguments, literal non-wildcard `Domain`, and literal one-argument `Group`. Arbitrary call chains, dynamic prefixes or hosts, variable propagation, unsupported callback shapes, `replace`, build tags, and runtime registration remain unresolved.

### Comparison notes

- The inspected CodeGraph GoFrame synthesizer snapshot does not reconstruct Group prefixes. SymbolLattice v0.131 remains narrower in accepted syntax, but records the exact static chain, Domain host, rule, and persisted route edge for the supported slice.

## [0.130.0] - 2026-08-01

### Added

- GoFrame v1/v2 standard-router projection now follows one root `go.mod` local-module path through explicit Go import aliases. It exactly joins a literal `g.Meta` request, a controller method accepting `*alias.Request`, and `Bind(&alias.Controller{})` across indexed package directories while preserving literal Group/Domain route context.
- The persisted GoFrame facts retain explicit package aliases for qualified request and controller references. Each projected route records the participating source paths and `go.mod` configuration evidence.
- Root `go.mod` is tracked in project index inputs and resolves one deterministic non-test source representative per local package directory. A configuration-only `sync` reprojects routes while reusing compatible persisted source facts.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v112`, the project resolver to `project-resolver-v34`, and project index inputs to `project-inputs-v4`. Existing graphs remain readable; the next explicit `sync` refreshes raw facts and configuration identity. SQLite schema is unchanged.

### Deliberate limits

- A cross-package result requires a literal root module declaration, explicit aliases at every package boundary, one indexed non-test representative, one unique target package, one unique request type, one unique controller method, and an already supported static GoFrame Bind receiver. Implicit import names, external/transitive packages, `replace`, nested-module selection, build tags, dynamic/reflection registration, rebindings, and ambiguity remain unresolved.
- Fully same-file standard-router routes remain owned by the syntax extractor; same-package cross-file routes retain their existing rule and are not duplicated by the module projection.

### Comparison notes

- At inspected CodeGraph commit `572d22bfbe82602080e457bec655f72e3314f9ef`, GoFrame synthesis performs a heuristic graph join for `g.Meta` request metadata and deliberately does not reconstruct Group prefixes or retain root-module configuration evidence.
- SymbolLattice v0.130 is narrower in its supported Go import grammar, but stronger for that slice: every cross-package route needs a root `go.mod`, explicit aliases, unique local package proof, persisted configuration evidence, and preserved literal Group/Domain context.

## [0.129.0] - 2026-08-01

### Added

- GoFrame v1/v2 standard-router extraction now projects one literal `g.Meta` request declaration through a unique controller method and `Bind(&Controller{})` registration when they are distributed across files in the same directly proven Go package directory. The projected route retains the composed literal Group prefix and every inherited literal `Server.Domain(...)` host condition.
- The persisted artifact-facts contract now retains package name, `g.Meta` request, controller-method, and Bind-registration facts for this projection. An unrelated incremental `sync` can therefore reuse unchanged Go files without losing the projected route.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v111` and the project resolver to `project-resolver-v33`. Existing graphs remain readable; the next explicit `sync` re-extracts unchanged source documents before the new cross-file projection is used. SQLite schema is unchanged.

### Deliberate limits

- A result requires one literal package clause, one indexed package directory, one unique request type, one unique controller method for that request type, and an already supported static GoFrame Bind receiver. Cross-package imports, build-tag selection, dynamic/reflection registration, qualified request types, rebindings, and ambiguous request or controller matches remain unresolved.
- Fully same-file standard-router routes remain owned by the syntax extractor and are not duplicated by the project resolver.

### Comparison notes

- At inspected CodeGraph commit `572d22bfbe82602080e457bec655f72e3314f9ef`, GoFrame synthesis joins `g.Meta` route metadata to controller methods through heuristic graph matching and deliberately does not reconstruct Group prefixes.
- SymbolLattice v0.129 is narrower for cross-package Go layouts, but stronger for the supported same-package cross-file slice: it requires unique package-local proof, preserves literal Group/Domain evidence, and persists the raw facts needed to reproduce the route on incremental sync.

## [0.128.0] - 2026-08-01

### Added

- GoFrame v1/v2 extraction now projects literal `Server.Domain(...)` registrations for `BindHandler`, `BindObjectMethod`, selected `BindObject`, and `BindObjectRest`. One comma-separated literal domain list produces one exact route edge per non-wildcard host condition.
- Persisted route records now expose `domain`, using `null` when no host condition exists. `SymbolLatticeService.routes`, CLI `routes --domain <host>`, and MCP `symbol_lattice_routes` all support the same exact domain filter.

### Fixed

- Route projection now preserves a source route's identity suffix, preventing symbol-ID collisions when otherwise identical method/path registrations differ only by their exact GoFrame domain condition.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v110`. Existing graphs remain readable with `domain: null` for old route evidence; the next explicit `sync` re-extracts unchanged source documents. SQLite schema and the project resolver version are unchanged.

### Deliberate limits

- Domain extraction requires a proven `g.Server()` receiver, one literal nonempty non-wildcard host or comma list, and a supported direct or un-rebound variable registration shape. Dynamic values, empty list entries, wildcards, wrapper/factory receivers, rebindings, and unproven handlers remain unresolved.
- The host condition is an exact route attribute, not a hostname parser or a runtime deployment model. It is never merged into a host-agnostic route.

### Comparison notes

- At inspected CodeGraph commit `572d22bfbe82602080e457bec655f72e3314f9ef`, GoFrame route synthesis is centered on `g.Meta` standard-router metadata and does not emit direct `Server.Domain(...).Bind*` object or handler route edges with host evidence.
- SymbolLattice v0.128 is stronger for the supported direct-domain slice because every result retains the literal host condition and a same-file exact handler edge. CodeGraph remains broader for its cross-file `g.Meta` standard-router synthesis, where SymbolLattice remains deliberately conservative.

## [0.127.0] - 2026-08-01

### Added

- GoFrame v1/v2 extraction now projects literal `Server.BindObject(pattern, object, "Method[, Method]")` registrations when every selected controller method is a unique same-file public `func(*ghttp.Request)` handler. The projection preserves a literal HTTP method or the `ALL` fallback; `Index` emits both the derived `/index` route and its base-path alias.
- Literal `Server.BindObjectRest(pattern, object)` registrations now project unique same-file REST object methods at the same path for `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `TRACE`, and `CONNECT`.
- Both surfaces accept direct `new(Controller)` / `&Controller{}` values or one un-rebound same-function local binding, and retain exact syntax evidence under `framework.goframe.direct-server.bind-object.local-object-method` or `framework.goframe.direct-server.bind-object-rest.local-object-method`.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v109`. Existing graphs remain readable; the next explicit `sync` re-extracts unchanged source documents. SQLite schema and the project resolver version are unchanged.

### Deliberate limits

- `BindObject` requires exactly one literal selector string with at least one unique simple default-name method, one literal non-trailing-slash pattern without `{.struct}` or `{.method}`, and a proven `g.Server()` receiver. Unfiltered reflection, extra variadic selectors, non-simple name conversion, `Init` / `Shut` lifecycle callbacks, factory/wrapper/rebound objects, cross-file controllers, ambiguous or unsupported handlers, Group/Domain receivers, and Domain host conditions remain unresolved.
- A tracked same-function `SetNameToUriType` call on the same Server makes subsequent `BindObject` registrations unresolved rather than assuming the default URI naming rule. `BindObjectRest` requires a literal path and only projects the proved HTTP-named handler subset.

### Comparison notes

- At inspected CodeGraph commit `572d22bfbe82602080e457bec655f72e3314f9ef`, the GoFrame resolver starts only for files containing `g.Meta`, emits standard-router metadata route nodes, and deliberately does not reconstruct reflective Group prefixes. It does not project direct `BindObject` or `BindObjectRest` route-to-method registrations.
- SymbolLattice v0.127 is stronger for the supported direct-object slice because every emitted edge has a literal registration, one static object identity, and one unique same-file handler signature. CodeGraph remains broader for its cross-file `g.Meta` standard-router synthesis, where SymbolLattice stays intentionally conservative.

## [0.126.0] - 2026-08-01

### Added

- GoFrame v1/v2 extraction now projects literal `Server.BindObjectMethod(pattern, object, method)` registrations. The pattern preserves one literal HTTP method or the `ALL` fallback, while the target must be a unique same-file public `func(*ghttp.Request)` controller method.
- Supported objects are direct `new(Controller)` / `&Controller{}` values or one un-rebound local binding created from either form. Every resulting route retains exact syntax evidence under `framework.goframe.direct-server.bind-object-method.local-object-method`.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v108`. Existing graphs remain readable; the next explicit `sync` re-extracts unchanged source documents. SQLite schema and the project resolver version are unchanged.

### Deliberate limits

- `BindObjectMethod` accepts only one proven `g.Server()` receiver, a literal pattern, a direct supported object or un-rebound local object binding, and one case-sensitive public literal method name with a unique same-file `*ghttp.Request` handler signature. Dynamic values, factories, wrappers, rebindings, Domain registrations, Group receivers, cross-file controllers, ambiguous methods, unsupported signatures, and multi-method registrations remain unresolved.

### Comparison notes

- The inspected CodeGraph GoFrame resolver only starts for files containing `g.Meta` and creates metadata routes for reflective standard routing; it does not project a direct `BindObjectMethod` route-to-method edge. SymbolLattice v0.126 therefore adds an exact, directly evidenced slice even in files without `g.Meta`.
- CodeGraph remains broader for its heuristic cross-file `g.Meta` request-type synthesis. SymbolLattice is intentionally narrower here: one source registration, one static object identity, and one same-file verified handler signature are required before emitting an exact edge.

## [0.125.0] - 2026-08-01

### Added

- GoFrame v1/v2 extraction now projects one literal `Group.Map(g.Map{...})` batch registration when every map key has an explicit HTTP method and every value is a unique same-file package-level function or direct method selector on a supported local object binding.
- Literal `Group.ALLMap(g.Map{...})` paths now project as `ALL` routes under the proven static or callback-group prefix. Batch entries retain their own exact syntax evidence, including distinct function and local-object-method rule IDs.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v107`. Existing graphs remain readable; the next explicit `sync` re-extracts unchanged source documents. SQLite schema and the project resolver version are unchanged.

### Deliberate limits

- GoFrame batch extraction accepts only a direct `g.Map` typed literal on one proven `RouterGroup`. `Map` requires an explicit supported HTTP-method key, while `ALLMap` requires a plain literal path. Raw map types, dynamic keys or values, inline handlers, partial batches, dynamic receivers, factory/wrapper/rebound objects, cross-file joins, multi-method tags, domain rules, and ambiguous handlers remain unresolved.

### Comparison notes

- The inspected CodeGraph GoFrame resolver creates metadata routes only for files containing `g.Meta`, explicitly leaves `Group` prefixes unreconstructed, and its companion request-type-to-method synthesis marks edges as heuristic. SymbolLattice v0.125 adds exact direct local `Map`/`ALLMap` evidence with complete supported group prefixes.
- CodeGraph remains broader for reflective, cross-file standard-router composition. SymbolLattice is stronger for the supported batch-registration slice because each projected route requires a literal map entry, a proven Group receiver and prefix, and one unique same-file handler target.

## [0.124.0] - 2026-08-01

### Added

- GoFrame v1/v2 extraction now follows one literal `Server.Group(prefix, func(group *ghttp.RouterGroup) { ... })` callback, including directly nested callback groups. Literal HTTP-method registrations inside the callback retain the full proven prefix.
- Direct `BindHandler` and Group HTTP-method registrations now resolve a direct method selector on one same-file local `&Controller{}` or `new(Controller)` binding, when exactly one matching method declaration exists. Callback-local `Bind` also contributes the proven group prefix to same-file standard-router routes.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v106`. Existing graphs remain readable; the next explicit `sync` re-extracts unchanged source documents. SQLite schema and the project resolver version are unchanged.

### Deliberate limits

- GoFrame accepts only a literal prefix, one direct callback whose sole parameter is `*ghttp.RouterGroup` through a non-ambiguous import alias, direct callback-body statements, named package-level function handlers, or direct selectors on the supported local object bindings. Inline handlers, multiple or dynamic callbacks, batch maps, factory/wrapper/rebound objects, cross-file joins, multi-method tags, domain rules, dynamic receivers/rules, and ambiguous handlers remain unresolved.

### Comparison notes

- The inspected CodeGraph GoFrame resolver continues to create `g.Meta` route nodes and then joins controller methods by request type across the graph; its companion edge is heuristic and its source intentionally does not reconstruct `Group` prefixes. SymbolLattice v0.124 adds exact local callback-group and object-method registration evidence while preserving literal prefixes for its supported forms.
- CodeGraph remains broader for cross-file standard-router composition. SymbolLattice is stronger for the new direct local slice: its route edge exists only after the literal registration, group prefix, local object binding, and one same-file target method are all syntax-proven.

## [0.123.0] - 2026-08-01

### Added

- GoFrame v1/v2 extraction now emits exact routes for literal-rule `g.Server().BindHandler` calls and static `Group` HTTP-method calls that name one unique package-level function.
- Same-file standard-router extraction now joins a literal `g.Meta` path/method tag, a directly bound controller, and its exported `context.Context, *Request` method. The resulting route retains syntax-stage evidence and a concrete controller-method symbol.

### Compatibility

- The artifact-facts extractor advances to `multi-language-ast-v105`. Existing graphs remain readable; the next explicit `sync` re-extracts unchanged source documents. SQLite schema and the project resolver version are unchanged.

### Deliberate limits

- GoFrame extraction rejects inline and object-method handler forms, callback `Group` forms, cross-file controller/request joins, multi-method tags, domain rules, dynamic receivers, dynamic rules, aliases with ambiguous imports, rebindings, and non-unique handlers.

### Comparison notes

- CodeGraph's GoFrame resolver recognizes `g.Meta` route nodes and joins controller methods by request-type signatures across the graph, but deliberately leaves reflective `Group` prefixes unreconstructed. SymbolLattice v0.123 additionally requires direct same-file controller binding before creating an exact route and preserves static group prefixes for its supported forms.
- CodeGraph remains broader for cross-file GoFrame composition. SymbolLattice is stricter for the supported slice: a route edge exists only when its literal registration/binding and handler are all syntax-proven.

## [0.122.0] - 2026-08-01

### Added

- Cargo workspace resolution now expands common `[workspace].members` globs (`*`, `?`, and `**`) and applies `[workspace].exclude` while selecting glob candidates. Explicit literal members retain Cargo precedence over the exclusion list.
- Glob expansion walks only project-relative directories, skips the same hard-excluded directories as source discovery, and fails closed for unsafe or unsupported patterns instead of guessing a member.
- Each globbed workspace persists a deterministic `cargo-workspace-member-glob` configuration snapshot. A newly added matching `Cargo.toml` therefore marks the graph stale even if it has no Rust source yet.

### Compatibility

- The project resolver advances to `project-resolver-v32` and the project-input identity advances to `project-inputs-v3`. Existing graphs remain readable; the next explicit `sync` or fresh `init` rebuilds their Cargo membership and freshness inputs. Artifact-fact and SQLite schemas are unchanged.

### Deliberate limits

- Cargo glob handling is intentionally limited to `*`, `?`, and `**`. Character classes, brace and `!` patterns, Cargo's implicit path-dependency membership, registry/transitive/dev/build dependencies, non-inline dependency tables, target-specific dependency sections, custom library paths, and crates without a scanned `src/lib.rs` remain unresolved.
- Cross-crate Actix projection remains limited to one or two direct module hops and literal callbacks/routes. Re-exports, `#[path]`, inline modules, macros, wrappers, closures, and dynamic paths remain unresolved.

### Comparison notes

- The checked CodeGraph Cargo helper expands `members` with `picomatch` and a bounded directory walk, but its shown member parser does not apply `[workspace].exclude`. SymbolLattice adds exclusion handling, explicit freshness tracking, and local-path/package/module proof; its glob grammar is currently narrower than CodeGraph's `picomatch` surface.
- CodeGraph remains ahead in daemon lifecycle, socket/PID registry, cross-client coordination, worker-pool concurrency, and broader semantic resolution. v0.122 is a verified Cargo-aware route-analysis increment, not a general parity claim.

## [0.121.0] - 2026-08-01

### Added

- Cargo workspace resolution now proves a second direct local dependency form: a root `[workspace.dependencies]` inline-table `path` entry inherited by an importing member through the same dependency key and `{ workspace = true }`. Root package aliases remain verified against the target member's `package.name`.
- The resolver accepts only Cargo-permitted member-side `features` and `optional` modifiers alongside `workspace = true`; every other member-side dependency field remains unresolved. A root workspace dependency that declares `optional`, a registry-only workspace dependency, or a missing root local-path proof also remains unresolved.
- Cross-crate Actix Web `ServiceConfig` projection now follows this inherited dependency form while retaining the root, importing, and target manifests plus the complete Rust module path in edge evidence. A root `Cargo.toml` workspace-dependency change is covered by the existing project-input fingerprint and makes the graph stale.

### Compatibility

- The project resolver advances to `project-resolver-v31`. Existing graphs remain readable; the next explicit `sync` or fresh `init` rebuilds projections with the new dependency proof. Artifact-fact and project-input formats are unchanged.

### Deliberate limits

- Cargo workspace resolution still excludes glob members, registry/transitive/dev/build inherited dependencies, non-inline dependency tables, target-specific dependency sections, custom library paths, and crates without a scanned `src/lib.rs`.
- Cross-crate Actix projection remains limited to one or two direct module hops and literal callbacks/routes. Re-exports, `#[path]`, inline modules, macros, wrappers, closures, and dynamic paths remain unresolved.

### Comparison notes

- CodeGraph's checked Cargo workspace helper maps workspace member names broadly, including glob member patterns. SymbolLattice now supports a common workspace-dependency form but independently requires local-path, member opt-in, target-manifest, and Rust-module proof before creating a cross-crate route relationship.
- CodeGraph remains ahead in daemon lifecycle, socket/PID registry, cross-client coordination, worker-pool concurrency, and broader semantic resolution. v0.121 is a verified Cargo-aware route-analysis increment, not a general parity claim.

## [0.120.0] - 2026-07-31

### Added

- Rust module resolution now includes an evidence-gated Cargo workspace resolver. It accepts a literal `[workspace] members` list (including multiline arrays), an implicit root package, or an explicit member; it maps only a scanned target `src/lib.rs`.
- A cross-crate result additionally requires an exact direct `[dependencies]` inline-table `path` dependency from the importing crate to the target member. The dependency key becomes the Rust crate name; an explicit Cargo `package` alias is accepted only when it matches the target manifest name. Registry, transitive, and same-name filesystem guesses remain unresolved.
- Actix Web imported `ServiceConfig` facts now retain their `importRoot` and optional `workspaceCrateName`. A supported workspace mount projects through target `lib.rs` and one or two direct Rust module declarations, retaining the mounting file, complete module chain, and consulted Cargo manifests in edge evidence.
- Project index inputs now persist Cargo root/member manifest hashes. A manifest-only change therefore makes a generation stale before any route is claimed from it.

### Compatibility

- The index-input identity advances to `project-inputs-v2`; the artifact facts extractor advances to `multi-language-ast-v104`; the project resolver advances to `project-resolver-v30`. Existing graphs remain readable, while the next explicit `sync` or fresh `init` safely refreshes their inputs, facts, and projections.
- The persisted `importRoot` and `workspaceCrateName` mount fields are additive. Pre-v0.120 local-module facts continue to be interpreted as local only.

### Deliberate limits

- Cargo workspace resolution deliberately excludes glob members, `workspace = true`, registry/transitive/dev/build dependencies, non-inline dependency tables, target-specific sections, custom library paths, and crates without a scanned `src/lib.rs`.
- Cross-crate Actix projection remains limited to one or two direct module hops and literal callbacks/routes. Re-exports, `#[path]`, inline modules, macros, wrappers, closures, and dynamic paths remain unresolved.

### Comparison notes

- The checked CodeGraph Rust resolver maps workspace crate names from Cargo workspace membership. SymbolLattice independently adds direct path-dependency and target-manifest proof before it links a cross-crate Actix callback, making this narrower but more auditable rather than a copy of CodeGraph.
- CodeGraph remains ahead in daemon lifecycle, socket/PID registry, cross-client coordination, worker-pool concurrency, and broader semantic resolution. v0.120 is a verified Cargo-aware route-analysis increment, not a general parity claim.

## [0.119.0] - 2026-07-31

### Added

- Rust Actix Web `ServiceConfig` projection now accepts one nested direct module path from a crate root: `crate::api::routes::configure` or `self::api::routes::configure`. The root module and its child must each retain exactly one direct external `mod name;` fact.
- The resolver proves each physical hop independently: `api.rs` or `api/mod.rs`, then `api/routes.rs` or `api/routes/mod.rs`. Projected edges preserve the complete root-to-callback module resolution path and use a distinct `direct-module-path` evidence rule; the existing one-module rule IDs remain stable.
- The additive `modulePath` mount fact persists in SQLite artifact JSON. Focused coverage verifies facts, root and scope projection, both intermediate/final Rust file conventions, raw attribute-route preservation when intermediate proof is absent, and incremental mount-prefix updates that reuse unchanged nested facts.

### Compatibility

- The artifact facts extractor advances to `multi-language-ast-v103` and the project resolver to `project-resolver-v29`. Existing indexes remain readable; the next explicit `sync` or fresh `init` safely re-extracts Rust facts and rebuilds the projection.
- `modulePath` is additive and optional for pre-v0.119 persisted mount facts. No graph-schema migration or CLI/MCP contract change is required.

### Deliberate limits

- Only one or two direct external module segments are accepted from `main.rs` or `lib.rs`. Re-exports, `#[path]`, inline modules, deeper module paths, ambiguity, dynamic composition, wrappers, and nonliteral route surfaces remain unprojected.

### Comparison notes

- The checked CodeGraph Rust resolver recognizes raw Actix HTTP attributes plus text patterns for `web::resource(...)` and app-level `.route(...)`. It contains no `ServiceConfig`, `.configure(...)`, or `web::scope(...)` pattern in that resolver. This independent SymbolLattice slice adds a stricter, evidence-gated cross-file static surface rather than copying CodeGraph behavior.
- CodeGraph remains ahead in daemon lifecycle, socket/PID registry, cross-client coordination, worker-pool concurrency, and broader semantic resolution. v0.119 is a verified route-analysis increment, not a general parity claim.

## [0.118.0] - 2026-07-31

### Added

- Rust route extraction now retains `RustActixServiceConfigFacts`: direct external `mod name;` declarations, unique type-proven `ServiceConfig` callbacks, and direct imported callback mounts through `App::configure(...)` or `web::scope(...).configure(...)`.
- The project resolver projects a literal callback route only from `main.rs` or `lib.rs` through one direct `crate::module::callback` or `self::module::callback` import. It resolves exactly one sibling `module.rs` or `module/mod.rs`, one exported callback, and one same-module handler; projected edges retain module-stage evidence and a mount-file-to-callback-file resolution path.
- Attribute routes are replaced only after that complete cross-file proof succeeds. Unsupported module forms, missing `mod` proof, non-exported callbacks, ambiguity, dynamic composition, nested modules, re-exports, and `#[path]` modules remain unprojected.
- SQLite artifact-facts payloads now persist the additive Rust ServiceConfig facts. Focused coverage verifies root and scoped mounts, aliases, `self` imports, `routes/mod.rs`, an incremental prefix update that reuses the unchanged callback fact, rejected boundaries, and preservation of raw attribute routes when proof is absent.

### Compatibility

- The artifact facts extractor advances to `multi-language-ast-v102` and the project resolver to `project-resolver-v28`. Existing indexes remain readable; the next explicit `sync` or fresh `init` safely re-extracts Rust facts and rebuilds the projection.
- `rustActixServiceConfigFacts` is additive JSON in persisted artifact facts. No graph-schema migration or CLI/MCP contract change is required.

### Comparison notes

- [Actix Web documents](https://actix.rs/docs/application/) `configure` on both `App` and `web::Scope`, using a `&mut web::ServiceConfig` callback. The checked CodeGraph Rust resolver recognizes raw HTTP attributes plus resource and app-route text patterns, but has no `ServiceConfig`, `.configure(...)`, or `web::scope` projection in that resolver. This independent SymbolLattice slice adds narrower, evidence-gated cross-file coverage for that static surface.
- CodeGraph remains ahead in daemon lifecycle, socket/PID registry, cross-client coordination, worker-pool concurrency, and broader semantic resolution. v0.118 is a verified route-analysis improvement, not a general parity claim.

## [0.117.0] - 2026-07-31

### Added

- Rust route extraction now projects literal same-file Actix Web `ServiceConfig` routes through contiguous `App::new().configure(config)` and `web::scope("/prefix").configure(config)` mounts, preserving their effective paths.
- A supported callback has one direct, unambiguous `&mut web::ServiceConfig` parameter or a direct imported `ServiceConfig` alias. Its direct `cfg.route(...)`, mounted resource, scope, attribute-service, and named nested `cfg.configure(...)` calls are projected only when every path and handler remains static.
- Handler proof is evaluated in the callback's own lexical scope. Callback parameters, local `use` declarations, local named functions, and sequential local bindings cannot resolve to a same-named top-level handler. A recursive configuration cycle or an unsupported direct route-bearing call fails closed.

### Compatibility

- The artifact facts extractor advances to `multi-language-ast-v101`. Existing indexes remain readable; the next explicit `sync` or fresh `init` safely re-extracts Rust facts. No graph-schema migration or CLI/MCP contract change is required.

### Comparison notes

- [Actix Web documents](https://actix.rs/docs/application/) `configure` on both `App` and `web::Scope`, using a `&mut web::ServiceConfig` callback. The checked CodeGraph Rust resolver recognizes raw HTTP attributes plus resource and app-route text patterns, but has no `ServiceConfig`, `.configure(...)`, or `web::scope` projection in that resolver. This independent SymbolLattice slice adds stricter exact coverage for that static surface.
- CodeGraph remains ahead in daemon lifecycle, socket/PID registry, cross-client coordination, worker-pool concurrency, and broader semantic resolution. v0.117 is a verified route-analysis improvement, not a general parity claim.

## [0.116.0] - 2026-07-31

### Added

- Rust route extraction now projects direct same-file Actix Web HTTP attribute handlers through a contiguous `App::new().service(handler)` chain, a direct `web::scope("/prefix").service(handler)` chain, and nested static scopes. Each projected route receives its effective mounted path.
- Mounted root handlers retain `framework.actix-web.direct-app.attribute-service.literal-path.local-function` evidence. Scoped and nested-scoped handlers retain `framework.actix-web.direct-app.web-scope.attribute-service.literal-path.local-function` evidence. A direct, unshadowed named local handler and its direct imported attribute macro are required.
- Attribute declarations are collected before builder traversal. An Actix declaration is suppressed only after a proven mount of that handler; unmounted or shadowed handlers retain their original `framework.actix-web.attribute-route.literal-path.local-function` fact.
- Direct block-local `use` declarations and named local functions now participate in lexical-shadow checks, including a later local function item. They cannot fabricate an exact relation to a same-named top-level handler.

### Compatibility

- The artifact facts extractor advances to `multi-language-ast-v100`. Existing indexes remain readable; the next explicit `sync` or fresh `init` safely re-extracts Rust facts. No graph-schema migration or CLI/MCP contract change is required.

### Comparison notes

- Actix Web documents scopes as composable prefixes for attached services. The checked CodeGraph Rust resolver recognizes raw HTTP attributes plus resource and app builder text patterns, but does not compose `web::scope` prefixes or direct attribute-service mounts in that resolver. This independent SymbolLattice slice adds stricter effective-path and mount-evidence coverage for that static surface.
- CodeGraph remains ahead in daemon lifecycle, socket/PID registry, cross-client coordination, worker-pool concurrency, and broader semantic resolution. v0.116 is a verified route-analysis improvement, not a general parity claim.

## [0.115.0] - 2026-07-31

### Added

- Rust route extraction now recognizes one strict Actix Web `web::scope("/prefix")` builder surface inside a direct `App::new()` chain. Literal scoped `.route("/path", web::METHOD().to(handler))`, mounted `web::resource("/path")` chains, and nested static scopes compose into their effective route paths.
- Scoped routes retain `framework.actix-web.direct-app.web-scope.literal-path.local-function` syntax evidence. Scope prefixes must be direct, unambiguous `actix_web::web` calls, slash-prefixed literals without a trailing slash except root, and all paths must lead to one same-file named handler.

### Compatibility

- The artifact facts extractor advances to `multi-language-ast-v99`. Existing indexes remain readable; the next explicit `sync` or fresh `init` safely re-extracts Rust facts. No graph-schema migration or CLI/MCP contract change is required.

### Comparison notes

- Actix Web documents scopes as prefixes that are prepended to attached resources and can nest. CodeGraph's checked Rust resolver recognizes resource and app builder text patterns but has no corresponding scope-prefix extraction in that resolver. This independent SymbolLattice slice therefore expands verified coverage beyond that checked surface while remaining deliberately narrower than runtime composition.
- CodeGraph remains ahead in daemon lifecycle, socket/PID registry, cross-client coordination, worker-pool concurrency, and broader semantic resolution. v0.115 improves route-analysis coverage and traceability, not daemon parity.

## [0.114.0] - 2026-07-31

### Added

- Rust route extraction now recognizes one strict Actix Web `App::new()` builder surface: contiguous literal `.route("/path", web::METHOD().to(handler))` calls and directly mounted `web::resource("/path")` chains with literal `web::METHOD().to(handler)` or `.to(handler)` handlers. `App` and `web` must be direct, unambiguous `actix_web` imports; aliases are supported.
- Builder routes retain exact syntax evidence: `framework.actix-web.direct-app.route.literal-path.local-function` for app-level routes and `framework.actix-web.direct-app.web-resource.literal-path.local-function` for mounted resources. The direct resource `.to(handler)` form is retained as `ALL`.

### Compatibility

- The artifact facts extractor advances to `multi-language-ast-v98`. Existing indexes remain readable; the next explicit `sync` or fresh `init` safely re-extracts Rust facts. No graph-schema migration or CLI/MCP contract change is required.

### Comparison notes

- CodeGraph's checked Rust resolver recognizes Actix resource and app builder forms through permissive text patterns. This independent SymbolLattice slice adds a narrower AST-backed version that proves direct imports, an unshadowed contiguous `App::new()` receiver, static paths, a directly mounted resource, and one same-file named handler.
- CodeGraph remains ahead in daemon lifecycle, socket/PID registry, cross-client coordination, worker-pool concurrency, and broader semantic resolution. v0.114 improves route-analysis parity and traceability, not daemon parity.

## [0.113.0] - 2026-07-31

### Added

- Rust route extraction now recognizes direct Actix Web and Rocket HTTP attribute macros. An exact route requires one unambiguous direct import (including an alias), one supported literal slash path, and the directly annotated same-file top-level function handler.
- Each emitted route retains framework-specific syntax evidence: `framework.actix-web.attribute-route.literal-path.local-function` or `framework.rocket.attribute-route.literal-path.local-function`. Unimported macros, same-name imports from multiple frameworks, dynamic paths, extra attribute arguments, and attributes on non-functions fail closed.

### Compatibility

- The artifact facts extractor advances to `multi-language-ast-v97`. Existing indexes remain readable; the next explicit `sync` or fresh `init` safely re-extracts Rust source facts. No graph-schema migration or CLI/MCP contract change is required.

### Comparison notes

- CodeGraph's checked Rust framework resolver also covers Actix and Rocket patterns. This independent SymbolLattice slice adds a narrower AST-backed route projection with explicit import provenance and exact local-handler evidence.
- CodeGraph remains ahead in daemon lifecycle, socket/PID registry, cross-client coordination, worker-pool concurrency, and deeper language/semantic resolution. SymbolLattice's v0.113 improvement is framework-breadth progress, not daemon-parity.

## [0.112.0] - 2026-07-31

### Added

- Python route extraction now retains `DjangoUrlFacts` for final literal `urlpatterns` entries with local top-level function handlers and for direct `path(prefix, include(imported_urlconf))` composition. Supported URLConf imports are deliberately limited to single-name one-dot-relative `from .package import urls` and `from .package.urls import urlpatterns` forms; the project resolver projects an exact route only when both modules belong to one regular package proven by every required `__init__.py` marker.
- A projected Django route is owned by the child URLConf module and retains module-stage evidence with both parent and child URLConf paths. Its final path joins the literal parent `include` prefix with the child literal path. Parent-relative imports, namespace packages, import chains, nested includes, dynamic includes or prefixes, rebindings, ambiguous imports, and missing local handlers remain unprojected rather than guessed.
- Django URL facts persist through the SQLite artifact-facts payload. The extractor version advances to `multi-language-ast-v96` and the project resolver version to `project-resolver-v27`, so an explicit `sync` safely re-extracts unchanged source facts and rebuilds cross-file projections. Focused tests cover both supported import forms, rejected boundaries and rebindings, persistence, exact route output, and an incremental parent-prefix update that reuses the unchanged child URLConf artifact. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.112.0.md`.

### Compatibility

- Existing indexes remain readable. The next explicit `sync` (or a fresh `init`) refreshes cached artifact facts because extraction and resolver versions changed; no graph schema migration is required.
- The new `djangoUrlFacts` field is additive in persisted artifact JSON and the public extraction type surface. Existing route, CLI, MCP, and read-only query contracts remain unchanged.

### Comparison notes

- CodeGraph's checked Django resolver recognizes `include('app.urls')` as a URLConf dependency and retains direct routes. This release independently adds a stricter relative-import path that projects a parent include prefix through child URL patterns, with module-stage evidence and incremental artifact reuse.
- CodeGraph remains ahead in daemon lifecycle, PID/socket registry, cross-client coordination, worker-pool concurrency, error-log operations, and broader parser/semantic depth. SymbolLattice's new route projection is an independent framework-analysis capability, not a daemon-parity claim.

## [0.111.0] - 2026-07-31

### Added

- Python route extraction now retains `FlaskBlueprintFacts` for direct Blueprint declarations, literal decorated handlers, and direct single-name one-dot relative Blueprint imports used by a literal Flask `register_blueprint` call. The project resolver projects the resulting exact routes only when both modules belong to one regular package proven by every required `__init__.py` marker.
- A projected route is owned by the Blueprint module and retains module-stage evidence with both the registration and Blueprint module paths. Its final path combines the literal registration prefix, Blueprint prefix, and decorator path. Parent-relative imports, namespace packages, import chains, rebinding, dynamic registrations, ambiguous Blueprint declarations, and missing handlers remain unprojected rather than guessed.
- Flask Blueprint facts persist through the SQLite artifact-facts payload. The extractor version advances to `multi-language-ast-v95` and the project resolver version to `project-resolver-v26`, so an explicit `sync` safely re-extracts unchanged source facts and rebuilds cross-file projections. Focused tests cover facts, persistence, exact route output, rejected boundaries and rebindings, and an incremental mount-prefix update that reuses the unchanged Blueprint artifact. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.111.0.md`.

### Compatibility

- Existing indexes remain readable. The next explicit `sync` (or a fresh `init`) refreshes cached artifact facts because extraction and resolver versions changed; no graph schema migration is required.
- The new `flaskBlueprintFacts` field is additive in persisted artifact JSON and the public extraction type surface. Existing route, CLI, MCP, and read-only query contracts remain unchanged.

### Comparison notes

- This extends SymbolLattice's framework-route breadth with a verifiable cross-file Flask composition path, while preserving evidence and reject-by-default behavior rather than copying CodeGraph implementation.
- CodeGraph remains ahead in daemon lifecycle, PID/socket registry, cross-client coordination, worker-pool concurrency, error-log operations, and broader parser/semantic depth. SymbolLattice's new route projection is an independent framework-analysis capability, not a daemon-parity claim.

## [0.110.0] - 2026-07-31

### Added

- `serve --mcp` and the standalone `watch` command now acquire a project-local SQLite exclusive owner lock at `.symbol-lattice/auto-sync-owner.sqlite` before starting an automatic foreground watcher. A successful host holds the transaction for its lifecycle and releases it during shutdown; an operating-system SQLite lock avoids stale PID-file or heartbeat-expiry recovery rules.
- A competing host still starts its read-only MCP server but skips the watcher and reports `autoSync.state: "blocked"`, `watcherMode: "blocked"`, and a safe `ownerLease` status through the existing auto-sync status and diagnostics tools. The durable journal records the bounded `owner-lease-unavailable` transition when journal writes are enabled, without disclosing another host's PID or path.
- `--no-auto-sync` does not construct, acquire, or create an owner lock. The auto-sync safety gate runs before owner-lock acquisition, so a rejected broad project path cannot gain a lock database. Focused integration coverage proves mutual exclusion, post-release succession, read-only contention behavior, standalone-watch rejection, release cleanup (including signal-registration failure), no-auto-sync behavior, and safety-gate ordering. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.110.0.md`.

### Compatibility

- Existing graph indexes remain readable; the owner lock is a new file separate from `index.sqlite` and does not migrate graph or diagnostic-journal schemas.
- Existing read-only MCP tools retain their contracts. The auto-sync status and diagnostics payloads add `ownerLease`; clients that validate exact schemas should accept this additive field and the new `blocked` state, watcher mode, and `owner-lease-unavailable` event.

### Comparison notes

- This independently closes one concrete CodeGraph operational gap: a local project now has a verified single-writer watcher gate rather than allowing concurrent `serve --mcp` hosts to attempt the same graph synchronization.
- CodeGraph remains ahead in daemon lifecycle, PID/socket registry, daemon discovery, cross-client coordination, worker-pool concurrency, and error-log operations. SymbolLattice's owner lock is deliberately a small local foreground-watcher guard, not a claim of daemon or distributed-leader-election parity; no CodeGraph source was copied.

## [0.109.0] - 2026-07-31

### Added

- The capability-gated, read-only `symbol_lattice_auto_sync_journal` MCP tool returns bounded durable watcher transitions for the default project. It has no project override or mutation input. Its result explicitly reports journal availability (`active`, `read-only`, `unavailable`, or `failed`), 128-event capacity, retained/evicted/truncated counts, latest persisted time, and a structured I/O error when appropriate.
- The CLI-owned foreground watcher now persists sanitized `AutoSyncDiagnosticEvent` records, including a per-host UUID that disambiguates per-host sequences, into `.symbol-lattice/auto-sync-diagnostics.sqlite` for already initialized projects. SQLite transactions retain the newest 128 events and maintain a durable evicted-event counter, so multiple local hosts do not depend on an unbounded NDJSON file or a last-writer-wins rewrite.
- `serve --mcp` accepts `--no-diagnostic-journal` to disable journal writes. MCP request handlers only receive the journal's read seam; the only append call is the watcher receipt callback. Uninitialized projects do not gain a `.symbol-lattice` directory solely because diagnostics were requested. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.109.0.md`.

### Compatibility

- The v0.108 in-memory `symbol_lattice_auto_sync_diagnostics` timeline remains unchanged at 32 events. Durable history is an additive capability and its tool is absent from embeddings that do not expose `autoSyncJournal`.
- Existing graph indexes remain readable; the journal is a separate project-local SQLite file and does not migrate or change `index.sqlite` schema. The standard CLI MCP host exposes the new tool, while `--no-auto-sync` and `--no-diagnostic-journal` prevent journal appends.

### Comparison notes

- CodeGraph's daemon and error-log surface remains more complete for process lifecycle, registry discovery, ownership, and long-running operations. This release independently adds a bounded, transactional, project-local diagnostic history that is directly consumable by MCP clients after host restart.
- SymbolLattice still has no daemon, socket registry, leader-election protocol, worker pool, or tamper-proof audit log. The persistent journal is intentionally presented as an operational evidence layer, not full CodeGraph daemon parity; no CodeGraph source was copied.

## [0.108.0] - 2026-07-31

### Added

- The capability-gated, read-only `symbol_lattice_auto_sync_diagnostics` MCP tool returns a bounded chronological watcher timeline for the default MCP host. Each retained event carries only safe receipt-derived operational facts: sequence, transition, resulting watcher state/mode, generation ID, retry or error information, and the existing bounded pending-file summary. `limit` accepts 1 through 32 latest events, while retention metadata reports capacity, returned count, dropped events, and truncation.
- `AutoSyncStatusTracker` now owns the fixed 32-event in-memory journal and returns defensive copies. It records every accepted foreground-watch receipt after reducing it into the public state, so a diagnostic event describes the resulting state rather than a pre-transition guess.
- CLI MCP composition now adds a diagnostic seam alongside the existing status seam. A diagnostics request safely catches a live `getStatus` read error and returns `{ status: null, error }` plus the watcher snapshot/timeline, enabling fault diagnosis without turning a query into an index operation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.108.0.md`.

### Compatibility

- No SQLite schema, artifact-extractor, resolver, route, or persisted graph-query contract version changes are required. Existing initialized indexes remain readable. Diagnostics are host-memory only and reset with the MCP process.
- Existing MCP embeddings retain their current tool list unless they explicitly expose `autoSyncDiagnostics`. The standard CLI MCP host exposes both automatic-sync status and diagnostics. Neither tool accepts a project override or any mutation control.

### Comparison notes

- The local CodeGraph watcher has pending-file and lock-unavailable rescheduling paths, while its daemon infrastructure adds process/socket lifecycle controls and registry discovery. SymbolLattice now gives its own MCP clients a bounded, queryable timeline of watcher transitions, including the otherwise opaque case where a live index read fails.
- CodeGraph remains ahead in persistent daemon operations, cross-client coordination, worker-pool throughput, error logs, and broader diagnostics. SymbolLattice's history is deliberately session-local and bounded; it is not presented as a daemon or audit-log substitute, and no CodeGraph source was copied.

## [0.107.0] - 2026-07-31

### Added

- `serve --mcp` now exposes the capability-gated, read-only `symbol_lattice_auto_sync_status` MCP tool. It combines the default host's live `getStatus` result with a watcher receipt snapshot: enabled state, lifecycle state, watcher mode, retry delay, last synchronization or event-watch error, and the existing bounded pending-file summary.
- `AutoSyncStatusTracker` is a non-mutating application seam fed only by `ForegroundWatch` receipts. A CLI-owned proxy adds this one status method to the MCP host while binding every original service method to the real service, so query handlers still receive no synchronization capability. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.107.0.md`.
- Recovery from an initial or later status-check failure now emits `fresh-observed` when the next check is healthy without a pending event. This prevents an observable MCP status from remaining in a retry state after its watcher has recovered.

### Compatibility

- No SQLite schema, artifact-extractor, resolver, route, or persisted graph-query contract version changes are required. Existing initialized indexes remain readable; the added MCP tool is optional for embedding services and is always present for the CLI MCP host.
- The status tool is explicitly host-scoped and has no `projectPath` or mutation input. It only reports the MCP host's configured default project; it never initializes a project, expands index scope, indexes, or synchronizes.

### Comparison notes

- The local CodeGraph implementation exposes watcher state through `isWatching()` and operates a daemon with lifecycle and registry controls. SymbolLattice now gives MCP clients a concrete view of its own single-process watch health instead of requiring users to infer it from timing or stderr.
- CodeGraph remains ahead in daemon lifecycle, cross-client coordination, worker-pool throughput, and richer operations surfaces. v0.107.0 closes the observability gap for one local MCP host; it does not claim daemon parity or copy CodeGraph source.

## [0.106.0] - 2026-07-31

### Added

- `serve --mcp` now composes the existing foreground freshness watcher with the stdio MCP host. For an initialized project, it reads the active status, performs one incremental catch-up before MCP is available when stale, then uses the existing debounced native filesystem-event path with bounded polling fallback. The watcher remains separately owned by the CLI host: every MCP tool retains its read-only contract and receives no indexing callback.
- MCP stdio startup now returns an internal close-aware session. Parent stdin `end` / `close` cleanly stop the server session, which lets the CLI stop its watcher instead of retaining a timer after the parent MCP client disconnects. The injectable transport and input seams add focused lifecycle coverage without changing tool schemas or public query responses.
- `serve --mcp` adds `--sync-interval <ms>`, `--poll`, `--no-auto-sync`, and `--force` controls. The default is automatic incremental freshness; `--no-auto-sync` preserves an explicitly manual lifecycle for controlled or diagnostic use. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.106.0.md`.

### Compatibility

- No SQLite schema, artifact-extractor, resolver, route, or query-contract version changes are required. Existing initialized indexes remain readable; a stale active generation is refreshed by the default MCP host before it accepts requests.
- Default `serve --mcp` deliberately requires an existing initialized index, just like `watch`. It never silently initializes a project or expands persisted scope. Run `init` first, or use `--no-auto-sync` to retain the former no-watcher MCP bootstrap behavior.

### Comparison notes

- This closes the most visible operational gap found in the local CodeGraph comparison: its MCP daemon documents connect-time catch-up, debounced filesystem watching, and stale-state handling, while SymbolLattice previously required a separate manual `sync` / `watch` process. The implementation is original composition of SymbolLattice's existing watcher and MCP host; no CodeGraph source was copied.
- SymbolLattice is still a single local Node.js MCP process with one watcher and polling fallback. The inspected CodeGraph source remains ahead in daemon lifecycle management, worker-pool concurrency, parser breadth and semantic depth, and mature operational diagnostics. Automatic freshness improves parity but is not a claim of complete CodeGraph equivalence.

## [0.105.0] - 2026-07-31

### Added

- The first-party `elysia` capability adds syntax-proven TypeScript and JavaScript `elysia` application route evidence. It accepts a direct runtime named `Elysia` import (including an alias), an immutable direct `const app = new Elysia()` receiver with no constructor options, a slash-prefixed string-literal path, and named identifier middleware/terminal handlers. The terminal identifier creates the existing source-ranged route node and a pending `routes` reference; `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, and `all` are mapped to the existing HTTP method contract.
- Same-file, imported, and re-exported Elysia handlers reuse the deterministic resolver with Elysia-specific `framework.elysia.app.literal-route.*` evidence. Focused extraction, capability-registry, resolver, and JavaScript service integration coverage prove aliases, accepted methods, lexical shadowing, type-only/default/namespace/foreign/CommonJS rejection, persisted facts, and exact route queries. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.105.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v94`; the project resolver remains `project-resolver-v25` because the added resolver branch only labels Elysia facts freshly produced by this extractor version. A pre-v0.105 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Elysia-capable facts.
- No SQLite schema migration or new query command is required. This is an additive framework capability with the same persisted route contract.

### Comparison notes

- The inspected local CodeGraph query did not expose an Elysia-specific route extractor in the returned source surface. SymbolLattice v0.105 independently adds a deliberately narrow, provenance-preserving slice without copying CodeGraph source or claiming complete Elysia support.
- Elysia documents direct verb routes, grouping, constructor prefixes, plugins, and custom methods. This release intentionally excludes `group`, constructor prefixes, `use`, `route`, chained expressions, and inline handlers because they need additional static proof before they can safely compose route paths or resolve a handler.

## [0.104.0] - 2026-07-31

### Added

- The first-party `hono` capability adds syntax-proven TypeScript and JavaScript `hono` application route evidence. It accepts a direct runtime named `Hono` import (including an alias), an immutable direct `const app = new Hono()` receiver with no constructor options, a slash-prefixed string-literal path, and named identifier middleware/terminal handlers. The terminal identifier creates the existing source-ranged route node and a pending `routes` reference; `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, and `all` are mapped to the existing HTTP method contract.
- Same-file, imported, and re-exported Hono handlers reuse the deterministic resolver with Hono-specific `framework.hono.app.literal-route.*` evidence. Focused extraction, capability-registry, resolver, and JavaScript service integration coverage prove aliases, accepted methods, lexical shadowing, type-only/default/namespace/foreign/CommonJS rejection, persisted facts, and exact route queries. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.104.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v93`; the project resolver remains `project-resolver-v25` because the added resolver branch only labels Hono facts freshly produced by this extractor version. A pre-v0.104 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Hono-capable facts.
- No SQLite schema migration or new query command is required. This is an additive framework capability within existing TypeScript/JavaScript source discovery, route symbol, route-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a Hono compiler, runtime router, middleware scheduler, path matcher, deployment adapter, or execution tracer. It deliberately excludes default/namespace/CommonJS imports, constructor options, `app.on`, `app.use`, `app.route`, `app.basePath`, `app.mount`, chained routes, dynamic/array paths or methods, inline/member handlers, and runtime behavior.
- The inspected local CodeGraph query did not expose a Hono-specific route extractor in the returned source surface. SymbolLattice v0.104 independently adds a deliberately narrow, provenance-preserving slice without copying CodeGraph source or claiming complete Hono support.

## [0.103.0] - 2026-07-31

### Added

- The first-party `koa` capability adds syntax-proven TypeScript and JavaScript `@koa/router` route evidence. It accepts a direct runtime default import, an immutable direct `const router = new Router()` receiver with no constructor options, a slash-prefixed string-literal path, and named identifier middleware/terminal handlers. The terminal identifier creates the existing source-ranged route node and a pending `routes` reference; `get`, `post`, `put`, `patch`, `delete` / `del`, `head`, `options`, `connect`, `trace`, and `all` are mapped to the existing HTTP method contract.
- Same-file, imported, and re-exported Koa handlers reuse the existing deterministic resolver but now retain Koa-specific `framework.koa.router.literal-route.*` evidence rather than falling back to Express evidence. Focused extraction, capability-registry, resolver, and service integration coverage prove accepted methods, lexical shadowing, type-only/foreign/CommonJS rejection, persisted facts, and exact route queries. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.103.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v92`; the project resolver remains `project-resolver-v25` because the added resolver branch only labels Koa facts freshly produced by this extractor version. A pre-v0.103 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Koa-capable facts.
- No SQLite schema migration or new query command is required. This is an additive framework capability within existing TypeScript/JavaScript source discovery, route symbol, route-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a Koa compiler, runtime router, middleware scheduler, path matcher, dependency injector, or execution tracer. It deliberately excludes legacy `koa-router` / CommonJS, namespace and named imports, constructor options and prefixes, mutable or reassigned receivers, `router.use`, mount and nested-router composition, `router.routes()` wiring, regex/array/dynamic paths, named-route overloads, inline/member handlers, and runtime behavior.
- The inspected local CodeGraph query did not expose a Koa-specific route extractor in the returned source surface. SymbolLattice v0.103 independently adds a deliberately narrow, provenance-preserving slice without copying CodeGraph source or claiming complete Koa support.

## [0.102.0] - 2026-07-31

### Added

- Source discovery now recognizes case-insensitive `.ads`, `.adb`, and `.ada` files. The additive `ada` language is available through the existing persisted source-search, CLI, and MCP language-validation contracts.
- The dependency-free extractor retains a file symbol plus complete direct Ada `package`, `package body`, `procedure`, and `function` library units. Packages and package bodies use the existing `module` symbol kind; procedures and functions use `function`. A direct one-line procedure/function declaration ending in `;` is also retained. Every accepted unit has its source range and an exact file-to-symbol `contains` edge with `language.ada.<kind>.direct-library-unit` syntax evidence. Unit, discovery, and service integration coverage prove comments/strings, child package names, nested-member exclusion, malformed-input safety, persisted facts, and language-filtered source search. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.102.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v91`; the project resolver remains `project-resolver-v25` because the initial Ada facts are direct file-local declarations. A pre-v0.102 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Ada-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within existing file, module/function-symbol, exact-containment-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not an Ada compiler, grammar validator, type checker, elaboration model, generic-instantiation resolver, spec/body linker, or runtime tracer. It excludes package members, `with` / `use`, aspect clauses, multi-line profiles, generic/task/protected/separate units, renamings, operators, cross-file resolution, and execution behavior.
- Only explicitly named `end Name;` terminators complete the supported multiline units; an unmatched named end or unterminated string rejects the source file. Other unsupported forms emit no Ada symbol. The inspected local CodeGraph baseline did not expose a dedicated Ada artifact-language extractor in the searched source surface; SymbolLattice v0.102 independently adds this narrow, source-range-preserving slice without copying CodeGraph source or claiming complete Ada support.

## [0.101.0] - 2026-07-31

### Added

- Source discovery now recognizes case-insensitive fixed-form `.f`, `.for`, and `.f77` plus free-form `.f90`, `.f95`, `.f03`, `.f08`, and `.f18` files. The additive `fortran` language is available through the existing persisted source-search, CLI, and MCP language-validation contracts.
- The dependency-free extractor retains a file symbol plus complete direct `module`, `program`, `subroutine`, and `function` program units. Modules and programs use the existing `module` symbol kind, while subroutines and functions use `function`; each accepted unit has its source range and an exact file-to-symbol `contains` edge with `language.fortran.<kind>.direct-program-unit` syntax evidence. Unit, discovery, and service integration coverage prove fixed/free-form selection, nested-member exclusion, malformed-input safety, SQLite persistence, and language-filtered source search. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.101.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v90`; the project resolver remains `project-resolver-v25` because the initial Fortran facts are direct file-local declarations. A pre-v0.101 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Fortran-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within existing file, module/function-symbol, exact-containment-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a Fortran compiler, grammar validator, type checker, module resolver, generic-interface model, preprocessor, or runtime tracer. It excludes `contains` members, `interface`, `submodule`, and derived-type contents, `use` dependencies, module procedures, common blocks, include files, preprocessing, cross-file resolution, and execution behavior.
- A generic `END` used to close a supported unit, continuation line, mismatched named end, or incomplete supported unit deliberately rejects the source file rather than guessing a declaration. The inspected local CodeGraph baseline did not expose a dedicated Fortran artifact-language extractor in the searched source surface; SymbolLattice v0.101 independently adds this narrow, source-range-preserving slice without copying CodeGraph source or claiming complete Fortran support.

## [0.100.0] - 2026-07-31

### Added

- Source discovery now recognizes case-insensitive `.groovy` files and exposes the additive `groovy` language through the existing persisted source-search, CLI, and MCP language-validation contracts. The dependency-free extractor retains a file symbol plus complete direct top-level `class`, `interface`, `trait`, `enum`, and `def name(...) { ... }` declarations.
- Each accepted Groovy declaration keeps its complete source range and an exact file-to-symbol `contains` edge with `language.groovy.<kind>.direct-top-level` syntax evidence. A `trait` intentionally maps to the existing `interface` kind; comments, shebangs, ordinary strings, and triple-quoted strings are offset-preservingly masked before selection. Focused unit, discovery, and service integration coverage prove ranges, nested-declaration exclusion, malformed-input safety, persisted facts, and language-filtered source search. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.100.0.md`.
- `README.md` is now a concise Traditional Chinese default, with an equivalent `README.en.md` English version. Both cross-link at the top and are included in the package file list.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v89`; the project resolver remains `project-resolver-v25` because the initial Groovy facts are direct file-local declarations. A pre-v0.100 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Groovy-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within existing file, class/interface/type/function-symbol, exact-containment-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a Groovy compiler, grammar validator, type checker, runtime model, Gradle parser, Grails model, or dynamic-dispatch tracer. It excludes declaration members, `extends` / `implements` relations, trait composition, annotations as semantic facts, imports, closures, properties, scripts, Gradle DSLs, Grails conventions, AST transforms, metaprogramming, compilation, cross-file resolution, and execution behavior.
- Any unmasked script-scope `/` (including slashy/dollar-slashy strings and division) deliberately rejects the file because the lexical context can be ambiguous. The initial slice chooses no declaration facts over a possible false symbol. The inspected local CodeGraph baseline did not expose a dedicated Groovy artifact-language extractor in the searched source surface; SymbolLattice v0.100 independently adds this narrow, source-range-preserving slice without copying CodeGraph source or claiming complete Groovy support.

## [0.99.0] - 2026-07-31

### Added

- The first-party `jakarta-rest` capability adds direct Java Jakarta REST / JAX-RS route evidence. A resource class needs exactly one direct imported or fully-qualified `jakarta.ws.rs.Path` or legacy `javax.ws.rs.Path` annotation with one literal URI template; methods need exactly one direct imported or fully-qualified marker `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS` annotation and an optional one-literal `@Path` suffix.
- Each accepted local route creates the existing source-ranged `route` node and exact `routes` edge to its direct Java method, with `framework.jakarta-rest.direct-path.literal-method-mapping.local-method` syntax evidence. Relative and slash-prefixed literal paths are normalized through the existing join contract; focused unit, capability-registry, and service integration coverage prove current/legacy imports, fully-qualified annotations, literal `value`, persisted facts, source search, and dynamic/wildcard/multi-method/unsupported-path rejection. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.99.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v88`; the project resolver remains `project-resolver-v25` because Jakarta REST route facts are direct file-local syntax evidence. A pre-v0.99 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Jakarta-REST-capable facts.
- No SQLite schema migration or query command is required. This is an additive Java framework capability within existing class, method, route-symbol, exact-route-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a Jakarta REST / JAX-RS compiler, deployment model, URI-template validator, dependency-injection model, or runtime router. It excludes `ApplicationPath`, inherited/sub-resource locators, custom `@HttpMethod` annotations, method `@Path` without a request-method annotation, `Consumes` / `Produces`, parameter binding, media negotiation, exception mappers, filters/interceptors, `javax`/`jakarta` ecosystem resolution, Quarkus/RESTEasy configuration, OpenAPI, code generation, cross-file handlers, compilation, and runtime behavior.
- The inspected local CodeGraph baseline has a generic Java extractor but no dedicated JAX-RS / Jakarta REST `@Path` plus HTTP-request-annotation route capability in the searched source surface. SymbolLattice v0.99 independently adds a deliberately narrow, import-proven route slice; it does not copy CodeGraph source or claim full Java REST framework coverage.

## [0.98.0] - 2026-07-31

### Added

- Protocol Buffers source discovery now recognizes case-insensitive `.proto` extensions and exposes the additive `proto` language through the existing persisted source-search, CLI, and MCP language-validation contracts. The dependency-free lexical extractor retains a file symbol plus complete direct top-level `message`, `enum`, and `service` declarations.
- A complete direct `message` becomes an existing `class`, `enum` becomes a `type`, and `service` becomes an `interface`, each with an exact `language.proto.<kind>.direct-definition` containment edge and source range. Direct semicolon-terminated service members in the narrow `rpc Name(Request) returns (Response);` form (including `stream` and dotted message names) become contained `method` symbols with exact `language.proto.rpc.direct-service-member` evidence. Unit, discovery, and service integration coverage prove ranges, nested-declaration exclusion, malformed-input safety, SQLite persistence, and language-filtered source search. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.98.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v87`; the project resolver remains `project-resolver-v25` because the Protocol Buffers facts are direct file-local declarations. A pre-v0.98 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Proto-capable facts.
- No SQLite schema migration or new query command is required. This is an additive artifact-language capability within existing file, class/interface/type/method-symbol, exact-containment-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a Protocol Buffers compiler, grammar validator, descriptor builder, import resolver, gRPC transport model, or runtime model. It excludes `syntax` / `edition` validation, packages, imports, fields, maps, oneofs, options, enum values, reserved/extension declarations, nested declarations, message-type references, service options, RPC option blocks, streaming semantics beyond recognizing `stream`, HTTP annotations, generated code, cross-file contracts, code generation, validation, and execution behavior.
- The inspected local CodeGraph baseline does not include `proto` in its runtime `LANGUAGES` or native-kernel language lists. SymbolLattice v0.98 independently adds a deliberately narrow, source-range-preserving Proto declaration slice; it does not copy CodeGraph source or claim full protobuf/gRPC coverage.

## [0.97.0] - 2026-07-31

### Added

- A bounded NestJS GraphQL framework projection now retains only one direct, non-type-only named-import `@Resolver(() => Identifier)` class decorator (including an import alias) when its factory is zero-argument, synchronous, expression-bodied, and a single identifier. The persisted `nestGraphqlFacts` payload keeps the resolver class ID, schema-type name, and exact identifier range without treating the TypeScript value as a schema declaration.
- During project resolution, the resolver class gains a `references` edge only when exactly one indexed GraphQL object `type` symbol has the same name. The cross-language name bridge is explicitly `heuristic` at confidence `0.85` with `framework.nestjs.graphql.resolver-schema.unique-object-type` evidence; missing or duplicate candidates remain target-null `unresolved` edges with their candidate IDs and a specific rule ID. Focused extraction and service integration coverage prove aliases, source ranges, SQLite payload persistence, unique linking, and ambiguity rejection. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.97.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v86` and the project resolver to `project-resolver-v25`. A pre-v0.97 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes the new raw resolver facts and their cross-file projection.
- No SQLite schema migration or new query command is required: the additive `nestGraphqlFacts` field is persisted inside the existing versioned artifact-facts JSON payload, while pre-v0.97 generations remain readable without claiming this capability.

### Deliberate limits

- This is not a semantic GraphQL or NestJS runtime linker. It rejects no-argument, array, async, block-bodied, multi-argument, namespace, type-only, foreign, shadowed, wrapped, and custom resolver decorator forms; it does not infer resolver fields, `@Query` / `@Mutation` / `@Subscription` schema fields, resolver arguments, imports, code-first schemas, schema composition, federation, transport, or execution behavior.
- The inspected local CodeGraph baseline detects NestJS GraphQL decorators and operation names but does not index standalone GraphQL schema files. SymbolLattice v0.97 builds its own narrow schema-plus-framework relation from its prior source-ranged schema facts; it does not copy CodeGraph source or present a same-name cross-language match as exact proof.

## [0.96.0] - 2026-07-31

### Added

- GraphQL source discovery now recognizes case-insensitive `.graphql`, `.gql`, and `.graphqls` extensions and exposes the additive `graphql` language through existing persisted source-search, CLI, and MCP language-validation contracts. The new dependency-free lexical extractor retains a file symbol plus source-ranged direct schema definitions.
- Complete direct object `type`, `interface`, `input`, and `enum` bodies, plus simple `scalar` and `union Name = Member | Member` forms, become existing `class`, `interface`, or `type` symbols with exact `language.graphql.<kind>.direct-definition` containment evidence. Comments, ordinary strings, block-string descriptions, directive values, and nested delimiters are masked or bounded before definition selection; unit, discovery, and service integration coverage prove declaration ranges, artifact persistence, language-filtered search, and extension/operation/malformed rejection. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.96.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v85`; the project resolver remains `project-resolver-v24` because the initial GraphQL facts are file-local declarations with no schema-to-resolver or cross-file schema projection. A pre-v0.96 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes GraphQL-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within existing file, class/interface/type-symbol, exact-containment-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a GraphQL parser, schema validator, federation engine, resolver linker, code generator, client/server, or runtime model. It excludes extensions, fields, arguments, defaults, descriptions/directives as semantic facts, interfaces/union relationships, root schema mapping, operation documents/fragments, introspection, imports, cross-file composition, NestJS resolver linkage, validation, transport, and execution behavior.
- The inspected local CodeGraph baseline has NestJS GraphQL decorator analysis but does not include standalone `.graphql` / `.gql` / `.graphqls` schema files in its runtime `LANGUAGES` or native-kernel language lists. SymbolLattice v0.96 independently adds a deliberately narrow, source-range-preserving schema declaration slice; it does not copy CodeGraph source or claim full GraphQL coverage.

## [0.95.0] - 2026-07-31

### Added

- SQL source discovery now recognizes case-insensitive `.sql` extensions and exposes the additive `sql` language through existing persisted source-search, CLI, and MCP language-validation contracts. The new dependency-free lexical extractor retains a file symbol plus complete direct `CREATE TABLE` and `CREATE VIEW` schema `resource` symbols with unquoted literal qualified names.
- The SQL DDL slice accepts semicolon-terminated direct `CREATE TABLE` forms with `IF NOT EXISTS`, `TEMP` / `TEMPORARY`, `LOCAL` / `GLOBAL TEMP`, or `UNLOGGED`, plus direct `CREATE [OR REPLACE] [TEMP] VIEW ... AS SELECT` / `WITH` forms. Each resource has a complete source range and an exact `contains` edge with `language.sql.create-table.direct-ddl` or `language.sql.create-view.direct-ddl` evidence. Comments, quoted data, and quoted identifiers are offset-preservingly masked; unit, discovery, and service integration coverage prove statement boundaries, persistence, language-filtered search, and unsupported-shape rejection. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.95.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v84`; the project resolver remains `project-resolver-v24` because the initial SQL facts are file-local declarations with no schema dependency resolution. A pre-v0.95 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes SQL-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within existing file, resource-symbol, exact-containment-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a SQL grammar, dialect detector, migration executor, database connection, or runtime model. It excludes quoted/dynamic names, `CREATE TABLE AS`, table clauses after the closed body, materialized/recursive/column-list views, columns, constraints, indexes, types, sequences, triggers, DML, dependencies, stored procedures/functions, dollar-quoted SQL, migration ordering, cross-file schema resolution, validation, query planning, and runtime behavior.
- The inspected local CodeGraph baseline does not include `sql` in its runtime `LANGUAGES` or native-kernel language lists. SymbolLattice v0.95 independently adds a deliberately narrow, source-range-preserving SQL DDL declaration slice; it does not copy CodeGraph source or claim full SQL-dialect coverage.

## [0.94.0] - 2026-07-31

### Added

- Java Micronaut Controller support now recognizes direct imports or fully-qualified `io.micronaut.http.annotation.Controller` annotations and direct local `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`, and `Trace` method annotations. A marker annotation, one positional literal, or one literal `value` (`uri` on methods) is enough to build a source-ranged exact route to the declared local method.
- Micronaut route facts share the existing local Java class/method/route graph surface, source search, CLI, MCP, retained artifact-fact persistence, and `routes` query. Every emitted route carries `framework.micronaut.direct-controller.literal-method-mapping.local-method` syntax evidence. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.94.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v83`; the project resolver remains `project-resolver-v24` because direct Micronaut routes are file-local syntax facts. A pre-v0.94 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Micronaut-capable facts.
- No SQLite schema migration or query command is required. This is an additive Java framework capability within existing class, method, route-symbol, exact route-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a full Micronaut router or runtime model. It excludes Kotlin/Groovy, wildcard/static imports, meta-annotations, `uris` arrays, URI aliases, media-type/port/condition arguments, multiple mapping annotations, custom HTTP methods, RouteBuilder/programmatic routes, controller inheritance, route filters, error handlers, dependency injection, validation, OpenAPI, compilation, and runtime behavior.
- The inspected local CodeGraph baseline exposes Spring-oriented configuration analysis but did not contain a Micronaut implementation in its searched source surface. SymbolLattice v0.94 independently adds a deliberately narrow, import-proven Micronaut route slice; it does not copy CodeGraph source or claim full Micronaut coverage.

## [0.93.0] - 2026-07-31

### Added

- Shell/Bash source discovery now recognizes case-insensitive `.sh` and `.bash` extensions and exposes the additive `shell` language through existing persisted source-search, CLI, and MCP language-validation contracts. The new dependency-free lexical extractor retains a file symbol plus complete direct top-level POSIX `name() { ... }` and Bash `function name { ... }` function symbols.
- Each accepted Shell function has its complete source range and an exact file-to-function `contains` edge carrying `language.shell.function.direct-top-level` evidence. Strings, comments, escapes, and `${...}` parameter expansions are masked before brace matching; functions nested in direct control-flow/group shapes, incomplete source, quoted/commented lookalikes, and here-documents do not become declarations. Unit, discovery, and service integration coverage prove both declaration forms, source ranges, persistence, source search, nested/incomplete rejection, and here-document safety. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.93.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v82`; the project resolver remains `project-resolver-v24` because the initial Shell slice emits only file-local declaration and containment facts. A pre-v0.93 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Shell-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within existing file, function-symbol, exact-containment-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a Shell parser, shellcheck integration, or execution model. It excludes extensionless shebang scripts, zsh/fish dialects, command calls, `source`/dot imports, aliases, nested/group/control-flow function declarations, `eval`, here-documents, command substitution analysis, pipelines, redirections, arrays, traps, module/package resolution, environment variables, linting, and runtime behavior.
- The inspected local CodeGraph baseline does not list Shell/Bash among its runtime `LANGUAGES` entries. SymbolLattice v0.93 independently adds a deliberately narrow, source-range-preserving Shell declaration slice; it does not copy CodeGraph source or claim full shell-language coverage.

## [0.92.0] - 2026-07-31

### Added

- The first-party framework registry now includes `spring-boot-properties`. A direct Java field inside a direct class can retain a raw property-reference fact only when an exact `org.springframework.beans.factory.annotation.Value` import or fully-qualified annotation proves one static `${key}` or `${key:default}` literal. The source range is the annotation itself; property values are never retained.
- Project resolution now considers only parser-proven keys in conventional `application.properties`, `application-*.properties`, `bootstrap.properties`, and `bootstrap-*.properties` files. A unique literal key becomes an exact class-to-key `references` edge with `framework.spring-boot.properties.direct-value.literal-key.exact-key` evidence. Missing and duplicate keys remain explicit unresolved `references` edges with rule-specific evidence, candidate IDs, and applicable configuration paths; no profile or precedence guess is made.
- `references` is now a first-class static traversal relation for direct callers, callees, bounded evidence paths, and reverse impact paths. SQLite raw-artifact serialization persists the additive Spring Boot property facts so an explicit sync can safely reproject them. Unit, graph, and service integration coverage prove field/import boundaries, source ranges, persistence, exact queryability, ambiguous/missing evidence, value non-retention, and traversal. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.92.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v81` and the project resolver to `project-resolver-v24` because the release adds persisted cross-file Spring Boot property-reference projection. A pre-v0.92 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes complete facts and graph evidence.
- No SQLite schema migration or query command is required. The additive raw-fact payload and `references` edge use existing artifact-fact, graph, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a general Spring configuration model. It excludes YAML, Kotlin, `@ConfigurationProperties`, method or parameter annotations, aliases/wildcard imports, named or dynamic arguments, string concatenation/escaping, nested placeholders, SpEL, relaxed binding, active-profile selection, precedence/default merging, imports, environment overrides, validation, values, and runtime behavior.
- The inspected local CodeGraph baseline has broader Spring configuration detection, including YAML/property configuration candidates, `@Value`, `@ConfigurationProperties`, relaxed binding, and profile heuristics. SymbolLattice v0.92 independently adds a narrower persistence-safe proof that resolves only one unique conventional properties key and makes uncertainty explicit; it does not copy CodeGraph source or claim parity.

## [0.91.0] - 2026-07-31

### Added

- Java `.properties` source discovery now recognizes every case-insensitive `.properties` extension and exposes the additive `properties` language through the existing persisted source-search, CLI, and MCP language-validation contracts. The new dependency-free parser retains a file symbol plus source-ranged `variable` symbols for literal non-empty keys across all properties filenames.
- The parser accepts comments, `=`, `:`, whitespace-separated, and no-value entries; it decodes source-proven escaped separators, whitespace, and `\\uXXXX` key characters. Value-continuation lines are consumed so they cannot become false declarations. Key ranges, symbols, and edge evidence never include property values, and each exact file-to-key containment edge carries `syntax.properties.literal-key` evidence. Unit, discovery, and service integration coverage prove escaped-key identities, duplicate ordinals, continuation safety, value omission from artifact facts, malformed/dangling/continued-key exclusion, persisted provenance, and source-search filtering. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.91.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v80`; the project resolver remains `project-resolver-v23` because properties facts are direct file-local declarations with no cross-file configuration binding. A pre-v0.91 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes properties-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within existing file, variable-symbol, exact-containment-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a complete Java `Properties` runtime model. It excludes continued keys, malformed escapes, control-character keys, profile/config precedence, placeholders, interpolation, default merging, encoding/runtime loading behavior, value semantics, Spring `@Value` / `@ConfigurationProperties`, framework detection, cross-file resolution, schema validation, and runtime behavior.
- The inspected local CodeGraph baseline tracks generic `.properties` files at file level and has a Spring-specific `application` / `bootstrap` key and binding pass. SymbolLattice v0.91 independently adds generic, parser-backed key facts across all `.properties` names with source key ranges and explicit containment evidence; it does not copy CodeGraph source or claim Spring parity.

## [0.90.0] - 2026-07-31

### Added

- The XML extractor now has a bounded MyBatis 3 mapper pass. A parser-valid `<mapper namespace="Java.FQN">` accepts direct `select`, `insert`, `update`, `delete`, and `sql` child elements with simple identifier `id` values as source-ranged `method` symbols qualified as `Java.FQN::id`. The standard MyBatis Mapper 3.0 DTD declaration is the only DTD exception; it is checked as literal syntax and is never fetched, expanded, or evaluated.
- A self-closing literal same-mapper `<include refid="id"/>` inside one accepted statement becomes an exact `calls` edge only when one same-file `sql` fragment proves the target. Missing or ambiguous fragments retain an explicit unresolved `calls` edge with `framework.mybatis.mapper.literal-include.*` evidence. Unit and service integration coverage prove standard-DTD acceptance, statement containment, nested literal includes, exact source ranges, source search, invalid namespace/id rejection, unsupported DTD rejection, and persisted graph queries. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.90.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v79`; the project resolver remains `project-resolver-v23` because MyBatis statement and include facts resolve only inside one XML source file. A pre-v0.90 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes MyBatis-capable facts.
- No SQLite schema migration or query command is required. This is an additive XML-framework capability within existing file, method-symbol, exact/unresolved call-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a general MyBatis, iBatis, SQL, XML DOM, DTD/entity, schema, or Java project model. It excludes iBatis `<sqlMap>`, result maps, cache/configuration, dynamic SQL tags, statement attribute and SQL-text semantics, dotted/cross-mapper includes, generated interfaces, cross-file Java mapper resolution, DTD/entity processing, validation, and runtime behavior.
- The inspected local CodeGraph baseline is broader: it supports MyBatis 3 plus iBatis 2 statement forms, richer statement metadata, and mapper include references. SymbolLattice v0.90 independently adds a deliberately narrower parser-backed MyBatis 3 subset with complete source ranges and explicit exact/unresolved same-file evidence; it does not copy CodeGraph source or claim parity.

## [0.89.0] - 2026-07-31

### Added

- XML source discovery now recognizes `.xml` files and exposes the new `xml` language through persisted source search plus the existing CLI and MCP language validation contracts. The new `saxes@6.0.0` event-parser-backed extractor accepts one well-formed, DTD-free document and retains only the root element plus its direct child elements as source-ranged `resource` symbols.
- Each retained XML resource has exact `contains` evidence: `syntax.xml.root-element` from file to root and `syntax.xml.direct-child-element` from root to direct child. Unit, discovery, and service integration coverage prove complete element ranges, duplicate-safe child paths, nested-descendant exclusion, persisted source search, and malformed/multi-root/DTD fail-closed behavior. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.89.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v78`; the project resolver remains `project-resolver-v23` because XML resource facts are file-local. A pre-v0.89 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes XML-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within the existing file, resource-symbol, containment-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a general XML DOM, namespace, XPath/XQuery, DTD/entity/schema, XInclude, import, code-generation, configuration, or runtime model. It excludes attributes and values, text/CDATA/comments/processing instructions, namespace resolution, XML below the direct-child level, MyBatis/Spring-specific semantics, cross-file resolution, validation, and runtime behavior.
- The inspected local CodeGraph baseline tracks generic XML at file level and has a narrower MyBatis-specific XML path. SymbolLattice v0.89 independently adds parser-backed generic root/direct-child source ranges and containment evidence, but does not claim MyBatis parity or copy CodeGraph source.

## [0.88.0] - 2026-07-31

### Added

- The executable first-party framework capability registry and route-framework provenance now include `drupal`. Parser-backed YAML extraction recognizes only valid single-document `*.routing.yml` / `*.routing.yaml` files whose direct route mapping proves a slash-prefixed literal `path`, a direct `defaults._controller` in `\Drupal\…\Class::method` form, and either a literal uppercase pipe-separated `requirements._method` set or no method requirement (`ALL`).
- Each accepted Drupal route becomes a first-class `route` symbol with exact `framework.drupal.routing-yaml.literal-controller.route-node` containment evidence and an explicit unresolved `routes` edge retaining the controller spelling. Unit and service integration coverage prove `.yml` / `.yaml` discovery, method expansion/filtering, persisted source search and route queries, and rejection of service/Form controller syntax, unsupported methods, malformed requirements, anchors, and multi-document input. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.88.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v77`; the project resolver remains `project-resolver-v23` because the Drupal route node and its explicitly unresolved controller evidence are file-local. A pre-v0.88 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Drupal-route-capable facts.
- No SQLite schema migration or query command is required. This is an additive YAML-framework capability within the existing file, route-symbol, route-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a general Drupal/Symfony route model. It excludes service controller syntax, `_form`, `_entity_form`, entity views/lists, hooks, aliases, dynamic route providers, route options/access semantics, aliases/anchors/tags/merge semantics, block/multiline scalars, duplicate or malformed requirements, PHP namespace/autoload/controller resolution, compilation, and runtime routing behavior.
- The inspected local CodeGraph baseline has a broader Drupal resolver that detects Drupal projects and recognizes controller, form, and hook relationships. SymbolLattice v0.88 independently adds parser-backed source ranges and explicit unresolved controller evidence for a deliberately narrower static YAML controller subset; it does not copy CodeGraph source or claim full Drupal parity.

## [0.87.0] - 2026-07-31

### Added

- YAML source discovery now recognizes `.yaml` and `.yml` files and exposes the new `yaml` language through persisted source search plus the existing CLI and MCP language validation contracts. The new `yaml@2.9.0` parser-backed extractor accepts one parser-valid document with a top-level mapping and produces variables only for source-ranged, untagged, unanchored top-level scalar key/value pairs that remain on one line.
- Each retained YAML key has an exact `contains` edge with `syntax.yaml.top-level-scalar-mapping` evidence. Unit, discovery, and service integration coverage prove `.yaml` / `.yml` recognition, quoted/scalar values, nested-map/sequence exclusion, anchored/alias/tagged exclusion, malformed and multi-document fail-closed behavior, persisted provenance, and YAML source-search filtering. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.87.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v76`; the project resolver remains `project-resolver-v23` because YAML facts are direct, file-local declarations with no configuration-reference resolution. A pre-v0.87 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes YAML-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within the existing file, variable-symbol, containment-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a general YAML configuration model. It excludes nested mappings/sequences, empty or null values, aliases, anchors, explicit tags, block scalars, complex keys, multi-document streams, merge/configuration semantics, schemas, imports, calls, routes, framework recognition, cross-file resolution, deployment behavior, and runtime values.
- The inspected local CodeGraph baseline tracks YAML files generally at file level and has a Spring-specific handwritten leaf-key pass for `application` / `bootstrap` YAML configuration. SymbolLattice v0.87 independently adds parser-backed, source-ranged declaration facts for a deliberately narrow top-level subset across all YAML filenames, rather than claiming broad configuration semantics or copying CodeGraph source.

## [0.86.0] - 2026-07-31

### Added

- Go Echo route extraction now recognizes direct non-dot/non-blank imports of `github.com/labstack/echo/v4` and `github.com/labstack/echo/v5`, using the default `echo` name or a direct alias. A route requires a same-function short-variable `app := echo.New()` binding, a literal slash-prefixed path, one unshadowed named package-level handler, and either a direct App method or a proven nested same-function literal `Group` prefix. Direct `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, and `Any` registrations become exact route evidence; `Any` is represented as `ALL`.
- The executable first-party framework capability registry, `RouteFramework` provenance union, persisted route query, and Go route evidence now include `echo`. Unit and service integration coverage prove v5 aliases, v4 default imports, nested group composition, exact rule IDs, `ALL` method filtering, and rejection of dynamic paths, alias shadows, inline/middleware handlers, `Match`, `var` constructors, mutable receivers, and unsupported group forms. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.86.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v75`; the project resolver remains `project-resolver-v23` because the Echo App, Group, path, and handler proof remains file-local. A pre-v0.86 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Echo-capable facts.
- No SQLite schema migration or query command is required. This is an additive Go framework capability within the existing file, symbol, route-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- The Echo slice is not a general Echo program model. It excludes middleware, `Match`, `File` / static helpers, path parameters/wildcard semantics, handlers other than one named package-level function, `var`/factory/wrapper/chained/mutable receiver flow, cross-file packages, generic Go analysis, compilation, and runtime routing behavior.
- The inspected local CodeGraph baseline labels its broad generic Go receiver-method resolver as covering Echo, but does not require Echo v4/v5 imports, `echo.New()` construction, literal Group-prefix composition, or unique same-file handler identity. SymbolLattice v0.86 is deliberately narrower in source coverage and stronger in auditability; it is independently implemented and does not copy CodeGraph source.

## [0.85.0] - 2026-07-31

### Added

- Zig source discovery now recognizes `.zig` files and exposes the new `zig` language through persisted source search plus the existing CLI and MCP language validation contracts. A syntactically balanced Zig file produces direct top-level named `struct`, `enum`, `union`, and `opaque` containers as class symbols plus direct named `fn` declarations as function symbols; `pub` and `export fn` visibility is retained.
- The first Zig extractor preserves source offsets while masking line comments, quoted literals, and line-oriented multiline string literal lines. It emits exact `syntax.zig.top-level-container` or `syntax.zig.top-level-function` containment evidence and rejects unbalanced delimiters, unterminated quoted literals, anonymous/computed containers, nested container or test-scope declarations, imports, calls, and runtime behavior. Unit, discovery, and service integration coverage prove the retained scope, source-search persistence, and rejection boundaries. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.85.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v74`; the project resolver remains `project-resolver-v23` because the initial Zig facts are file-local. A pre-v0.85 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Zig-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within the existing file, symbol, containment-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a Zig parser, compiler, build-system, package/module resolver, or runtime model. It excludes imports, calls, variables, `test` blocks, nested methods, anonymous/comptime/generated containers, aliases, `usingnamespace`, cross-file resolution, type inference, build configuration, compilation, and runtime behavior.
- The inspected local CodeGraph baseline has no `zig` member in its current `LANGUAGES` registry. SymbolLattice v0.85 therefore expands language breadth beyond that checked baseline, while retaining a deliberately narrower, independently implemented source-proven declaration contract.

## [0.84.0] - 2026-07-31

### Added

- Go Fiber route extraction now recognizes direct non-dot/non-blank imports of `github.com/gofiber/fiber/v2` and `github.com/gofiber/fiber/v3`, using the default `fiber` name or a direct alias. A route requires a same-function short-variable `app := fiber.New()` binding, a literal slash-prefixed path, one unshadowed named package-level handler, and either a direct App method or a proven nested same-function literal `Group` prefix. Direct `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`, `Trace`, `Connect`, and `All` registrations become exact route evidence; `All` is represented as `ALL`.
- The executable first-party framework capability registry, `RouteFramework` provenance union, persisted route query, and Go route evidence now include `fiber`. Unit and service integration coverage prove v3 aliases, v2 default imports, nested group composition, exact rule IDs, method filtering, and rejection of dynamic paths, alias shadows, inline/middleware handlers, configured/factory/`var` constructors, mutable receivers, and unsupported group forms. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.84.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v73`; the project resolver remains `project-resolver-v23` because the Fiber App, Group, path, and handler proof remains file-local. A pre-v0.84 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Fiber-capable facts.
- No SQLite schema migration or query command is required. This is an additive Go framework capability within the existing file, symbol, route-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- The Fiber slice is not a general Fiber program model. It excludes constructor configuration, `Use`, `Route`, `RouteChain`, mounted sub-apps, group middleware, path parameters/constraints semantics, automatic `HEAD`, handlers other than one named package-level function, `var`/factory/wrapper/chained/mutable receiver flow, cross-file packages, generic Go analysis, compilation, and runtime routing behavior.
- The inspected local CodeGraph baseline recognizes Go framework-looking method calls including Fiber through a broad receiver pattern. SymbolLattice v0.84 is narrower in source coverage but adds explicit v2/v3 import and App-construction proof, group-prefix provenance, exact unique same-file handler identity, and fail-closed rebinding behavior; it is independently implemented and does not copy CodeGraph source.

## [0.83.0] - 2026-07-31

### Added

- COBOL source discovery now recognizes `.cbl`, `.cob`, `.cobol`, and `.cpy` paths and exposes the new `cobol` language through persisted source search plus the existing CLI and MCP language validation contracts. A source file produces a program module only after exactly one direct `IDENTIFICATION DIVISION.`, `PROGRAM-ID. name.`, and `PROCEDURE DIVISION.` sequence; direct free-format or fixed-format Area-A Procedure Division paragraph labels become contained function symbols.
- The first COBOL extractor masks fixed-format comment lines, `*>` comments, and complete quoted literals before scanning, preserves offsets for evidence, and fails closed for unterminated literals, duplicate programs, missing divisions, and `.cpy` copybook input. Unit and service integration coverage verifies all supported extensions, fixed/free paragraph containment, exact evidence, persisted provenance, source search, and rejection boundaries. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.83.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v72`; the project resolver remains `project-resolver-v23` because the initial COBOL facts are file-local. A pre-v0.83 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes COBOL-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within the existing file, symbol, containment-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a COBOL grammar, compiler, copybook resolver, or runtime model. Data/section/declarative declarations, `PERFORM` / `CALL` relations, nested programs, `PROCEDURE DIVISION USING`, compiler directives/source formats, dialect semantics, project resolution, CICS/SQL/JCL, compilation, and runtime behavior remain outside scope.
- The inspected local CodeGraph baseline has a COBOL Tree-sitter grammar and broader general syntax extraction. SymbolLattice v0.83 is intentionally narrower, but adds persistent language-filtered source search and explicit rule IDs for the source-proven program/paragraph subset; it is independently implemented and does not copy CodeGraph source.

## [0.82.0] - 2026-07-31

### Added

- Pascal Horse route extraction now accepts a direct main-program `THorse.Head('/literal', PriorLocalRoutine)` registration in addition to Get, Post, Put, Patch, and Delete. The accepted form still requires exactly one standalone `uses Horse;` proof, exactly one direct program main block, a one-line slash-prefixed literal path, and a unique prior same-file complete routine handler. Unit and service integration coverage verifies exact `HEAD` route/handler evidence and method filtering while preserving `Options` rejection. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.82.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v71`; the project resolver remains `project-resolver-v23` because every accepted Horse route and handler proof remains file-local. A pre-v0.82 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes the expanded Horse facts.
- No SQLite schema migration or query command is required. This is an additive framework capability expansion within the existing Pascal artifact, graph, route query, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- `Options` and all other Horse methods remain excluded, as do combined/aliased `uses`, units, callbacks, groups, prefixes, middleware, aliases/wrappers, nested or routine-local registrations, nonliteral paths, late/ambiguous/cross-file handlers, compilation, and runtime behavior.
- The inspected local CodeGraph baseline has broad Pascal syntax and relationship analysis but no dedicated Horse route rule. SymbolLattice v0.82 remains narrower in general Pascal coverage and deliberately deeper for this source-proven Horse `HEAD` registration; the implementation is independent and does not copy CodeGraph source.

## [0.81.0] - 2026-07-31

### Added

- Source discovery now treats a `.h` file as an Objective-C candidate only after its source proves a direct `@interface` or `@protocol` container followed by a direct `@end`. The classifier blanks line/block comments, quoted literals, and preprocessor directives (including CRLF continuation macros) before checking that proof, so ordinary C/C++ headers and declaration-looking text do not enter the graph.
- Proven headers reuse the existing conservative Objective-C extractor: direct ordinary interfaces and protocols contribute the same local class/interface and one-line declaration-method evidence as `.m` / `.mm`; the full service path persists them as `objc` and exposes them to the existing language-filtered source search. Unit and integration coverage verifies positive interface/protocol headers, plain C rejection, comment/string/macro/incomplete rejection, persisted provenance, exact symbols, and source search. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.81.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v70`; the project resolver remains `project-resolver-v23` because this source-proven header classification and all accepted Objective-C facts remain file-local. A pre-v0.81 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes the expanded Objective-C facts.
- No SQLite schema migration or query command is required. This is an additive language-discovery capability within the existing Objective-C artifact, graph, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- `.h` is still not a general C/C++/Objective-C classifier: only direct source-proven Objective-C interface/protocol headers are indexed. Categories/extensions, properties, imports, inheritance/protocol-conformance relations, C/C++ declarations, message calls, Swift bridging, compiler configuration, conditional-compilation semantics, and runtime behavior remain outside scope. Git change-set/hunk attribution remains path-only and therefore does not yet select `.h` files without source content.
- The inspected local CodeGraph baseline maps `.h` through content heuristics and has Tree-sitter extraction across C/C++/Objective-C plus broader cross-language resolution. SymbolLattice v0.81 is narrower for general header syntax but deliberately stronger about requiring a direct complete Objective-C container after comment/string/macro blanking; it is independently implemented and not a CodeGraph source copy.

## [0.80.0] - 2026-07-31

### Added

- Pascal Horse route extraction now accepts direct main-program Patch registrations in addition to Get, Post, Put, and Delete. Every accepted registration still requires exactly one direct uses Horse proof, exactly one direct program main block, a one-line slash-prefixed literal path, and one unique prior same-file complete routine handler.
- Patch reuses the existing route node, routes edge, Pascal case-insensitive handler lookup, and framework.horse.direct-uses.literal-route.local-routine syntax evidence. Unit and integration coverage verifies exact Patch routes, handler proof, bounded route-method filtering, and continued Options rejection. The standalone Traditional Chinese comparison report is at C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.80.0.md.

### Compatibility

- The artifact extractor advances to multi-language-ast-v69; the project resolver remains project-resolver-v23 because every accepted Horse route and handler proof remains file-local. A pre-v0.80 active index reports indexer-version-changed until an explicit sync or index republishes the expanded Horse facts.
- No SQLite schema migration or query command is required. This is an additive framework capability expansion within the existing Pascal artifact, graph, route query, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- Head, Options, and every other Horse verb remain excluded. Combined or aliased uses, units, inline or multiline callbacks, aliases/wrappers/subclasses, groups, prefixes, middleware, nested registrations, dynamic paths, late or ambiguous handlers, cross-file handlers, compilation, and runtime behavior remain outside scope.
- The inspected local CodeGraph baseline has broad Tree-sitter Pascal extraction and form/callback support but no dedicated Horse or THorse framework rule in its local source search. SymbolLattice v0.80 is therefore narrower for general Pascal syntax but ahead for this explicit, evidence-bearing PATCH route subset; it is independently implemented and not a CodeGraph source copy.

## [0.79.0] - 2026-07-31

### Added

- Objective-C .m and Objective-C++ .mm extraction now accepts complete direct ordinary @interface and @protocol containers alongside the existing direct non-category @implementation subset. Ordinary interfaces emit one class symbol, protocols emit one interface symbol, and one-line semicolon-terminated instance/class method declarations emit exact contained method symbols.
- A same-file ordinary interface and implementation with the same class name intentionally merge into one class symbol. When both state the same selector, the complete implementation method wins over the declaration; interface-only selectors stay visible. Unit and integration coverage verifies protocol containment, selector preservation, implementation precedence, Objective-C++ persistence, category/extension exclusion, and malformed-protocol fail-closed behavior. The standalone Traditional Chinese comparison report is at C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.79.0.md.

### Compatibility

- The artifact extractor advances to multi-language-ast-v68; the project resolver remains project-resolver-v23 because every accepted Objective-C fact remains file-local. A pre-v0.79 active index reports indexer-version-changed until an explicit sync or index republishes the expanded Objective-C facts.
- No SQLite schema migration or query command is required. This is an additive language capability expansion within the existing Objective-C artifact, graph, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- This remains a narrow lexical declaration scanner, not a general Objective-C parser, compiler, header analyzer, or runtime analyzer. It excludes .h headers, categories/extensions, properties, imports, inheritance/protocol-conformance relations, C/C++ declarations, message calls, Swift bridging, compiler configuration, and runtime behavior. Interfaces and protocols accept only direct one-line semicolon-terminated methods; implementations accept only direct one-line brace-bodied methods.
- The inspected local CodeGraph baseline has a Tree-sitter Objective-C extractor and Swift-Objective-C bridge resolution, so it remains materially broader for language syntax and cross-language relationships. SymbolLattice v0.79 independently adds a smaller, evidence-bearing interface/protocol subset and does not copy CodeGraph source or claim full parity.

## [0.78.0] - 2026-07-31

### Added

- Pascal Horse route extraction now accepts direct main-program Put and Delete registrations in addition to the existing Get and Post subset. Every accepted registration still requires exactly one direct uses Horse proof, exactly one direct program main block, a one-line slash-prefixed literal path, and one unique prior same-file complete routine handler.
- Put and Delete reuse the existing route node, routes edge, Pascal case-insensitive handler lookup, and framework.horse.direct-uses.literal-route.local-routine syntax evidence. Unit and integration coverage verifies exact routes, handler proof, bounded route-method filtering, and continued Patch rejection. The standalone Traditional Chinese comparison report is at C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.78.0.md.

### Compatibility

- The artifact extractor advances to multi-language-ast-v67; the project resolver remains project-resolver-v23 because every accepted Horse route and handler proof remains file-local. A pre-v0.78 active index reports indexer-version-changed until an explicit sync or index republishes the expanded Horse facts.
- No SQLite schema migration or query command is required. This is an additive framework capability expansion within the existing Pascal artifact, graph, route query, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- Patch, Head, Options, and every other Horse verb remain excluded. Combined or aliased uses, units, inline or multiline callbacks, aliases/wrappers/subclasses, groups, prefixes, middleware, nested registrations, dynamic paths, late or ambiguous handlers, cross-file handlers, compilation, and runtime behavior remain outside scope.
- The inspected local CodeGraph baseline has broad Tree-sitter Pascal extraction and form/callback support but no dedicated Horse or THorse framework rule in its local source search. SymbolLattice v0.78 is therefore narrower for general Pascal syntax but ahead for this explicit, evidence-bearing Horse route subset; it is independently implemented and not a CodeGraph source copy.

## [0.77.0] - 2026-07-31

### Added

- Objective-C .m and Objective-C++ .mm source discovery, persisted source-search filtering, CLI/MCP language validation, and an independently implemented lexical implementation extractor.
- A complete direct non-category @implementation ClassName ... @end block now emits one class symbol. Direct one-line brace-bodied instance and class methods emit contained method symbols, including multi-part selector names such as create:with:.
- The scanner blanks line comments, block comments, quoted literals, and preprocessor directives while preserving offsets. This prevents macro, comment, and string text from fabricating declarations. Unit and integration coverage verifies .m/.mm discovery, selector extraction, source-search filtering, exact containment evidence, category/header rejection, malformed-source fail-closed behavior, and Objective-C++ indexing. The standalone Traditional Chinese comparison report is at C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.77.0.md.

### Compatibility

- The artifact extractor advances to multi-language-ast-v66; the project resolver remains project-resolver-v23 because every accepted Objective-C fact is file-local. A pre-v0.77 active index reports indexer-version-changed until an explicit sync or index republishes Objective-C-capable facts.
- No SQLite schema migration or query command is required. Objective-C is additive to the existing artifact, graph, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- This is not a general Objective-C parser, compiler, header analyzer, or runtime analyzer. It excludes .h headers, @interface and @protocol declarations, categories/extensions, properties, imports, inheritance, C/C++ declarations, Objective-C message calls, Swift bridging, compiler configuration, and runtime behavior. Only direct complete implementation bodies are eligible.
- The inspected local CodeGraph baseline has a dedicated Objective-C Tree-sitter extractor and Swift-Objective-C bridge resolution, so it remains broader for language syntax and cross-language relationships. SymbolLattice v0.77 independently adds a smaller evidence-bearing declaration subset and does not copy CodeGraph source or claim full parity.

## [0.76.0] - 2026-07-31

### Added

- A first conservative Pascal Horse HTTP framework capability. One source file now emits exact `GET` / `POST` route facts only when it proves exactly one direct `uses Horse;`, exactly one direct `program` main block, a one-line literal `THorse.Get` or `THorse.Post` registration at the main-block level, and one unique prior same-file complete Pascal routine handler.
- Accepted registrations use the existing `route` node and `routes` edge contracts with `framework.horse.direct-uses.literal-route.local-routine` syntax evidence. Route handler lookup follows Pascal's case-insensitive identifier semantics, while source-search, CLI/MCP `pascal` filtering, persisted artifact facts, and the existing bounded route query remain unchanged. Unit and integration coverage verifies handler resolution, `GET` / `POST` selection, nested-route rejection, absent-`Horse` proof rejection, persisted source search, and route queries. The standalone Traditional Chinese comparison report is at `C:\\Users\\win10\\Desktop\\Graph\\FEATURE_COMPARISON_v0.76.0.md`.

### Compatibility

- No SQLite schema migration or query command is required. `horse` is an additive framework capability and route-framework value using the existing Pascal artifact, graph, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v65`; the project resolver remains `project-resolver-v23` because every accepted Horse route and handler proof is file-local. A pre-v0.76 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Horse-capable facts.

### Deliberate limits

- This is not general Horse or Pascal framework analysis. It deliberately rejects combined or aliased `uses` clauses, no-program/unit source, inline or multiline registrations, `Put` / `Delete` / other methods, dynamic/query/fragment/double-slash paths, late/ambiguous/dynamic/cross-file handlers, nested or routine-local registrations, groups, middleware, prefixes, aliases, wrappers, `THorse` subclasses, compilation, and runtime behavior.
- The inspected local CodeGraph baseline has Tree-sitter Pascal extraction plus `.dfm` / `.fmx` form and callback support, which is broader Pascal coverage. Its local source search found no dedicated `Horse` / `THorse` rule. SymbolLattice v0.76 independently adds a smaller evidence-bearing Horse route subset rather than copying CodeGraph source or claiming full Horse parity.

## [0.75.0] - 2026-07-31

### Added

- Pascal `.pas`, `.dpr`, `.dpk`, and `.lpr` source discovery, persisted source-search filtering, CLI/MCP language validation, and an independently implemented lexical declaration pass. It retains only direct column-one complete `procedure` / `function` implementations, including direct dotted and `class` routine names, as exact file-local `contains` evidence.
- The scanner blanks `//`, `{...}`, `(*...*)`, and quoted Pascal source before testing declarations, handles simple `var` sections and nested `begin`/`case`/`try`/`repeat`/type blocks while finding a routine body, and fails closed for incomplete routines or unterminated comments/strings. Unit and integration coverage verifies discovery, direct functions, procedures, dotted/class names, comments/strings, nested blocks, incomplete declarations, malformed source, persisted search, and route absence. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.75.0.md`.

### Compatibility

- No SQLite schema migration or query command is required. `pascal` is an additive artifact language using the existing file, symbol, containment, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable. The root package metadata in `package-lock.json` is also realigned with `package.json` at `0.75.0`.
- The artifact extractor advances to `multi-language-ast-v64`; the project resolver remains `project-resolver-v23` because this language slice is file-local and produces no module or framework projection. A pre-v0.75 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Pascal-capable facts.

### Deliberate limits

- This is not a Pascal grammar, compiler, unit/project resolver, or runtime analyzer. It excludes `.dfm` / `.fmx`, forward/interface declarations, indented or local routines, constructors/destructors/operators/generics, overload/directive forms, type/class/interface symbols, uses/import/module/call analysis, VCL/FMX/Lazarus forms, Horse/Brook/WebBroker or other framework inference, compilation, and runtime behavior.
- The inspected local CodeGraph baseline uses a dedicated Tree-sitter Pascal grammar and also maps `.dfm` / `.fmx`; it therefore has broader syntax and extension coverage. SymbolLattice v0.75 deliberately keeps a smaller lexical proof boundary with explicit complete-body requirements; it is independently implemented and does not reuse CodeGraph source.

## [0.74.0] - 2026-07-31

### Added

- Luau `.luau` source discovery, persisted source-search filtering, CLI/MCP language validation, and a conservative reuse of the balanced Lua lexical declaration surface. Valid Luau source now retains direct top-level `function`, `local function`, and `export function` declarations even when the file contains `--!strict`, type aliases, and parameter or return type annotations.
- Luau deliberately does not activate the Lua-only `lapis` framework pass. A syntactically similar `require("lapis")` / `app:get(...)` sequence in a `.luau` file retains ordinary declarations but cannot fabricate a Lapis route. Unit and integration coverage verifies discovery, strict/type syntax, exported functions, fail-closed malformed input, persisted source search, and Lua-framework isolation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.74.0.md`.

### Compatibility

- No SQLite schema migration or query command is required. `luau` is an additive artifact language using the existing file, symbol, containment, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v63`; the project resolver remains `project-resolver-v23` because this language slice is file-local and provides no module or framework projection. A pre-v0.74 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Luau-capable facts.

### Deliberate limits

- This is not a Luau parser, type checker, Roblox project model, or runtime analyzer. It excludes `type` / `export type` symbols, generic function declarations, class-like tables/metatables, module/import/require resolution, calls, table fields, Roblox services/Instances/events/RemoteEvents, Roact/Fusion/framework conventions, Lapis routes, compilation, and runtime behavior.
- The inspected local CodeGraph baseline uses a dedicated Tree-sitter Luau grammar and therefore has broader syntax coverage. SymbolLattice v0.74 deliberately keeps the existing lexical proof boundary and only accepts declaration forms shared safely with Lua; it is independently implemented and does not reuse CodeGraph source.

## [0.73.0] - 2026-07-31

### Added

- A first conservative Django framework capability for Python: a direct `from django.urls import path [as alias]`, the final literal top-level `urlpatterns = [...]` list, and a prior same-file top-level function handler now create exact `ALL` route nodes and `framework.django.direct-urlpatterns.path.local-function` syntax evidence. The conventional empty path maps to `/`, and literal Django converters such as `users/<int:user_id>/` are retained verbatim.
- Unit and integration coverage verifies direct aliases, final-assignment and rebinding proof, exact local handlers, source search, persisted extractor provenance, and rejection of leading-slash paths, dynamic values, missing or late handlers, nonlocal handler shapes, `re_path`, `include`, class-based views, metadata other than a literal `name`, and unsupported `kwargs`. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.73.0.md`.

### Compatibility

- No SQLite schema migration or query command is required. `django` is an additive route-framework value and `ALL` Django facts reuse the existing route, edge-evidence, source-search, and capability contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v62`; the project resolver remains `project-resolver-v23` because this initial Django slice produces only same-file syntax evidence. A pre-v0.73 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Django-capable facts.

### Deliberate limits

- This is not a generic Django resolver or runtime model. It intentionally excludes `re_path` / legacy `url`, `include`, routers, REST framework registrations, class-based `as_view` handlers, dotted or imported handlers, cross-file URLConf/view resolution, nested URL patterns, `urlpatterns +=`, assignment aliases, `path` calls with options other than a literal `name`, dynamic/escaped/query/fragment paths, middleware/settings/namespace/app-name semantics, and runtime URL resolution.
- The inspected local CodeGraph baseline recognizes a broader Django surface, including `path`, `re_path`, `url`, `include`, class-based handlers, and DRF router registration patterns. SymbolLattice v0.73 deliberately trades that breadth for AST-proven direct-import, final-binding, and exact local-handler evidence; it is independently implemented and does not reuse CodeGraph source.

## [0.72.0] - 2026-07-31

### Added

- Laravel Blade `.blade.php` source discovery, persisted source-search filtering, CLI/MCP language validation, and an independent offset-preserving lexical directive scanner. It retains only complete direct literal `@extends`, `@include`, `@component`, and `@each` forms outside HTML comments, Blade comments, raw PHP, `@php ... @endphp`, and `@verbatim ... @endverbatim` blocks.
- An executable first-party `laravel-blade` capability. A safe dotted logical view name projects only to the conventional indexed `resources/views/<name-as-path>.blade.php` file. Existing targets receive exact `calls` edges; missing targets remain explicit unresolved evidence with rule-specific provenance rather than guessed namespaced/package/configured-view matches.
- Unit and integration coverage now verifies Blade discovery, exact and unresolved layout/view callers, raw-fact persistence, language search, capability registration, reuse/reprojection after target changes, and comment/literal-block/dynamic/path-traversal/escaped/malformed rejection. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.72.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Blade reuses the existing file, `calls` edge, caller/callee, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v61` and the resolver to `project-resolver-v23` because complete raw Blade facts are projected only after the full indexed file catalog is known. A pre-v0.72 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Blade-capable facts and relations.

### Deliberate limits

- The Blade scanner is a deliberately narrow lexical directive scanner, not a Blade/PHP grammar, Laravel compiler, container analyzer, view finder, or renderer. It accepts only complete direct literal dotted view names with a small exact argument-tail grammar; unterminated protected blocks or directive parentheses fail closed.
- Blade support does not infer `view()` / `View::make()` calls, component tag syntax, anonymous components, layouts/sections/stacks, slots, `@includeWhen` / `@includeFirst`, namespaced or package views, custom finder roots, dynamic or conditional expressions, PHP/Laravel service integration, compilation, or runtime rendering. The inspected local CodeGraph baseline has Laravel PHP route resolution but no Blade-specific `.blade.php` extractor or resolver; SymbolLattice adds only independently implemented project-local template relationship evidence.

## [0.71.0] - 2026-07-31

### Added

- Twig `.twig` source discovery, persisted source-search filtering, CLI language validation, and an independent offset-preserving lexical template-tag scanner. It retains only complete direct literal `extends`, `include`, `embed`, `import`, and `from ... import` forms outside HTML comments, Twig comments, and `verbatim` blocks.
- An executable first-party `twig` capability. Safe literal names ending in `.twig` project only to the conventional indexed `templates/<name>.twig` root. Existing target files receive exact `calls` edges; missing targets remain explicit unresolved edges with rule-specific evidence instead of guessed loader, namespace, or bundle matches.
- SQLite raw-artifact persistence now retains Liquid and Solidity facts as well as Twig facts. The v0.71 extractor-version bump forces an explicit re-extraction before stale facts can be reused.
- Unit and integration coverage now verifies Twig discovery, direct template and macro references, exact and unresolved targets, raw-fact persistence, capability registration, comments/verbatim/dynamic/unsafe/malformed rejection, plus the Liquid and Solidity persistence regression. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.71.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Twig reuses the existing file, `calls` edge, caller/callee, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v60` and the resolver to `project-resolver-v22` because complete raw template facts are projected only after the full project file catalog is known. A pre-v0.71 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Twig-capable facts and relations.

### Deliberate limits

- The Twig scanner is a deliberately narrow lexical tag scanner, not a Twig grammar, Symfony/PHP analyzer, loader resolver, compiler, or renderer. It accepts only complete literal `.twig` names and a small exact tag-tail grammar; malformed delimiters, unterminated comments or `verbatim` blocks, or nested tags fail closed.
- Twig support does not infer template loader namespaces, bundles, configured roots, dynamic/conditional expressions, `with` maps, macro or block bodies, inheritance chains, PHP/Symfony services, compilation, or runtime rendering. The inspected local CodeGraph baseline currently records Twig at file level; SymbolLattice adds only independently implemented, project-local relationship evidence.

## [0.70.0] - 2026-07-31

### Added

- VB.NET `.vb` source discovery, persisted source-search filtering, CLI language validation, and an independent offset-preserving lexical declaration scanner. It retains complete `Namespace`, `Class`, `Module`, `Interface`, `Structure`, and `Enum` containers, plus complete direct `Sub` / `Function` declarations and bodyless direct interface / `MustOverride` signatures.
- Complete file-level, unaliased `Imports Namespace.Name` statements are retained as explicit pending `imports` references. They are source-syntax evidence only; this release does not claim .NET assembly or project reference resolution.
- Unit and integration coverage now verifies VB.NET discovery, nested namespace/container/member containment, interface signatures, simple imports, comments/strings/malformed rejection, persisted source search, and CLI language filtering. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.70.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. VB.NET reuses the existing file, module, class, interface, type, function, method, containment-edge, pending-reference, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v59`; the resolver remains `project-resolver-v21` because v0.70 does not resolve `Imports` through assemblies, projects, packages, or source files. A pre-v0.70 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes VB.NET-capable facts.

### Deliberate limits

- The VB.NET scanner is a deliberately narrow line-oriented declaration scanner, not a VB.NET parser, Roslyn compiler, CLR analyzer, WinForms/WPF analyzer, or runtime debugger. It accepts only complete literal block forms whose closing `End ...` structure can be locally proved; unclosed strings and malformed/mismatched supported blocks fail closed.
- VB.NET support does not infer attributes, aliases/static imports, fields, properties, events, delegates, P/Invoke, generic/overload/type semantics, inheritance, `Handles`, calls, lambda/local functions, partial-type merging, project/assembly/NuGet resolution, MSBuild, compilation, UI designer resources, or runtime behavior. The inspected local CodeGraph baseline uses Tree-sitter and is broader for these surfaces; SymbolLattice deliberately begins with a smaller independently implemented declaration contract.

## [0.69.0] - 2026-07-31

### Added

- Nix `.nix` source discovery, persisted source-search filtering, CLI language validation, and an independent offset-preserving lexical declaration scanner. It retains complete direct bindings of a returned literal attribute set, including `rec { ... }`, direct `let ... in` bindings, simple `inherit` names, and direct lambda-valued bindings as function symbols.
- Complete literal project-relative `import ./path.nix` and `builtins.import ../path.nix` forms are retained as explicit pending `imports` references. They are evidence of source syntax only: v0.69 does not yet claim a Nix module target or evaluate the path.
- Unit and integration coverage now verifies Nix discovery, returned attribute-set and `let` declaration scopes, function/value/inherit evidence, literal import facts, string/comment/malformed rejection, persisted source search, and CLI language filtering. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.69.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Nix reuses the existing file, function, variable, containment-edge, pending-reference, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v58`; the resolver remains `project-resolver-v21` because v0.69 retains literal import syntax without evaluating Nix expressions or projecting cross-file module edges. A pre-v0.69 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Nix-capable facts.

### Deliberate limits

- The Nix scanner is a deliberately narrow lexical declaration scanner, not a Nix parser, evaluator, flake lock reader, package builder, or deployment planner. It accepts only complete literal structures whose delimiter and string/comment boundaries can be locally proved; malformed or ambiguous comments, strings, delimiters, and `let` forms fail closed.
- Nix support does not infer quoted/dynamic attribute names, nested attribute-set members, `with`, assertions, overlays, derivations, flake inputs/outputs, angle-bracket lookups, import target resolution, `callPackage`, arbitrary calls, package dependencies, evaluation results, NixOS/Home Manager module composition, lock-file semantics, builds, or runtime deployment behavior. The inspected local CodeGraph baseline uses Tree-sitter and is broader for calls, `callPackage`, and module-list file imports; SymbolLattice deliberately begins with a smaller independently implemented declaration contract.

## [0.68.0] - 2026-07-31

### Added

- CFML / CFScript `.cfc`, `.cfm`, and `.cfs` source discovery, persisted source-search filtering, CLI language validation, and an independent offset-preserving declaration scanner. It retains only complete braced CFScript `component` / `interface` containers with direct named functions, complete tag-based `<cfcomponent>` / `<cfinterface>` containers with named `<cffunction>` members, and the conventional implicit CFC component form for complete top-level CFScript functions.
- Unit and integration coverage now verifies CFML discovery, braced/tag/implicit declaration forms, direct containment evidence, quoted/commented/malformed/incomplete rejection, persisted source search, and CLI language filtering. The standalone Traditional Chinese comparison report is at `C:\\Users\\win10\\Desktop\\Graph\\FEATURE_COMPARISON_v0.68.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. CFML reuses the existing file, class, interface, function, method, containment-edge, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v57`; the project resolver remains `project-resolver-v21` because this initial CFML slice does not project imports, includes, calls, or cross-file relationships. A pre-v0.68 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes CFML-capable facts.

### Deliberate limits

- The CFML scanner is a deliberately narrow declaration scanner, not a CFML parser, Adobe ColdFusion/Lucee runtime, template renderer, query analyzer, or framework analyzer. It accepts only complete literal forms whose parent structure can be locally proved; unclosed comments, strings, braces, tags, and function declarations fail closed.
- CFML support does not infer `cfinclude`, `import`, component inheritance, accessors, annotations, dynamic names, closures, nested/member functions, `cfscript` blocks inside tag-based components, CFQuery SQL or hash expressions, calls, ORM/DI/framework conventions, request lifecycle, remote services, compilation, or runtime behavior. The inspected local CodeGraph baseline uses Tree-sitter and is broader for CFScript imports, variables, calls, and embedded CFQuery; SymbolLattice deliberately begins with a smaller independently implemented declaration contract.

## [0.67.0] - 2026-07-31

### Added

- Solidity `.sol` source discovery, persisted source-search filtering, CLI language validation, and an independent offset-preserving lexical scanner. It retains only complete top-level literal `contract`, `interface`, and `library` declarations together with complete direct `function`, `modifier`, `constructor`, `fallback`, and `receive` members.
- A same-file-only Solidity inheritance projection. A complete simple `is Base, Other` clause becomes an exact `extends` or `implements` edge only when one declaration in that same indexed file proves the target kind. Constructor-argument clauses, imports, missing, duplicate, and incompatible targets do not become hierarchy edges.
- Unit and integration coverage now verifies Solidity discovery, symbols, member containment, string/comment and malformed-source rejection, persisted source search, CLI language filtering, and exact `hierarchy` parent/child evidence. The standalone Traditional Chinese comparison report is at `C:\\Users\\win10\\Desktop\\Graph\\FEATURE_COMPARISON_v0.67.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Solidity reuses the existing file, class, interface, method, hierarchy-edge, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v56` and the project resolver to `project-resolver-v21` because exact Solidity `is` relations are projected only after all symbols in the same complete source file are known. A pre-v0.67 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Solidity-capable facts and edges.

### Deliberate limits

- The Solidity extractor is a deliberately narrow lexical declaration scanner, not a Solidity parser, compiler, EVM analyzer, or deployment simulator. It accepts only complete ASCII-named top-level containers and complete direct callable members while preserving string/comment offsets; malformed source and unclosed strings/comments fail closed.
- Solidity support does not infer imports, cross-file inheritance, inherited constructor arguments, visibility/override semantics, structs, enums, user-defined value types, state variables, events, errors, free functions, calls, emits, reverts, modifiers applied to members, assembly, inline Yul, ABI/bytecode, storage layout, proxy/delegatecall behavior, external dependencies, compilation, or runtime chain behavior. The inspected local CodeGraph baseline has a broader Tree-sitter Solidity extractor for those surfaces; SymbolLattice deliberately begins with smaller exact declaration and same-file hierarchy evidence.

## [0.66.0] - 2026-07-31

### Added

- Shopify Liquid `.liquid` source discovery, persisted source-search language filtering, CLI/MCP validation, and a dedicated offset-preserving template-tag scanner. It retains only complete direct literal `render`, `include`, and `section` tags outside HTML comments and Liquid `comment` / `raw` blocks.
- An executable first-party `shopify-liquid` capability. A literal `render` or `include` target projects to the exact indexed `snippets/<name>.liquid` file; a literal `section` target projects to the exact indexed `sections/<name>.liquid` file. Missing targets remain explicit unresolved `calls` edges with rule-specific evidence instead of guessed global matches.
- Unit and integration coverage now verifies Liquid discovery, literal render/include/section facts, exact local snippet/section callers, comment/raw/HTML-comment/dynamic/path-traversal/malformed rejection, persisted source-search, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.66.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Liquid facts reuse the existing file, graph-edge, source-search, caller/callee, and SQLite raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v55` and the project resolver to `project-resolver-v20` because literal Liquid targets are projected only after the complete indexed file set is available. A pre-v0.66 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Liquid-capable facts and edges.

### Deliberate limits

- The Liquid extractor is a deliberately narrow tag scanner, not a Liquid parser, Shopify theme compiler, or renderer. It accepts only direct literal names made from safe path segments; dynamic names, path traversal, incomplete/nested tags, comment/raw/HTML-comment contents, and malformed delimiters do not become template facts.
- Shopify support does not infer `assign`, captures, loops, conditions, filters, object/property references, layouts, schema JSON, app blocks, {% render %} parameter semantics, JSON template/section-group references, metafields, locales, theme configuration, remote snippets, theme inheritance, or runtime storefront behavior. The inspected local CodeGraph baseline has broader Liquid extraction for snippet/section references, schema, assignments, and Shopify JSON section references; SymbolLattice deliberately starts with a smaller exact cross-file call contract rather than claiming full Liquid parity.

## [0.65.0] - 2026-07-31

### Added

- Terraform/OpenTofu `.tf`, `.tfvars`, and `.tofu` source discovery, persisted source-search language filtering, CLI/MCP validation, and a dedicated offset-preserving HCL block scanner. It retains only complete line-leading top-level literal `resource`, `data`, `module`, `variable`, and `output` blocks as auditable IaC declarations.
- An executable first-party `terraform` capability. Accepted resource/data blocks use the additive `resource` symbol kind, module blocks use the additive `module` symbol kind, and output blocks are exported variable symbols; every retained declaration has exact local `contains` evidence.
- Unit and integration coverage now verifies Terraform/OpenTofu discovery, resource/data/module/variable/output containment, output export/local bindings, comment/string/heredoc/dynamic/nested/malformed rejection, persisted source-search, CLI/MCP language validation, and exact resource lookup. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.65.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive `resource` and `module` symbol kinds reuse the existing file, symbol, edge, binding, and source-search contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v54`; the project resolver remains `project-resolver-v19` because this release does not resolve Terraform module sources, providers, or dependency expressions. A pre-v0.65 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Terraform-capable facts.

### Deliberate limits

- The Terraform/OpenTofu extractor is a deliberately narrow lexical scanner, not an HCL parser, Terraform/OpenTofu compiler, or planner. It accepts only complete line-leading top-level blocks with literal ASCII labels; comments, quoted strings, heredocs, dynamic labels, nested blocks, malformed input, and unsupported top-level forms do not become IaC facts.
- Terraform/OpenTofu support does not infer `terraform`, `provider`, `locals`, expression values, interpolation, `depends_on`, resource references, provider aliases, module source resolution, state, plan/apply behavior, generated configuration, or runtime cloud topology. The inspected local CodeGraph baseline uses a broader Tree-sitter Terraform grammar; SymbolLattice deliberately adds a smaller exact declaration-evidence surface rather than claiming full HCL parity.

## [0.64.0] - 2026-07-31

### Added

- ArkTS `.ets` source discovery, persisted source-search language filtering, CLI/MCP validation, and a dedicated offset-preserving ArkTS scanner. It retains only complete direct `@Component struct` declarations as auditable component symbols; a directly positioned `export` is retained as an export binding.
- An executable first-party `arkui` capability. A complete direct `@Entry @Component struct` declaration emits a `ui root <Component>` entrypoint and an exact local `framework.arkui.entry-component.local-struct` `handles` edge. The existing read-only `entrypoints` contract now accepts the additive `ui` transport and `root` operation.
- Unit and integration coverage now verifies `.ets` discovery, component/root containment and exact handler evidence, exported component bindings, comment/string/non-struct/malformed rejection, persisted entrypoint-query integration, source-search, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.64.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. ArkTS component symbols and ArkUI root entrypoints reuse the existing file, symbol, edge, source-search, and entrypoint-query contracts. The `ui` / `root` filter values are additive; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v53`; the project resolver remains `project-resolver-v19` because every accepted ArkUI root edge is proved inside one `.ets` file. A pre-v0.64 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes ArkTS-capable facts.

### Deliberate limits

- The ArkTS extractor is a deliberately narrow lexical scanner, not an ArkTS compiler or a TypeScript fallback. It retains only complete line-leading direct `@Component struct` declarations, with `@Entry` accepted only when it belongs to the same adjacent decorator stack. Comments, strings, regex literals, malformed bodies, detached decorators, non-struct declarations, generic ArkTS declarations, and general TypeScript syntax do not become component facts.
- ArkUI support does not infer `build()` DSL calls, child-component usage, `@Builder`/`@Extend`/`@Styles`, state decorators, lifecycle behavior, navigation, bundles, modules, packages, or runtime UI composition. The inspected local CodeGraph baseline has a broader Tree-sitter ArkTS extractor for struct members, decorators, and ArkUI call shapes; SymbolLattice deliberately adds a smaller UI-root evidence surface rather than claiming full ArkTS parity.

## [0.63.0] - 2026-07-31

### Added

- Razor/Blazor `.razor` source discovery, persisted source-search language filtering, CLI/MCP validation, and a bounded component extractor. Every discovered file emits a conventional local `default` component with auditable containment/export/local-binding facts.
- An executable first-party `blazor` capability. Each standalone, unescaped, slash-prefixed string-literal `@page` directive emits a `NAVIGATE` route node and exact local-default-component `framework.blazor.page-directive.local-handler` evidence. Multiple literal route templates, including literal parameter templates, remain distinct.
- Unit and integration coverage now verifies Razor discovery, conventional component evidence, literal/multiple directive routing, comment/computed/`@attribute`/query-fragment rejection, source-search/CLI/MCP language validation, persisted route-query integration, and exact caller evidence. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.63.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Razor symbols and Blazor navigation reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v52`; the project resolver remains `project-resolver-v19` because every accepted route resolves only to a same-file conventional component. A pre-v0.63 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Razor-capable facts.

### Deliberate limits

- The Razor extractor is a deliberately small directive scanner, not the Razor compiler or a C# parser. It excludes `@code`/`@functions` members, `@inject`/`@model`/`@inherits` references, template component tags, layouts/render modes, generic Razor namespace/project/package resolution, and runtime behavior.
- Blazor navigation accepts only standalone unescaped literal `@page` directives in `.razor` files. It excludes `@attribute [Route(...)]`, computed/escaped/query/fragment forms, Razor comments, `.cshtml`, route configuration, and runtime behavior. The inspected local CodeGraph baseline has a broader Razor extractor for directive type references, Blazor component tags, and C# code blocks; SymbolLattice adds a distinct narrow precision surface by turning only direct literal `@page` declarations into exact local route evidence rather than claiming full Razor parity.

## [0.62.0] - 2026-07-31

### Added

- Astro `.astro` source discovery, persisted source-search language filtering, CLI/MCP validation, and a bounded SFC extractor. A file with no frontmatter, or one valid opening TypeScript frontmatter fence, emits a conventional `default` component plus direct frontmatter functions, classes, interfaces, type aliases, and identifier variables. An incomplete/malformed starting fence or invalid frontmatter syntax fails closed to the file node.
- An executable first-party `astro` capability. A static literal-segment `src/pages/**/*.astro` file emits a `NAVIGATE` route node and exact local-default-component `framework.astro.filesystem-page.local-handler` evidence; `index.astro` maps to its containing path. Dynamic brackets and leading-underscore segments are deliberately excluded instead of guessed.
- Relative TypeScript/JavaScript resolution now considers a unique `.astro` candidate, enabling exact direct conventional-default bindings without adding a generic Astro package resolver.
- Unit and integration coverage now verifies Astro discovery, frontmatter declarations, conventional default evidence, malformed-fence/frontmatter rejection, static/dynamic/private Astro page handling, `.astro` resolution, source-search/CLI/MCP language validation, and persisted route-query integration. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.62.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Astro symbols and Astro page navigation reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v51`; the project resolver advances to `project-resolver-v19` because a unique relative `.astro` candidate may now prove an exact TypeScript/JavaScript module binding. A pre-v0.62 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Astro-capable facts.

### Deliberate limits

- The Astro extractor is a deliberately small SFC scanner, not the Astro compiler. It excludes frontmatter imports/re-exports, template components/calls, client `<script>` tags, styles/directives/islands, `Astro` global/props semantics, generic Astro import/export/call/type analysis, and runtime behavior.
- Astro routing accepts only static `.astro` pages with literal non-private segments under `src/pages`; it excludes Markdown/MDX/HTML pages, `.ts`/`.js` endpoints, dynamic/rest parameters, routing configuration, middleware, cross-file page composition, and runtime navigation. The inspected local CodeGraph baseline processes Astro frontmatter and client scripts, scans template component/call usage, and maps broader `src/pages` route forms including dynamic parameters and JavaScript/TypeScript endpoints. SymbolLattice adds a different narrow precision slice: every accepted page route is tied to its local conventional component with exact evidence rather than claiming full Astro parity.

## [0.61.0] - 2026-07-31

### Added

- Svelte `.svelte` source discovery, persisted source-search language filtering, CLI/MCP validation, and a bounded SFC extractor. A validated file emits a conventional `default` component plus direct top-level instance-script functions, classes, interfaces, type aliases, and identifier variables. It accepts no script, or at most one inline JavaScript/TypeScript instance script and one inline JavaScript/TypeScript module script; module scripts are syntax-validated but their declarations are not yet indexed.
- An executable first-party `sveltekit` capability. A static `src/routes/**/+page.svelte` path with literal filesystem segments emits a `NAVIGATE` route node and exact local-default-component `framework.sveltekit.filesystem-page.local-handler` evidence. Bracket, route-group, optional, and rest conventions are deliberately excluded instead of guessed.
- Relative TypeScript/JavaScript resolution now considers a unique `.svelte` candidate, enabling exact direct conventional-default bindings without adding a generic Svelte package resolver.
- Unit and integration coverage now verifies Svelte discovery, direct declarations, conventional default evidence, duplicate/`src`/non-JS/malformed script rejection, static/dynamic SvelteKit page handling, `.svelte` resolution, source-search/CLI/MCP language validation, and persisted route-query integration. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.61.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Svelte symbols and SvelteKit navigation reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v50`; the project resolver advances to `project-resolver-v18` because a unique relative `.svelte` candidate may now prove an exact TypeScript/JavaScript module binding. A pre-v0.61 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Svelte-capable facts.

### Deliberate limits

- The Svelte extractor is a deliberately small SFC scanner, not the Svelte compiler. It excludes templates/styles, component/call edges, runes/macros, compiler-generated exports, props semantics, module-script declarations, multiple or `src` scripts, non-JavaScript/TypeScript scripts, generic Svelte import/export/call/type analysis, and runtime behavior.
- SvelteKit support accepts only static literal-segment `src/routes/**/+page.svelte` paths and the SFC's local conventional default component. It excludes layouts, endpoints, actions, hooks, dynamic/optional/rest bracket paths, route groups, client-router configuration, cross-file page composition, and runtime navigation. The inspected local CodeGraph baseline has a fuller Svelte extractor that processes script blocks and scans template component/call usage; no dedicated SvelteKit static filesystem route extractor was found in the inspected source, so SymbolLattice adds a different, narrowly proven navigation surface rather than claiming full Svelte parity.

## [0.60.0] - 2026-07-31

### Added

- Vue `.vue` source discovery, persisted source-search language filtering, CLI/MCP validation, and a bounded SFC extractor for one inline JavaScript/TypeScript `<script>` block. It retains direct top-level declarations and three auditable direct default-export forms: an object literal, a direct unaliased `defineComponent(...)` call, or a direct named variable initialized from that call.
- An executable first-party `vue-router` capability. Client-navigation facts require exactly one direct, unaliased `createRouter` import from `vue-router`, exactly one top-level `createRouter({ routes })` expression, a literal route array/options form, slash-prefixed literal paths, and named component identifiers. A unique same-file or imported Vue default component produces exact `framework.vue-router.create-router.routes-option.*` evidence; all other accepted route targets remain explicit `unresolved` evidence.
- Relative TypeScript/JavaScript resolution now considers a unique `.vue` candidate, enabling exact direct default-import route components without adding a generic Vue package resolver.
- Unit and integration coverage now verifies Vue discovery, exports, malformed/multiple/`src`/non-JS script rejection, direct Vue Router static routes, alias/rebinding/lazy/dynamic rejection, `.vue` resolution, source-search/CLI/MCP language validation, and persisted route-query integration. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.60.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Vue symbols and Vue Router navigation reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v49`; the project resolver advances to `project-resolver-v17` because a unique relative `.vue` candidate may now prove an exact TypeScript/JavaScript module binding. A pre-v0.60 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Vue-capable facts.

### Deliberate limits

- The Vue extractor is a deliberately small SFC scanner, not the Vue compiler. It excludes `script setup` implicit compiler exports, templates/styles/custom blocks, multiple or `src` scripts, macros/composables, aliases/rebindings, generic Vue semantic analysis, and runtime behavior.
- Vue Router support accepts only exact-one direct imports, one literal top-level router/routes form, literal slash-prefixed paths, and named component identifiers. It excludes child/nested route records, spreads, lazy/inline/dynamic components, aliases/factories, history/middleware configuration, cross-file router composition, and runtime navigation. The local CodeGraph baseline has a fuller Vue extractor that creates component nodes, processes script blocks, and scans template component usage; SymbolLattice gains a different narrow precision slice for direct router-to-component navigation rather than claiming equivalent Vue coverage.

## [0.59.0] - 2026-07-31

### Added

- Nim `.nim` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated Nim lexical/comment/delimiter/layout extractor for direct top-level zero-argument `proc` containment.
- An executable first-party `jester` capability. Direct Jester route facts require exactly one top-level direct `import` list containing `jester`, a direct top-level `routes:` or `router name:` block, a direct baseline-indented literal `get` / `post` / `put` / `patch` / `delete` / `head` / `options` / `trace` / `connect` route, and one simple named zero-argument call in its body. A unique same-file zero-argument `proc` produces `framework.jester.direct-route-block.literal-named-proc.local-proc`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Nim discovery, direct zero-argument `proc` containment, exact and unresolved Jester route-query/source-search behavior, missing/aliased/repeated-import, dynamic/inline/multi-statement/nested/long-string/shadowed rejection, malformed delimiter/comment and tab-layout fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.59.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Nim symbols and Jester routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v48`; the project resolver remains `project-resolver-v16` because all accepted Jester callback proof is file-local. A pre-v0.59 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Nim-capable facts.

### Deliberate limits

- The Nim extractor is a deliberately small lexical/comment/delimiter/layout implementation, not a full Nim parser. It retains only file symbols for unbalanced delimiters, unterminated strings/comments, or tab-indented code, and does not claim generic Nim module, type, call, package, macro, or runtime analysis.
- Jester support accepts only exactly one direct top-level import list containing unaliased `jester`, direct top-level `routes:` / simple `router name:` blocks, one flat baseline of literal unescaped slash-prefixed paths, simple named zero-argument calls, and unique same-file zero-argument `proc` handlers. It excludes `from jester import`, aliases, repeated imports, `before` / `after` / `error` handlers, dynamic/special/regex/escaped paths, inline or multi-statement route bodies, nested control-flow/composition, top-level Jester-DSL rebinding, parameterized/generic/async/cross-file procedures, and runtime behavior. The local CodeGraph baseline does not list Nim in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic Nim parity.

## [0.58.0] - 2026-07-31

### Added

- F# `.fs` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated F# lexical/comment/delimiter/layout extractor for direct top-level typed `HttpFunc` / `HttpContext` function containment.
- An executable first-party `giraffe` capability. Direct Giraffe route facts require exactly one top-level `open Giraffe` proof, a direct top-level `let name = choose [` list or its immediately following indented `choose [` form, direct baseline-indented literal `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS` / `TRACE` / `CONNECT` / unqualified `route` registrations, and a simple named handler. A unique same-file typed function produces `framework.giraffe.direct-choose.literal-named-function.local-function`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies F# discovery, direct typed function containment, exact and unresolved Giraffe route-query/source-search behavior, dynamic/inline/qualified/nested/repeated-open rejection, malformed delimiter/comment and tab-layout fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.58.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. F# symbols and Giraffe routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v47`; the project resolver remains `project-resolver-v16` because all accepted Giraffe callback proof is file-local. A pre-v0.58 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes F#-capable facts.

### Deliberate limits

- The F# extractor is a deliberately small lexical/comment/delimiter/layout implementation, not a full F# parser. It retains only file symbols for unbalanced delimiters, unterminated strings/comments, or tab-indented code, and does not claim generic F# module, type, call, project, package, or runtime analysis.
- Giraffe support accepts only exactly one direct top-level `open Giraffe`, direct top-level literal `choose` lists, simple direct one-level method / `route` compositions, literal unescaped slash-prefixed paths, and simple same-file typed named handlers. It excludes `GET_HEAD`, `subRoute` / nested composition, aliases or top-level `route` / HTTP-handler rebinding, endpoint-routing integration, dynamic/escaped paths, anonymous/qualified/cross-file handlers, untyped/annotated/pattern/local handler forms, and runtime behavior. The local CodeGraph baseline does not list F# in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic F# parity.

## [0.57.0] - 2026-07-31

### Added

- OCaml `.ml` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated OCaml lexical/comment/delimiter extractor for direct top-level one-parameter `let name arg = ...` function containment.
- An executable first-party `dream` capability. Direct Dream route facts require either a top-level direct `let name = Dream.router [` list or one of the documented direct `Dream.run` / `@@ Dream.router [` forms, a direct baseline-indented literal `Dream.get/post/put/delete/head/connect/options/trace/patch/any` registration, and a simple named handler. A unique same-file one-parameter function produces `framework.dream.direct-router.literal-named-function.local-function`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies OCaml discovery, direct function containment, exact and unresolved Dream route-query/source-search behavior, dynamic/inline/qualified/scoped/local/wrong-entrypoint rejection, malformed delimiter/comment/raw-string fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.57.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. OCaml symbols and Dream routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v46`; the project resolver remains `project-resolver-v16` because all accepted Dream callback proof is file-local. A pre-v0.57 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes OCaml-capable facts.

### Deliberate limits

- The OCaml extractor is a deliberately small lexical/comment/delimiter implementation, not a full OCaml parser. It retains only file symbols for unbalanced delimiters or unterminated strings, raw strings, or nested comments, and does not claim generic OCaml module, type, call, import, package, or runtime analysis.
- Dream support accepts only direct top-level literal `Dream.router` lists, the three specified direct `Dream.run` pipeline forms, simple direct one-parameter top-level `let` functions, literal unescaped slash-prefixed paths, and simple same-file named handlers. It excludes `Dream.scope`, `Dream.serve`, runtime options/composition, anonymous/qualified/cross-file handlers, dynamic/escaped paths, local or typed/pattern handlers, and runtime behavior. The local CodeGraph baseline does not list OCaml in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic OCaml parity.

## [0.56.0] - 2026-07-31

### Added

- Haskell `.hs` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated Haskell lexical/comment/delimiter/layout extractor for simple column-zero zero-argument `name = ...` function containment.
- An executable first-party `scotty` capability. Direct Scotty route facts require exactly one column-zero `import Web.Scotty` proof, a column-zero `name = scotty <decimal-port> $ do` header, a direct baseline-indented literal `get/post/put/delete/patch/options` registration, and a simple named handler. A unique same-file zero-argument function produces `framework.scotty.direct-block.literal-named-function.local-function`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Haskell discovery, direct function containment, exact and unresolved Scotty route-query/source-search behavior, qualified-import/dynamic-port/dynamic-path/inline/nested/repeated-import rejection, malformed delimiter/comment and tab-layout fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.56.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Haskell symbols and Scotty routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v45`; the project resolver remains `project-resolver-v16` because all accepted Scotty callback proof is file-local. A pre-v0.56 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Haskell-capable facts.

### Deliberate limits

- The Haskell extractor is a deliberately small lexical/layout-aware implementation, not a full Haskell parser. It retains only file symbols for unbalanced delimiters, unterminated strings/comments, or tabs, and does not claim generic Haskell module, type, call, import, package, or runtime analysis.
- Scotty support accepts only exactly one direct `import Web.Scotty`, literal decimal-port `scotty ... $ do` blocks, simple direct block-level named routes, and direct top-level zero-argument functions. It excludes qualified/selective/repeated imports, `scottyT`, dynamic ports/paths, `addroute`/`matchAny`, inline `do` handlers, nested statements, local callbacks, cross-file handlers, and runtime behavior. The local CodeGraph baseline does not list Haskell in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic Haskell parity.

## [0.55.0] - 2026-07-31

### Added

- Julia `.jl` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated Julia lexical/delimiter/block-balancing extractor for simple top-level one-line `name(...) = ...` function containment.
- An executable first-party `genie` capability. Direct Genie route facts require exactly one direct top-level `using Genie` proof, a direct statement-start literal `route("/path", name)` registration, and either the default `GET` or an exact literal `method = GET/POST/PUT/PATCH/DELETE/OPTIONS` keyword. A unique same-file one-line function produces `framework.genie.direct-route.literal-named-function.local-function`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Julia discovery, direct function containment, exact and unresolved Genie route-query/source-search behavior, import/dynamic/inline/named/qualified-method/nested/repeated-use rejection, malformed delimiter/block and unterminated quote fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.55.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Julia symbols and Genie routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v44`; the project resolver remains `project-resolver-v16` because all accepted Genie callback proof is file-local. A pre-v0.55 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Julia-capable facts.

### Deliberate limits

- The Julia extractor is a deliberately small lexical/delimiter/block-balancing implementation, not a full Julia parser. It retains only file symbols for unbalanced delimiters or blocks, unterminated strings/comments, or unsupported char/triple-string input, and does not claim generic Julia module, macro, call, type, import, package, or runtime analysis.
- Genie support accepts only exactly one direct top-level `using Genie` proof, simple direct top-level one-line function definitions, literal direct named-handler paths, and direct literal method keywords. It excludes `import Genie`, inline `do ... end` handlers, named routes, qualified constants, dynamic/escaped paths, generic wrapper/module/function/macro semantics, cross-file handlers, and runtime behavior. The local CodeGraph baseline does not list Julia in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic Julia parity.

## [0.54.0] - 2026-07-30

### Added

- Perl `.pl` / `.pm` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated Perl lexical/delimiter-balancing extractor for an optional direct `package` plus simple top-level `sub` containment.
- An executable first-party `dancer2` capability. Direct Dancer2 route facts require exactly one direct `use Dancer2;`, a direct top-level literal `get` / `post` / `put` / `patch` / `del` / `options` registration, and an exact `\&name` coderef. A unique same-file `sub` produces `framework.dancer2.direct-route.literal-verb.local-sub`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Perl discovery, direct package/function containment, exact and unresolved Dancer2 route-query/source-search behavior, import-list/dynamic/inline/`any`/nested/repeated-use rejection, malformed delimiter and unterminated quote fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.54.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Perl symbols and Dancer2 routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v43`; the project resolver remains `project-resolver-v16` because all accepted Dancer2 callback proof is file-local. A pre-v0.54 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Perl-capable facts.

### Deliberate limits

- The Perl extractor is a deliberately small lexical/delimiter-balancing implementation, not a full Perl parser. It retains only file symbols for unbalanced delimiters or unterminated quoted input, and does not claim generic Perl package, module, call, type, regex, heredoc, POD, or runtime analysis.
- Dancer2 support accepts only exactly one direct `use Dancer2;`, at most one direct `package`, simple direct top-level `sub`, literal direct verb paths, and simple same-file named coderefs. It excludes import lists/aliases/multiple direct uses, `any`, named routes, prefixes/hooks/plugins, inline/qualified/wrapped/cross-file handlers, dynamic/escaped paths, prototypes/attributes/nested subs, generic package resolution, and runtime behavior. The local CodeGraph baseline does not list Perl in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic Perl parity.

## [0.53.0] - 2026-07-30

### Added

- Clojure `.clj` source discovery, persisted source-search language filtering, CLI/MCP validation, and a deliberately isolated Clojure lexical/delimiter-balancing extractor for exactly one direct `ns` plus simple top-level `defn` containment.
- An executable first-party `compojure` capability. Direct Compojure route facts now require a direct namespace `:require` proof containing exactly one `[compojure.core :refer :all]` or explicit `[compojure.core :refer [defroutes verb ...]]` vector, a top-level `defroutes`, literal direct HTTP-verb paths, and a simple named handler. A unique same-file `defn` produces `framework.compojure.direct-defroutes.literal-verb.local-function`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Clojure discovery, direct namespace/function containment, exact and unresolved Compojure route-query/source-search behavior, explicit `:refer :all` proof, alias/dynamic/inline/nested rejection, malformed delimiter and unterminated quote fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.53.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Clojure symbols and Compojure routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v42`; the project resolver remains `project-resolver-v16` because all accepted Compojure callback proof is file-local. A pre-v0.53 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Clojure-capable facts.

### Deliberate limits

- The Clojure extractor is a deliberately small lexical/delimiter-balancing implementation, not a full Clojure reader or parser. It retains only file symbols for unbalanced delimiters or unterminated quoted input, and does not claim generic Clojure namespace, macro, call, type, module, or runtime analysis.
- Compojure support accepts only one direct `compojure.core` `:refer` proof, direct simple top-level `defn`, a top-level `defroutes`, literal direct verb paths, and simple same-file named handlers. It excludes aliases/namespaced macro calls, `:use` or dynamic dependency forms, `context` / `routes` / `ANY`, middleware, docstring/metadata/private/multi-arity `defn` forms, inline/qualified/cross-file handlers, dynamic/escaped paths, generic namespace resolution, and runtime behavior. The local CodeGraph baseline does not list Clojure in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic Clojure parity.

## [0.52.0] - 2026-07-30

### Added

- Erlang `.erl` source discovery, persisted source-search language filtering, CLI/MCP validation, and a deliberately isolated Erlang lexical/delimiter-balancing extractor for direct `-module`, `-export`, and simple top-level function containment.
- An executable first-party `cowboy` capability. Direct Cowboy route facts now require one direct `cowboy_router:compile([{'_', [...] }])` wildcard-host dispatch list, literal slash-prefixed unescaped string paths, unquoted handler atoms, and literal three-item `{Path, Handler, InitialState}` tuples. A unique same-module exported `init/2` produces `framework.cowboy.direct-router.literal-wildcard-host.local-exported-init`; any other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Erlang discovery, direct module/export/function containment, exact and unresolved Cowboy route-query/source-search behavior, dynamic/non-wildcard/binary/constrained/indirect route rejection, malformed delimiter and unterminated quote fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.52.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Erlang symbols and Cowboy routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v41`; the project resolver remains `project-resolver-v16` because all accepted Cowboy callback proof is file-local. A pre-v0.52 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Erlang-capable facts.

### Deliberate limits

- The Erlang extractor is a deliberately small lexical/delimiter-balancing implementation, not a full Erlang parser. It retains only file symbols for unmatched delimiters or unterminated quoted input, and does not claim generic Erlang behaviour, call, type, record, OTP, include, parse-transform, module-resolution, or runtime analysis.
- Cowboy support accepts only a direct literal wildcard-host dispatch list and resolves only a unique same-module exported `init/2`. It excludes multiple/specific hosts, host/path constraints, binary/dynamic/escaped paths, quoted or macro-generated handlers, dispatch variables, aliases, nested router calls, cross-file handlers, and runtime behavior. The local CodeGraph baseline lists generic Erlang language support but has no detected Cowboy-specific route extractor; SymbolLattice adds a narrow audited framework slice rather than claiming broader generic Erlang parity.

## [0.51.0] - 2026-07-30

### Added

- Elixir `.ex` / `.exs` source discovery, persisted source-search language filtering, CLI/MCP validation, and a deliberately isolated Elixir lexical/block-balancing extractor for direct top-level `defmodule` containment plus direct module `def` / `defp` methods.
- An executable first-party `phoenix` capability. Exact Phoenix route facts now require a direct module-level `use Phoenix.Router` (optionally `helpers: false`), literal nested `scope` prefixes, one direct literal `get` / `post` / `put` / `patch` / `delete` / `head` / `options` / `trace` / `connect` route, a full controller module, and an atom action. A unique direct same-file module method produces `framework.phoenix.direct-router.literal-verb.full-module-controller-action.local-method`; any other accepted controller action remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Elixir discovery, direct module/method containment, nested scope composition, exact and unresolved route-query/source-search behavior, indirect/missing router proof, dynamic/unsupported/nested-route rejection, malformed block and unterminated string fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.51.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Elixir symbols and Phoenix routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v40`; the project resolver remains `project-resolver-v16` because all accepted Elixir and Phoenix proof is file-local. A pre-v0.51 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Elixir-capable facts.

### Deliberate limits

- The Elixir extractor is a deliberately small lexical/block-balancing implementation, not a full Elixir parser. It retains only file symbols for unmatched `do` / `end` or unterminated quoted/charlist/heredoc input, and does not claim generic Elixir import, alias, call, type, macro, protocol, OTP, or runtime analysis.
- Phoenix support accepts only a direct `use Phoenix.Router` module binding, literal direct scopes, literal direct HTTP-verb paths, full-module controller atom actions, and direct same-file module methods. It excludes customary `use AppWeb, :router` macro expansion, aliases/imports, `resources`, `match`, `forward`, pipelines, router/controller factories, macro-generated forms, `def name, do:` methods, nested modules, dynamic/raw/escaped paths, generic cross-file resolution, and runtime behavior. The local CodeGraph baseline does not list Elixir in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider Elixir parity.

## [0.50.0] - 2026-07-30

### Added

- R `.r` / `.R` source discovery, persisted source-search language filtering, CLI/MCP validation, and a deliberately isolated R lexical/delimiter-balancing extractor for direct top-level braced `name <- function(...)` and `name = function(...)` containment.
- An executable first-party `plumber` capability. Exact route facts now require a standalone top-level `#*` or `#'` annotation with a literal slash-prefixed `@get`, `@post`, `@put`, or `@delete` path immediately followed by a top-level braced anonymous `function(...) { ... }` handler. Every accepted edge carries `framework.plumber.annotation.literal-route.braced-handler` evidence.
- Unit and integration coverage now verifies R discovery, direct function containment, `#*` and `#'` annotations, exact route-query/source-search behavior, dynamic/unsupported/non-immediate/named/nested rejection, assignment-continuation rejection, unbalanced delimiter or unterminated quoted/backtick fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.50.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. R symbols and Plumber routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v39`; the project resolver remains `project-resolver-v16` because all accepted R and Plumber proof is file-local. A pre-v0.50 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes R-capable facts.

### Deliberate limits

- The R extractor is a deliberately small lexical/delimiter-balancing implementation, not a full R parser. It retains only file symbols for unbalanced delimiters or unterminated quoted/backtick input, and does not claim generic R package, import, call, type, expression, S3/S4, or runtime analysis.
- Plumber support accepts only standalone top-level `#*` / `#'` annotations, plain literal slash-prefixed paths, `get` / `post` / `put` / `delete` directives, and immediately following top-level braced anonymous function handlers. It excludes `head`, `patch`, programmatic `pr_*` / `Plumber$handle` registration, filters, mounts, route groups, OpenAPI annotations, named/inline/nested handlers, aliases/wrappers, dynamic/raw/escaped paths, generic R package resolution, and runtime behavior. The local CodeGraph baseline has broader generic R indexing through its dedicated grammar but no Plumber-specific resolver; SymbolLattice adds a narrow audited framework surface rather than claiming R parity.

## [0.49.0] - 2026-07-30

### Added

- Lua `.lua` source discovery, persisted source-search language filtering, CLI/MCP validation, and a deliberately isolated Lua lexical extractor for direct top-level `function` and `local function` containment.
- An executable first-party `lapis` capability. Exact route facts now require direct `local lapis = require("lapis")` followed by `local app = lapis.Application()`, or direct `local app = require("lapis").Application()`, then one direct literal `app:get`, `app:post`, `app:put`, `app:delete`, or `app:match` registration with exactly one unique, prior, un-rebound same-file `local function` handler. `match` is represented as `ALL`; verb shortcuts retain their matching HTTP method and every accepted edge carries `framework.lapis.direct-application.literal-route.local-function` evidence.
- Unit and integration coverage now verifies Lua discovery, top-level function containment, Lapis two-step/direct application bindings, named route forms, exact route-query/source-search behavior, dynamic path/inline-handler/missing-framework/rebound/late-handler rejection, unbalanced-source fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.49.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Lua symbols and Lapis routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v38`; the project resolver remains `project-resolver-v16` because all accepted Lua and Lapis proof is file-local. A pre-v0.49 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Lua-capable facts.

### Deliberate limits

- The Lua extractor is a deliberately small lexical/block-balancing implementation, not a full Lua parser. It retains only file symbols for unbalanced block/parenthesis or unterminated string/comment input, and does not claim generic Lua import, call, table, type, module, coroutine, metatable, macro, or runtime analysis.
- Lapis support accepts only parenthesized `require("lapis")`, direct local `Application()` bindings, top-level `get` / `post` / `put` / `delete` / `match` calls, plain literal slash-prefixed paths, and direct prior local function handlers. It excludes MoonScript, `Application:extend`, `include`, `respond_to`, route tables, inline/global/imported/cross-file handlers, aliases/wrappers, groups/prefixes, dynamic/raw/escaped paths, receiver/handler rebinding, nested control flow, method dispatch inside an action, and runtime behavior. The local CodeGraph baseline has broader generic Lua indexing through its dedicated grammar but no Lapis resolver; SymbolLattice adds a narrow audited framework surface rather than claiming Lua parity.

## [0.48.0] - 2026-07-30

### Added

- C `.c` source discovery, persisted source-search language filtering, CLI/MCP validation, and direct top-level function containment through a deliberately separate C extractor. C++ source files remain on their existing cpp-httplib path.
- An executable first-party `civetweb` capability. A route now requires a direct `<civetweb.h>` or `"civetweb.h"` include, a direct `mg_set_request_handler(context, "/literal", handler, cbdata)` registration in a direct function body, one literal slash-prefixed URI, and one unique unshadowed same-file top-level handler function. CivetWeb handler registration does not bind an HTTP method, so matching routes are represented as `ALL` and retain `framework.civetweb.direct-request-handler.literal-uri.local-function` evidence.
- Unit and integration coverage now verifies C discovery, direct function containment, exact C source-search and `ALL` route-query behavior, quoted/system header forms, dynamic URI rejection, missing-header rejection, duplicate handler rejection, local-shadow rejection, and syntax-error fail-closed behavior. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.48.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. C symbols and CivetWeb routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v37`; the project resolver remains `project-resolver-v16` because all accepted CivetWeb proof is file-local. A pre-v0.48 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes C-capable facts.

### Deliberate limits

- The C extractor intentionally accepts only common parser-proven top-level function forms. It does not claim full C preprocessing, macro expansion, header graph resolution, C type checking, function-pointer data-flow, cross-file handler resolution, nested control-flow registration, or runtime behavior.
- CivetWeb support excludes indirect/wrapper registration, dynamic/raw/escaped URIs, non-identifier context or handler expressions, duplicate handlers, potentially shadowed handlers, aliases, non-direct body statements, WebSocket/auth callbacks, per-method request inspection, and runtime route behavior. The local CodeGraph baseline already indexes C with a dedicated parser but has no CivetWeb resolver; SymbolLattice adds a narrow audited framework surface rather than claiming broad C parity.

## [0.47.0] - 2026-07-30

### Added

- Play controller-action resolution now accepts one uniquely proven direct Java package/class/method target as well as the existing Scala proof. Java package facts are additive raw artifact facts; a same-name Scala and Java candidate remains explicitly unresolved rather than selecting one by language.
- Literal Play `-> /prefix package.Router` rows now emit a `MOUNT ...` route-kind node and an exact or unresolved `handles` edge. Exact mounts use `framework.play.conf-routes.literal-router-mount.package-class` evidence; missing or ambiguous Router class targets retain `framework.play.conf-routes.literal-router-mount.unresolved-router` evidence. A mount is deliberately absent from the concrete HTTP `routes` inventory.
- SQLite raw artifact persistence now writes both `scalaFacts` and `javaFacts`. This closes the v0.46 omission that could drop Scala package facts on a later incremental sync, while preserving older artifact payloads as readable.
- Unit and integration coverage now verifies Java package facts, exact Java Play controller resolution, Scala/Java raw-fact reuse across unrelated `sync` runs, literal Router mount exact/unresolved evidence, and rejection of dynamic/wildcard Router prefixes. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.47.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. `scalaFacts`, `javaFacts`, and Router-mount facts are additive JSON payload fields inside the existing raw artifact-facts store; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v36` and the project resolver to `project-resolver-v16`. A pre-v0.47 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes persisted Scala/Java package facts and Play mount evidence.

### Deliberate limits

- The accepted mount form is only a literal slash-prefix and fully qualified Router class name. Dynamic/wildcard prefixes, unqualified Router names, Router-interface type checking, recursive mounted-router endpoint expansion, `build.sbt` detection, imported/classpath Router targets, and runtime behavior remain outside this release.
- Play controller actions still require exactly one direct package/class/object and exactly one direct method. Overloads, binders, reverse routing, generic Scala/Java type resolution, and runtime semantics remain deliberately unresolved. CodeGraph remains broader in Play project detection and action matching; SymbolLattice v0.47 adds a narrow audited mount edge that CodeGraph currently skips.

## [0.46.0] - 2026-07-30

### Added

- Play route extraction now preserves the full controller-action spelling as a `PendingReference`, while Scala source facts retain the direct package proof for every indexed class/object symbol.
- The project resolver now emits an exact `routes` edge with `framework.play.conf-routes.literal-controller-action.package-class-method` evidence only when one fully static controller action has exactly one direct package match, exactly one class/object, and exactly one direct body method. Candidate class and method symbol IDs remain auditable in the edge evidence.
- Missing methods and wrong-package handlers remain explicitly unresolved with `framework.play.conf-routes.literal-controller-action.unresolved-handler`; this resolver never uses a global simple-name guess.
- Unit and integration coverage now verifies raw Play pending facts, full controller-action names, exact cross-file route resolution, and fail-closed incomplete package-class-method proof. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.46.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The existing file, symbol, edge, source-search, and route-query contracts are reused; `scalaFacts` is additive in the raw artifact-fact payload and existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v35` and the project resolver to `project-resolver-v15`. A pre-v0.46 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes the full Play controller-action facts and exact project projection.

### Deliberate limits

- Play exact resolution is deliberately narrower than generic Scala name resolution: it accepts only literal `conf/routes` / `conf/*.routes` entries whose fully static action can be proven through one direct package clause, one class/object, and one direct body method. It excludes `->` includes, route prefixes/composition, `build.sbt` detection, imported/classpath controller resolution, overload resolution, binders, reverse routing, Scala 3 contextual declarations, and runtime behavior.
- CodeGraph's Play resolver remains broader in project detection, route-file composition, and controller-action resolution. SymbolLattice v0.46 adds independently auditable package-class-method uniqueness proof, but it does not claim general Scala or Play parity.

## [0.45.0] - 2026-07-30

### Added

- Scala `.scala` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/object/trait/method/function containment, and a first-party `@ast-grep/lang-scala` AST adapter.
- An executable first-party `play` capability. Play route discovery now includes only `conf/routes` and `conf/*.routes`; each accepted literal HTTP verb/path/controller-action row emits `framework.play.conf-routes.literal-controller-action.unresolved-handler` evidence and an explicitly unresolved `routes` edge.
- The shared dynamic ast-grep language registry now registers C#, Ruby, Kotlin, Swift, Dart, and Scala together, preserving every first-party prebuilt grammar in the same long-lived process.
- Capability, discovery, direct route-table extraction, explicit unresolved route-query behavior, class/object/trait/method/function containment, malformed/non-Play route-row and syntax-error rejection, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.45.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Scala symbols and Play route-table entries reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v34`; the project resolver remains `project-resolver-v14` because accepted Play controller handlers remain deliberately unresolved in this release. A pre-v0.45 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Scala support accepts direct top-level class/object/trait/function forms and direct body `def` members only. Play support accepts only literal `conf/routes` / `conf/*.routes` controller-action rows and leaves all targets unresolved. It excludes `->` includes, prefixes/composition, `build.sbt` detection, controller/package/import/classpath/overload resolution, custom binders, reverse routing, Scala 3 contextual declarations, generic Scala call/type resolution, and runtime behavior.
- CodeGraph's Play resolver is broader: it detects `build.sbt` or Play configuration, handles extensionless and included route files, parses controller-action argument forms, and resolves a `Controller.method` reference to an indexed action method. SymbolLattice v0.45 deliberately ships a separate AST-backed Scala symbol layer plus a conservative static route-table parser whose controller targets remain explicitly unresolved; it is behind CodeGraph's Play controller-resolution coverage.

## [0.44.0] - 2026-07-30

### Added

- Dart `.dart` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/method/function containment, and a first-party `@ast-grep/lang-dart` AST adapter.
- An executable first-party `flutter` capability. Flutter navigation now requires a direct `import 'package:flutter/material.dart';`, a direct `MaterialApp` literal `routes` map, a literal slash-prefixed key, a one-parameter arrow builder, and one unique direct same-file widget class. Matching routes emit exact `framework.flutter.direct-material-app.literal-routes-map.local-widget-class` evidence with `NAVIGATE` semantics.
- The shared dynamic ast-grep language registry now registers C#, Ruby, Kotlin, Swift, and Dart together, preserving every first-party prebuilt grammar in the same long-lived process.
- Capability, discovery, exact navigation, class/method/function containment, dynamic/closure/missing-import/wrong-app/missing-target/malformed-source rejection, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.44.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Dart symbols and Flutter navigation reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v33`; the project resolver remains `project-resolver-v14` because all supported Flutter proof is file-local. A pre-v0.44 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Flutter support accepts only the direct literal `MaterialApp(routes: {...})` form with one-parameter arrow builders that instantiate a unique same-file no-argument class. It excludes `MaterialApp.router`, `CupertinoApp`, `home` / `onGenerateRoute` / `Navigator` calls, aliases, spreads or typed/dynamic maps, dynamic/interpolated/escaped paths, closures, constructor arguments, non-class/cross-file targets, Dart package/module/type resolution, and runtime behavior.
- The checked CodeGraph baseline indexes Dart source files but has no Dart/Flutter framework resolver under `src/resolution/frameworks`. SymbolLattice v0.44 deliberately adds a narrow AST-proven Flutter navigation form with exact same-file widget evidence; CodeGraph remains broader across its other supported language and framework surfaces.

## [0.43.0] - 2026-07-30

### Added

- Swift `.swift` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/struct/protocol/method/function containment, and a first-party `@ast-grep/lang-swift` AST adapter.
- An executable first-party `vapor` capability. Vapor routes now require a direct `import Vapor`, a direct `routes(_ app: Application)` function, a direct `app.` HTTP verb call, zero or more literal path segments, and one unique direct top-level same-file `use: handler` function. Matching routes emit exact `framework.vapor.direct-routes-application.literal-segment-route.use.local-function` evidence.
- The shared dynamic ast-grep language registry now registers C#, Ruby, Kotlin, and Swift together, preserving every first-party prebuilt grammar in the same long-lived process.
- Capability, discovery, exact route, class/struct/protocol/method/function containment, dynamic/closure/missing-import/wrong-function/wrong-parameter/missing-handler/malformed-source rejection, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.43.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Swift symbols and Vapor routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v32`; the project resolver remains `project-resolver-v14` because all supported Swift proof is file-local. A pre-v0.43 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Vapor support accepts only the direct literal `routes(_ app: Application)` / `app.<verb>(..., use: handler)` form. It excludes aliased imports/receivers, groups or prefixes, middleware, closure/member/qualified handlers, dynamic/interpolated/escaped path segments, overload/cross-file resolution, Swift package/module/type resolution, Fluent/controller semantics, and runtime behavior.
- CodeGraph has a broader regex-based Vapor resolver: it detects Vapor from `Package.swift` or imports, tracks direct `grouped` and `group` prefix variables, accepts routes on generic builders, and resolves a handler name through its framework-resolution flow. SymbolLattice v0.43 deliberately adds a narrower AST-proven direct route form with exact same-file handler evidence; it remains behind CodeGraph's broader Swift/Vapor coverage.

## [0.42.0] - 2026-07-30

### Added

- Kotlin `.kt` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/interface/method/function containment, and a first-party `@ast-grep/lang-kotlin` AST adapter.
- An executable first-party `ktor` capability. Ktor routes now require direct unaliased imports of `io.ktor.server.application.Application`, `io.ktor.server.routing.routing`, and the used verb; a direct `fun Application.module()` function; one direct `routing { ... }` block; one literal slash-prefixed path; and one unique direct top-level `::handler` callable reference. Matching routes emit exact `framework.ktor.direct-application-module.routing.literal-route.callable-reference.local-function` evidence.
- The shared dynamic ast-grep language registry now registers C#, Ruby, and Kotlin together, preserving all previously supported prebuilt grammars in the same long-lived process.
- Capability, discovery, exact route, class/interface/method/function containment, dynamic/lambda/missing-import/wrong-module/missing-handler/malformed-source rejection, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.42.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Kotlin symbols and Ktor routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v31`; the project resolver remains `project-resolver-v14` because all supported Kotlin proof is file-local. A pre-v0.42 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Ktor support accepts only the direct literal `Application.module`/`routing` callable-reference form above. It excludes star/aliased imports, alternative module names/receivers, `route` / `authenticate` / `static` composition, lambda/member/qualified handlers, named arguments, dynamic/interpolated/escaped paths, overload/cross-file resolution, plugins/pipelines, generic Kotlin import/package/call/type resolution, and runtime behavior.
- CodeGraph indexes Kotlin in the local baseline but its current `src/resolution` source has no Ktor framework resolver. SymbolLattice v0.42 therefore introduces a narrow AST-proven Ktor route surface that CodeGraph does not currently expose, while remaining far behind CodeGraph's overall multi-language breadth.

## [0.41.0] - 2026-07-30

### Added

- Ruby `.rb` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/method/function containment, and a first-party `@ast-grep/lang-ruby` AST adapter.
- An executable first-party `rails` capability. Rails routes now require a direct `Rails.application.routes.draw do ... end` block, one literal slash-prefixed `get` / `post` / `put` / `patch` / `delete` / `head` / `options` call, and exactly `to: "controller#action"`. Same-file non-namespaced controllers emit exact `framework.rails.direct-routes-draw.literal-controller-action.local-method` evidence; namespaced or cross-file controllers retain an explicit `unresolved` controller-action edge instead of a guessed target.
- A shared C#/Ruby ast-grep language registry. The runtime registers all first-party dynamic grammars in one replacement-safe call, so adding Ruby cannot hide the existing C# parser in a long-lived process.
- Capability, discovery, exact/unresolved route, unsupported verb/dynamic/resource/namespace/malformed-source rejection, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.41.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Ruby symbols and Rails routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v30`; the project resolver remains `project-resolver-v14` because all supported Ruby proof is file-local. A pre-v0.41 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Rails support accepts only the direct literal `routes.draw` form above. It excludes `resources` / `resource`, `namespace` / `scope`, route groups/prefixes, constraints, root/mount/redirect/match forms, lambdas and other non-controller handlers, controller aliases/namespaces, dynamic/interpolated/escaped values, generic Ruby import/package/call/type resolution, cross-file controller resolution, and runtime Rails behavior.
- CodeGraph has a broader regex-based Rails resolver: it detects Rails projects, extracts explicit `get` / `post` / `put` / `patch` / `delete` / `match` routes plus `resources` / `resource` expansions, and heuristically resolves controller actions across files at confidence `0.85`. SymbolLattice v0.41 intentionally adds a narrower AST-proven `routes.draw` surface with explicit exact-versus-unresolved controller evidence; it remains far behind CodeGraph's overall multi-language breadth.

## [0.40.0] - 2026-07-30

### Added

- C# `.cs` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/interface/method/local-function containment, and a first-party `@ast-grep/napi` + `@ast-grep/lang-csharp` AST adapter with Windows prebuilt parser support.
- An executable first-party `aspnet-core` capability. Minimal API routes now require direct `WebApplication.CreateBuilder(...).Build()` or direct builder/`Build()` bindings, one literal slash-prefixed `MapGet` / `MapPost` / `MapPut` / `MapPatch` / `MapDelete` registration, and one unique direct named top-level local function handler. Matching routes emit `framework.aspnet-core.direct-web-application.literal-route.local-function` evidence; direct receiver reassignment invalidates the binding.
- Direct MVC controller evidence for a direct `Microsoft.AspNetCore.Mvc` import or fully-qualified MVC attributes, one `ApiController`, one literal `Route`, and one literal `Http*` method mapping on its direct local method. Matching routes emit `framework.aspnet-core.direct-api-controller.literal-route.method` evidence.
- Capability, discovery, Minimal API, MVC, fully-qualified attribute, dynamic/lambda/rebinding/missing-import rejection, malformed-source, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.40.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. C# symbols and ASP.NET Core routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v29`; the project resolver remains `project-resolver-v14` because all supported C# proof is file-local. A pre-v0.40 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- ASP.NET Core support accepts only the direct Minimal API and MVC forms above. It excludes `MapMethods`, `MapGroup`, endpoint filters/middleware, lambdas/delegates/member/cross-file handlers, controller tokens/aliases, inheritance/interface resolution, nested types/scopes, configuration/DI semantics, semantic type checking, and runtime behavior.

## [0.39.0] - 2026-07-30

### Added

- C++ `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, and `.hxx` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/method/function containment, and a first-party `@lezer/cpp` AST adapter.
- An executable first-party `cpp-httplib` capability. A route now requires direct `#include <httplib.h>` or `"httplib.h"` evidence, a direct `httplib::Server` or `httplib::SSLServer` local declaration in one direct top-level function body, one literal slash-prefixed URI, and one unique direct named top-level function handler. Matching routes emit `framework.cpp-httplib.direct-server.literal-route.local-function` evidence. Direct receiver assignment invalidates that receiver before later route extraction.
- Capability, discovery, exact route, include, dynamic/lambda/missing-handler/rebinding rejection, malformed-source, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.39.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. C++ symbols and cpp-httplib routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v28`; the project resolver remains `project-resolver-v14` because all supported C++ proof is file-local. A pre-v0.39 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- cpp-httplib support accepts only direct header inclusion, direct scoped server declarations, direct local function-body receiver methods, literal paths, and unique top-level named function handlers. It excludes `using namespace`, aliases, factories, wrappers, nested scopes, lambdas/member/callback handlers, regex/raw/escaped/dynamic paths, cross-file or overload resolution, middleware hooks, and runtime behavior.
- CodeGraph has broader C++ language indexing but no equivalent dedicated cpp-httplib route pack in its current framework resolver set. SymbolLattice v0.39 intentionally adds a narrow AST-proven C++ HTTP route surface while remaining far behind CodeGraph's overall multi-language breadth.

## [0.38.0] - 2026-07-30

### Added

- PHP `.php` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/method/function containment, and a first-party `@lezer/php` AST adapter.
- An executable first-party `laravel` capability. A route now requires a direct `Illuminate\Support\Facades\Route` import (including one explicit alias) or fully-qualified facade, one literal URI, one direct `get` / `post` / `put` / `patch` / `delete` / `options` / `any` facade call, and a literal `[Controller::class, 'action']` array. Same-file unqualified controllers emit exact `framework.laravel.direct-facade.literal-controller-action.local-method` evidence; cross-file controllers retain an explicit `unresolved` `Controller@action` edge instead of a guessed target.
- Capability, discovery, exact/unresolved route, alias, fully-qualified facade, dynamic/closure/resource rejection, malformed-source, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.38.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. PHP symbols and Laravel routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v27`; the project resolver remains `project-resolver-v14` because PHP controller resolution is deliberately not inferred. A pre-v0.38 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Laravel support accepts only direct/aliased imported or fully-qualified facade calls, one literal URI, and one literal controller-action array. It excludes controller/import/package resolution, route groups/prefixes/resources, `match`, closure/string/invokable handlers, redirects/views/fallbacks, middleware/configuration semantics, dynamic/escaped/interpolated values, grouped/wildcard imports, and runtime behavior. Cross-file controller action references are retained as unresolved evidence rather than mapped heuristically.
- CodeGraph has broader regex-based Laravel route, controller, and resource extraction. SymbolLattice v0.38 intentionally trades that breadth for AST-proven facade/import, literal URI/action, and explicit exact-versus-unresolved handler evidence in its first PHP/Laravel slice.

## [0.37.0] - 2026-07-30

### Added

- Java `.java` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class and direct method containment, and a first-party `@lezer/java` AST adapter.
- An executable first-party `spring-web` capability. A route now requires direct non-static/non-wildcard Spring annotation imports (or fully-qualified annotations), a direct `@RestController` or `@Controller`, an optional literal class-level `@RequestMapping` prefix, one literal direct `@GetMapping` / `@PostMapping` / `@PutMapping` / `@PatchMapping` / `@DeleteMapping` method annotation, and its exact local method. Matching routes emit `framework.spring-web.direct-controller.literal-method-mapping.local-method` evidence.
- Capability, discovery, exact route, fully-qualified annotation, import/dynamic/method-level-`RequestMapping` rejection, malformed-source, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.37.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Java symbols and Spring Web routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v26`; the project resolver remains `project-resolver-v14` because the supported Java and Spring Web forms are file-local. A pre-v0.37 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Spring Web support accepts only direct non-static/non-wildcard annotation imports or fully-qualified annotations, a direct controller class, an optional one-literal class prefix, and one one-literal shortcut method mapping on a direct local method. Method-level `@RequestMapping(method = ...)`, annotation arrays or multiple paths/conditions, placeholders or SpEL, custom/composed annotations, wildcard/static imports, nested/inherited/interface handlers, Java package/classpath resolution, semantic Spring configuration, and runtime behavior remain excluded.
- CodeGraph has broader Java declaration, project-level Spring detection, `@RequestMapping` method handling, Kotlin, configuration, and regex-based route extraction. SymbolLattice v0.37 intentionally trades that breadth for AST-proven annotation/import, literal-path, direct-controller, and exact local-method evidence in its first Java/Spring slice.

## [0.36.0] - 2026-07-30

### Added

- Rust `.rs` source discovery, persisted source-search language filtering, CLI/MCP validation, conservative top-level function containment, and a first-party `@lezer/rust` AST adapter.
- An executable first-party Axum capability for direct, unambiguous `use` bindings of `axum::Router` and `axum::routing::{get, post, put, patch, delete, head, options, trace}` (including direct aliases). A contiguous direct `Router::new().route("/path", method(handler))` builder chain with a literal path and one named top-level local handler now emits exact `framework.axum.direct-router.route.local-function` route evidence.
- Capability, discovery, CLI, unit, integration, source-search, dynamic/shadow/inline/composition/wrapper/rebinding/import-proof, and malformed-source coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.36.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Rust facts and Axum routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v25`; the project resolver remains `project-resolver-v14` because the supported Rust and Axum forms are file-local. A pre-v0.36 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Axum support accepts only direct non-public/non-wildcard `use` bindings, a direct unshadowed `Router::new()` root, contiguous literal `.route(...)` calls, one direct imported method-router helper, and one named top-level local function handler. `route_service`, `nest`, `merge`, `with_state`, `layer`, type/generic constructors, trailing wrappers, `MethodRouter` composition, inline/wrapped/namespaced handlers, dynamic/escaped paths, mutable/factory/router flow, methods, cross-file Cargo/module resolution, semantic type checking, and runtime behavior remain excluded.
- CodeGraph has materially broader Rust declaration, crate/module, and regex-based Axum/Actix/Rocket coverage. SymbolLattice v0.36 intentionally trades that breadth for auditable import, constructor, builder-chain, literal-path, local-handler, and shadowing proof in this first Rust slice.

## [0.35.0] - 2026-07-30

### Added

- An executable first-party Chi capability for direct non-dot/non-blank `github.com/go-chi/chi/v5` imports. Direct same-function `router := chi.NewRouter()` or `chi.NewMux()` receivers now emit exact route edges for `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`, `Trace`, `Connect`, and `HandleFunc` with `framework.chi.direct-router.method.local-function` evidence.
- Additive `CONNECT` route-method support throughout the existing route symbol, query, CLI, and MCP contracts. Direct Chi `Connect("/path", handler)` routes and literal Go 1.22 `net/http` `"CONNECT /path"` `HandleFunc` patterns now remain exact route records instead of being rejected.
- Capability, unit, integration, dynamic/shadow/inline/wrapper/rebinding/composition-rejection, `CONNECT` filtering, and persisted route-query coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.35.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive `chi` capability and `CONNECT` method reuse existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v24`; the project resolver remains `project-resolver-v14` because all Chi and `net/http` proof remains file-local. A pre-v0.35 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Chi support accepts only a direct `github.com/go-chi/chi/v5` import, a direct unshadowed same-function `:= chi.NewRouter()` or `chi.NewMux()` binding, a literal slash-prefixed path, and one named package-level function handler. `Route`/`Group`/`Mount` composition, `With` middleware chains, `Handle`, `Method`/`MethodFunc`, `Query`, inline/wrapped handlers, dynamic/escaped paths, `var`/factory/wrapper bindings, receiver methods, cross-file router flow, generic Go imports/calls/type resolution, Go module/package resolution, semantic type checking, and runtime behavior remain excluded.
- The new `CONNECT` value is deliberately limited to direct Chi `Connect` and literal `net/http` `HandleFunc` method patterns. It does not imply semantic HTTP validation, host/wildcard pattern support, or arbitrary user-defined method registration.

## [0.34.0] - 2026-07-30

### Added

- An executable first-party `net-http` capability for Go. Direct default-multiplexer `http.HandleFunc("/path", handler)` registrations now emit exact `ALL` route edges with `framework.net-http.default-serve-mux.handle-func.local-function` evidence.
- Same-function direct short-variable `mux := http.NewServeMux()` bindings and literal `mux.HandleFunc(...)` registrations, including the deliberate Go 1.22 `GET /path` / `POST /path` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS` / `TRACE` pattern subset. These emit exact `framework.net-http.serve-mux.handle-func.local-function` evidence.
- Reusable exact Go import-alias extraction for the supported framework packs, plus capability, unit, integration, dynamic/shadow/wrapper/rebinding, method-pattern, and persisted route-query coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.34.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive `net-http` capability and exact Go syntax edges reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v23`; the project resolver remains `project-resolver-v14` because the supported `net/http` forms are file-local. A pre-v0.34 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- `net/http` support accepts only one direct non-dot/non-blank `net/http` import, a direct unshadowed `http.HandleFunc` or same-function `:= http.NewServeMux()` receiver, plain literal slash paths or the documented literal Go 1.22 method-pattern subset, and one named package-level function handler. `http.Handle`, `ServeMux.Handle`, `DefaultServeMux` member calls, `var`/factory/wrapper bindings, inline/wrapped handlers, dynamic/escaped/host/wildcard patterns, `CONNECT`, member handlers, cross-file receiver flow, generic Go imports/calls/type resolution, Go module/package resolution, semantic type checking, and runtime behavior remain excluded.
- Gin remains the direct engine / literal same-function `RouterGroup` slice from v0.33. chi, Echo, Fiber, additional standard-library registration forms, and broader Go resolution remain future work.

## [0.33.0] - 2026-07-30

### Added

- Go `.go` discovery, persisted language filters, and a `@lezer/go` AST adapter. Valid Go files now retain conservative file and top-level function containment facts; malformed source fails closed to its file symbol.
- An executable first-party Gin framework capability for direct `gin.Default()` / `gin.New()` short-variable receivers, direct uppercase HTTP methods plus `Any`, and named package-level handlers. Every accepted registration emits an exact `routes` edge with `framework.gin.direct-engine.method.local-function` evidence.
- Same-function literal `RouterGroup` composition, including nested group prefixes. Direct `group.GET("/users", handler)` registrations now project exact paths such as `GET /api/v1/users` with `framework.gin.direct-group.method.local-function` evidence.
- Capability, discovery, source-search language-validation, unit, integration, dynamic/shadow/rebinding, literal-prefix, malformed-source, and exact route-query coverage, plus a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.33.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Go facts and Gin routes use existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v22`; the project resolver remains `project-resolver-v14` because this first Go slice emits only exact file-local syntax facts. A pre-v0.33 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Go-capable facts.

### Deliberate limits

- Gin support accepts only a direct non-dot/non-blank import of `github.com/gin-gonic/gin`, a direct same-function `:=` engine binding, one named handler argument, static slash-prefixed paths, and literal non-root/non-trailing `Group` prefixes. `var` engine declarations, `Handle`, `Match`, static-file helpers, inline/multiple/middleware handlers, dynamic or escaped paths, group middleware, member/chained receivers, factory/wrapper construction, cross-file receiver flow, methods, and runtime configuration are intentionally excluded.
- `net/http`, chi, Echo, Fiber, generic Go imports/calls/type resolution, Go module/package resolution, semantic type checking, and runtime framework behavior are not modeled in v0.33.

## [0.32.0] - 2026-07-30

### Added

- An executable first-party Flask framework capability for Python, with AST-proven direct application `@app.get` / `post` / `put` / `patch` / `delete` routes and direct `@app.route("/...", methods=[...])` or tuple-method registrations. Literal unique uppercase methods emit independent exact route nodes and `framework.flask.direct-app.decorator.local-function` syntax evidence.
- Same-file literal Flask Blueprint composition: a direct `Blueprint(...)` binding with an optional literal `url_prefix`, direct top-level decorated local handlers, and a later direct `app.register_blueprint(blueprint, url_prefix="/...")` now project exact paths such as `GET /api/catalog/items` with `framework.flask.direct-blueprint.register-blueprint.decorator.local-function` evidence.
- Capability, unit, integration, route-query, alias, prefix-composition, dynamic-method/prefix, factory, and rebinding coverage, plus a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.32.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Flask routes use the existing graph edge and route query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v21`; the project resolver remains `project-resolver-v14` because this Flask slice emits only direct same-file syntax evidence. A pre-v0.32 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Flask-capable facts.

### Deliberate limits

- Cross-file Blueprints, `add_url_rule`, nested/factory Blueprints, custom route wrappers, dynamic methods or endpoints, star/keyword expansion, member receivers, runtime route configuration, middleware, and Flask request lifecycle behavior are intentionally excluded.
- Django, Starlette, generic Python import/export/call resolution, Python type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.32.

## [0.31.0] - 2026-07-30

### Added

- Exact cross-file FastAPI `APIRouter` projection for one direct package-relative import: `from .routers.catalog import router [as local_router]`, followed by a direct literal `app.include_router(local_router, prefix="/...")`, now projects literal decorated routes from the router module into first-class route nodes such as `GET /api/catalog/health`.
- Additive persisted `fastApiRouterFacts` record final direct router declarations, their literal local-handler decorators, and direct relative inclusion facts independently from ordinary Python import/call resolution. A regular-package boundary is proven with `__init__.py` markers for the importing directory and each traversed child package.
- Exact `framework.fastapi.imported-router.include-router.decorator.local-function` module evidence, including the mounting and declaration file path. Unit, integration, persistence, and unsafe-boundary coverage verify aliases and reject absent package markers, parent-relative imports, import lists, dynamic/rebound shapes, and ambiguous module targets.
- A Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.31.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive `fastApiRouterFacts` payload keeps prior generations readable while new generations retain auditable Python router-composition evidence.
- The artifact extractor advances to `multi-language-ast-v20` and the project resolver to `project-resolver-v14`. A pre-v0.31 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes cross-file FastAPI router facts.

### Deliberate limits

- The supported Python module surface is intentionally narrow: only a single-leading-dot, one-name relative import in a regular package is projected. Parent-relative/namespace/package-only imports, wildcard or multi-name imports, re-export chains, module members, nested routers, router aliases by assignment, factories/wrappers, and generic Python import/export/call resolution remain excluded.
- Flask, Django, Python type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.31.

## [0.30.0] - 2026-07-30

### Added

- AST-proven same-file FastAPI `APIRouter` route composition. A direct one-line named import from `fastapi` may include `FastAPI` and `APIRouter` together (including direct import aliases); direct top-level `APIRouter(...)` construction, literal router prefixes, direct top-level decorated functions, and direct `app.include_router(router, prefix="/...")` calls now produce first-class exact route nodes such as `GET /api/catalog/items`.
- Exact `framework.fastapi.direct-router.include-router.decorator.local-function` syntax evidence for the composed route-to-handler edge. Existing direct application decorator evidence remains unchanged, while dynamic prefixes, star/keyword expansion, possible rebinding, unmounted routers, and routes declared after their inclusion are rejected instead of guessed.
- Capability, unit, integration, persistence, and route-query coverage for direct same-file router composition, plus a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.30.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive behavior stays in the existing Python artifact-fact and graph payloads; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v19`; the project resolver remains `project-resolver-v13`. A pre-v0.30 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes APIRouter-capable facts.

### Deliberate limits

- This remains a narrow, file-local FastAPI proof. Cross-file/module-member routers, nested routers, assignment aliases, factory wrappers, dynamic or escaped paths/prefixes, import-list continuations, and generic Python import/export/call resolution are intentionally excluded.
- Flask, Django, Python type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.30.

## [0.29.0] - 2026-07-30

### Added

- Python `.py` discovery and a `@lezer/python` AST adapter. Valid Python files now emit conservative file, class, function, method, and exact `contains` facts; malformed source fails closed to its file symbol.
- A first Python framework pack for direct same-file FastAPI routes. A direct `from fastapi import FastAPI` import (with an optional alias), direct top-level application assignment, literal-path HTTP decorator, and top-level `def`/`async def` handler emit an exact `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS`/`TRACE` route edge with `framework.fastapi.direct-app.decorator.local-function` syntax evidence.
- Python language filters through persisted source search, CLI, MCP, and Git source-path selection, plus extraction/persistence/incremental coverage and a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.29.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Python facts use the existing artifact-fact and graph payloads; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v18`; the project resolver remains `project-resolver-v13`. A pre-v0.29 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Python-capable facts.

### Deliberate limits

- This is a narrow, file-local FastAPI proof. `APIRouter`, `include_router`, cross-file Python imports, mixed import lists, factory composition, dynamic/multiline/escaped paths, and non-direct/rebound application shapes are intentionally excluded.
- Generic Python import/export/call resolution, type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.29.

## [0.28.0] - 2026-07-30

### Added

- AST-proven React Router `createRoutesFromElements(...)` extraction for TypeScript/TSX and JavaScript/JSX. A direct non-type-only named import from `react-router` or `react-router-dom` (including an alias), one direct non-optional factory call, and exactly one direct JSX `Route` or JSX fragment argument now project first-class `NAVIGATE` routes.
- Factory-backed literal JSX trees reuse the established direct-child/fragment, relative-child, index-route, and pathless-layout composition rules. Every emitted page handler carries additive `routeRegistration: "react-router-create-routes-from-elements"` provenance and distinct `framework.react-router.create-routes-from-elements.*` evidence through the existing route, caller, impact, context, CLI, MCP, and retained-fact surfaces.
- Exact extraction, cross-file resolver, persisted-fact, caller, and incremental-reuse coverage for factory-specific route evidence, plus a standalone Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.28.0.md`.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing route symbols and facts remain readable; the new factory registration is an additive value in the existing optional `routeRegistration` contract.
- The artifact extractor advances to `typescript-ast-v17` and the project resolver to `project-resolver-v13`. A pre-v0.28 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes factory-specific facts and handler evidence.

### Deliberate limits

- This pack proves only the direct imported factory/call/argument/tree form. Type-only or shadowed imports, optional calls, additional arguments, dynamic JSX values, JSX conditions or arbitrary wrapper descendants, spread or duplicate attributes, dynamic paths, absolute child paths, and `.` / `..` child segments do not receive factory provenance.
- Unsupported factory calls are not silently reclassified as factory-backed navigation. Existing generic JSX `Route` extraction remains independently available when its own direct syntax proof applies.

## [0.27.0] - 2026-07-30

### Added

- Recursive, AST-proven React Router JSX route trees. Direct literal child `Route` elements, including direct JSX fragments, now compose relative child paths, index routes, and pathless layouts from a slash-prefixed root route into first-class `NAVIGATE` symbols.
- Nested JSX output preserves the existing exact local, imported, re-exported, and unresolved page-handler evidence with distinct `framework.react-router.jsx-route.*` rule IDs. v6 `Component` / `element` handlers can participate in recursive composition; an existing v5 `component` route remains a direct standalone proof and never projects child routes.
- A standalone v0.27 comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.27.0.md`, following the versioned workspace-root report convention.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing route symbols and facts remain readable; recursive JSX routes use the established `NAVIGATE`, route-framework, and edge-evidence contracts.
- The artifact extractor advances to `typescript-ast-v16`. A pre-v0.27 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes recursive JSX facts. The project resolver remains `project-resolver-v12` because handler resolution is unchanged.

### Deliberate limits

- This pack supports only direct literal JSX route children and direct fragments. Conditional expressions, arbitrary wrapper descendants, `createRoutesFromElements`, `basename`, dynamic paths, absolute child paths, `.` / `..` child segments, spread attributes, duplicate attributes, and runtime router configuration are not inferred.
- A pathless layout supplies URL context to supported children but is not emitted as a public navigation route. An index route must have no path or substantive JSX children. The legacy v5 `component` form stays supported for direct routes only because it cannot prove v6 nested-route semantics.

## [0.26.0] - 2026-07-30

### Added

- Recursive, AST-proven React Router v6.4+ data-router trees. Direct literal `children` arrays now compose relative child paths, index routes, and pathless layout traversal from an eligible slash-prefixed root route into first-class `NAVIGATE` route symbols.
- Existing local, imported, re-exported, and unresolved page-handler resolution remains intact for every emitted nested route. Nested output keeps `routeRegistration: "react-router-data-router"` and its distinct `framework.react-router.data-router.*` evidence.
- A versioned workspace-root comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.26.0.md`, maintained outside the project checkout so it can compare the local SymbolLattice and CodeGraph checkouts side by side. Every later version creates its own `FEATURE_COMPARISON_vX.Y.Z.md` with verified capability, evidence, deliberate limits, and a plain-language assessment.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing route facts remain readable; nested routes use the existing `NAVIGATE`, route-framework, registration, and edge-evidence contracts.
- The artifact extractor advances to `typescript-ast-v15`. A pre-v0.26 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes recursive data-router facts. The project resolver remains `project-resolver-v12` because the existing handler-resolution semantics are unchanged.

### Deliberate limits

- This pack supports direct literal `children` arrays only. Dynamic child arrays, spreads, `lazy`, factory options or `basename`, nested JSX `Route` composition, route-array variables, absolute child paths, `.` / `..` child segments, and runtime router configuration are not inferred.
- A pathless layout can pass its parent's URL context to static children, but does not become a separate public navigation route itself. An index child must have no path or children; malformed children are excluded independently without removing a separately proven ancestor or sibling.

## [0.25.0] - 2026-07-30

### Added

- An executable first-party framework capability registry for Express, Fastify, NestJS, React Router, and Next.js. The AST extraction pipeline now selects registered passes by the parsed language, so framework coverage has one inspectable extension boundary rather than a documentation-only inventory.
- Syntax-proven Next.js Pages Router navigation from `pages/` and `src/pages/` files with a direct named default export. `index` files map to their containing path and dynamic path segments remain explicit route patterns such as `NAVIGATE /blog/[slug]`.
- Syntax-proven Next.js App Router navigation from `app/` and `src/app/` `page` files with a direct named default export. Conventional route groups are omitted from the URL, while ordinary local/import/re-export handler resolution produces `framework.nextjs.pages-router.*` or `framework.nextjs.app-router.*` evidence.
- Additive `routeFramework: "nextjs"` and `routeRegistration: "nextjs-pages-router" | "nextjs-app-router"` provenance, plus unit, resolution, persisted-fact, caller, and incremental-reuse coverage.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing raw artifact facts gain only additive route-framework and route-registration values; existing route symbols and evidence remain readable.
- The artifact extractor advances to `typescript-ast-v14` and the project resolver to `project-resolver-v12`. A pre-v0.25 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes capability and Next.js navigation evidence.

### Deliberate limits

- Next.js coverage is a static convention proof, not a runtime model. Pages API files, special Pages files, App Router `route` handlers, middleware, layouts, templates, loading/error/not-found files, anonymous/wrapped/HOC defaults, parallel routes, intercepting routes, and runtime configuration are excluded.
- App route groups are omitted only for conventional `(name)` segments. React Router nested/index/relative composition remains a later pack; this release does not widen the existing React Router data-router proof boundary.

## [0.24.0] - 2026-07-30

### Added

- AST-proven React Router v6.4+ data-router object routes for TypeScript/TSX and JavaScript/JSX. Direct non-type-only named `createBrowserRouter`, `createHashRouter`, and `createMemoryRouter` imports from `react-router` or `react-router-dom` (including aliases) now recognize a direct one-argument route array with slash-prefixed literal object paths and exactly one direct `Component: Page` or `element: <Page />` page handler.
- Additive `routeRegistration: "react-router-data-router"` fact provenance and `framework.react-router.data-router.*` terminal-handler evidence. Local, imported, re-exported, and unresolved page references retain the factory/object route shape through the existing route, caller, impact, context, CLI, and MCP views, while `NAVIGATE` remains an explicit client-navigation discriminator rather than an HTTP method.
- Exact type-only, lexical-shadow, factory-options, path, handler, spread, duplicate, computed-field, member-expression, and lazy-route rejection boundaries, plus persisted-fact and incremental-reuse coverage for a real data-router project.

### Compatibility

- No SQLite schema migration or new route-query command is required. The existing raw artifact-fact payload gains the additive optional `routeRegistration: "react-router-data-router"` value; existing route facts and evidence remain readable.
- The artifact extractor advances to `typescript-ast-v13` and the project resolver to `project-resolver-v11`. A pre-v0.24 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes data-router navigation evidence.

### Deliberate limits

- This pack scans only direct object entries in a literal first-argument route array. It does not compose `children`, derive index or relative paths, apply a `basename`/factory options object, infer lazy or runtime route modules, follow route-array variables/spreads, or interpret Next.js file-system routing. A direct `lazy` field is rejected because it can replace the rendered page at runtime.

## [0.23.0] - 2026-07-30

### Added

- AST-proven React Router JSX client-navigation routes for TypeScript/TSX and JavaScript/JSX. A direct non-type-only named `Route` import from `react-router` or `react-router-dom` now recognizes literal slash-prefixed `path` attributes paired with exactly one direct v5 `component`, v6 `Component`, or v6 `element={<Page />}` page reference.
- Explicit `NAVIGATE` route discriminator for client-side navigation. React Router records become first-class route symbols such as `NAVIGATE /settings`, retain ordinary `routes` edges to local, imported, re-exported, or unresolved page components, and remain queryable through the existing CLI, service, and MCP route views without being mislabeled as HTTP `GET` requests.
- Framework-specific `framework.react-router.jsx-route.*` evidence, including exact lexical/module/re-export provenance and unresolved component evidence. Route/import binding checks reject type-only, shadowed, spread, duplicate, member-expression, or runtime-shaped JSX registrations before they reach graph resolution.

### Compatibility

- No SQLite schema migration or new route-query command is required. `NAVIGATE` is an additive route-method value and `react-router` is an additive optional `routeFramework` provenance value in the existing raw artifact-fact payload; existing HTTP routes and persisted facts remain readable.
- The artifact extractor advances to `typescript-ast-v12` and the project resolver to `project-resolver-v10`. A pre-v0.23 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes React Router navigation evidence.

### Deliberate limits

- This pack supports JSX `<Route>` elements only. It excludes direct data-router route-object arrays passed to `createBrowserRouter`, `createHashRouter`, and similar APIs, plus lazy/wrapped/inline or member-expression page handlers, spreads, dynamic paths, nested-path composition, runtime router configuration, and Next.js file-system conventions. The `NAVIGATE` discriminator intentionally represents browser navigation rather than an HTTP method.

## [0.22.0] - 2026-07-30

### Added

- AST-proven cross-file Fastify plugin-prefix composition for TypeScript and JavaScript. A direct `app.register(importedPlugin, { prefix: "/..." })` root registration now resolves one value-space ESM import or re-export surface to an exported function or variable callback, projects literal source-plugin routes, and preserves the route declaration file.
- Nested source-plugin composition. An exported plugin can directly `register(childPlugin, { prefix: "/..." })` through an exact local, imported, or re-exported identifier; literal prefixes compose into ordinary route nodes such as `GET /api/users` and `TRACE /api/v1/jobs`. A repeated plugin in one active ancestry is not expanded again, keeping cyclic source registrations finite and deterministic.
- Additive `fastifyPluginFacts` raw artifact facts for source-plugin routes, child registrations, and imported root registrations, plus `routeRegistration: "fastify-imported-plugin-prefix"` and `framework.fastify.imported-plugin-prefix.*` terminal-handler evidence. Exact local, imported, re-exported, and unresolved handlers retain that provenance through the existing route/caller/impact/query surfaces.

### Compatibility

- No SQLite schema migration or new CLI/MCP command is required. The existing artifact-fact JSON stores the additive optional `fastifyPluginFacts` and imported-plugin route-registration provenance; old facts remain readable and retain their former evidence rules.
- The artifact extractor advances to `typescript-ast-v11` and the project resolver to `project-resolver-v9`. A pre-v0.22 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes cross-file Fastify plugin evidence.

### Deliberate limits

- Cross-file composition accepts only direct identifiers, exact value-space ESM import/re-export surfaces, direct function declarations or immutable direct function/arrow `const` callbacks, exactly two-argument `register` calls, and static slash-prefixed non-root/non-trailing prefix objects. It excludes CommonJS, namespace/member access, assignment aliases, type-only or ambiguous exports, mutable/wrapped (`fastify-plugin`) callbacks, computed/spread/duplicate registrations, and dynamic prefixes.
- Root routes inside any prefixed plugin remain excluded because Fastify `prefixTrailingSlash` can produce different concrete runtime paths. Hooks, schemas, custom methods, inline/member handlers, runtime route options, and runtime composition remain outside the static proof surface.

## [0.21.0] - 2026-07-30

### Added

- AST-proven same-file Fastify named-plugin prefix composition for TypeScript and JavaScript. A direct `register(plugin, { prefix: "/..." })` call can now establish a scoped Fastify receiver when `plugin` resolves lexically to either a direct non-generator function declaration with no direct rebinding or an immutable `const` initialized by a direct function/arrow expression.
- Nested static composition across those named local callbacks and existing direct inline callbacks. A local `api` plugin that registers a local `v1` plugin produces ordinary first-class paths such as `GET /api/users` and `TRACE /api/v1/jobs`, with the same bounded read-only route graph surface as v0.20.
- Additive `routeRegistration: "fastify-local-plugin-prefix"` raw-fact provenance and `framework.fastify.local-plugin-prefix.*` handler evidence. Local, imported, re-exported, and unresolved terminal handlers retain the local-plugin prefix proof through project resolution.

### Compatibility

- No SQLite schema migration or new CLI/MCP command is required. The existing raw artifact-fact JSON gains one optional route-registration value; pre-v0.21 facts remain readable and retain their existing rule IDs.
- The artifact extractor advances to `typescript-ast-v10` and the project resolver to `project-resolver-v8`. A pre-v0.21 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes named-plugin route evidence.

### Deliberate limits

- A local plugin must be in the same file and passed as the direct first argument of a direct `register` call. Accepted local definitions are direct function declarations with no direct rebinding, or direct function/arrow initializers of immutable `const` bindings. The callback still needs an identifier first receiver parameter with no lexical reassignment and the registration still needs exactly two arguments plus a literal slash-prefixed, non-root, non-trailing `prefix` object.
- To avoid choosing one incomplete path surface, a local callback is excluded when its exact lexical binding is passed to more than one direct `.register(...)` call anywhere in the same source file. Imported/re-exported/aliased/wrapped (`fastify-plugin`), mutable, member, dynamic, computed, spread, duplicate, or otherwise ambiguous plugin registrations remain outside this release. Prefixed-plugin root routes remain excluded because `prefixTrailingSlash` can change Fastify's concrete runtime paths.

## [0.20.0] - 2026-07-30

### Added

- AST-proven Fastify inline-plugin prefix composition for TypeScript and JavaScript. A direct inline function or arrow callback passed to a direct `server.register(callback, { prefix: "/..." })` call now establishes a scoped Fastify receiver, so its shorthand and full-object routes become first-class paths such as `GET /api/users`.
- Nested direct inline registrations compose their literal non-trailing prefixes before route extraction. `app.register(api => api.register(v1 => v1.route(...), { prefix: "/v1" }), { prefix: "/api" })` produces the same bounded read-only route graph surface as an ordinary Fastify route, including `TRACE` and multi-method full objects.
- Additive `routeRegistration: "fastify-inline-plugin-prefix"` raw-fact provenance and `framework.fastify.inline-plugin-prefix.*` handler evidence. Local, imported, re-exported, and unresolved handlers retain the route's plugin-prefix proof instead of being reported as an unqualified registration.

### Compatibility

- No SQLite schema migration or new CLI/MCP command is required. The existing raw artifact-fact JSON gains one optional route-registration field; existing Fastify and Express facts remain readable and retain their prior evidence rules.
- The artifact extractor advances to `typescript-ast-v9` and the project resolver to `project-resolver-v7`. A pre-v0.20 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes inline-plugin route evidence.

### Deliberate limits

- Prefix composition accepts only a direct, non-optional `register` call on a proven Fastify receiver, with a direct non-generator inline callback, an identifier first parameter that is not reassigned in its lexical body, exactly two arguments, and a direct object-literal slash-prefixed non-root/non-trailing `prefix`. Named, imported, re-exported, wrapped (`fastify-plugin`), mutable, aliased, dynamic, computed, spread, duplicate, or otherwise ambiguous plugin registrations remain outside this release.
- Root routes inside prefixed plugins remain excluded because Fastify's runtime `prefixTrailingSlash` setting can register different concrete path surfaces. Direct root routes without a plugin prefix remain supported by the v0.19 pack.

## [0.19.0] - 2026-07-30

### Added

- AST-proven Fastify HTTP routes for TypeScript and JavaScript. A direct non-type-only default import from `fastify`, a lexical unshadowed immutable `const server = Fastify(...)` receiver, a literal slash-prefixed path, and a direct identifier handler now create first-class `route` symbols and `routes` edges.
- Fastify shorthand registrations for `get`, `head`, `trace`, `delete`, `options`, `patch`, `put`, `post`, and `all`, plus direct `server.route({ method, url | path, handler })` objects. Full objects accept one uppercase method or a nonempty duplicate-free static method array, with either explicit `handler: name` or `{ handler }` shorthand; `url` and its documented `path` alias remain mutually exclusive.
- Framework-specific pending-route provenance and `framework.fastify.static-route.*` resolver evidence for local, imported, re-exported, and unresolved handlers. Fastify routes reuse the existing bounded read-only `routes` CLI, service, and MCP views; `TRACE` is now an accepted route filter across those views.

### Compatibility

- No SQLite schema migration is required. The additive optional `routeFramework` field lives in existing raw artifact-fact storage, while existing Express facts without it retain their `framework.express.literal-route.*` evidence on resolution.
- The artifact extractor advances to `typescript-ast-v8` and the project resolver advances to `project-resolver-v6`. A pre-v0.19 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Fastify route evidence. Route handlers now require value-space lexical/import/re-export proof, so a type-only import or re-export is never promoted into a runtime handler edge.

### Deliberate limits

- This is a static Fastify route surface, not runtime framework execution. It excludes CommonJS, namespace/named-default factories, mutable or aliased receivers, `register(..., { prefix })` composition, hooks, schema interpretation, custom methods, dynamic method/path/handler values, inline or member handlers, and nonliteral paths or methods. A shorthand options slot can be present but is not interpreted.
- A Fastify full-route object must be a direct object literal with direct `method`, exactly one of `url` or `path`, and a direct identifier `handler`. Computed, spread, duplicate, conflicting, dynamic, or ambiguous shapes are intentionally not promoted into graph facts.

## [0.18.0] - 2026-07-30

### Added

- AST-proven NestJS non-HTTP entrypoints for TypeScript and JavaScript. Direct non-type-only named imports (including aliases) now recognize GraphQL `@Resolver` plus `@Query` / `@Mutation` / `@Subscription`, microservice `@Controller` plus `@MessagePattern` / `@EventPattern`, and `@WebSocketGateway` plus `@SubscribeMessage`.
- First-class `entrypoint` graph symbols and exact `handles` edges. They retain transport (`graphql`, `microservice`, or `websocket`), operation, and literal operation name/pattern/namespace-qualified event without pretending that non-HTTP dispatch is an HTTP route. The edges participate in callers, callees, impact, context, exploration, node retrieval, and edge explanation.
- Bounded read-only `entrypoints [path]` CLI command, `SymbolLatticeService.entrypoints`, and capability-gated `symbol_lattice_entrypoints` MCP tool. They expose transport, operation, and exact name-prefix filters with live freshness and explicit truncation while never initializing, indexing, or synchronizing a project.
- Static GraphQL name derivation from a handler name, direct schema-first literal name, or static `{ name: "..." }` option; recursive static JSON-compatible microservice object patterns with canonicalized keys; and static WebSocket gateway namespace composition.

### Compatibility

- No SQLite schema migration is required. Existing graph, artifact-fact, edge, and retained-snapshot storage persist the additive symbols and edges; existing generations remain readable.
- The artifact extractor advances to `typescript-ast-v7`. A pre-v0.18 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes entrypoint evidence. The project resolver remains `project-resolver-v5` because these edges are exact file-local syntax evidence.
- The `entrypoints` MCP tool is additive and capability-gated, so explore-only or route-only embedded services retain their existing tool lists.

### Deliberate limits

- SymbolLattice does not execute Nest, build a GraphQL schema, connect to a broker, inspect WebSocket runtime adapters, or infer a runtime transport. It recognizes only direct AST bindings and decorated instance methods with a body.
- Namespace imports, local decorator barrels, custom/composed decorators, type-only/foreign/shadowed imports, dynamic or conflicting GraphQL names, dynamic/prototype-setter microservice patterns, dynamic gateway namespace/event configuration, GraphQL field resolvers, and runtime guards/adapters remain outside the proof surface.

## [0.17.0] - 2026-07-30

### Added

- AST-proven NestJS `RouterModule.register([...])` module-prefix composition for TypeScript and JavaScript. A direct named `RouterModule` import from `@nestjs/core`, a direct named `@Module` import from `@nestjs/common`, literal route-object paths, and direct module identifiers now project controller-local HTTP routes through statically registered prefixes.
- Recursive `children` route trees, import aliases, and exact local/import/re-export class bindings. A route under `{ path: "admin", module: AdminModule, children: [{ path: "catalog", module: CatsModule }] }` becomes `/admin/catalog/...` when the controller is statically registered in `CatsModule`.
- Persisted syntax facts for route-to-controller, module-to-controller, and RouterModule-prefix relationships. The project resolver derives a full route symbol and an exact `routes` edge with `framework.nestjs.router-module.exact-prefix` module evidence; the existing CLI, MCP, callers, callees, context, and route views receive the projected route without a new public command.

### Compatibility

- No SQLite schema migration or public query contract change is required. The existing raw artifact-fact JSON payload carries the additive RouterModule facts, and existing generations remain readable.
- The artifact extractor advances to `typescript-ast-v6` and the project resolver advances to `project-resolver-v5`. A pre-v0.17 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes complete Nest module-prefix evidence.

### Deliberate limits

- This supports only direct `RouterModule.register([...])` expressions in a direct `@Module({ imports: [...] })` array. `forRoot` / `forChild`, variables, factories, CommonJS, local decorator barrels, namespace calls, custom wrappers, computed/spread/duplicate route-object properties, nonliteral paths, non-identifier modules, and dynamic children are deliberately excluded.
- A controller-local route is retained when its module prefix is missing, dynamic, ambiguous, or otherwise unproven. SymbolLattice adds no guessed global prefix, versioning, runtime adapter, guard, GraphQL, microservice, WebSocket, or SSE behavior.

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

[Unreleased]: https://github.com/HsinPu/symbol-lattice/compare/v0.156.0...HEAD
[0.156.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.155.0...v0.156.0
[0.155.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.154.0...v0.155.0
[0.154.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.153.0...v0.154.0
[0.153.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.152.0...v0.153.0
[0.152.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.151.0...v0.152.0
[0.151.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.150.0...v0.151.0
[0.150.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.149.0...v0.150.0
[0.149.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.148.0...v0.149.0
[0.148.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.147.0...v0.148.0
[0.147.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.146.0...v0.147.0
[0.146.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.145.0...v0.146.0
[0.145.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.144.0...v0.145.0
[0.144.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.143.0...v0.144.0
[0.143.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.142.0...v0.143.0
[0.142.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.141.0...v0.142.0
[0.141.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.140.0...v0.141.0
[0.140.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.139.0...v0.140.0
[0.139.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.138.0...v0.139.0
[0.138.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.137.0...v0.138.0
[0.137.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.136.0...v0.137.0
[0.136.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.135.0...v0.136.0
[0.135.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.134.0...v0.135.0
[0.134.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.133.0...v0.134.0
[0.133.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.132.0...v0.133.0
[0.132.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.131.0...v0.132.0
[0.131.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.130.0...v0.131.0
[0.130.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.129.0...v0.130.0
[0.129.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.128.0...v0.129.0
[0.128.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.127.0...v0.128.0
[0.127.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.126.0...v0.127.0
[0.126.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.125.0...v0.126.0
[0.123.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.122.0...v0.123.0
[0.122.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.121.0...v0.122.0
[0.121.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.120.0...v0.121.0
[0.35.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.34.0...v0.35.0
[0.34.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.33.0...v0.34.0
[0.33.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.32.0...v0.33.0
[0.32.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.31.0...v0.32.0
[0.31.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.30.0...v0.31.0
[0.30.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.29.0...v0.30.0
[0.29.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.28.0...v0.29.0
[0.28.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.27.0...v0.28.0
[0.27.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.26.0...v0.27.0
[0.26.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.25.0...v0.26.0
[0.25.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.16.0...v0.17.0
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
