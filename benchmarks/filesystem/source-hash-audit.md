# Resident source hashing, v0.547.2

Already resident source text and byte views now use Node's one-shot SHA-256 API within explicit size bounds. Text longer than 1,048,576 UTF-16 code units and byte views longer than 5,000,000 bytes retain the incremental implementation. Full-content file streams retain their existing incremental hashing. The change reduces helper overhead while preserving the full SHA-256 identity; it does not skip content verification or substitute timestamps for content. This compatible internal performance change warrants a patch release.

The [official Node.js crypto documentation](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptohashalgorithm-data-outputencoding) describes UTF-8 string input, raw typed-array input and the small resident-input use case. The text cap keeps the maximum encoded size below the byte cap. The supported Node.js 22.16.0 boundary was checked directly and through the filesystem tests; the runtime requirement remains `>=22.16 <23 || >=24 <25`.

Discovery, read scheduling, concurrency, buffered reads, streaming paths, BOM/invalid-UTF-8 decoding, file classification, error handling and configuration verification retain their existing behavior. CLI/MCP contracts, source coordinates and budgets, generation checks, index compatibility, extractor v435 and resolver v210 remain unchanged. No index migration is required.

## Fixed sources and product identity

Windows / Node.js 24.19.0 compares the released v0.547.1 build with the actual final v0.547.2 build on these unchanged external checkouts:

