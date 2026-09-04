# Benchmark and evidence tooling

These tools generate or validate large-project evidence outside the published npm package. They may require fixed external corpora, built `dist/` files, disposable indexed copies, language runtimes, or explicit output paths.

`automatic` means focused tests import the module and verify its bounded truth, scoring, lifecycle, or negative-matrix contract. It does not mean CI downloads or scans the external corpus. `manual` means the tool is retained for explicit evidence generation and has no direct automated test entry.

| Area | Files | Status |
| --- | --- | --- |
| `css/` | `correctness-oracle.mjs`, `lifecycle.mjs` | automatic |
| `html/` | `correctness-oracle.mjs` | automatic |
| `java/` | `correctness-oracle.mjs`, `JavaOracle.java` | automatic helper contract |
| `languages/` | `depth-matrix.mjs` | manual |
| `java/` | `lifecycle.mjs` | manual |
| `groovy/` | `correctness-oracle.mjs`, `GroovyOracle.groovy` | manual compiler oracle |
| `javascript/` | `correctness-oracle.mjs` | automatic |
| `python/` | `correctness-oracle.mjs`, `PythonOracle.py` | manual CPython stdlib AST oracle |
| `sfc/` | `correctness-oracle.mjs` | manual Vue/Svelte/Astro component relation oracle |
| `shell/` | `correctness-oracle.mjs` | manual mvdan ABI v2 direct-call oracle |
| `solidity/` | `correctness-oracle.mjs` | automatic solc AST private fixed-arity call oracle |
| `vbnet/` | `correctness-oracle.mjs`, `VbOracle.cs` | automatic scorer with manual Roslyn compiler oracle |
| `fortran/` | `correctness-oracle.mjs`, `FortranOracle.py` | automatic scorer with manual fparser project-call oracle |
| `jsp/` | `correctness-oracle.mjs` | automatic |
| `julia/` | `correctness-oracle.mjs`, `negative-matrix.mjs` | automatic |
| `julia/` | `lifecycle.mjs` | manual |
| `luau/` | `correctness-oracle.mjs`, `lifecycle.mjs`, `negative-matrix.mjs` | automatic |
| `luau/` | `approved-subset.mjs` | manual |
| `lua/` | `correctness-oracle.mjs` | manual tree-sitter worker call oracle |
| `perl/` | `correctness-oracle.mjs`, `negative-matrix.mjs` | automatic |
| `perl/` | `lifecycle.mjs` | manual |
| `r/` | `correctness-oracle.mjs`, `negative-matrix.mjs` | automatic |
| `r/` | `lifecycle.mjs` | manual |
| `mcp/` | `read-query-concurrency.mjs` | manual |
| `mcp/` | `strict-fresh-read-lifecycle.mjs` | manual |
| `filesystem/` | `operation-diagnostics-latency.mjs` | manual |

Always pass disposable workspaces and explicit output paths. Never write external corpora, `.SymbolLattice` indexes, generated JSON evidence, npm caches, or packed installations inside `benchmarks/`.
