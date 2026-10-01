# Bounded identifier cache eviction

This compares v0.546.1 (`40fb2ab9cd63ea67a23f8a7cfe6b052087acff65`)
with v0.546.2. It changes the cost of maintaining pure spelling caches, not
the spelling rules, relevance policy, source evidence or graph certainty.
The [information/send audit](information-abbreviation-audit.md) remains the
record of the preceding lexical corrections and unresolved ranking limits.

## Mechanism and preserved boundaries

Each helper still retains at most 4,096 values with input keys no longer than
256 UTF-16 code units. Longer inputs are computed completely without caching.
Stored arrays and arrays returned on cache hits remain independent copies.
Query groups, source positions, frequencies, scores, graph facts and index
generations are outside these caches.

The previous FIFO implementation obtains the oldest key with a new
`Map.keys().next()` call on every miss once full. The replacement retains
insertion keys in a bounded array and advances a circular cursor when replacing
an entry. Cache hits do not move entries. The same oldest key is evicted, and
neither the value map nor the insertion-key array exceeds 4,096 entries.
This adds a bounded array of key references per helper; heap usage was not
measured, so this is a capacity claim, not a measured byte saving.

The existing churn regression now supplies 12,300 distinct inputs, exercising
repeated cursor wraparound while preserving inflections, Unicode, oversized
inputs and caller-owned arrays. Public helper signatures, language policies,
index format, extractor v435, resolver v210 and runtime requirements do not
change. This is an internal performance patch.

## Diagnosis from actual queries

A separate instrumented v0.546.1 copy records helper requests and times the
compute and eviction paths. It runs PostgreSQL, MySQL, password-upgrade,
NestJS shutdown, Fastify serializer and Express object-link questions against
the fixed read-only indexes, retaining complete equality with previously
source-verified responses and compiled MCP text. Each question runs twice,
and helper caches persist across this mixed-repository sequence.

The second Django calls show a spelling population larger than the cache:

| Question | Word-helper calls | Distinct inputs | Evictions | Compute path ms | Eviction path ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| PostgreSQL version | 8,386 | 5,710 | 5,714 | 15.426 | 16.577 |
| MySQL temporary connection | 8,433 | 5,671 | 5,728 | 14.055 | 15.414 |
| Password hash upgrade | 8,361 | 5,959 | 5,986 | 16.425 | 14.943 |

These instrumented observations isolate a concrete maintenance cost. They are
not uninstrumented whole-query timings, and do not explain every difference
in the preceding release's timing table. The password case also has one
oversized input, which bypasses caching. Distinct-key counts and eviction
counts are different measures because keys can be evicted and requested again.

## Replay of the final build

The recorded sequence contains 203,182 calls across both helpers. Each helper's
request order is retained independently; their caches do not share entries.
The actual post-prepack builds are loaded with an additional diagnostic getter
that observes cache contents without changing computations. Complete returned
arrays and the value-map/FIFO insertion order are equal after every captured
phase and every timed pair. The candidate's key count and uniqueness are also
checked against the 4,096-entry bound.

The following Windows / Node.js 24.19.0 results use three warmups and 16
alternating-order pairs per sequence. They measure pure helper calls plus
collection of the returned arrays, excluding SQL, graph work and MCP rendering.
Each sequence includes both captured calls of its question.

| Captured sequence | Calls | v0.546.1 ms | v0.546.2 ms | Reduction |
| --- | ---: | ---: | ---: | ---: |
| PostgreSQL version | 45,368 | 51.557 | 25.670 | 50.21% |
| MySQL temporary connection | 47,898 | 49.994 | 25.829 | 48.34% |
| Password hash upgrade | 48,126 | 60.218 | 30.742 | 48.95% |
| NestJS shutdown | 26,772 | 2.954 | 3.002 | -1.60% |
| Fastify serializer | 24,724 | 2.416 | 2.450 | -1.43% |
| Express object links | 10,294 | 0.982 | 0.996 | -1.43% |

The high-churn sequences have a lower measured helper cost. High-hit sequences
are slightly slower, by 0.014–0.047 ms for the complete captured sequence.
Neither result implies that every complete query is faster.

## Complete service and MCP text comparison

The final three-build comparison uses v0.546.1, the actual v0.546.2 build, and
the same v0.546.2 build with only its two cache-wrapper calls disabled. The
13 questions each have one warmup per build and nine rounds in balanced build
order; each build is first, middle and last three times. Persistent read-only
stores use the same fixed indexes. No tests, builds, other validation or indexing
ran during this final measurement.

Every measured response and compiled MCP text matches the accepted source-verified
QA result. All three builds have identical complete outputs, and their bounded
edge-read traces match on direction, parameter count and returned-row count in
every round. The shared native SQLite
`all()` wrapper only records returned rows and their shapes. The table gives
median milliseconds for the service call plus compiled MCP text rendering.

