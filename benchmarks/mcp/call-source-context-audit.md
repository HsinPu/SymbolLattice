# Python call source context audit — v0.549.0

## Change and compatibility

Some Python task queries previously found a written base declaration without returning enough of its method body to answer the question. The query planner now considers up to two written direct-base steps and short, exact callers in the same file. These are supplementary source routes. The original unresolved call retains a null target, zero confidence and its original syntax receipt; a route does not establish receiver type, runtime MRO or dispatch.

This is a minor release because it adds optional source evidence: `sourceWindows[].callSourceContext`, `sourceWindowPlan.callSourceContextSearch`, two window reasons and an optional allocation phase. Primary ranking and path-spine planning remain unchanged in the fixed comparisons. Source-window policy changes from v12 to v13. Extractor v436, resolver v212, schema v4 and source-search `fts5-source-v1` remain unchanged. Upgrading from v0.548.1 requires no new generation or source re-extraction for this query change.

## Bounds and evidence

The planner inspects at most 4,096 symbols and 16,384 edges. It considers eight calls per source, sixteen candidates, sixteen query terms and four additional files. One additional generation-fenced projection can read calls for up to eight base methods. Ambiguous base declarations, unsupported receivers, cycles, test/generated roots and missing paired import/base witnesses do not become confirmed connections.

Only complete method declarations of at most 64 lines and 8,192 characters are matched; total scanned declaration text is capped at 65,536 characters. A candidate needs at least two literal query concepts. Those concepts can occur in identifiers, comments or strings; this remains lexical evidence. Token coordinates refer to the original UTF-16 source, including CRLF inputs.

At most three additional windows fit within the existing eight-window limit. The total source budget remains 24,000 characters, with at most 6,000 reserved for this context. Original excerpts can become shorter. Existing connection and path-spine window selection remains protected; this does not promise identical source excerpts or complete output equality. Receipts disclose source/graph/call limits, unavailable sources and generation mismatches. Check delivered lines and follow a precise symbol or file when a declaration is truncated.

## Frozen products and corpora

The baseline is v0.548.1, commit `05b150ac6bfa1b942aa50dbefc750534c42a10ce`. The final v0.549.0 build contains 765 recorded files. `SymbolLattice-v5490-build-identity.json` records source and frozen-build SHA-256 values, the sole disposable SQLite path-routing adaptation, index identities and generations. Before timing, every current build file and frozen candidate file matched its recorded hash.

All corpora, frozen products, disposable index copies and generated reports remain outside this repository under `%TEMP%/SymbolLattice-v5490-*`. Candidate copies use the same existing generations as the baseline; validation reads do not initialize or rebuild indexes. Main index hashes remain equal before and after validation and timing.

