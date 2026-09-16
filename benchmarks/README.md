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
| `mcp/` | `task-retrieval.mjs`, `nest-retrieval-tasks.json`, `nest-source-tasks.json` | automatic scorer/source verifier contracts; manual pinned-corpus execution |
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
