# Native symbol row reads, v0.547.1

Bounded retrieval spends time creating named SQLite symbol rows before ranking and mapping them to public nodes. The three bounded symbol reads now request native array rows when available and map their eleven scalar columns in JavaScript: direct/file-scoped seeds, source-ranked declaration batches, and ID-based reads. The feature-detected object path remains available. This is an internal performance patch; the CLI/MCP parameters, response policies, Node requirements, schema, extractor v435, resolver v210 and index compatibility retain their existing contracts.

SQL predicates, projection order, bound values, sorting, source and symbol caps, traversal, generation fencing and source evidence continue through the same statements. Every matching row still participates in the same read. Array conversion changes how rows are constructed, rather than suppressing source or graph work. Filesystem discovery and full-content freshness hashing retain the existing implementation.

## Decision and rejected experiment

The external diagnostic profile ran the released v0.547.0 product on PostgreSQL version, Nest shutdown and Fastify cookie questions. Each result matched accepted source-verified QA. Its native SQL timing and CPU samples identified row reads as a material cost; Django freshness also spent approximately 330–340 ms on discovery and 253–259 ms on full source hashing. Profiling adds overhead and is diagnostic, not a release latency estimate.

A separate external prototype replaced the fixed 32-file hashing batches with 32 continuously refilled slots. Two warmup pairs and eight alternating measured pairs per corpus retained deeply equal complete freshness receipts, but the prototype was slower on all four projects. The current batch scheduling is retained. Standard medians, milliseconds:

| Corpus | Current freshness | Worker prototype | Current source hash | Prototype source hash |
| --- | ---: | ---: | ---: | ---: |
| django | 530.68 | 583.49 | 233.33 | 280.72 |
| nest | 222.52 | 243.93 | 96.11 | 118.17 |
| fastify | 44.16 | 49.01 | 27.23 | 31.50 |
| express | 25.90 | 27.45 | 12.11 | 14.17 |

The native symbol-row prototype then preserved complete responses, compiled MCP text and symbol-row parameter/row counts on three fixed queries. Its 12 balanced rounds reduced seed-retrieval medians by approximately 4–8%. It is retained separately from the final TypeScript implementation and final built-product acceptance.

## Fixed source truth and final correctness

The four corpora retain their pinned commits and tracked source state:

