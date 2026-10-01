# Information and send query evidence

This audit compares v0.546.0 (`e3392072ce0095f81b6f47188cdc0529d352587a`)
with the v0.546.1 spelling changes. The improvements supply lexical
alternatives and written token locations, not receiver types, descriptor
dispatch, resolved call targets or semantic equivalence.

## Source observations and frozen questions

The Django source is `https://github.com/django/django` at
`bc833e8883db4a333a6485d91637b78c85e2b13b`. Independent CPython AST and source
reads identify:

- PostgreSQL `DatabaseWrapper.pg_version`, base.py:542–544, reads
  `self.connection.info.server_version`; base.py:235 converts `self.pg_version`
  with `divmod`. The existing unhinted question says “information”, while the
  written member is `info`.
- SQLite `DatabaseWrapper.get_database_version`,
  `django/db/backends/sqlite3/base.py:201–202`, returns
  `self.Database.sqlite_version_info`. This is a literal getter observation,
  without resolving `self.Database` or executing the external driver.
- `ExceptionReporter.get_traceback_data`, `django/views/debug.py:344–422`,
  obtains frames at line 350, assigns the exception type/value at 415/417 and
  returns the assembled dictionary at 422. Frame-walking implementation,
  template rendering and production error dispatch are outside this question.

The Fastify source is `https://github.com/fastify/fastify` at
`70b14e92c0b55e8201f5530ba2e6bab4e928c784`. The independent TypeScript 5.9.3
compiler's JavaScript AST locates `defaultErrorHandler` at
`lib/error-handler.js:82–104`, its `reply.statusCode < 500` condition at 88,
`reply.log.info` at 90, `{ res: reply, err: error }` at 91 and `reply.send(error)`
at 103. An initial manually entered send anchor of 104 was corrected to 103
against source before any product run. `info` here is a logging level; matching
the query word “information” does not prove that a metadata value is returned.

The new questions in [django-information-tasks.json](django-information-tasks.json)
and [fastify-error-log-information-tasks.json](fastify-error-log-information-tasks.json)
were fixed after freezing the information/info and spelling-cache prototypes,
before inspecting either product's answers. They concern literal SQLite version
reporting, diagnostic dictionary assembly and the client-error logging/send
branch. Their questions contain no file paths or added answer-symbol hints.
These are additional samples on known repositories, not unseen-project tests.

The two Django questions remain verification samples. The Fastify question
failed its first verification run and was then used to investigate sent/send;
its split is now development. The question, required file and four source facts
were retained. Split/truth-method metadata records that history rather than
treating the reused question as held out.

## Retained failure and isolated experiments

The initial candidate preserved all 42 previous tasks' 67 required files and
188 specified facts; 41 complete responses and texts remained identical.
The new Django questions retained all six specified facts. Both v0.546.0 and
the initial candidate missed `lib/error-handler.js` and all four facts for the
unchanged Fastify logging question. The 45-task run therefore found 194/198
facts and one missing required file. This is a product limitation, not an
environment or corpus failure.

| Independent prototype | Required logging file | Logging source facts |
| --- | --- | ---: |
| Information/info only, with spelling cache | Missing | 0/4 |
| Add sent/send | Found | 4/4 |
| Remove they/them/their from query terms | Missing | 0/4 |
| Add sent/send and remove pronouns | Found | 4/4 |

The shipped spelling rule keeps the pronoun handling unchanged and adds the
missing irregular sent/send form. It also maps information to the conventional
info abbreviation. Both use the existing identifier-part matcher and preserve
the original written token, file and UTF-16 range. No file-name exclusions or
question-specific score bonuses were introduced. The prefix words
`informational`, `informatics` and `sentinel` do not become lexical info/send
tokens through these alternatives.

The information trial moves the PostgreSQL `pg_version` focus from rank 3 to
rank 1 and the SQLite version getter ahead of `quote_value`, retaining their
required facts. It also moves the diagnostic question's primary focus from
`get_traceback_data` to `handle_uncaught_exception`, while retaining the required
debug file and all four facts. That primary focus is less direct for dictionary
assembly and remains a ranking limitation.

The PostgreSQL creation file is replaced by `django/views/debug.py`, which is
unjudged under the unchanged PostgreSQL manifest. Two specified negatives still
appear. A lower specified FP count does not prove higher overall precision;
unjudged files are not automatically FP or TP. This change does not claim to
solve the remaining noise or the distinction between a value read and incidental
words in another operation.

## Pure spelling cache and validation boundaries

Each spelling helper retains at most 4,096 entries with keys no longer than 256
UTF-16 code units. Oversized strings are computed normally. Oldest entries are
evicted when full. The cache stores only word splitting and variant expansion;
query groups, source positions, frequencies, scores, graph facts and generations
remain outside it. Stored arrays are copied on insertion and retrieval so
callers cannot contaminate later calculations. Regression tests cover mutation,
eviction churn, oversized/Unicode keys, per-file ranges and per-declaration
frequencies.

Three initial Windows / Node 24.19.0 service-only comparisons used the same
read-only indexes, one warmup and eight alternating pairs. MySQL's median moved
1272.845 to 1259.708 ms, NestJS shutdown 883.770 to 857.866 ms, and Fastify request
prototypes 433.750 to 417.071 ms. Their final complete responses matched. These
are diagnostic observations, not a universal speed claim; the final validation
and broader timing comparison are recorded under v0.546.1 in
[the benchmark overview](../README.md).

Artifacts remain outside the repository under `%TEMP%`:

- `SymbolLattice-v5461-information-source-oracle.json` and
  `SymbolLattice-v5461-information-js-oracle.mjs/.json` preserve independent source
  observations; the latter confirms the corrected send anchor.
- `SymbolLattice-v5461-retrieval/` and its runner retain the initial complete
  failure and comparison outputs; `SymbolLattice-v5461-clause-*.json` retain the
  three isolated form/pronoun trials, alongside their exact compiled files.
- `SymbolLattice-v5461-info-abbreviation-pg.json` and
  `SymbolLattice-v5461-identifier-cache-*.json` retain the earlier primary-focus
  and speed probes.

Replay either current manifest with the existing task runner against each built
product, using separate external output files. Its source and relation checks
operate on the pinned source, and missing facts remain failures:

```sh
node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-django> --manifest benchmarks/mcp/django-information-tasks.json --product-root <built-product> --repetitions 1 --output <external-django-report.json>
node benchmarks/mcp/task-retrieval.mjs --project <pinned-indexed-fastify> --manifest benchmarks/mcp/fastify-error-log-information-tasks.json --product-root <built-product> --repetitions 1 --output <external-fastify-report.json>
```
