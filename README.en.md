# SymbolLattice

Help AI agents find task-relevant code with source evidence they can verify.

[繁體中文](README.md) | English

Current version: **v0.527.1** · Node.js **>=22.13 <25** · [MIT](LICENSE)

SymbolLattice builds a local code index and exposes file, symbol, and cross-file relationship queries through a CLI or MCP. Use it to find relevant implementations in an unfamiliar repository, investigate a bug, or prepare a change, then follow the source evidence.

## What you can do

- **Find implementations** using symbol names, file paths, or natural-language task descriptions.
- **Check evidence** through source paths, line numbers, code excerpts, and the basis for reported relationships.
- **Trace relationships** through resolved calls, imports, inheritance, and framework entry points to assess change impact.
- **Keep the index current** with incremental synchronization and inspect retained index history and differences.

The index lives in the analyzed project's `.SymbolLattice/` directory. Results report unresolved relationships, source freshness, and truncation. Static analysis has limits; search results cannot guarantee complete impact coverage.

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

Run from the **root of the project you want to analyze**, rather than the SymbolLattice installation directory:

```powershell
# Create the index and inspect its status
SymbolLattice init .
SymbolLattice status .

# Explore a task without knowing symbol names
SymbolLattice explore "Where are incoming requests validated?" --project . --json

# Look up a known symbol; replace this with a name from your project
SymbolLattice find createOrder --project . --json

# Sync after changing source files or upgrading SymbolLattice
SymbolLattice sync .
```

Review the returned files and source excerpts, then follow the relationship evidence. If the index is stale, run `sync` before retrying. Live queries may refuse to return results when index freshness cannot be verified.

| Need | Commands |
| --- | --- |
| Find symbols, search text, or read file source | `find`, `search`, `file` |
| Trace calls and inheritance | `callers`, `callees`, `hierarchy` |
| Assess change impact | `impact`, `affected` |
| Retrieve task context with source evidence | `explore`, `context`, `investigate` |
| Create, update, and inspect an index | `init`, `sync`, `status` |

Run `SymbolLattice <command> --help` for arguments.

## Use with AI agents

### Codex integration

```powershell
# Preview, apply, then check the settings
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

Integration backs up and updates `mcp_servers.SymbolLattice` in `~/.codex/config.toml` and the managed block in `~/.codex/AGENTS.md`. Restart Codex or open a new task afterward.

Integration does not create project indexes. Run `SymbolLattice init .` in the target project first. Index a monorepo sharing one `.git` once; index independent repositories in a workspace separately.

Settings use absolute paths to Node and the CLI. Repeat integration after moving or reinstalling the CLI. To remove it, preview with `SymbolLattice uninstall codex`, then add `--apply --yes` to apply.

### Other MCP clients

Use this command to start the MCP server, replacing the project path with its actual location:

```powershell
SymbolLattice serve --mcp --project C:\path\to\project
```

- The default tool, `SymbolLattice_explore`, returns Markdown with numbered source lines, relationship evidence, and limitations. Use CLI `explore --json` for JSON output.
- Queries are read-only. The server can update indexes in the background by default; add `--no-auto-sync` to disable background updates.
- Use `projectPath` to query different repositories after creating each index. Queries do not initialize or merge indexes.
- Set `SYMBOL_LATTICE_MCP_TOOLS=node,impact` to add tools, or `all` to expose every tool.

## Scope and limitations

Discoverable languages and formats include TypeScript/JavaScript, Python, Java, Go, Rust, C/C++, C#, and web templates. **Declaration extraction, cross-file resolution, and framework support vary by language.** See the [language capability definitions](src/domain/language-depth.ts) for details.

- Dynamic calls, reflection, macros, and external dependencies may remain unresolved. A missing relationship does not prove that no relationship exists.
- `explore` can include bounded unresolved call sites recorded in the index and same-name declaration leads. These leads are not confirmed call targets.
- Source excerpts, relationship traversal, and result counts have limits. Check truncation information and follow-up query guidance; partial results are not complete coverage.
- Retrieval quality and speed depend on the project and query. Results from fixed test projects do not establish the same performance everywhere.

See the [validation documentation](benchmarks/README.md) for measured results, known gaps, and reproduction steps.

## Upgrading

Use the installation flow above with a new fixed commit or existing tag. After reinstalling, repeat Codex integration and run `SymbolLattice sync .` in each project. The project is in `0.x` development; check the target version's compatibility and migration notes before upgrading.

### From v0.420.0 or earlier

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

## Development

Run from a checkout of this repository:

```bash
npm ci
npm run check
npm run build
npm test
```

Build before testing so `dist/` and parser assets are available. Run these additional checks as required by the change:

```bash
npm run verify:language-depth
npm run verify:mcp-worker-generation
npm pack --dry-run
```

`npm pack --dry-run` still invokes `prepack`, which builds the package and checks language depth. See [AGENTS.md](AGENTS.md) for development and validation requirements and [scripts/README.md](scripts/README.md) for tooling entry points.

## License

[MIT](LICENSE). Third-party parser licenses and provenance are retained under `src/assets/`.
