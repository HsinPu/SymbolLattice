<div align="center">

# SymbolLattice

**Evidence-first, local-first code graphs and bounded code context for AI agents**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | English

</div>

> [!IMPORTANT]
> v0.429.0 is a developer preview installed from a fixed revision of the official GitHub repository; SymbolLattice is not published to the npm Registry. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher may update the project's `.SymbolLattice` index; add `--no-auto-sync` to disable it.

## What it is

SymbolLattice scans a local repository, persists a code graph, and exposes CLI/MCP queries for files, symbols, calls, imports, inheritance, routes, entry points, bounded impact paths, and source-backed context. Every relationship carries source range, resolution stage, confidence, and rule evidence.

Relationships that cannot be proven exactly remain unresolved or pending instead of becoming false exact edges.

v0.429.0 deepens Python scanning. Fixed official GitHub source commits are CPython 3.13.11 (`627894459a84be3488a1789919679c997056a03c`), Django 5.2.15 (`21e98408f84d22191e2c7ee4052bdd12d264fd3f`), and Home Assistant Core 2026.8.0 (`4a9dce13f61d03960ad5d2710e2af9fd2a78af54`); extractor v324 and resolver v156 provide large-project evidence for declarations, containment, relative imports, bounded class instantiation, inheritance, calls, and async identities. The frozen acceptance subset reached TP 300 / FP 0 / FN 0 / evidenceInvalid 0, with 150 / 150 negative cases passing; 38 lifecycle operations covering fresh, no-op, comment, semantic, rename, delete, restore, reopen, and invalid configuration also passed. This is bounded static analysis, not a claim to support every Python runtime, reflection path, dynamic dispatch, or arbitrary metaprogramming; relationships that cannot be uniquely proven remain unresolved or pending, or are omitted.

## Supported languages

SymbolLattice currently discovers and indexes 57 languages. A single `init` or `sync` scans every matching language in the same repository; languages do not need to be selected individually. This list means the files can be scanned and represented in the graph, not that every language has identical parsing depth. Dynamic relationships that cannot be proven from static source remain unresolved or pending, or are omitted.

| Category | Languages |
| --- | --- |
| Recently validated deeply on large projects | TypeScript, Java, HTML, CSS, JavaScript, JSP, Python |
| Web, component, and template languages | ArkTS, Vue, Svelte, Astro, Razor, PHP, Blade, Liquid, Twig, CFML |
| JVM, .NET, and application languages | Groovy, Kotlin, Scala, C#, F#, VB.NET, Dart |
| Systems and native languages | C, C++, Objective-C, Rust, Go, Swift, Zig, Nim, Fortran, Ada, Pascal, COBOL |
| Scripting and data processing | Python, Ruby, Perl, Lua, Luau, R, Julia, Shell, SQL |
| Functional and BEAM languages | Elixir, Erlang, Clojure, Haskell, OCaml |
| Infrastructure, data, and schemas | Terraform/OpenTofu, Nix, YAML, XML, Java Properties, GraphQL, Protocol Buffers, Solidity |

## Quick start

Requires Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/SymbolLattice.git
cd SymbolLattice
npm ci
npm run build

node dist/cli/main.js init /path/to/project
node dist/cli/main.js sync /path/to/project
node dist/cli/main.js find createOrder --project /path/to/project --json
node dist/cli/main.js explore "Trace createOrder to persistence" --project /path/to/project --json
```

## Install the CLI from GitHub

Requires Git, Node.js `>=22.13 <25`, npm, and Windows PowerShell 5.1 or PowerShell 7. Select a full 40-character commit or a version tag on GitHub first; floating refs such as `main` and `HEAD` are rejected.

```powershell
$ref = "<FULL_40_CHARACTER_COMMIT_OR_VX.Y.Z>"
$bootstrap = Join-Path ([IO.Path]::GetTempPath()) ("SymbolLattice-bootstrap-" + [guid]::NewGuid().ToString("N"))

