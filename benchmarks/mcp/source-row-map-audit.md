# Bounded source row maps, v0.548.1

This compatible patch reads file paths and generation IDs from small SQLite
row-address tables during bounded source-seed lookup. The original FTS table
still supplies `MATCH` and `bm25`; its historical statistics, role priority,
tie order, limits, source windows and relationship evidence remain unchanged.
Public source-search scores retain their existing historical FTS read.

The [implementation](../../src/infrastructure/sqlite/graph-store.ts) installs
`source_search_rows` and `active_source_search_rows` on writable initialization.
Writes capture the actual FTS insert row ID in the same transaction; source
document deletion cascades to the maps. Active-projection refresh invalidates
the old addresses before rebuilding. Missing tables or a mismatched generation
marker retain the old read path. Initialization repairs missing or incomplete
maps; source extraction, resolver and source-search policy versions are unchanged.

Run `SymbolLattice sync .` after upgrading from v0.548.0. With unchanged source
and configuration this adds the maps without a new graph generation. Read-only
indexes remain usable before that step. The schema marker remains v4, and the
existing legacy-reader/writer compatibility tests pass.

## Fixed inputs and installation

Windows x64, Node.js v24.19.0, SQLite 3.53.3. Both products use the same original
checkout; candidate indexes are separate copies with identical generation IDs.
The baseline is the frozen v0.548.0 release build. The v0.548.1 snapshot hashes
762 build files; its only runtime modification redirects index paths to those
external copies. Original index hashes are checked before and after validation
and both timing runs.

| Repository | Fixed commit | Source-search generations | Historical / active map rows |
| --- | --- | ---: | ---: |
| [Django](https://github.com/django/django) | `bc833e8883db4a333a6485d91637b78c85e2b13b` | 2 | 6,732 / 0 |
| [Nest](https://github.com/nestjs/nest) | `35c3ded6dbf3f23f917ae88d0ed966932788cae6` | 2 | 3,476 / 0 |
| [Fastify](https://github.com/fastify/fastify) | `70b14e92c0b55e8201f5530ba2e6bab4e928c784` | 2 | 676 / 0 |
| [Express](https://github.com/expressjs/express) | `7ef98448f8b38099ab1ded55e458538ad47a51e7` | 2 | 316 / 0 |
| [Flask](https://github.com/pallets/flask) | `d73fa1cdcbd8b1465c151db8924ba58b1dd14e35` | 3 | 336 / 112 |

Independent SQLite `EXCEPT` comparisons in both directions check every map
row against the original FTS row ID, generation and path joined to indexed
source documents. All five copies have zero missing or extra addresses and
pass `foreign_key_check`. Initialization preserves the active generation and
the number of source-search generations.

| Case | One writable initialization, ms | Index growth, bytes |
| --- | ---: | ---: |
| Django | 411.707 | 1,110,016 |
| Nest | 135.505 | 618,496 |
| Fastify | 203.590 | 122,880 |
| Express | 93.234 | 65,536 |
| Flask | 126.615 | 90,112 |

These single installation observations include existing initialization work;
they do not isolate map construction or compare first indexing. An actual CLI
`sync` on the unchanged Fastify copy retains its generation and takes the
freshness fast path before scanning/extraction. `lastIndexWork` still describes
the previous indexing operation, not extraction in this no-op sync.

## Evidence preservation

All 54 fixed tasks in 37 manifests return complete JSON and compiled MCP text
exactly equal to v0.548.0 on the same generations. Source and graph receipts
are checked by the existing retrieval verifier. Displayed lexical evidence
passes 1,204 term checks in 1,063 citation groups.

The prior 51 tasks retain 79/79 required file-task instances and 222/222 source
facts. Flask retains 6/6 required file-task instances and 20/38 facts; its
18 missing facts remain failures for further evidence work. Exact equality
and these partial judgments do not establish overall precision, complete
retrieval acceptance or runtime dispatch.

`npm run check`, `npm run build` and the full `npm test` pass: 3,463 tests pass
with four existing skips. The SQLite file has 58 passing tests, including one,
two, three and six generation cases, stable ranking through fallback/repair,
pruning, stale markers and rollback after a map-write failure.

## Query cost

The existing paired tool uses persistent readers, one warmup per product and
alternating product order. Complete response equality is required. No other
heavy validation jobs run during either round. Whole-service query upper
medians include source freshness checks, but exclude CLI startup, transport
and subsequent Agent work.

| Fixed question | v0.548.0 ms | v0.548.1 ms | Change, 12 pairs |
| --- | ---: | ---: | ---: |
| Django temporary connection | 1230.637 | 1144.117 | -7.03% |
| Nest constructor dependencies | 828.771 | 812.669 | -1.94% |
| Fastify error response | 387.526 | 375.093 | -3.21% |
| Express response | 175.494 | 169.456 | -3.44% |
| Flask handler priority | 241.851 | 232.824 | -3.73% |
| Flask propagation | 239.710 | 237.086 | -1.09% |
| Flask URL building | 203.827 | 203.065 | -0.37% |

Before a 24-pair follow-up, one case per corpus is fixed: the prior upgrade
slowdown cases, Nest's small gain, and Flask URL building's smallest gain.
All initial and follow-up samples are retained: 408 timed calls in total.

| Follow-up case | v0.548.0 ms | v0.548.1 ms | Change, 24 pairs |
| --- | ---: | ---: | ---: |
| Django temporary connection | 1201.475 | 1081.763 | -9.96% |
| Nest constructor dependencies | 818.112 | 803.307 | -1.81% |
| Fastify error response | 380.644 | 364.545 | -4.23% |
| Express response | 171.181 | 167.633 | -2.07% |
| Flask URL building | 203.288 | 202.833 | -0.22% |

Django seed retrieval falls from 548.960 to 436.449 ms in the follow-up.
Freshness still contributes substantial cost. These are fixed warm queries,
not a universal speedup, significance test or SLO. In particular, Flask URL's
small difference is insufficient evidence of meaningful acceleration. First
indexing, changed-source incremental writes, cold CLI time and total Agent
task time are not compared in this batch.

## Reproduction and retained artifacts

Run the unchanged manifests with `benchmarks/mcp/task-retrieval.mjs --project
<pinned-checkout> --manifest <fixed-manifest> --product-root <built-product>
--repetitions 1 --output <external-report.json>`. Use
`benchmarks/mcp/paired-explore.mjs --project <pinned-checkout> --baseline-root
<v0.548.0-build> --candidate-root <v0.548.1-build> --query <unchanged-question>
--pairs 12 --persistent-reader --comparison complete --output <external.json>`;
the follow-up uses `--pairs 24` with its retained selection.

Corpora, products, index copies, runners and reports stay outside the repository
under `%TEMP%/SymbolLattice-v5481-*`; original corpus paths are recorded in
`build-identity.json`. `validate.mjs`, `retrieval/summary.json`,
`map-upgrades.json`, `timing.mjs`, `timing/summary.json`,
`timing-followup.mjs`, `timing-followup/selection.json` and its `summary.json`
retain the build hashes, every query and timing sample. `full-test.log` retains
the test summary. `noop-sync.json` and `noop-sync-contract-check.json` retain
the CLI response and corrected interpretation of its previous-work record.
Two diagnostic runners were cancelled because instrumentation appended to
their iterated capture array; `row-map-runner-repair.json` records that error.
The corrected SQL-only probe is `row-map-fixed-probe.json`; its isolated
timings are not included in the whole-query tables above.
