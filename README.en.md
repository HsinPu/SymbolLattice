# SymbolLattice

Local, source-backed code graphs for developers and AI agents to search code, trace calls, and assess change impact.

[繁體中文](README.md) | English

Current version: **v0.520.7** · Node.js **>=22.13 <25** · [MIT](LICENSE)

## Features

SymbolLattice scans a repository and stores files, symbols, and static relationships in `.SymbolLattice/index.sqlite`, exposing queries through a CLI and MCP.

- Search symbols and source; inspect callers, callees, inheritance, imports, routes, and entry points.
- Assess changes with `impact`, `affected`, and Git hunk information.
- Retrieve source-backed code context with `explore`, `context`, and `investigate`.
- Update the index incrementally and compare generations with history and diff.

Relationships carry source ranges, resolution stages, and rule evidence. Relationships that cannot be reliably proven remain unresolved or pending, or are omitted. This is a static analysis tool; dynamic dispatch, reflection, macros, code generation, and external dependency types may remain unresolved.

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

After installation, you can remove the temporary checkout identified by `$bootstrap`. The installer validates the fixed source, lockfile, type check, build, package, and isolated CLI/MCP operation, with rollback protection for installation failures. Installing the CLI does not change Codex settings or create a project index.

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
| `status` / `history` / `diff` | Inspect index freshness and generation changes. |
| `files` / `file` / `find` / `node` / `search` | List files, read persisted source, and search symbols. |
| `callers` / `callees` / `hierarchy` | Trace calls and inheritance. |
| `routes` / `entrypoints` | Inspect framework entry points. |
| `impact` / `affected` / `git-hunks` | Assess change impact. |
| `context` / `explore` / `investigate` | Retrieve source-backed agent context. |
| `explain-edge` | Inspect relationship evidence. |
| `diagnostics` | Read operation and auto-sync diagnostic journals. |
| `serve --mcp` | Start the MCP stdio server. |

Run `SymbolLattice <command> --help` for all options.

## Codex and MCP

```powershell
# Preview integration settings, then apply
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

The installer manages `mcp_servers.SymbolLattice` in `~/.codex/config.toml` and the `SYMBOL_LATTICE_START`/`SYMBOL_LATTICE_END` block in `~/.codex/AGENTS.md`, creating backups before writing. Settings use absolute paths to the current Node executable and `dist/cli/main.js`. Repeat integration installation after moving or reinstalling the CLI, then restart Codex or open a new task.

Integration installation does not create indexes. The installed agent instructions require `SymbolLattice init .` from the repository root when a software repository has no index and the task requires understanding or modifying code. A monorepo sharing an outer `.git` is indexed once at that root; a workspace containing independent repositories is indexed per repository. Filesystem roots, Home, the Desktop root, temporary directories, and dependency directories are excluded from automatic initialization.

You can also start MCP directly:

```powershell
SymbolLattice serve --mcp --project C:\path\to\project

# Disable background index updates
SymbolLattice serve --mcp --project C:\path\to\project --no-auto-sync
```

- MCP query handlers are read-only, but the server can start automatic synchronization and update indexes by default. Use `--no-auto-sync` to disable background updates.
- Only `SymbolLattice_explore` is exposed by default, returning Markdown, numbered source lines, relationship locations, and resolution rules. Results disclose truncation and unverified paths, retain new fragments after source deduplication, and explain how to retrieve omitted content. CLI `explore --json` retains the full machine-readable contract within the query's own bounds.
- Retrieval considers coverage of multiple query terms and common English inflections, ranking candidates before applying limits. It remains lexical retrieval; inspect the returned evidence after finding a file. [Fixed-task checks](benchmarks/README.md#task-retrieval-checks) measure file recall and source evidence separately.
- Function and method excerpts include implementation bodies within a shared character budget, with explicit truncation for large declarations. Supplementary windows retain uncovered exact call sites and path evidence, and disclose call sites whose source needs a follow-up read.
- Set the environment variable `SYMBOL_LATTICE_MCP_TOOLS=node,impact` to add tools, or `all` to expose every tool.
- An unindexed startup directory still registers tools but does not start a watcher for that directory. Pass an indexed repository as `projectPath` when querying; query handlers do not run `init` directly.
- Query independent repositories with separate `projectPath` values. Their indexes are not automatically merged into a cross-repository graph.

Remove the integration with:

```powershell
SymbolLattice uninstall codex
SymbolLattice uninstall codex --apply --yes
```

## Language support and evidence

Discovery supports 58 languages and formats, including TypeScript/JavaScript, Java, Go, Python, C/C++, C#, Rust, Ruby, Shell, web templates, documentation, and configuration formats. **Discovery support does not imply equal relationship depth or complete language support.**

- Declarations, same-file calls, cross-file relationships, and framework semantics have separate validation scopes.
- HTML, CSS, documentation, and configuration formats are validated against applicable resource references and structural relationships.
- Nonempty fixtures, independent large-project truth, and negative cases use different denominators. Recall does not establish precision.
- CI tests for benchmark helper contracts do not imply that every run downloads and analyzes the full external corpus.

See [language-depth.ts](src/domain/language-depth.ts) for the full language matrix and limitations, and [benchmarks/README.md](benchmarks/README.md) for evidence tooling and execution boundaries.

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

| Directory | Contents |
| --- | --- |
| `src/domain/` | Graph models, evidence, query rules, and language support definitions. |
| `src/extraction/` | Language parsers and framework fact extraction. |
| `src/application/` | Indexing, relationship resolution, synchronization, and query orchestration. |
| `src/ports/` | Storage, source catalog, and Git interfaces. |
| `src/infrastructure/` | SQLite, filesystem, and Git implementations. |
| `src/cli/` / `src/mcp/` | CLI and MCP entry points. |
| `src/assets/` | Parser WASM, manifests, provenance, and third-party licenses. |
| `test/` | Unit tests, integration tests, and fixtures. |
| `scripts/` | [Build, installation, and release tooling](scripts/README.md). |
| `benchmarks/` | [Large-project evidence and performance tooling](benchmarks/README.md). |
| `tools/` | Shell parser adapter source and build target. |

CI runs type checks, builds, the full test suite, language validation, isolated installation, and self-indexed concurrent queries on Ubuntu/Windows with Node 22/24. Keep external corpora and generated reports out of source directories.

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
