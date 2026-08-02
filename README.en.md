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
> v0.195.0 is a developer preview. Run it from source.

SymbolLattice builds a queryable local code-symbol graph. Every relation retains its rule, evidence stage, and confidence; exact, heuristic, and unresolved evidence are never conflated.

## Quick start

Requires Node.js 22.13 or newer, below 25, and npm.

```bash
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
```

On Windows PowerShell, use `npm.cmd` if npm is unavailable. Index data stays in the target project's `.symbol-lattice/index.sqlite`.

## v0.195.0 highlights

- Direct Swift `extension TypeName` declarations and their direct methods now remain queryable syntax containers; they are never misrepresented as inheritance.
- An `RCT_EXTERN_*` bridge gains an exact, explainable Swift `references` edge only when one same-file top-level class explicitly declares `@objc(Class)` and the extension method explicitly declares `@objc(selector)`.
- Extensions in another file, non-unique class candidates, bare `@objc`, and inferred selectors never use a name- or convention-based bridge fallback.
- The expanded Swift interop facts persist in SQLite, so a reopened index can trace an Objective-C bridge to a Swift implementation inside an extension.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- `init` and `sync` are explicit writes. CLI and MCP queries remain read-only.
- JavaScript calls point first to the Objective-C bridge declaration; a separately proven bridge-to-Swift edge preserves the cross-language runtime boundary.

## Static-analysis boundaries

- Only direct, single-line `RCT_EXTERN_MODULE`, `RCT_EXTERN_REMAP_MODULE`, and matching method macros are accepted.
- Swift retains direct top-level `extension TypeName` declarations and their direct methods. An extension method becomes a bridge implementation only with one same-file, explicitly named `@objc(Class)` class and an explicit `@objc(selector)`; type names are never joined across files.
- Bare `@objc`, inferred selectors, qualified or parameterized extension targets, wrapper macros, and dynamic registration are not guessed.
- Build output, runtime registration, reflection, code generation, and ambiguous candidates are never presented as exact relations.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```

## License

[MIT](LICENSE)