| Fixed query | v0.546.1 | v0.546.2 uncached | v0.546.2 cached | Reduction vs v0.546.1 |
| --- | ---: | ---: | ---: | ---: |
| PostgreSQL version | 1214.124 | 1183.323 | 1188.836 | 2.08% |
| MySQL temporary connection | 1255.300 | 1245.489 | 1255.037 | 0.02% |
| Fastify cookie parsing | 374.155 | 386.687 | 364.772 | 2.51% |
| NestJS shutdown | 946.966 | 933.362 | 927.015 | 2.11% |
| Fastify plugin lifecycle | 335.486 | 357.659 | 332.686 | 0.83% |
| Fastify serializer selection | 384.093 | 401.544 | 383.348 | 0.19% |
| Express request/response links | 182.629 | 187.305 | 180.181 | 1.34% |
| Fastify request prototypes | 393.440 | 404.000 | 393.115 | 0.08% |
| Fastify response prototypes | 391.886 | 405.967 | 404.614 | -3.25% |
| Password hash upgrade | 1191.412 | 1174.752 | 1161.693 | 2.49% |
| SQLite version information | 1210.173 | 1227.140 | 1207.239 | 0.24% |
| Django traceback information | 1229.381 | 1201.367 | 1206.379 | 1.87% |
| Fastify client-error logging | 396.688 | 411.900 | 400.074 | -0.85% |

Eleven whole-call medians are 0.02–2.51% lower than v0.546.1. Response prototypes
and client-error logging are 3.25% and 0.85% slower. These are per-case
observations, not a universal speedup or a no-regression guarantee. Relative to
the uncached control, ten medians are lower; PostgreSQL, MySQL and traceback
information remain 0.42–0.77% slower. Pure-cache maintenance has less work, but
that does not make caching beneficial for every whole query. The preliminary
trial and these final-build results are both retained rather than selecting only
the faster observations.

## Evidence validation

The final v0.546.2 build passes all 34 manifests / 45 tasks on the same pinned
Django, NestJS, Fastify and Express sources and indexes recorded in the
[benchmark overview](../README.md). All 45 complete responses and compiled
MCP texts match v0.546.1. All 70 required files and 198 specified source facts
remain, and the displayed-citation/source audit verifies 977 term facts across
876 location groups.

Partial task/file judgments remain 87 TP (including supporting files), 2 FP,
0 FN and 76 unjudged. Judged-result precision is 87/89 (97.75%), and required-file
recall is 70/70 (100%) within this fixed truth. A file returned for separate
tasks counts separately. The 76 unjudged entries among 165 returned entries
prevent a complete result-precision claim. This batch preserves the remaining
PostgreSQL noise and the less direct primary focus for diagnostic dictionary
assembly; it does not claim a ranking or recall improvement.

`npm run check`, `npm run build`, 185 focused tests, the full suite (3,420 passed,
four existing skips), and `npm pack --dry-run` passed. The pack precheck includes
language-depth verification. The final frozen product matches all 762 built
files/package entries except the external fixed read-only database routing
function. Its identifier helper SHA-256 is
`532bd652cf5448419d7f7e3b6832bfa0505108408acd899aa3e9eb89a38162e8`;
the same-build uncached control helper is
`59b29fb99c9b7f1d23532584b8ed74246c9b8d1856fdb39e96e7352c51dc9e24`.

## External artifacts and replay

All raw inputs, reports, product copies and indexes remain outside this
repository under `%TEMP%`:

- `SymbolLattice-v5462-cache-trace.mjs/.json` and the trace product preserve
  instrumented requests, counters and checks against accepted query outputs.
- `SymbolLattice-v5462-ring-trial.mjs`, its identity report, paired driver/report
  and `SymbolLattice-v5462-cache-replay.mjs/.json` retain the preliminary trial.
- `SymbolLattice-v5462-final-candidate`, `SymbolLattice-v5462-final-uncached` and
  `SymbolLattice-v5462-final-build-identity.json` preserve the final products and
  complete file fingerprints. The control disables only the two cache wrapper
  calls, retaining the same spelling rules, graph behavior and index routing.
- `SymbolLattice-v5462-final-retrieval/` contains per-manifest reports, text audits
  and the accepted summary. `SymbolLattice-v5462-final-cache-replay.json` contains
  every pure-helper sample and the captured-input SHA-256.
- `SymbolLattice-v5462-final-paired.json` preserves all whole-call samples,
  balanced build orders and directional SQL row counts.

Replay against the restored fixed corpora and frozen builds using the archived
drivers, allowing correctness checks to finish before timing:

```powershell
node "$env:TEMP/SymbolLattice-v5462-final-retrieval.mjs"
node "$env:TEMP/SymbolLattice-v5462-final-cache-replay.mjs"
node "$env:TEMP/SymbolLattice-v5462-final-paired.mjs"
```

The existing `task-retrieval.mjs` also supports per-manifest replay with a
new built product and an explicit external output path. These checks do not
measure first indexing, incremental sync, process startup, Agent task completion
time/query count, or performance on other operating systems.
