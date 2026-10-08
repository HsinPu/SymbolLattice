# Installation and usage guide

[Project home](../README.en.md) · [繁體中文](getting-started.md)

## Installation

Requires Git, Node.js `>=22.16 <23 || >=24 <25`, npm, and Windows PowerShell 5.1 or PowerShell 7.

**0.546.0 breaking change (runtime):** Use an official Node.js 22.16 or later within 22.x, or 24.x, with built-in SQLite FTS5. Official 22.13–22.15 and 23.x builds allowed by earlier documentation lack FTS5 and cannot create the full-text index. Upgrade Node.js before reinstalling. Keep existing indexes and run `SymbolLattice sync .` afterward; this runtime correction requires no index deletion or rebuild.

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
SymbolLattice explore "Where are incoming requests validated?" --project . --sync-if-stale --json

# Look up a known symbol; replace this with a name from your project
SymbolLattice find createOrder --project . --sync-if-stale --json

# Sync after changing source files or upgrading SymbolLattice
SymbolLattice sync .
```

`init` scans, extracts, resolves and writes the complete index. First-run duration varies with project size and language. Use `sync` for routine edits and upgrades once an index exists, avoiding another full initialization. To inspect timings, run `SymbolLattice init . --json` and read the scan, extraction, resolution and persistence entries in `operationPerformance.phases`. This command still performs full initialization; it is not a read-only diagnostic.

Review the returned files and source excerpts, then follow the relationship evidence. Add `--sync-if-stale` to a live CLI query to acquire writer ownership and run ordinary `sync` only when an existing index is stale, preserving its scope. A fresh index is not synchronized. The option does not initialize a missing index, invoke a forced `index` rebuild, or bypass safe-path and before/after freshness checks.

The option uses the built-in indexer. If the index records explicitly loaded plugins, it returns `CLI_SYNC_REQUIRES_PLUGINS` and preserves the index. Use an MCP host configured with the original `--plugin` options; recovery does not silently remove plugins.

For `FRESH_INDEX_REQUIRED`, run `SymbolLattice status . --json` in the analyzed project to inspect the reason. `writerState=disabled` means index updates were disabled for this read, not that the CLI cannot run. If updates are allowed, retry the same CLI query with `--sync-if-stale`, or run `SymbolLattice sync .` separately. CLI without the option and MCP with `--no-auto-sync` remain read-only; do not enable updates when the user requests read-only testing or forbids synchronization. Default MCP can update an existing index after acquiring writer ownership. `writerState=lease-unavailable` means ownership was not acquired; wait for the owning host to synchronize or release its lease instead of taking it forcibly. `PROJECT_NOT_STABLE` means the project kept changing during bounded retries; wait for edits to settle. Refusals return no stale evidence.

`v0.549.2` fixes a Windows host contending with its own writer lease when the same project is addressed with different path casing or a directory alias, and temporary writer leases retained after failed verification. Restart the MCP host after updating to load the fix. Existing indexes remain usable; run a normal `sync` when their status requires it.

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
- MCP lexical citations use `path:line:startColumn-endColumn`, with one-based UTF-16 columns and an exclusive end. Query terms at the same token, position and comment context can share a citation; incomplete coordinates retain separate line-only citations. JSON retains each query term's source receipt.
- Source excerpts, relationship traversal, and result counts have limits. Check truncation information and follow-up query guidance; partial results are not complete coverage.
- Retrieval quality and speed depend on the project and query. Results from fixed test projects do not establish the same performance everywhere.

See the [validation documentation](../benchmarks/README.md) for measured results, known gaps, and reproduction steps.

## Upgrading

Use the installation flow above with a new fixed commit or existing tag. After reinstalling, repeat Codex integration and run `SymbolLattice sync .` in each project. The project is in `0.x` development; check the target version's compatibility and migration notes before upgrading.

### Upgrading to v0.550.4

v0.550.3 reduces repeated AST traversal and TypeScript module lookups; v0.550.4 also reuses lexical scopes, positions and Java native child nodes within one AST, reducing repeated traversal and allocation, and fixes initialization blocked by multiline Cargo descriptions. Sections and dependencies inside multiline text remain text; multiline names or paths still do not establish resolved relationships. Existing v0.550.2 and v0.550.3 indexes do not need rebuilding. Old indexes containing multiline Cargo configuration report changed project inputs; ordinary `sync` refreshes them. Other indexes remain usable. Use `sync` for routine edits. See the [language verification and speed report](language-verification-and-speed.md) for fixed-project initialization timings and unmeasured scope.

### Upgrading to v0.550.2

This patch corrects omitted Go declarations after a line ending in `true` or `false`. After upgrading, run `SymbolLattice sync .` in each analyzed project, or query with `--sync-if-stale` when updates are allowed. The updated extractor re-extracts existing files, so the first sync may take longer. Keep `.SymbolLattice/`; no manual index deletion is needed. Task retrieval still has recorded ranking and source gaps; see the [language verification and speed report](language-verification-and-speed.md).

### Upgrading to v0.550.0

Live CLI queries gain the optional `--sync-if-stale`; existing read-only calls and query output contracts remain supported. After installing, preview `SymbolLattice install codex`, then run `SymbolLattice install codex --apply --yes` to refresh the managed Agent instructions and restart Codex/MCP hosts. New guidance uses the option for code tasks that allow index updates and makes a bounded retry after an updates-disabled refusal, while honoring explicit read-only/no-sync instructions. Updating the CLI alone does not refresh installed Codex guidance or synchronize projects on another computer. Existing indexes need no deletion or manual rebuild.

### Upgrading to v0.549.0

Some Python task queries add method source through at most two checkable direct-base steps, or source for a short caller in the same file. JSON `sourceWindows[].callSourceContext` retains the written calls, declarations and import witnesses; `sourceWindowPlan.callSourceContextSearch` reports scope, gaps and truncation. MCP text also cites these source links. Unresolved `self` calls still have no confirmed target. These excerpts do not establish receiver type, runtime MRO or dispatch.

The total source budget remains 24,000 characters, with at most 6,000 reserved for this additional context; some earlier excerpts may become shorter. At most three windows are added, with each declaration limited to 64 lines and 8,192 characters. Check the delivered source and truncation receipts, then follow a precise symbol or file when needed. This release adds optional evidence fields and the `inherited-call-source` and `exact-caller-source` window reasons. Upgrading from 0.548.1 does not require a new index generation or re-extraction for this query change; run `SymbolLattice sync .` as usual.

### Upgrading to v0.548.1

This patch retains existing query and evidence formats while adjusting index reads for candidate search. After upgrading from 0.548.0, run `SymbolLattice sync .` to create the auxiliary indexes used by this adjustment. If source and configuration are unchanged, this requires no source re-extraction or new index generation. Existing indexes remain queryable in read-only mode; the adjustment becomes available after synchronization.

### Upgrading to v0.548.0

Python relative named imports can traverse subpackages below the current package, such as `from .sansio.app import App`. The target must be a unique module file. Unmarked directories require an indexed regular ancestor and support written base source only, disclosing missing markers as `unmarkedPackagePaths` without resolving runtime calls or construction. Source-root inference, multiple leading dots and unanchored namespaces are excluded. Written single-base inheritance can support cross-file declaration candidates while calls remain unresolved; it does not establish runtime dispatch.

Run `SymbolLattice sync .`. Updated extractor and resolver policies re-extract persisted raw facts and project the graph; index format and CLI/MCP parameters are unchanged.

### Upgrading to v0.547.0

The optional `queryPlan.coveredFileContextFiltering` receipt is new. When single-focus compaction does not apply, a primary file with a literal directory qualifier and at least two selected declarations may reduce secondary files if its non-comment-prefixed source hits jointly cover all observed concepts in the bounded candidates, with at least six groups. Each omitted symbol's name words and non-comment-prefixed hits must cover at most half of those groups, and its complete literal hits must not cover every group. Strings and docstrings can still match; this is not a syntactic or semantic classification of executable code.

The receipt lists each declaration's source hits, non-comment-prefixed hits, omitted symbols and `unmatchedTermGroups`. The latter means no match in the selected and omitted candidates, not an exhaustive absence claim for the project. Compound named operations, directly cited exact relationships, same-named declarations for written unresolved calls from protected sources, graph expansion and retained flow/gap/property follow-ups are protected; retaining a name does not resolve its target. Explicit-file and numeric-qualifier queries do not apply this rule. Follow exact symbol references or query a file directly, and inspect input, graph and source truncation.

This bounded lexical output heuristic does not prove connections between declarations, irrelevance or complete necessary evidence. The existing single-focus `coveredContextFiltering` contract remains. CLI/MCP parameters, result limits and index format are unchanged; this query capability requires no index rebuild.

### Upgrading to v0.536.2

For queries with at least 6 concept groups and one primary focus whose indexed source covers every group, some secondary files matching only shared terms and at most half of the groups may no longer be expanded. Named operations, directly cited exact relationships, same-named declarations for written unresolved calls from protected focuses, and retained flow follow-ups are protected; name-based retention does not confirm a call target. `queryPlan.coveredContextFiltering` lists the anchor's hit locations and each omitted symbol's range and source hits; MCP text provides paths and follow-up instructions.

This bounded output heuristic does not guarantee that omitted files are irrelevant or that the flow is complete. "Every group" means groups retained within the term budget; if `queryPlan.input.identifierTermsTruncated` is true, later terms may not participate, so shorten the query and check again. Investigate using an exact symbol reference from the receipt or a file-specific query. Shorter queries, queries without complete source coverage, and explicit file queries do not apply this rule. No index format or extraction version changes; this adjustment does not require rebuilding an index.

### Upgrading to v0.538.1

General-query ranking can corroborate exact directory words, such as a named database backend, with at least two distinct source concepts. A focus’s `directoryContext` records query terms, full directory components, path and score contribution; filenames and partial directory strings do not qualify for this evidence. This is relevance evidence, without confirming code relationships or a complete flow. Search/source budgets are unchanged; no index rebuild is needed.

### Upgrading to v0.541.0

If omitted-concept supplementation finds no candidate in the primary graph, it can now perform an exact-name lookup in files already selected. It requests at most 8 names, 8 files and 16 declarations; only complete, generation-matched results can support a candidate. Exactly two eligible same-name declarations can be supplied together as a complete candidate group. This does not infer receiver type or call target, or search new files. Only complete, generation-matched lookups support a group; more than two declarations, ineligible siblings or an occupied supplementary slot do not cause an arbitrary winner to be selected. `matchingDeclarationIds` lists the group within the selected-file scope.

JSON `queryPlan.omittedDeclarationSearch.selectedFileLookup` records names, files, availability and name-budget truncation. A projected candidate has `omittedQueryDeclaration.scope: selected-files-index`; its matching count applies only to that lookup scope. Unique candidates retain one supplementary slot; two same-name candidates share the existing total source character budget. This query capability requires no index rebuild.

### Result limits for long-question declaration supplements

Omitted concepts from long questions can corroborate a same-name declaration candidate with an unresolved source call, supplementing source in an already selected file. This does not establish receiver type or call target. JSON `queryPlan.omittedDeclarationSearch` and the focus's `omittedQueryDeclaration` record receipts and truncation.

**0.541.0 breaking change**: a complete candidate group can raise the per-file maximum to 4 focuses and the total to 10. JSON clients must honor returned `limits` and remove assumptions of 2/3 items per file or 9 overall. The existing source character budget does not increase; this change requires no index rebuild.

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
