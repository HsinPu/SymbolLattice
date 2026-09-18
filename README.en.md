# SymbolLattice

Local, source-backed code graphs for developers and AI agents to search code, trace calls, and assess change impact.

[繁體中文](README.md) | English

Current version: **v0.521.0** · Node.js **>=22.13 <25** · [MIT](LICENSE)

## Features

Query a repository through the CLI or MCP, with a local index in `.SymbolLattice/`.

- Find task-relevant files and symbols with source code, line numbers, and relationship evidence.
- Trace calls, inheritance, imports, and framework entry points to assess change impact.
- Update the index incrementally and inspect history and differences.

Static analysis may not resolve dynamic calls, reflection, macros, or external dependencies. Unresolved or truncated results do not prove related code is absent.

## Installation

Requires Git, Node.js `>=22.13 <25`, npm, and Windows PowerShell 5.1 or PowerShell 7.

The package is not published to the npm Registry. Use a full 40-character commit from the official GitHub repository or an existing `vX.Y.Z` tag. The installer rejects floating refs such as `main` and `HEAD`.

```powershell
$ref = "<FULL_40_CHARACTER_COMMIT_OR_VX.Y.Z>"
$bootstrap = Join-Path ([IO.Path]::GetTempPath()) ("SymbolLattice-bootstrap-" + [guid]::NewGuid().ToString("N"))

git clone --filter=blob:none --no-checkout https://github.com/HsinPu/SymbolLattice.git $bootstrap
if ($LASTEXITCODE -ne 0) { throw "Clone failed" }
git -C $bootstrap fetch --depth 1 origin $ref
if ($LASTEXITCODE -ne 0) { throw "Fetch failed" }
git -C $bootstrap checkout --detach FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw "Checkout failed" }

# Preview the installation plan
& (Join-Path $bootstrap "install.ps1") -Ref $ref

# After reviewing the preview, install into the current user's npm global prefix
& (Join-Path $bootstrap "install.ps1") -Ref $ref -Apply -Yes
```

After installation, you can remove the temporary checkout identified by `$bootstrap`. Installing the CLI does not change Codex settings or create a project index.

## Quick start

Run from the root of the repository you want to analyze:

```powershell
SymbolLattice init .
SymbolLattice status .
SymbolLattice find createOrder --project . --json
SymbolLattice explore "Trace createOrder to persistence" --project . --json

# Update the index after changing source files
SymbolLattice sync .
```

| Command | Purpose |
| --- | --- |
| `init` / `sync` | Create or update the index. |
| `find` / `search` / `file` | Search symbols and source, and read persisted source. |
| `callers` / `callees` / `hierarchy` | Trace calls and inheritance. |
| `impact` / `affected` | Assess change impact. |
| `context` / `explore` / `investigate` | Retrieve source-backed agent context. |

Run `SymbolLattice <command> --help` for all options.

## Codex and MCP

```powershell
# Preview integration settings, then apply
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

Integration backs up and updates `mcp_servers.SymbolLattice` in `~/.codex/config.toml` and the managed block in `~/.codex/AGENTS.md`. Settings use absolute paths to Node and `dist/cli/main.js`. After moving or reinstalling the CLI, repeat integration installation, then restart Codex or open a new task.

Integration installation does not create indexes. Run `SymbolLattice init .` at the repository root when analysis is needed: index a monorepo sharing one `.git` once, and each independent repository in a workspace separately.

You can also start MCP directly:

```powershell
SymbolLattice serve --mcp --project C:\path\to\project
```

- By default, MCP exposes `SymbolLattice_explore` with numbered source lines, relationship evidence, and explicit truncation and uncertainty. Use CLI `explore --json` when you need JSON.
- Queries are read-only; the server can update indexes in the background by default. Add `--no-auto-sync` to disable this.
- Query repositories separately using `projectPath`. Create each index first; queries do not initialize or merge indexes.
- Set `SYMBOL_LATTICE_MCP_TOOLS=node,impact` to add tools, or `all` to expose every tool.

Remove the integration with:

```powershell
SymbolLattice uninstall codex
SymbolLattice uninstall codex --apply --yes
```

## Language support and evidence

Discovery covers 58 languages and formats, including TypeScript/JavaScript, Python, Java, Go, Rust, C/C++, C#, and web templates. **Analysis depth varies by language; this is not a claim of complete language support.**

See [language scope and limitations](src/domain/language-depth.ts) and [real-project and performance validation](benchmarks/README.md). Passing small fixtures does not establish validation across all large projects.

Named JavaScript/TypeScript function expressions retain source and ownership of calls inside them; this does not imply resolution of all dynamic exports or calls. Run `SymbolLattice sync .` after upgrading to update an existing index.

## Development

```bash
npm ci
npm run check
npm run build
npm test
npm run verify:language-depth
npm run verify:mcp-worker-generation
npm pack --dry-run
```

Build before testing so tests that require `dist/` and parser assets have their runtime artifacts. `npm pack --dry-run` still invokes `prepack`, which builds the package and checks language depth.

See [AGENTS.md](AGENTS.md) for development rules and [scripts/README.md](scripts/README.md) for tooling.

## Upgrading from v0.420.0 or earlier

Old package names and indexes are not migrated automatically. Keep a recoverable copy, then remove the old integration and CLI:

```powershell
symbol-lattice uninstall codex --apply --yes
npm uninstall -g @hsinpu/symbol-lattice
```

Install the new CLI using the fixed-ref GitHub flow above, then reinstall the integration and create the index:

```powershell
SymbolLattice install codex --apply --yes
cd C:\path\to\project
SymbolLattice init .
```

Remove old data only after confirming the new CLI, MCP, and `.SymbolLattice` index work correctly.

## License

[MIT](LICENSE). Parser assets retain their third-party licenses and provenance under `src/assets/`.
