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
> v0.270.0 is a developer preview. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher can update the project's `.symbol-lattice` index; add `--no-auto-sync` to disable it.

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

# Restrict immutable Git hunk attribution to one exact file or directory
node dist/cli/main.js git-hunks /path/to/project --base origin/main --path-prefix src/domain --json

# Scope Git changes and select affected tests with a custom pattern
node dist/cli/main.js affected --working-tree --project /path/to/project --path-prefix src/domain --test-pattern "scenarios/**/*.scenario.ts" --json

# Resolve one unique suffix and read numbered, generation-bound source
node dist/cli/main.js file service.ts --project /path/to/project --offset 1600 --limit 120
```

Alternatively, download the version-pinned `.tgz`, SHA-256 checksum, and manifest from [GitHub Releases](https://github.com/HsinPu/symbol-lattice/releases), then install the `.tgz` with npm. Every tagged release verifies the full suite, a clean installation, and build provenance first.

## What it does

- Scans multiple languages and common frameworks into a project-local code graph.
- Queries symbols, indexed files, calls, routes, entry points, impact, retained generations, and diffs.
- `files` queries only files persisted in the active generation, with path-segment-safe filtering, anchored globs, flat/tree/grouped projections, and safe cursor pagination. `src` never includes `src2`, and cursors bind to the generation and selection filters.
- `file` defaults to a compact numbered human view with dependency, selection, generation, and freshness context; `--json` keeps the stable machine contract. Exact paths are preferred, unique suffixes are accepted, ambiguity is never guessed, and an offset past EOF fails clearly. YAML and properties files expose structure without content values.
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

One manifest may provide `frameworkFactPlugins`, `frameworkProjectPlugins`, and `referenceResolverPlugins`. Repeat `--plugin` as needed; the same arguments flow through watch, watch-start, MCP configuration, install, doctor, and uninstall. Plugins are trusted in-process JavaScript, not a sandbox. SymbolLattice never discovers or executes project modules implicitly. By default, only `.js`, `.mjs`, and `.cjs` files whose real paths stay inside the project are accepted; add `--allow-external-plugin` to trust an explicit external path.

## Common commands

| Command | Purpose |
| --- | --- |
| `init <path>` | Create a graph. |
| `sync <path>` | Explicitly synchronize or repair a graph. |
| `watch <path>` | Watch and synchronize in the foreground. |
| `watch-start [path]` | Preview or explicitly start one manageable background auto-sync host. |
| `watch-status [path]` | Read index freshness, durable events, and local host live/stale/unverifiable state. |
| `watch-stop <host-id> [path]` | Preview or explicitly ask one registered host to stop itself safely. |
| `files [path]` | Page persisted files by glob, projection, and generation-bound cursor. |
| `file <path>` | Read a numbered human view; add `--json` for the stable contract. |
| `git-hunks [path] --base <ref>` | Filter immutable Git hunk attribution with optional `--path-prefix`. |
| `affected --working-tree` | Scope Git changes with `--path-prefix`, then optionally replace conventional test naming with `--test-pattern`. |
| `investigate <query>` | Expand textual evidence into structural context. |
| `impact <symbol>` | Trace bounded impact through exact static relations. |
| `explain-edge <edge-id>` | Inspect the complete evidence for one relation. |
| `upgrade [version]` | Preview, verify, or explicitly apply a GitHub Release upgrade. |
| `serve --mcp` | Start the MCP stdio host. |
| `mcp-doctor <target>` | Read-only diagnosis of an Agent MCP configuration, CLI, and index. |
| `mcp-install <target>` | Preview or, with `--apply --yes`, safely write an MCP configuration. |
| `mcp-uninstall <target>` | Preview or, with `--apply --yes`, remove the matching MCP entry. |

`watch-status` only uses a PID signal-0 probe to observe process existence; it does not start, stop, or synchronize a watcher. PID reuse cannot prove process identity, and journal state is only the latest evidence in the bounded window.

`watch-start` produces a read-only plan by default. Applying it requires `--apply --yes --approval <fingerprint>`; the approval binds the project, Node/CLI paths, launch arguments, and SHA-256 of executable JavaScript inputs. It starts the background `watch` without a shell and verifies host ID, PID, version, and registration before reporting success. A registration timeout never sends a signal to an unknown process.

`watch-stop` only creates an approval bound to the project's real path and the complete host record by default. Applying it requires `--apply --yes --approval <fingerprint>`. It writes a short-lived local request that the target host validates before shutting itself down; it never sends TERM, KILL, or another signal to a PID.

`upgrade` produces a read-only plan by default. `--verify` downloads and checks the `.tgz`, SHA-256 checksum, manifest, and GitHub Artifact Attestations API evidence without installing. `--apply --yes` supports only local or global npm layouts, installs the verified local bytes, and then proves the CLI version. Source checkouts and `npx` are never changed automatically; downgrades also require `--allow-downgrade`.

```bash
symbol-lattice upgrade --check
symbol-lattice upgrade 0.267.0 --verify
symbol-lattice upgrade 0.267.0 --apply --yes
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