| Corpus | Commit |
| --- | --- |
| [django](https://github.com/django/django) | `bc833e8883db4a333a6485d91637b78c85e2b13b` |
| [nest](https://github.com/nestjs/nest) | `35c3ded6dbf3f23f917ae88d0ed966932788cae6` |
| [fastify](https://github.com/fastify/fastify) | `70b14e92c0b55e8201f5530ba2e6bab4e928c784` |
| [express](https://github.com/expressjs/express) | `7ef98448f8b38099ab1ded55e458538ad47a51e7` |

Django, Nest and Fastify read the existing external `SymbolLattice-v5430-indexes/<name>/index.sqlite`; Express reads its checkout's existing `.SymbolLattice/index.sqlite`. Untracked index directories remain in those checkouts. Source truth, query wording and scoring manifests are unchanged, including the final PostgreSQL truth-method clarification from v0.547.0. The fixed questions include previously used development and verification cases; this batch adds no unseen corpus.

The actual final v0.547.1 build is frozen separately. All 762 copied package/dist files match the workspace build; only the exact database-routing function differs to select the four fixed read-only indexes. Restoring that function reproduces the workspace file byte-for-byte. This routing override is outside product source. All four main SQLite files retain their recorded SHA-256 identities after QA and timing.

All 36 manifests / 51 tasks retain deeply equal complete structured responses and identical compiled MCP text against the accepted v0.547.0 outputs. Independent pinned-source checks retain 79/79 required file-task instances, 222/222 specified source facts and 1114 displayed query-term facts across 982 location groups. Existing joint-coverage source checks also run through the retrieval verifier. The partial file-task judgments remain 99 TP / 0 FP / 0 FN / 87 unjudged. Unjudged paths are outside the fixed positive/negative truth; these figures do not establish overall result precision, all-language coverage or arbitrary task completeness. File counts sum task/path instances rather than distinct repository files.

Typecheck and build pass. The 53 SQLite integration tests pass on Windows Node.js 24.19.0 and the supported lower boundary 22.16.0, including a new regression for Unicode qualified names, function/method kinds, distinct stored coordinates, export flags, declaration ordinals and source receipts across the 16-file source batch. Existing tests exercise more than 900 IDs, bidirectional edges, bounds, generation changes and the object fallback. The complete Node.js 24 suite passes: 3,436 tests and four existing skips, 322 passing files and one skipped file.

## Final whole-call comparison

Windows / Node.js 24.19.0 uses persistent read-only readers, the same fixed indexes, three warmups per build and 12 balanced rounds per query (ABBA repeated). Every timed response equals its accepted source-verified QA and every compiled text equals the corresponding baseline text. Functional QA and tests finished before timing; this audit launches no concurrent tests, builds, indexing or validation during measurement.

The wrapper captures each bounded symbol, source-operation symbol and directional edge `all()` read. After the stopwatch stops, it hashes the SQL and actual bound arguments and records row counts; each round compares those identities between builds. Every captured read retains the same SQL, bound arguments and row count. Nonempty optimized symbol reads change from native objects to native arrays; the existing source-operation read retains its object mode. Edge reads retain their existing array mode. This trace does not enumerate every SQLite `get()` or uncaptured SQL operation.

Whole-call milliseconds include the service call and compiled MCP text rendering; seed retrieval is a measured stage within that call. Upper medians (the upper middle of 12 samples):

| Fixed query | v0.547.0 total | v0.547.1 total | Reduction | v0.547.0 seeds | v0.547.1 seeds |
| --- | ---: | ---: | ---: | ---: | ---: |
| postgresql | 1127.35 | 1074.86 | 4.66% | 473.90 | 433.24 |
| mysql | 1178.48 | 1166.20 | 1.04% | 495.68 | 476.31 |
| fastify-cookie | 368.44 | 346.66 | 5.91% | 248.28 | 230.58 |
| nest-shutdown | 819.99 | 805.78 | 1.73% | 479.21 | 462.89 |
| fastify-plugin | 336.93 | 319.79 | 5.09% | 223.51 | 206.55 |
| fastify-serializer | 375.43 | 348.19 | 7.26% | 245.68 | 221.06 |
| express-object-links | 177.87 | 169.96 | 4.45% | 106.89 | 102.16 |
| fastify-request-prototypes | 390.62 | 361.34 | 7.50% | 257.00 | 232.33 |
| fastify-response-prototypes | 385.44 | 369.13 | 4.23% | 259.49 | 238.82 |
| password-hash-upgrade | 1144.56 | 1104.23 | 3.52% | 490.29 | 468.08 |
| sqlite-information | 1176.65 | 1152.59 | 2.04% | 526.21 | 501.34 |
| traceback-information | 1177.80 | 1169.94 | 0.67% | 529.75 | 510.09 |
| client-error-log | 393.86 | 375.80 | 4.58% | 262.08 | 247.57 |
| serialization-hook-errors | 389.37 | 371.75 | 4.53% | 251.54 | 234.83 |
| response-hook-upstream-guard | 412.37 | 386.89 | 6.18% | 266.54 | 245.13 |
| postgis-verification | 1107.62 | 1095.26 | 1.12% | 474.43 | 450.51 |
| diagnostic-verification | 1198.47 | 1189.47 | 0.75% | 555.75 | 538.28 |
| schema-execution-verification | 1040.46 | 1021.81 | 1.79% | 391.76 | 373.16 |

All 18 sampled whole-call medians are 0.67–7.50% lower; seed medians are 3.14–10.02% lower. The 432 timed responses/texts retain the accepted complete outputs, including all source budgets and omitted evidence. Response and text byte counts are unchanged for every case. These fixed-case measurements do not establish universal speed improvement, statistical significance, a latency SLO or a peak-memory bound. First indexing, incremental sync, process startup and total Agent task time/query count were not compared.

## Reproduction and retained artifacts

Build each product with its normal checked-out version. Put frozen products, corpora, indexes and output outside the product checkout, following [benchmark storage rules](../README.md). On the pinned indexed checkout, verify each unchanged manifest with:

`node benchmarks/mcp/task-retrieval.mjs --project <checkout> --manifest benchmarks/mcp/<manifest>-tasks.json --product-root <built-product> --repetitions 1 --output <external-report.json>`

Compare a fixed query with:

`node benchmarks/mcp/paired-explore.mjs --project <checkout> --baseline-root <v0.547.0-built-root> --candidate-root <v0.547.1-built-root> --query "<unchanged-question>" --pairs 12 --persistent-reader --comparison complete --output <external-timing.json>`

The archived driver includes the exact 18 task/manifest references, ABBA order, compiled text and SQL/argument/row-mode checks: `%TEMP%/SymbolLattice-v5471-final-paired.mjs`. Accepted output and independent evidence are in `SymbolLattice-v5471-final-retrieval/`; frozen products and fingerprints are `SymbolLattice-v5470-final-candidate`, `SymbolLattice-v5471-final-candidate` and `SymbolLattice-v5471-final-build-identity.json`. Full samples are `SymbolLattice-v5471-final-paired.json`; functional logs are `SymbolLattice-v5471-full-test.log` and `SymbolLattice-v5471-node22-graph-store-test.log`.

The diagnostic profiles remain under `SymbolLattice-v5470-speed-*`. The rejected hashing prototype, four complete-receipt comparisons and exact runner remain under `SymbolLattice-v5471-fingerprint-worker-trial*`. The separate symbol-row prototype and its complete three-query comparisons remain under `SymbolLattice-v5471-symbol-array-trial*`. The final retrieval runner reconstructs frozen-file identity and verifies unchanged corpus commits, manifests and index hashes. Large artifacts are outside the repository.
