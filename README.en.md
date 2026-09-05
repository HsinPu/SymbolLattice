<div align="center">

# SymbolLattice

**Evidence-first local code graphs with traceable code context for developers and AI agents.**

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[繁體中文](README.md) | English

</div>

SymbolLattice scans a local repository, persists files, symbols, and static relationships as a queryable code graph, and exposes search, call relationships, routes, entry points, impact analysis, and source context through a CLI and MCP.

Every relationship carries a source range, resolution stage, confidence, and rule evidence. Relationships that cannot be proven reliably remain unresolved or pending, or are omitted instead of becoming false exact edges.

Current version: v0.508.0

## Highlights

- Scan multi-language, framework-aware repositories in one graph.
- Query symbols, callers, callees, inheritance, imports, routes, and entry points.
- Assess changes with `impact`, `affected`, and Git hunk information.
- Produce bounded, source-backed agent context and `explore` results.
- Persist generations with incremental sync, history, and diff support.
- Use the graph through the CLI or read-only MCP query handlers.

> [!IMPORTANT]
> MCP queries are read-only, but `serve --mcp` can start local automatic synchronization by default and update the `.SymbolLattice` index. Add `--no-auto-sync` to disable background updates completely.

## Supported scope

One `init` or `sync` can process a multi-language repository. Analysis depth varies by language; runtime or dynamic relationships that cannot be uniquely proven from static source are not presented as exact.

| Category | Languages and formats |
| --- | --- |
| Deeply validated on large projects | TypeScript, Java, HTML, Markdown, CSS, JavaScript, JSP, Python, Ruby, Shell, Lua, Luau, Julia, Perl, R, Elixir, Objective-C |
| Web and templates | ArkTS, Vue, Svelte, Astro, Razor, PHP, Blade, Liquid, Twig, CFML |
| JVM, .NET, and applications | Groovy, Kotlin, Scala, C#, F#, VB.NET, Dart |
| Systems and native | C, C++, Objective-C, Rust, Go, Swift, Zig, Nim, Fortran, Ada, Pascal, COBOL |
| Data, configuration, and schemas | SQL, GraphQL, Protocol Buffers, Terraform/OpenTofu, Nix, YAML, XML, Java Properties, Solidity |
| Functional and BEAM | Erlang, Clojure, Haskell, OCaml |

v0.496.0 adds a repository-native 58-language depth-matrix gate. It checks the language registry, discovery, file identity, targeted test evidence, framework capabilities, relation depth, real-corpus evidence, and truth tier, then scans a disposable multilingual project to verify all 58 files. The matrix explicitly separates project, same-file, framework, and structural evidence instead of presenting basic scanning as equal semantic depth. This is internal release evidence and adds no CLI command, MCP tool, GraphEdge kind, or public schema.

v0.497.0 uses the Groovy 5.0.3 compiler AST to verify unique top-level `def` self-recursion in large projects. An exact `calls` edge is retained only when arity matches and closure, nested-block, shadow, assignment, static-import, and metaclass taint are absent; class methods, delegates, `methodMissing`, and general dynamic dispatch remain unresolved.

v0.498.0 extends the same compiler-backed contract to direct calls between unique top-level `def` functions. Source and target declaration identity, arity, and absence of dynamic taint must all be proven. Only one of 14 compiler candidates passes product-parser admission; the other 13 remain explicitly reported as unsupported breadth.

v0.499.0 admits only a plain-assignment, same-line, fully closed Groovy slashy literal and preserves one content-free arity placeholder for string arguments. All 13 previously parser-gated compiler candidates therefore become exact. Division, comparison-position slashy forms, dollar-slashy, multiline, and unterminated forms remain fail closed.

v0.500.0 establishes a 300-positive/150-negative ESTree JavaScript relation truth set with 131 unique relative module imports. A strict CommonJS file may retain safe top-level literal requires even when another function contains a nested or dynamic require; hoisted, reassigned, or shadowed require bindings and dynamic, external, or ambiguous module paths remain unresolved.

v0.501.0 promotes Python to bounded relation evidence. Fixed CPython 3.13.11, Django 5.2.15, and Home Assistant Core 2026.8.0 corpora retain the existing 300 CPython-stdlib-AST import, direct-call, constructor, and inheritance truths and add 40 parser-clean, unique direct same-class `self.method()` calls. The combined result is 340 TP, 0 FP, 0 FN, 0 evidence-invalid, plus 150/150 fail-closed negatives. Decorators, metaclasses, attribute hooks, self rebinding, `setattr`/`delattr`, dynamic loading, monkey patching, inherited dispatch, and parser-rejected files remain nonclaims.

v0.502.0 promotes Vue, Svelte, and Astro to bounded relation evidence. Fixed Element Plus 2.14.3, Svelte 5.57.0, and Astro 7.3.1 corpora provide 300 component-reference truths and 150 negatives through an independent TypeScript Compiler API and markup scanner. An exact `references` edge requires a direct PascalCase template/markup tag, one unmutated explicit relative default component import visible to that SFC template, and one tracked target. Vue is limited to `<script setup>`, Svelte to the instance script, and Astro to parse-clean frontmatter. Dynamic components, kebab-case, namespace/member tags, Options API registration, module scripts, template expressions, aliases, macros, hydration, and runtime rendering remain nonclaims.

v0.503.0 promotes Shell to bounded same-file relation evidence. The bundled mvdan.cc/sh v3.13.1 WASM now uses ABI 2, and fixed Git, nvm, Kubernetes, asdf, RVM, and SDKMAN corpora verify 300 parser-proven direct function calls plus 150 negatives. An exact `calls` edge requires a literal command inside a direct top-level function body, one unique direct top-level target in the same file, stable UTF-8 byte ranges, and parser provenance. Duplicate targets, nested functions, command/process substitutions, `eval`, `source`/`.`, alias/unalias/unset, dynamic commands, and external dispatch remain nonclaims.