try {
    git clone --filter=blob:none --no-checkout https://github.com/HsinPu/SymbolLattice.git $bootstrap
    git -C $bootstrap fetch --depth 1 origin $ref
    git -C $bootstrap checkout --detach FETCH_HEAD

    # Preview the source, npm prefix, and steps without writing anything
    & (Join-Path $bootstrap "install.ps1") -Ref $ref

    # Install into the current user's npm global prefix only after review
    & (Join-Path $bootstrap "install.ps1") -Ref $ref -Apply -Yes
}
finally {
    if (Test-Path -LiteralPath $bootstrap) {
        Remove-Item -LiteralPath $bootstrap -Recurse -Force
    }
}
```

The source installer clones the fixed ref again into its own unique workspace, verifies origin, commit, lockfile, type check, build, package, isolated CLI, and MCP, then installs the global CLI with rollback protection. It removes that workspace on success and retains diagnostics after a rolled-back failure. It does not edit Codex configuration or create a project index.

After installing the CLI, explicitly create an index in the repository where you want to use it:

```powershell
cd C:\path\to\project
SymbolLattice init .
```

## Install for Codex

The Codex installer also previews its plan by default and does not write anything:

```bash
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

It jointly manages the `mcp_servers.SymbolLattice` table in global `~/.codex/config.toml` and the section bounded by `SYMBOL_LATTICE_START` / `SYMBOL_LATTICE_END` in global `~/.codex/AGENTS.md`. Existing files receive full backups before modification; if either file fails preflight or writing, installation stops or rolls back attempted changes.

Removal is also preview-first and removes only SymbolLattice-owned content:

```bash
SymbolLattice uninstall codex
SymbolLattice uninstall codex --apply --yes
```

The installer never creates or deletes a project index automatically. Restart Codex or open a new task after installation so the new MCP configuration is loaded.

## Upgrading from v0.420.0 or earlier

v0.429.0 does not provide aliases for the old names and does not read the old index. Use this order:

```bash
# Remove the old Codex MCP configuration while the old CLI is still available
symbol-lattice uninstall codex --apply --yes

# Remove the old npm package, then use "Install the CLI from GitHub" above
npm uninstall -g @hsinpu/symbol-lattice

# Install the new Codex configuration and create a new index in each project
SymbolLattice install codex --apply --yes
cd /path/to/project
SymbolLattice init .
SymbolLattice doctor codex
```

| Previous surface | v0.429.0 |
| --- | --- |
| npm package | `@hsinpu/symbollattice` |
| CLI | `SymbolLattice` |
| Codex MCP entry | `mcp_servers.SymbolLattice` |
| MCP tools | `SymbolLattice_*` |
| Project index | `.SymbolLattice` |

If the old CLI is no longer available, remove the old MCP table from `~/.codex/config.toml` manually before running the new installer. The old `.symbol-lattice` directory is never deleted automatically; retain it for rollback until the new `.SymbolLattice` queries are verified, then clean it up manually.

## MCP

```bash
node dist/cli/main.js serve --mcp --project /path/to/project

# Disable background index updates completely
node dist/cli/main.js serve --mcp --project /path/to/project --no-auto-sync
```

MCP queries do not directly run `init` or `sync`. Use the CLI's `init`, `sync`, or `watch` when you need to control indexing.

## Common commands

| Command | Purpose |
| --- | --- |
| `init` / `sync` | Build or explicitly refresh a project graph. |
| `status` | Inspect generation and freshness. |
| `files` / `file` | List or read persisted source. |
| `find` / `node` | Find and inspect a symbol. |
| `callers` / `callees` | Query static call relationships. |
| `routes` / `entrypoints` | Inspect framework routes and entry points. |
| `impact` / `affected` | Run bounded impact analysis. |
| `context` / `explore` | Retrieve agent-ready code context. |
| `explain-edge` | Inspect the complete evidence for one edge. |

Run `node dist/cli/main.js <command> --help` for all options.

## Limits

SymbolLattice is a static code graph and code-intelligence tool. It is not a complete compiler, type checker, runtime tracer, RDF ontology, or general reasoning engine. Dynamic dispatch, reflection, macros, code generation, dependency injection, and external package types may remain unresolved.

## Verification

```bash
npm run check
npm test
npm run build
npm run verify:mcp-worker-generation
npm pack --dry-run
```

## License

[MIT](LICENSE)
