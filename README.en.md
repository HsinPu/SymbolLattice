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
> v0.240.0 is a developer preview that runs from source. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher can update the project's `.symbol-lattice` index; add `--no-auto-sync` to disable it.

## Quick start

Requires Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Create a project-local graph
node dist/cli/main.js init /path/to/project

# Query explainable structural context
node dist/cli/main.js investigate "user token" --project /path/to/project --json
```

## MCP configuration

Supported targets: `codex`, `claude`, `cursor`, `opencode`, `gemini`, `kiro`, `hermes`, `antigravity`, and `generic-json`.

```bash
# Preview first: no configuration, backup, or index write
node dist/cli/main.js mcp-install claude --project /path/to/project --json

# Apply only after reviewing the plan: full backup first, then atomic update
node dist/cli/main.js mcp-install claude --project /path/to/project --apply --yes --json

# Read-only diagnosis of the existing configuration, CLI, and index
node dist/cli/main.js mcp-doctor claude --project /path/to/project --json
```

`mcp-install` changes only SymbolLattice's MCP entry in the selected Agent configuration and preserves sibling entries. It refuses to overwrite an existing file it cannot safely parse. `mcp-config` remains output-only: it produces a copy-and-paste snippet and never reads or writes an Agent configuration. `generic-json` requires an explicit `--config /path/to/mcp.json`.

## Common commands

| Command | Purpose |
| --- | --- |
| `init <path>` | Create a graph. |
| `sync <path>` | Explicitly synchronize or repair a graph. |
| `watch <path>` | Watch and synchronize in the foreground. |
| `investigate <query>` | Expand textual evidence into explainable structural context. |
| `impact <symbol>` | Trace bounded impact through exact static relations. |
| `serve --mcp` | Start the MCP stdio host. |
| `mcp-config <target>` | Produce an output-only MCP configuration snippet. |
| `mcp-doctor <target>` | Read-only diagnosis of an Agent MCP configuration, CLI, and project index. |
| `mcp-install <target>` | Preview or, with `--apply --yes`, safely write an MCP configuration. |

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
