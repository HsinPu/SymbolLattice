# PostgreSQL server-version retrieval: file judgment audit

This manual source audit applies only to the unchanged question in
`django-postgresql-version-tasks.json`: how PostgreSQL reports the database
version from its server connection information. It does not assess all database
version queries, connection initialization, schema changes or PostGIS support.

The source is Django `https://github.com/django/django` at
`bc833e8883db4a333a6485d91637b78c85e2b13b`. Judgments come from reading the
pinned implementation and independently inspecting its CPython AST, not from
the product's scores, lexical receipts or graph output. This audit followed
inspection of returned files, so it is a development-case truth refinement,
not blinded or held-out validation. No product ranking rule was tuned in this
batch, and the question and three required source facts remain unchanged.

| File | Judgment for this question | Independently checked source |
| --- | --- | --- |
| `django/db/backends/postgresql/base.py` | Required | `DatabaseWrapper.get_database_version`, lines 230–235, converts `self.pg_version` with `divmod(..., 10000)`; `pg_version`, lines 542–544, reads `self.connection.info.server_version` under `temporary_connection`. |
| `django/db/backends/base/base.py` | Optional supporting context, unchanged | Defines the shared temporary-connection lifecycle; the question's existing scope does not require explaining that lifecycle. |
| `django/contrib/gis/db/backends/postgis/operations.py` | Irrelevant | `spatial_version`, lines 184–211, obtains the PostGIS library version from settings or `postgis_version_tuple`; lines 341–343 and 357–363 use `postgis_lib_version()` and parse its string. This is a different version value and retrieval mechanism. |
| `django/db/backends/postgresql/creation.py` | Irrelevant | `sql_table_creation_suffix`, lines 21–31, builds test-database creation options; `_clone_test_db`, lines 57–87, manages cloning. These operations do not explain the required server-information value and tuple conversion. |
| `django/db/backends/postgresql/schema.py` | Irrelevant | `execute`, lines 42–48, composes and executes schema SQL; `_create_like_index_sql`, lines 83–120, builds operator-class indexes. These operations do not explain the requested version reporting. |

The PostGIS file does call `_get_postgis_func("version")` at line 198 as a
connection sanity check. The returned value is discarded. Its helper at lines
328–335 executes a SQL function and fetches a scalar; this is not the required
`connection.info.server_version` read or its numeric tuple conversion. Sharing
the temporary-connection helper does not make the PostGIS library version part
of the answer. These judgments do not assert that the files have no runtime
effects or that deleting them is safe.

Before this audit, the three files were unjudged. The original v0.541.1 and
v0.541.2 reports remain unchanged outside the repository. Re-scoring both
versions with the revised manifest identifies the same three false positives:
one TP, three FP, zero FN, required-file recall 1/1, specified facts 3/3 and
judged file precision 1/4. This is expanded judgment coverage, not a product
regression. Other tasks' unjudged results remain unjudged.

The contrasting question in `django-postgis-library-version-tasks.json` was
fixed before its first product run, without changing product rules. Its live
result finds the required operations file and all five specified SQL/scalar/
tuple facts. Three other returned files remain unjudged; zero judged FP for
that question is not full precision. This positive case prevents treating the
PostGIS file itself as intrinsically irrelevant.

Artifacts use `%TEMP%/SymbolLattice-v5413-postgresql-noise-ast.json`,
`SymbolLattice-v5413-retrieval-rescore.json` and
`SymbolLattice-v5413-postgresql-live.json`. AST spans support the static source
audit; they do not prove dynamic receiver dispatch. Replay the live source and
receipt checks with the existing tool:

```sh
node benchmarks/mcp/task-retrieval.mjs --project <pinned-django-checkout> --manifest benchmarks/mcp/django-postgresql-version-tasks.json --output <external-report.json> --repetitions 1
```

The next ranking investigation must preserve the required server-version
source facts, evaluate these now-judged negatives, and check other fixed tasks
and samples not used for tuning. File-name exclusions specific to these paths
are not an acceptable general solution.
