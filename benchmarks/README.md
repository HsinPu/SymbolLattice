# Benchmark and evidence tooling

These tools generate or validate large-project evidence outside the published npm package. They may require fixed external corpora, built `dist/` files, disposable indexed copies, language runtimes, or explicit output paths.

`automatic` means focused tests import the module and verify its bounded truth, scoring, lifecycle, or negative-matrix contract. It does not mean CI downloads or scans the external corpus. `manual` means the tool is retained for explicit evidence generation and has no direct automated test entry.

| Area | Files | Status |
| --- | --- | --- |
| `css/` | `correctness-oracle.mjs`, `lifecycle.mjs` | automatic |
| `html/` | `correctness-oracle.mjs` | automatic |
| `java/` | `correctness-oracle.mjs`, `JavaOracle.java` | automatic helper contract |
| `languages/` | `depth-matrix.mjs` | manual |
| `java/` | `lifecycle.mjs` | manual |
| `groovy/` | `correctness-oracle.mjs`, `GroovyOracle.groovy` | manual compiler oracle |
| `javascript/` | `correctness-oracle.mjs` | automatic |
| `javascript/` | `named-function-expressions.mjs` | automatic declaration/scorer contract; manual pinned-corpus execution |
| `javascript/` | `assigned-callables.mjs` | automatic anonymous-assignment/ownership scorer contract; manual pinned-corpus execution |
| `javascript/` | `commonjs-call-evidence.mjs`, `fastify-commonjs-truth.json` | automatic source-receipt verifier contract; manual pinned-corpus execution |
| `javascript/` | `commonjs-property-evidence.mjs`, `fastify-commonjs-property-truth.json` | manual pinned-corpus Espree source-receipt audit |
| `python/` | `correctness-oracle.mjs`, `PythonOracle.py` | manual CPython stdlib AST oracle |
| `python/` | `module-bindings.mjs`, `ModuleBindingOracle.py` | manual CPython AST declaration/source-range audit; optional baseline fact comparison |
| `python/` | `member-calls.mjs`, `MemberCallOracle.py` | manual CPython AST unresolved member-call name, ownership and source-range audit; required baseline fact preservation check |
| `sfc/` | `correctness-oracle.mjs` | manual Vue/Svelte/Astro component relation oracle |
| `shell/` | `correctness-oracle.mjs` | manual mvdan ABI v2 direct-call oracle |
| `solidity/` | `correctness-oracle.mjs` | automatic solc AST private fixed-arity call oracle |
| `vbnet/` | `correctness-oracle.mjs`, `VbOracle.cs` | automatic scorer with manual Roslyn compiler oracle |
| `fortran/` | `correctness-oracle.mjs`, `FortranOracle.py` | automatic scorer with manual fparser project-call oracle |
| `jsp/` | `correctness-oracle.mjs` | automatic |
| `julia/` | `correctness-oracle.mjs`, `negative-matrix.mjs` | automatic |
| `julia/` | `lifecycle.mjs` | manual |
| `luau/` | `correctness-oracle.mjs`, `lifecycle.mjs`, `negative-matrix.mjs` | automatic |
| `luau/` | `approved-subset.mjs` | manual |
| `lua/` | `correctness-oracle.mjs` | manual tree-sitter worker call oracle |
| `perl/` | `correctness-oracle.mjs`, `negative-matrix.mjs` | automatic |
| `perl/` | `lifecycle.mjs` | manual |
| `r/` | `correctness-oracle.mjs`, `negative-matrix.mjs` | automatic |
| `r/` | `lifecycle.mjs` | manual |
| `mcp/` | `read-query-concurrency.mjs` | manual |
| `mcp/` | `strict-fresh-read-lifecycle.mjs` | manual |
| `mcp/` | `task-retrieval.mjs`, `nest-retrieval-tasks.json`, `nest-source-tasks.json`, `nest-shutdown-tasks.json`, `fastify-retrieval-tasks.json`, `fastify-plugin-tasks.json`, `fastify-error-tasks.json`, `fastify-serializer-tasks.json`, `fastify-cookie-tasks.json`, `fastify-stream-error-tasks.json`, `fastify-serialization-hook-error-tasks.json`, `fastify-header-write-error-tasks.json`, `fastify-outgoing-hook-error-tasks.json`, `fastify-unhinted-content-type-tasks.json` | automatic scorer/source verifier contracts; manual pinned-corpus execution |
| `filesystem/` | `operation-diagnostics-latency.mjs` | manual |

Always pass disposable workspaces and explicit output paths. Never write external corpora, `.SymbolLattice` indexes, generated JSON evidence, npm caches, or packed installations inside `benchmarks/`.

## v0.528.12 exclude document heading containment from connection scores

The query planner no longer counts a document resource's `contains` edge as corroborating graph connection evidence. Code-symbol containment still contributes to locating an owning declaration. This patch changes ranking only; it does not alter the indexed graph, graph evidence, or query parameters. The plan policy is `explore-query-plan-v26` so clients can identify the changed ranking rule.

