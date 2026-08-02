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
> v0.186.0 is a developer preview and is not published to npm. Run it from source.

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

## v0.186.0 highlights

- New React Native `NativeModules` bridge support links direct JS/TS calls to Java, Kotlin, and Objective-C native implementations by both module and method name.
- Java/Kotlin require exact import proof for `ReactContextBaseJavaModule`, a literal `getName()`, and `@ReactMethod`; Objective-C requires `RCTBridgeModule`, one `RCT_EXPORT_MODULE`, and direct `RCT_EXPORT_METHOD` macros.
- Unique Android and iOS implementations become separate `exact` edges. Same-platform collisions remain `unresolved` rather than selecting an arbitrary target.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- `init` and `sync` are explicit writes. CLI and MCP queries remain read-only.
- A relation needs reproducible static evidence. Otherwise it remains unresolved instead of guessed.

## Static-analysis boundaries

- React Native currently covers the strict `NativeModules` bridge only. TurboModule/codegen, runtime registration, indirect or dynamic names, Swift, and custom macro wrappers remain out of scope.
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
