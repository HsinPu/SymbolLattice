<div align="center">

# SymbolLattice

**Evidence-first, local-first code graphs and code context for AI agents**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | English

</div>

> [!IMPORTANT]
> v0.362.0 is a developer preview. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher may update the project's `.symbol-lattice` index; add `--no-auto-sync` to disable it.

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

## v0.362.0 usability snapshot

The repeatable smoke matrix checks committed cases against the exported language and framework registries instead of treating README claims as proof.

- All 54 registered languages complete `init`, no-op `sync`, changed `sync`, file inventory, full-identity symbol lookup, and a B1 relation receipt.
- All 54 languages now prove at least one reliable behavioral or dependency relationship beyond `contains`, completing the first B1 depth-alignment pass.
- Ruby uses a literal Rails route to a controller method, Shell uses a bounded top-level `export -f` function reference, and SQL uses a bounded view-to-table reference.
- Astro and Razor validate components bound to static page routes.
- Terraform validates an output traversal to one unique same-file resource; GraphQL validates a type implementing one interface; Proto validates an RPC referencing unique same-file request and response messages.
- SQL validates a bounded view-to-table reference. These schema and IaC relations do not claim complete dialect, schema-validation, plan/apply, or runtime-linkage semantics.
- Relation receipts bind complete symbol identities. Edge-based receipts also require exact endpoints, `resolution: exact`, and `confidence: 1`; file-structure receipts require an exact path and complete symbol identity.
- The capability release gate blocks any partial, scan-only, or unavailable language case while still retaining honest partial diagnostics for framework cases.
- Groovy validates unique direct same-file class inheritance; CFML validates a structurally isolated `.cfc` remote entry point bound to its handler. Dynamic general calls remain conservatively excluded from exact edges.
- Representative React Router, Next.js, Vue Router, SvelteKit, Astro, Spring Web, FastAPI, Django, and ASP.NET Core cases produce the expected route.
- Nuxt Vue files scan and query successfully, but there is no dedicated Nuxt route capability yet.

B1 depth alignment requires a reliable relationship beyond file containment; it does not mean all 54 languages have equal cross-file or framework depth.

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
