# Go boolean semicolon audit — v0.550.2

The pinned Go lexer specialized true/false but its semicolon context did not track that token. A boolean at the end of a line could create recovery errors and cause the existing strict extractor to discard an otherwise valid complete method. The generator now exports the specialized boolean token and adds it to the tracked semicolon set. It preserves the pinned grammar, prior bare-range patch, original input/coordinates, and syntax-error rejection. [Go semicolon rules](https://go.dev/ref/spec#Semicolons) apply to identifiers, including predeclared boolean identifiers; source text is not rewritten.

This is a patch to existing declaration behavior, not a new syntax feature or API. Product version is 0.550.2; extractor v436 advances to v437, resolver v212 and index format remain. Existing indexes require normal sync or an authorized --sync-if-stale query, with re-extraction on the first upgrade. No index deletion, forced lease acquisition or relaxed freshness is used.

## Independent declaration scope

[The retained tool](README.md) uses official Go go1.27.1 standard-library AST parsing only. Gin is https://github.com/gin-gonic/gin at 43fe48e8a0f44af783116cdb010725e6bb50255f (99 Go files); grpc-go is https://github.com/grpc/grpc-go at d96c2ef4f3339142d20a47797d8a5a4fae948607, tag v1.76.0 (1,003 Go files). Source commits, tracked cleanliness, every source hash, helper hash, product bytes and original positions are recorded. The official Windows AMD64 SDK archive is 78,931,360 bytes, SHA-256 a3911b5e0e1b1053f25ed0675f4c1c6aad1e2bfcf253df2b9be4caabd2edd95d, verified against official metadata and extracted only into the external SDK directory.

The unit is an official top-level FuncDecl with a plain named or pointer receiver, exact declaration name/kind/receiver and original UTF-16 range. Generic receivers, interface members, other symbol kinds, build selection, type checking, call targets and runtime behavior are not scored. All 1,102 source files are officially parseable; 19 generic receiver declarations in grpc-go are excluded. Baseline/candidate declaration TP/FP/FN are Gin 1277/0/63 -> 1340/0/0 and grpc-go 9532/0/260 -> 9792/0/0. These denominators do not establish language-wide quality.

Gin candidate has no parser errors; grpc-go retains two errors in channelz/grpc_channelz_v1/channelz.pb.go while its scored FuncDecl ranges remain valid. Complete raw facts remain equal in 948/1102 files. Relationships in changed files were not all independently type-checked; returned query evidence is separately checked against original source. CRLF/UTF-16 and malformed-source oracle helper checks are retained in oracle-contract.json.

## Retrieval failures and service cost

Gin tasks preserve their original v0.550.1 manifest and first results; this batch treats them as development/regression cases. The new grpc-server-lifecycle-tasks.json truth was manually frozen before any product query. Neither queries nor source facts were changed to fit output, and this batch was not tuned against the new grpc-go tasks. Each task/build has one fresh CLI correctness invocation (ten total); those process times may overlap tests and are diagnostic only.

Five tasks retain only 6/8 required primary task-file pairs versus 7/8 before, while source facts increase 13/31 -> 18/31. Gin URL flow gains five source facts but loses context.go as a primary file; its Next-body facts remain absent. The middleware task remains 3/6. The known grpc-go Server.Serve query misses server.go and all five facts in both builds despite the restored declaration. Graceful-stop evidence remains 5/8. These are real retrieval failures, not environment omissions: this batch passes the scoped declaration oracle but does not pass complete task-retrieval acceptance.

All slower cases are retained in the maintained report. Five eight-pair persistent-reader comparisons produce 80 measured service calls, ten warmups and ten final comparisons. No tests, build, AST oracle, indexing or quality job ran concurrently. Separate old/new indexes represent the changed extraction; results differ and are independently scored rather than assumed equal. Service time excludes host admission, CLI startup, sync, MCP transport and full Agent completion/query cost. No universal speedup, full precision or complete flow-retrieval claim is made.

## Upgrade verification, checks and reproduction

On a separate Gin copy of the protected old index, default CLI find returns FRESH_INDEX_REQUIRED, indexer-version-changed and writerState=disabled. Adding --sync-if-stale synchronizes under ownership, re-extracts facts, advances the generation and returns handleHTTPRequest with a fresh status. grpc-go is upgraded with normal sync on its own disposable copy. The original Gin input index remains unchanged. This does not prove recovery of CMA122X on another computer. Initialization/sync overlapped correctness tests and their raw durations are diagnostic only.

Typecheck, build, 80 focused Go tests, all 3,497 tests (four existing skips), and the 58-language minimum matrix pass. The initial full-suite 21 failures were twenty old current-extractor assertions and the benchmark-domain layout list; their first log remains, and assertions/layout were synchronized before rerunning. No positive/negative behavior assertion or fixed task truth was relaxed. These checks do not erase the retrieval failures above.

Frozen baseline is %TEMP%/SymbolLattice-v5501-compound-candidate at 4ce75792e19647aa135b59f6389dda02b9651c30aeecce54fcf4e9b3a2784b12; candidate is %TEMP%/SymbolLattice-v5502-boolean-candidate at 443be69a3d097fd95813d6ca2e31d3c842f03c657d6b40c786f96169fd743457. The data directory is %TEMP%/SymbolLattice-v5502-validation. Preserve the products and separate indexed copies when rerunning:

```powershell
node benchmarks/go/declarations.mjs $ginPinned $goExe $ginReport $baselineBuild $candidateBuild
node benchmarks/go/declarations.mjs $grpcPinned $goExe $grpcReport $baselineBuild $candidateBuild
node (Join-Path $env:TEMP "SymbolLattice-v5502-validation/quality.mjs")
node (Join-Path $env:TEMP "SymbolLattice-v5502-validation/timing.mjs")
```

quality.mjs records fixed manifests, products and protected baseline index hashes and uses benchmarks/mcp/task-retrieval.mjs. timing.mjs gates the final passing test/depth logs and uses benchmarks/mcp/paired-explore.mjs with --candidate-project, --pairs 8, --persistent-reader and --comparison timing-only. These local replay scripts expect the preserved external paths. For arbitrary external paths, use the maintained tools and their explicit arguments. Timing-only means outputs differ; compare quality to frozen truth first.

[The same language report](../../docs/language-verification-and-speed.md) contains every task score, all five timing rows, uncertainty, hashes, and the preserved 58-language historical table. Only Go is remeasured this batch; previous TypeScript/JavaScript/Python values retain their versions, and 54 languages still lack actual task-speed measurements.
