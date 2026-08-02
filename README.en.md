<div align="center">

# SymbolLattice

**Queryable, explainable, local-first code intelligence**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | [English](README.en.md)

</div>

> [!IMPORTANT]
> v0.181.0 is a developer preview and is not published to npm. Run it from source.

SymbolLattice builds a queryable local code-symbol graph for a project. Every relation retains its rule, resolution stage, and confidence; `exact`, `heuristic`, and `unresolved` evidence are never conflated.

## Quick start

Requires Node.js 22.13 or newer, below 25, and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Explicitly create a local index
node dist/cli/main.js init /path/to/project

# Read-only queries; explicitly synchronize after source changes
node dist/cli/main.js routes --project /path/to/project --method GET
node dist/cli/main.js sync /path/to/project

# Start a read-only MCP host
node dist/cli/main.js serve --mcp --project /path/to/project
```

On Windows PowerShell, use `npm.cmd` if `npm` is unavailable. Index data stays in the target project's `.symbol-lattice/index.sqlite`.

## v0.181.0 highlights

- Spring `@ConfigurationProperties` now supports concrete `@Bean` functions in direct Kotlin `@Configuration` classes; prefix relations originate from the function symbol and are traceable to every configuration leaf.
- `@Configuration`, `@Bean`, and `@ConfigurationProperties` each require an exact direct import or fully-qualified Spring name. The prefix must be one positional literal or one `prefix =` literal.
- The established per-leaf resolver, `0.85` confidence, explicit unresolved ambiguity, source-value omission, and explicit-sync re-projection remain intact.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- `init` and `sync` are explicit writes. CLI and MCP queries remain read-only.
- A relation needs reproducible static evidence. Otherwise it remains unresolved instead of guessed.

## Static-analysis boundaries

- Spring `@ConfigurationProperties` supports direct Java/Kotlin classes, direct top-level Java `record` declarations, and concrete Java/Kotlin `@Bean` members in direct `@Configuration` classes.
- The factory-method path does not infer runtime bean registration or binding. Nested classes, Kotlin `object` factories, abstract/interface/top-level functions, alias or wildcard imports, `value =`, multiple attributes, dynamic prefixes, profiles, precedence, and environment overrides remain out of scope.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```

## License

[MIT](LICENSE)
