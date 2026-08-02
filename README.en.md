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
> v0.166.0 is a developer preview and is not published to npm. Run it from source.

SymbolLattice builds a queryable local code-symbol graph for a project. Every relation keeps its rule, resolution stage, and confidence; `exact`, `heuristic`, and `unresolved` evidence are never conflated.

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

## v0.166.0 highlights

- Astro `src/pages/**/*.astro` now supports whole-segment `[slug]` parameters and final `[...parts]` rest parameters, producing navigation routes such as `/blog/:slug` and `/docs/*parts`.
- Dynamic-directory `index.astro` pages use the same default component, route query, impact analysis, and auditable evidence as existing static pages.
- The framework capability catalog explicitly exposes static, parameter, and final-rest support for safer tool integration.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- `init` and `sync` are explicit writes. CLI and MCP queries remain read-only and never update the graph themselves.
- A relation needs reproducible static evidence. Otherwise it remains unresolved instead of guessed.

## Static-analysis boundaries

- Astro navigation covers `.astro` files beneath `src/pages`; parameters must occupy a whole path segment, names must be unique, and a rest parameter must be final. TypeScript/JavaScript endpoints, MDX, optional parameters, routing configuration, and middleware are not yet `exact`.
- Django `Class.as_view()` accepts only an undecorated, unique, top-level local class declared before final `urlpatterns` without rebinding; the call must be direct and argument-free. It does not infer framework inheritance or runtime `as_view` behavior.
- Dynamic composition, external or namespace packages, parent-relative imports, copied or container values, decorated or imported classes, WebSockets, `add_route`, versioning, and ambiguous targets never become `exact` results.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```

## License

[MIT](LICENSE)
