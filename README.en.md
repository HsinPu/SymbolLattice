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
> v0.239.0 is a developer preview and runs from source. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher can update the project's `.symbol-lattice` index; add `--no-auto-sync` to disable it.

## Quick start

Requires Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Create a project-local graph
node dist/cli/main.js init /path/to/project

# Query evidence-backed structural context
node dist/cli/main.js investigate "user token" --project /path/to/project --json
```

## MCP configuration

`mcp-config` only generates a copy-and-paste fragment. It does not detect, read, or modify an Agent configuration file. Supported targets are `codex`, `claude`, `cursor`, `opencode`, `gemini`, `kiro`, `hermes`, `antigravity`, and `generic-json`.

```bash
# Claude project configuration (local by default)
node dist/cli/main.js mcp-config claude --project /path/to/project --print-snippet

# Cursor global configuration binds the currently opened workspace with ${workspaceFolder}
node dist/cli/main.js mcp-config cursor --location global --project /path/to/project --print-snippet

# Codex uses global configuration; --source pins this checkout's Node entrypoint
node dist/cli/main.js mcp-config codex --project /path/to/project --source --print-snippet
```

`claude`, `cursor`, `opencode`, `gemini`, and `kiro` generate project-local configuration by default and also accept `--location global`. `codex`, `hermes`, and `antigravity` support global configuration only. To refresh the graph manually, generate the entry with `--no-auto-sync`, then run:

For OpenCode and Antigravity, omit `--print-snippet` first to receive the `destination` metadata. It lists alternate paths needed for an existing configuration file or migration state.

```bash
node dist/cli/main.js sync /path/to/project
```

`mcp-doctor` reads only the selected Agent configuration and checks the expected entry, CLI availability, and the project index. It never runs MCP, updates a configuration file, or writes an index.

```bash
# Diagnose through the Agent's conventional configuration destination
node dist/cli/main.js mcp-doctor claude --project /path/to/project

# generic JSON needs the exact configuration file to inspect
node dist/cli/main.js mcp-doctor generic-json --config /path/to/mcp.json --project /path/to/project
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
| `mcp-config <target>` | Generate a target-specific, output-only MCP configuration fragment. |
| `mcp-doctor <target>` | Read-only diagnosis of an Agent MCP configuration, CLI, and project index. |

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
