# Joint same-file source coverage and bounded output

## Scope and contract

v0.547.0 adds optional JSON `queryPlan.coveredFileContextFiltering` and MCP follow-up notes. This is a minor release because it introduces source-cited joint coverage and omission receipts. The query-plan policy advances from v31 to v32. Existing `coveredContextFiltering` retains its single-anchor contract; CLI/MCP parameters, focus/file/source budgets, Node requirements, index format, extractor v435 and resolver v210 are unchanged. No index rebuild is required for this query capability.

The rule runs after bounded selection, without backfilling replacement files, only for natural-language queries without explicit file hints or numeric qualifiers. The primary production file must have a literal query-directory receipt and at least two selected, non-generated declarations. Each anchor has at least two source concepts and validates source ownership. Their non-comment-prefixed receipts must jointly cover at least six groups and every concept observed in the selected candidates. Query groups without a match in these selected/omitted candidates remain explicit in `unmatchedTermGroups`; this is not a project-wide absence claim.

Every omitted symbol must have fewer total literal groups than the anchors, at most half as many name/non-comment-prefixed groups, and fewer than two name groups. A stronger symbol preserves its whole file. Compound named operations, exact symbol hits, cited direct exact relations, names of written unresolved calls from protected sources, graph expansion and flow/gap/property follow-ups are protected. Invalid ownership preserves a secondary file or prevents compaction. These guards reuse the original single-anchor protection logic.

The rule uses the scanner's separately retained non-comment-prefixed receipts, not merely the preferred lexical hit: a preferred comment cannot hide an actual non-comment hit and falsely weaken a file. Obvious comment prefixes are a lexical heuristic; strings/docstrings still match and executable semantics are not inferred. The receipt cites each anchor independently and preserves raw and non-comment receipts for omissions. MCP text names owners, paths, unmatched groups and follow-up access. Joint coverage neither connects declarations nor proves irrelevance or complete necessary evidence. Bounded graphs and query/source truncation can still leave gaps.

## Independent truth and rejected trial

The PostgreSQL question and its three source facts are unchanged. Django is pinned to https://github.com/django/django at `bc833e8883db4a333a6485d91637b78c85e2b13b`. CPython AST and manual source checks independently confirm `get_database_version` at 230–235 and `pg_version` at 542–544. The latter reads `connection.info.server_version`; the former converts `self.pg_version` with `divmod(..., 10000)`. These written receipts do not establish dynamic receiver/descriptor dispatch.

The [file judgment audit](django-postgresql-version-noise-audit.md) adds four development-case negatives: diagnostic reporting, a MySQL provider, PostgreSQL capability thresholds and SQLite capability thresholds. Observation motivated this expansion, so it is not blinded truth. Both builds are re-scored under the same expanded manifest; original reports remain unchanged. The failed comment-weighting trial merely swaps three distractors for three other now-judged distractors (1 TP, 3 FP, 0 FN in both), and also loses a Fastify hook source fact. It is not shipped.

The final rule reduces the PostgreSQL selected files from four to the required PostgreSQL base file: 1 TP, 3 FP, 0 FN becomes 1 TP, 0 FP, 0 FN, with specified facts 3/3 in both. For this task all returned files are judged; selected-file precision is 25% to 100%. This does not measure all files in the repository or all PostgreSQL questions. Eight focuses become two. The two retained declarations independently cover six concepts; `report` remains unmatched in the bounded candidates. Six omitted focuses retain their names, ranges and raw/non-comment source receipts; 46 receipt instances are verified against actual source and comment prefixes. There is no file-path blacklist or query-text special case.

Three new questions in [django-covered-file-context-verification-tasks.json](django-covered-file-context-verification-tasks.json) were fixed from the independently read PostGIS, diagnostic and schema sources after the rule was frozen and before either build answered them. They retain 5/5, 4/4 and 3/3 facts respectively, and complete results differ only in the policy identifier. They are verification questions on a known repository, not an unseen project or three independent workflows. The sources were already inspected for the development audit.

## Retrieval and source validation

All 36 fixed manifests / 51 tasks preserve 79/79 required files and 222/222 specified source facts. Fifty complete results match v0.546.3 except for query-plan policy, and all fifty MCP texts are identical. Only the PostgreSQL task changes selection. The same-truth task/file counts are 99 TP, 3 FP, 0 FN and 87 unjudged before; 99 TP, 0 FP, 0 FN and 87 unjudged after. TP includes independently specified optional supporting files. Aggregate judged precision is 97.06% (99/102) to 100% (99/99); 87 unjudged results prevent an overall precision claim. Required-file recall concerns only these fixed task/file truths.

Actual source bytes, source excerpts, lexical coordinates, comment prefixes, direct graph receipts and omission source ownership are checked. Displayed lexical evidence verifies 1,114 term facts in 982 location groups. The new independent omission verifier rejects forged ownership, uncovered groups, duplicate anchors, false comment provenance, unsupported token terms and inflated thresholds/counts. Contract tests do not substitute for the separately executed real-corpus runs.

The four fixed corpora remain Django at the commit above, NestJS https://github.com/nestjs/nest at `35c3ded6dbf3f23f917ae88d0ed966932788cae6`, Fastify https://github.com/fastify/fastify at `70b14e92c0b55e8201f5530ba2e6bab4e928c784`, and Express https://github.com/expressjs/express at `7ef98448f8b38099ab1ded55e458538ad47a51e7`. Existing development/regression/verification splits are retained. These known corpora and partial truths do not establish universal language or project coverage.

## Paired whole-call measurements