v0.507.0 promotes Fortran to bounded project relation evidence. Fixed Reference LAPACK v3.12.1 source and fparser 0.2.4 verify 300 project subroutine calls across BLAS, CBLAS, SRC, and TESTING, all 1,227 endpoint-admitted breadth candidates, and 150 negatives. Exact `calls` require lowercase non-preprocessed source, one unique project subroutine target, matching fixed arity, and no dummy, EXTERNAL, PROCEDURE, USE, interface shadow, or Optional target. Fixed-form continuations and standard generic `END` are now admitted safely; type-bound calls, function invocation, macro configuration, and runtime dispatch remain nonclaims.

v0.508.0 promotes Ada to bounded project relation evidence. Fixed GNAT-FSF 16.1.0-1 and the AdaCore Ada Language Server 2026.3.202607051 corpus (1,757 Ada sources) provide GNAT `.ali` cross-reference truth for 300 unique top-level procedure calls and 150 negatives. Exact `calls` require an explicit `with`, an untainted unqualified procedure call, a simple fixed arity, and one unique project target; optional/default profiles, nested or qualified calls, use-clause visibility, duplicates, package members, generics, separate bodies, and runtime dispatch remain nonclaims. The large corpus reports 342 procedure facts, four call candidates, and zero safely projectable relations separately; the synthetic quota is not presented as complete Ada support.

v0.506.0 promotes VB.NET to bounded same-file relation evidence. Fixed Roslyn Visual Studio 2022 17.14.34 source and Microsoft.Net.Compilers.Toolset 5.9.0 verify 300 private fixed-arity calls across six VB subsystems, 934 endpoint-admitted breadth candidates, and 150 negatives. Exact `calls` require a non-Partial same-file Class or Module, one unique `Private` target, single-line caller and target signatures, matching arity, and no parameter/local shadow, lambda, XML, or Shared-to-instance dispatch. Overloads, Optional or ParamArray parameters, late binding, qualified or member calls, and cross-file partial types remain nonclaims.

v0.505.0 promotes Solidity to bounded same-file relation evidence. Fixed OpenZeppelin Contracts v5.7.0, PRBMath v4.2.0, and forge-std v1.16.2 corpora use the solc 0.8.31 AST to verify 300 same-contract private fixed-arity calls, all 328 compiler-confirmed breadth candidates, and 150 negatives. Exact `calls` require a bare identifier targeting one unique `private` function in the same contract, matching arity, and no lexical shadow, function-typed value, or caller inline assembly. Internal, public, or external targets, overloads, qualified or member calls, libraries, package resolution, and runtime dispatch remain nonclaims.

v0.504.0 promotes Lua to bounded same-file relation evidence. Fixed LuaRocks 3.13.0, Kong 3.9.3, and Lua 5.5.1 corpora verify 300 tree-sitter-proven direct calls plus 150 negatives. An exact `calls` edge requires a bare identifier inside a direct-root function body, one unique earlier or self-recursive local-function target in the same file, no parameter/local/assignment shadow, and stable UTF-8 byte ranges. Global, dotted, and colon dispatch, nested functions, `debug`, dynamic loading, `require` module resolution, metatables, and runtime dispatch remain nonclaims.

Java depth includes explicit imports, annotations, generic direct heritage/object creation, parser-recovery callable signatures/bare calls/parameter/final-field receivers, and evidence from `build.gradle(.kts)` or module-named Gradle build scripts; duplicate qualified types, wildcard or static imports, lambda-contained construction, array/wildcard signatures, mutation/escape, shadowing, anonymous interfaces, and external classpaths remain conservatively omitted.

v0.448.0 skips every directory whose name starts with `.`, in addition to the existing cache and generated-directory defaults. Hidden directories such as `.github`, `.devcontainer`, `.storybook`, and `.codex-tmp` are therefore not indexed automatically. Explicit scopes can opt into default-excluded paths, while hard exclusions remain non-overridable. Root and nested `.gitignore` files under non-hidden directories retain Git parent re-inclusion semantics. If a non-excluded path returns `EACCES` or `EPERM`, index and sync do not publish a partial generation; the previous generation is retained and reported as stale.

v0.442.0 accelerates watcher reconciliation by checking exact pending paths that already belong to the active index first. Once staleness is proven, the same generation-bound observation is reused for one full scan and one atomic generation publication. New files, renames, directories, configuration or ignore changes, unknown events, truncated batches, and generation switches still use complete verification.

v0.443.0 makes Agent guidance aware of restricted environments. A global npm CLI that appears missing behind a sandbox access boundary is no longer treated as proof that SymbolLattice is uninstalled. When MCP is unavailable, an Agent may retry only the same already-authorized command and project scope once through sandbox escalation; it must not substitute an unauthorized write-capable command. If escalation is unavailable, denied, or still fails, the Agent reports the boundary before using a targeted fallback.

v0.444.0 fixes cache traversal in workspace projects. The workspace resolver no longer performs a separate recursive filesystem walk; it consumes only `package.json` candidates already filtered by the shared scoped walker, including default exclusions, explicit scopes, and nested `.gitignore` rules. Excluded caches such as nested `backend/.pytest_cache` are therefore never read and cannot block initial indexing with `EPERM`, while valid workspace manifests and explicit override semantics remain intact.

