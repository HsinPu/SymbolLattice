# Compound query source evidence audit — v0.550.1

The fixed Django SQLite-close question previously treated an ordinary `in` token as evidence for the complete `in-memory` query concept. `exploreQuerySeedTerms` passed the original hyphenated spelling to the SQLite store, which split it into `in` and `memory`. That connector could admit unrelated callable candidates and affect bounded selection. v0.550.1 normalizes those alternatives with the existing source-search tokenizer and removes existing query stop words before the store splits them. Whole compound identifiers, useful lexical parts, source coordinates, index format and query limits are retained. This is a patch to existing source-evidence behavior; it adds no public parameter or relation-resolution claim.

The unit case reproduces both `in-memory`/`in` and `on-demand`/`on` false matches. The SQLite case limits primary selection to one file and verifies that a real `close(in_memory)` source wins over an unrelated `for ... in` source, including the exact token columns. The initial negative reproduction and the corrected tests are retained outside the repository. No parser, extractor, resolver or worker-generation behavior changes.

## Independent fixed tasks

The 38 historical manifests contain 55 tasks over pinned Django, Nest, Fastify, Flask and Express checkouts. Their truth is unchanged. The Django close task was first held out for v0.549.0; it is a regression/development case for this batch, so its original 1/2 primary-file recall remains historical evidence. Supplementary inherited source windows do not count as primary-file hits.

The new [Gin manifest](gin-handler-flow-tasks.json) defines three additional tasks before the first product query: an exact known symbol, an unhinted middleware-abort question and an unhinted URL-to-handler flow. Its manually read positive source facts and required files are frozen at Gin commit `43fe48e8a0f44af783116cdb010725e6bb50255f`. Its first verification result must be retained even when incomplete. This is a 99-Go-file library task sample, not a large Go corpus, compiler/type oracle or runtime-dispatch proof; no Go compiler was on the validation process PATH. No product rule was retuned against these three held-out results.

| Project | Repository | Commit |
| --- | --- | --- |
| Django | https://github.com/django/django | `bc833e8883db4a333a6485d91637b78c85e2b13b` |
| Nest | https://github.com/nestjs/nest | `35c3ded6dbf3f23f917ae88d0ed966932788cae6` |
| Fastify | https://github.com/fastify/fastify | `70b14e92c0b55e8201f5530ba2e6bab4e928c784` |
| Flask | https://github.com/pallets/flask | `d73fa1cdcbd8b1465c151db8924ba58b1dd14e35` |
| Express | https://github.com/expressjs/express | `7ef98448f8b38099ab1ded55e458538ad47a51e7` |
| Gin | https://github.com/gin-gonic/gin | `43fe48e8a0f44af783116cdb010725e6bb50255f` |

The 55 historical tasks retain 87/87 required task-file pairs and 266/266 specified facts. Django's close question improves primary recall from 1/2 to 2/2 while retaining all six facts. The other 57 of 58 total tasks have complete baseline/candidate result equality. Gin finds 5/5 required task-file pairs but only 8/18 source facts: the middleware task has 3/6 and the URL-to-handler flow 0/7. These are actual evidence gaps, not environment failures; the Go flow tasks do not pass complete evidence acceptance.

Seven controlled service comparisons retain all raw samples. The Django question's upper median improves 1,558.59 → 1,227.25 ms, about 21.26%; Gin's known entry increases 67.55 → 70.21 ms. Other small changes do not establish a universal speedup. Typecheck, build, 174 focused tests and the full suite (3,488 passed, four existing skips) pass. The report retains four measured language samples and 54 languages with unmeasured task speed; no historical language-depth declaration was upgraded.

## Measurement and reproduction

The baseline is v0.550.0 (`044c7e7ca37bf333586306fd3610dad49bcc974f`). Windows / Node.js v24.19.0 uses frozen baseline/candidate builds, their existing fresh verification indexes and fixed tracked source. The retained runner checks the baseline against the previous release's compiled-file SHA-256 list, records product fingerprints and all truth/index hashes, and checks their identities again after each phase. Protected historical indexes are never query targets or modified. Actual quality reports use the existing `task-retrieval.mjs` with three new CLI processes per task/build and alternate build-first order between manifests.

Selected query timing uses `paired-explore.mjs`, one warmup per product and eight alternating pairs with persistent read-only SQLite readers. Unchanged results require complete equality; changed results use timing-only comparison alongside separately checked original file/source truth. These service times exclude CLI startup, host freshness admission, synchronization, MCP transport and complete Agent task/query cost. Full-suite tests, building and indexing do not run concurrently with final retrieval or timing. No-op or first-index samples must retain their actual indexing product version and must not be called modified-source incremental-sync measurements.

Raw reports, samples, frozen products, failures and the exact runner are under `%TEMP%/SymbolLattice-v5501-validation`, `%TEMP%/SymbolLattice-v5500-cli-candidate` and `%TEMP%/SymbolLattice-v5501-compound-candidate`. Once the separately prepared pinned corpora and frozen products are in place:

```powershell
node (Join-Path $env:TEMP 'SymbolLattice-v5501-validation/validate.mjs') prepare
node (Join-Path $env:TEMP 'SymbolLattice-v5501-validation/validate.mjs') quality
node (Join-Path $env:TEMP 'SymbolLattice-v5501-validation/validate.mjs') timing
node (Join-Path $env:TEMP 'SymbolLattice-v5501-validation/validate.mjs') audit
node (Join-Path $env:TEMP 'SymbolLattice-v5501-validation/audit-raw.mjs')
node (Join-Path $env:TEMP 'SymbolLattice-v5501-validation/report-supplement.mjs')
```

An individual task manifest can instead be reproduced through the maintained tool:

```powershell
node benchmarks/mcp/task-retrieval.mjs `
  --project (Join-Path $env:TEMP 'SymbolLattice-v5501-heldout-gin') `
  --manifest benchmarks/mcp/gin-handler-flow-tasks.json `
  --product-root (Join-Path $env:TEMP 'SymbolLattice-v5501-compound-candidate') `
  --repetitions 3 --output (Join-Path $env:TEMP 'gin-retrieval-recheck.json')
```

Measured counts, missing evidence, slow cases and input hashes are maintained in the [same language verification and speed report](../../docs/language-verification-and-speed.md). Recheck the raw report scores and per-sample medians before updating that document. Unknown selected files remain unjudged; partial judged precision is not repository-wide precision. Historical language-depth declarations and the 58-language minimum matrix retain their original measured versions.
