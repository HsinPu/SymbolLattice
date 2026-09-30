# Installation and usage guide

[Project home](../README.en.md) · [繁體中文](getting-started.md)

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

Discoverable languages and formats include TypeScript/JavaScript, Python, Java, Go, Rust, C/C++, C#, and web templates. **Declaration extraction, cross-file resolution, and framework support vary by language.** See the [language capability definitions](../src/domain/language-depth.ts) for details.

- Dynamic calls, reflection, macros, and external dependencies may remain unresolved. A missing relationship does not prove that no relationship exists.
- `explore` can include bounded unresolved call sites recorded in the index and same-name declaration leads. General queries and exact-symbol follow-ups may also cite Python same-class declaration candidates with indexed source lines and omission counts. These leads are not confirmed call targets.
- For a focus with a `graph-connected` ranking reason, JSON `queryPlan.graphConnectionEvidence` cites one exact static candidate link, the relation count, and how many links were omitted; MCP text also shows its source location. This explains a ranking contribution, not task relevance. Query the symbol or file to inspect more relationships.
- Source-term matches in `explore --json` on lines beginning with `#` (Python) or `//` carry `lineContext: "comment-prefixed"`; MCP text labels them too. This checks the line prefix only, not strings or every comment syntax, and does not establish that the text executes.
- Source excerpts, relationship traversal, and result counts have limits. Check truncation information and follow-up query guidance; partial results are not complete coverage.
- Retrieval quality and speed depend on the project and query. Results from fixed test projects do not establish the same performance everywhere.

See the [validation documentation](../benchmarks/README.md) for measured results, known gaps, and reproduction steps.

## Upgrading

Use the installation flow above with a new fixed commit or existing tag. After reinstalling, repeat Codex integration and run `SymbolLattice sync .` in each project. The project is in `0.x` development; check the target version's compatibility and migration notes before upgrading.

### Upgrading to v0.536.2

For queries with at least 6 concept groups and one primary focus whose indexed source covers every group, some secondary files matching only shared terms and at most half of the groups may no longer be expanded. Named operations, directly cited exact relationships, same-named declarations for written unresolved calls from protected focuses, and retained flow follow-ups are protected; name-based retention does not confirm a call target. `queryPlan.coveredContextFiltering` lists the anchor's hit locations and each omitted symbol's range and source hits; MCP text provides paths and follow-up instructions.

This bounded output heuristic does not guarantee that omitted files are irrelevant or that the flow is complete. "Every group" means groups retained within the term budget; if `queryPlan.input.identifierTermsTruncated` is true, later terms may not participate, so shorten the query and check again. Investigate using an exact symbol reference from the receipt or a file-specific query. Shorter queries, queries without complete source coverage, and explicit file queries do not apply this rule. No index format or extraction version changes; this adjustment does not require rebuilding an index.

### Upgrading to v0.537.0

Omitted concepts from long questions can corroborate a same-name declaration candidate with an unresolved source call, supplementing source in an already selected file. This does not establish receiver type or call target. JSON `queryPlan.omittedDeclarationSearch` and the focus's `omittedQueryDeclaration` record receipts and truncation.

**Breaking change**: supplementary candidates can raise the per-file maximum to 3 focuses; the total remains at most 9. JSON clients must honor returned `limits` and remove assumptions of exactly 2 items per file. The existing source character budget does not increase; this change requires no index rebuild.

### Upgrading to v0.536.0

General queries can supplement some unresolved TypeScript optional member calls with an imported declaration candidate. Exact import, class construction and declaration containment receipts are required; construction must occur in the caller or a directly called function in the same file. This is a follow-up lead, without confirming the unknown receiver's type or call target.

The lookup checks at most 8 calls and 16 witness groups, adding at most 1 declaration beyond the existing maximum of 8 primary focuses. The total source character budget does not increase. JSON `queryPlan.importedDeclarationSearch` records scope, availability and truncation; the focus's `importedCallDeclaration` carries the supporting receipts. Results may remain incomplete; use the returned exact symbol reference to investigate further. Upgrading from v0.535.0 does not require rebuilding the index for this query capability; earlier versions still need the extraction refresh described below.

### Upgrading to v0.535.0

This version adds source receipts for static named TypeScript optional member calls, including `signal?.isCycle()` and `signal.isCycle?.()`. Receipts cite the written method token and retain an unresolved target; they do not establish receiver type or execution. Computed members, including literal computed members such as `signal?.[name]()`, are outside this addition.

After installation, run `SymbolLattice sync .` in each analyzed project. The updated extractor and resolver versions trigger the required re-extraction and graph projection, so the first sync may take longer. The index format is unchanged; do not manually delete the index. Additional call evidence does not establish complete task-file retrieval; the known Nest circular-dependency recall gap remains recorded in the validation documentation.

### Upgrading to v0.532.0

The structured responses from `explore --json` and MCP `explore` still report index freshness, stale reasons, generation, and file/symbol/relationship counts, but no longer include `status.lastIndexWork`. If a script reads the previous index operation's file lists from a query result, use `SymbolLattice status <project-path> --json` for the full `lastIndexWork`. The index format is unchanged, so this change alone does not require a rebuild; you can still run `sync` after a normal upgrade to check for updates.

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

`npm pack --dry-run` still invokes `prepack`, which builds the package and checks language depth. See [AGENTS.md](../AGENTS.md) for development and validation requirements and [scripts/README.md](../scripts/README.md) for tooling entry points.

## License

[MIT](../LICENSE). Third-party parser licenses and provenance are retained under `src/assets/`.