v0.445.0 adds a default project-local operation journal. `init`, `index`, `sync`, and actual watcher reconciliations retain the latest 256 bounded, sanitized stage and generation receipts in `.SymbolLattice/operation-diagnostics.sqlite`, so an initial scan failure remains inspectable with `SymbolLattice diagnostics . --json`. Standalone `status`, explore, and other read tools never create or update diagnostics, and journal failures never replace the original operation result.

v0.446.0 adds a strict freshness gate to every live graph read. MCP verifies project source, configuration, ignore rules, and indexer policy before and after each query; a stale project is atomically synchronized under a writer lease, and a result invalidated during execution is discarded and retried once. CLI and `--no-auto-sync` remain read-only and return `FRESH_INDEX_REQUIRED` instead of stale evidence; continuous changes return `PROJECT_NOT_STABLE`. Status, diagnostics, history, and diff remain available as read-only operations.

v0.447.0 fixes a whole-file Perl false negative where `<<` inside a bare match expression was mistaken for a heredoc opener. Proven expression-start contexts such as assignment, return, arguments, and lists now preserve the complete regex, while ordinary division, unterminated regexes, and real heredocs continue to fail closed.

v0.448.0 adds all hidden directories to the default discovery exclusions and shares one centralized policy across the scoped walker, Cargo workspace glob discovery, and Xcode project discovery. This prevents restricted sandbox or test temporary directories from blocking indexing; a future allowlist or narrower policy can be implemented at that single policy boundary.

v0.450.0 fixes large mixed-project reliability. Repeated CSS selector occurrences now retain unique, stable semantic symbol identities, while streaming freshness and initial scans share the same UTF-8 BOM decoding and hash contract so valid scoped indexes are not falsely marked stale.

v0.451.0 validates cross-file relations across six fixed large TypeScript projects. The conservative Tier-A contract covers unique direct relative imports and re-exports, same-file direct and untainted member calls, instantiation, heritage, signatures, and explicit overrides; all 102,537 admitted candidates resolve exactly, and 150 dynamic, ambiguous, mutated, type-space, shadowing, external, and malformed negatives fail closed. Heritage identifiers shadowed by type parameters are conservatively omitted instead of being linked to same-named top-level declarations. This does not claim complete support for package exports, project references, overloads, or runtime dispatch.

v0.452.0 adds large-repository TypeScript capacity telemetry and conservative extraction guards. A full-root Next.js index published a generation within the 30-minute budget; large `src/compiled` JavaScript bundles and the VS Code colorizer performance fixture retain file identity only so vendored or benchmark data is not treated as trustworthy cross-file semantics. VS Code full-root still exceeded the provisional 30-minute/4 GiB ceiling, so this release publishes the capacity boundary and unsupported breadth instead of claiming that every large repository completes within the same budget.

v0.453.0 begins deeper TypeScript monorepo resolution. A source file now uses its nearest unique package-local `tsconfig.json` or `jsconfig.json` boundary for `paths` and `baseUrl`, with the full config and local `extends` chain retained as evidence. Nested aliases do not leak into sibling packages, while specifiers not claimed by TypeScript configuration can still fall through to the existing workspace package resolver. Project references, conditional package exports, overloads, and runtime dispatch remain future work or nonclaims.

v0.454.0 deepens Java project relations. When valid modern Java is rejected by the legacy parser because another part of the file uses syntax such as a switch expression, a clean modern parse may now recover only method and constructor visibility, static/final modifiers, and arity metadata; it does not recover body relations or guess parameter types. Explicitly imported type-name static calls, source-proven field and parameter receivers, and compile-time-bound static, final, or private bare calls from instance bodies can produce a unique exact edge. Same-named locals or fields, inherited fields, overloads, ordinary virtual inherited dispatch, external classpaths, and targets that cannot be proven unique remain fail-closed. The fixed Netty, Quarkus core, and Hibernate ORM truth improved from 200 TP / 100 FN to 210 TP / 90 FN with 0 FP, 0 evidence-invalid cases, and all 150 negatives passing.

v0.455.0 deepens TypeScript project-configuration evidence. The boolean `stableTypeOrdering` option may be admitted by the bundled TypeScript 5.9.3 parser only after an isolated TypeScript 6.0.3 oracle proved that it does not affect module resolution or program structure; original configuration hashes remain intact, and other unknown or mistyped options still fail. Project references are accepted only when they are project-local, tracked, unique, and acyclic, with the complete configuration evidence attached to unresolved workspace fallback. Workspace package exports produce exact targets only for literal roots and exact subpaths; conditional objects, arrays, and wildcards remain nonclaims. Across six fixed large TypeScript corpora, all 102,537 admitted relation candidates, 300 fixed positives, and 150 negatives pass with 0 FP, FN, or evidence-invalid cases. Parse-rejected files, package conditions, wildcards, overloads, and runtime dispatch are not claimed as complete support.

v0.456.0 deepens TypeScript namespace member calls. A static property call through `import * as ns` produces the existing `calls` exact edge only when the module target is unique, the exported member is a unique callable value-space symbol, and shadowing, mutation, computed, optional, or ambiguity evidence is absent. The same proof can cross one deterministic explicit re-export path. Type-only namespaces, dynamic or ambiguous namespace calls remain unresolved; no GraphEdge kind or runtime-dispatch guess was added.

v0.457.0 deepens bounded Go project relations. Four fixed large, clean checkouts (Kubernetes, Prometheus, etcd, and Hugo) verify 300 positive candidates with exact evidence, while 150 disposable negatives protect fail-closed behavior for dynamic or computed calls, receiver mutation or escape, shadowing, interface dispatch, build constraints, nested modules, replaced modules, and malformed source. Existing exact edges are now available for unique package-local functions, unique concrete-receiver methods, unique struct construction, and root-`go.mod` local imports whose path is not covered by a replacement. Parser-recovery files, test or ignored files, conditional files, embedding or interface dispatch, reflection, cgo, and runtime dispatch remain unresolved. Unsupported breadth and parser-rejected files are reported separately in the Graph-root benchmark; the admitted subset is not presented as complete Go-language support.

