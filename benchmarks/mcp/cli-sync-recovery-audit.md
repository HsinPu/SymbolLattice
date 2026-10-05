# CLI stale-index recovery audit — v0.550.0

An ordinary live CLI read intentionally refuses a stale index with `FRESH_INDEX_REQUIRED` and `writerState=disabled`. Previous Agent guidance did not provide a clear recovery step for authorized code tasks, so an Agent could abandon indexed queries even though ordinary synchronization could recover them. v0.550.0 adds the optional `--sync-if-stale` to all 18 live query commands and updates the managed Codex/MCP guidance. This is an additive minor release; calls without the option and inspection commands remain read-only.

The option uses the existing strict freshness coordinator: verify before reading, acquire the real SQLite writer lease when stale, synchronize the existing index with its stored scope, and verify the generation and source again after querying. A fresh index needs no writer lease or synchronization. Missing indexes, unsafe project roots, unavailable ownership and continued source changes still refuse results. CLI recovery does not silently drop explicit plugin configuration; such indexes require their configured MCP host and return `CLI_SYNC_REQUIRES_PLUGINS`.

## Regression scope

Windows / Node.js v24.19.0 regression tests cover source recovery, no-op fresh reads, simultaneous source/configuration/extractor changes, stored-scope retention, missing indexes, unsafe roots, real owner contention, plugin preservation and continued source changes. They also retain ordinary CLI read-only behavior, before/after verification and generation fencing. `npm run check`, `npm run build`, 34 focused tests and the full suite (3,486 passed, four existing skips) pass. Logs are `%TEMP%/SymbolLattice-v5500-focused-tests.log` and `%TEMP%/SymbolLattice-v5500-full-test.log`. No parser, resolver or retrieval semantics changed in this batch.

## Fixed projects and independent truth

| Project | Repository | Commit | Original truth manifest |
| --- | --- | --- | --- |
| Nest | https://github.com/nestjs/nest | `35c3ded6dbf3f23f917ae88d0ed966932788cae6` | `nest-retrieval-tasks.json` |
| Fastify | https://github.com/fastify/fastify | `70b14e92c0b55e8201f5530ba2e6bab4e928c784` | `fastify-error-tasks.json` |
| Flask | https://github.com/pallets/flask | `d73fa1cdcbd8b1465c151db8924ba58b1dd14e35` | `flask-error-url-tasks.json` |

The unchanged v0.549.2 baseline is commit `25d5d8630cd7886783265f8391bf948ae8630b6c`. Both built products are frozen outside the repository. `identity.json` records every compiled/package SHA-256, runtime, manifest identity and protected historical index hash. Baseline bytes are rechecked against the retained v0.549.2 identity before execution.

Each pinned checkout uses its separate verification index. A newly authored transient declaration, `SymbolLatticeCliRecoveryProbe5500 = 5500` (Python) or `export const SymbolLatticeCliRecoveryProbe5500 = 5500;` (TypeScript/JavaScript), makes the index stale. Both ordinary CLI versions must refuse without changing its generation. The candidate query with `--sync-if-stale` must return that declaration with fresh, checkable source, publish an incremental generation and return exactly the same result on the next fresh query. The declaration is removed and the verification index synchronized afterward. Tracked source, pinned commits and protected historical index bytes must remain unchanged.

The existing `task-retrieval.mjs` then runs all eight original tasks with three new CLI processes per version, plus one flagged candidate query per task (56 query processes). It validates the original required-file/source truth and source excerpts. Complete baseline, candidate and flagged results must be deeply equal on the same generation. Partial precision denominators and unjudged results remain explicit; source windows do not count as primary required-file hits.

## Reproduction and retained artifacts

The runner, frozen products, raw queries, failures and timings are retained outside the repository in `%TEMP%/SymbolLattice-v5500-validation`, `%TEMP%/SymbolLattice-v5492-strict-candidate` and `%TEMP%/SymbolLattice-v5500-cli-candidate`. Run the retained validation with the same pinned corpora:

```powershell
node (Join-Path $env:TEMP 'SymbolLattice-v5500-validation/validate.mjs')
```

For a separately prepared pinned checkout with an existing fresh index, reproduce the CLI transition by adding the language-appropriate declaration above, then execute:

```powershell
# From the analyzed repository, with the matching built product installed
SymbolLattice status . --json
SymbolLattice explore SymbolLatticeCliRecoveryProbe5500 --project . --json
# Expected above: FRESH_INDEX_REQUIRED / writerState=disabled
SymbolLattice explore SymbolLatticeCliRecoveryProbe5500 --project . --sync-if-stale --json
SymbolLattice explore SymbolLatticeCliRecoveryProbe5500 --project . --sync-if-stale --json
# Remove only the transient probe you created, then synchronize
SymbolLattice sync .
```

Selected language results, test counts, measured CLI transition times and artifact hashes are recorded in the maintained [language verification and speed report](../../docs/language-verification-and-speed.md). Times include a new CLI process and freshness verification; the full test suite may run concurrently. These are diagnostic samples, not a controlled speed comparison. Service latency, first indexing, memory and complete Agent task cost were not remeasured; the historical 58-language table keeps its original measurement version. CMA122X on the user's other computer, Node.js 22 and other operating systems are outside this batch's verification.
