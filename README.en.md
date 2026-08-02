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
> v0.169.0 is a developer preview and is not published to npm. Run it from source.

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

## v0.169.0 highlights

- Direct Java `@Value("${key}")` fields now link to nested configuration keys in conventional `application` and `bootstrap` YAML files, such as `server.port`.
- Only one parser-proven YAML or `.properties` candidate creates an `exact` relation. Profile, cross-format, and duplicate keys remain `unresolved` instead of assuming precedence.
- YAML accepts only a single document with plain mapping ancestry and single-line literal leaves; anchors, tags, sequences, aliases, and values are never retained as graph data.

## Principles

- Indexing and querying stay local; source is never silently uploaded.
- `init` and `sync` are explicit writes. CLI and MCP queries remain read-only and never update the graph themselves.
- A relation needs reproducible static evidence. Otherwise it remains unresolved instead of guessed.

## Static-analysis boundaries

- Spring Boot YAML supports only direct, proven literal `@Value` placeholders on Java class fields. Kotlin, `@ConfigurationProperties`, relaxed binding, lists, merge keys, dynamic values, config imports, active profiles, and runtime precedence remain outside analysis.
- COBOL CICS accepts only a direct `RETURN` or `START` completed by `END-EXEC` with one literal `TRANSID`. Its target must be the unique indexed, pre-`PROCEDURE DIVISION`, `TRAN`-named literal owner; because the CICS CSD is external configuration, this remains `heuristic`, not a runtime guarantee.
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
