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
> v0.185.0 is a developer preview and is not published to npm. Run it from source.

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

## v0.185.0 highlights

- Spring Web now recognizes multiple class prefixes on direct `@RequestMapping`: Java `{ "/api", "/v2" }` and Kotlin `["/api", "/v2"]`. Each unique prefix is cross-producted with every proven method route.
- The controller annotation, `@RequestMapping`, and `RequestMethod` each require an exact direct import or fully-qualified Spring name. Class prefixes may be positional, `path =`, or `value =` static strings / literal collections; method paths remain one static string.
- Every route links to its local handler with `exact` evidence. Empty or duplicate method collections, duplicate or conditional prefixes, dynamic paths, alias/wildcard imports, default ALL mappings, and runtime routing remain deliberately excluded.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- `init` and `sync` are explicit writes. CLI and MCP queries remain read-only.
- A relation needs reproducible static evidence. Otherwise it remains unresolved instead of guessed.

## Static-analysis boundaries

- Spring Web supports direct top-level concrete Java/Kotlin controllers, one or more literal class prefixes, literal HTTP shortcut annotations, and one or more provable, unique `RequestMethod` enums on method-level `@RequestMapping`. Default ALL, empty/duplicate collections, conditions, proxies, nested declarations, and runtime routing remain out of scope.
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
