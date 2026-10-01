# Native directory entry paths, v0.547.3

Project discovery repeatedly resolved every native directory entry against an absolute parent that was already normalized. Native nonrecursive directory entries are basenames, so the walker now constructs one parent prefix per directory and appends each entry name. A parent ending in the platform separator retains that separator once. Custom filesystem readers continue using the original path resolver because their entries need not carry the native basename guarantee. This compatible internal performance change warrants a patch release.

The canonical root validation, sorting, nested ignore frames, hard/default exclusions, explicit scopes, source classification, configuration coverage, concurrency and access-error handling remain unchanged. The optimization preserves full traversal and every content hash. Query parameters, evidence coordinates, budgets, generation fencing, Node requirements, parser/resolver policies and index compatibility retain their existing contracts. No index migration is required.

## Decision and fixed sources

The retained v0.547.0 diagnostic CPU profiles showed time in path resolution and normalization. They motivated a hypothesis, not a current release speed estimate. An external v0.547.2 prototype changed only the compiled walker. Two warmup pairs and eight alternating measured pairs per corpus retained equal complete freshness receipts, with discovery medians 304.4540 → 273.3110 ms on Django, 95.8405 → 88.2110 on Nest, 12.9035 → 12.8615 on Fastify and 8.7975 → 7.9310 on Express. Final acceptance below uses the actual TypeScript implementation and final build.

Windows / Node.js 24.19.0 compares the released v0.547.2 build with final v0.547.3. The existing tracked source files and pinned commits remain unchanged:

