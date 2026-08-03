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
> v0.243.0 is a developer preview that runs from source. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher can update the project's `.symbol-lattice` index; add `--no-auto-sync` to disable it.

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

## Framework route extensions

Extend static framework routes with a scoped, validated descriptor. The core—not the extension—parses source and writes graph facts. TypeScript or JavaScript receiver routes require an exact ESM import, a `const` zero-argument constructor, a literal path, and a named handler. TypeScript decorator routes require an exact import, a non-static method with a body, and one literal absolute path. Unsupported composition produces no route fact. The registry is never auto-loaded from a project and its fingerprint is part of the extractor version, so a descriptor change makes persisted facts stale.

```ts
import {
  createFrameworkRoutePluginExtractor,
  createFrameworkRoutePluginRegistry
} from "@hsinpu/symbol-lattice";

const registry = createFrameworkRoutePluginRegistry([
  {
    id: "acme/lattice-router",
    languages: ["typescript", "javascript"],
    moduleSpecifier: "@acme/lattice-router",
    factoryExport: "Router",
    routeMethods: [{ methodName: "get", routeMethod: "GET" }],
    decoratorRoutes: [{ decoratorExport: "Get", routeMethod: "GET" }],
    surfaces: ["exact named Router imports", "const HTTP routes", "TypeScript decorator routes"]
  }
]);

const extractor = createFrameworkRoutePluginExtractor(registry);
// Pass `extractor` as the third SymbolLatticeService constructor argument.
```

## MCP configuration

Supported targets: `codex`, `claude`, `cursor`, `opencode`, `gemini`, `kiro`, `hermes`, `antigravity`, and `generic-json`.

```bash
# Preview first: no configuration, backup, or index write
node dist/cli/main.js mcp-install claude --project /path/to/project --json

# Apply only after reviewing the plan: full backup first, then atomic update
node dist/cli/main.js mcp-install claude --project /path/to/project --apply --yes --json

# Preview a removal first; neither the file nor sibling MCP entries are deleted
node dist/cli/main.js mcp-uninstall claude --project /path/to/project --json

# Remove only SymbolLattice's owned MCP entry after explicit confirmation
node dist/cli/main.js mcp-uninstall claude --project /path/to/project --apply --yes --json

# Read-only diagnosis of the existing configuration, CLI, and index
node dist/cli/main.js mcp-doctor claude --project /path/to/project --json
```

`mcp-install` and `mcp-uninstall` both preview by default; an applied plan creates a full backup before an atomic update. They change only SymbolLattice's MCP entry in the selected Agent configuration and preserve sibling entries; the uninstaller never deletes the selected configuration file. They refuse to write an existing file they cannot safely parse. `mcp-config` remains output-only: it produces a copy-and-paste snippet and never reads or writes an Agent configuration. `generic-json` requires an explicit `--config /path/to/mcp.json`.

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
| `mcp-uninstall <target>` | Preview or, with `--apply --yes`, safely remove its owned MCP entry. |

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
