<div align="center">

# SymbolLattice

**Evidence-first, queryable local code intelligence**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.128.0 is an early developer release. The package is not published to npm; run it from source.

SymbolLattice builds a queryable local code-symbol graph for a project. Each relation retains its source rule, resolution stage, and confidence. Source remains in the indexed project's `.symbol-lattice/index.sqlite` and is never silently uploaded.

## Highlights

- Builds AST-backed facts for files, symbols, imports/exports, type hierarchy, routes, entrypoints, and cross-file relations.
- Makes uncertainty explicit: relations are `exact`, `heuristic`, or `unresolved`, never silently upgraded to certainty.
- Covers frontend, backend, JVM, systems, data, IaC, template, and schema languages with bounded, auditable framework route extraction.
- Offers CLI and read-only MCP queries for symbols, relations, routes, entrypoints, impact, history, diffs, and index status.

## Quick start

Requires Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Explicitly create a local index
node dist/cli/main.js init /path/to/project

# Read-only queries; explicitly sync only after source changes
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js routes --project /path/to/project --domain api.example.test
node dist/cli/main.js sync /path/to/project

# Start a read-only MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
```

On Windows PowerShell, use `npm.cmd` if `npm` is unavailable. Filesystem roots and home directories are rejected unless `--force` is explicit.

## v0.128.0

- GoFrame v1/v2 now exactly projects literal `Server.Domain(...)` registrations for `BindHandler`, `BindObjectMethod`, selected `BindObject`, and `BindObjectRest`, retaining exact host/domain evidence per route.
- Route records now return `domain` (`null` without a host condition). CLI `routes --domain <host>` and MCP `symbol_lattice_routes` expose the same exact filter.
- Route projection now preserves domain identity to prevent symbol-ID collisions. The extractor advances to `multi-language-ast-v110`; the next explicit `sync` re-extracts unchanged source facts.

## Deliberate limits

- This is not a compiler, type checker, framework runtime, or execution tracer.
- Dynamic dispatch, reflection, macro expansion, code generation, dependency injection, and ambiguous names never become exact graph relations.
- GoFrame Domain extraction accepts only proven literal, non-wildcard hosts. Dynamic values, empty entries, wildcards, and rebound receivers remain unresolved.
- Other frameworks expose only implemented, evidence-backed slices; see [CHANGELOG.md](CHANGELOG.md) for the full history.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```
