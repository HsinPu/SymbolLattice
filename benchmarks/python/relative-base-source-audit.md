# Relative Python base sources, v0.548.0

This minor release adds written base-source evidence for one-dot dotted imports.
Unmarked directories below an indexed regular ancestor are admitted for base
source only. They do not resolve calls or construction. `configurationPaths`
cites the regular markers; `unmarkedPackagePaths` discloses the missing markers.
Namespace roots without a regular ancestor, multiple leading dots, ambiguous
file/package paths, rebinding, decorated declarations and dynamic dispatch
remain outside the contract. Query lookup uses the existing bounded graph and
indexes file imports once per invocation, without an additional store read.

Extractor policy is `multi-language-ast-v436`; resolver policy is
`project-resolver-v212`. Run `SymbolLattice sync .` after upgrading. The first
prototype assumed every intermediate directory had `__init__.py`; it failed all
six Flask observations. That prototype and its reports are retained.

## Independent source observations

Flask is pinned to `https://github.com/pallets/flask`, commit
`d73fa1cdcbd8b1465c151db8924ba58b1dd14e35`. CPython 3.12 AST and manual source
reading fixed the sites and three task questions before any product query.
The unchanged retrieval manifest SHA-256 is
`fcc0994b43f8b8f562a02ce3a10b7f16fa1626988d72e64409ee6e031f307db3`.

All six fixed source sites now have AST-verified import/base/declaration
receipts, versus none in v0.547.3. They cover two distinct written base links:
`Flask -> App` and `App -> Scaffold`; repeated call sites are not additional
distinct inheritance relations. Callee ranges, import ranges, base ranges,
candidate identities, paths, marker disclosure and certainty are checked.
Every inherited call remains unresolved, with a null target and zero confidence.
The actual CLI `hierarchy src/flask/app.py#Flask` returns the new direct parent
edge where the baseline returned none. A separate existing-graph helper probe
finds all six witnesses; this probe is not natural-language retrieval acceptance.

Django's two previously fixed imported-base sites retain independent AST
verification on its pinned large checkout. Separate candidate indexes for
Django, Nest, Fastify and Express re-extract all 3,366 / 1,738 / 338 / 158 files.
Their original read-only index hashes remain unchanged.

## Retrieval and remaining gaps

The existing 36 manifests / 51 tasks retain 79/79 required file-task instances
and 222/222 specified source facts. Partial judgments remain 99 TP / 0 FP /
0 FN / 87 unjudged. Overall precision is unmeasured. Complete responses differ
after indexing; generation IDs, timestamps and Django's graph count change.

The new Flask tasks retain 6/6 required file-task instances but only 20/38 source
facts: handler priority 3/16, server-error propagation 9/9, URL building 8/13.
Their questions and truth were not weakened. The new links alone do not fill
the general query's source windows. Retrieval evidence remains incomplete, and
these failures are retained for the next improvement. All 54 task responses
have source/graph receipts and displayed lexical citations checked separately.
The text audit checks 1,204 term facts in 1,063 citation groups.

## Final build checks

The final `npm run check`, `npm run build` and
`npm run verify:language-depth` pass. The full `npm test` run has 3,458 passing
tests and four existing skips. The related nine-file run has 527 passing tests;
the separate MCP text run has 37. Version consistency, documentation links and
`git diff --check` are also checked.

The final release snapshot records hashes for 762 build files, including package
metadata. Its only
runtime modification redirects index paths to the separate external candidate
indexes. All 54 tasks across 37 manifests are replayed against that snapshot;
their JSON and compiled MCP text exactly match the final quality reports,
including the Flask gaps above. This checks build identity, not complete
retrieval acceptance. Compared with the timed build, the final build changes
only a resolver documentation comment, one language-limitation string and its
source map; runtime resolver function text is unchanged.

## Query cost

Seven unchanged questions use 12 alternating pairs, one warmup per product and
persistent readers. Quality is checked separately; complete-response equality
is not claimed across different generations. Upper whole-call medians:

| Case | v0.547.3 ms | v0.548.0 ms | Change |
| --- | ---: | ---: | ---: |
| Django temporary connection | 1232.754 | 1304.277 | +5.80% |
| Nest dependencies | 934.384 | 945.006 | +1.14% |
| Fastify error response | 403.476 | 435.883 | +8.03% |
| Express response | 187.452 | 195.724 | +4.41% |
| Flask handler priority | 284.120 | 285.199 | +0.38% |
| Flask propagation | 270.768 | 259.752 | -4.07% |
| Flask URL building | 231.112 | 231.192 | +0.03% |

A separate 24-pair follow-up retains the three slower representative corpora
and the initially faster Flask control: Django +7.97%, Fastify +2.61%, Express
+1.03%, Flask propagation -1.51%. Both runs are retained: 360 timed calls in
total, without a universal speedup, significance or SLO claim. Upgraded indexes
also retain two generations rather than one; Fastify grows from 95,326,208 to
162,443,264 bytes and Django from 927,797,248 to 1,576,574,976 bytes. This is an
observed condition, not proof that history caused the slowdown. Reducing query
cost on upgraded indexes remains required goal work.

## Reproduction and artifacts

Run `python benchmarks/python/inherited-source-gaps.py <pinned-flask>
benchmarks/python/flask-inherited-source-truth.json <external-report.json>`.
Use `benchmarks/mcp/task-retrieval.mjs --project <indexed-checkout> --manifest
benchmarks/mcp/flask-error-url-tasks.json --product-root <built-product>
--repetitions 1 --output <external-report.json>` for the unchanged tasks.
Use `benchmarks/mcp/paired-explore.mjs` with both built roots, the same pinned
project/question, `--persistent-reader --comparison timing-only --pairs 12`;
verify output quality separately.

Corpora, baseline/prototype/release products, indexes and reports remain outside
the repository under `%TEMP%/SymbolLattice-v5480-*`. Runners are
`final-validate.mjs`, `final-timing.mjs`, `timing-recheck.mjs`,
`flask-witness-probe.mjs` and `django-ast-audit.py`, each with that prefix.
`flask-source-truth.json`, `flask-baseline-inheritance.json`,
`flask-final-inheritance.json`, `django-inheritance.json`,
`flask-witness-probe.json`, `final-retrieval/summary.json`,
`final-timing/summary.json` and `timing-recheck/summary.json` retain source
observations, failures and every timing sample. Upgrade logs are documentary;
indexing/sync performance and total Agent task time were not compared.
`release-build-identity.json`, `release-replay.mjs` and
`release-retrieval/summary.json` retain the final compiled-file hashes and
54-task replay. Final check logs use the `release-` prefix.