v0.458.0 deepens bounded Rust crate relations. Four fixed large Rust source scopes (Tokio, Rust core, alloc, and std), plus one clean crate contract fixture, verify module/use/trait/impl identity, unique inherent methods and associated functions, struct/enum construction, and the existing `implements` edge. All 300 admitted positives and 150 disposable negatives pass. Trait-object dispatch, dereference or embedding ambiguity, cfg, complex generics, macro/proc-macro expansion, build scripts, FFI, generated code, and runtime dispatch remain unresolved or nonclaims; parser-rejected files and unsupported breadth are reported separately rather than presented as complete Rust compiler semantics.

v0.476.0 deepens bounded Objective-C project relations. Exact edges are limited to literal local `#import`/`#include`, unique class/protocol heritage, source-proven object signatures, explicit class messages, and `[[Type alloc] init]`; `self`/`super`/variable receivers, categories, conditional compilation, framework/module-map resolution, macros, swizzling, forwarding, runtime dispatch, and ambiguous headers remain unresolved or nonclaims. This is source-only depth evidence, not complete Clang/Xcode semantics.

v0.477.0 deepens bounded Ruby project relations. Exact edges are limited to literal `require_relative`, unique class superclasses, and explicit constant-receiver singleton method calls; bare/implicit calls, reopen, constant reassignment, include/extend/prepend, `send`/reflection, Rails autoload, DSLs, and metaprogramming remain unresolved or nonclaims. This is source-only relation depth, not complete Ruby runtime dispatch.

v0.478.0 deepens bounded PostgreSQL DDL schema relations. Exact edges are limited to complete, parsed `CREATE TABLE` literal foreign-key `REFERENCES` and `INHERITS` targets; views, routines, search_path, psql variables, COPY payloads, dynamic SQL, external databases, and ambiguous unqualified names remain unresolved or nonclaims.

v0.481.0 deepens bounded same-file R direct calls. An existing `calls` exact edge is emitted only for a unique top-level function in the same `.R` file with an explicit identifier call and no parameter, reassignment, loading, closure, or S3/S4 dispatch taint; `source`, `library`, `get`, `do.call`, namespace/member dispatch, duplicate bindings, cross-file package resolution, and evaluation remain unresolved or nonclaims. This is not complete R interpreter or S3/S4 runtime support.

v0.482.0 deepens bounded Markdown reference-style links. An existing `references` exact edge is emitted only for a unique reference definition, a parseable local project-relative file destination, and an indexed target file; duplicate, external, opaque, malformed, or unsafe definitions, shortcut links, heading-fragment symbols, MDX execution, and generated-site routing remain unresolved or nonclaims.

v0.483.0 deepens bounded cross-file Protocol Buffers RPC references. Existing `imports`/`references` exact edges are limited to literal local imports, one tracked target file, and unqualified, unique RPC request/response messages; package-qualified types, nested declarations, duplicate message names, compiler plugins, generated code, gRPC runtime behavior, and external well-known types remain unresolved or nonclaims.

v0.484.0 deepens bounded cross-file GraphQL schema heritage. An existing `extends` exact edge is emitted only for one unique top-level type/interface and one unique directly implemented interface; schema stitching, federation, multiple implements, extensions, directives, resolver linkage, query execution, and generated schemas remain unresolved or nonclaims.

v0.486.0 deepens Java modern-parser heritage recovery. When the legacy Java parser loses a heritage header during modern-syntax recovery, a clean modern parser retains only top-level direct superclass/interface facts; existing unique project-local target and module evidence then gate exact `extends`/`implements` edges. Nested types, ambiguous imports, external classpaths, runtime dispatch, and unresolved modern syntax remain nonclaims.

v0.487.0 deepens Java modern-parser object-creation recovery. For direct `new Type(...)` expressions that remain provable in a clean modern parse after legacy recovery noise, only the enclosing top-level method, outer type, and traceable source range are retained; existing project-local target/package/import evidence gates exact `instantiates` edges. Lambda/anonymous nested bodies, ambiguous targets, generic dispatch, and runtime semantics remain nonclaims.

v0.488.0 deepens Java modern-parser callable signature recovery. When the legacy parser fails closed on modern syntax elsewhere in a file, a clean modern parse recovers only direct imported or qualified parameter/return types for methods and constructors; same-package exact edges require a recovered package and one unique project-local type. Type variables, arrays, wildcards, ambiguous imports, nested types, external classpaths, and runtime/overload dispatch remain nonclaims. The fixed Netty, Quarkus core, and Hibernate ORM relation selection is 236 TP / 64 FN with 0 FP, 0 evidence-invalid cases, and all 150 negatives passing.

v0.489.0 deepens Java modern-parser bare call recovery. When the legacy parser fails closed on modern syntax elsewhere in a file, a clean modern parse recovers only outer method/constructor-body bare implicit-static and implicit-instance calls; the existing resolver emits `calls` exact edges only with same-owner private/static/final access, unique arity, and dispatch proof. Lambda/nested callables, explicit receivers, inherited virtual dispatch, overload type ambiguity, mutation/escape, and external classpaths remain nonclaims. The fixed three-corpus relation selection is 241 TP / 59 FN with 0 FP, 0 evidence-invalid cases, and all 150 negatives passing; six call truth rows were recovered.

