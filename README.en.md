<div align="center">

# SymbolLattice

**Evidence-first, local code intelligence**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) · [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.110.0 is an early developer release. Run this repository from source; the npm package remains private and unpublished.

## Positioning

SymbolLattice creates a queryable local code-symbol graph and preserves the rule, resolution stage, and confidence behind every relationship. Index data stays in the inspected project's `.symbol-lattice/index.sqlite`; source code is not silently uploaded.

License: MIT.

## Core capabilities

- Builds syntax-proven file, symbol, containment, import/export, type-hierarchy, route, entrypoint, and cross-file graph facts.
- Creates exact edges only when the proof is direct; ambiguous candidates remain unresolved or heuristic evidence instead of runtime guesses.
- Covers frontend, backend, JVM, scientific-computing, systems, native, data, IaC, template, and schema sources, including TypeScript, Java, Groovy, Fortran, Ada, Python, Go, Rust, C/C++, C#, PHP, Ruby, Kotlin, Swift, Dart, SQL, GraphQL, Protocol Buffers, Terraform, YAML, and XML.
- Includes a CLI and read-only MCP queries for symbols, relationships, routes, entrypoints, generation history, diffs, affected tests, automatic-sync health, project owner leases, session timelines, and durable diagnostics.

## Quick start

Requirements: Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Create a local graph for one project
node dist/cli/main.js init /path/to/project

# Query the indexed graph
node dist/cli/main.js find add --project /path/to/project
node dist/cli/main.js explain-edge "edge:<edge-id>" --project /path/to/project

# Start MCP: catch up a stale existing index, then let one project-owner watcher keep it fresh
node dist/cli/main.js serve --mcp --project /path/to/project

# From an MCP client, retrieve the latest eight watcher diagnostic events
# symbol_lattice_auto_sync_diagnostics { "limit": 8 }

# Retrieve the latest eight persisted watcher transitions for this project
# symbol_lattice_auto_sync_journal { "limit": 8 }
```

On Windows PowerShell, use `npm.cmd` when `npm` is unavailable. Filesystem roots and home directories are rejected unless `--force` is explicitly supplied.

## v0.110.0 highlights

- Before automatic sync starts, `serve --mcp` and `watch` acquire an exclusive SQLite owner lock at `.symbol-lattice/auto-sync-owner.sqlite`; only that host starts the watcher and writes graph updates for the project.
- A competing MCP host still serves read-only queries but does not start a watcher. `symbol_lattice_auto_sync_status` and diagnostics report `autoSync.state: "blocked"` with a PID- and path-free `ownerLease` reason.
- `--no-auto-sync` neither acquires nor creates an owner lock, preserving an explicit read-only MCP mode. Normal shutdown releases the lock; the SQLite operating-system lock does not rely on an expiring PID file.

Use `--sync-interval <ms>` to tune fallback polling, `--poll` to disable native event acceleration, or `--no-diagnostic-journal` to disable journal writes. Run `init` once first; manual `sync` remains useful for repair and CI.

## Deliberate limits

- This is not a compiler, full language parser, type checker, framework runtime, or execution tracer.
- Dynamic dispatch, reflection, macros, code generation, dependency injection, and ambiguous name matches are never promoted to exact graph relations.
- Groovy, Fortran, and Ada remain conservative first slices: only complete direct units are retained; members, cross-file, and runtime relations are not inferred, and ambiguous source is skipped.
- The Koa, Hono, and Elysia slices cover direct receiver routes only; prefixes, mounts, nested apps, `basePath` / `group` / `use` / `route` / `on`, CommonJS, dynamic paths, and inline/member handlers are not inferred.
- Default MCP background sync only operates on initialized projects and never changes the stored index scope. Filesystem roots and home directories still require explicit `--force`.
- The SQLite owner lock serializes one foreground watcher for one project only; it is not a daemon, socket registry, distributed leader-election protocol, worker pool, or cross-machine coordination mechanism.
- Automatic-sync status and the session timeline describe the current default MCP host only. The durable journal is a bounded 128-event operational record, not a tamper-proof audit log or complete lifecycle record.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```
