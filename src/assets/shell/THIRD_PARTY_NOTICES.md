# Shell parser third-party notices

SymbolLattice distributes the Shell parser WASM asset together with the full
license texts indexed below. The SymbolLattice MIT license does not replace
these notices.

| Component | Fixed version/source | License | Notice file |
| --- | --- | --- | --- |
| `mvdan.cc/sh/v3` | v3.13.1, commit `2f3f5e36d9b0f8f14c998d50aa20a28832205ae8` | BSD-3-Clause | `mvdan-sh-BSD-3-Clause.txt` |
| TinyGo runtime/compiler portions | v0.41.1, commit `a4f9c9d1b6703211d20dca57d92c42afa44493cd` | BSD-3-Clause | `TinyGo-BSD-3-Clause.txt` |
| Go standard-library portions | Go 1.25.13 | BSD-3-Clause | `Go-BSD-3-Clause.txt` |
| LLVM compiler-rt builtins | TinyGo v0.41.1 vendored copy | Apache-2.0 WITH LLVM-exception | `LLVM-compiler-rt-Apache-2.0-WITH-LLVM-exception.txt` |
| Binaryen build tool | version_132, commit `79dfe6b412a3c22bfdb190ed6a4d79adf734db5d` | Apache-2.0 | `Binaryen-Apache-2.0.txt` |

Binaryen is a build-time transformer rather than a runtime import. It remains
in the build provenance and SBOM. The inspected TinyGo and Binaryen Windows
binary archives omitted top-level license files, so their notice texts were
taken from the exact official source tags and hash-pinned. For deterministic
source ownership, the Binaryen, LLVM compiler-rt, and TinyGo texts use only a
`CRLF-to-LF-only` line-ending normalization; Go and mvdan/sh retain their raw
bytes. `provenance.json` records both retained and distributed hashes, and
`asset-manifest.json` is the package-time integrity closure for this directory.