v0.490.0 deepens Java modern-parser parameter receiver recovery. For a clean modern parse, a direct declared reference-type `param.method(...)` produces a `calls` exact edge only when the parameter has no reassignment, escape, or lambda-capture taint and the existing resolver proves one unique method target. Field receivers, chained/computed receivers, array/wildcard types, inherited virtual dispatch, and overload type inference remain nonclaims. The fixed three-corpus relation selection is 242 TP / 58 FN with 0 FP, 0 evidence-invalid cases, and all 150 negatives passing; this adds one incremental TP over v0.489.

v0.491.0 deepens Java modern-parser field receiver recovery. For a clean modern parse, a direct declared `final` reference-type `field.method(...)` produces a `calls` exact edge only when mutation, escape, and shadowing are not proven and the existing resolver proves one unique direct callable target. Non-final fields, chained/computed receivers, array/wildcard/type-variable fields, inherited virtual dispatch, overload type inference, and external classpaths remain nonclaims; the bounded three-corpus benchmark and 150-negative result are reported separately from complete Java compiler support.

v0.492.0 deepens Java modern-parser local initializer receiver recovery. For a clean modern parse, a block-local direct `Type value = new Type(...)` or `var value = new Type(...)` produces a `calls` exact edge only when its lexical binding scope is unique, reassignment/mutation/escape/shadowing are not proven, and the existing resolver proves one unique direct callable target. Factory/conditional/chained initializers, overload type inference, inherited dispatch, and external classpaths remain nonclaims; the bounded three-corpus benchmark and 150-negative result are reported separately.

v0.494.0 extends Java modern-parser local initializer receivers. For a clean modern parse, direct `DeclaredType value = new ConcreteType(...)` is retained only when both types are single non-generic identifiers and the resolver proves assignability with one tracked exact `extends`/`implements` edge before emitting `calls`. Unresolved external types, indirect heritage, generic/wildcard/array/anonymous/ambiguous initializers remain unresolved. The v0.493 generic raw-type support is unchanged; the bounded three-corpus benchmark and 150-negative result are reported separately.

v0.459.0 deepens bounded Kotlin/JVM relations. Three fixed large source scopes (Kotlin compiler, Ktor, and kotlinx.coroutines), plus one clean synthetic project, verify class/object/interface/enum/typealias identity, explicit imports, unique direct/member/extension calls, constructor instantiation, heritage, and explicit overrides. All 300 admitted positives and 150 disposable negatives pass. Overloads, default parameters, extension ambiguity, generic/reified types, delegation, sealed/interface dispatch, compiler plugins, coroutine runtime, generated/reflection behavior, Java interop, and external dependency linkage remain unresolved or nonclaims; unsupported breadth and parser-rejected files are reported separately rather than presented as complete Kotlin compiler support.

v0.460.0 deepens bounded Swift project relations. Three fixed, clean, auditable checkouts (Swift stdlib core/Concurrency, SwiftNIO, and Swift Collections), plus a synthetic oracle, cover class/struct/enum/protocol/actor/typealias identity, explicit imports, unique direct/member/extension calls, explicit initializer instantiation, heritage/conformance, signature accepts/returns, and explicit overrides. All 300 admitted synthetic positives and 150 disposable negatives pass, and every exact edge carries singleton-target evidence. Protocol witness/dynamic dispatch, generic/associatedtype resolution, property wrappers/macros/result builders, async actor runtime, Objective-C/SDK linkage, generated/reflection/conditional-compilation behavior, and external modules remain unresolved or nonclaims. Parser-rejected files and unsupported breadth recall are reported separately; this Windows host has no Swift/Xcode toolchain, so complete Swift compiler semantics are not claimed.

v0.461.0 deepens bounded Dart/Flutter project relations. Three fixed large source scopes (Dart SDK 3.9.4, Flutter 3.35.2, and a pinned flutter/packages commit) cover class/mixin/enum/extension/typedef identity, literal imports/exports, unique direct/typed-member/extension calls, constructor instantiation, extends/with/implements, signature accepts/returns, and explicit `@override`. All 300 synthetic positives and 150 disposable negatives pass. dynamic/noSuchMethod, generic/tear-off behavior, mixin runtime dispatch, late/mutation/escape, async/isolate execution, build_runner/generated/reflection behavior, conditional imports, Flutter platform channels, and external packages remain unresolved or nonclaims. Parser-rejected files and unsupported breadth recall are reported separately; this Windows host has no Dart/Flutter toolchain, so complete analyzer or Flutter semantics are not claimed.

v0.462.0 deepens bounded C#/.NET project relations. Three fixed, clean v9.0.10 source scopes (dotnet/runtime, ASP.NET Core, and EF Core) now cover namespace, class/record/struct/interface/enum/delegate identity, explicit `using`, unique project-local direct/member/constructor calls, extends/implements, signature accepts/returns, and explicit `override`. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. overload/generic/LINQ runtime behavior, dynamic/reflection, extension ambiguity, nullable flow, delegate/event dispatch, partial/source-generator/generated/conditional code, async runtime, NuGet/external assemblies, and project references remain unresolved or nonclaims; parser-rejected files and unsupported breadth recall are reported separately for the three large corpora. This Windows run has no dotnet or Roslyn compiler validation, so complete C# compiler semantics are not claimed.

v0.463.0 deepens bounded F# project relations. Three fixed, clean source scopes (dotnet/fsharp v15.2.400, Fable 5.9.0, and FAKE 6.1.4) now cover module/namespace, class/record/struct/union/interface/enum/delegate/type-alias identity, explicit `open`, unique project-local direct/pipeline/member/constructor calls, extends/implements, signature accepts/returns, and explicit `override`. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Type inference, pipeline/composition ambiguity, pattern-matching runtime behavior, generic/inline constraints, active patterns, computation expressions, async/task runtime, reflection/quotation, type providers, generated/conditional code, NuGet/external assemblies, and project references remain unresolved or nonclaims; parser-rejected files and unsupported breadth recall are reported separately. This Windows host has no usable .NET SDK/F# compiler validation, so complete F# compiler semantics are not claimed.