| Corpus | Pinned commit | Indexed files |
| --- | --- | ---: |
| [Django](https://github.com/django/django) | `bc833e8883db4a333a6485d91637b78c85e2b13b` | 3,366 |
| [Nest](https://github.com/nestjs/nest) | `35c3ded6dbf3f23f917ae88d0ed966932788cae6` | 1,738 |
| [Fastify](https://github.com/fastify/fastify) | `70b14e92c0b55e8201f5530ba2e6bab4e928c784` | 338 |
| [Express](https://github.com/expressjs/express) | `7ef98448f8b38099ab1ded55e458538ad47a51e7` | 158 |

Django, Nest and Fastify remain under `%TEMP%/SymbolLattice-v5390-inherited-source-corpora/` and use `SymbolLattice-v5430-indexes/<name>/index.sqlite`. Express remains in `SymbolLattice-v5444-heldout-express` and uses its `.SymbolLattice/index.sqlite`. Tracked source files are unchanged; untracked index directories remain. These are previously used corpora and fixed questions, not new unseen validation samples.

The final frozen candidate copies 762 package/dist files. All match the workspace build except the exact `databasePathFor` function used to route to the four fixed read-only indexes. Restoring that function reproduces the complete workspace file byte-for-byte. The override is outside product source. All four main SQLite files retain their recorded SHA-256 identities after validation and timing.

## Correctness and source evidence

The two new regressions cover standard empty/abc SHA-256 vectors, Unicode, leading and embedded BOM characters, lone UTF-16 surrogates and both sides of the text cap. Raw Shell/Lua input checks use offset byte views containing BOM and invalid UTF-8 bytes at buffered-read and one-shot boundaries, including 5,000,001 bytes. Digests must match native incremental SHA-256 over the actual view, excluding unused backing-buffer bytes. Existing discovery and freshness tests retain streaming, decoding, permissions, admission and generation coverage.

Typecheck and build pass. The focused filesystem/strict-freshness checks pass 84 tests in eight files; the four filesystem files pass 71 tests on Node.js 22.16.0. The complete Node.js 24 suite passes 3,438 tests with four existing skips, 322 passing files and one skipped file.

All 36 unchanged manifests / 51 tasks retain deeply equal complete structured responses and identical compiled MCP text against accepted v0.547.1 results. Independent pinned-source checks retain 79/79 required file-task instances, 222/222 specified facts and 1,114 displayed term facts in 982 citation groups. Joint-source coverage checks also run. Partial judgments remain 99 TP / 0 FP / 0 FN / 87 unjudged. Counts are task/path instances; unjudged results are outside fixed positive/negative truth. Overall precision, arbitrary task completeness and new retrieval-quality gains are not established by this batch.

## Resident helper replay

The final compiled crypto import, constants and both hash function bodies are extracted without body changes into separate external modules. No replay module is added to the final product. Inputs follow resident index/load hashing: raw Shell/Lua bytes and decoded UTF-8 strings for other languages. Source reading and decoding happen before timing. Native incremental SHA-256 independently verifies every input digest against its recorded content identity; this is a digest-equivalence check, not a relation or search-truth oracle.

Four warmups per build and 24 ABBA rounds per corpus compare each complete digest array. All arrays match every round. Standard medians (average of the two middle samples), milliseconds:

| Corpus | Input bytes | v0.547.1 helper | v0.547.2 helper | Reduction |
| --- | ---: | ---: | ---: | ---: |
| Django | 20,181,512 | 95.3871 | 90.6870 | 4.93% |
| Nest | 3,378,259 | 17.8007 | 15.9077 | 10.63% |
| Fastify | 2,644,933 | 11.5820 | 11.3390 | 2.10% |
| Express | 716,318 | 3.4583 | 3.3207 | 3.98% |

The 2.10–10.63% reduction measures this resident helper replay only. It excludes I/O, decoding, verification and query work, and does not model every native buffered freshness input or streamed file. It is not a whole-index or whole-query improvement percentage.

## Complete full-content freshness

The retained freshness verifier uses two warmup pairs and 12 alternating measured pairs per corpus. Every complete receipt matches between builds after removing timing telemetry only: `proven-unchanged`, complete, all indexed files checked and unchanged policies. Standard medians, milliseconds:

| Corpus | v0.547.1 total | v0.547.2 total | v0.547.1 source hash | v0.547.2 source hash |
| --- | ---: | ---: | ---: | ---: |
| Django | 532.4733 | 534.4505 | 231.0695 | 225.2980 |
| Nest | 220.8757 | 217.4781 | 95.3100 | 93.7270 |
| Fastify | 44.6607 | 45.9432 | 28.2475 | 27.4785 |
| Express | 28.6713 | 27.4579 | 15.1380 | 13.5180 |

Source-hash medians are lower on all four corpora. Complete verification medians are lower on two and higher on two: Django increases 0.37%, Fastify increases 2.87%, Nest decreases 1.54% and Express decreases 4.23%. The total includes unchanged discovery and configuration work. These mixed totals do not establish a universal freshness speedup.

## Whole service call and compiled MCP text

Persistent read-only readers use the same indexes, three warmups per build and 12 ABBA rounds per fixed query. All 432 timed complete responses and rendered texts equal their accepted source-verified outputs and the baseline. Every captured bounded-symbol, source-operation-symbol and directional-edge `all()` read retains identical SQL, actual bound arguments and row counts. Trace hashes are computed after timing; the common wrapper collects raw trace inputs during the call. The trace does not enumerate every SQLite operation or `get()` read.

Whole-call time includes the service and compiled MCP text rendering. Upper medians (upper middle of 12 samples), milliseconds; positive reduction means faster:

| Fixed query | v0.547.1 | v0.547.2 | Reduction |
| --- | ---: | ---: | ---: |
| postgresql | 1094.5385 | 1089.7715 | 0.44% |
| mysql | 1169.9967 | 1165.7922 | 0.36% |
| fastify-cookie | 349.3471 | 339.1600 | 2.92% |
| nest-shutdown | 801.7612 | 779.8352 | 2.73% |
| fastify-plugin | 321.0591 | 320.8863 | 0.05% |
| fastify-serializer | 358.8246 | 360.5603 | -0.48% |
| express-object-links | 167.1664 | 169.6375 | -1.48% |
| fastify-request-prototypes | 371.8361 | 369.2212 | 0.70% |
| fastify-response-prototypes | 370.7600 | 361.3419 | 2.54% |
| password-hash-upgrade | 1111.1751 | 1105.4980 | 0.51% |
| sqlite-information | 1151.3513 | 1145.6558 | 0.49% |
| traceback-information | 1161.9566 | 1153.4429 | 0.73% |
| client-error-log | 371.3310 | 371.3996 | -0.02% |
| serialization-hook-errors | 375.3845 | 370.0224 | 1.43% |
| response-hook-upstream-guard | 384.3464 | 385.7449 | -0.36% |
| postgis-verification | 1088.6875 | 1091.8993 | -0.30% |
| diagnostic-verification | 1205.6670 | 1171.5470 | 2.83% |
| schema-execution-verification | 1024.4354 | 1023.6240 | 0.08% |

Thirteen medians are lower by 0.05–2.92%; five are higher by 0.02–1.48%. Every response/text byte count is unchanged. Tests, builds and quality verification finished before the final measurements; this audit launched no concurrent tests, builds, indexing or validation. The mixed whole-call results do not establish a universal or statistically significant speedup, an SLO or a peak-memory bound. First indexing, incremental sync, startup and total Agent task time/query count were not compared.

## Reproduction and artifacts

Build each checked-out product normally. Keep products, pinned corpora, indexes and reports outside the product checkout according to the [benchmark storage rules](../README.md). Recheck each unchanged manifest with:

`node benchmarks/mcp/task-retrieval.mjs --project <pinned-checkout> --manifest benchmarks/mcp/<manifest>-tasks.json --product-root <built-product> --repetitions 1 --output <external-report.json>`

Compare complete freshness with:

`node benchmarks/filesystem/freshness-verify.mjs --project <pinned-indexed-checkout> --baseline-product-root <v0.547.1-built-root> --candidate-product-root <v0.547.2-built-root> --repetitions 12 --output <external-report.json>`

Compare one fixed whole-service query with:

`node benchmarks/mcp/paired-explore.mjs --project <pinned-indexed-checkout> --baseline-root <v0.547.1-built-root> --candidate-root <v0.547.2-built-root> --query "<unchanged-question>" --pairs 12 --persistent-reader --comparison complete --output <external-report.json>`

The exact compiled-text/SQL trace driver is `%TEMP%/SymbolLattice-v5472-final-paired.mjs`; all samples are in its `.json` report. The resident replay and four freshness runs are preserved by `SymbolLattice-v5472-final-hash-checks.mjs`, `SymbolLattice-v5472-final-resident-hash.json`, `SymbolLattice-v5472-final-resident-{baseline,candidate}.mjs`, `SymbolLattice-v5472-final-freshness-{django,nest,fastify,express}.json` and `SymbolLattice-v5472-final-hash-checks-summary.json`. Drivers retain fixed task/input references and refuse to overwrite existing artifacts; choose fresh external output paths when reproducing them.

Frozen roots are `SymbolLattice-v5471-final-candidate` and `SymbolLattice-v5472-final-candidate`; the 762-file identities, corpus commits and four index hashes are in `SymbolLattice-v5472-final-build-identity.json`. Accepted QA and independent source checks are in `SymbolLattice-v5472-final-retrieval/`; its `.mjs` runner preserves the manifest list and routing check. Test logs are `SymbolLattice-v5472-focused-test.log`, `SymbolLattice-v5472-node22-filesystem-test.log` and `SymbolLattice-v5472-full-test.log`. Earlier `SymbolLattice-v5472-one-shot-trial*` and `SymbolLattice-v5472-hash-replay-trial*` prototype artifacts remain separate from final acceptance and reported timings.
