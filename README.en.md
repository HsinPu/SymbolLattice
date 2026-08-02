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
> v0.188.0 is a developer preview and is not published to npm. Run it from source.

SymbolLattice builds a queryable local code-symbol graph. Every relation retains its rule, resolution stage, and confidence; `exact`, `heuristic`, and `unresolved` evidence are never conflated.

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

On Windows PowerShell, use `npm.cmd` if `npm` is unavailable. Index data stays in the target project's `.symbol-lattice/index.sqlite`.

## v0.188.0 highlights

- New cross-file TurboModule default-import support links direct calls such as `import Calendar from "./NativeCalendar"` back to a proven local TurboModule default export.
- The target must directly default-export a literal Registry result or immutable Registry binding. Ordinary default imports are never treated as React Native bridges.
- Both `NativeModules` and TurboModules resolve on module plus method name. Unique Android and iOS implementations stay as separate `exact` edges; same-platform collisions remain `unresolved`.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- `init` and `sync` are explicit writes. CLI and MCP queries remain read-only.
- A relation needs reproducible static evidence. Otherwise it remains unresolved instead of guessed.

## Static-analysis boundaries

- React Native currently covers strict `NativeModules`, direct TurboModule Registry and TypeScript specs, plus consumers of proven local default exports. Default-export re-export chains, Codegen-generated native base classes, runtime registration, indirect or dynamic names, Swift, and custom macro wrappers remain out of scope.
- Spring Web supports direct Java/Kotlin controllers, literal class prefixes, HTTP shortcuts, and provable `RequestMethod` collections; conditions, proxies, and runtime routing are not inferred.
- Spring `@ConfigurationProperties` supports direct Java/Kotlin classes, Java `record` declarations, and Java/Kotlin `@Bean` members in direct `@Configuration` classes.

## Verification

```bash
npm run check
npm test
npm run build
git diff --check
```

## License

[MIT](LICENSE)
