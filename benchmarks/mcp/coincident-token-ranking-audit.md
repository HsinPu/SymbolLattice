# Coincident-token ranking experiments

This development audit uses the unchanged pinned Django, Fastify, Nest and
Express questions documented under v0.545.1 in `../README.md`. Experiments
were external compiled prototypes derived from v0.545.1, with the same fixed
read-only indexes and independent source/file truth. External directory names
use `v5460` to identify experiments; the prototypes remain unreleased.

The PostgreSQL development question returns the required server-version facts
but ranks `get_connection_params` before `pg_version`. The latter has two query
concepts at one actual token: `server_version` at base.py:544:41–55. The current
PostgreSQL noise audit independently judges three other returned files
irrelevant to this value/conversion question. See
[`django-postgresql-version-noise-audit.md`](django-postgresql-version-noise-audit.md).

The prototypes grouped lexical receipts by file, exact range and token,
excluding `comment-prefixed` receipts. Overlapping query inflections counted
once. They attached a source-token coverage receipt but did not resolve a new
call, receiver or data-flow edge.

| Experiment | Scope | Observed failure under unchanged truth |
| --- | --- | --- |
| Flat 1,000-point bonus | All admitted candidates; stopped after the first failing manifest | Fixture loading lost required `django/db/backends/base/base.py` and two of the five specified source facts; three facts remained. |
| Flat 500-point bonus | All 41 existing tasks across 31 manifests | Request validation lost required `lib/validation.js` and its two specified facts; serialization hook handling lost one more fact. Total specified facts were 176/179. |
| 1,000-point local focus preference | Same-file callable pairs, a 0.55 relative-score floor, query-term retention and protected existing coverage receipts; all 41 tasks | MySQL version retrieval lost the base temporary-connection file and all eight required facts. Other source gaps affected transaction rollback, exception middleware and shutdown. Total specified facts were 164/179. |

The 500-point PostgreSQL result moved `pg_version` first but swapped the three
judged negatives for SQLite, Oracle and MySQL feature files that the manifest
had not judged. A lower count of specified FP therefore did not establish
better precision. Those outputs remain unjudged; the manifest was not expanded
or rewritten to make a trial pass.

The local-focus trial replaced `mysql_server_data` with `mysql_version` beside
`get_database_version`. The baseline selected owner supplied the written
`self.temporary_connection` call and an inherited-source declaration lead.
That owner and call disappeared in the prototype, along with the supporting
base-file focus. Preserving planner file choices and aggregate query words
did not preserve the later service's source chain. These are static source
observations, without a runtime-dispatch claim.

The shipped v0.545.2 change retains the complete v0.545.1 structured response
for every fixed task and improves displayed token citations. The ranking
experiments do not pass the existing acceptance gates. Future work must keep
these failures and evaluate the chosen owners, their outgoing evidence and
the final returned files together. Compound-token coverage supplies literal
word-location evidence; determining which operation returns, transforms or
propagates the requested value requires further source evidence.

External reports remain under `%TEMP%`:

- `SymbolLattice-v5460-trial-retrieval/candidate-django-fixture-constraints-tasks.json`
- `SymbolLattice-v5460-500-trial-retrieval/summary.json` and `candidate-*-tasks.json`
- `SymbolLattice-v5460-local-trial-retrieval/summary.json` and `candidate-*-tasks.json`
- `SymbolLattice-v5460-pg-input.json` captures the pre-trial planner input.

These reports include product fingerprints and the exact task manifest hashes.
The existing task runner replays the retained failure cases against a supplied
build; use separate external output directories for each implementation:

```sh
node benchmarks/mcp/task-retrieval.mjs --project <pinned-checkout> --manifest benchmarks/mcp/django-fixture-constraints-tasks.json --product-root <build-root> --output <external-report.json> --repetitions 1
node benchmarks/mcp/task-retrieval.mjs --project <pinned-checkout> --manifest benchmarks/mcp/fastify-retrieval-tasks.json --product-root <build-root> --output <external-report.json> --repetitions 1
node benchmarks/mcp/task-retrieval.mjs --project <pinned-checkout> --manifest benchmarks/mcp/django-version-temporary-connection-tasks.json --product-root <build-root> --output <external-report.json> --repetitions 1
```
