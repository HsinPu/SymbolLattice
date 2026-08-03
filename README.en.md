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
> v0.246.0 is a developer preview that runs from source. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher can update the project's `.symbol-lattice` index; add `--no-auto-sync` to disable it.

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

## What it does

- Scans multiple languages and common frameworks into a project-local code graph.
- Queries symbols, calls, routes, entry points, impact, retained generations, and diffs.
- Preserves the rule, stage, candidate targets, confidence, and resolution path behind every relation.
- For extension-framework routes projected through a fixed prefix chain, `explain-edge` returns each ordered mount segment with its receiver, method, prefix, and source location.

## Framework route extensions

Use a validated, project-scoped descriptor to extend static route recognition. Supported receiver routes require an exact ESM import, a `const` zero-argument constructor, a literal path, and a named handler. `mountMethods` project only a same-file, same-descriptor, unique fixed non-root prefix chain of up to 16 segments; dynamic, duplicate, cyclic, trailing-slash, overloaded, or deeper chains emit no child route fact.

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
    mountMethods: [{ methodName: "mount" }],
    surfaces: ["exact named imports", "const literal routes", "fixed prefix mounts"]
  }
]);

const extractor = createFrameworkRoutePluginExtractor(registry);
```

Pass `extractor` as the third `SymbolLatticeService` constructor argument.

## Common commands

| Command | Purpose |
| --- | --- |
| `init <path>` | Create a graph. |
| `sync <path>` | Explicitly synchronize or repair a graph. |
| `watch <path>` | Watch and synchronize in the foreground. |
| `investigate <query>` | Expand textual evidence into structural context. |
| `impact <symbol>` | Trace bounded impact through exact static relations. |
| `explain-edge <edge-id>` | Inspect the complete evidence for one relation. |
| `serve --mcp` | Start the MCP stdio host. |
| `mcp-doctor <target>` | Read-only diagnosis of an Agent MCP configuration, CLI, and index. |
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
