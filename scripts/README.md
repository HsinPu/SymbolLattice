# Repository automation

This directory contains repository automation only. Product runtime code belongs in `src/`, and large-project evidence tooling belongs in `benchmarks/`.

| Area | Entrypoints | Responsibility and side effects |
| --- | --- | --- |
| `build/` | `copy-shell-parser-assets.mjs`, `copy-lua-parser-assets.mjs` | Verify retained parser manifests, licenses, and provenance, then copy the closed asset sets from `src/assets/` into a clean `dist/assets/` destination. |
| `build/` | `generate-go-parser.mjs` | Regenerate checked-in TypeScript parser tables from pinned `@lezer/go` grammar, changing only the optional range-clause binding; retain upstream MIT notices. `--check` verifies deterministic output without writing files and runs before every build. |
| `install/` | `github-source-install.mjs` | Preview or execute the fixed-ref GitHub source installation used by root `install.ps1`. Apply mode creates temporary workspaces and can update the current user's npm global prefix with rollback protection. |
| `release/` | `release-contract.mjs`, `verify-mcp-worker-generation.mjs`, `verify-local-pack.mjs` | Create release checksums/manifests, verify MCP read-worker generations, and test real prepack plus isolated tarball CLI/MCP installation. The pack verifier rebuilds local `dist`, uses and removes a unique temporary installation/cache, optionally writes an explicit JSON report, and never updates the global npm prefix. |

The public bootstrap remains `install.ps1` at the repository root. Keep package-script names stable and update their internal paths when automation files move.

Do not place benchmark corpora, indexes, generated reports, npm caches, packed installs, or release artifacts in this directory.
