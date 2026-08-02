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
> v0.192.0 is a developer preview and is not published to npm. Run it from source.

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

## v0.192.0 highlights

- Supports a no-argument Objective-C RCT_EXPORT_MODULE() by deriving its module name from the implementation class and removing the documented RCT or RK prefix.
- Supports RCT_REMAP_METHOD with its explicit JavaScript method name and distinct source-rule evidence from RCT_EXPORT_METHOD.
- NativeModules calls resolve exactly to the corresponding iOS macro method, including SQLite persistence, reopen, and callers-query verification.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- init and sync are explicit writes. CLI and MCP queries remain read-only.
- A relation needs reproducible static evidence. Otherwise it remains unresolved instead of guessed.

## Static-analysis boundaries

- Objective-C accepts only a direct bridge header, exactly one direct RCT_EXPORT_MODULE, and direct RCT_EXPORT_METHOD or RCT_REMAP_METHOD macros. A duplicate JavaScript method name emits no native target.
- Android Codegen accepts only the intersection of a direct Spec superclass, a proven getName(), a direct override, and one unique TypeScript TurboModule contract.
- It does not scan build output or infer runtime registration, dynamic names, indirect wrappers, Swift implementations, or custom macro wrappers.

## Verification

~~~bash
npm run check
npm test
npm run build
git diff --check
~~~

## License

[MIT](LICENSE)
