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
> v0.101.0 is an early developer release. Run this repository from source; the npm package remains private and unpublished.

## Positioning

SymbolLattice creates a queryable local code-symbol graph and preserves the rule, resolution stage, and confidence behind every relationship. Index data stays in the inspected project's `.symbol-lattice/index.sqlite`; source code is not silently uploaded.

License: MIT.

## Core capabilities

- Builds syntax-proven file, symbol, containment, import/export, type-hierarchy, route, entrypoint, and cross-file graph facts.
- Creates exact edges only when the proof is direct; ambiguous candidates remain unresolved or heuristic evidence instead of runtime guesses.
- Covers frontend, backend, JVM, scientific-computing, native, data, IaC, template, and schema sources, including TypeScript, Java, Groovy, Fortran, Python, Go, Rust, C/C++, C#, PHP, Ruby, Kotlin, Swift, Dart, SQL, GraphQL, Protocol Buffers, Terraform, YAML, and XML.
- Includes a CLI and read-only MCP queries for symbols, relationships, routes, entrypoints, generation history, diffs, and affected tests.

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
```

On Windows PowerShell, use `npm.cmd` when `npm` is unavailable. Filesystem roots and home directories are rejected unless `--force` is explicitly supplied.

## v0.101.0 highlights

- Adds Fortran `.f`, `.for`, `.f77`, `.f90`, `.f95`, `.f03`, `.f08`, and `.f18` source discovery.
- Complete direct `module`, `program`, `subroutine`, and `function` units receive source ranges and exact `contains` evidence; a `program` uses the existing `module` symbol kind.
- Keeps Traditional Chinese as the default README, with this equally concise English counterpart.

## Deliberate limits

- This is not a compiler, full language parser, type checker, framework runtime, or execution tracer.
- Dynamic dispatch, reflection, macros, code generation, dependency injection, and ambiguous name matches are never promoted to exact graph relations.
- The first Groovy slice excludes members, trait composition, Grails, Gradle DSLs, and dynamic metaprogramming. Any unmasked script-scope `/` (including slashy/dollar-slashy strings and division) conservatively rejects the file instead of risking false symbols.
- The first Fortran slice excludes `contains` members, interface/submodule/derived-type contents, cross-file module relations, and runtime behavior. A generic `END` used to close a supported unit, continuation, or incomplete structure rejects the file.
- Updating a graph requires an explicit `sync` or `index`; MCP queries remain read-only.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```

Each version includes a Traditional Chinese comparison report outside the project at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v<version>.md`.
