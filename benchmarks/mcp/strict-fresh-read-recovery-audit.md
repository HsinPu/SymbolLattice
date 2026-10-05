# Strict freshness writer recovery audit — v0.549.2

This compatible patch fixes two writer-lease recovery failures. A Windows MCP host previously compared resolved project paths as case-sensitive strings. Addressing its default project with different casing therefore attempted to acquire a second lifetime lease for the same directory; that lease was already held by this host, and the query returned `FRESH_INDEX_REQUIRED` after its bounded wait. The host now reuses its existing ownership when the requested and default directories have the same native real path. Path resolution failures do not grant ownership.

A temporary lease also remained owned when verification threw immediately after acquisition or after query execution. Both paths now release it before propagating the failure. Failed verification still discards the result. Strict source/configuration verification, generation checks, two query attempts, two synchronization attempts, the two-second owner wait, read-only CLI and disabled-auto-sync behavior remain unchanged. This patch changes no public tool, field, index format, parser/resolver version or runtime requirement.

## Regression evidence

On Windows / Node.js v24.19.0, the pre-fix v0.549.1 build failed three new regression assertions: a real SQLite MCP host queried through differently cased paths, admission-verification lease release, and post-query-verification lease release. Twelve existing assertions in the same two test files passed. The original failure log is `%TEMP%/SymbolLattice-v5492-reproduction.log`.

The final code passes the focused coordinator, MCP and CLI tests: 141 tests. A fourth new integration case verifies real SQLite ownership becomes available after a failed postcheck and a subsequent source edit can be synchronized. Full `npm test -- --maxWorkers 2` passes 3,478 tests, with four existing skips. `npm run check`, `npm run build` and `npm run verify:mcp-worker-generation` also pass. Logs are `%TEMP%/SymbolLattice-v5492-focused-tests.log`, `SymbolLattice-v5492-full-test.log` and `SymbolLattice-v5492-worker-generation.log`. Node.js 22 and other operating systems were not re-executed in this batch.

## Fixed projects and recovery scope

The baseline is the unchanged v0.549.1 product at `29f4ee542c919f64b5af82619be828f1087b8562`; its compiled files and package were frozen before editing production code. The v0.549.2 candidate was frozen after the final build. `%TEMP%/SymbolLattice-v5492-validation/identity.json` records all compiled/package SHA-256 identities, manifest hashes, runtime and protected historical index hashes. Frozen roots are `%TEMP%/SymbolLattice-v5491-strict-baseline` and `%TEMP%/SymbolLattice-v5492-strict-candidate`.

| Project | Repository | Commit | Fixed task manifest |
| --- | --- | --- | --- |
| Nest | https://github.com/nestjs/nest | `35c3ded6dbf3f23f917ae88d0ed966932788cae6` | `nest-retrieval-tasks.json` |
| Fastify | https://github.com/fastify/fastify | `70b14e92c0b55e8201f5530ba2e6bab4e928c784` | `fastify-error-tasks.json` |
| Flask | https://github.com/pallets/flask | `d73fa1cdcbd8b1465c151db8924ba58b1dd14e35` | `flask-error-url-tasks.json` |

Each pinned checkout received a new verification index copied from the protected v0.549.0 artifacts. A separately authored transient TypeScript, JavaScript or Python declaration made that index stale. Both products started a real lifetime SQLite owner through `runMcpWithAutoSync`; the watcher callback was inactive to isolate query admission from background scheduling. Each query used an uppercase spelling of the same project path. All three baseline requests returned `FRESH_INDEX_REQUIRED` with `lease-unavailable`, zero syncs and zero query executions. All three candidate requests synchronized once, returned fresh results and found the independently written declaration. This tests host composition and real SQLite admission; wire/worker behavior is covered separately by integration tests and worker verification.

The temporary declarations were removed, indexes synchronized again, and tracked source remained clean at the pinned commits. Protected historical index bytes were retained. The recovery samples establish this casing failure and its repair; they do not establish that every stale-index refusal has this cause, test directory alias retargeting, or remove legitimate refusals when auto-sync is disabled, another owner cannot finish, source is unreadable or the project keeps changing.

## Retrieval and timing

The existing `task-retrieval.mjs` executes the original manifests with three fresh CLI processes per task/product. It scores independently fixed required files and source facts and rechecks returned excerpts against pinned source. The baseline and candidate complete results are deeply equal for all eight tasks: four Nest, one Fastify and three Flask. Truth manifests, scorer and relationship semantics are unchanged. This selected regression set does not rerun all 58 languages or replace historical larger results.

The existing `paired-explore.mjs` measures one fixed query per project with eight alternating warm pairs, one warmup per product and a persistent read-only reader. Each final complete response is equal across products. The 48 timed calls measure service `explore` only; host admission, worker transport, synchronization, indexing, memory peaks and actual Agent task time are not measured. Per-case raw times, upper medians, identities, scoring summaries and limits are recorded in the maintained [language verification and speed report](../../docs/language-verification-and-speed.md). Variation in unchanged service calls does not establish a general speedup from this recovery fix.

## Reproduction and retained artifacts

Raw JSON, final indexes, frozen products, the runner and its log are retained outside the repository in `%TEMP%/SymbolLattice-v5492-validation`. `validate.mjs` runs the above recovery cases, existing retrieval tool and existing paired timing tool against the frozen products and fixed checkouts. `recovery.json`, six `*-retrieval.json` reports, `quality.json`, three `*-timing.json` reports, `timing.json` and `complete.json` distinguish the scopes. Preserve the original failure log; it is not an accepted run.

To rerun recovery, prepare new disposable checkout/index destinations at the recorded pins and update the runner's explicit roots and output paths. Do not apply the transient declaration to a user's working project or overwrite protected historical artifacts. For retrieval alone, with a fresh final verification index:

```powershell
node benchmarks/mcp/task-retrieval.mjs --project <indexed-pinned-checkout> `
  --manifest benchmarks/mcp/nest-retrieval-tasks.json `
  --product-root <frozen-built-product> --repetitions 3 --output <external-report.json>
node benchmarks/mcp/paired-explore.mjs --project <indexed-pinned-checkout> `
  --baseline-root <frozen-v0.549.1> --candidate-root <frozen-v0.549.2> `
  --query "How are constructor dependencies resolved when creating providers?" `
  --pairs 8 --persistent-reader --output <external-timing.json>
```
