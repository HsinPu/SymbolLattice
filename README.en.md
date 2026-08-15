<div align="center">

# SymbolLattice

**Evidence-first, local-first code graphs and bounded code context for AI agents**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | English

</div>

> [!IMPORTANT]
> v0.421.0 is a breaking developer preview with new package, CLI, MCP, and index names. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher may update the project's `.SymbolLattice` index; add `--no-auto-sync` to disable it.

## What it is

SymbolLattice scans a local repository, persists a code graph, and exposes CLI/MCP queries for files, symbols, calls, imports, inheritance, routes, entry points, bounded impact paths, and source-backed context. Every relationship carries source range, resolution stage, confidence, and rule evidence.

Relationships that cannot be proven exactly remain unresolved or pending instead of becoming false exact edges.

## Quick start

Requires Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/SymbolLattice.git
cd SymbolLattice
npm install
npm run build

node dist/cli/main.js init /path/to/project
node dist/cli/main.js sync /path/to/project
node dist/cli/main.js find createOrder --project /path/to/project --json
node dist/cli/main.js explore "Trace createOrder to persistence" --project /path/to/project --json
```

## Install for Codex

Install the public CLI, then explicitly create an index in the repository where you want to use it:

```bash
npm install -g @hsinpu/symbollattice
cd /path/to/project
SymbolLattice init .
```

The Codex installer previews its plan by default and does not write anything:

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

v0.421.0 does not provide aliases for the old names and does not read the old index. Use this order:

```bash
# Remove the old Codex MCP configuration while the old CLI is still available
symbol-lattice uninstall codex --apply --yes

# Replace the global npm package
npm uninstall -g @hsinpu/symbol-lattice
npm install -g @hsinpu/symbollattice

# Install the new Codex configuration and create a new index in each project
SymbolLattice install codex --apply --yes
cd /path/to/project
SymbolLattice init .
SymbolLattice doctor codex
```

| Previous surface | v0.421.0 |
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
