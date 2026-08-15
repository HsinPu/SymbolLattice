<div align="center">

# SymbolLattice

**Evidence-first, local-first code graphs and bounded code context for AI agents**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | English

</div>

> [!IMPORTANT]
> v0.420.0 is a developer preview. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher may update the project's `.symbol-lattice` index; add `--no-auto-sync` to disable it.

## What it is

SymbolLattice scans a local repository, persists a code graph, and exposes CLI/MCP queries for files, symbols, calls, imports, inheritance, routes, entry points, bounded impact paths, and source-backed context. Every relationship carries source range, resolution stage, confidence, and rule evidence.

Relationships that cannot be proven exactly remain unresolved or pending instead of becoming false exact edges.

## Quick start

Requires Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

node dist/cli/main.js init /path/to/project
node dist/cli/main.js sync /path/to/project
node dist/cli/main.js find createOrder --project /path/to/project --json
node dist/cli/main.js explore "Trace createOrder to persistence" --project /path/to/project --json
```

## Install for Codex (v0.420.0 candidate)

Install the public CLI, then explicitly create an index in the repository where you want to use it:

```bash
npm install -g @hsinpu/symbol-lattice
cd /path/to/project
symbol-lattice init .
```

The Codex installer previews its plan by default and does not write anything:

```bash
symbol-lattice install codex
symbol-lattice install codex --apply --yes
symbol-lattice doctor codex
```

It jointly manages the `mcp_servers.symbol_lattice` table in global `~/.codex/config.toml` and the section bounded by `SYMBOL_LATTICE_START` / `SYMBOL_LATTICE_END` in global `~/.codex/AGENTS.md`. Existing files receive full backups before modification; if either file fails preflight or writing, installation stops or rolls back attempted changes.

Removal is also preview-first and removes only SymbolLattice-owned content:

```bash
symbol-lattice uninstall codex
symbol-lattice uninstall codex --apply --yes
```

The installer never creates or deletes a project index automatically. v0.420.0 passed isolated npm installation, MCP stdio cwd verification, and an on-device check from a new Codex task. That task loaded the SymbolLattice MCP server and resolved the current repository `C:\Users\win10\Desktop\Graph\symbol-lattice` as its project path.

## TypeScript self-hosting evidence (carried forward from v0.419.1)

This release work evaluates bounded, exact-safe relations in fixed TypeScript scopes. It does **not** claim complete TypeScript coverage or correctness for every TypeScript project, language feature, runtime path, or dynamic relation.

- Stage 2 established 250 compiler-grounded positive truths and 100 negative assertions.
- Stage 3 scored **TP 250 / FP 0 / FN 0** on that fixed corpus.
- Stage 4's fixed A/B evaluation recorded 4/4 successful tasks for each arm, with no token-performance claim.
- Stage 5 evaluated the MIT-licensed NestJS v11.1.16 tree at peeled commit `315e698…`: 1,659 TypeScript files and about 108,540 lines. Its fixed oracle scored **TP 300 / FP 0 / FN 0**, plus 150 negative assertions. The final fresh index reported 1,748 files, 18,125 symbols, 46,141 edges, and 15,394 pending references; the incremental checks passed 9/9 and the MCP check recorded zero fallbacks and zero worker crashes. These figures come from v0.419.1 extractor v307 and resolver v150; the v0.420.0 installer work does not change the analysis engine.

The public npm aliases run the internal Stage 5 tools and deliberately require explicit project and output arguments:

```bash
npm run benchmark:typescript-large-oracle -- --project /path/to/project ...
npm run benchmark:typescript-large-index-evidence -- --project /path/to/project --output evidence.json
npm run benchmark:typescript-large-incremental -- --project /path/to/disposable-project ...
npm run verify:typescript-self-hosting-mcp -- --project /path/to/indexed-project ...
```

Use each script's required-argument message as the canonical parameter reference. These tools can write their requested output and, where applicable, an index under the project supplied to them; use a disposable copy for experiments.

`benchmark:typescript-self-hosting` and `check:typescript-self-hosting` require the complete repository source, tests, and tsconfig files. They are checkout-only development commands, not part of the public npm-pack tool surface.

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
npm run benchmark:capabilities
npm run verify:mcp-worker-generation
npm run benchmark:mcp
npm run benchmark:comparison
npm pack --dry-run
```

## License

[MIT](LICENSE)
