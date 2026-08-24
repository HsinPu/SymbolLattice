# Repository automation

This directory contains repository automation only. Product runtime code belongs in `src/`, and large-project evidence tooling belongs in `benchmarks/`.

| Area | Entrypoints | Responsibility and side effects |
| --- | --- | --- |
| `build/` | `copy-shell-parser-assets.mjs`, `copy-lua-parser-assets.mjs` | Verify retained parser manifests, licenses, and provenance, then copy the closed asset sets from `src/assets/` into a clean `dist/assets/` destination. |
| `install/` | `github-source-install.mjs` | Preview or execute the fixed-ref GitHub source installation used by root `install.ps1`. Apply mode creates temporary workspaces and can update the current user's npm global prefix with rollback protection. |
| `release/` | `release-contract.mjs`, `verify-mcp-worker-generation.mjs` | Create release checksums/manifests and verify MCP read-worker generation behavior. Release contract execution writes only to the explicit output directory; worker verification uses and removes a unique temporary project. |

The public bootstrap remains `install.ps1` at the repository root. Keep package-script names stable and update their internal paths when automation files move.

Do not place benchmark corpora, indexes, generated reports, npm caches, packed installs, or release artifacts in this directory.