| Repository | Fixed commit | External checkout |
| --- | --- | --- |
| [Django](https://github.com/django/django) | `bc833e8883db4a333a6485d91637b78c85e2b13b` | `%TEMP%/SymbolLattice-v5390-inherited-source-corpora/django` |
| [Nest](https://github.com/nestjs/nest) | `35c3ded6dbf3f23f917ae88d0ed966932788cae6` | `%TEMP%/SymbolLattice-v5390-inherited-source-corpora/nest` |
| [Fastify](https://github.com/fastify/fastify) | `70b14e92c0b55e8201f5530ba2e6bab4e928c784` | `%TEMP%/SymbolLattice-v5390-inherited-source-corpora/fastify` |
| [Express](https://github.com/expressjs/express) | `7ef98448f8b38099ab1ded55e458538ad47a51e7` | `%TEMP%/SymbolLattice-v5444-heldout-express` |
| [Flask](https://github.com/pallets/flask) | `d73fa1cdcbd8b1465c151db8924ba58b1dd14e35` | `%TEMP%/SymbolLattice-v5480-heldout-flask` |

The environment is Windows x64, Node.js 24.19.0, SQLite 3.53.3 and CPython 3.12. Node.js 22 was not separately tested in this batch; the documented engine range is unchanged.

## Retrieval and independent source checks

The 38 fixed manifests contain 55 tasks. All source, graph, displayed lexical and call-context receipt checks pass. The prior 51 tasks retain 79/79 required file-task instances and 222/222 specified facts. The three existing Flask tasks retain 6/6 required file-task instances and increase source-fact coverage from 20/38 to 38/38. Their earlier held-out queries are now known regression cases, not new held-out evidence for this implementation.

The new [SQLite thread/close task](django-sqlite-thread-close-tasks.json) was defined using CPython AST and manual pinned-source reading before either product query; its manifest hash was frozen in `SymbolLattice-v5490-truth-freeze.json`. Source-fact coverage increases from 3/6 to 6/6. **Formal primary-file recall remains 1/2 in both products.** The base file is returned as supplementary source, not a selected focus. The scorer and truth were not changed to turn this failure into a pass. This first held-out result is retained and the primary-file selection gap remains open.

Across the 55 tasks, existing partial judgments give 106 TP, 0 FP, 1 FN and 96 unjudged selected file-task instances. Required-file recall is 86/87; the larger TP count includes predefined supporting files. Precision within the declared judgments is 106/106, but overall precision is unmeasured: unjudged output is not treated as false positive. Source-fact coverage is 266/266, and 1,284 displayed term facts in 1,132 citation groups are verified against pinned source. These are bounded fixture denominators, not whole-project acceptance.

The independent [CPython audit](../python/call-source-context-audit.py) validates 13 returned source observations across eight distinct files. It checks literal class/method ownership, direct `self` calls, named base imports, actual module paths and package markers; it never executes imports. Observation counts include repeated paths across tasks and are not unique runtime relationships. The JavaScript receipt verifier separately rejects invented query terms, borrowed lexical receipts, mixed import evidence, wrong owners and guessed call targets.

### Output cost

| Task | Source facts, baseline → candidate | JSON bytes, baseline → candidate | MCP text bytes, baseline → candidate |
| --- | --- | --- | --- |
| Flask handler priority | 3/16 → 16/16 | 675,338 → 770,396 | 43,549 → 48,125 |
| Flask server-error propagation | 9/9 → 9/9 | 696,080 → 752,046 | 44,404 → 47,178 |
| Flask URL defaults/failure | 8/13 → 13/13 | 668,960 → 700,654 | 44,592 → 46,239 |
| Django SQLite thread/close | 3/6 → 6/6 | 501,451 → 546,641 | 43,895 → 46,526 |

The additional bodies and witnesses increase serialized output despite the unchanged source-character envelope. The server-error task was already complete for its fixed nine facts; its extra context does not increase that task's fact recall. Complete JSON/text equality is therefore not claimed for this release. All 55 primary `queryPlan` and `pathSpinePlan` values retain equality; cases without added context retain their previous output apart from the source-window policy version.

## Warm service latency

Eight fixed queries use twelve alternating baseline/candidate pairs, one warmup per product and persistent read-only readers: 192 timed service calls. No other validation jobs run concurrently. Timings include the complete service `explore` call and status checking, but exclude CLI startup, serialization/transport and Agent decisions. Comparisons use `timing-only` because optional evidence and source excerpts change; quality is checked separately above.

| Query | Baseline upper median, ms | Candidate upper median, ms | Change |
| --- | ---: | ---: | ---: |
| Django temporary database-version connection | 1,283.82 | 1,282.93 | −0.07% |
| Django SQLite thread/close | 1,522.36 | 1,505.93 | −1.08% |
| Nest constructor dependencies | 894.75 | 918.68 | +2.67% |
| Fastify error response status | 439.47 | 425.04 | −3.28% |
| Express response ETag/length | 197.03 | 189.37 | −3.89% |
| Flask handler priority | 259.73 | 246.35 | −5.15% |
| Flask server-error propagation | 269.84 | 263.58 | −2.32% |
| Flask URL defaults/failure | 217.64 | 220.82 | +1.46% |

Six medians are lower and two higher. Small differences may be noise; these measurements establish neither a universal speedup nor statistical significance or an SLO. The new nested call projection takes approximately 0.63–0.98 ms at its upper median in the measured Python cases. The complete raw samples and stage timings are retained in `SymbolLattice-v5490-timing/`; the exact runner is `SymbolLattice-v5490-timing.mjs`.

First indexing, incremental synchronization, cold readers and peak memory were not compared in this batch. Those costs cannot be inferred from these warm-query samples.

## Fixed sequences for obtaining sufficient source

Two scripted Flask sequences use the original unhinted task query, followed by source-led requests on the baseline. Handler priority follows the returned `self._find_error_handler`, then that method's `self._get_exc_class_and_code`, and the original exact caller window's `Flask.handle_user_exception` reference. URL failure follows the returned `self.handle_url_build_error`. Every follow-up reference is checked against the preceding response; no answer names are added to the initial natural-language question.

The candidate obtains the specified facts with its initial query. For each sequence, twelve alternating pairs follow one whole-sequence warmup per product with persistent read-only stores. Every measured sequence achieves the fixed fact denominator. The elapsed value sums measured service calls, excluding benchmark scoring, CLI/transport, startup and Agent reasoning.

| Fixed sequence | Baseline calls / upper median | Candidate calls / upper median | Specified source facts |
| --- | --- | --- | --- |
| Flask handler priority | 4 / 389.74 ms | 1 / 252.29 ms | 16/16 for both |
| Flask URL defaults/failure | 2 / 262.22 ms | 1 / 214.33 ms | 13/13 for both |

These two sequences retain 48 measured traces containing 96 service calls; their time medians fall 35.27% and 18.26%. They are fixed source-follow-up recipes, not minimum query counts or measured human/Agent completion times. Other valid follow-up sequences may have different costs. Fact-union scoring is only a trace projection, not a change to product output or the formal primary-file scorer.

The exact runner is `SymbolLattice-v5490-task-traces.mjs`; first complete responses, discovered follow-up references, per-step coverage, all timing samples and summaries remain in `SymbolLattice-v5490-task-traces/`. Both baseline and candidate Flask index hashes remain unchanged after these reads.

## Retained failures and checks

The first supplemental-window prototype found candidate source routes but allocated them after existing windows had exhausted the budget. Flask coverage remained 20/38. Its frozen product and results remain in `SymbolLattice-v5490-prototype*`; the second prototype and final validation use the bounded reservation described above. The original failed result was not removed.

An integration fixture initially used singular `code`, an existing query stop word, and expected a new caller window even though the old exact-call window already covered that caller. The fixture now uses literal `codes` and checks the delivered caller source. The first full suite then exposed two outdated v12/timing-stage contract expectations; only those literal contracts were updated. Both full-suite logs are retained.

Final typecheck, build and the full suite pass: **3,474 tests passed, four existing skips**. The language-depth gate also passes for 58 languages; it is a fixture/inventory gate and does not establish large-corpus recall for those languages. There were no parser, index-generation or worker-lifecycle changes requiring a new lifecycle claim.

## Reproduction and retained artifacts

Use independent disposable checkouts at the pinned commits and indexed copies outside this repository. Build and freeze both product versions, then record complete identities and redirect only the frozen SQLite store's index paths to those copies. Use fresh output paths; preserve the first run and every failed prototype.

```powershell
# Quality: repeat for each fixed manifest with the corresponding pinned checkout.
node benchmarks/mcp/task-retrieval.mjs `
  --project "$env:TEMP\SymbolLattice-v5480-heldout-flask" `
  --manifest benchmarks/mcp/flask-error-url-tasks.json `
  --product-root "$env:TEMP\SymbolLattice-v5490-candidate" `
  --repetitions 1 `
  --output "$env:TEMP\SymbolLattice-v5490-flask-quality-rerun.json"

# Independent source ownership/import audit of the saved final retrieval reports.
C:\Python312\python.exe benchmarks/python/call-source-context-audit.py `
  --build-identity "$env:TEMP\SymbolLattice-v5490-build-identity.json" `
  --reports "$env:TEMP\SymbolLattice-v5490-retrieval" `
  --output "$env:TEMP\SymbolLattice-v5490-cpython-source-context-rerun.json"

# Warm service latency: keep quality scoring separate because evidence output changes.
node benchmarks/mcp/paired-explore.mjs `
  --project "$env:TEMP\SymbolLattice-v5480-heldout-flask" `
  --baseline-root "$env:TEMP\SymbolLattice-v5481-candidate" `
  --candidate-root "$env:TEMP\SymbolLattice-v5490-candidate" `
  --query "How does URL generation apply shared defaults and handle failures from building the address?" `
  --pairs 12 --persistent-reader --comparison timing-only `
  --output "$env:TEMP\SymbolLattice-v5490-url-timing-rerun.json"
```

The final runner is `SymbolLattice-v5490-validate.mjs`; its 38 complete reports and summary are in `SymbolLattice-v5490-retrieval/`. The newly frozen task's baseline is in `SymbolLattice-v5490-baseline-retrieval/`; existing baseline reports remain in `SymbolLattice-v5481-retrieval/`. Independent AST output is `SymbolLattice-v5490-cpython-source-context.json`. Initial and final full-test logs are `SymbolLattice-v5490-full-test.log` and `SymbolLattice-v5490-final-full-test.log`.
