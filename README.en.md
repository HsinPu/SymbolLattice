# SymbolLattice

**Help AI agents find relevant code—and the evidence behind it.**

SymbolLattice is a local code search tool for developers and AI agents. Query a project through the CLI or MCP using a task description, symbol name, or file path, and retrieve source code, line numbers, and cross-file relationship evidence.

[繁體中文](README.md) · [Get started](docs/getting-started.en.md) · [Validation and limitations](benchmarks/README.md) · [Report an issue](https://github.com/HsinPu/SymbolLattice/issues)

`v0.546.2` · Node.js `>=22.16 <23 || >=24 <25` · MIT

## Start with “Where is this implemented?”

When exploring an unfamiliar project, investigating a bug, or preparing a change, you need to locate the implementation and understand how it connects to other files. SymbolLattice builds a local index so you can follow those questions through source evidence.

```powershell
SymbolLattice explore "Where are incoming requests validated?" --project . --json
```

Results can include:

- **Relevant files and symbols** to help locate implementations from a task description.
- **Verifiable source** with file paths, line numbers, and code excerpts to check the findings. When one identifier matches several query concepts, lexical evidence prefers that occurrence.
- **Relationships between code** through resolved calls, imports, source references, inheritance, and framework entry points.
- **Ranking evidence** with one checkable candidate link and an omission count when graph relationships boost a symbol's rank.
- **Open questions** including unresolved calls, source freshness, and result truncation.

For some error investigations, MCP text leads with a source-cited implementation and error declaration; other ranked results still need review.

Query from your terminal, or let an MCP-compatible agent use the evidence.

## Quick start

Requires Git, npm, Node.js `>=22.16 <23 || >=24 <25`, and Windows PowerShell 5.1 or PowerShell 7. Installation currently uses GitHub source; the package is not published to the npm Registry.

**0.546.0 breaking change (runtime):** Use Node.js 22.16 or later within 22.x, or 24.x. The official 22.13–22.15 and 23.x builds allowed by earlier documentation lack SQLite FTS5, which the full-text index requires. Upgrade Node.js before reinstalling. Keep existing indexes and run `SymbolLattice sync .` after installation.

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

General queries can supplement one query-relevant caller with exact static cross-file call evidence. JSON `incomingCallWitness` cites source locations, bounded candidates and truncation. It inspects only the returned bounded graph and does not guarantee a complete caller list or runtime dispatch. Supplementation may add one file; respect the returned `limits`. No index rebuild is needed.

When a query word exactly matches a directory component and source corroborates at least two concepts, ranking can use that directory context. JSON `directoryContext` lists the terms and score contribution; this is literal relevance evidence, not a resolved code relationship.

SymbolLattice uses static analysis. Text matches include source locations; query terms at the same token and position can share a citation. Text matches may come from comments or strings; matches on lines beginning with common comment markers are labeled, and you should still inspect the source before drawing a semantic conclusion. Dynamic calls, reflection, and external dependencies may remain unresolved; same-name declarations are not confirmed call targets. A verified source reference can help rank results, but a reference alone does not prove execution order. Results have count and source-excerpt limits. Missing relationships cannot guarantee that a change or deletion is safe. Sync stale indexes before querying; live queries may refuse to return results when freshness cannot be verified.

For rejection queries with an exact source reference, lower-priority focuses that only repeat covered query terms may be omitted. MCP text names their file paths; JSON lists the full omissions in `queryPlan.rejectionReferenceFiltering`. The bounded graph cannot prove those files irrelevant; query a file directly when needed.

For longer queries with one source covering every concept retained within the term budget, some secondary focuses matching only shared terms may also be omitted. JSON `queryPlan.coveredContextFiltering` includes the decision evidence, source locations and exact symbol references; MCP text names follow-up paths. This does not establish irrelevance or complete flow resolution.

Concepts omitted from a long question can corroborate same-name declaration candidates through cited unresolved calls. Missing declarations can be looked up in selected files; a complete, generation-matched result with exactly two same-name declarations supplies both sources and `matchingDeclarationIds`, without selecting a call target. JSON `queryPlan.omittedDeclarationSearch` records scope, limits and truncation. **0.541.0 breaking change (result limits):** a candidate group can raise the maximum to ten focuses overall and four per file. JSON consumers must honor returned `limits`. File and total source-character budgets do not increase; this change requires no index rebuild.

Python resolves a single written base class through absolute named imports at the indexed project root, citing the import, package markers and base location. Import lists and aliases are supported; namespace packages, inferred source roots, multiple inheritance and dynamic dispatch remain outside this scope. Calls to inherited methods can remain unresolved. When concepts omitted from a long question match a direct `self.method()` call, the existing bounded graph can supply one cross-file base-method candidate, citing caller containment, import, direct inheritance and declaration containment. This supports resolved absolute named imports and one source hop; it does not infer runtime dispatch. These candidates use JSON `omittedQueryDeclaration.scope: inspected-inherited-source` with `inheritedSource`; honor returned `limits` for supplementary files and focuses. After upgrading, run `SymbolLattice sync .` to refresh this evidence.

Static JavaScript member calls rooted in an identifier or `this` can also expose their full written callee and source location in `unresolvedCalls`, including `.call`, `.apply` and `.bind`. These are syntax receipts, without receiver types, resolved targets or execution claims. Optional chains, computed members and anonymous callbacks without an indexed symbol are excluded. Run `SymbolLattice sync .` after upgrading to 0.543.0 to refresh the index.

For object-linking or prototype questions, a general query can supplement one function in already selected JavaScript files with query-term source and written `Object.setPrototypeOf` call locations. JSON `sourceOperationLead` reports bounded candidates and truncation; this supplies syntax without identifying `Object`, resolving targets or proving execution effects. At most 32 candidates and eight calls per candidate are inspected, with two call locations returned. Use the returned `limits` for focus ceilings. No index rebuild is required.

For Python, direct same-class `self.method()` calls can include `async def` methods when the target is unambiguous. Functions with a safely recovered bare-`yield` parser gap also retain written member-call locations; unknown receiver types remain unresolved rather than becoming guessed targets. General queries and exact-symbol follow-ups can cite same-class declaration leads from the returned bounded graph and indexed source for some unresolved `self.method()` calls. These are follow-up candidates, not proof of receiver type or runtime dispatch. When a general query's unresolved-call list is limited, matching call names get priority for inclusion while the selected calls remain in source order; use the returned exact symbol reference to follow up with a larger source-ordered list when needed.

Static non-call Python member occurrences inside functions (such as `self.pg_version`) also retain source locations, separately from calls in `unresolvedReferences`. Each focus shows at most eight; general queries prioritize matching names within at most 64 candidates, with at most two source-cited same-class declaration candidates. Occurrences include assignment and deletion targets and do not infer reads/writes, receiver types or descriptor behavior. Lambda bodies, function headers, class-body execution and other unsupported parser scopes remain excluded.

See [language capabilities and limitations](src/domain/language-depth.ts) and [real-project validation](benchmarks/README.md). Retrieval quality and speed depend on the project and query.

Static named TypeScript optional member calls (such as `signal?.isCycle()`) retain source locations for the method name and remain unresolved. When corroborated by import and construction receipts, a general query can add at most one imported declaration candidate with source evidence for each step. This does not establish execution, receiver type, or dispatch target. After upgrading, run `SymbolLattice sync .` to refresh extraction evidence in existing indexes.

## Documentation and participation

| Looking for | Start here |
| --- | --- |
| Installation, commands, MCP setup, and removal | [Usage guide](docs/getting-started.en.md) |
| Updating an existing installation | [Upgrade guide](docs/getting-started.en.md#upgrading) |
| Quality, performance, and known gaps | [Validation documentation](benchmarks/README.md) |
| Bug reports or feature requests | [GitHub Issues](https://github.com/HsinPu/SymbolLattice/issues) |

The project is in `0.x` development; check compatibility notes before upgrading. **Package names and indexes from v0.420.0 or earlier are not migrated automatically.** Follow the upgrade guide.

**v0.532.0 breaking change:** The JSON `status` inside `explore` no longer includes the previous index operation's full file lists. Use `SymbolLattice status <project-path> --json` to retrieve `lastIndexWork`. The index format is unchanged, so this change alone does not require rebuilding an index.

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