v0.464.0 deepens bounded OCaml project relations. Three fixed, clean source scopes (OCaml 5.5.0, Dune 3.9.3, and Jane Street Core v0.17.2) now cover module/class/record/variant/object/signature/type-alias identity, explicit `open`, unique project-local direct/module/typed-member calls, class construction, extends/implements, signature accepts/returns, and explicit `method!` overrides. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Type inference, higher-order/partial application, functors/module-signature strengthening, polymorphic variants/GADTs, object subtyping, pattern-matching runtime behavior, PPX/generated code, async/reflection, opam/Dune dependency resolution, external packages, conditional compilation, and ambiguous opens remain unresolved or nonclaims; parser-rejected files and unsupported breadth recall are reported separately. This Windows host has no OCaml or Merlin toolchain validation, so complete OCaml compiler semantics are not claimed.

v0.465.0 deepens bounded Haskell project relations. Three fixed, clean source scopes (GHC 9.14.1, Cabal 3.18.1.0, and Pandoc 3.9) now cover module, data/newtype/record/variant/type-alias, class/instance identity, explicit imports, unique project-local direct/qualified-module calls, constructor creation, typeclass `implements`, and simple signature accepts/returns. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Type inference, overloading/dictionary passing, higher-order/partial application, lazy runtime behavior, pattern dispatch, GADTs/existentials/type families, Template Haskell/quasiquotation/CPP, FFI, package resolution, external modules, reflection, ambiguous exports, and dynamic dispatch remain unresolved or nonclaims; parser-rejected files and unsupported breadth recall are reported separately. This Windows host has no GHC, Cabal, Stack, or HLS toolchain validation, so complete Haskell compiler semantics are not claimed.

v0.466.0 deepens bounded Scala project relations. Three fixed, clean source scopes (Scala 3.9.0, Scala 2.13.18, and sbt 1.12.15) now cover package/object/class/case-class/trait/enum/type-alias identity, explicit imports, unique project-local direct/object/typed-member calls, constructor and case-class creation, single inheritance/trait implementation, simple signature accepts/returns, and explicit `override`. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Overloads/defaults/givens/implicits, extensions, higher-order/partial application, generics/type members, path-dependent/opaque/match types, inline/quoted/macros/TASTy, pattern/async/Akka runtime, reflection, Java linkage, sbt/generated code, conditional compilation, ambiguous imports, and external dependencies remain unresolved or nonclaims; parser-rejected files and unsupported breadth recall are reported separately. This Windows host has no Scala, scalac, sbt, or Java toolchain validation, so complete Scala compiler semantics are not claimed.

v0.467.0 deepens bounded Elixir project relations. Four fixed, clean source scopes (Elixir v1.20.4, Phoenix v1.8.13, Ecto v3.14.2, and Livebook v0.19.9) now cover module/protocol/struct/exception/type/behaviour identity, explicit aliases/imports, unique project-local direct/qualified-module calls, struct creation, behaviour/protocol implementation, and simple `@spec` accepts/returns. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Macros/quote/unquote/sigils, pattern/guard/multi-clause dispatch, protocol consolidation, OTP/GenServer/process runtime, NIF/FFI/Erlang interop, Mix/Hex/umbrella/external packages, conditional compilation, reopened modules, ambiguous aliases, and dynamic dispatch remain unresolved or nonclaims. Parser-rejected files and unsupported breadth recall are reported separately; this Windows host has no Elixir, Erlang, or OTP toolchain, so complete Elixir compiler semantics are not claimed.

v0.471.0 deepens bounded Nim project relations. Four fixed production source scopes (Nim compiler 2.2.8, Nimble 0.24.1, Jester 0.6.0, and Karax 1.5.0) now cover typed `proc`/`func`, literal imports, unique project-local direct/qualified calls, object/enum/distinct identity, constructor instantiation, and one object heritage edge. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Templates/macros/iterators/converters, generics/UFCS/overloads, multi-line control flow, concepts/mixins, async/spawn, FFI/reflection, Nimble dependency/generated/conditional code, and runtime dispatch remain unresolved or nonclaims; parser-rejected files and unsupported breadth recall are reported separately, and this Windows host has no Nim compiler/Nimble toolchain, so complete Nim semantics are not claimed.

v0.472.0 deepens bounded Zig project relations. Four fixed production `.zig` scopes (Zig 0.15.2, Ghostty v1.3.1, ZLS 0.16.0, and a pinned TigerBeetle main commit) now cover literal `@import`, struct/enum/union/opaque identity, fixed-arity typed functions, unique same-file/qualified calls, `Type{}` construction, and signature accepts/returns. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Comptime, usingnamespace, generic/anytype forms, method or namespace dispatch, async/thread behavior, FFI/reflection, build/package dependencies, generated/conditional code, and runtime dispatch remain unresolved or nonclaims; parser-rejected files and unsupported breadth recall are reported separately, and this Windows host has no Zig compiler or ZLS toolchain, so complete Zig semantics are not claimed.

