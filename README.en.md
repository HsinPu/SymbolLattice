<div align="center">

# SymbolLattice

**Queryable, explainable, evidence-first local code intelligence**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.191.0 is a developer preview and is not published to npm. Run it from source.

SymbolLattice builds a queryable local code-symbol graph. Every relation retains its rule, resolution stage, and confidence; exact, heuristic, and unresolved evidence are never conflated.

## Quick start

Requires Node.js 22.13 or newer, below 25, and npm.

~~~bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Explicitly create a local index
node dist/cli/main.js init /path/to/project

# Queries remain read-only; explicitly synchronize after source changes
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# Start a read-only MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
~~~

On Windows PowerShell, use npm.cmd if npm is unavailable. Index data stays in the target project's .symbol-lattice/index.sqlite.

## v0.191.0 highlights

- Supports the official React Native Codegen implementation shape for Java and Kotlin Spec subclasses: a directly imported or fully-qualified Spec superclass, a proven getName() module identity, and a direct override method.
- A Codegen native method becomes a cross-language target only when exactly one project-local TypeScript TurboModule module-plus-method contract matches it.
- Direct Registry, TypeScript spec, default-import, and static default re-export edges retain dedicated Codegen rules; zero or multiple contracts stay unresolved.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- init and sync are explicit writes. CLI and MCP queries remain read-only.
- A relation needs reproducible static evidence. Otherwise it remains unresolved instead of guessed.

## Static-analysis boundaries

- Codegen accepts only the intersection of a direct superclass, a literal or class-local immutable getName() value, Java @Override or Kotlin override methods, and one unique TypeScript contract.
- It does not scan build output or infer runtime registration, dynamic names, indirect wrappers, Swift implementations, or custom macro wrappers.
- React Native also covers strict NativeModules, direct TurboModule Registry, TypeScript specs, and static re-export chains anchored at proven local default exports.

## Verification

~~~bash
npm run check
npm test
npm run build
git diff --check
~~~

## License

[MIT](LICENSE)