| Corpus | Pinned commit |
| --- | --- |
| [Django](https://github.com/django/django) | `bc833e8883db4a333a6485d91637b78c85e2b13b` |
| [Nest](https://github.com/nestjs/nest) | `35c3ded6dbf3f23f917ae88d0ed966932788cae6` |
| [Fastify](https://github.com/fastify/fastify) | `70b14e92c0b55e8201f5530ba2e6bab4e928c784` |
| [Express](https://github.com/expressjs/express) | `7ef98448f8b38099ab1ded55e458538ad47a51e7` |

Django, Nest and Fastify retain `%TEMP%/SymbolLattice-v5390-inherited-source-corpora/<name>` and `SymbolLattice-v5430-indexes/<name>/index.sqlite`. Express retains `SymbolLattice-v5444-heldout-express` and its `.SymbolLattice/index.sqlite`. Untracked index directories remain. These are previously used corpora and questions; this batch adds no unseen repository or new semantic parsing claim.

All 762 copied package/dist files match the workspace build except the exact external `databasePathFor` routing function selecting the four fixed read-only indexes. Restoring that function reproduces the workspace file byte-for-byte. Corpus commits, per-file build fingerprints and all four unchanged main SQLite SHA-256 identities are recorded in the final build identity artifact. Routing overrides and large artifacts are outside product source.

## Path and evidence correctness

A new real-filesystem regression compares native traversal with a custom reader that retains resolution. It fixes expected source/configuration paths and canonical scopes independently, exercising Unicode and accented names, spaces, dot components, an explicitly scoped directory, a negated hidden-directory exclusion and configuration outside the source scope. Candidate absolute paths match resolved paths. Existing tests cover global concurrency, ignored files, parent-before-child rules, missing directories, permission aggregation and draining active work on failures.

Typecheck and build pass. The 118 focused walker/discovery/configuration/strict-freshness checks pass in ten files. The six filesystem files pass 105 tests on Node.js 22.16.0. The full Node.js 24 suite passes 3,439 tests with four existing skips, 322 passing files and one skipped file. These runtime measurements are on Windows.

Before final freshness timing, both actual built products return deeply equal complete ordered source and configuration path lists on all four pinned checkouts, including the discovery policy. Configuration path counts here describe traversal results, rather than the later snapshot which also checks explicitly tracked and absent inputs:

| Corpus | Source paths | Configuration paths |
| --- | ---: | ---: |
| django | 3366 | 2 |
| nest | 1738 | 222 |
| fastify | 338 | 5 |
| express | 158 | 2 |

All 36 unchanged manifests / 51 tasks retain deeply equal complete structured responses and identical compiled MCP text against accepted v0.547.2 outputs. Independent pinned-source checks retain 79/79 required file-task instances, 222/222 specified facts and 1,114 displayed term facts across 982 citation groups; joint-source coverage verification also runs. Partial judgments remain 99 TP / 0 FP / 0 FN / 87 unjudged. Counts are task/path instances. Overall precision, arbitrary task completeness and new retrieval-quality gains are not established by these partial judgments.

## Final full-content freshness comparison

Two warmup pairs and 12 alternating measured pairs per corpus retain equal complete receipts after excluding timing telemetry only. Every check is `proven-unchanged`, complete, and verifies all indexed files. No metadata-only shortcut, retained prior result or smaller traversal substitutes for full content verification. Standard medians (average of the two middle samples), milliseconds:

| Corpus | v0.547.2 total | v0.547.3 total | v0.547.2 discovery | v0.547.3 discovery | Discovery reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| django | 543.8664 | 514.2267 | 300.4420 | 282.1395 | 6.09% |
| nest | 233.3854 | 217.5603 | 95.5965 | 89.2375 | 6.65% |
| fastify | 42.8424 | 40.6564 | 13.3325 | 12.6660 | 5.00% |
| express | 22.2009 | 22.3458 | 8.3455 | 7.7005 | 7.73% |

Discovery medians are 5.00–7.73% lower on these four corpora. Complete freshness totals are lower on three corpora and higher on Express by approximately 0.1450 ms (0.65%). Source hashing and configuration work are unchanged implementations, and their wall-time variations still contribute to total time. This does not establish a universal whole-verification speedup.

## Whole-call comparison and follow-up

Persistent read-only readers use the same indexes, three warmups per build and 12 ABBA rounds for each of 18 fixed queries. All 432 complete responses and compiled MCP texts match accepted source-verified QA and the baseline. Every captured bounded-symbol, source-operation-symbol and directional-edge `all()` read retains identical SQL, actual bound arguments and row counts. Trace hashes are computed after timing; the common wrapper records raw inputs during the call. The trace does not enumerate every SQLite operation or `get()` read.

Whole-call milliseconds include the service and compiled MCP text. Upper medians (upper middle of 12 samples); positive reduction means faster:

| Fixed query | v0.547.2 | v0.547.3 | Reduction |
| --- | ---: | ---: | ---: |
| postgresql | 1122.8796 | 1102.2237 | 1.84% |
| mysql | 1236.6604 | 1224.3434 | 1.00% |
| fastify-cookie | 349.1495 | 347.6324 | 0.43% |
| nest-shutdown | 849.1699 | 813.8424 | 4.16% |
| fastify-plugin | 334.0463 | 316.3636 | 5.29% |
| fastify-serializer | 407.3250 | 401.0115 | 1.55% |
| express-object-links | 194.1928 | 197.2056 | -1.55% |
| fastify-request-prototypes | 402.5372 | 392.1912 | 2.57% |
| fastify-response-prototypes | 381.9471 | 388.6580 | -1.76% |
| password-hash-upgrade | 1213.2642 | 1128.3640 | 7.00% |
| sqlite-information | 1212.4311 | 1206.3407 | 0.50% |
| traceback-information | 1232.9560 | 1210.6733 | 1.81% |
| client-error-log | 391.4184 | 407.9498 | -4.22% |
| serialization-hook-errors | 395.1955 | 384.1071 | 2.81% |
| response-hook-upstream-guard | 410.6179 | 413.8282 | -0.78% |
| postgis-verification | 1269.5589 | 1137.3428 | 10.41% |
| diagnostic-verification | 1259.0631 | 1214.7712 | 3.52% |
| schema-execution-verification | 1098.7482 | 1025.5297 | 6.66% |

Fourteen medians are lower by 0.43–10.41%; four are higher by 0.78–4.22%. The slower cases prompted a separate follow-up rather than replacing the initial result. Individual stage medians varied in different directions; they come from different calls and cannot be added to explain a whole-call median or prove a cause.

The follow-up repeats all four initially slower cases and a PostgreSQL control with three warmups per build and 24 ABBA rounds. All 240 complete responses/texts and captured SQL/argument/row identities retain equality. Upper medians of the 24 samples:

| Follow-up query | v0.547.2 | v0.547.3 | Reduction |
| --- | ---: | ---: | ---: |
| postgresql | 1119.9145 | 1078.6316 | 3.69% |
| express-object-links | 175.4813 | 175.0310 | 0.26% |
| fastify-response-prototypes | 392.9866 | 386.6970 | 1.60% |
| client-error-log | 382.5193 | 384.1986 | -0.44% |
| response-hook-upstream-guard | 404.8620 | 401.7769 | 0.76% |

Four follow-up medians are lower and one is higher by 0.44%. The initial 4.22% client-error-log difference does not repeat at the same magnitude; a small slower median remains. Both runs are retained. This supports the measured discovery reduction while leaving whole-query gains mixed. It does not prove statistical significance, universal speedup, an SLO or absence of regressions in other environments. Every response/text byte count and all four main index hashes remain unchanged.

Tests, builds and quality verification finished before final performance measurement; freshness, the initial whole-call run and the follow-up ran sequentially, with no concurrent tests, builds, indexing or validation launched by this audit. First indexing, incremental sync, process startup, peak memory and total Agent task time/query count were not compared.

## Reproduction and retained artifacts

Build both checked-out releases normally and use fixed indexed corpora with products, indexes and output outside the checkout, following the [benchmark storage rules](../README.md). The archived drivers retain the exact read-only routing required for the separately stored indexes. Generic tool entry points on the chosen fixed indexed checkout are:

`node benchmarks/filesystem/freshness-verify.mjs --project <pinned-indexed-checkout> --baseline-product-root <v0.547.2-built-root> --candidate-product-root <v0.547.3-built-root> --repetitions 12 --output <external-report.json>`

`node benchmarks/mcp/task-retrieval.mjs --project <pinned-checkout> --manifest benchmarks/mcp/<manifest>-tasks.json --product-root <built-product> --repetitions 1 --output <external-report.json>`

`node benchmarks/mcp/paired-explore.mjs --project <pinned-indexed-checkout> --baseline-root <v0.547.2-built-root> --candidate-root <v0.547.3-built-root> --query "<unchanged-question>" --pairs 12 --persistent-reader --comparison complete --output <external-report.json>`

Exact frozen products are `%TEMP%/SymbolLattice-v5472-final-candidate` and `SymbolLattice-v5473-final-candidate`. Final identity is `SymbolLattice-v5473-final-build-identity.json`; independent QA and accepted outputs are in `SymbolLattice-v5473-final-retrieval/`, with its `.mjs` runner.

Complete path checks, twelve-pair freshness samples and index identities are preserved by `SymbolLattice-v5473-final-freshness.mjs`, its `-summary.json` and `SymbolLattice-v5473-final-freshness-{django,nest,fastify,express}.json`. The complete text/SQL-trace initial and follow-up runs are `SymbolLattice-v5473-final-paired.mjs/.json` and `SymbolLattice-v5473-paired-followup.mjs/.json`. Runners refuse to overwrite artifacts; select fresh external paths when reproducing.

Logs are `SymbolLattice-v5473-focused-test.log`, `SymbolLattice-v5473-node22-filesystem-test.log` and `SymbolLattice-v5473-full-test.log`. The earlier external prototype and its four eight-pair reports remain under `SymbolLattice-v5473-native-path-trial*`; the older diagnostic profile remains under `SymbolLattice-v5470-speed-*`. Prototype and older diagnostic values do not replace final acceptance or final timings.