Node v24.19.0, Windows, persistent read-only stores, three warmups per build and 24 balanced baseline/candidate rounds per query. AB/BA/BA/AB orders repeat six times; upper medians measure service plus compiled MCP text. Tests, build and retrieval QA were terminal before timing. Every one of the 864 timed responses and texts equals its own accepted source-verified QA. Four main SQLite files retain their before/after hashes. The frozen candidate's 762 files equal the workspace build/package except for the exact database-path function routing only the four fixed external indexes; all other compiled bytes are preserved. Source build hashes are rechecked before timing.

| Query | v0.546.3 ms | v0.547.0 ms | Change (negative is faster) |
| --- | ---: | ---: | ---: |
| postgresql | 1147.058 | 1137.143 | -0.86% |
| mysql | 1210.791 | 1202.349 | -0.70% |
| fastify-cookie | 363.434 | 365.334 | 0.52% |
| nest-shutdown | 819.325 | 817.189 | -0.26% |
| fastify-plugin | 340.324 | 335.368 | -1.46% |
| fastify-serializer | 384.816 | 378.233 | -1.71% |
| express-object-links | 179.664 | 181.074 | 0.78% |
| fastify-request-prototypes | 390.592 | 390.354 | -0.06% |
| fastify-response-prototypes | 391.566 | 387.502 | -1.04% |
| password-hash-upgrade | 1146.283 | 1156.458 | 0.89% |
| sqlite-information | 1194.634 | 1193.873 | -0.06% |
| traceback-information | 1207.593 | 1193.512 | -1.17% |
| client-error-log | 395.765 | 394.753 | -0.26% |
| serialization-hook-errors | 399.205 | 394.429 | -1.20% |
| response-hook-upstream-guard | 414.818 | 417.482 | 0.64% |
| postgis-verification | 1150.535 | 1140.964 | -0.83% |
| diagnostic-verification | 1223.615 | 1227.160 | 0.29% |
| schema-execution-verification | 1067.511 | 1063.679 | -0.36% |

Thirteen medians are faster by 0.06–1.71%; five are slower by 0.29–0.89%. These small mixed differences do not demonstrate universal search acceleration. PostgreSQL's 1147.058 → 1137.143 ms is only 0.86% lower, while its planning median is 63.419 → 67.881 ms. The confirmed cost reduction is output: MCP text 43,784 → 11,267 UTF-8 bytes (74.27% less), JSON 361,177 → 113,008 bytes (68.71% less). Other measured outputs keep their byte lengths. First indexing, incremental sync, startup, total Agent task time and query counts are not measured.

Bounded edge traces compare only direction, parameter count and row count, not literal parameters or all SQL. 18/18 tasks retain these batch counts in every round. No counted batch shape changes were observed; this does not prove equality of all SQL or literal parameters.

## Checks and replay artifacts

Typecheck and build pass. The 153 focused tests pass; full suite has 3,435 passed and four existing skips across 322 passed files / one skipped file. An initial full-suite run failed six integration expectations for the old v31 policy only; those assertions were updated and the complete suite rerun. No failed functional assertion was waived. The first trial runner incorrectly assumed every query has a non-null query plan; the corrected run preserves exact-symbol cases. An initial final runner used an unsupported Windows absolute ESM specifier; it was corrected to a file URL before any freeze occurred. Neither harness failure was treated as a product pass.

Artifacts remain outside the product sources under %TEMP%:

- `SymbolLattice-v5470-postgresql-source-audit.py/.json`: pinned CPython AST/source evidence.
- `SymbolLattice-v5470-file-coverage-trial[-v2][-product]`: retained prototype outputs; the v2 runner validates all 48 original tasks.
- `SymbolLattice-v5470-final-retrieval.mjs`, `SymbolLattice-v5470-final-candidate`, `SymbolLattice-v5470-final-build-identity.json`, `SymbolLattice-v5470-final-retrieval/summary.json`: frozen final product, per-manifest source-verified responses and rendered texts.
- `SymbolLattice-v5470-final-paired.mjs/.json`, `SymbolLattice-v5470-final-edge-trace-audit.json`: all samples, conditions and retained bounded-batch traces.
- `SymbolLattice-v5470-refined-noise-rescore.json`: baseline/rejected/final outputs scored with identical refined truth.
- `SymbolLattice-v5470-final-truth-clarification.mjs` and its output directory: final manifest prose clarification, current hash, and equality of both complete responses and scores after that clarification. Manual negative decisions preceded the prototype; formal CPython AST confirmation followed.
- `SymbolLattice-v5470-focused-test.log`, `SymbolLattice-v5470-full-test.log`, `SymbolLattice-v5470-final-full-test.log`: focused, initial and final complete-suite records.

The freeze/replay scripts assert fresh output directories to preserve prior evidence; copy the runner and choose new names to replay. Existing main SQLite snapshots are readonly. The commands below use the frozen validated product, whose database routing accepts only the four recorded checkout paths. For a new pinned checkout, prepare a current index and omit `--product-root`. Independently repeat source checks through the retained tool:

```sh
node benchmarks/mcp/task-retrieval.mjs --project <pinned-django-checkout> --manifest benchmarks/mcp/django-postgresql-version-tasks.json --product-root <frozen-validated-product> --output <external-postgresql-report.json> --repetitions 1
node benchmarks/mcp/task-retrieval.mjs --project <pinned-django-checkout> --manifest benchmarks/mcp/django-covered-file-context-verification-tasks.json --product-root <frozen-validated-product> --output <external-contrast-report.json> --repetitions 1
```
