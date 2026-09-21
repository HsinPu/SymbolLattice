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
| `python/` | `correctness-oracle.mjs`, `PythonOracle.py` | manual CPython stdlib AST oracle |
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
| `mcp/` | `task-retrieval.mjs`, `nest-retrieval-tasks.json`, `nest-source-tasks.json`, `nest-shutdown-tasks.json`, `fastify-retrieval-tasks.json`, `fastify-plugin-tasks.json`, `fastify-error-tasks.json`, `fastify-serializer-tasks.json`, `fastify-cookie-tasks.json` | automatic scorer/source verifier contracts; manual pinned-corpus execution |
| `filesystem/` | `operation-diagnostics-latency.mjs` | manual |

Always pass disposable workspaces and explicit output paths. Never write external corpora, `.SymbolLattice` indexes, generated JSON evidence, npm caches, or packed installations inside `benchmarks/`.

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
