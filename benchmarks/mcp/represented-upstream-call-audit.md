# Already represented upstream calls and source coverage

## Scope and independent truth

v0.546.3 repairs existing bounded source-window selection and reuses primary
source coverage within one synchronous plan. CLI/MCP parameters, result fields,
file/symbol ranking, source budgets, index format, extractor v435 and resolver
v210 are unchanged. The selection policy advances from
`explore-source-windows-v11` to `explore-source-windows-v12`; allocation remains
v5. This is a patch because it corrects missing evidence in an existing contract
and reduces internal work without adding an external capability.

The Fastify source is pinned to `https://github.com/fastify/fastify` at
`70b14e92c0b55e8201f5530ba2e6bab4e928c784`. Independent TypeScript 5.9.3 AST
inspection confirms these locations in `lib/reply.js`:

| Declaration | Source fact |
| --- | --- |
| `preSerializationHook`, lines 487–499 | The hook condition is at 488; a callback is passed to the runner at 494; a direct fallback call to `preSerializationHookEnd` is at 497. |
| `preSerializationHookEnd`, lines 501–522 | A direct call to `onErrorHook` is at 503. |
| `onErrorHook`, lines 804–817 | Direct calls to `handleError` occur at 812 and 815. |

The independently checked handler selection is at `lib/error-handler.js:51`.
The static path uses the written direct fallback call at 497. It does not prove
callback dispatch at 494 or runtime ordering. The retained source exposes the
condition and callback argument for further inspection.

The three equivalent questions in
[`fastify-upstream-hook-guard-tasks.json`](fastify-upstream-hook-guard-tasks.json)
were fixed before querying either product. Required files and four source facts
come from the existing manually checked serialization-hook task, not product
answers. The immutable manifest SHA-256 is
`9f5c5b00f5cb4cb6422cd091eb42d93d92a26118ae017bbaa55e70e34b104953`.
These are regressions on a known repository, not blind validation or three
independent workflows.
The manifest's inherited held-out history describes the original task; the
three new questions have always been classified as regressions.

## Failure and repair

The question “Which conditions and calls route response transformation hook
failures into error handling?” returns both required files in v0.546.2, but only
three of four required source facts. The middle call at 503 is already selected
as a direct-call window. Impact-site deduplication discards it without preserving
its role as the terminal caller of an earlier validated path. The next window
starts at 494 instead of 487, omitting the condition at 488.

The final planner retains the priority of that validated path when its terminal
call is represented by fully delivered primary source or an already selected
window. Pending candidates do not establish continuity. A less relevant path
cannot promote a higher-ranked branch. When a continuation uses a selected
window, replacement protects that window; displaced witnesses lose their
priority before the next admission.

Only complete short callers within the existing 20-line limit can extend their
leading context. Eight total windows, two supplemental impact windows and two
impact hops remain the limits. Connection, callee-body and path-spine protection
remain. First-hop coverage alone does not justify prepending a late caller's
body. Character allocation can still truncate source, and those receipts remain
visible.

The coverage reuse stores only sorted full-line intervals derived from delivered
primary excerpts, keyed by exact file path. Partially delivered first/last lines
and empty delivery retain their previous treatment. The map is local to one
plan, does not retain raw source or graph state, and is rebuilt on the next call.

## Rejected experiments

The earlier comment-weighting trial is not shipped. It quarters comment-prefixed
extra-concept weight and restricts directory promotion. Six fixed tasks show
that PostgreSQL's judged negatives disappear into unjudged replacements while
the Fastify serialization task loses line 488. This does not demonstrate an
overall precision improvement.

The first continuity trial seeds all represented terminal paths equally. It
repairs the new question and the rejected ranking stress case, but loses line
488 in the original question and two equivalent requests. A lower-ranked path
gives a side branch continuation priority. This trial is retained and rejected.
The final rank eligibility check repairs all four requests without changing
their truth. The rejected ranking build is used only as a stress case; none of
its ranking rules are included in the release.