v0.473.0 deepens bounded C++ project relations. Four fixed production C++ scopes (LLVM 21.1.1, OpenCV 4.12.0, nlohmann/json 3.12.0, and Catch2 v3.11.0) now cover literal local includes, struct/class identity, fixed-arity callable signatures, unique same-file/include-visible direct calls, `this->member` calls, `new Type()` construction, and signature accepts/returns. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Templates/macros/SFINAE/concepts, overloads/ADL/using directives, virtual dispatch, lambdas/coroutines, FFI, CMake/ABI/dependency resolution, generated/conditional code, and malformed parser recovery remain unresolved or nonclaims; parser-rejected files and unsupported breadth recall are reported separately, and this Windows host has no validated C++ compiler, linker, or CMake target graph, so complete C++ semantics are not claimed.

v0.474.0 deepens bounded C project relations. Four fixed production C scopes (curl 8.15.0, Git 2.51.0, libuv 1.51.0, and SQLite 3.50.0) now cover source-proven `.h` discovery, literal local includes, struct/union/enum/typedef identity, unique same-file or included-header direct function calls, and tagged function signature accepts/returns. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Macros/conditionals, conflicting prototypes, function-pointer or indirect calls, variadic dispatch, ABI/compiler/CMake dependencies, generated code, external includes, and malformed parser recovery remain unresolved or nonclaims. Parser-admitted breadth for the four corpora is reported separately; this Windows host has no validated C compiler or build-target graph, so complete C semantics are not claimed.

v0.475.0 deepens bounded PHP project relations. Four fixed production PHP scopes (Laravel framework 12.0.0, Symfony 7.3.0, Composer 2.8.10, and PHPUnit 12.2.0) now cover namespace/`use` imports, class heritage, unique direct functions and static method calls, class instantiation, and typed signature accepts/returns. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Autoloading/Composer dependencies, traits/magic methods, closures/anonymous classes, dynamic calls, overload/attribute runtime behavior, reflection, generated code, external packages, and malformed parser recovery remain unresolved or nonclaims. Parser-admitted breadth for the four corpora is reported separately; this Windows host has no validated PHP compiler or Composer runtime, so complete PHP semantics are not claimed.

v0.470.0 deepens bounded Nix project relations. Existing attrset/let/inherit/literal `import` scanning is retained, and the product now records function attributes, unique local calls for single-identifier lambdas, and a unique `binding = import ./file.nix` followed by `binding.attr` project-local call. Every exact edge carries singleton evidence. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. `with`/`rec`/dynamic attributes, derivations/`mkDerivation`/`callPackage`, flake inputs, fetchers/fixed points, overrides/merges, evaluator semantics, dependency/overlay/external package resolution, and generated/conditional code remain unresolved or nonclaims; parser-rejected files and unsupported breadth recall are reported separately, and this Windows host has no Nix evaluator/toolchain, so complete Nix semantics are not claimed.

v0.469.0 deepens bounded Clojure project relations. Four fixed production source scopes (Clojure 1.12.5, Ring 1.10.0, Reitit 0.9.2, and tools.reader 1.6.0) now cover namespace/record/protocol identity, explicit `ns :require` aliases and `:refer` bindings, unique project-local local/referred/qualified calls, `->Type`/`map->Type` record construction, record-to-protocol `implements`, and simple `^Type` accepts/returns. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Macro expansion, reader conditionals/discards, metadata, dynamic vars/rebinding, `eval`/`apply`/`resolve`, higher-order/destructuring/threading forms, protocol/multimethod runtime dispatch, Java interop/reflection, Leiningen/deps.edn dependency resolution, generated code, and external namespaces remain unresolved or nonclaims. Parser-rejected files and unsupported breadth recall are reported separately; this Windows host has no Clojure/JVM/Leiningen/Babashka toolchain, so complete Clojure compiler semantics are not claimed.

v0.468.0 deepens bounded Erlang project relations. Four fixed, clean source scopes (Erlang/OTP OTP-29.0.4, RabbitMQ v4.3.1, rebar3 3.27.0, and Cowboy 2.18.0) now cover module/export/export_type/record/type/behaviour/callback identity, explicit `-import`/`-include` facts, unique project-local local/qualified function calls, record construction, behaviour implementation, and simple `-spec` accepts/returns. The 300 synthetic positives score TP300/FP0/FN0/evidenceInvalid0, and all 150 disposable negatives fail closed. Guards/pattern/multi-clause dispatch, macros/parse transforms, OTP/GenServer/message/process runtime, NIF/port/FFI, rebar3/Hex dependencies, generated/conditional code, reflection, ambiguous imports, dynamic `apply`, and hot code loading remain unresolved or nonclaims. Parser-rejected files and unsupported breadth recall are reported separately; this Windows host has no Erlang, OTP, or rebar3 toolchain, so complete Erlang compiler semantics are not claimed.

v0.449.0 adds basic `.md` and `.markdown` graphs. ATX and Setext headings become searchable resources with hierarchical `contains` edges, while complete project-local relative file links become exact `references` only when they uniquely match an indexed file. Fenced, indented, and inline code, HTML blocks, external, root-relative, reference-style, image, dynamic, and heading-anchor links, plus `.mdx`, remain opaque, unresolved, or nonclaims rather than guessed runtime documentation behavior.

## Install the CLI

Requires Git, Node.js `>=22.13 <25`, npm, and Windows PowerShell 5.1 or PowerShell 7.

SymbolLattice is not published to the npm Registry. Install from a full 40-character commit in the official GitHub repository, or from an available version tag. Floating refs such as `main` and `HEAD` are rejected.