On pinned [Fastify](https://github.com/fastify/fastify) `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, the plugin-dependency rejection task previously selected two TypeScript documentation headings supported only by structural heading links. The candidate instead selected `lib/errors.js`, which the task manifest already lists as supporting context, while preserving all three independently specified source facts in `lib/pluginUtils.js` and `lib/pluginOverride.js`. Across the 19 unchanged manifests on that Fastify commit, [NestJS](https://github.com/nestjs/nest) `35c3ded6dbf3f23f917ae88d0ed966932788cae6`, and [Django](https://github.com/django/django) `bc833e8883db4a333a6485d91637b78c85e2b13b`, this was the only selected-file change among 26 tasks. Both builds found 43/43 required file occurrences and 108/108 specified source facts. The candidate source verifier checked 299 excerpts, 509 lexical receipts, and six exact property-use edges. Unjudged returned file occurrences fell from 40 to 39; these are not counted as false positives, and this sample does not establish repository-wide precision.

Thirty persistent MCP requests for the Fastify plugin task with pool size one and source-session deduplication disabled measured mean latency 735.414 → 735.439 ms and p50 722.314 → 723.139 ms. This does not demonstrate a speedup. The pinned task reports used one fresh CLI process per task, which is insufficient for a stable CLI latency claim. First indexing, incremental sync, memory peaks, and an Agent's total task time or query count were not measured. `npm run check`, `npm run build`, the two focused test files (462 tests), and the full `npm test -- --maxWorkers 2` passed (3,217 tests passed, four existing skips). Reproduce the retrieval check with `node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-checkout> --manifest benchmarks/mcp/<manifest>.json --output <external-report.json> --repetitions 1`; baseline and candidate reports are under `%TEMP%/SymbolLattice-evidence-054500-tasks/` and `%TEMP%/SymbolLattice-evidence-055000-tasks/`.

## v0.528.11 defer non-query module loading

The CLI now loads the MCP server module only when `serve --mcp` starts, and the source catalog loads the TypeScript project module resolver only when a project scan needs it. Ordinary read commands still perform the same strict freshness check, graph query, and source delivery. This is a patch-level startup improvement with no query or index contract change; it moves the two module loads to the commands that actually use them.

Three fresh processes for a pinned Fastify HTTP 431 query measured CLI module loading at about 1,134 → 345 ms and total in-process command time at about 2,353 → 1,541 ms, with the same 282,922-byte response. The 19 fixed task manifests on pinned [Fastify](https://github.com/fastify/fastify) `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, [NestJS](https://github.com/nestjs/nest) `35c3ded6dbf3f23f917ae88d0ed966932788cae6`, and [Django](https://github.com/django/django) `bc833e8883db4a333a6485d91637b78c85e2b13b` cover 26 tasks. Alternating baseline and candidate runs used three fresh CLI processes per task against unchanged indexes. All 26 complete query JSON responses were identical, retaining 43/43 required file occurrences and 108/108 specified source facts. The source verifier checked 299 excerpts, 505 lexical receipts, and six exact property-use edges; 40 returned file occurrences remain unjudged. All 26 candidate task medians were lower; the median per-task difference was −829 ms (range −925 to −731 ms). These samples support faster fresh CLI queries on the tested corpora, not a latency guarantee for other environments. First indexing, incremental sync latency, memory peaks, persistent MCP request latency, and an Agent's total task time or query count were not measured.

An actual `serve --mcp --no-auto-sync` stdio session connected and returned Fastify evidence; `npm run verify:mcp-worker-generation` confirmed a worker could read both the initial and a synced generation without fallback. `npm pack --dry-run` included both dynamically imported modules. `npm run check`, `npm run build`, four focused test files (192 tests), and the full `npm test -- --maxWorkers 2` passed (3,216 tests passed, four existing skips). Reproduce task retrieval with `node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-checkout> --manifest benchmarks/mcp/<manifest>.json --output <external-report.json> --repetitions 3`; baseline and candidate reports are under `%TEMP%/SymbolLattice-evidence-054400/baseline-*` and `%TEMP%/SymbolLattice-evidence-054400/candidate-*`.

## v0.528.10 skip retained graph edges before sorting

Bounded graph expansion now omits already retained exact edges from each later frontier's in-memory sort and traversal loop. It still reads the same indexed edge rows, preserves the same evidence hydration and relationship limits, and records whether a frontier had any edges so `traversedHops` remains unchanged even when every edge was previously retained. This is a patch-level query-cost improvement; the index format and external query contract are unchanged.

The 19 fixed manifests on pinned [Fastify](https://github.com/fastify/fastify) `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, [NestJS](https://github.com/nestjs/nest) `35c3ded6dbf3f23f917ae88d0ed966932788cae6`, and [Django](https://github.com/django/django) `bc833e8883db4a333a6485d91637b78c85e2b13b` cover 26 tasks. The candidate and an unchanged v0.528.9 build returned identical complete query JSON for all 26. Both retained 43/43 required file occurrences and 108/108 specified source facts; the verifier checked 299 excerpts, 505 lexical receipts, and six exact property-use edges. Another 40 returned file occurrences were unjudged, so this does not establish repository-wide precision.

Four alternating same-process bounded graph comparisons produced identical complete bundles. Their four-run medians in milliseconds were Fastify HTTP 431: 579 → 581, Fastify error status: 545 → 520, NestJS dependency injection: 1,054 → 1,042, and Django URL resolution: 1,387 → 1,328. With three sequential fresh CLI processes per task against existing indexes, the candidate's per-task median was lower in 20/26 tasks; the median difference was −36 ms (range −191 to +62 ms). These small samples do not guarantee a general speedup. First indexing, incremental sync, memory peaks, and an Agent's total task time or query count were not measured. Reproduce with `node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-checkout> --manifest benchmarks/mcp/<manifest>.json --output <external-report.json> --repetitions 3`. Candidate reports are under `%TEMP%/SymbolLattice-evidence-054300/candidate-*`; the same-period baseline reports are under `%TEMP%/SymbolLattice-evidence-054310/candidate-*`. `npm run check`, `npm run build`, the focused SQLite integration test (40 tests), and the full `npm test -- --maxWorkers 2` passed (3,216 tests passed, four existing skips).

## v0.528.9 query-scoped lexical token reuse

The bounded source scan now reuses a token's query-concept membership across files in one query, up to the existing 4,096-token cache limit. It still computes frequencies and first-occurrence receipts separately for every declaration and file; the scan bounds, graph traversal, index format, and external query contract are unchanged. This is a patch-level reduction of repeated normalization work, not a new retrieval capability.

The 19 fixed manifests on pinned [Fastify](https://github.com/fastify/fastify) `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, [NestJS](https://github.com/nestjs/nest) `35c3ded6dbf3f23f917ae88d0ed966932788cae6`, and [Django](https://github.com/django/django) `bc833e8883db4a333a6485d91637b78c85e2b13b` cover 26 tasks. Against the unchanged v0.528.8 build, all 26 complete query JSON responses were identical. The source verifier found all 43 required file occurrences and all 108 specified source facts, checked 299 excerpts, 505 lexical receipts, and six exact property-use edges. The 40 unjudged returned file occurrences are not counted as false positives, so this is not repository-wide precision evidence.

In an alternating same-process comparison, complete bounded graph bundles were identical for four sampled queries. Their four-run medians in milliseconds were Fastify HTTP 431: 583 → 589, Fastify error status: 544 → 532, NestJS dependency injection: 1,075 → 1,065, and Django URL resolution: 1,383 → 1,349. Three fresh CLI processes per task against the existing indexes were faster in 14/26 tasks, with a median per-task difference of −2.5 ms (range −183 to +105 ms). The samples do not establish a general end-to-end speedup. First indexing, incremental sync, memory peaks, and an Agent's total task time or query count were not measured. Reproduce the task check with `node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-checkout> --manifest benchmarks/mcp/<manifest>.json --output <external-report.json> --repetitions 3`. Baseline reports are under `%TEMP%/SymbolLattice-evidence-053800/final-*`; candidate reports are under `%TEMP%/SymbolLattice-evidence-054200/candidate-*`. `npm run check`, `npm run build`, the two focused test files (52 tests), and the full `npm test -- --maxWorkers 2` passed (3,216 tests passed, four existing skips).

## v0.528.8 precise numeric property evidence

In an action query about a numeric status, a broad variable container can duplicate every relevant source hit of one selected property while adding a large, mostly unrelated focus. The query planner now omits that container only when it spans at least 64 lines, the selected property spans at most 32 lines, all of the container's query terms and literal source matches are covered by that property, and the bounded graph has an exact `contains` edge whose range equals the property declaration. It does not backfill the vacated slot. The optional `numericContainerFiltering` receipt carries the omitted symbol, its source matches, and the exact containment edge so the reason and location can be checked; it does not claim the container has no other relationships. Explicit-file queries and cases without the exact edge retain the container.

On pinned [Fastify](https://github.com/fastify/fastify) `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, the HTTP 413 task previously selected the 484-line `lib/errors.js#codes` container ahead of its six-line `FST_ERR_CTP_BODY_TOO_LARGE` property. The property is now the first focus. The source verifier checked all three duplicated hits and the exact containment receipt at `lib/errors.js:105–110`. An independent Espree parse of that pinned source confirmed the property belongs to the `codes` object and passes `413` as the third `createError` argument; this checks syntax attribution, not runtime behavior. Required 413 evidence in `lib/errors.js` and `lib/contentTypeParser.js` remains present; the separate HTTP 431 task is unchanged. The 413 JSON response falls from 441,326 to 416,593 bytes, and its Markdown projection from 40,590 to 38,878 bytes. Its normal connection list loses the parent-to-property containment item because the parent is no longer a focus; that same exact edge remains in the filtering receipt.

The 19 unchanged manifests on that Fastify commit, [NestJS](https://github.com/nestjs/nest) `35c3ded6dbf3f23f917ae88d0ed966932788cae6`, and [Django](https://github.com/django/django) `bc833e8883db4a333a6485d91637b78c85e2b13b` cover 26 fixed tasks. Relative to v0.528.7 (`0205233`), all 55 required task-file occurrences and 108 specified source facts remain present; only the Fastify 413 focus, connection presentation, and source windows change. Another 40 returned task-file occurrences are unjudged, so these partial judgments do not establish repository-wide precision. Windows / Node v24.19.0 measurements used three sequential fresh CLI processes per task on existing indexes. Fifteen of 26 tasks had a lower median; the median per-task difference was −6 ms (range −85 to +126 ms). This is not evidence of a general query-speed improvement. First indexing, incremental sync, memory peaks, and an Agent's total task time or query count were not measured. Reproduce with `node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-checkout> --manifest benchmarks/mcp/<manifest>.json --output <external-report.json> --repetitions 3`. Baseline reports are under `%TEMP%/SymbolLattice-evidence-053400/final-*` and v0.528.8 reports under `%TEMP%/SymbolLattice-evidence-053800/final-*`. `npm run check`, `npm run build`, and the full `npm test -- --maxWorkers 2` passed (3,215 tests passed, four existing skips). This is a patch correction to relevance and output cost under the existing query and index contract.

## v0.528.7 numeric implementation focus order

For an action query about a numeric status, when the selected results already include a handwritten production focus with that number in its source, `explore` places that focus before a generic action-word match. It keeps the other selected focuses and records the numbered focus, its prior rank, and matched number in the optional `numericFocusPriority` receipt. Explicit file queries keep their requested order. This corrects evidence presentation within the existing query and index contract; it does not infer a missing relationship or guarantee that the first focus explains the whole runtime flow.

The 19 fixed manifests cover 26 tasks on indexed [Fastify](https://github.com/fastify/fastify) `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, [NestJS](https://github.com/nestjs/nest) `35c3ded6dbf3f23f917ae88d0ed966932788cae6`, and [Django](https://github.com/django/django) `bc833e8883db4a333a6485d91637b78c85e2b13b`. Relative to v0.528.6, all 55 required task-file occurrences and 108 specified source facts remain present. The verifier checked 300 excerpts, 506 lexical receipts, and six exact property-use edges. Only the Fastify HTTP 431 and 413 tasks changed selected order: the 431 handler in `fastify.js` precedes the generic `lib/handleRequest.js` focus; the `413` error definition in `lib/errors.js` precedes the generic server focus. Both retain their required source facts. Source-window order changes for those two tasks, and the 413 connection presentation changes. Another 40 returned task-file occurrences are outside the fixed relevance judgments; repository-wide precision and complete runtime-flow coverage were not measured.

Validation on Windows / Node v24.19.0 used three sequential fresh CLI processes per task against existing indexes, including startup, freshness checks, query work, and serialization. The candidate had a lower median process time on 18/26 tasks; the median of per-task differences was −49 ms (range −171 to +27 ms). Timings are small-sample diagnostics, not evidence of a general speedup or latency guarantee. First indexing, incremental sync, memory peaks, and an Agent's total task time or query count were not measured. Reproduce with `node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-checkout> --manifest benchmarks/mcp/<manifest>.json --output <external-report.json> --repetitions 3`. Baseline reports are in `%TEMP%/SymbolLattice-evidence-053200/release-*`; v0.528.7 reports are in `%TEMP%/SymbolLattice-evidence-053400/final-*`. `npm run check`, `npm run build`, and `npm test -- --maxWorkers 2` passed (3,213 tests passed, four existing skips). This is a patch because it corrects ranking under the existing external contract.

## v0.528.6 numeric execution evidence and bounded graph read

For natural-language questions that ask how code handles, sends, rejects, or responds with a numeric status, the query plan now omits selected Markdown documentation and TypeScript declaration files whose selected focuses lack that number **only when a numbered implementation focus is already present**. It does not fill the vacated slots with weaker candidates. Explicit file, documentation, type, and number-bearing documentation queries remain eligible. The optional `numericExecutionFiltering` receipt names the anchor, excluded files, focus counts, and the selected-focus evidence scope; omission is a relevance decision, not proof that a file has no relationship or lacks that number elsewhere. Bounded graph traversal now joins exact edges to both existing endpoint symbols in its indexed edge read instead of making a separate batched existence query per hop. It preserves edge ordering, node and relationship bounds, and generation-fenced evidence hydration; an integration case checks dangling endpoints.

Using the unchanged indexed checkouts of [Fastify](https://github.com/fastify/fastify) `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, [NestJS](https://github.com/nestjs/nest) `35c3ded6dbf3f23f917ae88d0ed966932788cae6`, and [Django](https://github.com/django/django) `bc833e8883db4a333a6485d91637b78c85e2b13b`, the 19 fixed manifests used for v0.528.5 covered 26 tasks. Both versions returned all 55 required task-file occurrences and all 108 required source facts. The v0.528.6 verifier checked 300 emitted excerpts, 506 literal lexical receipts, and six exact property-use edges, with no unverified property-use edge. The 25 tasks other than Fastify HTTP 431 retained identical focus symbols, connections, and source windows. For HTTP 431, `fastify.js` and its four required facts stayed present; `docs/Reference/TypeScript.md` and `types/reply.d.ts`, which had generic header/send matches but no 431 evidence in their selected focuses, were omitted. The selected files fell from four to two, and the JSON response from 343,310 to 282,682 bytes. Another 40 returned task-file occurrences remain outside the fixed relevance judgments, so overall precision is still unmeasured.

On Windows with Node v24.19.0, three fresh CLI processes per task included startup, freshness checks, query work, and serialization. Relative to v0.528.5, 21/26 tasks had a lower median process time; the median of per-task median differences was −75 ms (range −174 to +34 ms). The HTTP 431/413 manifest was rerun after the final receipt change and its saved report replaces the initial v0.528.6 run. These small samples do not establish a general latency guarantee. First indexing, incremental sync, memory peaks, and the time or number of queries an Agent needs to finish a task were not measured. Reproduce with `node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-checkout> --manifest benchmarks/mcp/<manifest>.json --output <external-report.json> --repetitions 3`. Baseline reports are under `%TEMP%/SymbolLattice-evidence-053100/freshness-*`; v0.528.6 reports are under `%TEMP%/SymbolLattice-evidence-053200/release-*`. This is a patch because it corrects relevance and reduces query cost within the existing search and index contracts.

## v0.528.5 bounded freshness concurrency

The project walker and full-content freshness fingerprint reader now admit at most 32 concurrent directory or source reads, up from eight. Directory traversal still loads parent ignore rules before visiting children, sorts its result paths, and drains an active batch before reporting unexpected errors. Freshness still discovers every eligible path and computes the same per-file SHA-256 identity; it does not rely on size or modification time. The freshness performance receipt reports the new 32-read maximum. This patch changes scheduling and diagnostic capacity, not the indexed generation or query evidence contract.

On the unchanged pinned Fastify, NestJS and Django checkouts and the 19 manifests used for v0.528.4, all 26 complete query JSON responses matched that version. Required-file coverage stayed 55/55 and required source facts 108/108; the verifier checked 304 source excerpts, 513 lexical receipts and six exact property-use edges, with no unverified property-use edge. Another 42 returned files remain unjudged, so overall precision is not measured. Three fresh CLI processes per task on Windows/Node v24.19.0 were faster in 18/26 tasks; the median of per-task median process-time differences was −22 ms (range −437 to +175 ms). An alternating same-process comparison isolated the status stage: the three-sample median was 1,172 → 1,012 ms for Django and 463 → 400 ms for NestJS; Fastify's 99 → 100 ms was effectively unchanged. These small samples do not establish a general latency guarantee, and first indexing, incremental sync, memory peaks and Agent completion time were not measured. Reproduce with `node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-checkout> --manifest benchmarks/mcp/<manifest>.json --output <external-report.json> --repetitions 3`. Candidate reports are under `%TEMP%/SymbolLattice-evidence-053100/freshness-*`; v0.528.4 reports are under `%TEMP%/SymbolLattice-evidence-053000/candidate-*`.

## v0.528.4 file-scoped seed read

The second bounded symbol read now orders only symbols in the already selected seed files. Previously, lexical matches from other files could occupy its SQL result limit even though those rows were discarded afterward; multi-concept queries also materialized the whole symbol table for this second read. The first, repository-wide candidate read and its concept-coverage ranking are unchanged. An integration case verifies that a requested file still contributes its symbol when an unrelated exact-name match would otherwise fill the candidate limit. This is a patch-level retrieval and query-cost correction within the existing output contract; the index format and scan limits are unchanged.

On the same pinned, indexed Fastify, NestJS and Django checkouts and 19 fixed manifests described below, 26 tasks retained 55/55 required files and 108/108 required source facts. The source verifier checked 304 emitted excerpts, 513 lexical receipts and six exact property-use edges; no property-use edge was unverified. The 26 tasks returned 42 files outside the fixed relevance judgments, so overall precision remains unmeasured. Compared with the v0.528.3 reports, all 26 tasks retained identical focus symbols, delivered source excerpts and connection edges. Seven complete responses changed in candidate-ranking or planning metadata; selected files stayed the same.

Three fresh CLI processes per task, run sequentially on Windows with Node v24.19.0 against unchanged indexed checkouts, were faster in 20/26 tasks. The median of per-task median process-time differences was −87 ms (range −957 to +78 ms). An additional alternating in-process comparison on two queries per corpus found lower seed-retrieval medians in all six sampled queries; this isolates the modified read more closely but is not a general latency guarantee. These comparisons do not measure first indexing, incremental sync, memory use or Agent completion time. Reproduce with `node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-checkout> --manifest benchmarks/mcp/<manifest>.json --output <external-report.json> --repetitions 3`. Candidate reports are under `%TEMP%/SymbolLattice-evidence-053000/candidate-*`; v0.528.3 baseline reports are under `%TEMP%/SymbolLattice-evidence-052902/final2-*`.

## v0.528.3 bounded exported-source evidence

Natural-language `explore` now scans short exported variable declarations (at most 12 lines) alongside callable bodies in the bounded active-generation source projection. Callables retain priority under the per-file symbol limit, and ambient `.d.ts`/`.d.cts`/`.d.mts` variables are excluded. Literal matches carry source ranges and an `exported-binding-source-term` reason; they do not establish runtime control flow. A source-backed production candidate can replace one selected file only when at least two query concepts have literal receipts within five lines, at least one is missing from the selected source, and the candidate clears the relative score floor. Its `uncovered-source-concept-v1` receipt reports the replaced file and term frequencies scoped to the bounded eligible candidates, not repository-wide rarity. The existing exact CommonJS property-reference followup can then bring in a production use with an independently checkable edge. The requested excerpt for a short exported binding spans its complete declaration, including a nearby status literal; delivery can still truncate under the unchanged overall source budget. `explore-query-plan-v22` retains the four-file and eight-symbol focus limits.

On the pinned Fastify development tasks from v0.528.2, the unhinted unsupported-content-type query improved from 0/2 required files and 0/5 source facts to 2/2 and 5/5. The related unknown-media-type query retained 2/2 files and improved from 4/5 to 5/5 facts. The first result includes `lib/handleRequest.js`, `lib/errors.js`, and `lib/contentTypeParser.js`; its parser followup cites one independently verified exact property-reference edge. Across the 24 unchanged fixed Fastify/NestJS/Django regression tasks, required-file hits remained 51/51 and required source facts 98/98. The verifier checked 304 delivered source excerpts, 513 lexical receipts and six exact property-reference followups across all 26 tasks, with no unverified property edge; counts can include repeated sites. These judgments are scoped to the fixed manifests, and overall precision is unmeasured because unjudged returned files are not false positives.

Each task/build used three fresh CLI processes on Windows and Node v24.19.0 against the same pinned indexed checkout, with no indexing during the comparison. Against v0.528.1, the median per-task process-time difference across the 24 prior tasks was approximately 0 ms (twelve faster; range −134 to +318 ms). The two new tasks differed by +45 ms and −20 ms from their v0.528.1 baseline. Process time includes startup, freshness checks, retrieval and serialization. These small samples show the evidence gain but do not establish a general speedup; first indexing, incremental sync, memory and Agent completion time were not measured. Reproduce with `benchmarks/mcp/task-retrieval.mjs`, the checked-in manifests and three repetitions. Raw final reports are under `%TEMP%/SymbolLattice-evidence-052902/final2-*`; baseline reports are under `%TEMP%/SymbolLattice-evidence-052900/release-*` and `%TEMP%/SymbolLattice-evidence-052901/unhinted-baseline.json`. The v0.528.1 and v0.528.3 build fingerprints were `1a76f3135c3bd1f536d7a93543f5fa900a31d83ef9f497f5a3869634766ba7bb` and `98201acd3a5d133a44bf91cb926e9aa714ac6593e4e5cf6db3ed5826380e344e`. Typecheck, build and the complete test suite pass: 3,208 tests passed and four existing tests were skipped.

## v0.528.2 unhinted content-type task truth

`mcp/fastify-unhinted-content-type-tasks.json` fixes two development queries on Fastify commit `70b14e92c0b55e8201f5530ba2e6bab4e928c784` without a symbol name, source path or HTTP status hint. The required parser rejection path in `lib/contentTypeParser.js` and the error definition in `lib/errors.js` were checked against the pinned source before future ranking changes. The truth covers the built-in no-parser branch, excluding the 404 fallback; it does not establish the external error factory's runtime behavior. File judgments are incomplete, so other returned files remain unjudged rather than false positives.

On the unchanged v0.528.1 implementation and indexed generation, three fresh CLI processes per task found 0/2 required files and 0/5 required source facts for “Where does Fastify reject a request with an unsupported content type?” The related “How is an unknown media type rejected?” query found 2/2 files and 4/5 facts; the `415` definition line was not returned. Median process times were 2,598 ms and 2,556 ms, respectively, including startup, freshness checks, retrieval and serialization. These are baseline measurements, not a speed improvement or a completed retrieval fix. Run `node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-fastify> --manifest benchmarks/mcp/fastify-unhinted-content-type-tasks.json --output <external-report.json> --repetitions 3` to reproduce the scoped checks. The raw baseline is under `%TEMP%/SymbolLattice-evidence-052901/unhinted-baseline.json`.

## v0.528.1 source-property-use followup

Natural-language `explore` now admits a bounded production-file use of a precisely selected CommonJS exported property. The planning rule requires an exact source-reference edge with matching import/export path receipts, an indexed handwritten production file, and a numeric or exact/qualified symbol anchor. It admits at most one additional file and two symbols, replacing the weakest eligible selected file when all four file slots are occupied. The selected focus records the anchor, source edge IDs, candidate-file count, and replaced file. The edge proves a source binding, not a runtime constructor or executable control-flow path; the unresolved `instantiates` edge remains unresolved. `explore-query-plan-v21` keeps the existing file and symbol limits and performs this check from the indexed graph without a live source read.

The pinned Fastify commit `70b14e92c0b55e8201f5530ba2e6bab4e928c784` and 13 fixed task judgments were unchanged from v0.528.0. On Windows and Node v24.19.0, three fresh CLI processes per task returned 29/29 required files and 57/57 required source facts, up from 27/29 and 49/57 on the same indexed generation. HTTP 413 and 415 now each select `lib/contentTypeParser.js` and return all previously missing parser facts. The other eleven tasks retained their required files and facts. The new benchmark receipt check verified the three emitted property-use followups and all three cited exact edges without an unverified connection. The independent Espree oracle from v0.528.0 again checked all 88 indexed CommonJS property-reference receipts against pinned source. The median of per-task process-time differences was −15 ms (eight faster; range −87 to +33 ms); HTTP 413 differed by −15 ms and HTTP 415 by +29 ms while returning the additional implementation evidence. Process time includes startup, freshness checks, query, and JSON serialization. These small samples do not prove a general speedup or measure an Agent's total follow-up time. Overall precision remains unmeasured because unjudged returned files are not false positives. All 13 comparisons used identical manifest hashes and Fastify index generation; the v0.528.1 build fingerprint was `1a76f3135c3bd1f536d7a93543f5fa900a31d83ef9f497f5a3869634766ba7bb`.

The fixed NestJS and Django truth also retained all 13/13 and 9/9 required files, and 21/21 and 20/20 source facts, respectively, after their pinned checkouts were synchronized to the current extractor version. Their previous timing reports used an older indexed generation, so those timings are not a paired speed comparison. A separate natural-language Fastify query about an unsupported content type without its error code still omitted the parser, showing that this followup does not solve every exploration query. Reproduce the fixed tasks with `benchmarks/mcp/task-retrieval.mjs`, the checked-in Fastify/NestJS/Django manifests, three repetitions, and explicit outputs outside the repository. Raw final reports are under `%TEMP%/SymbolLattice-evidence-052900/release-*`.

## v0.528.0 CommonJS object-property references

For strict CommonJS JavaScript, a named `const` object assigned once to `module.exports` now contributes source-located property declarations. A `const` destructured relative `require` used as a `new` callee can gain an exact cross-file `references` edge to the property declaration when the export and observed module-object uses pass the conservative static checks. The original `instantiates` edge remains unresolved because the exported property's runtime constructor value is not established. Dynamic or mutated exports and cyclic imports remain outside this rule. These source-only references do not gain execution-path ranking weight and come after executable relations in bounded caller/callee contexts. This adds index symbols and edges; it does not change the CLI or MCP response contract.

On the pinned Fastify commit `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, `javascript/commonjs-property-evidence.mjs` uses independent Espree AST/source ranges to audit every emitted property-reference receipt, and `javascript/fastify-commonjs-property-truth.json` fixes three known parser uses before scoring. The audit found all three required references and verified 88 emitted source receipts across 19 files. It does not independently establish runtime constructor identity, whole-program mutation safety, or corpus-wide precision. Run the audit with `node benchmarks/javascript/commonjs-property-evidence.mjs --project <pinned-fastify-checkout> --manifest benchmarks/javascript/fastify-commonjs-property-truth.json --output <external-report.json>` after building and indexing that checkout.

The 13 fixed Fastify retrieval tasks were compared with the v0.527.4 reports under Windows and Node v24.19.0. Each task used three fresh CLI processes; median process time includes startup, freshness check, query and serialization. Required-file hits remained 27/29, and required source facts remained 49/57. The HTTP 413/415 tasks still omit `lib/contentTypeParser.js` despite the new indexed edges, so task-level recall has not improved. The median of per-task latency differences was −10 ms; ten tasks were faster and the range was −120 to +33 ms. These small, non-paired samples do not establish a general speedup. Unjudged results were not counted as false positives, and overall precision was not measured.

A fresh disposable Fastify copy took 12.65 s to index 338 files into 8,672 symbols and 19,167 edges. An unchanged sync took 1.56 s; a sync after appending a comment to one parser file took 6.23 s and re-extracted one file. These are single local wall-clock samples without a comparable baseline or memory measurement, not acceptance thresholds. The source was restored and synced afterward. Raw reports are under `%TEMP%/SymbolLattice-evidence-052800`; the benchmark inputs and tools remain in this directory, while indexed copies and generated results remain outside the repository.

## v0.527.4 bounded edge-evidence read

The bounded graph query now expands exact edges without loading their evidence JSON at every hop. After node and relationship limits are applied, it reads evidence only for the retained edges, in batches of 500, within the same generation-fenced SQLite read transaction. It changes no index format or query contract. The integration case with 600 independently evidenced edges sharing endpoints verifies both batch boundaries and the relationship cap.

On 2026-09-24, Windows and Node v24.19.0, the frozen v0.527.0 runtime (build SHA-256 `7974e3ac1ba9d9b40a0bd08939a73cc2ddc234b1b7074589dc8a4f379744511d`) was compared with the changed runtime built before the v0.527.4 version bump (build SHA-256 `ff49ef014492c2f3f8b7dbcd1efaa2218be7299e29a2b4fd70a495ea9189a662`). Intermediate releases through v0.527.3 changed documentation and the version string, not this query runtime. The 18 fixed manifests cover 24 tasks on existing indexed Fastify (`70b14e92c0b55e8201f5530ba2e6bab4e928c784`), NestJS (`35c3ded6dbf3f23f917ae88d0ed966932788cae6`) and Django (`bc833e8883db4a333a6485d91637b78c85e2b13b`) checkouts. No indexing ran during the comparison. Each task/build used three fresh CLI processes, alternating build order by manifest; timing includes startup, freshness checks, query work and JSON serialization. Every pair returned deeply equal complete JSON, including selected source and relation evidence. Known required-file coverage remained 37/39 and required source-fact coverage 90/98. The two incomplete HTTP 413/415 Fastify tasks still miss the parser execution file; the 22 other tasks retained all fixed required files and facts. Overall precision was not measured because the fixed truth does not judge every returned file.

Median per-task latency difference (candidate minus baseline) was −47 ms across 13 Fastify tasks (10 faster), −174 ms across seven NestJS tasks (six faster), and +49 ms across four Django tasks (two faster). These are small samples with mixed results, especially for Django; they do not establish a universal end-to-end speedup. Indexing time, memory use and agent task-completion time were not measured. Reproduce with `benchmarks/mcp/task-retrieval.mjs`, `--repetitions 3`, the fixed manifests and indexed checkouts above, and explicit external outputs. The paired runner is `.tmp/retrieval-deferred-052704.mjs`; raw reports and `retrieval-comparison.json` are under `%TEMP%/SymbolLattice-evidence-052704` and are not product files.

## Numeric query and unresolved-name evidence

`explore-query-plan-v20` retains whole numeric query terms of at least three digits (for example HTTP 500). Numeric queries allow up to twelve identifier terms; other queries retain eight. Both retain the 512-character input bound. Later terms can still be omitted; `input.identifierTermsTruncated` and the text response disclose the term limit. Decimal, version and range tokens such as `503.0` are not collapsed into invented integers. A matching complete digit run in a declaration name or a literal source token contributes a bounded 500-point qualifier receipt. It does not prove that a number represents an HTTP status, and 500 does not match the name `handler5000`.

Within the existing bounded source scan, numeric queries additionally consider variables whose names contain the requested complete digit run, such as `handler500`, or whose bounded source contains the requested whole numeric token. For bindings without the numeric name, `numeric-binding-context-v1` restricts matching to three lines on each side of at most four numeric occurrences, within the existing 8,192-character declaration scan. Unrelated properties farther away cannot contribute query words. A binding containing an observed callable declaration is excluded from this additional source population. The supplied declaration population can itself be truncated; this is not a whole-file proof of leaf ownership. Ordinary queries retain their callable-only source population. `numericBindingTerms`, `numericBindingContext`, literal match ranges, scan bounds and truncation are exposed. An object property's text may retrieve its containing binding; this does not create an independently indexed property or resolve its uses.

`explore-query-plan-v20` additionally retains one supported numeric candidate if generic terms otherwise fill the file slots without any numeric qualifier. The candidate must survive the existing filtering and score floor, be non-generated production source, and match at least two query concepts. Explicit file queries are exempt. The optional `numericCoverage` receipt identifies the retained candidate; numerical relevance is not an HTTP-semantics claim. File/symbol limits and score ordering remain in force.

`explore-source-windows-v11` can add at most two `focus-source-match` windows within the existing eight-window and 24,000-source-character envelope. Original lexical receipts are checked against the owning declaration, query terms and already-requested generation source. Verification reads at most 65,536 characters per file and 524,288 total, inspecting eight focuses and twelve matches per focus. Windows include three context lines, merge nearby hits only up to 24 lines, and prioritize literal numeric hits. They may replace a plain call-site window at the same or lower focus rank, but do not displace already-selected connection, spine or callee-body windows. Later callee-source and flow fallbacks compete for the remaining slots. `lexicalWindowSearch` reports omitted, unavailable or rejected evidence and replacements; character allocation can still clip or omit selected windows. Match-centered clipping retains original source coordinates. Empty edge lists make clear that these windows provide lexical evidence, not new graph relations. No additional source fetch is performed for this window pass.

When an exploration has spare symbol capacity, `unresolved-name-followup-v1` can add one supplementary production declaration in one additional file. It requires the same written call name in at least two distinct original focus files, checks at most eight unresolved calls per original focus, and requires the candidate's own query relevance. Search stays within the existing graph, inspecting at most 4,096 supplied symbols even for legacy full snapshots. Total focuses remain at most eight; the file limit can become five and is reported explicitly. Full focus budgets and explicit file queries do not trigger this additional search.

Each lead includes the original unresolved call receipts and a same-name declaration count scoped to the bounded candidates. Name agreement is not a resolved relation, receiver-type inference or repository-wide uniqueness claim. No edge, callee, path or graph score is manufactured. Unavailable, generation-mismatched or truncated inputs are disclosed. Evidence read during planning is reused only for that plan; source reads retain their generation fence. Source output remains within the existing 24,000-character envelope.

The Fastify HTTP 431/413 truth in `mcp/fastify-numeric-errors-tasks.json` was manually defined before querying either prototype. It was first opened after freezing the prototype, then retained unchanged as regression coverage. HTTP 413 exposed a remaining gap: `FST_ERR_CTP_BODY_TOO_LARGE` is a property inside the large `codes` object, not an independently indexed declaration, and its constructor sites remain unresolved. Do not interpret this change as complete numeric or error-flow retrieval.

### v0.527.0 retrieval and window-cost validation

On 2026-09-22, v0.527.0 and v0.526.0 were compared on 24 fixed tasks using the same pinned Fastify/NestJS/Django corpora listed below, Windows and Node 24.19.0. Required task-file recall rose from 35/39 (89.7%) to 37/39 (94.9%), and required source-fact recall from 86/98 (87.8%) to 90/98 (91.8%). No previously recovered required file or fact was lost. These denominators include the new HTTP 415 task on both builds; they differ from the earlier 23-task report. Overall precision remains unmeasured because the manual truth does not judge every returned file.

HTTP 413 now recovers `lib/errors.js` and its two definition facts (1/2 files, 2/7 facts), while `lib/contentTypeParser.js` and its five size-enforcement facts remain missing. HTTP 415 similarly improves from no required evidence to its error definition (1/2 files, 2/5 facts); its three parser-rejection facts remain missing. The separate HTTP 415 task in `mcp/fastify-media-type-tasks.json` was first queried after behavior was frozen, with source coordinates independently checked beforehand. It is a held-out task in the same Fastify snapshot and related error family, not an unseen-repository validation; future runs are regression coverage. These are observed incomplete retrieval cases, not environment omissions or complete flow acceptance.

Independent checks verified 288 source excerpts, 485 lexical receipts, 147 unknown-call receipts, two original receipts for the same-name lead, and nine numeric qualifiers. Counts include repeated sites across tasks and focus/window receipts. Every response stayed within 24,000 source characters. HTTP 413 JSON grew from 345,801 to 359,700 bytes while adding definition evidence; HTTP 415 JSON shrank from 403,812 to 373,436 bytes. Added evidence does not guarantee a smaller response.

Three fresh CLI processes per task/build included startup, freshness checks and serialization. Build order alternated between manifests; no tests or indexing ran concurrently. Median latency differences were:

| Corpus | Tasks | v0.527.0 minus v0.526.0 |
| --- | ---: | ---: |
| Fastify | 13 | −67 to +20 ms |
| NestJS | 7 | −82 to +69 ms |
| Django | 4 | −79 to +122 ms |

A separate planning-only comparison replayed identical final focuses, connections and already-loaded source documents, with five warm-up pairs and 30 measured pairs in alternating order. Window-planning medians were 0.726 → 0.798 ms for HTTP 431 and 1.003 → 1.121 ms for HTTP 413. The final plans exactly matched the independently checked CLI reports. This isolates window planning only; it excludes numeric candidate scanning, retrieval, freshness, source rendering and process startup. Neither measurement proves an overall speedup or total Agent completion-time improvement. First indexing and incremental synchronization were not remeasured; extractor v427 indexes and generations were unchanged.

Full reports and timings are in the external `SymbolLattice-evidence-052700-final` workspace. Baseline build fingerprint: `afbc758a72ddacf98f01b0b7646bfc4c40274f31c2f9a6cd61372f852ecea1ca`; final build: `7974e3ac1ba9d9b40a0bd08939a73cc2ddc234b1b7074589dc8a4f379744511d`. Reproduce the retrieval comparison with the command below for every `fastify-`, `nest-` and `django-` task manifest, both built products, their corresponding pinned indexed corpora, three repetitions and distinct external output paths. `npm run check`, `npm run build` and the full suite passed (3,177 tests passed, four skipped).

### v0.526.0 retrieval validation

On 2026-09-22, the 23 fixed Fastify/NestJS/Django tasks were compared with v0.525.0 on Windows and Node 24.19.0. Required task-file recall increased from 31/37 (83.8%) to 35/37 (94.6%); required source-fact recall increased from 75/93 (80.6%) to 86/93 (92.5%). The original 21 tasks now recover all 34 required task-file pairs and 82 facts. HTTP 431 additionally recovers its one required file and four facts. HTTP 413 still misses both required files and all seven facts: this is an observed retrieval failure, not an unavailable test environment. No previously recovered required file or fact was lost. These manually scoped tasks do not establish repository-wide recall; additional results outside the truth remain unjudged, so overall precision is not measured.

Independent response checks verified 275 source excerpts, 450 lexical receipts, 139 unknown-call receipts, two original call receipts for one supplementary same-name lead, and seven numeric qualifiers. Counts can repeat sites across tasks. Every response stayed within 24,000 source characters. This verifies emitted source evidence, not resolution of the unknown call targets.

Each task/build used three fresh CLI processes, including startup, freshness checks and serialization. Build order alternated between manifests; no tests or indexing ran alongside these measurements. Median latency differences were:

| Corpus and pinned commit | Tasks | v0.526.0 minus v0.525.0 |
| --- | ---: | ---: |
| Fastify, `70b14e92c0b55e8201f5530ba2e6bab4e928c784` | 12 | −77 to +20 ms |
| NestJS, `35c3ded6dbf3f23f917ae88d0ed966932788cae6` | 7 | −87 to +25 ms |
| Django, `bc833e8883db4a333a6485d91637b78c85e2b13b` | 4 | −165 to +146 ms |

These diagnostic samples do not isolate cache/order effects or prove an overall speedup. First indexing, incremental synchronization and total Agent completion time were not measured in this query-only batch. Existing extractor v427 indexes were reused, with matching generations checked between builds.

Reports, complete responses, sample timings, pins and build fingerprints are retained outside the repository in `SymbolLattice-evidence-052600-final`. The baseline fingerprint is `acdc02d25893edb549ac926eed756d39af8a8140636b7f6352117f9330e7fe95`; the final build is `afbc758a72ddacf98f01b0b7646bfc4c40274f31c2f9a6cd61372f852ecea1ca`. Reproduce each matching `fastify-`, `nest-` and `django-` task manifest against its pinned indexed corpus and both built products, with a distinct external output path per run:

```sh
node benchmarks/mcp/task-retrieval.mjs --project /external/indexed-corpus --manifest benchmarks/mcp/fastify-numeric-errors-tasks.json --output /external/evidence/report.json --repetitions 3 --product-root /external/built-product
```

The final build passed `npm run check`, `npm run build` and the full test suite (3,167 passed, four skipped). The HTTP 413 gap remains open; these results are not complete numeric-query acceptance.

## Python unresolved member-call audit

`python/member-calls.mjs` checks written dotted-name invocations against independent CPython AST truth from every tracked Python file. It verifies callee names, UTF-16 source ranges and lexical function ownership; it does not infer receiver types, runtime targets or dispatch. Async, decorated and nested function/method bodies are included. Lambda bodies, module/class execution, decorators, default arguments and computed receivers are excluded. Parser-rejected files remain a separately reported unsupported subset, after the existing eligible closed CRLF recovery rule. Existing exact calls are outside the new unresolved-call denominator.

```sh
node benchmarks/python/member-calls.mjs /external/django /path/to/python /external/evidence/member-calls.json /external/baseline-product
```

The required baseline must predate this addition. The audit compares all extraction facts after removing only the new unresolved edges, verifies clean pinned sources and hashes, and records runtime/product versions, command, precision/recall and unsupported counts. The sibling `.truth.json` contains independent CPython evidence. This is a call-site extraction audit, not a claim of correct dynamic target resolution or improved task retrieval.

For `v0.525.0`, Django 5.2.1 at `bc833e8883db4a333a6485d91637b78c85e2b13b` was audited with Node 24.19.0 and CPython 3.12.4. Of 2,818 tracked Python files, one was rejected by CPython. Within the accepted extraction scope, TP was 86,877, FP 0 and FN 0 for exact owner/name/range tuples. Another 14,856 known invocations were in unsupported parser scopes; they are excluded from the 100% in-scope precision/recall claim. All prior extraction facts matched v0.524.1. Reports are in the external `SymbolLattice-evidence-052500` workspace.

Explore exposes recorded unknown calls separately from resolved callees and exact paths. Natural-language focuses return up to eight calls each; exact exploration returns up to 25. SQLite reads only selected source IDs, takes one extra row to detect truncation, and checks the expected active generation in the same read transaction. A generation mismatch or unavailable projection is explicit. Empty recorded evidence does not establish absence. The task-retrieval verifier independently checks returned unknown-call ownership, range, null target and resolution; Python callee spelling is checked against the pinned source.

### v0.525.0 retrieval and cost evidence

The existing 21 fixed Fastify/NestJS/Django tasks retained the same selected symbols and every previously recovered required file and source fact (31/34 task-file pairs and 75/82 source facts). Independent verification covered 254 source excerpts, 392 lexical receipts and 144 returned unknown-call receipts, of which 56 were Python callee spellings. These receipt counts may include repeated source sites across tasks. The known-symbol lookup `django/core/handlers/exception.py#handle_uncaught_exception` separately returned two checked unknown calls, including `resolver.resolve_error_handler` at line 184, with null targets. The natural-language default HTTP 500 task still returned 0/3 required files and 0/7 required facts; retaining unknown call sites does not by itself fix that ranking gap or establish a target for the call.

Three fresh CLI processes per task/build included startup, strict freshness checks and JSON serialization on Windows/Node 24.19.0. All v0.524.1 runs preceded index migration and the new-build runs. An initial v0.525.0 pass showed variable regressions, including +1,886 ms on one Django task. Profiling isolated 46–55 ms for the added call-site projection. Removing unnecessary status/count reads reduced that projection's five-pair median after one warm-up pair: Fastify 18.05 → 12.67 ms, NestJS 28.86 → 13.52 ms, Django 49.10 → 13.29 ms. Pair order alternated, both implementations read the same indexes, and every complete projection result was identical. This local improvement does not explain all process-level timing variation.

The final build reran all 21 tasks, three processes each; complete parsed responses matched the initial v0.525.0 pass. No tests or indexing ran alongside query timings. Final median changes relative to v0.524.1 were:

| Corpus and pinned commit | Tasks | Final v0.525.0 minus v0.524.1 |
| --- | ---: | ---: |
| Fastify, `70b14e92c0b55e8201f5530ba2e6bab4e928c784` | 10 | −129 to +174 ms |
| NestJS, `35c3ded6dbf3f23f917ae88d0ed966932788cae6` | 7 | −1,072 to +133 ms |
| Django, commit above | 4 | −35 to +158 ms |

These sequential measurements do not isolate cache/order effects or prove an overall speedup. Extractor v427 migration re-extracted the corpora in 12.0 s, 43.7 s and 110.4 s respectively; these are upgrade timings, not first-index or changed-file incremental timings. Django kept 58,495 symbols and added 86,877 unresolved edges (65,947 → 152,824 total edges). Its database grew from 955,695,104 to 1,639,743,488 bytes, including retained generations and allocated SQLite pages; this is not a standalone size measurement of the new active facts. A focused lifecycle test verifies changed calls replace old receipts on incremental synchronization.

Final build fingerprint: `acdc02d25893edb549ac926eed756d39af8a8140636b7f6352117f9330e7fe95` (728 files, 11,105,231 bytes). External reports are `*-before.json`, `*-after.json`, `*-final.json`, `retrieval-final-summary.json`, `projection-comparison.json`, `sync-summary.json`, and `exact-unknown-handler.json` under `SymbolLattice-evidence-052500`. Reproduce retrieval with `mcp/task-retrieval.mjs`, the existing manifests, three repetitions and explicit product roots; capture the baseline before migration. Quality claims remain limited to these pinned tasks and independent call-site audits.

Release checks passed: `npm run check`, `npm run build`, `npm run verify:language-depth`, and the full test suite (3,152 passed, four skipped). These checks complement the pinned-corpus evidence; they do not establish complete Python dispatch support or eliminate the remaining retrieval gap.

## Python module binding audit

`python/module-bindings.mjs` checks direct module assignments against independent CPython AST truth from every tracked `.py` file in a clean checkout. The scope is one ASCII name assigned a value, optionally annotated. Conditional, chained, destructuring, attribute and annotation-only writes are excluded. It checks exact names and source ranges; declarations do not establish runtime values, export visibility or alias targets. CPython-rejected files and bindings in Lezer-rejected files are reported separately from the eligible precision/recall denominator. An optional previous product directory verifies that existing facts remain unchanged after removing the newly added variables and their containment edges.

```sh
node benchmarks/python/module-bindings.mjs /external/django /path/to/python /external/evidence/python-bindings.json /external/baseline-product
```

The output records the repository URL, commit, Python/Node/product versions, command, TP/FP/FN and unsupported counts. Its sibling `.truth.json` preserves CPython truth and source hashes. This declaration audit does not prove natural-language retrieval quality; use `mcp/django-request-errors-tasks.json` for separately defined task and source-evidence checks.

### v0.524.0 declaration evidence

Django 5.2.1 (`https://github.com/django/django.git`, commit `bc833e8883db4a333a6485d91637b78c85e2b13b`) was checked with Node 24.19.0 and CPython 3.12.4. The audit enumerated all 2,818 tracked Python files: one was rejected by CPython; 180 eligible assignments were in files rejected by Lezer and remain unsupported. Among the remaining assignments, exact declaration-name/range scoring yielded TP 2,483, FP 0 and FN 0 (precision/recall 100% within the parser-accepted scope). Including the unsupported subset, 2,483 of 2,663 known direct assignments were recovered (93.2%). This does not measure general Python support or task retrieval recall.

Across the 2,817 CPython-accepted files, all prior extraction facts matched v0.523.19 after removing only the new variables and their containment edges. Separately, the six Python/framework parity snapshot files retained all prior facts: 18 snapshots added 54 variables and containment edges; all 22 associated tests passed after those additions were verified. The new lifecycle test starts with extractor v425 facts, checks staleness, syncs to v426, and confirms exact variable lookup returns its assignment source. The extractor version change invalidates old raw facts; `sync` performs re-extraction.

Reproduction uses `python/module-bindings.mjs` as above with a v0.523.19 baseline product. Local reports and the baseline build are under the external `SymbolLattice-evidence-052320` workspace (`python-bindings-final.json`, its `.truth.json`, and `snapshot-audit.json`); these generated artifacts are not committed. The snapshot audit compares complete old/new snapshot objects after removing only new variable symbols and exact containment edges, rather than accepting snapshots merely because the test updater generated them.

The 20 existing Fastify/NestJS/Django task queries retained every previously recovered required file and source fact: required-file coverage remained 30/33 and cited-source coverage 74/81. Source verification checked 253 excerpts and 392 lexical matches against pinned files. The Django default HTTP 500 discovery task still returned 0/3 required files and 0/7 cited facts; the two other Django tasks retained all required evidence. The independent known-symbol task in `mcp/django-module-bindings-tasks.json` returned `django/conf/urls/__init__.py#handler500` exactly, with the line 9 assignment verified (1/1 required file and 1/1 source fact). Its three-process median was 6,562 ms. These are separate exact-lookup and natural-language results; overall discovery is still incomplete.

Three fresh CLI processes per task/build included startup, strict freshness checks and JSON serialization on Windows/Node 24.19.0. All v0.523.19 runs preceded index synchronization and v0.524.0 runs, so cache/order effects are not isolated. No tests or other indexing ran alongside these timings. The observed per-task median changes were:

| Corpus | Tasks | v0.524.0 minus v0.523.19 |
| --- | ---: | ---: |
| Fastify, `70b14e92c0b55e8201f5530ba2e6bab4e928c784` | 10 | −287 to −73 ms |
| NestJS, `35c3ded6dbf3f23f917ae88d0ed966932788cae6` | 7 | −474 to +68 ms |
| Django, commit above | 3 | +3 to +133 ms |

This is a small-sample regression check, not evidence of an algorithmic speedup or a latency SLO. Django natural-language queries still take about 8.0–8.5 seconds. Agent completion time and semantic graph precision were not measured; incomplete file judgments do not establish overall precision.

Django's version-upgrade sync reported 87.590 seconds, retaining 3,366 files and 2,071 pending references while adding exactly 2,483 symbols and containment edges (58,495 symbols and 65,947 edges total). This measures re-extraction after an extractor-version change, not first indexing or normal unchanged-source sync. The resulting generation was `generation:12d28925-1182-4eed-9efa-96ca0a6ab1c1`. The verified v0.524.0 build fingerprint was `2a43e6119fe95eabe957c103a72d45bfce9e2334eab1991788377ed6d54c366e` (728 files, 11,085,662 bytes).

Run `mcp/task-retrieval.mjs` with the fixed manifests, `--repetitions 3`, and the pinned indexed projects to reproduce the task checks. External reports are `*-052400-before.json`, `*-052400-after.json`, `retrieval-comparison-052400.json`, `sync-*-052400.json`, and `django-module-bindings-final.json`. The Django held-out task was first evaluated only after the implementation was frozen; subsequent uses are regression cases.

Release checks passed: `npm run check`, `npm run build`, `npm run verify:language-depth`, and the full suite (3,142 passed, 4 skipped; 304 test files passed, one skipped). The minor version reflects a new queryable Python declaration capability; existing public interfaces remain compatible.

## v0.524.1 bounded directory scanning

Scoped discovery schedules at most eight directories across the entire tree. Parents load local ignore rules before children are scheduled; source and configuration paths are sorted before returning. Known access failures still aggregate into sorted evidence, and unexpected failures wait for active sibling reads to settle. Source and configuration content hashing remains unchanged; no metadata-only freshness shortcut or cross-query cache was added.

On Windows/Node 24.19.0, complete `FileSystemSourceCatalog.verifyFreshness` calls were compared with v0.524.0 on the same existing pinned Fastify, NestJS and Django indexes listed above. One warmup pair preceded five measured pairs, alternating build order. Every receipt, excluding timing fields, matched the baseline and reported complete `proven-unchanged` verification. Single-call medians were:

| Corpus | v0.524.0 | v0.524.1 | Difference |
| --- | ---: | ---: | ---: |
| Fastify | 88.0 ms | 86.7 ms | −1.3 ms |
| NestJS | 562.8 ms | 419.4 ms | −143.4 ms |
| Django | 2,201.7 ms | 1,188.6 ms | −1,013.1 ms |

These are freshness-stage measurements, not end-to-end CLI latency or an SLO. No tests or indexing ran alongside measurements. External evidence is retained in `SymbolLattice-evidence-052401/freshness-paired.json`; the pre-change phase profile is `query-profile.json`, and the baseline build is `baseline-052400`. Focused tests cover the global concurrency cap, deterministic path results, nested ignore/scoping behavior, permission failures, full-content freshness and waiting for sibling reads before propagating unexpected failures (77 tests passed).

`npm run check`, `npm run build` and the full test suite passed (3,144 passed, 4 skipped; 304 test files passed, one skipped). The patch release changes internal scheduling while retaining discovery and freshness contracts.

End-to-end checks then compared v0.524.0 and v0.524.1 using all 21 fixed Fastify/NestJS/Django tasks, including the known Python binding lookup. Each task used three fresh CLI processes per build; build order alternated between manifests, on the same unchanged indexes. No tests or indexing ran alongside this comparison. All complete parsed JSON results were deeply equal, including selected symbols, relations, source windows, omissions and freshness status. Independent checks verified 254 source excerpts and 392 lexical matches. Required-file coverage remained 31/34 and cited-source coverage 75/82; the known Django default HTTP 500 discovery gap remains 0/3 files and 0/7 source facts.

| Corpus | Tasks | CLI median change, v0.524.1 minus v0.524.0 |
| --- | ---: | ---: |
| Fastify | 10 | −127 to +80 ms |
| NestJS | 7 | −611 to −160 ms |
| Django | 4 | −2,238 to −1,926 ms |

Django's three natural-language tasks changed from 8,948–9,280 ms to 6,763–7,114 ms; its known-binding query changed from 7,362 ms to 5,143 ms. These paired-run observations do not imply a universal latency bound; the small Fastify differences include both increases and decreases. Timings include startup, both strict freshness checks, query execution and serialization. Agent task completion time and semantic graph precision remain unmeasured.

Use `mcp/task-retrieval.mjs` with the pinned manifests and `--repetitions 3` to reproduce the task checks. External evidence in `SymbolLattice-evidence-052401` includes `*-before.json`, `*-after.json`, `retrieval-comparison.json` and `full-test.log`. The v0.524.1 build fingerprint is `8c59c95a00181d0f380687f0e4b0b6d2b7b9dc8675f4de6a16fc08f8bde00534` (728 files, 11,087,400 bytes). Existing index generations were reused; no extractor or resolver version changed.

## Task retrieval checks

`mcp/nest-retrieval-tasks.json` fixes a NestJS commit and manually reviewed task truth. It includes exact-name, natural-language and cross-file questions. Run against an indexed checkout with unmodified tracked source:

```sh
node benchmarks/mcp/task-retrieval.mjs --project /external/nest --manifest benchmarks/mcp/nest-retrieval-tasks.json --split development --output /external/evidence/development.json
node benchmarks/mcp/task-retrieval.mjs --project /external/nest --manifest benchmarks/mcp/nest-retrieval-tasks.json --split held-out --output /external/evidence/held-out.json
```

Run the same frozen manifest on both builds. The tool checks the corpus URL, commit and cited source before querying, and records the manifest hash, product version, full responses and timings. Inspect development results while changing rules; inspect the held-out task only after freezing the change. Once inspected, that task is a regression case and a future iteration needs a new held-out sample.

The evaluation unit is a distinct focus file per task. Required-file recall uses only the task's required files as its denominator. Judged precision uses returned required/supporting files as TP and explicitly irrelevant files as FP; unjudged files are disclosed and excluded from that denominator. Report judgment coverage alongside precision. Evidence recall separately requires the actual cited text at its original file and line in a returned source window. A correct file hit does not imply complete evidence or correct graph edges.

The runner also independently checks every delivered source excerpt against the pinned checkout: raw character offsets, normalized text, SHA-256, line numbers and range coordinates must agree. `sourceVerification` counts all emitted excerpts, characters and lines, including duplication. `markdownProjectionBytes` measures the default renderer's projection of a full CLI result; it does not measure MCP transport overhead or repeated-session source deduplication.

For the v0.520.6 retrieval change, the acceptance check is to recover the development constructor-dependency file without reducing required-file recall on the other development tasks or the held-out task. Report evidence gaps even if file recall passes. Three fresh CLI processes per task provide diagnostic elapsed time including startup and freshness checking; they do not establish a latency SLO, indexing performance, or end-to-end agent task completion. Use a dedicated latency benchmark for performance claims.

### v0.520.5 → v0.520.6 observation

Executed on Windows with Node.js 24.19.0, using the manifest's pinned NestJS v11.1.6 checkout (1,738 indexed files), the same existing index generation, and three fresh CLI processes per task. Source truth was fixed before scoring; the HTTP pipes task was first inspected after the retrieval implementation was frozen. These four tasks are a small diagnostic sample, not an estimate of repository-wide quality.

| Task | Required files found, before → after | Source evidence found, before → after | Judged TP / FP / unjudged, after |
| --- | --- | --- | --- |
| Constructor dependencies | 0/1 → 1/1 | 0/2 → 1/2 | 2 / 0 / 2 |
| Known provider loader | 1/1 → 1/1 | 0/1 → 0/1 | 3 / 0 / 1 |
| Provider creation flow | 2/2 → 2/2 | 0/3 → 0/3 | 2 / 1 / 1 |
| HTTP pipes (held out for this change) | 0/2 → 0/2 | 0/2 → 0/2 | 0 / 1 / 3 |

The constructor task now selects `injector.ts` and `instance-loader.ts`, but a generic graph neighbor still ranks above them. Its judged precision is 2/2 with only 2/4 returned files judged; this is not a claim of 100% overall precision. The held-out task still misses both necessary files and adds a known irrelevant lifecycle-hook result; it is a remaining retrieval failure, despite unchanged required-file recall. All four source-evidence checks remain incomplete. The held-out task is now a known regression sample and must not be reused as unseen validation when tuning future changes.

Fresh-process median elapsed times were 2,629 → 2,675 ms, 2,858 → 2,543 ms, 2,885 → 2,571 ms, and 3,104 → 2,848 ms in table order. These small samples do not establish a speed improvement. Constructor-task JSON grew from 302,227 to 613,609 bytes as more relationships were selected; this is CLI diagnostic JSON size, not MCP Markdown size. Further work must address graph-neighbor noise, the source excerpts needed to support an answer, and output cost. No graph precision, first-index/incremental performance, or agent completion-time claim is made from this run.

### Source-window validation for v0.520.7

The existing four tasks are regression cases for this change. `mcp/nest-source-tasks.json` fixes a new guard-activation task before evaluating the source-window rules. It tests a known callable's implementation evidence; it does not establish natural-language retrieval quality. Run it with the same command above, substituting that manifest and an external output path. Preserve a v0.520.6 baseline and inspect the v0.520.7 result after implementation is frozen.

Acceptance: improve the three development tasks' missing source evidence without changing their selected files; verify every emitted excerpt against pinned source; keep the existing shared source allocation policy; and report the new held-out task, unchanged retrieval failures, output sizes and timing. Callable declarations share the primary allocation, with 2,048 characters reserved from the existing 24,000-character envelope for supplementary evidence. Large declarations remain explicitly truncated. Exact calls outside the already requested focus/bridge files remain follow-up work and are disclosed in `sourceWindowPlan.summary.unavailableFileSiteCount` and the Markdown view.

Executed against the same pinned checkout, index generation and Windows/Node environment as the preceding run. All five tasks retained exactly the same selected files as v0.520.6. Every emitted excerpt in both comparison results passed the independent source verifier.

| Task | Required source evidence, v0.520.6 → v0.520.7 | Emitted source characters, before → after | Markdown projection bytes, before → after |
| --- | --- | --- | --- |
| Constructor dependencies | 1/2 → 2/2 | 1,317 → 6,692 | 13,504 → 19,700 |
| Known provider loader | 0/1 → 1/1 | 1,339 → 2,049 | 7,623 → 8,595 |
| Provider creation flow | 0/3 → 3/3 | 4,304 → 10,201 | 17,308 → 24,174 |
| HTTP pipes regression | 0/2 → 0/2 | 1,566 → 2,825 | 17,040 → 18,637 |
| Guard activation body (held out for this change) | 0/3 → 3/3 | 146 → 755 | 2,463 → 3,147 |

The three development tasks improve from 1/6 to 6/6 required source snippets, and the new held-out callable improves from 0/3 to 3/3. This proves delivery of those particular source facts, not complete relation resolution or a completed agent task. The HTTP pipes question still misses its required files and therefore its required source. The guard task is now known and is no longer unseen validation for subsequent tuning.

Fresh-process median elapsed times in table order were 2,675 → 2,683 ms, 2,543 → 2,470 ms, 2,571 → 2,562 ms, 2,848 → 2,817 ms, and 2,450 → 2,414 ms. Only three processes were measured per task; no speed improvement is claimed. CLI JSON sizes increased to 744,138, 403,229, 951,901, 693,218 and 156,910 bytes respectively, including verbose provenance and graph diagnostics. The extra source improves the tested evidence coverage but increases reading cost; retrieval quality, relation completeness and output efficiency remain separate work.

### Callable-source retrieval validation for v0.520.8

This change uses same-generation source to admit and rank callable declarations with at least two query concepts. Matches retain literal tokens and line/column ranges; the benchmark independently checks those tokens against the pinned checkout and the owning declaration's range. A lexical match, including an English inflection or conventional abbreviation, is not evidence of a resolved call. Comments, string literals, nested callables and type annotations can contribute words and may introduce noise. Identifier-like tokens longer than 128 UTF-16 characters are ineligible for this source-matching channel.

Source retrieval has separate limits: at most 128 files, 4,096 declarations in total, 128 declarations per file, 1,048,576 source characters in total, 65,536 per file and 8,192 per declaration. FTS overfetches up to twice the requested seed-file limit (hard cap 128); final graph seeds retain their existing limits. Production and explicitly requested source roles are prioritized before the FTS cap and before scanning. The result reports scan counts and truncation; it does not claim the unscanned source is irrelevant. Single-concept queries skip the callable scan. Direct graph-connection bonuses count distinct relation-kind/neighbor pairs once and stop at 240 points, so repeated calls cannot overwhelm lexical relevance.

Source can add at most 1,500 points for additional concept coverage, 120 for admission without a symbol-name match, and 100 from length-normalized, saturating term frequency. The latter uses BM25 over the bounded scanned declarations, not repository-wide statistics, and is not a probability of relevance. An exact file stem adds 500 only when source evidence exists and the declaration name corroborates nearly the whole stem; generic getters cannot inherit this boost. Exact query-relevant callees can supply missing implementation windows within the existing requested files and source allocation policy.

The acceptance check fixed before opening held-out results was to improve HTTP-pipes retrieval while preserving the five existing NestJS tasks' required-file and source-evidence coverage, reporting cost and remaining failures. The first held-out task, `mcp/fastify-retrieval-tasks.json`, uses Fastify v5.6.0 at `70b14e92c0b55e8201f5530ba2e6bab4e928c784`. Its initial v0.520.8 result regressed from 2/2 to 1/2 required files and from 3/4 to 0/4 source facts. That failed experiment was retained, and this task became a known regression while revising the source-ranking bounds and callee windows. A separate plugin-dependency task was then fixed in `mcp/fastify-plugin-tasks.json`; its outputs were held out from those revisions. No task question, required file or evidence fact was changed to match a product result.

The final comparison rebuilt v0.520.7 from product commit `05052abc3614fe5bfd6e814d027e8ca05ea5f0c1` in an external directory using the existing dependencies. Use `--product-root <built-product-checkout>` to compare that product with the current one using the same benchmark runner. Reports include a SHA-256 of all built product files, checked again after evaluation, so experimental builds sharing a package version remain distinguishable. Final build digests were `fadd5baae178266c3b0682d2461ab65e892504c0bc71028deca00fe024419154` (v0.520.7) and `5efeedb408ef3d902890ecf66b385d63faef191aec0ead0f19af26a182e04bd4` (v0.520.8).

Executed sequentially on Windows/Node v24.19.0, three fresh CLI processes per task and product, using unchanged indexes. NestJS retained its 1,738 files / 17,399 symbols / 44,728 edges and generation `aec92b67-8630-4780-b8dd-6c43b5b63be3`; Fastify had 338 files / 8,311 symbols / 18,718 edges and generation `d4e88d42-da9d-453a-b3cc-15e357484770`. Paired manifest hashes and generation IDs matched. All final 73 emitted source excerpts and 85 lexical token receipts passed independent checkout/range verification.

| Task | Required files, v0.520.7 → v0.520.8 | Required source facts, before → after | Judged TP / FP / unjudged, after |
| --- | --- | --- | --- |
| Constructor dependencies | 1/1 → 1/1 | 2/2 → 2/2 | 1 / 0 / 3 |
| Known provider loader | 1/1 → 1/1 | 1/1 → 1/1 | 3 / 0 / 1 |
| Provider creation flow | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 1 / 1 |
| HTTP pipes | 0/2 → 2/2 | 0/2 → 2/2 | 2 / 0 / 2 |
| Guard activation body | 1/1 → 1/1 | 3/3 → 3/3 | 1 / 0 / 0 |
| Fastify validation (known regression after initial failure) | 2/2 → 2/2 | 3/4 → 3/4 | 3 / 0 / 1 |
| Fastify plugin dependencies (held out for the revised rules) | 1/2 → 1/2 | 1/3 → 1/3 | 1 / 0 / 3 |

HTTP pipes now returns `router-execution-context.ts` and `pipes-consumer.ts` with the specified source facts. The constructor task still finds its required file, but only 1/4 returned files are judged relevant under the frozen manifest; unjudged files are not false positives or proof of relevance. The known irrelevant lifecycle-hook file remains in the provider-flow result. Fastify validation still omits `handleRequest.js:157`; the plugin task still misses `pluginOverride.js` and source at `pluginUtils.js:152` / `pluginOverride.js:29`. The plugin case did not improve and is now a known regression sample, no longer unseen validation.

| Task | Median process ms, before → after | Markdown bytes, before → after | Emitted source characters, before → after | CLI JSON bytes, after |
| --- | --- | --- | --- | --- |
| Constructor dependencies | 2,721 → 3,235 | 19,700 → 31,572 | 6,692 → 14,281 | 953,293 |
| Known provider loader | 2,508 → 2,645 | 8,595 → 8,595 | 2,049 → 2,049 | 404,884 |
| Provider creation flow | 2,596 → 2,754 | 24,174 → 24,340 | 10,201 → 10,201 | 951,616 |
| HTTP pipes | 3,107 → 2,990 | 18,637 → 23,534 | 2,825 → 8,287 | 681,937 |
| Guard activation body | 2,726 → 2,444 | 3,147 → 3,147 | 755 → 755 | 156,910 |
| Fastify validation | 1,430 → 1,504 | 32,077 → 36,204 | 22,483 → 24,000 | 369,769 |
| Fastify plugin dependencies | 1,385 → 1,436 | 7,725 → 17,224 | 1,359 → 10,971 | 227,156 |

These are small-sample process measurements, including startup, freshness checking and serialization; the rebuilt baseline lives in a separate directory. They establish no speed improvement, latency SLO, graph precision, indexing performance or agent completion rate. Source expansion is costly: the plugin task more than doubles Markdown size without improving required-file or fact coverage. Remaining work includes that missing dependency flow, the validation call site, irrelevant results and output cost. Raw corpora, built baseline, intermediate failed experiments and final reports remain outside this repository.

### Named function expressions and focus selection in v0.521.0

Fastify's `lib/pluginOverride.js:28` assigns a named function expression to `module.exports`. Previously that expression had no callable symbol, so callable-source retrieval could not return its implementation. JavaScript/TypeScript now retain named expression declarations and attribute their internal calls to the callable. Existing variable/property identities are reused. The expression's private name has its own enclosing scope, so parameters, destructured parameters and local declarations can shadow it. This does not establish a CommonJS export target or resolve `.call` dispatch. Anonymous expressions are outside this addition.

For multi-concept queries without an explicit file hint, a local variable wholly contained in an already selected callable no longer consumes a second focus slot if it contributes no additional query concept. Single-concept lookups, explicit files and locals with additional concepts retain the previous selection behavior. The planner policy is `explore-query-plan-v14`; `multi-language-ast-v423` invalidates cached extraction facts. Run `SymbolLattice sync .` after upgrading.

The acceptance check was to recover the known plugin task's missing file and source facts while preserving the other six known tasks' required-file and evidence coverage. `mcp/fastify-error-tasks.json` was fixed before implementation and its outputs opened only after the change was frozen. It is an unseen task on an already used project, not an unseen repository. The source verifier caught a transcribed line 142 before any task query executed; pinned source established line 140, retaining the same required text. Both products used the corrected manifest. After inspection, this error task becomes a known regression sample.

The baseline was rebuilt from v0.520.12 commit `4e97310bc95cbd29ef6bd202f74fa5904066aac4`. Product SHA-256 values were `6e290bf537304f7a48489ae157dd4db325dc27b70017822c6805b1195635c907` (baseline) and `ade96ce3d10a2018de46aed1f149f901df9b3270f2530f89199ef4949aee9767` (v0.521.0). Runs used Windows/Node v22.23.2, three sequential fresh CLI processes per task, unchanged pinned source and matching paired manifest hashes. The full test suite ran after these timing measurements. NestJS remains pinned to `35c3ded6dbf3f23f917ae88d0ed966932788cae6`; Fastify to `70b14e92c0b55e8201f5530ba2e6bab4e928c784`.

Unlike v0.520.8's ranking-only comparison, this extraction change requires new indexes. NestJS's generation changed from `aec92b67-8630-4780-b8dd-6c43b5b63be3` to `8c0185c2-910d-41a5-9253-f2dbb0596885` (1,738 files; 17,399 → 17,403 symbols; 44,728 → 44,732 edges). Fastify changed from `d4e88d42-da9d-453a-b3cc-15e357484770` to `c02e8ce2-e95d-4f4f-9e2c-4dd795ae35d6` (338 files; 8,311 → 8,454 symbols; 18,718 → 18,861 edges). Index updates completed, but indexing latency was not benchmarked. All 87 final source excerpts and 118 lexical-token receipts passed independent source/range verification.

| Task | Required files, before → after | Required source facts, before → after | Judged TP / FP / unjudged, after |
| --- | --- | --- | --- |
| Constructor dependencies | 1/1 → 1/1 | 2/2 → 2/2 | 1 / 0 / 3 |
| Known provider loader | 1/1 → 1/1 | 1/1 → 1/1 | 3 / 0 / 1 |
| Provider creation flow | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 1 / 1 |
| HTTP pipes | 2/2 → 2/2 | 2/2 → 2/2 | 2 / 0 / 2 |
| Guard activation body | 1/1 → 1/1 | 3/3 → 3/3 | 1 / 0 / 0 |
| Fastify validation | 2/2 → 2/2 | 3/4 → 3/4 | 3 / 0 / 1 |
| Fastify plugin dependencies | 1/2 → 2/2 | 1/3 → 3/3 | 2 / 0 / 2 |
| Fastify error response (held out for this change) | 2/2 → 2/2 | 1/4 → 2/4 | 2 / 0 / 2 |

Judged precision remains 2/3 for provider creation and 1 for the other tasks, on the judged subset only. Judgment coverage ranges from 1/4 to 1; unjudged results are not evidence of relevance or false positives. The plugin flow's three source facts are now visible, but its `.call` links are still not resolved graph edges. Validation still omits `lib/handleRequest.js:157`; error response still omits `lib/reply.js:140` and `:815`. The known irrelevant lifecycle-hook result also remains.

| Task | Median process ms, before → after | Markdown bytes, before → after | Source characters, before → after | CLI JSON bytes, after |
| --- | --- | --- | --- | --- |
| Constructor dependencies | 3,419 → 3,381 | 31,572 → 31,572 | 14,281 → 14,281 | 953,343 |
| Known provider loader | 3,057 → 3,007 | 8,595 → 8,595 | 2,049 → 2,049 | 404,934 |
| Provider creation flow | 3,206 → 3,135 | 24,340 → 24,340 | 10,201 → 10,201 | 951,666 |
| HTTP pipes | 3,681 → 3,460 | 23,534 → 23,534 | 8,287 → 8,287 | 681,987 |
| Guard activation body | 3,379 → 3,013 | 3,147 → 3,147 | 755 → 755 | 156,960 |
| Fastify validation | 2,201 → 1,913 | 36,204 → 36,204 | 24,000 → 24,000 | 369,819 |
| Fastify plugin dependencies | 1,875 → 1,936 | 17,224 → 11,246 | 10,971 → 5,063 | 229,394 |
| Fastify error response | 2,113 → 1,904 | 36,346 → 35,191 | 24,000 → 24,000 | 367,175 |

Plugin Markdown output shrank by 34.7%, while its JSON grew from 227,156 to 229,394 bytes and its median process time rose by 3.2%. These three-run diagnostics do not establish a speed improvement, latency SLO, graph precision, or agent completion time. The baseline's first constructor run took 11.3 seconds; medians do not hide that startup/cache variability in the retained raw reports.

An independent Espree 11.2.0 audit parsed all 254 tracked Fastify JavaScript files without rejection. All 124 named function expressions matched an exact source identity/range (TP 124, FN 0, duplicate identities 0; declaration recall 1). This audit accepts an existing variable/property owner and measures declaration recall, not overall precision or TypeScript corpus coverage. Its truth SHA-256 is `b1f0ae0aacbf456549473e09a31c6c88ed6022366766c94d353ce5de28fbae86`.

The existing JavaScript oracle also found 212/212 sampled positive facts with no invalid evidence and passed 150 negative cases (15 templates repeated 10 times). Its overall status remains **inconclusive**: this single corpus supplies only 2/24 instantiation, 0/5 heritage and 4/65 ESM-import quota items. This is not the full 300-positive multi-project release validation, nor a precision estimate.

Reproduce with built products and external indexed checkouts:

```sh
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-plugin-tasks.json --product-root /external/baseline-052012 --repetitions 3 --output /external/evidence/plugin-before.json
# Update the index with the new product before its measurements.
node dist/cli/main.js sync /external/fastify --json
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-plugin-tasks.json --repetitions 3 --output /external/evidence/plugin-after.json
node benchmarks/javascript/named-function-expressions.mjs --project /external/fastify --commit 70b14e92c0b55e8201f5530ba2e6bab4e928c784 --output /external/evidence/expressions.json
node benchmarks/javascript/correctness-oracle.mjs --corpus fastify=/external/fastify=/external/fastify --output /external/evidence/relations.json
```

Run the other task manifests with their corresponding corpus; finish all baseline queries before upgrading its index. External artifacts for this run are under `SymbolLattice-evidence-0521` in the verification workspace, including `*-baseline.json`, `*-candidate.json`, both oracle reports, sync reports and the built baseline. No corpus or generated report is committed here.

### CommonJS object-export calls in v0.522.0

Fastify's `lib/reply.js:37` destructures `handleError` from `./error-handler`. The local function at `lib/error-handler.js:30` is exported through the object at line 175. The two direct calls from `onErrorHook` at `reply.js:812` and `:815` previously lacked cross-file targets. `javascript/fastify-commonjs-truth.json` fixes these manually reviewed development occurrences separately from product scoring; they are not a random sample or a repository-wide precision truth set.

The new rule accepts parser-clean strict JavaScript or `.cjs`, an unshadowed static relative `require`, top-level `const` named destructuring, and a single direct `module.exports = { ... }` assignment containing an unmutated top-level function declaration or const function initializer. Aliases retain the original import, export and call locations. Each exact call carries `javascript-commonjs-object-call-v1` receipts and a source-to-target path; Markdown displays the import and export sites. `multi-language-ast-v424` and `project-resolver-v204` invalidate older cached facts/projections; run `SymbolLattice sync .` after upgrading.

This is bounded static resolution. Namespace calls, default exports, computed/spread/accessor exports, ESM interop, directory/package lookup and observed cycles remain unresolved. Dependencies are traversed for at most 256 distinct files. Observed module-object writes or escapes in other parser-clean JavaScript files suppress the affected module's targets, including mutations in non-strict files. A namespace member invocation passes the object as `this`: it is safe for this suppression check only when the member is a proven own function export whose declaration never refers to `this`. Direct eval and `with` dynamic scopes disable the file's CommonJS bindings and conservatively suppress its observed relative dependencies. Inherited methods such as `valueOf` and `__defineGetter__`, unknown members and receiver-dependent functions do not qualify. This check does not itself resolve a namespace call. Dynamic loading, parse-rejected files, external code and runtime monkey-patching are outside the proof; unresolved does not mean absent or safe to modify.

An intermediate experiment conservatively rejected every namespace member invocation. It preserved the error-task improvement but regressed validation from 2/2 required files and 3/4 source facts to 1/2 and 1/4. The failed report is retained as `fastify-retrieval-final.json`. Distinguishing functions that cannot observe the receiver recovered some relations, but the `*-release.json` experiment still missed validation: computed-name invocations in the corpus correctly kept that module unresolved. No query or truth file was changed to match those results.

The revised retrieval planner (`explore-query-plan-v15`, `callable-source-ranking-v2`) also distinguishes ambient TypeScript declarations from executable bodies for explicit execution-flow questions. In `.d.ts`, `.d.cts` and `.d.mts`, a callable retains its symbol-name score, literal source receipts and graph evidence, but receives no additional body-vocabulary score for execution intent. The receipt includes `declaration-source-only`. The bounded English intent heuristic recognizes flow/runtime/execution/run/invoke/process terms; explicit type/interface/signature/declaration/overload/generic questions and explicit file hints are exempt. Ordinary queries and implementation files keep their prior behavior. This does not classify every bodyless declaration inside ordinary `.ts` files or establish semantic understanding of arbitrary natural language.

CommonJS raw facts are persisted with the index. A lifecycle test closes and reopens SQLite, changes an unrelated file without re-extracting the importer/provider, and confirms that the call evidence survives. Mutating the export then removes the exact call; restoring it recovers the original edge and receipts.

`javascript/commonjs-call-evidence.mjs` uses Espree independently to verify every emitted CommonJS call's literal import/export/call/declaration AST locations, alias names and relative target path. Contract tests deliberately corrupt each kind of receipt. The tool also scores the two manual occurrences. Source-receipt correctness is separate from whole-program binding/mutation correctness, which this audit does not independently measure; overall precision remains unmeasured.

The acceptance check is to recover the known missing calls and improve the error task's evidence while preserving the other seven known tasks' required-file and evidence coverage. `mcp/fastify-serializer-tasks.json` was fixed before implementation, with both products' outputs held out throughout capability and retrieval tuning. It was first opened against frozen build `f82d9025fc27bde59689a497ff257f6c73f2ff30c79016c6671bbb681167974f`, improving from 2/4 to 4/4 source facts. A later independent synthetic audit exposed the `with` scope bug; that safety fix was followed by another corpus run, with the now-known serializer task treated as regression. No rule was tuned against its output. This was an unseen task on a known repository, not an unseen project.

The final comparison used Windows/Node v22.23.2, three sequential fresh CLI processes per task, paired identical manifest hashes and the same pinned Fastify/NestJS source as v0.521.0. Baseline product commit: `0b11eba69de74583406b91d1cd12a7f695b79eef`; built-product SHA-256: `ade96ce3d10a2018de46aed1f149f901df9b3270f2530f89199ef4949aee9767`. Final v0.522.0 SHA-256: `39eef8e1736dde591665c692eda7e667210a86d2f56b51c68447eba60a1225fe`. All baseline queries completed before upgrading indexes. The final Fastify generation is `a26d00ee-ff37-44c8-af85-2d87be64ec6d` (338 files, 8,454 symbols, 18,861 edges, 7,916 unresolved references); NestJS is `5d899fb2-f5f1-4707-8080-5e42116f3420` (1,738 files, 17,403 symbols, 44,732 edges). Full reindexing completed, but indexing latency was not benchmarked.

| Task | Required files, before → after | Required source facts, before → after | Judged TP / FP / unjudged, after |
| --- | --- | --- | --- |
| Constructor dependencies | 1/1 → 1/1 | 2/2 → 2/2 | 1 / 0 / 3 |
| Known provider loader | 1/1 → 1/1 | 1/1 → 1/1 | 3 / 0 / 1 |
| Provider creation flow | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 1 / 1 |
| HTTP pipes | 2/2 → 2/2 | 2/2 → 2/2 | 2 / 0 / 2 |
| Guard activation body | 1/1 → 1/1 | 3/3 → 3/3 | 1 / 0 / 0 |
| Fastify validation | 2/2 → 2/2 | 3/4 → 3/4 | 3 / 0 / 1 |
| Fastify plugin dependencies | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 0 / 2 |
| Fastify error response | 2/2 → 2/2 | 2/4 → 3/4 | 2 / 0 / 2 |
| Response serializer selection (held out for this change) | 2/2 → 2/2 | 2/4 → 4/4 | 2 / 0 / 2 |

All 104 emitted source excerpts and 147 lexical receipts passed independent source/range verification. Judged precision remains 2/3 for provider creation and 1 for the other judged subsets; judgment coverage ranges from 1/4 to 1. Unjudged files are neither confirmed relevant nor FP. The serializer task is now a known regression sample and cannot serve as unseen validation for future tuning.

| Task | Median process ms, before → after | Markdown bytes, before → after | Source characters, before → after | CLI JSON bytes, after |
| --- | --- | --- | --- | --- |
| Constructor dependencies | 3,679 → 4,687 | 31,572 → 31,572 | 14,281 → 14,281 | 953,293 |
| Known provider loader | 3,226 → 3,153 | 8,595 → 8,595 | 2,049 → 2,049 | 404,884 |
| Provider creation flow | 3,344 → 3,503 | 24,340 → 24,340 | 10,201 → 10,201 | 951,616 |
| HTTP pipes | 3,676 → 3,783 | 23,534 → 23,534 | 8,287 → 8,287 | 681,937 |
| Guard activation body | 3,136 → 3,078 | 3,147 → 3,147 | 755 → 755 | 156,910 |
| Fastify validation | 2,082 → 1,992 | 36,204 → 38,891 | 24,000 → 24,000 | 495,360 |
| Fastify plugin dependencies | 2,003 → 1,928 | 11,246 → 11,246 | 5,063 → 5,063 | 229,323 |
| Fastify error response | 2,080 → 1,965 | 35,191 → 37,920 | 24,000 → 24,000 | 462,445 |
| Response serializer selection | 2,092 → 1,984 | 35,119 → 40,840 | 22,755 → 23,538 | 657,628 |

More relationship receipts increase output cost; the serializer's Markdown grows by 16.3% while its four required source facts become visible. These three-run diagnostics establish no speed improvement, latency SLO or end-to-end agent completion rate. An earlier experiment's first CLI-version invocation failed while loading TypeScript; an immediate syntax check and fresh import succeeded without changing dependencies. That failure, with undetermined cause, is preserved separately and excluded from successful timing repetitions. Full tests ran after final timing measurements.

The independent CommonJS receipt audit verified all 62 emitted calls across 18 source files. Both manually fixed `onErrorHook` occurrences matched (TP 2, FN 0, recall 1; truth SHA-256 `f86fa501d1d3220784cabb609475cb3889693aaee2f0df71ee891808a0634ebc`); this is not a corpus-wide precision estimate. The existing JavaScript oracle also recovered 212/212 sampled facts with no invalid evidence and passed 150 negative cases (15 templates × 10). Its status is **inconclusive** because this corpus lacks enough instantiation, heritage and ESM-import quota items; it does not replace the full multi-project 300-positive release validation. The 58-language depth check passes its identity/smoke contract, not deep validation for every language.

The final build and TypeScript test typecheck passed. The complete test suite passed 3,038 tests with 4 skipped (296 passing files, one skipped); this includes CommonJS negative cases, receipt corruption checks and SQLite reopen/incremental lifecycle coverage.

Remaining gaps: validation still omits `lib/handleRequest.js:157`; error response still omits `lib/reply.js:140`. Computed-name namespace calls keep the validation module's call targets unresolved, and plugin `.call` links remain unsupported. The known irrelevant NestJS lifecycle-hook result and unjudged results also remain. Finding files or delivering source text does not prove every intervening relationship.

Reproduce with external indexed checkouts and a preserved built baseline:

```sh
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-error-tasks.json --product-root /external/baseline-05210 --repetitions 3 --output /external/evidence/error-before.json
node dist/cli/main.js sync /external/fastify --json
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-error-tasks.json --repetitions 3 --output /external/evidence/error-after.json
node benchmarks/javascript/commonjs-call-evidence.mjs --project /external/fastify --manifest benchmarks/javascript/fastify-commonjs-truth.json --output /external/evidence/commonjs.json
node benchmarks/javascript/correctness-oracle.mjs --corpus fastify=/external/fastify=/external/fastify --output /external/evidence/relations.json
```

Run the other manifests against their matching corpus, finishing all baseline queries before index upgrades. External evidence is under `SymbolLattice-evidence-0522`: `*-baseline.json`, final `*-completed.json`, `*-release4-index.json`, `commonjs-receipts-completed.json`, `javascript-oracle-completed.json`, `language-depth-completed.json`, the baseline build, full test log and preserved intermediate experiments. No downloaded project, generated index or result report is committed here.

### Anonymous member assignments and upstream source in v0.523.0

JavaScript/TypeScript now retain anonymous functions and arrows directly assigned to static member paths, including `Reply.prototype.send = function (...) { ... }`. The symbol's source range includes the assignment target and body; internal calls belong to that callable. Dot names, literal string/number/template keys, `this` roots and transparent TypeScript assertions are supported within bounded path depth and label length. Existing named-expression, variable, class-property and default-export identities are preserved. These source labels create no lexical binding and do not prove exports, object identity or receiver dispatch. Dynamic computed targets, call-expression receivers and compound assignments remain outside this addition. `multi-language-ast-v425` invalidates previous extraction facts; the resolver remains `project-resolver-v204`. Upgrade existing indexes with `SymbolLattice sync .`.

Extraction alone did not fix the known error-response task: the intermediate `*-candidate.json` reports still delivered only 3/4 required source facts. The final source-window planner (`explore-source-windows-v4`) also uses already-returned incoming impact paths. It accepts only consistently directed exact call chains of two hops, with a query-matching terminal name and call sites in already requested files. It preserves the existing direct-call/spine selections, then fills at most two spare slots within the existing eight-window and shared character limits. Each supplemental window retains the chain's edge IDs; full edge receipts remain in the focus's impact paths. Capacity and source truncation remain disclosed. This does not prove an invocation of an assigned property or make the returned graph exhaustive.

Acceptance fixed before opening the new held-out output: recover `lib/reply.js:140` in the error task without losing any of the nine known tasks' required files or evidence. `mcp/fastify-cookie-tasks.json` independently fixes five source facts about preserving repeated cookie headers before implementation; neither its baseline nor candidate output was inspected until the final product was frozen. It is a new task on the existing Fastify corpus, not an unseen repository. Its failure below is retained, and it is now a regression case rather than unseen validation.

Runs used Windows/Node v22.23.2 and three sequential fresh CLI processes per task, before full tests. The preserved baseline is v0.522.0 at product commit `57dd487793347928a7fe0429b0f8c5e92d462707`, build SHA-256 `39eef8e1736dde591665c692eda7e667210a86d2f56b51c68447eba60a1225fe`. The final v0.523.0 build is `ff7dd78134a76aaa42b5add30478490ee0112f5765baa5a163642e49253d9437`. Paired manifest hashes match. Corpus URLs and pinned commits remain [Fastify](https://github.com/fastify/fastify/tree/70b14e92c0b55e8201f5530ba2e6bab4e928c784) and [NestJS](https://github.com/nestjs/nest/tree/35c3ded6dbf3f23f917ae88d0ed966932788cae6).

Official sync upgraded the extractor and re-extracted all existing files. Fastify has 338 files / 8,531 symbols / 18,938 edges, generation `b22e4013-8e0e-4931-9eb4-a31143cc1931`; NestJS has 1,738 files / 17,431 symbols / 44,760 edges, generation `f4329572-07fd-4767-a2a2-9e5158c5c6a5`. This version-triggered re-extraction is not a measurement of ordinary small-change incremental performance.

| Task | Required files, before → after | Source facts, before → after | Judged TP / FP / unjudged, after |
| --- | --- | --- | --- |
| Constructor dependencies | 1/1 → 1/1 | 2/2 → 2/2 | 1 / 0 / 3 |
| Known provider loader | 1/1 → 1/1 | 1/1 → 1/1 | 3 / 0 / 1 |
| Provider creation flow | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 1 / 1 |
| HTTP pipes | 2/2 → 2/2 | 2/2 → 2/2 | 2 / 0 / 2 |
| Guard activation body | 1/1 → 1/1 | 3/3 → 3/3 | 1 / 0 / 0 |
| Fastify validation | 2/2 → 2/2 | 3/4 → 3/4 | 3 / 0 / 1 |
| Fastify plugin dependencies | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 0 / 2 |
| Fastify error response | 2/2 → 2/2 | 3/4 → 4/4 | 2 / 0 / 2 |
| Response serializer selection | 2/2 → 2/2 | 4/4 → 4/4 | 2 / 0 / 2 |
| Multiple cookie headers (held out) | 1/1 → 1/1 | 0/5 → 0/5 | 2 / 0 / 2 |

All 118 emitted excerpts and 164 lexical token receipts in the final ten tasks passed independent source/range verification. Judged precision is 2/3 for provider creation and 1 for the other judged subsets; judgment coverage ranges from 1/4 to 1. Unjudged files are not automatically relevant or FP. Validation still omits `lib/handleRequest.js:157`, and the cookie task finds `lib/reply.js` without delivering any of its five required header-append facts. The known irrelevant NestJS lifecycle-hook file remains. None of these file/source measurements establish complete graph correctness.

| Task | Median process ms, before → after | Markdown bytes, before → after | Source characters, before → after | CLI JSON bytes, after |
| --- | --- | --- | --- | --- |
| Constructor dependencies | 3,846 → 3,450 | 31,572 → 31,572 | 14,281 → 14,281 | 953,406 |
| Known provider loader | 3,302 → 3,077 | 8,595 → 8,595 | 2,049 → 2,049 | 404,997 |
| Provider creation flow | 3,390 → 3,403 | 24,340 → 24,340 | 10,201 → 10,201 | 951,729 |
| HTTP pipes | 3,685 → 3,673 | 23,534 → 23,534 | 8,287 → 8,287 | 682,050 |
| Guard activation body | 3,134 → 3,089 | 3,147 → 3,147 | 755 → 755 | 156,960 |
| Fastify validation | 2,139 → 1,970 | 38,891 → 38,891 | 24,000 → 24,000 | 496,035 |
| Fastify plugin dependencies | 2,021 → 2,024 | 11,246 → 11,246 | 5,063 → 5,063 | 229,747 |
| Fastify error response | 2,239 → 1,969 | 37,920 → 38,058 | 24,000 → 24,000 | 472,116 |
| Response serializer selection | 2,102 → 1,976 | 40,840 → 40,168 | 23,538 → 23,142 | 576,846 |
| Multiple cookie headers | 2,162 → 1,946 | 25,449 → 25,449 | 14,192 → 14,192 | 419,439 |

The error task recovers its missing entry call with 138 additional Markdown bytes and unchanged 24,000 source characters. These process timings include startup, freshness checks and serialization; three repetitions on two repositories establish no speed improvement, latency SLO or agent completion-time result.

The independent Espree audit parsed all 254 tracked Fastify JavaScript files without rejection. Its 76 anonymous-assignment truths are fixed independently of the index (truth SHA-256 `3d4f4d45c60a006869090f2467c1c56fc616b8df85cf7b577546fea3877e8c55`). Exact declaration identity/range improves from TP 0 / FN 76 to TP 75 / FN 1, with zero duplicate identities. Direct identifier-call ownership improves from 0/39 to 37/39. The remaining declaration and both ownership misses are `.github/scripts/lint-ecosystem.js:14–17`, which the default hidden-directory discovery policy excludes. Within the default indexed scope, the corresponding counts are 75/75 and 37/37; the full tracked-source denominators and failing audit exit are preserved, not rewritten to match the product. This measures source identity and call ownership, not callee correctness, property dispatch, repository-wide precision or TypeScript corpus coverage.

The existing named-expression audit remains TP 124 / FN 0 with no duplicates. The CommonJS audit verifies all 62 emitted receipts across 18 files and both fixed manual occurrences (TP 2 / FN 0); overall precision is unmeasured. The existing JavaScript relation oracle retains 212/212 sampled positives, no invalid evidence and 150/150 negative cases. Its overall status remains **inconclusive**, with only 2/24 instantiation, 0/5 heritage and 4/65 ESM-import quota items. This is not the full multi-project release validation.

The final build and TypeScript test typecheck pass. The full suite passes 3,071 tests with 4 skipped (298 passing files, one skipped). The 58-language identity/smoke check and MCP worker generation-switch check also pass; these do not establish deep support for every language or resolve the corpus gaps above.

Reproduce with external indexed checkouts, finishing baseline queries before the extractor upgrade:

```sh
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-error-tasks.json --product-root /external/baseline-05220 --repetitions 3 --output /external/evidence/error-before.json
node dist/cli/main.js sync /external/fastify --json
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-error-tasks.json --repetitions 3 --output /external/evidence/error-after.json
node benchmarks/javascript/assigned-callables.mjs --project /external/fastify --commit 70b14e92c0b55e8201f5530ba2e6bab4e928c784 --output /external/evidence/assignments.json
```

Run all other manifests on their matching corpora. External artifacts are under `SymbolLattice-evidence-0523`: the baseline build, `*-baseline.json`, intermediate `*-candidate.json`, final retrieval `*-windows.json`, sync reports, `assignments-final.json`, `named-final.json`, `commonjs-final.json`, `javascript-oracle-final.json` and the full test log. No corpus, generated index or report is committed here.

### Same-file query coverage in v0.523.1

The known cookie task already had a literal source match for `Reply.prototype.header`, but graph-connected functions filled both `reply.js` focus slots. The new `explore-query-plan-v16` keeps the selected files and each file's strongest anchor. For multi-concept queries without explicit file hints, it may replace the second focus with a source-backed callable scoring at least 75% of the displaced focus. Eligible callables need at least two distinct source concepts. It prefers additional concepts absent from the anchor, weighted by inverse occurrence count among the retained source-backed callables in that same file. Repeated tokens and overlapping query inflections count once. Ties retain the original selection; at most one focus changes per file. Symbol scores, graph certainty, file limits and source budgets are unchanged.

This is bounded lexical selection, not semantic proof: comments, strings and nested bodies can contribute matches, and candidate frequency does not measure repository-wide rarity. JSON retains an `additional-query-concepts` reason and a `focusCoverage` receipt with the anchor, displaced symbol, score floor and counted terms. Existing literal source receipts explain those terms in the Markdown result. Explicit-file and single-concept requests retain the previous selection rules. This is a patch improvement to the existing query contract; extractor, resolver and index formats are unchanged.

Acceptance: recover all five previously missing cookie facts without reducing the ten known tasks' required-file or source coverage. `mcp/nest-shutdown-tasks.json` fixed a new task and five manually checked source facts before implementation; both outputs remained unopened until the final product was frozen. It is an unseen task on the known NestJS repository, not an unseen project. The manifest and product output were not adjusted to make its remaining failure pass. It is now a known regression case.

Comparison used Windows/Node v22.23.2, three sequential fresh CLI processes per task and product, unchanged pinned source, matching manifest hashes and identical paired index generations. The baseline is v0.523.0 commit `ebc28971bfbdc923fef47abd28417889eb3bab0a`, build SHA-256 `ff7dd78134a76aaa42b5add30478490ee0112f5765baa5a163642e49253d9437`; the v0.523.1 build is `1837bed5eb48f13fe6d63e3c708f8f9e0a0278a25f06dda17c497c94837ed8f6`. Fastify remains pinned to `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, generation `b22e4013-8e0e-4931-9eb4-a31143cc1931`; NestJS remains pinned to `35c3ded6dbf3f23f917ae88d0ed966932788cae6`, generation `f4329572-07fd-4767-a2a2-9e5158c5c6a5`. No reindex was needed. Tests ran after query timing.

| Task | Required files, before → after | Source facts, before → after | Judged TP / FP / unjudged, after |
| --- | --- | --- | --- |
| Constructor dependencies | 1/1 → 1/1 | 2/2 → 2/2 | 1 / 0 / 3 |
| Known provider loader | 1/1 → 1/1 | 1/1 → 1/1 | 3 / 0 / 1 |
| Provider creation flow | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 1 / 1 |
| HTTP pipes | 2/2 → 2/2 | 2/2 → 2/2 | 2 / 0 / 2 |
| Guard activation body | 1/1 → 1/1 | 3/3 → 3/3 | 1 / 0 / 0 |
| Fastify validation | 2/2 → 2/2 | 3/4 → 3/4 | 3 / 0 / 1 |
| Fastify plugin dependencies | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 0 / 2 |
| Fastify error response | 2/2 → 2/2 | 4/4 → 4/4 | 2 / 0 / 2 |
| Response serializer selection | 2/2 → 2/2 | 4/4 → 4/4 | 2 / 0 / 2 |
| Multiple cookie headers | 1/1 → 1/1 | 0/5 → 5/5 | 2 / 0 / 2 |
| Closing application signal listeners (held out) | 1/1 → 1/1 | 4/5 → 4/5 | 1 / 0 / 3 |

All 128 final source excerpts and 178 lexical receipts passed independent range/text verification. The cookie task now delivers the append/replace branches at `reply.js:243–255`. It selects `Reply.prototype.header` (score 1,180) in place of `sendTrailer` (1,434), above the 1,075.5 score floor; `cookie` contributes 1/1 additional coverage versus 1/2 for `multiple`, among seven retained source candidates. This validates those source facts, not dynamic calls to `reply.header`. Judged precision remains 2/3 for provider creation and 1 for other judged subsets; coverage ranges from 1/4 to 1, so unjudged results remain unresolved rather than automatic TP or FP.

The serializer task also changes its second `reply.js` focus while preserving all four required facts. Other tested focus selections are unchanged. The validation task still omits `lib/handleRequest.js:157`; the new shutdown task still omits `nest-application-context.ts:397`, where listeners are actually removed. The known irrelevant NestJS lifecycle-hook file remains in provider creation.

| Task | Median process ms, before → after | Markdown bytes, before → after | Source characters, before → after | CLI JSON bytes, after |
| --- | --- | --- | --- | --- |
| Constructor dependencies | 3,587 → 3,592 | 31,572 → 31,572 | 14,281 → 14,281 | 953,604 |
| Known provider loader | 3,116 → 3,077 | 8,595 → 8,595 | 2,049 → 2,049 | 405,195 |
| Provider creation flow | 3,241 → 3,177 | 24,340 → 24,340 | 10,201 → 10,201 | 951,927 |
| HTTP pipes | 3,795 → 3,537 | 23,534 → 23,534 | 8,287 → 8,287 | 682,248 |
| Guard activation body | 3,062 → 3,056 | 3,147 → 3,147 | 755 → 755 | 156,960 |
| Fastify validation | 2,028 → 2,179 | 38,891 → 38,891 | 24,000 → 24,000 | 496,233 |
| Fastify plugin dependencies | 2,047 → 1,899 | 11,246 → 11,246 | 5,063 → 5,063 | 229,945 |
| Fastify error response | 2,085 → 1,961 | 38,058 → 38,058 | 24,000 → 24,000 | 472,314 |
| Response serializer selection | 2,011 → 1,966 | 40,168 → 40,242 | 23,142 → 23,142 | 578,664 |
| Multiple cookie headers | 2,094 → 2,007 | 25,449 → 23,794 | 14,192 → 12,972 | 355,989 |
| Closing application signal listeners | 3,623 → 3,600 | 12,610 → 12,610 | 3,315 → 3,315 | 379,791 |

Cookie Markdown shrinks by 6.5% while delivering all five required source facts; serializer Markdown grows by 74 bytes. Validation's process median rises by 151 ms. These three-run measurements include startup, freshness checks and serialization and do not establish a speed improvement, sustained latency regression, SLO or end-to-end agent completion rate. First-index and incremental-sync timings are unmeasured in this query-only change.

A separate diagnostic ran after the tests: two warmups per product, then 25 alternating-order repetitions of pure `planExploreQuery` on the same bounded snapshot for each of the eleven tasks. Full plan JSON was checked for repeatability outside the timer. This excludes retrieval, source delivery, serialization and process startup. Median differences range from −1.95 to +1.64 ms; validation is 35.65 → 36.57 ms and Cookie is 33.48 → 34.57 ms. These samples do not attribute the 151 ms process difference to the selection rule or establish a general latency guarantee. Raw samples, CPU/Node metadata, product fingerprints and exact runner provenance are in `planning-paired.json`; the command was `node .tmp/planning-05231.mjs`, with its source preserved as `planning-runner.mjs` alongside the report.

The build, TypeScript test typecheck and full suite pass: 3,075 tests passed, 4 skipped (298 passing files, one skipped). The focused cases cover literal source evidence, preserved file/anchor selection, weak or non-callable alternatives, explicit-file requests, repeated terms and deterministic ordering. The unchanged language parsers were not re-audited against external compiler corpora for this query-only patch.

Reproduce using the same frozen manifests and external indexed checkouts:

```sh
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-cookie-tasks.json --product-root /external/baseline-05230 --repetitions 3 --output /external/evidence/cookie-before.json
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-cookie-tasks.json --repetitions 3 --output /external/evidence/cookie-after.json
node benchmarks/mcp/task-retrieval.mjs --project /external/nest --manifest benchmarks/mcp/nest-shutdown-tasks.json --repetitions 3 --output /external/evidence/shutdown-after.json
```

External artifacts are under `SymbolLattice-evidence-05231`: the preserved baseline build, paired `*-baseline.json` / `*-candidate.json` task reports, `planning-paired.json`, its archived runner and full test log. No external source, index or generated report is committed here.

### Source evidence for differently named callees in v0.523.2

The shutdown task already resolves `close` → `unsubscribeFromProcessSignals` exactly, but the latter's name does not match the question. Its indexed body does contain the query concept `shutdown`. `explore-source-windows-v5` now considers literal body matches for exact outgoing callees in files already requested by the exploration. It keeps the existing call-site, name-matched callee, path-spine and upstream windows first, then adds at most two supplementary callee windows within the existing eight-window, 24,000-source-character envelope. It does not change focus/file ranking, relation certainty or the index format. This repairs evidence delivery under the existing query contract, so the release is a patch.

`exact-callee-source-terms-v1` examines at most 32 distinct targets, 65,536 source characters across unique file prefixes, and 8,192 characters per declaration. Shared/nested declaration ranges can be examined more than once; `sourceCharacters` counts file prefixes, not cumulative per-declaration work. Only the same indexed generation is used, including when live files have changed. A single literal query concept can justify supplementary source after an exact call has established the target; introducing new retrieval seeds still requires two concepts. Comments, strings and nested bodies can match, so lexical evidence does not independently prove runtime behavior or semantic relevance.

JSON retains `calleeSourceSearch` scan counts, bounds, missing files and truncation, plus `exact-callee-source` windows with target IDs, exact edge IDs and literal `sourceMatches`. Markdown cites the tokens and source lines separately from resolved relationships and discloses missing source and search limits. Character allocation can still truncate supplementary source; matching tokens may lie beyond the emitted excerpt and remain locatable using their indexed coordinates. No result means only that no eligible match was found within these bounds.

Acceptance was fixed before inspecting the new Express results: recover the fifth NestJS shutdown source fact without reducing required-file or source coverage on the eleven known tasks. `mcp/express-mounted-app-tasks.json` freezes a new repository/task and five manually verified statements about restoring the parent request/response prototypes after a mounted child. Neither its baseline nor candidate output was opened while implementing the rule. The task measures delivered source, not resolution of dynamic `fn.handle` calls or the external router.

The baseline is v0.523.1 commit `ded888246af0b8cc720ce0e6c03460ee2d8ad37f`, build SHA-256 `1837bed5eb48f13fe6d63e3c708f8f9e0a0278a25f06dda17c497c94837ed8f6`; the v0.523.2 build is `497109ba89b897b01c5ff4937fb47c4f9f4d9c84112991389060667165774a26`. Windows/Node v22.23.2, three sequential fresh CLI processes per product/task, matching manifest hashes and unchanged index generations were used. Fastify and NestJS keep the commits and generations recorded in the preceding section. Express is pinned to `https://github.com/expressjs/express`, v5.1.0 commit `cd7d4397c398a3f3ecadeaf9ef6ac1377bd414c4`, generation `50e78adb-3154-4848-aabf-89d5e22cf7d1`: 169 indexed files, 2,761 symbols and 7,702 edges. It was indexed with the baseline before querying either product. No dependencies were installed for the corpus, and no index migration was needed.

| Task | Required files, before → after | Source facts, before → after | Judged TP / FP / unjudged, after |
| --- | --- | --- | --- |
| Constructor dependencies | 1/1 → 1/1 | 2/2 → 2/2 | 1 / 0 / 3 |
| Known provider loader | 1/1 → 1/1 | 1/1 → 1/1 | 3 / 0 / 1 |
| Provider creation flow | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 1 / 1 |
| HTTP pipes | 2/2 → 2/2 | 2/2 → 2/2 | 2 / 0 / 2 |
| Guard activation body | 1/1 → 1/1 | 3/3 → 3/3 | 1 / 0 / 0 |
| Fastify validation | 2/2 → 2/2 | 3/4 → 3/4 | 3 / 0 / 1 |
| Fastify plugin dependencies | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 0 / 2 |
| Fastify error response | 2/2 → 2/2 | 4/4 → 4/4 | 2 / 0 / 2 |
| Response serializer selection | 2/2 → 2/2 | 4/4 → 4/4 | 2 / 0 / 2 |
| Multiple cookie headers | 1/1 → 1/1 | 5/5 → 5/5 | 2 / 0 / 2 |
| Closing application signal listeners | 1/1 → 1/1 | 4/5 → 5/5 | 1 / 0 / 3 |
| Restoring parent prototypes after a mounted child (held-out Express) | 1/1 → 1/1 | 5/5 → 5/5 | 3 / 0 / 1 |

All 148 final source excerpts and 218 literal lexical receipts passed independent source/range verification. The verifier now also checks supplementary callee tokens against the pinned source and requires a correctly directed exact call receipt to their owning declaration. These checks validate receipt consistency, not the semantic correctness of every graph edge. The shutdown result now includes `nest-application-context.ts:397` (`process.removeListener`) with the exact call from `close` and the literal `shutdown` concept in `shutdownCleanupRef`. All selected focus files remain unchanged. Judged precision remains 2/3 for provider creation and 1 for the other judged subsets; judged fractions range from 1/4 to 1. Unknown files remain unjudged. Fastify validation still omits `lib/handleRequest.js:157`, and provider creation retains the known irrelevant lifecycle-hook file.

| Task | Median process ms, before → after | Markdown bytes, before → after | Source characters, before → after | CLI JSON bytes, after |
| --- | --- | --- | --- | --- |
| Constructor dependencies | 3,426 → 3,670 | 31,572 → 31,572 | 14,281 → 14,281 | 954,054 |
| Known provider loader | 3,019 → 3,254 | 8,595 → 8,595 | 2,049 → 2,049 | 405,645 |
| Provider creation flow | 3,135 → 3,245 | 24,340 → 27,163 | 10,201 → 12,443 | 1,021,175 |
| HTTP pipes | 3,478 → 4,254 | 23,534 → 26,903 | 8,287 → 10,715 | 759,521 |
| Guard activation body | 2,984 → 3,377 | 3,147 → 3,147 | 755 → 755 | 156,960 |
| Fastify validation | 1,929 → 2,082 | 38,891 → 39,329 | 24,000 → 24,000 | 506,401 |
| Fastify plugin dependencies | 1,854 → 2,125 | 11,246 → 11,626 | 5,063 → 5,242 | 236,018 |
| Fastify error response | 1,929 → 2,506 | 38,058 → 38,058 | 24,000 → 24,000 | 472,763 |
| Response serializer selection | 1,950 → 2,116 | 40,242 → 41,892 | 23,142 → 24,000 | 592,655 |
| Multiple cookie headers | 1,917 → 2,126 | 23,794 → 26,796 | 12,972 → 15,216 | 376,966 |
| Closing application signal listeners | 3,524 → 3,846 | 12,610 → 13,730 | 3,315 → 3,926 | 408,867 |
| Restoring parent prototypes after a mounted child | 1,522 → 1,635 | 11,951 → 14,297 | 5,061 → 6,801 | 346,480 |

The shutdown gain costs 1,120 Markdown bytes (+8.9%) and 611 source characters. Other tasks receive no additional required truth facts; some do receive more related source. Express Markdown increases by 19.6%, HTTP pipes by 14.3%, and cookies by 12.6%. Supplementary windows share the existing character allocator, so they may redistribute an already-full envelope; these fixed facts did not regress, but this is not a guarantee for all tasks. Serializer source search reached the 65,536-character bound and disclosed truncation. Output economy remains a tradeoff and a follow-up concern.

An isolated diagnostic checks the changed step, rather than remeasuring the unchanged query ranking: two warmups followed by 25 alternating-order source-window planning repetitions on identical focus, connection, path and indexed-source inputs. Plans must match the real CLI result before timing; full JSON repeatability is checked outside the timer. Eleven natural-language queries have median increases of 0.29–2.62 ms; the exact guard query bypasses this planner and is not applicable. Source loading, retrieval, rendering and process startup are excluded. Samples, CPU/Node metadata and both build fingerprints are saved in `source-window-paired.json`, with runner `source-window-timing-runner.mjs` (command: `node .tmp/source-window-timing-05232.mjs`).

Because the initial process samples increased even for the unchanged exact-symbol path, four tasks were remeasured with one warmup and three alternating-order fresh-process pairs, without concurrent tests or indexing. Median milliseconds before → after: HTTP pipes 4,250 → 4,031; error response 2,320 → 1,998; shutdown 3,693 → 3,847; exact guard control 3,099 → 3,159. The initial large increases for pipes/error did not repeat, while shutdown remained modestly slower. Raw samples and runner are `process-paired.json` / `process-timing-runner.mjs` (command: `node .tmp/paired-process-05232.mjs`). Neither this small sample nor the isolated planner timing establishes an overall speed improvement, latency SLO or absence of regressions elsewhere. First indexing, incremental synchronization and agent task completion times were not measured.

Build and TypeScript test typecheck pass. The full suite passes with 3,082 tests passed and 4 skipped (298 passing files, one skipped). Focused cases cover stale indexed source, exact/directed edge requirements, unavailable files, declaration ownership, token coordinates, cut identifiers, scan caps and preservation of a full window envelope. The independent benchmark verifier also rejects coordinates beyond the real line ending; all twelve saved results were reverified after that check was tightened (`receipt-verification.json`, command `node .tmp/verify-receipts-05232.mjs`). README versions are synchronized without adding another development log section.

Reproduce on the fixed external indexed checkouts, using the same manifests for both products:

```sh
node benchmarks/mcp/task-retrieval.mjs --project /external/nest --manifest benchmarks/mcp/nest-shutdown-tasks.json --product-root /external/baseline-05231 --repetitions 3 --output /external/evidence/shutdown-before.json
node benchmarks/mcp/task-retrieval.mjs --project /external/nest --manifest benchmarks/mcp/nest-shutdown-tasks.json --repetitions 3 --output /external/evidence/shutdown-after.json
node benchmarks/mcp/task-retrieval.mjs --project /external/express --manifest benchmarks/mcp/express-mounted-app-tasks.json --repetitions 3 --output /external/evidence/express-after.json
```

Run the other seven manifests on their matching corpus as recorded above. External artifacts are under `SymbolLattice-evidence-05232`: baseline build, Express checkout/init report, `*-baseline.json` / `*-candidate.json` task reports, paired timing reports and archived runners, plus the full test log. No external source, index or generated report is committed here. Extractor `multi-language-ast-v425` and resolver `project-resolver-v204` are unchanged; parser/compiler correctness was not re-audited for this source-selection patch.

### Flow coverage and shared source in v0.523.3

Fastify validation's remaining missing fact had two causes. The second `handleRequest.js` focus was the immediate caller of the strongest focus, leaving later callbacks out of focus selection. Large outer and nested `route.js` excerpts also repeated thousands of characters. Selecting the later callback alone still cut the handler invocation line short; the shared-source change below then made enough source capacity available to deliver it.

`explore-query-plan-v17` keeps the selected files and strongest anchor. Existing additional-concept selection takes priority. For execution-intent queries only, if no such replacement exists, a second focus that directly calls the anchor can be replaced by a comparable downstream callable in the same file. The replacement must preserve every source-backed query concept of the displaced focus, score at least 75% as highly, and be reachable through two to four exact calls. Explicit file requests and a displaced focus with an exact symbol-term match are protected. Alternatives retain normal score ordering; the rule does not simply pick the furthest node. The execution-intent classifier is the existing English query heuristic and excludes type/signature questions; this is not a general natural-language intent model.

`same-file-downstream-focus-v1` walks at most 128 symbols (including the anchor and excluded original caller) and 512 edges within the already bounded query graph. It rejects heuristic, non-call, reversed, cross-file and misfiled edges, avoids cycles, and retains every selected hop plus the displaced caller's exact edge. A selected flow receipt discloses its walk limits/truncation. Graph preparation uses the existing bounded snapshot and is not included in the walk-edge counter. Markdown renders the selected path even when the separate path-spine selection has no slot for it. Static call paths do not prove runtime reachability through all branch conditions, asynchronous callbacks or dynamic dispatch.

For natural-language exploration, `explore-source-prefix-reuse-v1` can share the contiguous prefix of a primary excerpt that earlier focuses already emitted in the same indexed generation. It never reuses undelivered text, skips gaps and different files, and keeps any remaining suffix on a complete line. Reuse must save at least 256 canonical characters, enough for one standard source-window reservation; small padding overlaps stay inline. No primary evidence is dropped: the shared prefix plus remaining suffix must reconstruct the original emitted excerpt exactly. This does not deduplicate arbitrary interior overlaps or supplementary windows, and it does not grow the eight-focus, eight-window or 24,000-character envelope.

`sourceReuse` records the original excerpt range/offsets, its truncation state, saved character count, and the actual shared ranges with earlier focus references and source identity IDs. A fully shared excerpt may have `source: null` with `sourceAvailability: active-generation`; its text is in the cited earlier focus. This is distinct from unavailable source. A partly shared excerpt carries only the unseen suffix in `source`. Allocation receipts still distinguish reserved characters from actually emitted characters; the saved primary space becomes available to supplementary windows. Markdown cites the shared file/line and focus number. Exact-symbol and ordinary `context` source delivery retain their existing behavior.

This patch repairs evidence coverage and output allocation under the existing exploration contract. No parser, resolver or index format changes are required. Acceptance was fixed before opening the new task outputs: recover all four Fastify validation facts without losing necessary files or facts on the twelve known tasks. `mcp/express-json-response-tasks.json` adds an unseen object-to-JSON/content-type task on the pinned Express repository, with five source facts independently defined from `response.js` before implementation. Neither output was opened while adjusting the product.

Baseline: v0.523.2 commit `1e941c5742a30355432d6220d0e09c2ad310f83c`, build SHA-256 `497109ba89b897b01c5ff4937fb47c4f9f4d9c84112991389060667165774a26`. Final v0.523.3 build: `20847db7f16b72e630a57ce08ec9c3b77e6fba6218fb51377a8acfcaa39d215c`. Windows/Node v22.23.2, three sequential fresh CLI processes per task/product, matching frozen manifest hashes and identical paired index generations were used. The Fastify, NestJS and Express commits/generations are unchanged from v0.523.2 above; no reindex was performed. Quality and output comparisons use the final build, after correcting shared-range coordinates and applying the small-overlap cost threshold.

| Task | Required files, before → after | Source facts, before → after | Judged TP / FP / unjudged, after |
| --- | --- | --- | --- |
| Constructor dependencies | 1/1 → 1/1 | 2/2 → 2/2 | 1 / 0 / 3 |
| Known provider loader | 1/1 → 1/1 | 1/1 → 1/1 | 3 / 0 / 1 |
| Provider creation flow | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 1 / 1 |
| HTTP pipes | 2/2 → 2/2 | 2/2 → 2/2 | 2 / 0 / 2 |
| Guard activation body | 1/1 → 1/1 | 3/3 → 3/3 | 1 / 0 / 0 |
| Fastify validation | 2/2 → 2/2 | 3/4 → 4/4 | 3 / 0 / 1 |
| Fastify plugin dependencies | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 0 / 2 |
| Fastify error response | 2/2 → 2/2 | 4/4 → 4/4 | 2 / 0 / 2 |
| Response serializer selection | 2/2 → 2/2 | 4/4 → 4/4 | 2 / 0 / 2 |
| Multiple cookie headers | 1/1 → 1/1 | 5/5 → 5/5 | 2 / 0 / 2 |
| Closing application signal listeners | 1/1 → 1/1 | 5/5 → 5/5 | 1 / 0 / 3 |
| Restoring parent prototypes after a mounted child | 1/1 → 1/1 | 5/5 → 5/5 | 3 / 0 / 1 |
| Object-to-JSON content type (held-out Express task) | 1/1 → 1/1 | 5/5 → 5/5 | 3 / 0 / 1 |

All selected file sets are unchanged. Provider creation's known irrelevant lifecycle-hook file remains: judged precision is 2/3 there and 1 for the other judged subsets, with judged fractions from 1/4 to 1. Unknown files are not counted as false positives. The new Express task confirms preserved coverage, not a new improvement on that task or a new unseen repository.

All 158 final source excerpts, 237 literal receipts and one shared-source receipt passed independent checks against pinned source. The shared receipt saves 5,123 canonical characters in the validation task. Checks require earlier emitted owners, consistent file/identity references, gap-free offsets, correct line/column coordinates, and reconstruction of the originally emitted text. The four manually specified static calls from `handler` through `preValidationCallback`, `validationCompleted` and `preHandlerCallback` to `preHandlerCallbackInner` also have exact directed receipts and their actual call-site lines in the final source envelope. The last function's body now includes the handler invocation at `handleRequest.js:157`. This is a scoped four-hop/source audit, not repository-wide graph precision or proof of runtime path feasibility.

| Task | Median process ms, before → after | Markdown bytes, before → after | Source characters, before → after | CLI JSON bytes, after |
| --- | --- | --- | --- | --- |
| Constructor dependencies | 4,056 → 3,752 | 31,572 → 31,572 | 14,281 → 14,281 | 954,054 |
| Known provider loader | 3,513 → 3,134 | 8,595 → 8,595 | 2,049 → 2,049 | 405,645 |
| Provider creation flow | 3,497 → 3,308 | 27,163 → 27,163 | 12,443 → 12,443 | 1,021,175 |
| HTTP pipes | 4,032 → 3,785 | 26,903 → 26,903 | 10,715 → 10,715 | 759,521 |
| Guard activation body | 3,324 → 3,151 | 3,147 → 3,147 | 755 → 755 | 156,960 |
| Fastify validation | 2,090 → 2,088 | 39,329 → 40,104 | 24,000 → 24,000 | 575,657 |
| Fastify plugin dependencies | 2,085 → 1,940 | 11,626 → 11,626 | 5,242 → 5,242 | 236,018 |
| Fastify error response | 2,301 → 4,526 | 38,058 → 38,058 | 24,000 → 24,000 | 472,763 |
| Response serializer selection | 2,098 → 2,083 | 41,892 → 41,892 | 24,000 → 24,000 | 592,655 |
| Multiple cookie headers | 2,350 → 2,344 | 26,796 → 26,796 | 15,216 → 15,216 | 376,966 |
| Closing application signal listeners | 4,213 → 3,648 | 13,730 → 13,730 | 3,926 → 3,926 | 408,867 |
| Restoring parent prototypes after a mounted child | 1,663 → 1,585 | 14,297 → 14,297 | 6,801 → 6,801 | 346,480 |
| Object-to-JSON content type | 1,619 → 1,560 | 13,575 → 13,575 | 6,702 → 6,702 | 338,966 |

Validation's source envelope stays at 24,000 characters because freed space is spent on previously truncated evidence. Its Markdown increases by 775 bytes (+2.0%) and CLI JSON by 69,256 bytes (+13.7%) while adding the missing fact and fuller call-path receipts. Other measured task outputs have identical byte counts. This improves evidence per source budget in this case; it does not establish universal output reduction or faster agent completion.

An isolated ranking diagnostic used two warmups then 25 alternating-order `planExploreQuery` repetitions per product on the same bounded snapshot for twelve non-exact queries. It excludes retrieval, source sharing, delivery, serialization and startup; the exact guard query bypasses this planner. Full plan repeatability was checked outside timing. Median changes range from −3.10 to +2.62 ms, with validation 37.89 → 39.09 ms. CPU/Node metadata, fingerprints and samples are in `planning-paired.json`, with archived `planning-runner.mjs` (command `node .tmp/planning-05233.mjs`). This diagnostic does not measure the whole changed pipeline or provide an SLO.

The error-response process outlier was followed by a four-task diagnostic: one warmup and three alternating-order fresh-process pairs per product, without concurrent tests or indexing. Median milliseconds before → after: validation 2,129 → 1,968; error response 1,973 → 1,949; shutdown 3,527 → 3,498; exact guard control 3,017 → 2,972. The large error-response increase did not reproduce. These small samples do not establish general acceleration or exclude regressions on other workloads. First indexing, incremental sync and total agent task completion time remain unmeasured. Raw samples and runner are `process-paired.json` / `process-timing-runner.mjs` (command `node .tmp/paired-process-05233.mjs`). All timing ran before the full suite. A stale description of test order in the reused planning runner was corrected with an explicit metadata note; its original report/runner remain archived and timing samples are unchanged.

Build, TypeScript test typecheck and version consistency checks pass. The full suite passes with 3,095 tests passed and 4 skipped (300 passing files, one skipped). New cases cover directed paths, heuristic/reversed/misfiled edges, cycles and traversal caps; preserved query concepts, protected exact/file requests; partial/full shared prefixes, gaps, missing owners, CRLF/Unicode boundaries, small-overlap cost and unchanged ordinary context delivery. The independent benchmark verifier rejects missing or insufficient owners and inconsistent shared coordinates. These contract tests complement the actual pinned-corpus runs above.

Reproduce against the same frozen manifests and external indexes:

```sh
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-retrieval-tasks.json --product-root /external/baseline-05232 --repetitions 3 --output /external/evidence/validation-before.json
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-retrieval-tasks.json --repetitions 3 --output /external/evidence/validation-after.json
node benchmarks/mcp/task-retrieval.mjs --project /external/express --manifest benchmarks/mcp/express-json-response-tasks.json --repetitions 3 --output /external/evidence/json-after.json
```

Run the remaining eight manifests on their matching pinned corpus for the full thirteen-task comparison. External artifacts under `SymbolLattice-evidence-05233` include the preserved baseline build, `*-baseline.json` / final `*-final.json` reports, intermediate `*-candidate.json` and validation probes, paired timing samples/runners, build/full-test logs and `receipt-verification.json`. The archived `receipt-verification-runner.mjs` (command `node .tmp/verify-final-05233.mjs`) checks all final output and the four specified static hops; `retrieval-runner.mjs` records the complete task loop. No external corpus, index or generated report is committed. Unchanged parsers were not re-audited against compiler corpora for this query/source-allocation patch.

### Shared parameter types in graph expansion, v0.523.5

The provider-creation query incorrectly selected `before-app-shutdown.hook.ts` through two exact `accepts` edges: the queried function and the hook both accept `Module` (or `InstanceWrapper`). Those edges correctly describe their signatures, but sharing an input type alone is weak evidence of task relevance. The failure was reproduced on v0.523.4 and in a regression test before the fix.

`explore-query-plan-v18` / `explore-query-graph-expansion-v3` no longer expands through a forward `accepts` edge immediately followed by a reverse `accepts` edge. Direct type dependencies, queries seeded at the type itself, independently matched symbols, explicit files, and alternative exact call paths remain eligible. Other relationship kinds retain their behavior; for example, a `returns` → reverse `accepts` path is still labeled as type relationships, not proof that values actually flow between those functions. This patch changes query selection only; extractor `multi-language-ast-v425`, resolver `project-resolver-v204`, stored edges, and index format are unchanged. It does not generally infer task intent or eliminate every kind of irrelevant graph neighbor.

Acceptance required removing the known provider-flow false positive without losing required files or source facts on the thirteen existing tasks. `mcp/nest-module-init-tasks.json` adds one held-out named-symbol flow task on the already known NestJS repository. Its required files and five source facts were defined from pinned source before implementation; both outputs stayed unopened until the implementation was frozen. The original thirteen tasks are known regression cases in this comparison, regardless of their original manifest split labels.

Baseline: v0.523.4 commit `d834226d0a1ea62c63ba012a2cbb10188fc8ee50`, build SHA-256 `e544933b2b6fb343fc9b6170d56a81989f9e7690c1c1e6994f8a4d65f6dd3072`. Candidate v0.523.5 build: `9e2bd0210c34ab6a6a77e61cc22cc311af3595733cfb2af548d80d3bf6a41e8b`. Windows / Node v22.23.2, three fresh CLI processes per task/product, identical manifest hashes and index generations, and the same pinned NestJS, Fastify and Express checkouts recorded above. No indexing, builds or tests ran concurrently with query timing.

All fourteen tasks retain every required file: 21/21 task-file requirements in each version. The thirteen known tasks retain 46/46 source facts. The new module-init task retains 4/5 facts in both versions: the emitted source still omits the `onModuleInit()` invocation in the local `callOperator` at `on-module-init.hook.ts:27`. The candidate includes exact calls to `callOperator` at lines 50 and 53, but selects no supplemental source window despite 20,841 unused source characters. Its manifest preserves this unresolved source-selection gap for follow-up; it is not a fully passing evidence task.

| Changed task | Required files, before → after | Source facts, before → after | Judged TP / FP / unjudged, before → after |
| --- | --- | --- | --- |
| Known provider loader | 1/1 → 1/1 | 1/1 → 1/1 | 3 / 0 / 1 → 3 / 0 / 1 |
| Provider creation flow | 2/2 → 2/2 | 3/3 → 3/3 | 2 / 1 / 1 → 2 / 0 / 2 |
| Module-init hook instances (new task) | 2/2 → 2/2 | 4/5 → 4/5 | 3 / 0 / 1 → 3 / 0 / 1 |

The other eleven selected file sets are unchanged. Provider-flow judged precision improves from 2/3 to 2/2, while its judged fraction falls from 3/4 to 2/4; the two remaining unjudged files are not proven relevant. The module-init result now includes `on-app-bootstrap.hook.ts` as its unjudged fourth file. No new judged false positives were introduced in the fixed task judgments, but this does not establish global precision or the relevance of every replacement file.

All 159 candidate excerpts, 237 literal match receipts and one source-reuse receipt passed checks against pinned source text, coordinates and identities. The existing Fastify reuse still saves 5,123 canonical characters. Selected expansion receipts contain no rejected shared-input-type pattern. These checks validate delivered evidence and the changed selection rule, not repository-wide relation precision or runtime feasibility.

| Changed task | Median process ms, before → after | Markdown bytes, before → after | Source characters, before → after | CLI JSON bytes, before → after |
| --- | --- | --- | --- | --- |
| Known provider loader | 3,576 → 3,149 | 8,595 → 11,290 | 2,049 → 2,820 | 405,645 → 447,746 |
| Provider creation flow | 3,260 → 3,287 | 27,163 → 21,053 | 12,443 → 10,469 | 1,021,175 → 819,016 |
| Module-init hook instances | 3,140 → 3,174 | 13,426 → 12,876 | 3,068 → 3,159 | 630,258 → 605,026 |

Provider-flow Markdown falls by 22.5%, but the known-provider query grows; this is not a universal output reduction. The other eleven tasks retain their Markdown size and source-character count. An isolated planner diagnostic used two warmups and 25 alternating-order repetitions on the same bounded snapshot for each of thirteen non-exact queries; the exact guard lookup bypasses that planner. Median changes range from −1.92 to +0.92 ms; provider flow is 46.37 → 46.20 ms. Full-plan determinism was checked outside timing. All timing preceded the full suite. These small samples do not establish a general speedup or latency SLO. First indexing, incremental sync, total agent completion time and query count were not measured.

Reproduce with the unchanged harness and fixed indexed checkouts:

```sh
node benchmarks/mcp/task-retrieval.mjs --project /external/nest --manifest benchmarks/mcp/nest-retrieval-tasks.json --product-root /external/baseline-05234 --repetitions 3 --output /external/evidence/providers-before.json
node benchmarks/mcp/task-retrieval.mjs --project /external/nest --manifest benchmarks/mcp/nest-retrieval-tasks.json --repetitions 3 --output /external/evidence/providers-after.json
node benchmarks/mcp/task-retrieval.mjs --project /external/nest --manifest benchmarks/mcp/nest-module-init-tasks.json --repetitions 3 --output /external/evidence/module-init-after.json
```

Run the other nine manifests on their corresponding pinned checkouts for the fourteen-task comparison. External artifacts under `SymbolLattice-evidence-05235` include `baseline-05234`, all `*-baseline.json` / `*-candidate.json` reports, `verification.json`, `planning-paired.json`, and archived retrieval/verification/planning runners (commands `node .tmp/retrieval-05235.mjs baseline`, `node .tmp/retrieval-05235.mjs candidate`, `node .tmp/verify-05235.mjs`, `node .tmp/planning-05235.mjs`). Typecheck, build and all 66 query-planning tests passed. The full suite passed 3,100 tests with four existing skips; its output is in `full-test.log`. Unchanged parsers were not re-audited against compiler corpora.

### Direct helper evidence for named flows, v0.523.6

The previous module-init task exposed a source-selection gap: `Trace callModuleInitHook flow` returned exact calls to `callOperator`, but omitted its body because that body did not repeat the query terms. This patch allows an exactly named flow focus to supplement its existing source with up to two exact direct callees in files already available to the query. It uses the existing bounded English execution-intent heuristic and excludes type-oriented queries. Ordinary searches and exact-symbol lookups retain their behavior.

`explore-source-windows-v6` appends supplements only to spare slots within the existing eight-window limit. `explore-source-window-allocation-v5` allocates them only after preserving every existing reservation and whole-file promotion, within the unchanged 24,000-character envelope. Supplements carry an `exact-flow-callee` reason, an exact call edge and a `remaining-budget` allocation receipt; they do not fabricate literal matches. This remains bounded static evidence, not exhaustive callee coverage or proof of runtime execution. Query ranking, extractor `multi-language-ast-v425`, resolver `project-resolver-v204` and index compatibility are unchanged.

Baseline: v0.523.5 commit `650947404b67dd066ce97c5339056d1528fb72c4`, build SHA-256 `9e2bd0210c34ab6a6a77e61cc22cc311af3595733cfb2af548d80d3bf6a41e8b`. Candidate v0.523.6 build: `8b53e98c65f232f61f53ac68cbd745b1c22bd28594340b1b9d83634454cbb488`. Both products used the same pinned NestJS, Fastify and Express checkouts and index generations recorded above, on Windows / Node v22.23.2, with three fresh CLI processes per task/product. No reindexing was needed.

The fourteen existing tasks are regression cases. The new `mcp/fastify-plugin-version-tasks.json` defines one held-out named-symbol flow task on the already known Fastify repository. Required files and five source facts were fixed from pinned source before implementation, and baseline/candidate outputs stayed unopened until the implementation was frozen. This is not an unseen repository or a natural-language discovery task.

All fifteen tasks retain 22/22 required task-file pairs, with unchanged file selections and query plans. Source facts improve from 54/56 to 56/56:

| Task | Source facts, before → after | Source characters, before → after | Markdown bytes, before → after | CLI JSON bytes, before → after |
| --- | --- | --- | --- | --- |
| Module-init hook instances | 4/5 → 5/5 | 3,159 → 3,774 | 12,876 → 13,806 | 605,026 → 629,950 |
| Plugin version metadata (held-out) | 4/5 → 5/5 | 1,043 → 1,222 | 2,367 → 2,636 | 55,275 → 60,327 |

The new NestJS excerpts include `callOperator` and `hasOnModuleInitHook`, justified by calls at `on-module-init.hook.ts:50` and `:59`; the Fastify excerpt includes `getMeta`, justified by `pluginUtils.js:110`. These expose the missing source facts at lines 27 and 19 respectively. Every previous primary excerpt, supplemental window and per-window allocation receipt is unchanged. The other thirteen tasks retain their source-character counts and Markdown sizes; query-mode JSON adds the new limit metadata.

All 164 candidate excerpts, 237 literal match receipts, three new direct-call receipts and one source-reuse receipt were checked against pinned source. Existing reuse still saves 5,123 canonical characters. Fixed task judgments remain 31 TP, zero FP, zero missing required files and 24 unjudged task-file selections. Unjudged files are not proven relevant; these results do not establish repository-wide precision or complete task evidence beyond the fixed truth.

Reproduce with the unchanged harness and frozen indexed checkouts:

```sh
node benchmarks/mcp/task-retrieval.mjs --project /external/nest --manifest benchmarks/mcp/nest-module-init-tasks.json --product-root /external/baseline-05235 --repetitions 3 --output /external/evidence/module-init-before.json
node benchmarks/mcp/task-retrieval.mjs --project /external/nest --manifest benchmarks/mcp/nest-module-init-tasks.json --repetitions 3 --output /external/evidence/module-init-after.json
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-plugin-version-tasks.json --repetitions 3 --output /external/evidence/plugin-version-after.json
```

Run the other ten manifests on their matching corpus for the full fifteen-task comparison. External artifacts under `SymbolLattice-evidence-05236` include the preserved `baseline-05235`, all `*-baseline.json` / `*-candidate.json` reports, `verification.json` and archived retrieval/verification runners (commands `node .tmp/retrieval-05236.mjs baseline`, `node .tmp/retrieval-05236.mjs candidate`, `node .tmp/verify-05236.mjs`). The verifier checks unchanged query plans, existing source and allocations, and every new direct-call receipt. External corpora, indexes and generated reports are not committed.

The sequential baseline and candidate runs occurred in different sessions on September 21, 2026; their absolute times are not causal evidence of a speed change. A contemporaneous diagnostic therefore used one warmup per product and three alternating-order fresh-process pairs on five tasks, without concurrent tests, builds or indexing. Median process milliseconds, before → after: module-init 8,656 → 9,001; plugin metadata 4,175 → 3,878; validation 5,017 → 5,179; exact guard control 6,347 → 6,012; shutdown 7,259 → 7,294. The earlier shutdown increase from 3,937 to 7,323 ms did not reproduce as a comparable difference between products. These small samples do not establish a speedup, an SLO or performance on other workloads. First indexing, incremental sync and total agent task completion time/query count remain unmeasured. Samples, hardware metadata, product fingerprints and the runner are archived as `process-paired.json` / `process-timing-runner.mjs` (command `node .tmp/paired-process-05236.mjs`).

Build, TypeScript test typecheck and version consistency checks pass. After timing completed, the full suite passed 3,109 tests with four existing skips (300 passing files, one skipped); output is archived in `full-test.log`. Added cases cover exact directed call validation, duplicate calls, unavailable or already delivered source, exhausted window/character limits, preserved whole-file promotions, and use of indexed source when live files are stale. These contract tests complement the actual corpus checks above; unchanged parsers were not re-audited against compiler corpora.

### Bounded lexical reuse, v0.523.10

Callable-source matching now reuses token-to-query-group membership within one invocation, capped at 4,096 distinct spellings. Every occurrence still contributes its own frequency, and every receipt is built from its actual declaration, file and UTF-16 coordinates. The cache retains neither source receipts nor data across queries. Saturation falls back to ordinary matching. This is a patch optimization: query/source policies, output semantics, scoring and index compatibility are unchanged.

Validation used Fastify `https://github.com/fastify/fastify` at `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, Windows and Node v24.19.0. The v0.523.9 baseline is product commit `1b25d62`; baseline/candidate built-file SHA-256 values are `357e5ac5d8a4b35f3c3f9d771935516d1291e57ea7d18d21971ab1cdd9237f7c` / `06183d947ad650eae002a147af6011f3d43e05e93f2c55293a34461ebdc3306a`. Both query runs reused index generation `generation:961fba85-180e-40e9-b5e6-395486ac20d9` (338 files, 8,531 symbols, 18,938 edges); no reindexing was needed for this change.

An independent Espree 11.2.0 traversal supplied 7,599 function declaration/expression/arrow ranges from all 248 tracked `*.js` files. Three fixed concept groups covered request/validation/handler, plugin/dependency/register and serialize/response/schema. Complete matcher outputs, token frequencies, truncation flags and BM25 scores matched the baseline. All 7,813 emitted lexical receipts were checked against the pinned text. Baseline equality is a compatibility check, not independent proof of semantic relevance; the parser ranges and receipt checks are independent of product extraction. No new language coverage is claimed.

After one warmup per build, nine alternating-order pairs measured the complete matcher across those inputs. Median time fell from 2,915.50 to 716.92 ms (75.4% less). This isolated measurement excludes parsing, indexing, source retrieval, scoring, process startup and serialization; it is not a 75% improvement in whole-query latency. The bounded matcher still applies its existing 8,192-character declaration budget. All diagnostic inputs and outputs were compared outside the timed region.

The six existing Fastify task manifests are regression cases, not unseen validation. All 10/10 required task-file pairs and 25/25 specified source facts remained available (required-file FN 0). All query plans, focus evidence, connections, path spines, source allocations/windows and evidence paths were deeply equal; Markdown sizes were unchanged. The independent harness verified 77 excerpts and 124 lexical matches. Fixed task judgments were 12 TP, 0 FP and 10 unjudged selections: judged precision is 12/12 with judgment coverage 12/22, not overall precision. These results do not establish completeness beyond the fixed truth or test other languages and projects.

| Task | Median fresh-process ms, v0.523.9 → v0.523.10 |
| --- | --- |
| Multiple cookie headers | 3,131 → 3,026 |
| Error response status | 3,141 → 2,939 |
| Plugin dependencies | 3,008 → 2,901 |
| Plugin version metadata | 2,373 → 2,307 |
| Request validation | 3,101 → 2,960 |
| Serializer selection | 3,123 → 2,968 |

Each task/build used three sequential fresh CLI processes, alternating which build went first between tasks. These small-sample diagnostics include startup and freshness checks; they do not isolate causal end-to-end speedup or establish an SLO. First-index/incremental performance, memory peaks and agent completion time/query count were not measured. Timing completed before the full test suite.

Reproduce the task checks with the existing harness, repeating for all six `fastify-*-tasks.json` manifests:

```sh
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-retrieval-tasks.json --product-root /external/baseline-05239 --repetitions 3 --output /external/evidence/validation-before.json
node benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest benchmarks/mcp/fastify-retrieval-tasks.json --repetitions 3 --output /external/evidence/validation-after.json
```

Typecheck, build, version consistency and 107 focused tests passed. The complete sweep (`node node_modules/vitest/vitest.mjs run --maxWorkers 2`) reported 3,110 passed, one failed and four skipped: the installer-prefix test could not locate npm because directly invoking Vitest with the bundled Node executable omitted `npm_execpath`. Re-running that entire test file through the npm CLI (`npm test -- test/unit/github-source-install-contract.test.mjs`) passed all eight tests without code changes. Thus every non-skipped test passed across the sweep and targeted rerun; the initial full run itself was not green. New regressions check declaration-specific positions and counts, query isolation, spelling distinctions and cache saturation. This does not validate all languages on external corpora.

External artifacts are in `%TEMP%/SymbolLattice-evidence-052310`: the pinned corpus and baseline build, `lexical-paired.json`, all task reports, `retrieval-comparison.json`, `full-test.log`, and archived `lexical-052310.mjs` / `retrieval-052310.mjs` runners. The runners execute from this repository's ignored `.tmp/` directory with the external workspace at that path (`node .tmp/lexical-052310.mjs`, `node .tmp/retrieval-052310.mjs`). No external corpus, index or generated report is committed.

### Rank-independent directed path recovery, v0.523.11

The existing error-response task ranked `handleError` before `onSendEnd`. The planner only searched from the earlier rank to the later rank, omitting the actual `onSendEnd → sendStream → onErrorHook → handleError` chain. A regression test reproduced this before implementation. `explore-path-spines-v3` preserves the original 16 rank-ordered pair attempts and, only when that direction has no path, tries the opposite starting point. At most 16 reverse attempts are permitted, each with the existing four-hop/500-symbol limits. `maximumReversePairAttempts` and `reverseAttemptedPairCount` expose that extra work. Edges keep their actual direction and exact-resolution requirement; shared callers do not become paths between callees. Original traversal truncation remains disclosed even if recovery succeeds. This is a correction to existing path evidence, not a new resolver or runtime-flow analysis; no index rebuild is required.

An initial interleaving experiment spent the original 16 attempts on both directions and lost the request-validation source at `lib/handleRequest.js:85` (4/4 → 3/4 facts). Its reports remain under `failed-interleaving/`. The final implementation preserves the original forward attempts; a new regression protects a later forward pair. Neither the task questions nor truth were altered to hide the failure.

The baseline is v0.523.10 commit `470aff5`, built-file SHA-256 `06183d947ad650eae002a147af6011f3d43e05e93f2c55293a34461ebdc3306a`; final v0.523.11 SHA-256 is `964ec97b23b0f5d89d8212da8b42f53a261839cd098bfd49882202d1a118ab43`. Runs used Windows / Node v24.19.0 and the same Fastify repository, commit and index generation recorded in the preceding section. The six existing tasks are regression cases. `mcp/fastify-stream-error-tasks.json` fixes a new natural-language question and four manually checked source facts; neither product's output for this task was opened until the final implementation was frozen. It is held-out task validation on a known repository, not an unseen project. It becomes a regression case after this run.

All seven tasks preserve 12/12 required task-file pairs (FN 0), with 27/29 source facts before and after. The existing six tasks retain 25/25 facts. The new stream-failure task remains at 2/4: `lib/reply.js:640` and `:707` are still absent. This is a known evidence-selection gap, not a complete explanation of streamed failures. Final judgments are 15 TP, 0 FP and 11 unjudged selections: judged precision 15/15, judgment coverage 15/26. No repository-wide precision claim follows from incomplete judgments. The source verifier checks all 93 excerpts and 150 lexical receipts.

For the existing error-response task, the final result adds one three-edge directed path, from focus rank 2 to rank 1. Espree independently checks the call identifiers and owning/target declaration ranges at `lib/reply.js:640`, `:707`, and `:812`; the CommonJS receipt verifier checks the import at `reply.js:37` and export at `error-handler.js:175`. The raw call-site text was already delivered before this patch; the improvement is explicit connected evidence, not additional source-fact recall. Calls inside callbacks describe static source relationships and do not prove runtime execution order. This audit covers the three recovered hops, not all graph edges.

| Task | Median fresh-process ms, before → after | Markdown bytes, before → after |
| --- | --- | --- |
| Multiple cookie headers | 3,007 → 2,936 | 26,797 → 26,797 |
| Error response status | 3,087 → 2,917 | 38,059 → 38,691 |
| Plugin dependencies | 2,930 → 2,823 | 11,627 → 11,627 |
| Plugin version metadata | 2,393 → 2,356 | 2,637 → 2,637 |
| Request validation | 3,066 → 2,961 | 40,105 → 40,105 |
| Serializer selection | 3,044 → 3,014 | 41,893 → 41,893 |
| Stream failures (held out for this change) | 3,005 → 2,947 | 39,011 → 39,011 |

Three sequential fresh processes per task/build alternated which build went first between tasks. No tests, builds or indexing ran concurrently with these timings. These small samples do not establish a general speedup or SLO. An isolated planner diagnostic used the full fixed snapshot, a prebuilt graph view and baseline query selections, with two warmups and 25 alternating-order pairs. Median incremental planner cost ranged from 0.0006 to 0.1183 ms; the error-response task changed from 0.1003 to 0.1552 ms. This excludes retrieval, view construction, source allocation and startup, and does not use the bounded production bundle. First indexing, incremental sync, memory peaks, agent completion time and follow-up query count were not measured.

Typecheck, build and version consistency pass. The full `npm test -- --maxWorkers 2` sweep reported 3,114 passed, two failed and four skipped. Both failures were integration assertions for the old `explore-path-spines-v2` policy string. After updating those two expected versions, the complete service integration file passed all 382 tests (`npm test -- test/integration/application/service.test.ts`, archived in `service-rerun.log`). All non-skipped tests passed across the sweep and targeted rerun; the original full run was not green. New cases cover reversed ranking, common-caller rejection, forward-attempt preservation, recovery limits and retained traversal-truncation disclosure. Timing preceded all full-suite work.

Reproduce with `benchmarks/mcp/task-retrieval.mjs`, the same fixed indexed Fastify checkout and all seven `fastify-*-tasks.json` manifests, using `--product-root /external/baseline-052310` for the baseline and explicit external output paths, as in the preceding section. `%TEMP%/SymbolLattice-evidence-052311` contains the baseline build, final task reports, `retrieval-comparison.json`, `path-verification.json`, `planning-paired.json`, failed-experiment reports and `full-test.log`. Archived runners are `retrieval-052311.mjs`, `verify-path-052311.mjs` and `planning-052311.mjs`; run them from the repository's ignored `.tmp/` directory with `node .tmp/<runner>`. They use the corpus under `%TEMP%/SymbolLattice-evidence-052310/fastify`. External corpora and generated evidence remain outside product source.

### Query-relevant upstream source windows, v0.523.12

The stream-failure regression already contained exact impact paths but exhausted its eight supplemental source windows before showing `reply.js:640` and `:707`. Policy `explore-source-windows-v7` ranks existing bounded impact paths by identifier concept coverage, then prefers a proven call into the selected path's upstream entry. Matching an intermediate caller is sufficient. This relevance ranking is heuristic; it neither changes edge resolution nor proves runtime ordering. At most two impact windows may replace lower-ranked plain direct-call windows. Explicit connection, callee-body and path-spine evidence stays protected; equally or better ranked calls cannot be displaced. The eight-window, two-hop and total source-character limits remain unchanged. `replacedLowerRankedCallWindowCount` reports displacement, and truncation remains disclosed. No additional graph traversal or index rebuild is introduced. This is a patch correction to existing source selection.

An initial experiment admitted impact paths in focus-rank order and spent both slots on trailer-related calls. It retained previous facts but did not repair the stream question. Those outputs and the initial implementation remain in `first-attempt/`. The serialization-hook question was first held out, but its initial results were inspected before the final refinement, so it is now explicitly a regression sample. The header-write question was defined from pinned source after the final implementation froze and before either output was inspected; it is a held-out task on the same known project, not an unseen-project evaluation. No truth was adjusted to match output.

Validation used Windows, Node v24.19.0 and Fastify `https://github.com/fastify/fastify` at `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, reusing index generation `generation:961fba85-180e-40e9-b5e6-395486ac20d9`. Baseline v0.523.11 is commit `40dbadf`; baseline/candidate built-file SHA-256 values are `964ec97b23b0f5d89d8212da8b42f53a261839cd098bfd49882202d1a118ab43` / `6f7526e209e358855fbda9ca2fa079ad3dc0dcaccdca9b877c6226f94e889e97`.

Nine tasks retained 15/15 required task-file pairs (FN 0). Specified source facts increased from 32/36 to 35/36: stream failures 2/4 → 4/4, serialization-hook errors 2/4 → 3/4, and all other facts retained. The missing fact remains the pre-serialization guard at `lib/reply.js:488`; this is not complete evidence for every task. The new header-write task retained 3/3 facts. Judged results are 21 TP, 0 FP and 13 unjudged selections: judged precision 21/21 with judgment coverage 21/34, not overall precision. The harness independently checks 121 excerpts and 207 lexical receipts against pinned source. Query plans, connections, path spines and primary source allocations are deeply equal between builds.

For stream failures, Espree independently verifies four call identifiers and owning/target declaration ranges at `reply.js:640`, `:703`, `:707` and `:812`, including the cross-file CommonJS import/export receipt for `handleError`. These are static callback relationships, not runtime execution guarantees. The result retains eight supplemental windows, replacing two lower-ranked calls; emitted source drops from 23,709 to 23,366 characters and Markdown from 39,011 to 38,670 bytes while supplying both previously absent facts.

| Task | Median fresh-process ms, before → after |
| --- | --- |
| Multiple cookie headers | 3,084 → 3,011 |
| Error response status | 3,004 → 2,959 |
| Header-write errors (held out) | 3,104 → 3,016 |
| Plugin dependencies | 2,919 → 2,832 |
| Plugin version metadata | 2,393 → 2,341 |
| Request validation | 3,036 → 3,107 |
| Serialization-hook errors | 3,074 → 2,974 |
| Serializer selection | 3,087 → 2,984 |
| Stream failures | 3,086 → 2,959 |

Each build used three fresh processes per task, alternating which build ran first between tasks. No tests, builds or indexing ran concurrently. These diagnostics do not establish a general speedup or SLO. With fixed baseline inputs and source loaded outside timing, two warmups and 25 alternating-order pairs measured source-window planning. Median incremental cost ranged from 0.0006 to 0.3076 ms; stream planning changed from 0.9003 to 1.1365 ms. This excludes retrieval, source IO, allocation and startup. First indexing, incremental sync, memory peaks and total agent completion time/query count remain unmeasured.

Typecheck, build, version consistency and the complete `npm test -- --maxWorkers 2` run pass: 3,120 tests passed, four existing skips (300 passing files, one skipped). Regression cases cover full-window replacement, intermediate caller matching, protected connections, rank protection and concept-rich paths followed by their upstream entry. Existing invalid, heuristic, cyclic and unavailable-path cases remain covered. Tests ran after performance measurement.

Reproduce all nine `fastify-*-tasks.json` manifests through `benchmarks/mcp/task-retrieval.mjs` with the pinned indexed checkout and `--repetitions 3`, using `--product-root /external/baseline-052311` for baseline runs and explicit external output paths. `%TEMP%/SymbolLattice-evidence-052312` contains the baseline, task reports, `retrieval-comparison.json`, `upstream-verification.json`, `windows-paired.json`, first-attempt artifacts and test log. Archived runners `retrieval-052312.mjs`, `verify-upstream-052312.mjs` and `windows-paired-052312.mjs` run from the repository's ignored `.tmp/` directory and use the corpus under `%TEMP%/SymbolLattice-evidence-052310/fastify`. External corpora and generated evidence are not committed.

### Reusing bounded retrieval calculations, v0.523.13

CPU profiling identified repeated symbol-existence queries and candidate coverage calculations in bounded retrieval. Each hop now checks each distinct endpoint ID once while retaining every distinct edge receipt. Candidate sorting computes query coverage once per symbol within the current call; nothing is cached across requests or generations. Stable sorting, query policies, graph limits, freshness checks and source receipts are unchanged. This is a patch performance improvement; no schema migration or reindexing is required.

The paired experiment uses Windows / Node v24.19.0, v0.523.12 commit `e8c0097` as baseline, and the same pinned Fastify checkout and index generation as the preceding section. Nine existing task questions plus three controls (`Reply.send`, `lib/reply.js`, and a nonexistent identifier) each receive one untimed call per build and five alternating-order timed pairs. Complete bounded bundles are deeply compared outside timing, including ordering, source matches, diagnostics and truncation. All twelve inputs match. These are compatibility checks on a known corpus, not independent proof of every graph relationship or unseen-project relevance.

| Query | Median bounded retrieval ms, before → after |
| --- | --- |
| Multiple cookie headers | 729.61 → 697.88 |
| Error response status | 668.51 → 642.17 |
| Header-write errors | 733.69 → 709.26 |
| Plugin dependencies | 612.14 → 608.04 |
| Plugin version metadata | 206.51 → 204.25 |
| Request validation | 653.74 → 626.98 |
| Serialization-hook errors | 699.82 → 675.16 |
| Serializer selection | 690.64 → 665.30 |
| Stream failures | 672.85 → 645.85 |
| Qualified identifier | 473.25 → 456.75 |
| Nonexistent identifier | 49.57 → 48.60 |
| File path | 369.17 → 351.66 |

These timings cover the existing SQLite bounded-bundle method, including opening/reading the indexed store, seed retrieval and graph expansion. They exclude module startup, final query planning, freshness scanning and rendering; they are not whole-query speedup percentages. No tests, builds or indexing ran concurrently. First indexing, incremental sync, memory peaks and agent completion time/query count remain unmeasured.

The nine full CLI task results are deeply equal between builds, including source plans, receipts, graph evidence, status and diagnostics. Required file recall remains 15/15 and source facts 35/36; the known serialization guard gap remains. The independent source verifier checks 121 excerpts and 207 lexical receipts. Judged selections remain 21 TP, 0 FP, 13 unjudged (judged precision 21/21, judgment coverage 21/34); unknown judgments are not counted as correct or incorrect. Markdown sizes are unchanged. No additional language or relevance coverage is claimed.

Three fresh processes per task/build, with build-first order alternating between tasks, yielded these median full-process milliseconds: cookie headers 3,059 → 2,953; error status 3,032 → 2,910; header errors 3,062 → 3,008; plugin dependencies 2,924 → 2,867; version metadata 2,379 → 2,300; validation 3,121 → 2,932; serialization hooks 3,076 → 2,962; serializer selection 3,058 → 2,934; stream failures 3,044 → 2,941. These small samples include startup/freshness checks and are not a causal whole-query speedup estimate or SLO. The isolated paired measurements above better bound the changed operation's cost.

Typecheck, build, version consistency and full `npm test -- --maxWorkers 2` pass: 3,121 tests passed and four existing skips (300 passing files, one skipped). A new regression preserves 600 distinct calls sharing endpoints, a following graph hop, and the exact first ten receipts under a relationship cap. Existing ordering, query isolation, freshness, generation mismatch and bounded traversal tests also pass. The complete test run followed all performance measurements; its output is archived as `full-test.log`.

Baseline/candidate built-file SHA-256 values are `6f7526e209e358855fbda9ca2fa079ad3dc0dcaccdca9b877c6226f94e889e97` / `b4c9504349b830eb1ce9e5253e6ad93b397f2af4e2a161d20b6e5549c12da1c7`. Reproduce the nine manifests with `benchmarks/mcp/task-retrieval.mjs --project /external/fastify --manifest <manifest> --repetitions 3 --output <external-report>`, adding `--product-root /external/baseline-052312` for baseline runs. External workspace `%TEMP%/SymbolLattice-evidence-052313` contains the baseline, CPU profile, `query-profile.json`, `bundle-paired.json`, full task reports and `retrieval-comparison.json`. Archived runners `profile-query-052313.mjs`, `bundle-paired-052313.mjs` and `retrieval-052313.mjs` run from this repository's ignored `.tmp/` directory using `node .tmp/<runner>`; the corpus remains under `%TEMP%/SymbolLattice-evidence-052310/fastify`.

### Deferring default parser loading on read paths, v0.523.14

Main-thread service imports previously loaded the complete extraction entry point even for an indexed read. The default extractor now loads on the first operation that actually parses source, sharing the pending import across callers. Indexing, changed-file synchronization and immutable Git revision attribution await that load. Custom extractors keep their synchronous contract and version identity; framework plugin composition remains available at construction. Lua retains its existing worker path. Read-only workers retain their extraction restriction. This is a patch startup optimization with unchanged query policies, evidence semantics and index versions; it does not accelerate the parser's work or claim a warm MCP worker speedup.

Validation used Windows / Node v24.19.0, baseline v0.523.13 commit `fdcea9f`, and the same pinned Fastify checkout and index generation as above. Baseline/candidate built-file SHA-256 values are `b4c9504349b830eb1ce9e5253e6ad93b397f2af4e2a161d20b6e5549c12da1c7` / `fee9595ec19d66ee755082bcabab24cc493bab5f21c36e00c6ab6b2ead4156c9`. One untimed fresh process per build followed by seven alternating-order fresh-process pairs measured dynamic service-module import: median 891.69 → 157.91 ms. This excludes process startup, construction, indexing and query work; it is not a whole-query percentage.

All nine full CLI responses are deeply equal, including ranking, status, source windows, graph receipts and truncation. Required files remain 15/15 and source facts 35/36, with the known `reply.js:488` serialization guard gap unchanged. Independent checks cover 121 source excerpts and 207 lexical matches. Judgments remain 21 TP, 0 FP and 13 unjudged selections (judged precision 21/21; judgment coverage 21/34). These are known regression tasks, not unseen-project validation or a new graph precision audit.

| Task | Median fresh CLI process ms, before → after |
| --- | --- |
| Multiple cookie headers | 3,038 → 2,709 |
| Error response status | 2,986 → 2,634 |
| Header-write errors | 3,058 → 2,749 |
| Plugin dependencies | 2,871 → 2,589 |
| Plugin version metadata | 2,388 → 2,071 |
| Request validation | 3,070 → 2,716 |
| Serialization-hook errors | 3,096 → 2,717 |
| Serializer selection | 3,001 → 2,691 |
| Stream failures | 3,012 → 2,667 |

Each task/build used three fresh processes, alternating which build ran first between tasks. Timing completed before verification tests; no builds, tests or indexing ran concurrently. The measured 283–379 ms reduction is smaller than the isolated service import difference because the CLI has other module dependencies. These small samples do not establish an SLO or all-project speedup. First parser use pays the deferred import cost; first-index, incremental-sync, peak-memory and total agent completion performance were not measured.

Typecheck, build and version consistency pass. `npm run verify:mcp-worker-generation` passes: the same ready worker observes the synchronized generation with no crash or fallback. The complete `npm test -- --maxWorkers 2` sweep passes 3,122 tests with four existing skips (301 passing files, one skipped). A subsequent targeted run of both independent-process loader tests also passes, including the newly added cold Git-hunk entry point. An ESM loader hook verifies that construction, indexed reads and unchanged sync do not load the extraction entry point, while indexing and changed sync do. The cold Git test verifies both immutable source sides without graph or live-source access. Full-suite coverage includes existing custom extractor, framework plugin, Lua, Git-hunk and freshness behavior. Logs are `full-test.log` and `cold-entrypoints-test.log`.

Reproduce the nine manifests with the existing task harness, `--repetitions 3`, the pinned indexed corpus and explicit external report paths; use `--product-root /external/baseline-052313` for baseline runs. `%TEMP%/SymbolLattice-evidence-052314` archives the baseline, `import-paired.json`, all task reports and `retrieval-comparison.json`. Runners `import-paired-052314.mjs` and `retrieval-052314.mjs` execute from ignored `.tmp/` using the corpus under `%TEMP%/SymbolLattice-evidence-052310/fastify`. No corpus or generated report is committed.

### Preserving short upstream caller context, v0.523.15

The serialization-hook task contained both `handleError ← onErrorHook ← preSerializationHookEnd` and `onErrorHook ← preSerializationHookEnd ← preSerializationHook`. The latter focus ranked sixth, so its continuation could not replace a rank-five plain call window even after the rank-one path was selected. Policy `explore-source-windows-v8` lets a proven call into an admitted upstream entry inherit that path's admission rank. It retains the original focus rank and full edge attribution in output. For such continuations only, the selected source range includes the caller declaration when it is at most twenty lines (`maximumImpactCallerLines`); longer callers keep the existing local call-site range. This supplies nearby guards without expanding every caller body.

The eight-window, two-impact-window, two-hop-per-input-path and total character caps remain unchanged. There is no new graph traversal. Protected connection/callee/spine evidence remains protected, and an inherited rank cannot displace an equal or better ranked plain call. This is a patch correction to existing evidence selection, not a new resolver or callback execution analysis. No reindexing is required.

Windows / Node v24.19.0 runs used the same pinned Fastify repository and generation as above. Baseline v0.523.14 is commit `bfadfd4`; baseline/candidate built-file SHA-256 values are `fee9595ec19d66ee755082bcabab24cc493bab5f21c36e00c6ab6b2ead4156c9` / `f82e96257bfae6a0c8c1e8991b29087de7883168a00b85e3c669cbe41416b932`. Nine existing regression tasks retain 15/15 required files and improve from 35/36 to 36/36 specified facts. The serialization-hook task now supplies `reply.js:488` and reaches 4/4 facts; Markdown grows from 40,736 to 40,918 bytes within the existing source budget.

The new outgoing-hook question was fixed from pinned source after implementation froze and before inspecting either build's output. It is a held-out task on this known repository, not an unseen project. It retains both required files and 3/5 facts; `reply.js:544` and `:815` remain absent. Across all ten tasks, required files are 17/17 and specified facts increase 38/41 → 39/41, with no previously present fact lost. Judgments are 24 TP, 0 FP, 14 unjudged (judged precision 24/24, judgment coverage 24/38); this is not overall precision. Independent source checks cover 137 excerpts and 235 lexical matches. Query plans, connections, path spines and primary source allocations match the baseline.

Espree independently verifies call identifiers and owning/target declaration ranges at `reply.js:497`, `:503` and `:812`, including the CommonJS import/export receipt for `handleError`. The call at `:497` is in the no-hook `else` branch: it proves a static source dependency, not execution of the hook callback or a runtime error route through that branch. The added guard is verified against pinned source. The returned snippets provide source context without inventing a callback-resolution edge.

| Task | Median fresh CLI process ms, before → after |
| --- | --- |
| Multiple cookie headers | 2,723 → 2,711 |
| Error response status | 2,690 → 2,668 |
| Header-write errors | 2,761 → 2,749 |
| Outgoing-hook errors (held out) | 2,796 → 2,764 |
| Plugin dependencies | 2,620 → 2,554 |
| Plugin version metadata | 2,087 → 2,080 |
| Request validation | 2,741 → 2,701 |
| Serialization-hook errors | 2,777 → 2,751 |
| Serializer selection | 2,771 → 2,698 |
| Stream failures | 2,689 → 2,664 |

Each task/build used three fresh processes, with build-first order alternating between tasks. A separate fixed-input window-planner measurement used two warmups and 25 alternating-order pairs, with source loaded outside timing. Median differences ranged from -0.0378 to +0.0250 ms; the serialization task changed 1.3462 → 1.3309 ms. These small-sample diagnostics do not establish a speedup or SLO. Timing preceded full tests without concurrent builds or indexing. First indexing, incremental sync, memory peaks and total agent completion time/query count were not measured.

Typecheck, build, version consistency and complete `npm test -- --maxWorkers 2` pass: 3,125 tests passed, four existing skips (301 passing files, one skipped). New cases cover continuation from a lower-ranked focus within an exhausted window envelope, retained original edge/focus attribution, short caller context and the long-caller cap. Existing connection protection, rank protection, invalid/heuristic/cyclic path rejection and source-budget tests also pass. Full tests followed performance measurements.

Reproduce all ten `fastify-*-tasks.json` manifests with `benchmarks/mcp/task-retrieval.mjs`, `--repetitions 3` and external outputs; use `--product-root /external/baseline-052314` for baseline runs. `%TEMP%/SymbolLattice-evidence-052315` contains the baseline, task reports, `retrieval-comparison.json`, `upstream-verification.json`, `windows-paired.json` and test log. Archived runners `retrieval-052315.mjs`, `verify-upstream-052315.mjs` and `windows-paired-052315.mjs` run from ignored `.tmp/` using the corpus under `%TEMP%/SymbolLattice-evidence-052310/fastify`.

### Retaining path proof when source is clipped, v0.523.16

The outgoing-hook task selected `reply.js:801–820` for an exact path, but its 297-character allocation delivered only lines 801–809, before the supporting call. Policy `explore-source-windows-v9` shifts a clipped path-spine excerpt to retain complete in-window evidence lines, using the existing three-line preceding-context limit. It keeps multiple anchors together when they fit; otherwise it prioritizes the first complete fitting anchor. If no complete eligible anchor fits, prefix behavior is preserved. Whole-file promotions and non-spine excerpts retain their existing behavior. This uses already selected exact path edges, without another graph query.

The allocation and total budget do not change. Source identities use the actual delivered offsets; requested characters still describe the original requested window, and omission at either end sets `truncated: true`. Unspent allocation remains disclosed. This is a patch evidence-delivery correction, not a resolver or index-format change. The initial experiment preserved excessive leading context: it delivered the path call at `:812`, but still clipped the required full call at `:815`. Its build and reports remain in `first-attempt/`; the refinement uses the existing padding limit to preserve following context too. The initial wrapper's report formatter also assumed every query had a path-spine plan; the exact-symbol NestJS case exposed that assumption after its source checks completed. Raw reports were retained, and the wrapper now handles exact mode.

Both products use Windows / Node v24.19.0 and unchanged pinned corpora. Fastify is `https://github.com/fastify/fastify` at `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, with the existing generation recorded above. NestJS is `https://github.com/nestjs/nest` at `35c3ded6dbf3f23f917ae88d0ed966932788cae6`; a fresh baseline index contains 1,738 files, 17,431 symbols and 44,760 edges, generation `generation:cada865f-7e75-4f06-a8b8-c41dcfa59fc7`. Both builds reuse that same index. The rule was developed on Fastify; NestJS's seven existing fixed tasks provide cross-project regression validation, not an unseen-project or repository-wide quality estimate. No task truth was changed.

Across seventeen tasks, all 27/27 required task-file pairs remain available (FN 0), and specified source facts increase 60/62 → 61/62. Fastify's ten tasks improve 39/41 → 40/41; outgoing hooks improve 3/5 → 4/5 with `reply.js:815` now present, while `:544` remains absent. NestJS retains 21/21 facts and 10/10 required task-file pairs. Judged results total 37 TP, 0 FP and 26 unjudged selections (judged precision 37/37, judgment coverage 37/63). Independent source/range/hash checks cover 207 excerpts and 303 lexical matches. None of these limited judgments establish overall precision or complete runtime-flow understanding.

Query plans, connections, path spines and primary source allocations remain equal. The clipping audit verifies unchanged requested/allocated character budgets and render modes for all supplemental windows; exact-symbol results remain deeply equal. Only one source window changes: outgoing hooks now deliver `reply.js:809–820`, with 222 emitted characters from the unchanged 297-character allocation and original 508-character request. Leading omission remains marked as character-budget truncation, and the 75 unspent characters remain disclosed. Markdown decreases 40,711 → 40,647 bytes. The other sixteen tasks' source text and Markdown sizes are unchanged.

Three fresh CLI processes per task/build alternated which build ran first between manifests. Outgoing-hook median time is 2,755 → 2,716 ms. NestJS median milliseconds are: module initialization 4,569 → 4,625; constructor dependencies 5,247 → 5,158; known provider loader 4,645 → 4,489; provider creation 4,711 → 4,750; request pipes 5,311 → 5,321; shutdown listeners 5,359 → 5,223; exact guard body 4,441 → 4,390. These mixed small-sample changes do not establish a speedup or SLO. No tests, builds or indexing ran during final timings. Index creation was performed for setup; comparative first-index, incremental-sync, peak-memory and total agent completion performance were not measured.

Typecheck, build, version consistency and complete `npm test -- --maxWorkers 2` pass: 3,131 tests passed and four existing skips (302 passing files, one skipped). New cases cover complete evidence lines, nearby and distant anchors, following context, absent/oversized/outside-window anchors and UTF-16/CRLF boundaries. The actual-corpus clipping audit additionally verifies leading-omission truncation metadata and unchanged budgets. All performance comparisons completed before the full suite; its output is `full-test.log`.

Baseline v0.523.15 is commit `9fd7f3f`, built-file SHA-256 `f82e96257bfae6a0c8c1e8991b29087de7883168a00b85e3c669cbe41416b932`; candidate SHA-256 is `666aa9385d2efa2b06b4a6f847108407152d523ae55ceb4f12449fe0e24371e8`. Reproduce all `fastify-*-tasks.json` and `nest-*-tasks.json` manifests through `benchmarks/mcp/task-retrieval.mjs`, with the matching pinned indexed corpus, `--repetitions 3` and external output paths. Use `--product-root /external/baseline-052315` for the baseline. `%TEMP%/SymbolLattice-evidence-052316` archives the baseline, NestJS checkout/index, `first-attempt/`, final task reports, `retrieval-comparison.json`, `clipping-verification.json` and test log. Archived runners `retrieval-052316.mjs` and `verify-window-clipping-052316.mjs` execute from ignored `.tmp/`; Fastify remains under `%TEMP%/SymbolLattice-evidence-052310/fastify`.

### Reusing name case folding in multi-concept scans, v0.523.17

Repeated `lower(name)` and `lower(qualified_name)` evaluation was a measurable part of bounded candidate retrieval. Multi-concept scans now materialize those two SQLite expressions once per symbol in a statement-local CTE and reuse them for filtering and coverage ranking. Exact and single-concept queries retain their previous SQL path. Parameters, ordering, limits and SQLite's own case-folding semantics are unchanged; no persistent cache, schema migration or index rebuild is introduced. This is a patch performance correction with no new public contract. Materializing rows can consume temporary storage; peak memory and temporary I/O were not measured.

Validation uses the same pinned Fastify and NestJS repositories and index generations documented for v0.523.16, on Windows / Node v24.19.0. Baseline v0.523.16 is commit `0b219f0`. All seventeen existing tasks are regression cases for this change; their historical held-out labels do not imply unseen validation here. Truth manifests were not changed.

The preliminary SQL experiment used the constructor-dependencies and outgoing-hook questions, one warmup and seven alternating-order pairs per statement. All four returned ordered row arrays were deeply equal (256 rows each). Median statement execution changed 217.55 → 134.74 and 216.28 → 135.77 ms for NestJS, and 122.84 → 57.25 and 107.93 → 56.33 ms for Fastify. These isolate SQL execution with prepared statements reused and are not whole-query timings.

The production bounded-bundle comparison uses one untimed call per build and five alternating-order pairs per case, with full bundle equality checked outside timing. All seventeen tasks plus exact-name, missing-name and file-path controls retain complete results. Examples of median milliseconds: constructor dependencies 1,310.98 → 1,145.89; request pipes 1,413.49 → 1,227.24; shutdown listeners 1,497.64 → 1,261.11; outgoing-hook errors 687.95 → 574.23. Exact-name and file-path controls are approximately unchanged. These measurements include bounded retrieval, but exclude CLI startup and the service's source/freshness work.
End-to-end validation runs three fresh CLI processes per task/build, alternating build-first order between manifests. Complete JSON results are deeply equal, including ranking, paths, source text, budgets and truncation metadata. All 27/27 required task-file pairs and 61/62 specified facts are retained; the previously missing outgoing-hook fact at `reply.js:544` remains absent. Independent checks verify 207 excerpts and 303 lexical matches. Judged results are 37 TP, 0 FP, 0 FN and 26 unjudged selections: judged precision is 37/37, judgment coverage 37/63; these partial judgments do not establish overall precision.

| Task | Median fresh CLI process ms, before → after |
| --- | --- |
| Multiple cookie headers | 2,707 → 2,552 |
| Error response status | 2,682 → 2,585 |
| Header-write errors | 2,769 → 2,589 |
| Outgoing-hook errors | 2,747 → 2,603 |
| Plugin dependencies | 2,595 → 2,477 |
| Plugin version metadata | 2,078 → 2,055 |
| Request validation | 2,715 → 2,576 |
| Serialization-hook errors | 2,749 → 2,624 |
| Serializer selection | 2,721 → 2,616 |
| Stream failures | 2,689 → 2,581 |
| Module initialization | 4,637 → 4,602 |
| Constructor dependencies | 5,247 → 5,010 |
| Known provider loader | 4,538 → 4,542 |
| Provider creation | 4,805 → 4,769 |
| Request pipes | 5,330 → 5,183 |
| Shutdown listeners | 5,350 → 5,001 |
| Exact guard body | 4,541 → 4,450 |

Fresh-process timing includes startup, freshness checking and serialization. Small differences in unchanged query paths illustrate measurement variability; three samples are not an SLO or a universal speedup claim. No builds, tests or indexing ran during performance measurements. First-index, incremental-sync and total agent completion time/query counts were not measured.

Baseline/candidate built-file SHA-256 values are `666aa9385d2efa2b06b4a6f847108407152d523ae55ceb4f12449fe0e24371e8` / `61ae38f9a7177ac6085c9d4577f4f293e537135c0a651d5bc8e423258cb3c96b`. Reproduce all `fastify-*-tasks.json` and `nest-*-tasks.json` manifests with `benchmarks/mcp/task-retrieval.mjs`, the matching pinned indexed corpus, `--repetitions 3` and external output paths; use `--product-root /external/baseline-052316` for the baseline. `%TEMP%/SymbolLattice-evidence-052317` retains the baseline, raw reports, `retrieval-comparison.json`, `bundle-paired.json`, `casefold-experiment.json`, preliminary profiles and test log. Archived runners `retrieval-052317.mjs`, `bundle-paired-052317.mjs` and `casefold-experiment-052317.mjs` execute from ignored `.tmp/`. Fastify remains under `%TEMP%/SymbolLattice-evidence-052310/fastify`, and NestJS under `%TEMP%/SymbolLattice-evidence-052316/nest`.

Typecheck, build, version consistency and the full test suite pass: 3,132 tests passed, four existing skips (302 passing files, one skipped), using `npm test -- --maxWorkers 2` after all timings. The candidate-cap regression now covers both camel-case and uppercase names among 300 generic matches. Existing tests cover qualified names, dotted identifiers, source-only candidates, deterministic adjacency, receipt preservation, caps, generation mismatches and fallback behavior. Output is retained in `full-test.log`.

### Preserving continuations before compact caller tie breaks, v0.523.18

The outgoing-hook query already had exact `wrapOnSendEnd → onErrorHook → handleError` impact receipts, but only one replaceable source slot remained. Three paths tied on concept coverage and focus rank; file/line order selected an earlier serialization callback. Policy `explore-source-windows-v10` breaks those ties by first favoring entries with an available validated upstream continuation, then callers within the existing twenty-line bound when starting a new path. Compactness does not reorder continuations of an already admitted path. Already admitted continuations retain their existing higher priority. Query coverage and focus rank still precede these new tie breaks.

For newly selected compact callers, the planner may extend trailing context to the declaration end only when the existing window already begins at or before the caller. It does not prepend new context that could displace a late call under character clipping. Existing admitted-continuation context behavior remains. The call range must lie within the caller's line range for compact eligibility. All source still uses the fixed window and character envelopes; a compact declaration is not a promise that its entire body fits the delivered character allocation. No graph traversal, callback-dispatch inference, resolver change or index rebuild is introduced. This is a patch correction to existing evidence selection.

The first experiment favored compact callers without protecting potential continuations. It supplied the outgoing-hook fact but regressed the serialization-hook guard at `reply.js:488`, replacing its continuation with a short side branch. The harness rejected the change on lost source facts. Its build and partial reports remain in `first-attempt/`. The final rule protects such continuations before considering compactness, and the regression test includes a competing short side branch. A proposed expansion of clipping anchors was not retained; avoiding new leading context addresses the newly introduced clipping risk without changing existing clipping behavior.
The second experiment retained possible continuations but still preferred a compact Web Stream adapter over the existing stream branch while extending an admitted path, losing the required call at `reply.js:640`. Its partial reports and build remain in `second-attempt/`. Compactness now applies only to new paths; the continuation regression test contains both a competing compact entry and a compact alternative continuation. Neither failed experiment was committed or accepted by relaxing the fixed truth.

Final validation uses Windows / Node v24.19.0, baseline v0.523.17 (`beb3158`), and the same pinned Fastify and NestJS repositories and index generations documented for v0.523.16. These seventeen fixed tasks are regression cases, not unseen validation. The final run reran both builds after the two rejected experiments; an earlier interrupted run and its fingerprint-checked resumption are retained separately. The truth manifests were not changed.

Required task-file pairs remain 27/27, and specified source facts improve 61/62 → 62/62. Outgoing-hook errors improve 4/5 → 5/5 with `reply.js:544` now present; all previous facts are retained. Independent source checks cover 207 excerpts and 303 lexical matches. Judgments remain 37 TP, 0 FP, 0 FN and 26 unjudged selections (judged precision 37/37, judgment coverage 37/63). These partial judgments and selected facts do not establish repository-wide precision or complete runtime-flow understanding.

Independent Espree checks confirm the calls and declaration ranges at `reply.js:544` and `:812`, including the CommonJS import/export receipt for `handleError`. They also confirm `wrapOnSendEnd` is passed at `:535` and the non-null error guard is at `:543`. This verifies source syntax and attribution; passing a function argument alone does not prove runtime callback dispatch.

Query plans, connections, path spines and primary source allocations remain deeply equal. Fixed window limits and the 24,000-character total source envelope are preserved. Only two tasks change supplemental source: outgoing hooks replace lines 500–506 (133 characters) with the complete callback at 541–548 (153 characters, not truncated), while Markdown changes 40,647 → 40,656 bytes; NestJS constructor dependencies extend an existing selected caller from lines 165–171 to 165–186 (243 → 639 characters), with Markdown 31,655 → 32,111 bytes. The other fifteen tasks retain their supplemental source. The source audit and raw reports retain all budget and truncation metadata.

Each task/build uses three sequential fresh CLI processes, alternating build-first order between manifests. Median milliseconds before → after are:

| Task | Median fresh CLI process ms |
| --- | --- |
| Multiple cookie headers | 2,650 → 2,554 |
| Error response status | 2,697 → 2,554 |
| Header-write errors | 2,728 → 2,726 |
| Outgoing-hook errors | 2,661 → 2,598 |
| Plugin dependencies | 2,568 → 2,473 |
| Plugin version metadata | 2,089 → 2,024 |
| Request validation | 2,657 → 2,572 |
| Serialization-hook errors | 2,638 → 2,578 |
| Serializer selection | 2,642 → 2,617 |
| Stream failures | 2,609 → 2,545 |
| Module initialization | 4,807 → 4,822 |
| Constructor dependencies | 5,004 → 5,078 |
| Known provider loader | 4,567 → 4,607 |
| Provider creation | 4,885 → 4,918 |
| Request pipes | 5,088 → 5,090 |
| Shutdown listeners | 5,116 → 5,008 |
| Exact guard body | 4,393 → 4,480 |

A separate fixed-input planner comparison covers the sixteen query-mode tasks (the exact-symbol case has no window plan), with source loaded outside timing, two warmups and 25 alternating-order pairs. Median differences range from -0.116 to +0.074 ms; outgoing hooks change 0.9334 → 0.9274 ms. Full CLI differences are mixed and include startup, freshness checks and serialization; these small samples do not establish a speedup or SLO. No tests, builds or indexing ran during final timing. First-index, incremental-sync, peak-memory and total agent completion time/query counts were not measured.

Baseline/candidate built-file SHA-256 values are `61ae38f9a7177ac6085c9d4577f4f293e537135c0a651d5bc8e423258cb3c96b` / `226ca19d0b1230e37e02e60082fd6174368822972ab227fa071233bd700d9b5a`. Reproduce the seventeen tasks with `benchmarks/mcp/task-retrieval.mjs`, matching pinned indexed corpora, `--repetitions 3`, external outputs and `--product-root /external/baseline-052317` for baseline runs. `%TEMP%/SymbolLattice-evidence-052318` retains the baseline, rejected `first-attempt/` and `second-attempt/`, final task reports, `retrieval-comparison.json`, `windows-paired.json`, `upstream-verification.json`, `window-audit.json` and test logs. Archived runners `retrieval-052318.mjs`, `windows-paired-052318.mjs`, `verify-upstream-052318.mjs` and `audit-windows-052318.mjs` execute from ignored `.tmp/`; the retrieval runner defaults to fresh measurements. Corpora remain under `%TEMP%/SymbolLattice-evidence-052310/fastify` and `%TEMP%/SymbolLattice-evidence-052316/nest`.
Typecheck, build, version consistency and complete `npm test -- --maxWorkers 2` pass: 3,135 tests passed, four existing skips (302 passing files, one skipped). Added cases cover the twenty-line eligibility boundary, stable ordering under reversed inputs, and preserving late calls without new leading padding. Existing continuation cases now include compact competing entries and compact alternate continuations; protected evidence, rank protection, malformed/heuristic paths, budgets and source freshness remain covered. Targeted tests passed before final timing; the full suite ran afterward, with output in `full-test.log`.

### Reusing the CLI's scoped freshness admission, v0.523.19

The CLI's strict coordinator already verifies freshness before and after a live read, but discarded the admission receipt when invoking the query. The default service therefore performed another full content/configuration check while constructing query status. The CLI now passes the coordinator-issued receipt through a per-program `AsyncLocalStorage` scope into the existing service receipt interface. The query reuses only the admitted project's matching generation; before/after observations remain outside that scope. Independent commands and later reads do not inherit it, and post-query changes still prevent result publication. Injected-service behavior is unchanged. This is a patch performance correction, with no schema, public query or index compatibility change.

The targeted integration test checks two full verifications per live read across successive commands, generation-bound bounded retrieval, and a separate status command that performs its own verification. Another test changes source after query admission and checks that the postcheck blocks output. Existing stale-before-read and coordinator retry/lease tests also pass.

Earlier read-only experiments tried merging bidirectional edge queries, excluding already returned directions, and deferring edge-evidence hydration. They retained complete bundles on the two diagnostic queries, but had mixed or worse timings: merged queries changed NestJS 1,170.73 → 1,189.68 ms and Fastify 588.49 → 607.57 ms; deferred hydration improved NestJS about 55–65 ms but increased Fastify about 7–9 ms. None of those SQL experiments changed production code. Their runners, CPU profile and raw samples are retained externally; they are not evidence of a shipped optimization.
Windows / Node v24.19.0 comparisons use baseline v0.523.18 (`eeedbdd`) and the same pinned Fastify and NestJS repositories and active index generations recorded for v0.523.16. All seventeen fixed tasks are regression cases. Each task/build uses three fresh CLI processes, with build-first order alternating between manifests. The final comparison asserts deep equality of complete JSON results, not only recall scores.

All 27/27 required task-file pairs and 62/62 specified source facts are retained. Ranking, relationships, source text, truncation metadata and Markdown sizes are unchanged. Independent checks verify 207 excerpts and 303 lexical matches. Judged selections remain 37 TP, 0 FP, 0 FN and 26 unjudged: judged precision is 37/37 with judgment coverage 37/63, not repository-wide precision. No truth manifest changed.

| Task | Median fresh CLI process ms, before → after |
| --- | --- |
| Multiple cookie headers | 2,615 → 2,508 |
| Error response status | 2,696 → 2,497 |
| Header-write errors | 2,679 → 2,547 |
| Outgoing-hook errors | 2,674 → 2,540 |
| Plugin dependencies | 2,615 → 2,466 |
| Plugin version metadata | 2,148 → 2,004 |
| Request validation | 2,715 → 2,579 |
| Serialization-hook errors | 2,738 → 2,579 |
| Serializer selection | 2,706 → 2,560 |
| Stream failures | 2,656 → 2,509 |
| Module initialization | 4,771 → 4,061 |
| Constructor dependencies | 5,230 → 4,404 |
| Known provider loader | 4,710 → 3,912 |
| Provider creation | 4,735 → 4,229 |
| Request pipes | 5,331 → 4,614 |
| Shutdown listeners | 5,217 → 4,552 |
| Exact guard body | 4,539 → 3,890 |

The measured median reduction is 107–199 ms on these Fastify tasks and 505–826 ms on these NestJS tasks. Times include process startup, the remaining before/after freshness checks, retrieval and serialization. Three samples per task/build do not establish an SLO or universal speedup. This change targets CLI reads; MCP worker performance was not measured. First-index, incremental-sync, peak-memory and total agent completion time/query counts were not measured. No builds, tests or indexing ran during the final comparison.

Baseline/candidate built-file SHA-256 values are `226ca19d0b1230e37e02e60082fd6174368822972ab227fa071233bd700d9b5a` / `31c0fac2d00e85d2b568af2ef11af87ab175b2ff1b1b9179a9e45e18ecccd8aa`. Reproduce the seventeen `fastify-*-tasks.json` and `nest-*-tasks.json` tasks with `benchmarks/mcp/task-retrieval.mjs`, the matching pinned indexed corpus, `--repetitions 3` and external outputs; use `--product-root /external/baseline-052318` for baseline runs. `%TEMP%/SymbolLattice-evidence-052319` retains the baseline, raw reports, `retrieval-comparison.json`, profiles, rejected SQL experiments and test logs. Archived `retrieval-052319.mjs` runs from ignored `.tmp/`, using corpora under `%TEMP%/SymbolLattice-evidence-052310/fastify` and `%TEMP%/SymbolLattice-evidence-052316/nest`.
Typecheck, build, version consistency and complete `npm test -- --maxWorkers 2` pass: 3,138 tests passed, four existing skips (302 passing files, one skipped). The new integration cases cover admission reuse and scope cleanup, post-admission source changes that block publication, and an external writer replacing the generation so the CLI must obtain a new admission and retry before emitting a single fresh result. The initial targeted freshness tests passed before timing; the full suite ran afterward. Logs are `targeted-test.log` and `full-test.log`.
