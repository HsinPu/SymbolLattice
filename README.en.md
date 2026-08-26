<div align="center">

# SymbolLattice

**Evidence-first local code graphs with traceable code context for developers and AI agents.**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | English

</div>

SymbolLattice scans a local repository, persists files, symbols, and static relationships as a queryable code graph, and exposes search, call relationships, routes, entry points, impact analysis, and source context through a CLI and MCP.

Every relationship carries a source range, resolution stage, confidence, and rule evidence. Relationships that cannot be proven reliably remain unresolved or pending, or are omitted instead of becoming false exact edges.

Current version: v0.444.0

## Highlights

- Scan multi-language, framework-aware repositories in one graph.
- Query symbols, callers, callees, inheritance, imports, routes, and entry points.
- Assess changes with `impact`, `affected`, and Git hunk information.
- Produce bounded, source-backed agent context and `explore` results.
- Persist generations with incremental sync, history, and diff support.
- Use the graph through the CLI or read-only MCP query handlers.

> [!IMPORTANT]
> MCP queries are read-only, but `serve --mcp` can start local automatic synchronization by default and update the `.SymbolLattice` index. Add `--no-auto-sync` to disable background updates completely.

## Supported scope

One `init` or `sync` can process a multi-language repository. Analysis depth varies by language; runtime or dynamic relationships that cannot be uniquely proven from static source are not presented as exact.

| Category | Languages and formats |
| --- | --- |
| Deeply validated on large projects | TypeScript, Java, HTML, CSS, JavaScript, JSP, Python, Ruby, Shell, Lua, Luau, Julia, Perl, R |
| Web and templates | ArkTS, Vue, Svelte, Astro, Razor, PHP, Blade, Liquid, Twig, CFML |
| JVM, .NET, and applications | Groovy, Kotlin, Scala, C#, F#, VB.NET, Dart |
| Systems and native | C, C++, Objective-C, Rust, Go, Swift, Zig, Nim, Fortran, Ada, Pascal, COBOL |
| Data, configuration, and schemas | SQL, GraphQL, Protocol Buffers, Terraform/OpenTofu, Nix, YAML, XML, Java Properties, Solidity |
| Functional and BEAM | Elixir, Erlang, Clojure, Haskell, OCaml |

Java depth includes explicit imports, annotations, generic direct heritage and object creation, plus evidence from `build.gradle(.kts)` or module-named Gradle build scripts; duplicate qualified types, wildcard or static imports, lambda-contained construction, anonymous interfaces, and external classpaths remain conservatively omitted.

v0.441.0 skips common cache and generated directories by default without blanket-excluding dot directories; sources under unlisted paths such as `.github`, `.devcontainer`, and `.storybook` remain eligible. Explicit scopes can opt into default-excluded paths, while hard exclusions remain non-overridable. Root and nested `.gitignore` files follow Git parent re-inclusion semantics. If a non-excluded path returns `EACCES` or `EPERM`, index and sync do not publish a partial generation; existing queries retain the previous generation and report it as stale.

v0.442.0 accelerates watcher reconciliation by checking exact pending paths that already belong to the active index first. Once staleness is proven, the same generation-bound observation is reused for one full scan and one atomic generation publication. New files, renames, directories, configuration or ignore changes, unknown events, truncated batches, and generation switches still use complete verification.

v0.443.0 makes Agent guidance aware of restricted environments. A global npm CLI that appears missing behind a sandbox access boundary is no longer treated as proof that SymbolLattice is uninstalled. When MCP is unavailable, an Agent may retry only the same already-authorized command and project scope once through sandbox escalation; it must not substitute an unauthorized write-capable command. If escalation is unavailable, denied, or still fails, the Agent reports the boundary before using a targeted fallback.

v0.444.0 fixes cache traversal in workspace projects. The workspace resolver no longer performs a separate recursive filesystem walk; it consumes only `package.json` candidates already filtered by the shared scoped walker, including default exclusions, explicit scopes, and nested `.gitignore` rules. Excluded caches such as nested `backend/.pytest_cache` are therefore never read and cannot block initial indexing with `EPERM`, while valid workspace manifests and explicit override semantics remain intact.

## Install the CLI

Requires Git, Node.js `>=22.13 <25`, npm, and Windows PowerShell 5.1 or PowerShell 7.

SymbolLattice is not published to the npm Registry. Install from a full 40-character commit in the official GitHub repository, or from an available version tag. Floating refs such as `main` and `HEAD` are rejected.

```powershell
$ref = "<FULL_40_CHARACTER_COMMIT_OR_VX.Y.Z>"
$bootstrap = Join-Path ([IO.Path]::GetTempPath()) ("SymbolLattice-bootstrap-" + [guid]::NewGuid().ToString("N"))

try {
    git clone --filter=blob:none --no-checkout https://github.com/HsinPu/SymbolLattice.git $bootstrap
    git -C $bootstrap fetch --depth 1 origin $ref
    git -C $bootstrap checkout --detach FETCH_HEAD

    # Preview only; this does not install or modify Codex
    & (Join-Path $bootstrap "install.ps1") -Ref $ref

    # Install into the current user's npm global prefix after review
    & (Join-Path $bootstrap "install.ps1") -Ref $ref -Apply -Yes
}
finally {
    if (Test-Path -LiteralPath $bootstrap) {
        Remove-Item -LiteralPath $bootstrap -Recurse -Force
    }
}
```