## Retrieval and checks

The final run uses the same four pinned corpora and read-only indexes documented
under v0.546.0 in [`../README.md`](../README.md): Django, Nest, Fastify and Express.
All 35 manifests / 48 tasks retain 76/76 required files and 210/210 specified
source facts. Existing 45 tasks preserve their complete MCP text and complete
responses apart from the selection-policy identifier. Two equivalent requests
also preserve that output; the third adds the missing condition, improving its
source-fact recall from 3/4 to 4/4. All 48 retain identical focus evidence and
file/symbol ranking. Coverage reuse preserves the complete repaired JSON and
compiled MCP text in all 48 cases.

Source-byte, line/column and directed graph receipt verification pass. Displayed
lexical evidence verifies 1,067 term facts across 947 location groups. Partial
task/file judgments total 96 TP, 2 FP, 0 FN and 79 unjudged; judged precision is
96/98 (97.96%) and required-file recall is 76/76 (100%). The 79 unjudged entries
among 177 returned judgments are outside the truth. The existing-task judgment
counts remain 87 TP, 2 FP and 76 unjudged; the aggregate precision difference
comes from adding equivalent tasks and is not a ranking improvement. PostgreSQL
noise, broader precision and untested workflows remain open.

`npm run check`, `npm run build`, 155 focused tests and the full suite pass
(3,427 passed, four existing skips). New regressions cover represented selected
and primary sites, full envelopes, lower-ranked side branches, witness removal
and delivery changes between calls. Existing invalid-hop, partial-line,
unavailable-file, late-call and protected-window cases continue to pass.

## Planner cost

Fifteen actual service calls are captured, then the complete invocation sequence
is replayed without filesystem/index I/O. The baseline is v0.546.2; the control
contains the continuity repair without coverage reuse; the candidate is the
actual final v0.546.3 build. Three warmup sequences precede 36 balanced rounds
over all six product orders, with ten sequence repetitions per sample. Every
candidate/control plan is deeply equal in every round and matches captured
JSON. The statistic is the upper median for the whole 15-invocation sequence.

| Build | Sequence median |
| --- | ---: |
| v0.546.2 | 10.77810 ms |
| Continuity control | 10.73978 ms |
| Final v0.546.3 | 9.87344 ms |

Coverage reuse reduces this component by 8.07% against the control and 8.39%
against v0.546.2. The preliminary external prototype measured 8.68% lower
component cost and is retained separately. These measurements do not establish
an equivalent whole-query speedup.

## Whole calls and replay

The final whole-call comparison uses the same fifteen questions, persistent
read-only readers and twelve balanced rounds over all six baseline/control/
candidate orders, with one warmup per build. It measures the service plus that
build's compiled MCP text. Tests, builds, corpus QA and indexing are not running
concurrently. Each timed result and text is checked against its own verified QA;
the control and final candidate have identical complete results and text.
Bounded edge-batch traces check direction, parameter count and returned-row
count, not literal parameter values or all SQL.

