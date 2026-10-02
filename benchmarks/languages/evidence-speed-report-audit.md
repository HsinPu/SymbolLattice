# Maintained language report audit — v0.549.1

The [language verification and speed report](../../docs/language-verification-and-speed.md) now provides one maintained entry for all 58 registered languages/formats. Both READMEs link it, and `AGENTS.md` requires updating it after each optimization. This patch adds documentation and a development report tool; it changes no product query, ranking, extraction, index or runtime contract.

## Evidence and scope

Measurements remain explicitly labeled **v0.549.0**, commit `54893be20020208866c5e8daae7863196f7ccaf7`. The report's documentation version is v0.549.1. Advancing the documentation version does not relabel historical measurements. The complete input identities and generation command are recorded in the report.

The minimum language gate was rerun on the clean v0.549.0 product: all 58 discovery/scan/file identities pass, 55 declaration/resource expectations pass, seven languages have an additional exact-call expectation, and three template languages have raw-reference expectations. These hand-authored fixtures provide no whole-language recall or latency measurement. Historical relation scopes, oracle types and evidence versions are copied from the saved language-depth matrix and labeled as historical registrations, not newly executed external validation.

The report rechecks 55 saved retrieval results from 38 unchanged manifests against the restored pinned sources, source excerpt identities and existing `scoreTask` contract. The language group comes from the independently predefined first required file, rather than a product-selected answer. TypeScript has 13/13 required file-task instances and 25/25 facts; JavaScript has 39/39 and 113/113; Python has 34/35 and 128/128. Supporting files, unjudged output and the different file/fact denominators remain explicit. The SQLite thread/close task retains primary-file recall 1/2.

Eight saved paired service timings are recomputed from their individual samples and checked against the unchanged task query, frozen roots and reported medians. Six medians are lower, two higher. Only three of the 58 languages have these measured task latencies; the other 55 remain unmeasured. No new product query timing, first-index/sync measurement, global precision or actual Agent completion claim is made in this batch. The [original source-context audit](../mcp/call-source-context-audit.md) retains query, source-cost and scripted follow-up conditions.

## Artifact recovery

At the start of this continuation, old source checkouts, the v0.548.1 frozen directory and its index copies were missing. The v0.549.0 candidate, its complete retrieval and timing records, build identities, source oracle, trace records and index copies were still available. No new run replaced the saved measurements.

Five source checkouts were fetched again at their fixed Django, Nest, Fastify, Express and Flask commits. Their Git HEADs and tracked-source cleanliness are checked by the report tool. The original temporary paths are restored so existing provenance and routing remain usable.

The baseline was rebuilt from `05b150ac6bfa1b942aa50dbefc750534c42a10ce`. Its first comparison had two byte mismatches: `package.json` and the routed SQLite `graph-store.js`; all other 760 recorded files matched. The two differences were confirmed to be physical line endings. The retained v0.549.0 package, with its recorded old version restored, and unchanged graph source, with the original index routing restored, exactly reproduce the original two hashes. The graph's independently recorded source hash is identical in both version identities. The final comparison matches all **762 original frozen files**. Five retained index copies also reproduce the recorded baseline index SHA-256 values. The v0.549.0 candidate's 765 files remain checked against its separate identity.

The first failed comparison remains in `%TEMP%/SymbolLattice-v5481-restoration.json`; the exact final recovery receipt is `SymbolLattice-v5481-restoration-final.json`. The archive, rebuilding log and recovery scripts remain external. This recovery verifies the previously measured inputs; it is not a new performance result.

## Tool checks

`evidence-speed-report.mjs` validates both product versions and their recorded frozen file hashes, pinned corpus commits and source cleanliness, every unchanged manifest hash, source excerpts, scored denominators and each raw timing median before writing Markdown. Invalid inputs stop generation before the destination is written. Unmeasured metrics and zero source-fact denominators are explicit. Output commands use the actual input paths and quote PowerShell paths.

Four deliberately altered copies were rejected for their expected reasons: mismatched product version, an omitted language, inflated source-fact hits and an invented lower latency. A sentinel destination remained unchanged in every case. The originals were not modified. `%TEMP%/SymbolLattice-v5491-report-negative-checks.json` retains all four results and the sibling `.mjs` retains the exact runner.

Typecheck, build, JavaScript syntax checking and nine related language-matrix/content/version tests pass. The full product suite's 3,474 passes and four skips belong to v0.549.0 and are not relabeled as a new full-suite run. A normal sandboxed invocation initially could not spawn read-only Git (`EPERM`); the same generator completed with the appropriate execution authority. Neither that execution restriction nor the earlier recovery mismatch was treated as a passing validation.

Future work must fill the remaining language measurements and resolve retained retrieval gaps, update this same report with the actual new measurement version, and preserve its previous baselines and failed samples. The broader continuous optimization goal remains open.
