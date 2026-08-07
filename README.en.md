<div align="center">

# SymbolLattice

**Queryable, explainable, evidence-first local code intelligence**

[![Version](https://img.shields.io/github/v/tag/HsinPu/symbol-lattice?label=version)](https://github.com/HsinPu/symbol-lattice/tags)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | English

</div>

> [!IMPORTANT]
> v0.308.0 is a developer preview. MCP query tools are read-only, but `serve --mcp` starts a separate local auto-sync watcher by default. That watcher can update the project's `.symbol-lattice` index; add `--no-auto-sync` to disable it.

## Quick start

Requires Node.js `>=22.13 <25` and npm.

```bash
git clone https://github.com/HsinPu/symbol-lattice.git
cd symbol-lattice
npm install
npm run build

# Create a project-local graph
node dist/cli/main.js init /path/to/project

# Query explainable structural context
node dist/cli/main.js investigate "user token" --project /path/to/project --json

# Plan a cross-file exploration from file and symbol clues
node dist/cli/main.js explore "Trace src/api/orders.ts createOrder to persistOrder" --project /path/to/project --json

# Build multi-symbol context inside one shared source budget
node dist/cli/main.js context "src/api.ts#route" "src/service.ts#load" --project /path/to/project --source-character-budget 12000 --json

# Return separately verifiable signature and lexical-hit slices without synthetic source
node dist/cli/main.js investigate "user token" --project /path/to/project --source-render-mode multi --json

# Restrict immutable Git hunk attribution to one exact file or directory
node dist/cli/main.js git-hunks /path/to/project --base origin/main --path-prefix src/domain --json

# Scope Git changes and select affected tests with a custom pattern
node dist/cli/main.js affected --working-tree --project /path/to/project --path-prefix src/domain --test-pattern "scenarios/**/*.scenario.ts" --json

# Resolve one unique suffix and read numbered, generation-bound source
node dist/cli/main.js file service.ts --project /path/to/project --offset 1600 --limit 120
```

Alternatively, download the version-pinned `.tgz`, SHA-256 checksum, and manifest from [GitHub Releases](https://github.com/HsinPu/symbol-lattice/releases), then install the `.tgz` with npm. Every tagged release verifies the full suite, a clean installation, and build provenance first.

## What it does

- TypeScript functions, class and interface methods, constructors, typed arrow/function expressions, and function-typed variables emit `accepts`/`returns` relations only when local, type-only import, or re-export proof exists. Enclosing and callable type parameters, built-in wrappers, qualified names, and unimported same-name types are never guessed into exact edges.
- Java class/interface methods and constructors retain parameter and return-type source ranges, then emit exact `accepts`/`returns` only from an explicit import, fully qualified spelling, or one unique same-package top-level type. Type parameters, wildcard imports, unimported same-name types, nested types, and classpath guesses remain unresolved.
- Java can follow a `Factory.create().execute()` static-factory chain through a proven top-level return type. Its factory method set supports class inheritance, hiding, and bounded owner precedence. Public methods, same-package package-private/protected methods, and cross-package protected static methods with a proven caller-to-owner subclass path may resolve. Interface static methods are never inherited; private access, invalid package inheritance, unknown types, boxing, and generics remain unresolved. `callType`, `callDispatch`, and access receipts expose invocation kind, signatures, owners, packages, bounds, and every hierarchy edge.
- Explicit Java `this.method()` and `super.method()` calls reuse the same overload, method-set, and access evidence. `super` resolves only through one proven exact direct superclass, retains the caller-to-super path, and bypasses child overrides. Local-variable, field, and arbitrary expression receivers are still never guessed into exact edges.
- `explore` supports exact symbols and bounded question mode. Safe explicit project-relative paths rank first. Strong lexical seeds can also recover production candidates with no textual match across at most two hops of exact `calls`, `instantiates`, `overrides`, `routes`, `handles`, `accepts`, `returns`, or inheritance relationships, bounded to eight files, sixteen symbols, and two symbols per file. General questions do not seed from unrequested test, icon, or localization candidates and do not expand through heuristic, unresolved, or low-weight relationships. Receipts expose the seed, every directed edge, corroborating seed-file count, resource bounds, rejection reasons, and truncation; receipts for admitted candidates are retained first. Ranking then combines exact one-hop graph mass, bounded graph diffusion across at most four hops, persisted generated worth (`0.3`), and test, icon, or localization worth (`0.5` each). Final selection remains bounded to four files, eight focuses, two focuses per file, sixteen connections, and exact paths within four hops.
- After low-value filtering, a file-level relative score floor uses only each file's strongest candidate. The threshold is 20% of the top file score, clamped to 80–120. Thin results fail open to positive evidence and target three files; many symbols in one file cannot inflate its score. CLI and MCP receipts expose the threshold, aggregation, backfill, and up to sixteen excluded files.
- `explore` primary excerpts, exact call sites, and bridge windows share one hard 24,000-character ceiling. Additional windows reuse raw focus and spine relevance, then apply the same persisted generated byte worth exactly once: generated bytes have `0.3` worth, and a window below 15% of the top effective weight (threshold capped at 10) remains visible as receipt-only; exact path spines are cliff-exempt. Multiple windows retain a 256-character floor and one receives at most 70% of the base allocation. An unselected exact bridge may still expand to its same-generation whole file through 15%/800-character grace, or 60% coverage plus a shared 15% buy pool. Receipts expose classifier rules, weights, cliff, and whole-file decisions.
- `explore`, `context`, `node`, `investigate`, and `file` share session-, project-, and generation-bound source coverage. Back-references or new fragments are emitted only when UTF-16 offsets, content, and the SHA-256 offset map are verifiable and the 160-character savings/new-context floors plus four-fragment cap are satisfied; otherwise the full source is re-emitted. `sourceSessionMode: "full"` disables deduplication.
- `context` places persisted source for up to eight references inside one 2,048–64,000-character envelope, allocates by input order, and returns per-reference allocation, truncation cause, emitted size, source identity, and offset map. CLI and MCP callers can set `sourceCharacterBudget`.
- Every emitted, covered, or new fragment may carry `mcp-source-pointer-v1`: project-relative path, exact line/column range, raw-file offsets, at most five overlapping symbols, a readable `file:Lx-Ly (symbol)` label, and a SHA-256 receipt. CRLF, CR, Unicode separators, and partial fragments are rebased safely; insufficient display evidence omits only the pointer and never weakens source equality.
- `investigate` allocates a shared 2,048–64,000-character budget to exact slices from one active generation. `adaptive` keeps one contiguous result; callers may request `prefix`, `focused`, `signature`, or `multi` for at most two independently verifiable signature and focus slices. Every segment has a stable ID, SHA-256, range, and explicit omission gap. No source is synthesized, and insufficient proof or budget produces a disclosed single-segment fallback.
- Scans multiple languages and common frameworks into a project-local code graph.
- Queries symbols, indexed files, calls, routes, entry points, impact, retained generations, and diffs.
- Persists generated and production, test, icon, or localization source-role evidence during indexing; `files` exposes classifier versions and matching rules. Legacy generations are never silently reclassified from live paths, and a classifier-version change requires `sync` to rebuild the projection.
- `files` queries only files persisted in the active generation, with path-segment-safe filtering, anchored globs, flat/tree/grouped projections, and safe cursor pagination. `src` never includes `src2`, and cursors bind to the generation and selection filters.
- `file` defaults to a compact numbered human view with dependency, selection, generation, and freshness context; `--json` keeps the stable machine contract. Exact paths are preferred, unique suffixes are accepted, ambiguity is never guessed, and an offset past EOF fails clearly. YAML and properties files expose structure without content values.
- Preserves the rule, stage, candidate targets, confidence, and resolution path behind every relation.
- Extension-framework route plugins resolve exact same-file and cross-file fixed-prefix mounts. `explain-edge` returns each mount segment and the ESM import/re-export path; dynamic or ambiguous composition is never guessed into a route.
- Projects can register versioned reference resolver plugins that only see relations left unresolved by built-in resolvers. The host bounds candidates, validates results, and preserves collisions, exceptions, or unsafe choices as explainable unresolved evidence.
- Framework fact plugins can add validated symbols, routes, entry points, and pending references from framework syntax. Stable IDs, containment edges, output bounds, source ranges, and provenance remain host-owned.
- Framework project plugins can inspect frozen project-wide facts after per-file extraction and add cross-file pending references or bounded route-prefix projections. The host creates route identities, moves relations, and retains plugin provenance plus each mount segment.

## Plugin extensions

```js
// plugins/acme.mjs
export const symbolLatticePlugin = {
  schemaVersion: 1,
  frameworkFactPlugins: [{
    id: "acme/framework-facts",
    version: "1.0.0",
    languages: ["typescript"],
    extract: () => ({ symbols: [], references: [] })
  }]
};
```

```bash
node dist/cli/main.js init /path/to/project --plugin ./plugins/acme.mjs
```

One manifest may provide `frameworkFactPlugins`, `frameworkProjectPlugins`, and `referenceResolverPlugins`. Repeat `--plugin` as needed; the same arguments flow through watch, watch-start, watch-restart, MCP configuration, install, doctor, and uninstall. Plugins are trusted in-process JavaScript, not a sandbox. SymbolLattice never discovers or executes project modules implicitly. By default, only `.js`, `.mjs`, and `.cjs` files whose real paths stay inside the project are accepted; add `--allow-external-plugin` to trust an explicit external path.

## Common commands

| Command | Purpose |
| --- | --- |
| `init <path>` | Create a graph. |
| `sync <path>` | Explicitly synchronize or repair a graph. |
| `watch <path>` | Watch and synchronize in the foreground. |
| `watch-start [path]` | Preview or explicitly start one manageable background auto-sync host. |
| `watch-restart <host-id> [path]` | Safely replace one foreground watch host in a single approved transaction. |
| `watch-status [path]` | Read index freshness, durable events, and local host live/stale/unverifiable state. |
| `watch-stop <host-id> [path]` | Preview or explicitly ask one registered host to stop itself safely. |
| `files [path]` | Page persisted files by glob, projection, and generation-bound cursor. |
| `file <path>` | Read a numbered human view; add `--json` for the stable contract. |
| `git-hunks [path] --base <ref>` | Filter immutable Git hunk attribution with optional `--path-prefix`. |
| `affected --working-tree` | Scope Git changes with `--path-prefix`, then optionally replace conventional test naming with `--test-pattern`. |
| `explore <query>` | Retrieve ranked focuses, connections, and persisted source from an exact symbol or bounded question. |
| `investigate <query>` | Expand textual evidence into structural context. |
| `context <reference...>` | Build multi-symbol context and adjacent evidence paths within one source budget. |
| `impact <symbol>` | Trace bounded impact through exact static relations. |
| `explain-edge <edge-id>` | Inspect the complete evidence for one relation. |
| `upgrade [version]` | Preview, verify, or explicitly apply a GitHub Release upgrade. |
| `serve --mcp` | Start the MCP stdio host. |
| `mcp-doctor <target>` | Read-only diagnosis of an Agent MCP configuration, CLI, and index. |
| `mcp-install <target>` | Preview or, with `--apply --yes`, safely write an MCP configuration. |
| `mcp-uninstall <target>` | Preview or, with `--apply --yes`, remove the matching MCP entry. |

`watch-status` only uses a PID signal-0 probe to observe process existence; it does not start, stop, or synchronize a watcher. PID reuse cannot prove process identity, and journal state is only the latest evidence in the bounded window.

`watch-start` produces a read-only plan by default. Applying it requires `--apply --yes --approval <fingerprint>`; the approval binds the project, Node/CLI paths, launch arguments, and SHA-256 of executable JavaScript inputs. It starts the background `watch` without a shell and verifies host ID, PID, version, and registration before reporting success. A registration timeout never sends a signal to an unknown process.

`watch-stop` only creates an approval bound to the project's real path and the complete host record by default. Applying it requires `--apply --yes --approval <fingerprint>`. It writes a short-lived local request that the target host validates before shutting itself down; it never sends TERM, KILL, or another signal to a PID.

`watch-restart` binds the complete current foreground-host identity and the next launch command, plugins, and executable JavaScript SHA-256 values into one approval. Apply requests a cooperative stop first; a replacement starts only after the old host is proven absent, the launch plan is unchanged, and no competing host exists. Stop timeouts and partial failures return attributable receipts without signalling a PID directly.

`upgrade` produces a read-only plan by default. `--verify` downloads and checks the `.tgz`, SHA-256 checksum, manifest, and GitHub Artifact Attestations API evidence without installing. `--apply --yes` supports only local or global npm layouts, installs the verified local bytes, and then proves the CLI version. Source checkouts and `npx` are never changed automatically; downgrades also require `--allow-downgrade`.

```bash
symbol-lattice upgrade --check
symbol-lattice upgrade 0.267.0 --verify
symbol-lattice upgrade 0.267.0 --apply --yes
```

## Verification

```bash
npm run check
npm test
npm run build
npm run benchmark:mcp
npm run verify:mcp-worker-generation
```

## License

[MIT](LICENSE)