```powershell
$ref = "<FULL_40_CHARACTER_COMMIT_OR_VX.Y.Z>"
$bootstrap = Join-Path ([IO.Path]::GetTempPath()) ("SymbolLattice-bootstrap-" + [guid]::NewGuid().ToString("N"))

try {
    git clone --filter=blob:none --no-checkout https://github.com/HsinPu/SymbolLattice.git $bootstrap
    git -C $bootstrap fetch --depth 1 origin $ref
    git -C $bootstrap checkout --detach FETCH_HEAD

    # Preview only; this does not install or modify Codex
    & (Join-Path $bootstrap "install.ps1") -Ref $ref

    # Install into the current user's npm global prefix after review
    & (Join-Path $bootstrap "install.ps1") -Ref $ref -Apply -Yes
}
finally {
    if (Test-Path -LiteralPath $bootstrap) {
        Remove-Item -LiteralPath $bootstrap -Recurse -Force
    }
}
```

The source installer verifies the fixed source, lockfile, type check, build, npm package, isolated CLI, and MCP before performing a rollback-protected global installation. It does not edit Codex configuration or create a project index.

## Quick start

Explicitly create an index in the repository you want to query:

```powershell
cd C:\path\to\project
SymbolLattice init .

SymbolLattice status .
SymbolLattice find createOrder --project . --json
SymbolLattice explore "Trace createOrder to persistence" --project . --json
```

Explicitly synchronize after files change:

```powershell
SymbolLattice sync .
```

## Install for Codex

Codex setup is preview-only by default:

```powershell
SymbolLattice install codex
SymbolLattice install codex --apply --yes
SymbolLattice doctor codex
```

`install codex` dynamically writes the absolute paths of the current Node executable and this installation's `dist/cli/main.js`. It does not depend on PATH or hard-code a user name, drive, or npm prefix; run it again after reinstalling or moving the package.

It manages only `mcp_servers.SymbolLattice` in global `~/.codex/config.toml` and the section bounded by `SYMBOL_LATTICE_START` / `SYMBOL_LATTICE_END` in global `~/.codex/AGENTS.md`. Existing files are backed up before writing. Setup itself does not immediately create or delete a project index. After setup, when an agent recognizes a software repository and the task requires understanding or changing code, the guidance tells it to run `SymbolLattice init .` automatically from the repository root if the index is missing. A monorepo governed by one outer `.git` is initialized once at that root; a workspace containing independent repositories is never initialized at the container root, and each relevant repository is initialized separately. Filesystem roots, home directories, Desktop roots, temporary directories, and dependency directories are never initialized automatically.

Restart Codex or open a new task after setup. Removal is also preview-first:

```powershell
SymbolLattice uninstall codex
SymbolLattice uninstall codex --apply --yes
```

## Common commands

| Command | Purpose |
| --- | --- |
| `init` / `sync` | Build or explicitly refresh a code graph. |
| `diagnostics` | Read operation and auto-sync journals with optional operation/outcome filters. |
| `status` / `history` / `diff` | Inspect freshness and generation changes. |
| `files` / `file` | List or read persisted source. |
| `find` / `node` / `search` | Find and inspect symbols or source. |
| `callers` / `callees` / `hierarchy` | Query static relationships. |
| `routes` / `entrypoints` | Inspect framework entry points. |
| `impact` / `affected` / `git-hunks` | Assess change impact. |
| `context` / `explore` / `investigate` | Retrieve source-backed agent context. |
| `explain-edge` | Inspect the complete evidence for one edge. |
| `serve --mcp` | Start the MCP stdio server. |

Run `SymbolLattice <command> --help` for complete options.

## MCP and synchronization

```powershell
SymbolLattice serve --mcp --project C:\path\to\project

# Disable background index updates
SymbolLattice serve --mcp --project C:\path\to\project --no-auto-sync
```

MCP exposes only the primary `SymbolLattice_explore` tool by default so agents have one clear choice. It returns concise Markdown with line-numbered source instead of full diagnostic JSON; the CLI `explore --json` contract remains available for machines. v0.442.0 retains bounded SQLite subgraph reads, request-scoped adjacency, resilient filesystem discovery, and atomic generation publication while accelerating watcher reconciliation. Every specialist tool remains available: set `SYMBOL_LATTICE_MCP_TOOLS=node,impact` to add selected tools, or `all` to restore the complete surface. MCP query handlers do not directly execute `init`. When the MCP host's startup directory has no index, it still registers its tools but does not start a watcher for that directory; callers should pass the actual repository's `projectPath`. MCP initialize instructions and the Codex-managed guidance tell shell-capable agents to invoke the CLI automatically when the safety conditions are met and the index is missing. For a whole-workspace query, the agent passes each relevant repository's `projectPath` separately and combines the results; SymbolLattice does not present independent indexes as one graph with cross-repository edges. Index writes, manual synchronization, and watcher lifecycle remain CLI-controlled operations.

## Limits

SymbolLattice is a static code-graph and code-intelligence tool. It is not a complete compiler, type checker, runtime tracer, RDF ontology, or general reasoning engine. Dynamic dispatch, reflection, macros, code generation, dependency injection, metaprogramming, and external package types may remain unresolved or pending, or be omitted.

## Upgrading from v0.420.0 or earlier

Legacy names and indexes are not migrated or deleted automatically. Keep rollback copies, then use this order:

```powershell
symbol-lattice uninstall codex --apply --yes
npm uninstall -g @hsinpu/symbol-lattice

# Install the new CLI with the fixed-ref GitHub flow above
SymbolLattice install codex --apply --yes
cd C:\path\to\project
SymbolLattice init .
```

Remove old state only after the new CLI, Codex MCP entry, and `.SymbolLattice` index are verified.

## Development and verification

```bash
git clone https://github.com/HsinPu/SymbolLattice.git
cd SymbolLattice
npm ci
npm run check
npm test
npm run build
npm run verify:mcp-worker-generation
npm pack --dry-run
```

## License

[MIT](LICENSE)