| Question | v0.546.2 ms | Control ms | Final ms | Final vs v0.546.2 | Final vs control |
| --- | ---: | ---: | ---: | ---: | ---: |
| PostgreSQL version | 1134.85 | 1123.54 | 1132.96 | 0.17% faster | 0.84% slower |
| MySQL version/cursor | 1193.15 | 1188.50 | 1201.74 | 0.72% slower | 1.11% slower |
| Fastify cookie | 362.58 | 368.74 | 366.17 | 0.99% slower | 0.70% faster |
| Nest shutdown | 835.18 | 826.12 | 812.50 | 2.72% faster | 1.65% faster |
| Fastify plugin | 339.80 | 338.79 | 332.32 | 2.20% faster | 1.91% faster |
| Fastify serializer | 380.79 | 374.84 | 380.09 | 0.18% faster | 1.40% slower |
| Express object links | 178.18 | 177.40 | 182.09 | 2.19% slower | 2.64% slower |
| Fastify request prototypes | 396.79 | 395.23 | 389.45 | 1.85% faster | 1.46% faster |
| Fastify response prototypes | 389.48 | 386.56 | 390.31 | 0.21% slower | 0.97% slower |
| Password hash upgrade | 1139.37 | 1126.69 | 1132.50 | 0.60% faster | 0.52% slower |
| SQLite information | 1193.27 | 1182.96 | 1190.61 | 0.22% faster | 0.65% slower |
| Traceback information | 1174.97 | 1157.41 | 1184.06 | 0.77% slower | 2.30% slower |
| Client error logging | 397.58 | 406.82 | 403.32 | 1.44% slower | 0.86% faster |
| Serialization hook errors | 409.09 | 404.31 | 398.37 | 2.62% faster | 1.47% faster |
| Upstream hook condition | 407.49 | 414.63 | 405.66 | 0.45% faster | 2.16% faster |

All 540 timed calls match their respective source-verified results and text;
control/final complete responses and text are equal. Nine final medians are
0.17–2.72% faster than v0.546.2; six are 0.21–2.19% slower. Against the continuity
control, seven are faster and eight slower. The component reduction is measured,
but neither this mixed whole-call table nor the retained initial comparison
(eight faster, seven slower without coverage reuse) proves universal latency
improvement or attributes every whole-call difference to this code.

First indexing, incremental sync, process startup and total Agent task time or
query count are not compared. Four existing main SQLite index files are hashed
before and after the final run. The product does not contain validation routing.

Artifacts remain outside the product repository under `%TEMP%`:

- `SymbolLattice-v5463-comment-trial*`, `SymbolLattice-v5463-continuity-trial*`
  and the comment/continuity stress products retain the rejected trials, fixed
  truth, source AST oracle, intermediate products and reports.
- `SymbolLattice-v5463-continuity-final-candidate-v2` is the verified continuity
  control; `SymbolLattice-v5463-continuity-final-retrieval/` and its initial paired
  report preserve its accepted QA and mixed whole-call samples.
- `SymbolLattice-v5463-planner-replay/inputs.json` preserves the fifteen actual
  planner inputs. Its summary and capture/cache products retain the prototype.
- `SymbolLattice-v5463-coverage-final-candidate` is the final actual build;
  `SymbolLattice-v5463-coverage-final-build-identity.json` verifies all 766 copied
  build/package files. Only the compiled database-path function is replaced by
  the existing fixed read-only validation route. The planner SHA-256 is
  `c266d65a9c45a1345fbcd23542cfeeb635a1d01e4f82ecc5bb62c6cb33070513`.
- `SymbolLattice-v5463-coverage-final-retrieval/`,
  `SymbolLattice-v5463-coverage-final-planner-replay.json` and
  `SymbolLattice-v5463-coverage-final-paired.json` preserve accepted outputs,
  displayed evidence audits and every timing sample. The final full-suite log
  is `SymbolLattice-v5463-coverage-final-full-test.log`.

The commands used for the final run are recorded below. To repeat them, restore
the exact pinned roots/indexes, copy each runner and change its external output
name first; these archived runners refuse to overwrite the existing reports.

```powershell
node "$env:TEMP/SymbolLattice-v5463-coverage-final-retrieval.mjs"
node "$env:TEMP/SymbolLattice-v5463-coverage-final-planner-replay.mjs"
node "$env:TEMP/SymbolLattice-v5463-coverage-final-paired.mjs"
```

For a fresh built product, use
`task-retrieval.mjs --project <pinned-indexed-checkout> --manifest
benchmarks/mcp/<manifest>.json --product-root <built-root> --repetitions 1
--output <external-report.json>`. `paired-explore.mjs` provides per-question
timing with `--pairs 12 --persistent-reader --comparison timing-only`; verify
quality independently before interpreting those times.