The source installer verifies the fixed source, lockfile, type check, build, npm package, isolated CLI, and MCP before performing a rollback-protected global installation. It does not edit Codex configuration or create a project index.

## Quick start

Explicitly create an index in the repository you want to query:

```powershell
cd C:\path\to\project
SymbolLattice init .

SymbolLattice status .
SymbolLattice find createOrder --project . --json
SymbolLattice explore "Trace createOrder to persistence" --project . --json
```

Explicitly synchronize after files change:

```powershell
SymbolLattice sync .
```

## Install for Codex

Codex setup is preview-only by default:

```powershell
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

`install codex` dynamically writes the absolute paths of the current Node executable and this installation's `dist/cli/main.js`. It does not depend on PATH or hard-code a user name, drive, or npm prefix; run it again after reinstalling or moving the package.

It manages only `mcp_servers.SymbolLattice` in global `~/.codex/config.toml` and the section bounded by `SYMBOL_LATTICE_START` / `SYMBOL_LATTICE_END` in global `~/.codex/AGENTS.md`. Existing files are backed up before writing. Setup itself does not immediately create or delete a project index. After setup, when an agent recognizes a software repository and the task requires understanding or changing code, the guidance tells it to run `SymbolLattice init .` automatically from the repository root if the index is missing. A monorepo governed by one outer `.git` is initialized once at that root; a workspace containing independent repositories is never initialized at the container root, and each relevant repository is initialized separately. Filesystem roots, home directories, Desktop roots, temporary directories, and dependency directories are never initialized automatically.

Restart Codex or open a new task after setup. Removal is also preview-first:

```powershell
SymbolLattice uninstall codex
SymbolLattice uninstall codex --apply --yes
```

## Common commands

| Command | Purpose |
| --- | --- |
| `init` / `sync` | Build or explicitly refresh a code graph. |
| `status` / `history` / `diff` | Inspect freshness and generation changes. |
| `files` / `file` | List or read persisted source. |
| `find` / `node` / `search` | Find and inspect symbols or source. |
| `callers` / `callees` / `hierarchy` | Query static relationships. |
| `routes` / `entrypoints` | Inspect framework entry points. |
| `impact` / `affected` / `git-hunks` | Assess change impact. |
| `context` / `explore` / `investigate` | Retrieve source-backed agent context. |
| `explain-edge` | Inspect the complete evidence for one edge. |
| `serve --mcp` | Start the MCP stdio server. |

Run `SymbolLattice <command> --help` for complete options.

## MCP and synchronization

```powershell
SymbolLattice serve --mcp --project C:\path\to\project

# Disable background index updates
SymbolLattice serve --mcp --project C:\path\to\project --no-auto-sync
```

MCP exposes only the primary `SymbolLattice_explore` tool by default so agents have one clear choice. It returns concise Markdown with line-numbered source instead of full diagnostic JSON; the CLI `explore --json` contract remains available for machines. v0.442.0 retains bounded SQLite subgraph reads, request-scoped adjacency, resilient filesystem discovery, and atomic generation publication while accelerating watcher reconciliation. Every specialist tool remains available: set `SYMBOL_LATTICE_MCP_TOOLS=node,impact` to add selected tools, or `all` to restore the complete surface. MCP query handlers do not directly execute `init`. When the MCP host's startup directory has no index, it still registers its tools but does not start a watcher for that directory; callers should pass the actual repository's `projectPath`. MCP initialize instructions and the Codex-managed guidance tell shell-capable agents to invoke the CLI automatically when the safety conditions are met and the index is missing. For a whole-workspace query, the agent passes each relevant repository's `projectPath` separately and combines the results; SymbolLattice does not present independent indexes as one graph with cross-repository edges. Index writes, manual synchronization, and watcher lifecycle remain CLI-controlled operations.

## Limits

SymbolLattice is a static code-graph and code-intelligence tool. It is not a complete compiler, type checker, runtime tracer, RDF ontology, or general reasoning engine. Dynamic dispatch, reflection, macros, code generation, dependency injection, metaprogramming, and external package types may remain unresolved or pending, or be omitted.

## Upgrading from v0.420.0 or earlier

Legacy names and indexes are not migrated or deleted automatically. Keep rollback copies, then use this order:

```powershell
symbol-lattice uninstall codex --apply --yes
npm uninstall -g @hsinpu/symbol-lattice

# Install the new CLI with the fixed-ref GitHub flow above
SymbolLattice install codex --apply --yes
cd C:\path\to\project
SymbolLattice init .
```

Remove old state only after the new CLI, Codex MCP entry, and `.SymbolLattice` index are verified.

## Development and verification

```bash
git clone https://github.com/HsinPu/SymbolLattice.git
cd SymbolLattice
npm ci
npm run check
npm test
npm run build
npm run verify:mcp-worker-generation
npm pack --dry-run
```

## License

[MIT](LICENSE)
