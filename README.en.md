# SymbolLattice

**Help AI agents find relevant code—and the evidence behind it.**

SymbolLattice is a local code search tool for developers and AI agents. Query a project through the CLI or MCP using a task description, symbol name, or file path, and retrieve source code, line numbers, and cross-file relationship evidence.

[繁體中文](README.md) · [Get started](docs/getting-started.en.md) · [Validation and limitations](benchmarks/README.md) · [Report an issue](https://github.com/HsinPu/SymbolLattice/issues)

`v0.527.4` · Node.js `>=22.13 <25` · MIT

## Start with “Where is this implemented?”

When exploring an unfamiliar project, investigating a bug, or preparing a change, you need to locate the implementation and understand how it connects to other files. SymbolLattice builds a local index so you can follow those questions through source evidence.

```powershell
SymbolLattice explore "Where are incoming requests validated?" --project . --json
```

Results can include:

- **Relevant files and symbols** to help locate implementations from a task description.
- **Verifiable source** with file paths, line numbers, and code excerpts to check the findings.
- **Relationships between code** through resolved calls, imports, inheritance, and framework entry points.
- **Open questions** including unresolved calls, source freshness, and result truncation.

Query from your terminal, or let an MCP-compatible agent use the evidence.

## Quick start

Requires Git, npm, Node.js `>=22.13 <25`, and Windows PowerShell 5.1 or PowerShell 7. Installation currently uses GitHub source; the package is not published to the npm Registry.

### 1. Install

Run in PowerShell. This clones the repository, resolves the checkout's full commit, and installs from that fixed commit:

```powershell
git clone https://github.com/HsinPu/SymbolLattice.git
if ($LASTEXITCODE -ne 0) { throw "Clone failed" }
Set-Location SymbolLattice
$ref = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Cannot resolve commit" }

# Preview the installation plan, then run the next line after reviewing it
.\install.ps1 -Ref $ref
.\install.ps1 -Ref $ref -Apply -Yes
```

The installer accepts a full commit or an existing version tag, not floating refs such as `main`. See the [installation guide](docs/getting-started.en.md#installation) for version selection and details.

### 2. Query your project

Switch to the **root of the project you want to analyze**, then index and query it:

```powershell
SymbolLattice init .
SymbolLattice explore "Where are incoming requests validated?" --project . --json
```

The index lives in that project's `.SymbolLattice/`. Run `SymbolLattice sync .` after changing source files or upgrading. For a known symbol, use `SymbolLattice find <name> --project . --json`.

### 3. Connect an AI agent

Codex users can preview and apply the integration:

```powershell
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

Integration backs up and updates Codex settings and its managed AGENTS block. Restart Codex or open a new task afterward. Create the project index first.

Other MCP clients can start the server with `SymbolLattice serve --mcp --project <project-path>`. It exposes `SymbolLattice_explore` by default. Queries are read-only; the server can synchronize indexes in the background by default. See the [MCP guide](docs/getting-started.en.md#other-mcp-clients) for configuration and disabling background sync.

## Supported scope

Covers TypeScript/JavaScript, Python, Java, Go, Rust, C/C++, C#, and various template and configuration formats. **Analysis depth varies by language.** Discovering files does not imply complete type, framework, or cross-file semantic support.

SymbolLattice uses static analysis. Dynamic calls, reflection, and external dependencies may remain unresolved; same-name declarations are not confirmed call targets. Results have count and source-excerpt limits. Missing relationships cannot guarantee that a change or deletion is safe. Sync stale indexes before querying; live queries may refuse to return results when freshness cannot be verified.

See [language capabilities and limitations](src/domain/language-depth.ts) and [real-project validation](benchmarks/README.md). Retrieval quality and speed depend on the project and query.

## Documentation and participation

| Looking for | Start here |
| --- | --- |
| Installation, commands, MCP setup, and removal | [Usage guide](docs/getting-started.en.md) |
| Updating an existing installation | [Upgrade guide](docs/getting-started.en.md#upgrading) |
| Quality, performance, and known gaps | [Validation documentation](benchmarks/README.md) |
| Bug reports or feature requests | [GitHub Issues](https://github.com/HsinPu/SymbolLattice/issues) |

The project is in `0.x` development; check compatibility notes before upgrading. **Package names and indexes from v0.420.0 or earlier are not migrated automatically.** Follow the upgrade guide.

## Development

```bash
npm ci
npm run check
npm run build
npm test
```

Build before testing. See [AGENTS.md](AGENTS.md) for required checks, the [development guide](docs/getting-started.en.md#development) for additional validation and packaging steps, and [scripts/README.md](scripts/README.md) for tooling.

## License

[MIT](LICENSE). Third-party parser licenses and provenance are retained under `src/assets/`.
