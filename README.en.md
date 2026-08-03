<div align="center">

# SymbolLattice

**Queryable, explainable, evidence-first local code intelligence**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | English

</div>

> [!IMPORTANT]
> v0.237.0 is a developer preview and runs from source. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher can update the project's `.symbol-lattice` index; add `--no-auto-sync` to disable it.

## Quick start

Requires Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Create a project-local graph
node dist/cli/main.js init /path/to/project

# Query indexed code evidence
node dist/cli/main.js investigate "user token" --project /path/to/project --json
```

## MCP configuration

`mcp-config` generates a copy-and-paste entry only. It never changes an agent configuration file.

```bash
# Paste the output into ~/.codex/config.toml. The default assumes symbol-lattice is on PATH.
node dist/cli/main.js mcp-config codex --project /path/to/project --print-snippet

# Invoke this built source checkout through Node instead of relying on PATH.
node dist/cli/main.js mcp-config codex --project /path/to/project --source --print-snippet

# Produce a generic MCP JSON fragment.
node dist/cli/main.js mcp-config generic-json --project /path/to/project --print-snippet
```

Generated configuration pins an explicit absolute `--project` path. With the default auto-sync mode, the background watcher performs startup catch-up and incremental updates. To make refreshing fully manual, generate the entry with `--no-auto-sync` and run:

```bash
node dist/cli/main.js sync /path/to/project
```

## What it provides

- Each relation retains its rule, evidence stage, resolution status, and confidence; `exact`, `heuristic`, and `unresolved` are never conflated.
- SQLite immutable generations preserve graph history and diffs, Git hunks, bounded impact paths, and affected tests.
- A multi-language, framework-aware capability catalog supports proven routes, entrypoints, cross-file imports, and re-exports.
- MCP reads run through a separate worker pool; a query handler never receives the writer capability.

## Common commands

| Command | Purpose |
| --- | --- |
| `init <path>` | Create a graph. |
| `sync <path>` | Explicitly synchronize or repair a graph. |
| `watch <path>` | Watch and synchronize in the foreground. |
| `investigate <query>` | Expand lexical evidence into explainable structural context. |
| `impact <symbol>` | Trace bounded impact through exact static relations. |
| `serve --mcp` | Start the MCP stdio host. |
| `mcp-config <target>` | Generate a safe Codex or generic JSON configuration fragment. |

## Verification

```bash
npm run check
npm test
npm run build
npm run benchmark:mcp
npm run verify:mcp-worker-generation
```

## License

[MIT](LICENSE)
