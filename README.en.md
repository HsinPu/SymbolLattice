<div align="center">

# SymbolLattice

**Evidence-first, local-first code graphs and code context for AI agents**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | English

</div>

> [!IMPORTANT]
> v0.396.0 is a developer preview. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher may update the project's `.symbol-lattice` index; add `--no-auto-sync` to disable it.

## What it is

SymbolLattice scans a local repository, persists a code graph, and exposes CLI/MCP queries for:

- Files, symbols, calls, imports, inheritance, routes, and entry points.
- Callers, callees, impact, affected paths, context, and cross-file exploration.
- Source ranges, resolution stages, confidence, and rule evidence for every relationship.

Relationships that cannot be proven exactly remain unresolved or pending instead of becoming false exact edges.

## Quick start

Requires Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Build a local graph
node dist/cli/main.js init /path/to/project

# Refresh it
node dist/cli/main.js sync /path/to/project

# Basic queries
node dist/cli/main.js files --project /path/to/project --json
node dist/cli/main.js find createOrder --project /path/to/project --json
node dist/cli/main.js callees createOrder --project /path/to/project --json
node dist/cli/main.js routes --project /path/to/project --json

# Bounded cross-file context for an agent
node dist/cli/main.js explore "Trace createOrder to persistence" --project /path/to/project --json
```

## v0.396.0 highlights

- Fixed-source acceptance uses official [`dotnet/samples`](https://github.com/dotnet/samples) at commit [`5fee0c35e0e8efc02a5234ed55bb2592f6d1b0b6`](https://github.com/dotnet/samples/tree/5fee0c35e0e8efc02a5234ed55bb2592f6d1b0b6), scanning the complete [`core/extensions/DllMapDemo/Map.cs`](https://github.com/dotnet/samples/blob/5fee0c35e0e8efc02a5234ed55bb2592f6d1b0b6/core/extensions/DllMapDemo/Map.cs). The three B1 truths are the `MapAndLoad` method identity, the `MapLibraryName` method identity, and the exact direct call from `MapAndLoad` to `MapLibraryName`; SymbolLattice and CodeGraph 1.5 both score `TP 3 / FP 0 / FN 0`.
- C# direct-call exactness now checks fixed parameter and call-argument counts, and fails closed for any preprocessing directive, default/`params`/extension parameters, overloads, partial or non-static classes, local/lambda shadows, and member or indirect calls. It does not claim complete overload resolution, type conversion, cross-file, or runtime semantics.
- Extractor facts advance to v274 and the resolver remains v143. If the .NET SDK or C# compiler is unavailable in the validation environment, native validation is marked environment-blocked rather than reported as passed or failed.

## MCP

```bash
node dist/cli/main.js serve --mcp --project /path/to/project

# Disable background index updates completely
node dist/cli/main.js serve --mcp --project /path/to/project --no-auto-sync
```

MCP queries do not directly run `init` or `sync`. Use the CLI's `init`, `sync`, `watch`, or an explicitly approved watcher flow when you need to control indexing.

## Common commands

| Command | Purpose |
| --- | --- |
| `init` | Build a project graph. |
| `sync` | Explicitly synchronize the index. |
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

SymbolLattice is a static code graph and code intelligence tool. It is not a complete compiler, type checker, runtime tracer, RDF ontology, or general reasoning engine. Dynamic dispatch, reflection, macros, code generation, dependency injection, and external package types may remain unresolved.

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
