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
> v0.257.0 is a developer preview. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher can update the project's `.symbol-lattice` index; add `--no-auto-sync` to disable it.

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

Alternatively, download the version-pinned `.tgz`, SHA-256 checksum, and manifest from [GitHub Releases](https://github.com/HsinPu/symbol-lattice/releases), then install the `.tgz` with npm. Every tagged release verifies the full suite, a clean installation, and build provenance first.

## What it does

- Scans multiple languages and common frameworks into a project-local code graph.
- Queries symbols, indexed files, calls, routes, entry points, impact, retained generations, and diffs.
- `files` queries only files persisted in the active generation, with anchored globs, flat/tree/grouped projections, explicit result/depth limits, graph counts, and freshness.
- Preserves the rule, stage, candidate targets, confidence, and resolution path behind every relation.
- Extension-framework route plugins resolve exact same-file and cross-file fixed-prefix mounts. `explain-edge` returns each mount segment and the ESM import/re-export path; dynamic or ambiguous composition is never guessed into a route.
- Projects can register versioned reference resolver plugins that only see relations left unresolved by built-in resolvers. The host bounds candidates, validates results, and preserves collisions, exceptions, or unsafe choices as explainable unresolved evidence.
- Framework fact plugins can add validated symbols, routes, entry points, and pending references from framework syntax. Stable IDs, containment edges, output bounds, source ranges, and provenance remain host-owned.
- Framework project plugins can inspect frozen project-wide facts after per-file extraction and add cross-file pending references or bounded route-prefix projections. The host creates route identities, moves relations, and retains plugin provenance plus each mount segment.

## Plugin extensions

```js
// plugins/acme.mjs
export const symbolLatticePlugin = {
  schemaVersion: 1,
  frameworkFactPlugins: [{
    id: "acme/framework-facts",
    version: "1.0.0",
    languages: ["typescript"],
    extract: () => ({ symbols: [], references: [] })
  }]
};
```

```bash
node dist/cli/main.js init /path/to/project --plugin ./plugins/acme.mjs
```

One manifest may provide `frameworkFactPlugins`, `frameworkProjectPlugins`, and `referenceResolverPlugins`. Repeat `--plugin` as needed; the same arguments flow through watch, MCP configuration, install, doctor, and uninstall. Plugins are trusted in-process JavaScript, not a sandbox. SymbolLattice never discovers or executes project modules implicitly. By default, only `.js`, `.mjs`, and `.cjs` files whose real paths stay inside the project are accepted; add `--allow-external-plugin` to trust an explicit external path.

## Common commands

| Command | Purpose |
| --- | --- |
| `init <path>` | Create a graph. |
| `sync <path>` | Explicitly synchronize or repair a graph. |
| `watch <path>` | Watch and synchronize in the foreground. |
| `files [path]` | List persisted files by glob, flat view, tree, or language group. |
| `investigate <query>` | Expand textual evidence into structural context. |
| `impact <symbol>` | Trace bounded impact through exact static relations. |
| `explain-edge <edge-id>` | Inspect the complete evidence for one relation. |
| `upgrade [version]` | Preview, verify, or explicitly apply a GitHub Release upgrade. |
| `serve --mcp` | Start the MCP stdio host. |
| `mcp-doctor <target>` | Read-only diagnosis of an Agent MCP configuration, CLI, and index. |
| `mcp-install <target>` | Preview or, with `--apply --yes`, safely write an MCP configuration. |
| `mcp-uninstall <target>` | Preview or, with `--apply --yes`, remove the matching MCP entry. |

`upgrade` produces a read-only plan by default. `--verify` downloads and checks the `.tgz`, SHA-256 checksum, manifest, and GitHub Artifact Attestations API evidence without installing. `--apply --yes` supports only local or global npm layouts, installs the verified local bytes, and then proves the CLI version. Source checkouts and `npx` are never changed automatically; downgrades also require `--allow-downgrade`.

```bash
symbol-lattice upgrade --check
symbol-lattice upgrade 0.257.0 --verify
symbol-lattice upgrade 0.257.0 --apply --yes
```

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
